#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

import { DEVICE_REVIEW_CHECKS, HUMAN_EVIDENCE_POLICY, validateMp4Structure, validateReviewEntry } from "./ingest-phase6-r1-human-evidence.mjs";
import { validateReport as validateAccessibilityReport } from "./qa-phase6-accessibility-interactions.mjs";
import { PHASE6_ROUTES } from "./phase6-contract.mjs";
import {
  HTML_AUTHORITY_FILES,
  PUBLIC_ROUTE_OUTCOMES,
  REQUIRED_HEADER_POLICIES,
  canonicalForDistFile,
  publicPathForDistFile,
} from "./verify-phase6-deployment.mjs";
import {
  ALLOWED_PACKAGE_SCRIPT_CHANGES as R1_ALLOWED_PACKAGE_SCRIPT_CHANGES,
  ALLOWED_R1_CHANGED_PATHS,
  EXPECTED_R1_CHANGED_PATH_RECORDS,
  PRODUCTION_DIFF_PATHS as R1_PRODUCTION_DIFF_PATHS,
  REQUIRED_REPOSITORY as R1_REQUIRED_REPOSITORY,
} from "./verify-phase6-r1-deployment.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
export const SCHEMA = "quantum-hub.phase-6.final-evidence-assembly.v1";
export const FINAL_METADATA_SCHEMA = `${SCHEMA}.input`;
export const MAX_EVIDENCE_BYTES = 75 * 1024 * 1024;
export const REQUIRED_BRANCH = "feature/phase-6-global-hardening";
export const REQUIRED_BRANCH_URL = "https://feature-phase-6-global-harde.qsite1.pages.dev/";
export const REQUIRED_PARENT = "005a36860ecbfd6fedb3d3f2223f168c1edfbb05";
export const R1_REQUIRED_BRANCH = "repair/phase-6-r1-validation-closure";
export const R1_REQUIRED_BRANCH_URL = "https://repair-phase-6-r1-validation.qsite1.pages.dev/";
export const R1_REQUIRED_PARENT = "aee036740b129624c54b8f1b878229f955d187ae";
export const FROZEN_MAIN = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const POSTER_DECISION = "NO PRODUCTION POSTER CHANGE — CURRENT AUTHORITY RETAINED";
export const HUMAN_EVIDENCE_SCHEMA = "quantum-hub.phase-6-r1.human-evidence-ledger.v1";
export const R1_MOTION_EVIDENCE_SCHEMA = "quantum-hub.phase-6-r1.motion-evidence.v1";
export const R1_PERSISTENT_LIFECYCLE_SCHEMA = "quantum-hub.phase-6-r1.persistent-lifecycle.v1";
export const R1_NODE22_VALIDATION_SCHEMA_PREFIX = "quantum-hub.phase-6-r1.node22-integrated-validation.v";
export const R1_TOOLING_REPORT_FILES = Object.freeze([...ALLOWED_R1_CHANGED_PATHS]);
export const REQUIRED_HUMAN_EVIDENCE_FILES = Object.freeze([
  "iphone-safari-opening.mp4",
  "iphone-safari-maradin.mp4",
  "physical-scroll-input.mp4",
  "chrome-200-percent.mp4",
]);
export const R1_MOTION_RECORDING_SPECS = Object.freeze([
  Object.freeze({ id: "forward-physical-to-manifesto", filename: "01-forward-physical-to-manifesto.mp4" }),
  Object.freeze({ id: "reverse-manifesto-to-f1", filename: "02-reverse-manifesto-to-f1.mp4" }),
  Object.freeze({ id: "stop-at-authored-states", filename: "03-stop-at-authored-states.mp4" }),
  Object.freeze({ id: "resize-orientation-mid-current-and-manifesto", filename: "04-resize-orientation-mid-current-and-manifesto.mp4" }),
  Object.freeze({ id: "supporting-route-entry-and-reverse", filename: "05-supporting-route-entry-and-reverse.mp4" }),
]);

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

export const BRIEF_REQUIREMENTS = Object.freeze({
  "00-provenance": Object.freeze(["Git provenance", "branch ancestry", "main verification", "commit chain", "clean-tree proof", "deployment verification", "dist/deployment parity", "production-source diff"]),
  "01-baseline": Object.freeze(["PHASE_6_BASELINE.md", "PHASE_6_DEFECT_LEDGER.md", "accepted Phase 5B reference hashes", "initial browser/runtime inventory"]),
  "02-cross-engine": Object.freeze(["browser versions", "Chromium matrix", "WebKit matrix", "Firefox matrix", "engine-specific findings", "representative cross-engine screenshots", "representative recordings"]),
  "03-homepage-motion": Object.freeze(["fresh forward", "reverse", "fast skip", "stop-at-state", "manifesto autonomous fade", "Home /#entry", "no-F1 proof", "resize/orientation", "hidden/visible behavior"]),
  "04-supporting-routes": Object.freeze(["cross-route desktop sheet", "cross-route portrait sheet", "cross-route 320px sheet", "cross-route 844×390 sheet", "signature motion recordings", "route-specific runtime reports"]),
  "05-history-bfcache": Object.freeze(["direct /", "direct /#entry", "Back/Forward", "BFCache", "pageshow/pagehide", "refresh", "hash navigation", "mobile-menu history", "state-restoration report"]),
  "06-performance": Object.freeze(["cold/warm runs", "median/p95/max", "long-task attribution", "CPU-throttle stress", "RAF/interval report", "layout/paint report", "route budgets", "request totals", "CLS"]),
  "07-memory": Object.freeze(["repeated-cycle results", "DOM counters", "listener/observer audit", "Blob/object URL audit", "decoder audit", "media teardown", "bounded-growth conclusion"]),
  "08-network-media": Object.freeze(["normal request inventories", "slow-network tests", "blocked/failing media", "offline tests", "homepage request isolation", "supporting-route isolation", "Maradin lifecycle", "decoder behavior"]),
  "09-accessibility": Object.freeze(["axe", "keyboard", "focus", "mobile menu", "reduced motion", "no JS", "200%", "fallback fonts", "heading/landmark inventory", "target-size evidence"]),
  "10-poster-study": Object.freeze(["original inventory", "candidate inventory", "side-by-side comparison", "difference images", "byte/decode comparison", "final retain/replace decision", "resulting production hashes if changed"]),
  "11-physical-device": Object.freeze(["real-device results if genuinely performed", "otherwise PHASE_6_PHYSICAL_DEVICE_HANDOFF.md", "no false machine PASS"]),
  "12-regression": Object.freeze(["Phase 4 media hashes", "exact Q", "Phase 5B manifesto", "R1 About hash", "all supporting-route source hashes", "publication boundaries", "homepage Operating Field", "no route-content drift"]),
  "13-package": Object.freeze(["package README", "canonical file inventory", "embedded manifest", "independent audit", "all payload hashes", "all payload sizes", "CRC result", "privacy/secrets scan", "duplicate-path scan"]),
});

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

export const RESERVED_PATHS = Object.freeze(new Set([
  "MANIFEST.json",
  "00-provenance/git-provenance.json",
  "01-baseline/PHASE_6_BASELINE.md",
  "01-baseline/PHASE_6_DEFECT_LEDGER.md",
  "01-baseline/PHASE_6_R1_VALIDATION_CLOSURE.md",
  "10-poster-study/PHASE_6_POSTER_STUDY.md",
  "11-physical-device/PHASE_6_PHYSICAL_DEVICE_HANDOFF.md",
  "13-package/README.md",
  "13-package/package-metadata.json",
]));

const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const ALLOWED_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".mp4"]);
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const FORBIDDEN_PATH = /(?:^|\/)(?:raw(?:[-_ ]?frames?)?|frames?|caches?|browser-cache|traces?|heap-dumps?|profiles?|private|secrets?|credentials?|candidates?|rejected|quarantine|temp|tmp|__pycache__|node_modules|\.git)(?:\/|$)|(?:^|\/)\.(?:env|ds_store)(?:\.|$)|\.(?:zip|7z|rar|tar|tgz|gz|bz2|xz|webm|blend\d*|exr|tiff?|mov|mkv|avi|heapsnapshot|trace|pem|key|p12|pfx|log|map)$/i;
const STALE_SOURCE_NAME = /(?:^|[-_.\/])(?:smoke|draft|trial)(?:[-_.\/]|$)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PRIVATE_TEXT = /(?:(?:^|[\s"'=:(`\[])[a-z]:[\\/]|(?:^|[\s"'=:(`\[])\/(?:users|home|tmp|private|var\/folders|workspace|root)\/[^/\s]+(?:\/|\b)|(?:^|[^a-z])onedrive(?:[^a-z]|$)|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+)/i;
const SECRET_TEXT = /(?:github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|glpat-[a-z0-9_-]{16,}|sk-[a-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|xox[baprs]-[a-z0-9-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;
export const EVIDENCE_STATUS_VALUES = Object.freeze([
  "PASS",
  "FAIL",
  "LIMITATION",
  "NOT OBSERVED",
  "PENDING HUMAN REVIEW",
  "NOT APPLICABLE",
]);
const STATUS_VALUES = new Set(EVIDENCE_STATUS_VALUES);
const AUTHORITY_PROFILES = Object.freeze({
  phase6: Object.freeze({
    id: "phase6",
    branch: REQUIRED_BRANCH,
    branchUrl: REQUIRED_BRANCH_URL,
    parent: REQUIRED_PARENT,
    deploymentSchema: "quantum-hub.phase-6.deployment-verification.v1",
    deploymentParentField: "acceptedBase",
  }),
  "phase6-r1": Object.freeze({
    id: "phase6-r1",
    branch: R1_REQUIRED_BRANCH,
    branchUrl: R1_REQUIRED_BRANCH_URL,
    parent: R1_REQUIRED_PARENT,
    deploymentSchema: "quantum-hub.phase-6-r1.deployment-verification.v1",
    deploymentParentField: "exactParent",
  }),
});
const GENERATED_SECTION_FILENAMES = Object.freeze({
  "00-provenance": ["repository-authority.json", "checkpoint-chain.json", "production-source-diff.txt", "change-ledger.json", "deployment-authority-summary.json", "dist-deployment-parity.json", "final-build-test.json", "final-limitations.md", "final-handoff-seed.json", "section-summary.json"],
  "01-baseline": ["accepted-phase5b-reference-hashes.json", "initial-browser-runtime-inventory.json", "section-summary.json"],
  "02-cross-engine": ["section-summary.json"],
  "03-homepage-motion": ["section-summary.json"],
  "04-supporting-routes": ["section-summary.json"],
  "05-history-bfcache": ["section-summary.json"],
  "06-performance": ["section-summary.json"],
  "07-memory": ["section-summary.json"],
  "08-network-media": ["section-summary.json"],
  "09-accessibility": ["section-summary.json"],
  "10-poster-study": ["section-summary.json"],
  "11-physical-device": ["section-summary.json"],
  "12-regression": ["section-summary.json"],
  "13-package": ["section-summary.json", "evidence-assembly-summary.json"],
});

export const REQUIRED_ARTIFACT_ROLES = Object.freeze({
  "deployment-verifier": Object.freeze({ section: "00-provenance", kind: "document", minimum: 1 }),
  "cross-engine-summary": Object.freeze({ section: "02-cross-engine", kind: "document", minimum: 3, engines: ["chromium", "webkit", "firefox"] }),
  "cross-engine-screenshot": Object.freeze({ section: "02-cross-engine", kind: "image", minimum: 3, engines: ["chromium", "webkit", "firefox"] }),
  "cross-engine-recording": Object.freeze({ section: "02-cross-engine", kind: "video", minimum: 1 }),
  "homepage-motion-summary": Object.freeze({ section: "03-homepage-motion", kind: "document", minimum: 1 }),
  "homepage-motion-recording": Object.freeze({ section: "03-homepage-motion", kind: "video", minimum: 1 }),
  "supporting-route-summary": Object.freeze({ section: "04-supporting-routes", kind: "document", minimum: 1 }),
  "supporting-desktop-sheet": Object.freeze({ section: "04-supporting-routes", kind: "image", minimum: 1 }),
  "supporting-portrait-sheet": Object.freeze({ section: "04-supporting-routes", kind: "image", minimum: 1 }),
  "supporting-narrow-sheet": Object.freeze({ section: "04-supporting-routes", kind: "image", minimum: 1 }),
  "supporting-landscape-sheet": Object.freeze({ section: "04-supporting-routes", kind: "image", minimum: 1 }),
  "supporting-motion-recording": Object.freeze({ section: "04-supporting-routes", kind: "video", minimum: 1 }),
  "history-bfcache-summary": Object.freeze({ section: "05-history-bfcache", kind: "document", minimum: 1 }),
  "performance-summary": Object.freeze({ section: "06-performance", kind: "document", minimum: 1 }),
  "memory-summary": Object.freeze({ section: "07-memory", kind: "document", minimum: 1 }),
  "network-media-summary": Object.freeze({ section: "08-network-media", kind: "document", minimum: 1 }),
  "accessibility-summary": Object.freeze({ section: "09-accessibility", kind: "document", minimum: 3, engines: ["chromium", "webkit", "firefox"] }),
  "regression-summary": Object.freeze({ section: "12-regression", kind: "document", minimum: 1 }),
});

export const R1_REQUIRED_ARTIFACT_ROLES = Object.freeze({
  "r1-node22-validation-summary": Object.freeze({ section: "00-provenance", kind: "document", minimum: 1 }),
  "r1-motion-summary": Object.freeze({ section: "03-homepage-motion", kind: "document", minimum: 2, engines: ["chromium", "firefox"] }),
  "r1-motion-recording": Object.freeze({ section: "03-homepage-motion", kind: "video", minimum: 10, engines: ["chromium", "firefox"] }),
  "r1-persistent-lifecycle-summary": Object.freeze({ section: "05-history-bfcache", kind: "document", minimum: 1, engines: ["chromium"] }),
  "physical-device-result": Object.freeze({ section: "11-physical-device", kind: "document", minimum: 1 }),
  "physical-device-recording": Object.freeze({ section: "11-physical-device", kind: "video", minimum: 4 }),
});

const OPTIONAL_ARTIFACT_ROLES = Object.freeze({
  ...R1_REQUIRED_ARTIFACT_ROLES,
  "accessibility-interaction-limitation": Object.freeze({ section: "09-accessibility", kind: "document" }),
  "supplemental-reflow-proxy": Object.freeze({ section: "09-accessibility", kind: "document" }),
  "supplemental-maradin-lifecycle-recording": Object.freeze({ section: "08-network-media", kind: "video" }),
  "physical-device-result": Object.freeze({ section: "11-physical-device", kind: "document" }),
  "physical-device-recording": Object.freeze({ section: "11-physical-device", kind: "video" }),
});

const JSON_ROLE_SCHEMAS = Object.freeze({
  "deployment-verifier": Object.freeze(["quantum-hub.phase-6.deployment-verification.v1", "quantum-hub.phase-6-r1.deployment-verification.v1"]),
  "cross-engine-summary": Object.freeze(["quantum-hub.phase-6.global-hardening.v1"]),
  "homepage-motion-summary": Object.freeze(["quantum-hub.phase-6.global-hardening.v1"]),
  "supporting-route-summary": Object.freeze(["quantum-hub.phase-6.global-hardening.v1"]),
  "history-bfcache-summary": Object.freeze(["quantum-hub.phase-6.global-hardening.v1", "quantum-hub.phase-6.performance-lifecycle.v1"]),
  "performance-summary": Object.freeze(["quantum-hub.phase-6.performance-lifecycle.v1"]),
  "memory-summary": Object.freeze(["quantum-hub.phase-6.performance-lifecycle.v1"]),
  "network-media-summary": Object.freeze(["quantum-hub.phase-6.performance-lifecycle.v1", "quantum-hub.phase-6.global-hardening.v1"]),
  "accessibility-summary": Object.freeze(["quantum-hub.phase-6.accessibility-interactions.v1", "quantum-hub.phase-6.global-hardening.v1"]),
  "accessibility-interaction-limitation": Object.freeze(["quantum-hub.phase-6.accessibility-interactions.v1"]),
  "supplemental-reflow-proxy": Object.freeze(["quantum-hub.phase-5b.responsive-accessibility.v1"]),
  "regression-summary": Object.freeze(["quantum-hub.phase-6.repair-regressions.v1"]),
  "physical-device-result": Object.freeze([HUMAN_EVIDENCE_SCHEMA]),
  "r1-motion-summary": Object.freeze([R1_MOTION_EVIDENCE_SCHEMA]),
  "r1-persistent-lifecycle-summary": Object.freeze([R1_PERSISTENT_LIFECYCLE_SCHEMA]),
  "r1-node22-validation-summary": Object.freeze([]),
});

const GENERATED_EVIDENCE_BY_SECTION = Object.freeze({
  "00-provenance": Object.freeze(["generated-authority"]),
  "01-baseline": Object.freeze(["generated-authority", "packager-injected-report"]),
  "10-poster-study": Object.freeze(["packager-injected-report", "poster-study-summary", "poster-side-by-side", "poster-difference"]),
  "11-physical-device": Object.freeze(["packager-injected-report", "physical-device-result", "physical-device-recording"]),
  "13-package": Object.freeze(["packager-generated"]),
});

export const POSTER_FAMILIES = Object.freeze([
  Object.freeze({
    id: "desktop",
    original: "phase-4r2-desktop-poster-8dc538810811.png",
    originalSha256: "8dc5388108116da7202a6b8b24ea8fccb42ebc4cdfb50b861427488436e35979",
    width: 1920,
    height: 1200,
    lossless: "desktop-webp-lossless.webp",
    lossy: "desktop-webp-q95.webp",
  }),
  Object.freeze({
    id: "portrait",
    original: "phase-4r2-portrait-poster-e104fe5e3d0e.png",
    originalSha256: "e104fe5e3d0e471df2059919eb26eca7bb493929eca1000d8ab6ce95a611dee9",
    width: 780,
    height: 1688,
    lossless: "portrait-webp-lossless.webp",
    lossy: "portrait-webp-q95.webp",
  }),
  Object.freeze({
    id: "landscape",
    original: "phase-4r2-landscape-poster-5692f67493fa.png",
    originalSha256: "5692f67493faf34844a6e2eaa838999babbaaf6d1c7d10e51505587daeb1d679",
    width: 1688,
    height: 780,
    lossless: "landscape-webp-lossless.webp",
    lossy: "landscape-webp-q95.webp",
  }),
]);

export const TRACKED_POSTER_DIRECTORY = path.join(ROOT, "artifacts", "original", "phase-4r2-1-causal-signal-scroll-stability", "production", "posters");

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

function exactJson(observed, expected, label) {
  if (stableJson(observed) !== stableJson(expected)) throw new Error(`${label} contradicts raw evidence`);
}

export function normalizeEvidenceStatus(value) {
  const normalized = String(value ?? "").trim().toUpperCase().replaceAll("_", " ").replaceAll("-", " ").replace(/\s+/g, " ");
  if (normalized === "ERROR") return "FAIL";
  if (normalized === "UNSUPPORTED") return "LIMITATION";
  if (normalized === "OBSERVED") return "PASS";
  if (normalized === "PENDING HUMAN DEVICE REVIEW" || normalized === "PENDING") return "PENDING HUMAN REVIEW";
  return STATUS_VALUES.has(normalized) ? normalized : null;
}

function aggregateEvidenceStatuses(statuses, fallback = "NOT OBSERVED") {
  const normalized = statuses.map(normalizeEvidenceStatus).filter(Boolean);
  if (normalized.includes("FAIL")) return "FAIL";
  if (normalized.includes("LIMITATION")) return "LIMITATION";
  if (normalized.includes("PENDING HUMAN REVIEW")) return "PENDING HUMAN REVIEW";
  if (normalized.includes("PASS")) return "PASS";
  if (normalized.includes("NOT OBSERVED")) return "NOT OBSERVED";
  return fallback;
}

function aggregateCoverageStatuses(statuses, fallback = "NOT OBSERVED") {
  const normalized = statuses.map(normalizeEvidenceStatus).filter(Boolean);
  if (normalized.includes("FAIL")) return "FAIL";
  if (normalized.includes("LIMITATION")) return "LIMITATION";
  if (normalized.includes("PENDING HUMAN REVIEW")) return "PENDING HUMAN REVIEW";
  if (normalized.includes("NOT OBSERVED")) return "NOT OBSERVED";
  return normalized.length && normalized.every((status) => status === "PASS") ? "PASS" : fallback;
}

function authorityProfileById(id = "phase6") {
  const profile = AUTHORITY_PROFILES[id];
  if (!profile) throw new Error(`unknown evidence authority profile: ${id}`);
  return profile;
}

function authorityProfileForBranch(branch) {
  const profile = Object.values(AUTHORITY_PROFILES).find((candidate) => candidate.branch === branch);
  if (!profile) throw new Error(`unsupported final evidence branch authority: ${branch ?? "missing"}`);
  return profile;
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function safeRelativePath(value, label = "path") {
  if (typeof value !== "string" || !value || value !== value.normalize("NFC") || value.includes("\\") || value.includes("\0") || /[\u0000-\u001f\u007f:*?<>|"]/.test(value) || path.posix.isAbsolute(value)) {
    throw new Error(`${label} must be a normalized portable relative path`);
  }
  const normalized = path.posix.normalize(value);
  const parts = value.split("/");
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || parts.some((part) => !part || part === "." || part === ".." || /[ .]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`${label} is unsafe: ${value}`);
  }
  return value;
}

function extensionKind(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === ".mp4") return "video";
  if (TEXT_EXTENSIONS.has(extension)) return "document";
  return "unsupported";
}

export function assertAllowedSourcePath(relativePath) {
  safeRelativePath(relativePath, "source evidence path");
  if (FORBIDDEN_PATH.test(relativePath)) throw new Error(`forbidden raw/cache/archive/private source evidence: ${relativePath}`);
  if (!ALLOWED_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())) throw new Error(`unsupported source evidence type: ${relativePath}`);
  return true;
}

export function assertAllowedDestination(relativePath) {
  safeRelativePath(relativePath, "evidence destination");
  if (RESERVED_PATHS.has(relativePath)) throw new Error(`reserved package-generated/report path must remain absent: ${relativePath}`);
  if (FORBIDDEN_PATH.test(relativePath)) throw new Error(`forbidden raw/cache/archive/private evidence destination: ${relativePath}`);
  const section = relativePath.split("/", 1)[0];
  if (!TOPOLOGY_SECTIONS.includes(section)) throw new Error(`evidence destination is outside 00-provenance through 13-package: ${relativePath}`);
  if (!ALLOWED_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())) throw new Error(`unsupported evidence destination type: ${relativePath}`);
  return true;
}

function assertNoSecrets(text, label) {
  if (SECRET_TEXT.test(text)) throw new Error(`secret-like content rejected: ${label}`);
}

function redactString(value, label) {
  assertNoSecrets(value, label);
  let output = value
    .replace(/file:\/\/[^|"'`<>\r\n]*/gi, "<PRIVATE_PATH>")
    .replace(/(^|[\s"'=:(`\[])([a-z]:[\\/][^|"'`<>\r\n]*)/gi, (_match, prefix, privatePath) => `${prefix}<PRIVATE_PATH>/${path.win32.basename(privatePath.trim()) || "redacted"}`)
    .replace(/\\\\[^\\\s|"'`<>]+[\\][^|"'`<>\r\n]*/g, "<PRIVATE_PATH>/redacted")
    .replace(/(^|[\s"'=:(`\[])(\/(?:users|home|tmp|private|workspace|root)\/[^|"'`<>\r\n]*)/gi, (_match, prefix, privatePath) => `${prefix}<PRIVATE_PATH>/${path.posix.basename(privatePath.trim()) || "redacted"}`)
    .replace(/(^|[\s"'=:(`\[])(\/var\/folders\/[^|"'`<>\r\n]*)/gi, (_match, prefix) => `${prefix}<PRIVATE_PATH>/redacted`)
    .replace(/onedrive/gi, "<PRIVATE_STORAGE>")
    .replace(/appdata|localcache/gi, "<PRIVATE_STORAGE>")
    .replace(/(?:^|[\\/])\.codex(?:[\\/]|$)/gi, "/<PRIVATE_TOOL_STATE>/");
  if (PRIVATE_TEXT.test(output)) throw new Error(`private path could not be safely sanitized: ${label}`);
  return output;
}

export function sanitizeText(input, label = "text evidence") {
  const normalized = String(input).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (normalized.includes("\u0000")) throw new Error(`NUL byte rejected: ${label}`);
  return normalized.split("\n").map((line, index) => redactString(line, `${label}:${index + 1}`)).join("\n");
}

export function sanitizeJsonValue(value, label = "JSON evidence") {
  if (typeof value === "string") return redactString(value, label);
  if (Array.isArray(value)) return value.map((item, index) => sanitizeJsonValue(item, `${label}[${index}]`));
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      assertNoSecrets(key, `${label} key`);
      if (PRIVATE_TEXT.test(key)) throw new Error(`private path in JSON key rejected: ${label}`);
      output[key] = sanitizeJsonValue(child, `${label}.${key}`);
    }
    return output;
  }
  return value;
}

export function assertPrivacySafe(bytes, relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  const data = Buffer.from(bytes);
  const text = TEXT_EXTENSIONS.has(extension)
    ? data.toString("utf8")
    : (data.toString("latin1").match(/[\x20-\x7e]{24,}/g) ?? []).join("\n");
  assertNoSecrets(text, relativePath);
  if (PRIVATE_TEXT.test(text)) throw new Error(`private path remains in assembled evidence: ${relativePath}`);
  return true;
}

function normalizeHttps(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} must be an absolute HTTPS URL`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.hostname.endsWith(".qsite1.pages.dev")) throw new Error(`${label} must be a credential-free qsite1 Pages URL without query or fragment`);
  return url.href;
}

function validateIsoTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`${label} must be a canonical ISO timestamp`);
}

function validatePathList(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const paths = values.map((record) => typeof record === "string" ? record : record?.path);
  for (const relativePath of paths) safeRelativePath(relativePath, label);
  if (new Set(paths.map((item) => item.toLowerCase())).size !== paths.length) throw new Error(`${label} contains duplicate paths`);
  return values;
}

function pathValues(values) {
  return values.map((record) => typeof record === "string" ? record : record.path);
}

function r1DiffPaths(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  return values.map((record) => {
    if (typeof record === "string") {
      const match = /^([AM])\t(.+)$/.exec(record);
      if (!match) throw new Error(`${label} record is malformed`);
      safeRelativePath(match[2], label);
      return match[2];
    }
    if (!record || !["A", "M"].includes(record.status)) throw new Error(`${label} record is malformed`);
    return safeRelativePath(record.path, label);
  });
}

function validateSectionMetadata(sections, artifacts, posterStudyDirectory) {
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) throw new Error("final metadata sections are required");
  const roleSet = new Set([
    ...artifacts.map(({ role }) => role),
    ...Object.values(GENERATED_EVIDENCE_BY_SECTION).flat(),
  ]);
  for (const section of TOPOLOGY_SECTIONS.slice(0, -1)) {
    const record = sections[section];
    if (!record || !STATUS_VALUES.has(record.status) || typeof record.summary !== "string" || !record.summary.trim() || !Array.isArray(record.limitations)) throw new Error(`final metadata section is incomplete: ${section}`);
    if (record.status === "LIMITATION" && !record.limitations.length) throw new Error(`LIMITATION section must explain its limitation: ${section}`);
    if (record.requirements !== undefined) {
      if (!record.requirements || typeof record.requirements !== "object" || Array.isArray(record.requirements)) throw new Error(`section requirement overrides must be an object: ${section}`);
      for (const [requirement, override] of Object.entries(record.requirements)) {
        if (!BRIEF_REQUIREMENTS[section].includes(requirement) || !override || !STATUS_VALUES.has(override.status) || typeof override.statement !== "string" || !override.statement.trim()) throw new Error(`invalid requirement override in ${section}: ${requirement}`);
        if (override.evidenceRoles !== undefined && (!Array.isArray(override.evidenceRoles) || !override.evidenceRoles.length || override.evidenceRoles.some((role) => typeof role !== "string" || !roleSet.has(role)))) throw new Error(`invalid requirement evidenceRoles in ${section}: ${requirement}`);
      }
    }
    if (record.evidenceRoles !== undefined) {
      if (!Array.isArray(record.evidenceRoles) || record.evidenceRoles.some((role) => typeof role !== "string" || !roleSet.has(role))) throw new Error(`section evidenceRoles differ: ${section}`);
    }
  }
  if (!posterStudyDirectory || sections["10-poster-study"].status !== "PASS") throw new Error("final assembly requires a PASS poster study and --poster-study-directory");
  const physical = sections["11-physical-device"];
  if (physical.status === "PASS" && !roleSet.has("physical-device-result")) throw new Error("physical-device PASS requires genuine physical-device-result evidence");
  if (!["PASS", "FAIL", "LIMITATION", "PENDING HUMAN REVIEW"].includes(physical.status)) throw new Error("physical-device status must be genuine PASS/FAIL or an explicit pending/limitation status");
}

function validateMediaContract(contract, label) {
  if (!contract || typeof contract !== "object"
    || contract.codec !== "h264"
    || contract.pixelFormat !== "yuv420p"
    || contract.fps !== 30
    || contract.audioStreams !== 0
    || contract.constantFrameRate !== true
    || contract.fullDecodeValidated !== true
    || typeof contract.durationSeconds !== "number"
    || !Number.isFinite(contract.durationSeconds)
    || contract.durationSeconds <= 0
    || contract.durationSeconds > 45
    || !contract.validationReport
    || typeof contract.validationReport !== "object"
    || !HASH64.test(contract.validationReport.expectedSha256 ?? "")) {
    throw new Error(`video media contract differs: ${label}`);
  }
  assertAllowedSourcePath(contract.validationReport.source);
  safeRelativePath(contract.validationReport.recordingRelativePath, `${label} recordingRelativePath`);
  return contract;
}

function roleSpec(role) {
  if (REQUIRED_ARTIFACT_ROLES[role]) return REQUIRED_ARTIFACT_ROLES[role];
  if (OPTIONAL_ARTIFACT_ROLES[role]) return OPTIONAL_ARTIFACT_ROLES[role];
  if (/^supplemental-[a-z0-9-]+$/.test(role)) return null;
  throw new Error(`unknown evidence artifact role: ${role}`);
}

function isR1Node22ValidationSchema(schema) {
  const match = new RegExp(`^${R1_NODE22_VALIDATION_SCHEMA_PREFIX.replaceAll(".", "\\.")}(\\d+)$`).exec(String(schema ?? ""));
  return Boolean(match && Number(match[1]) >= 7);
}

function requireArtifactRoleInventory(artifacts, contracts) {
  for (const [role, spec] of Object.entries(contracts)) {
    const matching = artifacts.filter((record) => record.role === role);
    if (matching.length < spec.minimum) throw new Error(`mandatory evidence role is missing: ${role}`);
    if (spec.engines) {
      const engines = new Set(matching.map(({ engine }) => engine));
      for (const engine of spec.engines) if (!engines.has(engine)) throw new Error(`${role} omits ${engine}`);
    }
  }
}

function validateR1ArtifactTopology(artifacts) {
  const engines = ["chromium", "firefox"];
  const summaries = artifacts.filter(({ role }) => role === "r1-motion-summary");
  const recordings = artifacts.filter(({ role }) => role === "r1-motion-recording");
  const lifecycle = artifacts.filter(({ role }) => role === "r1-persistent-lifecycle-summary");
  const humanLedgers = artifacts.filter(({ role }) => role === "physical-device-result");
  const humanRecordings = artifacts.filter(({ role }) => role === "physical-device-recording");
  const node22 = artifacts.filter(({ role }) => role === "r1-node22-validation-summary");
  if (summaries.length !== 2 || recordings.length !== 10 || lifecycle.length !== 1 || humanLedgers.length !== 1 || humanRecordings.length !== 4 || node22.length !== 1) {
    throw new Error("R1 motion/lifecycle/human artifact topology differs");
  }
  if (node22[0].destination !== "00-provenance/node22-integrated-validation.json" || node22[0].status !== "PASS" || node22[0].select !== undefined) throw new Error("R1 Node 22 validation artifact authority differs");
  for (const engine of engines) {
    const engineSummaries = summaries.filter((record) => record.engine === engine);
    const engineRecordings = recordings.filter((record) => record.engine === engine);
    if (engineSummaries.length !== 1 || path.posix.basename(engineSummaries[0].source) !== "motion-evidence-report.json" || engineSummaries[0].status !== "PASS" || engineSummaries[0].select !== undefined) {
      throw new Error(`R1 motion summary authority differs: ${engine}`);
    }
    const filenames = engineRecordings.map(({ source }) => path.posix.basename(source)).sort(lexicalCompare);
    const expected = R1_MOTION_RECORDING_SPECS.map(({ filename }) => filename).sort(lexicalCompare);
    if (engineRecordings.length !== 5 || stableJson(filenames) !== stableJson(expected)
      || engineRecordings.some((record) => record.status !== "PASS" || !record.mediaContract)) {
      throw new Error(`R1 motion recording inventory differs: ${engine}`);
    }
  }
  const lifecycleRecord = lifecycle[0];
  const requiredSelection = ["/bfcache", "/browser", "/history", "/listeners", "/mediaRequests", "/profileCleanup", "/status", "/visibility"];
  if (lifecycleRecord.engine !== "chromium"
    || lifecycleRecord.destination !== "05-history-bfcache/r1-persistent-lifecycle.json"
    || !["PASS", "FAIL", "LIMITATION"].includes(lifecycleRecord.status)
    || (lifecycleRecord.select !== undefined && requiredSelection.some((pointer) => !lifecycleRecord.select.includes(pointer)))) {
    throw new Error("R1 persistent-lifecycle artifact authority differs");
  }
  if (humanLedgers[0].destination !== "11-physical-device/human-evidence-ledger.json" || humanLedgers[0].select !== undefined) {
    throw new Error("R1 human-evidence ledger authority differs");
  }
  const humanFilenames = humanRecordings.map(({ source }) => path.posix.basename(source)).sort(lexicalCompare);
  if (stableJson(humanFilenames) !== stableJson([...REQUIRED_HUMAN_EVIDENCE_FILES].sort(lexicalCompare))
    || humanRecordings.some((record) => record.destination !== `11-physical-device/recordings/${path.posix.basename(record.source)}` || record.mediaContract !== undefined)) {
    throw new Error("R1 human recording inventory differs");
  }
}

function validateArtifactRecords(artifacts, authority) {
  if (!Array.isArray(artifacts)) throw new Error("final metadata artifacts must be an array");
  const destinations = new Set();
  const selectionKeys = new Set();
  for (const [index, record] of artifacts.entries()) {
    if (!record || typeof record !== "object") throw new Error(`artifact record ${index} is invalid`);
    assertAllowedSourcePath(record.source);
    assertAllowedDestination(record.destination);
    if (STALE_SOURCE_NAME.test(record.source) || record.final !== true || !HASH64.test(record.expectedSha256 ?? "")) throw new Error(`artifact must bind a non-smoke final source and exact SHA-256: ${record.source}`);
    if (!STATUS_VALUES.has(record.status)) throw new Error(`artifact status differs: ${record.destination}`);
    if (record.status === "LIMITATION" && (typeof record.limitation !== "string" || !record.limitation.trim())) throw new Error(`LIMITATION artifact must explain its limitation: ${record.destination}`);
    if (typeof record.role !== "string") throw new Error(`artifact record ${index} omits role`);
    const spec = roleSpec(record.role);
    if (authority.id === "phase6-r1" && spec === null) throw new Error(`R1 unknown supplemental evidence role is forbidden: ${record.role}`);
    const section = record.destination.split("/", 1)[0];
    const kind = extensionKind(record.destination);
    if (spec && (spec.section !== section || spec.kind !== kind)) throw new Error(`artifact role/destination differs: ${record.role}`);
    if (record.role === "deployment-verifier" && record.destination !== "00-provenance/deployment-verification.json") throw new Error("deployment-verifier must occupy 00-provenance/deployment-verification.json");
    if (record.role === "accessibility-interaction-limitation" && (!["FAIL", "LIMITATION"].includes(record.status) || record.engine !== "webkit")) throw new Error("WebKit interaction FAIL/LIMITATION must be explicit");
    if (record.role === "physical-device-result" && record.select !== undefined) throw new Error("physical-device human-evidence ledger must be included whole");
    if (authority.id === "phase6-r1" && record.role === "supplemental-reflow-proxy" && record.destination !== "09-accessibility/720x450-reflow-proxy.json") throw new Error("R1 supplemental reflow-proxy path differs");
    if (authority.id === "phase6-r1" && record.role === "supplemental-maradin-lifecycle-recording" && record.destination !== "08-network-media/maradin-media-lifecycle.mp4") throw new Error("R1 supplemental Maradin lifecycle path differs");
    if (["deployment-verifier", "cross-engine-summary", "accessibility-summary", "performance-summary"].includes(record.role) && record.status !== "PASS") throw new Error(`required PASS authority differs: ${record.role}`);
    if (record.role === "performance-summary" && path.posix.basename(record.source) !== "phase6-performance-final.json") throw new Error("performance-summary must bind phase6-performance-final.json");
    if (record.engine !== undefined && !["chromium", "webkit", "firefox"].includes(record.engine)) throw new Error(`artifact engine differs: ${record.engine}`);
    if (kind === "video" && record.role === "physical-device-recording") {
      if (record.mediaContract !== undefined) throw new Error(`physical-device recording must retain its human-evidence authority without a machine capture contract: ${record.destination}`);
    } else if (kind === "video") validateMediaContract(record.mediaContract, record.destination);
    else if (record.mediaContract !== undefined) throw new Error(`mediaContract is only valid for MP4 evidence: ${record.destination}`);
    if (record.select !== undefined && (!Array.isArray(record.select) || !record.select.length || record.select.some((pointer) => typeof pointer !== "string" || !pointer.startsWith("/")))) throw new Error(`artifact JSON selection differs: ${record.destination}`);
    const folded = record.destination.toLowerCase();
    if (destinations.has(folded)) throw new Error(`duplicate evidence destination: ${record.destination}`);
    destinations.add(folded);
    const selectionKey = `${record.source}\0${stableJson(record.select ?? null)}`;
    if (selectionKeys.has(selectionKey)) throw new Error(`the same source projection is selected more than once: ${record.source}`);
    selectionKeys.add(selectionKey);
  }
  requireArtifactRoleInventory(artifacts, REQUIRED_ARTIFACT_ROLES);
  if (authority.id === "phase6-r1") {
    requireArtifactRoleInventory(artifacts, R1_REQUIRED_ARTIFACT_ROLES);
    validateR1ArtifactTopology(artifacts);
  }
  return artifacts;
}

export function validateFinalMetadata(input, { posterStudyDirectory = null } = {}) {
  const metadata = sanitizeJsonValue(input, "final metadata");
  for (const section of Object.values(metadata.sections ?? {})) {
    if (section?.status === "PENDING HUMAN DEVICE REVIEW") section.status = "PENDING HUMAN REVIEW";
    for (const override of Object.values(section?.requirements ?? {})) {
      if (override?.status === "PENDING HUMAN DEVICE REVIEW") override.status = "PENDING HUMAN REVIEW";
    }
  }
  if (metadata.schema !== FINAL_METADATA_SCHEMA || metadata.status !== "READY") throw new Error("final metadata schema/status differs");
  validateIsoTimestamp(metadata.generatedAt, "final metadata generatedAt");
  const repository = metadata.repository;
  const authority = authorityProfileForBranch(repository?.branch);
  if (metadata.authorityProfile !== undefined && metadata.authorityProfile !== authority.id) throw new Error("final metadata authority profile differs from its branch");
  if (!repository || repository.exactParent !== authority.parent || !HASH40.test(repository.finalHead ?? "") || !HASH40.test(repository.directParent ?? "") || repository.cleanTree !== true) throw new Error("final repository authority differs");
  if (authority.id === "phase6-r1" && !HASH40.test(repository.finalTree ?? "")) throw new Error("R1 final repository tree authority differs");
  if (repository.localHead !== repository.finalHead || repository.upstreamHead !== repository.finalHead || repository.liveHead !== repository.finalHead) throw new Error("local/upstream/live HEAD parity differs");
  if (!repository.main || repository.main.local !== FROZEN_MAIN || repository.main.upstream !== FROZEN_MAIN || repository.main.public !== FROZEN_MAIN || repository.main.modifiedOrMerged !== false) throw new Error("frozen main authority differs");
  if (!Array.isArray(repository.commitChain) || !repository.commitChain.length) throw new Error("linear commit chain is required");
  let expectedParent = authority.parent;
  const commitShas = new Set();
  for (const record of repository.commitChain) {
    if (!HASH40.test(record?.sha ?? "") || commitShas.has(record.sha) || !Array.isArray(record.parents) || record.parents.length !== 1 || record.parents[0] !== expectedParent || typeof record.subject !== "string" || !record.subject.trim()) throw new Error(`linear commit chain differs at ${record?.sha ?? "unknown"}`);
    commitShas.add(record.sha);
    expectedParent = record.sha;
  }
  if (repository.commitChain.at(-1).sha !== repository.finalHead || repository.directParent !== repository.commitChain.at(-1).parents[0]) throw new Error("final HEAD/direct-parent binding differs from commit chain");
  const deployment = metadata.deployment;
  if (!deployment || !UUID.test(deployment.id ?? "") || deployment.deployedSha !== repository.finalHead || deployment.parity !== "PASS" || deployment.headers !== "PASS" || deployment.real404 !== "PASS" || deployment.canonical !== "PASS" || deployment.productionMainDeployed !== false) throw new Error("final deployment authority differs");
  if (authority.id === "phase6-r1" && !/^[1-9]\d*$/.test(deployment.checkRunId ?? "")) throw new Error("R1 deployment checkRunId authority differs");
  deployment.immutableUrl = normalizeHttps(deployment.immutableUrl, "immutable URL");
  deployment.branchUrl = normalizeHttps(deployment.branchUrl, "branch URL");
  const immutable = new URL(deployment.immutableUrl);
  const branch = new URL(deployment.branchUrl);
  if (immutable.pathname !== "/" || branch.pathname !== "/" || immutable.hostname !== `${deployment.id.slice(0, 8)}.qsite1.pages.dev` || deployment.branchUrl !== authority.branchUrl || deployment.immutableUrl === deployment.branchUrl) throw new Error("deployment URL/UUID binding differs");
  const evidenceContext = metadata.evidenceContext;
  if (!evidenceContext
    || evidenceContext.browserQa?.origin !== "LOCAL"
    || evidenceContext.browserQa?.baseUrl !== "http://127.0.0.1:4338/"
    || evidenceContext.deploymentBinding?.method !== "DEPLOYMENT_VERIFIER_LOCAL_DIST_ORIGIN_BYTE_PARITY"
    || evidenceContext.deploymentBinding?.status !== "PASS"
    || evidenceContext.deploymentBinding?.verifierArtifactRole !== "deployment-verifier") throw new Error("local browser/deployed byte-parity evidence context differs");
  const changes = metadata.changes;
  if (!changes || !Number.isSafeInteger(changes.trackedFileDelta) || !Number.isSafeInteger(changes.trackedByteDelta)) throw new Error("tracked change deltas are required");
  validatePathList(changes.productionFiles, "production-source files");
  validatePathList(changes.toolingReportFiles, "tooling/report files");
  validatePathList(changes.newTrackedFilesAbove1MiB ?? [], "new tracked files above 1 MiB");
  if (authority.id === "phase6-r1") {
    if (stableJson(pathValues(changes.productionFiles)) !== stableJson([])) throw new Error("R1 production-source change ledger must be empty");
    if (stableJson([...pathValues(changes.toolingReportFiles)].sort(lexicalCompare)) !== stableJson([...R1_TOOLING_REPORT_FILES].sort(lexicalCompare))) throw new Error("R1 tooling/report change ledger differs from the exact 18-path authority");
    if (changes.trackedFileDelta !== R1_TOOLING_REPORT_FILES.length) throw new Error("R1 trackedFileDelta must equal the exact 18-path tooling/report authority");
  }
  for (const record of changes.newTrackedFilesAbove1MiB ?? []) if (!Number.isSafeInteger(record.bytes) || record.bytes <= 1024 * 1024 || typeof record.justification !== "string" || !record.justification.trim()) throw new Error(`large tracked file justification differs: ${record.path}`);
  const verification = metadata.verification;
  if (!verification || verification.build?.status !== "PASS" || verification.tests?.status !== "PASS" || !Number.isSafeInteger(verification.tests.total) || verification.tests.total <= 0 || !Number.isSafeInteger(verification.tests.passed) || !Number.isSafeInteger(verification.tests.skipped) || verification.tests.failed !== 0 || verification.tests.total !== verification.tests.passed + verification.tests.failed + verification.tests.skipped || verification.publication?.status !== "PASS" || verification.routeBudgets?.status !== "PASS") throw new Error("final build/test/publication/budget verification is incomplete");
  if (!metadata.baseline?.acceptedPhase5bReferenceHashes || !Object.keys(metadata.baseline.acceptedPhase5bReferenceHashes).length || !metadata.baseline?.initialBrowserRuntimeInventory || !Object.keys(metadata.baseline.initialBrowserRuntimeInventory).length) throw new Error("baseline reference/runtime inventory is incomplete");
  if (!Array.isArray(metadata.limitations) || !metadata.limitations.length || metadata.limitations.some((value) => typeof value !== "string" || !value.trim())) throw new Error("genuine unresolved limitations are required");
  if (stableJson(metadata.humanReviewGates) !== stableJson(HUMAN_REVIEW_GATES) || stableJson(metadata.authorization) !== stableJson(AUTHORIZATION)) throw new Error("human-review gate or authorization policy differs");
  validateArtifactRecords(metadata.artifacts, authority);
  validateSectionMetadata(metadata.sections, metadata.artifacts, posterStudyDirectory);
  assertPrivacySafe(Buffer.from(stableJson(metadata)), "final-metadata.json");
  return metadata;
}

function getJsonPointer(document, pointer, label) {
  if (pointer === "") return document;
  const parts = pointer.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  let value = document;
  for (const part of parts) {
    if (value === null || value === undefined || typeof value !== "object" || !Object.hasOwn(value, part)) throw new Error(`JSON selection is missing ${pointer}: ${label}`);
    value = value[part];
  }
  return value;
}

function jsonEntry(relativePath, value, source = "generated", role = "generated") {
  const data = Buffer.from(stableJson(value));
  assertAllowedDestination(relativePath);
  assertPrivacySafe(data, relativePath);
  return { path: relativePath, data, source, role };
}

function textEntry(relativePath, value, source = "generated", role = "generated") {
  const data = Buffer.from(sanitizeText(value, relativePath));
  assertAllowedDestination(relativePath);
  assertPrivacySafe(data, relativePath);
  return { path: relativePath, data, source, role };
}

async function checkedDirectory(candidate, label) {
  const unresolved = path.resolve(candidate);
  const unresolvedInfo = await lstat(unresolved);
  if (!unresolvedInfo.isDirectory() || unresolvedInfo.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  const resolved = await realpath(unresolved);
  const info = await lstat(resolved);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  return resolved;
}

async function inventorySourceEvidence(sourceEvidenceRoot) {
  const root = await checkedDirectory(sourceEvidenceRoot, "source evidence root");
  const eligible = [];
  const rejected = [];
  async function visit(directory, prefix = "") {
    const records = await readdir(directory, { withFileTypes: true });
    records.sort((left, right) => lexicalCompare(left.name, right.name));
    for (const record of records) {
      const relativePath = prefix ? `${prefix}/${record.name}` : record.name;
      safeRelativePath(relativePath, "source inventory path");
      if (record.isSymbolicLink()) throw new Error(`source inventory contains a symbolic link: ${relativePath}`);
      if (record.isDirectory()) {
        if (FORBIDDEN_PATH.test(`${relativePath}/`)) { rejected.push({ path: relativePath, reason: "forbidden-directory" }); continue; }
        await visit(path.join(directory, record.name), relativePath);
        continue;
      }
      if (!record.isFile()) throw new Error(`source inventory contains a non-regular entry: ${relativePath}`);
      if (FORBIDDEN_PATH.test(relativePath) || STALE_SOURCE_NAME.test(relativePath) || !ALLOWED_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())) {
        rejected.push({ path: relativePath, reason: "not-eligible-final-evidence" });
        continue;
      }
      const { bytes } = await checkedSourceFile(root, relativePath);
      const item = { path: relativePath, byteSize: bytes.length, sha256: sha256(bytes), kind: extensionKind(relativePath) };
      if (path.posix.extname(relativePath).toLowerCase() === ".json") {
        try {
          const document = JSON.parse(bytes.toString("utf8"));
          item.schema = typeof document?.schema === "string" ? document.schema : null;
          item.status = typeof document?.status === "string" ? document.status : null;
          item.compatibleRoles = Object.entries(JSON_ROLE_SCHEMAS).filter(([role, schemas]) => schemas.includes(item.schema) || (role === "r1-node22-validation-summary" && isR1Node22ValidationSchema(item.schema))).map(([role]) => role);
        } catch {
          item.invalidJson = true;
        }
      }
      eligible.push(item);
    }
  }
  await visit(root);
  return { eligible, rejected };
}

export async function createMetadataTemplate(sourceEvidenceRoot, generatedAt = new Date().toISOString(), authorityProfile = "phase6") {
  validateIsoTimestamp(generatedAt, "template generatedAt");
  const authority = authorityProfileById(authorityProfile);
  const requiredRoleContract = authority.id === "phase6-r1"
    ? { ...REQUIRED_ARTIFACT_ROLES, ...R1_REQUIRED_ARTIFACT_ROLES }
    : REQUIRED_ARTIFACT_ROLES;
  const inventory = await inventorySourceEvidence(sourceEvidenceRoot);
  return {
    schema: `${FINAL_METADATA_SCHEMA}.template`,
    status: "TEMPLATE — REPLACE WITH READY AFTER ALL PLACEHOLDERS ARE RESOLVED",
    generatedAt,
    instructions: [
      `Set schema to ${FINAL_METADATA_SCHEMA} and status to READY only after every placeholder is resolved.`,
      "Choose only final evidence from sourceInventory. Copy its exact sha256 into expectedSha256; the assembler independently re-hashes every selected file.",
      "Create at least one artifact for every required role. Machine-captured MP4 selections require the exact mediaContract shown in artifactRecordTemplate; physical-device-recording artifacts must omit that machine contract and bind to the human ledger instead.",
      "Section requirement rows are generated from the brief and source observations; guarded requirements cannot be explicitly promoted to PASS when their evidence is failed, limited, not observed, proxy-only or pending human review.",
    ],
    authorityProfile: authority.id,
    authorityConstants: { requiredBranch: authority.branch, requiredBranchUrl: authority.branchUrl, requiredParent: authority.parent, deploymentSchema: authority.deploymentSchema, frozenMain: FROZEN_MAIN, posterDecision: POSTER_DECISION },
    sourceInventory: inventory.eligible,
    rejectedSourceInventory: inventory.rejected,
    artifactRoleContract: Object.fromEntries(Object.entries(requiredRoleContract).map(([role, spec]) => [role, spec])),
    optionalArtifactRoleContract: Object.fromEntries(Object.entries(OPTIONAL_ARTIFACT_ROLES).map(([role, spec]) => [role, spec])),
    artifactRecordTemplate: {
      source: "<portable path from sourceInventory>",
      destination: "<00-provenance through 12-regression portable package path>",
      role: "<required role>",
      final: true,
      expectedSha256: "<sha256 from sourceInventory>",
      status: "PASS",
      select: ["<optional JSON Pointer for compact distillation>"],
      mediaContract: {
        codec: "h264", pixelFormat: "yuv420p", fps: 30, audioStreams: 0, constantFrameRate: true, fullDecodeValidated: true, durationSeconds: "<positive number <= 45>",
        validationReport: { source: "<capture-*/capture-report.json>", expectedSha256: "<capture report SHA-256 from sourceInventory>", recordingRelativePath: "<recordings/*.mp4 path within capture directory>" },
      },
    },
    repository: { branch: authority.branch, exactParent: authority.parent, finalHead: "<40-char final SHA>", ...(authority.id === "phase6-r1" ? { finalTree: "<40-char final tree SHA>" } : {}), directParent: "<40-char direct parent>", cleanTree: true, localHead: "<final SHA>", upstreamHead: "<final SHA>", liveHead: "<final SHA>", main: { local: FROZEN_MAIN, upstream: FROZEN_MAIN, public: FROZEN_MAIN, modifiedOrMerged: false }, commitChain: [] },
    deployment: { id: "<lowercase Cloudflare deployment UUID>", ...(authority.id === "phase6-r1" ? { checkRunId: "<signed GitHub Cloudflare check-run numeric ID>" } : {}), immutableUrl: "<https://first-8-uuid.qsite1.pages.dev/>", branchUrl: authority.branchUrl, deployedSha: "<final SHA>", parity: "PASS", headers: "PASS", real404: "PASS", canonical: "PASS", productionMainDeployed: false },
    evidenceContext: { browserQa: { origin: "LOCAL", baseUrl: "http://127.0.0.1:4338/" }, deploymentBinding: { method: "DEPLOYMENT_VERIFIER_LOCAL_DIST_ORIGIN_BYTE_PARITY", status: "PASS", verifierArtifactRole: "deployment-verifier" } },
    changes: authority.id === "phase6-r1"
      ? { productionFiles: [], toolingReportFiles: [...R1_TOOLING_REPORT_FILES], trackedFileDelta: R1_TOOLING_REPORT_FILES.length, trackedByteDelta: "<exact signed tracked byte delta>", newTrackedFilesAbove1MiB: [] }
      : { productionFiles: [], toolingReportFiles: [], trackedFileDelta: 0, trackedByteDelta: 0, newTrackedFilesAbove1MiB: [] },
    verification: { build: { status: "PASS" }, tests: { status: "PASS", total: 0, passed: 0, failed: 0, skipped: 0 }, publication: { status: "PASS" }, routeBudgets: { status: "PASS" } },
    baseline: { acceptedPhase5bReferenceHashes: {}, initialBrowserRuntimeInventory: {} },
    limitations: ["<at least one genuine unresolved limitation>"],
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
    sections: Object.fromEntries(TOPOLOGY_SECTIONS.slice(0, -1).map((section) => [section, {
      status: section === "11-physical-device" ? "PENDING HUMAN REVIEW" : "PASS",
      summary: "<evidence-backed summary>",
      limitations: section === "11-physical-device" ? ["Physical-device review remains pending."] : [],
    }])),
    artifacts: [],
  };
}

async function checkedSourceFile(root, relativePath) {
  assertAllowedSourcePath(relativePath);
  const absolute = path.join(root, ...relativePath.split("/"));
  if (!isWithin(root, absolute)) throw new Error(`source evidence escaped its root: ${relativePath}`);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`source evidence must be a regular file: ${relativePath}`);
  const resolved = await realpath(absolute);
  if (!isWithin(root, resolved)) throw new Error(`source evidence resolves outside its root: ${relativePath}`);
  const resolvedInfo = await lstat(resolved);
  if (!resolvedInfo.isFile() || resolvedInfo.isSymbolicLink()) throw new Error(`source evidence must resolve to a regular file: ${relativePath}`);
  return { absolute: resolved, bytes: await readFile(resolved) };
}

async function validateImage(bytes, label) {
  const image = sharp(bytes, { failOn: "error", limitInputPixels: 250_000_000, sequentialRead: true });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || (metadata.pages && metadata.pages !== 1) || !["png", "jpeg", "webp", "heif", "avif"].includes(metadata.format) || metadata.exif || metadata.xmp || metadata.iptc || metadata.photoshop) throw new Error(`image decode/privacy contract failed: ${label}`);
  await image.clone().raw().toBuffer();
  return { format: metadata.format, width: metadata.width, height: metadata.height };
}

function validateMp4(bytes, label) {
  const structure = validateMp4Structure(bytes, label);
  return {
    container: "ISO-BMFF MP4",
    durationSeconds: Number((structure.movie.duration / structure.movie.timescale).toFixed(6)),
    sampleCount: structure.videoTrack.sampleCount,
    videoTrackCount: structure.videoTracks.length,
  };
}

async function validateCaptureBoundMedia(sourceRoot, record, bytes) {
  const contract = validateMediaContract(record.mediaContract, record.destination);
  const binding = contract.validationReport;
  const expectedVideoSource = path.posix.join(path.posix.dirname(binding.source), binding.recordingRelativePath);
  if (expectedVideoSource !== record.source) throw new Error(`video source is not bound to its capture report: ${record.source}`);
  const { bytes: reportBytes } = await checkedSourceFile(sourceRoot, binding.source);
  if (sha256(reportBytes) !== binding.expectedSha256) throw new Error(`capture-report SHA-256 differs: ${binding.source}`);
  let report;
  try { report = JSON.parse(reportBytes.toString("utf8")); } catch { throw new Error(`invalid capture report JSON: ${binding.source}`); }
  if (report?.schema !== "quantum-hub.phase-6.review-evidence-capture.v1" || !["PASS", "CAPTURED"].includes(String(report?.status ?? "").toUpperCase())) throw new Error(`capture-report schema/status differs: ${binding.source}`);
  const file = report.files?.find((item) => item?.relativePath === binding.recordingRelativePath);
  const recording = report.recordings?.find((item) => item?.relativePath === binding.recordingRelativePath);
  const validation = recording?.validation;
  const checks = validation?.checks;
  const encoder = report.encoder;
  if (!file || file.bytes !== bytes.length || file.sha256 !== sha256(bytes)
    || validation?.status !== "PASS"
    || !checks || Object.values(checks).some((value) => value !== true)
    || encoder?.fullDecodeValidated !== true
    || encoder?.contract?.codec !== contract.codec
    || encoder?.contract?.pixelFormat !== contract.pixelFormat
    || encoder?.contract?.fps !== contract.fps
    || encoder?.contract?.audioStreams !== contract.audioStreams
    || validation.media?.codec !== contract.codec
    || validation.media?.pixelFormat !== contract.pixelFormat
    || validation.media?.audioStreams !== contract.audioStreams
    || validation.media?.fps !== "30/1"
    || Math.abs(validation.duration - contract.durationSeconds) > 0.001) {
    throw new Error(`video/capture-report contract differs: ${record.source}`);
  }
  return { ...contract, container: "mp4", validationReportSha256: sha256(reportBytes) };
}

const R1_MOTION_VALIDATION_CHECKS = Object.freeze([
  "mp4Container",
  "oneVideoStream",
  "zeroAudioStreams",
  "h264",
  "yuv420p",
  "dimensions",
  "constant30Fps",
  "conciseDuration",
]);

const R1_MOTION_SAMPLE_LABELS = Object.freeze({
  "forward-physical-to-manifesto": Object.freeze(["F1", "current", "arrival", "indicator", "line", "raster", "Q", "threshold", "manifesto-threshold", "manifesto-resolved"]),
  "reverse-manifesto-to-f1": Object.freeze(["manifesto", "threshold", "Q", "raster", "line", "arrival", "current", "F1", "F1-rest"]),
  "resize-orientation-mid-current-and-manifesto": Object.freeze(["current-landscape-before", "current-portrait", "current-landscape-return", "manifesto-landscape-before", "manifesto-portrait", "manifesto-landscape-return"]),
  "supporting-route-entry-and-reverse": Object.freeze(["supporting-about", "home-entry", "Q", "raster", "line", "arrival", "current", "F1"]),
});

const R1_MOTION_HOME_STATE = Object.freeze({
  F1: Object.freeze({ phase: "physical", segment: "top-dormancy", manifestoReveal: "hidden" }),
  "F1-rest": Object.freeze({ phase: "physical", segment: "top-dormancy", manifestoReveal: "hidden" }),
  current: Object.freeze({ phase: "physical", segment: "current-orbit", manifestoReveal: "hidden" }),
  "current-landscape-before": Object.freeze({ phase: "physical", segment: "current-orbit", manifestoReveal: "hidden" }),
  "current-portrait": Object.freeze({ phase: "physical", segment: "current-orbit", manifestoReveal: "hidden" }),
  "current-landscape-return": Object.freeze({ phase: "physical", segment: "current-orbit", manifestoReveal: "hidden" }),
  arrival: Object.freeze({ phase: "physical", segments: Object.freeze(["crt-arrival", "indicator"]), manifestoReveal: "hidden" }),
  indicator: Object.freeze({ phase: "physical", segment: "indicator", manifestoReveal: "hidden" }),
  line: Object.freeze({ phase: "physical", segment: "phosphor-line", manifestoReveal: "hidden" }),
  raster: Object.freeze({ phase: "physical", segment: "raster-settling", manifestoReveal: "hidden" }),
  Q: Object.freeze({ phase: "physical", segment: "q-hold", manifestoReveal: "hidden" }),
  threshold: Object.freeze({ phase: "physical", segment: "physical-threshold", manifestoReveal: "hidden" }),
  "manifesto-threshold": Object.freeze({ phase: "entry", segment: "entry-reveal", manifestoReveal: "revealing" }),
  "manifesto-resolved": Object.freeze({ phase: "entry", segment: "entry-reveal", manifestoReveal: "resolved" }),
  manifesto: Object.freeze({ phase: "settled", segment: "entry-reveal", manifestoReveal: "resolved" }),
  "manifesto-landscape-before": Object.freeze({ phase: "entry", segment: "entry-reveal", manifestoReveal: "resolved" }),
  "manifesto-portrait": Object.freeze({ phase: "entry", segment: "entry-reveal", manifestoReveal: "resolved" }),
  "manifesto-landscape-return": Object.freeze({ phase: "entry", segment: "entry-reveal", manifestoReveal: "resolved" }),
  "home-entry": Object.freeze({ phase: "settled", segment: "entry-reveal", manifestoReveal: "resolved" }),
});

function validateR1MotionStateSample(sample, label, context, authoredLabel = label) {
  const keys = ["documentHidden", "horizontalOverflow", "label", "manifestoReveal", "maximumScroll", "mediaState", "mode", "navigationReleased", "phase", "presentedFrame", "scrollY", "segment", "targetFrame", "url", "video", "viewport"];
  if (!sample || typeof sample !== "object" || Array.isArray(sample)
    || stableJson(Object.keys(sample).sort(lexicalCompare)) !== stableJson([...keys].sort(lexicalCompare))
    || sample.label !== label || typeof sample.url !== "string" || !sample.url.startsWith("/")
    || sample.documentHidden !== false
    || !Number.isFinite(sample.scrollY) || sample.scrollY < 0 || !Number.isFinite(sample.maximumScroll) || sample.maximumScroll < 0 || sample.scrollY > sample.maximumScroll
    || !Number.isFinite(sample.horizontalOverflow) || sample.horizontalOverflow < 0 || sample.horizontalOverflow > 1
    || !Number.isSafeInteger(sample.targetFrame) || sample.targetFrame < 0 || !Number.isSafeInteger(sample.presentedFrame) || sample.presentedFrame < 0
    || !sample.viewport || !Number.isSafeInteger(sample.viewport.width) || sample.viewport.width <= 0 || !Number.isSafeInteger(sample.viewport.height) || sample.viewport.height <= 0) {
    throw new Error(`R1 motion observation sample differs: ${context}/${label}`);
  }
  if (authoredLabel === "supporting-about") {
    if (sample.url !== "/about/" || sample.mode !== null || sample.mediaState !== null || sample.phase !== null || sample.segment !== null
      || sample.targetFrame !== 0 || sample.presentedFrame !== 0 || sample.manifestoReveal !== null || sample.navigationReleased !== null || sample.video !== null) {
      throw new Error(`R1 motion supporting-route document state differs: ${context}/${label}`);
    }
    return sample;
  }
  const expected = R1_MOTION_HOME_STATE[authoredLabel];
  if (!expected || !["/", "/#entry"].includes(sample.url)
    || sample.mode !== "enhanced" || sample.mediaState !== "ready" || sample.phase !== expected.phase
    || (expected.segment ? sample.segment !== expected.segment : !expected.segments.includes(sample.segment))
    || sample.manifestoReveal !== expected.manifestoReveal || sample.navigationReleased !== "concealed"
    || sample.targetFrame !== sample.presentedFrame
    || !sample.video || typeof sample.video !== "object" || Array.isArray(sample.video)
    || stableJson(Object.keys(sample.video).sort(lexicalCompare)) !== stableJson(["currentTime", "hasSource", "paused", "readyState"].sort(lexicalCompare))
    || !Number.isFinite(sample.video.currentTime) || sample.video.currentTime < 0 || sample.video.paused !== true
    || sample.video.hasSource !== true || !Number.isSafeInteger(sample.video.readyState) || sample.video.readyState < 1 || sample.video.readyState > 4) {
    throw new Error(`R1 motion authored-state semantics differ: ${context}/${label}`);
  }
  return sample;
}

function validateR1MotionSequence(samples, direction, context) {
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (direction === "forward" && (current.scrollY < previous.scrollY || current.targetFrame < previous.targetFrame)) {
      throw new Error(`R1 motion forward sequence is not monotonic: ${context}`);
    }
    if (direction === "reverse" && (current.scrollY > previous.scrollY || current.targetFrame > previous.targetFrame)) {
      throw new Error(`R1 motion reverse sequence is not monotonic: ${context}`);
    }
  }
}

function validateR1MotionObservations(recording, engine) {
  const observations = recording.observations;
  const context = `${engine}/${recording.filename}`;
  if (!observations || typeof observations !== "object" || Array.isArray(observations) || observations.status !== "PASS") {
    throw new Error(`R1 motion observations differ: ${context}`);
  }
  if (recording.id === "stop-at-authored-states") {
    if (stableJson(Object.keys(observations).sort(lexicalCompare)) !== stableJson(["status", "stops"])
      || !Array.isArray(observations.stops)
      || stableJson(observations.stops.map(({ label }) => label)) !== stableJson(["current", "line", "raster", "Q"])) {
      throw new Error(`R1 motion stop-at-state observation inventory differs: ${context}`);
    }
    for (const stop of observations.stops) {
      if (!stop || stableJson(Object.keys(stop).sort(lexicalCompare)) !== stableJson(["after", "before", "label", "status"])
        || stop.status !== "PASS") throw new Error(`R1 motion stop-at-state observation differs: ${context}`);
      const before = validateR1MotionStateSample(stop.before, `${stop.label}-before-pause`, context, stop.label);
      const after = validateR1MotionStateSample(stop.after, `${stop.label}-after-pause`, context, stop.label);
      if (Math.abs(after.scrollY - before.scrollY) > 1 || after.maximumScroll !== before.maximumScroll
        || after.targetFrame !== before.targetFrame || after.presentedFrame !== before.presentedFrame
        || after.video.currentTime !== before.video.currentTime || after.video.paused !== true || before.video.paused !== true) {
        throw new Error(`R1 motion stop-at-state stability differs: ${context}/${stop.label}`);
      }
    }
    return;
  }
  const labels = R1_MOTION_SAMPLE_LABELS[recording.id];
  if (!labels || stableJson(Object.keys(observations).sort(lexicalCompare)) !== stableJson(["samples", "status"])
    || !Array.isArray(observations.samples) || stableJson(observations.samples.map(({ label }) => label)) !== stableJson(labels)) {
    throw new Error(`R1 motion sample inventory differs: ${context}`);
  }
  const samples = observations.samples.map((sample, index) => validateR1MotionStateSample(sample, labels[index], context));
  if (recording.id === "forward-physical-to-manifesto") validateR1MotionSequence(samples, "forward", context);
  if (recording.id === "reverse-manifesto-to-f1") validateR1MotionSequence(samples, "reverse", context);
  if (recording.id === "supporting-route-entry-and-reverse") {
    if (samples[0].url !== "/about/" || samples.slice(1).some(({ url }) => url !== "/#entry")) throw new Error(`R1 motion supporting-route navigation differs: ${context}`);
    validateR1MotionSequence(samples.slice(1), "reverse", context);
  }
  if (recording.id === "resize-orientation-mid-current-and-manifesto") {
    const [currentLandscape, currentPortrait, currentReturn, manifestoLandscape, manifestoPortrait, manifestoReturn] = samples;
    if (!(currentLandscape.viewport.width > currentLandscape.viewport.height && currentPortrait.viewport.height > currentPortrait.viewport.width
      && currentReturn.viewport.width > currentReturn.viewport.height && manifestoLandscape.viewport.width > manifestoLandscape.viewport.height
      && manifestoPortrait.viewport.height > manifestoPortrait.viewport.width && manifestoReturn.viewport.width > manifestoReturn.viewport.height)
      || ![currentPortrait, currentReturn].every((sample) => sample.scrollY === currentLandscape.scrollY && sample.targetFrame === currentLandscape.targetFrame)
      || ![manifestoPortrait, manifestoReturn].every((sample) => sample.scrollY === manifestoLandscape.scrollY && sample.targetFrame === manifestoLandscape.targetFrame)) {
      throw new Error(`R1 motion resize/orientation state continuity differs: ${context}`);
    }
  }
}

function isExpectedR1MotionRequestFailure(record) {
  return record?.method === "GET"
    && record?.resourceType === "media"
    && record?.status === null
    && /^(?:net::ERR_ABORTED|NS_BINDING_ABORTED)$/i.test(String(record?.failure ?? ""))
    && /^https?:\/\//i.test(String(record?.path ?? ""));
}

export function validateR1MotionReport(document, engine, metadata = null) {
  if (!engine || !["chromium", "firefox"].includes(engine)
    || document?.schema !== R1_MOTION_EVIDENCE_SCHEMA
    || document.status !== "PASS"
    || document.evidenceClass !== "SUPPLEMENTAL MACHINE EVIDENCE — NOT PHYSICAL DEVICE EVIDENCE"
    || document.browser?.engine !== engine
    || typeof document.browser?.headed !== "boolean"
    || typeof document.browser?.version !== "string" || !document.browser.version.trim()
    || document.inputPolicy !== "Playwright native wheel, pointer, viewport and link activation; no page scroll-position writes"
    || document.encoder?.contract?.container !== "mp4"
    || document.encoder?.contract?.codec !== "h264"
    || document.encoder?.contract?.pixelFormat !== "yuv420p"
    || document.encoder?.contract?.fps !== 30
    || document.encoder?.contract?.audioStreams !== 0
    || document.encoder?.fullDecodeValidated !== true
    || document.diagnostics?.status !== "PASS"
    || !Array.isArray(document.diagnostics?.failures) || document.diagnostics.failures.length
    || !document.requests || !Array.isArray(document.requests.blocked) || document.requests.blocked.length
    || !Array.isArray(document.requests.pageErrors) || document.requests.pageErrors.length
    || !Array.isArray(document.requests.console)
    || !Array.isArray(document.requests.requests)
    || document.requests.requests.some((request) => request?.failure && !isExpectedR1MotionRequestFailure(request))
    || document.summary?.recordings !== 5
    || document.summary?.expected !== 5
    || document.summary?.failures !== document.diagnostics?.failures?.length
    || !Array.isArray(document.recordings)
    || document.recordings.length !== R1_MOTION_RECORDING_SPECS.length) {
    throw new Error(`R1 motion report authority differs: ${engine ?? "missing"}`);
  }
  validateIsoTimestamp(document.createdAt, `R1 motion ${engine} createdAt`);
  if (metadata) {
    const permittedOrigins = new Set([
      metadata.evidenceContext?.browserQa?.baseUrl,
      metadata.deployment?.immutableUrl,
      metadata.deployment?.branchUrl,
    ].filter(Boolean));
    if (!permittedOrigins.has(document.baseUrl)) throw new Error(`R1 motion report origin differs: ${engine}`);
  }
  const identities = document.recordings.map(({ id, filename }) => ({ id, filename }));
  if (stableJson(identities) !== stableJson(R1_MOTION_RECORDING_SPECS)) throw new Error(`R1 motion five-story identity differs: ${engine}`);
  for (const [index, recording] of document.recordings.entries()) {
    const spec = R1_MOTION_RECORDING_SPECS[index];
    const validation = recording?.validation;
    if (recording.evidenceClass !== "SUPPLEMENTAL MACHINE RECORDING"
      || recording.relativePath !== `recordings/${spec.filename}`
      || !Number.isSafeInteger(recording.byteSize) || recording.byteSize <= 0
      || !HASH64.test(recording.sha256 ?? "")
      || validation?.status !== "PASS"
      || !validation.checks
      || stableJson(Object.keys(validation.checks).sort(lexicalCompare)) !== stableJson([...R1_MOTION_VALIDATION_CHECKS].sort(lexicalCompare))
      || R1_MOTION_VALIDATION_CHECKS.some((check) => validation.checks[check] !== true)
      || !Number.isFinite(validation.duration) || validation.duration < 1.5 || validation.duration > 45
      || validation.media?.codec !== "h264"
      || validation.media?.pixelFormat !== "yuv420p"
      || validation.media?.fps !== "30/1"
      || validation.media?.audioStreams !== 0
      || validation.media?.width !== 1280
      || validation.media?.height !== 720
      || !/(?:^|,)mp4(?:,|$)/.test(String(validation.media?.format ?? ""))) {
      throw new Error(`R1 motion recording contract differs: ${engine}/${spec.filename}`);
    }
    validateR1MotionObservations(recording, engine);
  }
  return document;
}

async function validateR1MotionBoundMedia(sourceRoot, record, bytes, metadata) {
  const contract = validateMediaContract(record.mediaContract, record.destination);
  const binding = contract.validationReport;
  const expectedVideoSource = path.posix.join(path.posix.dirname(binding.source), binding.recordingRelativePath);
  if (expectedVideoSource !== record.source) throw new Error(`R1 motion video source is not bound to its report: ${record.source}`);
  const { bytes: reportBytes } = await checkedSourceFile(sourceRoot, binding.source);
  if (sha256(reportBytes) !== binding.expectedSha256) throw new Error(`R1 motion report SHA-256 differs: ${binding.source}`);
  let report;
  try { report = JSON.parse(reportBytes.toString("utf8")); } catch { throw new Error(`invalid R1 motion report JSON: ${binding.source}`); }
  validateR1MotionReport(report, record.engine, metadata);
  const recording = report.recordings.find(({ relativePath }) => relativePath === binding.recordingRelativePath);
  const expectedSpec = R1_MOTION_RECORDING_SPECS.find(({ filename }) => filename === path.posix.basename(record.source));
  if (!recording || !expectedSpec || recording.id !== expectedSpec.id || recording.filename !== expectedSpec.filename
    || recording.byteSize !== bytes.length || recording.sha256 !== sha256(bytes)
    || Math.abs(recording.validation.duration - contract.durationSeconds) > 0.001
    || contract.codec !== recording.validation.media.codec
    || contract.pixelFormat !== recording.validation.media.pixelFormat
    || contract.audioStreams !== recording.validation.media.audioStreams
    || contract.fps !== 30
    || contract.fullDecodeValidated !== report.encoder.fullDecodeValidated) {
    throw new Error(`R1 motion video/report binding differs: ${record.source}`);
  }
  return { ...contract, container: "mp4", engine: record.engine, story: expectedSpec.id, validationReportSha256: sha256(reportBytes) };
}

function lifecycleComponentStatus(component, label, permitted) {
  const status = normalizeEvidenceStatus(component?.status);
  if (!status || status !== component.status || !permitted.includes(status)) throw new Error(`R1 persistent-lifecycle ${label} status differs`);
  return status;
}

const R1_HISTORY_CHECKS = Object.freeze([
  "bareCorrect",
  "bareBackCorrect",
  "bareBackNoManifestoReplay",
  "bareForwardCorrect",
  "entryCorrect",
  "entryBackCorrect",
  "entryBackManifestoResolved",
  "entryForwardCorrect",
  "menuClosed",
]);

function r1StaticRestorationCoherent(state) {
  const phase4Resources = (state?.probe?.resources ?? []).filter(({ url, path: resourcePath }) => r1Phase4MediaUrl(url ?? resourcePath));
  return state?.home?.mode === "static"
    && state.home.bootstrap === "restored-scroll"
    && state.home.eligibility === "bypass"
    && state.home.fallback === null
    && state.home.header === "released"
    && state.home.phase === "fallback"
    && state.home.interactive === "true"
    && state.home.routeNavigation === "released"
    && state.home.manifesto?.rendered === true
    && state.home.manifesto.text === "We turn industrial needs into field evidence."
    && state.home.continuation?.audienceRouting?.inert === false
    && state.home.source?.hasSource === false
    && state.home.source.src === null
    && state.home.source.currentSrc === null
    && state.home.source.srcAttribute === null
    && state.home.source.videoNodeCount === 1
    && state.home.source.sourceNodeCount === 0
    && state.probe?.raf?.active === 0
    && state.probe?.intervals?.active === 0
    && state.probe?.blob?.live === 0
    && Number.isFinite(state.scrollY)
    && Number.isFinite(state.maximumScroll)
    && state.scrollY > 0
    && state.scrollY <= state.maximumScroll
    && phase4Resources.length === 0;
}

function r1MenuStateClosed(state) {
  return state?.mobileMenu?.open === false && state.mobileMenu.expanded === "false";
}

function r1AttachedHomeSource(source) {
  return source?.hasSource === true
    && typeof source.src === "string" && source.src.length > 0
    && typeof source.currentSrc === "string" && source.currentSrc.length > 0
    && typeof source.srcAttribute === "string" && source.srcAttribute.length > 0
    && source.src === source.currentSrc
    && source.currentSrc === source.srcAttribute
    && source.videoNodeCount === 1
    && source.sourceNodeCount === 0;
}

function r1EnhancedRestorationCoherent(state, expectedBootstrap) {
  return state?.home?.mode === "enhanced"
    && state.home.bootstrap === expectedBootstrap
    && state.home.eligibility === "eligible"
    && state.home.fallback === null
    && state.home.header === "released"
    && state.home.phase === "settled"
    && state.home.interactive === "true"
    && state.home.routeNavigation === "released"
    && state.home.mediaState === "ready"
    && r1AttachedHomeSource(state.home.source)
    && state.probe?.raf?.active === 0
    && state.probe?.intervals?.active === 0
    && state.probe?.blob?.live === 1
    && state.home.manifestoReveal === "resolved"
    && state.home.manifesto?.rendered === true
    && state.home.manifesto.text === "We turn industrial needs into field evidence."
    && state.home.continuation?.audienceRouting?.inert === false
    && r1MenuStateClosed(state);
}

function r1SourceIdentityStable(before, after) {
  const beforeSource = before?.home?.source;
  const afterSource = after?.home?.source;
  return r1AttachedHomeSource(beforeSource)
    && r1AttachedHomeSource(afterSource)
    && beforeSource.currentSrc === afterSource.currentSrc
    && beforeSource.srcAttribute === afterSource.srcAttribute
    && beforeSource.videoNodeCount === afterSource.videoNodeCount
    && beforeSource.sourceNodeCount === afterSource.sourceNodeCount;
}

function r1NonemptyNavigationId(state) {
  return typeof state?.navigationId === "string"
    && state.navigationId.length > 0
    && state.navigationId !== "pre-navigation";
}

function r1NavigationIdentityStable(before, after) {
  return r1NonemptyNavigationId(before)
    && r1NonemptyNavigationId(after)
    && before.navigationId === after.navigationId;
}

function r1EnhancedHomeReturnResourcesCoherent(state) {
  return state?.probe?.raf?.active === 0
    && state.probe?.intervals?.active === 0
    && state.probe?.blob?.live === 1;
}

function r1HiddenHomeSourceCoherent(before, hidden) {
  return r1SourceIdentityStable(before, hidden)
    && hidden?.home?.source?.paused === true
    && hidden.probe?.raf?.active === 0
    && hidden.probe?.intervals?.active === 0
    && hidden.probe?.blob?.live === 1;
}

function r1HomeCurrentSemanticState(state) {
  return state?.url === "/"
    && state?.home?.mode === "enhanced"
    && state.home.phase === "physical"
    && state.home.segment === "current-orbit";
}

function r1HomeManifestoSemanticState(state) {
  return state?.url === "/"
    && state?.home?.mode === "enhanced"
    && state.home.phase === "settled"
    && state.home.manifestoReveal === "resolved"
    && state.home.manifesto?.rendered === true
    && state.home.manifesto.text === "We turn industrial needs into field evidence.";
}

function r1TransitionStatesEvery(transition, predicate) {
  return [transition?.before, transition?.hidden, transition?.visible].every(predicate);
}

function r1EventLedgersAppendOnly(before, after) {
  const beforeEvents = before?.probe?.events;
  const afterEvents = after?.probe?.events;
  return Array.isArray(beforeEvents)
    && Array.isArray(afterEvents)
    && beforeEvents.length <= afterEvents.length
    && stableJson(beforeEvents) === stableJson(afterEvents.slice(0, beforeEvents.length));
}

function r1ManifestoRevealLedgerValid(state) {
  const events = state?.probe?.manifestoRevealEvents;
  return Array.isArray(events)
    && events.every((event, index) => (
      event
      && typeof event === "object"
      && !Array.isArray(event)
      && Number.isFinite(event.atEpochMs)
      && event.atEpochMs > 0
      && event.atEpochMs <= state.capturedAtEpochMs
      && (event.value === null || typeof event.value === "string")
      && (index === 0 || event.atEpochMs >= events[index - 1].atEpochMs)
    ));
}

function r1ManifestoRevealLedgersAppendOnly(before, after) {
  const beforeEvents = before?.probe?.manifestoRevealEvents;
  const afterEvents = after?.probe?.manifestoRevealEvents;
  return r1ManifestoRevealLedgerValid(before)
    && r1ManifestoRevealLedgerValid(after)
    && beforeEvents.length <= afterEvents.length
    && stableJson(beforeEvents) === stableJson(afterEvents.slice(0, beforeEvents.length));
}

function r1ResolvedManifestoObserved(state) {
  return r1ManifestoRevealLedgerValid(state)
    && state.probe.manifestoRevealEvents.some(({ value }) => value === "resolved")
    && state.home?.manifestoReveal === "resolved";
}

function r1ManifestoRemainedResolvedAfterDeparture(departure, restored) {
  if (!r1ManifestoRevealLedgersAppendOnly(departure, restored)
    || !r1ResolvedManifestoObserved(departure)
    || !r1ResolvedManifestoObserved(restored)) return false;
  const departureEvents = departure.probe.manifestoRevealEvents;
  return restored.probe.manifestoRevealEvents.slice(departureEvents.length).every((event) => (
    event.atEpochMs > departure.capturedAtEpochMs
    && event.atEpochMs <= restored.capturedAtEpochMs
    && event.value === "resolved"
  ));
}

function r1InitialEnhancedHomeCoherent(state, expectedBootstrap) {
  return state?.home?.mode === "enhanced"
    && state.home.bootstrap === expectedBootstrap
    && state.home.eligibility === "eligible"
    && state.home.fallback === null
    && state.home.mediaState === "ready"
    && r1AttachedHomeSource(state.home.source)
    && state.probe?.blob?.live === 1
    && r1MenuStateClosed(state);
}

function r1HomeProgressionCoherent(initial, resolved, expectedBootstrap) {
  return Boolean(initial?.documentId)
    && initial.documentId === resolved?.documentId
    && r1NavigationIdentityStable(initial, resolved)
    && initial.origin === resolved.origin
    && initial.url === resolved.url
    && Number.isFinite(initial.capturedAtEpochMs) && initial.capturedAtEpochMs > 0
    && Number.isFinite(resolved.capturedAtEpochMs) && resolved.capturedAtEpochMs >= initial.capturedAtEpochMs
    && Number.isSafeInteger(initial.probe?.documentEventSequence) && initial.probe.documentEventSequence >= 0
    && Number.isSafeInteger(resolved.probe?.documentEventSequence)
    && resolved.probe.documentEventSequence >= initial.probe.documentEventSequence
    && r1EventLedgersAppendOnly(initial, resolved)
    && r1ManifestoRevealLedgersAppendOnly(initial, resolved)
    && r1ResolvedManifestoObserved(resolved)
    && r1InitialEnhancedHomeCoherent(initial, expectedBootstrap)
    && r1EnhancedRestorationCoherent(resolved, expectedBootstrap)
    && r1SourceIdentityStable(initial, resolved);
}

function r1VisibleContextRestored(before, after) {
  const beforeLink = before?.home?.continuation?.partnerLink;
  const afterLink = after?.home?.continuation?.partnerLink;
  return beforeLink?.visible === true
    && afterLink?.visible === true
    && Number.isFinite(beforeLink.top)
    && Number.isFinite(afterLink.top)
    && Math.abs(beforeLink.top - afterLink.top) <= 3;
}

const R1_HISTORY_STATES = Object.freeze([
  "bare",
  "bareManifesto",
  "supportAfterBare",
  "bareBack",
  "supportForward",
  "entryInitial",
  "entryResolved",
  "supportAfterEntry",
  "entryBack",
  "entryForward",
]);

const R1_VISIBILITY_SCENARIOS = Object.freeze([
  "home-current",
  "home-manifesto",
  "maradin-release",
  "maradin-retry-release",
]);

const R1_VISIBILITY_TRANSITIONS = Object.freeze({
  "home-current": "current",
  "home-manifesto": "manifesto",
  "maradin-release": "maradin",
  "maradin-retry-release": "maradinRetry",
});

function validateR1History(document, status) {
  const checks = document.history?.checks;
  if (!checks || stableJson(Object.keys(checks).sort(lexicalCompare)) !== stableJson([...R1_HISTORY_CHECKS].sort(lexicalCompare))
    || R1_HISTORY_CHECKS.some((check) => check === "bareBackNoManifestoReplay"
      ? ![true, false, null].includes(checks[check])
      : typeof checks[check] !== "boolean")) {
    throw new Error("R1 persistent-lifecycle ordinary-history checks differ");
  }
  const states = document.history?.states;
  if (!states || typeof states !== "object" || Array.isArray(states)
    || stableJson(Object.keys(states).sort(lexicalCompare)) !== stableJson([...R1_HISTORY_STATES].sort(lexicalCompare))
    || R1_HISTORY_STATES.some((stateKey) => !states[stateKey] || typeof states[stateKey] !== "object" || Array.isArray(states[stateKey]))) {
    throw new Error("R1 persistent-lifecycle history states inventory is incomplete");
  }
  if (!Array.isArray(document.history?.events) || !Array.isArray(states.entryForward.probe?.events)) {
    throw new Error("R1 persistent-lifecycle history event evidence is incomplete");
  }
  exactJson(document.history.events, states.entryForward.probe.events, "R1 persistent-lifecycle history event ledger");
  const bareSameDocument = Boolean(states.bareManifesto.documentId)
    && states.bareManifesto.documentId === states.bareBack.documentId;
  const bareExactRestoration = bareSameDocument
    && r1EnhancedRestorationCoherent(states.bareBack, "eligible")
    && r1SourceIdentityStable(states.bareManifesto, states.bareBack)
    && r1NavigationIdentityStable(states.bareManifesto, states.bareBack)
    && Number.isFinite(states.bareBack.scrollY)
    && Number.isFinite(states.bareManifesto.scrollY)
    && Math.abs(states.bareBack.scrollY - states.bareManifesto.scrollY) <= 2;
  const bareStaticRestoration = !bareSameDocument
    && r1StaticRestorationCoherent(states.bareBack)
    && r1VisibleContextRestored(states.bareManifesto, states.bareBack);
  const entrySameDocument = Boolean(states.entryResolved.documentId)
    && states.entryResolved.documentId === states.entryBack.documentId;
  const derived = {
    bareCorrect: states.bare.url === "/" && states.bare.scrollY === 0 && states.bare.probe?.navigation?.type === "navigate" && states.bareManifesto.url === "/" && states.bareManifesto.probe?.navigation?.type === "navigate" && r1HomeProgressionCoherent(states.bare, states.bareManifesto, "eligible"),
    bareBackCorrect: states.bareBack.url === "/" && states.bareBack.probe?.navigation?.type === "back_forward" && (bareExactRestoration || bareStaticRestoration),
    bareBackNoManifestoReplay: bareSameDocument ? r1ManifestoRemainedResolvedAfterDeparture(states.bareManifesto, states.bareBack) : null,
    bareForwardCorrect: states.supportAfterBare.url === "/for-partners/" && states.supportAfterBare.probe?.navigation?.type === "navigate" && states.supportForward.url === "/for-partners/" && states.supportForward.probe?.navigation?.type === "back_forward" && Number.isFinite(states.supportForward.scrollY) && Number.isFinite(states.supportAfterBare.scrollY) && Math.abs(states.supportForward.scrollY - states.supportAfterBare.scrollY) <= 2,
    entryCorrect: states.entryInitial.url === "/#entry" && states.entryInitial.probe?.navigation?.type === "navigate" && states.entryResolved.url === "/#entry" && states.entryResolved.probe?.navigation?.type === "navigate" && r1HomeProgressionCoherent(states.entryInitial, states.entryResolved, "semantic-entry"),
    entryBackCorrect: states.supportAfterEntry.url === "/for-partners/" && states.supportAfterEntry.probe?.navigation?.type === "navigate" && states.entryBack.url === "/#entry" && states.entryBack.probe?.navigation?.type === "back_forward" && r1EnhancedRestorationCoherent(states.entryBack, "semantic-entry") && (!entrySameDocument || (r1SourceIdentityStable(states.entryResolved, states.entryBack) && r1NavigationIdentityStable(states.entryResolved, states.entryBack) && r1ManifestoRemainedResolvedAfterDeparture(states.entryResolved, states.entryBack))) && Number.isFinite(states.entryBack.scrollY) && Number.isFinite(states.entryResolved.scrollY) && Math.abs(states.entryBack.scrollY - states.entryResolved.scrollY) <= 2,
    entryBackManifestoResolved: states.entryBack.home?.manifestoReveal === "resolved",
    entryForwardCorrect: states.entryForward.url === "/for-partners/" && states.entryForward.probe?.navigation?.type === "back_forward" && Number.isFinite(states.entryForward.scrollY) && Number.isFinite(states.supportAfterEntry.scrollY) && Math.abs(states.entryForward.scrollY - states.supportAfterEntry.scrollY) <= 2,
    menuClosed: R1_HISTORY_STATES.every((stateKey) => r1MenuStateClosed(states[stateKey])),
  };
  for (const check of R1_HISTORY_CHECKS) {
    if (checks[check] !== derived[check]) throw new Error(`R1 persistent-lifecycle history check ${check} contradicts raw states`);
  }
  const expected = R1_HISTORY_CHECKS.every((check) => derived[check] === true || (check === "bareBackNoManifestoReplay" && derived[check] === null)) ? "PASS" : "FAIL";
  if (status !== expected) throw new Error(`R1 persistent-lifecycle history status must be ${expected}`);
}

function r1LifecycleEventUrlMatches(event, expectedOrigin, expectedRoute) {
  try {
    const url = new URL(event?.href);
    return url.protocol === "https:"
      && url.origin === expectedOrigin
      && url.search === ""
      && `${url.pathname}${url.hash}` === expectedRoute;
  } catch {
    return false;
  }
}

function r1LedgerContainsEvent(ledger, expected) {
  const serialized = stableJson(expected);
  return Array.isArray(ledger) && ledger.some((event) => stableJson(event) === serialized);
}

function r1BfcachePairBoundToSnapshots(departure, restored, pagehide, pageshow, expectedOrigin, expectedRoute) {
  const departureEvents = departure?.probe?.events;
  const restoredEvents = restored?.probe?.events;
  if (departure?.origin !== expectedOrigin
    || restored?.origin !== expectedOrigin
    || departure.url !== expectedRoute
    || restored.url !== expectedRoute
    || !r1LifecycleEventUrlMatches(pagehide, expectedOrigin, expectedRoute)
    || !r1LifecycleEventUrlMatches(pageshow, expectedOrigin, expectedRoute)
    || !Number.isFinite(departure.capturedAtEpochMs) || departure.capturedAtEpochMs <= 0
    || !Number.isFinite(restored.capturedAtEpochMs) || restored.capturedAtEpochMs <= 0
    || !Number.isFinite(pagehide?.atEpochMs) || pagehide.atEpochMs <= departure.capturedAtEpochMs
    || !Number.isFinite(pageshow?.atEpochMs) || pageshow.atEpochMs <= pagehide.atEpochMs
    || pageshow.atEpochMs > restored.capturedAtEpochMs
    || !Number.isSafeInteger(departure.probe?.documentEventSequence) || departure.probe.documentEventSequence < 0
    || !Number.isSafeInteger(restored.probe?.documentEventSequence) || restored.probe.documentEventSequence < 0
    || !Number.isSafeInteger(pagehide?.documentEventSequence) || pagehide.documentEventSequence <= departure.probe.documentEventSequence
    || !Number.isSafeInteger(pageshow?.documentEventSequence) || pageshow.documentEventSequence <= pagehide.documentEventSequence
    || pageshow.documentEventSequence > restored.probe.documentEventSequence
    || !r1EventLedgersAppendOnly(departure, restored)
    || r1LedgerContainsEvent(departureEvents, pagehide)
    || r1LedgerContainsEvent(departureEvents, pageshow)
    || !r1LedgerContainsEvent(restoredEvents, pagehide)
    || !r1LedgerContainsEvent(restoredEvents, pageshow)) return false;
  const hideIndex = restoredEvents.findIndex((event) => stableJson(event) === stableJson(pagehide));
  const showIndex = restoredEvents.findIndex((event) => stableJson(event) === stableJson(pageshow));
  return hideIndex >= departureEvents.length && showIndex > hideIndex;
}

const R1_BFCACHE_SCENARIOS = Object.freeze([
  Object.freeze({ departureKey: "bareManifesto", stateKey: "bareBack", expectedRoute: "/" }),
  Object.freeze({ departureKey: "entryResolved", stateKey: "entryBack", expectedRoute: "/#entry" }),
]);

function deriveR1Bfcache(document) {
  const events = document.history?.events;
  const states = document.history?.states;
  if (!Array.isArray(events) || !states || typeof states !== "object" || Array.isArray(states)) {
    throw new Error("R1 persistent-lifecycle BFCache raw history evidence is incomplete");
  }
  const persistedEvents = events.filter(({ type, persisted }) => (type === "pageshow" || type === "pagehide") && persisted === true);
  const expectedOrigin = new URL(document.baseUrl).origin;
  const usedHideIndexes = new Set();
  const scenarios = R1_BFCACHE_SCENARIOS.map(({ departureKey, stateKey, expectedRoute }) => {
    const departure = states[departureKey];
    const state = states[stateKey];
    if (!state?.documentId || departure?.documentId !== state.documentId || departure.url !== expectedRoute || state.url !== expectedRoute) {
      return { departureKey, stateKey, expectedRoute, status: "NOT OBSERVED", pair: null, coherent: null };
    }
    for (let showIndex = 0; showIndex < events.length; showIndex += 1) {
      const show = events[showIndex];
      if (show?.type !== "pageshow" || show.persisted !== true || show.synthetic === true || show.documentId !== state.documentId || !r1LifecycleEventUrlMatches(show, expectedOrigin, expectedRoute)) continue;
      for (let hideIndex = showIndex - 1; hideIndex >= 0; hideIndex -= 1) {
        const hide = events[hideIndex];
        if (hide?.documentId !== state.documentId || !r1LifecycleEventUrlMatches(hide, expectedOrigin, expectedRoute) || !["pagehide", "pageshow"].includes(hide.type)) continue;
        if (usedHideIndexes.has(hideIndex) || hide.type !== "pagehide" || hide.persisted !== true || hide.synthetic === true) break;
        usedHideIndexes.add(hideIndex);
        const expectedBootstrap = expectedRoute === "/#entry" ? "semantic-entry" : "eligible";
        const coherent = r1BfcachePairBoundToSnapshots(departure, state, hide, show, expectedOrigin, expectedRoute)
          && r1EnhancedRestorationCoherent(state, expectedBootstrap)
          && r1SourceIdentityStable(departure, state)
          && r1NavigationIdentityStable(departure, state)
          && r1ManifestoRemainedResolvedAfterDeparture(departure, state)
          && Number.isFinite(state.scrollY)
          && Number.isFinite(departure.scrollY)
          && Math.abs(state.scrollY - departure.scrollY) <= 2;
        return {
          departureKey,
          stateKey,
          expectedRoute,
          status: coherent ? "PASS" : "FAIL",
          pair: { pagehide: hide, pageshow: show },
          coherent,
        };
      }
    }
    return { departureKey, stateKey, expectedRoute, status: "NOT OBSERVED", pair: null, coherent: null };
  });
  const pairedRestorations = scenarios.filter(({ pair }) => pair).map(({ pair, stateKey }) => ({ ...pair, stateKey }));
  const status = scenarios.some(({ status: scenarioStatus }) => scenarioStatus === "FAIL")
    ? "FAIL"
    : scenarios.some(({ status: scenarioStatus }) => scenarioStatus === "NOT OBSERVED")
      ? "NOT OBSERVED"
      : "PASS";
  return { status, persistedEvents, pairedRestorations, scenarios };
}

function validateR1Bfcache(document, status) {
  const bfcache = document.bfcache;
  if (!Array.isArray(bfcache.persistedEvents) || !Array.isArray(bfcache.pairedRestorations) || !Array.isArray(bfcache.scenarios)) {
    throw new Error("R1 persistent-lifecycle BFCache evidence is incomplete");
  }
  const derived = deriveR1Bfcache(document);
  const notRestoredReasons = Object.fromEntries(R1_HISTORY_STATES.map((stateKey) => [
    stateKey,
    document.history.states[stateKey].probe?.navigation?.notRestoredReasons ?? null,
  ]));
  exactJson(bfcache.persistedEvents, derived.persistedEvents, "R1 persistent-lifecycle BFCache persisted-event ledger");
  exactJson(bfcache.pairedRestorations, derived.pairedRestorations, "R1 persistent-lifecycle BFCache paired-restoration ledger");
  exactJson(bfcache.scenarios, derived.scenarios, "R1 persistent-lifecycle BFCache scenario ledger");
  exactJson(bfcache.notRestoredReasons, notRestoredReasons, "R1 persistent-lifecycle BFCache not-restored-reasons ledger");
  if (status !== derived.status) throw new Error(`R1 persistent-lifecycle BFCache status must be ${derived.status}`);
}

function deriveR1VisibilityObservation(transition) {
  const { before, hidden, visible } = transition ?? {};
  const documentId = before?.documentId;
  const sameDocument = Boolean(documentId)
    && hidden?.documentId === documentId
    && visible?.documentId === documentId
    && typeof before?.origin === "string" && before.origin.length > 0
    && hidden?.origin === before.origin
    && visible?.origin === before.origin
    && hidden?.url === before.url
    && visible?.url === before.url
    && r1NavigationIdentityStable(before, hidden)
    && r1NavigationIdentityStable(hidden, visible);
  const sequenceBound = Number.isSafeInteger(before?.probe?.documentEventSequence)
    && before.probe.documentEventSequence >= 0
    && Number.isSafeInteger(hidden?.probe?.documentEventSequence)
    && Number.isSafeInteger(visible?.probe?.documentEventSequence)
    && hidden.probe.documentEventSequence >= before.probe.documentEventSequence
    && visible.probe.documentEventSequence >= hidden.probe.documentEventSequence;
  const sequenceStart = sequenceBound ? before.probe.documentEventSequence : -1;
  const transitionEvents = (visible?.probe?.events ?? []).filter((event) => (
    event?.type === "visibilitychange"
    && event.synthetic !== true
    && event.documentId === documentId
    && Number(event.documentEventSequence) > sequenceStart
  ));
  const hiddenEventIndex = transitionEvents.findIndex(({ visibilityState }) => visibilityState === "hidden");
  const visibleEventIndex = hiddenEventIndex < 0
    ? -1
    : transitionEvents.findIndex(({ visibilityState }, index) => index > hiddenEventIndex && visibilityState === "visible");
  const hiddenEvent = transitionEvents[hiddenEventIndex];
  const visibleEvent = transitionEvents[visibleEventIndex];
  const hiddenEventSequence = Number(transitionEvents[hiddenEventIndex]?.documentEventSequence);
  const visibleEventSequence = Number(transitionEvents[visibleEventIndex]?.documentEventSequence);
  const beforeEvents = before?.probe?.events;
  const hiddenEvents = hidden?.probe?.events;
  const visibleEvents = visible?.probe?.events;
  const temporalSnapshots = [before, hidden, visible].every((state) => Number.isFinite(state?.capturedAtEpochMs) && state.capturedAtEpochMs > 0);
  const appendOnlyLedgers = r1EventLedgersAppendOnly(before, hidden) && r1EventLedgersAppendOnly(hidden, visible);
  const hiddenEventBound = hiddenEventIndex >= 0
    && r1LifecycleEventUrlMatches(hiddenEvent, before?.origin, before?.url)
    && Number.isFinite(hiddenEvent?.atEpochMs)
    && hiddenEvent.atEpochMs > before.capturedAtEpochMs
    && hiddenEvent.atEpochMs <= hidden.capturedAtEpochMs
    && hiddenEventSequence > sequenceStart
    && hiddenEventSequence <= Number(hidden?.probe?.documentEventSequence)
    && !r1LedgerContainsEvent(beforeEvents, hiddenEvent)
    && r1LedgerContainsEvent(hiddenEvents, hiddenEvent);
  const visibleEventBound = visibleEventIndex > hiddenEventIndex
    && r1LifecycleEventUrlMatches(visibleEvent, before?.origin, before?.url)
    && Number.isFinite(visibleEvent?.atEpochMs)
    && visibleEvent.atEpochMs > hidden.capturedAtEpochMs
    && visibleEvent.atEpochMs <= visible.capturedAtEpochMs
    && visibleEventSequence > Number(hidden?.probe?.documentEventSequence)
    && visibleEventSequence <= Number(visible?.probe?.documentEventSequence)
    && !r1LedgerContainsEvent(hiddenEvents, visibleEvent)
    && r1LedgerContainsEvent(visibleEvents, visibleEvent);
  const checks = {
    sameDocument,
    sequenceBound,
    beforeVisible: before?.visibilityState === "visible",
    hiddenObserved: hidden?.visibilityState === "hidden",
    visibleRestored: visible?.visibilityState === "visible",
    orderedVisibilityEvents: hiddenEventIndex >= 0
      && visibleEventIndex > hiddenEventIndex
      && temporalSnapshots
      && appendOnlyLedgers
      && hiddenEventBound
      && visibleEventBound,
  };
  return {
    status: Object.values(checks).every(Boolean) ? "PASS" : "NOT OBSERVED",
    checks,
    transitionEvents,
  };
}

function r1WhenHidden(transition, predicate) {
  return deriveR1VisibilityObservation(transition).status === "PASS" && transition?.hidden?.visibilityState === "hidden"
    ? predicate(transition.hidden)
    : null;
}

function r1WhenVisible(transition, predicate) {
  return deriveR1VisibilityObservation(transition).status === "PASS" && transition?.visible?.visibilityState === "visible"
    ? predicate(transition.visible)
    : null;
}

function r1ActiveResourceIsZero(state, resource) {
  const active = state?.probe?.[resource]?.active;
  return Number.isFinite(active) ? active === 0 : null;
}

function r1MaradinMediaSourceFree(media) {
  return media?.state === "dormant"
    && media.hasSource === false
    && media.src === null
    && media.currentSrc === null
    && media.srcAttribute === null
    && media.videoNodeCount === 1
    && media.sourceNodeCount === 0
    && media.paused === true
    && media.readyState === 0
    && media.tabIndex === -1
    && media.launchHidden === false
    && media.launchDisabled === false;
}

function r1MaradinSourceFreeState(state) {
  return Array.isArray(state?.maradin) && state.maradin.length === 2 && state.maradin.every(r1MaradinMediaSourceFree);
}

function r1AttachedMaradinMedia(media) {
  return media?.state === "active"
    && media.hasSource === true
    && typeof media.src === "string" && media.src.length > 0
    && typeof media.currentSrc === "string" && media.currentSrc.length > 0
    && typeof media.srcAttribute === "string" && media.srcAttribute.length > 0
    && media.src === media.currentSrc
    && media.currentSrc === media.srcAttribute
    && media.videoNodeCount === 1
    && media.sourceNodeCount === 0
    && media.paused === false
    && media.readyState >= 2
    && media.tabIndex === 0
    && media.launchHidden === true
    && media.launchDisabled === false;
}

function r1MaradinActiveState(state) {
  if (!Array.isArray(state?.maradin) || state.maradin.length !== 2 || state.probe?.blob?.live !== 1) return false;
  return state.maradin.filter(r1AttachedMaradinMedia).length === 1
    && state.maradin.filter(r1MaradinMediaSourceFree).length === 1;
}

function r1MaradinRetryActiveState(state) {
  return r1MaradinActiveState(state)
    && state.retryActivated === true
    && state.retryPlayback?.advanced === true
    && Number.isFinite(state.retryPlayback?.startTime)
    && Number.isFinite(state.retryPlayback?.endTime)
    && state.retryPlayback.endTime > state.retryPlayback.startTime;
}

function r1TransitionRouteStable(transition, expectedOrigin, expectedRoute) {
  return [transition?.before, transition?.hidden, transition?.visible].every((state) => (
    state?.origin === expectedOrigin && state.url === expectedRoute
  ));
}

function r1TransitionNavigationStable(transition) {
  return r1NavigationIdentityStable(transition?.before, transition?.hidden)
    && r1NavigationIdentityStable(transition?.hidden, transition?.visible);
}

function r1SameDocumentSnapshotProgression(before, after, expectedOrigin, expectedRoute) {
  return Boolean(before?.documentId)
    && after?.documentId === before.documentId
    && before.origin === expectedOrigin
    && after.origin === expectedOrigin
    && before.url === expectedRoute
    && after.url === expectedRoute
    && r1NavigationIdentityStable(before, after)
    && Number.isFinite(before.capturedAtEpochMs) && before.capturedAtEpochMs > 0
    && Number.isFinite(after.capturedAtEpochMs) && after.capturedAtEpochMs >= before.capturedAtEpochMs
    && Number.isSafeInteger(before.probe?.documentEventSequence) && before.probe.documentEventSequence >= 0
    && Number.isSafeInteger(after.probe?.documentEventSequence)
    && after.probe.documentEventSequence >= before.probe.documentEventSequence
    && r1EventLedgersAppendOnly(before, after);
}

function deriveR1VisibilityChecks(document, scenario) {
  const transition = scenario.transition;
  const expectedOrigin = new URL(document.baseUrl).origin;
  switch (scenario.name) {
    case "home-current":
      return {
        routeStateStable: r1WhenVisible(transition, () => r1TransitionRouteStable(transition, expectedOrigin, "/") && r1TransitionNavigationStable(transition)),
        currentOrbitStateStable: r1WhenVisible(transition, () => r1TransitionStatesEvery(transition, r1HomeCurrentSemanticState)),
        homeMediaPausedWhileHidden: r1WhenHidden(transition, (state) => r1HiddenHomeSourceCoherent(transition.before, state)),
        noPersistentRafWhileHidden: r1WhenHidden(transition, (state) => r1ActiveResourceIsZero(state, "raf")),
        noPersistentIntervalWhileHidden: r1WhenHidden(transition, (state) => r1ActiveResourceIsZero(state, "intervals")),
        noStaleTargetFrameAfterReturn: r1WhenVisible(transition, (state) => Number.isFinite(state.home?.targetFrame)
          && Number.isFinite(state.home?.presentedFrame)
          && Math.abs(state.home.targetFrame - state.home.presentedFrame) <= 1),
        sourcePresenceStableAfterReturn: r1WhenVisible(transition, (state) => r1SourceIdentityStable(transition.before, transition.hidden)
          && r1SourceIdentityStable(transition.hidden, state)
          && r1EnhancedHomeReturnResourcesCoherent(state)),
      };
    case "home-manifesto":
      return {
        routeStateStable: r1WhenVisible(transition, () => r1TransitionRouteStable(transition, expectedOrigin, "/") && r1TransitionNavigationStable(transition)),
        manifestoStateStable: r1WhenVisible(transition, () => r1TransitionStatesEvery(transition, r1HomeManifestoSemanticState)),
        homeMediaPausedWhileHidden: r1WhenHidden(transition, (state) => r1HiddenHomeSourceCoherent(transition.before, state)),
        manifestoCoherentAfterReturn: r1WhenVisible(transition, (state) => state.home?.manifestoReveal === "resolved"
          && state.home.manifesto?.rendered === true
          && state.home.manifesto.text === "We turn industrial needs into field evidence."
          && r1SourceIdentityStable(transition.before, transition.hidden)
          && r1SourceIdentityStable(transition.hidden, state)
          && r1EnhancedHomeReturnResourcesCoherent(state)),
        noPersistentRafWhileHidden: r1WhenHidden(transition, (state) => r1ActiveResourceIsZero(state, "raf")),
        noPersistentIntervalWhileHidden: r1WhenHidden(transition, (state) => r1ActiveResourceIsZero(state, "intervals")),
      };
    case "maradin-release":
      return {
        routeStateStable: r1WhenVisible(transition, () => r1TransitionRouteStable(transition, expectedOrigin, "/pocs/maradin/") && r1TransitionNavigationStable(transition)),
        activeBeforeHide: r1WhenHidden(transition, () => r1MaradinActiveState(transition.before)),
        sourceFreeWhileHidden: r1WhenHidden(transition, r1MaradinSourceFreeState),
        sourceFreeAfterReturn: r1WhenVisible(transition, (state) => r1MaradinSourceFreeState(state)
          && state.probe?.blob?.live === 0
          && state.probe?.raf?.active === 0
          && state.probe?.intervals?.active === 0),
        noLiveOrphanBlobWhileHidden: r1WhenHidden(transition, (state) => state.probe?.blob?.live === 0),
        noPersistentRafWhileHidden: r1WhenHidden(transition, (state) => r1ActiveResourceIsZero(state, "raf")),
        noPersistentIntervalWhileHidden: r1WhenHidden(transition, (state) => r1ActiveResourceIsZero(state, "intervals")),
      };
    case "maradin-retry-release":
      return {
        routeStateStable: r1WhenVisible(transition, () => r1TransitionRouteStable(transition, expectedOrigin, "/pocs/maradin/") && r1TransitionNavigationStable(transition)),
        retryActivatedWithSource: document.visibility.retryActive == null ? null : r1MaradinRetryActiveState(document.visibility.retryActive)
          && r1SameDocumentSnapshotProgression(document.visibility.retryActive, transition.before, expectedOrigin, "/pocs/maradin/"),
        sourceFreeOnSecondHide: r1WhenHidden(transition, r1MaradinSourceFreeState),
        sourceFreeAfterSecondReturn: r1WhenVisible(transition, (state) => r1MaradinSourceFreeState(state)
          && state.probe?.blob?.live === 0
          && state.probe?.raf?.active === 0
          && state.probe?.intervals?.active === 0),
        noLiveOrphanBlobOnSecondHide: r1WhenHidden(transition, (state) => state.probe?.blob?.live === 0),
      };
    default:
      throw new Error(`R1 persistent-lifecycle visibility scenario differs: ${scenario?.name ?? "missing"}`);
  }
}

function validateR1Visibility(document, status) {
  const scenarios = document.visibility?.scenarios;
  if (!Array.isArray(scenarios)
    || stableJson(scenarios.map(({ name }) => name)) !== stableJson(R1_VISIBILITY_SCENARIOS)) {
    throw new Error("R1 persistent-lifecycle visibility scenario inventory differs");
  }
  if (!["current", "manifesto", "maradin", "maradinRetry", "retryActive"]
    .every((field) => Object.hasOwn(document.visibility, field))) {
    throw new Error("R1 persistent-lifecycle visibility raw snapshot inventory is incomplete");
  }
  const scenarioStatuses = scenarios.map((scenario) => {
    if (!scenario?.checks || typeof scenario.checks !== "object" || Array.isArray(scenario.checks)
      || !Array.isArray(scenario.failedChecks) || !Array.isArray(scenario.unavailableChecks)) {
      throw new Error(`R1 persistent-lifecycle visibility scenario differs: ${scenario?.name ?? "missing"}`);
    }
    const transitionField = R1_VISIBILITY_TRANSITIONS[scenario.name];
    exactJson(scenario.transition, document.visibility[transitionField], `R1 persistent-lifecycle visibility transition ${scenario.name}`);
    const observation = deriveR1VisibilityObservation(scenario.transition);
    exactJson(scenario.observation, observation, `R1 persistent-lifecycle visibility raw observation ${scenario.name}`);
    const checks = deriveR1VisibilityChecks(document, scenario);
    exactJson(scenario.checks, checks, `R1 persistent-lifecycle visibility lifecycle checks ${scenario.name}`);
    const falseChecks = Object.entries(checks).filter(([, value]) => value === false).map(([check]) => check);
    const unavailableChecks = Object.entries(checks).filter(([, value]) => value == null).map(([check]) => check);
    exactJson(scenario.failedChecks, falseChecks, `R1 persistent-lifecycle visibility failed-check ledger ${scenario.name}`);
    exactJson(scenario.unavailableChecks, unavailableChecks, `R1 persistent-lifecycle visibility unavailable-check ledger ${scenario.name}`);
    const observationStatus = observation.status;
    const expected = falseChecks.length ? "FAIL" : observationStatus === "PASS" && !unavailableChecks.length ? "PASS" : "NOT OBSERVED";
    const observed = lifecycleComponentStatus(scenario, `visibility scenario ${scenario.name}`, ["PASS", "FAIL", "NOT OBSERVED"]);
    if (observed !== expected) throw new Error(`R1 persistent-lifecycle visibility scenario status must be ${expected}: ${scenario.name}`);
    return observed;
  });
  const expected = scenarioStatuses.includes("FAIL") ? "FAIL" : scenarioStatuses.includes("NOT OBSERVED") ? "NOT OBSERVED" : "PASS";
  if (status !== expected) throw new Error(`R1 persistent-lifecycle visibility status must be ${expected}`);
}

const R1_LIFECYCLE_RESOURCE_ORIGIN = "https://phase6.invalid/";

function r1LifecycleResourceKey(resource) {
  if (!resource || typeof resource !== "object" || Array.isArray(resource)
    || !Number.isFinite(resource.startTime) || resource.startTime < 0) return null;
  try {
    const value = resource.url ?? resource.path;
    if (typeof value !== "string" || !value) return null;
    return `${new URL(value, R1_LIFECYCLE_RESOURCE_ORIGIN).href}\u0000${resource.startTime}`;
  } catch {
    return null;
  }
}

function r1CumulativeTelemetryFailures(before, after) {
  if (!before?.probe || !after?.probe || before.documentId !== after.documentId) return ["same-document-telemetry-unavailable"];
  const failures = [];
  for (const [section, field] of [
    ["raf", "scheduled"], ["raf", "executed"], ["raf", "cancelled"],
    ["intervals", "created"], ["intervals", "cleared"],
    ["blob", "created"], ["blob", "revoked"],
    ["listeners", "added"], ["listeners", "removed"], ["listeners", "duplicateAttempts"],
  ]) {
    if (after.probe?.[section]?.[field] < before.probe?.[section]?.[field]) failures.push(`${section}-${field}-counter-decreased`);
  }
  const beforeKeys = (before.probe.resources ?? []).map(r1LifecycleResourceKey);
  const afterKeys = new Set((after.probe.resources ?? []).map(r1LifecycleResourceKey));
  if (beforeKeys.includes(null) || afterKeys.has(null)) failures.push("resource-ledger-invalid");
  else if (beforeKeys.some((key) => !afterKeys.has(key))) failures.push("resource-observation-disappeared");
  return failures;
}

function r1ChronologicalSameDocumentPairs(snapshots) {
  const groups = new Map();
  snapshots.forEach((state, index) => {
    const group = groups.get(state.documentId) ?? [];
    group.push({ index, state });
    groups.set(state.documentId, group);
  });
  return [...groups.entries()].flatMap(([documentId, group]) => {
    group.sort((left, right) => left.state.capturedAtEpochMs - right.state.capturedAtEpochMs || left.index - right.index);
    return group.slice(1).map((item, index) => ({ after: item.state, before: group[index].state, documentId }));
  });
}

function collectR1LifecycleSnapshots(document) {
  const snapshots = [];
  const expectedOrigin = new URL(document.baseUrl).origin;
  const safeCounters = (record, keys) => record && keys.every((key) => Number.isSafeInteger(record[key]) && record[key] >= 0);
  const addSnapshot = (state, label) => {
    if (state == null) return;
    if (!state || typeof state !== "object" || Array.isArray(state)
      || typeof state.label !== "string" || !state.label
      || typeof state.documentId !== "string" || !state.documentId
      || state.origin !== expectedOrigin
      || typeof state.navigationId !== "string" || !state.navigationId || state.navigationId === "pre-navigation"
      || typeof state.url !== "string" || !state.url.startsWith("/")
      || !Number.isFinite(state.capturedAtEpochMs) || state.capturedAtEpochMs <= 0
      || !state.probe || typeof state.probe !== "object" || Array.isArray(state.probe)
      || state.probe.documentId !== state.documentId
      || !Number.isSafeInteger(state.probe.documentEventSequence) || state.probe.documentEventSequence < 0
      || !Array.isArray(state.probe.events)
      || !Array.isArray(state.probe.resources)
      || !r1ManifestoRevealLedgerValid(state)
      || !Number.isFinite(state.maximumScroll) || state.maximumScroll < 0
      || !Number.isFinite(state.scrollY) || state.scrollY < 0 || state.scrollY > state.maximumScroll) {
      throw new Error(`R1 persistent-lifecycle raw snapshot differs: ${label}`);
    }
    const lastSequenceByDocument = new Map();
    const lastTimeByDocument = new Map();
    for (const [eventIndex, event] of state.probe.events.entries()) {
      if (!event || typeof event !== "object" || Array.isArray(event)
        || typeof event.documentId !== "string" || !event.documentId
        || !Number.isSafeInteger(event.documentEventSequence) || event.documentEventSequence <= 0
        || !Number.isFinite(event.atEpochMs) || event.atEpochMs <= 0
        || typeof event.href !== "string" || !event.href
        || typeof event.type !== "string" || !event.type
        || typeof event.visibilityState !== "string" || !event.visibilityState
        || ![null, true, false].includes(event.persisted)
        || (event.synthetic != null && typeof event.synthetic !== "boolean")) {
        throw new Error(`R1 persistent-lifecycle raw event differs: ${label}[${eventIndex}]`);
      }
      let eventUrl;
      try { eventUrl = new URL(event.href); } catch { throw new Error(`R1 persistent-lifecycle raw event URL differs: ${label}[${eventIndex}]`); }
      const previousSequence = lastSequenceByDocument.get(event.documentId) ?? 0;
      const previousTime = lastTimeByDocument.get(event.documentId) ?? 0;
      if (event.documentEventSequence <= previousSequence
        || event.atEpochMs < previousTime
        || eventUrl.protocol !== "https:" || eventUrl.origin !== expectedOrigin
        || (event.documentId === state.documentId && event.documentEventSequence > state.probe.documentEventSequence)
        || event.atEpochMs > state.capturedAtEpochMs) {
        throw new Error(`R1 persistent-lifecycle raw event sequence differs: ${label}[${eventIndex}]`);
      }
      lastSequenceByDocument.set(event.documentId, event.documentEventSequence);
      lastTimeByDocument.set(event.documentId, event.atEpochMs);
    }
    const listeners = state.probe.listeners;
    const activeByType = listeners?.activeByType;
    const raf = state.probe.raf;
    const intervals = state.probe.intervals;
    const blob = state.probe.blob;
    if (!safeCounters(listeners, ["active", "added", "removed", "duplicateAttempts"])
      || !activeByType || typeof activeByType !== "object" || Array.isArray(activeByType)
      || Object.values(activeByType).some((value) => !Number.isSafeInteger(value) || value < 0)
      || listeners.active !== Object.values(activeByType).reduce((sum, value) => sum + value, 0)
      || listeners.active !== listeners.added - listeners.removed
      || !safeCounters(raf, ["scheduled", "executed", "cancelled", "active"])
      || raf.active !== raf.scheduled - raf.executed - raf.cancelled
      || !safeCounters(intervals, ["created", "cleared", "active"])
      || intervals.active !== intervals.created - intervals.cleared
      || !safeCounters(blob, ["created", "revoked", "live"])
      || blob.live !== blob.created - blob.revoked) {
      throw new Error(`R1 persistent-lifecycle raw counter telemetry differs: ${label}`);
    }
    snapshots.push(state);
  };
  for (const stateKey of R1_HISTORY_STATES) addSnapshot(document.history?.states?.[stateKey], `history.${stateKey}`);
  for (const transitionField of Object.values(R1_VISIBILITY_TRANSITIONS)) {
    const transition = document.visibility?.[transitionField];
    if (transition == null) continue;
    for (const stateKey of ["before", "hidden", "visible"]) addSnapshot(transition?.[stateKey], `visibility.${transitionField}.${stateKey}`);
  }
  addSnapshot(document.visibility?.retryActive, "visibility.retryActive");
  const canonicalHistoryEvents = document.history?.events;
  if (!Array.isArray(canonicalHistoryEvents)) throw new Error("R1 persistent-lifecycle canonical history event ledger differs");
  for (const stateKey of R1_HISTORY_STATES) {
    const snapshot = document.history.states[stateKey];
    const snapshotEvents = snapshot.probe.events;
    if (snapshotEvents.length > canonicalHistoryEvents.length
      || stableJson(snapshotEvents) !== stableJson(canonicalHistoryEvents.slice(0, snapshotEvents.length))
      || snapshotEvents.some((event) => Number.isFinite(event.atEpochMs)
        && Number.isFinite(snapshot.capturedAtEpochMs) && event.atEpochMs > snapshot.capturedAtEpochMs)
      || (snapshotEvents.length < canonicalHistoryEvents.length
        && Number.isFinite(canonicalHistoryEvents[snapshotEvents.length]?.atEpochMs)
        && Number.isFinite(snapshot.capturedAtEpochMs)
        && canonicalHistoryEvents[snapshotEvents.length].atEpochMs < snapshot.capturedAtEpochMs)) {
      throw new Error(`R1 persistent-lifecycle history event view differs: ${stateKey}`);
    }
  }
  const telemetryRegression = r1ChronologicalSameDocumentPairs(snapshots)
    .find(({ before, after }) => r1CumulativeTelemetryFailures(before, after).length > 0);
  if (telemetryRegression) {
    throw new Error(`R1 persistent-lifecycle cumulative telemetry differs: ${telemetryRegression.before.label} -> ${telemetryRegression.after.label}`);
  }
  return snapshots;
}

function r1ListenerSnapshot(state) {
  const listeners = state?.probe?.listeners;
  if (!listeners
    || !Number.isFinite(listeners.active)
    || !Number.isFinite(listeners.duplicateAttempts)
    || !listeners.activeByType
    || typeof listeners.activeByType !== "object"
    || Array.isArray(listeners.activeByType)) return null;
  return {
    active: listeners.active,
    activeByType: listeners.activeByType,
    added: listeners.added,
    duplicateAttempts: listeners.duplicateAttempts,
    removed: listeners.removed,
  };
}

function r1ListenerGrowth(before, after) {
  if (!before || !after) return ["listener-telemetry-unavailable"];
  const failures = [];
  if (after.active > before.active) failures.push("active-listener-count-grew");
  for (const [type, count] of Object.entries(after.activeByType)) {
    if (Number(count) > Number(before.activeByType[type] ?? 0)) failures.push(`active-${type}-listeners-grew`);
  }
  if (after.duplicateAttempts > before.duplicateAttempts) failures.push("duplicate-registration-attempted-during-restore");
  if (after.added < before.added) failures.push("listener-added-counter-decreased");
  if (after.removed < before.removed) failures.push("listener-removed-counter-decreased");
  if (after.duplicateAttempts < before.duplicateAttempts) failures.push("listener-duplicate-counter-decreased");
  return failures;
}

function deriveR1Listeners(document) {
  const snapshots = collectR1LifecycleSnapshots(document);
  const duplicateDocuments = [...new Map(snapshots
    .filter((state) => (state.probe?.listeners?.duplicateAttempts ?? 0) > 0)
    .map((state) => [state.documentId, {
      documentId: state.documentId,
      duplicateAttempts: state.probe.listeners.duplicateAttempts,
      label: state.label,
    }])).values()];
  const telemetryRegressions = r1ChronologicalSameDocumentPairs(snapshots).flatMap(({ before, after, documentId }) => {
    const failures = r1CumulativeTelemetryFailures(before, after);
    return failures.length ? [{ after: after.label, before: before.label, documentId, failures }] : [];
  });
  const candidatePairs = [
    ["bare-back", document.history?.states?.bareManifesto, document.history?.states?.bareBack],
    ["entry-back", document.history?.states?.entryResolved, document.history?.states?.entryBack],
    ...(document.visibility?.scenarios ?? [])
      .filter((scenario) => scenario.observation?.status === "PASS")
      .flatMap((scenario) => [
        [`${scenario.name}-hidden`, scenario.transition?.before, scenario.transition?.hidden],
        [`${scenario.name}-foreground`, scenario.transition?.hidden, scenario.transition?.visible],
      ]),
  ];
  const comparisons = candidatePairs.flatMap(([name, beforeState, afterState]) => {
    if (!beforeState?.documentId || beforeState.documentId !== afterState?.documentId) return [];
    const before = r1ListenerSnapshot(beforeState);
    const after = r1ListenerSnapshot(afterState);
    const failures = r1ListenerGrowth(before, after);
    return [{ name, documentId: beforeState.documentId, before, after, failures, stable: failures.length === 0 }];
  });
  const failed = duplicateDocuments.length > 0 || telemetryRegressions.length > 0 || comparisons.some(({ stable }) => !stable);
  return {
    status: failed ? "FAIL" : comparisons.length ? "PASS" : "NOT OBSERVED",
    duplicateDocuments,
    telemetryRegressions,
    comparisons,
  };
}

function validateR1Listeners(document, status) {
  const listeners = document.listeners;
  if (!Array.isArray(listeners?.duplicateDocuments) || !Array.isArray(listeners?.comparisons) || !Array.isArray(listeners?.telemetryRegressions)) throw new Error("R1 persistent-lifecycle listener evidence is incomplete");
  const derived = deriveR1Listeners(document);
  exactJson(listeners.duplicateDocuments, derived.duplicateDocuments, "R1 persistent-lifecycle duplicate-listener document ledger");
  exactJson(listeners.comparisons, derived.comparisons, "R1 persistent-lifecycle listener comparison ledger");
  exactJson(listeners.telemetryRegressions, derived.telemetryRegressions, "R1 persistent-lifecycle cumulative telemetry regression ledger");
  if (status !== derived.status) throw new Error(`R1 persistent-lifecycle listener status must be ${derived.status}`);
}

function r1Phase4MediaUrl(value) {
  try {
    const url = new URL(value, "https://phase6.invalid/");
    return /\/media\/cinematic\/phase-4r2\/media\/[^/]+\.mp4$/i.test(url.pathname) ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

function r1ValidByteRange(value) {
  if (typeof value !== "string" || !/^bytes=/i.test(value)) return false;
  const ranges = value.slice(value.indexOf("=") + 1).split(",");
  if (!ranges.length) return false;
  try {
    return ranges.every((range) => {
      const match = /^\s*(\d*)-(\d*)\s*$/.exec(range);
      if (!match || (!match[1] && !match[2])) return false;
      if (!match[1]) return BigInt(match[2]) > 0n;
      if (!match[2]) return true;
      return BigInt(match[1]) <= BigInt(match[2]);
    });
  } catch {
    return false;
  }
}

function r1AuthoritativePhase4Request(request, baseUrl) {
  try {
    const requestUrl = new URL(request.url);
    const documentUrl = new URL(request.documentUrl);
    const correlatedDocumentUrl = new URL(request.correlatedDocumentUrl);
    const expectedOrigin = new URL(baseUrl).origin;
    const documentRoute = `${documentUrl.pathname}${documentUrl.hash}`;
    return request.method === "GET"
      && request.resourceType === "fetch"
      && request.documentIdentityCorrelation === "CORRELATED"
      && typeof request.frameDocumentId === "string"
      && request.frameDocumentId.length > 0
      && Number.isSafeInteger(request.frameDocumentGeneration)
      && request.frameDocumentGeneration > 0
      && typeof request.frameNavigationId === "string"
      && request.frameNavigationId.length > 0
      && request.frameNavigationId !== "pre-navigation"
      && correlatedDocumentUrl.href === documentUrl.href
      && requestUrl.origin === expectedOrigin
      && documentUrl.origin === expectedOrigin
      && documentUrl.search === ""
      && ["/", "/#entry"].includes(documentRoute)
      && (request.range === null || r1ValidByteRange(request.range))
      && r1Phase4MediaUrl(requestUrl.href) === request.path;
  } catch {
    return false;
  }
}

function deriveR1MediaDocuments(document) {
  const snapshots = collectR1LifecycleSnapshots(document);
  const homeDocuments = new Map();
  for (const state of snapshots) {
    if (!state.home || !state.documentId) continue;
    if (state.probe?.resources != null && !Array.isArray(state.probe.resources)) {
      throw new Error(`R1 persistent-lifecycle raw resource ledger differs: ${state.label}`);
    }
    const homeDocument = homeDocuments.get(state.documentId) ?? {
      documentId: state.documentId,
      labels: new Set(),
      modes: new Set(),
      observations: new Set(),
      paths: new Set(),
      selectionDocumentUrl: null,
      selectionNavigationId: null,
      selectionStable: true,
      sourceObserved: false,
    };
    homeDocument.labels.add(state.label);
    if (typeof state.home.mode === "string") homeDocument.modes.add(state.home.mode);
    if (state.home.source?.hasSource === true) homeDocument.sourceObserved = true;
    for (const resource of state.probe?.resources ?? []) {
      const mediaUrl = r1Phase4MediaUrl(resource?.url ?? resource?.path);
      if (!mediaUrl) continue;
      if (!Number.isFinite(resource.startTime) || resource.startTime < 0) {
        throw new Error(`R1 persistent-lifecycle raw resource timing differs: ${state.label}`);
      }
      homeDocument.paths.add(mediaUrl);
      homeDocument.observations.add(`${mediaUrl}\u0000${Number(resource.startTime ?? -1)}`);
      let selectionDocumentUrl = null;
      try { selectionDocumentUrl = new URL(state.url, state.origin).href; } catch { /* invalidated below */ }
      if (homeDocument.selectionNavigationId === null) {
        homeDocument.selectionNavigationId = state.navigationId ?? null;
        homeDocument.selectionDocumentUrl = selectionDocumentUrl;
      } else if (homeDocument.selectionNavigationId !== state.navigationId || homeDocument.selectionDocumentUrl !== selectionDocumentUrl) {
        homeDocument.selectionStable = false;
      }
    }
    homeDocuments.set(state.documentId, homeDocument);
  }
  return [...homeDocuments.values()].map((homeDocument) => {
    const modes = [...homeDocument.modes].sort(lexicalCompare);
    const paths = [...homeDocument.paths].sort(lexicalCompare);
    const mediaExpected = modes.includes("enhanced") || (modes.length === 0 && paths.length > 0);
    return {
      documentId: homeDocument.documentId,
      labels: [...homeDocument.labels].sort(lexicalCompare),
      mediaExpected,
      modes,
      paths,
      resourceObservations: homeDocument.observations.size,
      selectionDocumentUrl: homeDocument.selectionDocumentUrl,
      selectionNavigationId: homeDocument.selectionNavigationId,
      selectionStable: homeDocument.selectionStable,
      sourceFree: !homeDocument.sourceObserved,
    };
  }).sort((left, right) => lexicalCompare(left.documentId, right.documentId));
}

function validateR1MediaRequests(document, status) {
  const media = document.mediaRequests;
  if (![media?.expectedPhase4Present, media?.bypassDocumentsSourceFree, media?.noDuplicateSourceWithinDocument, media?.noDuplicateNonRangeRequests].every((value) => typeof value === "boolean")
    || !Array.isArray(media.documents) || !media.network || !Array.isArray(media.network.phase4Requests) || !Array.isArray(media.network.nonRangeSelections)) {
    throw new Error("R1 persistent-lifecycle media-request evidence is incomplete");
  }
  const derivedDocuments = deriveR1MediaDocuments(document);
  exactJson(media.documents, derivedDocuments, "R1 persistent-lifecycle media document ledger");
  const documentIds = new Set();
  for (const [index, record] of media.documents.entries()) {
    if (typeof record?.documentId !== "string" || !record.documentId || documentIds.has(record.documentId)
      || !Array.isArray(record.labels) || !Array.isArray(record.paths)
      || typeof record.mediaExpected !== "boolean" || !Array.isArray(record.modes) || typeof record.sourceFree !== "boolean"
      || !(record.selectionDocumentUrl === null || (typeof record.selectionDocumentUrl === "string" && record.selectionDocumentUrl.length > 0))
      || !(record.selectionNavigationId === null || (typeof record.selectionNavigationId === "string" && record.selectionNavigationId.length > 0 && record.selectionNavigationId !== "pre-navigation"))
      || typeof record.selectionStable !== "boolean"
      || !Number.isSafeInteger(record.resourceObservations) || record.resourceObservations < 0
      || record.resourceObservations < record.paths.length
      || new Set(record.paths).size !== record.paths.length
      || record.paths.some((requestPath) => r1Phase4MediaUrl(requestPath) !== requestPath)) {
      throw new Error(`R1 persistent-lifecycle media document ${index} evidence differs`);
    }
    documentIds.add(record.documentId);
  }
  const phase4Requests = media.network.phase4Requests;
  if (phase4Requests.some((request) => !request || r1Phase4MediaUrl(request.path) === null)) {
    throw new Error("R1 persistent-lifecycle raw Phase 4 request ledger differs");
  }
  const expectedDocuments = media.documents.filter(({ mediaExpected }) => mediaExpected);
  const enhancedMediaDocuments = media.documents.filter(({ modes }) => modes.includes("enhanced"));
  const bypassDocuments = media.documents.filter(({ mediaExpected }) => !mediaExpected);
  const bypassDocumentsSourceFree = bypassDocuments.every(({ modes, paths, sourceFree }) => (
    modes.length === 1 && modes[0] === "static" && paths.length === 0 && sourceFree
  ));
  const noDuplicateSourceWithinDocument = media.documents.length > 0 && media.documents.every(({ mediaExpected, paths }) => (
    mediaExpected ? paths.length === 1 : paths.length === 0
  ));
  const uniquePaths = [...new Set(phase4Requests.map(({ path: requestPath }) => r1Phase4MediaUrl(requestPath)))].sort(lexicalCompare);
  const selectedPaths = [...new Set(media.documents.flatMap(({ paths }) => paths))].sort(lexicalCompare);
  const selectedPathsMatchNetwork = stableJson(selectedPaths) === stableJson(uniquePaths);
  const selectingDocumentsByPath = new Map();
  for (const record of media.documents) {
    for (const selectedPath of record.paths) selectingDocumentsByPath.set(selectedPath, (selectingDocumentsByPath.get(selectedPath) ?? 0) + 1);
  }
  const expectedSelectionNavigationIds = expectedDocuments.map(({ selectionNavigationId }) => selectionNavigationId);
  const selectionKeys = new Map();
  const documentUrlsByNavigationId = new Map();
  for (const record of expectedDocuments) {
    const documentUrls = documentUrlsByNavigationId.get(record.selectionNavigationId) ?? new Set();
    documentUrls.add(record.selectionDocumentUrl);
    documentUrlsByNavigationId.set(record.selectionNavigationId, documentUrls);
    for (const selectedPath of record.paths) {
      const key = `${record.documentId}\u0000${selectedPath}`;
      const selection = selectionKeys.get(key) ?? {
        count: 0,
        documentUrl: record.selectionDocumentUrl,
        navigationId: record.selectionNavigationId,
      };
      selection.count += 1;
      if (selection.documentUrl !== record.selectionDocumentUrl) selection.documentUrl = null;
      if (selection.navigationId !== record.selectionNavigationId) selection.navigationId = null;
      selectionKeys.set(key, selection);
    }
  }
  const documentIdsByPath = new Map();
  const nonRangeRequestsByDocumentPath = new Map();
  const documentIdsByGeneration = new Map();
  for (const request of phase4Requests) {
    const requestPath = r1Phase4MediaUrl(request.path);
    const documentIdsForPath = documentIdsByPath.get(requestPath) ?? new Set();
    documentIdsForPath.add(request.frameDocumentId);
    documentIdsByPath.set(requestPath, documentIdsForPath);
    const generationDocumentIds = documentIdsByGeneration.get(request.frameDocumentGeneration) ?? new Set();
    generationDocumentIds.add(request.frameDocumentId);
    documentIdsByGeneration.set(request.frameDocumentGeneration, generationDocumentIds);
    if (!r1ValidByteRange(request.range)) {
      const key = `${request.frameDocumentId}\u0000${requestPath}`;
      nonRangeRequestsByDocumentPath.set(key, (nonRangeRequestsByDocumentPath.get(key) ?? 0) + 1);
    }
  }
  const requestAuthorityValid = phase4Requests.every((request) => r1AuthoritativePhase4Request(request, document.baseUrl));
  const documentCoverageValid = expectedSelectionNavigationIds.every((navigationId) => typeof navigationId === "string" && navigationId.length > 0 && navigationId !== "pre-navigation")
    && expectedDocuments.length === enhancedMediaDocuments.length
    && expectedDocuments.every(({ selectionDocumentUrl, selectionStable }) => typeof selectionDocumentUrl === "string" && selectionDocumentUrl.length > 0 && selectionStable)
    && [...documentUrlsByNavigationId.values()].every((documentUrls) => documentUrls.size === 1)
    && [...documentIdsByGeneration.values()].every((documentIdsForGeneration) => documentIdsForGeneration.size === 1)
    && selectionKeys.size === expectedDocuments.length
    && [...selectionKeys.values()].every(({ count, documentUrl, navigationId }) => count === 1
      && typeof documentUrl === "string"
      && typeof navigationId === "string")
    && phase4Requests.every((request) => {
      const selection = selectionKeys.get(`${request.frameDocumentId}\u0000${r1Phase4MediaUrl(request.path)}`);
      try {
        return selection?.count === 1
          && request.frameNavigationId === selection.navigationId
          && new URL(request.documentUrl).href === selection.documentUrl;
      }
      catch { return false; }
    })
    && [...selectionKeys.keys()].every((key) => phase4Requests.some((request) => `${request.frameDocumentId}\u0000${r1Phase4MediaUrl(request.path)}` === key))
    && selectedPaths.every((selectedPath) => documentIdsByPath.get(selectedPath)?.size === selectingDocumentsByPath.get(selectedPath));
  const expectedPhase4Present = expectedDocuments.length > 0
    && expectedDocuments.every(({ paths }) => paths.length >= 1)
    && phase4Requests.length >= 1
    && selectedPathsMatchNetwork
    && requestAuthorityValid
    && documentCoverageValid;
  const nonRangeRequestsByPath = new Map();
  for (const request of phase4Requests) {
    if (r1ValidByteRange(request.range)) continue;
    const requestPath = r1Phase4MediaUrl(request.path);
    nonRangeRequestsByPath.set(requestPath, (nonRangeRequestsByPath.get(requestPath) ?? 0) + 1);
  }
  const nonRangeSelections = [...nonRangeRequestsByPath.entries()].map(([requestPath, count]) => ({
    path: requestPath,
    count,
    logicalHomeDocuments: selectingDocumentsByPath.get(requestPath) ?? 0,
  })).sort((left, right) => lexicalCompare(left.path, right.path));
  exactJson(media.network.nonRangeSelections, nonRangeSelections, "R1 persistent-lifecycle non-range media selection ledger");
  const networkSummary = {
    requestCount: phase4Requests.length,
    rangeRequestCount: phase4Requests.filter(({ range }) => r1ValidByteRange(range)).length,
    nonRangeRequestCount: phase4Requests.filter(({ range }) => !r1ValidByteRange(range)).length,
    uniquePaths,
  };
  for (const [field, expectedValue] of Object.entries(networkSummary)) {
    if (stableJson(media.network[field]) !== stableJson(expectedValue)) throw new Error(`R1 persistent-lifecycle network ${field} contradicts raw Phase 4 requests`);
  }
  const noDuplicateNonRangeRequests = nonRangeSelections.every(({ count, logicalHomeDocuments }) => count <= logicalHomeDocuments)
    && [...nonRangeRequestsByDocumentPath.values()].every((count) => count <= 1);
  if (media.expectedPhase4Present !== expectedPhase4Present) throw new Error("R1 persistent-lifecycle expectedPhase4Present contradicts raw documents/requests");
  if (media.bypassDocumentsSourceFree !== bypassDocumentsSourceFree) throw new Error("R1 persistent-lifecycle bypassDocumentsSourceFree contradicts raw static Home documents");
  if (media.noDuplicateSourceWithinDocument !== noDuplicateSourceWithinDocument) throw new Error("R1 persistent-lifecycle noDuplicateSourceWithinDocument contradicts raw document selections");
  if (media.noDuplicateNonRangeRequests !== noDuplicateNonRangeRequests) throw new Error("R1 persistent-lifecycle noDuplicateNonRangeRequests contradicts raw non-range selections");
  const expected = expectedPhase4Present && bypassDocumentsSourceFree && noDuplicateSourceWithinDocument && noDuplicateNonRangeRequests ? "PASS" : "FAIL";
  if (status !== expected) throw new Error(`R1 persistent-lifecycle media-request status must be ${expected}`);
}

export function validateR1PersistentLifecycle(document, record, metadata) {
  if (document?.schema !== R1_PERSISTENT_LIFECYCLE_SCHEMA
    || record.engine !== "chromium"
    || document.browser?.engine !== "chromium"
    || document.browser?.headed !== true
    || document.browser?.persistentProfile !== true
    || typeof document.browser?.version !== "string" || !document.browser.version.trim()
    || ![metadata.deployment?.immutableUrl, metadata.deployment?.branchUrl].includes(document.baseUrl)) {
    throw new Error("R1 persistent-lifecycle schema/browser/origin authority differs");
  }
  validateIsoTimestamp(document.createdAt, "R1 persistent-lifecycle createdAt");
  const history = lifecycleComponentStatus(document.history, "history", ["PASS", "FAIL"]);
  const bfcache = lifecycleComponentStatus(document.bfcache, "BFCache", ["PASS", "FAIL", "NOT OBSERVED"]);
  const visibility = lifecycleComponentStatus(document.visibility, "visibility", ["PASS", "FAIL", "NOT OBSERVED"]);
  const listeners = lifecycleComponentStatus(document.listeners, "listeners", ["PASS", "FAIL", "NOT OBSERVED"]);
  const mediaRequests = lifecycleComponentStatus(document.mediaRequests, "media requests", ["PASS", "FAIL"]);
  const cleanup = lifecycleComponentStatus(document.profileCleanup, "profile cleanup", ["PASS", "FAIL"]);
  if (stableJson(document.history?.bfcache) !== stableJson(document.bfcache)) throw new Error("R1 persistent-lifecycle BFCache authority is duplicated inconsistently");
  validateR1History(document, history);
  validateR1Bfcache(document, bfcache);
  validateR1Visibility(document, visibility);
  validateR1Listeners(document, listeners);
  validateR1MediaRequests(document, mediaRequests);
  if (document.browser.profileRetained !== document.profileCleanup.profileRetained
    || !Array.isArray(document.profileCleanup.errors)
    || (cleanup === "PASS" && (document.profileCleanup.deletionVerified !== true || document.profileCleanup.profileRetained !== false || document.profileCleanup.errors.length))) {
    throw new Error("R1 persistent-profile cleanup authority differs");
  }
  const componentStatuses = [history, bfcache, visibility, listeners, mediaRequests, cleanup];
  const expectedStatus = componentStatuses.includes("FAIL")
    ? "FAIL"
    : componentStatuses.some((status) => status === "NOT OBSERVED" || status === "LIMITATION")
      ? "LIMITATION"
      : "PASS";
  if (document.status !== expectedStatus || record.status !== expectedStatus) throw new Error(`R1 persistent-lifecycle top-level status must be ${expectedStatus}`);
  return document;
}

const ZOOM_ROUTE_CHECKS = Object.freeze([
  "completeH1",
  "completeOpeningProposition",
  "readableNavigation",
  "usableMobileMenuWhereApplicable",
  "noTextClipping",
  "noInternalWordSplitting",
  "noHiddenContent",
  "noHorizontalOverflow",
  "usableControlsAndLinks",
  "reasonableDocumentContinuation",
]);
const ZOOM_ROUTE_OUTCOMES = Object.freeze([
  "/",
  "/for-partners/",
  "/for-startups/",
  "/industries/",
  "/pocs/",
  "/pocs/maradin/",
  "/spark/",
  "/about/",
  "/contact/",
  "/__phase6-intentional-404__/",
]);

function validateFailureReferences(record, label, failedChecks = []) {
  if (!Array.isArray(record.failureReferences)) throw new Error(`${label} failureReferences must be an array`);
  const invalid = record.failureReferences.some((reference) => !reference || typeof reference !== "object" || Array.isArray(reference)
    || typeof reference.check !== "string" || !reference.check.trim()
    || (![reference.timestamp, reference.frame].some((value) => (typeof value === "string" && value.trim()) || Number.isFinite(value))
      && !Number.isFinite(reference.timestampSeconds)));
  if (invalid) throw new Error(`${label} failureReference requires a check identifier and timestamp or frame`);
  if (record.status === "FAIL" && !record.failureReferences.length) throw new Error(`${label} FAIL requires a timestamp or frame reference for every recorded failure`);
  if (record.status !== "FAIL" && record.failureReferences.length) throw new Error(`${label} non-FAIL cannot contain failure references`);
  for (const check of failedChecks) {
    if (!record.failureReferences.some((reference) => reference.check === check)) throw new Error(`${label} false check ${check} requires a failureReference with the same check identifier and timestamp/frame`);
  }
  if (failedChecks.length) {
    const allowed = new Set(failedChecks);
    if (record.failureReferences.some((reference) => !allowed.has(reference.check))) throw new Error(`${label} failureReference identifies a check that is not false`);
  }
}

export function validateHumanEvidenceLedger(document) {
  if (document?.schema !== HUMAN_EVIDENCE_SCHEMA || document.evidenceClass !== "HUMAN DEVICE EVIDENCE" || document.rootExists !== true
    || !Array.isArray(document.entries) || !Array.isArray(document.requiredFilenames) || !Array.isArray(document.missingFilenames) || document.missingFilenames.length) throw new Error("physical-device human-evidence ledger authority differs");
  validateIsoTimestamp(document.createdAt, "physical-device ledger createdAt");
  if (stableJson(document.policy) !== stableJson(HUMAN_EVIDENCE_POLICY)) throw new Error("physical-device ledger policy authority differs");
  if (stableJson(document.requiredFilenames) !== stableJson(REQUIRED_HUMAN_EVIDENCE_FILES)) throw new Error("physical-device ledger required filename authority differs");
  const filenames = document.entries.map(({ filename }) => filename);
  if (stableJson(filenames) !== stableJson(REQUIRED_HUMAN_EVIDENCE_FILES)) throw new Error("physical-device human-evidence ledger omits, reorders or duplicates a required recording");
  for (const [index, record] of document.entries.entries()) {
    const label = `entries[${index}]`;
    const status = normalizeEvidenceStatus(record?.status);
    if (!record || status !== record.status || !["PASS", "FAIL", "PENDING HUMAN REVIEW"].includes(status)
      || !HASH64.test(record.sha256 ?? "") || !Number.isSafeInteger(record.byteSize) || record.byteSize <= 0
      || record.evidenceClass !== "PHYSICAL HUMAN RECORDING") throw new Error(`${label} is incomplete`);
    validateReviewEntry(record, record.filename, record);
  }
  const expectedStatus = aggregateEvidenceStatuses(document.entries.map(({ status }) => status), "PENDING HUMAN REVIEW");
  if (document.status !== expectedStatus) throw new Error(`physical-device ledger status must be ${expectedStatus}`);
  return document;
}

function statusAt(value) {
  return normalizeEvidenceStatus(value?.status ?? value);
}

function lifecycleEventUrl(event) {
  const value = event?.documentUrl ?? event?.href;
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function hasRealPersistedEventPair(events) {
  if (!Array.isArray(events)) return false;
  const pendingHides = new Map();
  for (const event of events) {
    if (!event || !["pagehide", "pageshow"].includes(event.type) || event.synthetic === true) continue;
    const eventUrl = lifecycleEventUrl(event);
    if (!eventUrl) continue;
    const identity = typeof event.documentId === "string" && event.documentId
      ? `document:${event.documentId}`
      : `url:${eventUrl}`;
    if (event.type === "pagehide") {
      if (event.persisted === true) pendingHides.set(identity, { event, eventUrl });
      else pendingHides.delete(identity);
      continue;
    }
    const hide = pendingHides.get(identity);
    pendingHides.delete(identity);
    if (event.persisted === true && hide?.event?.persisted === true && hide.eventUrl === eventUrl) return true;
  }
  return false;
}

function legacyHistoryEventSeries(history) {
  const series = [];
  if (Array.isArray(history?.events)) series.push(history.events);
  if (Array.isArray(history?.bfcache?.events)) series.push(history.bfcache.events);
  if (Array.isArray(history?.directEntry?.lifecycle)) series.push(history.directEntry.lifecycle);
  if (history?.states && typeof history.states === "object" && !Array.isArray(history.states)) {
    for (const state of Object.values(history.states)) if (Array.isArray(state?.lifecycle)) series.push(state.lifecycle);
  }
  return series;
}

function legacyHistories(document) {
  const histories = [];
  if (document?.history && typeof document.history === "object" && !Array.isArray(document.history)) histories.push(document.history);
  if (Array.isArray(document?.history)) histories.push(...document.history.filter((history) => history && typeof history === "object" && !Array.isArray(history)));
  if (Array.isArray(document?.engines)) {
    for (const engine of document.engines) {
      if (engine?.history && typeof engine.history === "object" && !Array.isArray(engine.history)) histories.push(engine.history);
    }
  }
  return histories;
}

function validateLegacyBfcacheObservations(document, label) {
  if (statusAt(document?.bfcache) === "PASS" && !legacyHistoryEventSeries(document).some(hasRealPersistedEventPair)) {
    throw new Error(`${label} top-level BFCache PASS requires a real ordered pagehide.persisted/pageshow.persisted event pair`);
  }
  for (const history of legacyHistories(document)) {
    if (statusAt(history.bfcache) === "PASS" && !legacyHistoryEventSeries(history).some(hasRealPersistedEventPair)) {
      throw new Error(`${label} BFCache PASS requires a real ordered pagehide.persisted/pageshow.persisted event pair`);
    }
  }
}

function hasOrderedVisibilityTransition(events) {
  if (!Array.isArray(events)) return false;
  const hiddenIndex = events.findIndex((event) => event?.type === "visibilitychange" && event.visibilityState === "hidden" && event.synthetic !== true);
  return hiddenIndex >= 0 && events.slice(hiddenIndex + 1).some((event) => event?.type === "visibilitychange" && event.visibilityState === "visible" && event.synthetic !== true);
}

function validatePerformanceVisibilityObservation(document) {
  const visibility = document?.visibility;
  if (statusAt(visibility) !== "PASS") return;
  const transitionObserved = Object.hasOwn(visibility, "transitionObserved")
    ? visibility.transitionObserved
    : visibility.hiddenObserved;
  const stateSequenceObserved = visibility.beforeBackground?.visibilityState === "visible"
    && visibility.whileBackground?.visibilityState === "hidden"
    && visibility.afterForeground?.visibilityState === "visible";
  if (transitionObserved !== true || !hasOrderedVisibilityTransition(visibility.events) || !stateSequenceObserved) {
    throw new Error("performance visibility PASS requires an observed real visible-hidden-visible transition and ordered visibilitychange events");
  }
}

function documentBfcacheStatuses(document) {
  const candidates = [document?.bfcache, document?.history?.bfcache];
  if (Array.isArray(document?.history)) candidates.push(...document.history.map((item) => item?.bfcache));
  if (Array.isArray(document?.engines)) candidates.push(...document.engines.map((engine) => engine?.history?.bfcache));
  return candidates.map(statusAt).filter(Boolean);
}

function documentVisibilityStatuses(document) {
  return [document?.visibility].map(statusAt).filter(Boolean);
}

function includes720By450Proxy(value) {
  if (!value || typeof value !== "object") return false;
  if (value.width === 720 && value.height === 450) return true;
  if (typeof value.id === "string" && /720\s*[x×]\s*450/i.test(value.id)) return true;
  return Object.values(value).some(includes720By450Proxy);
}

export function evidenceTaxonomy(record, document) {
  const sourceStatus = normalizeEvidenceStatus(document?.status);
  const bfcacheRoles = new Set(["history-bfcache-summary", "performance-summary", "r1-persistent-lifecycle-summary"]);
  const visibilityRoles = new Set(["performance-summary", "r1-persistent-lifecycle-summary"]);
  const taxonomy = {
    artifactStatus: record.status,
    sourceStatus,
    bfcache: bfcacheRoles.has(record.role) ? documentBfcacheStatuses(document) : [],
    visibility: visibilityRoles.has(record.role) ? documentVisibilityStatuses(document) : [],
  };
  if (record.role === "accessibility-summary" || record.role === "accessibility-interaction-limitation") {
    const engineResults = Array.isArray(document?.engines) ? document.engines : [];
    const fullInteraction = document?.axeOnly !== true;
    const interactionStatus = record.role === "accessibility-interaction-limitation" ? record.status : sourceStatus;
    const keyboardObserved = fullInteraction && engineResults.some((engine) => Array.isArray(engine?.keyboard) && engine.keyboard.length > 0);
    const mobileMenuObserved = fullInteraction && engineResults.some((engine) => engine?.mobileMenu && typeof engine.mobileMenu === "object");
    taxonomy.accessibility = {
      axe: sourceStatus,
      axeOnly: document?.axeOnly === true,
      proxy720x450: includes720By450Proxy(document),
      keyboard: record.role === "accessibility-interaction-limitation" ? record.status : (keyboardObserved ? interactionStatus : "NOT OBSERVED"),
      focus: record.role === "accessibility-interaction-limitation" ? record.status : (keyboardObserved ? interactionStatus : "NOT OBSERVED"),
      mobileMenu: record.role === "accessibility-interaction-limitation" ? record.status : (mobileMenuObserved ? interactionStatus : "NOT OBSERVED"),
    };
  }
  if (record.role === "supplemental-reflow-proxy") {
    taxonomy.accessibility = {
      proxy720x450: includes720By450Proxy(document),
      supplementalOnly: true,
    };
  }
  if (record.role === "physical-device-result") {
    const ledger = validateHumanEvidenceLedger(document);
    const zoom = ledger.entries.find(({ filename }) => filename === "chrome-200-percent.mp4");
    const zoomStatuses = Array.isArray(zoom.routeOutcomes) ? zoom.routeOutcomes.map(({ status }) => status) : ["PENDING HUMAN REVIEW"];
    const opening = ledger.entries.find(({ filename }) => filename === "iphone-safari-opening.mp4");
    const maradin = ledger.entries.find(({ filename }) => filename === "iphone-safari-maradin.mp4");
    const safariLifecycleResults = [
      opening?.checks?.backgroundForeground,
      maradin?.checks?.backgroundForeground,
      maradin?.checks?.retryableSourceFree,
      maradin?.checks?.noPersistentRafOrInterval,
      maradin?.checks?.noLiveOrphanBlob,
    ];
    const hiddenVisible = safariLifecycleResults.some((result) => result === false)
      ? "FAIL"
      : safariLifecycleResults.every((result) => result === true)
        ? "PASS"
        : "PENDING HUMAN REVIEW";
    taxonomy.humanEvidence = {
      status: ledger.status,
      verified: false,
      recordings: ledger.entries.map(({ filename, sha256: hash, byteSize, mediaValidation, reviewedSha256, reviewedByteSize, status, checks = null }) => ({
        filename,
        sha256: hash,
        byteSize,
        mediaValidation,
        reviewedSha256,
        reviewedByteSize,
        status,
        checks,
      })),
      browserZoom: aggregateEvidenceStatuses(zoomStatuses, "PENDING HUMAN REVIEW"),
      hiddenVisible,
    };
  }
  return taxonomy;
}

function validateAccessibilityInteractionMatrix(document, engine) {
  validateAccessibilityReport(document);
  const expectedRoutes = PHASE6_ROUTES.map(({ expectedStatus, id, path: routePath }) => ({ expectedStatus, id, path: routePath }));
  if (!Array.isArray(document.routes) || stableJson(document.routes) !== stableJson(expectedRoutes)) throw new Error(`accessibility exact ten-route inventory differs: ${engine}`);
  if (document.axeOnly === true) return;
  const result = document.engines[0];
  const keyboard = result.keyboard;
  const routeIds = Array.isArray(keyboard) ? keyboard.map(({ route }) => route) : [];
  const expectedRouteIds = PHASE6_ROUTES.map(({ id }) => id);
  if (document.axeOnly !== false
    || result.status !== "PASS"
    || !Array.isArray(result.failures) || result.failures.length
    || !Array.isArray(keyboard) || keyboard.length !== expectedRouteIds.length
    || stableJson([...routeIds].sort(lexicalCompare)) !== stableJson([...expectedRouteIds].sort(lexicalCompare))
    || keyboard.some((entry) => entry?.status !== "PASS" || !Array.isArray(entry.failures) || entry.failures.length)
    || result.summary?.keyboardCases !== expectedRouteIds.length) {
    throw new Error(`accessibility keyboard/focus matrix differs: ${engine}`);
  }
  const menu = result.mobileMenu;
  if (menu?.status !== "PASS" || !Array.isArray(menu.cycles) || menu.cycles.length !== 4 || !Array.isArray(menu.failures) || menu.failures.length) {
    throw new Error(`accessibility mobile-menu four-cycle authority differs: ${engine}`);
  }
  const history = result.history;
  if (history?.status !== "PASS" || !Array.isArray(history.failures) || history.failures.length) throw new Error(`accessibility history authority differs: ${engine}`);
}

const R1_NODE22_REQUIRED_OUTCOMES = Object.freeze([
  "npm-ci",
  "astro-check",
  "production-build",
  "complete-postbuild-test-suite",
  "phase4-source-verification",
  "phase5b-phase6-r1-focused-regression",
  "standalone-verifier-self-tests",
]);

function validateBoundNode22Text(text, expectedSha256, label) {
  if (typeof text !== "string" || !text.length || Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024
    || !HASH64.test(expectedSha256 ?? "") || sha256(Buffer.from(text, "utf8")) !== expectedSha256) {
    throw new Error(`R1 Node 22 embedded ${label} hash binding differs`);
  }
  return text;
}

function validateEmbeddedDistManifest(text, expectedSha256, label) {
  validateBoundNode22Text(text, expectedSha256, `${label} dist manifest`);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.shift() !== '"path","bytes","sha256"' || !lines.length) throw new Error(`R1 Node 22 ${label} dist manifest header/inventory differs`);
  const paths = new Set();
  const records = [];
  let previous = null;
  let bytes = 0;
  for (const line of lines) {
    const match = /^"([^"]+)","([0-9]+)","([a-f0-9]{64})"$/.exec(line);
    if (!match) throw new Error(`R1 Node 22 ${label} dist manifest row differs`);
    const [, entryPath, byteText, entrySha256] = match;
    const byteSize = Number(byteText);
    if (!entryPath || entryPath.startsWith("/") || entryPath.includes("\\") || entryPath.split("/").includes("..")
      || !Number.isSafeInteger(byteSize) || byteSize < 0 || paths.has(entryPath)
      || (previous !== null && previous.localeCompare(entryPath) >= 0)) {
      throw new Error(`R1 Node 22 ${label} dist manifest path/size order differs`);
    }
    paths.add(entryPath);
    records.push({ relativePath: entryPath, bytes: byteSize, sha256: entrySha256 });
    previous = entryPath;
    bytes += byteSize;
    if (!Number.isSafeInteger(bytes)) throw new Error(`R1 Node 22 ${label} dist manifest byte total differs`);
  }
  return { files: lines.length, bytes, records };
}

export function validateR1Node22Validation(document, metadata) {
  if (!isR1Node22ValidationSchema(document?.schema) || document.status !== "PASS") throw new Error("R1 Node 22 validation schema/status differs");
  validateIsoTimestamp(document.sealedAtUtc, "R1 Node 22 sealedAtUtc");
  const repository = document.repository;
  if (!repository
    || repository.branch !== R1_REQUIRED_BRANCH
    || repository.requiredParent !== R1_REQUIRED_PARENT
    || repository.finalHead !== metadata.repository.finalHead
    || repository.finalTree !== metadata.repository.finalTree
    || repository.finalHeadDirectParent !== metadata.repository.directParent
    || repository.captureHeadBeforeFinalCommit !== repository.finalHeadDirectParent
    || repository.main !== FROZEN_MAIN
    || repository.originMain !== FROZEN_MAIN
    || repository.workingTreeCleanAtSeal !== true
    || repository.productionDiff?.base !== R1_REQUIRED_PARENT
    || stableJson(repository.productionDiff?.scope) !== stableJson(["src/**", "public/**"])
    || repository.productionDiff?.changedPathCount !== 0
    || repository.productionDiff?.status !== "ZERO PRODUCTION-SOURCE DIFF"
    || repository.packageLock?.changedLinesFromRequiredParent !== 0
    || !HASH64.test(repository.packageLock?.sha256 ?? "")) throw new Error("R1 Node 22 repository/tree/zero-production authority differs");
  const runtime = document.runtime;
  if (runtime?.nvmrc !== "22.16.0" || runtime.node !== "v22.16.0" || !/^\d+\.\d+\.\d+$/.test(runtime.npm ?? "")
    || runtime.node24ComparisonRuntime !== "v24.18.0" || !/^\d+\.\d+\.\d+$/.test(runtime.node24ComparisonNpm ?? "")) throw new Error("R1 Node/npm runtime authority differs");
  if (!Array.isArray(document.outcomes)) throw new Error("R1 Node 22 outcome inventory is missing");
  if (stableJson(document.outcomes.map(({ id }) => id)) !== stableJson(R1_NODE22_REQUIRED_OUTCOMES)) {
    throw new Error("R1 Node 22 outcome inventory must contain exactly the required outcomes in canonical order");
  }
  const byId = new Map();
  for (const outcome of document.outcomes) {
    if (!outcome || typeof outcome.id !== "string" || byId.has(outcome.id)) throw new Error("R1 Node 22 outcome inventory is duplicated or malformed");
    byId.set(outcome.id, outcome);
  }
  for (const id of R1_NODE22_REQUIRED_OUTCOMES) {
    const outcome = byId.get(id);
    if (!outcome || outcome.status !== "PASS" || !HASH64.test(outcome.logSha256 ?? "") || typeof outcome.log !== "string" || !outcome.log.trim()) throw new Error(`R1 Node 22 required outcome is incomplete: ${id}`);
    validateBoundNode22Text(outcome.logText, outcome.logSha256, `${id} log`);
  }
  const npmCi = byId.get("npm-ci");
  if (npmCi.command !== "npm ci" || !Number.isSafeInteger(npmCi.packagesInstalled) || npmCi.packagesInstalled <= 0) throw new Error("R1 Node 22 npm-ci outcome differs");
  const astro = byId.get("astro-check");
  if (!/astro check/.test(astro.command ?? "") || astro.errors !== 0 || astro.warnings !== 0) throw new Error("R1 Node 22 Astro check outcome differs");
  const build = byId.get("production-build");
  if (build.command !== "npm run build" || build.phase4OutputVerification !== "PASS" || build.phase5bProductionVerification !== "PASS") throw new Error("R1 Node 22 production-build outcome differs");
  for (const id of ["complete-postbuild-test-suite", "phase5b-phase6-r1-focused-regression"]) {
    const outcome = byId.get(id);
    if (!Number.isSafeInteger(outcome.tests) || outcome.tests <= 0 || outcome.passed !== outcome.tests || outcome.failed !== 0 || outcome.cancelled !== 0 || outcome.skipped !== 0 || outcome.todo !== 0) throw new Error(`R1 Node 22 complete test outcome differs: ${id}`);
  }
  const phase4 = byId.get("phase4-source-verification");
  if (!/verify-phase4-source\.mjs/.test(phase4.command ?? "") || !Number.isSafeInteger(phase4.stagedPhase4RuntimeFiles) || phase4.stagedPhase4RuntimeFiles <= 0) throw new Error("R1 Node 22 Phase 4 verification outcome differs");
  const standalone = byId.get("standalone-verifier-self-tests");
  if (!Number.isSafeInteger(standalone.checks) || standalone.checks <= 0 || standalone.passed !== standalone.checks || standalone.failed !== 0 || !Array.isArray(standalone.checkNames) || standalone.checkNames.length !== standalone.checks) throw new Error("R1 Node 22 standalone self-test outcome differs");
  const comparison = document.distributionComparison;
  const node22Manifest = validateEmbeddedDistManifest(comparison?.node22?.manifestText, comparison?.node22?.manifestSha256, "Node 22");
  const node24Manifest = validateEmbeddedDistManifest(comparison?.node24?.manifestText, comparison?.node24?.manifestSha256, "Node 24");
  if (comparison?.status !== "BYTE-IDENTICAL" || comparison.differenceCount !== 0
    || !Number.isSafeInteger(comparison.node22?.files) || comparison.node22.files <= 0
    || comparison.node22.files !== comparison.node24?.files
    || !Number.isSafeInteger(comparison.node22?.bytes) || comparison.node22.bytes <= 0
    || comparison.node22.bytes !== comparison.node24?.bytes
    || !HASH64.test(comparison.node22?.manifestSha256 ?? "")
    || comparison.node22.manifestSha256 !== comparison.node24?.manifestSha256
    || comparison.node22.manifestText !== comparison.node24?.manifestText
    || node22Manifest.files !== comparison.node22.files || node22Manifest.bytes !== comparison.node22.bytes
    || node24Manifest.files !== comparison.node24.files || node24Manifest.bytes !== comparison.node24.bytes) throw new Error("R1 Node 22 versus Node 24 dist comparison is not byte-identical");
  const differencesText = validateBoundNode22Text(comparison.differencesText, comparison.differencesSha256, "Node 22 versus Node 24 differences");
  const differenceLines = differencesText.replace(/\r\n/g, "\n").split("\n").filter((line) => line.length);
  if (stableJson(differenceLines) !== stableJson(['"input","sideIndicator"'])) throw new Error("R1 Node 22 versus Node 24 differences ledger is not empty");
  validateBoundNode22Text(comparison.comparisonText, comparison.comparisonSha256, "Node 22 versus Node 24 comparison");
  if (!Array.isArray(document.limitations)) throw new Error("R1 Node 22 limitations ledger differs");
  return document;
}

function matchingR1HeaderPolicies(publicPath) {
  return Object.keys(REQUIRED_HEADER_POLICIES).filter((pattern) => {
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
    return pattern.endsWith("*") ? publicPath.startsWith(prefix) : publicPath === prefix;
  });
}

function expectedR1MimeTokens(relativePath) {
  return ({
    ".avif": ["image/avif"],
    ".css": ["text/css"],
    ".html": ["text/html"],
    ".ico": ["image/x-icon", "image/vnd.microsoft.icon"],
    ".jpeg": ["image/jpeg"],
    ".jpg": ["image/jpeg"],
    ".js": ["application/javascript", "text/javascript", "application/x-javascript"],
    ".json": ["application/json"],
    ".mjs": ["application/javascript", "text/javascript", "application/x-javascript"],
    ".mp4": ["video/mp4"],
    ".pdf": ["application/pdf"],
    ".png": ["image/png"],
    ".svg": ["image/svg+xml"],
    ".txt": ["text/plain"],
    ".wasm": ["application/wasm"],
    ".webm": ["video/webm"],
    ".webp": ["image/webp"],
    ".woff": ["font/woff", "application/font-woff"],
    ".woff2": ["font/woff2", "application/font-woff2"],
    ".xml": ["application/xml", "text/xml"],
  })[path.posix.extname(relativePath).toLowerCase()] ?? [];
}

function strictR1CacheControlDirectives(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} Cache-Control must be a primitive nonempty string`);
  const byName = new Map();
  for (const directive of value.toLowerCase().split(",").map((part) => part.trim()).filter(Boolean)) {
    const match = /^([a-z][a-z0-9-]*)(?:=(?:"[^"]*"|[^\s,]+))?$/.exec(directive);
    if (!match || byName.has(match[1])) throw new Error(`${label} Cache-Control contains an invalid, duplicate, or conflicting directive`);
    byName.set(match[1], directive);
  }
  if (!byName.size) throw new Error(`${label} Cache-Control contains no directives`);
  return byName;
}

function validateR1DeploymentRawParity(document, metadata) {
  const deploymentData = document.deployment?.data;
  if (!/^[1-9]\d*$/.test(metadata.deployment?.checkRunId ?? "")
    || deploymentData?.checkRunId !== metadata.deployment.checkRunId) {
    throw new Error("R1 deployment checkRunId is not independently bound to final metadata");
  }
  if (deploymentData.authoritySource !== "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK") {
    throw new Error("R1 deployment signed check authority source differs");
  }
  const completedAt = deploymentData.completedAt;
  const normalizedCompletedAt = typeof completedAt === "string" && Number.isFinite(Date.parse(completedAt))
    ? new Date(completedAt).toISOString()
    : null;
  if (!normalizedCompletedAt || ![normalizedCompletedAt, normalizedCompletedAt.replace(/\.000Z$/, "Z")].includes(completedAt)) {
    throw new Error("R1 deployment completedAt must be a canonical UTC timestamp");
  }

  const dist = document.dist;
  if (dist?.status !== "PASS"
    || stableJson(dist.exactHtmlAuthority) !== stableJson(HTML_AUTHORITY_FILES)
    || stableJson(dist.routeOutcomes) !== stableJson(PUBLIC_ROUTE_OUTCOMES)
    || stableJson(dist.requiredHeaderPolicies) !== stableJson(REQUIRED_HEADER_POLICIES)) {
    throw new Error("R1 deployment dist route/header authority differs");
  }
  if (!Array.isArray(dist.files) || !dist.files.length) throw new Error("R1 deployment dist inventory is empty");
  const distByPath = new Map();
  for (const file of dist.files) {
    const relativePath = safeRelativePath(file?.relativePath, "R1 deployment dist relativePath");
    if (distByPath.has(relativePath)
      || !Number.isSafeInteger(file.bytes) || file.bytes <= 0
      || !HASH64.test(file.sha256 ?? "")) throw new Error(`R1 deployment dist record differs: ${relativePath}`);
    const excluded = relativePath === "_headers";
    if (file.deploymentComparison !== (excluded ? "EXCLUDED_CLOUDFLARE_CONFIGURATION" : "REQUIRED")
      || file.requestPath !== publicPathForDistFile(relativePath)) {
      throw new Error(`R1 deployment dist comparison contract differs: ${relativePath}`);
    }
    if (/\.(?:map|zip|key|pem|env)$/i.test(relativePath)
      || /(?:^|\/)(?:node_modules|src|source|cache|\.cache|\.git|artifacts)(?:\/|$)/i.test(relativePath)) {
      throw new Error(`R1 deployment dist contains forbidden source/cache/private payload: ${relativePath}`);
    }
    distByPath.set(relativePath, file);
  }
  const distPaths = [...distByPath.keys()];
  const sortedDistPaths = [...distPaths].sort((left, right) => left.localeCompare(right));
  if (stableJson(distPaths) !== stableJson(sortedDistPaths)) throw new Error("R1 deployment dist inventory is not canonically sorted");
  const htmlPaths = distPaths.filter((relativePath) => relativePath.endsWith(".html"));
  if (stableJson(htmlPaths) !== stableJson([...HTML_AUTHORITY_FILES].sort((left, right) => left.localeCompare(right)))) throw new Error("R1 deployment exact ten-HTML authority differs");
  for (const requiredPath of ["_headers", "robots.txt", "sitemap.xml"]) {
    if (!distByPath.has(requiredPath)) throw new Error(`R1 deployment dist is missing ${requiredPath}`);
  }
  for (const prefix of ["_astro/", "media/cinematic/phase-4r2/manifests/", "media/cinematic/phase-4r2/media/", "media/cinematic/phase-4r2/posters/"]) {
    if (!distPaths.some((relativePath) => relativePath.startsWith(prefix))) throw new Error(`R1 deployment dist does not exercise /${prefix}*`);
  }
  const comparable = dist.files.filter(({ relativePath }) => relativePath !== "_headers");
  const requestPaths = comparable.map(({ requestPath }) => requestPath);
  if (new Set(requestPaths).size !== requestPaths.length) throw new Error("R1 deployment dist request paths are not unique");
  const expectedTotals = {
    files: dist.files.length,
    comparableFiles: comparable.length,
    bytes: dist.files.reduce((sum, file) => sum + file.bytes, 0),
  };
  if (stableJson(dist.totals) !== stableJson(expectedTotals)) throw new Error("R1 deployment dist totals contradict its raw inventory");
  const expectedCanonicalAuthority = Object.fromEntries(HTML_AUTHORITY_FILES.map((relativePath) => [relativePath, {
    canonical: canonicalForDistFile(relativePath),
    robotsNoindex: relativePath === "404.html",
    status: "PASS",
  }]));
  if (stableJson(dist.canonicalAuthority) !== stableJson(expectedCanonicalAuthority)) throw new Error("R1 deployment canonical authority differs");

  const missing404Path = `/__phase6-real-404-${metadata.repository.finalHead.slice(0, 12)}-${metadata.deployment.id.slice(0, 8)}/`;
  const originSpecs = [
    ["immutable", metadata.deployment.immutableUrl],
    ["branch", metadata.deployment.branchUrl],
  ];
  for (const [originId, expectedOrigin] of originSpecs) {
    const stage = document.origins?.[originId];
    const data = stage?.data;
    if (stage?.status !== "PASS" || data?.status !== "PASS" || data.origin !== expectedOrigin) {
      throw new Error(`R1 deployment ${originId} origin authority differs`);
    }
    const expectedReal404 = { publicPath: missing404Path, httpStatus: 404, localAuthority: "404.html", byteParity: true };
    if (stableJson(data.real404) !== stableJson(expectedReal404)) throw new Error(`R1 deployment ${originId} real-404 authority differs`);
    if (!Array.isArray(data.responses) || data.responses.length !== comparable.length
      || data.fileCount !== comparable.length
      || data.totalBytes !== comparable.reduce((sum, file) => sum + file.bytes, 0)) {
      throw new Error(`R1 deployment ${originId} response inventory/totals differ`);
    }
    const exercisedPolicies = new Set();
    const observedPublicPaths = new Set();
    for (let index = 0; index < comparable.length; index += 1) {
      const file = comparable[index];
      const response = data.responses[index];
      const expectedStatus = file.relativePath === "404.html" ? 404 : 200;
      const expectedPublicPath = file.relativePath === "404.html" ? missing404Path : file.requestPath;
      if (observedPublicPaths.has(expectedPublicPath)) throw new Error(`R1 deployment ${originId} public request path is duplicated: ${expectedPublicPath}`);
      observedPublicPaths.add(expectedPublicPath);
      if (response?.relativePath !== file.relativePath
        || response.publicPath !== expectedPublicPath
        || response.expectedHttpStatus !== expectedStatus
        || response.actualHttpStatus !== expectedStatus
        || response.bytes !== file.bytes
        || response.sha256 !== file.sha256
        || response.status !== "PASS") {
        throw new Error(`R1 deployment ${originId} raw response parity differs: ${file.relativePath}`);
      }
      const expectedCanonical = file.relativePath.endsWith(".html") ? expectedCanonicalAuthority[file.relativePath] : null;
      if (stableJson(response.canonical) !== stableJson(expectedCanonical)) throw new Error(`R1 deployment ${originId} response canonical differs: ${file.relativePath}`);
      const expectedPolicies = matchingR1HeaderPolicies(expectedPublicPath);
      const expectedMime = expectedR1MimeTokens(file.relativePath);
      const observedContentType = typeof response.headers?.contentType === "string"
        ? response.headers.contentType.split(";", 1)[0].trim().toLowerCase()
        : "";
      if (response.headers?.status !== "PASS"
        || typeof response.headers.contentType !== "string"
        || typeof response.headers.cacheControl !== "string"
        || !expectedMime.length || !expectedMime.includes(observedContentType)
        || stableJson(response.headers.matchedPolicies) !== stableJson(expectedPolicies)) {
        throw new Error(`R1 deployment ${originId} response header authority differs: ${file.relativePath}`);
      }
      const cacheDirectives = strictR1CacheControlDirectives(response.headers.cacheControl, `R1 deployment ${originId} ${file.relativePath}`);
      for (const policy of expectedPolicies) {
        exercisedPolicies.add(policy);
        const requiredDirectives = strictR1CacheControlDirectives(REQUIRED_HEADER_POLICIES[policy], `R1 deployment policy ${policy}`);
        if (cacheDirectives.size !== requiredDirectives.size
          || ![...requiredDirectives.entries()].every(([name, directive]) => cacheDirectives.get(name) === directive)) {
          throw new Error(`R1 deployment ${originId} Cache-Control differs for ${file.relativePath}`);
        }
      }
      if (cacheDirectives.has("private") || (cacheDirectives.has("no-store") && expectedStatus !== 404)) {
        throw new Error(`R1 deployment ${originId} unsafe Cache-Control for ${file.relativePath}`);
      }
    }
    if (stableJson([...exercisedPolicies].sort(lexicalCompare)) !== stableJson(Object.keys(REQUIRED_HEADER_POLICIES).sort(lexicalCompare))) {
      throw new Error(`R1 deployment ${originId} did not exercise every required header policy`);
    }
  }
}

export function validateDocumentAuthority(record, document, metadata) {
  const engine = record.engine;
  if (record.role === "deployment-verifier") {
    const authority = authorityProfileForBranch(metadata.repository?.branch);
    const inputs = document.inputs;
    if (document.status !== "PASS"
      || document.schema !== authority.deploymentSchema
      || inputs?.expectedHead !== metadata.repository.finalHead
      || inputs?.[authority.deploymentParentField] !== authority.parent
      || inputs?.expectedMain !== FROZEN_MAIN
      || inputs?.branch !== authority.branch
      || inputs?.deploymentId?.toLowerCase() !== metadata.deployment.id.toLowerCase()
      || inputs?.immutableUrl !== metadata.deployment.immutableUrl
      || inputs?.branchUrl !== metadata.deployment.branchUrl
      || document.repository?.status !== "PASS"
      || document.deployment?.status !== "PASS"
      || document.dist?.status !== "PASS"
      || document.origins?.immutable?.status !== "PASS"
      || document.origins?.branch?.status !== "PASS"
      || !document.checks
      || Object.values(document.checks).some((value) => value !== true)
      || !Array.isArray(document.failures)
      || document.failures.length) throw new Error("deployment-verifier authority differs from final metadata");
    if (authority.id === "phase6-r1") {
      const assertNestedPassStatuses = (value, location = "deployment-verifier") => {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          const childLocation = `${location}.${key}`;
          if (key === "status" && typeof child === "string" && child !== "PASS") throw new Error(`R1 deployment nested status is not PASS: ${childLocation}`);
          assertNestedPassStatuses(child, childLocation);
        }
      };
      assertNestedPassStatuses(document);
      const repositoryData = document.repository.data;
      const expectedHistory = metadata.repository.commitChain.map(({ sha, parents, subject }) => ({ commit: sha, parents, subject }));
      const exactRepositoryAuthority = repositoryData?.status === "PASS"
        && repositoryData.repository === R1_REQUIRED_REPOSITORY
        && repositoryData.branch === authority.branch
        && repositoryData.head === metadata.repository.finalHead
        && repositoryData.exactParent === authority.parent
        && repositoryData.directParent === metadata.repository.directParent
        && repositoryData.cleanTree === true
        && stableJson(repositoryData.history) === stableJson(expectedHistory)
        && stableJson(repositoryData.main) === stableJson({
          local: FROZEN_MAIN,
          upstream: FROZEN_MAIN,
          live: FROZEN_MAIN,
          modifiedOrMerged: false,
        })
        && stableJson(repositoryData.upstream) === stableJson({
          ref: `origin/${authority.branch}`,
          head: metadata.repository.finalHead,
          live: metadata.repository.finalHead,
          parity: true,
        })
        && stableJson(repositoryData.packageScriptChanges) === stableJson(R1_ALLOWED_PACKAGE_SCRIPT_CHANGES)
        && stableJson(repositoryData.toolingReportDiff) === stableJson(EXPECTED_R1_CHANGED_PATH_RECORDS)
        && stableJson(repositoryData.productionDiffScope) === stableJson([
          ...R1_PRODUCTION_DIFF_PATHS,
          "package.json except approved R1 evidence/test scripts",
        ]);
      const deploymentData = document.deployment.data;
      const exactDeploymentAuthority = deploymentData?.status === "PASS"
        && deploymentData.appSlug === "cloudflare-workers-and-pages"
        && deploymentData.deploymentId === metadata.deployment.id
        && deploymentData.immutableUrl === metadata.deployment.immutableUrl
        && deploymentData.branchUrl === metadata.deployment.branchUrl
        && deploymentData.branch === authority.branch
        && deploymentData.commitHash === metadata.repository.finalHead
        && deploymentData.environment === "preview"
        && stableJson(deploymentData.branchBinding) === stableJson({
          status: "PASS",
          source: "SIGNED_CHECK_EXACT_BRANCH_ALIAS",
          branch: authority.branch,
          branchUrl: metadata.deployment.branchUrl,
        });
      const exactOriginAuthority = document.origins.immutable.data?.origin === metadata.deployment.immutableUrl
        && document.origins.immutable.data?.status === "PASS"
        && document.origins.branch.data?.origin === metadata.deployment.branchUrl
        && document.origins.branch.data?.status === "PASS";
      const exactChecks = {
        exactR1BranchParentAndFrozenMain: true,
        zeroProductionSourceDiff: true,
        signedSuccessfulDeploymentBindsExactHead: true,
        immutableLocalByteParity: true,
        branchLocalByteParity: true,
        real404HeadersCanonicalAndTenRoutes: true,
      };
      if (inputs.repository !== R1_REQUIRED_REPOSITORY || inputs.localDist !== "dist"
        || !exactRepositoryAuthority || !exactDeploymentAuthority || !exactOriginAuthority
        || stableJson(document.checks) !== stableJson(exactChecks)) {
        throw new Error("R1 deployment inner repository/deployment/origin authority differs from final metadata");
      }
      if (stableJson(repositoryData.productionSourceDiff) !== stableJson([])) throw new Error("R1 deployment production-source diff differs from the zero-production metadata authority");
      const deploymentToolingPaths = r1DiffPaths(repositoryData.toolingReportDiff, "R1 deployment tooling/report diff");
      const metadataToolingPaths = pathValues(metadata.changes.toolingReportFiles);
      if (stableJson([...deploymentToolingPaths].sort(lexicalCompare)) !== stableJson([...R1_TOOLING_REPORT_FILES].sort(lexicalCompare))
        || stableJson([...metadataToolingPaths].sort(lexicalCompare)) !== stableJson([...deploymentToolingPaths].sort(lexicalCompare))) {
        throw new Error("R1 deployment tooling/report diff does not match the exact metadata change ledger");
      }
      if (repositoryData.trackedFileDelta !== undefined && repositoryData.trackedFileDelta !== metadata.changes.trackedFileDelta) throw new Error("R1 deployment trackedFileDelta differs from final metadata");
      if (repositoryData.trackedByteDelta !== undefined && repositoryData.trackedByteDelta !== metadata.changes.trackedByteDelta) throw new Error("R1 deployment trackedByteDelta differs from final metadata");
      validateR1DeploymentRawParity(document, metadata);
    }
  }
  if (record.role === "cross-engine-summary") {
    const expectedCases = engine === "chromium" ? 130 : 34;
    const expectedUnsupported = { chromium: 0, webkit: 5, firefox: 4 }[engine];
    if (!engine || document.baseUrl !== metadata.evidenceContext.browserQa.baseUrl
      || !Array.isArray(document.selectedEngines) || document.selectedEngines.length !== 1 || document.selectedEngines[0] !== engine
      || !Array.isArray(document.engines) || document.engines.length !== 1 || document.engines[0]?.engine !== engine
      || document.summary?.matrixCases !== expectedCases
      || document.summary?.matrixExpected !== expectedCases
      || document.summary?.failures !== 0
      || document.summary?.engineErrors !== 0
      || document.summary?.unsupportedCapabilities !== expectedUnsupported
      || document.status !== "PASS") throw new Error(`cross-engine exact tuple differs: ${engine ?? "missing"}`);
  }
  if (record.role === "history-bfcache-summary") validateLegacyBfcacheObservations(document, "history-bfcache-summary");
  if (record.role === "performance-summary") {
    const loops = document.lifecycleLoops;
    if (document.status !== "PASS"
      || document.configuration?.baseUrl !== metadata.evidenceContext.browserQa.baseUrl
      || document.configuration?.iterations !== 5
      || document.configuration?.cycles !== 10
      || document.configuration?.cpuRate !== 4
      || document.configuration?.briefDefaultsSatisfied !== true
      || document.representative?.samples?.length !== 100
      || document.representative?.scenarios?.length !== 10
      || loops?.homeMaradin?.cycles !== 10
      || loops?.homeSupport?.cycles !== 10
      || loops?.homeMaradin?.status !== "COMPLETE"
      || loops?.homeSupport?.status !== "COMPLETE"
      || loops?.homeMaradin?.boundedness?.bounded !== true
      || loops?.homeSupport?.boundedness?.bounded !== true) throw new Error("performance exact tuple differs");
    validateLegacyBfcacheObservations(document, "performance-summary");
    validatePerformanceVisibilityObservation(document);
  }
  if (record.role === "accessibility-summary") {
    if (!engine || document.baseUrl !== metadata.evidenceContext.browserQa.baseUrl
      || document.engine !== engine
      || !Array.isArray(document.selectedEngines) || document.selectedEngines.length !== 1 || document.selectedEngines[0] !== engine
      || !Array.isArray(document.engines) || document.engines.length !== 1 || document.engines[0]?.engine !== engine
      || document.summary?.axeCases !== 20
      || document.summary?.axeExpected !== 20
      || document.summary?.axeViolations !== 0
      || document.summary?.seriousCritical !== 0
      || document.summary?.failures !== 0
      || document.summary?.engineErrors !== 0
      || !Array.isArray(document.failures) || document.failures.length
      || document.status !== "PASS"
      || (engine === "webkit" && document.axeOnly !== true)) throw new Error(`accessibility exact tuple differs: ${engine ?? "missing"}`);
    validateAccessibilityInteractionMatrix(document, engine);
  }
  if (record.role === "accessibility-interaction-limitation") {
    validateAccessibilityReport(document);
    const sourceStatus = normalizeEvidenceStatus(document.status);
    const failedSource = sourceStatus === "FAIL"
      && document.summary?.failures >= 1
      && Array.isArray(document.failures)
      && document.failures.length > 0;
    const limitedSource = sourceStatus === "LIMITATION"
      && ((typeof document.limitation === "string" && document.limitation.trim()) || (Array.isArray(document.limitations) && document.limitations.some((item) => typeof item === "string" && item.trim())));
    if (document.baseUrl !== metadata.evidenceContext.browserQa.baseUrl
      || document.engine !== "webkit"
      || !Array.isArray(document.engines) || document.engines.length !== 1 || document.engines[0]?.engine !== "webkit"
      || !Array.isArray(document.selectedEngines) || document.selectedEngines.length !== 1 || document.selectedEngines[0] !== "webkit"
      || (!failedSource && !limitedSource)) throw new Error("WebKit interaction limitation source differs");
  }
  if (record.role === "supplemental-reflow-proxy") {
    const proxy = Array.isArray(document.variants)
      ? document.variants.filter((variant) => variant?.id === "text-200-proxy")
      : [];
    if (document.status !== "PASS" || proxy.length !== 1 || !includes720By450Proxy(proxy[0]) || !Array.isArray(proxy[0].records) || !proxy[0].records.length) {
      throw new Error("supplemental 720x450 reflow proxy authority differs");
    }
  }
  if (record.role === "regression-summary") {
    if (document.status !== "PASS" || document.target?.baseUrl !== metadata.evidenceContext.browserQa.baseUrl || document.checks?.length !== 7 || document.checks.some((check) => check?.status !== "PASS") || document.sharedDom?.status !== "PASS" || !Array.isArray(document.sharedDom?.assertions) || document.sharedDom.assertions.some((assertion) => assertion?.pass !== true) || document.failures?.length !== 0) throw new Error("repair-regression exact tuple differs");
  }
  if (record.role === "r1-node22-validation-summary") validateR1Node22Validation(document, metadata);
  if (record.role === "physical-device-result") validateHumanEvidenceLedger(document);
  if (record.role === "r1-motion-summary") validateR1MotionReport(document, engine, metadata);
  if (record.role === "r1-persistent-lifecycle-summary") validateR1PersistentLifecycle(document, record, metadata);
}

async function curateArtifact(sourceRoot, record, metadata) {
  const { bytes } = await checkedSourceFile(sourceRoot, record.source);
  if (sha256(bytes) !== record.expectedSha256) throw new Error(`final source SHA-256 differs: ${record.source}`);
  const sourceExtension = path.posix.extname(record.source).toLowerCase();
  const destinationExtension = path.posix.extname(record.destination).toLowerCase();
  const kind = extensionKind(record.destination);
  let data;
  let media = null;
  let sourceDocument = null;
  if (destinationExtension === ".json") {
    if (sourceExtension !== ".json") throw new Error(`JSON evidence destination requires JSON source: ${record.destination}`);
    let document;
    try { document = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`invalid source JSON: ${record.source}`); }
    sourceDocument = document;
    const sourceStatus = normalizeEvidenceStatus(document?.status);
    if (sourceStatus === "FAIL" && !["FAIL", "LIMITATION"].includes(record.status)) throw new Error(`failed JSON report requires an explicit FAIL or LIMITATION artifact: ${record.source}`);
    if (["LIMITATION", "NOT OBSERVED", "PENDING HUMAN REVIEW"].includes(sourceStatus) && record.status === "PASS") throw new Error(`non-PASS JSON report cannot be promoted to a PASS artifact: ${record.source}`);
    const acceptedSchemas = JSON_ROLE_SCHEMAS[record.role];
    if (acceptedSchemas && !acceptedSchemas.includes(document?.schema) && !(record.role === "r1-node22-validation-summary" && isR1Node22ValidationSchema(document?.schema))) throw new Error(`source JSON schema differs for ${record.role}: ${record.source}`);
    if (record.status === "PASS" && sourceStatus !== "PASS") throw new Error(`PASS artifact requires a PASS source report: ${record.source}`);
    validateDocumentAuthority(record, document, metadata);
    const sanitized = sanitizeJsonValue(document, record.source);
    if (record.role === "deployment-verifier") {
      if (record.select !== undefined || record.status !== "PASS") throw new Error("deployment-verifier must be included whole as the successful canonical authority");
      data = Buffer.from(stableJson(sanitized));
    } else {
      const selection = record.select
        ? Object.fromEntries(record.select.map((pointer) => [pointer, sanitizeJsonValue(getJsonPointer(sanitized, pointer, record.source), `${record.source}${pointer}`)]))
        : sanitized;
      if (!record.select && bytes.length > 512 * 1024) throw new Error(`large JSON evidence requires an explicit select list: ${record.source}`);
      data = Buffer.from(stableJson({
        schema: `${SCHEMA}.distilled-json`,
        status: record.status,
        role: record.role,
        source: { relativePath: record.source, sha256: sha256(bytes) },
        ...(record.status !== "PASS" ? { sourceStatus } : {}),
        ...(record.limitation ? { limitation: record.limitation } : {}),
        selection: record.select ?? null,
        payload: selection,
      }));
    }
  } else if (TEXT_EXTENSIONS.has(destinationExtension)) {
    if (sourceExtension !== destinationExtension) throw new Error(`text evidence source/destination extensions differ: ${record.destination}`);
    if (bytes.length > 512 * 1024) throw new Error(`text evidence is not compact: ${record.source}`);
    data = Buffer.from(sanitizeText(bytes.toString("utf8"), record.source));
  } else if (kind === "image") {
    if (!IMAGE_EXTENSIONS.has(sourceExtension)) throw new Error(`image evidence source/destination types differ: ${record.destination}`);
    media = await validateImage(bytes, record.source);
    const expectedFormat = new Map([[".png", "png"], [".jpg", "jpeg"], [".jpeg", "jpeg"], [".webp", "webp"], [".avif", "heif"]]).get(destinationExtension);
    if (media.format !== expectedFormat) throw new Error(`decoded image format differs from destination extension: ${record.destination}`);
    data = Buffer.from(bytes);
  } else if (kind === "video") {
    if (sourceExtension !== ".mp4") throw new Error(`video evidence must be MP4: ${record.source}`);
    const mp4 = validateMp4(bytes, record.source);
    media = record.role === "physical-device-recording"
      ? { ...mp4, humanSupplied: true, byteSize: bytes.length, sha256: sha256(bytes) }
      : record.role === "r1-motion-recording"
        ? await validateR1MotionBoundMedia(sourceRoot, record, bytes, metadata)
        : await validateCaptureBoundMedia(sourceRoot, record, bytes);
    data = Buffer.from(bytes);
  } else throw new Error(`unsupported evidence artifact: ${record.destination}`);
  assertPrivacySafe(data, record.destination);
  return {
    path: record.destination,
    data,
    source: record.source,
    role: record.role,
    status: record.status,
    ...(record.engine ? { engine: record.engine } : {}),
    ...(media ? { media } : {}),
    ...(sourceDocument ? { taxonomy: evidenceTaxonomy(record, sourceDocument) } : {}),
  };
}

function validateHumanEvidenceBindings(metadata, entries) {
  const ledgerEntries = entries.filter(({ role }) => role === "physical-device-result");
  const recordingEntries = entries.filter(({ role }) => role === "physical-device-recording");
  if (!ledgerEntries.length) {
    if (recordingEntries.length) throw new Error("physical-device recordings require a verified human-evidence ledger");
    return { status: "PENDING HUMAN REVIEW", verified: false };
  }
  if (ledgerEntries.length !== 1) throw new Error("exactly one physical-device human-evidence ledger is required");
  const ledgerEntry = ledgerEntries[0];
  const ledger = ledgerEntry.taxonomy?.humanEvidence;
  if (!ledger) throw new Error("physical-device human-evidence ledger taxonomy is unavailable");
  for (const record of ledger.recordings) {
    const artifactRecord = metadata.artifacts.find((artifact) => artifact.role === "physical-device-recording" && path.posix.basename(artifact.source) === record.filename);
    const assembled = artifactRecord && recordingEntries.find(({ source }) => source === artifactRecord.source);
    if (!artifactRecord || !assembled || artifactRecord.status !== record.status || assembled.status !== record.status
      || artifactRecord.expectedSha256 !== record.sha256 || assembled.data.length !== record.byteSize || sha256(assembled.data) !== record.sha256
      || stableJson({
        container: assembled.media?.container,
        durationSeconds: assembled.media?.durationSeconds,
        sampleCount: assembled.media?.sampleCount,
        videoTrackCount: assembled.media?.videoTrackCount,
      }) !== stableJson(record.mediaValidation)
      || (record.status !== "PENDING HUMAN REVIEW" && (record.reviewedSha256 !== record.sha256 || record.reviewedByteSize !== record.byteSize))) {
      throw new Error(`human-evidence recording is not hash/size/status bound into the package: ${record.filename}`);
    }
  }
  if (recordingEntries.length !== REQUIRED_HUMAN_EVIDENCE_FILES.length) throw new Error("physical-device recording inventory contains an unbound or duplicate file");
  ledger.verified = true;
  return { status: ledger.status, verified: true };
}

function validateR1DeploymentNodeManifestBinding(metadata, entries) {
  if (authorityProfileForBranch(metadata.repository.branch).id !== "phase6-r1") return;
  const deploymentEntry = entries.find(({ role }) => role === "deployment-verifier");
  const node22Entry = entries.find(({ role }) => role === "r1-node22-validation-summary");
  if (!deploymentEntry || !node22Entry) throw new Error("R1 deployment/Node 22 cross-authority artifacts are missing");
  const deployment = JSON.parse(deploymentEntry.data.toString("utf8"));
  const node22Wrapper = JSON.parse(node22Entry.data.toString("utf8"));
  const node22 = node22Wrapper.payload;
  const manifest = validateEmbeddedDistManifest(
    node22?.distributionComparison?.node22?.manifestText,
    node22?.distributionComparison?.node22?.manifestSha256,
    "Node 22 deployment cross-binding",
  );
  const deploymentLedger = deployment.dist?.files?.map(({ relativePath, bytes, sha256: fileSha256 }) => ({ relativePath, bytes, sha256: fileSha256 }));
  if (stableJson(deploymentLedger) !== stableJson(manifest.records)) {
    throw new Error("R1 deployment dist ledger does not exactly match the hash-bound Node 22 distribution manifest");
  }
}

function posterLabel(width, text) {
  const safe = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return Buffer.from(`<svg width="${width}" height="36" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#080b10"/><text x="${width / 2}" y="23" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#f1f4f8">${safe}</text></svg>`);
}

async function normalizedRgb(bytes) {
  return sharp(bytes, { failOn: "error", limitInputPixels: 250_000_000, sequentialRead: true })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function comparisonPanel(bytes, label) {
  const rendered = await sharp(bytes, { failOn: "error" })
    .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: false })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer({ resolveWithObject: true });
  const panelWidth = 340;
  const panelHeight = 370;
  return sharp({ create: { width: panelWidth, height: panelHeight, channels: 3, background: "#080b10" } })
    .composite([
      { input: rendered.data, left: Math.floor((panelWidth - rendered.info.width) / 2), top: 42 + Math.floor((320 - rendered.info.height) / 2) },
      { input: posterLabel(panelWidth, label), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function composePosterComparison(original, lossless, lossy, family) {
  const panels = await Promise.all([
    comparisonPanel(original, "Original PNG authority"),
    comparisonPanel(lossless, "Lossless WebP candidate"),
    comparisonPanel(lossy, "Lossy WebP q95 candidate"),
  ]);
  return sharp({ create: { width: 1020, height: 402, channels: 3, background: "#05070a" } })
    .composite([
      ...panels.map((input, index) => ({ input, left: index * 340, top: 32 })),
      { input: posterLabel(1020, `${family.toUpperCase()} — rendered-size comparison`), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function composeAmplifiedDifference(originalRgb, lossyRgb, family) {
  if (originalRgb.info.width !== lossyRgb.info.width || originalRgb.info.height !== lossyRgb.info.height || originalRgb.info.channels !== lossyRgb.info.channels) throw new Error(`${family} lossy candidate dimensions/channels differ`);
  const amplified = Buffer.alloc(originalRgb.data.length);
  let changedPixels = 0;
  let maximumChannelError = 0;
  let absoluteError = 0;
  for (let offset = 0; offset < originalRgb.data.length; offset += originalRgb.info.channels) {
    let pixelChanged = false;
    for (let channel = 0; channel < originalRgb.info.channels; channel += 1) {
      const error = Math.abs(originalRgb.data[offset + channel] - lossyRgb.data[offset + channel]);
      amplified[offset + channel] = Math.min(255, error * 32);
      maximumChannelError = Math.max(maximumChannelError, error);
      absoluteError += error;
      pixelChanged ||= error > 0;
    }
    if (pixelChanged) changedPixels += 1;
  }
  const pixels = originalRgb.info.width * originalRgb.info.height;
  const label = `${family.toUpperCase()} — lossy q95 absolute RGB difference ×32 — ${(changedPixels / pixels * 100).toFixed(2)}% pixels changed`;
  const rendered = await sharp(amplified, { raw: originalRgb.info })
    .resize({ width: 640, height: 480, fit: "inside", withoutEnlargement: false })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer({ resolveWithObject: true });
  const output = await sharp({ create: { width: 680, height: rendered.info.height + 56, channels: 3, background: "#05070a" } })
    .composite([
      { input: rendered.data, left: 20, top: 46 },
      { input: posterLabel(680, label), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  return { output, changedPixels, pixels, maximumChannelError, meanAbsoluteChannelError: absoluteError / originalRgb.data.length };
}

async function regularFileBytes(directory, filename, label) {
  const absolute = path.join(directory, filename);
  if (!isWithin(directory, absolute)) throw new Error(`${label} escaped its directory`);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular file: ${filename}`);
  const resolved = await realpath(absolute);
  if (!isWithin(directory, resolved)) throw new Error(`${label} resolves outside its directory`);
  return readFile(resolved);
}

export async function generatePosterEvidence(posterStudyDirectory, { originalDirectory = TRACKED_POSTER_DIRECTORY, verifyTrackedAuthority = true } = {}) {
  const candidateRoot = await checkedDirectory(posterStudyDirectory, "poster-study directory");
  const authorityRoot = await checkedDirectory(originalDirectory, "tracked poster authority directory");
  const entries = [];
  const records = [];
  for (const family of POSTER_FAMILIES) {
    const [original, lossless, lossy] = await Promise.all([
      regularFileBytes(authorityRoot, family.original, `${family.id} original`),
      regularFileBytes(candidateRoot, family.lossless, `${family.id} lossless candidate`),
      regularFileBytes(candidateRoot, family.lossy, `${family.id} lossy candidate`),
    ]);
    const [originalRgb, losslessRgb, lossyRgb] = await Promise.all([normalizedRgb(original), normalizedRgb(lossless), normalizedRgb(lossy)]);
    if (verifyTrackedAuthority && (sha256(original) !== family.originalSha256 || originalRgb.info.width !== family.width || originalRgb.info.height !== family.height)) throw new Error(`${family.id} tracked poster authority differs`);
    if (originalRgb.info.width !== losslessRgb.info.width || originalRgb.info.height !== losslessRgb.info.height || !originalRgb.data.equals(losslessRgb.data)) throw new Error(`${family.id} lossless candidate is not pixel exact`);
    const comparison = await composePosterComparison(original, lossless, lossy, family.id);
    const difference = await composeAmplifiedDifference(originalRgb, lossyRgb, family.id);
    if (!difference.changedPixels) throw new Error(`${family.id} lossy candidate unexpectedly has zero difference`);
    entries.push(
      { path: `10-poster-study/comparisons/${family.id}-original-lossless-lossy.png`, data: comparison, source: "poster-study", role: "poster-side-by-side" },
      { path: `10-poster-study/differences/${family.id}-lossy-q95-difference-x32.png`, data: difference.output, source: "poster-study", role: "poster-difference" },
    );
    records.push({
      family: family.id,
      dimensions: { width: originalRgb.info.width, height: originalRgb.info.height },
      original: { filename: family.original, byteSize: original.length, sha256: sha256(original) },
      lossless: { filename: family.lossless, byteSize: lossless.length, sha256: sha256(lossless), pixelExact: true },
      lossy: { filename: family.lossy, byteSize: lossy.length, sha256: sha256(lossy), changedPixels: difference.changedPixels, changedPixelPercent: difference.changedPixels / difference.pixels * 100, maximumChannelError: difference.maximumChannelError, meanAbsoluteChannelError: difference.meanAbsoluteChannelError },
    });
  }
  entries.push(jsonEntry("10-poster-study/poster-request-decode-summary.json", {
    schema: `${SCHEMA}.poster-study`,
    status: "RETAINED",
    decision: POSTER_DECISION,
    comparisonPolicy: "Compact labelled rendered-size triptychs and full-resolution absolute RGB differences amplified 32×; candidates themselves are not copied.",
    decodeAuthority: "PHASE_6_POSTER_STUDY.md is injected by the packager and remains the decode-time authority.",
    families: records,
  }, "poster-study", "poster-study-summary"));
  return { entries, records };
}

export const FINAL_HANDOFF_FIELDS = Object.freeze([
  "Branch", "Exact parent", "Final HEAD", "Direct parent", "Linear commit chain", "Clean-tree result", "Local/upstream/live parity", "Main SHA", "Confirmation main was not modified or merged", "Production-source files changed", "Tooling/report files changed", "Defect ledger summary", "Verified defects repaired", "Suspected issues proven not to be defects", "Browser versions", "Chromium result", "WebKit result", "Firefox result", "History/hash result", "BFCache result", "Physical-device result or explicit pending limitation", "Native-scroll result", "Reverse-scroll result", "Homepage result", "Supporting-route result", "Long-task cold/warm statistics", "Attribution result", "RAF/interval result", "CLS result", "Memory-cycle result", "listener/observer result", "Blob/object URL result", "Decoder result", "Slow-network result", "failure/offline result", "Reduced-motion result", "No-JS result", "200% result", "Keyboard/focus result", "Axe result", "Media/request isolation result", "Poster optimization decision", "Original and final poster sizes/hashes", "Phase 4 media hash result", "R1 About hash result", "Supporting-route source regression result", "Publication result", "Build result", "Test totals", "Route JS/CSS budgets", "Tracked-file delta", "Tracked-byte delta", "Deployment ID", "Immutable preview", "Branch preview", "Exact deployed SHA", "Deployment parity result", "Review ZIP path", "ZIP size", "ZIP SHA-256", "Embedded-manifest SHA-256", "Detached-manifest SHA-256 if produced", "Independent-audit SHA-256", "Package entry count", "Genuine unresolved limitations", "All six Phase 6 gates listed as PENDING HUMAN REVIEW",
]);

function evidencePointer(section, filename = "section-summary.json") {
  return { evidence: `${section}/${filename}` };
}

function finalHandoffSeed(metadata) {
  const repository = metadata.repository;
  const deployment = metadata.deployment;
  const changes = metadata.changes;
  const verification = metadata.verification;
  const pointers = {
    baseline: evidencePointer("01-baseline"),
    crossEngine: evidencePointer("02-cross-engine"),
    home: evidencePointer("03-homepage-motion"),
    supporting: evidencePointer("04-supporting-routes"),
    history: evidencePointer("05-history-bfcache"),
    performance: evidencePointer("06-performance"),
    memory: evidencePointer("07-memory"),
    network: evidencePointer("08-network-media"),
    accessibility: evidencePointer("09-accessibility"),
    poster: evidencePointer("10-poster-study"),
    physical: evidencePointer("11-physical-device"),
    regression: evidencePointer("12-regression"),
  };
  const values = [
    repository.branch,
    repository.exactParent,
    repository.finalHead,
    repository.directParent,
    repository.commitChain,
    repository.cleanTree,
    { local: repository.localHead, upstream: repository.upstreamHead, live: repository.liveHead },
    repository.main.public,
    repository.main.modifiedOrMerged === false,
    changes.productionFiles,
    changes.toolingReportFiles,
    pointers.baseline,
    pointers.baseline,
    pointers.baseline,
    pointers.crossEngine,
    pointers.crossEngine,
    pointers.crossEngine,
    pointers.crossEngine,
    pointers.history,
    pointers.history,
    pointers.physical,
    pointers.home,
    pointers.home,
    pointers.home,
    pointers.supporting,
    pointers.performance,
    pointers.performance,
    pointers.performance,
    pointers.performance,
    pointers.memory,
    pointers.memory,
    pointers.memory,
    pointers.memory,
    pointers.network,
    pointers.network,
    pointers.accessibility,
    pointers.accessibility,
    pointers.accessibility,
    pointers.accessibility,
    pointers.accessibility,
    pointers.network,
    { decision: POSTER_DECISION, ...pointers.poster },
    pointers.poster,
    pointers.regression,
    pointers.regression,
    pointers.regression,
    { ...pointers.regression, publication: verification.publication },
    verification.build,
    verification.tests,
    verification.routeBudgets,
    changes.trackedFileDelta,
    changes.trackedByteDelta,
    deployment.id,
    deployment.immutableUrl,
    deployment.branchUrl,
    deployment.deployedSha,
    deployment.parity,
    { populateFrom: "package-phase6-human-review result" },
    { populateFrom: "package-phase6-human-review result" },
    { populateFrom: "package-phase6-human-review result" },
    { populateFrom: "detached manifest / independent audit" },
    { populateFrom: "package-phase6-human-review result" },
    { populateFrom: "package-phase6-human-review result" },
    { populateFrom: "package-phase6-human-review result" },
    metadata.limitations,
    HUMAN_REVIEW_GATES,
  ];
  if (values.length !== FINAL_HANDOFF_FIELDS.length) throw new Error("final handoff seed field count differs");
  return {
    schema: `${SCHEMA}.final-handoff-seed`,
    status: "READY_FOR_PACKAGE_FIELDS_58_THROUGH_64",
    fields: FINAL_HANDOFF_FIELDS.map((label, index) => ({ number: index + 1, label, value: values[index] })),
    authorization: AUTHORIZATION,
  };
}

function generatedAuthorityEntries(metadata) {
  const repository = metadata.repository;
  const deployment = metadata.deployment;
  const changes = metadata.changes;
  const verification = metadata.verification;
  const productionDiff = changes.productionFiles.length
    ? `${changes.productionFiles.map((record) => typeof record === "string" ? `M\t${record}` : `${record.status ?? "M"}\t${record.path}`).join("\n")}\n`
    : "NO PRODUCTION SOURCE FILES CHANGED\n";
  const limitations = `# Genuine unresolved limitations\n\n${metadata.limitations.map((item) => `- ${item}`).join("\n")}\n`;
  return [
    jsonEntry("00-provenance/repository-authority.json", { schema: `${SCHEMA}.repository-authority`, status: "PASS", generatedAt: metadata.generatedAt, repository }),
    jsonEntry("00-provenance/checkpoint-chain.json", { schema: `${SCHEMA}.checkpoint-chain`, status: "PASS", exactParent: repository.exactParent, finalHead: repository.finalHead, commits: repository.commitChain }),
    textEntry("00-provenance/production-source-diff.txt", productionDiff),
    jsonEntry("00-provenance/change-ledger.json", { schema: `${SCHEMA}.change-ledger`, status: "PASS", ...changes }),
    jsonEntry("00-provenance/deployment-authority-summary.json", { schema: `${SCHEMA}.deployment-authority-summary`, status: "PASS", branch: repository.branch, finalHead: repository.finalHead, deployment, evidenceContext: metadata.evidenceContext }),
    jsonEntry("00-provenance/dist-deployment-parity.json", { schema: `${SCHEMA}.dist-deployment-parity`, status: deployment.parity, finalHead: repository.finalHead, deployedSha: deployment.deployedSha, parity: deployment.parity, ...(deployment.dist ?? {}) }),
    textEntry("00-provenance/final-limitations.md", limitations),
    jsonEntry("00-provenance/final-handoff-seed.json", finalHandoffSeed(metadata)),
    jsonEntry("01-baseline/accepted-phase5b-reference-hashes.json", { schema: `${SCHEMA}.accepted-phase5b-reference-hashes`, status: "PASS", hashes: metadata.baseline.acceptedPhase5bReferenceHashes }),
    jsonEntry("01-baseline/initial-browser-runtime-inventory.json", { schema: `${SCHEMA}.initial-browser-runtime-inventory`, status: "PASS", inventory: metadata.baseline.initialBrowserRuntimeInventory }),
  ].map((entry) => ({ ...entry, role: "generated-authority" }));
}

function finalBuildTestEntry(metadata, node22Entry = null) {
  const verification = metadata.verification;
  const authority = authorityProfileForBranch(metadata.repository.branch);
  let node22Validation;
  if (authority.id === "phase6-r1") {
    if (!node22Entry) throw new Error("R1 final-build-test requires the Node 22 integrated validation artifact");
    const wrapper = JSON.parse(node22Entry.data.toString("utf8"));
    const document = wrapper.payload;
    node22Validation = {
      artifact: { path: node22Entry.path, source: wrapper.source.relativePath, sha256: wrapper.source.sha256 },
      schema: document.schema,
      status: document.status,
      sealedAtUtc: document.sealedAtUtc,
      repository: document.repository,
      runtime: document.runtime,
      outcomes: document.outcomes,
      distributionComparison: document.distributionComparison,
    };
  }
  return {
    ...jsonEntry("00-provenance/final-build-test.json", {
      schema: `${SCHEMA}.final-build-test`,
      status: "PASS",
      build: verification.build,
      tests: verification.tests,
      publication: verification.publication,
      routeBudgets: verification.routeBudgets,
      ...(node22Validation ? { node22Validation } : {}),
    }),
    role: "generated-authority",
  };
}

export function guardedRequirementAssessment(section, requirement, entries) {
  if (section === "05-history-bfcache" && requirement === "BFCache") {
    const statuses = entries.flatMap((entry) => entry.taxonomy?.bfcache ?? []);
    const r1Statuses = entries
      .filter((entry) => entry.role === "r1-persistent-lifecycle-summary")
      .flatMap((entry) => entry.taxonomy?.bfcache ?? []);
    const status = statuses.some((candidate) => normalizeEvidenceStatus(candidate) === "FAIL")
      ? "FAIL"
      : r1Statuses.length
        ? aggregateCoverageStatuses(r1Statuses, "NOT OBSERVED")
        : aggregateCoverageStatuses(statuses, "NOT OBSERVED");
    return {
      status,
      statement: status === "PASS"
        ? "A source report observed persisted BFCache restoration."
        : status === "FAIL"
          ? "Observed raw lifecycle evidence recorded a BFCache restoration failure; ordinary Back/Forward evidence cannot suppress it."
          : status === "LIMITATION"
            ? "The browser host limited BFCache observation; ordinary Back/Forward evidence does not promote BFCache to PASS."
            : "No source report observed persisted BFCache restoration; ordinary Back/Forward evidence does not promote BFCache to PASS.",
    };
  }
  if (section === "03-homepage-motion" && requirement === "hidden/visible behavior") {
    const machineStatuses = entries.flatMap((entry) => entry.taxonomy?.visibility ?? []);
    const r1Statuses = entries
      .filter((entry) => entry.role === "r1-persistent-lifecycle-summary")
      .flatMap((entry) => entry.taxonomy?.visibility ?? []);
    const humanStatuses = entries
      .filter((entry) => entry.taxonomy?.humanEvidence?.verified && entry.taxonomy.humanEvidence.hiddenVisible)
      .map((entry) => entry.taxonomy.humanEvidence.hiddenVisible);
    const statuses = [...machineStatuses, ...humanStatuses];
    const status = aggregateCoverageStatuses(statuses, "NOT OBSERVED");
    return {
      status,
      statement: status === "PASS"
        ? "A real hidden/visible transition was observed with coherent return state."
        : status === "FAIL"
          ? "An observed hidden/visible transition recorded a lifecycle failure; synthetic or successful evidence cannot suppress it."
          : status === "LIMITATION"
            ? "The browser host limited real hidden/visible observation; synthetic lifecycle coverage cannot promote this requirement to PASS."
            : status === "PENDING HUMAN REVIEW"
              ? "Physical Safari hidden/visible review remains pending; synthetic lifecycle coverage cannot promote this requirement to PASS."
              : "A real hidden/visible transition was not observed; synthetic lifecycle coverage cannot promote this requirement to PASS.",
    };
  }
  if (section === "09-accessibility" && ["keyboard", "focus", "mobile menu"].includes(requirement)) {
    const key = requirement === "mobile menu" ? "mobileMenu" : requirement;
    const statuses = entries.map((entry) => entry.taxonomy?.accessibility?.[key]).filter(Boolean);
    const status = aggregateCoverageStatuses(statuses, "NOT OBSERVED");
    return {
      status,
      statement: status === "PASS"
        ? `${requirement} interactions completed successfully in every applicable interaction source report.`
        : `${requirement} is not a machine PASS because an applicable interaction source was incomplete, failed or limited; axe-only reports are excluded.`,
    };
  }
  if (section === "09-accessibility" && requirement === "200%") {
    const zoomStatuses = entries
      .filter((entry) => entry.taxonomy?.humanEvidence?.verified)
      .map((entry) => entry.taxonomy.humanEvidence.browserZoom)
      .filter(Boolean);
    const proxyOnly = entries.some((entry) => entry.taxonomy?.accessibility?.proxy720x450);
    const status = zoomStatuses.length ? aggregateEvidenceStatuses(zoomStatuses, "PENDING HUMAN REVIEW") : "PENDING HUMAN REVIEW";
    return {
      status,
      statement: status === "PASS"
        ? "A hash-bound human recording verified genuine 200% browser zoom across all ten route outcomes."
        : status === "FAIL"
          ? "The hash-bound genuine 200% browser-zoom review recorded one or more failed route outcomes; see the addressed recording observations and failure references."
        : proxyOnly
          ? "Only the 720×450 reflow proxy is present; it is supplemental and cannot satisfy genuine 200% browser zoom."
          : "Genuine 200% browser-zoom evidence remains pending verified human review.",
    };
  }
  if (section === "11-physical-device") {
    const statuses = entries
      .filter((entry) => entry.taxonomy?.humanEvidence?.verified)
      .map((entry) => entry.taxonomy.humanEvidence.status);
    const status = statuses.length ? aggregateEvidenceStatuses(statuses, "PENDING HUMAN REVIEW") : "PENDING HUMAN REVIEW";
    return {
      status,
      statement: status === "PASS"
        ? "All required physical-device recordings were ingested, hash/size bound and reviewed as PASS."
        : status === "FAIL"
          ? "One or more hash/size-bound physical-device reviews recorded a visible failure; see the addressed recording observations and failure references."
          : "Physical-device requirements remain pending until all required human recordings are ingested, hash/size bound and actually reviewed.",
    };
  }
  return null;
}

function aggregateRequirementStatus(requirements, configuredStatus) {
  const statuses = requirements.map(({ status }) => status).filter((status) => status !== "NOT APPLICABLE");
  if (!statuses.length) return configuredStatus;
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("PENDING HUMAN REVIEW")) return "PENDING HUMAN REVIEW";
  if (statuses.includes("LIMITATION")) return "LIMITATION";
  if (statuses.includes("NOT OBSERVED")) return "NOT OBSERVED";
  return statuses.every((status) => status === "PASS") ? "PASS" : configuredStatus;
}

function evidenceRolesForRequirement(section, requirement, { posterIncluded }) {
  if (section === "00-provenance") return ["deployment verification", "dist/deployment parity"].includes(requirement) ? ["deployment-verifier"] : GENERATED_EVIDENCE_BY_SECTION[section];
  if (section === "01-baseline") return GENERATED_EVIDENCE_BY_SECTION[section];
  if (section === "02-cross-engine") {
    if (requirement.includes("screenshots")) return ["cross-engine-screenshot"];
    if (requirement.includes("recordings")) return ["cross-engine-recording"];
    return ["cross-engine-summary"];
  }
  if (section === "03-homepage-motion") return requirement === "hidden/visible behavior"
    ? ["homepage-motion-summary", "homepage-motion-recording", "r1-motion-summary", "r1-motion-recording", "memory-summary", "r1-persistent-lifecycle-summary", "physical-device-result"]
    : requirement.includes("fade") || ["fresh forward", "reverse", "fast skip", "stop-at-state", "resize/orientation"].some((token) => requirement.includes(token))
      ? ["homepage-motion-summary", "homepage-motion-recording", "r1-motion-summary", "r1-motion-recording"]
    : ["homepage-motion-summary"];
  if (section === "04-supporting-routes") {
    const direct = {
      "cross-route desktop sheet": "supporting-desktop-sheet",
      "cross-route portrait sheet": "supporting-portrait-sheet",
      "cross-route 320px sheet": "supporting-narrow-sheet",
      "cross-route 844×390 sheet": "supporting-landscape-sheet",
      "signature motion recordings": "supporting-motion-recording",
    }[requirement];
    return direct ? [direct] : ["supporting-route-summary"];
  }
  if (section === "05-history-bfcache") return ["history-bfcache-summary", "r1-persistent-lifecycle-summary"];
  if (section === "06-performance") return ["performance-summary"];
  if (section === "07-memory") return ["memory-summary", "r1-persistent-lifecycle-summary"];
  if (section === "08-network-media") return ["network-media-summary", "r1-persistent-lifecycle-summary"];
  if (section === "09-accessibility") {
    if (requirement === "axe") return ["accessibility-summary"];
    if (["keyboard", "focus", "mobile menu"].includes(requirement)) return ["accessibility-summary", "accessibility-interaction-limitation"];
    if (requirement === "200%") return ["accessibility-summary", "supplemental-reflow-proxy", "physical-device-result", "physical-device-recording"];
    return ["accessibility-summary"];
  }
  if (section === "10-poster-study") {
    if (requirement === "side-by-side comparison") return posterIncluded ? ["poster-side-by-side"] : ["packager-injected-report"];
    if (requirement === "difference images") return posterIncluded ? ["poster-difference"] : ["packager-injected-report"];
    return posterIncluded ? ["poster-study-summary", "packager-injected-report"] : ["packager-injected-report"];
  }
  if (section === "11-physical-device") return ["physical-device-result", "physical-device-recording", "packager-injected-report"];
  if (section === "12-regression") return ["regression-summary"];
  if (section === "13-package") return ["packager-generated"];
  throw new Error(`no evidence-role mapping for ${section}/${requirement}`);
}

function sectionSummary(section, metadata, existingEntries, { posterIncluded }) {
  const authority = authorityProfileForBranch(metadata.repository.branch);
  const allEvidence = existingEntries
    .filter((entry) => !entry.path.endsWith("/section-summary.json"))
    .map((entry) => ({ path: entry.path, role: entry.role, byteSize: entry.data.length, sha256: sha256(entry.data) }))
    .sort((left, right) => lexicalCompare(left.path, right.path));
  const evidence = allEvidence
    .filter((entry) => entry.path.startsWith(`${section}/`) && !entry.path.endsWith("/section-summary.json"))
    .map((entry) => ({ ...entry }));
  if (section === "01-baseline") evidence.push(
    { path: "01-baseline/PHASE_6_BASELINE.md", role: "packager-injected-report", generatedByPackager: true },
    { path: "01-baseline/PHASE_6_DEFECT_LEDGER.md", role: "packager-injected-report", generatedByPackager: true },
  );
  if (section === "01-baseline" && authority.id === "phase6-r1") evidence.push(
    { path: "01-baseline/PHASE_6_R1_VALIDATION_CLOSURE.md", role: "packager-injected-report", generatedByPackager: true },
  );
  if (section === "10-poster-study") evidence.push({ path: "10-poster-study/PHASE_6_POSTER_STUDY.md", role: "packager-injected-report", generatedByPackager: true });
  if (section === "11-physical-device") evidence.push({ path: "11-physical-device/PHASE_6_PHYSICAL_DEVICE_HANDOFF.md", role: "packager-injected-report", generatedByPackager: true });
  const configured = metadata.sections?.[section];
  if (section === "13-package") {
    evidence.push(
      { path: "MANIFEST.json", role: "packager-generated", generatedByPackager: true },
      { path: "13-package/README.md", role: "packager-generated", generatedByPackager: true },
      { path: "13-package/package-metadata.json", role: "packager-generated", generatedByPackager: true },
    );
    return {
      schema: `${SCHEMA}.section-summary`,
      section,
      status: "READY FOR PACKAGER",
      summary: "The downstream packager generates the README, canonical inventory, embedded manifest, detached manifest and separate-process independent audit.",
      requirements: BRIEF_REQUIREMENTS[section].map((requirement) => ({ requirement, status: "GENERATED BY PACKAGER", evidenceRoles: ["packager-generated"], evidence: ["MANIFEST.json", "13-package/README.md", "13-package/package-metadata.json", "detached manifest sibling", "independent audit sibling"] })),
      limitations: ["Fields 58 through 64 are intentionally populated only from the later packager/auditor result to avoid cryptographic self-reference."],
      evidence,
    };
  }
  const requirements = BRIEF_REQUIREMENTS[section].map((requirement) => {
    const override = configured.requirements?.[requirement];
    let status = override?.status ?? configured.status;
    let statement = override?.statement ?? configured.summary;
    if (section === "10-poster-study" && !posterIncluded && ["side-by-side comparison", "difference images"].includes(requirement)) {
      status = "LIMITATION";
      statement = "No optional external poster-study directory was supplied; the tracked study remains authoritative and visual comparison artifacts are explicitly absent.";
    }
    const guarded = guardedRequirementAssessment(section, requirement, existingEntries);
    if (guarded && guarded.status !== "PASS") {
      if (override && override.status !== guarded.status) {
        const promotion = override.status === "PASS" ? "false PASS promotion" : "false status promotion";
        throw new Error(`${promotion} rejected for ${section}/${requirement}: declared ${override.status}, observed ${guarded.status}`);
      }
      if (!override) {
        status = guarded.status;
        statement = guarded.statement;
      }
    }
    const evidenceRoles = override?.evidenceRoles ?? evidenceRolesForRequirement(section, requirement, { posterIncluded });
    if (!Array.isArray(evidenceRoles) || !evidenceRoles.length || evidenceRoles.some((role) => typeof role !== "string")) throw new Error(`requirement evidence role mapping differs: ${section}/${requirement}`);
    const requirementEvidence = [...allEvidence, ...evidence.filter(({ generatedByPackager }) => generatedByPackager)];
    const paths = [...new Set(requirementEvidence.filter(({ role }) => evidenceRoles.includes(role)).map(({ path: evidencePath }) => evidencePath))];
    if (status === "PASS" && !paths.length) throw new Error(`PASS requirement has no mapped evidence: ${section}/${requirement}`);
    return { requirement, status, statement, evidenceRoles, evidence: paths };
  });
  return { schema: `${SCHEMA}.section-summary`, section, status: aggregateRequirementStatus(requirements, configured.status), summary: configured.summary, requirements, limitations: configured.limitations, evidence };
}

export function validateEvidenceEntries(input, { maximumBytes = MAX_EVIDENCE_BYTES } = {}) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || maximumBytes > MAX_EVIDENCE_BYTES) throw new Error("evidence byte boundary is invalid");
  const entries = input.map((entry) => ({ ...entry, data: Buffer.from(entry.data) })).sort((left, right) => lexicalCompare(left.path, right.path));
  const paths = new Set();
  const foldedPaths = new Set();
  const hashes = new Map();
  const sections = new Map(TOPOLOGY_SECTIONS.map((section) => [section, 0]));
  let totalBytes = 0;
  for (const entry of entries) {
    assertAllowedDestination(entry.path);
    const folded = entry.path.toLowerCase();
    if (paths.has(entry.path) || foldedPaths.has(folded)) throw new Error(`duplicate evidence path: ${entry.path}`);
    paths.add(entry.path);
    foldedPaths.add(folded);
    assertPrivacySafe(entry.data, entry.path);
    const hash = sha256(entry.data);
    if (hashes.has(hash)) throw new Error(`duplicate evidence payload: ${hashes.get(hash)} and ${entry.path}`);
    hashes.set(hash, entry.path);
    totalBytes += entry.data.length;
    sections.set(entry.path.split("/", 1)[0], sections.get(entry.path.split("/", 1)[0]) + 1);
  }
  for (const [section, count] of sections) if (!count) throw new Error(`assembled evidence topology omits ${section}`);
  if (totalBytes > maximumBytes) throw new Error(`assembled evidence is ${totalBytes} bytes; maximum is ${maximumBytes}`);
  for (const reserved of RESERVED_PATHS) if (paths.has(reserved)) throw new Error(`reserved path unexpectedly present: ${reserved}`);
  return { entries, totalBytes, sections: Object.fromEntries(sections), hashes };
}

export async function buildEvidenceEntries({ sourceEvidenceRoot, finalMetadata, posterStudyDirectory = null, originalPosterDirectory = TRACKED_POSTER_DIRECTORY, verifyTrackedPosterAuthority = true, maximumBytes = MAX_EVIDENCE_BYTES }) {
  const sourceRoot = await checkedDirectory(sourceEvidenceRoot, "source evidence root");
  if (!posterStudyDirectory) throw new Error("--poster-study-directory is mandatory for a final evidence assembly");
  const posterRoot = await checkedDirectory(posterStudyDirectory, "poster-study directory");
  const metadata = validateFinalMetadata(finalMetadata, { posterStudyDirectory: posterRoot });
  const authority = authorityProfileForBranch(metadata.repository.branch);
  const entries = generatedAuthorityEntries(metadata);
  for (const record of metadata.artifacts) entries.push(await curateArtifact(sourceRoot, record, metadata));
  validateR1DeploymentNodeManifestBinding(metadata, entries);
  entries.push(finalBuildTestEntry(metadata, entries.find(({ role }) => role === "r1-node22-validation-summary") ?? null));
  validateHumanEvidenceBindings(metadata, entries);
  let posterIncluded = false;
  if (posterRoot) {
    const poster = await generatePosterEvidence(posterRoot, { originalDirectory: originalPosterDirectory, verifyTrackedAuthority: verifyTrackedPosterAuthority });
    entries.push(...poster.entries);
    posterIncluded = true;
  }
  for (const section of TOPOLOGY_SECTIONS) entries.push(jsonEntry(`${section}/section-summary.json`, sectionSummary(section, metadata, entries, { posterIncluded })));
  const preliminary = validateEvidenceEntries(entries, { maximumBytes });
  const assemblySummary = {
    schema: `${SCHEMA}.evidence-root-inventory`,
    status: "PASS",
    generatedAt: metadata.generatedAt,
    sourcePolicy: { explicitFinalSelectionsOnly: true, sourceHashesBound: true, rawFramesRetained: false, cachesRetained: false, nestedArchivesRetained: false, privatePathsRetained: false, identicalPayloadsRetained: false },
    topology: TOPOLOGY_SECTIONS,
    inventoryExcludingSelf: preliminary.entries.map((entry) => ({ path: entry.path, byteSize: entry.data.length, sha256: sha256(entry.data), role: entry.role })),
    inventoryExcludingSelfBytes: preliminary.totalBytes,
    reservedPathsAbsent: [...RESERVED_PATHS].sort(lexicalCompare),
    downstream: { packagerAddsTrackedReports: authority.id === "phase6-r1" ? 5 : 4, packagerAddsGitProvenance: true, packagerAddsManifestAndPackageMetadata: true, independentAuditIsSibling: true },
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
  };
  entries.push(jsonEntry("13-package/evidence-assembly-summary.json", assemblySummary));
  return { metadata, ...validateEvidenceEntries(entries, { maximumBytes }) };
}

function assertExternalPath(candidate, label) {
  if (typeof candidate !== "string" || !candidate) throw new Error(`${label} is required`);
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root || isWithin(ROOT, resolved)) throw new Error(`${label} must be outside the repository and filesystem root`);
  return resolved;
}

async function assertAbsent(candidate, label) {
  try { await access(candidate); throw new Error(`${label} already exists: ${candidate}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

async function writeEntry(root, entry) {
  const destination = path.join(root, ...entry.path.split("/"));
  if (!isWithin(root, destination)) throw new Error(`assembled output escaped staging root: ${entry.path}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, entry.data, { flag: "wx" });
}

export async function assembleFinalEvidence({ sourceEvidenceRoot, finalMetadataPath, outputRoot, posterStudyDirectory = null, originalPosterDirectory = TRACKED_POSTER_DIRECTORY, verifyTrackedPosterAuthority = true, maximumBytes = MAX_EVIDENCE_BYTES }) {
  const sourceRoot = await checkedDirectory(assertExternalPath(sourceEvidenceRoot, "--source-evidence-root"), "source evidence root");
  const metadataFile = assertExternalPath(finalMetadataPath, "--final-metadata");
  const metadataInfo = await lstat(metadataFile);
  if (!metadataInfo.isFile() || metadataInfo.isSymbolicLink() || path.extname(metadataFile).toLowerCase() !== ".json") throw new Error("--final-metadata must be a regular external JSON file");
  let metadata;
  try { metadata = JSON.parse((await readFile(metadataFile)).toString("utf8")); } catch { throw new Error("--final-metadata is invalid JSON"); }
  const output = assertExternalPath(outputRoot, "--output-root");
  if (isWithin(sourceRoot, output) || isWithin(output, sourceRoot)) throw new Error("source evidence and output roots must be disjoint");
  await assertAbsent(output, "output root");
  const parent = path.dirname(output);
  await mkdir(parent, { recursive: true });
  const resolvedParent = await realpath(parent);
  const canonicalOutput = path.join(resolvedParent, path.basename(output));
  assertExternalPath(canonicalOutput, "--output-root");
  await assertAbsent(canonicalOutput, "output root");
  if (!posterStudyDirectory) throw new Error("--poster-study-directory is mandatory for a final evidence assembly");
  const posterRoot = await checkedDirectory(assertExternalPath(posterStudyDirectory, "--poster-study-directory"), "poster-study directory");
  const built = await buildEvidenceEntries({ sourceEvidenceRoot: sourceRoot, finalMetadata: metadata, posterStudyDirectory: posterRoot, originalPosterDirectory, verifyTrackedPosterAuthority, maximumBytes });
  const staging = path.join(resolvedParent, `.phase6-final-evidence-${randomUUID()}`);
  if (!isWithin(resolvedParent, staging) || staging === resolvedParent) throw new Error("owned staging path is unsafe");
  await assertAbsent(staging, "staging root");
  let published = false;
  try {
    await mkdir(staging, { recursive: false });
    for (const entry of built.entries) await writeEntry(staging, entry);
    await rename(staging, canonicalOutput);
    published = true;
  } finally {
    if (!published && isWithin(resolvedParent, staging) && staging !== resolvedParent) await rm(staging, { recursive: true, force: true });
  }
  return {
    schema: `${SCHEMA}.result`,
    status: "PASS",
    outputRoot: canonicalOutput,
    entries: built.entries.length,
    bytes: built.totalBytes,
    topology: built.sections,
    evidenceAssemblySummarySha256: sha256(built.entries.find(({ path: relativePath }) => relativePath === "13-package/evidence-assembly-summary.json").data),
    posterComparisonsIncluded: Boolean(posterRoot),
  };
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = { sourceEvidenceRoot: null, finalMetadataPath: null, outputRoot: null, posterStudyDirectory: null, writeMetadataTemplate: null, generatedAt: null, authorityProfile: null, selfTest: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--source-evidence-root") options.sourceEvidenceRoot = path.resolve(next());
    else if (argument === "--final-metadata") options.finalMetadataPath = path.resolve(next());
    else if (argument === "--output-root") options.outputRoot = path.resolve(next());
    else if (argument === "--poster-study-directory") options.posterStudyDirectory = path.resolve(next());
    else if (argument === "--write-metadata-template") options.writeMetadataTemplate = path.resolve(next());
    else if (argument === "--generated-at") options.generatedAt = next();
    else if (argument === "--authority-profile") options.authorityProfile = next();
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

export function selfTest() {
  if (TOPOLOGY_SECTIONS.length !== 14 || Object.keys(BRIEF_REQUIREMENTS).length !== 14 || FINAL_HANDOFF_FIELDS.length !== 66 || Object.keys(HUMAN_REVIEW_GATES).length !== 6 || Object.values(AUTHORIZATION).some(Boolean)
    || R1_MOTION_RECORDING_SPECS.length !== 5 || Object.keys(R1_REQUIRED_ARTIFACT_ROLES).length !== 6) throw new Error("Phase 6 evidence assembler contract differs");
  return {
    schema: `${SCHEMA}.self-test`,
    status: "PASS",
    topologySections: TOPOLOGY_SECTIONS.length,
    briefRequirements: Object.values(BRIEF_REQUIREMENTS).reduce((sum, values) => sum + values.length, 0),
    mandatoryArtifactRoles: Object.keys(REQUIRED_ARTIFACT_ROLES).length,
    r1MandatoryArtifactRoles: Object.keys(R1_REQUIRED_ARTIFACT_ROLES).length,
    finalHandoffFields: FINAL_HANDOFF_FIELDS.length,
    maximumEvidenceBytes: MAX_EVIDENCE_BYTES,
    posterFamilies: POSTER_FAMILIES.map(({ id }) => id),
  };
}

function printHelp() {
  process.stdout.write([
    "Usage:",
    "  node scripts/assemble-phase6-final-evidence.mjs \\",
    "    --source-evidence-root <external-final-source-directory> \\",
    "    --final-metadata <external-final-metadata.json> \\",
    "    --output-root <fresh-external-evidence-directory> \\",
    "    --poster-study-directory <external-poster-candidates>",
    "",
    "Deterministic metadata-template helper:",
    "  node scripts/assemble-phase6-final-evidence.mjs \\",
    "    --source-evidence-root <external-final-source-directory> \\",
    "    --write-metadata-template <fresh-external-template.json> \\",
    "    --generated-at <canonical-ISO-timestamp> \\",
    "    [--authority-profile phase6|phase6-r1]",
    "",
    `Metadata schema: ${FINAL_METADATA_SCHEMA}`,
    "Every selected artifact record must set final=true, expectedSha256, status, role, source and destination.",
  ].join("\n") + "\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.selfTest) { process.stdout.write(stableJson(selfTest())); return; }
  if (options.writeMetadataTemplate) {
    if (!options.sourceEvidenceRoot || !options.generatedAt || options.finalMetadataPath || options.outputRoot || options.posterStudyDirectory) throw new Error("template mode requires --source-evidence-root, --write-metadata-template and --generated-at, with optional --authority-profile");
    const destination = assertExternalPath(options.writeMetadataTemplate, "--write-metadata-template");
    if (path.extname(destination).toLowerCase() !== ".json") throw new Error("--write-metadata-template must be a .json file");
    await assertAbsent(destination, "metadata template");
    await mkdir(path.dirname(destination), { recursive: true });
    const template = await createMetadataTemplate(assertExternalPath(options.sourceEvidenceRoot, "--source-evidence-root"), options.generatedAt, options.authorityProfile ?? "phase6");
    await writeFile(destination, stableJson(template), { flag: "wx" });
    process.stdout.write(stableJson({ schema: `${SCHEMA}.metadata-template-result`, status: "PASS", output: destination, eligibleSourceFiles: template.sourceInventory.length, rejectedSourceEntries: template.rejectedSourceInventory.length }));
    return;
  }
  if (options.authorityProfile) throw new Error("--authority-profile is only valid with --write-metadata-template");
  if (options.generatedAt) throw new Error("--generated-at is only valid with --write-metadata-template");
  process.stdout.write(stableJson(await assembleFinalEvidence(options)));
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
