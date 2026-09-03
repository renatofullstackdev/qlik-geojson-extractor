import { resolveSimpleQlikFieldReference } from "./utils.js";

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
  if (typeof sheetHandle !== "number") throw new Error(`Could not get sheet ${sheetId}.`);
  const treeResult = await client.rpc(sheetHandle, "GetFullPropertyTree", []);
  const tree = treeResult?.qPropEntry;
  if (!tree) throw new Error(`GetFullPropertyTree returned no qPropEntry for ${sheetId}.`);
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

function resolvedFieldReference(value) {
  return resolveSimpleQlikFieldReference(value) ?? value ?? null;
}

export function summarizePointLayers(pointLayers) {
  return pointLayers.map((item) => {
    const latitudeRaw = item.layer?.locationOrLatitude?.key ?? null;
    const longitudeRaw = item.layer?.longitude?.key ?? null;
    const visualDimensionsRaw = item.layer?.qHyperCubeDef?.qDimensions
      ?.flatMap((d) => d?.qDef?.qFieldDefs ?? []) ?? [];

    return {
      objectId: item.objectId,
      layerId: item.layerId,
      layerIndex: item.layerIndex,
      isLatLong: !!item.layer?.isLatLong,
      locationOrLatitude: resolvedFieldReference(latitudeRaw),
      longitude: resolvedFieldReference(longitudeRaw),
      visualDimensions: visualDimensionsRaw.map(resolvedFieldReference),
      locationOrLatitudeRaw: latitudeRaw,
      longitudeRaw,
      visualDimensionsRaw,
      measureCount: item.layer?.qHyperCubeDef?.qMeasures?.length ?? 0,
      maxObjects: item.layer?.maxObjects ?? null
    };
  });
}
