import test from "node:test";
import assert from "node:assert/strict";
import { numberOrNull, validCoordinates, qlikFieldRef, normalizeName } from "../src/utils.js";

 test("numberOrNull supports Brazilian decimal comma", () => {
  assert.equal(numberOrNull("-15,83328021"), -15.83328021);
});

test("validCoordinates accepts DF point", () => {
  assert.equal(validCoordinates(-48.13200421, -15.83328021), true);
});

test("validCoordinates rejects swapped/out-of-range latitude", () => {
  assert.equal(validCoordinates(-15.8, -148.1), false);
});

test("qlikFieldRef brackets field names", () => {
  assert.equal(qlikFieldRef("NOM LOCAL"), "[NOM LOCAL]");
});

test("normalizeName removes accents and punctuation", () => {
  assert.equal(normalizeName("Região Administrativa"), "REGIAO_ADMINISTRATIVA");
});
