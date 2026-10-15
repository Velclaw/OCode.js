import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, win32 } from "node:path";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";

const actionNames = {
  codeql: ["actions/checkout", "github/codeql-action/init", "github/codeql-action/analyze"],
  hadolint: ["actions/checkout", "hadolint/hadolint-action", "github/codeql-action/upload-sarif"],
  powershell: ["actions/checkout", "microsoft/psscriptanalyzer-action", "github/codeql-action/upload-sarif"],
  stackhawk: ["actions/checkout", "stackhawk/hawkscan-action"],
  trivy: ["actions/checkout", "aquasecurity/trivy-action", "github/codeql-action/upload-sarif"],
  "black-duck-security-scan-ci": ["actions/checkout", "blackduck-inc/black-duck-security-scan"],
  crunch42: ["actions/checkout", "42Crunch/api-security-audit-action"],
  "jscrambler-code-integrity": ["actions/checkout", "actions/setup-node", "jscrambler/code-integrity-actions/protect"],
  "mayhem-for-api": ["actions/checkout", "ForAllSecure/mapi-action", "github/codeql-action/upload-sarif"],
  msvc: ["actions/checkout", "microsoft/msvc-code-analysis-action", "github/codeql-action/upload-sarif"],
  ossar: ["actions/checkout", "github/ossar-action", "github/codeql-action/upload-sarif"],
  "policy-validator-tf": ["actions/checkout", "aws-actions/configure-aws-credentials",
    ...Array(4).fill("aws-actions/terraform-aws-iam-policy-validator")],
  sonarqube: ["SonarSource/sonarqube-scan-action"],
  zscan: ["actions/checkout", "zimperium/zscanmarketplace", "github/codeql-action/upload-sarif"]
};

function workflowSource(name) {
  return readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");
}

// These workflows each have one job. Follow the existing workflow tests'
// scalar extraction convention, allowing both YAML sequence indentation styles.
function workflowSteps(name) {
  const source = workflowSource(name);
  const section = source.match(/^ +steps:\r?\n([\s\S]*)$/m);
  assert.ok(section, `${name} must declare steps`);
  const firstStep = section[1].match(/^( +)- /m);
  assert.ok(firstStep, `${name} must contain a step`);
  const indentation = firstStep[1].length;

  return section[1].split(new RegExp(`^ {${indentation}}- `, "m")).slice(1).map((text) => ({
    value(key, input = false) {
      const block = input === true ? "with" : input;
      const prefix = block ? ` {${indentation + 4}}` : `(?: {${indentation + 2}})?`;
      if (block) assert.ok(this.has(block), `${name}: ${key} must be under ${block}:`);
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
    },
    script() {
      const value = this.value("run");
      if (value !== "|") return value;
      const lines = text.split(/\r?\n/);
      const index = lines.findIndex((line) => new RegExp(`^(?: {${indentation + 2}})?run:`).test(line));
      const script = [];
      for (const line of lines.slice(index + 1)) {
        if (line.trim() && !line.startsWith(" ".repeat(indentation + 4))) break;
        script.push(line.slice(indentation + 4));
      }
      assert.ok(script.length, `${name}: literal run block must not be empty`);
      return script.join("\n");
    }
  }));
}

function actionStep(steps, action) {
  const matches = steps.filter((step) => step.has("uses") && step.value("uses").startsWith(`${action}@`));
  assert.equal(matches.length, 1, `Expected exactly one ${action} step`);
  return matches[0];
}

function namedStep(steps, name) {
  const matches = steps.filter((step) => step.has("name") && step.value("name") === name);
  assert.equal(matches.length, 1, `Expected exactly one ${name} step`);
  return matches[0];
}

// Evaluate the actual checked-in conditions, rather than copying their logic.
// Only the string comparisons and boolean operators shared by Actions and JS
// are supported here. This is a unit fixture, not an Actions runner emulator.
function evaluateCondition(step, { apiKey = "", files = [], secrets = {}, env = {}, vars = {}, outputs = {} } = {}) {
  const condition = step.value("if").match(/^\$\{\{\s*(.*?)\s*\}\}$/);
  assert.ok(condition, "Expected an explicit Actions expression");
  // Replace context references before evaluation, including hyphenated step
  // IDs which GitHub accepts but JavaScript dot notation cannot represent.
  const expression = condition[1]
    .replace(/\b(secrets|env|vars)\.([\w-]+)/g, (_, context, key) => `lookup('${context}', '${key}')`)
    .replace(/\bsteps\.([\w-]+)\.outputs\.([\w-]+)/g, (_, id, key) => `output('${id}', '${key}')`);
  const operand = "(?:lookup\\('(?:secrets|env|vars)', '[\\w-]+'\\)|output\\('[\\w-]+', '[\\w-]+'\\)|hashFiles\\('[^']+'\\))";
  const predicate = `${operand} (?:!=|==) '(?:true|)'`;
  assert.match(expression, new RegExp(`^${predicate}(?: (?:&&|\\|\\|) ${predicate})*$`),
    "Update the condition fixture when the workflow uses another expression feature");
  return runInNewContext(expression, {
    lookup: (context, key) => ({ secrets: { HAWK_API_KEY: apiKey, ...secrets },
      env: { HAWK_API_KEY: apiKey, ...env }, vars })[context][key] ?? "",
    output: (id, key) => outputs[id]?.[key] ?? "",
    hashFiles: (path) => files.includes(path) ? "0123456789abcdef".repeat(4) : ""
  }, { timeout: 100 });
}

for (const [name, expectedActions] of Object.entries(actionNames)) {
  test(`${name} retains its security actions in order and pins changed references to full commit SHAs`, () => {
    const actions = workflowSteps(name).filter((step) => step.has("uses")).map((step) => step.value("uses"));
    assert.deepEqual(actions.map((action) => action.split("@")[0]), expectedActions);
    for (const action of actions) {
      // OSSAR's scan action was already @v1 and is outside this PR's pin changes.
      if (name === "ossar" && action === "github/ossar-action@v1") continue;
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

const configurationChecks = {
  "black-duck-security-scan-ci": {
    check: "Check Black Duck configuration", scan: "Black Duck SCA scan",
    bindings: { BLACKDUCK_URL: "vars.BLACKDUCKSCA_URL", BLACKDUCK_TOKEN: "secrets.BLACKDUCKSCA_TOKEN" }
  },
  sonarqube: {
    check: "Check SonarQube configuration", scan: "Analyze with SonarQube",
    bindings: { SONAR_TOKEN: "secrets.SONAR_TOKEN", SONAR_HOST_URL: "secrets.SONAR_HOST_URL",
      SONAR_PROJECT_KEY: "vars.SONAR_PROJECT_KEY" }
  },
  crunch42: {
    check: "Check 42Crunch configuration", scan: "42Crunch REST API Static Security Testing",
    bindings: { API_TOKEN: "secrets.API_TOKEN" }, file: "specs/openapi.yaml"
  },
  "mayhem-for-api": {
    check: "Check Mayhem configuration", scan: "Mayhem for API",
    bindings: { MAYHEM_TOKEN: "secrets.MAYHEM_TOKEN" }, file: "run_your_api.sh"
  },
  zscan: {
    check: "Check zScan configuration", scan: "Run Zimperium zScan",
    bindings: { ZSCAN_SECRET: "secrets.ZSCAN_CLIENT_SECRET" }, file: "app/build/app-release.apk"
  }
};

// Run only the prerequisite shell snippets in isolated synthetic directories.
// No service startup, build, scanner, network call, or real secret is involved.
function runConfiguration(t, name, { env = {}, files = [], directories = [] } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "ocode-security-workflow-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const path of directories) mkdirSync(join(directory, path), { recursive: true });
  for (const path of files) {
    const file = join(directory, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "synthetic fixture\n");
  }
  const output = join(directory, "github-output");
  writeFileSync(output, "");
  const check = namedStep(workflowSteps(name), configurationChecks[name].check);
  assert.equal(check.value("shell"), "bash");
  const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", check.script()], {
    cwd: directory, encoding: "utf8", timeout: 5000,
    env: { PATH: process.env.PATH, ...env, GITHUB_OUTPUT: output }
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, "The prerequisite check must finish without being killed");
  assert.equal(result.status, 0, result.stderr);
  const configured = readFileSync(output, "utf8");
  assert.match(configured, /^configured=(?:true|false)\n$/, "Write exactly one valid Actions output");
  const enabled = configured === "configured=true\n";
  if (enabled) assert.doesNotMatch(result.stdout, /Skipping/);
  else assert.match(result.stdout, /Skipping/);
  for (const value of Object.values(env).filter(Boolean)) {
    assert.ok(!result.stdout.includes(value) && !result.stderr.includes(value) && !configured.includes(value),
      "Prerequisite checks must not print credentials or configuration values");
  }
  return enabled;
}

for (const [name, { check, scan, bindings, file }] of Object.entries(configurationChecks)) {
  test(`${name} binds repository configuration and consumes its check output before scanning`, () => {
    const steps = workflowSteps(name);
    const prerequisite = namedStep(steps, check);
    const scanner = namedStep(steps, scan);
    assert.equal(prerequisite.value("id"), "config");
    assert.ok(steps.indexOf(prerequisite) < steps.indexOf(scanner));
    for (const [key, context] of Object.entries(bindings)) {
      assert.equal(prerequisite.value(key, "env"), `\${{ ${context} }}`);
    }
    for (const configured of [undefined, "", "false", "true", "TRUE", "1"]) {
      assert.equal(evaluateCondition(scanner, { outputs: { config: { configured } } }), configured === "true");
    }
  });

  const keys = Object.keys(bindings);
  const prerequisites = [...keys, ...(file ? [file] : [])];
  for (let mask = 0; mask < 2 ** prerequisites.length; mask++) {
    const present = prerequisites.filter((_, index) => mask & (1 << index));
    test(`${name} prerequisites: ${present.join(", ") || "none"}`, (t) => {
      const env = Object.fromEntries(keys.map((key) => [key, present.includes(key) ? `synthetic-${key}-value` : ""]));
      const files = file && present.includes(file) ? [file] : [];
      assert.equal(runConfiguration(t, name, { env, files }), present.length === prerequisites.length);
    });
  }

  test(`${name} treats false-like and shell-special credential values as literal non-empty strings`, (t) => {
    for (const value of ["0", "false", "synthetic'key\"$()\\; value"]) {
      const env = Object.fromEntries(keys.map((key) => [key, value]));
      assert.equal(runConfiguration(t, name, { env, files: file ? [file] : [] }), true);
    }
  });
}

for (const file of ["openapi.yaml", "openapi.yml", "openapi.json", "swagger.yaml", "swagger.json",
  "nested specs/OpenAPI-v3.YML", "nested/swagger-v2.JSON"]) {
  test(`42Crunch discovers a regular API specification at ${file}`, (t) => {
    assert.equal(runConfiguration(t, "crunch42", { env: { API_TOKEN: "synthetic-token" }, files: [file] }), true);
  });
}

test("42Crunch accepts Swagger specs using the .yml extension", (t) => {
  assert.equal(runConfiguration(t, "crunch42", {
    env: { API_TOKEN: "synthetic-token" }, files: ["specs/swagger.yml"]
  }), true, "Swagger YAML specs should support both standard YAML extensions");
});

for (const [name, env, files, directories] of [
  ["crunch42", { API_TOKEN: "synthetic-token" }, ["openapi.yaml.bak", "docs/swagger.md", "specs/api.yaml"], ["openapi.yml"]],
  ["mayhem-for-api", { MAYHEM_TOKEN: "synthetic-token" }, ["scripts/run_your_api.sh", "run_your_api.sh.bak"], ["run_your_api.sh"]],
  ["zscan", { ZSCAN_SECRET: "synthetic-secret" }, ["app-release.apk.bak", "app.ipa", "app.aab"], ["build/app.apk"]]
]) {
  test(`${name} rejects similarly named files and directories masquerading as prerequisites`, (t) => {
    assert.equal(runConfiguration(t, name, { env, files, directories }), false);
  });
}

test("zScan discovers an APK in a nested directory whose name contains spaces", (t) => {
  assert.equal(runConfiguration(t, "zscan", {
    env: { ZSCAN_SECRET: "synthetic-secret" }, files: ["mobile build/outputs/release/app release.apk"]
  }), true);
});

test("Mayhem starts the API only after configuration succeeds and before scanning", () => {
  const steps = workflowSteps("mayhem-for-api");
  const checkout = actionStep(steps, "actions/checkout");
  const config = namedStep(steps, "Check Mayhem configuration");
  const start = namedStep(steps, "Start your API");
  const scan = actionStep(steps, "ForAllSecure/mapi-action");
  assert.ok(steps.indexOf(checkout) < steps.indexOf(config));
  assert.ok(steps.indexOf(config) < steps.indexOf(start));
  assert.ok(steps.indexOf(start) < steps.indexOf(scan));
  assert.equal(start.value("run"), "./run_your_api.sh &");
  for (const configured of [undefined, "", "false", "true"]) {
    assert.equal(evaluateCondition(start, { outputs: { config: { configured } } }), configured === "true");
  }
  assert.equal(scan.value("continue-on-error"), "true");
  assert.equal(scan.value("mayhem-token", true), "${{ secrets.MAYHEM_TOKEN }}");
});

test("zScan checks out and conditionally builds the mobile application before checking for artifacts", () => {
  const steps = workflowSteps("zscan");
  const checkout = actionStep(steps, "actions/checkout");
  const build = namedStep(steps, "Execute Gradle build");
  const config = namedStep(steps, "Check zScan configuration");
  assert.ok(steps.indexOf(checkout) < steps.indexOf(build));
  assert.ok(steps.indexOf(build) < steps.indexOf(config));
  assert.equal(build.value("run"), "./gradlew build");
  assert.equal(evaluateCondition(build), false);
  assert.equal(evaluateCondition(build, { files: ["android/gradlew", "gradlew.bak"] }), false);
  assert.equal(evaluateCondition(build, { files: ["gradlew"] }), true);
  const scan = actionStep(steps, "zimperium/zscanmarketplace");
  for (const [key, context] of Object.entries({ client_env: "vars.ZSCAN_CLIENT_ENV", client_id: "vars.ZSCAN_CLIENT_ID",
    client_secret: "secrets.ZSCAN_CLIENT_SECRET", app_file: "vars.ZSCAN_APP_FILE" })) {
    assert.equal(scan.value(key, true), `\${{ ${context} }}`);
  }
});

for (const [name, scanner, report] of [
  ["mayhem-for-api", "ForAllSecure/mapi-action", "mapi.sarif"],
  ["zscan", "zimperium/zscanmarketplace", "Zimperium.sarif"]
]) {
  test(`${name} uploads SARIF only when the scanner report exists at its expected path`, () => {
    const steps = workflowSteps(name);
    const scan = actionStep(steps, scanner);
    const upload = actionStep(steps, "github/codeql-action/upload-sarif");
    assert.ok(steps.indexOf(scan) < steps.indexOf(upload));
    assert.equal(upload.value("sarif_file", true), report);
    if (name === "mayhem-for-api") assert.equal(scan.value("sarif-report", true), report);
    assert.equal(evaluateCondition(upload), false);
    assert.equal(evaluateCondition(upload, { files: [`reports/${report}`, `${report}.bak`, "other.sarif"] }), false);
    assert.equal(evaluateCondition(upload, { files: [report] }), true);
  });
}

for (const [name, scanner, outputKey] of [
  ["msvc", "microsoft/msvc-code-analysis-action", "sarif"],
  ["ossar", "github/ossar-action", "sarifFile"]
]) {
  test(`${name} uploads only a non-empty SARIF output from the correct scanner step`, () => {
    const steps = workflowSteps(name);
    const scan = actionStep(steps, scanner);
    const upload = actionStep(steps, "github/codeql-action/upload-sarif");
    const id = scan.value("id");
    assert.ok(steps.indexOf(scan) < steps.indexOf(upload));
    assert.equal(upload.value("sarif_file", true), `\${{ steps.${id}.outputs.${outputKey} }}`);
    assert.equal(evaluateCondition(upload), false);
    assert.equal(evaluateCondition(upload, { outputs: { [id]: { [outputKey]: "" } } }), false);
    assert.equal(evaluateCondition(upload, { outputs: { other: { [outputKey]: "results.sarif" }, [id]: { other: "results.sarif" } } }), false);
    assert.equal(evaluateCondition(upload, { outputs: { [id]: { [outputKey]: "results.sarif" } } }), true);
  });
}

test("MSVC configures CMake and initializes analysis only for a root CMake project", () => {
  const steps = workflowSteps("msvc");
  const checkout = actionStep(steps, "actions/checkout");
  const configure = namedStep(steps, "Configure CMake");
  const scan = actionStep(steps, "microsoft/msvc-code-analysis-action");
  assert.ok(steps.indexOf(checkout) < steps.indexOf(configure));
  assert.ok(steps.indexOf(configure) < steps.indexOf(scan));
  for (const step of [configure, scan]) {
    assert.equal(evaluateCondition(step), false);
    assert.equal(evaluateCondition(step, { files: ["src/CMakeLists.txt", "CMakeLists.txt.bak"] }), false);
    assert.equal(evaluateCondition(step, { files: ["CMakeLists.txt"] }), true);
  }
});

const jscramblerKeys = ["JSCRAMBLER_APPLICATION_ID", "JSCRAMBLER_SECRET_KEY", "JSCRAMBLER_ACCESS_KEY"];
for (let mask = 0; mask < 16; mask++) {
  const present = [...jscramblerKeys, "jscrambler.json"].filter((_, index) => mask & (1 << index));
  test(`Jscrambler prerequisites: ${present.join(", ") || "none"}`, () => {
    const secrets = Object.fromEntries(jscramblerKeys.map((key) => [key, present.includes(key) ? `synthetic-${key}` : ""]));
    const files = present.includes("jscrambler.json") ? ["jscrambler.json"] : [];
    const scan = actionStep(workflowSteps("jscrambler-code-integrity"), "jscrambler/code-integrity-actions/protect");
    assert.equal(evaluateCondition(scan, { secrets, env: secrets, files }), present.length === 4);
  });
}

test("Jscrambler rejects a misplaced config and passes the guarded credentials to the protector", () => {
  const scan = actionStep(workflowSteps("jscrambler-code-integrity"), "jscrambler/code-integrity-actions/protect");
  const secrets = Object.fromEntries(jscramblerKeys.map((key) => [key, "synthetic-credential"]));
  assert.equal(evaluateCondition(scan, { secrets, env: secrets, files: ["config/jscrambler.json", "jscrambler.json.bak"] }), false);
  assert.equal(scan.value("jscrambler-config-path", true), "jscrambler.json");
  for (const [input, key] of [["application-id", jscramblerKeys[0]], ["secret-key", jscramblerKeys[1]], ["access-key", jscramblerKeys[2]]]) {
    assert.equal(scan.value(input, true), `\${{ secrets.${key} }}`);
  }
});

test("Jscrambler step conditions use contexts available in GitHub Actions", () => {
  for (const step of workflowSteps("jscrambler-code-integrity").filter((step) => step.has("if"))) {
    assert.doesNotMatch(step.value("if"), /\bsecrets\s*(?:\.|\[)/,
      "GitHub Actions rejects secrets in step if expressions; bind them to env before testing them");
  }
});

const policyVariables = {
  AWS_ROLE_ARN: "arn:aws:iam::123456789012:role/synthetic-policy-validator", AWS_REGION: "us-west-2",
  TF_PLAN_PATH: "plan.json", IAM_ACTIONS: "s3:GetObject", IAM_RESOURCES: "arn:aws:s3:::synthetic-bucket/*",
  REFERENCE_POLICY: "reference-policy.json", REFERENCE_POLICY_TYPE: "IDENTITY_POLICY"
};

function policyJobCondition() {
  const matches = [...workflowSource("policy-validator-tf").matchAll(/^ {4}if: *(.*)$/gm)];
  assert.equal(matches.length, 1, "Policy configuration must gate the whole job before requesting AWS credentials");
  return { value: () => matches[0][1] };
}

test("Terraform policy validation runs with complete repository variables and skips an unconfigured job", () => {
  assert.equal(evaluateCondition(policyJobCondition()), false);
  assert.equal(evaluateCondition(policyJobCondition(), { vars: policyVariables }), true);
  // Credentials/configuration in a different context must not enable the job.
  assert.equal(evaluateCondition(policyJobCondition(), { env: policyVariables, secrets: policyVariables }), false);
});

for (const key of Object.keys(policyVariables)) {
  test(`Terraform policy validation skips when ${key} is missing or empty`, () => {
    const vars = { ...policyVariables };
    delete vars[key];
    assert.equal(evaluateCondition(policyJobCondition(), { vars }), false);
    vars[key] = "";
    assert.equal(evaluateCondition(policyJobCondition(), { vars }), false);
  });
}

test("Terraform policy validation passes the migrated repository variables to action inputs", () => {
  const steps = workflowSteps("policy-validator-tf");
  const credentials = actionStep(steps, "aws-actions/configure-aws-credentials");
  assert.equal(credentials.value("role-to-assume", true), "${{ vars.AWS_ROLE_ARN }}");
  assert.equal(credentials.value("aws-region", true), "${{ vars.AWS_REGION }}");
  const validate = namedStep(steps, "Run AWS AccessAnalyzer ValidatePolicy check");
  assert.equal(validate.value("template-path", true), "${{ vars.TF_PLAN_PATH }}");
  const access = namedStep(steps, "Run AWS AccessAnalyzer CheckAccessNotGranted check");
  assert.equal(access.value("actions", true), "${{ vars.IAM_ACTIONS }}");
  assert.equal(access.value("resources", true), "${{ vars.IAM_RESOURCES }}");
  const reference = namedStep(steps, "Run AWS AccessAnalyzer CheckNoNewAccess check");
  assert.equal(reference.value("reference-policy", true), "${{ vars.REFERENCE_POLICY }}");
  assert.equal(reference.value("reference-policy-type", true), "${{ vars.REFERENCE_POLICY_TYPE }}");
});

test("Terraform policy checks retain their configured region and plan after removing placeholder env values", () => {
  const steps = workflowSteps("policy-validator-tf");
  const checks = steps.filter((step) => step.has("uses") &&
    step.value("uses").startsWith("aws-actions/terraform-aws-iam-policy-validator@"));
  assert.equal(checks.length, 4);
  assert.deepEqual(checks.map((check) => ({
    region: check.value("region", true), plan: check.value("template-path", true)
  })), checks.map(() => ({ region: "${{ vars.AWS_REGION }}", plan: "${{ vars.TF_PLAN_PATH }}" })),
  "All four policy checks need the configured region and plan after removing the placeholder environment");
});

for (const name of ["black-duck-security-scan-ci", "mayhem-for-api", "sonarqube"]) {
  test(`${name} defaults to read-only repository contents permission`, () => {
    const source = workflowSource(name);
    const permissions = source.match(/^permissions:\r?\n((?:[ \t].*\r?\n|\r?\n)*)/m);
    assert.ok(permissions, "Declare workflow-level permissions");
    assert.match(permissions[1], /^ {2}contents: read$/m);
    assert.doesNotMatch(permissions[1], /\bwrite\b/);
  });
}
