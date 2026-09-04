import test from "node:test";
import assert from "node:assert/strict";
import { coordinateWarnings } from "../src/extractor.js";
import { DIAGNOSTIC_CODES } from "../src/codes.js";

test("coordinate diagnostics flag invalid WGS84 ranges and a swap that would repair them", () => {
  const warnings = coordinateWarnings({
    latitudeDefinition: { kind: "field", field: "LAT" },
    longitudeDefinition: { kind: "field", field: "LON" }
  }, {
    available: true,
    latitude: { min: -120, max: -110, distinct: 3 },
    longitude: { min: -20, max: -10, distinct: 3 },
    distinctPairs: 3
  });
  assert.ok(warnings.some((item) => item.code === DIAGNOSTIC_CODES.COORDINATE_RANGE_INVALID));
  assert.ok(warnings.some((item) => item.code === DIAGNOSTIC_CODES.COORDINATE_SWAP_LIKELY));
});

test("complex coordinate expressions are preserved but receive an explicit diagnostic", () => {
  const warnings = coordinateWarnings({
    latitudeDefinition: { kind: "expression", raw: "=Avg([LAT])" },
    longitudeDefinition: { kind: "field", field: "LON" }
  }, { available: false, reason: "complex-expression" });
  assert.equal(warnings[0].code, DIAGNOSTIC_CODES.COORDINATE_COMPLEX_EXPRESSION);
  assert.ok(warnings.some((item) => item.code === DIAGNOSTIC_CODES.COORDINATE_STATS_UNAVAILABLE));
});
