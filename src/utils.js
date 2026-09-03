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

/**
 * Resolves Qlik references that are only a direct field reference.
 *
 * Examples:
 *   LATITUDE                -> LATITUDE
 *   =LATITUDE               -> LATITUDE
 *   [ENTITY NAME]           -> ENTITY NAME
 *   =[ENTITY NAME]          -> ENTITY NAME
 *
 * Complex expressions are deliberately not guessed:
 *   =Only([LATITUDE])       -> null
 */
export function resolveSimpleQlikFieldReference(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const hadEquals = raw.startsWith("=");
  const expression = hadEquals ? raw.slice(1).trim() : raw;
  if (!expression) return null;

  if (expression.startsWith("[") && expression.endsWith("]")) {
    const inner = expression.slice(1, -1);
    let fieldName = "";

    for (let i = 0; i < inner.length; i += 1) {
      if (inner[i] !== "]") {
        fieldName += inner[i];
        continue;
      }

      if (inner[i + 1] === "]") {
        fieldName += "]";
        i += 1;
        continue;
      }

      return null;
    }

    return fieldName || null;
  }

  if (!hadEquals) return expression;

  // A leading '=' makes the value a Qlik expression. Only accept the
  // expression when it is clearly a bare field identifier.
  if (/^[\p{L}_$%][\p{L}\p{N}_.$%]*$/u.test(expression)) {
    return expression;
  }

  return null;
}

export function qTextOrNum(value) {
  if (!value || value.qIsNull === true) return null;
  if (typeof value.qText === "string" && value.qText !== "") return value.qText;
  if (typeof value.qNum === "number" && Number.isFinite(value.qNum)) return value.qNum;
  return null;
}

export function qNumOrText(value) {
  if (!value || value.qIsNull === true) return null;
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
