import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = path.join(root, "browser", "qlik-geojson-extractor.js");
const targetDir = path.join(root, "chrome-extension", "core");
const target = path.join(targetDir, "qlik-geojson-extractor.js");
const codesSource = path.join(root, "src", "codes.js");
const codesTarget = path.join(root, "chrome-extension", "lib", "core-codes.js");

if (!fs.existsSync(source)) {
  throw new Error("Browser bundle not found. Run scripts/build-browser.mjs first.");
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
fs.copyFileSync(codesSource, codesTarget);
console.log(`Wrote ${path.relative(root, target)}`);
console.log(`Wrote ${path.relative(root, codesTarget)}`);
