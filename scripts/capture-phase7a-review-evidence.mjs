#!/usr/bin/env node

/**
 * Phase 7A external browser-review capture.
 *
 * All mutable browser, encoder, screenshot and manifest output is constrained
 * to a fresh durable directory outside the repository and OS temp storage.
 * Playwright WebM files are staging-only; the published recording authority is
 * the exact 7-scenario x Chromium/Firefox MP4 cross-product imported from the
 * Phase 7A browser contract.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  CORE_VIEWPORTS,
  EXTERNAL_EVIDENCE_POLICY,
  HUMAN_GATE_RECORDS,
  RECORDING_MEDIA_CONTRACT,
  RECORDING_SPECS,
  safeRelativeEvidencePath,
  validateEvidenceManifest,
  validateExternalEvidenceIntent,
  validateHumanGates,
  validateRecordingReport,
} from "./phase7a-browser-contract.mjs";
import { TYPOGRAPHY_ASSETS } from "./phase7a-contract.mjs";
import {
  PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS,
  measureManifestoGeometry,
  validateManifestoGeometry,
} from "./phase7a-manifesto-geometry.mjs";
import {
  NO_JS_FIELD_MAP_DESTINATIONS,
  PHASE7A_R1_REQUIRED_BRANCH,
  assertNativeFieldMapViewport,
  assertVisibleLinkInventory,
  captureVisibleLinkInventory,
  extractLinkedRuntimeAssets,
  runtimeAssetSetFingerprint,
  validateFallbackManifestoMeasurement,
} from "./capture-phase7a-r1-closure.mjs";

const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-7a.review-evidence-capture.v1";
export const MANIFEST_PATH = "evidence-manifest.json";
export const TYPOGRAPHY_SPECIMEN_PATH = "typography/phase7a-portable-specimen.html";
export const RECORDING_VIEW = Object.freeze({ id: "recording-1280x720", width: 1280, height: 720 });
export const CAPTURE_SETTLE_TIMEOUTS = Object.freeze({ fontsMs: 1_000, visualMs: 500 });
export const CAPTURE_RECORDING_SPECS = RECORDING_SPECS;
export const RESPONSIVE_GEOMETRY_VIEWPORTS = Object.freeze(PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS.map(({ width, height }) => Object.freeze({
  id: `r1-${width}x${height}`,
  width,
  height,
})));
export const PORTABLE_SERVED_BUILD_SCHEMA = "quantum-hub.phase-7a-r1.portable-served-build-receipt.v1";

const executableName = (base) => process.platform === "win32" ? `${base}.exe` : base;
export const DEFAULT_FFMPEG_CANDIDATES = Object.freeze([
  path.join(ROOT, "node_modules", "ffmpeg-static", executableName("ffmpeg")),
  path.resolve(ROOT, "..", "phase-5a-r-work", "tooling", "node_modules", "ffmpeg-static", executableName("ffmpeg")),
  "ffmpeg",
]);
export const DEFAULT_FFPROBE_CANDIDATES = Object.freeze([
  path.join(ROOT, "node_modules", "ffprobe-static", "bin", process.platform === "win32" ? path.join("win32", "x64", "ffprobe.exe") : "ffprobe"),
  path.resolve(ROOT, "..", "phase-5a-r-work", "tooling", "node_modules", "ffprobe-static", "bin", process.platform === "win32" ? path.join("win32", "x64", "ffprobe.exe") : "ffprobe"),
  "ffprobe",
]);

const TYPOGRAPHY_SOURCE_SPECS = Object.freeze([
  Object.freeze({ id: "anybody", family: "Anybody Study", label: "Anybody", role: "provisional", sourceSuffix: "public/fonts/anybody-latin-variable.woff2", format: "woff2-variations", stored: "58%", resolved: "112%" }),
  Object.freeze({ id: "mona", family: "Mona Study", label: "Mona Sans", role: "industrial control", sourceSuffix: "mona-sans-v2.0.27-variable.woff2", format: "woff2-variations", stored: "75%", resolved: "125%" }),
  Object.freeze({ id: "bricolage", family: "Bricolage Study", label: "Bricolage Grotesque", role: "authored challenger", sourceSuffix: "bricolage-grotesque-variable.woff2", format: "woff2-variations", stored: "75%", resolved: "100%" }),
  Object.freeze({ id: "archivo", family: "Archivo Study", label: "Archivo", role: "legibility backstop", sourceSuffix: "archivo-variable.ttf", format: "truetype-variations", stored: "62%", resolved: "125%" }),
]);

const extraScreenshot = (id, group, filename, width, height, mode) => Object.freeze({
  id,
  group,
  height,
  mode,
  relativePath: `screenshots/${group}/${filename}.png`,
  width,
});

export const SCREENSHOT_SPECS = Object.freeze([
  ...CORE_VIEWPORTS.map(({ id, width, height }) => Object.freeze({
    id: `core-${id}`,
    group: "core",
    height,
    mode: "core-resolved",
    relativePath: `screenshots/core/${id}.png`,
    width,
  })),
  extraScreenshot("reduced-desktop", "fallback", "reduced-motion-desktop-1440x900", 1440, 900, "reduced-motion"),
  extraScreenshot("reduced-mobile", "fallback", "reduced-motion-mobile-390x844", 390, 844, "reduced-motion"),
  extraScreenshot("nojs-mobile", "fallback", "no-javascript-mobile-390x844", 390, 844, "no-javascript"),
  extraScreenshot("nojs-entry-mobile", "fallback", "no-javascript-entry-mobile-390x844", 390, 844, "no-javascript-entry"),
  extraScreenshot("fallback-font-narrow", "fallback", "fallback-fonts-narrow-320x800", 320, 800, "fallback-fonts"),
  extraScreenshot("field-map-desktop-open", "field-map", "desktop-open-1440x900", 1440, 900, "field-map-open"),
  extraScreenshot("field-map-mobile-open", "field-map", "mobile-open-390x844", 390, 844, "field-map-open"),
  extraScreenshot("field-map-mobile-return", "field-map", "mobile-escape-focus-return-390x844", 390, 844, "field-map-focus-return"),
]);

const STALE_PHASE_PATH = /(?:^|[\\/_.-])phase[-_]?6(?:[\\/_.-]|$)|__phase6/i;
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,})/i;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function responsiveGeometryResult(measurement) {
  try {
    validateManifestoGeometry(measurement);
    return { status: "PASS", failure: null, measurement };
  } catch (error) {
    return { status: "FAIL", failure: String(error?.message ?? error), measurement };
  }
}

export function validateResponsiveGeometryState(state, id, manifestoValidator = validateManifestoGeometry) {
  const result = state?.manifestoGeometry;
  invariant(result && typeof result === "object", `responsive recording misses shared manifesto geometry for ${id}`);
  invariant(result.status === "PASS" && !result.failure, `responsive recording shared manifesto geometry failed for ${id}: ${result.failure ?? "unexplained failure"}`);
  invariant(result.measurement && typeof result.measurement === "object", `responsive recording shared manifesto measurement is missing for ${id}`);
  manifestoValidator(result.measurement);
  return true;
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function relativePosix(parent, candidate) {
  return path.relative(parent, candidate).replaceAll("\\", "/");
}

async function exists(candidate) {
  try { await access(candidate, fsConstants.F_OK); return true; } catch { return false; }
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  invariant(["http:", "https:"].includes(url.protocol), "--base-url must use HTTP(S)");
  invariant(!url.username && !url.password && !url.search && !url.hash, "--base-url must be credential-free and omit query/fragment");
  invariant(!STALE_PHASE_PATH.test(url.pathname), "--base-url contains a stale Phase 6 path");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

export function assertExternalFreshPath(candidate, label = "capture output") {
  invariant(typeof candidate === "string" && candidate.length > 0, `${label} is required`);
  const resolved = path.resolve(candidate);
  validateExternalEvidenceIntent(
    { output: resolved, exists: false, overwrite: false, gitTracked: false },
    { repositoryRoot: ROOT, temporaryRoot: os.tmpdir() },
  );
  invariant(!STALE_PHASE_PATH.test(resolved), `${label} contains a stale Phase 6 path`);
  return resolved;
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function portableServedBuildReference(receipt) {
  return {
    status: receipt.status,
    branch: receipt.branch,
    revision: receipt.revision,
    document: receipt.document,
    runtimeFingerprint: receipt.runtimeFingerprint,
  };
}

export function validatePortableServedBuildReceipt(receipt, expectedRevision) {
  invariant(receipt?.schema === PORTABLE_SERVED_BUILD_SCHEMA && receipt.status === "PASS", "portable served-build receipt is not PASS");
  invariant(receipt.branch === PHASE7A_R1_REQUIRED_BRANCH && receipt.revision === expectedRevision && /^[a-f0-9]{40}$/.test(receipt.revision), "portable served-build branch/revision differs");
  invariant(receipt.document?.relativePath === "dist/index.html"
    && Number.isSafeInteger(receipt.document.bytes)
    && receipt.document.bytes > 0
    && isSha256(receipt.document.sha256),
  "portable served-build document authority differs");
  invariant(Array.isArray(receipt.runtimeAssets) && receipt.runtimeAssets.length >= 2, "portable served-build runtime asset inventory differs");
  invariant(receipt.runtimeAssets.some(({ kind }) => kind === "css") && receipt.runtimeAssets.some(({ kind }) => kind === "javascript"), "portable served-build receipt lacks CSS or JavaScript");
  for (const asset of receipt.runtimeAssets) invariant(
    ["css", "javascript"].includes(asset.kind)
      && typeof asset.route === "string"
      && asset.route.startsWith("/")
      && !asset.route.includes("..")
      && Number.isSafeInteger(asset.bytes)
      && asset.bytes > 0
      && isSha256(asset.sha256),
    "portable served-build runtime asset record differs",
  );
  invariant(receipt.runtimeFingerprint === runtimeAssetSetFingerprint(receipt.runtimeAssets), "portable served-build runtime fingerprint differs");
  invariant(receipt.servedParity?.document === true && receipt.servedParity?.runtimeAssets === true, "portable receipt lacks served-origin byte parity");
  invariant(receipt.freshBuild?.command === "npm run build:phase7a-r1"
    && receipt.freshBuild.headBefore === expectedRevision
    && receipt.freshBuild.headAfter === expectedRevision
    && receipt.freshBuild.worktreeCleanBefore === true
    && receipt.freshBuild.worktreeCleanAfter === true,
  "portable receipt lacks a clean final-HEAD governed build");
  return true;
}

export function validatePortableCaptureBindings(manifest) {
  const receipt = manifest?.servedBuild;
  validatePortableServedBuildReceipt(receipt, receipt?.revision);
  const expected = portableServedBuildReference(receipt);
  for (const record of [...(manifest.recordings ?? []), ...(manifest.screenshots ?? [])]) {
    invariant(JSON.stringify(record.sourceAuthority) === JSON.stringify(expected), `capture source authority differs for ${record.relativePath ?? "record"}`);
  }
  return true;
}

async function gitText(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
  return String(stdout).trim();
}

async function localRuntimeAssetRecords(html) {
  const records = [];
  const distRoot = path.join(ROOT, "dist");
  for (const asset of extractLinkedRuntimeAssets(html)) {
    const absolute = path.resolve(distRoot, `.${asset.route}`);
    invariant(within(distRoot, absolute), `runtime asset escapes fresh dist: ${asset.route}`);
    const bytes = await readFile(absolute);
    records.push({ ...asset, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return records;
}

async function runGovernedR1Build() {
  if (process.platform !== "win32") {
    await execFileAsync("npm", ["run", "build:phase7a-r1"], {
      cwd: ROOT,
      env: { ...process.env },
      windowsHide: true,
      timeout: 15 * 60_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return;
  }
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "nodejs", "node_modules", "npm", "bin", "npm-cli.js") : null,
  ].filter(Boolean);
  let npmCli = null;
  for (const candidate of candidates) {
    try { await access(candidate, fsConstants.R_OK); npmCli = candidate; break; } catch { /* keep looking */ }
  }
  invariant(npmCli, "npm CLI is unavailable for the governed R1 build");
  await execFileAsync(process.execPath, [npmCli, "run", "build:phase7a-r1"], {
    cwd: ROOT,
    env: { ...process.env },
    windowsHide: true,
    timeout: 15 * 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

export async function capturePortableServedBuildReceipt(options) {
  const branch = await gitText(["branch", "--show-current"]);
  const headBefore = await gitText(["rev-parse", "HEAD"]);
  const statusBefore = await gitText(["status", "--porcelain=v1", "--untracked-files=normal"]);
  invariant(branch === PHASE7A_R1_REQUIRED_BRANCH && headBefore === options.revision, "review capture branch or final HEAD differs");
  invariant(statusBefore === "", "review capture requires a fully clean worktree, including non-ignored untracked files");
  await runGovernedR1Build();
  const headAfter = await gitText(["rev-parse", "HEAD"]);
  const statusAfter = await gitText(["status", "--porcelain=v1", "--untracked-files=normal"]);
  invariant(headAfter === options.revision && statusAfter === "", "governed review build changed final HEAD or worktree state");
  const localHtml = await readFile(path.join(ROOT, "dist", "index.html"));
  const runtimeAssets = await localRuntimeAssetRecords(localHtml.toString("utf8"));
  const response = await fetch(urlFor(options.baseUrl, "/"), { cache: "no-store", headers: { accept: "text/html" }, redirect: "error", signal: AbortSignal.timeout(options.timeoutMs) });
  const servedHtml = Buffer.from(await response.arrayBuffer());
  invariant(response.status === 200 && servedHtml.length === localHtml.length && sha256(servedHtml) === sha256(localHtml), "served Home document differs from the fresh final-HEAD dist");
  for (const expected of runtimeAssets) {
    const assetResponse = await fetch(urlFor(options.baseUrl, expected.route), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(options.timeoutMs) });
    const body = Buffer.from(await assetResponse.arrayBuffer());
    const contentType = (assetResponse.headers.get("content-type") ?? "").toLowerCase();
    invariant(assetResponse.status === 200
      && (expected.kind === "css" ? contentType.includes("text/css") : /javascript|ecmascript/.test(contentType))
      && body.length === expected.bytes
      && sha256(body) === expected.sha256,
    `served runtime asset differs from the fresh final-HEAD dist: ${expected.route}`);
  }
  const receipt = {
    schema: PORTABLE_SERVED_BUILD_SCHEMA,
    status: "PASS",
    branch,
    revision: options.revision,
    document: { relativePath: "dist/index.html", bytes: localHtml.length, sha256: sha256(localHtml) },
    runtimeFingerprint: runtimeAssetSetFingerprint(runtimeAssets),
    runtimeAssets,
    servedParity: { document: true, runtimeAssets: true },
    freshBuild: {
      command: "npm run build:phase7a-r1",
      headBefore,
      headAfter,
      worktreeCleanBefore: statusBefore === "",
      worktreeCleanAfter: statusAfter === "",
    },
  };
  validatePortableServedBuildReceipt(receipt, options.revision);
  return receipt;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "",
    dryRun: false,
    ffmpeg: "",
    ffprobe: "",
    headed: false,
    help: false,
    output: "",
    revision: "",
    selfTest: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--base-url") options.baseUrl = next();
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--revision") options.revision = next();
    else if (argument === "--ffmpeg") options.ffmpeg = path.resolve(next());
    else if (argument === "--ffprobe") options.ffprobe = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--headed") options.headed = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

export function validateOptions(options) {
  invariant(Number.isSafeInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms must be an integer from 5000 through 120000");
  if (!options.help && !options.selfTest) {
    options.baseUrl = normalizeBaseUrl(options.baseUrl);
    options.output = assertExternalFreshPath(options.output);
    invariant(/^[a-f0-9]{40}$/.test(options.revision), "--revision must be the exact 40-character final R1 HEAD");
  }
  return options;
}

export function expectedArtifactPaths() {
  return [
    ...CAPTURE_RECORDING_SPECS.map(({ relativePath }) => relativePath),
    ...SCREENSHOT_SPECS.map(({ relativePath }) => relativePath),
    TYPOGRAPHY_SPECIMEN_PATH,
    MANIFEST_PATH,
  ].map((value) => safeRelativeEvidencePath(value)).sort((left, right) => left.localeCompare(right));
}

export function capturePlan() {
  return Object.freeze({
    engines: Object.freeze(["chromium", "firefox"]),
    externalPolicy: EXTERNAL_EVIDENCE_POLICY,
    humanGates: HUMAN_GATE_RECORDS,
    recordings: CAPTURE_RECORDING_SPECS,
    screenshots: SCREENSHOT_SPECS,
    topology: Object.freeze(expectedArtifactPaths()),
    typographyCandidates: TYPOGRAPHY_SOURCE_SPECS.map(({ id, label, role }) => Object.freeze({ id, label, role })),
  });
}

function videoFilter(label = null) {
  const prefix = label === null ? "" : `[${label}]`;
  return `${prefix}scale=${RECORDING_VIEW.width}:${RECORDING_VIEW.height}:force_original_aspect_ratio=decrease,pad=${RECORDING_VIEW.width}:${RECORDING_VIEW.height}:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p,setpts=PTS-STARTPTS`;
}

export function encoderArguments(rawFiles, destination) {
  invariant(Array.isArray(rawFiles) && rawFiles.length >= 1, "at least one raw recording is required");
  const args = ["-v", "error", "-n"];
  for (const rawFile of rawFiles) args.push("-i", rawFile);
  if (rawFiles.length === 1) {
    args.push("-map", "0:v:0", "-vf", videoFilter());
  } else {
    const filters = rawFiles.map((_, index) => `${videoFilter(`${index}:v:0`)}[v${index}]`);
    const inputs = rawFiles.map((_, index) => `[v${index}]`).join("");
    filters.push(`${inputs}concat=n=${rawFiles.length}:v=1:a=0[outv]`);
    args.push("-filter_complex", filters.join(";"), "-map", "[outv]");
  }
  args.push(
    "-an", "-sn", "-dn", "-map_metadata", "-1",
    "-fps_mode", "cfr", "-r", "30",
    "-c:v", "libx264", "-preset", "medium", "-crf", "24",
    "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-movflags", "+faststart", destination,
  );
  return args;
}

export function fullDecodeArguments(file) {
  return ["-v", "error", "-xerror", "-i", file, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"];
}

function rational(value) {
  const [numerator, denominator] = String(value ?? "").split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return NaN;
  return numerator / denominator;
}

export function recordingContractResult(probe, authority, { fullDecodePassed = false } = {}) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const videos = streams.filter(({ codec_type: type }) => type === "video");
  const audios = streams.filter(({ codec_type: type }) => type === "audio");
  const others = streams.filter(({ codec_type: type }) => !["video", "audio"].includes(type));
  const video = videos[0] ?? {};
  const durationSeconds = Number(probe?.format?.duration ?? video.duration);
  const averageFps = rational(video.avg_frame_rate);
  const realFps = rational(video.r_frame_rate);
  const checks = {
    audioStreams: audios.length === RECORDING_MEDIA_CONTRACT.audioStreams,
    codec: video.codec_name === RECORDING_MEDIA_CONTRACT.codec,
    constantFrameRate: averageFps === RECORDING_MEDIA_CONTRACT.fps && realFps === RECORDING_MEDIA_CONTRACT.fps,
    container: String(probe?.format?.format_name ?? "").split(",").includes(RECORDING_MEDIA_CONTRACT.container),
    decodedFrames: Number.isSafeInteger(Number(video.nb_read_frames)) && Number(video.nb_read_frames) > 0,
    dimensions: Number(video.width) === RECORDING_MEDIA_CONTRACT.width && Number(video.height) === RECORDING_MEDIA_CONTRACT.height,
    duration: Number.isFinite(durationSeconds) && durationSeconds >= authority.minimumSeconds && durationSeconds <= authority.maximumSeconds,
    fullDecode: fullDecodePassed === true,
    oneVideoStream: videos.length === RECORDING_MEDIA_CONTRACT.videoStreams,
    otherStreams: others.length === 0,
    pixelFormat: video.pix_fmt === RECORDING_MEDIA_CONTRACT.pixelFormat,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    checks,
    failures,
    media: {
      audioStreams: audios.length,
      codec: video.codec_name ?? null,
      constantFrameRate: checks.constantFrameRate,
      container: checks.container ? RECORDING_MEDIA_CONTRACT.container : String(probe?.format?.format_name ?? ""),
      durationSeconds,
      fps: Number.isFinite(averageFps) ? averageFps : null,
      fullDecode: fullDecodePassed,
      height: Number(video.height) || null,
      pixelFormat: video.pix_fmt ?? null,
      videoStreams: videos.length,
      width: Number(video.width) || null,
    },
    status: failures.length === 0 ? "PASS" : "FAIL",
  };
}

export function validateManifestLedger(entries) {
  validateEvidenceManifest(entries);
  const expected = expectedArtifactPaths().filter((relativePath) => relativePath !== MANIFEST_PATH);
  const observed = entries.map(({ relativePath }) => relativePath);
  invariant(new Set(observed).size === observed.length, "evidence ledger contains duplicate paths");
  const missing = expected.filter((relativePath) => !observed.includes(relativePath));
  const unexpected = observed.filter((relativePath) => !expected.includes(relativePath));
  invariant(missing.length === 0, `evidence ledger is missing ${missing.length} required artifact(s): ${missing[0] ?? ""}`);
  invariant(unexpected.length === 0, `evidence ledger contains ${unexpected.length} stale or unexpected artifact(s): ${unexpected[0] ?? ""}`);
  invariant(entries.length === expected.length, "evidence ledger count differs");
  return true;
}

export function renderPortableTypographySpecimen(fonts) {
  invariant(fonts && typeof fonts === "object", "portable typography fonts are required");
  const faces = TYPOGRAPHY_SOURCE_SPECS.map((candidate) => {
    const base64 = fonts[candidate.id];
    invariant(typeof base64 === "string" && base64.length > 0, `portable typography font is missing: ${candidate.id}`);
    const mime = candidate.format.startsWith("woff2") ? "font/woff2" : "font/ttf";
    return `@font-face{font-family:"${candidate.family}";src:url(data:${mime};base64,${base64}) format("${candidate.format}");font-weight:100 900;font-stretch:50% 150%;font-display:block}`;
  }).join("\n");
  const candidates = TYPOGRAPHY_SOURCE_SPECS.map((candidate, index) => `
    <article class="candidate candidate--${candidate.id}" data-candidate="${candidate.label}" style="--stored:${candidate.stored};--resolved:${candidate.resolved};font-family:'${candidate.family}',Arial,sans-serif">
      <header><p>${String(index + 1).padStart(2, "0")} / ${candidate.role}</p><h2>${candidate.label}</h2></header>
      <div class="states">
        <section style="font-stretch:var(--stored)"><h3>Stored / narrow</h3><p class="manifesto">WE TURN INDUSTRIAL NEEDS INTO FIELD EVIDENCE.</p><p class="route-title">Industry 4.0 / Advanced Manufacturing</p></section>
        <section style="font-stretch:var(--resolved)"><h3>Resolved / wide</h3><p class="manifesto">WE TURN INDUSTRIAL NEEDS INTO FIELD EVIDENCE.</p><p class="route-title">Industry 4.0 / Advanced Manufacturing</p></section>
      </div>
    </article>`).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 7A portable typography specimen</title>
<style>${faces}
:root{color-scheme:dark;background:#080b0c;color:#fff;font-family:Arial,sans-serif;--muted:#a9b2b2;--rule:rgba(255,255,255,.18)}*{box-sizing:border-box}html,body{margin:0;min-width:0;background:#080b0c}body{overflow-x:clip}.intro,.candidate,.footer{width:min(calc(100% - 3rem),96rem);margin:auto}.intro{padding:4rem 0 5rem}.intro p,.candidate header p,h3,.footer{color:var(--muted);font:700 .72rem/1.4 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase}.intro h1{max-width:14ch;margin:1rem 0 0;font-size:clamp(2.6rem,7vw,7rem);line-height:.88;letter-spacing:-.055em}.candidate{padding:4rem 0 6rem;border-top:1px solid var(--rule)}.candidate header{display:flex;align-items:end;justify-content:space-between;gap:2rem}.candidate h2{margin:.5rem 0 0;font-size:clamp(2.1rem,5vw,5rem);line-height:.9}.states{display:grid;grid-template-columns:1fr 1fr;margin-top:3rem;border-block:1px solid var(--rule)}.states section{min-width:0;padding:2rem 2rem 4rem 0}.states section+section{padding-left:2rem;border-left:1px solid var(--rule)}.manifesto,.route-title{max-width:100%;margin:2rem 0 0;overflow-wrap:normal;word-break:normal;hyphens:none}.manifesto{font-size:clamp(2rem,5vw,5.4rem);font-weight:700;letter-spacing:-.055em;line-height:.88}.route-title{max-width:22ch;font-size:clamp(1.4rem,3vw,3rem);font-weight:650;line-height:.96}.footer{padding:2rem 0 4rem;border-top:1px solid var(--rule)}@media(max-width:48rem){.states{grid-template-columns:1fr}.states section+section{padding-left:0;border-left:0;border-top:1px solid var(--rule)}}
</style></head><body><header class="intro"><p>Quantum / Phase 7A / typography proof</p><h1>Stored signal. Resolved authority.</h1></header><main>${candidates}</main><footer class="footer">Typography + material authority: pending human review</footer></body></html>`;
}

async function typographySpecimen() {
  const fonts = {};
  for (const candidate of TYPOGRAPHY_SOURCE_SPECS) {
    const source = TYPOGRAPHY_ASSETS.find(([relativePath]) => relativePath.replaceAll("\\", "/").endsWith(candidate.sourceSuffix));
    invariant(source, `typography source authority is missing: ${candidate.id}`);
    const [relativePath, expectedBytes, expectedSha256] = source;
    const bytes = await readFile(path.join(ROOT, ...relativePath.split("/")));
    invariant(bytes.length === expectedBytes && sha256(bytes) === expectedSha256, `typography source authority differs: ${candidate.id}`);
    fonts[candidate.id] = bytes.toString("base64");
  }
  return renderPortableTypographySpecimen(fonts);
}

async function executableVersion(candidate) {
  try {
    const { stdout, stderr } = await execFileAsync(candidate, ["-version"], { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
    return String(stdout || stderr).split(/\r?\n/)[0].trim();
  } catch { return null; }
}

async function resolveExecutable(explicit, candidates, label) {
  if (explicit) {
    invariant(path.isAbsolute(explicit), `${label} path must be absolute`);
    const version = await executableVersion(explicit);
    invariant(version, `${label} is not executable: ${explicit}`);
    return { command: explicit, version };
  }
  for (const candidate of candidates) {
    const version = await executableVersion(candidate);
    if (version) return { command: candidate, version };
  }
  throw new Error(`${label} was not found; pass --${label.toLowerCase()} <absolute-path>`);
}

async function resolveMediaTools(options) {
  const ffmpeg = await resolveExecutable(options.ffmpeg, DEFAULT_FFMPEG_CANDIDATES, "FFmpeg");
  const siblingProbe = path.join(path.dirname(path.resolve(ffmpeg.command)), executableName("ffprobe"));
  const ffprobe = await resolveExecutable(options.ffprobe, [siblingProbe, ...DEFAULT_FFPROBE_CANDIDATES], "FFprobe");
  return { ffmpeg, ffprobe };
}

async function resolveBrowser(engine) {
  let playwright;
  try { playwright = await import("playwright-core"); }
  catch (error) { throw new Error(`Playwright is unavailable: ${error.message}`); }
  const browserType = playwright[engine];
  invariant(browserType, `unsupported recording engine: ${engine}`);
  const executablePath = browserType.executablePath();
  invariant(await exists(executablePath), `managed ${engine} browser is unavailable: install it with Playwright`);
  return { browserType, executablePath };
}

async function assertFreshDirectory(directory) {
  const candidate = assertExternalFreshPath(directory);
  let ancestor = candidate;
  while (!(await exists(ancestor))) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const [realAncestor, realRoot, realTemp] = await Promise.all([realpath(ancestor), realpath(ROOT), realpath(os.tmpdir())]);
  const resolvedCandidate = path.resolve(realAncestor, path.relative(ancestor, candidate));
  invariant(!within(realRoot, resolvedCandidate), "capture output resolves inside the repository through a linked ancestor");
  invariant(!within(realTemp, resolvedCandidate), "capture output resolves inside OS temporary storage through a linked ancestor");
  try {
    await lstat(candidate);
    throw new Error(`refusing to overwrite existing Phase 7A capture: ${candidate}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return candidate;
}

function ownedPath(root, relativePath, label = "owned output") {
  safeRelativeEvidencePath(relativePath, label);
  const candidate = path.resolve(root, ...relativePath.split("/"));
  invariant(within(root, candidate), `${label} escaped the external capture root`);
  return candidate;
}

async function removeOwnedTree(root, candidate = root) {
  assertExternalFreshPath(root, "owned staging root");
  const target = path.resolve(candidate);
  invariant(within(root, target), "cleanup target escaped the owned staging root");
  await rm(target, { recursive: true, force: true });
}

function urlFor(baseUrl, relative) {
  return new URL(relative, baseUrl).toString();
}

function safeRequestUrl(value) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch { return "unparseable-request"; }
}

export function requestFailureDisposition({ failure, resourceType, url }) {
  if (
    resourceType === "media"
    && String(url).startsWith("blob:")
    && /ABORTED/i.test(String(failure))
  ) return "EXPECTED_BLOB_MEDIA_ABORT";
  if (
    resourceType === "image"
    && /NS_BINDING_ABORTED/i.test(String(failure))
    && /\/media\/cinematic\/phase-4r2\/posters\/phase-4r2-(?:desktop|portrait|landscape)-poster-[0-9a-f]+\.png(?:[?#]|$)/i.test(String(url))
  ) return "EXPECTED_RESPONSIVE_POSTER_ABORT";
  return "UNEXPECTED";
}

async function installNetworkGuard(context, baseUrl, ledger, { blockFonts = false } = {}) {
  const origin = new URL(baseUrl).origin;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (blockFonts && request.resourceType() === "font") {
      ledger.blocked.push({ reason: "fallback-font-proof", resourceType: "font", path: safeRequestUrl(request.url()) });
      await route.abort("blockedbyclient");
      return;
    }
    if (["http:", "https:"].includes(requestUrl.protocol) && requestUrl.origin !== origin) {
      ledger.blocked.push({ reason: "origin-isolation", resourceType: request.resourceType(), path: safeRequestUrl(request.url()) });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
}

function attachDiagnostics(page, ledger, scope) {
  const handlers = {
    console(message) {
      if (["error", "warning"].includes(message.type())) ledger.console.push({ scope, type: message.type(), text: message.text().slice(0, 500) });
    },
    pageerror(error) { ledger.pageErrors.push({ scope, message: error.message.slice(0, 500) }); },
    requestfailed(request) {
      const requestUrl = request.url();
      const requestPath = safeRequestUrl(request.url());
      const failure = request.failure()?.errorText ?? "unknown";
      const resourceType = request.resourceType();
      const intentionallyBlocked = ledger.blocked.some(({ path: blockedPath }) => blockedPath === requestPath);
      const disposition = requestFailureDisposition({ failure, resourceType, url: requestUrl });
      if (disposition.startsWith("EXPECTED_")) {
        ledger.expectedCancellations.push({
          scope,
          failure,
          method: request.method(),
          navigation: request.isNavigationRequest(),
          reason: disposition === "EXPECTED_BLOB_MEDIA_ABORT"
            ? "in-memory blob media lifecycle cancellation"
            : "responsive authoritative poster source switch",
          resourceType,
          scheme: disposition === "EXPECTED_BLOB_MEDIA_ABORT" ? "blob:" : new URL(requestUrl).protocol,
        });
      } else if (!intentionallyBlocked && !failure.includes("ERR_BLOCKED_BY_CLIENT")) ledger.failedRequests.push({
        scope,
        path: requestPath,
        failure,
        method: request.method(),
        navigation: request.isNavigationRequest(),
        resourceType,
      });
    },
  };
  for (const [event, handler] of Object.entries(handlers)) page.on(event, handler);
  return () => { for (const [event, handler] of Object.entries(handlers)) page.off(event, handler); };
}

async function settle(page, timeoutMs) {
  await page.waitForLoadState("load", { timeout: timeoutMs }).catch(() => undefined);
  await page.waitForFunction(
    () => !document.fonts || document.fonts.status === "loaded",
    undefined,
    { timeout: CAPTURE_SETTLE_TIMEOUTS.fontsMs },
  ).catch(() => undefined);
  await page.waitForTimeout(CAPTURE_SETTLE_TIMEOUTS.visualMs);
}

async function goto(page, options, target, expectedStatus = 200) {
  const response = await page.goto(urlFor(options.baseUrl, target), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  invariant(response?.status() === expectedStatus, `${target} returned HTTP ${response?.status() ?? "none"}; expected ${expectedStatus}`);
}

async function waitForHome(page, options) {
  await page.waitForFunction(() => {
    const mode = document.documentElement.dataset.cinematicMode;
    const media = document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state");
    return mode === "static" || media === "ready" || media?.startsWith("failed");
  }, undefined, { timeout: Math.min(options.timeoutMs, 18_000) }).catch(() => undefined);
}

async function observeState(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector("[data-cinematic-shell]");
    const map = document.querySelector("[data-field-map]");
    const words = [...document.querySelectorAll(".manifesto-word")];
    const backgroundRegions = [...document.querySelectorAll("[data-field-map-background]")];
    const finiteAttribute = (name) => {
      const raw = shell?.getAttribute(name);
      if (raw === null || raw === undefined || raw === "") return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    };
    const finiteProperty = (name) => {
      const raw = shell instanceof HTMLElement ? shell.style.getPropertyValue(name) : "";
      const value = Number(raw);
      return raw.trim() !== "" && Number.isFinite(value) ? value : null;
    };
    return {
      activeElement: document.activeElement?.matches("[data-field-map] summary") ? "field-map-summary" : document.activeElement?.tagName.toLowerCase() ?? null,
      activeElementText: document.activeElement?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null,
      backgroundInert: backgroundRegions.length > 0 && backgroundRegions.every((region) => region.closest("[inert]")),
      bifurcationLinks: document.querySelectorAll("[data-field-map-threshold] nav a[href]").length,
      bifurcationPresent: Boolean(document.querySelector(".bifurcation-field__junction")),
      cinematicMode: root.dataset.cinematicMode ?? null,
      cinematicPhase: shell?.getAttribute("data-cinematic-phase") ?? null,
      cinematicSegment: shell?.getAttribute("data-cinematic-segment") ?? null,
      conceptualCoordinate: finiteAttribute("data-conceptual-coordinate"),
      conceptualFrame: finiteAttribute("data-conceptual-frame"),
      targetFrame: finiteAttribute("data-target-frame"),
      presentedFrame: finiteAttribute("data-presented-frame"),
      blackLevel: finiteProperty("--cinematic-black"),
      blackBreath: finiteProperty("--cinematic-black-breath"),
      fieldMapLinks: map?.querySelectorAll("a[href]").length ?? 0,
      fieldMapOpen: map instanceof HTMLDetailsElement ? map.open : false,
      fieldMapRootOpen: root.hasAttribute("data-field-map-open"),
      h1Count: document.querySelectorAll("main h1").length,
      hash: location.hash,
      horizontalOverflow: Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0) > root.clientWidth + 1,
      manifestoReveal: shell?.getAttribute("data-manifesto-reveal") ?? null,
      manifestoWords: words.length,
      path: location.pathname,
      scrollY: Math.round(scrollY),
      signalField: Boolean(document.querySelector("[data-signal-field]")),
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
}

async function homeGeometry(page) {
  return page.evaluate(() => {
    const entry = document.querySelector("#entry");
    const fieldMap = document.querySelector("[data-field-map-threshold]");
    const shell = document.querySelector("[data-cinematic-shell]");
    const header = document.querySelector(".site-header");
    const shellTop = shell ? shell.getBoundingClientRect().top + scrollY : 0;
    const entryTop = entry ? entry.getBoundingClientRect().top + scrollY : 0;
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    return {
      entry: entryTop,
      fieldMap: fieldMap ? fieldMap.getBoundingClientRect().top + scrollY : 0,
      shellTop,
      headerHeight,
      travel: Math.max(1, entryTop - headerHeight - shellTop),
      maximum: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    };
  });
}

function cinematicTargetY(geometry, progress) {
  return geometry.shellTop + geometry.travel * Math.max(0, Math.min(1, progress));
}

async function nativeWheelTo(page, targetY, timeoutMs, { pause = 80, step = 480 } = {}) {
  const maximum = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  const target = Math.max(0, Math.min(maximum, Math.round(targetY)));
  const started = Date.now();
  let stalled = 0;
  await page.mouse.move(24, 24);
  for (;;) {
    const current = await page.evaluate(() => Math.round(scrollY));
    if (Math.abs(current - target) <= 3) return current;
    invariant(Date.now() - started <= timeoutMs, `native wheel timed out at ${current} while targeting ${target}`);
    const delta = Math.sign(target - current) * Math.min(step, Math.abs(target - current));
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(pause);
    const next = await page.evaluate(() => Math.round(scrollY));
    stalled = next === current ? stalled + 1 : 0;
    invariant(stalled < 8, `native wheel stalled at ${current}`);
  }
}

async function openFieldMap(page) {
  const summary = page.locator("[data-field-map] > summary");
  await summary.focus();
  await summary.press("Enter");
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-field-map-open"));
}

async function completeThresholdEntry(page, options) {
  await goto(page, options, "/");
  await waitForHome(page, options);
  const geometry = await homeGeometry(page);
  const states = { initial: await observeState(page) };
  await nativeWheelTo(page, cinematicTargetY(geometry, 0.86), options.timeoutMs, { pause: 105, step: 360 });
  states.latePhysical = await observeState(page);
  await page.waitForTimeout(1_200);
  await nativeWheelTo(page, cinematicTargetY(geometry, 0.94), options.timeoutMs, { pause: 110, step: 180 });
  states.threshold = await observeState(page);
  await page.waitForTimeout(1_200);
  await nativeWheelTo(page, cinematicTargetY(geometry, 1), options.timeoutMs, { pause: 120, step: 100 });
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: 5_000 }).catch(() => undefined);
  states.manifesto = await observeState(page);
  await nativeWheelTo(page, Math.min(geometry.maximum, geometry.fieldMap), options.timeoutMs, { pause: 90, step: 320 });
  states.signalField = await observeState(page);
  return states;
}

async function completeReverse(page, options) {
  await goto(page, options, "/#entry");
  await waitForHome(page, options);
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: 5_000 }).catch(() => undefined);
  const states = { settled: await observeState(page) };
  const geometry = await homeGeometry(page);
  for (const [name, progress] of [
    ["entry", 0.96],
    ["digitalBlack", 0.902],
    ["physicalThreshold", 0.86],
    ["qHold", 0.512],
    ["raster", 0.47],
    ["line", 0.424],
    ["physical", 0.20],
    ["top", 0],
  ]) {
    await nativeWheelTo(page, cinematicTargetY(geometry, progress), options.timeoutMs, { pause: 105, step: 340 });
    await page.waitForTimeout(550);
    states[name] = await observeState(page);
  }
  return states;
}

function stableStopSignature(state) {
  return JSON.stringify({
    scrollY: state?.scrollY,
    cinematicPhase: state?.cinematicPhase,
    cinematicSegment: state?.cinematicSegment,
    conceptualCoordinate: state?.conceptualCoordinate,
    conceptualFrame: state?.conceptualFrame,
    targetFrame: state?.targetFrame,
    manifestoReveal: state?.manifestoReveal,
  });
}

async function captureStableStop(page, dwellMs = 4_100) {
  const arrival = await observeState(page);
  await page.waitForTimeout(dwellMs);
  const postDwell = await observeState(page);
  return { ...arrival, arrival, postDwell, dwellMs };
}

async function stopStates(page, options) {
  await goto(page, options, "/");
  await waitForHome(page, options);
  const geometry = await homeGeometry(page);
  const states = {};
  const stops = [
    ["physicalThreshold", 0.86],
    ["digitalBlack", 0.902],
    ["breach", 0.93],
    ["partialManifesto", 0.97],
  ];
  for (const [name, progress] of stops) {
    await nativeWheelTo(page, cinematicTargetY(geometry, progress), options.timeoutMs, { pause: 100, step: 190 });
    if (progress >= 0.922) {
      await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: 5_000 }).catch(() => undefined);
    } else await page.waitForTimeout(180);
    states[name] = await captureStableStop(page);
  }
  await nativeWheelTo(page, cinematicTargetY(geometry, 1), options.timeoutMs, { pause: 100, step: 150 });
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: 5_000 }).catch(() => undefined);
  states.completedManifesto = await captureStableStop(page);
  await nativeWheelTo(page, Math.min(geometry.maximum, geometry.fieldMap), options.timeoutMs, { pause: 90, step: 300 });
  await openFieldMap(page);
  states.openFieldMap = await observeState(page);
  await page.waitForTimeout(2_100);
  await page.keyboard.press("Tab");
  states.fieldMapKeyboard = await observeState(page);
  await page.waitForTimeout(1_500);
  await page.keyboard.press("Escape");
  states.fieldMapEscape = await observeState(page);
  await page.waitForTimeout(1_500);
  return states;
}

async function homeIntent(page, options) {
  await goto(page, options, "/about/");
  const states = { supporting: await observeState(page) };
  await page.waitForTimeout(1_000);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/" && url.hash === "#entry", { timeout: options.timeoutMs }),
    page.locator('a.brand-link[href="/#entry"]').first().click({ timeout: options.timeoutMs }),
  ]);
  await settle(page, options.timeoutMs);
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: 5_000 }).catch(() => undefined);
  states.entryIntent = await observeState(page);
  await page.waitForTimeout(2_000);
  await nativeWheelTo(page, 0, options.timeoutMs, { pause: 100, step: 360 });
  states.reverseAccess = await observeState(page);
  return states;
}

async function responsiveAuthority(page, options) {
  await goto(page, options, "/#entry");
  await waitForHome(page, options);
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved" || document.documentElement.dataset.cinematicMode === "static", undefined, { timeout: Math.min(options.timeoutMs, 15_000) }).catch(() => undefined);
  const states = {};
  const viewports = [
    { id: "desktop-1440x900", width: 1440, height: 900 },
    { id: "short-desktop-1366x650", width: 1366, height: 650 },
    { id: "tablet-portrait-768x1024", width: 768, height: 1024 },
    { id: "mobile-390x844", width: 390, height: 844 },
    { id: "narrow-320x800", width: 320, height: 800 },
    { id: "mobile-landscape-844x390", width: 844, height: 390 },
    ...RESPONSIVE_GEOMETRY_VIEWPORTS,
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await settle(page, options.timeoutMs);
    states[viewport.id] = await observeState(page);
    if (viewport.id.startsWith("r1-")) {
      states[viewport.id].manifestoGeometry = responsiveGeometryResult(await page.evaluate(measureManifestoGeometry));
      validateResponsiveGeometryState(states[viewport.id], viewport.id);
    }
    await page.waitForTimeout(2_200);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await goto(page, options, "/");
  await waitForHome(page, options);
  const geometry = await homeGeometry(page);
  await nativeWheelTo(page, geometry.entry * 0.965, options.timeoutMs, { pause: 95, step: 240 });
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, options.timeoutMs);
  states.resizeDuringBreach = await observeState(page);
  await nativeWheelTo(page, (await homeGeometry(page)).entry, options.timeoutMs, { pause: 100, step: 180 });
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: 5_000 }).catch(() => undefined);
  await page.setViewportSize({ width: 844, height: 390 });
  await settle(page, options.timeoutMs);
  states.resizeAfterManifesto = await observeState(page);
  return states;
}

async function reducedMotionSegment(page, options) {
  await goto(page, options, "/");
  const states = { staticHome: await observeState(page) };
  states.staticHome.manifestoGeometry = await page.evaluate(measureManifestoGeometry);
  states.staticHome.manifestoVisibility = validateFallbackManifestoMeasurement(states.staticHome.manifestoGeometry, "reduced-motion recording manifesto");
  await page.waitForTimeout(3_500);
  await goto(page, options, "/about/");
  await openFieldMap(page);
  states.fieldMap = await observeState(page);
  await page.waitForTimeout(3_500);
  return states;
}

async function noJavaScriptSegment(page, options) {
  await goto(page, options, "/#entry");
  const states = { entry: await observeState(page) };
  states.entry.manifestoGeometry = await page.evaluate(measureManifestoGeometry);
  states.entry.manifestoVisibility = validateFallbackManifestoMeasurement(states.entry.manifestoGeometry, "no-JavaScript recording manifesto");
  await page.waitForTimeout(3_500);
  const summary = page.locator("[data-field-map] > summary");
  await summary.click();
  states.nativeFieldMap = await observeState(page);
  states.nativeFieldMap.linkInventory = await captureVisibleLinkInventory(page, "[data-field-map] a[href]");
  assertVisibleLinkInventory(states.nativeFieldMap.linkInventory, NO_JS_FIELD_MAP_DESTINATIONS, "no-JavaScript recording Field Map links");
  states.nativeFieldMap.nativePlane = await page.evaluate(() => {
    const map = document.querySelector("[data-field-map]");
    const plane = map?.querySelector(".field-map__plane");
    const bounds = plane?.getBoundingClientRect();
    const style = plane ? getComputedStyle(plane) : null;
    return {
      enhancedController: map?.getAttribute("data-controller") ?? null,
      nativeDetailsOpen: map instanceof HTMLDetailsElement ? map.open : false,
      viewport: { width: innerWidth, height: innerHeight },
      plane: bounds && style ? {
        position: style.position,
        visible: style.display !== "none" && !["collapse", "hidden"].includes(style.visibility) && Number.parseFloat(style.opacity) > 0,
        bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height },
      } : null,
    };
  });
  assertNativeFieldMapViewport(states.nativeFieldMap.nativePlane);
  await page.waitForTimeout(3_500);
  return states;
}

async function typography(page, options, runtime) {
  await page.setContent(runtime.typographyHtml, { waitUntil: "load", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  const candidates = await page.locator("[data-candidate]").count();
  invariant(candidates === TYPOGRAPHY_SOURCE_SPECS.length, "portable typography specimen candidate count differs");
  const states = { candidates, initial: await page.evaluate(() => document.querySelector("[data-candidate]")?.getAttribute("data-candidate")) };
  for (let index = 1; index <= TYPOGRAPHY_SOURCE_SPECS.length; index += 1) {
    const candidate = page.locator("[data-candidate]").nth(index - 1);
    const top = await candidate.evaluate((node) => node.getBoundingClientRect().top + scrollY);
    await nativeWheelTo(page, top, options.timeoutMs, { pause: 90, step: 420 });
    states[`candidate${index}`] = await candidate.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return {
        label: node.getAttribute("data-candidate"),
        visible: bounds.bottom > 0 && bounds.top < innerHeight,
      };
    });
    await page.waitForTimeout(3_300);
  }
  await nativeWheelTo(page, 0, options.timeoutMs, { pause: 80, step: 520 });
  return states;
}

const SCENARIO_ACTIONS = Object.freeze({
  "complete-threshold-entry": completeThresholdEntry,
  "complete-reverse": completeReverse,
  "stop-states": stopStates,
  "home-intent": homeIntent,
  "responsive-authority": responsiveAuthority,
  typography,
});

function scenarioSegments(scenario) {
  if (scenario === "reduced-motion-and-no-js") return [
    { id: "reduced-motion", context: { reducedMotion: "reduce" }, action: reducedMotionSegment },
    { id: "no-javascript", context: { javaScriptEnabled: false }, action: noJavaScriptSegment },
  ];
  const action = SCENARIO_ACTIONS[scenario];
  invariant(action, `recording action is missing: ${scenario}`);
  return [{ id: scenario, context: {}, action }];
}

export function recordingBrowserLaunchPlan() {
  return Object.freeze(CAPTURE_RECORDING_SPECS.flatMap((authority) => (
    scenarioSegments(authority.scenario).map((segment) => Object.freeze({
      engine: authority.engine,
      scenario: authority.scenario,
      segment: segment.id,
      sessionId: authority.engine === "firefox"
        ? `firefox:${authority.scenario}:${segment.id}`
        : "chromium:shared",
    }))
  )));
}

function orderedNonIncreasing(values) {
  return values.every((value, index) => Number.isFinite(value) && (index === 0 || value <= values[index - 1]));
}

function stateCoordinateWithin(state, minimum, maximum, label) {
  invariant(Number.isFinite(state?.conceptualCoordinate)
    && state.conceptualCoordinate >= minimum
    && state.conceptualCoordinate <= maximum,
  `${label} conceptual coordinate is outside ${minimum}-${maximum}`);
}

function assertCinematicState(state, expectation, label) {
  invariant(state && state.cinematicPhase === expectation.phase, `${label} cinematic phase differs`);
  if (expectation.segment instanceof RegExp) invariant(expectation.segment.test(state.cinematicSegment ?? ""), `${label} cinematic segment differs`);
  else invariant(state.cinematicSegment === expectation.segment, `${label} cinematic segment differs`);
  stateCoordinateWithin(state, expectation.minimum, expectation.maximum, label);
  invariant(Number.isFinite(state.conceptualFrame)
    && state.conceptualFrame >= Math.floor(expectation.minimum) + 1
    && state.conceptualFrame <= Math.min(540, Math.floor(expectation.maximum) + 1),
  `${label} conceptual frame differs`);
  if (expectation.targetMinimum !== undefined) invariant(Number.isFinite(state.targetFrame)
    && state.targetFrame >= expectation.targetMinimum
    && state.targetFrame <= expectation.targetMaximum,
  `${label} physical target frame differs`);
  if (expectation.reveal) invariant(expectation.reveal.includes(state.manifestoReveal), `${label} manifesto reveal differs`);
}

function assertStableStopRecord(record, label) {
  invariant(record?.dwellMs >= 4_000 && record.arrival && record.postDwell, `${label} lacks arrival/post-dwell stability evidence`);
  invariant(stableStopSignature(record.arrival) === stableStopSignature(record.postDwell), `${label} changed phase, coordinate, frame, reveal, or scroll during the dwell`);
}

export function validateScenarioStates(scenario, segments, { manifestoValidator = validateManifestoGeometry } = {}) {
  invariant(segments && typeof segments === "object" && !Array.isArray(segments), `${scenario} scenario states are missing`);
  if (scenario === "complete-threshold-entry") {
    const states = segments[scenario];
    invariant(states?.initial?.path === "/" && states.initial.signalField === true, "threshold entry did not begin on the Signal Field home");
    invariant(states?.latePhysical?.scrollY > 0 && states?.threshold?.scrollY >= states.latePhysical.scrollY, "threshold entry did not traverse the late physical opening");
    assertCinematicState(states.initial, { phase: "physical", segment: "top-dormancy", minimum: 0, maximum: 0, targetMinimum: 1, targetMaximum: 1, reveal: ["hidden"] }, "threshold entry initial F1");
    assertCinematicState(states.latePhysical, { phase: "physical", segment: "physical-threshold", minimum: 480, maximum: 499.9999, targetMinimum: 481, targetMaximum: 500, reveal: ["hidden"] }, "threshold entry physical threshold");
    assertCinematicState(states.threshold, { phase: "entry", segment: "entry-reveal", minimum: 513, maximum: 539.9999, targetMinimum: 500, targetMaximum: 500, reveal: ["armed", "revealing", "resolved"] }, "threshold entry reveal");
    assertCinematicState(states.manifesto, { phase: "settled", segment: "entry-reveal", minimum: 539.5, maximum: 540, targetMinimum: 500, targetMaximum: 500, reveal: ["resolved"] }, "threshold entry settled manifesto");
    invariant(states?.manifesto?.manifestoReveal === "resolved" && states.manifesto.manifestoWords === 7, "threshold entry did not resolve the complete manifesto");
    assertCinematicState(states.signalField, { phase: "settled", segment: "entry-reveal", minimum: 539.5, maximum: 540, targetMinimum: 500, targetMaximum: 500, reveal: ["resolved"] }, "threshold entry downstream Signal Field");
    invariant(states?.signalField?.signalField === true && states.signalField.fieldMapLinks === 8 && states.signalField.bifurcationPresent === true && states.signalField.bifurcationLinks === 2, "threshold entry did not reach the Signal Field bifurcation / Field Map availability");
  } else if (scenario === "complete-reverse") {
    const states = segments[scenario];
    invariant(states?.settled?.manifestoReveal === "resolved", "reverse recording did not begin at the settled manifesto");
    assertCinematicState(states.settled, { phase: "settled", segment: "entry-reveal", minimum: 539.5, maximum: 540, targetMinimum: 500, targetMaximum: 500, reveal: ["resolved"] }, "reverse settled origin");
    assertCinematicState(states.entry, { phase: "entry", segment: "entry-reveal", minimum: 513, maximum: 539.9999, targetMinimum: 500, targetMaximum: 500, reveal: ["armed", "revealing", "resolved"] }, "reverse entry reveal");
    assertCinematicState(states.digitalBlack, { phase: "black", segment: "digital-breathing", minimum: 500, maximum: 512.9999, targetMinimum: 500, targetMaximum: 500, reveal: ["hidden"] }, "reverse digital black");
    assertCinematicState(states.physicalThreshold, { phase: "physical", segment: "physical-threshold", minimum: 480, maximum: 499.9999, targetMinimum: 481, targetMaximum: 500, reveal: ["hidden"] }, "reverse physical threshold");
    assertCinematicState(states.qHold, { phase: "physical", segment: "q-hold", minimum: 369, maximum: 404.9999, targetMinimum: 370, targetMaximum: 405, reveal: ["hidden"] }, "reverse Q hold");
    assertCinematicState(states.raster, { phase: "physical", segment: /raster-(?:expansion|settling)/, minimum: 315, maximum: 354.9999, targetMinimum: 316, targetMaximum: 355, reveal: ["hidden"] }, "reverse raster");
    assertCinematicState(states.line, { phase: "physical", segment: "phosphor-line", minimum: 299, maximum: 314.9999, targetMinimum: 300, targetMaximum: 315, reveal: ["hidden"] }, "reverse phosphor line");
    assertCinematicState(states.physical, { phase: "physical", segment: /current-orbit|crt-arrival|indicator/, minimum: 45, maximum: 298.9999, targetMinimum: 46, targetMaximum: 299, reveal: ["hidden"] }, "reverse physical film");
    assertCinematicState(states.top, { phase: "physical", segment: "top-dormancy", minimum: 0, maximum: 0, targetMinimum: 1, targetMaximum: 1, reveal: ["hidden"] }, "reverse F1 top");
    invariant(orderedNonIncreasing([states.entry, states.digitalBlack, states.physicalThreshold, states.qHold, states.raster, states.line, states.physical, states.top].map(({ conceptualCoordinate }) => conceptualCoordinate)), "reverse conceptual state order differs");
    invariant(states?.top?.scrollY === 0 && states.top.manifestoReveal === "hidden", "reverse recording did not return to the physical top");
  } else if (scenario === "stop-states") {
    const states = segments[scenario];
    for (const key of ["physicalThreshold", "digitalBlack", "breach", "partialManifesto", "completedManifesto", "openFieldMap", "fieldMapKeyboard", "fieldMapEscape"]) invariant(states?.[key], `stop-state recording misses ${key}`);
    for (const key of ["physicalThreshold", "digitalBlack", "breach", "partialManifesto", "completedManifesto"]) assertStableStopRecord(states[key], `stop-state ${key}`);
    assertCinematicState(states.physicalThreshold.arrival, { phase: "physical", segment: "physical-threshold", minimum: 480, maximum: 499.9999, targetMinimum: 481, targetMaximum: 500, reveal: ["hidden"] }, "stable physical threshold");
    assertCinematicState(states.digitalBlack.arrival, { phase: "black", segment: "digital-breathing", minimum: 500, maximum: 512.9999, targetMinimum: 500, targetMaximum: 500, reveal: ["hidden"] }, "stable digital black");
    assertCinematicState(states.breach.arrival, { phase: "entry", segment: "entry-reveal", minimum: 513, maximum: 529, targetMinimum: 500, targetMaximum: 500, reveal: ["resolved"] }, "stable breach");
    assertCinematicState(states.partialManifesto.arrival, { phase: "entry", segment: "entry-reveal", minimum: 529, maximum: 539.9999, targetMinimum: 500, targetMaximum: 500, reveal: ["resolved"] }, "stable partial-manifesto coordinate");
    assertCinematicState(states.completedManifesto.arrival, { phase: "settled", segment: "entry-reveal", minimum: 539.5, maximum: 540, targetMinimum: 500, targetMaximum: 500, reveal: ["resolved"] }, "stable completed manifesto");
    const distinctStops = ["physicalThreshold", "digitalBlack", "breach", "partialManifesto"].map((key) => stableStopSignature(states[key].arrival));
    invariant(new Set(distinctStops).size === distinctStops.length, "stop-state named stops are materially identical");
    invariant(states.completedManifesto.manifestoReveal === "resolved", "stop-state recording misses the completed manifesto");
    invariant(states.openFieldMap.fieldMapOpen === true && states.openFieldMap.fieldMapRootOpen === true && states.openFieldMap.fieldMapLinks === 8 && states.openFieldMap.backgroundInert === true, "stop-state recording misses the semantically isolated open Field Map");
    invariant(states.fieldMapKeyboard.fieldMapOpen === true && states.fieldMapKeyboard.activeElement === "a", "stop-state recording misses keyboard movement through the Field Map");
    invariant(states.fieldMapEscape.fieldMapOpen === false && states.fieldMapEscape.fieldMapRootOpen === false && states.fieldMapEscape.activeElement === "field-map-summary" && states.fieldMapEscape.backgroundInert === false, "stop-state recording misses Escape closure, focus return, or inert restoration");
  } else if (scenario === "home-intent") {
    const states = segments[scenario];
    invariant(states?.supporting?.path === "/about/", "Home intent did not begin on a supporting route");
    invariant(states?.entryIntent?.path === "/" && states.entryIntent.hash === "#entry" && states.entryIntent.manifestoReveal === "resolved", "Home intent did not resolve at /#entry");
    assertCinematicState(states.reverseAccess, { phase: "physical", segment: "top-dormancy", minimum: 0, maximum: 0, targetMinimum: 1, targetMaximum: 1, reveal: ["hidden"] }, "Home intent reverse F1 access");
    invariant(states?.reverseAccess?.scrollY === 0 && states.reverseAccess.signalField === true, "Home intent did not retain reverse access to the physical opening");
  } else if (scenario === "responsive-authority") {
    const states = segments[scenario];
    for (const id of ["desktop-1440x900", "short-desktop-1366x650", "tablet-portrait-768x1024", "mobile-390x844", "narrow-320x800", "mobile-landscape-844x390"]) {
      invariant(states?.[id]?.signalField === true && states[id].manifestoWords === 7 && states[id].horizontalOverflow === false, `responsive recording misses coherent ${id}`);
    }
    for (const { id } of RESPONSIVE_GEOMETRY_VIEWPORTS) {
      invariant(states?.[id]?.signalField === true, `responsive recording misses Signal Field ${id}`);
      validateResponsiveGeometryState(states[id], id, manifestoValidator);
    }
    invariant(states?.resizeDuringBreach?.signalField === true && states?.resizeAfterManifesto?.signalField === true && states.resizeAfterManifesto.manifestoReveal === "resolved", "responsive recording misses live resize states");
  } else if (scenario === "reduced-motion-and-no-js") {
    const reduced = segments["reduced-motion"];
    const noJavaScript = segments["no-javascript"];
    invariant(reduced?.staticHome?.cinematicMode === "static" && reduced.staticHome.signalField === true && reduced.staticHome.manifestoVisibility?.status === "PASS", "reduced-motion recording misses the measured static Signal Field alternative");
    invariant(reduced?.fieldMap?.fieldMapOpen === true && reduced.fieldMap.fieldMapLinks === 8, "reduced-motion recording misses the Field Map");
    invariant(reduced?.evidenceNetwork?.cinematicRequests === 0, "reduced-motion recording made a cinematic media request");
    invariant(noJavaScript?.entry?.signalField === true && noJavaScript.entry.manifestoWords === 7 && noJavaScript.entry.manifestoVisibility?.status === "PASS", "no-JavaScript recording misses measured complete semantic Home content");
    invariant(noJavaScript?.nativeFieldMap?.fieldMapOpen === true && noJavaScript.nativeFieldMap.fieldMapLinks === 8, "no-JavaScript recording misses native Field Map navigation");
    assertVisibleLinkInventory(noJavaScript.nativeFieldMap.linkInventory, NO_JS_FIELD_MAP_DESTINATIONS, "no-JavaScript recording Field Map links");
    assertNativeFieldMapViewport(noJavaScript.nativeFieldMap.nativePlane);
    invariant(noJavaScript?.evidenceNetwork?.cinematicRequests === 0, "no-JavaScript recording made a cinematic media request");
  } else if (scenario === "typography") {
    const states = segments[scenario];
    invariant(states?.candidates === TYPOGRAPHY_SOURCE_SPECS.length, "typography recording candidate count differs");
    const labels = TYPOGRAPHY_SOURCE_SPECS.map(({ label }) => label);
    invariant(labels.every((label, index) => states[`candidate${index + 1}`]?.label === label && states[`candidate${index + 1}`]?.visible === true), "typography recording did not traverse every portable specimen candidate");
  } else throw new Error(`unsupported recording scenario: ${scenario}`);
  return true;
}

async function recordRawSegment(browser, engine, authority, segment, options, staging, runtime, ledger, targetSeconds) {
  const rawRelative = `.capture-work/${engine}/${authority.scenario}/${segment.id}`;
  const rawDirectory = path.resolve(staging, ...rawRelative.split("/"));
  invariant(within(staging, rawDirectory), "raw recording directory escaped staging");
  await mkdir(rawDirectory, { recursive: true });
  const context = await browser.newContext({
    colorScheme: "dark",
    recordVideo: { dir: rawDirectory, size: { width: RECORDING_VIEW.width, height: RECORDING_VIEW.height } },
    serviceWorkers: "block",
    viewport: { width: RECORDING_VIEW.width, height: RECORDING_VIEW.height },
    ...segment.context,
  });
  await installNetworkGuard(context, options.baseUrl, ledger);
  const page = await context.newPage();
  const detach = attachDiagnostics(page, ledger, `recording:${engine}:${authority.scenario}:${segment.id}`);
  const requestPaths = [];
  const observeRequest = (request) => requestPaths.push(safeRequestUrl(request.url()));
  page.on("request", observeRequest);
  const video = page.video();
  const started = Date.now();
  let states;
  try {
    states = await segment.action(page, options, runtime);
    const remaining = Math.ceil((targetSeconds * 1_000) - (Date.now() - started));
    if (remaining > 0) await page.waitForTimeout(remaining);
  } finally {
    page.off("request", observeRequest);
    detach();
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
  const rawFile = await video.path();
  invariant(within(staging, rawFile), "Playwright raw recording escaped external staging");
  return {
    network: {
      cinematicRequests: requestPaths.filter((requestPath) => /\/media\/cinematic\/phase-4r2\/media\/[^?#]+\.mp4(?:[?#]|$)/i.test(requestPath)).length,
      requests: requestPaths.length,
    },
    rawFile,
    states,
  };
}

async function runCommand(command, args, label) {
  try {
    return await execFileAsync(command, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`${label} failed: ${String(error.stderr || error.message).slice(0, 4_000)}`);
  }
}

async function probeRecording(ffprobe, file) {
  const { stdout } = await runCommand(ffprobe, [
    "-v", "error", "-count_frames",
    "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,duration,nb_read_frames:format=format_name,duration",
    "-of", "json", file,
  ], "FFprobe recording validation");
  try { return JSON.parse(stdout); } catch { throw new Error("FFprobe returned invalid JSON"); }
}

async function normalizeRecording(tools, staging, authority, rawFiles) {
  const destination = ownedPath(staging, authority.relativePath, "recording destination");
  const partialRelative = `${authority.relativePath}.partial.mp4`;
  const partial = path.resolve(staging, ...partialRelative.split("/"));
  invariant(within(staging, partial), "recording partial escaped staging");
  await mkdir(path.dirname(destination), { recursive: true });
  await runCommand(tools.ffmpeg.command, encoderArguments(rawFiles, partial), `FFmpeg normalization for ${authority.engine}/${authority.scenario}`);
  await runCommand(tools.ffmpeg.command, fullDecodeArguments(partial), `FFmpeg full decode for ${authority.engine}/${authority.scenario}`);
  const probe = await probeRecording(tools.ffprobe.command, partial);
  const validation = recordingContractResult(probe, authority, { fullDecodePassed: true });
  invariant(validation.status === "PASS", `${authority.relativePath} media contract failed: ${validation.failures.join(", ")}`);
  await rename(partial, destination);
  return {
    ...authority,
    failures: [],
    media: validation.media,
    status: "PASS",
    validationChecks: validation.checks,
  };
}

async function captureRecordingsForEngine({
  browserAuthority,
  engine,
  ledger,
  options,
  runtime,
  sharedBrowser = null,
  staging,
  tools,
}) {
  const records = [];
  const browserVersions = new Set();
  let browserLaunches = sharedBrowser ? 1 : 0;
  if (sharedBrowser) browserVersions.add(sharedBrowser.version());
  for (const authority of CAPTURE_RECORDING_SPECS.filter((record) => record.engine === engine)) {
    const segments = scenarioSegments(authority.scenario);
    const targetSeconds = (authority.minimumSeconds + 1.5) / segments.length;
    const raw = [];
    const states = {};
    for (const segment of segments) {
      let browser = sharedBrowser;
      const ownsBrowser = !browser;
      if (ownsBrowser) {
        browser = await browserAuthority.browserType.launch({ executablePath: browserAuthority.executablePath, headless: !options.headed });
        browserLaunches += 1;
        browserVersions.add(browser.version());
      }
      let result;
      try {
        result = await recordRawSegment(browser, engine, authority, segment, options, staging, runtime, ledger, targetSeconds);
      } finally {
        if (ownsBrowser) await browser.close().catch(() => undefined);
      }
      raw.push(result.rawFile);
      states[segment.id] = { ...result.states, evidenceNetwork: result.network };
    }
    validateScenarioStates(authority.scenario, states);
    const normalized = await normalizeRecording(tools, staging, authority, raw);
    records.push({ ...normalized, scenarioValidation: "PASS", states });
  }
  return { browserLaunches, browserVersions: [...browserVersions], records };
}

function pngDimensions(bytes) {
  invariant(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "screenshot is not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function screenshotState(page) {
  const state = await observeState(page);
  const targets = await page.evaluate(() => [...document.querySelectorAll("a[href],button,summary")].filter((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  }).map((node) => {
    const rect = node.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  }));
  return { ...state, targetFailures: targets.filter(({ width, height }) => width < 44 || height < 44).length };
}

async function prepareScreenshotState(page, options, spec) {
  if (spec.mode === "core-resolved") {
    await goto(page, options, "/#entry");
    await waitForHome(page, options);
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved" || document.documentElement.dataset.cinematicMode === "static", undefined, { timeout: Math.min(options.timeoutMs, 15_000) }).catch(() => undefined);
  } else if (spec.mode === "reduced-motion") {
    await goto(page, options, "/");
  } else if (spec.mode === "no-javascript") {
    await goto(page, options, "/");
  } else if (spec.mode === "no-javascript-entry") {
    await goto(page, options, "/#entry");
  } else if (spec.mode === "fallback-fonts") {
    await goto(page, options, "/#entry");
  } else if (spec.mode.startsWith("field-map")) {
    await goto(page, options, "/about/");
    await openFieldMap(page);
    if (spec.mode === "field-map-focus-return") {
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.documentElement.hasAttribute("data-field-map-open"));
    }
  }
  await settle(page, options.timeoutMs);
  const state = await screenshotState(page);
  if (["core-resolved", "reduced-motion", "no-javascript", "no-javascript-entry", "fallback-fonts"].includes(spec.mode)) {
    state.manifestoGeometry = await page.evaluate(measureManifestoGeometry);
    state.manifestoVisibility = validateFallbackManifestoMeasurement(state.manifestoGeometry, `${spec.id} screenshot manifesto`);
  }
  const ordinary = state.h1Count === 1 && !state.horizontalOverflow;
  if (spec.mode === "core-resolved") invariant(ordinary && state.manifestoVisibility.status === "PASS" && state.signalField && state.manifestoWords === 7 && (state.manifestoReveal === "resolved" || state.cinematicMode === "static"), `${spec.id} core Signal Field state differs`);
  else if (spec.mode === "reduced-motion") invariant(ordinary && state.manifestoVisibility.status === "PASS" && state.cinematicMode === "static" && state.fieldMapLinks === 8, `${spec.id} reduced-motion state differs`);
  else if (spec.mode.startsWith("no-javascript")) invariant(ordinary && state.manifestoVisibility.status === "PASS" && state.signalField && state.manifestoWords === 7 && state.fieldMapLinks === 8, `${spec.id} no-JavaScript state differs`);
  else if (spec.mode === "fallback-fonts") invariant(ordinary && state.manifestoVisibility.status === "PASS" && state.manifestoWords === 7, `${spec.id} fallback-font state differs`);
  else if (spec.mode === "field-map-open") invariant(ordinary && state.fieldMapOpen && state.fieldMapRootOpen && state.fieldMapLinks === 8, `${spec.id} open Field Map state differs`);
  else if (spec.mode === "field-map-focus-return") invariant(ordinary && !state.fieldMapOpen && !state.fieldMapRootOpen && state.activeElement === "field-map-summary", `${spec.id} Field Map focus return differs`);
  return state;
}

async function captureScreenshots(browser, options, staging, ledger) {
  const records = [];
  for (const spec of SCREENSHOT_SPECS) {
    const contextOptions = {
      colorScheme: "dark",
      serviceWorkers: "block",
      viewport: { width: spec.width, height: spec.height },
    };
    if (spec.mode === "reduced-motion") contextOptions.reducedMotion = "reduce";
    if (spec.mode.startsWith("no-javascript")) contextOptions.javaScriptEnabled = false;
    const context = await browser.newContext(contextOptions);
    await installNetworkGuard(context, options.baseUrl, ledger, { blockFonts: spec.mode === "fallback-fonts" });
    const page = await context.newPage();
    const detach = attachDiagnostics(page, ledger, `screenshot:${spec.id}`);
    const requestPaths = [];
    const observeRequest = (request) => requestPaths.push(safeRequestUrl(request.url()));
    page.on("request", observeRequest);
    try {
      const state = await prepareScreenshotState(page, options, spec);
      const network = {
        cinematicRequests: requestPaths.filter((requestPath) => /\/media\/cinematic\/phase-4r2\/media\/[^?#]+\.mp4(?:[?#]|$)/i.test(requestPath)).length,
        requests: requestPaths.length,
      };
      if (spec.mode === "reduced-motion" || spec.mode.startsWith("no-javascript")) invariant(network.cinematicRequests === 0, `${spec.id} made a cinematic media request`);
      const destination = ownedPath(staging, spec.relativePath, "screenshot destination");
      await mkdir(path.dirname(destination), { recursive: true });
      await page.screenshot({ animations: "disabled", caret: "hide", path: destination, scale: "css", type: "png" });
      const dimensions = pngDimensions(await readFile(destination));
      invariant(dimensions.width === spec.width && dimensions.height === spec.height, `${spec.relativePath} dimensions differ`);
      records.push({ ...spec, ...dimensions, engine: "chromium", evidenceClass: "BROWSER ENGINE", network, state, status: "PASS" });
    } finally {
      page.off("request", observeRequest);
      detach();
      await context.close().catch(() => undefined);
    }
  }
  return records;
}

async function walkFiles(root, directory = root) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.resolve(directory, entry.name);
    invariant(within(root, candidate), "artifact walk escaped the external capture root");
    if (entry.isDirectory()) output.push(...await walkFiles(root, candidate));
    else if (entry.isFile()) output.push(relativePosix(root, candidate));
    else throw new Error(`unsupported filesystem entry in capture: ${relativePosix(root, candidate)}`);
  }
  return output.sort((left, right) => left.localeCompare(right));
}

export async function validateTopology(directory, { includeManifest = true } = {}) {
  const expected = expectedArtifactPaths().filter((relativePath) => includeManifest || relativePath !== MANIFEST_PATH);
  const actual = await walkFiles(directory);
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `capture topology differs: expected ${expected.length}, observed ${actual.length}`);
  invariant(!actual.some((relativePath) => STALE_PHASE_PATH.test(relativePath)), "capture topology contains a stale Phase 6 path");
  invariant(!actual.some((relativePath) => /(?:^|\/)\.capture-work(?:\/|$)|\.(?:webm|partial\.mp4)$/i.test(relativePath)), "raw or partial recording remains in published topology");
  return true;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileLedger(staging) {
  const paths = (await walkFiles(staging)).filter((relativePath) => relativePath !== MANIFEST_PATH);
  const records = [];
  for (const relativePath of paths) {
    const absolute = ownedPath(staging, relativePath, "manifest artifact");
    const bytes = await readFile(absolute);
    records.push({ bytes: bytes.length, relativePath, sha256: sha256(bytes) });
  }
  validateManifestLedger(records);
  return records;
}

function assertPrivacySafe(value) {
  const serialized = JSON.stringify(value);
  invariant(!PRIVATE_TEXT.test(serialized), "evidence manifest contains a private path or secret-like value");
  return true;
}

export function dryRunReport(options) {
  validateOptions(options);
  const plan = capturePlan();
  return {
    baseUrl: options.baseUrl,
    engines: plan.engines,
    outputPolicy: "fresh durable external directory; dry-run performs no writes",
    recordings: plan.recordings.map(({ engine, scenario, relativePath, minimumSeconds, maximumSeconds }) => ({ engine, scenario, relativePath, minimumSeconds, maximumSeconds })),
    revision: options.revision,
    schema: SCHEMA,
    screenshots: plan.screenshots,
    status: "DRY-RUN",
    topology: plan.topology,
  };
}

export function runSelfTest() {
  const paths = expectedArtifactPaths();
  invariant(CAPTURE_RECORDING_SPECS.length === 14, "self-test recording count differs");
  invariant(new Set(CAPTURE_RECORDING_SPECS.map(({ engine }) => engine)).size === 2, "self-test recording engines differ");
  invariant(new Set(CAPTURE_RECORDING_SPECS.map(({ scenario }) => scenario)).size === 7, "self-test recording scenarios differ");
  invariant(CORE_VIEWPORTS.length === 13 && SCREENSHOT_SPECS.filter(({ group }) => group === "core").length === 13, "self-test core screenshot coverage differs");
  invariant(SCREENSHOT_SPECS.some(({ mode }) => mode === "reduced-motion") && SCREENSHOT_SPECS.some(({ mode }) => mode === "no-javascript") && SCREENSHOT_SPECS.some(({ mode }) => mode === "fallback-fonts"), "self-test fallback screenshot coverage differs");
  invariant(SCREENSHOT_SPECS.some(({ mode }) => mode === "field-map-open") && SCREENSHOT_SPECS.some(({ mode }) => mode === "field-map-focus-return"), "self-test Field Map screenshot coverage differs");
  invariant(new Set(paths).size === paths.length && !paths.some((value) => STALE_PHASE_PATH.test(value)), "self-test topology is duplicate or stale");
  for (const scenario of new Set(CAPTURE_RECORDING_SPECS.map(({ scenario }) => scenario))) invariant(scenarioSegments(scenario).length >= 1, `self-test scenario action differs: ${scenario}`);
  const browserLaunches = recordingBrowserLaunchPlan();
  const chromiumLaunches = browserLaunches.filter(({ engine }) => engine === "chromium");
  const firefoxLaunches = browserLaunches.filter(({ engine }) => engine === "firefox");
  invariant(browserLaunches.length === 16 && chromiumLaunches.length === 8 && firefoxLaunches.length === 8, "self-test recording segment count differs");
  invariant(new Set(chromiumLaunches.map(({ sessionId }) => sessionId)).size === 1, "self-test Chromium shared-browser policy differs");
  invariant(new Set(firefoxLaunches.map(({ sessionId }) => sessionId)).size === firefoxLaunches.length, "self-test Firefox fresh-segment browser policy differs");
  const one = encoderArguments(["one.webm"], "one.mp4");
  const two = encoderArguments(["one.webm", "two.webm"], "two.mp4");
  for (const token of ["-an", "-sn", "-dn", "cfr", "30", "libx264", "+faststart"]) invariant(one.includes(token), `encoder self-test misses ${token}`);
  invariant(two.includes("-filter_complex") && two.some((value) => value.includes("concat=n=2:v=1:a=0")), "multi-segment encoder self-test differs");
  const fixtureAuthority = CAPTURE_RECORDING_SPECS[0];
  const fixture = recordingContractResult({
    format: { duration: String((fixtureAuthority.minimumSeconds + fixtureAuthority.maximumSeconds) / 2), format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
    streams: [{ avg_frame_rate: "30/1", codec_name: "h264", codec_type: "video", height: 720, nb_read_frames: "600", pix_fmt: "yuv420p", r_frame_rate: "30/1", width: 1280 }],
  }, fixtureAuthority, { fullDecodePassed: true });
  invariant(fixture.status === "PASS", "recording probe self-test differs");
  validateHumanGates(HUMAN_GATE_RECORDS);
  return {
    artifacts: paths.length,
    coreScreenshots: 13,
    recordings: 14,
    schema: SCHEMA,
    screenshots: SCREENSHOT_SPECS.length,
    status: "PASS",
    typographyCandidates: TYPOGRAPHY_SOURCE_SPECS.length,
  };
}

export async function capturePhase7AReviewEvidence(options) {
  validateOptions(options);
  await assertFreshDirectory(options.output);
  const staging = assertExternalFreshPath(`${options.output}.staging-${process.pid}-${randomUUID()}`, "owned staging root");
  await assertFreshDirectory(staging);
  const workRoot = path.resolve(staging, ".capture-work");
  invariant(within(staging, workRoot), "capture work root escaped staging");
  let published = false;
  try {
    const servedBuild = await capturePortableServedBuildReceipt(options);
    const sourceAuthority = portableServedBuildReference(servedBuild);
    const [tools, chromiumAuthority, firefoxAuthority, typographyHtml] = await Promise.all([
      resolveMediaTools(options),
      resolveBrowser("chromium"),
      resolveBrowser("firefox"),
      typographySpecimen(),
    ]);
    await mkdir(path.dirname(staging), { recursive: true });
    await mkdir(staging, { recursive: false });
    await mkdir(workRoot, { recursive: true });
    const specimenPath = ownedPath(staging, TYPOGRAPHY_SPECIMEN_PATH, "typography specimen destination");
    await mkdir(path.dirname(specimenPath), { recursive: true });
    await writeFile(specimenPath, typographyHtml, { encoding: "utf8", flag: "wx" });

    const ledger = { blocked: [], console: [], expectedCancellations: [], failedRequests: [], pageErrors: [] };
    const runtime = { typographyHtml };
    const browsers = [];
    const recordings = [];
    let screenshots = [];
    const chromiumBrowser = await chromiumAuthority.browserType.launch({ executablePath: chromiumAuthority.executablePath, headless: !options.headed });
    try {
      screenshots = await captureScreenshots(chromiumBrowser, options, staging, ledger);
      const chromiumCapture = await captureRecordingsForEngine({
        browserAuthority: chromiumAuthority,
        engine: "chromium",
        ledger,
        options,
        runtime,
        sharedBrowser: chromiumBrowser,
        staging,
        tools,
      });
      invariant(chromiumCapture.browserLaunches === 1 && chromiumCapture.browserVersions.length === 1, "Chromium shared-browser launch authority differs");
      recordings.push(...chromiumCapture.records);
      browsers.push({
        engine: "chromium",
        executable: path.basename(chromiumAuthority.executablePath),
        headed: options.headed,
        version: chromiumCapture.browserVersions[0],
      });
    } finally {
      await chromiumBrowser.close().catch(() => undefined);
    }

    const firefoxCapture = await captureRecordingsForEngine({
      browserAuthority: firefoxAuthority,
      engine: "firefox",
      ledger,
      options,
      runtime,
      staging,
      tools,
    });
    const expectedFirefoxLaunches = recordingBrowserLaunchPlan().filter(({ engine }) => engine === "firefox").length;
    invariant(firefoxCapture.browserLaunches === expectedFirefoxLaunches && firefoxCapture.browserVersions.length === 1, "Firefox fresh-segment browser launch authority differs");
    recordings.push(...firefoxCapture.records);
    browsers.push({
      engine: "firefox",
      executable: path.basename(firefoxAuthority.executablePath),
      headed: options.headed,
      version: firefoxCapture.browserVersions[0],
    });

    const unexpectedConsoleErrors = ledger.console.filter(({ type, scope }) => type === "error" && scope !== "screenshot:fallback-font-narrow");
    const externalRequestAttempts = ledger.blocked.filter(({ reason }) => reason === "origin-isolation");
    invariant(ledger.pageErrors.length === 0, `browser capture observed ${ledger.pageErrors.length} page error(s)`);
    invariant(
      ledger.failedRequests.length === 0,
      `browser capture observed ${ledger.failedRequests.length} unexpected failed request(s): ${JSON.stringify(ledger.failedRequests.slice(0, 10))}`,
    );
    invariant(unexpectedConsoleErrors.length === 0, `browser capture observed ${unexpectedConsoleErrors.length} unexpected console error(s)`);
    invariant(externalRequestAttempts.length === 0, `browser capture observed ${externalRequestAttempts.length} external request attempt(s)`);

    const boundRecordings = recordings.map((record) => ({ ...record, sourceAuthority }));
    const boundScreenshots = screenshots.map((record) => ({ ...record, sourceAuthority }));
    const recordingReport = { failures: [], recordings: boundRecordings, status: "PASS" };
    validateRecordingReport(recordingReport);
    await removeOwnedTree(staging, workRoot);
    await validateTopology(staging, { includeManifest: false });
    const files = await fileLedger(staging);
    const filesByPath = new Map(files.map((record) => [record.relativePath, record]));
    const manifestRecordings = boundRecordings.map((record) => ({ ...record, bytes: filesByPath.get(record.relativePath).bytes, sha256: filesByPath.get(record.relativePath).sha256 }));
    const manifestScreenshots = boundScreenshots.map((record) => ({ ...record, bytes: filesByPath.get(record.relativePath).bytes, sha256: filesByPath.get(record.relativePath).sha256 }));
    validateRecordingReport({ failures: [], recordings: manifestRecordings, status: "PASS" });
    const manifest = {
      captureOrigin: "CAPTURE_ORIGIN",
      browsers,
      capturePolicy: {
        externalFreshOutput: true,
        noRepositoryWrites: true,
        overwriteAllowed: false,
        rawBrowserVideoRetained: false,
        rawFramesRetained: false,
        untracked: true,
      },
      createdAt: new Date().toISOString(),
      encoder: {
        contract: RECORDING_MEDIA_CONTRACT,
        ffmpeg: tools.ffmpeg.version,
        ffprobe: tools.ffprobe.version,
        fullDecodeRequiredForEveryRecording: true,
      },
      files,
      humanGates: HUMAN_GATE_RECORDS,
      recordings: manifestRecordings,
      requests: ledger,
      servedBuild,
      schema: SCHEMA,
      screenshots: manifestScreenshots,
      status: "PASS",
      summary: {
        filesExcludingManifest: files.length,
        humanGatesPending: HUMAN_GATE_RECORDS.length,
        recordings: recordings.length,
        screenshots: screenshots.length,
        typographyCandidates: TYPOGRAPHY_SOURCE_SPECS.length,
      },
      typography: {
        candidates: TYPOGRAPHY_SOURCE_SPECS.map(({ id, label, role }) => ({ id, label, role })),
        portableSpecimen: TYPOGRAPHY_SPECIMEN_PATH,
      },
      unhashedSelfEntries: [MANIFEST_PATH],
    };
    validatePortableCaptureBindings(manifest);
    assertPrivacySafe(manifest);
    const manifestFile = ownedPath(staging, MANIFEST_PATH, "evidence manifest destination");
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await validateTopology(staging);
    await rename(staging, options.output);
    published = true;
    return manifest;
  } finally {
    if (!published && await exists(staging)) await removeOwnedTree(staging);
  }
}

function usage() {
  return [
    "Usage:",
    "  node scripts/capture-phase7a-review-evidence.mjs --base-url <preview> --revision <final-r1-head> --output <fresh-external-directory> [--headed] [--ffmpeg <absolute-path>] [--ffprobe <absolute-path>]",
    "  node scripts/capture-phase7a-review-evidence.mjs --dry-run --base-url <preview> --revision <final-r1-head> --output <fresh-external-directory>",
    "  node scripts/capture-phase7a-review-evidence.mjs --self-test",
    "",
    "Capture always records the complete Chromium + Firefox seven-scenario cross-product. FFmpeg normalization, FFprobe inspection and a full FFmpeg decode are mandatory.",
  ].join("\n");
}

async function main() {
  const options = validateOptions(parseArguments(process.argv.slice(2)));
  if (options.help) { process.stdout.write(`${usage()}\n`); return; }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`); return; }
  if (options.dryRun) { process.stdout.write(`${JSON.stringify(dryRunReport(options), null, 2)}\n`); return; }
  const manifest = await capturePhase7AReviewEvidence(options);
  process.stdout.write(`${JSON.stringify({ output: options.output, status: manifest.status, summary: manifest.summary }, null, 2)}\n`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 7A review capture failed: ${error.message}`);
  process.exitCode = 1;
});
