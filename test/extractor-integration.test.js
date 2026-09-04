import test from "node:test";
import assert from "node:assert/strict";
import { QlikGeoJSONExtractor } from "../src/extractor.js";
import { DIAGNOSTIC_CODES, ERROR_CODES } from "../src/codes.js";

function cell(qText, qNum, attrs = [], qIsNull = false) {
  return { qText, qNum, qIsNull, qAttrExps: { qValues: attrs } };
}

class ExtractClient {
  constructor(rows) { this.rows = rows; this.docHandle = 1; this.closed = false; }
  async connectAndOpen() { this.docHandle = 1; return { docHandle: 1 }; }
  close() { this.closed = true; }
  async rpc(handle, method) {
    if (method === "CreateSessionObject") return { qReturn: { qHandle: 10 } };
    if (method === "GetLayout") return { qLayout: { qHyperCube: {
      qSize: { qcy: this.rows.length, qcx: 1 },
      qDimensionInfo: [{ qAttrExprInfo: [{ id: "__latitude" }, { id: "__longitude" }] }]
    } } };
    if (method === "GetHyperCubeData") return { qDataPages: [{ qMatrix: this.rows }] };
    throw new Error(`unexpected ${method}`);
  }
}

test("extract orchestrates hypercube conversion, null skipping and validation end-to-end", async () => {
  const rows = [
    [cell("A", NaN, [cell("-15.8", -15.8), cell("-48.1", -48.1)])],
    [cell("-", NaN, [], true)]
  ];
  const client = new ExtractClient(rows);
  const extractor = new QlikGeoJSONExtractor({}, { client });
  const result = await extractor.extract({ appId: "APP", entityKey: "ENTITY", latitudeField: "LAT", longitudeField: "LON" });
  assert.equal(result.rowCount, 2);
  assert.equal(result.featureCount, 1);
  assert.equal(result.skippedNullEntityCount, 1);
  assert.equal(result.validation.valid, true);
  assert.equal(client.closed, true);
});

test("extract raises a structured missing-coordinate error when completeness is required", async () => {
  const rows = [[cell("A", NaN, [cell("", NaN), cell("", NaN)])]];
  const extractor = new QlikGeoJSONExtractor({}, { client: new ExtractClient(rows) });
  await assert.rejects(
    () => extractor.extract({ appId: "APP", entityKey: "ENTITY", latitudeField: "LAT", longitudeField: "LON", requireAllCoordinates: true }),
    (error) => error.code === ERROR_CODES.MISSING_COORDINATES && error.missing.length === 1
  );
});

class InspectClient {
  constructor() { this.docHandle = 1; this.nextHandle = 20; this.handleTypes = new Map(); this.closed = false; }
  async connectAndOpen() { return { docHandle: 1 }; }
  close() { this.closed = true; }
  async rpc(handle, method, params = []) {
    if (method === "GetObject") return { qReturn: { qHandle: 2 } };
    if (method === "GetFullPropertyTree") return { qPropEntry: {
      qProperty: { qInfo: { qId: "map" }, gaLayers: [{
        type: "PointLayer", id: "layer", isLatLong: true,
        locationOrLatitude: { key: "=LAT" }, longitude: { key: "=LON" },
        qHyperCubeDef: { qDimensions: [{ qDef: { qFieldDefs: ["=[DISPLAY NAME]"] } }], qMeasures: [] }
      }] }, qChildren: []
    } };
    if (method === "CreateSessionObject") {
      const def = params[0];
      const type = def.qInfo.qType;
      const h = this.nextHandle++;
      this.handleTypes.set(h, { type, def });
      return { qReturn: { qHandle: h } };
    }
    if (method === "GetLayout") {
      const info = this.handleTypes.get(handle);
      if (info.type === "qlik_geojson_field_list") return { qLayout: { qFieldList: { qItems: [
        { qName: "DISPLAY NAME", qCardinal: 2, qTags: [], qSrcTables: ["PLACES"] },
        { qName: "ENTITY_ID", qCardinal: 3, qTags: ["$key"], qSrcTables: ["PLACES"] },
        { qName: "LAT", qCardinal: 3, qTags: ["$numeric"], qSrcTables: ["PLACES"] },
        { qName: "LON", qCardinal: 3, qTags: ["$numeric"], qSrcTables: ["PLACES"] }
      ] } } };
      if (info.type === "qlik_geojson_coordinate_analysis") return { qLayout: { qHyperCube: { qSize: { qcy: 1, qcx: 7 } } } };
      if (info.type === "qlik_geojson_entity_candidate_analysis") {
        const field = info.def.qHyperCubeDef.qDimensions[0].qDef.qFieldDefs[0];
        const count = field === "DISPLAY NAME" ? 2 : 3;
        return { qLayout: { qHyperCube: { qSize: { qcy: count, qcx: 4 } } } };
      }
    }
    if (method === "GetHyperCubeData") {
      const info = this.handleTypes.get(handle);
      if (info.type === "qlik_geojson_coordinate_analysis") return { qDataPages: [{ qMatrix: [[
        cell("-16", -16), cell("-15", -15), cell("3", 3), cell("-49", -49), cell("-47", -47), cell("3", 3), cell("3", 3)
      ]] }] };
      if (info.type === "qlik_geojson_entity_candidate_analysis") {
        const field = info.def.qHyperCubeDef.qDimensions[0].qDef.qFieldDefs[0];
        if (field === "DISPLAY NAME") return { qDataPages: [{ qMatrix: [
          [cell("same", NaN), cell("2", 2), cell("2", 2), cell("2", 2)],
          [cell("other", NaN), cell("1", 1), cell("1", 1), cell("1", 1)]
        ] }] };
        return { qDataPages: [{ qMatrix: [
          [cell("1", 1), cell("1", 1), cell("1", 1), cell("1", 1)],
          [cell("2", 2), cell("1", 1), cell("1", 1), cell("1", 1)],
          [cell("3", 3), cell("1", 1), cell("1", 1), cell("1", 1)]
        ] }] };
      }
    }
    throw new Error(`unexpected ${method} for ${handle}`);
  }
}

test("inspect emits structured aggregation diagnostics and ranks the spatial 1:1 key first", async () => {
  const client = new InspectClient();
  const extractor = new QlikGeoJSONExtractor({}, { client });
  const report = await extractor.inspect({ appId: "APP", sheetId: "SHEET", candidateAnalysisLimit: 4 });
  assert.equal(report.diagnostics[0].coordinateCardinality, 3);
  assert.equal(report.diagnostics[0].warnings[0].code, DIAGNOSTIC_CODES.VISUAL_DIMENSION_LOWER_CARDINALITY);
  assert.equal(report.entityKeySuggestions[0].candidates[0].field, "ENTITY_ID");
  assert.equal(report.entityKeySuggestions[0].candidates[0].confidence, "high");
  assert.equal(client.closed, true);
});
