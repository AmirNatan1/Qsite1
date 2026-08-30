import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  ACCEPTED_STORYBOARD_FILE_COUNT,
  ALLOWED_CAPTURE_BRANCHES,
  AUDIENCE_HEADING,
  AUDIENCE_LINKS,
  CAPTURE_VIEWS,
  CAPTURE_PROFILE_R2,
  CP7_SCHEMA,
  CP8_SCHEMA,
  DEFAULT_FFMPEG,
  DEFAULT_FFPROBE,
  EXPECTED_ARTIFACT_PATHS,
  R2_ALLOWED_PRODUCTION_PATHS,
  R2_COMPARISON_FILENAMES,
  R2_EXPECTED_ARTIFACT_PATHS,
  R2_PARENT_R1_SHA,
  R2_RECORDING_FILENAMES,
  R2_REPAIR_BRANCH,
  R2_REPORT_FILENAMES,
  R2_RESPONSIVE_FILENAMES,
  R2_SCHEMA,
  R2_VIEWPOINTS,
  MOTION_ROUTE_IDS,
  RECORDING_VIEW,
  REPORT_PATH,
  REQUIRED_BRANCH,
  REVIEW_TARGET_MAX_BYTES,
  R1_REPAIR_BRANCH,
  ROUTES,
  SCHEMA,
  STORYBOARD_SCHEMA,
  audienceFrameScrollTarget,
  audienceFramingResult,
  expectedStoryboardFiles,
  homeRegressionResult,
  mediaPolicyResult,
  normalizeDeploymentUrl,
  parseArguments,
  requiredR2ArtifactPaths,
  r2NavigationResponseIsValid,
  recordingContractResult,
  unexpectedRequestFailures,
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

function audienceFramingObservation() {
  return {
    viewport: { width: 1440, height: 900 },
    headerBottom: 120,
    navigationReleased: true,
    scrollY: 7485,
    heading: {
      tagName: "h2",
      role: null,
      text: AUDIENCE_HEADING,
      href: null,
      displayed: true,
      visible: true,
      opacity: 1,
      rect: { top: 180, right: 620, bottom: 320, left: 48, width: 572, height: 140 },
    },
    links: AUDIENCE_LINKS.map((link, index) => ({
      tagName: "a",
      role: null,
      ...link,
      audienceLabel: link.text,
      displayed: true,
      visible: true,
      opacity: 1,
      rect: { top: 190 + index * 280, right: 1390, bottom: 390 + index * 280, left: 720, width: 670, height: 200 },
    })),
  };
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

test("CP9-default, R1, and R2 CLI branches retain deployed authority and disjoint fresh output intent", () => {
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
  assert.equal(options.expectedBranch, REQUIRED_BRANCH);
  assert.deepEqual(ALLOWED_CAPTURE_BRANCHES, [REQUIRED_BRANCH, R1_REPAIR_BRANCH, R2_REPAIR_BRANCH]);
  assert.equal(Object.isFrozen(ALLOWED_CAPTURE_BRANCHES), true);
  assert.equal(parseArguments(["--expected-branch", R1_REPAIR_BRANCH]).expectedBranch, R1_REPAIR_BRANCH);
  assert.equal(parseArguments(["--expected-branch", R2_REPAIR_BRANCH]).profile, CAPTURE_PROFILE_R2);
  assert.equal(options.url, DEPLOYMENT_URL);
  assert.equal(options.ffmpeg, DEFAULT_FFMPEG);
  assert.equal(options.ffprobe, DEFAULT_FFPROBE);
  assert.equal(normalizeDeploymentUrl(DEPLOYMENT_URL), DEPLOYMENT_URL);
  assert.throws(() => normalizeDeploymentUrl("http://127.0.0.1:4338/"), /non-loopback HTTPS/);
  assert.throws(() => normalizeDeploymentUrl("https://qsite1.pages.dev/"), /preview origin/);
  assert.throws(() => validateOptions({ ...options, expectedHead: "short" }), /40-character/);
  assert.equal(validateOptions({ ...options, profile: "r1", expectedBranch: R1_REPAIR_BRANCH }).expectedBranch, R1_REPAIR_BRANCH);
  assert.throws(() => validateOptions({ ...options, expectedBranch: "repair/unrecognized" }), /expected-branch/);
  assert.throws(() => validateOptions({ ...options, output: path.join(ROOT, "evidence") }), /outside the repository/);
  assert.throws(() => validateOptions({ ...options, output: path.join(options.storyboardRoot, "nested") }), /disjoint/);
});

test("R2 topology freezes semantic Home recordings, responsive variants, reports, and hash-bound comparisons", () => {
  assert.equal(R2_SCHEMA, "quantum-hub.phase-5b-r2.home-navigation-manifesto-deployed-browser-evidence.v1");
  assert.equal(R2_PARENT_R1_SHA, "ca22ae2f234302e7485803c560866abd7757735e");
  assert.equal(R2_VIEWPOINTS.length, 13);
  assert.deepEqual(R2_RECORDING_FILENAMES, ["01-fresh-forward-autonomous-manifesto.mp4", "02-reverse-reentry-autonomous-manifesto.mp4", "03-supporting-route-logo-home-navigation.mp4", "04-homepage-home-navigation.mp4", "05-mobile-home-navigation.mp4"]);
  assert.deepEqual(R2_RESPONSIVE_FILENAMES.slice(-4), ["manifesto-200-percent.png", "manifesto-fallback-fonts.png", "manifesto-reduced-motion.png", "manifesto-no-js.png"]);
  assert.deepEqual(R2_COMPARISON_FILENAMES, ["r1-vs-r2-manifesto.png", "historical-vs-r2-manifesto.png"]);
  assert.deepEqual(R2_REPORT_FILENAMES, ["home-navigation-manifesto-runtime.json", "home-navigation-frame-audit.json", "manifesto-responsive-accessibility.json", "supporting-route-source-regression.json", "phase4-media-hashes.json", "homepage-regression.json"]);
  assert.equal(R2_EXPECTED_ARTIFACT_PATHS.length, EXPECTED_ARTIFACT_PATHS.length + requiredR2ArtifactPaths().length);
  assert.ok(requiredR2ArtifactPaths().every((relativePath) => R2_EXPECTED_ARTIFACT_PATHS.includes(relativePath)));
  assert.deepEqual(R2_ALLOWED_PRODUCTION_PATHS, ["src/components/SiteHeader.astro", "src/components/home/EntryField.astro", "src/pages/index.astro", "src/scripts/home-cinematic-integration.ts", "src/styles/routes/home.css", "src/styles/routes/home-cinematic.css", "src/styles/routes/home-responsive.css"]);

  const external = path.resolve(ROOT, "..", "phase-5b-work", "r2-tooling-fixture");
  const parsed = parseArguments([
    "--profile", CAPTURE_PROFILE_R2,
    "--deployment-url", DEPLOYMENT_URL,
    "--expected-head", EXPECTED_HEAD,
    "--storyboard-root", path.join(external, "storyboards"),
    "--cp7-report", path.join(external, "cp7.json"),
    "--cp8-report", path.join(external, "cp8.json"),
    "--deployment-report", path.join(external, "deployment.json"),
    "--r1-manifesto", path.join(external, "r1.png"),
    "--expected-r1-manifesto-sha256", HASH,
    "--historical-manifesto", path.join(external, "historical.png"),
    "--expected-historical-manifesto-sha256", HASH,
    "--output", path.join(external, "output"),
    "--dry-run",
  ]);
  assert.equal(validateOptions(parsed), parsed);
  assert.equal(parsed.expectedBranch, R2_REPAIR_BRANCH);
  assert.throws(() => validateOptions({ ...parsed, expectedBranch: R1_REPAIR_BRANCH }), /expected-branch/);
  assert.throws(() => validateOptions({ ...parsed, expectedR1ManifestoSha256: "bad" }), /64-hex/);
});

test("R2 native same-document entry navigation accepts a null network response only at the exact target", () => {
  const target = "https://12345678.qsite1.pages.dev/#entry";
  assert.equal(r2NavigationResponseIsValid(200, target, target), true);
  assert.equal(r2NavigationResponseIsValid(null, target, target), true);
  assert.equal(r2NavigationResponseIsValid(undefined, target, target), true);
  assert.equal(r2NavigationResponseIsValid(null, "https://12345678.qsite1.pages.dev/", target), false);
  assert.equal(r2NavigationResponseIsValid(204, target, target), false);
  assert.equal(r2NavigationResponseIsValid(null, "not-a-url", target), false);
});

test("deployed diagnostics disclose only the internal Pages media-blob abort", () => {
  const expected = {
    url: "blob:https://12345678.qsite1.pages.dev/11111111-2222-4333-8444-555555555555",
    resourceType: "media",
    failure: "net::ERR_ABORTED",
  };
  assert.deepEqual(unexpectedRequestFailures([expected]), []);
  for (const failure of [
    { ...expected, url: "https://12345678.qsite1.pages.dev/site.css" },
    { ...expected, resourceType: "script" },
    { ...expected, failure: "net::ERR_FAILED" },
    { ...expected, url: "blob:https://example.com/11111111-2222-4333-8444-555555555555" },
  ]) assert.equal(unexpectedRequestFailures([failure]).length, 1);
});

test("R2 keyboard evidence recognizes the exact cinematic skip-link label", async () => {
  const source = await readFile(SCRIPT, "utf8");
  assert.match(source, /expectedSkipText:\s*"Skip cinematic intro"/);
  assert.match(source, /first\?\.text === expectedSkipText/);
});

test("R2 human visual captures precede keyboard-focus traversal", async () => {
  const source = await readFile(SCRIPT, "utf8");
  const body = source.match(/async function captureR2ManifestoVariant[\s\S]*?\n}\n\nasync function evidenceHashRecords/)?.[0] ?? "";
  const screenshot = body.indexOf("const image = await screenshotBuffer(page)");
  const keyboard = body.indexOf("if (definition.keyboard)");
  assert.ok(screenshot >= 0 && keyboard >= 0 && screenshot < keyboard);
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
  const audienceFraming = audienceFramingResult(audienceFramingObservation());
  const states = {
    crtStartup: { mode: "enhanced", mediaReady: true, segment: "top-dormancy" },
    current: { targetFrame: 316, segment: "raster-expansion" },
    q: { targetFrame: 370, presentedFrame: 370 },
    manifesto: { manifestoSettled: true, semanticProgress: 1, manifestoText: "We turn industrial needs into field evidence.", navigationReleased: false },
    audience: { navigationReleased: true, audienceVisible: true, audienceLinks: ["/for-partners/", "/for-startups/"], wheelEvents: 9, programmaticScrollCalls: 0 },
    audienceFraming,
    operatingField: { serverRendered: true, afterAudience: true, reachedByNativeScroll: true, h2: "Start with the operating reality.", acceptedText: true },
  };
  assert.equal(homeRegressionResult(states).status, "PASS");
  assert.equal(homeRegressionResult({ ...states, operatingField: { ...states.operatingField, afterAudience: false } }).status, "FAIL");
  assert.equal(homeRegressionResult({ ...states, q: { ...states.q, presentedFrame: 369 } }).status, "FAIL");
  assert.equal(homeRegressionResult({ ...states, audience: { ...states.audience, programmaticScrollCalls: 1 } }).status, "FAIL");
  assert.equal(homeRegressionResult({ ...states, audienceFraming: { ...audienceFraming, status: "FAIL" } }).status, "FAIL");
});

test("audience review framing preserves release proof and requires the H2 plus both ordinary links fully below fixed chrome", () => {
  assert.equal(audienceFrameScrollTarget({ audienceTop: 7605, headerBottom: 120, maxScrollY: 20_000 }), 7485);
  assert.equal(audienceFrameScrollTarget({ audienceTop: 7605, headerBottom: 120, maxScrollY: 7000 }), 7000);
  assert.throws(() => audienceFrameScrollTarget({ audienceTop: 7605, headerBottom: -1, maxScrollY: 20_000 }), /finite non-negative/);

  const observation = audienceFramingObservation();
  const framed = audienceFramingResult(observation);
  assert.equal(framed.status, "PASS");
  assert.deepEqual(framed.checks, {
    finiteViewportAndHeader: true,
    navigationReleased: true,
    exactHeading: true,
    headingFullyVisibleBelowHeader: true,
    exactOrdinaryLinks: true,
    linksFullyVisibleBelowHeader: true,
  });

  const obscuredHeading = structuredClone(observation);
  obscuredHeading.heading.rect.top = 90;
  assert.equal(audienceFramingResult(obscuredHeading).checks.headingFullyVisibleBelowHeader, false);
  const clippedLink = structuredClone(observation);
  clippedLink.links[1].rect.bottom = 920;
  assert.equal(audienceFramingResult(clippedLink).checks.linksFullyVisibleBelowHeader, false);
  const disguisedControl = structuredClone(observation);
  disguisedControl.links[0].role = "button";
  assert.equal(audienceFramingResult(disguisedControl).checks.exactOrdinaryLinks, false);
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
    /repair\/phase-5b-r1-about-dark-v2-fidelity/,
    /repair\/phase-5b-r2-home-navigation-manifesto/,
    /01-fresh-forward-autonomous-manifesto\.mp4/,
    /shell\?\.getAttribute\("data-manifesto-reveal"\)/,
    /\.brand-link\[href='\/#entry'\]/,
    /\.desktop-nav a\[href='\/#entry'\]/,
    /\.mobile-nav nav a\[href='\/#entry'\]/,
    /arrivedAtSemanticHome: home\.path === "\/" && home\.hash === "#entry" && home\.scrollY > 0/,
    /reversedHidden: reversed\.manifesto\.revealState === "hidden"/,
    /reentryReplayResolved/,
    /audienceFrameScrollTarget/,
    /waitForAudienceFraming/,
    /One operating field\. Two trajectories\./,
    /exactHead: head === options\.expectedHead/,
    /exactBranch: branch === options\.expectedBranch/,
    /cleanTree: statusText === ""/,
  ]) assert.match(source, pattern);
  assert.match(source, /await nativeWheelTo\(page, 0,[\s\S]*?const reverseEnd = await page\.evaluate[\s\S]*?const axeResult = axe/);
  assert.match(source, /nativeWheelTo\(page, addresses\.audienceVisible[\s\S]*?const audience = await observeHomeState\(page\)[\s\S]*?audienceFrameScrollTarget\(geometry\)[\s\S]*?waitForAudienceFraming\(page[\s\S]*?homepage\/audience-split\.png/);
  assert.doesNotMatch(source, /git\s+(?:commit|push)|package-phase5b|modify main/i);
  const r2Recordings = source.match(/async function captureR2Recordings[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(r2Recordings, /a\[href='\/'\]|scrollY === 0/);
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

  const r2Self = await execFileAsync(process.execPath, [SCRIPT, "--profile", CAPTURE_PROFILE_R2, "--self-test"], { cwd: ROOT, windowsHide: true });
  const r2SelfResult = JSON.parse(r2Self.stdout);
  assert.equal(r2SelfResult.status, "PASS");
  assert.equal(r2SelfResult.profile, CAPTURE_PROFILE_R2);
  assert.equal(r2SelfResult.schema, R2_SCHEMA);
  assert.equal(r2SelfResult.inventories.r2RequiredArtifacts, requiredR2ArtifactPaths().length);
});
