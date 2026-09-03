import test from "node:test";
import assert from "node:assert/strict";
import { rowsToPointGeoJSON, validatePointGeoJSON } from "../src/geojson.js";

const hyperCube = {
  qDimensionInfo: [{
    qAttrExprInfo: [
      { id: "__property_0" },
      { id: "__latitude" },
      { id: "__longitude" }
    ]
  }]
};

function cell(qText, qNum, attrs = [], qIsNull = false) {
  return { qText, qNum, qIsNull, qAttrExps: { qValues: attrs } };
}

test("coordinate override fills a missing point and records provenance", () => {
  const rows = [[
    cell("k1", Number.NaN, [
      cell("EXPECTED NAME", Number.NaN),
      cell("", Number.NaN),
      cell("", Number.NaN)
    ])
  ]];
  const config = {
    name: "test",
    entityKey: "ID",
    coordinateSourceField: "origin",
    coordinateOverrides: {
      k1: {
        latitude: -15.83328021,
        longitude: -48.13200421,
        source: "manual",
        expected: { field: "NAME", value: "EXPECTED NAME" }
      }
    }
  };
  const result = rowsToPointGeoJSON(rows, hyperCube, config, [{ label: "NAME" }], []);
  assert.equal(result.featureCollection.features.length, 1);
  assert.equal(result.featureCollection.features[0].properties.origin, "manual");
  assert.deepEqual(result.featureCollection.features[0].geometry.coordinates, [-48.13200421, -15.83328021]);
  assert.equal(result.missing.length, 0);
});

test("coordinate override guard fails when entity identity changed", () => {
  const rows = [[
    cell("k1", Number.NaN, [
      cell("OTHER NAME", Number.NaN),
      cell("", Number.NaN),
      cell("", Number.NaN)
    ])
  ]];
  assert.throws(() => rowsToPointGeoJSON(rows, hyperCube, {
    entityKey: "ID",
    coordinateOverrides: {
      k1: {
        latitude: -15.8,
        longitude: -48.1,
        expected: { field: "NAME", value: "EXPECTED NAME" }
      }
    }
  }, [{ label: "NAME" }], []), /expected NAME=EXPECTED NAME/);
});

test("Qlik null entity rows are skipped by default instead of reported as missing coordinates", () => {
  const rows = [
    [cell("-", Number.NaN, [], true)],
    [cell("ENTITY A", Number.NaN, [
      cell("", Number.NaN),
      cell("-15.8720726", -15.8720726),
      cell("-48.0144999", -48.0144999)
    ])]
  ];

  const result = rowsToPointGeoJSON(rows, hyperCube, { entityKey: "ENTITY_NAME" }, [], []);

  assert.equal(result.featureCollection.features.length, 1);
  assert.equal(result.missing.length, 0);
  assert.equal(result.skippedNullEntityCount, 1);
  assert.deepEqual(result.skippedNullEntities, [{ rowIndex: 0, displayText: "-" }]);
});

test("null entity rows can be made fatal explicitly", () => {
  const rows = [[cell("-", Number.NaN, [], true)]];
  assert.throws(() => rowsToPointGeoJSON(rows, hyperCube, {
    entityKey: "ENTITY_NAME",
    skipNullEntities: false
  }, [], []), /null entity key/);
});

test("GeoJSON validator accepts valid point collection", () => {
  const result = validatePointGeoJSON({
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-48.1, -15.8] }, properties: {} }]
  });
  assert.equal(result.valid, true);
});
