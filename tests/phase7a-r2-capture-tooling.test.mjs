import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  PHASE7A_R2_BRANCH,
  PHASE7A_R2_COMPUTER_USE_UI_PROOF_SCHEMA,
  PHASE7A_R2_INSTALLED_CHROME_SCHEMA,
  PHASE7A_R2_PARENT,
  parseArguments as parseInstalledChromeArguments,
  selfTest as installedChromeSelfTest,
  validateComputerUseUiProof,
} from "../scripts/capture-phase7a-r2-installed-chrome.mjs";
import {
  parseArguments as parseGenericCaptureArguments,
  selfTest as genericCaptureSelfTest,
} from "../scripts/capture-phase7a-r2-field-map.mjs";
import {
  exactDecodedPixels,
  parseArguments as parseVisualRegressionArguments,
  selfTest as visualRegressionSelfTest,
  validateLoadedAssetsAgainstReceipt,
} from "../scripts/capture-phase7a-r2-visual-regression.mjs";
import { PHASE7A_R2_VISUAL_REGRESSION_SCHEMA } from "../scripts/phase7a-r2-visual-regression-authority.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLED_CHROME_SCRIPT = path.join(ROOT, "scripts", "capture-phase7a-r2-installed-chrome.mjs");
const GENERIC_CAPTURE_SCRIPT = path.join(ROOT, "scripts", "capture-phase7a-r2-field-map.mjs");
const VISUAL_REGRESSION_SCRIPT = path.join(ROOT, "scripts", "capture-phase7a-r2-visual-regression.mjs");
const EXTERNAL_ROOT = path.resolve(ROOT, "..", "phase7a-r2-capture-tooling-test");
const REVISION = "b".repeat(40);

function installedChromeArguments() {
  return [
    "--base-url", "http://127.0.0.1:4322/",
    "--revision", REVISION,
    "--output", path.join(EXTERNAL_ROOT, "capture"),
    "--remote-debugging-port", "9333",
    "--baseline-width", "1400",
    "--baseline-dpr", "1.25",
    "--ui-zoom-label", "Zoom: 200%",
    "--ui-proof-json", path.join(EXTERNAL_ROOT, "computer-use-proof.json"),
    "--ui-proof-png", path.join(EXTERNAL_ROOT, "computer-use-proof.png"),
  ];
}

function replaceFlag(argv, flag, value) {
  const copy = [...argv];
  const index = copy.indexOf(flag);
  assert.notEqual(index, -1, `fixture flag missing: ${flag}`);
  copy[index + 1] = value;
  return copy;
}

function removeFlag(argv, flag) {
  const copy = [...argv];
  const index = copy.indexOf(flag);
  assert.notEqual(index, -1, `fixture flag missing: ${flag}`);
  copy.splice(index, 2);
  return copy;
}

function proofFixture() {
  const sha256 = "a".repeat(64);
  const screenshot = {
    browserTitle: "Quantum Hub — Google Chrome",
    bytes: 4096,
    entropy: 4.5,
    format: "png",
    height: 900,
    label: "chrome-visible-200-percent",
    maximumChannelRange: 255,
    relativePath: "screenshots/chrome-visible-200-percent.png",
    sha256,
    width: 1440,
  };
  const document = {
    accessibility: { matchCount: 1, text: "Zoom: 200%" },
    browserWindow: {
      product: "Google Chrome",
      selectedWindowCount: 1,
      title: screenshot.browserTitle,
      visible: true,
    },
    capturedAt: new Date().toISOString(),
    producer: "Codex Computer Use",
    schema: PHASE7A_R2_COMPUTER_USE_UI_PROOF_SCHEMA,
    screenshot: {
      bytes: screenshot.bytes,
      format: screenshot.format,
      height: screenshot.height,
      sha256: screenshot.sha256,
      width: screenshot.width,
    },
    status: "PASS",
  };
  return { document, screenshot };
}

test("installed-Chrome parser requires exact R2, native-zoom, and external Computer Use inputs", () => {
  const argv = installedChromeArguments();
  const parsed = parseInstalledChromeArguments(argv);
  assert.equal(parsed.baseUrl, "http://127.0.0.1:4322/");
  assert.equal(parsed.revision, REVISION);
  assert.equal(parsed.output, path.join(EXTERNAL_ROOT, "capture"));
  assert.equal(parsed.remoteDebuggingPort, 9333);
  assert.equal(parsed.baselineWidth, 1400);
  assert.equal(parsed.baselineDpr, 1.25);
  assert.equal(parsed.uiZoomLabel, "Zoom: 200%");
  assert.equal(parsed.uiProofJson, path.join(EXTERNAL_ROOT, "computer-use-proof.json"));
  assert.equal(parsed.uiProofPng, path.join(EXTERNAL_ROOT, "computer-use-proof.png"));

  assert.throws(() => parseInstalledChromeArguments(removeFlag(argv, "--ui-proof-json")), /--ui-proof-json is required/);
  assert.throws(() => parseInstalledChromeArguments(removeFlag(argv, "--ui-proof-png")), /--ui-proof-png is required/);
  assert.throws(() => parseInstalledChromeArguments(replaceFlag(argv, "--ui-proof-png", path.join(EXTERNAL_ROOT, "proof.jpg"))), /external PNG/);
  assert.throws(() => parseInstalledChromeArguments(replaceFlag(argv, "--ui-proof-json", path.join(ROOT, "proof.json"))), /outside the repository/);
  assert.throws(() => parseInstalledChromeArguments(replaceFlag(argv, "--ui-proof-png", path.join(os.tmpdir(), "proof.png"))), /temporary/);
  assert.throws(() => parseInstalledChromeArguments(replaceFlag(argv, "--output", path.join(ROOT, "capture"))), /outside the repository/);
  assert.throws(() => parseInstalledChromeArguments(replaceFlag(argv, "--revision", PHASE7A_R2_PARENT)), /new R2 commit/);
  assert.throws(() => parseInstalledChromeArguments(replaceFlag(argv, "--revision", REVISION.toUpperCase())), /exact lowercase/);
  assert.throws(() => parseInstalledChromeArguments(replaceFlag(argv, "--ui-zoom-label", "Zoom: 175%")), /Zoom: 200%/);
});

test("Computer Use proof validator binds one visible Chrome window, exact zoom text, title, time, and PNG", () => {
  const { document, screenshot } = proofFixture();
  const result = validateComputerUseUiProof(document, screenshot, "Quantum Hub", "Zoom: 200%");
  assert.equal(result.status, "PASS");
  assert.equal(result.browserWindow.selectedWindowCount, 1);
  assert.equal(result.accessibility.text, "Zoom: 200%");
  assert.equal(result.screenshot.sha256, document.screenshot.sha256);
  assert.equal(result.screenshot.relativePath, "screenshots/chrome-visible-200-percent.png");

  assert.throws(() => validateComputerUseUiProof({ ...document, browserWindow: { ...document.browserWindow, selectedWindowCount: 2 } }, screenshot, "Quantum Hub"), /uniquely selected/);
  assert.throws(() => validateComputerUseUiProof({ ...document, browserWindow: { ...document.browserWindow, visible: false } }, screenshot, "Quantum Hub"), /uniquely selected/);
  assert.throws(() => validateComputerUseUiProof({ ...document, browserWindow: { ...document.browserWindow, product: "Chromium" } }, screenshot, "Quantum Hub"), /Google Chrome/);
  assert.throws(() => validateComputerUseUiProof({ ...document, browserWindow: { ...document.browserWindow, title: "Unrelated" } }, { ...screenshot, browserTitle: "Unrelated" }, "Quantum Hub"), /CDP target title/);
  assert.throws(() => validateComputerUseUiProof({ ...document, accessibility: { matchCount: 1, text: "Zoom: 175%" } }, screenshot, "Quantum Hub"), /Zoom: 200%/);
  assert.throws(() => validateComputerUseUiProof({ ...document, accessibility: { matchCount: 2, text: "Zoom: 200%" } }, screenshot, "Quantum Hub"), /exactly one/);
  assert.throws(() => validateComputerUseUiProof({ ...document, capturedAt: "2026-09-01T00:00:00Z" }, screenshot, "Quantum Hub"), /canonical ISO-8601/);
  assert.throws(() => validateComputerUseUiProof({ ...document, screenshot: { ...document.screenshot, bytes: document.screenshot.bytes + 1 } }, screenshot, "Quantum Hub"), /does not bind/);
  assert.throws(() => validateComputerUseUiProof({ ...document, sourcePath: "C:\\Users\\private\\proof.png" }, screenshot, "Quantum Hub"), /field inventory/);
  assert.throws(() => validateComputerUseUiProof({ ...document, screenshot: { ...document.screenshot, sourcePath: "C:\\Users\\private\\proof.png" } }, screenshot, "Quantum Hub"), /field inventory/);
});

test("installed-Chrome self-test and help expose the Computer Use capture contract", async () => {
  const imported = installedChromeSelfTest();
  assert.equal(imported.status, "PASS");
  assert.equal(imported.schema, PHASE7A_R2_INSTALLED_CHROME_SCHEMA);
  assert.equal(imported.branch, PHASE7A_R2_BRANCH);
  assert.equal(imported.parent, PHASE7A_R2_PARENT);
  assert.deepEqual(imported.computerUseProof, {
    screenshot: "screenshots/chrome-visible-200-percent.png",
    status: "PASS",
  });

  const selfTestRun = await execFileAsync(process.execPath, [INSTALLED_CHROME_SCRIPT, "--self-test"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(selfTestRun.stderr, "");
  assert.deepEqual(JSON.parse(selfTestRun.stdout), imported);

  const helpRun = await execFileAsync(process.execPath, [INSTALLED_CHROME_SCRIPT, "--help"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(helpRun.stderr, "");
  assert.match(helpRun.stdout, /--ui-proof-json <external Computer Use proof JSON>/);
  assert.match(helpRun.stdout, /--ui-proof-png <external Computer Use Chrome-window PNG>/);
  assert.match(helpRun.stdout, new RegExp(PHASE7A_R2_COMPUTER_USE_UI_PROOF_SCHEMA.replaceAll(".", "\\.")));
  assert.match(helpRun.stdout, /never launches, emulates, or controls the Windows UI directly/);
});

test("installed-Chrome source cannot launch browsers/pages, resize or emulate viewports, or invoke Windows helpers", async () => {
  const source = await readFile(INSTALLED_CHROME_SCRIPT, "utf8");
  const forbidden = [
    [/(?:chromium|firefox|webkit)\.(?:launch|launchPersistentContext|launchServer)\s*\(/i, "browser launch"],
    [/\.new(?:Page|Context)\s*\(/i, "page or browser-context creation"],
    [/\.setViewportSize\s*\(/i, "viewport resizing"],
    [/Emulation\.[A-Za-z]+/i, "CDP emulation"],
    [/setDeviceMetricsOverride|\bviewport\s*:|deviceScaleFactor\s*:|isMobile\s*:|hasTouch\s*:/i, "device or viewport emulation"],
    [/capture-installed-chrome-window\.ps1/i, "legacy PowerShell helper"],
    [/powershell(?:\.exe)?|UIAutomation|UI Automation/i, "PowerShell or UI Automation"],
  ];
  for (const [pattern, label] of forbidden) assert.doesNotMatch(source, pattern, `installed-Chrome capture contains forbidden ${label}`);
  assert.equal(source.match(/execFileAsync\s*\(/g)?.length, 1, "installed-Chrome capture must execute only its bounded Git command helper");
  assert.match(source, /execFileAsync\("git", args/);

  assert.match(source, /chromium\.connectOverCDP\("http:\/\/127\.0\.0\.1:" \+ options\.remoteDebuggingPort/);
  assert.match(source, /pages\.length === 1/);
  assert.match(source, /page\.screenshot\(/);
  assert.match(source, /--ui-proof-json/);
  assert.match(source, /--ui-proof-png/);
  assert.match(source, /validateComputerUseUiProof/);
  assert.match(source, /selectedWindowCount === 1/);
  assert.match(source, /accessibility\.matchCount === 1/);
  assert.match(source, /document\.screenshot\.sha256 === pngRecord\.sha256/);
  assert.match(source, /copyFile\(pngPath, destination\)/);
  assert.match(source, /screenshots\/chrome-visible-200-percent\.png/);
  assert.match(source, /privacyCheckedReportJson/);
  assert.match(source, /const postCloseOutside = await postCloseOutsideFocus\(page\)/);
  assert.doesNotMatch(source, /const postCloseOutsideFocus = await postCloseOutsideFocus\(page\)/);
  assert.match(source, /activeDestinationName === "Home"/);
  assert.match(source, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "instant" \}\)/);
  assert.match(source, /Escape focus restoration did not survive route-top screenshot normalization/);
  assert.match(source, /baseline closed and Escape-returned closed page screenshots as pixel-identical/);
  assert.doesNotMatch(source, /focus-paint round-trip/);
});

test("generic R2 capture retains its inert self-test and named export surface", async () => {
  assert.equal(typeof parseGenericCaptureArguments, "function");
  assert.equal(typeof genericCaptureSelfTest, "function");
  const parsed = parseGenericCaptureArguments(["--self-test"]);
  assert.equal(parsed.selfTest, true);
  const result = genericCaptureSelfTest();
  assert.equal(result.status, "PASS");
  assert.equal(result.viewports, 4);
  assert.equal(result.controls, 9);
  assert.equal(result.contrast.status, "PASS");
  assert.equal(result.contrast.pairs.length, 3);
  assert.equal(result.contrast.pairs[2].id, "manifesto-white-over-live-magenta");
  assert.equal(result.contrast.pairs[2].ratio, 4.658);
  const source = await readFile(GENERIC_CAPTURE_SCRIPT, "utf8");
  assert.match(source, /observedDevicePixelRatio:\s*devicePixelRatio/);
  assert.match(source, /Math\.abs\(observedViewport\.observedDevicePixelRatio - 1\) <= CONTRAST_DPR_EPSILON/);
  assert.match(source, /deviceScaleFactor:\s*Number\(observedViewport\.observedDevicePixelRatio\.toFixed\(6\)\)/);
  assert.match(source, /DOM\.querySelector/);
  assert.match(source, /Accessibility\.getPartialAXTree/);
  assert.match(source, /PHASE7A_R2_SUMMARY_AX_NAME/);
  assert.match(source, /initial:\s*\{\s*activeElement:\s*chromium\.focus\.initial\.activeElement,\s*activeDestinationName:\s*chromium\.focus\.initial\.activeDestinationName,/s);
  assert.match(source, /control\.querySelector\("\.field-map__trigger-label"\)\?\.textContent/);
  assert.match(source, /failed authority:\s*\$\{JSON\.stringify\(aggregateAuthority\)\}/);
});

test("generic R2 target and contrast authority settling cannot pause on page animation frames", async () => {
  const source = await readFile(GENERIC_CAPTURE_SCRIPT, "utf8");
  const inventory = source.slice(
    source.indexOf("async function fullControlInventory"),
    source.indexOf("function axProperty"),
  );
  const contrast = source.slice(
    source.indexOf("async function selectorLocalContrastMeasurement"),
    source.indexOf("async function productionContrastSelectorBinding"),
  );
  assert.match(inventory, /control\.scrollIntoView\(\{ block: "center", inline: "nearest", behavior: "auto" \}\)/);
  assert.doesNotMatch(inventory, /page\.evaluate\(async/);
  assert.doesNotMatch(inventory, /requestAnimationFrame/);
  assert.equal(contrast.match(/await hostSettle\(\);/g)?.length, 2);
  assert.doesNotMatch(contrast, /requestAnimationFrame/);
  assert.doesNotMatch(source, /new Promise\(\(resolve\) => requestAnimationFrame/);
  assert.match(source, /function hostSettle\(\) \{\s*return new Promise\(\(resolve\) => setTimeout\(resolve, HOST_SETTLE_MS\)\);\s*\}/s);
});

test("generic R2 matrix capture has case, phase, progress, and cleanup deadlines", async () => {
  const source = await readFile(GENERIC_CAPTURE_SCRIPT, "utf8");
  const matrixCaseSource = source.slice(
    source.indexOf("async function matrixCase"),
    source.indexOf("async function captureMatrixPhase"),
  );
  const matrixPhaseSource = source.slice(
    source.indexOf("async function captureMatrixPhase"),
    source.indexOf("async function openMapAndTargets"),
  );
  const cleanupSource = source.slice(
    source.indexOf("async function closeContextBounded"),
    source.indexOf("function within"),
  );
  const progressSource = source.slice(
    source.indexOf("function writeMatrixProgress"),
    source.indexOf("async function closeContextBounded"),
  );
  assert.match(source, /async function withDeadline\(label, timeoutMs, task\)/);
  assert.match(source, /function matrixPhaseDeadlineMs\(timeoutMs\)/);
  assert.match(matrixCaseSource, /withDeadline\(label, timeoutMs, async \(\) =>/);
  assert.match(matrixCaseSource, /try \{[\s\S]*\} finally \{/);
  assert.match(matrixCaseSource, /await closeContextBounded\(context, label\)/);
  assert.doesNotMatch(matrixCaseSource, /await context\.close\(/);
  assert.match(matrixCaseSource, /writeMatrixProgress\("START"/);
  assert.match(progressSource, /engine=\$\{engine\} viewport=\$\{viewport\.id\} reducedMotion=\$\{reducedMotion\} elapsedMs=\$\{elapsedMs\}/);
  assert.match(cleanupSource, /withDeadline\(`\$\{label\} context cleanup`, CONTEXT_CLOSE_TIMEOUT_MS/);
  assert.match(matrixPhaseSource, /withDeadline\("R2 Field Map matrix phase", deadlineMs/);
  assert.match(matrixPhaseSource, /\[phase7a-r2:matrix-phase\] START cases=\$\{expectedCases\}/);
  assert.match(matrixPhaseSource, /\[phase7a-r2:matrix-phase\] \$\{status\} cases=\$\{matrices\.length\}/);
  assert.match(source, /const matrices = await captureMatrixPhase\(browsers, options\.baseUrl, options\.timeoutMs\)/);
  assert.match(source, /BROWSER_CLOSE_TIMEOUT_MS/);
});

test("same-session visual-regression capture is exact-pixel, About-route, and signed-ledger bound", async () => {
  const authority = visualRegressionSelfTest();
  assert.equal(authority.schema, PHASE7A_R2_VISUAL_REGRESSION_SCHEMA);
  assert.equal(authority.status, "PASS");
  assert.equal(authority.exactDecodedPixels, true);
  const baselineUrl = "https://139320ab.qsite1.pages.dev/";
  const currentUrl = "https://12345678.qsite1.pages.dev/";
  const parsed = parseVisualRegressionArguments([
    "--baseline-url", baselineUrl, "--current-url", currentUrl,
    "--baseline-deployment", path.join(EXTERNAL_ROOT, "r1.json"),
    "--current-deployment", path.join(EXTERNAL_ROOT, "r2.json"),
    "--current-revision", REVISION, "--output", path.join(EXTERNAL_ROOT, "visual"),
  ]);
  assert.equal(parsed.baselineUrl, baselineUrl);
  assert.equal(parsed.currentUrl, currentUrl);
  assert.equal(parsed.currentRevision, REVISION);
  assert.throws(() => parseVisualRegressionArguments([
    "--baseline-url", baselineUrl, "--current-url", baselineUrl,
    "--baseline-deployment", path.join(EXTERNAL_ROOT, "r1.json"),
    "--current-deployment", path.join(EXTERNAL_ROOT, "r2.json"),
    "--current-revision", REVISION, "--output", path.join(EXTERNAL_ROOT, "visual"),
  ]), /must differ/);

  const source = await sharp({ create: { width: 4, height: 3, channels: 3, background: { r: 9, g: 12, b: 13 } } }).png().toBuffer();
  const decoded = await sharp(source).raw().toBuffer({ resolveWithObject: true });
  const reencoded = await sharp(decoded.data, { raw: decoded.info }).png({ compressionLevel: 0 }).toBuffer();
  assert.equal((await exactDecodedPixels(source, reencoded)).differentPixels, 0);
  const changed = await sharp(source).composite([{ input: { create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 255 } } }, left: 0, top: 0 }]).png().toBuffer();
  await assert.rejects(() => exactDecodedPixels(source, changed), /pixels differ/);

  const asset = { kind: "stylesheet", url: `${baselineUrl}_astro/navigation.css`, status: 200, contentType: "text/css", bytes: 123, sha256: "f".repeat(64) };
  const r1Row = { publicPath: "/_astro/navigation.css", bytes: 123, sha256: asset.sha256, status: "PASS", immutable: { status: "PASS", actualHttpStatus: 200, bytes: 123, sha256: asset.sha256 } };
  assert.equal(validateLoadedAssetsAgainstReceipt([asset], { payloadLedger: [r1Row] }, "baseline"), true);
  assert.throws(() => validateLoadedAssetsAgainstReceipt([asset], { payloadLedger: [{ ...r1Row, sha256: "e".repeat(64) }] }, "baseline"), /signed deployment receipt/);
});

test("same-session visual-regression network and provenance authority is bounded and fail closed", async () => {
  const source = await readFile(VISUAL_REGRESSION_SCRIPT, "utf8");
  assert.match(source, /pendingByRevision:\s*new Map\(\[\[PHASE7A_R2_PARENT, new Set\(\)\]/);
  assert.match(source, /async function drainRevisionNetwork\(/);
  assert.match(source, /page\.waitForLoadState\("networkidle"/);
  assert.match(source, /withDeadline\(response\.body\(\)/);
  assert.match(source, /withDeadline\(\(async \(\) => \{/);
  assert.match(source, /R1 deployment receipt bytes differ from the accepted authority/);
  assert.match(source, /validateLoadedAssetsAgainstReceipt\(loaded\(PHASE7A_R2_PARENT\), baselineReceipt/);
  assert.match(source, /browser\.contexts\(\)\.length === 1 && context\.pages\(\)\.length === 1/);
  assert.match(source, /"--disable-gpu-rasterization"/);
  assert.match(source, /"--run-all-compositor-stages-before-draw"/);
  assert.match(source, /animations:\s*"disabled"/);
  assert.match(source, /caret:\s*"hide"/);
  assert.match(source, /args:\s*DETERMINISTIC_CHROME_ARGS/);
  assert.doesNotMatch(source, /phase\.pending\s*=\s*\[\]|Promise\.all\(phase\.pending\)/);
  assert.doesNotMatch(source, /requestAnimationFrame|\bSSIM\b|neutralMask(?:s)?\s*:\s*\[[^\]]+\]|pixelTolerance|threshold\s*:/i);
});
