#!/usr/bin/env node

/**
 * Independent Phase 5A-R package audit.
 *
 * This module deliberately does not import the packager. ZIP parsing, CRC,
 * hashing, canonical reconstruction, inventories, roles, privacy rules, Git
 * checks, media checks, and human-review policy are repeated independently.
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

export const PACKAGE_SCHEMA = "quantum-hub.phase-5a-r.manifesto-route-identity-repair-human-review.v1";
export const DETACHED_SCHEMA = `${PACKAGE_SCHEMA}.detached-manifest`;
export const AUDIT_SCHEMA = `${PACKAGE_SCHEMA}.independent-audit`;
export const ARCHIVE_FILENAME = "phase-5a-r-manifesto-route-identity-repair-human-review.zip";
export const DETACHED_MANIFEST_FILENAME = "phase-5a-r-manifesto-route-identity-repair-human-review-manifest.json";
export const AUDIT_FILENAME = "phase-5a-r-manifesto-route-identity-repair-human-review-audit.json";
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const README_FILENAME = "README.md";
export const FIXED_EPOCH = "1980-01-01T00:00:00.000Z";
export const REQUIRED_BRANCH = "codex/phase-5a-r-manifesto-route-identity-repair";
export const ACCEPTED_PHASE5A_SHA = "799ee284355f161e06404919d5022cd051165bf5";
export const FROZEN_MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const REQUIRED_PROJECT = "qsite1";
export const PRODUCTION_BLEND_SHA256 = "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516";
export const ACTIVE_MEDIA_MANIFEST_SHA256 = "06f9f5b256577ed1b0f159a435135fca6a78185be57b4db8853b9b276c080a54";
export const ACCEPTED_PHASE5A_EVIDENCE_MANIFEST_SHA256 = "adc8c254b31448407c1d6a5d5f49f0082f78d8ce2994b356f6fbb51c224cb1dd";
export const ACCEPTED_PHASE5A_DEPLOYMENT_REPORT_SHA256 = "a6636a9199b0220f0549f328564f66f738f0a258322ff10fe05d8858d128abe7";
export const ACCEPTED_PHASE5A_REVIEW_ZIP_SHA256 = "f3f99d8cd5ceac41c27a4073dd68bada126ee2d7c659cdab0ede84ed73ef177b";
export const ACCEPTED_PHASE5A_REVIEW_MANIFEST_SHA256 = "5df22c435b18e83e55d17f06ca51b453d02dbed9e796db86472b7214f26d1061";
export const ACCEPTED_PHASE5A_REVIEW_AUDIT_SHA256 = "fc0eb8f273f7d036af35e7abde7c3a25ae357fd9d6a99e3e8f98b15498e20425";
export const PRODUCTION_BLEND_RELATIVE = "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/source/quantum-signal-television-phase4r2-1-causal-current.blend";
export const ACTIVE_MEDIA_MANIFEST_RELATIVE = "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/production/manifests/phase-4r2-production-media-manifest.json";

export const CHECKPOINT_SUBJECTS = Object.freeze([
  "Implement post-CRT Quantum manifesto threshold",
  "Diversify Phase 5 supporting-route document architecture",
  "Repair Phase 5 route responsive overtures",
  "Complete Phase 5A-R anti-template visual preproduction",
  "Complete Phase 5A-R deployed manifesto evidence and review package",
]);
export const HUMAN_REVIEW_GATES = Object.freeze({
  "MANIFESTO THRESHOLD": "PENDING HUMAN REVIEW",
  "SCROLL-DRIVEN CRT ACTIVATION": "PENDING HUMAN REVIEW",
  "SUPPORTING-ROUTE CREATIVE THESIS": "PENDING HUMAN REVIEW",
  "ROUTE-SPECIFIC SPATIAL IDENTITY": "PENDING HUMAN REVIEW",
  "RESPONSIVE + ACCESSIBLE ROUTE CONTINUITY": "PENDING HUMAN REVIEW",
  "PUBLICATION + MEDIA SAFETY": "PENDING HUMAN REVIEW",
  "PERFORMANCE + IMPLEMENTATION STRATEGY": "PENDING HUMAN REVIEW",
});
export const AUTHORIZATION = Object.freeze({ authorSelfApproved: false, deployerSelfApproved: false, humanAccepted: false, mainMerged: false, phase5BAuthorized: false });

export const ROUTE_ORDER = Object.freeze(["for-industry", "for-startups", "industries", "proof", "maradin", "spark", "about", "contact", "404"]);
export const ROUTE_ARTIFACTS = Object.freeze([
  "route-brief-delta.md", "desktop-storyboard--1440x900.png", "mobile-storyboard--390x844.png", "narrow-overture--320x800.png",
  "short-landscape-overture-sheet.png", "signature-states-sheet.png", "material-board.png",
]);
export const CROSS_ROUTE_ARTIFACTS = Object.freeze([
  "PHASE_5A_R_ROUTE_COHERENCE_MATRIX.md", "PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md", "all-routes-desktop-contact-sheet.png",
  "all-routes-mobile-contact-sheet.png", "all-routes-short-landscape-contact-sheet.png", "motion-comparison-board.png", "material-comparison-board.png",
]);
export const ROUTE_REPORTS = Object.freeze(["reports/accessibility.json", "reports/public-source-freeze.json", "reports/request-isolation.json", "reports/route-capture-report.json"]);
export const ROUTE_ROOT_FILES = Object.freeze(["README.md", "route-preproduction-manifest.json"]);
export const HOME_RECORDINGS = Object.freeze(["recordings/01-forward-manifesto.mp4", "recordings/02-reverse-manifesto.mp4"]);
export const HOME_SHEETS = Object.freeze(["sheets/01-manifesto-sequence.png", "sheets/02-responsive-manifesto.png", "sheets/03-accessibility-fallbacks.png", "sheets/04-reverse-path.png"]);
export const HOME_REPORT_SCHEMAS = Object.freeze({
  "reports/manifesto-behavior.json": "quantum-hub.phase-5a-r.manifesto-behavior.v1",
  "reports/semantic-chrome.json": "quantum-hub.phase-5a-r.semantic-chrome.v1",
  "reports/responsive-fallback.json": "quantum-hub.phase-5a-r.responsive-fallback.v1",
  "reports/crt-regression.json": "quantum-hub.phase-5a-r.frozen-crt-regression.v1",
  "reports/browser-diagnostics.json": "quantum-hub.phase-5a-r.browser-diagnostics.v1",
  "reports/git-deployment-provenance.json": "quantum-hub.phase-5a-r.git-deployment-provenance.v1",
});
export const HOME_MANIFEST = "reports/phase5ar-browser-evidence-manifest.json";
export const HOME_MANIFEST_SCHEMA = "quantum-hub.phase-5a-r.manifesto-browser-evidence.v1";
export const ROUTE_MANIFEST_SCHEMA = "qh.phase5ar.route-preproduction-manifest.v1";
export const AUTHORITY_SOURCES = Object.freeze({
  publicationAndMedia: Object.freeze({ source: "docs/planning/PHASE_5A_PUBLICATION_AND_MEDIA_AUDIT.md", archive: "review-authorities/publication/PHASE_5A_PUBLICATION_AND_MEDIA_AUDIT.md" }),
  supportingRouteContent: Object.freeze({ source: "docs/planning/PHASE_5A_SUPPORTING_ROUTE_CONTENT_AUDIT.md", archive: "review-authorities/publication/PHASE_5A_SUPPORTING_ROUTE_CONTENT_AUDIT.md" }),
  performanceStrategy: Object.freeze({ source: "docs/planning/PHASE_5A_SUPPORTING_ROUTE_PREPRODUCTION.md", archive: "review-authorities/performance/PHASE_5A_SUPPORTING_ROUTE_PREPRODUCTION.md" }),
  implementationStrategy: Object.freeze({ source: "docs/planning/PHASE_5A_SUPPORTING_ROUTE_EXPERIENCE_SYSTEM.md", archive: "review-authorities/performance/PHASE_5A_SUPPORTING_ROUTE_EXPERIENCE_SYSTEM.md" }),
  crtInteraction: Object.freeze({ source: "docs/planning/PHASE_5A_SCROLL_CRT_MAPPING.md", archive: "review-authorities/crt/PHASE_5A_SCROLL_CRT_MAPPING.md" }),
});
export const DEPLOYMENT_AUTHORITY_PATH = "review-authorities/git-deployment/phase-5-a-r-deployment-verification.json";
export const FROZEN_PUBLIC_FILES = Object.freeze([
  "src/pages/for-partners.astro", "src/pages/for-startups.astro", "src/pages/industries.astro", "src/pages/pocs.astro", "src/pages/pocs/maradin.astro",
  "src/pages/spark.astro", "src/pages/about.astro", "src/pages/contact.astro", "src/pages/404.astro", "src/styles/routes/standard.css",
  "src/styles/routes/proof.css", "src/styles/routes/not-found.css", "src/components/PageHero.astro", "src/components/ProcessList.astro",
  "src/components/ClosingCta.astro", "src/content/industries.ts", "src/content/proofs.ts", "src/content/programmes.ts", "src/content/collections.ts",
]);

const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4"]);
const PRIVATE_OR_SECRET_TEXT = /(?:[a-z]:[\\/]users[\\/]|(?:^|[^a-z])onedrive(?:[^a-z]|$)|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;
const FORBIDDEN_ENTRY = /(?:^|\/)(?:raw|private|secrets?|sources?|src|masters?|frames?|receipts?|logs?|cache|caches|quarantine|rejected|candidates?|browser-recorder|autosaves?|temp|tmp|__pycache__|node_modules|\.git|dist)(?:\/|$)|(?:^|\/)\.(?:env|ds_store)(?:\.|$)|\.(?:webm|blend\d*|exr|tiff?|mov|mkv|avi|zip|7z|rar|pem|key|p12|pfx|log|map)$/i;
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

export function expectedHomePaths() { return [...HOME_RECORDINGS, ...HOME_SHEETS, ...Object.keys(HOME_REPORT_SCHEMAS), HOME_MANIFEST].sort(lexicalCompare); }
export function expectedRouteReviewPaths() {
  return [...ROUTE_ORDER.flatMap((route) => ROUTE_ARTIFACTS.map((name) => `routes/${route}/${name}`)), ...CROSS_ROUTE_ARTIFACTS.map((name) => `cross-route-system/${name}`)].sort(lexicalCompare);
}
export function expectedRouteRootPaths() { return [...expectedRouteReviewPaths(), ...ROUTE_REPORTS, ...ROUTE_ROOT_FILES].sort(lexicalCompare); }

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function safeRelativePath(value, label = "path") {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) throw new Error(`${label} must be portable and relative`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`${label} is unsafe: ${value}`);
  return value;
}

function assertExternalPath(candidate, label) {
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root || isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved)) throw new Error(`${label} must be durable and outside the repository/temp directory`);
  return resolved;
}

export function assertAllowedEntry(relativePath) {
  safeRelativePath(relativePath, "archive entry");
  if (FORBIDDEN_ENTRY.test(relativePath)) throw new Error(`forbidden raw/source/private/archive entry: ${relativePath}`);
  const top = relativePath.split("/")[0];
  if (!["homepage-manifesto", "supporting-routes", "review-authorities", README_FILENAME, IN_ARCHIVE_MANIFEST].includes(top)) throw new Error(`entry is outside exact review surface: ${relativePath}`);
  if ([README_FILENAME, IN_ARCHIVE_MANIFEST].includes(relativePath)) return true;
  if (![...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].includes(path.extname(relativePath).toLowerCase())) throw new Error(`unsupported archive type: ${relativePath}`);
  return true;
}

function semanticJsonText(value) {
  const values = [];
  const visit = (node, key = "") => {
    if (typeof node === "string") { values.push(node); if (key) values.push(`${key}: ${node}`); }
    else if (Array.isArray(node)) node.forEach((item) => visit(item, key));
    else if (node && typeof node === "object") Object.entries(node).forEach(([childKey, child]) => visit(child, childKey));
    else if (key && node !== undefined && node !== null) values.push(`${key}: ${node}`);
  };
  visit(value);
  return values.join("\n");
}

export function assertNoPrivateText(bytes, relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  if (PRIVATE_OR_SECRET_TEXT.test(relativePath) || (TEXT_EXTENSIONS.has(extension) && PRIVATE_OR_SECRET_TEXT.test(Buffer.from(bytes).toString("utf8")))) throw new Error(`privacy/secrets scan failed: ${relativePath}`);
  if (extension === ".json" || relativePath === IN_ARCHIVE_MANIFEST) {
    let document;
    try { document = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { throw new Error(`invalid JSON: ${relativePath}`); }
    if (PRIVATE_OR_SECRET_TEXT.test(semanticJsonText(document))) throw new Error(`privacy/secrets semantic scan failed: ${relativePath}`);
  }
  return true;
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function parseStoredZip(bytes) {
  const source = Buffer.from(bytes);
  assert.ok(source.length >= 22, "ZIP is truncated");
  const eocdOffset = source.length - 22;
  assert.equal(source.readUInt32LE(eocdOffset), 0x06054b50, "ZIP must have an exact no-comment EOCD");
  assert.equal(source.readUInt16LE(eocdOffset + 4), 0, "multi-disk ZIP is forbidden");
  assert.equal(source.readUInt16LE(eocdOffset + 6), 0, "multi-disk ZIP is forbidden");
  const count = source.readUInt16LE(eocdOffset + 8);
  assert.equal(source.readUInt16LE(eocdOffset + 10), count, "central/local ZIP counts differ");
  const centralBytes = source.readUInt32LE(eocdOffset + 12);
  const centralOffset = source.readUInt32LE(eocdOffset + 16);
  assert.equal(source.readUInt16LE(eocdOffset + 20), 0, "ZIP comment is forbidden");
  assert.equal(centralOffset + centralBytes, eocdOffset, "central directory boundary differs");
  const entries = new Map();
  const metadata = [];
  let centralCursor = centralOffset;
  let expectedLocalOffset = 0;
  let previousName = null;
  for (let index = 0; index < count; index += 1) {
    assert.equal(source.readUInt32LE(centralCursor), 0x02014b50, `central entry ${index} signature differs`);
    const flags = source.readUInt16LE(centralCursor + 8);
    const method = source.readUInt16LE(centralCursor + 10);
    const time = source.readUInt16LE(centralCursor + 12);
    const date = source.readUInt16LE(centralCursor + 14);
    const checksum = source.readUInt32LE(centralCursor + 16);
    const compressed = source.readUInt32LE(centralCursor + 20);
    const uncompressed = source.readUInt32LE(centralCursor + 24);
    const nameLength = source.readUInt16LE(centralCursor + 28);
    const extraLength = source.readUInt16LE(centralCursor + 30);
    const commentLength = source.readUInt16LE(centralCursor + 32);
    const disk = source.readUInt16LE(centralCursor + 34);
    const localOffset = source.readUInt32LE(centralCursor + 42);
    assert.equal(flags, 0x0800, "ZIP entries must use only UTF-8 flag");
    assert.equal(method, 0, "ZIP entries must be stored");
    assert.equal(time, 0, "ZIP DOS time must be fixed at midnight");
    assert.equal(date, 0x0021, "ZIP DOS date must be fixed at 1980-01-01");
    assert.equal(compressed, uncompressed, "stored sizes differ");
    assert.equal(extraLength, 0, "ZIP extra fields are forbidden");
    assert.equal(commentLength, 0, "ZIP entry comments are forbidden");
    assert.equal(disk, 0, "multi-disk entry is forbidden");
    const nameStart = centralCursor + 46;
    const name = source.subarray(nameStart, nameStart + nameLength).toString("utf8");
    assertAllowedEntry(name);
    assert.ok(previousName === null || lexicalCompare(previousName, name) < 0, "ZIP central entries must be unique and lexically ordered");
    previousName = name;
    assert.equal(localOffset, expectedLocalOffset, "ZIP local entries must be compact and in central order");
    assert.equal(source.readUInt32LE(localOffset), 0x04034b50, `local entry signature differs: ${name}`);
    assert.equal(source.readUInt16LE(localOffset + 6), flags, `local flags differ: ${name}`);
    assert.equal(source.readUInt16LE(localOffset + 8), method, `local method differs: ${name}`);
    assert.equal(source.readUInt16LE(localOffset + 10), time, `local time differs: ${name}`);
    assert.equal(source.readUInt16LE(localOffset + 12), date, `local date differs: ${name}`);
    assert.equal(source.readUInt32LE(localOffset + 14), checksum, `local CRC differs: ${name}`);
    assert.equal(source.readUInt32LE(localOffset + 18), compressed, `local size differs: ${name}`);
    assert.equal(source.readUInt32LE(localOffset + 22), uncompressed, `local size differs: ${name}`);
    const localNameLength = source.readUInt16LE(localOffset + 26);
    const localExtraLength = source.readUInt16LE(localOffset + 28);
    assert.equal(localExtraLength, 0, `local extra is forbidden: ${name}`);
    const localNameStart = localOffset + 30;
    assert.equal(source.subarray(localNameStart, localNameStart + localNameLength).toString("utf8"), name, `local name differs: ${name}`);
    const dataStart = localNameStart + localNameLength;
    const dataEnd = dataStart + uncompressed;
    assert.ok(dataEnd <= centralOffset, `entry overlaps central directory: ${name}`);
    const data = source.subarray(dataStart, dataEnd);
    assert.equal(crc32(data), checksum, `CRC rejection: ${name}`);
    assert.ok(!entries.has(name), `duplicate ZIP path: ${name}`);
    entries.set(name, data);
    metadata.push({ path: name, crc32: checksum, bytes: data.length, localOffset });
    expectedLocalOffset = dataEnd;
    centralCursor = nameStart + nameLength + extraLength + commentLength;
  }
  assert.equal(centralCursor, centralOffset + centralBytes, "central directory byte count differs");
  assert.equal(expectedLocalOffset, centralOffset, "local file area has gaps or trailing data");
  return { entries, metadata, centralOffset, centralBytes };
}

function rebuildStoredZip(entries) {
  const ordered = [...entries].sort((left, right) => lexicalCompare(left.path, right.path));
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of ordered) {
    const name = Buffer.from(entry.path, "utf8");
    const data = Buffer.from(entry.data);
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(20, 4); localHeader.writeUInt16LE(0x0800, 6); localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10); localHeader.writeUInt16LE(0x0021, 12); localHeader.writeUInt32LE(checksum, 14); localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22); localHeader.writeUInt16LE(name.length, 26);
    local.push(localHeader, name, data);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10); header.writeUInt16LE(0, 12); header.writeUInt16LE(0x0021, 14); header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(data.length, 20); header.writeUInt32LE(data.length, 24); header.writeUInt16LE(name.length, 28); header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += localHeader.length + name.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(ordered.length, 8); eocd.writeUInt16LE(ordered.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, eocd]);
}

function exactPaths(actual, expected, label) { assert.deepEqual([...actual].sort(lexicalCompare), [...expected].sort(lexicalCompare), `${label} differs`); }

export function buildArtifactRoles() {
  return {
    homepage: {
      forwardRecording: `homepage-manifesto/${HOME_RECORDINGS[0]}`, reverseRecording: `homepage-manifesto/${HOME_RECORDINGS[1]}`,
      sheets: HOME_SHEETS.map((item) => `homepage-manifesto/${item}`),
      reports: Object.fromEntries(Object.keys(HOME_REPORT_SCHEMAS).map((item) => [path.posix.basename(item, ".json"), `homepage-manifesto/${item}`])),
      evidenceManifest: `homepage-manifesto/${HOME_MANIFEST}`,
    },
    supportingRoutes: {
      routes: Object.fromEntries(ROUTE_ORDER.map((route) => [route, Object.fromEntries(ROUTE_ARTIFACTS.map((name) => [path.posix.basename(name, path.posix.extname(name)), `supporting-routes/routes/${route}/${name}`]))])),
      crossRoute: Object.fromEntries(CROSS_ROUTE_ARTIFACTS.map((name) => [path.posix.basename(name, path.posix.extname(name)), `supporting-routes/cross-route-system/${name}`])),
      reports: Object.fromEntries(ROUTE_REPORTS.map((name) => [path.posix.basename(name, ".json"), `supporting-routes/${name}`])),
      manifest: "supporting-routes/route-preproduction-manifest.json", readme: "supporting-routes/README.md",
    },
    authorities: Object.fromEntries(Object.entries(AUTHORITY_SOURCES).map(([role, authority]) => [role, authority.archive]).concat([["gitDeployment", DEPLOYMENT_AUTHORITY_PATH]])),
  };
}

function flattenRoles(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((item) => flattenRoles(item, result));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => flattenRoles(item, result));
  return result;
}

export function validateArtifactRoles(roles, entryPaths) {
  assert.deepEqual(roles, buildArtifactRoles(), "artifact roles differ from independent exact contract");
  const paths = flattenRoles(roles);
  assert.equal(paths.length, 95, "artifact role count differs");
  assert.equal(new Set(paths).size, 95, "artifact roles must be unique");
  const available = new Set(entryPaths);
  paths.forEach((item) => assert.ok(available.has(item), `artifact role target missing: ${item}`));
  return true;
}

export function validateReviewPolicy(document, label = "manifest") {
  assert.deepEqual(document.humanReviewGates, HUMAN_REVIEW_GATES, `${label} seven pending gates differ`);
  assert.deepEqual(document.authorization, AUTHORIZATION, `${label} no-self-approval boundary differs`);
  if (document.policy) {
    assert.equal(document.policy.phase5B, "UNAUTHORIZED", `${label} Phase 5B boundary differs`);
    assert.equal(document.policy.pendingGateCount, 7, `${label} pending-gate count differs`);
    assert.equal(document.policy.authorMaySelfApprove, false, `${label} author cannot self-approve`);
    assert.equal(document.policy.deployerMaySelfApprove, false, `${label} deployer cannot self-approve`);
    assert.equal(document.policy.machinePassGrantsHumanAcceptance, false, `${label} machine PASS cannot grant acceptance`);
  }
  return true;
}

export function selfTest() {
  const entries = [
    { path: IN_ARCHIVE_MANIFEST, data: Buffer.from('{"schema":"phase5ar-audit-self-test"}\n') },
    { path: README_FILENAME, data: Buffer.from("independent audit fixture\n") },
  ];
  const archive = rebuildStoredZip(entries);
  const parsed = parseStoredZip(archive);
  assert.equal(parsed.entries.size, 2, "ZIP parser self-test count differs");
  assert.ok(rebuildStoredZip([...parsed.entries].map(([entryPath, data]) => ({ path: entryPath, data }))).equals(archive), "canonical reconstruction self-test differs");
  const tampered = Buffer.from(archive);
  const offset = tampered.indexOf(Buffer.from("independent audit fixture"));
  tampered[offset] ^= 0x01;
  assert.throws(() => parseStoredZip(tampered), /CRC rejection/);
  validateReviewPolicy({ humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION, policy: { phase5B: "UNAUTHORIZED", pendingGateCount: 7, authorMaySelfApprove: false, deployerMaySelfApprove: false, machinePassGrantsHumanAcceptance: false } }, "self-test");
  assert.throws(() => assertNoPrivateText(Buffer.from("github_pat_abcdefghijklmnopqrstuvwxyz123456"), README_FILENAME), /privacy/);
  assert.equal(assertNoPrivateText(Buffer.from([0x5c, 0x5c, 0x66, 0x51, 0xe3, 0xda, 0x08, 0x56, 0x5c, 0x46, 0xbb]), HOME_RECORDINGS[0]), true);
  assert.throws(() => assertNoPrivateText(Buffer.alloc(0), "C:\\Users\\private\\01-forward-manifesto.mp4"), /privacy/);
  return { schema: `${AUDIT_SCHEMA}.self-test`, status: "PASS", tests: 8, writesPerformed: false, gitCommandsPerformed: false, networkRequestsPerformed: false, mediaToolsLaunched: false };
}

function parseJsonEntry(entries, relativePath) {
  const bytes = entries.get(relativePath);
  assert.ok(bytes, `missing JSON entry ${relativePath}`);
  try { return JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`invalid JSON entry ${relativePath}`); }
}

function recordMap(records, label) {
  assert.ok(Array.isArray(records), `${label} must be an array`);
  const map = new Map();
  for (const record of records) {
    safeRelativePath(record.relativePath, `${label} path`);
    assert.ok(Number.isSafeInteger(record.byteSize) && record.byteSize > 0, `${record.relativePath} byteSize differs`);
    assert.match(record.sha256 ?? "", HASH64, `${record.relativePath} SHA-256 differs`);
    assert.ok(!map.has(record.relativePath), `${label} duplicate ${record.relativePath}`);
    map.set(record.relativePath, record);
  }
  return map;
}

function innerRecordMap(records, label) {
  assert.ok(Array.isArray(records), `${label} must be an array`);
  const map = new Map();
  for (const record of records) {
    safeRelativePath(record.relativePath, `${label} path`);
    assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0, `${record.relativePath} bytes differ`);
    assert.match(record.sha256 ?? "", HASH64, `${record.relativePath} hash differs`);
    assert.ok(!map.has(record.relativePath), `${label} duplicate ${record.relativePath}`);
    map.set(record.relativePath, record);
  }
  return map;
}

function validateInnerLedger(entries, prefix, records, expected, label) {
  const ledger = innerRecordMap(records, label);
  exactPaths([...ledger.keys()], expected, `${label} paths`);
  for (const relativePath of expected) {
    const bytes = entries.get(`${prefix}/${relativePath}`);
    assert.ok(bytes, `${label} payload missing: ${relativePath}`);
    assert.equal(bytes.length, ledger.get(relativePath).bytes, `${label} bytes differ: ${relativePath}`);
    assert.equal(sha256(bytes), ledger.get(relativePath).sha256, `${label} hash differs: ${relativePath}`);
  }
}

function validateHomepage(entries, manifest, expected) {
  assert.equal(manifest.schema, HOME_MANIFEST_SCHEMA, "homepage evidence schema differs");
  assert.equal(manifest.status, "PASS", "homepage evidence must PASS");
  assert.equal(manifest.target?.expectedHead, expected.expectedHead, "homepage HEAD differs");
  assert.equal(manifest.target?.expectedBranch, REQUIRED_BRANCH, "homepage branch differs");
  assert.equal(manifest.target?.deploymentId, expected.expectedDeploymentId, "homepage deployment differs");
  assert.equal(manifest.target?.immutableUrl, expected.immutableUrl, "homepage immutable URL differs");
  assert.equal(manifest.target?.branchUrl, expected.branchUrl, "homepage branch URL differs");
  assert.equal(manifest.acceptedBaseline?.head, ACCEPTED_PHASE5A_SHA, "homepage accepted baseline differs");
  assert.equal(manifest.acceptedBaseline?.browserEvidenceManifestSha256, ACCEPTED_PHASE5A_EVIDENCE_MANIFEST_SHA256, "accepted evidence hash differs");
  assert.equal(manifest.acceptedBaseline?.deploymentReportSha256, ACCEPTED_PHASE5A_DEPLOYMENT_REPORT_SHA256, "accepted deployment hash differs");
  assert.equal(manifest.activeMedia?.sourceBlendSha256, PRODUCTION_BLEND_SHA256, "homepage source blend hash differs");
  assert.equal(manifest.activeMedia?.manifestSha256, ACTIVE_MEDIA_MANIFEST_SHA256, "homepage media manifest hash differs");
  assert.deepEqual(manifest.humanReviewGates, HUMAN_REVIEW_GATES, "homepage gates differ");
  assert.equal(manifest.authorization?.humanAccepted, false); assert.equal(manifest.authorization?.mainMerged, false); assert.equal(manifest.authorization?.phase5BAuthorized, false);
  validateInnerLedger(entries, "homepage-manifesto", manifest.artifacts, expectedHomePaths().filter((item) => item !== HOME_MANIFEST), "homepage evidence ledger");
  assert.equal(manifest.summary?.recordings, 2); assert.equal(manifest.summary?.sheets, 4); assert.equal(manifest.summary?.reportsExcludingSelf, 6);
  for (const [relativePath, schema] of Object.entries(HOME_REPORT_SCHEMAS)) {
    const report = parseJsonEntry(entries, `homepage-manifesto/${relativePath}`);
    assert.equal(report.schema, schema, `${relativePath} schema differs`); assert.equal(report.status, "PASS", `${relativePath} must PASS`);
    assert.equal(report.target?.expectedHead, expected.expectedHead, `${relativePath} HEAD differs`);
  }
}

function validateRoutes(entries) {
  const manifest = parseJsonEntry(entries, "supporting-routes/route-preproduction-manifest.json");
  assert.equal(manifest.schema, ROUTE_MANIFEST_SCHEMA, "route manifest schema differs");
  assert.equal(manifest.status, "PASS", "route capture must PASS"); assert.equal(manifest.mode, "full", "route capture must be full");
  assert.deepEqual(manifest.routes, ROUTE_ORDER, "route order differs"); assert.equal(manifest.totals?.artifacts, 70, "route artifact total differs");
  assert.equal(manifest.publicRoutesChanged, false); assert.equal(manifest.phase5BAuthorized, false); assert.equal(manifest.humanVisualJudgmentAuthoritative, true);
  validateInnerLedger(entries, "supporting-routes", manifest.artifacts, expectedRouteReviewPaths(), "route artifact ledger");
  const reportSchemas = {
    "reports/accessibility.json": "qh.phase5ar.route-accessibility.v1", "reports/public-source-freeze.json": "qh.phase5ar.public-source-freeze.v1",
    "reports/request-isolation.json": "qh.phase5ar.route-request-isolation.v1", "reports/route-capture-report.json": "qh.phase5ar.route-preproduction-capture.v1",
  };
  for (const [relativePath, schema] of Object.entries(reportSchemas)) {
    const report = parseJsonEntry(entries, `supporting-routes/${relativePath}`);
    assert.equal(report.schema, schema, `${relativePath} schema differs`); assert.equal(report.status, "PASS", `${relativePath} must PASS`);
    assert.equal(report.phase5BAuthorized ?? report.provenance?.phase5BAuthorized ?? false, false, `${relativePath} authorizes Phase 5B`);
  }
  const freeze = parseJsonEntry(entries, "supporting-routes/reports/public-source-freeze.json");
  assert.equal(freeze.acceptedPhase5A, ACCEPTED_PHASE5A_SHA); assert.equal(freeze.publicRoutesChanged, false); assert.equal(freeze.files?.length, 19);
  const antiTemplate = entries.get("supporting-routes/cross-route-system/PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md").toString("utf8");
  assert.equal((antiTemplate.match(/<!--\s*pair:[a-z0-9-]+\|[a-z0-9-]+\s*-->/g) ?? []).length, 36, "anti-template pair count differs");
  assert.match(antiTemplate, /Human visual judgment remains authority/i);
  return manifest;
}

function validateDeployment(entries, expected) {
  const report = parseJsonEntry(entries, DEPLOYMENT_AUTHORITY_PATH);
  assert.equal(report.schema, "quantum-hub.phase-5a-r.deployment-verification.v1"); assert.equal(report.status, "PASS");
  assert.equal(report.git?.head, expected.expectedHead); assert.equal(report.git?.parent, ACCEPTED_PHASE5A_SHA); assert.equal(report.git?.commits?.length, 5);
  assert.deepEqual(report.git.commits.map((item) => item.subject), CHECKPOINT_SUBJECTS);
  assert.equal(report.git?.cleanTree, true); assert.equal(report.git?.localMain, FROZEN_MAIN_SHA); assert.equal(report.git?.upstreamMain, FROZEN_MAIN_SHA);
  assert.equal(report.git?.liveMain, FROZEN_MAIN_SHA); assert.equal(report.git?.upstreamBranch, expected.expectedHead); assert.equal(report.git?.liveBranch, expected.expectedHead);
  assert.equal(report.deployment?.deploymentId, expected.expectedDeploymentId); assert.equal(report.deployment?.project, REQUIRED_PROJECT);
  assert.equal(report.deployment?.exactSha, expected.expectedHead); assert.equal(report.deployment?.branch, REQUIRED_BRANCH);
  assert.equal(report.deployment?.immutableUrl, expected.immutableUrl); assert.equal(report.deployment?.branchUrl, expected.branchUrl);
  assert.equal(String(report.deployment?.githubCheck?.id), String(expected.deploymentCheckRunId));
  assert.ok(Object.values(report.checks ?? {}).every((value) => value === true), "deployment checks differ");
  assert.deepEqual(report.authorization, { humanAccepted: false, mainMerged: false, phase5BAuthorized: false });
  return report;
}

async function validateImages(entries) {
  let count = 0;
  for (const [relativePath, bytes] of entries) {
    if (!IMAGE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) continue;
    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    assert.ok(["png", "jpeg", "webp"].includes(metadata.format), `${relativePath} image format differs`);
    assert.ok(Number.isSafeInteger(metadata.width) && metadata.width >= 16 && Number.isSafeInteger(metadata.height) && metadata.height >= 16, `${relativePath} image geometry differs`);
    if (relativePath.endsWith("desktop-storyboard--1440x900.png")) { assert.equal(metadata.width, 1440); assert.ok(metadata.height >= 900); }
    if (relativePath.endsWith("mobile-storyboard--390x844.png")) { assert.equal(metadata.width, 390); assert.ok(metadata.height >= 844); }
    if (relativePath.endsWith("narrow-overture--320x800.png")) { assert.equal(metadata.width, 320); assert.ok(metadata.height >= 800); }
    count += 1;
  }
  return count;
}

async function run(command, args, label, options = {}) {
  try { return await execFileAsync(command, args, { cwd: options.cwd ?? ROOT, windowsHide: true, encoding: "utf8", maxBuffer: options.maxBuffer ?? 10_000_000 }); }
  catch (error) { throw new Error(`${label} failed: ${String(error.stderr || error.stdout || error.message).slice(-4_000)}`); }
}
async function git(...args) { return (await run("git", args, "independent Git authority")).stdout.trim(); }

async function validateFfprobe(executable) {
  const resolved = await realpath(executable);
  assert.ok((await stat(resolved)).isFile(), "ffprobe must be a regular file");
  await run(resolved, ["-version"], "independent ffprobe identity", { maxBuffer: 1_000_000 });
  return resolved;
}

async function validateVideos(entries, ffprobe) {
  const root = await mkdtemp(path.join(os.tmpdir(), "phase5ar-audit-videos-"));
  try {
    let count = 0;
    for (const [relativePath, bytes] of entries) {
      if (path.extname(relativePath).toLowerCase() !== ".mp4") continue;
      const file = path.join(root, `${count}.mp4`);
      await writeFile(file, bytes, { flag: "wx" });
      const { stdout } = await run(ffprobe, ["-v", "error", "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate", "-of", "json", file], `independent ffprobe ${relativePath}`, { maxBuffer: 2_000_000 });
      const document = JSON.parse(stdout);
      const streams = document.streams ?? [];
      const videos = streams.filter((stream) => stream.codec_type === "video");
      assert.equal(videos.length, 1, `${relativePath} video stream count differs`); assert.equal(streams.length, 1, `${relativePath} must have zero audio/other streams`);
      assert.ok(String(document.format?.format_name).includes("mp4")); assert.equal(videos[0].codec_name, "h264"); assert.equal(videos[0].pix_fmt, "yuv420p");
      assert.equal(videos[0].avg_frame_rate, "30/1"); assert.equal(videos[0].r_frame_rate, "30/1"); assert.ok(Number(document.format?.duration) >= 4);
      count += 1;
    }
    assert.equal(count, 2, "archive must contain exactly two MP4 recordings");
    return count;
  } finally { await rm(root, { recursive: true, force: true }); }
}

function parseLinearLog(text) {
  const commits = text.split(/\r?\n/).filter(Boolean).map((line) => {
    const [commit, parents, ...subject] = line.split("\t"); return { commit, parents: parents.split(" ").filter(Boolean), subject: subject.join("\t") };
  });
  assert.equal(commits.length, 5, "independent commit count differs");
  commits.forEach((item, index) => {
    assert.match(item.commit, HASH40); assert.equal(item.parents.length, 1); assert.equal(item.subject, CHECKPOINT_SUBJECTS[index]);
    assert.equal(item.parents[0], index === 0 ? ACCEPTED_PHASE5A_SHA : commits[index - 1].commit);
  });
  return commits;
}

function parseTree(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = line.match(/^\d+\s+blob\s+[0-9a-f]{40}\s+(\d+)\t(.+)$/); assert.ok(match, `cannot parse tree record: ${line}`); return { bytes: Number(match[1]), path: match[2] };
  });
}

async function validateRepository(manifest, expected, entries) {
  const [head, branch, statusText, main, originMain, upstream, upstreamName, logText, liveText, mediaDiff, publicDiff, baseTreeText, headTreeText] = await Promise.all([
    git("rev-parse", "HEAD"), git("branch", "--show-current"), git("status", "--porcelain=v1", "--untracked-files=all"), git("rev-parse", "main"), git("rev-parse", "origin/main"),
    git("rev-parse", "@{upstream}"), git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"),
    git("log", "--format=%H%x09%P%x09%s", "--reverse", `${ACCEPTED_PHASE5A_SHA}..${expected.expectedHead}`),
    git("ls-remote", "--heads", "origin", `refs/heads/${REQUIRED_BRANCH}`, "refs/heads/main"),
    git("diff", "--name-only", ACCEPTED_PHASE5A_SHA, expected.expectedHead, "--", PRODUCTION_BLEND_RELATIVE, ACTIVE_MEDIA_MANIFEST_RELATIVE),
    git("diff", "--name-only", ACCEPTED_PHASE5A_SHA, expected.expectedHead, "--", ...FROZEN_PUBLIC_FILES),
    git("ls-tree", "-r", "-l", ACCEPTED_PHASE5A_SHA), git("ls-tree", "-r", "-l", expected.expectedHead),
  ]);
  assert.equal(head, expected.expectedHead); assert.equal(branch, REQUIRED_BRANCH); assert.equal(statusText, ""); assert.equal(main, FROZEN_MAIN_SHA); assert.equal(originMain, FROZEN_MAIN_SHA);
  assert.equal(upstream, expected.expectedHead); assert.equal(upstreamName, `origin/${REQUIRED_BRANCH}`); assert.equal(mediaDiff, ""); assert.equal(publicDiff, "");
  const live = new Map(liveText.split(/\r?\n/).filter(Boolean).map((line) => line.trim().split(/\s+/)).map(([commit, reference]) => [reference, commit]));
  assert.equal(live.get(`refs/heads/${REQUIRED_BRANCH}`), expected.expectedHead); assert.equal(live.get("refs/heads/main"), FROZEN_MAIN_SHA);
  const commits = parseLinearLog(logText);
  assert.deepEqual(manifest.source.commits, commits, "manifest commit chain differs from independent Git authority");
  const baseTree = parseTree(baseTreeText); const headTree = parseTree(headTreeText);
  const trackedDelta = {
    baseFiles: baseTree.length, finalFiles: headTree.length, fileCount: headTree.length - baseTree.length,
    baseBytes: baseTree.reduce((sum, item) => sum + item.bytes, 0), finalBytes: headTree.reduce((sum, item) => sum + item.bytes, 0),
    bytes: headTree.reduce((sum, item) => sum + item.bytes, 0) - baseTree.reduce((sum, item) => sum + item.bytes, 0),
  };
  for (const [key, value] of Object.entries(trackedDelta)) assert.equal(manifest.source.trackedDelta[key], value, `tracked delta ${key} differs`);
  const [blend, mediaManifest] = await Promise.all([readFile(path.join(ROOT, ...PRODUCTION_BLEND_RELATIVE.split("/"))), readFile(path.join(ROOT, ...ACTIVE_MEDIA_MANIFEST_RELATIVE.split("/")))]);
  assert.equal(sha256(blend), PRODUCTION_BLEND_SHA256); assert.equal(sha256(mediaManifest), ACTIVE_MEDIA_MANIFEST_SHA256);
  for (const authority of Object.values(AUTHORITY_SOURCES)) {
    const [working, accepted] = await Promise.all([readFile(path.join(ROOT, ...authority.source.split("/"))), run("git", ["show", `${ACCEPTED_PHASE5A_SHA}:${authority.source}`], `accepted authority ${authority.source}`, { encoding: null, maxBuffer: 5_000_000 }).then((result) => Buffer.from(result.stdout))]);
    const packaged = entries.get(authority.archive);
    assert.ok(packaged.equals(working), `${authority.archive} differs from working authority`);
    assert.ok(packaged.equals(accepted), `${authority.archive} differs from accepted Phase 5A`);
  }
  return { head, branch, main, upstream, liveBranch: live.get(`refs/heads/${REQUIRED_BRANCH}`), liveMain: live.get("refs/heads/main"), cleanTree: true, commits: commits.length, trackedDelta };
}

function normalizePreview(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !url.hostname.endsWith(`.${REQUIRED_PROJECT}.pages.dev`) || url.hostname === `${REQUIRED_PROJECT}.pages.dev`) throw new Error(`${label} differs`);
  return url.toString();
}

function validateExpected(expected) {
  assert.match(expected.expectedHead ?? "", HASH40); assert.equal(expected.expectedHead, expected.expectedUpstream);
  assert.equal(expected.expectedBranch, REQUIRED_BRANCH); assert.equal(expected.expectedMain, FROZEN_MAIN_SHA); assert.equal(expected.acceptedPhase5A, ACCEPTED_PHASE5A_SHA);
  assert.match(expected.expectedDeploymentId ?? "", UUID); assert.equal(expected.deploymentProject, REQUIRED_PROJECT);
  assert.ok(/^[1-9][0-9]{0,30}$/.test(String(expected.deploymentCheckRunId ?? "")));
  expected.immutableUrl = normalizePreview(expected.immutableUrl, "immutable URL"); expected.branchUrl = normalizePreview(expected.branchUrl, "branch URL");
  assert.notEqual(expected.immutableUrl, expected.branchUrl); return expected;
}

export async function auditBuffers({ archiveBytes, detachedBytes, expected, ffprobe = null, validateMedia = false, validateGit = false } = {}) {
  validateExpected(expected);
  const detached = JSON.parse(Buffer.from(detachedBytes).toString("utf8"));
  assert.equal(detached.schema, DETACHED_SCHEMA); assert.equal(detached.status, "PASS"); assert.equal(detached.generatedAt, FIXED_EPOCH);
  validateReviewPolicy(detached, "detached manifest");
  assert.equal(detached.archive?.filename, ARCHIVE_FILENAME); assert.equal(detached.archive?.bytes, archiveBytes.length); assert.equal(detached.archive?.sha256, sha256(archiveBytes));
  assert.equal(detached.source?.branch, REQUIRED_BRANCH); assert.equal(detached.source?.head, expected.expectedHead); assert.equal(detached.source?.acceptedPhase5A, ACCEPTED_PHASE5A_SHA); assert.equal(detached.source?.frozenMain, FROZEN_MAIN_SHA);
  assert.deepEqual(detached.selfBinding, { archiveHashBindsEveryZIPByte: true, detachedManifestHashRecordedByIndependentAudit: true, inArchiveManifestHashBindsPackageContract: true });

  const parsed = parseStoredZip(archiveBytes);
  const rebuilt = rebuildStoredZip([...parsed.entries].map(([entryPath, data]) => ({ path: entryPath, data })));
  assert.ok(rebuilt.equals(archiveBytes), "archive is not independently reproducible canonical stored ZIP");
  const entries = parsed.entries;
  assert.equal(entries.size, 97, "archive entry count differs");
  assertNoPrivateText(detachedBytes, DETACHED_MANIFEST_FILENAME);
  for (const [relativePath, bytes] of entries) { assertAllowedEntry(relativePath); assertNoPrivateText(bytes, relativePath); }
  const manifestBytes = entries.get(IN_ARCHIVE_MANIFEST);
  assert.ok(manifestBytes, "in-archive manifest is missing");
  assert.equal(detached.inArchiveManifest?.path, IN_ARCHIVE_MANIFEST); assert.equal(detached.inArchiveManifest?.bytes, manifestBytes.length); assert.equal(detached.inArchiveManifest?.sha256, sha256(manifestBytes));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.equal(manifest.schema, PACKAGE_SCHEMA); assert.equal(manifest.status, "PASS"); assert.equal(manifest.generatedAt, FIXED_EPOCH);
  assert.deepEqual(manifest.deterministicArchive, { compression: "stored", fixedDosTimestamp: FIXED_EPOCH, lexicalUtf8ByteOrder: true, zip64: false });
  validateReviewPolicy(manifest, "in-archive manifest");
  assert.deepEqual(manifest.unhashedSelfEntries, [IN_ARCHIVE_MANIFEST]);
  assert.ok(Object.values(manifest.exclusions ?? {}).every((value) => value === true), "package exclusions differ");
  assert.equal(manifest.source?.branch, REQUIRED_BRANCH); assert.equal(manifest.source?.head, expected.expectedHead); assert.equal(manifest.source?.acceptedPhase5A, ACCEPTED_PHASE5A_SHA); assert.equal(manifest.source?.frozenMain, FROZEN_MAIN_SHA);
  assert.equal(manifest.deployment?.deploymentId, expected.expectedDeploymentId); assert.equal(manifest.deployment?.project, REQUIRED_PROJECT); assert.equal(manifest.deployment?.checkRunId, String(expected.deploymentCheckRunId));
  assert.equal(manifest.deployment?.commit, expected.expectedHead); assert.equal(manifest.deployment?.branch, REQUIRED_BRANCH); assert.equal(manifest.deployment?.immutableUrl, expected.immutableUrl); assert.equal(manifest.deployment?.branchUrl, expected.branchUrl);
  assert.deepEqual(manifest.acceptedAuthorities, {
    activeProductionMediaManifestSha256: ACTIVE_MEDIA_MANIFEST_SHA256, phase4ProductionBlendSha256: PRODUCTION_BLEND_SHA256,
    phase5ABrowserEvidenceManifestSha256: ACCEPTED_PHASE5A_EVIDENCE_MANIFEST_SHA256, phase5ADeploymentReportSha256: ACCEPTED_PHASE5A_DEPLOYMENT_REPORT_SHA256,
    phase5AHead: ACCEPTED_PHASE5A_SHA, phase5AReviewAuditSha256: ACCEPTED_PHASE5A_REVIEW_AUDIT_SHA256,
    phase5AReviewManifestSha256: ACCEPTED_PHASE5A_REVIEW_MANIFEST_SHA256, phase5AReviewZipSha256: ACCEPTED_PHASE5A_REVIEW_ZIP_SHA256,
  });
  assert.equal(manifest.inventory?.homepageFiles, 13); assert.equal(manifest.inventory?.routeReviewArtifacts, 70); assert.equal(manifest.inventory?.routeSupportFiles, 6);
  assert.equal(manifest.inventory?.routeFolders, 9); assert.equal(manifest.inventory?.routeArtifactsPerRoute, 7); assert.equal(manifest.inventory?.crossRouteArtifacts, 7); assert.equal(manifest.inventory?.authorityFiles, 6);
  assert.equal(manifest.inventory?.hashedNonSelfArchiveFiles, 96); assert.equal(manifest.inventory?.archiveEntries, 97);
  const ledger = recordMap(manifest.files, "package file ledger");
  exactPaths([...ledger.keys(), IN_ARCHIVE_MANIFEST], [...entries.keys()], "archive/manifest paths");
  assert.equal(ledger.size, 96); assert.equal(manifest.inventory.hashedNonSelfArchiveBytes, [...ledger.values()].reduce((sum, item) => sum + item.byteSize, 0));
  for (const [relativePath, record] of ledger) {
    const bytes = entries.get(relativePath); assert.ok(bytes, `ledger payload missing: ${relativePath}`); assert.equal(bytes.length, record.byteSize); assert.equal(sha256(bytes), record.sha256);
  }
  assert.equal(manifest.deployment.verificationReportSha256, ledger.get(DEPLOYMENT_AUTHORITY_PATH).sha256);
  validateArtifactRoles(manifest.traceability?.artifactRoles, [...entries.keys()]);
  assert.equal(manifest.traceability?.everyNonSelfArchiveFileHasSha256, true); assert.equal(manifest.traceability?.inArchiveManifestBoundByDetachedManifest, true); assert.equal(manifest.traceability?.detachedManifestBoundByIndependentAudit, true);
  exactPaths([...entries.keys()].filter((item) => item.startsWith("homepage-manifesto/")).map((item) => item.slice("homepage-manifesto/".length)), expectedHomePaths(), "homepage archive surface");
  exactPaths([...entries.keys()].filter((item) => item.startsWith("supporting-routes/")).map((item) => item.slice("supporting-routes/".length)), expectedRouteRootPaths(), "route archive surface");
  exactPaths([...entries.keys()].filter((item) => item.startsWith("review-authorities/")), [...Object.values(AUTHORITY_SOURCES).map((item) => item.archive), DEPLOYMENT_AUTHORITY_PATH], "authority archive surface");
  validateHomepage(entries, parseJsonEntry(entries, `homepage-manifesto/${HOME_MANIFEST}`), expected);
  validateRoutes(entries);
  validateDeployment(entries, expected);
  assert.match(entries.get(README_FILENAME).toString("utf8"), /all six Phase 5A gates remain PENDING HUMAN REVIEW/i);
  assert.match(entries.get(README_FILENAME).toString("utf8"), /Phase 5B remains UNAUTHORIZED/i);
  const images = await validateImages(entries);
  let videos = 2;
  if (validateMedia) { assert.ok(ffprobe, "ffprobe is required for media audit"); videos = await validateVideos(entries, ffprobe); }
  const repository = validateGit ? await validateRepository(manifest, expected, entries) : null;
  return { detached, manifest, entries, images, videos, repository, canonical: true, privacy: "PASS", roleContract: "PASS", noSelfApproval: true };
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]; if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`); return value;
}

export function parseArguments(argv) {
  const options = { archive: null, manifest: null, auditOutput: null, expectedHead: null, expectedUpstream: null, expectedBranch: REQUIRED_BRANCH, expectedMain: FROZEN_MAIN_SHA, acceptedPhase5A: ACCEPTED_PHASE5A_SHA, expectedDeploymentId: null, deploymentProject: REQUIRED_PROJECT, deploymentCheckRunId: null, immutableUrl: null, branchUrl: null, ffprobe: null, expectedParentProcessId: null, selfTest: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]; const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--archive") options.archive = path.resolve(next());
    else if (argument === "--manifest") options.manifest = path.resolve(next());
    else if (argument === "--audit-output") options.auditOutput = path.resolve(next());
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-upstream") options.expectedUpstream = next().toLowerCase();
    else if (argument === "--expected-branch") options.expectedBranch = next();
    else if (argument === "--expected-main") options.expectedMain = next().toLowerCase();
    else if (argument === "--accepted-phase5a") options.acceptedPhase5A = next().toLowerCase();
    else if (argument === "--expected-deployment-id") options.expectedDeploymentId = next();
    else if (argument === "--deployment-project") options.deploymentProject = next();
    else if (argument === "--deployment-check-run-id") options.deploymentCheckRunId = next();
    else if (argument === "--immutable-url") options.immutableUrl = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--ffprobe") options.ffprobe = path.resolve(next());
    else if (argument === "--expected-parent-process-id") options.expectedParentProcessId = Number(next());
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

async function auditArchive(input) {
  const expected = validateExpected({ ...input });
  for (const [key, basename, label] of [["archive", ARCHIVE_FILENAME, "archive"], ["manifest", DETACHED_MANIFEST_FILENAME, "detached manifest"], ["auditOutput", AUDIT_FILENAME, "audit output"]]) {
    if (!input[key] || path.basename(input[key]) !== basename) throw new Error(`${label} basename must be ${basename}`);
    assertExternalPath(input[key], label);
  }
  if (!input.ffprobe || !path.isAbsolute(input.ffprobe)) throw new Error("ffprobe must be absolute");
  if (!Number.isSafeInteger(input.expectedParentProcessId) || input.expectedParentProcessId <= 0 || process.ppid !== input.expectedParentProcessId || process.pid === input.expectedParentProcessId) throw new Error("auditor is not the expected separate child process");
  const [archivePath, manifestPath, ffprobe] = await Promise.all([realpath(input.archive), realpath(input.manifest), validateFfprobe(input.ffprobe)]);
  assertExternalPath(archivePath, "archive"); assertExternalPath(manifestPath, "manifest");
  try { await access(input.auditOutput); throw new Error(`audit output already exists: ${input.auditOutput}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const [archiveBytes, detachedBytes] = await Promise.all([readFile(archivePath), readFile(manifestPath)]);
  const result = await auditBuffers({ archiveBytes, detachedBytes, expected, ffprobe, validateMedia: true, validateGit: true });
  const audit = {
    schema: AUDIT_SCHEMA, status: "PASS", generatedAt: new Date().toISOString(),
    archive: { filename: ARCHIVE_FILENAME, bytes: archiveBytes.length, sha256: sha256(archiveBytes), entries: result.entries.size, canonicalStoredZip: true, crcValidated: true },
    detachedManifest: { filename: DETACHED_MANIFEST_FILENAME, bytes: detachedBytes.length, sha256: sha256(detachedBytes), archiveBinding: true, inArchiveManifestBinding: true },
    inArchiveManifest: { path: IN_ARCHIVE_MANIFEST, bytes: result.entries.get(IN_ARCHIVE_MANIFEST).length, sha256: sha256(result.entries.get(IN_ARCHIVE_MANIFEST)), schema: PACKAGE_SCHEMA },
    contract: { homepageFiles: 13, recordings: result.videos, images: result.images, routeReviewArtifacts: 70, routeFolders: 9, routeArtifactsPerRoute: 7, crossRouteArtifacts: 7, antiTemplatePairs: 36, artifactRoles: "PASS", privacyAndSecrets: "PASS", nestedArchives: 0, rawFrames: 0, prototypeInternals: 0 },
    repository: result.repository,
    phase4ProductionMedia: { unchanged: true, sourceBlendSha256: PRODUCTION_BLEND_SHA256, activeManifestSha256: ACTIVE_MEDIA_MANIFEST_SHA256 },
    publicSupportingRoutesChanged: false,
    humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION,
    process: { separateProcess: true, auditorProcessId: process.pid, parentProcessId: process.ppid },
    conclusion: { machineIntegrityPassOnly: true, humanAcceptanceGranted: false, phase5BAuthorized: false },
  };
  assertNoPrivateText(Buffer.from(stableJson(audit)), AUDIT_FILENAME);
  await mkdir(path.dirname(input.auditOutput), { recursive: true });
  const temporary = `${input.auditOutput}.${process.pid}.${randomUUID()}.tmp`;
  const bytes = Buffer.from(stableJson(audit));
  await writeFile(temporary, bytes, { flag: "wx" });
  try { await rename(temporary, input.auditOutput); } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return audit;
}

function printHelp() {
  process.stdout.write(`Independent Phase 5A-R review-package audit\n\nUsage:\n  node scripts/${path.basename(SCRIPT)} --archive <exact ZIP> --manifest <exact detached manifest> --audit-output <fresh exact audit path> --expected-head <sha> --expected-upstream <sha> --expected-deployment-id <uuid> --deployment-check-run-id <id> --immutable-url <url> --branch-url <url> --ffprobe <absolute> --expected-parent-process-id <pid>\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2)); if (options.help) return printHelp();
  if (options.selfTest) { process.stdout.write(stableJson(selfTest())); return; }
  const result = await auditArchive(options); process.stdout.write(stableJson({ schema: `${AUDIT_SCHEMA}.result`, status: result.status, archive: result.archive, auditOutput: AUDIT_FILENAME }));
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { process.stderr.write(`Phase 5A-R independent audit FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
