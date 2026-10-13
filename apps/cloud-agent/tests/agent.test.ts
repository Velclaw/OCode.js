import test from "node:test";import assert from "node:assert/strict";import {runSkill,selectSkill} from "../lib/agent";
test("routes only to allowlisted skills",()=>{assert.equal(selectSkill("/status"),"status");assert.equal(selectSkill("system status"),"status");assert.equal(selectSkill("/echo hello"),"echo");assert.equal(selectSkill("build an app"),"draft-plan");});
test("echo returns text without executing it",async()=>{assert.equal(await runSkill("echo","/echo hello"),"hello");assert.match(await runSkill("echo","/echo rm -rf /"),/rm -rf \/$/);});
test("plan requires approval for production changes",async()=>{const result=await runSkill("draft-plan","deploy production");assert.match(result,/phê duyệt/i);assert.match(result,/chưa gọi LLM/i);});
