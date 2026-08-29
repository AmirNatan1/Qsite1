import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ACCEPTED_PHASE5A_SHA,
  ACTIVE_MEDIA_MANIFEST_SHA256,
  AUTHORIZATION,
  HEADLESS_LOAD_LONG_TASK_LIMITATION_MS,
  HOLD_MILLISECONDS,
  MAIN_SHA,
  MANIFESTO_TEXT,
  MANIFEST_URL_PATH,
  PROOF_STATES,
  RECORDINGS,
  REPORT_SCHEMAS,
  REQUIRED_BRANCH,
  REVIEW_GATES,
  SCHEMA,
  SHEETS,
  SOURCE_BLEND_SHA256,
  VIEWPOINTS,
  addressesForGeometry,
  assertInventoryContract,
  chromeBoundaryResult,
  effectiveVisibilityResult,
  manifestoHoldResult,
  manifestoScrollPresenceResult,
  manifestoTopBandForView,
  normalizePreviewUrl,
  normalizedRecordingResult,
  sha256,
  stableJson,
} from "../scripts/phase5ar-evidence-contract.mjs";
import {
  auditArtifactRecords,
  conventionalSkipLinkResult,
  enhancedReadinessResult,
  parseArguments,
  serverRenderedH1Text,
  unexpectedRequestFailures,
  validateDeploymentReportData,
  validateFreshExternalOutputPath,
  validateOptions,
} from "../scripts/capture-phase5ar-manifesto-evidence.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "capture-phase5ar-manifesto-evidence.mjs");
const CONTRACT = path.join(ROOT, "scripts", "phase5ar-evidence-contract.mjs");
const ACTIVE_MANIFEST = path.join(ROOT, "artifacts", "original", "phase-4r2-1-causal-signal-scroll-stability", "production", "manifests", "phase-4r2-production-media-manifest.json");
const EXPECTED_HEAD = "e".repeat(40);
const DEPLOYMENT_ID = "11111111-2222-4333-8444-555555555555";
const IMMUTABLE_URL = "https://11111111.qsite1.pages.dev/";
const BRANCH_URL = "https://codex-phase-5a-r.qsite1.pages.dev/";
const CHECK_RUN_ID = "123456789";

test("server-rendered manifesto text is read through its nested semantic spans", () => {
  const html = '<main><h1 id="home-title"><span>We turn</span> <span>industrial needs</span> <span>into field</span> <span>evidence.</span></h1></main>';
  assert.equal(serverRenderedH1Text(html), MANIFESTO_TEXT);
  assert.equal(serverRenderedH1Text(`${html}<h1>Duplicate</h1>`), null);
  assert.equal(serverRenderedH1Text("<main>No heading</main>"), null);
});

test("diagnostics allow only the intentional skip link and internal Pages media-blob abort", () => {
  const skip = { tag: "A", id: null, className: "skip-link", href: "#entry", text: "Skip cinematic intro" };
  assert.equal(conventionalSkipLinkResult([skip]).pass, true);
  assert.equal(conventionalSkipLinkResult([]).pass, false);
  assert.equal(conventionalSkipLinkResult([skip, { ...skip, text: "Hidden action" }]).pass, false);
  const expected = { url: "blob:https://a98cb308.qsite1.pages.dev/11111111-2222-4333-8444-555555555555", resourceType: "media", error: "net::ERR_ABORTED" };
  assert.deepEqual(unexpectedRequestFailures({ requestFailures: [expected] }), []);
  for (const failure of [
    { ...expected, url: "https://a98cb308.qsite1.pages.dev/site.css" },
    { ...expected, resourceType: "script" },
    { ...expected, error: "net::ERR_FAILED" },
    { ...expected, url: "blob:https://example.com/11111111-2222-4333-8444-555555555555" },
  ]) assert.equal(unexpectedRequestFailures({ requestFailures: [failure] }).length, 1);
});

test("enhanced readiness rejects terminal typography and media fallbacks without accepting pending state", () => {
  assert.deepEqual(enhancedReadinessResult({ mode: "candidate", mediaReady: false, mediaState: "loading" }), {
    ready: false, terminalFailure: false, pending: true, mode: "candidate", mediaReady: false, mediaState: "loading", fallback: null,
  });
  assert.equal(enhancedReadinessResult({ mode: "enhanced", mediaReady: true, mediaState: "ready" }).ready, true);
  assert.equal(enhancedReadinessResult({ mode: "static", mediaReady: false, mediaState: "failed", fallback: "typography-fit" }).terminalFailure, true);
  assert.equal(enhancedReadinessResult({ mode: "enhanced", mediaReady: false, mediaState: "failed-preserve-runway", fallback: "typography-fit" }).terminalFailure, true);
});

function validOptions(overrides = {}) {
  return {
    url: IMMUTABLE_URL,
    branchUrl: BRANCH_URL,
    expectedHead: EXPECTED_HEAD,
    expectedBranch: REQUIRED_BRANCH,
    expectedDeploymentId: DEPLOYMENT_ID,
    deploymentProject: "qsite1",
    deploymentCheckRunId: CHECK_RUN_ID,
    deploymentReport: path.resolve(ROOT, "..", "phase5ar-deployment-report.json"),
    manifest: ACTIVE_MANIFEST,
    expectedManifestSha256: ACTIVE_MEDIA_MANIFEST_SHA256,
    manifestUrlPath: MANIFEST_URL_PATH,
    output: path.resolve(ROOT, "..", "phase5ar-evidence-never-created"),
    chromium: null,
    ffmpeg: path.resolve(ROOT, "..", "ffmpeg"),
    ffprobe: path.resolve(ROOT, "..", "ffprobe"),
    timeoutMs: 30_000,
    dryRun: false,
    selfTest: false,
    help: false,
    ...overrides,
  };
}

function deploymentFixture(manifestBytes, options = validOptions()) {
  return {
    schema: "quantum-hub.phase-5a-r.deployment-verification.v1",
    status: "PASS",
    generatedAt: "2026-08-29T00:00:00.000Z",
    git: {
      head: options.expectedHead,
      parent: ACCEPTED_PHASE5A_SHA,
      localMain: MAIN_SHA,
      upstreamMain: MAIN_SHA,
      upstreamBranch: options.expectedHead,
      liveBranch: options.expectedHead,
      liveMain: MAIN_SHA,
      cleanTree: true,
    },
    deployment: {
      provider: "Cloudflare Pages",
      project: options.deploymentProject,
      environment: "preview",
      deploymentId: options.expectedDeploymentId,
      exactSha: options.expectedHead,
      branch: options.expectedBranch,
      immutableUrl: options.url,
      branchUrl: options.branchUrl,
      githubCheck: { id: String(options.deploymentCheckRunId), status: "completed", conclusion: "success", headSha: options.expectedHead },
    },
    dist: {
      files: [{
        relativePath: "media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json",
        bytes: manifestBytes.length,
        sha256: options.expectedManifestSha256,
      }],
    },
    checks: { mainFrozen: true, localUpstreamLiveParity: true, immutableByteParity: true, branchByteParity: true },
    authorization: { humanAccepted: false, mainMerged: false, phase5BAuthorized: false },
  };
}

test("Phase 5A-R evidence contract fixes the focused review inventory and pending decisions", () => {
  assert.equal(assertInventoryContract(), true);
  assert.equal(ACCEPTED_PHASE5A_SHA, "799ee284355f161e06404919d5022cd051165bf5");
  assert.equal(MAIN_SHA, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(REQUIRED_BRANCH, "codex/phase-5a-r-manifesto-route-identity-repair");
  assert.equal(MANIFESTO_TEXT, "We turn industrial needs into field evidence.");
  assert.equal(HEADLESS_LOAD_LONG_TASK_LIMITATION_MS, 203);
  assert.equal(HOLD_MILLISECONDS, 1_400);
  assert.deepEqual(VIEWPOINTS.map(({ width, height }) => `${width}x${height}`), [
    "1440x900", "1366x650", "1280x800", "1024x768", "768x1024", "390x844", "360x800",
    "320x800", "844x390", "740x360", "800x360", "896x414", "900x480",
  ]);
  assert.deepEqual(RECORDINGS.map(({ direction, relativePath }) => [direction, relativePath]), [
    ["forward", "recordings/01-forward-manifesto.mp4"],
    ["reverse", "recordings/02-reverse-manifesto.mp4"],
  ]);
  assert.equal(PROOF_STATES.length, 15);
  assert.deepEqual(SHEETS.flatMap(({ stateIds }) => stateIds), PROOF_STATES.map(({ id }) => id));
  assert.equal(SHEETS.length, 4);
  assert.equal(Object.keys(REPORT_SCHEMAS).length, 6);
  assert.equal(new Set(Object.values(REPORT_SCHEMAS)).size, 6);
  assert.equal(Object.keys(REVIEW_GATES).length, 7);
  assert.ok(Object.values(REVIEW_GATES).every((value) => value === "PENDING HUMAN REVIEW"));
  assert.deepEqual(AUTHORIZATION, { humanAccepted: false, mainMerged: false, phase5BAuthorized: false });
});

test("desktop scroll addresses preserve the accepted CRT anchors and exact chrome boundary", () => {
  const addresses = addressesForGeometry({
    shellTop: 0.015625,
    travel: 6_075,
    audienceTop: 7_605,
    builtTop: 8_614,
    maxScrollY: 20_896,
  }, VIEWPOINTS[0]);
  assert.deepEqual(addresses, {
    top: 0,
    firstPositive: 15,
    arrival: 2_403,
    stableQ: 3_110,
    threshold: 5_374,
    revealStart: 5_602,
    firstReadable: 5_839,
    settled: 6_075,
    preRelease: 6_704,
    release: 6_705,
    audienceVisible: 6_706,
    builtVisible: 7_715,
  });
  const geometry = { shellTop: 0.015625, travel: 6_075, audienceTop: 7_605 };
  assert.deepEqual(manifestoScrollPresenceResult(addresses, VIEWPOINTS[0], geometry), {
    observedSettledY: 6_075.015625,
    observedReleaseY: 6_705,
    distancePixels: 629.984375,
    addressedDistancePixels: 630,
    viewportHeights: 0.6999826388888889,
    targetViewportHeights: [0.6, 0.9],
    checks: { finiteAddresses: true, integerAddressAgreement: true, positiveDistance: true, usefulPresenceTarget: true },
    pass: true,
  });
  assert.equal(manifestoScrollPresenceResult({ settled: 100, release: 500 }, { height: 1_000 }).pass, false);
  assert.deepEqual(manifestoTopBandForView({ family: "desktop" }), [8, 12]);
  assert.deepEqual(manifestoTopBandForView({ family: "portrait" }), [8, 11]);
  assert.deepEqual(manifestoTopBandForView({ family: "landscape" }), [6, 9]);
  assert.throws(() => addressesForGeometry({ travel: 0 }, VIEWPOINTS[0]), /finite positive/);
});

test("effective visibility multiplies the entire ancestor chain instead of trusting the child rectangle", () => {
  const rect = { top: 90, bottom: 220, left: 40, right: 900 };
  const viewport = { width: 1_440, height: 900 };
  const visible = effectiveVisibilityResult({ rect, viewport, ancestors: [
    { display: "block", visibility: "visible", opacity: 1 },
    { display: "block", visibility: "visible", opacity: 0.8 },
  ] });
  const invisibleParent = effectiveVisibilityResult({ rect, viewport, ancestors: [
    { display: "block", visibility: "visible", opacity: 1 },
    { display: "block", visibility: "visible", opacity: 0 },
  ] });
  assert.equal(visible.pass, true);
  assert.equal(visible.effectiveOpacity, 0.8);
  assert.equal(invisibleParent.pass, false);
  assert.equal(invisibleParent.checks.nonZeroOpacity, false);
  assert.equal(effectiveVisibilityResult({ rect, viewport, ancestors: [{ display: "none", visibility: "visible", opacity: 1 }] }).pass, false);
  assert.equal(effectiveVisibilityResult({ rect, viewport, ancestors: [{ display: "block", visibility: "hidden", opacity: 1 }] }).pass, false);
  assert.equal(effectiveVisibilityResult({ rect: { ...rect, top: 901, bottom: 1_000 }, viewport, ancestors: [{ display: "block", visibility: "visible", opacity: 1 }] }).pass, false);
  assert.equal(effectiveVisibilityResult({ rect, viewport, ancestors: [{ display: "block", visibility: "visible", opacity: 0.1 }, { display: "block", visibility: "visible", opacity: 0.1 }] }).pass, false);
});

test("manifesto hold rejects autonomous scroll, frame, decoder, semantic, chrome, and playback movement", () => {
  const telemetry = { playCalls: 0, playEvents: 0, playingEvents: 0 };
  const before = {
    scrollY: 6_075,
    targetFrame: 500,
    presentedFrame: 500,
    currentTime: 499 / 30,
    semanticProgress: 1,
    manifestoSettled: true,
    headerState: "concealed",
    telemetry,
  };
  const after = structuredClone(before);
  assert.equal(manifestoHoldResult(before, after, HOLD_MILLISECONDS).pass, true);
  for (const mutation of [
    { scrollY: 6_076 },
    { targetFrame: 499 },
    { presentedFrame: 499 },
    { currentTime: before.currentTime + 0.01 },
    { semanticProgress: 0.99 },
    { manifestoSettled: false },
    { headerState: "released" },
    { telemetry: { ...telemetry, playCalls: 1 } },
  ]) assert.equal(manifestoHoldResult(before, { ...after, ...mutation }, HOLD_MILLISECONDS).pass, false);
  assert.equal(manifestoHoldResult(before, after, HOLD_MILLISECONDS - 1).pass, false);
});

test("chrome releases at the audience edge and reverses one pixel back into concealment", () => {
  const preRelease = { scrollY: 6_704, headerState: "concealed", navigationReleased: false, audienceInert: true };
  const release = { scrollY: 6_705, headerState: "released", navigationReleased: true, audienceInert: false, audienceIntersects: false };
  const visible = { scrollY: 6_706, audienceIntersects: true };
  const valid = chromeBoundaryResult(preRelease, release, visible, { ...preRelease });
  assert.equal(valid.pass, true);
  assert.equal(chromeBoundaryResult(preRelease, { ...release, audienceIntersects: true }, visible, { ...preRelease }).pass, false);
  assert.equal(chromeBoundaryResult(preRelease, release, visible, { ...preRelease, headerState: "released" }).pass, false);
});

test("recordings must be silent H.264/yuv420p MP4 at exact viewport and constant 30 fps", () => {
  const probe = {
    formatName: "mov,mp4,m4a,3gp,3g2,mj2",
    durationSeconds: 6,
    codec: "h264",
    pixelFormat: "yuv420p",
    width: 1_440,
    height: 900,
    averageFrameRate: "30/1",
    realFrameRate: "30/1",
    frameCount: 180,
    videoStreams: 1,
    audioStreams: 0,
    otherStreams: 0,
  };
  assert.equal(normalizedRecordingResult(probe, VIEWPOINTS[0], 5).pass, true);
  for (const mutation of [
    { codec: "vp9" }, { pixelFormat: "yuv444p" }, { width: 1_280 }, { averageFrameRate: "30000/1001" },
    { audioStreams: 1 }, { videoStreams: 2 }, { durationSeconds: 2, frameCount: 60 },
  ]) assert.equal(normalizedRecordingResult({ ...probe, ...mutation }, VIEWPOINTS[0], 5).pass, false);
});

test("argument and URL validation bind one exact Pages deployment, branch, manifest, and external output intent", () => {
  const parsed = parseArguments([
    "--dry-run",
    "--immutable-url", IMMUTABLE_URL,
    "--branch-url", BRANCH_URL,
    "--expected-head", EXPECTED_HEAD,
    "--expected-branch", REQUIRED_BRANCH,
    "--expected-deployment-id", DEPLOYMENT_ID,
    "--deployment-project", "qsite1",
    "--deployment-check-run-id", CHECK_RUN_ID,
    "--deployment-report", path.join(os.tmpdir(), "phase5ar-deployment-fixture.json"),
    "--manifest", ACTIVE_MANIFEST,
    "--expected-manifest-sha256", ACTIVE_MEDIA_MANIFEST_SHA256,
    "--output", path.resolve(ROOT, "..", "phase5ar-dry-run-output"),
  ]);
  assert.equal(validateOptions(parsed), parsed);
  assert.equal(normalizePreviewUrl(IMMUTABLE_URL), IMMUTABLE_URL);
  for (const invalid of [
    "http://11111111.qsite1.pages.dev/",
    "https://qsite1.pages.dev/",
    "https://user:pass@11111111.qsite1.pages.dev/",
    "https://11111111.qsite1.pages.dev/path",
    "https://11111111.qsite1.pages.dev/?token=secret",
    "https://example.com/",
  ]) assert.throws(() => normalizePreviewUrl(invalid));
  assert.throws(() => validateOptions(validOptions({ expectedHead: ACCEPTED_PHASE5A_SHA })), /new 40-character/);
  assert.throws(() => validateOptions(validOptions({ expectedBranch: "main" })), /expected-branch/);
  assert.throws(() => validateOptions(validOptions({ url: "https://22222222.qsite1.pages.dev/" })), /prefix/);
  assert.throws(() => validateOptions(validOptions({ branchUrl: IMMUTABLE_URL })), /must differ/);
  assert.throws(() => validateOptions(validOptions({ deploymentReport: path.join(ROOT, "deployment.json") })), /external durable/);
  assert.throws(() => validateOptions(validOptions({ deploymentCheckRunId: "0" })), /positive numeric/);
  assert.throws(() => validateOptions(validOptions({ output: path.join(ROOT, "artifacts", "forbidden") })), /durable external/);
  assert.throws(() => validateOptions(validOptions({ output: path.join(os.tmpdir(), "forbidden") })), /durable external/);
  assert.throws(() => validateOptions(validOptions({ ffmpeg: null, ffprobe: null })), /FFmpeg/);
  assert.throws(() => parseArguments(["--unknown"]), /Unknown option/);
});

test("deployment report binds Git, Cloudflare, GitHub check, both origins, active manifest, and Phase 5B denial", () => {
  const manifestBytes = Buffer.alloc(14_889);
  const options = validOptions();
  const report = deploymentFixture(manifestBytes, options);
  const result = validateDeploymentReportData(report, options, manifestBytes);
  assert.equal(result.status, "PASS");
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.sha256, sha256(Buffer.from(stableJson(report))));
  assert.throws(() => validateDeploymentReportData({ ...structuredClone(report), authorization: { humanAccepted: false, mainMerged: false, phase5BAuthorized: true } }, options, manifestBytes), /binding differs/);
  assert.throws(() => validateDeploymentReportData({ ...structuredClone(report), authorization: { humanAccepted: false, mainMerged: true, phase5BAuthorized: false } }, options, manifestBytes), /binding differs/);
  assert.throws(() => validateDeploymentReportData(report, { ...options, expectedHead: "f".repeat(40) }, manifestBytes), /binding differs/);
  assert.throws(() => validateDeploymentReportData(report, { ...options, deploymentCheckRunId: "987654321" }, manifestBytes), /binding differs/);
});

test("published payload audit re-reads bytes, recomputes hashes, and rejects mismatch or traversal", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase5ar-read-back-"));
  const payload = Buffer.from("phase-5a-r-evidence\n");
  const record = { relativePath: "payload.bin", bytes: payload.length, sha256: sha256(payload) };
  try {
    await writeFile(path.join(temporary, record.relativePath), payload, { flag: "wx" });
    const audit = await auditArtifactRecords(temporary, [record]);
    assert.deepEqual(audit, { status: "PASS", files: 1, bytes: payload.length, records: [record] });
    await assert.rejects(auditArtifactRecords(temporary, [{ ...record, bytes: record.bytes + 1 }]), /read-back differs/);
    await assert.rejects(auditArtifactRecords(temporary, [{ ...record, sha256: "0".repeat(64) }]), /read-back differs/);
    await assert.rejects(auditArtifactRecords(temporary, [{ ...record, relativePath: "../escape.bin" }]), /unsafe or duplicate/);
    await assert.rejects(auditArtifactRecords(temporary, [record, record]), /unsafe or duplicate/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("fresh output guard rejects repository, temporary, existing, and ambiguous destinations", async () => {
  await assert.rejects(validateFreshExternalOutputPath(path.join(ROOT, "artifacts", "phase5ar-forbidden")), /outside repository|repository/);
  await assert.rejects(validateFreshExternalOutputPath(path.join(os.tmpdir(), "phase5ar-forbidden")), /temporary roots/);
  await assert.rejects(validateFreshExternalOutputPath(path.dirname(ROOT)), /must not already exist/);
  const candidate = path.resolve(ROOT, "..", `phase5ar-fresh-${process.pid}-${Date.now()}`);
  assert.equal(await validateFreshExternalOutputPath(candidate), candidate);
  await assert.rejects(stat(candidate), { code: "ENOENT" });
});

test("capture source keeps the amendment compact, wheel-driven, ancestor-aware, normalized, and self-hashed", async () => {
  const [source, contract] = await Promise.all([readFile(SCRIPT, "utf8"), readFile(CONTRACT, "utf8")]);
  assert.match(source, /recordVideo/);
  assert.match(source, /page\.mouse\.wheel/);
  assert.match(source, /nativeWheelOnly/);
  assert.match(source, /state\.control === "scroll-addressed"/);
  assert.match(source, /state\.telemetry\.seekingEvents >= 1/);
  assert.match(source, /libx264/);
  assert.match(source, /yuv420p/);
  assert.match(source, /full-decode manifesto recording/);
  assert.match(source, /\.raw-recordings/);
  assert.match(source, /await rm\(rawRoot, \{ recursive: true, force: true \}\)/);
  assert.match(source, /for \(let cursor = element; cursor && cursor instanceof Element; cursor = cursor\.parentElement\)/);
  assert.match(source, /item\.tabIndex >= 0/);
  assert.match(source, /effectiveVisibilityResult/);
  assert.match(source, /timedHoldImplemented:\s*false/);
  assert.match(source, /passiveHoldObservationOnly:\s*true/);
  assert.match(source, /priorCheckpointObservedHeadlessLoadLimitationMs:\s*HEADLESS_LOAD_LONG_TASK_LIMITATION_MS/);
  assert.match(source, /everyNonSelfPayloadHasSha256/);
  assert.match(source, /independentPayloadReadBackAudit/);
  assert.match(source, /manifestHashReturnedByCaptureResult:\s*true/);
  assert.match(source, /for \(const view of VIEWPOINTS\)[\s\S]*browser = await launchEvidenceBrowser\(options\);[\s\S]*captureResponsiveView/);
  assert.match(source, /captureResponsiveView[\s\S]*nativeWheelTo\(page, addresses\.settled, options\.timeoutMs\);\s*await waitAddressed\(page, PHYSICAL_FRAME_COUNT, options\.timeoutMs\);\s*const state = await runtimeState/);
  assert.match(source, /captureStaticState[\s\S]*if \(kind !== "no-javascript"\) await twoFrames\(page\)/);
  assert.match(source, /captureStaticState[\s\S]*const waitUntil = kind === "fallback-font" \? "domcontentloaded" : "networkidle";[\s\S]*page\.goto\(options\.url, \{ waitUntil,/);
  assert.match(source, /captureStaticState[\s\S]*if \(kind === "fallback-font"\) await waitEnhanced\(page, options\.timeoutMs\);[\s\S]*const expectVideo = kind === "fallback-font";/);
  assert.match(source, /captureStaticState[\s\S]*navigationUsableInStaticFlow: expectVideo \|\|[\s\S]*enhancedManifestoThreshold: !expectVideo \|\| \([\s\S]*state\.manifestoSettled === true[\s\S]*state\.navigationReleased === false[\s\S]*state\.interactive === "manifesto"/);
  assert.match(source, /captureStaticState[\s\S]*nativeWheelTo\(page, target, options\.timeoutMs, \{ animationFrames: kind !== "no-javascript" \}\)/);
  assert.match(source, /waitAfterInput\(page, \{ animationFrames = true \} = \{\}\)[\s\S]*if \(animationFrames\) await twoFrames\(page\)/);
  assert.match(source, /oldWhereDoYouEnterRole/);
  assert.match(source, /reportsIncludingSelf:\s*7/);
  assert.match(contract, /HEADLESS_LOAD_LONG_TASK_LIMITATION_MS\s*=\s*203/);
  assert.doesNotMatch(source, /https:\/\/[a-z0-9]{8}\.qsite1\.pages\.dev\//i);
  assert.doesNotMatch(source, /capture-phase4r2-1-browser-evidence|phase4r2-1-evidence-contract/);
});

test("CLI self-test is pure, fast, and executable without browser, network, or writes", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, "--self-test"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });
  assert.equal(stderr, "");
  const result = JSON.parse(stdout);
  assert.equal(result.schema, `${SCHEMA}.self-test`);
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.inventories, { proofStates: 15, recordings: 2, reportsIncludingManifest: 7, sheets: 4, viewports: 13 });
  assert.equal(result.ancestorVisibility.hiddenAncestorRejected, true);
  assert.equal(result.disclosedHeadlessLoadLimitationMs, 203);
  assert.equal(result.browserLaunched, false);
  assert.equal(result.networkRequestsPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("CLI dry-run cross-validates real media authority and a deployment fixture without browser, network, or output writes", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase5ar-evidence-dry-run-"));
  const deploymentPath = path.join(temporary, "deployment.json");
  const manifestBytes = await readFile(ACTIVE_MANIFEST);
  assert.equal(sha256(manifestBytes), ACTIVE_MEDIA_MANIFEST_SHA256);
  const options = validOptions({ dryRun: true, deploymentReport: deploymentPath, ffmpeg: null, ffprobe: null });
  await writeFile(deploymentPath, stableJson(deploymentFixture(manifestBytes, options)), { flag: "wx" });
  const output = path.resolve(ROOT, "..", `phase5ar-dry-run-never-written-${process.pid}-${Date.now()}`);
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      SCRIPT,
      "--dry-run",
      "--immutable-url", options.url,
      "--branch-url", options.branchUrl,
      "--expected-head", options.expectedHead,
      "--expected-branch", options.expectedBranch,
      "--expected-deployment-id", options.expectedDeploymentId,
      "--deployment-project", options.deploymentProject,
      "--deployment-check-run-id", String(options.deploymentCheckRunId),
      "--deployment-report", deploymentPath,
      "--manifest", ACTIVE_MANIFEST,
      "--expected-manifest-sha256", ACTIVE_MEDIA_MANIFEST_SHA256,
      "--manifest-url-path", MANIFEST_URL_PATH,
      "--output", output,
    ], { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 10_000 });
    assert.equal(stderr, "");
    const result = JSON.parse(stdout);
    assert.equal(result.schema, `${SCHEMA}.dry-run`);
    assert.equal(result.status, "PASS");
    assert.equal(result.target.immutableUrl, IMMUTABLE_URL);
    assert.equal(result.target.branchUrl, BRANCH_URL);
    assert.equal(result.activeManifest.sha256, ACTIVE_MEDIA_MANIFEST_SHA256);
    assert.equal(result.activeManifest.sourceBlendSha256, SOURCE_BLEND_SHA256);
    assert.equal(result.browserLaunched, false);
    assert.equal(result.networkRequestsPerformed, false);
    assert.equal(result.writesPerformed, false);
    await assert.rejects(stat(output), { code: "ENOENT" });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
