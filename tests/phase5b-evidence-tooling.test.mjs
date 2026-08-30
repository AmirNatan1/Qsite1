import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  ACCEPTED_STORYBOARD_FILE_COUNT,
  CAPTURE_VIEWS,
  CP7_SCHEMA,
  CP8_SCHEMA,
  DEFAULT_FFMPEG,
  DEFAULT_FFPROBE,
  EXPECTED_ARTIFACT_PATHS,
  MOTION_ROUTE_IDS,
  RECORDING_VIEW,
  REPORT_PATH,
  REVIEW_TARGET_MAX_BYTES,
  ROUTES,
  SCHEMA,
  STORYBOARD_SCHEMA,
  expectedStoryboardFiles,
  homeRegressionResult,
  mediaPolicyResult,
  normalizeDeploymentUrl,
  parseArguments,
  recordingContractResult,
  validateArtifactLedger,
  validateCaptureReport,
  validateCp7ReportData,
  validateCp8ReportData,
  validateOptions,
  validateStoryboardManifestData,
} from "../scripts/capture-phase5b-deployed-evidence.mjs";
import {
  GOVERNED_MARADIN_MEDIA,
  GOVERNED_MARADIN_STILLS,
  PROOF_POSTER,
  SHARED_MEDIA_PATHS,
} from "../scripts/audit-phase5b-publication-media-performance.mjs";
import { PHASE5B_HUMAN_GATES } from "../scripts/phase5b-route-contract.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "capture-phase5b-deployed-evidence.mjs");
const EXPECTED_HEAD = "e".repeat(40);
const DEPLOYMENT_URL = "https://12345678.qsite1.pages.dev/";
const HASH = "a".repeat(64);

function storyboardFixture() {
  const artifacts = [];
  for (const route of ROUTES) {
    for (const filename of [
      "route-brief-delta.md",
      "desktop-storyboard--1440x900.png",
      "mobile-storyboard--390x844.png",
      "narrow-overture--320x800.png",
      "short-landscape-overture-sheet.png",
      "signature-states-sheet.png",
      "material-board.png",
    ]) artifacts.push({ relativePath: `routes/${route.id}/${filename}`, bytes: 1, sha256: HASH });
  }
  for (const filename of [
    "PHASE_5A_R_ROUTE_COHERENCE_MATRIX.md",
    "PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md",
    "all-routes-desktop-contact-sheet.png",
    "all-routes-mobile-contact-sheet.png",
    "all-routes-short-landscape-contact-sheet.png",
    "motion-comparison-board.png",
    "material-comparison-board.png",
  ]) artifacts.push({ relativePath: `cross-route-system/${filename}`, bytes: 1, sha256: HASH });
  return {
    schema: STORYBOARD_SCHEMA,
    status: "PASS",
    mode: "full",
    routes: ROUTES.map(({ id }) => id),
    artifacts,
    totals: { artifacts: 70, bytes: 70 },
    publicRoutesChanged: false,
    phase5BAuthorized: false,
    humanVisualJudgmentAuthoritative: true,
  };
}

function cp7Fixture() {
  const routeIds = ROUTES.map(({ id }) => id);
  return {
    schema: CP7_SCHEMA,
    status: "PASS",
    git: { head: "7".repeat(40) },
    routes: ROUTES.map(({ id }) => ({ id })),
    responsive: Array.from({ length: 117 }, (_, index) => ({ route: routeIds[index % 9], status: "PASS" })),
    variants: [{ id: "fixture", records: Array.from({ length: 54 }, (_, index) => ({ route: routeIds[index % 9], status: "PASS" })) }],
    axe: Array.from({ length: 18 }, (_, index) => ({ route: routeIds[index % 9], status: "PASS", violations: [] })),
    keyboard: Array.from({ length: 18 }, (_, index) => ({ route: routeIds[index % 9], status: "PASS" })),
    mobileNavigation: routeIds.map((route) => ({ route, status: "PASS" })),
    failures: [],
    summary: { failures: 0, seriousCriticalAxe: 0 },
  };
}

function cp8Fixture() {
  return {
    schema: CP8_SCHEMA,
    status: "PASS",
    git: { expectedHead: "8".repeat(40), observedHead: "8".repeat(40) },
    routes: ROUTES.map(({ id }) => ({ route: { id }, status: "PASS" })),
    failures: [],
    summary: { routeCount: 9, failures: 0, maximumScrollLongTaskMs: 0, phase4CinematicRequests: 0 },
  };
}

function request(pathname, resourceType = "image") {
  return { path: pathname, resourceType, url: `${DEPLOYMENT_URL.slice(0, -1)}${pathname}` };
}

test("CP9 topology is exact, compact and package-ready", () => {
  assert.equal(SCHEMA, "quantum-hub.phase-5b.deployed-browser-evidence.v1");
  assert.equal(ROUTES.length, 9);
  assert.deepEqual(ROUTES.map(({ id }) => id), ["for-industry", "for-startups", "industries", "proof", "maradin", "spark", "about", "contact", "404"]);
  assert.deepEqual(CAPTURE_VIEWS.map(({ id, width, height }) => ({ id, width, height })), [
    { id: "desktop", width: 1440, height: 900 },
    { id: "portrait", width: 390, height: 844 },
    { id: "narrow-320", width: 320, height: 800 },
    { id: "landscape-844", width: 844, height: 390 },
  ]);
  assert.deepEqual(MOTION_ROUTE_IDS, ["for-industry", "for-startups", "industries", "proof", "maradin", "spark", "about"]);
  assert.equal(EXPECTED_ARTIFACT_PATHS.length, 126);
  assert.equal(EXPECTED_ARTIFACT_PATHS.filter((value) => value.endsWith("route-recording.mp4")).length, 7);
  assert.ok(EXPECTED_ARTIFACT_PATHS.includes("cross-route/navigation-recording.mp4"));
  assert.deepEqual(EXPECTED_ARTIFACT_PATHS.filter((value) => value.startsWith("homepage/")), [
    "homepage/audience-split.png",
    "homepage/crt-startup.png",
    "homepage/current.png",
    "homepage/manifesto.png",
    "homepage/q.png",
    "homepage/regression.json",
  ]);
  assert.equal(EXPECTED_ARTIFACT_PATHS.some((value) => /webm|raw-recordings|raw.frames/i.test(value)), false);
  assert.equal(REPORT_PATH, "capture-report.json");
  assert.equal(REVIEW_TARGET_MAX_BYTES, 50 * 1024 * 1024);
});

test("CP9 CLI requires deployed authority and a disjoint fresh external output intent", () => {
  const external = path.resolve(ROOT, "..", "phase-5b-work", "cp9-tooling-fixture");
  const options = parseArguments([
    "--deployment-url", DEPLOYMENT_URL,
    "--expected-head", EXPECTED_HEAD,
    "--storyboard-root", path.join(external, "storyboards"),
    "--cp7-report", path.join(external, "cp7.json"),
    "--cp8-report", path.join(external, "cp8.json"),
    "--output", path.join(external, "output"),
    "--dry-run",
  ]);
  assert.equal(validateOptions(options), options);
  assert.equal(options.url, DEPLOYMENT_URL);
  assert.equal(options.ffmpeg, DEFAULT_FFMPEG);
  assert.equal(options.ffprobe, DEFAULT_FFPROBE);
  assert.equal(normalizeDeploymentUrl(DEPLOYMENT_URL), DEPLOYMENT_URL);
  assert.throws(() => normalizeDeploymentUrl("http://127.0.0.1:4338/"), /non-loopback HTTPS/);
  assert.throws(() => normalizeDeploymentUrl("https://qsite1.pages.dev/"), /preview origin/);
  assert.throws(() => validateOptions({ ...options, expectedHead: "short" }), /40-character/);
  assert.throws(() => validateOptions({ ...options, output: path.join(ROOT, "evidence") }), /outside the repository/);
  assert.throws(() => validateOptions({ ...options, output: path.join(options.storyboardRoot, "nested") }), /disjoint/);
});

test("CP9 validates the exact accepted Phase 5A-R 76-file storyboard authority", () => {
  const manifest = storyboardFixture();
  assert.equal(validateStoryboardManifestData(manifest), true);
  assert.equal(expectedStoryboardFiles(manifest).length, ACCEPTED_STORYBOARD_FILE_COUNT);
  assert.equal(new Set(expectedStoryboardFiles(manifest)).size, 76);
  assert.throws(() => validateStoryboardManifestData({ ...manifest, status: "SMOKE" }), /must be PASS/);
  assert.throws(() => validateStoryboardManifestData({ ...manifest, artifacts: manifest.artifacts.slice(1) }), /70 review artifacts/);
  const changed = structuredClone(manifest);
  changed.artifacts.find(({ relativePath }) => relativePath.includes("desktop-storyboard")).sha256 = "bad";
  assert.throws(() => validateStoryboardManifestData(changed), /invalid SHA-256/);
});

test("CP9 binds the complete PASS CP7 and CP8 report contracts", () => {
  const cp7 = cp7Fixture();
  const cp8 = cp8Fixture();
  assert.equal(validateCp7ReportData(cp7), true);
  assert.equal(validateCp8ReportData(cp8), true);
  assert.throws(() => validateCp7ReportData({ ...cp7, responsive: cp7.responsive.slice(1) }), /incomplete/);
  assert.throws(() => validateCp7ReportData({ ...cp7, summary: { ...cp7.summary, seriousCriticalAxe: 1 } }), /serious\/critical/);
  assert.throws(() => validateCp8ReportData({ ...cp8, git: { ...cp8.git, observedHead: "9".repeat(40) } }), /expected\/observed/);
  assert.throws(() => validateCp8ReportData({ ...cp8, summary: { ...cp8.summary, phase4CinematicRequests: 1 } }), /Phase 4 cinematic/);
});

test("CP9 deployed media policy permits shared assets, freezes Proof and keeps Maradin dormant", () => {
  const none = ROUTES.find(({ media }) => media === "none");
  assert.equal(mediaPolicyResult(none, SHARED_MEDIA_PATHS.map((value) => request(value)), { mediaReferences: [], activeDecoderCount: 0 }).status, "PASS");
  assert.equal(mediaPolicyResult(none, [request("/media/cinematic/phase-4r2/forbidden.mp4", "media")], { mediaReferences: [], activeDecoderCount: 0 }).status, "FAIL");
  const proof = ROUTES.find(({ id }) => id === "proof");
  assert.equal(mediaPolicyResult(proof, [request(PROOF_POSTER)], { mediaReferences: [PROOF_POSTER], activeDecoderCount: 0 }).status, "PASS");
  assert.equal(mediaPolicyResult(proof, [request(PROOF_POSTER), request(GOVERNED_MARADIN_STILLS[1])], { mediaReferences: [PROOF_POSTER], activeDecoderCount: 0 }).status, "FAIL");
  const maradin = ROUTES.find(({ id }) => id === "maradin");
  assert.equal(mediaPolicyResult(maradin, GOVERNED_MARADIN_STILLS.map((value) => request(value)), { mediaReferences: GOVERNED_MARADIN_MEDIA, activeDecoderCount: 0 }).status, "PASS");
  assert.equal(mediaPolicyResult(maradin, [...GOVERNED_MARADIN_STILLS.map((value) => request(value)), request("/media/maradin/maradin-field-aperture-approved.mp4", "media")], { mediaReferences: GOVERNED_MARADIN_MEDIA, activeDecoderCount: 1 }).status, "FAIL");
});

test("CP9 recording contract requires compact silent H.264/yuv420p constant-30 MP4", () => {
  const probe = {
    streams: [{ codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p", width: 1440, height: 900, avg_frame_rate: "30/1", r_frame_rate: "30/1" }],
    format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "4.2" },
  };
  assert.equal(recordingContractResult(probe, RECORDING_VIEW, { minimumSeconds: 2.4, maximumSeconds: 12 }).status, "PASS");
  for (const mutation of [
    { streams: [...probe.streams, { codec_type: "audio", codec_name: "aac" }] },
    { streams: [{ ...probe.streams[0], codec_name: "vp9" }] },
    { streams: [{ ...probe.streams[0], pix_fmt: "yuv444p" }] },
    { streams: [{ ...probe.streams[0], avg_frame_rate: "60/1" }] },
    { format: { ...probe.format, duration: "30" } },
  ]) assert.equal(recordingContractResult({ ...probe, ...mutation }, RECORDING_VIEW, { minimumSeconds: 2.4, maximumSeconds: 12 }).status, "FAIL");
});

test("CP9 compact Home regression includes CRT/current/Q, manifesto, audience and final-response Operating Field", () => {
  const states = {
    crtStartup: { mode: "enhanced", mediaReady: true, segment: "top-dormancy" },
    current: { targetFrame: 316, segment: "raster-expansion" },
    q: { targetFrame: 370, presentedFrame: 370 },
    manifesto: { manifestoSettled: true, semanticProgress: 1, manifestoText: "We turn industrial needs into field evidence.", navigationReleased: false },
    audience: { navigationReleased: true, audienceVisible: true, audienceLinks: ["/for-partners/", "/for-startups/"], wheelEvents: 9, programmaticScrollCalls: 0 },
    operatingField: { serverRendered: true, afterAudience: true, reachedByNativeScroll: true, h2: "Start with the operating reality.", acceptedText: true },
  };
  assert.equal(homeRegressionResult(states).status, "PASS");
  assert.equal(homeRegressionResult({ ...states, operatingField: { ...states.operatingField, afterAudience: false } }).status, "FAIL");
  assert.equal(homeRegressionResult({ ...states, q: { ...states.q, presentedFrame: 369 } }).status, "FAIL");
  assert.equal(homeRegressionResult({ ...states, audience: { ...states.audience, programmaticScrollCalls: 1 } }).status, "FAIL");
});

test("CP9 ledger and report are exact, self-excluding, private-path-free and human-pending", () => {
  const artifacts = EXPECTED_ARTIFACT_PATHS.map((relativePath) => ({ relativePath, bytes: 1, sha256: HASH }));
  assert.equal(validateArtifactLedger(artifacts), true);
  assert.throws(() => validateArtifactLedger(artifacts.slice(1)), /exactly 126/);
  assert.throws(() => validateArtifactLedger([...artifacts.slice(0, -1), { relativePath: "raw-recordings/capture.webm", bytes: 1, sha256: HASH }]), /paths differ|forbidden raw/);
  const report = {
    schema: SCHEMA,
    status: "PASS",
    target: { deploymentUrl: DEPLOYMENT_URL, expectedHead: EXPECTED_HEAD, routes: ROUTES.map(({ id }) => id) },
    routes: ROUTES.map((route) => ({ route: route.id, mode: route.mode, status: "PASS", recording: MOTION_ROUTE_IDS.includes(route.id) ? { relativePath: `routes/${route.id}/route-recording.mp4` } : null })),
    homepage: { status: "PASS" },
    crossRouteNavigation: { status: "PASS", sequence: ROUTES.map(({ id }) => ({ route: id })) },
    humanReview: { gates: Object.fromEntries(PHASE5B_HUMAN_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"])), phase6Authorized: false },
    ledger: { selfExcluded: REPORT_PATH, filesIncludingSelf: 127, artifactBytes: 126, reportBytes: 1, totalBytesIncludingSelf: 127 },
    artifacts,
    failures: [],
    summary: { routeRecordings: 7, crossRouteRecordings: 1, rawWebmRetained: 0, artifactBytes: 126, totalBytesIncludingSelf: 127 },
  };
  assert.equal(validateCaptureReport(report), true);
  assert.throws(() => validateCaptureReport({ ...report, privatePath: "C:\\Users\\reviewer\\capture" }), /private host path/);
  assert.throws(() => validateCaptureReport({ ...report, ledger: { ...report.ledger, artifactBytes: REVIEW_TARGET_MAX_BYTES, totalBytesIncludingSelf: REVIEW_TARGET_MAX_BYTES + 1 }, summary: { ...report.summary, artifactBytes: REVIEW_TARGET_MAX_BYTES, totalBytesIncludingSelf: REVIEW_TARGET_MAX_BYTES + 1 } }), /50 MB/);
});

test("CP9 executable is import-safe and contains real deployed evidence mechanisms", async () => {
  const source = await readFile(SCRIPT, "utf8");
  for (const pattern of [
    /pathToFileURL\(path\.resolve\(process\.argv\[1\]\)\)\.href === import\.meta\.url/,
    /recordVideo/,
    /page\.mouse\.wheel/,
    /axeCore\.source/,
    /new PerformanceObserver/,
    /addressesForGeometry/,
    /ffmpeg/,
    /ffprobe/,
    /libx264/,
    /yuv420p/,
    /full-decode deployed evidence recording/,
    /\.raw-recordings/,
    /removeOwnedRawRoot/,
    /PRIVATE_TEXT/,
    /Start with the operating reality\./,
  ]) assert.match(source, pattern);
  assert.match(source, /await nativeWheelTo\(page, 0,[\s\S]*?const reverseEnd = await page\.evaluate[\s\S]*?const axeResult = axe/);
  assert.doesNotMatch(source, /git\s+(?:commit|push)|package-phase5b|modify main/i);
});

test("CP9 self-test and dry-run execute without browser, network, Git or output", async () => {
  const self = await execFileAsync(process.execPath, [SCRIPT, "--self-test"], { cwd: ROOT, windowsHide: true });
  const selfResult = JSON.parse(self.stdout);
  assert.equal(selfResult.status, "PASS");
  assert.deepEqual(selfResult.inventories, { routes: 9, views: 4, motionRoutes: 7, artifactsExcludingReport: 126, filesIncludingReport: 127, acceptedStoryboardFiles: 76 });

  const external = path.resolve(ROOT, "..", "phase-5b-work", "cp9-dry-run-fixture");
  const dry = await execFileAsync(process.execPath, [
    SCRIPT,
    "--deployment-url", DEPLOYMENT_URL,
    "--expected-head", EXPECTED_HEAD,
    "--storyboard-root", path.join(external, "storyboards"),
    "--cp7-report", path.join(external, "cp7.json"),
    "--cp8-report", path.join(external, "cp8.json"),
    "--output", path.join(external, "fresh-output"),
    "--dry-run",
  ], { cwd: ROOT, windowsHide: true });
  const dryResult = JSON.parse(dry.stdout);
  assert.equal(dryResult.status, "DRY-RUN");
  assert.deepEqual({ writes: dryResult.writes, browserLaunched: dryResult.browserLaunched, networkRequests: dryResult.networkRequests, gitReads: dryResult.gitReads }, { writes: 0, browserLaunched: false, networkRequests: 0, gitReads: 0 });
  assert.deepEqual(dryResult.topology, { artifactsExcludingReport: 126, filesIncludingReport: 127, routeRecordings: 7, crossRouteRecordings: 1 });
});
