import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {allowedGitHubLogin,createSessionToken,getSessionLogin,verifySessionToken} from "../lib/auth";

process.env.SESSION_SECRET="test-only-session-secret-with-more-than-32-characters";

test("accepts a valid signed GitHub session token",()=>{
  const now=1_800_000_000_000;
  const token=createSessionToken(now,"zskbot");
  assert.equal(verifySessionToken(token,now),true);
  assert.equal(getSessionLogin(token,now),"zskbot");
});

test("rejects expired, altered, and missing session tokens",()=>{
  const now=1_800_000_000_000;
  const token=createSessionToken(now,"zskbot");
  assert.equal(verifySessionToken(token,now+12*60*60*1000+1),false);
  assert.equal(verifySessionToken(token+"x",now),false);
  assert.equal(verifySessionToken(undefined,now),false);
});

test("rejects legacy password-admin session tokens",()=>{
  const now=1_800_000_000_000;
  const payload=Buffer.from(JSON.stringify({sub:"admin",exp:now+60_000})).toString("base64url");
  const token=payload+"."+createHmac("sha256",process.env.SESSION_SECRET!).update(payload).digest("base64url");
  assert.equal(verifySessionToken(token,now),false);
});

test("rejects a token signed with a different secret",()=>{
  const now=1_800_000_000_000;
  const token=createSessionToken(now,"zskbot");
  process.env.SESSION_SECRET="another-test-secret-that-is-also-longer-than-32-characters";
  assert.equal(verifySessionToken(token,now),false);
});

test("GitHub allowlist is explicit and case-insensitive",()=>{
  process.env.GITHUB_ALLOWED_USERS="zskbot, approved-user ";
  assert.equal(allowedGitHubLogin("ZSKBOT"),true);
  assert.equal(allowedGitHubLogin("approved-user"),true);
  assert.equal(allowedGitHubLogin("random-user"),false);
  process.env.GITHUB_ALLOWED_USERS="";
  assert.equal(allowedGitHubLogin("zskbot"),false);
});
