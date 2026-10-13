import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createOCodeServer, listen } from '../src/server.js';

async function fixture(t, files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ocode-core-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  const appDirectory = path.join(root, 'src/app');
  await mkdir(appDirectory, { recursive: true });
  for (const [file, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(appDirectory, file)), { recursive: true });
    await writeFile(path.join(appDirectory, file), source);
  }
  return appDirectory;
}

function request(address, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: address.host, port: address.port, path: pathname, method, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('Test request timed out')));
    req.on('error', reject);
    req.end();
  });
}

async function start(t, runtime) {
  const address = await listen(runtime.server, '127.0.0.1', 0);
  t.after(() => new Promise((resolve, reject) => runtime.server.close((error) => error ? reject(error) : resolve())));
  return address;
}

test('validates appDirectory before scanning', async () => {
  for (const appDirectory of [undefined, null, '', '  ', 42]) {
    await assert.rejects(createOCodeServer({ appDirectory }), TypeError);
  }
  await assert.rejects(createOCodeServer(), TypeError);
});

test('returns manifest and renders async pages with decoded params and original requests', async (t) => {
  const appDirectory = await fixture(t, {
    'blog/[slug]/page.js': `export default async function ({ params, request }) {
      return JSON.stringify({ slug: params.slug, query: new URL(request.url).search, client: request.headers.get('x-client') });
    }`
  });
  const { handle, manifest, server } = await createOCodeServer({ appDirectory });
  assert.equal(server.listening, false);
  assert.equal(manifest.routes[0].pathname, '/blog/[slug]');
  const response = await handle(new Request('http://localhost/blog/hello%20world?x=1', { headers: { 'x-client': 'unit-test' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(JSON.parse(await response.text()), { slug: 'hello world', query: '?x=1', client: 'unit-test' });
});

test('named render exports work and layouts wrap from innermost to outermost with shared props', async (t) => {
  const appDirectory = await fixture(t, {
    'layout.js': 'export function render({ children, params, request }) { return `<outer slug="${params.slug}" method="${request.method}">${children}</outer>`; }',
    'blog/layout.js': 'export default async ({ children }) => `<inner>${children}</inner>`;',
    'blog/[slug]/page.js': 'export async function render({ params }) { return `<page>${params.slug}</page>`; }'
  });
  const { handle } = await createOCodeServer({ appDirectory });
  const response = await handle(new Request('http://localhost/blog/hello'));
  assert.equal(await response.text(), '<outer slug="hello" method="GET"><inner><page>hello</page></inner></outer>');
});

test('prefers default exports when default and render are both present', async (t) => {
  const appDirectory = await fixture(t, {
    'page.js': 'export default () => "default page"; export const render = () => "wrong page";',
    'layout.js': 'export default ({ children }) => `<main>${children}</main>`; export const render = () => "wrong layout";'
  });
  const { handle } = await createOCodeServer({ appDirectory });
  assert.equal(await (await handle(new Request('http://localhost/'))).text(), '<main>default page</main>');
});

test('page Responses retain status and headers and bypass layouts', async (t) => {
  const appDirectory = await fixture(t, {
    'page.js': 'export default () => new Response("created", { status: 201, headers: { "x-page": "custom", "content-type": "text/plain" } });',
    'layout.js': 'export default () => { throw new Error("layout should be skipped"); };'
  });
  const { handle } = await createOCodeServer({ appDirectory });
  const response = await handle(new Request('http://localhost/'));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-page'), 'custom');
  assert.equal(response.headers.get('content-type'), 'text/plain');
  assert.equal(await response.text(), 'created');
});

test('layout Responses bypass remaining outer layouts', async (t) => {
  const appDirectory = await fixture(t, {
    'layout.js': 'export default () => { throw new Error("outer layout should be skipped"); };',
    'nested/layout.js': 'export default () => new Response(null, { status: 302, headers: { location: "/login" } });',
    'nested/page.js': 'export default () => "page";'
  });
  const { handle } = await createOCodeServer({ appDirectory });
  const response = await handle(new Request('http://localhost/nested'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/login');
  assert.equal(await response.text(), '');
});

for (const [files, message] of [
  [{ 'page.js': 'export const unused = 1;' }, /Page module must export/],
  [{ 'page.js': 'export default 1;' }, /Page module must export/],
  [{ 'page.js': 'export default () => ({ html: "invalid" });' }, /Page must return a string or Response/],
  [{ 'page.js': 'export default () => "ok";', 'layout.js': 'export const unused = 1;' }, /Layout module must export/],
  [{ 'page.js': 'export default () => "ok";', 'layout.js': 'export default () => null;' }, /Layout must return a string or Response/],
  [{ 'page.js': 'export default async () => { throw new Error("render failed"); };' }, /render failed/]
]) {
  test(`rejects invalid renderer: ${message}`, async (t) => {
    const appDirectory = await fixture(t, files);
    const { handle } = await createOCodeServer({ appDirectory });
    await assert.rejects(handle(new Request('http://localhost/')), message);
  });
}

test('returns 404, 405 with Allow, and 400 for malformed path encodings', async (t) => {
  const appDirectory = await fixture(t, { 'page.js': 'export default () => "home";', '[slug]/page.js': 'export default () => "dynamic";' });
  const { handle } = await createOCodeServer({ appDirectory });
  const missing = await handle(new Request('http://localhost/missing/path'));
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'Not Found');
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await handle(new Request('http://localhost/', { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
    assert.equal(await response.text(), 'Method Not Allowed');
  }
  for (const pathname of ['/%GG', '/%E0%A4%A']) {
    const response = await handle(new Request(`http://localhost${pathname}`));
    assert.equal(response.status, 400);
    assert.equal(await response.text(), 'Bad Request');
  }
});

test('middleware can block rendering or decorate the runtime response', async (t) => {
  const appDirectory = await fixture(t, { 'page.js': 'export default () => "home";' });
  const { handle } = await createOCodeServer({ appDirectory, middleware: [async (request, next) => {
    if (!request.headers.has('authorization')) return new Response('blocked', { status: 403 });
    const response = await next();
    response.headers.set('x-middleware', 'applied');
    return response;
  }] });
  const blocked = await handle(new Request('http://localhost/'));
  assert.equal(blocked.status, 403);
  assert.equal(await blocked.text(), 'blocked');
  const allowed = await handle(new Request('http://localhost/', { headers: { authorization: 'synthetic' } }));
  assert.equal(allowed.headers.get('x-middleware'), 'applied');
  assert.equal(await allowed.text(), 'home');
});

test('HTTP transport preserves headers and status and suppresses HEAD and bodyless responses', async (t) => {
  const appDirectory = await fixture(t, {
    'page.js': 'export default () => new Response("accepted", { status: 202, headers: { "x-page": "custom" } });',
    'empty/page.js': 'export default () => new Response(null, { status: 204 });'
  });
  const runtime = await createOCodeServer({ appDirectory });
  const address = await start(t, runtime);
  const get = await request(address, '/');
  assert.equal(get.status, 202);
  assert.equal(get.headers['x-page'], 'custom');
  assert.equal(get.body, 'accepted');
  const head = await request(address, '/', 'HEAD');
  assert.equal(head.status, 202);
  assert.equal(head.headers['x-page'], 'custom');
  assert.equal(head.body, '');
  const empty = await request(address, '/empty');
  assert.equal(empty.status, 204);
  assert.equal(empty.body, '');
});

test('HTTP transport logs failures and returns a generic 500 without leaking renderer details', async (t) => {
  const appDirectory = await fixture(t, { 'page.js': 'export default () => { throw new Error("private diagnostic"); };' });
  const errors = [];
  const runtime = await createOCodeServer({ appDirectory, logger: { error: (...args) => errors.push(args) } });
  const address = await start(t, runtime);
  const response = await request(address, '/');
  assert.equal(response.status, 500);
  assert.equal(response.body, 'Internal Server Error');
  assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], '[OCodejs] Request failed:');
  assert.equal(errors[0][1].message, 'private diagnostic');
});

test('listen removes temporary event listeners after success and address conflicts', async (t) => {
  const appDirectory = await fixture(t);
  const runtime = await createOCodeServer({ appDirectory });
  const originalListeners = { error: runtime.server.listeners('error'), listening: runtime.server.listeners('listening') };
  const address = await start(t, runtime);
  assert.ok(address.port > 0);
  assert.deepEqual(runtime.server.listeners('error'), originalListeners.error);
  assert.deepEqual(runtime.server.listeners('listening'), originalListeners.listening);
  const conflicting = http.createServer();
  const conflictingListeners = { error: conflicting.listeners('error'), listening: conflicting.listeners('listening') };
  try {
    await assert.rejects(listen(conflicting, address.host, address.port), { code: 'EADDRINUSE' });
    assert.deepEqual(conflicting.listeners('error'), conflictingListeners.error);
    assert.deepEqual(conflicting.listeners('listening'), conflictingListeners.listening);
  } finally {
    conflicting.close();
  }
});

test('public core entry exports server, listen and middleware APIs', async () => {
  const core = await import('@ocodejs/core');
  assert.equal(core.createOCodeServer, createOCodeServer);
  assert.equal(core.listen, listen);
  assert.equal(typeof core.composeMiddleware, 'function');
});
