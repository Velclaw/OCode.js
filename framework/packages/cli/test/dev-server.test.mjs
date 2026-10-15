import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDevServer, listen, isDirectExecution } from '../src/dev-server.js';

async function fixture(t, files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ocode-static-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  return root;
}

async function start(t, root) {
  const { server, host, port } = await createDevServer({ root, port: 0 });
  const listeners = { listening: server.listeners('listening'), error: server.listeners('error') };
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = await listen(server, host, port);
  return { server, address, listeners };
}

function request(address, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: address.host, port: address.port, path: pathname, method, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('Test request timed out')));
    req.on('error', reject);
    req.end();
  });
}

test('serves the index, encoded asset paths and HEAD with security and cache headers', async (t) => {
  const body = '<h1>café</h1>';
  const root = await fixture(t, { 'public/index.html': body, 'public/hello world.txt': 'encoded path' });
  const { address } = await start(t, root);
  const response = await request(address, '/?v=1');
  assert.equal(response.status, 200);
  assert.equal(response.body.toString(), body);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(Number(response.headers['content-length']), Buffer.byteLength(body));
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  const head = await request(address, '/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers['content-length'], response.headers['content-length']);
  assert.equal(head.headers['content-type'], response.headers['content-type']);
  assert.equal((await request(address, '/hello%20world.txt')).body.toString(), 'encoded path');
});

test('serves each supported MIME type and falls back to binary', async (t) => {
  const types = {
    css: 'text/css; charset=utf-8', html: 'text/html; charset=utf-8',
    ico: 'image/x-icon', js: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8', png: 'image/png',
    svg: 'image/svg+xml', txt: 'text/plain; charset=utf-8',
    webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    CSS: 'text/css; charset=utf-8', bin: 'application/octet-stream'
  };
  const bytes = Buffer.from([0, 255, 10]);
  const root = await fixture(t, Object.fromEntries(Object.keys(types).map((extension) => [`public/asset.${extension}`, bytes])));
  const { address } = await start(t, root);
  for (const [extension, type] of Object.entries(types)) {
    await t.test(extension, async () => {
      const response = await request(address, `/asset.${extension}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers['content-type'], type);
      assert.deepEqual(response.body, bytes);
    });
  }
});

test('returns 404 for missing assets, directories and paths below a file', async (t) => {
  const root = await fixture(t, { 'public/index.html': 'ok' });
  await mkdir(path.join(root, 'public/directory'));
  const { address } = await start(t, root);
  for (const pathname of ['/missing', '/directory', '/index.html/child']) {
    const response = await request(address, pathname);
    assert.equal(response.status, 404);
    assert.equal(response.body.toString(), 'Not Found');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  }
  const head = await request(address, '/missing', 'HEAD');
  assert.equal(head.status, 404);
  assert.equal(head.body.length, 0);
});

test('rejects methods other than GET and HEAD with an Allow header', async (t) => {
  const root = await fixture(t, { 'public/index.html': 'ok' });
  const { address } = await start(t, root);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await request(address, '/', method);
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'GET, HEAD');
    assert.equal(response.body.toString(), 'Method Not Allowed');
  }
});

test('rejects malformed encodings, backslashes and null bytes', async (t) => {
  const root = await fixture(t, { 'public/index.html': 'ok' });
  const { address } = await start(t, root);
  for (const pathname of ['/%', '/%GG', '/%E0%A4%A', '/%5csecret', '/%00secret']) {
    const response = await request(address, pathname);
    assert.equal(response.status, 400, pathname);
    assert.equal(response.body.toString(), 'Bad Request');
  }
});

test('blocks raw and encoded traversal including sibling paths sharing the public prefix', async (t) => {
  const root = await fixture(t, { 'public/index.html': 'ok', 'secret.txt': 'private', 'publicity/secret.txt': 'private sibling' });
  const { address } = await start(t, root);
  for (const pathname of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/../publicity/secret.txt']) {
    const response = await request(address, pathname);
    assert.equal(response.status, 403, pathname);
    assert.equal(response.body.toString(), 'Forbidden');
  }
});

test('blocks symlinks escaping public but allows links to assets inside public', async (t) => {
  const root = await fixture(t, { 'public/index.html': 'ok', 'outside/secret.txt': 'private' });
  await symlink(path.join(root, 'outside/secret.txt'), path.join(root, 'public/secret.txt'));
  await symlink(path.join(root, 'outside'), path.join(root, 'public/external'));
  await symlink(path.join(root, 'public/index.html'), path.join(root, 'public/internal.html'));
  const { address } = await start(t, root);
  for (const pathname of ['/secret.txt', '/external/secret.txt']) {
    const response = await request(address, pathname);
    assert.equal(response.status, 403);
    assert.equal(response.body.toString(), 'Forbidden');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  }
  assert.equal((await request(address, '/internal.html')).body.toString(), 'ok');
});

test('validates public directory and preserves configured listen defaults', async (t) => {
  const missing = await fixture(t);
  await assert.rejects(createDevServer({ root: missing }), /Missing public\/ directory/);
  const file = await fixture(t, { public: 'file' });
  await assert.rejects(createDevServer({ root: file }), /Expected public\/ to be a directory/);
  const root = await fixture(t, { 'public/index.html': 'ok' });
  const runtime = await createDevServer({ root });
  assert.equal(runtime.host, '127.0.0.1');
  assert.equal(runtime.port, 3000);
  assert.equal(runtime.server.listening, false);
});

test('listen reports an ephemeral port and removes listeners after success or bind failure', async (t) => {
  const root = await fixture(t, { 'public/index.html': 'ok' });
  const { server, address, listeners } = await start(t, root);
  assert.ok(address.port > 0);
  assert.deepEqual(server.listeners('listening'), listeners.listening);
  assert.deepEqual(server.listeners('error'), listeners.error);
  const conflicting = http.createServer();
  const originalListeners = { listening: conflicting.listeners('listening'), error: conflicting.listeners('error') };
  try {
    await assert.rejects(listen(conflicting, address.host, address.port), { code: 'EADDRINUSE' });
    assert.equal(conflicting.listening, false);
    assert.deepEqual(conflicting.listeners('listening'), originalListeners.listening);
    assert.deepEqual(conflicting.listeners('error'), originalListeners.error);
  } finally {
    conflicting.close();
  }
});

test('direct execution compares resolved file URLs and handles missing entries', () => {
  const entry = './project with spaces/cli.js';
  const url = pathToFileURL(path.resolve(entry)).href;
  assert.equal(isDirectExecution(url, entry), true);
  assert.equal(isDirectExecution(url, './other.js'), false);
  assert.equal(isDirectExecution(url, ''), false);
  assert.equal(isDirectExecution(url, null), false);
});
