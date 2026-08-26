#!/usr/bin/env node

/**
 * Phase 4-R2 fail-closed master audit, encode, metric, poster and staging tool.
 *
 * Raw Cycles masters and every working encode remain beneath the durable external
 * production root. Only hash-named, independently validated selected assets and
 * path-free authority manifests can be staged into Git.
 */

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, createReadStream, createWriteStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import sharp from "sharp";

const SOURCE_SHA256 = "b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0";
const SOURCE_BYTES = 3_600_194;
const FRAME_COUNT = 500;
const FPS = 30;
const MAX_DEPLOY_BYTES = 25 * 1024 * 1024;
const OPERATIONAL_TARGET_BYTES = 24 * 1024 * 1024;
const FFMPEG_SHA256 = "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3";
const FFPROBE_SHA256 = "19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(
  REPO_ROOT,
  "artifacts",
  "original",
  "phase-4r1-1-periphery-current-mobile-crt",
  "source",
  "quantum-signal-television-phase4r1-1-periphery-current-mobile-crt.blend",
);
const TRACKED_AUTHORITY_ROOT = path.join(
  REPO_ROOT,
  "artifacts",
  "original",
  "phase-4r2-final-cinematic-production",
);
const LOCAL_APP_DATA = process.env.LOCALAPPDATA;
if (!LOCAL_APP_DATA) throw new Error("LOCALAPPDATA is required for the durable external media authority");
const DEFAULT_OUTPUT_ROOT = path.join(
  LOCAL_APP_DATA,
  "QuantumHubProduction",
  "phase-4r2-production-b0c9c7c1",
);
const TOOL_ROOT = path.join(
  LOCAL_APP_DATA,
  "QuantumHubTools",
  "ffmpeg-9.0.1",
  "ffmpeg-9.0.1-essentials_build",
  "bin",
);
const FFMPEG = path.join(TOOL_ROOT, "ffmpeg.exe");
const FFPROBE = path.join(TOOL_ROOT, "ffprobe.exe");
const PRODUCTION_LOCK = ".phase4r2-production.lock";

const FAMILIES = Object.freeze({
  desktop: Object.freeze({
    width: 1920,
    height: 1200,
    camera: "Phase4R1_Camera_Desktop",
    settingsSha256: "df63b497e22a2654516e8bd2f66c0fc1b8314ffaab760de7063e7c9d57c9aa34",
  }),
  portrait: Object.freeze({
    width: 780,
    height: 1688,
    camera: "Phase4R1_Camera_Mobile",
    settingsSha256: "132864c63c625eb850f578d1350295d389175bc489b0815478358482ebf916d7",
  }),
  landscape: Object.freeze({
    width: 1688,
    height: 780,
    camera: "Phase4R1_Camera_Landscape",
    settingsSha256: "d705be7dd797934fe8fb1cbf6a7116a3700fa88f1f23ae8d9b76529d004c6dde",
  }),
});

const DELIVERY_DECISIONS = Object.freeze({
  desktop: Object.freeze({
    cohort: "desktop-native-1920x1200-v1",
    masterResolution: Object.freeze([1920, 1200]),
    deliveryResolution: Object.freeze([1920, 1200]),
    rationale: "Evaluate and retain the authored 1920x1200 desktop master first; a visual-PASS candidate below the strict asset gate avoids any desktop wall/Q/current resolution loss.",
  }),
  portrait: Object.freeze({
    cohort: "portrait-native-780x1688-v1",
    masterResolution: Object.freeze([780, 1688]),
    deliveryResolution: Object.freeze([780, 1688]),
    rationale: "Retain the authored 780x1688 portrait master when a visual-PASS candidate fits, preserving the exact 390x844 composition at 2x review density without resampling.",
  }),
  landscape: Object.freeze({
    cohort: "landscape-native-1688x780-v1",
    masterResolution: Object.freeze([1688, 780]),
    deliveryResolution: Object.freeze([1688, 780]),
    rationale: "Retain the authored 1688x780 mobile-landscape master when a visual-PASS candidate fits, preserving the exact 844x390 authority at 2x review density without resampling.",
  }),
});

const LADDER = Object.freeze({
  vp9: Object.freeze([
    Object.freeze({ quality: "high", crf: 20 }),
    Object.freeze({ quality: "balanced", crf: 24 }),
    Object.freeze({ quality: "smaller", crf: 28 }),
  ]),
  h264: Object.freeze([
    Object.freeze({ quality: "high", crf: 16 }),
    Object.freeze({ quality: "balanced", crf: 19 }),
    Object.freeze({ quality: "smaller", crf: 22 }),
  ]),
});

const VISUAL_SAMPLE_FRAMES = Object.freeze([...new Set([
  1,
  ...Array.from({ length: 20 }, (_unused, index) => (index + 1) * 25),
  76, 106, 150, 166, 180, 225, 285, 320, 356, 360, 370, 390, 405, 450, 480,
])].sort((left, right) => left - right));

const REQUIRED_VISUAL_FIELDS = Object.freeze([
  "darkGradientBanding",
  "exactQ",
  "graphiteCurrent",
  "wallShadows",
  "portalBlack",
  "overall",
]);

const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_unused, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
}));

function parseArguments(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected positional argument: ${argument}`);
    const key = argument.slice(2);
    const next = rest[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return { command, options };
}

function pathIsWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function configuration(options) {
  const outputRoot = path.resolve(String(
    options["output-root"] ?? process.env.PHASE4R2_OUTPUT_ROOT ?? DEFAULT_OUTPUT_ROOT,
  ));
  const mediaRoot = path.join(outputRoot, "media-production");
  const ledger = path.join(outputRoot, "phase-4r2-production-render-ledger.json");
  return {
    outputRoot,
    mediaRoot,
    ledger,
    productionLock: path.join(outputRoot, PRODUCTION_LOCK),
    auditReport: path.join(mediaRoot, "reports", "phase-4r2-frame-completion-audit.json"),
    qualityReport: path.join(mediaRoot, "reports", "phase-4r2-encode-quality-report.json"),
    posterReport: path.join(mediaRoot, "reports", "phase-4r2-poster-validation-report.json"),
    selection: path.join(mediaRoot, "manifests", "phase-4r2-media-selection.json"),
    productionManifest: path.join(mediaRoot, "manifests", "phase-4r2-production-media-manifest.json"),
    masterVerdict: path.resolve(String(
      options["master-verdict"]
        ?? path.join(mediaRoot, "reports", "phase-4r2-master-visual-verdict.json"),
    )),
    encodeVerdict: options["visual-verdict"]
      ? path.resolve(String(options["visual-verdict"]))
      : path.join(mediaRoot, "reports", "phase-4r2-encode-visual-verdict.json"),
    masterVerdictAuthority: path.join(mediaRoot, "reports", "phase-4r2-master-visual-verdict.authority.json"),
    encodeVerdictAuthority: path.join(mediaRoot, "reports", "phase-4r2-encode-visual-verdict.authority.json"),
  };
}

function assertExternalConfiguration(config) {
  if (pathIsWithin(REPO_ROOT, config.outputRoot)) {
    throw new Error("The production/media root must remain outside the repository");
  }
  if (pathIsWithin(os.tmpdir(), config.outputRoot)) {
    throw new Error("The production/media root must be durable and may not be in the temporary directory");
  }
  if (path.parse(config.outputRoot).root === config.outputRoot) {
    throw new Error("The production/media root may not be a drive root");
  }
  if (pathIsWithin(REPO_ROOT, config.masterVerdict) || pathIsWithin(REPO_ROOT, config.encodeVerdict)) {
    throw new Error("Visual verdict authorities must remain external until the selected report is staged");
  }
}

async function assertExternalRootOnDisk(config) {
  const info = await lstat(config.outputRoot);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("The durable production root must be a real directory, not a symlink/reparse point");
  }
  const resolved = await realpath(config.outputRoot);
  if (pathIsWithin(REPO_ROOT, resolved) || pathIsWithin(os.tmpdir(), resolved)) {
    throw new Error("The resolved production root enters the repository or temporary directory");
  }
  return resolved;
}

async function assertExternalVerdictFile(filePath, label) {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular external file`);
  const resolved = await realpath(filePath);
  if (pathIsWithin(REPO_ROOT, resolved) || pathIsWithin(os.tmpdir(), resolved)) {
    throw new Error(`${label} resolves into the repository or temporary directory`);
  }
}

function resolveUnder(root, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const normalized = relativePath.split("/").join(path.sep);
  const resolved = path.resolve(root, normalized);
  if (!pathIsWithin(root, resolved) || resolved === path.resolve(root)) {
    throw new Error(`${label} escapes its authority root`);
  }
  return resolved;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function compactCanonical(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function assertExactFile(filePath, expectedBytes, expectedSha256, label) {
  const info = await stat(filePath);
  const digest = await sha256File(filePath);
  if (!info.isFile() || info.size !== expectedBytes || digest !== expectedSha256) {
    throw new Error(`${label} mismatch: bytes=${info.size} sha256=${digest}`);
  }
  return { bytes: info.size, sha256: digest };
}

async function atomicWrite(filePath, payload) {
  const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8");
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(buffer);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, filePath);
  } catch (error) {
    try { await unlink(temporary); } catch { /* Preserve the primary error. */ }
    throw error;
  }
}

async function atomicJson(filePath, value) {
  await atomicWrite(filePath, stableJson(value));
}

async function preserveExactAuthority(filePath, payload, label) {
  const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const expected = { bytes: buffer.length, sha256: sha256Buffer(buffer) };
  try {
    const info = await lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} authority is not a regular file`);
    const existing = await readFile(filePath);
    if (existing.length !== expected.bytes || sha256Buffer(existing) !== expected.sha256 || !existing.equals(buffer)) {
      throw new Error(`${label} authority was already preserved with different bytes`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await atomicWrite(filePath, buffer);
  }
  await assertExactFile(filePath, expected.bytes, expected.sha256, `${label} preserved authority`);
  return expected;
}

async function readJson(filePath, label = "JSON") {
  let value;
  try {
    value = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is missing or invalid: ${filePath}`, { cause: error });
  }
  return value;
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

async function acquireLock(lockPath, schema, command, family, recoverDeadSameHost) {
  const authority = {
    schema,
    token: randomUUID(),
    host: os.hostname(),
    processId: process.pid,
    command,
    family,
    sourceSha256: SOURCE_SHA256,
    acquiredAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(stableJson(authority), "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return authority;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readJson(lockPath, "existing lock");
      if (
        existing.schema !== schema
        || typeof existing.token !== "string"
        || existing.sourceSha256 !== SOURCE_SHA256
        || typeof existing.host !== "string"
        || !Number.isInteger(existing.processId)
      ) {
        throw new Error(`Existing lock has invalid authority and will not be replaced: ${lockPath}`);
      }
      if (!recoverDeadSameHost) {
        throw new Error(`Production renderer lock exists; media work will not overlap PID ${existing.processId}`);
      }
      if (existing.host !== os.hostname()) {
        throw new Error("Media lock belongs to another host and cannot be proven stale");
      }
      if (processIsAlive(existing.processId)) {
        throw new Error(`Media work is already active for ${family} in PID ${existing.processId}`);
      }
      const quarantine = path.join(path.dirname(lockPath), "quarantine-locks");
      await mkdir(quarantine, { recursive: true });
      await rename(lockPath, path.join(
        quarantine,
        `stale-${path.basename(lockPath)}-${existing.processId}-${existing.token}.json`,
      ));
    }
  }
  throw new Error(`Could not acquire exclusive lock: ${lockPath}`);
}

async function releaseLock(lockPath, authority) {
  const current = await readJson(lockPath, "lock being released");
  if (current.token !== authority.token || current.processId !== process.pid) {
    throw new Error(`Lock authority changed before release: ${lockPath}`);
  }
  await unlink(lockPath);
}

async function withMediaLocks(config, command, family, callback) {
  assertExternalConfiguration(config);
  await assertExternalRootOnDisk(config);
  await assertExactFile(SOURCE, SOURCE_BYTES, SOURCE_SHA256, "frozen R1.1 Blender source");
  const productionAuthority = await acquireLock(
    config.productionLock,
    "quantum-hub.phase-4-r2.production-lock.v1",
    `media:${command}`,
    family,
    false,
  );
  config.activeProductionLock = productionAuthority;
  const familyLock = path.join(config.mediaRoot, "locks", `${family ?? "all"}.lock`);
  let mediaAuthority;
  let callbackError;
  try {
    mediaAuthority = await acquireLock(
      familyLock,
      "quantum-hub.phase-4-r2.media-family-lock.v1",
      command,
      family,
      true,
    );
    return await callback();
  } catch (error) {
    callbackError = error;
    throw error;
  } finally {
    if (mediaAuthority) {
      try { await releaseLock(familyLock, mediaAuthority); } catch (error) {
        if (!callbackError) throw error;
      }
    }
    try { await releaseLock(config.productionLock, productionAuthority); } catch (error) {
      if (!callbackError) throw error;
    }
    delete config.activeProductionLock;
  }
}

async function setProductionChild(config, childState) {
  const authority = config.activeProductionLock;
  if (!authority) throw new Error("Cannot stamp a media child without the active global production lock");
  const current = await readJson(config.productionLock, "global production lock");
  if (current.token !== authority.token || current.processId !== process.pid) {
    throw new Error("Global production lock changed before media child stamp");
  }
  await atomicJson(config.productionLock, {
    ...current,
    childProcessId: childState?.processId ?? null,
    childExecutable: childState?.executable ?? null,
    childLabel: childState?.label ?? null,
    childArgvSha256: childState?.argvSha256 ?? null,
    childState: childState?.state ?? null,
  });
}

function canonicalArguments(config, executable, args) {
  const normalize = (value) => {
    let result = String(value);
    for (const [root, replacement] of [
      [config.outputRoot, "<EXTERNAL_ROOT>"],
      [REPO_ROOT, "<REPOSITORY_ROOT>"],
      [FFMPEG, "<FFMPEG>"],
      [FFPROBE, "<FFPROBE>"],
    ]) {
      if (result.toLowerCase().startsWith(root.toLowerCase())) {
        result = `${replacement}${result.slice(root.length).split(path.sep).join("/")}`;
      }
    }
    return result;
  };
  return [normalize(executable), ...args.map(normalize)];
}

function sanitizedExternalMessage(config, value) {
  let text = String(value ?? "");
  for (const [root, replacement] of [
    [config.outputRoot, "<EXTERNAL_ROOT>"],
    [REPO_ROOT, "<REPOSITORY_ROOT>"],
    [LOCAL_APP_DATA, "<LOCAL_DATA_ROOT>"],
    [process.env.USERPROFILE, "<USER_PROFILE>"],
  ]) {
    if (root) text = text.replaceAll(root, replacement);
  }
  return text
    .replace(/C:\\Users\\[^\\\s]+/gi, "<USER_PROFILE>")
    .replace(/\/Users\/[^/\s]+/g, "<USER_PROFILE>");
}

function containsPrivatePath(value) {
  const normalized = String(value ?? "").replace(/\\\\/g, "\\");
  return /(?:[A-Za-z]:[\\/]|\/Users\/[^/\s]+|\/home\/[^/\s]+|OneDrive|AppData)/i.test(normalized);
}

async function runTool(config, label, executable, args, options = {}) {
  const logDirectory = path.join(config.mediaRoot, "logs");
  await mkdir(logDirectory, { recursive: true });
  const token = randomUUID();
  const logPath = path.join(logDirectory, `${label}-${token}.log`);
  const receiptPath = path.join(logDirectory, `${label}-${token}.receipt.json`);
  const canonicalArgv = canonicalArguments(config, executable, args);
  const argvSha256 = sha256Buffer(Buffer.from(compactCanonical(canonicalArgv)));
  const log = createWriteStream(logPath, { flags: "wx" });
  await new Promise((resolve, reject) => {
    log.once("open", resolve);
    log.once("error", reject);
  });
  let logError = null;
  log.on("error", (error) => { logError = error; });
  const logSettled = new Promise((resolve) => {
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      resolve(error);
    };
    log.once("finish", () => finish());
    log.once("error", (error) => finish(error));
    log.once("close", () => {
      if (!log.writableFinished) finish(logError ?? new Error(`Process log closed before finish: ${logPath}`));
    });
  });
  const startedAt = new Date().toISOString();
  log.write(`${JSON.stringify({ event: "START", startedAt, executable, args })}\n`);
  const stdout = [];
  const stderr = [];
  // Stamp intent before spawn. Renderer-grade recovery must conservatively
  // scan the named executable while a dead-owner media lock is SPAWNING; this
  // closes the otherwise unavoidable spawn-before-child-PID registration gap.
  await setProductionChild(config, {
    processId: null,
    executable: path.basename(executable),
    label,
    argvSha256,
    state: "SPAWNING",
  });
  const child = spawn(executable, args, {
    cwd: options.cwd ?? REPO_ROOT,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    stdout.push(chunk);
    log.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr.push(chunk);
    log.write(chunk);
  });
  const resultPromise = new Promise((resolve) => {
    let spawnError = null;
    child.once("error", (error) => { spawnError = error; });
    child.once("close", (code, signal) => resolve({ code, signal, spawnError }));
  });
  let lockStampError = null;
  if (Number.isInteger(child.pid)) {
    try {
      await setProductionChild(config, {
        processId: child.pid,
        executable: path.basename(executable),
      label,
      argvSha256,
      state: "RUNNING",
    });
    } catch (error) {
      lockStampError = error;
      child.kill();
    }
  }
  const result = await resultPromise;
  try { await setProductionChild(config, null); } catch (error) { lockStampError ??= error; }
  const completedAt = new Date().toISOString();
  log.write(`${JSON.stringify({
    event: "END",
    completedAt,
    exitCode: result.code,
    signal: result.signal,
    spawnError: result.spawnError ? String(result.spawnError.message ?? result.spawnError) : null,
    lockStampError: lockStampError ? String(lockStampError.message ?? lockStampError) : null,
    logError: logError ? String(logError.message ?? logError) : null,
  })}\n`);
  if (!log.destroyed && !log.writableEnded) log.end();
  const finishError = await logSettled;
  if (finishError) logError ??= finishError;
  const logInfo = await stat(logPath);
  const logSha256 = await sha256File(logPath);
  const receipt = {
    schema: "quantum-hub.phase-4-r2.media-process-receipt.v1",
    label,
    startedAt,
    completedAt,
    status: result.code === 0 && !result.spawnError && !lockStampError && !logError ? "PASS" : "FAIL",
    exitCode: result.code,
    signal: result.signal,
    argv: canonicalArgv,
    argvSha256,
    log: { basename: path.basename(logPath), bytes: logInfo.size, sha256: logSha256 },
  };
  await atomicJson(receiptPath, receipt);
  if (lockStampError) throw lockStampError;
  if (logError) throw logError;
  if (result.spawnError) throw result.spawnError;
  if (result.code !== 0 && !options.allowFailure) {
    throw new Error(`${label} failed with exit code ${result.code}; log=${logPath}`);
  }
  return {
    ...result,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
    argvSha256,
    receipt,
  };
}

async function assertToolchain(config) {
  const [ffmpeg, ffprobe] = await Promise.all([
    assertExactFile(FFMPEG, 102_856_192, FFMPEG_SHA256, "FFmpeg 9.0.1"),
    assertExactFile(FFPROBE, 102_652_416, FFPROBE_SHA256, "FFprobe 9.0.1"),
  ]);
  const ffmpegVersion = await runTool(config, "ffmpeg-version", FFMPEG, ["-version"]);
  const ffprobeVersion = await runTool(config, "ffprobe-version", FFPROBE, ["-version"]);
  if (!ffmpegVersion.stdout.startsWith("ffmpeg version 9.0.1")) throw new Error("Unexpected FFmpeg version");
  if (!ffprobeVersion.stdout.startsWith("ffprobe version 9.0.1")) throw new Error("Unexpected FFprobe version");
  return {
    ffmpeg: { basename: path.basename(FFMPEG), ...ffmpeg, version: ffmpegVersion.stdout.split(/\r?\n/)[0] },
    ffprobe: { basename: path.basename(FFPROBE), ...ffprobe, version: ffprobeVersion.stdout.split(/\r?\n/)[0] },
    sharp: { version: sharp.versions.sharp, libvips: sharp.versions.vips },
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

async function parsePngComplete(filePath) {
  const payload = await readFile(filePath);
  if (!payload.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`Invalid PNG signature: ${filePath}`);
  }
  let offset = 8;
  let header = null;
  let chunkIndex = 0;
  let sawEnd = false;
  const compressed = [];
  while (!sawEnd) {
    if (offset + 12 > payload.length) throw new Error(`Truncated PNG chunk: ${filePath}`);
    const length = payload.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const crcStart = dataStart + length;
    if (crcStart + 4 > payload.length) throw new Error(`Truncated PNG data: ${filePath}`);
    const type = payload.subarray(typeStart, dataStart);
    const data = payload.subarray(dataStart, crcStart);
    const expectedCrc = payload.readUInt32BE(crcStart);
    const actualCrc = crc32(Buffer.concat([type, data]));
    if (actualCrc !== expectedCrc) throw new Error(`PNG CRC mismatch in ${type.toString("ascii")}: ${filePath}`);
    const typeName = type.toString("ascii");
    if (chunkIndex === 0 && typeName !== "IHDR") throw new Error(`PNG IHDR is not first: ${filePath}`);
    if (typeName === "IHDR") {
      if (header || length !== 13) throw new Error(`Invalid PNG IHDR: ${filePath}`);
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlaced: data[12],
      };
    } else if (typeName === "IDAT") {
      compressed.push(data);
    } else if (typeName === "IEND") {
      if (length !== 0) throw new Error(`Invalid PNG IEND: ${filePath}`);
      sawEnd = true;
    }
    offset = crcStart + 4;
    chunkIndex += 1;
  }
  if (offset !== payload.length || !header || compressed.length === 0) {
    throw new Error(`PNG is incomplete or has trailing bytes: ${filePath}`);
  }
  if (header.compression !== 0 || header.filter !== 0 || header.interlaced !== 0) {
    throw new Error(`Unsupported PNG coding: ${filePath}`);
  }
  const channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 })[header.colorType];
  if (!channels) throw new Error(`Unsupported PNG color type: ${filePath}`);
  const rowBytes = Math.ceil((header.width * channels * header.bitDepth) / 8);
  const expectedDecodedBytes = (rowBytes + 1) * header.height;
  if (!Number.isSafeInteger(expectedDecodedBytes) || expectedDecodedBytes <= 0 || expectedDecodedBytes > 256 * 1024 * 1024) {
    throw new Error(`PNG decoded authority size is unsafe: ${filePath}`);
  }
  const compressedPayload = Buffer.concat(compressed);
  const inflated = inflateSync(compressedPayload, { maxOutputLength: expectedDecodedBytes, info: true });
  const decoded = inflated.buffer;
  if (inflated.engine.bytesWritten !== compressedPayload.length) {
    throw new Error(`PNG zlib stream has unconsumed or concatenated payload: ${filePath}`);
  }
  if (decoded.length !== expectedDecodedBytes) {
    throw new Error(`PNG decoded row byte count mismatch: ${filePath}`);
  }
  for (let row = 0; row < header.height; row += 1) {
    if (decoded[row * (rowBytes + 1)] > 4) throw new Error(`Invalid PNG row filter: ${filePath}`);
  }
  return {
    width: header.width,
    height: header.height,
    bitDepth: header.bitDepth,
    colorType: header.colorType,
    interlaced: header.interlaced,
  };
}

async function sharpDecodeComplete(filePath, expected) {
  const { data, info } = await sharp(filePath, { failOn: "error", limitInputPixels: false })
    .raw({ depth: "ushort" })
    .toBuffer({ resolveWithObject: true });
  if (
    info.width !== expected.width
    || info.height !== expected.height
    || info.channels !== 3
    || info.depth !== "ushort"
    || data.length !== expected.width * expected.height * 3 * 2
  ) {
    throw new Error(`Sharp full-decode authority mismatch: ${filePath}`);
  }
}

async function assertDirectoryAuthority(directory, expectedNames, label, authorityRoot) {
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error(`${label} is not a regular directory`);
  }
  const resolvedDirectory = await realpath(directory);
  const resolvedAuthorityRoot = await realpath(authorityRoot);
  if (!pathIsWithin(resolvedAuthorityRoot, resolvedDirectory)) {
    throw new Error(`${label} resolves outside the external production authority`);
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const actualNames = entries.map((entry) => entry.name).sort();
  const requiredNames = [...expectedNames].sort();
  if (compactCanonical(actualNames) !== compactCanonical(requiredNames)) {
    throw new Error(`${label} inventory mismatch; expected exactly ${requiredNames.length} authority files`);
  }
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`${label} contains a non-regular entry: ${entry.name}`);
    const entryPath = path.join(directory, entry.name);
    const resolvedEntry = await realpath(entryPath);
    if (!pathIsWithin(resolvedDirectory, resolvedEntry)) throw new Error(`${label} contains a reparse escape: ${entry.name}`);
    const info = await lstat(entryPath);
    if (!info.isFile() || info.size <= 0) throw new Error(`${label} contains an empty/non-file entry: ${entry.name}`);
  }
}

function frameName(frame) {
  return `F${String(frame).padStart(3, "0")}`;
}

function expectedStableReceiptSettings(family) {
  const authority = FAMILIES[family];
  return {
    engine: "CYCLES",
    family,
    camera: authority.camera,
    cableCollection: ({
      desktop: "PHASE4R1V2_CABLE_DESKTOP",
      portrait: "PHASE4R1V2_CABLE_MOBILE",
      landscape: "PHASE4R1V2_CABLE_LANDSCAPE",
    })[family],
    resolution: [authority.width, authority.height],
    fps: FPS,
    physicalFrames: [1, FRAME_COUNT],
    samples: 192,
    adaptiveSampling: true,
    adaptiveThreshold: 0.018,
    denoising: true,
    denoiser: "OPENIMAGEDENOISE",
    motionBlur: true,
    persistentData: true,
    viewTransform: "AgX",
    look: "AgX - Medium High Contrast",
    exposureStops: 1,
    filmTransparent: false,
    borderRender: false,
    cropToBorder: false,
    png: { colorMode: "RGB", colorDepth: 16, compression: 30 },
    device: { backend: "OPTIX", sceneDevice: "GPU" },
  };
}

function familyOption(options, allowAll = false) {
  const family = String(options.family ?? (allowAll ? "all" : ""));
  if (allowAll && family === "all") return family;
  if (!Object.hasOwn(FAMILIES, family)) throw new Error("--family must be desktop, portrait, or landscape");
  return family;
}

function assertLedgerFamily(ledger, family) {
  if (ledger.schema !== "quantum-hub.phase-4-r2.production-render-ledger.v1") {
    throw new Error("Live render-ledger schema mismatch");
  }
  if (ledger.source?.sha256 !== SOURCE_SHA256 || ledger.source?.bytes !== SOURCE_BYTES) {
    throw new Error("Live render ledger is not bound to the frozen R1.1 source");
  }
  if (
    ledger.immutableBackup?.sha256 !== SOURCE_SHA256
    || ledger.immutableBackup?.bytes !== SOURCE_BYTES
    || compactCanonical(ledger.timeline?.physicalCyclesFrames) !== compactCanonical([1, FRAME_COUNT])
    || ledger.timeline?.fps !== FPS
    || ledger.authorization?.physicalCyclesProductionAuthorized !== true
    || ledger.authorization?.mergeMainAuthorized !== false
    || ledger.authorization?.phase5Authorized !== false
  ) throw new Error("Live render ledger backup/timeline/authorization authority mismatch");
  const expected = FAMILIES[family];
  const state = ledger.families?.[family];
  if (!state) throw new Error(`Live render ledger has no ${family} authority`);
  if (
    state.camera !== expected.camera
    || compactCanonical(state.resolution) !== compactCanonical([expected.width, expected.height])
    || state.settingsSha256 !== expected.settingsSha256
    || state.expectedFrames !== FRAME_COUNT
    || state.validFrames !== FRAME_COUNT
    || state.activeChunk !== null
    || !Array.isArray(state.missingFrames)
    || state.missingFrames.length !== 0
    || !Array.isArray(state.corruptFrames)
    || state.corruptFrames.length !== 0
    || !state.frames
    || Object.keys(state.frames).length !== FRAME_COUNT
  ) {
    throw new Error(`Live ${family} master ledger is incomplete or differs from production authority`);
  }
  return state;
}

async function buildStableFrameManifest(config, ledger, family) {
  const authority = FAMILIES[family];
  const state = assertLedgerFamily(ledger, family);
  const framesDirectory = path.join(config.outputRoot, "masters", family, "frames");
  const receiptsDirectory = path.join(config.outputRoot, "masters", family, "receipts");
  const frameNames = Array.from({ length: FRAME_COUNT }, (_unused, index) => `${frameName(index + 1)}.png`);
  const receiptNames = Array.from({ length: FRAME_COUNT }, (_unused, index) => `${frameName(index + 1)}.json`);
  await assertDirectoryAuthority(framesDirectory, frameNames, `${family} frame directory`, config.outputRoot);
  await assertDirectoryAuthority(receiptsDirectory, receiptNames, `${family} receipt directory`, config.outputRoot);
  const entries = [];
  let totalBytes = 0;
  let sequenceText = "";
  for (let frame = 1; frame <= FRAME_COUNT; frame += 1) {
    const name = frameName(frame);
    const framePath = path.join(framesDirectory, `${name}.png`);
    const receiptPath = path.join(receiptsDirectory, `${name}.json`);
    const receipt = await readJson(receiptPath, `${family} ${name} receipt`);
    if (
      receipt.schema !== "quantum-hub.phase-4-r2.production-frame-receipt.v1"
      || receipt.status !== "PASS"
      || receipt.sourceSha256 !== SOURCE_SHA256
      || receipt.settingsSha256 !== authority.settingsSha256
      || receipt.family !== family
      || receipt.frame !== frame
      || receipt.file?.relativePath !== `masters/${family}/frames/${name}.png`
    ) {
      throw new Error(`${family} ${name} receipt authority mismatch`);
    }
    const stableReceiptSettings = {
      ...receipt.settings,
      device: {
        backend: receipt.settings?.device?.backend,
        sceneDevice: receipt.settings?.device?.sceneDevice,
      },
    };
    // JSON parsing erases Python's int/float lexical distinction (for example
    // 1.0 versus 1), so JavaScript cannot reproduce the Python canonical hash
    // from parsed JSON. The receipt and ledger already bind that exact hash;
    // this separate semantic comparison proves every production setting.
    if (compactCanonical(stableReceiptSettings) !== compactCanonical(expectedStableReceiptSettings(family))) {
      throw new Error(`${family} ${name} receipt settings differ from the exact production authority`);
    }
    const png = await parsePngComplete(framePath);
    const expectedPng = {
      width: authority.width,
      height: authority.height,
      bitDepth: 16,
      colorType: 2,
      interlaced: 0,
    };
    if (compactCanonical(png) !== compactCanonical(expectedPng)) {
      throw new Error(`${family} ${name} PNG authority mismatch`);
    }
    await sharpDecodeComplete(framePath, authority);
    const info = await stat(framePath);
    const digest = await sha256File(framePath);
    const ledgerFrame = state.frames[String(frame)];
    if (
      receipt.file.bytes !== info.size
      || receipt.file.sha256 !== digest
      || receipt.file.width !== authority.width
      || receipt.file.height !== authority.height
      || receipt.file.bitDepth !== 16
      || receipt.file.colorType !== 2
      || ledgerFrame?.bytes !== info.size
      || ledgerFrame?.sha256 !== digest
      || ledgerFrame?.settingsSha256 !== authority.settingsSha256
      || ledgerFrame?.receipt !== `masters/${family}/receipts/${name}.json`
    ) {
      throw new Error(`${family} ${name} bytes/hash/ledger parity failed`);
    }
    totalBytes += info.size;
    sequenceText += `${frame}|${name}.png|${info.size}|${digest}|${authority.width}|${authority.height}|16|2\n`;
    entries.push({
      frame,
      file: `${name}.png`,
      bytes: info.size,
      sha256: digest,
      width: authority.width,
      height: authority.height,
      bitDepth: 16,
      colorType: 2,
    });
  }
  return {
    schema: "quantum-hub.phase-4-r2.frame-manifest.v1",
    family,
    source: {
      blendSha256: SOURCE_SHA256,
      settingsSha256: authority.settingsSha256,
      camera: authority.camera,
    },
    master: {
      resolution: [authority.width, authority.height],
      fps: FPS,
      frameRange: [1, FRAME_COUNT],
      frameCount: FRAME_COUNT,
      totalBytes,
      sequenceSha256: sha256Buffer(Buffer.from(sequenceText, "utf8")),
    },
    frames: entries,
  };
}

async function probeJson(config, label, args) {
  const result = await runTool(config, label, FFPROBE, [...args, "-of", "json"]);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label} produced invalid JSON`, { cause: error });
  }
}

async function auditSequenceWithFfmpeg(config, family) {
  const authority = FAMILIES[family];
  const pattern = path.join(config.outputRoot, "masters", family, "frames", "F%03d.png");
  await runTool(config, `${family}-master-full-decode`, FFMPEG, [
    "-hide_banner", "-nostdin", "-v", "error", "-xerror", "-err_detect", "explode",
    "-f", "image2", "-framerate", String(FPS), "-start_number", "1", "-i", pattern,
    "-map", "0:v:0", "-frames:v", String(FRAME_COUNT), "-f", "null", "NUL",
  ]);
  const probe = await probeJson(config, `${family}-master-probe`, [
    "-hide_banner", "-v", "error",
    "-f", "image2", "-framerate", String(FPS), "-start_number", "1", "-i", pattern,
    "-select_streams", "v:0", "-count_frames", "-show_streams",
    "-show_entries",
    "stream=codec_type,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_frames,color_range,color_space,color_transfer,color_primaries",
  ]);
  if (!Array.isArray(probe.streams) || probe.streams.length !== 1) throw new Error(`${family} master probe stream count mismatch`);
  const stream = probe.streams[0];
  const expected = {
    codec_type: "video",
    width: authority.width,
    height: authority.height,
    pix_fmt: "rgb48be",
    r_frame_rate: "30/1",
    avg_frame_rate: "30/1",
    nb_read_frames: String(FRAME_COUNT),
    color_range: "pc",
    color_space: "gbr",
    color_transfer: "iec61966-2-1",
    color_primaries: "bt709",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (stream[key] !== value) {
      throw new Error(`${family} master ${key}=${stream[key]} differs from required authority ${value}`);
    }
  }
  return expected;
}

function stableManifestPath(config, family) {
  return path.join(config.mediaRoot, "manifests", `phase-4r2-${family}-frame-manifest.json`);
}

async function auditFamily(config, ledger, family) {
  const first = await buildStableFrameManifest(config, ledger, family);
  const firstBytes = Buffer.from(stableJson(first), "utf8");
  const second = await buildStableFrameManifest(config, ledger, family);
  const secondBytes = Buffer.from(stableJson(second), "utf8");
  if (!firstBytes.equals(secondBytes) || sha256Buffer(firstBytes) !== sha256Buffer(secondBytes)) {
    throw new Error(`${family} stable frame manifest is not deterministic across two independent productions`);
  }
  const manifestPath = stableManifestPath(config, family);
  await atomicWrite(manifestPath, firstBytes);
  const probe = await auditSequenceWithFfmpeg(config, family);
  return {
    manifest: {
      basename: path.basename(manifestPath),
      bytes: firstBytes.length,
      sha256: sha256Buffer(firstBytes),
      deterministicTwoRunCheck: "PASS",
    },
    inventory: { expected: FRAME_COUNT, valid: FRAME_COUNT, missing: 0, duplicate: 0, extra: 0 },
    fullPngDecode: "PASS",
    independentFfmpegDecode: "PASS",
    ffprobe: probe,
    ledgerParity: "PASS",
    visualSample: { frames: VISUAL_SAMPLE_FRAMES, status: "PENDING_REVIEW" },
    status: "PASS",
  };
}

async function auditMasters(config, families, toolchain) {
  const ledger = await readJson(config.ledger, "live production render ledger");
  let report = {
    schema: "quantum-hub.phase-4-r2.frame-completion-audit.v1",
    auditedAt: new Date().toISOString(),
    sourceBlendSha256: SOURCE_SHA256,
    toolchain,
    families: {},
    status: "INCOMPLETE",
  };
  try {
    const existing = await readJson(config.auditReport);
    if (existing.schema === report.schema && existing.sourceBlendSha256 === SOURCE_SHA256) report = existing;
  } catch { /* A prior report is optional. */ }
  report.auditedAt = new Date().toISOString();
  report.toolchain = toolchain;
  const invocationFamilies = new Set(families);
  for (const family of Object.keys(FAMILIES)) {
    if (!invocationFamilies.has(family) && report.families[family]) {
      report.families[family] = {
        ...report.families[family],
        status: "STALE_NOT_REAUDITED",
        staleAt: report.auditedAt,
      };
    }
  }
  report.status = "AUDIT_IN_PROGRESS";
  report.invocationFamilies = [...invocationFamilies].sort();
  // Durably revoke any prior global PASS before the first expensive family
  // audit. An interruption can therefore leave only a non-authoritative
  // in-progress report, never a stale top-level PASS.
  await atomicJson(config.auditReport, report);
  for (const family of families) {
    report.families[family] = await auditFamily(config, ledger, family);
    report.status = "AUDIT_IN_PROGRESS";
    await atomicJson(config.auditReport, report);
  }
  report.status = invocationFamilies.size === Object.keys(FAMILIES).length
    && Object.keys(FAMILIES).every((family) => report.families[family]?.status === "PASS")
    ? "PASS"
    : "PARTIAL_PASS";
  await atomicJson(config.auditReport, report);
  return report;
}

function forwardColorFilter(width, height) {
  return [
    `zscale=w=${width}:h=${height}:f=lanczos`,
    "rin=full:r=limited:min=gbr:m=bt709",
    "tin=iec61966-2-1:t=bt709:pin=bt709:p=bt709",
    "d=error_diffusion",
    "format=yuv420p",
  ].join(":").replace(":format", ",format");
}

function reverseColorFilter(width, height) {
  return [
    `zscale=w=${width}:h=${height}:f=lanczos`,
    "rin=limited:r=full:min=bt709:m=gbr",
    "tin=bt709:t=iec61966-2-1:pin=bt709:p=bt709",
    "d=error_diffusion",
    // Planar RGB is the negotiation boundary required by zscale. The PNG
    // encoder emits the resulting 8-bit authority as packed rgb24.
    "format=gbrp",
  ].join(":").replace(":format", ",format");
}

function posterDerivationAuthority(family) {
  const authority = FAMILIES[family];
  return {
    sourceFrame: 1,
    sourceFormat: "16-bit RGB PNG",
    resolution: [authority.width, authority.height],
    filter: `${forwardColorFilter(authority.width, authority.height)},${reverseColorFilter(authority.width, authority.height)}`,
    output: { codec: "png", bitDepth: 8, colorType: "RGB", alpha: false, compressionLevel: 9, prediction: "mixed" },
  };
}

function codecArguments(codec, crf) {
  if (codec === "h264") {
    return [
      "-c:v", "libx264", "-preset", "slow", "-crf", String(crf),
      "-profile:v", "high", "-g", "12", "-keyint_min", "12", "-sc_threshold", "0",
      "-flags:v", "+cgop+bitexact",
      "-x264-params", "keyint=12:min-keyint=12:scenecut=0:open-gop=0:aq-mode=3:aq-strength=1.0",
      "-threads:v", "8", "-movflags", "+faststart", "-video_track_timescale", "30000",
      "-f", "mp4",
    ];
  }
  if (codec === "vp9") {
    return [
      "-c:v", "libvpx-vp9", "-deadline", "good", "-cpu-used", "1",
      "-crf", String(crf), "-b:v", "0", "-g", "12", "-keyint_min", "12",
      "-lag-in-frames", "0", "-auto-alt-ref", "0", "-row-mt", "1",
      "-tile-columns", "2", "-frame-parallel", "0", "-aq-mode", "1",
      "-threads:v", "8", "-flags:v", "+bitexact", "-cues_to_front", "1",
      "-cluster_time_limit", "400", "-write_crc32", "1", "-f", "webm",
    ];
  }
  throw new Error(`Unsupported codec: ${codec}`);
}

function encodeArguments(config, family, codec, crf, output, startFrame = 1, frameCount = FRAME_COUNT) {
  const authority = FAMILIES[family];
  const pattern = path.join(config.outputRoot, "masters", family, "frames", "F%03d.png");
  return [
    "-hide_banner", "-nostdin", "-y", "-v", "warning", "-xerror",
    "-f", "image2", "-framerate", String(FPS), "-start_number", String(startFrame), "-i", pattern,
    "-map", "0:v:0", "-frames:v", String(frameCount), "-an", "-map_metadata", "-1", "-map_chapters", "-1",
    "-vf", forwardColorFilter(authority.width, authority.height),
    "-r", "30", "-fps_mode", "cfr", "-pix_fmt", "yuv420p",
    "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709",
    "-fflags", "+bitexact", "-metadata", "encoder=", "-metadata:s:v:0", "encoder=",
    ...codecArguments(codec, crf),
    output,
  ];
}

function codecExtension(codec) {
  return codec === "h264" ? "mp4" : "webm";
}

function assertMasterVisualVerdictState(verdict, family, masterFrameManifestSha256) {
  const state = verdict.families?.[family];
  if (
    verdict.schema !== "quantum-hub.phase-4-r2.master-visual-verdict.v1"
    || verdict.sourceBlendSha256 !== SOURCE_SHA256
    || state?.settingsSha256 !== FAMILIES[family].settingsSha256
    || state?.masterFrameManifestSha256 !== masterFrameManifestSha256
    || compactCanonical(state.visualSampleFrames) !== compactCanonical(VISUAL_SAMPLE_FRAMES)
    || state.pilot !== "PASS"
    || state.temporal !== "PASS"
    || state.finalVisualSample !== "PASS"
  ) {
    throw new Error(`${family} pilot, temporal and final visual master review must all explicitly PASS before encoding`);
  }
}

async function assertMasterVisualVerdict(config, family, masterFrameManifestSha256) {
  await assertExternalVerdictFile(config.masterVerdict, "master visual verdict");
  const payload = await readFile(config.masterVerdict);
  let verdict;
  try {
    verdict = JSON.parse(payload.toString("utf8"));
  } catch (error) {
    throw new Error(`master visual verdict is invalid JSON: ${config.masterVerdict}`, { cause: error });
  }
  for (const name of Object.keys(FAMILIES)) {
    const manifestSha256 = name === family
      ? masterFrameManifestSha256
      : await sha256File(stableManifestPath(config, name));
    assertMasterVisualVerdictState(verdict, name, manifestSha256);
  }
  const authority = await preserveExactAuthority(
    config.masterVerdictAuthority,
    payload,
    "master visual verdict",
  );
  return { verdict, ...authority };
}

async function moveToQuarantine(config, sourcePath, reason) {
  try {
    const info = await stat(sourcePath);
    if (!info.isFile()) return null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  const destination = path.join(
    config.mediaRoot,
    "quarantine",
    `${path.basename(sourcePath)}-${Date.now()}-${randomUUID()}-${reason}`,
  );
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(sourcePath, destination);
  return destination;
}

function determinismReportPath(config, family) {
  return path.join(config.mediaRoot, "reports", `phase-4r2-${family}-codec-determinism.json`);
}

async function determinismSmoke(config, family, toolchain, masterFrameManifestSha256, retryStale = false) {
  const reportPath = determinismReportPath(config, family);
  const currentSettings = settingsAuthorities(config);
  let existing = null;
  try {
    existing = await readJson(reportPath);
  } catch (error) {
    if (error?.cause?.code !== "ENOENT" && error?.code !== "ENOENT") throw error;
  }
  if (existing) {
    try {
    if (
      existing.schema !== "quantum-hub.phase-4-r2.codec-determinism.v1"
      || existing.sourceBlendSha256 !== SOURCE_SHA256
      || existing.family !== family
      || existing.masterFrameManifestSha256 !== masterFrameManifestSha256
      || existing.toolchain?.ffmpegSha256 !== toolchain.ffmpeg.sha256
      || existing.toolchain?.ffprobeSha256 !== toolchain.ffprobe.sha256
      || existing.status !== "PASS"
    ) throw new Error(`${family} prior determinism report is not a PASS authority`);
    if (compactCanonical(Object.keys(existing.codecs ?? {}).sort()) !== compactCanonical(["h264", "vp9"])) {
      throw new Error(`${family} determinism report codec set differs from VP9/H.264 authority`);
    }
    for (const codec of ["vp9", "h264"]) {
      const expectedCrf = codec === "vp9" ? 24 : 19;
      if (
        existing.codecs[codec].crf !== expectedCrf
        || compactCanonical(existing.codecs[codec].frames) !== compactCanonical([360, 390])
        || existing.codecs[codec].status !== "PASS"
      ) throw new Error(`${family} ${codec} determinism range/CRF/status authority changed`);
      if (existing.codecs?.[codec]?.settingsAuthoritySha256 !== currentSettings[`${codec}-v1`].sha256) {
        throw new Error(`${family} ${codec} determinism settings authority changed`);
      }
      const runs = existing.codecs?.[codec]?.runs;
      if (!Array.isArray(runs) || runs.length !== 2) throw new Error(`Incomplete ${family} ${codec} determinism authority`);
      if (new Set(runs.map((run) => run.externalRelativePath)).size !== 2 || new Set(runs.map((run) => run.basename)).size !== 2) {
        throw new Error(`${family} ${codec} determinism run records are not unique`);
      }
      for (const [runIndex, run] of runs.entries()) {
        const runPath = resolveUnder(config.mediaRoot, run.externalRelativePath, "determinism output");
        const expectedBasename = `${family}-${codec}-critical-${runIndex === 0 ? "a" : "b"}.${codecExtension(codec)}`;
        if (run.basename !== expectedBasename || path.basename(runPath) !== expectedBasename) {
          throw new Error(`${family} ${codec} determinism output name/order authority changed`);
        }
        await assertExactFile(runPath, run.bytes, run.sha256, `${family} ${codec} determinism output`);
        if (!Array.isArray(run.argv) || sha256Buffer(Buffer.from(compactCanonical(run.argv))) !== run.argvSha256) {
          throw new Error(`${family} ${codec} determinism command receipt changed`);
        }
        const expectedArgv = canonicalArguments(
          config,
          FFMPEG,
          encodeArguments(config, family, codec, existing.codecs[codec].crf, path.join(config.mediaRoot, "__SMOKE_OUTPUT__"), 360, 31),
        );
        if (compactCanonical(run.argv.slice(0, -1)) !== compactCanonical(expectedArgv.slice(0, -1))) {
          throw new Error(`${family} ${codec} determinism command differs from current authority`);
        }
        const canonicalRunPath = canonicalArguments(config, FFMPEG, [runPath])[1];
        if (run.argv.at(-1) !== canonicalRunPath) {
          throw new Error(`${family} ${codec} determinism command output differs from its run bytes`);
        }
      }
      if (runs[0].bytes !== runs[1].bytes || runs[0].sha256 !== runs[1].sha256) {
        throw new Error(`${family} ${codec} prior determinism authority is not byte-identical`);
      }
    }
    return existing;
    } catch (error) {
      if (!retryStale) throw error;
      await moveToQuarantine(config, reportPath, "stale-determinism-report");
      existing = null;
    }
  }
  const workDirectory = path.join(config.mediaRoot, "determinism", family, `run-${randomUUID()}`);
  await mkdir(workDirectory, { recursive: true });
  const codecs = {};
  for (const [codec, crf] of [["vp9", 24], ["h264", 19]]) {
    const extension = codecExtension(codec);
    const outputs = [
      path.join(workDirectory, `${family}-${codec}-critical-a.${extension}`),
      path.join(workDirectory, `${family}-${codec}-critical-b.${extension}`),
    ];
    const invocations = [];
    for (const output of outputs) {
      try {
        await stat(output);
        throw new Error(`Determinism output already exists without a PASS authority: ${output}`);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      invocations.push(await runTool(
        config,
        `${family}-${codec}-determinism`,
        FFMPEG,
        encodeArguments(config, family, codec, crf, output, 360, 31),
      ));
    }
    const authorities = await Promise.all(outputs.map(async (output, index) => {
      const info = await stat(output);
      return {
        basename: path.basename(output),
        externalRelativePath: path.relative(config.mediaRoot, output).split(path.sep).join("/"),
        bytes: info.size,
        sha256: await sha256File(output),
        argv: invocations[index].receipt.argv,
        argvSha256: invocations[index].argvSha256,
      };
    }));
    if (authorities[0].bytes !== authorities[1].bytes || authorities[0].sha256 !== authorities[1].sha256) {
      throw new Error(`${family} ${codec} is not byte-deterministic across two exact critical-sample encodes`);
    }
    codecs[codec] = {
      crf,
      frames: [360, 390],
      settingsAuthoritySha256: currentSettings[`${codec}-v1`].sha256,
      runs: authorities,
      status: "PASS",
    };
  }
  const report = {
    schema: "quantum-hub.phase-4-r2.codec-determinism.v1",
    sourceBlendSha256: SOURCE_SHA256,
    family,
    masterFrameManifestSha256,
    toolchain: {
      ffmpegSha256: toolchain.ffmpeg.sha256,
      ffprobeSha256: toolchain.ffprobe.sha256,
    },
    codecs,
    status: "PASS",
  };
  await atomicJson(reportPath, report);
  return report;
}

function parseRational(value) {
  const [numerator, denominator] = String(value).split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return NaN;
  return numerator / denominator;
}

function findAllMarkers(buffer, marker) {
  const positions = [];
  for (let index = 0; index <= buffer.length - marker.length; index += 1) {
    if (buffer.subarray(index, index + marker.length).equals(marker)) positions.push(index);
  }
  return positions;
}

function validateMp4FastStart(payload) {
  let offset = 0;
  const boxes = [];
  while (offset + 8 <= payload.length) {
    let size = payload.readUInt32BE(offset);
    const type = payload.subarray(offset + 4, offset + 8).toString("ascii");
    let header = 8;
    if (size === 1) {
      if (offset + 16 > payload.length) throw new Error("Truncated extended MP4 box");
      size = Number(payload.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = payload.length - offset;
    }
    if (!Number.isSafeInteger(size) || size < header || offset + size > payload.length) {
      throw new Error(`Invalid MP4 box ${type}`);
    }
    boxes.push({ type, offset, size });
    offset += size;
  }
  if (offset !== payload.length) throw new Error("MP4 has trailing/incomplete top-level bytes");
  const moov = boxes.find((box) => box.type === "moov");
  const mdat = boxes.find((box) => box.type === "mdat");
  if (!moov || !mdat || moov.offset >= mdat.offset) throw new Error("MP4 does not have fast-start moov before mdat");
  return { moovOffset: moov.offset, mdatOffset: mdat.offset, status: "PASS" };
}

function parseFrameMd5(text) {
  return text.split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",").at(-1).trim());
}

async function validateSeeking(config, candidatePath) {
  const full = await runTool(config, `candidate-framemd5-${randomUUID().slice(0, 8)}`, FFMPEG, [
    "-hide_banner", "-nostdin", "-v", "error", "-xerror", "-i", candidatePath,
    "-map", "0:v:0", "-pix_fmt", "yuv420p", "-f", "framemd5", "-",
  ]);
  const fullHashes = parseFrameMd5(full.stdout);
  if (fullHashes.length !== FRAME_COUNT) throw new Error("Decoded framemd5 count differs from 500");
  const checkedFrames = [1, 2, 13, 76, 145, 289, 370, 373, 493, 500];
  for (const frame of checkedFrames) {
    const seek = await runTool(config, `candidate-seek-${frame}-${randomUUID().slice(0, 8)}`, FFMPEG, [
      "-hide_banner", "-nostdin", "-v", "error", "-xerror",
      "-ss", ((frame - 1) / FPS).toFixed(6), "-i", candidatePath,
      "-map", "0:v:0", "-frames:v", "1", "-pix_fmt", "yuv420p", "-f", "framemd5", "-",
    ]);
    const hashes = parseFrameMd5(seek.stdout);
    if (hashes.length !== 1 || hashes[0] !== fullHashes[frame - 1]) {
      throw new Error(`Container seek did not reproduce exact decoded ${frameName(frame)}`);
    }
  }
  return { frames: checkedFrames, status: "PASS" };
}

async function validateCandidate(config, family, codec, candidatePath) {
  const authority = FAMILIES[family];
  const info = await stat(candidatePath);
  if (!info.isFile() || info.size <= 0) {
    throw new Error(`Candidate is not a non-empty regular file: ${candidatePath}`);
  }
  await runTool(config, `validate-decode-${family}-${codec}`, FFMPEG, [
    "-hide_banner", "-nostdin", "-v", "error", "-xerror", "-err_detect", "explode",
    "-i", candidatePath, "-map", "0:v:0", "-f", "null", "NUL",
  ]);
  const probe = await probeJson(config, `validate-probe-${family}-${codec}`, [
    "-hide_banner", "-v", "error", "-count_frames", "-show_streams", "-show_format",
    "-show_entries",
    "stream=index,codec_name,codec_type,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration,time_base,color_range,color_space,color_transfer,color_primaries,profile,level,tags:format=format_name,duration,size,tags",
    candidatePath,
  ]);
  if (!Array.isArray(probe.streams) || probe.streams.length !== 1 || probe.streams[0].codec_type !== "video") {
    throw new Error("Candidate must contain exactly one video stream and no other streams");
  }
  const stream = probe.streams[0];
  const expectedCodec = codec === "h264" ? "h264" : "vp9";
  if (
    stream.codec_name !== expectedCodec
    || stream.width !== authority.width
    || stream.height !== authority.height
    || stream.pix_fmt !== "yuv420p"
    || parseRational(stream.r_frame_rate) !== FPS
    || parseRational(stream.avg_frame_rate) !== FPS
    || Number(stream.nb_read_frames) !== FRAME_COUNT
    || stream.color_range !== "tv"
    || stream.color_space !== "bt709"
    || stream.color_transfer !== "bt709"
    || stream.color_primaries !== "bt709"
  ) {
    throw new Error(`Candidate stream authority mismatch: ${candidatePath}`);
  }
  const duration = Number(stream.duration ?? probe.format?.duration);
  if (!Number.isFinite(duration) || Math.abs(duration - FRAME_COUNT / FPS) > 0.0011) {
    throw new Error(`Candidate duration differs from 500/30: ${duration}`);
  }
  const framesProbe = await probeJson(config, `validate-frames-${family}-${codec}`, [
    "-hide_banner", "-v", "error", "-select_streams", "v:0", "-show_frames",
    "-show_entries", "frame=key_frame,best_effort_timestamp_time,pkt_duration_time", candidatePath,
  ]);
  const frames = framesProbe.frames ?? [];
  if (frames.length !== FRAME_COUNT) throw new Error(`Candidate frame probe count=${frames.length}, expected 500`);
  const keyframes = [];
  for (let index = 0; index < frames.length; index += 1) {
    if (Number(frames[index].key_frame) === 1) keyframes.push(index + 1);
    const timestamp = Number(frames[index].best_effort_timestamp_time);
    if (!Number.isFinite(timestamp) || Math.abs(timestamp - index / FPS) > 0.0008) {
      throw new Error(`Candidate timestamp cadence failed at ${frameName(index + 1)}: ${timestamp}`);
    }
  }
  const expectedKeyframes = Array.from(
    { length: Math.ceil(FRAME_COUNT / 12) },
    (_unused, index) => 1 + index * 12,
  ).filter((frame) => frame <= FRAME_COUNT);
  if (compactCanonical(keyframes) !== compactCanonical(expectedKeyframes)) {
    throw new Error(`Candidate keyframe cadence is not exact fixed 12-frame GOP: ${candidatePath}`);
  }
  const privacyText = stableJson(probe);
  if (containsPrivatePath(privacyText)) {
    throw new Error("Candidate metadata leaks a private local path");
  }
  const payload = await readFile(candidatePath);
  const binaryPrivacyText = `${payload.toString("latin1")}\n${payload.toString("utf16le")}`;
  if (containsPrivatePath(binaryPrivacyText)) {
    throw new Error("Candidate container bytes leak a private local path");
  }
  let container;
  if (codec === "h264") {
    container = validateMp4FastStart(payload);
  } else {
    const cues = findAllMarkers(payload, Buffer.from([0x1c, 0x53, 0xbb, 0x6b]));
    const clusters = findAllMarkers(payload, Buffer.from([0x1f, 0x43, 0xb6, 0x75]));
    if (cues.length === 0 || clusters.length < 40 || cues[0] >= clusters[0]) {
      throw new Error("WebM front-cue/cluster authority failed");
    }
    const packetProbe = await probeJson(config, `validate-packets-${family}-${codec}`, [
      "-hide_banner", "-v", "error", "-select_streams", "v:0", "-show_packets",
      "-show_entries", "packet=pts_time,pos,flags", candidatePath,
    ]);
    const packets = packetProbe.packets ?? [];
    if (packets.length !== FRAME_COUNT) throw new Error("WebM packet count differs from 500");
    const clusterSpans = new Map();
    for (const packet of packets) {
      const position = Number(packet.pos);
      const timestamp = Number(packet.pts_time);
      let clusterIndex = -1;
      for (let index = 0; index < clusters.length && clusters[index] <= position; index += 1) clusterIndex = index;
      if (clusterIndex < 0 || !Number.isFinite(timestamp)) throw new Error("WebM packet cannot be bound to a cluster");
      const prior = clusterSpans.get(clusterIndex) ?? { min: timestamp, max: timestamp };
      prior.min = Math.min(prior.min, timestamp);
      prior.max = Math.max(prior.max, timestamp);
      clusterSpans.set(clusterIndex, prior);
    }
    const maximumSpan = Math.max(...[...clusterSpans.values()].map((range) => range.max - range.min));
    if (maximumSpan > 0.401) throw new Error(`WebM cluster time span exceeds 400 ms: ${maximumSpan}`);
    container = { cuesBeforeClusters: true, clusterCount: clusterSpans.size, maximumClusterSpanSeconds: maximumSpan, status: "PASS" };
  }
  const seeking = await validateSeeking(config, candidatePath);
  return {
    status: "PASS",
    bytes: info.size,
    sha256: await sha256File(candidatePath),
    operationalTarget: info.size <= OPERATIONAL_TARGET_BYTES ? "PASS" : "ABOVE_24_MIB_HEADROOM_TARGET",
    strictCloudflareGate: info.size < MAX_DEPLOY_BYTES ? "PASS" : "FAIL",
    probe: {
      codec: stream.codec_name,
      profile: stream.profile ?? null,
      level: stream.level ?? null,
      resolution: [stream.width, stream.height],
      pixelFormat: stream.pix_fmt,
      fps: "30/1",
      frames: FRAME_COUNT,
      durationSeconds: duration,
      color: { range: stream.color_range, space: stream.color_space, transfer: stream.color_transfer, primaries: stream.color_primaries },
    },
    keyframes,
    container,
    seeking,
    metadata: {
      formatTags: probe.format?.tags ?? {},
      streamTags: stream.tags ?? {},
      privacy: "PASS",
    },
    decode: "PASS",
  };
}

function assertHashNamedAsset(basename, family, codec, sha256) {
  const escapedFamily = family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expected = codec
    ? new RegExp(`^phase-4r2-${escapedFamily}-${codec}-${sha256.slice(0, 12)}\\.${codecExtension(codec)}$`)
    : new RegExp(`^phase-4r2-${escapedFamily}-poster-${sha256.slice(0, 12)}\\.png$`);
  if (!expected.test(basename)) throw new Error(`Asset filename is not bound to its full SHA-256: ${basename}`);
}

function metricReferenceFilter(width, height) {
  return [
    `zscale=w=${width}:h=${height}:f=lanczos`,
    "rin=full:r=full:min=gbr:m=gbr",
    "tin=iec61966-2-1:t=iec61966-2-1:pin=bt709:p=bt709",
    "format=gbrp16le",
  ].join(":").replace(":format", ",format");
}

function metricCandidateFilter(width, height) {
  return [
    `zscale=w=${width}:h=${height}:f=lanczos`,
    "rin=limited:r=full:min=bt709:m=gbr",
    "tin=bt709:t=iec61966-2-1:pin=bt709:p=bt709",
    "format=gbrp16le",
  ].join(":").replace(":format", ",format");
}

function numberOrInfinity(value) {
  return String(value).toLowerCase() === "inf" ? Infinity : Number(value);
}

function serialMetric(value) {
  return Number.isFinite(value) ? value : "inf";
}

function rangeMetric(values, start, end) {
  const selected = values.slice(start - 1, end).filter(Number.isFinite);
  return selected.length ? selected.reduce((sum, value) => sum + value, 0) / selected.length : Infinity;
}

async function measureCandidate(config, family, candidateId, candidatePath) {
  const authority = FAMILIES[family];
  const workDirectory = path.join(config.mediaRoot, "metrics", family, `${candidateId}-${randomUUID()}`);
  await mkdir(workDirectory, { recursive: true });
  const ssimLog = path.join(workDirectory, "ssim.log");
  const psnrLog = path.join(workDirectory, "psnr.log");
  for (const existing of [ssimLog, psnrLog]) {
    try { await stat(existing); throw new Error(`Metric log already exists without a completed candidate authority: ${existing}`); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  const masterPattern = path.join(config.outputRoot, "masters", family, "frames", "F%03d.png");
  const graph = [
    `[0:v]trim=end_frame=${FRAME_COUNT},setpts=N/(${FPS}*TB),${metricReferenceFilter(authority.width, authority.height)}[ref]`,
    `[1:v]trim=end_frame=${FRAME_COUNT},setpts=N/(${FPS}*TB),${metricCandidateFilter(authority.width, authority.height)}[dist]`,
    "[ref]split=2[refS][refP]",
    "[dist]split=2[distS][distP]",
    "[distS][refS]ssim=stats_file=ssim.log:eof_action=endall:shortest=1:repeatlast=0[s]",
    "[distP][refP]psnr=stats_file=psnr.log:stats_version=2:output_max=1:eof_action=endall:shortest=1:repeatlast=0[p]",
  ].join(";");
  const result = await runTool(config, `metrics-${candidateId}`, FFMPEG, [
    "-hide_banner", "-nostdin", "-v", "info", "-xerror",
    "-f", "image2", "-framerate", String(FPS), "-start_number", "1", "-i", masterPattern,
    "-i", candidatePath, "-filter_complex_threads", "1", "-filter_complex", graph,
    "-map", "[s]", "-map", "[p]", "-frames:v", String(FRAME_COUNT), "-f", "null", "NUL",
  ], { cwd: workDirectory });
  const ssimValues = (await readFile(ssimLog, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => {
    const match = line.match(/All:([^ ]+)/);
    return match ? numberOrInfinity(match[1]) : NaN;
  });
  const psnrValues = (await readFile(psnrLog, "utf8")).split(/\r?\n/).filter((line) => /^n:\d+/.test(line)).map((line) => {
    const match = line.match(/psnr_avg:([^ ]+)/);
    return match ? numberOrInfinity(match[1]) : NaN;
  });
  if (ssimValues.length !== FRAME_COUNT || psnrValues.length !== FRAME_COUNT || ssimValues.some(Number.isNaN) || psnrValues.some(Number.isNaN)) {
    throw new Error(`${candidateId} metric logs do not contain exact 500-frame values`);
  }
  const ssimAggregate = numberOrInfinity(result.stderr.match(/SSIM[^\r\n]*All:([^ ]+)/)?.[1]);
  const psnrAggregate = numberOrInfinity(result.stderr.match(/PSNR[^\r\n]*average:([^ ]+)/)?.[1]);
  if (Number.isNaN(ssimAggregate) || Number.isNaN(psnrAggregate)) throw new Error(`${candidateId} aggregate metrics were not emitted`);
  const critical = [1, 166, 285, 370, 480, 500];
  return {
    aggregate: { ssim: serialMetric(ssimAggregate), psnrDb: serialMetric(psnrAggregate) },
    criticalFrames: Object.fromEntries(critical.map((frame) => [frameName(frame), {
      ssim: serialMetric(ssimValues[frame - 1]), psnrDb: serialMetric(psnrValues[frame - 1]),
    }])),
    ranges: {
      currentF150F180: { ssim: serialMetric(rangeMetric(ssimValues, 150, 180)), psnrDb: serialMetric(rangeMetric(psnrValues, 150, 180)) },
      qF360F390: { ssim: serialMetric(rangeMetric(ssimValues, 360, 390)), psnrDb: serialMetric(rangeMetric(psnrValues, 360, 390)) },
      approachF450F500: { ssim: serialMetric(rangeMetric(ssimValues, 450, 500)), psnrDb: serialMetric(rangeMetric(psnrValues, 450, 500)) },
    },
    perFrame: ssimValues.map((ssim, index) => ({
      frame: index + 1,
      ssim: serialMetric(ssim),
      psnrDb: serialMetric(psnrValues[index]),
    })),
    comparisonSpace: "display-referred full-range gbrp16le",
    status: "PASS",
  };
}

function settingsAuthorities(config) {
  const common = {
    frames: FRAME_COUNT,
    fps: FPS,
    fixedGopFrames: 12,
    pixelFormat: "yuv420p",
    colorRange: "tv",
    colorSpace: "bt709",
    transfer: "bt709",
    primaries: "bt709",
    forwardColorTransform: forwardColorFilter("<WIDTH>", "<HEIGHT>"),
    mapping: { videoStream: "0:v:0", audio: false, metadata: false, chapters: false },
    deterministicMuxing: { ffFlags: "+bitexact", encoderMetadata: "cleared" },
    maximumBytesExclusive: MAX_DEPLOY_BYTES,
  };
  const h264 = { codec: "libx264", preset: "slow", crfs: LADDER.h264.map((item) => item.crf), extra: codecArguments("h264", "<CRF>") };
  const vp9 = { codec: "libvpx-vp9", deadline: "good", cpuUsed: 1, crfs: LADDER.vp9.map((item) => item.crf), extra: codecArguments("vp9", "<CRF>") };
  const metric = { reference: "display-referred full-range gbrp16le", candidate: "BT.709 limited to sRGB/full gbrp16le", stats: ["SSIM", "PSNR"] };
  return Object.fromEntries(Object.entries({ common, "h264-v1": h264, "vp9-v1": vp9, "metric-v1": metric }).map(([key, value]) => [key, {
    value,
    sha256: sha256Buffer(Buffer.from(compactCanonical(value))),
  }]));
}

function assertQualityReportAuthority(config, report, toolchain) {
  if (
    report.schema !== "quantum-hub.phase-4-r2.encode-quality-report.v1"
    || report.sourceBlendSha256 !== SOURCE_SHA256
    || report.toolchain?.ffmpeg?.sha256 !== toolchain.ffmpeg.sha256
    || report.toolchain?.ffprobe?.sha256 !== toolchain.ffprobe.sha256
    || report.toolchain?.sharp?.version !== toolchain.sharp.version
    || compactCanonical(report.settingsAuthorities) !== compactCanonical(settingsAuthorities(config))
  ) throw new Error("Encode-quality report source/toolchain/settings authority mismatch");
}

async function loadQualityReport(config, toolchain) {
  try {
    const report = await readJson(config.qualityReport);
    assertQualityReportAuthority(config, report, toolchain);
    return report;
  } catch (error) {
    if (error?.cause?.code !== "ENOENT" && error?.code !== "ENOENT") throw error;
    return {
      schema: "quantum-hub.phase-4-r2.encode-quality-report.v1",
      generatedAt: new Date().toISOString(),
      sourceBlendSha256: SOURCE_SHA256,
      toolchain,
      settingsAuthorities: settingsAuthorities(config),
      families: {},
      status: "INCOMPLETE",
    };
  }
}

function assertCandidateRecordAuthority(config, candidate, family, codec, level, settingsAuthoritySha256) {
  const familyAuthority = FAMILIES[family];
  const metricValue = (value, kind) => (
    (value === "inf" && kind === "psnr")
    || (typeof value === "number" && Number.isFinite(value) && (kind !== "ssim" || (value >= 0 && value <= 1)))
  );
  const expectedCritical = ["F001", "F166", "F285", "F370", "F480", "F500"];
  const expectedKeyframes = Array.from(
    { length: Math.ceil(FRAME_COUNT / 12) },
    (_unused, index) => 1 + index * 12,
  ).filter((frame) => frame <= FRAME_COUNT);
  const perFrame = candidate.metrics?.perFrame;
  const expectedCloudflareGate = candidate.bytes < MAX_DEPLOY_BYTES ? "PASS" : "FAIL";
  const expectedMachineStatus = expectedCloudflareGate === "PASS" ? "PASS" : "SIZE_REJECTED";
  const expectedOperationalTarget = candidate.bytes <= OPERATIONAL_TARGET_BYTES
    ? "PASS"
    : "ABOVE_24_MIB_HEADROOM_TARGET";
  if (
    candidate.id !== `${family}-${codec}-${level.quality}`
    || candidate.codec !== codec
    || candidate.qualityLevel !== level.quality
    || candidate.crf !== level.crf
    || candidate.settingsAuthoritySha256 !== settingsAuthoritySha256
    || compactCanonical(candidate.resolution) !== compactCanonical([familyAuthority.width, familyAuthority.height])
    || candidate.file !== `phase-4r2-${family}-${codec}-${candidate.sha256?.slice(0, 12)}.${codecExtension(codec)}`
    || path.basename(resolveUnder(config.mediaRoot, candidate.externalRelativePath, `${candidate.id} external path`)) !== candidate.file
    || !/^[0-9a-f]{64}$/.test(candidate.sha256 ?? "")
    || !Number.isInteger(candidate.bytes)
    || candidate.bytes <= 0
    || candidate.cloudflareGate !== expectedCloudflareGate
    || candidate.machineStatus !== expectedMachineStatus
    || candidate.operationalTarget !== expectedOperationalTarget
    || candidate.decode !== "PASS"
    || candidate.container?.status !== "PASS"
    || candidate.seeking?.status !== "PASS"
    || candidate.metadata?.privacy !== "PASS"
    || compactCanonical(candidate.keyframes) !== compactCanonical(expectedKeyframes)
    || candidate.metrics?.status !== "PASS"
    || !metricValue(candidate.metrics?.aggregate?.ssim, "ssim")
    || !metricValue(candidate.metrics?.aggregate?.psnrDb, "psnr")
    || !Array.isArray(perFrame)
    || perFrame.length !== FRAME_COUNT
    || perFrame.some((record, index) => record.frame !== index + 1
      || !metricValue(record.ssim, "ssim")
      || !metricValue(record.psnrDb, "psnr"))
    || compactCanonical(Object.keys(candidate.metrics?.criticalFrames ?? {}).sort()) !== compactCanonical(expectedCritical)
    || !expectedCritical.every((frame) => metricValue(candidate.metrics.criticalFrames[frame]?.ssim, "ssim")
      && metricValue(candidate.metrics.criticalFrames[frame]?.psnrDb, "psnr"))
    || !["currentF150F180", "qF360F390", "approachF450F500"].every((range) =>
      metricValue(candidate.metrics?.ranges?.[range]?.ssim, "ssim")
      && metricValue(candidate.metrics?.ranges?.[range]?.psnrDb, "psnr"))
    || compactCanonical(candidate.probe?.resolution) !== compactCanonical([familyAuthority.width, familyAuthority.height])
    || candidate.probe?.pixelFormat !== "yuv420p"
    || candidate.probe?.fps !== "30/1"
    || candidate.probe?.frames !== FRAME_COUNT
    || candidate.probe?.color?.range !== "tv"
    || candidate.probe?.color?.space !== "bt709"
    || candidate.probe?.color?.transfer !== "bt709"
    || candidate.probe?.color?.primaries !== "bt709"
    || !Array.isArray(candidate.argv)
    || sha256Buffer(Buffer.from(compactCanonical(candidate.argv))) !== candidate.argvSha256
  ) throw new Error(`${candidate.id ?? "candidate"} encode command/settings authority mismatch`);
  const expected = canonicalArguments(
    config,
    FFMPEG,
    encodeArguments(config, family, codec, level.crf, path.join(config.mediaRoot, "__CANDIDATE_OUTPUT__")),
  );
  if (compactCanonical(candidate.argv.slice(0, -1)) !== compactCanonical(expected.slice(0, -1))) {
    throw new Error(`${candidate.id} canonical encode arguments differ from the current ladder authority`);
  }
  const expectedPartialPrefix = canonicalArguments(config, FFMPEG, [path.join(
    config.mediaRoot,
    "candidates",
    family,
    candidate.id,
    `${candidate.id}.partial-`,
  )])[1];
  if (
    !String(candidate.argv.at(-1)).startsWith(expectedPartialPrefix)
    || !String(candidate.argv.at(-1)).endsWith(`.${codecExtension(codec)}`)
  ) {
    throw new Error(`${candidate.id} canonical encode output is outside its exact candidate authority directory`);
  }
}

async function promoteHashNamed(config, partialPath, family, codec) {
  const info = await stat(partialPath);
  const digest = await sha256File(partialPath);
  const extension = codecExtension(codec);
  const basename = `phase-4r2-${family}-${codec}-${digest.slice(0, 12)}.${extension}`;
  const destination = path.join(path.dirname(partialPath), basename);
  try {
    const existing = await stat(destination);
    const existingHash = await sha256File(destination);
    if (existing.size !== info.size || existingHash !== digest) {
      throw new Error(`12-character hash-name collision: ${basename}`);
    }
    await unlink(partialPath);
  } catch (error) {
    if (error?.code === "ENOENT") await rename(partialPath, destination);
    else throw error;
  }
  if (!path.basename(destination).includes(digest.slice(0, 12))) throw new Error("Hash-name promotion failed");
  return { destination, basename, bytes: info.size, sha256: digest };
}

async function recoverInterruptedCandidate(config, family, codec, level, id, candidateDirectory) {
  let entries;
  try {
    entries = await readdir(candidateDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const extension = codecExtension(codec);
  const outputPattern = new RegExp(
    `^(?:${escapedId}\\.partial-[0-9a-f-]{36}|phase-4r2-${family}-${codec}-[0-9a-f]{12})\\.${extension}$`,
    "i",
  );
  const outputs = [];
  for (const entry of entries) {
    const full = path.join(candidateDirectory, entry.name);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`${id} interrupted candidate directory contains a non-regular entry`);
    }
    if (!outputPattern.test(entry.name)) {
      throw new Error(`${id} interrupted candidate directory contains an unexpected payload: ${entry.name}`);
    }
    outputs.push(full);
  }
  if (outputs.length === 0) return null;
  if (outputs.length !== 1) {
    for (const output of outputs) await moveToQuarantine(config, output, "ambiguous-interrupted-encode");
    throw new Error(`${id} had multiple unrecorded candidate outputs; all were quarantined and no re-encode was started`);
  }

  const orphan = outputs[0];
  const orphanInfo = await stat(orphan);
  const expectedArgv = canonicalArguments(
    config,
    FFMPEG,
    encodeArguments(config, family, codec, level.crf, path.join(candidateDirectory, "__RECOVERY_OUTPUT__")),
  );
  const receiptCandidates = [];
  const logDirectory = path.join(config.mediaRoot, "logs");
  let receiptNames = [];
  try {
    receiptNames = (await readdir(logDirectory)).filter((name) =>
      name.startsWith(`encode-${id}-`) && name.endsWith(".receipt.json"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  for (const receiptName of receiptNames) {
    let receipt;
    try {
      receipt = await readJson(path.join(logDirectory, receiptName), `${id} interrupted encode receipt`);
    } catch {
      continue;
    }
    const completedAt = Date.parse(receipt.completedAt ?? "");
    const receiptOutput = String(receipt.argv?.at(-1) ?? "");
    const expectedOutputPrefix = canonicalArguments(config, FFMPEG, [path.join(
      candidateDirectory,
      `${id}.partial-`,
    )])[1];
    if (
      receipt.schema !== "quantum-hub.phase-4-r2.media-process-receipt.v1"
      || receipt.label !== `encode-${id}`
      || receipt.status !== "PASS"
      || receipt.exitCode !== 0
      || receipt.signal !== null
      || !Number.isFinite(completedAt)
      || !Array.isArray(receipt.argv)
      || sha256Buffer(Buffer.from(compactCanonical(receipt.argv))) !== receipt.argvSha256
      || compactCanonical(receipt.argv.slice(0, -1)) !== compactCanonical(expectedArgv.slice(0, -1))
      || !receiptOutput.startsWith(expectedOutputPrefix)
      || !receiptOutput.endsWith(`.${extension}`)
    ) continue;
    const orphanIsPartial = path.basename(orphan).startsWith(`${id}.partial-`);
    if (orphanIsPartial && path.basename(receiptOutput.replaceAll("/", path.sep)) !== path.basename(orphan)) continue;
    const deltaMs = Math.abs(orphanInfo.mtimeMs - completedAt);
    if (deltaMs <= 5 * 60 * 1000) receiptCandidates.push({ receipt, deltaMs });
  }
  receiptCandidates.sort((left, right) => left.deltaMs - right.deltaMs);
  if (receiptCandidates.length === 0
    || (receiptCandidates.length > 1 && receiptCandidates[0].deltaMs === receiptCandidates[1].deltaMs)) {
    await moveToQuarantine(config, orphan, "unattributed-interrupted-encode");
    throw new Error(`${id} orphan output could not be uniquely bound to a successful exact encode receipt; it was quarantined and no re-encode was started`);
  }

  const promoted = path.basename(orphan).startsWith(`${id}.partial-`)
    ? await promoteHashNamed(config, orphan, family, codec)
    : {
      destination: orphan,
      basename: path.basename(orphan),
      bytes: orphanInfo.size,
      sha256: await sha256File(orphan),
    };
  assertHashNamedAsset(promoted.basename, family, codec, promoted.sha256);
  return {
    promoted,
    encode: {
      argvSha256: receiptCandidates[0].receipt.argvSha256,
      receipt: receiptCandidates[0].receipt,
    },
    recovery: {
      status: "PASS",
      method: "unique successful receipt plus output completion time and exact current argv",
    },
  };
}

async function encodeLadder(config, family, toolchain, retryFailed, retryStale) {
  const ledger = await readJson(config.ledger, "live production render ledger");
  const auditEntry = await auditFamily(config, ledger, family);
  if (auditEntry.status !== "PASS") throw new Error(`${family} master audit did not pass`);
  const manifestPayload = await readFile(stableManifestPath(config, family));
  const manifestSha256 = sha256Buffer(manifestPayload);
  const masterVerdictAuthority = await assertMasterVisualVerdict(config, family, manifestSha256);
  const report = await loadQualityReport(config, toolchain);
  if (report.status === "SELECTED_VISUAL_PASS") {
    throw new Error("Encode-quality authority is already selection-bound; encode-ladder will not mutate or invalidate it");
  }
  await determinismSmoke(config, family, toolchain, manifestSha256, retryStale);
  const determinismInfo = await stat(determinismReportPath(config, family));
  const determinismSha256 = await sha256File(determinismReportPath(config, family));
  report.generatedAt = new Date().toISOString();
  report.toolchain = toolchain;
  report.families[family] ??= {
    masterFrameManifestSha256: manifestSha256,
    masterVisualVerdictSha256: masterVerdictAuthority.sha256,
    masterVisualVerdictBytes: masterVerdictAuthority.bytes,
    codecDeterminismReportSha256: determinismSha256,
    codecDeterminismReportBytes: determinismInfo.size,
    deliveryDecision: DELIVERY_DECISIONS[family],
    candidates: [],
    candidateHistory: [],
    selection: { vp9: null, h264: null },
  };
  const familyReport = report.families[family];
  if (
    familyReport.masterFrameManifestSha256 !== manifestSha256
    || familyReport.masterVisualVerdictSha256 !== masterVerdictAuthority.sha256
    || familyReport.masterVisualVerdictBytes !== masterVerdictAuthority.bytes
    || familyReport.codecDeterminismReportSha256 !== determinismSha256
    || familyReport.codecDeterminismReportBytes !== determinismInfo.size
    || compactCanonical(familyReport.deliveryDecision) !== compactCanonical(DELIVERY_DECISIONS[family])
  ) throw new Error(`${family} frame, visual-verdict, or delivery-decision authority changed after prior encode work`);
  report.masterVisualVerdictSha256 ??= masterVerdictAuthority.sha256;
  report.masterVisualVerdictBytes ??= masterVerdictAuthority.bytes;
  if (
    report.masterVisualVerdictSha256 !== masterVerdictAuthority.sha256
    || report.masterVisualVerdictBytes !== masterVerdictAuthority.bytes
  ) throw new Error("The preserved master visual verdict differs across family encode work");
  for (const codec of ["vp9", "h264"]) {
    for (const level of LADDER[codec]) {
      const id = `${family}-${codec}-${level.quality}`;
      const settingsAuthoritySha256 = report.settingsAuthorities[`${codec}-v1`].sha256;
      let existing = familyReport.candidates.find((candidate) => candidate.id === id);
      if (["PASS", "SIZE_REJECTED"].includes(existing?.machineStatus)) {
        const candidatePath = resolveUnder(config.mediaRoot, existing.externalRelativePath, `${id} candidate path`);
        if (path.basename(candidatePath) !== existing.file) throw new Error(`${id} report filename differs from candidate bytes`);
        assertCandidateRecordAuthority(config, existing, family, codec, level, settingsAuthoritySha256);
        assertHashNamedAsset(path.basename(candidatePath), family, codec, existing.sha256);
        const validation = await validateCandidate(config, family, codec, candidatePath);
        if (validation.sha256 !== existing.sha256 || validation.bytes !== existing.bytes) throw new Error(`${id} changed after validation`);
        continue;
      }
      if (existing && !retryFailed) throw new Error(`${id} has a failed prior attempt; pass --retry-failed to preserve and retry it`);
      if (existing) {
        familyReport.candidateHistory.push(existing);
        familyReport.candidates = familyReport.candidates.filter((candidate) => candidate.id !== id);
        if (existing.externalRelativePath) {
          await moveToQuarantine(
            config,
            resolveUnder(config.mediaRoot, existing.externalRelativePath, `${id} retry path`),
            "retry",
          );
        }
      }
      const candidateDirectory = path.join(config.mediaRoot, "candidates", family, id);
      await mkdir(candidateDirectory, { recursive: true });
      const extension = codecExtension(codec);
      let partialPath = null;
      let promoted;
      try {
        const recovered = await recoverInterruptedCandidate(config, family, codec, level, id, candidateDirectory);
        let encode;
        if (recovered) {
          ({ promoted, encode } = recovered);
        } else {
          partialPath = path.join(candidateDirectory, `${id}.partial-${randomUUID()}.${extension}`);
          const args = encodeArguments(config, family, codec, level.crf, partialPath);
          encode = await runTool(config, `encode-${id}`, FFMPEG, args);
          promoted = await promoteHashNamed(config, partialPath, family, codec);
        }
        const validation = await validateCandidate(config, family, codec, promoted.destination);
        const metrics = await measureCandidate(config, family, id, promoted.destination);
        existing = {
          id,
          codec,
          qualityLevel: level.quality,
          crf: level.crf,
          resolution: [FAMILIES[family].width, FAMILIES[family].height],
          bytes: promoted.bytes,
          sha256: promoted.sha256,
          externalRelativePath: path.relative(config.mediaRoot, promoted.destination).split(path.sep).join("/"),
          file: promoted.basename,
          argvSha256: encode.argvSha256,
          argv: encode.receipt.argv,
          settingsAuthoritySha256,
          probe: validation.probe,
          metadata: validation.metadata,
          decode: validation.decode,
          keyframes: validation.keyframes,
          container: validation.container,
          seeking: validation.seeking,
          metrics,
          cloudflareGate: validation.strictCloudflareGate,
          operationalTarget: validation.operationalTarget,
          visual: Object.fromEntries(REQUIRED_VISUAL_FIELDS.map((field) => [field, "PENDING_REVIEW"])),
          selected: false,
          rejectionReason: null,
          interruptedRunRecovery: recovered?.recovery ?? null,
          machineStatus: validation.strictCloudflareGate === "PASS" ? "PASS" : "SIZE_REJECTED",
        };
        familyReport.candidates.push(existing);
      } catch (error) {
        const failedOutput = promoted?.destination ?? partialPath;
        const quarantined = failedOutput
          ? await moveToQuarantine(config, failedOutput, "encode-failure")
          : null;
        familyReport.candidates.push({
          id, codec, qualityLevel: level.quality, crf: level.crf,
          machineStatus: "FAIL", error: sanitizedExternalMessage(config, error.message ?? error),
          quarantinedBasename: quarantined ? path.basename(quarantined) : null,
        });
        report.status = "FAIL";
        await atomicJson(config.qualityReport, report);
        throw error;
      }
      await atomicJson(config.qualityReport, report);
    }
  }
  report.status = Object.keys(FAMILIES).every((name) => report.families[name]?.candidates?.length === 6
    && report.families[name].candidates.every((candidate) => ["PASS", "SIZE_REJECTED"].includes(candidate.machineStatus)))
    ? "MACHINE_VALIDATED_VISUAL_PENDING"
    : "PARTIAL_MACHINE_PASS";
  await atomicJson(config.qualityReport, report);
  await writeEncodeVerdictTemplate(config, report);
  return report;
}

async function writeMasterVerdictTemplate(config) {
  const families = {};
  for (const [family, authority] of Object.entries(FAMILIES)) {
    let masterFrameManifestSha256 = null;
    try {
      masterFrameManifestSha256 = await sha256File(stableManifestPath(config, family));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    families[family] = {
      settingsSha256: authority.settingsSha256,
      masterFrameManifestSha256,
      visualSampleFrames: VISUAL_SAMPLE_FRAMES,
      pilot: "PENDING_REVIEW",
      temporal: "PENDING_REVIEW",
      finalVisualSample: "PENDING_REVIEW",
    };
  }
  const template = {
    schema: "quantum-hub.phase-4-r2.master-visual-verdict.v1",
    sourceBlendSha256: SOURCE_SHA256,
    families,
  };
  const templatePath = path.join(config.mediaRoot, "reports", "phase-4r2-master-visual-verdict.template.json");
  await atomicJson(templatePath, template);
  return templatePath;
}

async function writeEncodeVerdictTemplate(config, report = null) {
  report ??= await readJson(config.qualityReport, "encode quality report");
  const currentQualityReportSha256 = await sha256File(config.qualityReport);
  const qualityReportSha256 = report.selectionInputSha256 ?? currentQualityReportSha256;
  const candidates = {};
  for (const family of Object.values(report.families ?? {})) {
    for (const candidate of family.candidates ?? []) {
      if (["PASS", "SIZE_REJECTED"].includes(candidate.machineStatus)) {
        candidates[candidate.id] = {
          sha256: candidate.sha256,
          bytes: candidate.bytes,
          masterFrameManifestSha256: family.masterFrameManifestSha256,
          settingsAuthoritySha256: candidate.settingsAuthoritySha256,
          argvSha256: candidate.argvSha256,
          ...Object.fromEntries(REQUIRED_VISUAL_FIELDS.map((field) => [field, "PENDING_REVIEW"])),
        };
      }
    }
  }
  const template = {
    schema: "quantum-hub.phase-4-r2.encode-visual-verdict.v1",
    sourceBlendSha256: SOURCE_SHA256,
    qualityReportSha256,
    candidates,
  };
  const templatePath = path.join(config.mediaRoot, "reports", "phase-4r2-encode-visual-verdict.template.json");
  await atomicJson(templatePath, template);
  return templatePath;
}

function visualPass(record) {
  return record && REQUIRED_VISUAL_FIELDS.every((field) => record[field] === "PASS");
}

async function selectCandidates(config, toolchain) {
  const reportPayload = await readFile(config.qualityReport);
  const reportSha256 = sha256Buffer(reportPayload);
  const report = JSON.parse(reportPayload.toString("utf8"));
  assertQualityReportAuthority(config, report, toolchain);
  const masterVerdictPayload = await readFile(config.masterVerdictAuthority);
  const masterVerdictSha256 = sha256Buffer(masterVerdictPayload);
  const masterVerdict = JSON.parse(masterVerdictPayload.toString("utf8"));
  if (
    report.masterVisualVerdictSha256 !== masterVerdictSha256
    || report.masterVisualVerdictBytes !== masterVerdictPayload.length
  ) throw new Error("Encode quality report is not bound to the preserved master visual verdict");
  const selectionInputSha256 = report.selectionInputSha256 ?? reportSha256;
  await assertExternalVerdictFile(config.encodeVerdict, "encode visual verdict");
  const verdictPayload = await readFile(config.encodeVerdict);
  let verdict;
  try {
    verdict = JSON.parse(verdictPayload.toString("utf8"));
  } catch (error) {
    throw new Error(`encode visual verdict is invalid JSON: ${config.encodeVerdict}`, { cause: error });
  }
  if (
    report.schema !== "quantum-hub.phase-4-r2.encode-quality-report.v1"
    || verdict.schema !== "quantum-hub.phase-4-r2.encode-visual-verdict.v1"
    || report.sourceBlendSha256 !== SOURCE_SHA256
    || verdict.sourceBlendSha256 !== SOURCE_SHA256
    || verdict.qualityReportSha256 !== selectionInputSha256
  ) throw new Error("Encode selection authorities do not match Phase 4-R2");
  const expectedVerdictCandidates = Object.keys(FAMILIES).flatMap((family) =>
    ["vp9", "h264"].flatMap((codec) => LADDER[codec].map((level) => `${family}-${codec}-${level.quality}`))
  ).sort();
  if (compactCanonical(Object.keys(verdict.candidates ?? {}).sort()) !== compactCanonical(expectedVerdictCandidates)) {
    throw new Error("Encode visual verdict must contain exactly the complete 18-candidate ladder");
  }
  const assets = [];
  const selectionValidations = new Map();
  for (const family of Object.keys(FAMILIES)) {
    const familyReport = report.families?.[family];
    const currentMasterFrameManifestSha256 = await sha256File(stableManifestPath(config, family));
    assertMasterVisualVerdictState(masterVerdict, family, currentMasterFrameManifestSha256);
    await determinismSmoke(config, family, toolchain, currentMasterFrameManifestSha256, false);
    const currentDeterminismPayload = await readFile(determinismReportPath(config, family));
    if (
      !familyReport
      || familyReport.candidates?.length !== 6
      || familyReport.masterFrameManifestSha256 !== currentMasterFrameManifestSha256
      || familyReport.masterVisualVerdictSha256 !== masterVerdictSha256
      || familyReport.masterVisualVerdictBytes !== masterVerdictPayload.length
      || !/^[0-9a-f]{64}$/.test(familyReport.codecDeterminismReportSha256 ?? "")
      || !Number.isInteger(familyReport.codecDeterminismReportBytes)
      || familyReport.codecDeterminismReportBytes <= 0
      || familyReport.codecDeterminismReportSha256 !== sha256Buffer(currentDeterminismPayload)
      || familyReport.codecDeterminismReportBytes !== currentDeterminismPayload.length
      || compactCanonical(familyReport.deliveryDecision) !== compactCanonical(DELIVERY_DECISIONS[family])
    ) throw new Error(`${family} does not have the complete six-candidate ladder and authority bindings`);
    for (const candidate of familyReport.candidates) {
      const candidateLevel = LADDER[candidate.codec]?.find((level) => level.quality === candidate.qualityLevel);
      if (!candidateLevel) throw new Error(`${candidate.id} has no exact ladder level authority`);
      assertCandidateRecordAuthority(
        config,
        candidate,
        family,
        candidate.codec,
        candidateLevel,
        report.settingsAuthorities[`${candidate.codec}-v1`].sha256,
      );
      const candidatePath = resolveUnder(config.mediaRoot, candidate.externalRelativePath, `${candidate.id} selection validation path`);
      assertHashNamedAsset(path.basename(candidatePath), family, candidate.codec, candidate.sha256);
      const currentValidation = await validateCandidate(config, family, candidate.codec, candidatePath);
      if (currentValidation.bytes !== candidate.bytes || currentValidation.sha256 !== candidate.sha256) {
        throw new Error(`${candidate.id} changed before visual selection`);
      }
      selectionValidations.set(candidate.id, currentValidation);
      const visual = verdict.candidates?.[candidate.id];
      if (
        visual?.sha256 !== candidate.sha256
        || visual?.bytes !== candidate.bytes
        || visual?.masterFrameManifestSha256 !== familyReport.masterFrameManifestSha256
        || visual?.settingsAuthoritySha256 !== candidate.settingsAuthoritySha256
        || visual?.argvSha256 !== candidate.argvSha256
      ) throw new Error(`${candidate.id} visual verdict is not bound to its exact bytes/master/settings/command`);
      candidate.visual = visual;
      candidate.selected = false;
      if (!["PASS", "SIZE_REJECTED"].includes(candidate.machineStatus)) throw new Error(`${candidate.id} did not machine-validate`);
      if (!REQUIRED_VISUAL_FIELDS.every((field) => ["PASS", "FAIL"].includes(candidate.visual?.[field]))) {
        throw new Error(`${candidate.id} visual verdict must explicitly resolve every required field to PASS or FAIL`);
      }
      candidate.rejectionReason = candidate.cloudflareGate === "FAIL"
        ? "strict-size-gate:asset-is-not-below-25-MiB"
        : visualPass(candidate.visual)
          ? null
          : `visual:${REQUIRED_VISUAL_FIELDS.filter((field) => candidate.visual[field] === "FAIL").join(",")}`;
    }
    for (const codec of ["vp9", "h264"]) {
      const passing = familyReport.candidates
        .filter((candidate) => candidate.codec === codec
          && candidate.cloudflareGate === "PASS"
          && candidate.machineStatus === "PASS"
          && visualPass(candidate.visual))
        .sort((left, right) => left.bytes - right.bytes || left.crf - right.crf);
      if (passing.length === 0) throw new Error(`No ${family} ${codec} candidate has an explicit complete visual PASS`);
      const selected = passing[0];
      const settingsAuthoritySha256 = report.settingsAuthorities?.[`${codec}-v1`]?.sha256;
      if (!/^[0-9a-f]{64}$/.test(settingsAuthoritySha256 ?? "") || !/^[0-9a-f]{64}$/.test(selected.argvSha256 ?? "")) {
        throw new Error(`${selected.id} is missing its exact encode settings/argv authority`);
      }
      const selectedPath = resolveUnder(config.mediaRoot, selected.externalRelativePath, `${selected.id} selected path`);
      if (path.basename(selectedPath) !== selected.file) throw new Error(`${selected.id} selected filename differs from its bytes`);
      const selectedLevel = LADDER[codec].find((level) => level.quality === selected.qualityLevel);
      if (!selectedLevel) throw new Error(`${selected.id} has an unknown ladder quality level`);
      assertCandidateRecordAuthority(
        config,
        selected,
        family,
        codec,
        selectedLevel,
        settingsAuthoritySha256,
      );
      assertHashNamedAsset(path.basename(selectedPath), family, codec, selected.sha256);
      const validation = selectionValidations.get(selected.id);
      if (validation.bytes !== selected.bytes || validation.sha256 !== selected.sha256) {
        throw new Error(`${selected.id} changed between ladder validation and selection`);
      }
      selected.selected = true;
      familyReport.selection[codec] = selected.id;
      for (const alternative of passing.slice(1)) {
        alternative.rejectionReason = `larger-than-selected:${selected.id}`;
      }
      assets.push({
        kind: "video",
        family,
        codec,
        candidateId: selected.id,
        externalRelativePath: selected.externalRelativePath,
        file: selected.file,
        bytes: selected.bytes,
        sha256: selected.sha256,
        resolution: selected.resolution,
        deliveryDecision: DELIVERY_DECISIONS[family],
        masterFrameManifestSha256: familyReport.masterFrameManifestSha256,
        settingsAuthority: `${codec}-v1`,
        settingsAuthoritySha256,
        settings: report.settingsAuthorities[`${codec}-v1`].value,
        commonSettingsAuthoritySha256: report.settingsAuthorities.common.sha256,
        argvSha256: selected.argvSha256,
        argv: selected.argv,
        crf: selected.crf,
        qualityLevel: selected.qualityLevel,
        selectionReason: `${DELIVERY_DECISIONS[family].rationale} Selected the smallest complete machine-valid and visual-PASS ${codec.toUpperCase()} candidate in that native cohort.`,
        quality: selected.metrics.aggregate,
      });
    }
  }
  const encodeVerdictAuthority = await preserveExactAuthority(
    config.encodeVerdictAuthority,
    verdictPayload,
    "encode visual verdict",
  );
  report.status = "SELECTED_VISUAL_PASS";
  report.selectionInputSha256 = selectionInputSha256;
  report.encodeVisualVerdictSha256 = encodeVerdictAuthority.sha256;
  report.encodeVisualVerdictBytes = encodeVerdictAuthority.bytes;
  await atomicJson(config.qualityReport, report);
  const selectedQualityReportSha256 = await sha256File(config.qualityReport);
  const selection = {
    schema: "quantum-hub.phase-4-r2.media-selection.v1",
    sourceBlendSha256: SOURCE_SHA256,
    selectionInputSha256,
    qualityReportSha256: selectedQualityReportSha256,
    masterVisualVerdictSha256: report.masterVisualVerdictSha256,
    encodeVisualVerdictSha256: encodeVerdictAuthority.sha256,
    deliveryResolutionDecisions: DELIVERY_DECISIONS,
    assets,
    status: "PASS",
  };
  await atomicJson(config.selection, selection);
  return selection;
}

async function decodeRawUshort(filePath, width, height) {
  const result = await sharp(filePath, { failOn: "error", limitInputPixels: false })
    .removeAlpha()
    .raw({ depth: "ushort" })
    .toBuffer({ resolveWithObject: true });
  if (result.info.width !== width || result.info.height !== height || result.info.channels !== 3) {
    throw new Error(`Image metric dimensions/channels mismatch: ${filePath}`);
  }
  return new Uint16Array(result.data.buffer, result.data.byteOffset, result.data.byteLength / 2);
}

async function pixelMetrics(referencePath, distortedPath, width, height) {
  const [reference, distorted] = await Promise.all([
    decodeRawUshort(referencePath, width, height),
    decodeRawUshort(distortedPath, width, height),
  ]);
  if (reference.length !== distorted.length) throw new Error("Poster comparison sample counts differ");
  let squaredError = 0;
  let referenceMean = 0;
  let distortedMean = 0;
  const pixels = width * height;
  for (let index = 0; index < reference.length; index += 3) {
    const rr = reference[index]; const rg = reference[index + 1]; const rb = reference[index + 2];
    const dr = distorted[index]; const dg = distorted[index + 1]; const db = distorted[index + 2];
    squaredError += (rr - dr) ** 2 + (rg - dg) ** 2 + (rb - db) ** 2;
    referenceMean += 0.2126 * rr + 0.7152 * rg + 0.0722 * rb;
    distortedMean += 0.2126 * dr + 0.7152 * dg + 0.0722 * db;
  }
  referenceMean /= pixels;
  distortedMean /= pixels;
  let referenceVariance = 0;
  let distortedVariance = 0;
  let covariance = 0;
  for (let index = 0; index < reference.length; index += 3) {
    const ref = 0.2126 * reference[index] + 0.7152 * reference[index + 1] + 0.0722 * reference[index + 2] - referenceMean;
    const dist = 0.2126 * distorted[index] + 0.7152 * distorted[index + 1] + 0.0722 * distorted[index + 2] - distortedMean;
    referenceVariance += ref * ref;
    distortedVariance += dist * dist;
    covariance += ref * dist;
  }
  const divisor = Math.max(1, pixels - 1);
  referenceVariance /= divisor;
  distortedVariance /= divisor;
  covariance /= divisor;
  const mse = squaredError / reference.length;
  const psnrDb = mse === 0 ? Infinity : 10 * Math.log10((65535 ** 2) / mse);
  const c1 = (0.01 * 65535) ** 2;
  const c2 = (0.03 * 65535) ** 2;
  const lumaGlobalSsim = ((2 * referenceMean * distortedMean + c1) * (2 * covariance + c2))
    / ((referenceMean ** 2 + distortedMean ** 2 + c1) * (referenceVariance + distortedVariance + c2));
  if (psnrDb < 30 || lumaGlobalSsim < 0.98) throw new Error(`Poster comparison quality failed: PSNR=${psnrDb} SSIM=${lumaGlobalSsim}`);
  return { rgbPsnrDb: serialMetric(psnrDb), lumaGlobalSsim: serialMetric(lumaGlobalSsim), status: "PASS" };
}

async function validatePoster(config, family, posterPath) {
  const authority = FAMILIES[family];
  const png = await parsePngComplete(posterPath);
  if (compactCanonical(png) !== compactCanonical({
    width: authority.width,
    height: authority.height,
    bitDepth: 8,
    colorType: 2,
    interlaced: 0,
  })) throw new Error(`${family} poster PNG is not exact 8-bit RGB/no-alpha delivery authority`);
  await sharpDecodeComplete(posterPath, authority);
  const probe = await probeJson(config, `poster-probe-${family}`, [
    "-hide_banner", "-v", "error", "-show_streams",
    "-show_entries", "stream=codec_name,codec_type,width,height,pix_fmt,color_range,color_space,color_transfer,color_primaries",
    posterPath,
  ]);
  const stream = probe.streams?.[0];
  if (
    probe.streams?.length !== 1
    || stream.codec_name !== "png"
    || stream.codec_type !== "video"
    || stream.width !== authority.width
    || stream.height !== authority.height
    || stream.pix_fmt !== "rgb24"
    || stream.color_range !== "pc"
    || stream.color_space !== "gbr"
    || stream.color_transfer !== "iec61966-2-1"
    || stream.color_primaries !== "bt709"
  ) throw new Error(`${family} poster color/dimension probe authority failed`);
  const info = await stat(posterPath);
  if (!info.isFile() || info.size <= 0 || info.size >= MAX_DEPLOY_BYTES) throw new Error(`${family} poster violates strict <25 MiB gate`);
  return { bytes: info.size, sha256: await sha256File(posterPath), probe: stream, status: "PASS" };
}

async function measurePosterComparisons(config, family, posterPath, selectedVideos, label) {
  const authority = FAMILIES[family];
  const masterPath = path.join(config.outputRoot, "masters", family, "frames", "F001.png");
  const comparisons = {
    masterF1: await pixelMetrics(masterPath, posterPath, authority.width, authority.height),
  };
  const metricRoot = path.join(config.mediaRoot, "metrics", "posters", family, label);
  await mkdir(metricRoot, { recursive: true });
  for (const video of selectedVideos) {
    const candidatePath = resolveUnder(config.mediaRoot, video.externalRelativePath, `${family} poster comparison video`);
    const decodedPath = path.join(metricRoot, `${video.codec}-decoded-f1-${video.sha256.slice(0, 12)}.png`);
    await runTool(config, `poster-compare-${label}-${family}-${video.codec}`, FFMPEG, [
      "-hide_banner", "-nostdin", "-y", "-v", "error", "-xerror", "-i", candidatePath,
      "-vf", reverseColorFilter(authority.width, authority.height), "-frames:v", "1", "-an",
      "-map_metadata", "-1", "-fflags", "+bitexact", "-c:v", "png", "-compression_level", "9", decodedPath,
    ]);
    comparisons[`decoded${video.codec.toUpperCase()}F1`] = await pixelMetrics(
      decodedPath,
      posterPath,
      authority.width,
      authority.height,
    );
  }
  return comparisons;
}

async function generatePosters(config) {
  const selectionPayload = await readFile(config.selection);
  const selection = JSON.parse(selectionPayload.toString("utf8"));
  const qualityReportPayload = await readFile(config.qualityReport);
  const qualityReport = JSON.parse(qualityReportPayload.toString("utf8"));
  const [masterVerdictSha256, encodeVerdictSha256] = await Promise.all([
    sha256File(config.masterVerdictAuthority),
    sha256File(config.encodeVerdictAuthority),
  ]);
  if (
    selection.schema !== "quantum-hub.phase-4-r2.media-selection.v1"
    || selection.status !== "PASS"
    || selection.qualityReportSha256 !== sha256Buffer(qualityReportPayload)
    || selection.masterVisualVerdictSha256 !== qualityReport.masterVisualVerdictSha256
    || selection.encodeVisualVerdictSha256 !== qualityReport.encodeVisualVerdictSha256
    || selection.masterVisualVerdictSha256 !== masterVerdictSha256
    || selection.encodeVisualVerdictSha256 !== encodeVerdictSha256
    || compactCanonical(selection.deliveryResolutionDecisions) !== compactCanonical(DELIVERY_DECISIONS)
    || !Array.isArray(selection.assets)
    || selection.assets.length !== 6
    || !selection.assets.every((asset) =>
      compactCanonical(asset.deliveryDecision) === compactCanonical(DELIVERY_DECISIONS[asset.family]))
  ) {
    throw new Error("A complete selected video authority is required before posters");
  }
  const posterAssets = [];
  const families = {};
  const masterAuthorities = {};
  for (const family of Object.keys(FAMILIES)) {
    const authority = FAMILIES[family];
    const selectedVideos = selection.assets.filter((asset) => asset.family === family);
    if (selectedVideos.length !== 2 || new Set(selectedVideos.map((asset) => asset.codec)).size !== 2) {
      throw new Error(`${family} selection must contain exactly VP9 and H.264`);
    }
    for (const video of selectedVideos) {
      const candidatePath = resolveUnder(config.mediaRoot, video.externalRelativePath, `${family} selected ${video.codec}`);
      assertHashNamedAsset(path.basename(candidatePath), family, video.codec, video.sha256);
      const validation = await validateCandidate(config, family, video.codec, candidatePath);
      if (validation.bytes !== video.bytes || validation.sha256 !== video.sha256) {
        throw new Error(`${family} selected ${video.codec} changed before poster production`);
      }
    }
    const frameManifestPath = stableManifestPath(config, family);
    const frameManifestPayload = await readFile(frameManifestPath);
    const frameManifestHash = sha256Buffer(frameManifestPayload);
    const frameManifest = JSON.parse(frameManifestPayload.toString("utf8"));
    if (selectedVideos.some((video) => video.masterFrameManifestSha256 !== frameManifestHash)) {
      throw new Error(`${family} selected videos are not bound to the current stable master manifest`);
    }
    masterAuthorities[family] = {
      sequenceSha256: frameManifest.master?.sequenceSha256,
      totalBytes: frameManifest.master?.totalBytes,
    };
    if (!/^[0-9a-f]{64}$/.test(masterAuthorities[family].sequenceSha256 ?? "")) {
      throw new Error(`${family} stable master manifest has no sequence SHA-256 authority`);
    }
    const masterPath = path.join(config.outputRoot, "masters", family, "frames", "F001.png");
    const masterHash = await sha256File(masterPath);
    if (frameManifest.frames?.[0]?.frame !== 1 || frameManifest.frames[0].sha256 !== masterHash) {
      throw new Error(`${family} poster source is not exact manifest F1 authority`);
    }
    const posterDirectory = path.join(config.mediaRoot, "posters", family);
    await mkdir(posterDirectory, { recursive: true });
    const partial = path.join(posterDirectory, `${family}-poster.partial-${randomUUID()}.png`);
    const derivationAuthority = posterDerivationAuthority(family);
    const roundTrip = derivationAuthority.filter;
    await runTool(config, `poster-${family}`, FFMPEG, [
      "-hide_banner", "-nostdin", "-y", "-v", "error", "-xerror", "-i", masterPath,
      "-vf", roundTrip, "-frames:v", "1", "-an", "-map_metadata", "-1", "-fflags", "+bitexact",
      "-c:v", "png", "-compression_level", "9", "-pred", "mixed", partial,
    ]);
    await validatePoster(config, family, partial);
    const digest = await sha256File(partial);
    const basename = `phase-4r2-${family}-poster-${digest.slice(0, 12)}.png`;
    const posterPath = path.join(posterDirectory, basename);
    try {
      const existing = await stat(posterPath);
      const existingHash = await sha256File(posterPath);
      const partialInfo = await stat(partial);
      if (existing.size !== partialInfo.size || existingHash !== digest) {
        throw new Error(`Poster 12-character hash-name collision: ${basename}`);
      }
      await unlink(partial);
    } catch (error) {
      if (error?.code === "ENOENT") await rename(partial, posterPath);
      else throw error;
    }
    assertHashNamedAsset(basename, family, null, digest);
    const posterValidation = await validatePoster(config, family, posterPath);
    const posterInfo = await stat(posterPath);
    const comparisons = await measurePosterComparisons(
      config,
      family,
      posterPath,
      selectedVideos,
      `production-${digest.slice(0, 12)}`,
    );
    const asset = {
      kind: "poster",
      family,
      file: basename,
      externalRelativePath: path.relative(config.mediaRoot, posterPath).split(path.sep).join("/"),
      resolution: [authority.width, authority.height],
      bytes: posterInfo.size,
      sha256: digest,
      masterF1Sha256: masterHash,
      masterFrameManifestSha256: frameManifestHash,
      derivationAuthority,
      derivationAuthoritySha256: sha256Buffer(Buffer.from(compactCanonical(derivationAuthority))),
      probe: posterValidation.probe,
      comparisons,
    };
    posterAssets.push(asset);
    families[family] = { ...asset, status: "PASS" };
  }
  const posterReport = {
    schema: "quantum-hub.phase-4-r2.poster-validation-report.v1",
    sourceBlendSha256: SOURCE_SHA256,
    derivation: "F1 16-bit sRGB/full -> selected-video BT.709 limited yuv420p round trip -> 8-bit RGB PNG",
    families,
    status: "PASS",
  };
  await atomicJson(config.posterReport, posterReport);
  const videoAssets = selection.assets.map((asset) => ({
    file: `media/${asset.file}`,
    kind: "video",
    family: asset.family,
    codec: asset.codec,
    resolution: asset.deliveryDecision.deliveryResolution,
    masterResolution: asset.deliveryDecision.masterResolution,
    deliveryResolution: asset.deliveryDecision.deliveryResolution,
    deliveryDecision: asset.deliveryDecision,
    fps: FPS,
    frames: FRAME_COUNT,
    durationSeconds: FRAME_COUNT / FPS,
    bytes: asset.bytes,
    sha256: asset.sha256,
    sourceMaster: {
      family: asset.family,
      resolution: asset.deliveryDecision.masterResolution,
      frameRange: [1, FRAME_COUNT],
      format: "16-bit RGB PNG sequence",
      sequenceSha256: masterAuthorities[asset.family].sequenceSha256,
      totalBytes: masterAuthorities[asset.family].totalBytes,
    },
    masterFrameManifestSha256: asset.masterFrameManifestSha256,
    encode: {
      settingsAuthority: asset.settingsAuthority,
      settingsAuthoritySha256: asset.settingsAuthoritySha256,
      settings: asset.settings,
      commonSettingsAuthoritySha256: asset.commonSettingsAuthoritySha256,
      argvSha256: asset.argvSha256,
      argv: asset.argv,
      crf: asset.crf,
      qualityLevel: asset.qualityLevel,
    },
    quality: asset.quality,
    selectionReason: asset.selectionReason,
  }));
  const deployedPosters = posterAssets.map((asset) => ({
    file: `posters/${asset.file}`,
    kind: "poster",
    family: asset.family,
    resolution: asset.resolution,
    masterResolution: asset.resolution,
    deliveryResolution: asset.resolution,
    deliveryDecision: DELIVERY_DECISIONS[asset.family],
    bytes: asset.bytes,
    sha256: asset.sha256,
    masterF1Sha256: asset.masterF1Sha256,
    masterFrameManifestSha256: asset.masterFrameManifestSha256,
    derivationAuthority: asset.derivationAuthority,
    derivationAuthoritySha256: asset.derivationAuthoritySha256,
  }));
  const manifest = {
    schema: "quantum-hub.phase-4-r2.production-media-manifest.v1",
    sourceBlendSha256: SOURCE_SHA256,
    physicalTimeline: { frames: FRAME_COUNT, fps: FPS, durationRational: "50/3" },
    selectionSha256: sha256Buffer(selectionPayload),
    qualityReportSha256: sha256Buffer(qualityReportPayload),
    masterVisualVerdictSha256: selection.masterVisualVerdictSha256,
    encodeVisualVerdictSha256: selection.encodeVisualVerdictSha256,
    deliveryResolutionDecisions: DELIVERY_DECISIONS,
    codecDeterminismReports: Object.fromEntries(Object.keys(FAMILIES).map((family) => [family, {
      bytes: qualityReport.families?.[family]?.codecDeterminismReportBytes,
      sha256: qualityReport.families?.[family]?.codecDeterminismReportSha256,
    }])),
    assets: [...videoAssets, ...deployedPosters].sort((left, right) => left.file.localeCompare(right.file)),
    authorization: { mergeMain: false, phase5: false },
  };
  await atomicJson(config.productionManifest, manifest);
  return manifest;
}

async function assertNoPrivateText(filePath) {
  const text = await readFile(filePath, "utf8");
  if (containsPrivatePath(text)) throw new Error(`Private path leaked into staged text: ${filePath}`);
}

async function copyExactAtomic(source, destination, expectedBytes, expectedSha256) {
  const sourceAuthority = await assertExactFile(source, expectedBytes, expectedSha256, `staging source ${path.basename(source)}`);
  try {
    const existing = await assertExactFile(destination, expectedBytes, expectedSha256, `existing staged ${path.basename(destination)}`);
    return existing;
  } catch (error) {
    try {
      await stat(destination);
      throw error;
    } catch (statError) {
      if (statError?.code !== "ENOENT") throw error;
    }
  }
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.phase4r2-stage-tmp-${process.pid}-${randomUUID()}`;
  await copyFile(source, temporary, fsConstants.COPYFILE_EXCL);
  await assertExactFile(temporary, expectedBytes, expectedSha256, "staged temporary copy");
  await rename(temporary, destination);
  return sourceAuthority;
}

async function quarantineStagingOrphans(config) {
  try { await stat(TRACKED_AUTHORITY_ROOT); } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const orphans = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Tracked staging root contains a symlink: ${full}`);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile() && /\.phase4r2-stage-tmp-\d+-[0-9a-f-]{36}$/i.test(entry.name)) {
        orphans.push(full);
      }
    }
  }
  await visit(TRACKED_AUTHORITY_ROOT);
  for (const orphan of orphans) {
    const relative = path.relative(TRACKED_AUTHORITY_ROOT, orphan).split(path.sep).join("__");
    const destination = path.join(
      config.mediaRoot,
      "quarantine",
      "staging-orphans",
      `${relative}-${Date.now()}-${randomUUID()}`,
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(orphan, destination);
  }
  return orphans.map((orphan) => path.relative(TRACKED_AUTHORITY_ROOT, orphan).split(path.sep).join("/"));
}

async function recursiveFiles(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Staged authority contains symlink: ${full}`);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) result.push(path.relative(root, full).split(path.sep).join("/"));
      else throw new Error(`Staged authority contains non-regular entry: ${full}`);
    }
  }
  await visit(root);
  return result.sort();
}

async function stageSelected(config, toolchain) {
  const manifestPayload = await readFile(config.productionManifest);
  const manifest = JSON.parse(manifestPayload.toString("utf8"));
  if (
    manifest.schema !== "quantum-hub.phase-4-r2.production-media-manifest.v1"
    || manifest.sourceBlendSha256 !== SOURCE_SHA256
    || manifest.physicalTimeline?.frames !== FRAME_COUNT
    || manifest.physicalTimeline?.fps !== FPS
    || manifest.physicalTimeline?.durationRational !== "50/3"
    || manifest.authorization?.mergeMain !== false
    || manifest.authorization?.phase5 !== false
    || compactCanonical(manifest.deliveryResolutionDecisions) !== compactCanonical(DELIVERY_DECISIONS)
  ) {
    throw new Error("Production media manifest authority mismatch");
  }
  const videos = manifest.assets.filter((asset) => asset.kind === "video");
  const posters = manifest.assets.filter((asset) => asset.kind === "poster");
  if (videos.length !== 6 || posters.length !== 3 || new Set(manifest.assets.map((asset) => asset.file)).size !== 9) {
    throw new Error("Production manifest must contain exactly six videos and three posters");
  }
  const expectedVideoKeys = Object.keys(FAMILIES).flatMap((family) => ["vp9", "h264"].map((codec) => `${family}:${codec}`)).sort();
  const actualVideoKeys = videos.map((asset) => `${asset.family}:${asset.codec}`).sort();
  const expectedPosterFamilies = Object.keys(FAMILIES).sort();
  const actualPosterFamilies = posters.map((asset) => asset.family).sort();
  if (
    compactCanonical(actualVideoKeys) !== compactCanonical(expectedVideoKeys)
    || compactCanonical(actualPosterFamilies) !== compactCanonical(expectedPosterFamilies)
  ) throw new Error("Production manifest family/codec/poster cartesian authority mismatch");

  // Rebuild every stable frame manifest twice and independently decode/probe
  // all masters while the shared production lock is held. A prior PASS can
  // never authorize staging after any master byte changes.
  const completionAudit = await auditMasters(config, Object.keys(FAMILIES), toolchain);
  if (
    completionAudit.schema !== "quantum-hub.phase-4-r2.frame-completion-audit.v1"
    || completionAudit.sourceBlendSha256 !== SOURCE_SHA256
    || completionAudit.status !== "PASS"
    || !Object.keys(FAMILIES).every((family) => completionAudit.families?.[family]?.status === "PASS")
  ) throw new Error("All three external frame-completion audits must PASS before staging");
  const currentMasters = {};
  const currentDeterminismReports = {};
  for (const family of Object.keys(FAMILIES)) {
    const payload = await readFile(stableManifestPath(config, family));
    const parsed = JSON.parse(payload.toString("utf8"));
    currentMasters[family] = { parsed, sha256: sha256Buffer(payload) };
    await determinismSmoke(config, family, toolchain, currentMasters[family].sha256, false);
    const determinismPath = determinismReportPath(config, family);
    const determinismPayload = await readFile(determinismPath);
    currentDeterminismReports[family] = {
      bytes: determinismPayload.length,
      sha256: sha256Buffer(determinismPayload),
    };
  }
  if (compactCanonical(manifest.codecDeterminismReports) !== compactCanonical(currentDeterminismReports)) {
    throw new Error("Production manifest codec-determinism report authorities changed before staging");
  }
  const masterVerdictPayload = await readFile(config.masterVerdictAuthority);
  const masterVerdictSha256 = sha256Buffer(masterVerdictPayload);
  const masterVerdict = JSON.parse(masterVerdictPayload.toString("utf8"));
  for (const family of Object.keys(FAMILIES)) {
    assertMasterVisualVerdictState(masterVerdict, family, currentMasters[family].sha256);
  }
  const qualityReportPayload = await readFile(config.qualityReport);
  const qualityReportSha256 = sha256Buffer(qualityReportPayload);
  const qualityReport = JSON.parse(qualityReportPayload.toString("utf8"));
  assertQualityReportAuthority(config, qualityReport, toolchain);
  if (
    qualityReport.status !== "SELECTED_VISUAL_PASS"
    || qualityReport.masterVisualVerdictSha256 !== masterVerdictSha256
    || qualityReport.masterVisualVerdictBytes !== masterVerdictPayload.length
    || manifest.masterVisualVerdictSha256 !== masterVerdictSha256
    || manifest.qualityReportSha256 !== qualityReportSha256
  ) {
    throw new Error("Encode quality authority must be a complete selected visual PASS before staging");
  }
  for (const family of Object.keys(FAMILIES)) {
    const familyQuality = qualityReport.families?.[family];
    const selectedQuality = familyQuality?.candidates?.filter((candidate) => candidate.selected === true) ?? [];
    const expectedCandidateIds = ["vp9", "h264"].flatMap((codec) => LADDER[codec].map((level) => `${family}-${codec}-${level.quality}`)).sort();
    const actualCandidateIds = familyQuality?.candidates?.map((candidate) => candidate.id).sort() ?? [];
    if (
      familyQuality?.candidates?.length !== 6
      || compactCanonical(actualCandidateIds) !== compactCanonical(expectedCandidateIds)
      || !familyQuality.candidates.every((candidate) => ["PASS", "SIZE_REJECTED"].includes(candidate.machineStatus))
      || !familyQuality.candidates.every((candidate) => REQUIRED_VISUAL_FIELDS.every(
        (field) => ["PASS", "FAIL"].includes(candidate.visual?.[field]),
      ))
      || selectedQuality.length !== 2
      || !selectedQuality.every((candidate) => visualPass(candidate.visual))
      || !selectedQuality.every((candidate) => candidate.machineStatus === "PASS" && candidate.cloudflareGate === "PASS")
      || compactCanonical(selectedQuality.map((candidate) => candidate.codec).sort()) !== compactCanonical(["h264", "vp9"])
      || familyQuality.masterFrameManifestSha256 !== currentMasters[family].sha256
      || familyQuality.masterVisualVerdictSha256 !== masterVerdictSha256
      || familyQuality.masterVisualVerdictBytes !== masterVerdictPayload.length
      || familyQuality.codecDeterminismReportSha256 !== currentDeterminismReports[family].sha256
      || familyQuality.codecDeterminismReportBytes !== currentDeterminismReports[family].bytes
      || compactCanonical(familyQuality.deliveryDecision) !== compactCanonical(DELIVERY_DECISIONS[family])
    ) throw new Error(`${family} encode-quality cartesian/selection authority failed`);
    for (const candidate of familyQuality.candidates) {
      const level = LADDER[candidate.codec]?.find((entry) => entry.quality === candidate.qualityLevel);
      if (!level) throw new Error(`${candidate.id} has no exact ladder level during staging`);
      assertCandidateRecordAuthority(
        config,
        candidate,
        family,
        candidate.codec,
        level,
        qualityReport.settingsAuthorities[`${candidate.codec}-v1`].sha256,
      );
    }
  }
  const encodeVerdictPayload = await readFile(config.encodeVerdictAuthority);
  const encodeVerdictSha256 = sha256Buffer(encodeVerdictPayload);
  const encodeVerdict = JSON.parse(encodeVerdictPayload.toString("utf8"));
  if (
    encodeVerdict.schema !== "quantum-hub.phase-4-r2.encode-visual-verdict.v1"
    || encodeVerdict.sourceBlendSha256 !== SOURCE_SHA256
    || !/^[0-9a-f]{64}$/.test(qualityReport.selectionInputSha256 ?? "")
    || encodeVerdict.qualityReportSha256 !== qualityReport.selectionInputSha256
    || qualityReport.encodeVisualVerdictSha256 !== encodeVerdictSha256
    || qualityReport.encodeVisualVerdictBytes !== encodeVerdictPayload.length
    || manifest.encodeVisualVerdictSha256 !== encodeVerdictSha256
  ) throw new Error("Preserved encode visual verdict authority is incomplete or mismatched");
  const expectedVerdictCandidates = Object.keys(FAMILIES).flatMap((family) =>
    ["vp9", "h264"].flatMap((codec) => LADDER[codec].map((level) => `${family}-${codec}-${level.quality}`))
  ).sort();
  if (compactCanonical(Object.keys(encodeVerdict.candidates ?? {}).sort()) !== compactCanonical(expectedVerdictCandidates)) {
    throw new Error("Preserved encode visual verdict does not contain the exact 18-candidate ladder");
  }
  for (const family of Object.keys(FAMILIES)) {
    for (const candidate of qualityReport.families[family].candidates) {
      const visual = encodeVerdict.candidates?.[candidate.id];
      if (
        visual?.sha256 !== candidate.sha256
        || visual?.bytes !== candidate.bytes
        || visual?.masterFrameManifestSha256 !== currentMasters[family].sha256
        || visual?.settingsAuthoritySha256 !== candidate.settingsAuthoritySha256
        || visual?.argvSha256 !== candidate.argvSha256
        || compactCanonical(candidate.visual) !== compactCanonical(visual)
        || !REQUIRED_VISUAL_FIELDS.every((field) => ["PASS", "FAIL"].includes(visual?.[field]))
      ) throw new Error(`${candidate.id} no longer matches the preserved visual verdict authority`);
    }
  }
  const selectionPayload = await readFile(config.selection);
  const selectionSha256 = sha256Buffer(selectionPayload);
  const selection = JSON.parse(selectionPayload.toString("utf8"));
  const posterReport = await readJson(config.posterReport, "poster report");
  if (
    selection.schema !== "quantum-hub.phase-4-r2.media-selection.v1"
    || selection.sourceBlendSha256 !== SOURCE_SHA256
    || selection.status !== "PASS"
    || !Array.isArray(selection.assets)
    || selection.assets.length !== 6
    || new Set(selection.assets.map((asset) => asset.candidateId)).size !== 6
    || selection.selectionInputSha256 !== qualityReport.selectionInputSha256
    || selection.qualityReportSha256 !== qualityReportSha256
    || selection.masterVisualVerdictSha256 !== masterVerdictSha256
    || selection.encodeVisualVerdictSha256 !== encodeVerdictSha256
    || compactCanonical(selection.deliveryResolutionDecisions) !== compactCanonical(DELIVERY_DECISIONS)
    || manifest.selectionSha256 !== selectionSha256
    || posterReport.schema !== "quantum-hub.phase-4-r2.poster-validation-report.v1"
    || posterReport.sourceBlendSha256 !== SOURCE_SHA256
    || posterReport.status !== "PASS"
    || compactCanonical(Object.keys(posterReport.families ?? {}).sort()) !== compactCanonical(expectedPosterFamilies)
  ) throw new Error("Selection/poster cross-report authority is incomplete or mismatched");
  const selectedQualityByKey = new Map();
  for (const video of videos) {
    const selected = selection.assets.find((asset) => asset.family === video.family && asset.codec === video.codec);
    const qualityCandidate = qualityReport.families?.[video.family]?.candidates?.find(
      (candidate) => candidate.id === selected?.candidateId && candidate.selected === true,
    );
    const master = currentMasters[video.family];
    const selectedLevel = qualityCandidate
      ? LADDER[video.codec].find((level) => level.quality === qualityCandidate.qualityLevel)
      : null;
    if (
      !selected
      || !qualityCandidate
      || video.file !== `media/${selected.file}`
      || path.basename(video.file) !== selected.file
      || qualityCandidate.file !== selected.file
      || video.bytes !== selected.bytes
      || video.sha256 !== selected.sha256
      || compactCanonical(selected.deliveryDecision) !== compactCanonical(DELIVERY_DECISIONS[video.family])
      || compactCanonical(video.deliveryDecision) !== compactCanonical(DELIVERY_DECISIONS[video.family])
      || compactCanonical(video.deliveryResolution) !== compactCanonical(selected.deliveryDecision.deliveryResolution)
      || compactCanonical(selected.resolution) !== compactCanonical(video.deliveryResolution)
      || compactCanonical(video.resolution) !== compactCanonical(video.deliveryResolution)
      || compactCanonical(qualityCandidate.resolution) !== compactCanonical(video.deliveryResolution)
      || compactCanonical(video.masterResolution) !== compactCanonical(selected.deliveryDecision.masterResolution)
      || video.masterFrameManifestSha256 !== selected.masterFrameManifestSha256
      || video.masterFrameManifestSha256 !== master.sha256
      || video.fps !== FPS
      || video.frames !== FRAME_COUNT
      || Math.abs(video.durationSeconds - FRAME_COUNT / FPS) > 1e-12
      || video.sourceMaster?.family !== video.family
      || compactCanonical(video.sourceMaster?.resolution) !== compactCanonical(video.masterResolution)
      || compactCanonical(video.sourceMaster?.frameRange) !== compactCanonical([1, FRAME_COUNT])
      || video.sourceMaster?.format !== "16-bit RGB PNG sequence"
      || video.sourceMaster?.sequenceSha256 !== master.parsed.master?.sequenceSha256
      || video.sourceMaster?.totalBytes !== master.parsed.master?.totalBytes
      || video.encode?.settingsAuthority !== selected.settingsAuthority
      || video.encode?.argvSha256 !== selected.argvSha256
      || compactCanonical(video.encode?.argv) !== compactCanonical(selected.argv)
      || video.encode?.settingsAuthoritySha256 !== selected.settingsAuthoritySha256
      || compactCanonical(video.encode?.settings) !== compactCanonical(selected.settings)
      || video.encode?.commonSettingsAuthoritySha256 !== selected.commonSettingsAuthoritySha256
      || video.encode?.crf !== selected.crf
      || video.encode?.qualityLevel !== selected.qualityLevel
      || compactCanonical(video.quality) !== compactCanonical(selected.quality)
      || video.selectionReason !== selected.selectionReason
      || qualityCandidate.sha256 !== selected.sha256
      || qualityCandidate.bytes !== selected.bytes
      || qualityReport.families[video.family].selection?.[video.codec] !== selected.candidateId
    ) throw new Error(`Selected video/report/master parity failed: ${video.family} ${video.codec}`);
    if (!selectedLevel) throw new Error(`Selected video has no current ladder authority: ${video.family} ${video.codec}`);
    assertCandidateRecordAuthority(
      config,
      qualityCandidate,
      video.family,
      video.codec,
      selectedLevel,
      qualityReport.settingsAuthorities[`${video.codec}-v1`].sha256,
    );
    selectedQualityByKey.set(`${video.family}:${video.codec}`, qualityCandidate);
  }
  for (const poster of posters) {
    const state = posterReport.families?.[poster.family];
    const master = currentMasters[poster.family];
    const posterMetric = (value, kind) => (
      (value === "inf" && kind === "psnr")
      || (typeof value === "number" && Number.isFinite(value)
        && (kind === "psnr" ? value >= 30 : value >= 0.98 && value <= 1))
    );
    const comparisonKeys = ["masterF1", "decodedVP9F1", "decodedH264F1"];
    const expectedDerivationAuthority = posterDerivationAuthority(poster.family);
    if (
      !state
      || state.status !== "PASS"
      || poster.file !== `posters/${state.file}`
      || path.basename(poster.file) !== state.file
      || poster.bytes !== state.bytes
      || poster.sha256 !== state.sha256
      || poster.masterF1Sha256 !== state.masterF1Sha256
      || poster.masterF1Sha256 !== master.parsed.frames?.[0]?.sha256
      || poster.masterFrameManifestSha256 !== state.masterFrameManifestSha256
      || poster.masterFrameManifestSha256 !== master.sha256
      || poster.derivationAuthoritySha256 !== state.derivationAuthoritySha256
      || sha256Buffer(Buffer.from(compactCanonical(poster.derivationAuthority))) !== poster.derivationAuthoritySha256
      || compactCanonical(poster.derivationAuthority) !== compactCanonical(state.derivationAuthority)
      || compactCanonical(poster.derivationAuthority) !== compactCanonical(expectedDerivationAuthority)
      || !comparisonKeys.every((key) => state.comparisons?.[key]?.status === "PASS"
        && posterMetric(state.comparisons[key].rgbPsnrDb, "psnr")
        && posterMetric(state.comparisons[key].lumaGlobalSsim, "ssim"))
      || compactCanonical(poster.deliveryResolution) !== compactCanonical([FAMILIES[poster.family].width, FAMILIES[poster.family].height])
      || compactCanonical(poster.resolution) !== compactCanonical(poster.deliveryResolution)
      || compactCanonical(poster.masterResolution) !== compactCanonical(poster.deliveryResolution)
      || compactCanonical(poster.deliveryDecision) !== compactCanonical(DELIVERY_DECISIONS[poster.family])
    ) throw new Error(`Selected poster/report/master parity failed: ${poster.family}`);
  }
  const externalLookup = new Map();
  for (const asset of selection.assets) externalLookup.set(`media/${asset.file}`, asset.externalRelativePath);
  for (const state of Object.values(posterReport.families)) externalLookup.set(`posters/${state.file}`, state.externalRelativePath);
  const validatedSources = new Map();
  for (const asset of manifest.assets) {
    if (asset.bytes >= MAX_DEPLOY_BYTES) throw new Error(`${asset.file} violates strict staging <25 MiB gate`);
    const relative = externalLookup.get(asset.file);
    if (!relative) throw new Error(`No external selected authority maps ${asset.file}`);
    const source = resolveUnder(config.mediaRoot, relative, `selected external ${asset.file}`);
    if (asset.kind === "video") {
      if (path.basename(asset.file) !== path.basename(source)) throw new Error(`Selected video destination basename differs from source: ${asset.file}`);
      assertHashNamedAsset(path.basename(source), asset.family, asset.codec, asset.sha256);
      const validation = await validateCandidate(config, asset.family, asset.codec, source);
      if (
        validation.bytes !== asset.bytes
        || validation.sha256 !== asset.sha256
        || compactCanonical(validation.probe.resolution) !== compactCanonical(asset.deliveryResolution)
      ) {
        throw new Error(`Selected video changed before staging: ${asset.file}`);
      }
      const selectedQuality = selectedQualityByKey.get(`${asset.family}:${asset.codec}`);
      const freshMetrics = await measureCandidate(
        config,
        asset.family,
        `stage-${selectedQuality.id}`,
        source,
      );
      if (compactCanonical(freshMetrics) !== compactCanonical(selectedQuality.metrics)) {
        throw new Error(`Selected video metrics do not independently reproduce: ${asset.file}`);
      }
    } else {
      if (path.basename(asset.file) !== path.basename(source)) throw new Error(`Selected poster destination basename differs from source: ${asset.file}`);
      assertHashNamedAsset(path.basename(source), asset.family, null, asset.sha256);
      const posterValidation = await validatePoster(config, asset.family, source);
      if (posterValidation.bytes !== asset.bytes || posterValidation.sha256 !== asset.sha256) {
        throw new Error(`Selected poster changed before staging: ${asset.file}`);
      }
      const selectedVideos = selection.assets.filter((video) => video.family === asset.family);
      const freshComparisons = await measurePosterComparisons(
        config,
        asset.family,
        source,
        selectedVideos,
        `stage-${asset.sha256.slice(0, 12)}`,
      );
      if (compactCanonical(freshComparisons) !== compactCanonical(posterReport.families[asset.family].comparisons)) {
        throw new Error(`Selected poster metrics do not independently reproduce: ${asset.file}`);
      }
    }
    validatedSources.set(asset.file, source);
  }
  const textAuthorities = [
    [config.productionManifest, "manifests/phase-4r2-production-media-manifest.json"],
    [config.selection, "manifests/phase-4r2-media-selection.json"],
    ...Object.keys(FAMILIES).map((family) => [stableManifestPath(config, family), `manifests/phase-4r2-${family}-frame-manifest.json`]),
    [config.auditReport, "reports/phase-4r2-frame-completion-audit.json"],
    [config.qualityReport, "reports/phase-4r2-encode-quality-report.json"],
    [config.posterReport, "reports/phase-4r2-poster-validation-report.json"],
    ...Object.keys(FAMILIES).map((family) => [
      determinismReportPath(config, family),
      `reports/phase-4r2-${family}-codec-determinism.json`,
    ]),
    [config.masterVerdictAuthority, "reports/phase-4r2-master-visual-verdict.json"],
    [config.encodeVerdictAuthority, "reports/phase-4r2-encode-visual-verdict.json"],
  ];
  const textAuthorityRecords = [];
  for (const [source, relative] of textAuthorities) {
    await assertNoPrivateText(source);
    const info = await stat(source);
    const digest = await sha256File(source);
    textAuthorityRecords.push({ source, relative, bytes: info.size, sha256: digest });
  }
  await quarantineStagingOrphans(config);
  const expectedStaged = [
    ...manifest.assets.map((asset) => asset.file),
    ...textAuthorityRecords.map((record) => record.relative),
  ].sort();
  let existingTracked = [];
  try {
    existingTracked = await recursiveFiles(TRACKED_AUTHORITY_ROOT);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const expectedSet = new Set(expectedStaged);
  const unexpectedExisting = existingTracked.filter((relative) => !expectedSet.has(relative));
  if (unexpectedExisting.length > 0) {
    throw new Error(`Tracked Phase 4-R2 authority already contains unexpected payloads: ${unexpectedExisting.join(", ")}`);
  }

  // Every source, report, verdict, manifest and current tracked pathname has
  // now passed before the first tracked write begins.
  for (const asset of manifest.assets) {
    const destination = resolveUnder(TRACKED_AUTHORITY_ROOT, asset.file, `tracked ${asset.file}`);
    await copyExactAtomic(validatedSources.get(asset.file), destination, asset.bytes, asset.sha256);
  }
  for (const record of textAuthorityRecords) {
    await copyExactAtomic(
      record.source,
      path.join(TRACKED_AUTHORITY_ROOT, record.relative.split("/").join(path.sep)),
      record.bytes,
      record.sha256,
    );
  }
  const actual = await recursiveFiles(TRACKED_AUTHORITY_ROOT);
  if (compactCanonical(actual) !== compactCanonical(expectedStaged)) {
    throw new Error("Tracked Phase 4-R2 authority contains an unexpected or missing payload; no files were deleted");
  }
  for (const asset of manifest.assets) {
    await assertExactFile(
      resolveUnder(TRACKED_AUTHORITY_ROOT, asset.file, `final staged ${asset.file}`),
      asset.bytes,
      asset.sha256,
      `final staged ${asset.file}`,
    );
  }
  for (const record of textAuthorityRecords) {
    await assertExactFile(
      resolveUnder(TRACKED_AUTHORITY_ROOT, record.relative, `final staged ${record.relative}`),
      record.bytes,
      record.sha256,
      `final staged ${record.relative}`,
    );
  }
  return { root: TRACKED_AUTHORITY_ROOT, files: actual.length, assets: manifest.assets.length, status: "PASS" };
}

async function printStatus(config) {
  const result = {
    outputRootBasename: path.basename(config.outputRoot),
    ledger: null,
    audit: null,
    quality: null,
    selection: null,
    productionManifest: null,
  };
  for (const [key, file] of [
    ["ledger", config.ledger],
    ["audit", config.auditReport],
    ["quality", config.qualityReport],
    ["selection", config.selection],
    ["productionManifest", config.productionManifest],
  ]) {
    try {
      const payload = await readFile(file);
      const parsed = JSON.parse(payload.toString("utf8"));
      result[key] = { status: parsed.status ?? null, bytes: payload.length, sha256: sha256Buffer(payload) };
    } catch { result[key] = null; }
  }
  console.log(stableJson(result));
}

function help() {
  console.log(`Phase 4-R2 media authority producer

Commands:
  audit-masters --family all|desktop|portrait|landscape
  write-master-verdict-template
  determinism-smoke --family <family>
  encode-ladder --family <family> [--master-verdict <external-json>] [--retry-failed] [--retry-stale]
  write-encode-verdict-template
  select --visual-verdict <external-json>
  posters
  stage-selected
  status

All raw masters, candidates, logs, metrics, decoded checks and verdict inputs
remain below a durable external --output-root. Encoding is blocked until the
master pilot/temporal/sample verdict is PASS; selection is blocked until each
chosen candidate has a complete explicit visual PASS.
`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const config = configuration(options);
  if (command === "help" || command === "--help") return help();
  if (command === "status") {
    assertExternalConfiguration(config);
    return printStatus(config);
  }
  const family = ["determinism-smoke", "encode-ladder"].includes(command)
    ? familyOption(options)
    : command === "audit-masters" ? familyOption(options, true) : null;
  await withMediaLocks(config, command, family, async () => {
    const toolchain = await assertToolchain(config);
    if (command === "audit-masters") {
      const families = family === "all" ? Object.keys(FAMILIES) : [family];
      const report = await auditMasters(config, families, toolchain);
      const template = await writeMasterVerdictTemplate(config);
      console.log(`AUDIT=${config.auditReport}\nSTATUS=${report.status}\nMASTER_VERDICT_TEMPLATE=${template}`);
      return;
    }
    if (command === "write-master-verdict-template") {
      console.log(`MASTER_VERDICT_TEMPLATE=${await writeMasterVerdictTemplate(config)}`);
      return;
    }
    if (command === "determinism-smoke") {
      const ledger = await readJson(config.ledger, "live production render ledger");
      assertLedgerFamily(ledger, family);
      await auditFamily(config, ledger, family);
      const masterFrameManifestSha256 = await sha256File(stableManifestPath(config, family));
      await assertMasterVisualVerdict(config, family, masterFrameManifestSha256);
      const result = await determinismSmoke(
        config,
        family,
        toolchain,
        masterFrameManifestSha256,
        Boolean(options["retry-stale"]),
      );
      console.log(stableJson(result));
      return;
    }
    if (command === "encode-ladder") {
      const report = await encodeLadder(
        config,
        family,
        toolchain,
        Boolean(options["retry-failed"]),
        Boolean(options["retry-stale"]),
      );
      console.log(`QUALITY_REPORT=${config.qualityReport}\nSTATUS=${report.status}`);
      return;
    }
    if (command === "write-encode-verdict-template") {
      console.log(`ENCODE_VERDICT_TEMPLATE=${await writeEncodeVerdictTemplate(config)}`);
      return;
    }
    if (command === "select") {
      const selection = await selectCandidates(config, toolchain);
      console.log(`SELECTION=${config.selection}\nASSETS=${selection.assets.length}`);
      return;
    }
    if (command === "posters") {
      const manifest = await generatePosters(config);
      console.log(`PRODUCTION_MANIFEST=${config.productionManifest}\nASSETS=${manifest.assets.length}`);
      return;
    }
    if (command === "stage-selected") {
      const result = await stageSelected(config, toolchain);
      console.log(stableJson(result));
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  });
}

main().catch((error) => {
  console.error(`PHASE4R2_MEDIA_ERROR=${error?.stack ?? error}`);
  process.exitCode = 1;
});
