// QH_PHASE5AR_ROUTE_LAB_ONLY
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import sharp from "sharp";

import {
  ROUTE_ORDER,
  ROUTES,
  VIEWPORTS,
  assertRouteData,
} from "../prototypes/phase-5a-r-supporting-routes/route-data.mjs";
import { runResponsiveQa } from "./qa-phase5ar-responsive-routes.mjs";
import {
  ACCEPTED_PHASE5A_SHA,
  expectedEvidencePaths,
  parseAntiTemplateAudit,
  validateCapturePlan,
  validateCoherenceMatrix,
  validateManifestData,
  verifyEvidence,
  verifyPublicSourceFreeze,
} from "./verify-phase5ar-supporting-routes.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LAB_ROOT = path.join(ROOT, "prototypes", "phase-5a-r-supporting-routes");
export const SERVER_PATH = path.join(LAB_ROOT, "server.mjs");
export const CAPTURE_PLAN_PATH = path.join(LAB_ROOT, "capture-plan.json");
export const CANARY = "QH_PHASE5AR_ROUTE_LAB_ONLY";
export const CAPTURE_SCHEMA = "qh.phase5ar.route-preproduction-capture.v1";
export const MANIFEST_SCHEMA = "qh.phase5ar.route-preproduction-manifest.v1";
export const REQUEST_SCHEMA = "qh.phase5ar.route-request-isolation.v1";
export const ACCESSIBILITY_SCHEMA = "qh.phase5ar.route-accessibility.v1";
export const PUBLIC_FREEZE_SCHEMA = "qh.phase5ar.public-source-freeze.v1";

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

export const SHORT_LANDSCAPE_IDS = Object.freeze([
  "landscape-740",
  "landscape-800",
  "landscape-844",
  "landscape-896",
  "landscape-900",
]);

export const VALIDATION_SCENARIOS = Object.freeze([
  "13 required viewport sizes",
  "200% text",
  "fallback font",
  "reduced motion",
  "no JavaScript",
  "desktop keyboard",
  "mobile keyboard",
  "44px targets",
  "axe WCAG 2 A/AA",
  "same-origin request isolation",
]);

export const EXPECTED_REVIEW_PATHS = Object.freeze(expectedEvidencePaths());
const HASH64 = /^[0-9a-f]{64}$/;
const CINEMATIC_OR_VIDEO = /(?:phase[-_]?4|cinematic|\.mp4(?:$|[?#])|\.webm(?:$|[?#]))/i;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function posix(relative) {
  return relative.replaceAll("\\", "/");
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertContainedPath(parent, candidate, label = "write target") {
  if (!within(parent, candidate)) throw new Error(`${label} escapes its authorized capture root: ${candidate}`);
  return path.resolve(candidate);
}

export function assertDurableExternalPath(output, { root = ROOT, temporaryRoot = tmpdir() } = {}) {
  const resolved = path.resolve(output);
  if (within(root, resolved)) throw new Error("Route review output must be outside the repository");
  if (within(path.resolve(temporaryRoot), resolved)) throw new Error("Route review output must be durable and outside the OS temporary directory");
  if (resolved === path.parse(resolved).root) throw new Error("Route review output cannot be a filesystem root");
  return resolved;
}

export function assertLoopbackUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new Error(`Route capture server must be loopback-only HTTP: ${url.href}`);
  }
  return url;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function writeInside(root, destination, contents) {
  assertContainedPath(root, destination);
  await writeFile(destination, contents);
}

async function mkdirInside(root, destination) {
  assertContainedPath(root, destination);
  await mkdir(destination, { recursive: true });
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svg(width, height, body) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
}

export function renderRouteBriefDelta(route) {
  const architecture = route.architecture;
  return [
    `# ${route.publicLabel} — Phase 5A-R route brief delta`,
    "",
    `Route ID: \`${route.slug}\`  `,
    `Public path reference: \`${route.publicPath}\`  `,
    "Status: local speculative preproduction; public supporting route unchanged and frozen; Phase 5B unauthorized.",
    "",
    "## Frozen from accepted Phase 5A",
    "",
    `- Purpose: ${route.purpose}`,
    `- Publication constraints: ${route.publication.join("; ")}.`,
    `- Conversion boundary: ${route.conversion}`,
    `- Dependencies: ${route.dependencies.join("; ")}.`,
    "",
    "## Phase 5A-R document-architecture delta",
    "",
    `- Document length: ${architecture.documentLength}.`,
    `- Chapter / act count: ${architecture.actCount}; semantic document regions: ${architecture.documentRegions}.`,
    `- Overture topology: ${architecture.overtureTopology}.`,
    `- H1 placement: ${architecture.h1Placement}.`,
    `- Dominant page geometry: ${architecture.dominantGeometry}.`,
    `- Primary density: ${architecture.primaryDensity}.`,
    `- Content / media relationship: ${architecture.mediaDominance}.`,
    `- Transition grammar: ${architecture.transitionGrammar}.`,
    `- Unique ending behavior: ${architecture.endingBehavior}.`,
    `- Closest visual sibling: ${architecture.closestVisualSibling}.`,
    `- Anti-template distinction: ${architecture.antiTemplateDistinction}`,
    "",
    "## Responsive overture delta",
    "",
    `- Short-landscape must show: ${route.shortLandscape.mustShow.join("; ")}.`,
    `- Short-landscape strategy: ${route.shortLandscape.strategy}`,
    `- Portrait foreground: ${route.portrait.foreground}.`,
    `- Portrait simplification: ${route.portrait.simplification}.`,
    `- 320px identity: ${route.portrait.identity}.`,
    "",
    "## Signature and material decision",
    "",
    `- Signature states (${route.signatureStates.length}): ${route.signatureStates.join(" → ")}.`,
    `- Motion mode: ${route.motionMode}; no continuous loop.`,
    `- Decisive materials: ${route.materials.join("; ")}.`,
    `- Performance strategy: ${route.performance}.`,
    "",
    "This delta does not replace the accepted route brief, change public route source, approve publication, or authorize Phase 5B. Human visual judgment remains authoritative.",
    "",
  ].join("\n");
}

async function composeSheet({
  staging,
  destination,
  title,
  subtitle,
  items,
  columns = 3,
  panelWidth = 380,
  panelHeight = 520,
  labelHeight = 48,
}) {
  assertContainedPath(staging, destination, "composite destination");
  assert.ok(items.length > 0, `${title} requires source items`);
  const margin = 28;
  const gap = 16;
  const headerHeight = 108;
  const tileHeight = panelHeight + labelHeight;
  const rows = Math.ceil(items.length / columns);
  const width = margin * 2 + columns * panelWidth + (columns - 1) * gap;
  const height = margin + headerHeight + rows * tileHeight + (rows - 1) * gap + margin;
  const composites = [{
    input: svg(width - margin * 2, headerHeight, `
      <rect width="100%" height="100%" fill="#070708" />
      <text x="0" y="34" fill="#f4f0ea" font-family="Arial, sans-serif" font-size="26" font-weight="700">${escapeXml(title)}</text>
      <text x="0" y="67" fill="#a8a29a" font-family="Arial, sans-serif" font-size="14">${escapeXml(subtitle)}</text>
      <line x1="0" y1="92" x2="100%" y2="92" stroke="#343139" stroke-width="1" />
    `),
    left: margin,
    top: margin,
  }];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const source = assertContainedPath(staging, item.path, "sheet source");
    const image = await sharp(source, { failOn: "error" })
      .flatten({ background: "#09090b" })
      .resize(panelWidth, panelHeight, { fit: "contain", background: "#09090b" })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const label = svg(panelWidth, labelHeight, `
      <rect width="100%" height="100%" fill="#111114" />
      <line x1="0" y1="0" x2="${panelWidth}" y2="0" stroke="#39353d" />
      <text x="14" y="29" fill="#ddd7cf" font-family="Arial, sans-serif" font-size="13" font-weight="700">${escapeXml(item.label)}</text>
    `);
    const tile = await sharp({ create: { width: panelWidth, height: tileHeight, channels: 4, background: "#09090b" } })
      .composite([{ input: image, left: 0, top: 0 }, { input: label, left: 0, top: panelHeight }])
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const column = index % columns;
    const row = Math.floor(index / columns);
    composites.push({
      input: tile,
      left: margin + column * (panelWidth + gap),
      top: margin + headerHeight + row * (tileHeight + gap),
    });
  }

  await sharp({ create: { width, height, channels: 4, background: "#070708" } })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(destination);
}

async function executable(candidate) {
  if (!candidate) return false;
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveBrowser(override) {
  const candidates = override ? [path.resolve(override)] : [];
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    );
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
  } else {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium");
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) if (await executable(candidate)) return candidate;
  throw new Error("Chrome/Chromium not found; pass --browser PATH or set CHROME_PATH");
}

async function startLab() {
  const child = spawn(process.execPath, [SERVER_PATH, "--port=0"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let output = "";
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Phase 5A-R route lab did not start within 12 seconds\n${output}`)), 12_000);
    const listen = (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}/`);
      }
    };
    child.stdout.on("data", listen);
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Phase 5A-R route lab exited before readiness (${code})\n${output}`));
    });
  });
  assertLoopbackUrl(baseUrl);
  return { child, baseUrl, output: () => output };
}

async function stopLab(lab) {
  if (!lab?.child || lab.child.exitCode !== null) return;
  const exited = new Promise((resolve) => lab.child.once("exit", resolve));
  lab.child.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3_000))]);
  if (lab.child.exitCode === null) lab.child.kill("SIGKILL");
}

function requestEntry(request, scope) {
  return {
    scope,
    url: request.url(),
    method: request.method(),
    resourceType: request.resourceType(),
  };
}

async function guardContext(context, baseUrl, ledger, scope) {
  const allowedOrigin = assertLoopbackUrl(baseUrl).origin;
  await context.route("**/*", async (route) => {
    const request = route.request();
    let url;
    try { url = new URL(request.url()); } catch { url = null; }
    const allowed = url && (url.protocol === "data:" || url.protocol === "blob:" || url.origin === allowedOrigin);
    if (!allowed) {
      ledger.blocked.push(requestEntry(request, scope));
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  context.on("request", (request) => ledger.requests.push(requestEntry(request, scope)));
  context.on("response", (response) => ledger.responses.push({ scope, url: response.url(), status: response.status() }));
  context.on("requestfailed", (request) => ledger.failed.push({ ...requestEntry(request, scope), failure: request.failure()?.errorText ?? "unknown" }));
}

export function validateRequestIsolation(ledger, baseUrl) {
  const origin = assertLoopbackUrl(baseUrl).origin;
  const external = (ledger.requests ?? []).filter(({ url }) => {
    try {
      const parsed = new URL(url);
      return !["data:", "blob:"].includes(parsed.protocol) && parsed.origin !== origin;
    } catch {
      return true;
    }
  });
  const cinematic = (ledger.requests ?? []).filter(({ url, resourceType }) => CINEMATIC_OR_VIDEO.test(url) || resourceType === "media");
  const httpErrors = (ledger.responses ?? []).filter(({ status }) => status >= 400);
  const failed = ledger.failed ?? [];
  const blocked = ledger.blocked ?? [];
  if (external.length || cinematic.length || httpErrors.length || failed.length || blocked.length) {
    throw new Error(`Route capture request isolation failed: ${JSON.stringify({ external, cinematic, httpErrors, failed, blocked })}`);
  }
  return {
    schema: REQUEST_SCHEMA,
    status: "PASS",
    loopbackOrigin: origin,
    requests: (ledger.requests ?? []).length,
    responses: (ledger.responses ?? []).length,
    externalRequests: 0,
    cinematicOrVideoRequests: 0,
    failedRequests: 0,
    blockedRequests: 0,
    httpErrors: 0,
  };
}

async function waitReady(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts?.ready);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function navigate(page, url, expectedRoute, expectedBoard = "page") {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Route lab navigation failed: ${url} (${response?.status() ?? "no response"})`);
  if (response.headers()["x-phase5ar-local-prototype"] !== CANARY) throw new Error(`Route lab provenance header missing: ${url}`);
  await waitReady(page);
  const observation = await page.evaluate(({ route, board, canary }) => {
    const visible = (element) => {
      if (!element || !element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const h1 = document.querySelector("h1");
    return {
      route: document.documentElement.dataset.route,
      architecture: document.documentElement.dataset.architecture,
      board: document.body.dataset.board,
      canaryVisible: document.body.innerText.includes(canary),
      h1Count: document.querySelectorAll("h1").length,
      h1Text: h1?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      h1Visible: visible(h1),
      mainCount: document.querySelectorAll("main").length,
      actCount: document.querySelectorAll("[data-act]").length,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      stickyOrFixed: [...document.querySelectorAll("body *")]
        .filter((element) => ["sticky", "fixed"].includes(getComputedStyle(element).position))
        .slice(0, 12)
        .map((element) => element.className || element.tagName),
      videos: document.querySelectorAll("video, audio").length,
      cinematic: document.querySelectorAll("[data-cinematic], .cinematic-runway").length,
      expectedRoute: route,
      expectedBoard: board,
    };
  }, { route: expectedRoute.slug, board: expectedBoard, canary: CANARY });
  assert.equal(observation.route, expectedRoute.slug, `${expectedRoute.slug} route identity differs`);
  assert.equal(observation.board, expectedBoard, `${expectedRoute.slug} board identity differs`);
  assert.equal(observation.canaryVisible, true, `${expectedRoute.slug} local canary is not visible`);
  assert.equal(observation.h1Count, 1, `${expectedRoute.slug} must contain exactly one H1`);
  assert.equal(observation.h1Visible, true, `${expectedRoute.slug} H1 is not visible`);
  assert.equal(observation.mainCount, 1, `${expectedRoute.slug} must contain exactly one main`);
  assert.ok(observation.horizontalOverflow <= 1.5, `${expectedRoute.slug} horizontally overflows by ${observation.horizontalOverflow}px`);
  assert.deepEqual(observation.stickyOrFixed, [], `${expectedRoute.slug} contains sticky/fixed elements`);
  assert.equal(observation.videos, 0, `${expectedRoute.slug} contains media playback elements`);
  assert.equal(observation.cinematic, 0, `${expectedRoute.slug} contains cinematic markup`);
  if (expectedBoard === "page") {
    assert.equal(observation.h1Text, expectedRoute.title, `${expectedRoute.slug} H1 copy differs`);
    assert.equal(observation.actCount, expectedRoute.architecture.actCount, `${expectedRoute.slug} act count differs`);
  }
  return observation;
}

async function captureScreenshot({ staging, page, destination, fullPage = false }) {
  assertContainedPath(staging, destination, "screenshot destination");
  await page.screenshot({
    path: destination,
    fullPage,
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
}

async function runAxe(page, axeSource, route, viewport) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations"],
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.length,
      targets: violation.nodes.slice(0, 6).map((node) => node.target),
    }));
  });
  const blockers = violations.filter(({ impact }) => impact === "critical" || impact === "serious");
  if (blockers.length) throw new Error(`Axe serious/critical violations for ${route.slug} ${viewport}: ${JSON.stringify(blockers)}`);
  return { route: route.slug, viewport, seriousOrCritical: 0, violations };
}

function viewportKey(viewport) {
  return `${viewport.width}x${viewport.height}`;
}

export function validateResponsiveCoverage(report, plan, { smoke = false } = {}) {
  assert.equal(report?.status, "PASS", "responsive route QA must pass before artifact capture");
  assert.equal(report?.issueCount, 0, "responsive route QA contains unresolved diagnostics");
  assert.equal(report?.routes?.length, 9, "responsive route QA must cover nine routes");
  assert.equal(plan?.validationViewports?.length, 13, "capture plan must expose exactly 13 validation viewports");
  assert.equal(new Set(plan.validationViewports.map(viewportKey)).size, 13, "capture plan validation viewports must be unique");
  const expectedBaseViewports = smoke ? 3 : 13;
  assert.equal(report.coverage?.capturePlanViewports, expectedBaseViewports, `responsive QA must exercise ${expectedBaseViewports} base viewports in ${smoke ? "smoke" : "full"} mode`);
  assert.equal(report.coverage?.baseObservations, expectedBaseViewports * 9, "responsive base observation count differs");
  for (const key of ["text200", "fallbackFont", "reducedMotion", "noJs"]) {
    assert.equal(report.coverage?.[key], 9, `${key} must cover all nine routes`);
  }
  assert.equal(report.coverage?.keyboard, smoke ? 9 : 18, "keyboard QA must cover the expected desktop/mobile matrix");
  return true;
}

async function captureRoute({ browser, route, baseUrl, staging, scratch, axeSource, requestLedger, browserErrors }) {
  const routeDirectory = path.join(staging, "routes", route.slug);
  const routeScratch = path.join(scratch, route.slug);
  await mkdirInside(staging, routeDirectory);
  await mkdirInside(staging, routeScratch);
  await writeInside(staging, path.join(routeDirectory, "route-brief-delta.md"), renderRouteBriefDelta(route));

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", reducedMotion: "no-preference" });
  await guardContext(context, baseUrl, requestLedger, route.slug);
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push({ route: route.slug, type: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push({ route: route.slug, type: "console", message: message.text() });
  });
  const url = new URL(route.publicPath.slice(1), baseUrl).href;
  const audits = [];
  const axe = [];
  const landscape = [];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    audits.push({ viewport: viewportKey(viewport), ...await navigate(page, url, route, "page") });
    if (viewport.id === "desktop") {
      const destination = path.join(routeDirectory, "desktop-storyboard--1440x900.png");
      await captureScreenshot({ staging, page, destination, fullPage: true });
      axe.push(await runAxe(page, axeSource, route, "1440x900"));
    } else if (viewport.id === "mobile") {
      const destination = path.join(routeDirectory, "mobile-storyboard--390x844.png");
      await captureScreenshot({ staging, page, destination, fullPage: true });
      axe.push(await runAxe(page, axeSource, route, "390x844"));
    } else if (viewport.id === "mobile-narrow") {
      await captureScreenshot({ staging, page, destination: path.join(routeDirectory, "narrow-overture--320x800.png") });
    }
    if (SHORT_LANDSCAPE_IDS.includes(viewport.id)) {
      const destination = path.join(routeScratch, `${viewport.id}--${viewport.width}x${viewport.height}.png`);
      await captureScreenshot({ staging, page, destination });
      landscape.push({ path: destination, label: `${viewport.width}×${viewport.height}` });
    }
  }

  assert.equal(landscape.length, 5, `${route.slug} must capture five short-landscape neighbors`);
  await composeSheet({
    staging,
    destination: path.join(routeDirectory, "short-landscape-overture-sheet.png"),
    title: `${route.publicLabel} · short-landscape overture`,
    subtitle: "740×360 · 800×360 · 844×390 · 896×414 · 900×480 — complete thought and route identity",
    items: landscape,
    columns: 3,
    panelWidth: 420,
    panelHeight: 240,
    labelHeight: 42,
  });

  for (const [board, filename] of [["signature", "signature-states-sheet.png"], ["materials", "material-board.png"]]) {
    const boardUrl = new URL(url);
    boardUrl.searchParams.set("board", board);
    await page.setViewportSize({ width: 1440, height: 900 });
    await navigate(page, boardUrl.href, route, board);
    await captureScreenshot({ staging, page, destination: path.join(routeDirectory, filename), fullPage: true });
  }
  await context.close();

  return {
    route: route.slug,
    publicPathReference: route.publicPath,
    artifacts: ROUTE_ARTIFACTS.length,
    validationViewports: audits.length,
    axe,
    crossSources: {
      desktop: path.join(routeDirectory, "desktop-storyboard--1440x900.png"),
      mobile: path.join(routeDirectory, "mobile-storyboard--390x844.png"),
      shortLandscape: landscape.find(({ label }) => label === "844×390")?.path,
      motion: path.join(routeDirectory, "signature-states-sheet.png"),
      material: path.join(routeDirectory, "material-board.png"),
    },
  };
}

async function buildCrossRouteArtifacts({ staging, routeResults }) {
  const cross = path.join(staging, "cross-route-system");
  await mkdirInside(staging, cross);
  const coherence = await readFile(path.join(ROOT, "docs", "planning", "PHASE_5A_R_ROUTE_COHERENCE_MATRIX.md"), "utf8");
  const antiTemplate = await readFile(path.join(ROOT, "docs", "planning", "PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md"), "utf8");
  validateCoherenceMatrix(coherence);
  parseAntiTemplateAudit(antiTemplate);
  await writeInside(staging, path.join(cross, "PHASE_5A_R_ROUTE_COHERENCE_MATRIX.md"), coherence);
  await writeInside(staging, path.join(cross, "PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md"), antiTemplate);

  const sheets = [
    {
      filename: "all-routes-desktop-contact-sheet.png",
      title: "All routes · desktop documents",
      subtitle: "Full-page 1440×900 storyboards — document length, density, rhythm and endings",
      key: "desktop",
      panelWidth: 360,
      panelHeight: 760,
    },
    {
      filename: "all-routes-mobile-contact-sheet.png",
      title: "All routes · portrait documents",
      subtitle: "Full-page 390×844 storyboards — portrait hierarchy and document continuity",
      key: "mobile",
      panelWidth: 300,
      panelHeight: 760,
    },
    {
      filename: "all-routes-short-landscape-contact-sheet.png",
      title: "All routes · short-landscape overtures",
      subtitle: "844×390 comparison state — complete thought plus enough route-defining geometry",
      key: "shortLandscape",
      panelWidth: 420,
      panelHeight: 240,
    },
    {
      filename: "motion-comparison-board.png",
      title: "All routes · signature-state comparison",
      subtitle: "Four to six authored states per route; transition grammars compared without continuous loops",
      key: "motion",
      panelWidth: 420,
      panelHeight: 430,
    },
    {
      filename: "material-comparison-board.png",
      title: "All routes · decisive material comparison",
      subtitle: "Shared Dark V2 foundations; nine differentiated surface and evidence relationships",
      key: "material",
      panelWidth: 420,
      panelHeight: 430,
    },
  ];

  for (const sheet of sheets) {
    await composeSheet({
      staging,
      destination: path.join(cross, sheet.filename),
      title: sheet.title,
      subtitle: sheet.subtitle,
      items: routeResults.map((result) => ({
        path: result.crossSources[sheet.key],
        label: ROUTES[result.route].publicLabel,
      })),
      columns: 3,
      panelWidth: sheet.panelWidth,
      panelHeight: sheet.panelHeight,
      labelHeight: 46,
    });
  }
}

async function exactDirectoryFiles(directory, expected, label) {
  const entries = await readdir(directory, { withFileTypes: true });
  const unexpectedType = entries.find((entry) => !entry.isFile());
  if (unexpectedType) throw new Error(`${label} contains non-file entry ${unexpectedType.name}`);
  assert.deepEqual(entries.map(({ name }) => name).sort(), [...expected].sort(), `${label} artifact inventory differs`);
}

async function artifactRecords(staging) {
  for (const slug of ROUTE_ORDER) {
    await exactDirectoryFiles(path.join(staging, "routes", slug), ROUTE_ARTIFACTS, `${slug} route folder`);
  }
  await exactDirectoryFiles(path.join(staging, "cross-route-system"), CROSS_ROUTE_ARTIFACTS, "cross-route folder");

  const records = [];
  for (const relativePath of EXPECTED_REVIEW_PATHS) {
    const absolute = assertContainedPath(staging, path.join(staging, ...relativePath.split("/")), "artifact path");
    const bytes = await readFile(absolute);
    const record = { relativePath, bytes: bytes.length, sha256: sha256(bytes) };
    if (relativePath.endsWith(".png")) {
      const metadata = await sharp(bytes, { failOn: "error" }).metadata();
      assert.equal(metadata.format, "png", `${relativePath} must be PNG`);
      assert.ok((metadata.width ?? 0) >= 320 && (metadata.height ?? 0) >= 360, `${relativePath} is too small`);
      record.media = { type: "image", format: metadata.format, width: metadata.width, height: metadata.height };
    }
    records.push(record);
  }
  return records;
}

export function validateArtifactLedger(records) {
  assert.ok(Array.isArray(records), "artifact ledger must be an array");
  assert.equal(records.length, 70, "artifact ledger must contain exactly 70 review artifacts");
  assert.deepEqual(records.map(({ relativePath }) => relativePath).sort((left, right) => left.localeCompare(right)), [...EXPECTED_REVIEW_PATHS], "artifact ledger paths differ");
  assert.equal(new Set(records.map(({ relativePath }) => relativePath)).size, 70, "artifact ledger paths must be unique");
  for (const record of records) {
    assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0, `${record.relativePath} has invalid byte length`);
    assert.match(record.sha256 ?? "", HASH64, `${record.relativePath} has invalid SHA-256`);
    assert.ok(!record.relativePath.startsWith("reports/"), "reports cannot inflate the 70-artifact ledger");
  }
  return true;
}

async function verifyReadback(output, records) {
  const expected = new Map(records.map((record) => [record.relativePath, record]));
  for (const relativePath of EXPECTED_REVIEW_PATHS) {
    const bytes = await readFile(path.join(output, ...relativePath.split("/")));
    const record = expected.get(relativePath);
    assert.equal(bytes.length, record.bytes, `${relativePath} readback byte length differs`);
    assert.equal(sha256(bytes), record.sha256, `${relativePath} readback SHA-256 differs`);
  }
  return true;
}

function publicFreezeMatches(before, after) {
  assert.deepEqual(after, before, "frozen public supporting-route source changed during capture");
  return true;
}

function parseArguments(argv) {
  const options = {
    output: null,
    browser: process.env.CHROME_PATH ?? null,
    smoke: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--output", "--browser", "--chrome"].includes(value)) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${value} requires a value`);
      if (value === "--output") options.output = next;
      else options.browser = next;
      index += 1;
    } else if (value.startsWith("--output=")) options.output = value.slice("--output=".length);
    else if (value.startsWith("--browser=")) options.browser = value.slice("--browser=".length);
    else if (value.startsWith("--chrome=")) options.browser = value.slice("--chrome=".length);
    else if (value === "--smoke") options.smoke = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

async function canonicalOutput(value) {
  if (!value) throw new Error("--output is required");
  const requested = assertDurableExternalPath(value);
  const requestedParent = path.dirname(requested);
  let existingAncestor = requestedParent;
  while (!(await exists(existingAncestor))) {
    const next = path.dirname(existingAncestor);
    if (next === existingAncestor) throw new Error(`No existing ancestor for capture output: ${requested}`);
    existingAncestor = next;
  }
  const realAncestor = await realpath(existingAncestor);
  const unresolvedTail = path.relative(existingAncestor, requestedParent);
  const candidateParent = path.resolve(realAncestor, unresolvedTail);
  assertDurableExternalPath(candidateParent);
  await mkdir(candidateParent, { recursive: true });
  const parent = await realpath(candidateParent);
  const canonical = assertDurableExternalPath(path.join(parent, path.basename(requested)));
  if (await exists(canonical)) throw new Error(`Refusing to overwrite existing output: ${canonical}`);
  return canonical;
}

export async function runCapture({ output: outputValue, browserPath = null, smoke = false } = {}) {
  assertRouteData();
  const plan = JSON.parse(await readFile(CAPTURE_PLAN_PATH, "utf8"));
  validateCapturePlan(plan);
  assert.deepEqual(plan.requiredRouteArtifacts, ROUTE_ARTIFACTS, "capture-plan route artifact contract differs");
  assert.deepEqual(plan.requiredCrossRouteArtifacts, CROSS_ROUTE_ARTIFACTS, "capture-plan cross-route artifact contract differs");
  assert.equal(plan.validationViewports.length, 13, "capture plan must contain 13 validation viewports");
  assert.deepEqual(plan.validationViewports, VIEWPORTS, "capture plan and route-data viewport matrices differ");

  const output = await canonicalOutput(outputValue);
  const staging = `${output}.staging-${process.pid}-${Date.now()}`;
  assertDurableExternalPath(staging);
  if (await exists(staging)) throw new Error(`Unexpected capture staging collision: ${staging}`);
  const scratch = path.join(staging, ".capture-scratch");
  const reports = path.join(staging, "reports");
  const browserExecutable = await resolveBrowser(browserPath);
  const axeSource = await readFile(path.join(ROOT, "node_modules", "axe-core", "axe.min.js"), "utf8");
  const publicBefore = await verifyPublicSourceFreeze(ROOT);
  let lab;
  let browser;
  let published = false;

  try {
    await mkdirInside(staging, path.join(staging, "routes"));
    await mkdirInside(staging, path.join(staging, "cross-route-system"));
    await mkdirInside(staging, reports);
    await mkdirInside(staging, scratch);

    lab = await startLab();
    const responsiveQa = await runResponsiveQa({ browserPath: browserExecutable, baseUrl: lab.baseUrl, smoke });
    validateResponsiveCoverage(responsiveQa, plan, { smoke });

    browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
    const requestLedger = { requests: [], responses: [], failed: [], blocked: [] };
    const browserErrors = [];
    const routeResults = [];
    for (const slug of ROUTE_ORDER) {
      routeResults.push(await captureRoute({
        browser,
        route: ROUTES[slug],
        baseUrl: lab.baseUrl,
        staging,
        scratch,
        axeSource,
        requestLedger,
        browserErrors,
      }));
    }
    await browser.close();
    browser = null;
    if (browserErrors.length) throw new Error(`Route capture browser errors: ${JSON.stringify(browserErrors)}`);
    const requestIsolation = validateRequestIsolation(requestLedger, lab.baseUrl);
    const axeScans = routeResults.flatMap(({ axe }) => axe);
    assert.equal(axeScans.length, 18, "Axe must scan desktop and mobile for every route");

    await buildCrossRouteArtifacts({ staging, routeResults });
    await rm(scratch, { recursive: true, force: true });
    const publicAfter = await verifyPublicSourceFreeze(ROOT);
    publicFreezeMatches(publicBefore, publicAfter);

    const captureStatus = smoke ? "SMOKE" : "PASS";
    const captureReport = {
      schema: CAPTURE_SCHEMA,
      status: captureStatus,
      mode: smoke ? "smoke" : "full",
      canary: CANARY,
      provenance: {
        type: "local-authored-preproduction",
        public: false,
        loopbackOnly: true,
        acceptedPhase5A: ACCEPTED_PHASE5A_SHA,
        publicSupportingRoutesChanged: false,
      },
      routes: routeResults.map(({ route, publicPathReference, artifacts, validationViewports }) => ({ route, publicPathReference, artifacts, validationViewports })),
      routeCount: routeResults.length,
      validationScenarios: VALIDATION_SCENARIOS,
      responsiveQa,
      axe: { status: "PASS", scans: axeScans.length, seriousOrCriticalViolations: 0 },
      requestIsolation,
      generatedReviewMediaTracked: false,
      rawCapturesPackaged: false,
      publicRoutesChanged: false,
      phase5BAuthorized: false,
      humanVisualJudgmentAuthoritative: true,
    };
    const accessibilityReport = {
      schema: ACCESSIBILITY_SCHEMA,
      status: "PASS",
      viewports: ["1440x900", "390x844"],
      scans: axeScans,
      seriousOrCriticalViolations: 0,
      keyboardAndTargetQa: responsiveQa.coverage,
    };
    const publicFreezeReport = {
      schema: PUBLIC_FREEZE_SCHEMA,
      status: "PASS",
      acceptedPhase5A: ACCEPTED_PHASE5A_SHA,
      files: publicAfter,
      publicRoutesChanged: false,
      phase5BAuthorized: false,
    };
    await writeInside(staging, path.join(reports, "route-capture-report.json"), `${JSON.stringify(captureReport, null, 2)}\n`);
    await writeInside(staging, path.join(reports, "accessibility.json"), `${JSON.stringify(accessibilityReport, null, 2)}\n`);
    await writeInside(staging, path.join(reports, "request-isolation.json"), `${JSON.stringify(requestIsolation, null, 2)}\n`);
    await writeInside(staging, path.join(reports, "public-source-freeze.json"), `${JSON.stringify(publicFreezeReport, null, 2)}\n`);
    await writeInside(staging, path.join(staging, "README.md"), [
      "# Phase 5A-R supporting-route visual preproduction",
      "",
      "This directory contains compact local-only human-review evidence. The 70 review artifacts are exactly 9 route folders × 7 files plus 7 cross-route files. Reports and the manifest are separate evidence authorities and are not counted as review artifacts.",
      "",
      "Desktop and portrait storyboards are full-page captures. Each short-landscape route sheet contains 740×360, 800×360, 844×390, 896×414 and 900×480. Signature sheets contain four to six route-specific states. Material boards present one decisive material system per route.",
      "",
      "The public supporting routes remain byte-identical to accepted Phase 5A. No public route was written, no external network request was made, raw capture frames were removed, and Phase 5B remains unauthorized. Human visual judgment remains authoritative.",
      "",
    ].join("\n"));

    const records = await artifactRecords(staging);
    validateArtifactLedger(records);
    const manifest = {
      schema: MANIFEST_SCHEMA,
      status: captureStatus,
      mode: smoke ? "smoke" : "full",
      provenance: "local speculative preproduction",
      canary: CANARY,
      acceptedPhase5A: ACCEPTED_PHASE5A_SHA,
      routes: ROUTE_ORDER,
      routeArtifactsPerRoute: 7,
      crossRouteArtifacts: 7,
      artifacts: records,
      totals: {
        artifacts: records.length,
        bytes: records.reduce((total, record) => total + record.bytes, 0),
      },
      reportsExcludedFromArtifactCount: true,
      rawCapturesPackaged: false,
      publicRoutesChanged: false,
      phase5BAuthorized: false,
      humanVisualJudgmentAuthoritative: true,
      humanGates: "all pending",
    };
    if (!smoke) validateManifestData(manifest);
    await writeInside(staging, path.join(staging, "route-preproduction-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    if (!smoke) await verifyEvidence({ root: ROOT, evidenceRoot: staging });

    await rename(staging, output);
    published = true;
    await verifyReadback(output, records);
    const publicReadback = await verifyPublicSourceFreeze(ROOT);
    publicFreezeMatches(publicBefore, publicReadback);
    if (!smoke) await verifyEvidence({ root: ROOT, evidenceRoot: output });
    return {
      schema: CAPTURE_SCHEMA,
      status: captureStatus,
      output,
      routes: ROUTE_ORDER.length,
      reviewArtifacts: records.length,
      reviewBytes: manifest.totals.bytes,
      manifest: path.join(output, "route-preproduction-manifest.json"),
      reports: 4,
      requestIsolation: "PASS",
      publicRoutesChanged: false,
      phase5BAuthorized: false,
    };
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    if (published) await rm(output, { recursive: true, force: true }).catch(() => {});
    else await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally {
    await stopLab(lab);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write([
      "Phase 5A-R supporting-route artifact capture",
      "",
      "Usage:",
      "  node scripts/capture-phase5ar-supporting-routes.mjs --output <fresh-durable-external-directory> [--browser <path>] [--smoke]",
      "",
      "--smoke creates the exact artifact structure but records reduced base-viewport QA and is not a final PASS authority.",
      "",
    ].join("\n"));
    return;
  }
  const result = await runCapture({ output: options.output, browserPath: options.browser, smoke: options.smoke });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Phase 5A-R supporting-route capture failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
