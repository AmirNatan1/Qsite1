#!/usr/bin/env node

/**
 * Build the external Phase 5A human-review package.
 *
 * This script intentionally has no Phase 4 imports. It packages two external,
 * untracked authorities: deployed CRT browser evidence and local/speculative
 * supporting-route preproduction. The resulting ZIP is deterministic and is
 * accepted only after scripts/audit-phase5a-human-review.mjs succeeds in a
 * separate Node process.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const PACKAGER = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(PACKAGER), "..");
const AUDITOR = path.join(ROOT, "scripts", "audit-phase5a-human-review.mjs");

export const PACKAGER_RELATIVE = "scripts/package-phase5a-human-review.mjs";
export const AUDITOR_RELATIVE = "scripts/audit-phase5a-human-review.mjs";
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
  "Purpose",
  "Audience",
  "User question answered",
  "Content hierarchy",
  "Proposed page chapters",
  "Emotional/spatial arc",
  "Signature behavior",
  "Motion verbs",
  "Material vocabulary",
  "Media strategy",
  "Publication constraints",
  "Desktop storyboard",
  "Portrait storyboard",
  "Short-landscape storyboard",
  "Reduced-motion version",
  "No-JS version",
  "Performance strategy",
  "Implementation risk",
  "Dependencies",
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
const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 1_500 * 1024 * 1024;
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
    crtEvidenceRoot: null,
    routePreproductionRoot: null,
    expectedHead: null,
    expectedBase: null,
    expectedMain: null,
    expectedUpstream: null,
    expectedBranch: REQUIRED_BRANCH,
    expectedSourceSha256: null,
    expectedMediaManifestSha256: null,
    expectedDeploymentId: null,
    deploymentProject: null,
    deploymentCheckRunId: null,
    immutableUrl: null,
    branchUrl: null,
    ffprobe: null,
    output: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--deployed-crt-evidence-root") options.crtEvidenceRoot = path.resolve(next());
    else if (argument === "--local-route-preproduction-root") options.routePreproductionRoot = path.resolve(next());
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-base") options.expectedBase = next().toLowerCase();
    else if (argument === "--expected-main") options.expectedMain = next().toLowerCase();
    else if (argument === "--expected-upstream") options.expectedUpstream = next().toLowerCase();
    else if (argument === "--expected-branch") options.expectedBranch = next();
    else if (argument === "--expected-source-sha256") options.expectedSourceSha256 = next().toLowerCase();
    else if (argument === "--expected-media-manifest-sha256") options.expectedMediaManifestSha256 = next().toLowerCase();
    else if (argument === "--expected-deployment-id" || argument === "--deployment-id") options.expectedDeploymentId = next();
    else if (argument === "--deployment-project" || argument === "--expected-deployment-project") options.deploymentProject = next();
    else if (argument === "--deployment-check-run-id" || argument === "--expected-deployment-check-run-id") options.deploymentCheckRunId = next();
    else if (argument === "--immutable-url") options.immutableUrl = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--ffprobe") options.ffprobe = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
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

export function validateOptionShape(input) {
  const options = { ...input };
  for (const [key, flag] of [["expectedHead", "--expected-head"], ["expectedBase", "--expected-base"], ["expectedMain", "--expected-main"], ["expectedUpstream", "--expected-upstream"]]) {
    if (!HASH40.test(options[key] ?? "")) throw new Error(`${flag} must be an exact lowercase 40-hex commit`);
  }
  for (const [key, flag] of [["expectedSourceSha256", "--expected-source-sha256"], ["expectedMediaManifestSha256", "--expected-media-manifest-sha256"]]) {
    if (!HASH64.test(options[key] ?? "")) throw new Error(`${flag} must be an exact lowercase 64-hex digest`);
  }
  if (options.expectedBase !== ACCEPTED_PHASE4_SHA) throw new Error(`--expected-base must equal accepted Phase 4 ${ACCEPTED_PHASE4_SHA}`);
  if (options.expectedMain !== FROZEN_MAIN_SHA) throw new Error(`--expected-main must equal frozen main ${FROZEN_MAIN_SHA}`);
  if (options.expectedSourceSha256 !== PRODUCTION_BLEND_SHA256) throw new Error(`--expected-source-sha256 must equal ${PRODUCTION_BLEND_SHA256}`);
  if (options.expectedMediaManifestSha256 !== ACTIVE_MEDIA_MANIFEST_SHA256) throw new Error(`--expected-media-manifest-sha256 must equal ${ACTIVE_MEDIA_MANIFEST_SHA256}`);
  if (options.expectedHead !== options.expectedUpstream) throw new Error("--expected-head and --expected-upstream must be identical at final packaging");
  if (options.expectedBranch !== REQUIRED_BRANCH) throw new Error(`--expected-branch must equal ${REQUIRED_BRANCH}`);
  if (!/^[a-z0-9][a-z0-9._:-]{5,127}$/i.test(options.expectedDeploymentId ?? "")) throw new Error("--expected-deployment-id is absent or malformed");
  if (!/^[a-z0-9][a-z0-9._-]{1,127}$/i.test(options.deploymentProject ?? "")) throw new Error("--deployment-project is absent or malformed");
  if (!/^[1-9][0-9]{0,30}$/.test(String(options.deploymentCheckRunId ?? ""))) throw new Error("--deployment-check-run-id must be a positive decimal identifier");
  options.immutableUrl = normalizedOrigin(options.immutableUrl, "--immutable-url");
  options.branchUrl = normalizedOrigin(options.branchUrl, "--branch-url");
  if (options.immutableUrl === options.branchUrl) throw new Error("immutable and branch URLs must be distinct deployment identities");
  for (const [key, flag] of [["crtEvidenceRoot", "--deployed-crt-evidence-root"], ["routePreproductionRoot", "--local-route-preproduction-root"], ["output", "--output"]]) {
    if (!options[key]) throw new Error(`${flag} is required`);
  }
  if (!options.ffprobe || !path.isAbsolute(options.ffprobe)) throw new Error("--ffprobe must be an explicit absolute executable path");
  if (path.basename(options.output) !== ARCHIVE_FILENAME) throw new Error(`--output basename must be exactly ${ARCHIVE_FILENAME}`);
  return options;
}

function printHelp() {
  process.stdout.write([
    "Phase 5A external human-review package builder",
    "",
    `  node ${PACKAGER_RELATIVE}`,
    "    --deployed-crt-evidence-root <external-directory>",
    "    --local-route-preproduction-root <external-directory>",
    "    --expected-head <40-hex> --expected-base <40-hex>",
    "    --expected-main <40-hex> --expected-upstream <40-hex>",
    `    --expected-branch ${REQUIRED_BRANCH}`,
    "    --expected-source-sha256 <64-hex> --expected-media-manifest-sha256 <64-hex>",
    "    --expected-deployment-id <id> --deployment-project <name>",
    "    --deployment-check-run-id <decimal-id>",
    "    --immutable-url <https-origin/> --branch-url <https-origin/>",
    "    --ffprobe <absolute-executable-path>",
    `    --output <external-directory/${ARCHIVE_FILENAME}>`,
    "",
    "The ZIP, detached manifest, and separate-process audit must not already exist.",
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

export function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertExternalPath(candidate, label = "path") {
  const resolved = path.resolve(candidate);
  if (path.parse(resolved).root === resolved || isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved)) throw new Error(`${label} must be durable, external to the repository and operating-system temporary directory, and not a drive root`);
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
  const lines = [];
  const visit = (node, key = "") => {
    if (typeof node === "string") { lines.push(node); if (key) lines.push(`${key}: ${node}`); }
    else if (Array.isArray(node)) for (const item of node) visit(item, key);
    else if (node && typeof node === "object") for (const [childKey, child] of Object.entries(node)) { lines.push(childKey); visit(child, childKey); }
    else if (key && node !== undefined && node !== null) lines.push(`${key}: ${String(node)}`);
  };
  visit(value);
  return lines.join("\n");
}

export function assertNoPrivateText(bytes, relativePath) {
  if (PRIVATE_OR_SECRET_TEXT.test(String(relativePath))) throw new Error(`privacy/secrets scan failed in package path: ${relativePath}`);
  const extension = path.extname(relativePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) && ![README_FILENAME, IN_ARCHIVE_MANIFEST].includes(relativePath)) return;
  const raw = Buffer.from(bytes).toString("utf8");
  let semantic = raw;
  if (extension === ".json" || relativePath === IN_ARCHIVE_MANIFEST) {
    try { semantic = semanticJsonText(JSON.parse(raw)); } catch { /* JSON syntax is rejected separately. */ }
  }
  if (PRIVATE_OR_SECRET_TEXT.test(semantic)) throw new Error(`privacy/secrets scan failed in human-readable payload: ${relativePath}`);
}

async function run(command, args, label, options = {}) {
  try { return await execFileAsync(command, args, { cwd: options.cwd ?? ROOT, windowsHide: true, maxBuffer: options.maxBuffer ?? 20_000_000 }); }
  catch (error) { throw new Error(`${label} failed: ${String(error.stderr || error.stdout || error.message).slice(-4_000)}`); }
}

async function git(...args) { return (await run("git", args, "Git Phase 5A package authority", { maxBuffer: 5_000_000 })).stdout.trim(); }

async function validateFfprobe(executable) {
  const resolved = await realpath(executable);
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error("--ffprobe does not resolve to a regular file");
  await run(resolved, ["-version"], "explicit ffprobe identity", { maxBuffer: 1_000_000 });
  return resolved;
}

async function repositoryAuthority(options) {
  const trackedInputs = [PACKAGER_RELATIVE, AUDITOR_RELATIVE, PRODUCTION_BLEND_RELATIVE, ACTIVE_MEDIA_MANIFEST_RELATIVE];
  const [head, branch, main, originMain, acceptedPhase4Branch, upstream, upstreamName, statusText, parent, ...tracked] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("branch", "--show-current"),
    git("rev-parse", "main"),
    git("rev-parse", "origin/main"),
    git("rev-parse", "origin/repair/phase-4r2-1-causal-signal-scroll-stability"),
    git("rev-parse", "@{upstream}"),
    git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"),
    git("status", "--porcelain=v1", "--untracked-files=all"),
    git("rev-parse", "HEAD^"),
    ...trackedInputs.map((relative) => git("ls-files", "--error-unmatch", "--", relative)),
  ]);
  if (head !== options.expectedHead || branch !== options.expectedBranch || main !== options.expectedMain || originMain !== options.expectedMain || acceptedPhase4Branch !== options.expectedBase || upstream !== options.expectedUpstream || statusText) throw new Error("local HEAD/branch/main/upstream/accepted-base/clean Git authority differs from explicit bindings");
  if (upstreamName !== `origin/${options.expectedBranch}`) throw new Error(`upstream must be origin/${options.expectedBranch}`);
  for (const [index, result] of tracked.entries()) if (result.replaceAll("\\", "/") !== trackedInputs[index]) throw new Error(`required Phase 5A package tool is not tracked: ${trackedInputs[index]}`);
  await run("git", ["merge-base", "--is-ancestor", options.expectedBase, head], "accepted Phase 5A base ancestry");
  const chain = (await git("rev-list", "--reverse", `${options.expectedBase}..${head}`)).split(/\r?\n/).filter(Boolean);
  if (!chain.length || chain.at(-1) !== head) throw new Error("Phase 5A commit chain is absent or does not terminate at expected HEAD");
  if (await git("rev-parse", `${chain[0]}^`) !== options.expectedBase) throw new Error("the first Phase 5A commit does not have the accepted base as its exact parent");
  const [live, liveMain] = await Promise.all([
    run("git", ["ls-remote", "--heads", "origin", `refs/heads/${options.expectedBranch}`], "live remote Phase 5A parity", { maxBuffer: 1_000_000 }).then(({ stdout }) => stdout.trim().split(/\s+/)[0] ?? ""),
    run("git", ["ls-remote", "--heads", "origin", "refs/heads/main"], "live remote main parity", { maxBuffer: 1_000_000 }).then(({ stdout }) => stdout.trim().split(/\s+/)[0] ?? ""),
  ]);
  if (live !== options.expectedUpstream || liveMain !== options.expectedMain) throw new Error("live origin Phase 5A branch or main differs from explicit authority");
  const authorities = [];
  for (const relativePath of trackedInputs) {
    const bytes = await readFile(path.join(ROOT, ...relativePath.split("/")));
    authorities.push({ relativePath, byteSize: bytes.length, sha256: sha256(bytes) });
  }
  const tooling = authorities.slice(0, 2);
  const productionAuthorities = authorities.slice(2);
  if (productionAuthorities[0].sha256 !== options.expectedSourceSha256 || productionAuthorities[1].sha256 !== options.expectedMediaManifestSha256) throw new Error("tracked production Blender/active-media authority differs from explicit hash bindings");
  return { head, parent, branch, base: options.expectedBase, acceptedPhase4BranchHead: acceptedPhase4Branch, mainHead: main, mainUpstreamHead: originMain, mainLiveRemoteHead: liveMain, upstreamHead: upstream, liveRemoteHead: live, commitChain: chain, clean: true, trackedTooling: tooling, trackedProductionAuthorities: productionAuthorities };
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
      else throw new Error(`non-regular evidence entry is forbidden: ${full}`);
    }
  }
  await visit(root);
  return files.sort(lexicalCompare);
}

function requireExactFiles(inventory, roleMap, label) {
  const available = new Set(inventory);
  const result = {};
  for (const [role, relativePath] of Object.entries(roleMap)) {
    if (!available.has(relativePath)) throw new Error(`${label} is missing ${role}: ${relativePath}`);
    result[role] = relativePath;
  }
  return result;
}

function validateCrtSurface(inventory) {
  const allowedTop = new Set(["recordings", "screenshots", "sheets", "reports"]);
  for (const relativePath of inventory) if (!allowedTop.has(relativePath.split("/")[0])) throw new Error(`deployed CRT evidence has an unexpected top-level path: ${relativePath}`);
  const exactDirectories = {
    recordings: Object.values(CRT_REQUIRED_FILES).filter((relativePath) => relativePath.startsWith("recordings/")),
    sheets: Object.values(CRT_REQUIRED_FILES).filter((relativePath) => relativePath.startsWith("sheets/")),
    reports: Object.keys(CRT_REPORT_SCHEMAS),
  };
  for (const [directory, expected] of Object.entries(exactDirectories)) {
    const observed = inventory.filter((relativePath) => relativePath.startsWith(`${directory}/`)).sort(lexicalCompare);
    const orderedExpected = [...expected].sort(lexicalCompare);
    if (JSON.stringify(observed) !== JSON.stringify(orderedExpected)) throw new Error(`deployed CRT ${directory} inventory differs from the exact capture contract`);
  }
  const screenshots = inventory.filter((relativePath) => relativePath.startsWith("screenshots/"));
  if (!screenshots.length || screenshots.some((relativePath) => path.posix.dirname(relativePath) !== "screenshots" || path.posix.extname(relativePath).toLowerCase() !== ".png")) throw new Error("deployed CRT screenshots must be a non-empty flat PNG inventory");
}

function validateRouteSurface(inventory) {
  const allowedTop = new Set(["routes", "cross-route-system", "reports", "README.md", "route-preproduction-manifest.json"]);
  for (const relativePath of inventory) if (!allowedTop.has(relativePath.split("/")[0])) throw new Error(`route-preproduction root has an unexpected top-level path: ${relativePath}`);
  const expectedCrossRoute = [...new Set([...Object.values(CROSS_ROUTE_FILES), COHERENCE_MATRIX])].sort(lexicalCompare);
  const observedCrossRoute = inventory.filter((relativePath) => relativePath.startsWith("cross-route-system/")).sort(lexicalCompare);
  if (JSON.stringify(observedCrossRoute) !== JSON.stringify(expectedCrossRoute)) throw new Error("cross-route-system inventory differs from the exact local capture contract");
  const expectedReports = [...new Set(Object.values(ROUTE_REPORT_FILES).filter((relativePath) => relativePath.startsWith("reports/")))].sort(lexicalCompare);
  const observedReports = inventory.filter((relativePath) => relativePath.startsWith("reports/")).sort(lexicalCompare);
  if (JSON.stringify(observedReports) !== JSON.stringify(expectedReports)) throw new Error("route-preproduction reports inventory differs from the exact local capture contract");
  const rootFiles = inventory.filter((relativePath) => !relativePath.includes("/")).sort(lexicalCompare);
  if (JSON.stringify(rootFiles) !== JSON.stringify(["README.md", "route-preproduction-manifest.json"])) throw new Error("route-preproduction root files differ from the exact local capture contract");
}

function extensionType(extension) {
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return "text";
}

function requireMediaRole(inventory, directory, role, contract) {
  const candidates = inventory.filter((relativePath) => {
    if (path.posix.dirname(relativePath) !== directory) return false;
    if (path.posix.basename(relativePath, path.posix.extname(relativePath)) !== contract.stem) return false;
    return contract.types.includes(extensionType(path.posix.extname(relativePath).toLowerCase()));
  });
  if (candidates.length !== 1) throw new Error(`${directory} must contain exactly one ${role} artifact named ${contract.stem} with an allowed media extension; observed ${candidates.length}`);
  return candidates[0];
}

function normalizeHeading(value) {
  const normalized = value.trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  return normalized === "implementation risks" ? "implementation risk" : normalized;
}

export function validateRoutePlanText(text, label = "route plan") {
  const sections = new Map();
  const source = String(text);
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

function routeArtifactRoles(inventory) {
  const directorySet = new Set(inventory.filter((item) => item.startsWith("routes/")).map((item) => item.split("/")[1]).filter(Boolean));
  const expected = ROUTES.map(({ id }) => id).sort(lexicalCompare);
  const observed = [...directorySet].sort(lexicalCompare);
  if (JSON.stringify(observed) !== JSON.stringify(expected)) throw new Error(`route folder inventory must be exactly the nine required folders; observed ${observed.join(", ")}`);
  const result = {};
  const available = new Set(inventory);
  for (const route of ROUTES) {
    const directory = `routes/${route.id}`;
    const roles = {};
    for (const [role, basename] of Object.entries(ROUTE_FIXED_ROLES)) {
      const relativePath = `${directory}/${basename}`;
      if (!available.has(relativePath)) throw new Error(`${directory} is missing ${role}: ${basename}`);
      roles[role] = relativePath;
    }
    for (const [role, contract] of Object.entries(ROUTE_MEDIA_ROLES)) roles[role] = requireMediaRole(inventory, directory, role, contract);
    const observedFiles = inventory.filter((relativePath) => path.posix.dirname(relativePath) === directory).sort(lexicalCompare);
    const expectedFiles = Object.values(roles).sort(lexicalCompare);
    if (JSON.stringify(observedFiles) !== JSON.stringify(expectedFiles)) throw new Error(`${directory} must contain exactly the 15 required route artifacts`);
    result[route.id] = { publicRoute: route.publicRoute, publicLabel: route.publicLabel, roles };
  }
  return result;
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

function requireReportStatus(value, label) {
  if (!value || typeof value !== "object" || value.status !== "PASS") throw new Error(`${label} must be JSON with exact status PASS`);
}

function validateRequiredReports(crt, options) {
  const { byRelative } = crt;
  const parsed = {};
  for (const [relativePath, expectedSchema] of Object.entries(CRT_REPORT_SCHEMAS)) {
    const bytes = byRelative.get(relativePath)?.bytes;
    if (!bytes) throw new Error(`required CRT report is absent: ${relativePath}`);
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`required CRT report is invalid JSON: ${relativePath}`); }
    requireReportStatus(value, relativePath);
    if (value.schema !== expectedSchema) throw new Error(`required CRT report schema differs: ${relativePath}`);
    parsed[relativePath] = value;
  }
  const captureManifestPath = CRT_REQUIRED_FILES.browserEvidenceManifest;
  const captureManifest = parsed[captureManifestPath];
  if (stableJson(captureManifest.humanReviewGates) !== stableJson(HUMAN_REVIEW_GATES)) throw new Error("deployed CRT evidence manifest must keep all six human gates pending");
  const ledger = captureManifest.artifacts ?? captureManifest.files;
  if (!Array.isArray(ledger) || !ledger.length) throw new Error("deployed CRT evidence manifest has no exhaustive artifact ledger");
  const expectedCapturePaths = crt.inventory.filter((relativePath) => relativePath !== captureManifestPath).sort(lexicalCompare);
  const observedCapturePaths = ledger.map((record) => record.relativePath).sort(lexicalCompare);
  if (new Set(observedCapturePaths).size !== observedCapturePaths.length || JSON.stringify(observedCapturePaths) !== JSON.stringify(expectedCapturePaths)) throw new Error("deployed CRT evidence manifest coverage is not exact and exhaustive");
  for (const record of ledger) {
    const authority = byRelative.get(record.relativePath)?.record;
    const byteSize = record.byteSize ?? record.bytes;
    if (!authority || byteSize !== authority.byteSize || record.sha256 !== authority.sha256) throw new Error(`deployed CRT evidence manifest hash/size mismatch: ${record.relativePath}`);
  }
  const gitReport = parsed[CRT_REQUIRED_FILES.gitDeploymentProvenanceReport];
  for (const [name, expected] of [["HEAD", options.expectedHead], ["base", options.expectedBase], ["main", options.expectedMain], ["upstream", options.expectedUpstream]]) {
    if (!containsScalar(gitReport, expected, { caseInsensitive: true })) throw new Error(`Git provenance report does not bind exact ${name}: ${expected}`);
  }
  const deploymentReport = gitReport;
  const deploymentBindings = [
    ["HEAD", options.expectedHead, { caseInsensitive: true }],
    ["deployment ID", options.expectedDeploymentId, {}],
    ["deployment project", options.deploymentProject, {}],
    ["deployment check run", options.deploymentCheckRunId, {}],
    ["immutable URL", options.immutableUrl, { url: true }],
    ["branch URL", options.branchUrl, { url: true }],
  ];
  for (const [name, expected, mode] of deploymentBindings) if (!containsScalar(deploymentReport, expected, mode)) throw new Error(`deployed CRT amendment report does not bind exact ${name}`);
  const browserReport = parsed[CRT_REQUIRED_FILES.browserDiagnosticsReport];
  if (!containsScalar(browserReport, options.immutableUrl, { url: true })) throw new Error("browser QA report is not bound to the immutable deployment URL");
}

function validateRouteEvidence(routes) {
  const manifestPath = ROUTE_REPORT_FILES.routePreproductionManifest;
  let manifest;
  try { manifest = JSON.parse(routes.byRelative.get(manifestPath)?.bytes.toString("utf8") ?? ""); }
  catch { throw new Error("route-preproduction manifest is missing or invalid JSON"); }
  const routeIds = ROUTES.map(({ id }) => id);
  if (manifest.schema !== "qh.phase5a.route-preproduction-manifest.v1" || manifest.status !== "PASS" || manifest.provenance !== "local speculative preproduction" || manifest.canary !== "QH_PHASE5A_ROUTE_LAB_ONLY"
    || JSON.stringify(manifest.routes) !== JSON.stringify(routeIds) || manifest.routeArtifactsPerRoute !== 15 || manifest.phase5BAuthorized !== false || manifest.humanGates !== "all six pending") throw new Error("route-preproduction manifest identity/provenance/authorization differs");
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("route-preproduction manifest has no exhaustive file ledger");
  const expectedPaths = routes.inventory.filter((relativePath) => relativePath !== manifestPath).sort(lexicalCompare);
  const observedPaths = manifest.files.map((record) => record.path).sort(lexicalCompare);
  if (new Set(observedPaths).size !== observedPaths.length || JSON.stringify(observedPaths) !== JSON.stringify(expectedPaths)) throw new Error("route-preproduction manifest coverage is not exact and exhaustive");
  for (const record of manifest.files) {
    const authority = routes.byRelative.get(record.path)?.record;
    if (!authority || record.bytes !== authority.byteSize || record.sha256 !== authority.sha256) throw new Error(`route-preproduction manifest hash/size mismatch: ${record.path}`);
    if (path.posix.extname(record.path).toLowerCase() === ".png" && (record.media?.type !== "image" || record.media.format !== authority.media?.format || record.media.width !== authority.media?.width || record.media.height !== authority.media?.height)) throw new Error(`route-preproduction manifest image metadata mismatch: ${record.path}`);
  }
  if (manifest.totals?.files !== manifest.files.length || manifest.totals.bytes !== manifest.files.reduce((sum, record) => sum + record.bytes, 0)) throw new Error("route-preproduction manifest totals differ");
  const accessibilityPath = ROUTE_REPORT_FILES.routeAccessibility;
  const browserPath = ROUTE_REPORT_FILES.routeBrowserCapture;
  let accessibility;
  let browser;
  try {
    accessibility = JSON.parse(routes.byRelative.get(accessibilityPath)?.bytes.toString("utf8") ?? "");
    browser = JSON.parse(routes.byRelative.get(browserPath)?.bytes.toString("utf8") ?? "");
  } catch { throw new Error("route accessibility/browser capture report is invalid JSON"); }
  if (accessibility.schema !== "qh.phase5a.route-accessibility.v1" || accessibility.status !== "PASS" || accessibility.seriousOrCriticalViolations !== 0 || JSON.stringify(accessibility.routes) !== JSON.stringify(routeIds)) throw new Error("route accessibility report differs");
  const expectedViewports = [
    { id: "desktop", width: 1440, height: 900 }, { id: "short-desktop", width: 1366, height: 650 }, { id: "tablet-landscape", width: 1024, height: 768 },
    { id: "portrait", width: 768, height: 1024 }, { id: "mobile", width: 390, height: 844 }, { id: "mobile-narrow", width: 320, height: 800 }, { id: "mobile-landscape", width: 844, height: 390 },
  ];
  if (browser.schema !== "qh.phase5a.route-preproduction-capture.v1" || browser.status !== "PASS" || browser.canary !== "QH_PHASE5A_ROUTE_LAB_ONLY" || browser.provenance?.type !== "local-authored-preproduction" || browser.provenance?.public !== false || browser.provenance?.productionRouteBytesChanged !== false || browser.routeCount !== 9
    || JSON.stringify(browser.requiredViewports) !== JSON.stringify(expectedViewports) || JSON.stringify(browser.specialResponsiveStates) !== JSON.stringify(["200% text", "fallback font", "open mobile navigation", "keyboard focus"])
    || browser.requestIsolation?.status !== "PASS" || browser.requestIsolation.external !== 0 || browser.requestIsolation.cinematic !== 0 || browser.requestIsolation.video !== 0 || browser.reducedMotion !== "PASS" || browser.noJs !== "PASS" || browser.fixedOrSticky !== 0 || browser.horizontalOverflow !== 0 || browser.phase5BAuthorized !== false) throw new Error("route browser-capture report differs");
  const readme = routes.byRelative.get("README.md")?.bytes.toString("utf8") ?? "";
  for (const statement of ["local-only HTML/CSS lab", "speculative human-review material", "not deployed public routes", "Phase 5B remains unauthorized", "All six human gates remain pending"]) if (!readme.includes(statement)) throw new Error(`route-preproduction README omits required statement: ${statement}`);
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
  const { stdout } = await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=format_name,duration", "-of", "json", file], `explicit ffprobe validation for ${label}`, { maxBuffer: 2_000_000 });
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error(`ffprobe returned invalid JSON for ${label}`); }
  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const probe = {
    formatName: parsed.format?.format_name ?? null,
    durationSeconds: Number(parsed.format?.duration),
    codec: video?.codec_name ?? null,
    pixelFormat: video?.pix_fmt ?? null,
    width: Number(video?.width),
    height: Number(video?.height),
    averageFrameRate: video?.avg_frame_rate ?? null,
    realFrameRate: video?.r_frame_rate ?? null,
    frameCount: Number(video?.nb_read_frames),
    videoStreamCount: streams.filter((stream) => stream.codec_type === "video").length,
    audioStreamCount: streams.filter((stream) => stream.codec_type === "audio").length,
    otherStreamCount: streams.filter((stream) => !["video", "audio"].includes(stream.codec_type)).length,
  };
  const fps = parseRate(probe.averageFrameRate);
  if (!String(probe.formatName).split(",").includes("mp4") || probe.videoStreamCount !== 1 || probe.audioStreamCount !== 0 || probe.otherStreamCount !== 0 || probe.codec !== "h264" || probe.pixelFormat !== "yuv420p"
    || !Number.isFinite(probe.durationSeconds) || probe.durationSeconds <= 0 || probe.durationSeconds > 600 || !Number.isSafeInteger(probe.frameCount) || probe.frameCount <= 0 || probe.frameCount > 72_000
    || !Number.isSafeInteger(probe.width) || !Number.isSafeInteger(probe.height) || probe.width < 16 || probe.height < 16 || probe.width > 8192 || probe.height > 8192 || !Number.isFinite(fps) || fps <= 0 || fps > 120) {
    throw new Error(`MP4 ffprobe contract failed: ${label} ${JSON.stringify(probe)}`);
  }
  return { ...probe, ffprobeValidated: true };
}

function purposeFor(packagePath) {
  if (packagePath.startsWith("deployed-crt/recordings/")) return "Immutable-deployment CRT interaction recording";
  if (packagePath.startsWith("deployed-crt/reports/")) return "Immutable-deployment CRT machine evidence";
  if (packagePath.includes("/routes/")) return "Local speculative supporting-route preproduction for human review";
  if (packagePath.includes("/cross-route-system/")) return "Local speculative cross-route system authority";
  return "Phase 5A external human-review authority";
}

async function collectRoot(root, prefix, ffprobe) {
  const inventory = await recursiveFiles(root);
  if (!inventory.length) throw new Error(`${prefix} input root is empty`);
  const records = [];
  const byRelative = new Map();
  let totalBytes = 0;
  for (const relativePath of inventory) {
    const packagePath = `${prefix}/${safeRelativePath(relativePath, `${prefix} input path`)}`;
    assertAllowedEntry(packagePath);
    const sourcePath = path.join(root, ...relativePath.split("/"));
    const info = await stat(sourcePath);
    if (!info.isFile() || info.size <= 0 || info.size > MAX_FILE_BYTES) throw new Error(`review payload is empty, non-regular, or too large: ${packagePath}`);
    totalBytes += info.size;
    if (totalBytes > MAX_PACKAGE_BYTES) throw new Error("review package source bytes exceed the compact external-package limit");
    const bytes = await readFile(sourcePath);
    assertNoPrivateText(bytes, packagePath);
    const extension = path.extname(relativePath).toLowerCase();
    let media = null;
    if (IMAGE_EXTENSIONS.has(extension)) media = await validateImage(bytes, packagePath);
    else if (VIDEO_EXTENSIONS.has(extension)) media = await probeVideo(ffprobe, sourcePath, packagePath);
    else if (extension === ".json") { try { JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`invalid JSON review payload: ${packagePath}`); } }
    else if (bytes.toString("utf8").trim().length < 12) throw new Error(`human-readable review payload is empty or insubstantial: ${packagePath}`);
    const record = {
      relativePath: packagePath,
      sourceClass: prefix === "deployed-crt" ? "DEPLOYED_CRT_EVIDENCE" : "LOCAL_SPECULATIVE_ROUTE_PREPRODUCTION",
      kind: IMAGE_EXTENSIONS.has(extension) ? "image" : VIDEO_EXTENSIONS.has(extension) ? "video" : "document",
      purpose: purposeFor(packagePath),
      byteSize: bytes.length,
      sha256: sha256(bytes),
      ...(media ? { media } : {}),
    };
    records.push(record);
    byRelative.set(relativePath, { bytes, record });
  }
  return { inventory, records, byRelative, entries: records.map((record) => ({ path: record.relativePath, data: byRelative.get(record.relativePath.slice(prefix.length + 1)).bytes })) };
}

function prefixRoles(value, prefix) {
  if (typeof value === "string") return `${prefix}/${value}`;
  if (Array.isArray(value)) return value.map((item) => prefixRoles(item, prefix));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, prefixRoles(child, prefix)]));
  return value;
}

function buildArtifactRoles(crt, routes) {
  const crtRoles = requireExactFiles(crt.inventory, CRT_REQUIRED_FILES, "deployed CRT evidence root");
  const coherence = requireExactFiles(routes.inventory, { routeCoherenceMatrix: COHERENCE_MATRIX }, "route-preproduction root");
  const crossRoute = requireExactFiles(routes.inventory, CROSS_ROUTE_FILES, "route-preproduction root");
  const routeReports = requireExactFiles(routes.inventory, ROUTE_REPORT_FILES, "route-preproduction root");
  const perRoute = routeArtifactRoles(routes.inventory);
  const prefixedRoutes = Object.fromEntries(Object.entries(perRoute).map(([routeId, route]) => [routeId, {
    publicRoute: route.publicRoute,
    publicLabel: route.publicLabel,
    roles: prefixRoles(route.roles, "route-preproduction"),
  }]));
  return {
    crtAmendment: prefixRoles(crtRoles, "deployed-crt"),
    routePreproduction: {
      ...prefixRoles(coherence, "route-preproduction"),
      routes: prefixedRoutes,
      crossRouteSystem: prefixRoles(crossRoute, "route-preproduction"),
      reports: {
        gitProvenance: `deployed-crt/${CRT_REQUIRED_FILES.gitDeploymentProvenanceReport}`,
        deployedCrtAmendment: `deployed-crt/${CRT_REQUIRED_FILES.scrollAddressedCrtReport}`,
        browserQa: `deployed-crt/${CRT_REQUIRED_FILES.browserDiagnosticsReport}`,
        accessibility: `deployed-crt/${CRT_REQUIRED_FILES.fallbackAccessibilityReport}`,
        ...prefixRoles(routeReports, "route-preproduction"),
      },
    },
  };
}

async function validateRoutePlans(routes) {
  for (const route of ROUTES) {
    const relativePath = `routes/${route.id}/${ROUTE_FIXED_ROLES.routePlan}`;
    validateRoutePlanText(routes.byRelative.get(relativePath)?.bytes.toString("utf8") ?? "", relativePath);
  }
}

function readmeText(options, repository) {
  return [
    "# Quantum-Hub Phase 5A human-review package",
    "",
    "This package contains two deliberately different provenance classes:",
    "",
    "- `deployed-crt/` is evidence captured from the immutable deployed CRT amendment identified in `MANIFEST.json`.",
    "- `route-preproduction/` is local, speculative, external/untracked preproduction. It is not deployed public route implementation.",
    "",
    `Git HEAD: \`${repository.head}\``,
    `Accepted Phase 5A base: \`${repository.base}\``,
    `Frozen main: \`${repository.mainHead}\``,
    `Immutable preview: ${options.immutableUrl}`,
    `Branch preview: ${options.branchUrl}`,
    "",
    "A machine PASS proves package integrity and traceability only. It grants no human acceptance.",
    "The author and deployer may not self-approve. All six human gates remain PENDING HUMAN REVIEW.",
    "Phase 5B production implementation is UNAUTHORIZED until all six gates receive human ACCEPT.",
    "",
  ].join("\n");
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createStoredZipBuffer(entries) {
  const ordered = [...entries].sort((left, right) => lexicalCompare(left.path, right.path));
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

async function assertFresh(paths) {
  for (const candidate of paths) {
    try { await access(candidate); throw new Error(`destination already exists and will not be overwritten: ${candidate}`); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
}

async function spawnAuditor(arguments_) {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [AUDITOR, ...arguments_], { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0) reject(new Error(`separate Phase 5A auditor failed (${code ?? signal}): ${Buffer.concat(stderr).toString("utf8").slice(-4_000)}`));
      else resolve({ pid: child.pid, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}

function sibling(output, filename) { return path.join(path.dirname(output), filename); }

async function assemblePackage(inputOptions) {
  const options = validateOptionShape(inputOptions);
  const [crtRoot, routeRoot, canonicalOutput, ffprobe] = await Promise.all([
    realpath(assertExternalPath(options.crtEvidenceRoot, "deployed CRT evidence root")),
    realpath(assertExternalPath(options.routePreproductionRoot, "local route-preproduction root")),
    canonicalFuturePath(assertExternalPath(options.output, "review ZIP")),
    validateFfprobe(options.ffprobe),
  ]);
  if ((await stat(crtRoot)).isDirectory() !== true || (await stat(routeRoot)).isDirectory() !== true) throw new Error("both evidence roots must be directories");
  assertExternalPath(crtRoot, "resolved deployed CRT evidence root");
  assertExternalPath(routeRoot, "resolved local route-preproduction root");
  assertExternalPath(canonicalOutput, "canonical review ZIP");
  if (isWithin(crtRoot, routeRoot) || isWithin(routeRoot, crtRoot)) throw new Error("deployed CRT and local route-preproduction roots must be disjoint");
  if (isWithin(crtRoot, canonicalOutput) || isWithin(routeRoot, canonicalOutput)) throw new Error("output must not be inside either evidence input root");
  await mkdir(path.dirname(options.output), { recursive: true });
  const finalManifest = sibling(options.output, DETACHED_MANIFEST_FILENAME);
  const finalAudit = sibling(options.output, AUDIT_FILENAME);
  await assertFresh([options.output, finalManifest, finalAudit]);
  const repository = await repositoryAuthority(options);
  const [crt, routes] = await Promise.all([
    collectRoot(crtRoot, "deployed-crt", ffprobe),
    collectRoot(routeRoot, "route-preproduction", ffprobe),
  ]);
  const artifactRoles = buildArtifactRoles(crt, routes);
  validateCrtSurface(crt.inventory);
  validateRouteSurface(routes.inventory);
  validateRequiredReports(crt, options);
  validateRouteEvidence(routes);
  await validateRoutePlans(routes);
  const readme = Buffer.from(readmeText(options, repository), "utf8");
  assertNoPrivateText(readme, README_FILENAME);
  const records = [...crt.records, ...routes.records, {
    relativePath: README_FILENAME,
    sourceClass: "GENERATED_REVIEW_GUIDE",
    kind: "document",
    purpose: "Reviewer orientation, provenance boundary, and authorization warning",
    byteSize: readme.length,
    sha256: sha256(readme),
  }].sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
  const manifest = {
    schema: PACKAGE_SCHEMA,
    status: "PASS",
    generatedAt: FIXED_EPOCH,
    deterministicArchive: { compression: "stored", fixedDosTimestamp: FIXED_EPOCH, lexicalUtf8ByteOrder: true, zip64: false },
    source: {
      branch: repository.branch,
      head: repository.head,
      parent: repository.parent,
      acceptedBase: repository.base,
      acceptedPhase4BranchHead: repository.acceptedPhase4BranchHead,
      frozenMain: repository.mainHead,
      frozenMainUpstream: repository.mainUpstreamHead,
      frozenMainLiveRemote: repository.mainLiveRemoteHead,
      upstreamHead: repository.upstreamHead,
      liveRemoteHead: repository.liveRemoteHead,
      commitChain: repository.commitChain,
      clean: repository.clean,
      productionBlenderSourceSha256: options.expectedSourceSha256,
      activeProductionMediaManifestSha256: options.expectedMediaManifestSha256,
    },
    deployment: {
      deploymentId: options.expectedDeploymentId,
      project: options.deploymentProject,
      checkRunId: String(options.deploymentCheckRunId),
      immutableUrl: options.immutableUrl,
      branchUrl: options.branchUrl,
      commit: options.expectedHead,
    },
    provenance: {
      deployedCrt: { archivePrefix: "deployed-crt/", classification: "DEPLOYED IMMUTABLE CRT EVIDENCE", deployed: true, speculative: false, captureTarget: options.immutableUrl, captureManifestSha256: crt.byRelative.get(CRT_REQUIRED_FILES.browserEvidenceManifest).record.sha256 },
      localRoutePreproduction: { archivePrefix: "route-preproduction/", classification: "LOCAL SPECULATIVE PREPRODUCTION", deployed: false, speculative: true, publicationStatus: "EXTERNAL UNTRACKED HUMAN-REVIEW ARTIFACTS ONLY", captureManifestSha256: routes.byRelative.get(ROUTE_REPORT_FILES.routePreproductionManifest).record.sha256 },
    },
    traceability: {
      artifactRoles,
      trackedTooling: repository.trackedTooling,
      trackedProductionAuthorities: repository.trackedProductionAuthorities,
      everyNonSelfArchiveFileHasSha256: true,
      manifestSelfHashAuthority: `detached audit file ${AUDIT_FILENAME}`,
    },
    inventory: {
      routeFolderCount: ROUTES.length,
      deployedCrtFileCount: crt.records.length,
      localRoutePreproductionFileCount: routes.records.length,
      hashedNonSelfArchiveFileCount: records.length,
      archiveEntryCount: records.length + 1,
      hashedNonSelfArchiveBytes: records.reduce((sum, record) => sum + record.byteSize, 0),
    },
    files: records,
    unhashedSelfEntries: [IN_ARCHIVE_MANIFEST],
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
    policy: {
      phase5B: "UNAUTHORIZED",
      allSixHumanGates: "PENDING HUMAN REVIEW",
      authorMaySelfApprove: false,
      deployerMaySelfApprove: false,
      machinePassGrantsHumanAcceptance: false,
    },
  };
  const manifestBytes = Buffer.from(stableJson(manifest), "utf8");
  assertNoPrivateText(manifestBytes, IN_ARCHIVE_MANIFEST);
  const entries = [...crt.entries, ...routes.entries, { path: README_FILENAME, data: readme }, { path: IN_ARCHIVE_MANIFEST, data: manifestBytes }];
  const archive = createStoredZipBuffer(entries);
  if (!archive.equals(createStoredZipBuffer([...entries].reverse()))) throw new Error("deterministic ZIP reproduction differs when source order changes");
  const assembly = path.join(path.dirname(options.output), `.phase5a-human-review-assembly-${randomUUID()}`);
  if (!isWithin(path.dirname(options.output), assembly) || assembly === path.dirname(options.output)) throw new Error("unsafe assembly path");
  await mkdir(assembly, { recursive: false });
  const assembledArchive = path.join(assembly, ARCHIVE_FILENAME);
  const assembledManifest = path.join(assembly, DETACHED_MANIFEST_FILENAME);
  const assembledAudit = path.join(assembly, AUDIT_FILENAME);
  try {
    await writeFile(assembledArchive, archive, { flag: "wx" });
    await writeFile(assembledManifest, manifestBytes, { flag: "wx" });
    const childArguments = [
      "--archive", assembledArchive,
      "--manifest", assembledManifest,
      "--audit-output", assembledAudit,
      "--expected-head", options.expectedHead,
      "--expected-base", options.expectedBase,
      "--expected-main", options.expectedMain,
      "--expected-upstream", options.expectedUpstream,
      "--expected-branch", options.expectedBranch,
      "--expected-source-sha256", options.expectedSourceSha256,
      "--expected-media-manifest-sha256", options.expectedMediaManifestSha256,
      "--expected-deployment-id", options.expectedDeploymentId,
      "--deployment-project", options.deploymentProject,
      "--deployment-check-run-id", String(options.deploymentCheckRunId),
      "--immutable-url", options.immutableUrl,
      "--branch-url", options.branchUrl,
      "--ffprobe", ffprobe,
      "--expected-parent-process-id", String(process.pid),
    ];
    const child = await spawnAuditor(childArguments);
    const auditBytes = await readFile(assembledAudit);
    const audit = JSON.parse(auditBytes.toString("utf8"));
    if (audit.schema !== AUDIT_SCHEMA || audit.status !== "PASS" || audit.archive?.sha256 !== sha256(archive) || audit.manifest?.sha256 !== sha256(manifestBytes)
      || audit.process?.separateProcess !== true || audit.process?.auditorProcessId !== child.pid || audit.process?.parentProcessId !== process.pid || child.pid === process.pid) {
      throw new Error("separate-process audit did not return exact bound PASS authority");
    }
    await assertFresh([options.output, finalManifest, finalAudit]);
    const published = [];
    try {
      for (const [source, destination] of [[assembledArchive, options.output], [assembledManifest, finalManifest], [assembledAudit, finalAudit]]) {
        await rename(source, destination);
        published.push(destination);
      }
    } catch (error) {
      for (const destination of published) await unlink(destination).catch(() => {});
      throw error;
    }
    process.stdout.write(`${stableJson({
      schema: `${PACKAGE_SCHEMA}.result`,
      status: "PASS",
      archive: { path: options.output, byteSize: archive.length, sha256: sha256(archive) },
      manifest: { path: finalManifest, byteSize: manifestBytes.length, sha256: sha256(manifestBytes) },
      audit: { path: finalAudit, byteSize: auditBytes.length, sha256: sha256(auditBytes), separateProcess: true, processId: child.pid },
      humanReviewGates: HUMAN_REVIEW_GATES,
      authorization: AUTHORIZATION,
    })}`);
  } finally {
    if (!isWithin(path.dirname(options.output), assembly) || assembly === path.dirname(options.output)) throw new Error("refusing unsafe assembly cleanup");
    await rm(assembly, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  await assemblePackage(options);
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { process.stderr.write(`Phase 5A package FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
