#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
export const PACKAGE_SCHEMA = "quantum-hub.phase-6.global-hardening-human-review.v1";
export const DETACHED_SCHEMA = `${PACKAGE_SCHEMA}.detached-manifest`;
export const AUDIT_SCHEMA = `${PACKAGE_SCHEMA}.independent-audit`;
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const MAX_ARCHIVE_BYTES = 75 * 1024 * 1024;
export const REQUIRED_BRANCH = "feature/phase-6-global-hardening";
export const ACCEPTED_PHASE5B_SHA = "005a36860ecbfd6fedb3d3f2223f168c1edfbb05";
export const FROZEN_MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const REQUIRED_REPOSITORY = "AmirNatan1/Qsite1";
export const REQUIRED_REMOTE_URL = "https://github.com/AmirNatan1/Qsite1.git";
export const REQUIRED_CLOUDFLARE_PROJECT = "qsite1";
export const REQUIRED_BRANCH_URL = "https://feature-phase-6-global-harde.qsite1.pages.dev/";
export const REQUIRED_ARCHIVE_FILENAME = "phase-6-global-hardening-human-review.zip";
export const DEPLOYMENT_VERIFICATION_PATH = "00-provenance/deployment-verification.json";
export const DEPLOYMENT_VERIFICATION_SCHEMA = "quantum-hub.phase-6.deployment-verification.v1";
export const R1_PACKAGE_SCHEMA = "quantum-hub.phase-6-r1.validation-closure-human-review.v1";
export const R1_DETACHED_SCHEMA = `${R1_PACKAGE_SCHEMA}.detached-manifest`;
export const R1_AUDIT_SCHEMA = `${R1_PACKAGE_SCHEMA}.independent-audit`;
export const R1_REQUIRED_BRANCH = "repair/phase-6-r1-validation-closure";
export const R1_REQUIRED_PARENT = "aee036740b129624c54b8f1b878229f955d187ae";
export const R1_REQUIRED_BRANCH_URL = "https://repair-phase-6-r1-validation.qsite1.pages.dev/";
export const R1_REQUIRED_ARCHIVE_FILENAME = "phase-6-r1-validation-closure-human-review.zip";
export const R1_DEPLOYMENT_VERIFICATION_SCHEMA = "quantum-hub.phase-6-r1.deployment-verification.v1";
export const R1_HUMAN_EVIDENCE_SCHEMA = "quantum-hub.phase-6-r1.human-evidence-ledger.v1";
export const R1_HUMAN_LEDGER_PATH = "11-physical-device/human-evidence-ledger.json";
export const R1_REQUIRED_HUMAN_RECORDINGS = Object.freeze([
  "iphone-safari-opening.mp4",
  "iphone-safari-maradin.mp4",
  "physical-scroll-input.mp4",
  "chrome-200-percent.mp4",
]);
const R1_HUMAN_STATUSES = Object.freeze(["PASS", "FAIL", "PENDING HUMAN REVIEW"]);
const R1_DEVICE_REVIEW_CHECKS = Object.freeze({
  "iphone-safari-opening.mp4": Object.freeze(["correctDormantOpening", "firstPracticalSwipeResponse", "nativeMomentum", "stopAtPhysicalState", "reverseReconstruction", "lineRasterQ", "autonomousManifestoFade", "noF1FlashFromIntentionalHome", "orientationStability", "backgroundForeground"]),
  "iphone-safari-maradin.mp4": Object.freeze(["onePlayerLifecycle", "backgroundForeground", "retryableSourceFree", "noPersistentRafOrInterval", "noLiveOrphanBlob"]),
  "physical-scroll-input.mp4": Object.freeze(["noPositiveInputDeadZone", "nativeInertiaSovereign", "promptReversal", "noCatchUpAnimation", "freezesAtRest", "noForcedSnapping", "supportingRoutesOrdinaryFlow"]),
});
const R1_ZOOM_ROUTE_CHECKS = Object.freeze(["completeH1", "completeOpeningProposition", "readableNavigation", "usableMobileMenuWhereApplicable", "noTextClipping", "noInternalWordSplitting", "noHiddenContent", "noHorizontalOverflow", "usableControlsAndLinks", "reasonableDocumentContinuation"]);
const R1_ZOOM_ROUTES = Object.freeze(["/", "/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/pocs/maradin/", "/spark/", "/about/", "/contact/", "/__phase6-intentional-404__/"]);

export const TOPOLOGY_SECTIONS = Object.freeze([
  "00-provenance",
  "01-baseline",
  "02-cross-engine",
  "03-homepage-motion",
  "04-supporting-routes",
  "05-history-bfcache",
  "06-performance",
  "07-memory",
  "08-network-media",
  "09-accessibility",
  "10-poster-study",
  "11-physical-device",
  "12-regression",
  "13-package",
]);

export const REPORT_SPECS = Object.freeze([
  Object.freeze({ source: "PHASE_6_BASELINE.md", archive: "01-baseline/PHASE_6_BASELINE.md" }),
  Object.freeze({ source: "PHASE_6_DEFECT_LEDGER.md", archive: "01-baseline/PHASE_6_DEFECT_LEDGER.md" }),
  Object.freeze({ source: "PHASE_6_POSTER_STUDY.md", archive: "10-poster-study/PHASE_6_POSTER_STUDY.md" }),
  Object.freeze({ source: "PHASE_6_PHYSICAL_DEVICE_HANDOFF.md", archive: "11-physical-device/PHASE_6_PHYSICAL_DEVICE_HANDOFF.md" }),
]);

export const HUMAN_REVIEW_GATES = Object.freeze({
  "NATIVE-SCROLL + MOTION INTEGRITY": "PENDING HUMAN REVIEW",
  "CROSS-ENGINE + HISTORY RESILIENCE": "PENDING HUMAN REVIEW",
  "PERFORMANCE + MEMORY SAFETY": "PENDING HUMAN REVIEW",
  "ACCESSIBILITY + FALLBACK RESILIENCE": "PENDING HUMAN REVIEW",
  "MEDIA + NETWORK ISOLATION": "PENDING HUMAN REVIEW",
  "VISUAL + PUBLICATION REGRESSION": "PENDING HUMAN REVIEW",
});

export const AUTHORIZATION = Object.freeze({
  machinePassGrantsHumanAcceptance: false,
  humanAccepted: false,
  phase6Complete: false,
  phase7Authorized: false,
  mainMerged: false,
});

const LEGACY_DEPLOYMENT_CHECKS = Object.freeze({
  exactGitBranchMainAuthority: true,
  signedSuccessfulDeploymentBindsExactHead: true,
  allDeployableFilesComparedWhereCloudflarePermits: true,
  branchImmutableLocalByteParity: true,
  successfulHttpOutcomes: true,
  real404StatusAndByteParity: true,
  requiredHeadersAndCachePolicies: true,
  canonicalBehavior: true,
  productionMainUnchangedAndPhase6Unmerged: true,
});

const R1_DEPLOYMENT_CHECKS = Object.freeze({
  exactR1BranchParentAndFrozenMain: true,
  zeroProductionSourceDiff: true,
  signedSuccessfulDeploymentBindsExactHead: true,
  immutableLocalByteParity: true,
  branchLocalByteParity: true,
  real404HeadersCanonicalAndTenRoutes: true,
});

const AUTHORITY_PROFILES = Object.freeze({
  phase6: Object.freeze({
    id: "phase6",
    packageSchema: PACKAGE_SCHEMA,
    detachedSchema: DETACHED_SCHEMA,
    auditSchema: AUDIT_SCHEMA,
    branch: REQUIRED_BRANCH,
    parent: ACCEPTED_PHASE5B_SHA,
    parentField: "acceptedBase",
    ancestorField: "acceptedBaseAncestor",
    branchUrl: REQUIRED_BRANCH_URL,
    archiveFilename: REQUIRED_ARCHIVE_FILENAME,
    deploymentSchema: DEPLOYMENT_VERIFICATION_SCHEMA,
    deploymentChecks: LEGACY_DEPLOYMENT_CHECKS,
    title: "Phase 6 global-hardening",
  }),
  "phase6-r1": Object.freeze({
    id: "phase6-r1",
    packageSchema: R1_PACKAGE_SCHEMA,
    detachedSchema: R1_DETACHED_SCHEMA,
    auditSchema: R1_AUDIT_SCHEMA,
    branch: R1_REQUIRED_BRANCH,
    parent: R1_REQUIRED_PARENT,
    parentField: "exactParent",
    ancestorField: "exactParentAncestor",
    branchUrl: R1_REQUIRED_BRANCH_URL,
    archiveFilename: R1_REQUIRED_ARCHIVE_FILENAME,
    deploymentSchema: R1_DEPLOYMENT_VERIFICATION_SCHEMA,
    deploymentChecks: R1_DEPLOYMENT_CHECKS,
    title: "Phase 6-R1 validation closure",
  }),
});

export function authorityProfileById(id = "phase6") {
  const profile = AUTHORITY_PROFILES[id];
  if (!profile) throw new Error(`--authority-profile must be phase6 or phase6-r1, received ${id ?? "missing"}`);
  return profile;
}

const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const CLOUDFLARE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALLOWED_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".mp4"]);
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const VIDEO_EXTENSIONS = new Set([".mp4"]);
const FORBIDDEN_ENTRY = /(?:^|\/)(?:raw(?:[-_ ]?frames?)?|frames?|caches?|browser-cache|traces?|heap-dumps?|profiles?|private|secrets?|credentials?|candidates?|rejected|quarantine|temp|tmp|__pycache__|node_modules|\.git)(?:\/|$)|(?:^|\/)\.(?:env|ds_store)(?:\.|$)|\.(?:zip|7z|rar|tar|tgz|gz|bz2|xz|webm|blend\d*|exr|tiff?|mov|mkv|avi|heapsnapshot|trace|pem|key|p12|pfx|log|map)$/i;
const PRIVATE_OR_SECRET_TEXT = /(?:(?:^|[\s"'=:(`\[])[a-z]:[\\/]|(?:^|[\s"'=:(`\[])\/(?:users|home|tmp|private|var\/folders)\/[^/\s]+(?:\/|\b)|(?:^|[^a-z])onedrive(?:[^a-z]|$)|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;

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

function exactJson(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) throw new Error(`${label} differs`);
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

function sectionFor(relativePath) {
  safeRelativePath(relativePath, "package entry");
  return relativePath.split("/", 1)[0];
}

export function assertAllowedEntry(relativePath) {
  safeRelativePath(relativePath, "package entry");
  if (relativePath === IN_ARCHIVE_MANIFEST) return true;
  if (FORBIDDEN_ENTRY.test(relativePath)) throw new Error(`forbidden raw/cache/archive/private payload: ${relativePath}`);
  if (!TOPOLOGY_SECTIONS.includes(sectionFor(relativePath))) throw new Error(`entry is outside the Phase 6 review topology: ${relativePath}`);
  if (!ALLOWED_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())) throw new Error(`unsupported review payload: ${relativePath}`);
  return true;
}

function semanticJsonText(value) {
  const values = [];
  const visit = (node, key = "") => {
    if (typeof node === "string") {
      values.push(node);
      if (key) values.push(`${key}: ${node}`);
    } else if (Array.isArray(node)) node.forEach((item) => visit(item, key));
    else if (node && typeof node === "object") Object.entries(node).forEach(([childKey, item]) => visit(item, childKey));
    else if (key && node !== null && node !== undefined) values.push(`${key}: ${node}`);
  };
  visit(value);
  return values.join("\n");
}

export function assertNoPrivateText(bytes, relativePath) {
  if (PRIVATE_OR_SECRET_TEXT.test(relativePath)) throw new Error(`privacy/secrets scan failed in path: ${relativePath}`);
  const extension = path.posix.extname(relativePath).toLowerCase();
  const data = Buffer.from(bytes);
  const isText = relativePath === IN_ARCHIVE_MANIFEST || TEXT_EXTENSIONS.has(extension);
  const text = isText ? data.toString("utf8") : (data.toString("latin1").match(/[\x20-\x7e]{24,}/g) ?? []).join("\n");
  if (PRIVATE_OR_SECRET_TEXT.test(text)) throw new Error(`privacy/secrets scan failed in payload: ${relativePath}`);
  if (extension === ".json" || relativePath === IN_ARCHIVE_MANIFEST) {
    let document;
    try { document = JSON.parse(text); } catch { throw new Error(`invalid JSON payload: ${relativePath}`); }
    if (PRIVATE_OR_SECRET_TEXT.test(semanticJsonText(document))) throw new Error(`privacy/secrets semantic scan failed: ${relativePath}`);
  } else if (TEXT_EXTENSIONS.has(extension) && text.includes("\u0000")) throw new Error(`text payload contains NUL bytes: ${relativePath}`);
  return true;
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function rebuildStoredZip(entries) {
  const normalized = [...entries.entries()]
    .map(([entryPath, data]) => ({ path: entryPath, data: Buffer.from(data) }))
    .sort((left, right) => lexicalCompare(left.path, right.path));
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const date = (1 << 5) | 1;
  for (const entry of normalized) {
    const name = Buffer.from(entry.path, "utf8");
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, entry.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(normalized.length, 8);
  end.writeUInt16LE(normalized.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function parseStoredZip(input, maximumBytes = MAX_ARCHIVE_BYTES) {
  const bytes = Buffer.from(input);
  if (bytes.length < 22 || bytes.length > maximumBytes) throw new Error("ZIP size boundary failed");
  const endOffset = bytes.length - 22;
  if (bytes.readUInt32LE(endOffset) !== 0x06054b50 || bytes.readUInt16LE(endOffset + 20) !== 0) throw new Error("canonical EOCD missing or commented");
  const disk = bytes.readUInt16LE(endOffset + 4);
  const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const diskEntries = bytes.readUInt16LE(endOffset + 8);
  const entriesCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (!entriesCount || disk || centralDisk || diskEntries !== entriesCount || centralOffset + centralSize !== endOffset) throw new Error("multi-disk or malformed central directory");
  const entries = new Map();
  let cursor = centralOffset;
  let expectedLocalOffset = 0;
  let previous = null;
  for (let index = 0; index < entriesCount; index += 1) {
    if (cursor + 46 > endOffset || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("central directory entry missing");
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const time = bytes.readUInt16LE(cursor + 12);
    const date = bytes.readUInt16LE(cursor + 14);
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressed = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const startDisk = bytes.readUInt16LE(cursor + 34);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    if (!nameLength || flags !== 0x0800 || method !== 0 || time !== 0 || date !== ((1 << 5) | 1) || compressed !== size || extraLength || commentLength || startDisk) throw new Error("ZIP entry is not canonical stored UTF-8");
    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > endOffset) throw new Error("central filename is truncated");
    const entryPath = bytes.subarray(cursor + 46, nameEnd).toString("utf8");
    safeRelativePath(entryPath, "ZIP entry");
    assertAllowedEntry(entryPath);
    if (entries.has(entryPath) || (previous !== null && lexicalCompare(previous, entryPath) >= 0)) throw new Error("ZIP paths are duplicate or not canonical lexical order");
    if (localOffset !== expectedLocalOffset || localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("local entry offset differs");
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localTime = bytes.readUInt16LE(localOffset + 10);
    const localDate = bytes.readUInt16LE(localOffset + 12);
    const localCrc = bytes.readUInt32LE(localOffset + 14);
    const localCompressed = bytes.readUInt32LE(localOffset + 18);
    const localSize = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    if (localFlags !== flags || localMethod !== method || localTime !== time || localDate !== date || localCrc !== checksum || localCompressed !== compressed || localSize !== size || localNameLength !== nameLength || localExtraLength) throw new Error("local and central ZIP metadata differ");
    const localNameEnd = localOffset + 30 + localNameLength;
    if (localNameEnd > centralOffset) throw new Error("local filename is truncated");
    const localName = bytes.subarray(localOffset + 30, localNameEnd).toString("utf8");
    if (localName !== entryPath) throw new Error("local and central ZIP paths differ");
    const dataEnd = localNameEnd + size;
    if (dataEnd > centralOffset) throw new Error("ZIP payload is truncated");
    const data = bytes.subarray(localNameEnd, dataEnd);
    if (crc32(data) !== checksum) throw new Error(`CRC rejection for ${entryPath}`);
    entries.set(entryPath, Buffer.from(data));
    previous = entryPath;
    expectedLocalOffset = dataEnd;
    cursor = nameEnd;
  }
  if (cursor !== endOffset || expectedLocalOffset !== centralOffset) throw new Error("ZIP directory/local surfaces are not contiguous");
  if (!rebuildStoredZip(entries).equals(bytes)) throw new Error("ZIP is not the unique canonical stored encoding");
  return { entries, canonical: true, crcValidated: true };
}

function parseJson(bytes, label) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error(`invalid JSON payload: ${label}`); }
}

function aggregateHumanStatuses(statuses) {
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.every((status) => status === "PASS")) return "PASS";
  return "PENDING HUMAN REVIEW";
}

function validateFailureReferences(record, failedChecks, label) {
  if (!Array.isArray(record.failureReferences)) throw new Error(`${label} failureReferences must be an array`);
  for (const reference of record.failureReferences) {
    const hasLocation = [reference?.timestamp, reference?.frame].some((value) => (typeof value === "string" && value.trim()) || Number.isFinite(value)) || Number.isFinite(reference?.timestampSeconds);
    if (!reference || typeof reference !== "object" || Array.isArray(reference) || typeof reference.check !== "string" || !reference.check.trim() || !hasLocation) {
      throw new Error(`${label} failure reference requires a check and timestamp or frame`);
    }
  }
  if (record.status === "FAIL" && !record.failureReferences.length) throw new Error(`${label} FAIL requires a timestamp or frame reference`);
  if (record.status !== "FAIL" && record.failureReferences.length) throw new Error(`${label} non-FAIL cannot contain failure references`);
  for (const check of failedChecks) {
    if (!record.failureReferences.some((reference) => reference.check === check)) throw new Error(`${label} false check ${check} lacks a matching failure reference`);
  }
}

function validateR1HumanLedgerSemantics(ledger) {
  if (typeof ledger.createdAt !== "string" || !Number.isFinite(Date.parse(ledger.createdAt)) || new Date(ledger.createdAt).toISOString() !== ledger.createdAt) {
    throw new Error("R1 archive human-evidence ledger createdAt is not canonical");
  }
  exactJson(ledger.policy, { filePresenceIsPass: false, machineRecordingSubstitutionAllowed: false, failRequiresTimestampOrFrame: true, allFourFilesRequiredBeforePackaging: true }, "R1 archive human-evidence ledger policy");
  for (const record of ledger.entries) {
    const label = `R1 archive human recording ${record?.filename ?? "unknown"}`;
    if (!R1_HUMAN_STATUSES.includes(record?.status)
      || record.evidenceClass !== "PHYSICAL HUMAN RECORDING"
      || typeof record.device !== "string" || !record.device.trim()
      || typeof record.os !== "string" || !record.os.trim()
      || !Object.hasOwn(record, "browserVersion") || (record.browserVersion !== null && (typeof record.browserVersion !== "string" || !record.browserVersion.trim()))
      || (record.browser !== null && record.browser !== undefined && (typeof record.browser !== "string" || !record.browser.trim()))
      || !Array.isArray(record.testSteps) || !record.testSteps.length || record.testSteps.some((step) => typeof step !== "string" || !step.trim())
      || !Array.isArray(record.observations) || !record.observations.length || record.observations.some((observation) => (typeof observation !== "string" || !observation.trim()) && (!observation || typeof observation !== "object" || Array.isArray(observation)))
      || typeof record.observedResult !== "string" || !record.observedResult.trim()) {
      throw new Error(`${label} review metadata is incomplete`);
    }
    if (record.filename.startsWith("iphone-safari-") && !/safari/i.test(record.browser ?? "")) throw new Error(`${label} browser must identify Safari`);
    if (record.filename === "chrome-200-percent.mp4" && !/chrome/i.test(record.browser ?? "")) throw new Error(`${label} browser must identify Chrome`);
    let failedChecks = [];
    const requiredChecks = R1_DEVICE_REVIEW_CHECKS[record.filename];
    const hasChecks = record.checks && typeof record.checks === "object" && !Array.isArray(record.checks);
    if (requiredChecks && (record.status !== "PENDING HUMAN REVIEW" || hasChecks)) {
      if (!hasChecks || stableJson(Object.keys(record.checks).sort(lexicalCompare)) !== stableJson([...requiredChecks].sort(lexicalCompare))) throw new Error(`${label} physical checks differ`);
      const results = requiredChecks.map((check) => record.checks[check]);
      if (results.some((value) => typeof value !== "boolean" && !(record.status === "PENDING HUMAN REVIEW" && value === null))) throw new Error(`${label} physical checks are incomplete`);
      if (record.status === "PASS" && results.some((value) => value !== true)) throw new Error(`${label} PASS contains a failed check`);
      if (record.status === "FAIL" && results.every((value) => value !== false)) throw new Error(`${label} FAIL contains no failed check`);
      if (record.status !== "FAIL" && results.some((value) => value === false)) throw new Error(`${label} contains a false check without FAIL status`);
      failedChecks = requiredChecks.filter((check) => record.checks[check] === false);
    }
    if (record.filename === "chrome-200-percent.mp4") {
      const hasZoomReview = ["genuineBrowserZoom", "zoomPercent", "proxy", "routeOutcomes"].some((field) => Object.hasOwn(record, field));
      if (record.status !== "PENDING HUMAN REVIEW" || hasZoomReview) {
        if (record.genuineBrowserZoom !== true || record.zoomPercent !== 200 || record.proxy !== false || !Array.isArray(record.routeOutcomes) || record.routeOutcomes.length !== R1_ZOOM_ROUTES.length) throw new Error(`${label} genuine 200% review is incomplete`);
        const routes = new Set();
        for (const outcome of record.routeOutcomes) {
          if (!R1_ZOOM_ROUTES.includes(outcome?.route) || routes.has(outcome.route) || !R1_HUMAN_STATUSES.includes(outcome.status)
            || !outcome.checks || stableJson(Object.keys(outcome.checks).sort(lexicalCompare)) !== stableJson([...R1_ZOOM_ROUTE_CHECKS].sort(lexicalCompare))
            || R1_ZOOM_ROUTE_CHECKS.some((check) => typeof outcome.checks[check] !== "boolean")) throw new Error(`${label} genuine 200% route review differs`);
          routes.add(outcome.route);
          const routeFailures = R1_ZOOM_ROUTE_CHECKS.filter((check) => outcome.checks[check] === false);
          if (outcome.status === "PASS" && routeFailures.length) throw new Error(`${label} route PASS contains a failed check`);
          if (outcome.status === "FAIL" && !routeFailures.length) throw new Error(`${label} route FAIL contains no failed check`);
          if (outcome.status !== "FAIL" && routeFailures.length) throw new Error(`${label} route contains a false check without FAIL status`);
          validateFailureReferences(outcome, routeFailures, `${label} route ${outcome.route}`);
        }
        if (stableJson([...routes].sort(lexicalCompare)) !== stableJson([...R1_ZOOM_ROUTES].sort(lexicalCompare))) throw new Error(`${label} genuine 200% route inventory differs`);
        if (record.status !== aggregateHumanStatuses(record.routeOutcomes.map(({ status }) => status))) throw new Error(`${label} status differs from route outcomes`);
      }
      failedChecks = [];
    }
    validateFailureReferences(record, failedChecks, label);
  }
  const expectedStatus = aggregateHumanStatuses(ledger.entries.map(({ status }) => status));
  if (ledger.status !== expectedStatus) throw new Error(`R1 archive human-evidence ledger status must be ${expectedStatus}`);
}

export function validateR1HumanEvidenceEntries(entries) {
  const ledgerBytes = entries.get(R1_HUMAN_LEDGER_PATH);
  if (!ledgerBytes) throw new Error(`R1 archive requires the human-evidence ledger: ${R1_HUMAN_LEDGER_PATH}`);
  const wrapper = parseJson(ledgerBytes, R1_HUMAN_LEDGER_PATH);
  const ledger = wrapper?.payload;
  const permittedStatuses = new Set(R1_HUMAN_STATUSES);
  if (wrapper?.schema !== "quantum-hub.phase-6.final-evidence-assembly.v1.distilled-json"
    || wrapper.role !== "physical-device-result"
    || wrapper.selection !== null
    || !permittedStatuses.has(wrapper.status)
    || !wrapper.source || !HASH64.test(wrapper.source.sha256 ?? "")
    || ledger?.schema !== R1_HUMAN_EVIDENCE_SCHEMA
    || ledger.evidenceClass !== "HUMAN DEVICE EVIDENCE"
    || ledger.rootExists !== true
    || ledger.status !== wrapper.status
    || !Array.isArray(ledger.requiredFilenames)
    || !Array.isArray(ledger.missingFilenames) || ledger.missingFilenames.length
    || !Array.isArray(ledger.entries)) {
    throw new Error("R1 archive human-evidence ledger authority differs");
  }
  const expectedFilenames = [...R1_REQUIRED_HUMAN_RECORDINGS].sort(lexicalCompare);
  if (stableJson([...ledger.requiredFilenames].sort(lexicalCompare)) !== stableJson(expectedFilenames)
    || stableJson(ledger.entries.map(({ filename }) => filename).sort(lexicalCompare)) !== stableJson(expectedFilenames)) {
    throw new Error("R1 archive human-evidence ledger omits or duplicates a required recording");
  }
  validateR1HumanLedgerSemantics(ledger);
  const physicalVideoPaths = [...entries.keys()]
    .filter((relativePath) => relativePath.startsWith("11-physical-device/") && path.posix.extname(relativePath).toLowerCase() === ".mp4")
    .sort(lexicalCompare);
  const expectedPaths = expectedFilenames.map((filename) => `11-physical-device/recordings/${filename}`).sort(lexicalCompare);
  if (stableJson(physicalVideoPaths) !== stableJson(expectedPaths)) throw new Error("R1 archive physical recording inventory differs");
  const recordings = ledger.entries.map((record) => {
    const recordingPath = `11-physical-device/recordings/${record.filename}`;
    const bytes = entries.get(recordingPath);
    if (!bytes || record.evidenceClass !== "PHYSICAL HUMAN RECORDING" || !permittedStatuses.has(record.status)
      || !Number.isSafeInteger(record.byteSize) || record.byteSize <= 0 || record.byteSize !== bytes.length
      || !HASH64.test(record.sha256 ?? "") || record.sha256 !== sha256(bytes)) {
      throw new Error(`R1 archive human recording is not hash/size/status bound: ${record.filename}`);
    }
    if (bytes.length < 12 || bytes.subarray(4, 8).toString("ascii") !== "ftyp") {
      throw new Error(`R1 archive human recording MP4 container signature differs: ${record.filename}`);
    }
    return { filename: record.filename, path: recordingPath, status: record.status, byteSize: bytes.length, sha256: record.sha256 };
  }).sort((left, right) => lexicalCompare(left.filename, right.filename));
  return {
    status: ledger.status,
    ledger: { path: R1_HUMAN_LEDGER_PATH, byteSize: ledgerBytes.length, sha256: sha256(ledgerBytes), schema: R1_HUMAN_EVIDENCE_SCHEMA },
    recordings,
  };
}

function kindFor(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return "document";
}

function normalizePreviewUrl(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be an absolute HTTPS URL`); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.pathname !== "/" || !parsed.hostname) {
    throw new Error(`${label} must be a credential-free HTTPS origin root without port, query, or fragment`);
  }
  return parsed.href;
}

export function validateExpected(input) {
  const expected = { ...input };
  const profile = authorityProfileById(expected.authorityProfile ?? "phase6");
  expected.authorityProfile = profile.id;
  if (!HASH40.test(expected.expectedHead ?? "")) throw new Error("--expected-head must be a 40-character lowercase Git SHA");
  if ([profile.parent, FROZEN_MAIN_SHA].includes(expected.expectedHead)) throw new Error(`--expected-head must identify the new ${profile.title} final commit`);
  if (expected.branch !== profile.branch) throw new Error(`--branch must be exactly ${profile.branch}`);
  if (typeof expected.deploymentId !== "string" || !CLOUDFLARE_UUID.test(expected.deploymentId)) throw new Error("--deployment-id must be a lowercase Cloudflare deployment UUID");
  expected.immutableUrl = normalizePreviewUrl(expected.immutableUrl, "--immutable-url");
  expected.branchUrl = normalizePreviewUrl(expected.branchUrl, "--branch-url");
  const requiredImmutable = `https://${expected.deploymentId.slice(0, 8)}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`;
  if (expected.immutableUrl !== requiredImmutable) throw new Error(`--immutable-url must be exactly ${requiredImmutable}`);
  if (expected.branchUrl !== profile.branchUrl) throw new Error(`--branch-url must be exactly ${profile.branchUrl}`);
  return expected;
}

function expectedProvenance(expected) {
  const profile = authorityProfileById(expected.authorityProfile);
  return {
    ...(profile.id === "phase6-r1" ? { authorityProfile: profile.id } : {}),
    branch: expected.branch,
    expectedHead: expected.expectedHead,
    observedHead: expected.expectedHead,
    [profile.parentField]: profile.parent,
    expectedMain: FROZEN_MAIN_SHA,
    deployment: { id: expected.deploymentId, immutableUrl: expected.immutableUrl, branchUrl: expected.branchUrl },
  };
}

function validateTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`${label} is not a canonical ISO timestamp`);
}

function validateTopology(paths) {
  const counts = Object.fromEntries(TOPOLOGY_SECTIONS.map((section) => [section, 0]));
  for (const relativePath of paths) {
    assertAllowedEntry(relativePath);
    if (relativePath !== IN_ARCHIVE_MANIFEST) counts[sectionFor(relativePath)] += 1;
  }
  for (const section of TOPOLOGY_SECTIONS) if (!counts[section]) throw new Error(`Phase 6 package topology omits ${section}`);
  return counts;
}

function validateGitProvenance(entries, expected) {
  const profile = authorityProfileById(expected.authorityProfile);
  const relativePath = "00-provenance/git-provenance.json";
  const document = parseJson(entries.get(relativePath), relativePath);
  if (document.schema !== `${profile.packageSchema}.git-provenance` || document.status !== "PASS" || document.branch !== profile.branch || document.head !== expected.expectedHead || document.cleanTree !== true) throw new Error("Git provenance differs from expected authority");
  if (!Array.isArray(document.directParents) || document.directParents.length !== 1 || !HASH40.test(document.directParents[0])) throw new Error("Git provenance direct-parent ledger differs");
  if (document[profile.parentField] !== profile.parent || document[profile.ancestorField] !== true || document.headMergedIntoMain !== false) throw new Error("Git provenance required-parent ancestry differs");
  exactJson(document.localMain, { ref: "refs/heads/main", head: FROZEN_MAIN_SHA }, "Git provenance local main");
  exactJson(document.originMain, { ref: "refs/remotes/origin/main", head: FROZEN_MAIN_SHA }, "Git provenance origin/main");
  exactJson(document.liveMain, { ref: "refs/heads/main", head: FROZEN_MAIN_SHA }, "Git provenance live main");
  exactJson(document.upstream, { ref: `origin/${profile.branch}`, head: expected.expectedHead, liveHead: expected.expectedHead, parity: true }, "Git provenance upstream");
  exactJson(document.remote, { name: "origin", url: REQUIRED_REMOTE_URL, repository: REQUIRED_REPOSITORY }, "Git provenance origin");
  const actualReports = [...(document.trackedReports ?? [])].sort(lexicalCompare);
  const expectedReports = REPORT_SPECS.map(({ source }) => source).sort(lexicalCompare);
  exactJson(actualReports, expectedReports, "tracked Phase 6 report list");
  return document;
}

function validateDeploymentVerification(entries, expected) {
  const profile = authorityProfileById(expected.authorityProfile);
  const bytes = entries.get(DEPLOYMENT_VERIFICATION_PATH);
  if (!bytes) throw new Error(`archive omits required deployment authority: ${DEPLOYMENT_VERIFICATION_PATH}`);
  const document = parseJson(bytes, DEPLOYMENT_VERIFICATION_PATH);
  if (document.schema !== profile.deploymentSchema || document.status !== "PASS") throw new Error("deployment verification schema/status differs");
  exactJson(document.inputs, {
    expectedHead: expected.expectedHead,
    [profile.parentField]: profile.parent,
    expectedMain: FROZEN_MAIN_SHA,
    repository: REQUIRED_REPOSITORY,
    branch: profile.branch,
    deploymentId: expected.deploymentId,
    immutableUrl: expected.immutableUrl,
    branchUrl: expected.branchUrl,
    localDist: "dist",
  }, "deployment verification inputs");

  const repository = document.repository;
  const repositoryData = repository?.data;
  if (repository?.status !== "PASS" || !repositoryData || repositoryData.repository !== REQUIRED_REPOSITORY
    || repositoryData.branch !== profile.branch || repositoryData.head !== expected.expectedHead
    || repositoryData[profile.parentField] !== profile.parent || repositoryData.cleanTree !== true) {
    throw new Error("deployment verification repository authority differs");
  }
  const history = repositoryData.history;
  if (!Array.isArray(history) || history.length < 1) throw new Error(`deployment verification omits the ${profile.title} linear history`);
  for (let index = 0; index < history.length; index += 1) {
    const record = history[index];
    const requiredParent = index === 0 ? profile.parent : history[index - 1]?.commit;
    if (!HASH40.test(record?.commit ?? "") || !Array.isArray(record?.parents) || record.parents.length !== 1
      || record.parents[0] !== requiredParent || typeof record.subject !== "string" || !record.subject) {
      throw new Error(`deployment verification history entry ${index + 1} is not an exact linear descendant of the required parent`);
    }
  }
  if (history.at(-1).commit !== expected.expectedHead || repositoryData.directParent !== history.at(-1).parents[0]) {
    throw new Error("deployment verification history does not terminate at the expected Phase 6 HEAD");
  }
  if (profile.id === "phase6-r1") {
    exactJson(repositoryData.main, { local: FROZEN_MAIN_SHA, upstream: FROZEN_MAIN_SHA, live: FROZEN_MAIN_SHA, modifiedOrMerged: false }, "deployment verification R1 main");
    exactJson(repositoryData.upstream, { ref: `origin/${profile.branch}`, head: expected.expectedHead, live: expected.expectedHead, parity: true }, "deployment verification R1 upstream");
    exactJson(repositoryData.productionSourceDiff, [], "deployment verification R1 production-source diff");
  } else {
    exactJson(repositoryData.main, { branch: "main", headSha: FROZEN_MAIN_SHA, frozenAt: FROZEN_MAIN_SHA, containsPhase6Head: false }, "deployment verification local main");
    exactJson(repositoryData.upstream, { ref: `origin/${profile.branch}`, headSha: expected.expectedHead, parity: true }, "deployment verification upstream");
    exactJson(repositoryData.liveRemote, {
      branchRef: `refs/heads/${profile.branch}`,
      branchHeadSha: expected.expectedHead,
      mainRef: "refs/heads/main",
      mainHeadSha: FROZEN_MAIN_SHA,
      parity: true,
    }, "deployment verification live remote");
  }

  const deploymentData = document.deployment?.data;
  if (document.deployment?.status !== "PASS" || !deploymentData || deploymentData.status !== "PASS"
    || deploymentData.authoritySource !== "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK"
    || deploymentData.deploymentId !== expected.deploymentId || deploymentData.immutableUrl !== expected.immutableUrl
    || deploymentData.branchUrl !== expected.branchUrl || deploymentData.branch !== profile.branch
    || deploymentData.commitHash !== expected.expectedHead || deploymentData.environment !== "preview") {
    throw new Error("deployment verification signed Cloudflare authority differs");
  }
  if (typeof deploymentData.completedAt !== "string" || !Number.isFinite(Date.parse(deploymentData.completedAt))) {
    throw new Error("deployment verification completedAt is not a valid timestamp");
  }
  if (profile.id === "phase6-r1" && deploymentData.appSlug !== "cloudflare-workers-and-pages") throw new Error("deployment verification R1 Cloudflare app authority differs");
  if (document.dist?.status !== "PASS" || document.origins?.immutable?.status !== "PASS" || document.origins?.branch?.status !== "PASS") {
    throw new Error("deployment verification dist/origin parity did not pass");
  }
  if (document.origins.immutable.data?.origin !== expected.immutableUrl || document.origins.immutable.data?.status !== "PASS"
    || document.origins.branch.data?.origin !== expected.branchUrl || document.origins.branch.data?.status !== "PASS") {
    throw new Error("deployment verification origin identities differ");
  }
  exactJson(document.checks, profile.deploymentChecks, "deployment verification checks");
  exactJson(document.failures, [], "deployment verification failures");
  return {
    document,
    binding: { path: DEPLOYMENT_VERIFICATION_PATH, schema: profile.deploymentSchema, status: "PASS", byteSize: bytes.length, sha256: sha256(bytes) },
  };
}

function assertGatePolicy(document, label) {
  exactJson(document.humanReviewGates, HUMAN_REVIEW_GATES, `${label} human-review gates`);
  exactJson(document.authorization, AUTHORIZATION, `${label} authorization`);
}

export function auditBuffers({ archiveBytes: archiveInput, detachedBytes: detachedInput, archiveFilename, expected: expectedInput, maximumBytes = MAX_ARCHIVE_BYTES }) {
  const expected = validateExpected(expectedInput);
  const profile = authorityProfileById(expected.authorityProfile);
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || maximumBytes > MAX_ARCHIVE_BYTES) throw new Error("audit maximum-byte boundary is invalid");
  if (archiveFilename !== profile.archiveFilename) throw new Error(`archive filename must be exactly ${profile.archiveFilename}`);
  const archiveBytes = Buffer.from(archiveInput);
  const detachedBytes = Buffer.from(detachedInput);
  const parsed = parseStoredZip(archiveBytes, maximumBytes);
  const { entries } = parsed;
  const manifestBytes = entries.get(IN_ARCHIVE_MANIFEST);
  if (!manifestBytes) throw new Error("archive omits MANIFEST.json");
  for (const [relativePath, bytes] of entries) assertNoPrivateText(bytes, relativePath);
  assertNoPrivateText(detachedBytes, "detached-manifest.json");
  const manifest = parseJson(manifestBytes, IN_ARCHIVE_MANIFEST);
  const detached = parseJson(detachedBytes, "detached-manifest.json");
  if (manifest.schema !== profile.packageSchema || manifest.status !== "PASS" || manifest.privacyAndSecrets !== "PASS") throw new Error("in-archive manifest authority differs");
  if (detached.schema !== profile.detachedSchema || detached.status !== "PASS") throw new Error("detached manifest authority differs");
  validateTimestamp(manifest.generatedAt, "manifest generatedAt");
  if (detached.generatedAt !== manifest.generatedAt) throw new Error("detached/embedded generation timestamps differ");
  exactJson(manifest.provenance, expectedProvenance(expected), "manifest provenance");
  exactJson(detached.provenance, manifest.provenance, "detached provenance");
  exactJson(manifest.topology, TOPOLOGY_SECTIONS, "manifest topology");
  assertGatePolicy(manifest, "manifest");

  if (detached.archive?.filename !== archiveFilename || detached.archive?.byteSize !== archiveBytes.length || detached.archive?.sha256 !== sha256(archiveBytes) || detached.archive?.entries !== entries.size || detached.archive?.canonicalUniqueStoredZip !== true) throw new Error("detached archive binding differs");
  if (detached.inArchiveManifest?.path !== IN_ARCHIVE_MANIFEST || detached.inArchiveManifest?.byteSize !== manifestBytes.length || detached.inArchiveManifest?.sha256 !== sha256(manifestBytes) || detached.inArchiveManifest?.schema !== profile.packageSchema) throw new Error("detached in-archive manifest binding differs");

  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("manifest omits its file ledger");
  const actualPaths = [...entries.keys()].filter((relativePath) => relativePath !== IN_ARCHIVE_MANIFEST).sort(lexicalCompare);
  const ledgerPaths = [];
  const payloadHashes = new Map();
  let payloadBytes = 0;
  let previous = null;
  for (const record of manifest.files) {
    const relativePath = record?.path;
    assertAllowedEntry(relativePath);
    if (relativePath === IN_ARCHIVE_MANIFEST || (previous !== null && lexicalCompare(previous, relativePath) >= 0)) throw new Error("manifest file ledger paths are duplicate or not canonical order");
    const bytes = entries.get(relativePath);
    if (!bytes || !Number.isSafeInteger(record.byteSize) || record.byteSize !== bytes.length || !HASH64.test(record.sha256 ?? "") || record.sha256 !== sha256(bytes)) throw new Error(`manifest hash/size differs: ${relativePath}`);
    if (record.kind !== kindFor(relativePath) || record.section !== sectionFor(relativePath)) throw new Error(`manifest role differs: ${relativePath}`);
    if (payloadHashes.has(record.sha256)) throw new Error(`duplicate package payload: ${payloadHashes.get(record.sha256)} and ${relativePath}`);
    payloadHashes.set(record.sha256, relativePath);
    ledgerPaths.push(relativePath);
    payloadBytes += bytes.length;
    previous = relativePath;
  }
  exactJson(ledgerPaths, actualPaths, "manifest/archive file paths");
  const counts = validateTopology(actualPaths);
  const expectedInventory = {
    payloadFiles: actualPaths.length,
    payloadBytes,
    archiveEntries: entries.size,
    sections: counts,
    duplicatePaths: 0,
    duplicatePayloads: 0,
    rawFrames: 0,
    caches: 0,
    nestedArchives: 0,
    maximumArchiveBytes: maximumBytes,
  };
  exactJson(manifest.inventory, expectedInventory, "manifest inventory");

  for (const { archive } of REPORT_SPECS) if (!entries.has(archive)) throw new Error(`archive omits tracked Phase 6 report: ${archive}`);
  const humanEvidence = profile.id === "phase6-r1" ? validateR1HumanEvidenceEntries(entries) : null;
  if (humanEvidence) {
    exactJson(manifest.humanEvidence, humanEvidence, "manifest R1 human-evidence binding");
    exactJson(detached.humanEvidence, humanEvidence, "detached R1 human-evidence binding");
  }
  const deploymentVerification = validateDeploymentVerification(entries, expected);
  exactJson(manifest.deploymentVerification, deploymentVerification.binding, "manifest deployment-verification binding");
  exactJson(detached.deploymentVerification, deploymentVerification.binding, "detached deployment-verification binding");
  const git = validateGitProvenance(entries, expected);
  if (git.directParents[0] !== deploymentVerification.document.repository.data.directParent) throw new Error("Git/deployment direct-parent authorities differ");
  const metadataPath = "13-package/package-metadata.json";
  const metadata = parseJson(entries.get(metadataPath), metadataPath);
  if (metadata.schema !== `${profile.packageSchema}.package-metadata` || metadata.status !== "PASS" || metadata.generatedAt !== manifest.generatedAt) throw new Error("package metadata authority differs");
  exactJson(metadata.provenance, manifest.provenance, "package metadata provenance");
  exactJson(metadata.deploymentVerification, deploymentVerification.binding, "package metadata deployment-verification binding");
  if (humanEvidence) exactJson(metadata.humanEvidence, humanEvidence, "package metadata R1 human-evidence binding");
  assertGatePolicy(metadata, "package metadata");
  const readme = entries.get("13-package/README.md")?.toString("utf8") ?? "";
  if (!/All six Phase 6 gates remain \*\*PENDING HUMAN REVIEW\*\*/.test(readme) || !/does not accept Phase 6, authorize Phase 7, or merge main/.test(readme)) throw new Error("package README review policy differs");

  return {
    manifest,
    detached,
    entries,
    git,
    deploymentVerification,
    topology: counts,
    canonical: parsed.canonical,
    crcValidated: parsed.crcValidated,
    privacyAndSecrets: "PASS",
    reviewPolicy: "PASS",
  };
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = { archive: null, manifest: null, auditOutput: null, expectedHead: null, branch: null, deploymentId: null, immutableUrl: null, branchUrl: null, expectedParentProcessId: null, authorityProfile: "phase6", selfTest: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--archive") options.archive = path.resolve(next());
    else if (argument === "--manifest") options.manifest = path.resolve(next());
    else if (argument === "--audit-output") options.auditOutput = path.resolve(next());
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (["--branch", "--expected-branch"].includes(argument)) options.branch = next();
    else if (["--deployment-id", "--expected-deployment-id", "--cloudflare-deployment-id"].includes(argument)) options.deploymentId = next().toLowerCase();
    else if (["--immutable-url", "--observed-immutable-url"].includes(argument)) options.immutableUrl = next();
    else if (["--branch-url", "--observed-branch-url"].includes(argument)) options.branchUrl = next();
    else if (argument === "--expected-parent-process-id") options.expectedParentProcessId = Number(next());
    else if (argument === "--authority-profile") options.authorityProfile = next();
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertExternalPath(candidate, label) {
  if (typeof candidate !== "string" || !candidate) throw new Error(`${label} is required`);
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root || isWithin(ROOT, resolved)) throw new Error(`${label} must be outside the repository and filesystem root`);
  return resolved;
}

async function checkedInputFile(candidate, label) {
  const resolved = assertExternalPath(candidate, label);
  const canonical = await realpath(resolved);
  const info = await lstat(canonical);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  return canonical;
}

export async function auditArchive(input) {
  const expected = validateExpected(input);
  const profile = authorityProfileById(expected.authorityProfile);
  const archive = await checkedInputFile(input.archive, "--archive");
  const manifestPath = await checkedInputFile(input.manifest, "--manifest");
  const auditOutput = assertExternalPath(input.auditOutput, "--audit-output");
  const archiveStem = path.basename(archive, path.extname(archive));
  if (path.extname(archive).toLowerCase() !== ".zip" || path.dirname(archive) !== path.dirname(manifestPath) || path.basename(manifestPath) !== `${archiveStem}-manifest.json` || path.dirname(archive) !== path.dirname(auditOutput) || path.basename(auditOutput) !== `${archiveStem}-audit.json`) throw new Error("archive, detached manifest, and audit sibling names/locations differ");
  if (!Number.isSafeInteger(input.expectedParentProcessId) || input.expectedParentProcessId <= 0 || process.ppid !== input.expectedParentProcessId || process.pid === input.expectedParentProcessId) throw new Error("auditor is not the expected separate child process");
  try { await access(auditOutput); throw new Error(`audit output already exists: ${auditOutput}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const [archiveBytes, detachedBytes] = await Promise.all([readFile(archive), readFile(manifestPath)]);
  const result = auditBuffers({ archiveBytes, detachedBytes, archiveFilename: path.basename(archive), expected });
  const generatedAt = new Date().toISOString();
  const report = {
    schema: profile.auditSchema,
    status: "PASS",
    generatedAt,
    auditor: { processId: process.pid, parentProcessId: process.ppid, separateProcess: true },
    archive: { filename: path.basename(archive), byteSize: archiveBytes.length, sha256: sha256(archiveBytes), entries: result.entries.size, canonicalUniqueStoredZip: true, crcValidated: true },
    detachedManifest: { filename: path.basename(manifestPath), byteSize: detachedBytes.length, sha256: sha256(detachedBytes), schema: profile.detachedSchema },
    inArchiveManifest: { path: IN_ARCHIVE_MANIFEST, byteSize: result.entries.get(IN_ARCHIVE_MANIFEST).length, sha256: sha256(result.entries.get(IN_ARCHIVE_MANIFEST)), schema: profile.packageSchema },
    deploymentVerification: result.deploymentVerification.binding,
    provenance: result.manifest.provenance,
    topology: { sections: [...TOPOLOGY_SECTIONS], counts: result.topology },
    checks: {
      canonicalStoredZip: "PASS",
      crc32: "PASS",
      manifestHashesAndSizes: "PASS",
      duplicatePathsAndPayloads: "PASS",
      topology: "PASS",
      privacyAndSecrets: "PASS",
      rawFramesCachesAndNestedArchives: "PASS",
      detachedBindings: "PASS",
      deploymentVerificationAuthority: "PASS",
      [profile.id === "phase6-r1" ? "exactBranchParentAndFrozenMain" : "exactBranchBaseAndFrozenMain"]: "PASS",
      cloudflarePreviewPolicy: "PASS",
      reviewPolicy: "PASS",
    },
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
  };
  const bytes = Buffer.from(stableJson(report));
  assertNoPrivateText(bytes, "independent-audit.json");
  await mkdir(path.dirname(auditOutput), { recursive: true });
  const temporary = `${auditOutput}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try { await rename(temporary, auditOutput); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return { report, bytes, auditOutput };
}

export function selfTest(authorityProfile = "phase6") {
  const profile = authorityProfileById(authorityProfile);
  const entries = new Map([
    [IN_ARCHIVE_MANIFEST, Buffer.from("{}\n")],
    ["13-package/fixture.json", Buffer.from("{\"fixture\":true}\n")],
  ]);
  const archive = rebuildStoredZip(entries);
  const parsed = parseStoredZip(archive);
  if (parsed.entries.size !== entries.size || !parsed.canonical || !parsed.crcValidated) throw new Error("canonical parser self-test failed");
  return { schema: `${profile.auditSchema}.self-test`, status: "PASS", authorityProfile: profile.id, canonicalParser: true, crcValidated: true, maximumArchiveBytes: MAX_ARCHIVE_BYTES };
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/audit-phase6-human-review-package.mjs \\",
    "    [--authority-profile phase6|phase6-r1] \\",
    "    --archive <external-zip> --manifest <detached-manifest> --audit-output <fresh-audit-json> \\",
    "    --expected-head <sha40> --branch <profile-exact-branch> --deployment-id <Cloudflare-UUID> \\",
    `    --immutable-url https://<UUID-prefix>.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/ \\`,
    "    --branch-url <profile-exact-alias> --expected-parent-process-id <pid>",
  ].join("\n"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.selfTest) { console.log(JSON.stringify(selfTest(options.authorityProfile), null, 2)); return; }
  const result = await auditArchive(options);
  const profile = authorityProfileById(options.authorityProfile);
  process.stdout.write(stableJson({
    schema: `${profile.auditSchema}.result`,
    status: result.report.status,
    archive: result.report.archive,
    detachedManifest: result.report.detachedManifest,
    audit: { filename: path.basename(result.auditOutput), byteSize: result.bytes.length, sha256: sha256(result.bytes) },
  }));
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
