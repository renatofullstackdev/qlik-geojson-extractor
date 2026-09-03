import test from "node:test";
import assert from "node:assert/strict";
import { configStorageKey, hostPermissionPattern, parseQlikSenseUrl, safeFilename } from "../chrome-extension/lib/qlik-url.js";

test("parseQlikSenseUrl extracts app, sheet and no virtual proxy", () => {
  const result = parseQlikSenseUrl(
    "https://example.test/sense/app/APP_GUID/sheet/SHEET_ID/state/analysis"
  );

  assert.deepEqual(result, {
    isQlikSheet: true,
    origin: "https://example.test",
    host: "example.test",
    appId: "APP_GUID",
    sheetId: "SHEET_ID",
    virtualProxyPath: ""
  });
});

test("parseQlikSenseUrl extracts a virtual proxy path", () => {
  const result = parseQlikSenseUrl(
    "https://example.test/finance/sense/app/APP%20NAME/sheet/SHEET%201/state/analysis"
  );

  assert.equal(result.isQlikSheet, true);
  assert.equal(result.virtualProxyPath, "/finance");
  assert.equal(result.appId, "APP NAME");
  assert.equal(result.sheetId, "SHEET 1");
});

test("parseQlikSenseUrl does not invent IDs for unrelated URLs", () => {
  const result = parseQlikSenseUrl("https://example.test/some/page");
  assert.equal(result.isQlikSheet, false);
  assert.equal(result.appId, null);
  assert.equal(result.sheetId, null);
});

test("configStorageKey scopes configuration by origin, app and sheet", () => {
  assert.equal(
    configStorageKey({ origin: "https://example.test", appId: "APP", sheetId: "SHEET" }),
    "qlik-geojson-extractor:v1:https://example.test:APP:SHEET"
  );
  assert.equal(configStorageKey({ origin: null, appId: "APP", sheetId: "SHEET" }), null);
});

test("safeFilename removes path-unsafe characters without losing the useful name", () => {
  assert.equal(safeFilename("Locais de votação / TRE-DF"), "Locais_de_votacao_TRE-DF");
  assert.equal(safeFilename("  "), "qlik_points");
});


test("hostPermissionPattern narrows runtime access to one HTTP/HTTPS hostname", () => {
  assert.equal(
    hostPermissionPattern("https://example.test:8443/sense/app/A/sheet/S"),
    "https://example.test/*"
  );
  assert.equal(hostPermissionPattern("http://127.0.0.1:4848/sense/app/A/sheet/S"), "http://127.0.0.1/*");
  assert.equal(hostPermissionPattern("chrome://extensions"), null);
  assert.equal(hostPermissionPattern("not a url"), null);
});
