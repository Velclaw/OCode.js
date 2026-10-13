import test from "node:test";
import assert from "node:assert/strict";
import { isSameOriginRequest } from "../lib/request-security";

const requestUrl = "https://agent.example.com/api/chat";

test("accepts exact configured origin", () => {
  assert.equal(
    isSameOriginRequest(requestUrl, "https://agent.example.com", "https://agent.example.com", true),
    true,
  );
});

test("rejects missing, mismatched, malformed, and path-bearing origins", () => {
  assert.equal(isSameOriginRequest(requestUrl, null, "https://agent.example.com", true), false);
  assert.equal(isSameOriginRequest(requestUrl, "https://evil.example", "https://agent.example.com", true), false);
  assert.equal(isSameOriginRequest(requestUrl, "not-a-url", "https://agent.example.com", true), false);
  assert.equal(isSameOriginRequest(requestUrl, "https://agent.example.com/path", "https://agent.example.com", true), false);
});

test("requires APP_ORIGIN in production", () => {
  assert.equal(isSameOriginRequest(requestUrl, "https://agent.example.com", undefined, true), false);
});

test("allows request URL fallback only outside production", () => {
  assert.equal(isSameOriginRequest(requestUrl, "https://agent.example.com", undefined, false), true);
  assert.equal(isSameOriginRequest(requestUrl, "http://agent.example.com", undefined, false), false);
});
