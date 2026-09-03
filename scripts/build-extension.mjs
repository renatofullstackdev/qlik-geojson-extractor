import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = path.join(root, "browser", "qlik-geojson-extractor.js");
const targetDir = path.join(root, "chrome-extension", "core");
const target = path.join(targetDir, "qlik-geojson-extractor.js");

if (!fs.existsSync(source)) {
  throw new Error("Browser bundle not found. Run scripts/build-browser.mjs first.");
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`Wrote ${path.relative(root, target)}`);
