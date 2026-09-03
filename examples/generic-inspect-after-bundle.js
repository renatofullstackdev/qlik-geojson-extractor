/* Paste browser/qlik-geojson-extractor.js first, then edit the IDs below. */
const { QlikGeoJSONExtractor: Extractor, downloadJSON } = globalThis.QlikGeoJSONExtractor;
const APP_ID = "PUT_APP_ID_HERE";
const SHEET_ID = "PUT_SHEET_ID_HERE";
const extractor = new Extractor();
const report = await extractor.inspect({ appId: APP_ID, sheetId: SHEET_ID });
console.log(report);
downloadJSON("qlik_inspection.json", report);
