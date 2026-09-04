import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeName,
  numberOrNull,
  qlikFieldRef,
  qNumOrText,
  qTextOrNum,
  resolveSimpleQlikFieldReference,
  looksLikeQlikExpression,
  parseQlikPoint,
  validCoordinates
} from "../src/utils.js";

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

test("simple Qlik field references are resolved", () => {
  assert.equal(resolveSimpleQlikFieldReference("=LATITUDE"), "LATITUDE");
  assert.equal(resolveSimpleQlikFieldReference("=[ENTITY NAME]"), "ENTITY NAME");
  assert.equal(resolveSimpleQlikFieldReference("[ENTITY NAME]"), "ENTITY NAME");
  assert.equal(resolveSimpleQlikFieldReference("LONGITUDE"), "LONGITUDE");
});

test("complex Qlik expressions are not guessed as field references", () => {
  assert.equal(resolveSimpleQlikFieldReference("=Only([LATITUDE])"), null);
  assert.equal(resolveSimpleQlikFieldReference("=Sum([VALUE]) / Count([ID])"), null);
});

test("Qlik qIsNull cells are null even when qText contains '-'", () => {
  const value = { qText: "-", qNum: Number.NaN, qIsNull: true };
  assert.equal(qTextOrNum(value), null);
  assert.equal(qNumOrText(value), null);
});


test("expression detector recognizes function syntax without a leading equals sign", () => {
  assert.equal(looksLikeQlikExpression("maxstring([LOCATION])"), true);
  assert.equal(resolveSimpleQlikFieldReference("maxstring([LOCATION])"), null);
  assert.equal(resolveSimpleQlikFieldReference("Entity Label (TABLE)"), "Entity Label (TABLE)");
});

test("parseQlikPoint accepts only native Qlik [longitude, latitude] points", () => {
  assert.deepEqual(parseQlikPoint("[-48.1, -15.8]"), { longitude: -48.1, latitude: -15.8 });
  assert.deepEqual(parseQlikPoint([-48.1, -15.8]), { longitude: -48.1, latitude: -15.8 });
  assert.equal(parseQlikPoint("POINT(-48.1 -15.8)"), null);
  assert.equal(parseQlikPoint("Brasília"), null);
  assert.equal(parseQlikPoint("[-15.8, -148.1]"), null);
});
