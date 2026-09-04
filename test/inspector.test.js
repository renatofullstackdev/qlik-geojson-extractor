import test from "node:test";
import assert from "node:assert/strict";
import { scoreEntityCandidate, suggestEntityKeys } from "../src/app-inspector.js";
import { coordinateDefinition, summarizePointLayers } from "../src/map-inspector.js";

const fields = [
  { qName: "DISPLAY_NAME", qCardinal: 568, qTags: [], qSrcTables: ["PLACES"] },
  { qName: "ENTITY_ID", qCardinal: 614, qTags: ["$key"], qSrcTables: ["PLACES"] },
  { qName: "LAT", qCardinal: 613, qTags: ["$numeric"], qSrcTables: ["PLACES"] },
  { qName: "LON", qCardinal: 613, qTags: ["$numeric"], qSrcTables: ["PLACES"] }
];

test("spatial one-pair evidence outranks a display dimension that aggregates multiple coordinates", () => {
  const result = suggestEntityKeys(fields, {
    latitudeField: "LAT",
    longitudeField: "LON",
    coordinateCardinality: 613,
    visualDimensions: ["DISPLAY_NAME"],
    spatialProfiles: {
      DISPLAY_NAME: { available: true, entityCount: 568, onePair: 530, multiplePairs: 38, withoutCoordinates: 0, onePairRatio: 530/568, multiplePairRatio: 38/568, missingRatio: 0 },
      ENTITY_ID: { available: true, entityCount: 614, onePair: 613, multiplePairs: 0, withoutCoordinates: 1, onePairRatio: 613/614, multiplePairRatio: 0, missingRatio: 1/614 }
    }
  });
  assert.equal(result[0].field, "ENTITY_ID");
  assert.equal(result[0].confidence, "high");
  assert.equal(result.find((x) => x.field === "DISPLAY_NAME").confidence, "low");
});

test("syntactic $key evidence alone has low weight compared with spatial behavior", () => {
  const candidate = scoreEntityCandidate({ qName: "CATEGORY_ID", qCardinal: 17, qTags: ["$key"], qSrcTables: ["OTHER"] }, {
    coordinateCardinality: 17,
    visualDimensions: [],
    coordinateFields: fields.slice(2),
    spatialProfile: { available: true, entityCount: 17, onePair: 0, multiplePairs: 17, withoutCoordinates: 0, onePairRatio: 0, multiplePairRatio: 1, missingRatio: 0 }
  });
  assert.equal(candidate.confidence, "low");
  assert.ok(candidate.score < 0);
});

test("PointLayer summary resolves simple references and preserves complex coordinate expressions", () => {
  const result = summarizePointLayers([{
    objectId: "map1",
    layerId: "layer1",
    layerIndex: 0,
    layer: {
      type: "PointLayer",
      isLatLong: true,
      locationOrLatitude: { key: "=LATITUDE" },
      longitude: { key: "=Avg([LONGITUDE])" },
      qHyperCubeDef: { qDimensions: [{ qDef: { qFieldDefs: ["=[ENTITY NAME]"] } }], qMeasures: [] }
    }
  }]);
  assert.equal(result[0].latitudeDefinition.kind, "field");
  assert.equal(result[0].latitudeDefinition.field, "LATITUDE");
  assert.equal(result[0].longitudeDefinition.kind, "expression");
  assert.equal(result[0].longitudeDefinition.expression, "Avg([LONGITUDE])");
  assert.deepEqual(result[0].visualDimensions, ["ENTITY NAME"]);
});

test("coordinateDefinition never guesses a complex Qlik expression as a field", () => {
  assert.deepEqual(coordinateDefinition("=Only([LAT])"), { kind: "expression", raw: "=Only([LAT])", field: null, expression: "Only([LAT])" });
});
