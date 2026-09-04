export function buildPropertyDefinitions(selectedProperties = [], customProperties = []) {
  const direct = selectedProperties.map(([field, aggregation]) => ({
    field: String(field ?? "").trim(),
    aggregation: String(aggregation ?? "only").trim() || "only"
  })).filter((item) => item.field);

  const custom = customProperties.map((item) => ({
    label: String(item?.label ?? "").trim(),
    expression: String(item?.expression ?? "").trim()
  })).filter((item) => item.label || item.expression);

  for (const item of custom) {
    if (!item.label || !item.expression) {
      throw new Error("Toda propriedade por expressão deve possuir rótulo e expressão Qlik.");
    }
  }

  const labels = new Set(direct.map((item) => item.field));
  for (const item of custom) {
    if (labels.has(item.label)) throw new Error(`Rótulo de propriedade duplicado: ${item.label}`);
    labels.add(item.label);
  }
  return [...direct, ...custom];
}

export function extractionHealth(result) {
  const rowCount = Number(result?.rowCount ?? 0);
  const featureCount = Number(result?.featureCount ?? result?.featureCollection?.features?.length ?? 0);
  const uniqueKeys = Number(result?.uniqueKeys ?? 0);
  const missingCount = Number(result?.missing?.length ?? 0);
  const skippedNullCount = Number(result?.skippedNullEntityCount ?? result?.skippedNullEntities?.length ?? 0);

  if (uniqueKeys > 0 && featureCount === 0 && missingCount > 0) {
    return { level: "error", message: `Nenhuma feição foi gerada: ${missingCount} entidade(s) real(is) ficaram sem coordenadas. Verifique latitude/longitude antes de baixar.`, allowDownload: false, rowCount, featureCount, uniqueKeys, missingCount, skippedNullCount };
  }
  if (missingCount > 0) {
    return { level: "warning", message: `GeoJSON gerado com ${missingCount} entidade(s) sem coordenadas. Revise os registros antes de usar o arquivo.`, allowDownload: featureCount > 0, rowCount, featureCount, uniqueKeys, missingCount, skippedNullCount };
  }
  return { level: "success", message: `GeoJSON gerado e validado com ${featureCount} feição(ões).`, allowDownload: featureCount > 0, rowCount, featureCount, uniqueKeys, missingCount, skippedNullCount };
}

export function coordinateFieldGroups(fields = [], detectedField = "") {
  const normalized = fields.map((field) => ({ name: String(field?.name ?? ""), cardinality: field?.cardinality ?? null, tags: Array.isArray(field?.tags) ? field.tags : [] })).filter((field) => field.name);
  const byName = new Map(normalized.map((field) => [field.name, field]));
  const detected = detectedField && byName.has(detectedField) ? byName.get(detectedField) : null;
  const numeric = normalized.filter((field) => field.tags.includes("$numeric") && field.name !== detected?.name).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const other = normalized.filter((field) => !field.tags.includes("$numeric") && field.name !== detected?.name).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { detected, numeric, other };
}

export function encodeCoordinateSelection(definition) {
  if (definition?.kind === "field" && definition.field) return `field:${encodeURIComponent(definition.field)}`;
  if (definition?.kind === "expression" && definition.expression) return `expression:${encodeURIComponent(definition.expression)}`;
  return "";
}

export function decodeCoordinateSelection(value) {
  const raw = String(value ?? "");
  const separator = raw.indexOf(":");
  if (separator < 0) return { field: raw || null, expression: null };
  const type = raw.slice(0, separator);
  const decoded = decodeURIComponent(raw.slice(separator + 1));
  if (type === "field") return { field: decoded, expression: null };
  if (type === "expression") return { field: null, expression: decoded };
  return { field: null, expression: null };
}

export function applyBulkAggregation(selectedProperties, aggregation) {
  return new Map([...selectedProperties.keys()].map((field) => [field, aggregation]));
}

export function fieldsMatchingQuery(fields = [], query = "") {
  const normalized = String(query).trim().toLocaleLowerCase("pt-BR");
  return fields.filter((field) => {
    if (!normalized) return true;
    return `${field.name} ${(field.sourceTables ?? []).join(" ")}`.toLocaleLowerCase("pt-BR").includes(normalized);
  });
}

export function relatedFields(fields = [], entityKey, latitudeField, longitudeField) {
  const byName = new Map(fields.map((field) => [field.name, field]));
  const anchorTables = new Set();
  for (const name of [entityKey, latitudeField, longitudeField]) {
    for (const table of byName.get(name)?.sourceTables ?? []) anchorTables.add(table);
  }
  if (!anchorTables.size) return [];
  return fields.filter((field) => (field.sourceTables ?? []).some((table) => anchorTables.has(table)));
}

export function buildDiagnosticReport({ inspectionReport, layerIndex, config, result }) {
  const layer = inspectionReport?.pointLayers?.[layerIndex] ?? null;
  const diagnostic = inspectionReport?.diagnostics?.[layerIndex] ?? null;
  const suggestionGroup = inspectionReport?.entityKeySuggestions?.[layerIndex] ?? null;
  const selectedCandidate = suggestionGroup?.candidates?.find((item) => item.field === config?.entityKey) ?? null;
  return {
    generatedAt: new Date().toISOString(),
    appId: inspectionReport?.appId ?? config?.appId ?? null,
    sheetId: inspectionReport?.sheetId ?? null,
    pointLayer: layer ? { objectId: layer.objectId, layerId: layer.layerId, layerIndex: layer.layerIndex } : null,
    coordinates: diagnostic ? {
      latitudeDefinition: diagnostic.latitudeDefinition,
      longitudeDefinition: diagnostic.longitudeDefinition,
      statistics: diagnostic.coordinateStats,
      warnings: diagnostic.warnings
    } : null,
    entityKey: config?.entityKey ?? null,
    entityKeyAssessment: selectedCandidate,
    extraction: result ? {
      rowCount: result.rowCount ?? 0,
      featureCount: result.featureCount ?? 0,
      uniqueKeys: result.uniqueKeys ?? 0,
      missingCoordinates: result.missing?.length ?? 0,
      skippedNullEntities: result.skippedNullEntityCount ?? 0,
      appliedOverrides: result.appliedOverrides?.length ?? 0,
      validation: result.validation
    } : null
  };
}
