export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function qlikFieldRef(fieldName) {
  return `[${String(fieldName).replace(/]/g, "]]" )}]`;
}

export function qTextOrNum(value) {
  if (!value) return null;
  if (typeof value.qText === "string" && value.qText !== "") return value.qText;
  if (typeof value.qNum === "number" && Number.isFinite(value.qNum)) return value.qNum;
  return null;
}

export function qNumOrText(value) {
  if (!value) return null;
  if (typeof value.qNum === "number" && Number.isFinite(value.qNum)) return value.qNum;
  if (typeof value.qText === "string" && value.qText !== "") return value.qText;
  return null;
}

export function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  let text = value.trim();
  if (!text) return null;
  if (/^-?\d+,\d+$/.test(text)) text = text.replace(",", ".");
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function validCoordinates(longitude, latitude) {
  return Number.isFinite(longitude) && Number.isFinite(latitude) &&
    longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

export function googleMapsUrl(longitude, latitude) {
  return "https://www.google.com/maps/dir/?api=1" +
    `&destination=${encodeURIComponent(`${latitude},${longitude}`)}` +
    "&travelmode=driving&dir_action=navigate";
}

export function wazeUrl(longitude, latitude) {
  return `https://waze.com/ul?ll=${encodeURIComponent(`${latitude},${longitude}`)}&navigate=yes`;
}

export function uniquePropertyName(target, wanted) {
  if (!Object.prototype.hasOwnProperty.call(target, wanted)) return wanted;
  let n = 2;
  while (Object.prototype.hasOwnProperty.call(target, `${wanted}_${n}`)) n++;
  return `${wanted}_${n}`;
}

export function joinBasePath(basePath, suffix) {
  const base = String(basePath ?? "").trim();
  const normalizedBase = base && base !== "/" ? `/${base.replace(/^\/+|\/+$/g, "")}` : "";
  return `${normalizedBase}/${String(suffix).replace(/^\/+/, "")}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
