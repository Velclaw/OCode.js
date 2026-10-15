import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

// Source contracts for the static page, using the existing Node test runner.
// These helpers read its quoted attributes and non-nested semantic tags;
// they are not a general HTML parser or a substitute for rendered layout tests.
function attributes(source) {
  return Object.fromEntries([...source.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map(([, name, doubleQuoted, singleQuoted]) => [name.toLowerCase(), doubleQuoted ?? singleQuoted]));
}

function elements(tag, source = html) {
  return [...source.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi"))]
    .map(([, opening, content]) => ({ attrs: attributes(opening), content }));
}

function only(tag, source = html) {
  const matches = elements(tag, source);
  assert.equal(matches.length, 1, `Expected one <${tag}>`);
  return matches[0];
}

function decode(source) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
  return source.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, entity) => entities[entity]);
}

function text(source) {
  return decode(source.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ").trim();
}

function hasClass(element, name) {
  return (element.attrs.class ?? "").split(/\s+/).includes(name);
}

const head = only("head").content;
const body = only("body").content;
const main = only("main", body);
const links = elements("a", body);
const sections = elements("section", main.content);

function section(id) {
  const matches = sections.filter((item) => item.attrs.id === id);
  assert.equal(matches.length, 1, `Expected one section #${id}`);
  return matches[0].content;
}

function requireLinks(source, destinations) {
  const hrefs = elements("a", source).map((item) => item.attrs.href);
  for (const href of destinations) assert.ok(hrefs.includes(href), `Missing link to ${href}`);
}

const css = only("style", head).content;
// The inline stylesheet has one level of rules inside each media query.
const mediaPattern = /@media\s*\(([^)]+)\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const media = [...css.matchAll(mediaPattern)].map(([, condition, content]) => ({
  condition: condition.replace(/\s+/g, ""), content
}));
const baseCss = css.replace(mediaPattern, "");

function rule(selector, source = baseCss) {
  const matches = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(",").some((item) => item.trim() === selector));
  assert.ok(matches.length, `Missing CSS rule for ${selector}`);
  const declarations = matches.flatMap(([, , content]) => content.split(";"))
    .filter((item) => item.includes(":"))
    .map((item) => {
      const colon = item.indexOf(":");
      return [item.slice(0, colon).trim(), item.slice(colon + 1).replace(/\s+/g, "")];
    });
  return Object.fromEntries(declarations);
}

function mediaCss(condition) {
  const matches = media.filter((item) => item.condition === condition);
  assert.equal(matches.length, 1, `Expected media query (${condition})`);
  return matches[0].content;
}

const repository = pkg.repository.url.replace(/\.git$/, "");

test("homepage identifies the toolkit and declares Vietnamese document metadata", () => {
  assert.match(html, /^\s*<!doctype html>/i);
  assert.equal(only("html").attrs.lang, "vi");
  const metas = [...head.matchAll(/<meta\b([^>]*)>/gi)].map(([, opening]) => attributes(opening));
  assert.equal(metas.filter((item) => item.charset?.toLowerCase() === "utf-8").length, 1);
  for (const [name, value] of [
    ["viewport", "width=device-width, initial-scale=1"],
    ["theme-color", "#000000"]
  ]) {
    const matches = metas.filter((item) => item.name === name);
    assert.equal(matches.length, 1, `Expected one ${name} meta tag`);
    assert.equal(matches[0].content, value);
  }
  const description = metas.filter((item) => item.name === "description");
  assert.equal(description.length, 1);
  assert.match(description[0].content, /OCode\.js.*JavaScript.*TypeScript/);
  assert.match(text(only("title", head).content), /OCode\.js.*Small tools\. Solid foundations\./);
});

test("homepage exposes semantic landmarks and one primary project heading", () => {
  only("header", body);
  only("footer", body);
  assert.equal(main.attrs.id, "top");
  assert.equal(text(only("h1", main.content).content), "Small tools. Solid foundations.");
  for (const id of ["features", "quickstart", "ecosystem"]) {
    assert.ok(text(only("h2", section(id)).content), `Section #${id} needs a heading`);
  }
  const navs = elements("nav", body);
  assert.equal(navs.length, 2);
  assert.equal(new Set(navs.map((nav) => nav.attrs["aria-label"])).size, navs.length);
  for (const nav of navs) assert.ok(nav.attrs["aria-label"]?.trim(), "Navigation needs a name");
});

test("all fragment links resolve to exactly one target, including both home links", () => {
  const ids = [...body.matchAll(/<[a-z][\w-]*\b([^>]*)>/gi)]
    .map(([, opening]) => attributes(opening).id).filter((id) => id !== undefined);
  assert.ok(ids.every((id) => id.trim()), "IDs must not be empty");
  assert.equal(new Set(ids).size, ids.length, "Duplicate IDs make navigation ambiguous");
  const fragments = links.filter((link) => link.attrs.href?.startsWith("#"));
  assert.ok(fragments.length > 0);
  for (const link of fragments) {
    const id = decodeURIComponent(link.attrs.href.slice(1));
    assert.ok(id, "Placeholder fragment links are not usable");
    assert.equal(ids.filter((target) => target === id).length, 1, `Broken fragment ${link.attrs.href}`);
  }
  const logos = links.filter((link) => hasClass(link, "logo"));
  assert.equal(logos.length, 2);
  for (const logo of logos) assert.equal(logo.attrs.href, "#top");
});

test("primary navigation, hero actions, closing actions and footer reach their destinations", () => {
  requireLinks(only("header", body).content, ["#features", "#quickstart", "docs/API.md", repository]);
  const hero = main.content.split(/<section\b/i)[0];
  requireLinks(hero, ["#quickstart", "docs/API.md"]);
  const start = elements("a", hero).find((link) => hasClass(link, "btn-primary"));
  assert.ok(start, "The hero needs a primary action");
  assert.equal(start.attrs.href, "#quickstart");
  const closing = sections.find((item) => /class="closing"/.test(item.content));
  assert.ok(closing, "The page needs its closing call to action");
  requireLinks(closing.content, [repository, "README.md"]);
  requireLinks(only("footer", body).content, ["README.md", "docs/API.md", repository]);
});

test("relative documentation links point to nonempty files in this checkout", () => {
  const local = links.filter((link) => link.attrs.href && !/^(?:#|https?:\/\/)/.test(link.attrs.href));
  assert.ok(local.length > 0);
  for (const link of local) {
    const href = link.attrs.href;
    const destination = new URL(href, root);
    assert.ok(destination.href.startsWith(root.href), `Documentation must stay in the repository: ${href}`);
    const file = statSync(destination);
    assert.ok(file.isFile() && file.size > 0, `Missing or empty documentation: ${href}`);
  }
});

test("every link has a name and a usable destination; external links use the declared repository", () => {
  assert.ok(links.length > 0);
  for (const link of links) {
    const href = link.attrs.href;
    assert.ok(href?.trim(), "Links must not have empty destinations");
    assert.ok((link.attrs["aria-label"] ?? text(link.content)).trim(), `Unnamed link to ${href}`);
    assert.doesNotMatch(href, /^(?:javascript|data|vbscript):|^\/\//i);
    if (/^[a-z][\w+.-]*:/i.test(href)) {
      assert.equal(new URL(href).protocol, "https:");
      assert.equal(href, repository);
    }
    if (link.attrs.target === "_blank") {
      assert.ok(/\bnoopener\b/.test(link.attrs.rel ?? ""), "New tabs must not retain an opener");
    }
  }
});

test("header and footer preserve the wordmark and hide decorative logo marks", () => {
  for (const tag of ["header", "footer"]) {
    const logo = elements("a", only(tag, body).content).filter((link) => hasClass(link, "logo"));
    assert.equal(logo.length, 1);
    const spans = elements("span", logo[0].content);
    const mark = spans.find((span) => hasClass(span, "logo-mark"));
    assert.ok(mark);
    assert.equal(mark.attrs["aria-hidden"], "true");
    assert.equal(text(logo[0].content).replace(text(mark.content), "").trim(), "OCode.js");
    assert.match(logo[0].content, /class="dot">\.js<\/span>/);
  }
});

test("feature cards describe all advertised toolkit categories", () => {
  const cards = elements("article", section("features"));
  assert.deepEqual(cards.map((card) => text(only("h3", card.content).content)), [
    "String utilities", "Object helpers", "Async control", "URL & HTTP", "Validation", "Developer ready"
  ]);
  for (const card of cards) {
    assert.ok(hasClass(card, "card"));
    assert.ok(text(only("p", card.content).content), "A feature needs an explanation");
  }
});

test("quick start presents a clone-first installation and existing test and build commands", () => {
  const code = elements("code", section("quickstart"));
  assert.equal(code.length, 2);
  assert.deepEqual(decode(code[0].content).trim().split(/\r?\n/).map((line) => line.trim()), [
    `git clone ${pkg.repository.url}`, "cd OCode.js", "npm install", "npm test", "npm run build"
  ]);
  assert.ok(pkg.scripts.test);
  assert.ok(pkg.scripts.build);
  assert.match(text(section("quickstart")), /Node\.js 18\+/);
  assert.equal(pkg.engines.node, ">=18");
  const terminal = main.content.split(/<section\b/i)[0];
  assert.ok(text(terminal).includes(`git clone ${pkg.repository.url}`));
  assert.ok(text(terminal).includes("cd OCode.js && npm install"), "Shell operators must decode correctly");
});

test("quick start warns about unpublished npm installation rather than advertising it as available", () => {
  const quickstart = section("quickstart");
  assert.match(text(quickstart), /package chưa được phát hành lên npm/);
  assert.match(text(quickstart), /README/);
  for (const code of elements("code", quickstart)) {
    assert.doesNotMatch(text(code.content), new RegExp(`npm (?:install|i|add)\\s+${pkg.name}\\b`));
  }
});

function runExample(mocks) {
  const example = decode(elements("code", section("quickstart"))[1].content);
  const compiled = ts.transpileModule(example, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true
  });
  assert.deepEqual(compiled.diagnostics.filter((item) => item.category === ts.DiagnosticCategory.Error), []);
  const modules = new Map([
    ["./src/string", { slugify: mocks.slugify }],
    ["./src/async", { retry: mocks.retry }]
  ]);
  // Exercise the checked-in example with isolated imports and fetch. No real
  // request or delay is made, and the unchanged utility implementations are not under test.
  return runInNewContext(`(async () => {\n${compiled.outputText}\nreturn { slug, result };\n})()`, {
    exports: {},
    require(name) {
      assert.ok(modules.has(name), `Unexpected example import: ${name}`);
      return modules.get(name);
    },
    fetch: mocks.fetch
  }, { timeout: 1000 });
}

test("TypeScript example compiles and uses the imported helpers and bounded retry options", async () => {
  const calls = [];
  const response = { ok: true, status: 200 };
  const result = await runExample({
    slugify(value) { calls.push(["slugify", value]); return "build-a-better-web"; },
    async retry(operation, options) { calls.push(["retry", { ...options }]); return operation(); },
    async fetch(url) { calls.push(["fetch", url]); return response; }
  });
  assert.equal(result.slug, "build-a-better-web");
  assert.equal(result.result, response);
  assert.deepEqual(calls, [
    ["slugify", "Build a better web"],
    ["retry", { attempts: 3, delayMs: 200 }],
    ["fetch", "/api/status"]
  ]);
});

test("TypeScript example forwards a rejected request through its retry callback", async () => {
  const failure = new Error("offline");
  let requests = 0;
  await assert.rejects(runExample({
    slugify: () => "build-a-better-web",
    retry: (operation) => operation(),
    async fetch() { requests++; throw failure; }
  }), (error) => error === failure);
  assert.equal(requests, 1);
});

test("ecosystem and footer communicate framework compatibility and development status", () => {
  const ecosystem = section("ecosystem");
  assert.match(text(ecosystem), /Framework-agnostic by design/);
  assert.deepEqual(elements("strong", ecosystem).map((item) => text(item.content)), [
    "JavaScript & TypeScript", "Node.js", "Next.js"
  ]);
  assert.match(text(ecosystem), /API chỉ chạy trên browser/);
  const footer = text(only("footer", body).content);
  assert.ok(footer.includes(`${pkg.license} License`));
  assert.ok(footer.includes("Early development"));
});

test("landing page content and navigation remain available without JavaScript or external assets", () => {
  assert.doesNotMatch(html, /<script\b|<iframe\b|<link\b[^>]*rel=["'](?:stylesheet|preload)["']/i);
  assert.doesNotMatch(css, /@import\b|url\s*\(/i);
  assert.ok(text(main.content).includes("JavaScript · TypeScript · Zero runtime dependencies"));
  requireLinks(main.content, ["#quickstart", "docs/API.md"]);
});

test("dark styling, focus visibility and sticky header anchor clearance are declared", () => {
  assert.equal(rule(":root")["color-scheme"], "dark");
  assert.equal(rule(":root")["--bg"], "#000");
  assert.match(rule("body").background, /#000/);
  assert.equal(rule("header").position, "sticky");
  const focus = rule(":focus-visible");
  assert.match(focus.outline, /^2pxsolid#/);
  assert.ok(Number.parseFloat(focus["outline-offset"]) > 0);
  assert.ok(Number.parseFloat(rule("html")["scroll-padding-top"]) > Number.parseFloat(rule(".nav").height));
});

test("desktop, tablet and narrow phone breakpoints reduce columns and retain the repository action", () => {
  const tablet = mediaCss("max-width:760px");
  const phone = mediaCss("max-width:440px");
  assert.equal(rule(".grid")["grid-template-columns"], "repeat(3,minmax(0,1fr))");
  assert.equal(rule(".grid", tablet)["grid-template-columns"], "repeat(2,minmax(0,1fr))");
  assert.equal(rule(".grid", phone)["grid-template-columns"], "1fr");
  assert.equal(rule(".split")["grid-template-columns"], "1fr1fr");
  assert.equal(rule(".split", tablet)["grid-template-columns"], "1fr");
  assert.equal(rule(".road", tablet)["grid-template-columns"], "1fr");
  assert.equal(rule(".navlinks a:not(.nav-cta)", tablet).display, "none");
  const cta = elements("a", only("header", body).content).filter((link) => hasClass(link, "nav-cta"));
  assert.equal(cta.length, 1);
  assert.equal(cta[0].attrs.href, repository);
  assert.notEqual(rule(".nav-cta", phone).display, "none");
});

test("long commands, code blocks and action groups declare small-screen overflow handling", () => {
  assert.match(rule(".container").width, /100%-44px/);
  assert.match(rule(".container", mediaCss("max-width:760px")).width, /100%-30px/);
  assert.equal(rule(".term-body")["overflow-wrap"], "anywhere");
  assert.equal(rule("pre").overflow, "auto");
  for (const selector of [".actions", ".foot", ".footlinks"]) {
    assert.equal(rule(selector)["flex-wrap"], "wrap", `${selector} must wrap rather than overflow`);
  }
});

test("reduced motion overrides smooth scrolling and transitions for elements and pseudo-elements", () => {
  assert.equal(rule("html")["scroll-behavior"], "smooth");
  assert.ok(rule(".btn").transition);
  const reduced = mediaCss("prefers-reduced-motion:reduce");
  assert.equal(rule("html", reduced)["scroll-behavior"], "auto");
  for (const selector of ["*", "*:before", "*:after"]) {
    assert.equal(rule(selector, reduced).transition, "none!important");
  }
});
