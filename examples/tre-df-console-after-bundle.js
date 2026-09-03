/*
 * 1. Paste browser/qlik-geojson-extractor.js into DevTools first.
 * 2. Paste this file on the TRE-DF Qlik page.
 */
const { QlikGeoJSONExtractor: Extractor, downloadGeoJSON } = globalThis.QlikGeoJSONExtractor;

const config = {
  appId: "b92de30a-82aa-4d13-8286-cd423498e34e",
  name: "locais_votacao_tre_df",
  entityKey: "COD_OBJETO_LOCAL",
  latitudeField: "NUM_LATITUDE_LOCAL",
  longitudeField: "NUM_LONGITUDE_LOCAL",
  properties: [
    "NOM_LOCAL",
    "NUM_LOCAL",
    "NUM_ZONA",
    "COD_OBJETO_ZONA",
    "NOM_BAIRRO_LOCAL",
    "DES_ENDERECO_LOCAL",
    { field: "DAT_ATUALIZACAO", label: "DAT_ATUALIZACAO", aggregation: "maxTimestamp" }
  ],
  measures: [
    { label: "QT_ELEITORES", expression: "Count(COD_OBJETO_ELEITOR)" },
    { label: "QT_ELEITORES_APTOS", expression: "Count({<COD_SIT_ELEITOR = {\"0\", \"9\"}>} COD_OBJETO_ELEITOR)" },
    { label: "QT_ELEITORES_NAO_APTOS", expression: "Count({<COD_SIT_ELEITOR -= {\"0\", \"9\"}>} COD_OBJETO_ELEITOR)" },
    { label: "QT_SECOES", expression: "Count(Distinct COD_OBJETO_SECAO)" }
  ],
  navigationLinks: true,
  coordinateSourceField: "coordenada_origem",
  coordinateSourceValue: "TRE-DF/Qlik",
  coordinateOverrides: {
    "gjgh23121812463300": {
      latitude: -15.83328021,
      longitude: -48.13200421,
      source: "manual",
      expected: {
        field: "NOM_LOCAL",
        value: "ESCOLA CLASSE JUSCELINO KUBITSCHEK"
      }
    }
  },
  requireAllCoordinates: true
};

const extractor = new Extractor();
const result = await extractor.extract(config);
console.table({
  rows: result.rowCount,
  features: result.featureCount,
  uniqueKeys: result.uniqueKeys,
  manualOverrides: result.appliedOverrides.length,
  missing: result.missing.length
});
downloadGeoJSON("tre_df_locais_votacao_final.geojson", result.featureCollection);
