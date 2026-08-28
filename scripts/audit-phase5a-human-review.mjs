#!/usr/bin/env node

/**
 * Independent, separate-process audit for the Phase 5A human-review package.
 *
 * The ZIP parser, policy constants, role contract, privacy checks, image
 * decoder, and MP4 probe checks are deliberately implemented here rather than
 * imported from the packager. This keeps the final acceptance pass independent
 * of the code path that assembled the archive.
 */

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
const AUDITOR = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(AUDITOR), "..");

export const REQUIRED_BRANCH = "feature/phase-5a-scroll-crt-route-preproduction";
export const ACCEPTED_PHASE4_SHA = "47a6f3cc7f464b09c9c143cac273c2a1f5a35bfa";
export const FROZEN_MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const PRODUCTION_BLEND_SHA256 = "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516";
export const ACTIVE_MEDIA_MANIFEST_SHA256 = "06f9f5b256577ed1b0f159a435135fca6a78185be57b4db8853b9b276c080a54";
export const PRODUCTION_BLEND_RELATIVE = "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/source/quantum-signal-television-phase4r2-1-causal-current.blend";
export const ACTIVE_MEDIA_MANIFEST_RELATIVE = "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/production/manifests/phase-4r2-production-media-manifest.json";
export const PACKAGE_SCHEMA = "quantum-hub.phase-5a.scroll-crt-supporting-route-preproduction-human-review.v1";
export const AUDIT_SCHEMA = `${PACKAGE_SCHEMA}.independent-audit`;
export const ARCHIVE_FILENAME = "phase-5a-scroll-crt-supporting-route-preproduction-human-review.zip";
export const DETACHED_MANIFEST_FILENAME = "phase-5a-scroll-crt-supporting-route-preproduction-human-review-manifest.json";
export const AUDIT_FILENAME = "phase-5a-scroll-crt-supporting-route-preproduction-human-review-audit.json";
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const README_FILENAME = "README.md";
export const FIXED_EPOCH = "1980-01-01T00:00:00.000Z";

export const HUMAN_REVIEW_GATES = Object.freeze({
  "SCROLL-DRIVEN CRT ACTIVATION": "PENDING HUMAN REVIEW",
  "SUPPORTING-ROUTE CREATIVE THESIS": "PENDING HUMAN REVIEW",
  "ROUTE-SPECIFIC SPATIAL IDENTITY": "PENDING HUMAN REVIEW",
  "RESPONSIVE + ACCESSIBLE ROUTE CONTINUITY": "PENDING HUMAN REVIEW",
  "PUBLICATION + MEDIA SAFETY": "PENDING HUMAN REVIEW",
  "PERFORMANCE + IMPLEMENTATION STRATEGY": "PENDING HUMAN REVIEW",
});

export const AUTHORIZATION = Object.freeze({
  authorSelfApproved: false,
  deployerSelfApproved: false,
  humanAccepted: false,
  mainMerged: false,
  phase5BAuthorized: false,
});

export const ROUTES = Object.freeze([
  Object.freeze({ id: "for-industry", publicRoute: "/for-partners/", publicLabel: "For industry" }),
  Object.freeze({ id: "for-startups", publicRoute: "/for-startups/", publicLabel: "For startups" }),
  Object.freeze({ id: "industries", publicRoute: "/industries/", publicLabel: "Industries" }),
  Object.freeze({ id: "proof", publicRoute: "/pocs/", publicLabel: "Proof" }),
  Object.freeze({ id: "maradin", publicRoute: "/pocs/maradin/", publicLabel: "Maradin" }),
  Object.freeze({ id: "spark", publicRoute: "/spark/", publicLabel: "SPARK" }),
  Object.freeze({ id: "about", publicRoute: "/about/", publicLabel: "About" }),
  Object.freeze({ id: "contact", publicRoute: "/contact/", publicLabel: "Contact" }),
  Object.freeze({ id: "404", publicRoute: "/404/", publicLabel: "404" }),
]);

export const ROUTE_PLAN_HEADINGS = Object.freeze([
  "Purpose", "Audience", "User question answered", "Content hierarchy", "Proposed page chapters",
  "Emotional/spatial arc", "Signature behavior", "Motion verbs", "Material vocabulary", "Media strategy",
  "Publication constraints", "Desktop storyboard", "Portrait storyboard", "Short-landscape storyboard",
  "Reduced-motion version", "No-JS version", "Performance strategy", "Implementation risk", "Dependencies",
  "Open questions requiring human approval",
]);

export const CRT_REQUIRED_FILES = Object.freeze({
  arrivalStopRecording: "recordings/A-arrival-stop.mp4",
  scrollDrivenStartupRecording: "recordings/B-scroll-driven-startup.mp4",
  stopOnLineRecording: "recordings/C-stop-on-line.mp4",
  stopOnRasterRecording: "recordings/D-stop-on-raster.mp4",
  reverseStartupRecording: "recordings/E-reverse-startup.mp4",
  fastJumpRecording: "recordings/F-fast-jump-scrollbar.mp4",
  firstPositive15pxRecording: "recordings/G-first-positive-15px.mp4",
  responsiveStartup1440x900: "recordings/H1-responsive-desktop-1440x900.mp4",
  responsiveStartup390x844: "recordings/H2-responsive-portrait-390x844.mp4",
  responsiveStartup320x800: "recordings/H3-responsive-narrow-320x800.mp4",
  responsiveStartup768x1024: "recordings/H4-responsive-tablet-768x1024.mp4",
  responsiveStartup844x390: "recordings/H5-responsive-landscape-844x390.mp4",
  arrivalStopSheet: "sheets/01-arrival-stop.png",
  scrollDrivenStartupSheet: "sheets/02-scroll-driven-startup.png",
  lineRasterHoldsSheet: "sheets/03-line-raster-holds.png",
  reverseStartupSheet: "sheets/04-reverse-startup.png",
  fastJumpSheet: "sheets/05-fast-jump.png",
  firstScrollSheet: "sheets/06-first-scroll.png",
  responsiveStartupSheet: "sheets/07-responsive-startup.png",
  mediaFallbacksSheet: "sheets/08-media-fallbacks.png",
  accessibilityChromeSheet: "sheets/09-accessibility-chrome.png",
  supportingRoutesSheet: "sheets/10-supporting-routes.png",
  frameMappingReport: "reports/frame-mapping.json",
  scrollAddressedCrtReport: "reports/scroll-addressed-crt.json",
  responsiveStartupReport: "reports/responsive-startup.json",
  mediaNetworkReport: "reports/media-network.json",
  fallbackAccessibilityReport: "reports/fallback-accessibility.json",
  supportingRouteRegressionsReport: "reports/supporting-route-regressions.json",
  gitDeploymentProvenanceReport: "reports/git-deployment-provenance.json",
  browserDiagnosticsReport: "reports/browser-diagnostics.json",
  browserEvidenceManifest: "reports/phase5a-browser-evidence-manifest.json",
});

export const CRT_REPORT_SCHEMAS = Object.freeze({
  "reports/frame-mapping.json": "quantum-hub.phase-5a.frame-mapping-evidence.v1",
  "reports/scroll-addressed-crt.json": "quantum-hub.phase-5a.scroll-addressed-crt-evidence.v1",
  "reports/responsive-startup.json": "quantum-hub.phase-5a.responsive-startup-evidence.v1",
  "reports/media-network.json": "quantum-hub.phase-5a.media-network-evidence.v1",
  "reports/fallback-accessibility.json": "quantum-hub.phase-5a.fallback-accessibility-evidence.v1",
  "reports/supporting-route-regressions.json": "quantum-hub.phase-5a.supporting-route-regressions.v1",
  "reports/git-deployment-provenance.json": "quantum-hub.phase-5a.git-deployment-provenance-evidence.v1",
  "reports/browser-diagnostics.json": "quantum-hub.phase-5a.browser-diagnostics.v1",
  "reports/phase5a-browser-evidence-manifest.json": "quantum-hub.phase-5a.scroll-crt-browser-evidence.v1",
});

export const ROUTE_FIXED_ROLES = Object.freeze({
  routePlan: "route-brief.md",
  mediaRequirements: "media-requirements.md",
  publicationConstraints: "publication-constraints.md",
  performancePlan: "performance-plan.md",
  implementationRisks: "implementation-risks.md",
});

export const ROUTE_MEDIA_ROLES = Object.freeze({
  desktopStoryboard: Object.freeze({ stem: "desktop-storyboard--1440x900", types: Object.freeze(["image"]) }),
  responsiveContactSheet: Object.freeze({ stem: "responsive-contact-sheet", types: Object.freeze(["image"]) }),
  mobileStoryboard: Object.freeze({ stem: "mobile-storyboard--390x844", types: Object.freeze(["image"]) }),
  shortLandscapeComposition: Object.freeze({ stem: "short-landscape--844x390", types: Object.freeze(["image"]) }),
  signatureMotionStates: Object.freeze({ stem: "signature-motion-states", types: Object.freeze(["image"]) }),
  materialDetailBoard: Object.freeze({ stem: "material-detail-board", types: Object.freeze(["image"]) }),
  typographyHierarchy: Object.freeze({ stem: "typography-hierarchy", types: Object.freeze(["image"]) }),
  transitionStates: Object.freeze({ stem: "representative-transition-states", types: Object.freeze(["image"]) }),
  reducedMotionState: Object.freeze({ stem: "reduced-motion", types: Object.freeze(["image"]) }),
  noJsState: Object.freeze({ stem: "no-js", types: Object.freeze(["image"]) }),
});

export const CROSS_ROUTE_FILES = Object.freeze({
  designSystemContinuation: "cross-route-system/PHASE_5A_SUPPORTING_ROUTE_EXPERIENCE_SYSTEM.md",
  typography: "cross-route-system/PHASE_5A_SUPPORTING_ROUTE_PREPRODUCTION.md",
  motionGrammar: "cross-route-system/PHASE_5A_SUPPORTING_ROUTE_EXPERIENCE_SYSTEM.md",
  navigation: "cross-route-system/PHASE_5A_SUPPORTING_ROUTE_EXPERIENCE_SYSTEM.md",
  responsiveLaws: "cross-route-system/PHASE_5A_SUPPORTING_ROUTE_PREPRODUCTION.md",
  assetStrategy: "cross-route-system/PHASE_5A_SUPPORTING_ROUTE_PREPRODUCTION.md",
  implementationArchitecture: "cross-route-system/PHASE_5A_SUPPORTING_ROUTE_EXPERIENCE_SYSTEM.md",
  systemBoard: "cross-route-system/cross-route-system-board.png",
});

export const ROUTE_REPORT_FILES = Object.freeze({
  performanceEstimate: "cross-route-system/PHASE_5A_SUPPORTING_ROUTE_PREPRODUCTION.md",
  publicationAudit: "reports/PHASE_5A_PUBLICATION_AND_MEDIA_AUDIT.md",
  supportingRouteContentAudit: "reports/PHASE_5A_SUPPORTING_ROUTE_CONTENT_AUDIT.md",
  routeAccessibility: "reports/accessibility.json",
  routeBrowserCapture: "reports/browser-capture-report.json",
  routePreproductionManifest: "route-preproduction-manifest.json",
});

export const COHERENCE_MATRIX = "cross-route-system/PHASE_5A_ROUTE_COHERENCE_MATRIX.md";

const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4"]);
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv"]);
const PRIVATE_OR_SECRET_TEXT = /(?:[a-z]:[\\/]users[\\/]|(?:^|[^a-z])onedrive(?:[^a-z]|$)|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;
const FORBIDDEN_ENTRY = /(?:^|\/)(?:raw|private|secrets?|sources?|src|masters?|frames?|receipts?|logs?|cache|caches|quarantine|rejected|candidates?|browser-recorder|autosaves?|temp|tmp|__pycache__|node_modules|\.git)(?:\/|$)|(?:^|\/)\.(?:env|ds_store)(?:\.|$)|\.(?:webm|blend\d*|exr|tiff?|mov|mkv|avi|zip|7z|rar|pem|key|p12|pfx|log|map)$/i;
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

export function parseArguments(argv) {
  const options = {
    archive: null, manifest: null, auditOutput: null,
    expectedHead: null, expectedBase: null, expectedMain: null, expectedUpstream: null,
    expectedBranch: REQUIRED_BRANCH, expectedSourceSha256: null, expectedMediaManifestSha256: null,
    expectedDeploymentId: null, deploymentProject: null, deploymentCheckRunId: null,
    immutableUrl: null, branchUrl: null, ffprobe: null, expectedParentProcessId: null, help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--archive") options.archive = path.resolve(next());
    else if (argument === "--manifest") options.manifest = path.resolve(next());
    else if (argument === "--audit-output") options.auditOutput = path.resolve(next());
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-base") options.expectedBase = next().toLowerCase();
    else if (argument === "--expected-main") options.expectedMain = next().toLowerCase();
    else if (argument === "--expected-upstream") options.expectedUpstream = next().toLowerCase();
    else if (argument === "--expected-branch") options.expectedBranch = next();
    else if (argument === "--expected-source-sha256") options.expectedSourceSha256 = next().toLowerCase();
    else if (argument === "--expected-media-manifest-sha256") options.expectedMediaManifestSha256 = next().toLowerCase();
    else if (argument === "--expected-deployment-id") options.expectedDeploymentId = next();
    else if (argument === "--deployment-project") options.deploymentProject = next();
    else if (argument === "--deployment-check-run-id") options.deploymentCheckRunId = next();
    else if (argument === "--immutable-url") options.immutableUrl = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--ffprobe") options.ffprobe = path.resolve(next());
    else if (argument === "--expected-parent-process-id") options.expectedParentProcessId = Number(next());
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function normalizedOrigin(value, flag) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${flag} must be an absolute HTTPS origin URL`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || /^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(url.hostname)) throw new Error(`${flag} must be a credential-free non-loopback HTTPS origin root`);
  return url.toString();
}

export function validateOptionShape(input) {
  const options = { ...input };
  for (const [key, flag] of [["expectedHead", "--expected-head"], ["expectedBase", "--expected-base"], ["expectedMain", "--expected-main"], ["expectedUpstream", "--expected-upstream"]]) if (!HASH40.test(options[key] ?? "")) throw new Error(`${flag} must be an exact lowercase 40-hex commit`);
  for (const [key, flag] of [["expectedSourceSha256", "--expected-source-sha256"], ["expectedMediaManifestSha256", "--expected-media-manifest-sha256"]]) if (!HASH64.test(options[key] ?? "")) throw new Error(`${flag} must be an exact lowercase 64-hex digest`);
  if (options.expectedBase !== ACCEPTED_PHASE4_SHA) throw new Error(`--expected-base must equal accepted Phase 4 ${ACCEPTED_PHASE4_SHA}`);
  if (options.expectedMain !== FROZEN_MAIN_SHA) throw new Error(`--expected-main must equal frozen main ${FROZEN_MAIN_SHA}`);
  if (options.expectedSourceSha256 !== PRODUCTION_BLEND_SHA256) throw new Error(`--expected-source-sha256 must equal ${PRODUCTION_BLEND_SHA256}`);
  if (options.expectedMediaManifestSha256 !== ACTIVE_MEDIA_MANIFEST_SHA256) throw new Error(`--expected-media-manifest-sha256 must equal ${ACTIVE_MEDIA_MANIFEST_SHA256}`);
  if (options.expectedHead !== options.expectedUpstream) throw new Error("expected HEAD and upstream must be identical");
  if (options.expectedBranch !== REQUIRED_BRANCH) throw new Error(`--expected-branch must equal ${REQUIRED_BRANCH}`);
  if (!/^[a-z0-9][a-z0-9._:-]{5,127}$/i.test(options.expectedDeploymentId ?? "")) throw new Error("--expected-deployment-id is absent or malformed");
  if (!/^[a-z0-9][a-z0-9._-]{1,127}$/i.test(options.deploymentProject ?? "")) throw new Error("--deployment-project is absent or malformed");
  if (!/^[1-9][0-9]{0,30}$/.test(String(options.deploymentCheckRunId ?? ""))) throw new Error("--deployment-check-run-id must be a positive decimal identifier");
  options.immutableUrl = normalizedOrigin(options.immutableUrl, "--immutable-url");
  options.branchUrl = normalizedOrigin(options.branchUrl, "--branch-url");
  if (options.immutableUrl === options.branchUrl) throw new Error("immutable and branch URLs must be distinct");
  if (!options.archive || !options.manifest || !options.auditOutput) throw new Error("--archive, --manifest, and --audit-output are required");
  if (path.basename(options.archive) !== ARCHIVE_FILENAME || path.basename(options.manifest) !== DETACHED_MANIFEST_FILENAME || path.basename(options.auditOutput) !== AUDIT_FILENAME) throw new Error("archive, detached manifest, or audit output basename differs from the exact Phase 5A contract");
  if (new Set([path.dirname(options.archive), path.dirname(options.manifest), path.dirname(options.auditOutput)]).size !== 1) throw new Error("archive, manifest, and audit must be siblings");
  if (!options.ffprobe || !path.isAbsolute(options.ffprobe)) throw new Error("--ffprobe must be an explicit absolute executable path");
  if (!Number.isSafeInteger(options.expectedParentProcessId) || options.expectedParentProcessId <= 0) throw new Error("--expected-parent-process-id is required and must be a positive process identifier");
  return options;
}

function printHelp() {
  process.stdout.write([
    "Independent Phase 5A ZIP/manifest auditor",
    "",
    `  node scripts/audit-phase5a-human-review.mjs --archive <${ARCHIVE_FILENAME}>`,
    `    --manifest <${DETACHED_MANIFEST_FILENAME}> --audit-output <${AUDIT_FILENAME}>`,
    "    <the exact source, deployment, ffprobe, and parent-process bindings emitted by the packager>",
    "",
    "This tool is intended to be launched by the Phase 5A packager as a separate process.",
  ].join("\n"));
}

function lexicalCompare(left, right) { return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")); }
export function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function sortForJson(value) {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (!value || typeof value !== "object" || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(Object.keys(value).sort(lexicalCompare).map((key) => [key, sortForJson(value[key])]));
}
export function stableJson(value) { return `${JSON.stringify(sortForJson(value), null, 2)}\n`; }

export function safeRelativePath(value, label = "path") {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) throw new Error(`${label} must be a portable relative path`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`${label} is unsafe: ${value}`);
  return value;
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertExternalPath(candidate, label = "path") {
  const resolved = path.resolve(candidate);
  if (path.parse(resolved).root === resolved || isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved)) throw new Error(`${label} must be durable and external to the repository and operating-system temporary directory`);
  return resolved;
}

export function assertAllowedEntry(relativePath) {
  safeRelativePath(relativePath, "package entry");
  if (FORBIDDEN_ENTRY.test(relativePath)) throw new Error(`forbidden source/cache/private/raw payload: ${relativePath}`);
  const top = relativePath.split("/")[0];
  if (!["deployed-crt", "route-preproduction", README_FILENAME, IN_ARCHIVE_MANIFEST].includes(top)) throw new Error(`package entry is outside the exact Phase 5A review surface: ${relativePath}`);
  if (relativePath === README_FILENAME || relativePath === IN_ARCHIVE_MANIFEST) return true;
  const extension = path.extname(relativePath).toLowerCase();
  if (![...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...TEXT_EXTENSIONS].includes(extension)) throw new Error(`unsupported review payload type: ${relativePath}`);
  return true;
}

function semanticJsonText(value) {
  const output = [];
  const visit = (node, key = "") => {
    if (typeof node === "string") { output.push(node); if (key) output.push(`${key}: ${node}`); }
    else if (Array.isArray(node)) for (const item of node) visit(item, key);
    else if (node && typeof node === "object") for (const [childKey, child] of Object.entries(node)) { output.push(childKey); visit(child, childKey); }
    else if (key && node !== undefined && node !== null) output.push(`${key}: ${String(node)}`);
  };
  visit(value);
  return output.join("\n");
}

export function assertNoPrivateText(bytes, relativePath) {
  if (PRIVATE_OR_SECRET_TEXT.test(String(relativePath))) throw new Error(`privacy/secrets scan failed in package path: ${relativePath}`);
  const extension = path.extname(relativePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) && ![README_FILENAME, IN_ARCHIVE_MANIFEST].includes(relativePath)) return;
  const raw = Buffer.from(bytes).toString("utf8");
  let semantic = raw;
  if (extension === ".json" || relativePath === IN_ARCHIVE_MANIFEST) { try { semantic = semanticJsonText(JSON.parse(raw)); } catch { /* rejected elsewhere */ } }
  if (PRIVATE_OR_SECRET_TEXT.test(semantic)) throw new Error(`privacy/secrets scan failed in human-readable payload: ${relativePath}`);
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function parseStoredZip(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22) throw new Error("ZIP is truncated");
  const eocdOffset = bytes.length - 22;
  if (bytes.readUInt32LE(eocdOffset) !== 0x06054b50 || bytes.readUInt16LE(eocdOffset + 20) !== 0) throw new Error("ZIP EOCD is non-canonical or has a comment");
  const disk = bytes.readUInt16LE(eocdOffset + 4);
  const centralDisk = bytes.readUInt16LE(eocdOffset + 6);
  const diskCount = bytes.readUInt16LE(eocdOffset + 8);
  const count = bytes.readUInt16LE(eocdOffset + 10);
  const centralSize = bytes.readUInt32LE(eocdOffset + 12);
  const centralOffset = bytes.readUInt32LE(eocdOffset + 16);
  if (!count || disk !== 0 || centralDisk !== 0 || diskCount !== count || centralOffset + centralSize !== eocdOffset) throw new Error("ZIP central-directory bounds differ from the canonical single-disk contract");
  const entries = [];
  let cursor = centralOffset;
  let expectedLocalOffset = 0;
  let previousName = null;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > eocdOffset || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIP central header is missing or truncated");
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
    if (versionMadeBy !== 20 || versionNeeded !== 20 || flags !== 0x0800 || method !== 0 || dosTime !== 0 || dosDate !== 0x0021 || compressed !== size || extraLength !== 0 || commentLength !== 0 || diskStart !== 0 || internalAttributes !== 0 || externalAttributes !== 0) throw new Error("ZIP central entry is not canonical stored UTF-8 with fixed timestamp");
    if (!nameLength || cursor + 46 + nameLength > eocdOffset) throw new Error("ZIP central name is empty or truncated");
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString("utf8");
    if (!Buffer.from(name, "utf8").equals(nameBytes)) throw new Error("ZIP entry name is not canonical UTF-8");
    safeRelativePath(name, "ZIP entry");
    assertAllowedEntry(name);
    if (previousName !== null && lexicalCompare(previousName, name) >= 0) throw new Error("ZIP entries are not in unique strict lexical byte order");
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
    if (localOffset + 30 + localNameLength + localExtraLength > centralOffset) throw new Error(`ZIP local name overlaps the central directory: ${name}`);
    const localNameBytes = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    const localName = localNameBytes.toString("utf8");
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + localCompressed;
    if (dataEnd > centralOffset) throw new Error(`ZIP local data overlaps the central directory: ${name}`);
    const data = bytes.subarray(dataStart, dataEnd);
    if (localVersion !== versionNeeded || localFlags !== flags || localMethod !== method || localTime !== dosTime || localDate !== dosDate || localChecksum !== checksum || localCompressed !== compressed || localSize !== size || localNameLength !== nameLength || localExtraLength !== extraLength || localName !== name || !localNameBytes.equals(nameBytes) || data.length !== size || crc32(data) !== checksum) throw new Error(`ZIP local/central/header/CRC mismatch: ${name}`);
    entries.push({ path: name, data: Buffer.from(data), byteSize: size, sha256: sha256(data) });
    expectedLocalOffset = dataEnd;
    cursor += 46 + nameLength;
  }
  if (expectedLocalOffset !== centralOffset || cursor !== eocdOffset) throw new Error("ZIP local and central coverage is not exact");
  return entries;
}

function normalizeHeading(value) {
  const normalized = value.trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  return normalized === "implementation risks" ? "implementation risk" : normalized;
}

export function validateRoutePlanText(text, label = "route plan") {
  const source = String(text);
  const sections = new Map();
  const matches = [...source.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)];
  for (let index = 0; index < matches.length; index += 1) {
    const heading = normalizeHeading(matches[index][1].replace(/^\d+[.)]\s*/, ""));
    const start = matches[index].index + matches[index][0].length;
    const end = matches[index + 1]?.index ?? source.length;
    if (sections.has(heading)) throw new Error(`${label} repeats section: ${matches[index][1]}`);
    sections.set(heading, source.slice(start, end).trim());
  }
  for (const match of source.matchAll(/^\s*\d+\.\s+\*\*(.+?):\*\*\s+(.+)\s*$/gm)) {
    const heading = normalizeHeading(match[1]);
    if (sections.has(heading)) continue;
    sections.set(heading, match[2].trim());
  }
  for (const required of ROUTE_PLAN_HEADINGS) {
    const body = sections.get(normalizeHeading(required));
    if (!body || body.replace(/[`*_#>|\-\s]/g, "").length < 8) throw new Error(`${label} is missing a substantive Markdown section: ${required}`);
  }
  return true;
}

function exactObject(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) throw new Error(`${label} differs from the exact contract`);
}

function prefixedMap(mapping, prefix) { return Object.fromEntries(Object.entries(mapping).map(([key, value]) => [key, `${prefix}/${value}`])); }

function typeForPath(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return "document";
}

function validateMediaRolePath(value, routeId, role, contract, entryPaths) {
  if (typeof value !== "string" || !entryPaths.has(value)) throw new Error(`route ${routeId} role ${role} does not name an archive entry`);
  const expectedDirectory = `route-preproduction/routes/${routeId}`;
  if (path.posix.dirname(value) !== expectedDirectory || path.posix.basename(value, path.posix.extname(value)) !== contract.stem || !contract.types.includes(typeForPath(value))) throw new Error(`route ${routeId} role ${role} path/type differs from the canonical role contract`);
}

function validateArchiveSurfaces(entryPaths) {
  const crt = [...entryPaths].filter((entry) => entry.startsWith("deployed-crt/")).map((entry) => entry.slice("deployed-crt/".length));
  const allowedCrtTop = new Set(["recordings", "screenshots", "sheets", "reports"]);
  for (const relativePath of crt) if (!allowedCrtTop.has(relativePath.split("/")[0])) throw new Error(`deployed CRT archive has an unexpected top-level path: ${relativePath}`);
  const exactDirectories = {
    recordings: Object.values(CRT_REQUIRED_FILES).filter((relativePath) => relativePath.startsWith("recordings/")),
    sheets: Object.values(CRT_REQUIRED_FILES).filter((relativePath) => relativePath.startsWith("sheets/")),
    reports: Object.keys(CRT_REPORT_SCHEMAS),
  };
  for (const [directory, expected] of Object.entries(exactDirectories)) {
    const observed = crt.filter((relativePath) => relativePath.startsWith(`${directory}/`)).sort(lexicalCompare);
    if (JSON.stringify(observed) !== JSON.stringify([...expected].sort(lexicalCompare))) throw new Error(`deployed CRT ${directory} inventory differs from the exact capture contract`);
  }
  const screenshots = crt.filter((relativePath) => relativePath.startsWith("screenshots/"));
  if (!screenshots.length || screenshots.some((relativePath) => path.posix.dirname(relativePath) !== "screenshots" || path.posix.extname(relativePath).toLowerCase() !== ".png")) throw new Error("deployed CRT screenshots must be a non-empty flat PNG inventory");
  const routeSurface = [...entryPaths].filter((entry) => entry.startsWith("route-preproduction/")).map((entry) => entry.slice("route-preproduction/".length));
  const allowedRouteTop = new Set(["routes", "cross-route-system", "reports", "README.md", "route-preproduction-manifest.json"]);
  for (const relativePath of routeSurface) if (!allowedRouteTop.has(relativePath.split("/")[0])) throw new Error(`route-preproduction archive has an unexpected top-level path: ${relativePath}`);
  const expectedCrossRoute = [...new Set([...Object.values(CROSS_ROUTE_FILES), COHERENCE_MATRIX])].sort(lexicalCompare);
  const observedCrossRoute = routeSurface.filter((relativePath) => relativePath.startsWith("cross-route-system/")).sort(lexicalCompare);
  if (JSON.stringify(observedCrossRoute) !== JSON.stringify(expectedCrossRoute)) throw new Error("cross-route-system inventory differs from the exact local capture contract");
  const expectedReports = [...new Set(Object.values(ROUTE_REPORT_FILES).filter((relativePath) => relativePath.startsWith("reports/")))].sort(lexicalCompare);
  const observedReports = routeSurface.filter((relativePath) => relativePath.startsWith("reports/")).sort(lexicalCompare);
  if (JSON.stringify(observedReports) !== JSON.stringify(expectedReports)) throw new Error("route-preproduction reports inventory differs from the exact local capture contract");
  const rootFiles = routeSurface.filter((relativePath) => !relativePath.includes("/")).sort(lexicalCompare);
  if (JSON.stringify(rootFiles) !== JSON.stringify(["README.md", "route-preproduction-manifest.json"])) throw new Error("route-preproduction root files differ from the exact local capture contract");
}

export function validateArtifactRoles(artifactRoles, entryPaths) {
  if (!artifactRoles || typeof artifactRoles !== "object") throw new Error("manifest artifact-role map is absent");
  validateArchiveSurfaces(entryPaths);
  exactObject(artifactRoles.crtAmendment, prefixedMap(CRT_REQUIRED_FILES, "deployed-crt"), "CRT artifact roles");
  const routePreproduction = artifactRoles.routePreproduction;
  if (!routePreproduction || routePreproduction.routeCoherenceMatrix !== `route-preproduction/${COHERENCE_MATRIX}`) throw new Error("route coherence matrix role differs");
  exactObject(routePreproduction.crossRouteSystem, prefixedMap(CROSS_ROUTE_FILES, "route-preproduction"), "cross-route-system roles");
  const expectedReports = {
    gitProvenance: `deployed-crt/${CRT_REQUIRED_FILES.gitDeploymentProvenanceReport}`,
    deployedCrtAmendment: `deployed-crt/${CRT_REQUIRED_FILES.scrollAddressedCrtReport}`,
    browserQa: `deployed-crt/${CRT_REQUIRED_FILES.browserDiagnosticsReport}`,
    accessibility: `deployed-crt/${CRT_REQUIRED_FILES.fallbackAccessibilityReport}`,
    ...prefixedMap(ROUTE_REPORT_FILES, "route-preproduction"),
  };
  exactObject(routePreproduction.reports, expectedReports, "report roles");
  const expectedRouteIds = ROUTES.map(({ id }) => id).sort(lexicalCompare);
  const observedRouteIds = Object.keys(routePreproduction.routes ?? {}).sort(lexicalCompare);
  if (JSON.stringify(observedRouteIds) !== JSON.stringify(expectedRouteIds)) throw new Error("manifest must bind exactly all nine route folders");
  const archivedRouteIds = [...new Set([...entryPaths].filter((entry) => entry.startsWith("route-preproduction/routes/")).map((entry) => entry.split("/")[2]).filter(Boolean))].sort(lexicalCompare);
  if (JSON.stringify(archivedRouteIds) !== JSON.stringify(expectedRouteIds)) throw new Error("ZIP route folder inventory must be exactly the nine required folders");
  for (const route of ROUTES) {
    const item = routePreproduction.routes[route.id];
    if (item?.publicRoute !== route.publicRoute || item?.publicLabel !== route.publicLabel) throw new Error(`route identity differs: ${route.id}`);
    const roles = item.roles;
    if (!roles || Object.keys(roles).length !== Object.keys(ROUTE_FIXED_ROLES).length + Object.keys(ROUTE_MEDIA_ROLES).length) throw new Error(`route role count differs: ${route.id}`);
    for (const [role, basename] of Object.entries(ROUTE_FIXED_ROLES)) {
      const expected = `route-preproduction/routes/${route.id}/${basename}`;
      if (roles[role] !== expected || !entryPaths.has(expected)) throw new Error(`route ${route.id} fixed role differs: ${role}`);
    }
    for (const [role, contract] of Object.entries(ROUTE_MEDIA_ROLES)) validateMediaRolePath(roles[role], route.id, role, contract, entryPaths);
    const directory = `route-preproduction/routes/${route.id}`;
    const observedFiles = [...entryPaths].filter((relativePath) => path.posix.dirname(relativePath) === directory).sort(lexicalCompare);
    const expectedFiles = Object.values(roles).sort(lexicalCompare);
    if (JSON.stringify(observedFiles) !== JSON.stringify(expectedFiles)) throw new Error(`route ${route.id} must contain exactly the 15 required artifacts`);
  }
  for (const rolePath of [
    ...Object.values(artifactRoles.crtAmendment),
    routePreproduction.routeCoherenceMatrix,
    ...Object.values(routePreproduction.crossRouteSystem),
    ...Object.values(routePreproduction.reports),
  ]) if (!entryPaths.has(rolePath)) throw new Error(`required role target is absent from ZIP: ${rolePath}`);
  return true;
}

function validateManifest(manifest, options, entries) {
  if (manifest?.schema !== PACKAGE_SCHEMA || manifest.status !== "PASS" || manifest.generatedAt !== FIXED_EPOCH) throw new Error("manifest schema/status/fixed timestamp differs");
  exactObject(manifest.humanReviewGates, HUMAN_REVIEW_GATES, "six human-review gates");
  exactObject(manifest.authorization, AUTHORIZATION, "authorization denial");
  exactObject(manifest.policy, {
    phase5B: "UNAUTHORIZED", allSixHumanGates: "PENDING HUMAN REVIEW", authorMaySelfApprove: false,
    deployerMaySelfApprove: false, machinePassGrantsHumanAcceptance: false,
  }, "Phase 5B/self-approval policy");
  const source = manifest.source ?? {};
  if (source.branch !== options.expectedBranch || source.head !== options.expectedHead || source.acceptedBase !== options.expectedBase || source.acceptedPhase4BranchHead !== options.expectedBase || source.frozenMain !== options.expectedMain || source.frozenMainUpstream !== options.expectedMain || source.frozenMainLiveRemote !== options.expectedMain || source.upstreamHead !== options.expectedUpstream || source.liveRemoteHead !== options.expectedUpstream || source.clean !== true
    || source.productionBlenderSourceSha256 !== options.expectedSourceSha256 || source.activeProductionMediaManifestSha256 !== options.expectedMediaManifestSha256
    || !Array.isArray(source.commitChain) || !source.commitChain.length || source.commitChain.at(-1) !== options.expectedHead || source.commitChain.some((commit) => !HASH40.test(commit))) throw new Error("manifest Git/source provenance differs from explicit bindings");
  const deployment = manifest.deployment ?? {};
  if (deployment.deploymentId !== options.expectedDeploymentId || deployment.project !== options.deploymentProject || deployment.checkRunId !== String(options.deploymentCheckRunId) || deployment.immutableUrl !== options.immutableUrl || deployment.branchUrl !== options.branchUrl || deployment.commit !== options.expectedHead) throw new Error("manifest deployment identity differs from explicit bindings");
  const deployed = manifest.provenance?.deployedCrt;
  const local = manifest.provenance?.localRoutePreproduction;
  if (deployed?.archivePrefix !== "deployed-crt/" || deployed.classification !== "DEPLOYED IMMUTABLE CRT EVIDENCE" || deployed.deployed !== true || deployed.speculative !== false || deployed.captureTarget !== options.immutableUrl || !HASH64.test(deployed.captureManifestSha256 ?? "")) throw new Error("deployed CRT provenance classification differs");
  if (local?.archivePrefix !== "route-preproduction/" || local.classification !== "LOCAL SPECULATIVE PREPRODUCTION" || local.deployed !== false || local.speculative !== true || local.publicationStatus !== "EXTERNAL UNTRACKED HUMAN-REVIEW ARTIFACTS ONLY" || !HASH64.test(local.captureManifestSha256 ?? "")) throw new Error("local speculative route provenance classification differs");
  if (stableJson(manifest.deterministicArchive) !== stableJson({ compression: "stored", fixedDosTimestamp: FIXED_EPOCH, lexicalUtf8ByteOrder: true, zip64: false })) throw new Error("deterministic archive declaration differs");
  const files = manifest.files;
  if (!Array.isArray(files) || !files.length || new Set(files.map((record) => record.relativePath)).size !== files.length) throw new Error("manifest non-self file ledger is absent or non-unique");
  const orderedPaths = files.map((record) => record.relativePath);
  const sortedPaths = [...orderedPaths].sort(lexicalCompare);
  if (JSON.stringify(orderedPaths) !== JSON.stringify(sortedPaths)) throw new Error("manifest file ledger is not in lexical UTF-8 byte order");
  const entryPaths = entries.map((entry) => entry.path);
  const expectedEntryPaths = [...orderedPaths, IN_ARCHIVE_MANIFEST].sort(lexicalCompare);
  if (JSON.stringify(entryPaths) !== JSON.stringify(expectedEntryPaths)) throw new Error("manifest coverage of ZIP entries is not exact and exhaustive");
  if (stableJson(manifest.unhashedSelfEntries) !== stableJson([IN_ARCHIVE_MANIFEST])) throw new Error("manifest self-hash exception differs");
  const deployedCount = files.filter((record) => record.sourceClass === "DEPLOYED_CRT_EVIDENCE").length;
  const localCount = files.filter((record) => record.sourceClass === "LOCAL_SPECULATIVE_ROUTE_PREPRODUCTION").length;
  if (manifest.inventory?.routeFolderCount !== 9 || manifest.inventory.deployedCrtFileCount !== deployedCount || manifest.inventory.localRoutePreproductionFileCount !== localCount || manifest.inventory.hashedNonSelfArchiveFileCount !== files.length || manifest.inventory.archiveEntryCount !== entries.length || manifest.inventory.hashedNonSelfArchiveBytes !== files.reduce((sum, record) => sum + record.byteSize, 0)) throw new Error("manifest inventory aggregates differ");
  if (manifest.traceability?.everyNonSelfArchiveFileHasSha256 !== true || manifest.traceability?.manifestSelfHashAuthority !== `detached audit file ${AUDIT_FILENAME}`) throw new Error("manifest hash traceability declaration differs");
  const tooling = manifest.traceability?.trackedTooling;
  if (!Array.isArray(tooling) || tooling.length !== 2 || stableJson(tooling.map((item) => item.relativePath).sort(lexicalCompare)) !== stableJson(["scripts/audit-phase5a-human-review.mjs", "scripts/package-phase5a-human-review.mjs"])) throw new Error("tracked package-tool traceability differs");
  const productionAuthorities = manifest.traceability?.trackedProductionAuthorities;
  if (!Array.isArray(productionAuthorities) || productionAuthorities.length !== 2 || stableJson(productionAuthorities.map((item) => item.relativePath)) !== stableJson([PRODUCTION_BLEND_RELATIVE, ACTIVE_MEDIA_MANIFEST_RELATIVE])
    || productionAuthorities[0]?.sha256 !== options.expectedSourceSha256 || productionAuthorities[1]?.sha256 !== options.expectedMediaManifestSha256) throw new Error("tracked production authority traceability differs");
  for (const record of files) {
    assertAllowedEntry(record.relativePath);
    const expectedSourceClass = record.relativePath === README_FILENAME ? "GENERATED_REVIEW_GUIDE" : record.relativePath.startsWith("deployed-crt/") ? "DEPLOYED_CRT_EVIDENCE" : "LOCAL_SPECULATIVE_ROUTE_PREPRODUCTION";
    if (record.sourceClass !== expectedSourceClass || record.kind !== typeForPath(record.relativePath) || !Number.isSafeInteger(record.byteSize) || record.byteSize <= 0 || !HASH64.test(record.sha256 ?? "") || typeof record.purpose !== "string" || record.purpose.length < 12) throw new Error(`manifest record differs: ${record.relativePath}`);
    if (["image", "video"].includes(record.kind) !== Boolean(record.media)) throw new Error(`manifest media record differs: ${record.relativePath}`);
  }
  const fileLedger = new Map(files.map((record) => [record.relativePath, record]));
  if (fileLedger.get(`deployed-crt/${CRT_REQUIRED_FILES.browserEvidenceManifest}`)?.sha256 !== deployed.captureManifestSha256 || fileLedger.get(`route-preproduction/${ROUTE_REPORT_FILES.routePreproductionManifest}`)?.sha256 !== local.captureManifestSha256) throw new Error("capture-manifest provenance hashes differ from the wrapper file ledger");
  validateArtifactRoles(manifest.traceability?.artifactRoles, new Set(entryPaths));
  return files;
}

async function run(command, args, label, maxBuffer = 3_000_000) {
  try { return await execFileAsync(command, args, { windowsHide: true, maxBuffer }); }
  catch (error) { throw new Error(`${label} failed: ${String(error.stderr || error.stdout || error.message).slice(-4_000)}`); }
}

async function validateFfprobe(executable) {
  const resolved = await realpath(executable);
  if (!(await stat(resolved)).isFile()) throw new Error("--ffprobe does not resolve to a regular file");
  await run(resolved, ["-version"], "explicit ffprobe identity", 1_000_000);
  return resolved;
}

async function validateImage(bytes, label) {
  const image = sharp(bytes, { failOn: "error", limitInputPixels: 200_000_000, sequentialRead: true });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.pages && metadata.pages !== 1 || !["png", "jpeg", "webp"].includes(metadata.format)) throw new Error(`image metadata/format contract failed: ${label}`);
  await image.clone().raw().toBuffer();
  return { format: metadata.format, width: metadata.width, height: metadata.height, fullDecodePass: true };
}

function parseRate(value) {
  const [numerator, denominator] = String(value ?? "").split("/").map(Number);
  return numerator > 0 && denominator > 0 ? numerator / denominator : Number.NaN;
}

async function probeVideo(ffprobe, file, label) {
  const { stdout } = await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=format_name,duration", "-of", "json", file], `explicit ffprobe validation for ${label}`);
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error(`ffprobe returned invalid JSON for ${label}`); }
  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const probe = {
    formatName: parsed.format?.format_name ?? null, durationSeconds: Number(parsed.format?.duration), codec: video?.codec_name ?? null,
    pixelFormat: video?.pix_fmt ?? null, width: Number(video?.width), height: Number(video?.height),
    averageFrameRate: video?.avg_frame_rate ?? null, realFrameRate: video?.r_frame_rate ?? null,
    frameCount: Number(video?.nb_read_frames), videoStreamCount: streams.filter((stream) => stream.codec_type === "video").length,
    audioStreamCount: streams.filter((stream) => stream.codec_type === "audio").length,
    otherStreamCount: streams.filter((stream) => !["video", "audio"].includes(stream.codec_type)).length,
  };
  const fps = parseRate(probe.averageFrameRate);
  if (!String(probe.formatName).split(",").includes("mp4") || probe.videoStreamCount !== 1 || probe.audioStreamCount !== 0 || probe.otherStreamCount !== 0 || probe.codec !== "h264" || probe.pixelFormat !== "yuv420p"
    || !Number.isFinite(probe.durationSeconds) || probe.durationSeconds <= 0 || probe.durationSeconds > 600 || !Number.isSafeInteger(probe.frameCount) || probe.frameCount <= 0 || probe.frameCount > 72_000
    || !Number.isSafeInteger(probe.width) || !Number.isSafeInteger(probe.height) || probe.width < 16 || probe.height < 16 || probe.width > 8192 || probe.height > 8192 || !Number.isFinite(fps) || fps <= 0 || fps > 120) throw new Error(`MP4 ffprobe contract failed: ${label} ${JSON.stringify(probe)}`);
  return { ...probe, ffprobeValidated: true };
}

function flattenScalars(value, output = []) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") output.push(String(value));
  else if (Array.isArray(value)) for (const item of value) flattenScalars(item, output);
  else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) { output.push(key); flattenScalars(child, output); }
  return output;
}

function containsScalar(document, expected, { caseInsensitive = false, url = false } = {}) {
  return flattenScalars(document).some((candidate) => {
    if (url) { try { return new URL(candidate).toString() === expected; } catch { return false; } }
    return caseInsensitive ? candidate.toLowerCase() === String(expected).toLowerCase() : candidate === String(expected);
  });
}

function validateRequiredReports(byPath, options) {
  const parsed = {};
  for (const [relative, expectedSchema] of Object.entries(CRT_REPORT_SCHEMAS)) {
    const packagePath = `deployed-crt/${relative}`;
    const entry = byPath.get(packagePath);
    if (!entry) throw new Error(`required CRT report is absent: ${packagePath}`);
    let value;
    try { value = JSON.parse(entry.data.toString("utf8")); } catch { throw new Error(`required CRT report is invalid JSON: ${packagePath}`); }
    if (value?.schema !== expectedSchema || value.status !== "PASS") throw new Error(`${packagePath} must have the exact schema and status PASS`);
    parsed[relative] = value;
  }
  const captureManifestPath = CRT_REQUIRED_FILES.browserEvidenceManifest;
  const captureManifest = parsed[captureManifestPath];
  exactObject(captureManifest.humanReviewGates, HUMAN_REVIEW_GATES, "deployed CRT evidence manifest human gates");
  const ledger = captureManifest.artifacts ?? captureManifest.files;
  if (!Array.isArray(ledger) || !ledger.length) throw new Error("deployed CRT evidence manifest has no exhaustive artifact ledger");
  const expectedCapturePaths = [...byPath.keys()].filter((relativePath) => relativePath.startsWith("deployed-crt/") && relativePath !== `deployed-crt/${captureManifestPath}`).map((relativePath) => relativePath.slice("deployed-crt/".length)).sort(lexicalCompare);
  const observedCapturePaths = ledger.map((record) => record.relativePath).sort(lexicalCompare);
  if (new Set(observedCapturePaths).size !== observedCapturePaths.length || JSON.stringify(observedCapturePaths) !== JSON.stringify(expectedCapturePaths)) throw new Error("deployed CRT evidence manifest coverage is not exact and exhaustive");
  for (const record of ledger) {
    const authority = byPath.get(`deployed-crt/${record.relativePath}`);
    const byteSize = record.byteSize ?? record.bytes;
    if (!authority || authority.byteSize !== byteSize || authority.sha256 !== record.sha256) throw new Error(`deployed CRT evidence manifest hash/size mismatch: ${record.relativePath}`);
  }
  const gitReport = parsed[CRT_REQUIRED_FILES.gitDeploymentProvenanceReport];
  for (const expected of [options.expectedHead, options.expectedBase, options.expectedMain, options.expectedUpstream]) if (!containsScalar(gitReport, expected, { caseInsensitive: true })) throw new Error(`archived Git provenance omits exact identity ${expected}`);
  const deployment = gitReport;
  const deploymentBindings = [[options.expectedHead, { caseInsensitive: true }], [options.expectedDeploymentId, {}], [options.deploymentProject, {}], [options.deploymentCheckRunId, {}], [options.immutableUrl, { url: true }], [options.branchUrl, { url: true }]];
  for (const [expected, mode] of deploymentBindings) if (!containsScalar(deployment, expected, mode)) throw new Error(`archived deployment report omits exact identity ${expected}`);
  if (!containsScalar(parsed[CRT_REQUIRED_FILES.browserDiagnosticsReport], options.immutableUrl, { url: true })) throw new Error("archived browser QA is not bound to the immutable deployment URL");
}

function validateRouteEvidence(byPath, wrapperFiles) {
  const manifestRelative = ROUTE_REPORT_FILES.routePreproductionManifest;
  const manifestEntry = byPath.get(`route-preproduction/${manifestRelative}`);
  let manifest;
  try { manifest = JSON.parse(manifestEntry?.data.toString("utf8") ?? ""); }
  catch { throw new Error("route-preproduction manifest is missing or invalid JSON"); }
  const routeIds = ROUTES.map(({ id }) => id);
  if (manifest.schema !== "qh.phase5a.route-preproduction-manifest.v1" || manifest.status !== "PASS" || manifest.provenance !== "local speculative preproduction" || manifest.canary !== "QH_PHASE5A_ROUTE_LAB_ONLY"
    || JSON.stringify(manifest.routes) !== JSON.stringify(routeIds) || manifest.routeArtifactsPerRoute !== 15 || manifest.phase5BAuthorized !== false || manifest.humanGates !== "all six pending") throw new Error("route-preproduction manifest identity/provenance/authorization differs");
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("route-preproduction manifest has no exhaustive file ledger");
  const expectedPaths = [...byPath.keys()].filter((relativePath) => relativePath.startsWith("route-preproduction/") && relativePath !== `route-preproduction/${manifestRelative}`).map((relativePath) => relativePath.slice("route-preproduction/".length)).sort(lexicalCompare);
  const observedPaths = manifest.files.map((record) => record.path).sort(lexicalCompare);
  if (new Set(observedPaths).size !== observedPaths.length || JSON.stringify(observedPaths) !== JSON.stringify(expectedPaths)) throw new Error("route-preproduction manifest coverage is not exact and exhaustive");
  for (const record of manifest.files) {
    const authority = byPath.get(`route-preproduction/${record.path}`);
    if (!authority || authority.byteSize !== record.bytes || authority.sha256 !== record.sha256) throw new Error(`route-preproduction manifest hash/size mismatch: ${record.path}`);
    if (path.posix.extname(record.path).toLowerCase() === ".png") {
      const wrapperRecord = wrapperFiles.get(`route-preproduction/${record.path}`);
      if (record.media?.type !== "image" || record.media.format !== wrapperRecord?.media?.format || record.media.width !== wrapperRecord?.media?.width || record.media.height !== wrapperRecord?.media?.height) throw new Error(`route-preproduction manifest image metadata mismatch: ${record.path}`);
    }
  }
  if (manifest.totals?.files !== manifest.files.length || manifest.totals.bytes !== manifest.files.reduce((sum, record) => sum + record.bytes, 0)) throw new Error("route-preproduction manifest totals differ");
  let accessibility;
  let browser;
  try {
    accessibility = JSON.parse(byPath.get(`route-preproduction/${ROUTE_REPORT_FILES.routeAccessibility}`)?.data.toString("utf8") ?? "");
    browser = JSON.parse(byPath.get(`route-preproduction/${ROUTE_REPORT_FILES.routeBrowserCapture}`)?.data.toString("utf8") ?? "");
  } catch { throw new Error("route accessibility/browser capture report is invalid JSON"); }
  if (accessibility.schema !== "qh.phase5a.route-accessibility.v1" || accessibility.status !== "PASS" || accessibility.seriousOrCriticalViolations !== 0 || JSON.stringify(accessibility.routes) !== JSON.stringify(routeIds)) throw new Error("route accessibility report differs");
  const expectedViewports = [
    { id: "desktop", width: 1440, height: 900 }, { id: "short-desktop", width: 1366, height: 650 }, { id: "tablet-landscape", width: 1024, height: 768 },
    { id: "portrait", width: 768, height: 1024 }, { id: "mobile", width: 390, height: 844 }, { id: "mobile-narrow", width: 320, height: 800 }, { id: "mobile-landscape", width: 844, height: 390 },
  ];
  if (browser.schema !== "qh.phase5a.route-preproduction-capture.v1" || browser.status !== "PASS" || browser.canary !== "QH_PHASE5A_ROUTE_LAB_ONLY" || browser.provenance?.type !== "local-authored-preproduction" || browser.provenance?.public !== false || browser.provenance?.productionRouteBytesChanged !== false || browser.routeCount !== 9
    || JSON.stringify(browser.requiredViewports) !== JSON.stringify(expectedViewports) || JSON.stringify(browser.specialResponsiveStates) !== JSON.stringify(["200% text", "fallback font", "open mobile navigation", "keyboard focus"])
    || browser.requestIsolation?.status !== "PASS" || browser.requestIsolation.external !== 0 || browser.requestIsolation.cinematic !== 0 || browser.requestIsolation.video !== 0 || browser.reducedMotion !== "PASS" || browser.noJs !== "PASS" || browser.fixedOrSticky !== 0 || browser.horizontalOverflow !== 0 || browser.phase5BAuthorized !== false) throw new Error("route browser-capture report differs");
  const readme = byPath.get("route-preproduction/README.md")?.data.toString("utf8") ?? "";
  for (const statement of ["local-only HTML/CSS lab", "speculative human-review material", "not deployed public routes", "Phase 5B remains unauthorized", "All six human gates remain pending"]) if (!readme.includes(statement)) throw new Error(`route-preproduction README omits required statement: ${statement}`);
}

async function validateTrackedTraceability(items, label) {
  for (const item of items) {
    const file = path.resolve(ROOT, ...item.relativePath.split("/"));
    if (!isWithin(ROOT, file) || !(await stat(file)).isFile()) throw new Error(`${label} path is unavailable: ${item.relativePath}`);
    const bytes = await readFile(file);
    if (bytes.length !== item.byteSize || sha256(bytes) !== item.sha256) throw new Error(`${label} hash/size differs: ${item.relativePath}`);
  }
}

async function auditArchive(inputOptions) {
  const options = validateOptionShape(inputOptions);
  if (process.pid === options.expectedParentProcessId || process.ppid !== options.expectedParentProcessId) throw new Error("auditor was not launched as the expected distinct child process");
  const [archivePath, manifestPath, ffprobe] = await Promise.all([realpath(options.archive), realpath(options.manifest), validateFfprobe(options.ffprobe)]);
  assertExternalPath(archivePath, "resolved archive");
  assertExternalPath(manifestPath, "resolved detached manifest");
  assertExternalPath(options.auditOutput, "audit output");
  if (path.dirname(archivePath) !== path.dirname(manifestPath) || path.dirname(archivePath) !== path.dirname(path.resolve(options.auditOutput))) throw new Error("resolved archive, manifest, and audit are not siblings");
  try { await access(options.auditOutput); throw new Error("audit output already exists and will not be overwritten"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const [archiveBytes, detachedBytes] = await Promise.all([readFile(archivePath), readFile(manifestPath)]);
  const entries = parseStoredZip(archiveBytes);
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const archivedManifest = byPath.get(IN_ARCHIVE_MANIFEST);
  const readme = byPath.get(README_FILENAME);
  if (!archivedManifest || !readme || !archivedManifest.data.equals(detachedBytes)) throw new Error("README/manifest presence or detached-to-archived parity differs");
  let manifest;
  try { manifest = JSON.parse(detachedBytes.toString("utf8")); } catch { throw new Error("detached manifest is invalid JSON"); }
  if (!Buffer.from(stableJson(manifest), "utf8").equals(detachedBytes)) throw new Error("detached manifest bytes are not canonical stable JSON");
  const files = validateManifest(manifest, options, entries);
  await validateTrackedTraceability(manifest.traceability.trackedTooling, "tracked tooling");
  await validateTrackedTraceability(manifest.traceability.trackedProductionAuthorities, "tracked production authority");
  for (const entry of entries) { assertAllowedEntry(entry.path); assertNoPrivateText(entry.data, entry.path); }
  const media = [];
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase5a-review-audit-"));
  try {
    for (const record of files) {
      const entry = byPath.get(record.relativePath);
      if (!entry || entry.byteSize !== record.byteSize || entry.sha256 !== record.sha256) throw new Error(`manifest hash/size mismatch: ${record.relativePath}`);
      const extension = path.posix.extname(record.relativePath).toLowerCase();
      if (record.kind === "image") {
        const decoded = await validateImage(entry.data, record.relativePath);
        if (stableJson(decoded) !== stableJson(record.media)) throw new Error(`image metadata differs from manifest: ${record.relativePath}`);
        media.push({ relativePath: record.relativePath, kind: "image", ...decoded });
      } else if (record.kind === "video") {
        const extracted = path.join(temporary, `${media.length}.mp4`);
        await writeFile(extracted, entry.data, { flag: "wx" });
        const probed = await probeVideo(ffprobe, extracted, record.relativePath);
        if (stableJson(probed) !== stableJson(record.media)) throw new Error(`MP4 ffprobe metadata differs from manifest: ${record.relativePath}`);
        media.push({ relativePath: record.relativePath, kind: "video", ...probed });
      } else if (extension === ".json") {
        try { JSON.parse(entry.data.toString("utf8")); } catch { throw new Error(`archived JSON is invalid: ${record.relativePath}`); }
      } else if (entry.data.toString("utf8").trim().length < 12) throw new Error(`archived human-readable payload is insubstantial: ${record.relativePath}`);
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
  for (const route of ROUTES) {
    const planPath = `route-preproduction/routes/${route.id}/${ROUTE_FIXED_ROLES.routePlan}`;
    validateRoutePlanText(byPath.get(planPath)?.data.toString("utf8") ?? "", planPath);
  }
  validateRequiredReports(byPath, options);
  validateRouteEvidence(byPath, new Map(files.map((record) => [record.relativePath, record])));
  const readmeText = readme.data.toString("utf8");
  for (const statement of ["local, speculative, external/untracked preproduction", "author and deployer may not self-approve", "All six human gates remain PENDING HUMAN REVIEW", "Phase 5B production implementation is UNAUTHORIZED"]) if (!readmeText.includes(statement)) throw new Error(`README omits required provenance/authorization statement: ${statement}`);
  const audit = {
    schema: AUDIT_SCHEMA,
    status: "PASS",
    generatedAt: FIXED_EPOCH,
    process: { auditorProcessId: process.pid, parentProcessId: process.ppid, expectedParentProcessId: options.expectedParentProcessId, separateProcess: true },
    archive: { filename: ARCHIVE_FILENAME, byteSize: archiveBytes.length, sha256: sha256(archiveBytes), entryCount: entries.length },
    manifest: { filename: DETACHED_MANIFEST_FILENAME, byteSize: detachedBytes.length, sha256: sha256(detachedBytes), detachedEqualsArchived: true },
    inventory: manifest.inventory,
    media,
    checks: {
      canonicalStoredZip: true,
      crcAndLocalCentralHeaderParity: true,
      lexicalUtf8Ordering: true,
      fixedTimestamps: true,
      exactManifestCoverage: true,
      everyNonSelfFileHashAndSizeMatches: true,
      manifestHashRecordedByAudit: true,
      everyImageFullyDecodedWithSharp: true,
      everyMp4ValidatedWithExplicitFfprobe: true,
      rawWebmAndUnsafeMediaExcluded: true,
      sourceCachePrivateAndSecretPathsExcluded: true,
      privacyAndSecretTextScanPasses: true,
      allNineRouteFoldersAndArtifactRolesPresent: true,
      crossRouteSystemAndReportsPresent: true,
      deployedVsLocalSpeculativeProvenanceBound: true,
      phase5BUnauthorized: true,
      sixHumanGatesPending: true,
      authorAndDeployerSelfApprovalDenied: true,
      externalUntrackedLocation: true,
      separateProcessAudit: true,
    },
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
  };
  const auditBytes = Buffer.from(stableJson(audit), "utf8");
  assertNoPrivateText(auditBytes, AUDIT_FILENAME);
  await mkdir(path.dirname(options.auditOutput), { recursive: true });
  const temporaryAudit = `${options.auditOutput}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryAudit, auditBytes, { flag: "wx" });
  try { await rename(temporaryAudit, options.auditOutput); }
  catch (error) { await unlink(temporaryAudit).catch(() => {}); throw error; }
  process.stdout.write(stableJson({ schema: AUDIT_SCHEMA, status: "PASS", archiveSha256: audit.archive.sha256, manifestSha256: audit.manifest.sha256, auditorProcessId: process.pid, parentProcessId: process.ppid, separateProcess: true }));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  await auditArchive(options);
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { process.stderr.write(`Phase 5A independent audit FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
