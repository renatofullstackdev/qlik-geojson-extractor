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

export function extractQlikFieldReferences(value) {
  const text = String(value ?? "");
  const fields = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "[") continue;
    let field = "";
    let closed = false;
    for (i += 1; i < text.length; i += 1) {
      if (text[i] !== "]") {
        field += text[i];
        continue;
      }
      if (text[i + 1] === "]") {
        field += "]";
        i += 1;
        continue;
      }
      closed = true;
      break;
    }
    if (closed && field && !fields.includes(field)) fields.push(field);
  }
  return fields;
}

/**
 * Returns true only for syntax that is strongly indicative of a Qlik
 * expression. The function deliberately avoids treating punctuation that is
 * common in field names (spaces, parentheses in labels, slashes, hyphens) as
 * sufficient evidence by itself.
 */
export function looksLikeQlikExpression(value) {
  let raw = String(value ?? "").trim();
  if (!raw) return false;
  if (raw.startsWith("=")) raw = raw.slice(1).trim();
  if (!raw) return false;

  // Function call at the beginning, e.g. Only(...), maxstring(...), If(...).
  if (/^[\p{L}_$%][\p{L}\p{N}_.$%]*\s*\(/u.test(raw)) return true;
  // Set analysis / aggregation fragments.
  if (/\{\s*</.test(raw) || />\s*\}/.test(raw)) return true;
  // Explicit expression operators around field references or literals.
  if (/(?:\[[^\]]+\]|\)|\d|['"])[ \t]*(?:\+|\*|&|\/|<=|>=|<>|=)[ \t]*(?:\[[^\]]+\]|\(|\d|['"])/u.test(raw)) return true;
  return false;
}

/**
 * Resolves Qlik references that are only a direct field reference.
 *
 * Examples:
 *   LATITUDE                -> LATITUDE
 *   =LATITUDE               -> LATITUDE
 *   [ENTITY NAME]           -> ENTITY NAME
 *   =[ENTITY NAME]          -> ENTITY NAME
 *   Field With Spaces         -> Field With Spaces
 *
 * Complex expressions are deliberately not guessed:
 *   =Only([LATITUDE])       -> null
 *   maxstring([Location])   -> null
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

  if (looksLikeQlikExpression(expression)) return null;

  if (hadEquals) {
    // A leading '=' makes the value a Qlik expression. Only accept it when it
    // is clearly a bare field identifier.
    return /^[\p{L}_$%][\p{L}\p{N}_.$%]*$/u.test(expression) ? expression : null;
  }

  return expression;
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

/**
 * Parses only the native Qlik point representation: [longitude, latitude].
 * It intentionally does not geocode names/addresses and does not guess WKT or
 * arbitrary delimited strings.
 */
export function parseQlikPoint(value) {
  let candidate = value;
  if (typeof candidate === "string") {
    const text = candidate.trim();
    if (!text.startsWith("[") || !text.endsWith("]")) return null;
    try {
      candidate = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(candidate) || candidate.length !== 2) return null;
  const longitude = numberOrNull(candidate[0]);
  const latitude = numberOrNull(candidate[1]);
  return validCoordinates(longitude, latitude) ? { longitude, latitude } : null;
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
