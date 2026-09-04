export function normalizeSavedConfig(input = {}) {
  const inferredSpatialMode = input.spatialMode === "location" || input.locationSelection || input.locationField || input.locationExpression
    ? "location"
    : "coordinates";
  return {
    version: 3,
    layerIndex: Number.isInteger(input.layerIndex) ? input.layerIndex : 0,
    spatialMode: inferredSpatialMode,
    latitudeSelection: input.latitudeSelection ?? (input.latitudeField ? `field:${encodeURIComponent(input.latitudeField)}` : ""),
    longitudeSelection: input.longitudeSelection ?? (input.longitudeField ? `field:${encodeURIComponent(input.longitudeField)}` : ""),
    locationSelection: input.locationSelection ?? (input.locationField ? `field:${encodeURIComponent(input.locationField)}` : input.locationExpression ? `expression:${encodeURIComponent(input.locationExpression)}` : ""),
    entityKey: String(input.entityKey ?? ""),
    properties: Array.isArray(input.properties) ? input.properties.map((item) => ({ field: String(item.field ?? ""), aggregation: String(item.aggregation ?? "only") })).filter((item) => item.field) : [],
    customProperties: Array.isArray(input.customProperties) ? input.customProperties.map((item) => ({ label: String(item.label ?? ""), expression: String(item.expression ?? "") })) : [],
    measures: Array.isArray(input.measures) ? input.measures.map((item) => ({ label: String(item.label ?? ""), expression: String(item.expression ?? "") })) : [],
    datasetName: String(input.datasetName ?? "qlik_points"),
    navigationLinks: !!input.navigationLinks,
    requireAllCoordinates: input.requireAllCoordinates !== false,
    skipNullEntities: input.skipNullEntities !== false,
    coordinateSourceField: String(input.coordinateSourceField ?? "coordinate_source"),
    coordinateSourceValue: String(input.coordinateSourceValue ?? "Qlik"),
    coordinateOverrides: String(input.coordinateOverrides ?? ""),
    virtualProxyPath: String(input.virtualProxyPath ?? ""),
    advancedMode: !!input.advancedMode
  };
}

export function savedConfigRoundTrip(input) {
  return normalizeSavedConfig(JSON.parse(JSON.stringify(normalizeSavedConfig(input))));
}
