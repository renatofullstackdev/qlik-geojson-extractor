import { configStorageKey, hostPermissionPattern, parseQlikSenseUrl, safeFilename } from "../lib/qlik-url.js";
import {
  applyBulkAggregation,
  buildDiagnosticReport,
  buildPropertyDefinitions,
  coordinateFieldGroups,
  locationFieldGroups,
  decodeCoordinateSelection,
  encodeCoordinateSelection,
  extractionHealth,
  fieldsMatchingQuery,
  relatedFields
} from "../lib/extraction-config.js";
import { normalizeSavedConfig } from "../lib/config-state.js";
import { confidenceLabel, localizeCoreError, localizeDiagnostic, localizeEvidence } from "../lib/i18n.js";

const ids = [
  "connectionBadge", "detectButton", "pageMessage", "hostAccessBadge", "hostAccessButton", "advancedModeInput",
  "appIdInput", "sheetIdInput", "virtualProxyInput", "probeButton", "inspectButton", "probeOutput",
  "inspectionSection", "layerSelect", "coordinatesInputs", "latitudeInput", "longitudeInput", "locationInputs", "locationInput", "layerDiagnostic", "entityKeySelect", "entityKeyAssessment",
  "propertiesSection", "selectedPropertyCount", "fieldSearchInput", "fieldList", "selectFilteredButton", "selectRelatedButton",
  "clearPropertiesButton", "bulkAggregationSelect", "applyBulkAggregationButton", "bulkWarning",
  "customPropertiesSection", "addCustomPropertyButton", "customPropertyList", "measuresSection", "addMeasureButton", "measureList",
  "optionsSection", "datasetNameInput", "navigationLinksInput", "requireAllCoordinatesInput", "skipNullEntitiesInput",
  "coordinateSourceFieldInput", "coordinateSourceValueInput", "coordinateOverridesInput", "effectiveConfigDetails", "effectiveConfigOutput",
  "saveConfigButton", "loadConfigButton", "clearConfigButton", "extractSection", "readinessPanel", "extractButton", "extractStatus",
  "resultSummary", "missingDetails", "missingOutput", "skippedDetails", "skippedOutput", "previewDetails", "previewOutput",
  "downloadButton", "downloadDiagnosticButton", "toast"
];
const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

let pageContext = null;
let currentHostPattern = null;
let hostAccessGranted = false;
let inspectionReport = null;
let selectedProperties = new Map();
let customProperties = [];
let measures = [];
let currentResult = null;
let currentDiagnosticReport = null;
let toastTimer = null;

const aggregations = [
  ["only", "Somente um valor (Only)"],
  ["concat", "Concatenar distintos"],
  ["max", "Máximo"],
  ["min", "Mínimo"],
  ["maxTimestamp", "Data/hora mais recente"]
];

const SESSION_CONTEXT_KEY = "qlikGeojsonGrantedTabContext";

function pretty(value) { return JSON.stringify(value, null, 2); }
function uiError(message, technicalMessage = null) {
  const error = new Error(message);
  error.userFacing = true;
  error.technicalMessage = technicalMessage;
  return error;
}
function setVisible(element, visible) { if (element) element.classList.toggle("hidden", !visible); }
function setConnectionBadge(state, text) { els.connectionBadge.className = `badge ${state}`; els.connectionBadge.textContent = text; }
function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) { button.dataset.originalLabel = button.textContent; button.textContent = label ?? "Processando..."; button.disabled = true; }
  else { button.textContent = button.dataset.originalLabel || button.textContent; button.disabled = false; }
}
function showToast(message, type = "success") {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast ${type}`;
  toastTimer = setTimeout(() => { els.toast.className = "toast hidden"; }, 5000);
}
function setAdvancedMode(enabled) {
  document.body.classList.toggle("advanced-mode", !!enabled);
  els.advancedModeInput.checked = !!enabled;
}
function friendlyError(error) {
  if (error?.code && error.code !== "HOST_PERMISSION_REQUIRED") return localizeCoreError(error).message;
  if (error?.userFacing) return error.message;
  return permissionHint(error);
}

async function getGrantedTabContext({ retry = true } = {}) {
  const attempts = retry ? 12 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const stored = (await chrome.storage.session.get(SESSION_CONTEXT_KEY))[SESSION_CONTEXT_KEY];
    if (stored?.tabId) return stored;
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Nenhuma guia foi associada à extensão. Abra a sheet Qlik e clique no ícone da extensão na barra do Chrome.");
}

async function getGrantedPageUrl(context) {
  const result = await chrome.scripting.executeScript({ target: { tabId: context.tabId }, func: () => location.href });
  return result?.[0]?.result ?? null;
}

function renderHostAccessState() {
  if (!currentHostPattern) {
    els.hostAccessBadge.className = "badge neutral";
    els.hostAccessBadge.textContent = "host desconhecido";
    els.hostAccessButton.textContent = "Permitir acesso a este site";
    els.hostAccessButton.disabled = true;
    return;
  }
  els.hostAccessButton.disabled = false;
  els.hostAccessBadge.className = `badge ${hostAccessGranted ? "success" : "error"}`;
  els.hostAccessBadge.textContent = hostAccessGranted ? "permitido" : "não permitido";
  els.hostAccessButton.textContent = hostAccessGranted ? "Remover acesso deste site" : "Permitir acesso a este site";
}
async function refreshHostAccessState() {
  hostAccessGranted = currentHostPattern ? await chrome.permissions.contains({ origins: [currentHostPattern] }) : false;
  renderHostAccessState();
  return hostAccessGranted;
}
function requestOrRemoveCurrentHostAccess() {
  if (!currentHostPattern) { showToast("Abra uma sheet Qlik e detecte a página antes de conceder acesso.", "error"); return; }
  const operation = hostAccessGranted
    ? chrome.permissions.remove({ origins: [currentHostPattern] })
    : chrome.permissions.request({ origins: [currentHostPattern] });
  void operation.then(async (changed) => {
    await refreshHostAccessState();
    if (hostAccessGranted) { showToast("Acesso concedido somente ao host Qlik atual."); await detectContext({ quiet: true }); }
    else if (changed) { showToast("Acesso ao host removido."); setConnectionBadge("neutral", "não testado"); }
    else showToast("O Chrome não concedeu acesso ao host Qlik.", "error");
  }).catch((error) => { console.error(error); showToast("Não foi possível alterar a permissão do host.", "error"); });
}

async function detectContext({ quiet = false } = {}) {
  try {
    const granted = await getGrantedTabContext();
    let href = granted.url;
    let parsed = parseQlikSenseUrl(href);
    currentHostPattern = hostPermissionPattern(href);
    await refreshHostAccessState();
    if (hostAccessGranted) {
      const currentHref = await getGrantedPageUrl(granted);
      if (currentHref) {
        href = currentHref;
        parsed = parseQlikSenseUrl(href);
        currentHostPattern = hostPermissionPattern(href);
        await refreshHostAccessState();
        await chrome.storage.session.set({ [SESSION_CONTEXT_KEY]: { ...granted, url: href, capturedAt: Date.now() } });
      }
    }
    pageContext = { ...parsed, tabId: granted.tabId, windowId: granted.windowId, url: href };
    if (parsed.appId) els.appIdInput.value = parsed.appId;
    if (parsed.sheetId) els.sheetIdInput.value = parsed.sheetId;
    els.virtualProxyInput.value = parsed.virtualProxyPath ?? "";
    if (parsed.isQlikSheet) {
      els.pageMessage.textContent = `Qlik detectado em ${parsed.origin}. App, sheet e proxy virtual foram obtidos da URL.${hostAccessGranted ? " Acesso ao host concedido." : " Conceda acesso ao host antes de testar."}`;
      if (!quiet) showToast("App e sheet detectados pela URL atual.");
    } else {
      els.pageMessage.textContent = "A URL atual não corresponde ao padrão de uma sheet Qlik. Abra a sheet correta ou informe os IDs manualmente.";
      if (!quiet) showToast("Sheet Qlik não detectada na URL atual.", "error");
    }
    return pageContext;
  } catch (error) {
    pageContext = null; currentHostPattern = null; hostAccessGranted = false; renderHostAccessState();
    els.pageMessage.textContent = permissionHint(error);
    if (!quiet) showToast(permissionHint(error), "error");
    throw error;
  }
}

function permissionHint(error) {
  const message = error?.message ?? String(error);
  if (/Nenhuma guia foi associada/i.test(message)) return message;
  if (/HOST_PERMISSION_REQUIRED/i.test(message)) return "Conceda acesso ao host Qlik atual pelo botão ‘Permitir acesso a este site’.";
  if (/Cannot access|manifest must request permission|permission|activeTab|chrome:\/\//i.test(message)) return "A extensão ainda não tem acesso ao host desta página. Clique em ‘Permitir acesso a este site’.";
  if (/No tab with id|tab was closed/i.test(message)) return "A guia Qlik associada foi fechada. Abra a sheet e clique novamente no ícone da extensão.";
  console.error(error);
  return "Não foi possível concluir a operação no navegador. Consulte os detalhes técnicos no console da extensão.";
}
async function requireCurrentHostAccess(granted) {
  const pattern = hostPermissionPattern(granted.url);
  if (!pattern) throw uiError("A guia associada não usa HTTP/HTTPS.");
  if (!await chrome.permissions.contains({ origins: [pattern] })) {
    const error = new Error("HOST_PERMISSION_REQUIRED"); error.code = "HOST_PERMISSION_REQUIRED"; throw error;
  }
  return pattern;
}
async function ensurePageCore(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files: ["core/qlik-geojson-extractor.js"] });
}
async function executeQlikCommand(command, payload) {
  try {
    const api = globalThis.QlikGeoJSONExtractor;
    if (!api?.QlikGeoJSONExtractor) throw new Error("Qlik GeoJSON core is not loaded in the page context.");
    const extractor = new api.QlikGeoJSONExtractor(payload?.connection ?? {});
    let value;
    if (command === "probe") value = await extractor.probe(payload.options);
    else if (command === "inspect") value = await extractor.inspect(payload.options);
    else if (command === "extract") value = await extractor.extract(payload.options);
    else throw new Error(`Unsupported page command: ${command}`);
    return { ok: true, value };
  } catch (error) {
    const serialized = globalThis.QlikGeoJSONExtractor?.serializeError
      ? globalThis.QlikGeoJSONExtractor.serializeError(error)
      : { code: error?.code ?? null, params: error?.params ?? null, message: error?.message ?? String(error), qlik: error?.qlik ?? null, missing: error?.missing ?? null, validation: error?.validation ?? null };
    return { ok: false, error: serialized };
  }
}
async function runQlik(command, options) {
  const granted = await getGrantedTabContext();
  await requireCurrentHostAccess(granted);
  const currentUrl = await getGrantedPageUrl(granted);
  if (new URL(currentUrl).origin !== new URL(granted.url).origin) throw uiError("A guia navegou para outra origem. Clique novamente no ícone da extensão e conceda acesso ao novo host.");
  await ensurePageCore(granted.tabId);
  const injection = await chrome.scripting.executeScript({
    target: { tabId: granted.tabId }, world: "MAIN", func: executeQlikCommand,
    args: [command, { connection: { virtualProxyPath: normalizedVirtualProxy() }, options }]
  });
  const response = injection?.[0]?.result;
  if (!response) throw uiError("A página Qlik não retornou resultado para a extensão.");
  if (!response.ok) {
    const localized = localizeCoreError(response.error);
    const error = new Error(localized.message);
    Object.assign(error, response.error ?? {}, { technicalMessage: localized.technicalMessage });
    throw error;
  }
  return response.value;
}

function normalizedVirtualProxy() {
  const raw = els.virtualProxyInput.value.trim();
  if (!raw || raw === "/") return "";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}
function requiredIds() {
  const appId = els.appIdInput.value.trim();
  const sheetId = els.sheetIdInput.value.trim();
  if (!appId) throw uiError("Informe o ID do app.");
  if (!sheetId) throw uiError("Informe o ID da sheet.");
  return { appId, sheetId };
}

async function probe() {
  setBusy(els.probeButton, true, "Testando..."); setConnectionBadge("neutral", "testando");
  try {
    const result = await runQlik("probe", requiredIds());
    const display = { ...result };
    if (result.error) {
      const localized = localizeCoreError(result.error);
      display.error = { code: result.error.code ?? null, parametros: result.error.params ?? null, mensagem: localized.message };
      if (els.advancedModeInput.checked && result.error.message) display.error.detalheTecnico = result.error.message;
    }
    els.probeOutput.textContent = pretty(display); setVisible(els.probeOutput, true);
    const success = result.websocket === "OPEN" && result.openDoc === "SUCCESS" && result.getSheet === "SUCCESS" && result.getFullPropertyTree === "SUCCESS";
    setConnectionBadge(success ? "success" : "error", success ? "conectado" : "falha");
    showToast(success ? "Conexão Qlik validada." : (result.error ? localizeCoreError(result.error).message : "O teste de conexão retornou uma falha."), success ? "success" : "error");
  } catch (error) { setConnectionBadge("error", "falha"); els.probeOutput.textContent = friendlyError(error); setVisible(els.probeOutput, true); showToast(friendlyError(error), "error"); }
  finally { setBusy(els.probeButton, false); }
}

async function inspect() {
  setBusy(els.inspectButton, true, "Inspecionando..."); currentResult = null; currentDiagnosticReport = null;
  setVisible(els.downloadButton, false); setVisible(els.downloadDiagnosticButton, false);
  try {
    inspectionReport = await runQlik("inspect", requiredIds());
    if (!inspectionReport.pointLayers?.length) throw uiError("Nenhum PointLayer foi encontrado nesta sheet.");
    selectedProperties.clear(); customProperties = []; measures = [];
    renderLayerSelect(); renderFieldList(); renderCustomProperties(); renderMeasures();
    for (const section of [els.inspectionSection, els.propertiesSection, els.customPropertiesSection, els.measuresSection, els.optionsSection, els.extractSection]) setVisible(section, true);
    await refreshSavedConfigAvailability(); updateReadiness();
    showToast(`${inspectionReport.pointLayers.length} PointLayer(s) encontrado(s). Revise as coordenadas e escolha a chave da entidade.`);
  } catch (error) { showToast(friendlyError(error), "error"); }
  finally { setBusy(els.inspectButton, false); }
}

function selectedLayerIndex() { const value = Number(els.layerSelect.value); return Number.isInteger(value) ? value : 0; }
function layerDiagnostic(index) {
  const layer = inspectionReport?.pointLayers?.[index];
  return inspectionReport?.diagnostics?.find((item) => item.objectId === layer?.objectId && item.layerId === layer?.layerId) ?? inspectionReport?.diagnostics?.[index] ?? null;
}
function layerSuggestions(index) {
  const layer = inspectionReport?.pointLayers?.[index];
  return inspectionReport?.entityKeySuggestions?.find((item) => item.objectId === layer?.objectId && item.layerId === layer?.layerId)?.candidates ?? inspectionReport?.entityKeySuggestions?.[index]?.candidates ?? [];
}
function renderLayerSelect() {
  els.layerSelect.textContent = "";
  inspectionReport.pointLayers.forEach((layer, index) => {
    const option = document.createElement("option"); option.value = String(index); option.textContent = `${layer.objectId ?? "objeto"} / ${layer.layerId ?? `camada-${layer.layerIndex}`}`; els.layerSelect.append(option);
  });
  els.layerSelect.value = "0"; applyLayer(0);
}
function renderCoordinateSelect(select, definition, label) {
  select.textContent = "";
  const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = `Escolha ${label.toLowerCase()}...`; select.append(placeholder);
  const detectedValue = encodeCoordinateSelection(definition);
  if (detectedValue) {
    const group = document.createElement("optgroup"); group.label = "Detectado no PointLayer";
    const option = document.createElement("option"); option.value = detectedValue;
    option.textContent = definition.kind === "field" ? `${definition.field} · campo direto` : `${definition.raw} · expressão Qlik`;
    group.append(option); select.append(group);
  }
  const groups = coordinateFieldGroups(inspectionReport?.fields ?? [], definition?.field ?? "");
  if (groups.numeric.length || groups.detected) {
    const group = document.createElement("optgroup"); group.label = "Campos numéricos";
    const fields = groups.detected ? [groups.detected, ...groups.numeric] : groups.numeric;
    const seen = new Set();
    for (const field of fields) {
      if (seen.has(field.name)) continue; seen.add(field.name);
      const option = document.createElement("option"); option.value = `field:${encodeURIComponent(field.name)}`; option.textContent = `${field.name} · cardinalidade ${field.cardinality ?? "?"}`; group.append(option);
    }
    select.append(group);
  }
  select.value = detectedValue || "";
}
function appendLocationFieldGroup(select, label, fields, seen) {
  if (!fields.length) return;
  const group = document.createElement("optgroup"); group.label = label;
  for (const field of fields) {
    if (!field?.name || seen.has(field.name)) continue; seen.add(field.name);
    const option = document.createElement("option"); option.value = `field:${encodeURIComponent(field.name)}`;
    const tags = field.tags?.filter((tag) => tag.startsWith("$geo")).join(", ");
    option.textContent = `${field.name} · cardinalidade ${field.cardinality ?? "?"}${tags ? ` · ${tags}` : ""}`;
    group.append(option);
  }
  if (group.children.length) select.append(group);
}
function renderLocationSelect(select, definition) {
  select.textContent = "";
  const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "Escolha a localização..."; select.append(placeholder);
  const detectedValue = encodeCoordinateSelection(definition);
  if (detectedValue) {
    const group = document.createElement("optgroup"); group.label = "Detectado no PointLayer";
    const option = document.createElement("option"); option.value = detectedValue;
    option.textContent = definition.kind === "field" ? `${definition.field} · campo direto` : `${definition.raw} · expressão Qlik`;
    group.append(option); select.append(group);
  }
  const groups = locationFieldGroups(inspectionReport?.fields ?? [], definition?.field ?? "", definition?.referencedFields ?? []);
  const seen = new Set();
  if (groups.detected) seen.add(groups.detected.name);
  appendLocationFieldGroup(select, "Campos referenciados pela expressão", groups.referenced, seen);
  appendLocationFieldGroup(select, "Campos geoespaciais", groups.geo, seen);
  appendLocationFieldGroup(select, "Todos os campos", groups.other, seen);
  select.value = detectedValue || "";
}
function applyLayer(index) {
  const layer = inspectionReport?.pointLayers?.[index]; if (!layer) return;
  const locationMode = layer.spatialMode === "location" || layer.isLatLong === false;
  setVisible(els.coordinatesInputs, !locationMode);
  setVisible(els.locationInputs, locationMode);
  if (locationMode) {
    renderLocationSelect(els.locationInput, layer.locationDefinition);
    els.latitudeInput.textContent = ""; els.longitudeInput.textContent = "";
  } else {
    renderCoordinateSelect(els.latitudeInput, layer.latitudeDefinition, "Latitude");
    renderCoordinateSelect(els.longitudeInput, layer.longitudeDefinition, "Longitude");
    els.locationInput.textContent = "";
  }
  renderDiagnostic(index); renderEntityOptions(index); renderFieldList(); updateEffectiveConfigPreview(); updateReadiness();
}
function renderDiagnostic(index) {
  const diagnostic = layerDiagnostic(index); const layer = inspectionReport.pointLayers[index]; els.layerDiagnostic.textContent = "";
  const locationMode = (diagnostic?.spatialMode ?? layer.spatialMode) === "location";
  const rows = locationMode ? [
    ["Modo espacial", "Localização única"],
    ["Localização", diagnostic?.locationDefinition?.field ?? diagnostic?.locationDefinition?.raw ?? layer.locationOrLatitude ?? "?"],
    ["Dimensão visual", (diagnostic?.visualDimensions ?? []).map((d) => `${d.field} (${d.cardinality ?? "?"})`).join(", ") || "não identificada"],
    ["Localizações distintas", diagnostic?.spatialStats?.distinctRepresentations ?? diagnostic?.spatialCardinality ?? "?"]
  ] : [
    ["Modo espacial", "Latitude/longitude"],
    ["Latitude", diagnostic?.latitudeDefinition?.field ?? diagnostic?.latitudeDefinition?.raw ?? layer.locationOrLatitude ?? "?"],
    ["Longitude", diagnostic?.longitudeDefinition?.field ?? diagnostic?.longitudeDefinition?.raw ?? layer.longitude ?? "?"],
    ["Dimensão visual", (diagnostic?.visualDimensions ?? []).map((d) => `${d.field} (${d.cardinality ?? "?"})`).join(", ") || "não identificada"],
    ["Pares distintos", diagnostic?.spatialStats?.distinctPairs ?? diagnostic?.spatialCardinality ?? "?"]
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div"); row.className = "diagnostic-row"; const left = document.createElement("span"); left.textContent = label; const right = document.createElement("strong"); right.textContent = String(value); row.append(left, right); els.layerDiagnostic.append(row);
  }
  const stats = diagnostic?.spatialStats;
  if (!locationMode && stats?.available) {
    const grid = document.createElement("div"); grid.className = "diagnostic-stats";
    for (const [name, value] of [
      ["Latitude mín./máx.", `${stats.latitude.min ?? "?"} / ${stats.latitude.max ?? "?"}`],
      ["Longitude mín./máx.", `${stats.longitude.min ?? "?"} / ${stats.longitude.max ?? "?"}`],
      ["Latitudes distintas", stats.latitude.distinct ?? "?"],
      ["Longitudes distintas", stats.longitude.distinct ?? "?"]
    ]) { const item = document.createElement("div"); item.className = "diagnostic-stat"; item.innerHTML = `<span>${name}</span><strong></strong>`; item.querySelector("strong").textContent = String(value); grid.append(item); }
    els.layerDiagnostic.append(grid);
  }
  for (const warning of diagnostic?.warnings ?? []) { const box = document.createElement("div"); box.className = "warning"; box.textContent = localizeDiagnostic(warning); els.layerDiagnostic.append(box); }
}
function renderEntityOptions(index, wantedValue = "") {
  const suggestions = layerSuggestions(index); const fields = inspectionReport.fields ?? []; els.entityKeySelect.textContent = "";
  const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "Escolha explicitamente..."; els.entityKeySelect.append(placeholder);
  const used = new Set();
  if (suggestions.length) {
    const group = document.createElement("optgroup"); group.label = "Candidatos sugeridos";
    for (const item of suggestions) {
      const option = document.createElement("option"); option.value = item.field; option.textContent = `${item.field} · confiança ${confidenceLabel(item.confidence)} · cardinalidade ${item.cardinality ?? "?"}`; group.append(option); used.add(item.field);
    }
    els.entityKeySelect.append(group);
  }
  const allGroup = document.createElement("optgroup"); allGroup.label = "Todos os campos";
  [...fields].sort((a,b) => a.name.localeCompare(b.name,"pt-BR")).forEach((field) => { if (used.has(field.name)) return; const option = document.createElement("option"); option.value = field.name; option.textContent = `${field.name} · cardinalidade ${field.cardinality ?? "?"}`; allGroup.append(option); });
  els.entityKeySelect.append(allGroup);
  els.entityKeySelect.value = wantedValue && fields.some((field) => field.name === wantedValue) ? wantedValue : "";
  renderEntityAssessment();
}
function renderEntityAssessment() {
  els.entityKeyAssessment.textContent = "";
  const selected = els.entityKeySelect.value; if (!selected) return;
  const candidate = layerSuggestions(selectedLayerIndex()).find((item) => item.field === selected);
  if (!candidate) { els.entityKeyAssessment.textContent = "Campo escolhido manualmente; não houve análise espacial detalhada para este candidato."; return; }
  const card = document.createElement("div"); card.className = "candidate-card";
  const title = document.createElement("strong"); title.textContent = `Confiança ${confidenceLabel(candidate.confidence)} · pontuação ${candidate.score}`; title.className = `confidence-${candidate.confidence}`; card.append(title);
  const list = document.createElement("ul");
  for (const evidence of candidate.evidence ?? []) { const li = document.createElement("li"); li.textContent = `${localizeEvidence(evidence)} (${evidence.weight > 0 ? "+" : ""}${evidence.weight})`; list.append(li); }
  card.append(list); els.entityKeyAssessment.append(card);
}

function visibleFields() { return fieldsMatchingQuery(inspectionReport?.fields ?? [], els.fieldSearchInput.value); }
function renderFieldList() {
  if (!inspectionReport) return; els.fieldList.textContent = "";
  const fields = visibleFields().sort((a,b) => (selectedProperties.has(a.name)?0:1) - (selectedProperties.has(b.name)?0:1) || a.name.localeCompare(b.name,"pt-BR"));
  for (const field of fields) {
    const row = document.createElement("div"); row.className = "field-row";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = selectedProperties.has(field.name); checkbox.setAttribute("aria-label", `Selecionar ${field.name}`);
    const label = document.createElement("label"); const name = document.createElement("div"); name.className="field-name"; name.textContent=field.name; const meta=document.createElement("div"); meta.className="field-meta"; meta.textContent=`card. ${field.cardinality ?? "?"}${field.sourceTables?.length ? ` · ${field.sourceTables.join(", ")}` : ""}`; label.append(name,meta);
    const select=document.createElement("select"); for(const [value,text] of aggregations){const option=document.createElement("option");option.value=value;option.textContent=text;select.append(option);} select.value=selectedProperties.get(field.name)??"only"; select.disabled=!checkbox.checked;
    checkbox.addEventListener("change",()=>{ if(checkbox.checked)selectedProperties.set(field.name,select.value);else selectedProperties.delete(field.name);select.disabled=!checkbox.checked;updateSelectedPropertyCount();updateEffectiveConfigPreview();updateReadiness(); });
    select.addEventListener("change",()=>{if(checkbox.checked)selectedProperties.set(field.name,select.value);updateEffectiveConfigPreview();});
    row.append(checkbox,label,select); els.fieldList.append(row);
  }
  if(!fields.length){const p=document.createElement("p");p.className="hint";p.textContent="Nenhum campo corresponde ao filtro.";els.fieldList.append(p);} updateSelectedPropertyCount();
}
function updateSelectedPropertyCount(){els.selectedPropertyCount.textContent=`${selectedProperties.size} selecionada${selectedProperties.size===1?"":"s"}`;els.bulkWarning.textContent=selectedProperties.size>100?"Muitos campos selecionados podem gerar um hypercube pesado e incluir dados desnecessários.":"";}
function selectFiltered(){const fields=visibleFields();if(fields.length>100&&!confirm(`Selecionar ${fields.length} campos filtrados pode gerar uma consulta grande. Continuar?`))return;for(const field of fields)if(!selectedProperties.has(field.name))selectedProperties.set(field.name,"only");renderFieldList();updateEffectiveConfigPreview();}
function selectRelated(){const layer=inspectionReport?.pointLayers?.[selectedLayerIndex()];const spatialFields=layer?.spatialMode==="location"?[decodeCoordinateSelection(els.locationInput.value).field,...(layer.locationDefinition?.referencedFields??[])]:[decodeCoordinateSelection(els.latitudeInput.value).field,decodeCoordinateSelection(els.longitudeInput.value).field];const fields=relatedFields(inspectionReport?.fields??[],els.entityKeySelect.value,...spatialFields);for(const field of fields)if(!selectedProperties.has(field.name))selectedProperties.set(field.name,"only");renderFieldList();updateEffectiveConfigPreview();showToast(`${fields.length} campo(s) relacionado(s) selecionado(s).`);}
function clearProperties(){selectedProperties.clear();renderFieldList();updateEffectiveConfigPreview();}
function applyBulk(){selectedProperties=applyBulkAggregation(selectedProperties,els.bulkAggregationSelect.value);renderFieldList();updateEffectiveConfigPreview();showToast("Agregação aplicada aos campos selecionados.");}

function addCustomProperty(property={label:"",expression:""}){customProperties.push({id:crypto.randomUUID(),...property});renderCustomProperties();updateEffectiveConfigPreview();}
function renderCustomProperties(){els.customPropertyList.textContent="";for(const property of customProperties){const row=document.createElement("div");row.className="measure-row";const l=document.createElement("label");l.textContent="Rótulo";const li=document.createElement("input");li.value=property.label;li.addEventListener("input",()=>{property.label=li.value;updateEffectiveConfigPreview();});l.append(li);const e=document.createElement("label");e.textContent="Expressão Qlik";const ei=document.createElement("input");ei.value=property.expression;ei.addEventListener("input",()=>{property.expression=ei.value;updateEffectiveConfigPreview();});e.append(ei);const a=document.createElement("div");a.className="measure-actions";const r=document.createElement("button");r.type="button";r.className="remove-measure";r.textContent="Remover";r.addEventListener("click",()=>{customProperties=customProperties.filter((x)=>x.id!==property.id);renderCustomProperties();updateEffectiveConfigPreview();});a.append(r);row.append(l,e,a);els.customPropertyList.append(row);}}
function addMeasure(measure={label:"",expression:""}){measures.push({id:crypto.randomUUID(),...measure});renderMeasures();updateEffectiveConfigPreview();}
function renderMeasures(){els.measureList.textContent="";for(const measure of measures){const row=document.createElement("div");row.className="measure-row";const l=document.createElement("label");l.textContent="Rótulo";const li=document.createElement("input");li.value=measure.label;li.addEventListener("input",()=>{measure.label=li.value;updateEffectiveConfigPreview();});l.append(li);const e=document.createElement("label");e.textContent="Expressão Qlik";const ei=document.createElement("input");ei.value=measure.expression;ei.addEventListener("input",()=>{measure.expression=ei.value;updateEffectiveConfigPreview();});e.append(ei);const a=document.createElement("div");a.className="measure-actions";const r=document.createElement("button");r.type="button";r.className="remove-measure";r.textContent="Remover";r.addEventListener("click",()=>{measures=measures.filter((x)=>x.id!==measure.id);renderMeasures();updateEffectiveConfigPreview();});a.append(r);row.append(l,e,a);els.measureList.append(row);}}

function parseOverrides(){const text=els.coordinateOverridesInput.value.trim();if(!text)return undefined;try{const parsed=JSON.parse(text);if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")throw new Error();return parsed;}catch(error){throw uiError("O JSON de correções de coordenadas é inválido.", error.message);}}
function buildExtractionConfig(){
  const {appId}=requiredIds();const entityKey=els.entityKeySelect.value;if(!entityKey)throw uiError("Escolha explicitamente a chave da entidade física.");
  const layer=inspectionReport?.pointLayers?.[selectedLayerIndex()];const spatialMode=layer?.spatialMode==="location"?"location":"coordinates";
  const validMeasures=measures.map(({label,expression})=>({label:label.trim(),expression:expression.trim()})).filter((x)=>x.label||x.expression);for(const m of validMeasures)if(!m.label||!m.expression)throw uiError("Toda medida deve possuir rótulo e expressão Qlik.");
  const config={appId,name:els.datasetNameInput.value.trim()||"qlik_points",entityKey,spatialMode,properties:buildPropertyDefinitions([...selectedProperties.entries()],customProperties),measures:validMeasures,navigationLinks:els.navigationLinksInput.checked,requireAllCoordinates:els.requireAllCoordinatesInput.checked,skipNullEntities:els.skipNullEntitiesInput.checked,coordinateSourceField:els.coordinateSourceFieldInput.value.trim()||"coordinate_source",coordinateSourceValue:els.coordinateSourceValueInput.value.trim()||"Qlik",coordinateOverrides:parseOverrides()};
  if(spatialMode==="location"){
    const location=decodeCoordinateSelection(els.locationInput.value);if(!(location.field||location.expression))throw uiError("Escolha a localização.");
    if(location.field)config.locationField=location.field;else config.locationExpression=location.expression;
  }else{
    const lat=decodeCoordinateSelection(els.latitudeInput.value);const lon=decodeCoordinateSelection(els.longitudeInput.value);if(!(lat.field||lat.expression))throw uiError("Escolha a latitude.");if(!(lon.field||lon.expression))throw uiError("Escolha a longitude.");
    if(lat.field)config.latitudeField=lat.field;else config.latitudeExpression=lat.expression;if(lon.field)config.longitudeField=lon.field;else config.longitudeExpression=lon.expression;
  }
  return config;
}
function updateEffectiveConfigPreview(){if(!els.effectiveConfigOutput)return;try{if(!inspectionReport){els.effectiveConfigOutput.textContent="Inspecione a sheet para montar a configuração.";return;}els.effectiveConfigOutput.textContent=pretty(buildExtractionConfig());}catch(error){els.effectiveConfigOutput.textContent=`Configuração incompleta: ${friendlyError(error)}`;}updateReadiness();}
function updateReadiness(){if(!els.readinessPanel)return;els.readinessPanel.textContent="";const items=[];const layer=inspectionReport?.pointLayers?.[selectedLayerIndex()];const diag=layerDiagnostic(selectedLayerIndex());const warnings=diag?.warnings??[];const locationMode=layer?.spatialMode==="location";items.push({state:inspectionReport?"ok":"warn",text:inspectionReport?"PointLayer inspecionado.":"Inspecione a sheet."});const spatialReady=locationMode?Boolean(els.locationInput.value):Boolean(els.latitudeInput.value&&els.longitudeInput.value);items.push({state:spatialReady?"ok":"warn",text:spatialReady?(locationMode?"Fonte de localização definida.":"Latitude e longitude definidas."):(locationMode?"Defina a fonte de localização.":"Defina latitude e longitude.")});items.push({state:els.entityKeySelect.value?"ok":"warn",text:els.entityKeySelect.value?`Chave física: ${els.entityKeySelect.value}.`:"Escolha a chave da entidade física."});if(warnings.some((w)=>w.severity==="error"))items.push({state:"error",text:"Há erro no diagnóstico da fonte espacial."});else if(warnings.length)items.push({state:"warn",text:`${warnings.length} aviso(s) no diagnóstico do mapa.`});else if(inspectionReport)items.push({state:"ok",text:"Sem avisos estruturais no PointLayer."});for(const item of items){const div=document.createElement("div");div.className=`readiness-item ${item.state}`;div.textContent=item.text;els.readinessPanel.append(div);}}

async function extract(){setBusy(els.extractButton,true,"Extraindo...");els.extractStatus.textContent="Criando hypercube e buscando todas as linhas...";currentResult=null;currentDiagnosticReport=null;setVisible(els.downloadButton,false);setVisible(els.downloadDiagnosticButton,false);resetResultPanels();try{const config=buildExtractionConfig();if(els.effectiveConfigOutput)els.effectiveConfigOutput.textContent=pretty(config);currentResult=await runQlik("extract",config);renderResult(currentResult);const health=extractionHealth(currentResult);els.extractStatus.textContent=health.message;els.extractStatus.dataset.state=health.level;setVisible(els.downloadButton,health.allowDownload);currentDiagnosticReport=buildDiagnosticReport({inspectionReport,layerIndex:selectedLayerIndex(),config,result:currentResult});setVisible(els.downloadDiagnosticButton,true);showToast(health.message,health.level==="success"?"success":"error");}catch(error){els.extractStatus.textContent=friendlyError(error);els.extractStatus.dataset.state="error";if(Array.isArray(error.missing)&&error.missing.length){els.missingOutput.textContent=pretty(error.missing);setVisible(els.missingDetails,true);}showToast(friendlyError(error),"error");}finally{setBusy(els.extractButton,false);}}
function resetResultPanels(){for(const el of [els.resultSummary,els.missingDetails,els.skippedDetails,els.previewDetails])setVisible(el,false);els.resultSummary.textContent="";els.missingOutput.textContent="";els.skippedOutput.textContent="";els.previewOutput.textContent="";}
function renderResult(result){const summary=[[result.rowCount??0,"linhas Qlik"],[result.featureCount??0,"feições"],[result.uniqueKeys??0,"chaves únicas"],[result.missing?.length??0,"sem geometria"],[result.skippedNullEntityCount??0,"linhas nulas ignoradas"],[result.appliedOverrides?.length??0,"correções aplicadas"]];els.resultSummary.textContent="";for(const [value,label] of summary){const item=document.createElement("div");item.className="summary-item";const strong=document.createElement("strong");strong.textContent=String(value);const span=document.createElement("span");span.textContent=label;item.append(strong,span);els.resultSummary.append(item);}setVisible(els.resultSummary,true);if(result.missing?.length){els.missingOutput.textContent=pretty(result.missing);setVisible(els.missingDetails,true);}if(result.skippedNullEntities?.length){els.skippedOutput.textContent=pretty(result.skippedNullEntities);setVisible(els.skippedDetails,true);}els.previewOutput.textContent=pretty(result.featureCollection?.features?.slice(0,10)??[]);setVisible(els.previewDetails,true);}
async function downloadJsonData(data,filename,mime){const blob=new Blob([pretty(data)],{type:mime});const url=URL.createObjectURL(blob);try{await chrome.downloads.download({url,filename,saveAs:true});}finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}}
async function downloadResult(){if(!currentResult?.featureCollection){showToast("Gere o GeoJSON antes de baixar.","error");return;}const base=safeFilename(els.datasetNameInput.value,"qlik_points");await downloadJsonData(currentResult.featureCollection,base.toLowerCase().endsWith(".geojson")?base:`${base}.geojson`,"application/geo+json;charset=utf-8");showToast("Download do GeoJSON iniciado.");}
async function downloadDiagnostic(){if(!currentDiagnosticReport){showToast("Execute uma extração para gerar o relatório de diagnóstico.","error");return;}const base=safeFilename(els.datasetNameInput.value,"qlik_points");await downloadJsonData(currentDiagnosticReport,`${base}_diagnostico.json`,"application/json;charset=utf-8");showToast("Download do relatório de diagnóstico iniciado.");}

async function currentStorageIdentity(){const granted=await getGrantedTabContext();const parsed=parseQlikSenseUrl(pageContext?.url??granted.url);return{origin:parsed.origin??pageContext?.origin,appId:els.appIdInput.value.trim(),sheetId:els.sheetIdInput.value.trim()};}
function serializableUiConfig(){return normalizeSavedConfig({layerIndex:selectedLayerIndex(),spatialMode:inspectionReport?.pointLayers?.[selectedLayerIndex()]?.spatialMode??"coordinates",latitudeSelection:els.latitudeInput.value,longitudeSelection:els.longitudeInput.value,locationSelection:els.locationInput.value,entityKey:els.entityKeySelect.value,properties:[...selectedProperties.entries()].map(([field,aggregation])=>({field,aggregation})),customProperties:customProperties.map(({label,expression})=>({label,expression})),measures:measures.map(({label,expression})=>({label,expression})),datasetName:els.datasetNameInput.value.trim(),navigationLinks:els.navigationLinksInput.checked,requireAllCoordinates:els.requireAllCoordinatesInput.checked,skipNullEntities:els.skipNullEntitiesInput.checked,coordinateSourceField:els.coordinateSourceFieldInput.value.trim(),coordinateSourceValue:els.coordinateSourceValueInput.value.trim(),coordinateOverrides:els.coordinateOverridesInput.value.trim(),virtualProxyPath:normalizedVirtualProxy(),advancedMode:els.advancedModeInput.checked});}
async function saveConfig(){if(!inspectionReport){showToast("Inspecione a sheet antes de salvar a configuração.","error");return;}const key=configStorageKey(await currentStorageIdentity());if(!key){showToast("Não foi possível identificar app/sheet para salvar.","error");return;}await chrome.storage.local.set({[key]:serializableUiConfig()});showToast("Configuração salva localmente no Chrome.");}
async function loadConfig(){if(!inspectionReport){showToast("Inspecione a sheet antes de carregar a configuração.","error");return;}const key=configStorageKey(await currentStorageIdentity());if(!key)return;const raw=(await chrome.storage.local.get(key))[key];if(!raw){showToast("Nenhuma configuração salva para este app/sheet.","error");return;}const stored=normalizeSavedConfig(raw);const layerIndex=inspectionReport.pointLayers[stored.layerIndex]?stored.layerIndex:0;els.layerSelect.value=String(layerIndex);applyLayer(layerIndex);if([...els.latitudeInput.options].some((o)=>o.value===stored.latitudeSelection))els.latitudeInput.value=stored.latitudeSelection;if([...els.longitudeInput.options].some((o)=>o.value===stored.longitudeSelection))els.longitudeInput.value=stored.longitudeSelection;if([...els.locationInput.options].some((o)=>o.value===stored.locationSelection))els.locationInput.value=stored.locationSelection;renderEntityOptions(layerIndex,stored.entityKey);selectedProperties=new Map(stored.properties.filter((item)=>inspectionReport.fields.some((f)=>f.name===item.field)).map((item)=>[item.field,item.aggregation]));customProperties=stored.customProperties.map((item)=>({id:crypto.randomUUID(),...item}));measures=stored.measures.map((item)=>({id:crypto.randomUUID(),...item}));els.datasetNameInput.value=stored.datasetName;els.navigationLinksInput.checked=stored.navigationLinks;els.requireAllCoordinatesInput.checked=stored.requireAllCoordinates;els.skipNullEntitiesInput.checked=stored.skipNullEntities;els.coordinateSourceFieldInput.value=stored.coordinateSourceField;els.coordinateSourceValueInput.value=stored.coordinateSourceValue;els.coordinateOverridesInput.value=stored.coordinateOverrides;els.virtualProxyInput.value=stored.virtualProxyPath;setAdvancedMode(stored.advancedMode);renderFieldList();renderCustomProperties();renderMeasures();renderEntityAssessment();updateEffectiveConfigPreview();showToast("Configuração carregada.");}
async function clearConfig(){const key=configStorageKey(await currentStorageIdentity());if(!key)return;await chrome.storage.local.remove(key);showToast("Configuração salva removida.");await refreshSavedConfigAvailability();}
async function refreshSavedConfigAvailability(){try{const key=configStorageKey(await currentStorageIdentity());const exists=key?Boolean((await chrome.storage.local.get(key))[key]):false;els.loadConfigButton.disabled=!exists;els.clearConfigButton.disabled=!exists;}catch{els.loadConfigButton.disabled=true;els.clearConfigButton.disabled=true;}}

els.hostAccessButton.addEventListener("click",requestOrRemoveCurrentHostAccess);
els.detectButton.addEventListener("click",()=>void detectContext());
els.probeButton.addEventListener("click",()=>void probe());
els.inspectButton.addEventListener("click",()=>void inspect());
els.layerSelect.addEventListener("change",()=>applyLayer(selectedLayerIndex()));
els.latitudeInput.addEventListener("change",updateEffectiveConfigPreview);els.longitudeInput.addEventListener("change",updateEffectiveConfigPreview);els.locationInput.addEventListener("change",updateEffectiveConfigPreview);
els.entityKeySelect.addEventListener("change",()=>{renderEntityAssessment();renderFieldList();updateEffectiveConfigPreview();updateReadiness();});
els.fieldSearchInput.addEventListener("input",renderFieldList);
els.selectFilteredButton.addEventListener("click",selectFiltered);els.selectRelatedButton.addEventListener("click",selectRelated);els.clearPropertiesButton.addEventListener("click",clearProperties);els.applyBulkAggregationButton.addEventListener("click",applyBulk);
els.addCustomPropertyButton.addEventListener("click",()=>addCustomProperty());els.addMeasureButton.addEventListener("click",()=>addMeasure());
els.advancedModeInput.addEventListener("change",()=>{setAdvancedMode(els.advancedModeInput.checked);updateEffectiveConfigPreview();});
for(const input of [els.datasetNameInput,els.navigationLinksInput,els.requireAllCoordinatesInput,els.skipNullEntitiesInput,els.coordinateSourceFieldInput,els.coordinateSourceValueInput,els.coordinateOverridesInput,els.virtualProxyInput])input.addEventListener(input.type==="checkbox"?"change":"input",updateEffectiveConfigPreview);
els.extractButton.addEventListener("click",()=>void extract());els.downloadButton.addEventListener("click",()=>void downloadResult());els.downloadDiagnosticButton.addEventListener("click",()=>void downloadDiagnostic());els.saveConfigButton.addEventListener("click",()=>void saveConfig());els.loadConfigButton.addEventListener("click",()=>void loadConfig());els.clearConfigButton.addEventListener("click",()=>void clearConfig());

setAdvancedMode(false);
void detectContext({quiet:true}).catch(()=>{});
