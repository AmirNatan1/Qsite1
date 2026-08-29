import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { PHASE5B_ROUTES } from "./phase5b-route-contract.mjs";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const IMPLEMENTED_IDS = new Set(["for-industry", "for-startups", "industries", "proof", "maradin", "spark", "about", "contact", "404"]);
const IMPLEMENTED = PHASE5B_ROUTES.filter(({ id }) => IMPLEMENTED_IDS.has(id));
const ROUTE_BY_ID = new Map(PHASE5B_ROUTES.map((route) => [route.id, route]));
const ARCHITECTURE_BY_ID = new Map([
  ["for-industry", "pressure-system"],
  ["for-startups", "conditional-corridor"],
  ["industries", "four-territory-threshold"],
  ["proof", "archive-threshold"],
  ["maradin", "documentary-record"],
  ["spark", "sealed-programme-runway"],
  ["about", "institutional-interlock"],
  ["contact", "intent-field"],
  ["404", "misregistered-recovery-field"],
]);
const MARADIN_MEDIA = Object.freeze({
  "/media/maradin/maradin-field-aperture-poster-approved.jpg": "6afc1a69570f2541b89b4f6a5074bec04a5d607743d91670321f550b4d6364bd",
  "/media/maradin/maradin-prove-field-frame-approved.jpg": "b85f1bd5413b6fe7da235e5217e16b106ae4ff0763e8deb9db6e509dbc0b8b8c",
  "/media/maradin/maradin-real-field-still-approved.jpg": "49ab9aca0d2e3ef9e9ce164f43f9dbd1514ef815179626bef2bb4217827a6741",
  "/media/maradin/maradin-field-aperture-approved.mp4": "daaec510c528bd7f72a97cfce1d9ede3359ec1339e28e26f524d127f09bf247c",
  "/media/maradin/maradin-test-contact-approved.mp4": "076aecf40d9e67ac29eb0b8e2d34ffc374619862a9679a6e44bc08ccfd2c113d",
});
const PROOF_POSTER = "/media/maradin/maradin-field-aperture-poster-approved.jpg";

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

function tags(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))].map((match) => match[1]);
}

function attribute(attributes, name) {
  return attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "i"))?.[1] ?? null;
}

function maradinMediaReferences(source) {
  return [...source.matchAll(/(?:src|poster|data-src)="(\/media\/maradin\/[^"?#]+)(?:[?#][^"]*)?"/gi)].map((match) => match[1]);
}

async function sha256(reference) {
  return createHash("sha256").update(await readFile(distAsset(reference))).digest("hex");
}

async function verifyGovernedMedia(route, main, routeCss, javascript) {
  const mediaPaths = [...new Set(maradinMediaReferences(`${main}\n${routeCss}\n${javascript}`))].sort();
  if (route.media === "none") return { mode: route.media, paths: mediaPaths, videos: 0 };

  const allowed = route.media === "governed-poster" ? [PROOF_POSTER] : Object.keys(MARADIN_MEDIA).sort();
  assert(JSON.stringify(mediaPaths) === JSON.stringify(allowed), `${route.id}: governed media inventory does not match its authority`);
  for (const reference of mediaPaths) {
    assert(await sha256(reference) === MARADIN_MEDIA[reference], `${route.id}: governed media hash mismatch for ${reference}`);
  }

  const imageTags = tags(main, "img");
  const videoTags = tags(main, "video");
  if (route.media === "governed-poster") {
    assert(imageTags.length === 1, "proof: expected exactly one governed poster image");
    assert(attribute(imageTags[0], "src") === PROOF_POSTER, "proof: poster source changed");
    assert(attribute(imageTags[0], "loading") === "eager", "proof: poster must load eagerly");
    assert(attribute(imageTags[0], "fetchpriority") === "high", "proof: poster must have high fetch priority");
    assert(videoTags.length === 0 && tags(main, "source").length === 0, "proof: video is not authorized");
  } else {
    assert(videoTags.length === 2, "maradin: expected exactly two governed user-initiated videos");
    assert(tags(main, "source").length === 0, "maradin: video sources must hydrate only after user initiation");
    for (const attributes of videoTags) {
      assert(/(?:^|\s)controls(?:\s|$)/i.test(attributes), "maradin: video controls are required");
      assert(/(?:^|\s)playsinline(?:\s|$)/i.test(attributes), "maradin: playsinline is required");
      assert(attribute(attributes, "preload") === "none", "maradin: preload must be none");
      assert(attribute(attributes, "src") === null, "maradin: video src must be absent before user initiation");
      assert(Object.hasOwn(MARADIN_MEDIA, attribute(attributes, "data-src")), "maradin: data-src is not governed");
      assert(!/(?:^|\s)autoplay(?:\s|$)/i.test(attributes), "maradin: autoplay is forbidden");
    }
    assert(tags(main, "button").filter((attributes) => /data-maradin-video-trigger/i.test(attributes)).length === 2, "maradin: each video needs a real user-initiation control");
  }

  return {
    mode: route.media,
    paths: mediaPaths,
    transferredBytesIfAllRequested: (await Promise.all(mediaPaths.map((reference) => stat(distAsset(reference))))).reduce((total, item) => total + item.size, 0),
    videos: videoTags.length,
  };
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
  const article = tags(main, "article").find((attributes) => attribute(attributes, "data-route-production") === route.id);
  assert(article, `${route.id}: route production root is missing`);
  assert(attribute(article, "data-route-architecture") === ARCHITECTURE_BY_ID.get(route.id), `${route.id}: route architecture changed`);
  assert(tags(main, "h1").length === 1, `${route.id}: expected exactly one H1`);
  assert([...main.matchAll(/\bdata-route-act="/g)].length === route.acts, `${route.id}: route act count changed`);
  if (route.regions !== undefined) assert([...main.matchAll(/\bdata-route-region="/g)].length === route.regions, `${route.id}: route region count changed`);
  if (route.media === "none") {
    assert(!/<(?:img|picture|video|audio|source|canvas|svg)\b/i.test(main), `${route.id}: zero-media route contains a media element`);
    assert(!/\/media\//i.test(main), `${route.id}: zero-media route references media`);
  }

  const cssReferences = references(html, "link", "href", "css");
  const routeCssReferences = cssReferences.filter((reference) => !/\/BaseLayout\./.test(reference));
  const inlineCssBlocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  const inlineCss = inlineCssBlocks.join("\n");
  let routeCss;
  let inlineSharedCss;
  let routeCssReportReferences;
  if (route.mode === "A") {
    assert(routeCssReferences.length === 0, `${route.id}: Mode A route CSS must remain a single inlined stylesheet`);
    assert(inlineCssBlocks.length === 1, `${route.id}: expected exactly one inlined route-local stylesheet`);
    routeCss = inlineCss;
    inlineSharedCss = "";
    routeCssReportReferences = ["inline:route"];
  } else {
    assert(routeCssReferences.length === 1, `${route.id}: expected exactly one route-local stylesheet`);
    routeCss = await readFile(distAsset(routeCssReferences[0]), "utf8");
    inlineSharedCss = inlineCss;
    routeCssReportReferences = routeCssReferences;
  }
  assert(bytes(routeCss) <= route.cssBudget, `${route.id}: route CSS is ${bytes(routeCss)} B; budget is ${route.cssBudget} B`);
  if (route.media === "none") assert(!/(?:url|image-set)\(|\.(?:avif|gif|jpe?g|png|svg|webp|mp4|webm)(?:[?#"')]|$)/i.test(routeCss + inlineSharedCss), `${route.id}: zero-media route CSS references an asset payload`);

  const scriptReferences = references(html, "script", "src", "js");
  if (route.mode === "C") assert(scriptReferences.length === 1, `${route.id}: Mode C requires exactly one route-controller entry`);
  if (route.mode === "B") assert(scriptReferences.length <= 1, `${route.id}: Mode B permits at most one bounded controller entry`);
  if (route.mode === "A") assert(scriptReferences.length === 0, `${route.id}: Mode A must not ship route JavaScript`);
  const closure = await javascriptClosure(scriptReferences);
  const javascript = [...closure.values()].join("\n");
  const javascriptRaw = [...closure.values()].reduce((total, source) => total + bytes(source), 0);
  const javascriptGzip = [...closure.values()].reduce((total, source) => total + gzipSync(source, { level: 9, mtime: 0 }).length, 0);
  assert(javascriptRaw <= route.jsBudget, `${route.id}: route JS closure is ${javascriptRaw} B; budget is ${route.jsBudget} B`);
  assert(!/home-cinematic|phase-4r2/i.test([...closure.keys()].join("\n") + javascript), `${route.id}: route JS closure crossed a forbidden runtime boundary`);
  if (route.id !== "maradin") assert(!/maradin/i.test([...closure.keys()].join("\n") + javascript), `${route.id}: Maradin runtime leaked into this route`);
  if (route.media === "none") assert(!/new\s+(?:Image|Audio)\b|fetch\s*\(|XMLHttpRequest|sendBeacon|MediaSource|createObjectURL|createElement\(["'](?:img|video|audio|source|canvas)["']|<video|\/media\//i.test(javascript), `${route.id}: route JS closure contains a media request surface`);

  const inlineJavaScript = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join("\n");
  assert(!/home-cinematic|phase-4r2/i.test(inlineJavaScript), `${route.id}: inherited inline JS contains a forbidden route surface`);
  if (route.media === "none") assert(!/new\s+(?:Image|Audio)\b|fetch\s*\(|XMLHttpRequest|sendBeacon|MediaSource|createObjectURL|createElement\(["'](?:img|video|audio|source|canvas)["']|<video|\/media\//i.test(inlineJavaScript), `${route.id}: inherited inline JS contains a media request surface`);
  const media = await verifyGovernedMedia(route, main, routeCss + inlineSharedCss, javascript + inlineJavaScript);
  const report = {
    css: {
      budgetBasis: "incremental route stylesheet",
      budgetedRaw: bytes(routeCss),
      gzip: gzipSync(routeCss, { level: 9, mtime: 0 }).length,
      inlineSharedRaw: bytes(inlineSharedCss),
      raw: bytes(routeCss),
      references: routeCssReportReferences,
      phase5bSurfaceRaw: bytes(routeCss) + bytes(inlineSharedCss),
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
    media,
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
        const currentMode = ROUTE_BY_ID.get(report.id)?.mode;
        const otherMode = ROUTE_BY_ID.get(otherId)?.mode;
        const sharedModeHelper = (/\/document-progress\.[^/]+\.js$/.test(file) && currentMode === "C" && otherMode === "C")
          || (/\/reversible-reveal\.[^/]+\.js$/.test(file) && currentMode === "B" && otherMode === "B");
        if (!sharedModeHelper) {
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
