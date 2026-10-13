import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';
test('parses dev options',()=>assert.deepEqual(parseArgs(['dev','--root','examples/basic','--port','0']),{command:'dev',options:{root:'examples/basic',port:0}}));
test('rejects invalid port',()=>assert.throws(()=>parseArgs(['dev','--port','70000']),/between 0 and 65535/));
test('help and version are recognized',()=>{assert.equal(parseArgs(['--help']).command,'help');assert.equal(parseArgs(['--version']).command,'version');});

test('empty arguments and help aliases produce help without options', () => {
  for (const argv of [[], ['-h'], ['dev', '-h'], ['build', '--help']]) {
    assert.deepEqual(parseArgs(argv), { command: 'help', options: {} });
  }
  assert.deepEqual(parseArgs(['-v']), { command: 'version', options: {} });
});

test('accepts default commands and preserves root and host values', () => {
  assert.deepEqual(parseArgs(['dev']), { command: 'dev', options: {} });
  assert.deepEqual(parseArgs(['build']), { command: 'build', options: {} });
  const argv = ['dev', '--host', 'localhost', '--root', 'a directory', '--port', '65535'];
  const original = [...argv];
  assert.deepEqual(parseArgs(argv), {
    command: 'dev', options: { host: 'localhost', root: 'a directory', port: 65535 }
  });
  assert.deepEqual(argv, original);
  assert.deepEqual(parseArgs(['build', '--root', '/tmp/site']), {
    command: 'build', options: { root: '/tmp/site' }
  });
});

test('rejects arguments that are not arrays of strings', () => {
  for (const argv of [undefined, null, 'dev', {}, ['dev', 3000], ['dev', null]]) {
    assert.throws(() => parseArgs(argv), TypeError);
  }
});

test('reports unknown commands, options, and positional arguments', () => {
  assert.throws(() => parseArgs(['serve']), /Unknown command "serve"/);
  for (const option of ['--unknown', '-p', 'extra', '--port=3000']) {
    assert.throws(() => parseArgs(['dev', option]), /Unknown option/);
  }
});

for (const option of ['--root', '--host', '--port']) {
  test(`${option} requires a value and rejects duplicates`, () => {
    const value = option === '--port' ? '3000' : 'example';
    assert.throws(() => parseArgs(['dev', option]), /requires a value/);
    assert.throws(() => parseArgs(['dev', option, '--help']), /requires a value/);
    assert.throws(() => parseArgs(['dev', option, value, option, value]), /only be provided once/);
  });
}

test('rejects empty root and host values', () => {
  for (const option of ['--root', '--host']) {
    for (const value of ['', '   ', '\t']) {
      assert.throws(() => parseArgs(['dev', option, value]), /cannot be empty/);
    }
  }
});

test('validates port boundaries and rejects non-integer formats', () => {
  for (const [value, expected] of [['0', 0], ['65535', 65535], ['00080', 80]]) {
    assert.equal(parseArgs(['dev', '--port', value]).options.port, expected);
  }
  for (const value of ['-1', '65536', '1.5', '1e3', '+80', ' 80', '80 ', '', 'NaN', 'Infinity']) {
    assert.throws(() => parseArgs(['dev', '--port', value]), /integer between 0 and 65535/);
  }
  assert.throws(() => parseArgs(['dev', '--port', '0', '--port', '1']), /only be provided once/);
});

test('build rejects the dev-only host option', () => {
  assert.throws(() => parseArgs(['build', '--host', 'localhost']), /only supported by the dev command/);
});
