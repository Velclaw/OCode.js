export type QueryValue = string | number | boolean | null | undefined;
/** Update query parameters while preserving existing URL parameters. */
export function withQuery(input: string | URL, values: Record<string, QueryValue | readonly QueryValue[]>): string {
  const raw = input.toString(), url = new URL(raw, "http://localhost");
  for (const [key, item] of Object.entries(values)) {
    url.searchParams.delete(key);
    for (const value of (Array.isArray(item) ? item : [item])) if (value !== null && value !== undefined) url.searchParams.append(key, String(value));
  }
  return input instanceof URL || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw) ? url.toString() : url.pathname + url.search + url.hash;
}
/** Join URL path segments without duplicate separators. */
export function joinUrl(...parts: string[]): string {
  const cleaned = parts.filter(Boolean);
  if (!cleaned.length) return "";
  const first = cleaned.shift()!.replace(/\/+$/, "");
  return [first, ...cleaned.map((part) => part.replace(/^\/+|\/+$/g, "")).filter(Boolean)].join("/");
}
/** Parse a URL and return null rather than throwing on invalid input. */
export function parseUrl(input: string, base?: string): URL | null {
  try { return base === undefined ? new URL(input) : new URL(input, base); } catch { return null; }
}
/** Remove common campaign and click-tracking parameters. */
export function stripTrackingParams(input: string | URL): URL {
  const url = new URL(input.toString());
  for (const key of [...url.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid|dclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  return url;
}
