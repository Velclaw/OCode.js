import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'], ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'], ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg']
]);

export async function createDevServer({ root, host = '127.0.0.1', port = 3000 }) {
  const publicDir = path.join(root, 'public');
  let info;
  try { info = await stat(publicDir); } catch (cause) {
    if (cause?.code === 'ENOENT') throw new Error(`Missing public/ directory in ${root}. Create public/ and add an index.html file.`);
    throw cause;
  }
  if (!info.isDirectory()) throw new Error(`Expected public/ to be a directory in ${root}.`);
  const realPublic = await realpath(publicDir);
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Method Not Allowed'); return;
    }
    let pathname;
    try { pathname = decodeURIComponent((req.url ?? '/').split('?', 1)[0]); }
    catch { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Bad Request'); return; }
    if (pathname.includes('\\') || pathname.includes('\0')) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Bad Request'); return; }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidate = path.resolve(realPublic, relative);
    if (candidate !== realPublic && !candidate.startsWith(`${realPublic}${path.sep}`)) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Forbidden'); return; }
    try {
      const fileReal = await realpath(candidate);
      if (fileReal !== realPublic && !fileReal.startsWith(`${realPublic}${path.sep}`)) throw Object.assign(new Error('Forbidden'), { code: 'EACCES' });
      const fileInfo = await stat(fileReal);
      if (!fileInfo.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
      const body = await readFile(fileReal);
      res.writeHead(200, { 'Content-Type': MIME_TYPES.get(path.extname(fileReal).toLowerCase()) ?? 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const forbidden = error?.code === 'EACCES' || error?.code === 'EPERM';
      res.writeHead(forbidden ? 403 : 404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); res.end(forbidden ? 'Forbidden' : 'Not Found');
    }
  });
  return { server, host, port };
}
export async function listen(server, host, port) {
  await new Promise((resolve, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError); server.once('listening', onListening); server.listen(port, host);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to determine the dev server address.');
  return { host, port: address.port };
}
export function isDirectExecution(metaUrl, argvEntry = process.argv[1]) { return Boolean(argvEntry && pathToFileURL(path.resolve(argvEntry)).href === metaUrl); }
