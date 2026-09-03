import { QixClient } from "./qix-client.js";
import { listAppFields, summarizeFields, suggestEntityKeys } from "./app-inspector.js";
import { inspectSheet, summarizePointLayers } from "./map-inspector.js";
import { buildPointCubeDefinition, createSessionCube, fetchAllStraightCubeRows } from "./hypercube.js";
import { rowsToPointGeoJSON, validatePointGeoJSON } from "./geojson.js";

export class QlikGeoJSONExtractor {
  constructor(connection = {}) {
    this.client = new QixClient(connection);
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
        result.error = error.message;
        return result;
      }

      try {
        await this.client.openDoc(appId);
        result.openDoc = "SUCCESS";
      } catch (error) {
        result.openDoc = "ERROR";
        result.error = error.qlik ?? error.message;
        return result;
      }

      if (sheetId) {
        try {
          const sheetResult = await this.client.rpc(this.client.docHandle, "GetObject", [sheetId]);
          const sheetHandle = sheetResult?.qReturn?.qHandle;
          if (typeof sheetHandle !== "number") throw new Error("GetObject did not return a sheet handle.");
          result.getSheet = "SUCCESS";
          const treeResult = await this.client.rpc(sheetHandle, "GetFullPropertyTree", []);
          if (!treeResult?.qPropEntry) throw new Error("GetFullPropertyTree returned no qPropEntry.");
          result.getFullPropertyTree = "SUCCESS";
        } catch (error) {
          if (!result.getSheet) result.getSheet = "ERROR";
          else result.getFullPropertyTree = "ERROR";
          result.error = error.qlik ?? error.message;
        }
      }
      return result;
    } finally {
      this.client.close();
    }
  }

  async inspect({ appId, sheetId }) {
    try {
      await this.client.connectAndOpen(appId);
      const fields = await listAppFields(this.client);
      const sheet = await inspectSheet(this.client, sheetId);
      const pointLayers = summarizePointLayers(sheet.pointLayers);
      const fieldByName = new Map(fields.map((field) => [field.qName, field]));
      const suggestionsByLayer = pointLayers.map((layer) => ({
        objectId: layer.objectId,
        layerId: layer.layerId,
        candidates: suggestEntityKeys(fields, {
          latitudeField: layer.locationOrLatitude,
          longitudeField: layer.longitude
        })
      }));
      const diagnostics = pointLayers.map((layer) => {
        const latCardinality = fieldByName.get(layer.locationOrLatitude)?.qCardinal ?? null;
        const lonCardinality = fieldByName.get(layer.longitude)?.qCardinal ?? null;
        const coordinateCardinality = Math.max(latCardinality ?? 0, lonCardinality ?? 0) || null;
        const visualDimensions = layer.visualDimensions.map((name) => ({
          field: name,
          cardinality: fieldByName.get(name)?.qCardinal ?? null
        }));
        const warnings = [];
        for (const dim of visualDimensions) {
          if (coordinateCardinality && dim.cardinality && dim.cardinality < coordinateCardinality) {
            warnings.push(`Visual dimension ${dim.field} cardinality (${dim.cardinality}) is lower than coordinate cardinality (${coordinateCardinality}); multiple physical entities may be aggregated.`);
          }
        }
        return {
          objectId: layer.objectId,
          layerId: layer.layerId,
          latitudeField: layer.locationOrLatitude,
          longitudeField: layer.longitude,
          latitudeCardinality: latCardinality,
          longitudeCardinality: lonCardinality,
          coordinateCardinality,
          visualDimensions,
          warnings
        };
      });
      return {
        appId,
        sheetId,
        fieldCount: fields.length,
        fields: summarizeFields(fields),
        objectCount: sheet.objects.length,
        pointLayers,
        diagnostics,
        entityKeySuggestions: suggestionsByLayer
      };
    } finally {
      this.client.close();
    }
  }

  async extract(config) {
    const required = ["appId", "entityKey", "latitudeField", "longitudeField"];
    for (const key of required) if (!config[key]) throw new Error(`Missing extraction config: ${key}`);
    try {
      await this.client.connectAndOpen(config.appId);
      const { definition, propertyDefs, measures } = buildPointCubeDefinition(config);
      const { handle, hyperCube } = await createSessionCube(this.client, definition);
      const rows = await fetchAllStraightCubeRows(this.client, handle, hyperCube, { maxCellsPerPage: config.maxCellsPerPage ?? 9000 });
      const converted = rowsToPointGeoJSON(rows, hyperCube, config, propertyDefs, measures);
      const validation = validatePointGeoJSON(converted.featureCollection);
      if (config.requireAllCoordinates !== false && converted.missing.length) {
        const error = new Error(`${converted.missing.length} entities have no valid coordinates.`);
        error.missing = converted.missing;
        throw error;
      }
      if (!validation.valid) {
        const error = new Error("Generated GeoJSON failed validation.");
        error.validation = validation;
        throw error;
      }
      return {
        ...converted,
        validation,
        rowCount: rows.length,
        featureCount: converted.featureCollection.features.length
      };
    } finally {
      this.client.close();
    }
  }
}
