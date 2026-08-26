#!/usr/bin/env node

/**
 * Assemble the compact Phase 4-R1.1 targeted-repair human-review package.
 *
 * This consumer is intentionally fail closed. It never launches Blender,
 * never renders a frame, never copies a raw render sequence or .blend, never
 * integrates media into the site, and never emits a human acceptance result.
 * It consumes authenticated external evidence roots, privacy-cleans reused
 * checkpoint PNGs with decoded-pixel invariance, composes a few compact review
 * sheets/clips, writes a deterministic ZIP, and launches a separate Node
 * process for the final archive/manifest/media/privacy audit.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const PACKAGER_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(PACKAGER_FILE), "..");

const SCHEMA = "quantum-hub.phase-4-r1-1.targeted-repair-review-package.v1";
const RESULT_SCHEMA = `${SCHEMA}.detached-result`;
const AUDIT_SCHEMA = `${SCHEMA}.independent-audit`;
const BASE_HEAD = "bfbd3e6a07ab20cd034b4c669f3759287bd73c82";
const MAIN_AUTHORITY = "501040c42bba30b9d9517b88a8f9857992a2dba4";
const ARCHIVE_FILENAME = "phase-4r1-1-targeted-repair-review.zip";
const MANIFEST_FILENAME = "phase-4r1-1-targeted-repair-review-manifest.json";
const RESULT_FILENAME = "phase-4r1-1-targeted-repair-review-result.json";
const AUDIT_FILENAME = "phase-4r1-1-targeted-repair-review-audit.json";
const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
const README_FILENAME = "README.md";
const FIXED_EPOCH = "1980-01-01T00:00:00.000Z";
const MAX_PACKAGE_BYTES = 25_000_000;
const EXACT_Q_REPOSITORY_PATH = "artifacts/original/phase-4r1-refined-proving-hall/source/q-fidelity/quantum-icon-pre-crt-effect.png";
const EXACT_Q_SHA256 = "009c494df3b301470ab539f23e02b375f0c1fcec9b4b18cf07fc853b95fd03c5";
const EXACT_Q_BYTES = 69_348;
const PRIVATE_PATTERN = /(?:[a-z]:[\\/]users[\\/]|\/(?:users|home)\/[^/\s]+|file:\/\/|onedrive|appdata)/i;
const PNG_PRIVATE_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv", ".svg", ".html"]);

const HUMAN_REVIEW_GATES = Object.freeze({
  peripheralProvingHallAuthority: null,
  physicalGraphiteCurrent: null,
  mobileCameraOpticalContinuity: null,
  exactQAndCrtPhosphorAuthority: null,
  responsivePhysicalCinematicEvidence: null,
  acceptedR1Regression: null,
});

const AUTHORIZATION_DENIALS = Object.freeze({
  complete540FrameCyclesFilmStarted: false,
  complete540FrameCyclesFilmResumed: false,
  finalRefinedMediaIntegrationStarted: false,
  finalProductionCinematicEncodesStarted: false,
  phase5Authorized: false,
  humanAccepted: false,
});

const RESPONSIVE_STATES = Object.freeze([
  [1, "dormancy"],
  [76, "early-current"],
  [165, "mid-current"],
  [225, "side-rear-orbit"],
  [370, "stable-q"],
  [450, "late-approach"],
  [480, "threshold"],
]);
const RESPONSIVE_HOLDS = Object.freeze([12, 12, 12, 12, 12, 12, 12, 13, 15]);
const RESPONSIVE_VIEWPORTS = Object.freeze(["320x800", "360x800", "768x1024"]);
const MOBILE_MILESTONES = Object.freeze([1, 46, 76, 106, 135, 165, 195, 225, 255, 285, 356, 405, 450]);
const MOBILE_FOCAL_FRAMES = Object.freeze([1, 46, 76, 106, 135, 165, 195, 225, 255, 285, 356, 405, 450]);
const CABLE_COMPARISON_FILES = Object.freeze([
  "checkpoint2-cable-F047-first.png",
  "checkpoint2-cable-F106-25pct.png",
  "checkpoint2-cable-F166-50pct.png",
  "checkpoint2-cable-F225-75pct.png",
  "checkpoint2-cable-F261-90pct.png",
  "checkpoint2-cable-F285-arrival.png",
  "checkpoint2-cable-macro-reference.png",
]);
const PERIPHERY_FILES = Object.freeze([
  "normal-desktop-F001.png",
  "normal-desktop-F225.png",
  "detail-service-wall-detail.png",
  "detail-vent-recess-detail.png",
  "detail-opening-header-detail.png",
]);
const CABLE_CLOSE_FILES = Object.freeze([
  "macro/trail-F166.png",
  "macro/front-F261.png",
  "macro/front-F261-bloom-disabled.png",
]);
const CRT_STILL_FRAMES = Object.freeze([356, 370, 405, 406, 480]);
const BROWSER_ROLES = Object.freeze([
  "entry-settled-320x800",
  "entry-settled-360x800",
  "entry-settled-768x1024",
  "entry-settled-844x390",
  "chrome-hidden",
  "chrome-settled",
  "chrome-reverse",
  "skip-intro",
  "reduced-motion",
  "no-javascript",
  "native-scroll-operating-field",
]);
const EXPECTED_PACKAGE_COUNTS = Object.freeze({ ledgerFiles: 62, images: 39, videos: 6, text: 17 });
const EXPECTED_VIDEO_FRAMES = Object.freeze({
  "03-mobile-camera-optics/mobile-390x844-physical-F001-F500.mp4": 500,
  "03-mobile-camera-optics/mobile-390x844-orbit-F001-F285.mp4": 285,
  "04-exact-q-crt/video/phase4r1-1-q-phosphor-motion-F345-F464.mp4": 120,
  "05-responsive-physical/320x800/phase4r1-1-320x800-physical-forward-review.mp4": 112,
  "05-responsive-physical/360x800/phase4r1-1-360x800-physical-forward-review.mp4": 112,
  "05-responsive-physical/768x1024/phase4r1-1-768x1024-physical-forward-review.mp4": 112,
});
const REQUIRED_PACKAGE_PATHS = Object.freeze([
  "01-peripheral-proving-hall/r1-vs-r1-1-dormant-opening.jpg",
  "01-peripheral-proving-hall/intended-exposure-dormant-authority.png",
  "02-physical-graphite-current/comparisons/checkpoint2-cable-F070-10pct.jpg",
  "02-physical-graphite-current/close-crops/front-F261-bloom-disabled.png",
  "03-mobile-camera-optics/mobile-390x844-physical-F001-F500.mp4",
  "03-mobile-camera-optics/mobile-390x844-orbit-F001-F285.mp4",
  "03-mobile-camera-optics/mobile-lens-radius-elevation-projected-scale.svg",
  "03-mobile-camera-optics/mobile-optics-milestone-sheet.jpg",
  "03-mobile-camera-optics/final-mobile-focal-and-projected-scale-report.json",
  "04-exact-q-crt/stills/phase4r1-1-crt-stable-primary-F370.png",
  "04-exact-q-crt/video/phase4r1-1-q-phosphor-motion-F345-F464.mp4",
  "04-exact-q-crt/source/quantum-icon-pre-crt-effect.png",
  "04-exact-q-crt/reports/exact-q-source-difference.json",
  "05-responsive-physical/320x800/phase4r1-1-320x800-physical-sheet.jpg",
  "05-responsive-physical/320x800/phase4r1-1-320x800-physical-forward-review.mp4",
  "05-responsive-physical/360x800/phase4r1-1-360x800-physical-sheet.jpg",
  "05-responsive-physical/360x800/phase4r1-1-360x800-physical-forward-review.mp4",
  "05-responsive-physical/768x1024/phase4r1-1-768x1024-physical-sheet.jpg",
  "05-responsive-physical/768x1024/phase4r1-1-768x1024-physical-forward-review.mp4",
  "06-accepted-r1-regression/settled-entry-844x390.png",
  "06-accepted-r1-regression/chrome-active-concealed-844x390.png",
  "06-accepted-r1-regression/chrome-reverse-concealed-844x390.png",
  "06-accepted-r1-regression/reduced-motion-844x390.png",
  "06-accepted-r1-regression/no-javascript-844x390.png",
  "reports/git-and-source-authority.json",
  "reports/source-validation-summary.json",
  "reports/evidence-limitations.json",
  "reports/png-sanitation-report.json",
]);

const REJECTED_CRT_TRIALS = Object.freeze([
  {
    id: "initial-material-only",
    sourceSha256: "1f8d6d4b3e4ce9cf91898fe1cbaffa8d12ff2077cf03b4f2fa4f6bd75a24617e",
    evidenceRootAlias: "qsite-phase4r1-1-crt-phosphor-1f8d6d4b-f6083a14-20260825-2000",
    reason: "material-only trial lacked sufficient physical scatter; bounded motion was incomplete",
  },
  {
    id: "first-scatter",
    sourceSha256: "6f2e353c744c4dbccfc47df0f70e9965c87e11f3c5e23775d371a7830274c4b6",
    evidenceRootAlias: "qsite-phase4r1-1-crt-phosphor-6f2e353c-c8a96b53-20260825-2139-rejected-insufficient-halo-raster",
    reason: "Q still read as a dim decal; measured halo and raster modulation were below the review gate",
  },
  {
    id: "atomic-json-failure",
    sourceSha256: "6f2e353c744c4dbccfc47df0f70e9965c87e11f3c5e23775d371a7830274c4b6",
    evidenceRootAlias: "qsite-phase4r1-1-crt-phosphor-6f2e353c-d5d9729d-20260825-2129-rejected-atomic-json",
    reason: "renderer report publication failed atomically; zero accepted frames",
  },
  {
    id: "raster-aliasing",
    sourceSha256: "251362f011af38ae0d62f52feca64748027c708b7c2c47ad8efc229ac31e4a32",
    evidenceRootAlias: "qsite-phase4r1-1-crt-source-251362f0-4ab1a9f9-rejected-raster-aliasing",
    reason: "superseded calibration produced unacceptable raster aliasing",
  },
  {
    id: "wave-scale-miscalibration",
    sourceSha256: "37063d7aa161523bd00177d83dfff07f6a03474188b62904f8843851513e0079",
    evidenceRootAlias: "qsite-phase4r1-1-crt-source-37063d7a-91670ed1-rejected-wave-scale-miscalibration",
    reason: "superseded calibration used an incorrect Wave Texture scale-to-band interpretation",
  },
]);

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filename) {
  return sha256(await readFile(filename));
}

function validSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validCommit(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(parent, candidate) {
  const relative = path.relative(normalizedPath(parent), normalizedPath(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function pathExists(candidate) {
  try { await access(candidate); return true; }
  catch { return false; }
}

async function assertFile(candidate, label) {
  const resolved = await realpath(path.resolve(candidate));
  if (!(await stat(resolved)).isFile()) throw new Error(`${label} is not a file`);
  return resolved;
}

async function assertDirectory(candidate, label) {
  const resolved = await realpath(path.resolve(candidate));
  if (!(await stat(resolved)).isDirectory()) throw new Error(`${label} is not a directory`);
  return resolved;
}

async function assertExternalDirectory(candidate, label) {
  const resolved = await assertDirectory(candidate, label);
  if (isWithin(ROOT, resolved) || isWithin(resolved, ROOT)) throw new Error(`${label} must be external and non-overlapping with the repository`);
  if (/(?:rejected|quarantine|superseded)/i.test(resolved)) {
    throw new Error(`${label} resolves to a rejected/quarantined/superseded root`);
  }
  return resolved;
}

function safeRelative(value, label) {
  if (typeof value !== "string" || !value || path.isAbsolute(value)) throw new Error(`${label} must be a non-empty relative path`);
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`${label} is unsafe: ${value}`);
  }
  return normalized;
}

async function listFiles(root, relative = "") {
  const files = [];
  for (const entry of (await readdir(path.join(root, ...relative.split("/").filter(Boolean)), { withFileTypes: true }))
    .sort((left, right) => lexicalCompare(left.name, right.name))) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, next));
    else if (entry.isFile()) files.push(next.replaceAll("\\", "/"));
  }
  return files;
}

async function findSingle(root, matcher, label) {
  const candidates = (await listFiles(root)).filter((relative) => matcher.test(relative));
  if (candidates.length !== 1) throw new Error(`${label} expected one match and found ${candidates.length}`);
  return path.join(root, ...candidates[0].split("/"));
}

async function readJson(filename, label) {
  let value;
  try { value = JSON.parse(await readFile(filename, "utf8")); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must contain an object`);
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sanitizeValue(value) {
  if (typeof value === "string") return PRIVATE_PATTERN.test(value) ? "[redacted-private-path]" : value;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item)]));
  }
  return value;
}

function assertNoPrivateText(value, label) {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  if (PRIVATE_PATTERN.test(text)) throw new Error(`${label} contains a private host path token`);
}

async function atomicWrite(destination, bytes) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes);
  try { await rename(temporary, destination); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

async function atomicJson(destination, value) {
  await atomicWrite(destination, stableJson(value));
}

function recordFields(record, label) {
  if (!record || typeof record !== "object") throw new Error(`${label} must be an object`);
  const relativePath = safeRelative(record.relativePath ?? record.path, `${label}.path`);
  const byteSize = record.byteSize ?? record.bytes;
  const digest = String(record.sha256 ?? "").toLowerCase();
  if (!Number.isInteger(byteSize) || byteSize <= 0 || !validSha256(digest)) throw new Error(`${label} lacks byte-size/SHA-256 authority`);
  return { relativePath, byteSize, sha256: digest };
}

async function authenticateRecord(root, record, label) {
  const authority = recordFields(record, label);
  const declared = path.resolve(root, ...authority.relativePath.split("/"));
  if (!isWithin(root, declared) || !(await pathExists(declared))) throw new Error(`${label} is missing or escapes its root`);
  const filename = await realpath(declared);
  if (!isWithin(root, filename)) throw new Error(`${label} resolves outside its root`);
  const bytes = await readFile(filename);
  if (bytes.length !== authority.byteSize || sha256(bytes) !== authority.sha256) throw new Error(`${label} hash/size mismatch`);
  return { ...authority, filename, sourceRecord: record };
}

function assertStatusPass(value, label) {
  if (String(value?.status ?? "").toUpperCase() !== "PASS") throw new Error(`${label} must state PASS`);
}

function assertAuthorizationDenied(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} authorization is missing`);
  const entries = Object.entries(value);
  if (entries.length < 4 || !entries.some(([key]) => /(?:phase5|human|film|render|integration|deployment|production|generative)/i.test(key))) throw new Error(`${label} authorization lacks explicit boundary denials`);
  for (const [key, flag] of entries) if (flag !== false) throw new Error(`${label}.${key} must be Boolean false`);
}

function assertAcceptedR1Authorization(value, label) {
  const expected = {
    chromeStatePolicyImplementationEvidenced: true,
    full540FrameCyclesProductionFilmResumed: false,
    full540FrameCyclesProductionFilmStarted: false,
    humanAccepted: false,
    phase5Authorized: false,
    refinedPhysicalMediaRuntimeIntegrationStarted: false,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort(lexicalCompare)) !== JSON.stringify(Object.keys(expected).sort(lexicalCompare))
    || Object.entries(expected).some(([key, expectedValue]) => value[key] !== expectedValue)) {
    throw new Error(`${label} accepted-R1 authorization/evidence boundary differs`);
  }
}

function assertHumanPending(value, label) {
  let recognized = false;
  for (const key of ["humanReviewDecision", "humanReviewGate", "humanAccepted", "humanAcceptance", "decision"]) {
    if (key in (value ?? {})) {
      recognized = true;
      if (![null, false, "PENDING"].includes(value[key])) throw new Error(`${label}.${key} contains a non-pending human decision`);
    }
  }
  if (!recognized) throw new Error(`${label} lacks an explicit pending human-decision field`);
}

function parseArguments(argv) {
  const options = {
    peripheryRoot: null,
    cableDiagnosticRoot: null,
    cableComparisonRoot: null,
    mobileRoot: null,
    r1ReferenceRoot: null,
    crtPublicRoot: null,
    physicalPublicRoot: null,
    browserRoot: null,
    source: null,
    sourceSha256: null,
    sourceBytes: null,
    sourceBuildReport: null,
    sourceBuildSha256: null,
    sourceBuildBytes: null,
    branch: null,
    head: null,
    parent: null,
    upstreamHead: null,
    liveRemoteHead: null,
    localMain: null,
    liveRemoteMain: null,
    output: null,
    ffmpeg: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobe: process.env.FFPROBE_PATH ?? "ffprobe",
    help: false,
    selfTest: false,
    printContract: false,
    dryValidate: false,
    auditExisting: null,
    detachedManifest: null,
  };
  const flags = new Map([
    ["--periphery-root", "peripheryRoot"],
    ["--cable-diagnostic-root", "cableDiagnosticRoot"],
    ["--cable-comparison-root", "cableComparisonRoot"],
    ["--mobile-root", "mobileRoot"],
    ["--r1-reference-root", "r1ReferenceRoot"],
    ["--crt-public-root", "crtPublicRoot"],
    ["--physical-public-root", "physicalPublicRoot"],
    ["--browser-root", "browserRoot"],
    ["--source", "source"],
    ["--source-sha256", "sourceSha256"],
    ["--source-bytes", "sourceBytes"],
    ["--source-build-report", "sourceBuildReport"],
    ["--source-build-sha256", "sourceBuildSha256"],
    ["--source-build-bytes", "sourceBuildBytes"],
    ["--branch", "branch"],
    ["--head", "head"],
    ["--parent", "parent"],
    ["--upstream-head", "upstreamHead"],
    ["--live-remote-head", "liveRemoteHead"],
    ["--local-main", "localMain"],
    ["--live-remote-main", "liveRemoteMain"],
    ["--output", "output"],
    ["--ffmpeg", "ffmpeg"],
    ["--ffprobe", "ffprobe"],
    ["--audit-existing", "auditExisting"],
    ["--manifest", "detachedManifest"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (flags.has(token)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
      options[flags.get(token)] = value;
      index += 1;
    } else if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--self-test") options.selfTest = true;
    else if (token === "--print-input-contract") options.printContract = true;
    else if (token === "--dry-validate") options.dryValidate = true;
    else throw new Error(`unknown argument: ${token}`);
  }
  for (const key of ["sourceBytes", "sourceBuildBytes"]) {
    if (options[key] !== null) {
      options[key] = Number(options[key]);
      if (!Number.isInteger(options[key]) || options[key] <= 0) throw new Error(`--${key} must be a positive integer`);
    }
  }
  return options;
}

function inputContractTemplate() {
  return {
    schema: `${SCHEMA}.input-contract`,
    requiredFlags: [
      "--periphery-root", "--cable-diagnostic-root", "--cable-comparison-root", "--mobile-root",
      "--r1-reference-root", "--crt-public-root", "--physical-public-root", "--browser-root",
      "--source", "--source-sha256", "--source-bytes", "--source-build-report",
      "--source-build-sha256", "--source-build-bytes", "--branch", "--head", "--parent",
      "--upstream-head", "--live-remote-head", "--local-main", "--live-remote-main", "--output",
    ],
    outputBasename: ARCHIVE_FILENAME,
    baseHead: BASE_HEAD,
    frozenMain: MAIN_AUTHORITY,
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION_DENIALS,
    finalPhysicalManifest: {
      path: "manifests/final-physical-public-manifest.json",
      schema: "quantum-hub.phase-4-r1-1.final-physical-public-manifest.v1",
      payloadCount: 32,
    },
    finalCrtManifest: {
      path: "reports/crt-phosphor-public-manifest.json",
      schema: "quantum-hub.phase-4-r1-1.crt-phosphor-public-manifest.v1",
    },
    browserManifest: {
      path: "phase-4r1-1-browser-regression-report.json",
      schema: "quantum-hub.phase-4r1-1.browser-regression-evidence.v1",
      requiredRoles: BROWSER_ROLES,
    },
    packageLimitBytes: MAX_PACKAGE_BYTES,
  };
}

function printHelp() {
  process.stdout.write(`Phase 4-R1.1 targeted-repair deterministic packager\n\n`);
  process.stdout.write(`Pure checks:\n  node scripts/package-phase4r1-1-targeted-repair-review.mjs --self-test\n  node scripts/package-phase4r1-1-targeted-repair-review.mjs --print-input-contract\n\n`);
  process.stdout.write(`Assembly requires every flag listed by --print-input-contract. Add --dry-validate to authenticate and plan without writing.\n`);
  process.stdout.write(`--output must name a fresh external ${ARCHIVE_FILENAME}. The sibling manifest/result/audit receipts remain outside Git.\n`);
}

function pngChunkInventory(bytes, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error(`${label} has an invalid PNG signature`);
  let offset = 8;
  const chunks = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error(`${label} has a truncated PNG chunk header`);
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error(`${label} has a truncated ${type} chunk`);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(bytes.subarray(offset + 4, offset + 8 + length));
    if (expectedCrc !== actualCrc) throw new Error(`${label} ${type} CRC mismatch`);
    chunks.push({ type, length });
    offset = end;
    if (type === "IEND") break;
  }
  if (offset !== bytes.length || chunks.at(-1)?.type !== "IEND") throw new Error(`${label} has trailing bytes or lacks IEND`);
  return chunks;
}

async function decodedPixelAuthority(input) {
  const { data, info } = await sharp(input, { failOn: "error" }).raw().toBuffer({ resolveWithObject: true });
  return {
    data,
    sha256: sha256(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

async function sanitizePng(source, destination) {
  const sourceBytes = await readFile(source);
  pngChunkInventory(sourceBytes, path.basename(source));
  const before = await decodedPixelAuthority(sourceBytes);
  const output = await sharp(before.data, {
    raw: { width: before.width, height: before.height, channels: before.channels },
  }).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, force: true }).toBuffer();
  const after = await decodedPixelAuthority(output);
  if (before.sha256 !== after.sha256 || before.width !== after.width || before.height !== after.height || before.channels !== after.channels) {
    throw new Error(`PNG sanitation changed decoded pixels: ${path.basename(source)}`);
  }
  const chunks = pngChunkInventory(output, path.basename(destination));
  if (chunks.some((chunk) => PNG_PRIVATE_CHUNKS.has(chunk.type))) throw new Error(`PNG sanitation retained a private metadata chunk: ${path.basename(source)}`);
  assertNoPrivateText(output, `sanitized PNG ${path.basename(source)}`);
  await atomicWrite(destination, output);
  return {
    sourceBytes: sourceBytes.length,
    sourceSha256: sha256(sourceBytes),
    outputBytes: output.length,
    outputSha256: sha256(output),
    decodedPixelsSha256: before.sha256,
    decodedPixelsUnchanged: true,
    width: before.width,
    height: before.height,
    channels: before.channels,
    removedChunkTypes: [...new Set(pngChunkInventory(sourceBytes, path.basename(source)).filter((chunk) => PNG_PRIVATE_CHUNKS.has(chunk.type)).map((chunk) => chunk.type))],
  };
}

async function copyCleanImage(source, destination, { reusedBlenderPng = false } = {}) {
  const extension = path.extname(source).toLowerCase();
  if (extension === ".png") return sanitizePng(source, destination);
  const bytes = await readFile(source);
  if (PRIVATE_PATTERN.test(bytes.toString("latin1"))) throw new Error(`image contains a private path token: ${path.basename(source)}`);
  await sharp(bytes, { failOn: "error" }).metadata();
  await atomicWrite(destination, bytes);
  return {
    sourceBytes: bytes.length,
    sourceSha256: sha256(bytes),
    outputBytes: bytes.length,
    outputSha256: sha256(bytes),
    decodedPixelsUnchanged: reusedBlenderPng ? null : true,
  };
}

async function copySanitizedText(source, destination) {
  const extension = path.extname(source).toLowerCase();
  const original = await readFile(source, "utf8");
  let output;
  if (extension === ".json") output = stableJson(sanitizeValue(JSON.parse(original)));
  else output = PRIVATE_PATTERN.test(original) ? original.split(/\r?\n/).map((line) => PRIVATE_PATTERN.test(line) ? "[redacted-private-path]" : line).join("\n") : original;
  assertNoPrivateText(output, path.basename(destination));
  await atomicWrite(destination, output);
  return { sourceBytes: Buffer.byteLength(original), sourceSha256: sha256(Buffer.from(original)), outputBytes: Buffer.byteLength(output), outputSha256: sha256(Buffer.from(output)) };
}

async function resolveExecutable(value, label) {
  if (/[\\/]/.test(value)) return assertFile(value, label);
  const { stdout } = await execFileAsync(process.platform === "win32" ? "where.exe" : "which", [value], { encoding: "utf8", windowsHide: true });
  const candidate = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!candidate) throw new Error(`${label} could not be located`);
  return assertFile(candidate, label);
}

async function probeVideo(ffprobe, filename, countFrames = true) {
  const args = [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams",
    ...(countFrames ? ["-count_frames"] : []), filename,
  ];
  const { stdout } = await execFileAsync(ffprobe, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const value = JSON.parse(stdout);
  const videoStreams = (value.streams ?? []).filter((stream) => stream.codec_type === "video");
  if (videoStreams.length !== 1 || (value.streams ?? []).length !== 1) throw new Error(`${path.basename(filename)} must contain exactly one video stream`);
  const stream = videoStreams[0];
  return {
    codec: stream.codec_name,
    pixelFormat: stream.pix_fmt,
    width: Number(stream.width),
    height: Number(stream.height),
    averageFrameRate: stream.avg_frame_rate,
    nominalFrameRate: stream.r_frame_rate,
    frameCount: Number(stream.nb_read_frames ?? stream.nb_frames),
    durationSeconds: Number(stream.duration ?? value.format?.duration),
    streamCount: value.streams.length,
    metadata: { stream: stream.tags ?? {}, format: value.format?.tags ?? {} },
  };
}

async function fullDecodeVideo(ffmpeg, filename) {
  await execFileAsync(ffmpeg, ["-v", "error", "-nostdin", "-i", filename, "-map", "0:v:0", "-f", "null", "-"], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
}

async function copyCleanVideo(source, destination, ffmpeg, ffprobe) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp.mp4`;
  await execFileAsync(ffmpeg, [
    "-v", "error", "-nostdin", "-i", source, "-map", "0:v:0", "-c", "copy",
    "-map_metadata", "-1", "-metadata", "creation_time=", "-movflags", "+faststart", "-y", temporary,
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  await rename(temporary, destination);
  const probe = await probeVideo(ffprobe, destination);
  await fullDecodeVideo(ffmpeg, destination);
  const bytes = await readFile(destination);
  if (PRIVATE_PATTERN.test(bytes.toString("latin1")) || PRIVATE_PATTERN.test(JSON.stringify(probe.metadata))) {
    throw new Error(`video privacy scan failed: ${path.basename(source)}`);
  }
  return { ...probe, bytes: bytes.length, sha256: sha256(bytes), fullDecodePass: true };
}

function svgEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function labelSvg(width, height, lines, { fontSize = 28, background = "#09080c", color = "#f2edf7" } = {}) {
  const text = lines.map((line, index) => `<text x="24" y="${36 + index * (fontSize + 8)}" font-size="${fontSize}" fill="${color}" font-family="Arial, sans-serif">${svgEscape(line)}</text>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${background}"/>${text}</svg>`);
}

async function createSideBySideSheet(left, right, destination, leftLabel, rightLabel) {
  const panelWidth = 960;
  const panelHeight = 600;
  const header = 74;
  const leftBuffer = await sharp(left).resize(panelWidth, panelHeight, { fit: "contain", background: "#020204" }).png().toBuffer();
  const rightBuffer = await sharp(right).resize(panelWidth, panelHeight, { fit: "contain", background: "#020204" }).png().toBuffer();
  const headerBuffer = labelSvg(panelWidth * 2, header, [`${leftLabel}                                      ${rightLabel}`], { fontSize: 25 });
  const output = await sharp({ create: { width: panelWidth * 2, height: panelHeight + header, channels: 3, background: "#020204" } })
    .composite([
      { input: headerBuffer, left: 0, top: 0 },
      { input: leftBuffer, left: 0, top: header },
      { input: rightBuffer, left: panelWidth, top: header },
    ]).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  await atomicWrite(destination, output);
  return { width: panelWidth * 2, height: panelHeight + header, bytes: output.length, sha256: sha256(output) };
}

async function createContactSheet(panels, destination, { columns = 3, panelWidth = 300, panelHeight = 500, title = "" } = {}) {
  const labelHeight = 54;
  const titleHeight = title ? 64 : 0;
  const rows = Math.ceil(panels.length / columns);
  const width = columns * panelWidth;
  const height = titleHeight + rows * (panelHeight + labelHeight);
  const composites = [];
  if (title) composites.push({ input: labelSvg(width, titleHeight, [title], { fontSize: 28 }), left: 0, top: 0 });
  for (let index = 0; index < panels.length; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * panelWidth;
    const top = titleHeight + row * (panelHeight + labelHeight);
    const image = await sharp(panels[index].source).resize(panelWidth, panelHeight, { fit: "contain", background: "#020204" }).png().toBuffer();
    composites.push({ input: image, left, top });
    composites.push({ input: labelSvg(panelWidth, labelHeight, [panels[index].label], { fontSize: 20 }), left, top: top + panelHeight });
  }
  const output = await sharp({ create: { width, height, channels: 3, background: "#020204" } })
    .composite(composites).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
  await atomicWrite(destination, output);
  return { width, height, bytes: output.length, sha256: sha256(output) };
}

async function hardLinkOrCopy(source, destination) {
  try { await link(source, destination); }
  catch { await copyFile(source, destination); }
}

async function createResponsiveClip(stateImages, destination, workRoot, ffmpeg, ffprobe, viewport) {
  if (stateImages.length !== 9) throw new Error(`${viewport} responsive clip requires exactly nine states`);
  const frameRoot = path.join(workRoot, `responsive-${viewport}-${randomUUID()}`);
  await mkdir(frameRoot, { recursive: true });
  let frame = 1;
  for (let state = 0; state < stateImages.length; state += 1) {
    for (let count = 0; count < RESPONSIVE_HOLDS[state]; count += 1) {
      await hardLinkOrCopy(stateImages[state], path.join(frameRoot, `F${String(frame).padStart(3, "0")}.png`));
      frame += 1;
    }
  }
  if (frame - 1 !== 112) throw new Error("responsive clip frame-allocation bug");
  const [width, height] = viewport.split("x").map(Number);
  await mkdir(path.dirname(destination), { recursive: true });
  await execFileAsync(ffmpeg, [
    "-v", "error", "-nostdin", "-framerate", "30", "-start_number", "1", "-i", path.join(frameRoot, "F%03d.png"),
    "-frames:v", "112", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
    "-threads", "1", "-map_metadata", "-1", "-metadata", "creation_time=", "-movflags", "+faststart", "-y", destination,
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const probe = await probeVideo(ffprobe, destination);
  await fullDecodeVideo(ffmpeg, destination);
  if (probe.width !== width || probe.height !== height || probe.frameCount !== 112 || probe.codec !== "h264" || probe.pixelFormat !== "yuv420p") {
    throw new Error(`${viewport} responsive clip probe differs from 112-frame H.264 contract`);
  }
  await rm(frameRoot, { recursive: true, force: true });
  return { ...probe, fullDecodePass: true };
}

function collectFileRecords(value, output = [], seen = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectFileRecords(item, output, seen);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  const candidatePath = value.relativePath ?? value.path;
  const candidateBytes = value.byteSize ?? value.bytes;
  if (typeof candidatePath === "string" && Number.isInteger(candidateBytes) && validSha256(String(value.sha256 ?? "").toLowerCase())) {
    const key = candidatePath.replaceAll("\\", "/");
    if (!seen.has(key)) {
      seen.add(key);
      output.push(value);
    }
  }
  for (const item of Object.values(value)) collectFileRecords(item, output, seen);
  return output;
}

async function authenticateRecords(root, records, label) {
  const result = [];
  for (let index = 0; index < records.length; index += 1) result.push(await authenticateRecord(root, records[index], `${label}[${index}]`));
  return result;
}

function byRelative(records, relative, label) {
  const normalized = relative.replaceAll("\\", "/");
  const record = records.find((item) => item.relativePath === normalized || item.relativePath.endsWith(`/${normalized}`));
  if (!record) throw new Error(`${label} is absent from authenticated records: ${relative}`);
  return record;
}

function byPathTokens(records, tokens, label) {
  const candidates = records.filter((record) => tokens.every((token) => JSON.stringify(record.sourceRecord).toLowerCase().includes(token.toLowerCase()) || record.relativePath.toLowerCase().includes(token.toLowerCase())));
  if (candidates.length !== 1) throw new Error(`${label} expected one authenticated record and found ${candidates.length}`);
  return candidates[0];
}

function extractFinalSourceSha(value) {
  const candidates = [
    value?.finalBlenderSource?.sha256,
    value?.sourceAuthorities?.derivative?.sha256,
    value?.sourceAuthorities?.source?.sha256,
    value?.source?.sha256,
  ].filter(validSha256);
  return [...new Set(candidates)];
}

async function resolvePeriphery(root) {
  const manifestPath = await findSingle(root, /(?:^|\/)phase4r1-1-periphery-checkpoint-diagnostic\.json$/i, "periphery manifest");
  const manifest = await readJson(manifestPath, "periphery manifest");
  assertStatusPass(manifest, "periphery manifest");
  assertAuthorizationDenied(manifest.authorization, "periphery manifest");
  assertHumanPending(manifest, "periphery manifest");
  if (manifest.reusedRecoveredOldVisualEvidence !== false) throw new Error("periphery evidence must be newly rendered checkpoint evidence");
  const records = await authenticateRecords(root, manifest.files ?? [], "periphery files");
  for (const relative of PERIPHERY_FILES) byRelative(records, relative, "periphery role");
  return { root, manifestPath, manifest, records };
}

async function resolveCableDiagnostic(root) {
  const manifestPath = await findSingle(root, /(?:^|\/)phase4r1-1-cable-diagnostic\.json$/i, "cable diagnostic manifest");
  const manifest = await readJson(manifestPath, "cable diagnostic manifest");
  assertStatusPass(manifest, "cable diagnostic manifest");
  assertAuthorizationDenied(manifest.authorization, "cable diagnostic manifest");
  assertHumanPending(manifest, "cable diagnostic manifest");
  if (manifest.evaluatedProgression?.oneNondecreasingContiguousPrefixAtEveryFrame !== true) throw new Error("cable evaluated continuity did not pass");
  const records = await authenticateRecords(root, manifest.files ?? [], "cable diagnostic files");
  for (const relative of CABLE_CLOSE_FILES) byRelative(records, relative, "cable close-up role");
  return { root, manifestPath, manifest, records };
}

async function resolveCableComparison(root) {
  const manifestPath = await findSingle(root, /(?:^|\/)checkpoint2-cable-comparison-manifest\.json$/i, "cable comparison manifest");
  const manifest = await readJson(manifestPath, "cable comparison manifest");
  assertStatusPass(manifest, "cable comparison manifest");
  assertAuthorizationDenied(manifest.authorization, "cable comparison manifest");
  assertHumanPending(manifest, "cable comparison manifest");
  if (manifest.rawFramesCopied !== false || manifest.rawSequencesIncluded !== false || manifest.outputInventoryExhaustive !== true) {
    throw new Error("cable comparison package boundary is not closed");
  }
  const records = await authenticateRecords(root, manifest.files ?? [], "cable comparison files");
  for (const relative of CABLE_COMPARISON_FILES) byRelative(records, relative, "cable comparison role");
  return { root, manifestPath, manifest, records };
}

async function resolveMobile(root) {
  const diagnosticPath = await findSingle(root, /(?:^|\/)phase4r1-1-mobile-optics-diagnostic\.json$/i, "mobile optics diagnostic");
  const diagnostic = await readJson(diagnosticPath, "mobile optics diagnostic");
  assertStatusPass(diagnostic, "mobile optics diagnostic");
  assertAuthorizationDenied(diagnostic.authorization, "mobile optics diagnostic");
  assertHumanPending(diagnostic.humanReview ?? diagnostic, "mobile optics diagnostic");
  if (diagnostic.frame501Through540RenderedOrEncoded !== false || diagnostic.complete540FrameCyclesFilmStarted !== false || diagnostic.finalRefinedMediaIntegrationStarted !== false) {
    throw new Error("mobile diagnostic crossed a prohibited boundary");
  }
  const finalizationPath = await findSingle(root, /(?:^|\/)mobile-animatic-finalization\.json$/i, "mobile animatic finalization");
  const finalization = await readJson(finalizationPath, "mobile animatic finalization");
  if (finalization.schema !== "quantum-hub.phase-4-r1-1.mobile-physical-animatic-finalization.v1" || finalization.status !== "IN_PROGRESS") {
    throw new Error("mobile animatic finalization schema/status differs from the bounded orbit receipt");
  }
  assertAuthorizationDenied(finalization.authorization, "mobile animatic finalization");
  const modeKeys = Object.keys(finalization.modes ?? {}).sort(lexicalCompare);
  if (JSON.stringify(modeKeys) !== JSON.stringify(["orbit-f001-f285"])) throw new Error("mobile finalization mode inventory differs");
  const orbit = finalization.modes?.["orbit-f001-f285"];
  assertAuthorizationDenied(orbit?.authorization, "mobile orbit finalization");
  const expectedCheckpointSource = { relativePath: "artifacts/original/phase-4r1-1-periphery-current-mobile-crt/source/quantum-signal-television-phase4r1-1-periphery-current-mobile-crt.blend", byteSize: 3599561, sha256: "369719d6766bffbfa14c760c1053f0291ae2ffce17fda30fe30de37a2404ac9a" };
  const expectedCheckpointBuild = { relativePath: "artifacts/original/phase-4r1-1-periphery-current-mobile-crt/source/phase4r1-1-source-build.json", byteSize: 2200037, sha256: "fe2fdd4a127957bfa54bbaeec0333dff998607f3f9008a7f1ae5215601a8b58f" };
  const expectedProducer = { relativePath: "artifacts/original/phase-4r1-1-periphery-current-mobile-crt/source/render_phase4r1_1_mobile_optics_diagnostic.py", byteSize: 123412, sha256: "e0e7dfd868b21aa1821f7737f4a70194751f572531cad564ee0836daf66fbe24" };
  const exactAuthority = (record, expected, label) => {
    if (JSON.stringify(recordFields(record, label)) !== JSON.stringify(expected)) throw new Error(`${label} differs from frozen checkpoint authority`);
  };
  exactAuthority(diagnostic.sourceAuthorities?.files?.derivative, expectedCheckpointSource, "mobile diagnostic source");
  exactAuthority(diagnostic.sourceAuthorities?.files?.sourceBuild, expectedCheckpointBuild, "mobile diagnostic source build");
  exactAuthority(diagnostic.sourceAuthorities?.files?.producer, expectedProducer, "mobile diagnostic producer");
  exactAuthority(finalization.source, expectedCheckpointSource, "mobile finalization source");
  exactAuthority(finalization.sourceBuild, expectedCheckpointBuild, "mobile finalization source build");
  exactAuthority(finalization.producer, expectedProducer, "mobile finalization producer");
  exactAuthority(orbit?.source, expectedCheckpointSource, "mobile orbit source");
  exactAuthority(orbit?.sourceBuild, expectedCheckpointBuild, "mobile orbit source build");
  exactAuthority(orbit?.producer, expectedProducer, "mobile orbit producer");
  const exactRange = (value, expected) => Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);
  if (orbit?.status !== "PASS" || orbit?.encodedFrameCount !== 285 || !exactRange(orbit?.frameRange, [1, 285])
    || !exactRange(finalization.physicalFrameRange, [1, 500]) || !exactRange(orbit?.physicalFrameRange, [1, 500])
    || !exactRange(finalization.forbiddenFrameRange, [501, 540]) || !exactRange(orbit?.forbiddenFrameRange, [501, 540])
    || finalization.complete540FrameCyclesFilmStarted !== false || finalization.finalRefinedMediaIntegrationStarted !== false
    || finalization.frame501Through540Encoded !== false || finalization.phase5Authorized !== false
    || orbit.complete540FrameCyclesFilmStarted !== false || orbit.finalRefinedMediaIntegrationStarted !== false
    || orbit.frame501Through540Encoded !== false || orbit.phase5Authorized !== false
    || orbit.reviewAnimaticOnly !== true || orbit.finalRefinedMedia !== false
    || orbit.path !== "animatic/mobile-390x844-orbit-F001-F285.mp4") {
    throw new Error("mobile orbit F001-F285 finalization is incomplete");
  }
  const expectedOrbitFile = { relativePath: "animatic/mobile-390x844-orbit-F001-F285.mp4", byteSize: 504437, sha256: "f63b4a658131e05150eca52dd5d0d58b3986b8f00c78c723b8d896046db05b2b" };
  exactAuthority({ path: orbit.path, ...orbit.file }, expectedOrbitFile, "mobile orbit file");
  if (!Array.isArray(diagnostic.artifacts) || diagnostic.artifacts.length !== 21) throw new Error("mobile diagnostic must contain exactly 21 artifact declarations");
  const diagnosticDeclarations = collectFileRecords({ artifacts: diagnostic.artifacts });
  const diagnosticDeclarationPaths = diagnosticDeclarations.map((record, index) => recordFields(record, `mobile diagnostic declaration[${index}]`).relativePath);
  if (diagnosticDeclarations.length !== 21) throw new Error("mobile diagnostic declaration collection is not exactly 21 records");
  const canonicalDeclarationPaths = await Promise.all(diagnosticDeclarationPaths.map(async (relativePath, index) => {
    const candidate = path.resolve(root, ...relativePath.split("/"));
    if (!isWithin(root, candidate) || !(await pathExists(candidate))) throw new Error(`mobile diagnostic declaration[${index}] is missing or escapes its root`);
    return normalizedPath(await realpath(candidate));
  }));
  if (new Set(canonicalDeclarationPaths).size !== 21) throw new Error("mobile diagnostic declarations do not resolve to exactly 21 unique files");
  const frameManifestPath = "animatic/mobile-animatic-frame-manifest.json";
  const frameManifestIndexes = diagnosticDeclarationPaths.map((relativePath, index) => relativePath === frameManifestPath ? index : -1).filter((index) => index >= 0);
  if (frameManifestIndexes.length !== 1) throw new Error("mobile diagnostic must contain exactly one frame-manifest declaration");
  const [diagnosticFrameManifestIndex] = frameManifestIndexes;
  const diagnosticFrameManifest = recordFields(diagnosticDeclarations[diagnosticFrameManifestIndex], "mobile diagnostic frame-manifest declaration");
  const topFinalFrameManifest = recordFields(finalization.sourceFramesManifest, "mobile top-level finalization frame-manifest declaration");
  const finalFrameManifest = recordFields(orbit.sourceFramesManifest, "mobile finalization frame-manifest declaration");
  const expectedPreFinal = { relativePath: frameManifestPath, byteSize: 18720, sha256: "2a4fb5b5a7700388cb28c812d8fa91cd1fd74a546868f74d14d1936b68a93194" };
  const expectedFinal = { relativePath: frameManifestPath, byteSize: 206089, sha256: "c2f2fb545623dd4790fa48ec2f13277e1e9c336422e6ad7049ec9ab42c361db4" };
  if (JSON.stringify(diagnosticFrameManifest) !== JSON.stringify(expectedPreFinal)
    || JSON.stringify(topFinalFrameManifest) !== JSON.stringify(expectedFinal)
    || JSON.stringify(finalFrameManifest) !== JSON.stringify(expectedFinal)) {
    throw new Error("mobile frame-manifest supersession differs from the exact bounded producer finalization");
  }
  const authenticatedDiagnosticRecords = await authenticateRecords(
    root,
    diagnosticDeclarations.filter((_, index) => index !== diagnosticFrameManifestIndex),
    "mobile diagnostic artifacts",
  );
  const finalFrameManifestRecord = await authenticateRecord(root, orbit.sourceFramesManifest, "mobile finalized frame manifest");
  const records = [...authenticatedDiagnosticRecords];
  records.splice(diagnosticFrameManifestIndex, 0, finalFrameManifestRecord);
  if (records.length !== 21) throw new Error("mobile authenticated artifact count must remain exactly 21 after bounded frame-manifest supersession");
  if (new Set(records.map((record) => normalizedPath(record.filename))).size !== 21) throw new Error("mobile authenticated artifact realpaths are not exactly unique");
  const frameManifestSupersession = {
    status: "PASS",
    applied: true,
    reason: "The diagnostic recorded the pre-render frame-manifest header; the later orbit finalization receipt authenticates the completed 500-frame manifest at the same path.",
    diagnosticPreFinalDeclaration: diagnosticFrameManifest,
    finalizationDeclaration: finalFrameManifest,
    allOtherDiagnosticArtifactsAuthenticatedExactly: true,
  };
  const orbitRecord = await authenticateRecord(root, { path: orbit.path, ...orbit.file }, "mobile orbit video");
  for (const frame of MOBILE_MILESTONES) byRelative(records, `animatic/frames/F${String(frame).padStart(3, "0")}.png`, "mobile milestone");
  return { root, diagnosticPath, diagnostic, records, finalizationPath, finalization, orbitRecord, frameManifestRecord: finalFrameManifestRecord, frameManifestSupersession };
}

async function resolveR1Reference(root) {
  const manifestPath = await findSingle(root, /(?:^|\/)phase4r1-refined-desktop-physical-frame-manifest\.json$/i, "accepted R1 desktop manifest");
  const manifest = await readJson(manifestPath, "accepted R1 desktop manifest");
  assertStatusPass(manifest, "accepted R1 desktop manifest");
  assertAcceptedR1Authorization(manifest.authorization, "accepted R1 desktop manifest");
  if (manifest.sourceAuthorities?.derivative?.sha256 !== "a0a122baaf021833e9cad6194a474ef714b182be2c8e7171e00ad69c00565215") {
    throw new Error("R1 reference root is not bound to the accepted R1 refined source");
  }
  const f1Declaration = (manifest.files ?? []).find((record) => Number(record.frame) === 1 || /(?:^|\/)F001\.png$/i.test(record.path ?? ""));
  if (!f1Declaration) throw new Error("accepted R1 reference lacks F001");
  const f1 = await authenticateRecord(root, f1Declaration, "accepted R1 F001");
  const f70Declaration = (manifest.files ?? []).find((record) => Number(record.frame) === 70 || /(?:^|\/)F070\.png$/i.test(record.path ?? ""));
  if (!f70Declaration) throw new Error("accepted R1 reference lacks F070 10% current authority");
  const f70 = await authenticateRecord(root, f70Declaration, "accepted R1 F070");
  return { root, manifestPath, manifest, f1, f70 };
}

async function normalizePublicRoot(candidate, manifestRelative) {
  const root = await assertExternalDirectory(candidate, "public evidence root");
  if (await pathExists(path.join(root, ...manifestRelative.split("/")))) return root;
  if (path.basename(root).toLowerCase() === "public" && await pathExists(path.join(root, ...manifestRelative.replace(/^public\//, "").split("/")))) return root;
  if (await pathExists(path.join(root, "public", ...manifestRelative.replace(/^public\//, "").split("/")))) return path.join(root, "public");
  throw new Error(`public evidence manifest is missing beneath ${path.basename(root)}`);
}

async function resolveCrtPublic(candidate, finalSourceSha) {
  let root = await assertExternalDirectory(candidate, "CRT public root");
  let manifestPath;
  if (await pathExists(path.join(root, "public", "reports", "crt-phosphor-public-manifest.json"))) {
    manifestPath = path.join(root, "public", "reports", "crt-phosphor-public-manifest.json");
  } else if (await pathExists(path.join(root, "reports", "crt-phosphor-public-manifest.json"))) {
    root = path.dirname(path.dirname(path.join(root, "reports", "crt-phosphor-public-manifest.json")));
    manifestPath = path.join(root, "reports", "crt-phosphor-public-manifest.json");
  } else throw new Error("CRT public manifest is missing");
  const manifest = await readJson(manifestPath, "CRT public manifest");
  if (manifest.schema !== "quantum-hub.phase-4-r1-1.crt-phosphor-public-manifest.v1") throw new Error("CRT public schema differs");
  assertStatusPass(manifest, "CRT public manifest");
  assertAuthorizationDenied(manifest.authorization, "CRT public manifest");
  assertHumanPending(manifest, "CRT public manifest");
  if (manifest.rawMotionFramesIncluded !== false || manifest.rawBlenderPngsIncluded !== false || manifest.privacySanitized !== true) throw new Error("CRT public boundary differs");
  const sourceShas = extractFinalSourceSha(manifest);
  if (!sourceShas.includes(finalSourceSha)) throw new Error("CRT public evidence is not bound to the final source");
  let records;
  if (path.basename(path.dirname(manifestPath)).toLowerCase() === "reports" && path.basename(path.dirname(path.dirname(manifestPath))).toLowerCase() === "public") {
    const top = path.dirname(path.dirname(path.dirname(manifestPath)));
    records = await authenticateRecords(top, manifest.files ?? [], "CRT public files");
    root = await assertExternalDirectory(top, "normalized CRT evidence root");
  } else {
    records = await authenticateRecords(root, manifest.files ?? [], "CRT public files");
  }
  for (const frame of CRT_STILL_FRAMES) byPathTokens(records, ["stills", `f${String(frame).padStart(3, "0")}`], `CRT F${frame}`);
  byPathTokens(records, ["video", "f345-f464"], "CRT bounded motion");
  byPathTokens(records, ["source", "pre-crt-effect"], "exact Q source");
  byPathTokens(records, ["source-difference"], "exact Q difference report");
  return { root, manifestPath, manifest, records };
}

async function resolvePhysicalPublic(candidate, finalSourceSha) {
  let root = await assertExternalDirectory(candidate, "final physical public root");
  if (await pathExists(path.join(root, "public", "manifests", "final-physical-public-manifest.json"))) root = path.join(root, "public");
  const manifestPath = path.join(root, "manifests", "final-physical-public-manifest.json");
  const manifest = await readJson(manifestPath, "final physical public manifest");
  if (manifest.schema !== "quantum-hub.phase-4-r1-1.final-physical-public-manifest.v1") throw new Error("final physical public schema differs");
  assertStatusPass(manifest, "final physical public manifest");
  assertAuthorizationDenied(manifest.authorization, "final physical public manifest");
  assertHumanPending(manifest, "final physical public manifest");
  if (manifest.manifestSelfExcludedToAvoidCircularHash !== true || manifest.rawFullSequenceIncluded !== false || manifest.payloadCount !== 32) {
    throw new Error("final physical public boundary/count differs");
  }
  if (manifest.finalBlenderSource?.sha256 !== finalSourceSha) throw new Error("final physical evidence is not bound to the final source");
  const records = await authenticateRecords(root, manifest.entries ?? [], "final physical public entries");
  const observed = (await listFiles(root)).filter((relative) => relative !== "manifests/final-physical-public-manifest.json");
  const declared = records.map((record) => record.relativePath).sort(lexicalCompare);
  if (JSON.stringify(observed.sort(lexicalCompare)) !== JSON.stringify(declared)) throw new Error("final physical public manifest is not exhaustive");
  byRelative(records, "video/mobile-390x844-physical-F001-F500.mp4", "final physical video");
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    for (const [frame, role] of RESPONSIVE_STATES) byRelative(records, `stills/responsive/${viewport}/F${String(frame).padStart(3, "0")}-${role}.png`, "responsive physical still");
  }
  return { root, manifestPath, manifest, records };
}

const BROWSER_REPORT_ROLES = Object.freeze({
  "entry-settled-320x800": "settled-entry-320x800",
  "entry-settled-360x800": "settled-entry-360x800",
  "entry-settled-768x1024": "settled-entry-768x1024",
  "entry-settled-844x390": "settled-entry-844x390",
  "chrome-hidden": "active-cinematic-844x390",
  "chrome-settled": "settled-entry-844x390",
  "chrome-reverse": "reverse-concealed-844x390",
  "skip-intro": "skip-intro-844x390",
  "reduced-motion": "reduced-motion-844x390",
  "no-javascript": "no-javascript-844x390",
  "native-scroll-operating-field": "native-scroll-operating-field-768x1024",
});

async function resolveBrowser(root, finalHead) {
  const reportPath = await findSingle(root, /(?:^|\/)phase-4r1-1-browser-regression-report\.json$/i, "browser regression report");
  root = await assertExternalDirectory(path.dirname(reportPath), "normalized browser evidence root");
  const report = await readJson(reportPath, "browser regression report");
  if (report.schema !== "quantum-hub.phase-4r1-1.browser-regression-evidence.v1") throw new Error("browser regression report schema differs");
  assertStatusPass(report, "browser regression report");
  assertAuthorizationDenied(report.authorization, "browser regression report");
  assertHumanPending(report, "browser regression report");
  const declaredHead = report.binding?.passedFinalHead ?? report.binding?.capturedHead ?? report.finalHead ?? report.repository?.head ?? report.git?.head;
  if (declaredHead && declaredHead !== finalHead) throw new Error("browser evidence was not captured from final HEAD");
  if (report.binding?.exact !== true || report.binding?.cleanTree !== true || report.runtimeMediaAuthority?.finalR11RefinedMediaIntegrated !== false) {
    throw new Error("browser evidence final-HEAD/clean/proxy boundary differs");
  }
  const records = await authenticateRecords(root, report.artifacts ?? [], "browser regression files");
  const observedPayloads = (await listFiles(root)).filter((relative) => relative !== path.basename(reportPath)).sort(lexicalCompare);
  const declaredPayloads = records.map((record) => record.relativePath).sort(lexicalCompare);
  if (JSON.stringify(observedPayloads) !== JSON.stringify(declaredPayloads)) throw new Error("browser report artifact inventory is not exhaustive");
  const roles = new Map();
  for (const [publicRole, stateId] of Object.entries(BROWSER_REPORT_ROLES)) {
    const candidates = records.filter((record) => record.sourceRecord.stateId === stateId && /\.png$/i.test(record.relativePath));
    if (candidates.length !== 1) throw new Error(`browser role ${publicRole}/${stateId} expected one PNG and found ${candidates.length}`);
    roles.set(publicRole, candidates[0]);
  }
  return { root, reportPath, report, records, roles };
}

async function runGit(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  return stdout.trim();
}

function parseTreeListing(text) {
  const records = [];
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^\d+\s+blob\s+[a-f0-9]{40}\s+(\d+)\t(.+)$/);
    if (match) records.push({ bytes: Number(match[1]), path: match[2].replaceAll("\\", "/") });
  }
  return records;
}

async function resolveRepository(options) {
  for (const key of ["head", "parent", "upstreamHead", "liveRemoteHead", "localMain", "liveRemoteMain"]) {
    if (!validCommit(options[key])) throw new Error(`--${key} must be a full 40-character lowercase commit`);
  }
  if (options.localMain !== MAIN_AUTHORITY || options.liveRemoteMain !== MAIN_AUTHORITY) throw new Error("main differs from the frozen authority");
  if (options.head !== options.upstreamHead || options.head !== options.liveRemoteHead) throw new Error("local/upstream/live-remote branch parity differs");
  const [branch, head, parent, statusText, tracking, localMain, chainText, baseTreeText, headTreeText, changedText] = await Promise.all([
    runGit(["branch", "--show-current"]),
    runGit(["rev-parse", "HEAD"]),
    runGit(["rev-parse", "HEAD^"]),
    runGit(["status", "--porcelain=v1", "--untracked-files=all"]),
    runGit(["rev-parse", "@{u}"]),
    runGit(["rev-parse", "main"]),
    runGit(["rev-list", "--reverse", `${BASE_HEAD}..${options.head}`]),
    runGit(["ls-tree", "-lr", BASE_HEAD]),
    runGit(["ls-tree", "-lr", options.head]),
    runGit(["diff", "--name-only", `${BASE_HEAD}..${options.head}`, "--"]),
  ]);
  if (branch !== options.branch || head !== options.head || parent !== options.parent || tracking !== options.upstreamHead || localMain !== MAIN_AUTHORITY) {
    throw new Error("live local Git state differs from the explicit final-state contract");
  }
  if (statusText) throw new Error("repository must be clean before final package assembly");
  const chain = [BASE_HEAD, ...chainText.split(/\r?\n/).filter(Boolean)];
  if (chain.at(-1) !== options.head) throw new Error("final HEAD is not descended from the R1 authority");
  const baseTree = parseTreeListing(baseTreeText);
  const headTree = parseTreeListing(headTreeText);
  const changedTrackedPaths = changedText.split(/\r?\n/).filter(Boolean).map((item) => item.replaceAll("\\", "/"));
  const changedSet = new Set(changedTrackedPaths);
  const filesOver1Mb = headTree.filter((record) => record.bytes > 1_000_000 && changedSet.has(record.path)).map((record) => ({
    ...record,
    justification: record.path.endsWith(".blend") ? "final cumulative Blender source authority" : record.path.endsWith("source-build.json") ? "machine-readable cumulative build/save-reopen audit" : "tracked producer or required authority payload",
  }));
  return {
    branch,
    head,
    parent,
    commitChain: chain,
    cleanTree: true,
    upstreamHead: tracking,
    liveRemoteHead: options.liveRemoteHead,
    localMain,
    liveRemoteMain: options.liveRemoteMain,
    parity: true,
    changedTrackedPaths,
    changedTrackedPathCount: changedTrackedPaths.length,
    trackedFileCountAtBase: baseTree.length,
    trackedFileCountAtHead: headTree.length,
    trackedFileCountDelta: headTree.length - baseTree.length,
    trackedByteCountAtBase: baseTree.reduce((sum, record) => sum + record.bytes, 0),
    trackedByteCountAtHead: headTree.reduce((sum, record) => sum + record.bytes, 0),
    trackedByteDelta: headTree.reduce((sum, record) => sum + record.bytes, 0) - baseTree.reduce((sum, record) => sum + record.bytes, 0),
    filesOver1Mb,
  };
}

async function resolveSource(options) {
  if (!validSha256(options.sourceSha256) || !validSha256(options.sourceBuildSha256)) throw new Error("source SHA arguments must be lowercase SHA-256 values");
  const source = await assertFile(options.source, "final Blender source");
  const sourceBuildReport = await assertFile(options.sourceBuildReport, "source build/reopen report");
  if (!isWithin(ROOT, source) || !isWithin(ROOT, sourceBuildReport)) throw new Error("source and build/reopen report must resolve inside the repository");
  const sourceRepositoryPath = safeRelative(path.relative(ROOT, source).replaceAll("\\", "/"), "source repository path");
  const reportRepositoryPath = safeRelative(path.relative(ROOT, sourceBuildReport).replaceAll("\\", "/"), "source-build repository path");
  const [trackedSource, trackedReport] = await Promise.all([
    runGit(["ls-files", "--error-unmatch", "--", sourceRepositoryPath]),
    runGit(["ls-files", "--error-unmatch", "--", reportRepositoryPath]),
  ]);
  if (trackedSource.replaceAll("\\", "/") !== sourceRepositoryPath || trackedReport.replaceAll("\\", "/") !== reportRepositoryPath) throw new Error("source and build/reopen report must be exact tracked authorities");
  const [sourceBytes, reportBytes] = await Promise.all([readFile(source), readFile(sourceBuildReport)]);
  if (sourceBytes.length !== options.sourceBytes || sha256(sourceBytes) !== options.sourceSha256) throw new Error("final Blender source differs from explicit bytes/SHA authority");
  if (reportBytes.length !== options.sourceBuildBytes || sha256(reportBytes) !== options.sourceBuildSha256) throw new Error("source build report differs from explicit bytes/SHA authority");
  const report = JSON.parse(reportBytes.toString("utf8"));
  assertStatusPass(report, "source build/reopen report");
  assertAuthorizationDenied(report.authorization, "source build/reopen report");
  if (report.derivative?.sha256 !== options.sourceSha256 || report.derivative?.bytes !== options.sourceBytes || report.throughStage !== "crt") {
    throw new Error("source build report does not bind the cumulative final CRT derivative");
  }
  const crt = report.stages?.crt;
  if (!crt || crt.postSaveAuthorityExact !== true || crt.fixedAuthorityUnchanged !== true || crt.preEffectsSourceDifference?.zeroDifference !== true || crt.onlyAuthorizedMaterialGraphDelta !== true) {
    throw new Error("source build/reopen report lacks the final save/reopen/frozen/Q/material PASS gates");
  }
  const qPath = await assertFile(path.join(ROOT, ...EXACT_Q_REPOSITORY_PATH.split("/")), "exact Q source");
  const qBytes = await readFile(qPath);
  if (qBytes.length !== EXACT_Q_BYTES || sha256(qBytes) !== EXACT_Q_SHA256) throw new Error("tracked exact Q source differs from frozen authority");
  return {
    source,
    sourceBytes: options.sourceBytes,
    sourceSha256: options.sourceSha256,
    repositoryPath: sourceRepositoryPath,
    sourceBuildReport,
    sourceBuildBytes: options.sourceBuildBytes,
    sourceBuildSha256: options.sourceBuildSha256,
    sourceBuildRepositoryPath: reportRepositoryPath,
    report,
    qPath,
  };
}

function metadataRecord(relativePath, bytes, metadata, finalSourceSha) {
  return {
    relativePath: safeRelative(relativePath, "package relative path"),
    byteSize: bytes.length,
    sha256: sha256(bytes),
    purpose: String(metadata.purpose ?? "").trim(),
    viewport: metadata.viewport ?? null,
    frameOrRange: metadata.frameOrRange ?? null,
    engine: metadata.engine ?? null,
    finalBlenderSourceHash: finalSourceSha,
    ...(metadata.expectedFrameCount ? { expectedFrameCount: metadata.expectedFrameCount } : {}),
    ...(metadata.evidenceClass ? { evidenceClass: metadata.evidenceClass } : {}),
  };
}

function validatePackageMetadata(record) {
  if (!record.purpose || !validSha256(record.sha256) || !validSha256(record.finalBlenderSourceHash)) throw new Error(`package metadata incomplete: ${record.relativePath}`);
  if (!Number.isInteger(record.byteSize) || record.byteSize <= 0) throw new Error(`package byte size invalid: ${record.relativePath}`);
  for (const key of ["purpose", "viewport", "engine", "evidenceClass"]) if (record[key] !== null && record[key] !== undefined) assertNoPrivateText(record[key], `${record.relativePath}.${key}`);
}

function createStageContext(stageRoot, sourceSha, ffmpeg, ffprobe, workRoot) {
  return {
    stageRoot,
    sourceSha,
    ffmpeg,
    ffprobe,
    workRoot,
    records: [],
    paths: new Set(),
    sanitation: [],
    videoProbes: [],
  };
}

async function registerWritten(context, relativePath, metadata) {
  const normalized = safeRelative(relativePath, "staged relative path");
  if (context.paths.has(normalized)) throw new Error(`duplicate staged path: ${normalized}`);
  const filename = path.join(context.stageRoot, ...normalized.split("/"));
  const bytes = await readFile(filename);
  const record = metadataRecord(normalized, bytes, metadata, context.sourceSha);
  validatePackageMetadata(record);
  context.paths.add(normalized);
  context.records.push(record);
  return record;
}

async function addImage(context, source, relativePath, metadata, { reusedBlenderPng = true } = {}) {
  const destination = path.join(context.stageRoot, ...relativePath.split("/"));
  const sanitation = await copyCleanImage(source, destination, { reusedBlenderPng });
  context.sanitation.push({ packagePath: relativePath, ...sanitation });
  return registerWritten(context, relativePath, metadata);
}

async function addText(context, source, relativePath, metadata) {
  const destination = path.join(context.stageRoot, ...relativePath.split("/"));
  await copySanitizedText(source, destination);
  return registerWritten(context, relativePath, metadata);
}

async function addVideo(context, source, relativePath, metadata) {
  const destination = path.join(context.stageRoot, ...relativePath.split("/"));
  const probe = await copyCleanVideo(source, destination, context.ffmpeg, context.ffprobe);
  if (metadata.expectedFrameCount && probe.frameCount !== metadata.expectedFrameCount) throw new Error(`${relativePath} expected ${metadata.expectedFrameCount} decoded frames and has ${probe.frameCount}`);
  const [width, height] = String(metadata.viewport ?? "").split("x").map(Number);
  if (width && height && (probe.width !== width || probe.height !== height)) throw new Error(`${relativePath} viewport differs from its probe`);
  context.videoProbes.push({ packagePath: relativePath, ...probe });
  return registerWritten(context, relativePath, metadata);
}

async function addExactBinary(context, source, relativePath, metadata) {
  const bytes = await readFile(source);
  if (PRIVATE_PATTERN.test(bytes.toString("latin1"))) throw new Error(`${relativePath} contains a private path token`);
  if (path.extname(source).toLowerCase() === ".png") {
    const chunks = pngChunkInventory(bytes, path.basename(source));
    if (chunks.some((chunk) => PNG_PRIVATE_CHUNKS.has(chunk.type))) throw new Error(`${relativePath} exact binary has a private PNG metadata chunk`);
    await sharp(bytes, { failOn: "error" }).metadata();
  }
  await atomicWrite(path.join(context.stageRoot, ...relativePath.split("/")), bytes);
  return registerWritten(context, relativePath, metadata);
}

async function sanitizedWorkingPng(context, source, label) {
  const destination = path.join(context.workRoot, `sanitized-${randomUUID()}.png`);
  const sanitation = await sanitizePng(source, destination);
  context.sanitation.push({ packagePath: `[derived composition input] ${label}`, ...sanitation });
  return destination;
}

async function addGeneratedJson(context, relativePath, value, metadata) {
  const sanitized = sanitizeValue(value);
  const bytes = Buffer.from(stableJson(sanitized));
  assertNoPrivateText(bytes, relativePath);
  await atomicWrite(path.join(context.stageRoot, ...relativePath.split("/")), bytes);
  return registerWritten(context, relativePath, metadata);
}

async function addGeneratedText(context, relativePath, value, metadata) {
  assertNoPrivateText(value, relativePath);
  await atomicWrite(path.join(context.stageRoot, ...relativePath.split("/")), value);
  return registerWritten(context, relativePath, metadata);
}

function compactSourceValidation(source, resolved) {
  const report = source.report;
  const crt = report.stages.crt;
  const cable = report.stages.cable;
  const mobile = report.stages.mobile;
  const periphery = report.stages.periphery;
  return {
    schema: `${SCHEMA}.source-validation-summary`,
    status: "PASS",
    finalBlenderSource: {
      repositoryPath: source.repositoryPath,
      byteSize: source.sourceBytes,
      sha256: source.sourceSha256,
    },
    sourceBuildReopenAuthority: {
      repositoryPath: source.sourceBuildRepositoryPath,
      byteSize: source.sourceBuildBytes,
      sha256: source.sourceBuildSha256,
      schema: report.schema,
      blender: report.blender,
      throughStage: report.throughStage,
      derivative: report.derivative,
    },
    saveReopen: {
      postSaveAuthorityExact: crt.postSaveAuthorityExact,
      postSaveFixedAuthority: crt.postSaveFixedAuthority,
      postSaveGlassTreatment: crt.postSaveGlassTreatment,
      postSaveImageReferences: crt.postSaveImageReferences,
      postSaveQPhosphorTreatment: crt.postSaveQPhosphorTreatment,
    },
    pathAndPacking: {
      exactQ: report.exactQ,
      imageReferenceAuthority: crt.imageReferenceAuthority,
      packedQCheckPassed: crt.preEffectsSourceDifference?.zeroDifference === true,
      missingPathChecksPassed: JSON.stringify(crt.imageReferenceAuthority ?? {}).includes('"is_missing":true') === false,
    },
    materialGraphAudit: {
      materialNames: crt.materialNames,
      expectedChangedAcceptedMaterials: crt.expectedChangedAcceptedMaterials,
      changedAcceptedMaterials: crt.changedAcceptedMaterials,
      exactlyTwoAllowedMaterialGraphsChanged: crt.exactlyTwoAllowedMaterialGraphsChanged,
      onlyAuthorizedMaterialGraphDelta: crt.onlyAuthorizedMaterialGraphDelta,
      materialGraphsBefore: crt.materialGraphsBefore,
      materialGraphsAfter: crt.materialGraphsAfter,
      materialUsersUnchanged: crt.materialUsersUnchanged,
    },
    cameraValidation: {
      desktopFrozen: report.preservation?.afterCrt?.desktopCamera,
      landscapeFrozen: report.preservation?.afterCrt?.landscapeCamera,
      mobileRepair: mobile,
    },
    cableValidation: {
      stage: cable,
      evaluatedContinuity: resolved.cableDiagnostic.manifest.evaluatedProgression,
    },
    peripheryValidation: periphery,
    exactQZeroDifference: crt.preEffectsSourceDifference,
    glassTreatment: crt.glassTreatment,
    phosphorTreatment: crt.qPhosphorTreatment,
    fixedAuthorityUnchanged: crt.fixedAuthorityUnchanged,
    denialFlags: AUTHORIZATION_DENIALS,
    humanReviewGates: HUMAN_REVIEW_GATES,
  };
}

function compactMobileReport(mobile, finalSourceSha) {
  const report = mobile.diagnostic;
  const milestoneByFrame = new Map((report.milestones ?? []).map((item) => [Number(item.frame), item]));
  const measurements = MOBILE_FOCAL_FRAMES.map((frame) => {
    const item = milestoneByFrame.get(frame);
    if (!item) throw new Error(`mobile diagnostic lacks required milestone F${frame}`);
    return {
      frame,
      focalLengthMillimeters: item.r1_1?.lensMillimeters,
      projectedCrtHeightPixels: item.r1_1?.projectedCrtHeightPixels,
      projectedCrtHeightPercent: item.r1_1?.projectedCrtHeightPercent,
      projectedCrtHeightViewportPixels: item.r1_1?.projectedCrtHeightViewportPixels,
      projectedCrtHeightViewportPercent: item.r1_1?.projectedCrtHeightViewportPercent,
      orbitRadiusMeters: item.orbitRadiusMeters,
      elevationAboveCrtReferenceMeters: item.elevationAboveCrtReferenceMeters,
      orbitAngleDegreesUnwrapped: item.orbitAngleDegreesUnwrapped,
      role: item.role,
    };
  });
  return {
    schema: `${SCHEMA}.mobile-optics-report`,
    status: "PASS",
    finalBlenderSourceHash: finalSourceSha,
    checkpointSourceAuthority: report.sourceAuthorities,
    savedCurveAction: report.focalAuthorities?.savedCurveAction,
    interpolation: report.focalAuthorities?.interpolation,
    acceptedR1RejectedCurve: report.focalAuthorities?.acceptedR1,
    finalR11Curve: report.focalAuthorities?.repairedR1_1,
    measurements,
    desktopCameraFrozen: true,
    landscapeCameraFrozen: true,
    interpretation: "distant establishment -> continuously approaching orbit -> frontal entry; no optical pull-away",
    completeForwardPhysicalAuthority: "03-mobile-camera-optics/mobile-390x844-physical-F001-F500.mp4",
    focusedOrbitAuthority: "03-mobile-camera-optics/mobile-390x844-orbit-F001-F285.mp4",
    animaticFrameManifestAuthority: recordFields(mobile.frameManifestRecord, "mobile finalized frame-manifest authority"),
    animaticFrameManifestSupersession: mobile.frameManifestSupersession,
    humanReviewDecision: "PENDING",
    authorization: AUTHORIZATION_DENIALS,
  };
}

function limitationsReport() {
  return {
    schema: `${SCHEMA}.evidence-limitations`,
    status: "PASS",
    limitations: [
      "Human judgment remains required for all six gates; machine PASS is not acceptance.",
      "The CP1 periphery and CP2 cable comparisons are authenticated earlier cumulative R1.1 checkpoints; the final-source physical/mobile and final CRT public roots prove their cumulative preservation.",
      "No new bounded Cycles current-motion sample was completed for the graphite-current repair; the package uses intended-exposure Eevee diagnostics, close crops, continuity measurements, and a bloom-disabled sheath diagnostic.",
      "Responsive recordings are explicitly labelled nine-state hard-cut review clips, not a continuous production render; each uses native final-source physical frames, a literal 13-frame black beat, and settled browser ENTRY.",
      "Browser/Chrome evidence is the accepted prior-runtime state-policy proxy. It does not claim final R1.1 refined-media integration.",
      "The complete 844x390 settled ENTRY and skip plates reuse the frozen accepted R1 capture-only, ENTRY-scoped short-landscape composition from bfbd3e6; they do not alter production runtime CSS, root typography, or browser zoom.",
      "The mobile diagnostic's pre-render frame-manifest declaration is superseded only by the later authenticated orbit-finalization receipt for the completed 500-frame manifest; the other 20 diagnostic artifacts authenticate exactly.",
      "Rejected and superseded CRT frames are excluded; only their aliases, source authority where known, and rejection reasons are disclosed.",
      "The final .blend and raw render sequences remain outside the ZIP; their exact byte/hash authorities are reported.",
    ],
    denialFlags: AUTHORIZATION_DENIALS,
    noFull540FrameCyclesFilmIncluded: true,
    noRawFullRenderSequenceIncluded: true,
    noProductionFilmIncluded: true,
    rejectedCrtFramesIncludedAsAcceptedAuthority: false,
    humanReviewDecision: "PENDING",
  };
}

function readmeText({ source, repository, calibration }) {
  const raster = calibration?.raster ?? calibration?.scan ?? calibration;
  return `# Phase 4-R1.1 targeted preproduction repair — human review package

Status: **MACHINE-VALIDATED / HUMAN DECISION PENDING**. This package does not mark Phase 4-R1.1 human-accepted and does not authorize production rendering.

## What changed

1. Peripheral proving-hall authority: stronger wall/perimeter architecture, service cabinets/panels, conduit/tray, vent/recess depth and structural shadow composition, while preserving the dark Quantum-Hub palette and clean central floor.
2. Physical graphite current: a visible graphite-black sheath carries a contained magenta core/front/trail with continuous progression and restrained local response.
3. Mobile optics: the perceptually rejected early 74 mm -> 24 mm pull-away was replaced by a continuous 42/42/42/42/42/42 -> 44 -> 50 -> 56 mm approach schedule before the inherited final push.
4. CRT: the exact packed Quantum-Hub Q is emitted through calibrated phosphor scatter and inherited convex smoked glass. Exact geometry, UVs, opacity timing and glass action remain frozen.

## Frozen authority

- Branch: ${repository.branch}
- Final HEAD: ${repository.head}
- Parent: ${repository.parent}
- Blender source: ${source.repositoryPath}
- Blender bytes: ${source.sourceBytes}
- Blender SHA-256: ${source.sourceSha256}
- Build/save-reopen report: ${source.sourceBuildRepositoryPath}
- Build/save-reopen report SHA-256: ${source.sourceBuildSha256}
- Exact pre-effects Q: ${EXACT_Q_REPOSITORY_PATH} (${EXACT_Q_SHA256})

The central hero set remains exactly one CRT plus one narrowing spiral cable. The accepted route, timing, origin, lower-rear connection, 540-frame/18-second narrative, Q timing/hold, threshold, 13-frame breathing beat, gradual ENTRY reveal, semantic ENTRY, skip/reverse/reduced-motion/no-JS behavior and Chrome suppression policy remain frozen.

## Final CRT calibration

The authoritative machine values are in \`reports/source-validation-summary.json\` and \`04-exact-q-crt/reports/crt-phosphor-machine-review.json\`. The calibration uses a 0.0065 UV scatter radius, 74/26 core/scatter split, and the final fine raster interpretation recorded by the final source (${JSON.stringify(raster ?? {})}). F370 is the principal stable-Q still.

## Rejected/superseded CRT trials

Rejected frames are not present anywhere in this package. See \`reports/rejected-crt-trials.json\` for the quarantined aliases and reasons, including the insufficient-halo first scatter, atomic-report failure, raster-aliasing calibration and wave-scale miscalibration.

## Six human gates

1. Peripheral proving-hall authority
2. Physical graphite current
3. Mobile camera optical continuity
4. Exact Q + CRT phosphor authority
5. Responsive physical cinematic evidence
6. Accepted R1 regression

All six values remain null/PENDING in \`MANIFEST.json\`. Review the numbered evidence folders. At 768x1024 the authored family is **Mobile**, because the saved AUTO camera fit resolves to the vertical family.

## Evidence limits and prohibited work

See \`reports/evidence-limitations.json\`. No full 540-frame Cycles film has started or resumed; no final refined-media integration has started; no final production encode is included; Phase 5 remains unauthorized. Responsive videos are compact hard-cut review records, not production films. The complete 844x390 settled ENTRY and skip plates reuse the frozen accepted R1 capture-only, ENTRY-scoped short-landscape composition and do not modify production runtime CSS or typography.
`;
}

async function resolveInputs(options) {
  if (options.help || options.selfTest || options.printContract || options.auditExisting) throw new Error("resolveInputs called for a non-assembly mode");
  const required = [
    "peripheryRoot", "cableDiagnosticRoot", "cableComparisonRoot", "mobileRoot", "r1ReferenceRoot",
    "crtPublicRoot", "physicalPublicRoot", "browserRoot", "source", "sourceSha256", "sourceBytes",
    "sourceBuildReport", "sourceBuildSha256", "sourceBuildBytes", "branch", "head", "parent",
    "upstreamHead", "liveRemoteHead", "localMain", "liveRemoteMain", "output",
  ];
  for (const key of required) if (options[key] === null || options[key] === undefined || options[key] === "") throw new Error(`missing required option ${key}`);
  const output = path.resolve(options.output);
  if (path.basename(output) !== ARCHIVE_FILENAME) throw new Error(`--output basename must be exactly ${ARCHIVE_FILENAME}`);
  if (isWithin(ROOT, output)) throw new Error("--output must be external to the repository");
  if (await pathExists(output)) throw new Error("--output already exists; select the final fresh archive path");
  const outputParent = await assertDirectory(path.dirname(output), "output parent");
  const detached = {
    manifest: path.join(outputParent, MANIFEST_FILENAME),
    result: path.join(outputParent, RESULT_FILENAME),
    audit: path.join(outputParent, AUDIT_FILENAME),
  };
  for (const [label, filename] of Object.entries(detached)) if (await pathExists(filename)) throw new Error(`detached ${label} path already exists`);
  const roots = {
    periphery: await assertExternalDirectory(options.peripheryRoot, "--periphery-root"),
    cableDiagnostic: await assertExternalDirectory(options.cableDiagnosticRoot, "--cable-diagnostic-root"),
    cableComparison: await assertExternalDirectory(options.cableComparisonRoot, "--cable-comparison-root"),
    mobile: await assertExternalDirectory(options.mobileRoot, "--mobile-root"),
    r1Reference: await assertExternalDirectory(options.r1ReferenceRoot, "--r1-reference-root"),
    crt: await assertExternalDirectory(options.crtPublicRoot, "--crt-public-root"),
    physical: await assertExternalDirectory(options.physicalPublicRoot, "--physical-public-root"),
    browser: await assertExternalDirectory(options.browserRoot, "--browser-root"),
  };
  const distinct = Object.values(roots).map(normalizedPath);
  if (new Set(distinct).size !== distinct.length) throw new Error("all eight evidence roots must be distinct");
  for (let left = 0; left < distinct.length; left += 1) {
    for (let right = left + 1; right < distinct.length; right += 1) {
      if (isWithin(distinct[left], distinct[right]) || isWithin(distinct[right], distinct[left])) throw new Error("evidence roots must not nest or overlap");
    }
  }
  for (const root of distinct) if (isWithin(root, output) || isWithin(root, outputParent)) throw new Error("output must not be created inside an evidence root");
  const source = await resolveSource(options);
  const repository = await resolveRepository(options);
  const [periphery, cableDiagnostic, cableComparison, mobile, r1Reference, crt, physical, browser, ffmpeg, ffprobe] = await Promise.all([
    resolvePeriphery(roots.periphery),
    resolveCableDiagnostic(roots.cableDiagnostic),
    resolveCableComparison(roots.cableComparison),
    resolveMobile(roots.mobile),
    resolveR1Reference(roots.r1Reference),
    resolveCrtPublic(roots.crt, source.sourceSha256),
    resolvePhysicalPublic(roots.physical, source.sourceSha256),
    resolveBrowser(roots.browser, repository.head),
    resolveExecutable(options.ffmpeg, "ffmpeg"),
    resolveExecutable(options.ffprobe, "ffprobe"),
  ]);
  const effectiveRoots = [periphery.root, cableDiagnostic.root, cableComparison.root, mobile.root, r1Reference.root, crt.root, physical.root, browser.root].map(normalizedPath);
  if (new Set(effectiveRoots).size !== effectiveRoots.length) throw new Error("normalized evidence roots must remain distinct");
  for (let left = 0; left < effectiveRoots.length; left += 1) {
    for (let right = left + 1; right < effectiveRoots.length; right += 1) {
      if (isWithin(effectiveRoots[left], effectiveRoots[right]) || isWithin(effectiveRoots[right], effectiveRoots[left])) throw new Error("normalized evidence roots must not nest or overlap");
    }
  }
  for (const normalizedRoot of [crt.root, physical.root, browser.root]) {
    if (isWithin(normalizedRoot, output) || isWithin(normalizedRoot, outputParent)) throw new Error("output must not be created inside a normalized public evidence root");
  }
  return {
    output,
    outputParent,
    detached,
    roots,
    source,
    repository,
    periphery,
    cableDiagnostic,
    cableComparison,
    mobile,
    r1Reference,
    crt,
    physical,
    browser,
    ffmpeg,
    ffprobe,
  };
}

async function buildResponsiveEvidence(context, resolved) {
  const compositionInputs = [];
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    const nativeRoot = path.join(context.workRoot, `responsive-native-${viewport}`);
    await mkdir(nativeRoot, { recursive: true });
    const stateImages = [];
    const panelInputs = [];
    for (const [frame, role] of RESPONSIVE_STATES) {
      const record = byRelative(resolved.physical.records, `stills/responsive/${viewport}/F${String(frame).padStart(3, "0")}-${role}.png`, "responsive input");
      const destination = path.join(nativeRoot, `F${String(frame).padStart(3, "0")}-${role}.png`);
      const sanitation = await sanitizePng(record.filename, destination);
      context.sanitation.push({ packagePath: `[derived responsive input] ${viewport}/F${frame}-${role}`, ...sanitation });
      stateImages.push(destination);
      panelInputs.push({ source: destination, label: `F${frame} ${role}` });
      compositionInputs.push({ viewport, frame, role, input: recordFields(record.sourceRecord, "responsive source") });
    }
    const [width, height] = viewport.split("x").map(Number);
    const black = path.join(nativeRoot, "breathing-black.png");
    await atomicWrite(black, await sharp({ create: { width, height, channels: 3, background: "#000000" } }).png({ compressionLevel: 9 }).toBuffer());
    stateImages.push(black);
    panelInputs.push({ source: black, label: "F501-F513 breathing" });
    const browserRole = `entry-settled-${viewport}`;
    const browserRecord = resolved.browser.roles.get(browserRole);
    const entry = path.join(nativeRoot, "settled-entry.png");
    const entrySanitation = await sanitizePng(browserRecord.filename, entry);
    context.sanitation.push({ packagePath: `[derived responsive input] ${viewport}/settled-entry`, ...entrySanitation });
    const entryMeta = await sharp(entry).metadata();
    if (entryMeta.width !== width || entryMeta.height !== height) throw new Error(`${viewport} browser ENTRY dimensions differ`);
    stateImages.push(entry);
    panelInputs.push({ source: entry, label: "settled ENTRY" });
    const familyLabel = viewport === "768x1024" ? "Mobile camera/media · AUTO->VERTICAL" : "Mobile camera/media";
    const sheetRelative = `05-responsive-physical/${viewport}/phase4r1-1-${viewport}-physical-sheet.jpg`;
    const sheetDestination = path.join(context.stageRoot, ...sheetRelative.split("/"));
    await createContactSheet(panelInputs, sheetDestination, {
      columns: 3,
      panelWidth: viewport === "768x1024" ? 320 : 260,
      panelHeight: viewport === "768x1024" ? 427 : 520,
      title: `${viewport} · ${familyLabel} · nine-state physical/ENTRY review`,
    });
    await registerWritten(context, sheetRelative, {
      purpose: `nine-state ${viewport} physical cinematic sheet including literal breathing beat and settled ENTRY; ${familyLabel}`,
      viewport,
      frameOrRange: [1, 540],
      engine: "BLENDER_EEVEE + exact black + browser ENTRY proxy",
      evidenceClass: "responsive sheet",
    });
    const clipRelative = `05-responsive-physical/${viewport}/phase4r1-1-${viewport}-physical-forward-review.mp4`;
    const clipDestination = path.join(context.stageRoot, ...clipRelative.split("/"));
    const probe = await createResponsiveClip(stateImages, clipDestination, context.workRoot, context.ffmpeg, context.ffprobe, viewport);
    context.videoProbes.push({ packagePath: clipRelative, ...probe });
    await registerWritten(context, clipRelative, {
      purpose: `native ${viewport} nine-state hard-cut forward physical review; 13-frame black breathing beat; ${familyLabel}`,
      viewport,
      frameOrRange: "7 physical milestones + 13 black frames + settled ENTRY",
      engine: "BLENDER_EEVEE + exact black + browser ENTRY proxy",
      expectedFrameCount: 112,
      evidenceClass: "responsive bounded review recording",
    });
  }
  return compositionInputs;
}

async function assembleStaging(resolved, stageRoot, workRoot) {
  const context = createStageContext(stageRoot, resolved.source.sourceSha256, resolved.ffmpeg, resolved.ffprobe, workRoot);
  const peripheryNew = byRelative(resolved.periphery.records, "normal-desktop-F001.png", "R1.1 dormant periphery");
  const peripherySheet = "01-peripheral-proving-hall/r1-vs-r1-1-dormant-opening.jpg";
  const [peripheryR1Clean, peripheryR11Clean] = await Promise.all([
    sanitizedWorkingPng(context, resolved.r1Reference.f1.filename, "accepted R1 dormant F001"),
    sanitizedWorkingPng(context, peripheryNew.filename, "R1.1 periphery dormant F001"),
  ]);
  await createSideBySideSheet(peripheryR1Clean, peripheryR11Clean, path.join(stageRoot, ...peripherySheet.split("/")), "Accepted R1 · dormant", "R1.1 periphery · intended exposure");
  await registerWritten(context, peripherySheet, {
    purpose: "accepted R1 versus R1.1 dormant opening at intended authored exposure",
    viewport: "1920x674 sheet",
    frameOrRange: 1,
    engine: "BLENDER_EEVEE comparison",
    evidenceClass: "periphery comparison",
  });
  const peripheryTargets = new Map([
    ["normal-desktop-F001.png", "intended-exposure-dormant-authority.png"],
    ["normal-desktop-F225.png", "rear-side-orbit-environmental-depth.png"],
    ["detail-service-wall-detail.png", "wall-cabinet-panel-and-conduit-zone.png"],
    ["detail-vent-recess-detail.png", "vent-recess-zone.png"],
    ["detail-opening-header-detail.png", "structural-shadow-and-header-zone.png"],
  ]);
  for (const [input, output] of peripheryTargets) {
    const record = byRelative(resolved.periphery.records, input, "periphery evidence");
    await addImage(context, record.filename, `01-peripheral-proving-hall/${output}`, {
      purpose: `intended-exposure peripheral proving-hall evidence: ${output.replace(/[-.]/g, " ")}`,
      viewport: record.sourceRecord.width && record.sourceRecord.height ? `${record.sourceRecord.width}x${record.sourceRecord.height}` : null,
      frameOrRange: record.sourceRecord.frame ?? 1,
      engine: resolved.periphery.manifest.renderSettings?.engine ?? "BLENDER_EEVEE",
      evidenceClass: "periphery accepted checkpoint",
    });
  }
  await addText(context, resolved.periphery.manifestPath, "01-peripheral-proving-hall/periphery-checkpoint-report.json", {
    purpose: "authenticated intended-exposure periphery checkpoint report",
    viewport: null,
    frameOrRange: [1, 370],
    engine: "BLENDER_EEVEE",
    evidenceClass: "producer report",
  });

  for (const filename of CABLE_COMPARISON_FILES) {
    const record = byRelative(resolved.cableComparison.records, filename, "cable comparison");
    await addImage(context, record.filename, `02-physical-graphite-current/comparisons/${filename}`, {
      purpose: `accepted R1 versus R1.1 graphite-current comparison: ${filename}`,
      viewport: record.sourceRecord.viewport ?? record.sourceRecord.dimensions ?? "comparison sheet",
      frameOrRange: record.sourceRecord.frame ?? filename.match(/F(\d{3})/)?.[1] ?? null,
      engine: "BLENDER_EEVEE comparison",
      evidenceClass: "cable comparison",
    });
  }
  const cableTen = byRelative(resolved.cableDiagnostic.records, "full/desktop/F070.png", "R1.1 cable 10% frame");
  const cableTenSheet = "02-physical-graphite-current/comparisons/checkpoint2-cable-F070-10pct.jpg";
  const [cableR1Clean, cableR11Clean] = await Promise.all([
    sanitizedWorkingPng(context, resolved.r1Reference.f70.filename, "accepted R1 cable F070"),
    sanitizedWorkingPng(context, cableTen.filename, "R1.1 cable F070"),
  ]);
  await createSideBySideSheet(cableR1Clean, cableR11Clean, path.join(stageRoot, ...cableTenSheet.split("/")), "Accepted R1 · F070 / 10%", "R1.1 graphite carrier · F070 / 10%");
  await registerWritten(context, cableTenSheet, {
    purpose: "accepted R1 versus R1.1 graphite-current comparison at exactly 10 percent progression",
    viewport: "1920x674 comparison sheet",
    frameOrRange: 70,
    engine: "BLENDER_EEVEE comparison",
    evidenceClass: "cable comparison",
  });
  for (const filename of CABLE_CLOSE_FILES) {
    const record = byRelative(resolved.cableDiagnostic.records, filename, "cable close-up");
    await addImage(context, record.filename, `02-physical-graphite-current/close-crops/${path.basename(filename)}`, {
      purpose: filename.includes("bloom-disabled") ? "bloom-disabled diagnostic proving visible physical graphite sheath independent of glow" : `close physical graphite current crop: ${path.basename(filename)}`,
      viewport: record.sourceRecord.width && record.sourceRecord.height ? `${record.sourceRecord.width}x${record.sourceRecord.height}` : null,
      frameOrRange: record.sourceRecord.frame ?? Number(filename.match(/F(\d{3})/)?.[1]),
      engine: record.sourceRecord.renderEngine ?? "BLENDER_EEVEE",
      evidenceClass: filename.includes("bloom-disabled") ? "bloom-disabled diagnostic" : "cable close crop",
    });
  }
  await addText(context, resolved.cableDiagnostic.manifestPath, "02-physical-graphite-current/cable-material-continuity-report.json", {
    purpose: "graphite sheath/current material, front/trail and contiguous-prefix continuity audit",
    viewport: "1440x900",
    frameOrRange: [1, 285],
    engine: "BLENDER_EEVEE + Blender data audit",
    evidenceClass: "producer report",
  });
  await addText(context, resolved.cableComparison.manifestPath, "02-physical-graphite-current/cable-comparison-manifest.json", {
    purpose: "authenticated R1 versus R1.1 comparison authority",
    viewport: "comparison sheets",
    frameOrRange: [47, 285],
    engine: "BLENDER_EEVEE comparison",
    evidenceClass: "producer manifest",
  });

  const physicalVideo = byRelative(resolved.physical.records, "video/mobile-390x844-physical-F001-F500.mp4", "final physical video");
  await addVideo(context, physicalVideo.filename, "03-mobile-camera-optics/mobile-390x844-physical-F001-F500.mp4", {
    purpose: "complete final-source physical-only mobile review animatic; stops before breathing/ENTRY",
    viewport: "390x844",
    frameOrRange: [1, 500],
    engine: "BLENDER_EEVEE",
    expectedFrameCount: 500,
    evidenceClass: "complete physical animatic",
  });
  await addVideo(context, resolved.mobile.orbitRecord.filename, "03-mobile-camera-optics/mobile-390x844-orbit-F001-F285.mp4", {
    purpose: "focused opening and complete authored mobile orbit excerpt proving optical continuity",
    viewport: "390x844",
    frameOrRange: [1, 285],
    engine: "BLENDER_EEVEE",
    expectedFrameCount: 285,
    evidenceClass: "mobile orbit excerpt",
  });
  const graph = byRelative(resolved.mobile.records, "mobile-optics-graph.svg", "mobile graph");
  await addText(context, graph.filename, "03-mobile-camera-optics/mobile-lens-radius-elevation-projected-scale.svg", {
    purpose: "mobile lens/radius/elevation/projected-screen-size graph",
    viewport: "vector graph",
    frameOrRange: [1, 500],
    engine: "Blender telemetry",
    evidenceClass: "mobile optics graph",
  });
  const csv = byRelative(resolved.mobile.records, "mobile-optics-F001-F500.csv", "mobile CSV");
  await addText(context, csv.filename, "03-mobile-camera-optics/mobile-optics-F001-F500.csv", {
    purpose: "per-frame mobile optics telemetry",
    viewport: "390x844",
    frameOrRange: [1, 500],
    engine: "Blender telemetry",
    evidenceClass: "mobile optics data",
  });
  const mobilePanels = [];
  for (const frame of MOBILE_MILESTONES) {
    const record = byRelative(resolved.mobile.records, `animatic/frames/F${String(frame).padStart(3, "0")}.png`, "mobile milestone");
    mobilePanels.push({ source: await sanitizedWorkingPng(context, record.filename, `mobile optics F${frame}`), label: `F${frame}` });
  }
  const milestoneSheet = "03-mobile-camera-optics/mobile-optics-milestone-sheet.jpg";
  await createContactSheet(mobilePanels, path.join(stageRoot, ...milestoneSheet.split("/")), { columns: 4, panelWidth: 220, panelHeight: 476, title: "Mobile optics · distant establishment -> continuous orbit approach -> frontal entry" });
  await registerWritten(context, milestoneSheet, {
    purpose: "thirteen required mobile optical-continuity milestones",
    viewport: "390x844 source panels",
    frameOrRange: MOBILE_MILESTONES,
    engine: "BLENDER_EEVEE",
    evidenceClass: "mobile milestone sheet",
  });
  await addGeneratedJson(context, "03-mobile-camera-optics/final-mobile-focal-and-projected-scale-report.json", compactMobileReport(resolved.mobile, resolved.source.sourceSha256), {
    purpose: "final focal curve and projected CRT screen-space measurements at required frames",
    viewport: "390x844",
    frameOrRange: MOBILE_FOCAL_FRAMES,
    engine: "Blender telemetry",
    evidenceClass: "mobile optical authority",
  });

  for (const record of resolved.crt.records) {
    const logical = record.relativePath.replace(/^public\//, "");
    const extension = path.extname(logical).toLowerCase();
    const target = `04-exact-q-crt/${logical}`;
    const sourceRecord = record.sourceRecord;
    const metadata = {
      purpose: sourceRecord.purpose ?? `final exact-Q/CRT authority: ${logical}`,
      viewport: sourceRecord.viewport ?? (sourceRecord.width && sourceRecord.height ? `${sourceRecord.width}x${sourceRecord.height}` : null),
      frameOrRange: sourceRecord.frame ?? sourceRecord.frameRange ?? null,
      engine: sourceRecord.renderEngine ?? (logical.includes("stills/") || logical.includes("video/") ? "CYCLES" : null),
      expectedFrameCount: logical.includes("F345-F464") ? 120 : undefined,
      evidenceClass: "final CRT public authority",
    };
    if (logical === "source/quantum-icon-pre-crt-effect.png") {
      const bytes = await readFile(record.filename);
      if (bytes.length !== EXACT_Q_BYTES || sha256(bytes) !== EXACT_Q_SHA256) throw new Error("CRT public exact-Q source is not byte-exact");
      await addExactBinary(context, record.filename, target, metadata);
    } else if (IMAGE_EXTENSIONS.has(extension)) await addImage(context, record.filename, target, metadata, { reusedBlenderPng: false });
    else if (VIDEO_EXTENSIONS.has(extension)) await addVideo(context, record.filename, target, metadata);
    else if (TEXT_EXTENSIONS.has(extension)) await addText(context, record.filename, target, metadata);
    else throw new Error(`unsupported CRT public payload: ${logical}`);
  }

  const responsiveInputs = await buildResponsiveEvidence(context, resolved);

  const regressionTargets = [
    ["entry-settled-320x800", "settled-entry-320x800.png", "320x800 settled semantic ENTRY"],
    ["entry-settled-360x800", "settled-entry-360x800.png", "360x800 settled semantic ENTRY"],
    ["entry-settled-768x1024", "settled-entry-768x1024.png", "768x1024 settled semantic ENTRY"],
    ["entry-settled-844x390", "settled-entry-844x390.png", "complete 844x390 settled semantic ENTRY"],
    ["chrome-hidden", "chrome-active-concealed-844x390.png", "Chrome concealed throughout active cinematic"],
    ["chrome-reverse", "chrome-reverse-concealed-844x390.png", "reverse below settled boundary conceals Chrome"],
    ["skip-intro", "skip-intro-844x390.png", "skip-intro accepted behavior"],
    ["reduced-motion", "reduced-motion-844x390.png", "reduced-motion semantic fallback"],
    ["no-javascript", "no-javascript-844x390.png", "no-JavaScript semantic fallback"],
    ["native-scroll-operating-field", "native-scroll-operating-field-768x1024.png", "native document scroll and semantic Operating Field"],
  ];
  for (const [role, filename, purpose] of regressionTargets) {
    const record = resolved.browser.roles.get(role);
    const viewport = filename.match(/(\d+x\d+)/)?.[1] ?? null;
    await addImage(context, record.filename, `06-accepted-r1-regression/${filename}`, {
      purpose: `${purpose}; accepted prior-runtime proxy, final refined media not integrated`,
      viewport,
      frameOrRange: role.includes("settled") || role === "skip-intro" ? 540 : null,
      engine: "browser runtime state proxy",
      evidenceClass: "accepted R1 regression",
    }, { reusedBlenderPng: false });
  }
  await addText(context, resolved.browser.reportPath, "06-accepted-r1-regression/browser-regression-report.json", {
    purpose: "Chrome suppression, reverse, fallback, responsive ENTRY and native-scroll machine report",
    viewport: "320x800, 360x800, 768x1024, 844x390",
    frameOrRange: [1, 540],
    engine: "browser runtime state proxy",
    evidenceClass: "browser regression report",
  });
  const regressionPanelPaths = [
    ["01-peripheral-proving-hall/intended-exposure-dormant-authority.png", "clean centre"],
    ["02-physical-graphite-current/comparisons/checkpoint2-cable-F285-arrival.png", "origin/arrival/connection"],
    ["04-exact-q-crt/stills/phase4r1-1-crt-stable-primary-F370.png", "exact Q stable"],
    ["05-responsive-physical/360x800/phase4r1-1-360x800-physical-sheet.jpg", "threshold/breath/ENTRY"],
    ["06-accepted-r1-regression/settled-entry-844x390.png", "844x390 ENTRY"],
    ["06-accepted-r1-regression/chrome-active-concealed-844x390.png", "Chrome hidden"],
    ["06-accepted-r1-regression/chrome-reverse-concealed-844x390.png", "reverse hides"],
    ["06-accepted-r1-regression/no-javascript-844x390.png", "no-JS"],
  ].filter(([relative]) => context.paths.has(relative));
  const regressionSheet = "06-accepted-r1-regression/accepted-r1-regression-sheet.jpg";
  await createContactSheet(regressionPanelPaths.map(([relative, label]) => ({ source: path.join(stageRoot, ...relative.split("/")), label })), path.join(stageRoot, ...regressionSheet.split("/")), {
    columns: 4, panelWidth: 320, panelHeight: 240, title: "Accepted R1 regression · machine evidence / human review pending",
  });
  await registerWritten(context, regressionSheet, {
    purpose: "compact accepted-R1 regression sheet: centre, cable, Q, threshold/ENTRY, Chrome and fallback",
    viewport: "mixed review sheet",
    frameOrRange: [1, 540],
    engine: "mixed authenticated evidence",
    evidenceClass: "accepted R1 regression sheet",
  });

  await addGeneratedJson(context, "reports/git-and-source-authority.json", {
    schema: `${SCHEMA}.git-source-report`,
    status: "PASS",
    repository: resolved.repository,
    source: {
      repositoryPath: resolved.source.repositoryPath,
      byteSize: resolved.source.sourceBytes,
      sha256: resolved.source.sourceSha256,
      buildReopenReport: {
        repositoryPath: resolved.source.sourceBuildRepositoryPath,
        byteSize: resolved.source.sourceBuildBytes,
        sha256: resolved.source.sourceBuildSha256,
      },
    },
    authorization: AUTHORIZATION_DENIALS,
    humanReviewDecision: "PENDING",
  }, {
    purpose: "final branch/HEAD/parent/chain/clean/parity/main/source authority and tracked delta report",
    viewport: null,
    frameOrRange: null,
    engine: null,
    evidenceClass: "Git/source report",
  });
  await addGeneratedJson(context, "reports/source-validation-summary.json", compactSourceValidation(resolved.source, resolved), {
    purpose: "Blender save/reopen, packed-Q, missing-path, material, camera, cable and authorization validation",
    viewport: null,
    frameOrRange: [1, 500],
    engine: "Blender 5.2 source audit",
    evidenceClass: "source validation",
  });
  await addGeneratedJson(context, "reports/rejected-crt-trials.json", {
    schema: `${SCHEMA}.rejected-crt-trials`,
    status: "QUARANTINED",
    trials: REJECTED_CRT_TRIALS,
    rejectedFramesIncludedAsAcceptedAuthority: false,
    rejectedRootsReadOrCopiedByPackager: false,
    humanReviewDecision: "PENDING",
  }, {
    purpose: "rejected/superseded CRT trial aliases and rejection reasons; no rejected frames",
    viewport: null,
    frameOrRange: null,
    engine: null,
    evidenceClass: "quarantine disclosure",
  });
  await addGeneratedJson(context, "reports/evidence-limitations.json", limitationsReport(), {
    purpose: "genuine evidence limitations and explicit prohibited-work denial flags",
    viewport: null,
    frameOrRange: null,
    engine: null,
    evidenceClass: "limitations",
  });
  await addText(context, resolved.physical.manifestPath, "reports/producer-manifests/final-physical-public-manifest.json", {
    purpose: "final-source physical public payload authority",
    viewport: "390x844, 320x800, 360x800, 768x1024",
    frameOrRange: [1, 500],
    engine: "BLENDER_EEVEE",
    evidenceClass: "producer manifest",
  });
  await addText(context, resolved.crt.manifestPath, "reports/producer-manifests/crt-phosphor-public-manifest.json", {
    purpose: "final-source CRT public payload authority",
    viewport: "1440x900 and 960x600",
    frameOrRange: [345, 480],
    engine: "CYCLES",
    evidenceClass: "producer manifest",
  });
  await addGeneratedJson(context, "reports/responsive-composition-authority.json", {
    schema: `${SCHEMA}.responsive-composition-authority`,
    status: "PASS",
    authoredFamily: Object.fromEntries(RESPONSIVE_VIEWPORTS.map((viewport) => [viewport, { family: "mobile", reason: viewport === "768x1024" ? "saved AUTO camera fit resolves to VERTICAL" : "portrait mobile family" }])),
    stateOrder: [...RESPONSIVE_STATES.map(([frame, role]) => ({ frame, role })), { frameRange: [501, 513], role: "exact-black-breathing" }, { frame: 540, role: "settled-entry-browser-proxy" }],
    recordingContract: { frames: 112, fps: 30, durationSeconds: 112 / 30, holdFrames: [12, 12, 12, 12, 12, 12, 12, 13, 15], hardCutReviewClip: true },
    physicalInputs: responsiveInputs,
    browserEntryInputs: Object.fromEntries(RESPONSIVE_VIEWPORTS.map((viewport) => [viewport, recordFields(resolved.browser.roles.get(`entry-settled-${viewport}`).sourceRecord, "browser entry input")])),
    finalBlenderSourceHash: resolved.source.sourceSha256,
    finalRefinedMediaIntegrated: false,
    humanReviewDecision: "PENDING",
    authorization: AUTHORIZATION_DENIALS,
  }, {
    purpose: "responsive state composition, family mapping and exact 112-frame clip authority",
    viewport: RESPONSIVE_VIEWPORTS.join(", "),
    frameOrRange: [1, 540],
    engine: "BLENDER_EEVEE + exact black + browser ENTRY proxy",
    evidenceClass: "responsive composition report",
  });
  await addGeneratedJson(context, "reports/png-sanitation-report.json", {
    schema: `${SCHEMA}.png-sanitation`,
    status: "PASS",
    decodedPixelInvariantCount: context.sanitation.filter((item) => item.decodedPixelsUnchanged === true).length,
    allDecodedPixelsUnchanged: context.sanitation.every((item) => item.decodedPixelsUnchanged === true),
    allPrivateMetadataRemoved: true,
    records: context.sanitation,
  }, {
    purpose: "decoded-pixel-invariant PNG privacy sanitation ledger",
    viewport: null,
    frameOrRange: null,
    engine: "sharp/libvips",
    evidenceClass: "privacy audit",
  });
  return context;
}

let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime() {
  return { time: 0, date: (1 << 5) | 1 };
}

function createStoredZipBuffer(entries) {
  const sorted = [...entries].sort((left, right) => lexicalCompare(left.path, right.path));
  if (new Set(sorted.map((entry) => entry.path)).size !== sorted.length) throw new Error("ZIP input contains duplicate paths");
  if (sorted.length > 0xffff) throw new Error("classic ZIP entry limit exceeded");
  const local = [];
  const central = [];
  let offset = 0;
  const stamp = dosDateTime();
  for (const entry of sorted) {
    const relative = safeRelative(entry.path, "ZIP entry path");
    const name = Buffer.from(relative, "utf8");
    const data = Buffer.from(entry.data);
    if (data.length > 0xffffffff || offset + data.length > 0xffffffff) throw new Error("classic ZIP size limit exceeded");
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(stamp.time, 10);
    localHeader.writeUInt16LE(stamp.date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, data);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(stamp.time, 12);
    centralHeader.writeUInt16LE(stamp.date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralBytes, end]);
}

function parseStoredZip(bytes) {
  const entries = [];
  const names = new Set();
  let cursor = 0;
  while (cursor + 4 <= bytes.length && bytes.readUInt32LE(cursor) === 0x04034b50) {
    if (cursor + 30 > bytes.length) throw new Error("ZIP local header truncated");
    const flags = bytes.readUInt16LE(cursor + 6);
    const method = bytes.readUInt16LE(cursor + 8);
    const crc = bytes.readUInt32LE(cursor + 14);
    const compressedSize = bytes.readUInt32LE(cursor + 18);
    const uncompressedSize = bytes.readUInt32LE(cursor + 22);
    const nameLength = bytes.readUInt16LE(cursor + 26);
    const extraLength = bytes.readUInt16LE(cursor + 28);
    const nameStart = cursor + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error("ZIP entry extends beyond archive");
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString("utf8");
    safeRelative(name, "ZIP entry name");
    if (names.has(name)) throw new Error(`ZIP duplicate path: ${name}`);
    names.add(name);
    if (flags !== 0x0800 || method !== 0 || compressedSize !== uncompressedSize || extraLength !== 0
      || bytes.readUInt16LE(cursor + 10) !== 0 || bytes.readUInt16LE(cursor + 12) !== ((1 << 5) | 1)) {
      throw new Error(`ZIP entry is not deterministic stored UTF-8: ${name}`);
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (crc32(data) !== crc) throw new Error(`ZIP CRC failure: ${name}`);
    entries.push({ path: name, data: Buffer.from(data), bytes: data.length, sha256: sha256(data), crc32: crc.toString(16).padStart(8, "0"), localOffset: cursor });
    cursor = dataEnd;
  }
  if (entries.length === 0 || cursor + 4 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIP central directory is missing");
  const centralStart = cursor;
  for (let index = 0; index < entries.length; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`ZIP central entry ${index} is missing`);
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const time = bytes.readUInt16LE(cursor + 12);
    const date = bytes.readUInt16LE(cursor + 14);
    const crc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const disk = bytes.readUInt16LE(cursor + 34);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) throw new Error(`ZIP central entry ${index} is truncated`);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    const local = entries[index];
    if (flags !== 0x0800 || method !== 0 || time !== 0 || date !== ((1 << 5) | 1) || disk !== 0 || extraLength !== 0 || commentLength !== 0
      || name !== local.path || crc.toString(16).padStart(8, "0") !== local.crc32 || compressedSize !== local.bytes || uncompressedSize !== local.bytes || localOffset !== local.localOffset) {
      throw new Error(`ZIP central/local authority mismatch: ${name || index}`);
    }
    cursor = end;
  }
  const eocd = bytes.length - 22;
  if (eocd !== cursor || bytes.readUInt32LE(eocd) !== 0x06054b50) throw new Error("ZIP EOCD is missing or non-canonical");
  const disk = bytes.readUInt16LE(eocd + 4);
  const centralDisk = bytes.readUInt16LE(eocd + 6);
  const diskCount = bytes.readUInt16LE(eocd + 8);
  const declaredCount = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  const commentLength = bytes.readUInt16LE(eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || diskCount !== entries.length || declaredCount !== entries.length
    || centralSize !== eocd - centralStart || centralOffset !== centralStart || commentLength !== 0) {
    throw new Error("ZIP EOCD central-directory authority differs");
  }
  return entries.map(({ localOffset, ...entry }) => entry);
}

async function auditPrivacyAndMedia(entries, manifest, ffmpeg, ffprobe) {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const temporary = await mkdtemp(path.join(tmpdir(), "phase4r1-1-package-audit-"));
  const media = [];
  try {
    for (const entry of entries) {
      if (PRIVATE_PATTERN.test(entry.data.toString("latin1"))) throw new Error(`archive privacy scan failed: ${entry.path}`);
      const extension = path.extname(entry.path).toLowerCase();
      if (TEXT_EXTENSIONS.has(extension)) assertNoPrivateText(entry.data, entry.path);
      if (IMAGE_EXTENSIONS.has(extension)) {
        if (extension === ".png") {
          const chunks = pngChunkInventory(entry.data, entry.path);
          if (chunks.some((chunk) => PNG_PRIVATE_CHUNKS.has(chunk.type))) throw new Error(`archive PNG contains private metadata: ${entry.path}`);
        }
        const metadata = await sharp(entry.data, { failOn: "error" }).metadata();
        await sharp(entry.data, { failOn: "error" }).raw().toBuffer();
        media.push({ path: entry.path, type: "image", width: metadata.width, height: metadata.height, decode: "PASS" });
      } else if (VIDEO_EXTENSIONS.has(extension)) {
        const extracted = path.join(temporary, `${media.length}.mp4`);
        await writeFile(extracted, entry.data);
        const probe = await probeVideo(ffprobe, extracted);
        await fullDecodeVideo(ffmpeg, extracted);
        const authority = manifest.files.find((record) => record.relativePath === entry.path);
        const expectedFrames = EXPECTED_VIDEO_FRAMES[entry.path];
        if (!expectedFrames || authority?.expectedFrameCount !== expectedFrames || probe.frameCount !== expectedFrames) throw new Error(`archive video frame-count authority differs: ${entry.path}`);
        if (/^\d+x\d+$/.test(String(authority?.viewport ?? ""))) {
          const [width, height] = authority.viewport.split("x").map(Number);
          if (probe.width !== width || probe.height !== height) throw new Error(`archive video viewport differs: ${entry.path}`);
        }
        if (PRIVATE_PATTERN.test(JSON.stringify(probe.metadata))) throw new Error(`archive video metadata contains private material: ${entry.path}`);
        media.push({ path: entry.path, type: "video", ...probe, fullDecodePass: true });
      }
    }
    for (const record of manifest.files) if (!byPath.has(record.relativePath)) throw new Error(`manifested payload is missing: ${record.relativePath}`);
    return media;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function auditExistingArchive(archivePath, detachedManifestPath, ffmpegValue, ffprobeValue) {
  const [archiveResolved, manifestResolved, ffmpeg, ffprobe] = await Promise.all([
    assertFile(archivePath, "archive"),
    assertFile(detachedManifestPath, "detached manifest"),
    resolveExecutable(ffmpegValue, "ffmpeg"),
    resolveExecutable(ffprobeValue, "ffprobe"),
  ]);
  if (path.basename(archiveResolved) !== ARCHIVE_FILENAME || path.basename(manifestResolved) !== MANIFEST_FILENAME || path.dirname(archiveResolved) !== path.dirname(manifestResolved)) {
    throw new Error("archive/detached-manifest names or sibling relationship differ");
  }
  if (isWithin(ROOT, archiveResolved) || isWithin(ROOT, manifestResolved)) throw new Error("archive and detached manifest must be external/untracked");
  const [archive, detachedManifestBytes] = await Promise.all([readFile(archiveResolved), readFile(manifestResolved)]);
  if (archive.length > MAX_PACKAGE_BYTES) throw new Error(`archive exceeds ${MAX_PACKAGE_BYTES} bytes`);
  const entries = parseStoredZip(archive);
  const names = entries.map((entry) => entry.path);
  if (new Set(names).size !== names.length) throw new Error("archive has duplicate paths");
  const manifestEntry = entries.find((entry) => entry.path === IN_ARCHIVE_MANIFEST);
  const readmeEntry = entries.find((entry) => entry.path === README_FILENAME);
  if (!manifestEntry || !readmeEntry || !manifestEntry.data.equals(detachedManifestBytes)) throw new Error("archive README/manifest or detached manifest parity failed");
  const manifest = JSON.parse(manifestEntry.data.toString("utf8"));
  if (manifest.schema !== SCHEMA || manifest.status !== "PASS" || manifest.humanAccepted !== false) throw new Error("package manifest root contract differs");
  assertAuthorizationDenied(manifest.authorization, "package manifest");
  if (JSON.stringify(manifest.humanReviewGates) !== JSON.stringify(HUMAN_REVIEW_GATES)) throw new Error("six human gates are not exactly pending/null");
  const filePaths = manifest.files.map((record) => record.relativePath);
  if (new Set(filePaths).size !== filePaths.length) throw new Error("manifest contains duplicate paths");
  if (manifest.fileCountExcludingReadmeAndManifest !== manifest.files.length
    || manifest.payloadByteCountExcludingReadmeAndManifest !== manifest.files.reduce((sum, record) => sum + record.byteSize, 0)) {
    throw new Error("manifest aggregate file/byte counts differ");
  }
  const counts = {
    ledgerFiles: manifest.files.length,
    images: manifest.files.filter((record) => IMAGE_EXTENSIONS.has(path.extname(record.relativePath).toLowerCase())).length,
    videos: manifest.files.filter((record) => VIDEO_EXTENSIONS.has(path.extname(record.relativePath).toLowerCase())).length,
    text: manifest.files.filter((record) => TEXT_EXTENSIONS.has(path.extname(record.relativePath).toLowerCase())).length,
  };
  if (JSON.stringify(counts) !== JSON.stringify(EXPECTED_PACKAGE_COUNTS)) throw new Error(`package semantic media counts differ: ${JSON.stringify(counts)}`);
  for (const required of REQUIRED_PACKAGE_PATHS) if (!filePaths.includes(required)) throw new Error(`required review payload is missing: ${required}`);
  const expected = [...filePaths, README_FILENAME, IN_ARCHIVE_MANIFEST].sort(lexicalCompare);
  if (JSON.stringify([...names].sort(lexicalCompare)) !== JSON.stringify(expected)) throw new Error("archive payload/manifest coverage is not exhaustive");
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const record of manifest.files) {
    validatePackageMetadata(record);
    const entry = byPath.get(record.relativePath);
    if (entry.bytes !== record.byteSize || entry.sha256 !== record.sha256) throw new Error(`archive hash/size differs from manifest: ${record.relativePath}`);
  }
  for (const name of names) {
    if (/(?:^|\/)(?:raw|frames|receipts|chunks|cache)(?:\/|$)/i.test(name) || /\.(?:blend\d*|exr|db)$/i.test(name)) throw new Error(`forbidden raw/source/cache payload in archive: ${name}`);
    if (/F(?:50[1-9]|5[1-3]\d|540)/i.test(name) && !/entry|regression|report|manifest/i.test(name)) throw new Error(`forbidden physical render filename above F500: ${name}`);
    if (/F001-F540|540-frame.*\.(?:mp4|mov|mkv|webm)$/i.test(name)) throw new Error(`production-film-shaped payload in archive: ${name}`);
    if (/(?:rejected|quarantine|superseded).+\.(?:png|jpe?g|mp4|mov|webm)$/i.test(name)) throw new Error(`rejected media is presented in archive: ${name}`);
  }
  const media = await auditPrivacyAndMedia(entries, manifest, ffmpeg, ffprobe);
  return {
    schema: AUDIT_SCHEMA,
    status: "PASS",
    generatedAt: FIXED_EPOCH,
    archive: { filename: path.basename(archivePath), byteSize: archive.length, sha256: sha256(archive), entryCount: entries.length },
    manifest: { filename: path.basename(detachedManifestPath), byteSize: detachedManifestBytes.length, sha256: sha256(detachedManifestBytes), detachedEqualsArchived: true },
    checks: {
      zipOpens: true,
      crcPass: true,
      duplicatePaths: false,
      exhaustiveManifestCoverage: true,
      everyFileHashMatches: true,
      everyFileSizeMatches: true,
      imageDecodePass: true,
      videoProbeAndFullDecodePass: true,
      expectedVideoFrameCountsMatch: true,
      privatePathLeakCount: 0,
      rejectedEvidencePresentedAsAccepted: false,
      rawFullSequenceIncluded: false,
      productionFilmIncluded: false,
      archiveExternalAndUntracked: true,
      semanticInventoryAndMediaCountsExact: true,
    },
    media,
    authorization: AUTHORIZATION_DENIALS,
    humanReviewGates: HUMAN_REVIEW_GATES,
  };
}

function deterministicZipSelfTest() {
  const entries = [
    { path: "b.txt", data: Buffer.from("bravo\n") },
    { path: "a.txt", data: Buffer.from("alpha\n") },
  ];
  const first = createStoredZipBuffer(entries);
  const second = createStoredZipBuffer([...entries].reverse());
  if (!first.equals(second)) throw new Error("deterministic ZIP self-test differs by input order");
  const parsed = parseStoredZip(first);
  if (parsed.length !== 2 || parsed[0].path !== "a.txt" || parsed[1].path !== "b.txt") throw new Error("ZIP parse self-test differs");
  return { status: "PASS", byteSize: first.length, sha256: sha256(first), entryCount: parsed.length, fixedTimestamp: FIXED_EPOCH };
}

async function pureSelfTest() {
  const sanitized = sanitizeValue({ path: "C:/Users/example/AppData/file.png", safe: "artifacts/source.blend" });
  if (sanitized.path !== "[redacted-private-path]" || sanitized.safe !== "artifacts/source.blend") throw new Error("privacy sanitizer self-test failed");
  for (const decision of Object.values(HUMAN_REVIEW_GATES)) if (decision !== null) throw new Error("human gate self-test failed");
  assertAuthorizationDenied(AUTHORIZATION_DENIALS, "self-test authorization");
  const expectedResponsiveStates = [[1, "dormancy"], [76, "early-current"], [165, "mid-current"], [225, "side-rear-orbit"], [370, "stable-q"], [450, "late-approach"], [480, "threshold"]];
  const expectedResponsiveHolds = [12, 12, 12, 12, 12, 12, 12, 13, 15];
  if (JSON.stringify(RESPONSIVE_STATES) !== JSON.stringify(expectedResponsiveStates) || JSON.stringify(RESPONSIVE_HOLDS) !== JSON.stringify(expectedResponsiveHolds)) {
    throw new Error("responsive state/hold contract self-test failed");
  }
  if (Object.keys(EXPECTED_VIDEO_FRAMES).length !== EXPECTED_PACKAGE_COUNTS.videos) throw new Error("video inventory self-test failed");
  let invalidAuthorizationRejected = false;
  try { assertAuthorizationDenied({}, "invalid fixture"); } catch { invalidAuthorizationRejected = true; }
  if (!invalidAuthorizationRejected) throw new Error("authorization negative-control self-test failed");
  let humanAcceptanceRejected = false;
  try { assertHumanPending({ humanAcceptance: true }, "invalid human fixture"); } catch { humanAcceptanceRejected = true; }
  if (!humanAcceptanceRejected) throw new Error("human-decision negative-control self-test failed");
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#120016" } }).png().toBuffer();
  const chunks = pngChunkInventory(png, "self-test.png");
  if (chunks.some((chunk) => PNG_PRIVATE_CHUNKS.has(chunk.type))) throw new Error("PNG self-test contains metadata");
  return {
    schema: `${SCHEMA}.self-test`,
    status: "PASS",
    zip: deterministicZipSelfTest(),
    privacySanitizer: true,
    pngCrcAndMetadataScanner: true,
    humanGatesPending: Object.keys(HUMAN_REVIEW_GATES).length,
    authorizationDenied: true,
    invalidAuthorizationRejected,
    humanAcceptanceRejected,
    responsiveContract: { viewports: RESPONSIVE_VIEWPORTS, states: RESPONSIVE_HOLDS.length, recordingFrames: RESPONSIVE_HOLDS.reduce((sum, value) => sum + value, 0), breathingFrames: RESPONSIVE_HOLDS[7] },
  };
}

async function assemblePackage(resolved) {
  const stageRoot = await mkdtemp(path.join(resolved.outputParent, ".phase4r1-1-package-staging-"));
  const workRoot = await mkdtemp(path.join(tmpdir(), "phase4r1-1-package-work-"));
  let outputWritten = false;
  try {
    const context = await assembleStaging(resolved, stageRoot, workRoot);
    const calibration = resolved.source.report.stages.crt.qPhosphorTreatment;
    const readme = readmeText({ source: resolved.source, repository: resolved.repository, calibration });
    assertNoPrivateText(readme, README_FILENAME);
    await atomicWrite(path.join(stageRoot, README_FILENAME), readme);
    const files = [...context.records].sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
    const manifest = {
      schema: SCHEMA,
      status: "PASS",
      generatedAt: FIXED_EPOCH,
      classification: "PHASE 4-R1.1 TARGETED PREPRODUCTION REPAIR / HUMAN REVIEW PENDING / PRODUCTION UNAUTHORIZED",
      humanAccepted: false,
      humanReviewGates: HUMAN_REVIEW_GATES,
      authorization: AUTHORIZATION_DENIALS,
      repository: resolved.repository,
      finalSourceAuthority: {
        repositoryPath: resolved.source.repositoryPath,
        byteSize: resolved.source.sourceBytes,
        sha256: resolved.source.sourceSha256,
        buildReopenReport: {
          repositoryPath: resolved.source.sourceBuildRepositoryPath,
          byteSize: resolved.source.sourceBuildBytes,
          sha256: resolved.source.sourceBuildSha256,
        },
      },
      exactQAuthority: { repositoryPath: EXACT_Q_REPOSITORY_PATH, byteSize: EXACT_Q_BYTES, sha256: EXACT_Q_SHA256, preEffectsDifferentPixels: 0 },
      finalRepairCategories: ["peripheral proving-hall authority", "physical graphite current", "repaired mobile optics", "final exact-Q CRT phosphor/glass treatment", "all accepted R1 frozen states"],
      finalCrtCalibration: calibration,
      rejectedCrtTrials: REJECTED_CRT_TRIALS,
      evidenceGates: {
        peripheralProvingHallAuthority: "01-peripheral-proving-hall/",
        physicalGraphiteCurrent: "02-physical-graphite-current/",
        mobileCameraOpticalContinuity: "03-mobile-camera-optics/",
        exactQAndCrtPhosphorAuthority: "04-exact-q-crt/",
        responsivePhysicalCinematicEvidence: "05-responsive-physical/",
        acceptedR1Regression: "06-accepted-r1-regression/",
      },
      packageBoundary: {
        rawSequencesIncluded: false,
        blenderSourceIncluded: false,
        rejectedFramesIncluded: false,
        complete540FrameCyclesFilmIncluded: false,
        finalProductionCinematicIncluded: false,
        runtimeIntegrationIncluded: false,
        readmeExcludedFromFileLedger: true,
        manifestExcludedFromOwnFileLedger: true,
        exhaustiveAllowedExceptions: [README_FILENAME, IN_ARCHIVE_MANIFEST],
      },
      deterministicPolicy: {
        zip: "stored classic ZIP; lexical UTF-8 paths; fixed DOS timestamp; no comments/extras",
        fixedTimestamp: FIXED_EPOCH,
        packageLimitBytes: MAX_PACKAGE_BYTES,
        png: "reused Blender PNGs re-encoded from raw decoded pixels; decoded-pixel SHA equality required; tEXt/zTXt/iTXt/eXIf absent",
        video: "single video stream; metadata stripped; ffprobe count plus full ffmpeg decode",
        independentAudit: "separate Node process reopens archive and detached manifest",
        node: process.version,
        sharp: sharp.versions.sharp,
        libvips: sharp.versions.vips,
      },
      files,
      fileCountExcludingReadmeAndManifest: files.length,
      payloadByteCountExcludingReadmeAndManifest: files.reduce((sum, record) => sum + record.byteSize, 0),
    };
    await atomicJson(path.join(stageRoot, IN_ARCHIVE_MANIFEST), manifest);
    const inventory = await listFiles(stageRoot);
    const expected = [...files.map((record) => record.relativePath), README_FILENAME, IN_ARCHIVE_MANIFEST].sort(lexicalCompare);
    if (JSON.stringify(inventory.sort(lexicalCompare)) !== JSON.stringify(expected)) throw new Error("staging contains missing or unmanifested payloads");
    for (const relative of inventory) {
      const bytes = await readFile(path.join(stageRoot, ...relative.split("/")));
      if (PRIVATE_PATTERN.test(bytes.toString("latin1"))) throw new Error(`staging privacy scan failed: ${relative}`);
    }
    const zipEntries = await Promise.all(inventory.map(async (relative) => ({ path: relative, data: await readFile(path.join(stageRoot, ...relative.split("/"))) })));
    const archive = createStoredZipBuffer(zipEntries);
    if (archive.length > MAX_PACKAGE_BYTES) throw new Error(`package is ${archive.length} bytes; compact limit is ${MAX_PACKAGE_BYTES}`);
    const manifestBytes = await readFile(path.join(stageRoot, IN_ARCHIVE_MANIFEST));
    await atomicWrite(resolved.output, archive);
    outputWritten = true;
    await atomicWrite(resolved.detached.manifest, manifestBytes);
    const { stdout } = await execFileAsync(process.execPath, [
      PACKAGER_FILE,
      "--audit-existing", resolved.output,
      "--manifest", resolved.detached.manifest,
      "--ffmpeg", resolved.ffmpeg,
      "--ffprobe", resolved.ffprobe,
    ], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    const audit = JSON.parse(stdout);
    if (audit.status !== "PASS") throw new Error("independent package process did not pass");
    await atomicJson(resolved.detached.audit, audit);
    const auditBytes = await readFile(resolved.detached.audit);
    const postHead = await runGit(["rev-parse", "HEAD"]);
    const postStatus = await runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
    if (postHead !== resolved.repository.head || postStatus) throw new Error("Git state changed during external package assembly");
    const result = {
      schema: RESULT_SCHEMA,
      status: "PASS",
      generatedAt: FIXED_EPOCH,
      archive: { pathAlias: ARCHIVE_FILENAME, byteSize: archive.length, sha256: sha256(archive), entryCount: zipEntries.length },
      manifest: { pathAlias: MANIFEST_FILENAME, byteSize: manifestBytes.length, sha256: sha256(manifestBytes), detachedEqualsArchived: true },
      independentAudit: { pathAlias: AUDIT_FILENAME, byteSize: auditBytes.length, sha256: sha256(auditBytes), separateProcess: true, status: audit.status },
      outputExternalAndUntracked: true,
      repositoryHeadUnchangedDuringAssembly: true,
      authorization: AUTHORIZATION_DENIALS,
      humanReviewGates: HUMAN_REVIEW_GATES,
    };
    await atomicJson(resolved.detached.result, result);
    return { result, audit };
  } catch (error) {
    if (outputWritten) await rm(resolved.output, { force: true }).catch(() => {});
    for (const filename of Object.values(resolved.detached)) await rm(filename, { force: true }).catch(() => {});
    throw error;
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.printContract) { process.stdout.write(stableJson(inputContractTemplate())); return; }
  if (options.selfTest) { process.stdout.write(stableJson(await pureSelfTest())); return; }
  if (options.auditExisting) {
    if (!options.detachedManifest) throw new Error("--audit-existing requires --manifest");
    process.stdout.write(stableJson(await auditExistingArchive(options.auditExisting, options.detachedManifest, options.ffmpeg, options.ffprobe)));
    return;
  }
  const resolved = await resolveInputs(options);
  if (options.dryValidate) {
    process.stdout.write(stableJson({
      schema: `${SCHEMA}.dry-validation`,
      status: "PASS",
      outputAlias: ARCHIVE_FILENAME,
      repository: resolved.repository,
      source: { repositoryPath: resolved.source.repositoryPath, byteSize: resolved.source.sourceBytes, sha256: resolved.source.sourceSha256 },
      inputs: {
        peripheryFiles: resolved.periphery.records.length,
        cableDiagnosticFiles: resolved.cableDiagnostic.records.length,
        cableComparisonFiles: resolved.cableComparison.records.length,
        mobileAuthenticatedArtifacts: resolved.mobile.records.length,
        crtPublicFiles: resolved.crt.records.length,
        physicalPublicFiles: resolved.physical.records.length,
        browserPublicFiles: resolved.browser.records.length,
      },
      responsivePlan: { viewports: RESPONSIVE_VIEWPORTS, sheets: 3, recordings: 3, recordingFramesEach: 112, blackBreathingFrames: 13, family768x1024: "Mobile / AUTO->VERTICAL" },
      rejectedRootsConsumed: false,
      authorization: AUTHORIZATION_DENIALS,
      humanReviewGates: HUMAN_REVIEW_GATES,
      writesPerformed: false,
    }));
    return;
  }
  const packaged = await assemblePackage(resolved);
  process.stdout.write(stableJson(packaged.result));
}

main().catch((error) => {
  process.stderr.write(`Phase 4-R1.1 targeted-repair packaging failed: ${error.stack ?? error}\n`);
  process.exitCode = 1;
});
