import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ACCEPTED_PHASE4_SHA,
  FAMILY_PROFILES,
  HOLD_MILLISECONDS,
  HUMAN_GATES,
  MAIN_SHA,
  MANIFEST_URL_PATH,
  PHYSICAL_FRAME_COUNT,
  PIECEWISE_COORDINATES,
  REAL_404_ROUTE,
  RECORDINGS,
  REPORT_SCHEMAS,
  REQUIRED_BRANCH,
  SCHEMA,
  SEGMENTS,
  SHEETS,
  SOURCE_BLEND_SHA256,
  SUPPORTING_ROUTES,
  VIEWPOINTS,
  assertInventoryContract,
  expectedOffsetForCoordinate,
  mediaUrlPath,
  normalizeDeployedUrl,
  profileForView,
  recordingDurationResult,
  sha256,
  validateActiveManifest,
} from "../scripts/phase5a-evidence-contract.mjs";
import {
  compensatedTouchDistance,
  fastJumpEvidenceResult,
  expectedDocument404ConsoleResult,
  normalizedRecordingResult,
  parseArguments,
  requestInventoryResult,
  scrollbarLandingResult,
  settledScrollY,
  timelineHoldResult,
  validateDeploymentReportData,
  validateFreshExternalOutputPath,
  validateOptions,
} from "../scripts/capture-phase5a-browser-evidence.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "capture-phase5a-browser-evidence.mjs");
const CONTRACT = path.join(ROOT, "scripts", "phase5a-evidence-contract.mjs");
const ACTIVE_MANIFEST = path.join(ROOT, "artifacts", "original", "phase-4r2-1-causal-signal-scroll-stability", "production", "manifests", "phase-4r2-production-media-manifest.json");

function fixtureManifest() {
  const assets = [];
  for (const family of ["desktop", "portrait", "landscape"]) {
    assets.push({ kind: "video", family, codec: "h264", file: `media/${family}.mp4`, frames: PHYSICAL_FRAME_COUNT, fps: 30, bytes: 1_000_000, sha256: "a".repeat(64) });
    assets.push({ kind: "poster", family, file: `posters/${family}.png`, bytes: 10_000, sha256: "b".repeat(64) });
  }
  return {
    schema: "quantum-hub.phase-4-r2.production-media-manifest.v1",
    status: "PASS",
    sourceBlendSha256: SOURCE_BLEND_SHA256,
    physicalTimeline: { frames: PHYSICAL_FRAME_COUNT, fps: 30 },
    deliveryPolicy: { h264Only: true, activeVideoCount: 3, activePosterCount: 3, inactiveCodecPayloadCount: 0 },
    authorization: { mergeMain: false, phase5: false },
    assets,
  };
}

function validOptions(overrides = {}) {
  return {
    mode: "deployed",
    url: "https://immutable.example.test/",
    branchUrl: "https://branch.example.test/",
    expectedHead: "a".repeat(40),
    expectedBranch: REQUIRED_BRANCH,
    expectedDeploymentId: "12345678-1234-1234-1234-1234567890ab",
    deploymentProject: "qsite1",
    deploymentCheckRunId: "123456789",
    expectedManifestSha256: "b".repeat(64),
    manifest: ACTIVE_MANIFEST,
    manifestUrlPath: MANIFEST_URL_PATH,
    deploymentReport: path.join(ROOT, "deployment.json"),
    output: path.resolve(ROOT, "..", "phase5a-evidence-never-created"),
    chromium: null,
    ffmpeg: "ffmpeg",
    ffprobe: "ffprobe",
    timeoutMs: 30_000,
    selfTest: false,
    dryRun: false,
    help: false,
    ...overrides,
  };
}

test("Phase 5A evidence contract fixes the map and artifact inventory", () => {
  assert.equal(assertInventoryContract(), true);
  assert.equal(SEGMENTS.length, 13);
  assert.deepEqual(SEGMENTS.map((item) => item.id), [
    "top-dormancy", "current-orbit", "crt-arrival", "indicator", "phosphor-line", "raster-expansion",
    "raster-settling", "q-appearance", "q-hold", "frontal-approach", "physical-threshold", "digital-breathing", "entry-reveal",
  ]);
  assert.deepEqual([SEGMENTS[2].startU, SEGMENTS[2].physical], [284, "F285"]);
  assert.deepEqual([SEGMENTS[8].startU, SEGMENTS[8].physical], [369, "F370-F405"]);
  assert.equal(VIEWPOINTS.length, 5);
  assert.deepEqual(VIEWPOINTS.map(({ width, height }) => `${width}x${height}`), ["1440x900", "390x844", "320x800", "768x1024", "844x390"]);
  assert.deepEqual(new Set(VIEWPOINTS.map((item) => item.input)), new Set(["wheel", "touch", "keyboard"]));
  assert.equal(RECORDINGS.length, 12);
  assert.equal(RECORDINGS.filter((item) => item.gate === "H").length, 5);
  assert.equal(SHEETS.length, 10);
  assert.equal(Object.keys(REPORT_SCHEMAS).length, 8);
  assert.equal(SUPPORTING_ROUTES.length, 8);
  assert.equal(Object.keys(HUMAN_GATES).length, 6);
  assert.ok(HOLD_MILLISECONDS > 3_200);
});

test("all four family profiles are monotone and remain inside allocation bounds", () => {
  assert.equal(PIECEWISE_COORDINATES.length, 17);
  for (const profile of Object.values(FAMILY_PROFILES)) {
    assert.equal(profile.progress.length, PIECEWISE_COORDINATES.length);
    const numeric = profile.progress.filter((item) => typeof item === "number");
    assert.ok(numeric.every((item, index) => index === 0 || item > numeric[index - 1]), profile.id);
    assert.ok(profile.startupVh >= profile.startupRangeVh[0] && profile.startupVh <= profile.startupRangeVh[1], profile.id);
  }
  assert.equal(profileForView({ family: "desktop", height: 900 }), FAMILY_PROFILES.desktop);
  assert.equal(profileForView({ family: "desktop", height: 650 }), FAMILY_PROFILES.shortDesktop);
  assert.equal(profileForView({ family: "portrait", height: 844 }), FAMILY_PROFILES.portrait);
  assert.equal(profileForView({ family: "landscape", height: 390 }), FAMILY_PROFILES.landscape);
});

test("F286 is exactly one integer pixel after F285 for every family", () => {
  for (const profile of Object.values(FAMILY_PROFILES)) {
    for (const extent of [2_080, 4_280, 6_075]) {
      const arrival = expectedOffsetForCoordinate(extent, profile, 284);
      const firstIndicator = expectedOffsetForCoordinate(extent, profile, 285);
      assert.equal(firstIndicator, arrival + 1, `${profile.id}/${extent}`);
    }
  }
});

test("deployed URL and media path authorities reject ambiguous targets", () => {
  assert.equal(normalizeDeployedUrl("https://immutable.example.test/"), "https://immutable.example.test/");
  for (const invalid of ["http://immutable.example.test/", "https://127.0.0.1/", "https://immutable.example.test/path", "https://user:pass@immutable.example.test/"]) {
    assert.throws(() => normalizeDeployedUrl(invalid));
  }
  assert.equal(mediaUrlPath(MANIFEST_URL_PATH, "media/desktop.mp4"), "/media/cinematic/phase-4r2/media/desktop.mp4");
  assert.throws(() => mediaUrlPath(MANIFEST_URL_PATH, "../escape.mp4"));
});

test("unchanged H.264-only manifest validates and VP9/extra/authority mutations fail", () => {
  const manifest = fixtureManifest();
  assert.equal(validateActiveManifest(manifest), true);
  for (const mutate of [
    (value) => { value.assets[0].codec = "vp9"; value.assets[0].file = "media/desktop.webm"; },
    (value) => { value.assets.push({ ...value.assets[0], file: "media/extra.mp4" }); },
    (value) => { value.sourceBlendSha256 = "c".repeat(64); },
    (value) => { value.authorization.phase5 = true; },
  ]) {
    const invalid = structuredClone(manifest);
    mutate(invalid);
    assert.throws(() => validateActiveManifest(invalid));
  }
});

test("argument parser and deployed-only validator require fresh external evidence intent", () => {
  const parsed = parseArguments([
    "--immutable-url", "https://immutable.example.test/",
    "--branch-url", "https://branch.example.test/",
    "--expected-head", "a".repeat(40),
    "--expected-deployment-id", "12345678-1234-1234-1234-1234567890ab",
    "--deployment-project", "qsite1",
    "--deployment-check-run-id", "123456789",
    "--manifest", ACTIVE_MANIFEST,
    "--expected-manifest-sha256", "b".repeat(64),
    "--deployment-report", path.join(ROOT, "deployment.json"),
    "--output", path.resolve(ROOT, "..", "phase5a-evidence-never-created"),
  ]);
  assert.equal(validateOptions(parsed), parsed);
    assert.throws(() => validateOptions(validOptions({ mode: "local" })), /deployed-only/);
  assert.throws(() => validateOptions(validOptions({ expectedBranch: "wrong" })), /must target/);
  assert.throws(() => validateOptions(validOptions({ output: path.join(ROOT, "artifacts", "forbidden") })), /external/);
  assert.throws(() => parseArguments(["--unknown"]), /Unknown option/);
});

test("timeline hold detects autonomous frame, time, and scroll changes", () => {
  const telemetry = { playCalls: 0, playEvents: 0, playingEvents: 0 };
  const state = { now: 0, scrollY: 1_200, scrollOffset: 1_200, targetFrame: 285, presentedFrame: 285, currentTime: 284 / 30, paused: true, seeking: false, telemetry };
  const terminal = { ...structuredClone(state), now: HOLD_MILLISECONDS };
  assert.equal(timelineHoldResult([state, terminal]).pass, true);
  assert.equal(timelineHoldResult([state, { ...terminal, targetFrame: 286 }]).pass, false);
  assert.equal(timelineHoldResult([state, { ...terminal, currentTime: state.currentTime + 0.1 }]).pass, false);
  assert.equal(timelineHoldResult([state, { ...terminal, telemetry: { ...telemetry, playCalls: 1 } }]).pass, false);
  assert.equal(timelineHoldResult([state, { ...terminal, now: 3_000 }]).pass, false);
});

test("one H.264 request, one video Blob, one decoder, paused seeks are jointly required", () => {
  const expectedPath = "/media/cinematic/phase-4r2/media/desktop.mp4";
  const state = { videoElements: 1, sourceKind: "blob", codec: "h264", paused: true, telemetry: { videoBlobCreates: 1, liveBlobUrls: 1, playCalls: 0, playEvents: 0, playingEvents: 0, seekingEvents: 2, seekedEvents: 2, programmaticWindowScrollCalls: 0, programmaticElementScrollCalls: 0 } };
  const valid = requestInventoryResult({ requests: [{ path: expectedPath }] }, state, expectedPath);
  assert.equal(valid.pass, true);
  assert.equal(requestInventoryResult({ requests: [{ path: expectedPath }, { path: expectedPath }] }, state, expectedPath).pass, false);
  assert.equal(requestInventoryResult({ requests: [{ path: expectedPath }, { path: "/media/active.webm" }] }, state, expectedPath).pass, false);
  assert.equal(requestInventoryResult({ requests: [{ path: expectedPath }] }, { ...state, videoElements: 2 }, expectedPath).pass, false);
  assert.equal(requestInventoryResult({ requests: [{ path: expectedPath }] }, { ...state, telemetry: { ...state.telemetry, playCalls: 1 } }, expectedPath).pass, false);
});

test("fast jump requires a single scrollbar gesture and no catch-up", () => {
  const before = { targetFrame: 250 };
  const terminal = { targetFrame: 480, presentedFrame: 480, scrollOffset: 4_800, segment: "frontal-approach", telemetry: { playCalls: 0, playEvents: 0, playingEvents: 0 } };
  const telemetry = { wheelEvents: 0, keyEvents: 0, touchMoveEvents: 0, scrollEvents: 1, automationPointerGestures: 1 };
  assert.equal(fastJumpEvidenceResult(before, terminal, terminal, telemetry, { pass: true }).pass, true);
  assert.equal(fastJumpEvidenceResult(before, terminal, { ...terminal, presentedFrame: 470 }, telemetry, { pass: true }).pass, false);
  assert.equal(fastJumpEvidenceResult(before, terminal, terminal, { ...telemetry, wheelEvents: 1 }, { pass: true }).pass, false);
  assert.equal(fastJumpEvidenceResult(before, terminal, terminal, telemetry, { pass: false }).pass, false);
});

test("native scrollbar landing permits platform track geometry without accepting a partial or reversed gesture", () => {
  const windowsChromeLanding = scrollbarLandingResult(2_112, 5_062, 5_170);
  assert.equal(windowsChromeLanding.pass, true);
  assert.equal(windowsChromeLanding.landingDelta, 108);
  assert.equal(scrollbarLandingResult(2_112, 5_062, 3_000).pass, false);
  assert.equal(scrollbarLandingResult(2_112, 5_062, 1_900).pass, false);
  assert.equal(scrollbarLandingResult(2_112, 2_120, 2_120).pass, false);
});

test("native touch travel compensates Chrome touch-slop while retaining an exact landing gate", () => {
  assert.equal(compensatedTouchDistance(15, 405), 30);
  assert.equal(compensatedTouchDistance(-15, 405), -30);
  assert.equal(compensatedTouchDistance(500, 405), 405);
  assert.equal(compensatedTouchDistance(-500, 405), -405);
  assert.equal(compensatedTouchDistance(0, 405), 0);
  assert.throws(() => compensatedTouchDistance(15, 15), /usable travel/);
});

test("settled ENTRY address uses the exact runway endpoint rather than the first pixel rounded to F540", () => {
  assert.equal(settledScrollY({ geometry: { shellTop: 0, extent: 6_075 } }), 6_075);
  assert.equal(settledScrollY({ geometry: { shellTop: 120, extent: 6_075 } }), 6_195);
  assert.throws(() => settledScrollY({ geometry: { shellTop: 0, extent: 0 } }), /finite positive/);
});

test("real 404 console allowance is bound to one exact main-document URL", () => {
  const target = "https://preview.example/__phase5a-real-404-probe__/";
  const deployedSignal = { text: "Failed to load resource: the server responded with a status of 404 ()", url: target, lineNumber: 0, columnNumber: 0 };
  const localSignal = { ...deployedSignal, text: "Failed to load resource: the server responded with a status of 404 (Not Found)" };
  assert.equal(REAL_404_ROUTE, "/__phase5a-real-404-probe__/");
  assert.equal(expectedDocument404ConsoleResult([], target).pass, true);
  assert.equal(expectedDocument404ConsoleResult([deployedSignal], target).pass, true);
  assert.equal(expectedDocument404ConsoleResult([localSignal], target).pass, true);
  assert.equal(expectedDocument404ConsoleResult([deployedSignal, localSignal], target).pass, false);
  assert.equal(expectedDocument404ConsoleResult([{ ...deployedSignal, url: "https://preview.example/missing.js" }], target).pass, false);
});

test("recording validator requires full H.264/yuv420p/30fps silent viewport contract", () => {
  const probe = { formatName: "mov,mp4,m4a,3gp,3g2,mj2", durationSeconds: 4, codec: "h264", pixelFormat: "yuv420p", width: 1440, height: 900, averageFrameRate: "30/1", realFrameRate: "30/1", frameCount: 120, videoStreams: 1, audioStreams: 0, otherStreams: 0 };
  assert.equal(normalizedRecordingResult(probe, { width: 1440, height: 900 }, 3.4).pass, true);
  assert.equal(normalizedRecordingResult({ ...probe, codec: "vp9" }, { width: 1440, height: 900 }, 3.4).pass, false);
  assert.equal(normalizedRecordingResult({ ...probe, audioStreams: 1 }, { width: 1440, height: 900 }, 3.4).pass, false);
  assert.equal(normalizedRecordingResult({ ...probe, averageFrameRate: "30000/1001" }, { width: 1440, height: 900 }, 3.4).pass, false);
  assert.equal(recordingDurationResult({ frameCount: 2, durationSeconds: 2 / 30 }, 3.4).pass, false);
});

test("deployment report binds SHA, branch, both URLs, main, manifest, and Phase 5B denial", () => {
  const options = validOptions();
  const bytes = Buffer.from("manifest");
  const report = {
    schema: "quantum-hub.phase-5a.deployment.v1",
    status: "PASS",
    repository: { head: options.expectedHead, branch: REQUIRED_BRANCH, main: { head: MAIN_SHA } },
    deployment: { expectedHead: options.expectedHead, immutableUrl: options.url, branchUrl: options.branchUrl },
    cloudflare: { commitHash: options.expectedHead, branch: REQUIRED_BRANCH, deploymentUrl: options.url, deploymentId: options.expectedDeploymentId, project: options.deploymentProject, environment: "preview", terminalStage: { name: "deploy", status: "success", endedOn: "2026-08-28T00:00:00.000Z" } },
    github: { checkRun: { id: options.deploymentCheckRunId, status: "completed", conclusion: "success", headSha: options.expectedHead } },
    productionManifest: { sourceBlendSha256: SOURCE_BLEND_SHA256, sha256: options.expectedManifestSha256, bytes: bytes.length },
    humanReviewGates: HUMAN_GATES,
    authorization: { humanAccepted: false, mainMerged: false, phase5BAuthorized: false },
  };
  assert.equal(validateDeploymentReportData(report, options, bytes).status, "PASS");
  assert.throws(() => validateDeploymentReportData({ ...structuredClone(report), authorization: { humanAccepted: false, mainMerged: false, phase5BAuthorized: true } }, options, bytes));
  assert.throws(() => validateDeploymentReportData({ ...structuredClone(report), repository: { ...report.repository, head: "c".repeat(40) } }, options, bytes));
});

test("fresh output guard rejects repository, temporary, and existing directories", async () => {
  await assert.rejects(validateFreshExternalOutputPath(path.join(ROOT, "artifacts", "phase5a-forbidden")), /durable external|repository/);
  await assert.rejects(validateFreshExternalOutputPath(path.join(os.tmpdir(), "phase5a-forbidden-output")), /durable external/);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase5a-existing-"));
  try { await assert.rejects(validateFreshExternalOutputPath(temporary), /must not already exist/); }
  finally { await rm(temporary, { recursive: true, force: true }); }
});

test("capture source is isolated from Phase 4 history and writes raw media only under explicit output", async () => {
  const [source, contract] = await Promise.all([readFile(SCRIPT, "utf8"), readFile(CONTRACT, "utf8")]);
  assert.doesNotMatch(source, /capture-phase4r2-1-browser-evidence|phase4r2-1-evidence-contract/);
  assert.doesNotMatch(source, /mkdtemp\(|artifacts\/evidence\/phase-5a/);
  assert.match(source, /recordVideo/);
  assert.match(source, /libx264/);
  assert.match(source, /full-decode browser recording/);
  assert.match(source, /nativeWheelTo/);
  assert.match(source, /nativeTouchTo/);
  assert.match(source, /nativeKeyboardTo/);
  assert.match(source, /dragScrollbarTo/);
  assert.match(source, /ignoreDefaultArgs:\s*\["--hide-scrollbars"\]/);
  assert.match(source, /"first-scroll-before"[^\n]+, null\);/);
  assert.match(source, /"first-scroll-after"[^\n]+, null\);/);
  assert.match(source, /cinematicVideoElements:\s*document\.querySelectorAll\("\[data-cinematic-media\]"\)\.length/);
  assert.match(source, /const mediaRequests = diagnostics\.requests\.filter\(\(item\) => MEDIA_PATTERN\.test\(item\.path\)\);/);
  assert.match(source, /if \(!document\.documentElement\) return false;/);
  assert.match(source, /new MutationObserver/);
  assert.match(source, /setProperty\("font-size",\s*"32px",\s*"important"\)/);
  assert.match(source, /intentionalStaticFallback/);
  assert.match(source, /\.raw-recordings/);
  assert.match(contract, /phase-5a\.scroll-crt-browser-evidence/);
  assert.doesNotMatch(source, /https:\/\/[a-z0-9-]+\.pages\.dev\//i);
});

test("CLI self-test launches no browser, performs no network, and writes nothing", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, "--self-test"], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(stderr, "");
  const result = JSON.parse(stdout);
  assert.equal(result.schema, `${SCHEMA}.self-test`);
  assert.equal(result.status, "PASS");
  assert.equal(result.browserLaunched, false);
  assert.equal(result.networkRequestsPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("CLI dry-run binds real manifest and fixture deployment without browser/network/output writes", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase5a-dry-run-"));
  const deploymentPath = path.join(temporary, "deployment.json");
  const manifestBytes = await readFile(ACTIVE_MANIFEST);
  const manifestHash = sha256(manifestBytes);
  const expectedHead = "d".repeat(40);
  const immutableUrl = "https://immutable.example.test/";
  const branchUrl = "https://branch.example.test/";
  const report = {
    schema: "quantum-hub.phase-5a.deployment.v1",
    status: "PASS",
    repository: { head: expectedHead, branch: REQUIRED_BRANCH, main: { head: MAIN_SHA } },
    deployment: { expectedHead, immutableUrl, branchUrl },
    cloudflare: { commitHash: expectedHead, branch: REQUIRED_BRANCH, deploymentUrl: immutableUrl, deploymentId: "12345678-1234-1234-1234-1234567890ab", project: "qsite1", environment: "preview", terminalStage: { name: "deploy", status: "success", endedOn: "2026-08-28T00:00:00.000Z" } },
    github: { checkRun: { id: "123456789", status: "completed", conclusion: "success", headSha: expectedHead } },
    productionManifest: { sourceBlendSha256: SOURCE_BLEND_SHA256, sha256: manifestHash, bytes: manifestBytes.length },
    humanReviewGates: HUMAN_GATES,
    authorization: { humanAccepted: false, mainMerged: false, phase5BAuthorized: false },
  };
  await writeFile(deploymentPath, `${JSON.stringify(report)}\n`, { flag: "wx" });
  const output = path.resolve(ROOT, "..", `phase5a-dry-run-never-written-${process.pid}-${Date.now()}`);
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      SCRIPT,
      "--dry-run",
      "--immutable-url", immutableUrl,
      "--branch-url", branchUrl,
      "--expected-head", expectedHead,
      "--expected-deployment-id", "12345678-1234-1234-1234-1234567890ab",
      "--deployment-project", "qsite1",
      "--deployment-check-run-id", "123456789",
      "--manifest", ACTIVE_MANIFEST,
      "--expected-manifest-sha256", manifestHash,
      "--deployment-report", deploymentPath,
      "--output", output,
    ], { cwd: ROOT, encoding: "utf8", windowsHide: true });
    assert.equal(stderr, "");
    const result = JSON.parse(stdout);
    assert.equal(result.status, "PASS");
    assert.equal(result.browserLaunched, false);
    assert.equal(result.networkRequestsPerformed, false);
    assert.equal(result.writesPerformed, false);
    await assert.rejects(stat(output), { code: "ENOENT" });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("fixed ancestry and authorization authorities remain explicit", () => {
  assert.equal(ACCEPTED_PHASE4_SHA, "47a6f3cc7f464b09c9c143cac273c2a1f5a35bfa");
  assert.equal(MAIN_SHA, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(REQUIRED_BRANCH, "feature/phase-5a-scroll-crt-route-preproduction");
  assert.ok(Object.values(HUMAN_GATES).every((value) => value === "PENDING HUMAN REVIEW"));
});
