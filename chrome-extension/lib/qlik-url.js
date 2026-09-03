export function parseQlikSenseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      isQlikSheet: false,
      origin: null,
      host: null,
      appId: null,
      sheetId: null,
      virtualProxyPath: ""
    };
  }

  const match = url.pathname.match(/^(.*?)\/sense\/app\/([^/]+)\/sheet\/([^/]+)(?:\/|$)/i);
  if (!match) {
    return {
      isQlikSheet: false,
      origin: url.origin,
      host: url.host,
      appId: null,
      sheetId: null,
      virtualProxyPath: ""
    };
  }

  const prefix = match[1].replace(/\/+$/g, "");

  return {
    isQlikSheet: true,
    origin: url.origin,
    host: url.host,
    appId: safeDecode(match[2]),
    sheetId: safeDecode(match[3]),
    virtualProxyPath: prefix && prefix !== "/" ? prefix : ""
  };
}

export function hostPermissionPattern(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  // Chrome match patterns do not need a port. A host permission granted for
  // this hostname covers the matching scheme on that host.
  return `${url.protocol}//${url.hostname}/*`;
}

export function configStorageKey({ origin, appId, sheetId }) {
  if (!origin || !appId || !sheetId) return null;
  return `qlik-geojson-extractor:v1:${origin}:${appId}:${sheetId}`;
}

export function safeFilename(value, fallback = "qlik_points") {
  const cleaned = String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  return cleaned || fallback;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
