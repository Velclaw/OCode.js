import test from 'node:test';
import assert from 'node:assert/strict';
import { composeMiddleware } from '../src/middleware.js';
test('middleware runs in registration order', async () => { const calls=[]; const app=composeMiddleware([async(_r,next)=>{calls.push('a-before');const res=await next();calls.push('a-after');return res;},async(_r,next)=>{calls.push('b-before');const res=await next();calls.push('b-after');return res;}],async()=>{calls.push('handler');return new Response('ok');});assert.equal(await (await app(new Request('http://localhost/'))).text(),'ok');assert.deepEqual(calls,['a-before','b-before','handler','b-after','a-after']); });
test('middleware can short-circuit', async () => { const app=composeMiddleware([async()=>new Response('blocked',{status:403})],async()=>new Response('ok'));const res=await app(new Request('http://localhost/'));assert.equal(res.status,403); });
