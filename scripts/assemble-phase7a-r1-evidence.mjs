#!/usr/bin/env node

/**
 * Assemble a fresh, governed Phase 7A-R1 review-evidence directory.
 *
 * The assembler deliberately consumes only already-validated external capture
 * products. It never republishes raw capture manifests, HTML specimens, font
 * files, executable paths, local origins or private filesystem paths. The
 * resulting directory is validated against the R1 packager before publication.
 */

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  FROZEN_MAIN,
  PHASE7A_GATES,
  PHASE7A_PARENT,
  PHASE7A_R1_BRANCH,
  PHASE7A_R1_PARENT,
  PHYSICAL_ASSETS,
  PUBLIC_ROUTES,
} from "./phase7a-contract.mjs";
import {
  GOVERNANCE_PATH,
  GOVERNANCE_SCHEMA,
  PRIOR_HUMAN_DECISIONS,
  REQUIRED_EVIDENCE,
  collectEvidenceDirectory,
  stableJson,
} from "./package-phase7a-r1-review.mjs";
import { REAL_404_PATH, validateRecordingReport } from "./phase7a-browser-contract.mjs";
import { validateScenarioStates } from "./capture-phase7a-review-evidence.mjs";
import {
  MINIMUM_MANIFESTO_SAFETY_PX,
  PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS,
  validateManifestoClippingAuthority,
  validateManifestoGeometry,
} from "./phase7a-manifesto-geometry.mjs";
import { assertTargetSizePass } from "./phase7a-target-size.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT = fileURLToPath(import.meta.url);

export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
export const ASSEMBLER_SCHEMA = "quantum-hub.phase-7a-r1.evidence-assembler.v1";
export const PHASE7A_R1_BRANCH_URL = "https://repair-phase-7a-r1-signal-fi.qsite1.pages.dev/";
export const EXPECTED_QA_ROUTE_COUNTS = Object.freeze({ chromium: 130, firefox: 34, webkit: 34 });
export const EXPECTED_QA_RESPONSIVE_MINIMUMS = Object.freeze({ chromium: 20, firefox: 4, webkit: 4 });
export const SIGNAL_COMPARISON_RECORDING_SCHEMA = "quantum-hub.phase-7a-r1.signal-field-comparison-recordings.v1";
export const SERVED_BUILD_AUTHORITY_SCHEMA = "quantum-hub.phase-7a-r1.served-build-authority.v1";
export const PORTABLE_SERVED_BUILD_SCHEMA = "quantum-hub.phase-7a-r1.portable-served-build-receipt.v1";
export const INSTALLED_CHROME_UI_SCHEMA = "quantum-hub.phase-7a-r1.installed-chrome-ui-evidence.v1";
export const PRODUCTION_DIFF_PATHS = Object.freeze([
  ".nvmrc",
  "astro.config.mjs",
  "package-lock.json",
  "package.json",
  "public",
  "src",
  "tsconfig.json",
]);
export const EXACT_PARENT_HOME_DOCUMENT_AUTHORITY = Object.freeze({
  bytes: 17_917,
  revision: PHASE7A_R1_PARENT,
  sha256: "2c153d9094fe0ca888cbbc7ac4105a775b2ac5b088b47b650d542c2a9cb62cac",
});
export const EXACT_PARENT_RUNTIME_ASSET_AUTHORITY = Object.freeze({
  revision: PHASE7A_R1_PARENT,
  derivation: "immutable linked CSS/JavaScript bytes from the exact-parent governed build",
  fingerprint: "223c3e7a5fce599b7818e3f19d3c786e4f67fca85b5fcc60f9f1e3d58304b3d7",
  records: Object.freeze([
    Object.freeze({ kind: "css", route: "/_astro/BaseLayout.ByjrAQMG.css", bytes: 12_579, sha256: "0967a69765cc49c6291e125d44958bb19694d1c74fe028e17f6f095bd1109f68" }),
    Object.freeze({ kind: "css", route: "/_astro/index.CMvgVrhb.css", bytes: 17_131, sha256: "a9932a0eed64df5c5a5ebc35067b003558644bbddb8c179227364c1b340c0691" }),
    Object.freeze({ kind: "javascript", route: "/_astro/index.astro_astro_type_script_index_0_lang.DuXUZIF3.js", bytes: 2_604, sha256: "05006aae308ac99e9f16bb4c7d93b75f41e8766ea06aaf9d8c3d19fb1a7bb52a" }),
  ]),
});
export const SIGNAL_COMPARISON_RECORDING_CONTRACT = Object.freeze({
  audioStreams: 0,
  codec: "h264",
  container: "mp4",
  durationSeconds: 6,
  fps: 30,
  height: 720,
  maximumSeconds: 6.6,
  minimumSeconds: 5.5,
  pixelFormat: "yuv420p",
  videoStreams: 1,
  width: 1280,
});
export const SIGNAL_COMPARISON_RECORDING_SPECS = Object.freeze([
  Object.freeze({ id: "chromium-before-parent", engine: "chromium", state: "before", sourceKind: "exact-parent", relativePath: "recordings/signal-field-comparison/chromium-before-parent.mp4", boundedPointerResponse: false }),
  Object.freeze({ id: "chromium-after-r1", engine: "chromium", state: "after", sourceKind: "phase-7a-r1", relativePath: "recordings/signal-field-comparison/chromium-after-r1.mp4", boundedPointerResponse: true }),
  Object.freeze({ id: "firefox-before-parent", engine: "firefox", state: "before", sourceKind: "exact-parent", relativePath: "recordings/signal-field-comparison/firefox-before-parent.mp4", boundedPointerResponse: false }),
  Object.freeze({ id: "firefox-after-r1", engine: "firefox", state: "after", sourceKind: "phase-7a-r1", relativePath: "recordings/signal-field-comparison/firefox-after-r1.mp4", boundedPointerResponse: true }),
]);
export const REQUIRED_CLOSURE_JSON = Object.freeze([
  "closure-manifest.json",
  "capture-summary.json",
  "provenance/served-build-authority.json",
  "responsive/geometry-before.json",
  "responsive/geometry-after.json",
  "signal-field/comparison.json",
  "recordings/signal-field-comparison/report.json",
  "audience-bifurcation/report.json",
  "typography/configuration-licences-hashes.json",
  "field-map/semantic-isolation.json",
  "target-size/element-inventory.json",
  "fallback/report.json",
  "firefox-first-paint/report.json",
  "accessibility/chromium.json",
  "accessibility/firefox.json",
  "route-shells/report.json",
]);

const PRIVATE_PATH = /(?:\b[a-z]:[\\/](?:users|documents|program files|windows|temp)[\\/]|(?:^|[\s"'(=:\[{])\/(?:users|home|private|tmp|root|workspace|workspaces|mnt\/[a-z])\/|\b(?:onedrive|appdata)\b|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/)/i;
const LOCAL_ORIGIN = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?/i;
const LOCAL_ORIGIN_GLOBAL = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?/gi;
const URL_KEY = /^(?:baseUrl|beforeBaseUrl|afterBaseUrl|cdpUrl|immutableUrl|branchUrl|url)$/i;
const PRIVATE_KEY = /(?:absolutePath|executablePath|localPath|output(?:Dir|Path)?|repositoryRoot|sourceRoot)/i;
const SAFE_IMAGE = /\.(?:png|jpe?g)$/i;
const SAFE_VIDEO = /\.mp4$/i;
const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const QA_ROUTE_CHECKS = Object.freeze(["status", "oneH1", "expectedH1", "landmarks", "noHorizontalOverflow", "targetSizes", "console"]);
const QA_RESPONSIVE_CHECKS = Object.freeze(["oneH1", "expectedH1", "landmarks", "noHorizontalOverflow", "targetSizes", "manifestoResolved", "wholeWords", "h1Fits", "console"]);
const QA_FIELD_MAP_CHECKS = Object.freeze(["focusBefore", "eightLinks", "ordinaryLinks", "targetSizes", "backgroundInert", "keyboardContained", "fullViewport", "escapeCloses", "focusReturn", "inertReleased", "repeatedCyclesRestore"]);
const INSTALLED_CHROME_ZOOM_CHECKS = Object.freeze(["installedChromeUi", "widthHalved", "dprDoubled", "noDeviceEmulation"]);
const INSTALLED_CHROME_ROUTE_CHECKS = Object.freeze(["httpStatus", "semanticH1", "landmarks", "noHorizontalOverflow", "wholeWords", "targetSizes", "manifestoUnclipped"]);
const FIELD_MAP_NAMES = Object.freeze([
  "00 Home 00 / origin",
  "01 For industry 01 / need",
  "02 For startups 02 / capability",
  "03 Industries 03 / context",
  "04 Proof 04 / evidence",
  "05 SPARK 05 / programme",
  "06 About 06 / position",
  "07 Contact 07 / signal",
]);
const FIELD_MAP_HREFS = Object.freeze(["/#entry", "/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/spark/", "/about/", "/contact/"]);
const FIELD_MAP_BASE_NAMES = Object.freeze(["Home", "For industry", "For startups", "Industries", "Proof", "SPARK", "About", "Contact"]);
const LIFECYCLE_CHECKS = Object.freeze(["tenCycles", "forwardLatestPosition", "reverseExactTop", "reverseClearsManifesto", "noIdleRaf", "noIntervals"]);
const NETWORK_CHECKS = Object.freeze(["semanticH1", "noOverflow", "boundedRequests"]);
const SIGNAL_RECORDING_CHECKS = Object.freeze(["audioStreams", "codec", "constantFrameRate", "container", "decodedFrames", "dimensions", "duration", "fullDecode", "oneVideoStream", "otherStreams", "pixelFormat"]);
const DEPLOYMENT_CHECKS = Object.freeze([
  "repositoryAndFrozenMainProvenance",
  "signedCloudflareCheckBindsDeployedShaAndUrls",
  "immutableExactByteContentAndRouteParity",
  "branchExactByteContentAndRouteParity",
  "real404StatusCanonicalAndNoindex",
  "cacheMimeAndSecurityHeaders",
]);
const FIREFOX_FIRST_PAINT_SCHEMA = "quantum-hub.phase-7a-r1.firefox-first-paint.v1";
const FIREFOX_FIRST_PAINT_PASS = "earlier white frame not reproduced; evidence is consistent with capture initialization or browser/window exposure rather than page paint";
const FIREFOX_FIRST_PAINT_LIMITATION = "white frame belongs to capture initialization or browser/window exposure; document dark-background authority was present";
const FIREFOX_FIRST_PAINT_ORDER = Object.freeze(["navigation-commit", "html-attached", "navigation-start-screenshot", "response-body-read-start", "response-body-read-complete", "first-stable-paint-screenshot"]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExactCheckMap(checks, expectedKeys, label, { allowedFalse = [] } = {}) {
  invariant(checks && typeof checks === "object" && !Array.isArray(checks), `${label} check map is missing`);
  const actual = Object.keys(checks).sort();
  const expected = [...expectedKeys].sort();
  invariant(actual.length > 0 && JSON.stringify(actual) === JSON.stringify(expected), `${label} check inventory differs`);
  const falseAllowed = new Set(allowedFalse);
  for (const key of expectedKeys) invariant(checks[key] === true || (checks[key] === false && falseAllowed.has(key)), `${label} check failed: ${key}`);
  return true;
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function relativePosix(parent, candidate) {
  return path.relative(parent, candidate).replaceAll("\\", "/");
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function safeString(value) {
  let output = String(value ?? "");
  output = output.replace(LOCAL_ORIGIN_GLOBAL, "CAPTURE_ORIGIN");
  output = output
    .replace(/[a-z]:[\\/](?:users|documents|program files|windows|temp)[\\/][^\r\n\t"'<>]*/gi, "[private-path-removed]")
    .replace(/\/(?:users|home|private|tmp|root|workspace|workspaces|mnt\/[a-z])\/[^\r\n\t"'<>]*/gi, "[private-path-removed]")
    .replace(/file:\/\/[^\r\n\t"'<>]*/gi, "[private-path-removed]")
    .replace(/\b(?:OneDrive|AppData)\b/gi, "[private-location-removed]");
  invariant(!PRIVATE_PATH.test(output), "sanitization left a private path marker");
  return output;
}

/** Remove capture origins and private machine fields from a report fragment. */
export function sanitizeForPackage(value) {
  if (typeof value === "string") return safeString(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeForPackage(entry));
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      if (URL_KEY.test(key) || PRIVATE_KEY.test(key)) continue;
      output[key] = sanitizeForPackage(entry);
    }
    return output;
  }
  return value;
}

export function containsPrivatePath(value) {
  return PRIVATE_PATH.test(String(value));
}

function assertPass(record, label) {
  invariant(record && typeof record === "object" && !Array.isArray(record), `${label} is missing`);
  invariant(record.status === "PASS", `${label} must record PASS`);
  return record;
}

function validPixelRecord(record, label) {
  invariant(record && typeof record === "object" && !Array.isArray(record), `${label} pixel evidence is missing`);
  invariant(Number.isInteger(record.width) && record.width > 0 && Number.isInteger(record.height) && record.height > 0, `${label} pixel dimensions are invalid`);
  invariant(Number.isFinite(record.nearWhitePixelRatio) && record.nearWhitePixelRatio >= 0 && record.nearWhitePixelRatio <= 1, `${label} near-white ratio is invalid`);
}

function hasDarkComputedAuthority(computed) {
  if (!computed || typeof computed !== "object" || Array.isArray(computed)) return false;
  const dark = /rgb\(\s*(?:7\s*,\s*9\s*,\s*10|8\s*,\s*11\s*,\s*12)\s*\)/i;
  return dark.test(computed.htmlBackground ?? "") || dark.test(computed.bodyBackground ?? "");
}

/** Accept only the two evidenced Firefox first-paint outcomes emitted by closure capture. */
export function validateFirefoxFirstPaintReport(report) {
  invariant(report && typeof report === "object" && !Array.isArray(report), "Firefox first-paint clarification is missing");
  invariant(report.schema === FIREFOX_FIRST_PAINT_SCHEMA, "Firefox first-paint schema differs");
  invariant(report.responseStatus === 200, "Firefox first-paint document response differs");
  validPixelRecord(report.navigationStart?.pixels, "Firefox navigation-start");
  validPixelRecord(report.firstStablePaint?.pixels, "Firefox stable-paint");
  invariant(report.navigationStart.pixels.width === report.firstStablePaint.pixels.width && report.navigationStart.pixels.height === report.firstStablePaint.pixels.height, "Firefox first-paint capture dimensions differ");
  invariant(report.documentAuthority?.inlineDarkBackgroundAuthority === true, "Firefox first-paint inline dark-background authority is missing");
  invariant(report.documentAuthority?.colorSchemeAuthority === true, "Firefox first-paint dark color-scheme authority is missing");
  invariant(report.documentAuthority?.orderingProven === true, "Firefox first-paint dark document authority is absent or too late");
  invariant(report.timing?.navigationStartCapturedBeforeResponseBodyRead === true && JSON.stringify(report.timing.captureOrder?.map(({ step }) => step)) === JSON.stringify(FIREFOX_FIRST_PAINT_ORDER), "Firefox navigation-start evidence was not captured before response-body inspection");
  const elapsed = report.timing.captureOrder.map(({ elapsedMs }) => elapsedMs);
  invariant(elapsed.every((value, index) => Number.isFinite(value) && value >= 0 && (index === 0 || value >= elapsed[index - 1])), "Firefox first-paint capture timing is not monotonic");
  invariant(hasDarkComputedAuthority(report.navigationStart?.computed), "Firefox navigation-start computed dark-background authority is missing");
  invariant(hasDarkComputedAuthority(report.firstStablePaint?.computed), "Firefox stable-paint computed dark-background authority is missing");
  invariant(report.firstStablePaint.pixels.nearWhitePixelRatio < 0.95, "Firefox stable paint remains near-white");
  if (report.status === "PASS") {
    invariant(report.classification === FIREFOX_FIRST_PAINT_PASS, "Firefox first-paint PASS classification differs");
    invariant(report.navigationStart.pixels.nearWhitePixelRatio < 0.95, "Firefox first-paint PASS contradicts the navigation-start pixels");
    return { status: "PASS", boundedLimitation: false, classification: report.classification };
  }
  invariant(report.status === "LIMITATION", "Firefox first-paint status must be PASS or the bounded evidenced LIMITATION");
  invariant(report.classification === FIREFOX_FIRST_PAINT_LIMITATION, "Firefox first-paint LIMITATION classification differs");
  invariant(report.navigationStart.pixels.nearWhitePixelRatio >= 0.95, "Firefox first-paint LIMITATION lacks a near-white navigation-start capture");
  return { status: "LIMITATION", boundedLimitation: true, classification: report.classification };
}

function allPass(rows, label, expectedCount = null) {
  invariant(Array.isArray(rows), `${label} must be an array`);
  if (expectedCount !== null) invariant(rows.length === expectedCount, `${label} must contain exactly ${expectedCount} cases`);
  invariant(rows.length > 0 && rows.every((row) => row?.status === "PASS"), `${label} contains a missing or failed case`);
  return rows;
}

function targetReportPass(report, label) {
  assertPass(report, label);
  let recomputed;
  try { recomputed = assertTargetSizePass(report); }
  catch (error) { throw new Error(`${label} fails independent target validation: ${error.message}`); }
  const summary = report.summary ?? {};
  invariant((summary.targetFailures ?? report.targetFailures ?? 0) === 0, `${label} retains a genuine target failure`);
  invariant((summary.unexplainedExclusions ?? 0) === 0, `${label} retains an unexplained target exclusion`);
  invariant((summary.contractFailures ?? 0) === 0, `${label} retains a target contract failure`);
  invariant(recomputed.summary.targetFailures === summary.targetFailures && recomputed.summary.unexplainedExclusions === summary.unexplainedExclusions && recomputed.summary.contractFailures === summary.contractFailures, `${label} summary differs from independently validated records`);
}

/** Fail-closed validation for a single-engine R1 browser-QA result. */
export function validateQaReport(report, expectedEngine) {
  invariant(["chromium", "firefox", "webkit"].includes(expectedEngine), `unsupported QA engine: ${expectedEngine}`);
  invariant(report && typeof report === "object" && !Array.isArray(report), `${expectedEngine} QA report is missing`);
  invariant(report.authorityProfile === "phase7a-r1", `${expectedEngine} QA authority profile differs`);
  invariant(report.branch === PHASE7A_R1_BRANCH, `${expectedEngine} QA branch differs`);
  validatePortableServedBuildReceipt(report.servedBuild);
  invariant(Array.isArray(report.results) && report.results.length === 1, `${expectedEngine} QA must contain one engine result`);
  const result = report.results[0];
  invariant(result && typeof result === "object" && !Array.isArray(result), `${expectedEngine} QA engine result is missing`);
  invariant(result.identity?.engine === expectedEngine, `${expectedEngine} QA identity differs`);
  validatePortableSourceAuthority(result.sourceAuthority, report.servedBuild, `${expectedEngine} QA engine result`);
  assertExactCheckMap(result.fieldMap?.checks, QA_FIELD_MAP_CHECKS, `${expectedEngine} Field Map`, { allowedFalse: expectedEngine === "webkit" ? ["keyboardContained"] : [] });
  const failedFieldMapChecks = Object.entries(result.fieldMap.checks).filter(([, value]) => value !== true).map(([key]) => key);
  const webkitProxyFocusLimitation = expectedEngine === "webkit"
    && report.status === "FAIL"
    && result.status === "FAIL"
    && /WebKit proxy/i.test(result.identity?.authority ?? "")
    && JSON.stringify(result.failures) === JSON.stringify(["field-map"])
    && result.fieldMap?.status === "FAIL"
    && JSON.stringify(failedFieldMapChecks) === JSON.stringify(["keyboardContained"])
    && result.fieldMap?.tabFocus?.inMap === false;
  invariant(
    (report.status === "PASS" && result.status === "PASS" && Array.isArray(result.failures) && result.failures.length === 0)
      || webkitProxyFocusLimitation,
    `${expectedEngine} QA retains failures beyond the bounded WebKit proxy focus limitation`,
  );
  allPass(result.routes, `${expectedEngine} route matrix`, EXPECTED_QA_ROUTE_COUNTS[expectedEngine]);
  for (const [index, item] of result.routes.entries()) {
    assertExactCheckMap(item.checks, QA_ROUTE_CHECKS, `${expectedEngine} route case ${index}`);
    targetReportPass(item.state?.targetSize, `${expectedEngine} route target case ${index}`);
  }
  allPass(result.accessibility, `${expectedEngine} accessibility matrix`, 20);
  invariant(result.accessibility.every((item) => item.accessibility?.status === "PASS" && (item.accessibility?.violations?.length ?? 0) === 0), `${expectedEngine} accessibility matrix contains violations`);
  allPass(result.responsive, `${expectedEngine} responsive matrix`);
  invariant(result.responsive.length >= EXPECTED_QA_RESPONSIVE_MINIMUMS[expectedEngine], `${expectedEngine} responsive coverage is incomplete`);
  for (const [index, item] of result.responsive.entries()) {
    const expectedChecks = Object.hasOwn(item.checks ?? {}, "verticalClipping") ? [...QA_RESPONSIVE_CHECKS, "verticalClipping"] : QA_RESPONSIVE_CHECKS;
    assertExactCheckMap(item.checks, expectedChecks, `${expectedEngine} responsive case ${index}`);
    targetReportPass(item.state?.targetSize, `${expectedEngine} responsive target case ${index}`);
  }
  if (!webkitProxyFocusLimitation) assertPass(result.fieldMap, `${expectedEngine} Field Map`);
  targetReportPass(result.fieldMap.openTargets, `${expectedEngine} Field Map targets`);
  invariant(result.fieldMap.status === "PASS" || webkitProxyFocusLimitation, `${expectedEngine} Field Map contains a failed check`);
  invariant(result.fallback && typeof result.fallback === "object", `${expectedEngine} fallback report is missing`);
  for (const name of ["reducedMotion", "noJavaScript", "fallbackFont"]) assertPass(result.fallback[name], `${expectedEngine} ${name} fallback`);
  assertPass(result.history, `${expectedEngine} history traversal`);
  assertPass(result.cycles, `${expectedEngine} lifecycle cycles`);
  invariant(Array.isArray(result.cycles.samples) && result.cycles.samples.length === 10, `${expectedEngine} lifecycle must contain ten cycles`);
  allPass(result.network, `${expectedEngine} network cases`, 2);
  invariant(new Set(result.network.map(({ policy }) => policy)).size === 2, `${expectedEngine} network policies are duplicated`);
  return result;
}

/** Strict installed-Chrome report checks, separated for fixture testing. */
export function validateInstalledChromeReport(report) {
  assertPass(report, "installed Chrome 200% report");
  validatePortableServedBuildReceipt(report.servedBuild);
  validatePortableSourceAuthority(report.sourceAuthority, report.servedBuild, "installed Chrome run");
  invariant(report.classification === "GENUINE INSTALLED GOOGLE CHROME BROWSER ZOOM", "installed Chrome evidence classification differs");
  assertPass(report.zoomProof, "installed Chrome zoom proof");
  invariant(report.zoomProof.uiZoomLabel === "Zoom: 200%", "installed Chrome visible zoom label differs");
  assertExactCheckMap(report.zoomProof.checks, INSTALLED_CHROME_ZOOM_CHECKS, "installed Chrome zoom proof");
  invariant(report.forbiddenSubstitutes?.viewportResize === false && report.forbiddenSubstitutes?.cssZoom === false && report.forbiddenSubstitutes?.transformScale === false && report.forbiddenSubstitutes?.deviceEmulation === false, "installed Chrome evidence used a forbidden substitute");
  allPass(report.routes, "installed Chrome routes", 10);
  for (const [index, route] of report.routes.entries()) {
    validatePortableSourceAuthority(route.sourceAuthority, report.servedBuild, `installed Chrome route ${index + 1}`);
    assertExactCheckMap(route.checks, INSTALLED_CHROME_ROUTE_CHECKS, `installed Chrome route ${index}`);
    targetReportPass(route.state?.targetSize, `installed Chrome route target ${index}`);
  }
  const homeRoutes = report.routes.filter(({ path: routePath }) => routePath === "/");
  const expectedRoutePaths = [...PUBLIC_ROUTES.map(({ route }) => route), REAL_404_PATH];
  invariant(report.routes.every(({ path: routePath }, index) => routePath === expectedRoutePaths[index]), "installed Chrome route order/membership differs");
  invariant(homeRoutes.length === 1, "installed Chrome route authority must contain one Home route");
  const home = homeRoutes[0];
  const visibility = home.state?.manifestoVisibility;
  invariant(home.checks.manifestoUnclipped === true && visibility?.applicable === true && visibility.status === "PASS", "installed Chrome Home manifesto clipping status differs");
  const rect = (value, label) => {
    invariant(value && typeof value === "object" && !Array.isArray(value), `${label} is missing`);
    for (const key of ["left", "top", "right", "bottom", "width", "height"]) invariant(Number.isFinite(value[key]), `${label} has a nonnumeric ${key}`);
    invariant(value.width > 0 && value.height > 0 && Math.abs(value.width - (value.right - value.left)) < 0.05 && Math.abs(value.height - (value.bottom - value.top)) < 0.05, `${label} geometry differs`);
    return value;
  };
  const viewport = rect(visibility.viewportBounds, "installed Chrome Home viewport bounds");
  const sectionBounds = rect(visibility.sectionBounds, "installed Chrome Home section bounds");
  const sectionClipBounds = rect(visibility.sectionClipBounds, "installed Chrome Home section client bounds");
  const usableClipBounds = rect(visibility.usableClipBounds, "installed Chrome Home usable clip bounds");
  const effective = rect(visibility.effectiveVisibleBounds, "installed Chrome Home effective visible bounds");
  const h1Bounds = rect(visibility.h1Bounds, "installed Chrome Home H1 bounds");
  const glyphBounds = rect(visibility.glyphBounds, "installed Chrome Home glyph bounds");
  const headerBounds = rect(visibility.header?.bounds, "installed Chrome sticky-header bounds");
  invariant(typeof visibility.header.visible === "boolean", "installed Chrome sticky-header visibility authority differs");
  const expectedHeaderAnchor = ["fixed", "sticky"].includes(visibility.header.position) && headerBounds.top <= viewport.top + 0.5 && headerBounds.bottom > viewport.top;
  const expectedHeaderOverlap = headerBounds.right > h1Bounds.left && headerBounds.left < h1Bounds.right;
  invariant(expectedHeaderAnchor === true && visibility.header.anchoredToViewportTop === expectedHeaderAnchor, "installed Chrome sticky-header anchor authority differs");
  invariant(expectedHeaderOverlap === true && visibility.header.horizontallyOverlapsManifesto === expectedHeaderOverlap, "installed Chrome sticky-header overlap authority differs");
  const expectedHeaderOcclusion = visibility.header.visible && expectedHeaderAnchor && expectedHeaderOverlap;
  invariant(visibility.header.occluding === expectedHeaderOcclusion, "installed Chrome sticky-header occlusion authority differs");
  invariant(sectionClipBounds.left >= sectionBounds.left - 0.05 && sectionClipBounds.top >= sectionBounds.top - 0.05 && sectionClipBounds.right <= sectionBounds.right + 0.05 && sectionClipBounds.bottom <= sectionBounds.bottom + 0.05, "installed Chrome section client bounds escape the section rectangle");
  invariant(Array.isArray(visibility.clippingAncestors), "installed Chrome clipping-ancestor authority is missing");
  const expectedUsableClipBounds = {
    left: Math.max(viewport.left, sectionClipBounds.left),
    top: Math.max(viewport.top, sectionClipBounds.top),
    right: Math.min(viewport.right, sectionClipBounds.right),
    bottom: Math.min(viewport.bottom, sectionClipBounds.bottom),
  };
  const clippingOverflow = new Set(["auto", "clip", "hidden", "scroll"]);
  for (const [index, ancestor] of visibility.clippingAncestors.entries()) {
    const bounds = rect(ancestor?.bounds, `installed Chrome clipping ancestor ${index + 1} bounds`);
    const contain = String(ancestor.contain || "").split(/\s+/);
    const paintContainment = contain.some((token) => ["content", "paint", "strict"].includes(token));
    const pathClipping = String(ancestor.clipPath || "none") !== "none";
    const clipsX = clippingOverflow.has(ancestor.overflowX) || paintContainment || pathClipping;
    const clipsY = clippingOverflow.has(ancestor.overflowY) || paintContainment || pathClipping;
    invariant(ancestor.clipsX === clipsX && ancestor.clipsY === clipsY && (clipsX || clipsY), `installed Chrome clipping ancestor ${index + 1} authority differs`);
    if (clipsX) { expectedUsableClipBounds.left = Math.max(expectedUsableClipBounds.left, bounds.left); expectedUsableClipBounds.right = Math.min(expectedUsableClipBounds.right, bounds.right); }
    if (clipsY) { expectedUsableClipBounds.top = Math.max(expectedUsableClipBounds.top, bounds.top); expectedUsableClipBounds.bottom = Math.min(expectedUsableClipBounds.bottom, bounds.bottom); }
  }
  for (const edge of ["left", "top", "right", "bottom"]) invariant(Math.abs(usableClipBounds[edge] - expectedUsableClipBounds[edge]) < 0.05, `installed Chrome usable clip ${edge} differs from section/ancestor authority`);
  invariant(effective.left >= viewport.left && effective.top >= viewport.top && effective.right <= viewport.right && effective.bottom <= viewport.bottom, "installed Chrome effective visible bounds escape the viewport");
  if (expectedHeaderOcclusion) invariant(headerBounds.bottom > viewport.top && effective.top >= Math.min(viewport.bottom, headerBounds.bottom) - 0.05, "installed Chrome effective visible bounds omit the visible sticky-header bottom");
  const expectedEffectiveBounds = {
    left: usableClipBounds.left,
    top: Math.max(usableClipBounds.top, expectedHeaderOcclusion ? Math.min(viewport.bottom, headerBounds.bottom) : viewport.top),
    right: usableClipBounds.right,
    bottom: usableClipBounds.bottom,
  };
  for (const edge of ["left", "top", "right", "bottom"]) invariant(Math.abs(effective[edge] - expectedEffectiveBounds[edge]) < 0.05, `installed Chrome effective visible ${edge} differs from usable-clip/header authority`);
  invariant(home.state?.h1Bounds && Math.abs(home.state.h1Bounds.top - h1Bounds.top) < 0.05 && Math.abs(home.state.h1Bounds.bottom - h1Bounds.bottom) < 0.05, "installed Chrome Home H1 bounds disagree across the report");
  const derivedAllowances = {
    h1Top: h1Bounds.top - effective.top,
    h1Bottom: effective.bottom - h1Bounds.bottom,
    h1Left: h1Bounds.left - effective.left,
    h1Right: effective.right - h1Bounds.right,
    glyphTop: glyphBounds.top - effective.top,
    glyphBottom: effective.bottom - glyphBounds.bottom,
    glyphLeft: glyphBounds.left - effective.left,
    glyphRight: effective.right - glyphBounds.right,
  };
  for (const [key, value] of Object.entries(derivedAllowances)) {
    invariant(Number.isFinite(visibility.safeAllowances?.[key]) && Math.abs(visibility.safeAllowances[key] - value) < 0.05, `installed Chrome Home safe allowance differs: ${key}`);
    invariant(value >= 2, `installed Chrome Home intersects the effective visible boundary: ${key}`);
  }
  invariant(Array.isArray(report.visualEvidence) && report.visualEvidence.length === 15, "installed Chrome visual evidence must contain exactly 15 decoded PNG records");
  const visualNames = new Set();
  const visualLabels = new Set();
  for (const [index, visual] of report.visualEvidence.entries()) {
    invariant(visual && typeof visual === "object" && !Array.isArray(visual), `installed Chrome visual ${index + 1} is missing`);
    invariant(visual.format === "png" && typeof visual.filename === "string" && path.posix.basename(visual.filename) === visual.filename && /\.png$/i.test(visual.filename), `installed Chrome visual ${index + 1} is not a portable PNG`);
    invariant(typeof visual.label === "string" && visual.label.length > 0 && !visualLabels.has(visual.label), `installed Chrome visual ${index + 1} has a missing or duplicate label`);
    invariant(!visualNames.has(visual.filename.toLowerCase()), `installed Chrome visual filename is duplicated: ${visual.filename}`);
    invariant(Number.isSafeInteger(visual.width) && visual.width > 0 && Number.isSafeInteger(visual.height) && visual.height > 0 && Number.isSafeInteger(visual.bytes) && visual.bytes > 0, `installed Chrome visual ${index + 1} decoded dimensions/bytes differ`);
    invariant(Number.isFinite(visual.entropy) && visual.entropy >= 1 && Number.isFinite(visual.maximumChannelRange) && visual.maximumChannelRange >= 80, `installed Chrome visual ${index + 1} is blank or lacks visible contrast`);
    invariant(HASH_64.test(visual.sha256 ?? ""), `installed Chrome visual ${index + 1} hash differs`);
    validatePortableSourceAuthority(visual.sourceAuthority, report.servedBuild, `installed Chrome visual ${index + 1}`);
    visualNames.add(visual.filename.toLowerCase());
    visualLabels.add(visual.label);
  }
  const routeFilename = (routePath) => `${routePath === "/" ? "home" : routePath.replaceAll("/", "-").replace(/^-|-$/g, "")}-top.png`;
  const expectedVisuals = [
    ...expectedRoutePaths.map((routePath) => [`route:${routePath}`, routeFilename(routePath)]),
    ["home-field-map-closed", "home-field-map-closed.png"],
    ["home-bifurcation", "home-bifurcation.png"],
    ["home-field-map-open", "home-field-map-open.png"],
    ["home-field-map-keyboard-focus", "home-field-map-keyboard-focus.png"],
    ["home-field-map-escape-closed", "home-field-map-escape-closed.png"],
  ];
  for (const [label, filename] of expectedVisuals) invariant(report.visualEvidence.some((visual) => visual.label === label && visual.filename === filename), `installed Chrome visual state differs: ${label}`);
  const byLabel = new Map(report.visualEvidence.map((visual) => [visual.label, visual]));
  const homeStateHashes = expectedVisuals.slice(-5).map(([label]) => byLabel.get(label).sha256);
  invariant(new Set(homeStateHashes).size === homeStateHashes.length, "installed Chrome Home state visuals are blank-timed or materially identical");
  assertPass(report.fieldMap, "installed Chrome Field Map");
  validatePortableSourceAuthority(report.fieldMap.sourceAuthority, report.servedBuild, "installed Chrome Field Map");
  targetReportPass(report.fieldMap.targetSize, "installed Chrome Field Map targets");
  invariant(report.fieldMap.links === 8 && report.fieldMap.overflow === false, "installed Chrome Field Map structure or overflow differs");
  invariant(Array.isArray(report.fieldMap.visibleLinks) && report.fieldMap.visibleLinks.length === 8, "installed Chrome Field Map visible-link inventory differs");
  const mapViewport = home.state?.geometry;
  invariant(Number.isFinite(mapViewport?.innerWidth) && mapViewport.innerWidth > 0 && Number.isFinite(mapViewport?.innerHeight) && mapViewport.innerHeight > 0, "installed Chrome Field Map viewport authority is missing");
  for (const [index, link] of report.fieldMap.visibleLinks.entries()) {
    invariant(link?.accessibleName === FIELD_MAP_NAMES[index] && link?.href === FIELD_MAP_HREFS[index], `installed Chrome Field Map link ${index + 1} accessible authority differs`);
    invariant(link.visible === true && link.fullyInViewport === true, `installed Chrome Field Map link ${index + 1} is not visibly in viewport`);
    const bounds = rect(link.bounds, `installed Chrome Field Map link ${index + 1} bounds`);
    const derivedInViewport = bounds.left >= 0 && bounds.top >= 0 && bounds.right <= mapViewport.innerWidth && bounds.bottom <= mapViewport.innerHeight;
    invariant(derivedInViewport && bounds.width > 0 && bounds.height >= 44, `installed Chrome Field Map link ${index + 1} visible bounds differ`);
  }
  invariant(new Set(report.fieldMap.visibleLinks.map(({ accessibleName }) => accessibleName)).size === 8, "installed Chrome Field Map accessible names are not unique");
  invariant(Array.isArray(report.fieldMap.backgroundRegions) && report.fieldMap.backgroundRegions.length >= 3 && report.fieldMap.backgroundRegions.every(({ inert, owned }) => inert === true && owned === true), "installed Chrome Field Map inert state differs");
  invariant(report.fieldMap.keyboardFocus?.inMap === true && report.fieldMap.escapeFocusReturn === true && report.fieldMap.inertAfterEscape === 0, "installed Chrome Field Map keyboard/Escape restoration differs");
  return true;
}

export function validateInstalledChromeUiReport(report, observedImages = []) {
  assertPass(report, "installed Chrome UI confirmation");
  invariant(report.schema === INSTALLED_CHROME_UI_SCHEMA, "installed Chrome UI confirmation schema differs");
  invariant(Array.isArray(observedImages) && observedImages.length === 1, "installed Chrome UI confirmation requires exactly one decoded screenshot");
  const window = report.browserWindow;
  invariant(window?.product === "Google Chrome" && window.processName === "chrome.exe" && window.visible === true && window.remoteDebuggingProcessMatched === true && typeof window.title === "string" && window.title.trim().length > 0, "installed Chrome UI browser-window identity differs");
  const observation = report.visibleZoomObservation;
  invariant(observation?.method === "windows-ui-automation-accessibility-tree", "installed Chrome UI visible-label observation method differs");
  invariant(observation.chromeMenuVisible === true && observation.observedLabel === "200%" && report.visibleZoomConfirmation === true, "installed Chrome UI confirmation does not prove a visible 200% Chrome control");
  invariant(Array.isArray(report.screenshots) && report.screenshots.length === observedImages.length, "installed Chrome UI screenshot ledger size differs");
  const observedByPath = new Map(observedImages.map((image) => [image.relativePath, image]));
  invariant(observedByPath.size === observedImages.length, "installed Chrome UI observed screenshot paths are duplicated");
  const reportedPaths = new Set();
  for (const screenshot of report.screenshots) {
    const relativePath = validRelative(screenshot?.relativePath, "installed Chrome UI screenshot path");
    invariant(relativePath === "chrome-visible-200-percent.png", "installed Chrome UI screenshot filename differs");
    invariant(!reportedPaths.has(relativePath), `installed Chrome UI screenshot is duplicated: ${relativePath}`);
    const observed = observedByPath.get(relativePath);
    invariant(observed && screenshot.format === "png" && screenshot.bytes === observed.bytes && screenshot.sha256 === observed.sha256 && screenshot.width === observed.width && screenshot.height === observed.height && Math.abs(screenshot.entropy - observed.entropy) < 1e-12 && screenshot.maximumChannelRange === observed.maximumChannelRange, `installed Chrome UI screenshot bytes/decode binding differs: ${relativePath}`);
    invariant(screenshot.width > 0 && screenshot.height > 0 && screenshot.entropy >= 1 && screenshot.maximumChannelRange >= 80 && HASH_64.test(screenshot.sha256 ?? ""), `installed Chrome UI screenshot is blank or malformed: ${relativePath}`);
    reportedPaths.add(relativePath);
  }
  invariant(reportedPaths.has(observation.screenshot), "installed Chrome UI visible-label observation is not bound to a screenshot");
  return true;
}

function boundedBifurcation(inventory) {
  return inventory?.thresholdCount === 1
    && inventory.fieldCount === 1
    && inventory.architectureCount === 1
    && inventory.incomingCount === 1
    && inventory.industryCount === 1
    && inventory.startupCount === 1
    && inventory.branchCount === 2
    && inventory.edgeSignalCount === 1
    && inventory.junctionCount === 1
    && inventory.destinationCount === 2
    && JSON.stringify(inventory.destinationHrefs) === JSON.stringify(["/for-partners/", "/for-startups/"])
    && JSON.stringify(inventory.destinationNames) === JSON.stringify(["For industry", "For startups"]);
}

function validateServedDocument(record, label) {
  invariant(record?.channel === "node-fetch-response-body" && record.route === "/" && record.httpStatus === 200, `${label} served-document response authority differs`);
  invariant(typeof record.contentType === "string" && record.contentType.toLowerCase().includes("text/html"), `${label} served document is not HTML`);
  invariant(Number.isSafeInteger(record.bytes) && record.bytes > 0 && HASH_64.test(record.sha256 ?? ""), `${label} served-document fingerprint differs`);
}

function validateServedDom(signature, label) {
  invariant(signature?.channel === "playwright-chromium-live-dom" && signature.route === "/" && signature.responseStatus === 200, `${label} served DOM response authority differs`);
  invariant(signature.homeTitleCount === 1 && signature.signalFieldCount === 1, `${label} served DOM foundation differs`);
  invariant(signature.bifurcation && typeof signature.bifurcation === "object" && !Array.isArray(signature.bifurcation), `${label} served DOM bifurcation inventory is missing`);
  const countKeys = ["thresholdCount", "fieldCount", "architectureCount", "incomingCount", "industryCount", "startupCount", "branchCount", "edgeSignalCount", "junctionCount", "destinationCount"];
  for (const key of countKeys) invariant(Number.isSafeInteger(signature.bifurcation[key]) && signature.bifurcation[key] >= 0, `${label} served DOM count differs: ${key}`);
  invariant(signature.bifurcation.bounded === boundedBifurcation(signature.bifurcation), `${label} served DOM bounded-bifurcation summary is inconsistent`);
}

function runtimeAssetFingerprint(records) {
  invariant(Array.isArray(records) && records.length > 0, "runtime asset fingerprint requires records");
  return digest(Buffer.from(records.map(({ kind, route, bytes, sha256 }) => `${kind}\t${route}\t${bytes}\t${sha256}`).sort().join("\n"), "utf8"));
}

function validateRuntimeAsset(record, label, { served = false } = {}) {
  invariant(record && ["css", "javascript"].includes(record.kind) && typeof record.route === "string" && record.route.startsWith("/") && !record.route.includes(".."), `${label} runtime asset identity differs`);
  invariant(Number.isSafeInteger(record.bytes) && record.bytes > 0 && HASH_64.test(record.sha256 ?? ""), `${label} runtime asset bytes/hash differ`);
  if (served) {
    invariant(record.httpStatus === 200, `${label} runtime asset HTTP status differs`);
    const contentType = String(record.contentType ?? "").toLowerCase();
    invariant(record.kind === "css" ? contentType.includes("text/css") : /javascript|ecmascript/.test(contentType), `${label} runtime asset content type differs`);
  }
}

function validateRuntimeAssets(report) {
  invariant(report?.derivation === "linked CSS/JS paths parsed from each verified root HTML response", "served-build runtime asset derivation differs");
  const before = report.before;
  invariant(before?.revision === PHASE7A_R1_PARENT && Array.isArray(before.served) && before.served.length === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.records.length, "served exact-parent runtime asset inventory differs");
  before.served.forEach((record, index) => validateRuntimeAsset(record, `served exact-parent runtime asset ${index + 1}`, { served: true }));
  invariant(before.fingerprint === runtimeAssetFingerprint(before.served) && before.fingerprint === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.fingerprint, "served exact-parent runtime asset fingerprint differs");
  invariant(before.authority?.revision === PHASE7A_R1_PARENT && before.authority.derivation === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.derivation && before.authority.fingerprint === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.fingerprint, "served exact-parent immutable runtime receipt differs");
  for (const [index, expected] of EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.records.entries()) {
    const actual = before.served[index];
    invariant(actual.kind === expected.kind && actual.route === expected.route && actual.bytes === expected.bytes && actual.sha256 === expected.sha256, `served exact-parent runtime asset differs: ${expected.route}`);
  }
  const after = report.after;
  invariant(after?.revision && HASH_40.test(after.revision) && Array.isArray(after.localDist) && Array.isArray(after.served) && after.localDist.length >= 2 && after.localDist.length === after.served.length, "served R1 runtime asset inventory differs");
  after.localDist.forEach((record, index) => validateRuntimeAsset(record, `local R1 runtime asset ${index + 1}`));
  after.served.forEach((record, index) => validateRuntimeAsset(record, `served R1 runtime asset ${index + 1}`, { served: true }));
  for (const [index, local] of after.localDist.entries()) {
    const served = after.served[index];
    invariant(served.kind === local.kind && served.route === local.route && served.bytes === local.bytes && served.sha256 === local.sha256, `served R1 runtime asset differs from local dist: ${local.route}`);
  }
  invariant(after.localFingerprint === runtimeAssetFingerprint(after.localDist) && after.servedFingerprint === runtimeAssetFingerprint(after.served) && after.localFingerprint === after.servedFingerprint, "served/local R1 runtime asset fingerprint differs");
  return { before, after };
}

function portableSourceAuthority(receipt) {
  return {
    status: receipt.status,
    branch: receipt.branch,
    revision: receipt.revision,
    document: receipt.document,
    runtimeFingerprint: receipt.runtimeFingerprint,
  };
}

function validatePortableSourceAuthority(record, receipt, label) {
  const expected = portableSourceAuthority(receipt);
  invariant(record && record.status === expected.status && record.branch === expected.branch && record.revision === expected.revision, `${label} portable source branch/revision differs`);
  invariant(record.document?.relativePath === "dist/index.html" && record.document.bytes === expected.document.bytes && record.document.sha256 === expected.document.sha256, `${label} portable source document differs`);
  invariant(record.runtimeFingerprint === expected.runtimeFingerprint, `${label} portable source runtime fingerprint differs`);
  invariant(JSON.stringify(Object.keys(record).sort()) === JSON.stringify(Object.keys(expected).sort()), `${label} portable source inventory differs`);
  return true;
}

/** Validate a fresh capture's portable final-HEAD document/runtime receipt. */
export function validatePortableServedBuildReceipt(receipt, expectedRevision = receipt?.revision, servedBuildAuthority = null) {
  invariant(receipt?.schema === PORTABLE_SERVED_BUILD_SCHEMA && receipt.status === "PASS", "portable served-build receipt is not PASS");
  invariant(HASH_40.test(expectedRevision ?? "") && receipt.branch === PHASE7A_R1_BRANCH && receipt.revision === expectedRevision, "portable served-build branch/revision differs");
  invariant(receipt.document?.relativePath === "dist/index.html" && Number.isSafeInteger(receipt.document.bytes) && receipt.document.bytes > 0 && HASH_64.test(receipt.document.sha256 ?? ""), "portable served-build document authority differs");
  invariant(Array.isArray(receipt.runtimeAssets) && receipt.runtimeAssets.length >= 2, "portable served-build runtime asset inventory differs");
  const routes = new Set();
  for (const [index, asset] of receipt.runtimeAssets.entries()) {
    validateRuntimeAsset(asset, `portable runtime asset ${index + 1}`);
    invariant(!routes.has(asset.route), `portable runtime asset route is duplicated: ${asset.route}`);
    routes.add(asset.route);
  }
  invariant(receipt.runtimeAssets.some(({ kind }) => kind === "css") && receipt.runtimeAssets.some(({ kind }) => kind === "javascript"), "portable served-build receipt lacks CSS or JavaScript");
  invariant(receipt.runtimeFingerprint === runtimeAssetFingerprint(receipt.runtimeAssets), "portable served-build runtime fingerprint differs");
  invariant(receipt.servedParity?.document === true && receipt.servedParity?.runtimeAssets === true, "portable served-build receipt lacks served-origin byte parity");
  invariant(receipt.freshBuild?.command === "npm run build:phase7a-r1" && receipt.freshBuild.headBefore === expectedRevision && receipt.freshBuild.headAfter === expectedRevision && receipt.freshBuild.worktreeCleanBefore === true && receipt.freshBuild.worktreeCleanAfter === true, "portable served-build receipt lacks a clean final-HEAD governed build");
  if (servedBuildAuthority) {
    const closure = validateServedBuildAuthority(servedBuildAuthority, expectedRevision);
    invariant(receipt.document.bytes === closure.afterDocument.bytes && receipt.document.sha256 === closure.afterDocument.sha256, "portable served-build document differs from closure authority");
    invariant(receipt.runtimeFingerprint === closure.runtimeAssets.after.localFingerprint && receipt.runtimeAssets.length === closure.runtimeAssets.after.localDist.length, "portable served-build runtime fingerprint differs from closure authority");
    for (const [index, expected] of closure.runtimeAssets.after.localDist.entries()) {
      const actual = receipt.runtimeAssets[index];
      invariant(actual.kind === expected.kind && actual.route === expected.route && actual.bytes === expected.bytes && actual.sha256 === expected.sha256, `portable runtime asset differs from closure authority: ${expected.route}`);
    }
  }
  return portableSourceAuthority(receipt);
}

/** Independently validate the closure's exact-parent and freshly built R1 served-source authority. */
export function validateServedBuildAuthority(report, afterRevision) {
  assertPass(report, "served-build authority");
  invariant(report.schema === SERVED_BUILD_AUTHORITY_SCHEMA, "served-build authority schema differs");
  invariant(HASH_40.test(afterRevision ?? "") && afterRevision !== PHASE7A_R1_PARENT, "served-build R1 revision is invalid");
  const repository = report.repository;
  invariant(repository?.schema === SERVED_BUILD_AUTHORITY_SCHEMA && repository.branch === PHASE7A_R1_BRANCH && repository.head === afterRevision, "served-build repository branch/HEAD authority differs");
  invariant(repository.exactParent === PHASE7A_R1_PARENT && repository.parentIsAncestor === true && repository.mergeCommitsSinceParent === 0 && repository.trackedWorktreeClean === true, "served-build repository ancestry/cleanliness authority differs");
  const build = repository.buildReceipt;
  invariant(build?.command === "npm run build:phase7a-r1" && build.authorityProfile === "phase7a-r1" && build.completed === true && build.headBefore === afterRevision && build.headAfter === afterRevision && build.branchAfter === PHASE7A_R1_BRANCH && build.trackedWorktreeCleanAfter === true, "served-build governed build receipt differs");
  invariant(repository.localDist?.relativePath === "dist/index.html" && Number.isSafeInteger(repository.localDist.bytes) && repository.localDist.bytes > 0 && HASH_64.test(repository.localDist.sha256 ?? ""), "served-build local dist/index.html authority differs");
  invariant(report.originSeparation?.before === "BEFORE_CAPTURE_ORIGIN" && report.originSeparation?.after === "AFTER_CAPTURE_ORIGIN" && report.originSeparation?.distinctNormalizedOrigins === true, "served-build origin separation authority differs");

  const beforeDocument = report.documents?.before;
  const afterDocument = report.documents?.after;
  validateServedDocument(beforeDocument, "exact-parent");
  validateServedDocument(afterDocument, "R1 after");
  invariant(beforeDocument.bytes === EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.bytes && beforeDocument.sha256 === EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256, "served exact-parent document differs from immutable byte authority");
  invariant(afterDocument.bytes === repository.localDist.bytes && afterDocument.sha256 === repository.localDist.sha256, "served R1 document differs from fresh local dist/index.html");
  invariant(report.documentFingerprintsDistinct === true && beforeDocument.sha256 !== afterDocument.sha256, "served before/after document fingerprints are not distinct");
  const runtimeAssets = validateRuntimeAssets(report.runtimeAssets);
  invariant(runtimeAssets.after.revision === afterRevision, "served R1 runtime asset revision differs");

  const beforeDom = report.dom?.before;
  const afterDom = report.dom?.after;
  validateServedDom(beforeDom, "exact-parent");
  validateServedDom(afterDom, "R1 after");
  invariant(beforeDom.signalFarCount === 0 && beforeDom.signalOcclusionCount === 0 && beforeDom.bifurcation.fieldCount === 0 && beforeDom.bifurcation.bounded === false, "served exact-parent DOM contains R1-only structure");
  invariant(afterDom.signalFarCount >= 1 && afterDom.signalOcclusionCount >= 1 && afterDom.bifurcation.fieldCount === 1 && afterDom.bifurcation.industryCount === 1 && afterDom.bifurcation.startupCount === 1 && afterDom.bifurcation.junctionCount === 1 && afterDom.bifurcation.destinationCount === 2 && afterDom.bifurcation.bounded === true, "served R1 DOM lacks the required structural field/bifurcation authority");
  invariant(JSON.stringify(afterDom.bifurcation.destinationHrefs) === JSON.stringify(["/for-partners/", "/for-startups/"]) && JSON.stringify(afterDom.bifurcation.destinationNames) === JSON.stringify(["For industry", "For startups"]), "served R1 bifurcation destinations differ");
  for (const state of ["before", "after"]) {
    const ledger = report.network?.[state];
    const expectedKeys = ["blockedExternal", "failedRequests", "pageErrors", "consoleErrors"].sort();
    invariant(ledger && JSON.stringify(Object.keys(ledger).sort()) === JSON.stringify(expectedKeys) && expectedKeys.every((key) => Array.isArray(ledger[key]) && ledger[key].length === 0), `served-build ${state} network/console ledger differs`);
  }
  return { afterRevision, beforeDocument, afterDocument, beforeDom, afterDom, runtimeAssets };
}

function validateServedAuthorityReceipt(receipt, afterRevision) {
  invariant(receipt?.report === "provenance/served-build-authority.json" && receipt.status === "PASS" && receipt.branch === PHASE7A_R1_BRANCH && receipt.afterRevision === afterRevision, "comparison served-build receipt differs");
  invariant(receipt.beforeDocument?.revision === PHASE7A_R1_PARENT && receipt.beforeDocument.bytes === EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.bytes && receipt.beforeDocument.sha256 === EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256, "comparison exact-parent document receipt differs");
  invariant(receipt.afterDocument?.revision === afterRevision && Number.isSafeInteger(receipt.afterDocument.bytes) && receipt.afterDocument.bytes > 0 && HASH_64.test(receipt.afterDocument.sha256 ?? ""), "comparison R1 document receipt differs");
  invariant(receipt.distinctDocumentFingerprints === true && receipt.beforeDocument.sha256 !== receipt.afterDocument.sha256 && receipt.domSignatures?.before === "EXACT_PARENT" && receipt.domSignatures?.after === "PHASE_7A_R1", "comparison served-build distinction receipt differs");
  invariant(receipt.runtimeAssets?.before?.count === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.records.length && receipt.runtimeAssets.before.fingerprint === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.fingerprint && receipt.runtimeAssets.before.immutableAuthority?.fingerprint === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.fingerprint, "comparison exact-parent runtime asset receipt differs");
  invariant(Number.isSafeInteger(receipt.runtimeAssets?.after?.count) && receipt.runtimeAssets.after.count >= 2 && HASH_64.test(receipt.runtimeAssets.after.fingerprint ?? ""), "comparison R1 runtime asset receipt differs");
  return receipt;
}

/** Cross-bind the signed/deployed index.html ledgers to the independently served R1 document. */
export function validateServedBuildDeploymentBinding(deployment, servedBuildAuthority) {
  const after = servedBuildAuthority?.documents?.after;
  invariant(Number.isSafeInteger(after?.bytes) && after.bytes > 0 && HASH_64.test(after.sha256 ?? ""), "served R1 document is missing for deployment cross-binding");
  const localMatches = (deployment?.dist?.files ?? []).filter((entry) => entry?.relativePath === "index.html");
  invariant(localMatches.length === 1 && localMatches[0].bytes === after.bytes && localMatches[0].sha256 === after.sha256, "served R1 document differs from deployment local-dist index.html");
  for (const name of ["immutable", "branch"]) {
    const matches = (deployment?.origins?.[name]?.data?.responses ?? []).filter((entry) => entry?.relativePath === "index.html" && entry?.publicPath === "/");
    invariant(matches.length === 1 && matches[0].status === "PASS" && matches[0].bytes === after.bytes && matches[0].sha256 === after.sha256 && matches[0].actualHttpStatus === 200, `served R1 document differs from deployment ${name} index.html`);
  }
  const runtime = validateRuntimeAssets(servedBuildAuthority.runtimeAssets).after;
  for (const asset of runtime.localDist) {
    const relativePath = asset.route.slice(1);
    const local = (deployment?.dist?.files ?? []).filter((entry) => entry?.relativePath === relativePath);
    invariant(local.length === 1 && local[0].bytes === asset.bytes && local[0].sha256 === asset.sha256, `served R1 runtime asset differs from deployment local dist: ${asset.route}`);
    for (const name of ["immutable", "branch"]) {
      const matches = (deployment?.origins?.[name]?.data?.responses ?? []).filter((entry) => entry?.relativePath === relativePath && entry?.publicPath === asset.route);
      invariant(matches.length === 1 && matches[0].status === "PASS" && matches[0].bytes === asset.bytes && matches[0].sha256 === asset.sha256 && matches[0].actualHttpStatus === 200, `served R1 runtime asset differs from deployment ${name}: ${asset.route}`);
    }
  }
  return {
    status: "PASS",
    revision: servedBuildAuthority.repository.head,
    relativePath: "dist/index.html",
    bytes: after.bytes,
    sha256: after.sha256,
    localDist: true,
    immutableOrigin: true,
    branchOrigin: true,
    runtimeAssets: { count: runtime.localDist.length, fingerprint: runtime.localFingerprint },
  };
}

/** Validate the four normalized, fully decoded browser comparison recordings. */
export function validateSignalComparisonRecordingReport(report) {
  assertPass(report, "Signal Field comparison recording report");
  invariant(report.schema === SIGNAL_COMPARISON_RECORDING_SCHEMA, "Signal Field comparison recording schema differs");
  invariant(report.rawBrowserVideoRetained === false, "raw browser comparison video must not be retained");
  invariant(report.tools && typeof report.tools.ffmpegVersion === "string" && report.tools.ffmpegVersion.length > 0 && typeof report.tools.ffprobeVersion === "string" && report.tools.ffprobeVersion.length > 0, "Signal Field comparison media-tool provenance is missing");
  invariant(report.contract && typeof report.contract === "object" && !Array.isArray(report.contract), "Signal Field comparison media contract is missing");
  const contractKeys = Object.keys(SIGNAL_COMPARISON_RECORDING_CONTRACT).sort();
  invariant(JSON.stringify(Object.keys(report.contract).sort()) === JSON.stringify(contractKeys), "Signal Field comparison media contract key set differs");
  for (const [key, value] of Object.entries(SIGNAL_COMPARISON_RECORDING_CONTRACT)) invariant(report.contract[key] === value, `Signal Field comparison media contract differs: ${key}`);
  invariant(Array.isArray(report.recordings) && report.recordings.length === SIGNAL_COMPARISON_RECORDING_SPECS.length, "Signal Field comparison recording inventory must contain four records");
  const observed = new Map();
  let afterRevision = null;
  for (const [index, record] of report.recordings.entries()) {
    invariant(record && typeof record === "object" && !Array.isArray(record), `Signal Field comparison recording ${index + 1} is missing`);
    invariant(!observed.has(record.id), `Signal Field comparison recording id is duplicated: ${record.id}`);
    observed.set(record.id, record);
  }
  for (const spec of SIGNAL_COMPARISON_RECORDING_SPECS) {
    const record = observed.get(spec.id);
    invariant(record, `Signal Field comparison recording is missing: ${spec.id}`);
    assertPass(record, `Signal Field comparison recording ${spec.id}`);
    invariant(record.engine === spec.engine && record.state === spec.state && record.relativePath === spec.relativePath, `Signal Field comparison authority differs: ${spec.id}`);
    invariant(record.sourceAuthority?.kind === spec.sourceKind && HASH_40.test(record.sourceAuthority?.revision ?? ""), `Signal Field comparison source authority differs: ${spec.id}`);
    if (spec.state === "before") invariant(record.sourceAuthority.revision === PHASE7A_R1_PARENT, `Signal Field comparison exact-parent revision differs: ${spec.id}`);
    else {
      invariant(record.sourceAuthority.revision !== PHASE7A_R1_PARENT, `Signal Field comparison after revision equals the accepted parent: ${spec.id}`);
      if (afterRevision === null) afterRevision = record.sourceAuthority.revision;
      invariant(afterRevision === record.sourceAuthority.revision, "Chromium and Firefox comparison recordings bind different R1 revisions");
    }
    const expectedDocument = spec.state === "before" ? report.servedBuildAuthority?.beforeDocument : report.servedBuildAuthority?.afterDocument;
    invariant(record.sourceAuthority.document?.report === "provenance/served-build-authority.json" && record.sourceAuthority.document.bytes === expectedDocument?.bytes && record.sourceAuthority.document.sha256 === expectedDocument?.sha256, `Signal Field comparison served-document authority differs: ${spec.id}`);
    const expectedRuntime = spec.state === "before" ? report.servedBuildAuthority?.runtimeAssets?.before : report.servedBuildAuthority?.runtimeAssets?.after;
    invariant(record.sourceAuthority.livePageAttestation?.channel === "recording-document-response-and-live-dom" && record.sourceAuthority.livePageAttestation.document?.bytes === expectedDocument?.bytes && record.sourceAuthority.livePageAttestation.document?.sha256 === expectedDocument?.sha256, `Signal Field comparison live document attestation differs: ${spec.id}`);
    invariant(record.sourceAuthority.livePageAttestation.runtimeAssets?.count === expectedRuntime?.count && record.sourceAuthority.livePageAttestation.runtimeAssets?.fingerprint === expectedRuntime?.fingerprint, `Signal Field comparison live runtime asset attestation differs: ${spec.id}`);
    invariant(record.boundedPointerResponse === spec.boundedPointerResponse, `Signal Field comparison pointer authority differs: ${spec.id}`);
    const expectedLabel = spec.state === "before"
      ? `PHASE 7A-R1 COMPARATIVE / ${spec.engine.toUpperCase()} / BEFORE - EXACT PARENT ${PHASE7A_R1_PARENT.slice(0, 12)}`
      : `PHASE 7A-R1 COMPARATIVE / ${spec.engine.toUpperCase()} / AFTER - R1 AFTER ${record.sourceAuthority.revision.slice(0, 12)} / BOUNDED POINTER RESPONSE`;
    invariant(record.visibleLabel === expectedLabel, `Signal Field comparison visible label differs: ${spec.id}`);
    invariant(record.settledState && typeof record.settledState === "object" && !Array.isArray(record.settledState), `Signal Field comparison settled-state evidence is missing: ${spec.id}`);
    invariant(typeof record.settledState.h1Text === "string" && record.settledState.h1Text.length > 0 && record.settledState.signalField === true && record.settledState.overlayVisible === true, `Signal Field comparison settled-state evidence differs: ${spec.id}`);
    invariant(record.settledState.manifestoReveal === "resolved" || record.settledState.cinematicMode === "static", `Signal Field comparison did not reach a resolved/static stop state: ${spec.id}`);
    invariant(Array.isArray(record.pointerStates), `Signal Field comparison pointer-state evidence is missing: ${spec.id}`);
    if (spec.state === "before") {
      invariant(record.pointerStates.length === 0 && record.pointerSettled === null, `exact-parent comparison must not claim pointer-response evidence: ${spec.id}`);
    } else {
      invariant(record.pointerStates.length >= 4 && record.pointerStates.every((state, index) => state?.step === index + 1 && state.probe === "active" && state.bounded === true && ["probeX", "probeY", "nearX", "nearY"].every((key) => typeof state[key] === "string")), `R1 comparison pointer-state evidence differs: ${spec.id}`);
      invariant(record.pointerSettled?.probe === "settled" && record.pointerSettled.probeX === "50%" && record.pointerSettled.probeY === "50%" && record.pointerSettled.nearX === "0px" && record.pointerSettled.nearY === "0px", `R1 comparison pointer did not return to its settled state: ${spec.id}`);
    }
    const media = record.media;
    invariant(media && typeof media === "object" && !Array.isArray(media), `Signal Field comparison media metadata is missing: ${spec.id}`);
    for (const key of ["container", "codec", "pixelFormat", "width", "height", "fps", "videoStreams", "audioStreams"]) invariant(media[key] === SIGNAL_COMPARISON_RECORDING_CONTRACT[key], `Signal Field comparison normalized media differs for ${spec.id}: ${key}`);
    invariant(media.constantFrameRate === true, `Signal Field comparison is not constant-frame-rate: ${spec.id}`);
    invariant(Number.isFinite(media.durationSeconds) && media.durationSeconds >= SIGNAL_COMPARISON_RECORDING_CONTRACT.minimumSeconds && media.durationSeconds <= SIGNAL_COMPARISON_RECORDING_CONTRACT.maximumSeconds, `Signal Field comparison duration is outside the normalized contract: ${spec.id}`);
    invariant(Number.isSafeInteger(media.decodedFrames) && media.decodedFrames > 0 && media.fullDecode === true, `Signal Field comparison full decode metadata differs: ${spec.id}`);
    invariant(Number.isSafeInteger(record.bytes) && record.bytes > 0 && HASH_64.test(record.sha256 ?? ""), `Signal Field comparison byte/hash metadata differs: ${spec.id}`);
    assertExactCheckMap(record.validationChecks, SIGNAL_RECORDING_CHECKS, `Signal Field comparison recording ${spec.id}`);
  }
  const servedBuildAuthority = validateServedAuthorityReceipt(report.servedBuildAuthority, afterRevision);
  return { afterRevision, servedBuildAuthority, recordings: SIGNAL_COMPARISON_RECORDING_SPECS.map(({ id }) => observed.get(id)) };
}

/** Bind comparative "after" media to the exact packaged source, never an earlier ancestor. */
export function validateComparisonRevision(afterRevision, provenance) {
  invariant(HASH_40.test(afterRevision ?? ""), "Signal Field comparison after revision is invalid");
  invariant(HASH_40.test(provenance?.finalHead ?? "") && Array.isArray(provenance?.commits), "final Git provenance is incomplete for Signal Field comparison binding");
  invariant(provenance.commits.some(({ hash }) => hash === provenance.finalHead), "final Git provenance commit list omits final HEAD");
  invariant(afterRevision === provenance.finalHead, "Signal Field comparison after revision must equal final HEAD exactly");
  return true;
}

function validateTargetLedger(ledger) {
  assertPass(ledger, "closure target-size inventory");
  invariant(Array.isArray(ledger.states) && ledger.states.length >= 10, "closure target-size inventory coverage is incomplete");
  for (const state of ledger.states) targetReportPass(state.report, `closure target state ${state.id ?? "unknown"}`);
  invariant(ledger.summary?.activeFailures === 0 && ledger.summary?.unexplainedExclusions === 0 && ledger.summary?.contractFailures === 0, "closure target-size inventory is a false PASS");
}

/** Require the accepted parent to reproduce the actual measured 800x360 top-clipping defect. */
export function validateBefore800x360Defect(cases) {
  invariant(Array.isArray(cases) && cases.length === PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS.length, "before geometry must retain the complete 12-case matrix");
  const expected = PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS.map(({ id }) => id);
  const observed = cases.map(({ id }) => id);
  invariant(new Set(observed).size === observed.length && expected.every((id, index) => observed[index] === id), "before geometry viewport order or membership differs");
  const defect = cases.find(({ id }) => id === "short-landscape-800x360");
  invariant(defect?.status === "FAIL" && typeof defect.failure === "string" && defect.failure.trim().length > 0, "exact-parent 800x360 geometry defect was not reproduced");
  const measurement = defect.measurement;
  invariant(measurement && typeof measurement === "object" && !Array.isArray(measurement), "exact-parent 800x360 defect has no geometry measurement");
  let clippingAuthority;
  try { clippingAuthority = validateManifestoClippingAuthority(measurement); }
  catch (error) { throw new Error(`exact-parent 800x360 clipping authority differs: ${error.message}`); }
  invariant(measurement.viewport.id === defect.id, "exact-parent 800x360 measurement viewport differs");
  const effectiveTop = clippingAuthority.effectiveVisibleBounds.top;
  const h1Top = measurement.h1?.rect?.top;
  const glyphTop = measurement.glyphBounds?.top;
  invariant([h1Top, glyphTop].every(Number.isFinite), "exact-parent 800x360 top-boundary geometry is incomplete");
  const allowances = [
    measurement.safeAllowances?.h1?.top,
    measurement.safeAllowances?.glyphs?.top,
    ...(measurement.safeAllowances?.renderedLines ?? []).map(({ top }) => top),
  ].filter(Number.isFinite);
  const headerIntersections = measurement.boundaryAnalysis?.occludingHeaderIntersections ?? [];
  const glyphEscapes = measurement.boundaryAnalysis?.glyphEscapes ?? [];
  const boundaryIntersections = measurement.boundaryAnalysis?.boundaryIntersections ?? [];
  const topSafetyViolation = (measurement.boundaryAnalysis?.safetyViolations ?? []).some(({ sides }) => Array.isArray(sides) && sides.includes("top"));
  invariant(
    allowances.some((allowance) => allowance < MINIMUM_MANIFESTO_SAFETY_PX)
      || headerIntersections.length > 0
      || glyphEscapes.some(({ sides }) => Array.isArray(sides) && sides.includes("top"))
      || boundaryIntersections.some(({ sides }) => Array.isArray(sides) && sides.includes("top"))
      || topSafetyViolation,
    "exact-parent 800x360 failure lacks measured top-clipping evidence",
  );
  invariant(h1Top < effectiveTop || glyphTop < effectiveTop, "exact-parent 800x360 glyph-bearing bounds do not cross the effective top boundary");
  return true;
}

/** Validate the real no-JavaScript fallback schema without trusting a count summary. */
export function validateNoJavaScriptFallback(noJavaScript) {
  invariant(noJavaScript && typeof noJavaScript === "object" && !Array.isArray(noJavaScript), "no-JavaScript fallback evidence is missing");
  invariant(noJavaScript.nativeDetailsOpen === true && noJavaScript.enhancedController === null, "no-JavaScript native Field Map state differs");
  invariant(noJavaScript.horizontalOverflow === false, "no-JavaScript native Field Map has horizontal overflow");
  const inventory = noJavaScript.fieldMapLinkInventory;
  invariant(Array.isArray(inventory) && inventory.length === FIELD_MAP_HREFS.length, "no-JavaScript Field Map destination count differs");
  inventory.forEach((entry, index) => {
    invariant(entry?.index === index && entry.href === FIELD_MAP_HREFS[index] && entry.accessibleName === FIELD_MAP_NAMES[index], `no-JavaScript Field Map destination ${index + 1} identity differs`);
    invariant(entry.elementType === "a" && entry.intendedInteractive === true, `no-JavaScript Field Map destination ${index + 1} is not an intended link`);
    invariant(entry.visible === true && entry.fullyInViewport === true && entry.unoccluded === true, `no-JavaScript Field Map destination ${index + 1} is not fully visible and unoccluded`);
    invariant(Number.isFinite(entry.width) && entry.width > 0 && Number.isFinite(entry.height) && entry.height > 0, `no-JavaScript Field Map destination ${index + 1} has no visible area`);
  });
  invariant(new Set(inventory.map(({ href }) => href)).size === FIELD_MAP_HREFS.length && new Set(inventory.map(({ accessibleName }) => accessibleName)).size === FIELD_MAP_NAMES.length, "no-JavaScript Field Map destination inventory is duplicated");
  return true;
}

/** Validate the real blocked-production-font fallback schema. */
export function validateFallbackFontEvidence(fallbackFonts) {
  invariant(fallbackFonts && typeof fallbackFonts === "object" && !Array.isArray(fallbackFonts), "fallback-font evidence is missing");
  invariant(fallbackFonts.anybodyLoaded === false, "fallback-font Anybody load authority differs");
  invariant(Number.isSafeInteger(fallbackFonts.abortedFontRequests) && fallbackFonts.abortedFontRequests >= 1, "fallback-font aborted request authority differs");
  invariant(fallbackFonts.manifestoWords === 7, "fallback-font manifesto word authority differs");
  invariant(fallbackFonts.horizontalOverflow === false, "fallback-font horizontal overflow authority differs");
  invariant(fallbackFonts.manifestoVisibility?.status === "PASS", "fallback-font manifesto visibility authority differs");
  return true;
}

function validateClosureReports(reports) {
  assertPass(reports.summary, "closure summary");
  invariant(reports.summary.humanGates === "PENDING HUMAN REVIEW", "closure summary changed the human gate authority");
  validateBefore800x360Defect(reports.before.cases);
  invariant(Array.isArray(reports.after.cases) && reports.after.cases.length === 12, "after geometry must contain twelve cases");
  invariant(PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS.every(({ id }, index) => reports.after.cases[index]?.id === id), "after geometry viewport order or membership differs");
  invariant(reports.after.cases.every((item) => item.status === "PASS" && !item.failure), "repaired geometry contains clipping failures");
  for (const item of reports.after.cases) {
    try { validateManifestoGeometry(item.measurement); }
    catch (error) { throw new Error(`repaired geometry ${item.id} is not independently valid: ${error.message}`); }
  }
  assertPass(reports.signal, "Signal Field comparison");
  invariant(Array.isArray(reports.signal.records) && reports.signal.records.length === 2 && reports.signal.records[0]?.label === "before" && reports.signal.records[1]?.label === "after", "Signal Field before/after evidence differs");
  invariant((reports.signal.records[1]?.state?.structuralLayers ?? 0) >= 6 && (reports.signal.records[1]?.state?.liveSignalElements ?? 0) >= 2, "repaired Signal Field authority is incomplete");
  assertPass(reports.bifurcation, "audience bifurcation");
  invariant(Array.isArray(reports.bifurcation.cases) && reports.bifurcation.cases.length === 2 && reports.bifurcation.cases.every((item) => item.status === "PASS"), "audience bifurcation coverage differs");
  assertPass(reports.typography, "typography evidence");
  invariant(reports.typography.configuration?.rasterOnly === true && reports.typography.configuration?.fontPayloadsPublished === false && reports.typography.configuration?.htmlPublished === false, "typography evidence payload policy differs");
  invariant(reports.typography.productionByteImpact?.font === "Anybody" && reports.typography.productionByteImpact?.measuredProductionBytes === 69612 && reports.typography.productionByteImpact?.addedByR1Bytes === 0, "production typography byte authority differs");
  invariant(Array.isArray(reports.typography.candidates) && reports.typography.candidates.length === 4, "typography candidate inventory differs");
  invariant(JSON.stringify(reports.typography.candidates.map(({ candidateName }) => candidateName)) === JSON.stringify(["Anybody", "Mona Sans", "Bricolage Grotesque", "Archivo"]), "typography candidate names differ");
  for (const candidate of reports.typography.candidates) {
    invariant(Number.isSafeInteger(candidate.sourceBytes) && candidate.sourceBytes > 0 && HASH_64.test(candidate.sourceSha256 ?? ""), `typography source authority differs: ${candidate.candidateName}`);
    invariant(Number.isSafeInteger(candidate.licenceBytes) && candidate.licenceBytes > 0 && HASH_64.test(candidate.licenceSha256 ?? ""), `typography licence authority differs: ${candidate.candidateName}`);
    validRelative(candidate.repositoryReference, `typography source reference for ${candidate.candidateName}`);
    validRelative(candidate.licenceReference, `typography licence reference for ${candidate.candidateName}`);
  }
  assertPass(reports.fieldMap, "Field Map semantic isolation");
  invariant(reports.fieldMap.states?.open?.destinationCount === 8 && reports.fieldMap.states?.open?.inertRegionCount === reports.fieldMap.states?.open?.backgroundRegionCount, "Field Map open semantic isolation differs");
  invariant(reports.fieldMap.states?.escape?.inertRegionCount === 0 && reports.fieldMap.states?.escape?.ownedInertCount === 0, "Field Map Escape left stale inert state");
  invariant((reports.fieldMap.repeatedCycles?.length ?? 0) >= 3, "Field Map repeated-cycle evidence is incomplete");
  invariant(reports.fieldMap.repeatedCycles.every(({ opened, closed }) => opened?.destinationCount === 8 && opened?.inertRegionCount === opened?.backgroundRegionCount && closed?.inertRegionCount === 0 && closed?.ownedInertCount === 0), "Field Map repeated-cycle restoration differs");
  const expectedFocus = [null, ...FIELD_MAP_BASE_NAMES, null];
  invariant(Array.isArray(reports.fieldMap.focusSequence) && reports.fieldMap.focusSequence.length === expectedFocus.length && reports.fieldMap.focusSequence.every(({ step, activeElement, activeDestinationName }, index) => step === index + 1 && activeElement === (expectedFocus[index] === null ? "field-map-summary" : "a") && (activeDestinationName ?? null) === expectedFocus[index]), "Field Map keyboard focus sequence differs");
  invariant(reports.fieldMap.reverseFocus?.activeElement === "a" && reports.fieldMap.reverseFocus.activeDestinationName === "Contact", "Field Map reverse keyboard wrap differs");
  for (const name of ["pagehide", "pageshow", "history"]) {
    invariant(reports.fieldMap.lifecycle?.[name]?.inertRegionCount === 0 && reports.fieldMap.lifecycle?.[name]?.ownedInertCount === 0, `Field Map ${name} restoration differs`);
  }
  invariant(reports.fieldMap.navigation?.arrival?.inertRegionCount === 0 && reports.fieldMap.navigation?.back?.inertRegionCount === 0, "Field Map navigation restoration differs");
  validateTargetLedger(reports.targets);
  assertPass(reports.fallback, "closure fallback evidence");
  invariant(reports.fallback.reducedMotion?.cinematicMode === "static", "reduced-motion fallback did not resolve statically");
  validateNoJavaScriptFallback(reports.fallback.noJavaScript);
  validateFallbackFontEvidence(reports.fallback.fallbackFonts);
  validateFirefoxFirstPaintReport(reports.firstPaint);
  assertPass(reports.axeChromium, "closure Chromium accessibility");
  assertPass(reports.axeFirefox, "closure Firefox accessibility");
  invariant(reports.axeChromium.violationCount === 0 && reports.axeFirefox.violationCount === 0, "closure accessibility contains violations");
  assertPass(reports.routes, "closure route-shell evidence");
  invariant(Array.isArray(reports.routes.cases) && reports.routes.cases.length === 8 && reports.routes.cases.every((item) => item.status === "PASS"), "closure route/404 coverage differs");
  return true;
}

function validRelative(value, label = "relative path") {
  invariant(typeof value === "string" && value.length > 0 && !value.includes("\\") && !path.posix.isAbsolute(value), `${label} is not portable`);
  invariant(path.posix.normalize(value) === value && value !== "." && !value.startsWith("../") && !value.split("/").includes(".."), `${label} is unsafe`);
  return value;
}

async function exists(candidate) {
  try { await access(candidate); return true; } catch { return false; }
}

async function externalFile(candidate, label) {
  invariant(typeof candidate === "string" && path.isAbsolute(candidate), `${label} must be an absolute path`);
  const resolved = path.resolve(candidate);
  invariant(!within(ROOT, resolved) && !within(os.tmpdir(), resolved), `${label} must remain outside the repository and OS temporary storage`);
  const canonical = await realpath(resolved);
  const info = await lstat(canonical);
  invariant(info.isFile() && !info.isSymbolicLink(), `${label} must be a real file`);
  return canonical;
}

async function externalDirectory(candidate, label) {
  invariant(typeof candidate === "string" && path.isAbsolute(candidate), `${label} must be an absolute path`);
  const resolved = path.resolve(candidate);
  invariant(resolved !== path.parse(resolved).root && !within(ROOT, resolved) && !within(os.tmpdir(), resolved), `${label} must be an external durable directory`);
  const canonical = await realpath(resolved);
  const info = await lstat(canonical);
  invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} must be a real directory`);
  return canonical;
}

async function freshOutput(candidate) {
  invariant(typeof candidate === "string" && path.isAbsolute(candidate), "--output-dir must be an absolute path");
  const resolved = path.resolve(candidate);
  invariant(resolved !== path.parse(resolved).root && !within(ROOT, resolved) && !within(os.tmpdir(), resolved), "--output-dir must remain outside the repository and OS temporary storage");
  invariant(!(await exists(resolved)), "--output-dir must be fresh");
  const parent = await realpath(path.dirname(resolved));
  invariant((await lstat(parent)).isDirectory() && !within(ROOT, parent) && !within(os.tmpdir(), parent), "--output-dir parent must be a durable external directory");
  return path.join(parent, path.basename(resolved));
}

async function readJsonFile(candidate, label) {
  const bytes = await readFile(candidate);
  try { return { value: JSON.parse(bytes.toString("utf8")), bytes, sha256: digest(bytes) }; }
  catch { throw new Error(`${label} is not valid JSON`); }
}

async function readJsonAt(root, relativePath) {
  validRelative(relativePath, "closure JSON path");
  return readJsonFile(path.join(root, ...relativePath.split("/")), relativePath);
}

async function listFiles(root, current = root) {
  const output = [];
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    invariant(!entry.isSymbolicLink(), `symbolic link is forbidden: ${relativePosix(root, absolute)}`);
    if (entry.isDirectory()) output.push(...await listFiles(root, absolute));
    else if (entry.isFile()) output.push({ absolute, relativePath: relativePosix(root, absolute) });
    else throw new Error(`unsupported input entry: ${relativePosix(root, absolute)}`);
  }
  return output;
}

function assertRasterSignature(bytes, relativePath) {
  if (/\.png$/i.test(relativePath)) invariant(bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")), `PNG signature differs: ${relativePath}`);
  else invariant(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9, `JPEG signature differs: ${relativePath}`);
}

function assertMp4Signature(bytes, relativePath) {
  invariant(bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp", `MP4 signature differs: ${relativePath}`);
}

async function verifyClosureManifest(root, manifest) {
  assertPass(manifest, "closure manifest");
  invariant(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0, "closure manifest artifact ledger is missing");
  const files = (await listFiles(root)).filter(({ relativePath }) => relativePath !== "closure-manifest.json");
  const actual = new Map(files.map((file) => [file.relativePath, file.absolute]));
  invariant(actual.size === manifest.artifacts.length, "closure manifest file count differs");
  const seen = new Set();
  for (const row of manifest.artifacts) {
    validRelative(row.relativePath, "closure artifact path");
    invariant(!seen.has(row.relativePath) && actual.has(row.relativePath), `closure manifest path differs: ${row.relativePath}`);
    seen.add(row.relativePath);
    const bytes = await readFile(actual.get(row.relativePath));
    invariant(row.status === "PASS" && row.bytes === bytes.length && row.sha256 === digest(bytes), `closure artifact ledger differs: ${row.relativePath}`);
  }
}

async function loadClosure(root) {
  const loaded = {};
  for (const relativePath of REQUIRED_CLOSURE_JSON) loaded[relativePath] = await readJsonAt(root, relativePath);
  await verifyClosureManifest(root, loaded["closure-manifest.json"].value);
  const reports = {
    summary: loaded["capture-summary.json"].value,
    servedBuildAuthority: loaded["provenance/served-build-authority.json"].value,
    before: loaded["responsive/geometry-before.json"].value,
    after: loaded["responsive/geometry-after.json"].value,
    signal: loaded["signal-field/comparison.json"].value,
    signalRecordings: loaded["recordings/signal-field-comparison/report.json"].value,
    bifurcation: loaded["audience-bifurcation/report.json"].value,
    typography: loaded["typography/configuration-licences-hashes.json"].value,
    fieldMap: loaded["field-map/semantic-isolation.json"].value,
    targets: loaded["target-size/element-inventory.json"].value,
    fallback: loaded["fallback/report.json"].value,
    firstPaint: loaded["firefox-first-paint/report.json"].value,
    axeChromium: loaded["accessibility/chromium.json"].value,
    axeFirefox: loaded["accessibility/firefox.json"].value,
    routes: loaded["route-shells/report.json"].value,
  };
  validateClosureReports(reports);
  const signalRecordingValidation = validateSignalComparisonRecordingReport(reports.signalRecordings);
  const servedBuildValidation = validateServedBuildAuthority(reports.servedBuildAuthority, signalRecordingValidation.afterRevision);
  invariant(signalRecordingValidation.servedBuildAuthority.beforeDocument.bytes === servedBuildValidation.beforeDocument.bytes && signalRecordingValidation.servedBuildAuthority.beforeDocument.sha256 === servedBuildValidation.beforeDocument.sha256, "comparison receipt differs from the served exact-parent document report");
  invariant(signalRecordingValidation.servedBuildAuthority.afterDocument.bytes === servedBuildValidation.afterDocument.bytes && signalRecordingValidation.servedBuildAuthority.afterDocument.sha256 === servedBuildValidation.afterDocument.sha256, "comparison receipt differs from the served R1 document report");
  const comparisonRecordings = [];
  for (const record of signalRecordingValidation.recordings) {
    const relativePath = validRelative(record.relativePath, `Signal Field comparison recording ${record.id}`);
    const absolute = path.join(root, ...relativePath.split("/"));
    invariant(within(root, absolute) && await stat(absolute).then((item) => item.isFile()).catch(() => false), `Signal Field comparison recording file is missing: ${record.id}`);
    const bytes = await readFile(absolute);
    assertMp4Signature(bytes, relativePath);
    invariant(bytes.length === record.bytes && digest(bytes) === record.sha256, `Signal Field comparison recording bytes/hash differ: ${record.id}`);
    comparisonRecordings.push({ record, absolute, bytes });
  }
  return {
    reports,
    comparisonRecordings,
    comparisonAfterRevision: signalRecordingValidation.afterRevision,
    inputSha256: Object.fromEntries(Object.entries(loaded).map(([name, record]) => [name, record.sha256])),
  };
}

async function loadRecordings(root) {
  const manifestRecord = await readJsonAt(root, "evidence-manifest.json");
  const manifest = manifestRecord.value;
  assertPass(manifest, "recording capture manifest");
  validatePortableServedBuildReceipt(manifest.servedBuild);
  validateRecordingReport({ status: manifest.status, failures: [], recordings: manifest.recordings });
  invariant(Array.isArray(manifest.screenshots) && manifest.screenshots.length === 21, "recording capture must contain twenty-one source-bound screenshots");
  for (const screenshot of manifest.screenshots) validatePortableSourceAuthority(screenshot.sourceAuthority, manifest.servedBuild, `recording capture screenshot ${screenshot.relativePath ?? "record"}`);
  invariant(Array.isArray(manifest.files), "recording capture file ledger is missing");
  const ledger = new Map(manifest.files.map((row) => [row.relativePath, row]));
  invariant(ledger.size === manifest.files.length, "recording capture file ledger contains duplicates");
  const recordings = [];
  for (const record of manifest.recordings) {
    validatePortableSourceAuthority(record.sourceAuthority, manifest.servedBuild, `scenario recording ${record.relativePath ?? "record"}`);
    invariant(record.scenarioValidation === "PASS", `scenario recording semantic validation is not PASS: ${record.relativePath ?? "record"}`);
    validateScenarioStates(record.scenario, record.states);
    const relativePath = validRelative(record.relativePath, "recording path");
    invariant(SAFE_VIDEO.test(relativePath), `recording is not MP4: ${relativePath}`);
    const absolute = path.join(root, ...relativePath.split("/"));
    invariant(within(root, absolute) && await stat(absolute).then((item) => item.isFile()).catch(() => false), `recording file is missing: ${relativePath}`);
    const bytes = await readFile(absolute);
    assertMp4Signature(bytes, relativePath);
    const row = ledger.get(relativePath);
    invariant(row && row.bytes === bytes.length && row.sha256 === digest(bytes), `recording manifest hash differs: ${relativePath}`);
    invariant(record.bytes === bytes.length && record.sha256 === digest(bytes), `recording evidence row differs: ${relativePath}`);
    recordings.push({ record, absolute, bytes });
  }
  invariant(recordings.length === 14, "recording capture must contain fourteen validated MP4s");
  return { manifest, manifestSha256: manifestRecord.sha256, recordings };
}

async function git(repoRoot, ...args) {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim();
}

async function gitSuccess(repoRoot, ...args) {
  try { await execFileAsync("git", args, { cwd: repoRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }); return true; }
  catch (error) { if (Number.isInteger(error?.code)) return false; throw error; }
}

export async function deriveGitProvenance(repoRoot = ROOT) {
  const [branch, head, directParent, localMain, originMain, status, upstream, upstreamHead, mergeRows, rows, phase6Ancestor] = await Promise.all([
    git(repoRoot, "branch", "--show-current"),
    git(repoRoot, "rev-parse", "HEAD"),
    git(repoRoot, "rev-parse", "HEAD^"),
    git(repoRoot, "rev-parse", "main"),
    git(repoRoot, "rev-parse", "origin/main"),
    git(repoRoot, "status", "--porcelain=v1", "--untracked-files=all"),
    git(repoRoot, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"),
    git(repoRoot, "rev-parse", "@{upstream}"),
    git(repoRoot, "rev-list", "--merges", `${PHASE7A_R1_PARENT}..HEAD`),
    git(repoRoot, "log", "--reverse", "--format=%H%x09%P%x09%s", `${PHASE7A_R1_PARENT}..HEAD`),
    gitSuccess(repoRoot, "merge-base", "--is-ancestor", PHASE7A_PARENT, "HEAD"),
  ]);
  invariant(branch === PHASE7A_R1_BRANCH, "current branch differs from Phase 7A-R1 authority");
  invariant(HASH_40.test(head) && HASH_40.test(directParent), "HEAD or direct parent is not a full commit hash");
  invariant(localMain === FROZEN_MAIN && originMain === FROZEN_MAIN, "local or origin main moved from the frozen authority");
  invariant(status === "", "evidence assembly requires a clean worktree");
  invariant(upstream === `origin/${PHASE7A_R1_BRANCH}` && upstreamHead === head, "local/upstream branch parity differs");
  invariant(mergeRows === "", "Phase 7A-R1 contains a merge commit");
  invariant(phase6Ancestor, "accepted Phase 6 is not an ancestor of final HEAD");
  const commits = rows.split(/\r?\n/).filter(Boolean).map((line, index) => {
    const [hash, parentsText, ...subjectParts] = line.split("\t");
    const parents = parentsText.split(/\s+/).filter(Boolean);
    invariant(HASH_40.test(hash) && parents.length === 1 && HASH_40.test(parents[0]), `R1 commit ${index + 1} is not single-parent`);
    return { hash, parents, subject: safeString(subjectParts.join("\t")) };
  });
  invariant(commits.length > 0, "R1 commit list is empty");
  let expectedParent = PHASE7A_R1_PARENT;
  for (const [index, commit] of commits.entries()) {
    invariant(commit.parents[0] === expectedParent, `R1 commit ${index + 1} breaks linear ancestry`);
    expectedParent = commit.hash;
  }
  invariant(commits.at(-1).hash === head && commits.at(-1).parents[0] === directParent, "R1 commit list does not bind final HEAD/direct parent");
  return {
    status: "PASS",
    branch,
    finalHead: head,
    directParent,
    requiredParent: PHASE7A_R1_PARENT,
    acceptedPhase6: PHASE7A_PARENT,
    acceptedPhase6Ancestry: true,
    localMain,
    originMain,
    zeroMergeCommits: true,
    localUpstreamParity: true,
    upstream,
    cleanWorktree: true,
    commits,
  };
}

async function generateProductionDiff(repoRoot, expectedPath = null) {
  const output = await git(repoRoot, "diff", "--no-ext-diff", "--no-color", "--full-index", `${PHASE7A_R1_PARENT}..HEAD`, "--", ...PRODUCTION_DIFF_PATHS);
  invariant(output.length > 0, "production diff is empty");
  invariant(!/GIT binary patch/.test(output) && !containsPrivatePath(output), "production diff contains a binary payload or private path");
  const bytes = Buffer.from(`${output}\n`);
  if (expectedPath) {
    const expected = await readFile(expectedPath);
    invariant(expected.equals(bytes), "supplied production diff differs from live git authority");
  }
  return bytes;
}

async function verifyPhase4(repoRoot) {
  const assets = [];
  for (const [relativePath, expectedSha256] of PHYSICAL_ASSETS) {
    const absolute = path.join(repoRoot, ...relativePath.split("/"));
    const bytes = await readFile(absolute);
    const actualSha256 = digest(bytes);
    invariant(actualSha256 === expectedSha256, `Phase 4 authority hash differs: ${relativePath}`);
    assets.push({ relativePath, bytes: bytes.length, sha256: actualSha256, expectedSha256, status: "PASS" });
  }
  return { schema: `${ASSEMBLER_SCHEMA}.phase4`, status: "PASS", copiedIntoReviewPackage: false, assets };
}

async function loadQa(candidate, engine) {
  const record = await readJsonFile(candidate, `${engine} QA JSON`);
  const result = validateQaReport(record.value, engine);
  return { report: record.value, result, sha256: record.sha256, proxyLimitation: engine === "webkit" && record.value.status !== "PASS" };
}

async function loadInstalledChrome(root) {
  const reportRecord = await readJsonAt(root, "installed-chrome-200-percent-report.json");
  validateInstalledChromeReport(reportRecord.value);
  const files = await listFiles(root);
  const images = files.filter(({ relativePath }) => SAFE_IMAGE.test(relativePath));
  invariant(images.length === 15 && images.every(({ relativePath }) => /\.png$/i.test(relativePath)), "installed Chrome 200% evidence must contain exactly 15 PNG visual states");
  const imageByName = new Map(images.map((file) => [file.relativePath, file]));
  invariant(imageByName.size === images.length, "installed Chrome visual paths are duplicated");
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default ?? sharpModule;
  for (const visual of reportRecord.value.visualEvidence) {
    const relativePath = `screenshots/${visual.filename}`;
    const file = imageByName.get(relativePath);
    invariant(file, `installed Chrome visual file is missing: ${visual.filename}`);
    const bytes = await readFile(file.absolute);
    assertRasterSignature(bytes, relativePath);
    invariant(bytes.length === visual.bytes && digest(bytes) === visual.sha256, `installed Chrome visual bytes/hash differ: ${visual.filename}`);
    const [metadata, statistics] = await Promise.all([sharp(bytes).metadata(), sharp(bytes).stats()]);
    const maximumChannelRange = Math.max(...statistics.channels.slice(0, 3).map(({ min, max }) => max - min));
    invariant(metadata.format === visual.format && metadata.width === visual.width && metadata.height === visual.height, `installed Chrome visual decoded dimensions differ: ${visual.filename}`);
    invariant(Math.abs(statistics.entropy - visual.entropy) < 1e-12 && maximumChannelRange === visual.maximumChannelRange && statistics.entropy >= 1 && maximumChannelRange >= 80, `installed Chrome visual decoded content analysis differs: ${visual.filename}`);
  }
  return { report: reportRecord.value, sha256: reportRecord.sha256, images };
}

async function loadInstalledChromeUi(root) {
  const files = await listFiles(root);
  const images = files.filter(({ relativePath }) => SAFE_IMAGE.test(relativePath));
  invariant(images.length > 0 && images.every(({ relativePath }) => /\.png$/i.test(relativePath)), "installed Chrome UI evidence must contain one or more PNG screenshots");
  const reportFile = files.find(({ relativePath }) => /(?:^|\/)(?:installed-chrome-ui-report|report)\.json$/i.test(relativePath));
  invariant(reportFile, "installed Chrome UI evidence report is missing");
  const record = await readJsonFile(reportFile.absolute, "installed Chrome UI report");
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default ?? sharpModule;
  const observedImages = [];
  for (const image of images) {
    const bytes = await readFile(image.absolute);
    assertRasterSignature(bytes, image.relativePath);
    const [metadata, statistics] = await Promise.all([sharp(bytes).metadata(), sharp(bytes).stats()]);
    observedImages.push({
      relativePath: image.relativePath,
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      bytes: bytes.length,
      sha256: digest(bytes),
      entropy: statistics.entropy,
      maximumChannelRange: Math.max(...statistics.channels.slice(0, 3).map(({ min, max }) => max - min)),
    });
  }
  validateInstalledChromeUiReport(record.value, observedImages);
  return { report: record.value, sha256: record.sha256, images, observedImages };
}

/** Cross-bind a portable capture product to the live final HEAD and closure source authority. */
export function validateFinalCaptureBinding(receipt, sourceRecords, finalHead, servedBuildAuthority, label) {
  validatePortableServedBuildReceipt(receipt, finalHead, servedBuildAuthority);
  invariant(Array.isArray(sourceRecords) && sourceRecords.length > 0, `${label} has no source-bound evidence records`);
  for (const [index, source] of sourceRecords.entries()) validatePortableSourceAuthority(source, receipt, `${label} source ${index + 1}`);
  return true;
}

function deriveDeploymentPayloadLedger(report) {
  const files = report.dist?.files;
  invariant(Array.isArray(files) && files.length > 1, "deployment local-dist file ledger is missing or vacuous");
  const localPaths = new Set();
  let allBytes = 0;
  const comparable = new Map();
  for (const file of files) {
    invariant(typeof file?.relativePath === "string" && file.relativePath.length > 0 && !localPaths.has(file.relativePath), "deployment local-dist file path is missing or duplicated");
    invariant(Number.isSafeInteger(file.bytes) && file.bytes > 0 && HASH_64.test(file.sha256 ?? ""), `deployment local-dist byte/hash differs: ${file.relativePath}`);
    invariant(["REQUIRED", "EXCLUDED_CLOUDFLARE_CONFIGURATION"].includes(file.deploymentComparison), `deployment comparison classification differs: ${file.relativePath}`);
    localPaths.add(file.relativePath);
    allBytes += file.bytes;
    if (file.deploymentComparison === "REQUIRED") comparable.set(file.relativePath, file);
  }
  invariant(comparable.size > 0 && report.dist.totals?.files === files.length && report.dist.totals.comparableFiles === comparable.size && report.dist.totals.bytes === allBytes, "deployment local-dist totals differ from its file ledger");
  const originMaps = {};
  for (const originName of ["immutable", "branch"]) {
    const responses = report.origins?.[originName]?.data?.responses;
    invariant(Array.isArray(responses) && responses.length === comparable.size, `deployment ${originName} response ledger size differs from local dist`);
    const map = new Map();
    for (const response of responses) {
      invariant(typeof response?.relativePath === "string" && comparable.has(response.relativePath) && !map.has(response.relativePath), `deployment ${originName} response path is missing, extra, or duplicated`);
      const local = comparable.get(response.relativePath);
      invariant(response.status === "PASS" && response.bytes === local.bytes && response.sha256 === local.sha256, `deployment ${originName} byte/hash parity differs: ${response.relativePath}`);
      invariant(Number.isInteger(response.expectedHttpStatus) && response.actualHttpStatus === response.expectedHttpStatus && [200, 404].includes(response.actualHttpStatus), `deployment ${originName} HTTP status parity differs: ${response.relativePath}`);
      invariant(typeof response.publicPath === "string" && response.publicPath.startsWith("/"), `deployment ${originName} public path differs: ${response.relativePath}`);
      invariant(response.headers?.status === "PASS" && typeof response.headers.contentType === "string" && response.headers.contentType.length > 0 && typeof response.headers.cacheControl === "string" && response.headers.cacheControl.length > 0 && Array.isArray(response.headers.matchedPolicies), `deployment ${originName} MIME/cache authority differs: ${response.relativePath}`);
      invariant(response.security?.status === "PASS", `deployment ${originName} security-header authority differs: ${response.relativePath}`);
      map.set(response.relativePath, response);
    }
    originMaps[originName] = map;
  }
  const payloadLedger = [];
  for (const relativePath of [...comparable.keys()].sort()) {
    const local = comparable.get(relativePath);
    const immutable = originMaps.immutable.get(relativePath);
    const branch = originMaps.branch.get(relativePath);
    invariant(immutable.publicPath === branch.publicPath && immutable.expectedHttpStatus === branch.expectedHttpStatus && immutable.actualHttpStatus === branch.actualHttpStatus, `deployment origin route/status ledgers differ: ${relativePath}`);
    invariant(immutable.headers.contentType === branch.headers.contentType && immutable.headers.cacheControl === branch.headers.cacheControl && JSON.stringify(immutable.headers.matchedPolicies) === JSON.stringify(branch.headers.matchedPolicies), `deployment origin MIME/cache ledgers differ: ${relativePath}`);
    payloadLedger.push({
      relativePath,
      publicPath: immutable.publicPath,
      bytes: local.bytes,
      sha256: local.sha256,
      expectedHttpStatus: immutable.expectedHttpStatus,
      contentType: immutable.headers.contentType,
      cacheControl: immutable.headers.cacheControl,
      matchedPolicies: immutable.headers.matchedPolicies,
      localDist: "PASS",
      immutable: { status: immutable.status, actualHttpStatus: immutable.actualHttpStatus, bytes: immutable.bytes, sha256: immutable.sha256, headers: immutable.headers.status, security: immutable.security.status },
      branch: { status: branch.status, actualHttpStatus: branch.actualHttpStatus, bytes: branch.bytes, sha256: branch.sha256, headers: branch.headers.status, security: branch.security.status },
      status: "PASS",
    });
  }
  return { payloadLedger, totals: { files: files.length, comparableFiles: comparable.size, bytes: allBytes } };
}

export function normalizeDeployment(report, head) {
  assertPass(report, "deployment verification");
  invariant(report.schema === "quantum-hub.phase-7a.deployment-verification.v1", "deployment verification schema differs");
  invariant(report.authorityProfile === "phase7a-r1", "deployment authority profile differs from phase7a-r1");
  invariant(HASH_40.test(head), "deployment final HEAD authority is invalid");
  assertExactCheckMap(report.checks, DEPLOYMENT_CHECKS, "deployment verification");
  invariant(report.parity === "PASS", "deployment parity status differs");
  invariant(report.deployedSha === head, "deployment commit differs from final HEAD");
  invariant(report.environment === "preview" && report.projectName === "qsite1", "deployment environment/project authority differs");
  invariant(Number.isFinite(Date.parse(report.generatedAt ?? "")), "deployment verification timestamp is invalid");
  invariant(report.branchUrl === PHASE7A_R1_BRANCH_URL, "deployment branch preview URL differs from the exact Phase 7A-R1 alias");
  let immutableUrl;
  try { immutableUrl = new URL(report.immutableUrl); }
  catch { throw new Error("deployment immutable preview URL is invalid"); }
  invariant(immutableUrl.protocol === "https:" && immutableUrl.pathname === "/" && !immutableUrl.username && !immutableUrl.password && !immutableUrl.search && !immutableUrl.hash, "deployment immutable preview URL differs");
  invariant(/^[0-9a-f]{8}\.qsite1\.pages\.dev$/.test(immutableUrl.hostname), "deployment immutable preview hostname differs");

  const inputs = report.inputs;
  invariant(inputs && typeof inputs === "object" && !Array.isArray(inputs), "deployment input authority is missing");
  invariant(inputs.expectedDeployedSha === head && inputs.branch === PHASE7A_R1_BRANCH && inputs.acceptedParent === PHASE7A_R1_PARENT && inputs.frozenMain === FROZEN_MAIN && inputs.localDist === "dist", "deployment input authority differs");

  const repository = report.repository;
  invariant(repository?.status === "PASS" && repository.data?.status === "PASS", "deployment repository provenance is not PASS");
  invariant(repository.data.authorityProfile === "phase7a-r1" && repository.data.branch === PHASE7A_R1_BRANCH && repository.data.deployedSha === head && repository.data.acceptedParent === PHASE7A_R1_PARENT && repository.data.cleanTree === true, "deployment repository provenance differs");
  invariant(repository.data.main?.local === FROZEN_MAIN && repository.data.main?.origin === FROZEN_MAIN && repository.data.main?.frozen === FROZEN_MAIN && repository.data.main?.containsDeployedSha === false, "deployment frozen-main provenance differs");
  invariant(repository.data.branchUpstream?.ref === `origin/${PHASE7A_R1_BRANCH}` && repository.data.branchUpstream?.sha === head && repository.data.branchUpstream?.parity === true, "deployment branch/upstream provenance differs");

  const signed = report.deployment;
  invariant(signed?.status === "PASS" && signed.data?.status === "PASS", "signed Cloudflare deployment provenance is not PASS");
  invariant(signed.data.authoritySource === "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK" && signed.data.appSlug === "cloudflare-workers-and-pages", "signed Cloudflare deployment authority differs");
  invariant(/^\d+$/.test(String(signed.data.checkRunId ?? "")) && Number.isFinite(Date.parse(signed.data.completedAt ?? "")), "signed Cloudflare check-run identity differs");
  invariant(signed.data.projectName === "qsite1" && signed.data.environment === "preview" && signed.data.branch === PHASE7A_R1_BRANCH && signed.data.deployedSha === head, "signed Cloudflare deployment binding differs");
  invariant(signed.data.immutableUrl === report.immutableUrl && signed.data.branchUrl === PHASE7A_R1_BRANCH_URL && signed.data.deploymentId === report.deploymentId && typeof report.deploymentId === "string" && report.deploymentId.startsWith(immutableUrl.hostname.slice(0, 8)), "signed Cloudflare URLs/deployment identity differ");

  invariant(report.dist?.status === "PASS" && Array.isArray(report.dist.files) && report.dist.files.length > 0, "local dist authority is not PASS or is empty");
  invariant(report.dist.totals?.files === report.dist.files.length && Number.isInteger(report.dist.totals?.comparableFiles) && report.dist.totals.comparableFiles > 0 && Number.isSafeInteger(report.dist.totals?.bytes) && report.dist.totals.bytes > 0, "local dist authority totals differ");
  for (const name of ["immutable", "branch"]) {
    const origin = report.origins?.[name];
    const expectedUrl = name === "immutable" ? report.immutableUrl : PHASE7A_R1_BRANCH_URL;
    invariant(origin?.status === "PASS" && origin.data?.status === "PASS" && origin.data.origin === expectedUrl, `deployment ${name} origin parity is not PASS`);
    invariant(Array.isArray(origin.data.exactPublicRoutes) && origin.data.exactPublicRoutes.length === 10 && origin.data.exactPublicRoutes.every((route) => route?.status === "PASS"), `deployment ${name} public-route authority differs`);
    invariant(origin.data.real404?.httpStatus === 404 && origin.data.real404?.byteParity === true && origin.data.securityHeaders?.status === "PASS", `deployment ${name} 404/header authority differs`);
    invariant(Array.isArray(origin.data.responses) && origin.data.responses.length > 0, `deployment ${name} response ledger is empty`);
  }
  invariant(Array.isArray(report.failures) && report.failures.length === 0, "deployment verification retains failures or omits its failure ledger");
  const derivedPayloads = deriveDeploymentPayloadLedger(report);

  const branch = PHASE7A_R1_BRANCH;
  const commitHash = head;
  const localDistDeployedParity = report.parity === "PASS"
    && report.dist.status === "PASS"
    && report.origins.immutable.status === "PASS"
    && report.origins.branch.status === "PASS"
    && report.checks.immutableExactByteContentAndRouteParity === true
    && report.checks.branchExactByteContentAndRouteParity === true;
  const immutableOrigin = report.origins.immutable.status === "PASS" && report.origins.immutable.data.status === "PASS" && report.checks.immutableExactByteContentAndRouteParity === true;
  const branchOrigin = report.origins.branch.status === "PASS" && report.origins.branch.data.status === "PASS" && report.checks.branchExactByteContentAndRouteParity === true;
  const signedDeploymentBinding = signed.status === "PASS" && signed.data.status === "PASS" && report.checks.signedCloudflareCheckBindsDeployedShaAndUrls === true;
  invariant(localDistDeployedParity && immutableOrigin && branchOrigin && signedDeploymentBinding, "deployment normalized proof derivation failed");
  return {
    schema: `${ASSEMBLER_SCHEMA}.deployment`,
    status: "PASS",
    authorityProfile: "phase7a-r1",
    branch,
    commitHash,
    localDistDeployedParity,
    immutableOrigin,
    branchOrigin,
    signedDeploymentBinding,
    signedCloudflareCheckBinding: signedDeploymentBinding,
    environment: report.environment ?? null,
    deploymentId: report.deploymentId ?? null,
    proof: {
      localDistDeployedParity,
      immutableOrigin,
      branchOrigin,
      signedDeploymentBinding,
    },
    checks: {
      localDistDeployedParity,
      immutableOrigin,
      branchOrigin,
      signedDeploymentBinding,
      signedCloudflareCheckBinding: signedDeploymentBinding,
    },
    payloadLedger: derivedPayloads.payloadLedger,
    payloadTotals: derivedPayloads.totals,
  };
}

async function writeOwned(root, relativePath, bytes) {
  validRelative(relativePath, "output path");
  const destination = path.join(root, ...relativePath.split("/"));
  invariant(within(root, destination), `output path escapes evidence root: ${relativePath}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" });
}

async function writeJson(root, relativePath, value) {
  const sanitized = sanitizeForPackage(value);
  const bytes = Buffer.from(json(sanitized));
  invariant(!PRIVATE_PATH.test(bytes.toString("utf8")) && !LOCAL_ORIGIN.test(bytes.toString("utf8")), `report privacy scan failed: ${relativePath}`);
  await writeOwned(root, relativePath, bytes);
}

function closureImageDestination(relativePath) {
  const mappings = [
    [/^responsive\/before\/(.+)$/i, "03-responsive/visuals/before/"],
    [/^responsive\/after\/(.+)$/i, "03-responsive/visuals/after/"],
    [/^signal-field\/(.+)$/i, "04-signal-field/visuals/"],
    [/^audience-bifurcation\/(.+)$/i, "05-audience/visuals/"],
    [/^typography\/(.+)$/i, "06-typography/visuals/"],
    [/^field-map\/(.+)$/i, "07-field-map/visuals/"],
    [/^fallback\/reduced-motion-(.+)$/i, "12-fallback/visuals/reduced-motion-"],
    [/^fallback\/no-javascript-(.+)$/i, "12-fallback/visuals/no-javascript-"],
    [/^fallback\/fallback-fonts-(.+)$/i, "12-fallback/visuals/fallback-fonts-"],
    [/^firefox-first-paint\/(.+)$/i, "10-firefox/visuals/"],
    [/^route-shells\/(.+)$/i, "15-publication/visuals/"],
  ];
  for (const [pattern, prefix] of mappings) {
    const match = relativePath.match(pattern);
    if (match) return `${prefix}${match[1]}`;
  }
  return null;
}

async function copyCuratedImages(sourceRoot, files, destinationRoot, resolver, label) {
  const copied = [];
  const names = new Set();
  for (const file of files) {
    const relativePath = validRelative(file.relativePath, `${label} image path`);
    if (!SAFE_IMAGE.test(relativePath)) continue;
    const destination = resolver(relativePath, copied.length);
    if (!destination) continue;
    validRelative(destination, `${label} destination`);
    invariant(!names.has(destination.toLowerCase()), `${label} image destination is duplicated: ${destination}`);
    names.add(destination.toLowerCase());
    const absolute = file.absolute ?? path.join(sourceRoot, ...relativePath.split("/"));
    invariant(within(sourceRoot, absolute), `${label} image escapes input root`);
    const bytes = await readFile(absolute);
    assertRasterSignature(bytes, relativePath);
    await writeOwned(destinationRoot, destination, bytes);
    copied.push({ source: relativePath, destination, bytes: bytes.length, sha256: digest(bytes) });
  }
  return copied;
}

function lifecycleReport(qas, fieldMap, scenarioCapture) {
  const engines = qas.map(({ result }) => ({
    engine: result.identity.engine,
    status: result.cycles.status,
    cycles: result.cycles.samples.length,
    rest: result.cycles.rest,
    checks: result.cycles.checks,
    historyStatus: result.history.status,
  }));
  for (const item of engines) {
    invariant(item.status === "PASS" && item.cycles === 10, `lifecycle evidence does not prove ten passing cycles: ${item.engine}`);
    assertExactCheckMap(item.checks, LIFECYCLE_CHECKS, `lifecycle ${item.engine}`);
  }
  invariant(Array.isArray(scenarioCapture?.recordings) && scenarioCapture.recordings.length === 14, "performance/lifecycle recording inventory must contain fourteen governed scenarios");
  const scenarioRecordings = scenarioCapture.recordings.map(({ record, bytes }) => {
    const stateAuthority = sanitizeForPackage(record.states);
    validateScenarioStates(record.scenario, stateAuthority);
    return {
      engine: record.engine,
      scenario: record.scenario,
      relativePath: `19-recordings/${record.engine}-${record.scenario}.mp4`,
      sourceAuthority: record.sourceAuthority,
      media: record.media,
      bytes: bytes.length,
      sha256: digest(bytes),
      validationChecks: record.validationChecks ?? record.checks,
      scenarioValidation: record.scenarioValidation,
      stateAuthority,
      stateAuthoritySha256: digest(Buffer.from(stableJson(stateAuthority), "utf8")),
      status: record.status,
    };
  });
  return {
    schema: `${ASSEMBLER_SCHEMA}.performance-lifecycle`,
    status: "PASS",
    engines,
    fieldMapLifecycle: {
      status: fieldMap.status,
      repeatedCycles: fieldMap.repeatedCycles.length,
      pagehideRestored: fieldMap.lifecycle?.pagehide?.inertRegionCount === 0,
      pageshowRestored: fieldMap.lifecycle?.pageshow?.inertRegionCount === 0,
      historyRestored: fieldMap.lifecycle?.history?.inertRegionCount === 0,
    },
    servedBuildAuthority: sanitizeForPackage(scenarioCapture.manifest.servedBuild),
    scenarioRecordings,
    statement: "Automated lifecycle evidence proves bounded scripted cycles and stable stop states; it is not promoted as physical input or physical Safari evidence.",
  };
}

function networkReport(qas) {
  const engines = qas.map(({ result }) => ({
    engine: result.identity.engine,
    cases: result.network.map(({ policy, cinematicRequests, checks, status }) => ({ policy, cinematicRequests, checks, status })),
  }));
  for (const { engine, cases } of engines) {
    invariant(cases.length === 2 && cases.every((item) => item.status === "PASS"), `network evidence contains a failed policy state: ${engine}`);
    for (const item of cases) assertExactCheckMap(item.checks, NETWORK_CHECKS, `network ${engine} ${item.policy}`);
  }
  return { schema: `${ASSEMBLER_SCHEMA}.network`, status: "PASS", originIsolation: "PASS", engines };
}

function taskAuthorityMarkdown(provenance) {
  return `# Quantum-Hub Qsite1 — Phase 7A-R1 authority\n\nThis package is governed by **Signal Field authority, responsive typography and accessibility closure**. It repairs only the three R1 gates while preserving the three previously accepted Phase 7A gates, the complete controlled demolition, the frozen physical opening, native scroll and all publication controls.\n\n- Branch: \`${PHASE7A_R1_BRANCH}\`\n- Exact accepted parent: \`${PHASE7A_R1_PARENT}\`\n- Final HEAD: \`${provenance.finalHead}\`\n- Frozen main: \`${FROZEN_MAIN}\`\n- Human decision: all six gates remain **PENDING HUMAN REVIEW**\n- Phase 7B authorized: **no**\n- Main merged or modified: **no**\n\nThis evidence package does not self-accept Phase 7A.\n`;
}

function publicationReport(qas, routes) {
  invariant(routes.status === "PASS" && routes.cases.length === 8, "closure route-shell publication evidence differs");
  const engines = qas.map(({ result }) => ({ engine: result.identity.engine, cases: result.routes.length, status: result.routes.every((item) => item.status === "PASS") ? "PASS" : "FAIL" }));
  invariant(engines.every(({ status }) => status === "PASS"), "publication route matrix contains failures");
  return {
    schema: `${ASSEMBLER_SCHEMA}.publication`,
    status: "PASS",
    semanticRouteShellsAndReal404: sanitizeForPackage(routes.cases),
    fullBrowserRouteMatrices: engines,
    retainedBoundaries: {
      maradinOnlyProof: true,
      industryCount: 4,
      sparkClosed: true,
      contactTruthPreserved: true,
      teamRosterAbsent: true,
    },
  };
}

function limitationsReport(webkitQa, installedChrome, firstPaint) {
  const firefoxFirstPaint = validateFirefoxFirstPaintReport(firstPaint);
  return {
    schema: `${ASSEMBLER_SCHEMA}.limitations`,
    status: "DOCUMENTED",
    evidenceClasses: {
      chromium: "Playwright managed browser engine",
      firefox: "Playwright managed browser engine",
      webkit: webkitQa.result.identity.authority,
      installedChrome200: installedChrome.report.classification,
      firefoxFirstPaint: firefoxFirstPaint.status,
    },
    limitations: [
      webkitQa.proxyLimitation
        ? "The WebKit proxy report is FAIL only because headless synthetic Tab focus fell to BODY; inert ownership, eight links, target sizes, Escape, focus return and repeated-cycle restoration passed. This is recorded as a proxy limitation and is not promoted to PASS."
        : "WebKit remains a passing proxy run and is not physical Safari evidence.",
      firefoxFirstPaint.boundedLimitation
        ? `Firefox first-paint is retained as an evidenced LIMITATION: ${firefoxFirstPaint.classification}. Separate navigation-start and stable captures record inline and computed dark-background authority; this is not promoted to PASS.`
        : `Firefox first-paint PASS classification: ${firefoxFirstPaint.classification}.`,
      "Programmatic keyboard, pointer and scroll checks are not promoted as physical human-input evidence.",
      "Synthetic pagehide/pageshow and history checks are not promoted beyond the states actually observed.",
      "Physical Safari, physical touch/wheel input, hidden-document scheduling and platform BFCache behavior remain for human or physical-device review.",
      "All six Phase 7A gates remain pending independent human review.",
    ],
    phase7bAuthorized: false,
    mainMergeAuthorized: false,
  };
}

async function assembleReports({ root, provenance, closure, qas, recordings, installedChrome, installedChromeUi, deployment, phase4, diffBytes, inputHashes, generatedAt }) {
  const webkitQa = qas[2];
  const currentGates = PHASE7A_GATES.map((gate) => ({ gate, status: "PENDING HUMAN REVIEW" }));
  const governance = {
    schema: GOVERNANCE_SCHEMA,
    assemblerSchema: ASSEMBLER_SCHEMA,
    authorityProfile: "phase7a-r1",
    status: "READY",
    fresh: true,
    sourceHead: provenance.finalHead,
    generatedAt,
    sourceInputs: inputHashes,
    policy: {
      curatedRasterAndMp4Only: true,
      localPathsAndOriginsRemoved: true,
      rawManifestsExcluded: true,
      htmlAndFontPayloadsExcluded: true,
      phase4AssetsHashedNotCopied: true,
      humanGatesPending: true,
    },
  };
  await writeJson(root, GOVERNANCE_PATH, governance);
  await writeOwned(root, "00-authority/task-authority.md", Buffer.from(taskAuthorityMarkdown(provenance)));
  await writeJson(root, "00-authority/prior-human-decisions.json", { schema: `${ASSEMBLER_SCHEMA}.prior-decisions`, gates: PRIOR_HUMAN_DECISIONS });
  await writeJson(root, "00-authority/current-human-gates.json", { schema: `${ASSEMBLER_SCHEMA}.current-gates`, gates: currentGates, selfAccepted: false, phase7bAuthorized: false });
  await writeJson(root, "01-provenance/provenance.json", provenance);
  await writeJson(root, "01-provenance/served-build-authority.json", {
    ...closure.servedBuildAuthority,
    network: undefined,
    deploymentBinding: deployment.servedBuildDocumentBinding,
  });
  await writeOwned(root, "02-diff/production.diff", diffBytes);

  await writeJson(root, "03-responsive/clipping-report.json", {
    schema: `${ASSEMBLER_SCHEMA}.clipping`, status: "PASS", requiredViewportCount: 12,
    before: closure.before.cases,
    after: closure.after.cases,
    verdict: "Every repaired case passed measured H1, rendered-line, usable-field, viewport and glyph-bearing clipping invariants.",
  });
  await writeJson(root, "04-signal-field/before-after-report.json", {
    schema: `${ASSEMBLER_SCHEMA}.signal-field`,
    status: "PASS",
    records: closure.signal.records.map(({ label, state }) => ({ label, state })),
    comparisonRecordings: closure.signalRecordings.recordings.map((record) => ({
      id: record.id,
      engine: record.engine,
      state: record.state,
      sourceAuthority: record.sourceAuthority,
      relativePath: `04-signal-field/recordings/${path.posix.basename(record.relativePath)}`,
      visibleLabel: record.visibleLabel,
      boundedPointerResponse: record.boundedPointerResponse,
      settledState: record.settledState,
      pointerStates: record.pointerStates,
      pointerSettled: record.pointerSettled,
      media: record.media,
      bytes: record.bytes,
      sha256: record.sha256,
      validationChecks: record.validationChecks,
      status: record.status,
    })),
    recordingContract: closure.signalRecordings.contract,
    recordingTools: closure.signalRecordings.tools,
    servedBuildAuthority: closure.signalRecordings.servedBuildAuthority,
    rawBrowserVideoRetained: false,
  });
  await writeJson(root, "05-audience/bifurcation-report.json", { schema: `${ASSEMBLER_SCHEMA}.bifurcation`, status: "PASS", cases: closure.bifurcation.cases.map(({ viewport, state, status }) => ({ viewport, state, status })) });
  await writeJson(root, "06-typography/typography-report.json", {
    ...closure.typography,
    candidates: closure.typography.candidates.map((candidate) => ({
      ...candidate,
      specimen: `06-typography/visuals/${path.posix.basename(candidate.specimen)}`,
    })),
  });
  await writeJson(root, "07-field-map/semantic-isolation-report.json", { ...closure.fieldMap, network: undefined });
  await writeJson(root, "08-targets/target-size-inventory.json", closure.targets);
  const chromeUiDestinations = new Map(installedChromeUi.observedImages.map((image, index) => [image.relativePath, `09-chrome-200/visuals/ui-${String(index + 1).padStart(2, "0")}-${path.posix.basename(image.relativePath)}`]));
  const chromeUiAuthority = {
    ...installedChromeUi.report,
    screenshots: installedChromeUi.report.screenshots.map((screenshot) => ({ ...screenshot, relativePath: chromeUiDestinations.get(screenshot.relativePath) })),
    visibleZoomObservation: { ...installedChromeUi.report.visibleZoomObservation, screenshot: chromeUiDestinations.get(installedChromeUi.report.visibleZoomObservation.screenshot) },
    sourceReportSha256: installedChromeUi.sha256,
  };
  await writeJson(root, "09-chrome-200/installed-chrome-200-percent-report.json", {
    ...installedChrome.report,
    visibleBrowserZoomConfirmation: chromeUiAuthority,
  });
  await writeJson(root, "10-firefox/firefox-first-paint-report.json", { ...closure.firstPaint, network: undefined });
  await writeJson(root, "11-accessibility/accessibility-report.json", {
    schema: `${ASSEMBLER_SCHEMA}.accessibility`, status: "PASS",
    closure: [closure.axeChromium, closure.axeFirefox],
    qaServedBuildAuthorities: qas.map(({ report, result }) => ({ engine: result.identity.engine, servedBuild: sanitizeForPackage(report.servedBuild), sourceAuthority: result.sourceAuthority })),
    fullMatrices: qas.map(({ result }) => ({ engine: result.identity.engine, cases: result.accessibility.length, violations: result.accessibility.reduce((sum, item) => sum + (item.accessibility?.violations?.length ?? 0), 0), sourceAuthority: result.sourceAuthority, status: "PASS" })),
    statement: "Automated checks supplement keyboard, semantic isolation, target-size and human assistive-technology review.",
  });
  await writeJson(root, "12-fallback/reduced-motion-report.json", { schema: `${ASSEMBLER_SCHEMA}.reduced-motion`, status: "PASS", closure: closure.fallback.reducedMotion, engines: qas.map(({ result }) => ({ engine: result.identity.engine, evidence: result.fallback.reducedMotion })) });
  await writeJson(root, "12-fallback/no-js-report.json", { schema: `${ASSEMBLER_SCHEMA}.no-js`, status: "PASS", closure: closure.fallback.noJavaScript, engines: qas.map(({ result }) => ({ engine: result.identity.engine, evidence: result.fallback.noJavaScript })) });
  await writeJson(root, "12-fallback/fallback-font-report.json", { schema: `${ASSEMBLER_SCHEMA}.fallback-font`, status: "PASS", closure: closure.fallback.fallbackFonts, engines: qas.map(({ result }) => ({ engine: result.identity.engine, evidence: result.fallback.fallbackFont })) });
  await writeJson(root, "13-performance/performance-and-lifecycle-report.json", lifecycleReport(qas, closure.fieldMap, recordings));
  await writeJson(root, "14-network/network-report.json", networkReport(qas));
  await writeJson(root, "15-publication/publication-regression.json", publicationReport(qas, closure.routes));
  await writeJson(root, "16-phase4/phase-4-hash-verification.json", phase4);
  await writeJson(root, "17-deployment/deployment-verification.json", deployment);
  await writeJson(root, "18-limitations/environmental-limitations.json", limitationsReport(webkitQa, installedChrome, closure.firstPaint));
}

function parseArguments(argv) {
  const options = {
    closureDir: null,
    recordingsDir: null,
    chromiumQa: null,
    firefoxQa: null,
    webkitQa: null,
    installedChrome200Dir: null,
    installedChromeUiDir: null,
    deploymentJson: null,
    outputDir: null,
    productionDiff: null,
    help: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[index + 1];
      invariant(value && !value.startsWith("--"), `${flag} requires a value`);
      index += 1;
      return value;
    };
    if (flag === "--closure-dir") options.closureDir = next();
    else if (flag === "--recordings-dir") options.recordingsDir = next();
    else if (flag === "--chromium-qa") options.chromiumQa = next();
    else if (flag === "--firefox-qa") options.firefoxQa = next();
    else if (flag === "--webkit-qa") options.webkitQa = next();
    else if (flag === "--installed-chrome-200-dir") options.installedChrome200Dir = next();
    else if (flag === "--installed-chrome-ui-dir") options.installedChromeUiDir = next();
    else if (flag === "--deployment-json") options.deploymentJson = next();
    else if (flag === "--output-dir") options.outputDir = next();
    else if (flag === "--production-diff") options.productionDiff = next();
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown option: ${flag}`);
  }
  return options;
}

function fixtureTarget() {
  return { status: "PASS", minimumCssPixels: 44, candidateCount: 0, records: [], targetFailures: [], validExclusions: [], unexplainedExclusions: [], contractFailures: [], summary: { belowMinimum: 0, targetFailures: 0, validExclusions: 0, unexplainedExclusions: 0, contractFailures: 0 } };
}

function fixtureChecks(keys) {
  return Object.fromEntries(keys.map((key) => [key, true]));
}

function fixtureNoJavaScriptFallback() {
  return {
    nativeDetailsOpen: true,
    enhancedController: null,
    horizontalOverflow: false,
    fieldMapLinkInventory: FIELD_MAP_HREFS.map((href, index) => ({
      index,
      href,
      accessibleName: FIELD_MAP_NAMES[index],
      elementType: "a",
      width: 120,
      height: 44,
      visible: true,
      fullyInViewport: true,
      unoccluded: true,
      intendedInteractive: true,
    })),
  };
}

function fixtureFallbackFonts() {
  return {
    anybodyLoaded: false,
    abortedFontRequests: 1,
    manifestoWords: 7,
    horizontalOverflow: false,
    manifestoVisibility: { status: "PASS" },
  };
}

function fixtureQa(engine) {
  const revision = "b".repeat(40);
  const runtimeAssets = [{ kind: "css", route: "/_astro/app.css", bytes: 111, sha256: "1".repeat(64) }, { kind: "javascript", route: "/_astro/app.js", bytes: 222, sha256: "2".repeat(64) }];
  const servedBuild = { schema: PORTABLE_SERVED_BUILD_SCHEMA, status: "PASS", branch: PHASE7A_R1_BRANCH, revision, document: { relativePath: "dist/index.html", bytes: 333, sha256: "3".repeat(64) }, runtimeAssets, runtimeFingerprint: runtimeAssetFingerprint(runtimeAssets), servedParity: { document: true, runtimeAssets: true }, freshBuild: { command: "npm run build:phase7a-r1", headBefore: revision, headAfter: revision, worktreeCleanBefore: true, worktreeCleanAfter: true } };
  const routes = Array.from({ length: EXPECTED_QA_ROUTE_COUNTS[engine] }, () => ({ status: "PASS", checks: fixtureChecks(QA_ROUTE_CHECKS), state: { targetSize: fixtureTarget() } }));
  const accessibility = Array.from({ length: 20 }, () => ({ status: "PASS", accessibility: { status: "PASS", violations: [] } }));
  const responsive = Array.from({ length: EXPECTED_QA_RESPONSIVE_MINIMUMS[engine] }, () => ({ status: "PASS", checks: fixtureChecks(QA_RESPONSIVE_CHECKS), state: { targetSize: fixtureTarget() } }));
  return {
    authorityProfile: "phase7a-r1",
    branch: PHASE7A_R1_BRANCH,
    servedBuild,
    status: "PASS",
    results: [{
      sourceAuthority: portableSourceAuthority(servedBuild),
      identity: { engine, version: "fixture", authority: engine === "webkit" ? "Playwright WebKit proxy; not physical Safari" : `Playwright managed ${engine}` },
      routes,
      accessibility,
      responsive,
      fieldMap: { status: "PASS", checks: fixtureChecks(QA_FIELD_MAP_CHECKS), openTargets: fixtureTarget() },
      fallback: { reducedMotion: { status: "PASS" }, noJavaScript: { status: "PASS" }, fallbackFont: { status: "PASS" } },
      history: { status: "PASS" },
      cycles: { status: "PASS", samples: Array.from({ length: 10 }, (_, index) => ({ cycle: index + 1 })), checks: fixtureChecks(LIFECYCLE_CHECKS) },
      network: [{ policy: "blocked", status: "PASS", checks: fixtureChecks(NETWORK_CHECKS) }, { policy: "slow", status: "PASS", checks: fixtureChecks(NETWORK_CHECKS) }],
      failures: [],
      status: "PASS",
    }],
  };
}

export function runSelfTest() {
  invariant(REQUIRED_EVIDENCE.length === 25, "R1 package topology must contain 25 required evidence files");
  invariant(SIGNAL_COMPARISON_RECORDING_SPECS.length === 4 && new Set(SIGNAL_COMPARISON_RECORDING_SPECS.map(({ relativePath }) => relativePath)).size === 4, "Signal Field comparison recording topology differs");
  for (const engine of ["chromium", "firefox", "webkit"]) validateQaReport(fixtureQa(engine), engine);
  const unsafe = {
    baseUrl: ["http:", "", "127.0.0.1:4321", ""].join("/"),
    executablePath: ["C:", "Users", "person", "browser.exe"].join("\\"),
    nested: { message: `open ${["http:", "", "localhost:9000", ""].join("/")} now` },
  };
  const sanitized = sanitizeForPackage(unsafe);
  invariant(!("baseUrl" in sanitized) && !("executablePath" in sanitized) && sanitized.nested.message === "open CAPTURE_ORIGIN/ now", "report sanitization differs");
  const failed = fixtureQa("chromium");
  failed.results[0].routes[0].state.targetSize.summary.targetFailures = 1;
  let falsePassRejected = false;
  try { validateQaReport(failed, "chromium"); } catch { falsePassRejected = true; }
  invariant(falsePassRejected, "QA false target PASS was accepted");
  validateNoJavaScriptFallback(fixtureNoJavaScriptFallback());
  const noJavaScriptMutations = [
    (fixture) => { fixture.fieldMapLinkInventory.pop(); },
    (fixture) => { fixture.fieldMapLinkInventory[0].href = "/wrong/"; },
    (fixture) => { fixture.fieldMapLinkInventory[0].accessibleName = "Wrong"; },
    (fixture) => { fixture.fieldMapLinkInventory[0].visible = false; },
  ];
  const noJavaScriptInventoryRejected = noJavaScriptMutations.every((mutate) => {
    const fixture = structuredClone(fixtureNoJavaScriptFallback());
    mutate(fixture);
    try { validateNoJavaScriptFallback(fixture); return false; } catch { return true; }
  });
  invariant(noJavaScriptInventoryRejected, "no-JavaScript Field Map false inventory was accepted");
  validateFallbackFontEvidence(fixtureFallbackFonts());
  const fallbackFontMutations = [
    (fixture) => { fixture.anybodyLoaded = true; },
    (fixture) => { fixture.abortedFontRequests = 0; },
    (fixture) => { fixture.abortedFontRequests = 1.5; },
    (fixture) => { fixture.manifestoWords = 6; },
    (fixture) => { fixture.horizontalOverflow = true; },
    (fixture) => { fixture.manifestoVisibility.status = "FAIL"; },
  ];
  const fallbackFontAuthorityRejected = fallbackFontMutations.every((mutate) => {
    const fixture = structuredClone(fixtureFallbackFonts());
    mutate(fixture);
    try { validateFallbackFontEvidence(fixture); return false; } catch { return true; }
  });
  invariant(fallbackFontAuthorityRejected, "fallback-font false authority was accepted");
  return { schema: ASSEMBLER_SCHEMA, status: "PASS", requiredReports: REQUIRED_EVIDENCE.length, qaEngines: 3, falsePassRejected, noJavaScriptInventoryRejected, fallbackFontAuthorityRejected, privateAndOriginSanitization: "PASS" };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/assemble-phase7a-r1-evidence.mjs",
    "    --closure-dir <external closure capture directory>",
    "    --recordings-dir <external Chromium/Firefox recording capture directory>",
    "    --chromium-qa <external Chromium QA JSON>",
    "    --firefox-qa <external Firefox QA JSON>",
    "    --webkit-qa <external WebKit proxy QA JSON>",
    "    --installed-chrome-200-dir <external installed-Chrome 200% audit directory>",
    "    --installed-chrome-ui-dir <external visible Chrome UI confirmation directory>",
    "    --deployment-json <external deployment parity JSON>",
    "    --output-dir <fresh durable external evidence directory>",
    "    [--production-diff <external expected diff for exact comparison>]",
    "  node scripts/assemble-phase7a-r1-evidence.mjs --self-test",
  ].join("\n");
}

export async function assembleEvidence(options) {
  const requiredOptions = ["closureDir", "recordingsDir", "chromiumQa", "firefoxQa", "webkitQa", "installedChrome200Dir", "installedChromeUiDir", "deploymentJson", "outputDir"];
  for (const name of requiredOptions) invariant(options[name], `--${name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)} is required`);
  const [closureRoot, recordingsRoot, chromiumQaPath, firefoxQaPath, webkitQaPath, chromeRoot, chromeUiRoot, deploymentPath, output, productionDiffPath] = await Promise.all([
    externalDirectory(options.closureDir, "--closure-dir"),
    externalDirectory(options.recordingsDir, "--recordings-dir"),
    externalFile(options.chromiumQa, "--chromium-qa"),
    externalFile(options.firefoxQa, "--firefox-qa"),
    externalFile(options.webkitQa, "--webkit-qa"),
    externalDirectory(options.installedChrome200Dir, "--installed-chrome-200-dir"),
    externalDirectory(options.installedChromeUiDir, "--installed-chrome-ui-dir"),
    externalFile(options.deploymentJson, "--deployment-json"),
    freshOutput(options.outputDir),
    options.productionDiff ? externalFile(options.productionDiff, "--production-diff") : null,
  ]);
  const generatedAt = new Date().toISOString();
  const [provenance, closure, recordings, chromiumQa, firefoxQa, webkitQa, installedChrome, installedChromeUi, deploymentRecord, phase4, diffBytes] = await Promise.all([
    deriveGitProvenance(ROOT),
    loadClosure(closureRoot),
    loadRecordings(recordingsRoot),
    loadQa(chromiumQaPath, "chromium"),
    loadQa(firefoxQaPath, "firefox"),
    loadQa(webkitQaPath, "webkit"),
    loadInstalledChrome(chromeRoot),
    loadInstalledChromeUi(chromeUiRoot),
    readJsonFile(deploymentPath, "deployment verification JSON"),
    verifyPhase4(ROOT),
    generateProductionDiff(ROOT, productionDiffPath),
  ]);
  validateComparisonRevision(closure.comparisonAfterRevision, provenance);
  for (const qa of [chromiumQa, firefoxQa, webkitQa]) validateFinalCaptureBinding(qa.report.servedBuild, [qa.result.sourceAuthority], provenance.finalHead, closure.reports.servedBuildAuthority, `${qa.result.identity.engine} QA`);
  validateFinalCaptureBinding(recordings.manifest.servedBuild, [...recordings.manifest.recordings, ...recordings.manifest.screenshots].map(({ sourceAuthority }) => sourceAuthority), provenance.finalHead, closure.reports.servedBuildAuthority, "scenario capture");
  validateFinalCaptureBinding(installedChrome.report.servedBuild, [installedChrome.report.sourceAuthority, ...installedChrome.report.routes.map(({ sourceAuthority }) => sourceAuthority), ...installedChrome.report.visualEvidence.map(({ sourceAuthority }) => sourceAuthority), installedChrome.report.fieldMap.sourceAuthority], provenance.finalHead, closure.reports.servedBuildAuthority, "installed Chrome 200%");
  const servedBuildDocumentBinding = validateServedBuildDeploymentBinding(deploymentRecord.value, closure.reports.servedBuildAuthority);
  const deployment = { ...normalizeDeployment(deploymentRecord.value, provenance.finalHead), servedBuildDocumentBinding };
  const qas = [chromiumQa, firefoxQa, webkitQa];
  const staging = `${output}.staging-${randomUUID()}`;
  invariant(!(await exists(staging)), "assembler staging path unexpectedly exists");
  await mkdir(staging, { recursive: false });
  let published = false;
  try {
    const inputHashes = {
      closure: closure.inputSha256,
      recordingsManifest: recordings.manifestSha256,
      chromiumQa: chromiumQa.sha256,
      firefoxQa: firefoxQa.sha256,
      webkitQa: webkitQa.sha256,
      installedChrome200Report: installedChrome.sha256,
      installedChromeUiReport: installedChromeUi.sha256,
      deploymentVerification: deploymentRecord.sha256,
    };
    await assembleReports({ root: staging, provenance, closure: closure.reports, qas, recordings, installedChrome, installedChromeUi, deployment, phase4, diffBytes, inputHashes, generatedAt });

    const closureFiles = (await listFiles(closureRoot)).filter(({ relativePath }) => SAFE_IMAGE.test(relativePath));
    const closureImages = await copyCuratedImages(closureRoot, closureFiles, staging, closureImageDestination, "closure");
    invariant(closureImages.length >= 67, "closure visual evidence coverage is incomplete");

    const chromeImages = await copyCuratedImages(chromeRoot, installedChrome.images, staging, (relativePath, index) => `09-chrome-200/visuals/native-${String(index + 1).padStart(2, "0")}-${path.posix.basename(relativePath)}`, "installed Chrome 200%");
    const uiImages = await copyCuratedImages(chromeUiRoot, installedChromeUi.images, staging, (relativePath, index) => `09-chrome-200/visuals/ui-${String(index + 1).padStart(2, "0")}-${path.posix.basename(relativePath)}`, "installed Chrome UI");
    invariant(chromeImages.length >= 15 && uiImages.length >= 1, "installed Chrome visual evidence coverage differs");

    for (const { record, bytes } of recordings.recordings) {
      const destination = `19-recordings/${record.engine}-${record.scenario}.mp4`;
      await writeOwned(staging, destination, bytes);
    }
    for (const { record, bytes } of closure.comparisonRecordings) {
      const destination = `04-signal-field/recordings/${path.posix.basename(record.relativePath)}`;
      await writeOwned(staging, destination, bytes);
    }

    await collectEvidenceDirectory(staging);
    await rename(staging, output);
    published = true;
    return {
      schema: ASSEMBLER_SCHEMA,
      status: "PASS",
      output,
      sourceHead: provenance.finalHead,
      generatedAt,
      requiredReports: REQUIRED_EVIDENCE.length,
      closureImages: closureImages.length,
      installedChromeImages: chromeImages.length + uiImages.length,
      recordings: recordings.recordings.length,
      signalComparisonRecordings: closure.comparisonRecordings.length,
    };
  } finally {
    if (!published && await exists(staging)) await rm(staging, { recursive: true, force: true });
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) { process.stdout.write(`${usage()}\n`); return; }
    if (options.selfTest) { process.stdout.write(json(runSelfTest())); return; }
    const result = await assembleEvidence(options);
    process.stdout.write(json(result));
  } catch (error) {
    process.stderr.write(`Phase 7A-R1 evidence assembly failed: ${safeString(error?.stack ?? error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) await main();
