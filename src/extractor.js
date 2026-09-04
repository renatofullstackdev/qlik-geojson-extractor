import { QixClient } from "./qix-client.js";
import { candidatePool, listAppFields, summarizeFields, suggestEntityKeys } from "./app-inspector.js";
import { inspectSheet, summarizePointLayers } from "./map-inspector.js";
import { analyzeEntityCandidate, analyzeSpatialSource, spatialSourceFields } from "./spatial-analysis.js";
import { buildPointCubeDefinition, createSessionCube, fetchAllStraightCubeRows, spatialModeFromConfig } from "./hypercube.js";
import { rowsToPointGeoJSON, validatePointGeoJSON } from "./geojson.js";
import { DIAGNOSTIC_CODES } from "./codes.js";
import { coreError, ERROR_CODES, serializeError } from "./errors.js";

export function coordinateWarnings(layer, stats) {
  const warnings = [];
  if (layer.latitudeDefinition?.kind === "expression") {
    warnings.push({ code: DIAGNOSTIC_CODES.COORDINATE_COMPLEX_EXPRESSION, severity: "warning", params: { axis: "latitude", expression: layer.latitudeDefinition.raw } });
  }
  if (layer.longitudeDefinition?.kind === "expression") {
    warnings.push({ code: DIAGNOSTIC_CODES.COORDINATE_COMPLEX_EXPRESSION, severity: "warning", params: { axis: "longitude", expression: layer.longitudeDefinition.raw } });
  }
  if (!stats?.available) {
    warnings.push({ code: DIAGNOSTIC_CODES.COORDINATE_STATS_UNAVAILABLE, severity: "info", params: { reason: stats?.reason ?? "unknown" } });
    return warnings;
  }

  const latInvalid = stats.latitude.min != null && stats.latitude.max != null && (stats.latitude.min < -90 || stats.latitude.max > 90);
  const lonInvalid = stats.longitude.min != null && stats.longitude.max != null && (stats.longitude.min < -180 || stats.longitude.max > 180);
  if (latInvalid || lonInvalid) {
    warnings.push({
      code: DIAGNOSTIC_CODES.COORDINATE_RANGE_INVALID,
      severity: "error",
      params: {
        latitudeMin: stats.latitude.min,
        latitudeMax: stats.latitude.max,
        longitudeMin: stats.longitude.min,
        longitudeMax: stats.longitude.max
      }
    });
  }

  const swapWouldFix = stats.latitude.min != null && stats.latitude.max != null && stats.longitude.min != null && stats.longitude.max != null &&
    (stats.latitude.min < -90 || stats.latitude.max > 90) &&
    stats.latitude.min >= -180 && stats.latitude.max <= 180 &&
    stats.longitude.min >= -90 && stats.longitude.max <= 90;
  if (swapWouldFix) warnings.push({ code: DIAGNOSTIC_CODES.COORDINATE_SWAP_LIKELY, severity: "warning", params: {} });
  return warnings;
}

export function spatialWarnings(layer, stats) {
  if (layer.spatialMode === "coordinates") return coordinateWarnings(layer, stats);
  const warnings = [];
  const location = layer.locationDefinition;
  if (location?.kind === "expression") {
    warnings.push({ code: DIAGNOSTIC_CODES.LOCATION_COMPLEX_EXPRESSION, severity: "info", params: { expression: location.raw } });
  }
  if (!stats?.available) {
    warnings.push({ code: DIAGNOSTIC_CODES.SPATIAL_STATS_UNAVAILABLE, severity: "info", params: { reason: stats?.reason ?? "unknown", spatialMode: "location" } });
  }
  if (layer.residualLongitudeDefinition?.raw) {
    warnings.push({ code: DIAGNOSTIC_CODES.INACTIVE_LONGITUDE_IGNORED, severity: "info", params: { raw: layer.residualLongitudeDefinition.raw } });
  }
  return warnings;
}

export class QlikGeoJSONExtractor {
  constructor(connection = {}, dependencies = {}) {
    this.client = dependencies.client ?? new QixClient(connection);
  }

  async probe({ appId, sheetId }) {
    const result = { websocket: null, openDoc: null, getSheet: null, getFullPropertyTree: null };
    try {
      try {
        const conn = await this.client.connect(appId);
        result.websocket = "OPEN";
        result.identity = conn.identity;
      } catch (error) {
        result.websocket = "ERROR";
        result.error = serializeError(error);
        return result;
      }

      try {
        await this.client.openDoc(appId);
        result.openDoc = "SUCCESS";
      } catch (error) {
        result.openDoc = "ERROR";
        result.error = serializeError(error);
        return result;
      }

      if (sheetId) {
        try {
          const sheetResult = await this.client.rpc(this.client.docHandle, "GetObject", [sheetId]);
          const sheetHandle = sheetResult?.qReturn?.qHandle;
          if (typeof sheetHandle !== "number") throw coreError(ERROR_CODES.SHEET_GET_FAILED, "GetObject did not return a sheet handle.", { sheetId });
          result.getSheet = "SUCCESS";
          const treeResult = await this.client.rpc(sheetHandle, "GetFullPropertyTree", []);
          if (!treeResult?.qPropEntry) throw coreError(ERROR_CODES.PROPERTY_TREE_MISSING, "GetFullPropertyTree returned no qPropEntry.", { sheetId });
          result.getFullPropertyTree = "SUCCESS";
        } catch (error) {
          if (!result.getSheet) result.getSheet = "ERROR";
          else result.getFullPropertyTree = "ERROR";
          result.error = serializeError(error);
        }
      }
      return result;
    } finally {
      this.client.close();
    }
  }

  async inspect({ appId, sheetId, candidateAnalysisLimit = 8 }) {
    try {
      await this.client.connectAndOpen(appId);
      const fields = await listAppFields(this.client);
      const summarizedFields = summarizeFields(fields);
      const sheet = await inspectSheet(this.client, sheetId);
      const pointLayers = summarizePointLayers(sheet.pointLayers, fields);
      const fieldByName = new Map(fields.map((field) => [field.qName, field]));
      const diagnostics = [];
      const entityKeySuggestions = [];

      for (const layer of pointLayers) {
        let spatialStats;
        try {
          spatialStats = await analyzeSpatialSource(this.client, layer.spatialSource);
        } catch (error) {
          spatialStats = { available: false, type: layer.spatialMode, reason: "analysis-error", error: serializeError(error) };
        }

        const sourceFieldNames = spatialSourceFields(layer.spatialSource);
        const sourceCardinalities = sourceFieldNames.map((name) => fieldByName.get(name)?.qCardinal).filter(Number.isFinite);
        const spatialCardinality = spatialStats?.distinctRepresentations ??
          (sourceCardinalities.length === 1 ? sourceCardinalities[0] : null);
        const visualDimensions = layer.visualDimensions.map((name) => ({ field: name, cardinality: fieldByName.get(name)?.qCardinal ?? null }));
        const warnings = spatialWarnings(layer, spatialStats);
        for (const dim of visualDimensions) {
          if (spatialCardinality && dim.cardinality && dim.cardinality < spatialCardinality) {
            warnings.push({
              code: layer.spatialMode === "coordinates"
                ? DIAGNOSTIC_CODES.VISUAL_DIMENSION_LOWER_CARDINALITY
                : DIAGNOSTIC_CODES.VISUAL_DIMENSION_LOWER_SPATIAL_CARDINALITY,
              severity: "warning",
              params: {
                field: dim.field,
                dimensionCardinality: dim.cardinality,
                coordinateCardinality: spatialCardinality,
                spatialCardinality
              }
            });
          }
        }

        diagnostics.push({
          objectId: layer.objectId,
          layerId: layer.layerId,
          spatialMode: layer.spatialMode,
          spatialSource: layer.spatialSource,
          spatialCardinality,
          spatialStats,
          latitudeField: layer.latitudeDefinition?.field ?? null,
          longitudeField: layer.longitudeDefinition?.field ?? null,
          locationField: layer.locationDefinition?.field ?? null,
          latitudeDefinition: layer.latitudeDefinition,
          longitudeDefinition: layer.longitudeDefinition,
          locationDefinition: layer.locationDefinition,
          latitudeCardinality: layer.spatialMode === "coordinates" ? fieldByName.get(layer.latitudeDefinition?.field)?.qCardinal ?? spatialStats?.latitude?.distinct ?? null : null,
          longitudeCardinality: layer.spatialMode === "coordinates" ? fieldByName.get(layer.longitudeDefinition?.field)?.qCardinal ?? spatialStats?.longitude?.distinct ?? null : null,
          locationCardinality: layer.spatialMode === "location" ? fieldByName.get(layer.locationDefinition?.field)?.qCardinal ?? spatialStats?.distinctLocations ?? null : null,
          // Compatibility aliases for previous reports.
          coordinateCardinality: layer.spatialMode === "coordinates" ? spatialCardinality : null,
          coordinateStats: layer.spatialMode === "coordinates" ? spatialStats : null,
          visualDimensions,
          warnings
        });

        const pool = candidatePool(fields, {
          spatialCardinality,
          spatialFieldNames: sourceFieldNames,
          visualDimensions: layer.visualDimensions,
          limit: candidateAnalysisLimit
        });
        const spatialProfiles = {};
        if (spatialStats?.available) {
          for (const fieldName of pool) {
            try {
              spatialProfiles[fieldName] = await analyzeEntityCandidate(this.client, fieldName, layer.spatialSource);
            } catch (error) {
              spatialProfiles[fieldName] = { available: false, type: layer.spatialMode, reason: "analysis-error", error: serializeError(error) };
            }
          }
        }

        entityKeySuggestions.push({
          objectId: layer.objectId,
          layerId: layer.layerId,
          spatialMode: layer.spatialMode,
          candidates: suggestEntityKeys(fields, {
            spatialCardinality,
            spatialFieldNames: sourceFieldNames,
            visualDimensions: layer.visualDimensions,
            spatialProfiles
          })
        });
      }

      return {
        appId,
        sheetId,
        fieldCount: fields.length,
        fields: summarizedFields,
        objectCount: sheet.objects.length,
        pointLayers,
        diagnostics,
        entityKeySuggestions
      };
    } finally {
      this.client.close();
    }
  }

  async extract(config) {
    const required = ["appId", "entityKey"];
    for (const key of required) {
      if (!config[key]) throw coreError(ERROR_CODES.EXTRACTION_CONFIG_MISSING, `Missing extraction config: ${key}`, { key });
    }
    const spatialMode = spatialModeFromConfig(config);
    if (spatialMode === "coordinates") {
      if (!(config.latitudeField || config.latitudeExpression)) {
        throw coreError(ERROR_CODES.EXTRACTION_CONFIG_MISSING, "Missing extraction config: latitude", { key: "latitudeField|latitudeExpression" });
      }
      if (!(config.longitudeField || config.longitudeExpression)) {
        throw coreError(ERROR_CODES.EXTRACTION_CONFIG_MISSING, "Missing extraction config: longitude", { key: "longitudeField|longitudeExpression" });
      }
    } else if (!(config.locationField || config.locationExpression)) {
      throw coreError(ERROR_CODES.EXTRACTION_CONFIG_MISSING, "Missing extraction config: location", { key: "locationField|locationExpression" });
    }

    try {
      await this.client.connectAndOpen(config.appId);
      const { definition, propertyDefs, measures } = buildPointCubeDefinition(config);
      const { handle, hyperCube } = await createSessionCube(this.client, definition);
      const rows = await fetchAllStraightCubeRows(this.client, handle, hyperCube, { maxCellsPerPage: config.maxCellsPerPage ?? 9000 });
      const converted = rowsToPointGeoJSON(rows, hyperCube, config, propertyDefs, measures);
      const validation = validatePointGeoJSON(converted.featureCollection);
      if (config.requireAllCoordinates !== false && converted.missing.length) {
        const error = coreError(
          ERROR_CODES.MISSING_COORDINATES,
          `${converted.missing.length} entities have no valid coordinates.`,
          { count: converted.missing.length, spatialMode },
          { missing: converted.missing }
        );
        throw error;
      }
      if (!validation.valid) {
        throw coreError(
          ERROR_CODES.GEOJSON_VALIDATION_FAILED,
          "Generated GeoJSON failed validation.",
          { errorCount: validation.errors.length },
          { validation }
        );
      }
      return {
        ...converted,
        validation,
        rowCount: rows.length,
        featureCount: converted.featureCollection.features.length,
        skippedNullEntityCount: converted.skippedNullEntities.length
      };
    } finally {
      this.client.close();
    }
  }
}
