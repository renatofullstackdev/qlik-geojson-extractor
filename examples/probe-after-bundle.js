/* Paste browser/qlik-geojson-extractor.js first, then edit the IDs. */
const { QlikGeoJSONExtractor: Extractor } = globalThis.QlikGeoJSONExtractor;
const extractor = new Extractor();
console.log(await extractor.probe({
  appId: "PUT_APP_ID_HERE",
  sheetId: "PUT_SHEET_ID_HERE"
}));
