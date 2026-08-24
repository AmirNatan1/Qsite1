#!/usr/bin/env node

/**
 * Deterministically assemble the Phase 4-R1 Proving Hall human-review package.
 *
 * This program does not run Blender and cannot authorize a production render.
 * It accepts only manifest-bound external render/capture roots, verifies their
 * bytes, hashes, dimensions, renderer claims, camera telemetry, and licensing,
 * then writes one fresh external package. Raw sequences and the .blend source
 * are never copied into the review ZIP.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  link,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACCEPTED_R0_HEAD = "4fd17810d47697785e66584a7ef40199ff597ba1";
const EXPECTED_BRANCH = "redirect/phase-4r1-proving-hall-environment";
const MAIN_AUTHORITY = "501040c42bba30b9d9517b88a8f9857992a2dba4";
const PHASE4_IMPLEMENTATION_HEAD = "ce7bd0cb61bf4b9abd81303d89c5ac1aef089e0c";
const ACCEPTED_PHASE3_R_HEAD = "2fdee6feb9664578c6c8243d1b80ea885235279f";
const ACCEPTED_PHASE2B_HEAD = "b54f3a83b6180466127589a8d028f94dab892d17";
const ACCEPTED_R0_SOURCE = Object.freeze({
  path: "artifacts/original/phase-4r0-orbit-signal-threshold/source/quantum-signal-television-phase4r0-orbit-signal-threshold.blend",
  bytes: 2_281_798,
  sha256: "838f304a0f029f5570c1ede2b4ce20c7e7475571f1e7e4fb7d6286e5536e72d3",
});
const R0_DERIVATIVE_SHA256 = "838f304a0f029f5570c1ede2b4ce20c7e7475571f1e7e4fb7d6286e5536e72d3";
const Q_REVERSED_SHA256 = "c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff";
const Q_COLOR_SHA256 = "04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9";
const Q_AUTHORITIES = Object.freeze({
  geometry_authority: Object.freeze({ path: "public/brand/quantum-icon-white.svg", bytes: 785, sha256: Q_REVERSED_SHA256 }),
  color_authority: Object.freeze({ path: "public/brand/quantum-icon-color.svg", bytes: 788, sha256: Q_COLOR_SHA256 }),
});
const FRAME_START = 1;
const PHYSICAL_END = 500;
const BLACK_START = 501;
const BLACK_END = 513;
const ENTRY_START = 514;
const FRAME_END = 540;
const FPS = 30;
const FIXED_EPOCH = "1980-01-01T00:00:00.000Z";
const CLASSIFICATION = "PHASE 4-R1 PREPRODUCTION · HUMAN UNACCEPTED · FULL PRODUCTION RENDER NOT AUTHORIZED · PHASE 5 UNAUTHORIZED";
const ARCHIVE_FILENAME = "phase-4r1-proving-hall-environment-review.zip";
const MANIFEST_FILENAME = "phase-4r1-proving-hall-environment-review-manifest.json";
const RESULT_FILENAME = "phase-4r1-proving-hall-environment-review-result.json";
const README_FILENAME = "README.md";
const R1_RENDER_REPORT_SCHEMA = "quantum-hub.phase-4-r1-proving-hall.render-report.v1";
const R1_SOURCE_BUILD_SCHEMA = "quantum-hub.phase-4-r1-proving-hall.source-build.v1";
const R1_SOURCE_VALIDATION_SCHEMA = "quantum-hub.phase-4-r1-proving-hall.source-validation.v1";
const R1_REVIEW_STILLS_SCHEMA = "quantum-hub.phase-4-r1-proving-hall.review-stills.v1";
const R1_CYCLES_BENCHMARKS_SCHEMA = "quantum-hub.phase-4-r1-proving-hall.cycles-benchmarks.v1";
const R1_CYCLES_MOTION_SCHEMA = "quantum-hub.phase-4-r1-proving-hall.cycles-motion.v1";
const R1_SOURCE_DIRECTORY = "artifacts/original/phase-4r1-proving-hall-environment/source";
const R1_PRODUCER_PATHS = Object.freeze({
  config: `${R1_SOURCE_DIRECTORY}/phase4r1_config.py`,
  builder: `${R1_SOURCE_DIRECTORY}/build_phase4r1_proving_hall.py`,
  validator: `${R1_SOURCE_DIRECTORY}/validate_phase4r1_source.py`,
  preflight: `${R1_SOURCE_DIRECTORY}/preflight_phase4r1_geometry.py`,
  preproduction_renderer: `${R1_SOURCE_DIRECTORY}/render_phase4r1_preproduction.py`,
  review_stills_renderer: `${R1_SOURCE_DIRECTORY}/render_phase4r1_review_stills.py`,
  cycles_benchmarks_renderer: `${R1_SOURCE_DIRECTORY}/render_phase4r1_cycles_benchmarks.py`,
});
const FAMILIES = Object.freeze(["desktop", "mobile", "landscape"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv", ".svg"]);

const OUTPUT_DIMENSIONS = Object.freeze({
  desktop: Object.freeze([1440, 900]),
  mobile: Object.freeze([390, 844]),
  landscape: Object.freeze([844, 390]),
});

const TIMELINE = Object.freeze({
  fps: FPS,
  frameStart: FRAME_START,
  frameEnd: FRAME_END,
  states: Object.freeze([
    { id: "dormancy", label: "Distant proving-hall dormancy", start: 1, end: 45 },
    { id: "conduction-orbit", label: "Conduction + full orbit", start: 46, end: 285 },
    { id: "crt-activation", label: "CRT activation", start: 286, end: 355 },
    { id: "q-hold", label: "Q hold", start: 356, end: 405 },
    { id: "frontal-approach", label: "Frontal approach", start: 406, end: 480 },
    { id: "physical-threshold", label: "Physical threshold", start: 481, end: 500 },
    { id: "breathing-beat", label: "Breathing beat", start: 501, end: 513 },
    { id: "entry-resolution", label: "ENTRY resolution", start: 514, end: 540 },
  ]),
  events: Object.freeze({
    dormancyEnd: 45,
    conductionStart: 46,
    conduction10: 70,
    conduction25: 106,
    conduction50: 165,
    conduction75: 225,
    conduction90: 261,
    arrival: 285,
    indicator: 292,
    q: 370,
    qHoldEnd: 405,
    push: 406,
    lateApproach: 460,
    portal: 500,
    blackStart: 501,
    blackEnd: 513,
    entryStart: 514,
    entrySettled: 540,
  }),
});

const RESPONSIVE_VIEWPORTS = Object.freeze([
  { id: "mobile-390x844", plateId: "mobile-390x844", width: 390, height: 844, family: "mobile", physicalFit: "cover", physicalPosition: "center", provisional: false },
  { id: "mobile-360x800", plateId: "mobile-360x800", width: 360, height: 800, family: "mobile", physicalFit: "cover", physicalPosition: "center", provisional: false },
  { id: "narrow-320x800", plateId: "narrow-320x800", width: 320, height: 800, family: "mobile", physicalFit: "cover", physicalPosition: "center", provisional: false },
  { id: "tablet-portrait-768x1024", plateId: "tablet-portrait-768x1024", width: 768, height: 1024, family: "mobile", physicalFit: "contain", physicalPosition: "center", provisional: true },
  { id: "landscape-844x390", plateId: "mobile-landscape-844x390", width: 844, height: 390, family: "landscape", physicalFit: "cover", physicalPosition: "center", provisional: false },
  { id: "landscape-740x360", plateId: "short-landscape-neighbor-740x360", width: 740, height: 360, family: "landscape", physicalFit: "cover", physicalPosition: "center", provisional: false },
  { id: "landscape-800x360", plateId: "short-landscape-neighbor-800x360", width: 800, height: 360, family: "landscape", physicalFit: "cover", physicalPosition: "center", provisional: false },
  { id: "landscape-896x414", plateId: "short-landscape-neighbor-896x414", width: 896, height: 414, family: "landscape", physicalFit: "cover", physicalPosition: "center", provisional: false },
  { id: "landscape-900x480", plateId: "short-landscape-neighbor-900x480", width: 900, height: 480, family: "landscape", physicalFit: "cover", physicalPosition: "center", provisional: false },
]);

const REQUIRED_ENTRY_CHECKS = Object.freeze([
  "exactlyOneDocumentH1", "exactlyOneEntryH1", "h1TextMatches", "entryLabelOwnsH1",
  "exactlyTwoEntryRoutes", "routePathsMatch", "routeNamesPresent", "acceptedFontsLoaded",
  "semanticContentVisible", "semanticContentInteractive", "semanticHorizontalFit",
  "semanticVerticalFit", "noRootHorizontalOverflow", "entryHorizontalOverflowContained",
]);

const REVIEW_STILL_ROLES = Object.freeze({
  environment: Object.freeze(["front", "left", "rear", "right", "overhead", "camera-opening", "crt-level", "power-source-closeup"]),
  "cable-source": Object.freeze(["infrastructure-conduit", "distribution-enclosure", "socket", "plug", "strain-relief", "floor-transition", "full-route", "rear-crt-connection"]),
  material: Object.freeze(["concrete-floor", "structural-steel", "power-cabinet", "plug", "cable-sheath", "energized-cable", "test-fixture", "crt-environment-interaction"]),
});

const CYCLES_STILL_ROLES = Object.freeze([
  { id: "desktop-dormant-wide", cycles: true, family: "desktop", frame: 1, desktopHero: true },
  { id: "desktop-early-current", cycles: true, family: "desktop", frame: 76, desktopHero: true },
  { id: "desktop-mid-conduction", cycles: true, family: "desktop", frame: 165, desktopHero: true },
  { id: "desktop-side-back-orbit", cycles: true, family: "desktop", frame: 195, desktopHero: true },
  { id: "desktop-q-activation", cycles: true, family: "desktop", frame: 370, desktopHero: true },
  { id: "desktop-late-approach", cycles: true, family: "desktop", frame: 460, desktopHero: true },
  { id: "mobile-mid-conduction", cycles: true, family: "mobile", frame: 165, portrait: true },
  { id: "landscape-entry-regression", semantic: true, family: "landscape", frame: null, width: 844, height: 390 },
]);

const MOTION_SAMPLE_ROLES = Object.freeze([
  { id: "current-proving-hall", label: "Current in the proving hall" },
  { id: "q-threshold", label: "Q and threshold" },
]);

function argumentValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArguments(argv) {
  const options = {
    desktopFrames: null,
    mobileFrames: null,
    landscapeFrames: null,
    r0DesktopFrames: null,
    entryPlates: null,
    reviewStills: null,
    cyclesStills: null,
    cyclesMotion: null,
    derivative: null,
    sourceBuildReport: null,
    sourceValidationReport: null,
    assetLedger: null,
    output: null,
    ffmpeg: process.env.FFMPEG_PATH ?? null,
    help: false,
    mediaPrivacySelfTest: false,
    mediaPrivacyFixture: null,
  };
  const flags = new Map([
    ["--desktop-frames", "desktopFrames"],
    ["--mobile-frames", "mobileFrames"],
    ["--landscape-frames", "landscapeFrames"],
    ["--r0-desktop-frames", "r0DesktopFrames"],
    ["--entry-plates", "entryPlates"],
    ["--review-stills", "reviewStills"],
    ["--cycles-stills", "cyclesStills"],
    ["--cycles-motion", "cyclesMotion"],
    ["--derivative", "derivative"],
    ["--source-build-report", "sourceBuildReport"],
    ["--source-validation-report", "sourceValidationReport"],
    ["--asset-ledger", "assetLedger"],
    ["--output", "output"],
    ["--ffmpeg", "ffmpeg"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (flags.has(value)) {
      const key = flags.get(value);
      const supplied = argumentValue(argv, index, value);
      options[key] = key === "ffmpeg" && !/[\\/]/.test(supplied) ? supplied : path.resolve(supplied);
      index += 1;
    } else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--self-test-media-privacy") {
      options.mediaPrivacySelfTest = true;
      const fixture = argv[index + 1];
      if (fixture && !fixture.startsWith("--")) {
        options.mediaPrivacyFixture = path.resolve(fixture);
        index += 1;
      }
    }
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (options.help || options.mediaPrivacySelfTest) return options;
  for (const [key, flag] of flags.entries()) {
    if (flag === "ffmpeg") continue;
    if (!options[flag]) throw new Error(`${key} is required`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 4-R1 Proving Hall deterministic review packager

Usage:
  node scripts/package-phase4r1-proving-hall-review.mjs --self-test-media-privacy [media-file] [--ffmpeg <executable>]

or:
  node scripts/package-phase4r1-proving-hall-review.mjs \\
    --desktop-frames <external PASS Eevee F001-F500 root> \\
    --mobile-frames <external PASS Eevee F001-F500 root> \\
    --landscape-frames <external PASS Eevee F001-F500 root> \\
    --r0-desktop-frames <external authenticated R0 desktop root> \\
    --entry-plates <external PASS semantic ENTRY plate root> \\
    --review-stills <external PASS overview/source/material still root> \\
    --cycles-stills <external PASS Cycles benchmark still root> \\
    --cycles-motion <external PASS Cycles sample root> \\
    --derivative <Phase 4-R1 .blend> \\
    --source-build-report <Phase 4-R1 PASS JSON> \\
    --source-validation-report <Phase 4-R1 PASS JSON> \\
    --asset-ledger <Phase 4-R1 PASS JSON> \\
    --output <fresh external phase4r1 root> [--ffmpeg <executable>]

All render/capture roots and output must be external, distinct, and non-nested.
Input manifests must bind every consumed file by relative path, bytes and
SHA-256. The output basename must clearly contain phase4r1. The tool creates
${ARCHIVE_FILENAME}; it never includes raw frames, EXRs, caches, or Blender files.
`);
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(parent, candidate) {
  const relative = path.relative(normalizedPath(parent), normalizedPath(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function round(value, digits = 6) {
  return Number(Number(value).toFixed(digits));
}

function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : NaN;
}

function validHash(value) {
  return /^[a-f0-9]{64}$/i.test(String(value ?? ""));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filename) {
  return sha256(await readFile(filename));
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveFromExistingAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const missing = [];
  for (;;) {
    try {
      return path.join(await realpath(cursor), ...missing.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function assertFile(candidate, label) {
  const resolved = await realpath(candidate);
  if (!(await stat(resolved)).isFile()) throw new Error(`${label} must be a file`);
  return resolved;
}

async function assertTrackedR1SourceFile(candidate, label) {
  const resolved = await assertFile(candidate, label);
  if (!isWithin(path.join(ROOT, "artifacts", "original", "phase-4r1-proving-hall-environment"), resolved)) {
    throw new Error(`${label} must be inside the isolated tracked Phase 4-R1 source directory`);
  }
  const relative = path.relative(ROOT, resolved).replaceAll("\\", "/");
  const tracked = await runGit(["ls-files", "--error-unmatch", "--", relative]);
  if (tracked.replaceAll("\\", "/") !== relative) throw new Error(`${label} is not the exact tracked R1 authority`);
  return resolved;
}

async function assertExternalDirectory(candidate, label) {
  const resolved = await realpath(candidate);
  if (!(await stat(resolved)).isDirectory()) throw new Error(`${label} must be a directory`);
  if (isWithin(ROOT, resolved)) throw new Error(`${label} must resolve outside the repository`);
  return resolved;
}

async function validateFreshExternalOutput(output, roots) {
  if (!/phase[-_]?4r1|phase[-_]?4[-_]?r1/i.test(path.basename(output))) {
    throw new Error("--output basename must clearly contain phase4r1");
  }
  if (await pathExists(output)) throw new Error("--output already exists; select a fresh external root");
  const resolved = await resolveFromExistingAncestor(output);
  if (isWithin(ROOT, resolved)) throw new Error("--output must resolve outside the repository");
  for (const root of roots) {
    if (isWithin(root, resolved) || isWithin(resolved, root)) throw new Error("--output must not overlap an input root");
  }
}

function stableGeneratedAt() {
  if (!process.env.SOURCE_DATE_EPOCH) return FIXED_EPOCH;
  const seconds = Number(process.env.SOURCE_DATE_EPOCH);
  if (!Number.isInteger(seconds) || seconds < 315532800) throw new Error("SOURCE_DATE_EPOCH must be a valid ZIP-era Unix timestamp");
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 2107) throw new Error("SOURCE_DATE_EPOCH exceeds classic ZIP range");
  return date.toISOString();
}

async function atomicWrite(destination, bytes) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes);
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function atomicJson(destination, value) {
  await atomicWrite(destination, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(filename, label) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function pass(report, label) {
  if (String(report?.status ?? report?.result?.status ?? "").toUpperCase() !== "PASS") throw new Error(`${label} must state PASS`);
}

async function listFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => lexicalCompare(left.name, right.name))) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, next));
    else if (entry.isFile()) files.push(next.replaceAll("\\", "/"));
  }
  return files;
}

function frameNumber(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return null;
  const stem = path.basename(filename, extension);
  const explicit = stem.match(/(?:^|[^a-z0-9])f(?:rame)?[-_ ]*0*(\d{1,6})(?:$|[^0-9])/i);
  if (explicit) return Number(explicit[1]);
  const trailing = stem.match(/(?:^|[^0-9])0*(\d{1,6})$/);
  return trailing ? Number(trailing[1]) : null;
}

async function safeManifestFile(root, record, label) {
  if (!record || typeof record.path !== "string" || !Number.isInteger(record.bytes) || record.bytes <= 0 || !validHash(record.sha256)) {
    throw new Error(`${label} lacks relative path/bytes/SHA-256 authority`);
  }
  if (path.isAbsolute(record.path)) throw new Error(`${label} path must be relative`);
  const declared = path.resolve(root, ...record.path.replaceAll("\\", "/").split("/"));
  if (!isWithin(root, declared) || !(await pathExists(declared))) throw new Error(`${label} is missing or escapes its root`);
  const filename = await realpath(declared);
  if (!isWithin(root, filename)) throw new Error(`${label} resolves outside its root`);
  const data = await readFile(filename);
  if (data.length !== record.bytes || sha256(data).toLowerCase() !== String(record.sha256).toLowerCase()) {
    throw new Error(`${label} does not match declared bytes/SHA-256`);
  }
  return { filename, data, record: { ...record, sha256: String(record.sha256).toLowerCase() } };
}

async function findSingleManifest(root, matcher, label) {
  const candidates = (await listFiles(root)).filter((filename) => matcher.test(filename));
  if (candidates.length !== 1) throw new Error(`${label} root must contain exactly one matching manifest; found ${candidates.join(", ") || "none"}`);
  const filename = path.join(root, ...candidates[0].split("/"));
  return { filename, value: await readJson(filename, label), bytes: await readFile(filename) };
}

async function runGit(args) {
  const result = await execFileAsync("git", args, { cwd: ROOT, windowsHide: true, maxBuffer: 8_000_000 });
  return String(result.stdout).trim();
}

async function repositoryState() {
  const [head, branch, porcelain, localMain, originMain, r0Local, r0Origin, phase4Local, phase4Origin] = await Promise.all([
    runGit(["rev-parse", "HEAD"]),
    runGit(["branch", "--show-current"]),
    runGit(["status", "--porcelain=v1"]),
    runGit(["rev-parse", "main"]),
    runGit(["rev-parse", "origin/main"]),
    runGit(["rev-parse", "redirect/phase-4r-orbit-signal-threshold"]),
    runGit(["rev-parse", "origin/redirect/phase-4r-orbit-signal-threshold"]),
    runGit(["rev-parse", "feature/phase-4-full-cinematic-integration"]),
    runGit(["rev-parse", "origin/feature/phase-4-full-cinematic-integration"]),
  ]);
  if (branch !== EXPECTED_BRANCH) throw new Error(`packaging must run on ${EXPECTED_BRANCH}; current branch is ${branch}`);
  if (porcelain) throw new Error("packaging requires a clean repository worktree/index");
  if (localMain !== MAIN_AUTHORITY || originMain !== MAIN_AUTHORITY) throw new Error("local/origin main moved from its protected authority");
  if (r0Local !== ACCEPTED_R0_HEAD || r0Origin !== ACCEPTED_R0_HEAD) throw new Error("the Phase 4-R0 branch was modified");
  if (phase4Local !== PHASE4_IMPLEMENTATION_HEAD || phase4Origin !== PHASE4_IMPLEMENTATION_HEAD) throw new Error("the existing Phase 4 implementation branch was modified");
  await runGit(["merge-base", "--is-ancestor", ACCEPTED_R0_HEAD, head]);
  await runGit(["merge-base", "--is-ancestor", ACCEPTED_PHASE3_R_HEAD, head]);
  await runGit(["merge-base", "--is-ancestor", ACCEPTED_PHASE2B_HEAD, head]);
  const commits = (await runGit(["rev-list", "--reverse", `${ACCEPTED_R0_HEAD}..${head}`])).split(/\r?\n/).filter(Boolean);
  if (!commits.length) throw new Error("R1 HEAD must contain at least one commit beyond the R0 authority");
  const firstParent = await runGit(["rev-parse", `${commits[0]}^`]);
  if (firstParent !== ACCEPTED_R0_HEAD) throw new Error("the first R1 commit is not parented directly by the accepted R0 HEAD");

  async function treeBytes(revision) {
    const output = await runGit(["ls-tree", "-r", "-l", revision]);
    let total = 0;
    let files = 0;
    for (const line of output.split(/\r?\n/).filter(Boolean)) {
      const match = line.match(/^\d+\s+blob\s+[a-f0-9]+\s+(\d+)\t/);
      if (!match) continue;
      total += Number(match[1]);
      files += 1;
    }
    return { revision, files, bytes: total };
  }
  const [before, after] = await Promise.all([treeBytes(ACCEPTED_R0_HEAD), treeBytes(head)]);
  const changedPaths = (await runGit(["diff", "--name-only", "-z", `${ACCEPTED_R0_HEAD}..${head}`]))
    .split("\0").filter(Boolean).map((value) => value.replaceAll("\\", "/")).sort(lexicalCompare);
  const allowedR1Source = "artifacts/original/phase-4r1-proving-hall-environment/";
  const allowedPackager = "scripts/package-phase4r1-proving-hall-review.mjs";
  const unexpectedScope = changedPaths.filter((value) => !value.startsWith(allowedR1Source) && value !== allowedPackager);
  if (unexpectedScope.length) throw new Error(`R1 preproduction changed files outside its isolated source/packager scopes: ${unexpectedScope.join(", ")}`);
  const prohibitedTrackedMedia = changedPaths.filter((value) => /\.(?:png|jpe?g|webp|gif|bmp|tga|tif|tiff|exr|hdr|mp4|mov|mkv|webm|avi|m4v|mp3|wav|flac|aac|ogg|fbx|obj|mtl|usd[acz]?|gltf|glb|abc|vdb|bphys|cache|zip|7z|rar|blend\d+|pyc|tmp|bak)$/i.test(value));
  if (prohibitedTrackedMedia.length) throw new Error(`R1 preproduction committed forbidden render/archive/cache media: ${prohibitedTrackedMedia.join(", ")}`);
  const unsupportedTrackedTypes = changedPaths.filter((value) => !/\.(?:py|mjs|json|md|blend)$/i.test(value));
  if (unsupportedTrackedTypes.length) throw new Error(`R1 preproduction tracked unsupported file types: ${unsupportedTrackedTypes.join(", ")}`);
  const changedBlends = changedPaths.filter((value) => /\.blend$/i.test(value));
  if (changedBlends.length !== 1 || path.basename(changedBlends[0]) !== "quantum-signal-television-phase4r1-proving-hall.blend") {
    throw new Error("R1 must track exactly one new canonical Proving Hall Blender derivative and no variants");
  }
  const upstreamRef = await runGit(["rev-parse", "--symbolic-full-name", "@{upstream}"]);
  if (upstreamRef !== `refs/remotes/origin/${EXPECTED_BRANCH}`) throw new Error(`R1 upstream must be origin/${EXPECTED_BRANCH}`);
  const [upstreamHead, namedRemoteHead] = await Promise.all([
    runGit(["rev-parse", "@{upstream}"]),
    runGit(["rev-parse", `origin/${EXPECTED_BRANCH}`]),
  ]);
  if (upstreamHead !== head) throw new Error("local R1 HEAD and its cached upstream tracking ref are not at parity");
  if (namedRemoteHead !== head) throw new Error("cached origin R1 branch and local HEAD are not at parity");
  return {
    status: "PASS",
    branch,
    head,
    exactRootParent: ACCEPTED_R0_HEAD,
    firstR1Commit: commits[0],
    firstR1CommitParent: firstParent,
    clean: true,
    parity: { localHead: head, upstreamRef, upstreamHead, namedRemoteHead, cachedTrackingRefParity: true },
    ancestry: {
      phase4R0: { revision: ACCEPTED_R0_HEAD, intact: true },
      phase3R: { revision: ACCEPTED_PHASE3_R_HEAD, intact: true },
      phase2B: { revision: ACCEPTED_PHASE2B_HEAD, intact: true },
    },
    protectedRefs: {
      main: { local: localMain, origin: originMain, expected: MAIN_AUTHORITY, unchanged: true },
      phase4R0: { local: r0Local, origin: r0Origin, expected: ACCEPTED_R0_HEAD, unchanged: true },
      phase4Implementation: { local: phase4Local, origin: phase4Origin, expected: PHASE4_IMPLEMENTATION_HEAD, unchanged: true },
    },
    repositorySize: { before, after, deltaBytes: after.bytes - before.bytes, deltaFiles: after.files - before.files, changedPaths },
  };
}

function exactAuthority(record, expected, label) {
  if (!record || record.path !== expected.path || record.bytes !== expected.bytes
    || String(record.sha256 ?? "").toLowerCase() !== expected.sha256) {
    throw new Error(`${label} does not match its exact path/bytes/SHA-256 authority`);
  }
}

async function currentTrackedAuthority(relativePath, label) {
  const filename = await assertTrackedR1SourceFile(path.join(ROOT, ...relativePath.split("/")), label);
  const data = await readFile(filename);
  return { path: relativePath, bytes: data.length, sha256: sha256(data) };
}

function exactAuthorityMap(record, expected, keys, label) {
  if (!record || Object.keys(record).sort(lexicalCompare).join(",") !== [...keys].sort(lexicalCompare).join(",")) {
    throw new Error(`${label} must contain exactly ${keys.join(", ")}`);
  }
  for (const key of keys) exactAuthority(record[key], expected[key], `${label} ${key}`);
}

function exactQuantumAuthority(report, label) {
  const quantum = report?.quantum_q;
  if (!quantum) throw new Error(`${label} lacks exact quantum_q provenance`);
  exactAuthority(quantum.geometry_authority, Q_AUTHORITIES.geometry_authority, `${label} Quantum Q geometry`);
  exactAuthority(quantum.color_authority, Q_AUTHORITIES.color_authority, `${label} Quantum Q colour`);
  if (quantum.accepted_r0_q_root !== "Phase4R0_ApprovedQuantumQ_Root"
    || quantum.geometry_or_animation_changed_in_r1 !== false
    || quantum.isolated_from_approved_svg !== true
    || quantum.redrawn_or_approximated !== false
    || quantum.qfund_or_third_party_logo_used !== false) {
    throw new Error(`${label} must prove the accepted R0 Q was isolated from the exact approved SVG without redraw, approximation, qFund, or third-party substitution`);
  }
}

function assertEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length !== 0) throw new Error(`${label} must be an explicit empty array`);
}

function assertResponsiveMeasurementPayload(measurements, label) {
  if (!measurements || measurements.status !== "PASS"
    || measurements.policy_status !== "PROPOSED_PREPRODUCTION_NOT_ACCEPTED_RUNTIME_BEHAVIOR"
    || measurements.mobile_family_remains_authoritative_at_768x1024 !== true
    || !/contain/i.test(String(measurements.tablet_portrait_reason ?? ""))
    || !/deep physical black/i.test(String(measurements.tablet_portrait_reason ?? ""))
    || !/crop/i.test(String(measurements.tablet_portrait_reason ?? ""))) {
    throw new Error(`${label} must remain PASS, explicit, provisional, and honest about the contained tablet mapping`);
  }
  const expectedMappings = {
    "mobile-390x844": { target: [390, 844], fit: "cover" },
    "mobile-360x800": { target: [360, 800], fit: "cover" },
    "narrow-320x800": { target: [320, 800], fit: "cover" },
    "tablet-portrait-768x1024": { target: [768, 1024], fit: "contain" },
  };
  if (!measurements.mappings
    || Object.keys(measurements.mappings).sort(lexicalCompare).join(",") !== Object.keys(expectedMappings).sort(lexicalCompare).join(",")) {
    throw new Error(`${label} must contain exactly the four required mobile/tablet mappings`);
  }
  const finiteArray = (value, count) => Array.isArray(value) && value.length === count
    && value.every((item) => Number.isFinite(numeric(item)));
  const closeArray = (actual, expected, tolerance = 1e-6) => finiteArray(actual, expected.length)
    && actual.every((value, index) => Math.abs(numeric(value) - numeric(expected[index])) <= tolerance);
  const finiteBounds = (value) => finiteArray(value, 4) && numeric(value[2]) > numeric(value[0]) && numeric(value[3]) > numeric(value[1]);
  const cameraMeasured = (camera) => Array.isArray(camera?.matrix_world) && camera.matrix_world.length === 4
    && camera.matrix_world.every((row) => finiteArray(row, 4)) && numeric(camera.lens_mm) > 0
    && Number.isFinite(numeric(camera.shift_x)) && Number.isFinite(numeric(camera.shift_y));
  for (const [mappingId, expected] of Object.entries(expectedMappings)) {
    const mapping = measurements.mappings[mappingId];
    const source = [390, 844];
    const target = expected.target;
    const scale = (expected.fit === "cover" ? Math.max : Math.min)(target[0] / source[0], target[1] / source[1]);
    const display = [source[0] * scale, source[1] * scale];
    const offset = [(target[0] - display[0]) / 2, (target[1] - display[1]) / 2];
    const expectedNativeSafeRect = [
      (0.04 * target[0] - offset[0]) / display[0],
      (0.04 * target[1] - offset[1]) / display[1],
      (0.96 * target[0] - offset[0]) / display[0],
      (0.96 * target[1] - offset[1]) / display[1],
    ];
    if (!mapping || mapping.status !== "PASS" || mapping.safe !== true || mapping.family !== "mobile"
      || mapping.fit !== expected.fit || mapping.position !== "center"
      || !closeArray(mapping.source_resolution, source, 0) || !closeArray(mapping.target_resolution, target, 0)
      || !closeArray(mapping.safe_rect_normalized, [0.04, 0.04, 0.96, 0.96])
      || mapping.geometry?.fit !== expected.fit || mapping.geometry?.position !== "center"
      || !closeArray(mapping.geometry?.source_resolution, source, 0) || !closeArray(mapping.geometry?.target_resolution, target, 0)
      || Math.abs(numeric(mapping.geometry?.scale) - scale) > 1e-6
      || !closeArray(mapping.geometry?.display_size_px, display)
      || !closeArray(mapping.geometry?.offset_px, offset)
      || !closeArray(mapping.native_safe_rect_equivalent, expectedNativeSafeRect)) {
      throw new Error(`${mappingId} responsive physical fit geometry does not match its exact measured ${expected.fit}/center policy`);
    }
    const frames = mapping.frames;
    if (!frames || Object.keys(frames).sort(lexicalCompare).join(",") !== "1,165,370,500"
      || Object.values(frames).some((frame) => frame?.status !== "PASS" || frame?.safe !== true || !cameraMeasured(frame.camera))) {
      throw new Error(`${mappingId} must contain measured PASS/safe F1, F165, F370, and F500 records`);
    }
    const f1 = frames["1"];
    const f1Route = f1.subjects?.route;
    const viewportVisibleLength = numeric(f1Route?.visible_length_in_target_viewport_m);
    const viewportVisibleFraction = numeric(f1Route?.visible_fraction_in_target_viewport);
    const requiredViewportFraction = numeric(f1Route?.required_visible_fraction_in_target_viewport);
    const safeRectVisibleLength = numeric(f1Route?.visible_length_in_target_safe_rect_m);
    const safeRectVisibleFraction = numeric(f1Route?.visible_fraction_in_target_safe_rect);
    if (f1.state !== "distant-dormancy-source-route-crt"
      || f1.subjects?.complete_source?.safe !== true || !finiteBounds(f1.subjects.complete_source.target_bounds)
      || f1.subjects?.crt?.safe !== true || !finiteBounds(f1.subjects.crt.target_bounds)
      || f1Route?.safe !== true || !finiteBounds(f1Route.target_bounds)
      || !Number.isFinite(viewportVisibleLength) || viewportVisibleLength <= 0
      || !Number.isFinite(viewportVisibleFraction) || viewportVisibleFraction < requiredViewportFraction || viewportVisibleFraction > 1
      || requiredViewportFraction !== 0.90
      || !Number.isFinite(safeRectVisibleLength) || safeRectVisibleLength <= 0
      || !Number.isFinite(safeRectVisibleFraction) || safeRectVisibleFraction < 0 || safeRectVisibleFraction > 1) {
      throw new Error(`${mappingId} F1 must keep the complete source/CRT safe and at least 90% of the route visible in the target viewport while disclosing inset-safe-rect metrics`);
    }
    const f165 = frames["165"];
    if (f165.state !== "mid-conduction" || f165.subjects?.crt?.safe !== true
      || f165.subjects?.active_front?.safe !== true || numeric(f165.subjects.active_front.visible_fraction) < 0.95
      || f165.subjects?.contiguous_trailing?.safe !== true || numeric(f165.subjects.contiguous_trailing.visible_fraction) < 0.70
      || numeric(f165.subjects.contiguous_trailing.visible_length_m) < 3.5
      || f165.subjects?.energized_prefix?.safe !== true || numeric(f165.subjects.energized_prefix.visible_fraction) < 0.40
      || numeric(f165.subjects.energized_prefix.visible_length_m) < 3.5) {
      throw new Error(`${mappingId} F165 must measure a safe CRT, active front, contiguous trail, and energized-prefix context`);
    }
    const f370 = frames["370"];
    if (f370.state !== "stable-quantum-q" || f370.subjects?.verified_q?.safe !== true
      || !finiteBounds(f370.subjects.verified_q.target_bounds)
      || f370.subjects?.physical_glass?.intersects !== true || !finiteBounds(f370.subjects.physical_glass.target_bounds)) {
      throw new Error(`${mappingId} F370 must keep the verified Q safe within intersecting physical CRT glass`);
    }
    const f500 = frames["500"];
    const physicalGlass = f500.subjects?.physical_glass;
    const thresholdCrossed = physicalGlass?.physical_surface_crossed_or_behind_camera;
    const thresholdCovered = physicalGlass?.covers_required_displayed_content_rect;
    const crossedBranch = thresholdCrossed === true && thresholdCovered === false && physicalGlass?.target_bounds === null;
    const coveringBranch = thresholdCrossed === false && thresholdCovered && finiteBounds(physicalGlass?.target_bounds);
    if (f500.state !== "physical-threshold"
      || !(crossedBranch || coveringBranch)
      || !finiteBounds(physicalGlass?.required_displayed_content_rect)
      || f500.deep_physical_black_outside_contained_panel !== (expected.fit === "contain")) {
      throw new Error(`${mappingId} F500 must prove either a crossed physical surface with null bounds or physical glass covering the required displayed-content rect, and disclose contained black`);
    }
  }
  return measurements;
}

function assertResponsivePhysicalFitMeasurements(buildMeasurements, validationMeasurements, reportedDigests) {
  const buildPayload = assertResponsiveMeasurementPayload(buildMeasurements, "source-build responsive physical fit authority");
  const validationPayload = assertResponsiveMeasurementPayload(validationMeasurements, "independent source-validation responsive physical fit authority");
  if (buildPayload.independently_resampled_from_saved_derivative !== undefined || buildPayload.source_build_payload_sha256 !== undefined) {
    throw new Error("source-build responsive physical fit authority must remain the primary measured payload, not claim independent validation");
  }
  const buildPayloadSha256 = String(reportedDigests?.build ?? "").toLowerCase();
  const validationPayloadSha256 = String(reportedDigests?.validation ?? "").toLowerCase();
  if (validationPayload.independently_resampled_from_saved_derivative !== true
    || String(validationPayload.source_build_payload_sha256 ?? "").toLowerCase() !== buildPayloadSha256
    || String(reportedDigests?.validationBuild ?? "").toLowerCase() !== buildPayloadSha256
    || !validHash(buildPayloadSha256) || !validHash(validationPayloadSha256)) {
    throw new Error("source validation must independently resample the saved derivative and hash-bind the exact source-build responsive payload");
  }
  return { sourceBuild: buildPayload, independentValidation: validationPayload, sourceBuildPayloadSha256: buildPayloadSha256, independentValidationPayloadSha256: validationPayloadSha256 };
}

function assertLandscapeResponsiveCoverBounds(openingMeasurements) {
  const measurement = openingMeasurements?.landscape;
  const source = measurement?.resolution;
  const hulls = measurement?.projected_hulls;
  if (!Array.isArray(source) || source[0] !== 844 || source[1] !== 390 || !hulls) {
    throw new Error("landscape responsive cover requires measured 844x390 opening hull authority");
  }
  const viewports = RESPONSIVE_VIEWPORTS.filter((viewport) => viewport.family === "landscape");
  const requiredHullNames = ["station", "plug", "source_lead", "spiral", "crt"];
  if (numeric(measurement.frustum_visible_cable_fraction) < 0.90) {
    throw new Error("landscape authored opening must retain at least 90% measured route visibility before responsive cover");
  }
  const results = {};
  for (const viewport of viewports) {
    const scale = Math.max(viewport.width / source[0], viewport.height / source[1]);
    const display = [source[0] * scale, source[1] * scale];
    const offset = [(viewport.width - display[0]) / 2, (viewport.height - display[1]) / 2];
    const transformed = {};
    for (const name of requiredHullNames) {
      const bounds = hulls[name]?.bounds;
      if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every((value) => Number.isFinite(numeric(value)))) {
        throw new Error(`${viewport.id} lacks measured ${name} opening bounds`);
      }
      const targetBounds = [
        (numeric(bounds[0]) * display[0] + offset[0]) / viewport.width,
        (numeric(bounds[1]) * display[1] + offset[1]) / viewport.height,
        (numeric(bounds[2]) * display[0] + offset[0]) / viewport.width,
        (numeric(bounds[3]) * display[1] + offset[1]) / viewport.height,
      ];
      const fullyInside = targetBounds[0] >= -1e-6 && targetBounds[1] >= -1e-6
        && targetBounds[2] <= 1 + 1e-6 && targetBounds[3] <= 1 + 1e-6;
      const intersects = targetBounds[2] >= 0 && targetBounds[0] <= 1 && targetBounds[3] >= 0 && targetBounds[1] <= 1;
      const nativeVerticalClip = Math.max(0, -numeric(bounds[1])) + Math.max(0, numeric(bounds[3]) - 1);
      const targetVerticalClip = Math.max(0, -targetBounds[1]) + Math.max(0, targetBounds[3] - 1);
      const routeLikeSafe = intersects && targetBounds[0] >= -1e-6 && targetBounds[2] <= 1 + 1e-6
        && targetVerticalClip <= nativeVerticalClip + 0.02 + 1e-6;
      if (["station", "plug", "crt"].includes(name) ? !fullyInside : !routeLikeSafe) {
        throw new Error(`${viewport.id} center-cover introduces unsafe clipping in the measured F1 ${name} bounds`);
      }
      transformed[name] = targetBounds.map((value) => round(value, 8));
    }
    results[viewport.id] = { fit: "cover", position: "center", sourceResolution: source, targetResolution: [viewport.width, viewport.height], transformedF1Hulls: transformed, safe: true };
  }
  return results;
}

async function resolveSourceAuthorities(options) {
  const derivative = await assertTrackedR1SourceFile(options.derivative, "--derivative");
  if (path.extname(derivative).toLowerCase() !== ".blend") throw new Error("--derivative must be a .blend file");
  const derivativeData = await readFile(derivative);
  const derivativeAuthority = {
    basename: path.basename(derivative),
    bytes: derivativeData.length,
    sha256: sha256(derivativeData),
  };
  if (!/phase4r1-proving-hall/i.test(derivativeAuthority.basename)) throw new Error("the derivative basename must identify Phase 4-R1 Proving Hall");

  const sourceBuildPath = await assertTrackedR1SourceFile(options.sourceBuildReport, "--source-build-report");
  const sourceValidationPath = await assertTrackedR1SourceFile(options.sourceValidationReport, "--source-validation-report");
  const [buildBytes, validationBytes] = await Promise.all([readFile(sourceBuildPath), readFile(sourceValidationPath)]);
  const build = JSON.parse(buildBytes);
  const validation = JSON.parse(validationBytes);
  pass(build, "source build report");
  pass(validation, "source validation report");
  if (build.schema !== R1_SOURCE_BUILD_SCHEMA) throw new Error("source build report uses the wrong exact schema");
  const producerAuthorities = Object.fromEntries(await Promise.all(Object.entries(R1_PRODUCER_PATHS).map(async ([key, relativePath]) => [
    key,
    await currentTrackedAuthority(relativePath, `current ${key} producer`),
  ])));
  exactAuthorityMap(build.producer_authorities, producerAuthorities, ["config", "builder"], "source build producer_authorities");
  exactAuthorityMap(validation.producer_authorities, producerAuthorities, Object.keys(R1_PRODUCER_PATHS), "source validation producer_authorities");
  if (validation.schema !== R1_SOURCE_VALIDATION_SCHEMA || validation.check_count !== 68
    || validation.failed_count !== 0 || !Array.isArray(validation.checks) || validation.checks.length !== 68) {
    throw new Error("source validation must use the exact Phase 4-R1 schema and report 68/68 passing checks");
  }
  const validationCheckIds = validation.checks.map((check) => check?.id);
  if (validationCheckIds.some((id) => typeof id !== "string" || id.length === 0)
    || new Set(validationCheckIds).size !== 68
    || validation.checks.some((check) => check?.status !== "PASS")) {
    throw new Error("source validation must contain exactly 68 unique named checks, all with status PASS");
  }
  const hardwareChecks = validation.checks.filter((check) => check.id === "source_hardware_chain_continuity");
  if (hardwareChecks.length !== 1 || hardwareChecks[0].status !== "PASS") {
    throw new Error("source validation must contain one passing source_hardware_chain_continuity check");
  }
  const hardwareEvidence = hardwareChecks[0].evidence;
  assertEmptyArray(hardwareEvidence?.missing_objects, "source hardware continuity missing_objects");
  if (hardwareEvidence?.strict_negative_y_axial_order !== true) {
    throw new Error("source hardware continuity must prove strict negative-Y axial order");
  }
  for (const [field, label] of [
    [hardwareEvidence?.maximum_axis_error_m, "maximum_axis_error_m"],
    [hardwareEvidence?.maximum_adjacent_gap_m, "maximum_adjacent_gap_m"],
    [hardwareEvidence?.final_relief_to_cable_exit_error_m, "final_relief_to_cable_exit_error_m"],
  ]) {
    const measured = numeric(field);
    if (!Number.isFinite(measured) || Math.abs(measured) > 1e-6) {
      throw new Error(`source hardware continuity ${label} must be within 1e-6 m of zero`);
    }
  }
  const conduitEvidence = hardwareEvidence?.conduit_to_enclosure;
  if (!conduitEvidence || conduitEvidence.objects_present !== true
    || conduitEvidence.endpoint_inside_enclosure_top !== true
    || conduitEvidence.gland_crosses_enclosure_top !== true) {
    throw new Error("source hardware continuity must prove the conduit and gland physically cross into the enclosure top");
  }
  const facilityFeed = hardwareEvidence?.facility_tray_to_conduit;
  const measuredVector3 = (value) => Array.isArray(value) && value.length === 3
    && value.every((component) => Number.isFinite(numeric(component)));
  const feedGap = numeric(facilityFeed?.feed_to_conduit_gap_m);
  const tangentDot = numeric(facilityFeed?.directed_tangent_dot);
  const tangentAngle = numeric(facilityFeed?.tangent_angle_degrees);
  if (!facilityFeed || facilityFeed.objects_present !== true || facilityFeed.feed_start_inside_tray !== true
    || facilityFeed.all_hangers_attach_branch_to_named_roof_chord !== true
    || typeof facilityFeed.feed_branch !== "string" || !facilityFeed.feed_branch
    || typeof facilityFeed.authenticated_tray !== "string" || !facilityFeed.authenticated_tray
    || !measuredVector3(facilityFeed.feed_start_world_m) || !measuredVector3(facilityFeed.feed_end_world_m)
    || !measuredVector3(facilityFeed.conduit_start_world_m)
    || !Number.isFinite(feedGap) || Math.abs(feedGap) > 1e-6
    || !Number.isFinite(tangentDot) || tangentDot < Math.cos(5 * Math.PI / 180) || tangentDot > 1 + 1e-6
    || !Number.isFinite(tangentAngle) || tangentAngle < 0 || tangentAngle > 5 + 1e-6) {
    throw new Error("source hardware continuity must prove measured tray/feed/conduit attachment and directed tangent continuity within 1e-6 m / 5 degrees");
  }
  if (!Array.isArray(facilityFeed.hangers) || facilityFeed.hangers.length !== 3) {
    throw new Error("source hardware continuity facility_tray_to_conduit must contain exactly three measured hanger records");
  }
  const hangerIndices = new Set();
  for (const hanger of facilityFeed.hangers) {
    if (!Number.isInteger(hanger?.index) || hangerIndices.has(hanger.index)
      || typeof hanger.hanger !== "string" || !hanger.hanger
      || typeof hanger.clamp !== "string" || !hanger.clamp
      || typeof hanger.roof_anchor_object !== "string" || !hanger.roof_anchor_object
      || !measuredVector3(hanger.branch_anchor_world_m) || !measuredVector3(hanger.roof_anchor_world_m)
      || hanger.branch_anchor_and_clamp_overlap !== true || hanger.roof_chord_overlap !== true || hanger.valid !== true) {
      throw new Error("every facility feed hanger must carry unique measured anchors and prove branch/clamp/roof attachment");
    }
    hangerIndices.add(hanger.index);
  }
  if ([0, 1, 2].some((index) => !hangerIndices.has(index))) {
    throw new Error("facility feed hanger measurements must be indexed exactly 0, 1, and 2");
  }
  const reportedDerivative = build.phase4r1_derivative;
  const validatedDerivative = validation.phase4r1_derivative;
  for (const [record, label] of [[reportedDerivative, "build"], [validatedDerivative, "validation"]]) {
    if (!record || record.bytes !== derivativeAuthority.bytes || String(record.sha256 ?? "").toLowerCase() !== derivativeAuthority.sha256) {
      throw new Error(`${label} report does not bind the exact supplied R1 derivative`);
    }
  }
  const sourceBuildAuthority = {
    path: path.relative(ROOT, sourceBuildPath).replaceAll("\\", "/"),
    bytes: buildBytes.length,
    sha256: sha256(buildBytes),
  };
  exactAuthority(validation.source_build, sourceBuildAuthority, "source validation source_build");
  exactAuthority(validation.source_build_report, sourceBuildAuthority, "source validation source_build_report");
  if (String(validation.source_build_sha256 ?? "").toLowerCase() !== sourceBuildAuthority.sha256) {
    throw new Error("source validation source_build_sha256 does not bind the supplied source-build report");
  }
  for (const [report, label] of [[build, "source build"], [validation, "source validation"]]) {
    if (report.accepted_phase4r0_parent !== ACCEPTED_R0_HEAD) throw new Error(`${label} does not bind the exact accepted Phase 4-R0 parent`);
    exactAuthority(report.accepted_phase4r0_source, ACCEPTED_R0_SOURCE, `${label} accepted R0 source`);
    exactQuantumAuthority(report, label);
  }
  const acceptedR0SourcePath = path.join(ROOT, ...ACCEPTED_R0_SOURCE.path.split("/"));
  const acceptedR0SourceData = await readFile(acceptedR0SourcePath);
  if (acceptedR0SourceData.length !== ACCEPTED_R0_SOURCE.bytes || sha256(acceptedR0SourceData) !== ACCEPTED_R0_SOURCE.sha256) {
    throw new Error("the repository's accepted Phase 4-R0 Blender source no longer matches its exact authority");
  }
  for (const authority of Object.values(Q_AUTHORITIES)) {
    const data = await readFile(path.join(ROOT, ...authority.path.split("/")));
    if (data.length !== authority.bytes || sha256(data) !== authority.sha256) throw new Error(`repository Q authority changed: ${authority.path}`);
  }
  if (build.full_production_rendering_started !== false) throw new Error("source build must explicitly state full_production_rendering_started=false");
  if (build.runtime_integration_started !== false) throw new Error("source build must explicitly state runtime_integration_started=false");

  for (const [field, label] of [
    [validation.missing_textures, "missing_textures"],
    [validation.unresolved_libraries, "unresolved_libraries"],
    [validation.broken_paths, "broken_paths"],
    [validation.unsupported_caches, "unsupported_caches"],
  ]) assertEmptyArray(field, `source validation ${label}`);
  const packed = validation.packed_resource_state;
  if (!packed || packed.used_assets_packed !== true || packed.unused_assets_packed !== false) {
    throw new Error("source validation must prove only used assets are packed");
  }
  const inherited = validation.inherited_crt_actions;
  if (!inherited || inherited.source_action_count !== 421 || inherited.source_keyframe_count !== 17266
    || inherited.valid !== true || inherited.missing_actions?.length || inherited.value_mismatches?.length) {
    throw new Error("source validation must preserve all 421 inherited CRT actions / 17,266 keyframes");
  }
  const events = build.timeline?.events ?? {};
  const eventContract = {
    dormancy_end: 45,
    conduction_start: 46,
    orbit_complete: 285,
    activation_start: 286,
    q_start: 356,
    q_hold_end: 405,
    push_start: 406,
    threshold_start: 481,
    physical_end: 500,
    black_start: 501,
    black_end: 513,
    entry_start: 514,
    entry_end: 540,
  };
  if (build.timeline?.fps !== FPS || build.timeline?.frame_start !== 1 || build.timeline?.frame_end !== 540) {
    throw new Error("source build timeline must remain exactly 540 frames at 30 fps");
  }
  for (const [key, expected] of Object.entries(eventContract)) {
    if (events[key] !== expected) throw new Error(`source build timeline ${key} must remain F${expected}`);
  }
  const current = build.current_mask;
  if (!current || current.continuous_trail !== true || current.no_islands_ahead !== true
    || current.reverse_deterministic !== true || current.physical_black_sheath_remains_visible !== true
    || numeric(current.front_width_fraction) < 0.03 || numeric(current.front_width_fraction) > 0.06
    || JSON.stringify(current.progression_frames) !== JSON.stringify([46, 285])) {
    throw new Error("source build current mask does not prove one contiguous 3-6% front/trail/dormant arc-length progression with deterministic reverse");
  }
  const cableSource = build.cable?.source_design;
  if (!cableSource || cableSource.domestic_outlet !== false || cableSource.fake_screen_or_diagnostics !== false
    || cableSource.conduit_enters_enclosure_top !== true || cableSource.axial_cable_exit_from_relief !== true
    || !Array.isArray(cableSource.traceable_chain) || cableSource.traceable_chain.length < 9) {
    throw new Error("source build cable origin is not an explicit industrial infrastructure-to-CRT chain");
  }
  const finiteVector3 = (value) => Array.isArray(value) && value.length === 3
    && value.every((component) => Number.isFinite(numeric(component)));
  const rearBridgeNames = [
    "CRT_RearRemovableServicePanel",
    "P4R1_CRT_RearConnection_SeatedBase",
    "P4R1_CRT_RearConnection_AxialBridge",
    "P4R1_CRT_RearConnection_ResponseRing",
  ];
  const expectedBuildRearBridge = {
    accepted_crt_seat_object: rearBridgeNames[0],
    seated_flange: rearBridgeNames[1],
    axial_bridge: rearBridgeNames[2],
    response_ring: rearBridgeNames[3],
    axis_world_xz_m: [0.65, 0.3],
    accepted_panel_max_y_m: 0.659,
    seated_flange_y_span_m: [0.655, 0.699],
    axial_bridge_y_span_m: [0.693, 0.795],
    response_ring_y_span_m: [0.791, 0.819],
    modeled_visible_gap_m: 0.0,
    accepted_crt_geometry_changed: false,
  };
  const buildRearBridge = cableSource.rear_connection_seated_bridge;
  if (JSON.stringify(buildRearBridge) !== JSON.stringify(expectedBuildRearBridge)) {
    throw new Error("source build must carry the exact saved rear_connection_seated_bridge authority with zero modeled gap and no accepted-CRT mutation");
  }
  const within = (actual, expected, tolerance = 1e-6) => typeof actual === "number"
    && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
  const sameVector = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
    && actual.every((value, index) => within(value, expected[index]));
  let measuredRearBridgeSignature = null;
  for (const family of FAMILIES) {
    const cableMetric = validation.cable_metrics?.[family];
    const corridor = cableMetric?.rear_terminal_corridor;
    const bridge = corridor?.seated_hardware_bridge;
    const axisErrors = rearBridgeNames.slice(1).map((name) => bridge?.axis_errors_m?.[name]);
    const gaps = Object.values(bridge?.axial_visible_gaps_m ?? {});
    const bounds = bridge?.world_bounds;
    const exactFamilyChecks = [`${family}_route_source_destination_continuity`, `${family}_arc_length_current_contract`]
      .map((id) => validation.checks.filter((check) => check.id === id));
    if (!bridge || corridor.valid !== true || bridge.valid !== true
      || JSON.stringify(bridge.required_objects) !== JSON.stringify(rearBridgeNames)
      || !Array.isArray(bridge.missing_objects) || bridge.missing_objects.length !== 0
      || !sameVector(bridge.axis_world_xz_m, expectedBuildRearBridge.axis_world_xz_m)
      || axisErrors.some((value) => !within(value, 0, 1e-6))
      || !within(bridge.maximum_axis_error_m, Math.max(...axisErrors), 1e-12)
      || bridge.maximum_axis_error_m > 1e-6
      || gaps.length !== 3 || gaps.some((value) => value !== 0) || bridge.maximum_visible_gap_m !== 0
      || bridge.accepted_panel_and_seated_base_bounds_overlap !== true
      || bridge.accepted_crt_object_mutated !== false
      || !rearBridgeNames.every((name) => finiteVector3(bounds?.[name]?.min) && finiteVector3(bounds?.[name]?.max))
      || !within(bounds[rearBridgeNames[0]].max[1], expectedBuildRearBridge.accepted_panel_max_y_m)
      || !sameVector([bounds[rearBridgeNames[1]].min[1], bounds[rearBridgeNames[1]].max[1]], expectedBuildRearBridge.seated_flange_y_span_m)
      || !sameVector([bounds[rearBridgeNames[2]].min[1], bounds[rearBridgeNames[2]].max[1]], expectedBuildRearBridge.axial_bridge_y_span_m)
      || !sameVector([bounds[rearBridgeNames[3]].min[1], bounds[rearBridgeNames[3]].max[1]], expectedBuildRearBridge.response_ring_y_span_m)
      || exactFamilyChecks.some((matches) => matches.length !== 1 || JSON.stringify(matches[0].evidence) !== JSON.stringify(cableMetric))) {
      throw new Error(`${family} validation must independently prove and check-bind the exact seated rear-connector bridge within 1e-6 m`);
    }
    const buildCable = build.cable?.families?.[family];
    if (!buildCable || !within(cableMetric.length_m, buildCable.route_length_m)
      || !within(cableMetric.diameter_m, buildCable.diameter_m) || !within(cableMetric.turns, buildCable.turns)) {
      throw new Error(`${family} rear-bridge evidence is not bound to the exact source-build cable family`);
    }
    const signature = JSON.stringify(bridge);
    if (measuredRearBridgeSignature !== null && measuredRearBridgeSignature !== signature) {
      throw new Error("all three cable families must bind the same independently measured rear-connector bridge");
    }
    measuredRearBridgeSignature = signature;
  }
  const buildFacilityFeed = cableSource.facility_tray_to_conduit;
  if (!buildFacilityFeed || buildFacilityFeed.objects_present !== true || buildFacilityFeed.valid !== true
    || buildFacilityFeed.feed_start_inside_tray !== true || buildFacilityFeed.feed_to_conduit_gap_m !== 0
    || buildFacilityFeed.directed_tangent_dot !== 1 || buildFacilityFeed.tangent_angle_degrees !== 0
    || buildFacilityFeed.hanger_count !== 3 || buildFacilityFeed.all_hangers_attach_branch_to_named_roof_chord !== true
    || cableSource.facility_feed_branch_intersects_west_tray !== true
    || cableSource.facility_feed_to_conduit_continuous_and_tangent_aligned !== true
    || !Array.isArray(buildFacilityFeed.hangers) || buildFacilityFeed.hangers.length !== 3) {
    throw new Error("source build cable authority must declare the exact continuous tray/feed/conduit chain and three structural hangers");
  }
  for (const buildHanger of buildFacilityFeed.hangers) {
    const measuredHanger = facilityFeed.hangers.find((record) => record.index === buildHanger?.index);
    if (!measuredHanger || buildHanger.hanger !== measuredHanger.hanger || buildHanger.clamp !== measuredHanger.clamp
      || buildHanger.structural_anchor_object !== measuredHanger.roof_anchor_object
      || buildHanger.missing !== false || buildHanger.valid !== true
      || !finiteVector3(buildHanger.branch_anchor_world_m) || !finiteVector3(buildHanger.structural_anchor_world_m)
      || buildHanger.branch_anchor_world_m.some((component, index) => Math.abs(numeric(component) - numeric(measuredHanger.branch_anchor_world_m[index])) > 1e-6)
      || buildHanger.structural_anchor_world_m.some((component, index) => Math.abs(numeric(component) - numeric(measuredHanger.roof_anchor_world_m[index])) > 1e-6)) {
      throw new Error("source-build facility hanger authority is not bound to the independently measured hardware-continuity record");
    }
  }
  const sourceCoordinateBindings = [
    [cableSource.conduit_entry_world_m, conduitEvidence.endpoint_world_m, "conduit_entry_world_m"],
    [cableSource.cable_exit_world_m, hardwareEvidence.cable_exit_world_m, "cable_exit_world_m"],
    [cableSource.facility_feed_branch_start_world_m, facilityFeed.feed_start_world_m, "facility_feed_branch_start_world_m"],
    [cableSource.facility_feed_branch_end_world_m, facilityFeed.feed_end_world_m, "facility_feed_branch_end_world_m"],
  ];
  for (const [sourceCoordinate, validationCoordinate, label] of sourceCoordinateBindings) {
    if (sourceCoordinate === undefined) continue;
    if (!finiteVector3(sourceCoordinate) || !finiteVector3(validationCoordinate)
      || sourceCoordinate.some((component, index) => Math.abs(numeric(component) - numeric(validationCoordinate[index])) > 1e-6)) {
      throw new Error(`source build cable ${label} must be a finite vector bound to source hardware continuity within 1e-6 m`);
    }
  }
  const turnRanges = { desktop: [3.25, 3.75], mobile: [2.75, 3.25], landscape: [2.75, 3.75] };
  const extentMagnitude = (value) => Array.isArray(value) && value.length === 2 ? Math.abs(numeric(value[1]) - numeric(value[0])) : numeric(value);
  for (const family of FAMILIES) {
    const cable = build.cable?.families?.[family];
    const [minimumTurns, maximumTurns] = turnRanges[family];
    if (!cable || numeric(cable.route_length_m) <= 10 || numeric(cable.diameter_m) < 0.04
      || numeric(cable.diameter_m) > 0.08 || numeric(cable.turns) < minimumTurns || numeric(cable.turns) > maximumTurns) {
      throw new Error(`${family} cable lacks a substantial physical route, 40-80 mm diameter, or authored turn count`);
    }
    if (!cable.route_planform || extentMagnitude(cable.x_extent_m) <= 2 || extentMagnitude(cable.y_extent_m) <= 2) {
      throw new Error(`${family} cable must surface its authored planform and measured world X/Y extents`);
    }
  }
  const hall = build.hall;
  if (!hall || hall.authored_around_full_orbit !== true || hall.no_environmental_brand_claim !== true
    || hall.no_text_or_fake_diagnostics !== true || Object.keys(hall.depth_layers ?? {}).sort().join(",") !== "background,central,foreground"
    || numeric(hall.dimensions_m?.width_x) < 20 || numeric(hall.dimensions_m?.depth_y) < 15 || numeric(hall.dimensions_m?.clear_height) < 6) {
    throw new Error("source build does not prove a three-layer, all-sides, substantial non-claiming proving hall");
  }
  const lighting = build.lighting;
  if (!lighting || lighting.environmental_magenta_before_frame_46 !== 0 || lighting.room_wide_magenta_sources !== 0
    || lighting.exposure_animation !== false || !/^AGX$/i.test(String(lighting.view_transform ?? ""))) {
    throw new Error("source build lighting must prove neutral dormancy, zero room-wide magenta, fixed exposure, and AgX");
  }
  if (!Array.isArray(build.materials) || build.materials.length < 7
    || build.materials.some((material) => material.authored_procedural !== true || material.external_textures !== 0)) {
    throw new Error("source build must expose at least seven distinct authored procedural material authorities with no external texture dependency");
  }
  const cyclesPlan = build.cycles_settings;
  if (!cyclesPlan || !/^CYCLES$/i.test(String(cyclesPlan.engine ?? ""))
    || !/OIDN|OPEN.?IMAGE.?DENOISE/i.test(String(cyclesPlan.denoiser ?? ""))
    || !/^AGX$/i.test(String(cyclesPlan.view_transform ?? ""))
    || numeric(cyclesPlan.samples_benchmark_stills) !== 192 || numeric(cyclesPlan.samples_motion) !== 96
    || cyclesPlan.production_540_frame_render_authorized !== false) {
    throw new Error("source build must define exact 192-sample still and 96-sample motion Cycles/OIDN/AgX settings while leaving the 540-frame production render unauthorized");
  }
  for (const family of FAMILIES) {
    const camera = build.camera_motion?.[family];
    const angleMonotonic = camera?.angle_monotonic ?? camera?.monotonic_angle;
    const radiusMonotonic = camera?.radius_monotonic ?? camera?.monotonic_contracting_radius;
    if (!camera || angleMonotonic !== true || radiusMonotonic !== true || camera.no_roll !== true
      || numeric(camera.crt_centered_by_frame) > 106 || numeric(camera.total_angular_travel_degrees) < 350
      || numeric(camera.total_angular_travel_degrees) > 370) {
      throw new Error(`source build lacks a valid measured ${family} 360-degree camera contract`);
    }
  }
  const openingMeasurements = validation.opening_measurements ?? build.opening_measurements;
  for (const family of FAMILIES) {
    const measurement = openingMeasurements?.[family];
    if (!measurement || measurement.frame !== 1 || measurement.geometric_projection_only !== true
      || measurement.source_station_intersects_frustum !== true || measurement.plug_intersects_frustum !== true
      || measurement.source_lead_intersects_frustum !== true || measurement.spiral_intersects_frustum !== true
      || measurement.crt_intersects_frustum !== true) {
      throw new Error(`${family} F001 measurement must geometrically prove source station, plug, lead, spiral, and CRT all intersect the real camera frustum`);
    }
    const visibleFraction = numeric(measurement.frustum_visible_cable_fraction);
    const minimumVisibleFraction = 0.90;
    const routeBounds = measurement.projected_route_bounds_normalized;
    if (numeric(measurement.cable_route_length_m) <= 10 || numeric(measurement.frustum_visible_cable_length_m) <= 0
      || visibleFraction < minimumVisibleFraction || visibleFraction > 1
      || !Array.isArray(routeBounds) || routeBounds.length !== 4 || !routeBounds.every((value) => Number.isFinite(numeric(value)))
      || numeric(routeBounds[2]) <= numeric(routeBounds[0]) || numeric(routeBounds[3]) <= numeric(routeBounds[1])) {
      throw new Error(`${family} F001 must prove at least 90% measured cable-route visibility plus valid projected route bounds`);
    }
    const occupancy = numeric(measurement.crt_vertical_occupancy_percent);
    if (!(occupancy > 0 && occupancy < 100)) throw new Error(`${family} F001 CRT vertical occupancy must be measured`);
    if (family === "desktop" && (occupancy < 8 || occupancy > 14)) {
      throw new Error(`desktop F001 CRT vertical occupancy ${occupancy}% is outside 8-14%`);
    }
    if (family === "mobile" && (occupancy < 14 || occupancy > 22)) {
      throw new Error(`mobile F001 CRT vertical occupancy ${occupancy}% is outside 14-22%`);
    }
  }
  const responsivePhysicalFitMeasurements = assertResponsivePhysicalFitMeasurements(
    build.responsive_physical_fit_measurements,
    validation.responsive_physical_fit_measurements,
    {
      build: build.responsive_physical_fit_measurements_sha256,
      validationBuild: validation.source_build_responsive_physical_fit_measurements_sha256,
      validation: validation.responsive_physical_fit_measurements_sha256,
    },
  );
  const landscapeResponsiveCoverMeasurements = assertLandscapeResponsiveCoverBounds(openingMeasurements);

  return {
    derivative,
    derivativeAuthority,
    build,
    validation,
    sourceBuildPath,
    sourceValidationPath,
    sourceBuildRecord: { role: "source-build-report", basename: path.basename(sourceBuildPath), bytes: buildBytes.length, sha256: sha256(buildBytes) },
    sourceValidationRecord: { role: "source-validation-report", basename: path.basename(sourceValidationPath), bytes: validationBytes.length, sha256: sha256(validationBytes) },
    producerAuthorities,
    openingMeasurements,
    responsivePhysicalFitMeasurements,
    landscapeResponsiveCoverMeasurements,
  };
}

function cameraTelemetry(record) {
  const world = record?.camera_world;
  return Array.isArray(world) && world.length === 3 && world.every((value) => Number.isFinite(numeric(value)))
    && Number.isFinite(numeric(record.angle_degrees))
    && Number.isFinite(numeric(record.horizontal_radius))
    && Number.isFinite(numeric(record.elevation))
    && Number.isFinite(numeric(record.downward_view_angle_degrees))
    && Number.isFinite(numeric(record.camera_to_target_distance))
    && Number.isFinite(numeric(record.focal_length_mm));
}

function normalizedCameraRecord(record) {
  return {
    ...record,
    horizontal_radius: record.horizontal_radius ?? record.horizontal_radius_m,
    elevation: record.elevation ?? record.elevation_m,
    camera_to_target_distance: record.camera_to_target_distance ?? record.camera_to_target_distance_m,
  };
}

async function resolvePhysicalSequence(root, family, derivativeAuthority, sourceBuildSha256, producerAuthority = null, { r0 = false } = {}) {
  const files = await listFiles(root);
  const frames = new Map();
  for (const relativePath of files) {
    const frame = frameNumber(relativePath);
    if (!Number.isInteger(frame) || frame < 1 || frame > PHYSICAL_END) continue;
    if (frames.has(frame)) throw new Error(`${family} frame root has duplicate F${frame}`);
    frames.set(frame, path.join(root, ...relativePath.split("/")));
  }
  if (frames.size !== PHYSICAL_END || Array.from({ length: PHYSICAL_END }, (_, index) => index + 1).some((frame) => !frames.has(frame))) {
    throw new Error(`${family} root must contain exactly contiguous F001-F500 physical images`);
  }
  const first = await sharp(frames.get(1)).metadata();
  if (!first.width || !first.height || first.width % 2 || first.height % 2) throw new Error(`${family} frames need readable even dimensions`);
  for (const frame of [1, 46, 106, 165, 225, 285, 370, 460, 500]) {
    const metadata = await sharp(frames.get(frame)).metadata();
    if (metadata.width !== first.width || metadata.height !== first.height) throw new Error(`${family} frame dimensions change at F${frame}`);
  }
  const ratio = first.width / first.height;
  if (family === "desktop" && Math.abs(ratio - 1.6) > 0.03) throw new Error("desktop frames must use a 16:10 authored camera");
  if (family === "mobile" && ratio >= 1) throw new Error("mobile frames must be portrait");
  if (family === "landscape" && ratio < 1.8) throw new Error("landscape frames must use an authored short-landscape camera");

  const pattern = r0 ? /(?:^|\/)phase4r0-desktop-render-report\.json$/i : new RegExp(`(?:^|/)phase4r1-${family}(?:-[^/]*)?-render-report\\.json$`, "i");
  const manifests = files.filter((filename) => pattern.test(filename));
  if (manifests.length !== 1) throw new Error(`${family} root must contain exactly one authenticated render report`);
  const reportPath = path.join(root, ...manifests[0].split("/"));
  const reportBytes = await readFile(reportPath);
  const report = JSON.parse(reportBytes);
  pass(report, `${family} render report`);
  if (r0 ? !/phase-4-r0/i.test(String(report.schema ?? "")) : report.schema !== R1_RENDER_REPORT_SCHEMA) {
    throw new Error(`${family} render report schema does not identify the expected phase`);
  }
  if (String(report.variant ?? "").toLowerCase() !== family || report.fps !== FPS || !/^BLENDER_EEVEE/i.test(String(report.engine ?? ""))) {
    throw new Error(`${family} render report must prove 30 fps Blender Eevee for the same family`);
  }
  if (!r0 && String(report.evidence_class ?? "").toUpperCase() !== "FRESH_BLENDER_EEVEE_PREVISUALIZATION") {
    throw new Error(`${family} render report must explicitly classify fresh Eevee previsualization`);
  }
  if (report.production_rendering !== false || (!r0 && report.full_production_rendering !== false)) throw new Error(`${family} Eevee report must be explicitly non-production and outside the full-production workflow`);
  if (!Array.isArray(report.resolution) || report.resolution[0] !== first.width || report.resolution[1] !== first.height) {
    throw new Error(`${family} render report resolution does not match its images`);
  }
  if (!Array.isArray(report.frames) || report.frames.length !== PHYSICAL_END) throw new Error(`${family} report must contain 500 ordered frame records`);
  const sourceHash = String(report.source?.sha256 ?? "").toLowerCase();
  if (r0 ? sourceHash !== R0_DERIVATIVE_SHA256 : sourceHash !== derivativeAuthority.sha256) {
    throw new Error(`${family} report is not bound to the expected Blender derivative`);
  }
  if (!r0 && report.source?.bytes !== derivativeAuthority.bytes) throw new Error(`${family} report has the wrong R1 derivative byte count`);
  if (!r0 && String(report.source_build_sha256 ?? "").toLowerCase() !== sourceBuildSha256) {
    throw new Error(`${family} Eevee report is not bound to the exact supplied source-build report`);
  }
  if (!r0) exactAuthority(report.producer_authority, producerAuthority, `${family} Eevee producer_authority`);

  const records = new Map();
  const digest = createHash("sha256");
  let totalBytes = 0;
  for (const record of report.frames) {
    const frame = numeric(record?.frame);
    if (!Number.isInteger(frame) || frame < 1 || frame > 500 || records.has(frame)) throw new Error(`${family} report has duplicate/invalid frame record`);
    const resolved = path.resolve(root, String(record.path ?? ""));
    if (!record.path || !isWithin(root, resolved) || normalizedPath(resolved) !== normalizedPath(frames.get(frame))) {
      throw new Error(`${family} report F${frame} does not bind the resolved image`);
    }
    const data = await readFile(frames.get(frame));
    const hash = sha256(data);
    if (data.length !== record.bytes || hash !== String(record.sha256 ?? "").toLowerCase()) throw new Error(`${family} F${frame} hash/bytes mismatch`);
    const metadata = await sharp(data).metadata();
    if (metadata.width !== first.width || metadata.height !== first.height) throw new Error(`${family} F${frame} dimensions differ from the authenticated sequence`);
    const normalizedRecord = normalizedCameraRecord(record);
    if (!r0 && !cameraTelemetry(normalizedRecord)) throw new Error(`${family} F${frame} lacks required camera telemetry`);
    digest.update(String(frame).padStart(6, "0"));
    digest.update("\0");
    digest.update(hash);
    digest.update("\0");
    totalBytes += data.length;
    records.set(frame, normalizedRecord);
  }

  if (!r0) {
    const orbit = Array.from({ length: 240 }, (_, index) => records.get(46 + index));
    for (let index = 1; index < orbit.length; index += 1) {
      if (numeric(orbit[index].angle_degrees) + 1e-5 < numeric(orbit[index - 1].angle_degrees)) throw new Error(`${family} orbit angle reverses`);
      if (numeric(orbit[index].horizontal_radius) - 1e-5 > numeric(orbit[index - 1].horizontal_radius)) throw new Error(`${family} orbit radius expands`);
    }
    const travel = numeric(orbit.at(-1).angle_degrees) - numeric(orbit[0].angle_degrees);
    if (travel < 350 || travel > 370) throw new Error(`${family} render telemetry proves only ${travel} degrees of orbit`);
    const openingDown = numeric(records.get(1).downward_view_angle_degrees);
    if (openingDown < 22 || openingDown > 32) throw new Error(`${family} F001 downward viewing angle ${openingDown} is outside 22-32 degrees`);
    const targetAngle = numeric(orbit[0].angle_degrees) + 120;
    const sample120 = orbit.reduce((best, record) => Math.abs(numeric(record.angle_degrees) - targetAngle) < Math.abs(numeric(best.angle_degrees) - targetAngle) ? record : best);
    if (numeric(sample120.downward_view_angle_degrees) > 18) throw new Error(`${family} camera remains too aerial by approximately 120 degrees`);
  }

  const expectedInventory = new Set([manifests[0], ...Array.from(frames.values(), (filename) => path.relative(root, filename).replaceAll("\\", "/"))]);
  const unexpectedFiles = files.filter((filename) => !expectedInventory.has(filename));
  if (unexpectedFiles.length || expectedInventory.size !== 501) {
    throw new Error(`${family} physical root must contain only its exact 500 authenticated frames and one render report; extras: ${unexpectedFiles.join(", ") || "inventory mismatch"}`);
  }

  return {
    family,
    root,
    frames,
    records,
    report,
    reportPath,
    width: first.width,
    height: first.height,
    renderReportRecord: { role: `${r0 ? "r0-reference" : "r1"}-${family}-eevee-render-report`, basename: path.basename(reportPath), bytes: reportBytes.length, sha256: sha256(reportBytes) },
    sequenceAuthority: { frameStart: 1, frameEnd: 500, frames: 500, totalBytes, sequenceSha256: digest.digest("hex") },
  };
}

function assertCameraReportMatchesBuild(sequence, buildCamera) {
  if (!Array.isArray(buildCamera?.sampled_telemetry) || buildCamera.sampled_telemetry.length !== 240) {
    throw new Error(`${sequence.family} source build must carry the 240 F46-F285 camera samples`);
  }
  const fields = [
    ["angle_degrees", "angle_degrees"],
    ["horizontal_radius", "horizontal_radius_m"],
    ["elevation", "elevation_m"],
    ["downward_view_angle_degrees", "downward_view_angle_degrees"],
    ["camera_to_target_distance", "camera_to_target_distance_m"],
    ["focal_length_mm", "focal_length_mm"],
  ];
  for (const sample of buildCamera.sampled_telemetry) {
    const render = sequence.records.get(sample.frame);
    if (!render) throw new Error(`${sequence.family} render report lacks build-bound F${sample.frame} telemetry`);
    for (const [renderField, buildField] of fields) {
      if (Math.abs(numeric(render[renderField]) - numeric(sample[buildField])) > 1e-4) {
        throw new Error(`${sequence.family} render/build camera mismatch at F${sample.frame} ${renderField}`);
      }
    }
    if (render.camera_world.some((value, index) => Math.abs(numeric(value) - numeric(sample.camera_world[index])) > 1e-4)) {
      throw new Error(`${sequence.family} render/build camera-world mismatch at F${sample.frame}`);
    }
  }
}

function assertSemanticCapture(capture, label) {
  if (!Array.isArray(capture?.failures) || capture.failures.length !== 0) throw new Error(`${label} must carry an explicit empty capture-level failures array`);
  if (!capture.checks || REQUIRED_ENTRY_CHECKS.some((name) => capture.checks[name] !== true)
    || Object.values(capture.checks).some((value) => value !== true)) {
    throw new Error(`${label} does not pass every required semantic, font, interaction, and fit check`);
  }
}

async function resolveEntryPlates(root, expectedHead) {
  const found = await findSingleManifest(root, /(?:^|\/)phase-4r(?:0|1)-entry-plates-manifest\.json$/i, "semantic ENTRY plate");
  const manifest = found.value;
  pass(manifest, "semantic ENTRY plate manifest");
  if (!Array.isArray(manifest.captures) || !Array.isArray(manifest.failures) || manifest.failures.length) throw new Error("ENTRY manifest must contain only PASS captures and an explicit empty failures array");
  if (manifest.repository?.dirty !== false || ![ACCEPTED_R0_HEAD, expectedHead].includes(String(manifest.repository?.head ?? ""))) {
    throw new Error("ENTRY plates must come from a clean accepted R0 or exact R1 HEAD runtime authority");
  }
  const selected = {};
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    const matches = manifest.captures.filter((capture) => capture?.id === viewport.plateId
      && capture?.width === viewport.width && capture?.height === viewport.height
      && capture?.status === "PASS" && capture?.png?.path);
    if (matches.length !== 1) throw new Error(`ENTRY manifest must bind exactly one PASS ${viewport.plateId}`);
    assertSemanticCapture(matches[0], `ENTRY ${viewport.id}`);
    const asset = await safeManifestFile(root, matches[0].png, `ENTRY ${viewport.id}`);
    const metadata = await sharp(asset.data).metadata();
    if (metadata.width !== viewport.width || metadata.height !== viewport.height) throw new Error(`ENTRY ${viewport.id} dimensions mismatch`);
    selected[viewport.id] = { ...viewport, filename: asset.filename, authority: asset.record };
  }
  return {
    manifest,
    manifestPath: found.filename,
    manifestRecord: { role: "semantic-entry-plates-manifest", basename: path.basename(found.filename), bytes: found.bytes.length, sha256: sha256(found.bytes) },
    selected,
    family: {
      desktop: null,
      mobile: selected["mobile-390x844"].filename,
      landscape: selected["landscape-844x390"].filename,
    },
  };
}

async function resolveDesktopEntryPlate(root, manifest) {
  const matches = manifest.captures.filter((capture) => capture?.id === "desktop-1440x900"
    && capture?.width === 1440 && capture?.height === 900 && capture?.status === "PASS" && capture?.png?.path);
  if (matches.length !== 1) throw new Error("ENTRY manifest must additionally bind one PASS desktop-1440x900 plate for the desktop animatic");
  assertSemanticCapture(matches[0], "ENTRY desktop-1440x900");
  const asset = await safeManifestFile(root, matches[0].png, "ENTRY desktop-1440x900");
  const metadata = await sharp(asset.data).metadata();
  if (metadata.width !== 1440 || metadata.height !== 900) throw new Error("desktop ENTRY plate is not 1440x900");
  return { filename: asset.filename, authority: asset.record };
}

async function resolveReviewStills(root, derivativeAuthority, sourceBuildSha256, producerAuthority) {
  const found = await findSingleManifest(root, /(?:^|\/)phase4r1-review-stills-manifest\.json$/i, "R1 review still");
  const manifest = found.value;
  pass(manifest, "R1 review still manifest");
  if (manifest.schema !== R1_REVIEW_STILLS_SCHEMA || manifest.production_rendering !== false) {
    throw new Error("review still manifest must use the exact R1 schema and bounded preproduction flag");
  }
  if (String(manifest.source?.sha256 ?? "").toLowerCase() !== derivativeAuthority.sha256) throw new Error("review stills do not bind the R1 derivative");
  if (manifest.source?.bytes !== derivativeAuthority.bytes) throw new Error("review stills do not bind the exact R1 derivative byte count");
  if (String(manifest.source_build_sha256 ?? "").toLowerCase() !== sourceBuildSha256) throw new Error("review stills do not bind the exact supplied source-build report");
  exactAuthority(manifest.producer_authority, producerAuthority, "review still aggregate producer_authority");
  if (!Array.isArray(manifest.stills) || manifest.role_count !== 24) throw new Error("review still manifest needs exactly 24 declared roles");
  const selected = {};
  const selectedPaths = new Set();
  const selectedHashes = new Set();
  for (const [category, roles] of Object.entries(REVIEW_STILL_ROLES)) {
    selected[category] = {};
    for (const id of roles) {
      const matches = manifest.stills.filter((record) => record?.category === category && record?.id === id && record?.status === "PASS");
      if (matches.length !== 1) throw new Error(`review still manifest must bind exactly one PASS ${category}/${id}`);
      if (!/EEVEE|CYCLES/i.test(String(matches[0].renderer ?? ""))) throw new Error(`${category}/${id} must be a real Blender render`);
      const asset = await safeManifestFile(root, matches[0], `review still ${category}/${id}`);
      const metadata = await sharp(asset.data).metadata();
      if (!metadata.width || !metadata.height || metadata.width < 640 || metadata.height < 360) throw new Error(`${category}/${id} is too small for review`);
      if (matches[0].width !== metadata.width || matches[0].height !== metadata.height) throw new Error(`${category}/${id} manifest dimensions mismatch`);
      const normalizedRecordPath = matches[0].path.replaceAll("\\", "/");
      if (selectedPaths.has(normalizedRecordPath) || selectedHashes.has(String(matches[0].sha256).toLowerCase())) throw new Error(`review still ${category}/${id} reuses another role's path or pixels`);
      selectedPaths.add(normalizedRecordPath);
      selectedHashes.add(String(matches[0].sha256).toLowerCase());
      selected[category][id] = { ...matches[0], filename: asset.filename };
    }
  }
  if (manifest.stills.length !== Object.values(REVIEW_STILL_ROLES).reduce((sum, roles) => sum + roles.length, 0)) {
    throw new Error("review still manifest must contain exactly the requested 24 stills; abandoned variants are forbidden");
  }
  const rootFiles = await listFiles(root);
  const expectedFiles = new Set([path.relative(root, found.filename).replaceAll("\\", "/"), ...selectedPaths]);
  const extras = rootFiles.filter((filename) => !expectedFiles.has(filename));
  if (extras.length || expectedFiles.size !== 25) throw new Error(`review still root contains unreferenced or abandoned files: ${extras.join(", ") || "inventory mismatch"}`);
  return {
    manifest,
    manifestPath: found.filename,
    manifestRecord: { role: "review-stills-manifest", basename: path.basename(found.filename), bytes: found.bytes.length, sha256: sha256(found.bytes) },
    selected,
  };
}

function assertCyclesSettings(settings, label, expectedSamples) {
  if (!settings || !/^CYCLES$/i.test(String(settings.engine ?? ""))) throw new Error(`${label} must use Cycles`);
  if (!/OIDN|OPEN.?IMAGE.?DENOISE/i.test(String(settings.denoiser ?? ""))) throw new Error(`${label} must use OIDN`);
  if (!/^AGX$/i.test(String(settings.view_transform ?? ""))) throw new Error(`${label} must use AgX`);
  if (settings.samples !== expectedSamples) throw new Error(`${label} must declare exactly ${expectedSamples} Cycles samples`);
  if (settings.adaptive_sampling !== true) throw new Error(`${label} must prove adaptive sampling was enabled`);
  if (!settings.compute_device) throw new Error(`${label} must record the actual Cycles compute-device selection`);
  return settings;
}

function orderedSequenceSha256(records) {
  const digest = createHash("sha256");
  for (const record of records) {
    digest.update(String(record.frame).padStart(6, "0"), "utf8");
    digest.update("\0");
    digest.update(String(record.sha256).toLowerCase(), "utf8");
    digest.update("\0");
  }
  return digest.digest("hex");
}

async function resolveCyclesBenchmarkReport(root, record, role, derivativeAuthority, sourceBuildSha256, producerAuthority) {
  const authority = record.render_report;
  const asset = await safeManifestFile(root, authority, `${role.id} Cycles render report`);
  const report = JSON.parse(asset.data);
  pass(report, `${role.id} Cycles render report`);
  if (report.schema !== R1_RENDER_REPORT_SCHEMA
    || String(report.evidence_class ?? "").toUpperCase() !== "FRESH_BLENDER_CYCLES_BENCHMARK"
    || report.production_rendering !== false || report.full_production_rendering !== false
    || report.runtime_integration !== false || report.phase5_authorized !== false
    || report.engine !== "CYCLES" || report.requested_engine !== "cycles"
    || String(report.source?.sha256 ?? "").toLowerCase() !== derivativeAuthority.sha256
    || report.source?.bytes !== derivativeAuthority.bytes
    || String(report.source_build_sha256 ?? "").toLowerCase() !== sourceBuildSha256
    || report.id !== role.id || report.family !== role.family || report.variant !== role.family || report.frame !== role.frame
    || report.frame_start !== role.frame || report.frame_end !== role.frame || report.frame_count !== 1 || report.fps !== FPS
    || !Array.isArray(report.resolution) || report.resolution[0] !== record.width || report.resolution[1] !== record.height
    || !Array.isArray(report.frames) || report.frames.length !== 1) {
    throw new Error(`${role.id} lacks its exact generic single-frame Cycles render-report authority`);
  }
  assertCyclesSettings(report.settings, `${role.id} render report`, 192);
  exactAuthority(report.producer_authority, producerAuthority, `${role.id} render-report producer_authority`);
  const rendered = report.frames[0];
  if (rendered.frame !== role.frame || rendered.path !== record.path || rendered.bytes !== record.bytes
    || String(rendered.sha256 ?? "").toLowerCase() !== String(record.sha256).toLowerCase()
    || numeric(rendered.render_seconds) <= 0 || numeric(record.render_seconds) !== numeric(rendered.render_seconds)) {
    throw new Error(`${role.id} aggregate still does not match its exact timed Blender render record`);
  }
  return { id: role.id, relativePath: path.relative(root, asset.filename).replaceAll("\\", "/"), bytes: asset.data.length, sha256: sha256(asset.data) };
}

async function resolveCyclesMotionReport(root, sample, expected, derivativeAuthority, sourceBuildSha256, producerAuthority) {
  const authority = sample.render_report;
  const asset = await safeManifestFile(root, authority, `${sample.id} Cycles motion render report`);
  const report = JSON.parse(asset.data);
  pass(report, `${sample.id} Cycles motion render report`);
  if (report.schema !== R1_RENDER_REPORT_SCHEMA
    || String(report.evidence_class ?? "").toUpperCase() !== "FRESH_BLENDER_CYCLES_PREPRODUCTION"
    || report.production_rendering !== false || report.full_production_rendering !== false
    || !/^CYCLES$/i.test(String(report.engine ?? "")) || !/^cycles$/i.test(String(report.requested_engine ?? ""))
    || String(report.source?.sha256 ?? "").toLowerCase() !== derivativeAuthority.sha256
    || report.source?.bytes !== derivativeAuthority.bytes
    || String(report.source_build_sha256 ?? "").toLowerCase() !== sourceBuildSha256
    || report.variant !== "desktop" || report.sample_id !== sample.id
    || report.frame_start !== expected[0] || report.frame_end !== expected[1]
    || report.frame_count !== 90 || report.fps !== FPS || !Array.isArray(report.frames) || report.frames.length !== 90) {
    throw new Error(`${sample.id} lacks an exact genuine continuous Cycles motion render-report authority`);
  }
  assertCyclesSettings(report.settings, `${sample.id} render report`, 96);
  exactAuthority(report.producer_authority, producerAuthority, `${sample.id} render-report producer_authority`);
  for (let index = 0; index < 90; index += 1) {
    const declared = sample.frames[index];
    const rendered = report.frames[index];
    if (rendered.frame !== declared.frame || rendered.path !== declared.path || rendered.bytes !== declared.bytes
      || String(rendered.sha256 ?? "").toLowerCase() !== String(declared.sha256).toLowerCase()
      || numeric(rendered.render_seconds) <= 0) {
      throw new Error(`${sample.id} aggregate/report mismatch at F${declared.frame}`);
    }
  }
  return { relativePath: path.relative(root, asset.filename).replaceAll("\\", "/"), bytes: asset.data.length, sha256: sha256(asset.data), report };
}

async function resolveCyclesStills(root, derivativeAuthority, sourceBuildSha256, landscapeEntryAuthority, producerAuthority) {
  const found = await findSingleManifest(root, /(?:^|\/)phase4r1-cycles-benchmarks-manifest\.json$/i, "Cycles benchmark still");
  const manifest = found.value;
  pass(manifest, "Cycles benchmark still manifest");
  if (manifest.schema !== R1_CYCLES_BENCHMARKS_SCHEMA) throw new Error("Cycles benchmark aggregate uses the wrong schema");
  if (manifest.production_rendering !== false) throw new Error("Cycles benchmark aggregate must explicitly remain bounded preproduction evidence");
  if (String(manifest.source?.sha256 ?? "").toLowerCase() !== derivativeAuthority.sha256) throw new Error("Cycles stills do not bind the R1 derivative");
  if (manifest.source?.bytes !== derivativeAuthority.bytes || String(manifest.source_build_sha256 ?? "").toLowerCase() !== sourceBuildSha256) {
    throw new Error("Cycles stills do not bind the exact derivative bytes and supplied source-build report");
  }
  exactAuthority(manifest.producer_authority, producerAuthority, "Cycles benchmark aggregate producer_authority");
  assertCyclesSettings(manifest.settings, "Cycles benchmark stills", 192);
  if (!Array.isArray(manifest.stills) || manifest.still_count !== CYCLES_STILL_ROLES.length || manifest.stills.length !== CYCLES_STILL_ROLES.length) {
    throw new Error("Cycles inventory must be exactly seven physical benchmarks plus one ENTRY regression plate");
  }
  const selected = {};
  const selectedPaths = new Set();
  const selectedHashes = new Set();
  const renderReports = [];
  for (const role of CYCLES_STILL_ROLES) {
    const matches = manifest.stills.filter((record) => record?.id === role.id && record?.status === "PASS");
    if (matches.length !== 1) throw new Error(`Cycles manifest must bind exactly one PASS ${role.id}`);
    const record = matches[0];
    const asset = await safeManifestFile(root, record, `benchmark ${role.id}`);
    const metadata = await sharp(asset.data).metadata();
    if (record.width !== metadata.width || record.height !== metadata.height) throw new Error(`${role.id} manifest dimensions mismatch`);
    if (path.extname(asset.filename).toLowerCase() !== ".png") throw new Error(`${role.id} must be supplied as original-quality PNG`);
    if (record.family !== role.family || record.frame !== role.frame) throw new Error(`${role.id} has the wrong authored family or source frame`);
    const normalizedRecordPath = record.path.replaceAll("\\", "/");
    const normalizedHash = String(record.sha256).toLowerCase();
    if (selectedPaths.has(normalizedRecordPath) || selectedHashes.has(normalizedHash)) throw new Error(`${role.id} reuses another benchmark role's path or pixels`);
    selectedPaths.add(normalizedRecordPath);
    selectedHashes.add(normalizedHash);
    if (role.cycles) {
      if (!/^CYCLES$/i.test(String(record.renderer ?? ""))) throw new Error(`${role.id} must be a native Cycles render`);
      if (!record.settings || record.settings.engine !== "CYCLES" || record.settings.samples !== 192
        || record.settings.denoiser !== "OPENIMAGEDENOISE" || record.settings.view_transform !== "AgX"
        || !record.settings.compute_device) throw new Error(`${role.id} has the wrong exact per-still Cycles settings`);
      renderReports.push(await resolveCyclesBenchmarkReport(root, record, role, derivativeAuthority, sourceBuildSha256, producerAuthority));
    }
    if (role.desktopHero && (metadata.width < 1600 || metadata.height < 1000 || Math.abs(metadata.width / metadata.height - 1.6) > 0.03)) {
      throw new Error(`${role.id} must be a native authored 16:10 still at least 1600x1000`);
    }
    if (role.portrait && (metadata.width < 780 || metadata.height < 1600 || Math.abs(metadata.width / metadata.height - 390 / 844) > 0.02)) {
      throw new Error(`${role.id} must be a high-resolution authored mobile portrait render`);
    }
    if (role.semantic) {
      if (!/BROWSER|SEMANTIC/i.test(String(record.renderer ?? "")) || metadata.width !== 844 || metadata.height !== 390) {
        throw new Error("844x390 ENTRY regression must be labelled semantic/browser evidence, not Cycles");
      }
      if (String(record.sha256).toLowerCase() !== String(landscapeEntryAuthority.sha256).toLowerCase()) {
        throw new Error("844x390 ENTRY regression must bind the exact authenticated semantic ENTRY plate");
      }
    }
    selected[role.id] = { ...record, filename: asset.filename };
  }
  const rootFiles = await listFiles(root);
  const expectedFiles = new Set([
    path.relative(root, found.filename).replaceAll("\\", "/"),
    ...selectedPaths,
    ...renderReports.map((record) => record.relativePath),
  ]);
  const extras = rootFiles.filter((filename) => !expectedFiles.has(filename));
  if (extras.length || expectedFiles.size !== 16) {
    throw new Error(`Cycles benchmark root must contain only one aggregate, seven render reports, seven physical PNGs, and one semantic PNG; extras: ${extras.join(", ") || "inventory mismatch"}`);
  }
  return {
    manifest,
    manifestPath: found.filename,
    manifestRecord: { role: "cycles-benchmark-manifest", basename: path.basename(found.filename), bytes: found.bytes.length, sha256: sha256(found.bytes) },
    selected,
    renderReports,
  };
}

async function resolveCyclesMotion(root, derivativeAuthority, sourceBuildSha256, producerAuthority) {
  const found = await findSingleManifest(root, /(?:^|\/)phase4r1-cycles-motion-manifest\.json$/i, "Cycles motion sample");
  const manifest = found.value;
  pass(manifest, "Cycles motion manifest");
  if (manifest.schema !== R1_CYCLES_MOTION_SCHEMA) throw new Error("Cycles motion aggregate uses the wrong schema");
  if (manifest.production_rendering !== false) throw new Error("Cycles motion aggregate must explicitly remain bounded preproduction evidence");
  if (String(manifest.source?.sha256 ?? "").toLowerCase() !== derivativeAuthority.sha256) throw new Error("Cycles motion does not bind the R1 derivative");
  if (manifest.source?.bytes !== derivativeAuthority.bytes || String(manifest.source_build_sha256 ?? "").toLowerCase() !== sourceBuildSha256) {
    throw new Error("Cycles motion does not bind the exact derivative bytes and supplied source-build report");
  }
  exactAuthority(manifest.producer_authority, producerAuthority, "Cycles motion aggregate producer_authority");
  assertCyclesSettings(manifest.settings, "Cycles motion samples", 96);
  if (!Array.isArray(manifest.samples) || manifest.sample_count !== 2 || manifest.samples.length !== 2) throw new Error("Cycles motion manifest must contain exactly two samples");
  const ranges = { "current-proving-hall": [46, 135], "q-threshold": [391, 480] };
  const selected = {};
  const allFramePaths = new Set();
  const reportPaths = new Set();
  for (const role of MOTION_SAMPLE_ROLES) {
    const matches = manifest.samples.filter((sample) => sample?.id === role.id && sample?.status === "PASS");
    if (matches.length !== 1) throw new Error(`Cycles motion must bind exactly one PASS ${role.id}`);
    const sample = matches[0];
    const [expectedStart, expectedEnd] = ranges[role.id];
    const frameStart = sample.frame_start;
    const frameEnd = sample.frame_end;
    if (frameStart !== expectedStart || frameEnd !== expectedEnd || sample.frame_count !== 90
      || sample.fps !== FPS || numeric(sample.duration_seconds) !== 3 || sample.frames?.length !== 90) {
      throw new Error(`${role.id} must be the continuous 90-frame F${expectedStart}-F${expectedEnd} range at 30 fps`);
    }
    if (sample.family !== "desktop" || !/^CYCLES$/i.test(String(sample.renderer ?? ""))) throw new Error(`${role.id} must identify the authored desktop Cycles family`);
    assertCyclesSettings(sample.settings, role.id, 96);
    const renderReport = await resolveCyclesMotionReport(root, sample, [expectedStart, expectedEnd], derivativeAuthority, sourceBuildSha256, producerAuthority);
    if (reportPaths.has(renderReport.relativePath)) throw new Error("Cycles motion samples reuse one render report");
    reportPaths.add(renderReport.relativePath);
    const frames = [];
    const orderedRecords = [];
    const sampleHashes = new Set();
    let width = null;
    let height = null;
    for (let index = 0; index < 90; index += 1) {
      const expectedFrame = expectedStart + index;
      const record = sample.frames[index];
      if (record?.frame !== expectedFrame) throw new Error(`${role.id} frame order is not contiguous at F${expectedFrame}`);
      const normalizedRecordPath = String(record.path ?? "").replaceAll("\\", "/");
      if (allFramePaths.has(normalizedRecordPath)) throw new Error(`${role.id} reuses a frame path`);
      allFramePaths.add(normalizedRecordPath);
      const asset = await safeManifestFile(root, record, `${role.id} F${expectedFrame}`);
      const metadata = await sharp(asset.data).metadata();
      if (!metadata.width || !metadata.height || metadata.width % 2 || metadata.height % 2) throw new Error(`${role.id} has invalid frame dimensions`);
      width ??= metadata.width;
      height ??= metadata.height;
      if (metadata.width !== width || metadata.height !== height) throw new Error(`${role.id} frame dimensions change`);
      frames.push(asset.filename);
      sampleHashes.add(String(record.sha256).toLowerCase());
      orderedRecords.push(record);
    }
    if (width < 960 || height < 540 || Math.abs(width / height - 1.6) > 0.03) throw new Error(`${role.id} motion sample must be a reviewable authored desktop 16:10 render`);
    if (sampleHashes.size < 70) throw new Error(`${role.id} must contain at least 70 unique rendered frame hashes across its 90 distinct frame paths; observed ${sampleHashes.size}`);
    const sequenceSha256 = orderedSequenceSha256(orderedRecords);
    if (String(sample.sequence_sha256 ?? "").toLowerCase() !== sequenceSha256) throw new Error(`${role.id} ordered sequence digest mismatch`);
    selected[role.id] = { ...sample, frameStart, frameEnd, frames, width, height, durationSeconds: 3, sequenceSha256, renderReport };
  }
  const rootFiles = await listFiles(root);
  const expectedFiles = new Set([
    path.relative(root, found.filename).replaceAll("\\", "/"),
    ...allFramePaths,
    ...reportPaths,
  ]);
  const extras = rootFiles.filter((filename) => !expectedFiles.has(filename));
  if (extras.length || expectedFiles.size !== 183) {
    throw new Error(`Cycles motion root must contain only one aggregate, two render reports, and 180 authenticated frames; extras: ${extras.join(", ") || "inventory mismatch"}`);
  }
  return {
    manifest,
    manifestPath: found.filename,
    manifestRecord: { role: "cycles-motion-manifest", basename: path.basename(found.filename), bytes: found.bytes.length, sha256: sha256(found.bytes) },
    selected,
    renderReports: Object.values(selected).map(({ id, renderReport }) => ({ id, path: renderReport.relativePath, bytes: renderReport.bytes, sha256: renderReport.sha256 })),
  };
}

async function resolveAssetLedger(filename, derivativeAuthority) {
  const ledgerPath = await assertTrackedR1SourceFile(filename, "--asset-ledger");
  const bytes = await readFile(ledgerPath);
  const ledger = JSON.parse(bytes);
  pass(ledger, "asset ledger");
  if (String(ledger.source?.sha256 ?? "").toLowerCase() !== derivativeAuthority.sha256) throw new Error("asset ledger does not bind the R1 derivative");
  const authored = ledger.authoredAssets;
  const external = ledger.externalAssets;
  if (!Array.isArray(authored) || authored.length < 1 || !Array.isArray(external)) throw new Error("asset ledger needs authoredAssets and externalAssets arrays");
  const ids = new Set();
  for (const [kind, records] of [["authored", authored], ["external", external]]) {
    for (const record of records) {
      if (!record?.id || ids.has(record.id) || !record.name || !record.creator || !record.license || !record.source
        || !record.exactUse || typeof record.modified !== "boolean" || typeof record.packedIntoBlend !== "boolean" || !validHash(record.sha256)) {
        throw new Error(`asset ledger has incomplete or duplicate ${kind} record ${record?.id ?? "<missing>"}`);
      }
      ids.add(record.id);
      if (kind === "external") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.downloadDate ?? "")) || !record.originalFilename || !/^https:\/\//i.test(record.source)) throw new Error(`external asset ${record.id} lacks download/source provenance`);
        if (!/CC0|PUBLIC DOMAIN|COMMERCIAL/i.test(record.license)) throw new Error(`external asset ${record.id} license is not clearly commercial-use compatible`);
        if (/UNKNOWN|UNVERIFIED|SCRAPED/i.test(record.license)) throw new Error(`external asset ${record.id} has prohibited license provenance`);
      }
    }
  }
  const policy = ledger.policy;
  if (!policy || policy.aiGeneratedFacilityImageryUsed !== false || policy.higgsfieldProductionMaterialUsed !== false
    || policy.unknownLicenseAssetsUsed !== false || policy.confidentialMaterialUploaded !== false
    || policy.stockVideoOrVisiblePhotographyUsed !== false) {
    throw new Error("asset ledger policy must explicitly reject AI/Higgsfield/unknown-license/confidential/stock scene material");
  }
  if (!Number.isInteger(ledger.textureContributionBytes) || ledger.textureContributionBytes < 0) {
    throw new Error("asset ledger must state exact non-negative textureContributionBytes");
  }
  return {
    ledger,
    ledgerPath,
    authority: { path: path.relative(ROOT, ledgerPath).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes) },
    record: { role: "asset-ledger", basename: path.basename(ledgerPath), bytes: bytes.length, sha256: sha256(bytes) },
  };
}

async function supportsLibx264(candidate) {
  try {
    const result = await execFileAsync(candidate, ["-hide_banner", "-encoders"], { windowsHide: true, maxBuffer: 4_000_000 });
    return /(?:^|\s)libx264(?:\s|$)/m.test(`${result.stdout}\n${result.stderr}`);
  } catch {
    return false;
  }
}

async function resolveFfmpeg(override) {
  const candidates = [];
  if (override) candidates.push(override);
  if (process.platform === "win32") {
    try {
      const located = await execFileAsync("where.exe", ["ffmpeg.exe"], { windowsHide: true, maxBuffer: 100_000 });
      candidates.push(...String(located.stdout).split(/\r?\n/).filter(Boolean));
    } catch {}
  } else candidates.push("ffmpeg");
  const browserRoot = process.env.PLAYWRIGHT_BROWSERS_PATH
    ?? (process.platform === "win32" && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ms-playwright") : null);
  if (browserRoot && await pathExists(browserRoot)) {
    for (const directory of (await readdir(browserRoot)).filter((name) => name.startsWith("ffmpeg-")).sort().reverse()) {
      for (const name of process.platform === "win32" ? ["ffmpeg-win64.exe", "ffmpeg.exe"] : ["ffmpeg-linux", "ffmpeg-mac", "ffmpeg"]) {
        candidates.push(path.join(browserRoot, directory, name));
      }
    }
  }
  for (const candidate of [...new Set(candidates)]) {
    if (!(await supportsLibx264(candidate))) continue;
    if (path.isAbsolute(candidate)) return await realpath(candidate);
    if (process.platform === "win32") {
      const located = await execFileAsync("where.exe", [candidate], { windowsHide: true, maxBuffer: 100_000 });
      const first = String(located.stdout).split(/\r?\n/).find(Boolean);
      if (first) return await realpath(first);
    }
    return candidate;
  }
  throw new Error("a full FFmpeg build with libx264 was not found; pass --ffmpeg");
}

async function ffmpegVersion(ffmpegPath) {
  const result = await execFileAsync(ffmpegPath, ["-version"], { windowsHide: true, maxBuffer: 1_000_000 });
  return String(result.stdout).split(/\r?\n/)[0].trim();
}

function matchingFfprobe(ffmpegPath) {
  return path.join(path.dirname(ffmpegPath), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
}

function rational(value) {
  const [numerator, denominator = "1"] = String(value).split("/");
  const result = Number(numerator) / Number(denominator);
  return Number.isFinite(result) ? result : NaN;
}

async function probeVideo(ffmpegPath, filename, expectedFrames, width, height) {
  const ffprobe = matchingFfprobe(ffmpegPath);
  await access(ffprobe);
  const result = await execFileAsync(ffprobe, [
    "-v", "error", "-count_frames",
    "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration:format=duration",
    "-of", "json", filename,
  ], { windowsHide: true, maxBuffer: 2_000_000 });
  const parsed = JSON.parse(result.stdout);
  const videos = (parsed.streams ?? []).filter((stream) => stream.codec_type === "video");
  const audio = (parsed.streams ?? []).filter((stream) => stream.codec_type === "audio");
  if (videos.length !== 1 || audio.length !== 0) throw new Error(`${path.basename(filename)} must have one video stream and zero audio streams`);
  const stream = videos[0];
  const frames = Number(stream.nb_read_frames ?? stream.nb_frames);
  const rate = rational(stream.r_frame_rate);
  const average = rational(stream.avg_frame_rate);
  const duration = Number(stream.duration ?? parsed.format?.duration);
  if (stream.codec_name !== "h264" || stream.pix_fmt !== "yuv420p" || Number(stream.width) !== width || Number(stream.height) !== height
    || frames !== expectedFrames || Math.abs(rate - FPS) > 1e-9 || Math.abs(average - FPS) > 1e-9
    || Math.abs(duration - expectedFrames / FPS) > 0.001) {
    throw new Error(`${path.basename(filename)} failed exact H.264/yuv420p/dimension/frame/rate/duration gates`);
  }
  return {
    status: "PASS",
    codec: stream.codec_name,
    pixelFormat: stream.pix_fmt,
    dimensions: [width, height],
    decodedFrames: frames,
    nominalFrameRate: rate,
    averageFrameRate: average,
    durationSeconds: round(duration),
    audioStreams: 0,
  };
}

function escapeXml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function svg(width, height, content) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`);
}

function wrapText(value, maximum) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line || `${line} ${word}`.length <= maximum) line = line ? `${line} ${word}` : word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function createOverlay(width, height, destination) {
  const font = Math.max(11, Math.min(20, Math.round(Math.min(width, height) * 0.02)));
  const barHeight = Math.max(48, Math.round(font * 3));
  const buffer = await sharp(svg(width, height, `
    <rect width="${width}" height="${barHeight}" fill="#030506" fill-opacity="0.84"/>
    <rect y="${barHeight - 3}" width="${width}" height="3" fill="#d82b72"/>
    <text x="16" y="${Math.round(barHeight * 0.42)}" fill="#f4f7f6" font-family="Arial,sans-serif" font-size="${font}" font-weight="700">PHASE 4-R1 · THE PROVING HALL · PREPRODUCTION</text>
    <text x="16" y="${Math.round(barHeight * 0.76)}" fill="#f06ba0" font-family="Arial,sans-serif" font-size="${Math.max(10, font - 2)}" font-weight="700">HUMAN UNACCEPTED · FULL 540F CYCLES RENDER NOT AUTHORIZED · PHASE 5 UNAUTHORIZED</text>
  `)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  await atomicWrite(destination, buffer);
  return { filename: destination, barHeight, bytes: buffer.length, sha256: sha256(buffer) };
}

function smoothstep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

async function blackFrame(width, height, destination) {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  await atomicWrite(destination, buffer);
}

async function semanticFrame(plate, width, height, frame, destination) {
  const progress = smoothstep((frame - ENTRY_START) / (FRAME_END - ENTRY_START));
  const alpha = 0.04 + 0.96 * progress;
  let pipeline = sharp(plate).resize(width, height, { fit: "cover", position: "centre" }).linear(0.88 + 0.12 * progress, 0).ensureAlpha();
  const blur = 1.25 * (1 - progress);
  if (blur >= 0.3) pipeline = pipeline.blur(blur);
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += 4) data[index] = Math.round(data[index] * alpha);
  const buffer = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: data, raw: { width: info.width, height: info.height, channels: info.channels }, blend: "over" }])
    .removeAlpha().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  await atomicWrite(destination, buffer);
  return { frame, progress: round(progress), alpha: round(alpha), blur: round(blur) };
}

async function buildFamily(sequence, plate, workRoot) {
  const root = path.join(workRoot, `family-${sequence.family}`);
  await mkdir(root);
  const black = path.join(root, "deep-black.png");
  await blackFrame(sequence.width, sequence.height, black);
  const files = [];
  for (let frame = 1; frame <= PHYSICAL_END; frame += 1) files.push(sequence.frames.get(frame));
  for (let frame = BLACK_START; frame <= BLACK_END; frame += 1) files.push(black);
  const resolve = [];
  for (let frame = ENTRY_START; frame <= FRAME_END; frame += 1) {
    const destination = path.join(root, `entry-${String(frame).padStart(3, "0")}.png`);
    resolve.push(await semanticFrame(plate, sequence.width, sequence.height, frame, destination));
    files.push(destination);
  }
  if (files.length !== FRAME_END) throw new Error(`${sequence.family} assembled sequence is not 540 frames`);
  const overlay = await createOverlay(sequence.width, sequence.height, path.join(root, "classification.png"));
  return { ...sequence, files, black, resolve, overlay };
}

async function prepareImage2(workRoot, id, files) {
  const root = path.join(workRoot, `${id}-image2`);
  await mkdir(root);
  let hardLinks = 0;
  let copies = 0;
  for (const [index, source] of files.entries()) {
    const destination = path.join(root, `frame-${String(index + 1).padStart(6, "0")}.png`);
    try { await link(source, destination); hardLinks += 1; }
    catch (error) {
      if (!["EXDEV", "EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) throw error;
      await copyFile(source, destination); copies += 1;
    }
  }
  return { pattern: path.join(root, "frame-%06d.png"), frameCount: files.length, hardLinks, copies };
}

async function decodedStats(filename, cropTop = 0) {
  const metadata = await sharp(filename).metadata();
  const top = Math.max(0, Math.min(cropTop, metadata.height - 1));
  const { data } = await sharp(filename).extract({ left: 0, top, width: metadata.width, height: metadata.height - top })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let maximum = 0;
  let sum = 0;
  for (const value of data) { maximum = Math.max(maximum, value); sum += value; }
  return { maximumChannel: maximum, meanChannel: round(sum / data.length) };
}

async function forwardDecodeGate(ffmpegPath, filename, workRoot, scaledOverlayHeight) {
  const indexes = [499, ...Array.from({ length: 13 }, (_, index) => 500 + index), 513, 539];
  const root = path.join(workRoot, `decode-${randomUUID()}`);
  await mkdir(root);
  const expression = indexes.map((index) => `eq(n\\,${index})`).join("+");
  await execFileAsync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", filename,
    "-vf", `select=${expression}`, "-fps_mode", "passthrough", "-frames:v", String(indexes.length), path.join(root, "decoded-%03d.png")],
  { windowsHide: true, maxBuffer: 4_000_000 });
  const files = (await readdir(root)).filter((name) => /^decoded-\d{3}\.png$/.test(name)).sort(lexicalCompare);
  if (files.length !== indexes.length) throw new Error("forward decoded-boundary extraction count mismatch");
  const records = [];
  for (let index = 0; index < indexes.length; index += 1) {
    const image = path.join(root, files[index]);
    records.push({ decodedIndex: indexes[index], displayFrame: indexes[index] + 1, full: await decodedStats(image), belowOverlay: await decodedStats(image, scaledOverlayHeight) });
  }
  if (records[0].belowOverlay.maximumChannel <= 2) throw new Error("decoded F500 is unexpectedly black");
  if (records.slice(1, 14).some((record) => record.full.maximumChannel > 2)) throw new Error("decoded F501-F513 is not uniformly nominal black");
  if (records[14].belowOverlay.maximumChannel <= 2 || records[15].belowOverlay.maximumChannel <= 32) throw new Error("decoded ENTRY boundary/settled frames are not visible");
  return { status: "PASS", mapping: "n499=F500; n500-n512=F501-F513; n513=F514; n539=F540", records };
}

async function encodeSequence({ ffmpegPath, files, overlay = null, overlayDisableRanges = [], width, height, destination, workRoot, id, crf = 18, forwardGate = false }) {
  const image2 = await prepareImage2(workRoot, id, files);
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-framerate", String(FPS), "-start_number", "1", "-i", image2.pattern];
  let map;
  if (overlay) {
    args.push("-loop", "1", "-framerate", String(FPS), "-i", overlay.filename);
    const disabled = overlayDisableRanges.map(([start, end]) => `between(n,${start},${end})`).join("+");
    const enable = disabled ? `:enable='not(${disabled})'` : "";
    args.push("-filter_complex", `[0:v][1:v]overlay=0:0:format=auto${enable},scale=${width}:${height}:flags=lanczos,format=yuv420p[v]`);
    map = "[v]";
  } else {
    args.push("-vf", `scale=${width}:${height}:flags=lanczos,format=yuv420p`);
    map = "0:v:0";
  }
  args.push("-map", map, "-an", "-frames:v", String(files.length), "-c:v", "libx264", "-preset", "slow", "-crf", String(crf),
    "-profile:v", "high", "-level", "4.2", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-map_metadata", "-1",
    "-metadata", "creation_time=1980-01-01T00:00:00Z", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-threads", "1", destination);
  await execFileAsync(ffmpegPath, args, { windowsHide: true, maxBuffer: 8_000_000 });
  const probe = await probeVideo(ffmpegPath, destination, files.length, width, height);
  const scaledOverlayHeight = overlay ? Math.round(overlay.barHeight * height / (await sharp(overlay.filename).metadata()).height) : 0;
  const decodedBoundaryGate = forwardGate ? await forwardDecodeGate(ffmpegPath, destination, workRoot, scaledOverlayHeight) : null;
  const data = await readFile(destination);
  return {
    id,
    path: path.relative(path.dirname(workRoot), destination).replaceAll("\\", "/"),
    bytes: data.length,
    sha256: sha256(data),
    frameCount: files.length,
    frameRate: FPS,
    durationSeconds: round(files.length / FPS, 3),
    dimensions: [width, height],
    codec: "H.264/libx264",
    audioStreams: 0,
    ingestion: { method: "exact numbered image2 sequence", frameCount: image2.frameCount, hardLinks: image2.hardLinks, copies: image2.copies, privatePatternRetained: false },
    streamProbe: probe,
    decodedBoundaryGate,
  };
}

async function panelImage(panel, width, height) {
  let pipeline = sharp(panel.input);
  if (panel.cropMode === "lower") {
    const metadata = await pipeline.metadata();
    const top = Math.round(metadata.height * 0.3);
    pipeline = pipeline.extract({ left: 0, top, width: metadata.width, height: metadata.height - top });
  }
  return pipeline.resize(width, height, {
    fit: panel.fit ?? "contain",
    position: panel.position ?? "centre",
    background: "#020405",
  }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

async function createSheet(outputRoot, { filename, title, subtitle, panels, columns = 3, cellWidth = 520, previewHeight = 330 }) {
  const padding = 24;
  const gap = 16;
  const header = 126;
  const titleLines = panels.map((panel) => wrapText(panel.title, columns === 3 ? 38 : 58));
  const detailLines = panels.map((panel) => (panel.lines ?? []).flatMap((line) => wrapText(line, columns === 3 ? 48 : 72)));
  const labelHeight = Math.max(82, ...panels.map((_, index) => 24 + titleLines[index].length * 20 + detailLines[index].length * 16));
  const cellHeight = previewHeight + labelHeight;
  const rows = Math.ceil(panels.length / columns);
  const width = padding * 2 + columns * cellWidth + (columns - 1) * gap;
  const height = header + padding + rows * cellHeight + (rows - 1) * gap + padding;
  const composites = [{ input: svg(width, header, `
    <rect width="100%" height="100%" fill="#070a0b"/>
    <rect x="24" y="20" width="18" height="4" fill="#d82b72"/>
    <text x="54" y="37" fill="#ffffff" font-family="Arial,sans-serif" font-size="22" font-weight="700">${escapeXml(title)}</text>
    <text x="24" y="70" fill="#a4b0af" font-family="Arial,sans-serif" font-size="13">${escapeXml(subtitle)}</text>
    <text x="24" y="99" fill="#f06ba0" font-family="Arial,sans-serif" font-size="11" font-weight="700">${escapeXml(CLASSIFICATION)}</text>
  `), left: 0, top: 0 }];
  for (const [index, panel] of panels.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = padding + column * (cellWidth + gap);
    const top = header + padding + row * (cellHeight + gap);
    const image = await panelImage(panel, cellWidth, previewHeight);
    const text = [];
    let y = 26;
    for (const line of titleLines[index]) { text.push(`<text x="16" y="${y}" fill="#f4f7f6" font-family="Arial,sans-serif" font-size="15" font-weight="700">${escapeXml(line)}</text>`); y += 20; }
    for (const line of detailLines[index]) { text.push(`<text x="16" y="${y}" fill="#a8b3b2" font-family="Arial,sans-serif" font-size="12">${escapeXml(line)}</text>`); y += 16; }
    composites.push({ input: image, left, top });
    composites.push({ input: svg(cellWidth, labelHeight, `<rect width="100%" height="100%" fill="#101516"/><rect width="5" height="100%" fill="#d82b72"/>${text.join("")}`), left, top: top + previewHeight });
    composites.push({ input: svg(cellWidth, cellHeight, `<rect x="0.5" y="0.5" width="${cellWidth - 1}" height="${cellHeight - 1}" fill="none" stroke="#354241"/>`), left, top });
  }
  const buffer = await sharp({ create: { width, height, channels: 4, background: "#030506" } })
    .composite(composites).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const destination = path.join(outputRoot, "sheets", filename);
  await atomicWrite(destination, buffer);
  return { id: path.basename(filename, ".png"), path: `sheets/${filename}`, width, height, panelCount: panels.length, bytes: buffer.length, sha256: sha256(buffer) };
}

function frameLabel(frame) {
  return `F${String(frame).padStart(3, "0")}`;
}

function closestAngleFrame(sequence, relativeDegrees) {
  const start = numeric(sequence.records.get(46).angle_degrees);
  let best = sequence.records.get(46);
  for (let frame = 46; frame <= 285; frame += 1) {
    const record = sequence.records.get(frame);
    if (Math.abs(numeric(record.angle_degrees) - (start + relativeDegrees)) < Math.abs(numeric(best.angle_degrees) - (start + relativeDegrees))) best = record;
  }
  return best.frame;
}

async function createOverviewSheets(outputRoot, reviewStills) {
  const results = [];
  for (const [category, roles] of Object.entries(REVIEW_STILL_ROLES)) {
    const title = category === "environment" ? "PROVING HALL · COMPLETE ENVIRONMENT OVERVIEW"
      : category === "cable-source" ? "CABLE ORIGIN · FACILITY INFRASTRUCTURE TO CRT"
        : "MATERIAL AUTHORITY · HERO SURFACE CLOSE-UPS";
    const subtitle = category === "environment" ? "All sides, overhead, opening camera, CRT level, and power source; no hero-wall-only construction"
      : category === "cable-source" ? "Conduit → enclosure → socket → plug → strain relief → floor → complete route → rear CRT"
        : "Concrete, steel, electrical hardware, sheath, current, test fixture, and CRT/environment interaction";
    results.push(await createSheet(outputRoot, {
      filename: `phase-4r1-${category}-overview-sheet.png`, title, subtitle,
      panels: roles.map((id) => {
        const still = reviewStills.selected[category][id];
        return { input: still.filename, title: id.replaceAll("-", " ").toUpperCase(), lines: [`${still.renderer} · ${still.width}×${still.height}`, `SHA ${still.sha256.slice(0, 12)}…`] };
      }),
    }));
  }
  return results;
}

async function createBeforeAfterSheet(outputRoot, r0, r1) {
  const states = [
    [1, "Dormant opening"], [106, "25% conduction"], [165, "50% conduction"], [225, "75% conduction"],
    [closestAngleFrame(r1, 180), "Rear orbit"], [370, "Q activation"], [460, "Frontal approach"],
  ];
  const panels = [];
  for (const [frame, label] of states) {
    const r0Frame = Math.max(1, Math.min(500, frame));
    panels.push({ input: r0.frames.get(r0Frame), title: `R0 · ${label}`, lines: [frameLabel(r0Frame), `derivative ${R0_DERIVATIVE_SHA256.slice(0, 12)}…`] });
    panels.push({ input: r1.frames.get(frame), title: `R1 · ${label}`, lines: [frameLabel(frame), "authenticated Proving Hall frame"] });
  }
  return createSheet(outputRoot, {
    filename: "phase-4r1-r0-before-after-seven-state-sheet.png",
    title: "PHASE 4-R0 → PHASE 4-R1 · ENVIRONMENT AND CABLE-ORIGIN COMPARISON",
    subtitle: "Paired authenticated desktop frames; environment depth and physical source relationship must remain a human judgment",
    panels, columns: 2, cellWidth: 720, previewHeight: 450,
  });
}

async function createConductionSheet(outputRoot, desktop) {
  const states = [
    [1, "Dormant"], [46, "First current"], [70, "10%"], [106, "25%"], [165, "50%"],
    [225, "75%"], [261, "90%"], [285, "Arrival"], [292, "Indicator response"],
  ];
  const panels = [];
  for (const [frame, label] of states) {
    panels.push({ input: desktop.frames.get(frame), title: `${label} · full scene`, lines: [frameLabel(frame), "contiguous trail/front/dormant cable review"] });
    panels.push({ input: desktop.frames.get(frame), title: `${label} · cable-focused crop`, lines: [frameLabel(frame), "lower-field crop; cable material remains the evidence"], cropMode: "lower", fit: "cover" });
  }
  return createSheet(outputRoot, {
    filename: "phase-4r1-cable-conduction-full-and-focused-sheet.png",
    title: "CABLE CONDUCTION · FULL SCENE + CABLE-FOCUSED EVIDENCE",
    subtitle: "Nine causal states; reflections never substitute for the cable itself",
    panels, columns: 2, cellWidth: 720, previewHeight: 430,
  });
}

async function createLightingSheet(outputRoot, desktop) {
  const states = [[1, "Dormant neutral hall"], [46, "Early current"], [165, "Mid-current"], [285, "Arrival"], [370, "Q activation"], [460, "Late approach"]];
  return createSheet(outputRoot, {
    filename: "phase-4r1-environment-lighting-state-sheet.png",
    title: "ENVIRONMENT LIGHTING · CONTROLLED STATE PROGRESSION",
    subtitle: "Neutral dormant hall → local current response → CRT becomes the luminous centre",
    panels: states.map(([frame, title]) => ({ input: desktop.frames.get(frame), title, lines: [frameLabel(frame), frame === 1 ? "zero environmental magenta required" : "localized response only"] })),
  });
}

async function createOrbitSheets(outputRoot, families) {
  const results = [];
  for (const family of FAMILIES) {
    const sequence = families[family];
    const angleStates = [0, 45, 90, 135, 180, 225, 270, 315, 360].map((degrees) => [closestAngleFrame(sequence, degrees), `${degrees}°`]);
    const states = [...angleStates, [370, "Q"], [500, "Portal"]];
    results.push(await createSheet(outputRoot, {
      filename: `phase-4r1-${family}-orbit-45-degree-milestones-q-portal.png`,
      title: `ORBIT MILESTONES · ${family.toUpperCase()}`,
      subtitle: "Measured nearest real-camera frames at 45-degree increments; Q and physical portal regression follow",
      panels: states.map(([frame, label]) => {
        const telemetry = sequence.records.get(frame);
        return { input: sequence.frames.get(frame), title: `${label} · ${frameLabel(frame)}`, lines: [`angle ${round(telemetry.angle_degrees, 2)}° · radius ${round(telemetry.horizontal_radius, 2)} m`, `down ${round(telemetry.downward_view_angle_degrees, 2)}° · lens ${round(telemetry.focal_length_mm, 1)} mm`] };
      }),
    }));
  }
  return results;
}

async function viewportPhysicalFrame(source, viewport, destination) {
  const resize = { fit: viewport.physicalFit, position: viewport.physicalPosition };
  if (viewport.physicalFit === "contain") resize.background = { r: 2, g: 2, b: 4, alpha: 1 };
  const buffer = await sharp(source).resize(viewport.width, viewport.height, resize).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  await atomicWrite(destination, buffer);
  return destination;
}

async function createResponsiveSheets(outputRoot, workRoot, families, entryPlates) {
  const results = [];
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    const sequence = families[viewport.family];
    const states = [[1, "Dormant opening"], [165, "Mid-conduction"], [370, "Q"], [500, "Portal"]];
    const panels = [];
    for (const [frame, title] of states) {
      const destination = path.join(workRoot, `responsive-${viewport.id}-${frame}.png`);
      await viewportPhysicalFrame(sequence.frames.get(frame), viewport, destination);
      const policy = `${viewport.physicalFit}/${viewport.physicalPosition}${viewport.physicalFit === "contain" ? " on deep physical black" : ""}${viewport.provisional ? " · provisional tablet mapping" : ""}`;
      panels.push({ input: destination, title, lines: [`${viewport.width}×${viewport.height} · ${frameLabel(frame)}`, `authored ${viewport.family} family · ${policy}`] });
    }
    panels.push({ input: entryPlates.selected[viewport.id].filename, title: "Settled semantic ENTRY", lines: [`${viewport.width}×${viewport.height}`, "actual authenticated browser plate"] });
    results.push(await createSheet(outputRoot, {
      filename: `phase-4r1-responsive-${viewport.id}-five-state-sheet.png`,
      title: `RESPONSIVE CINEMATIC · ${viewport.width}×${viewport.height}`,
      subtitle: `Dormant → current → Q → physical portal → actual semantic ENTRY · measured ${viewport.physicalFit}/${viewport.physicalPosition}${viewport.physicalFit === "contain" ? " on deep physical black" : ""}${viewport.provisional ? " · provisional" : ""}`,
      panels, columns: viewport.height > viewport.width ? 2 : 3, cellWidth: viewport.height > viewport.width ? 420 : 520, previewHeight: 360,
    }));
  }
  if (results.length !== 9 || results.some((record) => record.panelCount !== 5)) throw new Error("responsive evidence must be exactly 9 sheets × 5 states");
  return results;
}

async function copyCyclesStills(outputRoot, cyclesStills) {
  const results = [];
  for (const role of CYCLES_STILL_ROLES) {
    const source = cyclesStills.selected[role.id];
    const filename = `phase-4r1-${role.id}.png`;
    const directory = role.semantic ? "regressions" : "cycles/benchmark-stills";
    const destination = path.join(outputRoot, ...directory.split("/"), filename);
    const sourceData = await readFile(source.filename);
    if (sourceData.length !== source.bytes || sha256(sourceData) !== String(source.sha256).toLowerCase()) {
      throw new Error(`original benchmark authority changed before copy: ${role.id}`);
    }
    const sanitized = sanitizePngPrivateMetadata(sourceData, `benchmark ${role.id}`);
    await atomicWrite(destination, sanitized.data);
    const data = await readFile(destination);
    if (!data.equals(sanitized.data)) throw new Error(`atomic benchmark copy changed ${role.id}`);
    const [sourcePixels, copiedPixels] = await Promise.all([
      sharp(sourceData).ensureAlpha().raw().toBuffer(),
      sharp(data).ensureAlpha().raw().toBuffer(),
    ]);
    const sourcePixelSha256 = sha256(sourcePixels);
    if (sourcePixels.length !== copiedPixels.length || sourcePixelSha256 !== sha256(copiedPixels)) {
      throw new Error(`private metadata removal changed decoded benchmark pixels: ${role.id}`);
    }
    results.push({
      id: role.id,
      evidenceClass: role.semantic ? "AUTHENTICATED_BROWSER_ENTRY_REGRESSION" : "NATIVE_CYCLES_BENCHMARK",
      path: `${directory}/${filename}`,
      bytes: data.length,
      sha256: sha256(data),
      dimensions: [source.width, source.height],
      renderer: source.renderer,
      sourceAuthority: { bytes: sourceData.length, sha256: sha256(sourceData) },
      privacySanitization: {
        method: "remove only CRC-validated PNG text chunks containing private host paths; preserve all image chunks byte-for-byte",
        removedTextChunks: sanitized.removed,
        decodedPixelsPreserved: true,
        decodedRgbaBytes: sourcePixels.length,
        decodedRgbaSha256: sourcePixelSha256,
      },
    });
  }
  return results;
}

async function createCyclesSheet(outputRoot, cyclesStills) {
  return createSheet(outputRoot, {
    filename: "phase-4r1-cycles-seven-physical-benchmarks-plus-entry-regression.png",
    title: "FINAL-QUALITY BENCHMARKS · SEVEN CYCLES STILLS + SEMANTIC REGRESSION",
    subtitle: "The 844×390 ENTRY plate is browser evidence and is deliberately not represented as Cycles",
    panels: CYCLES_STILL_ROLES.map((role) => {
      const still = cyclesStills.selected[role.id];
      return { input: still.filename, title: role.id.replaceAll("-", " ").toUpperCase(), lines: [role.semantic ? "AUTHENTICATED BROWSER/SEMANTIC" : `CYCLES · ${still.settings?.samples ?? cyclesStills.manifest.settings.samples} samples · OIDN · AgX`, `${still.width}×${still.height} · SHA ${still.sha256.slice(0, 12)}…`] };
    }),
  });
}

function scaleDomain(values, minimum, maximum, padding = 0.08) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(1e-9, high - low);
  const domainLow = low - span * padding;
  const domainHigh = high + span * padding;
  return (value) => minimum + (numeric(value) - domainLow) / (domainHigh - domainLow) * (maximum - minimum);
}

function stageMarkers(width, height, xForFrame) {
  const stages = [
    [1, 45, "ESTABLISHING", "#26303b"],
    [46, 106, "EARLY DESCENT", "#312434"],
    [107, 285, "FLATTER ORBIT", "#1d2d2d"],
    [406, 480, "FRONTAL LOCK / PUSH", "#332b1f"],
    [481, 500, "SCREEN PUSH", "#38212b"],
  ];
  return stages.map(([start, end, label, color]) => {
    const x = xForFrame(start);
    const right = xForFrame(end);
    return `<rect x="${x}" y="0" width="${Math.max(1, right - x)}" height="${height}" fill="${color}" fill-opacity="0.28"/><text x="${x + 5}" y="16" fill="#aeb9b8" font-family="Arial,sans-serif" font-size="10">${label}</text>`;
  }).join("");
}

async function createPathDiagram(outputRoot, sequence, projection) {
  const width = 1500;
  const height = 1000;
  const margin = 90;
  const samples = Array.from({ length: 500 }, (_, index) => sequence.records.get(index + 1));
  let firstValues;
  let secondValues;
  if (projection === "top") {
    firstValues = samples.map((record) => numeric(record.camera_world[0]));
    secondValues = samples.map((record) => numeric(record.camera_world[1]));
  } else {
    firstValues = samples.map((record) => numeric(record.horizontal_radius));
    secondValues = samples.map((record) => numeric(record.elevation));
  }
  const targetFirst = projection === "top" ? 0.65 : 0;
  const targetSecond = 0;
  const x = scaleDomain([...firstValues, targetFirst], margin, width - margin);
  const y = scaleDomain([...secondValues, targetSecond], height - margin, margin);
  const points = samples.map((record) => `${round(x(projection === "top" ? record.camera_world[0] : record.horizontal_radius), 2)},${round(y(projection === "top" ? record.camera_world[1] : record.elevation), 2)}`).join(" ");
  const milestones = [1, 46, closestAngleFrame(sequence, 90), closestAngleFrame(sequence, 180), closestAngleFrame(sequence, 270), 285, 406, 480, 500];
  const labels = milestones.map((frame) => {
    const record = sequence.records.get(frame);
    const px = x(projection === "top" ? record.camera_world[0] : record.horizontal_radius);
    const py = y(projection === "top" ? record.camera_world[1] : record.elevation);
    return `<circle cx="${px}" cy="${py}" r="7" fill="#d82b72" stroke="#ffffff"/><text x="${px + 10}" y="${py - 9}" fill="#f4f7f6" font-family="Arial,sans-serif" font-size="14">${frameLabel(frame)}</text>`;
  }).join("");
  const targetX = x(targetFirst);
  const targetY = y(targetSecond);
  const content = `
    <rect width="100%" height="100%" fill="#050809"/>
    <text x="55" y="48" fill="#ffffff" font-family="Arial,sans-serif" font-size="25" font-weight="700">PHASE 4-R1 · ${sequence.family.toUpperCase()} · ${projection.toUpperCase()} CAMERA PATH</text>
    <text x="55" y="78" fill="#a4b0af" font-family="Arial,sans-serif" font-size="14">${projection === "top" ? "real camera world X/Y; target and hall relationship" : "horizontal CRT radius versus boom elevation"} · F001–500</text>
    <rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${height - margin * 2}" fill="#0c1112" stroke="#354241"/>
    <polyline points="${points}" fill="none" stroke="#d82b72" stroke-width="4"/>
    <circle cx="${targetX}" cy="${targetY}" r="12" fill="none" stroke="#f4f7f6" stroke-width="3"/><line x1="${targetX - 17}" y1="${targetY}" x2="${targetX + 17}" y2="${targetY}" stroke="#f4f7f6"/><line x1="${targetX}" y1="${targetY - 17}" x2="${targetX}" y2="${targetY + 17}" stroke="#f4f7f6"/><text x="${targetX + 20}" y="${targetY + 24}" fill="#f4f7f6" font-family="Arial,sans-serif" font-size="14">ACCEPTED CRT TARGET</text>
    ${labels}
    <text x="55" y="${height - 34}" fill="#f06ba0" font-family="Arial,sans-serif" font-size="13" font-weight="700">${escapeXml(CLASSIFICATION)}</text>`;
  const buffer = await sharp(svg(width, height, content)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const filename = `phase-4r1-${sequence.family}-${projection}-camera-path.png`;
  await atomicWrite(path.join(outputRoot, "diagrams", filename), buffer);
  return { path: `diagrams/${filename}`, family: sequence.family, projection, width, height, bytes: buffer.length, sha256: sha256(buffer) };
}

function graphPanel({ x, y, width, height, title, samples, field, unit, color }) {
  const values = samples.map((record) => numeric(record[field]));
  const xMap = (frame) => x + (frame - 1) / 499 * width;
  const yMap = scaleDomain(values, y + height - 28, y + 28);
  const points = samples.map((record) => `${round(xMap(record.frame), 2)},${round(yMap(record[field]), 2)}`).join(" ");
  const stages = stageMarkers(width, height, (frame) => (frame - 1) / 499 * width);
  return `<g transform="translate(${x},${y})"><rect width="${width}" height="${height}" fill="#0b1011" stroke="#354241"/>${stages}<polyline points="${points.split(" ").map((point) => { const [px, py] = point.split(","); return `${numeric(px) - x},${numeric(py) - y}`; }).join(" ")}" fill="none" stroke="${color}" stroke-width="3"/><text x="14" y="42" fill="#ffffff" font-family="Arial,sans-serif" font-size="15" font-weight="700">${escapeXml(title)}</text><text x="14" y="${height - 10}" fill="#a4b0af" font-family="Arial,sans-serif" font-size="11">min ${round(Math.min(...values), 3)} ${unit} · max ${round(Math.max(...values), 3)} ${unit}</text></g>`;
}

async function createCameraGraphs(outputRoot, sequence) {
  const width = 1800;
  const height = 1250;
  const samples = Array.from({ length: 500 }, (_, index) => sequence.records.get(index + 1));
  const panels = [
    ["Elevation versus frame", "elevation", "m", "#d82b72"],
    ["Downward viewing angle versus frame", "downward_view_angle_degrees", "deg", "#e6a35a"],
    ["Horizontal radius versus frame", "horizontal_radius", "m", "#57b6a5"],
    ["Angular progression versus frame", "angle_degrees", "deg", "#8aaee8"],
    ["Focal length versus frame", "focal_length_mm", "mm", "#d1c968"],
    ["Camera-to-target distance versus frame", "camera_to_target_distance", "m", "#bd80d8"],
  ];
  const content = [`<rect width="100%" height="100%" fill="#050809"/><text x="55" y="50" fill="#fff" font-family="Arial,sans-serif" font-size="25" font-weight="700">PHASE 4-R1 · ${sequence.family.toUpperCase()} · MEASURED CAMERA CURVES</text><text x="55" y="79" fill="#a4b0af" font-family="Arial,sans-serif" font-size="14">Elevated establishment → early descent → flatter orbit → frontal lock → screen push</text>`];
  for (const [index, [title, field, unit, color]] of panels.entries()) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    content.push(graphPanel({ x: 55 + column * 870, y: 115 + row * 350, width: 830, height: 310, title, samples, field, unit, color }));
  }
  content.push(`<text x="55" y="1215" fill="#f06ba0" font-family="Arial,sans-serif" font-size="13" font-weight="700">${escapeXml(CLASSIFICATION)}</text>`);
  const buffer = await sharp(svg(width, height, content.join(""))).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const filename = `phase-4r1-${sequence.family}-elevation-down-angle-radius-angle-lens-distance.png`;
  await atomicWrite(path.join(outputRoot, "diagrams", filename), buffer);
  return { path: `diagrams/${filename}`, family: sequence.family, graphs: panels.map((panel) => panel[1]), width, height, bytes: buffer.length, sha256: sha256(buffer) };
}

async function createTimelineDiagram(outputRoot) {
  const width = 1600;
  const height = 640;
  const x = (frame) => 75 + (frame - 1) / 539 * 1450;
  const colors = ["#26333a", "#75304c", "#9c6b41", "#d82b72", "#72475e", "#384351", "#050505", "#445c62"];
  const bars = TIMELINE.states.map((state, index) => `<rect x="${x(state.start)}" y="190" width="${Math.max(2, x(state.end) - x(state.start))}" height="100" fill="${colors[index]}"/><text transform="translate(${x(state.start) + 9},315) rotate(35)" fill="#f4f7f6" font-family="Arial,sans-serif" font-size="13">${escapeXml(state.label)} · ${frameLabel(state.start)}–${frameLabel(state.end)}</text>`).join("");
  const markers = [46, 106, 165, 225, 285, 356, 405, 406, 480, 500, 501, 513, 514, 540].map((frame) => `<line x1="${x(frame)}" y1="150" x2="${x(frame)}" y2="305" stroke="#ffffff" stroke-opacity="0.5"/><text x="${x(frame) + 3}" y="142" fill="#a4b0af" font-family="Arial,sans-serif" font-size="10">${frameLabel(frame)}</text>`).join("");
  const buffer = await sharp(svg(width, height, `<rect width="100%" height="100%" fill="#050809"/><text x="55" y="52" fill="#fff" font-family="Arial,sans-serif" font-size="25" font-weight="700">PHASE 4-R1 · FROZEN 540-FRAME PREPRODUCTION TIMELINE</text><text x="55" y="84" fill="#a4b0af" font-family="Arial,sans-serif" font-size="14">30 fps · 18.000 seconds · full production Cycles sequence remains unauthorized</text>${bars}${markers}<text x="55" y="595" fill="#f06ba0" font-family="Arial,sans-serif" font-size="13" font-weight="700">${escapeXml(CLASSIFICATION)}</text>`)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const filename = "phase-4r1-frozen-540-frame-timeline.png";
  await atomicWrite(path.join(outputRoot, "diagrams", filename), buffer);
  return { path: `diagrams/${filename}`, width, height, bytes: buffer.length, sha256: sha256(buffer) };
}

async function createAnimatics(outputRoot, workRoot, families, ffmpegPath) {
  const results = [];
  for (const family of FAMILIES) {
    const [width, height] = OUTPUT_DIMENSIONS[family];
    const sequence = families[family];
    results.push({
      ...await encodeSequence({ ffmpegPath, files: sequence.files, overlay: sequence.overlay, overlayDisableRanges: [[500, 512]], width, height,
        destination: path.join(outputRoot, "animatics", `phase-4r1-${family}-full-540f-30fps-h264.mp4`), workRoot, id: `${family}-full`, forwardGate: true }),
      family, direction: "forward", sourceResolution: [sequence.width, sequence.height],
      presentationResize: sequence.width === width && sequence.height === height ? "none" : `${sequence.width}x${sequence.height} source resized once to exact ${width}x${height} Level-A presentation`,
    });
  }
  const desktop = families.desktop;
  results.push({
    ...await encodeSequence({ ffmpegPath, files: [...desktop.files].reverse(), overlay: desktop.overlay, overlayDisableRanges: [[27, 39]], width: 1440, height: 900,
      destination: path.join(outputRoot, "animatics", "phase-4r1-desktop-reverse-540f-30fps-h264.mp4"), workRoot, id: "desktop-reverse" }),
    family: "desktop", direction: "reverse", sourceFrameOrder: "F540→F001", blackBeatOverlaySuppressed: "decoded indexes n27-n39 correspond to original F513-F501",
  });
  const jumpFramesForward = [1, 46, 106, 165, 225, 285, 292, 370, 460, 500, 501, 513, 514, 525, 540];
  const jumpFrames = [...jumpFramesForward, ...jumpFramesForward.slice(0, -1).reverse()];
  const jumpFiles = jumpFrames.flatMap((frame) => Array.from({ length: 6 }, () => desktop.files[frame - 1]));
  results.push({
    ...await encodeSequence({ ffmpegPath, files: jumpFiles, width: 1440, height: 900,
      destination: path.join(outputRoot, "animatics", "phase-4r1-desktop-fast-forward-reverse-state-progression-30fps-h264.mp4"), workRoot, id: "desktop-fast-forward-reverse" }),
    family: "desktop", direction: "forward-and-reverse-state-jump", sourceFrames: jumpFrames, holdFramesPerState: 6,
  });
  if (results.filter((record) => record.direction === "forward").length !== 3) throw new Error("animatic inventory lost a forward family");
  return results;
}

async function createCyclesMotionOutputs(outputRoot, workRoot, cyclesMotion, ffmpegPath) {
  const results = [];
  for (const role of MOTION_SAMPLE_ROLES) {
    const sample = cyclesMotion.selected[role.id];
    const destination = path.join(outputRoot, "cycles", "motion-samples", `phase-4r1-cycles-${role.id}-f${sample.frameStart}-f${sample.frameEnd}-30fps-h264.mp4`);
    results.push({
      ...await encodeSequence({ ffmpegPath, files: sample.frames, width: sample.width, height: sample.height, destination, workRoot, id: `cycles-${role.id}`, crf: 15 }),
      evidenceClass: "AUTHORIZED_SHORT_FINAL_QUALITY_CYCLES_MOTION_SAMPLE",
      sourceFrameRange: [sample.frameStart, sample.frameEnd],
      cyclesSettings: sample.settings ?? cyclesMotion.manifest.settings,
      fullProductionSequence: false,
    });
  }
  return results;
}

function privateHostPath(value) {
  if (typeof value !== "string") return false;
  const normalized = value.replaceAll("\\", "/");
  if (/file:\/{2,3}(?:[a-z]:\/|\/)/i.test(normalized)
    || /(?:^|[^a-z0-9])[a-z]:[\\/][^\s"'<>|]*/i.test(value)
    || /\\\\[^\\/\s]+[\\/][^\s"'<>|]*/i.test(value)) return true;
  if (/^https?:\/\//i.test(value.trim())) return false;
  return /(?:^|[^a-z0-9])\/(?:Users|home|private\/var|tmp|var\/tmp|mnt\/[a-z])\//i.test(normalized)
    || normalized.toLowerCase().includes(normalizedPath(ROOT).replaceAll("\\", "/").toLowerCase());
}

function sanitizedValue(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => sanitizedValue(item, key));
  if (value && typeof value === "object") {
    const result = {};
    for (const [childKey, child] of Object.entries(value)) {
      if (["outputRoot", "executable", "absolutePath", "temporaryRoot"].includes(childKey)) continue;
      result[childKey] = sanitizedValue(child, childKey);
    }
    return result;
  }
  if (typeof value === "string" && privateHostPath(value)) return `[redacted private host ${key || "path"}]`;
  return value;
}

async function writeSanitizedReport(outputRoot, sourcePath, filename, role) {
  const sourceBytes = await readFile(sourcePath);
  const parsed = JSON.parse(sourceBytes);
  const destination = path.join(outputRoot, "reports", filename);
  await atomicJson(destination, sanitizedValue(parsed));
  const data = await readFile(destination);
  return { role, path: `reports/${filename}`, bytes: data.length, sha256: sha256(data), sourceBytes: sourceBytes.length, sourceSha256: sha256(sourceBytes), sanitizedForPrivateHostPaths: true };
}

async function writeGeneratedReports(outputRoot, source, repository, assets) {
  const reports = [];
  const generated = {
    schema: "quantum-hub.phase-4-r1.proving-hall-summary.v1",
    status: "PASS",
    classification: CLASSIFICATION,
    derivative: source.derivativeAuthority,
    producerAuthorities: source.producerAuthorities,
    timeline: TIMELINE,
    hall: source.build.hall,
    cable: source.build.cable,
    currentMask: source.build.current_mask,
    cameraMotion: source.build.camera_motion,
    openingMeasurements: source.openingMeasurements,
    responsivePhysicalFitMeasurements: source.responsivePhysicalFitMeasurements,
    landscapeResponsiveCoverMeasurements: source.landscapeResponsiveCoverMeasurements,
    lighting: source.build.lighting,
    materials: source.build.materials,
    cyclesSettings: source.build.cycles_settings,
    repositoryImpact: repository.repositorySize,
    humanAcceptanceClaimed: false,
  };
  const summaryPath = path.join(outputRoot, "reports", "phase-4r1-proving-hall-source-summary.json");
  await atomicJson(summaryPath, sanitizedValue(generated));
  const summaryBytes = await readFile(summaryPath);
  reports.push({ role: "generated-proving-hall-summary", path: "reports/phase-4r1-proving-hall-source-summary.json", bytes: summaryBytes.length, sha256: sha256(summaryBytes) });

  const repositoryPath = path.join(outputRoot, "reports", "phase-4r1-repository-impact.json");
  await atomicJson(repositoryPath, repository);
  const repositoryBytes = await readFile(repositoryPath);
  reports.push({ role: "generated-repository-impact", path: "reports/phase-4r1-repository-impact.json", bytes: repositoryBytes.length, sha256: sha256(repositoryBytes) });

  const assetPath = path.join(outputRoot, "reports", "phase-4r1-asset-license-summary.json");
  await atomicJson(assetPath, sanitizedValue(assets.ledger));
  const assetBytes = await readFile(assetPath);
  reports.push({ role: "generated-asset-license-summary", path: "reports/phase-4r1-asset-license-summary.json", bytes: assetBytes.length, sha256: sha256(assetBytes), sourceSha256: assets.record.sha256 });

  const timelinePath = path.join(outputRoot, "reports", "phase-4r1-frozen-timeline.json");
  await atomicJson(timelinePath, { schema: "quantum-hub.phase-4-r1.timeline.v1", status: "PASS", classification: CLASSIFICATION, ...TIMELINE });
  const timelineBytes = await readFile(timelinePath);
  reports.push({ role: "generated-timeline", path: "reports/phase-4r1-frozen-timeline.json", bytes: timelineBytes.length, sha256: sha256(timelineBytes) });
  return reports;
}

function compactJson(value) {
  return `\n\`\`\`json\n${JSON.stringify(sanitizedValue(value), null, 2)}\n\`\`\``;
}

function assetLines(records, external = false) {
  if (!records.length) return "- None. The ledger explicitly records zero external assets.";
  return records.map((record) => external
    ? `- **${record.name}** — creator: ${record.creator}; license: ${record.license}; source: ${record.source}; downloaded: ${record.downloadDate}; original: ${record.originalFilename}; SHA-256 \`${record.sha256}\`; use: ${record.exactUse}; modified: ${record.modified}; packed: ${record.packedIntoBlend}.`
    : `- **${record.name}** — creator: ${record.creator}; project license: ${record.license}; provenance: ${record.source}; SHA-256/signature \`${record.sha256}\`; use: ${record.exactUse}; modified: ${record.modified}; packed: ${record.packedIntoBlend}.`).join("\n");
}

function readmeText({ generatedAt, ffmpeg, source, repository, assetLedger, animatics, cyclesStillOutputs, cyclesMotionOutputs, sheets, diagrams, reports }) {
  return `# Phase 4-R1 — The Proving Hall environment review

> **${CLASSIFICATION}**

This is a preproduction human-review package. It does not complete Phase 4,
authorize the full 540-frame production-quality render, begin runtime
integration, or authorize Phase 5. Seven native Cycles material/lighting
benchmark stills and two bounded 90-frame Cycles motion samples are expressly
authorized review evidence; the full production sequence has not started.

## Environment concept

The accepted old CRT sits in a maintained industrial validation hall after
hours. Facility infrastructure feeds a modeled distribution station, socket,
plug, strain relief, extended floor cable, broad proving spiral, and physical
rear CRT connection. The hall provides foreground infrastructure, an open
central proving zone, and authored background architecture on every side.
It is cinematic authorship, not a claim that this is Quantum-Hub's real factory.

## What changed

- A complete multi-layer proving hall replaces the sparse dark field.
- The cable now has an unambiguous facility origin and longer weighted route.
- The current is arc-length driven with a contiguous trail, broad front, black
  dormant segment, and localized surface response.
- The opening is high-oblique, then descends during the early orbit before the
  side/back/opposite-side/front progression.
- Desktop, mobile portrait, and short-landscape cameras remain authored families.
- The 390×844, 360×800, and 320×800 physical panels use source-measured
  center-cover from the authored mobile family. The 768×1024 panel uses explicit
  contain on deep physical black; it is a provisional tablet mapping, not
  accepted runtime behavior. Landscape neighbors use measured center-cover
  from the authored short-landscape family.

Per-viewport physical fit map:${compactJson(RESPONSIVE_VIEWPORTS)}

Hall authority:${compactJson(source.build.hall)}

Cable/source authority:${compactJson(source.build.cable)}

Current-mask authority:${compactJson(source.build.current_mask)}

## What remains frozen

The accepted CRT identity, indicator, warm-white phosphor wake, continuous
raster expansion, exact verified Quantum Q, Q hold, frontal push, glass
threshold, F501–513 breathing beat, F514–540 ENTRY resolve, semantic H1, route
composition, and Operating Field are conceptually frozen.

## Lighting and materials

Lighting authority:${compactJson(source.build.lighting)}

Material authority:${compactJson(source.build.materials)}

The dormant hall must remain neutral with zero environmental magenta. Current
light is localized. Cycles evidence uses the declared settings below and remains
subject to human material/lighting judgment.${compactJson(source.build.cycles_settings)}

## Camera system

Camera authority:${compactJson(source.build.camera_motion)}

F001 geometric opening authority:${compactJson(source.openingMeasurements)}

Responsive physical fit authority:${compactJson(source.responsivePhysicalFitMeasurements)}

Landscape neighbor center-cover bounds:${compactJson(source.landscapeResponsiveCoverMeasurements)}

The diagrams derive from per-frame real-camera telemetry in the authenticated
Eevee reports. Cable visibility fraction, projected bounds, world extents, and
arc length are surfaced as measurements, not as human composition acceptance.

## Assets and licensing

Authored assets:

${assetLines(assetLedger.authoredAssets)}

External assets:

${assetLines(assetLedger.externalAssets, true)}

Policy declaration:${compactJson(assetLedger.policy)}

## Render and encode strategy

- Package timestamp: \`${generatedAt}\`
- FFmpeg: \`${ffmpeg}\`
- Level A: three 540-frame Eevee animatics, reverse reconstruction, and a
  forward/reverse fast-state progression; all are exact 30 fps with no audio.
- Desktop Level-A presentation is exactly 1440×900. If its authenticated source
  is 960×600, the manifest discloses the single Lanczos presentation resize.
- F501–513 pre-encode plates are exact RGB black; decoded H.264 gates prove the
  nominal-black interval and F500/F514/F540 ordering.
- Level B: seven native Cycles physical stills at their original PNG quality,
  plus the separately labelled actual 844×390 browser ENTRY regression plate.
- Level C: two exact 90-frame/3-second Cycles samples, F46–135 and F391–480,
  encoded from continuous manifest-bound sequences at CRF 15.

## Included evidence

- Animatics: ${animatics.map((record) => `\`${record.path}\``).join(", ")}
- Cycles benchmarks: ${cyclesStillOutputs.map((record) => `\`${record.path}\``).join(", ")}
- Cycles motion: ${cyclesMotionOutputs.map((record) => `\`${record.path}\``).join(", ")}
- Sheets: ${sheets.map((record) => `\`${record.path}\``).join(", ")}
- Diagrams: ${diagrams.map((record) => `\`${record.path}\``).join(", ")}
- Reports: ${reports.map((record) => `\`${record.path}\``).join(", ")}

## Repository impact

${compactJson(repository.repositorySize)}

## What the human must judge

All six requested human gates remain pending. Automation has not selected any
human decision outcome. Review must judge world authority, cable origin/weight,
current continuity and lighting, orbit cinematography, premium material
potential, and regression of the accepted Q/threshold/ENTRY sequence.

## Limitations and checksum receipt

- Eevee is composition/motion evidence, not final material authority.
- Cycles benchmarks are bounded samples, not the final film.
- The no-full-production statement is bound to the exact source declarations
  and exhaustive supplied Cycles-root inventories; the packager rejects every
  unreferenced file in those roots rather than making a claim about unknown
  storage outside the governed workflow.
- Frustum intersection and CRT occupancy are geometric measurements; they do
  not infer occlusion-free visibility or human acceptance.
- A ZIP cannot contain its own final SHA-256 without changing that SHA-256.
  Therefore the exact archive byte size and SHA-256 are written only after ZIP
  closure into the adjacent detached \`${RESULT_FILENAME}\` checksum receipt
  and are also reported in the human handoff. The receipt is intentionally not
  inside the archive. The exact Blender SHA-256 is
  \`${source.derivativeAuthority.sha256}\` (${source.derivativeAuthority.bytes} bytes).
`;
}

async function packageFileRecords(root, files) {
  const records = [];
  for (const relativePath of [...files].sort(lexicalCompare)) {
    const data = await readFile(path.join(root, ...relativePath.split("/")));
    records.push({ path: relativePath, bytes: data.length, sha256: sha256(data) });
  }
  return records;
}

const MAX_EMBEDDED_METADATA_BYTES = 4 * 1024 * 1024;
const MP4_REGULAR_CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "dinf", "stbl", "edts", "udta", "ilst"]);
const MP4_TEXT_BOXES = new Set([
  "©nam", "©ART", "©alb", "©wrt", "©too", "©cmt", "©day", "©gen", "©grp", "©lyr", "©xyz",
  "auth", "cprt", "desc", "dscp", "kind", "ldes", "name", "titl", "xml ", "XMP_",
]);
const ADOBE_XMP_UUID = "be7acfcb97a942e89c71999491e3afac";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function metadataStrings(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((item) => metadataStrings(item, result));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      result.push(key);
      metadataStrings(child, result);
    }
  }
  return result;
}

function assertNoPrivateMetadata(strings, label) {
  if (strings.some((value) => privateHostPath(value))) throw new Error(`private host path leaked into ${label}`);
}

function mp4BoxHeader(data, offset, end, label) {
  if (offset + 8 > end) throw new Error(`${label} has a truncated MP4 box header at byte ${offset}`);
  let size = data.readUInt32BE(offset);
  const type = data.subarray(offset + 4, offset + 8).toString("latin1");
  let headerBytes = 8;
  if (size === 1) {
    if (offset + 16 > end) throw new Error(`${label} has a truncated extended MP4 box header at byte ${offset}`);
    const extended = data.readBigUInt64BE(offset + 8);
    if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} has an unsupported MP4 box size at byte ${offset}`);
    size = Number(extended);
    headerBytes = 16;
  } else if (size === 0) size = end - offset;
  if (size < headerBytes || offset + size > end) throw new Error(`${label} has an invalid MP4 box bound at byte ${offset}`);
  return { type, start: offset, payloadStart: offset + headerBytes, end: offset + size };
}

function appendBoundedMetadataText(result, payload, label, encoding = "utf8") {
  if (payload.length > MAX_EMBEDDED_METADATA_BYTES) throw new Error(`${label} exceeds the embedded metadata size limit`);
  if (encoding === "utf16be") {
    if (payload.length % 2) throw new Error(`${label} has malformed UTF-16 metadata`);
    const swapped = Buffer.from(payload);
    swapped.swap16();
    result.push(swapped.toString("utf16le"));
    return;
  }
  result.push(payload.toString(encoding));
  if (encoding === "utf8") result.push(payload.toString("latin1"));
}

function mp4TextMetadata(data, label = "MP4") {
  if (!Buffer.isBuffer(data) || data.length < 8) throw new Error(`${label} is not a bounded MP4 container`);
  const result = [];
  const topLevel = new Set();

  function walk(start, end, context) {
    let offset = start;
    while (offset < end) {
      const box = mp4BoxHeader(data, offset, end, label);
      if (context === "root") topLevel.add(box.type);

      if (box.type === "mdat") {
        // Encoded samples are deliberately opaque: byte patterns in H.264 entropy are not metadata.
      } else if (context === "ilst") {
        walk(box.payloadStart, box.end, "metadata-item");
      } else if (context === "metadata-item" && box.type === "data") {
        if (box.end - box.payloadStart < 8) throw new Error(`${label} has a truncated MP4 metadata data box`);
        const dataType = data.readUInt32BE(box.payloadStart) & 0x00ffffff;
        const payload = data.subarray(box.payloadStart + 8, box.end);
        if (dataType === 2) appendBoundedMetadataText(result, payload, label, "utf16be");
        else if (dataType === 0 || dataType === 1) appendBoundedMetadataText(result, payload, label);
      } else if (context === "metadata-item" && (box.type === "mean" || box.type === "name")) {
        if (box.end - box.payloadStart < 4) throw new Error(`${label} has a truncated MP4 freeform metadata box`);
        appendBoundedMetadataText(result, data.subarray(box.payloadStart + 4, box.end), label);
      } else if (box.type === "meta") {
        if (box.end - box.payloadStart < 4) throw new Error(`${label} has a truncated MP4 meta full-box header`);
        walk(box.payloadStart + 4, box.end, "meta");
      } else if (MP4_REGULAR_CONTAINERS.has(box.type)) {
        walk(box.payloadStart, box.end, box.type);
      } else if (MP4_TEXT_BOXES.has(box.type) || (context === "udta" && box.type.charCodeAt(0) === 0xa9)) {
        appendBoundedMetadataText(result, data.subarray(box.payloadStart, box.end), label);
      } else if (box.type === "uuid" && box.end - box.payloadStart >= 16
        && data.subarray(box.payloadStart, box.payloadStart + 16).toString("hex") === ADOBE_XMP_UUID) {
        appendBoundedMetadataText(result, data.subarray(box.payloadStart + 16, box.end), label);
      }
      offset = box.end;
    }
    if (offset !== end) throw new Error(`${label} has an unconsumed MP4 box tail`);
  }

  walk(0, data.length, "root");
  for (const required of ["ftyp", "moov", "mdat"]) {
    if (!topLevel.has(required)) throw new Error(`${label} lacks required top-level ${required} box`);
  }
  return result;
}

function pngNull(data, start, end, label) {
  const index = data.indexOf(0, start);
  if (index < start || index >= end) throw new Error(`${label} has a malformed PNG text field`);
  return index;
}

function inflatePngText(payload, label) {
  try {
    return inflateSync(payload, { maxOutputLength: MAX_EMBEDDED_METADATA_BYTES });
  } catch (error) {
    throw new Error(`${label} has invalid or oversized compressed PNG text metadata: ${error.message}`);
  }
}

function pngTextChunkMetadata(type, payload, label) {
  const result = [];
  const keywordEnd = pngNull(payload, 0, payload.length, label);
  if (keywordEnd < 1 || keywordEnd > 79) throw new Error(`${label} has an invalid PNG text keyword`);
  result.push(payload.subarray(0, keywordEnd).toString("latin1"));
  if (type === "tEXt") {
    appendBoundedMetadataText(result, payload.subarray(keywordEnd + 1), label, "latin1");
  } else if (type === "zTXt") {
    const methodOffset = keywordEnd + 1;
    if (methodOffset >= payload.length || payload[methodOffset] !== 0) throw new Error(`${label} has an unsupported zTXt compression method`);
    appendBoundedMetadataText(result, inflatePngText(payload.subarray(methodOffset + 1), label), label, "latin1");
  } else if (type === "iTXt") {
    let cursor = keywordEnd + 1;
    if (cursor + 2 > payload.length) throw new Error(`${label} has a truncated iTXt header`);
    const compressed = payload[cursor];
    const method = payload[cursor + 1];
    cursor += 2;
    if ((compressed !== 0 && compressed !== 1) || method !== 0) throw new Error(`${label} has invalid iTXt compression fields`);
    const languageEnd = pngNull(payload, cursor, payload.length, label);
    result.push(payload.subarray(cursor, languageEnd).toString("ascii"));
    cursor = languageEnd + 1;
    const translatedEnd = pngNull(payload, cursor, payload.length, label);
    appendBoundedMetadataText(result, payload.subarray(cursor, translatedEnd), label);
    cursor = translatedEnd + 1;
    const text = compressed ? inflatePngText(payload.subarray(cursor), label) : payload.subarray(cursor);
    appendBoundedMetadataText(result, text, label);
  } else throw new Error(`${label} requested an unsupported PNG text chunk`);
  return result;
}

function pngTextMetadata(data, label = "PNG") {
  if (!Buffer.isBuffer(data) || data.length < PNG_SIGNATURE.length || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${label} has an invalid PNG signature`);
  }
  const result = [];
  let offset = 8;
  let chunkIndex = 0;
  let sawIend = false;
  while (offset < data.length) {
    if (offset + 12 > data.length) throw new Error(`${label} has a truncated PNG chunk header`);
    const length = data.readUInt32BE(offset);
    const typeStart = offset + 4;
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    const chunkEnd = payloadEnd + 4;
    if (payloadEnd < payloadStart || chunkEnd > data.length) throw new Error(`${label} has an invalid PNG chunk bound`);
    const typeBytes = data.subarray(typeStart, payloadStart);
    const type = typeBytes.toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`${label} has an invalid PNG chunk type`);
    if (chunkIndex === 0 && type !== "IHDR") throw new Error(`${label} does not begin with IHDR`);
    if (sawIend) throw new Error(`${label} has bytes after IEND`);
    const payload = data.subarray(payloadStart, payloadEnd);

    if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const declaredCrc = data.readUInt32BE(payloadEnd);
      const actualCrc = crc32(data.subarray(typeStart, payloadEnd));
      if (declaredCrc !== actualCrc) throw new Error(`${label} has a PNG text chunk CRC mismatch`);
      result.push(...pngTextChunkMetadata(type, payload, label));
    }
    if (type === "IEND") {
      if (length !== 0) throw new Error(`${label} has a non-empty IEND chunk`);
      sawIend = true;
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  if (!sawIend) throw new Error(`${label} lacks IEND`);
  return result;
}

function sanitizePngPrivateMetadata(data, label = "PNG") {
  pngTextMetadata(data, label);
  const parts = [data.subarray(0, 8)];
  const removed = [];
  let offset = 8;
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    const chunkEnd = payloadEnd + 4;
    const type = data.subarray(offset + 4, payloadStart).toString("ascii");
    const payload = data.subarray(payloadStart, payloadEnd);
    if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const strings = pngTextChunkMetadata(type, payload, label);
      if (strings.some((value) => privateHostPath(value))) {
        removed.push({ type, keyword: strings[0], bytes: chunkEnd - offset });
        offset = chunkEnd;
        continue;
      }
    }
    parts.push(data.subarray(offset, chunkEnd));
    offset = chunkEnd;
  }
  const sanitized = Buffer.concat(parts);
  assertNoPrivateMetadata(pngTextMetadata(sanitized, `${label} sanitized copy`), `${label} sanitized PNG text metadata`);
  return { data: sanitized, removed };
}

async function ffprobeMetadata(ffmpegPath, filename, label) {
  const ffprobe = matchingFfprobe(ffmpegPath);
  await access(ffprobe);
  const result = await execFileAsync(ffprobe, [
    "-v", "error", "-show_entries", "format_tags:stream_tags", "-of", "json", filename,
  ], { windowsHide: true, maxBuffer: 2_000_000 });
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw new Error(`${label} produced malformed ffprobe metadata JSON`); }
  return metadataStrings(parsed);
}

function fixtureMp4Box(type, payload = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "latin1");
  if (typeBytes.length !== 4) throw new Error("internal MP4 fixture type must be four bytes");
  const box = Buffer.alloc(8 + payload.length);
  box.writeUInt32BE(box.length, 0);
  typeBytes.copy(box, 4);
  payload.copy(box, 8);
  return box;
}

function fixturePngChunk(type, payload = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length, 0);
  typeBytes.copy(chunk, 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + payload.length)), 8 + payload.length);
  return chunk;
}

function fixturePng(...chunks) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([PNG_SIGNATURE, fixturePngChunk("IHDR", ihdr), ...chunks, fixturePngChunk("IEND")]);
}

function expectFixtureFailure(operation, label) {
  try { operation(); }
  catch { return; }
  throw new Error(`media privacy self-test did not fail closed: ${label}`);
}

function assertMediaPrivacyScannerSelfTest() {
  const privatePath = "C:\\Users\\fixture-user\\private-project\\source.mov";
  const ftyp = fixtureMp4Box("ftyp", Buffer.from("isom\u0000\u0000\u0002\u0000isomiso2", "latin1"));
  const mediaOnlyMp4 = Buffer.concat([ftyp, fixtureMp4Box("moov"), fixtureMp4Box("mdat", Buffer.from(privatePath))]);
  assertNoPrivateMetadata(mp4TextMetadata(mediaOnlyMp4, "MP4 mdat fixture"), "MP4 mdat fixture metadata");

  const dataHeader = Buffer.alloc(8);
  dataHeader.writeUInt32BE(1, 0);
  const comment = fixtureMp4Box("©cmt", fixtureMp4Box("data", Buffer.concat([dataHeader, Buffer.from(privatePath)])));
  const metadataMp4 = Buffer.concat([
    ftyp,
    fixtureMp4Box("moov", fixtureMp4Box("udta", fixtureMp4Box("meta", Buffer.concat([Buffer.alloc(4), fixtureMp4Box("ilst", comment)])))),
    fixtureMp4Box("mdat", Buffer.from("opaque encoded sample")),
  ]);
  expectFixtureFailure(() => assertNoPrivateMetadata(mp4TextMetadata(metadataMp4, "MP4 metadata fixture"), "MP4 metadata fixture"), "MP4 metadata path");
  expectFixtureFailure(() => assertNoPrivateMetadata(metadataStrings({ format: { tags: { comment: privatePath } } }), "ffprobe fixture"), "ffprobe tag path");

  const idatOnlyPng = fixturePng(fixturePngChunk("IDAT", Buffer.from(privatePath)));
  assertNoPrivateMetadata(pngTextMetadata(idatOnlyPng, "PNG IDAT fixture"), "PNG IDAT fixture metadata");
  const textPng = fixturePng(fixturePngChunk("tEXt", Buffer.from(`Comment\0${privatePath}`, "latin1")));
  expectFixtureFailure(() => assertNoPrivateMetadata(pngTextMetadata(textPng, "PNG tEXt fixture"), "PNG tEXt fixture"), "PNG tEXt path");
  const sanitizedTextPng = sanitizePngPrivateMetadata(textPng, "PNG sanitization fixture");
  if (sanitizedTextPng.removed.length !== 1 || sanitizedTextPng.removed[0].keyword !== "Comment"
    || pngTextMetadata(sanitizedTextPng.data, "PNG sanitized fixture").some((value) => privateHostPath(value))) {
    throw new Error("media privacy self-test did not remove only the private PNG text chunk");
  }
  const ztxt = Buffer.concat([Buffer.from("Comment\0\0", "latin1"), deflateSync(Buffer.from(privatePath, "latin1"))]);
  expectFixtureFailure(() => assertNoPrivateMetadata(pngTextMetadata(fixturePng(fixturePngChunk("zTXt", ztxt)), "PNG zTXt fixture"), "PNG zTXt fixture"), "PNG zTXt path");
  const itxt = Buffer.concat([Buffer.from("Comment\0\0\0\0\0", "latin1"), Buffer.from(privatePath)]);
  expectFixtureFailure(() => assertNoPrivateMetadata(pngTextMetadata(fixturePng(fixturePngChunk("iTXt", itxt)), "PNG iTXt fixture"), "PNG iTXt fixture"), "PNG iTXt path");

  const corruptTextChunk = fixturePngChunk("tEXt", Buffer.from(`Comment\0${privatePath}`, "latin1"));
  corruptTextChunk[corruptTextChunk.length - 1] ^= 0x01;
  expectFixtureFailure(() => pngTextMetadata(fixturePng(corruptTextChunk), "PNG corrupt text fixture"), "PNG text CRC");
  const corruptMp4 = Buffer.from(metadataMp4);
  corruptMp4.writeUInt32BE(0x7fffffff, 0);
  expectFixtureFailure(() => mp4TextMetadata(corruptMp4, "MP4 corrupt bounds fixture"), "MP4 box bounds");

  return {
    status: "PASS",
    cases: 10,
    mediaPayloadExclusions: ["MP4 mdat", "PNG IDAT"],
    metadataPathFailures: ["ffprobe tags", "MP4 ilst/data", "PNG tEXt", "PNG zTXt", "PNG iTXt"],
    metadataSanitization: ["private PNG text chunk removed without touching image chunks"],
    malformedContainerFailures: ["MP4 box bounds", "PNG text CRC"],
  };
}

async function auditMediaPrivacyFixture(candidate, ffmpegOverride) {
  const filename = await assertFile(candidate, "media privacy fixture");
  const data = await readFile(filename);
  const extension = path.extname(filename).toLowerCase();
  let metadataFields;
  if (extension === ".mp4") {
    const ffmpegPath = await resolveFfmpeg(ffmpegOverride);
    const probeStrings = await ffprobeMetadata(ffmpegPath, filename, "media privacy fixture");
    const atomStrings = mp4TextMetadata(data, "media privacy fixture");
    assertNoPrivateMetadata(probeStrings, "media privacy fixture ffprobe metadata");
    assertNoPrivateMetadata(atomStrings, "media privacy fixture MP4 text metadata");
    metadataFields = { ffprobe: probeStrings.length, recognizedMp4TextAtoms: atomStrings.length };
  } else if (extension === ".png") {
    const strings = pngTextMetadata(data, "media privacy fixture");
    assertNoPrivateMetadata(strings, "media privacy fixture PNG text metadata");
    metadataFields = { pngText: strings.length };
  } else if (TEXT_EXTENSIONS.has(extension)) {
    if (privateHostPath(data.toString("utf8"))) throw new Error("private host path leaked into media privacy text fixture");
    metadataFields = { fullText: 1 };
  } else throw new Error("media privacy fixture must be a package text, MP4, or PNG file");
  return { status: "PASS", basename: path.basename(filename), bytes: data.length, sha256: sha256(data), metadataFields };
}

async function assertPackageSafety(root, files, ffmpegPath) {
  assertMediaPrivacyScannerSelfTest();
  const forbidden = /(?:^|\/)(?:raw|frames?|cache|caches|source)(?:\/|$)|\.(?:blend\d*|exr|abc|vdb|bphys|tmp|bak)$/i;
  for (const relativePath of files) {
    if (forbidden.test(relativePath)) throw new Error(`raw/source/cache leakage is forbidden: ${relativePath}`);
    const filename = path.join(root, ...relativePath.split("/"));
    const data = await readFile(filename);
    const extension = path.extname(relativePath).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      if (privateHostPath(data.toString("utf8"))) throw new Error(`private host path leaked into ${relativePath}`);
    } else if (extension === ".mp4") {
      assertNoPrivateMetadata(await ffprobeMetadata(ffmpegPath, filename, relativePath), `${relativePath} ffprobe metadata`);
      assertNoPrivateMetadata(mp4TextMetadata(data, relativePath), `${relativePath} MP4 text metadata`);
    } else if (extension === ".png") {
      assertNoPrivateMetadata(pngTextMetadata(data, relativePath), `${relativePath} PNG text metadata`);
    }
  }
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

function dosDateTime(date) {
  const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()));
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

async function createStoredZip(root, files, destination, generatedAt) {
  const local = [];
  const central = [];
  let offset = 0;
  const stamp = dosDateTime(new Date(generatedAt));
  for (const relativePath of [...files].sort(lexicalCompare)) {
    const name = Buffer.from(relativePath.replaceAll("\\", "/"), "utf8");
    const data = await readFile(path.join(root, ...relativePath.split("/")));
    if (data.length > 0xffffffff || offset + data.length > 0xffffffff) throw new Error("classic deterministic ZIP would exceed its 4 GiB limit");
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(20, 4); localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8); localHeader.writeUInt16LE(stamp.time, 10); localHeader.writeUInt16LE(stamp.day, 12);
    localHeader.writeUInt32LE(crc, 14); localHeader.writeUInt32LE(data.length, 18); localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26); localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, data);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); centralHeader.writeUInt16LE(0x0314, 4); centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8); centralHeader.writeUInt16LE(0, 10); centralHeader.writeUInt16LE(stamp.time, 12);
    centralHeader.writeUInt16LE(stamp.day, 14); centralHeader.writeUInt32LE(crc, 16); centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24); centralHeader.writeUInt16LE(name.length, 28); centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32); centralHeader.writeUInt16LE(0, 34); centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38); centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  await atomicWrite(destination, Buffer.concat([...local, centralBuffer, end]));
}

async function verifyStoredZip(archiveData, root, expectedFiles) {
  let cursor = 0;
  const entries = [];
  for (const expected of [...expectedFiles].sort(lexicalCompare)) {
    if (archiveData.readUInt32LE(cursor) !== 0x04034b50) throw new Error(`ZIP local header missing for ${expected}`);
    const method = archiveData.readUInt16LE(cursor + 8);
    const crc = archiveData.readUInt32LE(cursor + 14);
    const compressedSize = archiveData.readUInt32LE(cursor + 18);
    const uncompressedSize = archiveData.readUInt32LE(cursor + 22);
    const nameLength = archiveData.readUInt16LE(cursor + 26);
    const extraLength = archiveData.readUInt16LE(cursor + 28);
    const nameStart = cursor + 30;
    const name = archiveData.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const dataStart = nameStart + nameLength + extraLength;
    const data = archiveData.subarray(dataStart, dataStart + compressedSize);
    const source = await readFile(path.join(root, ...expected.split("/")));
    if (method !== 0 || name !== expected || compressedSize !== source.length || uncompressedSize !== source.length
      || crc !== crc32(source) || sha256(data) !== sha256(source)) {
      throw new Error(`ZIP stored entry failed name/size/CRC/SHA verification: ${expected}`);
    }
    entries.push({ path: name, bytes: source.length, crc32: crc.toString(16).padStart(8, "0"), sha256: sha256(source) });
    cursor = dataStart + compressedSize;
  }
  if (archiveData.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIP central directory does not begin after the verified local entries");
  return { status: "PASS", method: "independent sequential local-header/name/size/CRC32/SHA-256 comparison", entries: entries.length };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.mediaPrivacySelfTest) {
    const report = assertMediaPrivacyScannerSelfTest();
    if (options.mediaPrivacyFixture) report.fixture = await auditMediaPrivacyFixture(options.mediaPrivacyFixture, options.ffmpeg);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const externalRoots = {
    desktop: await assertExternalDirectory(options.desktopFrames, "--desktop-frames"),
    mobile: await assertExternalDirectory(options.mobileFrames, "--mobile-frames"),
    landscape: await assertExternalDirectory(options.landscapeFrames, "--landscape-frames"),
    r0Desktop: await assertExternalDirectory(options.r0DesktopFrames, "--r0-desktop-frames"),
    entry: await assertExternalDirectory(options.entryPlates, "--entry-plates"),
    review: await assertExternalDirectory(options.reviewStills, "--review-stills"),
    cyclesStills: await assertExternalDirectory(options.cyclesStills, "--cycles-stills"),
    cyclesMotion: await assertExternalDirectory(options.cyclesMotion, "--cycles-motion"),
  };
  const roots = Object.values(externalRoots);
  if (new Set(roots.map(normalizedPath)).size !== roots.length) throw new Error("all eight external input roots must be distinct");
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (isWithin(roots[left], roots[right]) || isWithin(roots[right], roots[left])) throw new Error("external input roots must not overlap or nest");
    }
  }
  await validateFreshExternalOutput(options.output, roots);

  const source = await resolveSourceAuthorities(options);
  const repository = await repositoryState();
  const entry = await resolveEntryPlates(externalRoots.entry, repository.head);
  const desktopEntry = await resolveDesktopEntryPlate(externalRoots.entry, entry.manifest);
  entry.family.desktop = desktopEntry.filename;
  const producers = source.producerAuthorities;
  const [desktop, mobile, landscape, r0Desktop, reviewStills, cyclesStills, cyclesMotion, assetLedger] = await Promise.all([
    resolvePhysicalSequence(externalRoots.desktop, "desktop", source.derivativeAuthority, source.sourceBuildRecord.sha256, producers.preproduction_renderer),
    resolvePhysicalSequence(externalRoots.mobile, "mobile", source.derivativeAuthority, source.sourceBuildRecord.sha256, producers.preproduction_renderer),
    resolvePhysicalSequence(externalRoots.landscape, "landscape", source.derivativeAuthority, source.sourceBuildRecord.sha256, producers.preproduction_renderer),
    resolvePhysicalSequence(externalRoots.r0Desktop, "desktop", source.derivativeAuthority, null, null, { r0: true }),
    resolveReviewStills(externalRoots.review, source.derivativeAuthority, source.sourceBuildRecord.sha256, producers.review_stills_renderer),
    resolveCyclesStills(externalRoots.cyclesStills, source.derivativeAuthority, source.sourceBuildRecord.sha256, entry.selected["landscape-844x390"].authority, producers.cycles_benchmarks_renderer),
    resolveCyclesMotion(externalRoots.cyclesMotion, source.derivativeAuthority, source.sourceBuildRecord.sha256, producers.preproduction_renderer),
    resolveAssetLedger(options.assetLedger, source.derivativeAuthority),
  ]);
  exactAuthority(source.build.asset_ledger, assetLedger.authority, "source build asset ledger");
  exactAuthority(source.validation.asset_ledger, assetLedger.authority, "source validation asset ledger");
  if (assetLedger.ledger.authoredAssets.length !== source.build.authored_environment_assets?.length
    || assetLedger.ledger.externalAssets.length !== source.build.external_assets?.length) {
    throw new Error("asset ledger counts do not match the exact source-build authored/external asset inventories");
  }
  const rawFamilies = { desktop, mobile, landscape };
  for (const family of FAMILIES) assertCameraReportMatchesBuild(rawFamilies[family], source.build.camera_motion[family]);
  const ffmpegPath = await resolveFfmpeg(options.ffmpeg);
  const ffmpeg = await ffmpegVersion(ffmpegPath);
  const generatedAt = stableGeneratedAt();

  await mkdir(options.output, { recursive: false });
  const outputResolved = await realpath(options.output);
  if (isWithin(ROOT, outputResolved)) throw new Error("created output unexpectedly resolves inside the repository");
  for (const directory of ["animatics", "cycles/benchmark-stills", "cycles/motion-samples", "regressions", "diagrams", "reports", "sheets"]) {
    await mkdir(path.join(outputResolved, ...directory.split("/")), { recursive: true });
  }
  const workRoot = path.join(outputResolved, `.phase4r1-work-${process.pid}`);
  await mkdir(workRoot);

  try {
    const families = {
      desktop: await buildFamily(desktop, desktopEntry.filename, workRoot),
      mobile: await buildFamily(mobile, entry.family.mobile, workRoot),
      landscape: await buildFamily(landscape, entry.family.landscape, workRoot),
    };
    const animatics = await createAnimatics(outputResolved, workRoot, families, ffmpegPath);
    const cyclesStillOutputs = await copyCyclesStills(outputResolved, cyclesStills);
    const cyclesMotionOutputs = await createCyclesMotionOutputs(outputResolved, workRoot, cyclesMotion, ffmpegPath);

    const diagrams = [];
    for (const family of FAMILIES) {
      diagrams.push(await createPathDiagram(outputResolved, families[family], "top"));
      diagrams.push(await createPathDiagram(outputResolved, families[family], "side"));
      diagrams.push(await createCameraGraphs(outputResolved, families[family]));
    }
    diagrams.push(await createTimelineDiagram(outputResolved));

    const sheets = [];
    sheets.push(...await createOverviewSheets(outputResolved, reviewStills));
    sheets.push(await createBeforeAfterSheet(outputResolved, r0Desktop, families.desktop));
    sheets.push(await createConductionSheet(outputResolved, families.desktop));
    sheets.push(await createLightingSheet(outputResolved, families.desktop));
    sheets.push(...await createOrbitSheets(outputResolved, families));
    sheets.push(...await createResponsiveSheets(outputResolved, workRoot, families, entry));
    sheets.push(await createCyclesSheet(outputResolved, cyclesStills));

    const reportCopies = [];
    for (const [sourcePath, filename, role] of [
      [source.sourceBuildPath, "phase-4r1-source-build-report.json", "source-build-report"],
      [source.sourceValidationPath, "phase-4r1-source-validation-report.json", "source-validation-report"],
      [assetLedger.ledgerPath, "phase-4r1-asset-ledger.json", "asset-ledger"],
      [entry.manifestPath, "phase-4r1-semantic-entry-plates-manifest.json", "semantic-entry-plates-manifest"],
      [reviewStills.manifestPath, "phase-4r1-review-stills-manifest.json", "review-stills-manifest"],
      [cyclesStills.manifestPath, "phase-4r1-cycles-benchmarks-manifest.json", "cycles-benchmark-manifest"],
      [cyclesMotion.manifestPath, "phase-4r1-cycles-motion-manifest.json", "cycles-motion-manifest"],
      [desktop.reportPath, "phase-4r1-desktop-eevee-render-report.json", "desktop-eevee-render-report"],
      [mobile.reportPath, "phase-4r1-mobile-eevee-render-report.json", "mobile-eevee-render-report"],
      [landscape.reportPath, "phase-4r1-landscape-eevee-render-report.json", "landscape-eevee-render-report"],
      [r0Desktop.reportPath, "phase-4r0-desktop-reference-render-report.json", "r0-desktop-reference-render-report"],
    ]) reportCopies.push(await writeSanitizedReport(outputResolved, sourcePath, filename, role));
    const generatedReports = await writeGeneratedReports(outputResolved, source, repository, assetLedger);
    const reports = [...reportCopies, ...generatedReports];

    await atomicWrite(path.join(outputResolved, README_FILENAME), readmeText({
      generatedAt, ffmpeg, source, repository, assetLedger: assetLedger.ledger,
      animatics, cyclesStillOutputs, cyclesMotionOutputs, sheets, diagrams, reports,
    }));

    const preManifestFiles = (await listFiles(outputResolved))
      .filter((relativePath) => !relativePath.startsWith(`${path.basename(workRoot)}/`))
      .filter((relativePath) => ![ARCHIVE_FILENAME, MANIFEST_FILENAME, RESULT_FILENAME].includes(relativePath));
    const files = await packageFileRecords(outputResolved, preManifestFiles);
    const manifest = {
      schema: "quantum-hub.phase-4-r1.proving-hall-environment-review.v1",
      status: "PASS",
      generatedAt,
      classification: CLASSIFICATION,
      authorization: {
        humanAccepted: false,
        phase4CompleteClaimed: false,
        fullProductionSequenceStarted: false,
        fullProductionSequenceTruthScope: "exact source-build/validation declarations plus exhaustive supplied evidence-root inventories",
        fullProductionSequenceAuthorized: false,
        authorizedCyclesBenchmarksRendered: true,
        authorizedCyclesMotionSamplesRendered: true,
        runtimeIntegrationStarted: false,
        phase5Authorized: false,
      },
      humanReviewGates: {
        provingHallEnvironmentAuthority: null,
        cableOriginAndPhysicalRoute: null,
        currentLegibilityAndLighting: null,
        orbitAndEnvironmentalCinematography: null,
        materialAndFinalQualityLighting: null,
        acceptedQAndThresholdRegression: null,
      },
      honesty: {
        automatedHumanDecisionEmitted: false,
        fullEeveeSequences: "three exact authenticated F001-F500 physical roots plus bounded black and actual ENTRY plates",
        cyclesInventory: "exactly seven native physical benchmark stills; 844x390 ENTRY is separately labelled browser evidence",
        cyclesMotionInventory: "exactly two continuous 90-frame authorized samples; no curated-still interpolation",
        suppliedCyclesRootsExhaustivelyInventoried: true,
        unreferencedCyclesFramesPresent: false,
        rawFramesIncluded: false,
        blenderSourceIncluded: false,
        exrOrCacheIncluded: false,
        outputExternalAndUntracked: true,
      },
      deterministicPolicy: {
        timestamp: generatedAt,
        archive: "stored classic ZIP; sorted UTF-8 entries; fixed UTC DOS timestamp",
        h264LevelA: "libx264 CRF18 slow yuv420p one thread metadata stripped",
        h264CyclesSamples: "libx264 CRF15 slow yuv420p one thread metadata stripped",
        ffmpeg,
        node: process.version,
        sharp: sharp.versions.sharp,
        libvips: sharp.versions.vips,
      },
      archivePlan: {
        filename: ARCHIVE_FILENAME,
        includesManifest: true,
        manifestExcludedFromOwnFileLedger: true,
        detachedChecksumReceipt: RESULT_FILENAME,
        detachedChecksumReceiptIncludedInArchive: false,
        selfHashExplanation: "a ZIP cannot contain its own final SHA-256 without changing that SHA-256",
      },
      repository,
      sourceAuthorities: {
        derivative: source.derivativeAuthority,
        sourceBuild: source.sourceBuildRecord,
        sourceValidation: source.sourceValidationRecord,
        trackedProducers: source.producerAuthorities,
        assetLedger: assetLedger.record,
        qAuthorities: { reversedSha256: Q_REVERSED_SHA256, colorSha256: Q_COLOR_SHA256 },
        eeveeReports: FAMILIES.map((family) => rawFamilies[family].renderReportRecord),
        r0ReferenceReport: r0Desktop.renderReportRecord,
        entryManifest: entry.manifestRecord,
        reviewStillManifest: reviewStills.manifestRecord,
        cyclesStillManifest: cyclesStills.manifestRecord,
        cyclesBenchmarkRenderReports: cyclesStills.renderReports,
        cyclesMotionManifest: cyclesMotion.manifestRecord,
        cyclesMotionRenderReports: cyclesMotion.renderReports,
      },
      sequenceAuthorities: {
        eevee: Object.fromEntries(FAMILIES.map((family) => [family, rawFamilies[family].sequenceAuthority])),
        r0Desktop: r0Desktop.sequenceAuthority,
      },
      timeline: TIMELINE,
      hall: sanitizedValue(source.build.hall),
      cable: sanitizedValue(source.build.cable),
      currentMask: sanitizedValue(source.build.current_mask),
      lighting: sanitizedValue(source.build.lighting),
      materials: sanitizedValue(source.build.materials),
      cameraMotion: sanitizedValue(source.build.camera_motion),
      openingMeasurements: sanitizedValue(source.openingMeasurements),
      responsivePhysicalFitMeasurements: sanitizedValue(source.responsivePhysicalFitMeasurements),
      landscapeResponsiveCoverMeasurements: sanitizedValue(source.landscapeResponsiveCoverMeasurements),
      cyclesSettings: sanitizedValue(source.build.cycles_settings),
      assets: {
        authoredCount: assetLedger.ledger.authoredAssets.length,
        externalCount: assetLedger.ledger.externalAssets.length,
        policy: assetLedger.ledger.policy,
        ledger: "reports/phase-4r1-asset-ledger.json",
      },
      responsiveFamilyMapping: RESPONSIVE_VIEWPORTS,
      animatics,
      cyclesBenchmarkStills: cyclesStillOutputs,
      cyclesMotionSamples: cyclesMotionOutputs,
      diagrams,
      sheets,
      reports,
      files,
      counts: {
        fullForwardEeveeAnimatics: 3,
        reverseAnimatics: 1,
        forwardReverseFastProgressions: 1,
        nativeCyclesPhysicalStills: 7,
        semanticEntryRegressionPlates: 1,
        cyclesMotionSamples: 2,
        cyclesMotionFrames: 180,
        cameraPathDiagrams: 6,
        cameraCurveDiagrams: 3,
        timelineDiagrams: 1,
        environmentOverviewPanels: 8,
        cableSourcePanels: 8,
        materialPanels: 8,
        beforeAfterPanels: 14,
        conductionPanels: 18,
        lightingPanels: 6,
        orbitMilestoneSheets: 3,
        orbitMilestonePanels: 33,
        responsiveSheets: 9,
        responsivePanels: 45,
      },
    };
    await atomicJson(path.join(outputResolved, MANIFEST_FILENAME), manifest);
    await rm(workRoot, { recursive: true, force: false });

    const archiveFiles = (await listFiles(outputResolved)).filter((relativePath) => ![ARCHIVE_FILENAME, RESULT_FILENAME].includes(relativePath));
    await assertPackageSafety(outputResolved, archiveFiles, ffmpegPath);
    const archivePath = path.join(outputResolved, ARCHIVE_FILENAME);
    await createStoredZip(outputResolved, archiveFiles, archivePath, generatedAt);
    const [archiveData, manifestData] = await Promise.all([readFile(archivePath), readFile(path.join(outputResolved, MANIFEST_FILENAME))]);
    const zipIntegrityGate = await verifyStoredZip(archiveData, outputResolved, archiveFiles);
    const result = {
      schema: "quantum-hub.phase-4-r1.proving-hall-environment-review.detached-checksum.v1",
      status: "PASS",
      generatedAt,
      classification: CLASSIFICATION,
      outputBasename: path.basename(outputResolved),
      archive: { filename: ARCHIVE_FILENAME, bytes: archiveData.length, sha256: sha256(archiveData), entries: archiveFiles.length },
      zipIntegrityGate,
      manifest: { filename: MANIFEST_FILENAME, bytes: manifestData.length, sha256: sha256(manifestData), excludedFromOwnFileLedger: true },
      fullProductionSequenceStarted: false,
      fullProductionSequenceTruthScope: "exact producer declarations and exhaustive supplied evidence-root inventories",
      runtimeIntegrationStarted: false,
      humanAccepted: false,
      phase5Authorized: false,
    };
    await atomicJson(path.join(outputResolved, RESULT_FILENAME), result);
    process.stdout.write(`Phase 4-R1 review package PASS: ${archivePath}\n`);
    process.stdout.write(`Archive SHA-256 ${result.archive.sha256}\n`);
  } catch (error) {
    await rm(workRoot, { recursive: true, force: true }).catch(() => {});
    await rm(outputResolved, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`Phase 4-R1 review packaging failed: ${error.stack ?? error}\n`);
  process.exitCode = 1;
});
