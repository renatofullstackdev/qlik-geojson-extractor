import { normalizeName } from "./utils.js";
import { EVIDENCE_CODES } from "./codes.js";
import { coreError, ERROR_CODES } from "./errors.js";

export async function listAppFields(client, { showHidden = true, showSemantic = true, showSrcTables = true } = {}) {
  const result = await client.rpc(client.docHandle, "CreateSessionObject", [{
    qInfo: { qType: "qlik_geojson_field_list" },
    qFieldListDef: {
      qShowSystem: false,
      qShowHidden: showHidden,
      qShowSemantic: showSemantic,
      qShowSrcTables: showSrcTables,
      qShowDefinitionOnly: false,
      qShowDerivedFields: false,
      qShowImplicit: false
    }
  }]);
  const handle = result?.qReturn?.qHandle;
  if (typeof handle !== "number") {
    throw coreError(ERROR_CODES.FIELD_LIST_CREATE_FAILED, "Could not create Qlik field-list session object.");
  }
  const layout = await client.rpc(handle, "GetLayout", []);
  return layout?.qLayout?.qFieldList?.qItems ?? [];
}

export function summarizeFields(fields) {
  return fields.map((field) => ({
    name: field.qName,
    normalizedName: normalizeName(field.qName),
    cardinality: field.qCardinal,
    tags: field.qTags ?? [],
    sourceTables: field.qSrcTables ?? [],
    hidden: !!field.qIsHidden,
    semantic: !!field.qIsSemantic
  }));
}

function hasSharedSource(field, coordinateFields) {
  const sources = new Set(field.qSrcTables ?? []);
  return coordinateFields.some((coordinate) => (coordinate?.qSrcTables ?? []).some((table) => sources.has(table)));
}

function confidenceFromProfile(profile) {
  if (!profile?.available || !profile.entityCount) return "unknown";
  if (profile.onePairRatio >= 0.98 && profile.multiplePairRatio === 0 && profile.missingRatio <= 0.02) return "high";
  if (profile.onePairRatio >= 0.9 && profile.multiplePairRatio <= 0.05 && profile.missingRatio <= 0.1) return "medium";
  return "low";
}

export function scoreEntityCandidate(field, {
  coordinateCardinality = null,
  visualDimensions = [],
  coordinateFields = [],
  spatialProfile = null
} = {}) {
  const name = normalizeName(field.qName);
  let score = 0;
  const evidence = [];
  const add = (code, weight, params = {}) => {
    score += weight;
    evidence.push({ code, weight, params });
  };

  if ((field.qTags ?? []).includes("$key")) add(EVIDENCE_CODES.TAG_KEY, 5);
  if (/^(ID|COD|KEY|CHAVE)_/.test(name) || /_(ID|COD|KEY|CHAVE)$/.test(name)) {
    add(EVIDENCE_CODES.NAME_KEY_LIKE, 5);
  }
  if (/(OBJETO|ENTIDADE|ENTITY|LOCAL|LOCATION|CIRCUNSCRICAO)/.test(name)) {
    add(EVIDENCE_CODES.NAME_SPATIAL_ENTITY_LIKE, 5);
  }
  if (visualDimensions.includes(field.qName)) add(EVIDENCE_CODES.VISUAL_DIMENSION, 10);
  if (hasSharedSource(field, coordinateFields)) add(EVIDENCE_CODES.SAME_SOURCE_TABLE, 20);

  if (coordinateCardinality && Number.isFinite(field.qCardinal)) {
    const ratio = Math.abs(field.qCardinal - coordinateCardinality) / Math.max(1, coordinateCardinality);
    const weight = ratio <= 0.02 ? 15 : ratio <= 0.1 ? 10 : ratio <= 0.25 ? 5 : 0;
    if (weight) add(EVIDENCE_CODES.CARDINALITY_CLOSE, weight, { coordinateCardinality, fieldCardinality: field.qCardinal });
  }

  if (spatialProfile?.available && spatialProfile.entityCount) {
    const onePairWeight = Math.round(40 * spatialProfile.onePairRatio);
    if (onePairWeight) add(EVIDENCE_CODES.SPATIAL_ONE_PAIR_RATIO, onePairWeight, {
      onePair: spatialProfile.onePair,
      entityCount: spatialProfile.entityCount,
      ratio: spatialProfile.onePairRatio
    });
    if (spatialProfile.multiplePairs) {
      add(EVIDENCE_CODES.SPATIAL_MULTIPLE_PAIRS, -Math.max(10, Math.round(50 * spatialProfile.multiplePairRatio)), {
        multiplePairs: spatialProfile.multiplePairs,
        entityCount: spatialProfile.entityCount,
        ratio: spatialProfile.multiplePairRatio
      });
    }
    if (spatialProfile.withoutCoordinates) {
      add(EVIDENCE_CODES.SPATIAL_MISSING_COORDINATES, -Math.max(5, Math.round(30 * spatialProfile.missingRatio)), {
        withoutCoordinates: spatialProfile.withoutCoordinates,
        entityCount: spatialProfile.entityCount,
        ratio: spatialProfile.missingRatio
      });
    }
  }

  return {
    field: field.qName,
    cardinality: field.qCardinal,
    score,
    confidence: confidenceFromProfile(spatialProfile),
    evidence,
    spatialProfile
  };
}

export function candidatePool(fields, {
  coordinateCardinality = null,
  latitudeField,
  longitudeField,
  visualDimensions = [],
  limit = 8
} = {}) {
  const coordinateFields = [
    fields.find((f) => f.qName === latitudeField),
    fields.find((f) => f.qName === longitudeField)
  ].filter(Boolean);
  const maxCardinality = coordinateCardinality
    ? Math.max(coordinateCardinality + 100, coordinateCardinality * 4)
    : 5000;

  const preliminary = fields
    .filter((field) => Number.isFinite(field.qCardinal) && field.qCardinal > 0)
    .filter((field) => visualDimensions.includes(field.qName) || field.qCardinal <= maxCardinality)
    .map((field) => scoreEntityCandidate(field, { coordinateCardinality, visualDimensions, coordinateFields }))
    .sort((a, b) => b.score - a.score || Math.abs((a.cardinality ?? 0) - (coordinateCardinality ?? 0)) - Math.abs((b.cardinality ?? 0) - (coordinateCardinality ?? 0)));

  const output = preliminary.slice(0, limit).map((item) => item.field);
  for (const dim of visualDimensions) {
    if (!output.includes(dim) && fields.some((field) => field.qName === dim)) output.push(dim);
  }
  return [...new Set(output)];
}

export function suggestEntityKeys(fields, {
  latitudeField,
  longitudeField,
  coordinateCardinality = null,
  visualDimensions = [],
  spatialProfiles = {},
  limit = 12
} = {}) {
  const lat = fields.find((f) => f.qName === latitudeField);
  const lon = fields.find((f) => f.qName === longitudeField);
  const target = coordinateCardinality ?? (Math.max(lat?.qCardinal ?? 0, lon?.qCardinal ?? 0) || null);
  const coordinateFields = [lat, lon].filter(Boolean);

  return fields
    .map((field) => scoreEntityCandidate(field, {
      coordinateCardinality: target,
      visualDimensions,
      coordinateFields,
      spatialProfile: spatialProfiles[field.qName] ?? null
    }))
    .filter((item) => item.score > 0 || visualDimensions.includes(item.field))
    .sort((a, b) => {
      const confidenceRank = { high: 3, medium: 2, low: 1, unknown: 0 };
      return (confidenceRank[b.confidence] - confidenceRank[a.confidence]) || b.score - a.score || String(a.field).localeCompare(String(b.field));
    })
    .slice(0, limit);
}
