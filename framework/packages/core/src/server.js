import http from 'node:http';
import { stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { scanAppDirectory, matchRoute } from '@ocodejs/router';
import { composeMiddleware } from './middleware.js';
function htmlResponse(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers } });
}
async function importModule(file) {
  const info = await stat(file);
  return import(`${pathToFileURL(file).href}?ocode_mtime=${info.mtimeMs}`);
}
async function renderPage(match, request) {
  const pageModule = await importModule(match.route.page), page = pageModule.default ?? pageModule.render;
  if (typeof page !== 'function') throw new TypeError(`Page module must export a default function or named render(): ${match.route.page}`);
  const props = { params: match.params, request };
  let output = await page(props);
  if (output instanceof Response) return output;
  if (typeof output !== 'string') throw new TypeError(`Page must return a string or Response: ${match.route.page}`);
  for (const layoutFile of [...match.route.layouts].reverse()) {
    const layoutModule = await importModule(layoutFile), layout = layoutModule.default ?? layoutModule.render;
    if (typeof layout !== 'function') throw new TypeError(`Layout module must export a default function or named render(): ${layoutFile}`);
    output = await layout({ ...props, children: output });
    if (output instanceof Response) return output;
    if (typeof output !== 'string') throw new TypeError(`Layout must return a string or Response: ${layoutFile}`);
  }
  return htmlResponse(output);
}
export async function createOCodeServer({ appDirectory, middleware = [], logger = console } = {}) {
  if (typeof appDirectory !== 'string' || !appDirectory.trim()) throw new TypeError('appDirectory must be a non-empty path.');
  const manifest = await scanAppDirectory(path.resolve(appDirectory));
  const handle = composeMiddleware(middleware, async (request) => {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return htmlResponse('Method Not Allowed', 405, { allow: 'GET, HEAD' });
    let match;
    try { match = matchRoute(manifest, new URL(request.url).pathname); }
    catch (error) { if (/encoding|pathname/i.test(error.message)) return htmlResponse('Bad Request', 400); throw error; }
    if (!match) return htmlResponse('Not Found', 404);
    return renderPage(match, request);
  });
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const host = incoming.headers.host || 'localhost';
      const request = new Request(`http://${host}${incoming.url || '/'}`, { method: incoming.method, headers: incoming.headers });
      const response = await handle(request);
      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => outgoing.setHeader(key, value));
      if (incoming.method === 'HEAD' || !response.body) { outgoing.end(); return; }
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      logger.error?.('[OCodejs] Request failed:', error);
      if (!outgoing.headersSent) {
        outgoing.statusCode = 500;
        outgoing.setHeader('content-type', 'text/plain; charset=utf-8');
        outgoing.setHeader('x-content-type-options', 'nosniff');
        outgoing.end('Internal Server Error');
      } else outgoing.destroy(error);
    }
  });
  return { server, manifest, handle };
}
export function listen(server, host = '127.0.0.1', port = 3000) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); const address = server.address(); resolve({ host: typeof address === 'object' && address ? address.address : host, port: typeof address === 'object' && address ? address.port : port }); };
    server.once('error', onError); server.once('listening', onListening); server.listen(port, host);
  });
}