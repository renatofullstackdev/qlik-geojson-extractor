import { normalizeName } from "./utils.js";

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
  if (typeof handle !== "number") throw new Error("Could not create Qlik field-list session object.");
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

export function suggestEntityKeys(fields, { latitudeField, longitudeField, limit = 12 } = {}) {
  const lat = fields.find((f) => f.qName === latitudeField);
  const lon = fields.find((f) => f.qName === longitudeField);
  const target = Math.max(lat?.qCardinal ?? 0, lon?.qCardinal ?? 0);

  return fields
    .map((field) => {
      const name = normalizeName(field.qName);
      let score = 0;
      const reasons = [];
      if ((field.qTags ?? []).includes("$key")) { score += 50; reasons.push("tag:$key"); }
      if (/^(ID|COD|KEY|CHAVE)_/.test(name) || /_(ID|COD|KEY|CHAVE)$/.test(name)) { score += 25; reasons.push("name:key-like"); }
      if (/OBJETO/.test(name)) { score += 10; reasons.push("name:objeto"); }
      if (target && Number.isFinite(field.qCardinal)) {
        const distance = Math.abs(field.qCardinal - target);
        const closeness = Math.max(0, 30 - distance);
        score += closeness;
        if (distance <= 2) reasons.push(`cardinality≈coordinates(${target})`);
      }
      return { field: field.qName, cardinality: field.qCardinal, score, reasons };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || String(a.field).localeCompare(String(b.field)))
    .slice(0, limit);
}
