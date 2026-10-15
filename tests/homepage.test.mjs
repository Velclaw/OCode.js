import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

// These helpers inspect the static document's contracts, without a browser or network.
// Paired elements used below do not nest another element of the same tag.
function elements(tag, markup = html) {
  return [...markup.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi"))]
    .map((match) => ({ attributes: attributes(match[1]), content: match[2] }));
}

function attributes(markup) {
  return Object.fromEntries([...markup.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3]]));
}

function text(markup) {
  return markup.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

function only(tag, markup = html) {
  const matches = elements(tag, markup);
  assert.equal(matches.length, 1, `Expected one ${tag} element`);
  return matches[0];
}

function section(id) {
  const matches = elements("section").filter((element) => element.attributes.id === id);
  assert.equal(matches.length, 1, `Expected one section with id="${id}"`);
  return matches[0].content;
}

const css = only("style").content;
const body = only("body").content;

function media(query) {
  const blocks = [...css.matchAll(/@media\s*\(([^)]+)\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
  const match = blocks.find((block) => block[1].replace(/\s+/g, "") === query);
  assert.ok(match, `Expected a media query for ${query}`);
  return match[2];
}

function declaration(selector, property, stylesheet = css) {
  const rule = [...stylesheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find((match) => match[1].trim() === selector);
  assert.ok(rule, `Expected a CSS rule for ${selector}`);
  const values = Object.fromEntries(rule[2].split(";").filter((value) => value.trim())
    .map((value) => {
      const colon = value.indexOf(":");
      return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()];
    }));
  assert.ok(Object.hasOwn(values, property), `Expected ${selector} to declare ${property}`);
  return values[property].replace(/\s+/g, "");
}

test("homepage declares Vietnamese, UTF-8, a mobile viewport and project metadata", () => {
  assert.match(html, /^\s*<!doctype html>/i);
  assert.equal(only("html").attributes.lang, "vi");
  const meta = [...html.matchAll(/<meta\b([^>]*)>/gi)].map((match) => attributes(match[1]));
  assert.ok(meta.some((entry) => entry.charset?.toLowerCase() === "utf-8"));
  assert.equal(meta.find((entry) => entry.name === "viewport")?.content,
    "width=device-width, initial-scale=1");
  assert.equal(meta.find((entry) => entry.name === "theme-color")?.content, "#000000");
  const description = meta.find((entry) => entry.name === "description")?.content;
  assert.ok(description, "Search engines should receive a project description");
  assert.match(description, /OCode\.js/);
  assert.match(description, /JavaScript.*TypeScript/);
  assert.match(text(only("title").content), /OCode\.js/);
});

test("homepage provides semantic landmarks, one main heading and named navigation", () => {
  only("header", body);
  only("footer", body);
  const main = only("main", body);
  assert.equal(main.attributes.id, "top");
  assert.match(text(only("h1", body).content), /Small tools\.\s*Solid foundations\./);
  const navigation = elements("nav", body);
  assert.equal(navigation.length, 2);
  for (const nav of navigation) {
    assert.ok(nav.attributes["aria-label"]?.trim(), "Navigation must have an accessible name");
    assert.ok(elements("a", nav.content).length > 0, "Navigation must contain links");
  }
  for (const id of ["features", "quickstart", "ecosystem"]) only("h2", section(id));
});

test("every fragment link resolves to a unique target, including both home links", () => {
  const ids = [...body.matchAll(/<[a-z][\w:-]*\b([^>]*)>/gi)]
    .map((match) => attributes(match[1]).id).filter((id) => id !== undefined);
  assert.equal(new Set(ids).size, ids.length, "Duplicate IDs make fragment navigation ambiguous");
  assert.ok(ids.every((id) => id.trim()), "IDs must not be empty");
  const links = elements("a", body).filter((link) => link.attributes.href?.startsWith("#"));
  assert.ok(links.length > 0);
  for (const link of links) {
    const target = decodeURIComponent(link.attributes.href.slice(1));
    assert.ok(target, "A bare # is not a useful navigation destination");
    assert.ok(ids.includes(target), `Broken fragment link: ${link.attributes.href}`);
  }
  for (const landmark of ["header", "footer"]) {
    const logo = elements("a", only(landmark, body).content)
      .find((link) => link.attributes.class?.split(/\s+/).includes("logo"));
    assert.ok(logo, `${landmark} must link the wordmark to the top of the page`);
    assert.equal(logo.attributes.href, "#top");
    assert.match(text(logo.content), /OCode\s*\.js/);
    assert.match(logo.content, /aria-hidden=["']true["']/);
  }
});

test("primary navigation and hero actions reach features, setup and API documentation", () => {
  const navigation = new Set(elements("a", only("header", body).content).map((link) => link.attributes.href));
  for (const href of ["#features", "#quickstart", "docs/API.md"]) assert.ok(navigation.has(href), href);
  const hero = only("main", body).content.split(/<section\b/i)[0];
  const actions = elements("a", hero);
  const start = actions.find((link) => link.attributes.class?.split(/\s+/).includes("btn-primary"));
  assert.ok(start, "The hero must offer a primary setup action");
  assert.equal(start.attributes.href, "#quickstart");
  assert.ok(actions.some((link) => link.attributes.href === "docs/API.md"));
});

test("all links are named and local documentation links resolve from index.html", () => {
  const local = new Set();
  for (const link of elements("a", body)) {
    const href = link.attributes.href;
    assert.ok(href?.trim(), "Links must have a destination");
    assert.ok(link.attributes["aria-label"]?.trim() || text(link.content), `Unnamed link: ${href}`);
    assert.doesNotMatch(href, /^(?:javascript|data):/i);
    if (href.startsWith("#") || /^[a-z][\w+.-]*:/i.test(href)) continue;
    assert.ok(!href.startsWith("/"), `Documentation must work when hosted in a subdirectory: ${href}`);
    assert.ok(statSync(new URL(href, root)).isFile(), `Missing local documentation: ${href}`);
    local.add(href);
  }
  for (const href of ["README.md", "docs/API.md"]) assert.ok(local.has(href), href);
});

test("repository actions use HTTPS and point to the repository declared by the package", () => {
  const expected = new URL(manifest.repository.url.replace(/^git\+/, "").replace(/\.git$/, ""));
  const external = elements("a", body).filter((link) => /^[a-z][\w+.-]*:/i.test(link.attributes.href ?? ""));
  assert.ok(external.length > 0, "The page must link to its source repository");
  for (const link of external) {
    const url = new URL(link.attributes.href);
    assert.equal(url.protocol, "https:");
    assert.equal(url.origin, expected.origin);
    assert.equal(url.pathname.replace(/\/$/, ""), expected.pathname);
    if (link.attributes.target === "_blank") {
      assert.match(link.attributes.rel ?? "", /\bnoopener\b/, "New tabs must isolate their opener");
    }
  }
});

test("feature cards describe the toolkit's main capabilities and contain useful explanations", () => {
  const cards = elements("article", section("features"));
  const headings = cards.map((card) => text(only("h3", card.content).content));
  for (const title of ["String utilities", "Object helpers", "Async control", "URL & HTTP", "Validation", "Developer ready"]) {
    assert.ok(headings.includes(title), `Missing feature: ${title}`);
  }
  for (const card of cards) assert.ok(text(only("p", card.content).content).length > 20);
});

test("quickstart commands match the repository and existing npm scripts", () => {
  const blocks = elements("code", section("quickstart"));
  const terminal = blocks.find((block) => text(block.content).startsWith("git clone "));
  assert.ok(terminal, "Quickstart must include a shell example");
  const commands = terminal.content.trim().split(/\r?\n/).map((line) => text(line));
  const repository = manifest.repository.url.replace(/^git\+/, "");
  const directory = new URL(repository).pathname.split("/").at(-1).replace(/\.git$/, "");
  assert.equal(commands[0], `git clone ${repository}`);
  assert.equal(commands[1], `cd ${directory}`);
  assert.equal(commands[2], "npm install");
  assert.ok(commands.indexOf("npm test") > commands.indexOf("npm install"));
  assert.ok(commands.indexOf("npm run build") > commands.indexOf("npm install"));
  for (const command of commands.filter((line) => line.startsWith("npm "))) {
    const script = command.match(/^npm (?:run )?(\w+)$/)?.[1];
    assert.ok(script === "install" || Object.hasOwn(manifest.scripts, script), `Unknown command: ${command}`);
  }
  const minimumNode = manifest.engines.node.match(/^>=\s*(\d+)/)[1];
  assert.ok(text(section("quickstart")).includes(`Node.js ${minimumNode}+`));
});

test("hero installation instructions preserve the shell's && operator when copied", () => {
  const hero = only("main", body).content.split(/<section\b/i)[0];
  assert.ok(hero.includes(`git clone ${manifest.repository.url.replace(/^git\+/, "")}`));
  assert.match(hero, /cd OCode\.js &amp;&amp; npm install/);
  assert.ok(text(hero).includes("cd OCode.js && npm install"));
  assert.ok(text(hero).includes("npm test"));
});

test("quickstart explains that the unpublished package requires a local build or link", () => {
  const notes = elements("p", section("quickstart")).map((paragraph) => text(paragraph.content));
  const notice = notes.find((paragraph) => paragraph.includes("chưa được phát hành lên npm"));
  assert.ok(notice, "Do not imply that an unpublished package can be installed from npm");
  assert.match(notice, /build cục bộ/);
  assert.match(notice, /link/);
  assert.match(notice, /README/);
  assert.doesNotMatch(text(section("quickstart")), /npm (?:install|i|add) ocode-js\b/);
});

test("the displayed TypeScript example imports public exports and typechecks against the actual source", () => {
  const examples = elements("code", section("quickstart"))
    .filter((block) => /^\s*import\b/.test(block.content));
  assert.equal(examples.length, 1, "Expected one TypeScript usage example");
  const source = examples[0].content;
  const filename = fileURLToPath(new URL("homepage-example.mts", root));
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const imports = parsed.statements.filter(ts.isImportDeclaration);
  assert.ok(imports.length > 0);
  for (const statement of imports) {
    const specifier = statement.moduleSpecifier.text;
    assert.ok(specifier.startsWith(`${manifest.name}/`) || specifier === manifest.name,
      `Example imports the wrong package: ${specifier}`);
    const subpath = `.${specifier.slice(manifest.name.length)}`;
    assert.ok(Object.hasOwn(manifest.exports, subpath), `Example imports a private module: ${specifier}`);
  }

  const config = ts.readConfigFile(fileURLToPath(new URL("tsconfig.json", root)), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const project = ts.parseJsonConfigFileContent(config.config, ts.sys, fileURLToPath(root));
  assert.equal(project.errors.length, 0);
  // Resolve public declaration paths to source so this test needs no build artifacts.
  const paths = Object.fromEntries(Object.entries(manifest.exports).map(([subpath, entry]) => [
    `${manifest.name}${subpath === "." ? "" : subpath.slice(1)}`,
    [entry.types.replace("./dist/", "./src/").replace(/\.d\.ts$/, ".ts")]
  ]));
  const options = { ...project.options, noEmit: true, rootDir: fileURLToPath(root),
    baseUrl: fileURLToPath(root), paths, noUnusedLocals: false, noUnusedParameters: false };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => path === filename
    ? ts.createSourceFile(path, source, languageVersion, true)
    : getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([filename], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
});

test("Next.js guidance distinguishes server usage from every browser storage helper", () => {
  const ecosystem = section("ecosystem");
  const platforms = elements("strong", ecosystem).map((element) => text(element.content));
  for (const platform of ["JavaScript & TypeScript", "Node.js", "Next.js"]) assert.ok(platforms.includes(platform));
  assert.match(text(ecosystem), /không thay thế framework, runtime/);
  const caveat = elements("span", ecosystem).map((element) => text(element.content))
    .find((content) => content.includes("phía server"));
  assert.ok(caveat, "Next.js guidance must explain server compatibility");
  assert.match(caveat, /trình duyệt/);
  assert.match(caveat, /browser/);
  const source = ts.createSourceFile("browser.ts", readFileSync(new URL("src/browser.ts", root), "utf8"),
    ts.ScriptTarget.Latest, true);
  const helpers = source.statements.filter((statement) => ts.isFunctionDeclaration(statement)
    && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
  assert.ok(helpers.length > 0);
  for (const helper of helpers) assert.ok(caveat.includes(helper.name.text), `Missing browser caveat for ${helper.name.text}`);
});

test("landing page content and navigation are available without JavaScript or remote assets", () => {
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(body, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(css, /@import\b|url\s*\(\s*["']?https?:/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']stylesheet["']/i);
  for (const id of ["features", "quickstart", "ecosystem"]) assert.ok(text(section(id)).length > 0);
});

test("dark theme is unconditional and keyboard focus has a visible indicator", () => {
  assert.equal(declaration(":root", "color-scheme"), "dark");
  assert.equal(declaration(":root", "--bg"), "#000");
  assert.match(declaration("body", "background"), /#000/);
  assert.doesNotMatch(css, /prefers-color-scheme\s*:\s*light/);
  assert.doesNotMatch(declaration(":focus-visible", "outline"), /^(?:none|0)$/);
  assert.ok(Number.parseFloat(declaration(":focus-visible", "outline-offset")) > 0);
  assert.ok(Number.parseFloat(declaration("html", "scroll-padding-top"))
    >= Number.parseFloat(declaration(".nav", "height")), "Sticky navigation must not cover fragment targets");
});

test("tablet layout stacks setup and ecosystem content while keeping the repository action visible", () => {
  const tablet = media("max-width:760px");
  assert.equal(declaration(".grid", "grid-template-columns", tablet), "repeat(2,minmax(0,1fr))");
  assert.equal(declaration(".split", "grid-template-columns", tablet), "1fr");
  assert.equal(declaration(".road", "grid-template-columns", tablet), "1fr");
  assert.equal(declaration(".navlinks a:not(.nav-cta)", "display", tablet), "none");
  assert.ok(elements("a", only("header", body).content)
    .some((link) => link.attributes.class?.split(/\s+/).includes("nav-cta")), "Mobile navigation needs its repository action");
});

test("phone layout uses a single feature column and long code remains scrollable", () => {
  assert.equal(declaration(".grid", "grid-template-columns", media("max-width:440px")), "1fr");
  assert.equal(declaration("pre", "overflow"), "auto");
  assert.equal(declaration(".term-body", "overflow-wrap"), "anywhere");
  assert.equal(declaration(".actions", "flex-wrap"), "wrap");
  assert.equal(declaration(".foot", "flex-wrap"), "wrap");
});

test("reduced motion disables smooth scrolling and transitions, including pseudo-elements", () => {
  const reduced = media("prefers-reduced-motion:reduce");
  assert.equal(declaration("html", "scroll-behavior", reduced), "auto");
  assert.equal(declaration("*,*:before,*:after", "transition", reduced), "none!important");
});
