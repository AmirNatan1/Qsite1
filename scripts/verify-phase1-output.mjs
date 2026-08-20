import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

import {
  ALL_HTML_ROUTES,
  CANONICAL_ORIGIN,
  INTENDED_PUBLIC_ASSETS,
  INTERNAL_PROVENANCE_KEYS,
  NAVIGATION,
  NOT_FOUND_ROUTE,
  PHASE1_ROUTES,
  PROHIBITED_PUBLIC_PATTERNS,
  PUBLIC_TEXT_EXTENSIONS,
  SOURCE_LIKE_PATHS,
} from "./phase1-qa-config.mjs";

const root = process.cwd();
const outputRoot = path.join(root, "dist");
const reportPath = path.join(root, "artifacts", "evidence", "phase-1", "phase-1-build-report.json");
const supportingRoutesOnly = process.argv.includes("--supporting-routes-only");
const noWrite = process.argv.includes("--no-write") || supportingRoutesOnly;
const failures = [];

function relativeToRoot(absolute) {
  return path.relative(root, absolute).replaceAll("\\", "/");
}

function relativeToOutput(absolute) {
  return path.relative(outputRoot, absolute).replaceAll("\\", "/");
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

function check(condition, code, location, message, details = undefined) {
  if (!condition) failures.push({ code, location, message, ...(details === undefined ? {} : { details }) });
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

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`(?:^|\\s)${escaped}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, "i"));
  if (!match) return undefined;
  return decodeHtml(match[1] ?? match[2] ?? match[3] ?? "");
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

function visibleText(value) {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function metaContent(html, selectorName, selectorValue) {
  const element = tags(html, "meta").find((tag) => attribute(tag, selectorName)?.toLowerCase() === selectorValue.toLowerCase());
  return element ? attribute(element, "content") : undefined;
}

function canonicalHref(html) {
  const element = tags(html, "link").find((tag) => (attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"));
  return element ? attribute(element, "href") : undefined;
}

function normalizedRoutePath(value) {
  if (value === "/") return "/";
  return value.endsWith("/") ? value : `${value}/`;
}

function sameNavigation(actual) {
  return actual.length === NAVIGATION.length && actual.every((item, index) => item.label === NAVIGATION[index].label && item.path === NAVIGATION[index].path);
}

function anchors(block) {
  return elements(block, "a").map(({ tag, inner }) => ({
    path: attribute(tag, "href"),
    label: visibleText(inner),
    current: attribute(tag, "aria-current"),
  }));
}

function primaryNavigation(html, label) {
  const nav = elements(html, "nav").find(({ tag }) => attribute(tag, "aria-label") === label);
  return nav ? anchors(nav.inner) : null;
}

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function byteSummary(buffers) {
  return {
    raw: buffers.reduce((total, buffer) => total + buffer.length, 0),
    gzip: buffers.reduce((total, buffer) => total + gzipSync(buffer, { level: 9 }).length, 0),
  };
}

function extractReferencedPaths(textFiles) {
  const references = new Set();
  for (const { contents } of textFiles) {
    for (const match of contents.matchAll(/(?:src|href|poster)\s*=\s*["'](\/[^"'#?]+)|url\(\s*["']?(\/[^"')?#]+)/gi)) {
      references.add(decodeHtml(match[1] ?? match[2]).replace(/^\//, ""));
    }
  }
  return references;
}

const report = {
  schema: "quantum-hub.phase-1.static-build-qa.v1",
  generatedAt: new Date().toISOString(),
  canonicalOrigin: CANONICAL_ORIGIN,
  passed: false,
  routes: [],
  navigation: { entries: NAVIGATION.length },
  sitemap: { routes: [] },
  assets: { governed: INTENDED_PUBLIC_ASSETS.length, files: [] },
  sizes: {},
  privacyProbes: SOURCE_LIKE_PATHS,
  editorialReview: { routesReviewed: 0, findings: [] },
  failures,
};

let outputFiles = [];
if (!(await exists(outputRoot))) {
  check(false, "dist-missing", "dist", "production output is missing; run the Astro build first");
} else {
  outputFiles = await walk(outputRoot);
}

const relativeFiles = outputFiles.map(relativeToOutput).sort();
const htmlFiles = relativeFiles.filter((file) => file.endsWith(".html"));
const expectedHtmlFiles = ALL_HTML_ROUTES.map(({ output }) => output).sort();
check(
  htmlFiles.length === expectedHtmlFiles.length && htmlFiles.every((file, index) => file === expectedHtmlFiles[index]),
  "html-route-set",
  "dist",
  `expected exactly ${expectedHtmlFiles.join(", ")}; observed ${htmlFiles.join(", ")}`,
);

const routeHtml = new Map();
const documentTitles = new Set();
for (const route of ALL_HTML_ROUTES) {
  const absolute = path.join(outputRoot, route.output);
  if (!(await exists(absolute))) {
    check(false, "route-output-missing", route.output, `missing built output for ${route.path}`);
    continue;
  }
  const html = await readFile(absolute, "utf8");
  routeHtml.set(route.path, html);

  const mainCount = tags(html, "main").length;
  const h1Count = tags(html, "h1").length;
  const headingLevels = [...html.matchAll(/<h([1-6])\b/gi)].map((match) => Number(match[1]));
  const headingJumps = headingLevels.flatMap((level, index) => index > 0 && level > headingLevels[index - 1] + 1
    ? [{ previous: headingLevels[index - 1], next: level, index }]
    : []);
  check(mainCount === 1, "main-count", route.path, `expected one main landmark; observed ${mainCount}`);
  check(h1Count === 1, "h1-count", route.path, `expected one H1; observed ${h1Count}`);
  check(headingLevels[0] === 1, "heading-order", route.path, "the first document heading must be H1");
  check(headingJumps.length === 0, "heading-order", route.path, "heading levels must not skip downward", headingJumps);
  if (!(supportingRoutesOnly && route.path === "/")) {
    check(tags(html, "header").length === 1, "header-count", route.path, "expected one semantic header");
  }
  check(tags(html, "footer").length === 1, "footer-count", route.path, "expected one semantic footer");

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? visibleText(titleMatch[1]) : "";
  const description = metaContent(html, "name", "description");
  const robots = metaContent(html, "name", "robots");
  const ogTitle = metaContent(html, "property", "og:title");
  const ogDescription = metaContent(html, "property", "og:description");
  const ogUrl = metaContent(html, "property", "og:url");
  const canonical = canonicalHref(html);
  const expectedCanonical = new URL(route.path === NOT_FOUND_ROUTE.path ? "/404/" : route.path, CANONICAL_ORIGIN).toString();
  check(title.length > 0, "metadata-title", route.path, "title is missing or empty");
  check(description?.trim().length > 0, "metadata-description", route.path, "meta description is missing or empty");
  check(ogTitle === title, "metadata-og-title", route.path, "Open Graph title must equal the document title");
  check(ogDescription === description, "metadata-og-description", route.path, "Open Graph description must equal the meta description");
  if (route === NOT_FOUND_ROUTE) {
    check(/\bnoindex\b/i.test(robots ?? ""), "metadata-robots", route.path, "404 must be noindex");
    check(canonical === undefined, "metadata-canonical", route.path, "404 must not emit a canonical URL");
    check(ogUrl === undefined, "metadata-og-url", route.path, "404 must not emit an Open Graph URL");
  } else {
    check((robots ?? "").toLowerCase() === "index, follow", "metadata-robots", route.path, "launch route must emit index, follow");
    check(canonical === expectedCanonical, "metadata-canonical", route.path, `canonical must be ${expectedCanonical}`);
    check(ogUrl === expectedCanonical, "metadata-og-url", route.path, `Open Graph URL must be ${expectedCanonical}`);
  }
  if (title) {
    check(!documentTitles.has(title), "metadata-title-unique", route.path, `duplicate document title: ${title}`);
    documentTitles.add(title);
  }

  for (const navLabel of ["Primary navigation", "Mobile navigation"]) {
    const navigation = primaryNavigation(html, navLabel);
    check(navigation !== null, "navigation-missing", route.path, `${navLabel} is missing`);
    if (navigation) {
      check(sameNavigation(navigation), "navigation-contract", route.path, `${navLabel} labels or paths differ from the public contract`, navigation);
      const current = navigation.filter(({ current }) => current === "page");
      const expectedCurrent = route.navPath;
      check(
        expectedCurrent === null ? current.length === 0 : current.length === 1 && current[0].path === expectedCurrent,
        "navigation-current",
        route.path,
        `${navLabel} must identify ${expectedCurrent ?? "no route"} as current`,
        current,
      );
    }
  }

  report.routes.push({
    path: route.path,
    output: route.output,
    bytes: Buffer.byteLength(html),
    gzipBytes: gzipSync(Buffer.from(html), { level: 9 }).length,
    mainCount,
    h1Count,
    headings: headingLevels,
    title,
    description,
    robots,
    canonical: canonical ?? null,
  });
}

check(documentTitles.size === ALL_HTML_ROUTES.length, "metadata-title-set", "dist", "every route must have a unique title");
check(
  visibleText(routeHtml.get("/") ?? "").includes("Maradin — Dynamic Ground Projection"),
  "home-proof-title",
  "/",
  "Home must visibly include the exact approved Maradin proof title",
);

const homeHtml = routeHtml.get("/") ?? "";
const expectedHomeScenes = ["entry", "built-with-industry", "method", "industries", "proof", "programmes", "conversion"];
const homeSceneSections = tags(homeHtml, "section")
  .map((tag) => ({
    identity: attribute(tag, "data-home-scene"),
    id: attribute(tag, "id"),
    labelledBy: attribute(tag, "aria-labelledby"),
  }))
  .filter(({ identity }) => identity !== undefined);
check(
  homeSceneSections.length === expectedHomeScenes.length && homeSceneSections.every(({ identity }, index) => identity === expectedHomeScenes[index]),
  "home-scene-order",
  "/",
  `Home must expose the exact ordered scene identities: ${expectedHomeScenes.join(", ")}`,
  homeSceneSections,
);
const homeIds = new Set([...homeHtml.matchAll(/\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)].map((match) => decodeHtml(match[1] ?? match[2])));
for (const scene of homeSceneSections) {
  check(Boolean(scene.id), "home-scene-id", "/", `Home scene ${scene.identity} is missing a stable id`);
  check(Boolean(scene.labelledBy) && homeIds.has(scene.labelledBy), "home-scene-label", "/", `Home scene ${scene.identity} has no valid accessible label target`);
}
check(new Set(homeSceneSections.map(({ id }) => id)).size === homeSceneSections.length, "home-scene-id", "/", "Home scene ids must be unique");
if (!supportingRoutesOnly) {
  check(/data-scene=["']threshold["']/i.test(homeHtml), "home-threshold", "/", "Home must expose the static threshold marker");
  check(/class=["'][^"']*\bfield-aperture\b/i.test(homeHtml), "home-static-aperture", "/", "Home must include the static rectangular field aperture");
  check(!/signal-field|current-signal|\bradar\b|\bscanner\b|\bconcentric\b/i.test(homeHtml), "home-rejected-visual", "/", "Home contains rejected or unapproved scene language");
}

const editorialConcepts = [
  { id: "verification-caveat", pattern: /\b(?:unverified|non-public|provenance)\b/gi },
  { id: "interface-note", pattern: /\binteractive filters?\b/gi },
  { id: "implementation-status", pattern: /\b(?:collecting|transmitting|will be added)\b/gi },
  { id: "logo-wall", pattern: /\blogo wall\b/gi },
  { id: "internal-governance", pattern: /\binternal\b/gi },
  { id: "implementation-note", pattern: /\bimplementation (?:note|status)\b/gi },
  { id: "review-note", pattern: /\breview (?:note|status)\b/gi },
  { id: "publication-status", pattern: /\bpublication(?:-| )status\b/gi },
  { id: "placeholder-wording", pattern: /\bplaceholder\b/gi },
];
for (const route of ALL_HTML_ROUTES) {
  const publicText = visibleText(routeHtml.get(route.path) ?? "");
  report.editorialReview.routesReviewed += 1;
  for (const concept of editorialConcepts) {
    concept.pattern.lastIndex = 0;
    for (const match of publicText.matchAll(concept.pattern)) {
      const start = Math.max(0, match.index - 55);
      const end = Math.min(publicText.length, match.index + match[0].length + 55);
      const finding = {
        route: route.path,
        concept: concept.id,
        match: match[0],
        context: publicText.slice(start, end),
      };
      report.editorialReview.findings.push(finding);
      check(false, "public-editorial-leakage", route.path, `visitor-facing ${concept.id} language requires editorial review`, finding);
    }
  }
}

const sitemapPath = path.join(outputRoot, "sitemap.xml");
if (!(await exists(sitemapPath))) {
  check(false, "sitemap-missing", "sitemap.xml", "sitemap output is missing");
} else {
  const sitemap = await readFile(sitemapPath, "utf8");
  const locations = [...sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeHtml(match[1].trim()));
  const expectedLocations = PHASE1_ROUTES.map(({ path: routePath }) => new URL(routePath, CANONICAL_ORIGIN).toString());
  check(
    locations.length === expectedLocations.length && locations.every((location, index) => location === expectedLocations[index]),
    "sitemap-route-set",
    "sitemap.xml",
    "sitemap must contain the exact nine canonical launch routes in manifest order",
    { expected: expectedLocations, actual: locations },
  );
  check(!locations.some((location) => /\/404\/?$/.test(location)), "sitemap-404", "sitemap.xml", "404 must not appear in the sitemap");
  report.sitemap.routes = locations;
}

const robotsPath = path.join(outputRoot, "robots.txt");
if (!(await exists(robotsPath))) {
  check(false, "robots-missing", "robots.txt", "robots output is missing");
} else {
  const robots = await readFile(robotsPath, "utf8");
  check(/^User-agent:\s*\*/im.test(robots), "robots-agent", "robots.txt", "robots must address all user agents");
  check(/^Allow:\s*\/$/im.test(robots), "robots-allow", "robots.txt", "robots must allow the public root");
  check(
    new RegExp(`^Sitemap:\\s*${CANONICAL_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/sitemap\\.xml$`, "im").test(robots),
    "robots-sitemap",
    "robots.txt",
    "robots must point to the canonical sitemap",
  );
}

const knownRoutes = new Set(ALL_HTML_ROUTES.map(({ path: routePath }) => routePath));
const routeIds = new Map();
for (const [routePath, html] of routeHtml) {
  routeIds.set(routePath, new Set([...html.matchAll(/\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)].map((match) => decodeHtml(match[1] ?? match[2]))));
}

for (const [routePath, html] of routeHtml) {
  for (const { tag } of elements(html, "a")) {
    const href = attribute(tag, "href");
    check(href !== undefined && href.trim().length > 0 && href !== "#", "empty-link", routePath, "anchor has an empty destination");
    if (!href || href === "#") continue;
    let destination;
    try {
      destination = new URL(href, new URL(routePath, CANONICAL_ORIGIN));
    } catch {
      check(false, "invalid-link", routePath, `anchor has an invalid destination: ${href}`);
      continue;
    }
    if (!["http:", "https:"].includes(destination.protocol)) continue;
    if (destination.origin !== CANONICAL_ORIGIN) continue;
    const destinationPath = normalizedRoutePath(destination.pathname);
    check(knownRoutes.has(destinationPath), "dead-internal-link", routePath, `internal link targets unpublished route ${destination.pathname}`);
    if (!knownRoutes.has(destinationPath) || !destination.hash) continue;
    const fragment = decodeURIComponent(destination.hash.slice(1));
    check(routeIds.get(destinationPath)?.has(fragment), "dead-fragment", routePath, `fragment #${fragment} is missing from ${destinationPath}`);
  }
}

for (const probe of SOURCE_LIKE_PATHS) {
  const relativeProbe = probe.replace(/^\/+/, "");
  const direct = path.join(outputRoot, relativeProbe);
  const directoryIndex = path.join(outputRoot, relativeProbe, "index.html");
  check(!(await exists(direct)) && !(await exists(directoryIndex)), "source-like-output", probe, "source-like/private path exists in static output");
}
for (const redirectFile of ["_redirects", "_routes.json"]) {
  const absolute = path.join(outputRoot, redirectFile);
  if (!(await exists(absolute))) continue;
  const contents = await readFile(absolute, "utf8");
  check(!/\/\*\s+\/index\.html\s+200/i.test(contents), "spa-fallback", redirectFile, "SPA fallback would mask true 404 responses");
}

const textFiles = [];
for (const file of outputFiles) {
  const extension = path.extname(file).toLowerCase();
  if (!PUBLIC_TEXT_EXTENSIONS.has(extension)) continue;
  const contents = await readFile(file, "utf8");
  const filePath = relativeToOutput(file);
  textFiles.push({ filePath, contents });
  for (const { id, pattern } of PROHIBITED_PUBLIC_PATTERNS) {
    check(!pattern.test(contents), `prohibited-${id}`, filePath, `prohibited public pattern detected: ${id}`);
  }
  for (const key of INTERNAL_PROVENANCE_KEYS.filter((value) => value !== "active")) {
    check(!new RegExp(`\\b${key}\\b`).test(contents), "provenance-leak", filePath, `internal publication/provenance field leaked: ${key}`);
  }
}

for (const { path: routePath, output } of ALL_HTML_ROUTES) {
  const html = routeHtml.get(routePath);
  if (!html) continue;
  check(!/<\s*form\b/i.test(html), "public-form", output, "public forms are prohibited");
  check(!/<\s*(?:input|textarea|select)\b/i.test(html), "public-form-control", output, "public form controls are prohibited");
  check(!/<\s*meter\b|data-(?:content-)?type=["']metric["']|class=["'][^"']*\bmetrics?\b/i.test(html), "public-metric", output, "public metric surface is prohibited");
}

for (const filePath of relativeFiles) {
  check(!/\.map$/i.test(filePath), "source-map", filePath, "source maps are not intended public output");
  check(!/\.(?:blend\d*|glb|gltf|webm|mov|mkv)$/i.test(filePath), "cinematic-file", filePath, "cinematic/source asset format is prohibited");
  check(!/(?:^|\/)(?:docs|artifacts|planning|evidence|prototypes?|review)(?:\/|$)/i.test(filePath), "internal-output", filePath, "planning, evidence, prototype, or review material leaked into output");
  check(
    !/(?:^|[-_/])(?:crt|spiral|cinematic|field-unit|proving-ground|aperture-station)(?:[-_.\/]|$)/i.test(filePath),
    "cinematic-file",
    filePath,
    "Phase 0 cinematic asset leaked into Phase 1 output",
  );
}

const publicRoot = path.join(root, "public");
const publicFiles = await walk(publicRoot);
const actualPublicPaths = publicFiles.map((file) => path.relative(publicRoot, file).replaceAll("\\", "/")).sort();
const governedPaths = INTENDED_PUBLIC_ASSETS.map(({ path: assetPath }) => assetPath).sort();
check(
  actualPublicPaths.length === governedPaths.length && actualPublicPaths.every((file, index) => file === governedPaths[index]),
  "public-asset-governance",
  "public",
  "public tree and governed asset manifest differ",
  { governed: governedPaths, actual: actualPublicPaths },
);

const references = extractReferencedPaths(textFiles);
for (const asset of INTENDED_PUBLIC_ASSETS) {
  const sourcePath = path.join(publicRoot, asset.path);
  const builtPath = path.join(outputRoot, asset.path);
  const sourceExists = await exists(sourcePath);
  const builtExists = await exists(builtPath);
  check(sourceExists, "governed-source-asset", `public/${asset.path}`, "governed source asset is missing");
  check(builtExists, "governed-built-asset", asset.path, "governed asset is missing from static output");
  let bytes = null;
  let sha256 = null;
  if (sourceExists && builtExists) {
    const [source, built] = await Promise.all([readFile(sourcePath), readFile(builtPath)]);
    bytes = built.length;
    sha256 = hash(built);
    check(source.equals(built), "governed-asset-copy", asset.path, "built asset differs byte-for-byte from public source");
    check(bytes === asset.bytes, "governed-asset-bytes", asset.path, "governed public asset differs from its frozen byte count", {
      expected: asset.bytes,
      actual: bytes,
    });
    check(sha256 === asset.sha256, "governed-asset-hash", asset.path, "governed public asset differs from its frozen SHA-256", {
      expected: asset.sha256,
      actual: sha256,
    });
  }
  if (!asset.allowUnreferenced) {
    check(references.has(asset.path), "unreferenced-public-asset", asset.path, "asset is governed as required but is not referenced by built public text");
  }
  report.assets.files.push({ ...asset, bytes, sha256, referenced: references.has(asset.path) });
}

const expectedStaticPaths = new Set([
  ...ALL_HTML_ROUTES.map(({ output }) => output),
  "robots.txt",
  "sitemap.xml",
  ...INTENDED_PUBLIC_ASSETS.map(({ path: assetPath }) => assetPath),
]);
for (const filePath of relativeFiles) {
  const isGeneratedBundle = filePath.startsWith("_astro/") && /\.(?:css|js|mjs)$/.test(filePath);
  check(expectedStaticPaths.has(filePath) || isGeneratedBundle, "unexpected-output-file", filePath, "file is not part of the governed static-output contract");
}

const fileRecords = await Promise.all(outputFiles.map(async (file) => {
  const contents = await readFile(file);
  return {
    path: relativeToOutput(file),
    contents,
    bytes: contents.length,
    gzipBytes: gzipSync(contents, { level: 9 }).length,
  };
}));
const cssRecords = fileRecords.filter(({ path: filePath }) => filePath.endsWith(".css"));
const jsRecords = fileRecords.filter(({ path: filePath }) => /\.(?:js|mjs)$/.test(filePath));
const inlineScripts = [];
for (const route of ALL_HTML_ROUTES) {
  const html = routeHtml.get(route.path);
  if (!html) continue;
  for (const script of elements(html, "script")) {
    if (attribute(script.tag, "src") === undefined && script.inner.trim()) {
      inlineScripts.push({ route: route.path, contents: Buffer.from(script.inner) });
    }
  }
}
const rootInlineScripts = inlineScripts.filter(({ route }) => route === "/").map(({ contents }) => contents);
const externalJsBuffers = jsRecords.map(({ contents }) => contents);
const cssBuffers = cssRecords.map(({ contents }) => contents);
const outputBuffers = fileRecords.map(({ contents }) => contents);
const largest = [...fileRecords].sort((left, right) => right.bytes - left.bytes)[0] ?? null;

report.sizes = {
  javascript: {
    external: byteSummary(externalJsBuffers),
    inlineAllRoutes: byteSummary(inlineScripts.map(({ contents }) => contents)),
    total: byteSummary([...externalJsBuffers, ...inlineScripts.map(({ contents }) => contents)]),
    rootInitial: byteSummary([...externalJsBuffers, ...rootInlineScripts]),
  },
  css: byteSummary(cssBuffers),
  output: byteSummary(outputBuffers),
  largestAsset: largest ? { path: largest.path, bytes: largest.bytes, gzipBytes: largest.gzipBytes } : null,
  fileCount: fileRecords.length,
};

report.passed = failures.length === 0;

if (!noWrite) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  const temporaryPath = `${reportPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporaryPath, reportPath);
}

if (failures.length > 0) {
  console.error(`Phase 1 output verification failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) {
    console.error(`- [${failure.code}] ${failure.location}: ${failure.message}`);
  }
  if (!noWrite) console.error(`Machine report: ${relativeToRoot(reportPath)}`);
  process.exitCode = 1;
} else {
  const formatBytes = (value) => `${value.toLocaleString("en-US")} B`;
  console.log(
    `Verified Phase 1 ${supportingRoutesOnly ? "supporting-route " : ""}output: ${PHASE1_ROUTES.length} routes + 404, ${fileRecords.length} files, ` +
      `JS ${formatBytes(report.sizes.javascript.total.raw)} raw/${formatBytes(report.sizes.javascript.total.gzip)} gzip, ` +
      `CSS ${formatBytes(report.sizes.css.raw)} raw/${formatBytes(report.sizes.css.gzip)} gzip, ` +
      `output ${formatBytes(report.sizes.output.raw)} raw.`,
  );
  if (largest) console.log(`Largest production asset: ${largest.path} (${formatBytes(largest.bytes)}).`);
  if (!noWrite) console.log(`Machine report: ${relativeToRoot(reportPath)}`);
}
