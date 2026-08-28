#!/usr/bin/env node

/**
 * Assemble and independently audit the Phase 4-R2.1 human-review ZIP.
 *
 * This tool deliberately packages review evidence, not production sources or
 * masters. The final ZIP is required to live outside both the repository and
 * the operating-system temporary directory. All final Git, deployment, media,
 * and Blender-source identities are supplied explicitly on the command line
 * and are revalidated against the evidence and tracked authorities.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import {
  HUMAN_GATES,
  MAIN_SHA,
  RECORDINGS,
  REQUIRED_BRANCH,
  SCHEMA as EVIDENCE_SCHEMA,
  SHEETS,
  VIEWPOINTS,
  isWithin,
  sha256,
  stableJson,
} from "./phase4r2-1-evidence-contract.mjs";
import { validateActiveProductionManifest as validateProductionControllerManifest } from "./phase4r2-1-production.mjs";

const execFileAsync = promisify(execFile);
const PACKAGER = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(PACKAGER), "..");

export const PACKAGER_RELATIVE = "scripts/package-phase4r2-1-human-review.mjs";
export const BASE_SHA = "af0b196e2b1e81925c6cefdc477df6fcb94b4a41";
export const SOURCE_SHA256 = "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516";
export const ACTIVE_MEDIA_SCHEMA = "quantum-hub.phase-4-r2.production-media-manifest.v1";
export const PACKAGE_SCHEMA = "quantum-hub.phase-4-r2-1.causal-signal-scroll-stability-human-review-package.v1";
export const AUDIT_SCHEMA = `${PACKAGE_SCHEMA}.independent-audit`;
export const RESULT_SCHEMA = `${PACKAGE_SCHEMA}.detached-result`;
export const ARCHIVE_FILENAME = "phase-4r2-1-causal-signal-scroll-stability-human-review.zip";
export const DETACHED_MANIFEST_FILENAME = "phase-4r2-1-causal-signal-scroll-stability-human-review-manifest.json";
export const AUDIT_FILENAME = "phase-4r2-1-causal-signal-scroll-stability-human-review-audit.json";
export const RESULT_FILENAME = "phase-4r2-1-causal-signal-scroll-stability-human-review-result.json";
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const README_FILENAME = "README.md";
export const FIXED_EPOCH = "1980-01-01T00:00:00.000Z";

export const AUTHORIZATION = Object.freeze({
  humanAccepted: false,
  mainMerged: false,
  phase5Authorized: false,
});

export const EVIDENCE_REPORT_SCHEMAS = Object.freeze({
  "reports/first-input.json": "quantum-hub.phase-4-r2-1.first-input-evidence.v1",
  "reports/current-order.json": "quantum-hub.phase-4-r2-1.current-order-evidence.v1",
  "reports/automatic-wake.json": "quantum-hub.phase-4-r2-1.automatic-wake-evidence.v1",
  "reports/timeout-geometry.json": "quantum-hub.phase-4-r2-1.timeout-geometry-evidence.v1",
  "reports/responsive.json": "quantum-hub.phase-4-r2-1.responsive-evidence.v1",
  "reports/codec-network-performance.json": "quantum-hub.phase-4-r2-1.codec-network-performance-evidence.v1",
  "reports/accessibility-fallback.json": "quantum-hub.phase-4-r2-1.accessibility-fallback-evidence.v1",
  "reports/operating-field-regression.json": "quantum-hub.phase-4-r2-1.operating-field-regression-evidence.v1",
  "reports/git-deployment-provenance.json": "quantum-hub.phase-4-r2-1.git-deployment-provenance-evidence.v1",
  "reports/phase4r2-1-browser-evidence-manifest.json": EVIDENCE_SCHEMA,
});

export const AUTHORITY_REPORT_SCHEMAS = Object.freeze({
  "authority/signal-root-cause-matrix.json": "quantum-hub.phase-4-r2-1.review-authority.signal-root-cause.v1",
  "authority/blender-source-delta.json": "quantum-hub.phase-4-r2-1.review-authority.blender-source-delta.v1",
  "authority/current-mask-order.json": "quantum-hub.phase-4-r2-1.review-authority.current-mask-order.v1",
  "authority/automatic-reaction-state-machine.json": "quantum-hub.phase-4-r2-1.review-authority.automatic-reaction-state-machine.v1",
  "authority/scroll-mapping.json": "quantum-hub.phase-4-r2-1.review-authority.scroll-mapping.v1",
  "authority/h264-production-media-manifest.json": "quantum-hub.phase-4-r2-1.review-authority.h264-production-media-manifest.v1",
});

export const EXPECTED_COUNTS = Object.freeze({
  sheets: 17,
  recordings: 17,
  evidenceReports: 10,
  authorityReports: 6,
  reports: 16,
  payloads: 50,
  archiveEntries: 52,
});

const EXPECTED_EVIDENCE_MANIFEST_RELATIVE = "reports/phase4r2-1-browser-evidence-manifest.json";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4"]);
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv", ".svg"]);
const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const PRIVATE_OR_SECRET_TEXT = /(?:[a-z]:[\\/]users[\\/]|(?:^|[^a-z])onedrive(?:[^a-z]|$)|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization|bearer)\s*[:=]\s*["']?[a-z0-9_./+:-]{12,})/i;
const FORBIDDEN_ENTRY = /(?:^|\/)(?:raw|masters?|frames?|receipts?|logs?|cache|caches|quarantine|rejected|candidates?|candidate-ladder|browser-recorder|autosaves?|__pycache__|node_modules|\.git)(?:\/|$)|(?:^|\/)\.(?:env|ds_store)(?:\.|$)|\.(?:blend\d*|exr|tiff?|mov|webm|mkv|avi|zip|7z|rar|pem|key|p12|pfx|log)$/i;
const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_unused, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
}));

const AUTHORITY_DEFAULTS = Object.freeze({
  rootCauseReport: "artifacts/reports/phase-4r2-1/phase-4r2-1-signal-root-cause-matrix.json",
  sourceBuildReport: "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/source/phase4r2-1-current-source-build.json",
  sourceAuditReport: "artifacts/reports/phase-4r2-1/phase-4r2-1-source-signal-audit.json",
  currentReport: "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/review/diagnostics/iteration-02-report.json",
  mappingReport: "artifacts/reports/phase-4r2-1/phase-4r2-1-current-mapping-report.json",
  reactionReport: "artifacts/reports/phase-4r2-1-cinematic-reaction-state-machine.md",
});

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    evidenceRoot: null,
    evidenceManifest: null,
    mediaManifest: null,
    deploymentReport: null,
    expectedHead: null,
    expectedParent: null,
    expectedSourceSha256: null,
    expectedManifestSha256: null,
    expectedDeploymentId: null,
    immutableUrl: null,
    branchUrl: null,
    expectedBranch: REQUIRED_BRANCH,
    output: null,
    auditExisting: null,
    detachedManifest: null,
    auditOutput: null,
    ffmpeg: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobe: process.env.FFPROBE_PATH ?? "ffprobe",
    dryRun: false,
    selfTest: false,
    help: false,
    ...Object.fromEntries(Object.entries(AUTHORITY_DEFAULTS).map(([key, value]) => [key, path.resolve(ROOT, ...value.split("/"))])),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--evidence-root") options.evidenceRoot = path.resolve(next());
    else if (argument === "--evidence-manifest") options.evidenceManifest = path.resolve(next());
    else if (argument === "--media-manifest") options.mediaManifest = path.resolve(next());
    else if (argument === "--deployment-report") options.deploymentReport = path.resolve(next());
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-parent") options.expectedParent = next().toLowerCase();
    else if (argument === "--expected-source-sha256") options.expectedSourceSha256 = next().toLowerCase();
    else if (argument === "--expected-manifest-sha256") options.expectedManifestSha256 = next().toLowerCase();
    else if (argument === "--expected-deployment-id") options.expectedDeploymentId = next();
    else if (argument === "--immutable-url") options.immutableUrl = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--expected-branch") options.expectedBranch = next();
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--audit-existing") options.auditExisting = path.resolve(next());
    else if (argument === "--manifest") options.detachedManifest = path.resolve(next());
    else if (argument === "--audit-output") options.auditOutput = path.resolve(next());
    else if (argument === "--root-cause-report") options.rootCauseReport = path.resolve(next());
    else if (argument === "--source-build-report") options.sourceBuildReport = path.resolve(next());
    else if (argument === "--source-audit-report") options.sourceAuditReport = path.resolve(next());
    else if (argument === "--current-report") options.currentReport = path.resolve(next());
    else if (argument === "--mapping-report") options.mappingReport = path.resolve(next());
    else if (argument === "--reaction-report") options.reactionReport = path.resolve(next());
    else if (argument === "--ffmpeg") options.ffmpeg = next();
    else if (argument === "--ffprobe") options.ffprobe = next();
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (options.evidenceRoot && !options.evidenceManifest) options.evidenceManifest = path.join(options.evidenceRoot, ...EXPECTED_EVIDENCE_MANIFEST_RELATIVE.split("/"));
  return options;
}

function normalizedOrigin(value, flag) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${flag} must be an absolute HTTPS origin URL`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || /^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(url.hostname)) {
    throw new Error(`${flag} must be a credential-free non-loopback HTTPS origin root`);
  }
  return url.toString();
}

export function validateOptionShape(options, mode = "build") {
  if (!HASH40.test(options.expectedHead ?? "")) throw new Error("--expected-head must be an exact lowercase 40-hex commit");
  if (!HASH40.test(options.expectedParent ?? "")) throw new Error("--expected-parent must be an exact lowercase 40-hex commit");
  if (!HASH64.test(options.expectedSourceSha256 ?? "") || options.expectedSourceSha256 !== SOURCE_SHA256) throw new Error(`--expected-source-sha256 must equal ${SOURCE_SHA256}`);
  if (!HASH64.test(options.expectedManifestSha256 ?? "")) throw new Error("--expected-manifest-sha256 must be exact lowercase 64-hex");
  if (options.expectedBranch !== REQUIRED_BRANCH) throw new Error(`--expected-branch must equal ${REQUIRED_BRANCH}`);
  if (!/^[a-z0-9][a-z0-9._:-]{5,127}$/i.test(options.expectedDeploymentId ?? "")) throw new Error("--expected-deployment-id is absent or malformed");
  options.immutableUrl = normalizedOrigin(options.immutableUrl, "--immutable-url");
  options.branchUrl = normalizedOrigin(options.branchUrl, "--branch-url");
  if (options.immutableUrl === options.branchUrl) throw new Error("immutable and branch URLs must be distinct identities");
  if (mode === "build") {
    for (const [key, flag] of [["evidenceRoot", "--evidence-root"], ["evidenceManifest", "--evidence-manifest"], ["mediaManifest", "--media-manifest"], ["deploymentReport", "--deployment-report"], ["output", "--output"]]) {
      if (!options[key]) throw new Error(`${flag} is required`);
    }
    if (path.basename(options.output) !== ARCHIVE_FILENAME) throw new Error(`--output basename must be exactly ${ARCHIVE_FILENAME}`);
    if (path.basename(options.evidenceManifest) !== path.posix.basename(EXPECTED_EVIDENCE_MANIFEST_RELATIVE)) throw new Error("evidence manifest basename differs from capture contract");
  } else if (mode === "audit") {
    if (!options.auditExisting || !options.detachedManifest) throw new Error("audit requires --audit-existing and --manifest");
    if (path.basename(options.auditExisting) !== ARCHIVE_FILENAME || path.basename(options.detachedManifest) !== DETACHED_MANIFEST_FILENAME) throw new Error("audit archive/manifest basename differs");
    if (path.dirname(options.auditExisting) !== path.dirname(options.detachedManifest)) throw new Error("audit archive and detached manifest must be siblings");
  }
  return options;
}

function printHelp() {
  const lines = [
    "Phase 4-R2.1 human-review package builder and independent auditor",
    "",
    "Build:",
    "  node " + PACKAGER_RELATIVE,
    "    --evidence-root <durable-external-capture-root>",
    "    --media-manifest <tracked-active-manifest.json>",
    "    --deployment-report <capture-root\\reports\\git-deployment-provenance.json>",
    "    --expected-head <40-hex> --expected-parent <40-hex>",
    "    --expected-source-sha256 <64-hex> --expected-manifest-sha256 <64-hex>",
    "    --expected-deployment-id <id> --immutable-url <https-origin/> --branch-url <https-origin/>",
    "    --output <durable-external/" + ARCHIVE_FILENAME + ">",
    "",
    "Independent audit:",
    "  node " + PACKAGER_RELATIVE + " --audit-existing <" + ARCHIVE_FILENAME + ">",
    "    --manifest <" + DETACHED_MANIFEST_FILENAME + "> [same exact authority arguments]",
    "",
    "Optional authority-path overrides are available for root cause, source build,",
    "source audit, current diagnostic, mapping, and reaction reports. --dry-run",
    "validates the full CLI identity contract without reading or writing files.",
    "--self-test runs deterministic positive and negative packaging tests.",
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

function lexicalCompare(left, right) { return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")); }

export function safeRelativePath(value, label = "path") {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) throw new Error(`${label} must be a portable relative path`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`${label} is unsafe: ${value}`);
  return value;
}

function resolveUnder(root, relative, label = "path") {
  safeRelativePath(relative, label);
  const resolved = path.resolve(root, ...relative.split("/"));
  if (!isWithin(root, resolved) || resolved === path.resolve(root)) throw new Error(`${label} escapes its root`);
  return resolved;
}

export function assertExternalPath(candidate, label = "path") {
  const resolved = path.resolve(candidate);
  if (isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved) || path.parse(resolved).root === resolved) throw new Error(`${label} must be durable, external to the repository and temporary directory, and not a drive root`);
  return resolved;
}

export function assertDurableReviewLocation(candidate, label = "review package") {
  const resolved = assertExternalPath(candidate, label);
  const requiredDirectory = path.resolve(ROOT, "..");
  if (path.dirname(resolved) !== requiredDirectory) throw new Error(`${label} must be written directly beside the Qsite1 repository in its durable document directory`);
  return resolved;
}

async function canonicalFuturePath(candidate) {
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

async function atomicWrite(destination, bytes) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try { await rename(temporary, destination); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

async function run(command, args, label, maxBuffer = 30_000_000) {
  try { return await execFileAsync(command, args, { windowsHide: true, maxBuffer }); }
  catch (error) { throw new Error(`${label} failed: ${String(error.stderr || error.message).slice(-3_000)}`); }
}

async function executable(command) {
  try { await run(command, ["-version"], `${command} version`, 300_000); return true; }
  catch { return false; }
}

async function git(...args) { return (await run("git", args, "Git package authority", 2_000_000)).stdout.trim(); }

function repoRelative(file, label) {
  const relative = path.relative(ROOT, path.resolve(file)).replaceAll("\\", "/");
  if (!relative || relative.startsWith("../") || path.posix.isAbsolute(relative)) throw new Error(`${label} must be inside the repository`);
  return safeRelativePath(relative, label);
}

async function repositoryAuthority(options, authorityFiles) {
  const relatives = [PACKAGER_RELATIVE, "scripts/phase4r2-1-evidence-contract.mjs", "scripts/capture-phase4r2-1-browser-evidence.mjs", ...authorityFiles.map((file, index) => repoRelative(file, `authority input ${index}`))];
  const [head, parent, branch, main, statusText, upstream, liveRemote, ...tracked] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("rev-parse", "HEAD^"),
    git("branch", "--show-current"),
    git("rev-parse", "main"),
    git("status", "--short"),
    git("rev-parse", "@{upstream}"),
    git("ls-remote", "--heads", "origin", options.expectedBranch),
    ...relatives.map((relative) => git("ls-files", "--error-unmatch", "--", relative)),
  ]);
  const liveHead = liveRemote.split(/\s+/)[0] ?? "";
  if (head !== options.expectedHead || parent !== options.expectedParent || branch !== options.expectedBranch || main !== MAIN_SHA || statusText || upstream !== head || liveHead !== head) {
    throw new Error("final local/upstream/live-remote/main/clean Git authority differs from CLI bindings");
  }
  for (const [index, actual] of tracked.entries()) if (actual.replaceAll("\\", "/") !== relatives[index]) throw new Error(`required package authority is not tracked: ${relatives[index]}`);
  const chain = (await git("rev-list", "--reverse", `${BASE_SHA}..${head}`)).split(/\r?\n/).filter(Boolean);
  if (!chain.length || chain.at(-1) !== head) throw new Error("R2.1 commit chain is absent or does not terminate at exact HEAD");
  return { branch, head, parent, base: BASE_SHA, commitChain: chain, clean: true, upstreamHead: upstream, liveRemoteHead: liveHead, main: { head: main, requiredHead: MAIN_SHA }, trackedInputs: relatives };
}

export function assertNoPrivateText(bytes, relativePath) {
  if (PRIVATE_OR_SECRET_TEXT.test(String(relativePath))) throw new Error(`privacy/secrets scan failed in package path: ${relativePath}`);
  if (TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase()) && PRIVATE_OR_SECRET_TEXT.test(Buffer.from(bytes).toString("utf8"))) throw new Error(`privacy/secrets scan failed in human-readable payload: ${relativePath}`);
}

export function assertAllowedEntry(relativePath) {
  safeRelativePath(relativePath, "package entry");
  if (FORBIDDEN_ENTRY.test(relativePath)) throw new Error(`forbidden raw/rejected/source/cache/secret payload: ${relativePath}`);
  const top = relativePath.split("/")[0];
  if (!["authority", "recordings", "reports", "sheets", README_FILENAME, IN_ARCHIVE_MANIFEST].includes(top)) throw new Error(`package entry is outside the exact review surface: ${relativePath}`);
  if (/\.(?:webm)$/i.test(relativePath) || /(?:^|[-_.])vp9(?:[-_.]|$)/i.test(path.basename(relativePath))) throw new Error(`VP9/rejected media payload is forbidden: ${relativePath}`);
}

async function recursiveFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) throw new Error(`symlink/reparse evidence entry is forbidden: ${full}`);
      if (info.isDirectory()) await visit(full);
      else if (info.isFile()) files.push(path.relative(root, full).replaceAll("\\", "/"));
      else throw new Error(`non-regular evidence entry: ${full}`);
    }
  }
  await visit(root);
  return files.sort(lexicalCompare);
}

async function fileAuthority(file) {
  const bytes = await readFile(file);
  return { bytes, byteSize: bytes.length, sha256: sha256(bytes) };
}

function exactHumanGates(value) {
  if (stableJson(value) !== stableJson(HUMAN_GATES) || Object.keys(value ?? {}).length !== 5 || Object.values(value ?? {}).some((state) => state !== "PENDING HUMAN REVIEW")) throw new Error("all five human gates must be exact PENDING HUMAN REVIEW values");
}

function deniedAuthorization(value, label, exact = false) {
  if (!value || value.humanAccepted !== false || value.mainMerged !== false || value.phase5Authorized !== false) throw new Error(`${label} must deny human acceptance, main merge, and Phase 5`);
  if (exact && JSON.stringify(value) !== JSON.stringify(AUTHORIZATION)) throw new Error(`${label} has unexpected authorization fields`);
}

function firstDefined(source, paths) {
  for (const segments of paths) {
    let value = source;
    for (const segment of segments) value = value?.[segment];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function exactEvidencePaths() {
  return [
    ...RECORDINGS.map(({ id }) => `recordings/${id}.mp4`),
    ...SHEETS.map(({ id }) => `sheets/${id}.png`),
    ...Object.keys(EVIDENCE_REPORT_SCHEMAS),
  ].sort(lexicalCompare);
}

function expectedArtifactPaths() {
  return exactEvidencePaths().filter((relative) => relative !== EXPECTED_EVIDENCE_MANIFEST_RELATIVE);
}

function viewpointById(id) {
  const found = VIEWPOINTS.find((viewpoint) => viewpoint.id === id);
  if (!found) throw new Error(`unknown recording viewpoint: ${id}`);
  return found;
}

function evidenceIdentity(manifest) {
  return {
    head: firstDefined(manifest, [["target", "head"], ["target", "expectedHead"], ["repository", "head"], ["repository", "headSha"]]),
    branch: firstDefined(manifest, [["target", "branch"], ["repository", "branch"]]),
    immutableUrl: firstDefined(manifest, [["target", "url"], ["target", "immutableUrl"], ["deployment", "immutableUrl"]]),
    branchUrl: firstDefined(manifest, [["target", "branchUrl"], ["deployment", "branchUrl"]]),
    sourceSha256: firstDefined(manifest, [["activeMedia", "sourceBlendSha256"], ["activeMedia", "source", "sha256"]]),
    manifestSha256: firstDefined(manifest, [["activeMedia", "manifest", "sha256"], ["activeMedia", "manifestSha256"]]),
    deploymentId: firstDefined(manifest, [["deployment", "deploymentId"], ["deployment", "id"]]),
    main: firstDefined(manifest, [["repository", "main", "head"], ["repository", "main", "headSha"]]),
  };
}

export function validateEvidenceManifestStructure(manifest, bindings) {
  if (manifest?.schema !== EVIDENCE_SCHEMA || manifest.status !== "PASS") throw new Error("browser evidence manifest schema/status differs");
  exactHumanGates(manifest.humanReviewGates);
  deniedAuthorization(manifest.authorization, "browser evidence authorization");
  const identity = evidenceIdentity(manifest);
  if (identity.head !== bindings.expectedHead || identity.branch !== bindings.expectedBranch || identity.immutableUrl !== bindings.immutableUrl || identity.branchUrl !== bindings.branchUrl
    || identity.sourceSha256 !== bindings.expectedSourceSha256 || identity.manifestSha256 !== bindings.expectedManifestSha256 || identity.deploymentId !== bindings.expectedDeploymentId || identity.main !== MAIN_SHA) {
    throw new Error(`browser evidence identity differs from exact CLI authority: ${JSON.stringify(identity)}`);
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 43 || new Set(manifest.artifacts.map((item) => item.relativePath)).size !== 43) throw new Error("evidence manifest must bind exactly 43 non-self artifacts");
  const artifactPaths = manifest.artifacts.map((item) => safeRelativePath(item.relativePath, "evidence artifact")).sort(lexicalCompare);
  if (JSON.stringify(artifactPaths) !== JSON.stringify(expectedArtifactPaths())) throw new Error("evidence artifact inventory differs from exact recordings/sheets/reports contract");
  for (const item of manifest.artifacts) {
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 1 || !HASH64.test(item.sha256 ?? "") || !["recording", "sheet", "report"].includes(item.kind)) throw new Error(`evidence artifact authority malformed: ${item.relativePath}`);
  }
  if (!Array.isArray(manifest.recordings) || manifest.recordings.length !== RECORDINGS.length) throw new Error("evidence recording ledger differs");
  const recordingById = new Map(manifest.recordings.map((item) => [item.id, item]));
  for (const contract of RECORDINGS) {
    const item = recordingById.get(contract.id);
    const relativePath = `recordings/${contract.id}.mp4`;
    if (!item || item.gate !== contract.gate || item.kind !== contract.kind || item.viewpoint !== contract.viewpoint || item.relativePath !== relativePath || item.status !== "PASS" || item.fullDecodePass !== true
      || !Number.isSafeInteger(item.expectedFrameCount) || item.expectedFrameCount < 2 || item.media?.frameCount !== item.expectedFrameCount) throw new Error(`evidence recording contract differs: ${contract.id}`);
  }
  if (!Array.isArray(manifest.sheets) || manifest.sheets.length !== SHEETS.length) throw new Error("evidence sheet ledger differs");
  const sheetByPath = new Map(manifest.sheets.map((item) => [item.relativePath, item]));
  for (const contract of SHEETS) {
    const relativePath = `sheets/${contract.id}.png`;
    const item = sheetByPath.get(relativePath);
    if (!item || !Number.isInteger(item.width) || item.width < 1 || !Number.isInteger(item.height) || item.height < 1) throw new Error(`evidence sheet contract differs: ${contract.id}`);
  }
  const counts = manifest.summary ?? manifest.captureContract?.counts ?? {};
  for (const [key, expected] of [["recordings", 17], ["sheets", 17]]) if (counts[key] !== undefined && counts[key] !== expected) throw new Error(`evidence summary ${key} differs`);
  return identity;
}

async function resolveEvidence(options) {
  assertExternalPath(options.evidenceRoot, "evidence root");
  const root = await realpath(options.evidenceRoot);
  assertExternalPath(root, "resolved evidence root");
  const expectedManifestPath = resolveUnder(root, EXPECTED_EVIDENCE_MANIFEST_RELATIVE, "evidence manifest");
  if (await realpath(options.evidenceManifest) !== await realpath(expectedManifestPath)) throw new Error("--evidence-manifest must be the exact manifest under --evidence-root");
  const manifestAuthority = await fileAuthority(expectedManifestPath);
  const manifest = JSON.parse(manifestAuthority.bytes.toString("utf8"));
  validateEvidenceManifestStructure(manifest, options);
  const actualFiles = await recursiveFiles(root);
  if (JSON.stringify(actualFiles) !== JSON.stringify(exactEvidencePaths())) throw new Error("evidence root contains missing or unmanifested files");
  const byPath = new Map();
  for (const record of manifest.artifacts) {
    const authority = await fileAuthority(resolveUnder(root, record.relativePath, "evidence payload"));
    if (authority.byteSize !== record.bytes || authority.sha256 !== record.sha256) throw new Error(`evidence hash/size mismatch: ${record.relativePath}`);
    byPath.set(record.relativePath, { ...authority, record });
  }
  byPath.set(EXPECTED_EVIDENCE_MANIFEST_RELATIVE, { ...manifestAuthority, record: { relativePath: EXPECTED_EVIDENCE_MANIFEST_RELATIVE, kind: "report", bytes: manifestAuthority.byteSize, sha256: manifestAuthority.sha256 } });
  return { root, manifest, manifestAuthority, byPath };
}

export function validateActiveMediaManifest(manifest, expectedSourceSha256 = SOURCE_SHA256) {
  if (manifest?.schema !== ACTIVE_MEDIA_SCHEMA || manifest.status !== "PASS" || manifest.sourceBlendSha256 !== expectedSourceSha256) throw new Error("active H.264 media manifest schema/status/source differs");
  if (manifest.physicalTimeline?.frames !== 500 || manifest.physicalTimeline?.fps !== 30) throw new Error("active media physical timeline differs");
  if (manifest.deliveryPolicy?.h264Only !== true || manifest.deliveryPolicy?.activeVideoCount !== 3 || manifest.deliveryPolicy?.activePosterCount !== 3 || manifest.deliveryPolicy?.inactiveCodecPayloadCount !== 0) throw new Error("active media H.264-only delivery policy differs");
  if (manifest.authorization?.mergeMain !== false || manifest.authorization?.phase5 !== false) throw new Error("active media authorization denials differ");
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== 6 || new Set(manifest.assets.map((asset) => asset.file)).size !== 6) throw new Error("active media manifest must contain exactly six unique assets");
  for (const family of ["desktop", "portrait", "landscape"]) {
    const video = manifest.assets.filter((asset) => asset.kind === "video" && asset.family === family);
    const poster = manifest.assets.filter((asset) => asset.kind === "poster" && asset.family === family);
    if (video.length !== 1 || video[0].codec !== "h264" || !/^media\/[a-z0-9._-]+\.mp4$/i.test(video[0].file) || video[0].frames !== 500 || video[0].fps !== 30 || !Number.isSafeInteger(video[0].bytes) || !HASH64.test(video[0].sha256 ?? "")) throw new Error(`${family} active H.264 video differs`);
    if (poster.length !== 1 || !/^posters\/[a-z0-9._-]+\.png$/i.test(poster[0].file) || !Number.isSafeInteger(poster[0].bytes) || !HASH64.test(poster[0].sha256 ?? "")) throw new Error(`${family} active poster differs`);
  }
  if (/(?:vp9|webm)/i.test(JSON.stringify(manifest))) throw new Error("active media manifest contains VP9/WebM authority");
  validateProductionControllerManifest(manifest);
  return true;
}

function deploymentIdentity(report) {
  return {
    heads: [
      firstDefined(report, [["repository", "head"], ["repository", "headSha"]]),
      firstDefined(report, [["deployment", "expectedHead"], ["deployment", "exactHead"], ["deployment", "head"]]),
      firstDefined(report, [["cloudflare", "commitHash"], ["cloudflare", "head"]]),
    ].filter(Boolean),
    branch: firstDefined(report, [["repository", "branch"], ["cloudflare", "branch"]]),
    main: firstDefined(report, [["repository", "main", "head"], ["repository", "main", "headSha"], ["github", "main", "headSha"]]),
    immutableUrl: firstDefined(report, [["deployment", "immutableUrl"], ["cloudflare", "deploymentUrl"]]),
    branchUrl: firstDefined(report, [["deployment", "branchUrl"]]),
    deploymentId: firstDefined(report, [["cloudflare", "deploymentId"], ["deployment", "deploymentId"], ["deployment", "id"]]),
    sourceSha256: firstDefined(report, [["productionManifest", "sourceBlendSha256"], ["productionManifest", "sourceSha256"], ["activeProductionManifest", "sourceBlendSha256"]]),
    manifestSha256: firstDefined(report, [["productionManifest", "sha256"], ["activeProductionManifest", "sha256"], ["deployment", "immutable", "manifest", "sha256"]]),
  };
}

export function validateDeploymentReport(report, bindings) {
  if (report?.status !== "PASS" || !/^quantum-hub\.phase-4-r2-1\.[a-z0-9.-]+\.v1$/i.test(report.schema ?? "")) throw new Error("deployment report schema/status differs");
  const identity = deploymentIdentity(report);
  if (identity.heads.length < 2 || identity.heads.some((head) => head !== bindings.expectedHead) || identity.branch !== bindings.expectedBranch || identity.main !== MAIN_SHA
    || identity.immutableUrl !== bindings.immutableUrl || identity.branchUrl !== bindings.branchUrl || identity.deploymentId !== bindings.expectedDeploymentId
    || identity.sourceSha256 !== bindings.expectedSourceSha256 || identity.manifestSha256 !== bindings.expectedManifestSha256) throw new Error(`deployment identity differs from exact CLI bindings: ${JSON.stringify(identity)}`);
  if (report.authorization?.phase5Authorized !== false || report.authorization?.mainMerged !== false) throw new Error("deployment report Phase 5/main denial differs");
  return identity;
}

async function loadJsonAuthority(file, expectedSchema, label) {
  const authority = await fileAuthority(file);
  const value = JSON.parse(authority.bytes.toString("utf8"));
  if (value.schema !== expectedSchema || value.status !== "PASS") throw new Error(`${label} schema/PASS differs`);
  return { ...authority, value, repositoryPath: repoRelative(file, label) };
}

async function resolveAuthorities(options) {
  const mediaAuthority = await fileAuthority(options.mediaManifest);
  if (mediaAuthority.sha256 !== options.expectedManifestSha256) throw new Error("active media manifest hash differs from --expected-manifest-sha256");
  const mediaManifest = JSON.parse(mediaAuthority.bytes.toString("utf8"));
  validateActiveMediaManifest(mediaManifest, options.expectedSourceSha256);

  const deploymentAuthority = await fileAuthority(options.deploymentReport);
  const deploymentReport = JSON.parse(deploymentAuthority.bytes.toString("utf8"));
  const deployment = validateDeploymentReport(deploymentReport, options);

  const rootCause = await loadJsonAuthority(options.rootCauseReport, "quantum-hub.phase-4-r2-1.signal-root-cause-matrix.v1", "root-cause report");
  if (!Array.isArray(rootCause.value.matrix) || rootCause.value.matrix.length !== 4 || rootCause.value.layerConclusions?.sourceRepairRequired !== true) throw new Error("root-cause report does not prove the narrow source repair");
  const sourceBuild = await loadJsonAuthority(options.sourceBuildReport, "quantum-hub.phase-4-r2-1.current-source-build.v1", "source-build report");
  const derivativeHash = firstDefined(sourceBuild.value, [["derivative", "sha256"], ["derivative", "file", "sha256"]]);
  if (derivativeHash !== options.expectedSourceSha256 || !Array.isArray(sourceBuild.value.mutations?.whitelist)
    || sourceBuild.value.authorization?.fullOrPartialProductionRenderStarted !== false
    || sourceBuild.value.authorization?.encodingStarted !== false
    || sourceBuild.value.authorization?.runtimeIntegrationStartedByThisScript !== false
    || sourceBuild.value.authorization?.phase5Authorized !== false) throw new Error("source-build whitelist/hash/authorization differs");
  const sourceAudit = await loadJsonAuthority(options.sourceAuditReport, "quantum-hub.phase-4-r2-1.source-signal-audit.v1", "source signal audit");
  if (!sourceAudit.value.families?.desktop?.physicalRanges || sourceAudit.value.conclusion?.sourceRepairRequired !== true) throw new Error("source signal audit loop ranges/conclusion differ");
  const current = await loadJsonAuthority(options.currentReport, "quantum-hub.phase-4-r2-1.current-diagnostic.v1", "current diagnostic");
  if (firstDefined(current.value, [["source", "sha256"], ["source", "blendSha256"]]) !== options.expectedSourceSha256 || !Array.isArray(current.value.coverage)
    || current.value.coverage.some((item) => item.darkCount !== 0 || item.allSegmentsEnergized !== true || item.routeOrderContiguous !== true)) throw new Error("current diagnostic source/arrival coverage differs");
  const mapping = await loadJsonAuthority(options.mappingReport, "quantum-hub.phase-4-r2-1.current-mapping-diagnosis.v1", "scroll mapping report");
  const reactionAuthority = await fileAuthority(options.reactionReport);
  const reactionText = reactionAuthority.bytes.toString("utf8");
  for (const required of ["F285", "F370", "wake-forward", "wake-reverse", "latest-wins", "requestVideoFrameCallback"]) if (!reactionText.includes(required)) throw new Error(`automatic reaction report omits ${required}`);
  const reaction = { ...reactionAuthority, value: reactionText, repositoryPath: repoRelative(options.reactionReport, "reaction report") };
  const media = { ...mediaAuthority, value: mediaManifest, repositoryPath: repoRelative(options.mediaManifest, "media manifest") };
  return { media, deploymentAuthority, deploymentReport, deployment, rootCause, sourceBuild, sourceAudit, current, mapping, reaction };
}

async function validateImage(bytes, label) {
  const image = sharp(bytes, { failOn: "error" });
  const metadata = await image.metadata();
  await image.raw().toBuffer();
  if (!metadata.width || !metadata.height || !IMAGE_EXTENSIONS.has(`.${metadata.format}`)) throw new Error(`image full-decode/format failed: ${label}`);
  return { width: metadata.width, height: metadata.height, format: metadata.format, fullDecodePass: true };
}

async function probeVideo(ffprobe, file) {
  const result = await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=format_name,duration", "-of", "json", file], "ffprobe package recording");
  const parsed = JSON.parse(result.stdout);
  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  return {
    formatName: parsed.format?.format_name ?? null,
    durationSeconds: Number(parsed.format?.duration),
    codec: video?.codec_name ?? null,
    pixelFormat: video?.pix_fmt ?? null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    averageFrameRate: video?.avg_frame_rate ?? null,
    realFrameRate: video?.r_frame_rate ?? null,
    frameCount: Number(video?.nb_read_frames),
    videoStreamCount: streams.filter((stream) => stream.codec_type === "video").length,
    audioStreamCount: streams.filter((stream) => stream.codec_type === "audio").length,
    otherStreamCount: streams.filter((stream) => !["video", "audio"].includes(stream.codec_type)).length,
  };
}

export function assertVideoProbeContract(probe, expectedFrameCount, expectedViewport, label = "video") {
  if (!String(probe.formatName ?? "").split(",").includes("mp4") || probe.videoStreamCount !== 1 || probe.audioStreamCount !== 0 || probe.otherStreamCount !== 0
    || probe.codec !== "h264" || probe.pixelFormat !== "yuv420p" || probe.averageFrameRate !== "30/1" || probe.realFrameRate !== "30/1"
    || probe.frameCount !== expectedFrameCount || probe.width !== expectedViewport.width || probe.height !== expectedViewport.height) throw new Error(`recording media/frame contract differs: ${label} ${JSON.stringify(probe)}`);
  return true;
}

async function validateVideo(ffmpeg, ffprobe, file, expectedFrameCount, expectedViewport, label) {
  const probe = await probeVideo(ffprobe, file);
  await run(ffmpeg, ["-v", "error", "-i", file, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], `full decode ${label}`);
  assertVideoProbeContract(probe, expectedFrameCount, expectedViewport, label);
  return { ...probe, fullDecodePass: true };
}

function authorityRecord(authority) {
  return { repositoryPath: authority.repositoryPath, byteSize: authority.byteSize, sha256: authority.sha256, schema: authority.value?.schema ?? null, status: authority.value?.status ?? null };
}

function authorityPayloads(authorities, options) {
  const common = { status: "PASS", finalBlenderSourceSha256: options.expectedSourceSha256, humanReviewGates: HUMAN_GATES, authorization: AUTHORIZATION };
  return new Map([
    ["authority/signal-root-cause-matrix.json", {
      schema: AUTHORITY_REPORT_SCHEMAS["authority/signal-root-cause-matrix.json"], ...common,
      source: authorityRecord(authorities.rootCause), facts: authorities.rootCause.value,
    }],
    ["authority/blender-source-delta.json", {
      schema: AUTHORITY_REPORT_SCHEMAS["authority/blender-source-delta.json"], ...common,
      source: authorityRecord(authorities.sourceBuild), facts: authorities.sourceBuild.value,
    }],
    ["authority/current-mask-order.json", {
      schema: AUTHORITY_REPORT_SCHEMAS["authority/current-mask-order.json"], ...common,
      sources: [authorityRecord(authorities.sourceAudit), authorityRecord(authorities.current)],
      sourceSignalAudit: authorities.sourceAudit.value,
      finalCurrentDiagnostic: authorities.current.value,
    }],
    ["authority/automatic-reaction-state-machine.json", {
      schema: AUTHORITY_REPORT_SCHEMAS["authority/automatic-reaction-state-machine.json"], ...common,
      source: authorityRecord(authorities.reaction), reportMarkdown: authorities.reaction.value,
    }],
    ["authority/scroll-mapping.json", {
      schema: AUTHORITY_REPORT_SCHEMAS["authority/scroll-mapping.json"], ...common,
      source: authorityRecord(authorities.mapping), facts: authorities.mapping.value,
    }],
    ["authority/h264-production-media-manifest.json", {
      schema: AUTHORITY_REPORT_SCHEMAS["authority/h264-production-media-manifest.json"], ...common,
      source: authorityRecord(authorities.media), activeManifest: authorities.media.value,
    }],
  ]);
}

function evidencePurpose(relativePath) {
  const recording = RECORDINGS.find(({ id }) => relativePath === `recordings/${id}.mp4`);
  if (recording) return `Deployed-browser recording ${recording.gate}: ${recording.kind}`;
  const sheet = SHEETS.find(({ id }) => relativePath === `sheets/${id}.png`);
  if (sheet) return sheet.title;
  const names = {
    "reports/first-input.json": "Five-viewport, seven-input first-response matrix",
    "reports/current-order.json": "Ordered front, loop-boundary, spill, and full-arrival validation",
    "reports/automatic-wake.json": "No-input, continue, reverse, re-entry, and reload wake validation",
    "reports/timeout-geometry.json": "Six-position slow-network runway and position preservation",
    "reports/responsive.json": "Responsive and short-landscape physical/ENTRY validation",
    "reports/codec-network-performance.json": "H.264-only request, one-decoder, network, CLS, and performance validation",
    "reports/accessibility-fallback.json": "Reduced-motion, no-JS, failure, zoom, and accessibility validation",
    "reports/operating-field-regression.json": "Frozen Operating Field regression validation",
    "reports/git-deployment-provenance.json": "Final Git, Cloudflare, media, and source provenance",
    [EXPECTED_EVIDENCE_MANIFEST_RELATIVE]: "Exhaustive browser-evidence hash and size authority",
  };
  return names[relativePath] ?? "Machine review authority";
}

async function writeStageFile(stageRoot, relativePath, bytes, record) {
  assertAllowedEntry(relativePath);
  assertNoPrivateText(bytes, relativePath);
  await atomicWrite(resolveUnder(stageRoot, relativePath), bytes);
  return { relativePath, byteSize: bytes.length, sha256: sha256(bytes), finalBlenderSourceHash: record.finalBlenderSourceHash, ...record };
}

function readmeText(repository, authorities, options) {
  return `# Phase 4-R2.1 causal signal + scroll stability human review\n\nThis package is bound to final Git HEAD \`${repository.head}\`, its exact parent\n\`${repository.parent}\`, Cloudflare deployment \`${options.expectedDeploymentId}\`, and\nthe final causal-current Blender derivative SHA-256\n\`${options.expectedSourceSha256}\`.\n\n## What changed\n\n- The first positive scroll offset enters the first visibly changed physical frame.\n- One continuous current front advances in physical cable order and leaves a restrained energized trail.\n- The complete internal signal channel is energized at arrival with zero dark gaps.\n- Arrival automatically advances the existing decoder from F285 to stable-Q F370 while native scroll remains unlocked.\n- Late failure paths preserve cinematic runway/poster geometry; active delivery is H.264-only.\n- Short-landscape ENTRY is complete without redesigning the Operating Field.\n\n## What remained frozen\n\nThe proving hall, spiral route, cable origin/CRT connection, three camera paths, exact Q/phosphor/glass, F1-F500 structure, semantic ENTRY, chrome rules, and Operating Field remain outside the narrow repair except where the tracked delta authority explicitly proves otherwise. Raw RGB16 masters and replacement frames remain external.\n\n## Package boundaries\n\nThe ZIP contains 17 exact review sheets, 17 real deployed-browser H.264 recordings, 10 evidence reports, and 6 projected tracked authorities. It contains no raw masters, raw replacement ranges, rejected encodes, Blender file, VP9/WebM payload, cache, secret, or unrelated evidence. The textual source-delta authority names the Blender derivative; the Blender binary itself is intentionally excluded.\n\n## Human review\n\nMachine PASS establishes package integrity and the captured claims. It does not assign human acceptance. All five gates remain **PENDING HUMAN REVIEW**:\n\n1. PHYSICAL → DIGITAL CONTINUITY\n2. NATIVE SCROLL + REVERSE INTEGRITY\n3. RESPONSIVE + ACCESSIBLE INTEGRATION\n4. MEDIA + PERFORMANCE SAFETY\n5. OPERATING FIELD REGRESSION\n\nPhase 5 and merge to main remain unauthorized. Review \`MANIFEST.json\` for exhaustive hashes, sizes, purposes, viewports, frame/range descriptions, engines, and final source binding.\n`;
}

async function assembleStage(evidence, authorities, repository, stageRoot, options) {
  const records = [];
  const recordingLedger = new Map(evidence.manifest.recordings.map((item) => [item.relativePath, item]));
  const sheetLedger = new Map(evidence.manifest.sheets.map((item) => [item.relativePath, item]));
  for (const relativePath of exactEvidencePaths()) {
    const source = evidence.byPath.get(relativePath);
    const extension = path.extname(relativePath).toLowerCase();
    if (relativePath.startsWith("recordings/")) {
      const ledger = recordingLedger.get(relativePath);
      const view = viewpointById(ledger.viewpoint);
      const staged = resolveUnder(stageRoot, relativePath);
      await mkdir(path.dirname(staged), { recursive: true });
      await atomicWrite(staged, source.bytes);
      const media = await validateVideo(options.ffmpeg, options.ffprobe, staged, ledger.expectedFrameCount, view, relativePath);
      records.push({ relativePath, byteSize: source.byteSize, sha256: source.sha256, kind: "recording", purpose: evidencePurpose(relativePath), viewport: { id: view.id, width: view.width, height: view.height }, frameRange: ledger.frameRange ?? null, engine: "deployed Chromium screen recording; silent H.264 CFR 30", expectedFrameCount: ledger.expectedFrameCount, media, finalBlenderSourceHash: options.expectedSourceSha256 });
    } else if (relativePath.startsWith("sheets/")) {
      if (!IMAGE_EXTENSIONS.has(extension)) throw new Error(`sheet extension differs: ${relativePath}`);
      const image = await validateImage(source.bytes, relativePath);
      const ledger = sheetLedger.get(relativePath);
      if (ledger.width !== image.width || ledger.height !== image.height) throw new Error(`sheet dimensions differ from evidence manifest: ${relativePath}`);
      records.push(await writeStageFile(stageRoot, relativePath, source.bytes, { kind: "sheet", purpose: evidencePurpose(relativePath), viewport: "multiple labelled states", frameRange: null, engine: "deployed Chromium capture; composed PNG", ...image, finalBlenderSourceHash: options.expectedSourceSha256 }));
    } else {
      const parsed = JSON.parse(source.bytes.toString("utf8"));
      const expectedSchema = EVIDENCE_REPORT_SCHEMAS[relativePath];
      if (parsed.schema !== expectedSchema || parsed.status !== "PASS") throw new Error(`evidence report exact path/schema/PASS differs: ${relativePath}`);
      if (parsed.humanReviewGates) exactHumanGates(parsed.humanReviewGates);
      if (parsed.authorization) deniedAuthorization(parsed.authorization, relativePath);
      records.push(await writeStageFile(stageRoot, relativePath, source.bytes, { kind: "report", reportClass: "evidence", purpose: evidencePurpose(relativePath), viewport: null, frameRange: null, engine: "machine/deployed-browser evidence", schema: expectedSchema, status: "PASS", finalBlenderSourceHash: options.expectedSourceSha256 }));
    }
  }
  for (const [relativePath, payload] of authorityPayloads(authorities, options)) {
    const bytes = Buffer.from(stableJson(payload), "utf8");
    records.push(await writeStageFile(stageRoot, relativePath, bytes, { kind: "report", reportClass: "authority", purpose: evidencePurpose(relativePath), viewport: null, frameRange: relativePath.includes("current") ? "F46-F494; arrival F285" : null, engine: "projected tracked authority", schema: payload.schema, status: "PASS", finalBlenderSourceHash: options.expectedSourceSha256 }));
  }
  const counts = semanticCounts(records);
  if (JSON.stringify(counts) !== JSON.stringify(EXPECTED_COUNTS)) throw new Error(`staged package inventory differs: ${JSON.stringify(counts)}`);
  return records.sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createStoredZipBuffer(entries, { preserveInputOrder = false } = {}) {
  const ordered = preserveInputOrder ? [...entries] : [...entries].sort((left, right) => lexicalCompare(left.path, right.path));
  const names = ordered.map((entry) => safeRelativePath(entry.path, "ZIP entry"));
  if (new Set(names).size !== names.length || ordered.length > 0xffff) throw new Error("ZIP path count/uniqueness exceeds canonical non-ZIP64 contract");
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of ordered) {
    assertAllowedEntry(entry.path);
    const name = Buffer.from(entry.path, "utf8");
    const data = Buffer.from(entry.data);
    if (data.length > 0xffffffff || offset > 0xffffffff) throw new Error("ZIP64 is intentionally unsupported for this compact review package");
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(checksum, 14);
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
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  if (offset + centralBytes.length > 0xffffffff) throw new Error("ZIP64 is intentionally unsupported for this compact review package");
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(ordered.length, 8);
  eocd.writeUInt16LE(ordered.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, eocd]);
}

export function parseStoredZip(bytes) {
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
    if (cursor + 46 > eocdOffset || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIP central header is missing/truncated");
    const versionMadeBy = bytes.readUInt16LE(cursor + 4);
    const versionNeeded = bytes.readUInt16LE(cursor + 6);
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const dosTime = bytes.readUInt16LE(cursor + 12);
    const dosDate = bytes.readUInt16LE(cursor + 14);
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressed = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const diskStart = bytes.readUInt16LE(cursor + 34);
    const internalAttributes = bytes.readUInt16LE(cursor + 36);
    const externalAttributes = bytes.readUInt32LE(cursor + 38);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    if (versionMadeBy !== 20 || versionNeeded !== 20 || flags !== 0x0800 || method !== 0 || dosTime !== 0 || dosDate !== 0x0021 || compressed !== size || extraLength !== 0 || commentLength !== 0 || diskStart !== 0 || internalAttributes !== 0 || externalAttributes !== 0) throw new Error("ZIP central entry is not canonical stored UTF-8 with fixed DOS timestamp");
    if (cursor + 46 + nameLength > eocdOffset) throw new Error("ZIP central name is truncated");
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    safeRelativePath(name, "ZIP entry");
    assertAllowedEntry(name);
    if (previousName !== null && lexicalCompare(previousName, name) >= 0) throw new Error("ZIP entries are not unique strict lexical order");
    previousName = name;
    if (localOffset !== expectedLocalOffset || localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`ZIP local offset/header differs: ${name}`);
    const localVersion = bytes.readUInt16LE(localOffset + 4);
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localTime = bytes.readUInt16LE(localOffset + 10);
    const localDate = bytes.readUInt16LE(localOffset + 12);
    const localChecksum = bytes.readUInt32LE(localOffset + 14);
    const localCompressed = bytes.readUInt32LE(localOffset + 18);
    const localSize = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    if (localOffset + 30 + localNameLength + localExtraLength > centralOffset) throw new Error(`ZIP local name overlaps central directory: ${name}`);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + localCompressed;
    if (dataEnd > centralOffset) throw new Error(`ZIP local data overlaps central directory: ${name}`);
    const data = bytes.subarray(dataStart, dataEnd);
    if (localVersion !== versionNeeded || localFlags !== flags || localMethod !== method || localTime !== dosTime || localDate !== dosDate || localChecksum !== checksum || localCompressed !== compressed || localSize !== size || localNameLength !== nameLength || localExtraLength !== extraLength || localName !== name || data.length !== size || crc32(data) !== checksum) throw new Error(`ZIP local/central/header/CRC mismatch: ${name}`);
    entries.push({ path: name, data: Buffer.from(data), bytes: size, sha256: sha256(data), crc32: checksum });
    expectedLocalOffset = dataEnd;
    cursor += 46 + nameLength;
  }
  if (expectedLocalOffset !== centralOffset || cursor !== eocdOffset) throw new Error("ZIP local/central coverage is not exact");
  return entries;
}

export function semanticCounts(files) {
  const sheets = files.filter((record) => record.kind === "sheet").length;
  const recordings = files.filter((record) => record.kind === "recording").length;
  const evidenceReports = files.filter((record) => record.kind === "report" && record.reportClass === "evidence").length;
  const authorityReports = files.filter((record) => record.kind === "report" && record.reportClass === "authority").length;
  return { sheets, recordings, evidenceReports, authorityReports, reports: evidenceReports + authorityReports, payloads: files.length, archiveEntries: files.length + 2 };
}

function allowedPayloadPaths() {
  return [...exactEvidencePaths(), ...Object.keys(AUTHORITY_REPORT_SCHEMAS)].sort(lexicalCompare);
}

export function validatePackageManifest(manifest, bindings) {
  if (manifest?.schema !== PACKAGE_SCHEMA || manifest.status !== "PASS" || manifest.generatedAt !== FIXED_EPOCH) throw new Error("package manifest schema/status/timestamp differs");
  exactHumanGates(manifest.humanReviewGates);
  deniedAuthorization(manifest.authorization, "package manifest authorization", true);
  if (manifest.source?.head !== bindings.expectedHead || manifest.source?.parent !== bindings.expectedParent || manifest.source?.branch !== bindings.expectedBranch || manifest.source?.mainHead !== MAIN_SHA
    || manifest.source?.blenderSourceSha256 !== bindings.expectedSourceSha256 || manifest.source?.mediaManifestSha256 !== bindings.expectedManifestSha256
    || manifest.deployment?.deploymentId !== bindings.expectedDeploymentId || manifest.deployment?.immutableUrl !== bindings.immutableUrl || manifest.deployment?.branchUrl !== bindings.branchUrl) throw new Error("package manifest final authority binding differs");
  if (!Array.isArray(manifest.files) || manifest.files.length !== EXPECTED_COUNTS.payloads || new Set(manifest.files.map((record) => record.relativePath)).size !== manifest.files.length) throw new Error("package manifest file ledger differs");
  if (JSON.stringify(semanticCounts(manifest.files)) !== JSON.stringify(EXPECTED_COUNTS)) throw new Error("package manifest semantic counts differ");
  const paths = manifest.files.map((record) => record.relativePath);
  if (JSON.stringify(paths) !== JSON.stringify(allowedPayloadPaths())) throw new Error("package manifest exact path inventory/order differs");
  if (manifest.payloadBytes !== manifest.files.reduce((sum, record) => sum + record.byteSize, 0) || manifest.unmanifestedArchiveEntries?.join(",") !== `${README_FILENAME},${IN_ARCHIVE_MANIFEST}`) throw new Error("package manifest aggregate/self-entry declaration differs");
  for (const record of manifest.files) {
    assertAllowedEntry(record.relativePath);
    if (!Number.isSafeInteger(record.byteSize) || record.byteSize < 1 || !HASH64.test(record.sha256 ?? "") || record.finalBlenderSourceHash !== bindings.expectedSourceSha256
      || typeof record.purpose !== "string" || !record.purpose || !Object.hasOwn(record, "viewport") || !Object.hasOwn(record, "frameRange") || typeof record.engine !== "string" || !record.engine) throw new Error(`package ledger record malformed: ${record.relativePath}`);
    if (record.kind === "report") {
      const expectedSchema = EVIDENCE_REPORT_SCHEMAS[record.relativePath] ?? AUTHORITY_REPORT_SCHEMAS[record.relativePath];
      if (record.schema !== expectedSchema || record.status !== "PASS") throw new Error(`package report path/schema differs: ${record.relativePath}`);
    }
  }
  return true;
}

async function auditArchive(options) {
  const archivePath = await realpath(options.auditExisting);
  const manifestPath = await realpath(options.detachedManifest);
  assertExternalPath(archivePath, "resolved archive");
  assertExternalPath(manifestPath, "resolved detached manifest");
  if (path.basename(archivePath) !== ARCHIVE_FILENAME || path.basename(manifestPath) !== DETACHED_MANIFEST_FILENAME || path.dirname(archivePath) !== path.dirname(manifestPath)) throw new Error("archive/detached-manifest naming or sibling contract differs");
  const [archive, detached] = await Promise.all([readFile(archivePath), readFile(manifestPath)]);
  const entries = parseStoredZip(archive);
  if (entries.length !== EXPECTED_COUNTS.archiveEntries || new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error("ZIP entry count/uniqueness differs");
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const archivedManifest = byPath.get(IN_ARCHIVE_MANIFEST);
  const readme = byPath.get(README_FILENAME);
  if (!archivedManifest || !readme || !archivedManifest.data.equals(detached)) throw new Error("README/manifest presence or detached parity differs");
  const manifest = JSON.parse(detached.toString("utf8"));
  validatePackageManifest(manifest, options);
  const expectedPaths = [...allowedPayloadPaths(), README_FILENAME, IN_ARCHIVE_MANIFEST].sort(lexicalCompare);
  if (JSON.stringify(entries.map((entry) => entry.path)) !== JSON.stringify(expectedPaths)) throw new Error("ZIP manifest coverage/order is not exhaustive and canonical");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase4r2-1-review-audit-"));
  const media = [];
  try {
    for (const entry of entries) {
      assertAllowedEntry(entry.path);
      assertNoPrivateText(entry.data, entry.path);
    }
    for (const record of manifest.files) {
      const entry = byPath.get(record.relativePath);
      if (!entry || entry.bytes !== record.byteSize || entry.sha256 !== record.sha256) throw new Error(`manifest hash/size mismatch: ${record.relativePath}`);
      if (record.kind === "sheet") {
        const decoded = await validateImage(entry.data, record.relativePath);
        if (decoded.width !== record.width || decoded.height !== record.height) throw new Error(`audited sheet dimensions differ: ${record.relativePath}`);
        media.push({ path: record.relativePath, type: "image", ...decoded });
      } else if (record.kind === "recording") {
        const extracted = path.join(temporary, `${media.length}.mp4`);
        await writeFile(extracted, entry.data);
        const decoded = await validateVideo(options.ffmpeg, options.ffprobe, extracted, record.expectedFrameCount, record.viewport, record.relativePath);
        media.push({ path: record.relativePath, type: "video", ...decoded });
      } else if (record.kind === "report") {
        const parsed = JSON.parse(entry.data.toString("utf8"));
        if (parsed.schema !== record.schema || parsed.status !== "PASS") throw new Error(`audited report schema/PASS differs: ${record.relativePath}`);
        if (parsed.humanReviewGates) exactHumanGates(parsed.humanReviewGates);
        if (parsed.authorization) deniedAuthorization(parsed.authorization, record.relativePath);
        if (record.relativePath === "authority/h264-production-media-manifest.json") validateActiveMediaManifest(parsed.activeManifest, options.expectedSourceSha256);
      } else throw new Error(`unknown package record kind: ${record.kind}`);
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return {
    schema: AUDIT_SCHEMA,
    status: "PASS",
    generatedAt: FIXED_EPOCH,
    archive: { filename: ARCHIVE_FILENAME, byteSize: archive.length, sha256: sha256(archive), entryCount: entries.length },
    manifest: { filename: DETACHED_MANIFEST_FILENAME, byteSize: detached.length, sha256: sha256(detached), detachedEqualsArchived: true },
    counts: EXPECTED_COUNTS,
    checks: {
      zipOpens: true,
      zipCrcPasses: true,
      canonicalUniqueSafePaths: true,
      canonicalLexicalHeadersAndFixedTimestamps: true,
      localCentralHeaderParity: true,
      exhaustiveManifestCoverage: true,
      everyHashAndSizeMatches: true,
      everyImageFullyDecodes: true,
      everyVideoFullyDecodes: true,
      expectedVideoFrameCountsMatch: true,
      videosSilentH264Cfr30Yuv420p: true,
      privacyAndSecretsScanPasses: true,
      rawMastersAndReplacementFramesExcluded: true,
      rejectedMediaAndVp9Excluded: true,
      blenderBinaryExcluded: true,
      cachesAndUnauthorizedProductionFilesExcluded: true,
      packageExternalAndUntracked: true,
    },
    media,
    humanReviewGates: HUMAN_GATES,
    authorization: AUTHORIZATION,
  };
}

function siblingPath(output, filename) { return path.join(path.dirname(output), filename); }

async function assertFreshDestinations(paths) {
  for (const candidate of paths) {
    try { await access(candidate); throw new Error(`destination already exists and will not be overwritten: ${candidate}`); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
}

async function assemblePackage(options) {
  assertDurableReviewLocation(options.output, "output archive");
  const canonicalOutput = await canonicalFuturePath(options.output);
  assertDurableReviewLocation(canonicalOutput, "canonical output");
  const finalManifest = siblingPath(options.output, DETACHED_MANIFEST_FILENAME);
  const finalAudit = siblingPath(options.output, AUDIT_FILENAME);
  const finalResult = siblingPath(options.output, RESULT_FILENAME);
  await assertFreshDestinations([options.output, finalManifest, finalAudit, finalResult]);
  const evidence = await resolveEvidence(options);
  const authorities = await resolveAuthorities(options);
  if (authorities.deploymentAuthority.sha256 !== evidence.byPath.get("reports/git-deployment-provenance.json").sha256) throw new Error("--deployment-report must be the exact captured Git/deployment provenance report");
  const authorityFiles = [options.mediaManifest, options.rootCauseReport, options.sourceBuildReport, options.sourceAuditReport, options.currentReport, options.mappingReport, options.reactionReport];
  const repository = await repositoryAuthority(options, authorityFiles);
  const workRoot = await mkdtemp(path.join(os.tmpdir(), "phase4r2-1-review-stage-"));
  const assemblyRoot = path.join(path.dirname(options.output), `.phase4r2-1-review-assembly-${randomUUID()}`);
  await mkdir(assemblyRoot, { recursive: false });
  try {
    const files = await assembleStage(evidence, authorities, repository, workRoot, options);
    const readme = Buffer.from(readmeText(repository, authorities, options), "utf8");
    assertNoPrivateText(readme, README_FILENAME);
    await atomicWrite(path.join(workRoot, README_FILENAME), readme);
    const manifest = {
      schema: PACKAGE_SCHEMA,
      status: "PASS",
      generatedAt: FIXED_EPOCH,
      deterministicArchive: { storedEntries: true, fixedDosTimestamp: FIXED_EPOCH, utf8Paths: true, lexicalByteOrder: true, zip64: false },
      source: { head: repository.head, parent: repository.parent, branch: repository.branch, base: BASE_SHA, commitChain: repository.commitChain, mainHead: repository.main.head, clean: true, upstreamHead: repository.upstreamHead, liveRemoteHead: repository.liveRemoteHead, blenderSourceSha256: options.expectedSourceSha256, mediaManifestSha256: options.expectedManifestSha256, evidenceManifestSha256: evidence.manifestAuthority.sha256 },
      deployment: { deploymentId: options.expectedDeploymentId, immutableUrl: options.immutableUrl, branchUrl: options.branchUrl, status: "PASS" },
      inventory: EXPECTED_COUNTS,
      payloadBytes: files.reduce((sum, record) => sum + record.byteSize, 0),
      unmanifestedArchiveEntries: [README_FILENAME, IN_ARCHIVE_MANIFEST],
      files,
      humanReviewGates: HUMAN_GATES,
      authorization: AUTHORIZATION,
    };
    validatePackageManifest(manifest, options);
    const manifestBytes = Buffer.from(stableJson(manifest), "utf8");
    assertNoPrivateText(manifestBytes, IN_ARCHIVE_MANIFEST);
    await atomicWrite(path.join(workRoot, IN_ARCHIVE_MANIFEST), manifestBytes);
    const stagePaths = await recursiveFiles(workRoot);
    const expectedPaths = [...allowedPayloadPaths(), README_FILENAME, IN_ARCHIVE_MANIFEST].sort(lexicalCompare);
    if (JSON.stringify(stagePaths) !== JSON.stringify(expectedPaths)) throw new Error("staging files differ from exhaustive package contract");
    const entries = [];
    for (const relativePath of stagePaths) entries.push({ path: relativePath, data: await readFile(resolveUnder(workRoot, relativePath)) });
    const archive = createStoredZipBuffer(entries);
    if (!archive.equals(createStoredZipBuffer([...entries].reverse()))) throw new Error("deterministic ZIP reproduction differs");
    const assembledArchive = path.join(assemblyRoot, ARCHIVE_FILENAME);
    const assembledManifest = path.join(assemblyRoot, DETACHED_MANIFEST_FILENAME);
    const assembledAudit = path.join(assemblyRoot, AUDIT_FILENAME);
    await atomicWrite(assembledArchive, archive);
    await atomicWrite(assembledManifest, manifestBytes);
    const childArguments = [PACKAGER, "--audit-existing", assembledArchive, "--manifest", assembledManifest, "--audit-output", assembledAudit,
      "--expected-head", options.expectedHead, "--expected-parent", options.expectedParent, "--expected-source-sha256", options.expectedSourceSha256,
      "--expected-manifest-sha256", options.expectedManifestSha256, "--expected-deployment-id", options.expectedDeploymentId,
      "--immutable-url", options.immutableUrl, "--branch-url", options.branchUrl, "--expected-branch", options.expectedBranch,
      "--ffmpeg", options.ffmpeg, "--ffprobe", options.ffprobe];
    const child = await run(process.execPath, childArguments, "independent separate-process package audit", 30_000_000);
    const childSummary = JSON.parse(child.stdout);
    const auditAuthority = await fileAuthority(assembledAudit);
    const audit = JSON.parse(auditAuthority.bytes.toString("utf8"));
    if (childSummary.status !== "PASS" || audit.schema !== AUDIT_SCHEMA || audit.status !== "PASS" || audit.archive.sha256 !== sha256(archive)) throw new Error("separate-process audit did not return exact PASS authority");
    const result = {
      schema: RESULT_SCHEMA,
      status: "PASS",
      generatedAt: FIXED_EPOCH,
      archive: audit.archive,
      manifest: audit.manifest,
      audit: { filename: AUDIT_FILENAME, byteSize: auditAuthority.byteSize, sha256: auditAuthority.sha256, separateProcess: true },
      counts: EXPECTED_COUNTS,
      packageExternalAndUntracked: true,
      humanReviewGates: HUMAN_GATES,
      authorization: AUTHORIZATION,
    };
    const resultBytes = Buffer.from(stableJson(result), "utf8");
    assertNoPrivateText(resultBytes, RESULT_FILENAME);
    await atomicWrite(path.join(assemblyRoot, RESULT_FILENAME), resultBytes);
    await rename(assembledArchive, options.output);
    await rename(assembledManifest, finalManifest);
    await rename(assembledAudit, finalAudit);
    await rename(path.join(assemblyRoot, RESULT_FILENAME), finalResult);
    process.stdout.write(stableJson({ status: "PASS", archive: result.archive, manifest: result.manifest, audit: result.audit, counts: EXPECTED_COUNTS, humanReviewGates: HUMAN_GATES }));
  } finally {
    await rm(workRoot, { recursive: true, force: true });
    await rm(assemblyRoot, { recursive: true, force: true });
  }
}

export async function selfTest() {
  if (ARCHIVE_FILENAME !== "phase-4r2-1-causal-signal-scroll-stability-human-review.zip" || exactEvidencePaths().length !== 44 || expectedArtifactPaths().length !== 43 || allowedPayloadPaths().length !== 50) throw new Error("exact package name/inventory self-test failed");
  if (JSON.stringify(semanticCounts([
    ...SHEETS.map(({ id }) => ({ kind: "sheet", relativePath: `sheets/${id}.png` })),
    ...RECORDINGS.map(({ id }) => ({ kind: "recording", relativePath: `recordings/${id}.mp4` })),
    ...Object.keys(EVIDENCE_REPORT_SCHEMAS).map((relativePath) => ({ kind: "report", reportClass: "evidence", relativePath })),
    ...Object.keys(AUTHORITY_REPORT_SCHEMAS).map((relativePath) => ({ kind: "report", reportClass: "authority", relativePath })),
  ])) !== JSON.stringify(EXPECTED_COUNTS)) throw new Error("semantic inventory self-test failed");
  exactHumanGates(HUMAN_GATES);
  deniedAuthorization(AUTHORIZATION, "self-test authorization", true);
  for (const invalid of ["../x", "/x", "a\\b", "a//b", "./a", "a/../b"]) {
    let rejected = false;
    try { safeRelativePath(invalid); } catch { rejected = true; }
    if (!rejected) throw new Error(`unsafe path accepted: ${invalid}`);
  }
  for (const invalid of ["raw/F046.png", "frames/F046.png", "rejected/candidate.mp4", "authority/source.blend", "recordings/review.webm", "cache/data.json", ".env"]) {
    let rejected = false;
    try { assertAllowedEntry(invalid); } catch { rejected = true; }
    if (!rejected) throw new Error(`forbidden entry accepted: ${invalid}`);
  }
  for (const [bytes, label] of [[Buffer.from("C:\\Users\\example\\private"), "reports/test.json"], [Buffer.from("token=sk-example_secret_abcdefghijklmnopqrstuvwxyz"), "reports/test.json"], [Buffer.from("safe"), "reports/OneDrive/private.json"]]) {
    let rejected = false;
    try { assertNoPrivateText(bytes, label); } catch { rejected = true; }
    if (!rejected) throw new Error("privacy/secrets negative self-test failed");
  }
  const entries = [{ path: "reports/b.json", data: Buffer.from("bravo\n") }, { path: "reports/a.json", data: Buffer.from("alpha\n") }];
  const first = createStoredZipBuffer(entries);
  const second = createStoredZipBuffer([...entries].reverse());
  if (!first.equals(second)) throw new Error("deterministic ZIP self-test differs");
  const parsed = parseStoredZip(first);
  if (parsed.length !== 2 || parsed[0].path !== "reports/a.json" || parsed[1].path !== "reports/b.json") throw new Error("ZIP parse/order self-test differs");
  for (const invalidZip of [
    createStoredZipBuffer(entries, { preserveInputOrder: true }),
    (() => { const bytes = Buffer.from(first); bytes.writeUInt16LE(8, 8); return bytes; })(),
    (() => { const bytes = Buffer.from(first); const nameLength = bytes.readUInt16LE(26); bytes[30 + nameLength] ^= 0xff; return bytes; })(),
    (() => { const bytes = Buffer.from(first); bytes[30] = 0x7a; return bytes; })(),
  ]) {
    let rejected = false;
    try { parseStoredZip(invalidZip); } catch { rejected = true; }
    if (!rejected) throw new Error("non-canonical/corrupt ZIP negative self-test failed");
  }
  const probe = { formatName: "mov,mp4,m4a,3gp,3g2,mj2", videoStreamCount: 1, audioStreamCount: 0, otherStreamCount: 0, codec: "h264", pixelFormat: "yuv420p", averageFrameRate: "30/1", realFrameRate: "30/1", frameCount: 90, width: 390, height: 844 };
  assertVideoProbeContract(probe, 90, { width: 390, height: 844 }, "self-test");
  for (const override of [{ codec: "vp9" }, { formatName: "matroska,webm" }, { audioStreamCount: 1 }, { frameCount: 89 }, { width: 391 }]) {
    let rejected = false;
    try { assertVideoProbeContract({ ...probe, ...override }, 90, { width: 390, height: 844 }, "negative"); } catch { rejected = true; }
    if (!rejected) throw new Error("video probe negative self-test failed");
  }
  process.stdout.write(stableJson({ schema: `${PACKAGE_SCHEMA}.self-test`, status: "PASS", counts: EXPECTED_COUNTS, deterministicZipSha256: sha256(first) }));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  if (options.selfTest) return selfTest();
  if (options.auditExisting) {
    validateOptionShape(options, "audit");
    assertExternalPath(options.auditExisting, "archive");
    assertExternalPath(options.detachedManifest, "detached manifest");
    if (!await executable(options.ffmpeg) || !await executable(options.ffprobe)) throw new Error("ffmpeg and ffprobe are required for audit");
    const audit = await auditArchive(options);
    if (options.auditOutput) {
      assertExternalPath(options.auditOutput, "audit output");
      if (path.basename(options.auditOutput) !== AUDIT_FILENAME || path.dirname(options.auditOutput) !== path.dirname(options.auditExisting)) throw new Error("audit output must use the exact sibling basename");
      const resolved = await canonicalFuturePath(options.auditOutput);
      assertExternalPath(resolved, "canonical audit output");
      await atomicWrite(options.auditOutput, Buffer.from(stableJson(audit), "utf8"));
    }
    process.stdout.write(stableJson({ status: "PASS", archive: audit.archive, manifest: audit.manifest, audit: { filename: options.auditOutput ? AUDIT_FILENAME : null }, counts: EXPECTED_COUNTS }));
    return;
  }
  validateOptionShape(options, "build");
  assertExternalPath(options.evidenceRoot, "evidence root");
  assertDurableReviewLocation(options.output, "output archive");
  if (options.dryRun) {
    process.stdout.write(stableJson({ schema: `${PACKAGE_SCHEMA}.dry-run`, status: "PASS", writesPerformed: false, mediaDecoded: false, separateProcessLaunched: false, archiveFilename: ARCHIVE_FILENAME, counts: EXPECTED_COUNTS, humanReviewGates: HUMAN_GATES, authorization: AUTHORIZATION }));
    return;
  }
  if (!await executable(options.ffmpeg) || !await executable(options.ffprobe)) throw new Error("ffmpeg and ffprobe are required");
  await assemblePackage(options);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === path.resolve(PACKAGER)) {
  main().catch((error) => {
    process.stderr.write(`Phase 4-R2.1 human-review package failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
