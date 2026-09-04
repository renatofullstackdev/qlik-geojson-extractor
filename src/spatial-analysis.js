import { qlikFieldRef, qNumOrText, qTextOrNum, numberOrNull } from "./utils.js";
import { createSessionCube, fetchAllStraightCubeRows } from "./hypercube.js";

function numericCell(cell) {
  return numberOrNull(qNumOrText(cell));
}

function expressionPair(latitudeExpression, longitudeExpression) {
  return `((${latitudeExpression}) & '|' & (${longitudeExpression}))`;
}

async function runAnalysisCube(client, { dimensionField = null, measures, qType }) {
  const definition = {
    qInfo: { qType },
    qHyperCubeDef: {
      qDimensions: dimensionField ? [{ qDef: { qFieldDefs: [dimensionField], qFieldLabels: [dimensionField] } }] : [],
      qMeasures: measures.map(({ label, expression }) => ({ qDef: { qDef: expression, qLabel: label } })),
      qInitialDataFetch: [],
      qReductionMode: "N",
      qMode: "S"
    }
  };
  const { handle, hyperCube } = await createSessionCube(client, definition);
  const rows = await fetchAllStraightCubeRows(client, handle, hyperCube, { maxCellsPerPage: 9000 });
  return { rows, hyperCube };
}

export async function analyzeCoordinateFields(client, latitudeDefinition, longitudeDefinition) {
  if (latitudeDefinition?.kind !== "field" || longitudeDefinition?.kind !== "field") {
    return { available: false, type: "coordinates", reason: "complex-expression" };
  }
  const lat = latitudeDefinition.expression;
  const lon = longitudeDefinition.expression;
  const pair = expressionPair(lat, lon);
  const measures = [
    { label: "latMin", expression: `Min(${lat})` },
    { label: "latMax", expression: `Max(${lat})` },
    { label: "latDistinct", expression: `Count(DISTINCT ${lat})` },
    { label: "lonMin", expression: `Min(${lon})` },
    { label: "lonMax", expression: `Max(${lon})` },
    { label: "lonDistinct", expression: `Count(DISTINCT ${lon})` },
    { label: "pairDistinct", expression: `Count(DISTINCT ${pair})` }
  ];
  const { rows } = await runAnalysisCube(client, { measures, qType: "qlik_geojson_coordinate_analysis" });
  const row = rows[0] ?? [];
  return {
    available: true,
    type: "coordinates",
    latitude: {
      min: numericCell(row[0]),
      max: numericCell(row[1]),
      distinct: numericCell(row[2])
    },
    longitude: {
      min: numericCell(row[3]),
      max: numericCell(row[4]),
      distinct: numericCell(row[5])
    },
    distinctPairs: numericCell(row[6]),
    distinctRepresentations: numericCell(row[6])
  };
}

export async function analyzeLocationField(client, locationDefinition) {
  if (locationDefinition?.kind !== "field") {
    return { available: false, type: "location", reason: "complex-expression" };
  }
  const location = locationDefinition.expression;
  const { rows } = await runAnalysisCube(client, {
    measures: [{ label: "locationDistinct", expression: `Count(DISTINCT ${location})` }],
    qType: "qlik_geojson_location_analysis"
  });
  const distinctRepresentations = numericCell(rows[0]?.[0]);
  return {
    available: true,
    type: "location",
    distinctLocations: distinctRepresentations,
    distinctRepresentations
  };
}

export async function analyzeSpatialSource(client, spatialSource) {
  if (spatialSource?.type === "coordinates") {
    return analyzeCoordinateFields(client, spatialSource.latitudeDefinition, spatialSource.longitudeDefinition);
  }
  if (spatialSource?.type === "location") {
    return analyzeLocationField(client, spatialSource.locationDefinition);
  }
  return { available: false, type: spatialSource?.type ?? "unknown", reason: "unknown-spatial-source" };
}

function profileFromRows(rows, representationIndex) {
  let entityCount = 0;
  let oneRepresentation = 0;
  let multipleRepresentations = 0;
  let withoutSpatial = 0;
  let maxRepresentations = 0;

  for (const row of rows) {
    const key = qTextOrNum(row[0]);
    if (key === null || key === "") continue;
    entityCount += 1;
    const count = numericCell(row[representationIndex]) ?? 0;
    maxRepresentations = Math.max(maxRepresentations, count);
    if (count === 1) oneRepresentation += 1;
    else if (count > 1) multipleRepresentations += 1;
    else withoutSpatial += 1;
  }

  return {
    available: true,
    entityCount,
    oneRepresentation,
    multipleRepresentations,
    withoutSpatial,
    oneRepresentationRatio: entityCount ? oneRepresentation / entityCount : 0,
    multipleRepresentationRatio: entityCount ? multipleRepresentations / entityCount : 0,
    missingRatio: entityCount ? withoutSpatial / entityCount : 0,
    maxRepresentations
  };
}

export async function analyzeEntityCandidate(client, candidateField, spatialSourceOrLatitude, legacyLongitudeDefinition = null) {
  // Backward-compatible signature: (client, field, latitudeDefinition, longitudeDefinition)
  const spatialSource = spatialSourceOrLatitude?.type
    ? spatialSourceOrLatitude
    : { type: "coordinates", latitudeDefinition: spatialSourceOrLatitude, longitudeDefinition: legacyLongitudeDefinition };

  if (spatialSource.type === "coordinates") {
    const { latitudeDefinition, longitudeDefinition } = spatialSource;
    if (latitudeDefinition?.kind !== "field" || longitudeDefinition?.kind !== "field") {
      return { available: false, type: "coordinates", reason: "complex-expression" };
    }
    const lat = latitudeDefinition.expression;
    const lon = longitudeDefinition.expression;
    const pair = expressionPair(lat, lon);
    const measures = [
      { label: "representationCount", expression: `Count(DISTINCT ${pair})` },
      { label: "latCount", expression: `Count(DISTINCT ${lat})` },
      { label: "lonCount", expression: `Count(DISTINCT ${lon})` }
    ];
    const { rows } = await runAnalysisCube(client, {
      dimensionField: candidateField,
      measures,
      qType: "qlik_geojson_entity_candidate_analysis"
    });
    const profile = profileFromRows(rows, 1);
    return {
      ...profile,
      type: "coordinates",
      // Compatibility aliases used by older consumers.
      onePair: profile.oneRepresentation,
      multiplePairs: profile.multipleRepresentations,
      withoutCoordinates: profile.withoutSpatial,
      onePairRatio: profile.oneRepresentationRatio,
      multiplePairRatio: profile.multipleRepresentationRatio,
      maxPairs: profile.maxRepresentations
    };
  }

  if (spatialSource.type === "location") {
    const definition = spatialSource.locationDefinition;
    if (definition?.kind !== "field") {
      return { available: false, type: "location", reason: "complex-expression" };
    }
    const location = definition.expression ?? qlikFieldRef(definition.field);
    const { rows } = await runAnalysisCube(client, {
      dimensionField: candidateField,
      measures: [{ label: "representationCount", expression: `Count(DISTINCT ${location})` }],
      qType: "qlik_geojson_entity_candidate_location_analysis"
    });
    return { ...profileFromRows(rows, 1), type: "location" };
  }

  return { available: false, type: spatialSource.type ?? "unknown", reason: "unknown-spatial-source" };
}

export function spatialSourceFields(spatialSource) {
  const definitions = spatialSource?.type === "coordinates"
    ? [spatialSource.latitudeDefinition, spatialSource.longitudeDefinition]
    : spatialSource?.type === "location"
      ? [spatialSource.locationDefinition]
      : [];
  const output = [];
  for (const definition of definitions) {
    if (definition?.field && !output.includes(definition.field)) output.push(definition.field);
    for (const field of definition?.referencedFields ?? []) if (!output.includes(field)) output.push(field);
  }
  return output;
}

export function coordinateFieldExpression(field) {
  return qlikFieldRef(field);
}
