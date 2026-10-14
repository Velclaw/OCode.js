import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workflow = readFileSync(new URL("../.github/workflows/install-skills-pack.yml", import.meta.url), "utf8");
const steps = workflow.split(/^      - /m).slice(1);
const installStep = steps[2];
const publishStep = steps[3];

// Read this workflow's scalar and literal run blocks without adding a YAML dependency.
function runCommand(step) {
  assert.equal(typeof step, "string", "The workflow step must exist");
  const match = /^        run: (.+)$/m.exec(step);
  assert.ok(match, "The workflow step must contain a run command");
  if (match[1] !== "|") return match[1];
  return step.slice(match.index + match[0].length).split("\n").slice(1).map((line) => {
    if (line.trim() === "") return "";
    assert.ok(line.startsWith("          "), "Run block indentation must be valid");
    return line.slice(10);
  }).join("\n");
}

const prepareCalls = [
  ["git", "config", "user.name", "github-actions[bot]"],
  ["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
  ["git", "add", "-A"],
  ["git", "diff", "--cached", "--quiet"]
];
const publishCalls = [
  ...prepareCalls,
  ["git", "commit", "-m", "chore: install skills.sh pack"],
  ["git", "push", "origin", "HEAD:chore/install-skills-sh-pack"]
];
const installCall = [
  "npx", "--yes", "skills", "add", "https://skills.sh/p/c7cuCCCdiiFNVj2S", "--all", "--yes", "--copy"
];

function executeStep(t, step, { diffStatus = 0, failure = null } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "ocode-skills-workflow-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, "calls.jsonl");
  // Only these mocks are on PATH. No npm installation, Git commit, or push is performed.
  const mock = `#!${process.execPath}
const { appendFileSync } = require("node:fs");
const { basename } = require("node:path");
const call = [basename(process.argv[1]), ...process.argv.slice(2)];
appendFileSync(process.env.WORKFLOW_TEST_LOG, JSON.stringify(call) + "\\n");
const failure = JSON.parse(process.env.WORKFLOW_TEST_FAILURE);
if (failure && JSON.stringify(call) === JSON.stringify(failure.call)) {
  console.error("Simulated command failure");
  process.exit(failure.status);
}
if (JSON.stringify(call) === JSON.stringify(["git", "diff", "--cached", "--quiet"])) {
  process.exit(Number(process.env.WORKFLOW_TEST_DIFF_STATUS));
}
`;
  for (const name of ["git", "npx"]) {
    writeFileSync(join(directory, name), mock, { mode: 0o755 });
  }
  writeFileSync(log, "");
  const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", runCommand(step)], {
    cwd: directory,
    encoding: "utf8",
    timeout: 5000,
    env: {
      HOME: directory,
      PATH: directory,
      WORKFLOW_TEST_LOG: log,
      WORKFLOW_TEST_DIFF_STATUS: String(diffStatus),
      WORKFLOW_TEST_FAILURE: JSON.stringify(failure)
    }
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, "The workflow command must finish within its timeout");
  const lines = readFileSync(log, "utf8").trim();
  return { ...result, calls: lines ? lines.split("\n").map((line) => JSON.parse(line)) : [] };
}

test("skills pack workflow requires manual dispatch and grants repository content writes", () => {
  const trigger = /^on:\n([\s\S]*?)(?=^\S)/m.exec(workflow);
  assert.ok(trigger, "A workflow trigger must be declared");
  assert.match(trigger[1].trim(), /^workflow_dispatch:$/);

  const permissions = /^permissions:\n([\s\S]*?)(?=^\S)/m.exec(workflow);
  assert.ok(permissions, "Workflow permissions must be explicit");
  assert.match(permissions[1].trim(), /^contents: write$/);
  assert.match(workflow, /^    runs-on: ubuntu-latest$/m);
});

test("skills pack workflow checks out the isolated branch and sets up Node before installing", () => {
  assert.equal(steps.length, 4);
  assert.match(steps[0], /^        uses: actions\/checkout@v4$/m);
  assert.match(steps[0], /^          ref: chore\/install-skills-sh-pack$/m);
  assert.match(steps[0], /^          persist-credentials: true$/m);
  assert.match(steps[1], /^        uses: actions\/setup-node@v4$/m);
  assert.match(steps[1], /^          node-version: 22$/m);
  assert.match(installStep, /^        run: npx /m);
  assert.match(publishStep, /^        shell: bash$/m);
  assert.doesNotMatch(workflow, /^\s*(?:continue-on-error|if):/m);
});

test("skills installer uses the selected pack and non-interactive copy mode for all skills", (t) => {
  const result = executeStep(t, installStep);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [installCall]);
});

test("skills installer propagates CLI failures", (t) => {
  const result = executeStep(t, installStep, { failure: { call: installCall, status: 23 } });
  assert.equal(result.status, 23);
  assert.deepEqual(result.calls, [installCall]);
  assert.match(result.stderr, /Simulated command failure/);
});

test("skills publication exits successfully without committing or pushing when nothing changed", (t) => {
  const result = executeStep(t, publishStep);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, prepareCalls);
  assert.match(result.stdout, /No changes produced by the skills CLI\./);
});

test("skills publication stages all changes, checks the index, and publishes only to its branch", (t) => {
  // git diff --quiet returns 1 for changes; Bash errexit must allow this conditional.
  const result = executeStep(t, publishStep, { diffStatus: 1 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, publishCalls);
  assert.doesNotMatch(result.stdout, /No changes produced/);
});

for (const [index, description] of [
  [0, "configuring the author name"],
  [1, "configuring the author email"],
  [2, "staging generated files"],
  [4, "creating the commit"],
  [5, "pushing the commit"]
]) {
  test(`skills publication stops and reports failure when ${description} fails`, (t) => {
    const result = executeStep(t, publishStep, {
      diffStatus: 1,
      failure: { call: publishCalls[index], status: 23 }
    });
    assert.equal(result.status, 23);
    assert.deepEqual(result.calls, publishCalls.slice(0, index + 1));
    assert.match(result.stderr, /Simulated command failure/);
    assert.doesNotMatch(result.stdout, /No changes produced/);
  });
}
