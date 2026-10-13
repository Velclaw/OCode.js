import test from "node:test";
import assert from "node:assert/strict";
import {claimNextTask,createTurn,finishTask,getTask,listMessages} from "../lib/store";

test("in-memory task lifecycle persists result and assistant message",{skip:Boolean(process.env.DATABASE_URL)},async()=>{
  const input="store-test-"+crypto.randomUUID();
  const task=await createTurn(input,"echo");
  assert.equal(task.status,"queued");
  assert.equal((await getTask(task.id))?.status,"queued");

  const claimed=await claimNextTask();
  assert.ok(claimed);
  assert.equal(claimed.id,task.id);
  assert.equal(claimed.status,"running");

  await finishTask(task.id,"result-"+input);
  const completed=await getTask(task.id);
  assert.equal(completed?.status,"completed");
  assert.equal(completed?.result,"result-"+input);

  const messages=await listMessages(200);
  assert.ok(messages.some(m=>m.role==="user"&&m.content===input));
  assert.ok(messages.some(m=>m.role==="assistant"&&m.taskId===task.id&&m.content==="result-"+input));
});
