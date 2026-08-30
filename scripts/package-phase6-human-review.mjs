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

function validateDeploymentCoordinates(input) {
  if (!CLOUDFLARE_UUID.test(input.deploymentId ?? "")) throw new Error("--deployment-id must be a lowercase Cloudflare deployment UUID");
  const immutableUrl = normalizePreviewUrl(input.immutableUrl, "--immutable-url");
  const branchUrl = normalizePreviewUrl(input.branchUrl, "--branch-url");
  const requiredImmutable = expectedImmutableUrl(input.deploymentId);
  if (immutableUrl !== requiredImmutable) throw new Error(`--immutable-url must be exactly ${requiredImmutable}`);
  if (branchUrl !== REQUIRED_BRANCH_URL) throw new Error(`--branch-url must be exactly ${REQUIRED_BRANCH_URL}`);
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
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

export function validateOptionShape(input) {
  const options = { ...input };
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
  if (path.basename(options.output) !== REQUIRED_ARCHIVE_FILENAME) throw new Error(`--output basename must be exactly ${REQUIRED_ARCHIVE_FILENAME}`);
  if (!HASH40.test(options.expectedHead)) throw new Error("--expected-head must be a 40-character lowercase Git SHA");
  if ([ACCEPTED_PHASE5B_SHA, FROZEN_MAIN_SHA].includes(options.expectedHead)) throw new Error("--expected-head must identify the new Phase 6 final commit");
  if (options.branch !== REQUIRED_BRANCH) throw new Error(`--branch must be exactly ${REQUIRED_BRANCH}`);
  const deployment = validateDeploymentCoordinates(options);
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

function exactJson(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) throw new Error(`${label} differs from the required Phase 6 authority`);
}

function canonicalProvenance(input) {
  if (!HASH40.test(input?.expectedHead ?? "") || input.expectedHead === ACCEPTED_PHASE5B_SHA || input.expectedHead === FROZEN_MAIN_SHA) {
    throw new Error("package provenance expectedHead is not the Phase 6 final commit");
  }
  if (input.branch !== REQUIRED_BRANCH || input.observedHead !== input.expectedHead) throw new Error("package provenance branch/HEAD authority differs");
  if (input.acceptedBase !== ACCEPTED_PHASE5B_SHA || input.expectedMain !== FROZEN_MAIN_SHA) throw new Error("package provenance accepted-base/main authority differs");
  const deployment = validateDeploymentCoordinates({
    deploymentId: input.deployment?.id,
    immutableUrl: input.deployment?.immutableUrl,
    branchUrl: input.deployment?.branchUrl,
  });
  return {
    branch: REQUIRED_BRANCH,
    expectedHead: input.expectedHead,
    observedHead: input.expectedHead,
    acceptedBase: ACCEPTED_PHASE5B_SHA,
    expectedMain: FROZEN_MAIN_SHA,
    deployment,
  };
}

const REQUIRED_DEPLOYMENT_CHECKS = Object.freeze({
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

export function validateDeploymentVerificationDocument(document, provenanceInput) {
  const provenance = canonicalProvenance(provenanceInput);
  if (!document || document.schema !== DEPLOYMENT_VERIFICATION_SCHEMA || document.status !== "PASS") throw new Error("deployment verification schema/status differs");
  exactJson(document.inputs, {
    expectedHead: provenance.expectedHead,
    acceptedBase: ACCEPTED_PHASE5B_SHA,
    expectedMain: FROZEN_MAIN_SHA,
    repository: REQUIRED_REPOSITORY,
    branch: REQUIRED_BRANCH,
    deploymentId: provenance.deployment.id,
    immutableUrl: provenance.deployment.immutableUrl,
    branchUrl: provenance.deployment.branchUrl,
    localDist: "dist",
  }, "deployment verification inputs");

  const repository = document.repository;
  const repositoryData = repository?.data;
  if (repository?.status !== "PASS" || !repositoryData || repositoryData.repository !== REQUIRED_REPOSITORY
    || repositoryData.branch !== REQUIRED_BRANCH || repositoryData.head !== provenance.expectedHead
    || repositoryData.acceptedBase !== ACCEPTED_PHASE5B_SHA || repositoryData.cleanTree !== true) {
    throw new Error("deployment verification repository authority differs");
  }
  const history = repositoryData.history;
  if (!Array.isArray(history) || history.length < 1) throw new Error("deployment verification omits the Phase 6 linear history");
  for (let index = 0; index < history.length; index += 1) {
    const record = history[index];
    const requiredParent = index === 0 ? ACCEPTED_PHASE5B_SHA : history[index - 1]?.commit;
    if (!HASH40.test(record?.commit ?? "") || !Array.isArray(record?.parents) || record.parents.length !== 1
      || record.parents[0] !== requiredParent || typeof record.subject !== "string" || !record.subject) {
      throw new Error(`deployment verification history entry ${index + 1} is not an exact linear descendant of accepted Phase 5B`);
    }
  }
  if (history.at(-1).commit !== provenance.expectedHead || repositoryData.directParent !== history.at(-1).parents[0]) {
    throw new Error("deployment verification history does not terminate at the expected Phase 6 HEAD");
  }
  exactJson(repositoryData.main, {
    branch: "main", headSha: FROZEN_MAIN_SHA, frozenAt: FROZEN_MAIN_SHA, containsPhase6Head: false,
  }, "deployment verification local main");
  exactJson(repositoryData.upstream, {
    ref: `origin/${REQUIRED_BRANCH}`, headSha: provenance.expectedHead, parity: true,
  }, "deployment verification upstream");
  exactJson(repositoryData.liveRemote, {
    branchRef: `refs/heads/${REQUIRED_BRANCH}`,
    branchHeadSha: provenance.expectedHead,
    mainRef: "refs/heads/main",
    mainHeadSha: FROZEN_MAIN_SHA,
    parity: true,
  }, "deployment verification live remote");

  const deployment = document.deployment;
  const deploymentData = deployment?.data;
  if (deployment?.status !== "PASS" || !deploymentData || deploymentData.status !== "PASS"
    || deploymentData.authoritySource !== "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK"
    || deploymentData.deploymentId !== provenance.deployment.id
    || deploymentData.immutableUrl !== provenance.deployment.immutableUrl
    || deploymentData.branchUrl !== provenance.deployment.branchUrl
    || deploymentData.branch !== REQUIRED_BRANCH || deploymentData.commitHash !== provenance.expectedHead
    || deploymentData.environment !== "preview") {
    throw new Error("deployment verification signed Cloudflare authority differs");
  }
  if (typeof deploymentData.completedAt !== "string" || !Number.isFinite(Date.parse(deploymentData.completedAt))) {
    throw new Error("deployment verification completedAt is not a valid timestamp");
  }
  if (document.dist?.status !== "PASS" || document.origins?.immutable?.status !== "PASS" || document.origins?.branch?.status !== "PASS") {
    throw new Error("deployment verification dist/origin parity did not pass");
  }
  if (document.origins.immutable.data?.origin !== provenance.deployment.immutableUrl
    || document.origins.branch.data?.origin !== provenance.deployment.branchUrl
    || document.origins.immutable.data?.status !== "PASS" || document.origins.branch.data?.status !== "PASS") {
    throw new Error("deployment verification origin identities differ");
  }
  exactJson(document.checks, REQUIRED_DEPLOYMENT_CHECKS, "deployment verification checks");
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
  return {
    path: DEPLOYMENT_VERIFICATION_PATH,
    schema: DEPLOYMENT_VERIFICATION_SCHEMA,
    status: "PASS",
    byteSize: entry.data.length,
    sha256: sha256(entry.data),
  };
}

function packageReadme(provenance) {
  return `# Quantum-Hub Phase 6 global-hardening human review\n\n` +
    `This package is bound to branch \`${provenance.branch}\`, Git HEAD \`${provenance.expectedHead}\`, deployment \`${provenance.deployment.id}\`, immutable preview ${provenance.deployment.immutableUrl}, and branch preview ${provenance.deployment.branchUrl}.\n\n` +
    `The archive uses the required \`00-provenance\` through \`13-package\` topology. It contains distilled evidence and the four tracked Phase 6 reports, but no raw frames, caches, nested archives, private host paths, or credentials. \`MANIFEST.json\` binds every non-self entry by path, byte size, and SHA-256. Detached manifest and independent-audit files are emitted beside the ZIP to avoid cryptographic self-reference.\n\n` +
    `All six Phase 6 gates remain **PENDING HUMAN REVIEW**. Machine package integrity does not accept Phase 6, authorize Phase 7, or merge main.\n`;
}

function sectionCounts(entries) {
  return Object.fromEntries(TOPOLOGY_SECTIONS.map((section) => [section, entries.filter((entry) => sectionFor(entry.path) === section).length]));
}

export function buildPackageArtifacts({ payloadEntries, provenance: provenanceInput, outputFilename, generatedAt, maximumBytes = MAX_ARCHIVE_BYTES }) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || maximumBytes > MAX_ARCHIVE_BYTES) throw new Error(`maximum archive bytes must be between 1 and ${MAX_ARCHIVE_BYTES}`);
  if (outputFilename !== REQUIRED_ARCHIVE_FILENAME) throw new Error(`output filename must be exactly ${REQUIRED_ARCHIVE_FILENAME}`);
  canonicalTimestamp(generatedAt, "generatedAt");
  const provenance = canonicalProvenance(provenanceInput);
  const normalizedPayload = normalizePayloadEntries(payloadEntries);
  const deploymentVerification = deploymentVerificationBinding(normalizedPayload, provenance);
  const generatedEntries = [
    { path: "13-package/README.md", data: Buffer.from(packageReadme(provenance)), source: "generated" },
    { path: "13-package/package-metadata.json", data: Buffer.from(stableJson({ schema: `${PACKAGE_SCHEMA}.package-metadata`, status: "PASS", generatedAt, provenance, deploymentVerification, humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION })), source: "generated" },
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
    schema: PACKAGE_SCHEMA,
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
    schema: DETACHED_SCHEMA,
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
      schema: PACKAGE_SCHEMA,
    },
    provenance,
    deploymentVerification,
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
  const [head, branch, status, parentLine, reports, localMain, originMain, originBranch, upstreamRef, upstreamHead, remoteUrl, liveText, acceptedAncestor, headMergedIntoMain] = await Promise.all([
    runGit(["rev-parse", "HEAD"], "Git HEAD"),
    runGit(["branch", "--show-current"], "Git branch"),
    runGit(["status", "--porcelain=v1", "--untracked-files=all"], "Git status"),
    runGit(["rev-list", "--parents", "-n", "1", "HEAD"], "Git direct parent"),
    runGit(["ls-files", "--", ...REPORT_SPECS.map(({ source }) => source)], "tracked Phase 6 reports"),
    runGit(["rev-parse", "main"], "local main"),
    runGit(["rev-parse", "origin/main"], "origin/main"),
    runGit(["rev-parse", `origin/${REQUIRED_BRANCH}`], "origin Phase 6 branch"),
    runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "Git upstream"),
    runGit(["rev-parse", "@{upstream}"], "Git upstream HEAD"),
    runGit(["remote", "get-url", "origin"], "origin URL"),
    runGit(["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${REQUIRED_BRANCH}`, "refs/heads/main"], "live origin refs"),
    gitSucceeds(["merge-base", "--is-ancestor", ACCEPTED_PHASE5B_SHA, options.expectedHead]),
    gitSucceeds(["merge-base", "--is-ancestor", options.expectedHead, "main"]),
  ]);
  if (head !== options.expectedHead) throw new Error(`Git HEAD ${head} differs from --expected-head ${options.expectedHead}`);
  if (branch !== REQUIRED_BRANCH || options.branch !== REQUIRED_BRANCH) throw new Error(`Git branch must be exactly ${REQUIRED_BRANCH}`);
  if (status) throw new Error("repository must be clean before Phase 6 review packaging");
  if (localMain !== FROZEN_MAIN_SHA) throw new Error(`local main must remain frozen at ${FROZEN_MAIN_SHA}`);
  if (originMain !== FROZEN_MAIN_SHA) throw new Error(`origin/main must remain frozen at ${FROZEN_MAIN_SHA}`);
  if (originBranch !== options.expectedHead || upstreamRef !== `origin/${REQUIRED_BRANCH}` || upstreamHead !== options.expectedHead) throw new Error("local/upstream Phase 6 branch parity differs");
  if (remoteUrl.replace(/\/$/, "") !== REQUIRED_REMOTE_URL) throw new Error(`origin URL must be exactly ${REQUIRED_REMOTE_URL}`);
  if (!acceptedAncestor) throw new Error(`accepted Phase 5B ${ACCEPTED_PHASE5B_SHA} is not an ancestor of Phase 6 HEAD`);
  if (headMergedIntoMain) throw new Error("Phase 6 HEAD is already merged into frozen main");
  const live = liveRefs(liveText);
  if (live.size !== 2 || live.get("refs/heads/main") !== FROZEN_MAIN_SHA || live.get(`refs/heads/${REQUIRED_BRANCH}`) !== options.expectedHead) {
    throw new Error("live origin main/Phase 6 refs differ from the frozen authorities");
  }
  const trackedReports = reports.split(/\r?\n/).filter(Boolean).sort(lexicalCompare);
  const expectedReports = REPORT_SPECS.map(({ source }) => source).sort(lexicalCompare);
  if (JSON.stringify(trackedReports) !== JSON.stringify(expectedReports)) throw new Error("the four Phase 6 markdown reports must be tracked");
  const parentFields = parentLine.split(/\s+/);
  if (parentFields[0] !== head || parentFields.length !== 2 || !HASH40.test(parentFields[1])) throw new Error("Phase 6 HEAD must have exactly one direct parent");
  return {
    schema: `${PACKAGE_SCHEMA}.git-provenance`,
    status: "PASS",
    branch,
    head,
    directParents: parentFields.slice(1),
    cleanTree: true,
    acceptedBase: ACCEPTED_PHASE5B_SHA,
    acceptedBaseAncestor: true,
    headMergedIntoMain: false,
    localMain: { ref: "refs/heads/main", head: localMain },
    originMain: { ref: "refs/remotes/origin/main", head: originMain },
    liveMain: { ref: "refs/heads/main", head: live.get("refs/heads/main") },
    upstream: { ref: upstreamRef, head: upstreamHead, liveHead: live.get(`refs/heads/${REQUIRED_BRANCH}`), parity: true },
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
  const args = [
    AUDITOR,
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
  try { result = JSON.parse(stdout); } catch { throw new Error("independent Phase 6 auditor returned invalid JSON"); }
  if (result.status !== "PASS" || result.schema !== `${AUDIT_SCHEMA}.result`) throw new Error("independent Phase 6 auditor did not pass");
  return result;
}

export async function assemblePackage(input) {
  const options = validateOptionShape(input);
  const output = await canonicalFuturePath(options.output, "--output");
  const evidenceRoot = await realpath(assertExternalPath(options.evidenceRoot, "--evidence-root"));
  if (isWithin(evidenceRoot, output)) throw new Error("output cannot be inside the evidence root");
  const siblings = siblingNames(output);
  await assertFreshOutputSet([output, siblings.manifest, siblings.audit]);
  const repository = await repositoryAuthority(options);
  const generatedAt = options.generatedAt;
  const provenance = {
    branch: REQUIRED_BRANCH,
    expectedHead: options.expectedHead,
    observedHead: repository.head,
    acceptedBase: ACCEPTED_PHASE5B_SHA,
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
      schema: `${PACKAGE_SCHEMA}.result`,
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
  const history = [{ commit: provenance.expectedHead, parents: [ACCEPTED_PHASE5B_SHA], subject: "Phase 6 fixture" }];
  return {
    schema: DEPLOYMENT_VERIFICATION_SCHEMA,
    status: "PASS",
    inputs: {
      expectedHead: provenance.expectedHead,
      acceptedBase: ACCEPTED_PHASE5B_SHA,
      expectedMain: FROZEN_MAIN_SHA,
      repository: REQUIRED_REPOSITORY,
      branch: REQUIRED_BRANCH,
      deploymentId: provenance.deployment.id,
      immutableUrl: provenance.deployment.immutableUrl,
      branchUrl: provenance.deployment.branchUrl,
      localDist: "dist",
    },
    repository: {
      status: "PASS",
      data: {
        repository: REQUIRED_REPOSITORY,
        branch: REQUIRED_BRANCH,
        head: provenance.expectedHead,
        acceptedBase: ACCEPTED_PHASE5B_SHA,
        directParent: ACCEPTED_PHASE5B_SHA,
        cleanTree: true,
        history,
        productionDelta: [],
        main: { branch: "main", headSha: FROZEN_MAIN_SHA, frozenAt: FROZEN_MAIN_SHA, containsPhase6Head: false },
        upstream: { ref: `origin/${REQUIRED_BRANCH}`, headSha: provenance.expectedHead, parity: true },
        liveRemote: { branchRef: `refs/heads/${REQUIRED_BRANCH}`, branchHeadSha: provenance.expectedHead, mainRef: "refs/heads/main", mainHeadSha: FROZEN_MAIN_SHA, parity: true },
      },
    },
    deployment: {
      status: "PASS",
      data: {
        authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
        checkRunId: "1",
        appSlug: "cloudflare-pages",
        completedAt: "2026-08-30T00:00:00.000Z",
        deploymentId: provenance.deployment.id,
        immutableUrl: provenance.deployment.immutableUrl,
        branchUrl: provenance.deployment.branchUrl,
        branch: REQUIRED_BRANCH,
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
    checks: REQUIRED_DEPLOYMENT_CHECKS,
    failures: [],
  };
}

export function selfTest() {
  const expectedHead = "a".repeat(40);
  const deploymentId = "12345678-1234-4234-8234-123456789abc";
  const provenance = { branch: REQUIRED_BRANCH, expectedHead, observedHead: expectedHead, acceptedBase: ACCEPTED_PHASE5B_SHA, expectedMain: FROZEN_MAIN_SHA, deployment: { id: deploymentId, immutableUrl: expectedImmutableUrl(deploymentId), branchUrl: REQUIRED_BRANCH_URL } };
  const entries = TOPOLOGY_SECTIONS.slice(0, -1).map((section, index) => ({ path: `${section}/fixture-${index}.json`, data: Buffer.from(`{"index":${index}}\n`) }));
  entries.push({ path: DEPLOYMENT_VERIFICATION_PATH, data: Buffer.from(stableJson(selfTestDeploymentVerification(provenance))) });
  const result = buildPackageArtifacts({ payloadEntries: entries, provenance, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: "2026-08-30T00:00:00.000Z" });
  return { schema: `${PACKAGE_SCHEMA}.self-test`, status: "PASS", archiveBytes: result.archiveBytes.length, entries: result.files.length + 1, maximumArchiveBytes: MAX_ARCHIVE_BYTES, topologySections: TOPOLOGY_SECTIONS.length };
}

function dryRunReport() {
  return {
    schema: `${PACKAGE_SCHEMA}.dry-run`,
    status: "READY",
    fixedAuthorities: { branch: REQUIRED_BRANCH, acceptedBase: ACCEPTED_PHASE5B_SHA, main: FROZEN_MAIN_SHA, branchUrl: REQUIRED_BRANCH_URL },
    dynamicInputs: ["expected HEAD", "Cloudflare deployment UUID", "matching immutable URL", "canonical generatedAt"],
    requiredDeploymentVerification: { path: DEPLOYMENT_VERIFICATION_PATH, schema: DEPLOYMENT_VERIFICATION_SCHEMA },
    requiredReports: REPORT_SPECS.map(({ source, archive }) => ({ source, archive })),
    topology: TOPOLOGY_SECTIONS,
    maximumArchiveBytes: MAX_ARCHIVE_BYTES,
  };
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/package-phase6-human-review.mjs \\",
    "    --evidence-root <external-distilled-evidence-directory> \\",
    `    --output <fresh-external>/${REQUIRED_ARCHIVE_FILENAME} --expected-head <sha40> \\`,
    `    --branch ${REQUIRED_BRANCH} --deployment-id <Cloudflare-UUID> \\`,
    `    --immutable-url https://<UUID-prefix>.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/ \\`,
    `    --branch-url ${REQUIRED_BRANCH_URL} --generated-at <canonical-ISO-timestamp>`,
    "",
    "The detached manifest and independent audit are emitted beside the ZIP using its filename stem.",
  ].join("\n"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.selfTest) { console.log(JSON.stringify(selfTest(), null, 2)); return; }
  if (options.dryRun) { console.log(JSON.stringify(dryRunReport(), null, 2)); return; }
  console.log(JSON.stringify(await assemblePackage(options), null, 2));
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
