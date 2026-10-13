import test from "node:test";
import assert from "node:assert/strict";
import { LoginRateLimiter } from "../lib/login-rate-limit";

test("blocks after the configured number of failures and resets after the window", () => {
  const limiter = new LoginRateLimiter(3, 1_000, 10);
  assert.equal(limiter.isBlocked("client-a", 100), false);
  assert.equal(limiter.recordFailure("client-a", 100), false);
  assert.equal(limiter.recordFailure("client-a", 200), false);
  assert.equal(limiter.recordFailure("client-a", 300), true);
  assert.equal(limiter.isBlocked("client-a", 999), true);
  assert.equal(limiter.isBlocked("client-a", 1_100), false);
  assert.equal(limiter.recordFailure("client-a", 1_100), false);
});

test("successful login can clear the client's attempt state", () => {
  const limiter = new LoginRateLimiter(2, 1_000, 10);
  limiter.recordFailure("client-a", 100);
  limiter.clear("client-a");
  assert.equal(limiter.isBlocked("client-a", 101), false);
  assert.equal(limiter.recordFailure("client-a", 101), false);
});

test("evicts least-recently-used keys when capacity is reached", () => {
  const limiter = new LoginRateLimiter(2, 1_000, 3);
  assert.equal(limiter.recordFailure("client-a", 100), false);
  assert.equal(limiter.recordFailure("client-a", 101), true);
  limiter.recordFailure("client-b", 100);
  limiter.recordFailure("client-c", 100);
  limiter.recordFailure("client-d", 100);
  assert.equal(limiter.isBlocked("client-a", 102), false);
  assert.equal(limiter.recordFailure("client-e", 103), false);
});
