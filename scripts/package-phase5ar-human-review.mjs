#!/usr/bin/env node

/**
 * Assemble the external Phase 5A-R human-review package.
 *
 * The archive is deliberately compact: deployed manifesto evidence, the exact
 * 9 x 7 + 7 supporting-route review surface, four compact route QA reports,
 * frozen planning authorities, and the final deployment-verification report.
 * Raw frames, prototype source, production media, build output, and nested
 * archives are never package inputs.
 */

import assert from "node:assert/strict";
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
const SCRIPT = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
const AUDITOR = path.join(ROOT, "scripts", "audit-phase5ar-human-review.mjs");

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

export const AUTHORIZATION = Object.freeze({
  authorSelfApproved: false,
  deployerSelfApproved: false,
  humanAccepted: false,
  mainMerged: false,
  phase5BAuthorized: false,
});

export const ROUTE_ORDER = Object.freeze(["for-industry", "for-startups", "industries", "proof", "maradin", "spark", "about", "contact", "404"]);
export const ROUTE_ARTIFACTS = Object.freeze([
  "route-brief-delta.md",
  "desktop-storyboard--1440x900.png",
  "mobile-storyboard--390x844.png",
  "narrow-overture--320x800.png",
  "short-landscape-overture-sheet.png",
  "signature-states-sheet.png",
  "material-board.png",
]);
export const CROSS_ROUTE_ARTIFACTS = Object.freeze([
  "PHASE_5A_R_ROUTE_COHERENCE_MATRIX.md",
  "PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md",
  "all-routes-desktop-contact-sheet.png",
  "all-routes-mobile-contact-sheet.png",
  "all-routes-short-landscape-contact-sheet.png",
  "motion-comparison-board.png",
  "material-comparison-board.png",
]);
export const ROUTE_REPORTS = Object.freeze([
  "reports/accessibility.json",
  "reports/public-source-freeze.json",
  "reports/request-isolation.json",
  "reports/route-capture-report.json",
]);
export const ROUTE_ROOT_FILES = Object.freeze(["README.md", "route-preproduction-manifest.json"]);

export const HOME_RECORDINGS = Object.freeze([
  "recordings/01-forward-manifesto.mp4",
  "recordings/02-reverse-manifesto.mp4",
]);
export const HOME_SHEETS = Object.freeze([
  "sheets/01-manifesto-sequence.png",
  "sheets/02-responsive-manifesto.png",
  "sheets/03-accessibility-fallbacks.png",
  "sheets/04-reverse-path.png",
]);
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

export const FROZEN_PUBLIC_FILES = Object.freeze([
  "src/pages/for-partners.astro", "src/pages/for-startups.astro", "src/pages/industries.astro", "src/pages/pocs.astro",
  "src/pages/pocs/maradin.astro", "src/pages/spark.astro", "src/pages/about.astro", "src/pages/contact.astro", "src/pages/404.astro",
  "src/styles/routes/standard.css", "src/styles/routes/proof.css", "src/styles/routes/not-found.css", "src/components/PageHero.astro",
  "src/components/ProcessList.astro", "src/components/ClosingCta.astro", "src/content/industries.ts", "src/content/proofs.ts",
  "src/content/programmes.ts", "src/content/collections.ts",
]);

export const AUTHORITY_SOURCES = Object.freeze({
  publicationAndMedia: Object.freeze({ source: "docs/planning/PHASE_5A_PUBLICATION_AND_MEDIA_AUDIT.md", archive: "review-authorities/publication/PHASE_5A_PUBLICATION_AND_MEDIA_AUDIT.md" }),
  supportingRouteContent: Object.freeze({ source: "docs/planning/PHASE_5A_SUPPORTING_ROUTE_CONTENT_AUDIT.md", archive: "review-authorities/publication/PHASE_5A_SUPPORTING_ROUTE_CONTENT_AUDIT.md" }),
  performanceStrategy: Object.freeze({ source: "docs/planning/PHASE_5A_SUPPORTING_ROUTE_PREPRODUCTION.md", archive: "review-authorities/performance/PHASE_5A_SUPPORTING_ROUTE_PREPRODUCTION.md" }),
  implementationStrategy: Object.freeze({ source: "docs/planning/PHASE_5A_SUPPORTING_ROUTE_EXPERIENCE_SYSTEM.md", archive: "review-authorities/performance/PHASE_5A_SUPPORTING_ROUTE_EXPERIENCE_SYSTEM.md" }),
  crtInteraction: Object.freeze({ source: "docs/planning/PHASE_5A_SCROLL_CRT_MAPPING.md", archive: "review-authorities/crt/PHASE_5A_SCROLL_CRT_MAPPING.md" }),
});
export const DEPLOYMENT_AUTHORITY_PATH = "review-authorities/git-deployment/phase-5-a-r-deployment-verification.json";

export function expectedHomePaths() {
  return [...HOME_RECORDINGS, ...HOME_SHEETS, ...Object.keys(HOME_REPORT_SCHEMAS), HOME_MANIFEST].sort(lexicalCompare);
}

export function expectedRouteReviewPaths() {
  return [
    ...ROUTE_ORDER.flatMap((route) => ROUTE_ARTIFACTS.map((name) => `routes/${route}/${name}`)),
    ...CROSS_ROUTE_ARTIFACTS.map((name) => `cross-route-system/${name}`),
  ].sort(lexicalCompare);
}

export function expectedRouteRootPaths() {
  return [...expectedRouteReviewPaths(), ...ROUTE_REPORTS, ...ROUTE_ROOT_FILES].sort(lexicalCompare);
}

const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4"]);
const PRIVATE_OR_SECRET_TEXT = /(?:[a-z]:[\\/]users[\\/]|(?:^|[^a-z])onedrive(?:[^a-z]|$)|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;
const FORBIDDEN_ENTRY = /(?:^|\/)(?:raw|private|secrets?|sources?|src|masters?|frames?|receipts?|logs?|cache|caches|quarantine|rejected|candidates?|browser-recorder|autosaves?|temp|tmp|__pycache__|node_modules|\.git|dist)(?:\/|$)|(?:^|\/)\.(?:env|ds_store)(?:\.|$)|\.(?:webm|blend\d*|exr|tiff?|mov|mkv|avi|zip|7z|rar|pem|key|p12|pfx|log|map)$/i;
const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 1_500 * 1024 * 1024;
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

export function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function safeRelativePath(value, label = "path") {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) throw new Error(`${label} must be a portable relative path`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`${label} is unsafe: ${value}`);
  return value;
}

export function assertExternalPath(candidate, label = "path") {
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root || isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved)) throw new Error(`${label} must be durable, outside the repository and OS temporary directory, and not a drive root`);
  return resolved;
}

export function assertAllowedEntry(relativePath) {
  safeRelativePath(relativePath, "package entry");
  if (FORBIDDEN_ENTRY.test(relativePath)) throw new Error(`forbidden raw/source/cache/private payload: ${relativePath}`);
  const top = relativePath.split("/")[0];
  if (!["homepage-manifesto", "supporting-routes", "review-authorities", README_FILENAME, IN_ARCHIVE_MANIFEST].includes(top)) throw new Error(`entry is outside the Phase 5A-R review surface: ${relativePath}`);
  if ([README_FILENAME, IN_ARCHIVE_MANIFEST].includes(relativePath)) return true;
  const extension = path.extname(relativePath).toLowerCase();
  if (![...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].includes(extension)) throw new Error(`unsupported review payload: ${relativePath}`);
  return true;
}

function semanticJsonText(value) {
  const values = [];
  const visit = (node, key = "") => {
    if (typeof node === "string") { values.push(node); if (key) values.push(`${key}: ${node}`); }
    else if (Array.isArray(node)) node.forEach((child) => visit(child, key));
    else if (node && typeof node === "object") Object.entries(node).forEach(([childKey, child]) => visit(child, childKey));
    else if (key && node !== null && node !== undefined) values.push(`${key}: ${node}`);
  };
  visit(value);
  return values.join("\n");
}

export function assertNoPrivateText(bytes, relativePath) {
  if (PRIVATE_OR_SECRET_TEXT.test(relativePath)) throw new Error(`privacy/secrets scan failed in path: ${relativePath}`);
  const extension = path.extname(relativePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension) && PRIVATE_OR_SECRET_TEXT.test(Buffer.from(bytes).toString("utf8"))) throw new Error(`privacy/secrets scan failed in payload: ${relativePath}`);
  if (extension === ".json" || relativePath === IN_ARCHIVE_MANIFEST) {
    let document;
    try { document = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { throw new Error(`invalid JSON payload: ${relativePath}`); }
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
    homepageEvidenceRoot: null, routePreproductionRoot: null, deploymentReport: null,
    expectedHead: null, expectedUpstream: null, expectedMain: FROZEN_MAIN_SHA, acceptedPhase5A: ACCEPTED_PHASE5A_SHA,
    expectedBranch: REQUIRED_BRANCH, expectedDeploymentId: null, deploymentProject: REQUIRED_PROJECT,
    deploymentCheckRunId: null, immutableUrl: null, branchUrl: null, ffprobe: null, output: null, selfTest: false, help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--homepage-evidence-root") options.homepageEvidenceRoot = path.resolve(next());
    else if (argument === "--route-preproduction-root") options.routePreproductionRoot = path.resolve(next());
    else if (argument === "--deployment-report") options.deploymentReport = path.resolve(next());
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-upstream") options.expectedUpstream = next().toLowerCase();
    else if (argument === "--expected-main") options.expectedMain = next().toLowerCase();
    else if (argument === "--accepted-phase5a") options.acceptedPhase5A = next().toLowerCase();
    else if (argument === "--expected-branch") options.expectedBranch = next();
    else if (argument === "--expected-deployment-id") options.expectedDeploymentId = next();
    else if (argument === "--deployment-project") options.deploymentProject = next();
    else if (argument === "--deployment-check-run-id") options.deploymentCheckRunId = next();
    else if (argument === "--immutable-url") options.immutableUrl = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--ffprobe") options.ffprobe = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

function previewUrl(value, flag) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${flag} must be an absolute URL`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !url.hostname.endsWith(`.${REQUIRED_PROJECT}.pages.dev`) || url.hostname === `${REQUIRED_PROJECT}.pages.dev`) {
    throw new Error(`${flag} must be a credential-free ${REQUIRED_PROJECT} Pages HTTPS origin root`);
  }
  return url.toString();
}

export function validateOptionShape(input) {
  const options = { ...input };
  if (!HASH40.test(options.expectedHead ?? "") || !HASH40.test(options.expectedUpstream ?? "")) throw new Error("--expected-head and --expected-upstream must be lowercase 40-hex commits");
  if (options.expectedHead !== options.expectedUpstream) throw new Error("--expected-head and --expected-upstream must be identical");
  if (options.acceptedPhase5A !== ACCEPTED_PHASE5A_SHA) throw new Error(`--accepted-phase5a must remain ${ACCEPTED_PHASE5A_SHA}`);
  if (options.expectedMain !== FROZEN_MAIN_SHA) throw new Error(`--expected-main must remain ${FROZEN_MAIN_SHA}`);
  if (options.expectedBranch !== REQUIRED_BRANCH) throw new Error(`--expected-branch must remain ${REQUIRED_BRANCH}`);
  if (!UUID.test(options.expectedDeploymentId ?? "")) throw new Error("--expected-deployment-id must be a Cloudflare UUID");
  if (options.deploymentProject !== REQUIRED_PROJECT) throw new Error(`--deployment-project must remain ${REQUIRED_PROJECT}`);
  if (!/^[1-9][0-9]{0,30}$/.test(String(options.deploymentCheckRunId ?? ""))) throw new Error("--deployment-check-run-id must be a positive decimal identifier");
  options.immutableUrl = previewUrl(options.immutableUrl, "--immutable-url");
  options.branchUrl = previewUrl(options.branchUrl, "--branch-url");
  if (options.immutableUrl === options.branchUrl) throw new Error("immutable and branch preview URLs must differ");
  for (const [key, flag] of [["homepageEvidenceRoot", "--homepage-evidence-root"], ["routePreproductionRoot", "--route-preproduction-root"], ["deploymentReport", "--deployment-report"], ["output", "--output"]]) if (!options[key]) throw new Error(`${flag} is required`);
  if (!options.ffprobe || !path.isAbsolute(options.ffprobe)) throw new Error("--ffprobe must be an absolute executable path");
  if (path.basename(options.output) !== ARCHIVE_FILENAME) throw new Error(`--output basename must be ${ARCHIVE_FILENAME}`);
  return options;
}

function printHelp() {
  process.stdout.write([
    "Phase 5A-R external human-review package builder", "", `node scripts/${path.basename(SCRIPT)}`,
    "  --homepage-evidence-root <external-directory>", "  --route-preproduction-root <external-directory>",
    "  --deployment-report <external-json>", "  --expected-head <40-hex> --expected-upstream <same-40-hex>",
    `  --expected-branch ${REQUIRED_BRANCH}`, `  --expected-main ${FROZEN_MAIN_SHA}`,
    `  --accepted-phase5a ${ACCEPTED_PHASE5A_SHA}`, "  --expected-deployment-id <uuid> --deployment-project qsite1",
    "  --deployment-check-run-id <decimal> --immutable-url <https-origin/> --branch-url <https-origin/>",
    "  --ffprobe <absolute executable> --output <external exact ZIP path>", "",
    "The ZIP and its exact detached manifest/audit siblings must be fresh.", "Use --self-test for pure contract checks without filesystem writes, Git, network, or media tools.", "",
  ].join("\n"));
}

async function run(command, args, label, options = {}) {
  try { return await execFileAsync(command, args, { cwd: options.cwd ?? ROOT, windowsHide: true, encoding: options.encoding ?? "utf8", maxBuffer: options.maxBuffer ?? 20_000_000 }); }
  catch (error) { throw new Error(`${label} failed: ${String(error.stderr || error.stdout || error.message).slice(-4_000)}`); }
}
async function git(...args) { return (await run("git", args, "Git Phase 5A-R package authority", { maxBuffer: 10_000_000 })).stdout.trim(); }

function parseLinearLog(text) {
  const records = text.split(/\r?\n/).filter(Boolean).map((line) => {
    const [commit, parents, ...subject] = line.split("\t");
    return { commit, parents: parents.split(" ").filter(Boolean), subject: subject.join("\t") };
  });
  assert.equal(records.length, CHECKPOINT_SUBJECTS.length, "Phase 5A-R must contain exactly five checkpoint commits");
  records.forEach((record, index) => {
    assert.match(record.commit, HASH40, `checkpoint ${index + 1} commit`);
    assert.equal(record.parents.length, 1, `checkpoint ${index + 1} must be linear`);
    assert.equal(record.subject, CHECKPOINT_SUBJECTS[index], `checkpoint ${index + 1} subject differs`);
    assert.equal(record.parents[0], index === 0 ? ACCEPTED_PHASE5A_SHA : records[index - 1].commit, `checkpoint ${index + 1} parent differs`);
  });
  return records;
}

function parseTree(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = line.match(/^\d+\s+blob\s+[0-9a-f]{40}\s+(\d+)\t(.+)$/);
    if (!match) throw new Error(`cannot parse tracked tree record: ${line}`);
    return { bytes: Number(match[1]), path: match[2] };
  });
}

async function repositoryAuthority(options) {
  const requiredTools = [
    "scripts/package-phase5ar-human-review.mjs", "scripts/audit-phase5ar-human-review.mjs",
    "scripts/phase5ar-evidence-contract.mjs", "scripts/capture-phase5ar-manifesto-evidence.mjs",
    "scripts/capture-phase5ar-supporting-routes.mjs", "scripts/verify-phase5ar-deployment.mjs",
  ];
  const [head, branch, statusText, localMain, originMain, upstream, upstreamName, logText, liveText, baseTreeText, headTreeText, newPathsText, mediaDiff, publicDiff, ...trackedTools] = await Promise.all([
    git("rev-parse", "HEAD"), git("branch", "--show-current"), git("status", "--porcelain=v1", "--untracked-files=all"),
    git("rev-parse", "main"), git("rev-parse", "origin/main"), git("rev-parse", "@{upstream}"), git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"),
    git("log", "--format=%H%x09%P%x09%s", "--reverse", `${ACCEPTED_PHASE5A_SHA}..${options.expectedHead}`),
    git("ls-remote", "--heads", "origin", `refs/heads/${REQUIRED_BRANCH}`, "refs/heads/main"),
    git("ls-tree", "-r", "-l", ACCEPTED_PHASE5A_SHA), git("ls-tree", "-r", "-l", options.expectedHead),
    git("diff", "--diff-filter=A", "--name-only", ACCEPTED_PHASE5A_SHA, options.expectedHead),
    git("diff", "--name-only", ACCEPTED_PHASE5A_SHA, options.expectedHead, "--", PRODUCTION_BLEND_RELATIVE, ACTIVE_MEDIA_MANIFEST_RELATIVE),
    git("diff", "--name-only", ACCEPTED_PHASE5A_SHA, options.expectedHead, "--", ...FROZEN_PUBLIC_FILES),
    ...requiredTools.map((relative) => git("ls-files", "--error-unmatch", "--", relative)),
  ]);
  assert.equal(head, options.expectedHead, "local HEAD differs");
  assert.equal(branch, REQUIRED_BRANCH, "current branch differs");
  assert.equal(statusText, "", "final package requires a clean worktree");
  assert.equal(localMain, FROZEN_MAIN_SHA, "local main changed");
  assert.equal(originMain, FROZEN_MAIN_SHA, "origin/main changed");
  assert.equal(upstream, options.expectedHead, "upstream differs");
  assert.equal(upstreamName, `origin/${REQUIRED_BRANCH}`, "upstream name differs");
  trackedTools.forEach((value, index) => assert.equal(value.replaceAll("\\", "/"), requiredTools[index], `${requiredTools[index]} is not tracked`));
  const live = new Map(liveText.split(/\r?\n/).filter(Boolean).map((line) => line.trim().split(/\s+/)).map(([commit, reference]) => [reference, commit]));
  assert.equal(live.get(`refs/heads/${REQUIRED_BRANCH}`), options.expectedHead, "live feature branch differs");
  assert.equal(live.get("refs/heads/main"), FROZEN_MAIN_SHA, "live main changed");
  assert.equal(mediaDiff, "", "Phase 4 production media authority changed after accepted Phase 5A");
  assert.equal(publicDiff, "", "public supporting-route source changed after accepted Phase 5A");
  const commits = parseLinearLog(logText);
  assert.equal(commits.at(-1).commit, options.expectedHead, "checkpoint chain does not end at HEAD");
  const baseTree = parseTree(baseTreeText);
  const headTree = parseTree(headTreeText);
  const newPaths = newPathsText.split(/\r?\n/).filter(Boolean);
  const newTrackedOverOneMb = [];
  for (const relativePath of newPaths) {
    const size = Number(await git("cat-file", "-s", `${options.expectedHead}:${relativePath}`));
    if (size > 1_000_000) newTrackedOverOneMb.push({ relativePath, bytes: size });
  }
  const [blendBytes, mediaManifestBytes] = await Promise.all([
    readFile(path.join(ROOT, ...PRODUCTION_BLEND_RELATIVE.split("/"))),
    readFile(path.join(ROOT, ...ACTIVE_MEDIA_MANIFEST_RELATIVE.split("/"))),
  ]);
  assert.equal(sha256(blendBytes), PRODUCTION_BLEND_SHA256, "production Blender SHA-256 changed");
  assert.equal(sha256(mediaManifestBytes), ACTIVE_MEDIA_MANIFEST_SHA256, "active media manifest SHA-256 changed");
  return {
    branch, head, parent: commits.at(-1).parents[0], acceptedPhase5A: ACCEPTED_PHASE5A_SHA, frozenMain: localMain,
    upstreamHead: upstream, liveBranchHead: live.get(`refs/heads/${REQUIRED_BRANCH}`), originMain, liveMain: live.get("refs/heads/main"), cleanTree: true,
    commits, trackedDelta: {
      baseFiles: baseTree.length, finalFiles: headTree.length, fileCount: headTree.length - baseTree.length,
      baseBytes: baseTree.reduce((sum, item) => sum + item.bytes, 0), finalBytes: headTree.reduce((sum, item) => sum + item.bytes, 0),
      bytes: headTree.reduce((sum, item) => sum + item.bytes, 0) - baseTree.reduce((sum, item) => sum + item.bytes, 0),
      newTrackedOverOneMb,
    },
    publicSupportingRoutesUnchanged: true,
    phase4ProductionMedia: { unchanged: true, blendSha256: PRODUCTION_BLEND_SHA256, activeManifestSha256: ACTIVE_MEDIA_MANIFEST_SHA256 },
    trackedTooling: requiredTools,
  };
}

async function recursiveFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`symlink/reparse input is forbidden: ${absolute}`);
      if (info.isDirectory()) await visit(absolute);
      else if (info.isFile()) files.push(path.relative(root, absolute).replaceAll("\\", "/"));
      else throw new Error(`non-regular input is forbidden: ${absolute}`);
    }
  }
  await visit(root);
  return files.sort(lexicalCompare);
}

function exactPaths(actual, expected, label) {
  assert.deepEqual([...actual].sort(lexicalCompare), [...expected].sort(lexicalCompare), `${label} inventory differs`);
}

async function validateImage(bytes, label) {
  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  if (!IMAGE_EXTENSIONS.has(`.${metadata.format}`) || !Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) || metadata.width < 16 || metadata.height < 16) throw new Error(`image contract failed: ${label}`);
  return { format: metadata.format, width: metadata.width, height: metadata.height };
}

async function validateFfprobe(executable) {
  const resolved = await realpath(executable);
  if (!(await stat(resolved)).isFile()) throw new Error("ffprobe must resolve to a regular file");
  await run(resolved, ["-version"], "ffprobe identity", { maxBuffer: 1_000_000 });
  return resolved;
}

async function probeVideo(ffprobe, file, label) {
  const { stdout } = await run(ffprobe, ["-v", "error", "-show_entries", "format=format_name,duration:stream=index,codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate", "-of", "json", file], `ffprobe ${label}`, { maxBuffer: 2_000_000 });
  const document = JSON.parse(stdout);
  const streams = document.streams ?? [];
  const videos = streams.filter((stream) => stream.codec_type === "video");
  assert.equal(videos.length, 1, `${label} must contain exactly one video stream`);
  assert.equal(streams.filter((stream) => stream.codec_type === "audio").length, 0, `${label} must contain zero audio streams`);
  assert.equal(streams.length, 1, `${label} must contain no other streams`);
  const video = videos[0];
  const durationSeconds = Number(document.format?.duration);
  assert.ok(String(document.format?.format_name).includes("mp4"), `${label} must be MP4`);
  assert.equal(video.codec_name, "h264", `${label} must be H.264`);
  assert.equal(video.pix_fmt, "yuv420p", `${label} must be yuv420p`);
  assert.equal(video.avg_frame_rate, "30/1", `${label} must average 30 fps`);
  assert.equal(video.r_frame_rate, "30/1", `${label} must be constant 30 fps`);
  assert.ok(Number.isFinite(durationSeconds) && durationSeconds >= 4, `${label} duration is too short`);
  return { format: "mp4", codec: "h264", pixelFormat: "yuv420p", width: video.width, height: video.height, fps: 30, audioStreams: 0, durationSeconds };
}

function validatePendingPolicy(document, label) {
  assert.deepEqual(document.humanReviewGates, HUMAN_REVIEW_GATES, `${label} human gates differ`);
  assert.equal(document.authorization?.humanAccepted, false, `${label} cannot self-approve`);
  assert.equal(document.authorization?.mainMerged, false, `${label} cannot claim merge`);
  assert.equal(document.authorization?.phase5BAuthorized, false, `${label} cannot authorize Phase 5B`);
}

function recordMap(records, label) {
  assert.ok(Array.isArray(records), `${label} records must be an array`);
  const result = new Map();
  for (const record of records) {
    safeRelativePath(record.relativePath, `${label} record path`);
    assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0, `${record.relativePath} has invalid bytes`);
    assert.match(record.sha256 ?? "", HASH64, `${record.relativePath} has invalid SHA-256`);
    assert.ok(!result.has(record.relativePath), `${label} has duplicate ${record.relativePath}`);
    result.set(record.relativePath, record);
  }
  return result;
}

async function collectExactRoot(root, prefix, expectedPaths, ffprobe) {
  const inventory = await recursiveFiles(root);
  exactPaths(inventory, expectedPaths, `${prefix} source`);
  const entries = [];
  const records = [];
  const byRelative = new Map();
  let total = 0;
  for (const relativePath of inventory) {
    const packagePath = `${prefix}/${relativePath}`;
    assertAllowedEntry(packagePath);
    const source = path.join(root, ...relativePath.split("/"));
    const info = await stat(source);
    if (!info.isFile() || info.size <= 0 || info.size > MAX_FILE_BYTES) throw new Error(`invalid review payload size: ${packagePath}`);
    total += info.size;
    if (total > MAX_PACKAGE_BYTES) throw new Error("review source exceeds compact package limit");
    const bytes = await readFile(source);
    assertNoPrivateText(bytes, packagePath);
    const extension = path.extname(relativePath).toLowerCase();
    let media;
    if (IMAGE_EXTENSIONS.has(extension)) media = await validateImage(bytes, packagePath);
    else if (VIDEO_EXTENSIONS.has(extension)) media = await probeVideo(ffprobe, source, packagePath);
    else if (!TEXT_EXTENSIONS.has(extension)) throw new Error(`unsupported source type: ${packagePath}`);
    const record = { relativePath: packagePath, byteSize: bytes.length, sha256: sha256(bytes), kind: IMAGE_EXTENSIONS.has(extension) ? "image" : VIDEO_EXTENSIONS.has(extension) ? "video" : "document", ...(media ? { media } : {}) };
    entries.push({ path: packagePath, data: bytes });
    records.push(record);
    byRelative.set(relativePath, { bytes, record });
  }
  return { inventory, entries, records, byRelative };
}

function assertManifestLedger(root, manifest, ledgerPaths, label) {
  const ledger = recordMap(manifest.artifacts, `${label} manifest`);
  exactPaths([...ledger.keys()], ledgerPaths, `${label} manifest ledger`);
  for (const relativePath of ledgerPaths) {
    const source = root.byRelative.get(relativePath);
    const authority = ledger.get(relativePath);
    assert.equal(source.record.byteSize, authority.bytes, `${relativePath} manifest byte count differs`);
    assert.equal(source.record.sha256, authority.sha256, `${relativePath} manifest hash differs`);
  }
  return ledger;
}

function validateHomepage(root, options) {
  const manifest = JSON.parse(root.byRelative.get(HOME_MANIFEST).bytes.toString("utf8"));
  assert.equal(manifest.schema, HOME_MANIFEST_SCHEMA, "homepage evidence schema differs");
  assert.equal(manifest.status, "PASS", "homepage evidence must PASS");
  assert.equal(manifest.target?.expectedHead, options.expectedHead, "homepage evidence HEAD differs");
  assert.equal(manifest.target?.expectedBranch, REQUIRED_BRANCH, "homepage evidence branch differs");
  assert.equal(manifest.target?.deploymentId, options.expectedDeploymentId, "homepage evidence deployment differs");
  assert.equal(manifest.target?.deploymentProject, REQUIRED_PROJECT, "homepage evidence project differs");
  assert.equal(String(manifest.target?.deploymentCheckRunId), String(options.deploymentCheckRunId), "homepage evidence check run differs");
  assert.equal(manifest.target?.immutableUrl, options.immutableUrl, "homepage evidence immutable URL differs");
  assert.equal(manifest.target?.branchUrl, options.branchUrl, "homepage evidence branch URL differs");
  assert.equal(manifest.acceptedBaseline?.head, ACCEPTED_PHASE5A_SHA, "homepage accepted baseline differs");
  assert.equal(manifest.acceptedBaseline?.browserEvidenceManifestSha256, ACCEPTED_PHASE5A_EVIDENCE_MANIFEST_SHA256, "accepted Phase 5A evidence hash differs");
  assert.equal(manifest.acceptedBaseline?.deploymentReportSha256, ACCEPTED_PHASE5A_DEPLOYMENT_REPORT_SHA256, "accepted Phase 5A deployment hash differs");
  assert.equal(manifest.activeMedia?.sourceBlendSha256, PRODUCTION_BLEND_SHA256, "homepage source media hash differs");
  assert.equal(manifest.activeMedia?.manifestSha256, ACTIVE_MEDIA_MANIFEST_SHA256, "homepage active media hash differs");
  validatePendingPolicy(manifest, "homepage evidence");
  assertManifestLedger(root, manifest, expectedHomePaths().filter((item) => item !== HOME_MANIFEST), "homepage evidence");
  assert.equal(manifest.summary?.recordings, 2, "homepage must contain two recordings");
  assert.equal(manifest.summary?.sheets, 4, "homepage must contain four sheets");
  assert.equal(manifest.summary?.reportsExcludingSelf, 6, "homepage must contain six reports");
  for (const [relativePath, schema] of Object.entries(HOME_REPORT_SCHEMAS)) {
    const report = JSON.parse(root.byRelative.get(relativePath).bytes.toString("utf8"));
    assert.equal(report.schema, schema, `${relativePath} schema differs`);
    assert.equal(report.status, "PASS", `${relativePath} must PASS`);
    assert.equal(report.target?.expectedHead, options.expectedHead, `${relativePath} HEAD differs`);
  }
  return manifest;
}

function validateRoutePreproduction(root) {
  const manifest = JSON.parse(root.byRelative.get("route-preproduction-manifest.json").bytes.toString("utf8"));
  assert.equal(manifest.schema, ROUTE_MANIFEST_SCHEMA, "route manifest schema differs");
  assert.equal(manifest.status, "PASS", "route manifest must be full PASS, not smoke");
  assert.equal(manifest.mode, "full", "route manifest must be full mode");
  assert.deepEqual(manifest.routes, ROUTE_ORDER, "route order differs");
  assert.equal(manifest.totals?.artifacts, 70, "route manifest must bind exactly 70 review artifacts");
  assert.equal(manifest.publicRoutesChanged, false, "route manifest reports public route changes");
  assert.equal(manifest.phase5BAuthorized, false, "route manifest authorizes Phase 5B");
  assert.equal(manifest.humanVisualJudgmentAuthoritative, true, "human visual judgment must remain authoritative");
  assertManifestLedger(root, manifest, expectedRouteReviewPaths(), "route preproduction");
  const reportSchemas = {
    "reports/accessibility.json": "qh.phase5ar.route-accessibility.v1",
    "reports/public-source-freeze.json": "qh.phase5ar.public-source-freeze.v1",
    "reports/request-isolation.json": "qh.phase5ar.route-request-isolation.v1",
    "reports/route-capture-report.json": "qh.phase5ar.route-preproduction-capture.v1",
  };
  for (const [relativePath, schema] of Object.entries(reportSchemas)) {
    const report = JSON.parse(root.byRelative.get(relativePath).bytes.toString("utf8"));
    assert.equal(report.schema, schema, `${relativePath} schema differs`);
    assert.equal(report.status, "PASS", `${relativePath} must PASS`);
    assert.equal(report.phase5BAuthorized ?? report.provenance?.phase5BAuthorized ?? false, false, `${relativePath} authorizes Phase 5B`);
  }
  const freeze = JSON.parse(root.byRelative.get("reports/public-source-freeze.json").bytes.toString("utf8"));
  assert.equal(freeze.acceptedPhase5A, ACCEPTED_PHASE5A_SHA, "public source freeze baseline differs");
  assert.equal(freeze.publicRoutesChanged, false, "public supporting routes changed");
  assert.equal(freeze.files?.length, FROZEN_PUBLIC_FILES.length, "public source freeze inventory differs");
  const antiTemplate = root.byRelative.get("cross-route-system/PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md").bytes.toString("utf8");
  assert.equal((antiTemplate.match(/<!--\s*pair:[a-z0-9-]+\|[a-z0-9-]+\s*-->/g) ?? []).length, 36, "anti-template audit must contain all 36 route pairs");
  assert.match(antiTemplate, /Human visual judgment remains authority/i, "anti-template audit omits human authority");
  return manifest;
}

function validateDeploymentReport(bytes, options) {
  const report = JSON.parse(bytes.toString("utf8"));
  assert.equal(report.schema, "quantum-hub.phase-5a-r.deployment-verification.v1", "deployment report schema differs");
  assert.equal(report.status, "PASS", "deployment report must PASS");
  assert.equal(report.git?.head, options.expectedHead, "deployment report HEAD differs");
  assert.equal(report.git?.parent, ACCEPTED_PHASE5A_SHA, "deployment report accepted parent differs");
  assert.equal(report.git?.commits?.length, 5, "deployment report commit count differs");
  assert.deepEqual(report.git.commits.map((item) => item.subject), CHECKPOINT_SUBJECTS, "deployment report checkpoint subjects differ");
  assert.equal(report.git?.cleanTree, true, "deployment report does not bind a clean tree");
  assert.equal(report.git?.localMain, FROZEN_MAIN_SHA, "deployment report local main differs");
  assert.equal(report.git?.upstreamMain, FROZEN_MAIN_SHA, "deployment report origin main differs");
  assert.equal(report.git?.liveMain, FROZEN_MAIN_SHA, "deployment report live main differs");
  assert.equal(report.git?.upstreamBranch, options.expectedHead, "deployment report upstream differs");
  assert.equal(report.git?.liveBranch, options.expectedHead, "deployment report live branch differs");
  assert.equal(report.deployment?.deploymentId, options.expectedDeploymentId, "deployment ID differs");
  assert.equal(report.deployment?.project, REQUIRED_PROJECT, "deployment project differs");
  assert.equal(report.deployment?.exactSha, options.expectedHead, "deployed SHA differs");
  assert.equal(report.deployment?.branch, REQUIRED_BRANCH, "deployed branch differs");
  assert.equal(report.deployment?.immutableUrl, options.immutableUrl, "immutable URL differs");
  assert.equal(report.deployment?.branchUrl, options.branchUrl, "branch URL differs");
  assert.equal(String(report.deployment?.githubCheck?.id), String(options.deploymentCheckRunId), "deployment check run differs");
  assert.ok(Object.values(report.checks ?? {}).every((value) => value === true), "deployment report checks must all PASS");
  assert.deepEqual(report.authorization, { humanAccepted: false, mainMerged: false, phase5BAuthorized: false }, "deployment report cannot self-approve");
  return report;
}

async function collectAuthorities(options, repository) {
  const entries = [];
  const records = [];
  const roles = {};
  for (const [role, authority] of Object.entries(AUTHORITY_SOURCES)) {
    const diff = await git("diff", "--name-only", ACCEPTED_PHASE5A_SHA, options.expectedHead, "--", authority.source);
    assert.equal(diff, "", `${authority.source} must remain frozen from accepted Phase 5A`);
    const bytes = await readFile(path.join(ROOT, ...authority.source.split("/")));
    assertNoPrivateText(bytes, authority.archive);
    entries.push({ path: authority.archive, data: bytes });
    records.push({ relativePath: authority.archive, byteSize: bytes.length, sha256: sha256(bytes), kind: "document", source: authority.source, frozenFromAcceptedPhase5A: true });
    roles[role] = authority.archive;
  }
  const deploymentBytes = await readFile(options.deploymentReport);
  validateDeploymentReport(deploymentBytes, options);
  assertNoPrivateText(deploymentBytes, DEPLOYMENT_AUTHORITY_PATH);
  entries.push({ path: DEPLOYMENT_AUTHORITY_PATH, data: deploymentBytes });
  records.push({ relativePath: DEPLOYMENT_AUTHORITY_PATH, byteSize: deploymentBytes.length, sha256: sha256(deploymentBytes), kind: "document", source: "external final deployment verifier", frozenFromAcceptedPhase5A: false });
  roles.gitDeployment = DEPLOYMENT_AUTHORITY_PATH;
  assert.equal(repository.publicSupportingRoutesUnchanged, true);
  return { entries, records, roles, deployment: JSON.parse(deploymentBytes.toString("utf8")) };
}

export function buildArtifactRoles() {
  return {
    homepage: {
      forwardRecording: `homepage-manifesto/${HOME_RECORDINGS[0]}`,
      reverseRecording: `homepage-manifesto/${HOME_RECORDINGS[1]}`,
      sheets: HOME_SHEETS.map((item) => `homepage-manifesto/${item}`),
      reports: Object.fromEntries(Object.keys(HOME_REPORT_SCHEMAS).map((item) => [path.posix.basename(item, ".json"), `homepage-manifesto/${item}`])),
      evidenceManifest: `homepage-manifesto/${HOME_MANIFEST}`,
    },
    supportingRoutes: {
      routes: Object.fromEntries(ROUTE_ORDER.map((route) => [route, Object.fromEntries(ROUTE_ARTIFACTS.map((name) => [path.posix.basename(name, path.posix.extname(name)), `supporting-routes/routes/${route}/${name}`]))])),
      crossRoute: Object.fromEntries(CROSS_ROUTE_ARTIFACTS.map((name) => [path.posix.basename(name, path.posix.extname(name)), `supporting-routes/cross-route-system/${name}`])),
      reports: Object.fromEntries(ROUTE_REPORTS.map((name) => [path.posix.basename(name, ".json"), `supporting-routes/${name}`])),
      manifest: "supporting-routes/route-preproduction-manifest.json",
      readme: "supporting-routes/README.md",
    },
    authorities: Object.fromEntries(Object.entries(AUTHORITY_SOURCES).map(([role, authority]) => [role, authority.archive]).concat([["gitDeployment", DEPLOYMENT_AUTHORITY_PATH]])),
  };
}

function flattenRolePaths(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => flattenRolePaths(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => flattenRolePaths(item, output));
  return output;
}

export function validateArtifactRoles(roles, entryPaths) {
  assert.deepEqual(roles, buildArtifactRoles(), "artifact role contract differs");
  const available = new Set(entryPaths);
  const rolePaths = flattenRolePaths(roles);
  assert.equal(rolePaths.length, 13 + 76 + Object.keys(AUTHORITY_SOURCES).length + 1, "artifact role count differs");
  assert.equal(new Set(rolePaths).size, rolePaths.length, "artifact roles contain duplicate paths");
  rolePaths.forEach((item) => assert.ok(available.has(item), `artifact role target is absent: ${item}`));
  return true;
}

function readmeText(repository, options) {
  return [
    "# Quantum-Hub Phase 5A-R human-review package", "",
    "This archive contains deployed manifesto evidence, compact local supporting-route preproduction, and frozen review authorities. Supporting-route designs are speculative and are not public production code.", "",
    `Branch: \`${repository.branch}\``, `Final HEAD: \`${repository.head}\``, `Exact final parent: \`${repository.parent}\``, `Accepted Phase 5A authority: \`${ACCEPTED_PHASE5A_SHA}\``,
    `Frozen main: \`${FROZEN_MAIN_SHA}\``, `Immutable preview: ${options.immutableUrl}`, `Branch preview: ${options.branchUrl}`, "",
    "The two MP4 files are the forward and reverse deployed manifesto recordings. Four sheets cover the fifteen required states. Each supporting-route folder contains exactly seven review artifacts; the cross-route folder contains exactly seven comparison authorities.", "",
    "A machine PASS proves archive integrity and traceability only. It is not human acceptance. The manifesto prerequisite and all six Phase 5A gates remain PENDING HUMAN REVIEW. Phase 5B remains UNAUTHORIZED.", "",
  ].join("\n");
}

export function validateReviewPolicy(manifest) {
  assert.deepEqual(manifest.humanReviewGates, HUMAN_REVIEW_GATES, "exact seven-gate pending policy differs");
  assert.deepEqual(manifest.authorization, AUTHORIZATION, "no-self-approval authorization differs");
  assert.equal(manifest.policy?.machinePassGrantsHumanAcceptance, false, "machine PASS cannot grant acceptance");
  assert.equal(manifest.policy?.phase5B, "UNAUTHORIZED", "Phase 5B must remain unauthorized");
  assert.equal(manifest.policy?.pendingGateCount, 7, "all seven gates must remain pending");
  return true;
}

export function selfTest() {
  const entries = [
    { path: README_FILENAME, data: Buffer.from("Phase 5A-R review fixture\n") },
    { path: IN_ARCHIVE_MANIFEST, data: Buffer.from('{"schema":"phase5ar-self-test"}\n') },
  ];
  const forward = createStoredZipBuffer(entries);
  const reverse = createStoredZipBuffer([...entries].reverse());
  assert.ok(forward.equals(reverse), "deterministic ZIP self-test differs");
  const roles = buildArtifactRoles();
  assert.equal(flattenRolePaths(roles).length, 95, "role inventory self-test differs");
  validateReviewPolicy({ humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION, policy: { phase5B: "UNAUTHORIZED", pendingGateCount: 7, authorMaySelfApprove: false, deployerMaySelfApprove: false, machinePassGrantsHumanAcceptance: false } });
  assert.throws(() => assertNoPrivateText(Buffer.from("C:\\Users\\private"), README_FILENAME), /privacy/);
  assert.equal(assertNoPrivateText(Buffer.from([0x5c, 0x5c, 0x66, 0x51, 0xe3, 0xda, 0x08, 0x56, 0x5c, 0x46, 0xbb]), HOME_RECORDINGS[0]), true);
  assert.throws(() => assertNoPrivateText(Buffer.alloc(0), "C:\\Users\\private\\01-forward-manifesto.mp4"), /privacy/);
  return { schema: `${PACKAGE_SCHEMA}.self-test`, status: "PASS", tests: 7, writesPerformed: false, gitCommandsPerformed: false, networkRequestsPerformed: false, mediaToolsLaunched: false };
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createStoredZipBuffer(entries) {
  const ordered = [...entries].sort((left, right) => lexicalCompare(left.path, right.path));
  const names = ordered.map((entry) => safeRelativePath(entry.path, "ZIP entry"));
  if (new Set(names).size !== names.length || ordered.length > 0xffff) throw new Error("ZIP paths must be unique and non-ZIP64");
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of ordered) {
    assertAllowedEntry(entry.path);
    const name = Buffer.from(entry.path, "utf8");
    const data = Buffer.from(entry.data);
    const checksum = crc32(data);
    if (data.length > 0xffffffff || offset > 0xffffffff) throw new Error("ZIP64 is unsupported");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(20, 4); localHeader.writeUInt16LE(0x0800, 6); localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10); localHeader.writeUInt16LE(0x0021, 12); localHeader.writeUInt32LE(checksum, 14); localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22); localHeader.writeUInt16LE(name.length, 26);
    local.push(localHeader, name, data);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); centralHeader.writeUInt16LE(20, 4); centralHeader.writeUInt16LE(20, 6); centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10); centralHeader.writeUInt16LE(0, 12); centralHeader.writeUInt16LE(0x0021, 14); centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20); centralHeader.writeUInt32LE(data.length, 24); centralHeader.writeUInt16LE(name.length, 28); centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  if (offset + centralBytes.length > 0xffffffff) throw new Error("ZIP64 is unsupported");
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(ordered.length, 8); eocd.writeUInt16LE(ordered.length, 10); eocd.writeUInt32LE(centralBytes.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, eocd]);
}

export async function assertFreshOutputSet(paths) {
  for (const candidate of paths) {
    try { await access(candidate); throw new Error(`destination already exists and will not be overwritten: ${candidate}`); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  return true;
}

export async function publishFreshSetAtomic(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) throw new Error("atomic publication requires source/destination pairs");
  const destinations = pairs.map((pair) => pair?.destination);
  if (destinations.some((item) => typeof item !== "string" || !item)) throw new Error("atomic publication has an invalid destination");
  if (new Set(destinations.map((item) => path.resolve(item))).size !== destinations.length) throw new Error("atomic publication destinations must be unique");
  await assertFreshOutputSet(destinations);
  const published = [];
  try {
    for (const pair of pairs) {
      await rename(pair.source, pair.destination);
      published.push(pair.destination);
    }
  } catch (error) {
    for (const destination of published) await unlink(destination).catch(() => {});
    throw error;
  }
  return destinations;
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

async function spawnAuditor(args) {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [AUDITOR, ...args], { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0) reject(new Error(`independent Phase 5A-R audit failed (${code ?? signal}): ${Buffer.concat(stderr).toString("utf8").slice(-6_000)}`));
      else resolve({ pid: child.pid, stdout: Buffer.concat(stdout).toString("utf8") });
    });
  });
}

function sibling(output, filename) { return path.join(path.dirname(output), filename); }

export async function assemblePackage(input) {
  const options = validateOptionShape(input);
  const [homepageRoot, routeRoot, deploymentReport, canonicalOutput, ffprobe] = await Promise.all([
    realpath(assertExternalPath(options.homepageEvidenceRoot, "homepage evidence root")),
    realpath(assertExternalPath(options.routePreproductionRoot, "route preproduction root")),
    realpath(assertExternalPath(options.deploymentReport, "deployment report")),
    canonicalFuturePath(assertExternalPath(options.output, "review archive")), validateFfprobe(options.ffprobe),
  ]);
  for (const [candidate, label] of [[homepageRoot, "homepage evidence"], [routeRoot, "route preproduction"]]) if (!(await stat(candidate)).isDirectory()) throw new Error(`${label} root must be a directory`);
  if (!(await stat(deploymentReport)).isFile()) throw new Error("deployment report must be a regular file");
  assertExternalPath(homepageRoot); assertExternalPath(routeRoot); assertExternalPath(deploymentReport); assertExternalPath(canonicalOutput);
  if (isWithin(homepageRoot, routeRoot) || isWithin(routeRoot, homepageRoot)) throw new Error("evidence roots must be disjoint");
  if (isWithin(homepageRoot, canonicalOutput) || isWithin(routeRoot, canonicalOutput)) throw new Error("output cannot be inside an evidence root");
  options.output = canonicalOutput;
  options.deploymentReport = deploymentReport;
  await mkdir(path.dirname(canonicalOutput), { recursive: true });
  const finalManifest = sibling(canonicalOutput, DETACHED_MANIFEST_FILENAME);
  const finalAudit = sibling(canonicalOutput, AUDIT_FILENAME);
  await assertFreshOutputSet([canonicalOutput, finalManifest, finalAudit]);

  const repository = await repositoryAuthority(options);
  const [homepage, routes, authorities] = await Promise.all([
    collectExactRoot(homepageRoot, "homepage-manifesto", expectedHomePaths(), ffprobe),
    collectExactRoot(routeRoot, "supporting-routes", expectedRouteRootPaths(), ffprobe),
    collectAuthorities(options, repository),
  ]);
  validateHomepage(homepage, options);
  validateRoutePreproduction(routes);

  const readme = Buffer.from(readmeText(repository, options), "utf8");
  assertNoPrivateText(readme, README_FILENAME);
  const readmeRecord = { relativePath: README_FILENAME, byteSize: readme.length, sha256: sha256(readme), kind: "document" };
  const records = [...homepage.records, ...routes.records, ...authorities.records, readmeRecord].sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
  const roles = buildArtifactRoles();
  validateArtifactRoles(roles, records.map((item) => item.relativePath));
  const manifest = {
    schema: PACKAGE_SCHEMA, status: "PASS", generatedAt: FIXED_EPOCH,
    deterministicArchive: { compression: "stored", fixedDosTimestamp: FIXED_EPOCH, lexicalUtf8ByteOrder: true, zip64: false },
    source: repository,
    deployment: {
      deploymentId: options.expectedDeploymentId, project: REQUIRED_PROJECT, checkRunId: String(options.deploymentCheckRunId),
      commit: options.expectedHead, branch: REQUIRED_BRANCH, immutableUrl: options.immutableUrl, branchUrl: options.branchUrl,
      verificationReportSha256: authorities.records.find((item) => item.relativePath === DEPLOYMENT_AUTHORITY_PATH).sha256,
    },
    acceptedAuthorities: {
      phase5AHead: ACCEPTED_PHASE5A_SHA, phase5ABrowserEvidenceManifestSha256: ACCEPTED_PHASE5A_EVIDENCE_MANIFEST_SHA256,
      phase5ADeploymentReportSha256: ACCEPTED_PHASE5A_DEPLOYMENT_REPORT_SHA256,
      phase5AReviewZipSha256: ACCEPTED_PHASE5A_REVIEW_ZIP_SHA256,
      phase5AReviewManifestSha256: ACCEPTED_PHASE5A_REVIEW_MANIFEST_SHA256,
      phase5AReviewAuditSha256: ACCEPTED_PHASE5A_REVIEW_AUDIT_SHA256,
      phase4ProductionBlendSha256: PRODUCTION_BLEND_SHA256, activeProductionMediaManifestSha256: ACTIVE_MEDIA_MANIFEST_SHA256,
    },
    provenance: {
      homepageManifesto: { prefix: "homepage-manifesto/", classification: "DEPLOYED IMMUTABLE MANIFESTO EVIDENCE", deployed: true, captureManifestSha256: homepage.byRelative.get(HOME_MANIFEST).record.sha256 },
      supportingRoutes: { prefix: "supporting-routes/", classification: "LOCAL SPECULATIVE PREPRODUCTION", deployed: false, publicSupportingRoutesChanged: false, captureManifestSha256: routes.byRelative.get("route-preproduction-manifest.json").record.sha256 },
      reviewAuthorities: { prefix: "review-authorities/", frozenPhase5APlanningDocuments: Object.keys(AUTHORITY_SOURCES).length, finalDeploymentVerification: true },
    },
    traceability: { artifactRoles: roles, everyNonSelfArchiveFileHasSha256: true, inArchiveManifestBoundByDetachedManifest: true, detachedManifestBoundByIndependentAudit: true },
    inventory: {
      homepageFiles: homepage.records.length, routeReviewArtifacts: 70, routeSupportFiles: routes.records.length - 70,
      routeFolders: ROUTE_ORDER.length, routeArtifactsPerRoute: ROUTE_ARTIFACTS.length, crossRouteArtifacts: CROSS_ROUTE_ARTIFACTS.length,
      authorityFiles: authorities.records.length, hashedNonSelfArchiveFiles: records.length, archiveEntries: records.length + 1,
      hashedNonSelfArchiveBytes: records.reduce((sum, item) => sum + item.byteSize, 0),
    },
    files: records,
    unhashedSelfEntries: [IN_ARCHIVE_MANIFEST],
    exclusions: { rawFrames: true, redundantCaptures: true, sourceMedia: true, buildOutput: true, prototypeInternals: true, nestedArchives: true, privatePaths: true, secrets: true },
    humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION,
    policy: { phase5B: "UNAUTHORIZED", pendingGateCount: 7, authorMaySelfApprove: false, deployerMaySelfApprove: false, machinePassGrantsHumanAcceptance: false },
  };
  validateReviewPolicy(manifest);
  const manifestBytes = Buffer.from(stableJson(manifest));
  assertNoPrivateText(manifestBytes, IN_ARCHIVE_MANIFEST);
  const entries = [...homepage.entries, ...routes.entries, ...authorities.entries, { path: README_FILENAME, data: readme }, { path: IN_ARCHIVE_MANIFEST, data: manifestBytes }];
  const archiveBytes = createStoredZipBuffer(entries);
  assert.ok(archiveBytes.equals(createStoredZipBuffer([...entries].reverse())), "canonical ZIP differs after input reordering");
  const detached = {
    schema: DETACHED_SCHEMA, status: "PASS", generatedAt: FIXED_EPOCH,
    archive: { filename: ARCHIVE_FILENAME, bytes: archiveBytes.length, sha256: sha256(archiveBytes) },
    inArchiveManifest: { path: IN_ARCHIVE_MANIFEST, bytes: manifestBytes.length, sha256: sha256(manifestBytes), schema: PACKAGE_SCHEMA },
    source: { branch: REQUIRED_BRANCH, head: options.expectedHead, acceptedPhase5A: ACCEPTED_PHASE5A_SHA, frozenMain: FROZEN_MAIN_SHA },
    humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION,
    selfBinding: { archiveHashBindsEveryZIPByte: true, inArchiveManifestHashBindsPackageContract: true, detachedManifestHashRecordedByIndependentAudit: true },
  };
  validatePendingPolicy(detached, "detached manifest");
  const detachedBytes = Buffer.from(stableJson(detached));
  assertNoPrivateText(detachedBytes, DETACHED_MANIFEST_FILENAME);

  const assembly = path.join(path.dirname(canonicalOutput), `.phase5ar-review-assembly-${randomUUID()}`);
  if (!isWithin(path.dirname(canonicalOutput), assembly) || assembly === path.dirname(canonicalOutput)) throw new Error("unsafe assembly path");
  await mkdir(assembly, { recursive: false });
  const assembledArchive = path.join(assembly, ARCHIVE_FILENAME);
  const assembledManifest = path.join(assembly, DETACHED_MANIFEST_FILENAME);
  const assembledAudit = path.join(assembly, AUDIT_FILENAME);
  try {
    await writeFile(assembledArchive, archiveBytes, { flag: "wx" });
    await writeFile(assembledManifest, detachedBytes, { flag: "wx" });
    const child = await spawnAuditor([
      "--archive", assembledArchive, "--manifest", assembledManifest, "--audit-output", assembledAudit,
      "--expected-head", options.expectedHead, "--expected-upstream", options.expectedUpstream,
      "--expected-branch", REQUIRED_BRANCH, "--expected-main", FROZEN_MAIN_SHA, "--accepted-phase5a", ACCEPTED_PHASE5A_SHA,
      "--expected-deployment-id", options.expectedDeploymentId, "--deployment-project", REQUIRED_PROJECT,
      "--deployment-check-run-id", String(options.deploymentCheckRunId), "--immutable-url", options.immutableUrl, "--branch-url", options.branchUrl,
      "--ffprobe", ffprobe, "--expected-parent-process-id", String(process.pid),
    ]);
    const auditBytes = await readFile(assembledAudit);
    const audit = JSON.parse(auditBytes.toString("utf8"));
    assert.equal(audit.schema, AUDIT_SCHEMA, "independent audit schema differs");
    assert.equal(audit.status, "PASS", "independent audit did not PASS");
    assert.equal(audit.archive?.sha256, detached.archive.sha256, "independent audit archive binding differs");
    assert.equal(audit.detachedManifest?.sha256, sha256(detachedBytes), "independent audit detached-manifest binding differs");
    assert.equal(audit.process?.separateProcess, true, "audit must run separately");
    assert.equal(audit.process?.auditorProcessId, child.pid, "auditor process identity differs");
    assert.equal(audit.process?.parentProcessId, process.pid, "auditor parent identity differs");
    await publishFreshSetAtomic([
      { source: assembledArchive, destination: canonicalOutput },
      { source: assembledManifest, destination: finalManifest },
      { source: assembledAudit, destination: finalAudit },
    ]);
    return {
      schema: `${PACKAGE_SCHEMA}.result`, status: "PASS",
      archive: { path: canonicalOutput, bytes: archiveBytes.length, sha256: sha256(archiveBytes) },
      manifest: { path: finalManifest, bytes: detachedBytes.length, sha256: sha256(detachedBytes) },
      audit: { path: finalAudit, bytes: auditBytes.length, sha256: sha256(auditBytes), separateProcess: true, processId: child.pid },
      trackedDelta: repository.trackedDelta, humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION,
    };
  } finally {
    if (!isWithin(path.dirname(canonicalOutput), assembly) || assembly === path.dirname(canonicalOutput)) throw new Error("refusing unsafe assembly cleanup");
    await rm(assembly, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  if (options.selfTest) { process.stdout.write(stableJson(selfTest())); return; }
  const result = await assemblePackage(options);
  process.stdout.write(stableJson(result));
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { process.stderr.write(`Phase 5A-R package FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
