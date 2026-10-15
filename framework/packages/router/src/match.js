/**
 * Normalize a pathname or absolute URL, removing query/fragment, decoding with
 * decodeURI, and collapsing repeated and trailing slashes while preserving /.
 * Throws TypeError for blank/non-string input and Error for invalid URLs or encoding.
 */
function normalizePathname(input) {
  if (typeof input !== 'string' || !input.trim()) throw new TypeError('Pathname must be a non-empty string.');
  let pathname = input;
  try {
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(pathname)) pathname = new URL(pathname).pathname;
    else pathname = pathname.split(/[?#]/, 1)[0];
    pathname = decodeURI(pathname);
  } catch { throw new Error(`Invalid pathname: ${input}`); }
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  pathname = pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1) pathname = pathname.replace(/\/$/, '');
  return pathname;
}
/** Decode a URL segment, throwing an Error that identifies originalPath on invalid encoding. */
function decodeSegment(segment, originalPath) {
  try { return decodeURIComponent(segment); } catch { throw new Error(`Invalid pathname encoding: ${originalPath}`); }
}
/**
 * Match a pathname or absolute URL against manifest.routes, requiring equal segment
 * counts. More static segments win; ties use pathname locale order. Returns
 * { route, params, pathname } with decoded parameters and a normalized pathname,
 * or null when no route matches. Duplicate parameter names disqualify a route.
 * Throws for invalid manifest/pathname input or malformed incoming encoding;
 * malformed encoding in a static route segment instead disqualifies that route.
 */
export function matchRoute(manifest, inputPathname) {
  if (!manifest || !Array.isArray(manifest.routes)) throw new TypeError('A route manifest with a routes array is required.');
  const pathname = normalizePathname(inputPathname), incoming = pathname === '/' ? [] : pathname.slice(1).split('/');
  const candidates = manifest.routes.filter((route) => route.segments.length === incoming.length).map((route) => {
    const params = {}; let score = 0;
    for (let i = 0; i < route.segments.length; i += 1) {
      const expected = route.segments[i], actual = incoming[i];
      if (/^\[[^\]]+\]$/.test(expected)) {
        const key = expected.slice(1, -1);
        if (Object.hasOwn(params, key)) return null;
        params[key] = decodeSegment(actual, inputPathname);
      } else {
        let decodedExpected;
        try { decodedExpected = decodeURIComponent(expected); } catch { return null; }
        if (decodedExpected !== decodeSegment(actual, inputPathname)) return null;
        score += 1;
      }
    }
    return { route, params, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.route.pathname.localeCompare(b.route.pathname));
  if (!candidates.length) return null;
  return { route: candidates[0].route, params: candidates[0].params, pathname };
}