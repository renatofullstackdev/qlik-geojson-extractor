import { qlikFieldRef, resolveSimpleQlikFieldReference } from "./utils.js";
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

export function coordinateDefinition(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return { kind: "unknown", raw: null, field: null, expression: null };
  const field = resolveSimpleQlikFieldReference(raw);
  if (field) {
    return { kind: "field", raw, field, expression: qlikFieldRef(field) };
  }
  if (raw.startsWith("=")) {
    const expression = raw.slice(1).trim();
    return { kind: "expression", raw, field: null, expression: expression || null };
  }
  return { kind: "field", raw, field: raw, expression: qlikFieldRef(raw) };
}

function resolvedDimension(value) {
  return resolveSimpleQlikFieldReference(value) ?? value ?? null;
}

export function summarizePointLayers(pointLayers) {
  return pointLayers.map((item) => {
    const latitudeRaw = item.layer?.locationOrLatitude?.key ?? null;
    const longitudeRaw = item.layer?.longitude?.key ?? null;
    const latitudeDefinition = coordinateDefinition(latitudeRaw);
    const longitudeDefinition = coordinateDefinition(longitudeRaw);
    const visualDimensionsRaw = item.layer?.qHyperCubeDef?.qDimensions
      ?.flatMap((d) => d?.qDef?.qFieldDefs ?? []) ?? [];

    return {
      objectId: item.objectId,
      layerId: item.layerId,
      layerIndex: item.layerIndex,
      isLatLong: !!item.layer?.isLatLong,
      locationOrLatitude: latitudeDefinition.field ?? latitudeRaw,
      longitude: longitudeDefinition.field ?? longitudeRaw,
      latitudeDefinition,
      longitudeDefinition,
      visualDimensions: visualDimensionsRaw.map(resolvedDimension),
      locationOrLatitudeRaw: latitudeRaw,
      longitudeRaw,
      visualDimensionsRaw,
      measureCount: item.layer?.qHyperCubeDef?.qMeasures?.length ?? 0,
      maxObjects: item.layer?.maxObjects ?? null
    };
  });
}
