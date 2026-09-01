import { execFile } from "node:child_process";
import {
  access,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
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
import {
  crc32,
  createStoredZipBuffer,
  sha256,
  stableJson,
  validateIsoBmffRecording,
} from "./package-phase7a-human-review.mjs";
import { PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS, validateManifestoClippingAuthority, validateManifestoGeometry } from "./phase7a-manifesto-geometry.mjs";
import { assertTargetSizePass } from "./phase7a-target-size.mjs";
import { validateScenarioStates } from "./capture-phase7a-review-evidence.mjs";

export { sha256, stableJson };

const SCRIPT = fileURLToPath(import.meta.url);
const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
export const PACKAGE_SCHEMA = "quantum-hub.phase-7a-r1.signal-field-authority-human-review.v1";
export const DETACHED_SCHEMA = `${PACKAGE_SCHEMA}.detached-manifest`;
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const REVIEW_ZIP_NAME = PHASE7A_R1_REVIEW_ZIP_NAME;
export const DETACHED_MANIFEST_NAME = REVIEW_ZIP_NAME.replace(/\.zip$/i, ".manifest.json");
export const INDEPENDENT_AUDIT_NAME = REVIEW_ZIP_NAME.replace(/\.zip$/i, ".audit.json");
export const MAX_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
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
    Object.freeze({ kind: "javascript", route: "/_astro/index.astro_astro_type_script_index_0_lang.DuXUZIF3.js", bytes: 2_604, sha256: "05006aae308ac99e9f16bb4c7d93b75f41e8766ea06aaf9d8c3d19fb1a7bb52a" }),
    Object.freeze({ kind: "css", route: "/_astro/index.CMvgVrhb.css", bytes: 17_131, sha256: "a9932a0eed64df5c5a5ebc35067b003558644bbddb8c179227364c1b340c0691" }),
  ]),
});

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

const REQUIRED_ROLE_BY_PATH = new Map(REQUIRED_EVIDENCE.map(({ relativePath, role }) => [relativePath, role]));
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

function crc32Hex(bytes) {
  return crc32(bytes).toString(16).padStart(8, "0");
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function safeEvidencePath(value, label = "evidence path") {
  invariant(typeof value === "string" && value.length > 0 && value.length <= 512, `${label} must be a non-empty portable path`);
  invariant(!value.includes("\\") && !value.includes("\0") && !value.startsWith("/") && !/^[a-z]:/i.test(value), `${label} must be relative and portable`);
  invariant(!/%(?:2e|2f|5c)/i.test(value) && !/[?#:]/.test(value), `${label} contains URL/path reinterpretation syntax`);
  const parts = value.split("/");
  invariant(parts.every((part) => part && part !== "." && part !== ".." && !/[. ]$/.test(part)), `${label} contains an unsafe segment`);
  invariant(path.posix.normalize(value) === value, `${label} is not canonical`);
  return value;
}

export function assertAllowedEvidencePath(relativePath) {
  safeEvidencePath(relativePath);
  invariant(relativePath !== IN_ARCHIVE_MANIFEST, `${IN_ARCHIVE_MANIFEST} is reserved for the generated manifest`);
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
  invariant(!WINDOWS_PRIVATE_PATH.test(relativePath) && !POSIX_PRIVATE_PATH.test(relativePath) && !PRIVATE_MARKER.test(relativePath), `private local path in evidence name: ${relativePath}`);
  invariant(!WINDOWS_PRIVATE_PATH.test(text) && !POSIX_PRIVATE_PATH.test(text) && !PRIVATE_MARKER.test(text), `private local path in evidence payload: ${relativePath}`);
  invariant(!SECRET_MARKER.test(text), `secret-shaped content in evidence payload: ${relativePath}`);
  invariant(!DATA_FONT_BASE64.test(text), `embedded data:font/base64 payload is forbidden: ${relativePath}`);
  if (TEXT_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())) invariant(!Buffer.from(bytes).includes(0), `text payload contains NUL bytes: ${relativePath}`);
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

export function assertPayloadSignature(bytes, relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (extension === ".json") {
    try { JSON.parse(Buffer.from(bytes).toString("utf8")); }
    catch { throw new Error(`invalid JSON evidence: ${relativePath}`); }
  } else if (IMAGE_EXTENSIONS.has(extension)) assertImageSignature(bytes, relativePath);
  else if (extension === ".mp4") validateIsoBmffRecording(bytes, relativePath);
  return true;
}

function parseJsonEntry(entriesByPath, relativePath) {
  const entry = entriesByPath.get(relativePath);
  invariant(entry, `required R1 evidence is missing: ${relativePath}`);
  try { return JSON.parse(entry.data.toString("utf8")); }
  catch { throw new Error(`invalid required JSON evidence: ${relativePath}`); }
}

function gateRows(document, relativePath) {
  const rows = document?.gates ?? document?.humanReviewGates ?? document;
  invariant(Array.isArray(rows), `${relativePath} must contain a gates array`);
  return rows.map((row) => ({ gate: row?.gate ?? row?.name, status: row?.status }));
}

function validateGateAuthority(entriesByPath) {
  const prior = gateRows(parseJsonEntry(entriesByPath, "00-authority/prior-human-decisions.json"), "prior human decisions");
  invariant(stableJson(prior) === stableJson(PRIOR_HUMAN_DECISIONS), "prior human decisions differ from the accepted/repair record");
  const current = gateRows(parseJsonEntry(entriesByPath, "00-authority/current-human-gates.json"), "current human gates");
  const expected = PHASE7A_GATES.map((gate) => ({ gate, status: "PENDING HUMAN REVIEW" }));
  invariant(stableJson(current) === stableJson(expected), "all six current Phase 7A gates must remain PENDING HUMAN REVIEW");
}

function validatePhase4Hashes(entriesByPath) {
  const relativePath = "16-phase4/phase-4-hash-verification.json";
  const report = parseJsonEntry(entriesByPath, relativePath);
  invariant(report.status === "PASS", `${relativePath} must record PASS`);
  const rows = report.assets ?? report.files ?? report.entries;
  invariant(Array.isArray(rows), `${relativePath} must contain an asset inventory`);
  const observed = new Map();
  for (const row of rows) {
    const assetPath = row?.relativePath ?? row?.path;
    const hash = row?.sha256 ?? row?.actualSha256;
    invariant(typeof assetPath === "string" && /^[0-9a-f]{64}$/.test(hash ?? "") && !observed.has(assetPath), `${relativePath} has an invalid or duplicate asset row`);
    observed.set(assetPath, hash);
  }
  invariant(observed.size === PHYSICAL_ASSETS.length, `${relativePath} asset count differs`);
  for (const [assetPath, hash] of PHYSICAL_ASSETS) invariant(observed.get(assetPath) === hash, `${relativePath} authority mismatch: ${assetPath}`);
}

function validateProvenance(entriesByPath, sourceHead) {
  const report = parseJsonEntry(entriesByPath, "01-provenance/provenance.json");
  invariant(report.status === "PASS", "provenance must record PASS");
  invariant(report.branch === PHASE7A_R1_BRANCH && report.requiredParent === PHASE7A_R1_PARENT, "provenance branch or required parent differs");
  invariant(report.finalHead === sourceHead && /^[0-9a-f]{40}$/.test(report.directParent ?? ""), "provenance HEAD/direct-parent binding differs");
  invariant(report.localMain === FROZEN_MAIN && report.originMain === FROZEN_MAIN, "provenance must preserve local and origin main");
  invariant(report.zeroMergeCommits === true && report.localUpstreamParity === true && report.acceptedPhase6Ancestry === true && report.acceptedPhase6 === PHASE7A_PARENT, "provenance linearity, parity, or Phase 6 ancestry differs");
  invariant(Array.isArray(report.commits) && report.commits.length > 0, "provenance must contain the complete linear commit list");
  let expectedParent = PHASE7A_R1_PARENT;
  const seen = new Set();
  for (const [index, commit] of report.commits.entries()) {
    invariant(/^[0-9a-f]{40}$/.test(commit?.hash ?? "") && !seen.has(commit.hash), `provenance commit ${index} has an invalid or duplicate hash`);
    invariant(Array.isArray(commit.parents) && commit.parents.length === 1 && commit.parents[0] === expectedParent, `provenance commit ${index} breaks the linear ancestry from the accepted parent`);
    seen.add(commit.hash);
    expectedParent = commit.hash;
  }
  invariant(report.commits.at(-1).hash === sourceHead && report.directParent === report.commits.at(-1).parents[0], "provenance commit list does not bind final HEAD and its exact direct parent");
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

function validateFirefoxFirstPaint(entriesByPath) {
  const report = parseJsonEntry(entriesByPath, "10-firefox/firefox-first-paint-report.json");
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
  return report;
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

function indexRuntimeAssets(records, label, served = false) {
  invariant(Array.isArray(records) && records.length > 0, `${label} runtime asset inventory differs`);
  const indexed = new Map();
  records.forEach((record, index) => {
    validateRuntimeAsset(record, `${label} ${index + 1}`, served);
    const key = `${record.kind}\t${record.route}`;
    invariant(!indexed.has(key), `${label} contains duplicate runtime asset: ${record.route}`);
    indexed.set(key, record);
  });
  return indexed;
}

function compareRuntimeAssetSets(actualRecords, expectedRecords, label, actualServed = false) {
  const actual = indexRuntimeAssets(actualRecords, label, actualServed);
  const expected = indexRuntimeAssets(expectedRecords, `${label} authority`);
  invariant(actual.size === expected.size, `${label} runtime asset inventory differs`);
  for (const [key, authority] of expected) {
    const record = actual.get(key);
    invariant(record, `${label} is missing runtime asset: ${authority.route}`);
    invariant(record.kind === authority.kind && record.route === authority.route && record.bytes === authority.bytes && record.sha256 === authority.sha256, `${label} differs: ${authority.route}`);
  }
  return actual;
}

function validateRuntimeAssets(report, sourceHead) {
  invariant(report?.derivation === "linked CSS/JS paths parsed from each verified root HTML response", "served-build runtime asset derivation differs");
  const before = report.before;
  invariant(before?.revision === PHASE7A_R1_PARENT && Array.isArray(before.served) && before.served.length === EXACT_PARENT_RUNTIME_ASSETS.records.length, "served exact-parent runtime asset inventory differs");
  compareRuntimeAssetSets(before.served, EXACT_PARENT_RUNTIME_ASSETS.records, "served exact-parent runtime asset", true);
  invariant(before.fingerprint === runtimeAssetFingerprint(before.served) && before.fingerprint === EXACT_PARENT_RUNTIME_ASSETS.fingerprint, "served exact-parent runtime asset fingerprint differs");
  invariant(before.authority?.revision === PHASE7A_R1_PARENT && before.authority.derivation === EXACT_PARENT_RUNTIME_ASSETS.derivation && before.authority.fingerprint === EXACT_PARENT_RUNTIME_ASSETS.fingerprint, "served exact-parent immutable runtime receipt differs");
  const after = report.after;
  invariant(after && Array.isArray(after.localDist) && after.localDist.length >= 2 && Array.isArray(after.served), "served R1 runtime asset inventory differs");
  compareRuntimeAssetSets(after.served, after.localDist, "served R1 runtime asset", true);
  invariant(after.localFingerprint === runtimeAssetFingerprint(after.localDist) && after.servedFingerprint === runtimeAssetFingerprint(after.served) && after.localFingerprint === after.servedFingerprint, "served/local R1 runtime asset fingerprint differs");
  return { before, after };
}

function validatePortableServedBuild(receipt, sourceHead, served, label) {
  invariant(receipt?.schema === PORTABLE_SERVED_BUILD_SCHEMA && receipt.status === "PASS" && receipt.branch === PHASE7A_R1_BRANCH && receipt.revision === sourceHead, `${label} portable served-build branch/HEAD differs`);
  invariant(receipt.document?.relativePath === "dist/index.html" && receipt.document.bytes === served.documents.after.bytes && receipt.document.sha256 === served.documents.after.sha256, `${label} portable served-build document differs`);
  compareRuntimeAssetSets(receipt.runtimeAssets, served.runtimeAssets.after.localDist, `${label} portable runtime asset`);
  invariant(receipt.runtimeFingerprint === runtimeAssetFingerprint(receipt.runtimeAssets) && receipt.runtimeFingerprint === served.runtimeAssets.after.localFingerprint, `${label} portable runtime fingerprint differs`);
  invariant(receipt.servedParity?.document === true && receipt.servedParity?.runtimeAssets === true, `${label} portable served parity differs`);
  invariant(receipt.freshBuild?.command === "npm run build:phase7a-r1" && receipt.freshBuild.headBefore === sourceHead && receipt.freshBuild.headAfter === sourceHead && receipt.freshBuild.worktreeCleanBefore === true && receipt.freshBuild.worktreeCleanAfter === true, `${label} portable fresh-build receipt differs`);
}

function validatePortableSource(record, receipt, label) {
  invariant(record?.status === receipt.status && record.branch === receipt.branch && record.revision === receipt.revision && record.runtimeFingerprint === receipt.runtimeFingerprint, `${label} source branch/runtime differs`);
  invariant(record.document?.relativePath === receipt.document.relativePath && record.document.bytes === receipt.document.bytes && record.document.sha256 === receipt.document.sha256, `${label} source document differs`);
  invariant(JSON.stringify(Object.keys(record).sort()) === JSON.stringify(["branch", "document", "revision", "runtimeFingerprint", "status"].sort()), `${label} source inventory differs`);
}

function validateServedBuildAuthority(entriesByPath, sourceHead, deployment) {
  const report = parseJsonEntry(entriesByPath, SERVED_BUILD_AUTHORITY_PATH);
  invariant(report.schema === SERVED_BUILD_AUTHORITY_SCHEMA && report.status === "PASS", "served-build authority schema/status differs");
  const repository = report.repository;
  invariant(repository?.schema === SERVED_BUILD_AUTHORITY_SCHEMA && repository.branch === PHASE7A_R1_BRANCH && repository.head === sourceHead && repository.exactParent === PHASE7A_R1_PARENT, "served-build repository branch/HEAD/parent authority differs");
  invariant(repository.parentIsAncestor === true && repository.mergeCommitsSinceParent === 0 && repository.worktreeClean === true && Array.isArray(repository.worktreeStatus) && repository.worktreeStatus.length === 0, "served-build repository ancestry/cleanliness authority differs");
  const build = repository.buildReceipt;
  invariant(build?.command === "npm run build:phase7a-r1" && build.authorityProfile === "phase7a-r1" && build.completed === true && build.headBefore === sourceHead && build.headAfter === sourceHead && build.branchAfter === PHASE7A_R1_BRANCH && build.worktreeCleanAfter === true && Array.isArray(build.worktreeStatusAfter) && build.worktreeStatusAfter.length === 0, "served-build governed build receipt differs");
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
  invariant(JSON.stringify(deployment.servedBuildDocumentBinding) === JSON.stringify(binding), "served-build authority differs from deployment verification binding");
  return report;
}

const RECORDING_CHECKS = Object.freeze(["audioStreams", "codec", "constantFrameRate", "container", "decodedFrames", "dimensions", "duration", "fullDecode", "oneVideoStream", "otherStreams", "pixelFormat"]);

function validateRecordingChecks(checks, label) {
  invariant(checks && typeof checks === "object" && !Array.isArray(checks), `${label} validation checks are missing`);
  invariant(JSON.stringify(Object.keys(checks).sort()) === JSON.stringify([...RECORDING_CHECKS].sort()), `${label} validation check map differs`);
  for (const name of RECORDING_CHECKS) invariant(checks[name] === true, `${label} validation check failed: ${name}`);
}

function bindRecordingInventory(entriesByPath) {
  const expected = new Set(REQUIRED_RECORDING_PATHS);
  const actual = [...entriesByPath.keys()].filter((relativePath) => path.posix.extname(relativePath).toLowerCase() === ".mp4");
  invariant(actual.length === expected.size && new Set(actual).size === actual.length && actual.every((relativePath) => expected.has(relativePath)), "review package must contain exactly the 18 governed MP4 recording paths");

  const lifecycle = parseJsonEntry(entriesByPath, "13-performance/performance-and-lifecycle-report.json");
  const served = parseJsonEntry(entriesByPath, SERVED_BUILD_AUTHORITY_PATH);
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
    const payload = entriesByPath.get(relativePath)?.data;
    invariant(payload && record.bytes === payload.length && record.sha256 === sha256(payload), `scenario recording bytes/hash binding differs: ${relativePath}`);
  }

  const signal = parseJsonEntry(entriesByPath, "04-signal-field/before-after-report.json");
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
    const payload = entriesByPath.get(relativePath)?.data;
    invariant(payload && record.bytes === payload.length && record.sha256 === sha256(payload), `Signal Field comparison recording bytes/hash binding differs: ${relativePath}`);
  }
}

function validateInstalledChromeUiAuthority(entriesByPath, chrome) {
  const authority = chrome.visibleBrowserZoomConfirmation;
  invariant(authority?.schema === INSTALLED_CHROME_UI_SCHEMA && authority.status === "PASS" && authority.visibleZoomConfirmation === true, "installed Chrome visible UI authority schema/status differs");
  invariant(authority.browserWindow?.product === "Google Chrome" && authority.browserWindow.processName === "chrome.exe" && authority.browserWindow.visible === true && authority.browserWindow.remoteDebuggingProcessMatched === true && typeof authority.browserWindow.title === "string" && authority.browserWindow.title.trim().length > 0, "installed Chrome visible UI window identity differs");
  const observation = authority.visibleZoomObservation;
  invariant(observation?.method === "windows-ui-automation-accessibility-tree" && observation.chromeMenuVisible === true && observation.observedLabel === "200%", "installed Chrome visible 200% observation differs");
  invariant(Array.isArray(authority.screenshots) && authority.screenshots.length === 1, "installed Chrome UI screenshot ledger is missing or noncanonical");
  const paths = new Set();
  for (const row of authority.screenshots) {
    invariant(row?.relativePath === "09-chrome-200/visuals/ui-01-chrome-visible-200-percent.png" && !paths.has(row.relativePath), "installed Chrome UI screenshot path is missing or duplicated");
    const payload = entriesByPath.get(row.relativePath)?.data;
    invariant(payload && row.format === "png" && row.bytes === payload.length && row.sha256 === sha256(payload), `installed Chrome UI screenshot bytes/hash differ: ${row.relativePath}`);
    invariant(Number.isSafeInteger(row.width) && row.width > 0 && Number.isSafeInteger(row.height) && row.height > 0 && Number.isFinite(row.entropy) && row.entropy >= 1 && Number.isFinite(row.maximumChannelRange) && row.maximumChannelRange >= 80, `installed Chrome UI screenshot decode authority differs: ${row.relativePath}`);
    paths.add(row.relativePath);
  }
  invariant(paths.has(observation.screenshot), "installed Chrome visible 200% observation is not bound to a packaged screenshot");
  return paths;
}

function validateRasterEvidenceTopology(entriesByPath) {
  const images = [...entriesByPath.keys()].filter((relativePath) => IMAGE_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase()));
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
  for (const relativePath of requiredNames) invariant(entriesByPath.has(relativePath), `required visual evidence is missing: ${relativePath}`);
  exact("04-signal-field/visuals/", 2, "Signal Field before/after");
  exact("05-audience/visuals/", 2, "audience bifurcation");
  exact("07-field-map/visuals/", 4, "Field Map");
  exact("12-fallback/visuals/", 3, "fallback");
  exact("10-firefox/visuals/", 2, "Firefox first-paint");
  exact("15-publication/visuals/", 8, "semantic route and real-404");

  const typography = parseJsonEntry(entriesByPath, "06-typography/typography-report.json");
  invariant(Array.isArray(typography.candidates) && typography.candidates.length === 4, "typography report must reference four rendered specimens");
  const specimens = new Set(typography.candidates.map(({ specimen }) => specimen));
  invariant(specimens.size === 4 && [...specimens].every((relativePath) => /^06-typography\/visuals\/[a-z0-9-]+-specimen\.png$/i.test(relativePath) && entriesByPath.has(relativePath)), "typography specimen references are incomplete or missing");
  invariant(exact("06-typography/visuals/", 4, "typography").every((relativePath) => specimens.has(relativePath)), "typography raster inventory differs from its report");

  const chrome = parseJsonEntry(entriesByPath, "09-chrome-200/installed-chrome-200-percent-report.json");
  const native = exact("09-chrome-200/visuals/native-", 15, "installed Chrome native 200%");
  const ui = under("09-chrome-200/visuals/ui-");
  const uiAuthorityPaths = validateInstalledChromeUiAuthority(entriesByPath, chrome);
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

function validateTargetInventory(entriesByPath) {
  const report = parseJsonEntry(entriesByPath, "08-targets/target-size-inventory.json");
  invariant(report.schema === "quantum-hub.phase-7a-r1.target-ledger.v1" && report.status === "PASS" && report.minimumCssPixels === 44, "target-size inventory schema/status/minimum differs");
  invariant(Array.isArray(report.states) && report.states.length === 10 && report.stateCount === 10, "target-size inventory must retain the ten required responsive/fallback/Field Map states");
  const ids = new Set();
  for (const state of report.states) {
    invariant(typeof state?.id === "string" && state.id.length > 0 && !ids.has(state.id) && typeof state.route === "string" && typeof state.state === "string", "target-size state identity is missing or duplicated");
    ids.add(state.id);
    validateTargetObservation(state.report, `target-size state ${state.id}`);
  }
  invariant(report.summary?.activeFailures === 0 && report.summary?.unexplainedExclusions === 0 && report.summary?.contractFailures === 0, "target-size aggregate retains failures or invalid exclusions");
  const totals = report.states.reduce((result, state) => ({
    activeFailures: result.activeFailures + state.report.summary.targetFailures,
    validExclusions: result.validExclusions + state.report.summary.validExclusions,
    unexplainedExclusions: result.unexplainedExclusions + state.report.summary.unexplainedExclusions,
    contractFailures: result.contractFailures + state.report.summary.contractFailures,
  }), { activeFailures: 0, validExclusions: 0, unexplainedExclusions: 0, contractFailures: 0 });
  invariant(Object.keys(totals).every((name) => report.summary[name] === totals[name]), "target-size aggregate differs from independently recomputed state summaries");
}

function validateClippingReport(entriesByPath) {
  const report = parseJsonEntry(entriesByPath, "03-responsive/clipping-report.json");
  const expected = PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS.map(({ id }) => id);
  invariant(report.status === "PASS" && report.requiredViewportCount === 12 && Array.isArray(report.before) && Array.isArray(report.after) && report.before.length === 12 && report.after.length === 12, "responsive clipping report matrix differs");
  for (const [label, rows] of [["before", report.before], ["after", report.after]]) {
    invariant(rows.map(({ id }) => id).every((id, index) => id === expected[index]) && new Set(rows.map(({ id }) => id)).size === 12, `responsive ${label} viewport order/membership differs`);
    invariant(rows.every(({ measurement }) => measurement && typeof measurement === "object"), `responsive ${label} measurements are incomplete`);
  }
  const defect = report.before.find(({ id }) => id === "short-landscape-800x360");
  invariant(defect?.status === "FAIL" && typeof defect.failure === "string" && defect.failure.trim().length > 0, "exact-parent 800x360 clipping defect is missing");
  const defectMeasurement = defect.measurement;
  let clippingAuthority;
  try { clippingAuthority = validateManifestoClippingAuthority(defectMeasurement); }
  catch (error) { throw new Error(`exact-parent 800x360 clipping authority differs: ${error.message}`); }
  invariant(defectMeasurement.viewport.id === defect.id, "exact-parent 800x360 measurement viewport differs");
  const effectiveTop = clippingAuthority.effectiveVisibleBounds.top;
  const h1Top = defectMeasurement.h1?.rect?.top;
  const glyphTop = defectMeasurement.glyphBounds?.top;
  invariant([h1Top, glyphTop].every(Number.isFinite), "exact-parent 800x360 top-boundary geometry is incomplete");
  const defectAllowances = [defectMeasurement.safeAllowances?.h1?.top, defectMeasurement.safeAllowances?.glyphs?.top, ...(defectMeasurement.safeAllowances?.renderedLines ?? []).map(({ top }) => top)].filter(Number.isFinite);
  invariant(defectAllowances.some((value) => value < 2) || (defectMeasurement.boundaryAnalysis?.occludingHeaderIntersections?.length ?? 0) > 0 || (defectMeasurement.boundaryAnalysis?.glyphEscapes ?? []).some(({ sides }) => sides?.includes("top")) || (defectMeasurement.boundaryAnalysis?.boundaryIntersections ?? []).some(({ sides }) => sides?.includes("top")) || (defectMeasurement.boundaryAnalysis?.safetyViolations ?? []).some(({ sides }) => sides?.includes("top")), "exact-parent 800x360 defect lacks measured top-clipping evidence");
  invariant(h1Top < effectiveTop || glyphTop < effectiveTop, "exact-parent 800x360 glyph-bearing bounds do not cross the effective top boundary");
  for (const row of report.after) {
    invariant(row.status === "PASS" && !row.failure, `repaired clipping case failed: ${row.id}`);
    try { validateManifestoGeometry(row.measurement); }
    catch (error) { throw new Error(`repaired clipping measurement failed at ${row.id}: ${error.message}`); }
  }
}

const FIELD_MAP_DESTINATIONS = Object.freeze([
  ["/#entry", "Home"], ["/for-partners/", "For industry"], ["/for-startups/", "For startups"], ["/industries/", "Industries"],
  ["/pocs/", "Proof"], ["/spark/", "SPARK"], ["/about/", "About"], ["/contact/", "Contact"],
]);
const NO_JS_FIELD_MAP_DESTINATIONS = Object.freeze([
  ["/#entry", "00 Home 00 / origin"],
  ["/for-partners/", "01 For industry 01 / need"],
  ["/for-startups/", "02 For startups 02 / capability"],
  ["/industries/", "03 Industries 03 / context"],
  ["/pocs/", "04 Proof 04 / evidence"],
  ["/spark/", "05 SPARK 05 / programme"],
  ["/about/", "06 About 06 / position"],
  ["/contact/", "07 Contact 07 / signal"],
]);
const NO_JS_BIFURCATION_DESTINATIONS = Object.freeze([
  ["/for-partners/", "For industryPressure becomes proof."],
  ["/for-startups/", "For startupsA viable edge enters the field."],
]);

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

function validateFieldMapReport(entriesByPath) {
  const report = parseJsonEntry(entriesByPath, "07-field-map/semantic-isolation-report.json");
  invariant(report.status === "PASS", "Field Map semantic-isolation report must record PASS");
  validateMapClosed(report.states?.closed, "Field Map initial state");
  validateMapOpen(report.states?.open, "Field Map open state");
  validateMapClosed(report.states?.escape, "Field Map Escape state", true);
  const expectedFocus = [null, ...FIELD_MAP_DESTINATIONS.map(([, name]) => name), null];
  invariant(Array.isArray(report.focusSequence) && report.focusSequence.length === 10 && report.focusSequence.every(({ step, activeElement, activeDestinationName }, index) => step === index + 1 && activeElement === (expectedFocus[index] === null ? "field-map-summary" : "a") && (activeDestinationName ?? null) === expectedFocus[index]), "Field Map keyboard focus sequence differs");
  invariant(report.reverseFocus?.activeElement === "a" && report.reverseFocus.activeDestinationName === "Contact", "Field Map reverse keyboard wrap differs");
  invariant(Array.isArray(report.repeatedCycles) && report.repeatedCycles.length === 3, "Field Map repeated-cycle inventory differs");
  for (const [index, cycle] of report.repeatedCycles.entries()) {
    invariant(cycle.cycle === index + 1, "Field Map repeated-cycle order differs");
    validateMapOpen(cycle.opened, `Field Map cycle ${index + 1} open`);
    validateMapClosed(cycle.closed, `Field Map cycle ${index + 1} closed`);
  }
  for (const name of ["pagehide", "pageshow", "history"]) validateMapClosed(report.lifecycle?.[name], `Field Map ${name}`);
  for (const name of ["arrival", "back"]) validateMapClosed(report.navigation?.[name], `Field Map navigation ${name}`);
}

function rect(record, label) {
  invariant(record && ["left", "top", "right", "bottom", "width", "height"].every((name) => Number.isFinite(record[name])), `${label} bounds are missing`);
  invariant(record.width > 0 && record.height > 0 && Math.abs(record.width - (record.right - record.left)) < 0.05 && Math.abs(record.height - (record.bottom - record.top)) < 0.05, `${label} bounds differ`);
  return record;
}

function validateMeasuredVisibility(geometry, visibility, label, expectedViewport, requireFullGeometry = false) {
  invariant(visibility?.status === "PASS" && visibility.authority === "shared phase7a-manifesto-geometry measurement", `${label} measured visibility authority is missing`);
  validateManifestoClippingAuthority(geometry, [expectedViewport]);
  if (requireFullGeometry) validateManifestoGeometry(geometry, [expectedViewport]);
  const h1Presentation = geometry.h1?.presentation;
  const h1Visible = h1Presentation?.display !== "none" && !["collapse", "hidden"].includes(h1Presentation?.visibility) && Number.isFinite(h1Presentation?.opacity) && h1Presentation.opacity > 0;
  invariant(h1Visible && h1Presentation.visible === h1Visible, `${label} H1 presentation authority differs`);
  const viewport = rect(geometry.viewport, `${label} viewport`);
  const usable = rect(geometry.usableClipBounds, `${label} usable clip`);
  const effective = rect(geometry.effectiveVisibleBounds, `${label} effective visible`);
  const h1 = rect(geometry.h1?.rect, `${label} H1`);
  const glyphs = rect(geometry.glyphBounds, `${label} glyphs`);
  const header = geometry.occludingHeader;
  const headerRect = rect(header?.rect, `${label} sticky header`);
  const presentation = header?.presentation;
  invariant(typeof header?.position === "string" && typeof presentation?.display === "string" && typeof presentation.visibility === "string" && Number.isFinite(presentation.opacity), `${label} sticky-header measurement is missing`);
  const headerVisible = presentation.display !== "none" && !["collapse", "hidden"].includes(presentation.visibility) && presentation.opacity > 0;
  invariant(presentation.visible === headerVisible, `${label} sticky-header visibility authority differs`);
  const headerAnchored = ["fixed", "sticky"].includes(header.position) && headerRect.top <= viewport.top + 0.5 && headerRect.bottom > viewport.top;
  invariant(header.anchoredToViewportTop === headerAnchored && headerAnchored === true, `${label} sticky-header anchor authority differs`);
  const headerOverlap = headerRect.right > h1.left && headerRect.left < h1.right;
  invariant(header.horizontallyOverlapsManifesto === headerOverlap && headerOverlap === true, `${label} sticky-header overlap authority differs`);
  const headerOccluding = headerVisible && headerAnchored && headerOverlap;
  invariant(header.occluding === headerOccluding, `${label} sticky-header occlusion authority differs`);
  const headerBottom = headerOccluding ? Math.min(viewport.bottom, headerRect.bottom) : viewport.top;
  invariant(Number.isFinite(header.effectiveBottom) && Math.abs(header.effectiveBottom - headerBottom) <= 0.05, `${label} sticky-header effective bottom differs`);
  const expectedEffective = { left: usable.left, top: Math.max(usable.top, headerBottom), right: usable.right, bottom: usable.bottom };
  invariant(["left", "top", "right", "bottom"].every((side) => Math.abs(effective[side] - expectedEffective[side]) <= 0.05), `${label} effective visible boundary differs`);
  const visibilityEffective = rect(visibility.effectiveVisibleBounds, `${label} visibility-summary effective visible`);
  const visibilityH1 = rect(visibility.h1Bounds, `${label} visibility-summary H1`);
  const visibilityGlyphs = rect(visibility.glyphBounds, `${label} visibility-summary glyphs`);
  invariant(["left", "top", "right", "bottom"].every((side) => Math.abs(visibilityEffective[side] - effective[side]) <= 0.05 && Math.abs(visibilityH1[side] - h1[side]) <= 0.05 && Math.abs(visibilityGlyphs[side] - glyphs[side]) <= 0.05), `${label} visibility summary differs`);
  const expectedH1Allowances = { left: h1.left - effective.left, top: h1.top - effective.top, right: effective.right - h1.right, bottom: effective.bottom - h1.bottom };
  const expectedGlyphAllowances = { left: glyphs.left - effective.left, top: glyphs.top - effective.top, right: effective.right - glyphs.right, bottom: effective.bottom - glyphs.bottom };
  invariant(["left", "top", "right", "bottom"].every((side) => Math.abs(visibility.h1Allowances?.[side] - expectedH1Allowances[side]) <= 0.05 && Math.abs(visibility.glyphAllowances?.[side] - expectedGlyphAllowances[side]) <= 0.05), `${label} visibility allowance summary differs`);
  invariant(visibility.glyphBoxCount === geometry.authoredLines.flatMap(({ glyphBoxes }) => glyphBoxes ?? []).length && visibility.horizontalOverflow === false, `${label} visibility inventory differs`);
  invariant(headerOccluding ? Math.abs(visibility.visibleStickyHeaderBottom - headerBottom) <= 0.05 : visibility.visibleStickyHeaderBottom === null, `${label} visible sticky-header summary differs`);
  invariant(Array.isArray(geometry.authoredLines) && geometry.authoredLines.length === 3 && geometry.authoredLines.flatMap(({ glyphBoxes }) => glyphBoxes ?? []).length > 0, `${label} glyph-bearing line inventory differs`);
  const allowances = { h1Top: h1.top - effective.top, h1Bottom: effective.bottom - h1.bottom, h1Left: h1.left - effective.left, h1Right: effective.right - h1.right, glyphTop: glyphs.top - effective.top, glyphBottom: effective.bottom - glyphs.bottom, glyphLeft: glyphs.left - effective.left, glyphRight: effective.right - glyphs.right };
  invariant(Object.values(allowances).every((value) => value >= 2), `${label} intersects an effective clipping boundary`);
  invariant(geometry.horizontalOverflow === false && geometry.horizontalMetrics?.overflowPixels === 0 && (geometry.boundaryAnalysis?.glyphEscapes?.length ?? -1) === 0 && (geometry.boundaryAnalysis?.boundaryIntersections?.length ?? -1) === 0 && (geometry.boundaryAnalysis?.occludingHeaderIntersections?.length ?? -1) === 0, `${label} clipping/overflow inventory differs`);
}

function validateNoJavaScriptLinkInventory(inventory, expected, label) {
  invariant(Array.isArray(inventory) && inventory.length === expected.length, `${label} link inventory differs`);
  inventory.forEach((link, index) => {
    invariant(link?.index === index && link.href === expected[index][0] && link.accessibleName === expected[index][1], `${label} link ${index + 1} identity differs`);
    invariant(link.elementType === "a" && link.intendedInteractive === true, `${label} link ${index + 1} is not an intended link`);
    invariant(link.visible === true && link.fullyInViewport === true && link.unoccluded === true, `${label} link ${index + 1} is not fully visible and unoccluded`);
    invariant(Number.isFinite(link.width) && link.width > 0 && Number.isFinite(link.height) && link.height > 0, `${label} link ${index + 1} has no visible area`);
  });
}

function validateFallbackReports(entriesByPath) {
  const reduced = parseJsonEntry(entriesByPath, "12-fallback/reduced-motion-report.json").closure;
  invariant(reduced?.cinematicMode === "static" && reduced.signalField === true && reduced.bifurcationLinks === 2 && reduced.horizontalOverflow === false, "reduced-motion static authority differs");
  validateMeasuredVisibility(reduced.manifestoGeometry, reduced.manifestoVisibility, "reduced-motion manifesto", { id: "short-landscape-1440x900", width: 1440, height: 900 });
  const noJs = parseJsonEntry(entriesByPath, "12-fallback/no-js-report.json").closure;
  invariant(noJs?.enhancedController === null && noJs.nativeDetailsOpen === true && noJs.horizontalOverflow === false, "no-JavaScript native Field Map authority differs");
  validateMeasuredVisibility(noJs.manifestoGeometry, noJs.manifestoVisibility, "no-JavaScript manifesto", { id: "short-landscape-390x844", width: 390, height: 844 });
  validateNoJavaScriptLinkInventory(noJs.fieldMapLinkInventory, NO_JS_FIELD_MAP_DESTINATIONS, "no-JavaScript Field Map");
  validateNoJavaScriptLinkInventory(noJs.bifurcationLinkInventory, NO_JS_BIFURCATION_DESTINATIONS, "no-JavaScript bifurcation");
  const fallback = parseJsonEntry(entriesByPath, "12-fallback/fallback-font-report.json").closure;
  invariant(fallback?.anybodyLoaded === false && fallback.abortedFontRequests >= 1 && fallback.manifestoWords === 7 && fallback.horizontalOverflow === false, "fallback-font narrow authority differs");
  validateMeasuredVisibility(fallback.manifestoGeometry, fallback.manifestoVisibility, "fallback-font manifesto", { id: "short-landscape-320x800", width: 320, height: 800 }, true);
}

function validateQaCaptureAuthorities(entriesByPath) {
  const report = parseJsonEntry(entriesByPath, "11-accessibility/accessibility-report.json");
  const served = parseJsonEntry(entriesByPath, SERVED_BUILD_AUTHORITY_PATH);
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

function validateInstalledChrome(entriesByPath) {
  const report = parseJsonEntry(entriesByPath, "09-chrome-200/installed-chrome-200-percent-report.json");
  const served = parseJsonEntry(entriesByPath, SERVED_BUILD_AUTHORITY_PATH);
  validatePortableServedBuild(report.servedBuild, served.repository.head, served, "installed Chrome");
  validatePortableSource(report.sourceAuthority, report.servedBuild, "installed Chrome run");
  invariant(report.schema === "quantum-hub.phase-7a.installed-chrome-native-zoom.v1" && report.status === "PASS" && report.classification === "GENUINE INSTALLED GOOGLE CHROME BROWSER ZOOM", "installed Chrome native 200% authority differs");
  invariant(report.browser?.product === "Google Chrome" && report.browser.headed === true && typeof report.browser.version === "string" && report.browser.version.length > 0, "installed Chrome browser identity differs");
  validateExactTrueChecks(report.zoomProof?.checks, ["installedChromeUi", "widthHalved", "dprDoubled", "noDeviceEmulation"], "installed Chrome zoom proof");
  invariant(report.zoomProof.status === "PASS" && report.zoomProof.uiZoomLabel === "Zoom: 200%" && report.forbiddenSubstitutes?.viewportResize === false && report.forbiddenSubstitutes?.cssZoom === false && report.forbiddenSubstitutes?.transformScale === false && report.forbiddenSubstitutes?.deviceEmulation === false, "installed Chrome zoom method differs");
  invariant(Array.isArray(report.routes) && report.routes.length === 10 && report.routes.every(({ status }) => status === "PASS"), "installed Chrome route matrix differs");
  const expectedRoutePaths = [...PUBLIC_ROUTES.map(({ route }) => route), REAL_404_PATH];
  for (const [index, route] of report.routes.entries()) {
    invariant(route.path === expectedRoutePaths[index], `installed Chrome route ${index + 1} identity differs`);
    validatePortableSource(route.sourceAuthority, report.servedBuild, `installed Chrome route ${index + 1}`);
    validateExactTrueChecks(route.checks, ["httpStatus", "semanticH1", "landmarks", "noHorizontalOverflow", "wholeWords", "targetSizes", "manifestoUnclipped"], `installed Chrome route ${index + 1}`);
    validateTargetObservation(route.state?.targetSize, `installed Chrome route ${index + 1} targets`);
  }
  const home = report.routes.filter(({ path: routePath }) => routePath === "/");
  invariant(home.length === 1 && home[0].checks.manifestoUnclipped === true && home[0].state?.manifestoVisibility?.status === "PASS", "installed Chrome Home manifesto authority differs");
  const visibility = home[0].state.manifestoVisibility;
  const viewport = rect(visibility.viewportBounds, "installed Chrome viewport");
  const section = rect(visibility.sectionBounds, "installed Chrome manifesto section");
  const sectionClip = rect(visibility.sectionClipBounds, "installed Chrome manifesto section client bounds");
  const usable = rect(visibility.usableClipBounds, "installed Chrome usable clip bounds");
  const effective = rect(visibility.effectiveVisibleBounds, "installed Chrome effective visible");
  const h1 = rect(visibility.h1Bounds, "installed Chrome H1");
  const glyphs = rect(visibility.glyphBounds, "installed Chrome glyphs");
  const header = rect(visibility.header?.bounds, "installed Chrome sticky header");
  invariant(typeof visibility.header.visible === "boolean", "installed Chrome sticky-header visibility authority differs");
  const expectedHeaderAnchor = ["fixed", "sticky"].includes(visibility.header.position) && header.top <= viewport.top + 0.5 && header.bottom > viewport.top;
  const expectedHeaderOverlap = header.right > h1.left && header.left < h1.right;
  invariant(expectedHeaderAnchor === true && visibility.header.anchoredToViewportTop === expectedHeaderAnchor, "installed Chrome sticky-header anchor authority differs");
  invariant(expectedHeaderOverlap === true && visibility.header.horizontallyOverlapsManifesto === expectedHeaderOverlap, "installed Chrome sticky-header overlap authority differs");
  const expectedHeaderOcclusion = visibility.header.visible && expectedHeaderAnchor && expectedHeaderOverlap;
  invariant(visibility.header.occluding === expectedHeaderOcclusion, "installed Chrome sticky-header occlusion authority differs");
  invariant(sectionClip.left >= section.left - 0.05 && sectionClip.top >= section.top - 0.05 && sectionClip.right <= section.right + 0.05 && sectionClip.bottom <= section.bottom + 0.05, "installed Chrome section client bounds escape the section rectangle");
  invariant(Array.isArray(visibility.clippingAncestors), "installed Chrome clipping-ancestor authority is missing");
  const expectedUsable = { left: Math.max(viewport.left, sectionClip.left), top: Math.max(viewport.top, sectionClip.top), right: Math.min(viewport.right, sectionClip.right), bottom: Math.min(viewport.bottom, sectionClip.bottom) };
  const clippingOverflow = new Set(["auto", "clip", "hidden", "scroll"]);
  for (const [index, ancestor] of visibility.clippingAncestors.entries()) {
    const bounds = rect(ancestor?.bounds, `installed Chrome clipping ancestor ${index + 1}`);
    const contain = String(ancestor.contain || "").split(/\s+/);
    const paintContainment = contain.some((token) => ["content", "paint", "strict"].includes(token));
    const pathClipping = String(ancestor.clipPath || "none") !== "none";
    const clipsX = clippingOverflow.has(ancestor.overflowX) || paintContainment || pathClipping;
    const clipsY = clippingOverflow.has(ancestor.overflowY) || paintContainment || pathClipping;
    invariant(ancestor.clipsX === clipsX && ancestor.clipsY === clipsY && (clipsX || clipsY), `installed Chrome clipping ancestor ${index + 1} authority differs`);
    if (clipsX) { expectedUsable.left = Math.max(expectedUsable.left, bounds.left); expectedUsable.right = Math.min(expectedUsable.right, bounds.right); }
    if (clipsY) { expectedUsable.top = Math.max(expectedUsable.top, bounds.top); expectedUsable.bottom = Math.min(expectedUsable.bottom, bounds.bottom); }
  }
  for (const edge of ["left", "top", "right", "bottom"]) invariant(Math.abs(usable[edge] - expectedUsable[edge]) < 0.05, `installed Chrome usable clip ${edge} differs from section/ancestor authority`);
  if (expectedHeaderOcclusion) invariant(header.bottom > viewport.top && effective.top >= Math.min(viewport.bottom, header.bottom) - 0.05, "installed Chrome effective visible bounds omit the visible sticky header");
  const expectedEffective = { left: usable.left, top: Math.max(usable.top, expectedHeaderOcclusion ? Math.min(viewport.bottom, header.bottom) : viewport.top), right: usable.right, bottom: usable.bottom };
  for (const edge of ["left", "top", "right", "bottom"]) invariant(Math.abs(effective[edge] - expectedEffective[edge]) < 0.05, `installed Chrome effective visible ${edge} differs from usable-clip/header authority`);
  const allowances = { h1Top: h1.top - effective.top, h1Bottom: effective.bottom - h1.bottom, h1Left: h1.left - effective.left, h1Right: effective.right - h1.right, glyphTop: glyphs.top - effective.top, glyphBottom: effective.bottom - glyphs.bottom, glyphLeft: glyphs.left - effective.left, glyphRight: effective.right - glyphs.right };
  for (const [name, value] of Object.entries(allowances)) invariant(value >= 2 && Math.abs(visibility.safeAllowances?.[name] - value) < 0.05, `installed Chrome safe allowance differs: ${name}`);
  invariant(Array.isArray(report.visualEvidence) && report.visualEvidence.length === 15 && report.visualEvidence.every((visual) => visual.format === "png" && visual.width > 0 && visual.height > 0 && visual.bytes > 0 && visual.entropy >= 1 && visual.maximumChannelRange >= 80 && /^[0-9a-f]{64}$/.test(visual.sha256 ?? "")), "installed Chrome decoded/nonblank visual inventory differs");
  report.visualEvidence.forEach((visual, index) => {
    validatePortableSource(visual.sourceAuthority, report.servedBuild, `installed Chrome visual ${index + 1}`);
    const matches = [...entriesByPath.entries()].filter(([relativePath]) => relativePath.startsWith("09-chrome-200/visuals/native-") && relativePath.endsWith(`-${visual.filename}`));
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
  validateInstalledChromeUiAuthority(entriesByPath, report);
  report.fieldMap.visibleLinks.forEach((link, index) => invariant(link.href === FIELD_MAP_DESTINATIONS[index][0] && link.accessibleName.includes(FIELD_MAP_DESTINATIONS[index][1]) && link.visible === true && link.fullyInViewport === true && rect(link.bounds, `installed Chrome Field Map link ${index + 1}`).height >= 44, `installed Chrome Field Map link ${index + 1} differs`));
  invariant(report.fieldMap.backgroundRegions?.length >= 3 && report.fieldMap.backgroundRegions.every(({ inert, owned }) => inert === true && owned === true) && report.fieldMap.keyboardFocus?.inMap === true && report.fieldMap.escapeFocusReturn === true && report.fieldMap.inertAfterEscape === 0, "installed Chrome Field Map inert/focus authority differs");
  validateTargetObservation(report.fieldMap.targetSize, "installed Chrome Field Map targets");
}

function validateCriticalReports(entriesByPath) {
  validateClippingReport(entriesByPath);
  validateFieldMapReport(entriesByPath);
  validateTargetInventory(entriesByPath);
  validateInstalledChrome(entriesByPath);
  validateFallbackReports(entriesByPath);
  validateQaCaptureAuthorities(entriesByPath);
}

function validateDeploymentPayloadLedger(deployment) {
  invariant(Array.isArray(deployment.payloadLedger) && deployment.payloadLedger.length > 1, "deployment payload ledger is missing or vacuous");
  const paths = new Set();
  let comparableBytes = 0;
  for (const row of deployment.payloadLedger) {
    invariant(typeof row?.relativePath === "string" && row.relativePath.length > 0 && !paths.has(row.relativePath), "deployment payload path is missing or duplicated");
    invariant(row.status === "PASS" && row.localDist === "PASS" && Number.isSafeInteger(row.bytes) && row.bytes > 0 && /^[0-9a-f]{64}$/.test(row.sha256 ?? ""), `deployment payload local authority differs: ${row.relativePath}`);
    invariant(typeof row.publicPath === "string" && row.publicPath.startsWith("/") && [200, 404].includes(row.expectedHttpStatus), `deployment payload route/status authority differs: ${row.relativePath}`);
    invariant(typeof row.contentType === "string" && row.contentType.length > 0 && typeof row.cacheControl === "string" && row.cacheControl.length > 0 && Array.isArray(row.matchedPolicies), `deployment payload MIME/cache authority differs: ${row.relativePath}`);
    for (const origin of ["immutable", "branch"]) {
      const proof = row[origin];
      invariant(proof?.status === "PASS" && proof.actualHttpStatus === row.expectedHttpStatus && proof.bytes === row.bytes && proof.sha256 === row.sha256 && proof.headers === "PASS" && proof.security === "PASS", `deployment payload ${origin} parity differs: ${row.relativePath}`);
    }
    paths.add(row.relativePath);
    comparableBytes += row.bytes;
  }
  invariant(deployment.payloadTotals?.comparableFiles === deployment.payloadLedger.length && deployment.payloadTotals.files >= deployment.payloadLedger.length && deployment.payloadTotals.bytes >= comparableBytes, "deployment payload totals differ");
  const index = deployment.payloadLedger.filter(({ relativePath }) => relativePath === "index.html");
  invariant(index.length === 1 && deployment.servedBuildDocumentBinding?.bytes === index[0].bytes && deployment.servedBuildDocumentBinding?.sha256 === index[0].sha256, "deployment payload ledger differs from served index.html binding");
}

function validateRequiredReports(entriesByPath) {
  const governance = parseJsonEntry(entriesByPath, GOVERNANCE_PATH);
  invariant(governance.schema === GOVERNANCE_SCHEMA && governance.authorityProfile === "phase7a-r1", "external evidence governance authority differs");
  invariant(governance.status === "READY" && governance.fresh === true && /^[0-9a-f]{40}$/.test(governance.sourceHead ?? ""), "external evidence directory is not marked fresh and READY for a source HEAD");
  validateGateAuthority(entriesByPath);
  validateProvenance(entriesByPath, governance.sourceHead);
  validatePhase4Hashes(entriesByPath);

  const passReports = REQUIRED_EVIDENCE
    .map(({ relativePath }) => relativePath)
    .filter((relativePath) => relativePath.endsWith(".json") && ![
      GOVERNANCE_PATH,
      "00-authority/prior-human-decisions.json",
      "00-authority/current-human-gates.json",
      "01-provenance/provenance.json",
      SERVED_BUILD_AUTHORITY_PATH,
      "10-firefox/firefox-first-paint-report.json",
      "16-phase4/phase-4-hash-verification.json",
      "18-limitations/environmental-limitations.json",
    ].includes(relativePath));
  for (const relativePath of passReports) invariant(parseJsonEntry(entriesByPath, relativePath).status === "PASS", `${relativePath} must record PASS`);

  const deployment = parseJsonEntry(entriesByPath, "17-deployment/deployment-verification.json");
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
  validateServedBuildAuthority(entriesByPath, governance.sourceHead, deployment);
  validateFirefoxFirstPaint(entriesByPath);
  bindRecordingInventory(entriesByPath);
  validateRasterEvidenceTopology(entriesByPath);
  validateCriticalReports(entriesByPath);
}

function roleFor(relativePath) {
  if (REQUIRED_ROLE_BY_PATH.has(relativePath)) return REQUIRED_ROLE_BY_PATH.get(relativePath);
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "raster-evidence";
  if (extension === ".mp4") return "recording";
  return "supporting-document";
}

export function normalizeEvidenceEntries(input) {
  invariant(Array.isArray(input) && input.length > 0, "evidence entries must be a non-empty array");
  const normalized = input.map((entry) => {
    invariant(entry && typeof entry.relativePath === "string", "every evidence entry requires relativePath");
    assertAllowedEvidencePath(entry.relativePath);
    const data = Buffer.from(entry.data ?? []);
    invariant(data.length > 0 && data.length <= MAX_FILE_BYTES, `evidence byte boundary failed: ${entry.relativePath}`);
    assertNoPrivateOrSecretPayload(data, entry.relativePath);
    assertPayloadSignature(data, entry.relativePath);
    invariant(!RAW_PHASE4_MEDIA_HASHES.has(sha256(data)), `raw Phase 4 source media is forbidden: ${entry.relativePath}`);
    return Object.freeze({ relativePath: entry.relativePath, role: roleFor(entry.relativePath), data });
  }).sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));

  const entriesByPath = new Map();
  const foldedPaths = new Set();
  let totalBytes = 0;
  for (const entry of normalized) {
    const folded = entry.relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    invariant(!entriesByPath.has(entry.relativePath) && !foldedPaths.has(folded), `duplicate evidence path: ${entry.relativePath}`);
    entriesByPath.set(entry.relativePath, entry);
    foldedPaths.add(folded);
    totalBytes += entry.data.length;
  }
  invariant(totalBytes <= MAX_ARCHIVE_BYTES, "evidence content exceeds the package limit");
  for (const { relativePath } of REQUIRED_EVIDENCE) invariant(entriesByPath.has(relativePath), `required R1 evidence is missing: ${relativePath}`);
  validateRequiredReports(entriesByPath);
  return normalized;
}

function metadataFor(entry) {
  const extension = path.posix.extname(entry.relativePath).toLowerCase();
  return Object.freeze({
    path: entry.relativePath,
    role: entry.role,
    kind: IMAGE_EXTENSIONS.has(extension) ? "image" : extension === ".mp4" ? "video" : "document",
    bytes: entry.data.length,
    sha256: sha256(entry.data),
    crc32: crc32Hex(entry.data),
  });
}

function authority() {
  return {
    profile: "phase7a-r1",
    branch: PHASE7A_R1_BRANCH,
    exactParent: PHASE7A_R1_PARENT,
    acceptedPhase6: PHASE7A_PARENT,
    frozenMain: FROZEN_MAIN,
    reviewZipName: REVIEW_ZIP_NAME,
  };
}

function safeguards() {
  return {
    duplicateAndTraversalPaths: "REJECTED",
    nestedArchives: "REJECTED",
    rawTracesAndSourceMedia: "REJECTED",
    fontBinaries: "REJECTED",
    dataFontBase64: "REJECTED",
    privatePathsAndSecrets: "REJECTED",
  };
}

function makeManifest(files) {
  return {
    schema: PACKAGE_SCHEMA,
    archiveFilename: REVIEW_ZIP_NAME,
    deterministicEncoding: "canonical ZIP32 stored UTF-8; lexical entry order; DOS 1980-01-01 00:00:00",
    authority: authority(),
    requiredEvidence: REQUIRED_EVIDENCE,
    safeguards: safeguards(),
    payloads: files,
    summary: {
      payloadCount: files.length,
      payloadBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      imageCount: files.filter(({ kind }) => kind === "image").length,
      recordingCount: files.filter(({ kind }) => kind === "video").length,
    },
  };
}

export function buildReviewArtifacts(inputEntries) {
  const entries = normalizeEvidenceEntries(inputEntries);
  const payloads = entries.map(metadataFor);
  const manifest = makeManifest(payloads);
  const manifestBytes = Buffer.from(stableJson(manifest));
  assertNoPrivateOrSecretPayload(manifestBytes, IN_ARCHIVE_MANIFEST);
  const archiveEntries = [
    ...entries.map(({ relativePath, data }) => ({ relativePath, data })),
    { relativePath: IN_ARCHIVE_MANIFEST, data: manifestBytes },
  ];
  const archiveBytes = createStoredZipBuffer(archiveEntries);
  invariant(archiveBytes.length <= MAX_ARCHIVE_BYTES, "review ZIP exceeds the archive byte limit");
  const allEntries = archiveEntries
    .sort((left, right) => lexicalCompare(left.relativePath, right.relativePath))
    .map((entry) => ({ path: entry.relativePath, bytes: entry.data.length, sha256: sha256(entry.data), crc32: crc32Hex(entry.data) }));
  const detachedManifest = {
    schema: DETACHED_SCHEMA,
    archive: { filename: REVIEW_ZIP_NAME, bytes: archiveBytes.length, sha256: sha256(archiveBytes), entryCount: allEntries.length },
    embeddedManifest: { path: IN_ARCHIVE_MANIFEST, bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
    entries: allEntries,
  };
  const detachedBytes = Buffer.from(stableJson(detachedManifest));
  assertNoPrivateOrSecretPayload(detachedBytes, DETACHED_MANIFEST_NAME);
  return Object.freeze({ entries, payloads, manifest, manifestBytes, archiveBytes, detachedManifest, detachedBytes });
}

export function assertExternalPath(candidate, label = "path", { repositoryRoot = ROOT, temporaryRoot = os.tmpdir() } = {}) {
  invariant(typeof candidate === "string" && path.isAbsolute(candidate), `${label} must be an explicit absolute path`);
  const resolved = path.resolve(candidate);
  invariant(resolved !== path.parse(resolved).root, `${label} cannot be a filesystem root`);
  invariant(!isWithin(repositoryRoot, resolved), `${label} must remain outside the repository`);
  invariant(!isWithin(temporaryRoot, resolved), `${label} must remain outside OS temporary storage`);
  return resolved;
}

async function canonicalDirectory(candidate, label) {
  const requested = assertExternalPath(candidate, label);
  const info = await lstat(requested);
  invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} must be a real directory`);
  const resolved = await realpath(requested);
  assertExternalPath(resolved, label);
  return resolved;
}

async function walkEvidence(root, current = root, output = []) {
  const children = await readdir(current, { withFileTypes: true });
  children.sort((left, right) => lexicalCompare(left.name, right.name));
  for (const child of children) {
    const absolute = path.join(current, child.name);
    const info = await lstat(absolute);
    invariant(!info.isSymbolicLink(), `symbolic links are forbidden in evidence: ${path.relative(root, absolute)}`);
    if (info.isDirectory()) await walkEvidence(root, absolute, output);
    else {
      invariant(info.isFile(), `non-file evidence entry is forbidden: ${path.relative(root, absolute)}`);
      const relativePath = path.relative(root, absolute).split(path.sep).join("/");
      output.push({ relativePath, data: await readFile(absolute) });
    }
  }
  return output;
}

export async function collectEvidenceDirectory(evidenceRoot) {
  return normalizeEvidenceEntries(await walkEvidence(evidenceRoot));
}

async function assertFresh(paths) {
  for (const candidate of paths) {
    try { await access(candidate); throw new Error(`refusing to overwrite existing review artifact: ${candidate}`); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
}

export async function packageReview({ evidenceDir, outputDir, ffmpeg = null }) {
  const evidenceRoot = await canonicalDirectory(evidenceDir, "--evidence-dir");
  const outputRoot = await canonicalDirectory(outputDir, "--output-dir");
  const destinations = [REVIEW_ZIP_NAME, DETACHED_MANIFEST_NAME, INDEPENDENT_AUDIT_NAME].map((name) => path.join(outputRoot, name));
  await assertFresh(destinations);
  const artifacts = buildReviewArtifacts(await walkEvidence(evidenceRoot));
  const stagingRoot = await mkdtemp(path.join(outputRoot, ".phase7a-r1-package-"));
  const staged = [REVIEW_ZIP_NAME, DETACHED_MANIFEST_NAME, INDEPENDENT_AUDIT_NAME].map((name) => path.join(stagingRoot, name));
  try {
    await writeFile(staged[0], artifacts.archiveBytes, { flag: "wx" });
    await writeFile(staged[1], artifacts.detachedBytes, { flag: "wx" });
    const auditor = path.join(ROOT, "scripts", "audit-phase7a-r1-review.mjs");
    const args = [auditor, "--archive", staged[0], "--manifest", staged[1], "--audit-output", staged[2]];
    if (ffmpeg) args.push("--ffmpeg", ffmpeg);
    await execFileAsync(process.execPath, args, { cwd: ROOT, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    for (let index = 0; index < staged.length; index += 1) await rename(staged[index], destinations[index]);
    const auditBytes = await readFile(destinations[2]);
    return Object.freeze({
      status: "PASS",
      archive: { filename: REVIEW_ZIP_NAME, bytes: artifacts.archiveBytes.length, sha256: sha256(artifacts.archiveBytes) },
      detachedManifest: { filename: DETACHED_MANIFEST_NAME, bytes: artifacts.detachedBytes.length, sha256: sha256(artifacts.detachedBytes) },
      independentAudit: { filename: INDEPENDENT_AUDIT_NAME, bytes: auditBytes.length, sha256: sha256(auditBytes) },
    });
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

export function parseArguments(argv) {
  const options = { evidenceDir: null, outputDir: null, ffmpeg: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[index + 1];
      invariant(value && !value.startsWith("--"), `${flag} requires a value`);
      index += 1;
      return value;
    };
    if (flag === "--evidence-dir") options.evidenceDir = next();
    else if (flag === "--output-dir") options.outputDir = next();
    else if (flag === "--ffmpeg") options.ffmpeg = next();
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown option: ${flag}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "Usage:",
    "  node scripts/package-phase7a-r1-review.mjs",
    "    --evidence-dir <fresh governed absolute external directory>",
    "    --output-dir <fresh absolute external output directory>",
    "    [--ffmpeg <executable>]",
    `Produces ${REVIEW_ZIP_NAME}, its detached manifest, and an independent audit.`,
  ].join("\n"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  invariant(options.evidenceDir, "--evidence-dir is required");
  invariant(options.outputDir, "--output-dir is required");
  process.stdout.write(`${JSON.stringify(await packageReview(options), null, 2)}\n`);
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
