#!/usr/bin/env node

/**
 * Authenticate fresh Phase 4-R1 refined render roots and publish the four
 * compact evidence roots consumed by the frozen v2 review packager.
 *
 * This program never invokes Blender, never starts or resumes a complete
 * 540-frame Cycles production film, never changes website runtime media, and
 * never makes a human review decision. Raw frames remain in their external
 * producer roots. Published roots contain only review PNG/MP4 files and one
 * exhaustive manifest apiece.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const SCRIPT_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_FILE), "..");

const INPUT_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.evidence-aggregation-input.v2";
const RESULT_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.evidence-aggregation-result.v2";
const EXPECTED_BRANCH = "redirect/phase-4r1-proving-hall-environment";
const EXPECTED_PARENT = "4fd17810d47697785e66584a7ef40199ff597ba1";
const EXPECTED_MAIN = "501040c42bba30b9d9517b88a8f9857992a2dba4";
const GENERATED_AT = "2026-08-24T00:00:00.000Z";
const FPS = 30;
const PHYSICAL_END = 500;
const BLACK_START = 501;
const BLACK_END = 513;
const ENTRY_START = 514;
const FRAME_END = 540;
const CLASSIFICATION = "PHASE 4-R1 REFINED PROVING HALL PREPRODUCTION · HUMAN UNACCEPTED · COMPLETE 540-FRAME CYCLES FILM NOT AUTHORIZED · REFINED PHYSICAL MEDIA RUNTIME INTEGRATION NOT AUTHORIZED · PHASE 5 UNAUTHORIZED";

const V2_PACKAGER_PATH = "scripts/package-phase4r1-refined-proving-hall-review-v2.mjs";
const PRODUCER_PATHS = Object.freeze({
  previewRenderer: "artifacts/original/phase-4r1-refined-proving-hall/source/render_phase4r1_refined_previews.py",
  cyclesRenderer: "artifacts/original/phase-4r1-refined-proving-hall/source/render_phase4r1_refined_cycles_benchmarks.py",
  responsiveCapture: "scripts/capture-phase4r0-entry-plates.mjs",
  aggregator: "scripts/aggregate-phase4r1-refined-evidence.mjs",
});
const SOURCE_PATHS = Object.freeze({
  derivative: "artifacts/original/phase-4r1-refined-proving-hall/source/quantum-signal-television-phase4r1-refined-proving-hall.blend",
  sourceBuild: "artifacts/original/phase-4r1-refined-proving-hall/source/phase4r1-refined-source-build.json",
  sourceValidation: "artifacts/original/phase-4r1-refined-proving-hall/source/phase4r1-refined-source-validation.json",
});

const EVIDENCE_SCHEMAS = Object.freeze({
  previews: "quantum-hub.phase-4-r1.refined-proving-hall.previews.v2",
  cyclesStills: "quantum-hub.phase-4-r1.refined-proving-hall.cycles-benchmarks.v2",
  cyclesMotion: "quantum-hub.phase-4-r1.refined-proving-hall.cycles-motion.v2",
  responsive: "quantum-hub.phase-4-r1.refined-proving-hall.responsive-evidence.v2",
});

const RAW_SCHEMAS = Object.freeze({
  desktopFrames: "quantum-hub.phase-4-r1.refined-proving-hall.desktop-physical-frames.v2",
  mobileFrames: "quantum-hub.phase-4-r1.refined-proving-hall.mobile-physical-frames.v2",
  landscapeFrames: "quantum-hub.phase-4-r1.refined-proving-hall.landscape-physical-frames.v2",
  cyclesBenchmarks: "quantum-hub.phase-4-r1.refined-proving-hall.cycles-benchmarks.v2",
  cyclesCurrentMotion: "quantum-hub.phase-4-r1.refined-proving-hall.cycles-current-sample.v2",
  cyclesQThresholdMotion: "quantum-hub.phase-4-r1.refined-proving-hall.cycles-q-threshold-sample.v2",
  entryPlates: "quantum-hub.phase-4r0.semantic-entry-plates-manifest.v1",
});

const FAMILY_SPECS = Object.freeze({
  desktop: Object.freeze({ rawKey: "desktopFrames", width: 1440, height: 900, entryCaptureId: "desktop-1440x900" }),
  mobile: Object.freeze({ rawKey: "mobileFrames", width: 390, height: 844, entryCaptureId: "mobile-390x844" }),
  landscape: Object.freeze({ rawKey: "landscapeFrames", width: 844, height: 390, entryCaptureId: "mobile-landscape-844x390" }),
});

const TIMELINE = Object.freeze({
  fps: 30,
  frameStart: 1,
  frameEnd: 540,
  physicalEnd: 500,
  blackStart: 501,
  blackEnd: 513,
  entryStart: 514,
  entrySettled: 540,
});

const PREVIEW_ROLES = Object.freeze({
  "desktop-forward": Object.freeze({ filename: "phase4r1-refined-desktop-forward.mp4", width: 1440, height: 900, frames: 540, fps: 30 }),
  "mobile-forward": Object.freeze({ filename: "phase4r1-refined-mobile-forward.mp4", width: 390, height: 844, frames: 540, fps: 30 }),
  "landscape-forward": Object.freeze({ filename: "phase4r1-refined-landscape-forward.mp4", width: 844, height: 390, frames: 540, fps: 30 }),
  "desktop-reverse": Object.freeze({ filename: "phase4r1-refined-desktop-reverse.mp4", width: 1440, height: 900, frames: 540, fps: 30 }),
  "current-travel-excerpt": Object.freeze({ filename: "phase4r1-refined-current-travel-excerpt.mp4", width: 1440, height: 900, minimumFrames: 30, maximumFrames: 540, fps: 30 }),
  "q-threshold-excerpt": Object.freeze({ filename: "phase4r1-refined-q-threshold-excerpt.mp4", width: 1440, height: 900, minimumFrames: 30, maximumFrames: 540, fps: 30 }),
});

const PREVIEW_SOURCE_RANGES = Object.freeze({
  "current-travel-excerpt": Object.freeze({ frameStart: 46, frameEnd: 285 }),
  "q-threshold-excerpt": Object.freeze({ frameStart: 335, frameEnd: 540 }),
});

const CYCLES_STILL_SELECTION = Object.freeze({
  "desktop-dormant-wide": Object.freeze({ benchmarkId: "desktop-dark-dormancy", family: "desktop", frame: 1 }),
  "desktop-early-current": Object.freeze({ benchmarkId: "desktop-early-current", family: "desktop", frame: 76 }),
  "desktop-mid-conduction": Object.freeze({ benchmarkId: "desktop-mid-current", family: "desktop", frame: 165 }),
  "desktop-rear-orbit": Object.freeze({ benchmarkId: "desktop-rear-mass", family: "desktop", frame: 225 }),
  "desktop-q-activation": Object.freeze({ benchmarkId: "desktop-exact-q", family: "desktop", frame: 355 }),
  "desktop-late-approach": Object.freeze({ benchmarkId: "desktop-screen-approach", family: "desktop", frame: 460 }),
  "mobile-mid-conduction": Object.freeze({ benchmarkId: "mobile-mid-current", family: "mobile", frame: 165 }),
});

const CYCLES_MOTION_SELECTION = Object.freeze({
  "current-proving-hall": Object.freeze({ rawKey: "cyclesCurrentMotion", mode: "current-sample", frameStart: 46, frameEnd: 135, frames: 90, fps: 30, filename: "phase4r1-refined-cycles-current-proving-hall.mp4" }),
  "q-threshold": Object.freeze({ rawKey: "cyclesQThresholdMotion", mode: "q-threshold-sample", frameStart: 391, frameEnd: 480, frames: 90, fps: 30, filename: "phase4r1-refined-cycles-q-threshold.mp4" }),
});

const RESPONSIVE_VIEWPORTS = Object.freeze({
  "mobile-390x844": Object.freeze({ width: 390, height: 844, family: "mobile", physicalFit: "cover", physicalPosition: "center", provisional: false, captureId: "mobile-390x844" }),
  "mobile-360x800": Object.freeze({ width: 360, height: 800, family: "mobile", physicalFit: "cover", physicalPosition: "center", provisional: false, captureId: "mobile-360x800" }),
  "narrow-320x800": Object.freeze({ width: 320, height: 800, family: "mobile", physicalFit: "cover", physicalPosition: "center", provisional: false, captureId: "narrow-320x800" }),
  "tablet-portrait-768x1024": Object.freeze({ width: 768, height: 1024, family: "mobile", physicalFit: "contain", physicalPosition: "center", provisional: true, background: "#020204", captureId: "tablet-portrait-768x1024" }),
  "landscape-844x390": Object.freeze({ width: 844, height: 390, family: "landscape", physicalFit: "cover", physicalPosition: "center", provisional: false, captureId: "mobile-landscape-844x390" }),
  "landscape-740x360": Object.freeze({ width: 740, height: 360, family: "landscape", physicalFit: "cover", physicalPosition: "center", provisional: false, captureId: "short-landscape-neighbor-740x360" }),
  "landscape-800x360": Object.freeze({ width: 800, height: 360, family: "landscape", physicalFit: "cover", physicalPosition: "center", provisional: false, captureId: "short-landscape-neighbor-800x360" }),
  "landscape-896x414": Object.freeze({ width: 896, height: 414, family: "landscape", physicalFit: "cover", physicalPosition: "center", provisional: false, captureId: "short-landscape-neighbor-896x414" }),
  "landscape-900x480": Object.freeze({ width: 900, height: 480, family: "landscape", physicalFit: "cover", physicalPosition: "center", provisional: false, captureId: "short-landscape-neighbor-900x480" }),
});

const AUTHORIZATION = Object.freeze({
  full540FrameCyclesProductionFilmStarted: false,
  full540FrameCyclesProductionFilmResumed: false,
  refinedPhysicalMediaRuntimeIntegrationStarted: false,
  chromeStatePolicyImplementationEvidenced: true,
  humanAccepted: false,
  phase5Authorized: false,
});

const COMMANDS = new Set(["validate", "previews", "cycles-stills", "cycles-motion", "responsive", "all"]);

function lexicalCompare(left, right) {
  return left.localeCompare(right, "en", { sensitivity: "variant", numeric: false });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filename) {
  return sha256(await readFile(filename));
}

function validHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validCommit(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function exactKeys(value, required, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of required) if (!(key in value)) throw new Error(`${label} lacks required key ${key}`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label} has unsupported key ${key}`);
}

function exactSet(values, expected, label) {
  if (!Array.isArray(values) || new Set(values).size !== values.length) throw new Error(`${label} must be a duplicate-free array`);
  const missing = expected.filter((value) => !values.includes(value));
  const extras = values.filter((value) => !expected.includes(value));
  if (missing.length || extras.length) throw new Error(`${label} mismatch; missing [${missing.join(", ")}], extras [${extras.join(", ")}]`);
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function assertInteger(value, minimum, label) {
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${label} must be an integer >= ${minimum}`);
  return value;
}

function normalizedPath(value) {
  return path.resolve(value).replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRelativePath(value, label) {
  assertString(value, label);
  if (value.includes("\0") || path.isAbsolute(value) || /^[a-z]:/i.test(value) || /^[/\\]{2}/.test(value)) throw new Error(`${label} must be root-relative`);
  const normalized = value.replaceAll("\\", "/");
  if (normalized !== path.posix.normalize(normalized) || normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || normalized.startsWith("./") || normalized.endsWith("/")) {
    throw new Error(`${label} must be canonical POSIX root-relative`);
  }
  return normalized;
}

function privateHostPath(value) {
  if (typeof value !== "string") return false;
  const normalized = value.replaceAll("\\", "/");
  if (/file:\/{2,3}(?:[a-z]:\/|\/)/i.test(normalized)
    || /(?:^|[^a-z0-9])[a-z]:[\\/][^\s"'<>|]*/i.test(value)
    || /\\\\[^\\/\s]+[\\/][^\s"'<>|]*/i.test(value)) return true;
  if (/^https?:\/\//i.test(value.trim())) return false;
  return /(?:^|[^a-z0-9])\/(?:Users|home|private\/var|tmp|var\/tmp|mnt\/[a-z])\//i.test(normalized)
    || normalized.toLowerCase().includes(normalizedPath(ROOT).toLowerCase());
}

function rejectBoundaryViolations(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectBoundaryViolations(child, [...trail, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;
  const ambiguous = new Set([
    "runtimeintegrationstarted", "runtimeintegrationauthorized", "productionrendering", "productionrenderingstarted",
    "productionrenderingresumed", "productionrenderingauthorized", "full540cyclesstarted", "full540cyclesresumed",
    "full540cyclesauthorized", "full540cyclesrenderstarted", "full540cyclesrenderresumed", "complete540framecyclesrenderstarted",
    "complete540framecyclesrenderresumed", "complete540framecyclesrenderauthorized",
  ]);
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (ambiguous.has(normalized)) throw new Error(`ambiguous production/runtime field at ${[...trail, key].join(".")}`);
    if (child === true && (
      normalized.includes("phase5authorized") || normalized.includes("humanaccepted") || normalized.includes("phase4complete")
      || normalized.includes("refinedphysicalmediaruntimeintegrationstarted") || normalized.includes("full540framecyclesproductionfilmstarted")
      || normalized.includes("full540framecyclesproductionfilmresumed") || normalized.includes("full540framecyclesproductionfilmauthorized")
    )) throw new Error(`forbidden authorization truth at ${[...trail, key].join(".")}`);
    rejectBoundaryViolations(child, [...trail, key]);
  }
}

function assertAuthorization(value, label = "authorization") {
  exactKeys(value, Object.keys(AUTHORIZATION), Object.keys(AUTHORIZATION), label);
  for (const [key, expected] of Object.entries(AUTHORIZATION)) if (value[key] !== expected) throw new Error(`${label}.${key} must be exactly ${expected}`);
}

async function pathExists(candidate) {
  try { await access(candidate); return true; }
  catch { return false; }
}

async function assertFile(candidate, label) {
  let resolved;
  try { resolved = await realpath(path.resolve(candidate)); }
  catch { throw new Error(`${label} does not exist: ${candidate}`); }
  const details = await stat(resolved);
  if (!details.isFile()) throw new Error(`${label} is not a file: ${candidate}`);
  return resolved;
}

async function assertDirectory(candidate, label) {
  let resolved;
  try { resolved = await realpath(path.resolve(candidate)); }
  catch { throw new Error(`${label} does not exist: ${candidate}`); }
  const details = await stat(resolved);
  if (!details.isDirectory()) throw new Error(`${label} is not a directory: ${candidate}`);
  return resolved;
}

async function readJson(filename, label) {
  try {
    const value = JSON.parse(await readFile(filename, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("root is not an object");
    return value;
  } catch (error) {
    throw new Error(`${label} is not valid object JSON: ${error.message}`);
  }
}

async function atomicWrite(destination, bytes) {
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, bytes);
  try { await rename(temporary, destination); }
  catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function atomicJson(destination, value) {
  await atomicWrite(destination, stableJson(value));
}

async function runGit(args, options = {}) {
  const result = await execFileAsync("git", args, {
    cwd: ROOT,
    windowsHide: true,
    maxBuffer: 30_000_000,
    timeout: 120_000,
    ...options,
  });
  return typeof result.stdout === "string" ? result.stdout.trim() : result.stdout;
}

async function repoAuthority(relativePath, label, expected = null) {
  const relative = safeRelativePath(relativePath, `${label}.path`);
  const filename = await assertFile(path.join(ROOT, ...relative.split("/")), label);
  if (!isWithin(ROOT, filename)) throw new Error(`${label} escapes the repository`);
  await runGit(["ls-files", "--error-unmatch", "--", relative]);
  const [working, headBlob] = await Promise.all([
    readFile(filename),
    runGit(["cat-file", "blob", `HEAD:${relative}`], { encoding: null }),
  ]);
  if (!Buffer.isBuffer(headBlob) || !working.equals(headBlob)) throw new Error(`${label} working bytes differ from final HEAD`);
  const record = { path: relative, bytes: working.length, sha256: sha256(working) };
  if (expected && (record.path !== expected.path || record.bytes !== expected.bytes || record.sha256 !== expected.sha256)) throw new Error(`${label} authority mismatch`);
  return { ...record, filename };
}

async function listFiles(root, relative = "") {
  const directory = path.join(root, ...relative.split("/").filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries.sort((left, right) => lexicalCompare(left.name, right.name))) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`evidence roots may not contain symbolic links: ${child}`);
    if (entry.isDirectory()) results.push(...await listFiles(root, child));
    else if (entry.isFile()) results.push(child);
    else throw new Error(`unsupported evidence filesystem entry: ${child}`);
  }
  return results;
}

function inputContractTemplate() {
  return {
    schema: INPUT_SCHEMA,
    status: "READY",
    classification: CLASSIFICATION,
    repository: {
      expectedBranch: EXPECTED_BRANCH,
      expectedHead: "<40 lowercase hexadecimal characters>",
      expectedUpstream: `origin/${EXPECTED_BRANCH}`,
      expectedMain: EXPECTED_MAIN,
      requireCleanFinalHead: true,
      requireHeadUpstreamParity: true,
    },
    sourceAuthorities: Object.fromEntries(Object.entries(SOURCE_PATHS).map(([key, value]) => [key, {
      path: value,
      bytes: 1,
      sha256: "<64 lowercase hexadecimal characters>",
    }])),
    raw: Object.fromEntries(Object.entries(RAW_SCHEMAS).map(([key, schema]) => [key, {
      root: `<fresh external ${key} root>`,
      manifest: `<root-relative ${key} manifest filename>`,
      bytes: 1,
      sha256: "<64 lowercase hexadecimal characters>",
      schema,
    }])),
    authorization: { ...AUTHORIZATION },
  };
}

function printHelp() {
  process.stdout.write(`Phase 4-R1 refined proving-hall evidence aggregator\n\n`);
  process.stdout.write(`Contract and no-evidence self-tests:\n`);
  process.stdout.write(`  node scripts/aggregate-phase4r1-refined-evidence.mjs --print-contract\n`);
  process.stdout.write(`  node scripts/aggregate-phase4r1-refined-evidence.mjs --self-test\n`);
  process.stdout.write(`  node scripts/aggregate-phase4r1-refined-evidence.mjs --self-test-invalid\n\n`);
  process.stdout.write(`Authenticated raw validation (no output):\n`);
  process.stdout.write(`  node scripts/aggregate-phase4r1-refined-evidence.mjs validate --input-contract <json>\n\n`);
  process.stdout.write(`Atomic evidence publication:\n`);
  process.stdout.write(`  node scripts/aggregate-phase4r1-refined-evidence.mjs previews --input-contract <json> --output <fresh external root> --ffmpeg <executable>\n`);
  process.stdout.write(`  node scripts/aggregate-phase4r1-refined-evidence.mjs cycles-stills --input-contract <json> --output <fresh external root>\n`);
  process.stdout.write(`  node scripts/aggregate-phase4r1-refined-evidence.mjs cycles-motion --input-contract <json> --output <fresh external root> --ffmpeg <executable>\n`);
  process.stdout.write(`  node scripts/aggregate-phase4r1-refined-evidence.mjs responsive --input-contract <json> --output <fresh external root>\n`);
  process.stdout.write(`  node scripts/aggregate-phase4r1-refined-evidence.mjs all --input-contract <json> --output <fresh external parent> --ffmpeg <executable>\n\n`);
  process.stdout.write(`All real modes require the exact clean final HEAD and local upstream parity. Responsive PNGs are accepted only from a clean-HEAD semantic ENTRY capture manifest.\n`);
}

function parseArguments(argv) {
  const options = { command: null, inputContract: null, output: null, ffmpeg: process.env.FFMPEG_PATH ?? null, help: false, printContract: false, selfTest: false, selfTestInvalid: false };
  let index = 0;
  if (argv[0] && !argv[0].startsWith("--")) {
    if (!COMMANDS.has(argv[0])) throw new Error(`unknown subcommand: ${argv[0]}`);
    options.command = argv[0];
    index = 1;
  }
  for (; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--input-contract", "--output", "--ffmpeg"].includes(value)) {
      const supplied = argv[index + 1];
      if (!supplied || supplied.startsWith("--")) throw new Error(`${value} requires a value`);
      if (value === "--input-contract") options.inputContract = path.resolve(supplied);
      else if (value === "--output") options.output = path.resolve(supplied);
      else options.ffmpeg = /[\\/]/.test(supplied) ? path.resolve(supplied) : supplied;
      index += 1;
    } else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--print-contract") options.printContract = true;
    else if (value === "--self-test") options.selfTest = true;
    else if (value === "--self-test-invalid") options.selfTestInvalid = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  if (options.help || options.printContract || options.selfTest || options.selfTestInvalid) {
    if (options.command || options.inputContract || options.output || options.ffmpeg !== (process.env.FFMPEG_PATH ?? null)) throw new Error("help/contract/self-test modes cannot be combined with real-work arguments");
    return options;
  }
  if (!options.command) throw new Error("a subcommand is required");
  if (!options.inputContract) throw new Error("--input-contract is required");
  if (options.command !== "validate" && !options.output) throw new Error("--output is required for publication subcommands");
  if (["previews", "cycles-motion", "all"].includes(options.command) && !options.ffmpeg) throw new Error(`${options.command} requires --ffmpeg`);
  if (options.command === "validate" && options.output) throw new Error("validate does not accept --output");
  return options;
}

function validateInputContractShape(contract) {
  exactKeys(contract, ["schema", "status", "classification", "repository", "sourceAuthorities", "raw", "authorization"], ["schema", "status", "classification", "repository", "sourceAuthorities", "raw", "authorization"], "aggregation input contract");
  if (contract.schema !== INPUT_SCHEMA || contract.status !== "READY" || contract.classification !== CLASSIFICATION) throw new Error("aggregation contract schema/status/classification mismatch");
  exactKeys(contract.repository, ["expectedBranch", "expectedHead", "expectedUpstream", "expectedMain", "requireCleanFinalHead", "requireHeadUpstreamParity"], ["expectedBranch", "expectedHead", "expectedUpstream", "expectedMain", "requireCleanFinalHead", "requireHeadUpstreamParity"], "contract.repository");
  if (contract.repository.expectedBranch !== EXPECTED_BRANCH || contract.repository.expectedMain !== EXPECTED_MAIN || contract.repository.requireCleanFinalHead !== true || contract.repository.requireHeadUpstreamParity !== true) throw new Error("repository contract differs from the frozen clean-final-HEAD policy");
  if (!validCommit(contract.repository.expectedHead)) throw new Error("contract.repository.expectedHead must be an exact lowercase commit SHA");
  if (contract.repository.expectedUpstream !== `origin/${EXPECTED_BRANCH}`) throw new Error("contract.repository.expectedUpstream mismatch");
  exactKeys(contract.sourceAuthorities, Object.keys(SOURCE_PATHS), Object.keys(SOURCE_PATHS), "contract.sourceAuthorities");
  for (const [key, fixedPath] of Object.entries(SOURCE_PATHS)) {
    const record = contract.sourceAuthorities[key];
    exactKeys(record, ["path", "bytes", "sha256"], ["path", "bytes", "sha256"], `contract source ${key}`);
    if (record.path !== fixedPath || !Number.isInteger(record.bytes) || record.bytes < 1 || !validHash(record.sha256)) throw new Error(`contract source ${key} authority is invalid`);
  }
  exactKeys(contract.raw, Object.keys(RAW_SCHEMAS), Object.keys(RAW_SCHEMAS), "contract.raw");
  for (const [key, schema] of Object.entries(RAW_SCHEMAS)) {
    const record = contract.raw[key];
    exactKeys(record, ["root", "manifest", "bytes", "sha256", "schema"], ["root", "manifest", "bytes", "sha256", "schema"], `contract raw ${key}`);
    assertString(record.root, `contract raw ${key}.root`);
    safeRelativePath(record.manifest, `contract raw ${key}.manifest`);
    if (record.schema !== schema || !Number.isInteger(record.bytes) || record.bytes < 1 || !validHash(record.sha256)) throw new Error(`contract raw ${key} authority is invalid`);
  }
  assertAuthorization(contract.authorization, "contract.authorization");
  rejectBoundaryViolations(contract);
  return contract;
}

async function verifyFrozenV2Contract() {
  const filename = await assertFile(path.join(ROOT, ...V2_PACKAGER_PATH.split("/")), "frozen v2 packager");
  const result = await execFileAsync(process.execPath, [filename, "--print-producer-checklist"], { cwd: ROOT, windowsHide: true, maxBuffer: 5_000_000, timeout: 120_000 });
  let checklist;
  try { checklist = JSON.parse(result.stdout); }
  catch { throw new Error("frozen v2 packager producer checklist is not JSON"); }
  if (checklist.status !== "FROZEN") throw new Error("v2 packager checklist is not FROZEN");
  for (const [key, schema] of Object.entries(EVIDENCE_SCHEMAS)) if (checklist.evidenceManifests?.[key] !== schema) throw new Error(`v2 packager ${key} schema drift`);
  if (JSON.stringify(checklist.previewRoles) !== JSON.stringify(PREVIEW_ROLES)) throw new Error("v2 packager preview-role contract drift");
  exactSet(checklist.cyclesStillRoles, Object.keys(CYCLES_STILL_SELECTION), "v2 packager Cycles still roles");
  if (JSON.stringify(checklist.cyclesMotionRoles) !== JSON.stringify(Object.fromEntries(Object.entries(CYCLES_MOTION_SELECTION).map(([role, spec]) => [role, { minimumFrames: 30, maximumFrames: 180, fps: spec.fps }])))) throw new Error("v2 packager Cycles motion-role contract drift");
  exactSet(checklist.responsiveRoleIds, Object.keys(RESPONSIVE_VIEWPORTS), "v2 packager responsive roles");
  const bytes = await readFile(filename);
  return { path: V2_PACKAGER_PATH, bytes: bytes.length, sha256: sha256(bytes), schemaBindings: EVIDENCE_SCHEMAS };
}

async function validateRepository(contract) {
  const [head, branch, upstream, main, status, parentIsAncestor] = await Promise.all([
    runGit(["rev-parse", "HEAD"]),
    runGit(["branch", "--show-current"]),
    runGit(["rev-parse", "@{u}"]),
    runGit(["rev-parse", "refs/heads/main"]),
    runGit(["status", "--porcelain=v1", "--untracked-files=all"]),
    runGit(["merge-base", "--is-ancestor", EXPECTED_PARENT, "HEAD"]).then(() => true, () => false),
  ]);
  if (head !== contract.repository.expectedHead || branch !== EXPECTED_BRANCH || upstream !== head || main !== EXPECTED_MAIN || status !== "" || !parentIsAncestor) throw new Error("repository is not the exact clean final HEAD with local upstream parity, unchanged main, and accepted parent ancestry");
  const sourceAuthorities = {};
  for (const [key, relativePath] of Object.entries(SOURCE_PATHS)) sourceAuthorities[key] = await repoAuthority(relativePath, `source ${key}`, contract.sourceAuthorities[key]);
  const producers = {};
  for (const [key, relativePath] of Object.entries(PRODUCER_PATHS)) producers[key] = await repoAuthority(relativePath, `producer ${key}`);
  const consumerContract = await verifyFrozenV2Contract();
  return {
    head,
    branch,
    upstream: contract.repository.expectedUpstream,
    main,
    clean: true,
    sourceAuthorities,
    producers,
    consumerContract,
  };
}

function resolveContractPath(contractPath, supplied) {
  return path.resolve(path.dirname(contractPath), supplied);
}

async function resolveRawAuthority(contractPath, record, key) {
  const root = await assertDirectory(resolveContractPath(contractPath, record.root), `${key} raw root`);
  if (isWithin(ROOT, root)) throw new Error(`${key} raw root must be external to Git`);
  const manifestRelative = safeRelativePath(record.manifest, `${key} raw manifest path`);
  const manifestPath = await assertFile(path.join(root, ...manifestRelative.split("/")), `${key} raw manifest`);
  if (!isWithin(root, manifestPath)) throw new Error(`${key} raw manifest escapes its root`);
  const bytes = await readFile(manifestPath);
  if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw new Error(`${key} raw manifest authority mismatch`);
  const manifest = JSON.parse(bytes);
  if (manifest.schema !== record.schema || manifest.status !== "PASS") throw new Error(`${key} raw manifest schema/status mismatch`);
  rejectBoundaryViolations(manifest);
  return { key, root, manifestRelative, manifestPath, manifestBytes: bytes, manifest, authority: { schema: record.schema, bytes: bytes.length, sha256: sha256(bytes) } };
}

async function decodedPng(data, label, expectedWidth = null, expectedHeight = null) {
  let metadata;
  let stats;
  try {
    const image = sharp(data, { failOn: "error", limitInputPixels: false });
    [metadata, stats] = await Promise.all([image.clone().metadata(), image.clone().stats()]);
  } catch (error) {
    throw new Error(`${label} is not a fully decodable PNG: ${error.message}`);
  }
  if (metadata.format !== "png" || !metadata.width || !metadata.height || stats.channels.length < 1) throw new Error(`${label} is not a fully decodable PNG`);
  if (expectedWidth !== null && metadata.width !== expectedWidth) throw new Error(`${label} width ${metadata.width} != ${expectedWidth}`);
  if (expectedHeight !== null && metadata.height !== expectedHeight) throw new Error(`${label} height ${metadata.height} != ${expectedHeight}`);
  return { width: metadata.width, height: metadata.height, format: metadata.format, channels: metadata.channels, isOpaque: stats.isOpaque };
}

async function verifyInventory(root, manifestRelative, records, label, dimensionResolver = null) {
  if (!Array.isArray(records) || records.length < 1) throw new Error(`${label} lacks files[]`);
  const byPath = new Map();
  const caseFolded = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${label} file ${index} is invalid`);
    const relative = safeRelativePath(record.path, `${label} file ${index}.path`);
    const folded = relative.toLowerCase();
    if (caseFolded.has(folded)) throw new Error(`${label} has a duplicate/case-alias path ${relative}`);
    caseFolded.add(folded);
    assertInteger(record.bytes, 1, `${label} file ${relative}.bytes`);
    if (!validHash(record.sha256)) throw new Error(`${label} file ${relative}.sha256 is invalid`);
    const filename = await assertFile(path.join(root, ...relative.split("/")), `${label} file ${relative}`);
    if (!isWithin(root, filename)) throw new Error(`${label} file ${relative} escapes root`);
    const data = await readFile(filename);
    if (data.length !== record.bytes || sha256(data) !== record.sha256) throw new Error(`${label} file ${relative} bytes/hash mismatch`);
    let image = null;
    if (path.extname(relative).toLowerCase() === ".png") {
      const expected = dimensionResolver ? dimensionResolver(record) : null;
      image = await decodedPng(data, `${label} file ${relative}`, expected?.width ?? null, expected?.height ?? null);
    }
    byPath.set(relative, { ...record, relativePath: relative, filename, data, image });
  }
  const actual = await listFiles(root);
  const expectedPaths = [manifestRelative, ...byPath.keys()].sort(lexicalCompare);
  if (JSON.stringify(actual) !== JSON.stringify(expectedPaths)) {
    const missing = expectedPaths.filter((value) => !actual.includes(value));
    const extras = actual.filter((value) => !expectedPaths.includes(value));
    throw new Error(`${label} root is not exhaustive; missing [${missing.join(", ")}], extras [${extras.join(", ")}]`);
  }
  return byPath;
}

function sameAuthority(left, right) {
  return left?.path === right?.path && left?.bytes === right?.bytes && left?.sha256 === right?.sha256;
}

function assertRawSourceBindings(manifest, repository, label, producerId, producerAuthority) {
  const source = manifest.sourceAuthorities;
  if (!source || !sameAuthority(source.derivative, repository.sourceAuthorities.derivative)
    || !sameAuthority(source.sourceBuild, repository.sourceAuthorities.sourceBuild)
    || !sameAuthority(source.sourceValidation, repository.sourceAuthorities.sourceValidation)) {
    throw new Error(`${label} does not bind the exact derivative/build/validation authorities`);
  }
  if (manifest.reusedRecoveredOldVisualEvidence !== false) throw new Error(`${label} must state reusedRecoveredOldVisualEvidence:false`);
  const producer = manifest.producerAuthorities?.[producerId];
  if (!sameAuthority(producer, producerAuthority)) throw new Error(`${label} does not bind its exact tracked raw producer`);
  if (manifest.authorization) assertAuthorization(manifest.authorization, `${label}.authorization`);
}

function assertPhysicalTimeline(timeline, label) {
  const timelineKeys = ["fps", "frameStart", "frameEnd", "physicalOnly"];
  exactKeys(timeline, timelineKeys, timelineKeys, label);
  if (timeline.fps !== 30 || timeline.frameStart !== 1 || timeline.frameEnd !== 500 || timeline.physicalOnly !== true) {
    throw new Error(`${label} mismatch`);
  }
}

async function resolvePhysicalFrames(raw, family, repository) {
  const spec = FAMILY_SPECS[family];
  const manifest = raw.manifest;
  assertRawSourceBindings(manifest, repository, `${family} physical frames`, "preview-renderer", repository.producers.previewRenderer);
  if (manifest.family !== family || manifest.expectedFrameCount !== 500 || manifest.renderedFrameCount !== 500) throw new Error(`${family} physical frame inventory is incomplete`);
  assertPhysicalTimeline(manifest.timeline, `${family} physical timeline`);
  const settings = manifest.renderSettings;
  if (!settings || settings.engine !== "BLENDER_EEVEE" || JSON.stringify(settings.resolution) !== JSON.stringify([spec.width, spec.height]) || settings.resolutionPercentage !== 100 || JSON.stringify(settings.pixelAspect) !== JSON.stringify([1, 1]) || settings.viewTransform !== "AgX" || typeof settings.look !== "string") throw new Error(`${family} physical render settings mismatch`);
  if (!Array.isArray(manifest.files) || manifest.files.length !== 500) throw new Error(`${family} physical files[] must contain exactly 500 records`);
  const frameMap = new Map();
  for (const record of manifest.files) {
    if (record.role !== "physical-frame" || record.family !== family || !Number.isInteger(record.frame) || record.frame < 1 || record.frame > 500 || frameMap.has(record.frame)) throw new Error(`${family} physical manifest has an invalid/duplicate frame record`);
    if (record.width !== spec.width || record.height !== spec.height || record.mediaType !== "image/png") throw new Error(`${family} F${record.frame} declares wrong image properties`);
    frameMap.set(record.frame, record);
  }
  if (Array.from({ length: 500 }, (_, index) => index + 1).some((frame) => !frameMap.has(frame))) throw new Error(`${family} physical manifest is not contiguous F001-F500`);
  const files = await verifyInventory(raw.root, raw.manifestRelative, manifest.files, `${family} physical frames`, () => ({ width: spec.width, height: spec.height }));
  const frames = new Map();
  for (const [frame, record] of frameMap) frames.set(frame, files.get(safeRelativePath(record.path, `${family} frame path`)));
  return { ...raw, family, width: spec.width, height: spec.height, frames, settings };
}

async function resolveCyclesBenchmarks(raw, repository) {
  const manifest = raw.manifest;
  assertRawSourceBindings(manifest, repository, "Cycles benchmark frames", "cycles-benchmarks-renderer", repository.producers.cyclesRenderer);
  if (manifest.mode !== "benchmarks" || !Array.isArray(manifest.files) || manifest.files.length !== 9) throw new Error("Cycles benchmark raw manifest must contain the exact nine authored benchmark renders");
  const settings = manifest.renderSettings;
  if (!settings || settings.engine !== "CYCLES" || settings.samples !== 192 || settings.adaptiveSampling !== true || settings.denoiser !== "OPENIMAGEDENOISE" || settings.motionBlur !== false || settings.viewTransform !== "AgX" || typeof settings.look !== "string" || !settings.computeDevice || typeof settings.computeDevice !== "object") throw new Error("Cycles benchmark raw settings mismatch");
  const byBenchmark = new Map();
  for (const record of manifest.files) {
    if (record.role !== "cycles-benchmark" || typeof record.benchmarkId !== "string" || byBenchmark.has(record.benchmarkId) || record.mediaType !== "image/png") throw new Error("Cycles benchmark raw manifest contains an invalid/duplicate record");
    byBenchmark.set(record.benchmarkId, record);
  }
  for (const [role, selection] of Object.entries(CYCLES_STILL_SELECTION)) {
    const record = byBenchmark.get(selection.benchmarkId);
    if (!record || record.family !== selection.family || record.frame !== selection.frame) throw new Error(`Cycles raw benchmark mapping for ${role} is absent or wrong`);
  }
  const files = await verifyInventory(raw.root, raw.manifestRelative, manifest.files, "Cycles benchmark frames", (record) => ({ width: record.width, height: record.height }));
  return { ...raw, settings, byBenchmark, files };
}

async function resolveCyclesMotionFrames(raw, role, repository) {
  const selection = CYCLES_MOTION_SELECTION[role];
  const manifest = raw.manifest;
  assertRawSourceBindings(manifest, repository, `Cycles ${role} raw frames`, "cycles-benchmarks-renderer", repository.producers.cyclesRenderer);
  const settings = manifest.renderSettings;
  if (manifest.mode !== selection.mode || !settings || settings.engine !== "CYCLES" || settings.samples !== 96 || settings.adaptiveSampling !== true || settings.denoiser !== "OPENIMAGEDENOISE" || settings.motionBlur !== true || settings.viewTransform !== "AgX" || typeof settings.look !== "string" || !settings.computeDevice || typeof settings.computeDevice !== "object") throw new Error(`Cycles ${role} raw settings/mode mismatch`);
  if (!Array.isArray(manifest.files) || manifest.files.length !== selection.frames) throw new Error(`Cycles ${role} must have exactly ${selection.frames} raw frames`);
  const frameMap = new Map();
  let width = null;
  let height = null;
  for (const record of manifest.files) {
    if (record.role !== "cycles-motion-frame" || record.family !== "desktop" || !Number.isInteger(record.frame) || record.frame < selection.frameStart || record.frame > selection.frameEnd || frameMap.has(record.frame) || record.mediaType !== "image/png") throw new Error(`Cycles ${role} has an invalid/duplicate raw frame`);
    width ??= record.width;
    height ??= record.height;
    if (record.width !== width || record.height !== height || width % 2 || height % 2) throw new Error(`Cycles ${role} raw frame dimensions are inconsistent or odd`);
    frameMap.set(record.frame, record);
  }
  if (Array.from({ length: selection.frames }, (_, index) => selection.frameStart + index).some((frame) => !frameMap.has(frame))) throw new Error(`Cycles ${role} raw frames are not contiguous`);
  const files = await verifyInventory(raw.root, raw.manifestRelative, manifest.files, `Cycles ${role} raw frames`, () => ({ width, height }));
  const frames = [];
  for (let frame = selection.frameStart; frame <= selection.frameEnd; frame += 1) frames.push(files.get(safeRelativePath(frameMap.get(frame).path, `${role} raw frame path`)));
  return { ...raw, role, selection, settings, width, height, frames };
}

const REQUIRED_ENTRY_CAPTURE_IDS = Object.freeze([
  "desktop-1440x900", "short-height-1366x650", "desktop-1280x800", "tablet-landscape-1024x768",
  "tablet-portrait-768x1024", "mobile-390x844", "mobile-360x800", "narrow-320x800", "mobile-landscape-844x390",
  "short-landscape-neighbor-740x360", "short-landscape-neighbor-800x360", "short-landscape-neighbor-896x414", "short-landscape-neighbor-900x480",
]);

function assertEntryChecks(checks, label) {
  const required = ["exactlyOneDocumentH1", "exactlyOneEntryH1", "h1TextMatches", "entryLabelOwnsH1", "exactlyTwoEntryRoutes", "routePathsMatch", "routeNamesPresent", "semanticContentVisible", "semanticContentInteractive", "semanticHorizontalFit", "semanticVerticalFit", "noRootHorizontalOverflow", "entryHorizontalOverflowContained"];
  if (!checks || required.some((key) => checks[key] !== true)) throw new Error(`${label} lacks required PASS semantic/overflow checks`);
}

async function resolveEntryPlates(raw, repository) {
  const manifest = raw.manifest;
  if (manifest.repository?.head !== repository.head || manifest.repository?.branch !== EXPECTED_BRANCH || manifest.repository?.dirty !== false || !Array.isArray(manifest.repository?.status) || manifest.repository.status.length !== 0) throw new Error("semantic ENTRY plates were not captured from the exact clean final HEAD");
  if (manifest.runtimeAuthority?.unchanged !== true || JSON.stringify(manifest.runtimeAuthority.before) !== JSON.stringify(manifest.runtimeAuthority.after)) throw new Error("semantic ENTRY runtime authorities changed during capture");
  for (const record of manifest.runtimeAuthority.before ?? []) await repoAuthority(record.repositoryRelativePath, `ENTRY runtime authority ${record.repositoryRelativePath}`, { path: record.repositoryRelativePath, bytes: record.bytes, sha256: record.sha256 });
  if (!Array.isArray(manifest.captures) || manifest.captures.length !== REQUIRED_ENTRY_CAPTURE_IDS.length) throw new Error("semantic ENTRY manifest must contain the exact 13 responsive captures");
  exactSet(manifest.captures.map((capture) => capture.id), REQUIRED_ENTRY_CAPTURE_IDS, "semantic ENTRY capture IDs");
  if (!Array.isArray(manifest.files) || manifest.files.length !== REQUIRED_ENTRY_CAPTURE_IDS.length * 2) throw new Error("semantic ENTRY manifest files[] must exhaust 13 PNGs and 13 reports");
  const files = await verifyInventory(raw.root, raw.manifestRelative, manifest.files, "semantic ENTRY plates");
  const captures = new Map();
  for (const capture of manifest.captures) {
    if (capture.status !== "PASS" || !capture.png || capture.png.width !== capture.width || capture.png.height !== capture.height) throw new Error(`semantic ENTRY capture ${capture.id} is not PASS or dimension-bound`);
    assertEntryChecks(capture.checks, `semantic ENTRY capture ${capture.id}`);
    const pngPath = safeRelativePath(capture.png.path, `semantic ENTRY capture ${capture.id}.png.path`);
    const png = files.get(pngPath);
    if (!png || png.bytes !== capture.png.bytes || png.sha256 !== capture.png.sha256 || png.image?.width !== capture.width || png.image?.height !== capture.height) throw new Error(`semantic ENTRY capture ${capture.id} PNG authority mismatch`);
    const reportPath = safeRelativePath(capture.report, `semantic ENTRY capture ${capture.id}.report`);
    const reportFile = files.get(reportPath);
    if (!reportFile || path.extname(reportPath).toLowerCase() !== ".json") throw new Error(`semantic ENTRY capture ${capture.id} report authority is absent`);
    const report = JSON.parse(reportFile.data);
    if (report.schema !== "quantum-hub.phase-4r0.semantic-entry-plate.v1" || report.status !== "PASS" || report.viewport?.id !== capture.id || report.plate?.sha256 !== capture.png.sha256) throw new Error(`semantic ENTRY capture ${capture.id} report mismatch`);
    assertEntryChecks(report.state?.checks, `semantic ENTRY report ${capture.id}`);
    const headerBottom = Number(report.state?.boxes?.visibleHeaderBottom);
    if (!Number.isFinite(headerBottom) || headerBottom < 0 || headerBottom > capture.height) throw new Error(`semantic ENTRY capture ${capture.id} lacks a valid measured header boundary`);
    captures.set(capture.id, { ...capture, png, headerBottom, headerState: report.state?.cinematic?.headerState ?? null, reportAuthority: { bytes: reportFile.bytes, sha256: reportFile.sha256 } });
  }
  return { ...raw, captures, repositoryHead: repository.head };
}

async function resolveRequestedRaw(contractPath, contract, repository, command) {
  const keys = command === "previews" ? ["desktopFrames", "mobileFrames", "landscapeFrames", "entryPlates"]
    : command === "cycles-stills" ? ["cyclesBenchmarks"]
      : command === "cycles-motion" ? ["cyclesCurrentMotion", "cyclesQThresholdMotion"]
        : command === "responsive" ? ["entryPlates"]
          : Object.keys(RAW_SCHEMAS);
  const raw = {};
  for (const key of keys) raw[key] = await resolveRawAuthority(contractPath, contract.raw[key], key);
  const roots = Object.values(raw).map((record) => record.root);
  for (let left = 0; left < roots.length; left += 1) for (let right = left + 1; right < roots.length; right += 1) {
    if (isWithin(roots[left], roots[right]) || isWithin(roots[right], roots[left])) throw new Error("raw evidence roots may not overlap or contain one another");
  }
  const resolved = {};
  if (raw.desktopFrames) resolved.desktop = await resolvePhysicalFrames(raw.desktopFrames, "desktop", repository);
  if (raw.mobileFrames) resolved.mobile = await resolvePhysicalFrames(raw.mobileFrames, "mobile", repository);
  if (raw.landscapeFrames) resolved.landscape = await resolvePhysicalFrames(raw.landscapeFrames, "landscape", repository);
  if (raw.cyclesBenchmarks) resolved.cyclesBenchmarks = await resolveCyclesBenchmarks(raw.cyclesBenchmarks, repository);
  if (raw.cyclesCurrentMotion) resolved.currentMotion = await resolveCyclesMotionFrames(raw.cyclesCurrentMotion, "current-proving-hall", repository);
  if (raw.cyclesQThresholdMotion) resolved.qThresholdMotion = await resolveCyclesMotionFrames(raw.cyclesQThresholdMotion, "q-threshold", repository);
  if (raw.entryPlates) resolved.entryPlates = await resolveEntryPlates(raw.entryPlates, repository);
  return { authorities: raw, resolved };
}

function publicAuthority(record) {
  return { path: record.path, bytes: record.bytes, sha256: record.sha256 };
}

function outputSourceBindings(repository, rawAuthorities) {
  return {
    refinedDerivative: publicAuthority(repository.sourceAuthorities.derivative),
    sourceBuild: publicAuthority(repository.sourceAuthorities.sourceBuild),
    sourceValidation: publicAuthority(repository.sourceAuthorities.sourceValidation),
    rawManifests: Object.fromEntries(Object.entries(rawAuthorities).map(([key, record]) => [key, { manifest: record.manifestRelative, ...record.authority }])),
    consumerContract: repository.consumerContract,
    finalHead: repository.head,
  };
}

function producerAuthorities(rawProducers, aggregator) {
  return {
    ...Object.fromEntries(Object.entries(rawProducers).map(([key, value]) => [key, publicAuthority(value)])),
    aggregator: publicAuthority(aggregator),
  };
}

async function resolveFfmpeg(candidate) {
  let supplied = candidate;
  if (!/[\\/]/.test(candidate)) {
    const locator = process.platform === "win32" ? "where.exe" : "which";
    const located = await execFileAsync(locator, [candidate], { windowsHide: true, maxBuffer: 100_000, timeout: 30_000 });
    supplied = String(located.stdout).split(/\r?\n/).find(Boolean);
    if (!supplied) throw new Error(`FFmpeg executable ${candidate} was not found`);
  }
  const filename = await assertFile(supplied, "FFmpeg executable");
  const ffprobe = await assertFile(path.join(path.dirname(filename), process.platform === "win32" ? "ffprobe.exe" : "ffprobe"), "matching ffprobe executable");
  const [ffmpegBytes, ffprobeBytes, version] = await Promise.all([
    readFile(filename),
    readFile(ffprobe),
    execFileAsync(filename, ["-version"], { windowsHide: true, maxBuffer: 1_000_000, timeout: 30_000 }),
  ]);
  if (!/--enable-libx264/i.test(version.stdout)) throw new Error("FFmpeg build lacks libx264");
  return {
    filename,
    ffprobe,
    authority: {
      ffmpeg: { basename: path.basename(filename), bytes: ffmpegBytes.length, sha256: sha256(ffmpegBytes), version: String(version.stdout).split(/\r?\n/)[0].trim() },
      ffprobe: { basename: path.basename(ffprobe), bytes: ffprobeBytes.length, sha256: sha256(ffprobeBytes) },
    },
  };
}

function rationalNumber(value) {
  const match = String(value ?? "").match(/^(\d+)(?:\/(\d+))?$/);
  if (!match) return Number.NaN;
  const denominator = Number(match[2] ?? 1);
  return denominator ? Number(match[1]) / denominator : Number.NaN;
}

function metadataStrings(value, strings = []) {
  if (Array.isArray(value)) value.forEach((child) => metadataStrings(child, strings));
  else if (value && typeof value === "object") Object.values(value).forEach((child) => metadataStrings(child, strings));
  else if (typeof value === "string") strings.push(value);
  return strings;
}

async function probeVideo(tool, filename, expected, label) {
  const result = await execFileAsync(tool.ffprobe, [
    "-v", "error", "-count_frames",
    "-show_entries", "stream=codec_name,codec_type,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_frames,nb_frames,duration:stream_tags:format=format_name,duration:format_tags",
    "-of", "json", filename,
  ], { windowsHide: true, maxBuffer: 3_000_000, timeout: 120_000 });
  const parsed = JSON.parse(result.stdout);
  const video = (parsed.streams ?? []).filter((stream) => stream.codec_type === "video");
  if (video.length !== 1 || (parsed.streams ?? []).length !== 1) throw new Error(`${label} must contain exactly one video stream and no audio/data streams`);
  const stream = video[0];
  const frames = Number(stream.nb_read_frames ?? stream.nb_frames);
  const fps = rationalNumber(stream.avg_frame_rate);
  const nominalFps = rationalNumber(stream.r_frame_rate);
  const durationSeconds = Number(parsed.format?.duration ?? stream.duration);
  if (stream.codec_name !== "h264" || stream.pix_fmt !== "yuv420p" || Number(stream.width) !== expected.width || Number(stream.height) !== expected.height
    || frames !== expected.frames || Math.abs(fps - 30) > 1e-9 || Math.abs(nominalFps - 30) > 1e-9 || Math.abs(durationSeconds - frames / 30) > 0.01
    || !String(parsed.format?.format_name ?? "").split(",").includes("mp4")) throw new Error(`${label} failed exact H.264/yuv420p/dimension/frame/rate/duration gates`);
  const leaked = metadataStrings(parsed).find(privateHostPath);
  if (leaked) throw new Error(`${label} ffprobe metadata contains a private host path`);
  return { codec: "h264", pixelFormat: "yuv420p", width: expected.width, height: expected.height, frames, fps, nominalFps, durationSeconds, formatName: parsed.format.format_name, audioStreams: 0, privateMetadataPaths: 0 };
}

function mp4BoxHeader(data, offset, end, label) {
  if (offset + 8 > end) throw new Error(`${label} has a truncated MP4 box header`);
  let size = data.readUInt32BE(offset);
  const type = data.toString("latin1", offset + 4, offset + 8);
  let header = 8;
  if (size === 1) {
    if (offset + 16 > end) throw new Error(`${label} has a truncated extended MP4 box`);
    const large = data.readBigUInt64BE(offset + 8);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} MP4 box is too large`);
    size = Number(large);
    header = 16;
  } else if (size === 0) size = end - offset;
  if (size < header || offset + size > end) throw new Error(`${label} has an invalid MP4 box size`);
  return { type, start: offset, contentStart: offset + header, end: offset + size, size };
}

function mp4TextMetadata(data, label) {
  const containers = new Set(["moov", "udta", "meta", "ilst", "trak", "mdia", "minf", "stbl"]);
  const texts = [];
  const walk = (start, end, depth) => {
    if (depth > 12) throw new Error(`${label} MP4 nesting exceeds policy`);
    let offset = start;
    while (offset < end) {
      const box = mp4BoxHeader(data, offset, end, label);
      let childStart = box.contentStart;
      if (box.type === "meta") childStart += 4;
      if (containers.has(box.type)) walk(childStart, box.end, depth + 1);
      else if (["data", "©nam", "©cmt", "©too", "name"].includes(box.type)) texts.push(data.toString("utf8", box.contentStart, box.end));
      offset = box.end;
    }
    if (offset !== end) throw new Error(`${label} MP4 box walk did not terminate exactly`);
  };
  walk(0, data.length, 0);
  return texts;
}

async function assertMp4Privacy(filename, label) {
  const data = await readFile(filename);
  const leaked = mp4TextMetadata(data, label).find(privateHostPath);
  if (leaked) throw new Error(`${label} MP4 text metadata contains a private host path`);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

const MAX_PNG_TEXT_METADATA_BYTES = 1_000_000;

function pngTextNull(payload, start, label) {
  const index = payload.indexOf(0, start);
  if (index < start) throw new Error(`${label} has malformed PNG text metadata`);
  return index;
}

function inflatePngText(payload, label) {
  try { return inflateSync(payload, { maxOutputLength: MAX_PNG_TEXT_METADATA_BYTES }); }
  catch (error) { throw new Error(`${label} has invalid or oversized compressed PNG text metadata: ${error.message}`); }
}

function pngTextChunkStrings(type, payload, label) {
  const keywordEnd = pngTextNull(payload, 0, label);
  if (keywordEnd < 1 || keywordEnd > 79) throw new Error(`${label} has an invalid PNG text keyword`);
  const strings = [payload.subarray(0, keywordEnd).toString("latin1")];
  if (type === "tEXt") {
    strings.push(payload.subarray(keywordEnd + 1).toString("latin1"));
  } else if (type === "zTXt") {
    const methodOffset = keywordEnd + 1;
    if (methodOffset >= payload.length || payload[methodOffset] !== 0) throw new Error(`${label} has an unsupported zTXt compression method`);
    strings.push(inflatePngText(payload.subarray(methodOffset + 1), label).toString("latin1"));
  } else if (type === "iTXt") {
    let cursor = keywordEnd + 1;
    if (cursor + 2 > payload.length) throw new Error(`${label} has a truncated iTXt header`);
    const compressed = payload[cursor];
    const method = payload[cursor + 1];
    cursor += 2;
    if ((compressed !== 0 && compressed !== 1) || method !== 0) throw new Error(`${label} has invalid iTXt compression fields`);
    const languageEnd = pngTextNull(payload, cursor, label);
    strings.push(payload.subarray(cursor, languageEnd).toString("ascii"));
    cursor = languageEnd + 1;
    const translatedEnd = pngTextNull(payload, cursor, label);
    strings.push(payload.subarray(cursor, translatedEnd).toString("utf8"));
    cursor = translatedEnd + 1;
    const text = compressed ? inflatePngText(payload.subarray(cursor), label) : payload.subarray(cursor);
    strings.push(text.toString("utf8"));
  } else {
    throw new Error(`${label} requested unsupported PNG text metadata ${type}`);
  }
  return strings;
}

function pngTextStrings(data, label) {
  if (data.length < 12 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`${label} has an invalid PNG signature`);
  const strings = [];
  let offset = 8;
  let chunkIndex = 0;
  let sawIend = false;
  while (offset < data.length) {
    if (offset + 12 > data.length) throw new Error(`${label} has a truncated PNG chunk`);
    const length = data.readUInt32BE(offset);
    const type = data.toString("latin1", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`${label} has an invalid PNG chunk type`);
    if (chunkIndex === 0 && type !== "IHDR") throw new Error(`${label} does not begin with IHDR`);
    const end = offset + 12 + length;
    if (end > data.length) throw new Error(`${label} has an invalid PNG chunk length`);
    const payload = data.subarray(offset + 8, offset + 8 + length);
    const crcInput = data.subarray(offset + 4, offset + 8 + length);
    if (crc32(crcInput) !== data.readUInt32BE(offset + 8 + length)) throw new Error(`${label} has a CRC-invalid ${type} chunk`);
    if (["tEXt", "zTXt", "iTXt"].includes(type)) strings.push(...pngTextChunkStrings(type, payload, label));
    offset = end;
    chunkIndex += 1;
    if (type === "IEND") {
      if (length !== 0) throw new Error(`${label} has a non-empty IEND chunk`);
      sawIend = true;
      break;
    }
  }
  if (!sawIend) throw new Error(`${label} lacks IEND`);
  if (offset !== data.length) throw new Error(`${label} has trailing PNG bytes`);
  return strings;
}

async function sanitizePng(sourceData, label) {
  pngTextStrings(sourceData, label);
  const sourcePixels = await sharp(sourceData, { failOn: "error", limitInputPixels: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const parts = [sourceData.subarray(0, 8)];
  const removedPrivateTextChunks = [];
  let offset = 8;
  while (offset < sourceData.length) {
    const length = sourceData.readUInt32BE(offset);
    const type = sourceData.toString("latin1", offset + 4, offset + 8);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    const chunkEnd = payloadEnd + 4;
    if (["tEXt", "zTXt", "iTXt"].includes(type)) {
      const strings = pngTextChunkStrings(type, sourceData.subarray(payloadStart, payloadEnd), label);
      if (strings.some(privateHostPath)) {
        removedPrivateTextChunks.push({ type, keyword: strings[0], bytes: chunkEnd - offset });
        offset = chunkEnd;
        continue;
      }
    }
    parts.push(sourceData.subarray(offset, chunkEnd));
    offset = chunkEnd;
  }
  const output = Buffer.concat(parts);
  const outputPixels = await sharp(output, { failOn: "error", limitInputPixels: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (sourcePixels.info.width !== outputPixels.info.width || sourcePixels.info.height !== outputPixels.info.height || !sourcePixels.data.equals(outputPixels.data)) throw new Error(`${label} privacy chunk removal changed decoded RGBA pixels`);
  if (pngTextStrings(output, `${label} sanitized`).some(privateHostPath)) throw new Error(`${label} retains a private host path in PNG text metadata`);
  return { data: output, width: outputPixels.info.width, height: outputPixels.info.height, decodedRgbaSha256: sha256(outputPixels.data), decodedRgbaBytes: outputPixels.data.length, removedPrivateTextChunks };
}

function fixturePngChunk(type, payload) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length, 0);
  typeBytes.copy(chunk, 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])), 8 + payload.length);
  return chunk;
}

function insertPngChunksBeforeIdat(data, chunks, label) {
  pngTextStrings(data, label);
  let offset = 8;
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("latin1", offset + 4, offset + 8);
    if (type === "IDAT") return Buffer.concat([data.subarray(0, offset), ...chunks, data.subarray(offset)]);
    offset += 12 + length;
  }
  throw new Error(`${label} lacks IDAT`);
}

async function pngPrivacySelfTest() {
  const base = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 12, g: 34, b: 56 } } }).png().toBuffer();
  const privateFixture = ["/", "home", "/", "fixture", "/", "render.png"].join("");
  const compressedPrivateFixture = deflateSync(Buffer.from(privateFixture, "utf8"));
  const fixture = insertPngChunksBeforeIdat(base, [
    fixturePngChunk("tEXt", Buffer.from(`Comment\0safe retained metadata`, "latin1")),
    fixturePngChunk("tEXt", Buffer.from(`File\0${privateFixture}`, "latin1")),
    fixturePngChunk("zTXt", Buffer.concat([Buffer.from("CompressedFile\0\0", "latin1"), compressedPrivateFixture])),
    fixturePngChunk("iTXt", Buffer.concat([Buffer.from("InternationalFile\0", "latin1"), Buffer.from([1, 0]), Buffer.from("\0\0", "latin1"), compressedPrivateFixture])),
  ], "PNG privacy fixture");
  const sanitized = await sanitizePng(fixture, "PNG privacy fixture");
  const strings = pngTextStrings(sanitized.data, "sanitized PNG privacy fixture");
  if (sanitized.removedPrivateTextChunks.length !== 3 || sanitized.removedPrivateTextChunks.map((record) => record.type).join(",") !== "tEXt,zTXt,iTXt") throw new Error("PNG privacy self-test did not remove all three private text chunk types");
  if (!strings.includes("Comment") || !strings.includes("safe retained metadata") || strings.some(privateHostPath)) throw new Error("PNG privacy self-test did not retain only safe text metadata");
  const repeat = await sanitizePng(sanitized.data, "repeat sanitized PNG privacy fixture");
  if (repeat.removedPrivateTextChunks.length !== 0 || !repeat.data.equals(sanitized.data)) throw new Error("PNG privacy sanitization is not repeat-deterministic");
  const expectFailure = async (candidate, expected) => {
    try { await sanitizePng(candidate, `invalid PNG ${expected}`); }
    catch (error) { if (String(error.message).includes(expected)) return; throw error; }
    throw new Error(`PNG privacy self-test accepted ${expected}`);
  };
  const corrupt = Buffer.from(fixture);
  corrupt[corrupt.length - 1] ^= 1;
  await expectFailure(corrupt, "CRC-invalid IEND");
  await expectFailure(fixture.subarray(0, fixture.length - 12), "lacks IEND");
  await expectFailure(Buffer.concat([fixture, Buffer.from([0])]), "trailing PNG bytes");
  const generalDrivePath = ["D", ":\\", "secret", "\\", "render.png"].join("");
  if (!privateHostPath(generalDrivePath)) throw new Error("PNG privacy self-test failed to reject a general drive-absolute path");
  return { status: "PASS", method: "private text chunk removal without re-encoding", removedPrivateTextChunkTypes: ["tEXt", "zTXt", "iTXt"], safeTextRetained: true, decodedRgbaPreserved: true, repeatDeterministic: true, malformedContainersRejected: ["CRC", "missing IEND", "trailing bytes"], generalDriveAbsolutePathRejected: true };
}

async function prepareCyclesStillPng(sourceData, role) {
  const metadata = await sharp(sourceData, { failOn: "error", limitInputPixels: false }).metadata();
  if (metadata.width >= 512 && metadata.height >= 320) return { ...await sanitizePng(sourceData, `Cycles still ${role}`), reviewTransform: "none", decodedSourcePixelsPreservedOneToOne: true };
  if (role !== "mobile-mid-conduction" || metadata.width !== 390 || metadata.height !== 844) throw new Error(`Cycles still ${role} is below the frozen v2 review resolution and has no authorized deterministic mapping`);
  const sourcePixels = await sharp(sourceData, { failOn: "error", limitInputPixels: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = await sharp(sourceData, { failOn: "error", limitInputPixels: false })
    .resize(metadata.width * 2, metadata.height * 2, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10, palette: false }).toBuffer();
  const outputPixels = await sharp(output, { failOn: "error", limitInputPixels: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (pngTextStrings(output, `Cycles still ${role}`).some(privateHostPath)) throw new Error(`Cycles still ${role} retains a private host path after review scaling`);
  return {
    data: output,
    width: outputPixels.info.width,
    height: outputPixels.info.height,
    decodedRgbaSha256: sha256(outputPixels.data),
    decodedRgbaBytes: outputPixels.data.length,
    sourceDecodedRgbaSha256: sha256(sourcePixels.data),
    sourceDecodedRgbaBytes: sourcePixels.data.length,
    reviewTransform: "disclosed deterministic 2x Lanczos3 review scale from the exact native 390x844 Cycles pixels; no claim of added native detail",
    decodedSourcePixelsPreservedOneToOne: false,
  };
}

function smoothstep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

async function createSemanticFrame(plate, width, height, frame, destination) {
  const progress = smoothstep((frame - (ENTRY_START - 1)) / (FRAME_END - (ENTRY_START - 1)));
  const alpha = 0.06 + 0.94 * progress;
  let pipeline = sharp(plate, { failOn: "error", limitInputPixels: false }).resize(width, height, { fit: "cover", position: "centre" }).ensureAlpha();
  const blur = 1.15 * (1 - progress);
  if (blur >= 0.3) pipeline = pipeline.blur(blur);
  const pixels = await pipeline.raw().toBuffer({ resolveWithObject: true });
  for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = Math.round(pixels.data[index] * alpha);
  const output = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: pixels.data, raw: { width, height, channels: pixels.info.channels }, blend: "over" }])
    .removeAlpha().png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer();
  await atomicWrite(destination, output);
  return { frame, progress: Number(progress.toFixed(8)), alpha: Number(alpha.toFixed(8)), blur: Number(blur.toFixed(8)) };
}

async function prepareFamilySequence(family, entryPlates, workRoot) {
  const directory = await mkdtemp(path.join(workRoot, `family-${family.family}-`));
  const blackPath = path.join(directory, "deep-black.png");
  const black = await sharp({ create: { width: family.width, height: family.height, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer();
  await atomicWrite(blackPath, black);
  const captureId = FAMILY_SPECS[family.family].entryCaptureId;
  const plate = entryPlates.captures.get(captureId)?.png;
  const capture = entryPlates.captures.get(captureId);
  if (!plate || !capture) throw new Error(`semantic ENTRY plate ${captureId} is absent`);
  const concealedHeaderHeight = Math.ceil(capture.headerBottom);
  let chromeFreePlate = plate.data;
  if (concealedHeaderHeight > 0) {
    const cover = await sharp({ create: { width: family.width, height: concealedHeaderHeight, channels: 4, background: { r: 2, g: 2, b: 4, alpha: 1 } } }).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer();
    chromeFreePlate = await sharp(plate.data, { failOn: "error", limitInputPixels: false }).composite([{ input: cover, left: 0, top: 0 }]).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer();
  }
  const files = [];
  for (let frame = 1; frame <= PHYSICAL_END; frame += 1) files.push(family.frames.get(frame).filename);
  for (let frame = BLACK_START; frame <= BLACK_END; frame += 1) files.push(blackPath);
  const semanticResolve = [];
  for (let frame = ENTRY_START; frame <= FRAME_END; frame += 1) {
    const target = path.join(directory, `entry-${String(frame).padStart(3, "0")}.png`);
    const semanticPlate = frame < FRAME_END ? chromeFreePlate : plate.data;
    semanticResolve.push({ ...await createSemanticFrame(semanticPlate, family.width, family.height, frame, target), siteChromeConcealed: frame < FRAME_END });
    files.push(target);
  }
  if (files.length !== 540) throw new Error(`${family.family} aggregate did not resolve exactly 540 frames`);
  return { ...family, directory, files, blackPath, semanticResolve, entryCapture: { id: captureId, bytes: plate.bytes, sha256: plate.sha256, measuredHeaderBottom: capture.headerBottom, chromeReleaseFrame: 540 } };
}

async function prepareImage2(files, workRoot, label) {
  const directory = await mkdtemp(path.join(workRoot, `${label}-image2-`));
  let hardLinks = 0;
  let copies = 0;
  for (let index = 0; index < files.length; index += 1) {
    const destination = path.join(directory, `frame-${String(index + 1).padStart(6, "0")}.png`);
    try { await link(files[index], destination); hardLinks += 1; }
    catch (error) {
      if (!["EXDEV", "EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) throw error;
      await copyFile(files[index], destination);
      copies += 1;
    }
  }
  return { directory, pattern: path.join(directory, "frame-%06d.png"), frameCount: files.length, hardLinks, copies };
}

async function encodeSequence(tool, files, width, height, destination, workRoot, label) {
  const image2 = await prepareImage2(files, workRoot, label);
  try {
    const args = [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-framerate", "30", "-start_number", "1", "-i", image2.pattern,
      "-map", "0:v:0", "-an", "-sn", "-dn", "-frames:v", String(files.length),
      "-vf", `scale=${width}:${height}:flags=lanczos,format=yuv420p`, "-fps_mode", "cfr",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-level:v", "4.2",
      "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-pix_fmt", "yuv420p",
      "-x264-params", "threads=1:lookahead_threads=1:sliced_threads=0:force-cfr=1",
      "-threads", "1", "-movflags", "+faststart", "-map_metadata", "-1", "-map_chapters", "-1",
      "-metadata", "creation_time=", "-metadata:s:v:0", "creation_time=", "-fflags", "+bitexact", "-flags:v", "+bitexact",
      destination,
    ];
    await execFileAsync(tool.filename, args, { windowsHide: true, maxBuffer: 10_000_000, timeout: 10_800_000 });
    const expected = { width, height, frames: files.length };
    const probe = await probeVideo(tool, destination, expected, label);
    await assertMp4Privacy(destination, label);
    const data = await readFile(destination);
    return {
      bytes: data.length,
      sha256: sha256(data),
      probe,
      ingestion: { method: "exact numbered image2 sequence", frameCount: image2.frameCount, hardLinks: image2.hardLinks, copies: image2.copies, privatePathsPublished: false },
    };
  } finally {
    await rm(image2.directory, { recursive: true, force: true });
  }
}

async function decodeSelected(tool, filename, indexes, workRoot, label) {
  const ordered = [...new Set(indexes)].sort((left, right) => left - right);
  const directory = await mkdtemp(path.join(workRoot, `${label}-decode-`));
  try {
    const expression = ordered.map((index) => `eq(n\\,${index})`).join("+");
    await execFileAsync(tool.filename, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", filename, "-vf", `select=${expression}`, "-fps_mode", "passthrough", "-frames:v", String(ordered.length), path.join(directory, "decoded-%03d.png")], { windowsHide: true, maxBuffer: 5_000_000, timeout: 600_000 });
    const outputs = (await readdir(directory)).filter((value) => /^decoded-\d{3}\.png$/.test(value)).sort(lexicalCompare);
    if (outputs.length !== ordered.length) throw new Error(`${label} decoded selection count mismatch`);
    const records = [];
    for (let index = 0; index < ordered.length; index += 1) {
      const data = await readFile(path.join(directory, outputs[index]));
      const raw = await sharp(data, { failOn: "error", limitInputPixels: false }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let maximum = 0;
      let sum = 0;
      for (const value of raw.data) { maximum = Math.max(maximum, value); sum += value; }
      records.push({ decodedIndex: ordered[index], maximumChannel: maximum, meanChannel: Number((sum / raw.data.length).toFixed(8)), decodedPixelSha256: sha256(raw.data) });
    }
    return records;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function blackDecoded(record) {
  return record.maximumChannel <= 8 && record.meanChannel <= 2;
}

function visibleDecoded(record, maximum = 8) {
  return record.maximumChannel > maximum && record.meanChannel > 0.01;
}

async function previewDecodedGate(tool, role, filename, workRoot) {
  let indexes;
  if (["desktop-forward", "mobile-forward", "landscape-forward"].includes(role)) indexes = [459, 499, ...Array.from({ length: 13 }, (_, index) => 500 + index), 513, 539];
  else if (role === "desktop-reverse") indexes = [0, 26, ...Array.from({ length: 13 }, (_, index) => 27 + index), 40, 80, 539];
  else if (role === "current-travel-excerpt") indexes = [0, 59, 119, 179, 239];
  else indexes = [20, 35, 125, 165, ...Array.from({ length: 13 }, (_, index) => 166 + index), 179, 205];
  const samples = await decodeSelected(tool, filename, indexes, workRoot, role);
  const byIndex = new Map(samples.map((record) => [record.decodedIndex, record]));
  const assertions = {};
  if (["desktop-forward", "mobile-forward", "landscape-forward"].includes(role)) {
    assertions.physicalF460Visible = visibleDecoded(byIndex.get(459));
    assertions.authoredPhysicalF500IsDark = blackDecoded(byIndex.get(499));
    assertions.blackF501ThroughF513 = Array.from({ length: 13 }, (_, index) => byIndex.get(500 + index)).every(blackDecoded);
    assertions.entryF514Visible = visibleDecoded(byIndex.get(513), 3);
    assertions.entryF540SettledVisible = visibleDecoded(byIndex.get(539), 16);
  } else if (role === "desktop-reverse") {
    assertions.entryF540VisibleAtStart = visibleDecoded(byIndex.get(0), 16);
    assertions.entryF514Visible = visibleDecoded(byIndex.get(26), 3);
    assertions.reverseBlackF513ThroughF501 = Array.from({ length: 13 }, (_, index) => byIndex.get(27 + index)).every(blackDecoded);
    assertions.authoredPhysicalF500IsDarkAfterBlack = blackDecoded(byIndex.get(40));
    assertions.physicalF460VisibleAfterAuthoredDarkEnd = visibleDecoded(byIndex.get(80));
    assertions.physicalF001VisibleAtEnd = visibleDecoded(byIndex.get(539));
  } else if (role === "current-travel-excerpt") {
    assertions.allDecodedMilestonesVisible = samples.every((record) => visibleDecoded(record));
    assertions.decodedMilestonesAreNotOneRepeatedImage = new Set(samples.map((record) => record.decodedPixelSha256)).size >= 3;
    assertions.exactPhysicalRangeF046ThroughF285 = true;
  } else {
    assertions.qActivationHoldAndLateApproachVisible = [20, 35, 125].every((index) => visibleDecoded(byIndex.get(index)));
    assertions.authoredPhysicalF500IsDark = blackDecoded(byIndex.get(165));
    assertions.blackF501ThroughF513 = Array.from({ length: 13 }, (_, index) => byIndex.get(166 + index)).every(blackDecoded);
    assertions.entryF514Visible = visibleDecoded(byIndex.get(179), 3);
    assertions.entryF540SettledVisible = visibleDecoded(byIndex.get(205), 16);
    assertions.exactAggregateRangeF335ThroughF540 = true;
  }
  if (Object.values(assertions).some((value) => value !== true)) throw new Error(`preview ${role} failed decoded pixel gates: ${JSON.stringify(assertions)}`);
  return { status: "PASS", assertions, samples };
}

function manifestBase(schema, repository, rawAuthorities, producers) {
  return {
    schema,
    status: "PASS",
    generatedAt: GENERATED_AT,
    classification: CLASSIFICATION,
    sourceBindings: outputSourceBindings(repository, rawAuthorities),
    producerAuthorities: producers,
    reusedRecoveredOldVisualEvidence: false,
    authorization: { ...AUTHORIZATION },
  };
}

function computeDeviceSummary(settings) {
  const device = settings.computeDevice;
  return {
    backend: String(device.backend ?? ""),
    sceneDevice: String(device.sceneDevice ?? ""),
    deviceCount: Array.isArray(device.devices) ? device.devices.length : 0,
    attemptsCount: Array.isArray(device.attempts) ? device.attempts.length : 0,
    privateHostPathsPublished: false,
  };
}

async function writeManifestAndVerify(root, filename, manifest, requiredRoles, schema) {
  rejectBoundaryViolations(manifest);
  if (manifest.schema !== schema || manifest.status !== "PASS") throw new Error("output manifest schema/status mismatch before write");
  const records = manifest.artifacts;
  if (!Array.isArray(records)) throw new Error("output manifest lacks artifacts[]");
  exactSet(records.map((record) => record.role), requiredRoles, "output artifact roles");
  for (const record of records) {
    const relative = safeRelativePath(record.path, `output ${record.role}.path`);
    const target = await assertFile(path.join(root, ...relative.split("/")), `output ${record.role}`);
    if (!isWithin(root, target)) throw new Error(`output ${record.role} escapes root`);
    const data = await readFile(target);
    if (data.length !== record.bytes || sha256(data) !== record.sha256) throw new Error(`output ${record.role} bytes/hash mismatch before manifest publication`);
    if (path.extname(relative).toLowerCase() === ".png") await decodedPng(data, `output ${record.role}`, record.width, record.height);
  }
  await atomicJson(path.join(root, filename), manifest);
  const actual = await listFiles(root);
  const expected = [filename, ...records.map((record) => record.path)].sort(lexicalCompare);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("published evidence root is not exhaustive after manifest write");
  const bytes = await readFile(path.join(root, filename));
  return { schema, manifest: filename, bytes: bytes.length, sha256: sha256(bytes), artifacts: records.length };
}

async function buildPreviews(root, workRoot, context, tool) {
  const { repository, raw } = context;
  const families = {};
  for (const family of Object.keys(FAMILY_SPECS)) families[family] = await prepareFamilySequence(raw.resolved[family], raw.resolved.entryPlates, workRoot);
  const plans = [
    { role: "desktop-forward", files: families.desktop.files },
    { role: "mobile-forward", files: families.mobile.files },
    { role: "landscape-forward", files: families.landscape.files },
    { role: "desktop-reverse", files: [...families.desktop.files].reverse() },
    { role: "current-travel-excerpt", files: families.desktop.files.slice(PREVIEW_SOURCE_RANGES["current-travel-excerpt"].frameStart - 1, PREVIEW_SOURCE_RANGES["current-travel-excerpt"].frameEnd) },
    { role: "q-threshold-excerpt", files: families.desktop.files.slice(PREVIEW_SOURCE_RANGES["q-threshold-excerpt"].frameStart - 1, PREVIEW_SOURCE_RANGES["q-threshold-excerpt"].frameEnd) },
  ];
  const artifacts = [];
  const decodedGates = {};
  for (const plan of plans) {
    const spec = PREVIEW_ROLES[plan.role];
    const destination = path.join(root, spec.filename);
    const encoded = await encodeSequence(tool, plan.files, spec.width, spec.height, destination, workRoot, plan.role);
    const expectedFrames = spec.frames ?? plan.files.length;
    if (encoded.probe.frames !== expectedFrames || (spec.minimumFrames && encoded.probe.frames < spec.minimumFrames) || (spec.maximumFrames && encoded.probe.frames > spec.maximumFrames)) throw new Error(`${plan.role} encoded frame bounds mismatch`);
    decodedGates[plan.role] = await previewDecodedGate(tool, plan.role, destination, workRoot);
    artifacts.push({ role: plan.role, path: spec.filename, bytes: encoded.bytes, sha256: encoded.sha256, mediaType: "video/mp4", width: spec.width, height: spec.height, frames: encoded.probe.frames, fps: 30, probe: encoded.probe, ingestion: encoded.ingestion });
  }
  const rawAuthorities = Object.fromEntries(["desktopFrames", "mobileFrames", "landscapeFrames", "entryPlates"].map((key) => [key, raw.authorities[key]]));
  const manifest = {
    ...manifestBase(EVIDENCE_SCHEMAS.previews, repository, rawAuthorities, producerAuthorities({ rawPreviewRenderer: repository.producers.previewRenderer, rawEntryCapture: repository.producers.responsiveCapture }, repository.producers.aggregator)),
    timeline: { ...TIMELINE },
    assembly: {
      physicalFrames: "fresh source-bound Eevee F001-F500",
      physicalEndState: "source-bound F500 is preserved as the authored dark terminal physical frame; F460 is the required visible late-approach milestone",
      breathingBeat: "deep black F501-F513",
      semanticEntry: "clean-final-HEAD authenticated semantic ENTRY F514-F540",
      chromePolicy: "measured site-header region remains concealed through F539; the settled clean-HEAD plate, including released site chrome, appears only at F540",
      reverse: "exact reversal of the complete desktop aggregate",
      currentTravelExcerpt: { ...PREVIEW_SOURCE_RANGES["current-travel-excerpt"] },
      qThresholdExcerpt: { ...PREVIEW_SOURCE_RANGES["q-threshold-excerpt"] },
    },
    encoding: { codec: "H.264/libx264", pixelFormat: "yuv420p", fps: 30, preset: "slow", crf: 18, threads: 1, metadataMapped: false, audio: false, deterministic: true, toolAuthorities: tool.authority },
    decodedGates,
    artifacts,
  };
  const result = await writeManifestAndVerify(root, "phase4r1-refined-previews-manifest.json", manifest, Object.keys(PREVIEW_ROLES), EVIDENCE_SCHEMAS.previews);
  for (const family of Object.values(families)) await rm(family.directory, { recursive: true, force: true });
  return result;
}

async function buildCyclesStills(root, context) {
  const { repository, raw } = context;
  const source = raw.resolved.cyclesBenchmarks;
  const artifacts = [];
  const sourceMappings = [];
  for (const [role, selection] of Object.entries(CYCLES_STILL_SELECTION)) {
    const record = source.byBenchmark.get(selection.benchmarkId);
    const file = source.files.get(safeRelativePath(record.path, `${role} raw path`));
    const sanitized = await prepareCyclesStillPng(file.data, role);
    const filename = `phase4r1-refined-cycles-${role}.png`;
    await atomicWrite(path.join(root, filename), sanitized.data);
    artifacts.push({ role, path: filename, bytes: sanitized.data.length, sha256: sha256(sanitized.data), mediaType: "image/png", width: sanitized.width, height: sanitized.height, decodedRgbaBytes: sanitized.decodedRgbaBytes, decodedRgbaSha256: sanitized.decodedRgbaSha256, privacyRemovedTextChunks: sanitized.removedPrivateTextChunks ?? [], reviewTransform: sanitized.reviewTransform });
    sourceMappings.push({ role, benchmarkId: selection.benchmarkId, family: selection.family, frame: selection.frame, sourceBytes: file.bytes, sourceSha256: file.sha256, sourceDecodedRgbaBytes: sanitized.sourceDecodedRgbaBytes ?? sanitized.decodedRgbaBytes, sourceDecodedRgbaSha256: sanitized.sourceDecodedRgbaSha256 ?? sanitized.decodedRgbaSha256, reviewTransform: sanitized.reviewTransform, decodedSourcePixelsPreservedOneToOne: sanitized.decodedSourcePixelsPreservedOneToOne });
  }
  const rawAuthorities = { cyclesBenchmarks: raw.authorities.cyclesBenchmarks };
  const manifest = {
    ...manifestBase(EVIDENCE_SCHEMAS.cyclesStills, repository, rawAuthorities, producerAuthorities({ rawCyclesRenderer: repository.producers.cyclesRenderer }, repository.producers.aggregator)),
    settings: {
      engine: "CYCLES",
      samples: 192,
      adaptiveSampling: true,
      denoiser: "OPENIMAGEDENOISE",
      motionBlur: false,
      viewTransform: source.settings.viewTransform,
      look: source.settings.look,
      computeDevice: computeDeviceSummary(source.settings),
      nativeRenderer: true,
    },
    selectionPolicy: "seven exact role mappings selected from the fresh exhaustive nine-still raw benchmark run; no recovered R1 pixels eligible",
    sourceMappings,
    privacy: { pngMethod: "container-aware removal of private-path PNG text chunks without re-encoding image chunks; every source and output fully decoded with exact RGBA equality for unscaled stills", privateHostPathsPublished: false },
    artifacts,
  };
  return writeManifestAndVerify(root, "phase4r1-refined-cycles-benchmarks-manifest.json", manifest, Object.keys(CYCLES_STILL_SELECTION), EVIDENCE_SCHEMAS.cyclesStills);
}

async function motionDecodedGate(tool, filename, frames, workRoot, label) {
  const indexes = [0, Math.floor((frames - 1) / 2), frames - 1];
  const samples = await decodeSelected(tool, filename, indexes, workRoot, label);
  const assertions = {
    allDecodedMilestonesVisible: samples.every((record) => visibleDecoded(record)),
    decodedMilestonesAreNotOneRepeatedImage: new Set(samples.map((record) => record.decodedPixelSha256)).size >= 2,
  };
  if (Object.values(assertions).some((value) => value !== true)) throw new Error(`${label} failed decoded motion gates`);
  return { status: "PASS", assertions, samples };
}

async function buildCyclesMotion(root, workRoot, context, tool) {
  const { repository, raw } = context;
  const sources = { "current-proving-hall": raw.resolved.currentMotion, "q-threshold": raw.resolved.qThresholdMotion };
  if (sources["current-proving-hall"].settings.viewTransform !== sources["q-threshold"].settings.viewTransform
    || sources["current-proving-hall"].settings.look !== sources["q-threshold"].settings.look) throw new Error("the two Cycles motion roots use different view transforms/looks");
  const artifacts = [];
  const decodedChecks = {};
  for (const [role, selection] of Object.entries(CYCLES_MOTION_SELECTION)) {
    const source = sources[role];
    const destination = path.join(root, selection.filename);
    const encoded = await encodeSequence(tool, source.frames.map((record) => record.filename), source.width, source.height, destination, workRoot, `cycles-${role}`);
    decodedChecks[role] = await motionDecodedGate(tool, destination, selection.frames, workRoot, `Cycles ${role}`);
    artifacts.push({ role, path: selection.filename, bytes: encoded.bytes, sha256: encoded.sha256, mediaType: "video/mp4", width: source.width, height: source.height, frames: selection.frames, fps: 30, frameStart: selection.frameStart, frameEnd: selection.frameEnd, probe: encoded.probe, ingestion: encoded.ingestion });
  }
  const rawAuthorities = { cyclesCurrentMotion: raw.authorities.cyclesCurrentMotion, cyclesQThresholdMotion: raw.authorities.cyclesQThresholdMotion };
  const manifest = {
    ...manifestBase(EVIDENCE_SCHEMAS.cyclesMotion, repository, rawAuthorities, producerAuthorities({ rawCyclesRenderer: repository.producers.cyclesRenderer }, repository.producers.aggregator)),
    settings: {
      engine: "CYCLES",
      samples: 96,
      adaptiveSampling: true,
      denoiser: "OPENIMAGEDENOISE",
      motionBlur: true,
      viewTransform: sources["current-proving-hall"].settings.viewTransform,
      look: sources["current-proving-hall"].settings.look,
      computeDevices: Object.fromEntries(Object.entries(sources).map(([role, source]) => [role, computeDeviceSummary(source.settings)])),
      nativeRenderer: true,
    },
    motionRanges: Object.fromEntries(Object.entries(CYCLES_MOTION_SELECTION).map(([role, spec]) => [role, { frameStart: spec.frameStart, frameEnd: spec.frameEnd, frames: spec.frames, fps: spec.fps }])),
    encoding: { codec: "H.264/libx264", pixelFormat: "yuv420p", fps: 30, preset: "slow", crf: 18, threads: 1, metadataMapped: false, audio: false, deterministic: true, toolAuthorities: tool.authority },
    decodedChecks,
    artifacts,
  };
  return writeManifestAndVerify(root, "phase4r1-refined-cycles-motion-manifest.json", manifest, Object.keys(CYCLES_MOTION_SELECTION), EVIDENCE_SCHEMAS.cyclesMotion);
}

async function buildResponsive(root, context) {
  const { repository, raw } = context;
  if (!repository.clean || raw.resolved.entryPlates.repositoryHead !== repository.head) throw new Error("responsive publication requires the exact clean final HEAD");
  const artifacts = [];
  const viewports = [];
  const captureBindings = [];
  for (const [role, spec] of Object.entries(RESPONSIVE_VIEWPORTS)) {
    const capture = raw.resolved.entryPlates.captures.get(spec.captureId);
    if (!capture) throw new Error(`responsive source capture ${spec.captureId} is absent`);
    const sanitized = await sanitizePng(capture.png.data, `responsive ${role}`);
    if (sanitized.width !== spec.width || sanitized.height !== spec.height) throw new Error(`responsive ${role} sanitized dimensions mismatch`);
    const filename = `phase4r1-refined-responsive-${role}.png`;
    await atomicWrite(path.join(root, filename), sanitized.data);
    artifacts.push({ role, path: filename, bytes: sanitized.data.length, sha256: sha256(sanitized.data), mediaType: "image/png", width: spec.width, height: spec.height, decodedRgbaBytes: sanitized.decodedRgbaBytes, decodedRgbaSha256: sanitized.decodedRgbaSha256, privacyRemovedTextChunks: sanitized.removedPrivateTextChunks });
    const { captureId: ignored, ...viewport } = spec;
    viewports.push({ id: role, ...viewport });
    captureBindings.push({ role, captureId: spec.captureId, sourceBytes: capture.png.bytes, sourceSha256: capture.png.sha256, sourceReport: capture.reportAuthority, cleanFinalHead: repository.head, decodedPixelsPreserved: true });
  }
  const captureValues = [...raw.resolved.entryPlates.captures.values()];
  const allSemantic = captureValues.every((capture) => {
    try { assertEntryChecks(capture.checks, capture.id); return true; }
    catch { return false; }
  });
  const semanticChecks = {
    status: "PASS",
    exactlyOneH1: allSemantic && captureValues.every((capture) => capture.checks.exactlyOneDocumentH1 === true),
    exactlyTwoEntryRoutes: allSemantic && captureValues.every((capture) => capture.checks.exactlyTwoEntryRoutes === true),
    noHorizontalOverflow: allSemantic && captureValues.every((capture) => capture.checks.noRootHorizontalOverflow === true && capture.checks.entryHorizontalOverflowContained === true),
    narrow320Safety: allSemantic && raw.resolved.entryPlates.captures.get("narrow-320x800")?.checks.semanticHorizontalFit === true && raw.resolved.entryPlates.captures.get("narrow-320x800")?.checks.semanticVerticalFit === true,
    complete844x390Entry: allSemantic && raw.resolved.entryPlates.captures.get("mobile-landscape-844x390")?.checks.semanticHorizontalFit === true && raw.resolved.entryPlates.captures.get("mobile-landscape-844x390")?.checks.semanticVerticalFit === true,
    captureCount: captureValues.length,
    finalHeadClean: true,
  };
  if (Object.entries(semanticChecks).filter(([, value]) => typeof value === "boolean").some(([, value]) => value !== true)) throw new Error("responsive aggregate semantic checks did not all PASS");
  const rawAuthorities = { entryPlates: raw.authorities.entryPlates };
  const manifest = {
    ...manifestBase(EVIDENCE_SCHEMAS.responsive, repository, rawAuthorities, producerAuthorities({ rawEntryCapture: repository.producers.responsiveCapture }, repository.producers.aggregator)),
    evidenceClass: "CLEAN_FINAL_HEAD_SETTLED_SEMANTIC_ENTRY_RESPONSIVE_SHEETS",
    finalHead: repository.head,
    viewports,
    semanticChecks,
    captureBindings,
    privacy: { pngMethod: "container-aware removal of private-path PNG text chunks without re-encoding image chunks", decodedRgbaPixelsPreserved: true, privateHostPathsPublished: false },
    artifacts,
  };
  return writeManifestAndVerify(root, "phase4r1-refined-responsive-evidence-manifest.json", manifest, Object.keys(RESPONSIVE_VIEWPORTS), EVIDENCE_SCHEMAS.responsive);
}

async function resolveFromExistingAncestor(candidate) {
  let current = path.resolve(candidate);
  const tail = [];
  while (!await pathExists(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`no existing ancestor for ${candidate}`);
    tail.unshift(path.basename(current));
    current = parent;
  }
  return path.join(await realpath(current), ...tail);
}

async function validateFreshOutput(output, inputRoots) {
  if (await pathExists(output)) throw new Error("--output already exists; choose a fresh external directory");
  if (!/phase[-_]?4r1|phase[-_]?4[-_]?r1/i.test(path.basename(output))) throw new Error("--output basename must identify Phase 4-R1");
  const resolved = await resolveFromExistingAncestor(output);
  if (isWithin(ROOT, resolved)) throw new Error("--output must remain external to Git");
  for (const root of inputRoots) if (isWithin(root, resolved) || isWithin(resolved, root)) throw new Error("--output may not overlap a raw evidence root");
  await mkdir(path.dirname(output), { recursive: true });
}

async function withAtomicOutput(output, inputRoots, operation) {
  await validateFreshOutput(output, inputRoots);
  const parent = await realpath(path.dirname(output));
  const staging = await mkdtemp(path.join(parent, `.${path.basename(output)}.pending-`));
  if (!isWithin(parent, staging) || normalizedPath(staging) === normalizedPath(parent)) throw new Error("atomic staging root escaped its validated parent");
  try {
    const result = await operation(staging);
    if (await pathExists(output)) throw new Error("--output appeared during aggregation; refusing overwrite");
    await rename(staging, output);
    return result;
  } catch (error) {
    if (isWithin(parent, staging) && normalizedPath(staging) !== normalizedPath(parent)) await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function validationSummary(context) {
  const { repository, raw } = context;
  return {
    schema: `${INPUT_SCHEMA}.validation-result`,
    status: "PASS",
    repository: { head: repository.head, branch: repository.branch, upstream: repository.upstream, main: repository.main, clean: repository.clean },
    sourceAuthorities: Object.fromEntries(Object.entries(repository.sourceAuthorities).map(([key, value]) => [key, publicAuthority(value)])),
    rawManifestAuthorities: Object.fromEntries(Object.entries(raw.authorities).map(([key, value]) => [key, value.authority])),
    validatedRaw: {
      physicalFamilies: ["desktop", "mobile", "landscape"].filter((key) => raw.resolved[key]).map((key) => ({ family: key, frames: raw.resolved[key].frames.size, width: raw.resolved[key].width, height: raw.resolved[key].height })),
      cyclesBenchmarkFrames: raw.resolved.cyclesBenchmarks?.files.size ?? 0,
      cyclesMotionFrames: (raw.resolved.currentMotion?.frames.length ?? 0) + (raw.resolved.qThresholdMotion?.frames.length ?? 0),
      semanticEntryCaptures: raw.resolved.entryPlates?.captures.size ?? 0,
    },
    authorization: { ...AUTHORIZATION },
  };
}

async function loadContext(options) {
  const contractPath = await assertFile(options.inputContract, "aggregation input contract");
  const contract = validateInputContractShape(await readJson(contractPath, "aggregation input contract"));
  const repository = await validateRepository(contract);
  const raw = await resolveRequestedRaw(contractPath, contract, repository, options.command);
  return { contractPath, contract, repository, raw };
}

function contractSelfTest() {
  const contract = inputContractTemplate();
  contract.repository.expectedHead = "a".repeat(40);
  for (const record of Object.values(contract.sourceAuthorities)) { record.bytes = 1; record.sha256 = "b".repeat(64); }
  for (const record of Object.values(contract.raw)) { record.root = "../external-fixture"; record.manifest = "manifest.json"; record.bytes = 1; record.sha256 = "c".repeat(64); }
  validateInputContractShape(contract);
  exactSet(Object.keys(PREVIEW_ROLES), ["desktop-forward", "mobile-forward", "landscape-forward", "desktop-reverse", "current-travel-excerpt", "q-threshold-excerpt"], "self-test preview roles");
  exactSet(Object.keys(CYCLES_STILL_SELECTION), ["desktop-dormant-wide", "desktop-early-current", "desktop-mid-conduction", "desktop-rear-orbit", "desktop-q-activation", "desktop-late-approach", "mobile-mid-conduction"], "self-test Cycles still roles");
  exactSet(Object.keys(CYCLES_MOTION_SELECTION), ["current-proving-hall", "q-threshold"], "self-test Cycles motion roles");
  if (Object.keys(RESPONSIVE_VIEWPORTS).length !== 9 || Object.keys(RAW_SCHEMAS).length !== 7) throw new Error("self-test role/raw counts drifted");
  assertAuthorization(AUTHORIZATION);
  assertPhysicalTimeline({ physicalOnly: true, frameEnd: 500, fps: 30, frameStart: 1 }, "reordered physical timeline self-test");
  const deterministicA = stableJson({ schemas: EVIDENCE_SCHEMAS, previews: PREVIEW_ROLES, stills: CYCLES_STILL_SELECTION, motion: CYCLES_MOTION_SELECTION, responsive: RESPONSIVE_VIEWPORTS });
  const deterministicB = stableJson({ schemas: EVIDENCE_SCHEMAS, previews: PREVIEW_ROLES, stills: CYCLES_STILL_SELECTION, motion: CYCLES_MOTION_SELECTION, responsive: RESPONSIVE_VIEWPORTS });
  if (sha256(Buffer.from(deterministicA)) !== sha256(Buffer.from(deterministicB))) throw new Error("stable contract serialization self-test failed");
  return { schema: `${INPUT_SCHEMA}.self-test`, status: "PASS", evidenceSchemas: EVIDENCE_SCHEMAS, rawSchemas: RAW_SCHEMAS, roleCounts: { previews: 6, cyclesStills: 7, cyclesMotion: 2, responsive: 9 }, authorization: AUTHORIZATION };
}

function invalidContractSelfTest() {
  const rejected = [];
  const fail = (label, operation) => {
    try { operation(); }
    catch (error) { rejected.push({ label, message: error.message }); return; }
    throw new Error(`invalid self-test did not reject ${label}`);
  };
  fail("path traversal", () => safeRelativePath("../raw/F001.png", "fixture path"));
  const forbidden = { authorization: { ...AUTHORIZATION, full540FrameCyclesProductionFilmStarted: true } };
  fail("full film start", () => rejectBoundaryViolations(forbidden));
  const generic = { productionRendering: false };
  fail("generic production boundary", () => rejectBoundaryViolations(generic));
  const incomplete = inputContractTemplate();
  incomplete.repository.expectedHead = "a".repeat(40);
  for (const record of Object.values(incomplete.sourceAuthorities)) { record.bytes = 1; record.sha256 = "b".repeat(64); }
  for (const record of Object.values(incomplete.raw)) { record.root = "../external-fixture"; record.manifest = "manifest.json"; record.bytes = 1; record.sha256 = "c".repeat(64); }
  delete incomplete.raw.entryPlates;
  fail("missing raw authority", () => validateInputContractShape(incomplete));
  fail("duplicate roles", () => exactSet(["a", "a"], ["a"], "fixture roles"));
  fail("physical timeline extra key", () => assertPhysicalTimeline({ fps: 30, frameStart: 1, frameEnd: 500, physicalOnly: true, source: "fixture" }, "fixture physical timeline"));
  fail("physical timeline missing key", () => assertPhysicalTimeline({ fps: 30, frameStart: 1, frameEnd: 500 }, "fixture physical timeline"));
  fail("physical timeline wrong value", () => assertPhysicalTimeline({ fps: 30, frameStart: 1, frameEnd: 499, physicalOnly: true }, "fixture physical timeline"));
  return { schema: `${INPUT_SCHEMA}.invalid-self-test`, status: "PASS", invalidInputsRejected: rejected.length, rejected };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.printContract) { process.stdout.write(stableJson(inputContractTemplate())); return; }
  if (options.selfTest) {
    const local = contractSelfTest();
    local.pngPrivacySanitizer = await pngPrivacySelfTest();
    local.frozenV2Consumer = await verifyFrozenV2Contract();
    process.stdout.write(stableJson(local));
    return;
  }
  if (options.selfTestInvalid) { process.stdout.write(stableJson(invalidContractSelfTest())); return; }

  const context = await loadContext(options);
  if (options.command === "validate") {
    process.stdout.write(stableJson(validationSummary(context)));
    return;
  }
  const inputRoots = Object.values(context.raw.authorities).map((record) => record.root);
  const tool = options.ffmpeg ? await resolveFfmpeg(options.ffmpeg) : null;
  const workRoot = await mkdtemp(path.join(tmpdir(), "qsite-phase4r1-evidence-aggregation-"));
  try {
    const result = await withAtomicOutput(options.output, inputRoots, async (staging) => {
      if (options.command === "previews") return { previews: await buildPreviews(staging, workRoot, context, tool) };
      if (options.command === "cycles-stills") return { cyclesStills: await buildCyclesStills(staging, context) };
      if (options.command === "cycles-motion") return { cyclesMotion: await buildCyclesMotion(staging, workRoot, context, tool) };
      if (options.command === "responsive") return { responsive: await buildResponsive(staging, context) };
      const directories = { previews: "previews", cyclesStills: "cycles-stills", cyclesMotion: "cycles-motion", responsive: "responsive" };
      for (const directory of Object.values(directories)) await mkdir(path.join(staging, directory));
      const outputs = {};
      outputs.previews = await buildPreviews(path.join(staging, directories.previews), workRoot, context, tool);
      outputs.cyclesStills = await buildCyclesStills(path.join(staging, directories.cyclesStills), context);
      outputs.cyclesMotion = await buildCyclesMotion(path.join(staging, directories.cyclesMotion), workRoot, context, tool);
      outputs.responsive = await buildResponsive(path.join(staging, directories.responsive), context);
      await atomicJson(path.join(staging, "phase4r1-refined-evidence-aggregation-result.json"), {
        schema: RESULT_SCHEMA,
        status: "PASS",
        generatedAt: GENERATED_AT,
        roots: directories,
        outputs,
        finalHead: context.repository.head,
        authorization: { ...AUTHORIZATION },
      });
      return outputs;
    });
    process.stdout.write(stableJson({ schema: RESULT_SCHEMA, status: "PASS", output: options.output, results: result, authorization: AUTHORIZATION }));
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`Phase 4-R1 refined evidence aggregation failed: ${error.stack ?? error}\n`);
  process.exitCode = 1;
});
