#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

const SCRIPT = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
export const SCHEMA = "quantum-hub.phase-6.final-evidence-assembly.v1";
export const FINAL_METADATA_SCHEMA = `${SCHEMA}.input`;
export const MAX_EVIDENCE_BYTES = 75 * 1024 * 1024;
export const REQUIRED_BRANCH = "feature/phase-6-global-hardening";
export const REQUIRED_BRANCH_URL = "https://feature-phase-6-global-harde.qsite1.pages.dev/";
export const REQUIRED_PARENT = "005a36860ecbfd6fedb3d3f2223f168c1edfbb05";
export const FROZEN_MAIN = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const POSTER_DECISION = "NO PRODUCTION POSTER CHANGE — CURRENT AUTHORITY RETAINED";

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
const STATUS_VALUES = new Set(["PASS", "LIMITATION", "NOT APPLICABLE", "PENDING HUMAN DEVICE REVIEW"]);
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
  "accessibility-interaction-limitation": Object.freeze({ section: "09-accessibility", kind: "document", minimum: 1, engines: ["webkit"] }),
  "regression-summary": Object.freeze({ section: "12-regression", kind: "document", minimum: 1 }),
});

const OPTIONAL_ARTIFACT_ROLES = Object.freeze({
  "physical-device-result": Object.freeze({ section: "11-physical-device", kind: "document" }),
});

const JSON_ROLE_SCHEMAS = Object.freeze({
  "deployment-verifier": Object.freeze(["quantum-hub.phase-6.deployment-verification.v1"]),
  "cross-engine-summary": Object.freeze(["quantum-hub.phase-6.global-hardening.v1"]),
  "homepage-motion-summary": Object.freeze(["quantum-hub.phase-6.global-hardening.v1"]),
  "supporting-route-summary": Object.freeze(["quantum-hub.phase-6.global-hardening.v1"]),
  "history-bfcache-summary": Object.freeze(["quantum-hub.phase-6.global-hardening.v1", "quantum-hub.phase-6.performance-lifecycle.v1"]),
  "performance-summary": Object.freeze(["quantum-hub.phase-6.performance-lifecycle.v1"]),
  "memory-summary": Object.freeze(["quantum-hub.phase-6.performance-lifecycle.v1"]),
  "network-media-summary": Object.freeze(["quantum-hub.phase-6.performance-lifecycle.v1", "quantum-hub.phase-6.global-hardening.v1"]),
  "accessibility-summary": Object.freeze(["quantum-hub.phase-6.accessibility-interactions.v1", "quantum-hub.phase-6.global-hardening.v1"]),
  "accessibility-interaction-limitation": Object.freeze(["quantum-hub.phase-6.accessibility-interactions.v1"]),
  "regression-summary": Object.freeze(["quantum-hub.phase-6.repair-regressions.v1"]),
});

const GENERATED_EVIDENCE_BY_SECTION = Object.freeze({
  "00-provenance": Object.freeze(["generated-authority"]),
  "01-baseline": Object.freeze(["generated-authority", "packager-injected-report"]),
  "10-poster-study": Object.freeze(["packager-injected-report", "poster-study-summary", "poster-side-by-side", "poster-difference"]),
  "11-physical-device": Object.freeze(["packager-injected-report", "physical-device-result"]),
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
  if (physical.status !== "PASS" && physical.status !== "PENDING HUMAN DEVICE REVIEW" && physical.status !== "LIMITATION") throw new Error("physical-device status must be genuine PASS or an explicit pending/limitation status");
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

function validateArtifactRecords(artifacts) {
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
    const section = record.destination.split("/", 1)[0];
    const kind = extensionKind(record.destination);
    if (spec && (spec.section !== section || spec.kind !== kind)) throw new Error(`artifact role/destination differs: ${record.role}`);
    if (record.role === "deployment-verifier" && record.destination !== "00-provenance/deployment-verification.json") throw new Error("deployment-verifier must occupy 00-provenance/deployment-verification.json");
    if (record.role === "accessibility-interaction-limitation" && (record.status !== "LIMITATION" || record.engine !== "webkit")) throw new Error("WebKit interaction limitation must be explicit");
    if (["deployment-verifier", "cross-engine-summary", "accessibility-summary", "performance-summary"].includes(record.role) && record.status !== "PASS") throw new Error(`required PASS authority differs: ${record.role}`);
    if (record.role === "performance-summary" && path.posix.basename(record.source) !== "phase6-performance-final.json") throw new Error("performance-summary must bind phase6-performance-final.json");
    if (record.engine !== undefined && !["chromium", "webkit", "firefox"].includes(record.engine)) throw new Error(`artifact engine differs: ${record.engine}`);
    if (kind === "video") validateMediaContract(record.mediaContract, record.destination);
    else if (record.mediaContract !== undefined) throw new Error(`mediaContract is only valid for MP4 evidence: ${record.destination}`);
    if (record.select !== undefined && (!Array.isArray(record.select) || !record.select.length || record.select.some((pointer) => typeof pointer !== "string" || !pointer.startsWith("/")))) throw new Error(`artifact JSON selection differs: ${record.destination}`);
    const folded = record.destination.toLowerCase();
    if (destinations.has(folded)) throw new Error(`duplicate evidence destination: ${record.destination}`);
    destinations.add(folded);
    const selectionKey = `${record.source}\0${stableJson(record.select ?? null)}`;
    if (selectionKeys.has(selectionKey)) throw new Error(`the same source projection is selected more than once: ${record.source}`);
    selectionKeys.add(selectionKey);
  }
  for (const [role, spec] of Object.entries(REQUIRED_ARTIFACT_ROLES)) {
    const matching = artifacts.filter((record) => record.role === role);
    if (matching.length < spec.minimum) throw new Error(`mandatory evidence role is missing: ${role}`);
    if (spec.engines) {
      const engines = new Set(matching.map(({ engine }) => engine));
      for (const engine of spec.engines) if (!engines.has(engine)) throw new Error(`${role} omits ${engine}`);
    }
  }
  return artifacts;
}

export function validateFinalMetadata(input, { posterStudyDirectory = null } = {}) {
  const metadata = sanitizeJsonValue(input, "final metadata");
  if (metadata.schema !== FINAL_METADATA_SCHEMA || metadata.status !== "READY") throw new Error("final metadata schema/status differs");
  validateIsoTimestamp(metadata.generatedAt, "final metadata generatedAt");
  const repository = metadata.repository;
  if (!repository || repository.branch !== REQUIRED_BRANCH || repository.exactParent !== REQUIRED_PARENT || !HASH40.test(repository.finalHead ?? "") || !HASH40.test(repository.directParent ?? "") || repository.cleanTree !== true) throw new Error("final repository authority differs");
  if (repository.localHead !== repository.finalHead || repository.upstreamHead !== repository.finalHead || repository.liveHead !== repository.finalHead) throw new Error("local/upstream/live HEAD parity differs");
  if (!repository.main || repository.main.local !== FROZEN_MAIN || repository.main.upstream !== FROZEN_MAIN || repository.main.public !== FROZEN_MAIN || repository.main.modifiedOrMerged !== false) throw new Error("frozen main authority differs");
  if (!Array.isArray(repository.commitChain) || !repository.commitChain.length) throw new Error("linear commit chain is required");
  let expectedParent = REQUIRED_PARENT;
  const commitShas = new Set();
  for (const record of repository.commitChain) {
    if (!HASH40.test(record?.sha ?? "") || commitShas.has(record.sha) || !Array.isArray(record.parents) || record.parents.length !== 1 || record.parents[0] !== expectedParent || typeof record.subject !== "string" || !record.subject.trim()) throw new Error(`linear commit chain differs at ${record?.sha ?? "unknown"}`);
    commitShas.add(record.sha);
    expectedParent = record.sha;
  }
  if (repository.commitChain.at(-1).sha !== repository.finalHead || repository.directParent !== repository.commitChain.at(-1).parents[0]) throw new Error("final HEAD/direct-parent binding differs from commit chain");
  const deployment = metadata.deployment;
  if (!deployment || !UUID.test(deployment.id ?? "") || deployment.deployedSha !== repository.finalHead || deployment.parity !== "PASS" || deployment.headers !== "PASS" || deployment.real404 !== "PASS" || deployment.canonical !== "PASS" || deployment.productionMainDeployed !== false) throw new Error("final deployment authority differs");
  deployment.immutableUrl = normalizeHttps(deployment.immutableUrl, "immutable URL");
  deployment.branchUrl = normalizeHttps(deployment.branchUrl, "branch URL");
  const immutable = new URL(deployment.immutableUrl);
  const branch = new URL(deployment.branchUrl);
  if (immutable.pathname !== "/" || branch.pathname !== "/" || immutable.hostname !== `${deployment.id.slice(0, 8)}.qsite1.pages.dev` || deployment.branchUrl !== REQUIRED_BRANCH_URL || deployment.immutableUrl === deployment.branchUrl) throw new Error("deployment URL/UUID binding differs");
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
  for (const record of changes.newTrackedFilesAbove1MiB ?? []) if (!Number.isSafeInteger(record.bytes) || record.bytes <= 1024 * 1024 || typeof record.justification !== "string" || !record.justification.trim()) throw new Error(`large tracked file justification differs: ${record.path}`);
  const verification = metadata.verification;
  if (!verification || verification.build?.status !== "PASS" || verification.tests?.status !== "PASS" || !Number.isSafeInteger(verification.tests.total) || verification.tests.total <= 0 || !Number.isSafeInteger(verification.tests.passed) || !Number.isSafeInteger(verification.tests.skipped) || verification.tests.failed !== 0 || verification.tests.total !== verification.tests.passed + verification.tests.failed + verification.tests.skipped || verification.publication?.status !== "PASS" || verification.routeBudgets?.status !== "PASS") throw new Error("final build/test/publication/budget verification is incomplete");
  if (!metadata.baseline?.acceptedPhase5bReferenceHashes || !Object.keys(metadata.baseline.acceptedPhase5bReferenceHashes).length || !metadata.baseline?.initialBrowserRuntimeInventory || !Object.keys(metadata.baseline.initialBrowserRuntimeInventory).length) throw new Error("baseline reference/runtime inventory is incomplete");
  if (!Array.isArray(metadata.limitations) || !metadata.limitations.length || metadata.limitations.some((value) => typeof value !== "string" || !value.trim())) throw new Error("genuine unresolved limitations are required");
  if (stableJson(metadata.humanReviewGates) !== stableJson(HUMAN_REVIEW_GATES) || stableJson(metadata.authorization) !== stableJson(AUTHORIZATION)) throw new Error("human-review gate or authorization policy differs");
  validateArtifactRecords(metadata.artifacts);
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
          item.compatibleRoles = Object.entries(JSON_ROLE_SCHEMAS).filter(([, schemas]) => schemas.includes(item.schema)).map(([role]) => role);
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

export async function createMetadataTemplate(sourceEvidenceRoot, generatedAt = new Date().toISOString()) {
  validateIsoTimestamp(generatedAt, "template generatedAt");
  const inventory = await inventorySourceEvidence(sourceEvidenceRoot);
  return {
    schema: `${FINAL_METADATA_SCHEMA}.template`,
    status: "TEMPLATE — REPLACE WITH READY AFTER ALL PLACEHOLDERS ARE RESOLVED",
    generatedAt,
    instructions: [
      `Set schema to ${FINAL_METADATA_SCHEMA} and status to READY only after every placeholder is resolved.`,
      "Choose only final evidence from sourceInventory. Copy its exact sha256 into expectedSha256; the assembler independently re-hashes every selected file.",
      "Create at least one artifact for every required role. MP4 selections also require the exact mediaContract shown in artifactRecordTemplate.",
      "Section requirement rows are generated from the brief and role contract; do not hand-author 104 repetitive mappings unless a requirement needs an explicit limitation override.",
    ],
    authorityConstants: { requiredBranch: REQUIRED_BRANCH, requiredParent: REQUIRED_PARENT, frozenMain: FROZEN_MAIN, posterDecision: POSTER_DECISION },
    sourceInventory: inventory.eligible,
    rejectedSourceInventory: inventory.rejected,
    artifactRoleContract: Object.fromEntries(Object.entries(REQUIRED_ARTIFACT_ROLES).map(([role, spec]) => [role, spec])),
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
    repository: { branch: REQUIRED_BRANCH, exactParent: REQUIRED_PARENT, finalHead: "<40-char final SHA>", directParent: "<40-char direct parent>", cleanTree: true, localHead: "<final SHA>", upstreamHead: "<final SHA>", liveHead: "<final SHA>", main: { local: FROZEN_MAIN, upstream: FROZEN_MAIN, public: FROZEN_MAIN, modifiedOrMerged: false }, commitChain: [] },
    deployment: { id: "<lowercase Cloudflare deployment UUID>", immutableUrl: "<https://first-8-uuid.qsite1.pages.dev/>", branchUrl: REQUIRED_BRANCH_URL, deployedSha: "<final SHA>", parity: "PASS", headers: "PASS", real404: "PASS", canonical: "PASS", productionMainDeployed: false },
    evidenceContext: { browserQa: { origin: "LOCAL", baseUrl: "http://127.0.0.1:4338/" }, deploymentBinding: { method: "DEPLOYMENT_VERIFIER_LOCAL_DIST_ORIGIN_BYTE_PARITY", status: "PASS", verifierArtifactRole: "deployment-verifier" } },
    changes: { productionFiles: [], toolingReportFiles: [], trackedFileDelta: 0, trackedByteDelta: 0, newTrackedFilesAbove1MiB: [] },
    verification: { build: { status: "PASS" }, tests: { status: "PASS", total: 0, passed: 0, failed: 0, skipped: 0 }, publication: { status: "PASS" }, routeBudgets: { status: "PASS" } },
    baseline: { acceptedPhase5bReferenceHashes: {}, initialBrowserRuntimeInventory: {} },
    limitations: ["<at least one genuine unresolved limitation>"],
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
    sections: Object.fromEntries(TOPOLOGY_SECTIONS.slice(0, -1).map((section) => [section, {
      status: section === "11-physical-device" ? "PENDING HUMAN DEVICE REVIEW" : "PASS",
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
  if (bytes.length < 12 || bytes.subarray(4, 8).toString("ascii") !== "ftyp") throw new Error(`MP4 container signature failed: ${label}`);
  return true;
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

export function validateDocumentAuthority(record, document, metadata) {
  const engine = record.engine;
  if (record.role === "deployment-verifier") {
    const inputs = document.inputs;
    if (document.status !== "PASS"
      || inputs?.expectedHead !== metadata.repository.finalHead
      || inputs?.acceptedBase !== REQUIRED_PARENT
      || inputs?.expectedMain !== FROZEN_MAIN
      || inputs?.branch !== REQUIRED_BRANCH
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
      || document.status !== "PASS"
      || (engine === "webkit" && document.axeOnly !== true)) throw new Error(`accessibility exact tuple differs: ${engine ?? "missing"}`);
  }
  if (record.role === "accessibility-interaction-limitation") {
    if (document.baseUrl !== metadata.evidenceContext.browserQa.baseUrl
      || document.engine !== "webkit"
      || !Array.isArray(document.engines) || document.engines.length !== 1 || document.engines[0]?.engine !== "webkit"
      || !Array.isArray(document.selectedEngines) || document.selectedEngines.length !== 1 || document.selectedEngines[0] !== "webkit"
      || document.status !== "FAIL"
      || document.summary?.engineErrors < 1
      || document.summary?.failures < 1
      || !Array.isArray(document.failures)
      || !document.failures.length) throw new Error("WebKit interaction limitation source differs");
  }
  if (record.role === "regression-summary") {
    if (document.status !== "PASS" || document.target?.baseUrl !== metadata.evidenceContext.browserQa.baseUrl || document.checks?.length !== 7 || document.checks.some((check) => check?.status !== "PASS") || document.sharedDom?.status !== "PASS" || !Array.isArray(document.sharedDom?.assertions) || document.sharedDom.assertions.some((assertion) => assertion?.pass !== true) || document.failures?.length !== 0) throw new Error("repair-regression exact tuple differs");
  }
}

async function curateArtifact(sourceRoot, record, metadata) {
  const { bytes } = await checkedSourceFile(sourceRoot, record.source);
  if (sha256(bytes) !== record.expectedSha256) throw new Error(`final source SHA-256 differs: ${record.source}`);
  const sourceExtension = path.posix.extname(record.source).toLowerCase();
  const destinationExtension = path.posix.extname(record.destination).toLowerCase();
  const kind = extensionKind(record.destination);
  let data;
  let media = null;
  if (destinationExtension === ".json") {
    if (sourceExtension !== ".json") throw new Error(`JSON evidence destination requires JSON source: ${record.destination}`);
    let document;
    try { document = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`invalid source JSON: ${record.source}`); }
    const sourceStatus = String(document?.status ?? "").toUpperCase();
    if (["FAIL", "ERROR"].includes(sourceStatus) && record.status !== "LIMITATION") throw new Error(`failed JSON report requires an explicit LIMITATION artifact: ${record.source}`);
    const acceptedSchemas = JSON_ROLE_SCHEMAS[record.role];
    if (acceptedSchemas && !acceptedSchemas.includes(document?.schema)) throw new Error(`source JSON schema differs for ${record.role}: ${record.source}`);
    if (record.status === "PASS" && String(document?.status ?? "").toUpperCase() !== "PASS") throw new Error(`PASS artifact requires a PASS source report: ${record.source}`);
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
        ...(record.limitation ? { limitation: record.limitation, sourceStatus } : {}),
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
    validateMp4(bytes, record.source);
    media = await validateCaptureBoundMedia(sourceRoot, record, bytes);
    data = Buffer.from(bytes);
  } else throw new Error(`unsupported evidence artifact: ${record.destination}`);
  assertPrivacySafe(data, record.destination);
  return { path: record.destination, data, source: record.source, role: record.role, ...(record.engine ? { engine: record.engine } : {}), ...(media ? { media } : {}) };
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
    jsonEntry("00-provenance/final-build-test.json", { schema: `${SCHEMA}.final-build-test`, status: "PASS", build: verification.build, tests: verification.tests, publication: verification.publication, routeBudgets: verification.routeBudgets }),
    textEntry("00-provenance/final-limitations.md", limitations),
    jsonEntry("00-provenance/final-handoff-seed.json", finalHandoffSeed(metadata)),
    jsonEntry("01-baseline/accepted-phase5b-reference-hashes.json", { schema: `${SCHEMA}.accepted-phase5b-reference-hashes`, status: "PASS", hashes: metadata.baseline.acceptedPhase5bReferenceHashes }),
    jsonEntry("01-baseline/initial-browser-runtime-inventory.json", { schema: `${SCHEMA}.initial-browser-runtime-inventory`, status: "PASS", inventory: metadata.baseline.initialBrowserRuntimeInventory }),
  ].map((entry) => ({ ...entry, role: "generated-authority" }));
}

function evidenceRolesForRequirement(section, requirement, { posterIncluded, physicalStatus }) {
  if (section === "00-provenance") return ["deployment verification", "dist/deployment parity"].includes(requirement) ? ["deployment-verifier"] : GENERATED_EVIDENCE_BY_SECTION[section];
  if (section === "01-baseline") return GENERATED_EVIDENCE_BY_SECTION[section];
  if (section === "02-cross-engine") {
    if (requirement.includes("screenshots")) return ["cross-engine-screenshot"];
    if (requirement.includes("recordings")) return ["cross-engine-recording"];
    return ["cross-engine-summary"];
  }
  if (section === "03-homepage-motion") return requirement.includes("fade") || ["fresh forward", "reverse", "fast skip", "stop-at-state", "resize/orientation", "hidden/visible"].some((token) => requirement.includes(token))
    ? ["homepage-motion-summary", "homepage-motion-recording"]
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
  if (section === "05-history-bfcache") return ["history-bfcache-summary"];
  if (section === "06-performance") return ["performance-summary"];
  if (section === "07-memory") return ["memory-summary"];
  if (section === "08-network-media") return ["network-media-summary"];
  if (section === "09-accessibility") return ["accessibility-summary", "accessibility-interaction-limitation"];
  if (section === "10-poster-study") {
    if (requirement === "side-by-side comparison") return posterIncluded ? ["poster-side-by-side"] : ["packager-injected-report"];
    if (requirement === "difference images") return posterIncluded ? ["poster-difference"] : ["packager-injected-report"];
    return posterIncluded ? ["poster-study-summary", "packager-injected-report"] : ["packager-injected-report"];
  }
  if (section === "11-physical-device") return physicalStatus === "PASS" ? ["physical-device-result"] : ["packager-injected-report"];
  if (section === "12-regression") return ["regression-summary"];
  if (section === "13-package") return ["packager-generated"];
  throw new Error(`no evidence-role mapping for ${section}/${requirement}`);
}

function sectionSummary(section, metadata, existingEntries, { posterIncluded }) {
  const evidence = existingEntries
    .filter((entry) => entry.path.startsWith(`${section}/`) && !entry.path.endsWith("/section-summary.json"))
    .map((entry) => ({ path: entry.path, role: entry.role, byteSize: entry.data.length, sha256: sha256(entry.data) }))
    .sort((left, right) => lexicalCompare(left.path, right.path));
  if (section === "01-baseline") evidence.push(
    { path: "01-baseline/PHASE_6_BASELINE.md", role: "packager-injected-report", generatedByPackager: true },
    { path: "01-baseline/PHASE_6_DEFECT_LEDGER.md", role: "packager-injected-report", generatedByPackager: true },
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
    if (section === "11-physical-device" && configured.status !== "PASS") status = "PENDING HUMAN DEVICE REVIEW";
    const evidenceRoles = override?.evidenceRoles ?? evidenceRolesForRequirement(section, requirement, { posterIncluded, physicalStatus: configured.status });
    if (!Array.isArray(evidenceRoles) || !evidenceRoles.length || evidenceRoles.some((role) => typeof role !== "string")) throw new Error(`requirement evidence role mapping differs: ${section}/${requirement}`);
    const paths = evidence.filter(({ role }) => evidenceRoles.includes(role)).map(({ path: evidencePath }) => evidencePath);
    if (status === "PASS" && !paths.length) throw new Error(`PASS requirement has no mapped evidence: ${section}/${requirement}`);
    return { requirement, status, statement, evidenceRoles, evidence: paths };
  });
  return { schema: `${SCHEMA}.section-summary`, section, status: configured.status, summary: configured.summary, requirements, limitations: configured.limitations, evidence };
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
  const entries = generatedAuthorityEntries(metadata);
  for (const record of metadata.artifacts) entries.push(await curateArtifact(sourceRoot, record, metadata));
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
    downstream: { packagerAddsTrackedReports: 4, packagerAddsGitProvenance: true, packagerAddsManifestAndPackageMetadata: true, independentAuditIsSibling: true },
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
  const options = { sourceEvidenceRoot: null, finalMetadataPath: null, outputRoot: null, posterStudyDirectory: null, writeMetadataTemplate: null, generatedAt: null, selfTest: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--source-evidence-root") options.sourceEvidenceRoot = path.resolve(next());
    else if (argument === "--final-metadata") options.finalMetadataPath = path.resolve(next());
    else if (argument === "--output-root") options.outputRoot = path.resolve(next());
    else if (argument === "--poster-study-directory") options.posterStudyDirectory = path.resolve(next());
    else if (argument === "--write-metadata-template") options.writeMetadataTemplate = path.resolve(next());
    else if (argument === "--generated-at") options.generatedAt = next();
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

export function selfTest() {
  if (TOPOLOGY_SECTIONS.length !== 14 || Object.keys(BRIEF_REQUIREMENTS).length !== 14 || FINAL_HANDOFF_FIELDS.length !== 66 || Object.keys(HUMAN_REVIEW_GATES).length !== 6 || Object.values(AUTHORIZATION).some(Boolean)) throw new Error("Phase 6 evidence assembler contract differs");
  return {
    schema: `${SCHEMA}.self-test`,
    status: "PASS",
    topologySections: TOPOLOGY_SECTIONS.length,
    briefRequirements: Object.values(BRIEF_REQUIREMENTS).reduce((sum, values) => sum + values.length, 0),
    mandatoryArtifactRoles: Object.keys(REQUIRED_ARTIFACT_ROLES).length,
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
    "    --generated-at <canonical-ISO-timestamp>",
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
    if (!options.sourceEvidenceRoot || !options.generatedAt || options.finalMetadataPath || options.outputRoot || options.posterStudyDirectory) throw new Error("template mode requires only --source-evidence-root, --write-metadata-template and --generated-at");
    const destination = assertExternalPath(options.writeMetadataTemplate, "--write-metadata-template");
    if (path.extname(destination).toLowerCase() !== ".json") throw new Error("--write-metadata-template must be a .json file");
    await assertAbsent(destination, "metadata template");
    await mkdir(path.dirname(destination), { recursive: true });
    const template = await createMetadataTemplate(assertExternalPath(options.sourceEvidenceRoot, "--source-evidence-root"), options.generatedAt);
    await writeFile(destination, stableJson(template), { flag: "wx" });
    process.stdout.write(stableJson({ schema: `${SCHEMA}.metadata-template-result`, status: "PASS", output: destination, eligibleSourceFiles: template.sourceInventory.length, rejectedSourceEntries: template.rejectedSourceInventory.length }));
    return;
  }
  if (options.generatedAt) throw new Error("--generated-at is only valid with --write-metadata-template");
  process.stdout.write(stableJson(await assembleFinalEvidence(options)));
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
