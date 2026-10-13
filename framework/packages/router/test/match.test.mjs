import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute } from '../src/match.js';
const manifest = { routes: [{ pathname: '/[slug]', segments: ['[slug]'] }, { pathname: '/about', segments: ['about'] }] };
test('static route takes precedence over dynamic route', () => assert.equal(matchRoute(manifest, '/about').route.pathname, '/about'));
test('dynamic params decode and query is ignored', () => assert.deepEqual(matchRoute(manifest, '/hello%20world?x=1').params, { slug: 'hello world' }));
test('unknown route returns null', () => assert.equal(matchRoute(manifest, '/a/b'), null));
