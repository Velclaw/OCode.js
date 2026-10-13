export interface FetchJsonOptions extends RequestInit { throwOnHttpError?: boolean; }
/** Fetch JSON and throw useful errors for HTTP failures or invalid JSON. */
export async function fetchJson<T = unknown>(input: RequestInfo | URL, init: FetchJsonOptions = {}): Promise<T> {
  const { throwOnHttpError = true, ...requestInit } = init;
  const response = await fetch(input, requestInit);
  if (throwOnHttpError && !response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error("HTTP " + response.status + " " + response.statusText + (body ? ": " + body.slice(0, 300) : ""));
  }
  try { return await response.json() as T; }
  catch (cause) { throw new TypeError("Response body is not valid JSON", { cause }); }
}
export function jsonHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  if (!result.has("Accept")) result.set("Accept", "application/json");
  if (!result.has("Content-Type")) result.set("Content-Type", "application/json");
  return result;
}
export function jsonRequest<T>(body: T, init: RequestInit = {}): RequestInit {
  const serialized = JSON.stringify(body);
  if (serialized === undefined) throw new TypeError("Request body is not JSON-serializable");
  return { ...init, headers: jsonHeaders(init.headers), body: serialized };
}
