import test from "node:test";
import assert from "node:assert/strict";
import { ERROR_CODES, DIAGNOSTIC_CODES, EVIDENCE_CODES } from "../src/codes.js";
import { ptBR, localizeCoreError, localizeDiagnostic, localizeEvidence } from "../chrome-extension/lib/i18n.js";

test("every structured core error has a pt-BR user-facing translation", () => {
  for (const code of Object.values(ERROR_CODES)) assert.equal(typeof ptBR.errors[code], "string", code);
});

test("every diagnostic and evidence code has a pt-BR translation", () => {
  for (const code of Object.values(DIAGNOSTIC_CODES)) assert.equal(typeof ptBR.diagnostics[code], "string", code);
  for (const code of Object.values(EVIDENCE_CODES)) assert.equal(typeof ptBR.evidence[code], "string", code);
});

test("localizers interpolate structured parameters in Portuguese", () => {
  assert.match(localizeCoreError({ code: ERROR_CODES.MISSING_COORDINATES, params: { count: 3 } }).message, /3 entidade/);
  assert.match(localizeDiagnostic({ code: DIAGNOSTIC_CODES.VISUAL_DIMENSION_LOWER_CARDINALITY, params: { field: "NAME", dimensionCardinality: 10, coordinateCardinality: 12 } }), /NAME.*10.*12/);
  assert.match(localizeEvidence({ code: EVIDENCE_CODES.SPATIAL_ONE_PAIR_RATIO, params: { onePair: 9, entityCount: 10 } }), /9 de 10/);
});
