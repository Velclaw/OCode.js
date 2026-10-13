import test from "node:test";
import assert from "node:assert/strict";
import {
  sleep, fetchJson, jsonHeaders, jsonRequest,
  readStorage, writeStorage, removeStorage
} from "../dist/index.js";

test("sleep validates duration and honors abort signals", async () => {
  await assert.rejects(sleep(-1), RangeError);
  const controller = new AbortController();
  const pending = sleep(1000, controller.signal);
  controller.abort(new Error("cancelled"));
  await assert.rejects(pending, /cancelled/);
  await sleep(0);
});

test("HTTP helpers build JSON requests and report failures", async () => {
  const headers = jsonHeaders({ "X-Test": "yes" });
  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("x-test"), "yes");

  const request = jsonRequest({ ok: true }, { method: "POST", headers: { "X-Test": "yes" } });
  assert.equal(request.method, "POST");
  assert.equal(request.body, JSON.stringify({ ok: true }));
  assert.equal(new Headers(request.headers).get("x-test"), "yes");
  assert.throws(() => jsonRequest(undefined), /not JSON-serializable/);
  assert.throws(() => jsonRequest(() => "not JSON"), /not JSON-serializable/);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
    assert.deepEqual(await fetchJson("https://example.test"), { ok: true });

    globalThis.fetch = async () => new Response("server failure", { status: 503, statusText: "Unavailable" });
    await assert.rejects(fetchJson("https://example.test"), /HTTP 503 Unavailable: server failure/);

    globalThis.fetch = async () => new Response(JSON.stringify({ error: "maintenance" }), { status: 503 });
    assert.deepEqual(
      await fetchJson("https://example.test", { throwOnHttpError: false }),
      { error: "maintenance" }
    );

    globalThis.fetch = async () => new Response("not json", { status: 200 });
    await assert.rejects(fetchJson("https://example.test"), /not valid JSON/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("storage helpers handle malformed values and storage exceptions", () => {
  const data = new Map();
  const storage = {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, value); },
    removeItem(key) { data.delete(key); }
  };
  assert.equal(readStorage(storage, "missing", 9), 9);
  assert.equal(writeStorage(storage, "config", { enabled: true }), true);
  assert.deepEqual(readStorage(storage, "config", null), { enabled: true });
  data.set("broken", "{");
  assert.equal(readStorage(storage, "broken", "fallback"), "fallback");
  assert.equal(removeStorage(storage, "config"), true);
  assert.equal(data.has("config"), false);

  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); }
  };
  assert.equal(readStorage(blocked, "key", "fallback"), "fallback");
  assert.equal(writeStorage(blocked, "key", 1), false);
  assert.equal(removeStorage(blocked, "key"), false);
});
