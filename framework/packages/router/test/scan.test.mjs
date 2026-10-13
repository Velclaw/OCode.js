import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanAppDirectory } from '../src/scan.js';

async function app(t, files = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ocode-scan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), 'export default () => "fixture";');
  }
  return root;
}

test('empty app directories produce a versioned empty manifest', async t => {
  const root = await app(t);
  assert.deepEqual(await scanAppDirectory(root), { version: 1, appDirectory: root, routes: [] });
});

test('scans root, nested, and dynamic pages in deterministic order', async t => {
  const root = await app(t, ['blog/[slug]/page.tsx', 'z/page.jsx', 'page.js', 'about/page.ts', 'blog/new/page.js']);
  const result = await scanAppDirectory(path.join(root, '.'));
  assert.equal(result.appDirectory, root);
  assert.deepEqual(result.routes.map(route => route.pathname), ['/', '/about', '/z', '/blog/new', '/blog/[slug]']);
  const dynamic = result.routes.at(-1);
  assert.deepEqual(dynamic, {
    pathname: '/blog/[slug]', segments: ['blog', '[slug]'], params: ['slug'],
    page: path.join(root, 'blog', '[slug]', 'page.tsx'), layouts: [], loadings: [], errors: []
  });
  assert.deepEqual(await scanAppDirectory(root), result);
});

test('route groups inherit conventions without appearing in URLs and siblings remain isolated', async t => {
  const root = await app(t, [
    'layout.js', 'loading.ts', 'error.jsx', '(shop)/layout.tsx', '(shop)/loading.js', '(shop)/error.ts',
    '(shop)/products/[id]/layout.js', '(shop)/products/[id]/page.js', 'about/page.js'
  ]);
  const { routes } = await scanAppDirectory(root);
  const product = routes.find(route => route.pathname === '/products/[id]');
  assert.deepEqual(product.segments, ['products', '[id]']);
  assert.deepEqual(product.params, ['id']);
  assert.deepEqual(product.layouts, ['layout.js', '(shop)/layout.tsx', '(shop)/products/[id]/layout.js'].map(file => path.join(root, file)));
  assert.deepEqual(product.loadings, ['loading.ts', '(shop)/loading.js'].map(file => path.join(root, file)));
  assert.deepEqual(product.errors, ['error.jsx', '(shop)/error.ts'].map(file => path.join(root, file)));
  const about = routes.find(route => route.pathname === '/about');
  assert.deepEqual(about.layouts, [path.join(root, 'layout.js')]);
  assert.deepEqual(about.loadings, [path.join(root, 'loading.ts')]);
  assert.deepEqual(about.errors, [path.join(root, 'error.jsx')]);
});

test('a page inside nested route groups can define the root URL', async t => {
  const root = await app(t, ['(one)/(two)/page.js']);
  const { routes } = await scanAppDirectory(root);
  assert.equal(routes[0].pathname, '/');
  assert.deepEqual(routes[0].segments, []);
});

test('ignores private entries, node_modules, unrelated files, and unsupported extensions', async t => {
  const root = await app(t, [
    'page.js', '_private/[...bad]/page.js', 'node_modules/[...bad]/page.js',
    '_page.tsx', 'page.mjs', 'page.txt', 'helper.ts', 'layout.css', 'ordinary/helper.js'
  ]);
  await symlink(path.join(root, 'missing'), path.join(root, '_ignored-link'));
  const { routes } = await scanAppDirectory(root);
  assert.deepEqual(routes.map(route => route.pathname), ['/']);
  assert.deepEqual(routes[0].layouts, []);
});

for (const convention of ['page', 'layout', 'loading', 'error']) {
  test(`rejects duplicate ${convention} files across supported extensions`, async t => {
    const root = await app(t, [`nested/${convention}.js`, `nested/${convention}.tsx`]);
    await assert.rejects(scanAppDirectory(root), new RegExp(`Duplicate ${convention} convention files in nested`));
  });
}

test('rejects static collisions caused by URL-neutral groups', async t => {
  const root = await app(t, ['(first)/about/page.js', '(second)/about/page.js']);
  await assert.rejects(scanAppDirectory(root), /Route collision:.*\/about.*conflicts with \/about/);
});

test('rejects structurally identical dynamic routes with different parameter names', async t => {
  const root = await app(t, ['blog/[id]/page.js', 'blog/[slug]/page.js']);
  await assert.rejects(scanAppDirectory(root), /Route collision:.*\/blog\/\[id\].*\/blog\/\[slug\]/);
});

test('rejects root collisions caused by route groups', async t => {
  const root = await app(t, ['page.js', '(group)/page.js']);
  await assert.rejects(scanAppDirectory(root), /Route collision/);
});

test('accepts valid dynamic identifiers and tracks parameters in path order', async t => {
  const root = await app(t, ['[user_id]/posts/[Post2]/page.js']);
  const { routes } = await scanAppDirectory(root);
  assert.deepEqual(routes[0].params, ['user_id', 'Post2']);
});

test('rejects unsupported dynamic segments even in directories without pages', async t => {
  const root = await app(t);
  for (const segment of ['[...slug]', '[[slug]]', '[1id]', '[]', '[bad-name]', 'prefix[id]', '[id']) {
    const directory = path.join(root, segment);
    await mkdir(directory);
    await assert.rejects(scanAppDirectory(root), /Unsupported dynamic route segment/);
    await rm(directory, { recursive: true });
  }
});

for (const kind of ['file', 'directory', 'dangling']) {
  test(`rejects ${kind} symlinks inside app routes`, async t => {
    const root = await app(t, ['page.js', 'nested/helper.js']);
    const target = kind === 'file' ? path.join(root, 'page.js')
      : kind === 'directory' ? root : path.join(root, 'missing');
    await symlink(target, path.join(root, 'nested', 'link'));
    await assert.rejects(scanAppDirectory(root), /Symbolic links are not supported in app routes: nested\/link/);
  });
}

test('rejects missing app paths, files, and paths nested below files', async t => {
  const root = await app(t, ['file.js']);
  await assert.rejects(scanAppDirectory(path.join(root, 'missing')), /App directory does not exist/);
  await assert.rejects(scanAppDirectory(path.join(root, 'file.js')), /App path is not a directory/);
  await assert.rejects(scanAppDirectory(path.join(root, 'file.js', 'child')), /App directory does not exist/);
});
