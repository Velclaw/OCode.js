import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, stat, symlink } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { resolveProjectRoot, buildProject, readProjectIndex } from '../src/project.js';
test('resolves project root and builds public assets',async t=>{const root=await mkdtemp(path.join(os.tmpdir(),'ocode-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'public'));await writeFile(path.join(root,'public','index.html'),'<h1>ok</h1>');assert.equal(await resolveProjectRoot(root,'.'),root);const result=await buildProject(root,{now:()=>new Date('2026-01-01T00:00:00Z')});assert.deepEqual(result.files,['index.html']);});

async function fixture(t, files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ocode-project-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  return root;
}

test('resolves default, relative and absolute project roots', async (t) => {
  const root = await fixture(t, { 'site/file.txt': 'fixture' });
  assert.equal(await resolveProjectRoot(root), root);
  assert.equal(await resolveProjectRoot(root, './site/..'), root);
  assert.equal(await resolveProjectRoot(root, 'site'), path.join(root, 'site'));
  assert.equal(await resolveProjectRoot('/unrelated', root), root);
});

test('reports missing roots, files and paths nested under files', async (t) => {
  const root = await fixture(t, { 'file.txt': 'fixture' });
  await assert.rejects(resolveProjectRoot(root, 'missing'), /Project root does not exist/);
  await assert.rejects(resolveProjectRoot(root, 'file.txt/child'), /Project root does not exist/);
  await assert.rejects(resolveProjectRoot(root, 'file.txt'), /Project root is not a directory/);
});

test('build copies nested and binary assets and writes a deterministic manifest', async (t) => {
  const binary = Buffer.from([0, 255, 127, 10]);
  const assets = { 'public/index.html': '<h1>café</h1>', 'public/z.txt': 'last', 'public/assets/icon.png': binary, 'public/assets/a.css': 'body{}' };
  const root = await fixture(t, assets);
  await mkdir(path.join(root, 'public/empty'));
  const result = await buildProject(root, { now: () => new Date('2026-01-02T03:04:05Z') });
  const files = ['assets/a.css', 'assets/icon.png', 'index.html', 'z.txt'];
  assert.equal(result.outputDir, path.join(root, 'dist'));
  assert.deepEqual(result.files, files);
  assert.deepEqual(result.manifest, { framework: 'ocodejs', version: '0.1.0', buildTime: '2026-01-02T03:04:05.000Z', output: 'public', files });
  const serialized = await readFile(path.join(root, 'dist/ocode-build.json'), 'utf8');
  assert.deepEqual(JSON.parse(serialized), result.manifest);
  assert.ok(serialized.endsWith('\n'));
  for (const [file, content] of Object.entries(assets)) {
    assert.deepEqual(await readFile(path.join(root, 'dist', file)), Buffer.from(content));
    assert.deepEqual(await readFile(path.join(root, file)), Buffer.from(content));
  }
  assert.equal((await stat(path.join(root, 'dist/public/empty'))).isDirectory(), true);
  assert.equal(await readProjectIndex(root), '<h1>café</h1>');
});

test('rebuilding removes stale output and reflects changed assets', async (t) => {
  const root = await fixture(t, { 'public/index.html': 'first', 'public/stale.txt': 'stale' });
  await buildProject(root);
  await rm(path.join(root, 'public/stale.txt'));
  await writeFile(path.join(root, 'public/index.html'), 'second');
  const result = await buildProject(root);
  assert.deepEqual(result.files, ['index.html']);
  assert.equal(await readFile(path.join(root, 'dist/public/index.html'), 'utf8'), 'second');
  await assert.rejects(stat(path.join(root, 'dist/public/stale.txt')), { code: 'ENOENT' });
});

for (const [files, message] of [
  [{}, /Missing public\/ directory/],
  [{ public: 'file' }, /Expected public\/ to be a directory/],
  [{ 'public/assets/readme.txt': 'no index' }, /Missing public\/index.html/]
]) {
  test(`invalid build preserves existing output: ${message}`, async (t) => {
    const root = await fixture(t, { ...files, 'dist/previous.txt': 'keep me' });
    await assert.rejects(buildProject(root), message);
    assert.equal(await readFile(path.join(root, 'dist/previous.txt'), 'utf8'), 'keep me');
  });
}

test('rejects asset file and directory symlinks before deleting previous output', async (t) => {
  for (const kind of ['file', 'directory']) {
    const root = await fixture(t, { 'public/index.html': 'ok', 'outside/secret.txt': 'private', 'dist/previous.txt': 'keep' });
    await symlink(path.join(root, kind === 'file' ? 'outside/secret.txt' : 'outside'), path.join(root, 'public/link'));
    await assert.rejects(buildProject(root), /Symbolic links are not supported in public assets: link/);
    assert.equal(await readFile(path.join(root, 'dist/previous.txt'), 'utf8'), 'keep');
  }
});

test('readProjectIndex propagates missing entry errors', async (t) => {
  const root = await fixture(t);
  await assert.rejects(readProjectIndex(root), { code: 'ENOENT' });
});
