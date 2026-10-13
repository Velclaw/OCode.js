import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { resolveProjectRoot, buildProject } from '../src/project.js';
test('resolves project root and builds public assets',async t=>{const root=await mkdtemp(path.join(os.tmpdir(),'ocode-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'public'));await writeFile(path.join(root,'public','index.html'),'<h1>ok</h1>');assert.equal(await resolveProjectRoot(root,'.'),root);const result=await buildProject(root,{now:()=>new Date('2026-01-01T00:00:00Z')});assert.deepEqual(result.files,['index.html']);});
