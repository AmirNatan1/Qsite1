import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ENGINE_LIMITATION_SCHEMA,
  FIREFOX_LIMITATION_NAME,
  INSTALLED_CHROME_SCHEMA,
  INSTALLED_RECORDING_NAME,
  INSTALLED_REPORT_NAME,
  INSTALLED_SCREENSHOT_NAME,
  firefoxLimitation,
  parseArguments,
  selfTest,
  validateInstalledReport,
  validateNativeZoomGeometry,
  validateUiProof,
} from "../scripts/capture-phase7b-installed-chrome-200.mjs";
import { PHASE7B_BRANCH, PHASE7B_GATES, PHASE7B_METHOD_STAGES, PHASE7B_PARENT } from "../scripts/phase7b-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISION = "a".repeat(40);
const EXTERNAL = path.resolve(ROOT, "..", "phase7b-native-200-test");

function png(width = 1440, height = 900) {
  const bytes = Buffer.alloc(64, 7);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function uiDocument(bytes) {
  const hash = Buffer.from(bytes);
  return import("node:crypto").then(({ createHash }) => ({
    schema: "quantum-hub.phase-7a-r2.computer-use-chrome-ui-proof.v1",
    status: "PASS",
    producer: "Codex Computer Use",
    capturedAt: new Date().toISOString(),
    browserWindow: { product: "Google Chrome", selectedWindowCount: 1, title: "Quantum Hub — Google Chrome", visible: true },
    accessibility: { matchCount: 1, text: "Zoom: 200%" },
    screenshot: {
      format: "png",
      bytes: hash.length,
      sha256: createHash("sha256").update(hash).digest("hex"),
      width: hash.readUInt32BE(16),
      height: hash.readUInt32BE(20),
    },
  }));
}

function passReport() {
  return {
    schema: INSTALLED_CHROME_SCHEMA,
    status: "PASS",
    browser: "Google Chrome",
    genuineInstalledChrome: true,
    nativeZoomPercent: 200,
    visibleZoomConfirmation: "Zoom: 200%",
    branch: PHASE7B_BRANCH,
    revision: REVISION,
    method: {
      stages: PHASE7B_METHOD_STAGES.map((stage) => ({
        stage,
        headingFullyVisible: true,
        copyFullyVisible: true,
        internalWordBreaking: false,
        horizontalOverflow: false,
      })),
    },
    fieldMap: { status: "PASS", checks: { eightLinks: true, targetSizes: true, escapeRestores: true } },
    recording: { path: INSTALLED_RECORDING_NAME, bytes: 1000, sha256: "1".repeat(64), fullDecode: true },
    screenshot: { path: INSTALLED_SCREENSHOT_NAME, bytes: 1000, sha256: "2".repeat(64) },
    humanGate: "PENDING HUMAN REVIEW",
  };
}

test("native-200 CLI separates PASS capture authority from honest environmental limitation", () => {
  const normal = parseArguments([
    "--base-url", "http://127.0.0.1:4322/",
    "--revision", REVISION,
    "--output", EXTERNAL,
    "--baseline-width", "1388",
    "--baseline-dpr", "1.25",
    "--ui-proof-json", path.resolve(ROOT, "..", "computer-use-proof.json"),
    "--ui-proof-png", path.resolve(ROOT, "..", "computer-use-proof.png"),
  ]);
  assert.equal(normal.cdpUrl, "http://127.0.0.1:9333");
  assert.equal(normal.baselineWidth, 1388);
  const limitation = parseArguments([
    "--revision", REVISION,
    "--output", EXTERNAL,
    "--environmental-limitation", "Visible installed-Chrome UI confirmation is unavailable in this environment.",
  ]);
  assert.match(limitation.environmentalLimitation, /unavailable/);
  assert.throws(() => parseArguments(["--revision", PHASE7B_PARENT, "--output", EXTERNAL, "--environmental-limitation", "Visible browser UI confirmation is unavailable here."]), /new Phase 7B/);
  assert.throws(() => parseArguments(["--revision", REVISION, "--output", path.join(ROOT, "native"), "--environmental-limitation", "Visible browser UI confirmation is unavailable here."]), /durable external/);
  assert.throws(() => parseArguments(["--revision", REVISION, "--output", path.join(os.tmpdir(), "native"), "--environmental-limitation", "Visible browser UI confirmation is unavailable here."]), /durable external/);
  assert.throws(() => parseArguments(["--revision", REVISION, "--output", EXTERNAL, "--environmental-limitation", "unavailable"]), /must explain/);
});

test("Computer Use proof binds one visible Chrome window, one exact Zoom: 200% node and exact PNG bytes", async () => {
  const image = png();
  const document = await uiDocument(image);
  const authority = validateUiProof(document, image, "Quantum Hub");
  assert.equal(authority.visibleZoomConfirmation, "Zoom: 200%");
  assert.equal(authority.image.width, 1440);
  assert.match(authority.source, /Computer Use/);
  assert.throws(() => validateUiProof({ ...document, accessibility: { matchCount: 1, text: "Zoom: 175%" } }, image), /Zoom: 200%/);
  assert.throws(() => validateUiProof({ ...document, browserWindow: { ...document.browserWindow, selectedWindowCount: 2 } }, image), /one visible/);
  assert.throws(() => validateUiProof(document, Buffer.alloc(64)), /not a PNG/);
  assert.throws(() => validateUiProof(document, image, "Different Site"), /does not bind/);
});

test("native geometry requires reciprocal width and DPR ratios without visual-viewport, CSS or transform substitution", () => {
  const observed = {
    innerWidth: 694,
    devicePixelRatio: 2.5,
    visualViewportScale: 1,
    rootCssZoom: "1",
    bodyCssZoom: "1",
    rootTransform: "none",
    bodyTransform: "none",
  };
  const result = validateNativeZoomGeometry({ innerWidth: 1388, devicePixelRatio: 1.25 }, observed);
  assert.equal(result.status, "PASS");
  assert.equal(result.widthRatio, 2);
  assert.equal(result.dprRatio, 2);
  for (const mutation of [
    { innerWidth: 900 },
    { devicePixelRatio: 1.25 },
    { visualViewportScale: 2 },
    { rootCssZoom: "2" },
    { bodyTransform: "matrix(2, 0, 0, 2, 0, 0)" },
  ]) assert.throws(() => validateNativeZoomGeometry({ innerWidth: 1388, devicePixelRatio: 1.25 }, { ...observed, ...mutation }), /not genuine/);
});

test("installed report binds exact media names, complete METHOD and Field Map while limitation cannot claim media", () => {
  assert.equal(validateInstalledReport(passReport()), true);
  const missingStage = structuredClone(passReport());
  missingStage.method.stages.pop();
  assert.throws(() => validateInstalledReport(missingStage), /METHOD/);
  const fakeRecording = structuredClone(passReport());
  fakeRecording.recording.path = "firefox-native-200.mp4";
  assert.throws(() => validateInstalledReport(fakeRecording), /recording authority/);

  const limitation = {
    schema: INSTALLED_CHROME_SCHEMA,
    status: "LIMITATION",
    browser: "Google Chrome",
    genuineInstalledChrome: true,
    nativeZoomPercent: 200,
    visibleZoomConfirmation: null,
    recording: null,
    screenshot: null,
    environmentalLimitation: "Visible native browser UI confirmation was unavailable in this execution environment.",
  };
  assert.equal(validateInstalledReport(limitation), true);
  limitation.recording = { path: INSTALLED_RECORDING_NAME };
  assert.throws(() => validateInstalledReport(limitation), /overstates/);
});

test("Firefox is explicitly not applicable and output names/schemas remain fixed", () => {
  const limitation = firefoxLimitation();
  assert.equal(limitation.schema, ENGINE_LIMITATION_SCHEMA);
  assert.equal(limitation.status, "LIMITATION");
  assert.equal(limitation.classification, "NOT APPLICABLE");
  assert.equal(limitation.recording, null);
  assert.deepEqual(
    [INSTALLED_REPORT_NAME, INSTALLED_RECORDING_NAME, INSTALLED_SCREENSHOT_NAME, FIREFOX_LIMITATION_NAME],
    ["installed-chrome-native-200.json", "installed-chrome-native-200.mp4", "chrome-visible-zoom-200.png", "firefox-native-200-limitation.json"],
  );
  assert.equal(PHASE7B_GATES.length, 6);
  assert.equal(selfTest().passPayloads, 4);
});

test("source attaches to externally proven Chrome and contains no zoom, viewport, transform or browser-launch substitute", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "capture-phase7b-installed-chrome-200.mjs"), "utf8");
  assert.match(source, /chromium\.connectOverCDP/);
  assert.match(source, /--ui-proof-json/);
  assert.match(source, /--ui-proof-png/);
  assert.match(source, /page\.mouse\.wheel/);
  assert.match(source, /Browser\.getVersion/);
  assert.match(source, /Zoom: 200%/);
  assert.match(source, /--environmental-limitation/);
  assert.doesNotMatch(source, /\.launch\s*\(|\.newContext\s*\(|\.setViewportSize\s*\(|setDeviceMetricsOverride|deviceScaleFactor\s*:|isMobile\s*:|hasTouch\s*:|Emulation\.set/i);
  assert.doesNotMatch(source, /\.style\.zoom\s*=|style\.setProperty\([^)]*zoom|\.style\.transform\s*=|style\.setProperty\([^)]*transform/i);
  assert.doesNotMatch(source, /powershell|capture-installed-chrome-window/i);
});
