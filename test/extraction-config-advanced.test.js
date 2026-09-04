import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBulkAggregation,
  decodeCoordinateSelection,
  encodeCoordinateSelection,
  fieldsMatchingQuery,
  locationFieldGroups,
  relatedFields
} from "../chrome-extension/lib/extraction-config.js";

test("coordinate selections preserve direct fields and Qlik expressions", () => {
  const field = encodeCoordinateSelection({ kind: "field", field: "LAT" });
  const expression = encodeCoordinateSelection({ kind: "expression", expression: "Avg([LAT])" });
  assert.deepEqual(decodeCoordinateSelection(field), { field: "LAT", expression: null });
  assert.deepEqual(decodeCoordinateSelection(expression), { field: null, expression: "Avg([LAT])" });
});

test("bulk aggregation updates all selected fields without changing the selection set", () => {
  const result = applyBulkAggregation(new Map([["A", "only"], ["B", "min"]]), "concat");
  assert.deepEqual([...result.entries()], [["A", "concat"], ["B", "concat"]]);
});

test("field filtering searches both field names and source tables", () => {
  const fields = [
    { name: "ADDRESS", sourceTables: ["PLACES"] },
    { name: "NAME", sourceTables: ["PEOPLE"] }
  ];
  assert.deepEqual(fieldsMatchingQuery(fields, "place").map((x) => x.name), ["ADDRESS"]);
});

test("relatedFields selects fields sharing source tables with entity or coordinate anchors", () => {
  const fields = [
    { name: "ENTITY", sourceTables: ["PLACES"] },
    { name: "LAT", sourceTables: ["PLACES"] },
    { name: "NAME", sourceTables: ["PLACES"] },
    { name: "UNRELATED", sourceTables: ["OTHER"] }
  ];
  assert.deepEqual(relatedFields(fields, "ENTITY", "LAT", null).map((x) => x.name), ["ENTITY", "LAT", "NAME"]);
});

import { buildDiagnosticReport } from "../chrome-extension/lib/extraction-config.js";

test("diagnostic report separates audit metadata from extracted feature values", () => {
  const report = buildDiagnosticReport({
    inspectionReport: {
      appId: "APP", sheetId: "SHEET",
      pointLayers: [{ objectId: "map", layerId: "layer", layerIndex: 0 }],
      diagnostics: [{ coordinateStats: { available: true, distinctPairs: 2 }, warnings: [] }],
      entityKeySuggestions: [{ candidates: [{ field: "ENTITY", confidence: "high", evidence: [] }] }]
    },
    layerIndex: 0,
    config: { appId: "APP", entityKey: "ENTITY" },
    result: { rowCount: 2, featureCount: 2, uniqueKeys: 2, missing: [], skippedNullEntityCount: 0, appliedOverrides: [], validation: { valid: true } }
  });
  assert.equal(report.entityKey, "ENTITY");
  assert.equal(report.extraction.featureCount, 2);
  assert.equal("featureCollection" in report.extraction, false);
});


test("locationFieldGroups prioritizes referenced and geospatial fields without requiring numeric tags", () => {
  const fields = [
    { name: "LOCATION", cardinality: 10, tags: ["$geopoint"], sourceTables: ["PLACES"] },
    { name: "DISPLAY", cardinality: 10, tags: [], sourceTables: ["PLACES"] },
    { name: "OTHER", cardinality: 100, tags: ["$numeric"], sourceTables: ["OTHER"] }
  ];
  const groups = locationFieldGroups(fields, "", ["DISPLAY"]);
  assert.deepEqual(groups.referenced.map((x) => x.name), ["DISPLAY"]);
  assert.deepEqual(groups.geo.map((x) => x.name), ["LOCATION"]);
  assert.deepEqual(groups.other.map((x) => x.name), ["OTHER"]);
});
