import test from 'node:test';
import assert from 'node:assert/strict';
import { composeMiddleware } from '../src/middleware.js';
test('middleware runs in registration order', async () => { const calls=[]; const app=composeMiddleware([async(_r,next)=>{calls.push('a-before');const res=await next();calls.push('a-after');return res;},async(_r,next)=>{calls.push('b-before');const res=await next();calls.push('b-after');return res;}],async()=>{calls.push('handler');return new Response('ok');});assert.equal(await (await app(new Request('http://localhost/'))).text(),'ok');assert.deepEqual(calls,['a-before','b-before','handler','b-after','a-after']); });
test('middleware can short-circuit', async () => { const app=composeMiddleware([async()=>new Response('blocked',{status:403})],async()=>new Response('ok'));const res=await app(new Request('http://localhost/'));assert.equal(res.status,403); });

test('rejects invalid middleware lists and terminal handlers', () => {
  for (const middleware of [null, undefined, {}, 'middleware', [null], [() => {}, 1]]) {
    assert.throws(() => composeMiddleware(middleware, () => new Response('ok')), TypeError);
  }
  for (const terminal of [null, undefined, {}, 'handler']) {
    assert.throws(() => composeMiddleware([], terminal), TypeError);
  }
});

test('an empty pipeline forwards the exact request and response', async () => {
  const request = new Request('http://localhost/');
  const response = new Response('ok');
  const app = composeMiddleware([], received => {
    assert.strictEqual(received, request);
    return response;
  });
  assert.strictEqual(await app(request), response);
});

test('middleware can decorate downstream responses and shares the same request', async () => {
  const request = new Request('http://localhost/?q=1');
  const app = composeMiddleware([
    async (received, next) => {
      assert.strictEqual(received, request);
      const response = await next();
      response.headers.set('x-middleware', 'applied');
      return response;
    }
  ], received => {
    assert.strictEqual(received, request);
    return new Response('rendered', { status: 201 });
  });
  const response = await app(request);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-middleware'), 'applied');
  assert.equal(await response.text(), 'rendered');
});

test('short-circuiting prevents subsequent middleware and terminal execution', async () => {
  const calls = [];
  const blocked = new Response('blocked', { status: 403 });
  const app = composeMiddleware([
    () => { calls.push('guard'); return blocked; },
    () => { calls.push('later'); return new Response('unexpected'); }
  ], () => { calls.push('terminal'); return new Response('unexpected'); });
  assert.strictEqual(await app(new Request('http://localhost/')), blocked);
  assert.deepEqual(calls, ['guard']);
});

test('rejects sequential calls to next without invoking the terminal twice', async () => {
  let calls = 0;
  const app = composeMiddleware([async (_request, next) => {
    await next();
    return next();
  }], () => { calls += 1; return new Response('ok'); });
  await assert.rejects(app(new Request('http://localhost/')), /next\(\) called more than once/);
  assert.equal(calls, 1);
});

test('rejects concurrent calls to next without invoking the terminal twice', async () => {
  let calls = 0;
  const app = composeMiddleware([(_request, next) => Promise.all([next(), next()])], () => {
    calls += 1;
    return new Response('ok');
  });
  await assert.rejects(app(new Request('http://localhost/')), /next\(\) called more than once/);
  assert.equal(calls, 1);
});

test('propagates synchronous and asynchronous errors from middleware and handlers', async () => {
  const request = new Request('http://localhost/');
  const failure = new Error('original failure');
  for (const fail of [() => { throw failure; }, async () => { throw failure; }]) {
    await assert.rejects(composeMiddleware([fail], () => new Response('ok'))(request), error => error === failure);
    await assert.rejects(composeMiddleware([(_request, next) => next()], fail)(request), error => error === failure);
  }
});

test('one composed pipeline can serve concurrent requests and be reused after rejection', async () => {
  const calls = [];
  const app = composeMiddleware([async (request, next) => {
    await Promise.resolve();
    if (new URL(request.url).pathname === '/fail') throw new Error('request failure');
    return next();
  }], request => {
    const pathname = new URL(request.url).pathname;
    calls.push(pathname);
    return new Response(pathname);
  });
  const responses = await Promise.all(['/a', '/b'].map(pathname => app(new Request(`http://localhost${pathname}`))));
  assert.deepEqual(await Promise.all(responses.map(response => response.text())), ['/a', '/b']);
  await assert.rejects(app(new Request('http://localhost/fail')), /request failure/);
  assert.equal(await (await app(new Request('http://localhost/c'))).text(), '/c');
  assert.deepEqual(calls, ['/a', '/b', '/c']);
});

test('the public core entry point exports middleware and runtime functions', async () => {
  const core = await import('@ocodejs/core');
  assert.strictEqual(core.composeMiddleware, composeMiddleware);
  assert.equal(typeof core.createOCodeServer, 'function');
  assert.equal(typeof core.listen, 'function');
});
