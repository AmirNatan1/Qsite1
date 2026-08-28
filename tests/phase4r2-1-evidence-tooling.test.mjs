import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  BLACK_BEAT_FRAME_COUNT,
  BLACK_START_FRAME,
  CURRENT_PROGRESS_SAMPLES,
  ENTRY_START_FRAME,
  FIRST_INPUT_PROBES,
  HUMAN_GATES,
  MINIMUM_RECORDING_SECONDS,
  RECORDINGS,
  REQUIRED_BRANCH,
  SHEETS,
  SHORT_LANDSCAPE_IDS,
  TIMEOUT_POSITIONS,
  VIEWPOINTS,
  assertInventoryContract,
  mediaUrlPath,
  normalizeTargetUrl,
  validateActiveManifest,
} from "../scripts/phase4r2-1-evidence-contract.mjs";
import {
  REPORT_SCHEMAS,
  normalizedElementScreenshotRegion,
  parseArguments,
  portalTimelineResult,
  recordingDurationResult,
  timeoutGeometryResult,
  validateLoopRanges,
  validateOptions,
  visiblePixelChangeResult,
} from "../scripts/capture-phase4r2-1-browser-evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SHA256 = "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516";
const execFileAsync = promisify(execFile);

function activeManifest() {
  const assets = [];
  for (const family of ["desktop", "portrait", "landscape"]) {
    assets.push({ kind: "video", family, codec: "h264", file: `media/${family}-h264-aaaaaaaaaaaa.mp4`, bytes: 1, sha256: "a".repeat(64), frames: 500, fps: 30 });
    assets.push({ kind: "poster", family, file: `posters/${family}-poster-bbbbbbbbbbbb.png`, bytes: 1, sha256: "b".repeat(64) });
  }
  return { schema: "quantum-hub.phase-4-r2.production-media-manifest.v1", status: "PASS", sourceBlendSha256: SOURCE_SHA256, physicalTimeline: { frames: 500, fps: 30 }, assets, deliveryPolicy: { h264Only: true, activeVideoCount: 3, activePosterCount: 3, inactiveCodecPayloadCount: 0 }, authorization: { mergeMain: false, phase5: false } };
}

function dryRunManifest() {
  const manifest = activeManifest();
  manifest.runtimeStaging = {
    publicRoot: "public/media/cinematic/phase-4r2",
    manifestPath: "manifests/active.json",
    removeUnlistedFiles: true,
    exactFiles: ["manifests/active.json", ...manifest.assets.map((asset) => asset.file)].sort(),
  };
  return manifest;
}

test("R2.1 evidence inventory is exact and covers every human recording gate", () => {
  assert.equal(assertInventoryContract(), true);
  assert.equal(RECORDINGS.length, 17);
  assert.equal(SHEETS.length, 17);
  assert.equal(Object.keys(REPORT_SCHEMAS).length, 9);
  assert.equal(VIEWPOINTS.filter((item) => item.firstInput).length * FIRST_INPUT_PROBES.length, 35);
  assert.deepEqual([...new Set(RECORDINGS.map((item) => item.gate))], [..."ABCDEFGHIJKL"]);
  assert.equal(RECORDINGS.filter((item) => item.gate === "E").length, 4);
  assert.equal(RECORDINGS.filter((item) => item.gate === "J").length, 3);
  assert.equal(Object.keys(MINIMUM_RECORDING_SECONDS).length, 17);
  assert.ok(RECORDINGS.every((item) => MINIMUM_RECORDING_SECONDS[item.id] > 0));
  assert.equal(BLACK_START_FRAME, 501);
  assert.equal(ENTRY_START_FRAME, 514);
  assert.equal(BLACK_BEAT_FRAME_COUNT, 13);
  assert.deepEqual(CURRENT_PROGRESS_SAMPLES, [0, 5, 10, 15, 25, 40, 50, 60, 75, 90, 97, 100]);
  assert.equal(TIMEOUT_POSITIONS.length, 6);
  assert.equal(SHORT_LANDSCAPE_IDS.length, 5);
  assert.equal(Object.keys(HUMAN_GATES).length, 5);
});

test("active media authority accepts only three H.264 videos plus three posters", () => {
  const manifest = activeManifest();
  assert.equal(validateActiveManifest(manifest, SOURCE_SHA256), true);
  const vp9 = structuredClone(manifest);
  vp9.assets[0].codec = "vp9";
  vp9.assets[0].file = "media/desktop.webm";
  assert.throws(() => validateActiveManifest(vp9, SOURCE_SHA256), /video authority|VP9/);
  const seventh = structuredClone(manifest);
  seventh.assets.push({ ...seventh.assets[0], file: "media/extra.mp4" });
  assert.throws(() => validateActiveManifest(seventh, SOURCE_SHA256), /six unique/);
  assert.throws(() => validateActiveManifest(manifest, "c".repeat(64)), /source authority/);
  const inactive = structuredClone(manifest);
  inactive.deliveryPolicy.inactiveCodecPayloadCount = 1;
  assert.throws(() => validateActiveManifest(inactive, SOURCE_SHA256), /H\.264-only policy/);
  const empty = structuredClone(manifest);
  empty.assets[0].bytes = 0;
  assert.throws(() => validateActiveManifest(empty, SOURCE_SHA256), /video authority/);
  const oversized = structuredClone(manifest);
  oversized.assets[0].bytes = 25 * 1024 * 1024 + 1;
  assert.throws(() => validateActiveManifest(oversized, SOURCE_SHA256), /video authority/);
});

test("local/deployed URL selection and public nested media paths fail closed", () => {
  assert.equal(normalizeTargetUrl("http://127.0.0.1:4321/", "local"), "http://127.0.0.1:4321/");
  assert.equal(normalizeTargetUrl("https://12345678.qsite1.pages.dev/", "deployed"), "https://12345678.qsite1.pages.dev/");
  assert.throws(() => normalizeTargetUrl("http://127.0.0.1:4321/", "deployed"), /HTTPS/);
  assert.throws(() => normalizeTargetUrl("https://example.com/path", "deployed"), /origin root/);
  assert.equal(mediaUrlPath("/media/cinematic/phase-4r2/manifests/active.json", "media/desktop.mp4"), "/media/cinematic/phase-4r2/media/desktop.mp4");
  assert.throws(() => mediaUrlPath("/media/cinematic/phase-4r2/manifests/active.json", "../escape.mp4"), /escapes|invalid/);
});

test("capture command requires exact final authorities through CLI inputs", () => {
  const output = path.resolve(ROOT, "..", "phase4r2-1-evidence-test-output");
  const parsed = parseArguments([
    "--mode", "deployed",
    "--immutable-url", "https://12345678.qsite1.pages.dev/",
    "--branch-url", "https://repair-phase-4r2-1.qsite1.pages.dev/",
    "--expected-head", "a".repeat(40),
    "--expected-source-sha256", SOURCE_SHA256,
    "--expected-manifest-sha256", "b".repeat(64),
    "--manifest", path.join(ROOT, "active.json"),
    "--manifest-url-path", "/media/cinematic/phase-4r2/manifests/active.json",
    "--deployment-report", path.join(ROOT, "deployment.json"),
    "--output", output,
  ]);
  assert.equal(validateOptions(parsed).expectedBranch, REQUIRED_BRANCH);
  const wrongBranch = { ...parsed, expectedBranch: "main" };
  assert.throws(() => validateOptions(wrongBranch), /capture branch/);
  assert.throws(() => validateOptions({ ...parsed, expectedManifestSha256: null }), /expected-manifest/);
  assert.throws(() => validateOptions({ ...parsed, output: os.tmpdir() }), /durable external/);
});

test("timeout geometry rejects the historical collapse, scroll jump, and CLS bound", () => {
  const before = { documentHeight: 19_740, scrollY: 8_000, chapter: "entry", chapterBox: { top: 0 }, entry: { box: { top: 0 } }, header: { top: 0 }, headerMode: "released" };
  const after = { ...structuredClone(before), mode: "enhanced", mediaState: "failed-preserve-runway", poster: { sourcePath: "/poster.png", box: { display: "block", visibility: "visible", opacity: 1, width: 100, height: 100 } }, video: { hasSource: false }, blobLifecycle: { live: 0 } };
  assert.equal(timeoutGeometryResult(before, after, 0).pass, true);
  assert.equal(timeoutGeometryResult(before, { ...after, documentHeight: 14_763 }, 0).pass, false);
  assert.equal(timeoutGeometryResult(before, { ...after, scrollY: 7_998 }, 0).pass, false);
  assert.equal(timeoutGeometryResult(before, after, 0.1).pass, false);
  assert.equal(timeoutGeometryResult(before, { ...after, poster: null }, 0).pass, false);
  assert.equal(timeoutGeometryResult(before, { ...after, video: { hasSource: true } }, 0).pass, false);
});

test("pixel, recording-duration, loop, and portal contracts reject self-declared false greens", () => {
  assert.deepEqual(normalizedElementScreenshotRegion(1440, 901, 1440, 900), { left: 0, top: 0, width: 1440, height: 900, requiresCrop: true });
  assert.deepEqual(normalizedElementScreenshotRegion(390, 844, 390, 844), { left: 0, top: 0, width: 390, height: 844, requiresCrop: false });
  assert.throws(() => normalizedElementScreenshotRegion(1440, 915, 1440, 900), /materially/);
  assert.throws(() => normalizedElementScreenshotRegion(1439, 900, 1440, 900), /materially/);

  assert.equal(visiblePixelChangeResult({ pixels: 1_000_000, changedPixelsAtLeast2: 24, maximumAbsoluteChannel: 2, meanAbsoluteMaximumChannel: 0.0001 }).visiblyChanged, false);
  assert.equal(visiblePixelChangeResult({ pixels: 1_000_000, changedPixelsAtLeast2: 500, maximumAbsoluteChannel: 8, meanAbsoluteMaximumChannel: 0.01 }).visiblyChanged, true);

  const duration = recordingDurationResult({ frameCount: 300, durationSeconds: 10 }, 8);
  assert.equal(duration.pass, true);
  assert.equal(recordingDurationResult({ frameCount: 2, durationSeconds: 2 / 30 }, 8).pass, false);
  assert.equal(recordingDurationResult({ frameCount: 300, durationSeconds: 4 }, 8).pass, false);

  const ranges = [
    { normalizedStart: 0, normalizedEnd: 0.5, segmentIndexRange: [0, 4], frontEntersFrame: 46, frontLastSegmentArrivalFrame: 100 },
    { normalizedStart: 0.5, normalizedEnd: 1, segmentIndexRange: [4, 8], frontEntersFrame: 100, frontLastSegmentArrivalFrame: 285 },
  ];
  assert.equal(validateLoopRanges(ranges).pass, true);
  assert.throws(() => validateLoopRanges([{ ...ranges[0] }, { ...ranges[1], frontEntersFrame: 90 }]), /ordering/);

  const states = [
    { frame: 500, state: { conceptualFrame: 500, phase: "physical", targetFrame: 500, presentedFrame: 500, headerMode: "concealed" } },
    { frame: 501, state: { conceptualFrame: 501, phase: "black", blackProgress: 1, blackBreath: 0, semanticProgress: 0, headerMode: "concealed" } },
    { frame: 507, state: { conceptualFrame: 507, phase: "black", blackProgress: 1, blackBreath: 0.98, semanticProgress: 0, headerMode: "concealed" } },
    { frame: 513, state: { conceptualFrame: 513, phase: "black", blackProgress: 1, blackBreath: 0.05, semanticProgress: 0, headerMode: "concealed" } },
    { frame: 522, state: { conceptualFrame: 522, phase: "entry", blackProgress: 1, blackBreath: 0, semanticProgress: 0.25, headerMode: "concealed" } },
    { frame: 540, state: { conceptualFrame: 540, phase: "settled", semanticProgress: 1, headerMode: "released" } },
  ];
  assert.equal(portalTimelineResult(states).pass, true);
  const broken = structuredClone(states);
  broken.find((item) => item.frame === 507).state.blackBreath = 0;
  assert.equal(portalTimelineResult(broken).pass, false);
});

test("capture harness contains no stale immutable deployment and performs no import-time capture", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "capture-phase4r2-1-browser-evidence.mjs"), "utf8");
  assert.equal(source.includes("https://b513942a.qsite1.pages.dev/"), false);
  assert.match(source, /if \(process\.argv\[1\]/);
  assert.match(source, /--expected-source-sha256/);
  assert.match(source, /--expected-manifest-sha256/);
  assert.match(source, /resetScroll: false/);
  assert.match(source, /Network\.emulateNetworkConditions/);
  assert.match(source, /physicalFrameCount:\s*PHYSICAL_FRAME_COUNT/);
  assert.match(source, /scenario\.kind === "full-reverse"[\s\S]*?conceptualFrame === 1 && state\.targetFrame <= 1 && state\.presentedFrame <= 1 && state\.reactionState === "pre-arrival"[\s\S]*?timeout: Math\.min\(options\.timeoutMs, 10_000\)/);
  assert.match(source, /scenario\.kind === "fast-jump"[\s\S]*?conceptualFrame === 1 && state\.targetFrame <= 1 && state\.presentedFrame <= 1 && state\.reactionState === "pre-arrival"[\s\S]*?timeout: Math\.min\(options\.timeoutMs, 10_000\)/);
  assert.doesNotMatch(source, /page\.waitForFunction\(\(\{ frame, presented \}\).*PHYSICAL_FRAME_COUNT/s);
  assert.doesNotMatch(source, /noScrollLock:\s*true/);
  assert.doesNotMatch(source, /color-contrast["']:\s*\{\s*enabled:\s*false/);
});

test("dry-run loads and cross-validates the actual tracked CP0/CP2 authorities without browser, network, or output writes", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase4r21-evidence-authority-test-"));
  const manifestFile = path.join(temporary, "active.json");
  const bytes = Buffer.from(`${JSON.stringify(dryRunManifest(), null, 2)}\n`, "utf8");
  await writeFile(manifestFile, bytes, { flag: "wx" });
  const output = path.resolve(ROOT, "..", `phase4r2-1-evidence-dry-run-${process.pid}`);
  try {
    const result = await execFileAsync(process.execPath, [
      path.join(ROOT, "scripts", "capture-phase4r2-1-browser-evidence.mjs"),
      "--mode", "local",
      "--url", "http://127.0.0.1:4321/",
      "--expected-head", "a".repeat(40),
      "--expected-source-sha256", SOURCE_SHA256,
      "--expected-manifest-sha256", createHash("sha256").update(bytes).digest("hex"),
      "--manifest", manifestFile,
      "--manifest-url-path", "/media/cinematic/phase-4r2/manifests/active.json",
      "--output", output,
      "--dry-run",
    ], { cwd: ROOT, windowsHide: true, timeout: 30_000 });
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "PASS");
    assert.equal(report.browserLaunched, false);
    assert.equal(report.networkRequestsPerformed, false);
    assert.equal(report.writesPerformed, false);
    await assert.rejects(() => readFile(output), /ENOENT|EISDIR/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
