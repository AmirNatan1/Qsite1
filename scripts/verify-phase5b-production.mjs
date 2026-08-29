import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { PHASE5B_ROUTES } from "./phase5b-route-contract.mjs";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const IMPLEMENTED_IDS = new Set(["for-industry", "for-startups", "industries"]);
const IMPLEMENTED = PHASE5B_ROUTES.filter(({ id }) => IMPLEMENTED_IDS.has(id));

function bytes(value) {
  return Buffer.byteLength(value, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function references(html, tag, attribute, extension) {
  const pattern = new RegExp(`<${tag}\\b[^>]*\\b${attribute}="([^"]+\\.${extension})"[^>]*>`, "gi");
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

function distHtml(route) {
  return route.id === "404"
    ? path.join(DIST, "404.html")
    : path.join(DIST, ...route.path.split("/").filter(Boolean), "index.html");
}

function distAsset(reference) {
  return path.join(DIST, ...reference.split("?")[0].split("/").filter(Boolean));
}

async function javascriptClosure(entries) {
  const visited = new Map();
  async function visit(reference) {
    const normalized = reference.startsWith("/") ? reference : `/_astro/${reference.replace(/^\.\//, "")}`;
    if (visited.has(normalized)) return;
    const source = await readFile(distAsset(normalized), "utf8");
    visited.set(normalized, source);
    for (const match of source.matchAll(/(?:from\s*|import\(\s*)["'](\.\/[^"']+\.js)["']/g)) await visit(match[1]);
  }
  for (const entry of entries) await visit(entry);
  return visited;
}

async function verifyRoute(route) {
  const html = await readFile(distHtml(route), "utf8");
  const main = html.match(/<main\b[^>]*\bid="main-content"[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? "";
  assert(main, `${route.id}: main-content region is missing`);
  if (route.media === "none") {
    assert(!/<(?:img|picture|video|audio|source|canvas|svg)\b/i.test(main), `${route.id}: zero-media route contains a media element`);
    assert(!/\/media\//i.test(main), `${route.id}: zero-media route references media`);
  }

  const cssReferences = references(html, "link", "href", "css");
  const routeCssReferences = cssReferences.filter((reference) => !/\/BaseLayout\./.test(reference));
  assert(routeCssReferences.length === 1, `${route.id}: expected exactly one route-local stylesheet`);
  const routeCss = await readFile(distAsset(routeCssReferences[0]), "utf8");
  assert(bytes(routeCss) <= route.cssBudget, `${route.id}: route CSS is ${bytes(routeCss)} B; budget is ${route.cssBudget} B`);
  const inlineCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join("\n");
  if (route.media === "none") assert(!/(?:url|image-set)\(|\.(?:avif|gif|jpe?g|png|svg|webp|mp4|webm)(?:[?#"')]|$)/i.test(routeCss + inlineCss), `${route.id}: zero-media route CSS references an asset payload`);

  const scriptReferences = references(html, "script", "src", "js");
  assert(scriptReferences.length === 1, `${route.id}: expected exactly one route-controller entry`);
  const closure = await javascriptClosure(scriptReferences);
  const javascript = [...closure.values()].join("\n");
  const javascriptRaw = [...closure.values()].reduce((total, source) => total + bytes(source), 0);
  const javascriptGzip = [...closure.values()].reduce((total, source) => total + gzipSync(source, { level: 9, mtime: 0 }).length, 0);
  assert(javascriptRaw <= route.jsBudget, `${route.id}: route JS closure is ${javascriptRaw} B; budget is ${route.jsBudget} B`);
  assert(!/home-cinematic|phase-4r2|maradin/i.test([...closure.keys()].join("\n") + javascript), `${route.id}: route JS closure crossed a forbidden runtime boundary`);
  if (route.media === "none") assert(!/new\s+(?:Image|Audio)\b|fetch\s*\(|XMLHttpRequest|sendBeacon|MediaSource|createObjectURL|createElement\(["'](?:img|video|audio|source|canvas)["']|<video|\/media\//i.test(javascript), `${route.id}: route JS closure contains a media request surface`);

  const inlineJavaScript = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join("\n");
  assert(!/home-cinematic|phase-4r2|maradin/i.test(inlineJavaScript), `${route.id}: inherited inline JS contains a forbidden route surface`);
  if (route.media === "none") assert(!/new\s+(?:Image|Audio)\b|fetch\s*\(|XMLHttpRequest|sendBeacon|MediaSource|createObjectURL|createElement\(["'](?:img|video|audio|source|canvas)["']|<video|\/media\//i.test(inlineJavaScript), `${route.id}: inherited inline JS contains a media request surface`);
  const report = {
    css: {
      budgetBasis: "incremental route stylesheet",
      budgetedRaw: bytes(routeCss),
      gzip: gzipSync(routeCss, { level: 9, mtime: 0 }).length,
      inlineSharedRaw: bytes(inlineCss),
      raw: bytes(routeCss),
      references: routeCssReferences,
      phase5bSurfaceRaw: bytes(routeCss) + bytes(inlineCss),
    },
    id: route.id,
    js: {
      budgetBasis: "incremental transitive route-controller closure",
      files: [...closure.keys()],
      gzip: javascriptGzip,
      inlineSharedRaw: bytes(inlineJavaScript),
      raw: javascriptRaw,
      pageScriptSurfaceRaw: javascriptRaw + bytes(inlineJavaScript),
    },
    path: route.path,
  };
  return { closure, report };
}

export async function verifyPhase5BProduction() {
  await stat(DIST);
  const verified = [];
  for (const route of IMPLEMENTED) verified.push(await verifyRoute(route));
  const allHtml = await Promise.all(PHASE5B_ROUTES.map(async (route) => {
    try { return [route.id, await readFile(distHtml(route), "utf8")]; } catch { return [route.id, ""]; }
  }));
  const closures = new Map();
  for (const [id, html] of allHtml) {
    const entries = references(html, "script", "src", "js");
    closures.set(id, entries.length ? await javascriptClosure(entries) : new Map());
  }
  for (const { report, closure } of verified) {
    for (const [otherId, otherClosure] of closures) {
      if (otherId === report.id) continue;
      for (const file of closure.keys()) {
        const sharedProgressHelper = /\/document-progress\.[^/]+\.js$/.test(file)
          && IMPLEMENTED_IDS.has(report.id)
          && IMPLEMENTED_IDS.has(otherId);
        if (!sharedProgressHelper) {
          assert(!otherClosure.has(file), `${report.id}: controller closure leaked into ${otherId}`);
        }
      }
    }
  }
  return { schema: "quantum-hub.phase-5b.production.v1", status: "PASS", routes: verified.map(({ report }) => report) };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  verifyPhase5BProduction()
    .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch((error) => { console.error(`Phase 5B production verification failed: ${error.message}`); process.exitCode = 1; });
}
