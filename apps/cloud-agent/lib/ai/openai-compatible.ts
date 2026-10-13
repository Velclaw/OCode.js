export type ChatCompletion = { content: string; model: string; provider: string };
type ProviderConfig = { baseUrl: string; apiKey: string; model: string; provider: string };
type FetchLike = typeof fetch;

function readConfig(): ProviderConfig | null {
  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  const rawBaseUrl = process.env.AI_BASE_URL?.trim();
  if (!apiKey || !model || !rawBaseUrl) return null;
  let parsed: URL;
  try { parsed = new URL(rawBaseUrl); } catch { throw new Error("AI_BASE_URL must be a valid absolute URL."); }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && parsed.protocol === "http:")) {
    throw new Error("AI_BASE_URL must use HTTPS outside local development.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("AI_BASE_URL must not contain credentials, query parameters, or fragments.");
  return { baseUrl: rawBaseUrl.replace(/\/+$/, ""), apiKey, model, provider: process.env.AI_PROVIDER?.trim() || "openai-compatible" };
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY?.trim() && process.env.AI_MODEL?.trim() && process.env.AI_BASE_URL?.trim());
}

export async function generateCompletion(prompt: string, fetcher: FetchLike = fetch): Promise<ChatCompletion | null> {
  const config = readConfig();
  if (!config) return null;
  const endpoint = config.baseUrl.endsWith("/chat/completions") ? config.baseUrl : config.baseUrl + "/chat/completions";
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Authorization": "Bearer " + config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: prompt.slice(0, 12000) }], temperature: 0.2, max_tokens: 1200 }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch {
    throw new Error("AI provider request failed or timed out.");
  }
  if (!response.ok) throw new Error("AI provider returned HTTP " + response.status + ". Check provider configuration and quota.");
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error("AI provider returned invalid JSON."); }
  if (!payload || typeof payload !== "object") throw new Error("AI provider returned an invalid response.");
  const choices = (payload as { choices?: unknown }).choices;
  const first = Array.isArray(choices) ? choices[0] : null;
  const message = first && typeof first === "object" ? (first as { message?: { content?: unknown } }).message : null;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("AI provider response did not contain text.");
  return { content: content.trim().slice(0, 12000), model: config.model, provider: config.provider };
}
