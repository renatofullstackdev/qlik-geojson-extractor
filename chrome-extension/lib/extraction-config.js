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
    if (labels.has(item.label)) {
      throw new Error(`Rótulo de propriedade duplicado: ${item.label}`);
    }
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
    return {
      level: "error",
      message: `Nenhuma feição foi gerada: ${missingCount} entidade(s) real(is) ficaram sem coordenadas. Verifique os campos de latitude/longitude e a configuração efetiva antes de baixar.`,
      allowDownload: false,
      rowCount,
      featureCount,
      uniqueKeys,
      missingCount,
      skippedNullCount
    };
  }

  if (missingCount > 0) {
    return {
      level: "warning",
      message: `GeoJSON gerado com ${missingCount} entidade(s) sem coordenadas. Revise os registros antes de usar o arquivo.`,
      allowDownload: featureCount > 0,
      rowCount,
      featureCount,
      uniqueKeys,
      missingCount,
      skippedNullCount
    };
  }

  return {
    level: "success",
    message: `GeoJSON gerado e validado com ${featureCount} feição(ões).`,
    allowDownload: featureCount > 0,
    rowCount,
    featureCount,
    uniqueKeys,
    missingCount,
    skippedNullCount
  };
}

export function coordinateFieldGroups(fields = [], detectedField = "") {
  const normalized = fields.map((field) => ({
    name: String(field?.name ?? ""),
    cardinality: field?.cardinality ?? null,
    tags: Array.isArray(field?.tags) ? field.tags : []
  })).filter((field) => field.name);

  const byName = new Map(normalized.map((field) => [field.name, field]));
  const detected = detectedField && byName.has(detectedField) ? byName.get(detectedField) : null;
  const numeric = normalized.filter((field) => field.tags.includes("$numeric") && field.name !== detected?.name)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const other = normalized.filter((field) => !field.tags.includes("$numeric") && field.name !== detected?.name)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { detected, numeric, other };
}
