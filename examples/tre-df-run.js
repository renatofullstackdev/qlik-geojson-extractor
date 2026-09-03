import { QlikGeoJSONExtractor, downloadGeoJSON } from "../src/index.js";
import { treDfLocaisVotacaoConfig } from "./tre-df-locais-votacao.config.js";

const extractor = new QlikGeoJSONExtractor();
const result = await extractor.extract(treDfLocaisVotacaoConfig);
console.table({
  rows: result.rowCount,
  features: result.featureCount,
  uniqueKeys: result.uniqueKeys,
  manualOverrides: result.appliedOverrides.length,
  missing: result.missing.length
});
downloadGeoJSON("tre_df_locais_votacao_final.geojson", result.featureCollection);
