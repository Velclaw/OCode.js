import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { run } from '../src/index.js';
import { HELP_TEXT } from '../src/args.js';

function captureIO() {
  const logs = [], errors = [];
  return { logs, errors, log: (message) => logs.push(message), error: (message) => errors.push(message) };
}

async function fixture(t, files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ocode-run-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  return root;
}

function trackShutdownListeners(t) {
  const previous = new Map(['SIGINT', 'SIGTERM'].map((signal) => [signal, new Set(process.listeners(signal))]));
  t.after(() => {
    for (const [signal, listeners] of previous) {
      for (const listener of process.listeners(signal)) {
        if (!listeners.has(listener)) process.removeListener(signal, listener);
      }
    }
  });
}

function request(address) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: address.host, port: address.port, path: '/', agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('Test request timed out')));
    req.on('error', reject);
  });
}

test('help and version return success without needing a project directory', async () => {
  for (const [argv, expected] of [[[], HELP_TEXT], [['--help'], HELP_TEXT], [['-v'], '0.1.0']]) {
    const io = captureIO();
    assert.equal(await run(argv, io, '/nonexistent-ocode-project'), 0);
    assert.deepEqual(io.logs, [expected]);
    assert.deepEqual(io.errors, []);
  }
});

test('argument errors produce a diagnostic and nonzero result', async () => {
  for (const [argv, expected] of [
    [['unknown'], /Unknown command/],
    [['dev', '--port', '-1'], /between 0 and 65535/],
    [['dev', '--unknown'], /Unknown option/]
  ]) {
    const io = captureIO();
    assert.equal(await run(argv, io), 1);
    assert.deepEqual(io.logs, []);
    assert.equal(io.errors.length, 1);
    assert.ok(io.errors[0].startsWith('OCodejs: '));
    assert.match(io.errors[0], expected);
  }
});

test('build resolves the project relative to cwd, copies assets and reports success', async (t) => {
  const root = await fixture(t, { 'site/public/index.html': 'hello', 'site/public/style.css': 'body{}' });
  const io = captureIO();
  assert.equal(await run(['build', '--root', 'site'], io, root), 0);
  assert.deepEqual(io.errors, []);
  assert.deepEqual(io.logs, ['OCodejs build complete: 2 public file(s) -> dist']);
  assert.equal(await readFile(path.join(root, 'site/dist/public/index.html'), 'utf8'), 'hello');
  const manifest = JSON.parse(await readFile(path.join(root, 'site/dist/ocode-build.json'), 'utf8'));
  assert.deepEqual(manifest.files, ['index.html', 'style.css']);
});

test('missing roots and invalid builds are reported through io.error', async (t) => {
  const root = await fixture(t);
  for (const [argv, expected] of [
    [['build', '--root', 'missing'], /Project root does not exist/],
    [['build'], /Missing public\/ directory/],
    [['dev', '--port', '0'], /Missing public\/ directory/]
  ]) {
    const io = captureIO();
    assert.equal(await run(argv, io, root), 1);
    assert.deepEqual(io.logs, []);
    assert.equal(io.errors.length, 1);
    assert.match(io.errors[0], expected);
  }
});

for (const [name, files, body] of [
  ['static', { 'public/index.html': 'static fixture' }, 'static fixture'],
  ['static with non-directory src/app', { 'public/index.html': 'fallback', 'src/app': 'file' }, 'fallback'],
  ['app', { 'src/app/page.js': 'export default () => "routed fixture";', 'public/index.html': 'unused static' }, 'routed fixture']
]) {
  test(`dev starts ${name} runtime on the requested host and an ephemeral port`, async (t) => {
    const root = await fixture(t, files);
    trackShutdownListeners(t);
    const io = captureIO();
    const result = await run(['dev', '--host', '127.0.0.1', '--port', '0'], io, root);
    assert.equal(typeof result, 'object', io.errors.join('\n'));
    t.after(() => new Promise((resolve, reject) => result.server.close((error) => error ? reject(error) : resolve())));
    assert.equal(result.code, 0);
    assert.equal(result.address.host, '127.0.0.1');
    assert.ok(result.address.port > 0);
    assert.equal(result.server.listening, true);
    assert.deepEqual(io.errors, []);
    const mode = name === 'app' ? 'app' : 'static';
    assert.deepEqual(io.logs, [`OCodejs ${mode} dev server ready at http://127.0.0.1:${result.address.port}`]);
    assert.deepEqual(await request(result.address), { status: 200, body });
  });
}
