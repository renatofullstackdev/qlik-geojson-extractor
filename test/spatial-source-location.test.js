import test from "node:test";
import assert from "node:assert/strict";
import { analyzeEntityCandidate, analyzeLocationField } from "../src/spatial-analysis.js";
import { QlikGeoJSONExtractor } from "../src/extractor.js";

function cell(qText, qNum) { return { qText, qNum, qIsNull: false }; }

class AnalysisClient {
  constructor() { this.docHandle = 1; this.nextHandle = 10; this.types = new Map(); }
  async rpc(handle, method, params = []) {
    if (method === "CreateSessionObject") {
      const h = this.nextHandle++;
      this.types.set(h, params[0]);
      return { qReturn: { qHandle: h } };
    }
    if (method === "GetLayout") {
      const def = this.types.get(handle);
      const qcy = def.qInfo.qType === "qlik_geojson_location_analysis" ? 1 : 3;
      const qcx = def.qInfo.qType === "qlik_geojson_location_analysis" ? 1 : 2;
      return { qLayout: { qHyperCube: { qSize: { qcy, qcx } } } };
    }
    if (method === "GetHyperCubeData") {
      const def = this.types.get(handle);
      if (def.qInfo.qType === "qlik_geojson_location_analysis") {
        return { qDataPages: [{ qMatrix: [[cell("3", 3)]] }] };
      }
      return { qDataPages: [{ qMatrix: [
        [cell("A", Number.NaN), cell("1", 1)],
        [cell("B", Number.NaN), cell("1", 1)],
        [cell("C", Number.NaN), cell("2", 2)]
      ] }] };
    }
    throw new Error(`unexpected ${method}`);
  }
}

test("location spatial analysis counts representations without requiring latitude/longitude", async () => {
  const client = new AnalysisClient();
  const source = { type: "location", locationDefinition: { kind: "field", field: "LOCATION", expression: "[LOCATION]" } };
  const stats = await analyzeLocationField(client, source.locationDefinition);
  assert.equal(stats.available, true);
  assert.equal(stats.distinctRepresentations, 3);
  const profile = await analyzeEntityCandidate(client, "ENTITY", source);
  assert.equal(profile.entityCount, 3);
  assert.equal(profile.oneRepresentation, 2);
  assert.equal(profile.multipleRepresentations, 1);
  assert.equal(profile.withoutSpatial, 0);
});

class InspectLocationExpressionClient {
  constructor() { this.docHandle = 1; this.nextHandle = 20; this.handleTypes = new Map(); }
  async connectAndOpen() { return { docHandle: 1 }; }
  close() {}
  async rpc(handle, method, params = []) {
    if (method === "GetObject") return { qReturn: { qHandle: 2 } };
    if (method === "GetFullPropertyTree") return { qPropEntry: {
      qProperty: { qInfo: { qId: "map" }, gaLayers: [{
        type: "PointLayer", id: "layer", isLatLong: false,
        locationOrLatitude: { key: "maxstring([LOCATION_VALUE])" },
        longitude: { key: "=LEGACY_LONGITUDE" },
        qHyperCubeDef: { qDimensions: [{ qDef: { qFieldDefs: ["=[DISPLAY_NAME]"] } }], qMeasures: [] }
      }] }, qChildren: []
    } };
    if (method === "CreateSessionObject") {
      const def = params[0];
      const h = this.nextHandle++;
      this.handleTypes.set(h, def.qInfo.qType);
      return { qReturn: { qHandle: h } };
    }
    if (method === "GetLayout") {
      if (this.handleTypes.get(handle) === "qlik_geojson_field_list") return { qLayout: { qFieldList: { qItems: [
        { qName: "DISPLAY_NAME", qCardinal: 102, qTags: [], qSrcTables: ["ENTITY_TABLE"] },
        { qName: "ENTITY_CODE", qCardinal: 102, qTags: ["$key"], qSrcTables: ["ENTITY_TABLE"] },
        { qName: "LOCATION_VALUE", qCardinal: 103, qTags: ["$geopoint"], qSrcTables: ["ENTITY_TABLE"] },
        { qName: "CONSTANT_FLAG", qCardinal: 1, qTags: [], qSrcTables: ["OTHER"] },
        { qName: "LEGACY_LONGITUDE", qCardinal: 1, qTags: ["$numeric"], qSrcTables: ["OTHER"] }
      ] } } };
    }
    throw new Error(`unexpected ${method}`);
  }
}

test("location expression mode does not invent coordinate statistics or high-confidence constant keys", async () => {
  const extractor = new QlikGeoJSONExtractor({}, { client: new InspectLocationExpressionClient() });
  const report = await extractor.inspect({ appId: "APP", sheetId: "SHEET", candidateAnalysisLimit: 5 });
  const layer = report.pointLayers[0];
  assert.equal(layer.spatialMode, "location");
  assert.equal(layer.locationDefinition.kind, "expression");
  assert.equal(layer.latitudeDefinition, null);
  assert.equal(layer.longitudeDefinition, null);
  assert.equal(report.diagnostics[0].spatialStats.available, false);
  const constant = report.entityKeySuggestions[0].candidates.find((item) => item.field === "CONSTANT_FLAG");
  if (constant) assert.equal(constant.confidence, "unknown");
  assert.notEqual(report.entityKeySuggestions[0].candidates[0]?.field, "CONSTANT_FLAG");
});
