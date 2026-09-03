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

function cell(qText, qNum, attrs = []) {
  return { qText, qNum, qAttrExps: { qValues: attrs } };
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

test("GeoJSON validator accepts valid point collection", () => {
  const result = validatePointGeoJSON({
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-48.1, -15.8] }, properties: {} }]
  });
  assert.equal(result.valid, true);
});
