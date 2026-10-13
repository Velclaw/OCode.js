import test from "node:test";
import assert from "node:assert/strict";
import { generateCompletion } from "../lib/ai/openai-compatible";

const keys = ["AI_API_KEY", "AI_MODEL", "AI_BASE_URL", "AI_PROVIDER"] as const;
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
function restore() { for (const key of keys) { const value = saved[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
function configure() { process.env.AI_API_KEY = "test-secret"; process.env.AI_MODEL = "test-model"; process.env.AI_BASE_URL = "https://provider.example/v1"; process.env.AI_PROVIDER = "test"; }

test("returns null when provider configuration is absent", async () => {
  try { delete process.env.AI_API_KEY; delete process.env.AI_MODEL; delete process.env.AI_BASE_URL; assert.equal(await generateCompletion("hello"), null); } finally { restore(); }
});
test("sends a bounded server-side request and parses text", async () => {
  try {
    configure(); let capturedUrl = ""; let capturedInit: RequestInit | undefined;
    const result = await generateCompletion("hello", async (input, init) => { capturedUrl = String(input); capturedInit = init; return new Response(JSON.stringify({ choices: [{ message: { content: "  Hello from model  " } }] }), { status: 200, headers: { "Content-Type": "application/json" } }); });
    assert.equal(capturedUrl, "https://provider.example/v1/chat/completions");
    assert.equal((capturedInit?.headers as Record<string,string>).Authorization, "Bearer test-secret");
    assert.equal(result?.content, "Hello from model"); assert.equal(result?.model, "test-model");
  } finally { restore(); }
});
test("does not expose provider response body or credentials on HTTP failure", async () => {
  try {
    configure(); await assert.rejects(() => generateCompletion("hello", async () => new Response("sensitive upstream response", { status: 429 })), /HTTP 429/);
  } finally { restore(); }
});
test("rejects non-HTTPS provider URLs outside local development", async () => {
  try { configure(); process.env.AI_BASE_URL = "http://provider.example"; await assert.rejects(() => generateCompletion("hello"), /must use HTTPS/); } finally { restore(); }
});
