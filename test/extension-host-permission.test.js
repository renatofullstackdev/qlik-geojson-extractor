import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifestUrl = new URL("../chrome-extension/manifest.json", import.meta.url);
const serviceWorkerUrl = new URL("../chrome-extension/service-worker.js", import.meta.url);
const sidePanelUrl = new URL("../chrome-extension/sidepanel/app.js", import.meta.url);

test("manifest declares runtime-only HTTP/HTTPS host permissions", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.deepEqual(manifest.optional_host_permissions, ["https://*/*", "http://*/*"]);
  assert.equal("host_permissions" in manifest, false);
  assert.equal(manifest.permissions.includes("activeTab"), true);
  assert.equal(manifest.permissions.includes("scripting"), true);
});

test("toolbar action captures the invoked tab and opens the Side Panel explicitly", async () => {
  const source = await readFile(serviceWorkerUrl, "utf8");

  assert.match(source, /chrome\.action\.onClicked\.addListener/);
  assert.match(source, /chrome\.sidePanel\.open\(\{ tabId: tab\.id \}\)/);
  assert.match(source, /chrome\.storage\.session\.set/);
  assert.doesNotMatch(source, /openPanelOnActionClick:\s*true/);
});

test("Side Panel requests and verifies only the current host before injection", async () => {
  const source = await readFile(sidePanelUrl, "utf8");

  assert.match(source, /chrome\.permissions\.request\(\{ origins: \[currentHostPattern\] \}\)/);
  assert.match(source, /chrome\.permissions\.contains\(\{ origins: \[pattern\] \}\)/);
  assert.match(source, /chrome\.permissions\.remove\(\{ origins: \[currentHostPattern\] \}\)/);
  assert.match(source, /await requireCurrentHostAccess\(granted\)/);
  assert.match(source, /world: "MAIN"/);
});


test("Side Panel always injects the extension-owned core before a Qlik command", async () => {
  const source = await readFile(sidePanelUrl, "utf8");

  assert.match(source, /Always inject the extension-owned bundle/);
  assert.match(source, /files: \["core\/qlik-geojson-extractor\.js"\]/);
  assert.doesNotMatch(source, /if \(check\?\.\[0\]\?\.result\) return/);
});
