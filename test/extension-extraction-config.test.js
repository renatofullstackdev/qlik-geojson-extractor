import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPropertyDefinitions,
  coordinateFieldGroups,
  extractionHealth
} from "../chrome-extension/lib/extraction-config.js";

test("buildPropertyDefinitions preserves direct aggregations and custom expressions", () => {
  const properties = buildPropertyDefinitions(
    [["NAME", "only"], ["SECTOR", "concat"]],
    [{ label: "TOPICS", expression: "Concat(Distinct [TOPIC], ', ')" }]
  );

  assert.deepEqual(properties, [
    { field: "NAME", aggregation: "only" },
    { field: "SECTOR", aggregation: "concat" },
    { label: "TOPICS", expression: "Concat(Distinct [TOPIC], ', ')" }
  ]);
});

test("buildPropertyDefinitions rejects incomplete and duplicate custom properties", () => {
  assert.throws(
    () => buildPropertyDefinitions([], [{ label: "X", expression: "" }]),
    /rótulo e expressão/i
  );
  assert.throws(
    () => buildPropertyDefinitions([["NAME", "only"]], [{ label: "NAME", expression: "Upper([NAME])" }]),
    /duplicado/i
  );
});

test("extractionHealth blocks empty GeoJSON when real entities lost coordinates", () => {
  const health = extractionHealth({
    rowCount: 18,
    featureCount: 0,
    uniqueKeys: 17,
    missing: Array.from({ length: 17 }, () => ({})),
    skippedNullEntityCount: 1
  });

  assert.equal(health.level, "error");
  assert.equal(health.allowDownload, false);
  assert.match(health.message, /Nenhuma feição/i);
});

test("extractionHealth allows complete and partial non-empty results with distinct status", () => {
  const complete = extractionHealth({ rowCount: 17, featureCount: 17, uniqueKeys: 17, missing: [] });
  assert.equal(complete.level, "success");
  assert.equal(complete.allowDownload, true);

  const partial = extractionHealth({ rowCount: 17, featureCount: 16, uniqueKeys: 17, missing: [{}] });
  assert.equal(partial.level, "warning");
  assert.equal(partial.allowDownload, true);
});

test("coordinateFieldGroups prioritizes the detected field and numeric fields", () => {
  const groups = coordinateFieldGroups([
    { name: "NAME", cardinality: 17, tags: ["$text"] },
    { name: "LAT", cardinality: 17, tags: ["$numeric"] },
    { name: "OTHER_NUM", cardinality: 9, tags: ["$numeric"] }
  ], "LAT");

  assert.equal(groups.detected.name, "LAT");
  assert.deepEqual(groups.numeric.map((field) => field.name), ["OTHER_NUM"]);
  assert.deepEqual(groups.other.map((field) => field.name), ["NAME"]);
});
