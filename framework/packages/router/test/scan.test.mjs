import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanAppDirectory } from '../src/scan.js';

async function fixture(t, files = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ocode-router-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), 'export default () => "fixture";');
  }
  return root;
}

test('empty app returns a versioned manifest with an absolute app path', async (t) => {
  const root = await fixture(t);
  assert.deepEqual(await scanAppDirectory(root), { version: 1, appDirectory: root, routes: [] });
});

test('scans all supported extensions and deterministically orders root, static and dynamic routes', async (t) => {
  const root = await fixture(t, ['z/page.tsx', 'about/page.jsx', '[slug]/page.ts', 'page.js', 'blog/[post]/page.js']);
  const manifest = await scanAppDirectory(path.relative(process.cwd(), root));
  assert.equal(manifest.appDirectory, root);
  assert.deepEqual(manifest.routes.map((route) => route.pathname), ['/', '/about', '/z', '/[slug]', '/blog/[post]']);
  assert.deepEqual(manifest.routes[4], {
    pathname: '/blog/[post]', segments: ['blog', '[post]'], params: ['post'],
    page: path.join(root, 'blog/[post]/page.js'), layouts: [], loadings: [], errors: []
  });
  assert.deepEqual(await scanAppDirectory(root), manifest);
});

test('route groups are URL-neutral and inherit conventions without leaking into siblings', async (t) => {
  const root = await fixture(t, [
    'layout.js', 'loading.tsx', 'error.jsx', '(marketing)/layout.ts',
    '(marketing)/loading.js', '(marketing)/error.js', '(marketing)/docs/layout.jsx',
    '(marketing)/docs/page.tsx', 'other/page.js'
  ]);
  const { routes } = await scanAppDirectory(root);
  const docs = routes.find((route) => route.pathname === '/docs');
  assert.deepEqual(docs.segments, ['docs']);
  assert.deepEqual(docs.params, []);
  assert.deepEqual(docs.layouts, ['layout.js', '(marketing)/layout.ts', '(marketing)/docs/layout.jsx'].map((file) => path.join(root, file)));
  assert.deepEqual(docs.loadings, ['loading.tsx', '(marketing)/loading.js'].map((file) => path.join(root, file)));
  assert.deepEqual(docs.errors, ['error.jsx', '(marketing)/error.js'].map((file) => path.join(root, file)));
  const other = routes.find((route) => route.pathname === '/other');
  assert.deepEqual(other.layouts, [path.join(root, 'layout.js')]);
  assert.deepEqual(other.loadings, [path.join(root, 'loading.tsx')]);
  assert.deepEqual(other.errors, [path.join(root, 'error.jsx')]);
});

test('private directories, node_modules and unrelated files do not create routes', async (t) => {
  const root = await fixture(t, [
    '_private/[[...invalid]]/page.js', 'node_modules/page.js',
    'page.md', 'page.mjs', 'helper.js', '_page.js', 'only-layout/layout.js', 'visible/page.js'
  ]);
  assert.deepEqual((await scanAppDirectory(root)).routes.map((route) => route.pathname), ['/visible']);
});

for (const convention of ['page', 'layout', 'loading', 'error']) {
  test(`rejects duplicate ${convention} convention files`, async (t) => {
    const root = await fixture(t, [`nested/${convention}.js`, `nested/${convention}.tsx`]);
    await assert.rejects(scanAppDirectory(root), new RegExp(`Duplicate ${convention} convention files in nested`));
  });
}

for (const files of [
  ['blog/[id]/page.js', 'blog/[slug]/page.js'],
  ['(one)/about/page.js', '(two)/about/page.js'],
  ['page.js', '(group)/page.js']
]) {
  test(`rejects colliding routes: ${files.join(', ')}`, async (t) => {
    const root = await fixture(t, files);
    await assert.rejects(scanAppDirectory(root), /Route collision:/);
  });
}

for (const segment of ['[...slug]', '[[...slug]]', '[123]', '[bad-name]', 'prefix[id]', '[id']) {
  test(`rejects unsupported segment ${segment} even without a page`, async (t) => {
    const root = await fixture(t);
    await mkdir(path.join(root, segment));
    await assert.rejects(scanAppDirectory(root), /Unsupported dynamic route segment/);
  });
}

test('supports nested groups and valid dynamic parameter identifiers', async (t) => {
  const root = await fixture(t, ['(outer)/(inner)/[user_id]/[Post2]/page.js']);
  const [route] = (await scanAppDirectory(root)).routes;
  assert.equal(route.pathname, '/[user_id]/[Post2]');
  assert.deepEqual(route.params, ['user_id', 'Post2']);
});

test('rejects symlink files and directories', async (t) => {
  for (const kind of ['file', 'directory']) {
    const root = await fixture(t, ['real/page.js']);
    await symlink(path.join(root, kind === 'file' ? 'real/page.js' : 'real'), path.join(root, kind === 'file' ? 'page.js' : 'linked'));
    await assert.rejects(scanAppDirectory(root), /Symbolic links are not supported/);
  }
});

test('reports missing app directories and non-directory paths', async (t) => {
  const root = await fixture(t, ['file.js']);
  await assert.rejects(scanAppDirectory(path.join(root, 'missing')), /App directory does not exist/);
  await assert.rejects(scanAppDirectory(path.join(root, 'file.js/child')), /App directory does not exist/);
  await assert.rejects(scanAppDirectory(path.join(root, 'file.js')), /App path is not a directory/);
});

test('public router entry exports the scanner and matcher', async () => {
  const router = await import('@ocodejs/router');
  assert.equal(router.scanAppDirectory, scanAppDirectory);
  assert.equal(typeof router.matchRoute, 'function');
});
