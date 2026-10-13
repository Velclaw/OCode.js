import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute } from '../src/match.js';
const manifest = { routes: [{ pathname: '/[slug]', segments: ['[slug]'] }, { pathname: '/about', segments: ['about'] }] };
test('static route takes precedence over dynamic route', () => assert.equal(matchRoute(manifest, '/about').route.pathname, '/about'));
test('dynamic params decode and query is ignored', () => assert.deepEqual(matchRoute(manifest, '/hello%20world?x=1').params, { slug: 'hello world' }));
test('unknown route returns null', () => assert.equal(matchRoute(manifest, '/a/b'), null));

test('normalizes absolute URLs, relative paths, repeated slashes and trailing slashes', () => {
  for (const input of ['about', '//about///', '/about/?q=1#section', 'https://example.test/about?q=1#section']) {
    const match = matchRoute(manifest, input);
    assert.equal(match.route, manifest.routes[1]);
    assert.equal(match.pathname, '/about');
    assert.deepEqual(match.params, {});
  }
});

test('matches root routes and returns null for an empty manifest', () => {
  const root = { pathname: '/', segments: [] };
  assert.deepEqual(matchRoute({ routes: [root] }, '/?q=1'), { route: root, params: {}, pathname: '/' });
  assert.equal(matchRoute({ routes: [] }, '/'), null);
});

test('extracts multiple params without mutating the manifest', () => {
  const route = Object.freeze({ pathname: '/users/[user]/posts/[post]', segments: Object.freeze(['users', '[user]', 'posts', '[post]']) });
  const routes = Object.freeze([route]);
  const match = matchRoute({ routes }, '/users/alice/posts/42');
  assert.equal(match.route, route);
  assert.deepEqual(match.params, { user: 'alice', post: '42' });
  assert.equal(matchRoute({ routes }, '/users/alice/posts'), null);
  assert.equal(matchRoute({ routes }, '/users/alice/posts/42/extra'), null);
});

test('selects the route with most static segments independent of registration order', () => {
  const routes = [
    { pathname: '/[section]/[slug]', segments: ['[section]', '[slug]'] },
    { pathname: '/blog/[slug]', segments: ['blog', '[slug]'] },
    { pathname: '/blog/new', segments: ['blog', 'new'] }
  ];
  for (const ordered of [routes, [...routes].reverse()]) {
    assert.equal(matchRoute({ routes: ordered }, '/blog/new').route, routes[2]);
    assert.equal(matchRoute({ routes: ordered }, '/blog/hello').route, routes[1]);
  }
});

test('uses pathname order to break equally specific matches', () => {
  const routes = [
    { pathname: '/blog/[slug]', segments: ['blog', '[slug]'] },
    { pathname: '/[section]/new', segments: ['[section]', 'new'] }
  ];
  const first = [...routes].sort((a, b) => a.pathname.localeCompare(b.pathname))[0];
  assert.equal(matchRoute({ routes }, '/blog/new').route, first);
  assert.equal(matchRoute({ routes: [...routes].reverse() }, '/blog/new').route, first);
});

test('decodes Unicode and reserved characters in dynamic segments', () => {
  assert.deepEqual(matchRoute(manifest, '/caf%C3%A9').params, { slug: 'café' });
  assert.deepEqual(matchRoute(manifest, '/a%2Fb%3Fc%23d').params, { slug: 'a/b?c#d' });
  assert.equal(matchRoute(manifest, '/a+b').params.slug, 'a+b');
});

test('percent-encoded literals are decoded exactly once', () => {
  assert.equal(matchRoute(manifest, '/literal%2520value').params.slug, 'literal%20value');
});

test('encoded percent signs remain valid literal characters', () => {
  assert.equal(matchRoute(manifest, '/100%25').params.slug, '100%');
});

test('matches encoded static segments and preserves case sensitivity', () => {
  const routes = [{ pathname: '/café', segments: ['caf%C3%A9'] }];
  assert.equal(matchRoute({ routes }, '/caf%C3%A9').route, routes[0]);
  assert.equal(matchRoute({ routes }, '/CAF%C3%89'), null);
  assert.equal(matchRoute({ routes: [{ pathname: '/bad', segments: ['bad%'] }] }, '/bad'), null);
});

test('rejects repeated dynamic parameter names instead of overwriting them', () => {
  const routes = [{ pathname: '/[id]/[id]', segments: ['[id]', '[id]'] }];
  assert.equal(matchRoute({ routes }, '/first/second'), null);
});

test('validates manifest and pathname inputs', () => {
  for (const invalid of [undefined, null, {}, { routes: {} }]) {
    assert.throws(() => matchRoute(invalid, '/'), TypeError);
  }
  for (const invalid of [undefined, null, 123, '', '  ']) {
    assert.throws(() => matchRoute(manifest, invalid), TypeError);
  }
  for (const invalid of ['/%', '/%GG', '/%E0%A4%A', 'https://[invalid/']) {
    assert.throws(() => matchRoute(manifest, invalid), /Invalid pathname/);
  }
});
