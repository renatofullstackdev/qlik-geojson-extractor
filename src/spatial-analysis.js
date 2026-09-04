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
    return { available: false, reason: "complex-expression" };
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
    distinctPairs: numericCell(row[6])
  };
}

export async function analyzeEntityCandidate(client, candidateField, latitudeDefinition, longitudeDefinition) {
  if (latitudeDefinition?.kind !== "field" || longitudeDefinition?.kind !== "field") {
    return { available: false, reason: "complex-expression" };
  }
  const lat = latitudeDefinition.expression;
  const lon = longitudeDefinition.expression;
  const pair = expressionPair(lat, lon);
  const measures = [
    { label: "pairCount", expression: `Count(DISTINCT ${pair})` },
    { label: "latCount", expression: `Count(DISTINCT ${lat})` },
    { label: "lonCount", expression: `Count(DISTINCT ${lon})` }
  ];
  const { rows } = await runAnalysisCube(client, {
    dimensionField: candidateField,
    measures,
    qType: "qlik_geojson_entity_candidate_analysis"
  });

  let entityCount = 0;
  let onePair = 0;
  let multiplePairs = 0;
  let withoutCoordinates = 0;
  let maxPairs = 0;
  for (const row of rows) {
    const key = qTextOrNum(row[0]);
    if (key === null || key === "") continue;
    entityCount += 1;
    const pairCount = numericCell(row[1]) ?? 0;
    maxPairs = Math.max(maxPairs, pairCount);
    if (pairCount === 1) onePair += 1;
    else if (pairCount > 1) multiplePairs += 1;
    else withoutCoordinates += 1;
  }

  return {
    available: true,
    entityCount,
    onePair,
    multiplePairs,
    withoutCoordinates,
    onePairRatio: entityCount ? onePair / entityCount : 0,
    multiplePairRatio: entityCount ? multiplePairs / entityCount : 0,
    missingRatio: entityCount ? withoutCoordinates / entityCount : 0,
    maxPairs
  };
}

export function coordinateFieldExpression(field) {
  return qlikFieldRef(field);
}
