import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FROZEN_MAIN,
  PHASE7A_GATES,
  PHASE7A_PARENT,
  PHASE7A_R1_BRANCH,
  PHASE7A_R1_PARENT,
  PHASE7A_R1_REVIEW_ZIP_NAME,
  PHYSICAL_ASSETS,
  PUBLIC_ROUTES,
} from "./phase7a-contract.mjs";
import { REAL_404_PATH } from "./phase7a-browser-contract.mjs";
import { parseStoredZip } from "./audit-phase7a-human-review-package.mjs";
import { PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS, validateManifestoGeometry } from "./phase7a-manifesto-geometry.mjs";
import { assertTargetSizePass } from "./phase7a-target-size.mjs";
import { validateScenarioStates } from "./capture-phase7a-review-evidence.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
export const PACKAGE_SCHEMA = "quantum-hub.phase-7a-r1.signal-field-authority-human-review.v1";
export const DETACHED_SCHEMA = `${PACKAGE_SCHEMA}.detached-manifest`;
export const AUDIT_SCHEMA = `${PACKAGE_SCHEMA}.independent-audit`;
export const GOVERNANCE_SCHEMA = "quantum-hub.phase-7a-r1.external-evidence-governance.v1";
export const GOVERNANCE_PATH = "00-authority/evidence-governance.json";
export const SERVED_BUILD_AUTHORITY_SCHEMA = "quantum-hub.phase-7a-r1.served-build-authority.v1";
export const SERVED_BUILD_AUTHORITY_PATH = "01-provenance/served-build-authority.json";
export const PORTABLE_SERVED_BUILD_SCHEMA = "quantum-hub.phase-7a-r1.portable-served-build-receipt.v1";
export const FIREFOX_FIRST_PAINT_SCHEMA = "quantum-hub.phase-7a-r1.firefox-first-paint.v1";
const FIREFOX_FIRST_PAINT_PASS = "earlier white frame not reproduced; evidence is consistent with capture initialization or browser/window exposure rather than page paint";
const FIREFOX_FIRST_PAINT_LIMITATION = "white frame belongs to capture initialization or browser/window exposure; document dark-background authority was present";
const FIREFOX_FIRST_PAINT_ORDER = Object.freeze(["navigation-commit", "html-attached", "navigation-start-screenshot", "response-body-read-start", "response-body-read-complete", "first-stable-paint-screenshot"]);
const INSTALLED_CHROME_UI_SCHEMA = "quantum-hub.phase-7a-r1.installed-chrome-ui-evidence.v1";
const EXACT_PARENT_HOME_DOCUMENT = Object.freeze({
  bytes: 17917,
  revision: PHASE7A_R1_PARENT,
  sha256: "2c153d9094fe0ca888cbbc7ac4105a775b2ac5b088b47b650d542c2a9cb62cac",
});
const EXACT_PARENT_RUNTIME_ASSETS = Object.freeze({
  derivation: "immutable linked CSS/JavaScript bytes from the exact-parent governed build",
  fingerprint: "223c3e7a5fce599b7818e3f19d3c786e4f67fca85b5fcc60f9f1e3d58304b3d7",
  records: Object.freeze([
    Object.freeze({ kind: "css", route: "/_astro/BaseLayout.ByjrAQMG.css", bytes: 12_579, sha256: "0967a69765cc49c6291e125d44958bb19694d1c74fe028e17f6f095bd1109f68" }),
    Object.freeze({ kind: "css", route: "/_astro/index.CMvgVrhb.css", bytes: 17_131, sha256: "a9932a0eed64df5c5a5ebc35067b003558644bbddb8c179227364c1b340c0691" }),
    Object.freeze({ kind: "javascript", route: "/_astro/index.astro_astro_type_script_index_0_lang.DuXUZIF3.js", bytes: 2_604, sha256: "05006aae308ac99e9f16bb4c7d93b75f41e8766ea06aaf9d8c3d19fb1a7bb52a" }),
  ]),
});
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const REVIEW_ZIP_NAME = PHASE7A_R1_REVIEW_ZIP_NAME;
export const DETACHED_MANIFEST_NAME = REVIEW_ZIP_NAME.replace(/\.zip$/i, ".manifest.json");
export const INDEPENDENT_AUDIT_NAME = REVIEW_ZIP_NAME.replace(/\.zip$/i, ".audit.json");
export const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;

const required = (relativePath, role) => Object.freeze({ relativePath, role });
export const REQUIRED_EVIDENCE = Object.freeze([
  required(GOVERNANCE_PATH, "evidence-governance"),
  required("00-authority/task-authority.md", "task-authority"),
  required("00-authority/prior-human-decisions.json", "prior-human-decisions"),
  required("00-authority/current-human-gates.json", "current-human-gates"),
  required("01-provenance/provenance.json", "provenance"),
  required(SERVED_BUILD_AUTHORITY_PATH, "served-build-authority"),
  required("02-diff/production.diff", "production-diff"),
  required("03-responsive/clipping-report.json", "responsive-clipping"),
  required("04-signal-field/before-after-report.json", "signal-field-before-after"),
  required("05-audience/bifurcation-report.json", "audience-bifurcation"),
  required("06-typography/typography-report.json", "typography"),
  required("07-field-map/semantic-isolation-report.json", "field-map-semantic-isolation"),
  required("08-targets/target-size-inventory.json", "target-size-inventory"),
  required("09-chrome-200/installed-chrome-200-percent-report.json", "installed-chrome-200"),
  required("10-firefox/firefox-first-paint-report.json", "firefox-first-paint"),
  required("11-accessibility/accessibility-report.json", "accessibility"),
  required("12-fallback/reduced-motion-report.json", "reduced-motion"),
  required("12-fallback/no-js-report.json", "no-js"),
  required("12-fallback/fallback-font-report.json", "fallback-fonts"),
  required("13-performance/performance-and-lifecycle-report.json", "performance-and-lifecycle"),
  required("14-network/network-report.json", "network"),
  required("15-publication/publication-regression.json", "publication-regression"),
  required("16-phase4/phase-4-hash-verification.json", "phase-4-hashes"),
  required("17-deployment/deployment-verification.json", "deployment-verification"),
  required("18-limitations/environmental-limitations.json", "environmental-limitations"),
]);

const GENERAL_RECORDING_SCENARIOS = Object.freeze([
  "complete-threshold-entry",
  "complete-reverse",
  "stop-states",
  "home-intent",
  "responsive-authority",
  "reduced-motion-and-no-js",
  "typography",
]);
export const REQUIRED_GENERAL_RECORDING_PATHS = Object.freeze(["chromium", "firefox"].flatMap((engine) =>
  GENERAL_RECORDING_SCENARIOS.map((scenario) => `19-recordings/${engine}-${scenario}.mp4`)));
export const REQUIRED_COMPARISON_RECORDING_PATHS = Object.freeze(["chromium", "firefox"].flatMap((engine) => [
  `04-signal-field/recordings/${engine}-before-parent.mp4`,
  `04-signal-field/recordings/${engine}-after-r1.mp4`,
]));
export const REQUIRED_RECORDING_PATHS = Object.freeze([...REQUIRED_GENERAL_RECORDING_PATHS, ...REQUIRED_COMPARISON_RECORDING_PATHS]);

const ROLE_BY_PATH = new Map(REQUIRED_EVIDENCE.map(({ relativePath, role }) => [relativePath, role]));
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".diff", ".html", ".csv"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const ALLOWED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS, ".mp4"]);
const ARCHIVE_EXTENSIONS = new Set([".zip", ".7z", ".rar", ".tar", ".tgz", ".gz", ".bz2", ".xz"]);
const FONT_EXTENSIONS = new Set([".woff", ".woff2", ".ttf", ".otf"]);
const SOURCE_MEDIA_EXTENSIONS = new Set([".mov", ".mkv", ".avi", ".webm", ".m4v", ".blend", ".exr", ".tif", ".tiff"]);
const FORBIDDEN_SEGMENT = /^(?:node_modules|src|source|sources|raw|raw[-_ ]?(?:media|frames?|traces?)|traces?|frames?|heap[-_ ]?dumps?|profiles?|caches?|\.git|\.astro|\.cache|private|secrets?|credentials?|__pycache__)$/i;
const RAW_TRACE_EXTENSION = /\.(?:trace|har|heapsnapshot|cpuprofile|pcap|log)(?:\.json)?$/i;
const DATA_FONT_BASE64 = /data\s*:\s*(?:font\/[^,;\s]+|application\/(?:x-)?(?:font|woff|ttf|otf)[^,;\s]*)(?:;[^,\s]*)?;base64\s*,/i;
const WINDOWS_PRIVATE_PATH = /(?:^|[\s"'=(\[])\p{L}:[\\/]/imu;
const POSIX_PRIVATE_PATH = /(?:^|[\s"'=(\[])\/(?:Users|home|tmp|private|root|workspace|workspaces|var\/folders|mnt\/[a-z])(?:\/|\b)/imu;
const PRIVATE_MARKER = /(?:^|[\\/])\.codex(?:[\\/]|$)|\b(?:OneDrive|AppData|LocalCache)\b|file:\/\/|\\\\[^\\\s]+\\[^\\\s]+/i;
const SECRET_MARKER = /(?:github_pat_[a-z0-9_]+|gh[pousr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;
const RAW_PHASE4_MEDIA_HASHES = new Set(PHYSICAL_ASSETS
  .filter(([assetPath]) => /public\/media\/cinematic\/phase-4r2\/(?:media|posters)\//.test(assetPath))
  .map(([_assetPath, hash]) => hash));

export const PRIOR_HUMAN_DECISIONS = Object.freeze([
  Object.freeze({ gate: PHASE7A_GATES[0], status: "ACCEPT" }),
  Object.freeze({ gate: PHASE7A_GATES[1], status: "ACCEPT" }),
  Object.freeze({ gate: PHASE7A_GATES[2], status: "REPAIR" }),
  Object.freeze({ gate: PHASE7A_GATES[3], status: "REPAIR" }),
  Object.freeze({ gate: PHASE7A_GATES[4], status: "ACCEPT" }),
  Object.freeze({ gate: PHASE7A_GATES[5], status: "REPAIR" }),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

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

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function safeEvidencePath(value, label = "ZIP entry") {
  invariant(typeof value === "string" && value.length > 0 && value.length <= 512, `${label} must be a non-empty portable path`);
  invariant(!value.includes("\\") && !value.includes("\0") && !value.startsWith("/") && !/^[a-z]:/i.test(value), `${label} must be relative and portable`);
  invariant(!/%(?:2e|2f|5c)/i.test(value) && !/[?#:]/.test(value), `${label} contains URL/path reinterpretation syntax`);
  const parts = value.split("/");
  invariant(parts.every((part) => part && part !== "." && part !== ".." && !/[. ]$/.test(part)), `${label} contains an unsafe segment`);
  invariant(path.posix.normalize(value) === value, `${label} is not canonical`);
  return value;
}

export function assertAllowedEntryPath(relativePath) {
  safeEvidencePath(relativePath);
  if (relativePath === IN_ARCHIVE_MANIFEST) return true;
  const parts = relativePath.split("/");
  invariant(!parts.some((part) => FORBIDDEN_SEGMENT.test(part)), `forbidden source/raw/cache/private path: ${relativePath}`);
  const extension = path.posix.extname(relativePath).toLowerCase();
  invariant(!ARCHIVE_EXTENSIONS.has(extension), `nested archive is forbidden: ${relativePath}`);
  invariant(!FONT_EXTENSIONS.has(extension), `font binary is forbidden: ${relativePath}`);
  invariant(!SOURCE_MEDIA_EXTENSIONS.has(extension) && !RAW_TRACE_EXTENSION.test(relativePath), `raw trace or source media is forbidden: ${relativePath}`);
  invariant(ALLOWED_EXTENSIONS.has(extension), `unsupported review payload type: ${relativePath}`);
  return true;
}

function textForScan(bytes, relativePath) {
  const data = Buffer.from(bytes);
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension) || relativePath === IN_ARCHIVE_MANIFEST) return data.toString("utf8");
  return (data.toString("latin1").match(/[\x20-\x7e]{20,}/g) ?? []).join("\n");
}

export function assertNoPrivateOrSecretPayload(bytes, relativePath) {
  const text = textForScan(bytes, relativePath);
  invariant(!WINDOWS_PRIVATE_PATH.test(relativePath) && !POSIX_PRIVATE_PATH.test(relativePath) && !PRIVATE_MARKER.test(relativePath), `private local path in ZIP entry name: ${relativePath}`);
  invariant(!WINDOWS_PRIVATE_PATH.test(text) && !POSIX_PRIVATE_PATH.test(text) && !PRIVATE_MARKER.test(text), `private local path in ZIP payload: ${relativePath}`);
  invariant(!SECRET_MARKER.test(text), `secret-shaped content in ZIP payload: ${relativePath}`);
  invariant(!DATA_FONT_BASE64.test(text), `embedded data:font/base64 payload is forbidden: ${relativePath}`);
  return true;
}

function assertImageSignature(bytes, relativePath) {
  const data = Buffer.from(bytes);
  const extension = path.posix.extname(relativePath).toLowerCase();
  let valid = false;
  if (extension === ".png") valid = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  else if (extension === ".jpg" || extension === ".jpeg") valid = data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data.at(-2) === 0xff && data.at(-1) === 0xd9;
  else if (extension === ".webp") valid = data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  else if (extension === ".avif") valid = data.length >= 12 && data.toString("ascii", 4, 8) === "ftyp" && /avif|avis/.test(data.toString("ascii", 8, 32));
  invariant(valid, `raster signature differs from extension: ${relativePath}`);
}

function assertMp4Signature(bytes, relativePath) {
  const data = Buffer.from(bytes);
  invariant(data.length >= 24, `recording is too small: ${relativePath}`);
  const types = [];
  let cursor = 0;
  while (cursor < data.length) {
    invariant(cursor + 8 <= data.length, `recording box header is truncated: ${relativePath}`);
    let size = data.readUInt32BE(cursor);
    const type = data.toString("ascii", cursor + 4, cursor + 8);
    let header = 8;
    if (size === 1) {
      invariant(cursor + 16 <= data.length, `recording extended box is truncated: ${relativePath}`);
      const extended = data.readBigUInt64BE(cursor + 8);
      invariant(extended <= BigInt(Number.MAX_SAFE_INTEGER), `recording box exceeds safe size: ${relativePath}`);
      size = Number(extended);
      header = 16;
    } else if (size === 0) size = data.length - cursor;
    invariant(size >= header && cursor + size <= data.length, `recording box boundary differs: ${relativePath}`);
    types.push(type);
    cursor += size;
  }
  invariant(cursor === data.length && types[0] === "ftyp" && types.includes("moov") && types.includes("mdat"), `recording is not complete ISO-BMFF: ${relativePath}`);
}

export function assertPayloadSignature(bytes, relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (extension === ".json" || relativePath === IN_ARCHIVE_MANIFEST) {
    try { JSON.parse(Buffer.from(bytes).toString("utf8")); }
    catch { throw new Error(`invalid JSON payload: ${relativePath}`); }
  } else if (IMAGE_EXTENSIONS.has(extension)) assertImageSignature(bytes, relativePath);
  else if (extension === ".mp4") assertMp4Signature(bytes, relativePath);
  return true;
}

function parseJsonEntry(entries, relativePath) {
  const entry = entries.get(relativePath);
  invariant(entry, `required R1 evidence is missing: ${relativePath}`);
  try { return JSON.parse(entry.data.toString("utf8")); }
  catch { throw new Error(`invalid required JSON evidence: ${relativePath}`); }
}

function gateRows(document, label) {
  const rows = document?.gates ?? document?.humanReviewGates ?? document;
  invariant(Array.isArray(rows), `${label} must contain a gates array`);
  return rows.map((row) => ({ gate: row?.gate ?? row?.name, status: row?.status }));
}

function validateGateAuthority(entries) {
  const prior = gateRows(parseJsonEntry(entries, "00-authority/prior-human-decisions.json"), "prior human decisions");
  invariant(sameJson(prior, PRIOR_HUMAN_DECISIONS), "prior human decisions differ from the accepted/repair record");
  const current = gateRows(parseJsonEntry(entries, "00-authority/current-human-gates.json"), "current human gates");
  const expected = PHASE7A_GATES.map((gate) => ({ gate, status: "PENDING HUMAN REVIEW" }));
  invariant(sameJson(current, expected), "all six current Phase 7A gates must remain PENDING HUMAN REVIEW");
}

function validatePhase4Hashes(entries) {
  const relativePath = "16-phase4/phase-4-hash-verification.json";
  const report = parseJsonEntry(entries, relativePath);
  invariant(report.status === "PASS", `${relativePath} must record PASS`);
  const rows = report.assets ?? report.files ?? report.entries;
  invariant(Array.isArray(rows), `${relativePath} must contain an asset inventory`);
  const observed = new Map();
  for (const row of rows) {
    const assetPath = row?.relativePath ?? row?.path;
    const hash = row?.sha256 ?? row?.actualSha256;
    invariant(typeof assetPath === "string" && /^[0-9a-f]{64}$/.test(hash ?? "") && !observed.has(assetPath), `${relativePath} has an invalid or duplicate row`);
    observed.set(assetPath, hash);
  }
  invariant(observed.size === PHYSICAL_ASSETS.length, `${relativePath} asset count differs`);
  for (const [assetPath, hash] of PHYSICAL_ASSETS) invariant(observed.get(assetPath) === hash, `${relativePath} authority mismatch: ${assetPath}`);
}

function validatePixelRecord(record, label) {
  invariant(record && typeof record === "object" && !Array.isArray(record), `${label} pixel evidence is missing`);
  invariant(Number.isSafeInteger(record.width) && record.width > 0 && Number.isSafeInteger(record.height) && record.height > 0, `${label} pixel dimensions are invalid`);
  invariant(Number.isFinite(record.nearWhitePixelRatio) && record.nearWhitePixelRatio >= 0 && record.nearWhitePixelRatio <= 1, `${label} near-white ratio is invalid`);
}

function hasDarkComputedAuthority(record) {
  const dark = /rgb\(\s*(?:7\s*,\s*9\s*,\s*10|8\s*,\s*11\s*,\s*12)\s*\)/i;
  return record && typeof record === "object" && !Array.isArray(record)
    && (dark.test(record.htmlBackground ?? "") || dark.test(record.bodyBackground ?? ""));
}

function validateFirefoxFirstPaint(entries) {
  const report = parseJsonEntry(entries, "10-firefox/firefox-first-paint-report.json");
  invariant(report.schema === FIREFOX_FIRST_PAINT_SCHEMA, "Firefox first-paint schema differs");
  invariant(report.responseStatus === 200, "Firefox first-paint document response differs");
  validatePixelRecord(report.navigationStart?.pixels, "Firefox navigation-start");
  validatePixelRecord(report.firstStablePaint?.pixels, "Firefox stable-paint");
  invariant(report.navigationStart.pixels.width === report.firstStablePaint.pixels.width && report.navigationStart.pixels.height === report.firstStablePaint.pixels.height, "Firefox first-paint capture dimensions differ");
  invariant(report.documentAuthority?.inlineDarkBackgroundAuthority === true && report.documentAuthority?.colorSchemeAuthority === true && report.documentAuthority?.orderingProven === true, "Firefox first-paint document dark-background authority is missing or too late");
  invariant(report.timing?.navigationStartCapturedBeforeResponseBodyRead === true && JSON.stringify(report.timing.captureOrder?.map(({ step }) => step)) === JSON.stringify(FIREFOX_FIRST_PAINT_ORDER), "Firefox navigation-start evidence was not captured before response-body inspection");
  const elapsed = report.timing.captureOrder.map(({ elapsedMs }) => elapsedMs);
  invariant(elapsed.every((value, index) => Number.isFinite(value) && value >= 0 && (index === 0 || value >= elapsed[index - 1])), "Firefox first-paint capture timing is not monotonic");
  invariant(hasDarkComputedAuthority(report.navigationStart?.computed) && hasDarkComputedAuthority(report.firstStablePaint?.computed), "Firefox first-paint computed dark-background authority is missing");
  invariant(report.firstStablePaint.pixels.nearWhitePixelRatio < 0.95, "Firefox stable paint remains near-white");
  if (report.status === "PASS") {
    invariant(report.classification === FIREFOX_FIRST_PAINT_PASS, "Firefox first-paint PASS classification differs");
    invariant(report.navigationStart.pixels.nearWhitePixelRatio < 0.95, "Firefox first-paint PASS contradicts the navigation-start pixels");
  } else {
    invariant(report.status === "LIMITATION", "Firefox first-paint status must be PASS or the bounded evidenced LIMITATION");
    invariant(report.classification === FIREFOX_FIRST_PAINT_LIMITATION, "Firefox first-paint LIMITATION classification differs");
    invariant(report.navigationStart.pixels.nearWhitePixelRatio >= 0.95, "Firefox first-paint LIMITATION lacks a near-white navigation-start capture");
  }
}

function validateServedDocument(document, label) {
  invariant(document?.channel === "node-fetch-response-body" && document.route === "/" && document.httpStatus === 200 && /text\/html/i.test(document.contentType ?? ""), `served-build ${label} HTTP document authority differs`);
  invariant(Number.isSafeInteger(document.bytes) && document.bytes > 0 && /^[0-9a-f]{64}$/.test(document.sha256 ?? ""), `served-build ${label} document bytes/hash differ`);
}

function runtimeAssetFingerprint(records) {
  invariant(Array.isArray(records) && records.length > 0, "runtime asset fingerprint requires records");
  return sha256(Buffer.from(records.map(({ kind, route, bytes, sha256: hash }) => `${kind}\t${route}\t${bytes}\t${hash}`).sort().join("\n"), "utf8"));
}

function validateRuntimeAsset(record, label, served = false) {
  invariant(record && ["css", "javascript"].includes(record.kind) && typeof record.route === "string" && record.route.startsWith("/") && !record.route.includes(".."), `${label} runtime asset identity differs`);
  invariant(Number.isSafeInteger(record.bytes) && record.bytes > 0 && /^[0-9a-f]{64}$/.test(record.sha256 ?? ""), `${label} runtime asset bytes/hash differ`);
  if (served) invariant(record.httpStatus === 200 && (record.kind === "css" ? /text\/css/i.test(record.contentType ?? "") : /javascript|ecmascript/i.test(record.contentType ?? "")), `${label} runtime asset HTTP/content-type differs`);
}

function validateRuntimeAssets(report, sourceHead) {
  invariant(report?.derivation === "linked CSS/JS paths parsed from each verified root HTML response", "served-build runtime asset derivation differs");
  const before = report.before;
  invariant(before?.revision === PHASE7A_R1_PARENT && Array.isArray(before.served) && before.served.length === EXACT_PARENT_RUNTIME_ASSETS.records.length, "served exact-parent runtime asset inventory differs");
  before.served.forEach((record, index) => validateRuntimeAsset(record, `served exact-parent runtime asset ${index + 1}`, true));
  invariant(before.fingerprint === runtimeAssetFingerprint(before.served) && before.fingerprint === EXACT_PARENT_RUNTIME_ASSETS.fingerprint, "served exact-parent runtime asset fingerprint differs");
  invariant(before.authority?.revision === PHASE7A_R1_PARENT && before.authority.derivation === EXACT_PARENT_RUNTIME_ASSETS.derivation && before.authority.fingerprint === EXACT_PARENT_RUNTIME_ASSETS.fingerprint, "served exact-parent immutable runtime receipt differs");
  for (const [index, expected] of EXACT_PARENT_RUNTIME_ASSETS.records.entries()) { const actual = before.served[index]; invariant(actual.kind === expected.kind && actual.route === expected.route && actual.bytes === expected.bytes && actual.sha256 === expected.sha256, `served exact-parent runtime asset differs: ${expected.route}`); }
  const after = report.after;
  invariant(after?.revision === sourceHead && Array.isArray(after.localDist) && Array.isArray(after.served) && after.localDist.length >= 2 && after.localDist.length === after.served.length, "served R1 runtime asset inventory differs");
  after.localDist.forEach((record, index) => validateRuntimeAsset(record, `local R1 runtime asset ${index + 1}`));
  after.served.forEach((record, index) => validateRuntimeAsset(record, `served R1 runtime asset ${index + 1}`, true));
  for (const [index, local] of after.localDist.entries()) { const served = after.served[index]; invariant(served.kind === local.kind && served.route === local.route && served.bytes === local.bytes && served.sha256 === local.sha256, `served R1 runtime asset differs from local dist: ${local.route}`); }
  invariant(after.localFingerprint === runtimeAssetFingerprint(after.localDist) && after.servedFingerprint === runtimeAssetFingerprint(after.served) && after.localFingerprint === after.servedFingerprint, "served/local R1 runtime asset fingerprint differs");
  return { before, after };
}

function validatePortableServedBuild(receipt, sourceHead, served, label) {
  invariant(receipt?.schema === PORTABLE_SERVED_BUILD_SCHEMA && receipt.status === "PASS" && receipt.branch === PHASE7A_R1_BRANCH && receipt.revision === sourceHead, `${label} portable served-build branch/HEAD differs`);
  invariant(receipt.document?.relativePath === "dist/index.html" && receipt.document.bytes === served.documents.after.bytes && receipt.document.sha256 === served.documents.after.sha256, `${label} portable served-build document differs`);
  invariant(Array.isArray(receipt.runtimeAssets) && receipt.runtimeAssets.length === served.runtimeAssets.after.localDist.length, `${label} portable runtime asset inventory differs`);
  receipt.runtimeAssets.forEach((asset, index) => {
    validateRuntimeAsset(asset, `${label} portable runtime asset ${index + 1}`);
    const expected = served.runtimeAssets.after.localDist[index];
    invariant(asset.kind === expected.kind && asset.route === expected.route && asset.bytes === expected.bytes && asset.sha256 === expected.sha256, `${label} portable runtime asset differs: ${expected.route}`);
  });
  invariant(receipt.runtimeFingerprint === runtimeAssetFingerprint(receipt.runtimeAssets) && receipt.runtimeFingerprint === served.runtimeAssets.after.localFingerprint, `${label} portable runtime fingerprint differs`);
  invariant(receipt.servedParity?.document === true && receipt.servedParity?.runtimeAssets === true, `${label} portable served parity differs`);
  invariant(receipt.freshBuild?.command === "npm run build:phase7a-r1" && receipt.freshBuild.headBefore === sourceHead && receipt.freshBuild.headAfter === sourceHead && receipt.freshBuild.worktreeCleanBefore === true && receipt.freshBuild.worktreeCleanAfter === true, `${label} portable fresh-build receipt differs`);
}

function validatePortableSource(record, receipt, label) {
  invariant(record?.status === receipt.status && record.branch === receipt.branch && record.revision === receipt.revision && record.runtimeFingerprint === receipt.runtimeFingerprint, `${label} source branch/runtime differs`);
  invariant(record.document?.relativePath === receipt.document.relativePath && record.document.bytes === receipt.document.bytes && record.document.sha256 === receipt.document.sha256, `${label} source document differs`);
  invariant(sameJson(Object.keys(record).sort(), ["branch", "document", "revision", "runtimeFingerprint", "status"].sort()), `${label} source inventory differs`);
}

function validateServedBuildAuthority(entries, sourceHead, deployment) {
  const report = parseJsonEntry(entries, SERVED_BUILD_AUTHORITY_PATH);
  invariant(report.schema === SERVED_BUILD_AUTHORITY_SCHEMA && report.status === "PASS", "served-build authority schema/status differs");
  const repository = report.repository;
  invariant(repository?.schema === SERVED_BUILD_AUTHORITY_SCHEMA && repository.branch === PHASE7A_R1_BRANCH && repository.head === sourceHead && repository.exactParent === PHASE7A_R1_PARENT, "served-build repository branch/HEAD/parent authority differs");
  invariant(repository.parentIsAncestor === true && repository.mergeCommitsSinceParent === 0 && repository.trackedWorktreeClean === true, "served-build repository ancestry/cleanliness authority differs");
  const build = repository.buildReceipt;
  invariant(build?.command === "npm run build:phase7a-r1" && build.authorityProfile === "phase7a-r1" && build.completed === true && build.headBefore === sourceHead && build.headAfter === sourceHead && build.branchAfter === PHASE7A_R1_BRANCH && build.trackedWorktreeCleanAfter === true, "served-build governed build receipt differs");
  invariant(repository.localDist?.relativePath === "dist/index.html" && Number.isSafeInteger(repository.localDist.bytes) && repository.localDist.bytes > 0 && /^[0-9a-f]{64}$/.test(repository.localDist.sha256 ?? ""), "served-build local dist/index.html authority differs");
  invariant(report.originSeparation?.before === "BEFORE_CAPTURE_ORIGIN" && report.originSeparation?.after === "AFTER_CAPTURE_ORIGIN" && report.originSeparation?.distinctNormalizedOrigins === true, "served-build origin separation authority differs");
  const before = report.documents?.before;
  const after = report.documents?.after;
  validateServedDocument(before, "exact-parent");
  validateServedDocument(after, "R1 after");
  invariant(before.bytes === EXACT_PARENT_HOME_DOCUMENT.bytes && before.sha256 === EXACT_PARENT_HOME_DOCUMENT.sha256, "served exact-parent document differs from immutable byte authority");
  invariant(after.bytes === repository.localDist.bytes && after.sha256 === repository.localDist.sha256, "served R1 document differs from fresh local dist/index.html");
  invariant(report.documentFingerprintsDistinct === true && before.sha256 !== after.sha256, "served before/after document fingerprints are not distinct");
  const runtime = validateRuntimeAssets(report.runtimeAssets, sourceHead);
  const binding = report.deploymentBinding;
  invariant(binding?.status === "PASS" && binding.revision === sourceHead && binding.relativePath === "dist/index.html" && binding.bytes === after.bytes && binding.sha256 === after.sha256, "served-build deployment document binding differs");
  invariant(binding.localDist === true && binding.immutableOrigin === true && binding.branchOrigin === true, "served-build deployment parity binding is incomplete");
  invariant(binding.runtimeAssets?.count === runtime.after.localDist.length && binding.runtimeAssets.fingerprint === runtime.after.localFingerprint, "served-build deployment runtime binding differs");
  for (const asset of runtime.after.localDist) {
    const rows = (deployment.payloadLedger ?? []).filter(({ relativePath }) => relativePath === asset.route.slice(1));
    invariant(rows.length === 1 && rows[0].bytes === asset.bytes && rows[0].sha256 === asset.sha256 && rows[0].immutable?.status === "PASS" && rows[0].branch?.status === "PASS", `served-build runtime asset differs from deployment ledger: ${asset.route}`);
  }
  invariant(sameJson(deployment.servedBuildDocumentBinding, binding), "served-build authority differs from deployment verification binding");
  return report;
}

const RECORDING_CHECKS = Object.freeze(["audioStreams", "codec", "constantFrameRate", "container", "decodedFrames", "dimensions", "duration", "fullDecode", "oneVideoStream", "otherStreams", "pixelFormat"]);

function validateRecordingChecks(checks, label) {
  invariant(checks && typeof checks === "object" && !Array.isArray(checks), `${label} validation checks are missing`);
  invariant(JSON.stringify(Object.keys(checks).sort()) === JSON.stringify([...RECORDING_CHECKS].sort()), `${label} validation check map differs`);
  for (const name of RECORDING_CHECKS) invariant(checks[name] === true, `${label} validation check failed: ${name}`);
}

function bindRecordingInventory(entries) {
  const expected = new Set(REQUIRED_RECORDING_PATHS);
  const actual = [...entries.keys()].filter((relativePath) => path.posix.extname(relativePath).toLowerCase() === ".mp4");
  invariant(actual.length === expected.size && new Set(actual).size === actual.length && actual.every((relativePath) => expected.has(relativePath)), "review package must contain exactly the 18 governed MP4 recording paths");
  const lifecycle = parseJsonEntry(entries, "13-performance/performance-and-lifecycle-report.json");
  const served = parseJsonEntry(entries, SERVED_BUILD_AUTHORITY_PATH);
  validatePortableServedBuild(lifecycle.servedBuildAuthority, served.repository.head, served, "scenario capture");
  invariant(Array.isArray(lifecycle.scenarioRecordings) && lifecycle.scenarioRecordings.length === REQUIRED_GENERAL_RECORDING_PATHS.length, "performance/lifecycle report must inventory fourteen scenario recordings");
  const general = new Map(lifecycle.scenarioRecordings.map((record) => [record.relativePath, record]));
  invariant(general.size === REQUIRED_GENERAL_RECORDING_PATHS.length, "scenario recording inventory contains duplicate paths");
  for (const relativePath of REQUIRED_GENERAL_RECORDING_PATHS) {
    const record = general.get(relativePath);
    invariant(record?.status === "PASS" && record.scenarioValidation === "PASS" && record.media?.fullDecode === true, `scenario recording validation differs: ${relativePath}`);
    validateRecordingChecks(record.validationChecks, `scenario recording ${relativePath}`);
    validatePortableSource(record.sourceAuthority, lifecycle.servedBuildAuthority, `scenario recording ${relativePath}`);
    invariant(record.stateAuthority && record.stateAuthoritySha256 === sha256(Buffer.from(stableJson(record.stateAuthority), "utf8")), `scenario recording state authority hash differs: ${relativePath}`);
    validateScenarioStates(record.scenario, record.stateAuthority);
    const payload = entries.get(relativePath)?.data;
    invariant(payload && record.bytes === payload.length && record.sha256 === sha256(payload), `scenario recording bytes/hash binding differs: ${relativePath}`);
  }
  const signal = parseJsonEntry(entries, "04-signal-field/before-after-report.json");
  const receipt = signal.servedBuildAuthority;
  invariant(receipt?.report === "provenance/served-build-authority.json" && receipt.status === "PASS" && receipt.branch === PHASE7A_R1_BRANCH && receipt.afterRevision === served.repository.head, "Signal Field comparison served-build receipt differs");
  invariant(receipt.beforeDocument?.revision === PHASE7A_R1_PARENT && receipt.beforeDocument.bytes === served.documents.before.bytes && receipt.beforeDocument.sha256 === served.documents.before.sha256 && receipt.afterDocument?.revision === served.repository.head && receipt.afterDocument.bytes === served.documents.after.bytes && receipt.afterDocument.sha256 === served.documents.after.sha256, "Signal Field comparison served-document receipt differs");
  invariant(receipt.runtimeAssets?.before?.count === served.runtimeAssets.before.served.length && receipt.runtimeAssets.before.fingerprint === served.runtimeAssets.before.fingerprint && receipt.runtimeAssets?.after?.count === served.runtimeAssets.after.served.length && receipt.runtimeAssets.after.fingerprint === served.runtimeAssets.after.servedFingerprint, "Signal Field comparison runtime asset receipt differs");
  invariant(Array.isArray(signal.comparisonRecordings) && signal.comparisonRecordings.length === REQUIRED_COMPARISON_RECORDING_PATHS.length, "Signal Field report must inventory four comparison recordings");
  const comparisons = new Map(signal.comparisonRecordings.map((record) => [record.relativePath, record]));
  invariant(comparisons.size === REQUIRED_COMPARISON_RECORDING_PATHS.length, "Signal Field comparison inventory contains duplicate paths");
  for (const relativePath of REQUIRED_COMPARISON_RECORDING_PATHS) {
    const record = comparisons.get(relativePath);
    invariant(record?.status === "PASS" && record.media?.fullDecode === true, `Signal Field comparison recording validation differs: ${relativePath}`);
    const before = relativePath.includes("before-parent");
    const expectedDocument = before ? receipt.beforeDocument : receipt.afterDocument;
    const expectedRuntime = before ? receipt.runtimeAssets.before : receipt.runtimeAssets.after;
    invariant(record.sourceAuthority?.revision === expectedDocument.revision && record.sourceAuthority.document?.bytes === expectedDocument.bytes && record.sourceAuthority.document?.sha256 === expectedDocument.sha256, `Signal Field comparison recording document authority differs: ${relativePath}`);
    invariant(record.sourceAuthority.livePageAttestation?.document?.bytes === expectedDocument.bytes && record.sourceAuthority.livePageAttestation?.document?.sha256 === expectedDocument.sha256 && record.sourceAuthority.livePageAttestation?.runtimeAssets?.count === expectedRuntime.count && record.sourceAuthority.livePageAttestation?.runtimeAssets?.fingerprint === expectedRuntime.fingerprint, `Signal Field comparison recording live-page authority differs: ${relativePath}`);
    validateRecordingChecks(record.validationChecks, `Signal Field comparison recording ${relativePath}`);
    const payload = entries.get(relativePath)?.data;
    invariant(payload && record.bytes === payload.length && record.sha256 === sha256(payload), `Signal Field comparison recording bytes/hash binding differs: ${relativePath}`);
  }
}

function validateInstalledChromeUiAuthority(entries, chrome) {
  const authority = chrome.visibleBrowserZoomConfirmation;
  invariant(authority?.schema === INSTALLED_CHROME_UI_SCHEMA && authority.status === "PASS" && authority.visibleZoomConfirmation === true, "installed Chrome visible UI authority schema/status differs");
  invariant(authority.browserWindow?.product === "Google Chrome" && authority.browserWindow.processName === "chrome.exe" && authority.browserWindow.visible === true && authority.browserWindow.remoteDebuggingProcessMatched === true && typeof authority.browserWindow.title === "string" && authority.browserWindow.title.trim().length > 0, "installed Chrome visible UI window identity differs");
  const observation = authority.visibleZoomObservation;
  invariant(observation?.method === "windows-ui-automation-accessibility-tree" && observation.chromeMenuVisible === true && observation.observedLabel === "200%", "installed Chrome visible 200% observation differs");
  invariant(Array.isArray(authority.screenshots) && authority.screenshots.length === 1, "installed Chrome UI screenshot ledger is missing or noncanonical");
  const paths = new Set();
  for (const row of authority.screenshots) {
    invariant(row?.relativePath === "09-chrome-200/visuals/ui-01-chrome-visible-200-percent.png" && !paths.has(row.relativePath), "installed Chrome UI screenshot path is missing or duplicated");
    const payload = entries.get(row.relativePath)?.data;
    invariant(payload && row.format === "png" && row.bytes === payload.length && row.sha256 === sha256(payload), `installed Chrome UI screenshot bytes/hash differ: ${row.relativePath}`);
    invariant(Number.isSafeInteger(row.width) && row.width > 0 && Number.isSafeInteger(row.height) && row.height > 0 && Number.isFinite(row.entropy) && row.entropy >= 1 && Number.isFinite(row.maximumChannelRange) && row.maximumChannelRange >= 80, `installed Chrome UI screenshot decode authority differs: ${row.relativePath}`);
    paths.add(row.relativePath);
  }
  invariant(paths.has(observation.screenshot), "installed Chrome visible 200% observation is not bound to a packaged screenshot");
  return paths;
}

function validateRasterEvidenceTopology(entries) {
  const images = [...entries.keys()].filter((relativePath) => IMAGE_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase()));
  const under = (prefix) => images.filter((relativePath) => relativePath.startsWith(prefix));
  const exact = (prefix, count, label) => {
    const rows = under(prefix);
    invariant(rows.length === count, `${label} must contain exactly ${count} raster evidence files`);
    return rows;
  };
  for (const state of ["before", "after"]) {
    const rows = exact(`03-responsive/visuals/${state}/`, 24, `responsive ${state}`);
    invariant(rows.filter((name) => /-viewport\.png$/i.test(name)).length === 12 && rows.filter((name) => /-full-page\.png$/i.test(name)).length === 12, `responsive ${state} must retain full-page and viewport evidence for all twelve sizes`);
  }
  const requiredNames = [
    "04-signal-field/visuals/before-desktop-1440x900.png",
    "04-signal-field/visuals/after-desktop-1440x900.png",
    "05-audience/visuals/desktop-1440x900.png",
    "05-audience/visuals/mobile-390x844.png",
    "07-field-map/visuals/closed-desktop-1440x900.png",
    "07-field-map/visuals/open-desktop-1440x900.png",
    "07-field-map/visuals/keyboard-focus-desktop-1440x900.png",
    "07-field-map/visuals/escape-focus-return-desktop-1440x900.png",
    "12-fallback/visuals/reduced-motion-desktop-1440x900.png",
    "12-fallback/visuals/no-javascript-native-map-mobile-390x844.png",
    "12-fallback/visuals/fallback-fonts-narrow-320x800.png",
    "10-firefox/visuals/navigation-start.png",
    "10-firefox/visuals/first-stable-paint.png",
  ];
  for (const relativePath of requiredNames) invariant(entries.has(relativePath), `required visual evidence is missing: ${relativePath}`);
  exact("04-signal-field/visuals/", 2, "Signal Field before/after");
  exact("05-audience/visuals/", 2, "audience bifurcation");
  exact("07-field-map/visuals/", 4, "Field Map");
  exact("12-fallback/visuals/", 3, "fallback");
  exact("10-firefox/visuals/", 2, "Firefox first-paint");
  exact("15-publication/visuals/", 8, "semantic route and real-404");
  const typography = parseJsonEntry(entries, "06-typography/typography-report.json");
  invariant(Array.isArray(typography.candidates) && typography.candidates.length === 4, "typography report must reference four rendered specimens");
  const specimens = new Set(typography.candidates.map(({ specimen }) => specimen));
  invariant(specimens.size === 4 && [...specimens].every((relativePath) => /^06-typography\/visuals\/[a-z0-9-]+-specimen\.png$/i.test(relativePath) && entries.has(relativePath)), "typography specimen references are incomplete or missing");
  invariant(exact("06-typography/visuals/", 4, "typography").every((relativePath) => specimens.has(relativePath)), "typography raster inventory differs from its report");
  const chrome = parseJsonEntry(entries, "09-chrome-200/installed-chrome-200-percent-report.json");
  const native = exact("09-chrome-200/visuals/native-", 15, "installed Chrome native 200%");
  const ui = under("09-chrome-200/visuals/ui-");
  const uiAuthorityPaths = validateInstalledChromeUiAuthority(entries, chrome);
  invariant(ui.length === uiAuthorityPaths.size && ui.every((relativePath) => uiAuthorityPaths.has(relativePath)), "installed Chrome visible 200% UI evidence count differs");
  invariant(Array.isArray(chrome.visualEvidence) && chrome.visualEvidence.length === 15, "installed Chrome report must inventory fifteen native visual states");
  invariant(chrome.visualEvidence.every(({ filename }) => typeof filename === "string" && native.some((relativePath) => relativePath.endsWith(`-${filename}`))), "installed Chrome native visuals differ from the report inventory");
  invariant(images.length >= 89, "review package visual evidence topology is incomplete");
}

function validateExactTrueChecks(checks, names, label) {
  invariant(checks && typeof checks === "object" && !Array.isArray(checks), `${label} checks are missing`);
  invariant(JSON.stringify(Object.keys(checks).sort()) === JSON.stringify([...names].sort()), `${label} check inventory differs`);
  for (const name of names) invariant(checks[name] === true, `${label} check failed: ${name}`);
}

function validateTargetObservation(report, label) {
  invariant(report?.status === "PASS", `${label} must record PASS`);
  let recomputed;
  try { recomputed = assertTargetSizePass(report); }
  catch (error) { throw new Error(`${label} fails independent target-size validation: ${error.message}`); }
  const summary = report.summary ?? {};
  invariant(summary.targetFailures === 0 && summary.unexplainedExclusions === 0 && summary.contractFailures === 0, `${label} retains target failures, unexplained exclusions, or contract failures`);
  invariant(recomputed.summary.targetFailures === summary.targetFailures && recomputed.summary.validExclusions === summary.validExclusions && recomputed.summary.unexplainedExclusions === summary.unexplainedExclusions && recomputed.summary.contractFailures === summary.contractFailures, `${label} summary differs from independently recomputed target records`);
}

function validateTargetInventory(entries) {
  const report = parseJsonEntry(entries, "08-targets/target-size-inventory.json");
  invariant(report.schema === "quantum-hub.phase-7a-r1.target-ledger.v1" && report.status === "PASS" && report.minimumCssPixels === 44, "target-size inventory schema/status/minimum differs");
  invariant(Array.isArray(report.states) && report.states.length === 10 && report.stateCount === 10, "target-size inventory must retain the ten required responsive/fallback/Field Map states");
  const ids = new Set();
  for (const state of report.states) {
    invariant(typeof state?.id === "string" && state.id.length > 0 && !ids.has(state.id) && typeof state.route === "string" && typeof state.state === "string", "target-size state identity is missing or duplicated");
    ids.add(state.id);
    validateTargetObservation(state.report, `target-size state ${state.id}`);
  }
  invariant(report.summary?.activeFailures === 0 && report.summary?.unexplainedExclusions === 0 && report.summary?.contractFailures === 0, "target-size aggregate retains failures or invalid exclusions");
  const totals = report.states.reduce((result, state) => ({ activeFailures: result.activeFailures + state.report.summary.targetFailures, validExclusions: result.validExclusions + state.report.summary.validExclusions, unexplainedExclusions: result.unexplainedExclusions + state.report.summary.unexplainedExclusions, contractFailures: result.contractFailures + state.report.summary.contractFailures }), { activeFailures: 0, validExclusions: 0, unexplainedExclusions: 0, contractFailures: 0 });
  invariant(Object.keys(totals).every((name) => report.summary[name] === totals[name]), "target-size aggregate differs from independently recomputed state summaries");
}

function validateClippingReport(entries) {
  const report = parseJsonEntry(entries, "03-responsive/clipping-report.json");
  const expected = PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS.map(({ id }) => id);
  invariant(report.status === "PASS" && report.requiredViewportCount === 12 && Array.isArray(report.before) && Array.isArray(report.after) && report.before.length === 12 && report.after.length === 12, "responsive clipping report matrix differs");
  for (const [label, rows] of [["before", report.before], ["after", report.after]]) {
    invariant(rows.map(({ id }) => id).every((id, index) => id === expected[index]) && new Set(rows.map(({ id }) => id)).size === 12, `responsive ${label} viewport order/membership differs`);
    invariant(rows.every(({ measurement }) => measurement && typeof measurement === "object"), `responsive ${label} measurements are incomplete`);
  }
  const defect = report.before.find(({ id }) => id === "short-landscape-800x360");
  invariant(defect?.status === "FAIL" && /(?:top|sticky|header|occlud|clip|safety)/i.test(defect.failure ?? ""), "exact-parent 800x360 sticky/top clipping defect is missing");
  const defectMeasurement = defect.measurement;
  invariant(defectMeasurement.occludingHeader?.presentation?.visible === true && defectMeasurement.occludingHeader.anchoredToViewportTop === true && defectMeasurement.occludingHeader.occluding === true && ["fixed", "sticky"].includes(defectMeasurement.occludingHeader.position), "exact-parent 800x360 sticky-header measurement differs");
  const defectAllowances = [defectMeasurement.safeAllowances?.h1?.top, defectMeasurement.safeAllowances?.glyphs?.top, ...(defectMeasurement.safeAllowances?.renderedLines ?? []).map(({ top }) => top)].filter(Number.isFinite);
  invariant(defectAllowances.some((value) => value < 2) || (defectMeasurement.boundaryAnalysis?.occludingHeaderIntersections?.length ?? 0) > 0 || (defectMeasurement.boundaryAnalysis?.safetyViolations ?? []).some(({ sides }) => sides?.includes("top")), "exact-parent 800x360 defect lacks measured clipping evidence");
  for (const row of report.after) {
    invariant(row.status === "PASS" && !row.failure, `repaired clipping case failed: ${row.id}`);
    try { validateManifestoGeometry(row.measurement); }
    catch (error) { throw new Error(`repaired clipping measurement failed at ${row.id}: ${error.message}`); }
  }
}

const FIELD_MAP_DESTINATIONS = Object.freeze([["/#entry", "Home"], ["/for-partners/", "For industry"], ["/for-startups/", "For startups"], ["/industries/", "Industries"], ["/pocs/", "Proof"], ["/spark/", "SPARK"], ["/about/", "About"], ["/contact/", "Contact"]]);

function validateMapOpen(state, label) {
  invariant(state?.open === true && state.rootOpen === true && state.destinationCount === 8, `${label} open/destination authority differs`);
  invariant(Array.isArray(state.destinationNames) && state.destinationNames.length === 8 && new Set(state.destinationNames).size === 8, `${label} destination inventory differs`);
  invariant(state.backgroundRegionCount >= 3 && state.inertRegionCount === state.backgroundRegionCount && state.ownedInertCount === state.backgroundRegionCount, `${label} inert ownership differs`);
  invariant(Array.isArray(state.focusableInventory) && state.focusableInventory.length > 0 && state.focusableInventory.every(({ insideFieldMap }) => insideFieldMap === true), `${label} focus inventory escapes the Field Map`);
}

function validateMapClosed(state, label, focusReturn = false) {
  invariant(state?.open === false && state.rootOpen === false && state.inertRegionCount === 0 && state.ownedInertCount === 0, `${label} leaves stale Field Map state`);
  if (focusReturn) invariant(state.activeElement === "field-map-summary", `${label} did not return focus to the trigger`);
}

function validateFieldMapReport(entries) {
  const report = parseJsonEntry(entries, "07-field-map/semantic-isolation-report.json");
  invariant(report.status === "PASS", "Field Map semantic-isolation report must record PASS");
  validateMapClosed(report.states?.closed, "Field Map initial state");
  validateMapOpen(report.states?.open, "Field Map open state");
  validateMapClosed(report.states?.escape, "Field Map Escape state", true);
  const expectedFocus = [null, ...FIELD_MAP_DESTINATIONS.map(([, name]) => name), null];
  invariant(Array.isArray(report.focusSequence) && report.focusSequence.length === 10 && report.focusSequence.every(({ step, activeElement, activeDestinationName }, index) => step === index + 1 && activeElement === (expectedFocus[index] === null ? "field-map-summary" : "a") && (activeDestinationName ?? null) === expectedFocus[index]), "Field Map keyboard focus sequence differs");
  invariant(report.reverseFocus?.activeElement === "a" && report.reverseFocus.activeDestinationName === "Contact", "Field Map reverse keyboard wrap differs");
  invariant(Array.isArray(report.repeatedCycles) && report.repeatedCycles.length === 3, "Field Map repeated-cycle inventory differs");
  for (const [index, cycle] of report.repeatedCycles.entries()) { invariant(cycle.cycle === index + 1, "Field Map repeated-cycle order differs"); validateMapOpen(cycle.opened, `Field Map cycle ${index + 1} open`); validateMapClosed(cycle.closed, `Field Map cycle ${index + 1} closed`); }
  for (const name of ["pagehide", "pageshow", "history"]) validateMapClosed(report.lifecycle?.[name], `Field Map ${name}`);
  for (const name of ["arrival", "back"]) validateMapClosed(report.navigation?.[name], `Field Map navigation ${name}`);
}

function rect(record, label) {
  invariant(record && ["left", "top", "right", "bottom", "width", "height"].every((name) => Number.isFinite(record[name])), `${label} bounds are missing`);
  invariant(record.width > 0 && record.height > 0 && Math.abs(record.width - (record.right - record.left)) < 0.05 && Math.abs(record.height - (record.bottom - record.top)) < 0.05, `${label} bounds differ`);
  return record;
}

function validateMeasuredVisibility(geometry, visibility, label) {
  invariant(visibility?.status === "PASS" && geometry?.measurementError === null && geometry.h1?.presentation?.visible === true, `${label} measured visibility authority is missing`);
  const effective = rect(geometry.effectiveVisibleBounds, `${label} effective visible`); const h1 = rect(geometry.h1?.rect, `${label} H1`); const glyphs = rect(geometry.glyphBounds, `${label} glyphs`);
  invariant(geometry.occludingHeader?.presentation?.visible === true && geometry.occludingHeader.anchoredToViewportTop === true && geometry.occludingHeader.occluding === true && effective.top >= geometry.occludingHeader.effectiveBottom - 0.05, `${label} sticky-header effective boundary differs`);
  invariant(Array.isArray(geometry.authoredLines) && geometry.authoredLines.length === 3 && geometry.authoredLines.flatMap(({ glyphBoxes }) => glyphBoxes ?? []).length > 0, `${label} glyph-bearing line inventory differs`);
  const allowances = [h1.top - effective.top, effective.bottom - h1.bottom, h1.left - effective.left, effective.right - h1.right, glyphs.top - effective.top, effective.bottom - glyphs.bottom, glyphs.left - effective.left, effective.right - glyphs.right];
  invariant(allowances.every((value) => value >= 2), `${label} intersects an effective clipping boundary`);
  invariant(geometry.horizontalOverflow === false && geometry.horizontalMetrics?.overflowPixels === 0 && (geometry.boundaryAnalysis?.glyphEscapes?.length ?? -1) === 0 && (geometry.boundaryAnalysis?.boundaryIntersections?.length ?? -1) === 0 && (geometry.boundaryAnalysis?.occludingHeaderIntersections?.length ?? -1) === 0, `${label} clipping/overflow inventory differs`);
}

function validateFallbackReports(entries) {
  const reduced = parseJsonEntry(entries, "12-fallback/reduced-motion-report.json").closure;
  invariant(reduced?.cinematicMode === "static" && reduced.signalField === true && reduced.bifurcationLinks === 2 && reduced.horizontalOverflow === false, "reduced-motion static authority differs");
  validateMeasuredVisibility(reduced.manifestoGeometry, reduced.manifestoVisibility, "reduced-motion manifesto");
  const noJs = parseJsonEntry(entries, "12-fallback/no-js-report.json").closure;
  invariant(noJs?.enhancedController === null && noJs.nativeDetailsOpen === true && noJs.horizontalOverflow === false, "no-JavaScript native Field Map authority differs");
  validateMeasuredVisibility(noJs.manifestoGeometry, noJs.manifestoVisibility, "no-JavaScript manifesto");
  for (const [inventory, expected, label] of [[noJs.fieldMapLinkInventory, FIELD_MAP_DESTINATIONS, "no-JavaScript Field Map"], [noJs.bifurcationLinkInventory, FIELD_MAP_DESTINATIONS.slice(1, 3), "no-JavaScript bifurcation"]]) { invariant(Array.isArray(inventory) && inventory.length === expected.length, `${label} link inventory differs`); inventory.forEach((link, index) => invariant(link.href === expected[index][0] && link.accessibleName.includes(expected[index][1]) && link.visible === true && link.fullyInViewport === true && link.unoccluded === true && link.intendedInteractive === true && link.width > 0 && link.height > 0, `${label} link ${index + 1} differs`)); }
  const fallback = parseJsonEntry(entries, "12-fallback/fallback-font-report.json").closure;
  invariant(fallback?.anybodyLoaded === false && fallback.abortedFontRequests >= 1 && fallback.manifestoWords === 7 && fallback.horizontalOverflow === false, "fallback-font narrow authority differs");
  validateMeasuredVisibility(fallback.manifestoGeometry, fallback.manifestoVisibility, "fallback-font manifesto");
}

function validateQaCaptureAuthorities(entries) {
  const report = parseJsonEntry(entries, "11-accessibility/accessibility-report.json");
  const served = parseJsonEntry(entries, SERVED_BUILD_AUTHORITY_PATH);
  const expectedEngines = ["chromium", "firefox", "webkit"];
  invariant(Array.isArray(report.qaServedBuildAuthorities) && report.qaServedBuildAuthorities.length === 3, "QA served-build authority inventory differs");
  invariant(Array.isArray(report.fullMatrices) && report.fullMatrices.length === 3, "QA matrix authority inventory differs");
  for (const [index, engine] of expectedEngines.entries()) {
    const authority = report.qaServedBuildAuthorities[index];
    invariant(authority?.engine === engine && report.fullMatrices[index]?.engine === engine, `QA engine authority order differs: ${engine}`);
    validatePortableServedBuild(authority.servedBuild, served.repository.head, served, `${engine} QA`);
    validatePortableSource(authority.sourceAuthority, authority.servedBuild, `${engine} QA`);
    validatePortableSource(report.fullMatrices[index].sourceAuthority, authority.servedBuild, `${engine} QA matrix`);
  }
}

function validateInstalledChrome(entries) {
  const report = parseJsonEntry(entries, "09-chrome-200/installed-chrome-200-percent-report.json");
  const served = parseJsonEntry(entries, SERVED_BUILD_AUTHORITY_PATH);
  validatePortableServedBuild(report.servedBuild, served.repository.head, served, "installed Chrome");
  validatePortableSource(report.sourceAuthority, report.servedBuild, "installed Chrome run");
  invariant(report.schema === "quantum-hub.phase-7a.installed-chrome-native-zoom.v1" && report.status === "PASS" && report.classification === "GENUINE INSTALLED GOOGLE CHROME BROWSER ZOOM", "installed Chrome native 200% authority differs");
  invariant(report.browser?.product === "Google Chrome" && report.browser.headed === true && typeof report.browser.version === "string" && report.browser.version.length > 0, "installed Chrome browser identity differs");
  validateExactTrueChecks(report.zoomProof?.checks, ["installedChromeUi", "widthHalved", "dprDoubled", "noDeviceEmulation"], "installed Chrome zoom proof");
  invariant(report.zoomProof.status === "PASS" && report.zoomProof.uiZoomLabel === "Zoom: 200%" && report.forbiddenSubstitutes?.viewportResize === false && report.forbiddenSubstitutes?.cssZoom === false && report.forbiddenSubstitutes?.transformScale === false && report.forbiddenSubstitutes?.deviceEmulation === false, "installed Chrome zoom method differs");
  invariant(Array.isArray(report.routes) && report.routes.length === 10 && report.routes.every(({ status }) => status === "PASS"), "installed Chrome route matrix differs");
  const expectedRoutePaths = [...PUBLIC_ROUTES.map(({ route }) => route), REAL_404_PATH];
  for (const [index, route] of report.routes.entries()) { invariant(route.path === expectedRoutePaths[index], `installed Chrome route ${index + 1} identity differs`); validatePortableSource(route.sourceAuthority, report.servedBuild, `installed Chrome route ${index + 1}`); validateExactTrueChecks(route.checks, ["httpStatus", "semanticH1", "landmarks", "noHorizontalOverflow", "wholeWords", "targetSizes", "manifestoUnclipped"], `installed Chrome route ${index + 1}`); validateTargetObservation(route.state?.targetSize, `installed Chrome route ${index + 1} targets`); }
  const home = report.routes.filter(({ path: routePath }) => routePath === "/");
  invariant(home.length === 1 && home[0].checks.manifestoUnclipped === true && home[0].state?.manifestoVisibility?.status === "PASS", "installed Chrome Home manifesto authority differs");
  const visibility = home[0].state.manifestoVisibility; const effective = rect(visibility.effectiveVisibleBounds, "installed Chrome effective visible"); const h1 = rect(visibility.h1Bounds, "installed Chrome H1"); const glyphs = rect(visibility.glyphBounds, "installed Chrome glyphs"); const header = rect(visibility.header?.bounds, "installed Chrome sticky header");
  invariant(visibility.header.occluding === true && effective.top >= header.bottom - 0.05, "installed Chrome effective visible bounds omit the sticky header");
  const allowances = { h1Top: h1.top - effective.top, h1Bottom: effective.bottom - h1.bottom, h1Left: h1.left - effective.left, h1Right: effective.right - h1.right, glyphTop: glyphs.top - effective.top, glyphBottom: effective.bottom - glyphs.bottom, glyphLeft: glyphs.left - effective.left, glyphRight: effective.right - glyphs.right };
  for (const [name, value] of Object.entries(allowances)) invariant(value >= 2 && Math.abs(visibility.safeAllowances?.[name] - value) < 0.05, `installed Chrome safe allowance differs: ${name}`);
  invariant(Array.isArray(report.visualEvidence) && report.visualEvidence.length === 15 && report.visualEvidence.every((visual) => visual.format === "png" && visual.width > 0 && visual.height > 0 && visual.bytes > 0 && visual.entropy >= 1 && visual.maximumChannelRange >= 80 && /^[0-9a-f]{64}$/.test(visual.sha256 ?? "")), "installed Chrome decoded/nonblank visual inventory differs");
  report.visualEvidence.forEach((visual, index) => {
    validatePortableSource(visual.sourceAuthority, report.servedBuild, `installed Chrome visual ${index + 1}`);
    const matches = [...entries.entries()].filter(([relativePath]) => relativePath.startsWith("09-chrome-200/visuals/native-") && relativePath.endsWith(`-${visual.filename}`));
    invariant(matches.length === 1 && visual.bytes === matches[0][1].data.length && visual.sha256 === sha256(matches[0][1].data), `installed Chrome visual bytes/hash differ: ${visual.filename}`);
  });
  const routeFilename = (routePath) => `${routePath === "/" ? "home" : routePath.replaceAll("/", "-").replace(/^-|-$/g, "")}-top.png`;
  const expectedVisuals = [...expectedRoutePaths.map((routePath) => [`route:${routePath}`, routeFilename(routePath)]), ["home-field-map-closed", "home-field-map-closed.png"], ["home-bifurcation", "home-bifurcation.png"], ["home-field-map-open", "home-field-map-open.png"], ["home-field-map-keyboard-focus", "home-field-map-keyboard-focus.png"], ["home-field-map-escape-closed", "home-field-map-escape-closed.png"]];
  for (const [label, filename] of expectedVisuals) invariant(report.visualEvidence.some((visual) => visual.label === label && visual.filename === filename), `installed Chrome visual state differs: ${label}`);
  const visuals = new Map(report.visualEvidence.map((visual) => [visual.label, visual]));
  const homeStateHashes = expectedVisuals.slice(-5).map(([label]) => visuals.get(label).sha256);
  invariant(new Set(homeStateHashes).size === homeStateHashes.length, "installed Chrome Home state visuals are blank-timed or materially identical");
  invariant(report.fieldMap?.status === "PASS" && report.fieldMap.links === 8 && report.fieldMap.overflow === false && Array.isArray(report.fieldMap.visibleLinks) && report.fieldMap.visibleLinks.length === 8, "installed Chrome Field Map authority differs");
  validatePortableSource(report.fieldMap.sourceAuthority, report.servedBuild, "installed Chrome Field Map");
  validateInstalledChromeUiAuthority(entries, report);
  report.fieldMap.visibleLinks.forEach((link, index) => invariant(link.href === FIELD_MAP_DESTINATIONS[index][0] && link.accessibleName.includes(FIELD_MAP_DESTINATIONS[index][1]) && link.visible === true && link.fullyInViewport === true && rect(link.bounds, `installed Chrome Field Map link ${index + 1}`).height >= 44, `installed Chrome Field Map link ${index + 1} differs`));
  invariant(report.fieldMap.backgroundRegions?.length >= 3 && report.fieldMap.backgroundRegions.every(({ inert, owned }) => inert === true && owned === true) && report.fieldMap.keyboardFocus?.inMap === true && report.fieldMap.escapeFocusReturn === true && report.fieldMap.inertAfterEscape === 0, "installed Chrome Field Map inert/focus authority differs");
  validateTargetObservation(report.fieldMap.targetSize, "installed Chrome Field Map targets");
}

function validateCriticalReports(entries) { validateClippingReport(entries); validateFieldMapReport(entries); validateTargetInventory(entries); validateInstalledChrome(entries); validateFallbackReports(entries); validateQaCaptureAuthorities(entries); }

function validateDeploymentPayloadLedger(deployment) {
  invariant(Array.isArray(deployment.payloadLedger) && deployment.payloadLedger.length > 1, "deployment payload ledger is missing or vacuous");
  const paths = new Set(); let comparableBytes = 0;
  for (const row of deployment.payloadLedger) {
    invariant(typeof row?.relativePath === "string" && row.relativePath.length > 0 && !paths.has(row.relativePath), "deployment payload path is missing or duplicated");
    invariant(row.status === "PASS" && row.localDist === "PASS" && Number.isSafeInteger(row.bytes) && row.bytes > 0 && /^[0-9a-f]{64}$/.test(row.sha256 ?? ""), `deployment payload local authority differs: ${row.relativePath}`);
    invariant(typeof row.publicPath === "string" && row.publicPath.startsWith("/") && [200, 404].includes(row.expectedHttpStatus), `deployment payload route/status authority differs: ${row.relativePath}`);
    invariant(typeof row.contentType === "string" && row.contentType.length > 0 && typeof row.cacheControl === "string" && row.cacheControl.length > 0 && Array.isArray(row.matchedPolicies), `deployment payload MIME/cache authority differs: ${row.relativePath}`);
    for (const origin of ["immutable", "branch"]) { const proof = row[origin]; invariant(proof?.status === "PASS" && proof.actualHttpStatus === row.expectedHttpStatus && proof.bytes === row.bytes && proof.sha256 === row.sha256 && proof.headers === "PASS" && proof.security === "PASS", `deployment payload ${origin} parity differs: ${row.relativePath}`); }
    paths.add(row.relativePath); comparableBytes += row.bytes;
  }
  invariant(deployment.payloadTotals?.comparableFiles === deployment.payloadLedger.length && deployment.payloadTotals.files >= deployment.payloadLedger.length && deployment.payloadTotals.bytes >= comparableBytes, "deployment payload totals differ");
  const index = deployment.payloadLedger.filter(({ relativePath }) => relativePath === "index.html");
  invariant(index.length === 1 && deployment.servedBuildDocumentBinding?.bytes === index[0].bytes && deployment.servedBuildDocumentBinding?.sha256 === index[0].sha256, "deployment payload ledger differs from served index.html binding");
}

function validateSemanticEvidence(entries) {
  for (const { relativePath } of REQUIRED_EVIDENCE) invariant(entries.has(relativePath), `required R1 evidence is missing: ${relativePath}`);
  const governance = parseJsonEntry(entries, GOVERNANCE_PATH);
  invariant(governance.schema === GOVERNANCE_SCHEMA && governance.authorityProfile === "phase7a-r1", "external evidence governance authority differs");
  invariant(governance.status === "READY" && governance.fresh === true && /^[0-9a-f]{40}$/.test(governance.sourceHead ?? ""), "external evidence governance is not fresh/READY");
  validateGateAuthority(entries);
  validatePhase4Hashes(entries);
  const provenance = parseJsonEntry(entries, "01-provenance/provenance.json");
  invariant(provenance.status === "PASS" && provenance.branch === PHASE7A_R1_BRANCH && provenance.requiredParent === PHASE7A_R1_PARENT, "provenance branch/parent differs");
  invariant(provenance.finalHead === governance.sourceHead && /^[0-9a-f]{40}$/.test(provenance.directParent ?? ""), "provenance HEAD/direct-parent binding differs");
  invariant(provenance.localMain === FROZEN_MAIN && provenance.originMain === FROZEN_MAIN, "local/origin main authority differs");
  invariant(provenance.zeroMergeCommits === true && provenance.localUpstreamParity === true && provenance.acceptedPhase6Ancestry === true && provenance.acceptedPhase6 === PHASE7A_PARENT, "provenance linearity/parity/ancestry differs");
  invariant(Array.isArray(provenance.commits) && provenance.commits.length > 0, "complete linear commit list is missing");
  let expectedParent = PHASE7A_R1_PARENT;
  const seenCommits = new Set();
  for (const [index, commit] of provenance.commits.entries()) {
    invariant(/^[0-9a-f]{40}$/.test(commit?.hash ?? "") && !seenCommits.has(commit.hash), `provenance commit ${index} has an invalid or duplicate hash`);
    invariant(Array.isArray(commit.parents) && commit.parents.length === 1 && commit.parents[0] === expectedParent, `provenance commit ${index} breaks linear ancestry from the accepted parent`);
    seenCommits.add(commit.hash);
    expectedParent = commit.hash;
  }
  invariant(provenance.commits.at(-1).hash === governance.sourceHead && provenance.directParent === provenance.commits.at(-1).parents[0], "provenance commit list does not bind final HEAD/direct parent");

  const excluded = new Set([GOVERNANCE_PATH, "00-authority/prior-human-decisions.json", "00-authority/current-human-gates.json", "01-provenance/provenance.json", SERVED_BUILD_AUTHORITY_PATH, "10-firefox/firefox-first-paint-report.json", "16-phase4/phase-4-hash-verification.json", "18-limitations/environmental-limitations.json"]);
  for (const { relativePath } of REQUIRED_EVIDENCE) {
    if (relativePath.endsWith(".json") && !excluded.has(relativePath)) invariant(parseJsonEntry(entries, relativePath).status === "PASS", `${relativePath} must record PASS`);
  }
  const deployment = parseJsonEntry(entries, "17-deployment/deployment-verification.json");
  invariant(deployment.authorityProfile === "phase7a-r1", "deployment authorityProfile must be phase7a-r1");
  invariant(deployment.branch === PHASE7A_R1_BRANCH && deployment.commitHash === governance.sourceHead, "deployment branch/HEAD binding differs");
  for (const proof of ["localDistDeployedParity", "immutableOrigin", "branchOrigin", "signedDeploymentBinding"]) {
    invariant(Object.hasOwn(deployment, proof) && deployment[proof] === true, `deployment proof is missing or false: ${proof}`);
  }
  if (Object.hasOwn(deployment, "signedCloudflareCheckBinding")) {
    invariant(deployment.signedCloudflareCheckBinding === true, "deployment signed Cloudflare check binding is false");
  }
  const checkEntries = deployment.checks && typeof deployment.checks === "object" && !Array.isArray(deployment.checks)
    ? Object.entries(deployment.checks)
    : [];
  invariant(checkEntries.length > 0, "deployment checks must be a non-empty map");
  for (const [name, value] of checkEntries) invariant(value === true || value === "PASS", `deployment check is not proven: ${name}`);
  validateDeploymentPayloadLedger(deployment);
  validateServedBuildAuthority(entries, governance.sourceHead, deployment);
  validateFirefoxFirstPaint(entries);
  bindRecordingInventory(entries);
  validateRasterEvidenceTopology(entries);
  validateCriticalReports(entries);
}

function roleFor(relativePath) {
  if (ROLE_BY_PATH.has(relativePath)) return ROLE_BY_PATH.get(relativePath);
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "raster-evidence";
  if (extension === ".mp4") return "recording";
  return "supporting-document";
}

function recordFor(relativePath, entry) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return {
    path: relativePath,
    role: roleFor(relativePath),
    kind: IMAGE_EXTENSIONS.has(extension) ? "image" : extension === ".mp4" ? "video" : "document",
    bytes: entry.data.length,
    sha256: sha256(entry.data),
    crc32: entry.crc32,
  };
}

function expectedManifest(payloads) {
  return {
    schema: PACKAGE_SCHEMA,
    archiveFilename: REVIEW_ZIP_NAME,
    deterministicEncoding: "canonical ZIP32 stored UTF-8; lexical entry order; DOS 1980-01-01 00:00:00",
    authority: { profile: "phase7a-r1", branch: PHASE7A_R1_BRANCH, exactParent: PHASE7A_R1_PARENT, acceptedPhase6: PHASE7A_PARENT, frozenMain: FROZEN_MAIN, reviewZipName: REVIEW_ZIP_NAME },
    requiredEvidence: REQUIRED_EVIDENCE,
    safeguards: {
      duplicateAndTraversalPaths: "REJECTED",
      nestedArchives: "REJECTED",
      rawTracesAndSourceMedia: "REJECTED",
      fontBinaries: "REJECTED",
      dataFontBase64: "REJECTED",
      privatePathsAndSecrets: "REJECTED",
    },
    payloads,
    summary: {
      payloadCount: payloads.length,
      payloadBytes: payloads.reduce((sum, file) => sum + file.bytes, 0),
      imageCount: payloads.filter(({ kind }) => kind === "image").length,
      recordingCount: payloads.filter(({ kind }) => kind === "video").length,
    },
  };
}

function inspectPackage({ archiveBytes: archiveInput, detachedBytes: detachedInput }) {
  const archiveBytes = Buffer.from(archiveInput);
  const detachedBytes = Buffer.from(detachedInput);
  const parsed = parseStoredZip(archiveBytes, MAX_ARCHIVE_BYTES);
  invariant(parsed.entries.has(IN_ARCHIVE_MANIFEST), `ZIP omits ${IN_ARCHIVE_MANIFEST}`);
  const folded = new Set();
  for (const [relativePath, entry] of parsed.entries) {
    assertAllowedEntryPath(relativePath);
    const key = relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    invariant(!folded.has(key), `case-folded duplicate ZIP path: ${relativePath}`);
    folded.add(key);
    assertNoPrivateOrSecretPayload(entry.data, relativePath);
    assertPayloadSignature(entry.data, relativePath);
    invariant(!RAW_PHASE4_MEDIA_HASHES.has(sha256(entry.data)), `raw Phase 4 source media is forbidden: ${relativePath}`);
  }

  const payloadEntries = new Map([...parsed.entries].filter(([relativePath]) => relativePath !== IN_ARCHIVE_MANIFEST));
  validateSemanticEvidence(payloadEntries);
  const payloads = [...payloadEntries].map(([relativePath, entry]) => recordFor(relativePath, entry));
  const manifestEntry = parsed.entries.get(IN_ARCHIVE_MANIFEST);
  const embedded = JSON.parse(manifestEntry.data.toString("utf8"));
  invariant(Buffer.from(stableJson(embedded)).equals(manifestEntry.data), "embedded manifest is not canonical JSON");
  invariant(sameJson(embedded, expectedManifest(payloads)), "embedded manifest differs from independently reconstructed payload authority");

  const detached = JSON.parse(detachedBytes.toString("utf8"));
  invariant(Buffer.from(stableJson(detached)).equals(detachedBytes), "detached manifest is not canonical JSON");
  const entries = [...parsed.entries].map(([relativePath, entry]) => ({ path: relativePath, bytes: entry.data.length, sha256: sha256(entry.data), crc32: entry.crc32 }));
  const expectedDetached = {
    schema: DETACHED_SCHEMA,
    archive: { filename: REVIEW_ZIP_NAME, bytes: archiveBytes.length, sha256: sha256(archiveBytes), entryCount: entries.length },
    embeddedManifest: { path: IN_ARCHIVE_MANIFEST, bytes: manifestEntry.data.length, sha256: sha256(manifestEntry.data) },
    entries,
  };
  invariant(sameJson(detached, expectedDetached), "detached manifest differs from independently reparsed ZIP bytes");

  const report = {
    schema: AUDIT_SCHEMA,
    status: "PASS",
    archive: { filename: REVIEW_ZIP_NAME, bytes: archiveBytes.length, sha256: sha256(archiveBytes), entryCount: parsed.entries.size },
    detachedManifest: { filename: DETACHED_MANIFEST_NAME, bytes: detachedBytes.length, sha256: sha256(detachedBytes) },
    embeddedManifest: { path: IN_ARCHIVE_MANIFEST, bytes: manifestEntry.data.length, sha256: sha256(manifestEntry.data) },
    payloads,
    checks: {
      exactExternalZipBasename: "PASS",
      deterministicStoredZip: "PASS",
      crcEveryEntry: "PASS",
      payloadBytesAndSha256: "PASS",
      mediaSignatures: "PASS",
      requiredEvidence: "PASS",
      provenanceAndDeployment: "PASS",
      priorHumanDecisionsPreserved: "PASS",
      sixCurrentGatesPending: "PASS",
      exactPhase4Hashes: "PASS",
      embeddedAndDetachedManifestBindings: "PASS",
    },
    crcResult: "PASS",
    duplicateAndTraversalPathStatus: "PASS",
    nestedArchiveStatus: "PASS",
    rawTraceAndSourceMediaStatus: "PASS",
    fontBinaryAndEmbeddedDataFontStatus: "PASS",
    privacyAndSecretsScan: "PASS",
    imageDecodeStatus: payloads.some(({ kind }) => kind === "image") ? "PENDING FULL DECODE" : "NOT APPLICABLE",
    recordingDecodeStatus: "PENDING FULL DECODE",
  };
  return { report, entries: payloadEntries };
}

export function auditPackageBytes(input) {
  return Object.freeze(inspectPackage(input).report);
}

async function decodeImages(entries, sharpOverride = null) {
  const images = [...entries].filter(([relativePath]) => IMAGE_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase()));
  if (images.length === 0) return Object.freeze({ status: "NOT APPLICABLE", count: 0, decoder: null, files: [] });
  let sharp = sharpOverride;
  if (!sharp) {
    try { ({ default: sharp } = await import("sharp")); }
    catch (error) { throw new Error(`sharp is required for full raster decode: ${error.message}`); }
  }
  const files = [];
  for (const [relativePath, entry] of images) {
    const decoded = await sharp(entry.data, { failOn: "error", limitInputPixels: 250_000_000, sequentialRead: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    invariant(decoded.data.length > 0 && decoded.info.width > 0 && decoded.info.height > 0, `full raster decode produced no pixels: ${relativePath}`);
    files.push({ path: relativePath, status: "PASS", width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels, decodedBytes: decoded.data.length });
  }
  return Object.freeze({ status: "PASS", count: files.length, decoder: `sharp ${sharp.versions?.sharp ?? "supplied"}`, files });
}

async function resolveFfmpeg(supplied = null) {
  const candidates = [...new Set([supplied, process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean))];
  for (const command of candidates) {
    try {
      const result = await execFileAsync(command, ["-version"], { windowsHide: true, maxBuffer: 1024 * 1024 });
      return { command, basename: path.basename(command), version: String(result.stdout).split(/\r?\n/, 1)[0] };
    } catch { /* try the next explicit/resolved candidate */ }
  }
  throw new Error("FFmpeg is required for full MP4 decode; supply --ffmpeg or FFMPEG_PATH");
}

async function decodeRecordings(entries, ffmpegOverride = null, decoderOverride = null) {
  const recordings = [...entries].filter(([relativePath]) => path.posix.extname(relativePath).toLowerCase() === ".mp4");
  invariant(recordings.length === REQUIRED_RECORDING_PATHS.length, "full decode requires all eighteen governed MP4 recordings");
  if (decoderOverride) {
    const files = [];
    for (const [relativePath, entry] of recordings) {
      const result = await decoderOverride({ relativePath, bytes: Buffer.from(entry.data) });
      invariant(result === true || result?.status === "PASS", `supplied MP4 full decoder rejected: ${relativePath}`);
      files.push({ path: relativePath, status: "PASS" });
    }
    return Object.freeze({ status: "PASS", count: files.length, decoder: "supplied full-decode verifier", files });
  }
  const ffmpeg = await resolveFfmpeg(ffmpegOverride);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qh-phase7a-r1-decode-"));
  try {
    const files = [];
    for (let index = 0; index < recordings.length; index += 1) {
      const [relativePath, entry] = recordings[index];
      const candidate = path.join(temporary, `${String(index).padStart(4, "0")}.mp4`);
      await writeFile(candidate, entry.data, { flag: "wx" });
      await execFileAsync(ffmpeg.command, ["-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-i", candidate, "-map", "0:v:0", "-f", "null", "-"], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      files.push({ path: relativePath, status: "PASS" });
    }
    return Object.freeze({ status: "PASS", count: files.length, decoder: `${ffmpeg.basename}: ${ffmpeg.version}`, files });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function auditReviewBytes(input) {
  const inspected = inspectPackage(input);
  const [images, recordings] = await Promise.all([
    decodeImages(inspected.entries, input.sharp ?? null),
    decodeRecordings(inspected.entries, input.ffmpeg ?? null, input.recordingDecoder ?? null),
  ]);
  return Object.freeze({
    ...inspected.report,
    mediaDecode: { images, recordings },
    imageDecodeStatus: images.status,
    recordingDecodeStatus: recordings.status,
    checks: {
      ...inspected.report.checks,
      rasterFullDecode: images.status === "NOT APPLICABLE" ? "NOT APPLICABLE" : "PASS",
      mp4FullDecode: recordings.status === "PASS" ? "PASS" : "FAIL",
    },
  });
}

export function assertExternalPath(candidate, label = "path", { repositoryRoot = ROOT, temporaryRoot = os.tmpdir() } = {}) {
  invariant(typeof candidate === "string" && path.isAbsolute(candidate), `${label} must be an explicit absolute path`);
  const resolved = path.resolve(candidate);
  invariant(resolved !== path.parse(resolved).root, `${label} cannot be a filesystem root`);
  invariant(!isWithin(repositoryRoot, resolved), `${label} must remain outside the repository`);
  invariant(!isWithin(temporaryRoot, resolved), `${label} must remain outside OS temporary storage`);
  return resolved;
}

async function canonicalFile(candidate, label, basename) {
  const requested = assertExternalPath(candidate, label);
  invariant(path.basename(requested) === basename, `${label} basename must be exactly ${basename}`);
  const info = await lstat(requested);
  invariant(info.isFile() && !info.isSymbolicLink(), `${label} must be a real file`);
  const resolved = await realpath(requested);
  assertExternalPath(resolved, label);
  return resolved;
}

async function assertFresh(candidate) {
  try { await access(candidate); throw new Error(`refusing to overwrite existing independent audit: ${candidate}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

export async function auditPackageFiles({ archive, manifest, auditOutput, ffmpeg = null }) {
  const archiveFile = await canonicalFile(archive, "--archive", REVIEW_ZIP_NAME);
  const manifestFile = await canonicalFile(manifest, "--manifest", DETACHED_MANIFEST_NAME);
  const output = assertExternalPath(auditOutput, "--audit-output");
  invariant(path.basename(output) === INDEPENDENT_AUDIT_NAME, `--audit-output basename must be exactly ${INDEPENDENT_AUDIT_NAME}`);
  const parent = await realpath(path.dirname(output));
  const resolvedOutput = path.join(parent, path.basename(output));
  assertExternalPath(resolvedOutput, "--audit-output");
  invariant(path.dirname(archiveFile) === path.dirname(manifestFile) && path.dirname(manifestFile) === path.dirname(resolvedOutput), "ZIP, detached manifest, and independent audit must be siblings");
  await assertFresh(resolvedOutput);
  const report = await auditReviewBytes({ archiveBytes: await readFile(archiveFile), detachedBytes: await readFile(manifestFile), ffmpeg });
  const bytes = Buffer.from(stableJson(report));
  assertNoPrivateOrSecretPayload(bytes, INDEPENDENT_AUDIT_NAME);
  await writeFile(resolvedOutput, bytes, { flag: "wx" });
  return Object.freeze({ status: "PASS", audit: { filename: INDEPENDENT_AUDIT_NAME, bytes: bytes.length, sha256: sha256(bytes) }, archiveSha256: report.archive.sha256, crcResult: "PASS" });
}

export function parseArguments(argv) {
  const options = { archive: null, manifest: null, auditOutput: null, ffmpeg: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[index + 1];
      invariant(value && !value.startsWith("--"), `${flag} requires a value`);
      index += 1;
      return value;
    };
    if (flag === "--archive") options.archive = next();
    else if (flag === "--manifest") options.manifest = next();
    else if (flag === "--audit-output") options.auditOutput = next();
    else if (flag === "--ffmpeg") options.ffmpeg = next();
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown option: ${flag}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "Usage:",
    "  node scripts/audit-phase7a-r1-review.mjs",
    `    --archive <external>/${REVIEW_ZIP_NAME}`,
    `    --manifest <external>/${DETACHED_MANIFEST_NAME}`,
    `    --audit-output <fresh-external>/${INDEPENDENT_AUDIT_NAME}`,
    "    [--ffmpeg <executable>]",
  ].join("\n"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  invariant(options.archive, "--archive is required");
  invariant(options.manifest, "--manifest is required");
  invariant(options.auditOutput, "--audit-output is required");
  process.stdout.write(`${JSON.stringify(await auditPackageFiles(options), null, 2)}\n`);
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
