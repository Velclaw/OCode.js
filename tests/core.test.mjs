import test from "node:test";
import assert from "node:assert/strict";
import {
  OCODE_NAME, OCODE_VERSION, slugify, capitalize, toKebabCase, escapeHtml, truncate,
  pick, omit, deepMerge, getPath, cloneJson, retry, dedupeAsync, withTimeout,
  withQuery, joinUrl, parseUrl, stripTrackingParams, isEmail, isHttpUrl, isRecord,
  isWithinRange, getEnv, requireEnv, getEnvBoolean, getEnvNumber, createLogger
} from "../dist/index.js";

test("package metadata exports", () => {
  assert.equal(OCODE_NAME, "OCode.js");
  assert.equal(OCODE_VERSION, "0.1.0");
});
test("string helpers", () => {
  assert.equal(slugify(" Crème brûlée & JS "), "creme-brulee-js");
  assert.equal(capitalize("hello"), "Hello");
  assert.equal(toKebabCase("HTTPServer_name"), "http-server-name");
  assert.equal(escapeHtml("<script a='x'>"), "&lt;script a=&#39;x&#39;&gt;");
  assert.equal(truncate("hello world", 8), "hello w…");
  assert.throws(() => truncate("x", -1), RangeError);
});
test("object helpers do not mutate inputs", () => {
  const input = { a: 1, b: 2, nested: { left: true } };
  assert.deepEqual(pick(input, ["a"]), { a: 1 });
  assert.deepEqual(omit(input, ["b"]), { a: 1, nested: { left: true } });
  assert.deepEqual(deepMerge({ nested: { a: 1 }, list: [1] }, { nested: { b: 2 }, list: [2] }), { nested: { a: 1, b: 2 }, list: [2] });
  assert.equal(getPath(input, "nested.left"), true);
  assert.equal(getPath(input, "nested.missing", "fallback"), "fallback");
  assert.deepEqual(cloneJson(input), input);

  const malicious = JSON.parse('{"__proto__":{"polluted":true}}');
  const merged = deepMerge({}, malicious);
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(merged, "__proto__"), true);
  assert.equal(Object.prototype.polluted, undefined);

  const picked = pick(malicious, ["__proto__"]);
  assert.equal(Object.getPrototypeOf(picked), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(picked, "__proto__"), true);
  const omitted = omit(malicious, []);
  assert.equal(Object.getPrototypeOf(omitted), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(omitted, "__proto__"), true);
  assert.equal(Object.prototype.polluted, undefined);
});
test("async helpers retry, dedupe and time out", async () => {
  let count = 0;
  assert.equal(await retry(async () => { count++; if (count < 2) throw new Error("retry"); return "ok"; }, { attempts: 2, delayMs: 0 }), "ok");
  await assert.rejects(retry(async () => "unused", { delayMs: Number.NaN }), RangeError);
  await assert.rejects(retry(async () => "unused", { factor: Number.POSITIVE_INFINITY }), RangeError);
  await assert.rejects(retry(async () => "unused", { maxDelayMs: Number.POSITIVE_INFINITY }), RangeError);
  let calls = 0;
  const once = dedupeAsync(async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 5)); return 7; });
  assert.deepEqual(await Promise.all([once(), once()]), [7, 7]);
  assert.equal(calls, 1);
  await assert.rejects(withTimeout(new Promise((resolve) => setTimeout(resolve, 30)), 1), /timed out/);
});
test("URL helpers", () => {
  assert.equal(withQuery("/docs?a=1", { a: 2, empty: null }), "/docs?a=2");
  assert.equal(withQuery("/docs?x=1#section", { x: [2, 3], keep: false }), "/docs?x=2&x=3&keep=false#section");
  assert.equal(joinUrl("https://example.com/", "/api/", "/v1"), "https://example.com/api/v1");
  assert.equal(joinUrl(), "");
  assert.equal(parseUrl("not a url"), null);
  assert.equal(stripTrackingParams("https://example.com/?utm_source=x&FBCLID=abc&id=2").search, "?id=2");
});
test("validation and environment helpers", () => {
  assert.equal(isEmail("dev@example.com"), true);
  assert.equal(isEmail("bad"), false);
  assert.equal(isHttpUrl("https://example.com"), true);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isRecord({ a: 1 }), true);
  assert.equal(isRecord([]), false);
  assert.equal(isWithinRange(4, 1, 5), true);
  const source = { A: "value", EMPTY: " ", FLAG: "yes", COUNT: "42", BAD: "4x" };
  assert.equal(getEnv("A", "fallback", { source }), "value");
  assert.equal(getEnv("__proto__", "fallback", { source }), "fallback");
  assert.equal(getEnv("constructor", "fallback", { source }), "fallback");
  assert.throws(() => requireEnv("MISSING", { source }), /MISSING/);
  assert.equal(getEnvBoolean("FLAG", false, { source }), true);
  assert.equal(getEnvNumber("COUNT", 0, { source }), 42);
  assert.equal(getEnvNumber("BAD", 9, { source }), 9);
});
test("logger filters levels", () => {
  const entries = [];
  const sink = Object.fromEntries(["debug", "info", "warn", "error"].map((level) => [level, (...args) => entries.push([level, ...args])]));
  const logger = createLogger({ level: "warn", prefix: "test", sink });
  logger.info("hidden");
  logger.warn("visible");
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], ["warn", "[test]", "visible"]);
});
