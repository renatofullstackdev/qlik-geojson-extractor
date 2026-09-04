import { googleMapsUrl, numberOrNull, qNumOrText, qTextOrNum, validCoordinates, wazeUrl } from "./utils.js";
import { coreError, ERROR_CODES } from "./errors.js";

export function rowsToPointGeoJSON(rows, hyperCube, config, propertyDefs, measures) {
  const attrInfo = hyperCube?.qDimensionInfo?.[0]?.qAttrExprInfo ?? [];
  const attrIndex = new Map();
  attrInfo.forEach((info, index) => { if (info?.id) attrIndex.set(info.id, index); });
  const latIndex = attrIndex.get("__latitude");
  const lonIndex = attrIndex.get("__longitude");
  if (latIndex === undefined || lonIndex === undefined) {
    throw coreError(ERROR_CODES.LAT_LON_ATTRIBUTES_MISSING, "Latitude/longitude attribute expressions were not materialized.");
  }

  const featureCollection = { type: "FeatureCollection", name: config.name ?? "qlik_points", features: [] };
  const missing = [];
  const appliedOverrides = [];
  const skippedNullEntities = [];
  const keys = new Set();

  rows.forEach((row, rowIndex) => {
    const dimensionCell = row[0];
    const entityKeyValue = qTextOrNum(dimensionCell);
    if (entityKeyValue === null || entityKeyValue === "") {
      if (config.skipNullEntities === false) {
        throw coreError(ERROR_CODES.NULL_ENTITY_KEY, `Row ${rowIndex}: null entity key.`, { rowIndex });
      }
      skippedNullEntities.push({
        rowIndex,
        displayText: typeof dimensionCell?.qText === "string" ? dimensionCell.qText : null
      });
      return;
    }
    const keyString = String(entityKeyValue);
    if (keys.has(keyString)) {
      throw coreError(ERROR_CODES.DUPLICATE_ENTITY_KEY, `Duplicate entity key: ${keyString}`, { key: keyString });
    }
    keys.add(keyString);

    const attrValues = dimensionCell?.qAttrExps?.qValues ?? [];
    const properties = { [config.entityKey]: entityKeyValue };
    propertyDefs.forEach((p, index) => {
      properties[p.label] = qTextOrNum(attrValues[attrIndex.get(`__property_${index}`)]);
    });
    measures.forEach((m, index) => {
      properties[m.label] = qNumOrText(row[index + 1]);
    });

    let latitude = numberOrNull(qNumOrText(attrValues[latIndex]));
    let longitude = numberOrNull(qNumOrText(attrValues[lonIndex]));
    let coordinateSource = config.coordinateSourceValue ?? "Qlik";

    if (!validCoordinates(longitude, latitude)) {
      const override = config.coordinateOverrides?.[keyString];
      if (override) {
        if (override.expected) {
          if (!Object.prototype.hasOwnProperty.call(properties, override.expected.field)) {
            throw coreError(
              ERROR_CODES.OVERRIDE_GUARD_FIELD_MISSING,
              `Coordinate override ${keyString}: expected guard field ${override.expected.field} is not included in extracted properties.`,
              { key: keyString, field: override.expected.field }
            );
          }
          const actual = properties[override.expected.field];
          if (String(actual) !== String(override.expected.value)) {
            throw coreError(
              ERROR_CODES.OVERRIDE_GUARD_MISMATCH,
              `Coordinate override ${keyString}: expected ${override.expected.field}=${override.expected.value}, got ${actual}.`,
              { key: keyString, field: override.expected.field, expected: override.expected.value, actual }
            );
          }
        }
        latitude = Number(override.latitude);
        longitude = Number(override.longitude);
        coordinateSource = override.source ?? "manual";
        appliedOverrides.push({ key: entityKeyValue, latitude, longitude, source: coordinateSource });
      }
    }

    if (!validCoordinates(longitude, latitude)) {
      missing.push({ ...properties, latitude: null, longitude: null });
      return;
    }

    properties[config.latitudeOutput ?? "latitude"] = latitude;
    properties[config.longitudeOutput ?? "longitude"] = longitude;
    properties[config.coordinateSourceField ?? "coordinate_source"] = coordinateSource;
    if (config.navigationLinks) {
      properties[config.googleMapsField ?? "google_maps"] = googleMapsUrl(longitude, latitude);
      properties[config.wazeField ?? "waze"] = wazeUrl(longitude, latitude);
    }

    featureCollection.features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties
    });
  });

  return {
    featureCollection,
    missing,
    appliedOverrides,
    skippedNullEntities,
    skippedNullEntityCount: skippedNullEntities.length,
    uniqueKeys: keys.size
  };
}

export function validatePointGeoJSON(featureCollection) {
  const errors = [];
  if (featureCollection?.type !== "FeatureCollection") {
    errors.push({ code: ERROR_CODES.GEOJSON_ROOT_INVALID, params: { actualType: featureCollection?.type ?? null } });
  }
  for (const [index, feature] of (featureCollection?.features ?? []).entries()) {
    if (feature?.geometry?.type !== "Point") {
      errors.push({ code: ERROR_CODES.GEOJSON_GEOMETRY_INVALID, params: { index, actualType: feature?.geometry?.type ?? null } });
      continue;
    }
    const [lon, lat] = feature.geometry.coordinates ?? [];
    if (!validCoordinates(lon, lat)) {
      errors.push({ code: ERROR_CODES.GEOJSON_COORDINATES_INVALID, params: { index, longitude: lon ?? null, latitude: lat ?? null } });
    }
  }
  return { valid: errors.length === 0, errors, featureCount: featureCollection?.features?.length ?? 0 };
}
