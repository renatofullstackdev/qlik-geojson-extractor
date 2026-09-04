import test from "node:test";
import assert from "node:assert/strict";
import { QixClient } from "../src/qix-client.js";
import { ERROR_CODES } from "../src/codes.js";

class FakeWebSocket {
  static OPEN = 1;
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); });
  }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
}

function withGlobals(t, { fetchImpl, websocket = FakeWebSocket }) {
  const oldFetch = globalThis.fetch;
  const oldWebSocket = globalThis.WebSocket;
  globalThis.fetch = fetchImpl;
  globalThis.WebSocket = websocket;
  t.after(() => { globalThis.fetch = oldFetch; globalThis.WebSocket = oldWebSocket; FakeWebSocket.instances.length = 0; });
}

function csrfResponse({ ok = true, status = 200, statusText = "OK", token = "csrf" } = {}) {
  return { ok, status, statusText, headers: { get: (name) => name === "qlik-csrf-token" ? token : null } };
}

test("QixClient obtains CSRF and opens an isolated WebSocket", async (t) => {
  withGlobals(t, { fetchImpl: async () => csrfResponse() });
  const client = new QixClient({ host: "example.test", protocol: "wss:" });
  const result = await client.connect("APP", { identity: "test-id" });
  assert.equal(result.identity, "test-id");
  assert.match(result.wsUrl, /\/app\/APP\/identity\/test-id\?qlik-csrf-token=csrf$/);
});

test("QixClient reports missing CSRF token with a structured code", async (t) => {
  withGlobals(t, { fetchImpl: async () => csrfResponse({ token: null }) });
  const client = new QixClient({ host: "example.test", protocol: "wss:" });
  await assert.rejects(() => client.fetchCsrfToken(), (error) => error.code === ERROR_CODES.CSRF_TOKEN_MISSING);
});

test("QixClient routes concurrent RPC responses by request id even out of order", async (t) => {
  withGlobals(t, { fetchImpl: async () => csrfResponse() });
  const client = new QixClient({ host: "example.test", protocol: "wss:" });
  await client.connect("APP", { identity: "id" });
  const ws = FakeWebSocket.instances[0];
  const first = client.rpc(1, "First", []);
  const second = client.rpc(1, "Second", []);
  const [firstRequest, secondRequest] = ws.sent;
  ws.onmessage({ data: JSON.stringify({ jsonrpc: "2.0", id: secondRequest.id, result: { value: 2 } }) });
  ws.onmessage({ data: JSON.stringify({ jsonrpc: "2.0", id: firstRequest.id, result: { value: 1 } }) });
  assert.deepEqual(await first, { value: 1 });
  assert.deepEqual(await second, { value: 2 });
});

test("QixClient preserves QIX error details under a structured error code", async (t) => {
  withGlobals(t, { fetchImpl: async () => csrfResponse() });
  const client = new QixClient({ host: "example.test", protocol: "wss:" });
  await client.connect("APP", { identity: "id" });
  const ws = FakeWebSocket.instances[0];
  const promise = client.rpc(1, "Broken", []);
  const req = ws.sent[0];
  ws.onmessage({ data: JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: 123, message: "engine error" } }) });
  await assert.rejects(promise, (error) => error.code === ERROR_CODES.QIX_RPC_ERROR && error.qlik.code === 123);
});
