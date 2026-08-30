#!/usr/bin/env node

/**
 * Phase 5B deployed browser-evidence capture.
 *
 * The tool is deliberately deployment-only. It writes a compact, exact review
 * topology to a fresh durable directory outside the repository and OS temp.
 * Playwright's raw WebM recordings remain in an owned staging folder only;
 * every retained recording is silent H.264/yuv420p/30fps MP4 and is fully
 * decoded before publication.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import axeCore from "axe-core";
import { chromium } from "playwright-core";
import sharp from "sharp";

import { PHASE5B_HUMAN_GATES, PHASE5B_ROUTES } from "./phase5b-route-contract.mjs";
import {
  GOVERNED_MARADIN_MEDIA,
  GOVERNED_MARADIN_STILLS,
  GOVERNED_MARADIN_VIDEOS,
  LONG_TASK_LIMIT_MS,
  PROOF_POSTER,
  SHARED_MEDIA_PATHS,
} from "./audit-phase5b-publication-media-performance.mjs";
import {
  expectedOffsetForCoordinate,
  profileForView,
} from "./phase5a-evidence-contract.mjs";
import { addressesForGeometry } from "./phase5ar-evidence-contract.mjs";

const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPT_RELATIVE = "scripts/capture-phase5b-deployed-evidence.mjs";
export const SCHEMA = "quantum-hub.phase-5b.deployed-browser-evidence.v1";
export const CP7_SCHEMA = "quantum-hub.phase-5b.responsive-accessibility.v1";
export const CP8_SCHEMA = "quantum-hub.phase-5b.publication-media-performance.v1";
export const STORYBOARD_SCHEMA = "qh.phase5ar.route-preproduction-manifest.v1";
export const REQUIRED_BRANCH = "feature/phase-5b-supporting-route-production";
export const REPORT_PATH = "capture-report.json";
export const ACCEPTED_STORYBOARD_FILE_COUNT = 76;
export const REVIEW_TARGET_MAX_BYTES = 50 * 1024 * 1024;
export const ROUTE_RECORDING_MINIMUM_SECONDS = 2.4;
export const ROUTE_RECORDING_MAXIMUM_SECONDS = 12;
export const NAVIGATION_RECORDING_MINIMUM_SECONDS = 12;
export const NAVIGATION_RECORDING_MAXIMUM_SECONDS = 90;
export const RECORDING_FPS = 30;
export const RECORDING_VIEW = Object.freeze({ id: "recording-1440x900", family: "desktop", width: 1440, height: 900 });
export const CAPTURE_VIEWS = Object.freeze([
  Object.freeze({ id: "desktop", label: "Desktop · 1440×900", family: "desktop", width: 1440, height: 900, accepted: "desktop-storyboard--1440x900.png" }),
  Object.freeze({ id: "portrait", label: "Portrait · 390×844", family: "portrait", width: 390, height: 844, accepted: "mobile-storyboard--390x844.png" }),
  Object.freeze({ id: "narrow-320", label: "Narrow · 320×800", family: "portrait", width: 320, height: 800, accepted: "narrow-overture--320x800.png" }),
  Object.freeze({ id: "landscape-844", label: "Short landscape · 844×390", family: "landscape", width: 844, height: 390, accepted: "short-landscape-overture-sheet.png" }),
]);
export const ROUTES = Object.freeze(PHASE5B_ROUTES.map((route) => Object.freeze({ ...route })));
export const MOTION_ROUTE_IDS = Object.freeze(ROUTES.filter(({ mode }) => mode === "B" || mode === "C").map(({ id }) => id));
export const DEFAULT_FFMPEG = path.resolve(ROOT, "..", "phase-5a-r-work", "tooling", "node_modules", "ffmpeg-static", "ffmpeg.exe");
export const DEFAULT_FFPROBE = path.resolve(ROOT, "..", "phase-5a-r-work", "tooling", "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe");

const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,})/i;
const MEDIA_PATH = /\.(?:avif|gif|jpe?g|png|svg|webp|mp4|webm|mov|m4v|mp3|wav|ogg)(?:$|[?#])/i;
const PHASE4_CINEMATIC = /\/media\/cinematic\/|phase[-_]?4(?:r2)?/i;
const OVERFLOW_TOLERANCE_PX = 1.5;
const TARGET_MINIMUM_PX = 44;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function posix(value) {
  return value.replaceAll("\\", "/");
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function normalizeDeploymentUrl(value) {
  const url = new URL(value);
  const loopback = /^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(url.hostname);
  if (url.protocol !== "https:" || loopback || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("deployment URL must be a credential-free, non-loopback HTTPS origin root");
  }
  if (!url.hostname.endsWith(".qsite1.pages.dev") || url.hostname === "qsite1.pages.dev") {
    throw new Error("deployment URL must be a qsite1 Pages preview origin root");
  }
  return url.toString();
}

export function assertExternalDurablePath(candidate, label = "path", { allowTemporaryFixture = false } = {}) {
  if (!candidate) throw new Error(`${label} is required`);
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root) throw new Error(`${label} cannot be a filesystem root`);
  if (within(ROOT, resolved)) throw new Error(`${label} must remain outside the repository`);
  if (!allowTemporaryFixture && within(os.tmpdir(), resolved)) throw new Error(`${label} must remain outside OS temporary storage`);
  return resolved;
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    url: null,
    expectedHead: null,
    expectedBranch: REQUIRED_BRANCH,
    storyboardRoot: null,
    cp7Report: null,
    cp8Report: null,
    deploymentReport: null,
    output: null,
    chromium: null,
    ffmpeg: DEFAULT_FFMPEG,
    ffprobe: DEFAULT_FFPROBE,
    timeoutMs: 30_000,
    dryRun: false,
    selfTest: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (["--url", "--deployment-url", "--immutable-url"].includes(argument)) options.url = next();
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-branch") options.expectedBranch = next();
    else if (argument === "--storyboard-root") options.storyboardRoot = path.resolve(next());
    else if (argument === "--cp7-report") options.cp7Report = path.resolve(next());
    else if (argument === "--cp8-report") options.cp8Report = path.resolve(next());
    else if (argument === "--deployment-report") options.deploymentReport = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (["--browser", "--chromium"].includes(argument)) options.chromium = path.resolve(next());
    else if (argument === "--ffmpeg") options.ffmpeg = path.resolve(next());
    else if (argument === "--ffprobe") options.ffprobe = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (["--help", "-h"].includes(argument)) options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

export function validateOptions(options, { allowTemporaryFixture = false } = {}) {
  if (!HASH40.test(options.expectedHead ?? "")) throw new Error("--expected-head must be a full lowercase 40-character Git SHA");
  if (options.expectedBranch !== REQUIRED_BRANCH) throw new Error(`--expected-branch must be ${REQUIRED_BRANCH}`);
  options.url = normalizeDeploymentUrl(options.url);
  options.storyboardRoot = assertExternalDurablePath(options.storyboardRoot, "storyboard root", { allowTemporaryFixture });
  options.cp7Report = assertExternalDurablePath(options.cp7Report, "CP7 report", { allowTemporaryFixture });
  options.cp8Report = assertExternalDurablePath(options.cp8Report, "CP8 report", { allowTemporaryFixture });
  if (options.deploymentReport) options.deploymentReport = assertExternalDurablePath(options.deploymentReport, "deployment report", { allowTemporaryFixture });
  options.output = assertExternalDurablePath(options.output, "capture output", { allowTemporaryFixture: false });
  if (within(options.storyboardRoot, options.output) || within(options.output, options.storyboardRoot)) throw new Error("capture output and accepted storyboard root must be disjoint");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  if (!options.dryRun && (!options.ffmpeg || !options.ffprobe)) throw new Error("full capture requires FFmpeg and FFprobe");
  return options;
}

function routeArtifactPaths(route) {
  const prefix = `routes/${route.id}`;
  const paths = [
    `${prefix}/production-comparison.png`,
    `${prefix}/desktop-key-states.png`,
    `${prefix}/mobile-key-states.png`,
    `${prefix}/320.png`,
    `${prefix}/844-landscape.png`,
    `${prefix}/reduced-motion.png`,
    `${prefix}/no-js.png`,
    `${prefix}/text-200.png`,
    `${prefix}/accessibility.json`,
    `${prefix}/performance.json`,
    `${prefix}/publication.json`,
    `${prefix}/network-media.json`,
  ];
  if (MOTION_ROUTE_IDS.includes(route.id)) paths.push(`${prefix}/route-recording.mp4`);
  return paths;
}

export function expectedArtifactPaths() {
  return [
    "cross-route/all-route-desktop.png",
    "cross-route/all-route-portrait.png",
    "cross-route/all-route-320.png",
    "cross-route/all-route-844-landscape.png",
    "cross-route/navigation-recording.mp4",
    ...ROUTES.flatMap(routeArtifactPaths),
    "homepage/manifesto.png",
    "homepage/audience-split.png",
    "homepage/crt-startup.png",
    "homepage/current.png",
    "homepage/q.png",
    "homepage/regression.json",
  ].sort((left, right) => left.localeCompare(right));
}

export const EXPECTED_ARTIFACT_PATHS = Object.freeze(expectedArtifactPaths());

export function expectedStoryboardFiles(manifest) {
  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts.map(({ relativePath }) => relativePath) : [];
  return [
    "README.md",
    "route-preproduction-manifest.json",
    "reports/accessibility.json",
    "reports/public-source-freeze.json",
    "reports/request-isolation.json",
    "reports/route-capture-report.json",
    ...artifacts,
  ].sort((left, right) => left.localeCompare(right));
}

export function validateStoryboardManifestData(manifest) {
  assert.equal(manifest?.schema, STORYBOARD_SCHEMA, "accepted storyboard manifest schema differs");
  assert.equal(manifest?.status, "PASS", "accepted storyboard manifest must be PASS");
  assert.equal(manifest?.mode, "full", "accepted storyboard manifest must be full capture");
  assert.deepEqual(manifest?.routes, ROUTES.map(({ id }) => id), "accepted storyboard route order differs");
  assert.equal(manifest?.artifacts?.length, 70, "accepted storyboard manifest must contain 70 review artifacts");
  assert.equal(manifest?.totals?.artifacts, 70, "accepted storyboard total differs");
  assert.equal(manifest?.publicRoutesChanged, false, "accepted storyboard authority changed public routes");
  assert.equal(manifest?.phase5BAuthorized, false, "accepted storyboard authority cannot self-authorize Phase 5B");
  assert.equal(manifest?.humanVisualJudgmentAuthoritative, true, "accepted storyboard human-review authority differs");
  const paths = manifest.artifacts.map(({ relativePath }) => relativePath);
  assert.equal(new Set(paths).size, 70, "accepted storyboard artifact paths must be unique");
  for (const record of manifest.artifacts) {
    assert.ok(typeof record.relativePath === "string" && !record.relativePath.includes("\\") && !record.relativePath.startsWith("/") && !record.relativePath.split("/").includes(".."), "accepted storyboard artifact path is unsafe");
    assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0, `${record.relativePath} has invalid bytes`);
    assert.match(record.sha256 ?? "", HASH64, `${record.relativePath} has invalid SHA-256`);
  }
  for (const route of ROUTES) for (const view of CAPTURE_VIEWS) {
    assert.ok(paths.includes(`routes/${route.id}/${view.accepted}`), `${route.id} lacks accepted ${view.id} storyboard authority`);
  }
  assert.equal(expectedStoryboardFiles(manifest).length, ACCEPTED_STORYBOARD_FILE_COUNT, "accepted storyboard root must contain exactly 76 files");
  return true;
}

function reportRouteIds(report) {
  return (report?.routes ?? []).map((record) => record?.route?.id ?? record?.id ?? record?.route).filter(Boolean);
}

export function validateCp7ReportData(report) {
  assert.equal(report?.schema, CP7_SCHEMA, "CP7 report schema differs");
  assert.equal(report?.status, "PASS", "CP7 report must be PASS");
  assert.match(report?.git?.head ?? "", HASH40, "CP7 report Git anchor differs");
  assert.deepEqual((report.routes ?? []).map(({ id }) => id), ROUTES.map(({ id }) => id), "CP7 route order differs");
  assert.equal(report?.responsive?.length, 117, "CP7 responsive matrix is incomplete");
  assert.equal(report?.axe?.length, 18, "CP7 axe matrix is incomplete");
  assert.equal(report?.keyboard?.length, 18, "CP7 keyboard matrix is incomplete");
  assert.equal(report?.mobileNavigation?.length, 9, "CP7 mobile-navigation matrix is incomplete");
  assert.equal(report?.summary?.failures, 0, "CP7 report retains failures");
  assert.equal(report?.summary?.seriousCriticalAxe, 0, "CP7 report retains serious/critical axe findings");
  assert.deepEqual(report?.failures, [], "CP7 failures array is not empty");
  return true;
}

export function validateCp8ReportData(report) {
  assert.equal(report?.schema, CP8_SCHEMA, "CP8 report schema differs");
  assert.equal(report?.status, "PASS", "CP8 report must be PASS");
  assert.match(report?.git?.expectedHead ?? "", HASH40, "CP8 expected Git anchor differs");
  assert.equal(report?.git?.expectedHead, report?.git?.observedHead, "CP8 expected/observed Git anchors differ");
  assert.deepEqual(reportRouteIds(report), ROUTES.map(({ id }) => id), "CP8 route order differs");
  assert.equal(report?.summary?.routeCount, 9, "CP8 route coverage differs");
  assert.equal(report?.summary?.failures, 0, "CP8 report retains failures");
  assert.ok((report?.summary?.maximumScrollLongTaskMs ?? Infinity) <= LONG_TASK_LIMIT_MS, "CP8 scroll Long Task limit differs");
  assert.equal(report?.summary?.phase4CinematicRequests, 0, "CP8 supporting routes requested Phase 4 cinematic media");
  assert.deepEqual(report?.failures, [], "CP8 failures array is not empty");
  return true;
}

function flattenScalars(value, output = []) {
  if (["string", "number", "boolean"].includes(typeof value)) output.push(String(value));
  else if (Array.isArray(value)) value.forEach((item) => flattenScalars(item, output));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, child]) => { output.push(key); flattenScalars(child, output); });
  return output;
}

function containsPrivateText(value) {
  return flattenScalars(value).some((candidate) => PRIVATE_TEXT.test(candidate));
}

export function validateDeploymentReportData(report, options) {
  assert.equal(report?.status, "PASS", "deployment report must be PASS");
  assert.match(String(report?.schema ?? ""), /phase[-_]?5b.*deployment|deployment.*phase[-_]?5b/i, "deployment report schema differs");
  const scalars = flattenScalars(report);
  assert.ok(scalars.includes(options.expectedHead), "deployment report does not bind expected HEAD");
  assert.ok(scalars.some((value) => { try { return new URL(value).toString() === options.url; } catch { return false; } }), "deployment report does not bind deployed URL");
  return true;
}

export function mediaPolicyResult(route, requests, observation) {
  const paths = [...new Set((requests ?? []).filter(({ resourceType, path: requestPath, url }) => resourceType === "media" || MEDIA_PATH.test(requestPath || url || "")).map(({ path: requestPath, url }) => requestPath || new URL(url).pathname))];
  const routeMediaPaths = paths.filter((value) => !SHARED_MEDIA_PATHS.includes(value));
  const phase4 = routeMediaPaths.filter((value) => PHASE4_CINEMATIC.test(value));
  const failures = [];
  if (phase4.length) failures.push({ code: "phase4-cinematic-request", actual: phase4 });
  if (route.media === "none" && routeMediaPaths.length) failures.push({ code: "unexpected-route-media", actual: routeMediaPaths });
  if (route.id === "proof" && (routeMediaPaths.length !== 1 || routeMediaPaths[0] !== PROOF_POSTER)) failures.push({ code: "proof-media-inventory", actual: routeMediaPaths, expected: [PROOF_POSTER] });
  if (route.id === "maradin") {
    const unexpected = routeMediaPaths.filter((value) => !GOVERNED_MARADIN_MEDIA.includes(value));
    const videos = routeMediaPaths.filter((value) => GOVERNED_MARADIN_VIDEOS.includes(value));
    if (unexpected.length) failures.push({ code: "maradin-ungoverned-media", actual: unexpected });
    if (videos.length) failures.push({ code: "maradin-video-before-explicit-initiation", actual: videos });
    const references = observation?.mediaReferences ?? [];
    if (!GOVERNED_MARADIN_MEDIA.every((value) => references.includes(value))) failures.push({ code: "maradin-governed-reference-inventory", actual: references });
    const unexpectedReferences = references.filter((value) => value.startsWith("/media/") && !GOVERNED_MARADIN_MEDIA.includes(value));
    if (unexpectedReferences.length) failures.push({ code: "maradin-ungoverned-media-reference", actual: unexpectedReferences });
    if ((observation?.activeDecoderCount ?? 0) !== 0) failures.push({ code: "unexpected-active-decoder", actual: observation.activeDecoderCount });
  }
  return { status: failures.length ? "FAIL" : "PASS", requestPaths: paths.sort(), routeMediaPaths: routeMediaPaths.sort(), phase4CinematicRequests: phase4, failures };
}

export function recordingContractResult(probe, view, { minimumSeconds, maximumSeconds }) {
  const videoStreams = (probe?.streams ?? []).filter(({ codec_type: type }) => type === "video");
  const audioStreams = (probe?.streams ?? []).filter(({ codec_type: type }) => type === "audio");
  const video = videoStreams[0] ?? {};
  const duration = Number(probe?.format?.duration ?? video.duration);
  const checks = {
    mp4Container: /(?:^|,)mp4(?:,|$)/.test(String(probe?.format?.format_name ?? "")),
    oneVideoStream: videoStreams.length === 1,
    zeroAudioStreams: audioStreams.length === 0,
    h264: video.codec_name === "h264",
    yuv420p: video.pix_fmt === "yuv420p",
    dimensions: Number(video.width) === view.width && Number(video.height) === view.height,
    constant30Fps: [video.avg_frame_rate, video.r_frame_rate].every((value) => value === "30/1"),
    boundedDuration: Number.isFinite(duration) && duration >= minimumSeconds && duration <= maximumSeconds,
  };
  return { status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL", checks, duration, media: { codec: video.codec_name ?? null, pixelFormat: video.pix_fmt ?? null, width: Number(video.width) || null, height: Number(video.height) || null, fps: video.avg_frame_rate ?? null, audioStreams: audioStreams.length, format: probe?.format?.format_name ?? null } };
}

export function homeRegressionResult(states) {
  const checks = {
    fiveStates: ["crtStartup", "current", "q", "manifesto", "audience"].every((key) => Boolean(states?.[key])),
    enhancedCrt: states?.crtStartup?.mode === "enhanced" && states?.crtStartup?.mediaReady === true && states?.crtStartup?.segment === "top-dormancy",
    currentVisible: Number(states?.current?.targetFrame) >= 300 && Number(states?.current?.targetFrame) <= 355 && /current|crt|connection|raster|appearance/.test(String(states?.current?.segment ?? "")),
    stableQ: Number(states?.q?.targetFrame) === 370 && Number(states?.q?.presentedFrame) === 370,
    manifestoSettled: states?.manifesto?.manifestoSettled === true && Number(states?.manifesto?.semanticProgress) === 1 && states?.manifesto?.manifestoText === "We turn industrial needs into field evidence." && states?.manifesto?.navigationReleased === false,
    audienceReleased: states?.audience?.navigationReleased === true && states?.audience?.audienceVisible === true && states?.audience?.audienceLinks?.join("|") === "/for-partners/|/for-startups/",
    nativeInput: Number(states?.audience?.wheelEvents) > 0 && Number(states?.audience?.programmaticScrollCalls) === 0,
    operatingFieldFinalResponse: states?.operatingField?.serverRendered === true
      && states?.operatingField?.afterAudience === true
      && states?.operatingField?.reachedByNativeScroll === true
      && states?.operatingField?.h2 === "Start with the operating reality."
      && states?.operatingField?.acceptedText === true,
  };
  return { status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL", checks, states };
}

export function validateArtifactLedger(records) {
  assert.ok(Array.isArray(records), "artifact ledger must be an array");
  assert.equal(records.length, EXPECTED_ARTIFACT_PATHS.length, `artifact ledger must contain exactly ${EXPECTED_ARTIFACT_PATHS.length} self-excluding artifacts`);
  assert.deepEqual(records.map(({ relativePath }) => relativePath).sort((left, right) => left.localeCompare(right)), EXPECTED_ARTIFACT_PATHS, "artifact ledger paths differ");
  assert.equal(new Set(records.map(({ relativePath }) => relativePath)).size, EXPECTED_ARTIFACT_PATHS.length, "artifact ledger paths must be unique");
  for (const record of records) {
    assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0, `${record.relativePath} has invalid byte length`);
    assert.match(record.sha256 ?? "", HASH64, `${record.relativePath} has invalid SHA-256`);
    assert.ok(!/\.webm$|(?:^|\/)\.raw|raw-recordings/i.test(record.relativePath), `${record.relativePath} exposes a forbidden raw capture`);
  }
  return true;
}

export function validateCaptureReport(report) {
  assert.equal(report?.schema, SCHEMA, "capture report schema differs");
  assert.equal(report?.status, "PASS", "capture report must be PASS");
  assert.deepEqual(report?.target?.routes, ROUTES.map(({ id }) => id), "capture report route order differs");
  assert.equal(report?.target?.deploymentUrl?.startsWith("https://"), true, "capture report deployment URL differs");
  assert.match(report?.target?.expectedHead ?? "", HASH40, "capture report HEAD differs");
  assert.deepEqual(report?.humanReview?.gates, Object.fromEntries(PHASE5B_HUMAN_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"])), "human gates must remain pending");
  assert.equal(report?.humanReview?.phase6Authorized, false, "capture report cannot authorize Phase 6");
  assert.equal(report?.ledger?.selfExcluded, REPORT_PATH, "capture report self-exclusion differs");
  assert.equal(report?.ledger?.filesIncludingSelf, EXPECTED_ARTIFACT_PATHS.length + 1, "capture report total file count differs");
  assert.equal(report?.ledger?.totalBytesIncludingSelf, report?.ledger?.artifactBytes + report?.ledger?.reportBytes, "capture report total byte accounting differs");
  validateArtifactLedger(report?.artifacts);
  assert.deepEqual(report?.routes?.map(({ route }) => route), ROUTES.map(({ id }) => id), "capture report route results differ");
  assert.ok(report.routes.every(({ route, mode, status, recording }) => status === "PASS" && mode === routeById(route).mode && (MOTION_ROUTE_IDS.includes(route) ? recording?.relativePath === `routes/${route}/route-recording.mp4` : recording === null)), "capture report route recording/status contract differs");
  assert.equal(report?.homepage?.status, "PASS", "homepage regression is not PASS");
  assert.equal(report?.crossRouteNavigation?.status, "PASS", "cross-route navigation is not PASS");
  assert.deepEqual(report.crossRouteNavigation.sequence.map(({ route }) => route).filter(Boolean), ROUTES.map(({ id }) => id), "cross-route navigation route coverage differs");
  assert.deepEqual(report?.failures, [], "capture report retains failures");
  assert.equal(report?.summary?.routeRecordings, MOTION_ROUTE_IDS.length, "route recording count differs");
  assert.equal(report?.summary?.crossRouteRecordings, 1, "cross-route recording count differs");
  assert.equal(report?.summary?.rawWebmRetained, 0, "raw WebM cannot be retained");
  assert.equal(report?.summary?.totalBytesIncludingSelf, report?.ledger?.totalBytesIncludingSelf, "capture summary byte accounting differs");
  assert.ok(report?.summary?.totalBytesIncludingSelf <= REVIEW_TARGET_MAX_BYTES, "capture exceeds the 50 MB package target");
  assert.equal(containsPrivateText(report), false, "capture report contains a private host path or credential");
  return true;
}

async function exists(candidate) {
  try { await access(candidate); return true; } catch { return false; }
}

async function resolvedFromExistingAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const tail = [];
  for (;;) {
    try { return path.join(await realpath(cursor), ...tail.reverse()); }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      tail.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

export async function validateFreshExternalOutputPath(candidate) {
  const resolved = await resolvedFromExistingAncestor(candidate);
  assertExternalDurablePath(resolved, "capture output");
  await mkdir(path.dirname(resolved), { recursive: true });
  const canonical = path.join(await realpath(path.dirname(resolved)), path.basename(resolved));
  assertExternalDurablePath(canonical, "capture output");
  try { await stat(canonical); throw new Error("capture output must not already exist"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  return canonical;
}

async function executable(candidate) {
  if (!candidate) return false;
  try { await access(candidate, fsConstants.X_OK); return true; } catch { return false; }
}

async function resolveChromium(override) {
  const candidates = [override];
  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    );
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
  } else if (process.platform === "darwin") candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  else candidates.push("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium");
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) if (await executable(candidate)) return path.resolve(candidate);
  throw new Error("Chrome/Chromium not found; pass --browser PATH");
}

async function run(command, args, label, options = {}) {
  try {
    return await execFileAsync(command, args, {
      cwd: ROOT,
      windowsHide: true,
      timeout: options.timeout ?? 180_000,
      maxBuffer: 24 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`${label} failed: ${String(error?.stderr || error?.message || error).slice(-4_000)}`);
  }
}

async function git(args, label = `git ${args.join(" ")}`) {
  return (await run("git", args, label, { timeout: 60_000 })).stdout.trim();
}

async function repositoryAuthority(options, cp7Head, cp8Head) {
  const [head, branch, statusText, cp7Ancestor, cp8Ancestor] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["branch", "--show-current"]),
    git(["status", "--porcelain=v1", "--untracked-files=all"]),
    run("git", ["merge-base", "--is-ancestor", cp7Head, options.expectedHead], "CP7 ancestry check").then(() => true, () => false),
    run("git", ["merge-base", "--is-ancestor", cp8Head, options.expectedHead], "CP8 ancestry check").then(() => true, () => false),
  ]);
  const checks = {
    exactHead: head === options.expectedHead,
    exactBranch: branch === options.expectedBranch,
    cleanTree: statusText === "",
    cp7Ancestor,
    cp8Ancestor,
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`repository authority differs: ${JSON.stringify(checks)}`);
  return { head, branch, checks };
}

async function readJson(file, label) {
  const bytes = await readFile(file);
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error(`${label} is not valid JSON`); }
  return { bytes, parsed };
}

async function walkFiles(root, directory = root, output = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`accepted storyboard root contains symbolic link: ${posix(path.relative(root, absolute))}`);
    if (info.isDirectory()) await walkFiles(root, absolute, output);
    else if (info.isFile()) output.push(posix(path.relative(root, absolute)));
    else throw new Error(`accepted storyboard root contains unsupported entry: ${posix(path.relative(root, absolute))}`);
  }
  return output;
}

async function loadStoryboardAuthority(storyboardRoot) {
  const canonical = await realpath(storyboardRoot);
  assertExternalDurablePath(canonical, "accepted storyboard root");
  const { bytes: manifestBytes, parsed: manifest } = await readJson(path.join(canonical, "route-preproduction-manifest.json"), "accepted storyboard manifest");
  validateStoryboardManifestData(manifest);
  const actualFiles = (await walkFiles(canonical)).sort((left, right) => left.localeCompare(right));
  const expectedFiles = expectedStoryboardFiles(manifest);
  assert.deepEqual(actualFiles, expectedFiles, "accepted storyboard root must contain its exact 76-file inventory");
  for (const record of manifest.artifacts) {
    const absolute = path.resolve(canonical, ...record.relativePath.split("/"));
    assert.ok(within(canonical, absolute), `accepted storyboard record escapes root: ${record.relativePath}`);
    const artifact = await readFile(absolute);
    assert.equal(artifact.length, record.bytes, `${record.relativePath} accepted byte length differs`);
    assert.equal(sha256(artifact), record.sha256, `${record.relativePath} accepted SHA-256 differs`);
  }
  return {
    root: canonical,
    manifest,
    public: {
      logicalRoot: "accepted-phase5ar-supporting-route-preproduction",
      manifestSchema: manifest.schema,
      manifestBytes: manifestBytes.length,
      manifestSha256: sha256(manifestBytes),
      files: actualFiles.length,
      reviewArtifacts: manifest.artifacts.length,
    },
  };
}

async function loadReportAuthority(file, label, validator) {
  const canonical = await realpath(file);
  assertExternalDurablePath(canonical, label);
  const { bytes, parsed } = await readJson(canonical, label);
  validator(parsed);
  return { parsed, public: { label, schema: parsed.schema, status: parsed.status, bytes: bytes.length, sha256: sha256(bytes) } };
}

async function loadAuthorities(options) {
  const [storyboards, cp7, cp8, deployment] = await Promise.all([
    loadStoryboardAuthority(options.storyboardRoot),
    loadReportAuthority(options.cp7Report, "CP7 responsive/accessibility report", validateCp7ReportData),
    loadReportAuthority(options.cp8Report, "CP8 publication/media/performance report", validateCp8ReportData),
    options.deploymentReport
      ? loadReportAuthority(options.deploymentReport, "Phase 5B deployment report", (report) => validateDeploymentReportData(report, options))
      : Promise.resolve(null),
  ]);
  return { storyboards, cp7, cp8, deployment };
}

function assertInside(root, candidate, label = "artifact path") {
  const resolved = path.resolve(candidate);
  if (!within(root, resolved)) throw new Error(`${label} escapes owned evidence staging: ${resolved}`);
  return resolved;
}

async function writeInside(root, destination, bytes) {
  assertInside(root, destination);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" });
}

async function writeJsonInside(root, relativePath, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (containsPrivateText(value)) throw new Error(`${relativePath} would serialize a private host path or credential`);
  await writeInside(root, path.join(root, ...relativePath.split("/")), serialized);
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function svg(width, height, body) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
}

async function optimizedPng(input) {
  return sharp(input, { failOn: "error" }).flatten({ background: "#070708" }).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer();
}

async function writePng(root, relativePath, input) {
  const bytes = await optimizedPng(input);
  await writeInside(root, path.join(root, ...relativePath.split("/")), bytes);
  return bytes;
}

async function composeSheet({ title, subtitle, items, columns, panelWidth, panelHeight, labelHeight = 46 }) {
  assert.ok(items.length > 0, `${title} requires items`);
  const margin = 26;
  const gap = 14;
  const headerHeight = 96;
  const rows = Math.ceil(items.length / columns);
  const tileHeight = panelHeight + labelHeight;
  const width = margin * 2 + columns * panelWidth + (columns - 1) * gap;
  const height = margin + headerHeight + rows * tileHeight + (rows - 1) * gap + margin;
  const composites = [{
    input: svg(width - margin * 2, headerHeight, `<rect width="100%" height="100%" fill="#070708"/><text x="0" y="31" fill="#f4f0ea" font-family="Arial,sans-serif" font-size="24" font-weight="700">${escapeXml(title)}</text><text x="0" y="61" fill="#aaa39a" font-family="Arial,sans-serif" font-size="13">${escapeXml(subtitle)}</text><line x1="0" y1="82" x2="100%" y2="82" stroke="#343139"/>`),
    left: margin,
    top: margin,
  }];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const panel = await sharp(item.input, { failOn: "error" }).flatten({ background: "#09090b" }).resize(panelWidth, panelHeight, { fit: "contain", background: "#09090b" }).png({ compressionLevel: 9 }).toBuffer();
    const label = svg(panelWidth, labelHeight, `<rect width="100%" height="100%" fill="#111114"/><line x1="0" y1="0" x2="${panelWidth}" y2="0" stroke="#39353d"/><text x="13" y="28" fill="#ddd7cf" font-family="Arial,sans-serif" font-size="13" font-weight="700">${escapeXml(item.label)}</text>`);
    const tile = await sharp({ create: { width: panelWidth, height: tileHeight, channels: 4, background: "#09090b" } }).composite([{ input: panel, left: 0, top: 0 }, { input: label, left: 0, top: panelHeight }]).png({ compressionLevel: 9 }).toBuffer();
    composites.push({
      input: tile,
      left: margin + (index % columns) * (panelWidth + gap),
      top: margin + headerHeight + Math.floor(index / columns) * (tileHeight + gap),
    });
  }
  return optimizedPng(await sharp({ create: { width, height, channels: 4, background: "#070708" } }).composite(composites).png().toBuffer());
}

function targetUrl(baseUrl, route) {
  return new URL(route.path.replace(/^\//, ""), baseUrl).toString();
}

function expectedStatus(route) {
  return route.id === "404" ? 404 : 200;
}

function routeById(id) {
  const route = ROUTES.find((candidate) => candidate.id === id);
  if (!route) throw new Error(`unknown Phase 5B route: ${id}`);
  return route;
}

function logicalBrowserName(executablePath) {
  const name = path.basename(executablePath).toLowerCase();
  if (name.includes("edge")) return "Microsoft Edge";
  if (name.includes("chrome")) return "Google Chrome";
  return "Chromium";
}

function contextOptions(view, overrides = {}) {
  return {
    viewport: { width: view.width, height: view.height },
    screen: { width: view.width, height: view.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    locale: "en-US",
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    ...overrides,
  };
}

async function installTelemetry(context) {
  await context.addInitScript(() => {
    const telemetry = {
      phase: "load",
      longTasks: [],
      layoutShifts: [],
      rafRequested: 0,
      rafCompleted: 0,
      rafPending: 0,
      intervalsCreated: 0,
      intervalsCleared: 0,
      scrollEvents: 0,
      wheelEvents: 0,
      programmaticScrollCalls: 0,
    };
    const originalRaf = window.requestAnimationFrame.bind(window);
    const originalCancelRaf = window.cancelAnimationFrame.bind(window);
    const liveRaf = new Set();
    window.requestAnimationFrame = (callback) => {
      telemetry.rafRequested += 1;
      let handle = 0;
      handle = originalRaf((time) => {
        liveRaf.delete(handle);
        telemetry.rafPending = liveRaf.size;
        telemetry.rafCompleted += 1;
        callback(time);
      });
      liveRaf.add(handle);
      telemetry.rafPending = liveRaf.size;
      return handle;
    };
    window.cancelAnimationFrame = (handle) => {
      liveRaf.delete(handle);
      telemetry.rafPending = liveRaf.size;
      return originalCancelRaf(handle);
    };
    const originalInterval = window.setInterval.bind(window);
    const originalClearInterval = window.clearInterval.bind(window);
    const liveIntervals = new Set();
    window.setInterval = (...args) => {
      const handle = originalInterval(...args);
      liveIntervals.add(handle);
      telemetry.intervalsCreated += 1;
      return handle;
    };
    window.clearInterval = (handle) => {
      liveIntervals.delete(handle);
      telemetry.intervalsCleared += 1;
      return originalClearInterval(handle);
    };
    const originalWindowScrollTo = window.scrollTo.bind(window);
    window.scrollTo = (...args) => { telemetry.programmaticScrollCalls += 1; return originalWindowScrollTo(...args); };
    const originalElementScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function(...args) { telemetry.programmaticScrollCalls += 1; return originalElementScrollTo.apply(this, args); };
    addEventListener("scroll", () => { telemetry.scrollEvents += 1; }, { passive: true });
    addEventListener("wheel", () => { telemetry.wheelEvents += 1; }, { passive: true });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) telemetry.longTasks.push({ duration: entry.duration, name: entry.name, phase: telemetry.phase, startTime: entry.startTime });
      }).observe({ type: "longtask", buffered: true });
    } catch { /* coverage is recorded in the final snapshot */ }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) telemetry.layoutShifts.push({ value: entry.value, phase: telemetry.phase, startTime: entry.startTime });
      }).observe({ type: "layout-shift", buffered: true });
    } catch { /* coverage is recorded in the final snapshot */ }
    Object.defineProperty(window, "__qhPhase5bEvidence", {
      configurable: false,
      enumerable: false,
      value: {
        telemetry,
        setPhase(value) { telemetry.phase = String(value); },
        snapshot() { return { ...telemetry, activeIntervals: liveIntervals.size, rafPending: liveRaf.size }; },
      },
      writable: false,
    });
  });
}

function requestEntry(request, scope, phase) {
  let pathname = request.url();
  try { pathname = new URL(request.url()).pathname; } catch { /* preserve URL */ }
  return { scope, phase, method: request.method(), resourceType: request.resourceType(), path: pathname, url: request.url(), status: null, transferredBytes: null, failure: null };
}

async function guardContext(context, baseUrl, ledger, scope) {
  const allowedOrigin = new URL(baseUrl).origin;
  let phase = "navigation";
  const byRequest = new Map();
  const pending = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    let parsed;
    try { parsed = new URL(request.url()); } catch { parsed = null; }
    const allowed = parsed && (["data:", "blob:"].includes(parsed.protocol) || parsed.origin === allowedOrigin);
    if (!allowed) {
      ledger.blocked.push(requestEntry(request, scope, phase));
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  context.on("request", (request) => {
    const entry = requestEntry(request, scope, phase);
    byRequest.set(request, entry);
    ledger.requests.push(entry);
  });
  context.on("response", (response) => {
    const request = response.request();
    const entry = byRequest.get(request);
    if (!entry) return;
    entry.status = response.status();
    pending.push(request.sizes().then((sizes) => { entry.transferredBytes = sizes.responseHeadersSize + sizes.responseBodySize; }).catch(() => {}));
  });
  context.on("requestfailed", (request) => {
    const entry = byRequest.get(request) ?? requestEntry(request, scope, phase);
    entry.failure = request.failure()?.errorText ?? "unknown";
    if (!byRequest.has(request)) ledger.requests.push(entry);
    ledger.failed.push({ scope, phase: entry.phase, path: entry.path, resourceType: entry.resourceType, failure: entry.failure });
  });
  return {
    setPhase(value) { phase = value; },
    async flush() { await Promise.allSettled(pending); },
  };
}

function diagnosticsFor(page, route) {
  const report = { consoleErrors: [], consoleWarnings: [], pageErrors: [] };
  page.on("console", (message) => {
    const expected404 = route?.id === "404" && /server responded with a status of 404/i.test(message.text());
    if (message.type() === "error" && !expected404) report.consoleErrors.push(message.text());
    if (message.type() === "warning") report.consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  return report;
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .waitForFunction(() => !document.fonts || document.fonts.status === "loaded", null, { timeout: 1_500 })
    .catch(() => {});
  await page.waitForTimeout(120);
}

async function openRoute(page, options, route) {
  const response = await page.goto(targetUrl(options.url, route), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page);
  const status = response?.status() ?? null;
  if (status !== expectedStatus(route)) throw new Error(`${route.id} returned HTTP ${status}; expected ${expectedStatus(route)}`);
  return status;
}

async function setTelemetryPhase(page, phase) {
  await page.evaluate((value) => window.__qhPhase5bEvidence?.setPhase(value), phase);
}

async function telemetrySnapshot(page) {
  return page.evaluate(() => window.__qhPhase5bEvidence?.snapshot?.() ?? null);
}

async function observeRoute(page) {
  return page.evaluate(({ minimum, overflowTolerance }) => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
    };
    const selector = (element) => element.id ? `#${element.id}` : `${element.localName}${[...element.classList].slice(0, 2).map((value) => `.${value}`).join("")}`;
    const focusable = [...document.querySelectorAll("a[href],button:not([disabled]),summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])")].filter(visible);
    const smallTargets = focusable.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width + 0.01 >= minimum && rect.height + 0.01 >= minimum ? [] : [{ selector: selector(element), width: rect.width, height: rect.height, text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "" }];
    });
    const routeRoot = document.querySelector("[data-route-production]");
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const h1 = document.querySelector("main h1");
    const mediaReferences = [...document.querySelectorAll("[src],[srcset],[poster],[data-video-src],[data-src],[style]")].flatMap((element) => {
      const source = ["src", "srcset", "poster", "data-video-src", "data-src", "style"].map((name) => element.getAttribute(name) ?? "").join(" ");
      return source.match(/\/media\/[a-z0-9._~!$&'()*+,;=:@%\/-]+/gi) ?? [];
    });
    const videos = [...document.querySelectorAll("video")].map((video) => ({
      src: video.getAttribute("src"),
      currentSrc: video.currentSrc || null,
      preload: video.preload,
      readyState: video.readyState,
      paused: video.paused,
    }));
    const links = [...document.querySelectorAll("main a[href]")].map((anchor) => ({ href: anchor.getAttribute("href"), text: anchor.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "" }));
    const bodyText = document.body.innerText.replace(/\s+/g, " ").trim();
    const headings = [...document.querySelectorAll("main h1,main h2,main h3,main h4,main h5,main h6")].map((element) => ({ level: Number(element.localName.slice(1)), text: element.textContent?.replace(/\s+/g, " ").trim() ?? "" }));
    return {
      activeDecoderCount: videos.filter((video) => video.currentSrc && video.readyState > 0).length,
      acts: [...document.querySelectorAll("[data-route-act]")].map((element) => element.getAttribute("data-route-act")),
      architecture: routeRoot?.getAttribute("data-route-architecture") ?? null,
      bodyText,
      documentHeight: document.documentElement.scrollHeight,
      duplicateIds: [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))],
      forms: document.querySelectorAll("main form").length,
      h1: h1?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      h1Count: document.querySelectorAll("main h1").length,
      headings,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
      links,
      mainCount: document.querySelectorAll("main").length,
      mediaReferences: [...new Set(mediaReferences)],
      route: routeRoot?.getAttribute("data-route-production") ?? null,
      routeMediaElementCount: routeRoot?.querySelectorAll("img,picture,video,audio,source").length ?? 0,
      routeMotion: routeRoot?.getAttribute("data-route-motion") ?? null,
      regions: document.querySelectorAll("[data-route-region]").length,
      runningAnimations: document.getAnimations().filter((animation) => animation.playState === "running").map((animation) => ({ duration: Number(animation.effect?.getTiming?.().duration) || 0, iterations: Number(animation.effect?.getTiming?.().iterations) || 0 })),
      skipLink: document.querySelector(".skip-link")?.getAttribute("href") ?? null,
      smallTargets,
      videos,
      viewport: { width: innerWidth, height: innerHeight },
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
      scrollY,
    };
  }, { minimum: TARGET_MINIMUM_PX, overflowTolerance: OVERFLOW_TOLERANCE_PX });
}

function layoutFailures(observation, route, { reducedMotion = false } = {}) {
  const failures = [];
  const add = (code, details = {}) => failures.push({ code, ...details });
  if (observation.route !== route.id) add("route-identity", { actual: observation.route, expected: route.id });
  if (observation.mainCount !== 1) add("main-count", { actual: observation.mainCount });
  if (observation.h1Count !== 1 || !observation.h1) add("h1", { actual: observation.h1, count: observation.h1Count });
  if (observation.horizontalOverflow > OVERFLOW_TOLERANCE_PX) add("horizontal-overflow", { actual: observation.horizontalOverflow });
  if (observation.duplicateIds.length) add("duplicate-ids", { actual: observation.duplicateIds });
  if (observation.smallTargets.length) add("target-size", { actual: observation.smallTargets });
  if (observation.acts.length !== route.acts) add("act-count", { actual: observation.acts.length, expected: route.acts });
  if (route.regions !== undefined && observation.regions !== route.regions) add("region-count", { actual: observation.regions, expected: route.regions });
  if (reducedMotion && observation.runningAnimations.some(({ duration, iterations }) => duration > 20 || iterations > 1)) add("reduced-motion", { actual: observation.runningAnimations });
  return failures;
}

async function runAxe(page) {
  await page.addScriptTag({ content: axeCore.source });
  const result = await page.evaluate(async () => window.axe.run(document, {
    resultTypes: ["violations", "incomplete"],
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
  }));
  const violations = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary, html: node.html.slice(0, 300) })),
  }));
  return { violations, seriousCritical: violations.filter(({ impact }) => impact === "serious" || impact === "critical"), incompleteCount: result.incomplete.length };
}

async function keyboardWalk(page, limit = 12) {
  const sequence = [];
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab");
    if (index === 0) await page.waitForTimeout(180);
    sequence.push(await page.evaluate(() => {
      const element = document.activeElement;
      const style = element ? getComputedStyle(element) : null;
      const rect = element?.getBoundingClientRect();
      return {
        tag: element?.localName ?? null,
        text: element?.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "",
        href: element?.getAttribute?.("href") ?? null,
        outlineStyle: style?.outlineStyle ?? null,
        outlineWidth: style?.outlineWidth ?? null,
        visible: Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= innerHeight),
      };
    }));
  }
  const first = sequence[0];
  const checks = {
    skipFirst: first?.text === "Skip to content" && first.visible,
    visibleFocus: sequence.some(({ outlineStyle, outlineWidth }) => outlineStyle && outlineStyle !== "none" && Number.parseFloat(outlineWidth) >= 2),
    uniqueStops: new Set(sequence.map(({ tag, text, href }) => `${tag}|${text}|${href}`)).size >= 4,
  };
  return { status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL", checks, sequence };
}

async function nativeWheelTo(page, targetY, timeoutMs, { step = 620, pause = 55 } = {}) {
  const started = Date.now();
  const maximum = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  const target = Math.max(0, Math.min(maximum, Math.round(targetY)));
  await page.mouse.move(20, 20);
  let previous = -1;
  for (;;) {
    const current = await page.evaluate(() => Math.round(scrollY));
    if (Math.abs(current - target) <= 2) return current;
    if (Date.now() - started > timeoutMs) throw new Error(`native wheel did not reach ${target}; stopped at ${current}`);
    const delta = Math.sign(target - current) * Math.min(step, Math.abs(target - current));
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(pause);
    const next = await page.evaluate(() => Math.round(scrollY));
    if (next === current && current === previous) throw new Error(`native wheel stalled at ${current} while targeting ${target}`);
    previous = current;
  }
}

async function screenshotBuffer(page, { fullPage = false } = {}) {
  return page.screenshot({ fullPage, animations: "disabled", caret: "hide", scale: "css", type: "png" });
}

async function captureKeyStates(page, options, route, view, { axe = false, keyboard = false, setNetworkPhase = () => {} } = {}) {
  const phase = async (value) => { setNetworkPhase(value); await setTelemetryPhase(page, value); };
  const topObservation = await observeRoute(page);
  const top = await screenshotBuffer(page);
  const maxScroll = Math.max(0, topObservation.documentHeight - view.height);
  await phase(`${view.id}-scroll-forward`);
  await nativeWheelTo(page, Math.round(maxScroll / 2), options.timeoutMs);
  const middleObservation = await observeRoute(page);
  const middle = await screenshotBuffer(page);
  await nativeWheelTo(page, maxScroll, options.timeoutMs);
  const endObservation = await observeRoute(page);
  const end = await screenshotBuffer(page);
  await phase(`${view.id}-scroll-reverse`);
  await nativeWheelTo(page, 0, options.timeoutMs);
  const reverseEnd = await page.evaluate(() => Math.round(scrollY));
  await phase(`${view.id}-quiet`);
  const beforeQuiet = await telemetrySnapshot(page);
  await page.waitForTimeout(520);
  const afterQuiet = await telemetrySnapshot(page);
  const axeResult = axe ? await runAxe(page) : null;
  const keyboardResult = keyboard ? await keyboardWalk(page) : null;
  const sheet = await composeSheet({
    title: `${route.id} · ${view.label} key states`,
    subtitle: "Top · midpoint · ending — native forward/reverse document traversal",
    items: [
      { input: top, label: "01 · overture" },
      { input: middle, label: "02 · document midpoint" },
      { input: end, label: "03 · route ending" },
    ],
    columns: 3,
    panelWidth: view.family === "portrait" ? 250 : 400,
    panelHeight: view.family === "portrait" ? 540 : 250,
  });
  const longTasks = (afterQuiet?.longTasks ?? []).filter(({ phase }) => phase?.includes("scroll"));
  const clsLoad = (afterQuiet?.layoutShifts ?? []).filter(({ phase }) => phase === "load").reduce((sum, entry) => sum + entry.value, 0);
  const clsScroll = (afterQuiet?.layoutShifts ?? []).filter(({ phase }) => phase?.includes("scroll")).reduce((sum, entry) => sum + entry.value, 0);
  const performance = {
    maxScroll,
    forwardEnd: endObservation.scrollY,
    reverseEnd,
    horizontalOverflow: Math.max(topObservation.horizontalOverflow, middleObservation.horizontalOverflow, endObservation.horizontalOverflow),
    longTasks,
    maxScrollLongTaskMs: longTasks.reduce((maximum, entry) => Math.max(maximum, entry.duration), 0),
    cls: { load: clsLoad, scroll: clsScroll },
    quiet: {
      rafRequested: (afterQuiet?.rafRequested ?? 0) - (beforeQuiet?.rafRequested ?? 0),
      rafPending: afterQuiet?.rafPending ?? null,
      activeIntervals: afterQuiet?.activeIntervals ?? null,
    },
  };
  return { topObservation, middleObservation, endObservation, sheet, axe: axeResult, keyboard: keyboardResult, performance };
}

async function captureStaticVariant(browser, options, route, variant, ledger) {
  const view = variant.view;
  const context = await browser.newContext(contextOptions(view, {
    javaScriptEnabled: variant.javaScriptEnabled ?? true,
    reducedMotion: variant.reducedMotion ?? "no-preference",
  }));
  await installTelemetry(context);
  const guard = await guardContext(context, options.url, ledger, `${route.id}:${variant.id}`);
  const page = await context.newPage();
  const diagnostics = diagnosticsFor(page, route);
  try {
    await openRoute(page, options, route);
    const observation = await observeRoute(page);
    const image = await screenshotBuffer(page);
    await guard.flush();
    return { id: variant.id, view, observation, image, diagnostics, failures: layoutFailures(observation, route, { reducedMotion: variant.reducedMotion === "reduce" }) };
  } finally {
    await context.close();
  }
}

async function probeVideo(ffprobe, file) {
  const { stdout } = await run(ffprobe, [
    "-v", "error",
    "-count_frames",
    "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames,duration:format=format_name,duration",
    "-of", "json",
    file,
  ], "probe normalized evidence recording");
  return JSON.parse(stdout);
}

async function normalizeRecording(options, staging, rawFile, relativePath, view, durationBounds) {
  const destination = assertInside(staging, path.join(staging, ...relativePath.split("/")), "recording destination");
  await mkdir(path.dirname(destination), { recursive: true });
  const partial = assertInside(staging, `${destination}.partial.mp4`, "recording partial");
  await run(options.ffmpeg, [
    "-v", "error", "-n", "-i", rawFile,
    "-map", "0:v:0", "-an", "-map_metadata", "-1",
    "-vf", "fps=30,format=yuv420p", "-fps_mode", "cfr",
    "-c:v", "libx264", "-preset", "medium", "-crf", "26",
    "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-movflags", "+faststart", partial,
  ], "normalize deployed evidence recording");
  await run(options.ffmpeg, ["-v", "error", "-i", partial, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], "full-decode deployed evidence recording");
  const probe = await probeVideo(options.ffprobe, partial);
  const validation = recordingContractResult(probe, view, durationBounds);
  if (validation.status !== "PASS") throw new Error(`${relativePath} recording contract failed: ${JSON.stringify(validation)}`);
  await rename(partial, destination);
  return { relativePath, validation };
}

async function recordRouteMotion(browser, options, route, staging, rawRoot, ledger) {
  const rawDirectory = assertInside(staging, path.join(rawRoot, route.id), "raw route recording directory");
  await mkdir(rawDirectory, { recursive: true });
  const context = await browser.newContext(contextOptions(RECORDING_VIEW, { recordVideo: { dir: rawDirectory, size: { width: RECORDING_VIEW.width, height: RECORDING_VIEW.height } } }));
  await installTelemetry(context);
  const guard = await guardContext(context, options.url, ledger, `${route.id}:recording`);
  const page = await context.newPage();
  const diagnostics = diagnosticsFor(page, route);
  const video = page.video();
  let evidence;
  try {
    await openRoute(page, options, route);
    const before = await observeRoute(page);
    const maxScroll = Math.max(0, before.documentHeight - RECORDING_VIEW.height);
    await page.waitForTimeout(260);
    guard.setPhase("route-recording-forward");
    await setTelemetryPhase(page, "route-recording-forward");
    await nativeWheelTo(page, maxScroll, options.timeoutMs, { step: Math.max(420, Math.ceil(maxScroll / 7)), pause: 120 });
    const forward = await observeRoute(page);
    await page.waitForTimeout(260);
    guard.setPhase("route-recording-reverse");
    await setTelemetryPhase(page, "route-recording-reverse");
    await nativeWheelTo(page, 0, options.timeoutMs, { step: Math.max(420, Math.ceil(maxScroll / 7)), pause: 105 });
    const reverse = await observeRoute(page);
    await page.waitForTimeout(280);
    const telemetry = await telemetrySnapshot(page);
    evidence = { before: { scrollY: before.scrollY, routeMotion: before.routeMotion }, forward: { scrollY: forward.scrollY, routeMotion: forward.routeMotion }, reverse: { scrollY: reverse.scrollY, routeMotion: reverse.routeMotion }, telemetry, diagnostics };
    await guard.flush();
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
  const rawFile = await video.path();
  assert.ok(within(rawRoot, rawFile), "Playwright raw route recording escaped owned staging");
  const relativePath = `routes/${route.id}/route-recording.mp4`;
  try {
    const normalized = await normalizeRecording(options, staging, rawFile, relativePath, RECORDING_VIEW, { minimumSeconds: ROUTE_RECORDING_MINIMUM_SECONDS, maximumSeconds: ROUTE_RECORDING_MAXIMUM_SECONDS });
    return { ...normalized, evidence };
  } finally {
    await rm(rawFile, { force: true }).catch(() => {});
  }
}

async function capturePrimaryView(browser, options, route, view, ledger) {
  const context = await browser.newContext(contextOptions(view));
  await installTelemetry(context);
  const guard = await guardContext(context, options.url, ledger, `${route.id}:${view.id}`);
  const page = await context.newPage();
  const diagnostics = diagnosticsFor(page, route);
  try {
    await openRoute(page, options, route);
    const capture = await captureKeyStates(page, options, route, view, { axe: true, keyboard: true, setNetworkPhase: guard.setPhase });
    await guard.flush();
    return { ...capture, diagnostics };
  } finally {
    await context.close();
  }
}

function publicObservation(observation) {
  const { bodyText, ...safe } = observation;
  return { ...safe, bodyTextBytes: Buffer.byteLength(bodyText), bodyTextSha256: sha256(Buffer.from(bodyText)) };
}

function aggregateRequests(requests) {
  const groups = new Map();
  for (const request of requests) {
    if (["data:", "blob:"].some((protocol) => request.url?.startsWith(protocol))) continue;
    const key = `${request.scope}|${request.phase}|${request.path}|${request.resourceType}|${request.status}`;
    const current = groups.get(key) ?? { scope: request.scope, phase: request.phase, path: request.path, resourceType: request.resourceType, status: request.status, count: 0, transferredBytes: 0, failures: 0 };
    current.count += 1;
    current.transferredBytes += Number(request.transferredBytes) || 0;
    if (request.failure) current.failures += 1;
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => `${left.scope}|${left.path}`.localeCompare(`${right.scope}|${right.path}`));
}

function cp7RouteBaseline(report, routeId) {
  const responsive = report.responsive.filter((record) => record.route === routeId);
  const variants = report.variants.flatMap((variant) => variant.records.filter((record) => record.route === routeId).map((record) => ({ variant: variant.id, status: record.status })));
  const axe = report.axe.filter((record) => record.route === routeId);
  const keyboard = report.keyboard.filter((record) => record.route === routeId);
  return {
    anchor: report.git.head,
    responsiveCases: responsive.length,
    responsivePasses: responsive.filter(({ status }) => status === "PASS").length,
    variantCases: variants.length,
    variantPasses: variants.filter(({ status }) => status === "PASS").length,
    axeCases: axe.length,
    axeSeriousCritical: axe.reduce((sum, record) => sum + record.violations.filter(({ impact }) => impact === "serious" || impact === "critical").length, 0),
    keyboardCases: keyboard.length,
    keyboardPasses: keyboard.filter(({ status }) => status === "PASS").length,
  };
}

function cp8RouteBaseline(report, routeId) {
  const record = report.routes.find((candidate) => candidate.route?.id === routeId);
  if (!record) throw new Error(`CP8 report lacks ${routeId}`);
  return {
    anchor: report.git.expectedHead,
    httpStatus: record.httpStatus,
    code: record.code,
    normalNetwork: { requestCount: record.normalNetwork.requestCount, transferredBytes: record.normalNetwork.transferredBytes },
    performance: {
      maxScrollLongTaskMs: record.performance.maxLongTaskMs,
      cls: { load: record.performance.cls.load, scroll: record.performance.cls.scroll },
      horizontalOverflow: record.performance.horizontalOverflow,
      continuousMeasurement: {
        activeIntervalsAfterQuiet: record.performance.continuousMeasurement.activeIntervalsAfterQuiet,
        persistentRafCount: record.performance.continuousMeasurement.persistentRafCount,
        quietRafPending: record.performance.continuousMeasurement.quietRafPending,
        quietRafRequested: record.performance.continuousMeasurement.quietRafRequested,
      },
    },
    media: {
      initial: {
        activeDecoderCount: record.media.initial.activeDecoderCount,
        mediaReferences: record.media.initial.mediaReferences,
        routeMediaElementCount: record.media.initial.routeMediaElementCount,
      },
      afterScroll: {
        activeDecoderCount: record.media.afterScroll.activeDecoderCount,
        mediaReferences: record.media.afterScroll.mediaReferences,
        routeMediaElementCount: record.media.afterScroll.routeMediaElementCount,
      },
    },
  };
}

function accessibilityFailures(route, captures) {
  const failures = [];
  for (const [name, capture] of Object.entries(captures)) {
    const observation = capture.topObservation ?? capture.observation;
    failures.push(...layoutFailures(observation, route, { reducedMotion: name === "reducedMotion" }).map((failure) => ({ variant: name, ...failure })));
  }
  for (const [name, capture] of [["desktop", captures.desktop], ["portrait", captures.portrait]]) {
    if (capture.axe.seriousCritical.length) failures.push({ code: "axe-serious-critical", variant: name, actual: capture.axe.seriousCritical });
    if (capture.keyboard.status !== "PASS") failures.push({ code: "keyboard", variant: name, actual: capture.keyboard.checks });
  }
  return failures;
}

function performanceFailureList(captures) {
  const failures = [];
  for (const [name, capture] of [["desktop", captures.desktop], ["portrait", captures.portrait]]) {
    const performance = capture.performance;
    if (performance.maxScrollLongTaskMs > LONG_TASK_LIMIT_MS) failures.push({ code: "scroll-long-task", variant: name, actual: performance.maxScrollLongTaskMs, limit: LONG_TASK_LIMIT_MS });
    if (performance.horizontalOverflow > OVERFLOW_TOLERANCE_PX) failures.push({ code: "horizontal-overflow", variant: name, actual: performance.horizontalOverflow });
    if (performance.reverseEnd > 2 || Math.abs(performance.forwardEnd - performance.maxScroll) > 2) failures.push({ code: "scroll-traversal", variant: name, actual: { forward: performance.forwardEnd, reverse: performance.reverseEnd, maximum: performance.maxScroll } });
    if (performance.quiet.rafRequested > 2 || performance.quiet.rafPending > 2) failures.push({ code: "persistent-raf", variant: name, actual: performance.quiet });
    if (performance.quiet.activeIntervals !== 0) failures.push({ code: "active-interval", variant: name, actual: performance.quiet.activeIntervals });
  }
  return failures;
}

async function composeProductionComparison(staging, route, storyboardRoot) {
  const deployed = {
    desktop: path.join(staging, "routes", route.id, "desktop-key-states.png"),
    portrait: path.join(staging, "routes", route.id, "mobile-key-states.png"),
    "narrow-320": path.join(staging, "routes", route.id, "320.png"),
    "landscape-844": path.join(staging, "routes", route.id, "844-landscape.png"),
  };
  const items = [];
  for (const view of CAPTURE_VIEWS) {
    items.push({ input: path.join(storyboardRoot, "routes", route.id, view.accepted), label: `Accepted Phase 5A-R · ${view.label}` });
    items.push({ input: deployed[view.id], label: `Deployed Phase 5B · ${view.label}` });
  }
  return composeSheet({
    title: `${route.id} · accepted storyboard / deployed production`,
    subtitle: "Direct human-review comparison; the accepted 844 source is the governed five-neighbor storyboard sheet",
    items,
    columns: 2,
    panelWidth: 500,
    panelHeight: 340,
    labelHeight: 50,
  });
}

async function captureRouteEvidence(browser, options, route, staging, rawRoot, authorities) {
  const ledger = { requests: [], failed: [], blocked: [] };
  const desktopView = CAPTURE_VIEWS.find(({ id }) => id === "desktop");
  const portraitView = CAPTURE_VIEWS.find(({ id }) => id === "portrait");
  const captures = {
    desktop: await capturePrimaryView(browser, options, route, desktopView, ledger),
    portrait: await capturePrimaryView(browser, options, route, portraitView, ledger),
  };
  await writePng(staging, `routes/${route.id}/desktop-key-states.png`, captures.desktop.sheet);
  await writePng(staging, `routes/${route.id}/mobile-key-states.png`, captures.portrait.sheet);

  const variants = [
    { key: "narrow", id: "narrow-320", output: "320.png", view: CAPTURE_VIEWS.find(({ id }) => id === "narrow-320") },
    { key: "landscape", id: "landscape-844", output: "844-landscape.png", view: CAPTURE_VIEWS.find(({ id }) => id === "landscape-844") },
    { key: "reducedMotion", id: "reduced-motion", output: "reduced-motion.png", view: desktopView, reducedMotion: "reduce" },
    { key: "noJs", id: "no-js", output: "no-js.png", view: desktopView, javaScriptEnabled: false },
    { key: "text200", id: "text-200-proxy", output: "text-200.png", view: { id: "text-200", family: "desktop", width: 720, height: 450 } },
  ];
  for (const variant of variants) {
    captures[variant.key] = await captureStaticVariant(browser, options, route, variant, ledger);
    await writePng(staging, `routes/${route.id}/${variant.output}`, captures[variant.key].image);
  }

  const comparison = await composeProductionComparison(staging, route, authorities.storyboards.root);
  await writePng(staging, `routes/${route.id}/production-comparison.png`, comparison);

  const recording = MOTION_ROUTE_IDS.includes(route.id) ? await recordRouteMotion(browser, options, route, staging, rawRoot, ledger) : null;
  const accessibilityFailuresForRoute = accessibilityFailures(route, captures);
  const performanceFailuresForRoute = performanceFailureList(captures);
  const diagnostics = Object.entries(captures).flatMap(([variant, capture]) => {
    const errors = [...(capture.diagnostics?.consoleErrors ?? []), ...(capture.diagnostics?.pageErrors ?? [])];
    return errors.map((message) => ({ variant, message }));
  });
  if (recording) diagnostics.push(...recording.evidence.diagnostics.consoleErrors.map((message) => ({ variant: "recording", message })), ...recording.evidence.diagnostics.pageErrors.map((message) => ({ variant: "recording", message })));

  const cp7 = cp7RouteBaseline(authorities.cp7.parsed, route.id);
  const cp8 = cp8RouteBaseline(authorities.cp8.parsed, route.id);
  const primaryObservation = captures.desktop.topObservation;
  const media = mediaPolicyResult(route, ledger.requests, primaryObservation);
  const aggregatedRequests = aggregateRequests(ledger.requests);
  const networkFailures = [
    ...ledger.blocked.map((entry) => ({ code: "external-request-blocked", actual: { scope: entry.scope, path: entry.path } })),
    ...ledger.failed.map((entry) => ({ code: "request-failed", actual: entry })),
    ...aggregatedRequests.filter(({ status }) => status >= 400 && !(route.id === "404" && status === 404)).map((entry) => ({ code: "http-error", actual: entry })),
  ];
  const publicationChecks = {
    correctRouteIdentity: primaryObservation.route === route.id,
    expectedActCount: primaryObservation.acts.length === route.acts,
    expectedRegionCount: route.regions === undefined || primaryObservation.regions === route.regions,
    noForms: primaryObservation.forms === 0,
    noMailOrTelephoneLinks: primaryObservation.links.every(({ href }) => !/^(?:mailto|tel):/i.test(href ?? "")),
    noExternalMainLinks: primaryObservation.links.every(({ href }) => !/^https?:\/\//i.test(href ?? "")),
  };
  const publicationFailures = Object.entries(publicationChecks).filter(([, value]) => !value).map(([code]) => ({ code }));

  const accessibility = {
    schema: "quantum-hub.phase-5b.route-accessibility-evidence.v1",
    status: accessibilityFailuresForRoute.length || diagnostics.length ? "FAIL" : "PASS",
    route: route.id,
    cp7Baseline: cp7,
    axe: {
      desktop: captures.desktop.axe,
      portrait: captures.portrait.axe,
    },
    keyboard: {
      desktop: captures.desktop.keyboard,
      portrait: captures.portrait.keyboard,
    },
    observations: Object.fromEntries(Object.entries(captures).map(([key, value]) => [key, publicObservation(value.topObservation ?? value.observation)])),
    diagnostics,
    failures: accessibilityFailuresForRoute,
  };
  const performance = {
    schema: "quantum-hub.phase-5b.route-performance-evidence.v1",
    status: performanceFailuresForRoute.length ? "FAIL" : "PASS",
    route: route.id,
    limit: { scrollLongTaskMs: LONG_TASK_LIMIT_MS, horizontalOverflowPx: OVERFLOW_TOLERANCE_PX },
    cp8Baseline: cp8.performance,
    deployed: { desktop: captures.desktop.performance, portrait: captures.portrait.performance },
    motionRecording: recording ? { validation: recording.validation, evidence: recording.evidence } : { required: false, reason: `Mode ${route.mode} has no route motion controller` },
    failures: performanceFailuresForRoute,
  };
  const publication = {
    schema: "quantum-hub.phase-5b.route-publication-evidence.v1",
    status: publicationFailures.length ? "FAIL" : "PASS",
    route: route.id,
    httpStatus: expectedStatus(route),
    h1: primaryObservation.h1,
    headings: primaryObservation.headings,
    bodyTextBytes: Buffer.byteLength(primaryObservation.bodyText),
    bodyTextSha256: sha256(Buffer.from(primaryObservation.bodyText)),
    mainLinks: primaryObservation.links,
    cp8Baseline: { anchor: cp8.anchor, httpStatus: cp8.httpStatus, code: cp8.code },
    checks: publicationChecks,
    failures: publicationFailures,
  };
  const networkMedia = {
    schema: "quantum-hub.phase-5b.route-network-media-evidence.v1",
    status: media.status === "PASS" && networkFailures.length === 0 ? "PASS" : "FAIL",
    route: route.id,
    policy: route.media,
    requests: aggregatedRequests,
    summary: {
      requestCount: ledger.requests.length,
      transferredBytes: ledger.requests.reduce((sum, request) => sum + (Number(request.transferredBytes) || 0), 0),
      externalRequestsBlocked: ledger.blocked.length,
      failedRequests: ledger.failed.length,
    },
    observation: { mediaReferences: primaryObservation.mediaReferences, routeMediaElementCount: primaryObservation.routeMediaElementCount, activeDecoderCount: primaryObservation.activeDecoderCount, videos: primaryObservation.videos },
    media,
    cp8Baseline: { anchor: cp8.anchor, normalNetwork: cp8.normalNetwork, media: cp8.media },
    failures: networkFailures,
  };
  await writeJsonInside(staging, `routes/${route.id}/accessibility.json`, accessibility);
  await writeJsonInside(staging, `routes/${route.id}/performance.json`, performance);
  await writeJsonInside(staging, `routes/${route.id}/publication.json`, publication);
  await writeJsonInside(staging, `routes/${route.id}/network-media.json`, networkMedia);
  const statuses = [accessibility.status, performance.status, publication.status, networkMedia.status];
  if (statuses.some((status) => status !== "PASS")) throw new Error(`${route.id} deployed evidence failed: ${JSON.stringify({ accessibility: accessibilityFailuresForRoute, performance: performanceFailuresForRoute, publication: publicationFailures, network: networkFailures, media: media.failures, diagnostics })}`);
  return {
    route: route.id,
    mode: route.mode,
    status: "PASS",
    recording,
    summary: {
      axeSeriousCritical: captures.desktop.axe.seriousCritical.length + captures.portrait.axe.seriousCritical.length,
      maximumScrollLongTaskMs: Math.max(captures.desktop.performance.maxScrollLongTaskMs, captures.portrait.performance.maxScrollLongTaskMs),
      requestCount: networkMedia.summary.requestCount,
      transferredBytes: networkMedia.summary.transferredBytes,
      routeMediaPaths: media.routeMediaPaths,
    },
  };
}

async function homeGeometry(page) {
  return page.evaluate(() => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const entry = document.querySelector("#entry");
    const audience = document.querySelector("[data-audience-routing]");
    const built = document.querySelector("#built-with-industry");
    const header = document.querySelector(".site-header");
    const absoluteTop = (element) => element.getBoundingClientRect().top + scrollY;
    const shellTop = absoluteTop(shell);
    const entryTop = absoluteTop(entry);
    return {
      shellTop,
      entryTop,
      audienceTop: absoluteTop(audience),
      builtTop: absoluteTop(built),
      travel: Math.max(1, entryTop - header.getBoundingClientRect().height - shellTop),
      maxScrollY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    };
  });
}

async function observeHomeState(page) {
  return page.evaluate(() => {
    const state = window.quantumPhase4 ?? {};
    const audience = document.querySelector("[data-audience-routing]");
    const audienceRect = audience?.getBoundingClientRect();
    const telemetry = window.__qhPhase5bEvidence?.snapshot?.() ?? {};
    return {
      mode: state.mode ?? document.documentElement.dataset.cinematicMode ?? null,
      mediaReady: state.mediaReady ?? false,
      segment: state.segment ?? document.querySelector("[data-cinematic-shell]")?.dataset.cinematicSegment ?? null,
      targetFrame: state.targetFrame ?? null,
      presentedFrame: state.presentedFrame ?? null,
      semanticProgress: state.semanticProgress ?? null,
      manifestoSettled: state.manifestoSettled ?? false,
      navigationReleased: state.navigationReleased ?? false,
      manifestoText: document.querySelector("#home-title")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      audienceVisible: Boolean(audienceRect && audienceRect.top < innerHeight && audienceRect.bottom > 0),
      audienceLinks: [...document.querySelectorAll("[data-audience-routing] a[href]")].map((anchor) => anchor.getAttribute("href")),
      headerState: document.documentElement.dataset.cinematicHeader ?? null,
      shellInteractive: document.querySelector("[data-cinematic-shell]")?.dataset.cinematicInteractive ?? null,
      scrollY: Math.round(scrollY),
      wheelEvents: telemetry.wheelEvents ?? 0,
      programmaticScrollCalls: telemetry.programmaticScrollCalls ?? 0,
    };
  });
}

async function waitForPresentedFrame(page, expected, timeoutMs) {
  await page.waitForFunction((frame) => {
    const state = window.quantumPhase4;
    return state?.targetFrame === frame && state?.presentedFrame === frame;
  }, expected, { timeout: timeoutMs });
}

async function observeOperatingField(page, serverHtml) {
  const state = await page.evaluate(() => {
    const audience = document.querySelector("[data-audience-routing]");
    const field = document.querySelector("#built-with-industry");
    const rect = field?.getBoundingClientRect();
    const text = field?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return {
      afterAudience: Boolean(audience && field && (audience.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING)),
      h2: field?.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      text,
      reachedByNativeScroll: Boolean(rect && rect.top < innerHeight && rect.bottom > 0 && (window.__qhPhase5bEvidence?.snapshot?.().wheelEvents ?? 0) > 0),
    };
  });
  const acceptedFragments = [
    "Quantum works from a defined industrial need.",
    "Industry relationships anchor the work in real environments rather than abstract technology scouting.",
    "Technology is assessed against the challenge, then tested through a structured path that produces evidence for a responsible next step.",
  ];
  const serverText = serverHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return {
    serverRendered: /<section\b[^>]*id=["']built-with-industry["']/i.test(serverHtml)
      && serverHtml.includes("Start with the operating reality."),
    afterAudience: state.afterAudience,
    reachedByNativeScroll: state.reachedByNativeScroll,
    h2: state.h2,
    acceptedText: acceptedFragments.every((fragment) => state.text.includes(fragment) && serverText.includes(fragment)),
    acceptedTextSha256: sha256(Buffer.from(acceptedFragments.join("\n"))),
  };
}

async function visibleClick(page, selector, options) {
  const locator = page.locator(selector).first();
  for (let index = 0; index < 18; index += 1) {
    const box = await locator.boundingBox().catch(() => null);
    if (box && box.y < RECORDING_VIEW.height - 50 && box.y + box.height > 50) break;
    await page.mouse.wheel(0, 520);
    await page.waitForTimeout(70);
  }
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: options.timeoutMs }),
    locator.click(),
  ]);
  await settle(page);
}

async function recordRouteIdentityMoment(page, options, expectedId) {
  const route = routeById(expectedId);
  const observation = await observeRoute(page);
  if (observation.route !== expectedId) throw new Error(`cross-route recording expected ${expectedId}, observed ${observation.route}`);
  const maximum = Math.max(0, observation.documentHeight - RECORDING_VIEW.height);
  if (maximum > 0) {
    await nativeWheelTo(page, Math.min(maximum, 620), options.timeoutMs, { step: 620, pause: 90 });
    await page.waitForTimeout(90);
    await nativeWheelTo(page, 0, options.timeoutMs, { step: 620, pause: 80 });
  }
  return { route: expectedId, h1: observation.h1, path: route.path };
}

async function captureHomeAndNavigation(browser, options, staging, rawRoot) {
  const rawDirectory = assertInside(staging, path.join(rawRoot, "cross-route"), "raw navigation recording directory");
  await mkdir(rawDirectory, { recursive: true });
  const context = await browser.newContext(contextOptions(RECORDING_VIEW, { recordVideo: { dir: rawDirectory, size: { width: RECORDING_VIEW.width, height: RECORDING_VIEW.height } } }));
  await installTelemetry(context);
  const ledger = { requests: [], failed: [], blocked: [] };
  const guard = await guardContext(context, options.url, ledger, "cross-route-navigation");
  const page = await context.newPage();
  const diagnostics = diagnosticsFor(page, { id: "404" });
  const video = page.video();
  const sequence = [];
  const started = Date.now();
  const phase = async (value) => { guard.setPhase(value); await setTelemetryPhase(page, value); };
  let regression;
  try {
    const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    if (response?.status() !== 200) throw new Error(`Home returned HTTP ${response?.status() ?? "none"}`);
    await settle(page);
    const serverHtml = await response.text();
    await page.waitForFunction(() => window.quantumPhase4?.mediaReady === true, null, { timeout: options.timeoutMs });
    const geometry = await homeGeometry(page);
    const view = { family: "desktop", width: RECORDING_VIEW.width, height: RECORDING_VIEW.height };
    const profile = profileForView(view);
    const addresses = addressesForGeometry(geometry, view);
    const currentY = geometry.shellTop + expectedOffsetForCoordinate(geometry.travel, profile, 315);

    await phase("home-crt-startup");
    const crtStartup = await observeHomeState(page);
    await writePng(staging, "homepage/crt-startup.png", await screenshotBuffer(page));

    await phase("home-current");
    await nativeWheelTo(page, currentY, options.timeoutMs, { step: 330, pause: 85 });
    await waitForPresentedFrame(page, 316, options.timeoutMs);
    const current = await observeHomeState(page);
    await writePng(staging, "homepage/current.png", await screenshotBuffer(page));

    await phase("home-q");
    await nativeWheelTo(page, addresses.stableQ, options.timeoutMs, { step: 330, pause: 85 });
    await waitForPresentedFrame(page, 370, options.timeoutMs);
    const q = await observeHomeState(page);
    await writePng(staging, "homepage/q.png", await screenshotBuffer(page));

    await phase("home-manifesto");
    await nativeWheelTo(page, addresses.settled, options.timeoutMs, { step: 440, pause: 80 });
    await page.waitForFunction(() => window.quantumPhase4?.manifestoSettled === true && window.quantumPhase4?.semanticProgress === 1, null, { timeout: options.timeoutMs });
    const manifesto = await observeHomeState(page);
    await writePng(staging, "homepage/manifesto.png", await screenshotBuffer(page));

    await phase("home-audience");
    await nativeWheelTo(page, addresses.audienceVisible, options.timeoutMs, { step: 420, pause: 80 });
    await page.waitForFunction(() => window.quantumPhase4?.navigationReleased === true, null, { timeout: options.timeoutMs });
    const audience = await observeHomeState(page);
    await writePng(staging, "homepage/audience-split.png", await screenshotBuffer(page));

    await phase("home-operating-field");
    await nativeWheelTo(page, addresses.builtVisible, options.timeoutMs, { step: 460, pause: 80 });
    const operatingField = await observeOperatingField(page, serverHtml);
    await nativeWheelTo(page, addresses.audienceVisible, options.timeoutMs, { step: 460, pause: 70 });

    regression = homeRegressionResult({ crtStartup, current, q, manifesto, audience, operatingField });
    const regressionReport = {
      schema: "quantum-hub.phase-5b.homepage-regression-evidence.v1",
      status: regression.status,
      method: "native wheel through accepted CRT/current/Q/manifesto/audience anchors plus final-response Operating Field reachability",
      addresses,
      result: regression,
      diagnostics,
      network: { requests: aggregateRequests(ledger.requests), blocked: ledger.blocked.length, failed: ledger.failed.length },
    };
    if (regression.status !== "PASS") throw new Error(`Home regression failed: ${JSON.stringify(regression.checks)}`);
    await writeJsonInside(staging, "homepage/regression.json", regressionReport);

    await phase("navigate-home-to-industry");
    await visibleClick(page, "[data-entry-path='industry']", options);
    sequence.push({ from: "/", to: "/for-partners/", method: "audience-route anchor", ...(await recordRouteIdentityMoment(page, options, "for-industry")) });

    for (const transition of [
      ["/for-startups/", "for-startups"],
      ["/industries/", "industries"],
      ["/pocs/", "proof"],
    ]) {
      guard.setPhase(`navigate-${transition[1]}`);
      await visibleClick(page, `.desktop-nav a[href='${transition[0]}']`, options);
      sequence.push({ to: transition[0], method: "primary navigation anchor", ...(await recordRouteIdentityMoment(page, options, transition[1])) });
    }

    guard.setPhase("navigate-maradin");
    await visibleClick(page, ".proof-record__link[href='/pocs/maradin/']", options);
    sequence.push({ to: "/pocs/maradin/", method: "Proof record anchor", ...(await recordRouteIdentityMoment(page, options, "maradin")) });

    for (const transition of [
      ["/spark/", "spark"],
      ["/about/", "about"],
      ["/contact/", "contact"],
    ]) {
      guard.setPhase(`navigate-${transition[1]}`);
      await visibleClick(page, `.desktop-nav a[href='${transition[0]}']`, options);
      sequence.push({ to: transition[0], method: "primary navigation anchor", ...(await recordRouteIdentityMoment(page, options, transition[1])) });
    }

    await phase("intentional-missing-navigation");
    const missing = await page.goto(targetUrl(options.url, routeById("404")), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    if (missing?.status() !== 404) throw new Error(`intentional missing route returned ${missing?.status() ?? "none"}`);
    await settle(page);
    sequence.push({ to: routeById("404").path, method: "direct intentional-missing navigation", ...(await recordRouteIdentityMoment(page, options, "404")) });
    guard.setPhase("navigate-home-recovery");
    await visibleClick(page, ".recovery-link[href='/']", options);
    sequence.push({ to: "/", method: "404 Home recovery anchor" });
    const remainingMinimum = NAVIGATION_RECORDING_MINIMUM_SECONDS * 1000 - (Date.now() - started) + 250;
    if (remainingMinimum > 0) await page.waitForTimeout(remainingMinimum);
    await guard.flush();
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
  const rawFile = await video.path();
  assert.ok(within(rawRoot, rawFile), "Playwright raw navigation recording escaped owned staging");
  try {
    const normalized = await normalizeRecording(options, staging, rawFile, "cross-route/navigation-recording.mp4", RECORDING_VIEW, { minimumSeconds: NAVIGATION_RECORDING_MINIMUM_SECONDS, maximumSeconds: NAVIGATION_RECORDING_MAXIMUM_SECONDS });
    const unexpectedDiagnostics = [...diagnostics.consoleErrors, ...diagnostics.pageErrors];
    if (unexpectedDiagnostics.length || ledger.blocked.length || ledger.failed.length) throw new Error(`cross-route navigation diagnostics failed: ${JSON.stringify({ unexpectedDiagnostics, blocked: ledger.blocked, failed: ledger.failed })}`);
    return {
      status: "PASS",
      recording: normalized,
      regression,
      sequence,
      network: { requests: ledger.requests.length, transferredBytes: ledger.requests.reduce((sum, request) => sum + (Number(request.transferredBytes) || 0), 0) },
    };
  } finally {
    await rm(rawFile, { force: true }).catch(() => {});
  }
}

async function buildCrossRouteSheets(staging) {
  const definitions = [
    { output: "all-route-desktop.png", source: "desktop-key-states.png", title: "All Phase 5B routes · desktop", subtitle: "Compact top / midpoint / ending key-state sheets at 1440×900", panelWidth: 380, panelHeight: 300 },
    { output: "all-route-portrait.png", source: "mobile-key-states.png", title: "All Phase 5B routes · portrait", subtitle: "Compact top / midpoint / ending key-state sheets at 390×844", panelWidth: 300, panelHeight: 420 },
    { output: "all-route-320.png", source: "320.png", title: "All Phase 5B routes · 320", subtitle: "Narrow overture comparison at 320×800", panelWidth: 260, panelHeight: 500 },
    { output: "all-route-844-landscape.png", source: "844-landscape.png", title: "All Phase 5B routes · 844 landscape", subtitle: "Short-landscape overture comparison at 844×390", panelWidth: 400, panelHeight: 220 },
  ];
  for (const definition of definitions) {
    const sheet = await composeSheet({
      title: definition.title,
      subtitle: definition.subtitle,
      items: ROUTES.map((route) => ({ input: path.join(staging, "routes", route.id, definition.source), label: route.id })),
      columns: 3,
      panelWidth: definition.panelWidth,
      panelHeight: definition.panelHeight,
    });
    await writePng(staging, `cross-route/${definition.output}`, sheet);
  }
}

async function artifactRecords(staging) {
  const records = [];
  for (const relativePath of EXPECTED_ARTIFACT_PATHS) {
    const absolute = assertInside(staging, path.join(staging, ...relativePath.split("/")));
    const bytes = await readFile(absolute);
    const extension = path.extname(relativePath).slice(1).toLowerCase();
    const record = { relativePath, bytes: bytes.length, sha256: sha256(bytes), kind: extension === "json" ? "report" : extension === "mp4" ? "recording" : "image" };
    if (extension === "png") {
      const metadata = await sharp(bytes, { failOn: "error" }).metadata();
      assert.equal(metadata.format, "png", `${relativePath} is not PNG`);
      record.media = { format: "png", width: metadata.width, height: metadata.height };
    } else if (extension === "json") {
      const document = JSON.parse(bytes.toString("utf8"));
      assert.equal(document.status, "PASS", `${relativePath} is not PASS`);
      assert.equal(containsPrivateText(document), false, `${relativePath} contains a private host path or credential`);
      record.schema = document.schema;
    }
    records.push(record);
  }
  validateArtifactLedger(records);
  return records;
}

async function exactFileInventory(root, expected, label) {
  const actual = (await walkFiles(root)).sort((left, right) => left.localeCompare(right));
  assert.deepEqual(actual, [...expected].sort((left, right) => left.localeCompare(right)), `${label} file inventory differs`);
  return actual;
}

async function verifyReadback(output, records) {
  const expected = new Map(records.map((record) => [record.relativePath, record]));
  for (const relativePath of EXPECTED_ARTIFACT_PATHS) {
    const bytes = await readFile(path.join(output, ...relativePath.split("/")));
    const record = expected.get(relativePath);
    assert.equal(bytes.length, record.bytes, `${relativePath} read-back byte length differs`);
    assert.equal(sha256(bytes), record.sha256, `${relativePath} read-back SHA-256 differs`);
  }
  const reportBytes = await readFile(path.join(output, REPORT_PATH));
  const report = JSON.parse(reportBytes.toString("utf8"));
  assert.equal(containsPrivateText(report), false, "capture report read-back contains a private host path or credential");
  validateCaptureReport(report);
  await exactFileInventory(output, [...EXPECTED_ARTIFACT_PATHS, REPORT_PATH], "published capture");
  return true;
}

async function removeOwnedRawRoot(rawRoot, staging) {
  if (path.dirname(rawRoot) !== path.resolve(staging) || path.basename(rawRoot) !== ".raw-recordings") throw new Error("refusing to remove unowned raw recording directory");
  await rm(rawRoot, { recursive: true, force: true });
}

function authoritySummary(authorities) {
  return {
    acceptedStoryboards: authorities.storyboards.public,
    cp7ResponsiveAccessibility: authorities.cp7.public,
    cp8PublicationMediaPerformance: authorities.cp8.public,
    deploymentInspection: authorities.deployment?.public ?? { label: "separate-cloudflare-deployment-inspection", provided: false },
  };
}

function finalizeReportByteAccounting(report) {
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const reportBytes = Buffer.byteLength(`${JSON.stringify(report, null, 2)}\n`);
    const totalBytesIncludingSelf = report.ledger.artifactBytes + reportBytes;
    if (report.ledger.reportBytes === reportBytes && report.ledger.totalBytesIncludingSelf === totalBytesIncludingSelf && report.summary.totalBytesIncludingSelf === totalBytesIncludingSelf) return report;
    report.ledger.reportBytes = reportBytes;
    report.ledger.totalBytesIncludingSelf = totalBytesIncludingSelf;
    report.summary.totalBytesIncludingSelf = totalBytesIncludingSelf;
  }
  throw new Error("capture report byte accounting did not converge");
}

export async function runCapture(optionsInput) {
  const options = validateOptions({ ...optionsInput });
  const output = await validateFreshExternalOutputPath(options.output);
  const staging = assertExternalDurablePath(`${output}.staging-${randomUUID()}`, "capture staging");
  const rawRoot = path.join(staging, ".raw-recordings");
  if (await exists(staging)) throw new Error("unexpected capture staging collision");
  const [browserExecutable, ffmpegAvailable, ffprobeAvailable, authorities] = await Promise.all([
    resolveChromium(options.chromium),
    executable(options.ffmpeg),
    executable(options.ffprobe),
    loadAuthorities(options),
  ]);
  if (!ffmpegAvailable || !ffprobeAvailable) throw new Error("FFmpeg and FFprobe executables are required");
  const repository = await repositoryAuthority(options, authorities.cp7.parsed.git.head, authorities.cp8.parsed.git.expectedHead);
  let browser;
  let browserVersion = null;
  let published = false;
  try {
    await mkdir(staging, { recursive: false });
    await mkdir(rawRoot, { recursive: false });
    for (const directory of ["cross-route", "homepage", "routes"]) await mkdir(path.join(staging, directory), { recursive: false });
    browser = await chromium.launch({ headless: true, executablePath: browserExecutable, args: ["--disable-extensions", "--disable-background-networking"] });
    browserVersion = browser.version();

    const routeResults = [];
    for (const route of ROUTES) routeResults.push(await captureRouteEvidence(browser, options, route, staging, rawRoot, authorities));
    const navigation = await captureHomeAndNavigation(browser, options, staging, rawRoot);
    await buildCrossRouteSheets(staging);
    await browser.close();
    browser = null;
    await removeOwnedRawRoot(rawRoot, staging);
    await exactFileInventory(staging, EXPECTED_ARTIFACT_PATHS, "pre-report capture staging");

    const artifacts = await artifactRecords(staging);
    const artifactBytes = artifacts.reduce((sum, record) => sum + record.bytes, 0);
    if (artifactBytes > REVIEW_TARGET_MAX_BYTES) throw new Error(`capture artifacts exceed 50 MB review target: ${artifactBytes} bytes`);
    const routeRecordings = artifacts.filter(({ relativePath }) => /\/route-recording\.mp4$/.test(relativePath));
    const failures = routeResults.filter(({ status }) => status !== "PASS");
    const report = {
      schema: SCHEMA,
      status: failures.length ? "FAIL" : "PASS",
      generatedAt: new Date().toISOString(),
      target: {
        deploymentUrl: options.url,
        expectedHead: options.expectedHead,
        expectedBranch: options.expectedBranch,
        routes: ROUTES.map(({ id }) => id),
        views: CAPTURE_VIEWS,
      },
      repository,
      authorities: authoritySummary(authorities),
      browser: { name: logicalBrowserName(browserExecutable), version: browserVersion, headless: true },
      recordingContract: { container: "MP4", codec: "H.264", pixelFormat: "yuv420p", fps: RECORDING_FPS, audioStreams: 0, fullDecode: true, rawWebmRetained: false },
      routes: routeResults.map(({ route, mode, status, recording, summary }) => ({ route, mode, status, recording: recording ? { relativePath: recording.relativePath, validation: recording.validation } : null, summary })),
      homepage: { status: navigation.regression.status, regression: "homepage/regression.json", operatingFieldIncluded: true },
      crossRouteNavigation: { status: navigation.status, relativePath: navigation.recording.relativePath, validation: navigation.recording.validation, sequence: navigation.sequence, network: navigation.network },
      limitations: [
        "Visual comparison is deterministic side-by-side evidence for human judgment; it does not assign creative acceptance.",
        "The 720×450 text-200 view is the accepted 200% reflow proxy, not a claim about platform-specific browser chrome.",
        ...(authorities.deployment ? [] : ["Git-to-Cloudflare deployment binding is supplied by the separate deployment inspection; this capture binds the observed public origin and exact local HEAD but does not infer Cloudflare API state."]),
        "The intentional 404 has no site navigation target, so the cross-route recording reaches it by direct missing-path navigation and returns through its visible Home recovery anchor.",
      ],
      humanReview: {
        machineEvidence: "PASS",
        gates: Object.fromEntries(PHASE5B_HUMAN_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"])),
        phase6Authorized: false,
      },
      ledger: {
        exhaustive: true,
        selfExcluded: REPORT_PATH,
        artifacts: artifacts.length,
        filesIncludingSelf: artifacts.length + 1,
        artifactBytes,
        reportBytes: 0,
        totalBytesIncludingSelf: artifactBytes,
        packageTargetBytes: REVIEW_TARGET_MAX_BYTES,
      },
      artifacts,
      failures,
      summary: {
        routes: routeResults.length,
        routeRecordings: routeRecordings.length,
        crossRouteRecordings: 1,
        screenshotsAndSheets: artifacts.filter(({ kind }) => kind === "image").length,
        structuredRouteReports: artifacts.filter(({ relativePath }) => /^routes\/[^/]+\/(?:accessibility|performance|publication|network-media)\.json$/.test(relativePath)).length,
        homepageReports: 1,
        failures: failures.length,
        rawWebmRetained: 0,
        artifactBytes,
        totalBytesIncludingSelf: artifactBytes,
        filesIncludingSelf: artifacts.length + 1,
      },
    };
    finalizeReportByteAccounting(report);
    if (report.ledger.totalBytesIncludingSelf > REVIEW_TARGET_MAX_BYTES) throw new Error(`complete capture exceeds 50 MB review target: ${report.ledger.totalBytesIncludingSelf} bytes`);
    validateCaptureReport(report);
    await writeJsonInside(staging, REPORT_PATH, report);
    await exactFileInventory(staging, [...EXPECTED_ARTIFACT_PATHS, REPORT_PATH], "complete capture staging");
    await rename(staging, output);
    published = true;
    await verifyReadback(output, artifacts);
    return {
      schema: SCHEMA,
      status: "PASS",
      output,
      report: path.join(output, REPORT_PATH),
      artifacts: artifacts.length,
      filesIncludingReport: artifacts.length + 1,
      bytes: artifactBytes,
      routeRecordings: routeRecordings.length,
      crossRouteRecordings: 1,
    };
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    const owned = published ? output : staging;
    if (owned && assertExternalDurablePath(owned, "owned failed capture")) await rm(owned, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function storyboardFixture() {
  const artifacts = [];
  for (const route of ROUTES) {
    for (const filename of ["route-brief-delta.md", "desktop-storyboard--1440x900.png", "mobile-storyboard--390x844.png", "narrow-overture--320x800.png", "short-landscape-overture-sheet.png", "signature-states-sheet.png", "material-board.png"]) {
      artifacts.push({ relativePath: `routes/${route.id}/${filename}`, bytes: 1, sha256: "a".repeat(64) });
    }
  }
  for (const filename of ["PHASE_5A_R_ROUTE_COHERENCE_MATRIX.md", "PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md", "all-routes-desktop-contact-sheet.png", "all-routes-mobile-contact-sheet.png", "all-routes-short-landscape-contact-sheet.png", "motion-comparison-board.png", "material-comparison-board.png"]) {
    artifacts.push({ relativePath: `cross-route-system/${filename}`, bytes: 1, sha256: "a".repeat(64) });
  }
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

export async function selfTest() {
  assert.equal(ROUTES.length, 9);
  assert.equal(CAPTURE_VIEWS.length, 4);
  assert.deepEqual(MOTION_ROUTE_IDS, ["for-industry", "for-startups", "industries", "proof", "maradin", "spark", "about"]);
  assert.equal(EXPECTED_ARTIFACT_PATHS.length, 126);
  assert.equal(EXPECTED_ARTIFACT_PATHS.filter((value) => value.endsWith("route-recording.mp4")).length, 7);
  assert.equal(EXPECTED_ARTIFACT_PATHS.filter((value) => value.endsWith(".webm")).length, 0);
  validateStoryboardManifestData(storyboardFixture());
  const recording = recordingContractResult({ streams: [{ codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p", width: 1440, height: 900, avg_frame_rate: "30/1", r_frame_rate: "30/1" }], format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "4.0" } }, RECORDING_VIEW, { minimumSeconds: 2.4, maximumSeconds: 12 });
  assert.equal(recording.status, "PASS");
  const home = homeRegressionResult({
    crtStartup: { mode: "enhanced", mediaReady: true, segment: "top-dormancy" },
    current: { targetFrame: 316, segment: "raster-expansion" },
    q: { targetFrame: 370, presentedFrame: 370 },
    manifesto: { manifestoSettled: true, semanticProgress: 1, manifestoText: "We turn industrial needs into field evidence.", navigationReleased: false },
    audience: { navigationReleased: true, audienceVisible: true, audienceLinks: ["/for-partners/", "/for-startups/"], wheelEvents: 4, programmaticScrollCalls: 0 },
    operatingField: { serverRendered: true, afterAudience: true, reachedByNativeScroll: true, h2: "Start with the operating reality.", acceptedText: true },
  });
  assert.equal(home.status, "PASS");
  return {
    schema: SCHEMA,
    status: "PASS",
    inventories: { routes: ROUTES.length, views: CAPTURE_VIEWS.length, motionRoutes: MOTION_ROUTE_IDS.length, artifactsExcludingReport: EXPECTED_ARTIFACT_PATHS.length, filesIncludingReport: EXPECTED_ARTIFACT_PATHS.length + 1, acceptedStoryboardFiles: ACCEPTED_STORYBOARD_FILE_COUNT },
    recording: { codec: "H.264", pixelFormat: "yuv420p", fps: 30, audioStreams: 0, rawWebmRetained: false },
    packageTargetBytes: REVIEW_TARGET_MAX_BYTES,
  };
}

function printHelp() {
  process.stdout.write(`Phase 5B deployed browser evidence\n\nUsage:\n  node ${SCRIPT_RELATIVE} \\\n+    --deployment-url https://<deployment>.qsite1.pages.dev/ \\\n+    --expected-head <40-hex> --expected-branch ${REQUIRED_BRANCH} \\\n+    --storyboard-root <accepted-phase5ar-preproduction-root> \\\n+    --cp7-report <responsive-accessibility.json> \\\n+    --cp8-report <publication-media-performance.json> \\\n+    [--deployment-report <cloudflare-inspection.json>] \\\n+    --output <fresh-durable-external-directory> \\\n+    [--browser <chrome>] [--ffmpeg <ffmpeg>] [--ffprobe <ffprobe>]\n\nOptions:\n  --dry-run       Validate explicit argument and topology intent only; no reads, Git, network, browser, or output.\n  --self-test     Run pure contract checks; no reads, Git, network, browser, or output.\n  --timeout-ms N  Per-operation timeout, 5000..120000.\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(await selfTest(), null, 2)}\n`); return; }
  validateOptions(options);
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({
      schema: SCHEMA,
      status: "DRY-RUN",
      writes: 0,
      browserLaunched: false,
      networkRequests: 0,
      gitReads: 0,
      target: { deploymentUrl: options.url, expectedHead: options.expectedHead, expectedBranch: options.expectedBranch },
      inputs: { acceptedStoryboards: true, cp7: true, cp8: true, deploymentInspection: Boolean(options.deploymentReport) },
      topology: { artifactsExcludingReport: EXPECTED_ARTIFACT_PATHS.length, filesIncludingReport: EXPECTED_ARTIFACT_PATHS.length + 1, routeRecordings: MOTION_ROUTE_IDS.length, crossRouteRecordings: 1 },
    }, null, 2)}\n`);
    return;
  }
  const result = await runCapture(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => {
  process.stderr.write(`Phase 5B deployed evidence capture failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
