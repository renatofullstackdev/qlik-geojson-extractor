import { QlikGeoJSONExtractor, downloadJSON } from "../src/index.js";

const APP_ID = "PUT_APP_ID_HERE";
const SHEET_ID = "PUT_SHEET_ID_HERE";

const extractor = new QlikGeoJSONExtractor();
const report = await extractor.inspect({ appId: APP_ID, sheetId: SHEET_ID });
console.log(report);
downloadJSON("qlik_inspection.json", report);
