import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir, symlink } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { resolveProjectRoot, buildProject, readProjectIndex } from '../src/project.js';
test('resolves project root and builds public assets',async t=>{const root=await mkdtemp(path.join(os.tmpdir(),'ocode-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'public'));await writeFile(path.join(root,'public','index.html'),'<h1>ok</h1>');assert.equal(await resolveProjectRoot(root,'.'),root);const result=await buildProject(root,{now:()=>new Date('2026-01-01T00:00:00Z')});assert.deepEqual(result.files,['index.html']);});

async function project(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ocode-project-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('resolves default, relative, and absolute project directories', async t => {
  const root = await project(t);
  await mkdir(path.join(root, 'site'));
  assert.equal(await resolveProjectRoot(root), root);
  assert.equal(await resolveProjectRoot(root, './site/..'), root);
  assert.equal(await resolveProjectRoot(root, 'site'), path.join(root, 'site'));
  assert.equal(await resolveProjectRoot('/unused', root), root);
});

test('rejects missing roots, files, and paths nested below files', async t => {
  const root = await project(t);
  await writeFile(path.join(root, 'file'), 'not a directory');
  await assert.rejects(resolveProjectRoot(root, 'missing'), /Project root does not exist/);
  await assert.rejects(resolveProjectRoot(root, 'file'), /Project root is not a directory/);
  await assert.rejects(resolveProjectRoot(root, 'file/child'), /Project root does not exist/);
});

test('copies nested and binary assets and writes a deterministic manifest', async t => {
  const root = await project(t);
  await mkdir(path.join(root, 'public', 'assets', 'nested'), { recursive: true });
  const binary = Buffer.from([0, 255, 1, 128]);
  await writeFile(path.join(root, 'public', 'z.txt'), 'last');
  await writeFile(path.join(root, 'public', 'index.html'), '<h1>café</h1>');
  await writeFile(path.join(root, 'public', 'assets', 'nested', 'image.png'), binary);
  const buildTime = '2026-01-01T00:00:00.000Z';
  const result = await buildProject(root, { now: () => new Date(buildTime) });
  const files = ['assets/nested/image.png', 'index.html', 'z.txt'];
  const expected = { framework: 'ocodejs', version: '0.1.0', buildTime, output: 'public', files };
  assert.equal(result.outputDir, path.join(root, 'dist'));
  assert.deepEqual(result.files, files);
  assert.deepEqual(result.manifest, expected);
  const manifest = await readFile(path.join(root, 'dist', 'ocode-build.json'), 'utf8');
  assert.deepEqual(JSON.parse(manifest), expected);
  assert.ok(manifest.endsWith('\n'));
  assert.deepEqual(await readFile(path.join(root, 'dist', 'public', 'assets', 'nested', 'image.png')), binary);
  assert.equal(await readFile(path.join(root, 'dist', 'public', 'index.html'), 'utf8'), '<h1>café</h1>');
  assert.equal(await readFile(path.join(root, 'dist', 'public', 'z.txt'), 'utf8'), 'last');
  assert.equal(await readProjectIndex(root), '<h1>café</h1>');
});

test('a rebuild removes stale output while preserving source assets', async t => {
  const root = await project(t);
  await mkdir(path.join(root, 'public'));
  await writeFile(path.join(root, 'public', 'index.html'), 'first');
  await writeFile(path.join(root, 'public', 'removed.txt'), 'old');
  await buildProject(root);
  await writeFile(path.join(root, 'dist', 'stale.txt'), 'stale');
  await rm(path.join(root, 'public', 'removed.txt'));
  await writeFile(path.join(root, 'public', 'index.html'), 'second');
  const result = await buildProject(root);
  assert.deepEqual(result.files, ['index.html']);
  assert.deepEqual((await readdir(result.outputDir)).sort(), ['ocode-build.json', 'public']);
  assert.deepEqual(await readdir(path.join(result.outputDir, 'public')), ['index.html']);
  assert.equal(await readProjectIndex(root), 'second');
  assert.equal(await readFile(path.join(result.outputDir, 'public', 'index.html'), 'utf8'), 'second');
});

test('invalid public directories and missing entry points preserve existing output', async t => {
  const root = await project(t);
  await mkdir(path.join(root, 'dist'));
  const marker = path.join(root, 'dist', 'keep.txt');
  await writeFile(marker, 'previous build');
  await assert.rejects(buildProject(root), /Missing public\/ directory/);
  await writeFile(path.join(root, 'public'), 'file');
  await assert.rejects(buildProject(root), /Expected public\/ to be a directory/);
  await rm(path.join(root, 'public'));
  await mkdir(path.join(root, 'public', 'nested'), { recursive: true });
  await writeFile(path.join(root, 'public', 'nested', 'index.html'), 'not a root entry point');
  await assert.rejects(buildProject(root), /Missing public\/index.html/);
  assert.equal(await readFile(marker, 'utf8'), 'previous build');
});

for (const kind of ['file', 'directory', 'dangling']) {
  test(`build rejects ${kind} symlinks before deleting existing output`, async t => {
    const root = await project(t);
    await mkdir(path.join(root, 'public', 'nested'), { recursive: true });
    await mkdir(path.join(root, 'dist'));
    await writeFile(path.join(root, 'public', 'index.html'), 'ok');
    await writeFile(path.join(root, 'dist', 'keep.txt'), 'previous build');
    const target = kind === 'file' ? path.join(root, 'public', 'index.html')
      : kind === 'directory' ? path.join(root, 'public') : path.join(root, 'missing');
    await symlink(target, path.join(root, 'public', 'nested', 'link'));
    await assert.rejects(buildProject(root), /Symbolic links are not supported.*nested\/link/);
    assert.equal(await readFile(path.join(root, 'dist', 'keep.txt'), 'utf8'), 'previous build');
  });
}

test('reading a missing project index preserves the filesystem error', async t => {
  const root = await project(t);
  await assert.rejects(readProjectIndex(root), { code: 'ENOENT' });
});
