import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";

const workflow = readFileSync(new URL("../.github/workflows/install-skills-pack.yml", import.meta.url), "utf8");
const branch = "chore/install-skills-sh-pack";
const steps = workflow.split(/^ {6}- /m).slice(1);
const runSteps = steps.filter((step) => /^ {8}run:/m.test(step));

// Read the inline and literal run values used by this workflow, preserving shell quoting.
// Executing the checked-in commands keeps these tests sensitive to workflow changes.
function runScript(step) {
  assert.ok(step, "The workflow must contain the expected run step");
  const lines = step.split("\n");
  const index = lines.findIndex((line) => line.startsWith("        run: "));
  assert.notEqual(index, -1, "The step must declare a run command");
  const value = lines[index].slice("        run: ".length);
  if (value !== "|") return value;

  const script = [];
  for (const line of lines.slice(index + 1)) {
    if (line.trim() && !line.startsWith("          ")) break;
    script.push(line.slice(10));
  }
  return script.join("\n");
}

const configureAndStage = [
  ["git", "config", "user.name", "github-actions[bot]"],
  ["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
  ["git", "add", "-A"],
  ["git", "diff", "--cached", "--quiet"]
];
const publication = [
  ...configureAndStage,
  ["git", "commit", "-m", "chore: install skills.sh pack"],
  ["git", "push", "origin", `HEAD:${branch}`]
];

function mockRunner(t, { diffStatus = 0, installStatus = 0, failGitArgs = [] } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "ocode-skills-workflow-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, "bin");
  const log = join(directory, "commands.jsonl");
  mkdirSync(bin);
  writeFileSync(log, "");

  // Both external commands are replaced; no installation, commit, or push takes place.
  for (const command of ["git", "npx"]) {
    writeFileSync(join(bin, command), `#!${process.execPath}
const fs = require("node:fs");
const command = ${JSON.stringify(command)};
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_COMMAND_LOG, JSON.stringify([command, ...args]) + "\\n");
if (command === "npx") process.exit(Number(process.env.MOCK_INSTALL_STATUS));
if (JSON.stringify(args) === process.env.MOCK_FAIL_GIT_ARGS) process.exit(23);
if (args[0] === "diff") process.exit(Number(process.env.MOCK_DIFF_STATUS));
if (["config", "add", "commit", "push"].includes(args[0])) process.exit(0);
process.exit(99);
`, { mode: 0o755 });
  }

  return (script) => {
    // GitHub Actions invokes explicit Bash steps with -e and -o pipefail.
    const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script], {
      cwd: directory,
      encoding: "utf8",
      timeout: 5000,
      env: {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        MOCK_COMMAND_LOG: log,
        MOCK_DIFF_STATUS: String(diffStatus),
        MOCK_INSTALL_STATUS: String(installStatus),
        MOCK_FAIL_GIT_ARGS: JSON.stringify(failGitArgs)
      }
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, "The workflow step must finish without being killed");
    const calls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    return { ...result, calls };
  };
}

test("skills workflow runs only on manual dispatch and grants repository write access", () => {
  const triggers = workflow.match(/^on:\n((?:[ \t].*\n|\n)*)/m);
  assert.ok(triggers, "The workflow must declare its trigger");
  assert.equal(triggers[1].trim(), "workflow_dispatch:");
  const permissions = workflow.match(/^permissions:\n((?:[ \t].*\n|\n)*)/m);
  assert.ok(permissions, "The workflow must declare its token permissions");
  assert.equal(permissions[1].trim(), "contents: write");
});

test("skills workflow checks out its designated branch and prepares Node before installing", () => {
  assert.match(workflow, /^ {2}install-pack:\n {4}runs-on: ubuntu-latest$/m);
  assert.equal(steps.length, 4);
  assert.match(steps[0], /^ {8}uses: actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4\.2\.2$/m);
  assert.match(steps[0], new RegExp(`^ {10}ref: ${branch}$`, "m"));
  assert.match(steps[0], /^ {10}persist-credentials: true$/m);
  assert.match(steps[1], /^ {8}uses: actions\/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af # v4\.1\.0$/m);
  assert.match(steps[1], /^ {10}node-version: 22$/m);
  assert.equal(runSteps.length, 2);
  assert.equal(runSteps[0], steps[2]);
  assert.equal(runSteps[1], steps[3]);
  assert.match(runSteps[1], /^ {8}shell: bash$/m);
});

test("skills installer copies the entire designated pack without interactive prompts", (t) => {
  const result = mockRunner(t)(runScript(runSteps[0]));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [[
    "npx", "--yes", "skills", "add", "https://skills.sh/p/c7cuCCCdiiFNVj2S", "--all", "--yes", "--copy"
  ]]);
});

test("skills installer propagates CLI failure", (t) => {
  const result = mockRunner(t, { installStatus: 17 })(runScript(runSteps[0]));
  assert.equal(result.status, 17);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0][0], "npx");
});

test("skills publication succeeds without committing or pushing when the index is unchanged", (t) => {
  const result = mockRunner(t)(runScript(runSteps[1]));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, configureAndStage);
  assert.match(result.stdout, /No changes produced by the skills CLI\./);
});

test("skills publication stages all changes and pushes only HEAD to the designated branch", (t) => {
  const result = mockRunner(t, { diffStatus: 1 })(runScript(runSteps[1]));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, publication);
  assert.doesNotMatch(result.stdout, /No changes produced/);
});

test("skills publication stops at a failed Git command and propagates its failure", async (t) => {
  for (const [failedIndex, call] of publication.entries()) {
    if (call[1] === "diff") continue;
    await t.test(`${call[1]} ${call[2]} failure`, (t) => {
      const result = mockRunner(t, { diffStatus: 1, failGitArgs: call.slice(1) })(runScript(runSteps[1]));
      assert.equal(result.status, 23);
      assert.deepEqual(result.calls, publication.slice(0, failedIndex + 1));
    });
  }
});
