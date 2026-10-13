import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
export async function resolveProjectRoot(cwd, rootOption = '.') {
  const root = path.resolve(cwd, rootOption);
  let info;
  try { info = await stat(root); } catch (cause) {
    if (cause?.code === 'ENOENT' || cause?.code === 'ENOTDIR') throw new Error(`Project root does not exist: ${root}`);
    throw cause;
  }
  if (!info.isDirectory()) throw new Error(`Project root is not a directory: ${root}`);
  return root;
}
async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true }), files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported in public assets: ${relative}`);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}
export async function buildProject(root, { now = () => new Date() } = {}) {
  const publicDir = path.join(root, 'public');
  let info;
  try { info = await stat(publicDir); } catch (cause) {
    if (cause?.code === 'ENOENT') throw new Error(`Missing public/ directory in ${root}. Create public/ and add at least an index.html file.`);
    throw cause;
  }
  if (!info.isDirectory()) throw new Error(`Expected public/ to be a directory in ${root}.`);
  const files = await listFiles(publicDir);
  if (!files.includes('index.html')) throw new Error(`Missing public/index.html in ${root}. Add an index.html entry point.`);
  const outputDir = path.join(root, 'dist');
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(path.join(outputDir, 'public'), { recursive: true });
  await cp(publicDir, path.join(outputDir, 'public'), { recursive: true, dereference: false });
  const manifest = { framework: 'ocodejs', version: '0.1.0', buildTime: now().toISOString(), output: 'public', files };
  await writeFile(path.join(outputDir, 'ocode-build.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { outputDir, files, manifest };
}
export async function readProjectIndex(root) { return readFile(path.join(root, 'public', 'index.html'), 'utf8'); }