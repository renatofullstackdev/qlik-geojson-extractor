import { joinBasePath } from "./utils.js";

export class QixClient {
  constructor({ host = globalThis.location?.host, protocol, virtualProxyPath = "", csrfPath, identityPrefix = "qlik-geojson" } = {}) {
    if (!host) throw new Error("Qlik host is required outside a browser page.");
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
      throw new Error(`Failed to obtain Qlik CSRF token: ${response.status} ${response.statusText}`);
    }
    const token = response.headers.get("qlik-csrf-token");
    if (!token) throw new Error("Qlik response did not contain qlik-csrf-token.");
    return token;
  }

  async connect(appId, { identity = `${this.identityPrefix}-${crypto.randomUUID()}` } = {}) {
    if (this.ws) throw new Error("QixClient is already connected.");
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
        const error = new Error(`${message.error.code}: ${message.error.message}`);
        error.qlik = message.error;
        request.reject(error);
      } else {
        request.resolve(message.result);
      }
    };

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error("Could not open Qlik Engine WebSocket."));
    });

    this.appId = appId;
    return { wsUrl, identity };
  }

  rpc(handle, method, params = []) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("Qlik WebSocket is not open.");
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params }));
    });
  }

  async openDoc(appId = this.appId) {
    const result = await this.rpc(-1, "OpenDoc", [appId]);
    const handle = result?.qReturn?.qHandle;
    if (typeof handle !== "number") throw new Error("OpenDoc did not return a valid document handle.");
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
      for (const { reject } of this.pending.values()) reject(new Error("Qlik connection closed."));
      this.pending.clear();
    }
  }
}
