import { extractQlikFieldReferences, looksLikeQlikExpression, qlikFieldRef, resolveSimpleQlikFieldReference } from "./utils.js";
import { coreError, ERROR_CODES } from "./errors.js";

export function walkPropertyTree(entry, path = "sheet", output = []) {
  if (!entry) return output;
  if (entry.qProperty) output.push({ path, property: entry.qProperty });
  for (const [index, child] of (entry.qChildren ?? []).entries()) {
    const childId = child?.qProperty?.qInfo?.qId ?? `child-${index}`;
    walkPropertyTree(child, `${path}/${childId}`, output);
  }
  return output;
}

export async function inspectSheet(client, sheetId) {
  const sheetResult = await client.rpc(client.docHandle, "GetObject", [sheetId]);
  const sheetHandle = sheetResult?.qReturn?.qHandle;
  if (typeof sheetHandle !== "number") {
    throw coreError(ERROR_CODES.SHEET_GET_FAILED, `Could not get sheet ${sheetId}.`, { sheetId });
  }
  const treeResult = await client.rpc(sheetHandle, "GetFullPropertyTree", []);
  const tree = treeResult?.qPropEntry;
  if (!tree) {
    throw coreError(ERROR_CODES.PROPERTY_TREE_MISSING, `GetFullPropertyTree returned no qPropEntry for ${sheetId}.`, { sheetId });
  }
  const objects = walkPropertyTree(tree);
  const pointLayers = [];
  for (const object of objects) {
    const layers = object.property?.gaLayers;
    if (!Array.isArray(layers)) continue;
    layers.forEach((layer, layerIndex) => {
      if (/pointlayer/i.test(layer?.type ?? "")) {
        pointLayers.push({
          objectPath: object.path,
          objectId: object.property?.qInfo?.qId,
          layerIndex,
          layerId: layer.id ?? layer.cId ?? null,
          layer
        });
      }
    });
  }
  return { sheetId, tree, objects, pointLayers };
}

function knownFieldSet(knownFields = []) {
  return new Set(knownFields.map((item) => typeof item === "string" ? item : item?.qName ?? item?.name).filter(Boolean));
}

export function coordinateDefinition(rawValue, knownFields = []) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return { kind: "unknown", raw: null, field: null, expression: null, referencedFields: [] };

  const fields = knownFieldSet(knownFields);
  const withoutEquals = raw.startsWith("=") ? raw.slice(1).trim() : raw;
  if (fields.has(withoutEquals)) {
    return { kind: "field", raw, field: withoutEquals, expression: qlikFieldRef(withoutEquals), referencedFields: [withoutEquals] };
  }

  const field = resolveSimpleQlikFieldReference(raw);
  if (field && (!fields.size || fields.has(field) || !looksLikeQlikExpression(raw))) {
    return { kind: "field", raw, field, expression: qlikFieldRef(field), referencedFields: [field] };
  }

  if (looksLikeQlikExpression(raw) || raw.startsWith("=")) {
    const expression = raw.startsWith("=") ? raw.slice(1).trim() : raw;
    return {
      kind: "expression",
      raw,
      field: null,
      expression: expression || null,
      referencedFields: extractQlikFieldReferences(expression)
    };
  }

  return { kind: "unknown", raw, field: null, expression: null, referencedFields: [] };
}

function resolvedDimension(value, knownFields) {
  return coordinateDefinition(value, knownFields).field ?? resolveSimpleQlikFieldReference(value) ?? value ?? null;
}

export function summarizePointLayers(pointLayers, knownFields = []) {
  return pointLayers.map((item) => {
    const locationRaw = item.layer?.locationOrLatitude?.key ?? null;
    const longitudeRaw = item.layer?.longitude?.key ?? null;
    const isLatLong = item.layer?.isLatLong === true;
    const primaryDefinition = coordinateDefinition(locationRaw, knownFields);
    const configuredLongitudeDefinition = coordinateDefinition(longitudeRaw, knownFields);
    const latitudeDefinition = isLatLong ? primaryDefinition : null;
    const longitudeDefinition = isLatLong ? configuredLongitudeDefinition : null;
    const locationDefinition = isLatLong ? null : primaryDefinition;
    const visualDimensionsRaw = item.layer?.qHyperCubeDef?.qDimensions
      ?.flatMap((d) => d?.qDef?.qFieldDefs ?? []) ?? [];

    const spatialSource = isLatLong
      ? { type: "coordinates", latitudeDefinition, longitudeDefinition }
      : { type: "location", locationDefinition };

    return {
      objectId: item.objectId,
      layerId: item.layerId,
      layerIndex: item.layerIndex,
      isLatLong,
      spatialMode: spatialSource.type,
      spatialSource,
      locationOrLatitude: primaryDefinition.field ?? primaryDefinition.expression ?? locationRaw,
      longitude: isLatLong ? (configuredLongitudeDefinition.field ?? configuredLongitudeDefinition.expression ?? longitudeRaw) : null,
      latitudeDefinition,
      longitudeDefinition,
      locationDefinition,
      // Preserve inactive configuration for diagnostics only. It must not be
      // interpreted as an active longitude when isLatLong=false.
      residualLongitudeDefinition: isLatLong ? null : configuredLongitudeDefinition,
      visualDimensions: visualDimensionsRaw.map((value) => resolvedDimension(value, knownFields)),
      locationOrLatitudeRaw: locationRaw,
      longitudeRaw,
      visualDimensionsRaw,
      measureCount: item.layer?.qHyperCubeDef?.qMeasures?.length ?? 0,
      maxObjects: item.layer?.maxObjects ?? null
    };
  });
}
