import test from "node:test";
import assert from "node:assert/strict";
import {createSessionToken,verifySessionToken} from "../lib/auth";

process.env.SESSION_SECRET="test-only-session-secret-with-more-than-32-characters";

test("accepts a valid signed session token",()=>{
  const now=1_800_000_000_000;
  const token=createSessionToken(now);
  assert.equal(verifySessionToken(token,now),true);
});

test("rejects expired, altered, and missing session tokens",()=>{
  const now=1_800_000_000_000;
  const token=createSessionToken(now);
  assert.equal(verifySessionToken(token,now+12*60*60*1000+1),false);
  assert.equal(verifySessionToken(token+"x",now),false);
  assert.equal(verifySessionToken(undefined,now),false);
});

test("rejects a token signed with a different secret",()=>{
  const now=1_800_000_000_000;
  const token=createSessionToken(now);
  process.env.SESSION_SECRET="another-test-secret-that-is-also-longer-than-32-characters";
  assert.equal(verifySessionToken(token,now),false);
});
