#!/usr/bin/env node

/**
 * Deterministically assemble the Phase 5B supporting-route production review
 * package. Production evidence and accepted storyboards stay outside Git; the
 * ZIP contains only their compact review derivatives and signed reports.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

const execFileAsync = promisify(execFile);
const SCRIPT = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
const AUDITOR = path.join(ROOT, "scripts", "audit-phase5b-human-review-package.mjs");

export const PACKAGE_SCHEMA = "quantum-hub.phase-5b.supporting-route-production-human-review.v1";
export const DETACHED_SCHEMA = `${PACKAGE_SCHEMA}.detached-manifest`;
export const AUDIT_SCHEMA = `${PACKAGE_SCHEMA}.independent-audit`;
export const ARCHIVE_FILENAME = "phase-5b-supporting-route-production-human-review.zip";
export const DETACHED_MANIFEST_FILENAME = "phase-5b-supporting-route-production-human-review-manifest.json";
export const AUDIT_FILENAME = "phase-5b-supporting-route-production-human-review-audit.json";
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const README_FILENAME = "README.md";
export const FIXED_EPOCH = "1980-01-01T00:00:00.000Z";
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const MAX_DIST_BYTES = 25 * 1024 * 1024;

export const REQUIRED_BRANCH = "feature/phase-5b-supporting-route-production";
export const REQUIRED_PROJECT = "qsite1";
export const ACCEPTED_PHASE5AR_SHA = "b6a9d4f6e05412dfd460a657edfd8be4ce7eef2c";
export const FROZEN_MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const CP7_HEAD = "9a9ad82b266c663e5689c8a6884a90cfc835ef7c";
export const CP7_REPORT_GIT_HEAD = "508d54a517b9c28ac683fb3257df3afad24b72bb";
export const CP7_REPORT_SHA256 = "e62b4d20b49170d729ce4dfb61e5f73f796eb55701678beeacce2ac600afe365";
export const CP8_HEAD = "1b890e945973ce4bc90ba5dda917d9656c4db9d6";
export const CP8_REPORT_SHA256 = "2aabac54afc7288e4dbad6e93cf4f9f9e59871c18e0ad62434faed5b0c8c457c";
export const REQUIRED_BRANCH_URL = "https://feature-phase-5b-supporting.qsite1.pages.dev/";
export const CHECKPOINT_SUBJECTS = Object.freeze([
  "Establish Phase 5B route production architecture",
  "Implement Phase 5B industry and startup experiences",
  "Implement Phase 5B industry territory experience",
  "Implement Phase 5B Proof and Maradin documentary routes",
  "Implement Phase 5B SPARK and About experiences",
  "Implement Phase 5B Contact and 404 experiences",
  "Harden Phase 5B responsive and accessibility behavior",
  "Harden Phase 5B publication media and performance safety",
  "Complete Phase 5B deployed human-review evidence",
]);
export const FIXED_CHECKPOINT_SHAS = Object.freeze([
  "1fcc260fc51810934b160eec38971184db2008e1",
  "58a87e333cca47b2495c373d2c934e69ec25d290",
  "5458b5d74411ac16b83874b725cc021605851326",
  "996c9a05a0f8a3a810f0d47a0288c12fac430093",
  "11952af17bb1cdb3f079902dfb5300ddafe42594",
  "508d54a517b9c28ac683fb3257df3afad24b72bb",
  CP7_HEAD,
  CP8_HEAD,
]);

export const ROUTES = Object.freeze([
  Object.freeze({ id: "for-industry", publicRoute: "/for-partners/", label: "Industry", mode: "C" }),
  Object.freeze({ id: "for-startups", publicRoute: "/for-startups/", label: "Startups", mode: "C" }),
  Object.freeze({ id: "industries", publicRoute: "/industries/", label: "Industries", mode: "C" }),
  Object.freeze({ id: "proof", publicRoute: "/pocs/", label: "Proof", mode: "B" }),
  Object.freeze({ id: "maradin", publicRoute: "/pocs/maradin/", label: "Maradin", mode: "B" }),
  Object.freeze({ id: "spark", publicRoute: "/spark/", label: "SPARK", mode: "B" }),
  Object.freeze({ id: "about", publicRoute: "/about/", label: "About", mode: "B" }),
  Object.freeze({ id: "contact", publicRoute: "/contact/", label: "Contact", mode: "A" }),
  Object.freeze({ id: "404", publicRoute: "/__phase5b-intentional-404__/", label: "404", mode: "A" }),
]);
export const ROUTE_ORDER = Object.freeze(ROUTES.map(({ id }) => id));
export const MOTION_ROUTE_IDS = Object.freeze(ROUTES.filter(({ mode }) => mode !== "A").map(({ id }) => id));

export const CROSS_ROUTE_ARTIFACTS = Object.freeze([
  "all-route-desktop.png",
  "all-route-portrait.png",
  "all-route-320.png",
  "all-route-844-landscape.png",
  "navigation-recording.mp4",
]);
export const ROUTE_COMMON_ARTIFACTS = Object.freeze([
  "production-comparison.png",
  "desktop-key-states.png",
  "mobile-key-states.png",
  "320.png",
  "844-landscape.png",
  "reduced-motion.png",
  "no-js.png",
  "text-200.png",
  "accessibility.json",
  "performance.json",
  "publication.json",
  "network-media.json",
]);
export const ROUTE_RECORDING = "route-recording.mp4";
export const HOMEPAGE_ARTIFACTS = Object.freeze([
  "manifesto.png",
  "audience-split.png",
  "crt-startup.png",
  "current.png",
  "q.png",
  "regression.json",
]);
export const CAPTURE_REPORT = "capture-report.json";
export const ACCEPTED_STORYBOARD_ARTIFACTS = Object.freeze([
  "desktop-storyboard--1440x900.png",
  "route-brief-delta.md",
]);
export const ACCEPTED_STORYBOARD_MANIFEST = "route-preproduction-manifest.json";

export const REPOSITORY_DOCS = Object.freeze([
  Object.freeze({ source: "docs/planning/PHASE_5B_IMPLEMENTATION_ARCHITECTURE.md", archive: "reports/PHASE_5B_IMPLEMENTATION_ARCHITECTURE.md" }),
  Object.freeze({ source: "docs/planning/PHASE_5B_LONG_TASK_BASELINE.md", archive: "reports/PHASE_5B_LONG_TASK_BASELINE.md" }),
  Object.freeze({ source: "docs/planning/PHASE_5B_RESPONSIVE_ACCESSIBILITY.md", archive: "reports/PHASE_5B_RESPONSIVE_ACCESSIBILITY.md" }),
  Object.freeze({ source: "docs/planning/PHASE_5B_PUBLICATION_MEDIA_PERFORMANCE.md", archive: "reports/PHASE_5B_PUBLICATION_MEDIA_PERFORMANCE.md" }),
  Object.freeze({ source: "docs/planning/PHASE_5B_PRODUCTION_ANTI_TEMPLATE_AUDIT.md", archive: "reports/PHASE_5B_PRODUCTION_ANTI_TEMPLATE_AUDIT.md" }),
  Object.freeze({ source: "docs/planning/PHASE_5B_CSS_DUPLICATION_AUDIT.md", archive: "reports/PHASE_5B_CSS_DUPLICATION_AUDIT.md" }),
]);

export const REPORT_PATHS = Object.freeze({
  deployedCapture: "reports/deployed-capture-report.json",
  acceptedStoryboard: "reports/accepted-storyboard-manifest.json",
  responsiveAccessibility: "reports/responsive-accessibility.json",
  publicationMediaPerformance: "reports/publication-media-performance.json",
  deployment: "reports/deployment-verification.json",
  git: "reports/git-provenance.json",
  build: "reports/build-budget.json",
});

export const HUMAN_REVIEW_GATES = Object.freeze({
  "SUPPORTING-ROUTE PRODUCTION FIDELITY": "PENDING HUMAN REVIEW",
  "ROUTE-SPECIFIC SPATIAL IDENTITY": "PENDING HUMAN REVIEW",
  "RESPONSIVE + ACCESSIBLE INTEGRATION": "PENDING HUMAN REVIEW",
  "PUBLICATION + MEDIA SAFETY": "PENDING HUMAN REVIEW",
  "PERFORMANCE + RUNTIME SAFETY": "PENDING HUMAN REVIEW",
  "HOMEPAGE + PHASE 4/5A REGRESSION": "PENDING HUMAN REVIEW",
});
export const AUTHORIZATION = Object.freeze({
  authorSelfApproved: false,
  deployerSelfApproved: false,
  machinePassGrantsHumanAcceptance: false,
  humanAccepted: false,
  phase5BComplete: false,
  phase6Authorized: false,
  mainMerged: false,
});

export const ACTIVE_MEDIA_SHA256 = Object.freeze({
  "media/maradin/maradin-field-aperture-poster-approved.jpg": "6afc1a69570f2541b89b4f6a5074bec04a5d607743d91670321f550b4d6364bd",
  "media/maradin/maradin-prove-field-frame-approved.jpg": "b85f1bd5413b6fe7da235e5217e16b106ae4ff0763e8deb9db6e509dbc0b8b8c",
  "media/maradin/maradin-real-field-still-approved.jpg": "49ab9aca0d2e3ef9e9ce164f43f9dbd1514ef815179626bef2bb4217827a6741",
  "media/maradin/maradin-field-aperture-approved.mp4": "daaec510c528bd7f72a97cfce1d9ede3359ec1339e28e26f524d127f09bf247c",
  "media/maradin/maradin-test-contact-approved.mp4": "076aecf40d9e67ac29eb0b8e2d34ffc374619862a9679a6e44bc08ccfd2c113d",
});

const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4"]);
const ALLOWED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);
const PRIVATE_OR_SECRET_TEXT = /(?:[a-z]:[\\/]users[\\/]|(?:^|[\s"'=:])\/(?:users|home)\/[^/\s]+\/|(?:^|[^a-z])onedrive(?:[^a-z]|$)|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;
const FORBIDDEN_ENTRY = /(?:^|\/)(?:raw|private|secrets?|sources?|src|assets?|masters?|frames?|prototypes?|blender|history|receipts?|logs?|cache|caches|quarantine|rejected|candidates?|browser-recorder|autosaves?|temp|tmp|__pycache__|node_modules|\.git|dist)(?:\/|$)|(?:^|\/)\.(?:env|ds_store)(?:\.|$)|\.(?:webm|blend\d*|exr|tiff?|mov|mkv|avi|zip|7z|rar|pem|key|p12|pfx|log|map)$/i;
const MAX_SOURCE_FILE_BYTES = MAX_ARCHIVE_BYTES;
const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_unused, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
}));

function lexicalCompare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.keys(value).sort(lexicalCompare).map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export function expectedEvidenceArtifactPaths() {
  return [
    ...CROSS_ROUTE_ARTIFACTS.map((name) => `cross-route/${name}`),
    ...ROUTES.flatMap(({ id, mode }) => [
      ...ROUTE_COMMON_ARTIFACTS.map((name) => `routes/${id}/${name}`),
      ...(mode === "A" ? [] : [`routes/${id}/${ROUTE_RECORDING}`]),
    ]),
    ...HOMEPAGE_ARTIFACTS.map((name) => `homepage/${name}`),
  ].sort(lexicalCompare);
}

export function expectedEvidencePaths() {
  return [...expectedEvidenceArtifactPaths(), CAPTURE_REPORT].sort(lexicalCompare);
}

export function evidenceToArchivePath(relativePath) {
  safeRelativePath(relativePath, "evidence path");
  if (relativePath.startsWith("cross-route/")) return relativePath;
  if (relativePath.startsWith("routes/")) return `per-route/${relativePath.slice("routes/".length)}`;
  if (relativePath.startsWith("homepage/")) return `homepage-regression/${relativePath.slice("homepage/".length)}`;
  if (relativePath === CAPTURE_REPORT) return REPORT_PATHS.deployedCapture;
  throw new Error(`unknown deployed-evidence path: ${relativePath}`);
}

export function expectedPackagePayloadPaths() {
  return [
    ...expectedEvidenceArtifactPaths().map(evidenceToArchivePath),
    ...ROUTE_ORDER.flatMap((id) => ACCEPTED_STORYBOARD_ARTIFACTS.map((name) => `per-route/${id}/${name}`)),
    ...Object.values(REPORT_PATHS),
    ...REPOSITORY_DOCS.map(({ archive }) => archive),
  ].sort(lexicalCompare);
}

export function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function safeRelativePath(value, label = "path") {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) {
    throw new Error(`${label} must be a portable relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} is unsafe: ${value}`);
  }
  return value;
}

export function assertExternalPath(candidate, label = "path") {
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root || isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved)) {
    throw new Error(`${label} must be durable, outside the repository and OS temporary directory, and not a drive root`);
  }
  return resolved;
}

export function assertAllowedEntry(relativePath) {
  safeRelativePath(relativePath, "package entry");
  if (FORBIDDEN_ENTRY.test(relativePath)) throw new Error(`forbidden raw/assets/source/prototype/history/private payload: ${relativePath}`);
  if ([README_FILENAME, IN_ARCHIVE_MANIFEST].includes(relativePath)) return true;
  const top = relativePath.split("/")[0];
  if (!new Set(["cross-route", "per-route", "homepage-regression", "reports"]).has(top)) {
    throw new Error(`entry is outside the Phase 5B review surface: ${relativePath}`);
  }
  if (!ALLOWED_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())) throw new Error(`unsupported review payload: ${relativePath}`);
  return true;
}

function semanticJsonText(value) {
  const values = [];
  const visit = (node, key = "") => {
    if (typeof node === "string") {
      values.push(node);
      if (key) values.push(`${key}: ${node}`);
    } else if (Array.isArray(node)) node.forEach((child) => visit(child, key));
    else if (node && typeof node === "object") Object.entries(node).forEach(([childKey, child]) => visit(child, childKey));
    else if (key && node !== null && node !== undefined) values.push(`${key}: ${node}`);
  };
  visit(value);
  return values.join("\n");
}

export function assertNoPrivateText(bytes, relativePath) {
  if (PRIVATE_OR_SECRET_TEXT.test(relativePath)) throw new Error(`privacy/secrets scan failed in path: ${relativePath}`);
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) && relativePath !== IN_ARCHIVE_MANIFEST) return true;
  const text = Buffer.from(bytes).toString("utf8");
  if (PRIVATE_OR_SECRET_TEXT.test(text)) throw new Error(`privacy/secrets scan failed in payload: ${relativePath}`);
  if (extension === ".json" || relativePath === IN_ARCHIVE_MANIFEST) {
    let document;
    try { document = JSON.parse(text); } catch { throw new Error(`invalid JSON payload: ${relativePath}`); }
    if (PRIVATE_OR_SECRET_TEXT.test(semanticJsonText(document))) throw new Error(`privacy/secrets semantic scan failed: ${relativePath}`);
  }
  return true;
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    evidenceRoot: null,
    storyboardRoot: null,
    deploymentReport: null,
    cp7Report: null,
    cp8Report: null,
    expectedHead: null,
    expectedUpstream: null,
    expectedBranch: REQUIRED_BRANCH,
    expectedMain: FROZEN_MAIN_SHA,
    acceptedPhase5AR: ACCEPTED_PHASE5AR_SHA,
    expectedDeploymentId: null,
    deploymentProject: REQUIRED_PROJECT,
    immutableUrl: null,
    branchUrl: null,
    ffprobe: null,
    output: null,
    selfTest: false,
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (["--evidence-root", "--deployed-evidence-root"].includes(argument)) options.evidenceRoot = path.resolve(next());
    else if (["--storyboard-root", "--accepted-storyboard-root"].includes(argument)) options.storyboardRoot = path.resolve(next());
    else if (argument === "--deployment-report") options.deploymentReport = path.resolve(next());
    else if (argument === "--cp7-report") options.cp7Report = path.resolve(next());
    else if (argument === "--cp8-report") options.cp8Report = path.resolve(next());
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-upstream") options.expectedUpstream = next().toLowerCase();
    else if (argument === "--expected-branch") options.expectedBranch = next();
    else if (argument === "--expected-main") options.expectedMain = next().toLowerCase();
    else if (["--accepted-phase5ar", "--expected-base"].includes(argument)) options.acceptedPhase5AR = next().toLowerCase();
    else if (["--expected-deployment-id", "--cloudflare-deployment-id"].includes(argument)) options.expectedDeploymentId = next();
    else if (["--deployment-project", "--cloudflare-project"].includes(argument)) options.deploymentProject = next();
    else if (["--immutable-url", "--observed-immutable-url"].includes(argument)) options.immutableUrl = next();
    else if (["--branch-url", "--observed-branch-url"].includes(argument)) options.branchUrl = next();
    else if (argument === "--ffprobe") options.ffprobe = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

function normalizePreviewUrl(value, flag) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${flag} must be an absolute URL`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !url.hostname.endsWith(`.${REQUIRED_PROJECT}.pages.dev`)) {
    throw new Error(`${flag} must be a credential-free ${REQUIRED_PROJECT} Pages HTTPS origin root`);
  }
  return url.toString();
}

export function validateOptionShape(input) {
  const options = { ...input };
  if (!HASH40.test(options.expectedHead ?? "")) throw new Error("--expected-head must be a lowercase 40-hex commit");
  options.expectedUpstream ??= options.expectedHead;
  if (!HASH40.test(options.expectedUpstream) || options.expectedUpstream !== options.expectedHead) throw new Error("--expected-upstream must equal --expected-head");
  if (options.expectedBranch !== REQUIRED_BRANCH) throw new Error(`--expected-branch must remain ${REQUIRED_BRANCH}`);
  if (options.expectedMain !== FROZEN_MAIN_SHA) throw new Error(`--expected-main must remain ${FROZEN_MAIN_SHA}`);
  if (options.acceptedPhase5AR !== ACCEPTED_PHASE5AR_SHA) throw new Error(`--accepted-phase5ar must remain ${ACCEPTED_PHASE5AR_SHA}`);
  if (!UUID.test(options.expectedDeploymentId ?? "")) throw new Error("--expected-deployment-id must be a Cloudflare UUID");
  if (options.deploymentProject !== REQUIRED_PROJECT) throw new Error(`--deployment-project must remain ${REQUIRED_PROJECT}`);
  options.immutableUrl = normalizePreviewUrl(options.immutableUrl, "--immutable-url");
  options.branchUrl = normalizePreviewUrl(options.branchUrl, "--branch-url");
  if (options.immutableUrl === options.branchUrl) throw new Error("immutable and branch preview URLs must differ");
  if (options.branchUrl !== REQUIRED_BRANCH_URL) throw new Error(`--branch-url must remain ${REQUIRED_BRANCH_URL}`);
  if (new URL(options.immutableUrl).hostname !== `${options.expectedDeploymentId.split("-")[0].toLowerCase()}.${REQUIRED_PROJECT}.pages.dev`) throw new Error("--immutable-url must match the deployment UUID prefix");
  for (const [key, flag] of [
    ["evidenceRoot", "--deployed-evidence-root"],
    ["storyboardRoot", "--accepted-storyboard-root"],
    ["deploymentReport", "--deployment-report"],
    ["cp7Report", "--cp7-report"],
    ["cp8Report", "--cp8-report"],
    ["output", "--output"],
  ]) if (!options[key]) throw new Error(`${flag} is required`);
  if (!options.ffprobe || !path.isAbsolute(options.ffprobe)) throw new Error("--ffprobe must be an absolute executable path");
  if (path.basename(options.output) !== ARCHIVE_FILENAME) throw new Error(`--output basename must be ${ARCHIVE_FILENAME}`);
  assertExternalPath(options.output, "output");
  return options;
}

async function run(command, args, label, options = {}) {
  try {
    return await execFileAsync(command, args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 10_000_000, ...options });
  } catch (error) {
    throw new Error(`${label} failed: ${error.stderr || error.stdout || error.message}`);
  }
}

async function git(...args) {
  return (await run("git", args, "Git Phase 5B package authority")).stdout.trim();
}

async function recursiveFiles(root) {
  const output = [];
  async function walk(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => lexicalCompare(left.name, right.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symbolic links are forbidden in review inputs: ${relative}`);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) output.push(relative);
      else throw new Error(`unsupported filesystem entry in review inputs: ${relative}`);
    }
  }
  await walk(root);
  return output.sort(lexicalCompare);
}

function exactPaths(actual, expected, label) {
  assert.deepEqual([...actual].sort(lexicalCompare), [...expected].sort(lexicalCompare), `${label} differs`);
}

async function resolveExternalInput(candidate, label, kind) {
  const configured = assertExternalPath(candidate, label);
  const resolved = await realpath(configured);
  assertExternalPath(resolved, label);
  const info = await stat(resolved);
  if (kind === "directory" ? !info.isDirectory() : !info.isFile()) throw new Error(`${label} must resolve to a ${kind}`);
  return resolved;
}

async function readBoundFile(root, relativePath, packagePath) {
  safeRelativePath(relativePath, "input path");
  assertAllowedEntry(packagePath);
  const candidate = path.join(root, ...relativePath.split("/"));
  const info = await lstat(candidate);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`review input must be a regular non-symlink file: ${relativePath}`);
  const resolved = await realpath(candidate);
  if (!isWithin(root, resolved)) throw new Error(`review input escapes its root: ${relativePath}`);
  if (info.size > MAX_SOURCE_FILE_BYTES) throw new Error(`review input exceeds per-file limit: ${relativePath}`);
  const data = await readFile(resolved);
  assertNoPrivateText(data, packagePath);
  return { relativePath: packagePath, sourceRelativePath: relativePath, sourcePath: resolved, data };
}

async function validateImage(bytes, label) {
  const image = sharp(bytes, { failOn: "error", limitInputPixels: 250_000_000, sequentialRead: true });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || (metadata.pages && metadata.pages !== 1) || !["png", "jpeg", "webp"].includes(metadata.format)) {
    throw new Error(`image decode contract failed: ${label}`);
  }
  await image.clone().raw().toBuffer();
  return { type: "image", format: metadata.format, width: metadata.width, height: metadata.height, pages: metadata.pages ?? 1, decoded: true };
}

async function validateFfprobe(executable) {
  const resolved = await realpath(executable);
  if (!(await stat(resolved)).isFile()) throw new Error("--ffprobe does not resolve to a regular file");
  await run(resolved, ["-version"], "ffprobe identity", { maxBuffer: 1_000_000 });
  return resolved;
}

async function probeVideo(ffprobe, file, label) {
  const { stdout } = await run(ffprobe, [
    "-v", "error", "-count_frames",
    "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=format_name,duration",
    "-of", "json", file,
  ], `ffprobe validation for ${label}`, { maxBuffer: 2_000_000 });
  let document;
  try { document = JSON.parse(stdout); } catch { throw new Error(`ffprobe returned invalid JSON for ${label}`); }
  const streams = Array.isArray(document.streams) ? document.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const result = {
    type: "video",
    format: document.format?.format_name ?? null,
    durationSeconds: Number(document.format?.duration),
    codec: video?.codec_name ?? null,
    pixelFormat: video?.pix_fmt ?? null,
    width: Number(video?.width),
    height: Number(video?.height),
    averageFrameRate: video?.avg_frame_rate ?? null,
    realFrameRate: video?.r_frame_rate ?? null,
    frameCount: Number(video?.nb_read_frames),
    videoStreams: streams.filter((stream) => stream.codec_type === "video").length,
    audioStreams: streams.filter((stream) => stream.codec_type === "audio").length,
    otherStreams: streams.filter((stream) => !["video", "audio"].includes(stream.codec_type)).length,
    decoded: true,
  };
  const [numerator, denominator] = String(result.averageFrameRate).split("/").map(Number);
  const fps = denominator ? numerator / denominator : Number(result.averageFrameRate);
  if (!String(result.format).split(",").includes("mp4") || result.codec !== "h264" || result.pixelFormat !== "yuv420p" || result.videoStreams !== 1 || result.audioStreams !== 0 || result.otherStreams !== 0 || !Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0 || !Number.isSafeInteger(result.frameCount) || result.frameCount <= 0 || !Number.isFinite(fps) || fps <= 0 || fps > 120 || result.width < 16 || result.height < 16) {
    throw new Error(`MP4 decode contract failed: ${label} ${JSON.stringify(result)}`);
  }
  return result;
}

function parseJson(bytes, label) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { throw new Error(`${label} is not valid JSON`); }
}

function containsScalar(value, expected) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).toLowerCase() === String(expected).toLowerCase();
  if (Array.isArray(value)) return value.some((item) => containsScalar(item, expected));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsScalar(item, expected));
  return false;
}

function assertPassReport(document, label) {
  if (!document || typeof document !== "object" || document.status !== "PASS") throw new Error(`${label} must report PASS`);
  const failures = document.failures;
  if (Array.isArray(failures) && failures.length) throw new Error(`${label} contains failures`);
  if (Number.isFinite(failures) && failures !== 0) throw new Error(`${label} contains failures`);
  if (Number.isFinite(document.summary?.failures) && document.summary.failures !== 0) throw new Error(`${label} summary contains failures`);
  return true;
}

function extractLedger(document, label) {
  const candidates = [document.files, document.artifacts, document.ledger, document.inventory?.files, document.evidence?.files];
  const records = candidates.find(Array.isArray);
  if (!records) throw new Error(`${label} omits an exhaustive file ledger`);
  const map = new Map();
  for (const record of records) {
    const relativePath = record?.relativePath ?? record?.path;
    const byteSize = record?.byteSize ?? record?.bytes ?? record?.size;
    const hash = String(record?.sha256 ?? "").toLowerCase();
    safeRelativePath(relativePath, `${label} ledger path`);
    if (!Number.isSafeInteger(byteSize) || byteSize < 0 || !HASH64.test(hash)) throw new Error(`${label} has an invalid ledger record: ${relativePath}`);
    if (map.has(relativePath)) throw new Error(`${label} repeats a ledger path: ${relativePath}`);
    map.set(relativePath, { byteSize, sha256: hash });
  }
  return map;
}

async function collectDeployedEvidence(root, options, ffprobe) {
  exactPaths(await recursiveFiles(root), expectedEvidencePaths(), "deployed evidence 127-file topology");
  const artifacts = [];
  for (const relativePath of expectedEvidenceArtifactPaths()) {
    const item = await readBoundFile(root, relativePath, evidenceToArchivePath(relativePath));
    const extension = path.posix.extname(relativePath).toLowerCase();
    if (IMAGE_EXTENSIONS.has(extension)) item.media = await validateImage(item.data, item.relativePath);
    else if (VIDEO_EXTENSIONS.has(extension)) item.media = await probeVideo(ffprobe, item.sourcePath, item.relativePath);
    else parseJson(item.data, item.relativePath);
    artifacts.push(item);
  }
  const reportItem = await readBoundFile(root, CAPTURE_REPORT, REPORT_PATHS.deployedCapture);
  const report = parseJson(reportItem.data, CAPTURE_REPORT);
  assertPassReport(report, "deployed capture report");
  assert.deepEqual(report.humanReview?.gates, HUMAN_REVIEW_GATES, "deployed capture human gates differ");
  if (report.humanReview?.phase6Authorized !== false) throw new Error("deployed capture report attempts to authorize Phase 6");
  const ledger = extractLedger(report, "deployed capture report");
  exactPaths(ledger.keys(), expectedEvidenceArtifactPaths(), "deployed capture ledger");
  for (const item of artifacts) {
    const record = ledger.get(item.sourceRelativePath);
    if (record.byteSize !== item.data.length || record.sha256 !== sha256(item.data)) throw new Error(`deployed capture ledger mismatch: ${item.sourceRelativePath}`);
  }
  for (const [name, expected] of [["HEAD", options.expectedHead], ["immutable URL", options.immutableUrl]]) {
    if (!containsScalar(report, expected)) throw new Error(`deployed capture report does not bind exact ${name}: ${expected}`);
  }
  return { artifacts, reportItem, report };
}

async function collectAcceptedStoryboards(root) {
  const manifestItem = await readBoundFile(root, ACCEPTED_STORYBOARD_MANIFEST, REPORT_PATHS.acceptedStoryboard);
  const manifest = parseJson(manifestItem.data, ACCEPTED_STORYBOARD_MANIFEST);
  if (manifest.schema !== "qh.phase5ar.route-preproduction-manifest.v1" || manifest.status !== "PASS" || manifest.phase5BAuthorized !== false || manifest.acceptedPhase5A !== "799ee284355f161e06404919d5022cd051165bf5") {
    throw new Error("accepted storyboard manifest authority differs");
  }
  const ledger = extractLedger(manifest, "accepted storyboard manifest");
  const artifacts = [];
  for (const id of ROUTE_ORDER) {
    for (const name of ACCEPTED_STORYBOARD_ARTIFACTS) {
      const sourceRelativePath = `routes/${id}/${name}`;
      const packagePath = `per-route/${id}/${name}`;
      const item = await readBoundFile(root, sourceRelativePath, packagePath);
      const record = ledger.get(sourceRelativePath);
      if (!record || record.byteSize !== item.data.length || record.sha256 !== sha256(item.data)) throw new Error(`accepted storyboard ledger mismatch: ${sourceRelativePath}`);
      if (name.endsWith(".png")) {
        item.media = await validateImage(item.data, packagePath);
        if (item.media.width !== 1440 || item.media.height < 900) throw new Error(`accepted desktop storyboard dimensions differ: ${id}`);
      } else if (item.data.length < 400) throw new Error(`accepted route-brief delta is not substantive: ${id}`);
      artifacts.push(item);
    }
  }
  return { artifacts, manifestItem, manifest };
}

async function readExternalReport(file, packagePath, label) {
  const resolved = await resolveExternalInput(file, label, "file");
  const data = await readFile(resolved);
  if (data.length > MAX_SOURCE_FILE_BYTES) throw new Error(`${label} exceeds the per-file limit`);
  assertAllowedEntry(packagePath);
  assertNoPrivateText(data, packagePath);
  return { relativePath: packagePath, sourcePath: resolved, data, document: parseJson(data, label) };
}

function validateCp7(item) {
  assertPassReport(item.document, "CP7 report");
  if (item.document.schema !== "quantum-hub.phase-5b.responsive-accessibility.v1" || sha256(item.data) !== CP7_REPORT_SHA256 || item.document.git?.branch !== REQUIRED_BRANCH || item.document.git?.head !== CP7_REPORT_GIT_HEAD) throw new Error("CP7 report is not the accepted authority");
  const expected = { responsiveCases: 117, variantCases: 54, keyboardCases: 18, mobileNavigationCases: 9, axeCases: 18, axeViolations: 0, seriousCriticalAxe: 0, failures: 0 };
  for (const [key, value] of Object.entries(expected)) if (item.document.summary?.[key] !== value) throw new Error(`CP7 report summary differs: ${key}`);
}

function validateCp8(item) {
  assertPassReport(item.document, "CP8 report");
  if (sha256(item.data) !== CP8_REPORT_SHA256 || item.document.git?.expectedHead !== CP8_HEAD || item.document.git?.observedHead !== CP8_HEAD) throw new Error("CP8 clean-head report is not the accepted authority");
  const expected = { routeCount: 9, failures: 0, maximumScrollLongTaskMs: 0, phase4CinematicRequests: 0 };
  for (const [key, value] of Object.entries(expected)) if (item.document.summary?.[key] !== value) throw new Error(`CP8 report summary differs: ${key}`);
}

function validateDeployment(item, options) {
  assertPassReport(item.document, "deployment report");
  assert.deepEqual(item.document.humanReview?.gates, HUMAN_REVIEW_GATES, "deployment human gates differ");
  if (item.document.authorization?.phase6Authorized !== false || item.document.humanReview?.allSixPending !== true) throw new Error("deployment human-review authorization differs");
  for (const [name, expected] of [
    ["HEAD", options.expectedHead],
    ["deployment ID", options.expectedDeploymentId],
    ["project", options.deploymentProject],
    ["immutable URL", options.immutableUrl],
    ["branch URL", options.branchUrl],
  ]) if (!containsScalar(item.document, expected)) throw new Error(`deployment report does not bind exact ${name}: ${expected}`);
}

function validateDeploymentDist(deployment, build) {
  const records = deployment?.dist?.files;
  if (!Array.isArray(records)) throw new Error("deployment report omits its exhaustive dist ledger");
  const byPath = new Map();
  for (const record of records) {
    const relativePath = record?.relativePath;
    const byteSize = record?.byteSize ?? record?.bytes;
    const hash = String(record?.sha256 ?? "").toLowerCase();
    safeRelativePath(relativePath, "deployment dist path");
    if (byPath.has(relativePath) || !Number.isSafeInteger(byteSize) || byteSize < 0 || !HASH64.test(hash)) throw new Error(`deployment dist ledger record differs: ${relativePath}`);
    byPath.set(relativePath, { byteSize, sha256: hash });
  }
  exactPaths(byPath.keys(), build.files.map(({ relativePath }) => relativePath), "deployment/current dist paths");
  for (const record of build.files) {
    const deployed = byPath.get(record.relativePath);
    if (deployed.byteSize !== record.byteSize || deployed.sha256 !== record.sha256) throw new Error(`deployment/current dist bytes differ: ${record.relativePath}`);
  }
  if (deployment.dist?.totals?.files !== build.fileCount || deployment.dist?.totals?.bytes !== build.totalBytes) throw new Error("deployment/current dist totals differ");
  return true;
}

function parseLinearLog(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, parents, ...subject] = line.split("\t");
    return { sha, parents: parents.split(" ").filter(Boolean), subject: subject.join("\t") };
  });
}

async function repositoryAuthority(options) {
  const tracked = [
    ...REPOSITORY_DOCS.map(({ source }) => source),
    "scripts/package-phase5b-human-review.mjs",
    "scripts/audit-phase5b-human-review-package.mjs",
    "tests/phase5b-human-review-package-tooling.test.mjs",
  ];
  const [head, upstream, branch, localMain, originMain, statusText, parent, timestamp, logText, delta, ...trackedChecks] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("rev-parse", "@{upstream}"),
    git("branch", "--show-current"),
    git("rev-parse", "main"),
    git("rev-parse", "origin/main"),
    git("status", "--porcelain=v1", "--untracked-files=all"),
    git("rev-parse", "HEAD^"),
    git("show", "-s", "--format=%cI", "HEAD"),
    git("log", "--reverse", "--format=%H%x09%P%x09%s", `${ACCEPTED_PHASE5AR_SHA}..HEAD`),
    git("diff", "--name-status", `${ACCEPTED_PHASE5AR_SHA}..HEAD`),
    ...tracked.map((relative) => git("ls-files", "--error-unmatch", "--", relative)),
  ]);
  if (head !== options.expectedHead || upstream !== options.expectedUpstream || branch !== REQUIRED_BRANCH) throw new Error("Git HEAD/upstream/branch authority differs");
  if (localMain !== FROZEN_MAIN_SHA || originMain !== FROZEN_MAIN_SHA || options.expectedMain !== FROZEN_MAIN_SHA) throw new Error("main moved from its frozen authority");
  if (statusText) throw new Error(`working tree must be clean before production packaging:\n${statusText}`);
  if (trackedChecks.some((value) => !value)) throw new Error("a package authority file is not tracked");
  const commits = parseLinearLog(logText);
  if (commits.length !== CHECKPOINT_SUBJECTS.length || commits[0].parents.length !== 1 || commits[0].parents[0] !== ACCEPTED_PHASE5AR_SHA) throw new Error("Phase 5B chain does not contain the exact nine checkpoints from the accepted Phase 5A-R SHA");
  for (let index = 0; index < commits.length; index += 1) {
    const expectedSha = index < FIXED_CHECKPOINT_SHAS.length ? FIXED_CHECKPOINT_SHAS[index] : options.expectedHead;
    const expectedParent = index === 0 ? ACCEPTED_PHASE5AR_SHA : commits[index - 1].sha;
    if (commits[index].sha !== expectedSha || commits[index].subject !== CHECKPOINT_SUBJECTS[index] || commits[index].parents.length !== 1 || commits[index].parents[0] !== expectedParent) throw new Error(`Phase 5B CP${index + 1} checkpoint authority differs`);
  }
  if (commits.at(-1).sha !== head) throw new Error("Phase 5B commit chain does not end at HEAD");
  return {
    schema: `${PACKAGE_SCHEMA}.git-provenance`,
    status: "PASS",
    generatedAt: timestamp,
    branch,
    head,
    upstream,
    parent,
    acceptedPhase5AR: ACCEPTED_PHASE5AR_SHA,
    localMain,
    originMain,
    cleanTree: true,
    commits,
    trackedDelta: delta.split(/\r?\n/).filter(Boolean),
    trackedAuthorities: tracked.sort(lexicalCompare),
  };
}

async function buildAuthority(generatedAt) {
  const distRoot = path.join(ROOT, "dist");
  const files = await recursiveFiles(distRoot);
  const records = [];
  for (const relativePath of files) {
    const data = await readFile(path.join(distRoot, ...relativePath.split("/")));
    records.push({ relativePath, byteSize: data.length, sha256: sha256(data) });
  }
  const requiredHtml = ["index.html", "404.html", "for-partners/index.html", "for-startups/index.html", "industries/index.html", "pocs/index.html", "pocs/maradin/index.html", "spark/index.html", "about/index.html", "contact/index.html"];
  for (const relativePath of requiredHtml) if (!records.some((record) => record.relativePath === relativePath)) throw new Error(`dist omits required page: ${relativePath}`);
  if (records.some(({ relativePath }) => /(?:^|\/)(?:package\.json|src|prototypes?)(?:\/|$)|\.map$/i.test(relativePath))) throw new Error("dist contains forbidden source/prototype/package metadata");
  const totalBytes = records.reduce((sum, record) => sum + record.byteSize, 0);
  if (totalBytes > MAX_DIST_BYTES) throw new Error(`dist exceeds ${MAX_DIST_BYTES} bytes`);
  const media = [];
  for (const [relativePath, expectedHash] of Object.entries(ACTIVE_MEDIA_SHA256)) {
    const record = records.find((candidate) => candidate.relativePath === relativePath);
    if (!record || record.sha256 !== expectedHash) throw new Error(`active production media differs: ${relativePath}`);
    media.push(record);
  }
  return {
    schema: `${PACKAGE_SCHEMA}.build-budget`,
    status: "PASS",
    generatedAt,
    fileCount: records.length,
    totalBytes,
    maximumBytes: MAX_DIST_BYTES,
    htmlFiles: requiredHtml,
    sourceMaps: 0,
    serverRuntime: false,
    activeMedia: media,
    treeSha256: sha256(Buffer.from(stableJson(records))),
    files: records,
  };
}

function kindFor(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return "document";
}

function roleFor(relativePath) {
  if (relativePath === README_FILENAME) return "review guide and gate contract";
  if (relativePath.startsWith("cross-route/")) return "deployed cross-route comparison evidence";
  if (relativePath.startsWith("homepage-regression/")) return "deployed homepage regression evidence";
  if (relativePath.includes("desktop-storyboard--1440x900.png")) return "accepted Phase 5A-R desktop storyboard authority";
  if (relativePath.endsWith("route-brief-delta.md")) return "accepted Phase 5A-R route-brief delta authority";
  if (relativePath.startsWith("per-route/")) return "deployed route-specific production evidence";
  if (relativePath.startsWith("reports/")) return "machine report or tracked review authority";
  throw new Error(`no artifact role for ${relativePath}`);
}

export function buildArtifactRoles() {
  return {
    crossRoute: CROSS_ROUTE_ARTIFACTS.map((name) => `cross-route/${name}`),
    perRoute: Object.fromEntries(ROUTES.map(({ id, mode }) => [id, {
      deployed: [...ROUTE_COMMON_ARTIFACTS, ...(mode === "A" ? [] : [ROUTE_RECORDING])].map((name) => `per-route/${id}/${name}`),
      acceptedStoryboard: `per-route/${id}/desktop-storyboard--1440x900.png`,
      routeBriefDelta: `per-route/${id}/route-brief-delta.md`,
    }])),
    homepageRegression: HOMEPAGE_ARTIFACTS.map((name) => `homepage-regression/${name}`),
    reports: [...Object.values(REPORT_PATHS), ...REPOSITORY_DOCS.map(({ archive }) => archive)],
    readme: README_FILENAME,
  };
}

function flattenRolePaths(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => flattenRolePaths(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => flattenRolePaths(item, output));
  return output;
}

export function validateArtifactRoles(roles, paths) {
  const rolePaths = flattenRolePaths(roles);
  if (new Set(rolePaths).size !== rolePaths.length) throw new Error("artifact roles contain duplicate paths");
  exactPaths(rolePaths, paths, "artifact role surface");
  return true;
}

function readmeText(repository, options) {
  return `# Quantum-Hub Phase 5B supporting-route production — human review\n\n` +
    `This deterministic package is bound to Git HEAD \`${repository.head}\` and Cloudflare deployment \`${options.expectedDeploymentId}\`. Machine PASS proves package integrity only.\n\n` +
    `## Review order\n\n1. \`cross-route/\`: compare all nine production identities and navigation.\n2. \`per-route/<id>/\`: compare deployed states with the accepted desktop storyboard and route-brief delta.\n3. \`homepage-regression/\`: confirm the accepted manifesto/CRT experience did not regress.\n4. \`reports/\`: inspect deployment, accessibility, publication, performance, anti-template, Git, and build authorities.\n\n` +
    `## Package boundary\n\nThe archive contains no raw frames, source assets, prototype internals, Blender files, repository history dump, private host path, credential, or nested archive. Every non-self entry is bound by byte size and SHA-256 in \`MANIFEST.json\`; the detached manifest binds both the canonical stored ZIP and its in-archive manifest; a separate process produces the audit sibling.\n\n` +
    `## Human gates\n\nAll six Phase 5B gates remain **PENDING HUMAN REVIEW**. Machine PASS is not human acceptance. Phase 6 remains **UNAUTHORIZED**, \`main\` remains unchanged, and neither the author nor deployer may self-approve.\n`;
}

export function validateReviewPolicy(document) {
  assert.deepEqual(document.humanReviewGates, HUMAN_REVIEW_GATES, "all six human-review gates must remain pending");
  assert.deepEqual(document.authorization, AUTHORIZATION, "authorization must remain entirely false");
  if (document.policy?.phase6 !== "UNAUTHORIZED" || document.policy?.pendingGateCount !== 6 || document.policy?.machinePassGrantsHumanAcceptance !== false) throw new Error("Phase 6 review policy differs");
  return true;
}

export function selfTest() {
  assert.equal(expectedEvidenceArtifactPaths().length, 126);
  assert.equal(expectedEvidencePaths().length, 127);
  assert.equal(CROSS_ROUTE_ARTIFACTS.length, 5);
  assert.equal(ROUTE_ORDER.length, 9);
  assert.equal(MOTION_ROUTE_IDS.length, 7);
  assert.equal(expectedEvidenceArtifactPaths().filter((item) => item.startsWith("routes/")).length, 115);
  assert.equal(expectedPackagePayloadPaths().length, 157);
  assert.equal(expectedPackagePayloadPaths().filter((item) => IMAGE_EXTENSIONS.has(path.posix.extname(item))).length, 90);
  assert.equal(expectedPackagePayloadPaths().filter((item) => VIDEO_EXTENSIONS.has(path.posix.extname(item))).length, 8);
  assert.equal(Object.keys(HUMAN_REVIEW_GATES).length, 6);
  assert.ok(Object.values(HUMAN_REVIEW_GATES).every((value) => value === "PENDING HUMAN REVIEW"));
  assert.ok(Object.values(AUTHORIZATION).every((value) => value === false));
  validateArtifactRoles(buildArtifactRoles(), [...expectedPackagePayloadPaths(), README_FILENAME]);
  validateReviewPolicy({ humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION, policy: { phase6: "UNAUTHORIZED", pendingGateCount: 6, machinePassGrantsHumanAcceptance: false } });
  const sample = createStoredZipBuffer([{ path: README_FILENAME, data: Buffer.from("review\n") }, { path: IN_ARCHIVE_MANIFEST, data: Buffer.from("{}\n") }]);
  assert.ok(sample.length > 100);
  return { schema: `${PACKAGE_SCHEMA}.self-test`, status: "PASS", evidenceFiles: 127, ledgerArtifacts: 126, packagePayloadFiles: 157, archiveEntries: 159, images: 90, videos: 8, maximumArchiveBytes: MAX_ARCHIVE_BYTES, gatesPending: 6, phase6Authorized: false };
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime() {
  return { date: (1 << 5) | 1, time: 0 };
}

export function createStoredZipBuffer(entries) {
  const normalized = entries.map((entry) => ({ path: safeRelativePath(entry.path, "ZIP entry"), data: Buffer.from(entry.data) })).sort((left, right) => lexicalCompare(left.path, right.path));
  if (new Set(normalized.map((entry) => entry.path)).size !== normalized.length) throw new Error("ZIP entries must be unique");
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { date, time } = dosDateTime();
  for (const entry of normalized) {
    const name = Buffer.from(entry.path, "utf8");
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(checksum, 14); local.writeUInt32LE(entry.data.length, 18); local.writeUInt32LE(entry.data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    localParts.push(local, name, entry.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(entry.data.length, 20); central.writeUInt32LE(entry.data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }
  if (normalized.length > 0xffff || offset > 0xffffffff) throw new Error("ZIP32 limits exceeded");
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(normalized.length, 8); end.writeUInt16LE(normalized.length, 10); end.writeUInt32LE(centralDirectory.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export async function assertFreshOutputSet(paths) {
  for (const candidate of paths) {
    try { await access(candidate); throw new Error(`output already exists: ${candidate}`); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  return true;
}

export async function publishFreshSetAtomic(pairs) {
  await assertFreshOutputSet(pairs.map(({ destination }) => destination));
  const published = [];
  try {
    for (const pair of pairs) {
      await rename(pair.source, pair.destination);
      published.push(pair.destination);
    }
  } catch (error) {
    await Promise.all(published.map((destination) => unlink(destination).catch(() => {})));
    throw error;
  }
  return true;
}

async function canonicalFuturePath(candidate) {
  const resolved = assertExternalPath(candidate, "output");
  await mkdir(path.dirname(resolved), { recursive: true });
  const parent = await realpath(path.dirname(resolved));
  const result = path.join(parent, path.basename(resolved));
  assertExternalPath(result, "output");
  return result;
}

function sibling(output, filename) {
  return path.join(path.dirname(output), filename);
}

async function spawnAuditor(args) {
  const { stdout } = await run(process.execPath, [AUDITOR, ...args], "independent Phase 5B package auditor", { maxBuffer: 5_000_000 });
  return JSON.parse(stdout);
}

export async function assemblePackage(input) {
  const options = validateOptionShape(input);
  const output = await canonicalFuturePath(options.output);
  const detachedOutput = sibling(output, DETACHED_MANIFEST_FILENAME);
  const auditOutput = sibling(output, AUDIT_FILENAME);
  await assertFreshOutputSet([output, detachedOutput, auditOutput]);

  const [evidenceRoot, storyboardRoot, ffprobe, cp7, cp8, deployment, repository] = await Promise.all([
    resolveExternalInput(options.evidenceRoot, "deployed evidence root", "directory"),
    resolveExternalInput(options.storyboardRoot, "accepted storyboard root", "directory"),
    validateFfprobe(options.ffprobe),
    readExternalReport(options.cp7Report, REPORT_PATHS.responsiveAccessibility, "CP7 responsive/accessibility report"),
    readExternalReport(options.cp8Report, REPORT_PATHS.publicationMediaPerformance, "CP8 clean-head report"),
    readExternalReport(options.deploymentReport, REPORT_PATHS.deployment, "deployment report"),
    repositoryAuthority(options),
  ]);
  if (isWithin(evidenceRoot, output) || isWithin(storyboardRoot, output)) throw new Error("output must be disjoint from deployed evidence and accepted storyboard inputs");
  validateCp7(cp7); validateCp8(cp8); validateDeployment(deployment, options);
  const [deployed, accepted, build] = await Promise.all([
    collectDeployedEvidence(evidenceRoot, options, ffprobe),
    collectAcceptedStoryboards(storyboardRoot),
    buildAuthority(repository.generatedAt),
  ]);
  validateDeploymentDist(deployment.document, build);

  const generatedReports = [
    { relativePath: REPORT_PATHS.git, data: Buffer.from(stableJson(repository)) },
    { relativePath: REPORT_PATHS.build, data: Buffer.from(stableJson(build)) },
  ];
  const repositoryDocs = await Promise.all(REPOSITORY_DOCS.map(async ({ source, archive }) => {
    const data = await readFile(path.join(ROOT, ...source.split("/")));
    assertAllowedEntry(archive); assertNoPrivateText(data, archive);
    return { relativePath: archive, sourceRelativePath: source, data };
  }));
  const readme = { relativePath: README_FILENAME, data: Buffer.from(readmeText(repository, options)) };
  const entries = [
    ...deployed.artifacts,
    deployed.reportItem,
    ...accepted.artifacts,
    accepted.manifestItem,
    cp7,
    cp8,
    deployment,
    ...generatedReports,
    ...repositoryDocs,
    readme,
  ].map((entry) => ({ ...entry, data: Buffer.from(entry.data) }));
  exactPaths(entries.map(({ relativePath }) => relativePath), [...expectedPackagePayloadPaths(), README_FILENAME], "pre-manifest package surface");
  validateArtifactRoles(buildArtifactRoles(), entries.map(({ relativePath }) => relativePath));

  const files = [];
  for (const entry of entries.sort((left, right) => lexicalCompare(left.relativePath, right.relativePath))) {
    assertAllowedEntry(entry.relativePath); assertNoPrivateText(entry.data, entry.relativePath);
    files.push({
      relativePath: entry.relativePath,
      byteSize: entry.data.length,
      sha256: sha256(entry.data),
      kind: kindFor(entry.relativePath),
      role: roleFor(entry.relativePath),
      ...(entry.media ? { media: entry.media } : {}),
    });
  }
  const sourceBytes = files.reduce((sum, record) => sum + record.byteSize, 0);
  const manifest = {
    schema: PACKAGE_SCHEMA,
    status: "MACHINE INTEGRITY PASS — HUMAN REVIEW PENDING",
    generatedAt: repository.generatedAt,
    fixedZipEpoch: FIXED_EPOCH,
    git: { branch: repository.branch, head: repository.head, upstream: repository.upstream, acceptedPhase5AR: ACCEPTED_PHASE5AR_SHA, main: FROZEN_MAIN_SHA, cleanTree: true },
    deployment: { id: options.expectedDeploymentId, project: REQUIRED_PROJECT, immutableUrl: options.immutableUrl, branchUrl: options.branchUrl, verificationReportSha256: sha256(deployment.data) },
    authorities: { deployedCaptureReportSha256: sha256(deployed.reportItem.data), acceptedStoryboardManifestSha256: sha256(accepted.manifestItem.data), cp7Sha256: sha256(cp7.data), cp8Sha256: sha256(cp8.data), gitReportSha256: sha256(generatedReports[0].data), buildReportSha256: sha256(generatedReports[1].data) },
    inventory: { evidenceSourceFiles: 127, evidenceLedgerArtifacts: 126, crossRouteFiles: 5, routeFolders: 9, deployedRouteFiles: 115, acceptedStoryboardFiles: 18, homepageRegressionFiles: 6, reportFiles: 13, images: 90, videos: 8, hashedNonSelfFiles: files.length, hashedNonSelfBytes: sourceBytes, archiveEntries: files.length + 1, maximumArchiveBytes: MAX_ARCHIVE_BYTES },
    artifactRoles: buildArtifactRoles(),
    files,
    traceability: { everyNonSelfFileHasSizeAndSha256: true, inArchiveManifestBoundByDetachedManifest: true, detachedManifestBoundByIndependentAudit: true, imageAndVideoDecodeAudit: true, canonicalUniqueStoredZip: true },
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
    policy: { phase6: "UNAUTHORIZED", pendingGateCount: 6, machinePassGrantsHumanAcceptance: false },
  };
  validateReviewPolicy(manifest);
  const manifestBytes = Buffer.from(stableJson(manifest));
  assertNoPrivateText(manifestBytes, IN_ARCHIVE_MANIFEST);
  const archiveBytes = createStoredZipBuffer([...entries.map(({ relativePath, data }) => ({ path: relativePath, data })), { path: IN_ARCHIVE_MANIFEST, data: manifestBytes }]);
  if (archiveBytes.length > MAX_ARCHIVE_BYTES) throw new Error(`review ZIP is ${archiveBytes.length} bytes; maximum is ${MAX_ARCHIVE_BYTES}`);

  const detached = {
    schema: DETACHED_SCHEMA,
    status: "PASS",
    generatedAt: repository.generatedAt,
    archive: { filename: ARCHIVE_FILENAME, byteSize: archiveBytes.length, sha256: sha256(archiveBytes), entries: files.length + 1, canonicalUniqueStoredZip: true },
    inArchiveManifest: { path: IN_ARCHIVE_MANIFEST, byteSize: manifestBytes.length, sha256: sha256(manifestBytes), schema: PACKAGE_SCHEMA },
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
    policy: manifest.policy,
  };
  validateReviewPolicy(detached);
  const detachedBytes = Buffer.from(stableJson(detached));
  assertNoPrivateText(detachedBytes, DETACHED_MANIFEST_FILENAME);

  const staging = path.join(path.dirname(output), `.phase5b-review-${randomUUID()}`);
  await mkdir(staging, { recursive: false });
  const stagedArchive = path.join(staging, ARCHIVE_FILENAME);
  const stagedDetached = path.join(staging, DETACHED_MANIFEST_FILENAME);
  const stagedAudit = path.join(staging, AUDIT_FILENAME);
  try {
    await writeFile(stagedArchive, archiveBytes, { flag: "wx" });
    await writeFile(stagedDetached, detachedBytes, { flag: "wx" });
    const auditResult = await spawnAuditor([
      "--archive", stagedArchive,
      "--manifest", stagedDetached,
      "--audit-output", stagedAudit,
      "--expected-head", options.expectedHead,
      "--expected-upstream", options.expectedUpstream,
      "--expected-branch", options.expectedBranch,
      "--expected-main", options.expectedMain,
      "--accepted-phase5ar", options.acceptedPhase5AR,
      "--expected-deployment-id", options.expectedDeploymentId,
      "--deployment-project", options.deploymentProject,
      "--immutable-url", options.immutableUrl,
      "--branch-url", options.branchUrl,
      "--ffprobe", ffprobe,
      "--expected-parent-process-id", String(process.pid),
    ]);
    if (auditResult.status !== "PASS") throw new Error("independent auditor did not report PASS");
    await publishFreshSetAtomic([
      { source: stagedArchive, destination: output },
      { source: stagedDetached, destination: detachedOutput },
      { source: stagedAudit, destination: auditOutput },
    ]);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { schema: `${PACKAGE_SCHEMA}.result`, status: "PASS", archive: { path: output, byteSize: archiveBytes.length, sha256: sha256(archiveBytes) }, detachedManifest: detachedOutput, independentAudit: auditOutput, humanReviewGates: HUMAN_REVIEW_GATES, phase6Authorized: false };
}

function dryRunReport() {
  return {
    schema: `${PACKAGE_SCHEMA}.dry-run`,
    status: "PASS",
    writesPerformed: false,
    archiveFilename: ARCHIVE_FILENAME,
    detachedManifestFilename: DETACHED_MANIFEST_FILENAME,
    auditFilename: AUDIT_FILENAME,
    topology: selfTest(),
    requiredInputs: ["deployed evidence root", "accepted storyboard root", "deployment report", "CP7 report", "CP8 clean-head report", "ffprobe", "expected HEAD/deployment/URLs", "fresh durable output"],
  };
}

function printHelp() {
  process.stdout.write([
    "Phase 5B supporting-route production human-review packager", "",
    `node scripts/${path.basename(SCRIPT)} \\`,
    "  --deployed-evidence-root <external-directory> \\",
    "  --accepted-storyboard-root <external-directory> \\",
    "  --deployment-report <external-json> --cp7-report <external-json> --cp8-report <external-json> \\",
    "  --expected-head <40-hex> --expected-upstream <same-40-hex> \\",
    "  --expected-deployment-id <uuid> --immutable-url <https-origin/> --branch-url <https-origin/> \\",
    "  --ffprobe <absolute-executable> --output <external exact ZIP path>", "",
    "Use --self-test or --dry-run for write-free contract checks.", "",
  ].join("\n"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  if (options.selfTest) { process.stdout.write(stableJson(selfTest())); return; }
  if (options.dryRun) { process.stdout.write(stableJson(dryRunReport())); return; }
  process.stdout.write(stableJson(await assemblePackage(options)));
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { process.stderr.write(`Phase 5B human-review package FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
