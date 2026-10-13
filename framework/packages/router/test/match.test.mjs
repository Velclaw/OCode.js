import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute } from '../src/match.js';
const manifest = { routes: [{ pathname: '/[slug]', segments: ['[slug]'] }, { pathname: '/about', segments: ['about'] }] };
test('static route takes precedence over dynamic route', () => assert.equal(matchRoute(manifest, '/about').route.pathname, '/about'));
test('dynamic params decode and query is ignored', () => assert.deepEqual(matchRoute(manifest, '/hello%20world?x=1').params, { slug: 'hello world' }));
test('unknown route returns null', () => assert.equal(matchRoute(manifest, '/a/b'), null));

function routes(...pathnames) {
  return { routes: pathnames.map(pathname => ({
    pathname, segments: pathname === '/' ? [] : pathname.slice(1).split('/')
  })) };
}

test('matches the root route and returns the original route object', () => {
  const manifest = routes('/', '/about');
  assert.deepEqual(matchRoute(manifest, '/?q=1#top'), {
    route: manifest.routes[0], params: {}, pathname: '/'
  });
  assert.strictEqual(matchRoute(manifest, '/').route, manifest.routes[0]);
  assert.equal(matchRoute(routes('/[slug]'), '/'), null);
  assert.equal(matchRoute({ routes: [] }, '/'), null);
});

test('normalizes absolute URLs, relative paths, repeated slashes, queries, and fragments', () => {
  for (const pathname of ['about', '/about/', '///about//', '/about?x=1#top', 'https://example.test/about/?x=1#top']) {
    assert.deepEqual(matchRoute(routes('/about'), pathname), {
      route: { pathname: '/about', segments: ['about'] }, params: {}, pathname: '/about'
    });
  }
});

test('matches multiple dynamic segments without mutating the manifest', () => {
  const manifest = routes('/users/[userId]/posts/[postId]');
  const original = structuredClone(manifest);
  const result = matchRoute(manifest, '/users/alice/posts/42');
  assert.deepEqual(result.params, { userId: 'alice', postId: '42' });
  assert.deepEqual(manifest, original);
  assert.equal(matchRoute(manifest, '/users/alice/posts'), null);
  assert.equal(matchRoute(manifest, '/users/alice/posts/42/extra'), null);
  assert.equal(matchRoute(manifest, '/teams/alice/posts/42'), null);
});

test('static specificity wins regardless of manifest order', () => {
  const pathnames = ['/[section]/[id]', '/docs/[id]', '/docs/new'];
  for (const ordered of [pathnames, [...pathnames].reverse()]) {
    const manifest = routes(...ordered);
    assert.equal(matchRoute(manifest, '/docs/new').route.pathname, '/docs/new');
    assert.equal(matchRoute(manifest, '/docs/123').route.pathname, '/docs/[id]');
    assert.equal(matchRoute(manifest, '/blog/123').route.pathname, '/[section]/[id]');
  }
});

test('equal specificity is resolved deterministically by route pathname', () => {
  const first = matchRoute(routes('/[name]', '/[id]'), '/value');
  const second = matchRoute(routes('/[id]', '/[name]'), '/value');
  assert.equal(first.route.pathname, '/[id]');
  assert.deepEqual(first, second);
});

test('decodes Unicode and reserved characters within dynamic segments', () => {
  for (const [encoded, decoded] of [
    ['caf%C3%A9', 'café'], ['a%2Fb', 'a/b'], ['a%3Fb%23c', 'a?b#c'], ['hello+world', 'hello+world']
  ]) {
    assert.deepEqual(matchRoute(routes('/[value]'), `/${encoded}`).params, { value: decoded });
  }
  assert.equal(matchRoute(routes('/[value]'), '/a%2Fb').pathname, '/a%2Fb');
});

test('matches decoded static names and preserves case sensitivity', () => {
  assert.equal(matchRoute(routes('/café'), '/caf%C3%A9').route.pathname, '/café');
  assert.equal(matchRoute(routes('/hello%20world'), '/hello%20world').route.pathname, '/hello%20world');
  assert.equal(matchRoute(routes('/about'), '/About'), null);
  assert.equal(matchRoute(routes('/bad%route'), '/bad'), null);
});

test('rejects invalid manifests and empty or non-string pathnames', () => {
  for (const manifest of [null, undefined, {}, { routes: {} }]) {
    assert.throws(() => matchRoute(manifest, '/'), TypeError);
  }
  for (const pathname of [null, undefined, 1, '', '   ']) {
    assert.throws(() => matchRoute(routes('/'), pathname), TypeError);
  }
});

test('malformed URL encodings produce a controlled pathname error', () => {
  for (const pathname of ['/%', '/%GG', '/%E0%A4', 'http://[invalid/']) {
    assert.throws(() => matchRoute(routes('/[value]'), pathname), /Invalid pathname/);
  }
});

test('a dynamic parameter name cannot be reused in one route', () => {
  assert.equal(matchRoute(routes('/[id]/[id]'), '/a/b'), null);
  const result = matchRoute(routes('/[id]/[id]', '/[first]/[second]'), '/a/b');
  assert.deepEqual(result.params, { first: 'a', second: 'b' });
});

test('parameter names inherited from Object.prototype remain ordinary own values', () => {
  const result = matchRoute(routes('/[constructor]/[toString]'), '/alice/profile');
  assert.deepEqual(result.params, { constructor: 'alice', toString: 'profile' });
  assert.equal(Object.getPrototypeOf(result.params), Object.prototype);
});

test('the public router entry point exports the tested route functions', async () => {
  const router = await import('@ocodejs/router');
  assert.strictEqual(router.matchRoute, matchRoute);
  assert.equal(typeof router.scanAppDirectory, 'function');
});
