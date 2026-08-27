#!/usr/bin/env node

/**
 * Build and independently audit the final Phase 4-R2 human-review ZIP.
 *
 * The package is an exact 40-payload review surface: 16 sheets, 7 normalized
 * browser recordings, 10 capture reports, and 7 consolidated authority reports. README.md and
 * MANIFEST.json are the only additional archive entries.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const PACKAGER = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(PACKAGER), "..");
const PACKAGER_RELATIVE = "scripts/package-phase4r2-human-review.mjs";
const SCHEMA = "quantum-hub.phase-4-r2.production-human-review-package.v1";
const AUDIT_SCHEMA = `${SCHEMA}.independent-audit`;
const RESULT_SCHEMA = `${SCHEMA}.detached-result`;
const EVIDENCE_SCHEMA = "quantum-hub.phase-4-r2.deployed-browser-report.v1";
const DEPLOYMENT_SCHEMA = "quantum-hub.phase-4-r2.deployment-verification.v1";
const MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
const ARCHIVE_FILENAME = "phase-4r2-final-cinematic-production-human-review.zip";
const DETACHED_MANIFEST_FILENAME = "phase-4r2-production-human-review-manifest.json";
const RESULT_FILENAME = "phase-4r2-production-human-review-result.json";
const AUDIT_FILENAME = "phase-4r2-production-human-review-audit.json";
const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
const README_FILENAME = "README.md";
const FIXED_EPOCH = "1980-01-01T00:00:00.000Z";
const DEPLOYED_ASSET_PREFIX = "/media/cinematic/phase-4r2/";
const DEPLOYED_MANIFEST_PATH = `${DEPLOYED_ASSET_PREFIX}manifests/phase-4r2-production-media-manifest.json`;
const EXPECTED_COUNTS = Object.freeze({ sheets: 16, recordings: 7, reports: 17, payloads: 40, archiveEntries: 42 });
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|(?:password|api[_-]?key|secret|bearer)\s*[:=]\s*["']?[a-z0-9_./+-]{12,})/i;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4"]);
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt"]);

const HUMAN_REVIEW_GATES = Object.freeze({
  "PHYSICAL → DIGITAL CONTINUITY": "PENDING HUMAN REVIEW",
  "NATIVE SCROLL + REVERSE INTEGRITY": "PENDING HUMAN REVIEW",
  "RESPONSIVE + ACCESSIBLE INTEGRATION": "PENDING HUMAN REVIEW",
  "MEDIA + PERFORMANCE SAFETY": "PENDING HUMAN REVIEW",
  "OPERATING FIELD REGRESSION": "PENDING HUMAN REVIEW",
});

const AUTHORIZATION = Object.freeze({ humanAccepted: false, phase5Authorized: false, mainMerged: false });
const VIEWPOINT_IDS = Object.freeze(["desktop-1440x900", "short-height-1366x650", "desktop-1280x800", "tablet-landscape-1024x768", "tablet-portrait-768x1024", "mobile-390x844", "mobile-360x800", "narrow-320x800", "mobile-landscape-844x390", "short-landscape-neighbor-740x360", "short-landscape-neighbor-800x360", "short-landscape-neighbor-896x414", "short-landscape-neighbor-900x480"]);
const VIEWPOINT_MILESTONE_FRAMES = Object.freeze([1, 76, 166, 225, 356, 370, 450, 500, 501, 507, 513, 514, 522, 535, 539, 540]);
const RECORDING_CONTRACT = Object.freeze([
  { id: "desktop-forward", viewpoint: "desktop-1440x900", direction: "forward", start: 1, end: 540 },
  { id: "desktop-reverse", viewpoint: "desktop-1440x900", direction: "reverse", start: 540, end: 1 },
  { id: "desktop-fast-jump", viewpoint: "desktop-1440x900", direction: "jump", start: 1, end: 1 },
  { id: "mobile-390x844-forward", viewpoint: "mobile-390x844", direction: "forward", start: 1, end: 540 },
  { id: "mobile-landscape-844x390-forward", viewpoint: "mobile-landscape-844x390", direction: "forward", start: 1, end: 540 },
  { id: "narrow-320x800-forward", viewpoint: "narrow-320x800", direction: "forward", start: 1, end: 540 },
  { id: "tablet-portrait-768x1024-forward", viewpoint: "tablet-portrait-768x1024", direction: "forward", start: 1, end: 540 },
]);
const SHEET_PATHS = Object.freeze(["01-desktop-production", "02-current", "03-orbit", "04-q", "05-environment", "06-portal", "07-physical-dom-continuity", "08-short-height", "09-mobile-portrait", "10-narrow-320", "11-tablet-768", "12-landscape-844", "13-reduced-motion", "14-no-javascript", "15-zoom-200", "16-chrome-visibility"].map((name) => `sheets/${name}.png`));
const MACHINE_REPORT_SCHEMAS = Object.freeze({
  "reports/deployed-browser.json": EVIDENCE_SCHEMA,
  "reports/network.json": "quantum-hub.phase-4-r2.network-report.v1",
  "reports/performance.json": "quantum-hub.phase-4-r2.performance-report.v1",
  "reports/responsive.json": "quantum-hub.phase-4-r2.responsive-report.v1",
  "reports/accessibility.json": "quantum-hub.phase-4-r2.accessibility-report.v1",
  "reports/family-codec.json": "quantum-hub.phase-4-r2.family-codec-report.v1",
  "reports/media-failure.json": "quantum-hub.phase-4-r2.media-failure-report.v1",
  "reports/supporting-routes.json": "quantum-hub.phase-4-r2.supporting-routes-report.v1",
  "reports/publication-regression.json": "quantum-hub.phase-4-r2.publication-regression-report.v1",
  "reports/git-deployment-provenance.json": "quantum-hub.phase-4-r2.git-deployment-provenance-report.v1",
});
const AUTHORITY_INPUTS = Object.freeze([
  ["manifests/phase-4r2-production-media-manifest.json", "quantum-hub.phase-4-r2.production-media-manifest.v1"],
  ["manifests/phase-4r2-media-selection.json", "quantum-hub.phase-4-r2.media-selection.v1"],
  ...["desktop", "portrait", "landscape"].map((family) => [`manifests/phase-4r2-${family}-frame-manifest.json`, "quantum-hub.phase-4-r2.frame-manifest.v1"]),
  ["reports/phase-4r2-frame-completion-audit.json", "quantum-hub.phase-4-r2.frame-completion-audit.v1"],
  ["reports/phase-4r2-encode-quality-report.json", "quantum-hub.phase-4-r2.encode-quality-report.v1"],
  ["reports/phase-4r2-poster-validation-report.json", "quantum-hub.phase-4-r2.poster-validation-report.v1"],
  ...["desktop", "portrait", "landscape"].map((family) => [`reports/phase-4r2-${family}-codec-determinism.json`, "quantum-hub.phase-4-r2.codec-determinism.v1"]),
  ["reports/phase-4r2-master-visual-verdict.json", "quantum-hub.phase-4-r2.master-visual-verdict.v1"],
  ["reports/phase-4r2-encode-visual-verdict.json", "quantum-hub.phase-4-r2.encode-visual-verdict.v1"],
  ["@ledger", "quantum-hub.phase-4-r2.production-render-ledger-summary.v1"],
]);
const AUTHORITY_GROUPS = Object.freeze([
  ["authority/production-media-manifest.json", "production-media-manifest", ["manifests/phase-4r2-production-media-manifest.json"]],
  ["authority/render-summaries.json", "render-summaries", ["reports/phase-4r2-frame-completion-audit.json", "@ledger"]],
  ...["desktop", "portrait", "landscape"].map((family) => [`authority/${family}-completion-audit.json`, `${family}-completion-audit`, [`manifests/phase-4r2-${family}-frame-manifest.json`]]),
  ["authority/encode-quality-selected-rejected.json", "encode-quality-selected-rejected", ["manifests/phase-4r2-media-selection.json", "reports/phase-4r2-encode-quality-report.json", "reports/phase-4r2-encode-visual-verdict.json"]],
  ["authority/posters-pilot-temporal.json", "posters-pilot-temporal", ["reports/phase-4r2-poster-validation-report.json", "reports/phase-4r2-desktop-codec-determinism.json", "reports/phase-4r2-portrait-codec-determinism.json", "reports/phase-4r2-landscape-codec-determinism.json", "reports/phase-4r2-master-visual-verdict.json"]],
]);
const REPORT_SCHEMA_ALLOWLIST = new Map([
  ...Object.entries(MACHINE_REPORT_SCHEMAS),
  ...AUTHORITY_GROUPS.map(([output, id]) => [output, `${SCHEMA}.authority.${id}.v1`]),
]);

const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_unused, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
}));

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArguments(argv) {
  const options = {
    evidenceRoot: null,
    productionRoot: null,
    output: null,
    auditExisting: null,
    detachedManifest: null,
    auditOutput: null,
    ffmpeg: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobe: process.env.FFPROBE_PATH ?? "ffprobe",
    help: false,
    dryRun: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--evidence-root") options.evidenceRoot = path.resolve(next());
    else if (argument === "--production-root") options.productionRoot = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--audit-existing") options.auditExisting = path.resolve(next());
    else if (argument === "--manifest") options.detachedManifest = path.resolve(next());
    else if (argument === "--audit-output") options.auditOutput = path.resolve(next());
    else if (argument === "--ffmpeg") options.ffmpeg = next();
    else if (argument === "--ffprobe") options.ffprobe = next();
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 4-R2 production human-review packager

Build:
  node scripts/package-phase4r2-human-review.mjs \\
    --evidence-root <external-capture-root> \\
    --production-root <external-final-production-root> \\
    --output <fresh-external-package-directory> \\
    [--ffmpeg <file-or-command>] [--ffprobe <file-or-command>]

Independent audit:
  node scripts/package-phase4r2-human-review.mjs \\
    --audit-existing <${ARCHIVE_FILENAME}> \\
    --manifest <${DETACHED_MANIFEST_FILENAME}> \\
    [--audit-output <${AUDIT_FILENAME}>]

  --dry-run   Validate option shape and exact inventory contract; write nothing
  --self-test Run deterministic ZIP, path, gate, and inventory tests
  --help, -h  Show help

The ZIP has exactly 40 manifested payloads (16 sheets + 7 silent H.264 MP4
recordings + 10 capture reports + 7 consolidated safe authority reports), plus
README.md and MANIFEST.json.
Assembly launches --audit-existing in a separate Node process before success.
`);
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function stableJson(value) { return `${JSON.stringify(stableValue(value), null, 2)}\n`; }
function lexicalCompare(left, right) { return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")); }

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRelativePath(value, label = "path") {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) throw new Error(`${label} must be a non-empty portable relative path`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`${label} is unsafe: ${value}`);
  return value;
}

function resolveUnder(root, relative, label = "path") {
  safeRelativePath(relative, label);
  const result = path.resolve(root, ...relative.split("/"));
  if (!isWithin(root, result) || result === path.resolve(root)) throw new Error(`${label} escapes root`);
  return result;
}

async function resolveFromExistingAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const missing = [];
  for (;;) {
    try { return path.join(await realpath(cursor), ...missing.reverse()); }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

function assertExternal(candidate, label) {
  if (isWithin(ROOT, candidate) || isWithin(os.tmpdir(), candidate) || path.parse(candidate).root === path.resolve(candidate)) throw new Error(`${label} must be durable, external to the repository, and not a drive root`);
}

async function atomicWrite(destination, bytes) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try { await rename(temporary, destination); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

async function run(command, args, label, maxBuffer = 30_000_000) {
  try { return await execFileAsync(command, args, { windowsHide: true, maxBuffer }); }
  catch (error) { throw new Error(`${label} failed: ${String(error.stderr || error.message).slice(-3000)}`); }
}

async function git(...args) { return (await run("git", args, "git package authority", 1_000_000)).stdout.trim(); }

async function packageRepositoryAuthority(expectedHead, expectedBranch) {
  const [head, branch, mainHead, statusText, tracked] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("branch", "--show-current"),
    git("rev-parse", "main"),
    git("status", "--short"),
    git("ls-files", "--error-unmatch", "--", PACKAGER_RELATIVE),
  ]);
  if (head !== expectedHead || branch !== expectedBranch || mainHead !== MAIN_SHA || statusText) throw new Error("Packaging requires the same exact clean branch/HEAD and frozen main authority used for final capture");
  if (tracked.replaceAll("\\", "/") !== PACKAGER_RELATIVE) throw new Error("Packager must be tracked by the exact evidence HEAD");
  return { head, branch, main: { headSha: mainHead, requiredHeadSha: MAIN_SHA }, clean: true, packagerScript: PACKAGER_RELATIVE };
}

async function executable(candidate) {
  try { await run(candidate, ["-version"], `${candidate} version`, 200_000); return true; }
  catch { return false; }
}

function assertNoPrivateText(bytes, label) {
  if (PRIVATE_TEXT.test(String(label))) throw new Error(`Privacy/secrets scan failed in payload path: ${label}`);
  const extension = path.extname(String(label)).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension) && PRIVATE_TEXT.test(bytes.toString("utf8"))) {
    throw new Error(`Privacy/secrets scan failed in human-readable payload: ${label}`);
  }
}

async function recursiveFiles(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlink/reparse entry forbidden: ${full}`);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) result.push(path.relative(root, full).replaceAll("\\", "/"));
      else throw new Error(`Non-regular evidence entry: ${full}`);
    }
  }
  await visit(root);
  return result.sort(lexicalCompare);
}

async function fileAuthority(file) {
  const bytes = await readFile(file);
  return { bytes, byteSize: bytes.length, sha256: sha256(bytes) };
}

function assertAuthorization(value, label) {
  if (JSON.stringify(stableValue(value)) !== JSON.stringify(stableValue(AUTHORIZATION))) throw new Error(`${label} authorization differs from exact false gates`);
}

function assertHumanGates(value) {
  if (JSON.stringify(stableValue(value)) !== JSON.stringify(stableValue(HUMAN_REVIEW_GATES)) || Object.keys(value ?? {}).length !== 5 || Object.values(value).some((entry) => entry !== "PENDING HUMAN REVIEW")) throw new Error("Human review gates must be exactly five PENDING HUMAN REVIEW values");
}

function projectDeployment(source) {
  if (source.schema !== DEPLOYMENT_SCHEMA || source.status !== "PASS") throw new Error("Deployment report schema/PASS contract differs");
  if (source.authorization?.humanAccepted !== false || source.authorization?.phase5Authorized !== false || source.authorization?.mainMerged !== false) throw new Error("Deployment authorization differs");
  if (source.repository?.main?.headSha !== MAIN_SHA || source.github?.main?.headSha !== MAIN_SHA || source.github?.main?.requiredHeadSha !== MAIN_SHA) throw new Error("Deployment frozen main authority differs");
  if (source.github?.checkRun?.status !== "completed" || source.github?.checkRun?.conclusion !== "success") throw new Error("Deployment projection GitHub check run is not exact success");
  if (source.cloudflare?.terminalStage?.name !== "deploy" || source.cloudflare?.terminalStage?.status !== "success" || !Number.isFinite(Date.parse(source.cloudflare?.terminalStage?.endedOn ?? ""))) throw new Error("Deployment projection Cloudflare terminal deploy stage is not explicit success");
  for (const origin of [source.deployment?.immutable, source.deployment?.branch]) {
    if (origin?.status !== "PASS" || origin.manifest?.publicPath !== DEPLOYED_MANIFEST_PATH || origin.manifest?.bytes !== source.productionManifest?.bytes || origin.manifest?.sha256 !== source.productionManifest?.sha256
      || !Array.isArray(origin.assets) || origin.assets.length !== 9 || origin.assets.some((asset) => !/^(?:media|posters)\/[a-z0-9._-]+$/i.test(asset.file ?? "") || asset.deployedPath !== `${DEPLOYED_ASSET_PREFIX}${asset.file}`)) throw new Error("Deployment projection nested manifest/asset path model differs");
  }
  assertHumanGates(source.humanReviewGates);
  return {
    schema: DEPLOYMENT_SCHEMA,
    status: "PASS",
    generatedAt: source.generatedAt,
    sourceReport: source.sourceReport,
    repository: source.repository,
    github: source.github,
    cloudflare: source.cloudflare,
    identitySeparation: source.identitySeparation,
    deployment: source.deployment,
    productionManifest: source.productionManifest,
    checks: source.checks,
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
  };
}

function projectEvidence(source) {
  if (source.schema !== EVIDENCE_SCHEMA || source.status !== "PASS" || source.summary?.sheets !== 16 || source.summary?.recordings !== 7 || source.summary?.reportsIncludingManifest !== 10 || source.summary?.totalFilesIncludingSelf !== 33) throw new Error("Evidence manifest schema/PASS/count contract differs");
  assertAuthorization(source.authorization, "Evidence manifest");
  assertHumanGates(source.humanReviewGates);
  if (source.captureContract?.viewpointCount !== 13 || source.captureContract?.sheetCount !== 16 || source.captureContract?.recordingCount !== 7 || source.captureContract?.reportCountIncludingManifest !== 10 || source.captureContract?.runtimeCssInjected !== false || source.captureContract?.requestVideoFrameCallbackUsedWhereAvailable !== true) throw new Error("Evidence capture contract differs");
  if (JSON.stringify(source.timeline?.milestones?.map((item) => item.frame)) !== JSON.stringify(VIEWPOINT_MILESTONE_FRAMES)) throw new Error("Evidence decisive milestone contract differs");
  if (!Array.isArray(source.viewpoints) || JSON.stringify(source.viewpoints.map((item) => item.id)) !== JSON.stringify(VIEWPOINT_IDS)) throw new Error("Evidence 13-viewpoint inventory differs");
  if (!Array.isArray(source.recordings) || source.recordings.length !== RECORDING_CONTRACT.length) throw new Error("Browser recording inventory differs");
  for (const [index, contract] of RECORDING_CONTRACT.entries()) {
    const recording = source.recordings[index];
    if (recording.id !== contract.id || recording.viewpoint !== contract.viewpoint || recording.direction !== contract.direction || recording.endpointPass !== true
      || recording.startState?.conceptualFrame !== contract.start || recording.endState?.conceptualFrame !== contract.end) throw new Error(`Browser recording sequence/endpoints differ: ${contract.id}`);
    if (contract.end === 540 && (recording.endState?.physicalTargetFrame !== 500 || Math.abs(recording.endState?.physicalTargetTime - 499 / 30) > 0.0002)) throw new Error(`Forward recording physical endpoint differs: ${contract.id}`);
    if (contract.end === 1 && recording.endState?.physicalTargetFrame !== 1) throw new Error(`Reverse/jump dormancy endpoint differs: ${contract.id}`);
    if (contract.direction === "jump" && (recording.actionState?.rapidForward?.conceptualFrame < 500 || recording.actionState?.rapidReverse?.conceptualFrame !== 1)) throw new Error("Fast-jump recording lacks rapid forward and reverse proof");
  }
  return {
    schema: EVIDENCE_SCHEMA,
    status: "PASS",
    generatedAt: source.generatedAt,
    captureStartedAt: source.captureStartedAt,
    repository: source.repository,
    deployment: source.deployment,
    browser: source.browser,
    timeline: source.timeline,
    captureContract: source.captureContract,
    viewpoints: source.viewpoints,
    recordings: source.recordings,
    artifacts: source.artifacts,
    summary: source.summary,
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
  };
}

async function writeStageFile(stageRoot, relativePath, bytes, kind, details = {}) {
  safeRelativePath(relativePath);
  assertNoPrivateText(bytes, relativePath);
  const destination = resolveUnder(stageRoot, relativePath);
  await atomicWrite(destination, bytes);
  return { relativePath, byteSize: bytes.length, sha256: sha256(bytes), kind, ...details };
}

async function validateImage(bytes, label) {
  const image = sharp(bytes, { failOn: "error" });
  const metadata = await image.metadata();
  await image.raw().toBuffer();
  if (!metadata.width || !metadata.height) throw new Error(`Image dimensions absent: ${label}`);
  return { width: metadata.width, height: metadata.height, format: metadata.format, fullDecodePass: true };
}

async function probeVideo(ffprobe, file) {
  const result = await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=index,codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=format_name,duration", "-of", "json", file], "ffprobe package video");
  const parsed = JSON.parse(result.stdout);
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const streams = parsed.streams ?? [];
  return {
    formatName: parsed.format?.format_name,
    durationSeconds: Number(parsed.format?.duration),
    codec: video?.codec_name,
    pixelFormat: video?.pix_fmt,
    width: video?.width,
    height: video?.height,
    averageFrameRate: video?.avg_frame_rate,
    realFrameRate: video?.r_frame_rate,
    frameCount: Number(video?.nb_read_frames),
    videoStreamCount: streams.filter((stream) => stream.codec_type === "video").length,
    audioStreamCount: streams.filter((stream) => stream.codec_type === "audio").length,
    dataStreamCount: streams.filter((stream) => stream.codec_type === "data").length,
    subtitleStreamCount: streams.filter((stream) => stream.codec_type === "subtitle").length,
    otherStreamCount: streams.filter((stream) => !["video", "audio", "data", "subtitle"].includes(stream.codec_type)).length,
  };
}

function assertVideoProbeContract(probe, expectedFrameCount, expectedViewport, label) {
  if (!String(probe.formatName ?? "").split(",").includes("mp4")
    || probe.videoStreamCount !== 1 || probe.audioStreamCount !== 0 || probe.dataStreamCount !== 0 || probe.subtitleStreamCount !== 0 || probe.otherStreamCount !== 0
    || probe.codec !== "h264" || probe.pixelFormat !== "yuv420p" || probe.averageFrameRate !== "30/1" || probe.realFrameRate !== "30/1"
    || probe.frameCount !== expectedFrameCount || probe.width !== expectedViewport.width || probe.height !== expectedViewport.height) {
    throw new Error(`Video MP4/stream/media/frame authority differs: ${label} ${JSON.stringify(probe)}`);
  }
}

async function validateVideo(ffmpeg, ffprobe, file, expectedFrameCount, expectedViewport, label) {
  const probe = await probeVideo(ffprobe, file);
  await run(ffmpeg, ["-v", "error", "-i", file, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], `full decode ${label}`);
  assertVideoProbeContract(probe, expectedFrameCount, expectedViewport, label);
  return { ...probe, fullDecodePass: true };
}

async function resolveEvidence(options) {
  assertExternal(options.evidenceRoot, "Evidence root");
  const rootInfo = await stat(options.evidenceRoot);
  if (!rootInfo.isDirectory()) throw new Error("--evidence-root must be a directory");
  const rootResolved = await realpath(options.evidenceRoot);
  assertExternal(rootResolved, "Resolved evidence root");
  const manifestRelative = "reports/deployed-browser.json";
  const manifestAuthority = await fileAuthority(resolveUnder(rootResolved, manifestRelative));
  const evidence = JSON.parse(manifestAuthority.bytes.toString("utf8"));
  projectEvidence(evidence);
  const repository = await packageRepositoryAuthority(evidence.repository?.head, evidence.repository?.branch);
  if (!Array.isArray(evidence.artifacts) || evidence.artifacts.length !== 32 || new Set(evidence.artifacts.map((record) => record.relativePath)).size !== 32) throw new Error("Evidence manifest must bind exactly 32 non-self artifacts");
  const expectedFiles = [...evidence.artifacts.map((record) => safeRelativePath(record.relativePath)), manifestRelative].sort(lexicalCompare);
  const actualFiles = await recursiveFiles(rootResolved);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) throw new Error("Evidence root has missing or unexpected files");
  const byPath = new Map();
  for (const record of evidence.artifacts) {
    const authority = await fileAuthority(resolveUnder(rootResolved, record.relativePath));
    if (authority.byteSize !== record.bytes || authority.sha256 !== record.sha256) throw new Error(`Evidence hash/size mismatch: ${record.relativePath}`);
    byPath.set(record.relativePath, { ...authority, record });
  }
  byPath.set(manifestRelative, { ...manifestAuthority, record: { relativePath: manifestRelative, kind: "report" } });
  const counts = {
    sheets: evidence.artifacts.filter((record) => record.kind === "sheet").length,
    recordings: evidence.artifacts.filter((record) => record.kind === "recording").length,
    reports: evidence.artifacts.filter((record) => record.kind === "report").length + 1,
  };
  if (JSON.stringify(counts) !== JSON.stringify({ sheets: 16, recordings: 7, reports: 10 })) throw new Error(`Evidence semantic counts differ: ${JSON.stringify(counts)}`);
  if (JSON.stringify(evidence.artifacts.filter((item) => item.kind === "sheet").map((item) => item.relativePath).sort(lexicalCompare)) !== JSON.stringify([...SHEET_PATHS].sort(lexicalCompare))) throw new Error("Exact categorical sheet inventory differs");
  if (JSON.stringify(evidence.recordings.map((item) => item.relativePath).sort(lexicalCompare)) !== JSON.stringify(RECORDING_CONTRACT.map((item) => `recordings/${item.id}.mp4`).sort(lexicalCompare))) throw new Error("Exact recording file inventory differs");
  if (JSON.stringify([...byPath.keys()].filter((item) => item.startsWith("reports/")).sort(lexicalCompare)) !== JSON.stringify(Object.keys(MACHINE_REPORT_SCHEMAS).sort(lexicalCompare))) throw new Error("Exact machine report file inventory differs");
  return { root: rootResolved, evidence, byPath, manifestRelative, repository };
}

async function resolveProduction(options) {
  assertExternal(options.productionRoot, "Production root");
  const productionRoot = await realpath(options.productionRoot);
  assertExternal(productionRoot, "Resolved production root");
  const manifest = JSON.parse(await readFile(resolveUnder(productionRoot, "manifests/phase-4r2-production-media-manifest.json"), "utf8"));
  if (manifest.schema !== "quantum-hub.phase-4-r2.production-media-manifest.v1" || manifest.status !== undefined || !Array.isArray(manifest.assets) || manifest.assets.length !== 9) throw new Error("Production manifest authority differs");
  for (const asset of manifest.assets) {
    safeRelativePath(asset.file, "production asset.file");
    if (!/^(?:media|posters)\/[a-z0-9._-]+$/i.test(asset.file) || `${DEPLOYED_ASSET_PREFIX}${asset.file}`.slice(DEPLOYED_ASSET_PREFIX.length) !== asset.file) throw new Error(`Production asset nesting differs: ${asset.file}`);
    const authority = await fileAuthority(resolveUnder(productionRoot, asset.file));
    if (authority.byteSize !== asset.bytes || authority.sha256 !== asset.sha256) throw new Error(`Production asset hash/size differs: ${asset.file}`);
  }
  const stagedAuthorityPaths = AUTHORITY_INPUTS.filter(([source]) => source !== "@ledger").map(([source]) => source);
  const exactProductionFiles = [...manifest.assets.map((asset) => asset.file), ...stagedAuthorityPaths].sort(lexicalCompare);
  if (JSON.stringify(await recursiveFiles(productionRoot)) !== JSON.stringify(exactProductionFiles)) throw new Error("Production authority root has missing or unexpected files");
  const sources = new Map();
  for (const [sourcePath] of AUTHORITY_INPUTS) {
    const file = sourcePath === "@ledger" ? path.join(ROOT, "artifacts", "reports", "phase-4r2", "phase-4r2-production-render-ledger.json") : resolveUnder(productionRoot, sourcePath);
    sources.set(sourcePath, await fileAuthority(file));
  }
  return { root: productionRoot, manifest, sources };
}

function readmeText(evidence, deployment) {
  return `# Phase 4-R2 production human review

This deterministic package is bound to Git HEAD \`${evidence.repository.head}\`
and the exact immutable Cloudflare Pages deployment \`${deployment.cloudflare.deploymentId}\`.
The GitHub check run is separately identified as \`${deployment.github.checkRun.id}\`.

## Review inventory

- 16 exact categorical PNG review sheets: desktop production, current, orbit, Q, environment, portal, physical/DOM continuity, short height, mobile portrait, 320, 768, 844 landscape, reduced motion, no-JS, 200%, and chrome visibility.
- 7 real browser-session recordings normalized to silent H.264 MP4, CFR 30 fps, yuv420p.
- 10 exact machine reports and 7 consolidated safe production-authority reports derived from 14 exact inputs. Every packaged JSON path has one exact allowed schema and PASS status.
- No raw Cycles frames, receipts, logs, Blender source, rejected encode, encoder ladder, browser-recorder master, or quarantine payload.

## Human gates

All five gates are **PENDING HUMAN REVIEW**:

1. PHYSICAL → DIGITAL CONTINUITY
2. NATIVE SCROLL + REVERSE INTEGRITY
3. RESPONSIVE + ACCESSIBLE INTEGRATION
4. MEDIA + PERFORMANCE SAFETY
5. OPERATING FIELD REGRESSION

\`humanAccepted\`, \`phase5Authorized\`, and \`mainMerged\` are all exactly false.
Machine PASS proves integrity and deployment parity; it does not substitute for human acceptance.

See \`MANIFEST.json\` for the exhaustive hash/size ledger.
`;
}

function projectAuthorityPart(source, authority, sourcePath, sourceSchema) {
  const statuslessSchemas = new Set(["quantum-hub.phase-4-r2.production-media-manifest.v1", "quantum-hub.phase-4-r2.frame-manifest.v1", "quantum-hub.phase-4-r2.master-visual-verdict.v1", "quantum-hub.phase-4-r2.encode-visual-verdict.v1"]);
  const acceptedStatus = sourcePath === "@ledger" ? source.status === "RENDERING_COMPLETE" : statuslessSchemas.has(sourceSchema) ? source.status === undefined : source.status === "PASS";
  if (source.schema !== sourceSchema || !acceptedStatus) throw new Error(`Authority schema/completion differs: ${sourcePath}`);
  const keysBySchema = {
    "quantum-hub.phase-4-r2.production-media-manifest.v1": ["sourceBlendSha256", "physicalTimeline", "selectionSha256", "qualityReportSha256", "masterVisualVerdictSha256", "encodeVisualVerdictSha256", "deliveryResolutionDecisions", "codecDeterminismReports", "assets", "authorization"],
    "quantum-hub.phase-4-r2.media-selection.v1": ["sourceBlendSha256", "selectionInputSha256", "qualityReportSha256", "masterVisualVerdictSha256", "encodeVisualVerdictSha256", "deliveryResolutionDecisions", "assets"],
    "quantum-hub.phase-4-r2.frame-manifest.v1": ["family", "source", "master", "frames"],
    "quantum-hub.phase-4-r2.frame-completion-audit.v1": ["sourceBlendSha256", "families", "summary", "checks"],
    "quantum-hub.phase-4-r2.encode-quality-report.v1": ["sourceBlendSha256", "families", "selected", "rejected", "thresholds", "metrics", "summary"],
    "quantum-hub.phase-4-r2.poster-validation-report.v1": ["sourceBlendSha256", "families", "summary", "checks"],
    "quantum-hub.phase-4-r2.codec-determinism.v1": ["sourceBlendSha256", "family", "pilot", "temporal", "codecs", "checks", "summary"],
    "quantum-hub.phase-4-r2.master-visual-verdict.v1": ["sourceBlendSha256", "families", "pilot", "temporal", "verdict", "checks"],
    "quantum-hub.phase-4-r2.encode-visual-verdict.v1": ["sourceBlendSha256", "qualityReportSha256", "candidates"],
    "quantum-hub.phase-4-r2.production-render-ledger-summary.v1": ["source", "timeline", "authorization", "preflight", "families", "externalAuthority"],
  };
  const facts = Object.fromEntries((keysBySchema[sourceSchema] ?? []).filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  if (Object.keys(facts).length === 0) throw new Error(`Authority projection has no recognized facts: ${sourcePath}`);
  return { source: { repositoryPath: sourcePath === "@ledger" ? "artifacts/reports/phase-4r2/phase-4r2-production-render-ledger.json" : sourcePath, schema: sourceSchema, status: source.status, byteSize: authority.byteSize, sha256: authority.sha256 }, facts };
}

async function assembleStage(resolved, production, stageRoot, ffmpeg, ffprobe) {
  const files = [];
  const evidence = projectEvidence(resolved.evidence);
  const provenanceInput = JSON.parse(resolved.byPath.get("reports/git-deployment-provenance.json").bytes.toString("utf8"));
  const deployment = projectDeployment(provenanceInput.deployment);
  const productionManifestAuthority = production.sources.get("manifests/phase-4r2-production-media-manifest.json");
  if (deployment.productionManifest?.bytes !== productionManifestAuthority.byteSize || deployment.productionManifest?.sha256 !== productionManifestAuthority.sha256) throw new Error("Packaged production manifest differs from deployed manifest authority");

  for (const record of resolved.evidence.artifacts.filter((item) => item.kind === "sheet").sort((a, b) => lexicalCompare(a.relativePath, b.relativePath))) {
    const source = resolved.byPath.get(record.relativePath);
    const image = await validateImage(source.bytes, record.relativePath);
    files.push(await writeStageFile(stageRoot, record.relativePath, source.bytes, "sheet", image));
  }

  const recordingByPath = new Map(evidence.recordings.map((recording) => [recording.relativePath, recording]));
  for (const record of resolved.evidence.artifacts.filter((item) => item.kind === "recording").sort((a, b) => lexicalCompare(a.relativePath, b.relativePath))) {
    const source = resolved.byPath.get(record.relativePath);
    const expected = recordingByPath.get(record.relativePath);
    if (!expected || expected.expectedFrameCount !== record.expectedFrameCount) throw new Error(`Recording manifest authority differs: ${record.relativePath}`);
    const temporary = resolveUnder(stageRoot, record.relativePath);
    await mkdir(path.dirname(temporary), { recursive: true });
    await atomicWrite(temporary, source.bytes);
    const media = await validateVideo(ffmpeg, ffprobe, temporary, record.expectedFrameCount, expected.media, record.relativePath);
    assertNoPrivateText(source.bytes, record.relativePath);
    files.push({ relativePath: record.relativePath, byteSize: source.byteSize, sha256: source.sha256, kind: "recording", expectedFrameCount: record.expectedFrameCount, media });
  }

  for (const [relativePath, schema] of Object.entries(MACHINE_REPORT_SCHEMAS).sort(([left], [right]) => lexicalCompare(left, right))) {
    const source = JSON.parse(resolved.byPath.get(relativePath).bytes.toString("utf8"));
    if (source.schema !== schema || source.status !== "PASS") throw new Error(`Machine report schema/PASS differs: ${relativePath}`);
    assertAuthorization(source.authorization, relativePath);
    assertHumanGates(source.humanReviewGates);
    const bytes = Buffer.from(stableJson(source));
    files.push(await writeStageFile(stageRoot, relativePath, bytes, "report", { schema, status: "PASS" }));
  }
  const inputContracts = new Map(AUTHORITY_INPUTS);
  for (const [outputPath, id, sourcePaths] of AUTHORITY_GROUPS) {
    const authorities = sourcePaths.map((sourcePath) => {
      const authority = production.sources.get(sourcePath);
      const source = JSON.parse(authority.bytes.toString("utf8"));
      return projectAuthorityPart(source, authority, sourcePath, inputContracts.get(sourcePath));
    });
    const projected = { schema: `${SCHEMA}.authority.${id}.v1`, status: "PASS", authorities, humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION };
    files.push(await writeStageFile(stageRoot, outputPath, Buffer.from(stableJson(projected)), "report", { schema: projected.schema, status: "PASS" }));
  }
  return { files: files.sort((a, b) => lexicalCompare(a.relativePath, b.relativePath)), evidence, deployment };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZipBuffer(entries, { preserveInputOrder = false } = {}) {
  const ordered = preserveInputOrder ? [...entries] : [...entries].sort((left, right) => lexicalCompare(left.path, right.path));
  const names = ordered.map((entry) => safeRelativePath(entry.path));
  if (new Set(names).size !== names.length) throw new Error("ZIP paths are duplicated");
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of ordered) {
    const name = Buffer.from(entry.path, "utf8");
    const data = Buffer.from(entry.data);
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, data);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x0021, 14);
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
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(ordered.length, 8);
  eocd.writeUInt16LE(ordered.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralBytes, eocd]);
}

function parseStoredZip(bytes) {
  if (bytes.length < 22) throw new Error("ZIP is truncated");
  const eocdOffset = bytes.length - 22;
  if (bytes.readUInt32LE(eocdOffset) !== 0x06054b50 || bytes.readUInt16LE(eocdOffset + 20) !== 0) throw new Error("ZIP EOCD is non-canonical");
  const disk = bytes.readUInt16LE(eocdOffset + 4);
  const centralDisk = bytes.readUInt16LE(eocdOffset + 6);
  const diskCount = bytes.readUInt16LE(eocdOffset + 8);
  const count = bytes.readUInt16LE(eocdOffset + 10);
  const centralSize = bytes.readUInt32LE(eocdOffset + 12);
  const centralOffset = bytes.readUInt32LE(eocdOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || diskCount !== count || centralOffset + centralSize !== eocdOffset) throw new Error("ZIP central-directory bounds differ");
  const entries = [];
  let cursor = centralOffset;
  let expectedLocalOffset = 0;
  let previousName = null;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > eocdOffset) throw new Error("ZIP central header is truncated");
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIP central header missing");
    const versionMadeBy = bytes.readUInt16LE(cursor + 4);
    const versionNeeded = bytes.readUInt16LE(cursor + 6);
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const dosTime = bytes.readUInt16LE(cursor + 12);
    const dosDate = bytes.readUInt16LE(cursor + 14);
    const crc = bytes.readUInt32LE(cursor + 16);
    const compressed = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const diskStart = bytes.readUInt16LE(cursor + 34);
    const internalAttributes = bytes.readUInt16LE(cursor + 36);
    const externalAttributes = bytes.readUInt32LE(cursor + 38);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    if (versionMadeBy !== 20 || versionNeeded !== 20 || flags !== 0x0800 || method !== 0 || dosTime !== 0 || dosDate !== 0x0021
      || compressed !== size || extraLength !== 0 || commentLength !== 0 || diskStart !== 0 || internalAttributes !== 0 || externalAttributes !== 0) {
      throw new Error("ZIP central entry is not canonical stored UTF-8 with the fixed DOS timestamp");
    }
    if (cursor + 46 + nameLength > eocdOffset) throw new Error("ZIP central name is truncated");
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    safeRelativePath(name, "ZIP entry");
    if (previousName !== null && lexicalCompare(previousName, name) >= 0) throw new Error("ZIP central entries are not in strict canonical lexical order");
    previousName = name;
    if (localOffset !== expectedLocalOffset) throw new Error(`ZIP local entries are not contiguous/in canonical order: ${name}`);
    if (localOffset + 30 > centralOffset) throw new Error(`ZIP local header overlaps central directory: ${name}`);
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`ZIP local header missing: ${name}`);
    const localVersionNeeded = bytes.readUInt16LE(localOffset + 4);
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localDosTime = bytes.readUInt16LE(localOffset + 10);
    const localDosDate = bytes.readUInt16LE(localOffset + 12);
    const localCrc = bytes.readUInt32LE(localOffset + 14);
    const localCompressed = bytes.readUInt32LE(localOffset + 18);
    const localSize = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    if (localOffset + 30 + localNameLength + localExtraLength > centralOffset) throw new Error(`ZIP local name/extra overlaps central directory: ${name}`);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + localCompressed;
    if (dataEnd > centralOffset) throw new Error(`ZIP local data overlaps central directory: ${name}`);
    const data = bytes.subarray(dataStart, dataStart + size);
    if (localVersionNeeded !== versionNeeded || localFlags !== flags || localMethod !== method || localDosTime !== dosTime || localDosDate !== dosDate
      || localCrc !== crc || localCompressed !== compressed || localSize !== size || localNameLength !== nameLength || localExtraLength !== extraLength
      || localName !== name || data.length !== size || crc32(data) !== crc) throw new Error(`ZIP local/central/header/CRC mismatch: ${name}`);
    entries.push({ path: name, data: Buffer.from(data), bytes: size, sha256: sha256(data), crc32: crc });
    expectedLocalOffset = dataEnd;
    cursor += 46 + nameLength;
  }
  if (expectedLocalOffset !== centralOffset) throw new Error("ZIP local entries do not exactly cover the pre-central region");
  if (cursor !== eocdOffset) throw new Error("ZIP central directory has trailing data");
  return entries;
}

function semanticCounts(files) {
  return {
    sheets: files.filter((record) => record.kind === "sheet").length,
    recordings: files.filter((record) => record.kind === "recording").length,
    reports: files.filter((record) => record.kind === "report").length,
    payloads: files.length,
  };
}

function assertExactReportSchema(relativePath, parsed, record = null) {
  const expectedSchema = REPORT_SCHEMA_ALLOWLIST.get(relativePath);
  if (!expectedSchema) throw new Error(`Report path is not in the exact schema allowlist: ${relativePath}`);
  if (parsed?.schema !== expectedSchema || parsed?.status !== "PASS") throw new Error(`Report exact schema/PASS differs: ${relativePath}`);
  if (record && (record.schema !== expectedSchema || record.status !== "PASS")) throw new Error(`Manifest report schema/PASS differs: ${relativePath}`);
}

function validateManifest(manifest) {
  if (manifest.schema !== SCHEMA || manifest.status !== "PASS" || manifest.generatedAt !== FIXED_EPOCH) throw new Error("Package manifest root contract differs");
  assertAuthorization(manifest.authorization, "Package manifest");
  assertHumanGates(manifest.humanReviewGates);
  if (!Array.isArray(manifest.files) || new Set(manifest.files.map((record) => record.relativePath)).size !== manifest.files.length) throw new Error("Manifest files are absent or duplicated");
  const counts = semanticCounts(manifest.files);
  if (JSON.stringify(counts) !== JSON.stringify({ sheets: 16, recordings: 7, reports: 17, payloads: 40 })) throw new Error(`Manifest semantic counts differ: ${JSON.stringify(counts)}`);
  if (manifest.payloadCount !== 40 || manifest.payloadBytes !== manifest.files.reduce((sum, record) => sum + record.byteSize, 0)) throw new Error("Manifest aggregate count/bytes differ");
  const manifestPaths = manifest.files.map((record) => record.relativePath);
  if (JSON.stringify(manifestPaths) !== JSON.stringify([...manifestPaths].sort(lexicalCompare))) throw new Error("Manifest payload ledger is not in canonical lexical byte order");
  const reportRecords = manifest.files.filter((record) => record.kind === "report" || record.kind === "authority");
  if (JSON.stringify(reportRecords.map((record) => record.relativePath).sort(lexicalCompare)) !== JSON.stringify([...REPORT_SCHEMA_ALLOWLIST.keys()].sort(lexicalCompare))) throw new Error("Manifest report path inventory differs from the exact path-to-schema allowlist");
  for (const record of manifest.files) {
    safeRelativePath(record.relativePath, "manifest file");
    if (!Number.isSafeInteger(record.byteSize) || record.byteSize < 1 || !/^[0-9a-f]{64}$/.test(record.sha256 ?? "")) throw new Error(`Invalid manifest hash/size: ${record.relativePath}`);
    if (record.kind === "report" || record.kind === "authority") assertExactReportSchema(record.relativePath, { schema: record.schema, status: record.status }, record);
  }
}

async function auditArchive(archivePath, detachedPath, ffmpeg, ffprobe) {
  const [archiveResolved, detachedResolved] = await Promise.all([realpath(archivePath), realpath(detachedPath)]);
  assertExternal(archiveResolved, "Resolved archive");
  assertExternal(detachedResolved, "Resolved detached manifest");
  if (path.basename(archiveResolved) !== ARCHIVE_FILENAME || path.basename(detachedResolved) !== DETACHED_MANIFEST_FILENAME || path.dirname(archiveResolved) !== path.dirname(detachedResolved)) throw new Error("Archive/detached-manifest naming or sibling contract differs");
  const [archive, detached] = await Promise.all([readFile(archiveResolved), readFile(detachedResolved)]);
  const entries = parseStoredZip(archive);
  if (entries.length !== EXPECTED_COUNTS.archiveEntries || new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error("ZIP entry count/uniqueness differs");
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const archivedManifest = byPath.get(IN_ARCHIVE_MANIFEST);
  const readme = byPath.get(README_FILENAME);
  if (!archivedManifest || !readme || !archivedManifest.data.equals(detached)) throw new Error("README/manifest/detached parity failed");
  const manifest = JSON.parse(detached.toString("utf8"));
  validateManifest(manifest);
  const expectedPaths = [...manifest.files.map((record) => record.relativePath), README_FILENAME, IN_ARCHIVE_MANIFEST].sort(lexicalCompare);
  if (JSON.stringify(entries.map((entry) => entry.path)) !== JSON.stringify(expectedPaths)) throw new Error("Manifest coverage/order is not exhaustive and canonical");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase4r2-package-audit-"));
  const media = [];
  try {
    for (const entry of entries) {
      assertNoPrivateText(entry.data, entry.path);
      if (/(?:^|\/)(?:raw|masters?|frames|receipts|logs?|quarantine|rejected|candidate-ladder|browser-recorder)(?:\/|$)/i.test(entry.path) || /\.(?:blend\d*|exr|mov|webm|mkv)$/i.test(entry.path)) throw new Error(`Forbidden raw/rejected/source payload: ${entry.path}`);
    }
    for (const record of manifest.files) {
      const entry = byPath.get(record.relativePath);
      if (!entry || entry.bytes !== record.byteSize || entry.sha256 !== record.sha256) throw new Error(`Manifest hash/size mismatch: ${record.relativePath}`);
      const extension = path.extname(record.relativePath).toLowerCase();
      if (record.kind === "sheet") {
        if (!IMAGE_EXTENSIONS.has(extension)) throw new Error(`Sheet extension differs: ${record.relativePath}`);
        const decoded = await validateImage(entry.data, record.relativePath);
        if (decoded.width !== record.width || decoded.height !== record.height) throw new Error(`Sheet dimensions differ: ${record.relativePath}`);
        media.push({ path: record.relativePath, type: "image", ...decoded });
      } else if (record.kind === "recording") {
        if (!VIDEO_EXTENSIONS.has(extension)) throw new Error(`Recording extension differs: ${record.relativePath}`);
        const extracted = path.join(temporary, `${media.length}.mp4`);
        await writeFile(extracted, entry.data);
        const decoded = await validateVideo(ffmpeg, ffprobe, extracted, record.expectedFrameCount, record.media, record.relativePath);
        media.push({ path: record.relativePath, type: "video", ...decoded });
      } else if (record.kind === "report" || record.kind === "authority") {
        if (extension !== ".json") throw new Error(`Report extension differs: ${record.relativePath}`);
        const parsed = JSON.parse(entry.data.toString("utf8"));
        assertExactReportSchema(record.relativePath, parsed, record);
        if (parsed.authorization) assertAuthorization(parsed.authorization, record.relativePath);
      } else throw new Error(`Unknown manifest kind: ${record.kind}`);
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return {
    schema: AUDIT_SCHEMA,
    status: "PASS",
    generatedAt: FIXED_EPOCH,
    archive: { filename: ARCHIVE_FILENAME, byteSize: archive.length, sha256: sha256(archive), entryCount: entries.length },
    manifest: { filename: DETACHED_MANIFEST_FILENAME, byteSize: detached.length, sha256: sha256(detached), detachedEqualsArchived: true },
    counts: EXPECTED_COUNTS,
    checks: { zipOpens: true, canonicalFixedDosTimestamps: true, canonicalLexicalLocalAndCentralOrder: true, localCentralHeaderParity: true, contiguousNonOverlappingLocalCoverage: true, everyCrcPasses: true, uniqueSafePaths: true, exhaustiveLedgerCoverage: true, everyHashAndSizeMatches: true, allImagesFullyDecode: true, allVideosFullyDecode: true, exactVideoFrameCounts: true, mp4ExactlyOneVideoNoOtherStreams: true, h264Cfr30Yuv420pSilent: true, exactReportPathToSchemaAllowlist: true, jsonSchemaAndPass: true, privacyAndSecretsScan: true, rawMastersExcluded: true, rejectedEncodesExcluded: true, blenderSourceExcluded: true, packageExternalAndUntracked: true },
    media,
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
  };
}

async function assemblePackage(options) {
  assertExternal(options.evidenceRoot, "Evidence root");
  assertExternal(options.output, "Package output");
  try { await stat(options.output); throw new Error("--output must not already exist"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const resolvedOutput = await resolveFromExistingAncestor(options.output);
  assertExternal(resolvedOutput, "Resolved package output");
  const resolved = await resolveEvidence(options);
  await mkdir(options.output, { recursive: false });
  const workRoot = await mkdtemp(path.join(os.tmpdir(), "phase4r2-package-stage-"));
  try {
    const production = await resolveProduction(options);
    const { files, evidence, deployment } = await assembleStage(resolved, production, workRoot, options.ffmpeg, options.ffprobe);
    const counts = semanticCounts(files);
    if (JSON.stringify(counts) !== JSON.stringify({ sheets: 16, recordings: 7, reports: 17, payloads: 40 })) throw new Error(`Staged payload inventory differs: ${JSON.stringify(counts)}`);
    const readme = Buffer.from(readmeText(evidence, deployment), "utf8");
    assertNoPrivateText(readme, README_FILENAME);
    await atomicWrite(path.join(workRoot, README_FILENAME), readme);
    const manifest = {
      schema: SCHEMA,
      status: "PASS",
      generatedAt: FIXED_EPOCH,
      deterministicArchive: { storedEntries: true, fixedDosTimestamp: FIXED_EPOCH, utf8Paths: true, lexicalByteOrder: true },
      source: { expectedHead: evidence.repository.head, branch: evidence.repository.branch, immutableUrl: deployment.deployment.immutableUrl, cloudflareDeploymentId: deployment.cloudflare.deploymentId, githubCheckRunId: deployment.github.checkRun.id, evidenceManifestSha256: resolved.byPath.get(resolved.manifestRelative).sha256 },
      inventory: EXPECTED_COUNTS,
      payloadCount: files.length,
      payloadBytes: files.reduce((sum, record) => sum + record.byteSize, 0),
      files,
      humanReviewGates: HUMAN_REVIEW_GATES,
      authorization: AUTHORIZATION,
    };
    validateManifest(manifest);
    const manifestBytes = Buffer.from(stableJson(manifest));
    assertNoPrivateText(manifestBytes, IN_ARCHIVE_MANIFEST);
    await atomicWrite(path.join(workRoot, IN_ARCHIVE_MANIFEST), manifestBytes);
    const stageFiles = await recursiveFiles(workRoot);
    const expectedStage = [...files.map((record) => record.relativePath), README_FILENAME, IN_ARCHIVE_MANIFEST].sort(lexicalCompare);
    if (JSON.stringify(stageFiles) !== JSON.stringify(expectedStage)) throw new Error("Staging coverage differs before ZIP creation");
    const entries = [];
    for (const relative of stageFiles) entries.push({ path: relative, data: await readFile(resolveUnder(workRoot, relative)) });
    const archive = createStoredZipBuffer(entries);
    const archiveAgain = createStoredZipBuffer([...entries].reverse());
    if (!archive.equals(archiveAgain)) throw new Error("Deterministic ZIP reproduction differs");
    const archivePath = path.join(options.output, ARCHIVE_FILENAME);
    const detachedPath = path.join(options.output, DETACHED_MANIFEST_FILENAME);
    await atomicWrite(archivePath, archive);
    await atomicWrite(detachedPath, manifestBytes);
    const auditPath = path.join(options.output, AUDIT_FILENAME);
    const child = await run(process.execPath, [PACKAGER, "--audit-existing", archivePath, "--manifest", detachedPath, "--audit-output", auditPath, "--ffmpeg", options.ffmpeg, "--ffprobe", options.ffprobe], "separate-process package audit", 10_000_000);
    const childSummary = JSON.parse(child.stdout);
    if (childSummary.status !== "PASS" || childSummary.audit?.path !== AUDIT_FILENAME) throw new Error("Separate-process audit did not return PASS");
    const auditAuthority = await fileAuthority(auditPath);
    const audit = JSON.parse(auditAuthority.bytes.toString("utf8"));
    if (audit.schema !== AUDIT_SCHEMA || audit.status !== "PASS" || audit.archive.sha256 !== sha256(archive)) throw new Error("Detached audit authority differs");
    const result = {
      schema: RESULT_SCHEMA,
      status: "PASS",
      generatedAt: FIXED_EPOCH,
      archive: { filename: ARCHIVE_FILENAME, byteSize: archive.length, sha256: sha256(archive), entryCount: EXPECTED_COUNTS.archiveEntries },
      manifest: { filename: DETACHED_MANIFEST_FILENAME, byteSize: manifestBytes.length, sha256: sha256(manifestBytes), detachedEqualsArchived: true },
      audit: { filename: AUDIT_FILENAME, byteSize: auditAuthority.byteSize, sha256: auditAuthority.sha256, separateProcess: true },
      counts: EXPECTED_COUNTS,
      packageExternalAndUntracked: true,
      humanReviewGates: HUMAN_REVIEW_GATES,
      authorization: AUTHORIZATION,
    };
    const resultBytes = Buffer.from(stableJson(result));
    assertNoPrivateText(resultBytes, RESULT_FILENAME);
    await atomicWrite(path.join(options.output, RESULT_FILENAME), resultBytes);
    process.stdout.write(stableJson({ status: "PASS", outputBasename: path.basename(options.output), archive: result.archive, manifest: result.manifest, audit: result.audit, counts: EXPECTED_COUNTS }));
  } finally { await rm(workRoot, { recursive: true, force: true }); }
}

async function selfTest() {
  if (REPORT_SCHEMA_ALLOWLIST.size !== 17) throw new Error("Report path-to-schema allowlist self-test failed");
  if (AUTHORITY_INPUTS.length !== 14 || AUTHORITY_GROUPS.length !== 7 || ARCHIVE_FILENAME !== "phase-4r2-final-cinematic-production-human-review.zip") throw new Error("Authority consolidation/archive-name self-test failed");
  if (`${DEPLOYED_ASSET_PREFIX}media/example.mp4` !== "/media/cinematic/phase-4r2/media/example.mp4" || `${DEPLOYED_ASSET_PREFIX}example.mp4` === `${DEPLOYED_ASSET_PREFIX}media/example.mp4` || DEPLOYED_MANIFEST_PATH !== "/media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json") throw new Error("Nested deployed-path negative self-test failed");
  assertHumanGates(HUMAN_REVIEW_GATES);
  assertAuthorization(AUTHORIZATION, "Self-test");
  assertHumanGates(JSON.parse(stableJson(HUMAN_REVIEW_GATES)));
  assertAuthorization(JSON.parse(stableJson(AUTHORIZATION)), "Stable JSON self-test");
  // Compressed image/video bytes are arbitrary and can coincidentally contain
  // path-like byte runs. Scan their public relative path, while limiting byte
  // scanning to the human-readable payload types the review package exposes.
  assertNoPrivateText(Buffer.from("\\\\compressed-binary\\collision"), "sheets/privacy-binary-negative.png");
  for (const [bytes, label] of [
    [Buffer.from("source=C:\\Users\\example\\private"), "reports/privacy-text-negative.json"],
    [Buffer.from("safe"), "reports/C:/Users/example/private.json"],
  ]) {
    let rejected = false;
    try { assertNoPrivateText(bytes, label); } catch { rejected = true; }
    if (!rejected) throw new Error("Privacy scanner negative self-test failed");
  }
  for (const invalidGates of [{ ...HUMAN_REVIEW_GATES, EXTRA: "PENDING HUMAN REVIEW" }, { ...HUMAN_REVIEW_GATES, "OPERATING FIELD REGRESSION": "PASS" }]) {
    let rejected = false;
    try { assertHumanGates(invalidGates); } catch { rejected = true; }
    if (!rejected) throw new Error("Human-gate negative self-test failed");
  }
  for (const invalid of ["../x", "/x", "a\\b", "a//b", "./a"]) {
    let rejected = false;
    try { safeRelativePath(invalid); } catch { rejected = true; }
    if (!rejected) throw new Error(`Unsafe path self-test accepted ${invalid}`);
  }
  const entries = [{ path: "b.txt", data: Buffer.from("bravo\n") }, { path: "a.txt", data: Buffer.from("alpha\n") }];
  const first = createStoredZipBuffer(entries);
  const second = createStoredZipBuffer([...entries].reverse());
  if (!first.equals(second)) throw new Error("Deterministic ZIP self-test differs");
  const parsed = parseStoredZip(first);
  if (parsed.length !== 2 || parsed[0].path !== "a.txt" || parsed[1].path !== "b.txt") throw new Error("ZIP parse self-test differs");
  for (const invalidZip of [
    createStoredZipBuffer(entries, { preserveInputOrder: true }),
    (() => { const bytes = Buffer.from(first); bytes.writeUInt16LE(1, 10); return bytes; })(),
    (() => { const bytes = Buffer.from(first); const nameLength = bytes.readUInt16LE(26); bytes[30 + nameLength] ^= 0xff; return bytes; })(),
    (() => { const bytes = Buffer.from(first); const centralOffset = bytes.readUInt32LE(bytes.length - 6); bytes.writeUInt16LE(8, centralOffset + 10); return bytes; })(),
    (() => { const bytes = Buffer.from(first); bytes[30] = 0x7a; return bytes; })(),
    (() => { const bytes = Buffer.from(first); const centralOffset = bytes.readUInt32LE(bytes.length - 6); bytes.writeUInt32LE(1, centralOffset + 42); return bytes; })(),
  ]) {
    let rejected = false;
    try { parseStoredZip(invalidZip); } catch { rejected = true; }
    if (!rejected) throw new Error("Non-canonical ZIP negative self-test failed");
  }
  assertExactReportSchema("reports/deployed-browser.json", { schema: EVIDENCE_SCHEMA, status: "PASS" });
  for (const invalidReport of [
    ["reports/deployed-browser.json", { schema: `${EVIDENCE_SCHEMA}.lookalike`, status: "PASS" }],
    ["reports/unlisted.json", { schema: DEPLOYMENT_SCHEMA, status: "PASS" }],
  ]) {
    let rejected = false;
    try { assertExactReportSchema(invalidReport[0], invalidReport[1]); } catch { rejected = true; }
    if (!rejected) throw new Error("Exact path-to-schema negative self-test failed");
  }
  const validVideoProbe = { formatName: "mov,mp4,m4a,3gp,3g2,mj2", videoStreamCount: 1, audioStreamCount: 0, dataStreamCount: 0, subtitleStreamCount: 0, otherStreamCount: 0, codec: "h264", pixelFormat: "yuv420p", averageFrameRate: "30/1", realFrameRate: "30/1", frameCount: 90, width: 390, height: 844 };
  assertVideoProbeContract(validVideoProbe, 90, { width: 390, height: 844 }, "self-test");
  for (const override of [{ formatName: "matroska,webm" }, { videoStreamCount: 2 }, { audioStreamCount: 1 }, { dataStreamCount: 1 }, { subtitleStreamCount: 1 }]) {
    let rejected = false;
    try { assertVideoProbeContract({ ...validVideoProbe, ...override }, 90, { width: 390, height: 844 }, "negative self-test"); } catch { rejected = true; }
    if (!rejected) throw new Error("Video container/stream negative self-test failed");
  }
  process.stdout.write(stableJson({ schema: `${SCHEMA}.self-test`, status: "PASS", counts: EXPECTED_COUNTS, deterministicZipSha256: sha256(first) }));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  if (options.selfTest) return selfTest();
  if (options.auditExisting) {
    if (!options.detachedManifest) throw new Error("--audit-existing requires --manifest");
    if (!await executable(options.ffmpeg) || !await executable(options.ffprobe)) throw new Error("ffmpeg and ffprobe are required for audit");
    const audit = await auditArchive(options.auditExisting, options.detachedManifest, options.ffmpeg, options.ffprobe);
    if (options.auditOutput) {
      assertExternal(options.auditOutput, "Audit output");
      const resolvedAuditOutput = await resolveFromExistingAncestor(options.auditOutput);
      assertExternal(resolvedAuditOutput, "Resolved audit output");
      const bytes = Buffer.from(stableJson(audit));
      assertNoPrivateText(bytes, AUDIT_FILENAME);
      await atomicWrite(options.auditOutput, bytes);
    }
    process.stdout.write(stableJson({ status: "PASS", audit: { path: options.auditOutput ? path.basename(options.auditOutput) : null, archiveSha256: audit.archive.sha256, manifestSha256: audit.manifest.sha256 }, counts: EXPECTED_COUNTS }));
    return;
  }
  if (!options.evidenceRoot || !options.productionRoot || !options.output) throw new Error("Build mode requires --evidence-root, --production-root, and --output");
  assertExternal(options.evidenceRoot, "Evidence root");
  assertExternal(options.productionRoot, "Production root");
  assertExternal(options.output, "Package output");
  if (options.dryRun) {
    process.stdout.write(stableJson({ schema: `${SCHEMA}.dry-run`, status: "PASS", writesPerformed: false, mediaDecoded: false, separateProcessLaunched: false, counts: EXPECTED_COUNTS, humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION }));
    return;
  }
  if (!await executable(options.ffmpeg) || !await executable(options.ffprobe)) throw new Error("ffmpeg and ffprobe are required");
  await assemblePackage(options);
}

main().catch((error) => {
  process.stderr.write(`Phase 4-R2 human-review package failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
