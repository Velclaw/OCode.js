#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs, HELP_TEXT } from './args.js';
import { buildProject, resolveProjectRoot } from './project.js';
import { createDevServer, listen } from './dev-server.js';
import { createOCodeServer } from '@ocodejs/core';
import { stat } from 'node:fs/promises';
export async function run(argv = process.argv.slice(2), io = console, cwd = process.cwd()) {
  try {
    const parsed = parseArgs(argv);
    if (parsed.command === 'help') { io.log(HELP_TEXT); return 0; }
    if (parsed.command === 'version') { io.log('0.1.0'); return 0; }
    const root = await resolveProjectRoot(cwd, parsed.options.root ?? '.');
    if (parsed.command === 'build') {
      const result = await buildProject(root);
      io.log(`OCodejs build complete: ${result.files.length} public file(s) -> ${path.relative(root, result.outputDir) || 'dist'}`);
      return 0;
    }
    const appDirectory = path.join(root, 'src', 'app');
    let useAppRuntime = false;
    try { useAppRuntime = (await stat(appDirectory)).isDirectory(); } catch (error) { if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error; }
    const runtime = useAppRuntime ? await createOCodeServer({ appDirectory }) : await createDevServer({ root, host: parsed.options.host ?? '127.0.0.1', port: parsed.options.port ?? 3000 });
    const { server, host, port } = useAppRuntime ? { ...runtime, host: parsed.options.host ?? '127.0.0.1', port: parsed.options.port ?? 3000 } : runtime;
    const address = await listen(server, host, port);
    io.log(`OCodejs ${useAppRuntime ? 'app' : 'static'} dev server ready at http://${address.host}:${address.port}`);
    const shutdown = () => server.close();
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
    return { code: 0, server, address };
  } catch (error) {
    io.error(`OCodejs: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry && fileURLToPath(import.meta.url) === entry) {
  const result = await run();
  if (typeof result === 'number') process.exitCode = result;
}