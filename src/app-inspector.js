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

function hasSharedSource(field, spatialFields) {
  const sources = new Set(field.qSrcTables ?? []);
  return spatialFields.some((spatial) => (spatial?.qSrcTables ?? []).some((table) => sources.has(table)));
}

function profileRatios(profile) {
  if (!profile) return null;
  return {
    one: profile.oneRepresentationRatio ?? profile.onePairRatio ?? 0,
    multiple: profile.multipleRepresentationRatio ?? profile.multiplePairRatio ?? 0,
    missing: profile.missingRatio ?? 0,
    oneCount: profile.oneRepresentation ?? profile.onePair ?? 0,
    multipleCount: profile.multipleRepresentations ?? profile.multiplePairs ?? 0,
    missingCount: profile.withoutSpatial ?? profile.withoutCoordinates ?? 0
  };
}

function confidenceFromProfile(profile) {
  if (!profile?.available || !profile.entityCount) return "unknown";
  const ratios = profileRatios(profile);
  if (ratios.one >= 0.98 && ratios.multiple === 0 && ratios.missing <= 0.02) return "high";
  if (ratios.one >= 0.9 && ratios.multiple <= 0.05 && ratios.missing <= 0.1) return "medium";
  return "low";
}

export function scoreEntityCandidate(field, {
  spatialCardinality = null,
  coordinateCardinality = null,
  visualDimensions = [],
  spatialFields = [],
  coordinateFields = [],
  spatialProfile = null
} = {}) {
  const targetCardinality = spatialCardinality ?? coordinateCardinality;
  const effectiveSpatialFields = spatialFields.length ? spatialFields : coordinateFields;
  const name = normalizeName(field.qName);
  let score = 0;
  const evidence = [];
  const add = (code, weight, params = {}) => {
    score += weight;
    evidence.push({ code, weight, params });
  };

  if ((field.qTags ?? []).includes("$key")) add(EVIDENCE_CODES.TAG_KEY, 5);
  if (/^(ID|COD|CODIGO|KEY|CHAVE)_/.test(name) || /_(ID|COD|CODIGO|KEY|CHAVE)$/.test(name)) {
    add(EVIDENCE_CODES.NAME_KEY_LIKE, 5);
  }
  if (/(OBJETO|ENTIDADE|ENTITY|LOCAL|LOCATION|CIRCUNSCRICAO|UNIDADE)/.test(name)) {
    add(EVIDENCE_CODES.NAME_SPATIAL_ENTITY_LIKE, 5);
  }
  if (visualDimensions.includes(field.qName)) add(EVIDENCE_CODES.VISUAL_DIMENSION, 10);
  if (hasSharedSource(field, effectiveSpatialFields)) add(EVIDENCE_CODES.SAME_SOURCE_TABLE, 20);

  if (targetCardinality && Number.isFinite(field.qCardinal)) {
    const ratio = Math.abs(field.qCardinal - targetCardinality) / Math.max(1, targetCardinality);
    const weight = ratio <= 0.02 ? 15 : ratio <= 0.1 ? 10 : ratio <= 0.25 ? 5 : 0;
    if (weight) add(EVIDENCE_CODES.CARDINALITY_CLOSE, weight, { spatialCardinality: targetCardinality, coordinateCardinality: targetCardinality, fieldCardinality: field.qCardinal });
  }

  if (spatialProfile?.available && spatialProfile.entityCount) {
    const ratios = profileRatios(spatialProfile);
    const oneWeight = Math.round(40 * ratios.one);
    if (oneWeight) add(EVIDENCE_CODES.SPATIAL_ONE_REPRESENTATION_RATIO, oneWeight, {
      oneRepresentation: ratios.oneCount,
      entityCount: spatialProfile.entityCount,
      ratio: ratios.one
    });
    if (ratios.multipleCount) {
      add(EVIDENCE_CODES.SPATIAL_MULTIPLE_REPRESENTATIONS, -Math.max(10, Math.round(50 * ratios.multiple)), {
        multipleRepresentations: ratios.multipleCount,
        entityCount: spatialProfile.entityCount,
        ratio: ratios.multiple
      });
    }
    if (ratios.missingCount) {
      add(EVIDENCE_CODES.SPATIAL_MISSING_REPRESENTATION, -Math.max(5, Math.round(30 * ratios.missing)), {
        withoutSpatial: ratios.missingCount,
        entityCount: spatialProfile.entityCount,
        ratio: ratios.missing
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
  spatialCardinality = null,
  coordinateCardinality = null,
  spatialFieldNames = [],
  latitudeField,
  longitudeField,
  visualDimensions = [],
  limit = 8
} = {}) {
  const targetCardinality = spatialCardinality ?? coordinateCardinality ??
    (visualDimensions.length === 1 ? fields.find((field) => field.qName === visualDimensions[0])?.qCardinal ?? null : null);
  const names = spatialFieldNames.length ? spatialFieldNames : [latitudeField, longitudeField].filter(Boolean);
  const spatialFields = names.map((name) => fields.find((f) => f.qName === name)).filter(Boolean);
  const maxCardinality = targetCardinality
    ? Math.max(targetCardinality + 100, targetCardinality * 4)
    : 5000;

  const preliminary = fields
    .filter((field) => Number.isFinite(field.qCardinal) && field.qCardinal > 0)
    .filter((field) => visualDimensions.includes(field.qName) || field.qCardinal <= maxCardinality)
    .map((field) => scoreEntityCandidate(field, { spatialCardinality: targetCardinality, visualDimensions, spatialFields }))
    .sort((a, b) => b.score - a.score || Math.abs((a.cardinality ?? 0) - (targetCardinality ?? 0)) - Math.abs((b.cardinality ?? 0) - (targetCardinality ?? 0)));

  const output = preliminary.slice(0, limit).map((item) => item.field);
  for (const dim of visualDimensions) {
    if (!output.includes(dim) && fields.some((field) => field.qName === dim)) output.push(dim);
  }
  return [...new Set(output)];
}

export function suggestEntityKeys(fields, {
  spatialCardinality = null,
  coordinateCardinality = null,
  spatialFieldNames = [],
  latitudeField,
  longitudeField,
  visualDimensions = [],
  spatialProfiles = {},
  limit = 12
} = {}) {
  const names = spatialFieldNames.length ? spatialFieldNames : [latitudeField, longitudeField].filter(Boolean);
  const spatialFields = names.map((name) => fields.find((f) => f.qName === name)).filter(Boolean);
  const target = spatialCardinality ?? coordinateCardinality ??
    (visualDimensions.length === 1 ? fields.find((field) => field.qName === visualDimensions[0])?.qCardinal ?? null : null);

  return fields
    .map((field) => scoreEntityCandidate(field, {
      spatialCardinality: target,
      visualDimensions,
      spatialFields,
      spatialProfile: spatialProfiles[field.qName] ?? null
    }))
    .filter((item) => item.score > 0 || visualDimensions.includes(item.field))
    .sort((a, b) => {
      const confidenceRank = { high: 3, medium: 2, low: 1, unknown: 0 };
      return (confidenceRank[b.confidence] - confidenceRank[a.confidence]) || b.score - a.score || String(a.field).localeCompare(String(b.field));
    })
    .slice(0, limit);
}
