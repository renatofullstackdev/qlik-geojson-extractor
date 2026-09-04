import { joinBasePath } from "./utils.js";
import { coreError, ERROR_CODES } from "./errors.js";

export class QixClient {
  constructor({ host = globalThis.location?.host, protocol, virtualProxyPath = "", csrfPath, identityPrefix = "qlik-geojson" } = {}) {
    if (!host) throw coreError(ERROR_CODES.QLIK_HOST_REQUIRED, "Qlik host is required outside a browser page.");
    this.host = host;
    this.protocol = protocol ?? (globalThis.location?.protocol === "https:" ? "wss:" : "ws:");
    this.httpProtocol = this.protocol === "wss:" ? "https:" : "http:";
    this.virtualProxyPath = virtualProxyPath;
    this.csrfPath = csrfPath ?? joinBasePath(virtualProxyPath, "/qps/csrftoken");
    this.identityPrefix = identityPrefix;
    this.ws = null;
    this.pending = new Map();
    this.nextId = 1;
    this.docHandle = null;
    this.appId = null;
  }

  async fetchCsrfToken() {
    const url = this.csrfPath.startsWith("http")
      ? this.csrfPath
      : `${this.httpProtocol}//${this.host}${this.csrfPath}`;
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok && response.status !== 204) {
      throw coreError(
        ERROR_CODES.CSRF_FETCH_FAILED,
        `Failed to obtain Qlik CSRF token: ${response.status} ${response.statusText}`,
        { status: response.status, statusText: response.statusText, url }
      );
    }
    const token = response.headers.get("qlik-csrf-token");
    if (!token) {
      throw coreError(ERROR_CODES.CSRF_TOKEN_MISSING, "Qlik response did not contain qlik-csrf-token.", { url });
    }
    return token;
  }

  async connect(appId, { identity = `${this.identityPrefix}-${crypto.randomUUID()}` } = {}) {
    if (this.ws) throw coreError(ERROR_CODES.CLIENT_ALREADY_CONNECTED, "QixClient is already connected.");
    const csrfToken = await this.fetchCsrfToken();
    const appPath = joinBasePath(this.virtualProxyPath, `/app/${encodeURIComponent(appId)}/identity/${encodeURIComponent(identity)}`);
    const wsUrl = `${this.protocol}//${this.host}${appPath}?qlik-csrf-token=${encodeURIComponent(csrfToken)}`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    this.identity = identity;

    ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.id === undefined) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) {
        const error = coreError(
          ERROR_CODES.QIX_RPC_ERROR,
          `${message.error.code}: ${message.error.message}`,
          { qixCode: message.error.code, qixMessage: message.error.message },
          { qlik: message.error }
        );
        request.reject(error);
      } else {
        request.resolve(message.result);
      }
    };

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(coreError(ERROR_CODES.WEBSOCKET_OPEN_FAILED, "Could not open Qlik Engine WebSocket.", { wsUrl }));
    });

    this.appId = appId;
    return { wsUrl, identity };
  }

  rpc(handle, method, params = []) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw coreError(ERROR_CODES.WEBSOCKET_NOT_OPEN, "Qlik WebSocket is not open.", { method, handle });
    }
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params }));
    });
  }

  async openDoc(appId = this.appId) {
    const result = await this.rpc(-1, "OpenDoc", [appId]);
    const handle = result?.qReturn?.qHandle;
    if (typeof handle !== "number") {
      throw coreError(ERROR_CODES.OPENDOC_INVALID_HANDLE, "OpenDoc did not return a valid document handle.", { appId });
    }
    this.docHandle = handle;
    return handle;
  }

  async connectAndOpen(appId, options) {
    const connection = await this.connect(appId, options);
    const docHandle = await this.openDoc(appId);
    return { ...connection, docHandle };
  }

  close() {
    try { this.ws?.close(); } finally {
      this.ws = null;
      this.docHandle = null;
      for (const { reject } of this.pending.values()) {
        reject(coreError(ERROR_CODES.CONNECTION_CLOSED, "Qlik connection closed."));
      }
      this.pending.clear();
    }
  }
}
