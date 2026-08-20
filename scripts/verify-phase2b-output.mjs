import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { ALL_HTML_ROUTES, PUBLIC_INDUSTRY_NAMES } from "./phase1-qa-config.mjs";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const REPORT_PATH = path.join(ROOT, "artifacts", "evidence", "phase-2b", "phase-2b-build-report.json");
const NO_WRITE = process.argv.includes("--no-write");
const HOME_CHAPTERS = Object.freeze([
  { id: "entry", label: "home-title", heading: "h1" },
  { id: "built-with-industry", label: "industry-model-title", heading: "h2" },
  { id: "method", label: "method-title", heading: "h2" },
  { id: "industries", label: "industries-title", heading: "h2" },
  { id: "proof", label: "proof-title", heading: "h2" },
  { id: "programmes", label: "programmes-title", heading: "h2" },
  { id: "conversion", label: "conversion-title", heading: "h2" },
]);
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

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function bytes(buffers) {
  return {
    raw: buffers.reduce((total, buffer) => total + buffer.length, 0),
    gzip: buffers.reduce((total, buffer) => total + gzipSync(buffer, { level: 9 }).length, 0),
  };
}

function formatBytes(value) {
  return `${value.toLocaleString("en-US")} B`;
}

function referencedJavaScript(html) {
  const references = new Set();
  for (const tag of tags(html, "script")) {
    const src = attribute(tag, "src");
    if (src && !/^https?:/i.test(src)) references.add(src.replace(/^\//, ""));
  }
  for (const match of html.matchAll(/["'](\/?_astro\/[^"']+\.(?:js|mjs))["']/gi)) references.add(match[1].replace(/^\//, ""));
  return references;
}

function referencedStylesheets(html) {
  return new Set(tags(html, "link")
    .filter((tag) => (attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("stylesheet"))
    .map((tag) => attribute(tag, "href"))
    .filter((href) => href && !/^https?:/i.test(href))
    .map((href) => href.replace(/^\//, "")));
}

const report = {
  schema: "quantum-hub.phase-2b.static-build-qa.v1",
  generatedAt: new Date().toISOString(),
  passed: false,
  chapters: HOME_CHAPTERS.map(({ id }) => id),
  sizes: {},
  isolation: {},
  failures,
};

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

const homeRecord = byPath.get("index.html");
const homeHtml = homeRecord?.text ?? "";
check(Boolean(homeRecord), "home-output", "dist/index.html", "built Home output is missing");
const homeText = normalized(visibleText(homeHtml));
const titleText = normalized(visibleText(homeHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
check(titleText === "Industrial innovation tested in the real world | Quantum", "home-metadata-title", "/", "accepted Home document title changed", titleText);
check(tags(homeHtml, "h1").length === 1, "home-h1-count", "/", `Home must emit exactly one H1; observed ${tags(homeHtml, "h1").length}`);
const h1 = elements(homeHtml, "h1")[0];
check(normalized(visibleText(h1?.inner ?? "")).toUpperCase() === "WHERE DO YOU ENTER?", "entry-h1", "/", "WHERE DO YOU ENTER? must be the first settled semantic H1");

const sections = tags(homeHtml, "section")
  .map((tag) => ({
    identity: attribute(tag, "data-home-scene"),
    id: attribute(tag, "id"),
    labelledBy: attribute(tag, "aria-labelledby"),
  }))
  .filter(({ identity }) => identity !== undefined);
check(
  sections.length === HOME_CHAPTERS.length && sections.every(({ identity, id }, index) => identity === HOME_CHAPTERS[index].id && id === HOME_CHAPTERS[index].id),
  "home-chapter-order",
  "/",
  `Home must expose exactly ${HOME_CHAPTERS.map(({ id }) => id).join(" -> ")}`,
  sections,
);
const allIds = new Set([...homeHtml.matchAll(/\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)].map((match) => decodeHtml(match[1] ?? match[2])));
for (const chapter of HOME_CHAPTERS) {
  const section = sections.find(({ id }) => id === chapter.id);
  check(section?.labelledBy === chapter.label && allIds.has(chapter.label), "home-chapter-label", `/#${chapter.id}`, `chapter must be labelled by ${chapter.label}`);
  const heading = elements(homeHtml, chapter.heading).find(({ tag }) => attribute(tag, "id") === chapter.label);
  check(Boolean(heading), "home-chapter-heading", `/#${chapter.id}`, `chapter must emit its ${chapter.heading.toUpperCase()} label target`);
}

const requiredPublicCopy = Object.freeze([
  "Bring us an operational challenge.",
  "Bring us a technology ready to be tested.",
  "Quantum works from a defined industrial need. The operating context, constraints and success criteria shape which technologies are relevant and how a POC should be designed.",
  "Industry relationships anchor the work in real environments rather than abstract technology scouting.",
  "Technology is assessed against the challenge, then tested through a structured path that produces evidence for a responsible next step.",
  "Define the operational problem, owner and success criteria.",
  "Find technologies relevant to the real operating context.",
  "Evaluate technical, commercial and implementation fit.",
  "Run a structured POC in a real environment.",
  "Use evidence to determine the next step.",
  "Programmes create a clear context for industry needs and technologies that are ready to be assessed.",
]);
for (const copy of requiredPublicCopy) {
  check(homeText.includes(normalized(copy)), "home-public-copy", "/", `accepted public copy is missing: ${copy}`);
}
for (const stage of ["Frame", "Source", "Assess", "Test", "Decide"]) {
  const headingCount = elements(homeHtml, "h3").filter(({ inner }) => normalized(visibleText(inner)) === stage).length;
  check(headingCount === 1, "method-stage", "/#method", `METHOD must expose ${stage} exactly once; observed ${headingCount}`);
}
for (const industry of PUBLIC_INDUSTRY_NAMES) {
  check(homeText.includes(normalized(industry)), "industry-territory", "/#industries", `approved territory is missing: ${industry}`);
}
for (const proofText of [
  "Maradin - Dynamic Ground Projection",
  "A real-world field test of Maradin’s MEMS-based laser scanning technology for vehicle-to-road visual communication.",
]) {
  check(homeText.includes(normalized(proofText)), "proof-content", "/#proof", `approved Maradin content is missing: ${proofText}`);
}
for (const programme of ["SPARK", "CHAMP"]) check(homeText.includes(programme), "programme-content", "/#programmes", `${programme} must remain visible`);
check(!/Prove it where it has to work\./i.test(homeText), "portal-interruption-copy", "/", "the secondary proposition must not interrupt the portal handoff as another Home overture");

const anchors = elements(homeHtml, "a").map(({ tag, inner }) => ({ href: attribute(tag, "href"), text: normalized(visibleText(inner)) }));
for (const expected of [
  { href: "/for-partners/", text: "Bring us an operational challenge." },
  { href: "/for-startups/", text: "Bring us a technology ready to be tested." },
  { href: "/industries/", text: "Explore the industries" },
  { href: "/pocs/maradin/", text: "Read the Maradin field record" },
  { href: "/contact/#for-industry", text: "Bring us an industrial challenge" },
  { href: "/contact/#for-startups", text: "Introduce your technology" },
  { href: "/contact/#general", text: "General or ecosystem" },
]) {
  check(anchors.some(({ href, text }) => href === expected.href && text.includes(expected.text)), "home-route", "/", `Home is missing ${expected.text} -> ${expected.href}`);
}

for (const asset of [
  "media/maradin/maradin-field-aperture-poster-approved.jpg",
  "media/maradin/maradin-real-field-still-approved.jpg",
]) {
  check(homeHtml.includes(`/${asset}`), "proof-still", "/#proof", `Home must reference approved still ${asset}`);
}
check(!/<video\b/i.test(homeHtml), "poster-first", "/#proof", "Phase 2B Home must remain poster-first without eagerly loading Maradin video");

const cssRecords = records.filter(({ path: filePath }) => filePath.endsWith(".css"));
const jsRecords = records.filter(({ path: filePath }) => /\.(?:js|mjs)$/.test(filePath));
const homeInlineScripts = elements(homeHtml, "script")
  .filter(({ tag, inner }) => attribute(tag, "src") === undefined && inner.trim())
  .map(({ inner }, index) => ({ path: `index.html#inline-${index + 1}`, contents: Buffer.from(inner), text: inner }));
const allJavascript = [
  ...jsRecords.map(({ path: filePath, contents, text }) => ({ path: filePath, contents, text })),
  ...homeInlineScripts,
];
const phase2bRuntime = allJavascript.filter(({ text }) => /data-field-section|data-method-section|method-progress|operatingField/i.test(text));
const homeReferencedJs = referencedJavaScript(homeHtml);
const initialHomeJavaScript = [
  ...homeInlineScripts,
  ...jsRecords.filter(({ path: filePath }) => homeReferencedJs.has(filePath)),
];
const totalJsSize = bytes(jsRecords.map(({ contents }) => contents));
const homeInlineSize = bytes(homeInlineScripts.map(({ contents }) => contents));
const initialHomeSize = bytes(initialHomeJavaScript.map(({ contents }) => contents));
const phase2bSize = bytes(phase2bRuntime.map(({ contents }) => contents));
const cssSize = bytes(cssRecords.map(({ contents }) => contents));
check(phase2bRuntime.length > 0, "phase2b-runtime", "dist/_astro", "could not identify the built Phase 2B Home controller");
check(phase2bSize.raw <= 12 * 1024, "phase2b-js-budget", "dist/_astro", `Phase 2B runtime must be <= 12 KB raw; observed ${formatBytes(phase2bSize.raw)}`);
check(totalJsSize.raw + homeInlineSize.raw <= 25 * 1024, "total-js-budget", "dist", `total production JS must be <= 25 KB raw; observed ${formatBytes(totalJsSize.raw + homeInlineSize.raw)}`);
check(totalJsSize.gzip + homeInlineSize.gzip <= 8 * 1024, "total-js-budget", "dist", `total production JS should be <= 8 KB gzip; observed ${formatBytes(totalJsSize.gzip + homeInlineSize.gzip)}`);
check(cssSize.raw <= 50 * 1024, "css-budget", "dist/_astro", `total production CSS must be <= 50 KB raw; observed ${formatBytes(cssSize.raw)}`);
check(cssSize.gzip <= 12 * 1024, "css-budget", "dist/_astro", `total production CSS should be <= 12 KB gzip; observed ${formatBytes(cssSize.gzip)}`);

const runtimePaths = new Set(phase2bRuntime.map(({ path: filePath }) => filePath));
const homeCssPaths = new Set(cssRecords.filter(({ text }) => /\.entry-field\b/.test(text) && /\.method-field\b/.test(text)).map(({ path: filePath }) => filePath));
check(homeCssPaths.size > 0, "phase2b-styles", "dist/_astro", "could not identify the built Phase 2B Home stylesheet");
const supportingIsolation = [];
for (const route of ALL_HTML_ROUTES.filter(({ path: routePath }) => routePath !== "/")) {
  const html = byPath.get(route.output)?.text ?? "";
  const references = referencedJavaScript(html);
  const stylesheets = referencedStylesheets(html);
  const leaked = [...references].filter((reference) => runtimePaths.has(reference));
  const leakedStyles = [...stylesheets].filter((reference) => homeCssPaths.has(reference));
  check(leaked.length === 0, "supporting-runtime-isolation", route.path, "supporting route must not load the Phase 2B Home controller", leaked);
  check(leakedStyles.length === 0, "supporting-style-isolation", route.path, "supporting route must not load Phase 2B Home styles", leakedStyles);
  check(!/data-home-scene|data-method-section|home-operating-field/.test(html), "supporting-markup-isolation", route.path, "supporting route contains Phase 2B Home hooks");
  supportingIsolation.push({ route: route.path, referencedJavaScript: [...references].sort(), referencedStylesheets: [...stylesheets].sort(), phase2bRuntimeReferences: leaked, phase2bStyleReferences: leakedStyles });
}

for (const record of records) {
  check(!/\.map$/i.test(record.path), "source-map", record.path, "source maps must not enter production output");
  check(!/(?:^|\/)(?:artifacts|evidence|docs|planning|prototypes?|review|design-lab)(?:\/|$)/i.test(record.path), "internal-output", record.path, "prototype, planning, evidence or review material leaked into dist");
  check(!/phase-2a|storyboard|keyframes|contact-sheet/i.test(record.path), "prototype-output", record.path, "Phase 2A review asset leaked into dist");
}

const outputSize = bytes(records.map(({ contents }) => contents));
const largest = [...records].sort((left, right) => right.contents.length - left.contents.length)[0] ?? null;
report.sizes = {
  phase2bRuntime: phase2bSize,
  initialHomepageJavaScript: initialHomeSize,
  totalExternalJavaScript: totalJsSize,
  homepageInlineJavaScript: homeInlineSize,
  totalProductionJavaScript: {
    raw: totalJsSize.raw + homeInlineSize.raw,
    gzip: totalJsSize.gzip + homeInlineSize.gzip,
  },
  css: cssSize,
  output: outputSize,
  largestAsset: largest ? { path: largest.path, bytes: largest.contents.length, sha256: hash(largest.contents) } : null,
};
report.isolation = {
  phase2bRuntimeFiles: [...runtimePaths].sort(),
  phase2bHomeStyleFiles: [...homeCssPaths].sort(),
  homeReferencedJavaScript: [...homeReferencedJs].sort(),
  supportingRoutes: supportingIsolation,
};
report.passed = failures.length === 0;

if (!NO_WRITE) {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  const temporary = `${REPORT_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporary, REPORT_PATH);
}

if (failures.length > 0) {
  console.error(`Phase 2B output verification failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) console.error(`- [${failure.code}] ${failure.location}: ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(
    `Verified Phase 2B output: seven ordered chapters; runtime ${formatBytes(phase2bSize.raw)} raw/${formatBytes(phase2bSize.gzip)} gzip; ` +
    `total JS ${formatBytes(totalJsSize.raw + homeInlineSize.raw)} raw/${formatBytes(totalJsSize.gzip + homeInlineSize.gzip)} gzip; ` +
    `CSS ${formatBytes(cssSize.raw)} raw/${formatBytes(cssSize.gzip)} gzip; output ${formatBytes(outputSize.raw)} raw.`,
  );
  if (!NO_WRITE) console.log(`Machine report: ${path.relative(ROOT, REPORT_PATH).replaceAll("\\", "/")}`);
}
