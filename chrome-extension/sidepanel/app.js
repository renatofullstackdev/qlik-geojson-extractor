import { configStorageKey, hostPermissionPattern, parseQlikSenseUrl, safeFilename } from "../lib/qlik-url.js";

const els = Object.fromEntries([
  "connectionBadge", "detectButton", "pageMessage", "hostAccessBadge", "hostAccessButton",
  "appIdInput", "sheetIdInput", "virtualProxyInput", "probeButton", "inspectButton", "probeOutput",
  "inspectionSection", "layerSelect", "latitudeInput", "longitudeInput", "layerDiagnostic", "entityKeySelect",
  "propertiesSection", "selectedPropertyCount", "fieldSearchInput", "fieldList", "measuresSection",
  "addMeasureButton", "measureList", "optionsSection", "datasetNameInput", "navigationLinksInput",
  "requireAllCoordinatesInput", "skipNullEntitiesInput", "coordinateOverridesInput", "saveConfigButton",
  "loadConfigButton", "clearConfigButton", "extractSection", "extractButton", "extractStatus", "resultSummary",
  "missingDetails", "missingOutput", "skippedDetails", "skippedOutput", "previewDetails", "previewOutput",
  "downloadButton", "toast"
].map((id) => [id, document.getElementById(id)]));

let pageContext = null;
let currentHostPattern = null;
let hostAccessGranted = false;
let inspectionReport = null;
let selectedProperties = new Map();
let measures = [];
let currentResult = null;
let toastTimer = null;

const aggregations = [
  ["only", "Only"],
  ["concat", "Concat distinct"],
  ["max", "Max"],
  ["min", "Min"],
  ["maxTimestamp", "Max timestamp"]
];

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = label ?? "Processando...";
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
  }
}

function showToast(message, type = "success") {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast ${type}`;
  toastTimer = setTimeout(() => {
    els.toast.className = "toast hidden";
  }, 4200);
}

function setConnectionBadge(state, text) {
  els.connectionBadge.className = `badge ${state}`;
  els.connectionBadge.textContent = text;
}

function setVisible(element, visible) {
  element.classList.toggle("hidden", !visible);
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

const SESSION_CONTEXT_KEY = "qlikGeojsonGrantedTabContext";

async function getGrantedTabContext({ retry = true } = {}) {
  const attempts = retry ? 12 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const stored = (await chrome.storage.session.get(SESSION_CONTEXT_KEY))[SESSION_CONTEXT_KEY];
    if (stored?.tabId) return stored;
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(
    "Nenhuma guia foi associada à extensão. Abra a sheet Qlik e clique no ícone da extensão na barra do Chrome."
  );
}

async function getGrantedPageUrl(context) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: context.tabId },
    func: () => location.href
  });
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
  if (hostAccessGranted) {
    els.hostAccessBadge.className = "badge success";
    els.hostAccessBadge.textContent = "permitido";
    els.hostAccessButton.textContent = "Remover acesso deste site";
  } else {
    els.hostAccessBadge.className = "badge error";
    els.hostAccessBadge.textContent = "não permitido";
    els.hostAccessButton.textContent = "Permitir acesso a este site";
  }
}

async function refreshHostAccessState() {
  if (!currentHostPattern) {
    hostAccessGranted = false;
    renderHostAccessState();
    return false;
  }

  hostAccessGranted = await chrome.permissions.contains({ origins: [currentHostPattern] });
  renderHostAccessState();
  return hostAccessGranted;
}

function requestOrRemoveCurrentHostAccess() {
  // permissions.request() must originate from a user gesture. This function is
  // called directly from the Side Panel button click and intentionally does no
  // asynchronous work before requesting the permission.
  if (!currentHostPattern) {
    showToast("Abra uma sheet Qlik e detecte a página antes de conceder acesso.", "error");
    return;
  }

  const operation = hostAccessGranted
    ? chrome.permissions.remove({ origins: [currentHostPattern] })
    : chrome.permissions.request({ origins: [currentHostPattern] });

  void operation.then(async (changed) => {
    await refreshHostAccessState();
    if (hostAccessGranted) {
      showToast("Acesso concedido somente ao host Qlik atual.");
      await detectContext({ quiet: true });
    } else if (changed) {
      showToast("Acesso ao host removido.");
      setConnectionBadge("neutral", "não testado");
    } else {
      showToast("O Chrome não concedeu acesso ao host Qlik.", "error");
    }
  }).catch((error) => {
    showToast(`Não foi possível alterar a permissão do host: ${error.message}`, "error");
  });
}

async function detectContext({ quiet = false } = {}) {
  try {
    const granted = await getGrantedTabContext();
    let href = granted.url;
    let parsed = parseQlikSenseUrl(href);

    currentHostPattern = hostPermissionPattern(href);
    await refreshHostAccessState();

    // After the user has granted the exact host, refresh the actual page URL so
    // same-origin navigation to another app/sheet is detected without another
    // permission prompt.
    if (hostAccessGranted) {
      try {
        const currentHref = await getGrantedPageUrl(granted);
        if (currentHref) {
          href = currentHref;
          parsed = parseQlikSenseUrl(href);
          const newPattern = hostPermissionPattern(href);
          if (newPattern !== currentHostPattern) {
            currentHostPattern = newPattern;
            await refreshHostAccessState();
          }
          await chrome.storage.session.set({
            [SESSION_CONTEXT_KEY]: { ...granted, url: href, capturedAt: Date.now() }
          });
        }
      } catch (error) {
        // A permission may have been revoked between contains() and injection.
        hostAccessGranted = false;
        renderHostAccessState();
        if (!quiet) throw error;
      }
    }

    pageContext = { ...parsed, tabId: granted.tabId, windowId: granted.windowId, url: href };

    if (parsed.appId) els.appIdInput.value = parsed.appId;
    if (parsed.sheetId) els.sheetIdInput.value = parsed.sheetId;
    els.virtualProxyInput.value = parsed.virtualProxyPath ?? "";

    if (parsed.isQlikSheet) {
      const accessText = hostAccessGranted
        ? "Acesso ao host concedido."
        : "Clique em ‘Permitir acesso a este site’ antes de testar ou inspecionar.";
      els.pageMessage.textContent = `Qlik detectado em ${parsed.origin}. App e sheet foram preenchidos pela URL. ${accessText}`;
      if (!quiet) showToast("App e sheet detectados pela URL atual.");
    } else {
      els.pageMessage.textContent = "A URL atual não corresponde ao padrão /sense/app/.../sheet/.... Preencha os IDs manualmente ou abra uma sheet Qlik.";
      if (!quiet) showToast("Sheet Qlik não detectada na URL atual.", "error");
    }
    return pageContext;
  } catch (error) {
    pageContext = null;
    currentHostPattern = null;
    hostAccessGranted = false;
    renderHostAccessState();
    els.pageMessage.textContent = permissionHint(error);
    if (!quiet) showToast(permissionHint(error), "error");
    throw error;
  }
}

function permissionHint(error) {
  const message = error?.message ?? String(error);
  if (/Nenhuma guia foi associada/i.test(message)) return message;
  if (/HOST_PERMISSION_REQUIRED/i.test(message)) {
    return "Conceda acesso ao host Qlik atual pelo botão ‘Permitir acesso a este site’.";
  }
  if (/Cannot access|manifest must request permission|permission|activeTab|chrome:\/\//i.test(message)) {
    return "A extensão ainda não tem acesso ao host desta página. Clique em ‘Permitir acesso a este site’.";
  }
  if (/No tab with id|tab was closed/i.test(message)) {
    return "A guia Qlik associada ao painel foi fechada. Abra a sheet e clique novamente no ícone da extensão.";
  }
  return message;
}

async function requireCurrentHostAccess(granted) {
  const pattern = hostPermissionPattern(granted.url);
  if (!pattern) throw new Error("A guia associada não usa HTTP/HTTPS.");
  const allowed = await chrome.permissions.contains({ origins: [pattern] });
  if (!allowed) {
    const error = new Error("HOST_PERMISSION_REQUIRED");
    error.code = "HOST_PERMISSION_REQUIRED";
    throw error;
  }
  return pattern;
}

async function ensurePageCore(tabId) {
  const check = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => Boolean(globalThis.QlikGeoJSONExtractor?.QlikGeoJSONExtractor)
  });

  if (check?.[0]?.result) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    files: ["core/qlik-geojson-extractor.js"]
  });
}

async function executeQlikCommand(command, payload) {
  try {
    const api = globalThis.QlikGeoJSONExtractor;
    if (!api?.QlikGeoJSONExtractor) {
      throw new Error("Qlik GeoJSON core is not loaded in the page context.");
    }

    const connection = payload?.connection ?? {};
    const extractor = new api.QlikGeoJSONExtractor(connection);
    let value;

    if (command === "probe") {
      value = await extractor.probe(payload.options);
    } else if (command === "inspect") {
      value = await extractor.inspect(payload.options);
    } else if (command === "extract") {
      value = await extractor.extract(payload.options);
    } else {
      throw new Error(`Unsupported page command: ${command}`);
    }

    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: error?.message ?? String(error),
        qlik: error?.qlik ?? null,
        missing: error?.missing ?? null,
        validation: error?.validation ?? null
      }
    };
  }
}

async function runQlik(command, options) {
  const granted = await getGrantedTabContext();
  await requireCurrentHostAccess(granted);

  let currentUrl;
  try {
    currentUrl = await getGrantedPageUrl(granted);
  } catch (error) {
    throw new Error(
      "A guia não pode ser acessada com a permissão de host atual. Se ela navegou para outro site, clique novamente no ícone da extensão nessa página e conceda o novo host."
    );
  }

  const originalOrigin = new URL(granted.url).origin;
  const currentOrigin = new URL(currentUrl).origin;
  if (currentOrigin !== originalOrigin) {
    throw new Error(
      "A guia navegou para outra origem. Clique novamente no ícone da extensão nesta página e conceda acesso ao novo host."
    );
  }

  await ensurePageCore(granted.tabId);

  const injection = await chrome.scripting.executeScript({
    target: { tabId: granted.tabId },
    world: "MAIN",
    func: executeQlikCommand,
    args: [command, {
      connection: {
        virtualProxyPath: normalizedVirtualProxy()
      },
      options
    }]
  });

  const response = injection?.[0]?.result;
  if (!response) throw new Error("A página Qlik não retornou resultado para a extensão.");
  if (!response.ok) {
    const error = new Error(response.error?.message ?? "Qlik operation failed.");
    Object.assign(error, response.error ?? {});
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
  if (!appId) throw new Error("Informe o App ID.");
  if (!sheetId) throw new Error("Informe o Sheet ID.");
  return { appId, sheetId };
}

async function probe() {
  setBusy(els.probeButton, true, "Testando...");
  setConnectionBadge("neutral", "testando");
  try {
    const ids = requiredIds();
    const result = await runQlik("probe", ids);
    els.probeOutput.textContent = pretty(result);
    setVisible(els.probeOutput, true);
    const success = result.websocket === "OPEN" && result.openDoc === "SUCCESS" &&
      result.getSheet === "SUCCESS" && result.getFullPropertyTree === "SUCCESS";
    setConnectionBadge(success ? "success" : "error", success ? "conectado" : "falha");
    if (!success) showToast("O probe retornou uma falha. Veja os detalhes.", "error");
    else showToast("Conexão Qlik validada.");
  } catch (error) {
    setConnectionBadge("error", "falha");
    els.probeOutput.textContent = permissionHint(error);
    setVisible(els.probeOutput, true);
    showToast(permissionHint(error), "error");
  } finally {
    setBusy(els.probeButton, false);
  }
}

async function inspect() {
  setBusy(els.inspectButton, true, "Inspecionando...");
  currentResult = null;
  setVisible(els.downloadButton, false);
  try {
    const ids = requiredIds();
    inspectionReport = await runQlik("inspect", ids);
    if (!inspectionReport.pointLayers?.length) {
      throw new Error("Nenhum PointLayer foi encontrado nesta sheet.");
    }
    selectedProperties.clear();
    measures = [];
    renderMeasures();
    renderLayerSelect();
    renderFieldList();
    setVisible(els.inspectionSection, true);
    setVisible(els.propertiesSection, true);
    setVisible(els.measuresSection, true);
    setVisible(els.optionsSection, true);
    setVisible(els.extractSection, true);
    await refreshSavedConfigAvailability();
    showToast(`${inspectionReport.pointLayers.length} PointLayer(s) encontrado(s). Escolha a chave da entidade.`);
  } catch (error) {
    showToast(permissionHint(error), "error");
  } finally {
    setBusy(els.inspectButton, false);
  }
}

function renderLayerSelect() {
  els.layerSelect.textContent = "";
  inspectionReport.pointLayers.forEach((layer, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${layer.objectId ?? "objeto"} / ${layer.layerId ?? `layer-${layer.layerIndex}`}`;
    els.layerSelect.append(option);
  });
  els.layerSelect.value = "0";
  applyLayer(0);
}

function selectedLayerIndex() {
  const value = Number(els.layerSelect.value);
  return Number.isInteger(value) ? value : 0;
}

function applyLayer(index) {
  const layer = inspectionReport.pointLayers[index];
  if (!layer) return;
  els.latitudeInput.value = layer.locationOrLatitude ?? "";
  els.longitudeInput.value = layer.longitude ?? "";
  renderDiagnostic(index);
  renderEntityOptions(index);
}

function layerDiagnostic(index) {
  const layer = inspectionReport.pointLayers[index];
  return inspectionReport.diagnostics?.find((item) =>
    item.objectId === layer?.objectId && item.layerId === layer?.layerId
  ) ?? inspectionReport.diagnostics?.[index] ?? null;
}

function layerSuggestions(index) {
  const layer = inspectionReport.pointLayers[index];
  return inspectionReport.entityKeySuggestions?.find((item) =>
    item.objectId === layer?.objectId && item.layerId === layer?.layerId
  )?.candidates ?? inspectionReport.entityKeySuggestions?.[index]?.candidates ?? [];
}

function renderDiagnostic(index) {
  const diagnostic = layerDiagnostic(index);
  const layer = inspectionReport.pointLayers[index];
  els.layerDiagnostic.textContent = "";

  const rows = [
    ["Latitude", `${diagnostic?.latitudeField ?? layer?.locationOrLatitude ?? "?"} · cardinalidade ${diagnostic?.latitudeCardinality ?? "?"}`],
    ["Longitude", `${diagnostic?.longitudeField ?? layer?.longitude ?? "?"} · cardinalidade ${diagnostic?.longitudeCardinality ?? "?"}`],
    ["Dimensão visual", (diagnostic?.visualDimensions ?? []).map((d) => `${d.field} (${d.cardinality ?? "?"})`).join(", ") || "não identificada"]
  ];

  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "diagnostic-row";
    const left = document.createElement("span");
    left.textContent = label;
    const right = document.createElement("strong");
    right.textContent = value;
    row.append(left, right);
    els.layerDiagnostic.append(row);
  }

  for (const warning of diagnostic?.warnings ?? []) {
    const box = document.createElement("div");
    box.className = "warning";
    box.textContent = warning;
    els.layerDiagnostic.append(box);
  }
}

function renderEntityOptions(index, wantedValue = "") {
  const suggestions = layerSuggestions(index);
  const fields = inspectionReport.fields ?? [];
  els.entityKeySelect.textContent = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Escolha explicitamente...";
  els.entityKeySelect.append(placeholder);

  const used = new Set();
  if (suggestions.length) {
    const group = document.createElement("optgroup");
    group.label = "Candidatos sugeridos";
    for (const item of suggestions) {
      const option = document.createElement("option");
      option.value = item.field;
      option.textContent = `${item.field} · cardinalidade ${item.cardinality ?? "?"} · score ${item.score}`;
      group.append(option);
      used.add(item.field);
    }
    els.entityKeySelect.append(group);
  }

  const allGroup = document.createElement("optgroup");
  allGroup.label = "Todos os campos";
  [...fields]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .forEach((field) => {
      if (used.has(field.name)) return;
      const option = document.createElement("option");
      option.value = field.name;
      option.textContent = `${field.name} · cardinalidade ${field.cardinality ?? "?"}`;
      allGroup.append(option);
    });
  els.entityKeySelect.append(allGroup);

  if (wantedValue && fields.some((field) => field.name === wantedValue)) {
    els.entityKeySelect.value = wantedValue;
  } else {
    els.entityKeySelect.value = "";
  }
}

function renderFieldList() {
  if (!inspectionReport) return;
  const query = els.fieldSearchInput.value.trim().toLocaleLowerCase("pt-BR");
  els.fieldList.textContent = "";

  const visibleFields = inspectionReport.fields
    .filter((field) => {
      if (!query) return true;
      const haystack = `${field.name} ${(field.sourceTables ?? []).join(" ")}`.toLocaleLowerCase("pt-BR");
      return haystack.includes(query);
    })
    .sort((a, b) => {
      const aSelected = selectedProperties.has(a.name) ? 0 : 1;
      const bSelected = selectedProperties.has(b.name) ? 0 : 1;
      return aSelected - bSelected || a.name.localeCompare(b.name, "pt-BR");
    });

  for (const field of visibleFields) {
    const row = document.createElement("div");
    row.className = "field-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedProperties.has(field.name);
    checkbox.setAttribute("aria-label", `Selecionar ${field.name}`);

    const label = document.createElement("label");
    const name = document.createElement("div");
    name.className = "field-name";
    name.textContent = field.name;
    const meta = document.createElement("div");
    meta.className = "field-meta";
    meta.textContent = `card. ${field.cardinality ?? "?"}${field.sourceTables?.length ? ` · ${field.sourceTables.join(", ")}` : ""}`;
    label.append(name, meta);

    const select = document.createElement("select");
    for (const [value, text] of aggregations) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.value = selectedProperties.get(field.name) ?? "only";
    select.disabled = !checkbox.checked;

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedProperties.set(field.name, select.value);
      else selectedProperties.delete(field.name);
      select.disabled = !checkbox.checked;
      updateSelectedPropertyCount();
    });
    select.addEventListener("change", () => {
      if (checkbox.checked) selectedProperties.set(field.name, select.value);
    });

    row.append(checkbox, label, select);
    els.fieldList.append(row);
  }

  if (!visibleFields.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Nenhum campo corresponde ao filtro.";
    els.fieldList.append(empty);
  }

  updateSelectedPropertyCount();
}

function updateSelectedPropertyCount() {
  els.selectedPropertyCount.textContent = `${selectedProperties.size} selecionada${selectedProperties.size === 1 ? "" : "s"}`;
}

function addMeasure(measure = { label: "", expression: "" }) {
  measures.push({ id: crypto.randomUUID(), label: measure.label ?? "", expression: measure.expression ?? "" });
  renderMeasures();
}

function renderMeasures() {
  els.measureList.textContent = "";
  for (const measure of measures) {
    const row = document.createElement("div");
    row.className = "measure-row";

    const labelField = document.createElement("label");
    labelField.textContent = "Rótulo";
    const labelInput = document.createElement("input");
    labelInput.value = measure.label;
    labelInput.placeholder = "COUNT_RECORDS";
    labelInput.addEventListener("input", () => { measure.label = labelInput.value; });
    labelField.append(labelInput);

    const expressionField = document.createElement("label");
    expressionField.textContent = "Expressão Qlik";
    const expressionInput = document.createElement("input");
    expressionInput.value = measure.expression;
    expressionInput.placeholder = "Count(ID)";
    expressionInput.addEventListener("input", () => { measure.expression = expressionInput.value; });
    expressionField.append(expressionInput);

    const actions = document.createElement("div");
    actions.className = "measure-actions";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-measure";
    remove.textContent = "Remover";
    remove.addEventListener("click", () => {
      measures = measures.filter((item) => item.id !== measure.id);
      renderMeasures();
    });
    actions.append(remove);

    row.append(labelField, expressionField, actions);
    els.measureList.append(row);
  }
}

function parseOverrides() {
  const text = els.coordinateOverridesInput.value.trim();
  if (!text) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON de correções de coordenadas inválido: ${error.message}`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Correções de coordenadas devem ser um objeto JSON indexado pela chave da entidade.");
  }
  return parsed;
}

function buildExtractionConfig() {
  const { appId } = requiredIds();
  const entityKey = els.entityKeySelect.value;
  const latitudeField = els.latitudeInput.value.trim();
  const longitudeField = els.longitudeInput.value.trim();
  if (!entityKey) throw new Error("Escolha explicitamente a chave da entidade física.");
  if (!latitudeField) throw new Error("Informe o campo de latitude.");
  if (!longitudeField) throw new Error("Informe o campo de longitude.");

  const validMeasures = measures
    .map(({ label, expression }) => ({ label: label.trim(), expression: expression.trim() }))
    .filter((item) => item.label || item.expression);
  for (const measure of validMeasures) {
    if (!measure.label || !measure.expression) {
      throw new Error("Toda medida deve possuir rótulo e expressão Qlik.");
    }
  }

  return {
    appId,
    name: els.datasetNameInput.value.trim() || "qlik_points",
    entityKey,
    latitudeField,
    longitudeField,
    properties: [...selectedProperties.entries()].map(([field, aggregation]) => ({ field, aggregation })),
    measures: validMeasures,
    navigationLinks: els.navigationLinksInput.checked,
    requireAllCoordinates: els.requireAllCoordinatesInput.checked,
    skipNullEntities: els.skipNullEntitiesInput.checked,
    coordinateOverrides: parseOverrides()
  };
}

async function extract() {
  setBusy(els.extractButton, true, "Extraindo...");
  els.extractStatus.textContent = "Criando hypercube e buscando todas as linhas...";
  currentResult = null;
  setVisible(els.downloadButton, false);
  resetResultPanels();

  try {
    const config = buildExtractionConfig();
    currentResult = await runQlik("extract", config);
    els.extractStatus.textContent = "GeoJSON gerado e validado.";
    renderResult(currentResult);
    setVisible(els.downloadButton, true);
    showToast(`${currentResult.featureCount} feição(ões) GeoJSON gerada(s).`);
  } catch (error) {
    els.extractStatus.textContent = error.message;
    if (Array.isArray(error.missing) && error.missing.length) {
      els.missingOutput.textContent = pretty(error.missing);
      setVisible(els.missingDetails, true);
    }
    showToast(permissionHint(error), "error");
  } finally {
    setBusy(els.extractButton, false);
  }
}

function resetResultPanels() {
  setVisible(els.resultSummary, false);
  setVisible(els.missingDetails, false);
  setVisible(els.skippedDetails, false);
  setVisible(els.previewDetails, false);
  els.resultSummary.textContent = "";
  els.missingOutput.textContent = "";
  els.skippedOutput.textContent = "";
  els.previewOutput.textContent = "";
}

function renderResult(result) {
  const summary = [
    [result.rowCount ?? 0, "linhas Qlik"],
    [result.featureCount ?? 0, "feições"],
    [result.uniqueKeys ?? 0, "chaves únicas"],
    [result.missing?.length ?? 0, "sem coordenadas"],
    [result.skippedNullEntityCount ?? result.skippedNullEntities?.length ?? 0, "linhas nulas ignoradas"],
    [result.appliedOverrides?.length ?? 0, "correções aplicadas"]
  ];

  els.resultSummary.textContent = "";
  for (const [value, label] of summary) {
    const item = document.createElement("div");
    item.className = "summary-item";
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    const span = document.createElement("span");
    span.textContent = label;
    item.append(strong, span);
    els.resultSummary.append(item);
  }
  setVisible(els.resultSummary, true);

  if (result.missing?.length) {
    els.missingOutput.textContent = pretty(result.missing);
    setVisible(els.missingDetails, true);
  }
  if (result.skippedNullEntities?.length) {
    els.skippedOutput.textContent = pretty(result.skippedNullEntities);
    setVisible(els.skippedDetails, true);
  }

  const preview = result.featureCollection?.features?.slice(0, 10) ?? [];
  els.previewOutput.textContent = pretty(preview);
  setVisible(els.previewDetails, true);
}

async function downloadResult() {
  if (!currentResult?.featureCollection) {
    showToast("Gere o GeoJSON antes de baixar.", "error");
    return;
  }

  const base = safeFilename(els.datasetNameInput.value, "qlik_points");
  const filename = base.toLowerCase().endsWith(".geojson") ? base : `${base}.geojson`;
  const blob = new Blob([pretty(currentResult.featureCollection)], { type: "application/geo+json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: true });
    showToast("Download do GeoJSON iniciado.");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

async function currentStorageIdentity() {
  const granted = await getGrantedTabContext();
  const parsed = parseQlikSenseUrl(pageContext?.url ?? granted.url);
  const appId = els.appIdInput.value.trim();
  const sheetId = els.sheetIdInput.value.trim();
  return {
    origin: parsed.origin ?? pageContext?.origin,
    appId,
    sheetId
  };
}

function serializableUiConfig() {
  return {
    version: 1,
    layerIndex: selectedLayerIndex(),
    latitudeField: els.latitudeInput.value.trim(),
    longitudeField: els.longitudeInput.value.trim(),
    entityKey: els.entityKeySelect.value,
    properties: [...selectedProperties.entries()].map(([field, aggregation]) => ({ field, aggregation })),
    measures: measures.map(({ label, expression }) => ({ label, expression })),
    datasetName: els.datasetNameInput.value.trim(),
    navigationLinks: els.navigationLinksInput.checked,
    requireAllCoordinates: els.requireAllCoordinatesInput.checked,
    skipNullEntities: els.skipNullEntitiesInput.checked,
    coordinateOverrides: els.coordinateOverridesInput.value.trim(),
    virtualProxyPath: normalizedVirtualProxy()
  };
}

async function saveConfig() {
  if (!inspectionReport) {
    showToast("Inspecione a sheet antes de salvar a configuração.", "error");
    return;
  }
  const identity = await currentStorageIdentity();
  const key = configStorageKey(identity);
  if (!key) {
    showToast("Não foi possível identificar app/sheet para salvar.", "error");
    return;
  }
  await chrome.storage.local.set({ [key]: serializableUiConfig() });
  showToast("Configuração salva localmente no Chrome.");
}

async function loadConfig() {
  if (!inspectionReport) {
    showToast("Inspecione a sheet antes de carregar a configuração.", "error");
    return;
  }
  const identity = await currentStorageIdentity();
  const key = configStorageKey(identity);
  if (!key) return;
  const stored = (await chrome.storage.local.get(key))[key];
  if (!stored) {
    showToast("Nenhuma configuração salva para este app/sheet.", "error");
    return;
  }

  const layerIndex = Number.isInteger(stored.layerIndex) && inspectionReport.pointLayers[stored.layerIndex]
    ? stored.layerIndex : 0;
  els.layerSelect.value = String(layerIndex);
  applyLayer(layerIndex);
  els.latitudeInput.value = stored.latitudeField ?? els.latitudeInput.value;
  els.longitudeInput.value = stored.longitudeField ?? els.longitudeInput.value;
  renderEntityOptions(layerIndex, stored.entityKey ?? "");

  selectedProperties = new Map((stored.properties ?? [])
    .filter((item) => inspectionReport.fields.some((field) => field.name === item.field))
    .map((item) => [item.field, item.aggregation ?? "only"]));
  measures = (stored.measures ?? []).map((item) => ({ id: crypto.randomUUID(), ...item }));
  els.datasetNameInput.value = stored.datasetName ?? "qlik_points";
  els.navigationLinksInput.checked = Boolean(stored.navigationLinks);
  els.requireAllCoordinatesInput.checked = stored.requireAllCoordinates !== false;
  els.skipNullEntitiesInput.checked = stored.skipNullEntities !== false;
  els.coordinateOverridesInput.value = stored.coordinateOverrides ?? "";
  if (typeof stored.virtualProxyPath === "string") els.virtualProxyInput.value = stored.virtualProxyPath;
  renderFieldList();
  renderMeasures();
  showToast("Configuração carregada.");
}

async function clearConfig() {
  const identity = await currentStorageIdentity();
  const key = configStorageKey(identity);
  if (!key) return;
  await chrome.storage.local.remove(key);
  showToast("Configuração salva removida.");
  await refreshSavedConfigAvailability();
}

async function refreshSavedConfigAvailability() {
  try {
    const identity = await currentStorageIdentity();
    const key = configStorageKey(identity);
    if (!key) return;
    const exists = Boolean((await chrome.storage.local.get(key))[key]);
    els.loadConfigButton.disabled = !exists;
    els.clearConfigButton.disabled = !exists;
  } catch {
    els.loadConfigButton.disabled = true;
    els.clearConfigButton.disabled = true;
  }
}

els.hostAccessButton.addEventListener("click", requestOrRemoveCurrentHostAccess);
els.detectButton.addEventListener("click", () => { void detectContext(); });
els.probeButton.addEventListener("click", () => { void probe(); });
els.inspectButton.addEventListener("click", () => { void inspect(); });
els.layerSelect.addEventListener("change", () => applyLayer(selectedLayerIndex()));
els.fieldSearchInput.addEventListener("input", renderFieldList);
els.addMeasureButton.addEventListener("click", () => addMeasure());
els.extractButton.addEventListener("click", () => { void extract(); });
els.downloadButton.addEventListener("click", () => { void downloadResult(); });
els.saveConfigButton.addEventListener("click", () => { void saveConfig(); });
els.loadConfigButton.addEventListener("click", () => { void loadConfig(); });
els.clearConfigButton.addEventListener("click", () => { void clearConfig(); });

void detectContext({ quiet: true }).catch(() => {});
