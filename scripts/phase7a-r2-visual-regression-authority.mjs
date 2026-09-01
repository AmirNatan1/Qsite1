import path from "node:path";

import { PHASE7A_R2_PARENT } from "./phase7a-r2-field-map-authority.mjs";

export const PHASE7A_R2_VISUAL_REGRESSION_SCHEMA = "quantum-hub.phase-7a-r2.same-session-visual-regression.v1";
export const PHASE7A_R2_VISUAL_REGRESSION_MANIFEST_SCHEMA = `${PHASE7A_R2_VISUAL_REGRESSION_SCHEMA}.manifest`;
export const PHASE7A_R2_VISUAL_REGRESSION_METHOD = "SAME_INSTALLED_HEADED_CHROME_SESSION_EXACT_DECODED_PIXELS";
export const PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH = "07-regression/visual-stability.json";
export const PHASE7A_R2_VISUAL_BASELINE_DEPLOYMENT_ID = "139320ab-e562-4590-85ad-fa9920e6aad7";
export const PHASE7A_R2_VISUAL_BASELINE_DEPLOYMENT_URL = "https://139320ab.qsite1.pages.dev/";
export const PHASE7A_R2_VISUAL_BASELINE_RECEIPT_SHA256 = "45f8352507129ac0c9bac567b91f27df3af22ee16fab09c42384db59c7a8126d";
export const PHASE7A_R2_VISUAL_REGRESSION_PATHS = Object.freeze({
  parentClosed: "07-regression/visual-parent-closed-summary-focus.png",
  currentClosed: "07-regression/visual-current-closed-summary-focus.png",
  parentOpen: "07-regression/visual-parent-open-summary-focus.png",
  currentOpen: "07-regression/visual-current-open-summary-focus.png",
  currentLinkFocused: "07-regression/visual-current-open-link-focus.png",
});
export const PHASE7A_R2_VISUAL_REGRESSION_CAPTURE_PATHS = Object.freeze([
  PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH,
  ...Object.values(PHASE7A_R2_VISUAL_REGRESSION_PATHS),
]);

const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const PAIR_STATES = Object.freeze([
  Object.freeze({ state: "closed-summary-focused", baselinePath: PHASE7A_R2_VISUAL_REGRESSION_PATHS.parentClosed, currentPath: PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentClosed, open: false }),
  Object.freeze({ state: "open-summary-focused", baselinePath: PHASE7A_R2_VISUAL_REGRESSION_PATHS.parentOpen, currentPath: PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentOpen, open: true }),
]);

function invariant(value, message) { if (!value) throw new Error(message); }
function exactKeys(value, expected, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  invariant(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()), `${label} field inventory differs`);
}
function portable(relativePath, label) {
  invariant(typeof relativePath === "string" && relativePath.length > 0 && !relativePath.includes("\\") && !path.posix.isAbsolute(relativePath)
    && path.posix.normalize(relativePath) === relativePath && !relativePath.split("/").some((part) => !part || part === "." || part === ".."), `${label} is not a portable relative path`);
}
function exactUrl(value, deploymentId, label) {
  invariant(UUID.test(deploymentId ?? "") && value === `https://${deploymentId.slice(0, 8)}.qsite1.pages.dev/`, `${label} immutable deployment identity differs`);
}
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

function validateMetrics(metrics, label) {
  exactKeys(metrics, ["innerWidth", "innerHeight", "clientWidth", "clientHeight", "outerWidth", "outerHeight", "visualViewportWidth", "visualViewportHeight", "visualViewportScale", "scrollbarWidth", "devicePixelRatio", "scrollX", "scrollY", "fontsReady"], label);
  for (const key of ["innerWidth", "innerHeight", "clientWidth", "clientHeight", "outerWidth", "outerHeight", "visualViewportWidth", "visualViewportHeight", "visualViewportScale", "scrollbarWidth", "devicePixelRatio", "scrollX", "scrollY"]) invariant(finite(metrics[key]), `${label} ${key} differs`);
  invariant(metrics.innerWidth === 1440 && metrics.innerHeight === 900 && metrics.clientWidth > 0 && metrics.clientWidth <= metrics.innerWidth
    && metrics.clientHeight > 0 && metrics.clientHeight <= metrics.innerHeight && metrics.scrollbarWidth === metrics.innerWidth - metrics.clientWidth
    && metrics.scrollbarWidth >= 0 && metrics.scrollbarWidth <= 24 && metrics.devicePixelRatio === 1 && metrics.outerWidth >= metrics.innerWidth && metrics.outerHeight >= metrics.innerHeight
    && [metrics.clientWidth, metrics.innerWidth].includes(metrics.visualViewportWidth) && [metrics.clientHeight, metrics.innerHeight].includes(metrics.visualViewportHeight) && metrics.visualViewportScale === 1
    && metrics.scrollX === 0 && metrics.scrollY === 0 && metrics.fontsReady === true, `${label} viewport/scrollbar authority differs`);
}

function validateImage(record, { expectedPath, expectedOpen, expectedFocus, label }) {
  exactKeys(record, ["path", "bytes", "sha256", "width", "height", "channels", "focus", "fieldMapOpen", "metrics"], label);
  portable(record.path, `${label} path`);
  invariant(record.path === expectedPath && Number.isSafeInteger(record.bytes) && record.bytes > 0 && HASH_64.test(record.sha256 ?? "")
    && record.width === 1440 && record.height === 900 && Number.isSafeInteger(record.channels) && record.channels >= 3 && record.channels <= 4
    && record.focus === expectedFocus && record.fieldMapOpen === expectedOpen, `${label} raster/state authority differs`);
  validateMetrics(record.metrics, `${label} metrics`);
}

function validateBinding(binding, expectedRevision, label) {
  exactKeys(binding, ["revision", "deploymentId", "immutableUrl", "receiptSha256", "document", "loadedAssets"], label);
  invariant(binding.revision === expectedRevision && HASH_40.test(binding.revision ?? ""), `${label} revision differs`);
  exactUrl(binding.immutableUrl, binding.deploymentId, label);
  invariant(HASH_64.test(binding.receiptSha256 ?? ""), `${label} receipt hash differs`);
  exactKeys(binding.document, ["status", "bytes", "sha256", "finalUrl"], `${label} document`);
  invariant(binding.document.status === 200 && Number.isSafeInteger(binding.document.bytes) && binding.document.bytes > 0 && HASH_64.test(binding.document.sha256 ?? "")
    && binding.document.finalUrl === `${binding.immutableUrl}about/`, `${label} document binding differs`);
  invariant(Array.isArray(binding.loadedAssets) && binding.loadedAssets.length > 0, `${label} loaded asset ledger is empty`);
  const urls = new Set();
  for (const [index, asset] of binding.loadedAssets.entries()) {
    exactKeys(asset, ["kind", "url", "status", "contentType", "bytes", "sha256"], `${label} loaded asset ${index + 1}`);
    invariant(["stylesheet", "script", "font", "image"].includes(asset.kind) && typeof asset.url === "string" && asset.url.startsWith(binding.immutableUrl)
      && !urls.has(asset.url) && asset.status >= 200 && asset.status < 300 && typeof asset.contentType === "string" && asset.contentType.length > 0
      && Number.isSafeInteger(asset.bytes) && asset.bytes > 0 && HASH_64.test(asset.sha256 ?? ""), `${label} loaded asset ${index + 1} differs`);
    urls.add(asset.url);
  }
}

function validateRect(rect, label) {
  exactKeys(rect, ["selector", "x", "y", "width", "height"], label);
  invariant(typeof rect.selector === "string" && rect.selector.length > 0 && ["x", "y", "width", "height"].every((key) => finite(rect[key]))
    && rect.width > 0 && rect.height > 0, `${label} differs`);
}

export function validatePhase7aR2VisualRegressionAuthority(report, { currentRevision } = {}) {
  exactKeys(report, ["schema", "status", "method", "baselineRevision", "currentRevision", "captureTool", "browser", "viewport", "bindings", "captureOrder", "comparisons", "currentLinkFocused", "runtime", "neutralMasks", "checks"], "R2 same-session visual regression");
  invariant(report.schema === PHASE7A_R2_VISUAL_REGRESSION_SCHEMA && report.status === "PASS" && report.method === PHASE7A_R2_VISUAL_REGRESSION_METHOD, "R2 same-session visual-regression schema/status/method differs");
  invariant(report.baselineRevision === PHASE7A_R2_PARENT && HASH_40.test(report.currentRevision ?? "") && (!currentRevision || report.currentRevision === currentRevision), "R2 same-session visual-regression revisions differ");
  exactKeys(report.captureTool, ["path", "sha256"], "R2 same-session capture tool");
  invariant(report.captureTool.path === "scripts/capture-phase7a-r2-visual-regression.mjs" && HASH_64.test(report.captureTool.sha256 ?? ""), "R2 same-session capture-tool binding differs");

  exactKeys(report.browser, ["name", "product", "version", "userAgent", "installed", "headed", "browserCount", "contextCount", "pageCount"], "R2 same-session browser");
  invariant(report.browser.name === "Google Chrome" && /^Chrome\/\d/.test(report.browser.product ?? "") && /^\d+(?:\.\d+){3}$/.test(report.browser.version ?? "")
    && /\bChrome\/\d/.test(report.browser.userAgent ?? "") && !/\b(?:HeadlessChrome|Edg|OPR)\//.test(report.browser.userAgent ?? "")
    && report.browser.installed === true && report.browser.headed === true && report.browser.browserCount === 1 && report.browser.contextCount === 1 && report.browser.pageCount === 1, "R2 same-session installed/headed Chrome identity differs");
  exactKeys(report.viewport, ["width", "height", "deviceScaleFactor", "colorScheme", "reducedMotion"], "R2 same-session viewport");
  invariant(report.viewport.width === 1440 && report.viewport.height === 900 && report.viewport.deviceScaleFactor === 1 && report.viewport.colorScheme === "dark" && report.viewport.reducedMotion === "no-preference", "R2 same-session viewport authority differs");
  exactKeys(report.bindings, ["baseline", "current"], "R2 same-session deployment bindings");
  validateBinding(report.bindings.baseline, PHASE7A_R2_PARENT, "R2 baseline deployment");
  invariant(report.bindings.baseline.deploymentId === PHASE7A_R2_VISUAL_BASELINE_DEPLOYMENT_ID
    && report.bindings.baseline.immutableUrl === PHASE7A_R2_VISUAL_BASELINE_DEPLOYMENT_URL
    && report.bindings.baseline.receiptSha256 === PHASE7A_R2_VISUAL_BASELINE_RECEIPT_SHA256, "R2 baseline immutable deployment is not the accepted R1 authority");
  validateBinding(report.bindings.current, report.currentRevision, "R2 current deployment");
  invariant(JSON.stringify(report.captureOrder) === JSON.stringify(["baseline:closed-summary-focused", "baseline:open-summary-focused", "current:closed-summary-focused", "current:open-summary-focused", "current:open-link-focused"]), "R2 same-session capture order differs");

  invariant(Array.isArray(report.comparisons) && report.comparisons.length === PAIR_STATES.length, "R2 same-session comparison inventory differs");
  for (const [index, expected] of PAIR_STATES.entries()) {
    const comparison = report.comparisons[index];
    exactKeys(comparison, ["state", "baseline", "current", "result"], `R2 visual comparison ${index + 1}`);
    invariant(comparison.state === expected.state, `R2 visual comparison ${index + 1} state differs`);
    validateImage(comparison.baseline, { expectedPath: expected.baselinePath, expectedOpen: expected.open, expectedFocus: "field-map-summary", label: `R2 ${expected.state} baseline` });
    validateImage(comparison.current, { expectedPath: expected.currentPath, expectedOpen: expected.open, expectedFocus: "field-map-summary", label: `R2 ${expected.state} current` });
    invariant(JSON.stringify(comparison.baseline.metrics) === JSON.stringify(comparison.current.metrics), `R2 ${expected.state} capture conditions differ`);
    exactKeys(comparison.result, ["classification", "encodedBytesEqual", "differentPixels", "maxChannelDelta", "status"], `R2 ${expected.state} comparison result`);
    invariant(comparison.result.classification === "EXACT_DECODED_PIXELS" && typeof comparison.result.encodedBytesEqual === "boolean"
      && comparison.result.differentPixels === 0 && comparison.result.maxChannelDelta === 0 && comparison.result.status === "PASS", `R2 ${expected.state} is not exact decoded-pixel authority`);
  }

  exactKeys(report.currentLinkFocused, ["image", "accessibleName", "focusedElementGeometry", "excludedFromCreativeComparison"], "R2 current link-focused evidence");
  validateImage(report.currentLinkFocused.image, { expectedPath: PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentLinkFocused, expectedOpen: true, expectedFocus: "field-map-link", label: "R2 current link-focused image" });
  invariant(report.currentLinkFocused.accessibleName === "06 About 06 / position" && report.currentLinkFocused.excludedFromCreativeComparison === true, "R2 current link-focused name/comparison classification differs");
  validateRect(report.currentLinkFocused.focusedElementGeometry, "R2 current link-focused geometry");
  const focusedRect = report.currentLinkFocused.focusedElementGeometry;
  invariant(focusedRect.selector === "[data-field-map] a[aria-current=\"page\"]" && focusedRect.x >= 0 && focusedRect.y >= 0
    && focusedRect.x + focusedRect.width <= 1440 && focusedRect.y + focusedRect.height <= 900, "R2 current link-focused geometry escapes its exact selector/viewport");

  exactKeys(report.runtime, ["consoleErrors", "pageErrors", "failedRequests", "redirects"], "R2 same-session runtime authority");
  invariant(["consoleErrors", "pageErrors", "failedRequests", "redirects"].every((key) => Array.isArray(report.runtime[key]) && report.runtime[key].length === 0), "R2 same-session runtime contains errors, failures, or redirects");
  invariant(Array.isArray(report.neutralMasks) && report.neutralMasks.length === 0, "R2 same-session visual authority must not use neutral masks");

  exactKeys(report.checks, ["sameInstalledHeadedBrowserSession", "sameContextAndPage", "sameViewportDprAndScrollbar", "summaryFocusedPairs", "stableDuplicateFrames", "exactDecodedPixels", "linkFocusedEvidenceSeparate", "deploymentDocumentsRecorded"], "R2 same-session checks");
  invariant(Object.values(report.checks).every((value) => value === true), "R2 same-session visual-regression checks differ");
  return true;
}

export function phase7aR2VisualRegressionSelfTest() {
  invariant(PHASE7A_R2_VISUAL_REGRESSION_CAPTURE_PATHS.length === 6 && new Set(PHASE7A_R2_VISUAL_REGRESSION_CAPTURE_PATHS).size === 6, "R2 visual-regression capture topology drifted");
  return { schema: PHASE7A_R2_VISUAL_REGRESSION_SCHEMA, status: "PASS", method: PHASE7A_R2_VISUAL_REGRESSION_METHOD, captureFiles: 6 };
}
