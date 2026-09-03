import test from "node:test";
import assert from "node:assert/strict";
import { suggestEntityKeys } from "../src/app-inspector.js";

const fields = [
  { qName: "NOM_LOCAL", qCardinal: 568, qTags: [] },
  { qName: "COD_OBJETO_LOCAL", qCardinal: 614, qTags: ["$text"] },
  { qName: "NUM_LATITUDE_LOCAL", qCardinal: 613, qTags: ["$numeric"] },
  { qName: "NUM_LONGITUDE_LOCAL", qCardinal: 613, qTags: ["$numeric"] }
];

test("key suggestion favors key-like field near coordinate cardinality", () => {
  const result = suggestEntityKeys(fields, {
    latitudeField: "NUM_LATITUDE_LOCAL",
    longitudeField: "NUM_LONGITUDE_LOCAL"
  });
  assert.equal(result[0].field, "COD_OBJETO_LOCAL");
});
