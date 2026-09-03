import test from "node:test";
import assert from "node:assert/strict";
import { suggestEntityKeys } from "../src/app-inspector.js";
import { summarizePointLayers } from "../src/map-inspector.js";

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

test("PointLayer summary resolves simple Qlik expression field references", () => {
  const result = summarizePointLayers([{
    objectId: "map1",
    layerId: "layer1",
    layerIndex: 0,
    layer: {
      type: "PointLayer",
      isLatLong: true,
      locationOrLatitude: { key: "=LATITUDE" },
      longitude: { key: "=LONGITUDE" },
      qHyperCubeDef: {
        qDimensions: [{ qDef: { qFieldDefs: ["=[ENTITY NAME]"] } }],
        qMeasures: []
      }
    }
  }]);

  assert.equal(result[0].locationOrLatitude, "LATITUDE");
  assert.equal(result[0].longitude, "LONGITUDE");
  assert.deepEqual(result[0].visualDimensions, ["ENTITY NAME"]);
  assert.equal(result[0].locationOrLatitudeRaw, "=LATITUDE");
  assert.equal(result[0].longitudeRaw, "=LONGITUDE");
  assert.deepEqual(result[0].visualDimensionsRaw, ["=[ENTITY NAME]"]);
});
