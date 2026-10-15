/**
 * Parse CLI arguments after the executable name into a command and supplied options.
 * Empty input selects help; ports accept decimal integers from 0 through 65535.
 * Throws TypeError for non-string-array input and Error for unknown commands or
 * options, duplicate options, invalid values, or --host with build.
 */
export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== 'string')) throw new TypeError('Arguments must be an array of strings.');
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') return { command: 'help', options: {} };
  if (command === '--version' || command === '-v') return { command: 'version', options: {} };
  if (!['dev', 'build'].includes(command)) throw new Error(`Unknown command "${command}". Run "ocode --help" for usage.`);
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === '--help' || token === '-h') return { command: 'help', options: {} };
    if (!['--root', '--host', '--port'].includes(token)) throw new Error(`Unknown option "${token}".`);
    if (options[token.slice(2)] !== undefined) throw new Error(`Option "${token}" may only be provided once.`);
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Option "${token}" requires a value.`);
    if (token === '--port') {
      if (!/^\d+$/.test(value)) throw new Error('Option "--port" must be an integer between 0 and 65535.');
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Option "--port" must be an integer between 0 and 65535.');
      options.port = port;
    } else {
      if (!value.trim()) throw new Error(`Option "${token}" cannot be empty.`);
      options[token.slice(2)] = value;
    }
    i += 1;
  }
  if (command === 'build' && options.host !== undefined) throw new Error('Option "--host" is only supported by the dev command.');
  return { command, options };
}
export const HELP_TEXT = `OCodejs CLI (early foundation)

Usage:
  ocode dev [--root <dir>] [--host <host>] [--port <0-65535>]
  ocode build [--root <dir>]
  ocode --help
  ocode --version

Commands:
  dev    Run src/app routes when present, otherwise serve public/ assets.
  build  Copy public/ assets to dist/public/ and write dist/ocode-build.json.

When src/app exists, dev uses the file-system router and HTTP runtime. Otherwise it serves public/ assets.`;
