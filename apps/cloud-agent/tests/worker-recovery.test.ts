import test from "node:test";
import assert from "node:assert/strict";
import { claimNextTask, createTurn, finishTask, getTask, requeueStaleTasks, touchTask } from "../lib/store";

test("requeues stale running tasks after a worker interruption", { skip: Boolean(process.env.DATABASE_URL) }, async () => {
  const task = await createTurn("recovery-test-" + crypto.randomUUID(), "echo");
  const claimed = await claimNextTask();
  assert.ok(claimed);
  assert.equal(claimed.id, task.id);

  const staleNow = Date.parse(claimed.updatedAt) + 300_001;
  assert.equal(await requeueStaleTasks(5 * 60 * 1000, staleNow), 1);
  assert.equal((await getTask(task.id))?.status, "queued");

  const reclaimed = await claimNextTask();
  assert.equal(reclaimed?.id, task.id);
  await finishTask(task.id, "recovered");
});

test("heartbeat refreshes a running task lease", { skip: Boolean(process.env.DATABASE_URL) }, async () => {
  const task = await createTurn("heartbeat-test-" + crypto.randomUUID(), "echo");
  const claimed = await claimNextTask();
  assert.ok(claimed);
  assert.equal(claimed.id, task.id);

  const heartbeatAt = Date.parse(claimed.updatedAt) + 60_000;
  await touchTask(task.id, heartbeatAt);
  assert.equal((await getTask(task.id))?.updatedAt, new Date(heartbeatAt).toISOString());
  assert.equal(await requeueStaleTasks(5 * 60 * 1000, heartbeatAt + 60_000), 0);
  await finishTask(task.id, "heartbeat-ok");
});
