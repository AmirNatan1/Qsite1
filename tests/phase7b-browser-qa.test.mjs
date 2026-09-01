import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  CORE_VIEWPORTS,
  EXPECTED_H2,
  MACRO_SAMPLES,
  PHASE7A_ACCEPTED_IMMUTABLE_PREVIEW,
  SCHEMA,
  VISUAL_REGRESSION_STATES,
  assertExternalOutput,
  compareNormalizedVisuals,
  normalizeVisualRegressionPng,
  parseArguments,
  recordingSpecifications,
  safeRelativePath,
  selfTest,
  validatePortableReport,
  validateStageSnapshot,
} from "../scripts/qa-phase7b-operating-field.mjs";
import {
  PHASE7B_BRANCH,
  PHASE7B_CYCLE_COUNT,
  PHASE7B_GATES,
  PHASE7B_METHOD_STAGES,
  PHASE7B_PARENT,
  PHASE7B_RECORDING_SCENARIOS,
} from "../scripts/phase7b-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISION = "a".repeat(40);
const EXTERNAL = path.resolve(ROOT, "..", "phase7b-browser-evidence-test");

function viewportSnapshot() {
  return {
    chapterCount: 1,
    domNodes: 180,
    h1Count: 0,
    h2Count: 1,
    h2Rect: { left: 40, top: 100, right: 1000, bottom: 300, width: 960, height: 200 },
    h2Text: EXPECTED_H2,
    horizontalOverflow: false,
    sameWorkpiece: true,
    stageHeadings: PHASE7B_METHOD_STAGES.map((text) => ({ text, visible: true })),
    stageNames: [...PHASE7B_METHOD_STAGES],
    staticFallbackCount: 5,
    svgElements: 60,
    workpieceCount: 1,
  };
}

function resultFixture(engine) {
  return {
    identity: {
      engine,
      evidenceClass: engine === "webkit" ? "playwright-webkit-proxy" : engine === "chromium" ? "installed-headed-chromium" : "playwright-managed-firefox",
      statement: engine === "webkit" ? "Playwright WebKit proxy evidence only; not physical Safari." : "Browser authority.",
    },
    responsive: { cases: CORE_VIEWPORTS.map((viewport) => ({ viewport, status: "PASS" })) },
    visualRegression: {
      baselineAuthority: { revision: PHASE7B_PARENT },
      retainedPngs: false,
      cases: VISUAL_REGRESSION_STATES.map(({ id }) => ({
        id,
        baseline: {
          revision: PHASE7B_PARENT,
          sourcePngBytes: 1,
          sourcePngSha256: "1".repeat(64),
          normalizedSha256: "2".repeat(64),
          semantic: { innerHeight: 900 },
        },
        current: {
          revision: REVISION,
          sourcePngBytes: 1,
          sourcePngSha256: "3".repeat(64),
          normalizedSha256: "2".repeat(64),
          semantic: { innerHeight: 900 },
        },
        comparisonRegion: { width: 1440, height: 900 },
        metrics: { exact: true, differingPixels: 0 },
        retainedMedia: [],
        status: "PASS",
        classification: "EXACT",
        explanation: "Normalized pixels are exact.",
        checks: { semanticMatch: true, explainedPixels: true },
      })),
      status: "PASS",
    },
    recordings: { recordings: recordingSpecifications(engine).map((specification) => specification.captureMedia
      ? { ...specification, status: "PASS", media: { decodeStatus: "PASS" } }
      : { ...specification, status: "LIMITATION" }) },
    lifecycle: { cycles: Array.from({ length: PHASE7B_CYCLE_COUNT }, (_, index) => ({ cycle: index + 1 })) },
    checks: { responsive: true, recordings: true, lifecycle: true },
    status: "LIMITATION",
  };
}

function reportFixture(engine = "chromium") {
  return {
    schema: SCHEMA,
    branch: PHASE7B_BRANCH,
    revision: REVISION,
    results: [resultFixture(engine)],
    humanGates: Object.fromEntries(PHASE7B_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"])),
    status: "LIMITATION",
  };
}

test("Phase 7B QA consumes the exact viewport, macro-state, recording and lifecycle contracts", () => {
  const authority = selfTest();
  assert.equal(authority.status, "PASS");
  assert.equal(authority.coreViewports, 13);
  assert.equal(authority.macroStates, 7);
  assert.equal(authority.semanticStages, 5);
  assert.equal(authority.recordingScenarios, 10);
  assert.equal(authority.ordinaryRecordingMedia, 18);
  assert.equal(authority.webkitRecordingMedia, 0);
  assert.equal(authority.cyclesPerEngine, 10);
  assert.equal(authority.frozenPhase7aVisualStates, 4);
  assert.equal(authority.phase7aBaselineRevision, PHASE7B_PARENT);
  assert.match(authority.nativeZoomPolicy, /never emulated/i);
  assert.equal(CORE_VIEWPORTS.length, 13);
  assert.equal(MACRO_SAMPLES.length, 7);
  assert.deepEqual(MACRO_SAMPLES.map(({ state }) => state), ["OPEN_FIELD", "FRAME", "SOURCE", "ASSESS", "TEST", "DECIDE", "RELEASE"]);
});

test("CLI requires the exact new revision and a bounded external evidence directory", () => {
  const baseline = ["--phase7a-baseline-url", PHASE7A_ACCEPTED_IMMUTABLE_PREVIEW];
  const parsed = parseArguments(["--revision", REVISION, "--output", EXTERNAL, ...baseline, "--engine", "webkit", "--headed", "--retain-visual-regression-pngs"]);
  assert.equal(parsed.revision, REVISION);
  assert.equal(parsed.engine, "webkit");
  assert.equal(parsed.headed, true);
  assert.equal(parsed.retainVisualRegressionPngs, true);
  assert.equal(parsed.phase7aBaselineUrl, PHASE7A_ACCEPTED_IMMUTABLE_PREVIEW);
  assert.equal(parsed.baseUrl, "http://127.0.0.1:4322/");
  assert.throws(() => parseArguments(["--revision", PHASE7B_PARENT, "--output", EXTERNAL, ...baseline]), /new Phase 7B commit/);
  assert.throws(() => parseArguments(["--revision", REVISION.toUpperCase(), "--output", EXTERNAL, ...baseline]), /exact lowercase/);
  assert.throws(() => parseArguments(["--revision", REVISION, "--output", ROOT, ...baseline]), /outside the repository/);
  assert.throws(() => parseArguments(["--revision", REVISION, "--output", EXTERNAL]), /phase7a-baseline-url is required/);
  assert.throws(() => parseArguments(["--revision", REVISION, "--output", EXTERNAL, "--phase7a-baseline-url", "https://example.com/"]), /accepted immutable 626812c preview/);
  assert.throws(() => assertExternalOutput(path.join(os.tmpdir(), "phase7b-browser")), /temporary/);
  assert.throws(() => parseArguments(["--revision", REVISION, "--output", EXTERNAL, ...baseline, "--engine", "safari"]), /all, chromium, firefox or webkit/);
});

test("visual regression accepts exact pixels, narrowly explains bounded raster noise, and fails closed otherwise", () => {
  const normalized = (bytes, width = 10, height = 10) => ({ width, height, channels: 4, normalized: Buffer.from(bytes) });
  const exactBytes = Buffer.alloc(10 * 10 * 4, 90);
  const exact = compareNormalizedVisuals(normalized(exactBytes), normalized(exactBytes));
  assert.equal(exact.status, "PASS");
  assert.equal(exact.classification, "EXACT");
  assert.equal(exact.metrics.differingPixels, 0);

  const largeBaseline = Buffer.alloc(100 * 100 * 4, 90);
  const boundedBytes = Buffer.from(largeBaseline);
  boundedBytes[0] = 92;
  const bounded = compareNormalizedVisuals(normalized(largeBaseline, 100, 100), normalized(boundedBytes, 100, 100));
  assert.equal(bounded.status, "PASS");
  assert.equal(bounded.classification, "BOUNDED_RENDERING_NOISE");
  assert.equal(bounded.metrics.differingPixels, 1);

  const changed = Buffer.alloc(10 * 10 * 4, 220);
  const failure = compareNormalizedVisuals(normalized(exactBytes), normalized(changed));
  assert.equal(failure.status, "FAIL");
  assert.equal(failure.classification, "UNEXPLAINED_DIFFERENCE");
  assert.equal(failure.explanation, null);
  assert.throws(() => compareNormalizedVisuals(normalized(exactBytes), normalized(Buffer.alloc(4), 1, 1)), /dimensions differ/);
});

test("visual-regression normalization crops viewport scrollbars and post-bifurcation rows deterministically", async () => {
  const source = await sharp({
    create: { width: 8, height: 6, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } },
  }).png().toBuffer();
  const normalized = await normalizeVisualRegressionPng(source, { comparisonWidth: 7, comparisonHeight: 4 });
  assert.equal(normalized.width, 7);
  assert.equal(normalized.height, 4);
  assert.equal(normalized.channels, 4);
  assert.equal(normalized.normalized.length, 7 * 4 * 4);
  assert.match(normalized.sourceSha256, /^[0-9a-f]{64}$/);
  assert.match(normalized.normalizedSha256, /^[0-9a-f]{64}$/);
});

test("portable paths reject traversal, machine paths, source payloads and nested archives", () => {
  assert.equal(safeRelativePath("screenshots/chromium/1440x900-operating-field.png"), "screenshots/chromium/1440x900-operating-field.png");
  for (const candidate of ["../escape.png", "C:\\Users\\private\\capture.png", "/absolute.png", "raw/capture.webm", "source/index.html", "payload.zip", "node_modules/cache.bin"]) {
    assert.throws(() => safeRelativePath(candidate), /portable|traverse|forbidden|nested archive/);
  }
});

test("stage validator proves semantic order, one persistent Workpiece, visible headings and bounded geometry", () => {
  const viewport = { width: 1440, height: 900 };
  const pass = validateStageSnapshot(viewportSnapshot(), viewport);
  assert.equal(pass.status, "PASS");
  assert.ok(Object.values(pass.checks).every(Boolean));

  for (const mutation of [
    (snapshot) => { snapshot.workpieceCount = 2; },
    (snapshot) => { snapshot.stageNames.reverse(); },
    (snapshot) => { snapshot.stageHeadings[2].visible = false; },
    (snapshot) => { snapshot.horizontalOverflow = true; },
    (snapshot) => { snapshot.domNodes = 221; },
    (snapshot) => { snapshot.h2Rect.top = -500; snapshot.h2Rect.bottom = -300; },
  ]) {
    const snapshot = structuredClone(viewportSnapshot());
    mutation(snapshot);
    assert.equal(validateStageSnapshot(snapshot, viewport).status, "FAIL");
  }
});

test("recording inventory is exact and treats native 200 percent as separate authority", () => {
  for (const engine of ["chromium", "firefox", "webkit"]) {
    const records = recordingSpecifications(engine);
    assert.equal(records.length, 10);
    assert.deepEqual(records.map(({ scenario }) => scenario), PHASE7B_RECORDING_SCENARIOS);
    assert.equal(records.filter(({ nativeZoomAuthority }) => nativeZoomAuthority).length, 1);
    assert.equal(records.filter(({ captureMedia }) => captureMedia).length, engine === "webkit" ? 0 : 9);
    assert.ok(records.filter(({ captureMedia }) => captureMedia).every(({ relativePath }) => relativePath.startsWith(`recordings/${engine}/`)));
    assert.ok(records.filter(({ captureMedia }) => !captureMedia).every(({ relativePath }) => relativePath === null));
  }
  assert.throws(() => recordingSpecifications("safari"), /unsupported recording engine/);
});

test("portable report validation keeps all gates pending and WebKit honestly proxy-labelled", () => {
  assert.equal(validatePortableReport(reportFixture("chromium")), true);
  assert.equal(validatePortableReport(reportFixture("firefox")), true);
  assert.equal(validatePortableReport(reportFixture("webkit")), true);

  const overstated = reportFixture("webkit");
  overstated.results[0].identity.statement = "Safari passed";
  assert.throws(() => validatePortableReport(overstated), /not physical Safari|overstated|proxy/i);

  const accepted = reportFixture();
  accepted.humanGates[PHASE7B_GATES[0]] = "ACCEPT";
  assert.throws(() => validatePortableReport(accepted), /remain pending/);

  const missingViewport = reportFixture();
  missingViewport.results[0].responsive.cases.pop();
  assert.throws(() => validatePortableReport(missingViewport), /13 responsive cases/);

  const missingRecording = reportFixture();
  missingRecording.results[0].recordings.recordings.pop();
  assert.throws(() => validatePortableReport(missingRecording), /recording inventory/);

  const fakeWebKit = reportFixture("webkit");
  fakeWebKit.results[0].recordings.recordings[0] = {
    ...fakeWebKit.results[0].recordings.recordings[0],
    status: "PASS",
    relativePath: "recordings/webkit/full-forward-method.mp4",
    media: { decodeStatus: "PASS" },
  };
  assert.throws(() => validatePortableReport(fakeWebKit), /unrecorded limitation/);

  const unexplainedVisual = reportFixture();
  unexplainedVisual.results[0].visualRegression.cases[0].classification = "UNEXPLAINED_DIFFERENCE";
  unexplainedVisual.results[0].visualRegression.cases[0].explanation = null;
  unexplainedVisual.results[0].visualRegression.cases[0].checks.explainedPixels = false;
  assert.throws(() => validatePortableReport(unexplainedVisual), /false PASS|fail closed/i);

  const mismatchedExactHash = reportFixture();
  mismatchedExactHash.results[0].visualRegression.cases[0].current.normalizedSha256 = "4".repeat(64);
  assert.throws(() => validatePortableReport(mismatchedExactHash), /not hash-identical/);

  const retainedByDefault = reportFixture();
  retainedByDefault.results[0].visualRegression.cases[0].retainedMedia.push({ relativePath: "visual-regression/chromium/manifesto-entry-phase7a-baseline.png" });
  assert.throws(() => validatePortableReport(retainedByDefault), /redundant baseline media/);

  const wrongViewport = reportFixture();
  wrongViewport.results[0].visualRegression.cases[0].current.semantic.innerHeight = 899;
  assert.throws(() => validatePortableReport(wrongViewport), /1440x900 authority/);
});

test("source uses installed Chromium and existing media helpers without zoom emulation or a runtime dependency", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "qa-phase7b-operating-field.mjs"), "utf8");
  assert.match(source, /from "\.\/phase7b-contract\.mjs"/);
  assert.match(source, /DEFAULT_FFMPEG_CANDIDATES/);
  assert.match(source, /DEFAULT_FFPROBE_CANDIDATES/);
  assert.match(source, /C:\\\\Program Files\\\\Google\\\\Chrome/);
  assert.match(source, /Playwright WebKit proxy evidence only; not physical Safari/);
  assert.match(source, /observeTargetSizes/);
  assert.match(source, /axeCore\.source/);
  assert.match(source, /recordVideo/);
  assert.match(source, /libx264/);
  assert.match(source, /yuv420p/);
  assert.match(source, /layout-shift/);
  assert.match(source, /longtask/);
  assert.match(source, /PHASE7B_CYCLE_COUNT/);
  assert.match(source, /--phase7a-baseline-url/);
  assert.match(source, /3b260649\.qsite1\.pages\.dev/);
  assert.match(source, /normalizeVisualRegressionPng/);
  assert.match(source, /UNEXPLAINED_DIFFERENCE/);
  assert.match(source, /!response && page\.url\(\) === target/);
  assert.match(source, /page\.reload\(\{ waitUntil: "load"/);
  assert.match(source, /routeNavigation === "released"/);
  assert.match(source, /output: path\.basename\(options\.output\)/);
  assert.match(source, /--retain-visual-regression-pngs/);
  assert.doesNotMatch(source, /deviceScaleFactor|force-device-scale-factor|\.style\.zoom\s*=|transform\s*:\s*scale/i);
  assert.doesNotMatch(source, /from ["'](?:gsap|three|react|playwright)["']/i);
});
