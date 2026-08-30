#!/usr/bin/env node

/**
 * Independent Phase 5B human-review package auditor.
 *
 * This file deliberately imports nothing from the packager. ZIP parsing,
 * canonical reconstruction, topology, hashes, privacy, media, Git, and review
 * policy are reimplemented so a shared packager defect cannot certify itself.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

const execFileAsync = promisify(execFile);
const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT), "..");

export const PACKAGE_SCHEMA = "quantum-hub.phase-5b.supporting-route-production-human-review.v1";
export const DETACHED_SCHEMA = `${PACKAGE_SCHEMA}.detached-manifest`;
export const AUDIT_SCHEMA = `${PACKAGE_SCHEMA}.independent-audit`;
export const ARCHIVE_FILENAME = "phase-5b-supporting-route-production-human-review.zip";
export const DETACHED_MANIFEST_FILENAME = "phase-5b-supporting-route-production-human-review-manifest.json";
export const AUDIT_FILENAME = "phase-5b-supporting-route-production-human-review-audit.json";
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const README_FILENAME = "README.md";
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
  "Establish Phase 5B route production architecture", "Implement Phase 5B industry and startup experiences",
  "Implement Phase 5B industry territory experience", "Implement Phase 5B Proof and Maradin documentary routes",
  "Implement Phase 5B SPARK and About experiences", "Implement Phase 5B Contact and 404 experiences",
  "Harden Phase 5B responsive and accessibility behavior", "Harden Phase 5B publication media and performance safety",
  "Complete Phase 5B deployed human-review evidence",
]);
export const FIXED_CHECKPOINT_SHAS = Object.freeze(["1fcc260fc51810934b160eec38971184db2008e1", "58a87e333cca47b2495c373d2c934e69ec25d290", "5458b5d74411ac16b83874b725cc021605851326", "996c9a05a0f8a3a810f0d47a0288c12fac430093", "11952af17bb1cdb3f079902dfb5300ddafe42594", "508d54a517b9c28ac683fb3257df3afad24b72bb", CP7_HEAD, CP8_HEAD]);

export const DEFAULT_PROFILE = "cp9";
export const R1_PROFILE = "r1";
export const R2_PROFILE = "r2";
export const R1_PACKAGE_SCHEMA = "quantum-hub.phase-5b-r1.about-dark-v2-fidelity-human-review.v1";
export const R1_DETACHED_SCHEMA = `${R1_PACKAGE_SCHEMA}.detached-manifest`;
export const R1_AUDIT_SCHEMA = `${R1_PACKAGE_SCHEMA}.independent-audit`;
export const R1_ARCHIVE_FILENAME = "phase-5b-r1-about-dark-v2-fidelity-human-review.zip";
export const R1_DETACHED_MANIFEST_FILENAME = "phase-5b-r1-about-dark-v2-fidelity-human-review-manifest.json";
export const R1_AUDIT_FILENAME = "phase-5b-r1-about-dark-v2-fidelity-human-review-audit.json";
export const R1_REQUIRED_BRANCH = "repair/phase-5b-r1-about-dark-v2-fidelity";
export const R1_REQUIRED_BRANCH_URL = null;
export const R1_PARENT_SHA = "011abd3e5fc7464d5a0133603d222110df13b820";
export const R1_COMMIT_SUBJECT = "Repair Phase 5B About Dark V2 fidelity";
export const R1_PRODUCTION_DELTA = Object.freeze(["M\tsrc/styles/routes/about.css"]);
export const R1_CHECKPOINT_SUBJECTS = Object.freeze([...CHECKPOINT_SUBJECTS, R1_COMMIT_SUBJECT]);
export const R1_FIXED_CHECKPOINT_SHAS = Object.freeze([...FIXED_CHECKPOINT_SHAS, R1_PARENT_SHA]);
export const R2_PACKAGE_SCHEMA = "quantum-hub.phase-5b-r2.home-navigation-manifesto-human-review.v1";
export const R2_DETACHED_SCHEMA = `${R2_PACKAGE_SCHEMA}.detached-manifest`;
export const R2_AUDIT_SCHEMA = `${R2_PACKAGE_SCHEMA}.independent-audit`;
export const R2_ARCHIVE_FILENAME = "phase-5b-r2-home-navigation-manifesto-human-review.zip";
export const R2_DETACHED_MANIFEST_FILENAME = "phase-5b-r2-home-navigation-manifesto-human-review-manifest.json";
export const R2_AUDIT_FILENAME = "phase-5b-r2-home-navigation-manifesto-human-review-audit.json";
export const R2_REQUIRED_BRANCH = "repair/phase-5b-r2-home-navigation-manifesto";
export const R2_REQUIRED_BRANCH_URL = null;
export const R2_PARENT_SHA = "ca22ae2f234302e7485803c560866abd7757735e";
export const R2_COMMIT_SUBJECT = "Repair Phase 5B home navigation and manifesto";
export const R2_ALLOWED_PRODUCTION_PATHS = Object.freeze([
  "src/components/SiteHeader.astro",
  "src/components/home/EntryField.astro",
  "src/pages/index.astro",
  "src/scripts/home-cinematic-integration.ts",
  "src/styles/routes/home.css",
  "src/styles/routes/home-cinematic.css",
  "src/styles/routes/home-responsive.css",
]);
export const R2_CHECKPOINT_SUBJECTS = Object.freeze([...R1_CHECKPOINT_SUBJECTS, R2_COMMIT_SUBJECT]);
export const R2_FIXED_CHECKPOINT_SHAS = Object.freeze([...R1_FIXED_CHECKPOINT_SHAS, R2_PARENT_SHA]);

const REVIEW_PROFILES = Object.freeze({
  [DEFAULT_PROFILE]: Object.freeze({
    id: DEFAULT_PROFILE,
    packageSchema: PACKAGE_SCHEMA,
    detachedSchema: DETACHED_SCHEMA,
    auditSchema: AUDIT_SCHEMA,
    archiveFilename: ARCHIVE_FILENAME,
    detachedManifestFilename: DETACHED_MANIFEST_FILENAME,
    auditFilename: AUDIT_FILENAME,
    requiredBranch: REQUIRED_BRANCH,
    requiredBranchUrl: REQUIRED_BRANCH_URL,
    checkpointSubjects: CHECKPOINT_SUBJECTS,
    fixedCheckpointShas: FIXED_CHECKPOINT_SHAS,
    exactParent: null,
  }),
  [R1_PROFILE]: Object.freeze({
    id: R1_PROFILE,
    packageSchema: R1_PACKAGE_SCHEMA,
    detachedSchema: R1_DETACHED_SCHEMA,
    auditSchema: R1_AUDIT_SCHEMA,
    archiveFilename: R1_ARCHIVE_FILENAME,
    detachedManifestFilename: R1_DETACHED_MANIFEST_FILENAME,
    auditFilename: R1_AUDIT_FILENAME,
    requiredBranch: R1_REQUIRED_BRANCH,
    requiredBranchUrl: R1_REQUIRED_BRANCH_URL,
    checkpointSubjects: R1_CHECKPOINT_SUBJECTS,
    fixedCheckpointShas: R1_FIXED_CHECKPOINT_SHAS,
    exactParent: R1_PARENT_SHA,
  }),
  [R2_PROFILE]: Object.freeze({
    id: R2_PROFILE,
    packageSchema: R2_PACKAGE_SCHEMA,
    detachedSchema: R2_DETACHED_SCHEMA,
    auditSchema: R2_AUDIT_SCHEMA,
    archiveFilename: R2_ARCHIVE_FILENAME,
    detachedManifestFilename: R2_DETACHED_MANIFEST_FILENAME,
    auditFilename: R2_AUDIT_FILENAME,
    requiredBranch: R2_REQUIRED_BRANCH,
    requiredBranchUrl: R2_REQUIRED_BRANCH_URL,
    checkpointSubjects: R2_CHECKPOINT_SUBJECTS,
    fixedCheckpointShas: R2_FIXED_CHECKPOINT_SHAS,
    exactParent: R2_PARENT_SHA,
  }),
});

export function reviewProfile(value = DEFAULT_PROFILE) {
  const profile = REVIEW_PROFILES[String(value ?? DEFAULT_PROFILE).toLowerCase()];
  if (!profile) throw new Error(`--profile must be ${[DEFAULT_PROFILE, R1_PROFILE, R2_PROFILE].join(", ")}`);
  return profile;
}

export const ROUTES = Object.freeze([
  Object.freeze({ id: "for-industry", mode: "C" }),
  Object.freeze({ id: "for-startups", mode: "C" }),
  Object.freeze({ id: "industries", mode: "C" }),
  Object.freeze({ id: "proof", mode: "B" }),
  Object.freeze({ id: "maradin", mode: "B" }),
  Object.freeze({ id: "spark", mode: "B" }),
  Object.freeze({ id: "about", mode: "B" }),
  Object.freeze({ id: "contact", mode: "A" }),
  Object.freeze({ id: "404", mode: "A" }),
]);
export const ROUTE_ORDER = Object.freeze(ROUTES.map(({ id }) => id));
export const CROSS_ROUTE_ARTIFACTS = Object.freeze(["all-route-desktop.png", "all-route-portrait.png", "all-route-320.png", "all-route-844-landscape.png", "navigation-recording.mp4"]);
export const ROUTE_COMMON_ARTIFACTS = Object.freeze(["production-comparison.png", "desktop-key-states.png", "mobile-key-states.png", "320.png", "844-landscape.png", "reduced-motion.png", "no-js.png", "text-200.png", "accessibility.json", "performance.json", "publication.json", "network-media.json"]);
export const ROUTE_RECORDING = "route-recording.mp4";
export const HOMEPAGE_ARTIFACTS = Object.freeze(["manifesto.png", "audience-split.png", "crt-startup.png", "current.png", "q.png", "regression.json"]);
export const R2_RECORDING_FILENAMES = Object.freeze(["01-fresh-forward-autonomous-manifesto.mp4", "02-reverse-reentry-autonomous-manifesto.mp4", "03-supporting-route-logo-home-navigation.mp4", "04-homepage-home-navigation.mp4", "05-mobile-home-navigation.mp4"]);
export const R2_VIEWPORTS = Object.freeze([[1440, 900], [1366, 650], [1280, 800], [1024, 768], [768, 1024], [390, 844], [360, 800], [320, 800], [844, 390], [740, 360], [800, 360], [896, 414], [900, 480]]);
export const R2_RESPONSIVE_FILENAMES = Object.freeze([...R2_VIEWPORTS.map(([width, height]) => `manifesto-${width}x${height}.png`), "manifesto-200-percent.png", "manifesto-fallback-fonts.png", "manifesto-reduced-motion.png", "manifesto-no-js.png"]);
export const R2_COMPARISON_FILENAMES = Object.freeze(["r1-vs-r2-manifesto.png", "historical-vs-r2-manifesto.png"]);
export const R2_REPORT_FILENAMES = Object.freeze(["home-navigation-manifesto-runtime.json", "home-navigation-frame-audit.json", "manifesto-responsive-accessibility.json", "supporting-route-source-regression.json", "phase4-media-hashes.json", "homepage-regression.json"]);
export const R2_CAPTURE_SCHEMA = "quantum-hub.phase-5b-r2.home-navigation-manifesto-deployed-browser-evidence.v1";
export const ACCEPTED_STORYBOARD_ARTIFACTS = Object.freeze(["desktop-storyboard--1440x900.png", "route-brief-delta.md"]);
export const REPOSITORY_DOC_ARCHIVES = Object.freeze([
  "reports/PHASE_5B_IMPLEMENTATION_ARCHITECTURE.md",
  "reports/PHASE_5B_LONG_TASK_BASELINE.md",
  "reports/PHASE_5B_RESPONSIVE_ACCESSIBILITY.md",
  "reports/PHASE_5B_PUBLICATION_MEDIA_PERFORMANCE.md",
  "reports/PHASE_5B_PRODUCTION_ANTI_TEMPLATE_AUDIT.md",
  "reports/PHASE_5B_CSS_DUPLICATION_AUDIT.md",
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
export const AUTHORIZATION = Object.freeze({ authorSelfApproved: false, deployerSelfApproved: false, machinePassGrantsHumanAcceptance: false, humanAccepted: false, phase5BComplete: false, phase6Authorized: false, mainMerged: false });
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
const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_unused, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
}));

function lexicalCompare(left, right) { return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")); }
export function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) return Object.fromEntries(Object.keys(value).sort(lexicalCompare).map((key) => [key, stableValue(value[key])]));
  return value;
}
export function stableJson(value) { return `${JSON.stringify(stableValue(value), null, 2)}\n`; }

export function requiredR2EvidenceArtifactPaths() {
  return [
    ...R2_RESPONSIVE_FILENAMES.map((name) => `homepage-r2/responsive/${name}`),
    ...R2_COMPARISON_FILENAMES.map((name) => `homepage-r2/comparisons/${name}`),
    ...R2_RECORDING_FILENAMES.map((name) => `homepage-r2/recordings/${name}`),
    ...R2_REPORT_FILENAMES.map((name) => `homepage-r2/reports/${name}`),
  ].sort(lexicalCompare);
}
export function expectedEvidenceArtifactPaths(profileValue = DEFAULT_PROFILE) {
  const profile = reviewProfile(profileValue);
  return [
    ...CROSS_ROUTE_ARTIFACTS.map((name) => `cross-route/${name}`),
    ...ROUTES.flatMap(({ id, mode }) => [...ROUTE_COMMON_ARTIFACTS.map((name) => `routes/${id}/${name}`), ...(mode === "A" ? [] : [`routes/${id}/${ROUTE_RECORDING}`])]),
    ...HOMEPAGE_ARTIFACTS.map((name) => `homepage/${name}`),
    ...(profile.id === R2_PROFILE ? requiredR2EvidenceArtifactPaths() : []),
  ].sort(lexicalCompare);
}
export function evidenceToArchivePath(relativePath) {
  if (relativePath.startsWith("cross-route/")) return relativePath;
  if (relativePath.startsWith("routes/")) return `per-route/${relativePath.slice("routes/".length)}`;
  if (relativePath.startsWith("homepage/")) return `homepage-regression/${relativePath.slice("homepage/".length)}`;
  if (relativePath.startsWith("homepage-r2/")) return relativePath;
  throw new Error(`unknown evidence path: ${relativePath}`);
}
export function expectedPackagePayloadPaths(profileValue = DEFAULT_PROFILE, evidencePaths = expectedEvidenceArtifactPaths(profileValue)) {
  return [
    ...evidencePaths.map(evidenceToArchivePath),
    ...ROUTE_ORDER.flatMap((id) => ACCEPTED_STORYBOARD_ARTIFACTS.map((name) => `per-route/${id}/${name}`)),
    ...Object.values(REPORT_PATHS),
    ...REPOSITORY_DOC_ARCHIVES,
  ].sort(lexicalCompare);
}

export function validateEvidenceArtifactPaths(paths, profileValue = DEFAULT_PROFILE) {
  const profile = reviewProfile(profileValue);
  const actual = [...paths].sort(lexicalCompare);
  if (new Set(actual).size !== actual.length) throw new Error("deployed evidence contains duplicate paths");
  if (profile.id !== R2_PROFILE) {
    exactPaths(actual, expectedEvidenceArtifactPaths(profile.id), `deployed capture ${profile.id} ledger`);
    return actual;
  }
  const required = expectedEvidenceArtifactPaths(R2_PROFILE);
  const actualSet = new Set(actual);
  for (const relativePath of required) if (!actualSet.has(relativePath)) throw new Error(`R2 deployed capture omits required evidence: ${relativePath}`);
  for (const relativePath of actual) {
    safeRelativePath(relativePath, "R2 deployed-evidence path");
    if (required.includes(relativePath)) continue;
    if (!/^homepage-r2\/(?:responsive|comparisons|recordings|reports)\//.test(relativePath)) throw new Error(`unexpected R2 deployed-evidence path: ${relativePath}`);
    const extension = path.posix.extname(relativePath).toLowerCase();
    const directory = relativePath.split("/")[1];
    if ((directory === "recordings" && !VIDEO_EXTENSIONS.has(extension)) || (["responsive", "comparisons"].includes(directory) && !IMAGE_EXTENSIONS.has(extension)) || (directory === "reports" && extension !== ".json")) throw new Error(`unexpected R2 evidence type: ${relativePath}`);
  }
  return actual;
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
export function safeRelativePath(value, label = "path") {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) throw new Error(`${label} must be a portable relative path`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`${label} is unsafe: ${value}`);
  return value;
}
function assertExternalPath(candidate, label) {
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root || isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved)) throw new Error(`${label} must be durable and outside the repository, OS temp, and drive root`);
  return resolved;
}
export function assertAllowedEntry(relativePath) {
  safeRelativePath(relativePath, "package entry");
  if (FORBIDDEN_ENTRY.test(relativePath)) throw new Error(`forbidden raw/assets/source/prototype/history/private payload: ${relativePath}`);
  if ([README_FILENAME, IN_ARCHIVE_MANIFEST].includes(relativePath)) return true;
  if (!new Set(["cross-route", "per-route", "homepage-regression", "homepage-r2", "reports"]).has(relativePath.split("/")[0])) throw new Error(`entry is outside the Phase 5B review surface: ${relativePath}`);
  if (!ALLOWED_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())) throw new Error(`unsupported review payload: ${relativePath}`);
  return true;
}
function semanticJsonText(value) {
  const values = [];
  const visit = (node, key = "") => {
    if (typeof node === "string") { values.push(node); if (key) values.push(`${key}: ${node}`); }
    else if (Array.isArray(node)) node.forEach((item) => visit(item, key));
    else if (node && typeof node === "object") Object.entries(node).forEach(([childKey, item]) => visit(item, childKey));
    else if (key && node !== null && node !== undefined) values.push(`${key}: ${node}`);
  };
  visit(value); return values.join("\n");
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

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function rebuildStoredZip(entries) {
  const normalized = [...entries.entries()].map(([entryPath, data]) => ({ path: entryPath, data: Buffer.from(data) })).sort((left, right) => lexicalCompare(left.path, right.path));
  const localParts = []; const centralParts = []; let offset = 0; const date = (1 << 5) | 1; const time = 0;
  for (const entry of normalized) {
    const name = Buffer.from(entry.path, "utf8"); const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(checksum, 14); local.writeUInt32LE(entry.data.length, 18); local.writeUInt32LE(entry.data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    localParts.push(local, name, entry.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(entry.data.length, 20); central.writeUInt32LE(entry.data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centralParts.push(central, name); offset += local.length + name.length + entry.data.length;
  }
  const central = Buffer.concat(centralParts); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(normalized.length, 8); end.writeUInt16LE(normalized.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, central, end]);
}

export function parseStoredZip(input) {
  const bytes = Buffer.from(input);
  if (bytes.length < 22 || bytes.length > MAX_ARCHIVE_BYTES) throw new Error("ZIP size boundary failed");
  const endOffset = bytes.length - 22;
  if (bytes.readUInt32LE(endOffset) !== 0x06054b50 || bytes.readUInt16LE(endOffset + 20) !== 0) throw new Error("canonical EOCD missing or commented");
  const disk = bytes.readUInt16LE(endOffset + 4); const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const diskEntries = bytes.readUInt16LE(endOffset + 8); const entriesCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12); const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (disk || centralDisk || diskEntries !== entriesCount || centralOffset + centralSize !== endOffset) throw new Error("multi-disk or malformed central directory");
  const entries = new Map(); let cursor = centralOffset; let expectedLocalOffset = 0; let previous = null;
  for (let index = 0; index < entriesCount; index += 1) {
    if (cursor + 46 > endOffset || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("central directory entry missing");
    const flags = bytes.readUInt16LE(cursor + 8); const method = bytes.readUInt16LE(cursor + 10); const time = bytes.readUInt16LE(cursor + 12); const date = bytes.readUInt16LE(cursor + 14);
    const checksum = bytes.readUInt32LE(cursor + 16); const compressed = bytes.readUInt32LE(cursor + 20); const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28); const extraLength = bytes.readUInt16LE(cursor + 30); const commentLength = bytes.readUInt16LE(cursor + 32); const startDisk = bytes.readUInt16LE(cursor + 34); const localOffset = bytes.readUInt32LE(cursor + 42);
    if (flags !== 0x0800 || method !== 0 || time !== 0 || date !== ((1 << 5) | 1) || compressed !== size || extraLength || commentLength || startDisk) throw new Error("ZIP entry is not canonical stored UTF-8");
    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > endOffset) throw new Error("central filename is truncated");
    const entryPath = bytes.subarray(cursor + 46, nameEnd).toString("utf8"); safeRelativePath(entryPath, "ZIP entry"); assertAllowedEntry(entryPath);
    if (entries.has(entryPath) || (previous !== null && lexicalCompare(previous, entryPath) >= 0)) throw new Error("ZIP paths are duplicate or not canonical lexical order");
    if (localOffset !== expectedLocalOffset || localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("local entry offset differs");
    const localFlags = bytes.readUInt16LE(localOffset + 6); const localMethod = bytes.readUInt16LE(localOffset + 8); const localTime = bytes.readUInt16LE(localOffset + 10); const localDate = bytes.readUInt16LE(localOffset + 12); const localCrc = bytes.readUInt32LE(localOffset + 14); const localCompressed = bytes.readUInt32LE(localOffset + 18); const localSize = bytes.readUInt32LE(localOffset + 22); const localNameLength = bytes.readUInt16LE(localOffset + 26); const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    if (localFlags !== flags || localMethod !== method || localTime !== time || localDate !== date || localCrc !== checksum || localCompressed !== compressed || localSize !== size || localNameLength !== nameLength || localExtraLength) throw new Error("local and central ZIP metadata differ");
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    if (localName !== entryPath) throw new Error("local and central ZIP paths differ");
    const dataStart = localOffset + 30 + localNameLength; const dataEnd = dataStart + size;
    if (dataEnd > centralOffset) throw new Error("ZIP payload is truncated");
    const data = bytes.subarray(dataStart, dataEnd);
    if (crc32(data) !== checksum) throw new Error(`CRC rejection for ${entryPath}`);
    entries.set(entryPath, Buffer.from(data)); previous = entryPath; expectedLocalOffset = dataEnd; cursor = nameEnd;
  }
  if (cursor !== endOffset || expectedLocalOffset !== centralOffset) throw new Error("ZIP directory/local surfaces are not contiguous");
  if (!rebuildStoredZip(entries).equals(bytes)) throw new Error("ZIP is not the unique canonical stored encoding");
  return { entries, canonical: true, crcValidated: true };
}

function exactPaths(actual, expected, label) { assert.deepEqual([...actual].sort(lexicalCompare), [...expected].sort(lexicalCompare), `${label} differs`); }
function parseJsonEntry(entries, relativePath) {
  const bytes = entries.get(relativePath); if (!bytes) throw new Error(`missing JSON entry: ${relativePath}`);
  try { return JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`invalid JSON entry: ${relativePath}`); }
}
function containsScalar(value, expected) {
  if (["string", "number", "boolean"].includes(typeof value)) return String(value).toLowerCase() === String(expected).toLowerCase();
  if (Array.isArray(value)) return value.some((item) => containsScalar(item, expected));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsScalar(item, expected));
  return false;
}
function extractLedger(document, label) {
  const records = [document.files, document.artifacts, document.ledger, document.inventory?.files, document.evidence?.files].find(Array.isArray);
  if (!records) throw new Error(`${label} omits a file ledger`);
  const map = new Map();
  for (const record of records) {
    const relativePath = record?.relativePath ?? record?.path; const byteSize = record?.byteSize ?? record?.bytes ?? record?.size; const hash = String(record?.sha256 ?? "").toLowerCase();
    safeRelativePath(relativePath, `${label} path`);
    if (map.has(relativePath) || !Number.isSafeInteger(byteSize) || byteSize < 0 || !HASH64.test(hash)) throw new Error(`${label} ledger record differs: ${relativePath}`);
    map.set(relativePath, { ...record, relativePath, byteSize, sha256: hash });
  }
  return map;
}
function assertPassReport(document, label) {
  if (!document || document.status !== "PASS") throw new Error(`${label} must report PASS`);
  if (Array.isArray(document.failures) && document.failures.length) throw new Error(`${label} contains failures`);
  if (Number.isFinite(document.failures) && document.failures !== 0) throw new Error(`${label} contains failures`);
  if (Number.isFinite(document.summary?.failures) && document.summary.failures !== 0) throw new Error(`${label} contains failures`);
}

export function buildArtifactRoles(profileValue = DEFAULT_PROFILE, evidencePaths = expectedEvidenceArtifactPaths(profileValue)) {
  const profile = reviewProfile(profileValue);
  const roles = {
    crossRoute: CROSS_ROUTE_ARTIFACTS.map((name) => `cross-route/${name}`),
    perRoute: Object.fromEntries(ROUTES.map(({ id, mode }) => [id, { deployed: [...ROUTE_COMMON_ARTIFACTS, ...(mode === "A" ? [] : [ROUTE_RECORDING])].map((name) => `per-route/${id}/${name}`), acceptedStoryboard: `per-route/${id}/desktop-storyboard--1440x900.png`, routeBriefDelta: `per-route/${id}/route-brief-delta.md` }])),
    homepageRegression: HOMEPAGE_ARTIFACTS.map((name) => `homepage-regression/${name}`),
    reports: [...Object.values(REPORT_PATHS), ...REPOSITORY_DOC_ARCHIVES],
    readme: README_FILENAME,
  };
  if (profile.id === R2_PROFILE) {
    const archivePaths = evidencePaths.map(evidenceToArchivePath);
    roles.homepageR2 = {
      responsive: archivePaths.filter((relativePath) => relativePath.startsWith("homepage-r2/responsive/")),
      comparisons: archivePaths.filter((relativePath) => relativePath.startsWith("homepage-r2/comparisons/")),
      recordings: archivePaths.filter((relativePath) => relativePath.startsWith("homepage-r2/recordings/")),
      reports: archivePaths.filter((relativePath) => relativePath.startsWith("homepage-r2/reports/")),
    };
  }
  return roles;
}
function flattenRoles(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => flattenRoles(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => flattenRoles(item, output));
  return output;
}
export function validateArtifactRoles(roles, paths) {
  const rolePaths = flattenRoles(roles);
  if (new Set(rolePaths).size !== rolePaths.length) throw new Error("artifact roles contain duplicate paths");
  exactPaths(rolePaths, paths, "artifact roles"); return true;
}
export function validateReviewPolicy(document) {
  assert.deepEqual(document.humanReviewGates, HUMAN_REVIEW_GATES, "all six human-review gates must remain pending");
  assert.deepEqual(document.authorization, AUTHORIZATION, "authorization must remain false");
  if (document.policy?.phase6 !== "UNAUTHORIZED" || document.policy?.pendingGateCount !== 6 || document.policy?.machinePassGrantsHumanAcceptance !== false) throw new Error("Phase 6 policy differs");
  return true;
}

async function validateImage(bytes, label) {
  const image = sharp(bytes, { failOn: "error", limitInputPixels: 250_000_000, sequentialRead: true }); const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || (metadata.pages && metadata.pages !== 1) || !["png", "jpeg", "webp"].includes(metadata.format)) throw new Error(`image decode failed: ${label}`);
  await image.clone().raw().toBuffer();
  return { type: "image", format: metadata.format, width: metadata.width, height: metadata.height, pages: metadata.pages ?? 1, decoded: true };
}
async function run(command, args, label, maxBuffer = 10_000_000) {
  try { return await execFileAsync(command, args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer }); }
  catch (error) { throw new Error(`${label} failed: ${error.stderr || error.stdout || error.message}`); }
}
async function validateFfprobe(executable) {
  const resolved = await realpath(executable); if (!(await stat(resolved)).isFile()) throw new Error("ffprobe must be a regular file");
  await run(resolved, ["-version"], "independent ffprobe identity", 1_000_000); return resolved;
}
async function probeVideo(ffprobe, file, label) {
  const { stdout } = await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=format_name,duration", "-of", "json", file], `independent ffprobe for ${label}`, 2_000_000);
  let document; try { document = JSON.parse(stdout); } catch { throw new Error(`invalid ffprobe JSON: ${label}`); }
  const streams = Array.isArray(document.streams) ? document.streams : []; const video = streams.find((item) => item.codec_type === "video");
  const result = { type: "video", format: document.format?.format_name ?? null, durationSeconds: Number(document.format?.duration), codec: video?.codec_name ?? null, pixelFormat: video?.pix_fmt ?? null, width: Number(video?.width), height: Number(video?.height), averageFrameRate: video?.avg_frame_rate ?? null, realFrameRate: video?.r_frame_rate ?? null, frameCount: Number(video?.nb_read_frames), videoStreams: streams.filter((item) => item.codec_type === "video").length, audioStreams: streams.filter((item) => item.codec_type === "audio").length, otherStreams: streams.filter((item) => !["video", "audio"].includes(item.codec_type)).length, decoded: true };
  const [numerator, denominator] = String(result.averageFrameRate).split("/").map(Number); const fps = denominator ? numerator / denominator : Number(result.averageFrameRate);
  if (!String(result.format).split(",").includes("mp4") || result.codec !== "h264" || result.pixelFormat !== "yuv420p" || result.videoStreams !== 1 || result.audioStreams !== 0 || result.otherStreams !== 0 || !Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0 || !Number.isSafeInteger(result.frameCount) || result.frameCount <= 0 || !Number.isFinite(fps) || fps <= 0 || fps > 120 || result.width < 16 || result.height < 16) throw new Error(`video decode contract failed: ${label}`);
  return result;
}

function normalizePreview(value, label) {
  let url; try { url = new URL(value); } catch { throw new Error(`${label} must be a URL`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !url.hostname.endsWith(`.${REQUIRED_PROJECT}.pages.dev`)) throw new Error(`${label} must be a credential-free ${REQUIRED_PROJECT} Pages origin`);
  return url.toString();
}
function validateExpected(input) {
  const expected = { ...input };
  const profile = reviewProfile(expected.profile);
  expected.profile = profile.id;
  expected.expectedBranch ??= profile.requiredBranch;
  expected.expectedUpstream ??= expected.expectedHead;
  if (!HASH40.test(expected.expectedHead ?? "") || expected.expectedUpstream !== expected.expectedHead) throw new Error("expected HEAD/upstream differ");
  if (expected.expectedBranch !== profile.requiredBranch || expected.expectedMain !== FROZEN_MAIN_SHA || expected.acceptedPhase5AR !== ACCEPTED_PHASE5AR_SHA) throw new Error("Git authority constants differ");
  if (profile.exactParent && expected.expectedHead === profile.exactParent) throw new Error(`${profile.id.toUpperCase()} expected HEAD must be the new repair commit, not its exact parent`);
  if (!UUID.test(expected.expectedDeploymentId ?? "") || expected.deploymentProject !== REQUIRED_PROJECT) throw new Error("deployment identity differs");
  expected.immutableUrl = normalizePreview(expected.immutableUrl, "immutable URL"); expected.branchUrl = normalizePreview(expected.branchUrl, "branch URL");
  if (expected.immutableUrl === expected.branchUrl) throw new Error("deployment URLs must differ");
  if (profile.requiredBranchUrl && expected.branchUrl !== profile.requiredBranchUrl) throw new Error("branch URL differs from its exact authority");
  if (!profile.requiredBranchUrl && expected.branchUrl === REQUIRED_BRANCH_URL) throw new Error(`the accepted Phase 5B CP9 branch URL cannot authorize the ${profile.id.toUpperCase()} repair package`);
  if (new URL(expected.immutableUrl).hostname !== `${expected.expectedDeploymentId.split("-")[0].toLowerCase()}.${REQUIRED_PROJECT}.pages.dev`) throw new Error("immutable URL does not match deployment UUID prefix");
  return expected;
}

function validateProfileBinding(document, profile, label) {
  if (profile.id === DEFAULT_PROFILE) return true;
  if (document.profile !== profile.id) throw new Error(`${label} omits the ${profile.id.toUpperCase()} profile binding`);
  if (profile.id === R1_PROFILE) {
    assert.deepEqual(document.repair, { exactParent: R1_PARENT_SHA, commitSubject: R1_COMMIT_SUBJECT, productionDelta: [...R1_PRODUCTION_DELTA] }, `${label} R1 repair binding differs`);
  } else {
    if (document.repair?.exactParent !== R2_PARENT_SHA || document.repair?.commitSubject !== R2_COMMIT_SUBJECT) throw new Error(`${label} R2 parent/subject binding differs`);
    assert.deepEqual(document.repair?.productionAllowlist, [...R2_ALLOWED_PRODUCTION_PATHS], `${label} R2 production allowlist differs`);
    validateR2ProductionDelta(document.repair?.productionDelta, `${label} R2 production delta`);
  }
  return true;
}

export function validateR2ProductionDelta(value, label = "R2 production delta") {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be non-empty`);
  const records = value.map((record) => {
    if (!record || !/^[AMD]$/.test(record.status ?? "")) throw new Error(`${label} contains an invalid status`);
    safeRelativePath(record.path, `${label} path`);
    if (!R2_ALLOWED_PRODUCTION_PATHS.includes(record.path)) throw new Error(`${label} exceeds the exact allowlist: ${record.path}`);
    return { status: record.status, path: record.path };
  });
  if (new Set(records.map(({ path: relativePath }) => relativePath)).size !== records.length) throw new Error(`${label} repeats a path`);
  return records;
}

function validateR2EvidenceReports(entries, captureLedger) {
  const report = (filename) => {
    const relativePath = `homepage-r2/reports/${filename}`;
    const document = parseJsonEntry(entries, relativePath);
    assertPassReport(document, relativePath);
    return document;
  };
  const validateEvidence = (document, expectedPaths, label) => {
    if (!Array.isArray(document.evidence)) throw new Error(`${label} omits its evidence hash bindings`);
    exactPaths(document.evidence.map(({ relativePath }) => relativePath), expectedPaths, `${label} evidence roles`);
    for (const record of document.evidence) {
      safeRelativePath(record.relativePath, `${label} evidence path`);
      const authority = captureLedger.get(record.relativePath);
      if (!authority || record.byteSize !== authority.byteSize || record.sha256 !== authority.sha256) throw new Error(`${label} evidence hash binding differs: ${record.relativePath}`);
    }
  };
  const recordings = R2_RECORDING_FILENAMES.map((name) => `homepage-r2/recordings/${name}`);
  const responsive = R2_RESPONSIVE_FILENAMES.map((name) => `homepage-r2/responsive/${name}`);
  const comparisons = R2_COMPARISON_FILENAMES.map((name) => `homepage-r2/comparisons/${name}`);
  const routeReports = ROUTE_ORDER.flatMap((id) => ["accessibility", "performance", "publication", "network-media"].map((name) => `routes/${id}/${name}.json`));
  const legacyHome = HOMEPAGE_ARTIFACTS.map((name) => `homepage/${name}`);
  const runtime = report("home-navigation-manifesto-runtime.json");
  validateEvidence(runtime, recordings.slice(0, 2), "R2 runtime report");
  if (runtime.zeroScrollWriteInstrumentation !== true || runtime.restWorkBounded !== true) throw new Error("R2 runtime report omits zero-scroll-write/rest-work assertions");
  const frames = report("home-navigation-frame-audit.json");
  validateEvidence(frames, recordings, "R2 frame report");
  if (frames.checks?.desktopMobileSupportingHomeInspected !== true || frames.checks?.noF1 !== true) throw new Error("R2 frame report does not prove the required no-F1 inspections");
  const responsiveReport = report("manifesto-responsive-accessibility.json");
  validateEvidence(responsiveReport, [...responsive, ...comparisons], "R2 responsive/accessibility report");
  if (responsiveReport.checks?.thirteenViewports !== true || responsiveReport.checks?.extraVariants !== true || responsiveReport.checks?.comparisons !== true) throw new Error("R2 responsive/accessibility report coverage differs");
  const supporting = report("supporting-route-source-regression.json");
  validateEvidence(supporting, routeReports, "R2 supporting-route regression report");
  if (supporting.checks?.allNineRoutesPass !== true || supporting.checks?.exactR2DeploymentProfile !== true) throw new Error("R2 supporting-route regression report differs");
  const phase4 = report("phase4-media-hashes.json");
  if (!Array.isArray(phase4.assets) || !phase4.assets.length || phase4.checks?.nonEmpty !== true || phase4.checks?.allHashBound !== true) throw new Error("R2 Phase 4 media report omits its asset hash bindings");
  const homepage = report("homepage-regression.json");
  validateEvidence(homepage, [...legacyHome, ...recordings.slice(2), ...comparisons], "R2 homepage regression report");
  if (homepage.checks?.compactHomeRegressionPass !== true || homepage.checks?.threeHomeNavigationRecordingsPass !== true) throw new Error("R2 homepage regression report differs");
  return { runtime, frames, responsive: responsiveReport, supporting, phase4, homepage };
}

async function validateMediaEntries(entries, ledger, ffprobe, expectedImages, expectedVideos) {
  let images = 0; let videos = 0; const temporary = await mkdtemp(path.join(os.tmpdir(), "phase5b-audit-media-"));
  try {
    for (const [relativePath, record] of ledger) {
      const extension = path.posix.extname(relativePath).toLowerCase();
      if (IMAGE_EXTENSIONS.has(extension)) {
        const decoded = await validateImage(entries.get(relativePath), relativePath);
        assert.deepEqual(decoded, record.media, `image metadata differs: ${relativePath}`); images += 1;
      } else if (VIDEO_EXTENSIONS.has(extension)) {
        const extracted = path.join(temporary, `${String(videos).padStart(2, "0")}.mp4`); await writeFile(extracted, entries.get(relativePath), { flag: "wx" });
        const decoded = await probeVideo(ffprobe, extracted, relativePath);
        assert.deepEqual(decoded, record.media, `video metadata differs: ${relativePath}`); videos += 1;
      }
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
  if (images !== expectedImages || videos !== expectedVideos) throw new Error(`media inventory differs: ${images} images / ${videos} videos`);
  return { images, videos };
}

async function validateLocalGit(expected) {
  const profile = reviewProfile(expected.profile);
  const values = await Promise.all([
    run("git", ["rev-parse", "HEAD"], "independent Git HEAD"),
    run("git", ["rev-parse", "@{upstream}"], "independent Git upstream"),
    run("git", ["branch", "--show-current"], "independent Git branch"),
    run("git", ["rev-parse", "main"], "independent local main"),
    run("git", ["rev-parse", "origin/main"], "independent origin main"),
    run("git", ["status", "--porcelain=v1", "--untracked-files=all"], "independent clean tree"),
  ]);
  const [head, upstream, branch, localMain, originMain, statusText] = values.map(({ stdout }) => stdout.trim());
  if (head !== expected.expectedHead || upstream !== expected.expectedUpstream || branch !== profile.requiredBranch || localMain !== FROZEN_MAIN_SHA || originMain !== FROZEN_MAIN_SHA || statusText) throw new Error("independent live Git authority differs");
  if (profile.id === DEFAULT_PROFILE) return { head, upstream, branch, localMain, originMain, cleanTree: true };
  const [{ stdout: parentText }, { stdout: subjectText }, { stdout: deltaText }] = await Promise.all([
    run("git", ["rev-parse", "HEAD^"], `independent ${profile.id.toUpperCase()} Git parent`),
    run("git", ["show", "-s", "--format=%s", "HEAD"], `independent ${profile.id.toUpperCase()} Git subject`),
    run("git", ["diff", "--name-status", "--no-renames", `${profile.exactParent}..HEAD`, "--", "src", "public", "astro.config.mjs"], `independent ${profile.id.toUpperCase()} production delta`),
  ]);
  const parent = parentText.trim();
  const commitSubject = subjectText.trim();
  const productionDelta = deltaText.trim().split(/\r?\n/).filter(Boolean);
  if (profile.id === R1_PROFILE) {
    if (parent !== R1_PARENT_SHA || commitSubject !== R1_COMMIT_SUBJECT || JSON.stringify(productionDelta) !== JSON.stringify(R1_PRODUCTION_DELTA)) throw new Error("independent live R1 parent/subject/production delta differs");
    return { head, upstream, branch, localMain, originMain, cleanTree: true, profile: R1_PROFILE, repair: { exactParent: parent, commitSubject, productionDelta } };
  }
  const records = validateR2ProductionDelta(productionDelta.map((line) => {
    const fields = line.split("\t");
    return { status: fields[0], path: fields[1] };
  }), "independent live R2 production delta");
  if (parent !== R2_PARENT_SHA || commitSubject !== R2_COMMIT_SUBJECT) throw new Error("independent live R2 parent/subject differs");
  return { head, upstream, branch, localMain, originMain, cleanTree: true, profile: R2_PROFILE, repair: { exactParent: parent, commitSubject, productionDelta: records, productionAllowlist: [...R2_ALLOWED_PRODUCTION_PATHS] } };
}

export async function auditBuffers({ archiveBytes, detachedBytes, expected: inputExpected, ffprobe = null, validateMedia = false, validateGit = false } = {}) {
  const expected = validateExpected(inputExpected);
  const profile = reviewProfile(expected.profile);
  const parsed = parseStoredZip(archiveBytes); const { entries } = parsed;
  for (const [relativePath, bytes] of entries) { assertAllowedEntry(relativePath); assertNoPrivateText(bytes, relativePath); }
  for (const required of [IN_ARCHIVE_MANIFEST, README_FILENAME, REPORT_PATHS.deployedCapture]) if (!entries.has(required)) throw new Error(`archive omits required entry: ${required}`);
  const manifest = parseJsonEntry(entries, IN_ARCHIVE_MANIFEST);
  let detached; try { detached = JSON.parse(Buffer.from(detachedBytes).toString("utf8")); } catch { throw new Error("detached manifest is invalid JSON"); }
  assertNoPrivateText(detachedBytes, profile.detachedManifestFilename);
  if (manifest.schema !== profile.packageSchema || detached.schema !== profile.detachedSchema || detached.status !== "PASS") throw new Error("package/detached schema or status differs");
  validateProfileBinding(manifest, profile, "in-archive manifest"); validateProfileBinding(detached, profile, "detached manifest");
  const capture = parseJsonEntry(entries, REPORT_PATHS.deployedCapture); assertPassReport(capture, "deployed capture report");
  if (profile.id === R2_PROFILE && (capture.schema !== R2_CAPTURE_SCHEMA || capture.profile !== R2_PROFILE)) throw new Error("deployed capture report omits the exact R2 schema/profile binding");
  const captureLedger = extractLedger(capture, "deployed capture report");
  const evidencePaths = validateEvidenceArtifactPaths(captureLedger.keys(), profile.id);
  const expectedPayloadPaths = expectedPackagePayloadPaths(profile.id, evidencePaths);
  exactPaths(entries.keys(), [...expectedPayloadPaths, README_FILENAME, IN_ARCHIVE_MANIFEST], "archive topology");
  validateReviewPolicy(manifest); validateReviewPolicy(detached);
  if (archiveBytes.length > MAX_ARCHIVE_BYTES || detached.archive?.filename !== profile.archiveFilename || detached.archive?.byteSize !== archiveBytes.length || detached.archive?.sha256 !== sha256(archiveBytes) || detached.archive?.entries !== entries.size || detached.archive?.canonicalUniqueStoredZip !== true) throw new Error("detached archive binding differs");
  const manifestBytes = entries.get(IN_ARCHIVE_MANIFEST);
  if (detached.inArchiveManifest?.path !== IN_ARCHIVE_MANIFEST || detached.inArchiveManifest?.byteSize !== manifestBytes.length || detached.inArchiveManifest?.sha256 !== sha256(manifestBytes) || detached.inArchiveManifest?.schema !== profile.packageSchema) throw new Error("detached in-archive manifest binding differs");
  if (manifest.git?.head !== expected.expectedHead || manifest.git?.upstream !== expected.expectedUpstream || manifest.git?.branch !== profile.requiredBranch || manifest.git?.main !== FROZEN_MAIN_SHA || manifest.git?.acceptedPhase5AR !== ACCEPTED_PHASE5AR_SHA || manifest.git?.cleanTree !== true) throw new Error("manifest Git binding differs");
  for (const [name, value] of [["deployment ID", expected.expectedDeploymentId], ["project", REQUIRED_PROJECT], ["immutable URL", expected.immutableUrl], ["branch URL", expected.branchUrl]]) if (!containsScalar(manifest.deployment, value)) throw new Error(`manifest omits ${name}`);
  const packageLedgerPaths = [...expectedPayloadPaths, README_FILENAME];
  const exactInventory = {
    evidenceSourceFiles: evidencePaths.length + 1,
    evidenceLedgerArtifacts: evidencePaths.length,
    crossRouteFiles: evidencePaths.filter((relativePath) => relativePath.startsWith("cross-route/")).length,
    routeFolders: new Set(evidencePaths.filter((relativePath) => relativePath.startsWith("routes/")).map((relativePath) => relativePath.split("/")[1])).size,
    deployedRouteFiles: evidencePaths.filter((relativePath) => relativePath.startsWith("routes/")).length,
    acceptedStoryboardFiles: expectedPayloadPaths.filter((relativePath) => /\/desktop-storyboard--1440x900\.png$|\/route-brief-delta\.md$/.test(relativePath)).length,
    homepageRegressionFiles: evidencePaths.filter((relativePath) => relativePath.startsWith("homepage/")).length,
    reportFiles: expectedPayloadPaths.filter((relativePath) => relativePath.startsWith("reports/")).length,
    images: packageLedgerPaths.filter((relativePath) => IMAGE_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())).length,
    videos: packageLedgerPaths.filter((relativePath) => VIDEO_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())).length,
    hashedNonSelfFiles: packageLedgerPaths.length,
    archiveEntries: packageLedgerPaths.length + 1,
    maximumArchiveBytes: MAX_ARCHIVE_BYTES,
  };
  if (profile.id === R2_PROFILE) Object.assign(exactInventory, {
    homepageR2Files: evidencePaths.filter((relativePath) => relativePath.startsWith("homepage-r2/")).length,
    homepageR2ResponsiveFiles: evidencePaths.filter((relativePath) => relativePath.startsWith("homepage-r2/responsive/")).length,
    homepageR2ComparisonFiles: evidencePaths.filter((relativePath) => relativePath.startsWith("homepage-r2/comparisons/")).length,
    homepageR2RecordingFiles: evidencePaths.filter((relativePath) => relativePath.startsWith("homepage-r2/recordings/")).length,
    homepageR2ReportFiles: evidencePaths.filter((relativePath) => relativePath.startsWith("homepage-r2/reports/")).length,
  });
  for (const [key, value] of Object.entries(exactInventory)) if (manifest.inventory?.[key] !== value) throw new Error(`manifest inventory differs: ${key}`);
  const ledger = extractLedger(manifest, "in-archive manifest");
  exactPaths(ledger.keys(), packageLedgerPaths, "manifest ledger");
  let ledgerBytes = 0; let imageCount = 0; let videoCount = 0;
  for (const [relativePath, record] of ledger) {
    const bytes = entries.get(relativePath); if (!bytes || record.byteSize !== bytes.length || record.sha256 !== sha256(bytes)) throw new Error(`manifest hash/size differs: ${relativePath}`);
    ledgerBytes += bytes.length; const extension = path.posix.extname(relativePath).toLowerCase();
    if (IMAGE_EXTENSIONS.has(extension)) { imageCount += 1; if (record.kind !== "image" || record.media?.type !== "image" || record.media?.decoded !== true) throw new Error(`image ledger role differs: ${relativePath}`); }
    else if (VIDEO_EXTENSIONS.has(extension)) { videoCount += 1; if (record.kind !== "video" || record.media?.type !== "video" || record.media?.decoded !== true) throw new Error(`video ledger role differs: ${relativePath}`); }
    else if (record.kind !== "document" || record.media) throw new Error(`document ledger role differs: ${relativePath}`);
    if (typeof record.role !== "string" || !record.role) throw new Error(`artifact role omitted: ${relativePath}`);
  }
  if (ledgerBytes !== manifest.inventory.hashedNonSelfBytes || imageCount !== exactInventory.images || videoCount !== exactInventory.videos) throw new Error("manifest byte/media totals differ");
  validateArtifactRoles(manifest.artifactRoles, [...ledger.keys()]);
  assert.deepEqual(manifest.artifactRoles, buildArtifactRoles(profile.id, evidencePaths), "manifest artifact role assignments differ");
  const expectedAuthorityHashes = {
    deployedCaptureReportSha256: sha256(entries.get(REPORT_PATHS.deployedCapture)),
    acceptedStoryboardManifestSha256: sha256(entries.get(REPORT_PATHS.acceptedStoryboard)),
    cp7Sha256: sha256(entries.get(REPORT_PATHS.responsiveAccessibility)),
    cp8Sha256: sha256(entries.get(REPORT_PATHS.publicationMediaPerformance)),
    gitReportSha256: sha256(entries.get(REPORT_PATHS.git)),
    buildReportSha256: sha256(entries.get(REPORT_PATHS.build)),
  };
  for (const [key, value] of Object.entries(expectedAuthorityHashes)) if (manifest.authorities?.[key] !== value) throw new Error(`manifest authority binding differs: ${key}`);
  if (manifest.deployment?.verificationReportSha256 !== sha256(entries.get(REPORT_PATHS.deployment))) throw new Error("manifest deployment-report binding differs");

  assert.deepEqual(capture.humanReview?.gates, HUMAN_REVIEW_GATES, "deployed capture human gates differ");
  if (capture.humanReview?.phase6Authorized !== false) throw new Error("deployed capture report attempts to authorize Phase 6");
  for (const value of [expected.expectedHead, expected.immutableUrl]) if (!containsScalar(capture, value)) throw new Error(`deployed capture report omits ${value}`);
  for (const [sourcePath, record] of captureLedger) {
    const bytes = entries.get(evidenceToArchivePath(sourcePath));
    if (!bytes || record.byteSize !== bytes.length || record.sha256 !== sha256(bytes)) throw new Error(`deployed capture binding differs: ${sourcePath}`);
  }
  const r2Reports = profile.id === R2_PROFILE ? validateR2EvidenceReports(entries, captureLedger) : null;
  if (profile.id === R2_PROFILE) {
    assert.deepEqual(r2Reports.responsive.comparisonAuthorities, capture.homepageR2?.comparisonAuthorities, "R2 comparison authority bindings differ between capture and report");
    for (const authority of Object.values(r2Reports.responsive.comparisonAuthorities ?? {})) if (!HASH64.test(authority?.sha256 ?? "")) throw new Error("R2 comparison authority omits its exact SHA-256");
  }
  const accepted = parseJsonEntry(entries, REPORT_PATHS.acceptedStoryboard);
  if (accepted.schema !== "qh.phase5ar.route-preproduction-manifest.v1" || accepted.status !== "PASS" || accepted.phase5BAuthorized !== false || accepted.acceptedPhase5A !== "799ee284355f161e06404919d5022cd051165bf5") throw new Error("accepted storyboard authority differs");
  const acceptedLedger = extractLedger(accepted, "accepted storyboard manifest");
  for (const id of ROUTE_ORDER) for (const name of ACCEPTED_STORYBOARD_ARTIFACTS) {
    const sourcePath = `routes/${id}/${name}`; const archivePath = `per-route/${id}/${name}`; const record = acceptedLedger.get(sourcePath); const bytes = entries.get(archivePath);
    if (!record || !bytes || record.byteSize !== bytes.length || record.sha256 !== sha256(bytes)) throw new Error(`accepted storyboard binding differs: ${sourcePath}`);
  }
  const cp7Bytes = entries.get(REPORT_PATHS.responsiveAccessibility); const cp7 = parseJsonEntry(entries, REPORT_PATHS.responsiveAccessibility); assertPassReport(cp7, "CP7 report");
  if (cp7.schema !== "quantum-hub.phase-5b.responsive-accessibility.v1" || sha256(cp7Bytes) !== CP7_REPORT_SHA256 || cp7.git?.branch !== REQUIRED_BRANCH || cp7.git?.head !== CP7_REPORT_GIT_HEAD) throw new Error("CP7 authority differs");
  const expectedCp7Summary = { responsiveCases: 117, variantCases: 54, keyboardCases: 18, mobileNavigationCases: 9, axeCases: 18, axeViolations: 0, seriousCriticalAxe: 0, failures: 0 };
  for (const [key, value] of Object.entries(expectedCp7Summary)) if (cp7.summary?.[key] !== value) throw new Error(`CP7 summary differs: ${key}`);
  const cp8Bytes = entries.get(REPORT_PATHS.publicationMediaPerformance); const cp8 = parseJsonEntry(entries, REPORT_PATHS.publicationMediaPerformance); assertPassReport(cp8, "CP8 report");
  if (sha256(cp8Bytes) !== CP8_REPORT_SHA256 || cp8.git?.expectedHead !== CP8_HEAD || cp8.summary?.routeCount !== 9 || cp8.summary?.maximumScrollLongTaskMs !== 0 || cp8.summary?.phase4CinematicRequests !== 0) throw new Error("CP8 authority differs");
  const deployment = parseJsonEntry(entries, REPORT_PATHS.deployment); assertPassReport(deployment, "deployment report");
  assert.deepEqual(deployment.humanReview?.gates, HUMAN_REVIEW_GATES, "deployment human gates differ");
  if (deployment.humanReview?.allSixPending !== true || deployment.authorization?.phase6Authorized !== false) throw new Error("deployment review authorization differs");
  for (const value of [expected.expectedHead, expected.expectedDeploymentId, REQUIRED_PROJECT, expected.immutableUrl, expected.branchUrl]) if (!containsScalar(deployment, value)) throw new Error(`deployment authority omits ${value}`);
  if (profile.id === R2_PROFILE) {
    if (deployment.profile !== R2_PROFILE || deployment.repository?.profile !== R2_PROFILE || deployment.repository?.finalCommitParent !== R2_PARENT_SHA) throw new Error("deployment report omits the exact R2 parent/profile authority");
    assert.deepEqual(deployment.repository?.productionAllowlist, [...R2_ALLOWED_PRODUCTION_PATHS], "deployment R2 production allowlist differs");
    const deploymentDelta = validateR2ProductionDelta(deployment.repository?.productionDelta, "deployment R2 production delta");
    assert.deepEqual(deploymentDelta, manifest.repair.productionDelta, "deployment/package R2 production delta differs");
    assert.deepEqual(validateR2ProductionDelta(r2Reports.supporting.productionDelta, "R2 supporting-route report production delta"), manifest.repair.productionDelta, "R2 supporting-route/package production delta differs");
  }
  const gitReport = parseJsonEntry(entries, REPORT_PATHS.git);
  if (gitReport.schema !== `${profile.packageSchema}.git-provenance` || gitReport.status !== "PASS" || gitReport.head !== expected.expectedHead || gitReport.upstream !== expected.expectedUpstream || gitReport.branch !== profile.requiredBranch || gitReport.localMain !== FROZEN_MAIN_SHA || gitReport.originMain !== FROZEN_MAIN_SHA || gitReport.acceptedPhase5AR !== ACCEPTED_PHASE5AR_SHA || gitReport.cleanTree !== true || !Array.isArray(gitReport.commits) || gitReport.commits.length !== profile.checkpointSubjects.length || gitReport.commits.at(-1)?.sha !== expected.expectedHead) throw new Error("archived Git report differs");
  validateProfileBinding(gitReport, profile, "archived Git report");
  if (profile.id === R2_PROFILE) assert.deepEqual(gitReport.repair, manifest.repair, "archived Git/package R2 repair authority differs");
  for (let index = 0; index < gitReport.commits.length; index += 1) {
    const record = gitReport.commits[index]; const expectedSha = index < profile.fixedCheckpointShas.length ? profile.fixedCheckpointShas[index] : expected.expectedHead; const expectedParent = index === 0 ? ACCEPTED_PHASE5AR_SHA : gitReport.commits[index - 1].sha;
    if (record.sha !== expectedSha || record.subject !== profile.checkpointSubjects[index] || record.parents?.length !== 1 || record.parents[0] !== expectedParent) throw new Error(`archived Git CP${index + 1} differs`);
  }
  const build = parseJsonEntry(entries, REPORT_PATHS.build);
  if (build.schema !== `${profile.packageSchema}.build-budget` || build.status !== "PASS" || build.totalBytes > MAX_DIST_BYTES || build.maximumBytes !== MAX_DIST_BYTES || build.sourceMaps !== 0 || build.serverRuntime !== false || !Array.isArray(build.files) || build.files.length !== build.fileCount) throw new Error("archived build report differs");
  for (const [relativePath, hash] of Object.entries(ACTIVE_MEDIA_SHA256)) if (!build.activeMedia?.some((record) => record.relativePath === relativePath && record.sha256 === hash)) throw new Error(`build media authority differs: ${relativePath}`);
  const deployedDist = new Map();
  for (const record of deployment.dist?.files ?? []) {
    const relativePath = record?.relativePath; const byteSize = record?.byteSize ?? record?.bytes; const hash = String(record?.sha256 ?? "").toLowerCase();
    safeRelativePath(relativePath, "deployment dist path");
    if (deployedDist.has(relativePath) || !Number.isSafeInteger(byteSize) || byteSize < 0 || !HASH64.test(hash)) throw new Error(`deployment dist ledger differs: ${relativePath}`);
    deployedDist.set(relativePath, { byteSize, sha256: hash });
  }
  exactPaths(deployedDist.keys(), build.files.map(({ relativePath }) => relativePath), "deployment/build dist paths");
  for (const record of build.files) {
    const deployed = deployedDist.get(record.relativePath);
    if (deployed.byteSize !== record.byteSize || deployed.sha256 !== record.sha256) throw new Error(`deployment/build dist bytes differ: ${record.relativePath}`);
  }
  if (deployment.dist?.totals?.files !== build.fileCount || deployment.dist?.totals?.bytes !== build.totalBytes) throw new Error("deployment/build dist totals differ");
  if (profile.id === R2_PROFILE) {
    const phase4Deployed = [...deployedDist.entries()].filter(([relativePath]) => relativePath.startsWith("media/cinematic/phase-4r2/")).map(([relativePath, record]) => ({ relativePath, ...record }));
    exactPaths(r2Reports.phase4.assets.map(({ relativePath }) => relativePath), phase4Deployed.map(({ relativePath }) => relativePath), "R2 Phase 4 media paths");
    for (const asset of r2Reports.phase4.assets) {
      const deployed = deployedDist.get(asset.relativePath);
      if (!deployed || asset.byteSize !== deployed.byteSize || asset.sha256 !== deployed.sha256) throw new Error(`R2 Phase 4 media hash differs: ${asset.relativePath}`);
    }
    if (r2Reports.phase4.deploymentAuthority?.sha256 !== sha256(entries.get(REPORT_PATHS.deployment))) throw new Error("R2 Phase 4 report deployment authority binding differs");
  }
  const readme = entries.get(README_FILENAME).toString("utf8");
  if (!/All six Phase 5B gates remain \*\*PENDING HUMAN REVIEW\*\*/.test(readme) || !/Phase 6 remains \*\*UNAUTHORIZED\*\*/.test(readme) || !/no raw frames, source assets, prototype internals, Blender files/i.test(readme)) throw new Error("README review/boundary policy differs");
  if (profile.id === R1_PROFILE && (!/^# Quantum-Hub Phase 5B-R1 About Dark V2 fidelity — human review/m.test(readme) || !/^## R1 review focus/m.test(readme) || !/src\/styles\/routes\/about\.css/.test(readme))) throw new Error("README R1 focus differs");
  if (profile.id === R2_PROFILE && (!/^# Quantum-Hub Phase 5B-R2 Home navigation and manifesto — human review/m.test(readme) || !/^## R2 review focus/m.test(readme) || !/seven-path Home\/shared-header allowlist/.test(readme) || !/homepage-r2\/recordings\//.test(readme))) throw new Error("README R2 focus differs");
  const media = validateMedia ? await validateMediaEntries(entries, ledger, ffprobe, exactInventory.images, exactInventory.videos) : { images: imageCount, videos: videoCount };
  const repository = validateGit ? await validateLocalGit(expected) : null;
  return { manifest, detached, entries, ledger, media, repository, evidencePaths, canonical: parsed.canonical, crcValidated: parsed.crcValidated, privacyAndSecrets: "PASS", reviewPolicy: "PASS" };
}

export function selfTest(profileValue = DEFAULT_PROFILE) {
  const profile = reviewProfile(profileValue);
  const evidencePaths = expectedEvidenceArtifactPaths(profile.id);
  const payloadPaths = expectedPackagePayloadPaths(profile.id, evidencePaths);
  const images = payloadPaths.filter((item) => IMAGE_EXTENSIONS.has(path.posix.extname(item))).length;
  const videos = payloadPaths.filter((item) => VIDEO_EXTENSIONS.has(path.posix.extname(item))).length;
  assert.equal(expectedEvidenceArtifactPaths(DEFAULT_PROFILE).length, 126); assert.equal(expectedPackagePayloadPaths(DEFAULT_PROFILE).length, 157);
  assert.equal(Object.keys(HUMAN_REVIEW_GATES).length, 6); assert.ok(Object.values(AUTHORIZATION).every((value) => value === false));
  assert.equal(profile.checkpointSubjects.length, CHECKPOINT_SUBJECTS.length + (profile.id === R2_PROFILE ? 2 : profile.id === R1_PROFILE ? 1 : 0));
  assert.equal(profile.fixedCheckpointShas.length, profile.checkpointSubjects.length - 1);
  if (profile.id === R1_PROFILE) {
    assert.equal(profile.exactParent, R1_PARENT_SHA);
    assert.equal(profile.checkpointSubjects.at(-1), R1_COMMIT_SUBJECT);
    assert.equal(profile.fixedCheckpointShas.at(-1), R1_PARENT_SHA);
  }
  if (profile.id === R2_PROFILE) {
    assert.equal(profile.exactParent, R2_PARENT_SHA);
    assert.equal(profile.checkpointSubjects.at(-1), R2_COMMIT_SUBJECT);
    assert.equal(profile.fixedCheckpointShas.at(-1), R2_PARENT_SHA);
    assert.deepEqual(validateEvidenceArtifactPaths(evidencePaths, profile.id), evidencePaths);
  }
  validateArtifactRoles(buildArtifactRoles(profile.id, evidencePaths), [...payloadPaths, README_FILENAME]);
  const entries = new Map([[IN_ARCHIVE_MANIFEST, Buffer.from("{}\n")], [README_FILENAME, Buffer.from("review\n")]]); const zip = rebuildStoredZip(entries); const parsed = parseStoredZip(zip);
  assert.deepEqual([...parsed.entries.keys()], [IN_ARCHIVE_MANIFEST, README_FILENAME]);
  return { schema: `${profile.auditSchema}.self-test`, status: "PASS", ...(profile.id !== DEFAULT_PROFILE ? { profile: profile.id } : {}), evidenceArtifacts: evidencePaths.length, packagePayloadFiles: payloadPaths.length, archiveEntries: payloadPaths.length + 2, images, videos, gatesPending: 6, phase6Authorized: false, canonicalParser: true };
}

function valueAfter(argv, index, flag) { const value = argv[index + 1]; if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`); return value; }
export function parseArguments(argv) {
  const options = { profile: DEFAULT_PROFILE, archive: null, manifest: null, auditOutput: null, expectedHead: null, expectedUpstream: null, expectedBranch: null, expectedMain: FROZEN_MAIN_SHA, acceptedPhase5AR: ACCEPTED_PHASE5AR_SHA, expectedDeploymentId: null, deploymentProject: REQUIRED_PROJECT, immutableUrl: null, branchUrl: null, ffprobe: null, expectedParentProcessId: null, selfTest: false, dryRun: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]; const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--profile") options.profile = next().toLowerCase();
    else if (argument === "--archive") options.archive = path.resolve(next());
    else if (argument === "--manifest") options.manifest = path.resolve(next());
    else if (argument === "--audit-output") options.auditOutput = path.resolve(next());
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
    else if (argument === "--expected-parent-process-id") options.expectedParentProcessId = Number(next());
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  const profile = reviewProfile(options.profile);
  options.profile = profile.id;
  options.expectedBranch ??= profile.requiredBranch;
  return options;
}

async function auditArchive(input) {
  const expected = validateExpected(input);
  const profile = reviewProfile(expected.profile);
  for (const [key, basename, label] of [["archive", profile.archiveFilename, "archive"], ["manifest", profile.detachedManifestFilename, "detached manifest"], ["auditOutput", profile.auditFilename, "audit output"]]) {
    if (!input[key] || path.basename(input[key]) !== basename) throw new Error(`${label} basename must be ${basename}`);
    assertExternalPath(input[key], label);
  }
  if (!Number.isSafeInteger(input.expectedParentProcessId) || input.expectedParentProcessId <= 0 || process.ppid !== input.expectedParentProcessId || process.pid === input.expectedParentProcessId) throw new Error("auditor is not the expected separate child process");
  const [archivePath, manifestPath, ffprobe] = await Promise.all([realpath(input.archive), realpath(input.manifest), validateFfprobe(input.ffprobe)]);
  try { await access(input.auditOutput); throw new Error(`audit output already exists: ${input.auditOutput}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const [archiveBytes, detachedBytes] = await Promise.all([readFile(archivePath), readFile(manifestPath)]);
  const result = await auditBuffers({ archiveBytes, detachedBytes, expected, ffprobe, validateMedia: true, validateGit: true });
  const audit = {
    schema: profile.auditSchema,
    status: "PASS",
    ...(profile.id !== DEFAULT_PROFILE ? { profile: profile.id, repair: result.manifest.repair } : {}),
    generatedAt: result.manifest.generatedAt,
    archive: { filename: profile.archiveFilename, byteSize: archiveBytes.length, sha256: sha256(archiveBytes), entries: result.entries.size, canonicalUniqueStoredZip: true, crcValidated: true },
    detachedManifest: { filename: profile.detachedManifestFilename, byteSize: detachedBytes.length, sha256: sha256(detachedBytes), archiveBinding: true, inArchiveManifestBinding: true },
    contract: { evidenceSourceFiles: result.manifest.inventory.evidenceSourceFiles, evidenceLedgerArtifacts: result.manifest.inventory.evidenceLedgerArtifacts, crossRouteFiles: result.manifest.inventory.crossRouteFiles, routeFolders: result.manifest.inventory.routeFolders, deployedRouteFiles: result.manifest.inventory.deployedRouteFiles, acceptedStoryboardFiles: result.manifest.inventory.acceptedStoryboardFiles, homepageRegressionFiles: result.manifest.inventory.homepageRegressionFiles, reportFiles: result.manifest.inventory.reportFiles, ...(profile.id === R2_PROFILE ? { homepageR2Files: result.manifest.inventory.homepageR2Files, homepageR2ResponsiveFiles: result.manifest.inventory.homepageR2ResponsiveFiles, homepageR2ComparisonFiles: result.manifest.inventory.homepageR2ComparisonFiles, homepageR2RecordingFiles: result.manifest.inventory.homepageR2RecordingFiles, homepageR2ReportFiles: result.manifest.inventory.homepageR2ReportFiles } : {}), images: result.media.images, videos: result.media.videos, rawFrames: 0, rawAssets: 0, sourceFiles: 0, prototypes: 0, blenderFiles: 0, historyDumps: 0, nestedArchives: 0, privacyAndSecrets: "PASS" },
    repository: result.repository,
    process: { separateProcess: true },
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
    policy: { phase6: "UNAUTHORIZED", pendingGateCount: 6, machinePassGrantsHumanAcceptance: false },
    conclusion: { machineIntegrityPassOnly: true, humanAcceptanceGranted: false, phase6Authorized: false },
  };
  validateProfileBinding(audit, profile, "independent audit"); validateReviewPolicy(audit); const bytes = Buffer.from(stableJson(audit)); assertNoPrivateText(bytes, profile.auditFilename);
  await mkdir(path.dirname(input.auditOutput), { recursive: true }); const temporary = `${input.auditOutput}.${randomUUID()}.tmp`; await writeFile(temporary, bytes, { flag: "wx" });
  try { await rename(temporary, input.auditOutput); } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return audit;
}

function dryRunReport(profileValue = DEFAULT_PROFILE) {
  const profile = reviewProfile(profileValue);
  return { schema: `${profile.auditSchema}.dry-run`, status: "PASS", ...(profile.id !== DEFAULT_PROFILE ? { profile: profile.id, archiveFilename: profile.archiveFilename, detachedManifestFilename: profile.detachedManifestFilename, auditFilename: profile.auditFilename } : {}), writesPerformed: false, topology: selfTest(profile.id), independentImplementation: true };
}
function printHelp() { process.stdout.write(`Independent Phase 5B review-package audit\n\nnode scripts/${path.basename(SCRIPT)} [--profile cp9|r1|r2] --archive <exact ZIP> --manifest <exact detached manifest> --audit-output <fresh exact audit path> --expected-head <sha> --expected-upstream <sha> --expected-deployment-id <uuid> --immutable-url <url> --branch-url <url> --ffprobe <absolute> --expected-parent-process-id <pid>\n\nThe default cp9 profile preserves the original package. The r1 profile requires branch ${R1_REQUIRED_BRANCH}, exact CP9 parent ${R1_PARENT_SHA}, and output ${R1_ARCHIVE_FILENAME}. The r2 profile requires branch ${R2_REQUIRED_BRANCH}, exact R1 parent ${R2_PARENT_SHA}, the strict seven-path Home/shared-header allowlist, and output ${R2_ARCHIVE_FILENAME}. Use --self-test or --dry-run for write-free checks.\n`); }
async function main() {
  const options = parseArguments(process.argv.slice(2)); if (options.help) return printHelp();
  const profile = reviewProfile(options.profile);
  if (options.selfTest) { process.stdout.write(stableJson(selfTest(profile.id))); return; }
  if (options.dryRun) { process.stdout.write(stableJson(dryRunReport(profile.id))); return; }
  const result = await auditArchive(options); process.stdout.write(stableJson({ schema: `${profile.auditSchema}.result`, status: result.status, ...(profile.id !== DEFAULT_PROFILE ? { profile: profile.id } : {}), archive: result.archive, auditOutput: profile.auditFilename }));
}
const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { process.stderr.write(`Phase 5B independent package audit FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
