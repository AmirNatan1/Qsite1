// QH_PHASE5AR_ROUTE_LAB_ONLY
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

export const SCHEMA = "qh.phase5ar.supporting-route-verifier.v1";
export const ACCEPTED_PHASE5A_SHA = "799ee284355f161e06404919d5022cd051165bf5";
export const CANARY = "QH_PHASE5AR_ROUTE_LAB_ONLY";
export const LAB_RELATIVE = "prototypes/phase-5a-r-supporting-routes";
export const CAPTURE_PLAN_SCHEMA = "qh.phase5ar.supporting-route-capture-plan.v1";
export const CAPTURE_MANIFEST_SCHEMA = "qh.phase5ar.route-preproduction-manifest.v1";
export const ANTI_TEMPLATE_SCHEMA = "qh.phase5ar.anti-template-audit.v1";

export const ROUTE_ORDER = Object.freeze([
  "for-industry",
  "for-startups",
  "industries",
  "proof",
  "maradin",
  "spark",
  "about",
  "contact",
  "404",
]);

export const ROUTE_CONTRACT = Object.freeze({
  "for-industry": Object.freeze({
    publicPath: "/for-partners/",
    actCount: 4,
    documentRegions: 4,
    requiredTerms: Object.freeze(["pressure", "aperture", "focus", "cross", "resolve", "decision"]),
  }),
  "for-startups": Object.freeze({
    publicPath: "/for-startups/",
    actCount: 4,
    documentRegions: 4,
    requiredTerms: Object.freeze(["signal", "alignment", "corridor", "conduct", "focus", "field"]),
  }),
  industries: Object.freeze({
    publicPath: "/industries/",
    actCount: 4,
    documentRegions: 6,
    requiredTerms: Object.freeze(["automotive", "logistics", "manufacturing", "energy", "territor", "coda"]),
  }),
  proof: Object.freeze({
    publicPath: "/pocs/",
    actCount: 2,
    documentRegions: 2,
    requiredTerms: Object.freeze(["archive", "record", "maradin", "threshold", "evidence"]),
  }),
  maradin: Object.freeze({
    publicPath: "/pocs/maradin/",
    actCount: 6,
    documentRegions: 6,
    requiredTerms: Object.freeze(["documentary", "media", "evidence", "test", "physical", "observed"]),
  }),
  spark: Object.freeze({
    publicPath: "/spark/",
    actCount: 3,
    documentRegions: 3,
    requiredTerms: Object.freeze(["runway", "sealed", "closed", "gate", "context"]),
  }),
  about: Object.freeze({
    publicPath: "/about/",
    actCount: 3,
    documentRegions: 3,
    requiredTerms: Object.freeze(["industry", "technology", "interlock", "joint", "position"]),
  }),
  contact: Object.freeze({
    publicPath: "/contact/",
    actCount: 1,
    documentRegions: 1,
    requiredTerms: Object.freeze(["intent", "rail", "industry", "startup", "general"]),
  }),
  "404": Object.freeze({
    publicPath: "/404/",
    actCount: 1,
    documentRegions: 1,
    requiredTerms: Object.freeze(["misregister", "recovery", "home", "displaced"]),
  }),
});

export const ROUTE_ARTIFACTS = Object.freeze([
  "route-brief-delta.md",
  "desktop-storyboard--1440x900.png",
  "mobile-storyboard--390x844.png",
  "narrow-overture--320x800.png",
  "short-landscape-overture-sheet.png",
  "signature-states-sheet.png",
  "material-board.png",
]);

export const CROSS_ROUTE_ARTIFACTS = Object.freeze([
  "PHASE_5A_R_ROUTE_COHERENCE_MATRIX.md",
  "PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md",
  "all-routes-desktop-contact-sheet.png",
  "all-routes-mobile-contact-sheet.png",
  "all-routes-short-landscape-contact-sheet.png",
  "motion-comparison-board.png",
  "material-comparison-board.png",
]);

export const LAB_SOURCE_FILES = Object.freeze([
  "README.md",
  "capture-plan.json",
  "render-route.mjs",
  "route-data.mjs",
  "server.mjs",
  "shared/enhancement.js",
  "shared/system.css",
]);

export const PLANNING_FILES = Object.freeze({
  coherence: "docs/planning/PHASE_5A_R_ROUTE_COHERENCE_MATRIX.md",
  antiTemplate: "docs/planning/PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md",
});

export const FROZEN_PUBLIC_FILES = Object.freeze([
  "src/pages/for-partners.astro",
  "src/pages/for-startups.astro",
  "src/pages/industries.astro",
  "src/pages/pocs.astro",
  "src/pages/pocs/maradin.astro",
  "src/pages/spark.astro",
  "src/pages/about.astro",
  "src/pages/contact.astro",
  "src/pages/404.astro",
  "src/styles/routes/standard.css",
  "src/styles/routes/proof.css",
  "src/styles/routes/not-found.css",
  "src/components/PageHero.astro",
  "src/components/ProcessList.astro",
  "src/components/ClosingCta.astro",
  "src/content/industries.ts",
  "src/content/proofs.ts",
  "src/content/programmes.ts",
  "src/content/collections.ts",
]);

export const ARCHITECTURE_FIELDS = Object.freeze([
  "documentLength",
  "overtureTopology",
  "h1Placement",
  "dominantGeometry",
  "primaryDensity",
  "mediaDominance",
  "transitionGrammar",
  "endingBehavior",
  "closestVisualSibling",
  "antiTemplateDistinction",
]);

export const ANTI_TEMPLATE_DIMENSIONS = Object.freeze([
  "chapter count",
  "page length",
  "overture structure",
  "h1 placement",
  "dominant geometry",
  "content/media relationship",
  "transition grammar",
  "ending structure",
]);

export const COHERENCE_COLUMNS = Object.freeze([
  "route",
  "document length",
  "chapter count",
  "overture topology",
  "dominant page geometry",
  "primary density",
  "media dominance",
  "unique ending behavior",
  "closest visual sibling",
  "anti-template distinction",
]);

export const REQUIRED_VIEWPORTS = Object.freeze([
  "1440x900",
  "390x844",
  "320x800",
  "740x360",
  "800x360",
  "844x390",
  "896x414",
  "900x480",
]);

const HASH64 = /^[0-9a-f]{64}$/;
const ROUTE_ID = /^[a-z0-9-]+$/;

export function expectedRoutePairs(routeOrder = ROUTE_ORDER) {
  const pairs = [];
  for (let left = 0; left < routeOrder.length; left += 1) {
    for (let right = left + 1; right < routeOrder.length; right += 1) {
      pairs.push(`${routeOrder[left]}|${routeOrder[right]}`);
    }
  }
  return pairs;
}

export const ROUTE_PAIRS = Object.freeze(expectedRoutePairs());

function exactArray(actual, expected, label) {
  assert.ok(Array.isArray(actual), `${label} must be an array`);
  assert.deepEqual(actual, expected, `${label} differs from the exact Phase 5A-R contract`);
}

function nonEmpty(value, label, minimum = 3) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim().length >= minimum, `${label} is too short`);
}

function normalized(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim();
}

export function architectureFingerprint(route) {
  const architecture = route?.architecture ?? {};
  return [
    architecture.actCount,
    architecture.documentRegions,
    ...ARCHITECTURE_FIELDS.slice(0, 8).map((field) => normalized(architecture[field])),
  ].join("|");
}

function routePublicPath(route) {
  return route?.publicPath ?? route?.path ?? route?.href ?? null;
}

export function validateRouteDataContract(routeOrder, routes) {
  exactArray(routeOrder, ROUTE_ORDER, "route-data route order");
  assert.ok(routes && typeof routes === "object" && !Array.isArray(routes), "ROUTES must be an object");
  assert.deepEqual(Object.keys(routes).sort(), [...ROUTE_ORDER].sort(), "ROUTES keys differ");

  const fingerprints = new Map();
  for (const slug of ROUTE_ORDER) {
    const route = routes[slug];
    const contract = ROUTE_CONTRACT[slug];
    assert.ok(route && typeof route === "object", `${slug} route data is missing`);
    assert.equal(routePublicPath(route), contract.publicPath, `${slug} public path projection changed`);
    assert.ok(route.architecture && typeof route.architecture === "object", `${slug}.architecture is missing`);
    assert.equal(route.architecture.actCount, contract.actCount, `${slug} act count differs`);
    assert.equal(route.architecture.documentRegions, contract.documentRegions, `${slug} document-region count differs`);
    for (const field of ARCHITECTURE_FIELDS) nonEmpty(route.architecture[field], `${slug}.architecture.${field}`, field === "antiTemplateDistinction" ? 24 : 3);
    assert.ok(ROUTE_ORDER.includes(route.architecture.closestVisualSibling), `${slug} closest visual sibling is not a Phase 5A-R route`);
    assert.notEqual(route.architecture.closestVisualSibling, slug, `${slug} cannot be its own visual sibling`);
    assert.ok(Array.isArray(route.acts), `${slug}.acts must be an array`);
    assert.equal(route.acts.length, contract.actCount, `${slug}.acts must match its exact act count`);
    route.acts.forEach((act, index) => {
      const text = typeof act === "string" ? act : JSON.stringify(act);
      nonEmpty(text, `${slug}.acts[${index}]`, 8);
    });
    const routeText = normalized(JSON.stringify(route));
    for (const term of contract.requiredTerms) assert.ok(routeText.includes(term), `${slug} omits required architectural term “${term}”`);
    if (slug === "industries") {
      for (const territory of ["automotive", "logistics", "manufacturing", "energy"]) {
        assert.equal(route.acts.filter((act) => normalized(JSON.stringify(act)).includes(territory)).length, 1, `industries must contain exactly one ${territory} territory act`);
      }
    }
    const fingerprint = architectureFingerprint(route);
    assert.ok(!fingerprints.has(fingerprint), `${slug} duplicates the full-page architecture of ${fingerprints.get(fingerprint)}`);
    fingerprints.set(fingerprint, slug);
  }
  assert.equal(fingerprints.size, ROUTE_ORDER.length, "all nine architecture fingerprints must be unique");
  return true;
}

function viewportId(viewport) {
  if (typeof viewport === "string") return viewport.replace("×", "x");
  if (viewport && Number.isInteger(viewport.width) && Number.isInteger(viewport.height)) return `${viewport.width}x${viewport.height}`;
  return "";
}

export function validateCapturePlan(plan) {
  assert.equal(plan?.schema, CAPTURE_PLAN_SCHEMA, "capture-plan schema differs");
  assert.equal(plan?.canary, CANARY, "capture-plan canary differs");
  exactArray(plan?.routes, ROUTE_ORDER, "capture-plan routes");
  exactArray(plan?.requiredRouteArtifacts, ROUTE_ARTIFACTS, "route artifact inventory");
  exactArray(plan?.requiredCrossRouteArtifacts, CROSS_ROUTE_ARTIFACTS, "cross-route artifact inventory");
  exactArray(plan?.boardModes, ["page", "signature", "materials"], "board modes");
  const viewports = new Set((plan?.validationViewports ?? plan?.viewports ?? []).map(viewportId));
  for (const viewport of REQUIRED_VIEWPORTS) assert.ok(viewports.has(viewport), `capture plan omits ${viewport}`);
  assert.equal(plan?.rules?.publicExposure, false, "prototype must remain non-public");
  assert.equal(plan?.rules?.publicSupportingRoutesChanged ?? plan?.rules?.publicRoutesChanged, false, "public supporting routes must remain frozen");
  assert.equal(plan?.rules?.phase5BAuthorized, false, "Phase 5B must remain unauthorized");
  assert.equal(plan.requiredRouteArtifacts.length, 7, "each route must emit exactly seven artifacts");
  assert.equal(plan.requiredCrossRouteArtifacts.length, 7, "cross-route output must contain exactly seven artifacts");
  return true;
}

export function parseAntiTemplateAudit(markdown) {
  nonEmpty(markdown, "anti-template audit", 100);
  const lower = markdown.toLowerCase();
  assert.ok(lower.includes(ANTI_TEMPLATE_SCHEMA), "anti-template audit schema marker is missing");
  assert.ok(lower.includes("human visual judgment remains authority"), "anti-template audit must preserve human visual authority");
  for (const dimension of ANTI_TEMPLATE_DIMENSIONS) assert.ok(lower.includes(dimension), `anti-template audit omits ${dimension}`);
  const markerPattern = /<!--\s*pair:([a-z0-9-]+)\|([a-z0-9-]+)\s*-->/gi;
  const markers = [...markdown.matchAll(markerPattern)];
  const pairs = markers.map((match) => `${match[1]}|${match[2]}`);
  exactArray(pairs, ROUTE_PAIRS, "anti-template route pairs");
  assert.equal(new Set(pairs).size, 36, "anti-template audit must contain 36 unique pairs");
  markers.forEach((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const end = index + 1 < markers.length ? markers[index + 1].index : markdown.length;
    const assessment = markdown.slice(start, end).trim();
    assert.ok(/\b(?:DISTINCT|WATCH|REPAIR)\b/.test(assessment), `${pairs[index]} has no explicit pair status`);
    assert.ok(assessment.length >= 48, `${pairs[index]} has no substantive anti-template rationale`);
  });
  for (const [left, right] of ROUTE_PAIRS.map((pair) => pair.split("|"))) {
    assert.ok(ROUTE_ID.test(left) && ROUTE_ID.test(right), "anti-template pair contains an invalid route id");
  }
  return { pairCount: pairs.length, pairs };
}

export function validateCoherenceMatrix(markdown) {
  nonEmpty(markdown, "coherence matrix", 100);
  const lower = markdown.toLowerCase();
  for (const column of COHERENCE_COLUMNS) assert.ok(lower.includes(column), `coherence matrix omits ${column}`);
  for (const slug of ROUTE_ORDER) assert.ok(lower.includes(slug), `coherence matrix omits ${slug}`);
  return true;
}

export function expectedEvidencePaths() {
  return [
    ...ROUTE_ORDER.flatMap((slug) => ROUTE_ARTIFACTS.map((filename) => `routes/${slug}/${filename}`)),
    ...CROSS_ROUTE_ARTIFACTS.map((filename) => `cross-route-system/${filename}`),
  ].sort((left, right) => left.localeCompare(right));
}

export function validateManifestData(manifest) {
  assert.equal(manifest?.schema, CAPTURE_MANIFEST_SCHEMA, "route manifest schema differs");
  assert.equal(manifest?.status, "PASS", "route manifest must be PASS");
  exactArray(manifest?.routes, ROUTE_ORDER, "manifest routes");
  assert.equal(manifest?.phase5BAuthorized, false, "route manifest cannot authorize Phase 5B");
  assert.equal(manifest?.publicRoutesChanged, false, "route manifest cannot report public route writes");
  assert.equal(manifest?.totals?.artifacts, 70, "route manifest must bind exactly 70 artifacts");
  assert.ok(Array.isArray(manifest?.artifacts), "route manifest artifacts must be an array");
  assert.equal(manifest.artifacts.length, 70, "route manifest must contain exactly 70 ledger records");
  const observed = [];
  for (const record of manifest.artifacts) {
    assert.equal(typeof record?.relativePath, "string", "manifest artifact path must be a string");
    assert.ok(!path.posix.isAbsolute(record.relativePath) && !record.relativePath.split("/").includes(".."), `unsafe manifest path ${record.relativePath}`);
    assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0, `${record.relativePath} has invalid bytes`);
    assert.match(record.sha256 ?? "", HASH64, `${record.relativePath} has invalid SHA-256`);
    observed.push(record.relativePath);
  }
  exactArray(observed.sort((left, right) => left.localeCompare(right)), expectedEvidencePaths(), "manifest artifact paths");
  assert.equal(new Set(observed).size, 70, "manifest artifact paths must be unique");
  return true;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(candidate));
    else if (entry.isFile()) files.push(candidate);
    else throw new Error(`unsupported filesystem entry ${candidate}`);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function relativePosix(root, candidate) {
  return path.relative(root, candidate).replaceAll("\\", "/");
}

function gitShow(root, revision, relative) {
  return execFileSync("git", ["show", `${revision}:${relative}`], { cwd: root, encoding: null, stdio: ["ignore", "pipe", "pipe"] });
}

export async function verifyPublicSourceFreeze(root = process.cwd()) {
  const records = [];
  for (const relative of FROZEN_PUBLIC_FILES) {
    const current = await readFile(path.join(root, ...relative.split("/")));
    const accepted = gitShow(root, ACCEPTED_PHASE5A_SHA, relative);
    assert.ok(current.equals(accepted), `${relative} differs from accepted Phase 5A SHA ${ACCEPTED_PHASE5A_SHA}`);
    records.push({ relativePath: relative, bytes: current.length, sha256: sha256(current) });
  }
  return records;
}

async function readTextProduction(root) {
  const files = [];
  for (const relative of ["src", "public"]) {
    for (const absolute of await walk(path.join(root, relative))) {
      if (/\.(?:png|jpe?g|webp|gif|mp4|webm|woff2?|ttf|ico|pdf|zip)$/i.test(absolute)) continue;
      files.push(await readFile(absolute, "utf8"));
    }
  }
  for (const relative of ["astro.config.mjs", "package.json"]) files.push(await readFile(path.join(root, relative), "utf8"));
  return files.join("\n");
}

export async function verifyPrototypeSource({ root = process.cwd(), labRoot = path.join(root, ...LAB_RELATIVE.split("/")) } = {}) {
  assert.ok(await exists(labRoot), `Phase 5A-R prototype tree is missing: ${labRoot}`);
  const absoluteFiles = await walk(labRoot);
  const observedFiles = absoluteFiles.map((file) => relativePosix(labRoot, file));
  exactArray(observedFiles, [...LAB_SOURCE_FILES].sort((left, right) => left.localeCompare(right)), "prototype source files");
  const textRecords = await Promise.all(absoluteFiles.map(async (file) => ({
    relativePath: relativePosix(labRoot, file),
    text: await readFile(file, "utf8"),
    bytes: (await stat(file)).size,
  })));
  assert.ok(textRecords.every(({ text }) => text.includes(CANARY)), "every prototype source file must carry the Phase 5A-R canary");
  const combined = textRecords.map(({ text }) => text).join("\n");
  const executable = textRecords.filter(({ relativePath }) => /\.(?:css|js|mjs)$/i.test(relativePath)).map(({ text }) => text).join("\n");
  assert.doesNotMatch(combined, /https?:\/\/(?!127\.0\.0\.1|localhost|www\.w3\.org\/2000\/svg)/i, "prototype cannot depend on an external network");
  assert.doesNotMatch(executable, /cinematic-runway|phase-4r2|scroll-snap|position\s*:\s*sticky|three\.js|gsap|react|webgl/i, "prototype cannot replay the homepage or add a heavy/sticky runtime");
  assert.doesNotMatch(executable, /(?:writeFile|copyFile|rename|mkdir)[\s\S]{0,180}(?:src[\\/](?:pages|styles)|public[\\/]|dist[\\/])/i, "prototype tooling cannot write public/build source");
  assert.ok(textRecords.reduce((total, record) => total + record.bytes, 0) < 750_000, "prototype source must remain compact");

  const plan = JSON.parse(await readFile(path.join(labRoot, "capture-plan.json"), "utf8"));
  validateCapturePlan(plan);
  const routeDataUrl = `${pathToFileURL(path.join(labRoot, "route-data.mjs")).href}?phase5arVerifier=${Date.now()}`;
  const routeData = await import(routeDataUrl);
  validateRouteDataContract(routeData.ROUTE_ORDER, routeData.ROUTES);
  if (typeof routeData.assertRouteData === "function") routeData.assertRouteData();

  const planningAntiTemplate = await readFile(path.join(root, ...PLANNING_FILES.antiTemplate.split("/")), "utf8");
  const planningPairResult = parseAntiTemplateAudit(planningAntiTemplate);
  const planningCoherence = await readFile(path.join(root, ...PLANNING_FILES.coherence.split("/")), "utf8");
  validateCoherenceMatrix(planningCoherence);

  const productionText = await readTextProduction(root);
  assert.doesNotMatch(productionText, /QH_PHASE5AR_ROUTE_LAB_ONLY|phase-5a-r-supporting-routes/i, "Phase 5A-R lab leaked into public source/configuration");
  const frozen = await verifyPublicSourceFreeze(root);
  return {
    files: observedFiles.length,
    bytes: textRecords.reduce((total, record) => total + record.bytes, 0),
    routes: ROUTE_ORDER.length,
    architectureFingerprints: new Set(ROUTE_ORDER.map((slug) => architectureFingerprint(routeData.ROUTES[slug]))).size,
    planningAntiTemplatePairs: planningPairResult.pairCount,
    frozenPublicFiles: frozen.length,
  };
}

async function validatePng(absolute, relative) {
  const metadata = await sharp(absolute, { failOn: "error" }).metadata();
  assert.equal(metadata.format, "png", `${relative} is not a PNG`);
  assert.ok((metadata.width ?? 0) >= 320 && (metadata.height ?? 0) >= 360, `${relative} is too small`);
  if (relative.endsWith("desktop-storyboard--1440x900.png")) {
    assert.equal(metadata.width, 1440, `${relative} must use 1440px presentation width`);
    assert.ok((metadata.height ?? 0) >= 900, `${relative} must preserve at least one 1440×900 presentation frame`);
  }
  if (relative.endsWith("mobile-storyboard--390x844.png")) {
    assert.equal(metadata.width, 390, `${relative} must use 390px portrait width`);
    assert.ok((metadata.height ?? 0) >= 844, `${relative} must preserve at least one 390×844 presentation frame`);
  }
  if (relative.endsWith("narrow-overture--320x800.png")) {
    assert.equal(metadata.width, 320, `${relative} must use 320px width`);
    assert.ok((metadata.height ?? 0) >= 800, `${relative} must preserve the full 320×800 overture`);
  }
  return { width: metadata.width, height: metadata.height };
}

function assertExternal(root, evidenceRoot) {
  assert.ok(path.isAbsolute(evidenceRoot), "evidence root must be absolute");
  const relative = path.relative(path.resolve(root), path.resolve(evidenceRoot));
  assert.ok(relative === ".." || relative.startsWith(`..${path.sep}`), "evidence must remain outside the repository");
}

export async function verifyEvidence({ root = process.cwd(), evidenceRoot }) {
  assertExternal(root, evidenceRoot);
  const manifestPath = path.join(evidenceRoot, "route-preproduction-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  validateManifestData(manifest);
  const ledger = new Map(manifest.artifacts.map((record) => [record.relativePath, record]));

  for (const slug of ROUTE_ORDER) {
    const directory = path.join(evidenceRoot, "routes", slug);
    exactArray((await readdir(directory)).sort((left, right) => left.localeCompare(right)), [...ROUTE_ARTIFACTS].sort((left, right) => left.localeCompare(right)), `${slug} evidence files`);
  }
  const crossDirectory = path.join(evidenceRoot, "cross-route-system");
  exactArray((await readdir(crossDirectory)).sort((left, right) => left.localeCompare(right)), [...CROSS_ROUTE_ARTIFACTS].sort((left, right) => left.localeCompare(right)), "cross-route evidence files");

  for (const relative of expectedEvidencePaths()) {
    const absolute = path.join(evidenceRoot, ...relative.split("/"));
    const bytes = await readFile(absolute);
    const authority = ledger.get(relative);
    assert.equal(bytes.length, authority.bytes, `${relative} byte count differs from manifest`);
    assert.equal(sha256(bytes), authority.sha256, `${relative} hash differs from manifest`);
    if (relative.endsWith(".png")) await validatePng(absolute, relative);
  }

  const antiTemplate = await readFile(path.join(crossDirectory, "PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md"), "utf8");
  const pairResult = parseAntiTemplateAudit(antiTemplate);
  const coherence = await readFile(path.join(crossDirectory, "PHASE_5A_R_ROUTE_COHERENCE_MATRIX.md"), "utf8");
  validateCoherenceMatrix(coherence);
  for (const slug of ROUTE_ORDER) {
    const delta = await readFile(path.join(evidenceRoot, "routes", slug, "route-brief-delta.md"), "utf8");
    assert.ok(normalized(delta).includes(normalized(slug)), `${slug} route delta does not identify its route`);
    assert.ok(/phase\s*5b[^\n]{0,80}(?:unauthorized|not authorized)/i.test(delta), `${slug} route delta must preserve the Phase 5B boundary`);
    assert.ok(/public[^\n]{0,80}(?:unchanged|not changed|frozen)/i.test(delta), `${slug} route delta must state that the public route is unchanged`);
  }
  return { artifacts: manifest.artifacts.length, pairs: pairResult.pairCount, manifestBytes: (await stat(manifestPath)).size };
}

function argument(name, fallback = null) {
  const exact = `--${name}`;
  const index = process.argv.findIndex((value) => value === exact || value.startsWith(`${exact}=`));
  if (index < 0) return fallback;
  const value = process.argv[index];
  return value.includes("=") ? value.slice(value.indexOf("=") + 1) : process.argv[index + 1];
}

export async function main() {
  if (process.argv.includes("--help")) {
    process.stdout.write(`Phase 5A-R supporting-route verifier\n\nUsage:\n  node scripts/verify-phase5ar-supporting-routes.mjs [--lab-root <prototype-tree>] [--evidence-root <external-capture>]\n`);
    return;
  }
  const root = path.resolve(process.cwd());
  const labRoot = path.resolve(argument("lab-root", path.join(root, ...LAB_RELATIVE.split("/"))));
  const source = await verifyPrototypeSource({ root, labRoot });
  const evidenceArgument = argument("evidence-root");
  const evidence = evidenceArgument ? await verifyEvidence({ root, evidenceRoot: path.resolve(evidenceArgument) }) : null;
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, status: "PASS", acceptedPhase5A: ACCEPTED_PHASE5A_SHA, source, evidence, phase5BAuthorized: false, publicRoutesChanged: false }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Phase 5A-R supporting-route verification failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
