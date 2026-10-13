import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { request, createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDevServer, listen, isDirectExecution } from '../src/dev-server.js';

async function project(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ocode-static-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function closeAfter(t, server) {
  t.after(() => new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close(error => error ? reject(error) : resolve());
  }));
}

function get(port, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    // Pass the path directly so traversal probes are not normalized by URL/fetch.
    const req = request({ host: '127.0.0.1', port, path: pathname, method, agent: false }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('Static test request timed out')));
    req.end();
  });
}

async function start(t, files = { 'index.html': '<h1>café</h1>' }) {
  const root = await project(t);
  await mkdir(path.join(root, 'public'));
  for (const [name, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, 'public', name)), { recursive: true });
    await writeFile(path.join(root, 'public', name), body);
  }
  const runtime = await createDevServer({ root, port: 0 });
  closeAfter(t, runtime.server);
  assert.equal(runtime.server.listening, false);
  const address = await listen(runtime.server, runtime.host, runtime.port);
  return { ...runtime, root, port: address.port };
}

test('validates the public directory before creating a server', async t => {
  const root = await project(t);
  await assert.rejects(createDevServer({ root }), /Missing public\/ directory/);
  await writeFile(path.join(root, 'public'), 'file');
  await assert.rejects(createDevServer({ root }), /Expected public\/ to be a directory/);
});

test('server configuration has defaults and respects host and port overrides', async t => {
  const root = await project(t);
  await mkdir(path.join(root, 'public'));
  const defaults = await createDevServer({ root });
  closeAfter(t, defaults.server);
  assert.equal(defaults.host, '127.0.0.1');
  assert.equal(defaults.port, 3000);
  const custom = await createDevServer({ root, host: 'localhost', port: 0 });
  closeAfter(t, custom.server);
  assert.equal(custom.host, 'localhost');
  assert.equal(custom.port, 0);
});

test('serves the index with byte length and security/cache headers; HEAD omits the body', async t => {
  const { port } = await start(t);
  const response = await get(port, '/?cache=ignored');
  assert.equal(response.status, 200);
  assert.equal(response.body.toString(), '<h1>café</h1>');
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(Number(response.headers['content-length']), Buffer.byteLength('<h1>café</h1>'));
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  const head = await get(port, '/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  for (const name of ['content-type', 'content-length', 'cache-control', 'x-content-type-options']) {
    assert.equal(head.headers[name], response.headers[name]);
  }
});

test('serves nested and URL-encoded asset names', async t => {
  const { port } = await start(t, { 'index.html': 'home', 'assets/hello world.txt': 'nested' });
  const response = await get(port, '/assets/hello%20world.txt?v=1');
  assert.equal(response.status, 200);
  assert.equal(response.body.toString(), 'nested');
  assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
});

test('assigns MIME types case-insensitively and preserves binary assets', async t => {
  const types = {
    css: 'text/css; charset=utf-8', HTML: 'text/html; charset=utf-8', ico: 'image/x-icon',
    js: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8', png: 'image/png',
    svg: 'image/svg+xml', txt: 'text/plain; charset=utf-8', webp: 'image/webp',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', bin: 'application/octet-stream'
  };
  const bytes = Buffer.from([0, 255, 128, 10]);
  const files = Object.fromEntries(Object.keys(types).map(extension => [`asset.${extension}`, bytes]));
  const { port } = await start(t, { 'index.html': 'home', ...files });
  for (const [extension, type] of Object.entries(types)) {
    const response = await get(port, `/asset.${extension}`);
    assert.equal(response.status, 200, extension);
    assert.equal(response.headers['content-type'], type, extension);
    assert.deepEqual(response.body, bytes, extension);
  }
});

test('missing files and directories return 404 instead of directory listings', async t => {
  const { port } = await start(t, { 'index.html': 'home', 'nested/index.html': 'nested' });
  for (const pathname of ['/missing.txt', '/nested', '/nested/']) {
    const response = await get(port, pathname);
    assert.equal(response.status, 404, pathname);
    assert.equal(response.body.toString(), 'Not Found');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  }
  const head = await get(port, '/missing', 'HEAD');
  assert.equal(head.status, 404);
  assert.equal(head.body.length, 0);
});

test('rejects unsupported methods with an Allow header', async t => {
  const { port } = await start(t);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await get(port, '/', method);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.allow, 'GET, HEAD');
    assert.equal(response.body.toString(), 'Method Not Allowed');
  }
});

test('rejects malformed encoding, encoded backslashes, and null bytes', async t => {
  const { port } = await start(t);
  for (const pathname of ['/%', '/%E0%A4', '/a%5Cb', '/a%00b']) {
    const response = await get(port, pathname);
    assert.equal(response.status, 400, pathname);
    assert.equal(response.body.toString(), 'Bad Request');
  }
});

test('blocks traversal including an adjacent directory sharing the public prefix', async t => {
  const { root, port } = await start(t);
  await writeFile(path.join(root, 'secret.txt'), 'private');
  await mkdir(path.join(root, 'public-private'));
  await writeFile(path.join(root, 'public-private', 'secret.txt'), 'private');
  for (const pathname of ['/../secret.txt', '/%2e%2e/secret.txt', '/%2e%2e%2fsecret.txt', '/../public-private/secret.txt']) {
    const response = await get(port, pathname);
    assert.equal(response.status, 403, pathname);
    assert.equal(response.body.toString(), 'Forbidden');
  }
});

test('blocks symlinks escaping public and allows symlinks to files inside it', async t => {
  const { root, port } = await start(t);
  await writeFile(path.join(root, 'secret.txt'), 'private');
  await symlink(path.join(root, 'secret.txt'), path.join(root, 'public', 'outside.txt'));
  await symlink(path.join(root, 'public', 'index.html'), path.join(root, 'public', 'inside.html'));
  const outside = await get(port, '/outside.txt');
  assert.equal(outside.status, 403);
  assert.equal(outside.body.toString(), 'Forbidden');
  const inside = await get(port, '/inside.html');
  assert.equal(inside.status, 200);
  assert.equal(inside.body.toString(), '<h1>café</h1>');
});

test('listen returns the assigned port and removes its temporary listeners', async t => {
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
});

test('listen rejects address conflicts and cleans up temporary listeners', async t => {
  const occupied = createServer();
  closeAfter(t, occupied);
  const { port } = await listen(occupied, '127.0.0.1', 0);
  const contender = createServer();
  closeAfter(t, contender);
  const errors = contender.listeners('error');
  const listening = contender.listeners('listening');
  await assert.rejects(listen(contender, '127.0.0.1', port), { code: 'EADDRINUSE' });
  assert.deepEqual(contender.listeners('error'), errors);
  assert.deepEqual(contender.listeners('listening'), listening);
});

test('direct execution compares resolved file URLs and handles missing entry points', () => {
  const entry = path.resolve('a directory', 'cli.js');
  const url = pathToFileURL(entry).href;
  assert.equal(isDirectExecution(url, entry), true);
  assert.equal(isDirectExecution(url, path.relative(process.cwd(), entry)), true);
  assert.equal(isDirectExecution(url, 'other.js'), false);
  assert.equal(isDirectExecution(url, ''), false);
});
