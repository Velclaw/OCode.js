import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const CONVENTIONS = new Set(['page', 'layout', 'loading', 'error']);

/** Return null for a parenthesized route group; otherwise preserve the segment. */
function routeSegmentName(segment) {
  if (/^\([^/]+\)$/.test(segment)) return null;
  return segment;
}
/**
 * Throw for empty/dot segments or bracket syntax other than [name], identifying
 * the route directory. Names start with an ASCII letter and contain only ASCII
 * letters, digits, and underscores.
 */
function validateSegment(segment, relativeDirectory) {
  if (!segment || segment === '.' || segment === '..') throw new Error(`Invalid route segment "${segment}" in ${relativeDirectory || 'src/app'}.`);
  if (segment.includes('[') || segment.includes(']')) {
    if (!/^\[([A-Za-z][A-Za-z0-9_]*)\]$/.test(segment)) throw new Error(`Unsupported dynamic route segment "${segment}" in ${relativeDirectory || 'src/app'}; use [name].`);
  }
}
/** Build a collision key that treats all dynamic parameter names as the same segment. */
function structuralKey(segments) { return segments.map((segment) => /^\[[^\]]+\]$/.test(segment) ? '[]' : segment).join('/'); }

/**
 * Collect page routes beneath directory with inherited layout/loading/error files
 * ordered from outermost to innermost. Route groups do not contribute URL segments;
 * underscore-prefixed entries and node_modules are skipped.
 * Rejects on symbolic links, duplicate convention files, invalid route segments,
 * or directory read errors.
 */
async function walk(directory, appRoot, inherited) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const relativeDirectory = path.relative(appRoot, directory).split(path.sep).filter(Boolean).join('/');
  const files = new Map(), directories = [];
  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name === 'node_modules') continue;
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported in app routes: ${path.relative(appRoot, path.join(directory, entry.name))}`);
    if (entry.isDirectory()) { directories.push(entry); continue; }
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name);
    if (!FILE_EXTENSIONS.has(extension)) continue;
    const basename = path.basename(entry.name, extension);
    if (!CONVENTIONS.has(basename)) continue;
    if (files.has(basename)) throw new Error(`Duplicate ${basename} convention files in ${relativeDirectory || 'src/app'}: ${files.get(basename)} and ${entry.name}`);
    files.set(basename, entry.name);
  }
  const current = { ...inherited };
  if (files.has('layout')) current.layouts = [...inherited.layouts, path.join(directory, files.get('layout'))];
  if (files.has('loading')) current.loadings = [...inherited.loadings, path.join(directory, files.get('loading'))];
  if (files.has('error')) current.errors = [...inherited.errors, path.join(directory, files.get('error'))];
  const routes = [];
  if (files.has('page')) {
    const rawSegments = relativeDirectory ? relativeDirectory.split('/') : [];
    const segments = rawSegments.map(routeSegmentName).filter((segment) => segment !== null);
    for (const segment of segments) validateSegment(segment, relativeDirectory);
    routes.push({ pathname: segments.length ? `/${segments.join('/')}` : '/', segments,
      params: segments.filter((segment) => /^\[[^\]]+\]$/.test(segment)).map((segment) => segment.slice(1, -1)),
      page: path.join(directory, files.get('page')), layouts: current.layouts, loadings: current.loadings, errors: current.errors });
  }
  for (const entry of directories) {
    const segment = routeSegmentName(entry.name);
    if (segment !== null) validateSegment(segment, relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name);
    routes.push(...await walk(path.join(directory, entry.name), appRoot, current));
  }
  return routes;
}
/**
 * Scan an app directory for page/layout/loading/error files with JS, JSX, TS, or TSX
 * extensions. Return a version-1 manifest with an absolute appDirectory and module
 * paths; routes sort by segment count, then a key placing dynamic segments last.
 * Rejects for a missing/non-directory root, scan errors, or routes whose segment
 * structure collides after omitting groups and ignoring dynamic parameter names.
 * Files are recorded without importing or compiling their contents.
 */
export async function scanAppDirectory(appDirectory) {
  const appRoot = path.resolve(appDirectory);
  let info;
  try { info = await stat(appRoot); } catch (cause) {
    if (cause?.code === 'ENOENT' || cause?.code === 'ENOTDIR') throw new Error(`App directory does not exist: ${appRoot}`);
    throw cause;
  }
  if (!info.isDirectory()) throw new Error(`App path is not a directory: ${appRoot}`);
  const routes = await walk(appRoot, appRoot, { layouts: [], loadings: [], errors: [] });
  const byStructuralPath = new Map();
  for (const route of routes) {
    const key = structuralKey(route.segments), previous = byStructuralPath.get(key);
    if (previous) throw new Error(`Route collision: ${previous.pathname} (${previous.page}) conflicts with ${route.pathname} (${route.page}).`);
    byStructuralPath.set(key, route);
  }
  routes.sort((a, b) => a.segments.length - b.segments.length || a.segments.map((s) => /^\[[^\]]+\]$/.test(s) ? '\uffff' : s).join('/').localeCompare(b.segments.map((s) => /^\[[^\]]+\]$/.test(s) ? '\uffff' : s).join('/')));
  return { version: 1, appDirectory: appRoot, routes: routes.map((route) => ({ ...route, page: path.resolve(route.page),
    layouts: route.layouts.map((file) => path.resolve(file)), loadings: route.loadings.map((file) => path.resolve(file)), errors: route.errors.map((file) => path.resolve(file)) })) };
}