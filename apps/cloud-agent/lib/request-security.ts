/**
 * Validate browser mutation requests against the configured application origin.
 * Missing, malformed, or opaque origins are rejected. In production APP_ORIGIN
 * must be explicitly configured rather than inferred from proxy headers.
 */
export function isSameOriginRequest(
  requestUrl: string,
  originHeader: string | null,
  configuredOrigin?: string,
  production = false,
): boolean {
  if (!originHeader) return false;

  try {
    const requestOrigin = new URL(requestUrl).origin;
    const expectedOrigin = configuredOrigin
      ? new URL(configuredOrigin).origin
      : production
        ? null
        : requestOrigin;

    if (!expectedOrigin || expectedOrigin === "null") return false;

    const supplied = new URL(originHeader);
    if (
      supplied.origin === "null" ||
      (supplied.protocol !== "https:" && supplied.protocol !== "http:") ||
      supplied.origin !== originHeader
    ) {
      return false;
    }

    return supplied.origin === expectedOrigin;
  } catch {
    return false;
  }
}
