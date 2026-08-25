#!/usr/bin/env node

/**
 * Compose the compact Phase 4-R1.1 Checkpoint 2 cable review sheets.
 *
 * This producer only reads the exact accepted R1 desktop-frame authority and
 * one explicitly byte-bound PASS cable diagnostic. It never invokes Blender,
 * copies a raw sequence, changes a .blend, starts a complete 540-frame Cycles
 * film, integrates runtime media, accepts a human gate, or authorizes Phase 5.
 */

import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SOURCE_DIR = path.dirname(SCRIPT_FILE);
const REPO_ROOT = path.resolve(SOURCE_DIR, "../../../..");

const SCHEMA = "quantum-hub.phase-4-r1-1.checkpoint-2-cable-comparisons.v1";
const REPORT_SCHEMA = "quantum-hub.phase-4-r1-1.cable-material-diagnostic.v1";
const BUILD_SCHEMA = "quantum-hub.phase-4-r1-1.targeted-repair.source-build.v1";
const ACCEPTED_MANIFEST_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.desktop-physical-frames.v2";
const EXPECTED_SHARP = "0.35.3";
const REPORT_NAME = "phase4r1-1-cable-diagnostic.json";
const MANIFEST_NAME = "checkpoint2-cable-comparison-manifest.json";
const WIDTH = 1440;
const HEIGHT = 900;
const FULL_WIDTH = 670;
const FULL_HEIGHT = 419;
const CROP_WIDTH = 670;
const CROP_HEIGHT = 268;
const SOURCE_CROP_WIDTH = 760;
const SOURCE_CROP_HEIGHT = 304;

const PNG_OPTIONS = Object.freeze({
  compressionLevel: 9,
  adaptiveFiltering: false,
  palette: false,
  force: true,
});

const ACCEPTED_ROOT_ID = "qsite-phase4r1-preview-a0a122ba-desktop-20260825";
const ACCEPTED_MANIFEST_NAME = "phase4r1-refined-desktop-physical-frame-manifest.json";
const ACCEPTED_MANIFEST_RECORD = Object.freeze({
  bytes: 180147,
  sha256: "f523815bbc99f2fc4196c399ac59356e9e49922feb09cc5341515daaf718eb38",
});
const ACCEPTED_SOURCE = Object.freeze({
  path: "artifacts/original/phase-4r1-refined-proving-hall/source/quantum-signal-television-phase4r1-refined-proving-hall.blend",
  bytes: 3526219,
  sha256: "a0a122baaf021833e9cad6194a474ef714b182be2c8e7171e00ad69c00565215",
});
const R11_SOURCE_PATH = "artifacts/original/phase-4r1-1-periphery-current-mobile-crt/source/quantum-signal-television-phase4r1-1-periphery-current-mobile-crt.blend";
const R11_BUILD_PATH = "artifacts/original/phase-4r1-1-periphery-current-mobile-crt/source/phase4r1-1-source-build.json";

const MILESTONES = Object.freeze([
  Object.freeze({ frame: 47, key: "first", label: "FIRST VISIBLE", filename: "checkpoint2-cable-F047-first.png", accepted: Object.freeze({ bytes: 926925, sha256: "cf61da0f141c1271816ef6861d716ac95cecfb8fd309276d18f69f2514d52421" }) }),
  Object.freeze({ frame: 106, key: "25pct", label: "25% TRAVEL", filename: "checkpoint2-cable-F106-25pct.png", accepted: Object.freeze({ bytes: 955553, sha256: "71d8c3e666e9aec74620783d4be37d78e00555c331d5ebd690d9f839b981758b" }) }),
  Object.freeze({ frame: 166, key: "50pct", label: "50% TRAVEL", filename: "checkpoint2-cable-F166-50pct.png", accepted: Object.freeze({ bytes: 759751, sha256: "91e097e98d4a45d626b05357773c1cd5d7ed97da2483d3a2c38d211ef85b3a53" }) }),
  Object.freeze({ frame: 225, key: "75pct", label: "75% TRAVEL", filename: "checkpoint2-cable-F225-75pct.png", accepted: Object.freeze({ bytes: 916195, sha256: "144e47b4a203f633f95012438c5b23f5c669b8b59b3d9ebd9ccc95dceeae7f46" }) }),
  Object.freeze({ frame: 261, key: "90pct", label: "90% TRAVEL", filename: "checkpoint2-cable-F261-90pct.png", accepted: Object.freeze({ bytes: 1031906, sha256: "21390cc17288cbede8731a924692ef3e657856ef963904de4939cc63a6fe0a8f" }) }),
  Object.freeze({ frame: 285, key: "arrival", label: "ARRIVAL", filename: "checkpoint2-cable-F285-arrival.png", accepted: Object.freeze({ bytes: 977770, sha256: "c284c721bf6e0cafbafc0bc0077436ce535a02eceb2bf57bf39a61fdcc8cb4d3" }) }),
]);

const FULL_DIAGNOSTIC_FRAMES = Object.freeze([1, 46, 47, 70, 106, 166, 225, 261, 285]);
const MACRO_SPECS = Object.freeze([
  Object.freeze({
    path: "macro/trail-F166.png",
    role: "cable-material-macro-trail-F166",
    frame: 166,
    heading: "AUTHORED TRAIL · F166",
    detail: "SCENE-AUTHORED OUTPUT · ACTIVE BLOOM CONTROLS: 0",
    bloomState: "authored",
  }),
  Object.freeze({
    path: "macro/front-F261.png",
    role: "cable-material-macro-front-F261",
    frame: 261,
    heading: "AUTHORED FRONT · F261",
    detail: "SCENE-AUTHORED OUTPUT · ACTIVE BLOOM CONTROLS: 0",
    bloomState: "authored",
  }),
  Object.freeze({
    path: "macro/front-F261-bloom-disabled.png",
    role: "cable-material-macro-front-F261-bloom-disabled",
    frame: 261,
    heading: "BLOOM-DISABLED PROOF · F261",
    detail: "ENGINE-NATIVE NO-BLOOM-CONTROL · ACTIVE CONTROLS: 0",
    bloomState: "engine-native-no-bloom-control",
  }),
]);

const AUTHORIZATION = Object.freeze({
  complete540FrameCyclesFilmStarted: false,
  complete540FrameCyclesFilmResumed: false,
  finalRefinedMediaIntegrationStarted: false,
  phase5Authorized: false,
  generativeVideoAuthorized: false,
});

const CLASSIFICATION = "PHASE 4-R1.1 CHECKPOINT 2 · MACHINE PASS · HUMAN REVIEW PENDING · COMPLETE 540-FRAME CYCLES FILM NOT AUTHORIZED · RUNTIME INTEGRATION NOT AUTHORIZED · PHASE 5 NOT AUTHORIZED";

sharp.cache(false);
sharp.concurrency(1);
sharp.simd(false);

function fail(message) {
  throw new Error(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRelativePath(value, label) {
  check(typeof value === "string" && value.length > 0, `${label} must be a non-empty string`);
  check(!value.includes("\0") && !path.isAbsolute(value) && !/^[a-z]:/i.test(value) && !/^[/\\]{2}/.test(value), `${label} must be relative`);
  const normalized = value.replaceAll("\\", "/");
  check(normalized === path.posix.normalize(normalized) && normalized !== "." && !normalized.startsWith("../") && !normalized.startsWith("./") && !normalized.endsWith("/"), `${label} must be canonical POSIX relative`);
  return normalized;
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "--self-test") return { selfTest: true };
  const allowed = new Set([
    "--accepted-r1-root",
    "--diagnostic-root",
    "--diagnostic-report-bytes",
    "--diagnostic-report-sha256",
    "--output-root",
  ]);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    check(allowed.has(flag), `unknown argument: ${flag ?? "<missing>"}`);
    check(value !== undefined && !value.startsWith("--"), `missing value for ${flag}`);
    check(parsed[flag] === undefined, `duplicate argument: ${flag}`);
    parsed[flag] = value;
  }
  for (const flag of allowed) check(parsed[flag] !== undefined, `required argument is missing: ${flag}`);
  const reportBytes = Number(parsed["--diagnostic-report-bytes"]);
  check(Number.isSafeInteger(reportBytes) && reportBytes > 0, "--diagnostic-report-bytes must be a positive safe integer");
  const reportSha256 = parsed["--diagnostic-report-sha256"];
  check(validHash(reportSha256), "--diagnostic-report-sha256 must be an exact lowercase SHA-256");
  return {
    selfTest: false,
    acceptedRoot: parsed["--accepted-r1-root"],
    diagnosticRoot: parsed["--diagnostic-root"],
    reportBytes,
    reportSha256,
    outputRoot: parsed["--output-root"],
  };
}

async function exists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function exactDirectory(candidate, label) {
  const resolved = await realpath(path.resolve(candidate)).catch(() => fail(`${label} does not exist`));
  check((await stat(resolved)).isDirectory(), `${label} is not a directory`);
  return resolved;
}

async function containedFile(root, relative, label) {
  const safe = safeRelativePath(relative, `${label}.path`);
  const candidate = path.join(root, ...safe.split("/"));
  const resolved = await realpath(candidate).catch(() => fail(`${label} does not exist`));
  check(isWithin(root, resolved), `${label} escapes its input root`);
  const details = await stat(resolved);
  check(details.isFile(), `${label} is not a file`);
  return resolved;
}

async function recordFile(filename) {
  const bytes = await readFile(filename);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

async function readObjectJson(filename, label) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  check(parsed && typeof parsed === "object" && !Array.isArray(parsed), `${label} must contain one object`);
  return parsed;
}

function exactRecord(actual, expected, label) {
  check(actual && typeof actual === "object", `${label} is missing`);
  for (const [key, value] of Object.entries(expected)) check(actual[key] === value, `${label}.${key} differs`);
}

function exactAuthorization(actual, label) {
  check(actual && typeof actual === "object" && !Array.isArray(actual), `${label} is missing`);
  check(JSON.stringify(Object.keys(actual).sort()) === JSON.stringify(Object.keys(AUTHORIZATION).sort()), `${label} fields differ`);
  for (const [key, value] of Object.entries(AUTHORIZATION)) check(actual[key] === value, `${label}.${key} differs`);
}

async function pngAuthority(filename, record, width, height, label) {
  exactRecord(await recordFile(filename), { bytes: record.bytes, sha256: record.sha256 }, label);
  const metadata = await sharp(filename, { failOn: "error", limitInputPixels: false }).metadata();
  check(metadata.format === "png" && metadata.width === width && metadata.height === height, `${label} PNG dimensions/format differ`);
}

async function verifyAcceptedR1(rootArgument) {
  const root = await exactDirectory(rootArgument, "accepted R1 root");
  check(path.basename(root) === ACCEPTED_ROOT_ID, "accepted R1 root identity differs");
  check(!isWithin(REPO_ROOT, root), "accepted R1 raw root must remain external");
  const manifestFile = await containedFile(root, ACCEPTED_MANIFEST_NAME, "accepted R1 manifest");
  exactRecord(await recordFile(manifestFile), ACCEPTED_MANIFEST_RECORD, "accepted R1 manifest byte authority");
  const manifest = await readObjectJson(manifestFile, "accepted R1 manifest");
  check(manifest.schema === ACCEPTED_MANIFEST_SCHEMA && manifest.status === "PASS" && manifest.family === "desktop", "accepted R1 manifest identity/status differs");
  check(manifest.expectedFrameCount === 500 && manifest.renderedFrameCount === 500, "accepted R1 manifest is not the exhaustive 500-frame desktop authority");
  exactRecord(manifest.sourceAuthorities?.derivative, ACCEPTED_SOURCE, "accepted R1 derivative binding");
  const acceptedSourceFile = await containedFile(REPO_ROOT, ACCEPTED_SOURCE.path, "accepted R1 derivative source");
  exactRecord(await recordFile(acceptedSourceFile), { bytes: ACCEPTED_SOURCE.bytes, sha256: ACCEPTED_SOURCE.sha256 }, "accepted R1 derivative source bytes");
  check(manifest.renderSettings?.engine === "BLENDER_EEVEE" && manifest.renderSettings?.exposureStops === 1.0, "accepted R1 native render settings differ");
  check(manifest.authorization?.humanAccepted === false && manifest.authorization?.full540FrameCyclesProductionFilmStarted === false && manifest.authorization?.full540FrameCyclesProductionFilmResumed === false && manifest.authorization?.refinedPhysicalMediaRuntimeIntegrationStarted === false && manifest.authorization?.phase5Authorized === false, "accepted R1 authorization boundary differs");
  check(Array.isArray(manifest.files) && manifest.files.length === 500, "accepted R1 file ledger is not exhaustive");
  const frameMap = new Map();
  for (const record of manifest.files) {
    check(Number.isInteger(record.frame) && record.frame >= 1 && record.frame <= 500 && !frameMap.has(record.frame), "accepted R1 frame ledger has an invalid or duplicate frame");
    frameMap.set(record.frame, record);
  }
  check(Array.from({ length: 500 }, (_, index) => index + 1).every((frame) => frameMap.has(frame)), "accepted R1 frame ledger is not contiguous F001-F500");
  const selected = new Map();
  for (const milestone of MILESTONES) {
    const relative = `F${String(milestone.frame).padStart(3, "0")}.png`;
    const record = frameMap.get(milestone.frame);
    exactRecord(record, {
      role: "physical-frame",
      path: relative,
      mediaType: "image/png",
      family: "desktop",
      frame: milestone.frame,
      width: WIDTH,
      height: HEIGHT,
      ...milestone.accepted,
    }, `accepted R1 F${milestone.frame}`);
    const filename = await containedFile(root, relative, `accepted R1 F${milestone.frame}`);
    await pngAuthority(filename, record, WIDTH, HEIGHT, `accepted R1 F${milestone.frame}`);
    selected.set(milestone.frame, { filename, record });
  }
  return { root, manifest, selected };
}

async function walkPngs(root, prefix = "") {
  const directory = path.join(root, ...prefix.split("/").filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail(`diagnostic root contains a symbolic link: ${relative}`);
    if (entry.isDirectory()) results.push(...await walkPngs(root, relative));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) results.push(relative);
  }
  return results.sort();
}

async function verifyDiagnostic(rootArgument, reportBytes, reportSha256) {
  const root = await exactDirectory(rootArgument, "R1.1 diagnostic root");
  check(!isWithin(REPO_ROOT, root), "R1.1 diagnostic root must remain external");
  check(!(await exists(path.join(root, "phase4r1-1-cable-diagnostic-failure.json"))), "R1.1 diagnostic root contains a failure report");
  const reportFile = await containedFile(root, REPORT_NAME, "R1.1 diagnostic report");
  exactRecord(await recordFile(reportFile), { bytes: reportBytes, sha256: reportSha256 }, "R1.1 diagnostic report explicit byte authority");
  const report = await readObjectJson(reportFile, "R1.1 diagnostic report");
  check(report.schema === REPORT_SCHEMA && report.status === "PASS" && report.throughStage === "cable", "R1.1 diagnostic schema/status/stage differs");
  exactRecord(report.source, { path: R11_SOURCE_PATH }, "R1.1 derivative path binding");
  exactRecord(report.sourceBuild, { path: R11_BUILD_PATH }, "R1.1 source-build path binding");
  const derivativeFile = await containedFile(REPO_ROOT, R11_SOURCE_PATH, "R1.1 derivative");
  exactRecord(await recordFile(derivativeFile), { bytes: report.source.bytes, sha256: report.source.sha256 }, "R1.1 derivative byte binding");
  const buildFile = await containedFile(REPO_ROOT, R11_BUILD_PATH, "R1.1 source-build");
  exactRecord(await recordFile(buildFile), { bytes: report.sourceBuild.bytes, sha256: report.sourceBuild.sha256 }, "R1.1 source-build byte binding");
  const build = await readObjectJson(buildFile, "R1.1 source-build");
  check(build.schema === BUILD_SCHEMA && build.status === "PASS" && build.throughStage === "cable", "R1.1 source-build schema/status/stage differs");
  exactRecord(build.derivative, report.source, "R1.1 source-build derivative binding");
  exactRecord(build.acceptedR1Source, ACCEPTED_SOURCE, "R1.1 source-build accepted R1 binding");
  exactAuthorization(build.authorization, "R1.1 source-build authorization");
  exactAuthorization(report.authorization, "R1.1 diagnostic authorization");
  const embeddedAccepted = report.acceptedR1ComparisonAuthority;
  check(embeddedAccepted?.authorityId === ACCEPTED_ROOT_ID && embeddedAccepted?.absolutePathStored === false && embeddedAccepted?.rawFramesCopiedIntoDiagnostic === false, "R1.1 report embeds the wrong accepted R1 comparison identity");
  exactRecord(embeddedAccepted.manifest, { filename: ACCEPTED_MANIFEST_NAME, ...ACCEPTED_MANIFEST_RECORD }, "R1.1 report accepted R1 manifest binding");
  exactRecord(embeddedAccepted.sourceDerivative, { bytes: ACCEPTED_SOURCE.bytes, sha256: ACCEPTED_SOURCE.sha256 }, "R1.1 report accepted R1 derivative binding");
  const embeddedFrames = new Map((embeddedAccepted.selectedFrames ?? []).map((record) => [record.frame, record]));
  for (const milestone of MILESTONES) exactRecord(embeddedFrames.get(milestone.frame), { frame: milestone.frame, path: `F${String(milestone.frame).padStart(3, "0")}.png`, width: WIDTH, height: HEIGHT, ...milestone.accepted }, `R1.1 report accepted R1 F${milestone.frame} binding`);
  check(report.producerAuthorities && typeof report.producerAuthorities === "object", "R1.1 diagnostic producer authorities are missing");
  for (const [key, authority] of Object.entries(report.producerAuthorities)) {
    check(authority && typeof authority.path === "string" && Number.isSafeInteger(authority.bytes) && validHash(authority.sha256), `R1.1 diagnostic producer authority differs: ${key}`);
    const producerFile = await containedFile(REPO_ROOT, authority.path, `R1.1 diagnostic producer ${key}`);
    exactRecord(await recordFile(producerFile), { bytes: authority.bytes, sha256: authority.sha256 }, `R1.1 diagnostic producer ${key} bytes`);
  }
  check(report.humanAccepted === false && Object.values(report.humanReviewGates ?? {}).length === 6 && Object.values(report.humanReviewGates).every((value) => value === null), "R1.1 human review gates are not all pending");
  check(report.pixelGates?.allHardMachineGatesPass === true && report.pixelGates?.nativePhysicalCharacterArbitrationStillRequired === true, "R1.1 cable hard-gate/human-arbitration boundary differs");
  check(report.restoration?.passes === true && report.pngLedgerExhaustive === true && report.renderOperationSavedBlend === false && report.externalOutputAbsolutePathStored === false, "R1.1 diagnostic restoration/ledger/privacy boundary differs");
  check(report.reusedAcceptedR1ComparisonEvidence === true && report.reusedRecoveredOldVisualEvidence === false, "R1.1 comparison provenance differs");
  check(report.renderSettings?.engine === "BLENDER_EEVEE" && JSON.stringify(report.renderSettings?.fullResolution) === "[1440,900]" && report.renderSettings?.exposureStops === 1.0 && report.renderSettings?.analysisMasksAreNotAestheticEvidence === true, "R1.1 native render settings differ");
  check(report.boundedNextRenderRecommendation?.authorizedNow === false && report.boundedNextRenderRecommendation?.complete540FrameFilmIncluded === false, "R1.1 bounded-render boundary differs");
  const bloom = report.bloomDisabledProof;
  check(bloom?.mode === "engine-native-no-bloom-control" && bloom?.inventedEffect === false && bloom?.before?.activeControlCount === 0 && bloom?.afterDisable?.activeControlCount === 0, "R1.1 report does not prove the exact no-active-bloom-control state");
  check(Array.isArray(report.files) && report.files.length > 0, "R1.1 diagnostic file ledger is missing");
  const byPath = new Map();
  const roles = new Set();
  for (const record of report.files) {
    const relative = safeRelativePath(record.path, "R1.1 diagnostic file record");
    check(!byPath.has(relative) && typeof record.role === "string" && !roles.has(record.role), "R1.1 diagnostic ledger repeats a path or role");
    check(record.mediaType === "image/png" && record.family === "desktop" && validHash(record.sha256) && Number.isSafeInteger(record.bytes) && record.bytes > 0, `R1.1 diagnostic ledger record differs: ${relative}`);
    const filename = await containedFile(root, relative, `R1.1 diagnostic ${relative}`);
    await pngAuthority(filename, record, record.width, record.height, `R1.1 diagnostic ${relative}`);
    byPath.set(relative, { filename, record });
    roles.add(record.role);
  }
  check(JSON.stringify(await walkPngs(root)) === JSON.stringify([...byPath.keys()].sort()), "R1.1 diagnostic PNG inventory differs from its exhaustive ledger");
  const fullRecords = report.files.filter((record) => record.role.startsWith("cable-full-desktop-F"));
  check(JSON.stringify(fullRecords.map((record) => record.frame).sort((a, b) => a - b)) === JSON.stringify(FULL_DIAGNOSTIC_FRAMES), "R1.1 diagnostic full-frame inventory differs");
  const selected = new Map();
  for (const milestone of MILESTONES) {
    const relative = `full/desktop/F${String(milestone.frame).padStart(3, "0")}.png`;
    const authority = byPath.get(relative);
    check(authority, `R1.1 diagnostic lacks F${milestone.frame}`);
    exactRecord(authority.record, {
      role: `cable-full-desktop-F${String(milestone.frame).padStart(3, "0")}`,
      family: "desktop",
      frame: milestone.frame,
      width: WIDTH,
      height: HEIGHT,
      renderEngine: "BLENDER_EEVEE",
      bloomState: "authored",
      analysisOnly: false,
      sourceSha256: report.source.sha256,
    }, `R1.1 diagnostic F${milestone.frame}`);
    selected.set(milestone.frame, authority);
  }
  const macros = [];
  for (const spec of MACRO_SPECS) {
    const authority = byPath.get(spec.path);
    check(authority, `R1.1 diagnostic lacks ${spec.path}`);
    exactRecord(authority.record, {
      role: spec.role,
      frame: spec.frame,
      width: 960,
      height: 600,
      renderEngine: "BLENDER_EEVEE",
      bloomState: spec.bloomState,
      analysisOnly: false,
      sourceSha256: report.source.sha256,
    }, `R1.1 diagnostic ${spec.path}`);
    macros.push({ ...spec, ...authority });
  }
  return { root, report, reportRecord: { bytes: reportBytes, sha256: reportSha256 }, selected, macros };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function candidateScore(left, right) {
  const dr = Math.abs(left[0] - right[0]);
  const dg = Math.abs(left[1] - right[1]);
  const db = Math.abs(left[2] - right[2]);
  const delta = dr + dg + db;
  if (delta < 24) return 0;
  const leftMagenta = Math.max(left[0], left[2]) - left[1];
  const rightMagenta = Math.max(right[0], right[2]) - right[1];
  const chroma = Math.max(0, leftMagenta, rightMagenta);
  if (chroma < 8 && delta < 120) return 0;
  return delta * (64 + Math.min(192, chroma));
}

async function decodedRgb(filename, width = WIDTH, height = HEIGHT) {
  const { data, info } = await sharp(filename, { failOn: "error", limitInputPixels: false })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  check(info.width === width && info.height === height && info.channels === 3, "decoded comparison input differs from exact RGB dimensions");
  return data;
}

function chooseCableCrop(left, right, width = WIDTH, height = HEIGHT) {
  check(left.length === right.length && left.length === width * height * 3, "crop analyzer input dimensions differ");
  const tileWidth = 48;
  const tileHeight = 36;
  const columns = Math.ceil(width / tileWidth);
  const rows = Math.ceil(height / tileHeight);
  const tiles = new Float64Array(columns * rows);
  let candidateCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const score = candidateScore(
        [left[offset], left[offset + 1], left[offset + 2]],
        [right[offset], right[offset + 1], right[offset + 2]],
      );
      if (score === 0) continue;
      candidateCount += 1;
      tiles[Math.floor(y / tileHeight) * columns + Math.floor(x / tileWidth)] += score;
    }
  }
  check(candidateCount >= 8, "milestone pair has no decisive cable-material difference candidates");
  let bestIndex = 0;
  for (let index = 1; index < tiles.length; index += 1) if (tiles[index] > tiles[bestIndex]) bestIndex = index;
  check(tiles[bestIndex] > 0, "milestone pair has no positive cable-material salience");
  const seedX = (bestIndex % columns) * tileWidth + tileWidth / 2;
  const seedY = Math.floor(bestIndex / columns) * tileHeight + tileHeight / 2;
  let weightedX = 0;
  let weightedY = 0;
  let weight = 0;
  const radiusX = SOURCE_CROP_WIDTH * 0.72;
  const radiusY = SOURCE_CROP_HEIGHT * 0.90;
  for (let y = 0; y < height; y += 1) {
    if (Math.abs(y - seedY) > radiusY) continue;
    for (let x = 0; x < width; x += 1) {
      if (Math.abs(x - seedX) > radiusX) continue;
      const offset = (y * width + x) * 3;
      const score = candidateScore(
        [left[offset], left[offset + 1], left[offset + 2]],
        [right[offset], right[offset + 1], right[offset + 2]],
      );
      if (score === 0) continue;
      weightedX += x * score;
      weightedY += y * score;
      weight += score;
    }
  }
  check(weight > 0, "milestone cable crop has no local salience weight");
  const centerX = Math.round(weightedX / weight);
  const centerY = Math.round(weightedY / weight);
  return {
    left: clamp(centerX - Math.floor(SOURCE_CROP_WIDTH / 2), 0, width - SOURCE_CROP_WIDTH),
    top: clamp(centerY - Math.floor(SOURCE_CROP_HEIGHT / 2), 0, height - SOURCE_CROP_HEIGHT),
    width: SOURCE_CROP_WIDTH,
    height: SOURCE_CROP_HEIGHT,
    candidateCount,
    anchor: [centerX, centerY],
    method: "pair-difference magenta-weighted fixed-window cable salience; identical native-source crop for R1 and R1.1",
  };
}

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function milestoneOverlay(milestone, crop) {
  const leftFull = { x: 40, y: 100 };
  const rightFull = { x: 730, y: 100 };
  const leftCrop = { x: 40, y: 568 };
  const rightCrop = { x: 730, y: 568 };
  const cropLeft = crop.left * FULL_WIDTH / WIDTH;
  const cropTop = crop.top * FULL_HEIGHT / HEIGHT;
  const cropWidth = crop.width * FULL_WIDTH / WIDTH;
  const cropHeight = crop.height * FULL_HEIGHT / HEIGHT;
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <style>
        text { font-family: "Segoe UI", Arial, sans-serif; letter-spacing: 1px; }
        .title { fill: #f3f0ea; font-size: 27px; font-weight: 700; }
        .small { fill: #aeb7bc; font-size: 15px; font-weight: 600; }
        .r1 { fill: #e9c777; font-size: 18px; font-weight: 700; }
        .r11 { fill: #f09acb; font-size: 18px; font-weight: 700; }
        .footer { fill: #849097; font-size: 14px; font-weight: 500; }
      </style>
      <text class="title" x="40" y="42">CHECKPOINT 2 · PHYSICAL CURRENT · F${String(milestone.frame).padStart(3, "0")} · ${xml(milestone.label)}</text>
      <text class="small" x="40" y="68">NATIVE RENDER EXPOSURE · AGX · NO GRADE OR BRIGHTENING · R1.1 HUMAN REVIEW PENDING</text>
      <text class="r1" x="40" y="92">ACCEPTED R1 · FULL COMPOSITION</text>
      <text class="r11" x="730" y="92">R1.1 MACHINE PASS · FULL COMPOSITION</text>
      <rect x="${leftFull.x}" y="${leftFull.y}" width="${FULL_WIDTH}" height="${FULL_HEIGHT}" fill="none" stroke="#66583a" stroke-width="2"/>
      <rect x="${rightFull.x}" y="${rightFull.y}" width="${FULL_WIDTH}" height="${FULL_HEIGHT}" fill="none" stroke="#6f3d5d" stroke-width="2"/>
      <rect x="${leftFull.x + cropLeft}" y="${leftFull.y + cropTop}" width="${cropWidth}" height="${cropHeight}" fill="none" stroke="#f1cf77" stroke-width="3"/>
      <rect x="${rightFull.x + cropLeft}" y="${rightFull.y + cropTop}" width="${cropWidth}" height="${cropHeight}" fill="none" stroke="#ff89c8" stroke-width="3"/>
      <text class="r1" x="40" y="557">R1 · IDENTICAL CABLE CLOSE CROP</text>
      <text class="r11" x="730" y="557">R1.1 · IDENTICAL CABLE CLOSE CROP</text>
      <rect x="${leftCrop.x}" y="${leftCrop.y}" width="${CROP_WIDTH}" height="${CROP_HEIGHT}" fill="none" stroke="#66583a" stroke-width="2"/>
      <rect x="${rightCrop.x}" y="${rightCrop.y}" width="${CROP_WIDTH}" height="${CROP_HEIGHT}" fill="none" stroke="#6f3d5d" stroke-width="2"/>
      <text class="footer" x="40" y="872">DIFFERENCE-GUIDED CROP BOX SHOWN ABOVE · PHYSICAL SHEATH MUST REMAIN DOMINANT · HUMAN ACCEPTANCE NOT IMPLIED</text>
    </svg>
  `);
}

async function resizedPng(filename, width, height) {
  return sharp(filename, { failOn: "error", limitInputPixels: false })
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png(PNG_OPTIONS)
    .toBuffer();
}

async function croppedPng(filename, crop) {
  return sharp(filename, { failOn: "error", limitInputPixels: false })
    .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
    .resize(CROP_WIDTH, CROP_HEIGHT, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png(PNG_OPTIONS)
    .toBuffer();
}

async function composeMilestone(leftFile, rightFile, milestone, crop) {
  const [leftFull, rightFull, leftCrop, rightCrop] = await Promise.all([
    resizedPng(leftFile, FULL_WIDTH, FULL_HEIGHT),
    resizedPng(rightFile, FULL_WIDTH, FULL_HEIGHT),
    croppedPng(leftFile, crop),
    croppedPng(rightFile, crop),
  ]);
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 7, g: 9, b: 11, alpha: 1 } } })
    .composite([
      { input: leftFull, left: 40, top: 100 },
      { input: rightFull, left: 730, top: 100 },
      { input: leftCrop, left: 40, top: 568 },
      { input: rightCrop, left: 730, top: 568 },
      { input: milestoneOverlay(milestone, crop), left: 0, top: 0 },
    ])
    .png(PNG_OPTIONS)
    .toBuffer();
}

function macroOverlay() {
  const panels = [30, 500, 970];
  const labels = MACRO_SPECS.map((spec, index) => `
    <text class="heading" x="${panels[index]}" y="135">${xml(spec.heading)}</text>
    <text class="detail" x="${panels[index]}" y="465">${xml(spec.detail)}</text>
    <rect x="${panels[index]}" y="155" width="440" height="275" fill="none" stroke="${index === 2 ? "#7ed8bc" : "#e28cbd"}" stroke-width="2"/>
  `).join("");
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <style>
        text { font-family: "Segoe UI", Arial, sans-serif; letter-spacing: 0.8px; }
        .title { fill: #f3f0ea; font-size: 27px; font-weight: 700; }
        .small { fill: #aeb7bc; font-size: 15px; font-weight: 600; }
        .heading { fill: #f0a5cd; font-size: 17px; font-weight: 700; }
        .detail { fill: #aeb7bc; font-size: 13px; font-weight: 600; }
        .notice { fill: #dce5e2; font-size: 22px; font-weight: 700; }
        .footer { fill: #8e9a9f; font-size: 15px; font-weight: 500; }
      </style>
      <text class="title" x="30" y="42">CHECKPOINT 2 · R1.1 PHYSICAL CABLE MACRO REFERENCES</text>
      <text class="small" x="30" y="70">NATIVE RENDER EXPOSURE · NO HELPER LIGHTS · NO EXPOSURE LIFT · HUMAN REVIEW PENDING</text>
      ${labels}
      <rect x="30" y="525" width="1380" height="225" rx="8" fill="#11171a" stroke="#304047" stroke-width="2"/>
      <text class="notice" x="62" y="580">“AUTHORED” MEANS THE SCENE-AUTHORED RENDER STATE.</text>
      <text class="notice" x="62" y="620">IT DOES NOT MEAN BLOOM IS ENABLED.</text>
      <text class="footer" x="62" y="672">The diagnostic report proves zero active bloom or glare controls before and after the disable operation.</text>
      <text class="footer" x="62" y="706">The third panel is therefore an engine-native no-bloom-control proof, not an invented visual effect.</text>
      <text class="footer" x="30" y="862">GRAPHITE SHEATH · NARROW INTERNAL SIGNAL · SOFTER TRAIL · CONTAINED FRONT · MACHINE PASS ≠ HUMAN ACCEPTANCE</text>
    </svg>
  `);
}

async function composeMacro(macros) {
  const panels = await Promise.all(macros.map(({ filename }) => resizedPng(filename, 440, 275)));
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 7, g: 9, b: 11, alpha: 1 } } })
    .composite([
      { input: panels[0], left: 30, top: 155 },
      { input: panels[1], left: 500, top: 155 },
      { input: panels[2], left: 970, top: 155 },
      { input: macroOverlay(), left: 0, top: 0 },
    ])
    .png(PNG_OPTIONS)
    .toBuffer();
}

async function writeNewFile(filename, bytes) {
  check(!(await exists(filename)), `refusing to overwrite output: ${path.basename(filename)}`);
  await writeFile(filename, bytes, { flag: "wx" });
}

async function outputRecord(root, relative, role, extra = {}) {
  const filename = await containedFile(root, relative, `comparison output ${relative}`);
  const record = await recordFile(filename);
  const metadata = await sharp(filename, { failOn: "error" }).metadata();
  check(metadata.format === "png" && metadata.width === WIDTH && metadata.height === HEIGHT && metadata.isPalette !== true, `comparison output is not deterministic full-colour 1440x900 PNG: ${relative}`);
  return { role, path: relative, mediaType: "image/png", width: WIDTH, height: HEIGHT, ...extra, ...record };
}

function privatePathString(value) {
  if (typeof value !== "string") return false;
  const normalized = value.replaceAll("\\", "/");
  return /^[a-z]:\//i.test(normalized) || /^\/\//.test(normalized) || /(?:^|[^a-z0-9])\/(?:Users|home|private\/var|tmp|var\/tmp|mnt\/[a-z])\//i.test(normalized) || normalized.toLowerCase().includes(REPO_ROOT.replaceAll("\\", "/").toLowerCase());
}

function rejectPathLeakage(value, trail = []) {
  if (typeof value === "string") {
    check(!privatePathString(value), `private path leakage at ${trail.join(".")}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectPathLeakage(child, [...trail, String(index)]));
    return;
  }
  if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) rejectPathLeakage(child, [...trail, key]);
}

async function selfTest() {
  check(sharp.versions.sharp === EXPECTED_SHARP, `sharp ${EXPECTED_SHARP} is required; got ${sharp.versions.sharp}`);
  check(safeRelativePath("full/desktop/F047.png", "self-test") === "full/desktop/F047.png", "relative-path self-test failed");
  let rejected = false;
  try { safeRelativePath("../escape.png", "self-test"); } catch { rejected = true; }
  check(rejected, "path traversal self-test failed");
  const first = await sharp({ create: { width: 32, height: 20, channels: 4, background: "#101214" } }).png(PNG_OPTIONS).toBuffer();
  const second = await sharp({ create: { width: 32, height: 20, channels: 4, background: "#101214" } }).png(PNG_OPTIONS).toBuffer();
  check(first.equals(second) && sha256(first) === sha256(second), "deterministic PNG self-test failed");
  const left = Buffer.alloc(WIDTH * HEIGHT * 3);
  const right = Buffer.from(left);
  for (let y = 510; y < 540; y += 1) for (let x = 620; x < 720; x += 1) {
    const offset = (y * WIDTH + x) * 3;
    right[offset] = 210;
    right[offset + 1] = 40;
    right[offset + 2] = 180;
  }
  const crop = chooseCableCrop(left, right);
  check(crop.left <= 670 && crop.left + crop.width >= 670 && crop.top <= 525 && crop.top + crop.height >= 525, "cable-crop salience self-test failed");
  rejectPathLeakage({ path: "checkpoint2-cable-F047-first.png" });
  process.stdout.write(`PHASE4R1_1_CABLE_COMPARISON_SELF_TEST=PASS\nSHARP_VERSION=${sharp.versions.sharp}\n`);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.selfTest) {
    await selfTest();
    return;
  }
  check(sharp.versions.sharp === EXPECTED_SHARP, `sharp ${EXPECTED_SHARP} is required; got ${sharp.versions.sharp}`);
  const [accepted, diagnostic] = await Promise.all([
    verifyAcceptedR1(args.acceptedRoot),
    verifyDiagnostic(args.diagnosticRoot, args.reportBytes, args.reportSha256),
  ]);
  check(accepted.root !== diagnostic.root, "accepted and R1.1 diagnostic roots must differ");
  const output = path.resolve(args.outputRoot);
  check(!isWithin(REPO_ROOT, output), "comparison output must remain external to the repository");
  check(!isWithin(accepted.root, output) && !isWithin(diagnostic.root, output), "comparison output must not be nested in an input root");
  check(!(await exists(output)), "comparison output root already exists; no overwrite is allowed");
  const parent = await exactDirectory(path.dirname(output), "comparison output parent");
  const staging = path.join(parent, `.${path.basename(output)}.pending-${process.pid}`);
  check(!(await exists(staging)), "comparison staging root already exists");
  await mkdir(staging, { recursive: false });
  try {
    const crops = [];
    const outputRecords = [];
    for (const milestone of MILESTONES) {
      const acceptedAuthority = accepted.selected.get(milestone.frame);
      const repairedAuthority = diagnostic.selected.get(milestone.frame);
      const [left, right] = await Promise.all([decodedRgb(acceptedAuthority.filename), decodedRgb(repairedAuthority.filename)]);
      const crop = chooseCableCrop(left, right);
      const bytes = await composeMilestone(acceptedAuthority.filename, repairedAuthority.filename, milestone, crop);
      await writeNewFile(path.join(staging, milestone.filename), bytes);
      crops.push({ frame: milestone.frame, milestone: milestone.key, sourceCrop: crop });
      outputRecords.push(await outputRecord(staging, milestone.filename, "checkpoint2-cable-milestone-comparison", { frame: milestone.frame, milestone: milestone.key }));
    }
    const macroName = "checkpoint2-cable-macro-reference.png";
    await writeNewFile(path.join(staging, macroName), await composeMacro(diagnostic.macros));
    outputRecords.push(await outputRecord(staging, macroName, "checkpoint2-cable-macro-reference"));
    const producer = await recordFile(SCRIPT_FILE);
    const manifest = {
      schema: SCHEMA,
      status: "PASS",
      checkpoint: 2,
      classification: CLASSIFICATION,
      producer: {
        path: path.relative(REPO_ROOT, SCRIPT_FILE).replaceAll("\\", "/"),
        runtime: `Node ${process.versions.node}`,
        sharp: sharp.versions.sharp,
        libvips: sharp.versions.vips,
        deterministicPng: { ...PNG_OPTIONS, sharpCache: false, sharpConcurrency: 1, sharpSimd: false },
        ...producer,
      },
      inputs: {
        acceptedR1: {
          authorityId: ACCEPTED_ROOT_ID,
          manifest: { filename: ACCEPTED_MANIFEST_NAME, ...ACCEPTED_MANIFEST_RECORD },
          derivative: ACCEPTED_SOURCE,
          selectedFrames: MILESTONES.map((milestone) => ({ frame: milestone.frame, path: `F${String(milestone.frame).padStart(3, "0")}.png`, ...milestone.accepted })),
        },
        repairedR11: {
          report: { filename: REPORT_NAME, ...diagnostic.reportRecord },
          derivative: diagnostic.report.source,
          sourceBuild: diagnostic.report.sourceBuild,
          selectedFrames: MILESTONES.map((milestone) => {
            const record = diagnostic.selected.get(milestone.frame).record;
            return { frame: milestone.frame, path: record.path, bytes: record.bytes, sha256: record.sha256 };
          }),
          macroReferences: diagnostic.macros.map(({ path: relative, record }) => ({ path: relative, frame: record.frame, bloomState: record.bloomState, bytes: record.bytes, sha256: record.sha256 })),
        },
      },
      nativeExposure: {
        acceptedR1ExposureStops: 1.0,
        repairedR11ExposureStops: 1.0,
        additionalGradeOrBrighteningApplied: false,
        fullCompositionsUseAcceptedDesktopCamera: true,
        macroReferencesUseNoHelperLightsOrExposureLift: true,
      },
      bloomSemantics: {
        authoredLabelsMeanSceneAuthoredRenderStateNotBloomEnabled: true,
        activeControlCountBeforeDisable: 0,
        activeControlCountAfterDisable: 0,
        bloomDisabledProofMode: "engine-native-no-bloom-control",
        inventedEffect: false,
      },
      cableCropSelection: {
        crops,
        sameNativeSourceCropUsedForBothVersions: true,
        cropSelectionDoesNotAlterExposureOrColor: true,
      },
      files: outputRecords,
      expectedFileCountIncludingManifest: outputRecords.length + 1,
      outputInventoryExhaustive: true,
      rawFramesCopied: false,
      rawSequencesIncluded: false,
      externalInputOrOutputAbsolutePathsStored: false,
      humanAccepted: false,
      humanReviewRequired: true,
      authorization: AUTHORIZATION,
    };
    rejectPathLeakage(manifest);
    await writeNewFile(path.join(staging, MANIFEST_NAME), Buffer.from(stableJson(manifest), "utf8"));
    const actual = (await readdir(staging)).sort();
    const expected = [...outputRecords.map((record) => record.path), MANIFEST_NAME].sort();
    check(JSON.stringify(actual) === JSON.stringify(expected), "comparison staging inventory is not exhaustive");
    const manifestRoundTrip = await readObjectJson(path.join(staging, MANIFEST_NAME), "comparison output manifest");
    check(manifestRoundTrip.schema === SCHEMA && manifestRoundTrip.status === "PASS", "comparison output manifest round-trip failed");
    rejectPathLeakage(manifestRoundTrip);
    await rename(staging, output);
  } catch (error) {
    const stagingDetails = await lstat(staging).catch(() => null);
    if (stagingDetails?.isDirectory()) await rm(staging, { recursive: true, force: false });
    throw error;
  }
  process.stdout.write(`PHASE4R1_1_CABLE_COMPARISON_ROOT=${output}\nPHASE4R1_1_CABLE_COMPARISON_MANIFEST=${path.join(output, MANIFEST_NAME)}\nSTATUS=PASS\n`);
}

main().catch((error) => {
  process.stderr.write(`PHASE4R1_1_CABLE_COMPARISON_ERROR=${error.message}\n`);
  process.exitCode = 1;
});
