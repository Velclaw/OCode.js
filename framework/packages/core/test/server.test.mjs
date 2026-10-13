import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { request, createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createOCodeServer, listen } from '../src/server.js';

async function fixture(t, files = { 'page.js': 'export default () => "<h1>home</h1>";' }, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ocode-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  const appDirectory = path.join(root, 'src', 'app');
  await mkdir(appDirectory, { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(appDirectory, name)), { recursive: true });
    await writeFile(path.join(appDirectory, name), source);
  }
  const errors = [];
  const runtime = await createOCodeServer({ appDirectory, logger: { error: (...args) => errors.push(args) }, ...options });
  closeAfter(t, runtime.server);
  return { ...runtime, appDirectory, errors };
}

function closeAfter(t, server) {
  t.after(() => new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close(error => error ? reject(error) : resolve());
  }));
}

function get(port, pathname = '/', method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: pathname, method, agent: false }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('Runtime test request timed out')));
    req.end();
  });
}

test('requires a non-empty appDirectory', async () => {
  await assert.rejects(createOCodeServer(), TypeError);
  for (const appDirectory of [null, 1, '', '   ']) {
    await assert.rejects(createOCodeServer({ appDirectory }), /appDirectory must be a non-empty path/);
  }
});

test('renders a page through the handler and exposes its scanned manifest', async t => {
  const runtime = await fixture(t);
  assert.equal(runtime.server.listening, false);
  assert.equal(runtime.manifest.appDirectory, runtime.appDirectory);
  assert.deepEqual(runtime.manifest.routes.map(route => route.pathname), ['/']);
  const response = await runtime.handle(new Request('http://example.test/'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await response.text(), '<h1>home</h1>');
});

test('async named render functions receive decoded params and the original Request', async t => {
  const runtime = await fixture(t, {
    'blog/[slug]/page.js': `export async function render({ params, request }) {
      await Promise.resolve();
      return params.slug + '|' + new URL(request.url).searchParams.get('q') + '|' + request.headers.get('x-test');
    }`
  });
  const seen = [];
  // Observe request identity at the middleware boundary as well as its page-visible values.
  const request = new Request('http://example.test/blog/hello%20world?q=query', { headers: { 'x-test': 'header' } });
  const app = await createOCodeServer({ appDirectory: runtime.appDirectory, middleware: [
    (received, next) => { seen.push(received); return next(); }
  ] });
  closeAfter(t, app.server);
  assert.equal(await (await app.handle(request)).text(), 'hello world|query|header');
  assert.strictEqual(seen[0], request);
});

test('default page exports take precedence over named render exports', async t => {
  const runtime = await fixture(t, {
    'page.js': 'export default () => "default"; export const render = () => "named";'
  });
  assert.equal(await (await runtime.handle(new Request('http://example.test/'))).text(), 'default');
});

test('nested layouts wrap pages from inner to outer and receive route props', async t => {
  const runtime = await fixture(t, {
    'layout.js': 'export default async ({ children }) => "<outer>" + children + "</outer>";',
    'blog/layout.js': `export function render({ children, params, request }) {
      return '<inner data-id="' + params.id + '" data-method="' + request.method + '">' + children + '</inner>';
    }`,
    'blog/[id]/page.js': 'export default () => "page";'
  });
  const response = await runtime.handle(new Request('http://example.test/blog/42'));
  assert.equal(await response.text(), '<outer><inner data-id="42" data-method="GET">page</inner></outer>');
});

test('a page Response preserves status and headers and bypasses layouts', async t => {
  const runtime = await fixture(t, {
    'layout.js': 'export default () => { throw new Error("layout must not run"); };',
    'page.js': 'export default () => new Response("created", { status: 201, headers: { "x-page": "custom", "content-type": "text/plain" } });'
  });
  const response = await runtime.handle(new Request('http://example.test/'));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-page'), 'custom');
  assert.equal(response.headers.get('content-type'), 'text/plain');
  assert.equal(await response.text(), 'created');
});

test('a layout Response bypasses remaining outer layouts', async t => {
  const runtime = await fixture(t, {
    'layout.js': 'export default () => { throw new Error("outer must not run"); };',
    'nested/layout.js': 'export default () => new Response(null, { status: 302, headers: { location: "/login" } });',
    'nested/page.js': 'export default () => "page";'
  });
  const response = await runtime.handle(new Request('http://example.test/nested'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/login');
  assert.equal(await response.text(), '');
});

test('handler returns controlled 404, 405, and malformed-path 400 responses', async t => {
  const runtime = await fixture(t);
  const cases = [
    ['/missing', 'GET', 404, 'Not Found'],
    ['/', 'POST', 405, 'Method Not Allowed'],
    ['/', 'OPTIONS', 405, 'Method Not Allowed'],
    ['/%E0%A4', 'GET', 400, 'Bad Request']
  ];
  for (const [pathname, method, status, body] of cases) {
    const response = await runtime.handle(new Request(`http://example.test${pathname}`, { method }));
    assert.equal(response.status, status);
    assert.equal(await response.text(), body);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    if (status === 405) assert.equal(response.headers.get('allow'), 'GET, HEAD');
  }
});

test('middleware can intercept unmatched routes and decorate rendered responses', async t => {
  const runtime = await fixture(t, undefined, { middleware: [async (request, next) => {
    if (new URL(request.url).pathname === '/private') return new Response('denied', { status: 403 });
    const response = await next();
    response.headers.set('x-middleware', 'yes');
    return response;
  }] });
  const blocked = await runtime.handle(new Request('http://example.test/private'));
  assert.equal(blocked.status, 403);
  assert.equal(await blocked.text(), 'denied');
  const response = await runtime.handle(new Request('http://example.test/'));
  assert.equal(response.headers.get('x-middleware'), 'yes');
  assert.equal(await response.text(), '<h1>home</h1>');
});

for (const [label, files, message] of [
  ['invalid page export', { 'page.js': 'export default 42;' }, /Page module must export/],
  ['invalid page return', { 'page.js': 'export default () => ({ html: "invalid" });' }, /Page must return a string or Response/],
  ['invalid layout export', { 'page.js': 'export default () => "page";', 'layout.js': 'export default 42;' }, /Layout module must export/],
  ['invalid layout return', { 'page.js': 'export default () => "page";', 'layout.js': 'export default () => undefined;' }, /Layout must return a string or Response/],
  ['throwing page', { 'page.js': 'export default () => { throw new Error("private detail"); };' }, /private detail/],
  ['throwing layout', { 'page.js': 'export default () => "page";', 'layout.js': 'export default () => { throw new Error("layout detail"); };' }, /layout detail/]
]) {
  test(`${label} rejects in the handler and becomes a generic HTTP 500`, async t => {
    const runtime = await fixture(t, files);
    await assert.rejects(runtime.handle(new Request('http://example.test/')), message);
    const { port } = await listen(runtime.server, '127.0.0.1', 0);
    const response = await get(port);
    assert.equal(response.status, 500);
    assert.equal(response.body, 'Internal Server Error');
    assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(runtime.errors.length, 1);
    assert.equal(runtime.errors[0][0], '[OCodejs] Request failed:');
    assert.match(runtime.errors[0][1].message, message);
  });
}

test('HTTP GET forwards page Responses and HEAD suppresses body bytes', async t => {
  const runtime = await fixture(t, {
    'page.js': 'export default () => new Response("café", { status: 202, headers: { "x-page": "yes" } });'
  });
  const { port } = await listen(runtime.server, '127.0.0.1', 0);
  const response = await get(port);
  assert.equal(response.status, 202);
  assert.equal(response.headers['x-page'], 'yes');
  assert.equal(response.body, 'café');
  const head = await get(port, '/', 'HEAD');
  assert.equal(head.status, 202);
  assert.equal(head.headers['x-page'], 'yes');
  assert.equal(head.body, '');
});

test('HTTP sends bodyless Responses and catches middleware failures without requiring logger.error', async t => {
  const runtime = await fixture(t, {
    'page.js': 'export default () => new Response(null, { status: 204 });'
  }, { logger: {}, middleware: [(request, next) => {
    if (new URL(request.url).pathname === '/fail') throw new Error('middleware private detail');
    return next();
  }] });
  const { port } = await listen(runtime.server, '127.0.0.1', 0);
  const empty = await get(port);
  assert.equal(empty.status, 204);
  assert.equal(empty.body, '');
  const failure = await get(port, '/fail');
  assert.equal(failure.status, 500);
  assert.equal(failure.body, 'Internal Server Error');
});

test('reloads a page when its modification time changes', async t => {
  const runtime = await fixture(t, { 'page.js': 'export default () => "first";' });
  const page = path.join(runtime.appDirectory, 'page.js');
  await utimes(page, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
  assert.equal(await (await runtime.handle(new Request('http://example.test/'))).text(), 'first');
  await writeFile(page, 'export default () => "second";');
  await utimes(page, new Date('2026-01-01T00:00:01Z'), new Date('2026-01-01T00:00:01Z'));
  assert.equal(await (await runtime.handle(new Request('http://example.test/'))).text(), 'second');
});

test('listen assigns an ephemeral port and cleans up on success and address conflicts', async t => {
  const server = createServer();
  closeAfter(t, server);
  const errors = server.listeners('error');
  const listening = server.listeners('listening');
  const address = await listen(server, '127.0.0.1', 0);
  assert.equal(address.host, '127.0.0.1');
  assert.ok(address.port > 0);
  assert.equal(address.port, server.address().port);
  assert.deepEqual(server.listeners('error'), errors);
  assert.deepEqual(server.listeners('listening'), listening);
  const contender = createServer();
  closeAfter(t, contender);
  const contenderErrors = contender.listeners('error');
  const contenderListening = contender.listeners('listening');
  await assert.rejects(listen(contender, '127.0.0.1', address.port), { code: 'EADDRINUSE' });
  assert.deepEqual(contender.listeners('error'), contenderErrors);
  assert.deepEqual(contender.listeners('listening'), contenderListening);
});
