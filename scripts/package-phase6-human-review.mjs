#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const SCRIPT = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
const AUDITOR = path.join(ROOT, "scripts", "audit-phase6-human-review-package.mjs");

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
const RESERVED_PACKAGE_PATHS = new Set([IN_ARCHIVE_MANIFEST, "13-package/README.md", "13-package/package-metadata.json"]);
const RESERVED_REPORT_PATHS = new Set(REPORT_SPECS.map(({ archive }) => archive));
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

function isWithin(parent, candidate) {
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

export function sectionFor(relativePath) {
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

function kindFor(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return "document";
}

export function validateTopology(paths) {
  const sections = new Set();
  for (const relativePath of paths) {
    assertAllowedEntry(relativePath);
    if (relativePath !== IN_ARCHIVE_MANIFEST) sections.add(sectionFor(relativePath));
  }
  for (const section of TOPOLOGY_SECTIONS) if (!sections.has(section)) throw new Error(`Phase 6 package topology omits ${section}`);
  return [...sections].sort(lexicalCompare);
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

export function createStoredZipBuffer(entries) {
  const normalized = entries
    .map((entry) => ({ path: safeRelativePath(entry.path, "ZIP entry"), data: Buffer.from(entry.data) }))
    .sort((left, right) => lexicalCompare(left.path, right.path));
  if (new Set(normalized.map((entry) => entry.path)).size !== normalized.length) throw new Error("ZIP entries must be unique");
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const date = (1 << 5) | 1;
  const time = 0;
  for (const entry of normalized) {
    const name = Buffer.from(entry.path, "utf8");
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
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
    central.writeUInt16LE(time, 12);
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
  if (normalized.length > 0xffff || offset > 0xffffffff) throw new Error("ZIP32 limits exceeded");
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

export function canonicalTimestamp(value, label = "timestamp") {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function normalizePreviewUrl(value, flag) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${flag} must be an absolute HTTPS URL`); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.pathname !== "/" || !parsed.hostname) {
    throw new Error(`${flag} must be a credential-free HTTPS origin root without port, query, or fragment`);
  }
  return parsed.href;
}

function expectedImmutableUrl(deploymentId) {
  return `https://${deploymentId.slice(0, 8)}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`;
}

function validateDeploymentCoordinates(input, profile = authorityProfileById(input?.authorityProfile)) {
  if (!CLOUDFLARE_UUID.test(input.deploymentId ?? "")) throw new Error("--deployment-id must be a lowercase Cloudflare deployment UUID");
  const immutableUrl = normalizePreviewUrl(input.immutableUrl, "--immutable-url");
  const branchUrl = normalizePreviewUrl(input.branchUrl, "--branch-url");
  const requiredImmutable = expectedImmutableUrl(input.deploymentId);
  if (immutableUrl !== requiredImmutable) throw new Error(`--immutable-url must be exactly ${requiredImmutable}`);
  if (branchUrl !== profile.branchUrl) throw new Error(`--branch-url must be exactly ${profile.branchUrl}`);
  return { id: input.deploymentId, immutableUrl, branchUrl };
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    evidenceRoot: null,
    output: null,
    expectedHead: null,
    branch: null,
    deploymentId: null,
    immutableUrl: null,
    branchUrl: null,
    generatedAt: null,
    authorityProfile: "phase6",
    selfTest: false,
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--evidence-root") options.evidenceRoot = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (["--branch", "--expected-branch"].includes(argument)) options.branch = next();
    else if (["--deployment-id", "--expected-deployment-id", "--cloudflare-deployment-id"].includes(argument)) options.deploymentId = next().toLowerCase();
    else if (["--immutable-url", "--observed-immutable-url"].includes(argument)) options.immutableUrl = next();
    else if (["--branch-url", "--observed-branch-url"].includes(argument)) options.branchUrl = next();
    else if (argument === "--generated-at") options.generatedAt = next();
    else if (argument === "--authority-profile") options.authorityProfile = next();
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

export function validateOptionShape(input) {
  const options = { ...input };
  const profile = authorityProfileById(options.authorityProfile ?? "phase6");
  options.authorityProfile = profile.id;
  for (const [key, flag] of [
    ["evidenceRoot", "--evidence-root"],
    ["output", "--output"],
    ["expectedHead", "--expected-head"],
    ["branch", "--branch"],
    ["deploymentId", "--deployment-id"],
    ["immutableUrl", "--immutable-url"],
    ["branchUrl", "--branch-url"],
    ["generatedAt", "--generated-at"],
  ]) if (typeof options[key] !== "string" || !options[key]) throw new Error(`${flag} is required`);
  options.evidenceRoot = path.resolve(options.evidenceRoot);
  options.output = path.resolve(options.output);
  if (path.basename(options.output) !== profile.archiveFilename) throw new Error(`--output basename must be exactly ${profile.archiveFilename}`);
  if (!HASH40.test(options.expectedHead)) throw new Error("--expected-head must be a 40-character lowercase Git SHA");
  if ([profile.parent, FROZEN_MAIN_SHA].includes(options.expectedHead)) throw new Error(`--expected-head must identify the new ${profile.title} final commit`);
  if (options.branch !== profile.branch) throw new Error(`--branch must be exactly ${profile.branch}`);
  const deployment = validateDeploymentCoordinates(options, profile);
  options.immutableUrl = deployment.immutableUrl;
  options.branchUrl = deployment.branchUrl;
  options.generatedAt = canonicalTimestamp(options.generatedAt, "--generated-at");
  return options;
}

export function assertExternalPath(candidate, label = "path") {
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root || isWithin(ROOT, resolved)) throw new Error(`${label} must be outside the repository and filesystem root`);
  return resolved;
}

async function recursiveFiles(root, prefix = "") {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`evidence cannot contain symlinks: ${relative}`);
    if (entry.isDirectory()) output.push(...await recursiveFiles(absolute, relative));
    else if (entry.isFile()) output.push(relative);
    else throw new Error(`unsupported evidence filesystem entry: ${relative}`);
  }
  return output.sort(lexicalCompare);
}

export async function collectPayloadEntries(evidenceRoot, reportRoot = ROOT) {
  const rootInfo = await lstat(evidenceRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("--evidence-root must be a real directory");
  const entries = [];
  for (const relativePath of await recursiveFiles(evidenceRoot)) {
    assertAllowedEntry(relativePath);
    if (RESERVED_PACKAGE_PATHS.has(relativePath) || RESERVED_REPORT_PATHS.has(relativePath)) throw new Error(`external evidence collides with a reserved package path: ${relativePath}`);
    const data = await readFile(path.join(evidenceRoot, ...relativePath.split("/")));
    assertNoPrivateText(data, relativePath);
    entries.push({ path: relativePath, data, source: "external-evidence" });
  }
  for (const report of REPORT_SPECS) {
    const absolute = path.join(reportRoot, report.source);
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`tracked Phase 6 report is not a regular file: ${report.source}`);
    const data = await readFile(absolute);
    assertNoPrivateText(data, report.archive);
    entries.push({ path: report.archive, data, source: report.source });
  }
  return entries;
}

function normalizePayloadEntries(entries) {
  const normalized = entries.map((entry) => {
    assertAllowedEntry(entry.path);
    if (entry.path === IN_ARCHIVE_MANIFEST) throw new Error("payload entries cannot supply MANIFEST.json");
    const data = Buffer.from(entry.data);
    assertNoPrivateText(data, entry.path);
    return { path: entry.path, data, source: entry.source ?? "generated" };
  }).sort((left, right) => lexicalCompare(left.path, right.path));
  const paths = new Set();
  const hashes = new Map();
  for (const entry of normalized) {
    if (paths.has(entry.path)) throw new Error(`duplicate package path: ${entry.path}`);
    paths.add(entry.path);
    const hash = sha256(entry.data);
    if (hashes.has(hash)) throw new Error(`duplicate package payload: ${hashes.get(hash)} and ${entry.path}`);
    hashes.set(hash, entry.path);
  }
  return normalized;
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
    throw new Error("R1 human-evidence ledger createdAt is not canonical");
  }
  exactJson(ledger.policy, { filePresenceIsPass: false, machineRecordingSubstitutionAllowed: false, failRequiresTimestampOrFrame: true, allFourFilesRequiredBeforePackaging: true }, "R1 human-evidence ledger policy");
  for (const record of ledger.entries) {
    const label = `R1 human recording ${record?.filename ?? "unknown"}`;
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
  if (ledger.status !== expectedStatus) throw new Error(`R1 human-evidence ledger status must be ${expectedStatus}`);
}

export function validateR1HumanEvidencePayload(entries) {
  const byPath = new Map(entries.map((entry) => [entry.path, entry.data]));
  const ledgerBytes = byPath.get(R1_HUMAN_LEDGER_PATH);
  if (!ledgerBytes) throw new Error(`R1 package requires the human-evidence ledger: ${R1_HUMAN_LEDGER_PATH}`);
  let wrapper;
  try { wrapper = JSON.parse(ledgerBytes.toString("utf8")); }
  catch { throw new Error("R1 human-evidence ledger is not valid JSON"); }
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
    throw new Error("R1 human-evidence ledger authority differs");
  }
  const expectedFilenames = [...R1_REQUIRED_HUMAN_RECORDINGS].sort(lexicalCompare);
  if (stableJson([...ledger.requiredFilenames].sort(lexicalCompare)) !== stableJson(expectedFilenames)
    || stableJson(ledger.entries.map(({ filename }) => filename).sort(lexicalCompare)) !== stableJson(expectedFilenames)) {
    throw new Error("R1 human-evidence ledger omits or duplicates a required recording");
  }
  validateR1HumanLedgerSemantics(ledger);
  const physicalVideoPaths = entries
    .map(({ path: relativePath }) => relativePath)
    .filter((relativePath) => relativePath.startsWith("11-physical-device/") && path.posix.extname(relativePath).toLowerCase() === ".mp4")
    .sort(lexicalCompare);
  const expectedPaths = expectedFilenames.map((filename) => `11-physical-device/recordings/${filename}`).sort(lexicalCompare);
  if (stableJson(physicalVideoPaths) !== stableJson(expectedPaths)) throw new Error("R1 package physical recording inventory differs");
  const recordings = ledger.entries.map((record) => {
    const recordingPath = `11-physical-device/recordings/${record.filename}`;
    const bytes = byPath.get(recordingPath);
    if (!bytes || record.evidenceClass !== "PHYSICAL HUMAN RECORDING" || !permittedStatuses.has(record.status)
      || !Number.isSafeInteger(record.byteSize) || record.byteSize <= 0 || record.byteSize !== bytes.length
      || !HASH64.test(record.sha256 ?? "") || record.sha256 !== sha256(bytes)) {
      throw new Error(`R1 human recording is not hash/size/status bound: ${record.filename}`);
    }
    if (bytes.length < 12 || bytes.subarray(4, 8).toString("ascii") !== "ftyp") {
      throw new Error(`R1 human recording MP4 container signature differs: ${record.filename}`);
    }
    return { filename: record.filename, path: recordingPath, status: record.status, byteSize: bytes.length, sha256: record.sha256 };
  }).sort((left, right) => lexicalCompare(left.filename, right.filename));
  return {
    status: ledger.status,
    ledger: { path: R1_HUMAN_LEDGER_PATH, byteSize: ledgerBytes.length, sha256: sha256(ledgerBytes), schema: R1_HUMAN_EVIDENCE_SCHEMA },
    recordings,
  };
}

function exactJson(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) throw new Error(`${label} differs from the required Phase 6 authority`);
}

function canonicalProvenance(input) {
  const profile = authorityProfileById(input?.authorityProfile ?? "phase6");
  if (!HASH40.test(input?.expectedHead ?? "") || input.expectedHead === profile.parent || input.expectedHead === FROZEN_MAIN_SHA) {
    throw new Error(`package provenance expectedHead is not the ${profile.title} final commit`);
  }
  if (input.branch !== profile.branch || input.observedHead !== input.expectedHead) throw new Error("package provenance branch/HEAD authority differs");
  if (input[profile.parentField] !== profile.parent || input.expectedMain !== FROZEN_MAIN_SHA) throw new Error("package provenance parent/main authority differs");
  const deployment = validateDeploymentCoordinates({
    authorityProfile: profile.id,
    deploymentId: input.deployment?.id,
    immutableUrl: input.deployment?.immutableUrl,
    branchUrl: input.deployment?.branchUrl,
  }, profile);
  return {
    ...(profile.id === "phase6-r1" ? { authorityProfile: profile.id } : {}),
    branch: profile.branch,
    expectedHead: input.expectedHead,
    observedHead: input.expectedHead,
    [profile.parentField]: profile.parent,
    expectedMain: FROZEN_MAIN_SHA,
    deployment,
  };
}

export function validateDeploymentVerificationDocument(document, provenanceInput) {
  const provenance = canonicalProvenance(provenanceInput);
  const profile = authorityProfileById(provenance.authorityProfile ?? "phase6");
  if (!document || document.schema !== profile.deploymentSchema || document.status !== "PASS") throw new Error("deployment verification schema/status differs");
  exactJson(document.inputs, {
    expectedHead: provenance.expectedHead,
    [profile.parentField]: profile.parent,
    expectedMain: FROZEN_MAIN_SHA,
    repository: REQUIRED_REPOSITORY,
    branch: profile.branch,
    deploymentId: provenance.deployment.id,
    immutableUrl: provenance.deployment.immutableUrl,
    branchUrl: provenance.deployment.branchUrl,
    localDist: "dist",
  }, "deployment verification inputs");

  const repository = document.repository;
  const repositoryData = repository?.data;
  if (repository?.status !== "PASS" || !repositoryData || repositoryData.repository !== REQUIRED_REPOSITORY
    || repositoryData.branch !== profile.branch || repositoryData.head !== provenance.expectedHead
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
  if (history.at(-1).commit !== provenance.expectedHead || repositoryData.directParent !== history.at(-1).parents[0]) {
    throw new Error("deployment verification history does not terminate at the expected Phase 6 HEAD");
  }
  if (profile.id === "phase6-r1") {
    exactJson(repositoryData.main, { local: FROZEN_MAIN_SHA, upstream: FROZEN_MAIN_SHA, live: FROZEN_MAIN_SHA, modifiedOrMerged: false }, "deployment verification R1 main");
    exactJson(repositoryData.upstream, { ref: `origin/${profile.branch}`, head: provenance.expectedHead, live: provenance.expectedHead, parity: true }, "deployment verification R1 upstream");
    exactJson(repositoryData.productionSourceDiff, [], "deployment verification R1 production-source diff");
  } else {
    exactJson(repositoryData.main, { branch: "main", headSha: FROZEN_MAIN_SHA, frozenAt: FROZEN_MAIN_SHA, containsPhase6Head: false }, "deployment verification local main");
    exactJson(repositoryData.upstream, { ref: `origin/${profile.branch}`, headSha: provenance.expectedHead, parity: true }, "deployment verification upstream");
    exactJson(repositoryData.liveRemote, {
      branchRef: `refs/heads/${profile.branch}`,
      branchHeadSha: provenance.expectedHead,
      mainRef: "refs/heads/main",
      mainHeadSha: FROZEN_MAIN_SHA,
      parity: true,
    }, "deployment verification live remote");
  }

  const deployment = document.deployment;
  const deploymentData = deployment?.data;
  if (deployment?.status !== "PASS" || !deploymentData || deploymentData.status !== "PASS"
    || deploymentData.authoritySource !== "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK"
    || deploymentData.deploymentId !== provenance.deployment.id
    || deploymentData.immutableUrl !== provenance.deployment.immutableUrl
    || deploymentData.branchUrl !== provenance.deployment.branchUrl
    || deploymentData.branch !== profile.branch || deploymentData.commitHash !== provenance.expectedHead
    || deploymentData.environment !== "preview") {
    throw new Error("deployment verification signed Cloudflare authority differs");
  }
  if (typeof deploymentData.completedAt !== "string" || !Number.isFinite(Date.parse(deploymentData.completedAt))) {
    throw new Error("deployment verification completedAt is not a valid timestamp");
  }
  if (profile.id === "phase6-r1" && deploymentData.appSlug !== "cloudflare-workers-and-pages") throw new Error("deployment verification R1 Cloudflare app authority differs");
  if (document.dist?.status !== "PASS" || document.origins?.immutable?.status !== "PASS" || document.origins?.branch?.status !== "PASS") {
    throw new Error("deployment verification dist/origin parity did not pass");
  }
  if (document.origins.immutable.data?.origin !== provenance.deployment.immutableUrl
    || document.origins.branch.data?.origin !== provenance.deployment.branchUrl
    || document.origins.immutable.data?.status !== "PASS" || document.origins.branch.data?.status !== "PASS") {
    throw new Error("deployment verification origin identities differ");
  }
  exactJson(document.checks, profile.deploymentChecks, "deployment verification checks");
  exactJson(document.failures, [], "deployment verification failures");
  return true;
}

function deploymentVerificationBinding(entries, provenance) {
  const entry = entries.find(({ path: relativePath }) => relativePath === DEPLOYMENT_VERIFICATION_PATH);
  if (!entry) throw new Error(`required deployment verification artifact is missing: ${DEPLOYMENT_VERIFICATION_PATH}`);
  let document;
  try { document = JSON.parse(entry.data.toString("utf8")); }
  catch { throw new Error(`${DEPLOYMENT_VERIFICATION_PATH} is not valid JSON`); }
  validateDeploymentVerificationDocument(document, provenance);
  const profile = authorityProfileById(provenance.authorityProfile ?? "phase6");
  return {
    path: DEPLOYMENT_VERIFICATION_PATH,
    schema: profile.deploymentSchema,
    status: "PASS",
    byteSize: entry.data.length,
    sha256: sha256(entry.data),
  };
}

function packageReadme(provenance) {
  const profile = authorityProfileById(provenance.authorityProfile ?? "phase6");
  return `# Quantum-Hub ${profile.title} human review\n\n` +
    `This package is bound to branch \`${provenance.branch}\`, Git HEAD \`${provenance.expectedHead}\`, deployment \`${provenance.deployment.id}\`, immutable preview ${provenance.deployment.immutableUrl}, and branch preview ${provenance.deployment.branchUrl}.\n\n` +
    `The archive uses the required \`00-provenance\` through \`13-package\` topology. It contains distilled evidence and the four tracked Phase 6 reports, but no raw frames, caches, nested archives, private host paths, or credentials. \`MANIFEST.json\` binds every non-self entry by path, byte size, and SHA-256. Detached manifest and independent-audit files are emitted beside the ZIP to avoid cryptographic self-reference.\n\n` +
    `All six Phase 6 gates remain **PENDING HUMAN REVIEW**. Machine package integrity does not accept Phase 6, authorize Phase 7, or merge main.\n`;
}

function sectionCounts(entries) {
  return Object.fromEntries(TOPOLOGY_SECTIONS.map((section) => [section, entries.filter((entry) => sectionFor(entry.path) === section).length]));
}

export function buildPackageArtifacts({ payloadEntries, provenance: provenanceInput, outputFilename, generatedAt, maximumBytes = MAX_ARCHIVE_BYTES }) {
  const profile = authorityProfileById(provenanceInput?.authorityProfile ?? "phase6");
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || maximumBytes > MAX_ARCHIVE_BYTES) throw new Error(`maximum archive bytes must be between 1 and ${MAX_ARCHIVE_BYTES}`);
  if (outputFilename !== profile.archiveFilename) throw new Error(`output filename must be exactly ${profile.archiveFilename}`);
  canonicalTimestamp(generatedAt, "generatedAt");
  const provenance = canonicalProvenance(provenanceInput);
  const normalizedPayload = normalizePayloadEntries(payloadEntries);
  const deploymentVerification = deploymentVerificationBinding(normalizedPayload, provenance);
  const humanEvidence = profile.id === "phase6-r1" ? validateR1HumanEvidencePayload(normalizedPayload) : null;
  const generatedEntries = [
    { path: "13-package/README.md", data: Buffer.from(packageReadme(provenance)), source: "generated" },
    { path: "13-package/package-metadata.json", data: Buffer.from(stableJson({ schema: `${profile.packageSchema}.package-metadata`, status: "PASS", generatedAt, provenance, deploymentVerification, ...(humanEvidence ? { humanEvidence } : {}), humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION })), source: "generated" },
  ];
  const entries = normalizePayloadEntries([...normalizedPayload, ...generatedEntries]);
  validateTopology(entries.map(({ path: relativePath }) => relativePath));
  const files = entries.map((entry) => ({
    path: entry.path,
    byteSize: entry.data.length,
    sha256: sha256(entry.data),
    kind: kindFor(entry.path),
    section: sectionFor(entry.path),
  }));
  const manifest = {
    schema: profile.packageSchema,
    status: "PASS",
    generatedAt,
    provenance,
    topology: [...TOPOLOGY_SECTIONS],
    inventory: {
      payloadFiles: files.length,
      payloadBytes: files.reduce((sum, file) => sum + file.byteSize, 0),
      archiveEntries: files.length + 1,
      sections: sectionCounts(entries),
      duplicatePaths: 0,
      duplicatePayloads: 0,
      rawFrames: 0,
      caches: 0,
      nestedArchives: 0,
      maximumArchiveBytes: maximumBytes,
    },
    privacyAndSecrets: "PASS",
    deploymentVerification,
    ...(humanEvidence ? { humanEvidence } : {}),
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
    files,
  };
  const manifestBytes = Buffer.from(stableJson(manifest));
  assertNoPrivateText(manifestBytes, IN_ARCHIVE_MANIFEST);
  const archiveBytes = createStoredZipBuffer([
    ...entries.map((entry) => ({ path: entry.path, data: entry.data })),
    { path: IN_ARCHIVE_MANIFEST, data: manifestBytes },
  ]);
  if (archiveBytes.length > maximumBytes) throw new Error(`review ZIP is ${archiveBytes.length} bytes; maximum is ${maximumBytes}`);
  const detached = {
    schema: profile.detachedSchema,
    status: "PASS",
    generatedAt,
    archive: {
      filename: outputFilename,
      byteSize: archiveBytes.length,
      sha256: sha256(archiveBytes),
      entries: files.length + 1,
      canonicalUniqueStoredZip: true,
    },
    inArchiveManifest: {
      path: IN_ARCHIVE_MANIFEST,
      byteSize: manifestBytes.length,
      sha256: sha256(manifestBytes),
      schema: profile.packageSchema,
    },
    provenance,
    deploymentVerification,
    ...(humanEvidence ? { humanEvidence } : {}),
  };
  const detachedBytes = Buffer.from(stableJson(detached));
  assertNoPrivateText(detachedBytes, "detached-manifest.json");
  return { entries, files, manifest, manifestBytes, archiveBytes, detached, detachedBytes };
}

async function runGit(args, label) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 5_000_000 });
    return stdout.trim();
  } catch (error) {
    throw new Error(`${label} failed: ${error.stderr?.trim() || error.message}`);
  }
}

async function gitSucceeds(args) {
  try {
    await execFileAsync("git", args, { cwd: ROOT, windowsHide: true, maxBuffer: 5_000_000 });
    return true;
  } catch (error) {
    if (Number.isInteger(error?.code)) return false;
    throw error;
  }
}

function liveRefs(text) {
  const refs = new Map();
  for (const line of String(text).split(/\r?\n/).filter(Boolean)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 2 || !HASH40.test(fields[0]) || refs.has(fields[1])) throw new Error("live origin refs are malformed or duplicated");
    refs.set(fields[1], fields[0]);
  }
  return refs;
}

export async function repositoryAuthority(options) {
  const profile = authorityProfileById(options.authorityProfile ?? "phase6");
  const [head, branch, status, parentLine, reports, localMain, originMain, originBranch, upstreamRef, upstreamHead, remoteUrl, liveText, parentAncestor, headMergedIntoMain] = await Promise.all([
    runGit(["rev-parse", "HEAD"], "Git HEAD"),
    runGit(["branch", "--show-current"], "Git branch"),
    runGit(["status", "--porcelain=v1", "--untracked-files=all"], "Git status"),
    runGit(["rev-list", "--parents", "-n", "1", "HEAD"], "Git direct parent"),
    runGit(["ls-files", "--", ...REPORT_SPECS.map(({ source }) => source)], "tracked Phase 6 reports"),
    runGit(["rev-parse", "main"], "local main"),
    runGit(["rev-parse", "origin/main"], "origin/main"),
    runGit(["rev-parse", `origin/${profile.branch}`], `origin ${profile.title} branch`),
    runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "Git upstream"),
    runGit(["rev-parse", "@{upstream}"], "Git upstream HEAD"),
    runGit(["remote", "get-url", "origin"], "origin URL"),
    runGit(["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${profile.branch}`, "refs/heads/main"], "live origin refs"),
    gitSucceeds(["merge-base", "--is-ancestor", profile.parent, options.expectedHead]),
    gitSucceeds(["merge-base", "--is-ancestor", options.expectedHead, "main"]),
  ]);
  if (head !== options.expectedHead) throw new Error(`Git HEAD ${head} differs from --expected-head ${options.expectedHead}`);
  if (branch !== profile.branch || options.branch !== profile.branch) throw new Error(`Git branch must be exactly ${profile.branch}`);
  if (status) throw new Error("repository must be clean before Phase 6 review packaging");
  if (localMain !== FROZEN_MAIN_SHA) throw new Error(`local main must remain frozen at ${FROZEN_MAIN_SHA}`);
  if (originMain !== FROZEN_MAIN_SHA) throw new Error(`origin/main must remain frozen at ${FROZEN_MAIN_SHA}`);
  if (originBranch !== options.expectedHead || upstreamRef !== `origin/${profile.branch}` || upstreamHead !== options.expectedHead) throw new Error(`local/upstream ${profile.title} branch parity differs`);
  if (remoteUrl.replace(/\/$/, "") !== REQUIRED_REMOTE_URL) throw new Error(`origin URL must be exactly ${REQUIRED_REMOTE_URL}`);
  if (!parentAncestor) throw new Error(`required parent ${profile.parent} is not an ancestor of ${profile.title} HEAD`);
  if (headMergedIntoMain) throw new Error(`${profile.title} HEAD is already merged into frozen main`);
  const live = liveRefs(liveText);
  if (live.size !== 2 || live.get("refs/heads/main") !== FROZEN_MAIN_SHA || live.get(`refs/heads/${profile.branch}`) !== options.expectedHead) {
    throw new Error(`live origin main/${profile.title} refs differ from the frozen authorities`);
  }
  const trackedReports = reports.split(/\r?\n/).filter(Boolean).sort(lexicalCompare);
  const expectedReports = REPORT_SPECS.map(({ source }) => source).sort(lexicalCompare);
  if (JSON.stringify(trackedReports) !== JSON.stringify(expectedReports)) throw new Error("the four Phase 6 markdown reports must be tracked");
  const parentFields = parentLine.split(/\s+/);
  if (parentFields[0] !== head || parentFields.length !== 2 || !HASH40.test(parentFields[1])) throw new Error("Phase 6 HEAD must have exactly one direct parent");
  return {
    schema: `${profile.packageSchema}.git-provenance`,
    status: "PASS",
    branch,
    head,
    directParents: parentFields.slice(1),
    cleanTree: true,
    [profile.parentField]: profile.parent,
    [profile.ancestorField]: true,
    headMergedIntoMain: false,
    localMain: { ref: "refs/heads/main", head: localMain },
    originMain: { ref: "refs/remotes/origin/main", head: originMain },
    liveMain: { ref: "refs/heads/main", head: live.get("refs/heads/main") },
    upstream: { ref: upstreamRef, head: upstreamHead, liveHead: live.get(`refs/heads/${profile.branch}`), parity: true },
    remote: { name: "origin", url: remoteUrl, repository: REQUIRED_REPOSITORY },
    trackedReports,
  };
}

export function siblingNames(output) {
  const basename = path.basename(output);
  const stem = basename.slice(0, -path.extname(basename).length);
  return {
    manifest: path.join(path.dirname(output), `${stem}-manifest.json`),
    audit: path.join(path.dirname(output), `${stem}-audit.json`),
  };
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

async function canonicalFuturePath(candidate, label) {
  const resolved = assertExternalPath(candidate, label);
  await mkdir(path.dirname(resolved), { recursive: true });
  const parent = await realpath(path.dirname(resolved));
  const result = path.join(parent, path.basename(resolved));
  assertExternalPath(result, label);
  return result;
}

async function spawnAuditor({ archive, manifest, auditOutput, options }) {
  const profile = authorityProfileById(options.authorityProfile ?? "phase6");
  const args = [
    AUDITOR,
    "--authority-profile", profile.id,
    "--archive", archive,
    "--manifest", manifest,
    "--audit-output", auditOutput,
    "--expected-head", options.expectedHead,
    "--branch", options.branch,
    "--deployment-id", options.deploymentId,
    "--immutable-url", options.immutableUrl,
    "--branch-url", options.branchUrl,
    "--expected-parent-process-id", String(process.pid),
  ];
  const { stdout } = await execFileAsync(process.execPath, args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 5_000_000 });
  let result;
  try { result = JSON.parse(stdout); } catch { throw new Error(`independent ${profile.title} auditor returned invalid JSON`); }
  if (result.status !== "PASS" || result.schema !== `${profile.auditSchema}.result`) throw new Error(`independent ${profile.title} auditor did not pass`);
  return result;
}

export async function assemblePackage(input) {
  const options = validateOptionShape(input);
  const profile = authorityProfileById(options.authorityProfile);
  const output = await canonicalFuturePath(options.output, "--output");
  const evidenceRoot = await realpath(assertExternalPath(options.evidenceRoot, "--evidence-root"));
  if (isWithin(evidenceRoot, output)) throw new Error("output cannot be inside the evidence root");
  const siblings = siblingNames(output);
  await assertFreshOutputSet([output, siblings.manifest, siblings.audit]);
  const repository = await repositoryAuthority(options);
  const generatedAt = options.generatedAt;
  const provenance = {
    ...(profile.id === "phase6-r1" ? { authorityProfile: profile.id } : {}),
    branch: profile.branch,
    expectedHead: options.expectedHead,
    observedHead: repository.head,
    [profile.parentField]: profile.parent,
    expectedMain: FROZEN_MAIN_SHA,
    deployment: { id: options.deploymentId, immutableUrl: options.immutableUrl, branchUrl: options.branchUrl },
  };
  const payloadEntries = await collectPayloadEntries(evidenceRoot);
  const gitBytes = Buffer.from(stableJson(repository));
  assertNoPrivateText(gitBytes, "00-provenance/git-provenance.json");
  payloadEntries.push({ path: "00-provenance/git-provenance.json", data: gitBytes, source: "generated" });
  const artifacts = buildPackageArtifacts({ payloadEntries, provenance, outputFilename: path.basename(output), generatedAt });
  const staging = path.join(path.dirname(output), `.phase6-review-${randomUUID()}`);
  await mkdir(staging, { recursive: false });
  const stagedArchive = path.join(staging, path.basename(output));
  const stagedManifest = path.join(staging, path.basename(siblings.manifest));
  const stagedAudit = path.join(staging, path.basename(siblings.audit));
  try {
    await writeFile(stagedArchive, artifacts.archiveBytes, { flag: "wx" });
    await writeFile(stagedManifest, artifacts.detachedBytes, { flag: "wx" });
    await spawnAuditor({ archive: stagedArchive, manifest: stagedManifest, auditOutput: stagedAudit, options });
    const auditBytes = await readFile(stagedAudit);
    const auditDocument = JSON.parse(auditBytes.toString("utf8"));
    if (auditDocument.archive?.sha256 !== sha256(artifacts.archiveBytes) || auditDocument.detachedManifest?.sha256 !== sha256(artifacts.detachedBytes)) {
      throw new Error("independent audit bindings differ from staged outputs");
    }
    await publishFreshSetAtomic([
      { source: stagedArchive, destination: output },
      { source: stagedManifest, destination: siblings.manifest },
      { source: stagedAudit, destination: siblings.audit },
    ]);
    return {
      schema: `${profile.packageSchema}.result`,
      status: "PASS",
      archive: { path: output, byteSize: artifacts.archiveBytes.length, sha256: sha256(artifacts.archiveBytes), entries: artifacts.files.length + 1 },
      detachedManifest: { path: siblings.manifest, byteSize: artifacts.detachedBytes.length, sha256: sha256(artifacts.detachedBytes) },
      independentAudit: { path: siblings.audit, byteSize: auditBytes.length, sha256: sha256(auditBytes) },
      humanReviewGates: HUMAN_REVIEW_GATES,
      authorization: AUTHORIZATION,
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function selfTestDeploymentVerification(provenance) {
  const profile = authorityProfileById(provenance.authorityProfile ?? "phase6");
  const history = [{ commit: provenance.expectedHead, parents: [profile.parent], subject: `${profile.title} fixture` }];
  return {
    schema: profile.deploymentSchema,
    status: "PASS",
    inputs: {
      expectedHead: provenance.expectedHead,
      [profile.parentField]: profile.parent,
      expectedMain: FROZEN_MAIN_SHA,
      repository: REQUIRED_REPOSITORY,
      branch: profile.branch,
      deploymentId: provenance.deployment.id,
      immutableUrl: provenance.deployment.immutableUrl,
      branchUrl: provenance.deployment.branchUrl,
      localDist: "dist",
    },
    repository: {
      status: "PASS",
      data: {
        repository: REQUIRED_REPOSITORY,
        branch: profile.branch,
        head: provenance.expectedHead,
        [profile.parentField]: profile.parent,
        directParent: profile.parent,
        cleanTree: true,
        history,
        ...(profile.id === "phase6-r1" ? {
          productionSourceDiff: [],
          main: { local: FROZEN_MAIN_SHA, upstream: FROZEN_MAIN_SHA, live: FROZEN_MAIN_SHA, modifiedOrMerged: false },
          upstream: { ref: `origin/${profile.branch}`, head: provenance.expectedHead, live: provenance.expectedHead, parity: true },
        } : {
          productionDelta: [],
          main: { branch: "main", headSha: FROZEN_MAIN_SHA, frozenAt: FROZEN_MAIN_SHA, containsPhase6Head: false },
          upstream: { ref: `origin/${profile.branch}`, headSha: provenance.expectedHead, parity: true },
          liveRemote: { branchRef: `refs/heads/${profile.branch}`, branchHeadSha: provenance.expectedHead, mainRef: "refs/heads/main", mainHeadSha: FROZEN_MAIN_SHA, parity: true },
        }),
      },
    },
    deployment: {
      status: "PASS",
      data: {
        authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
        checkRunId: "1",
        appSlug: profile.id === "phase6-r1" ? "cloudflare-workers-and-pages" : "cloudflare-pages",
        completedAt: "2026-08-30T00:00:00.000Z",
        deploymentId: provenance.deployment.id,
        immutableUrl: provenance.deployment.immutableUrl,
        branchUrl: provenance.deployment.branchUrl,
        branch: profile.branch,
        commitHash: provenance.expectedHead,
        environment: "preview",
        status: "PASS",
      },
    },
    dist: { status: "PASS" },
    origins: {
      immutable: { status: "PASS", data: { origin: provenance.deployment.immutableUrl, status: "PASS" } },
      branch: { status: "PASS", data: { origin: provenance.deployment.branchUrl, status: "PASS" } },
    },
    checks: profile.deploymentChecks,
    failures: [],
  };
}

export function selfTest(authorityProfile = "phase6") {
  const profile = authorityProfileById(authorityProfile);
  const expectedHead = "a".repeat(40);
  const deploymentId = "12345678-1234-4234-8234-123456789abc";
  const provenance = { ...(profile.id === "phase6-r1" ? { authorityProfile: profile.id } : {}), branch: profile.branch, expectedHead, observedHead: expectedHead, [profile.parentField]: profile.parent, expectedMain: FROZEN_MAIN_SHA, deployment: { id: deploymentId, immutableUrl: expectedImmutableUrl(deploymentId), branchUrl: profile.branchUrl } };
  const entries = TOPOLOGY_SECTIONS.slice(0, -1).map((section, index) => ({ path: `${section}/fixture-${index}.json`, data: Buffer.from(`{"index":${index}}\n`) }));
  entries.push({ path: DEPLOYMENT_VERIFICATION_PATH, data: Buffer.from(stableJson(selfTestDeploymentVerification(provenance))) });
  if (profile.id === "phase6-r1") {
    const recordings = R1_REQUIRED_HUMAN_RECORDINGS.map((filename, index) => {
      const marker = Buffer.from(`R1 self-test physical recording ${index + 1}: ${filename}`);
      const ftyp = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32]);
      const free = Buffer.alloc(8);
      free.writeUInt32BE(8 + marker.length, 0);
      free.write("free", 4, "ascii");
      const data = Buffer.concat([ftyp, free, marker]);
      return { filename, data, byteSize: data.length, sha256: sha256(data) };
    });
    const ledger = {
      schema: R1_HUMAN_EVIDENCE_SCHEMA,
      createdAt: "2026-08-30T00:00:00.000Z",
      status: "PENDING HUMAN REVIEW",
      evidenceClass: "HUMAN DEVICE EVIDENCE",
      rootExists: true,
      requiredFilenames: [...R1_REQUIRED_HUMAN_RECORDINGS],
      missingFilenames: [],
      entries: recordings.map(({ filename, byteSize, sha256: hash }) => ({
        filename,
        byteSize,
        sha256: hash,
        evidenceClass: "PHYSICAL HUMAN RECORDING",
        device: "Synthetic fixture; not a physical-device claim",
        os: "Synthetic fixture; not reviewed",
        browser: filename.startsWith("iphone-safari-") ? "Safari (version not reviewed)" : filename === "chrome-200-percent.mp4" ? "Chrome (version not reviewed)" : null,
        browserVersion: null,
        testSteps: ["Exercise the package binding contract without claiming a human result."],
        observations: ["Synthetic bytes remain pending and are not acceptance evidence."],
        observedResult: "PENDING HUMAN REVIEW; fixture presence is not a physical-device pass.",
        status: "PENDING HUMAN REVIEW",
        failureReferences: [],
      })),
      policy: { filePresenceIsPass: false, machineRecordingSubstitutionAllowed: false, failRequiresTimestampOrFrame: true, allFourFilesRequiredBeforePackaging: true },
    };
    const ledgerSource = Buffer.from(stableJson(ledger));
    entries.push({
      path: R1_HUMAN_LEDGER_PATH,
      data: Buffer.from(stableJson({
        schema: "quantum-hub.phase-6.final-evidence-assembly.v1.distilled-json",
        status: "PENDING HUMAN REVIEW",
        role: "physical-device-result",
        source: { relativePath: "human-device/ledger.json", sha256: sha256(ledgerSource) },
        selection: null,
        payload: ledger,
      })),
    });
    entries.push(...recordings.map(({ filename, data }) => ({ path: `11-physical-device/recordings/${filename}`, data })));
  }
  const result = buildPackageArtifacts({ payloadEntries: entries, provenance, outputFilename: profile.archiveFilename, generatedAt: "2026-08-30T00:00:00.000Z" });
  return { schema: `${profile.packageSchema}.self-test`, status: "PASS", authorityProfile: profile.id, archiveBytes: result.archiveBytes.length, entries: result.files.length + 1, maximumArchiveBytes: MAX_ARCHIVE_BYTES, topologySections: TOPOLOGY_SECTIONS.length };
}

function dryRunReport(authorityProfile = "phase6") {
  const profile = authorityProfileById(authorityProfile);
  return {
    schema: `${profile.packageSchema}.dry-run`,
    status: "READY",
    authorityProfile: profile.id,
    fixedAuthorities: { branch: profile.branch, [profile.parentField]: profile.parent, main: FROZEN_MAIN_SHA, branchUrl: profile.branchUrl },
    dynamicInputs: ["expected HEAD", "Cloudflare deployment UUID", "matching immutable URL", "canonical generatedAt"],
    requiredDeploymentVerification: { path: DEPLOYMENT_VERIFICATION_PATH, schema: profile.deploymentSchema },
    requiredReports: REPORT_SPECS.map(({ source, archive }) => ({ source, archive })),
    topology: TOPOLOGY_SECTIONS,
    maximumArchiveBytes: MAX_ARCHIVE_BYTES,
  };
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/package-phase6-human-review.mjs \\",
    "    [--authority-profile phase6|phase6-r1] \\",
    "    --evidence-root <external-distilled-evidence-directory> \\",
    `    --output <fresh-external>/<profile-exact-filename> --expected-head <sha40> \\`,
    `    --branch <profile-exact-branch> --deployment-id <Cloudflare-UUID> \\`,
    `    --immutable-url https://<UUID-prefix>.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/ \\`,
    `    --branch-url <profile-exact-alias> --generated-at <canonical-ISO-timestamp>`,
    "",
    "The detached manifest and independent audit are emitted beside the ZIP using its filename stem.",
  ].join("\n"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.selfTest) { console.log(JSON.stringify(selfTest(options.authorityProfile), null, 2)); return; }
  if (options.dryRun) { console.log(JSON.stringify(dryRunReport(options.authorityProfile), null, 2)); return; }
  console.log(JSON.stringify(await assemblePackage(options), null, 2));
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
