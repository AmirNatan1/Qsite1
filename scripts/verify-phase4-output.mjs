import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { ALL_HTML_ROUTES, INTENDED_PUBLIC_ASSETS, PUBLIC_INDUSTRY_NAMES } from "./phase1-qa-config.mjs";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const ACCEPTED_PHASE2B_CSS_RAW = 49_478;
const HOME_CHAPTERS = Object.freeze([
  { id: "entry", label: "home-title", heading: "h1" },
  { id: "built-with-industry", label: "industry-model-title", heading: "h2" },
  { id: "method", label: "method-title", heading: "h2" },
  { id: "industries", label: "industries-title", heading: "h2" },
  { id: "proof", label: "proof-title", heading: "h2" },
  { id: "programmes", label: "programmes-title", heading: "h2" },
  { id: "conversion", label: "conversion-title", heading: "h2" },
]);
const MEDIA_ASSETS = Object.freeze([
  {
    output: "phase-3-desktop-vp9-44a1d9facd43.webm",
    bytes: 1_658_294,
    sha256: "44a1d9facd4316eff94e3712917a843b26d32b8012cadaa3f379edff2ffd2fcc",
  },
  {
    output: "phase-3-desktop-h264-a73be0bb9890.mp4",
    bytes: 3_499_571,
    sha256: "a73be0bb989077551c0b3405cee2c3fa435b67049bf02b523df20baf0a4fb59e",
  },
  {
    output: "phase-3-mobile-vp9-0ffcf12a431b.webm",
    bytes: 647_761,
    sha256: "0ffcf12a431b585f4ce37afd7df6ec0da1e52c4ef3c67d0ab761aaa5d5be517b",
  },
  {
    output: "phase-3-mobile-h264-34319f80ae39.mp4",
    bytes: 1_242_276,
    sha256: "34319f80ae397758a3f7d4f192c572cee76c11ba5118a6fadb65c0374b4c99b2",
  },
  {
    output: "phase-3-dormant-desktop-03f5490ab11a.png",
    bytes: 726_026,
    sha256: "03f5490ab11a628eb00c20fa6fc96f72a72593b9ca9da0e8735e55f1c5ffe465",
  },
  {
    output: "phase-3-dormant-mobile-9d5c19b1a5e2.png",
    bytes: 209_543,
    sha256: "9d5c19b1a5e294bc82822f44a11b94940829e67162c55783bb55bc5f5c02caad",
  },
  {
    output: "phase-3-dormant-narrow-451d05bcc3d5.png",
    bytes: 162_832,
    sha256: "451d05bcc3d53a8c451e01751bdbb5dc3ddd7d68d9cd6e208a69dc58e4684366",
  },
]);
const VIDEO_ASSETS = MEDIA_ASSETS.filter(({ output }) => /\.(?:mp4|webm)$/.test(output));
const POSTER_ASSETS = MEDIA_ASSETS.filter(({ output }) => /\.png$/.test(output));
const SUPPORTING_ROUTES = ALL_HTML_ROUTES.filter(({ path: routePath }) => routePath !== "/");
const failures = [];

function check(condition, code, location, message, details = undefined) {
  if (!condition) failures.push({ code, location, message, ...(details === undefined ? {} : { details }) });
}

async function exists(absolute) {
  try {
    await stat(absolute);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
}

function decodeHtml(value) {
  return value
    .replace(/&#x([a-f0-9]+);/gi, (_, hexadecimal) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function visibleText(value) {
  return decodeHtml(value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalized(value) {
  return value.replace(/[\u2011\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`(?:^|\\s)${escaped}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, "i"));
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? "") : undefined;
}

function tags(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))].map((match) => match[0]);
}

function elements(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi"))].map((match) => ({
    tag: `<${tagName}${match[1]}>`,
    inner: match[2],
  }));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sizes(buffers) {
  return {
    raw: buffers.reduce((total, buffer) => total + buffer.length, 0),
    gzip: buffers.reduce((total, buffer) => total + gzipSync(buffer, { level: 9 }).length, 0),
  };
}

function formatBytes(value) {
  return `${value.toLocaleString("en-US")} B`;
}

function localReference(reference, from = "") {
  const clean = reference.split(/[?#]/, 1)[0];
  if (/^https?:/i.test(clean) || clean.startsWith("//")) return null;
  if (clean.startsWith("/")) return path.posix.normalize(clean.slice(1));
  if (clean.startsWith("./") || clean.startsWith("../")) return path.posix.normalize(path.posix.join(path.posix.dirname(from), clean));
  if (clean.startsWith("_astro/")) return path.posix.normalize(clean);
  return null;
}

function referencedJavaScript(html) {
  const references = new Set();
  for (const tag of tags(html, "script")) {
    const reference = localReference(attribute(tag, "src") ?? "");
    if (reference && /\.(?:js|mjs)$/.test(reference)) references.add(reference);
  }
  for (const tag of tags(html, "link")) {
    const rel = (attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    if (!rel.includes("modulepreload") && !rel.includes("preload")) continue;
    const reference = localReference(attribute(tag, "href") ?? "");
    if (reference && /\.(?:js|mjs)$/.test(reference)) references.add(reference);
  }
  return references;
}

function referencedStylesheets(html) {
  return new Set(tags(html, "link")
    .filter((tag) => (attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("stylesheet"))
    .map((tag) => localReference(attribute(tag, "href") ?? ""))
    .filter((reference) => reference && reference.endsWith(".css")));
}

function moduleDependencies(record) {
  const references = new Set();
  for (const match of record.text.matchAll(/["'`]((?:\.\.\/|\.\/|\/?_astro\/)[^"'`?#]+\.(?:js|mjs)(?:[?#][^"'`]*)?)["'`]/gi)) {
    const reference = localReference(match[1], record.path);
    if (reference) references.add(reference);
  }
  return references;
}

function moduleClosure(initial, byPath) {
  const closure = new Set();
  const queue = [...initial];
  while (queue.length > 0) {
    const reference = queue.shift();
    if (!reference || closure.has(reference)) continue;
    closure.add(reference);
    const record = byPath.get(reference);
    if (!record) continue;
    for (const dependency of moduleDependencies(record)) queue.push(dependency);
  }
  return closure;
}

let outputFiles = [];
if (!(await exists(DIST))) check(false, "dist-missing", "dist", "production output is missing; run the Astro build first");
else outputFiles = await walk(DIST);
const records = await Promise.all(outputFiles.map(async (absolute) => {
  const contents = await readFile(absolute);
  return {
    path: path.relative(DIST, absolute).replaceAll("\\", "/"),
    contents,
    text: contents.toString("utf8"),
  };
}));
const byPath = new Map(records.map((record) => [record.path, record]));

for (const route of ALL_HTML_ROUTES) check(byPath.has(route.output), "route-output", `dist/${route.output}`, `built output for ${route.path} is missing`);
const homeRecord = byPath.get("index.html");
const homeHtml = homeRecord?.text ?? "";
check(Boolean(homeRecord), "home-output", "dist/index.html", "built Home output is missing");
const homeText = normalized(visibleText(homeHtml));
const titleText = normalized(visibleText(homeHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
check(titleText === "Industrial innovation tested in the real world | Quantum", "home-title", "dist/index.html", "accepted Home title must remain unchanged", titleText);

const observedChapterOrder = tags(homeHtml, "section").map((tag) => attribute(tag, "id")).filter((id) => HOME_CHAPTERS.some((chapter) => chapter.id === id));
check(
  observedChapterOrder.length === HOME_CHAPTERS.length && observedChapterOrder.every((id, index) => id === HOME_CHAPTERS[index].id),
  "home-chapter-order",
  "dist/index.html",
  `built Home must contain the accepted seven chapters in order: ${HOME_CHAPTERS.map(({ id }) => id).join(", ")}`,
  observedChapterOrder,
);
for (const chapter of HOME_CHAPTERS) {
  const section = tags(homeHtml, "section").find((tag) => attribute(tag, "id") === chapter.id);
  check(Boolean(section), "home-chapter", "dist/index.html", `chapter ${chapter.id} is missing`);
  if (section) {
    check(attribute(section, "aria-labelledby") === chapter.label, "home-chapter-label", "dist/index.html", `${chapter.id} must be labelled by ${chapter.label}`);
    check(attribute(section, "data-home-scene") === chapter.id, "home-chapter-hook", "dist/index.html", `${chapter.id} must retain its scene identity`);
  }
  const heading = tags(homeHtml, chapter.heading).find((tag) => attribute(tag, "id") === chapter.label);
  check(Boolean(heading), "home-chapter-heading", "dist/index.html", `${chapter.id} must retain its ${chapter.heading.toUpperCase()} label target`);
}
const h1Elements = elements(homeHtml, "h1");
check(h1Elements.length === 1, "home-h1-count", "dist/index.html", `built Home must contain exactly one H1; observed ${h1Elements.length}`);
check(normalized(visibleText(h1Elements[0]?.inner ?? "")).toLowerCase() === "where do you enter?", "entry-h1", "dist/index.html", "settled ENTRY H1 must be WHERE DO YOU ENTER?");
const entrySection = tags(homeHtml, "section").find((tag) => attribute(tag, "id") === "entry");
check(attribute(entrySection ?? "", "tabindex") === "-1", "skip-target-focus", "dist/index.html", "ENTRY skip target must be programmatically focusable");

const skipLink = tags(homeHtml, "a").find((tag) => (attribute(tag, "class") ?? "").split(/\s+/).includes("skip-link"));
check(attribute(skipLink ?? "", "href") === "#entry", "skip-intro-target", "dist/index.html", "Home skip link must target ENTRY");
const skipElement = elements(homeHtml, "a").find(({ tag }) => (attribute(tag, "class") ?? "").split(/\s+/).includes("skip-link"));
check(normalized(visibleText(skipElement?.inner ?? "")) === "Skip cinematic intro", "skip-intro-label", "dist/index.html", "Home skip link must describe the cinematic intro");
for (const [href, copy] of [
  ["/for-partners/", "Bring us an operational challenge."],
  ["/for-startups/", "Bring us a technology ready to be tested."],
]) {
  check(tags(homeHtml, "a").some((tag) => attribute(tag, "href") === href) && homeText.includes(copy), "entry-route", "dist/index.html", `ENTRY must retain ${href} and its accepted proposition`);
}
const methodList = elements(homeHtml, "ol").find(({ tag }) => (attribute(tag, "class") ?? "").split(/\s+/).includes("method-stages"));
const methodOrder = methodList ? elements(methodList.inner, "h3").map(({ inner }) => normalized(visibleText(inner))) : [];
check(JSON.stringify(methodOrder) === JSON.stringify(["Frame", "Source", "Assess", "Test", "Decide"]), "method-semantics", "dist/index.html", "METHOD must remain an ordered five-stage semantic list", methodOrder);
for (const industry of PUBLIC_INDUSTRY_NAMES) check(homeText.includes(normalized(industry)), "industry-content", "dist/index.html", `approved industry is missing: ${industry}`);
check(tags(homeHtml, "a").some((tag) => attribute(tag, "href") === "/pocs/maradin/"), "proof-route", "dist/index.html", "PROOF must link to the public Maradin field record");
for (const media of ["/media/maradin/maradin-field-aperture-poster-approved.jpg", "/media/maradin/maradin-real-field-still-approved.jpg"]) check(homeHtml.includes(media), "proof-media", "dist/index.html", `PROOF must retain approved still ${media}`);
check(/\bSPARK\b/.test(homeText) && /\bCHAMP\b/.test(homeText) && homeText.includes("Applications closed"), "programme-content", "dist/index.html", "PROGRAMMES must retain governed SPARK/CHAMP content and closed status");
for (const href of ["/contact/#for-industry", "/contact/#for-startups", "/contact/#general"]) check(tags(homeHtml, "a").some((tag) => attribute(tag, "href") === href), "conversion-route", "dist/index.html", `CONVERSION is missing ${href}`);

// A no-JS/reduced-motion response exposes a poster and one inert decorative decoder, never a video URL.
const videos = elements(homeHtml, "video");
check(videos.length === 1 && tags(homeHtml, "video").length === 1, "cinematic-video-count", "dist/index.html", `built Home must contain exactly one video decoder; observed ${videos.length}`);
if (videos[0]) {
  const { tag, inner } = videos[0];
  check(attribute(tag, "data-cinematic-media") !== undefined, "cinematic-video-hook", "dist/index.html", "decorative video must expose data-cinematic-media");
  check(attribute(tag, "aria-hidden") === "true" && attribute(tag, "tabindex") === "-1", "cinematic-video-a11y", "dist/index.html", "decorative video must be hidden and unfocusable");
  for (const name of ["muted", "playsinline", "disablepictureinpicture"]) check(attribute(tag, name) !== undefined, "cinematic-video-a11y", "dist/index.html", `decorative video must include ${name}`);
  check(attribute(tag, "preload") === "none", "cinematic-video-preload", "dist/index.html", "SSR video must use preload=none");
  check(attribute(tag, "src") === undefined, "cinematic-video-src", "dist/index.html", "SSR video must not expose a src attribute");
  check(!/<source\b/i.test(inner), "cinematic-video-source", "dist/index.html", "SSR video must not contain source children");
  for (const name of ["autoplay", "controls", "loop"]) check(attribute(tag, name) === undefined, "cinematic-video-playback", "dist/index.html", `scroll-rendering video must not include ${name}`);
}
for (const { output } of VIDEO_ASSETS) check(!homeHtml.includes(`/media/cinematic/${output}`), "no-ssr-video-url", "dist/index.html", `SSR HTML must not disclose or preload video candidate ${output}`);
const posterPicture = elements(homeHtml, "picture").find(({ tag }) => (attribute(tag, "class") ?? "").split(/\s+/).includes("cinematic-poster"));
check(Boolean(posterPicture), "cinematic-poster", "dist/index.html", "built Home must contain the cinematic dormant poster picture");
if (posterPicture) {
  const sourcePaths = tags(posterPicture.inner, "source").map((tag) => attribute(tag, "srcset"));
  const imagePaths = tags(posterPicture.inner, "img").map((tag) => attribute(tag, "src"));
  const observed = [...sourcePaths, ...imagePaths].sort();
  const expected = POSTER_ASSETS.map(({ output }) => `/media/cinematic/${output}`).sort();
  check(sourcePaths.length === 2 && imagePaths.length === 1 && JSON.stringify(observed) === JSON.stringify(expected), "poster-inventory", "dist/index.html", "poster picture must reference exactly the three accepted dormant images", observed);
}

// Traverse the actual emitted module graph so dynamic imports count toward isolation and budgets.
const homeInitialJs = referencedJavaScript(homeHtml);
const homeJsClosure = moduleClosure(homeInitialJs, byPath);
for (const reference of homeJsClosure) check(byPath.has(reference), "module-reference", "dist/index.html", `referenced JavaScript module is missing: ${reference}`);
const cinematicChunkRecords = records.filter((record) => /\.(?:js|mjs)$/.test(record.path) && VIDEO_ASSETS.every(({ output }) => record.text.includes(`/media/cinematic/${output}`)));
check(cinematicChunkRecords.length === 1, "cinematic-runtime-chunk", "dist/_astro", `build must emit exactly one cinematic runtime chunk; observed ${cinematicChunkRecords.length}`);
const cinematicChunk = cinematicChunkRecords[0];
if (cinematicChunk) {
  check(homeJsClosure.has(cinematicChunk.path), "cinematic-home-runtime", "dist/index.html", "cinematic runtime chunk must be reachable from Home");
  for (const prohibited of [
    [/addEventListener\(["'`](?:wheel|mousewheel|touchmove|pointermove|keydown|keyup)["'`]/, "direct input interception"],
    [/\.preventDefault\(/, "event cancellation"],
    [/(?:\b(?:scrollTo|scrollBy)\(|(?:window|document\.(?:documentElement|body))\.scroll\()/, "programmatic scrolling"],
    [/\.scrollTop\s*=/, "scrollTop mutation"],
    [/\bsetInterval\(/, "queued/perpetual timeline"],
    [/\.play\(/, "linear video playback"],
    [/\b(?:ScrollTrigger|Lenis|LocomotiveScroll|gsap)\b/, "third-party/custom scroll engine"],
  ]) check(!prohibited[0].test(cinematicChunk.text), "native-scroll-authority", `dist/${cinematicChunk.path}`, `${prohibited[1]} is prohibited in the production controller`);
  check(/addEventListener\(["'`]scroll["'`][\s\S]{0,120}passive:!0/.test(cinematicChunk.text), "passive-scroll", `dist/${cinematicChunk.path}`, "production cinematic scroll listener must remain passive");
  check(/requestAnimationFrame\(/.test(cinematicChunk.text) && /ResizeObserver/.test(cinematicChunk.text), "controller-coalescing", `dist/${cinematicChunk.path}`, "production controller must retain rAF coalescing and resize invalidation");
  check(/fetch\(/.test(cinematicChunk.text) && /\.blob\(\)/.test(cinematicChunk.text) && /URL\.createObjectURL\(/.test(cinematicChunk.text) && /URL\.revokeObjectURL\(/.test(cinematicChunk.text), "seekable-media-delivery", `dist/${cinematicChunk.path}`, "production controller must turn the single selected immutable response into one lifecycle-managed seekable Blob URL");
}
const homeCssReferences = referencedStylesheets(homeHtml);
for (const reference of homeCssReferences) check(byPath.has(reference), "stylesheet-reference", "dist/index.html", `referenced stylesheet is missing: ${reference}`);
const cinematicCssRecords = [...homeCssReferences].map((reference) => byPath.get(reference)).filter((record) => record?.text.includes(".cinematic-shell"));
check(cinematicCssRecords.length === 1, "cinematic-css-bundle", "dist/index.html", `Home must reference exactly one stylesheet containing cinematic integration CSS; observed ${cinematicCssRecords.length}`);
const emittedHomeCss = [...homeCssReferences].map((reference) => byPath.get(reference)?.text ?? "").join("\n");
check(!/scroll-snap-(?:type|align|stop):/i.test(emittedHomeCss), "scroll-snap", "Home CSS output", "built Home must not use scroll snapping");
check(!/overflow-y:(?:auto|scroll)/i.test(emittedHomeCss), "nested-scroll", "Home CSS output", "built Home must not create a nested vertical scroll container");
check(!/(?:^|[;{])overflow:[^;}]*\b(?:auto|scroll)\b/i.test(emittedHomeCss), "nested-scroll", "Home CSS output", "built Home must not create an overflow shorthand scroll container");
check(!/touch-action:none/i.test(emittedHomeCss), "touch-lock", "Home CSS output", "built Home must not suppress native touch scrolling");

const supportingIsolation = {};
for (const route of SUPPORTING_ROUTES) {
  const record = byPath.get(route.output);
  const html = record?.text ?? "";
  const jsClosure = moduleClosure(referencedJavaScript(html), byPath);
  const cssReferences = referencedStylesheets(html);
  const css = [...cssReferences].map((reference) => byPath.get(reference)?.text ?? "").join("\n");
  const js = [...jsClosure].map((reference) => byPath.get(reference)?.text ?? "").join("\n");
  check(!/data-cinematic|\/media\/cinematic\/|home-cinematic|home-operating-field/.test(`${html}\n${js}`), "supporting-route-isolation", `dist/${route.output}`, `${route.path} must not load or reference cinematic/Home runtime`);
  check(!/\.cinematic-shell|\.cinematic-media|\.entry-field|\.method-field/.test(css), "supporting-style-isolation", `dist/${route.output}`, `${route.path} must not load Home-only styles`);
  const supportingSkip = tags(html, "a").find((tag) => (attribute(tag, "class") ?? "").split(/\s+/).includes("skip-link"));
  check(attribute(supportingSkip ?? "", "href") === "#main-content", "supporting-skip-target", `dist/${route.output}`, `${route.path} must retain the standard main-content skip target`);
  supportingIsolation[route.path] = { javascript: [...jsClosure].sort(), stylesheets: [...cssReferences].sort() };
}

// Exact cinematic subtree: no review derivatives, duplicate sources, or extra decoders ship.
const cinematicPrefix = "media/cinematic/";
const cinematicRecords = records.filter((record) => record.path.startsWith(cinematicPrefix));
const cloudflareHeadersRecord = byPath.get("_headers");
check(
  Boolean(cloudflareHeadersRecord?.text.match(/^\/media\/cinematic\/\*\s+Cache-Control:\s*public,\s*max-age=31556952,\s*immutable\s*$/m)),
  "cinematic-cache-policy",
  "dist/_headers",
  "Cloudflare Pages output must apply immutable caching to content-addressed cinematic assets",
);
const observedCinematic = cinematicRecords.map((record) => record.path.slice(cinematicPrefix.length)).sort();
const expectedCinematic = MEDIA_ASSETS.map(({ output }) => output).sort();
check(JSON.stringify(observedCinematic) === JSON.stringify(expectedCinematic), "cinematic-media-inventory", "dist/media/cinematic", "production output must contain exactly the seven accepted cinematic files", observedCinematic);
for (const asset of MEDIA_ASSETS) {
  const record = byPath.get(`${cinematicPrefix}${asset.output}`);
  check(Boolean(record), "cinematic-media-missing", `dist/${cinematicPrefix}${asset.output}`, "accepted cinematic production asset is missing");
  if (record) {
    check(record.contents.length === asset.bytes, "cinematic-media-bytes", `dist/${record.path}`, `asset must be exactly ${asset.bytes.toLocaleString("en-US")} bytes`, record.contents.length);
    check(sha256(record.contents) === asset.sha256, "cinematic-media-hash", `dist/${record.path}`, "asset SHA-256 must match the accepted Phase 3 authority", sha256(record.contents));
  }
}
const approvedLegacyVideo = INTENDED_PUBLIC_ASSETS.filter(({ path: assetPath }) => /\.(?:mp4|webm)$/.test(assetPath)).map(({ path: assetPath }) => assetPath);
const expectedVideoInventory = [...approvedLegacyVideo, ...VIDEO_ASSETS.map(({ output }) => `${cinematicPrefix}${output}`)].sort();
const observedVideoInventory = records.filter((record) => /\.(?:mp4|webm)$/.test(record.path)).map(({ path: recordPath }) => recordPath).sort();
check(JSON.stringify(observedVideoInventory) === JSON.stringify(expectedVideoInventory), "production-video-inventory", "dist/media", "production output must not ship unapproved video files", observedVideoInventory);
for (const record of records.filter((item) => /\.(?:mp4|webm)$/.test(item.path))) check(record.contents.length <= 25 * 1024 * 1024, "cloudflare-file-limit", `dist/${record.path}`, `individual media must remain below 25 MiB; observed ${formatBytes(record.contents.length)}`);

for (const record of records) {
  const lower = record.path.toLowerCase();
  check(!lower.endsWith(".map"), "source-map", `dist/${record.path}`, "production output must not ship source maps");
  check(!/(^|\/)(?:artifacts|evidence|review|qa|screenshots?|prototypes?)(\/|$)/i.test(record.path), "review-artifact", `dist/${record.path}`, "production output must not ship review/evidence/lab artifacts");
  check(!/\.(?:astro|tsx?|jsx|blend|blend\d+|psd|zip)$/i.test(record.path), "source-leak", `dist/${record.path}`, "production output must not ship source or transfer-package files");
  if (/\.(?:html|css|js|mjs|json|xml|txt|svg)$/.test(lower)) {
    check(!/[A-Z]:[\\/]Users[\\/]|\/(?:Users|home)\/[^/\s"'<>]+\//i.test(record.text), "private-path-leak", `dist/${record.path}`, "production text must not expose a private filesystem path");
    check(!/artifacts[\\/]original|src[\\/]scripts[\\/]home-cinematic-integration/i.test(record.text), "internal-source-leak", `dist/${record.path}`, "production text must not expose repository-internal source paths");
  }
}
for (const forbidden of ["_worker.js", "_routes.json", "server-manifest.json"]) check(!byPath.has(forbidden), "static-hosting-output", `dist/${forbidden}`, "Cloudflare Pages delivery must remain static without Worker/server output");
check(!records.some((record) => record.path.startsWith("functions/")), "static-hosting-output", "dist/functions", "Cloudflare Pages delivery must not include Functions code");

// Budgets use the accepted Phase 2B total-CSS baseline and include Home inline scripts.
const javascriptRecords = records.filter((record) => /\.(?:js|mjs)$/.test(record.path));
const cssRecords = records.filter((record) => record.path.endsWith(".css"));
const inlineHomeScripts = elements(homeHtml, "script").filter(({ tag }) => attribute(tag, "src") === undefined).map(({ inner }) => Buffer.from(inner));
const totalJavaScript = sizes([...javascriptRecords.map(({ contents }) => contents), ...inlineHomeScripts]);
const totalCss = sizes(cssRecords.map(({ contents }) => contents));
const cinematicJavaScript = sizes(cinematicChunkRecords.map(({ contents }) => contents));
const addedCssRaw = Math.max(0, totalCss.raw - ACCEPTED_PHASE2B_CSS_RAW);
check(cinematicJavaScript.raw <= 8 * 1024, "cinematic-js-budget", "dist/_astro", `Phase 4 cinematic runtime must remain at or below 8 KiB raw; observed ${formatBytes(cinematicJavaScript.raw)}`);
check(cinematicJavaScript.gzip <= 3.5 * 1024, "cinematic-js-gzip-budget", "dist/_astro", `Phase 4 cinematic runtime must remain at or below 3.5 KiB gzip; observed ${formatBytes(cinematicJavaScript.gzip)}`);
check(totalJavaScript.raw <= 20 * 1024, "total-js-budget", "dist/_astro + Home inline scripts", `total production JavaScript must remain at or below 20 KiB raw; observed ${formatBytes(totalJavaScript.raw)}`);
check(totalJavaScript.gzip <= 8 * 1024, "total-js-gzip-budget", "dist/_astro + Home inline scripts", `total production JavaScript must remain at or below 8 KiB gzip; observed ${formatBytes(totalJavaScript.gzip)}`);
check(addedCssRaw <= 15 * 1024, "phase4-css-budget", "dist/_astro", `CSS added above the accepted Phase 2B baseline must remain at or below 15 KiB raw; observed ${formatBytes(addedCssRaw)}`);
check(totalCss.raw <= ACCEPTED_PHASE2B_CSS_RAW + 15 * 1024, "total-css-budget", "dist/_astro", `total CSS must remain within the accepted Phase 2B baseline plus 15 KiB; observed ${formatBytes(totalCss.raw)}`);
check(totalCss.gzip <= 20 * 1024, "total-css-gzip-budget", "dist/_astro", `total CSS must remain at or below 20 KiB gzip; observed ${formatBytes(totalCss.gzip)}`);

if (failures.length > 0) {
  console.error(`Phase 4 output verification failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) {
    console.error(`- [${failure.code}] ${failure.location}: ${failure.message}`);
    if (failure.details !== undefined) console.error(`  ${JSON.stringify(failure.details)}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Verified Phase 4 output: seven ordered Home chapters, one inert SSR video, exact seven-file cinematic inventory, isolated supporting routes, and realistic bundles (cinematic JS ${formatBytes(cinematicJavaScript.raw)} raw/${formatBytes(cinematicJavaScript.gzip)} gzip; total JS ${formatBytes(totalJavaScript.raw)} raw/${formatBytes(totalJavaScript.gzip)} gzip; CSS delta ${formatBytes(addedCssRaw)}).`);
}
