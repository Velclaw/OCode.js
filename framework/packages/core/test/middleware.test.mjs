import test from 'node:test';
import assert from 'node:assert/strict';
import { composeMiddleware } from '../src/middleware.js';
test('middleware runs in registration order', async () => { const calls=[]; const app=composeMiddleware([async(_r,next)=>{calls.push('a-before');const res=await next();calls.push('a-after');return res;},async(_r,next)=>{calls.push('b-before');const res=await next();calls.push('b-after');return res;}],async()=>{calls.push('handler');return new Response('ok');});assert.equal(await (await app(new Request('http://localhost/'))).text(),'ok');assert.deepEqual(calls,['a-before','b-before','handler','b-after','a-after']); });
test('middleware can short-circuit', async () => { const app=composeMiddleware([async()=>new Response('blocked',{status:403})],async()=>new Response('ok'));const res=await app(new Request('http://localhost/'));assert.equal(res.status,403); });

test('empty middleware passes the original request and response through', async () => {
  const request = new Request('http://localhost/');
  const response = new Response('ok');
  const app = composeMiddleware([], (received) => {
    assert.equal(received, request);
    return response;
  });
  assert.equal(await app(request), response);
});

test('short-circuit skips later middleware and the terminal handler', async () => {
  const calls = [];
  const response = new Response('unauthorized', { status: 401 });
  const app = composeMiddleware([
    () => { calls.push('auth'); return response; },
    () => { calls.push('later'); return new Response('unexpected'); }
  ], () => { calls.push('terminal'); return new Response('unexpected'); });
  assert.equal(await app(new Request('http://localhost/')), response);
  assert.deepEqual(calls, ['auth']);
});

test('middleware can inspect requests and modify downstream responses', async () => {
  const request = new Request('http://localhost/', { headers: { 'x-client': 'unit-test' } });
  const app = composeMiddleware([async (received, next) => {
    assert.equal(received, request);
    assert.equal(received.headers.get('x-client'), 'unit-test');
    const response = await next();
    response.headers.set('x-middleware', 'applied');
    return response;
  }], () => new Response('ok'));
  assert.equal((await app(request)).headers.get('x-middleware'), 'applied');
});

test('rejects calling next twice and executes terminal only once', async () => {
  let calls = 0;
  const app = composeMiddleware([async (_request, next) => {
    await next();
    return next();
  }], () => { calls += 1; return new Response('ok'); });
  await assert.rejects(app(new Request('http://localhost/')), /next\(\) called more than once/);
  assert.equal(calls, 1);
});

test('propagates synchronous middleware errors and asynchronous terminal errors', async () => {
  const failure = new Error('expected failure');
  const request = new Request('http://localhost/');
  const fromMiddleware = composeMiddleware([() => { throw failure; }], () => new Response('unused'));
  const fromTerminal = composeMiddleware([(_request, next) => next()], async () => { throw failure; });
  await assert.rejects(fromMiddleware(request), (error) => error === failure);
  await assert.rejects(fromTerminal(request), (error) => error === failure);
});

test('dispatch state is independent for concurrent and subsequent requests', async () => {
  const app = composeMiddleware([async (_request, next) => { await Promise.resolve(); return next(); }],
    (request) => new Response(new URL(request.url).pathname));
  const paths = ['/one', '/two', '/three'];
  const bodies = await Promise.all(paths.map(async (pathname) => (await app(new Request(`http://localhost${pathname}`))).text()));
  assert.deepEqual(bodies, paths);
  assert.equal(await (await app(new Request('http://localhost/four'))).text(), '/four');
});

test('validates middleware arrays and terminal handlers', () => {
  for (const invalid of [undefined, null, {}, [null], [() => {}, 'invalid']]) {
    assert.throws(() => composeMiddleware(invalid, () => new Response('ok')), TypeError);
  }
  for (const invalid of [undefined, null, 'handler', {}]) {
    assert.throws(() => composeMiddleware([], invalid), TypeError);
  }
});
