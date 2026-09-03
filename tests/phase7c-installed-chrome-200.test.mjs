import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  NATIVE200_LIMITATION,
  NATIVE200_MANIFEST_NAME,
  NATIVE200_RECORDING_NAME,
  NATIVE200_REPORT_NAME,
  NATIVE200_SCHEMA,
  NATIVE200_SCREENSHOTS,
  installedChromeCandidates,
  parseArguments,
  selfTest,
  validateCaptureHandshake,
  validateInstalledReport,
  validateNativeZoomGeometry,
  waitForCaptureHandshake,
} from "../scripts/capture-phase7c-installed-chrome-200.mjs";
import {
  PHASE7C_BRANCH,
  PHASE7C_INDUSTRIES,
  PHASE7C_PARENT,
  PHASE7C_PROOF_RECORD,
} from "../scripts/phase7c-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISION = "a".repeat(40);
const EXTERNAL = path.resolve(ROOT, "..", "phase7c-native-200-fixture");
const TARGET = "https://phase7c.example.invalid/#entry";

const BASELINE_GEOMETRY = Object.freeze({
  bodyCssZoom: "1",
  bodyTransform: "none",
  devicePixelRatio: 1.25,
  innerHeight: 760,
  innerWidth: 1400,
  outerHeight: 900,
  outerWidth: 1440,
  playwrightViewport: null,
  rootCssZoom: "1",
  rootTransform: "none",
  screenHeight: 1080,
  screenWidth: 1920,
  visualViewportScale: 1,
});

const OBSERVED_GEOMETRY = Object.freeze({
  ...BASELINE_GEOMETRY,
  devicePixelRatio: 2.5,
  innerHeight: 380,
  innerWidth: 700,
});

const LAUNCH_CONTRACT = Object.freeze({
  arguments: ["--no-first-run", "--new-window"],
  deviceEmulation: false,
  executableName: "chrome.exe",
  freshIsolatedProfile: true,
  headless: false,
  osKeyboardInputByTool: false,
  viewport: null,
});

function passReport() {
  const zoomGeometry = validateNativeZoomGeometry(BASELINE_GEOMETRY, OBSERVED_GEOMETRY, LAUNCH_CONTRACT);
  return {
    browser: "Google Chrome",
    browserVersion: "Chrome/140.0.7339.81",
    carrier: { enhancedCarrierCount: 1, everyStaticCarrierVisible: true, staticCarrierCount: 4 },
    classification: "PASS",
    environmentalLimitation: null,
    exactTargetUrl: TARGET,
    fieldMap: {
      checks: {
        eightLinks: true,
        escapeReturnsFocus: true,
        forwardContained: true,
        linksMeasurable: true,
        noBackgroundFocusable: true,
        noHorizontalOverflow: true,
        openInertAuthority: true,
        reverseContained: true,
        targetSizes: true,
      },
      status: "PASS",
    },
    genuineInstalledChrome: true,
    humanGate: "PENDING HUMAN REVIEW",
    launchContract: LAUNCH_CONTRACT,
    nativeZoomPercent: 200,
    observedTargetUrl: TARGET,
    osLevelZoomHandshake: {
      externalOperatorAcknowledged: true,
      toolSentOsInput: false,
    },
    presentation: { fallback: "text-zoom", mode: "static", projection: "settled", raf: "idle" },
    profile: { deletedAfterCapture: true, fresh: true, isolated: true, pathReported: false },
    proof: {
      checks: {
        copyPresent: true,
        exactTitle: true,
        imageIntrinsicAuthority: true,
        imageVisible: true,
        linkAuthority: true,
        linkTargetSize: true,
        noHorizontalOverflow: true,
        titleAndCopyVisible: true,
      },
      recordState: { link: { hrefPath: "/pocs/maradin/" } },
      status: "PASS",
      titleState: { title: PHASE7C_PROOF_RECORD },
    },
    recording: {
      path: null,
      reason: "Optional media encoder is not installed in this fixture environment.",
      status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT",
    },
    revision: REVISION,
    schema: NATIVE200_SCHEMA,
    screenshots: Object.values(NATIVE200_SCREENSHOTS).map((name, index) => ({
      bytes: 1000 + index,
      format: "png",
      height: 900,
      path: name,
      sha256: String(index + 1).repeat(64),
      width: 1440,
    })),
    status: "PASS",
    territories: PHASE7C_INDUSTRIES.map((heading, index) => ({
      atomRecords: index === 2
        ? ["Industry 4.0 /", "Advanced", "Manufacturing"].map((text) => ({ clientRectCount: 1, text }))
        : [],
      checks: {
        bodyCopyPresent: true,
        copyFullyVisible: true,
        exactHeading: true,
        headingFullyVisible: true,
        manufacturingWordIntegrity: true,
        noHorizontalOverflow: true,
        noInternalWordBreaking: true,
        staticCarrierVisible: true,
        staticVisualVisible: true,
      },
      heading,
      status: "PASS",
    })),
    zoomGeometry,
  };
}

test("CLI requires an exact Phase 7C revision, exact HTTP(S) URL and fresh external output", () => {
  const parsed = parseArguments([
    "--url", TARGET,
    "--revision", REVISION,
    "--output", EXTERNAL,
    "--handshake-timeout-ms", "120000",
    "--skip-recording",
  ]);
  assert.equal(parsed.url, TARGET);
  assert.equal(parsed.handshakeTimeoutMs, 120000);
  assert.equal(parsed.skipRecording, true);
  assert.throws(
    () => parseArguments(["--url", TARGET, "--revision", PHASE7C_PARENT, "--output", EXTERNAL]),
    /new Phase 7C commit/,
  );
  assert.throws(
    () => parseArguments(["--url", "file:///private/page", "--revision", REVISION, "--output", EXTERNAL]),
    /HTTP\(S\)/,
  );
  assert.throws(
    () => parseArguments(["--url", TARGET, "--revision", REVISION, "--output", path.join(ROOT, "evidence")]),
    /durable external/,
  );
  assert.throws(
    () => parseArguments(["--url", TARGET, "--revision", REVISION, "--output", path.join(os.tmpdir(), "phase7c-native")]),
    /durable external/,
  );
});

test("honest limitation mode uses only the permitted Computer Use classification and cannot need a target URL", () => {
  const parsed = parseArguments([
    "--revision", REVISION,
    "--output", EXTERNAL,
    "--environmental-limitation", "The environment could not safely establish and verify the unique installed-Chrome target window.",
  ]);
  assert.match(parsed.environmentalLimitation, /safely establish/);
  assert.equal(parsed.url, "");
  assert.throws(
    () => parseArguments(["--revision", REVISION, "--output", EXTERNAL, "--environmental-limitation", "Chrome unavailable"]),
    /must explain/,
  );
});

test("session handshake accepts only the exact bounded CAPTURE token", async () => {
  const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.equal(validateCaptureHandshake(`CAPTURE ${sessionId}`, sessionId), true);
  assert.equal(validateCaptureHandshake("CAPTURE bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sessionId), false);
  assert.equal(validateCaptureHandshake("capture aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId), false);

  const input = new PassThrough();
  const waiting = waitForCaptureHandshake({ input, sessionId, timeoutMs: 500 });
  input.write("CAPTURE bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb\n");
  input.write(`CAPTURE ${sessionId}\n`);
  const result = await waiting;
  assert.equal(result.sessionId, sessionId);

  const timeoutInput = new PassThrough();
  await assert.rejects(
    waitForCaptureHandshake({ input: timeoutInput, sessionId, timeoutMs: 20 }),
    /timed out/,
  );
  timeoutInput.destroy();
});

test("native geometry proves reciprocal content dimensions and DPR while outer window and screen stay stable", () => {
  const authority = validateNativeZoomGeometry(BASELINE_GEOMETRY, OBSERVED_GEOMETRY, LAUNCH_CONTRACT);
  assert.equal(authority.status, "PASS");
  assert.equal(authority.widthRatio, 2);
  assert.equal(authority.heightRatio, 2);
  assert.equal(authority.dprRatio, 2);
  assert.ok(Object.values(authority.checks).every(Boolean));
});

test("native geometry rejects CSS zoom, transforms, device emulation, viewport sizing and scale-factor flags", () => {
  const badGeometry = [
    { observed: { ...OBSERVED_GEOMETRY, innerWidth: 900 }, launch: LAUNCH_CONTRACT },
    { observed: { ...OBSERVED_GEOMETRY, innerHeight: 500 }, launch: LAUNCH_CONTRACT },
    { observed: { ...OBSERVED_GEOMETRY, devicePixelRatio: 1.25 }, launch: LAUNCH_CONTRACT },
    { observed: { ...OBSERVED_GEOMETRY, visualViewportScale: 2 }, launch: LAUNCH_CONTRACT },
    { observed: { ...OBSERVED_GEOMETRY, rootCssZoom: "2" }, launch: LAUNCH_CONTRACT },
    { observed: { ...OBSERVED_GEOMETRY, bodyTransform: "matrix(2, 0, 0, 2, 0, 0)" }, launch: LAUNCH_CONTRACT },
    { observed: { ...OBSERVED_GEOMETRY, playwrightViewport: { width: 700, height: 380 } }, launch: LAUNCH_CONTRACT },
    { observed: OBSERVED_GEOMETRY, launch: { ...LAUNCH_CONTRACT, viewport: { width: 700, height: 380 } } },
    { observed: OBSERVED_GEOMETRY, launch: { ...LAUNCH_CONTRACT, deviceEmulation: true } },
    { observed: OBSERVED_GEOMETRY, launch: { ...LAUNCH_CONTRACT, arguments: ["--force-device-scale-factor=2"] } },
  ];
  for (const fixture of badGeometry) {
    assert.throws(
      () => validateNativeZoomGeometry(BASELINE_GEOMETRY, fixture.observed, fixture.launch),
      /not genuine|launch contract/,
    );
  }
});

test("PASS report binds four exact territories, Manufacturing atoms, carrier, proof, Field Map and screenshots", () => {
  const report = passReport();
  assert.equal(validateInstalledReport(report), true);
  assert.equal(report.territories[2].heading, "Industry 4.0 / Advanced Manufacturing");
  assert.equal(report.proof.titleState.title, PHASE7C_PROOF_RECORD);

  const brokenAtom = structuredClone(report);
  brokenAtom.territories[2].atomRecords[2].clientRectCount = 2;
  assert.throws(() => validateInstalledReport(brokenAtom), /Manufacturing word integrity/);
  const emulated = structuredClone(report);
  emulated.launchContract.viewport = { width: 700, height: 380 };
  assert.throws(() => validateInstalledReport(emulated), /launch\/emulation/);
  const escapedFocus = structuredClone(report);
  escapedFocus.fieldMap.checks.forwardContained = false;
  assert.throws(() => validateInstalledReport(escapedFocus), /Field Map/);
});

test("LIMITATION report cannot claim geometry, page media, territory, proof or Field Map evidence", () => {
  const limitation = {
    browser: "Google Chrome",
    classification: NATIVE200_LIMITATION,
    environmentalLimitation: "The environment could not safely establish and verify the unique installed-Chrome target window.",
    fieldMap: null,
    genuineInstalledChrome: true,
    nativeZoomPercent: 200,
    osLevelZoomHandshake: null,
    proof: null,
    recording: null,
    schema: NATIVE200_SCHEMA,
    screenshots: null,
    status: "LIMITATION",
    territories: null,
    zoomGeometry: null,
  };
  assert.equal(validateInstalledReport(limitation), true);
  limitation.screenshots = [{ path: "unproven.png" }];
  assert.throws(() => validateInstalledReport(limitation), /overstates/);
});

test("installed Chrome discovery remains a bounded Google Chrome path inventory", () => {
  const candidates = installedChromeCandidates({
    LOCALAPPDATA: "C:\\Users\\fixture\\AppData\\Local",
    PROGRAMFILES: "C:\\Program Files",
    "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
  }, "win32");
  assert.equal(candidates.length, 3);
  assert.ok(candidates.every((candidate) => /Google[\\/]Chrome[\\/]Application[\\/]chrome\.exe$/i.test(candidate)));
  assert.deepEqual(installedChromeCandidates({}, "linux"), []);
});

test("source launches the actual executable in a fresh native window and never drives OS zoom or emulation", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "capture-phase7c-installed-chrome-200.mjs"), "utf8");
  assert.match(source, /chromium\.launchPersistentContext\(profilePath/);
  assert.match(source, /executablePath:\s*executable/);
  assert.match(source, /viewport:\s*null/);
  assert.match(source, /mkdtemp\(/);
  assert.match(source, /PHASE7C_NATIVE200_READY/);
  assert.match(source, /CAPTURE <sessionId>/);
  assert.match(source, /Browser\.getVersion/);
  assert.match(source, /page\.mouse\.wheel/);
  assert.match(source, /data-territory-fallback/);
  assert.match(source, /text-zoom/);
  assert.match(source, /data-field-map-background/);
  assert.doesNotMatch(source, /connectOverCDP|\.newContext\s*\(|\.setViewportSize\s*\(|setDeviceMetricsOverride|Emulation\.set|deviceScaleFactor\s*:|isMobile\s*:|hasTouch\s*:/i);
  assert.doesNotMatch(source, /\.style\.zoom\s*=|style\.setProperty\([^)]*zoom|\.style\.transform\s*=|style\.setProperty\([^)]*transform/i);
  assert.doesNotMatch(source, /window\.scrollTo|scrollIntoView|\.scrollTop\s*=/);
  assert.doesNotMatch(source, /sky\.press_key|robotjs|sendkeys|wscript\.shell|powershell/i);
  const pageKeys = [...source.matchAll(/page\.keyboard\.press\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(pageKeys.length > 0);
  assert.ok(pageKeys.every((key) => ["Enter", "Tab", "Shift+Tab", "Escape"].includes(key)));
  assert.doesNotMatch(pageKeys.join(" "), /Control|Meta/i);
});

test("fixed evidence names and self-test disclose the native/non-emulated contract", () => {
  assert.deepEqual(
    [NATIVE200_REPORT_NAME, NATIVE200_MANIFEST_NAME, NATIVE200_RECORDING_NAME],
    ["installed-chrome-native-200.json", "installed-chrome-native-200-manifest.json", "installed-chrome-native-200.mp4"],
  );
  assert.equal(Object.keys(NATIVE200_SCREENSHOTS).length, 9);
  assert.equal(PHASE7C_BRANCH, "feature/phase-7c-territory-proof-threshold");
  const result = selfTest();
  assert.equal(result.status, "PASS");
  assert.equal(result.phase7cTerritories, 4);
  assert.equal(result.emulationAsPass, "PROHIBITED");
});
