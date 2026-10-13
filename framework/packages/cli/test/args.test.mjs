import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';
test('parses dev options',()=>assert.deepEqual(parseArgs(['dev','--root','examples/basic','--port','0']),{command:'dev',options:{root:'examples/basic',port:0}}));
test('rejects invalid port',()=>assert.throws(()=>parseArgs(['dev','--port','70000']),/between 0 and 65535/));
test('help and version are recognized',()=>{assert.equal(parseArgs(['--help']).command,'help');assert.equal(parseArgs(['--version']).command,'version');});

for (const argv of [undefined, null, 'dev', {}, ['dev', 3000], ['dev', null]]) {
  test(`rejects non-string arguments: ${JSON.stringify(argv)}`, () => {
    assert.throws(() => parseArgs(argv), TypeError);
  });
}

for (const argv of [[], ['-h'], ['--help'], ['dev', '-h'], ['build', '--help']]) {
  test(`returns help for ${JSON.stringify(argv)}`, () => {
    assert.deepEqual(parseArgs(argv), { command: 'help', options: {} });
  });
}

test('parses version alias and commands without options', () => {
  assert.deepEqual(parseArgs(['-v']), { command: 'version', options: {} });
  for (const command of ['dev', 'build']) {
    assert.deepEqual(parseArgs([command]), { command, options: {} });
  }
});

test('keeps root and host strings and accepts options in any order', () => {
  const argv = ['dev', '--host', '0.0.0.0', '--port', '65535', '--root', 'project with spaces'];
  assert.deepEqual(parseArgs(argv), {
    command: 'dev', options: { host: '0.0.0.0', port: 65535, root: 'project with spaces' }
  });
  assert.deepEqual(argv, ['dev', '--host', '0.0.0.0', '--port', '65535', '--root', 'project with spaces']);
  assert.deepEqual(parseArgs(['build', '--root', './site']), { command: 'build', options: { root: './site' } });
});

for (const port of ['0', '1', '65535']) {
  test(`accepts valid port ${port}`, () => {
    assert.equal(parseArgs(['dev', '--port', port]).options.port, Number(port));
  });
}

for (const port of ['-1', '65536', '1.5', '1e3', 'NaN', 'Infinity', '', ' 80 ', '9007199254740993']) {
  test(`rejects invalid port ${JSON.stringify(port)}`, () => {
    assert.throws(() => parseArgs(['dev', '--port', port]), /integer between 0 and 65535/);
  });
}

for (const option of ['--root', '--host', '--port']) {
  test(`rejects missing and duplicate values for ${option}`, () => {
    assert.throws(() => parseArgs(['dev', option]), /requires a value/);
    assert.throws(() => parseArgs(['dev', option, '--help']), /requires a value/);
    const value = option === '--port' ? '0' : 'site';
    assert.throws(() => parseArgs(['dev', option, value, option, value]), /only be provided once/);
  });
}

test('rejects empty root and host, unknown options and unsupported commands', () => {
  for (const option of ['--root', '--host']) {
    assert.throws(() => parseArgs(['dev', option, '  ']), /cannot be empty/);
  }
  assert.throws(() => parseArgs(['serve']), /Unknown command "serve"/);
  assert.throws(() => parseArgs(['dev', '--verbose']), /Unknown option "--verbose"/);
  assert.throws(() => parseArgs(['dev', 'extra']), /Unknown option "extra"/);
  assert.throws(() => parseArgs(['build', '--host', 'localhost']), /only supported by the dev command/);
});
