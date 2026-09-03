import { qlikFieldRef } from "./utils.js";

function propertyExpression(definition) {
  if (typeof definition === "string") {
    return { field: definition, label: definition, expression: `Only(${qlikFieldRef(definition)})` };
  }
  if (definition.expression) {
    return { field: definition.field ?? definition.label, label: definition.label ?? definition.field, expression: definition.expression };
  }
  const field = definition.field;
  const label = definition.label ?? field;
  switch (definition.aggregation ?? "only") {
    case "only": return { field, label, expression: `Only(${qlikFieldRef(field)})` };
    case "concat": return { field, label, expression: `Concat(DISTINCT ${qlikFieldRef(field)}, ' | ')` };
    case "max": return { field, label, expression: `Max(${qlikFieldRef(field)})` };
    case "min": return { field, label, expression: `Min(${qlikFieldRef(field)})` };
    case "maxTimestamp": return { field, label, expression: `Timestamp(Max(${qlikFieldRef(field)}), '${definition.format ?? "YYYY-MM-DD hh:mm:ss"}')` };
    default: throw new Error(`Unsupported property aggregation: ${definition.aggregation}`);
  }
}

function normalizeMeasures(measures = []) {
  if (!Array.isArray(measures)) {
    return Object.entries(measures).map(([label, expression]) => ({ label, expression }));
  }
  return measures.map((m) => typeof m === "string" ? { label: m, expression: m } : m);
}

export function buildPointCubeDefinition(config) {
  const propertyDefs = (config.properties ?? []).map(propertyExpression);
  const attributeExpressions = [
    ...propertyDefs.map((p, i) => ({ qExpression: p.expression, qLabel: p.label, qNumFormat: { qType: "U" }, id: `__property_${i}` })),
    { qExpression: `Only(${qlikFieldRef(config.latitudeField)})`, qLabel: config.latitudeField, qNumFormat: { qType: "R", qnDec: 10, qUseThou: 0 }, id: "__latitude" },
    { qExpression: `Only(${qlikFieldRef(config.longitudeField)})`, qLabel: config.longitudeField, qNumFormat: { qType: "R", qnDec: 10, qUseThou: 0 }, id: "__longitude" }
  ];
  const measures = normalizeMeasures(config.measures);

  return {
    definition: {
      qInfo: { qType: config.qType ?? "qlik_geojson_extractor" },
      qHyperCubeDef: {
        qDimensions: [{
          qDef: {
            qFieldDefs: [config.entityKey],
            qFieldLabels: [config.entityKey],
            qSortCriterias: [{ qSortByAscii: 1, qSortByLoadOrder: 1 }]
          },
          qAttributeExpressions: attributeExpressions
        }],
        qMeasures: measures.map((m) => ({ qDef: { qDef: m.expression, qLabel: m.label } })),
        qInitialDataFetch: [],
        qReductionMode: "N",
        qMode: "S"
      }
    },
    propertyDefs,
    measures
  };
}

export async function createSessionCube(client, definition) {
  const result = await client.rpc(client.docHandle, "CreateSessionObject", [definition]);
  const handle = result?.qReturn?.qHandle;
  if (typeof handle !== "number") throw new Error("CreateSessionObject did not return a valid handle.");
  const layoutResult = await client.rpc(handle, "GetLayout", []);
  const hyperCube = layoutResult?.qLayout?.qHyperCube;
  if (!hyperCube) throw new Error("GetLayout did not return qHyperCube.");
  return { handle, hyperCube };
}

export async function fetchAllStraightCubeRows(client, handle, hyperCube, { maxCellsPerPage = 9000 } = {}) {
  const totalRows = hyperCube?.qSize?.qcy ?? 0;
  const width = hyperCube?.qSize?.qcx ?? 0;
  if (!width || !totalRows) return [];
  const pageHeight = Math.max(1, Math.floor(maxCellsPerPage / Math.max(1, width)));
  const rows = [];
  for (let top = 0; top < totalRows; top += pageHeight) {
    const height = Math.min(pageHeight, totalRows - top);
    const result = await client.rpc(handle, "GetHyperCubeData", ["/qHyperCubeDef", [{ qTop: top, qLeft: 0, qWidth: width, qHeight: height }]]);
    for (const page of result?.qDataPages ?? []) rows.push(...(page.qMatrix ?? []));
  }
  return rows;
}
