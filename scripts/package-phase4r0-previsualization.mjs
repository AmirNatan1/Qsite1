#!/usr/bin/env node

/**
 * Package the Phase 4-R0 orbit / signal-threshold previsualization.
 *
 * This tool is deliberately an external-only evidence packager. It never
 * renders Blender, never changes an accepted authority, and never writes raw
 * frames, ENTRY plates, or review output into the repository. The supplied
 * physical frames must already be fresh Eevee renders from real Blender
 * cameras and must be bound by the supplied source-build/validation reports.
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
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OPENING_COMPOSITION_SCRIPT_PATH = path.join(
  ROOT,
  "artifacts",
  "original",
  "phase-4r0-orbit-signal-threshold",
  "source",
  "measure_phase4r0_opening_composition.py",
);
const PHYSICAL_FRAME_START = 1;
const PHYSICAL_FRAME_END = 500;
const DEEP_BLACK_START = 501;
const DEEP_BLACK_END = 513;
const SEMANTIC_START = 514;
const FINAL_FRAME = 540;
const FRAME_RATE = 30;
const ARCHIVE_FILENAME = "phase-4r0-orbit-signal-threshold-previsualization.zip";
const MANIFEST_FILENAME = "phase-4r0-orbit-signal-threshold-previsualization-manifest.json";
const RESULT_FILENAME = "phase-4r0-orbit-signal-threshold-previsualization-result.json";
const README_FILENAME = "README.md";
const CLASSIFICATION = "PHASE 4-R0 PREVISUALIZATION · NOT PRODUCTION · HUMAN UNACCEPTED · PHASE 5 UNAUTHORIZED";
const FROZEN_DERIVATIVE_SHA256 = "838f304a0f029f5570c1ede2b4ce20c7e7475571f1e7e4fb7d6286e5536e72d3";
const FIXED_EPOCH = "1980-01-01T00:00:00.000Z";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const HANDOFF_TEXT_EXTENSIONS = new Set([".json", ".md", ".py", ".txt", ".csv"]);
const FAMILIES = Object.freeze(["desktop", "mobile", "landscape"]);

const OUTPUT_DIRECTORIES = Object.freeze([
  "animatics",
  "diagrams",
  "reports",
  "sheets",
]);

const RESPONSIVE_VIEWPORTS = Object.freeze([
  { id: "desktop-1440x900", plateId: "desktop-1440x900", width: 1440, height: 900, family: "desktop" },
  { id: "short-desktop-1366x650", plateId: "short-height-1366x650", width: 1366, height: 650, family: "desktop" },
  { id: "desktop-1280x800", plateId: "desktop-1280x800", width: 1280, height: 800, family: "desktop" },
  { id: "tablet-landscape-1024x768", plateId: "tablet-landscape-1024x768", width: 1024, height: 768, family: "desktop" },
  { id: "tablet-portrait-768x1024", plateId: "tablet-portrait-768x1024", width: 768, height: 1024, family: "mobile" },
  { id: "phone-390x844", plateId: "mobile-390x844", width: 390, height: 844, family: "mobile" },
  { id: "phone-360x800", plateId: "mobile-360x800", width: 360, height: 800, family: "mobile" },
  { id: "phone-320x800", plateId: "narrow-320x800", width: 320, height: 800, family: "mobile" },
  { id: "short-landscape-844x390", plateId: "mobile-landscape-844x390", width: 844, height: 390, family: "landscape" },
]);

const SHORT_LANDSCAPE_NEIGHBORS = Object.freeze([
  { id: "740x360", plateId: "short-landscape-neighbor-740x360", width: 740, height: 360 },
  { id: "800x360", plateId: "short-landscape-neighbor-800x360", width: 800, height: 360 },
  { id: "844x390", plateId: "mobile-landscape-844x390", width: 844, height: 390 },
  { id: "896x414", plateId: "short-landscape-neighbor-896x414", width: 896, height: 414 },
  { id: "900x480", plateId: "short-landscape-neighbor-900x480", width: 900, height: 480 },
]);

const DEFAULT_TIMELINE = Object.freeze({
  schema: "quantum-hub.phase-4-r0.previsualization-timeline-proposal.v1",
  classification: CLASSIFICATION,
  fps: FRAME_RATE,
  frameStart: PHYSICAL_FRAME_START,
  frameEnd: FINAL_FRAME,
  physical: Object.freeze({ start: 1, end: 500, source: "fresh Eevee real-camera frame roots" }),
  deepBlackBeat: Object.freeze({
    start: DEEP_BLACK_START,
    end: DEEP_BLACK_END,
    frames: DEEP_BLACK_END - DEEP_BLACK_START + 1,
    rule: "pre-encode plates are exact RGB 0/0/0; encoded H.264 is decoded-gated as nominal black with no semantic plate pixels",
  }),
  semanticResolve: Object.freeze({
    start: SEMANTIC_START,
    end: FINAL_FRAME,
    frames: FINAL_FRAME - SEMANTIC_START + 1,
    alpha: "0.04 + 0.96 * smoothstep((frame-514)/26)",
    contrast: "0.88 + 0.12 * smoothstep",
    softnessSigma: "1.25 * (1 - smoothstep), disabled below 0.30",
    source: "actual supplied ENTRY plates only",
  }),
  events: Object.freeze({
    dormancyStart: 1,
    dormancyHoldEnd: 45,
    conductionStart: 46,
    conduction25: 106,
    conduction50: 165,
    conduction75: 225,
    orbitCompleteCurrentArrival: 285,
    indicatorResponse: 292,
    horizontalLineStart: 300,
    horizontalLinePeak: 308,
    horizontalLineEnd: 315,
    rasterExpansionStart: 316,
    rasterExpansionEnd: 335,
    blackStabilized: 355,
    qFirstReadable: 356,
    qStable: 370,
    qHoldEnd: 405,
    frontalPushStart: 406,
    lateApproach: 460,
    glassFill: 480,
    thresholdCrossing: 500,
    deepBlackStart: 501,
    deepBlackEnd: 513,
    semanticGeometryStart: 514,
    h1FirstReadable: 525,
    semanticHalfReveal: 531,
    settledEntry: 540,
  }),
  orbitMilestones: Object.freeze({
    "0deg": 1,
    "90deg": 106,
    "180deg": 165,
    "270deg": 225,
    "360deg": 285,
    frontal: 406,
    entry: 540,
  }),
  conductionFrames: Object.freeze([1, 46, 106, 165, 225, 285, 292]),
  crtQualityFrames: Object.freeze([
    292,
    300,
    308,
    315,
    316,
    325,
    335,
    370,
  ]),
  portalFrames: Object.freeze([
    405,
    460,
    480,
    495,
    500,
    501,
    513,
    514,
    525,
    531,
    540,
  ]),
  responsiveFrames: Object.freeze([1, 165, 370, 460, 500, 540]),
});

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
    entryPlates: null,
    openingAuthority: null,
    openingCompositionReport: null,
    sourceBuildReport: null,
    sourceValidationReport: null,
    output: null,
    ffmpeg: process.env.FFMPEG_PATH ?? null,
    help: false,
  };
  const pathFlags = new Map([
    ["--desktop-frames", "desktopFrames"],
    ["--mobile-frames", "mobileFrames"],
    ["--landscape-frames", "landscapeFrames"],
    ["--entry-plates", "entryPlates"],
    ["--opening-authority", "openingAuthority"],
    ["--opening-composition-report", "openingCompositionReport"],
    ["--source-build-report", "sourceBuildReport"],
    ["--source-validation-report", "sourceValidationReport"],
    ["--output", "output"],
    ["--ffmpeg", "ffmpeg"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (pathFlags.has(value)) {
      const key = pathFlags.get(value);
      const supplied = argumentValue(argv, index, value);
      options[key] = key === "ffmpeg" && !/[\\/]/.test(supplied) ? supplied : path.resolve(supplied);
      index += 1;
    } else if (value === "--help" || value === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  if (options.help) return options;
  for (const [key, label] of [
    ["desktopFrames", "--desktop-frames"],
    ["mobileFrames", "--mobile-frames"],
    ["landscapeFrames", "--landscape-frames"],
    ["entryPlates", "--entry-plates"],
    ["openingAuthority", "--opening-authority"],
    ["openingCompositionReport", "--opening-composition-report"],
    ["sourceBuildReport", "--source-build-report"],
    ["sourceValidationReport", "--source-validation-report"],
    ["output", "--output"],
  ]) {
    if (!options[key]) throw new Error(`${label} is required`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 4-R0 orbit / signal-threshold previsualization packager

Usage:
  node scripts/package-phase4r0-previsualization.mjs \\
    --desktop-frames <external-root-with-f001..f500> \\
    --mobile-frames <external-root-with-f001..f500> \\
    --landscape-frames <external-root-with-f001..f500> \\
    --entry-plates <external-root-with-desktop-mobile-landscape-plates> \\
    --opening-authority <current-opening-image-video-or-frame-root> \\
    --opening-composition-report <external-Blender-F001-geometry-report.json> \\
    --source-build-report <phase4r0-source-build.json> \\
    --source-validation-report <phase4r0-source-validation.json> \\
    --output <fresh-external-phase4r0-root> [--ffmpeg <executable>]

The three physical frame roots and ENTRY plate root must resolve outside the
repository. The output must be a fresh external directory. Read-only authority
and report files may reside in the repository, but are never changed or copied
as raw authorities. Each physical root must carry its PASS fresh-Eevee render
report with exact F001–500 hashes and real-camera telemetry. Source reports
must state PASS and bind the Blender derivative plus explicit Quantum-Q/logo
provenance. The ENTRY root must carry its PASS capture manifest.
The opening-composition report must be the external PASS output of the frozen
Blender geometry measurement script, bind its exact bytes/SHA-256, prove
Blender 5.2.x, and bind all three real F001 cameras.
The selected FFmpeg executable must expose the libx264 encoder and have its
matching FFprobe executable beside it.

Output classification: ${CLASSIFICATION}
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
  if (!(await stat(resolved)).isFile()) throw new Error(`${label} must be a file: ${candidate}`);
  return resolved;
}

async function assertExternalDirectory(candidate, label) {
  const resolved = await realpath(candidate);
  if (!(await stat(resolved)).isDirectory()) throw new Error(`${label} must be a directory: ${candidate}`);
  if (isWithin(ROOT, resolved)) {
    throw new Error(`${label} must resolve outside the repository and accepted evidence roots: ${resolved}`);
  }
  return resolved;
}

async function validateFreshExternalOutput(output, inputRoots) {
  const basename = path.basename(output);
  if (!/phase[-_]?4r0|phase[-_]?4[-_]?r0/i.test(basename)) {
    throw new Error("--output basename must clearly contain phase4r0 or phase-4-r0");
  }
  if (await pathExists(output)) throw new Error("--output already exists; choose a fresh external root");
  const resolved = await resolveFromExistingAncestor(output);
  if (isWithin(ROOT, resolved)) throw new Error("--output must resolve outside the repository and accepted evidence roots");
  for (const inputRoot of inputRoots) {
    if (isWithin(inputRoot, resolved) || isWithin(resolved, inputRoot)) {
      throw new Error("--output must not contain, equal, or be contained by an external input root");
    }
  }
}

async function supportsLibx264(candidate) {
  if (!candidate) return false;
  try {
    const result = await execFileAsync(candidate, ["-hide_banner", "-encoders"], { windowsHide: true, maxBuffer: 4_000_000 });
    return /(?:^|\s)libx264(?:\s|$)/m.test(`${result.stdout}\n${result.stderr}`);
  } catch {
    return false;
  }
}

async function resolveFfmpeg(override) {
  const candidates = [];
  if (override) candidates.push(path.isAbsolute(override) || /[\\/]/.test(override) ? path.resolve(override) : override);
  candidates.push(process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  const roots = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0") {
    roots.push(path.resolve(process.env.PLAYWRIGHT_BROWSERS_PATH));
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, "ms-playwright"));
  else if (process.env.HOME) roots.push(path.join(process.env.HOME, ".cache", "ms-playwright"));
  for (const root of roots) {
    let names = [];
    try {
      names = await readdir(root);
    } catch {
      continue;
    }
    for (const directory of names.filter((name) => name.startsWith("ffmpeg-")).sort().reverse()) {
      for (const filename of process.platform === "win32"
        ? ["ffmpeg-win64.exe", "ffmpeg.exe"]
        : ["ffmpeg-linux", "ffmpeg-mac", "ffmpeg"]) {
        candidates.push(path.join(root, directory, filename));
      }
    }
  }
  for (const candidate of candidates) {
    if (await supportsLibx264(candidate)) return candidate;
  }
  throw new Error("A full FFmpeg build with the libx264 encoder was not found; pass --ffmpeg <executable>");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filename) {
  return sha256(await readFile(filename));
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableGeneratedAt() {
  if (process.env.SOURCE_DATE_EPOCH) {
    const seconds = Number(process.env.SOURCE_DATE_EPOCH);
    if (!Number.isInteger(seconds) || seconds < 315532800) {
      throw new Error("SOURCE_DATE_EPOCH must be an integer Unix timestamp no earlier than 1980-01-01");
    }
    const date = new Date(seconds * 1000);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 2107) {
      throw new Error("SOURCE_DATE_EPOCH must fit the classic ZIP 1980–2107 date range");
    }
    return date.toISOString();
  }
  return FIXED_EPOCH;
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

async function readJsonFile(filename, label) {
  let value;
  try {
    value = JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must contain a JSON object`);
  return value;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svg(width, height, content) {
  return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`);
}

function wrapText(value, maximumCharacters) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean).flatMap((word) => {
    if (word.length <= maximumCharacters) return [word];
    const chunks = [];
    for (let index = 0; index < word.length; index += maximumCharacters) chunks.push(word.slice(index, index + maximumCharacters));
    return chunks;
  });
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current || `${current} ${word}`.length <= maximumCharacters) current = current ? `${current} ${word}` : word;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function listFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => lexicalCompare(left.name, right.name))) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, next));
    else if (entry.isFile()) files.push(next.replaceAll("\\", "/"));
  }
  return files;
}

function frameNumberFromFilename(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return null;
  const stem = path.basename(filename, extension);
  const explicit = stem.match(/(?:^|[^a-z0-9])f(?:rame)?[-_ ]*0*(\d{1,6})(?:$|[^0-9])/i);
  if (explicit) return Number(explicit[1]);
  const trailing = stem.match(/(?:^|[^0-9])0*(\d{1,6})$/);
  return trailing ? Number(trailing[1]) : null;
}

async function resolvePhysicalSequence(root, family) {
  const files = await listFiles(root);
  const frames = new Map();
  for (const relativePath of files) {
    const frame = frameNumberFromFilename(relativePath);
    if (!Number.isInteger(frame) || frame < PHYSICAL_FRAME_START || frame > PHYSICAL_FRAME_END) continue;
    if (frames.has(frame)) {
      throw new Error(`${family} frame root has duplicate frame ${frame}: ${frames.get(frame)} and ${relativePath}`);
    }
    frames.set(frame, path.join(root, ...relativePath.split("/")));
  }
  const missing = [];
  for (let frame = PHYSICAL_FRAME_START; frame <= PHYSICAL_FRAME_END; frame += 1) {
    if (!frames.has(frame)) missing.push(frame);
  }
  if (missing.length) throw new Error(`${family} frame root must contain exactly F001..F500; missing ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? "…" : ""}`);
  if (frames.size !== PHYSICAL_FRAME_END) throw new Error(`${family} frame root did not resolve to exactly 500 physical frames`);

  const firstMetadata = await sharp(frames.get(1)).metadata();
  if (!firstMetadata.width || !firstMetadata.height) throw new Error(`${family} F001 has no readable dimensions`);
  if (firstMetadata.width % 2 || firstMetadata.height % 2) throw new Error(`${family} dimensions must be even for yuv420p H.264`);
  const checkpoints = [1, 90, 180, 270, 360, 500];
  for (const frame of checkpoints) {
    const metadata = await sharp(frames.get(frame)).metadata();
    if (metadata.width !== firstMetadata.width || metadata.height !== firstMetadata.height) {
      throw new Error(`${family} frame dimensions change at F${String(frame).padStart(3, "0")}`);
    }
  }
  if (family === "desktop" && firstMetadata.width / firstMetadata.height < 1.5) throw new Error("desktop physical frames must be landscape");
  if (family === "mobile" && firstMetadata.width / firstMetadata.height >= 1) throw new Error("mobile physical frames must be portrait");
  if (family === "landscape" && firstMetadata.width / firstMetadata.height < 1.8) throw new Error("landscape physical frames must use a short-landscape composition");

  const reportCandidates = files.filter((relativePath) => /(?:^|\/)phase4r0-[^/]+-render-report\.json$/i.test(relativePath));
  const exactReport = reportCandidates.filter((relativePath) => path.basename(relativePath).toLowerCase() === `phase4r0-${family}-render-report.json`);
  const selectedReports = exactReport.length ? exactReport : reportCandidates;
  if (selectedReports.length !== 1) {
    throw new Error(`${family} frame root must contain exactly one fresh Blender render report; found ${selectedReports.join(", ") || "none"}`);
  }
  const renderReportPath = path.join(root, ...selectedReports[0].split("/"));
  const renderReportBytes = await readFile(renderReportPath);
  let renderReport;
  try {
    renderReport = JSON.parse(renderReportBytes);
  } catch (error) {
    throw new Error(`${family} render report is invalid JSON: ${error.message}`);
  }
  const engine = String(renderReport.engine ?? "").toUpperCase();
  if (
    String(renderReport.status ?? "").toUpperCase() !== "PASS"
    || String(renderReport.variant ?? "").toLowerCase() !== family
    || !/^BLENDER_EEVEE/.test(engine)
    || String(renderReport.requested_engine ?? "").toLowerCase() !== "eevee"
    || String(renderReport.evidence_class ?? "").toUpperCase() !== "FRESH_BLENDER_EEVEE_PREVISUALIZATION"
    || renderReport.fps !== FRAME_RATE
  ) {
    throw new Error(`${family} render report must prove PASS fresh 30fps Blender Eevee previsualization for the same family`);
  }
  if (renderReport.production_rendering !== false) {
    throw new Error(`${family} render report must remain explicitly non-production`);
  }
  if (!Array.isArray(renderReport.resolution) || renderReport.resolution[0] !== firstMetadata.width || renderReport.resolution[1] !== firstMetadata.height) {
    throw new Error(`${family} render report resolution does not match its physical frames`);
  }
  if (!Array.isArray(renderReport.frames) || renderReport.frames.length !== PHYSICAL_FRAME_END) {
    throw new Error(`${family} render report must contain 500 ordered physical-frame records`);
  }
  const renderFrames = new Map();
  for (const record of renderReport.frames) {
    const frame = numeric(record?.frame);
    if (!Number.isInteger(frame) || frame < 1 || frame > 500 || renderFrames.has(frame)) {
      throw new Error(`${family} render report has an invalid or duplicate frame record: ${record?.frame}`);
    }
    const reportedPath = path.resolve(root, String(record.path ?? ""));
    if (!record.path || !isWithin(root, reportedPath) || normalizedPath(reportedPath) !== normalizedPath(frames.get(frame))) {
      throw new Error(`${family} render report F${String(frame).padStart(3, "0")} does not bind the resolved physical image`);
    }
    if (!/^[a-f0-9]{64}$/i.test(String(record.sha256 ?? "")) || !Number.isInteger(record.bytes) || record.bytes <= 0) {
      throw new Error(`${family} render report F${String(frame).padStart(3, "0")} lacks exact byte/hash provenance`);
    }
    if (!cameraSampleCandidate(record)) {
      throw new Error(`${family} render report F${String(frame).padStart(3, "0")} lacks real-camera world/lens telemetry`);
    }
    renderFrames.set(frame, record);
  }

  return {
    family,
    root,
    frames,
    width: firstMetadata.width,
    height: firstMetadata.height,
    format: firstMetadata.format,
    renderReport,
    renderReportPath,
    renderReportRecord: {
      role: `${family}-fresh-eevee-render-report`,
      basename: path.basename(renderReportPath),
      bytes: renderReportBytes.length,
      sha256: sha256(renderReportBytes),
    },
    renderFrames,
  };
}

async function resolveEntryPlates(root) {
  const manifestPath = path.join(root, "phase-4r0-entry-plates-manifest.json");
  const manifest = await readJsonFile(manifestPath, "ENTRY plate manifest");
  if (String(manifest.status ?? "").toUpperCase() !== "PASS" || !Array.isArray(manifest.captures)) {
    throw new Error("ENTRY plate manifest must state PASS and contain capture records");
  }
  const selectors = {
    desktop: { id: "desktop-1440x900", width: 1440, height: 900 },
    mobile: { id: "mobile-390x844", width: 390, height: 844 },
    landscape: { id: "mobile-landscape-844x390", width: 844, height: 390 },
  };
  async function resolveCapture(selector) {
    const candidates = manifest.captures.filter((capture) =>
      capture?.id === selector.id
      && capture?.width === selector.width
      && capture?.height === selector.height
      && capture?.status === "PASS"
      && typeof capture?.png?.path === "string"
    );
    if (candidates.length !== 1) throw new Error(`ENTRY manifest must bind exactly one PASS ${selector.id} plate`);
    const declaredFilename = path.resolve(root, candidates[0].png.path);
    if (!isWithin(root, declaredFilename) || !(await pathExists(declaredFilename))) throw new Error(`${selector.id} ENTRY plate escapes or is missing from its external root`);
    const filename = await realpath(declaredFilename);
    if (!isWithin(root, filename)) throw new Error(`${selector.id} ENTRY plate resolves outside its external evidence root`);
    const data = await readFile(filename);
    if (data.length !== candidates[0].png.bytes || sha256(data) !== candidates[0].png.sha256) {
      throw new Error(`${selector.id} ENTRY plate does not match its manifest byte/hash authority`);
    }
    const metadata = await sharp(data).metadata();
    if (metadata.width !== selector.width || metadata.height !== selector.height) {
      throw new Error(`${selector.id} ENTRY plate dimensions do not match its manifest selector`);
    }
    return filename;
  }
  const result = {};
  for (const family of FAMILIES) {
    result[family] = await resolveCapture(selectors[family]);
  }
  if (new Set(Object.values(result).map(normalizedPath)).size !== FAMILIES.length) {
    throw new Error("desktop, mobile, and landscape ENTRY plates must be distinct files");
  }
  const responsivePlates = {};
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    responsivePlates[viewport.id] = await resolveCapture({
      id: viewport.plateId,
      width: viewport.width,
      height: viewport.height,
    });
  }
  if (new Set(Object.values(responsivePlates).map(normalizedPath)).size !== RESPONSIVE_VIEWPORTS.length) {
    throw new Error("every required responsive viewport must bind its own exact ENTRY plate");
  }
  const neighborPlates = {};
  for (const viewport of SHORT_LANDSCAPE_NEIGHBORS) {
    neighborPlates[viewport.id] = await resolveCapture({ id: viewport.plateId, width: viewport.width, height: viewport.height });
  }
  const manifestBytes = await readFile(manifestPath);
  return {
    plates: result,
    responsivePlates,
    neighborPlates,
    manifest,
    manifestPath,
    manifestRecord: {
      role: "semantic-entry-plates-manifest",
      basename: path.basename(manifestPath),
      bytes: manifestBytes.length,
      sha256: sha256(manifestBytes),
    },
  };
}

function deepValues(value, visitor, trail = []) {
  visitor(value, trail);
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) deepValues(item, visitor, [...trail, String(index)]);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) deepValues(item, visitor, [...trail, key]);
  }
}

function deepString(value) {
  return JSON.stringify(value).toLowerCase();
}

function findDeepProperty(value, matcher) {
  let found = null;
  deepValues(value, (item, trail) => {
    if (found || !trail.length) return;
    const key = trail.at(-1);
    if (matcher(key, item, trail)) found = item;
  });
  return found;
}

function reportStatus(report, label) {
  const status = String(report.status ?? report.result?.status ?? "").toUpperCase();
  if (status !== "PASS") throw new Error(`${label} must state status PASS; received ${status || "missing"}`);
}

function openingCompositionMeasurements(report, derivativeAuthority, measurementScriptAuthority) {
  const derivativeSha256 = derivativeAuthority.sha256;
  if (report.schema !== "quantum-hub.phase-4-r0.opening-composition-geometry.v1") {
    throw new Error("opening composition report has an unsupported schema");
  }
  reportStatus(report, "opening composition report");
  if (
    report.classification !== CLASSIFICATION
    || report.authorization?.productionAuthorized !== false
    || report.authorization?.humanAccepted !== false
    || report.authorization?.phase5Authorized !== false
  ) {
    throw new Error("opening composition report has invalid R0/no-production/human-unaccepted/Phase-5 authorization labels");
  }
  if (String(report.source?.sha256 ?? "").toLowerCase() !== derivativeSha256.toLowerCase()) {
    throw new Error("opening composition report does not bind the exact PASS Phase 4-R0 derivative SHA-256");
  }
  if (numeric(report.source?.bytes) !== derivativeAuthority.bytes) {
    throw new Error("opening composition report derivative byte count does not match the PASS source-build authority");
  }
  if (
    report.script?.basename !== measurementScriptAuthority.basename
    || numeric(report.script?.bytes) !== measurementScriptAuthority.bytes
    || String(report.script?.sha256 ?? "").toLowerCase() !== measurementScriptAuthority.sha256
  ) {
    throw new Error("opening composition report does not bind the exact repository measurement script bytes/SHA-256");
  }
  if (
    !Array.isArray(report.runtime?.blenderVersionTuple)
    || numeric(report.runtime.blenderVersionTuple[0]) !== 5
    || numeric(report.runtime.blenderVersionTuple[1]) !== 2
    || !/^5\.2(?:\.|$)/.test(String(report.runtime?.blenderVersion ?? ""))
    || numeric(report.runtime?.frame) !== 1
  ) {
    throw new Error("opening composition report must prove Blender 5.2.x at F001");
  }
  if (
    report.measurementContract?.geometricProjectionOnly !== true
    || report.measurementContract?.occlusionSegmentationPerformed !== false
    || report.measurementContract?.pixelSegmentationPerformed !== false
    || report.measurementContract?.humanVisibilityOrAcceptanceInferred !== false
  ) {
    throw new Error("opening composition report must declare geometric projection only, without pixel/occlusion segmentation or acceptance inference");
  }
  if (JSON.stringify(report.familyOrder) !== JSON.stringify(FAMILIES)) {
    throw new Error("opening composition report familyOrder must be exactly desktop, mobile, landscape");
  }
  const contracts = {
    desktop: {
      camera: "Phase4R0_Camera_Desktop",
      rig: "Phase4R0_OrbitRig_Desktop",
      lensMm: 40,
      cableCollection: "DESKTOP_2_5_TURN_SPIRAL_CABLE",
      cableAuthorship: "desktop 2.5-turn accepted cable",
      authoredRenderResolution: [960, 600],
      viewport: [1440, 900],
      segmentCount: 185,
      entryHiddenSegmentCount: 5,
    },
    mobile: {
      camera: "Phase4R0_Camera_Mobile",
      rig: "Phase4R0_OrbitRig_Mobile",
      lensMm: 50,
      cableCollection: "MOBILE_2_25_TURN_SPIRAL_CABLE",
      cableAuthorship: "mobile 2.25-turn accepted cable",
      authoredRenderResolution: [390, 844],
      viewport: [390, 844],
      segmentCount: 185,
      entryHiddenSegmentCount: 5,
    },
    landscape: {
      camera: "Phase4R0_Camera_Landscape",
      rig: "Phase4R0_OrbitRig_Landscape",
      lensMm: 36,
      cableCollection: "MOBILE_2_25_TURN_SPIRAL_CABLE",
      cableAuthorship: "mobile 2.25-turn accepted cable, as selected by the landscape renderer",
      authoredRenderResolution: [844, 390],
      viewport: [844, 390],
      segmentCount: 185,
      entryHiddenSegmentCount: 5,
    },
  };
  const SPIRAL_SOURCE = "accepted two-point recessed-conductor centreline curves with progress metadata";
  const SPIRAL_METHOD = "world-length-weighted exact homogeneous frustum clipping of each straight accepted conductor segment; no render pixels, depth buffer, or occlusion test";
  const SPIRAL_DENOMINATOR = "all accepted recessed-conductor centreline segments except the explicitly entry_hidden terminal segments";
  const CRT_SOURCE = "all evaluated mesh-convertible objects in the accepted REFINED_CRT_ASSEMBLY collection";
  const CRT_METHOD = "project all evaluated CRT geometry vertices through the real F001 camera, form a 2D convex hull, clip that hull to the viewport, then measure its vertical span and normalized area";
  const CRT_AREA_DEFINITION = "viewport-clipped convex-hull area divided by normalized viewport area";
  const TOLERANCE_PERCENT = 1e-4;
  const LENGTH_TOLERANCE_M = 5e-8;
  const percentage = (value, label) => {
    const measured = numeric(value);
    if (!Number.isFinite(measured) || measured < 0 || measured > 100) throw new Error(`${label} must be a finite percentage in [0,100]`);
    return measured;
  };
  const finite = (value, label, minimum = 0) => {
    const measured = numeric(value);
    if (!Number.isFinite(measured) || measured < minimum) throw new Error(`${label} must be finite and >= ${minimum}`);
    return measured;
  };
  const integer = (value, label, minimum = 0) => {
    const measured = finite(value, label, minimum);
    if (!Number.isInteger(measured)) throw new Error(`${label} must be an integer`);
    return measured;
  };
  const recomputedPercentage = (reported, computed, label) => {
    const measured = percentage(reported, label);
    if (Math.abs(measured - computed) > TOLERANCE_PERCENT) {
      throw new Error(`${label}=${measured} does not recompute from its supplied geometry values (${computed})`);
    }
    return measured;
  };
  const polygonArea = (polygon) => Math.abs(polygon.reduce((sum, left, index) => {
    const right = polygon[(index + 1) % polygon.length];
    return sum + left[0] * right[1] - right[0] * left[1];
  }, 0)) / 2;
  const families = {};
  for (const family of FAMILIES) {
    const value = report.families?.[family];
    const contract = contracts[family];
    if (!value || value.status !== "PASS" || value.family !== family || value.frame !== 1) {
      throw new Error(`opening composition report lacks a PASS F001 ${family} measurement`);
    }
    if (
      value.camera?.object !== contract.camera
      || value.camera?.type !== "PERSP"
      || value.camera?.rig !== contract.rig
      || value.camera?.constraint !== "Phase4R0_AuditableLookAtCRT"
      || value.camera?.target !== "Phase4R0_CRT_OrbitTarget"
      || numeric(value.camera?.lensMm) !== contract.lensMm
      || value.spiral?.collection !== contract.cableCollection
      || value.cableAuthorship !== contract.cableAuthorship
      || value.crt?.collection !== "REFINED_CRT_ASSEMBLY"
      || JSON.stringify(value.authoredRenderResolution) !== JSON.stringify(contract.authoredRenderResolution)
      || JSON.stringify(value.measurementViewport) !== JSON.stringify(contract.viewport)
    ) {
      throw new Error(`opening composition report ${family} camera/cable/CRT/viewport provenance is invalid`);
    }
    if (value.spiral?.occlusionSegmentationPerformed !== false || value.crt?.occlusionSegmentationPerformed !== false) {
      throw new Error(`opening composition report ${family} must remain geometric-only`);
    }
    if (
      value.spiral?.sourceGeometry !== SPIRAL_SOURCE
      || value.spiral?.method !== SPIRAL_METHOD
      || value.spiral?.spiralVisiblePercentDenominator !== SPIRAL_DENOMINATOR
      || value.crt?.sourceGeometry !== CRT_SOURCE
      || value.crt?.method !== CRT_METHOD
      || value.crt?.areaDefinition !== CRT_AREA_DEFINITION
    ) {
      throw new Error(`opening composition report ${family} changes a required geometry measurement definition`);
    }
    const segmentCount = integer(value.spiral.segmentCount, `${family} segmentCount`, 1);
    const entryHiddenSegmentCount = integer(
      value.spiral.intentionallyEntryHiddenSegmentCount,
      `${family} intentionallyEntryHiddenSegmentCount`,
    );
    const segmentsIntersectingFrustum = integer(
      value.spiral.segmentsIntersectingFrustum,
      `${family} segmentsIntersectingFrustum`,
    );
    if (
      segmentCount !== contract.segmentCount
      || entryHiddenSegmentCount !== contract.entryHiddenSegmentCount
      || segmentsIntersectingFrustum > segmentCount
    ) {
      throw new Error(`opening composition report ${family} has invalid accepted conductor segment counts`);
    }
    const allConductorLengthM = finite(value.spiral.allConductorLengthM, `${family} allConductorLengthM`, Number.EPSILON);
    const allConductorFrustumVisibleLengthM = finite(
      value.spiral.allConductorFrustumVisibleLengthM,
      `${family} allConductorFrustumVisibleLengthM`,
    );
    const reviewableSpiralLengthM = finite(value.spiral.reviewableSpiralLengthM, `${family} reviewableSpiralLengthM`, Number.EPSILON);
    const reviewableSpiralFrustumVisibleLengthM = finite(
      value.spiral.reviewableSpiralFrustumVisibleLengthM,
      `${family} reviewableSpiralFrustumVisibleLengthM`,
    );
    if (
      allConductorFrustumVisibleLengthM > allConductorLengthM + LENGTH_TOLERANCE_M
      || reviewableSpiralLengthM >= allConductorLengthM
      || reviewableSpiralFrustumVisibleLengthM > reviewableSpiralLengthM + LENGTH_TOLERANCE_M
    ) {
      throw new Error(`opening composition report ${family} has inconsistent cable length numerators/denominators`);
    }
    const hiddenConductorLengthM = allConductorLengthM - reviewableSpiralLengthM;
    const hiddenConductorFrustumVisibleLengthM = allConductorFrustumVisibleLengthM - reviewableSpiralFrustumVisibleLengthM;
    if (
      reviewableSpiralFrustumVisibleLengthM > allConductorFrustumVisibleLengthM + LENGTH_TOLERANCE_M
      || hiddenConductorFrustumVisibleLengthM < -LENGTH_TOLERANCE_M
      || hiddenConductorFrustumVisibleLengthM > hiddenConductorLengthM + LENGTH_TOLERANCE_M
    ) {
      throw new Error(`opening composition report ${family} violates cable subset length invariants`);
    }
    const spiralVisiblePercent = recomputedPercentage(
      value.spiral.spiralVisiblePercent,
      100 * reviewableSpiralFrustumVisibleLengthM / reviewableSpiralLengthM,
      `${family} spiralVisiblePercent`,
    );
    const allConductorFrustumVisiblePercent = recomputedPercentage(
      value.spiral.allConductorFrustumVisiblePercent,
      100 * allConductorFrustumVisibleLengthM / allConductorLengthM,
      `${family} allConductorFrustumVisiblePercent`,
    );
    const clippedHull = value.crt?.viewportClippedConvexHullNormalized;
    if (!Array.isArray(clippedHull) || clippedHull.length < 3) {
      throw new Error(`opening composition report ${family} lacks its viewport-clipped CRT hull`);
    }
    const hull = clippedHull.map((point, index) => {
      if (!Array.isArray(point) || point.length !== 2) throw new Error(`${family} CRT hull point ${index} is invalid`);
      const normalized = point.map((component) => finite(component, `${family} CRT hull point ${index}`, -1e-8));
      if (normalized.some((component) => component > 1 + 1e-8)) throw new Error(`${family} CRT hull point ${index} leaves the normalized viewport`);
      return normalized;
    });
    const recomputedBounds = {
      left: Math.min(...hull.map((point) => point[0])),
      right: Math.max(...hull.map((point) => point[0])),
      bottom: Math.min(...hull.map((point) => point[1])),
      top: Math.max(...hull.map((point) => point[1])),
    };
    const reportedBounds = value.crt?.viewportClippedBoundsNormalized;
    for (const key of ["left", "right", "bottom", "top"]) {
      if (Math.abs(finite(reportedBounds?.[key], `${family} CRT ${key}`, -1e-8) - recomputedBounds[key]) > 1e-8) {
        throw new Error(`opening composition report ${family} CRT ${key} bound does not recompute from its hull`);
      }
    }
    const crtVerticalViewportOccupancyPercent = recomputedPercentage(
      value.crt.crtVerticalViewportOccupancyPercent,
      100 * (recomputedBounds.top - recomputedBounds.bottom),
      `${family} crtVerticalViewportOccupancyPercent`,
    );
    const crtViewportAreaPercent = recomputedPercentage(
      value.crt.crtViewportAreaPercent,
      100 * polygonArea(hull),
      `${family} crtViewportAreaPercent`,
    );
    const geometricObjectCount = integer(value.crt.geometricObjectCount, `${family} geometricObjectCount`, 1);
    const evaluatedVertexCount = integer(value.crt.evaluatedVertexCount, `${family} evaluatedVertexCount`, 3);
    const projectedVertexCount = integer(value.crt.projectedVertexCount, `${family} projectedVertexCount`, 3);
    const projectedConvexHullVertexCount = integer(
      value.crt.projectedConvexHullVertexCount,
      `${family} projectedConvexHullVertexCount`,
      3,
    );
    const viewportClippedHullVertexCount = integer(
      value.crt.viewportClippedHullVertexCount,
      `${family} viewportClippedHullVertexCount`,
      3,
    );
    if (
      projectedVertexCount > evaluatedVertexCount
      || projectedConvexHullVertexCount > projectedVertexCount
      || viewportClippedHullVertexCount !== hull.length
      || projectedConvexHullVertexCount < 3
    ) {
      throw new Error(`opening composition report ${family} has inconsistent CRT geometry counts`);
    }
    families[family] = {
      frame: 1,
      camera: value.camera.object,
      lensMm: numeric(value.camera.lensMm),
      rig: value.camera.rig,
      constraint: value.camera.constraint,
      target: value.camera.target,
      authoredRenderResolution: value.authoredRenderResolution,
      measurementViewport: value.measurementViewport,
      cableCollection: value.spiral.collection,
      cableAuthorship: value.cableAuthorship,
      cableSourceGeometry: SPIRAL_SOURCE,
      cableMeasurementMethod: SPIRAL_METHOD,
      segmentCount,
      segmentsIntersectingFrustum,
      intentionallyEntryHiddenSegmentCount: entryHiddenSegmentCount,
      allConductorLengthM,
      allConductorFrustumVisibleLengthM,
      allConductorFrustumVisiblePercent,
      reviewableSpiralLengthM,
      reviewableSpiralFrustumVisibleLengthM,
      spiralVisiblePercent,
      spiralVisiblePercentDenominator: SPIRAL_DENOMINATOR,
      crtCollection: value.crt.collection,
      crtSourceGeometry: CRT_SOURCE,
      crtMeasurementMethod: CRT_METHOD,
      crtVerticalViewportOccupancyPercent,
      crtViewportAreaPercent,
      crtViewportAreaDefinition: CRT_AREA_DEFINITION,
      crtViewportClippedBoundsNormalized: reportedBounds,
      crtViewportClippedConvexHullNormalized: hull,
      geometricObjectCount,
      evaluatedVertexCount,
      projectedVertexCount,
      projectedConvexHullVertexCount,
      viewportClippedHullVertexCount,
    };
  }
  return {
    schema: report.schema,
    derivativeSha256,
    derivativeBytes: derivativeAuthority.bytes,
    measurementScript: measurementScriptAuthority,
    blenderVersion: report.runtime.blenderVersion,
    method: "frozen Blender F001 geometry projected through each real camera",
    spiralDenominator: SPIRAL_DENOMINATOR,
    limitation: "geometric frustum/convex-hull projection; five accepted entry_hidden terminal segments excluded from spiral denominator; not render-pixel or occlusion segmentation",
    humanAccepted: false,
    families,
  };
}

function assertTimelineAuthority(buildReport) {
  const actual = buildReport.timeline?.events;
  if (!actual || typeof actual !== "object") throw new Error("source build report must expose the exact Phase 4-R0 event timeline");
  const bindings = {
    dormancy_start: "dormancyStart",
    dormancy_hold_end: "dormancyHoldEnd",
    conduction_start: "conductionStart",
    conduction_25: "conduction25",
    conduction_50: "conduction50",
    conduction_75: "conduction75",
    orbit_complete_current_arrival: "orbitCompleteCurrentArrival",
    indicator_response: "indicatorResponse",
    horizontal_line_start: "horizontalLineStart",
    horizontal_line_peak: "horizontalLinePeak",
    horizontal_line_end: "horizontalLineEnd",
    raster_expansion_start: "rasterExpansionStart",
    raster_expansion_end: "rasterExpansionEnd",
    black_stabilized: "blackStabilized",
    q_first_readable: "qFirstReadable",
    q_stable: "qStable",
    q_hold_end: "qHoldEnd",
    frontal_push_start: "frontalPushStart",
    late_approach: "lateApproach",
    glass_fill: "glassFill",
    threshold_crossing: "thresholdCrossing",
    semantic_geometry_start: "semanticGeometryStart",
    h1_first_readable: "h1FirstReadable",
    semantic_half_reveal: "semanticHalfReveal",
    settled_entry: "settledEntry",
  };
  for (const [sourceKey, proposalKey] of Object.entries(bindings)) {
    if (actual[sourceKey] !== DEFAULT_TIMELINE.events[proposalKey]) {
      throw new Error(`source timeline ${sourceKey}=${actual[sourceKey]} does not match the auditable R0 proposal F${DEFAULT_TIMELINE.events[proposalKey]}`);
    }
  }
}

function reportContainsHash(report, hash) {
  let found = false;
  deepValues(report, (value) => {
    if (typeof value === "string" && value.toLowerCase() === hash.toLowerCase()) found = true;
  });
  return found;
}

function assertEeveeRealCamera(buildReport, validationReport, sequences) {
  const combined = `${deepString(buildReport)}\n${deepString(validationReport)}`;
  if (!/blender/.test(combined) || !/camera_motion|camera motion|camera_path|camera path/.test(combined)) {
    throw new Error("source build/validation reports must bind the Blender camera-rig structure");
  }
  if (!combined.includes("500")) throw new Error("source reports must bind the physical render range through frame 500");
  const derivativeHash = String(buildReport.phase4r0_derivative?.sha256 ?? validationReport.phase4r0_derivative?.sha256 ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(derivativeHash)) throw new Error("source reports must bind the exact Phase 4-R0 Blender derivative SHA-256");
  for (const family of FAMILIES) {
    const sequence = sequences[family];
    const reportHash = String(sequence.renderReport.source?.sha256 ?? "").toLowerCase();
    if (reportHash !== derivativeHash) {
      throw new Error(`${family} render report source SHA-256 does not match the PASS Phase 4-R0 derivative`);
    }
    if (String(sequence.renderReport.engine ?? "").toUpperCase().startsWith("BLENDER_EEVEE") !== true) {
      throw new Error(`${family} physical roots are not proven Eevee renders`);
    }
  }
}

function vector3(value) {
  if (Array.isArray(value) && value.length >= 3) {
    const result = value.slice(0, 3).map(Number);
    return result.every(Number.isFinite) ? result : null;
  }
  if (value && typeof value === "object" && [value.x, value.y, value.z].every(Number.isFinite)) return [Number(value.x), Number(value.y), Number(value.z)];
  return null;
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function cameraSampleCandidate(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const frame = numeric(item.frame ?? item.frameNumber ?? item.f);
  const location = vector3(item.location ?? item.cameraLocation ?? item.camera_world ?? item.position ?? item.camera?.location);
  let target = vector3(item.target ?? item.aimTarget ?? item.lookAt ?? item.camera?.target);
  let pivot = vector3(item.pivot ?? item.orbitPivot ?? item.camera?.pivot);
  const lens = numeric(item.lensMm ?? item.lens ?? item.focalLengthMm ?? item.focal_length_mm ?? item.focalLength ?? item.camera?.lensMm);
  if (!Number.isFinite(frame) || !location || !Number.isFinite(lens)) return null;
  const radiusM = numeric(item.radiusM ?? item.radius ?? item.horizontal_radius ?? item.orbitRadiusM);
  const angleDegrees = numeric(item.angleDegrees ?? item.angle_degrees ?? item.orbitAngleDegrees ?? item.azimuthDegrees ?? item.angle);
  const elevation = numeric(item.elevation);
  if ((!pivot || !target) && Number.isFinite(radiusM) && Number.isFinite(angleDegrees) && Number.isFinite(elevation)) {
    const radians = (angleDegrees * Math.PI) / 180;
    const derived = [
      location[0] - radiusM * Math.cos(radians),
      location[1] - radiusM * Math.sin(radians),
      location[2] - elevation,
    ];
    pivot ??= derived;
    target ??= derived;
  }
  return {
    frame: Math.round(frame),
    location,
    target,
    pivot,
    lensMm: lens,
    radiusM,
    angleDegrees,
    distanceM: numeric(item.distanceM ?? item.distance ?? item.camera_to_target_distance ?? item.cameraDistanceM),
  };
}

function cameraSamplesFromRenderSequence(sequence) {
  const samples = [...sequence.renderFrames.values()]
    .map(cameraSampleCandidate)
    .filter(Boolean)
    .sort((left, right) => left.frame - right.frame);
  if (samples.length !== 500 || samples[0].frame !== 1 || samples.at(-1).frame !== 500) {
    throw new Error(`${sequence.family} fresh render report must expose camera telemetry for every F001–500 frame`);
  }
  const fallbackPivot = samples.find((sample) => sample.pivot)?.pivot;
  if (!fallbackPivot) throw new Error(`${sequence.family} render telemetry cannot resolve its camera orbit target`);
  let previousAngle = null;
  for (const sample of samples) {
    sample.pivot ??= fallbackPivot;
    sample.target ??= fallbackPivot;
    sample.radiusM ??= distance(sample.location, sample.pivot);
    sample.distanceM ??= distance(sample.location, sample.target);
    let angle = sample.angleDegrees ?? (Math.atan2(sample.location[1] - sample.pivot[1], sample.location[0] - sample.pivot[0]) * 180) / Math.PI;
    if (previousAngle !== null) {
      while (angle - previousAngle > 180) angle -= 360;
      while (angle - previousAngle < -180) angle += 360;
    }
    sample.angleDegrees = angle;
    previousAngle = angle;
  }
  const originAngle = samples[0].angleDegrees;
  for (const sample of samples) sample.relativeAngleDegrees = sample.angleDegrees - originAngle;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].relativeAngleDegrees + 1e-4 < samples[index - 1].relativeAngleDegrees) {
      throw new Error(`${sequence.family} render telemetry reverses orbit angle between F${samples[index - 1].frame} and F${samples[index].frame}`);
    }
    if (samples[index].radiusM - 1e-4 > samples[index - 1].radiusM) {
      throw new Error(`${sequence.family} render telemetry expands the contracting orbit radius between F${samples[index - 1].frame} and F${samples[index].frame}`);
    }
    if (distance(samples[index].pivot, fallbackPivot) > 1e-4) {
      throw new Error(`${sequence.family} render telemetry changes its orbit target at F${samples[index].frame}`);
    }
  }
  const completion = samples[DEFAULT_TIMELINE.events.orbitCompleteCurrentArrival - 1];
  if (Math.abs(completion.relativeAngleDegrees - 360) > 0.05 || Math.abs(samples.at(-1).relativeAngleDegrees - 360) > 0.05) {
    throw new Error(`${sequence.family} render telemetry does not prove the exact 360° orbit by F285 and hold it through F500`);
  }
  return {
    sourcePath: `${path.basename(sequence.renderReportPath)}.frames`,
    samples,
  };
}

function extractLogoProvenance(reports) {
  for (const report of reports) {
    const value = findDeepProperty(report, (key, item) => /logo.*provenance|provenance.*logo/i.test(key) && item && typeof item === "object");
    if (value) return { sourcePath: "explicit-logo-provenance", declaration: value };
  }
  for (const report of reports) {
    if (report.quantum_q && typeof report.quantum_q === "object") return { sourcePath: "quantum_q", declaration: report.quantum_q };
    if (report.quantum_q_authorities && typeof report.quantum_q_authorities === "object") {
      return { sourcePath: "quantum_q_authorities", declaration: report.quantum_q_authorities };
    }
  }
  throw new Error("source reports must contain explicit Quantum Q / logo provenance; the packager will not invent or infer a logo source");
}

async function sequenceAuthority(sequence) {
  const digest = createHash("sha256");
  let bytes = 0;
  for (let frame = 1; frame <= 500; frame += 1) {
    const filename = sequence.frames.get(frame);
    const data = await readFile(filename);
    const frameHash = sha256(data);
    const reported = sequence.renderFrames.get(frame);
    if (data.length !== reported.bytes || frameHash !== String(reported.sha256).toLowerCase()) {
      throw new Error(`${sequence.family} F${String(frame).padStart(3, "0")} fails its fresh Blender render-report byte/hash binding`);
    }
    bytes += data.length;
    digest.update(`${String(frame).padStart(3, "0")}\0${data.length}\0${frameHash}\n`);
  }
  return {
    family: sequence.family,
    frameStart: 1,
    frameEnd: 500,
    frameCount: 500,
    dimensions: [sequence.width, sequence.height],
    totalBytes: bytes,
    sequenceSha256: digest.digest("hex"),
    rootBasename: path.basename(sequence.root),
    renderReport: sequence.renderReportRecord,
  };
}

async function inputFileRecord(filename, role) {
  const data = await readFile(filename);
  return { role, basename: path.basename(filename), bytes: data.length, sha256: sha256(data) };
}

async function createClassificationOverlay(width, height, destination) {
  const fontSize = Math.max(11, Math.min(24, Math.round(Math.min(width, height) * 0.02)));
  const barHeight = Math.max(50, Math.round(fontSize * 3.25));
  const inset = Math.max(12, Math.round(width * 0.014));
  const buffer = await sharp(svg(width, height, `
    <rect x="0" y="0" width="${width}" height="${barHeight}" fill="#030506" fill-opacity="0.82"/>
    <rect x="0" y="${barHeight - 3}" width="${width}" height="3" fill="#d82b72" fill-opacity="0.9"/>
    <text x="${inset}" y="${Math.round(barHeight * 0.42)}" fill="#f4f7f6" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="700">PHASE 4-R0 PREVISUALIZATION · NOT PRODUCTION</text>
    <text x="${inset}" y="${Math.round(barHeight * 0.76)}" fill="#f06ba0" font-family="Arial,Helvetica,sans-serif" font-size="${Math.max(10, fontSize - 2)}" font-weight="700">HUMAN UNACCEPTED · PHASE 5 UNAUTHORIZED</text>
  `)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  await atomicWrite(destination, buffer);
  return { width, height, barHeight, bytes: buffer.length, sha256: sha256(buffer) };
}

function smoothstep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function semanticResolveAlpha(frame) {
  return 0.04 + 0.96 * smoothstep((frame - SEMANTIC_START) / (FINAL_FRAME - SEMANTIC_START));
}

async function makeDeepBlackFrame(width, height, destination) {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await atomicWrite(destination, buffer);
}

async function alphaScaleRaw(buffer, alpha) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += 4) data[index] = Math.round(data[index] * alpha);
  return { data, info };
}

async function makeSemanticResolveFrame(plate, width, height, frame, destination) {
  const curveProgress = smoothstep((frame - SEMANTIC_START) / (FINAL_FRAME - SEMANTIC_START));
  const alpha = semanticResolveAlpha(frame);
  const contrast = 0.88 + 0.12 * curveProgress;
  const softnessSigma = 1.25 * (1 - curveProgress);
  let pipeline = sharp(plate)
    .resize(width, height, { fit: "cover", position: "centre" })
    .linear(contrast, 0)
    .ensureAlpha();
  if (softnessSigma >= 0.3) pipeline = pipeline.blur(softnessSigma);
  const processed = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const raw = await alphaScaleRaw(processed, alpha);
  const buffer = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{
      input: raw.data,
      raw: { width: raw.info.width, height: raw.info.height, channels: raw.info.channels },
      blend: "over",
    }])
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await atomicWrite(destination, buffer);
  return {
    frame,
    curveProgress: round(curveProgress, 6),
    alpha: round(alpha, 6),
    contrast: round(contrast, 6),
    softnessSigma: round(softnessSigma, 6),
  };
}

async function buildFamilySequence(sequence, entryPlate, workRoot) {
  const familyRoot = path.join(workRoot, sequence.family);
  await mkdir(familyRoot, { recursive: true });
  const blackFrame = path.join(familyRoot, "deep-black.png");
  await makeDeepBlackFrame(sequence.width, sequence.height, blackFrame);
  const synthetic = new Map();
  for (let frame = DEEP_BLACK_START; frame <= DEEP_BLACK_END; frame += 1) synthetic.set(frame, blackFrame);
  const resolve = [];
  for (let frame = SEMANTIC_START; frame <= FINAL_FRAME; frame += 1) {
    const destination = path.join(familyRoot, `semantic-${String(frame).padStart(3, "0")}.png`);
    resolve.push(await makeSemanticResolveFrame(entryPlate, sequence.width, sequence.height, frame, destination));
    synthetic.set(frame, destination);
  }
  const files = [];
  for (let frame = 1; frame <= FINAL_FRAME; frame += 1) {
    files.push(frame <= PHYSICAL_FRAME_END ? sequence.frames.get(frame) : synthetic.get(frame));
  }
  const overlay = path.join(familyRoot, "classification-overlay.png");
  const overlayRecord = await createClassificationOverlay(sequence.width, sequence.height, overlay);
  return { ...sequence, files, synthetic, resolve, blackFrame, overlay, overlayRecord, entryPlate };
}

async function imagePixelOccupancy(filename) {
  const { data, info } = await sharp(filename).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  let occupied = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const luminance = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
      if (luminance <= 8) continue;
      occupied += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const total = info.width * info.height;
  return {
    methodology: "pixels with Rec.709 luma > 8/255; descriptive frame-content occupancy, not object segmentation",
    occupiedPixels: occupied,
    occupiedPercent: round((occupied / total) * 100, 4),
    boundingBox: occupied
      ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : null,
    dimensions: [info.width, info.height],
  };
}

async function panelBuffer(input, width, height, fit = "contain") {
  return sharp(input)
    .resize(width, height, { fit, position: "centre", background: "#020405" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function createSheet(outputRoot, {
  filename,
  title,
  subtitle,
  panels,
  columns = 2,
  cellWidth = 620,
  previewHeight = 430,
}) {
  if (![1, 2, 3].includes(columns)) throw new Error("sheet columns must be 1, 2, or 3");
  const padding = 24;
  const gap = 18;
  const headerHeight = 132;
  const titleLines = panels.map((panel) => wrapText(panel.title, columns === 1 ? 86 : columns === 2 ? 54 : 36));
  const detailLines = panels.map((panel) => (panel.lines ?? []).flatMap((line) => wrapText(line, columns === 1 ? 112 : columns === 2 ? 72 : 46)));
  const labelHeight = Math.max(82, ...panels.map((_, index) => 24 + titleLines[index].length * 21 + detailLines[index].length * 17 + 15));
  const cellHeight = previewHeight + labelHeight;
  const rows = Math.ceil(panels.length / columns);
  const width = padding * 2 + columns * cellWidth + (columns - 1) * gap;
  const height = headerHeight + padding + rows * cellHeight + (rows - 1) * gap + padding;
  const composites = [{
    input: svg(width, headerHeight, `
      <rect width="100%" height="100%" fill="#070a0b"/>
      <rect x="24" y="20" width="18" height="4" fill="#d82b72"/>
      <text x="54" y="36" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700">${escapeXml(title)}</text>
      <text x="24" y="69" fill="#a4b0af" font-family="Arial,Helvetica,sans-serif" font-size="13">${escapeXml(subtitle)}</text>
      <text x="24" y="99" fill="#f06ba0" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="700">${escapeXml(CLASSIFICATION)}</text>
    `),
    left: 0,
    top: 0,
  }];
  for (const [index, panel] of panels.entries()) {
    const image = await panelBuffer(panel.input, cellWidth, previewHeight, panel.fit ?? "contain");
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = padding + column * (cellWidth + gap);
    const top = headerHeight + padding + row * (cellHeight + gap);
    const text = [];
    let y = 27;
    for (const line of titleLines[index]) {
      text.push(`<text x="16" y="${y}" fill="#f4f7f6" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700">${escapeXml(line)}</text>`);
      y += 21;
    }
    for (const line of detailLines[index]) {
      text.push(`<text x="16" y="${y}" fill="#a8b3b2" font-family="Arial,Helvetica,sans-serif" font-size="12">${escapeXml(line)}</text>`);
      y += 17;
    }
    composites.push({ input: image, left, top });
    composites.push({
      input: svg(cellWidth, labelHeight, `<rect width="100%" height="100%" fill="#101516"/><rect width="5" height="100%" fill="#d82b72"/>${text.join("")}`),
      left,
      top: top + previewHeight,
    });
    composites.push({ input: svg(cellWidth, cellHeight, `<rect x="0.5" y="0.5" width="${cellWidth - 1}" height="${cellHeight - 1}" fill="none" stroke="#354241"/>`), left, top });
  }
  const buffer = await sharp({ create: { width, height, channels: 4, background: "#030506" } })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const destination = path.join(outputRoot, "sheets", filename);
  await atomicWrite(destination, buffer);
  return {
    id: path.basename(filename, ".png"),
    path: `sheets/${filename}`,
    width,
    height,
    bytes: buffer.length,
    sha256: sha256(buffer),
    panelCount: panels.length,
    columns,
  };
}

async function renderViewportFrame(input, width, height) {
  return sharp(input)
    .resize(width, height, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function authorityVisual(openingAuthority, ffmpegPath, workRoot) {
  const authorityStat = await stat(openingAuthority);
  if (authorityStat.isDirectory()) {
    const files = await listFiles(openingAuthority);
    const candidates = files
      .map((relativePath) => ({ relativePath, frame: frameNumberFromFilename(relativePath) }))
      .filter((record) => record.frame === 1);
    if (candidates.length !== 1) throw new Error(`opening authority directory must contain exactly one resolvable F001 image; found ${candidates.length}`);
    return path.join(openingAuthority, ...candidates[0].relativePath.split("/"));
  }
  const extension = path.extname(openingAuthority).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return openingAuthority;
  if (!VIDEO_EXTENSIONS.has(extension)) {
    throw new Error("--opening-authority must be an image, video, or frame directory for visual comparison");
  }
  const destination = path.join(workRoot, "opening-authority-f001.png");
  await execFileAsync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", openingAuthority,
    "-vf", "select=eq(n\\,0)",
    "-frames:v", "1",
    destination,
  ], { windowsHide: true, maxBuffer: 4_000_000 });
  return destination;
}

function chartScale(values, minimumPixels, maximumPixels, paddingRatio = 0.08) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(1e-9, maximum - minimum);
  const low = minimum - span * paddingRatio;
  const high = maximum + span * paddingRatio;
  return {
    minimum,
    maximum,
    project: (value) => minimumPixels + ((value - low) / (high - low)) * (maximumPixels - minimumPixels),
  };
}

function nearestSample(samples, frame) {
  return samples.reduce((best, sample) => Math.abs(sample.frame - frame) < Math.abs(best.frame - frame) ? sample : best, samples[0]);
}

function diagramHeader(width, title, subtitle) {
  return `
    <rect width="100%" height="100%" fill="#070a0b"/>
    <rect x="32" y="24" width="18" height="4" fill="#d82b72"/>
    <text x="62" y="42" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="700">${escapeXml(title)}</text>
    <text x="32" y="72" fill="#a8b3b2" font-family="Arial,Helvetica,sans-serif" font-size="13">${escapeXml(subtitle)}</text>
    <text x="32" y="99" fill="#f06ba0" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="700">${escapeXml(CLASSIFICATION)}</text>
    <line x1="32" y1="114" x2="${width - 32}" y2="114" stroke="#33403f"/>
  `;
}

async function createPathDiagram(outputRoot, family, cameraPath, projection) {
  const width = 1200;
  const height = 900;
  const samples = cameraPath.samples;
  const plot = { left: 90, top: 150, right: width - 70, bottom: height - 90 };
  const xValues = projection === "top"
    ? samples.map((sample) => sample.location[0])
    : samples.map((sample) => sample.location[0]);
  const yValues = projection === "top"
    ? samples.map((sample) => sample.location[1])
    : samples.map((sample) => sample.location[2]);
  const xScale = chartScale(xValues, plot.left, plot.right);
  const yScale = chartScale(yValues, plot.bottom, plot.top);
  const points = samples.map((sample) => `${round(xScale.project(sample.location[0]), 2)},${round(yScale.project(projection === "top" ? sample.location[1] : sample.location[2]), 2)}`).join(" ");
  const milestoneFrames = Object.values(DEFAULT_TIMELINE.orbitMilestones).filter((frame) => frame <= 500);
  const labels = milestoneFrames.map((frame) => {
    const sample = nearestSample(samples, frame);
    const x = xScale.project(sample.location[0]);
    const y = yScale.project(projection === "top" ? sample.location[1] : sample.location[2]);
    return `<circle cx="${x}" cy="${y}" r="7" fill="#42dbe5"/><text x="${x + 11}" y="${y - 9}" fill="#d8e3e2" font-family="Arial,sans-serif" font-size="12">F${String(frame).padStart(3, "0")}</text>`;
  }).join("");
  const axisYLabel = projection === "top" ? "WORLD Y (m)" : "WORLD Z / HEIGHT (m)";
  const content = `${diagramHeader(width, `${family.toUpperCase()} · ${projection.toUpperCase()} CAMERA PATH`, projection === "top" ? "World X/Y projection from supplied real-camera samples" : "World X/Z side projection from supplied real-camera samples")}
    <rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}" fill="#0c1112" stroke="#33403f"/>
    <line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.bottom}" stroke="#627170"/>
    <line x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.bottom}" stroke="#627170"/>
    <polyline points="${points}" fill="none" stroke="#d82b72" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    ${labels}
    <text x="${(plot.left + plot.right) / 2}" y="${height - 38}" text-anchor="middle" fill="#a8b3b2" font-family="Arial,sans-serif" font-size="14">WORLD X (m)</text>
    <text x="28" y="${(plot.top + plot.bottom) / 2}" transform="rotate(-90 28 ${(plot.top + plot.bottom) / 2})" text-anchor="middle" fill="#a8b3b2" font-family="Arial,sans-serif" font-size="14">${axisYLabel}</text>
    <text x="${plot.left}" y="${plot.top - 17}" fill="#7f8d8c" font-family="Arial,sans-serif" font-size="12">SOURCE PATH: ${escapeXml(cameraPath.sourcePath)}</text>`;
  const buffer = await sharp(svg(width, height, content)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const filename = `phase-4r0-${family}-${projection}-camera-path.png`;
  await atomicWrite(path.join(outputRoot, "diagrams", filename), buffer);
  return { path: `diagrams/${filename}`, bytes: buffer.length, sha256: sha256(buffer), width, height, projection, family };
}

function graphPanel({ x, y, width, height, title, samples, accessor, unit, color }) {
  const values = samples.map(accessor);
  const frameScale = chartScale(samples.map((sample) => sample.frame), x + 56, x + width - 24, 0);
  const valueScale = chartScale(values, y + height - 45, y + 36);
  const points = samples.map((sample) => `${round(frameScale.project(sample.frame), 2)},${round(valueScale.project(accessor(sample)), 2)}`).join(" ");
  return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#0c1112" stroke="#33403f"/>
    <text x="${x + 18}" y="${y + 24}" fill="#f2f5f4" font-family="Arial,sans-serif" font-size="16" font-weight="700">${escapeXml(title)}</text>
    <text x="${x + width - 18}" y="${y + 24}" text-anchor="end" fill="#82908f" font-family="Arial,sans-serif" font-size="11">${round(Math.min(...values), 3)}–${round(Math.max(...values), 3)} ${escapeXml(unit)}</text>
    <line x1="${x + 56}" y1="${y + height - 45}" x2="${x + width - 24}" y2="${y + height - 45}" stroke="#596766"/>
    <line x1="${x + 56}" y1="${y + 36}" x2="${x + 56}" y2="${y + height - 45}" stroke="#596766"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="${x + width - 24}" y="${y + height - 17}" text-anchor="end" fill="#82908f" font-family="Arial,sans-serif" font-size="11">F500</text>
    <text x="${x + 56}" y="${y + height - 17}" fill="#82908f" font-family="Arial,sans-serif" font-size="11">F001</text>
  `;
}

async function createCameraGraphs(outputRoot, family, cameraPath) {
  const width = 1500;
  const height = 1050;
  const samples = cameraPath.samples;
  const panelWidth = 690;
  const panelHeight = 400;
  const content = `${diagramHeader(width, `${family.toUpperCase()} · CAMERA PATH GRAPHS`, "Radius, relative orbit angle, aim distance, and lens from supplied source samples")}
    ${graphPanel({ x: 44, y: 145, width: panelWidth, height: panelHeight, title: "ORBIT RADIUS", samples, accessor: (sample) => sample.radiusM, unit: "m", color: "#d82b72" })}
    ${graphPanel({ x: 766, y: 145, width: panelWidth, height: panelHeight, title: "RELATIVE ORBIT ANGLE", samples, accessor: (sample) => sample.relativeAngleDegrees, unit: "deg", color: "#42dbe5" })}
    ${graphPanel({ x: 44, y: 585, width: panelWidth, height: panelHeight, title: "CAMERA → AIM DISTANCE", samples, accessor: (sample) => sample.distanceM, unit: "m", color: "#f06ba0" })}
    ${graphPanel({ x: 766, y: 585, width: panelWidth, height: panelHeight, title: "FOCAL LENGTH", samples, accessor: (sample) => sample.lensMm, unit: "mm", color: "#b9c66b" })}`;
  const buffer = await sharp(svg(width, height, content)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const filename = `phase-4r0-${family}-radius-angle-distance-lens.png`;
  await atomicWrite(path.join(outputRoot, "diagrams", filename), buffer);
  return { path: `diagrams/${filename}`, bytes: buffer.length, sha256: sha256(buffer), width, height, family };
}

async function createTimelineDiagram(outputRoot, timeline) {
  const width = 1600;
  const height = 660;
  const left = 70;
  const right = width - 70;
  const scale = (frame) => left + ((frame - 1) / (FINAL_FRAME - 1)) * (right - left);
  const segments = [
    { label: "PHYSICAL · F001–500", start: 1, end: 500, color: "#273638" },
    { label: "DEEP BLACK · F501–513", start: 501, end: 513, color: "#000000" },
    { label: "SEMANTIC RESOLVE · F514–540", start: 514, end: 540, color: "#7f1f4c" },
  ];
  const segmentSvg = segments.map((segment) => {
    const x = scale(segment.start);
    const segmentWidth = Math.max(3, scale(segment.end) - x);
    return `<rect x="${x}" y="250" width="${segmentWidth}" height="90" fill="${segment.color}" stroke="#637170"/>`;
  }).join("");
  const segmentLabels = `
    <text x="${(scale(1) + scale(500)) / 2}" y="303" text-anchor="middle" fill="#f5f7f6" font-family="Arial,sans-serif" font-size="13" font-weight="700">PHYSICAL · F001–500</text>
    <line x1="${scale(501)}" y1="250" x2="${scale(501) - 16}" y2="224" stroke="#a8b3b2"/>
    <text x="${scale(501) - 21}" y="219" text-anchor="end" fill="#f5f7f6" font-family="Arial,sans-serif" font-size="12" font-weight="700">DEEP BLACK · F501–513</text>
    <line x1="${scale(527)}" y1="340" x2="${scale(527) - 16}" y2="368" stroke="#d37ba4"/>
    <text x="${scale(527) - 21}" y="386" text-anchor="end" fill="#f5f7f6" font-family="Arial,sans-serif" font-size="12" font-weight="700">SEMANTIC RESOLVE · F514–540</text>`;
  const milestones = Object.entries(timeline.orbitMilestones).map(([label, frame], index) => {
    const x = scale(frame);
    const y = index % 2 ? 390 : 185;
    return `<line x1="${x}" y1="220" x2="${x}" y2="370" stroke="#42dbe5"/><circle cx="${x}" cy="${y}" r="5" fill="#42dbe5"/><text x="${x}" y="${index % 2 ? y + 25 : y - 13}" text-anchor="middle" fill="#dbe6e5" font-family="Arial,sans-serif" font-size="12">${escapeXml(label)} · F${String(frame).padStart(3, "0")}</text>`;
  }).join("");
  const content = `${diagramHeader(width, "PHASE 4-R0 · TIMELINE PROPOSAL", "500 fresh physical frames → bounded deep-black beat → restrained actual-plate semantic resolve")}
    ${segmentSvg}${segmentLabels}${milestones}
    <text x="70" y="510" fill="#a8b3b2" font-family="Arial,sans-serif" font-size="14">30 fps · 540 frames · 18.000 seconds by frame count</text>
    <text x="70" y="545" fill="#a8b3b2" font-family="Arial,sans-serif" font-size="14">F501–513 plates are exact RGB black; encoded frames are gated nominal black. F514–540 alpha resolves 0.04→1.00.</text>
    <text x="70" y="580" fill="#f06ba0" font-family="Arial,sans-serif" font-size="14" font-weight="700">PROPOSAL ONLY. HUMAN TIMING, ORBIT, SIGNAL, LOGO, PORTAL, AND PHASE 5 AUTHORIZATION ARE NOT CLAIMED.</text>`;
  const buffer = await sharp(svg(width, height, content)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const filename = "phase-4r0-timeline-proposal.png";
  await atomicWrite(path.join(outputRoot, "diagrams", filename), buffer);
  return { path: `diagrams/${filename}`, bytes: buffer.length, sha256: sha256(buffer), width, height };
}

async function prepareImage2Sequence(workRoot, id, files) {
  const directory = path.join(workRoot, `${id}-image2`);
  await mkdir(directory);
  let hardLinks = 0;
  let fallbackCopies = 0;
  for (const [index, source] of files.entries()) {
    const destination = path.join(directory, `frame-${String(index + 1).padStart(6, "0")}.png`);
    try {
      await link(source, destination);
      hardLinks += 1;
    } catch (error) {
      if (!["EXDEV", "EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) throw error;
      await copyFile(source, destination);
      fallbackCopies += 1;
    }
  }
  return {
    pattern: path.join(directory, "frame-%06d.png"),
    frameCount: files.length,
    hardLinks,
    fallbackCopies,
    method: fallbackCopies ? "numbered image2 sequence; hard links with copy fallback" : "numbered image2 sequence; hard links",
  };
}

function rationalNumber(value) {
  const [numerator, denominator = "1"] = String(value).split("/");
  const result = Number(numerator) / Number(denominator);
  return Number.isFinite(result) ? result : NaN;
}

async function probeEncodedVideo(ffmpegPath, destination, expectedFrames, width, height) {
  const ffprobePath = path.join(path.dirname(ffmpegPath), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  await access(ffprobePath);
  const result = await execFileAsync(ffprobePath, [
    "-v", "error",
    "-count_frames",
    "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration:format=duration",
    "-of", "json",
    destination,
  ], { windowsHide: true, maxBuffer: 2_000_000 });
  const parsed = JSON.parse(result.stdout);
  const videoStreams = (parsed?.streams ?? []).filter((stream) => stream.codec_type === "video");
  const audioStreams = (parsed?.streams ?? []).filter((stream) => stream.codec_type === "audio");
  if (videoStreams.length !== 1) throw new Error(`ffprobe found ${videoStreams.length} video streams in ${path.basename(destination)}`);
  if (audioStreams.length !== 0) throw new Error(`ffprobe found audio in ${path.basename(destination)}`);
  const stream = videoStreams[0];
  const decodedFrames = Number(stream.nb_read_frames ?? stream.nb_frames);
  const nominalRate = rationalNumber(stream.r_frame_rate);
  const averageRate = rationalNumber(stream.avg_frame_rate);
  const durationSeconds = Number(stream.duration ?? parsed?.format?.duration);
  const expectedDurationSeconds = expectedFrames / FRAME_RATE;
  if (stream.codec_name !== "h264") throw new Error(`${path.basename(destination)} is not H.264`);
  if (stream.pix_fmt !== "yuv420p") throw new Error(`${path.basename(destination)} is not yuv420p`);
  if (Number(stream.width) !== width || Number(stream.height) !== height) {
    throw new Error(`${path.basename(destination)} dimensions do not match ${width}x${height}`);
  }
  if (decodedFrames !== expectedFrames) {
    throw new Error(`${path.basename(destination)} decodes to ${decodedFrames} frames; expected ${expectedFrames}`);
  }
  if (Math.abs(nominalRate - FRAME_RATE) > 1e-9 || Math.abs(averageRate - FRAME_RATE) > 1e-9) {
    throw new Error(`${path.basename(destination)} is not exact ${FRAME_RATE} fps`);
  }
  if (!Number.isFinite(durationSeconds) || Math.abs(durationSeconds - expectedDurationSeconds) > 0.001) {
    throw new Error(`${path.basename(destination)} duration ${durationSeconds} does not match ${expectedDurationSeconds}`);
  }
  return {
    codec: stream.codec_name,
    pixelFormat: stream.pix_fmt,
    dimensions: [Number(stream.width), Number(stream.height)],
    decodedFrames,
    nominalFrameRate: nominalRate,
    averageFrameRate: averageRate,
    durationSeconds: round(durationSeconds, 6),
    audioStreams: audioStreams.length,
  };
}

async function decodedContentStats(filename, cropTop) {
  const metadata = await sharp(filename).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`decoded gate could not read ${path.basename(filename)} dimensions`);
  const top = Math.max(0, Math.min(Number(cropTop) || 0, metadata.height - 1));
  const { data, info } = await sharp(filename)
    .extract({ left: 0, top, width: metadata.width, height: metadata.height - top })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  let maximumChannel = 0;
  let sum = 0;
  for (const value of data) {
    maximumChannel = Math.max(maximumChannel, value);
    sum += value;
  }
  return {
    cropTop: top,
    dimensions: [info.width, info.height],
    maximumChannel,
    meanChannel: round(sum / data.length, 6),
  };
}

async function assertForwardDecodedTimeline(ffmpegPath, destination, workRoot, id, overlayBarHeight) {
  const decodedIndexes = [499, ...Array.from({ length: 13 }, (_, index) => 500 + index), 513, 539];
  const directory = path.join(workRoot, `${id}-decoded-timeline`);
  await mkdir(directory);
  const expression = decodedIndexes.map((index) => `eq(n\\,${index})`).join("+");
  await execFileAsync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", destination,
    "-vf", `select=${expression}`,
    "-fps_mode", "passthrough",
    "-frames:v", String(decodedIndexes.length),
    path.join(directory, "decoded-%03d.png"),
  ], { windowsHide: true, maxBuffer: 4_000_000 });
  const decodedFiles = (await readdir(directory))
    .filter((filename) => /^decoded-\d{3}\.png$/i.test(filename))
    .sort(lexicalCompare);
  if (decodedFiles.length !== decodedIndexes.length) {
    throw new Error(`${id} decoded timeline gate extracted ${decodedFiles.length}/${decodedIndexes.length} frames`);
  }
  const frames = [];
  for (const [position, decodedIndex] of decodedIndexes.entries()) {
    const filename = path.join(directory, decodedFiles[position]);
    frames.push({
      decodedIndex,
      displayFrame: decodedIndex + 1,
      fullFrame: await decodedContentStats(filename, 0),
      contentBelowOverlay: await decodedContentStats(filename, overlayBarHeight),
    });
  }
  const physical = frames[0];
  const black = frames.slice(1, 14);
  const semanticStart = frames[14];
  const settled = frames[15];
  if (physical.contentBelowOverlay.maximumChannel <= 2) throw new Error(`${id} decoded F500 physical checkpoint is nominal black`);
  if (black.some((frame) => frame.fullFrame.maximumChannel > 2)) {
    throw new Error(`${id} decoded F501-F513 interval is not uniformly nominal black`);
  }
  if (semanticStart.contentBelowOverlay.maximumChannel <= 2) throw new Error(`${id} decoded F514 semantic geometry is not visible`);
  if (settled.contentBelowOverlay.maximumChannel <= 32) throw new Error(`${id} decoded F540 settled ENTRY is not visible`);
  return {
    status: "PASS",
    decodedIndexConvention: "zero-based; displayFrame = decodedIndex + 1",
    requiredMapping: {
      physical: "n499 / F500",
      nominalBlack: "n500-n512 / F501-F513",
      semanticStart: "n513 / F514",
      settledEntry: "n539 / F540",
    },
    nominalBlackRule: "the complete decoded frame has maximum RGB channel <= 2 after CRF18 H.264, proving both nominal black and overlay suppression",
    frames,
  };
}

async function ffmpegVersion(ffmpegPath) {
  const result = await execFileAsync(ffmpegPath, ["-version"], { windowsHide: true, maxBuffer: 1_000_000 });
  return String(result.stdout).split(/\r?\n/)[0].trim();
}

async function encodeSequence({
  ffmpegPath,
  files,
  overlay,
  overlayBarHeight,
  width,
  height,
  destination,
  expectedFrames,
  workRoot,
  id,
  preserveForwardBlackBeat = false,
}) {
  if (files.length !== expectedFrames) throw new Error(`${id} received ${files.length}/${expectedFrames} source frames`);
  const image2Sequence = await prepareImage2Sequence(workRoot, id, files);
  const overlayFilter = preserveForwardBlackBeat
    ? "[0:v][1:v]overlay=0:0:format=auto:enable='not(between(n,500,512))',format=yuv420p[v]"
    : "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]";
  await execFileAsync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-framerate", String(FRAME_RATE), "-start_number", "1", "-i", image2Sequence.pattern,
    "-loop", "1", "-framerate", String(FRAME_RATE), "-i", overlay,
    "-filter_complex", overlayFilter,
    "-map", "[v]", "-an",
    "-frames:v", String(expectedFrames),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-level", "4.2",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-map_metadata", "-1", "-metadata", "creation_time=1980-01-01T00:00:00Z",
    "-fflags", "+bitexact", "-flags:v", "+bitexact", "-threads", "1",
    destination,
  ], { windowsHide: true, maxBuffer: 8_000_000 });
  const streamProbe = await probeEncodedVideo(ffmpegPath, destination, expectedFrames, width, height);
  const decodedTimelineGate = preserveForwardBlackBeat
    ? await assertForwardDecodedTimeline(ffmpegPath, destination, workRoot, id, overlayBarHeight)
    : null;
  const data = await readFile(destination);
  return {
    id,
    path: path.relative(path.dirname(path.dirname(destination)), destination).replaceAll("\\", "/"),
    bytes: data.length,
    sha256: sha256(data),
    codec: "H.264 / libx264",
    frameRate: FRAME_RATE,
    frameCount: expectedFrames,
    durationSeconds: round(expectedFrames / FRAME_RATE, 3),
    imageSequenceIngestion: {
      method: image2Sequence.method,
      frameCount: image2Sequence.frameCount,
      hardLinks: image2Sequence.hardLinks,
      fallbackCopies: image2Sequence.fallbackCopies,
    },
    streamProbe,
    decodedTimelineGate,
    audioStreams: 0,
    classificationBurnedIn: preserveForwardBlackBeat
      ? "yes, except F501–513; pre-encode plates are exact RGB black and decoded H.264 is gated as nominal black"
      : true,
  };
}

async function createAnimatics(outputRoot, workRoot, families, ffmpegPath) {
  const outputs = [];
  for (const family of FAMILIES) {
    const sequence = families[family];
    const destination = path.join(outputRoot, "animatics", `phase-4r0-${family}-full-540f-30fps-h264.mp4`);
    const record = await encodeSequence({
      ffmpegPath,
      files: sequence.files,
      overlay: sequence.overlay,
      overlayBarHeight: sequence.overlayRecord.barHeight,
      width: sequence.width,
      height: sequence.height,
      destination,
      expectedFrames: FINAL_FRAME,
      workRoot,
      id: `${family}-full`,
      preserveForwardBlackBeat: true,
    });
    outputs.push({
      ...record,
      family,
      direction: "forward",
      timeline: "physical F001–500; pre-encode exact RGB black / encoded nominal black F501–513; actual-ENTRY resolve F514–540",
    });
  }
  const desktop = families.desktop;
  const reverse = await encodeSequence({
    ffmpegPath,
    files: [...desktop.files].reverse(),
    overlay: desktop.overlay,
    overlayBarHeight: desktop.overlayRecord.barHeight,
    width: desktop.width,
    height: desktop.height,
    destination: path.join(outputRoot, "animatics", "phase-4r0-desktop-reverse-540f-30fps-h264.mp4"),
    expectedFrames: FINAL_FRAME,
    workRoot,
    id: "desktop-reverse",
  });
  outputs.push({ ...reverse, family: "desktop", direction: "reverse", sourceFrameOrder: "F540→F001" });

  const jumpFrames = [1, 165, 370, 460, 500, 501, 513, 525, 540, 500, 370, 1];
  const repeated = [];
  for (const frame of jumpFrames) {
    const filename = desktop.files[frame - 1];
    for (let repeat = 0; repeat < 10; repeat += 1) repeated.push(filename);
  }
  const jump = await encodeSequence({
    ffmpegPath,
    files: repeated,
    overlay: desktop.overlay,
    overlayBarHeight: desktop.overlayRecord.barHeight,
    width: desktop.width,
    height: desktop.height,
    destination: path.join(outputRoot, "animatics", "phase-4r0-desktop-fast-state-jump-30fps-h264.mp4"),
    expectedFrames: repeated.length,
    workRoot,
    id: "desktop-fast-state-jump",
  });
  outputs.push({ ...jump, family: "desktop", direction: "state-jump", sourceFrames: jumpFrames, holdFramesPerState: 10 });
  return outputs;
}

function frameTitle(frame, label) {
  return `${label} · F${String(frame).padStart(3, "0")}`;
}

async function createMilestoneSheets(outputRoot, families, cameraPaths) {
  const records = [];
  const definitions = [
    ["0°", DEFAULT_TIMELINE.orbitMilestones["0deg"]],
    ["90°", DEFAULT_TIMELINE.orbitMilestones["90deg"]],
    ["180°", DEFAULT_TIMELINE.orbitMilestones["180deg"]],
    ["270°", DEFAULT_TIMELINE.orbitMilestones["270deg"]],
    ["360°", DEFAULT_TIMELINE.orbitMilestones["360deg"]],
    ["FRONTAL", DEFAULT_TIMELINE.orbitMilestones.frontal],
    ["ENTRY", 540],
  ];
  for (const family of FAMILIES) {
    const sequence = families[family];
    const panels = definitions.map(([label, frame]) => {
      const sample = frame <= 500 ? nearestSample(cameraPaths[family].samples, frame) : null;
      return {
        input: sequence.files[frame - 1],
        title: frameTitle(frame, label),
        lines: sample
          ? [`angle ${round(sample.relativeAngleDegrees, 2)}° · radius ${round(sample.radiusM, 3)} m`, `distance ${round(sample.distanceM, 3)} m · lens ${round(sample.lensMm, 2)} mm`]
          : ["actual supplied ENTRY plate · semantic resolve complete"],
      };
    });
    records.push(await createSheet(outputRoot, {
      filename: `phase-4r0-${family}-0-90-180-270-360-frontal-entry.png`,
      title: `PHASE 4-R0 · ${family.toUpperCase()} · ORBIT MILESTONES`,
      subtitle: "Explicit 0° / 90° / 180° / 270° / 360° / frontal / ENTRY review states",
      panels,
      columns: 2,
    }));
  }
  return records;
}

async function createNarrativeSheets(outputRoot, families) {
  const desktop = families.desktop;
  const conductionLabels = ["DORMANT", "CONDUCTION START", "CONDUCTION 25%", "CONDUCTION 50%", "CONDUCTION 75%", "ORBIT COMPLETE / ARRIVAL", "INDICATOR RESPONSE"];
  const conduction = await createSheet(outputRoot, {
    filename: "phase-4r0-conduction-contact-sheet.png",
    title: "PHASE 4-R0 · CONDUCTION",
    subtitle: "Fresh desktop Eevee real-camera physical frames; proposed accepted-timeline expansion into F001–500",
    panels: DEFAULT_TIMELINE.conductionFrames.map((frame, index) => ({
      input: desktop.files[frame - 1],
      title: frameTitle(frame, conductionLabels[index]),
      lines: ["physical source only", "no semantic plate pixels"],
    })),
    columns: 2,
  });
  const crtLabels = ["INDICATOR", "WAKE START", "WAKE PEAK", "WAKE RELEASE", "RASTER START", "RASTER MID", "RASTER FULL", "CRT-Q STABLE"];
  const crt = await createSheet(outputRoot, {
    filename: "phase-4r0-crt-q-contact-sheet.png",
    title: "PHASE 4-R0 · CRT-Q SIGNAL QUALITY",
    subtitle: "Indicator → neutral wake → picture field → settled Quantum state",
    panels: DEFAULT_TIMELINE.crtQualityFrames.map((frame, index) => ({
      input: desktop.files[frame - 1],
      title: frameTitle(frame, crtLabels[index]),
      lines: ["fresh physical frame", "screen authenticity remains subject to human review"],
    })),
    columns: 2,
  });
  const portalLabels = [
    "CRT-Q HOLD END",
    "LATE FRONTAL APPROACH",
    "GLASS FILLS FRAME",
    "THRESHOLD APPROACH",
    "F500 PHYSICAL THRESHOLD",
    "BLACK BEAT START",
    "BLACK BEAT END",
    "SEMANTIC GEOMETRY START",
    "H1 FIRST READABLE",
    "SEMANTIC HALF REVEAL",
    "ENTRY RESOLVED",
  ];
  const portal = await createSheet(outputRoot, {
    filename: "phase-4r0-portal-11-state-contact-sheet.png",
    title: "PHASE 4-R0 · 11-STATE PORTAL THRESHOLD",
    subtitle: "Physical F≤500 · pre-encode exact / encoded nominal black F501–513 · actual-plate resolve F514–540",
    panels: DEFAULT_TIMELINE.portalFrames.map((frame, index) => ({
      input: desktop.files[frame - 1],
      title: frameTitle(frame, portalLabels[index]),
      lines: frame <= 500
        ? ["fresh physical Eevee frame"]
        : frame <= 513
          ? ["exact deep black · RGB 0/0/0"]
          : [`semantic alpha ${round(semanticResolveAlpha(frame), 4)}`, "actual ENTRY plate; no fabricated text"],
    })),
    columns: 2,
  });
  return { conduction, crt, portal };
}

async function createResponsiveSheets(outputRoot, families, responsiveEntryPlates) {
  const records = [];
  const stateLabels = ["DORMANT", "CONDUCTION 50%", "CRT-Q STABLE", "LATE FRONTAL APPROACH", "PHYSICAL THRESHOLD", "ENTRY"];
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    const sequence = families[viewport.family];
    const panels = [];
    for (const [index, frame] of DEFAULT_TIMELINE.responsiveFrames.entries()) {
      const input = frame === DEFAULT_TIMELINE.events.settledEntry
        ? responsiveEntryPlates[viewport.id]
        : await renderViewportFrame(sequence.files[frame - 1], viewport.width, viewport.height);
      panels.push({
        input,
        title: frameTitle(frame, stateLabels[index]),
        lines: [`${viewport.width}×${viewport.height} · ${viewport.family} family`, frame === 540 ? "actual ENTRY plate" : "fresh physical Eevee frame"],
        fit: "contain",
      });
    }
    records.push(await createSheet(outputRoot, {
      filename: `phase-4r0-responsive-${viewport.id}-six-state.png`,
      title: `PHASE 4-R0 · RESPONSIVE · ${viewport.width}×${viewport.height}`,
      subtitle: `Six-state family-mapped previsualization · selected family: ${viewport.family}`,
      panels,
      columns: 2,
      cellWidth: 590,
      previewHeight: 440,
    }));
  }
  return records;
}

async function createShortLandscapeNeighborSheet(outputRoot, families, entryNeighborPlates) {
  const frame = 500;
  const panels = [];
  for (const viewport of SHORT_LANDSCAPE_NEIGHBORS) {
    panels.push({
      input: await renderViewportFrame(families.landscape.files[frame - 1], viewport.width, viewport.height),
      title: `${viewport.width}×${viewport.height} · F500 PHYSICAL`,
      lines: ["landscape-authored family", "threshold crop / spiral / frontal continuity gate"],
      fit: "contain",
    });
    panels.push({
      input: entryNeighborPlates[viewport.id],
      title: `${viewport.width}×${viewport.height} · ACTUAL ENTRY`,
      lines: [`manifest plate ${viewport.plateId}`, "real semantic field; capture-only short-landscape treatment remains unaccepted"],
      fit: "contain",
    });
  }
  return createSheet(outputRoot, {
    filename: "phase-4r0-short-landscape-neighbor-sheet.png",
    title: "PHASE 4-R0 · SHORT-LANDSCAPE NEIGHBORS",
    subtitle: "Paired physical F500 and actual semantic ENTRY at the 844×390 authority plus four adjacent probes",
    panels,
    columns: 2,
    previewHeight: 320,
  });
}

async function createOpeningComparison(outputRoot, authorityImage, families, openingComposition) {
  const authorityOccupancy = await imagePixelOccupancy(authorityImage);
  const panels = [{
    input: authorityImage,
    title: "CURRENT OPENING AUTHORITY · FIRST VISUAL STATE",
    lines: [
      `context-only luma occupancy ${authorityOccupancy.occupiedPercent}%`,
      "no frozen 3D geometry contract is claimed for this comparison image",
      "read-only authority; not re-encoded into production",
    ],
  }];
  const measurements = {
    authorityContextOnly: authorityOccupancy,
    method: openingComposition.method,
    limitation: openingComposition.limitation,
    derivativeSha256: openingComposition.derivativeSha256,
    measurementScript: openingComposition.measurementScript,
    blenderVersion: openingComposition.blenderVersion,
    spiralDenominator: openingComposition.spiralDenominator,
    humanAccepted: false,
    families: {},
  };
  for (const family of FAMILIES) {
    const geometry = openingComposition.families[family];
    measurements.families[family] = geometry;
    panels.push({
      input: families[family].files[0],
      title: `${family.toUpperCase()} R0 · F001 · FULL-SPIRAL REVIEW GATE`,
      lines: [
        `spiral frustum-visible ${geometry.spiralVisiblePercent}% (reviewable path)`,
        `denominator excludes ${geometry.intentionallyEntryHiddenSegmentCount} accepted entry_hidden terminal segments`,
        `CRT vertical viewport occupancy ${geometry.crtVerticalViewportOccupancyPercent}%`,
        `CRT projected convex-hull viewport area ${geometry.crtViewportAreaPercent}%`,
        `${geometry.camera} · ${geometry.lensMm} mm · ${geometry.measurementViewport.join("×")}`,
        "geometric projection only · no render-pixel/occlusion segmentation · human unaccepted",
      ],
    });
  }
  const sheet = await createSheet(outputRoot, {
    filename: "phase-4r0-opening-authority-comparison.png",
    title: "PHASE 4-R0 · OPENING COMPARISON",
    subtitle: "Current opening authority vs frozen-derivative geometric F001 spiral and CRT occupancy measurements",
    panels,
    columns: 2,
  });
  return { sheet, measurements };
}

async function createLogoProvenance(outputRoot, families, logoProvenance) {
  const physicalLogoFrame = DEFAULT_TIMELINE.events.qStable;
  const panels = [
    {
      input: families.desktop.files[physicalLogoFrame - 1],
      title: frameTitle(physicalLogoFrame, "PHYSICAL CRT LOGO / BRAND STATE"),
      lines: ["fresh Eevee frame", "logo source is declared by source report; this packager performs no recreation"],
    },
    {
      input: families.desktop.files[539],
      title: "ACTUAL DESKTOP ENTRY PLATE · F540",
      lines: ["semantic source supplied externally", "no logo/text generated by packager"],
    },
    {
      input: families.mobile.files[539],
      title: "ACTUAL MOBILE ENTRY PLATE · F540",
      lines: ["responsive semantic authority", "no inferred logo substitution"],
    },
    {
      input: families.landscape.files[539],
      title: "ACTUAL LANDSCAPE ENTRY PLATE · F540",
      lines: ["short-landscape semantic authority", "no inferred logo substitution"],
    },
  ];
  const sheet = await createSheet(outputRoot, {
    filename: "phase-4r0-logo-provenance.png",
    title: "PHASE 4-R0 · LOGO / BRAND PROVENANCE",
    subtitle: "Visual states are shown only from supplied physical frames and supplied ENTRY plates",
    panels,
    columns: 2,
  });
  const report = {
    schema: "quantum-hub.phase-4-r0.logo-provenance.v1",
    classification: CLASSIFICATION,
    sourceReportDeclaration: logoProvenance,
    physicalLogoFrame,
    semanticEntryFrame: 540,
    packagerGeneratedLogoAssets: false,
    packagerInferredLogoSource: false,
    sheet: sheet.path,
  };
  await atomicJson(path.join(outputRoot, "reports", "phase-4r0-logo-provenance.json"), report);
  return { sheet, report };
}

async function copyReports(
  outputRoot,
  sourceBuildReportPath,
  sourceValidationReportPath,
  openingCompositionScriptPath,
  openingCompositionReportPath,
  sequences,
  entryManifestPath,
) {
  const records = [];
  const definitions = [
    ["source-build", sourceBuildReportPath, "phase-4r0-source-build-report.json"],
    ["source-validation", sourceValidationReportPath, "phase-4r0-source-validation-report.json"],
    ["opening-composition-measurement-script", openingCompositionScriptPath, "measure_phase4r0_opening_composition.py"],
    ["opening-composition-geometry", openingCompositionReportPath, "phase-4r0-opening-composition-geometry-report.json"],
    ...FAMILIES.map((family) => [
      `${family}-fresh-eevee-render`,
      sequences[family].renderReportPath,
      `phase-4r0-${family}-fresh-eevee-render-report.json`,
    ]),
  ];
  for (const [role, source, filename] of definitions) {
    const data = await readFile(source);
    const destination = path.join(outputRoot, "reports", filename);
    await atomicWrite(destination, data);
    records.push({ role, path: `reports/${filename}`, bytes: data.length, sha256: sha256(data) });
  }
  const sourceEntryManifestData = await readFile(entryManifestPath);
  const publicEntryManifest = JSON.parse(sourceEntryManifestData.toString("utf8"));
  if (publicEntryManifest.output && typeof publicEntryManifest.output === "object") {
    delete publicEntryManifest.output.root;
  }
  if (publicEntryManifest.browser && typeof publicEntryManifest.browser === "object") {
    delete publicEntryManifest.browser.executable;
  }
  publicEntryManifest.handoffRedactions = {
    applied: true,
    fields: ["output.root", "browser.executable"],
    reason: "absolute host paths are excluded from the human-review handoff",
  };
  const publicEntryManifestData = Buffer.from(`${JSON.stringify(publicEntryManifest, null, 2)}\n`, "utf8");
  const publicEntryManifestFilename = "phase-4r0-semantic-entry-plates-manifest.json";
  await atomicWrite(path.join(outputRoot, "reports", publicEntryManifestFilename), publicEntryManifestData);
  records.push({
    role: "semantic-entry-plates",
    path: `reports/${publicEntryManifestFilename}`,
    bytes: publicEntryManifestData.length,
    sha256: sha256(publicEntryManifestData),
    sanitizedForHandoff: true,
    sourceBytes: sourceEntryManifestData.length,
    sourceSha256: sha256(sourceEntryManifestData),
    redactedFields: ["output.root", "browser.executable"],
  });
  return records;
}

async function assertNoPrivateHostPaths(root, files) {
  const containsPrivateHostPath = (value) => [
    /(?:^|[\s"'=(])[a-z]:[\\/](?:users|documents and settings|program files(?: \(x86\))?|programdata|windows)[\\/]/i,
    /(?:^|[\s"'=(])\/(?:users|home)\/[^/\s"']+[\\/]/i,
    /[\\/](?:appdata|onedrive)[\\/]/i,
  ].some((pattern) => pattern.test(value));
  for (const relativePath of files) {
    const extension = path.extname(relativePath).toLowerCase();
    if (!HANDOFF_TEXT_EXTENSIONS.has(extension)) continue;
    const text = await readFile(path.join(root, ...relativePath.split("/")), "utf8");
    if (extension === ".json") {
      let leakTrail = null;
      deepValues(JSON.parse(text), (value, trail) => {
        if (leakTrail || typeof value !== "string") return;
        if (containsPrivateHostPath(value)) leakTrail = trail.join(".") || "<root>";
      });
      if (leakTrail) {
        throw new Error(`private host path leaked into packaged JSON: ${relativePath} at ${leakTrail}`);
      }
    } else if (containsPrivateHostPath(text)) {
      throw new Error(`private host path leaked into packaged text: ${relativePath}`);
    }
  }
}

async function packageFileRecords(root, files) {
  const records = [];
  for (const relativePath of files) {
    const data = await readFile(path.join(root, ...relativePath.split("/")));
    records.push({ path: relativePath, bytes: data.length, sha256: sha256(data) });
  }
  return records;
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

function dosDateTimeUtc(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
  };
}

async function createStoredZip(root, files, destination, generatedAt) {
  const ordered = [...files].sort(lexicalCompare);
  if (ordered.length > 0xffff) throw new Error("ZIP contains too many entries for classic ZIP");
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTimeUtc(new Date(generatedAt));
  for (const relativePath of ordered) {
    const name = Buffer.from(relativePath.replaceAll("\\", "/"), "utf8");
    const data = await readFile(path.join(root, ...relativePath.split("/")));
    const crc = crc32(data);
    if (data.length > 0xffffffff || offset > 0xffffffff) throw new Error("previsualization package exceeds classic ZIP limits");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(ordered.length, 8);
  end.writeUInt16LE(ordered.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  await atomicWrite(destination, Buffer.concat([...localParts, ...centralParts, end]));
}

function readmeText({
  generatedAt,
  ffmpeg,
  sourceAuthorities,
  sequenceAuthorities,
  animatics,
  diagrams,
  milestoneSheets,
  narrativeSheets,
  responsiveSheets,
  neighborSheet,
  openingComparison,
  logoProvenance,
  reportCopies,
}) {
  const list = (records) => records.map((record) => `- \`${record.path}\` — ${record.sha256 ?? "recorded in manifest"}`).join("\n");
  const openingCompositionSummary = FAMILIES.map((family) => {
    const value = openingComparison.measurements.families[family];
    return `- ${family}: spiral frustum-visible **${value.spiralVisiblePercent}%** of the reviewable path (denominator excludes **${value.intentionallyEntryHiddenSegmentCount}** accepted \`entry_hidden\` terminal segments); CRT vertical viewport occupancy **${value.crtVerticalViewportOccupancyPercent}%**; CRT projected convex-hull viewport area **${value.crtViewportAreaPercent}%**`;
  }).join("\n");
  return `# Phase 4-R0 orbit / signal-threshold previsualization

> **${CLASSIFICATION}**

This is an automated previsualization package. It is not a production-media
authority, a human acceptance, a Phase 4 completion, or authorization to begin
Phase 5. Every physical pixel in F001–500 comes from the externally supplied
fresh Eevee real-camera roots. F501–513 uses bounded pre-encode exact RGB-black
plates; the CRF18 H.264 result is decoded-gated as nominal black. F514–540
resolves only from the externally supplied actual ENTRY plates, beginning with
an intentional 4% geometry floor at F514 so the first semantic state is visible.

## Deterministic build

- Package timestamp: \`${generatedAt}\`
- Frame rate: 30 fps
- Full animatic length: 540 frames / 18.000 seconds
- FFmpeg: \`${ffmpeg}\`
- Node / Sharp / libvips: \`${process.version}\` / \`${sharp.versions.sharp}\` / \`${sharp.versions.vips}\`
- ZIP method: classic stored ZIP, UTF-8 paths, sorted entries, fixed UTC DOS timestamp
- H.264: libx264, CRF 18, slow preset, yuv420p, one encoding thread, metadata stripped
- Video ingestion: exact numbered image2 inputs at 30 fps; decoded-frame count,
  boundary mapping, nominal-black interval, F514 geometry, and F540 ENTRY are gated.
- Classification is burned into every animatic and printed on every sheet/diagram.
  The three forward animatics suppress only that overlay during F501–513 so
  the encoded beat remains nominal black; classification is visible before and after it.

## Source boundaries

${sourceAuthorities.map((record) => `- ${record.role}: \`${record.basename}\`, ${record.bytes} bytes, SHA-256 \`${record.sha256}\``).join("\n")}

Raw frame roots and ENTRY plates were read externally and are not included in
the ZIP. Accepted repository evidence was not written, overwritten, or used as
a raw-frame output destination. Source build/validation report copies are
included for audit.

## Physical sequence authorities

${sequenceAuthorities.map((record) => `- ${record.family}: F001–500, ${record.dimensions.join("×")}, ${record.totalBytes} raw bytes, aggregate SHA-256 \`${record.sequenceSha256}\``).join("\n")}

The aggregate digest is SHA-256 over ordered lines containing frame number,
byte length, and that frame's SHA-256. It binds all 500 external frames without
duplicating them into this package.

## Animatics

${list(animatics)}

The three full animatics are desktop, mobile portrait, and short-landscape.
The reverse and fast state-jump artifacts are representative desktop review
tools. They do not claim user-scroll timing or decoder behavior.

## Camera evidence

${list(diagrams)}
${list(milestoneSheets)}

Top/side paths and radius/relative-angle/aim-distance/lens graphs come from the
camera samples in the supplied PASS reports. They are not estimated from image
pixels. Milestone sheets explicitly show 0°/90°/180°/270°/360°/frontal/ENTRY.

## F001 geometric opening composition

${openingCompositionSummary}

These values come from the separately supplied Blender PASS report bound to
the exact derivative SHA-256, the copied measurement-script bytes/SHA-256, and
Blender 5.2.x. Spiral percentage is world-length-weighted
homogeneous-frustum clipping of actual accepted conductor centreline segments.
Its denominator excludes exactly five accepted \`entry_hidden\` terminal
segments; all-conductor lengths and percentages remain in the report/manifest.
CRT vertical occupancy and area use the viewport-clipped convex hull of actual
evaluated CRT assembly vertices. This is geometric projection, not render-pixel
or occlusion segmentation, and it does not infer human visibility or acceptance.

## Signal, portal, and responsive evidence

${list(Object.values(narrativeSheets))}
${list(responsiveSheets)}
- \`${neighborSheet.path}\`
- \`${openingComparison.sheet.path}\`
- \`${logoProvenance.sheet.path}\`

The opening authority panel retains a context-only non-black luma measurement;
it is not substituted for the exact R0 Blender geometry values above. Nine
responsive sheets use the documented desktop/mobile/landscape family map, each
with exactly six states.
The short-landscape neighbor sheet pairs physical F500 with an actual captured
ENTRY plate at 740×360, 800×360, 844×390, 896×414, and 900×480.

## Reports

${list(reportCopies)}
- \`reports/phase-4r0-logo-provenance.json\`
- \`reports/phase-4r0-opening-comparison.json\`
- \`reports/phase-4r0-timeline-proposal.json\`
- \`${MANIFEST_FILENAME}\`

## Human decision boundary

This package may support review of orbit pacing, full-spiral readability,
conduction, CRT-Q, black-beat bounds, semantic resolve, family selection, and
logo provenance. It does **not** accept any of them. Phase 5 remains
unauthorized until an explicit later human decision.
`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const externalRoots = {
    desktop: await assertExternalDirectory(options.desktopFrames, "--desktop-frames"),
    mobile: await assertExternalDirectory(options.mobileFrames, "--mobile-frames"),
    landscape: await assertExternalDirectory(options.landscapeFrames, "--landscape-frames"),
    entryPlates: await assertExternalDirectory(options.entryPlates, "--entry-plates"),
  };
  if (new Set(Object.values(externalRoots).map(normalizedPath)).size !== Object.keys(externalRoots).length) {
    throw new Error("desktop/mobile/landscape/ENTRY external roots must be four distinct directories");
  }
  const externalRootValues = Object.values(externalRoots);
  for (let left = 0; left < externalRootValues.length; left += 1) {
    for (let right = left + 1; right < externalRootValues.length; right += 1) {
      if (isWithin(externalRootValues[left], externalRootValues[right]) || isWithin(externalRootValues[right], externalRootValues[left])) {
        throw new Error("desktop/mobile/landscape/ENTRY external roots must not overlap or nest");
      }
    }
  }
  const openingAuthorityIsDirectory = (await stat(options.openingAuthority)).isDirectory();
  options.openingAuthority = openingAuthorityIsDirectory
    ? await realpath(options.openingAuthority)
    : await assertFile(options.openingAuthority, "--opening-authority");
  for (const externalRoot of externalRootValues) {
    if (isWithin(externalRoot, options.openingAuthority) || (openingAuthorityIsDirectory && isWithin(options.openingAuthority, externalRoot))) {
      throw new Error("--opening-authority must be independent of the fresh physical-frame and ENTRY roots");
    }
  }
  options.openingCompositionReport = await assertFile(options.openingCompositionReport, "--opening-composition-report");
  if (isWithin(ROOT, options.openingCompositionReport)) {
    throw new Error("--opening-composition-report must be the external output of the frozen Blender measurement script");
  }
  for (const externalRoot of externalRootValues) {
    if (isWithin(externalRoot, options.openingCompositionReport)) {
      throw new Error("--opening-composition-report must remain independent of the physical-frame and ENTRY roots");
    }
  }
  options.sourceBuildReport = await assertFile(options.sourceBuildReport, "--source-build-report");
  options.sourceValidationReport = await assertFile(options.sourceValidationReport, "--source-validation-report");
  const openingCompositionScriptPath = await assertFile(
    OPENING_COMPOSITION_SCRIPT_PATH,
    "repository opening-composition measurement script",
  );
  const openingCompositionScriptAuthority = await inputFileRecord(
    openingCompositionScriptPath,
    "opening-composition-measurement-script",
  );
  await validateFreshExternalOutput(options.output, [
    ...externalRootValues,
    ...(openingAuthorityIsDirectory ? [options.openingAuthority] : []),
  ]);
  const ffmpegPath = await resolveFfmpeg(options.ffmpeg);
  const ffmpeg = await ffmpegVersion(ffmpegPath);

  const buildReport = await readJsonFile(options.sourceBuildReport, "source build report");
  const validationReport = await readJsonFile(options.sourceValidationReport, "source validation report");
  const openingCompositionReport = await readJsonFile(options.openingCompositionReport, "opening composition report");
  reportStatus(buildReport, "source build report");
  reportStatus(validationReport, "source validation report");
  const sourceBuildHash = await sha256File(options.sourceBuildReport);
  if (String(validationReport.source_build_report?.sha256 ?? "").toLowerCase() !== sourceBuildHash) {
    throw new Error("source validation report does not bind the exact supplied source-build report SHA-256");
  }
  if (String(validationReport.phase4r0_derivative?.sha256 ?? "").toLowerCase() !== String(buildReport.phase4r0_derivative?.sha256 ?? "").toLowerCase()) {
    throw new Error("source build and validation reports do not bind the same Phase 4-R0 derivative");
  }
  const derivativeSha256 = String(buildReport.phase4r0_derivative?.sha256 ?? "").toLowerCase();
  if (derivativeSha256 !== FROZEN_DERIVATIVE_SHA256) {
    throw new Error(`source reports must bind frozen Phase 4-R0 derivative ${FROZEN_DERIVATIVE_SHA256}`);
  }
  const derivativeBytes = numeric(buildReport.phase4r0_derivative?.bytes);
  if (!Number.isInteger(derivativeBytes) || derivativeBytes <= 0) {
    throw new Error("source build report must bind the frozen Phase 4-R0 derivative byte count");
  }
  const openingComposition = openingCompositionMeasurements(
    openingCompositionReport,
    { sha256: derivativeSha256, bytes: derivativeBytes },
    openingCompositionScriptAuthority,
  );
  assertTimelineAuthority(buildReport);

  const openingAuthorityHash = (await stat(options.openingAuthority)).isFile()
    ? await sha256File(options.openingAuthority)
    : null;
  const openingAuthorityBoundByReports = openingAuthorityHash
    ? reportContainsHash(buildReport, openingAuthorityHash) || reportContainsHash(validationReport, openingAuthorityHash)
    : null;

  const rawSequences = {
    desktop: await resolvePhysicalSequence(externalRoots.desktop, "desktop"),
    mobile: await resolvePhysicalSequence(externalRoots.mobile, "mobile"),
    landscape: await resolvePhysicalSequence(externalRoots.landscape, "landscape"),
  };
  assertEeveeRealCamera(buildReport, validationReport, rawSequences);
  const entryPlateBundle = await resolveEntryPlates(externalRoots.entryPlates);
  const entryPlates = entryPlateBundle.plates;
  const responsiveEntryPlates = entryPlateBundle.responsivePlates;
  const sourceReports = [
    buildReport,
    validationReport,
    ...FAMILIES.map((family) => rawSequences[family].renderReport),
  ];
  const cameraPaths = Object.fromEntries(FAMILIES.map((family) => [family, cameraSamplesFromRenderSequence(rawSequences[family])]));
  const logoProvenanceDeclaration = extractLogoProvenance(sourceReports);
  const generatedAt = stableGeneratedAt();

  await mkdir(options.output, { recursive: false });
  if (isWithin(ROOT, await realpath(options.output))) throw new Error("created output unexpectedly resolves inside repository");
  for (const directory of OUTPUT_DIRECTORIES) await mkdir(path.join(options.output, directory));
  const workRoot = path.join(options.output, `.phase4r0-work-${process.pid}`);
  await mkdir(workRoot);

  let families;
  try {
    families = Object.fromEntries(await Promise.all(FAMILIES.map(async (family) => [
      family,
      await buildFamilySequence(rawSequences[family], entryPlates[family], workRoot),
    ])));

    const openingImage = await authorityVisual(options.openingAuthority, ffmpegPath, workRoot);
    const sequenceAuthorities = [];
    for (const family of FAMILIES) sequenceAuthorities.push(await sequenceAuthority(rawSequences[family]));
    const openingCompositionAuthority = await inputFileRecord(
      options.openingCompositionReport,
      "opening-composition-geometry-report",
    );

    const sourceAuthorities = [
      ...(openingAuthorityHash
        ? [await inputFileRecord(options.openingAuthority, "current-opening-authority")]
        : [await inputFileRecord(openingImage, "current-opening-authority-frame-root-f001")]),
      await inputFileRecord(options.sourceBuildReport, "source-build-report"),
      await inputFileRecord(options.sourceValidationReport, "source-validation-report"),
      openingCompositionScriptAuthority,
      openingCompositionAuthority,
      ...FAMILIES.map((family) => rawSequences[family].renderReportRecord),
      entryPlateBundle.manifestRecord,
      ...await Promise.all(RESPONSIVE_VIEWPORTS.map((viewport) => inputFileRecord(
        responsiveEntryPlates[viewport.id],
        `${viewport.id}-entry-plate`,
      ))),
      ...await Promise.all(SHORT_LANDSCAPE_NEIGHBORS
        .filter((viewport) => viewport.id !== "844x390")
        .map((viewport) => inputFileRecord(entryPlateBundle.neighborPlates[viewport.id], `short-landscape-${viewport.id}-entry-plate`))),
    ];

    await atomicJson(path.join(options.output, "reports", "phase-4r0-timeline-proposal.json"), DEFAULT_TIMELINE);
    const reportCopies = await copyReports(
      options.output,
      options.sourceBuildReport,
      options.sourceValidationReport,
      openingCompositionScriptPath,
      options.openingCompositionReport,
      rawSequences,
      entryPlateBundle.manifestPath,
    );
    const animatics = await createAnimatics(options.output, workRoot, families, ffmpegPath);

    const diagrams = [];
    for (const family of FAMILIES) {
      diagrams.push(await createPathDiagram(options.output, family, cameraPaths[family], "top"));
      diagrams.push(await createPathDiagram(options.output, family, cameraPaths[family], "side"));
      diagrams.push(await createCameraGraphs(options.output, family, cameraPaths[family]));
    }
    diagrams.push(await createTimelineDiagram(options.output, DEFAULT_TIMELINE));

    const milestoneSheets = await createMilestoneSheets(options.output, families, cameraPaths);
    const narrativeSheets = await createNarrativeSheets(options.output, families);
    const responsiveSheets = await createResponsiveSheets(options.output, families, responsiveEntryPlates);
    const neighborSheet = await createShortLandscapeNeighborSheet(options.output, families, entryPlateBundle.neighborPlates);
    const openingComparison = await createOpeningComparison(options.output, openingImage, families, openingComposition);
    await atomicJson(path.join(options.output, "reports", "phase-4r0-opening-comparison.json"), {
      schema: "quantum-hub.phase-4-r0.opening-comparison.v1",
      classification: CLASSIFICATION,
      ...openingComparison.measurements,
      sheet: openingComparison.sheet.path,
    });
    const logoProvenance = await createLogoProvenance(options.output, families, logoProvenanceDeclaration);

    await atomicWrite(path.join(options.output, README_FILENAME), readmeText({
      generatedAt,
      ffmpeg,
      sourceAuthorities,
      sequenceAuthorities,
      animatics,
      diagrams,
      milestoneSheets,
      narrativeSheets,
      responsiveSheets,
      neighborSheet,
      openingComparison,
      logoProvenance,
      reportCopies,
    }));

    const beforeManifestFiles = (await listFiles(options.output))
      .filter((relativePath) => !relativePath.startsWith(`${path.basename(workRoot)}/`))
      .filter((relativePath) => ![ARCHIVE_FILENAME, MANIFEST_FILENAME, RESULT_FILENAME].includes(relativePath));
    const files = await packageFileRecords(options.output, beforeManifestFiles);
    const manifest = {
      schema: "quantum-hub.phase-4-r0.orbit-signal-threshold-previsualization.v1",
      status: "PASS",
      generatedAt,
      classification: CLASSIFICATION,
      authorization: {
        productionAuthorized: false,
        humanAccepted: false,
        phase5Authorized: false,
        phase4CompleteClaimed: false,
      },
      honesty: {
        physicalFrames: "fresh externally supplied Eevee real-camera F001–500 bound by PASS reports",
        deepBlackFrames: "F501–513 pre-encode plates are exact RGB 0/0/0; forward review overlays are suppressed and decoded H.264 is gated nominal black for this interval",
        semanticFrames: "F514–540 deterministic resolve from actual supplied ENTRY plates; F514 begins at an intentional 0.04 alpha geometry floor",
        syntheticGeometryOrLogoGenerated: false,
        acceptedEvidenceMutated: false,
        rawFramesIncludedInZip: false,
        outputExternalToRepository: true,
      },
      deterministicPolicy: {
        timestamp: generatedAt,
        sourceDateEpochOverrideSupported: true,
        archive: "stored classic ZIP, sorted UTF-8 entries, UTC DOS timestamp",
        h264: "libx264 CRF18 slow yuv420p threads=1 bitexact flags metadata stripped",
        node: process.version,
        sharp: sharp.versions.sharp,
        libvips: sharp.versions.vips,
        ffmpeg,
      },
      archivePlan: {
        filename: ARCHIVE_FILENAME,
        includesManifest: true,
        includesRawPhysicalFrames: false,
        includesRawEntryPlates: false,
      },
      sourceAuthorities,
      sequenceAuthorities,
      reportBindings: {
        openingAuthoritySha256: openingAuthorityHash,
        openingAuthorityBoundBySourceReports: openingAuthorityHash
          ? openingAuthorityBoundByReports
          : "directory authority; first visual frame selected for comparison",
        sourceBuildStatus: "PASS",
        sourceValidationStatus: "PASS",
        openingCompositionGeometryStatus: "PASS",
        openingCompositionReport: openingCompositionAuthority,
        openingCompositionMeasurementScript: openingCompositionScriptAuthority,
        openingCompositionBlenderVersion: openingComposition.blenderVersion,
        openingCompositionDerivativeSha256: openingComposition.derivativeSha256,
        openingCompositionSpiralDenominator: openingComposition.spiralDenominator,
        openingCompositionLimitation: openingComposition.limitation,
        eeveeRealCameraProofRequired: true,
        cameraSamplePaths: Object.fromEntries(FAMILIES.map((family) => [family, cameraPaths[family].sourcePath])),
        openingCompositionFamilies: openingComposition.families,
        logoProvenance: logoProvenanceDeclaration,
      },
      timelineProposal: DEFAULT_TIMELINE,
      openingCompositionGeometry: openingComposition,
      familyMapping: {
        responsiveMatrix: RESPONSIVE_VIEWPORTS,
        shortLandscapeNeighbors: SHORT_LANDSCAPE_NEIGHBORS.map((viewport) => ({ ...viewport, family: "landscape" })),
        semanticEntryPlateSelectors: {
          desktop: "desktop-1440x900",
          mobile: "mobile-390x844",
          landscape: "mobile-landscape-844x390",
        },
        responsiveEntryPlateSelectors: Object.fromEntries(
          RESPONSIVE_VIEWPORTS.map((viewport) => [viewport.id, viewport.plateId]),
        ),
      },
      animatics,
      diagrams,
      sheets: {
        milestone: milestoneSheets,
        conduction: narrativeSheets.conduction,
        crtQ: narrativeSheets.crt,
        portal11State: narrativeSheets.portal,
        responsiveSixState: responsiveSheets,
        shortLandscapeNeighbors: neighborSheet,
        openingComparison: openingComparison.sheet,
        logoProvenance: logoProvenance.sheet,
      },
      reportCopies,
      generatedReports: {
        timelineProposal: "reports/phase-4r0-timeline-proposal.json",
        openingComparison: "reports/phase-4r0-opening-comparison.json",
        logoProvenance: "reports/phase-4r0-logo-provenance.json",
      },
      files,
      counts: {
        fullForwardH264Animatics: 3,
        reverseAnimatics: 1,
        fastStateJumpAnimatics: 1,
        cameraDiagrams: FAMILIES.length * 3,
        timelineDiagrams: 1,
        orbitMilestoneSheets: milestoneSheets.length,
        responsiveSixStateSheets: responsiveSheets.length,
        shortLandscapeNeighborViewports: SHORT_LANDSCAPE_NEIGHBORS.length,
        shortLandscapeNeighborPanels: SHORT_LANDSCAPE_NEIGHBORS.length * 2,
        conductionStates: DEFAULT_TIMELINE.conductionFrames.length,
        crtQStates: DEFAULT_TIMELINE.crtQualityFrames.length,
        portalStates: DEFAULT_TIMELINE.portalFrames.length,
      },
    };
    await atomicJson(path.join(options.output, MANIFEST_FILENAME), manifest);
    await rm(workRoot, { recursive: true, force: false });

    const archiveFiles = (await listFiles(options.output))
      .filter((relativePath) => ![ARCHIVE_FILENAME, RESULT_FILENAME].includes(relativePath));
    await assertNoPrivateHostPaths(options.output, archiveFiles);
    const archivePath = path.join(options.output, ARCHIVE_FILENAME);
    await createStoredZip(options.output, archiveFiles, archivePath, generatedAt);
    const archiveData = await readFile(archivePath);
    const manifestData = await readFile(path.join(options.output, MANIFEST_FILENAME));
    const result = {
      schema: "quantum-hub.phase-4-r0.orbit-signal-threshold-previsualization.result.v1",
      status: "PASS",
      generatedAt,
      classification: CLASSIFICATION,
      outputBasename: path.basename(options.output),
      archive: {
        filename: ARCHIVE_FILENAME,
        bytes: archiveData.length,
        sha256: sha256(archiveData),
        entries: archiveFiles.length,
      },
      manifest: {
        filename: MANIFEST_FILENAME,
        bytes: manifestData.length,
        sha256: sha256(manifestData),
      },
      productionAuthorized: false,
      humanAccepted: false,
      phase5Authorized: false,
    };
    await atomicJson(path.join(options.output, RESULT_FILENAME), result);
    process.stdout.write(`Phase 4-R0 previsualization PASS: ${archivePath}\n`);
    process.stdout.write(`Archive SHA-256 ${result.archive.sha256}\n`);
  } catch (error) {
    await rm(workRoot, { recursive: true, force: true }).catch(() => {});
    await rm(options.output, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`Phase 4-R0 previsualization packaging failed: ${error.stack ?? error}\n`);
  process.exitCode = 1;
});
