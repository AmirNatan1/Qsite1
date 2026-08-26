#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const EXPECTED_SOURCE_SHA256 = "b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0";
const EXPECTED_SOURCE_BYTES = 3_600_194;
const SETTINGS_AUTHORITY = "phase4r2-production-v1";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE = path.join(
  REPO_ROOT,
  "artifacts",
  "original",
  "phase-4r1-1-periphery-current-mobile-crt",
  "source",
  "quantum-signal-television-phase4r1-1-periphery-current-mobile-crt.blend",
);
const WORKER = path.join(REPO_ROOT, "scripts", "phase4r2-render-worker.py");
const LOCAL_APP_DATA = process.env.LOCALAPPDATA;
if (!LOCAL_APP_DATA) throw new Error("LOCALAPPDATA is required");
const BLENDER = path.join(
  LOCAL_APP_DATA,
  "QuantumHubTools",
  "blender-5.2.0",
  "blender-5.2.0-windows-x64",
  "blender.exe",
);
const DEFAULT_OUTPUT_ROOT = path.join(
  LOCAL_APP_DATA,
  "QuantumHubProduction",
  "phase-4r2-production-b0c9c7c1",
);
const DEFAULT_BACKUP = path.join(
  LOCAL_APP_DATA,
  "QuantumHubProduction",
  "phase-4r2-immutable-source-b0c9c7c1",
  "quantum-signal-television-phase4r1-1-periphery-current-mobile-crt.blend",
);
const TRACKED_LEDGER = path.join(
  REPO_ROOT,
  "artifacts",
  "reports",
  "phase-4r2",
  "phase-4r2-production-render-ledger.json",
);
const FAMILY_AUTHORITY = Object.freeze({
  desktop: Object.freeze({
    width: 1920,
    height: 1200,
    camera: "Phase4R1_Camera_Desktop",
    cableCollection: "PHASE4R1V2_CABLE_DESKTOP",
  }),
  portrait: Object.freeze({
    width: 780,
    height: 1688,
    camera: "Phase4R1_Camera_Mobile",
    cableCollection: "PHASE4R1V2_CABLE_MOBILE",
  }),
  landscape: Object.freeze({
    width: 1688,
    height: 780,
    camera: "Phase4R1_Camera_Landscape",
    cableCollection: "PHASE4R1V2_CABLE_LANDSCAPE",
  }),
});
const PILOT_FRAMES = Object.freeze([1, 76, 106, 166, 225, 285, 320, 356, 370, 405, 450, 480, 500]);
const TEMPORAL_RANGES = Object.freeze([
  Object.freeze([150, 180]),
  Object.freeze([360, 390]),
  Object.freeze([450, 480]),
]);
const LOCK_BASENAME = ".phase4r2-production.lock";

function parseArgs(argv) {
  const [command = "status", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) throw new Error("Unexpected argument: " + value);
    const key = value.slice(2);
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

function resolveConfiguration(options) {
  const source = path.resolve(String(options.source ?? process.env.PHASE4R2_SOURCE ?? DEFAULT_SOURCE));
  const outputRoot = path.resolve(
    String(options["output-root"] ?? process.env.PHASE4R2_OUTPUT_ROOT ?? DEFAULT_OUTPUT_ROOT),
  );
  const backup = path.resolve(
    String(options.backup ?? process.env.PHASE4R2_BACKUP ?? DEFAULT_BACKUP),
  );
  const requiredSourceSha = String(
    options["required-source-sha"] ?? process.env.PHASE4R2_REQUIRED_SOURCE_SHA ?? EXPECTED_SOURCE_SHA256,
  ).toLowerCase();
  if (requiredSourceSha !== EXPECTED_SOURCE_SHA256) {
    throw new Error("Required source SHA does not equal the frozen R1.1 authority");
  }
  return {
    source,
    outputRoot,
    backup,
    requiredSourceSha,
    ledger: path.join(outputRoot, "phase-4r2-production-render-ledger.json"),
    lockFile: path.join(outputRoot, LOCK_BASENAME),
  };
}

function pathIsWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertExternalOutputRoot(config) {
  if (pathIsWithin(REPO_ROOT, config.outputRoot)) {
    throw new Error("Raw production output root must remain outside the repository");
  }
  if (pathIsWithin(os.tmpdir(), config.outputRoot)) {
    throw new Error("Raw production output root must be durable and may not be under the temporary directory");
  }
  if (path.parse(config.outputRoot).root === config.outputRoot) {
    throw new Error("Raw production output root may not be a drive root");
  }
  if (pathIsWithin(REPO_ROOT, config.backup) || pathIsWithin(os.tmpdir(), config.backup)) {
    throw new Error("Immutable backup must be external, durable, and outside the temporary directory");
  }
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

async function assertFile(filePath, expectedBytes, expectedSha256, label) {
  const info = await stat(filePath);
  const digest = await sha256File(filePath);
  if (!info.isFile() || info.size !== expectedBytes || digest !== expectedSha256) {
    throw new Error(label + " mismatch: bytes=" + info.size + " sha256=" + digest);
  }
  return { bytes: info.size, sha256: digest };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function renameWithRetry(source, destination) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!new Set(["EPERM", "EACCES", "EBUSY"]).has(error?.code) || attempt === 7) throw error;
      await delay(40 * (attempt + 1));
    }
  }
  throw lastError;
}

async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = filePath + ".tmp-" + process.pid + "-" + randomUUID();
  const payload = JSON.stringify(value, null, 2) + "\n";
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(payload, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await renameWithRetry(temporary, filePath);
  } catch (error) {
    try {
      await unlink(temporary);
    } catch {
      // Preserve the primary error.
    }
    throw error;
  }
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

function queryWindowsProcesses(query, label) {
  if (process.platform !== "win32") {
    throw new Error("Cannot prove " + label + " absent on this operating system");
  }
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", query],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      "Could not inspect " + label + " while proving a production lock stale: "
      + String(result.error?.message ?? result.stderr ?? result.status),
    );
  }
  const output = String(result.stdout ?? "").trim();
  if (!output) return [];
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(label + " inspection returned invalid JSON", { cause: error });
  }
  return Array.isArray(parsed) ? parsed : [parsed];
}

function matchingBlenderProcesses(lockToken, lockFile) {
  const query = [
    "Get-CimInstance Win32_Process -Filter \"Name='blender.exe'\"",
    "| Select-Object ProcessId,CommandLine",
    "| ConvertTo-Json -Compress",
  ].join(" ");
  const records = queryWindowsProcesses(query, "Blender command lines");
  const tokenNeedle = String(lockToken).toLowerCase();
  const pathNeedle = String(lockFile).toLowerCase();
  return records.filter((record) => {
    const commandLine = String(record?.CommandLine ?? "").toLowerCase();
    return commandLine.includes(tokenNeedle) && commandLine.includes(pathNeedle);
  });
}

function runningMediaProcesses() {
  const query = [
    "Get-CimInstance Win32_Process",
    "| Where-Object { $_.Name -in @('ffmpeg.exe','ffprobe.exe') }",
    "| Select-Object ProcessId,Name,CommandLine",
    "| ConvertTo-Json -Compress",
  ].join(" ");
  return queryWindowsProcesses(query, "FFmpeg/FFprobe process state");
}

async function acquireProductionLock(config, command, options) {
  await mkdir(config.outputRoot, { recursive: true });
  const authority = {
    schema: "quantum-hub.phase-4-r2.production-lock.v1",
    token: randomUUID(),
    host: os.hostname(),
    processId: process.pid,
    command,
    family: options.family ?? null,
    frames: options.frames ?? null,
    sourceSha256: EXPECTED_SOURCE_SHA256,
    acquiredAt: new Date().toISOString(),
    childProcessId: null,
    childStartedAt: null,
    blenderProcessId: null,
    blenderStartedAt: null,
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(config.lockFile, "wx");
      try {
        await handle.writeFile(JSON.stringify(authority, null, 2) + "\n", "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return authority;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let existing;
      try {
        existing = JSON.parse(await readFile(config.lockFile, "utf8"));
      } catch (parseError) {
        throw new Error("Production lock exists but is unreadable; refusing unsafe recovery", { cause: parseError });
      }
      if (
        existing?.schema !== "quantum-hub.phase-4-r2.production-lock.v1"
        || typeof existing?.token !== "string"
        || existing?.sourceSha256 !== EXPECTED_SOURCE_SHA256
        || !Number.isInteger(existing?.processId)
        || typeof existing?.host !== "string"
      ) {
        throw new Error("Production lock exists but its authority is invalid; refusing unsafe recovery");
      }
      if (existing.host !== os.hostname()) {
        throw new Error("Production lock belongs to another host and cannot be proven stale");
      }
      const recordedProcessIds = [
        existing.processId,
        existing.childProcessId,
        existing.blenderProcessId,
      ].filter((pid) => Number.isInteger(pid) && pid > 0);
      const liveProcessIds = [...new Set(recordedProcessIds)].filter(processIsAlive);
      if (liveProcessIds.length) {
        throw new Error(
          "Production is already locked by live PID(s) " + liveProcessIds.join(",")
          + " for command " + existing.command,
        );
      }
      const unrecordedChildren = matchingBlenderProcesses(existing.token, config.lockFile);
      if (unrecordedChildren.length) {
        throw new Error(
          "Production lock owner is gone but a matching Blender child is still running: "
          + unrecordedChildren.map((record) => record.ProcessId).join(","),
        );
      }
      const mediaLock = String(existing.command ?? "").startsWith("media:")
        || new Set(["SPAWNING", "RUNNING"]).has(existing.childState);
      if (mediaLock) {
        const firstMediaScan = runningMediaProcesses();
        await delay(2_000);
        const secondMediaScan = runningMediaProcesses();
        const mediaChildren = [...firstMediaScan, ...secondMediaScan];
        if (mediaChildren.length) {
          throw new Error(
            "Media production lock owner is gone but FFmpeg/FFprobe is still running: "
            + [...new Set(mediaChildren.map((record) => record.ProcessId))].join(","),
          );
        }
      }
      const quarantineDirectory = path.join(config.outputRoot, "quarantine", "locks");
      await mkdir(quarantineDirectory, { recursive: true });
      const staleName = [
        "stale",
        String(existing.processId),
        String(existing.token).replaceAll("-", ""),
        new Date().toISOString().replaceAll(":", "").replaceAll(".", ""),
        "json",
      ].join(".");
      await renameWithRetry(config.lockFile, path.join(quarantineDirectory, staleName));
    }
  }
  throw new Error("Could not acquire the exclusive production lock");
}

async function persistChildAuthority(config, authority, childProcessId) {
  if (!Number.isInteger(childProcessId) || childProcessId <= 0) {
    throw new Error("Blender did not expose a valid child process ID");
  }
  const existing = JSON.parse(await readFile(config.lockFile, "utf8"));
  if (existing.token !== authority.token || existing.processId !== process.pid) {
    throw new Error("Exclusive production lock changed before Blender child registration");
  }
  const updated = {
    ...existing,
    childProcessId,
    childStartedAt: new Date().toISOString(),
  };
  await atomicJson(config.lockFile, updated);
  authority.childProcessId = childProcessId;
  authority.childStartedAt = updated.childStartedAt;
}

async function releaseProductionLock(config, authority) {
  let existing;
  try {
    existing = JSON.parse(await readFile(config.lockFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("Exclusive production lock disappeared before release");
    }
    throw error;
  }
  if (existing.token !== authority.token || existing.processId !== process.pid) {
    throw new Error("Exclusive production lock authority changed before release");
  }
  await unlink(config.lockFile);
}

async function withProductionLock(config, command, options, callback) {
  assertExternalOutputRoot(config);
  await assertFile(config.source, EXPECTED_SOURCE_BYTES, EXPECTED_SOURCE_SHA256, "frozen source");
  await assertFile(config.backup, EXPECTED_SOURCE_BYTES, EXPECTED_SOURCE_SHA256, "immutable backup");
  await stat(BLENDER);
  await stat(WORKER);
  const authority = await acquireProductionLock(config, command, options);
  let callbackError;
  try {
    return await callback(authority);
  } catch (error) {
    callbackError = error;
    throw error;
  } finally {
    try {
      await releaseProductionLock(config, authority);
    } catch (releaseError) {
      if (!callbackError) throw releaseError;
      console.error("LOCK_RELEASE_ERROR=" + String(releaseError?.stack ?? releaseError));
    }
  }
}

async function readLedger(config) {
  return JSON.parse(await readFile(config.ledger, "utf8"));
}

function summaryFromLedger(ledger, config) {
  const families = Object.fromEntries(
    Object.entries(ledger.families).map(([family, value]) => [family, {
      camera: value.camera,
      cableCollection: value.cableCollection,
      resolution: value.resolution,
      expectedFrames: value.expectedFrames,
      validFrames: value.validFrames,
      missingFrameCount: value.missingFrames.length,
      missingFrames: value.missingFrames,
      corruptFrameCount: value.corruptFrames.length,
      corruptFrames: value.corruptFrames,
      activeChunk: value.activeChunk,
      completedChunkCount: value.completedChunks.length,
      cumulativeRenderSeconds: value.cumulativeRenderSeconds,
      settingsSha256: value.settingsSha256,
      lastReconciledAt: value.lastReconciledAt ?? null,
    }]),
  );
  return {
    schema: "quantum-hub.phase-4-r2.production-render-ledger-summary.v1",
    generatedAt: new Date().toISOString(),
    status: ledger.status,
    source: ledger.source,
    immutableBackup: ledger.immutableBackup,
    timeline: ledger.timeline,
    authorization: ledger.authorization,
    preflight: ledger.preflight,
    families,
    externalAuthority: {
      rootBasename: path.basename(config.outputRoot),
      ledgerBasename: path.basename(config.ledger),
      durableNonTemporaryRoot: !pathIsWithin(os.tmpdir(), config.outputRoot),
      rawMastersTracked: false,
    },
  };
}

async function syncTrackedLedger(config) {
  const ledger = await readLedger(config);
  const summary = summaryFromLedger(ledger, config);
  await atomicJson(TRACKED_LEDGER, summary);
  console.log("TRACKED_LEDGER=" + TRACKED_LEDGER);
  return summary;
}

function logName(command, options) {
  const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
  const family = options.family ? "-" + options.family : "";
  return stamp + "-" + command + family + "-" + randomUUID().slice(0, 8) + ".log";
}

function workerArgumentValue(workerArgs, key) {
  const index = workerArgs.indexOf(key);
  return index >= 0 ? workerArgs[index + 1] : undefined;
}

function requestedFrames(workerArgs) {
  const raw = workerArgumentValue(workerArgs, "--frames");
  if (!raw) return [];
  return raw.split(",").map(Number);
}

async function waitForStreamOpen(stream) {
  if (stream.fd !== null) return;
  await new Promise((resolve, reject) => {
    stream.once("open", resolve);
    stream.once("error", reject);
  });
}

async function closeWriteStream(stream) {
  await new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(resolve);
  });
}

async function readProcessContext(config, family, logRelative) {
  let ledger;
  try {
    ledger = await readLedger(config);
  } catch {
    return {
      ledgerState: null,
      workerChunk: null,
      blenderVersion: null,
      camera: FAMILY_AUTHORITY[family]?.camera ?? null,
      cableCollection: FAMILY_AUTHORITY[family]?.cableCollection ?? null,
      resolution: FAMILY_AUTHORITY[family]
        ? [FAMILY_AUTHORITY[family].width, FAMILY_AUTHORITY[family].height]
        : null,
      settingsSha256: null,
      settings: null,
    };
  }
  let preflight = null;
  try {
    preflight = JSON.parse(
      await readFile(path.join(config.outputRoot, "reports", "phase-4r2-source-preflight.json"), "utf8"),
    );
  } catch {
    preflight = null;
  }
  if (family && family !== "all" && ledger.families[family]) {
    const state = ledger.families[family];
    const workerChunk = [...state.completedChunks]
      .reverse()
      .find((chunk) => chunk.log === logRelative) ?? null;
    return {
      ledgerState: {
        validFrames: state.validFrames,
        missingFrames: state.missingFrames,
        corruptFrames: state.corruptFrames,
      },
      workerChunk,
      blenderVersion: preflight?.blender?.version ?? null,
      camera: state.camera,
      cableCollection: state.cableCollection,
      resolution: state.resolution,
      settingsSha256: state.settingsSha256,
      settings: preflight?.productionSettings?.[family]?.settings ?? null,
    };
  }
  return {
    ledgerState: Object.fromEntries(
      Object.entries(ledger.families).map(([name, state]) => [name, {
        validFrames: state.validFrames,
        missingFrameCount: state.missingFrames.length,
        corruptFrameCount: state.corruptFrames.length,
      }]),
    ),
    workerChunk: null,
    blenderVersion: preflight?.blender?.version ?? null,
    camera: null,
    cableCollection: null,
    resolution: null,
    settingsSha256: null,
    settings: null,
  };
}

async function bindProcessReceipt(config, family, logRelative, logAuthority, receiptPath) {
  if (!family || family === "all") return;
  const ledger = await readLedger(config);
  const state = ledger.families[family];
  const matches = state.completedChunks.filter((chunk) => chunk.log === logRelative);
  if (matches.length !== 1) {
    throw new Error(
      "Could not uniquely bind process receipt to completed worker chunk for " + logRelative,
    );
  }
  const receiptInfo = await stat(receiptPath);
  const receiptSha256 = await sha256File(receiptPath);
  matches[0].processLog = logAuthority;
  matches[0].processReceipt = {
    relativePath: path.relative(config.outputRoot, receiptPath).split(path.sep).join("/"),
    bytes: receiptInfo.size,
    sha256: receiptSha256,
  };
  ledger.updatedAt = new Date().toISOString();
  await atomicJson(config.ledger, ledger);
}

async function runBlender(config, lockAuthority, workerArgs, command, options) {
  await assertFile(config.source, EXPECTED_SOURCE_BYTES, EXPECTED_SOURCE_SHA256, "frozen source");
  await assertFile(config.backup, EXPECTED_SOURCE_BYTES, EXPECTED_SOURCE_SHA256, "immutable backup");
  const logsDirectory = path.join(config.outputRoot, "logs");
  await mkdir(logsDirectory, { recursive: true });
  const logPath = path.join(logsDirectory, logName(command, options));
  const logRelative = path.relative(config.outputRoot, logPath).split(path.sep).join("/");
  const family = workerArgumentValue(workerArgs, "--family");
  const dimensions = FAMILY_AUTHORITY[family];
  const commonWorkerArgs = [
    "--output-root", config.outputRoot,
    "--backup", config.backup,
    "--required-source-sha", config.requiredSourceSha,
    "--settings-authority", SETTINGS_AUTHORITY,
    "--lock-file", config.lockFile,
    "--lock-token", lockAuthority.token,
    "--log-relative", logRelative,
  ];
  if (dimensions) {
    commonWorkerArgs.push(
      "--expected-width", String(dimensions.width),
      "--expected-height", String(dimensions.height),
    );
  }
  const blenderArgs = [
    "--background",
    config.source,
    "--python",
    WORKER,
    "--",
    ...workerArgs,
    ...commonWorkerArgs,
  ];
  const startedAt = new Date().toISOString();
  const logStream = createWriteStream(logPath, { flags: "wx" });
  await waitForStreamOpen(logStream);
  const header = {
    schema: "quantum-hub.phase-4-r2.production-process-log.v1",
    event: "START",
    startedAt,
    host: os.hostname(),
    processId: process.pid,
    command,
    family: family ?? null,
    requestedFrames: requestedFrames(workerArgs),
    source: config.source,
    sourceSha256: EXPECTED_SOURCE_SHA256,
    backup: config.backup,
    outputRoot: config.outputRoot,
    settingsAuthority: SETTINGS_AUTHORITY,
    lockToken: lockAuthority.token,
    executable: BLENDER,
    argv: blenderArgs,
  };
  logStream.write(JSON.stringify(header) + "\n");
  console.log("OUTPUT_ROOT=" + config.outputRoot);
  console.log("LOG=" + logPath);

  let logError;
  logStream.on("error", (error) => {
    logError = error;
  });
  const child = spawn(BLENDER, blenderArgs, {
    cwd: REPO_ROOT,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const forward = (chunk, target) => {
    target.write(chunk);
    logStream.write(chunk);
  };
  child.stdout.on("data", (chunk) => forward(chunk, process.stdout));
  child.stderr.on("data", (chunk) => forward(chunk, process.stderr));
  let childRegistrationError = null;
  try {
    await persistChildAuthority(config, lockAuthority, child.pid);
  } catch (error) {
    childRegistrationError = error;
    child.kill();
  }
  const result = await new Promise((resolve) => {
    let settled = false;
    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        resolve({ code: null, signal: null, error });
      }
    });
    child.once("close", (code, signal) => {
      if (!settled) {
        settled = true;
        resolve({ code, signal, error: null });
      }
    });
  });
  const completedAt = new Date().toISOString();
  const passed = !childRegistrationError && !result.error && result.code === 0 && !logError;
  const processContext = await readProcessContext(config, family, logRelative);
  const frameRequest = requestedFrames(workerArgs);
  const completedFrameCount = processContext.workerChunk
    ? Number(processContext.workerChunk.renderedFrames ?? 0)
      + Number(processContext.workerChunk.reusedFrames ?? 0)
    : null;
  logStream.write(JSON.stringify({
    schema: "quantum-hub.phase-4-r2.production-process-log.v1",
    event: "END",
    completedAt,
    status: passed ? "PASS" : "FAIL",
    exitCode: result.code,
    signal: result.signal,
    spawnError: result.error ? String(result.error.message ?? result.error) : null,
    childRegistrationError: childRegistrationError
      ? String(childRegistrationError.message ?? childRegistrationError)
      : null,
    logError: logError ? String(logError.message ?? logError) : null,
    childProcessId: child.pid ?? null,
    blenderVersion: processContext.blenderVersion,
    chunkId: processContext.workerChunk?.id ?? null,
    camera: processContext.camera,
    cableCollection: processContext.cableCollection,
    resolution: processContext.resolution,
    settingsSha256: processContext.settingsSha256,
    requestedFrameCount: frameRequest.length,
    completedFrameCount,
    renderedFrameCount: processContext.workerChunk?.renderedFrames ?? null,
    reusedFrameCount: processContext.workerChunk?.reusedFrames ?? null,
  }) + "\n");
  await closeWriteStream(logStream);

  const logInfo = await stat(logPath);
  const logSha256 = await sha256File(logPath);
  await assertFile(config.source, EXPECTED_SOURCE_BYTES, EXPECTED_SOURCE_SHA256, "post-run frozen source");
  await assertFile(config.backup, EXPECTED_SOURCE_BYTES, EXPECTED_SOURCE_SHA256, "post-run immutable backup");
  const receipt = {
    schema: "quantum-hub.phase-4-r2.production-process-receipt.v1",
    command,
    family: family ?? null,
    requestedFrames: frameRequest,
    requestedFrameCount: frameRequest.length,
    completedFrameCount,
    renderedFrameCount: processContext.workerChunk?.renderedFrames ?? null,
    reusedFrameCount: processContext.workerChunk?.reusedFrames ?? null,
    startedAt,
    completedAt,
    status: passed ? "PASS" : "FAIL",
    exitCode: result.code,
    signal: result.signal,
    sourceSha256: EXPECTED_SOURCE_SHA256,
    backupSha256: EXPECTED_SOURCE_SHA256,
    settingsAuthority: SETTINGS_AUTHORITY,
    settingsSha256: processContext.settingsSha256,
    settings: processContext.settings,
    blenderVersion: processContext.blenderVersion,
    chunkId: processContext.workerChunk?.id ?? null,
    camera: processContext.camera,
    cableCollection: processContext.cableCollection,
    resolution: processContext.resolution,
    lockToken: lockAuthority.token,
    childProcessId: child.pid ?? null,
    log: {
      relativePath: logRelative,
      bytes: logInfo.size,
      sha256: logSha256,
    },
    ledgerState: processContext.ledgerState,
  };
  const receiptPath = logPath.slice(0, -4) + ".receipt.json";
  await atomicJson(receiptPath, receipt);
  if (processContext.workerChunk) {
    await bindProcessReceipt(
      config,
      family,
      logRelative,
      { relativePath: logRelative, bytes: logInfo.size, sha256: logSha256 },
      receiptPath,
    );
  }
  if (childRegistrationError) throw childRegistrationError;
  if (result.error) throw result.error;
  if (logError) throw logError;
  if (result.code !== 0) {
    throw new Error(
      "Blender worker failed with exit code " + result.code + (result.signal ? " signal " + result.signal : ""),
    );
  }
  return receipt;
}

function familyOption(options) {
  const family = String(options.family ?? "");
  if (!Object.hasOwn(FAMILY_AUTHORITY, family)) {
    throw new Error("--family must be desktop, portrait, or landscape");
  }
  return family;
}

function framesOption(options) {
  let frames;
  if (options.frames) {
    frames = String(options.frames).split(",").filter(Boolean).map(Number);
  } else if (options.start !== undefined && options.end !== undefined) {
    const start = Number(options.start);
    const end = Number(options.end);
    frames = Number.isInteger(start) && Number.isInteger(end) && start <= end
      ? Array.from({ length: end - start + 1 }, (_unused, index) => start + index)
      : [];
  } else {
    throw new Error("Supply --frames or --start and --end");
  }
  if (
    frames.length === 0
    || frames.some((frame) => !Number.isInteger(frame) || frame < 1 || frame > 500)
  ) {
    throw new Error("Every requested Cycles frame must be an integer within F1-F500");
  }
  return [...new Set(frames)].sort((left, right) => left - right).join(",");
}

function familyIsComplete(state) {
  return (
    state.validFrames === 500
    && state.missingFrames.length === 0
    && state.corruptFrames.length === 0
    && Object.keys(state.frames).length === 500
    && state.activeChunk === null
  );
}

function contiguousFrames(candidates, desiredCount) {
  if (!candidates.length) return [];
  const result = [candidates[0]];
  for (let index = 1; index < candidates.length && result.length < desiredCount; index += 1) {
    if (candidates[index] !== result.at(-1) + 1) break;
    result.push(candidates[index]);
  }
  return result;
}

function nextChunk(ledger, family, targetMinutes, maximumFrames) {
  const state = ledger.families[family];
  if (familyIsComplete(state)) return [];
  const candidates = new Set(state.missingFrames);
  for (const record of state.corruptFrames) candidates.add(Number(record.frame));
  const ordered = [...candidates].filter(Number.isInteger).sort((left, right) => left - right);
  if (!ordered.length) {
    throw new Error("Family is not complete but reconciliation returned no repairable frame");
  }
  const records = Object.values(state.frames).filter((record) => Number(record.renderSeconds) > 0);
  const average = records.length
    ? records.reduce((sum, record) => sum + Number(record.renderSeconds), 0) / records.length
    : family === "desktop" ? 30 : 18;
  const target = Number.isFinite(targetMinutes) && targetMinutes > 0 ? targetMinutes : 60;
  const cap = Number.isInteger(maximumFrames) && maximumFrames > 0 ? maximumFrames : 120;
  const desired = Math.max(1, Math.min(cap, Math.round((target * 60) / average)));
  return contiguousFrames(ordered, desired);
}

async function reconcile(config, lockAuthority, family, command, options) {
  return runBlender(
    config,
    lockAuthority,
    ["--mode", "reconcile", "--family", family],
    command + "-reconcile",
    options,
  );
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const config = resolveConfiguration(options);
  assertExternalOutputRoot(config);

  if (command === "preflight") {
    await withProductionLock(config, command, options, async (lockAuthority) => {
      await runBlender(
        config,
        lockAuthority,
        ["--mode", "preflight", "--family", "all"],
        command,
        options,
      );
      await syncTrackedLedger(config);
    });
    console.log("NEXT_RESUME_COMMAND=node scripts/phase4r2-production.mjs pilot --family desktop");
    return;
  }
  if (command === "pilot") {
    const family = familyOption(options);
    await withProductionLock(config, command, options, async (lockAuthority) => {
      await runBlender(
        config,
        lockAuthority,
        ["--mode", "render", "--family", family, "--phase", "pilot", "--frames", PILOT_FRAMES.join(",")],
        command,
        options,
      );
      await syncTrackedLedger(config);
    });
    console.log("NEXT_RESUME_COMMAND=node scripts/phase4r2-production.mjs temporal --family " + family);
    return;
  }
  if (command === "temporal") {
    const family = familyOption(options);
    const frames = [...new Set(TEMPORAL_RANGES.flatMap(([start, end]) =>
      Array.from({ length: end - start + 1 }, (_unused, index) => start + index),
    ))].sort((left, right) => left - right);
    await withProductionLock(config, command, options, async (lockAuthority) => {
      await runBlender(
        config,
        lockAuthority,
        ["--mode", "render", "--family", family, "--phase", "temporal", "--frames", frames.join(",")],
        command,
        options,
      );
      await syncTrackedLedger(config);
    });
    console.log("NEXT_RESUME_COMMAND=node scripts/phase4r2-production.mjs render-next --family " + family);
    return;
  }
  if (command === "render") {
    const family = familyOption(options);
    const frames = framesOption(options);
    await withProductionLock(config, command, options, async (lockAuthority) => {
      await runBlender(
        config,
        lockAuthority,
        ["--mode", "render", "--family", family, "--phase", "master", "--frames", frames],
        command,
        options,
      );
      await syncTrackedLedger(config);
    });
    console.log("NEXT_RESUME_COMMAND=node scripts/phase4r2-production.mjs render-next --family " + family);
    return;
  }
  if (command === "render-next") {
    const family = familyOption(options);
    await withProductionLock(config, command, options, async (lockAuthority) => {
      await reconcile(config, lockAuthority, family, command, options);
      let ledger = await readLedger(config);
      const frames = nextChunk(
        ledger,
        family,
        Number(options["target-minutes"] ?? 60),
        Number(options["max-frames"] ?? 120),
      );
      if (!frames.length) {
        await syncTrackedLedger(config);
        console.log("FAMILY_COMPLETE=" + family);
        return;
      }
      await runBlender(
        config,
        lockAuthority,
        ["--mode", "render", "--family", family, "--phase", "master", "--frames", frames.join(",")],
        command,
        options,
      );
      ledger = await readLedger(config);
      if (familyIsComplete(ledger.families[family])) {
        console.log("FAMILY_COMPLETE=" + family);
      }
      const summary = await syncTrackedLedger(config);
      console.log("VALID_FRAMES=" + summary.families[family].validFrames + "/500");
    });
    console.log("NEXT_RESUME_COMMAND=node scripts/phase4r2-production.mjs render-next --family " + family);
    return;
  }
  if (command === "sync-ledger") {
    await withProductionLock(config, command, options, async (lockAuthority) => {
      await reconcile(config, lockAuthority, "all", command, options);
      await syncTrackedLedger(config);
    });
    return;
  }
  if (command === "status") {
    await withProductionLock(config, command, options, async (lockAuthority) => {
      await reconcile(config, lockAuthority, "all", command, options);
      const ledger = await readLedger(config);
      const summary = summaryFromLedger(ledger, config);
      await atomicJson(TRACKED_LEDGER, summary);
      console.log(JSON.stringify(summary, null, 2));
      for (const family of Object.keys(FAMILY_AUTHORITY)) {
        const next = nextChunk(ledger, family, 60, 120);
        console.log(
          "RESUME_" + family.toUpperCase() + "="
          + (next.length
            ? "node scripts/phase4r2-production.mjs render-next --family " + family
            : "COMPLETE"),
        );
      }
    });
    return;
  }
  throw new Error("Unknown command: " + command);
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
