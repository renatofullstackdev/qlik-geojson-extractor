import { ERROR_CODES, DIAGNOSTIC_CODES, EVIDENCE_CODES } from "./core-codes.js";

function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`);
}

export const ptBR = Object.freeze({
  errors: {
    [ERROR_CODES.QLIK_HOST_REQUIRED]: "Não foi possível identificar o host Qlik.",
    [ERROR_CODES.CSRF_FETCH_FAILED]: "Não foi possível obter o token CSRF do Qlik (HTTP {status}).",
    [ERROR_CODES.CSRF_TOKEN_MISSING]: "A resposta do Qlik não trouxe o token CSRF esperado.",
    [ERROR_CODES.CLIENT_ALREADY_CONNECTED]: "Já existe uma conexão Qlik ativa neste cliente.",
    [ERROR_CODES.WEBSOCKET_OPEN_FAILED]: "Não foi possível abrir a conexão WebSocket com o Qlik Engine.",
    [ERROR_CODES.WEBSOCKET_NOT_OPEN]: "A conexão WebSocket com o Qlik Engine não está aberta.",
    [ERROR_CODES.OPENDOC_INVALID_HANDLE]: "O Qlik não retornou um identificador válido ao abrir o app.",
    [ERROR_CODES.CONNECTION_CLOSED]: "A conexão com o Qlik foi encerrada.",
    [ERROR_CODES.FIELD_LIST_CREATE_FAILED]: "Não foi possível criar a lista de campos do app Qlik.",
    [ERROR_CODES.SHEET_GET_FAILED]: "Não foi possível acessar a sheet Qlik solicitada.",
    [ERROR_CODES.PROPERTY_TREE_MISSING]: "O Qlik não retornou a árvore de propriedades da sheet.",
    [ERROR_CODES.UNSUPPORTED_PROPERTY_AGGREGATION]: "A agregação de propriedade '{aggregation}' não é suportada.",
    [ERROR_CODES.SESSION_OBJECT_INVALID_HANDLE]: "O Qlik não retornou um identificador válido para o objeto de sessão.",
    [ERROR_CODES.HYPERCUBE_LAYOUT_MISSING]: "O Qlik não retornou o hypercube esperado.",
    [ERROR_CODES.LAT_LON_ATTRIBUTES_MISSING]: "As expressões de latitude/longitude não foram materializadas pelo Qlik.",
    [ERROR_CODES.LOCATION_ATTRIBUTE_MISSING]: "A expressão de localização não foi materializada pelo Qlik.",
    [ERROR_CODES.NULL_ENTITY_KEY]: "A linha {rowIndex} possui chave de entidade nula.",
    [ERROR_CODES.DUPLICATE_ENTITY_KEY]: "A chave de entidade '{key}' apareceu mais de uma vez.",
    [ERROR_CODES.OVERRIDE_GUARD_FIELD_MISSING]: "A correção de coordenada para '{key}' depende do campo '{field}', que não foi extraído.",
    [ERROR_CODES.OVERRIDE_GUARD_MISMATCH]: "A verificação da correção de coordenada para '{key}' falhou no campo '{field}'.",
    [ERROR_CODES.EXTRACTION_CONFIG_MISSING]: "A configuração de extração está incompleta: {key}.",
    [ERROR_CODES.MISSING_COORDINATES]: "{count} entidade(s) real(is) ficaram sem coordenadas válidas.",
    [ERROR_CODES.GEOJSON_VALIDATION_FAILED]: "O GeoJSON gerado não passou na validação.",
    [ERROR_CODES.GEOJSON_ROOT_INVALID]: "A raiz do resultado não é uma FeatureCollection válida.",
    [ERROR_CODES.GEOJSON_GEOMETRY_INVALID]: "A feição {index} não possui geometria Point.",
    [ERROR_CODES.GEOJSON_COORDINATES_INVALID]: "A feição {index} possui coordenadas inválidas.",
    [ERROR_CODES.QIX_RPC_ERROR]: "O Qlik Engine retornou um erro QIX ({qixCode})."
  },
  diagnostics: {
    [DIAGNOSTIC_CODES.VISUAL_DIMENSION_LOWER_CARDINALITY]: "A dimensão visual {field} possui cardinalidade {dimensionCardinality}, menor que a cardinalidade das coordenadas ({coordinateCardinality}). Múltiplas entidades físicas podem estar sendo agregadas.",
    [DIAGNOSTIC_CODES.VISUAL_DIMENSION_LOWER_SPATIAL_CARDINALITY]: "A dimensão visual {field} possui cardinalidade {dimensionCardinality}, menor que a cardinalidade espacial ({spatialCardinality}). Múltiplas entidades físicas podem estar sendo agregadas.",
    [DIAGNOSTIC_CODES.COORDINATE_COMPLEX_EXPRESSION]: "A {axis} do PointLayer usa uma expressão Qlik, não um campo direto: {expression}.",
    [DIAGNOSTIC_CODES.LOCATION_COMPLEX_EXPRESSION]: "A localização do PointLayer usa uma expressão Qlik, não um campo direto: {expression}.",
    [DIAGNOSTIC_CODES.COORDINATE_RANGE_INVALID]: "As coordenadas detectadas possuem valores fora dos limites WGS84. Latitude: {latitudeMin} a {latitudeMax}; longitude: {longitudeMin} a {longitudeMax}.",
    [DIAGNOSTIC_CODES.COORDINATE_SWAP_LIKELY]: "Os intervalos sugerem que latitude e longitude podem estar invertidas.",
    [DIAGNOSTIC_CODES.COORDINATE_STATS_UNAVAILABLE]: "Não foi possível calcular automaticamente as estatísticas das coordenadas deste PointLayer.",
    [DIAGNOSTIC_CODES.SPATIAL_STATS_UNAVAILABLE]: "Não foi possível calcular automaticamente as estatísticas da fonte espacial deste PointLayer.",
    [DIAGNOSTIC_CODES.INACTIVE_LONGITUDE_IGNORED]: "O PointLayer está em modo de localização única; a configuração residual de longitude foi ignorada."
  },
  evidence: {
    [EVIDENCE_CODES.SPATIAL_ONE_PAIR_RATIO]: "{onePair} de {entityCount} valores mapeiam para exatamente um par de coordenadas.",
    [EVIDENCE_CODES.SPATIAL_ONE_REPRESENTATION_RATIO]: "{oneRepresentation} de {entityCount} valores mapeiam para exatamente uma representação espacial.",
    [EVIDENCE_CODES.SPATIAL_MULTIPLE_PAIRS]: "{multiplePairs} de {entityCount} valores mapeiam para múltiplos pares de coordenadas.",
    [EVIDENCE_CODES.SPATIAL_MULTIPLE_REPRESENTATIONS]: "{multipleRepresentations} de {entityCount} valores mapeiam para múltiplas representações espaciais.",
    [EVIDENCE_CODES.SPATIAL_MISSING_COORDINATES]: "{withoutCoordinates} de {entityCount} valores não possuem coordenadas.",
    [EVIDENCE_CODES.SPATIAL_MISSING_REPRESENTATION]: "{withoutSpatial} de {entityCount} valores não possuem representação espacial.",
    [EVIDENCE_CODES.SAME_SOURCE_TABLE]: "O campo compartilha tabela de origem com as coordenadas.",
    [EVIDENCE_CODES.CARDINALITY_CLOSE]: "A cardinalidade do campo ({fieldCardinality}) é próxima da cardinalidade espacial ({spatialCardinality}).",
    [EVIDENCE_CODES.VISUAL_DIMENSION]: "O campo é usado como dimensão visual do mapa.",
    [EVIDENCE_CODES.TAG_KEY]: "O Qlik marca o campo com a tag $key.",
    [EVIDENCE_CODES.NAME_KEY_LIKE]: "O nome do campo parece um identificador (ID/COD/CHAVE).",
    [EVIDENCE_CODES.NAME_SPATIAL_ENTITY_LIKE]: "O nome do campo sugere uma entidade espacial."
  },
  confidence: {
    high: "alta",
    medium: "média",
    low: "baixa",
    unknown: "não avaliada"
  }
});

export function localizeCoreError(errorLike) {
  const code = errorLike?.code;
  const params = errorLike?.params ?? {};
  const template = code ? ptBR.errors[code] : null;
  const message = template ? interpolate(template, params) : "Ocorreu um erro durante a operação Qlik.";
  return {
    message,
    technicalMessage: errorLike?.message ?? null,
    code: code ?? null,
    params
  };
}

export function localizeDiagnostic(diagnostic) {
  const template = ptBR.diagnostics[diagnostic?.code];
  return template ? interpolate(template, diagnostic?.params ?? {}) : "Diagnóstico não reconhecido.";
}

export function localizeEvidence(evidence) {
  const template = ptBR.evidence[evidence?.code];
  return template ? interpolate(template, evidence?.params ?? {}) : evidence?.code ?? "evidência";
}

export function confidenceLabel(value) {
  return ptBR.confidence[value] ?? ptBR.confidence.unknown;
}
