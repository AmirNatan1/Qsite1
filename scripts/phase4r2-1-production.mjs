#!/usr/bin/env node

/**
 * Resumable Phase 4-R2.1 partial production controller.
 *
 * The accepted R2.1 repair changes only F46-F494. This controller therefore
 * refuses to render any other frame, reuses F1-F45 and F495-F500 only after
 * exact hash checks, builds complete 500-frame manifests, and emits H.264-only
 * delivery media. Raw masters and process logs always remain in a durable
 * external root. Importing this module performs no work.
 */

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, createReadStream, createWriteStream } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  link,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SOURCE_SHA256 = "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516";
export const SOURCE_BYTES = 3_619_698;
export const BOUNDARY_REPORT_SHA256 = "f182b35dc533878a7c70b7f1327e8d92c5438fd3984b6223d520fd5b83abc9df";
export const PRIOR_SOURCE_SHA256 = "b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0";
export const AFFECTED_START = 46;
export const AFFECTED_END = 494;
export const FRAME_COUNT = 500;
export const FPS = 30;
export const ACTIVE_MANIFEST_SCHEMA = "quantum-hub.phase-4-r2.production-media-manifest.v1";
export const ACTIVE_FRAME_MANIFEST_SCHEMA = "quantum-hub.phase-4-r2.frame-manifest.v1";
export const ACTIVE_MANIFEST_RELATIVE = "manifests/phase-4r2-production-media-manifest.json";
export const ACTIVE_PUBLIC_ROOT_RELATIVE = "public/media/cinematic/phase-4r2";
export const ACTIVE_AUTHORITY_ROOT_RELATIVE = "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/production";
export const ACTIVE_MAX_ASSET_BYTES = 25 * 1024 * 1024;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(
  REPO_ROOT,
  "artifacts", "original", "phase-4r2-1-causal-signal-scroll-stability", "source",
  "quantum-signal-television-phase4r2-1-causal-current.blend",
);
const BOUNDARY_REPORT = path.join(
  REPO_ROOT,
  "artifacts", "original", "phase-4r2-1-causal-signal-scroll-stability", "review", "pilots",
  "black-boundary-production-report.json",
);
const PRIOR_AUTHORITY_ROOT = path.join(
  REPO_ROOT, "artifacts", "original", "phase-4r2-final-cinematic-production",
);
const WORKER = path.join(REPO_ROOT, "scripts", "phase4r2-1-render-worker.py");
const LOCK_BASENAME = ".phase4r2-1-production.lock";
const LEDGER_BASENAME = "phase-4r2-1-production-ledger.json";
const LEDGER_SCHEMA = "quantum-hub.phase-4-r2-1.partial-production-ledger.v1";
const LOCK_SCHEMA = "quantum-hub.phase-4-r2-1.production-lock.v1";
const RECEIPT_SCHEMA = "quantum-hub.phase-4-r2-1.production-frame-receipt.v1";
const PRIOR_FRAME_MANIFESTS = Object.freeze({
  desktop: Object.freeze({ bytes: 126_988, sha256: "2fe77bcd4e1e39402881b0d98aff6f5c3f5fed81d0404e53fcc6d2c8edb5875c" }),
  portrait: Object.freeze({ bytes: 126_487, sha256: "09ed1008a156117a071377c35f3c1c798cb5c01935263f2a004872b16fe62c7b" }),
  landscape: Object.freeze({ bytes: 126_491, sha256: "7b8af3afaf3cb4e03bd5bb69f71fc7ffd5c5e97db505370495a9714988072517" }),
});
const PRIOR_MEDIA_MANIFEST = Object.freeze({
  bytes: 38_800,
  sha256: "b8ceea224c84d507e22c99be9f70f2502b640105bc76d108e75543b9c57c2584",
});
const MEDIA_TOOLCHAIN = Object.freeze({
  ffmpeg: Object.freeze({
    bytes: 102_856_192,
    sha256: "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3",
    version: "9.0.1-essentials_build",
  }),
  ffprobe: Object.freeze({
    bytes: 102_652_416,
    sha256: "19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f",
    version: "9.0.1-essentials_build",
  }),
});

export const FAMILIES = Object.freeze({
  desktop: Object.freeze({
    camera: "Phase4R1_Camera_Desktop",
    cableCollection: "PHASE4R1V2_CABLE_DESKTOP",
    width: 1920,
    height: 1200,
  }),
  portrait: Object.freeze({
    camera: "Phase4R1_Camera_Mobile",
    cableCollection: "PHASE4R1V2_CABLE_MOBILE",
    width: 780,
    height: 1688,
  }),
  landscape: Object.freeze({
    camera: "Phase4R1_Camera_Landscape",
    cableCollection: "PHASE4R1V2_CABLE_LANDSCAPE",
    width: 1688,
    height: 780,
  }),
});

const isSha256 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

function assertFamily(family) {
  if (!(family in FAMILIES)) throw new Error(`unknown family: ${family}`);
}

export function activeVideoRelativePath(family, sha256) {
  assertFamily(family);
  if (!isSha256(sha256)) throw new Error("active video SHA-256 is invalid");
  return `media/phase-4r2-${family}-h264-${sha256.slice(0, 12)}.mp4`;
}

export function activePosterRelativePath(family, sha256) {
  assertFamily(family);
  if (!isSha256(sha256)) throw new Error("active poster SHA-256 is invalid");
  return `posters/phase-4r2-${family}-poster-${sha256.slice(0, 12)}.png`;
}

export function activeFrameManifestRelativePath(family) {
  assertFamily(family);
  return `manifests/phase-4r2-${family}-frame-manifest.json`;
}

function activeSequenceSha256(frames) {
  const value = frames.map((frame) => (
    `${frame.frame}|${frame.file}|${frame.bytes}|${frame.sha256}|${frame.width}|${frame.height}|${frame.bitDepth}|${frame.colorType}\n`
  )).join("");
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildActiveFrameManifest(family, partialManifest) {
  assertFamily(family);
  const authority = FAMILIES[family];
  if (
    partialManifest?.schema !== "quantum-hub.phase-4-r2-1.frame-manifest.v1"
    || partialManifest?.family !== family
    || partialManifest?.source?.blendSha256 !== SOURCE_SHA256
    || partialManifest?.source?.blackBoundaryReportSha256 !== BOUNDARY_REPORT_SHA256
    || !isSha256(partialManifest?.source?.settingsSha256)
    || !Array.isArray(partialManifest?.frames)
    || partialManifest.frames.length !== FRAME_COUNT
  ) throw new Error(`${family} partial frame manifest cannot become active authority`);
  const frames = partialManifest.frames.map((record, index) => {
    const frame = index + 1;
    const file = `F${String(frame).padStart(3, "0")}.png`;
    if (
      record?.frame !== frame
      || record?.file !== file
      || !Number.isInteger(record?.bytes)
      || record.bytes <= 0
      || !isSha256(record?.sha256)
      || record?.width !== authority.width
      || record?.height !== authority.height
      || record?.bitDepth !== 16
      || record?.colorType !== 2
    ) throw new Error(`${family} active frame ${frame} authority mismatch`);
    return {
      bitDepth: 16,
      bytes: record.bytes,
      colorType: 2,
      file,
      frame,
      height: authority.height,
      sha256: record.sha256,
      width: authority.width,
    };
  });
  return {
    family,
    frames,
    master: {
      fps: FPS,
      frameCount: FRAME_COUNT,
      frameRange: [1, FRAME_COUNT],
      resolution: [authority.width, authority.height],
      sequenceSha256: activeSequenceSha256(frames),
      totalBytes: frames.reduce((total, frame) => total + frame.bytes, 0),
    },
    schema: ACTIVE_FRAME_MANIFEST_SCHEMA,
    source: {
      blendSha256: SOURCE_SHA256,
      camera: authority.camera,
      settingsSha256: partialManifest.source.settingsSha256,
    },
  };
}

export function activeRuntimeFileInventory(manifest) {
  if (!Array.isArray(manifest?.assets)) throw new Error("active manifest assets are missing");
  return [ACTIVE_MANIFEST_RELATIVE, ...manifest.assets.map((asset) => asset.file)].sort();
}

export function activeAuthorityFileInventory(manifest) {
  if (!manifest?.frameManifests || !Array.isArray(manifest?.assets)) {
    throw new Error("active authority inventory inputs are missing");
  }
  return [
    ACTIVE_MANIFEST_RELATIVE,
    ...Object.values(manifest.frameManifests).map((record) => record.file),
    ...manifest.assets.map((asset) => asset.file),
  ].sort();
}

export function validateActiveProductionManifest(manifest) {
  const families = Object.keys(FAMILIES);
  if (
    manifest?.schema !== ACTIVE_MANIFEST_SCHEMA
    || manifest?.status !== "PASS"
    || manifest?.sourceBlendSha256 !== SOURCE_SHA256
    || manifest?.blackBoundaryReportSha256 !== BOUNDARY_REPORT_SHA256
    || manifest?.physicalTimeline?.frames !== FRAME_COUNT
    || manifest?.physicalTimeline?.fps !== FPS
    || manifest?.physicalTimeline?.durationRational !== "50/3"
    || manifest?.authorization?.mergeMain !== false
    || manifest?.authorization?.phase5 !== false
    || !Array.isArray(manifest?.assets)
    || manifest.assets.length !== 6
    || manifest?.deliveryPolicy?.h264Only !== true
    || manifest?.deliveryPolicy?.activeVideoCount !== 3
    || manifest?.deliveryPolicy?.activePosterCount !== 3
    || manifest?.deliveryPolicy?.inactiveCodecPayloadCount !== 0
  ) throw new Error("active production manifest authority mismatch");
  if (
    !manifest.frameManifests
    || JSON.stringify(Object.keys(manifest.frameManifests).sort()) !== JSON.stringify([...families].sort())
  ) throw new Error("active frame-manifest family inventory mismatch");
  const paths = new Set();
  for (const family of families) {
    const frameManifest = manifest.frameManifests[family];
    const resolution = [FAMILIES[family].width, FAMILIES[family].height];
    if (
      frameManifest?.file !== activeFrameManifestRelativePath(family)
      || !Number.isInteger(frameManifest?.bytes)
      || frameManifest.bytes <= 0
      || !isSha256(frameManifest?.sha256)
      || !isSha256(frameManifest?.sequenceSha256)
      || !isSha256(frameManifest?.firstFrameSha256)
      || frameManifest?.frames !== FRAME_COUNT
      || frameManifest?.fps !== FPS
      || JSON.stringify(frameManifest?.resolution) !== JSON.stringify(resolution)
    ) throw new Error(`${family} active frame-manifest record mismatch`);
    const familyAssets = manifest.assets.filter((asset) => asset?.family === family);
    const videos = familyAssets.filter((asset) => asset.kind === "video" && asset.codec === "h264");
    const posters = familyAssets.filter((asset) => asset.kind === "poster" && asset.codec === undefined);
    if (familyAssets.length !== 2 || videos.length !== 1 || posters.length !== 1) {
      throw new Error(`${family} active inventory must be one H.264 video and one poster`);
    }
    const video = videos[0];
    const poster = posters[0];
    if (
      !isSha256(video.sha256)
      || video.file !== activeVideoRelativePath(family, video.sha256)
      || !Number.isInteger(video.bytes)
      || video.bytes <= 0
      || video.bytes >= ACTIVE_MAX_ASSET_BYTES
      || video.frames !== FRAME_COUNT
      || video.fps !== FPS
      || Math.abs(video.durationSeconds - (FRAME_COUNT / FPS)) > 1e-12
      || video.masterFrameManifestSha256 !== frameManifest.sha256
      || JSON.stringify(video.resolution) !== JSON.stringify(resolution)
    ) throw new Error(`${family} active H.264 runtime contract mismatch`);
    if (
      !isSha256(poster.sha256)
      || poster.file !== activePosterRelativePath(family, poster.sha256)
      || !Number.isInteger(poster.bytes)
      || poster.bytes <= 0
      || poster.masterF1Sha256 !== frameManifest.firstFrameSha256
      || poster.masterFrameManifestSha256 !== frameManifest.sha256
      || JSON.stringify(poster.resolution) !== JSON.stringify(resolution)
    ) throw new Error(`${family} active poster runtime contract mismatch`);
    paths.add(video.file);
    paths.add(poster.file);
  }
  if (paths.size !== 6 || /(?:vp9|webm)/i.test(JSON.stringify(manifest))) {
    throw new Error("active production inventory contains duplicate or inactive codec paths");
  }
  const expectedPublicFiles = activeRuntimeFileInventory(manifest);
  if (
    manifest?.runtimeStaging?.publicRoot !== ACTIVE_PUBLIC_ROOT_RELATIVE
    || manifest?.runtimeStaging?.manifestPath !== ACTIVE_MANIFEST_RELATIVE
    || manifest?.runtimeStaging?.replaceAuthorityRootAtomically !== true
    || manifest?.runtimeStaging?.removeUnlistedFiles !== true
    || JSON.stringify(manifest?.runtimeStaging?.exactFiles) !== JSON.stringify(expectedPublicFiles)
  ) throw new Error("active runtime staging/cleanup contract mismatch");
  const expectedAuthorityFiles = activeAuthorityFileInventory(manifest);
  if (
    manifest?.authorityMaterialization?.trackedRoot !== ACTIVE_AUTHORITY_ROOT_RELATIVE
    || manifest?.authorityMaterialization?.sourceSubdirectory !== "delivery"
    || manifest?.authorityMaterialization?.removeUnlistedFiles !== true
    || JSON.stringify(manifest?.authorityMaterialization?.exactFiles) !== JSON.stringify(expectedAuthorityFiles)
  ) throw new Error("active tracked-authority materialization contract mismatch");
  return true;
}

export function buildActiveProductionManifest({ frameManifests, toolchain, assets }) {
  const manifest = {
    schema: ACTIVE_MANIFEST_SCHEMA,
    status: "PASS",
    sourceBlendSha256: SOURCE_SHA256,
    blackBoundaryReportSha256: BOUNDARY_REPORT_SHA256,
    physicalTimeline: { frames: FRAME_COUNT, fps: FPS, durationRational: "50/3" },
    frameManifests,
    toolchain,
    assets,
    deliveryPolicy: {
      h264Only: true,
      activeVideoCount: 3,
      activePosterCount: 3,
      inactiveCodecPayloadCount: 0,
    },
    authorization: { mergeMain: false, phase5: false },
  };
  manifest.runtimeStaging = {
    publicRoot: ACTIVE_PUBLIC_ROOT_RELATIVE,
    manifestPath: ACTIVE_MANIFEST_RELATIVE,
    exactFiles: activeRuntimeFileInventory(manifest),
    replaceAuthorityRootAtomically: true,
    removeUnlistedFiles: true,
  };
  manifest.authorityMaterialization = {
    trackedRoot: ACTIVE_AUTHORITY_ROOT_RELATIVE,
    sourceSubdirectory: "delivery",
    exactFiles: activeAuthorityFileInventory(manifest),
    removeUnlistedFiles: true,
  };
  validateActiveProductionManifest(manifest);
  return manifest;
}

export function affectedFrames() {
  return Array.from({ length: AFFECTED_END - AFFECTED_START + 1 }, (_, index) => AFFECTED_START + index);
}

export function reusedFrames() {
  return [
    ...Array.from({ length: 45 }, (_, index) => index + 1),
    ...Array.from({ length: 6 }, (_, index) => 495 + index),
  ];
}

function parseArguments(argv) {
  const [command = "status", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current.startsWith("--")) throw new Error(`Unexpected argument: ${current}`);
    const key = current.slice(2);
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return { command, options };
}

function resolveConfiguration(options = {}) {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData && !(options["output-root"] && options["old-root"])) {
    throw new Error("LOCALAPPDATA or explicit --output-root/--old-root paths are required");
  }
  const toolsRoot = localAppData ? path.join(localAppData, "QuantumHubTools") : "";
  const outputRoot = path.resolve(String(
    options["output-root"]
    ?? process.env.PHASE4R2_1_OUTPUT_ROOT
    ?? path.join(localAppData, "QuantumHubProduction", `phase-4r2-1-causal-current-${SOURCE_SHA256.slice(0, 8)}`),
  ));
  const oldRoot = path.resolve(String(
    options["old-root"]
    ?? process.env.PHASE4R2_OLD_ROOT
    ?? path.join(localAppData, "QuantumHubProduction", "phase-4r2-production-b0c9c7c1"),
  ));
  return {
    source: SOURCE,
    boundaryReport: BOUNDARY_REPORT,
    worker: WORKER,
    outputRoot,
    oldRoot,
    ledger: path.join(outputRoot, LEDGER_BASENAME),
    lockFile: path.join(outputRoot, LOCK_BASENAME),
    immutableSource: path.join(outputRoot, "authority", "source", path.basename(SOURCE)),
    blender: path.resolve(String(options.blender ?? process.env.PHASE4R2_BLENDER ?? path.join(
      toolsRoot, "blender-5.2.0", "blender-5.2.0-windows-x64", "blender.exe",
    ))),
    ffmpeg: path.resolve(String(options.ffmpeg ?? process.env.PHASE4R2_FFMPEG ?? path.join(
      toolsRoot, "ffmpeg-9.0.1", "ffmpeg-9.0.1-essentials_build", "bin", "ffmpeg.exe",
    ))),
    ffprobe: path.resolve(String(options.ffprobe ?? process.env.PHASE4R2_FFPROBE ?? path.join(
      toolsRoot, "ffmpeg-9.0.1", "ffmpeg-9.0.1-essentials_build", "bin", "ffprobe.exe",
    ))),
  };
}

export function pathIsWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  const escapesParent = relative === ".." || relative.startsWith(`..${path.sep}`);
  return relative === "" || (!escapesParent && !path.isAbsolute(relative));
}

async function canonicalProspectivePath(candidate) {
  let cursor = path.resolve(candidate);
  const missingSegments = [];
  while (true) {
    try {
      const existing = await realpath(cursor);
      return path.resolve(existing, ...missingSegments.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw new Error(`could not resolve a durable ancestor for ${candidate}`);
      missingSegments.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function canonicalDurableRoots(config) {
  const [repositoryRoot, temporaryRoot, outputRoot, oldRoot] = await Promise.all([
    realpath(REPO_ROOT),
    realpath(os.tmpdir()),
    canonicalProspectivePath(config.outputRoot),
    realpath(config.oldRoot),
  ]);
  for (const [label, candidate] of [["R2.1 output", outputRoot], ["prior master", oldRoot]]) {
    if (pathIsWithin(repositoryRoot, candidate)) throw new Error(`${label} root must remain outside Git`);
    if (pathIsWithin(temporaryRoot, candidate)) throw new Error(`${label} root may not be temporary`);
    if (path.parse(candidate).root === candidate) throw new Error(`${label} root may not be a drive root`);
  }
  if (pathIsWithin(oldRoot, outputRoot) || pathIsWithin(outputRoot, oldRoot)) {
    throw new Error("R2.1 output and prior-master roots may not contain one another");
  }
  return { repositoryRoot, temporaryRoot, outputRoot, oldRoot };
}

async function ensureExternalOutputRoot(config) {
  const before = await canonicalDurableRoots(config);
  await mkdir(config.outputRoot, { recursive: true });
  const after = await canonicalDurableRoots(config);
  if (path.normalize(before.outputRoot) !== path.normalize(after.outputRoot)) {
    throw new Error("R2.1 output root canonical target changed during creation");
  }
  return after;
}

async function sha256File(filePath) {
  const digest = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return digest.digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalHash(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

async function readJson(filePath, label = path.basename(filePath)) {
  let value;
  try {
    value = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is missing or invalid JSON`, { cause: error });
  }
  return value;
}

async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filePath);
}

function privacySafeMessage(error, config) {
  let value = String(error?.message ?? error);
  const replacements = [
    [config?.outputRoot, "<R2_1_EXTERNAL_ROOT>"],
    [config?.oldRoot, "<PRIOR_EXTERNAL_ROOT>"],
    [REPO_ROOT, "<REPOSITORY_ROOT>"],
    [os.homedir(), "<USER_HOME>"],
  ];
  for (const [needle, replacement] of replacements) {
    if (!needle) continue;
    value = value.replaceAll(String(needle), replacement);
    value = value.replaceAll(String(needle).replaceAll("\\", "/"), replacement);
  }
  return value;
}

async function assertExactFile(filePath, bytes, sha256, label) {
  const info = await stat(filePath);
  const digest = await sha256File(filePath);
  if (!info.isFile() || info.size !== bytes || digest !== sha256) {
    throw new Error(`${label} mismatch: bytes=${info.size} sha256=${digest}`);
  }
  return { bytes: info.size, sha256: digest };
}

async function validateMediaToolchain(config) {
  const [ffmpeg, ffprobe] = await Promise.all([
    assertExactFile(config.ffmpeg, MEDIA_TOOLCHAIN.ffmpeg.bytes, MEDIA_TOOLCHAIN.ffmpeg.sha256, "FFmpeg authority"),
    assertExactFile(config.ffprobe, MEDIA_TOOLCHAIN.ffprobe.bytes, MEDIA_TOOLCHAIN.ffprobe.sha256, "FFprobe authority"),
  ]);
  return {
    ffmpeg: { basename: path.basename(config.ffmpeg), ...ffmpeg, version: MEDIA_TOOLCHAIN.ffmpeg.version },
    ffprobe: { basename: path.basename(config.ffprobe), ...ffprobe, version: MEDIA_TOOLCHAIN.ffprobe.version },
  };
}

async function pngHeader(filePath) {
  const handle = await open(filePath, "r");
  const buffer = Buffer.alloc(33);
  try {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== buffer.length) throw new Error("truncated PNG header");
  } finally {
    await handle.close();
  }
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`not a PNG: ${path.basename(filePath)}`);
  }
  if (buffer.readUInt32BE(8) !== 13 || buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error(`invalid PNG IHDR: ${path.basename(filePath)}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
    interlaced: buffer[28],
  };
}

function oldFrameManifestPath(family) {
  return path.join(PRIOR_AUTHORITY_ROOT, "manifests", `phase-4r2-${family}-frame-manifest.json`);
}

async function loadOldFrameManifests() {
  const manifests = {};
  for (const [family, dimensions] of Object.entries(FAMILIES)) {
    const manifestPath = oldFrameManifestPath(family);
    const pinned = PRIOR_FRAME_MANIFESTS[family];
    await assertExactFile(manifestPath, pinned.bytes, pinned.sha256, `${family} prior frame manifest`);
    const manifest = await readJson(manifestPath, `${family} prior frame manifest`);
    if (
      manifest.schema !== "quantum-hub.phase-4-r2.frame-manifest.v1"
      || manifest.family !== family
      || manifest.source?.blendSha256 !== PRIOR_SOURCE_SHA256
      || !Array.isArray(manifest.frames)
      || manifest.frames.length !== FRAME_COUNT
    ) throw new Error(`${family} prior frame manifest authority mismatch`);
    const names = new Set();
    for (let index = 0; index < FRAME_COUNT; index += 1) {
      const record = manifest.frames[index];
      const expectedFrame = index + 1;
      const expectedName = `F${String(expectedFrame).padStart(3, "0")}.png`;
      if (
        record.frame !== expectedFrame
        || record.file !== expectedName
        || record.width !== dimensions.width
        || record.height !== dimensions.height
        || record.bitDepth !== 16
        || record.colorType !== 2
        || !Number.isInteger(record.bytes)
        || !/^[0-9a-f]{64}$/.test(record.sha256)
        || names.has(record.file)
      ) throw new Error(`${family} prior frame manifest invalid at F${expectedFrame}`);
      names.add(record.file);
    }
    manifests[family] = manifest;
  }
  return manifests;
}

export function validateBoundaryReportData(report, manifests) {
  if (
    report.schema !== "quantum-hub.phase-4-r2-1.current-pilot-render.v1"
    || report.status !== "PASS"
    || report.source?.bytes !== SOURCE_BYTES
    || report.source?.sha256 !== SOURCE_SHA256
    || report.settings?.mode !== "exact-production-black-boundary"
    || report.settings?.engine !== "CYCLES"
    || report.settings?.samples !== 192
    || report.settings?.image?.depth !== 16
    || report.outputs?.length !== 6
  ) throw new Error("black-boundary report authority mismatch");
  for (const family of Object.keys(FAMILIES)) {
    const dimensions = FAMILIES[family];
    if (JSON.stringify(report.plan?.[family]) !== JSON.stringify([495, 500])) {
      throw new Error(`${family} black-boundary plan mismatch`);
    }
    if (JSON.stringify(report.settings?.resolutions?.[family]) !== JSON.stringify([dimensions.width, dimensions.height])) {
      throw new Error(`${family} black-boundary resolution mismatch`);
    }
    for (const frame of [495, 500]) {
      const output = report.outputs.find((item) => item.family === family && item.frame === frame);
      const oldRecord = manifests[family].frames[frame - 1];
      if (
        !output
        || output.pixels?.width !== dimensions.width
        || output.pixels?.height !== dimensions.height
        || output.pixels?.minimumRgb !== 0
        || output.pixels?.maximumRgb !== 0
        || output.pixels?.exactBlackRgb !== true
        || output.pixels?.nonBlackRgbSamples !== 0
        || output.masterComparison?.zeroPixelDifference !== true
        || output.masterComparison?.differentRgbSamples !== 0
        || output.masterComparison?.maximumAbsoluteRgbDifference !== 0
        || output.masterComparison?.masterBytes !== oldRecord.bytes
        || output.masterComparison?.masterSha256 !== oldRecord.sha256
      ) throw new Error(`${family} F${frame} black-boundary parity mismatch`);
    }
  }
  return true;
}

async function validateRepositoryAuthorities() {
  await assertExactFile(SOURCE, SOURCE_BYTES, SOURCE_SHA256, "accepted R2.1 Blender source");
  const boundaryInfo = await stat(BOUNDARY_REPORT);
  const boundarySha256 = await sha256File(BOUNDARY_REPORT);
  if (boundarySha256 !== BOUNDARY_REPORT_SHA256) {
    throw new Error(`black-boundary report hash mismatch: ${boundarySha256}`);
  }
  const manifests = await loadOldFrameManifests();
  const boundary = await readJson(BOUNDARY_REPORT, "black-boundary report");
  validateBoundaryReportData(boundary, manifests);
  return {
    manifests,
    boundary,
    boundaryAuthority: { bytes: boundaryInfo.size, sha256: boundarySha256 },
  };
}

function newLedger() {
  return {
    schema: LEDGER_SCHEMA,
    status: "PREPARED",
    source: {
      relativePath: "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/source/quantum-signal-television-phase4r2-1-causal-current.blend",
      bytes: SOURCE_BYTES,
      sha256: SOURCE_SHA256,
    },
    blackBoundaryProof: {
      relativePath: "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/review/pilots/black-boundary-production-report.json",
      sha256: BOUNDARY_REPORT_SHA256,
    },
    timeline: {
      fps: FPS,
      physicalFrames: [1, FRAME_COUNT],
      affectedRenderedFrames: [AFFECTED_START, AFFECTED_END],
      exactReusedFrames: [[1, 45], [495, 500]],
    },
    families: Object.fromEntries(Object.entries(FAMILIES).map(([family, value]) => [family, {
      camera: value.camera,
      cableCollection: value.cableCollection,
      resolution: [value.width, value.height],
      expectedAffectedFrames: AFFECTED_END - AFFECTED_START + 1,
      validAffectedFrames: 0,
      settingsSha256: null,
      frames: {},
      activeChunk: null,
      completedChunks: [],
    }])),
    authorization: {
      affectedFramesOnly: true,
      fullRerender: false,
      vp9: false,
      mergeMain: false,
      phase5: false,
    },
  };
}

async function loadOrCreateLedger(config) {
  let ledger;
  try {
    ledger = await readJson(config.ledger, "R2.1 production ledger");
  } catch (error) {
    if (error.cause?.code !== "ENOENT") throw error;
    ledger = newLedger();
    await atomicJson(config.ledger, ledger);
  }
  if (
    ledger.schema !== LEDGER_SCHEMA
    || ledger.source?.sha256 !== SOURCE_SHA256
    || ledger.blackBoundaryProof?.sha256 !== BOUNDARY_REPORT_SHA256
    || ledger.timeline?.affectedRenderedFrames?.[0] !== AFFECTED_START
    || ledger.timeline?.affectedRenderedFrames?.[1] !== AFFECTED_END
  ) throw new Error("R2.1 production ledger authority mismatch");
  return ledger;
}

async function loadExistingLedger(config) {
  const ledger = await readJson(config.ledger, "R2.1 production ledger");
  if (
    ledger.schema !== LEDGER_SCHEMA
    || ledger.source?.sha256 !== SOURCE_SHA256
    || ledger.blackBoundaryProof?.sha256 !== BOUNDARY_REPORT_SHA256
  ) throw new Error("R2.1 production ledger authority mismatch");
  return ledger;
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

async function acquireLock(config, command, options) {
  await ensureExternalOutputRoot(config);
  const value = {
    schema: LOCK_SCHEMA,
    token: randomUUID(),
    processId: process.pid,
    command,
    sourceSha256: SOURCE_SHA256,
    boundaryReportSha256: BOUNDARY_REPORT_SHA256,
    childProcessId: null,
    blenderProcessId: null,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(config.lockFile, "wx");
      try {
        await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return value;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readJson(config.lockFile, "existing R2.1 production lock");
      const validAuthority = (
        existing.schema === LOCK_SCHEMA
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing.token ?? "")
        && existing.sourceSha256 === SOURCE_SHA256
        && existing.boundaryReportSha256 === BOUNDARY_REPORT_SHA256
      );
      const pids = [existing.processId, existing.childProcessId, existing.blenderProcessId]
        .filter((pid) => Number.isInteger(pid) && pid > 0);
      const live = [...new Set(pids)].filter(processIsAlive);
      if (live.length) throw new Error(`R2.1 production is already active under PID(s) ${live.join(",")}`);
      if (!options["recover-stale-lock"]) {
        throw new Error("stale R2.1 production lock found; rerun with --recover-stale-lock after process review");
      }
      const quarantine = path.join(config.outputRoot, "quarantine", "locks");
      await mkdir(quarantine, { recursive: true });
      const classification = validAuthority ? "stale" : "invalid";
      await rename(config.lockFile, path.join(quarantine, `${classification}-${randomUUID()}.json`));
    }
  }
  throw new Error("could not acquire the R2.1 production lock");
}

async function updateLockChild(config, authority, childProcessId) {
  if (!Number.isInteger(childProcessId) || childProcessId <= 0) {
    throw new Error("production child did not expose a valid process ID");
  }
  const lock = await readJson(config.lockFile, "R2.1 production lock");
  if (lock.token !== authority.token || lock.processId !== process.pid) {
    throw new Error("R2.1 production lock changed before child registration");
  }
  lock.childProcessId = childProcessId;
  await atomicJson(config.lockFile, lock);
}

function superviseChild(child) {
  return new Promise((resolve) => {
    child.once("error", (error) => resolve({ spawnError: error, code: null, signal: null }));
    child.once("close", (code, signal) => resolve({ spawnError: null, code, signal }));
  });
}

async function stopSupervisedChild(child, outcomePromise) {
  if (child.exitCode === null && child.signalCode === null && Number.isInteger(child.pid)) {
    try { child.kill(); } catch {}
  }
  return outcomePromise;
}

async function clearRegisteredChild(config, lock) {
  const latest = await readJson(config.lockFile, "R2.1 production lock");
  if (latest.token !== lock.token || latest.processId !== process.pid) {
    throw new Error("R2.1 lock changed while a production child was running");
  }
  latest.childProcessId = null;
  latest.blenderProcessId = null;
  await atomicJson(config.lockFile, latest);
}

async function releaseLock(config, authority) {
  const lock = await readJson(config.lockFile, "R2.1 production lock");
  if (lock.token !== authority.token || lock.processId !== process.pid) {
    throw new Error("R2.1 production lock authority changed before release");
  }
  await unlink(config.lockFile);
}

async function withLock(config, command, options, callback) {
  await canonicalDurableRoots(config);
  const authority = await acquireLock(config, command, options);
  let primaryError;
  try {
    return await callback(authority);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await releaseLock(config, authority);
    } catch (error) {
      if (!primaryError) throw error;
      console.error(`LOCK_RELEASE_ERROR=${error.message}`);
    }
  }
}

async function runLogged(config, lock, executable, args, label) {
  const logDirectory = path.join(config.outputRoot, "logs");
  await mkdir(logDirectory, { recursive: true });
  const logPath = path.join(logDirectory, `${label}-${randomUUID().slice(0, 8)}.log`);
  const stream = createWriteStream(logPath, { flags: "wx" });
  const logFailure = new Promise((resolve) => {
    stream.once("error", (error) => resolve({ logError: error }));
  });
  const child = spawn(executable, args, { cwd: REPO_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const childOutcome = superviseChild(child);
  child.stdout.on("data", (chunk) => {
    if (!stream.destroyed) stream.write(chunk);
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    if (!stream.destroyed) stream.write(chunk);
    process.stderr.write(chunk);
  });
  try {
    await updateLockChild(config, lock, child.pid);
  } catch (error) {
    await stopSupervisedChild(child, childOutcome);
    stream.destroy();
    throw error;
  }
  const result = await Promise.race([childOutcome, logFailure]);
  if (result.logError) {
    await stopSupervisedChild(child, childOutcome);
    await clearRegisteredChild(config, lock);
    stream.destroy();
    throw new Error(`${label} process log failed`, { cause: result.logError });
  }
  await Promise.race([
    new Promise((resolve) => stream.end(resolve)),
    logFailure.then(({ logError }) => { throw new Error(`${label} process log failed`, { cause: logError }); }),
  ]);
  await clearRegisteredChild(config, lock);
  if (result.spawnError) throw new Error(`${label} could not start`, { cause: result.spawnError });
  if (result.code !== 0) throw new Error(`${label} failed with exit code ${result.code}${result.signal ? ` signal ${result.signal}` : ""}`);
  return { logBasename: path.basename(logPath) };
}

async function runCaptured(config, lock, executable, args, label) {
  const chunks = [];
  const errors = [];
  const child = spawn(executable, args, { cwd: REPO_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const childOutcome = superviseChild(child);
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stderr.on("data", (chunk) => errors.push(chunk));
  try {
    await updateLockChild(config, lock, child.pid);
  } catch (error) {
    await stopSupervisedChild(child, childOutcome);
    throw error;
  }
  const result = await childOutcome;
  await clearRegisteredChild(config, lock);
  if (result.spawnError) throw new Error(`${label} could not start`, { cause: result.spawnError });
  if (result.code !== 0) {
    throw new Error(`${label} failed with exit code ${result.code}: ${Buffer.concat(errors).toString("utf8")}`);
  }
  return { stdout: Buffer.concat(chunks), stderr: Buffer.concat(errors) };
}

async function copyImmutableSource(config) {
  await mkdir(path.dirname(config.immutableSource), { recursive: true });
  try {
    return await assertExactFile(config.immutableSource, SOURCE_BYTES, SOURCE_SHA256, "external immutable source");
  } catch (error) {
    if (error.cause?.code !== "ENOENT" && !String(error.message).includes("ENOENT")) throw error;
  }
  const temporary = `${config.immutableSource}.partial-${process.pid}`;
  await copyFile(config.source, temporary, fsConstants.COPYFILE_EXCL);
  await assertExactFile(temporary, SOURCE_BYTES, SOURCE_SHA256, "copied immutable source");
  await rename(temporary, config.immutableSource);
  await chmod(config.immutableSource, 0o444);
  return assertExactFile(config.immutableSource, SOURCE_BYTES, SOURCE_SHA256, "external immutable source");
}

async function validateFrameFile(filePath, record, family) {
  const dimensions = FAMILIES[family];
  const authority = await assertExactFile(filePath, record.bytes, record.sha256, `${family} ${record.file}`);
  const header = await pngHeader(filePath);
  if (
    header.width !== dimensions.width
    || header.height !== dimensions.height
    || header.bitDepth !== 16
    || header.colorType !== 2
    || header.interlaced !== 0
  ) throw new Error(`${family} ${record.file} PNG authority mismatch`);
  return { ...authority, ...header };
}

async function materializeReusedFrames(config, manifests) {
  const counts = { hardlinks: 0, exactExisting: 0, copies: 0 };
  for (const family of Object.keys(FAMILIES)) {
    const targetDirectory = path.join(config.outputRoot, "masters", family, "frames");
    await mkdir(targetDirectory, { recursive: true });
    for (const frame of reusedFrames()) {
      const record = manifests[family].frames[frame - 1];
      const source = path.join(config.oldRoot, "masters", family, "frames", record.file);
      const destination = path.join(targetDirectory, record.file);
      await validateFrameFile(source, record, family);
      try {
        await validateFrameFile(destination, record, family);
        counts.exactExisting += 1;
        continue;
      } catch (error) {
        if (error.cause?.code !== "ENOENT" && !String(error.message).includes("ENOENT")) {
          throw new Error(`existing reused destination is invalid and was preserved: ${family}/${record.file}`, { cause: error });
        }
      }
      try {
        await link(source, destination);
        counts.hardlinks += 1;
      } catch (error) {
        if (!["EXDEV", "EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) throw error;
        await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
        counts.copies += 1;
      }
      await validateFrameFile(destination, record, family);
    }
  }
  return counts;
}

function blenderArguments(config, lock, mode, family = "desktop", frames = []) {
  return [
    "-b", config.immutableSource,
    "--python", config.worker,
    "--",
    "--mode", mode,
    "--output-root", config.outputRoot,
    "--family", family,
    ...(frames.length ? ["--frames", frames.join(",")] : []),
    "--required-source-sha", SOURCE_SHA256,
    "--required-boundary-report-sha", BOUNDARY_REPORT_SHA256,
    "--lock-file", config.lockFile,
    "--lock-token", lock.token,
  ];
}

async function preflight(config, options) {
  return withLock(config, "preflight", options, async (lock) => {
    const authorities = await validateRepositoryAuthorities();
    await Promise.all([access(config.blender), access(config.worker)]);
    await loadOrCreateLedger(config);
    await copyImmutableSource(config);
    const materialized = await materializeReusedFrames(config, authorities.manifests);
    const processRecord = await runLogged(
      config,
      lock,
      config.blender,
      blenderArguments(config, lock, "preflight"),
      "blender-preflight",
    );
    const report = {
      schema: "quantum-hub.phase-4-r2-1.partial-production-controller-preflight.v1",
      status: "PASS",
      source: { bytes: SOURCE_BYTES, sha256: SOURCE_SHA256 },
      blackBoundaryProof: authorities.boundaryAuthority,
      framePolicy: {
        exactReusedPerFamily: reusedFrames().length,
        affectedRenderedPerFamily: affectedFrames().length,
        completeSequencePerFamily: FRAME_COUNT,
      },
      reusedFrameMaterialization: materialized,
      externalAuthority: {
        outputRootBasename: path.basename(config.outputRoot),
        priorRootBasename: path.basename(config.oldRoot),
        rawFramesTracked: false,
        processLogPackaged: false,
      },
      process: processRecord,
      authorization: { fullRerender: false, vp9: false, mergeMain: false, phase5: false },
    };
    await atomicJson(path.join(config.outputRoot, "reports", "phase-4r2-1-controller-preflight.json"), report);
    return report;
  });
}

function familyOption(options, allowAll = false) {
  const family = String(options.family ?? (allowAll ? "all" : ""));
  if (family === "all" && allowAll) return family;
  if (!(family in FAMILIES)) throw new Error(`--family must be one of ${Object.keys(FAMILIES).join(",")}${allowAll ? ",all" : ""}`);
  return family;
}

function explicitFrames(options) {
  const values = [];
  if (options.frames) values.push(...String(options.frames).split(",").filter(Boolean).map(Number));
  if (options.start !== undefined || options.end !== undefined) {
    const start = Number(options.start);
    const end = Number(options.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      throw new Error("--start and --end must be an ordered integer pair");
    }
    for (let frame = start; frame <= end; frame += 1) values.push(frame);
  }
  const frames = [...new Set(values)].sort((a, b) => a - b);
  if (frames.some((frame) => !Number.isInteger(frame) || frame < AFFECTED_START || frame > AFFECTED_END)) {
    throw new Error("R2.1 render requests are hard-limited to F46-F494");
  }
  return frames;
}

async function validAffectedReceipt(config, ledger, family, frame) {
  const receiptPath = path.join(config.outputRoot, "masters", family, "receipts", `F${String(frame).padStart(3, "0")}.json`);
  const framePath = path.join(config.outputRoot, "masters", family, "frames", `F${String(frame).padStart(3, "0")}.png`);
  try {
    const receipt = await readJson(receiptPath, `${family} F${frame} receipt`);
    const info = await stat(framePath);
    const digest = await sha256File(framePath);
    const header = await pngHeader(framePath);
    const dimensions = FAMILIES[family];
    if (
      receipt.schema !== RECEIPT_SCHEMA
      || receipt.status !== "PASS"
      || receipt.family !== family
      || receipt.frame !== frame
      || receipt.sourceSha256 !== SOURCE_SHA256
      || receipt.blackBoundaryReportSha256 !== BOUNDARY_REPORT_SHA256
      || receipt.settingsSha256 !== ledger.families[family].settingsSha256
      || receipt.file?.bytes !== info.size
      || receipt.file?.sha256 !== digest
      || header.width !== dimensions.width
      || header.height !== dimensions.height
      || header.bitDepth !== 16
      || header.colorType !== 2
      || header.interlaced !== 0
    ) return null;
    return { receipt, info, digest, header };
  } catch {
    return null;
  }
}

async function chooseRenderFrames(config, ledger, family, options) {
  const explicit = explicitFrames(options);
  if (explicit.length) return explicit;
  const missing = [];
  for (const frame of affectedFrames()) {
    if (!await validAffectedReceipt(config, ledger, family, frame)) missing.push(frame);
  }
  const count = Number(options.count ?? 24);
  if (!Number.isInteger(count) || count < 1 || count > affectedFrames().length) {
    throw new Error("--count must be between 1 and 449");
  }
  return missing.slice(0, count);
}

async function assertPreflight(config, ledger) {
  if (ledger.preflight?.status !== "PASS") throw new Error("run R2.1 preflight before affected-frame work");
  const report = await readJson(
    path.join(config.outputRoot, "reports", "phase-4r2-1-source-preflight.json"),
    "Blender R2.1 preflight",
  );
  if (
    report.status !== "PASS"
    || report.source?.sha256 !== SOURCE_SHA256
    || report.blackBoundaryReportSha256 !== BOUNDARY_REPORT_SHA256
  ) throw new Error("Blender R2.1 preflight authority mismatch");
  await assertExactFile(config.immutableSource, SOURCE_BYTES, SOURCE_SHA256, "external immutable source");
}

async function renderPlan(config, options) {
  await canonicalDurableRoots(config);
  await validateRepositoryAuthorities();
  const family = familyOption(options);
  const ledger = await loadExistingLedger(config);
  await assertPreflight(config, ledger);
  const frames = await chooseRenderFrames(config, ledger, family, options);
  return {
    schema: "quantum-hub.phase-4-r2-1.render-plan.v1",
    status: frames.length ? "READY" : "COMPLETE",
    family,
    frames,
    affectedAuthority: [AFFECTED_START, AFFECTED_END],
    sourceSha256: SOURCE_SHA256,
    blackBoundaryReportSha256: BOUNDARY_REPORT_SHA256,
    command: frames.length
      ? `node scripts/phase4r2-1-production.mjs render --family ${family} --frames ${frames.join(",")}`
      : null,
  };
}

async function renderAffected(config, options) {
  return withLock(config, "render", options, async (lock) => {
    await validateRepositoryAuthorities();
    await access(config.blender);
    const family = familyOption(options);
    const ledger = await loadOrCreateLedger(config);
    await assertPreflight(config, ledger);
    const frames = await chooseRenderFrames(config, ledger, family, options);
    if (!frames.length) return { status: "COMPLETE", family, frames: [] };
    const processRecord = await runLogged(
      config,
      lock,
      config.blender,
      blenderArguments(config, lock, "render", family, frames),
      `blender-render-${family}-F${frames[0]}-F${frames.at(-1)}`,
    );
    return { status: "PASS", family, frames, process: processRecord };
  });
}

async function reconcileFamily(config, ledger, manifests, family) {
  const records = [];
  const issues = [];
  for (let frame = 1; frame <= FRAME_COUNT; frame += 1) {
    const file = `F${String(frame).padStart(3, "0")}.png`;
    const framePath = path.join(config.outputRoot, "masters", family, "frames", file);
    if (frame < AFFECTED_START || frame > AFFECTED_END) {
      const prior = manifests[family].frames[frame - 1];
      try {
        const value = await validateFrameFile(framePath, prior, family);
        records.push({
          frame, file, ...value,
          provenance: { mode: "exact-reuse", sourceBlendSha256: PRIOR_SOURCE_SHA256 },
        });
      } catch (error) {
        issues.push({ frame, kind: "reused-frame-invalid", detail: privacySafeMessage(error, config) });
      }
      continue;
    }
    const value = await validAffectedReceipt(config, ledger, family, frame);
    if (!value) {
      issues.push({ frame, kind: "affected-frame-missing-or-invalid" });
      continue;
    }
    records.push({
      frame,
      file,
      bytes: value.info.size,
      sha256: value.digest,
      ...value.header,
      provenance: { mode: "r2-1-affected-render", sourceBlendSha256: SOURCE_SHA256 },
    });
  }
  records.sort((a, b) => a.frame - b.frame);
  const complete = records.length === FRAME_COUNT && issues.length === 0;
  const state = ledger.families[family];
  state.validAffectedFrames = records.filter((record) => record.provenance.mode === "r2-1-affected-render").length;
  state.missingOrInvalidAffectedFrames = issues
    .filter((issue) => issue.frame >= AFFECTED_START && issue.frame <= AFFECTED_END)
    .map((issue) => issue.frame);
  state.completeSequenceValid = complete;
  const manifest = complete ? {
    schema: "quantum-hub.phase-4-r2-1.frame-manifest.v1",
    family,
    source: {
      blendSha256: SOURCE_SHA256,
      priorUnaffectedBlendSha256: PRIOR_SOURCE_SHA256,
      blackBoundaryReportSha256: BOUNDARY_REPORT_SHA256,
      camera: FAMILIES[family].camera,
      settingsSha256: state.settingsSha256,
    },
    master: {
      frames: FRAME_COUNT,
      fps: FPS,
      resolution: [FAMILIES[family].width, FAMILIES[family].height],
      affectedRenderedFrames: AFFECTED_END - AFFECTED_START + 1,
      exactReusedFrames: reusedFrames().length,
      sequenceSha256: canonicalHash(records.map(({ frame, bytes, sha256 }) => ({ frame, bytes, sha256 }))),
    },
    frames: records,
  } : null;
  if (manifest) {
    await atomicJson(
      path.join(config.outputRoot, "manifests", `phase-4r2-1-${family}-frame-manifest.json`),
      manifest,
    );
  }
  return { family, complete, validFrames: records.length, issues, manifest };
}

async function reconcileAll(config, options = {}) {
  const authorities = await validateRepositoryAuthorities();
  const ledger = await loadOrCreateLedger(config);
  await assertPreflight(config, ledger);
  const requested = options.family ? familyOption(options, true) : "all";
  const families = requested === "all" ? Object.keys(FAMILIES) : [requested];
  const results = [];
  for (const family of families) {
    results.push(await reconcileFamily(config, ledger, authorities.manifests, family));
  }
  const allComplete = results.every((result) => result.complete);
  ledger.status = Object.values(ledger.families).every((state) => state.completeSequenceValid)
    ? "COMPLETE_500_FRAME_SEQUENCES"
    : "AFFECTED_RENDER_PARTIAL";
  await atomicJson(config.ledger, ledger);
  const report = {
    schema: "quantum-hub.phase-4-r2-1.sequence-reconciliation.v1",
    status: allComplete ? "PASS" : "PARTIAL",
    sourceSha256: SOURCE_SHA256,
    blackBoundaryReportSha256: BOUNDARY_REPORT_SHA256,
    families: results.map(({ family, complete, validFrames, issues, manifest }) => ({
      family,
      complete,
      validFrames,
      issueCount: issues.length,
      issues,
      sequenceSha256: manifest?.master.sequenceSha256 ?? null,
    })),
    policy: { rawFramesTracked: false, fullRerender: false, phase5: false },
  };
  await atomicJson(path.join(config.outputRoot, "reports", "phase-4r2-1-sequence-reconciliation.json"), report);
  if (options["require-complete"] && !allComplete) {
    throw new Error("complete validated 500-frame sequences are required");
  }
  return { report, results, ledger };
}

export function buildEncodeArguments(family, inputPattern, outputPath, crf = 22) {
  if (!(family in FAMILIES)) throw new Error(`unknown family: ${family}`);
  if (![16, 19, 22].includes(Number(crf))) throw new Error("H.264 CRF must be 16, 19, or 22");
  const { width, height } = FAMILIES[family];
  return [
    "-hide_banner", "-nostdin", "-y", "-v", "warning", "-xerror",
    "-f", "image2", "-framerate", String(FPS), "-start_number", "1", "-i", inputPattern,
    "-map", "0:v:0", "-frames:v", String(FRAME_COUNT), "-an",
    "-map_metadata", "-1", "-map_chapters", "-1",
    "-vf", `zscale=w=${width}:h=${height}:f=lanczos:rin=full:r=limited:min=gbr:m=bt709:tin=iec61966-2-1:t=bt709:pin=bt709:p=bt709:d=error_diffusion,format=yuv420p`,
    "-r", String(FPS), "-fps_mode", "cfr", "-pix_fmt", "yuv420p",
    "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709",
    "-fflags", "+bitexact", "-metadata", "encoder=", "-metadata:s:v:0", "encoder=",
    "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high",
    "-g", "12", "-keyint_min", "12", "-sc_threshold", "0", "-flags:v", "+cgop+bitexact",
    "-x264-params", "keyint=12:min-keyint=12:scenecut=0:open-gop=0:aq-mode=3:aq-strength=1.0",
    "-threads:v", "8", "-movflags", "+faststart", "-video_track_timescale", "30000", "-f", "mp4",
    outputPath,
  ];
}

async function probeVideo(config, lock, family, filePath, label) {
  const probeOutput = path.join(config.outputRoot, "reports", `${label}-ffprobe.raw.json`);
  await mkdir(path.dirname(probeOutput), { recursive: true });
  const args = [
    "-v", "error", "-count_frames", "-show_frames",
    "-show_entries", "stream=index,codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_frames,color_range,color_space,color_transfer,color_primaries:format=duration,format_name:frame=key_frame",
    "-of", "json", filePath,
  ];
  const captured = await runCaptured(config, lock, config.ffprobe, args, `${label}-ffprobe`);
  const probe = JSON.parse(captured.stdout.toString("utf8"));
  await atomicJson(probeOutput, probe);
  const validation = validateVideoProbe(family, probe);
  await runLogged(config, lock, config.ffmpeg, [
    "-hide_banner", "-nostdin", "-v", "error", "-xerror", "-i", filePath,
    "-map", "0:v:0", "-frames:v", String(FRAME_COUNT), "-f", "null", "-",
  ], `${label}-decode`);
  return { ...validation, fullDecode: "PASS" };
}

export function validateVideoProbe(family, probe) {
  if (!(family in FAMILIES)) throw new Error(`unknown family: ${family}`);
  const streams = probe.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const dimensions = FAMILIES[family];
  const durationSeconds = Number(probe.format?.duration);
  const formatNames = String(probe.format?.format_name ?? "").split(",");
  const frameRecords = probe.frames ?? [];
  const keyframeIndexes = frameRecords
    .map((frame, index) => Number(frame.key_frame) === 1 ? index : null)
    .filter((index) => index !== null);
  const expectedKeyframeIndexes = Array.from(
    { length: Math.floor((FRAME_COUNT - 1) / 12) + 1 },
    (_, index) => index * 12,
  );
  if (
    streams.length !== 1
    || streams.filter((stream) => stream.codec_type === "video").length !== 1
    || video?.codec_name !== "h264"
    || video?.profile !== "High"
    || video?.width !== dimensions.width
    || video?.height !== dimensions.height
    || video?.pix_fmt !== "yuv420p"
    || video?.r_frame_rate !== "30/1"
    || video?.avg_frame_rate !== "30/1"
    || Number(video?.nb_read_frames) !== FRAME_COUNT
    || video?.color_range !== "tv"
    || video?.color_space !== "bt709"
    || video?.color_transfer !== "bt709"
    || video?.color_primaries !== "bt709"
    || !formatNames.includes("mp4")
    || !Number.isFinite(durationSeconds)
    || Math.abs(durationSeconds - FRAME_COUNT / FPS) > 0.02
    || frameRecords.length !== FRAME_COUNT
    || JSON.stringify(keyframeIndexes) !== JSON.stringify(expectedKeyframeIndexes)
  ) throw new Error(`${family} H.264 delivery probe authority mismatch`);
  return {
    codec: video.codec_name,
    profile: video.profile,
    container: formatNames,
    pixelFormat: video.pix_fmt,
    resolution: [video.width, video.height],
    averageFrameRate: video.avg_frame_rate,
    frames: Number(video.nb_read_frames),
    durationSeconds,
    audioStreams: 0,
    color: {
      range: video.color_range,
      space: video.color_space,
      transfer: video.color_transfer,
      primaries: video.color_primaries,
    },
    keyframeInterval: 12,
    keyframeIndexes,
  };
}

async function moveToQuarantine(config, filePath, reason) {
  const directory = path.join(config.outputRoot, "quarantine", "media", reason);
  await mkdir(directory, { recursive: true });
  await rename(filePath, path.join(directory, `${randomUUID().slice(0, 8)}-${path.basename(filePath)}`));
}

function selectedMediaPath(config, selection, family) {
  if (
    selection?.schema !== "quantum-hub.phase-4-r2-1.h264-selection.v1"
    || selection?.status !== "PASS"
    || selection?.family !== family
    || typeof selection?.file !== "string"
    || !Number.isInteger(selection?.bytes)
    || !isSha256(selection?.sha256)
    || selection.file !== activeVideoRelativePath(family, selection.sha256)
  ) throw new Error(`${family} H.264 selection structure mismatch`);
  const deliveryRoot = path.resolve(config.outputRoot, "delivery");
  const candidate = path.resolve(deliveryRoot, selection.file);
  if (!pathIsWithin(deliveryRoot, candidate)) throw new Error(`${family} H.264 selection escapes delivery root`);
  return candidate;
}

async function encodeFamily(config, lock, family, crf) {
  const manifestPath = path.join(config.outputRoot, "manifests", `phase-4r2-1-${family}-frame-manifest.json`);
  const manifestPayload = await readFile(manifestPath);
  const manifest = JSON.parse(manifestPayload.toString("utf8"));
  const manifestSha256 = createHash("sha256").update(manifestPayload).digest("hex");
  if (
    manifest.schema !== "quantum-hub.phase-4-r2-1.frame-manifest.v1"
    || manifest.source?.blendSha256 !== SOURCE_SHA256
    || manifest.source?.blackBoundaryReportSha256 !== BOUNDARY_REPORT_SHA256
    || manifest.master?.frames !== FRAME_COUNT
  ) throw new Error(`${family} complete frame-manifest authority mismatch`);
  const selectionPath = path.join(config.outputRoot, "delivery", `phase-4r2-1-${family}-h264-selection.json`);
  let existing = null;
  try {
    existing = await readJson(selectionPath, `${family} H.264 selection`);
  } catch (error) {
    if (error.cause?.code !== "ENOENT") throw error;
  }
  if (existing) {
    const existingPath = selectedMediaPath(config, existing, family);
    if (
      existing.sourceBlendSha256 === SOURCE_SHA256
      && existing.blackBoundaryReportSha256 === BOUNDARY_REPORT_SHA256
      && existing.frameManifestSha256 === manifestSha256
      && existing.crf === crf
    ) {
      await assertExactFile(existingPath, existing.bytes, existing.sha256, `${family} existing H.264 delivery`);
      await probeVideo(config, lock, family, existingPath, `phase-4r2-1-${family}-h264-existing`);
      return existing;
    }
  }
  const candidateDirectory = path.join(config.outputRoot, "delivery", "candidates", family);
  await mkdir(candidateDirectory, { recursive: true });
  const partialPath = path.join(candidateDirectory, `${family}-h264-crf${crf}.partial-${randomUUID()}.mp4`);
  const inputPattern = path.join(config.outputRoot, "masters", family, "frames", "F%03d.png");
  const args = buildEncodeArguments(family, inputPattern, partialPath, crf);
  const processRecord = await runLogged(config, lock, config.ffmpeg, args, `ffmpeg-encode-${family}-crf${crf}`);
  const info = await stat(partialPath);
  const digest = await sha256File(partialPath);
  const mediaName = activeVideoRelativePath(family, digest);
  const finalPath = path.join(config.outputRoot, "delivery", mediaName);
  await mkdir(path.dirname(finalPath), { recursive: true });
  try {
    await access(finalPath);
    const finalDigest = await sha256File(finalPath);
    if (finalDigest !== digest || (await stat(finalPath)).size !== info.size) {
      throw new Error(`${family} hash-named H.264 destination collision`);
    }
    await moveToQuarantine(config, partialPath, "duplicate-exact-encode");
  } catch (error) {
    if (error?.code === "ENOENT") await rename(partialPath, finalPath);
    else if (!String(error.message).includes("collision") && !String(error.message).includes("duplicate")) throw error;
    else if (String(error.message).includes("collision")) throw error;
  }
  const validation = await probeVideo(config, lock, family, finalPath, `phase-4r2-1-${family}-h264`);
  const selection = {
    schema: "quantum-hub.phase-4-r2-1.h264-selection.v1",
    status: "PASS",
    family,
    file: mediaName,
    bytes: info.size,
    sha256: digest,
    sourceBlendSha256: SOURCE_SHA256,
    blackBoundaryReportSha256: BOUNDARY_REPORT_SHA256,
    frameManifestSha256: manifestSha256,
    crf,
    encode: {
      codec: "libx264",
      preset: "slow",
      profile: "high",
      keyframeInterval: 12,
      pixelFormat: "yuv420p",
      color: "BT.709 limited range",
      deterministicMetadata: true,
      argv: buildEncodeArguments(family, "<COMBINED_VALIDATED_SEQUENCE>/F%03d.png", "<OUTPUT>.mp4", crf),
      argvSha256: canonicalHash(buildEncodeArguments(family, "<COMBINED_VALIDATED_SEQUENCE>/F%03d.png", "<OUTPUT>.mp4", crf)),
    },
    validation,
    process: processRecord,
    authorization: { h264Only: true, vp9: false, phase5: false },
  };
  await atomicJson(selectionPath, selection);
  return selection;
}

async function encode(config, options) {
  return withLock(config, "encode", options, async (lock) => {
    await validateRepositoryAuthorities();
    const toolchain = await validateMediaToolchain(config);
    const crf = Number(options.crf ?? 22);
    if (![16, 19, 22].includes(crf)) throw new Error("--crf must be 16, 19, or 22");
    const reconciled = await reconcileAll(config, { family: options.family ?? "all", "require-complete": true });
    const families = options.family && options.family !== "all"
      ? [familyOption(options)]
      : reconciled.results.map((result) => result.family);
    const selections = [];
    for (const family of families) selections.push(await encodeFamily(config, lock, family, crf));
    return { status: "PASS", toolchain, selections };
  });
}

async function copyPoster(config, family, asset, frameManifest) {
  const source = path.join(PRIOR_AUTHORITY_ROOT, asset.file);
  await assertExactFile(source, asset.bytes, asset.sha256, `${family} prior poster`);
  if (
    asset.masterF1Sha256 !== frameManifest.firstFrameSha256
    || JSON.stringify(asset.resolution) !== JSON.stringify(frameManifest.resolution)
  ) throw new Error(`${family} reused poster is not bound to the unchanged active F1`);
  const name = activePosterRelativePath(family, asset.sha256);
  const destination = path.join(config.outputRoot, "delivery", name);
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await assertExactFile(destination, asset.bytes, asset.sha256, `${family} reused poster`);
  } catch (error) {
    if (error.cause?.code !== "ENOENT" && !String(error.message).includes("ENOENT")) throw error;
    await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
    await assertExactFile(destination, asset.bytes, asset.sha256, `${family} reused poster`);
  }
  return {
    bytes: asset.bytes,
    deliveryDecision: asset.deliveryDecision,
    deliveryResolution: asset.deliveryResolution,
    derivationAuthority: asset.derivationAuthority,
    derivationAuthoritySha256: asset.derivationAuthoritySha256,
    family,
    file: name,
    kind: "poster",
    masterF1Sha256: frameManifest.firstFrameSha256,
    masterFrameManifestSha256: frameManifest.sha256,
    masterResolution: asset.masterResolution,
    resolution: frameManifest.resolution,
    sha256: asset.sha256,
  };
}

async function finalize(config, options) {
  return withLock(config, "finalize", options, async (lock) => {
    await validateRepositoryAuthorities();
    const toolchain = await validateMediaToolchain(config);
    const { results } = await reconcileAll(config, { family: "all", "require-complete": true });
    const assets = [];
    const frameManifests = {};
    for (const result of results) {
      const family = result.family;
      const manifestPath = path.join(config.outputRoot, "manifests", `phase-4r2-1-${family}-frame-manifest.json`);
      const partialManifestPayload = await readFile(manifestPath);
      const partialManifestSha256 = createHash("sha256").update(partialManifestPayload).digest("hex");
      const activeFrameManifest = buildActiveFrameManifest(family, result.manifest);
      const deliveryManifestPath = path.join(
        config.outputRoot,
        "delivery",
        activeFrameManifestRelativePath(family),
      );
      await atomicJson(deliveryManifestPath, activeFrameManifest);
      const activeManifestPayload = await readFile(deliveryManifestPath);
      frameManifests[family] = {
        file: activeFrameManifestRelativePath(family),
        bytes: activeManifestPayload.length,
        sha256: createHash("sha256").update(activeManifestPayload).digest("hex"),
        sequenceSha256: activeFrameManifest.master.sequenceSha256,
        frames: FRAME_COUNT,
        fps: FPS,
        resolution: activeFrameManifest.master.resolution,
        firstFrameSha256: activeFrameManifest.frames[0].sha256,
      };
      const selection = await readJson(
        path.join(config.outputRoot, "delivery", `phase-4r2-1-${family}-h264-selection.json`),
        `${family} H.264 selection`,
      );
      if (
        selection.sourceBlendSha256 !== SOURCE_SHA256
        || selection.blackBoundaryReportSha256 !== BOUNDARY_REPORT_SHA256
        || selection.frameManifestSha256 !== partialManifestSha256
        || ![16, 19, 22].includes(selection.crf)
        || selection.encode?.codec !== "libx264"
        || selection.validation?.frames !== FRAME_COUNT
        || selection.validation?.fullDecode !== "PASS"
        || selection.authorization?.h264Only !== true
        || selection.authorization?.vp9 !== false
      ) throw new Error(`${family} H.264 selection is not bound to the current complete sequence`);
      const mediaPath = selectedMediaPath(config, selection, family);
      await assertExactFile(mediaPath, selection.bytes, selection.sha256, `${family} H.264 delivery`);
      const validation = await probeVideo(config, lock, family, mediaPath, `phase-4r2-1-${family}-h264-final`);
      assets.push({
        bytes: selection.bytes,
        codec: "h264",
        durationSeconds: FRAME_COUNT / FPS,
        family,
        file: selection.file,
        fps: FPS,
        frames: FRAME_COUNT,
        kind: "video",
        masterFrameManifestSha256: frameManifests[family].sha256,
        resolution: frameManifests[family].resolution,
        crf: selection.crf,
        sha256: selection.sha256,
        validation,
      });
    }
    const priorManifestPath = path.join(
      PRIOR_AUTHORITY_ROOT,
      "manifests",
      "phase-4r2-production-media-manifest.json",
    );
    await assertExactFile(
      priorManifestPath,
      PRIOR_MEDIA_MANIFEST.bytes,
      PRIOR_MEDIA_MANIFEST.sha256,
      "prior production media manifest",
    );
    const priorManifest = await readJson(
      priorManifestPath,
      "prior production media manifest",
    );
    const posters = priorManifest.assets?.filter((asset) => asset.kind === "poster") ?? [];
    if (posters.length !== 3) throw new Error("prior poster cartesian authority mismatch");
    for (const family of Object.keys(FAMILIES)) {
      const asset = posters.find((candidate) => candidate.family === family);
      if (!asset) throw new Error(`${family} prior poster authority is missing`);
      assets.push(await copyPoster(config, family, asset, frameManifests[family]));
    }
    if (
      assets.filter((asset) => asset.kind === "video").length !== 3
      || assets.filter((asset) => asset.kind === "poster").length !== 3
      || assets.some((asset) => asset.codec && asset.codec !== "h264")
    ) throw new Error("R2.1 active delivery must be exactly three H.264 videos and three posters");
    const manifest = buildActiveProductionManifest({ frameManifests, toolchain, assets });
    const manifestPath = path.join(config.outputRoot, "delivery", ACTIVE_MANIFEST_RELATIVE);
    await atomicJson(manifestPath, manifest);
    return {
      status: "PASS",
      manifest: {
        relativePath: `delivery/${ACTIVE_MANIFEST_RELATIVE}`,
        bytes: (await stat(manifestPath)).size,
        sha256: await sha256File(manifestPath),
      },
      assets: assets.length,
    };
  });
}

async function plan(config) {
  await canonicalDurableRoots(config);
  const authorities = await validateRepositoryAuthorities();
  return {
    schema: "quantum-hub.phase-4-r2-1.partial-production-plan.v1",
    status: "PASS",
    source: { bytes: SOURCE_BYTES, sha256: SOURCE_SHA256 },
    blackBoundaryProof: authorities.boundaryAuthority,
    families: Object.fromEntries(Object.entries(FAMILIES).map(([family, value]) => [family, {
      camera: value.camera,
      resolution: [value.width, value.height],
      exactReusedFrames: [[1, 45], [495, 500]],
      exactReusedFrameCount: reusedFrames().length,
      affectedRenderFrames: [AFFECTED_START, AFFECTED_END],
      affectedRenderFrameCount: affectedFrames().length,
      completeSequenceFrames: FRAME_COUNT,
    }])),
    externalAuthority: {
      outputRootBasename: path.basename(config.outputRoot),
      priorRootBasename: path.basename(config.oldRoot),
      rawFramesTracked: false,
      temporaryRootRejected: true,
    },
    media: {
      codec: "H.264 only",
      priorFaithfulCrf: 22,
      allowedReviewCrfs: [16, 19, 22],
      vp9Generated: false,
    },
    runtimeCompatibility: {
      schema: ACTIVE_MANIFEST_SCHEMA,
      manifestPath: ACTIVE_MANIFEST_RELATIVE,
      frameManifestPaths: Object.keys(FAMILIES).map(activeFrameManifestRelativePath),
      activeAssets: { h264Videos: 3, posters: 3, total: 6 },
      assetFields: { video: ["frames", "fps", "bytes", "sha256"], posterCodecOmitted: true },
      publicRoot: ACTIVE_PUBLIC_ROOT_RELATIVE,
      publicFileCount: 7,
      cleanup: "atomically replace the authority root and remove every unlisted file",
      trackedAuthorityRoot: ACTIVE_AUTHORITY_ROOT_RELATIVE,
      trackedAuthorityFileCount: 10,
      trackedAuthoritySource: "selective copy of external delivery contents; candidates and selections remain external",
    },
    authorization: { renderStartedByPlan: false, encodeStartedByPlan: false, mergeMain: false, phase5: false },
  };
}

async function status(config) {
  await canonicalDurableRoots(config);
  let ledger = null;
  try {
    ledger = await readJson(config.ledger, "R2.1 production ledger");
  } catch (error) {
    if (error.cause?.code !== "ENOENT") throw error;
  }
  return {
    schema: "quantum-hub.phase-4-r2-1.production-status.v1",
    sourceSha256: SOURCE_SHA256,
    blackBoundaryReportSha256: BOUNDARY_REPORT_SHA256,
    status: ledger?.status ?? "NOT_INITIALIZED",
    families: ledger ? Object.fromEntries(Object.entries(ledger.families).map(([family, value]) => [family, {
      validAffectedFrames: value.validAffectedFrames,
      expectedAffectedFrames: value.expectedAffectedFrames,
      completeSequenceValid: value.completeSequenceValid ?? false,
      settingsSha256: value.settingsSha256,
    }])) : null,
    externalAuthority: { outputRootBasename: path.basename(config.outputRoot), rawFramesTracked: false },
  };
}

function help() {
  console.log(`Phase 4-R2.1 partial production controller

Read-only:
  node scripts/phase4r2-1-production.mjs plan
  node scripts/phase4r2-1-production.mjs status
  node scripts/phase4r2-1-production.mjs render-plan --family desktop [--count 24]

External production (never runs on import):
  node scripts/phase4r2-1-production.mjs preflight
  node scripts/phase4r2-1-production.mjs render --family desktop [--count 24 | --start 46 --end 80 | --frames 46,47]
  node scripts/phase4r2-1-production.mjs reconcile [--family all] [--require-complete]
  node scripts/phase4r2-1-production.mjs encode [--family all] [--crf 22]
  node scripts/phase4r2-1-production.mjs finalize

The renderer is hard-limited to F46-F494. F1-F45 and F495-F500 must hash-match
the prior RGB16 manifests; the latter range additionally requires the pinned
zero-pixel black-boundary proof. Only H.264 output is implemented.`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === "help" || command === "--help") return help();
  const config = resolveConfiguration(options);
  let result;
  if (command === "plan") result = await plan(config);
  else if (command === "status") result = await status(config);
  else if (command === "preflight") result = await preflight(config, options);
  else if (command === "render-plan") result = await renderPlan(config, options);
  else if (command === "render") result = await renderAffected(config, options);
  else if (command === "reconcile") {
    result = await withLock(config, "reconcile", options, () => reconcileAll(config, options));
  } else if (command === "encode") result = await encode(config, options);
  else if (command === "finalize") result = await finalize(config, options);
  else throw new Error(`Unknown command: ${command}`);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`PHASE4R2_1_PRODUCTION_ERROR=${error.stack ?? error.message}`);
    process.exitCode = 1;
  });
}
