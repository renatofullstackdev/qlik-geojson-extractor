import test from "node:test";
import assert from "node:assert/strict";
import { savedConfigRoundTrip } from "../chrome-extension/lib/config-state.js";

test("saved configuration survives a JSON round trip without losing effective choices", () => {
  const input = {
    layerIndex: 2,
    latitudeSelection: "field:LAT",
    longitudeSelection: "expression:Avg(%5BLON%5D)",
    entityKey: "ENTITY",
    properties: [{ field: "NAME", aggregation: "only" }],
    customProperties: [{ label: "X", expression: "Upper([NAME])" }],
    measures: [{ label: "COUNT", expression: "Count(ID)" }],
    datasetName: "points",
    navigationLinks: true,
    advancedMode: true
  };
  const result = savedConfigRoundTrip(input);
  assert.equal(result.layerIndex, 2);
  assert.equal(result.longitudeSelection, input.longitudeSelection);
  assert.deepEqual(result.properties, input.properties);
  assert.deepEqual(result.customProperties, input.customProperties);
  assert.deepEqual(result.measures, input.measures);
  assert.equal(result.advancedMode, true);
});


test("saved configuration preserves location-mode selections", () => {
  const input = { layerIndex: 1, spatialMode: "location", locationSelection: "field:GeoPoint", entityKey: "ENTITY" };
  const result = savedConfigRoundTrip(input);
  assert.equal(result.version, 3);
  assert.equal(result.spatialMode, "location");
  assert.equal(result.locationSelection, "field:GeoPoint");
});
