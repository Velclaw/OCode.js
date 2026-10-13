import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';
test('parses dev options',()=>assert.deepEqual(parseArgs(['dev','--root','examples/basic','--port','0']),{command:'dev',options:{root:'examples/basic',port:0}}));
test('rejects invalid port',()=>assert.throws(()=>parseArgs(['dev','--port','70000']),/between 0 and 65535/));
test('help and version are recognized',()=>{assert.equal(parseArgs(['--help']).command,'help');assert.equal(parseArgs(['--version']).command,'version');});
