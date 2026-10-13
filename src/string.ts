/** Convert a string to a URL-friendly slug. */
export function slugify(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
/** Capitalize the first Unicode code point. */
export function capitalize(value: string): string {
  const points = Array.from(value);
  return points.length ? points[0]!.toLocaleUpperCase() + points.slice(1).join("") : value;
}
/** Convert camelCase, PascalCase, spaces, and separators into kebab-case. */
export function toKebabCase(value: string): string {
  return value.trim().replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").replace(/[\s_]+/g, "-").replace(/-+/g, "-").toLowerCase().replace(/^-|-$/g, "");
}
/** Escape text for safe insertion into an HTML text or quoted attribute context. */
export function escapeHtml(value: string): string {
  const entities: Record<string, string> = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };
  return value.replace(/[&<>"']/g, (char) => entities[char]!);
}
/** Truncate a string to a maximum length, optionally adding an ellipsis. */
export function truncate(value: string, maxLength: number, suffix = "…"): string {
  if (!Number.isInteger(maxLength) || maxLength < 0) throw new RangeError("maxLength must be a non-negative integer");
  if (value.length <= maxLength) return value;
  if (maxLength === 0) return "";
  if (suffix.length >= maxLength) return suffix.slice(0, maxLength);
  return value.slice(0, maxLength - suffix.length).trimEnd() + suffix;
}
/** Convert unknown input to a string with a fallback for nullish values. */
export function toStringSafe(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  try { return String(value); } catch { return fallback; }
}
