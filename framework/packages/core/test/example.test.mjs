import test from 'node:test';
import assert from 'node:assert/strict';
import BlogPage from '../../../examples/routed-app/src/app/blog/[slug]/page.js';
import RootLayout from '../../../examples/routed-app/src/app/layout.js';
import HomePage from '../../../examples/routed-app/src/app/page.js';

test('dynamic example escapes HTML metacharacters in URL params', () => {
  const html = BlogPage({ params: { slug: `<script a="x" b='y'>&</script>` } });
  assert.ok(html.includes('&lt;script a=&quot;x&quot; b=&#39;y&#39;&gt;&amp;&lt;/script&gt;'));
  assert.equal(html.includes('<script'), false);
});

test('dynamic example handles empty and Unicode slugs', () => {
  assert.ok(BlogPage({ params: { slug: '' } }).includes('<h1>Bài viết: </h1>'));
  assert.ok(BlogPage({ params: { slug: 'café' } }).includes('café'));
});

test('example root layout wraps rendered HTML and exposes navigation', () => {
  const page = HomePage();
  const html = RootLayout({ children: page });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes(`<main>${page}</main>`));
  assert.ok(html.includes('href="/"'));
  assert.ok(html.includes('href="/blog/hello"'));
});
