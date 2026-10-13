import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/index.js';
import { HELP_TEXT } from '../src/args.js';

function output() {
  const logs = [], errors = [];
  return { logs, errors, io: { log: message => logs.push(message), error: message => errors.push(message) } };
}

async function project(t, files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ocode-command-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  for (const [name, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), source);
  }
  return root;
}

function get(port) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/', agent: false }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('CLI test request timed out')));
    req.end();
  });
}

async function dev(t, root, io) {
  const signals = ['SIGINT', 'SIGTERM'];
  const previous = new Map(signals.map(signal => [signal, new Set(process.listeners(signal))]));
  let result;
  t.after(async () => {
    for (const signal of signals) {
      for (const listener of process.listeners(signal)) {
        if (!previous.get(signal).has(listener)) process.removeListener(signal, listener);
      }
    }
    if (result?.server?.listening) {
      await new Promise((resolve, reject) => result.server.close(error => error ? reject(error) : resolve()));
    }
  });
  result = await run(['dev', '--root', root, '--host', '127.0.0.1', '--port', '0'], io);
  assert.equal(result.code, 0);
  assert.ok(result.address.port > 0);
  return result;
}

test('help and version return success without resolving a project', async () => {
  for (const argv of [[], ['--help'], ['-h'], ['build', '--help']]) {
    const { io, logs, errors } = output();
    assert.equal(await run(argv, io, '/missing-project'), 0);
    assert.deepEqual(logs, [HELP_TEXT]);
    assert.deepEqual(errors, []);
  }
  const { io, logs, errors } = output();
  assert.equal(await run(['-v'], io, '/missing-project'), 0);
  assert.deepEqual(logs, ['0.1.0']);
  assert.deepEqual(errors, []);
});

test('invalid commands and options produce diagnostics and exit code 1', async () => {
  for (const [argv, message] of [
    [['unknown'], /Unknown command/], [['dev', '--port', '65536'], /between 0 and 65535/],
    [['build', '--host', 'localhost'], /only supported by the dev command/]
  ]) {
    const { io, logs, errors } = output();
    assert.equal(await run(argv, io), 1);
    assert.deepEqual(logs, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^OCodejs: /);
    assert.match(errors[0], message);
  }
});

test('build resolves relative roots and reports the copied asset count', async t => {
  const root = await project(t, { 'site/public/index.html': 'home', 'site/public/style.css': 'body {}' });
  const { io, logs, errors } = output();
  assert.equal(await run(['build', '--root', 'site'], io, root), 0);
  assert.deepEqual(logs, ['OCodejs build complete: 2 public file(s) -> dist']);
  assert.deepEqual(errors, []);
  const manifest = JSON.parse(await readFile(path.join(root, 'site', 'dist', 'ocode-build.json'), 'utf8'));
  assert.deepEqual(manifest.files, ['index.html', 'style.css']);
});

test('missing project roots and public assets are reported as command failures', async t => {
  const root = await project(t);
  for (const [argv, message] of [
    [['build', '--root', 'missing'], /Project root does not exist/],
    [['build'], /Missing public\/ directory/], [['dev'], /Missing public\/ directory/]
  ]) {
    const { io, logs, errors } = output();
    assert.equal(await run(argv, io, root), 1);
    assert.deepEqual(logs, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], message);
  }
});

test('dev serves public assets when there is no app directory', async t => {
  const root = await project(t, { 'public/index.html': 'static page' });
  const { io, logs, errors } = output();
  const result = await dev(t, root, io);
  assert.deepEqual(await get(result.address.port), { status: 200, body: 'static page' });
  assert.deepEqual(logs, [`OCodejs static dev server ready at http://127.0.0.1:${result.address.port}`]);
  assert.deepEqual(errors, []);
});

test('dev prefers app routes when public assets also exist', async t => {
  const root = await project(t, {
    'public/index.html': 'static page', 'src/app/page.js': 'export default () => "routed page";'
  });
  const { io, logs, errors } = output();
  const result = await dev(t, root, io);
  assert.deepEqual(await get(result.address.port), { status: 200, body: 'routed page' });
  assert.deepEqual(logs, [`OCodejs app dev server ready at http://127.0.0.1:${result.address.port}`]);
  assert.deepEqual(errors, []);
});

test('dev can run app routes without a public directory', async t => {
  const root = await project(t, { 'src/app/page.js': 'export default () => "app only";' });
  const { io } = output();
  const result = await dev(t, root, io);
  assert.deepEqual(await get(result.address.port), { status: 200, body: 'app only' });
});

test('dev falls back to static assets when src/app is a file', async t => {
  const root = await project(t, { 'src/app': 'not a directory', 'public/index.html': 'fallback' });
  const { io, logs } = output();
  const result = await dev(t, root, io);
  assert.deepEqual(await get(result.address.port), { status: 200, body: 'fallback' });
  assert.match(logs[0], /static dev server ready/);
});
