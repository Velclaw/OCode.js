import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { win32 } from "node:path";
import { runInNewContext } from "node:vm";

const actionNames = {
  codeql: ["actions/checkout", "github/codeql-action/init", "github/codeql-action/analyze"],
  hadolint: ["actions/checkout", "hadolint/hadolint-action", "github/codeql-action/upload-sarif"],
  powershell: ["actions/checkout", "microsoft/psscriptanalyzer-action", "github/codeql-action/upload-sarif"],
  stackhawk: ["actions/checkout", "stackhawk/hawkscan-action"],
  trivy: ["actions/checkout", "aquasecurity/trivy-action", "github/codeql-action/upload-sarif"]
};

/**
 * Read step scalar accessors from a single-job workflow, allowing both YAML
 * sequence indentation styles used by the security workflows.
 */
function workflowSteps(name) {
  const source = readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");
  const section = source.match(/^ +steps:\r?\n([\s\S]*)$/m);
  assert.ok(section, `${name} must declare steps`);
  const firstStep = section[1].match(/^( +)- /m);
  assert.ok(firstStep, `${name} must contain a step`);
  const indentation = firstStep[1].length;

  return section[1].split(new RegExp(`^ {${indentation}}- `, "m")).slice(1).map((text) => ({
    value(key, input = false) {
      const prefix = input ? ` {${indentation + 4}}` : `(?: {${indentation + 2}})?`;
      if (input) assert.ok(this.has("with"), `${name}: action inputs must be under with:`);
      const matches = [...text.matchAll(new RegExp(`^${prefix}${key}: *([^\\r\\n]*)`, "gm"))];
      assert.equal(matches.length, 1, `${name}: step must declare exactly one ${key}`);
      const scalar = matches[0][1].replace(/\s+#.*$/, "").trim();
      if ((scalar.startsWith('"') && scalar.endsWith('"')) || (scalar.startsWith("'") && scalar.endsWith("'"))) {
        return scalar.slice(1, -1);
      }
      return scalar;
    },
    has(key) {
      return new RegExp(`^(?: {${indentation + 2}})?${key}:`, "m").test(text);
    }
  }));
}

/**
 * Return the unique step using the given action, asserting exactly one match.
 */
function actionStep(steps, action) {
  const matches = steps.filter((step) => step.has("uses") && step.value("uses").startsWith(`${action}@`));
  assert.equal(matches.length, 1, `Expected exactly one ${action} step`);
  return matches[0];
}

/**
 * Return the unique step with the given name, asserting exactly one match.
 */
function namedStep(steps, name) {
  const matches = steps.filter((step) => step.has("name") && step.value("name") === name);
  assert.equal(matches.length, 1, `Expected exactly one ${name} step`);
  return matches[0];
}

/**
 * Evaluate a checked-in condition against a synthetic API key and file list.
 * Only string comparisons and boolean operators shared by Actions and JS are
 * supported; this is a unit fixture, not an Actions runner emulator.
 */
function evaluateCondition(step, { apiKey = "", files = [] } = {}) {
  const condition = step.value("if").match(/^\$\{\{\s*(.*?)\s*\}\}$/);
  assert.ok(condition, "Expected an explicit Actions expression");
  const expression = condition[1];
  const predicate = "(?:(?:secrets|env)\\.HAWK_API_KEY|hashFiles\\('[^']+'\\)) != ''";
  assert.match(expression, new RegExp(`^${predicate}(?: (?:&&|\\|\\|) ${predicate})*$`),
    "Update the condition fixture when the workflow uses another expression feature");
  return runInNewContext(expression, {
    secrets: { HAWK_API_KEY: apiKey },
    env: { HAWK_API_KEY: apiKey },
    hashFiles: (path) => files.includes(path) ? "0123456789abcdef".repeat(4) : ""
  }, { timeout: 100 });
}

for (const [name, expectedActions] of Object.entries(actionNames)) {
  test(`${name} retains its security actions in order and pins every action to a full commit SHA`, () => {
    const actions = workflowSteps(name).filter((step) => step.has("uses")).map((step) => step.value("uses"));
    assert.deepEqual(actions.map((action) => action.split("@")[0]), expectedActions);
    for (const action of actions) {
      assert.match(action, /^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/,
        `${name}: reject mutable tags, branches, abbreviated SHAs, and malformed pins`);
      assert.notEqual(action.split("@")[1], "0".repeat(40), "An all-zero SHA is not an action revision");
    }
  });
}

test("CodeQL initialization and analysis use the same pinned release and retain matrix inputs", () => {
  const steps = workflowSteps("codeql");
  const init = actionStep(steps, "github/codeql-action/init");
  const analyze = actionStep(steps, "github/codeql-action/analyze");
  assert.equal(init.value("uses").split("@")[1], analyze.value("uses").split("@")[1]);
  assert.equal(init.value("languages", true), "${{ matrix.language }}");
  assert.equal(init.value("build-mode", true), "${{ matrix.build-mode }}");
  assert.equal(analyze.value("category", true), "/language:${{matrix.language}}");
});

for (const [name, scanner, outputKey] of [
  ["hadolint", "hadolint/hadolint-action", "output-file"],
  ["powershell", "microsoft/psscriptanalyzer-action", "output"],
  ["trivy", "aquasecurity/trivy-action", "output"]
]) {
  test(`${name} still uploads the SARIF file produced by its scanner after pinning`, () => {
    const steps = workflowSteps(name);
    const scan = actionStep(steps, scanner);
    const upload = actionStep(steps, "github/codeql-action/upload-sarif");
    assert.ok(steps.indexOf(scan) < steps.indexOf(upload), "Generate SARIF before uploading it");
    const output = scan.value(outputKey, true);
    const input = upload.value("sarif_file", true);
    assert.equal(input, output);
    assert.match(input, /\.sarif$/);
  });
}

test("the changed PowerShell path still targets the repository root for recursive analysis", () => {
  const scan = actionStep(workflowSteps("powershell"), "microsoft/psscriptanalyzer-action");
  assert.equal(win32.resolve("C:\\checkout", scan.value("path", true)), "C:\\checkout");
  assert.equal(scan.value("recurse", true), "true");
});

for (const hasKey of [false, true]) {
  for (const hasConfig of [false, true]) {
    for (const hasService of [false, true]) {
      test(`StackHawk prerequisites: key=${hasKey}, config=${hasConfig}, service=${hasService}`, () => {
        const steps = workflowSteps("stackhawk");
        const start = namedStep(steps, "Start your service");
        const scan = actionStep(steps, "stackhawk/hawkscan-action");
        const fixture = {
          apiKey: hasKey ? "synthetic-api-key" : "",
          files: [...(hasConfig ? ["stackhawk.yml"] : []), ...(hasService ? ["your-service.sh"] : [])]
        };
        assert.equal(evaluateCondition(start, fixture), hasService, "Start the service only when its script exists");
        assert.equal(evaluateCondition(scan, fixture), hasKey && hasConfig && hasService,
          "Scan only when all three prerequisites exist, including on PRs without secrets");
      });
    }
  }
}

test("StackHawk ignores similarly named files and its workflow file when the root prerequisites are missing", () => {
  const steps = workflowSteps("stackhawk");
  const fixture = {
    apiKey: "synthetic-api-key",
    files: [".github/workflows/stackhawk.yml", "config/stackhawk.yml", "scripts/your-service.sh", "your-service.sh.bak"]
  };
  assert.equal(evaluateCondition(namedStep(steps, "Start your service"), fixture), false);
  assert.equal(evaluateCondition(actionStep(steps, "stackhawk/hawkscan-action"), fixture), false);
});

// Isolate each missing prerequisite: a combined fixture with both files absent
// could still pass if either hashFiles check matched the wrong path.
for (const config of [".github/workflows/stackhawk.yml", "config/stackhawk.yml", "stackhawk.yml.bak"]) {
  test(`StackHawk skips scanning when only ${config} exists alongside the root service`, () => {
    const steps = workflowSteps("stackhawk");
    const fixture = { apiKey: "synthetic-api-key", files: ["your-service.sh", config] };
    assert.equal(evaluateCondition(namedStep(steps, "Start your service"), fixture), true);
    assert.equal(evaluateCondition(actionStep(steps, "stackhawk/hawkscan-action"), fixture), false);
  });
}

for (const script of ["scripts/your-service.sh", "your-service.sh.bak"]) {
  test(`StackHawk skips startup and scanning when only ${script} exists alongside the root config`, () => {
    const steps = workflowSteps("stackhawk");
    const fixture = { apiKey: "synthetic-api-key", files: ["stackhawk.yml", script] };
    assert.equal(evaluateCondition(namedStep(steps, "Start your service"), fixture), false);
    assert.equal(evaluateCondition(actionStep(steps, "stackhawk/hawkscan-action"), fixture), false);
  });
}

test("StackHawk treats a non-empty API key as a string rather than a boolean", () => {
  const scan = actionStep(workflowSteps("stackhawk"), "stackhawk/hawkscan-action");
  for (const apiKey of ["0", "false", "synthetic'key\"with$characters"]) {
    assert.equal(evaluateCondition(scan, { apiKey, files: ["stackhawk.yml", "your-service.sh"] }), true);
  }
});

test("StackHawk checks out files before evaluating prerequisites and starts its service before scanning", () => {
  const steps = workflowSteps("stackhawk");
  const checkout = actionStep(steps, "actions/checkout");
  const start = namedStep(steps, "Start your service");
  const scan = actionStep(steps, "stackhawk/hawkscan-action");
  assert.ok(steps.indexOf(checkout) < steps.indexOf(start), "hashFiles needs the checked-out repository");
  assert.ok(steps.indexOf(start) < steps.indexOf(scan), "Start the service before scanning it");
  assert.equal(start.value("run"), "./your-service.sh &");
  assert.equal(scan.value("continue-on-error"), "true", "Optional scan failures must remain non-blocking");
});

test("StackHawk step conditions use contexts available in GitHub Actions", () => {
  // GitHub excludes secrets from jobs.<job_id>.steps.if. Bind the key to a
  // job-level environment variable before using it in a condition instead.
  // https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsif
  for (const step of workflowSteps("stackhawk").filter((step) => step.has("if"))) {
    assert.doesNotMatch(step.value("if"), /\bsecrets\s*(?:\.|\[)/,
      "GitHub Actions rejects secrets in step if expressions; reference a job-level env variable instead");
  }
});
