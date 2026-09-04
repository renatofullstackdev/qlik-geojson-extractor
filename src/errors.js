import { ERROR_CODES } from "./codes.js";

export class QlikGeoJSONError extends Error {
  constructor(code, message, params = {}, details = {}) {
    super(message || code);
    this.name = "QlikGeoJSONError";
    this.code = code;
    this.params = params;
    Object.assign(this, details);
  }
}

export function coreError(code, message, params = {}, details = {}) {
  return new QlikGeoJSONError(code, message, params, details);
}

export function serializeError(error) {
  return {
    code: error?.code ?? null,
    params: error?.params ?? null,
    message: error?.message ?? String(error),
    qlik: error?.qlik ?? null,
    missing: error?.missing ?? null,
    validation: error?.validation ?? null
  };
}

export { ERROR_CODES };
