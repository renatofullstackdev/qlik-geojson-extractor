import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "chrome-extension/manifest.json");

test("manifest keeps Qlik hosts optional and limits permanent capabilities", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest.optional_host_permissions, ["https://*/*", "http://*/*"]);
  assert.equal("host_permissions" in manifest, false);
  assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "downloads", "scripting", "sidePanel", "storage"].sort());
});

test("all extension files referenced by the manifest exist", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const paths = [manifest.background.service_worker, manifest.side_panel.default_path];
  for (const relative of paths) await access(resolve(root, "chrome-extension", relative));
});
