import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FROZEN_MAIN,
  PHASE7A_BRANCH,
  PHASE7A_GATES,
  PHASE7A_PARENT,
  PHYSICAL_ASSETS,
  PUBLIC_ROUTES,
  RECORDING_SCENARIOS,
  REVIEW_ZIP_NAME,
  TYPOGRAPHY_ASSETS,
} from "./phase7a-contract.mjs";
import {
  EXTERNAL_EVIDENCE_POLICY,
  HUMAN_GATE_RECORDS,
  REAL_404_PATH,
  RECORDING_MEDIA_CONTRACT,
  RECORDING_SPECS,
  safeRelativeEvidencePath,
  validateEvidenceManifest,
  validateExternalEvidenceIntent,
  validateHumanGates,
  validateRecordingReport,
} from "./phase7a-browser-contract.mjs";
import {
  MANIFEST_PATH as CAPTURE_MANIFEST_PATH,
  SCHEMA as CAPTURE_SCHEMA,
  SCREENSHOT_SPECS,
  TYPOGRAPHY_SPECIMEN_PATH,
} from "./capture-phase7a-review-evidence.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
export const PACKAGE_SCHEMA = "quantum-hub.phase-7a.signal-field-threshold-human-review.v1";
export const DETACHED_SCHEMA = `${PACKAGE_SCHEMA}.detached-manifest`;
export const AUDIT_SCHEMA = `${PACKAGE_SCHEMA}.independent-audit`;
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
export const MAX_FILE_BYTES = 128 * 1024 * 1024;
export const DETACHED_MANIFEST_NAME = REVIEW_ZIP_NAME.replace(/\.zip$/i, ".manifest.json");
export const INDEPENDENT_AUDIT_NAME = REVIEW_ZIP_NAME.replace(/\.zip$/i, ".audit.json");

const fixed = (relativePath, role) => Object.freeze({ relativePath, role });
const mapped = (sourcePath, relativePath, role) => Object.freeze({ sourcePath, relativePath, role });

export const REPORT_SOURCE_MAP = Object.freeze([
  mapped("00-assembly-index.json", "01-provenance/report-assembly-index.json", "report-assembly-index"),
  mapped("00-assembly-index.md", "01-provenance/report-assembly-index.md", "report-assembly-index"),
  mapped("01-accessibility.json", "11-accessibility/accessibility-report.json", "accessibility-report"),
  mapped("01-accessibility.md", "11-accessibility/accessibility-report.md", "accessibility-report"),
  mapped("02-responsive.json", "13-responsive/responsive-report.json", "responsive-report"),
  mapped("02-responsive.md", "13-responsive/responsive-report.md", "responsive-report"),
  mapped("03-reduced-motion.json", "12-fallback/reduced-motion-report.json", "reduced-motion-report"),
  mapped("03-reduced-motion.md", "12-fallback/reduced-motion-report.md", "reduced-motion-report"),
  mapped("04-no-js.json", "12-fallback/no-js-report.json", "no-js-report"),
  mapped("04-no-js.md", "12-fallback/no-js-report.md", "no-js-report"),
  mapped("05-fallback-fonts.json", "12-fallback/fallback-font-report.json", "fallback-font-report"),
  mapped("05-fallback-fonts.md", "12-fallback/fallback-font-report.md", "fallback-font-report"),
  mapped("06-performance-lifecycle.json", "16-performance/performance-and-lifecycle-report.json", "performance-and-lifecycle-report"),
  mapped("06-performance-lifecycle.md", "16-performance/performance-and-lifecycle-report.md", "performance-and-lifecycle-report"),
  mapped("07-network.json", "17-network/network-report.json", "network-report"),
  mapped("07-network.md", "17-network/network-report.md", "network-report"),
  mapped("08-publication.json", "18-publication/publication-scan.json", "publication-scan"),
  mapped("08-publication.md", "18-publication/publication-scan.md", "publication-scan"),
  mapped("09-physical-hashes.json", "09-hashes/phase-4-hash-verification.json", "phase-4-hash-verification"),
  mapped("09-physical-hashes.md", "09-hashes/phase-4-hash-verification.md", "phase-4-hash-verification"),
  mapped("10-environmental-limitations.json", "22-limitations/environmental-limitations.json", "environmental-limitations"),
  mapped("10-environmental-limitations.md", "22-limitations/environmental-limitations.md", "environmental-limitations"),
  mapped("11-git-provenance-deletions-tracked-deltas.json", "01-provenance/git-provenance-deletions-and-deltas-report.json", "git-provenance-combined-report"),
  mapped("11-git-provenance-deletions-tracked-deltas.md", "01-provenance/git-provenance-deletions-and-deltas-report.md", "git-provenance-combined-report"),
  mapped("12-deployment-provenance.json", "19-deployment/deployment-provenance-report.json", "deployment-provenance-report"),
  mapped("12-deployment-provenance.md", "19-deployment/deployment-provenance-report.md", "deployment-provenance-report"),
  mapped("13-human-gates.json", "00-brief/human-review-gates.json", "human-review-gates"),
  mapped("13-human-gates.md", "00-brief/human-review-gates.md", "human-review-gates"),
  mapped("assembly-manifest.json", "01-provenance/report-assembly-manifest.json", "report-assembly-manifest"),
]);

const MATERIAL_EVIDENCE = Object.freeze([
  fixed("00-brief/authoritative-task-brief.md", "authoritative-task-brief"),
  fixed("01-provenance/git-provenance.json", "git-provenance"),
  fixed("01-provenance/branch-and-ancestry.json", "branch-and-ancestry-report"),
  fixed("02-diff/production-source.diff", "production-source-diff"),
  fixed("03-maps/retention-demolition-map.md", "retention-demolition-map"),
  fixed("04-deletion-inventory/deleted-replaced-files.json", "deleted-replaced-file-inventory"),
  fixed("05-deltas/tracked-file-and-byte-delta.json", "tracked-file-and-byte-delta"),
  fixed("05-deltas/new-tracked-files-above-1-mib.json", "new-tracked-files-above-1-mib"),
  fixed("06-fonts/typography-study.md", "typography-study"),
  fixed("06-fonts/typography-specimen.html", "typography-specimen"),
  fixed("06-fonts/font-licences-and-hashes.json", "font-licences-and-hashes"),
  fixed("06-fonts/licences/OFL-Anybody.txt", "font-licence"),
  fixed("06-fonts/licences/OFL-Mona-Sans.txt", "font-licence"),
  fixed("06-fonts/licences/OFL-Bricolage-Grotesque.txt", "font-licence"),
  fixed("06-fonts/licences/OFL-Archivo.txt", "font-licence"),
  fixed("07-reference/reference-mechanics.md", "reference-mechanics-report"),
  fixed("08-architecture/architecture.md", "architecture-report"),
  fixed("10-tests/test-results.json", "test-results"),
  fixed("10-tests/test-and-fixture-disposition.md", "test-and-fixture-disposition"),
  fixed("14-zoom-200/installed-chrome-200-percent-report.json", "genuine-200-percent-status"),
  fixed("14-zoom-200/manifest.json", "genuine-200-percent-manifest"),
  fixed("15-browser/chromium-report.json", "chromium-browser-evidence"),
  fixed("15-browser/firefox-report.json", "firefox-browser-evidence"),
  fixed("15-browser/webkit-proxy-report.json", "webkit-proxy-evidence"),
  fixed("19-deployment/deployment-authority.json", "deployment-authority"),
  fixed("21-recordings/capture-evidence-manifest.json", "capture-evidence-manifest"),
]);

export const FIXED_EVIDENCE = Object.freeze([
  ...REPORT_SOURCE_MAP.map(({ relativePath, role }) => fixed(relativePath, role)),
  ...MATERIAL_EVIDENCE,
]);

export const SCREENSHOT_PREFIX = "20-screenshots/";
export const RECORDING_PREFIX = "21-recordings/";
export const RECORDING_PACKAGE_PATHS = Object.freeze(RECORDING_SPECS.map((spec) => (
  `${RECORDING_PREFIX}${spec.relativePath.replace(/^recordings\//, "")}`
)));

export const CAPTURE_SOURCE_MAP = Object.freeze([
  ...RECORDING_SPECS.map((spec) => mapped(spec.relativePath, `${RECORDING_PREFIX}${spec.relativePath.replace(/^recordings\//, "")}`, "recording")),
  ...SCREENSHOT_SPECS.map((spec) => mapped(spec.relativePath, `${SCREENSHOT_PREFIX}chromium/${spec.relativePath.replace(/^screenshots\//, "")}`, "screenshot")),
  mapped(TYPOGRAPHY_SPECIMEN_PATH, "06-fonts/typography-specimen.html", "typography-specimen"),
  mapped(CAPTURE_MANIFEST_PATH, "21-recordings/capture-evidence-manifest.json", "capture-evidence-manifest"),
]);

function zoomScreenshotSourcePath(route) {
  const filename = route === "/"
    ? "home-top.png"
    : `${route.replaceAll("/", "-").replace(/^-|-$/g, "")}-top.png`;
  return `screenshots/${filename}`;
}

const ZOOM_ROUTES = Object.freeze([...PUBLIC_ROUTES.map(({ route }) => route), REAL_404_PATH]);
export const ZOOM_SOURCE_MAP = Object.freeze([
  mapped("installed-chrome-200-percent-report.json", "14-zoom-200/installed-chrome-200-percent-report.json", "genuine-200-percent-status"),
  mapped("manifest.json", "14-zoom-200/manifest.json", "genuine-200-percent-manifest"),
  ...ZOOM_ROUTES.map((route) => mapped(zoomScreenshotSourcePath(route), `${SCREENSHOT_PREFIX}installed-chrome-200/${zoomScreenshotSourcePath(route).replace(/^screenshots\//, "")}`, "screenshot")),
  mapped("screenshots/home-field-map-open.png", `${SCREENSHOT_PREFIX}installed-chrome-200/home-field-map-open.png`, "screenshot"),
]);

export const SCREENSHOT_PACKAGE_PATHS = Object.freeze([
  ...CAPTURE_SOURCE_MAP.filter(({ role }) => role === "screenshot").map(({ relativePath }) => relativePath),
  ...ZOOM_SOURCE_MAP.filter(({ role }) => role === "screenshot").map(({ relativePath }) => relativePath),
].sort(lexicalCompare));

const FIXED_ROLE_BY_PATH = new Map(FIXED_EVIDENCE.map(({ relativePath, role }) => [relativePath, role]));
const RECORDING_PATH_SET = new Set(RECORDING_PACKAGE_PATHS);
const SCREENSHOT_PATH_SET = new Set(SCREENSHOT_PACKAGE_PATHS);
const SCREENSHOT_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".diff", ".html"]);
const DOCUMENT_EXTENSIONS = new Set(TEXT_EXTENSIONS);
const FORBIDDEN_PATH = /(?:^|\/)(?:src|source|scripts?|node_modules|\.git|\.astro|\.cache|caches?|browser[-_ ]?cache|raw(?:[-_ ]?(?:media|frames?|traces?))?|frames?|traces?|heap[-_ ]?dumps?|profiles?|private|secrets?|credentials?|temp|tmp|__pycache__)(?:\/|$)|(?:^|\/)\.(?:env|ds_store)(?:\.|$)|\.(?:zip|7z|rar|tar|tgz|gz|bz2|xz|blend\d*|exr|tiff?|mov|mkv|avi|webm|heapsnapshot|trace|pem|key|p12|pfx|woff2?|ttf|otf)$/i;
const PRIVATE_OR_SECRET_TEXT = /(?:(?:^|[\s"'=:(`\[])[a-z]:[\\/]|(?:^|[\s"'=:(`\[])\/(?:users|home|tmp|private|var\/folders)\/[^/\s]+(?:\/|\b)|(?:^|[^a-z])onedrive(?:[^a-z]|$)|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;
const RAW_PHASE4_HASHES = new Set(PHYSICAL_ASSETS
  .filter(([assetPath]) => /public\/media\/cinematic\/phase-4r2\/(?:media|posters)\//.test(assetPath))
  .map(([_assetPath, hash]) => hash));

const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_unused, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
}));

function lexicalCompare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
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

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function crc32Hex(bytes) {
  return crc32(bytes).toString(16).padStart(8, "0");
}

export function safePackagePath(value, label = "evidence path") {
  safeRelativeEvidencePath(value, label);
  invariant(!value.includes("\0") && !value.split("/").some((part) => !part || part === "." || part === ".."), `${label} is unsafe`);
  return value;
}

export function roleForEvidencePath(relativePath) {
  safePackagePath(relativePath);
  if (FIXED_ROLE_BY_PATH.has(relativePath)) return FIXED_ROLE_BY_PATH.get(relativePath);
  if (RECORDING_PATH_SET.has(relativePath)) return "recording";
  if (SCREENSHOT_PATH_SET.has(relativePath)) return "screenshot";
  throw new Error(`entry is outside the closed Phase 7A review topology: ${relativePath}`);
}

export function assertAllowedEvidencePath(relativePath) {
  safePackagePath(relativePath);
  invariant(relativePath !== IN_ARCHIVE_MANIFEST, `${IN_ARCHIVE_MANIFEST} is reserved for the generated embedded manifest`);
  invariant(!FORBIDDEN_PATH.test(relativePath), `forbidden source/cache/raw/archive/private payload: ${relativePath}`);
  roleForEvidencePath(relativePath);
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
  invariant(!PRIVATE_OR_SECRET_TEXT.test(relativePath), `privacy/credentials scan failed in path: ${relativePath}`);
  const data = Buffer.from(bytes);
  const extension = path.posix.extname(relativePath).toLowerCase();
  const isText = relativePath === IN_ARCHIVE_MANIFEST || TEXT_EXTENSIONS.has(extension);
  const text = isText ? data.toString("utf8") : (data.toString("latin1").match(/[\x20-\x7e]{24,}/g) ?? []).join("\n");
  invariant(!PRIVATE_OR_SECRET_TEXT.test(text), `privacy/credentials scan failed in payload: ${relativePath}`);
  if (extension === ".json" || relativePath === IN_ARCHIVE_MANIFEST) {
    let document;
    try { document = JSON.parse(text); } catch { throw new Error(`invalid JSON payload: ${relativePath}`); }
    invariant(!PRIVATE_OR_SECRET_TEXT.test(semanticJsonText(document)), `privacy/credentials semantic scan failed: ${relativePath}`);
  } else if (isText) invariant(!text.includes("\0"), `text payload contains NUL bytes: ${relativePath}`);
  return true;
}

function parseJson(bytes, relativePath) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error(`invalid JSON payload: ${relativePath}`); }
}

function assertScreenshot(bytes, relativePath) {
  const data = Buffer.from(bytes);
  const extension = path.posix.extname(relativePath).toLowerCase();
  let valid = false;
  if (extension === ".png") valid = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  else if ([".jpg", ".jpeg"].includes(extension)) valid = data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data.at(-2) === 0xff && data.at(-1) === 0xd9;
  else if (extension === ".webp") valid = data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  else if (extension === ".avif") valid = data.length >= 12 && data.toString("ascii", 4, 8) === "ftyp" && /avif|avis/.test(data.toString("ascii", 8, 32));
  invariant(valid, `screenshot media signature differs: ${relativePath}`);
}

export function validateIsoBmffRecording(bytes, relativePath = "recording") {
  const data = Buffer.from(bytes);
  invariant(data.length >= 24, `recording is too small: ${relativePath}`);
  const boxTypes = [];
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
    boxTypes.push(type);
    cursor += size;
  }
  invariant(cursor === data.length && boxTypes[0] === "ftyp" && boxTypes.includes("moov") && boxTypes.includes("mdat"), `recording is not a complete ISO-BMFF review artifact: ${relativePath}`);
  return Object.freeze({ container: "mp4", boxTypes: Object.freeze(boxTypes) });
}

function metadataFor(entry) {
  const data = Buffer.from(entry.data);
  const extension = path.posix.extname(entry.relativePath).toLowerCase();
  return Object.freeze({
    relativePath: entry.relativePath,
    role: entry.role,
    category: entry.relativePath.split("/", 1)[0],
    kind: entry.role === "recording" ? "video" : entry.role === "screenshot" ? "image" : DOCUMENT_EXTENSIONS.has(extension) ? "document" : "binary",
    bytes: data.length,
    sha256: sha256(data),
    crc32: crc32Hex(data),
  });
}

function authorityRows(document, relativePath) {
  const rows = document?.assets ?? document?.files ?? document?.entries ?? document?.summary?.assets;
  invariant(Array.isArray(rows), `${relativePath} must contain an assets/files/entries array`);
  return rows.map((row) => ({
    relativePath: row?.relativePath ?? row?.path,
    sha256: row?.sha256 ?? row?.actualSha256,
  }));
}

function validateExactHashAuthority(bytes, relativePath, authority) {
  const document = parseJson(bytes, relativePath);
  invariant(document?.status === "PASS", `${relativePath} must record PASS for exact hash authority`);
  const expected = new Map(authority.map(([assetPath, hash]) => [assetPath, hash]));
  const observed = new Map();
  for (const row of authorityRows(document, relativePath)) {
    invariant(typeof row.relativePath === "string" && /^[0-9a-f]{64}$/.test(row.sha256 ?? ""), `${relativePath} contains an invalid hash row`);
    invariant(!observed.has(row.relativePath), `${relativePath} contains a duplicate hash row: ${row.relativePath}`);
    observed.set(row.relativePath, row.sha256);
  }
  invariant(observed.size === expected.size, `${relativePath} hash inventory count differs`);
  for (const [assetPath, hash] of expected) invariant(observed.get(assetPath) === hash, `${relativePath} authority mismatch: ${assetPath}`);
}

function validateFontLicences(entriesByPath) {
  const authorities = new Map(TYPOGRAPHY_ASSETS
    .filter(([assetPath]) => /(?:^|\/)OFL-[^/]+\.txt$/i.test(assetPath))
    .map(([assetPath, bytes, hash]) => [path.posix.basename(assetPath), { bytes, hash }]));
  invariant(authorities.size === 4, "Phase 7A font licence authority differs");
  for (const [basename, authority] of authorities) {
    const relativePath = `06-fonts/licences/${basename}`;
    const entry = entriesByPath.get(relativePath);
    invariant(entry, `missing exact font licence: ${relativePath}`);
    invariant(entry.data.length === authority.bytes && sha256(entry.data) === authority.hash, `font licence bytes differ: ${relativePath}`);
  }
}

function validateProducerRecordingManifest(report) {
  validateRecordingReport({
    ...report,
    failures: Object.hasOwn(report, "failures") ? report.failures : [],
  });
}

function validateRecordingInventory(entriesByPath) {
  const relativePath = "21-recordings/capture-evidence-manifest.json";
  const report = parseJson(entriesByPath.get(relativePath).data, relativePath);
  invariant(report.schema === CAPTURE_SCHEMA && report.status === "PASS", "capture evidence manifest authority differs");
  validateHumanGates(report.humanGates);
  validateProducerRecordingManifest(report);
  const records = new Map(report.recordings.map((record) => [record.relativePath, record]));
  const ledger = new Map((report.files ?? []).map((record) => [record.relativePath, record]));
  invariant(ledger.size === CAPTURE_SOURCE_MAP.length - 1, "capture evidence manifest file count differs");
  for (const mapping of CAPTURE_SOURCE_MAP.filter(({ sourcePath }) => sourcePath !== CAPTURE_MANIFEST_PATH)) {
    const entry = entriesByPath.get(mapping.relativePath);
    const record = ledger.get(mapping.sourcePath);
    invariant(entry && record && record.bytes === entry.data.length && record.sha256 === sha256(entry.data), `capture evidence binding differs: ${mapping.sourcePath}`);
  }
  for (const spec of RECORDING_SPECS) {
    const entry = entriesByPath.get(`${RECORDING_PREFIX}${spec.relativePath.replace(/^recordings\//, "")}`);
    const record = records.get(spec.relativePath);
    invariant(entry && record, `recording binding is missing: ${spec.relativePath}`);
  }
}

export function normalizeEvidenceEntries(input) {
  invariant(Array.isArray(input), "evidence entries must be an array");
  const normalized = input.map((entry) => {
    invariant(entry && typeof entry.relativePath === "string", "evidence entry path is required");
    assertAllowedEvidencePath(entry.relativePath);
    const data = Buffer.from(entry.data ?? []);
    invariant(data.length > 0, `empty evidence payload is not allowed: ${entry.relativePath}`);
    invariant(data.length <= MAX_FILE_BYTES, `evidence payload exceeds the per-file limit: ${entry.relativePath}`);
    assertNoPrivateText(data, entry.relativePath);
    const role = roleForEvidencePath(entry.relativePath);
    invariant(!RAW_PHASE4_HASHES.has(sha256(data)), `raw Phase 4 media is forbidden: ${entry.relativePath}`);
    if (role === "recording") validateIsoBmffRecording(data, entry.relativePath);
    if (role === "screenshot") assertScreenshot(data, entry.relativePath);
    return { relativePath: entry.relativePath, role, data };
  }).sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));

  const entriesByPath = new Map();
  for (const entry of normalized) {
    invariant(!entriesByPath.has(entry.relativePath), `duplicate evidence path: ${entry.relativePath}`);
    entriesByPath.set(entry.relativePath, entry);
  }
  for (const { relativePath } of FIXED_EVIDENCE) invariant(entriesByPath.has(relativePath), `Phase 7A review evidence omits ${relativePath}`);
  for (const relativePath of RECORDING_PACKAGE_PATHS) invariant(entriesByPath.has(relativePath), `Phase 7A review evidence omits ${relativePath}`);
  for (const relativePath of SCREENSHOT_PACKAGE_PATHS) invariant(entriesByPath.has(relativePath), `Phase 7A review evidence omits ${relativePath}`);
  invariant(normalized.length === FIXED_EVIDENCE.length + RECORDING_PACKAGE_PATHS.length + SCREENSHOT_PACKAGE_PATHS.length, "Phase 7A review topology contains unexpected entries");

  validateFontLicences(entriesByPath);
  validateExactHashAuthority(entriesByPath.get("09-hashes/phase-4-hash-verification.json").data, "09-hashes/phase-4-hash-verification.json", PHYSICAL_ASSETS);
  validateExactHashAuthority(entriesByPath.get("06-fonts/font-licences-and-hashes.json").data, "06-fonts/font-licences-and-hashes.json", TYPOGRAPHY_ASSETS.map(([assetPath, _bytes, hash]) => [assetPath, hash]));
  validateRecordingInventory(entriesByPath);
  return normalized;
}

export function createStoredZipBuffer(entries) {
  const normalized = entries.map((entry) => ({
    relativePath: safePackagePath(entry.relativePath, "ZIP entry"),
    data: Buffer.from(entry.data),
  })).sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
  invariant(new Set(normalized.map(({ relativePath }) => relativePath)).size === normalized.length, "ZIP entries must be unique");
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const dosDate = (1 << 5) | 1;
  for (const entry of normalized) {
    const name = Buffer.from(entry.relativePath, "utf8");
    const checksum = crc32(entry.data);
    invariant(name.length <= 0xffff && entry.data.length <= 0xffffffff, `ZIP32 entry limit exceeded: ${entry.relativePath}`);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(dosDate, 12);
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
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(dosDate, 14);
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
  invariant(normalized.length <= 0xffff && offset <= 0xffffffff, "ZIP32 archive limits exceeded");
  const centralDirectory = Buffer.concat(centralParts);
  invariant(centralDirectory.length <= 0xffffffff, "ZIP32 central directory limit exceeded");
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

function expectedAuthority() {
  return Object.freeze({
    branch: PHASE7A_BRANCH,
    acceptedParent: PHASE7A_PARENT,
    frozenMain: FROZEN_MAIN,
    physicalAssets: PHYSICAL_ASSETS.map(([relativePath, hash]) => ({ relativePath, sha256: hash })),
    recordingScenarios: [...RECORDING_SCENARIOS],
    reviewZipName: REVIEW_ZIP_NAME,
  });
}

function exclusions() {
  return Object.freeze([
    "repository source archive",
    "node_modules and caches",
    "raw traces, heap dumps, and frame sequences",
    "raw Phase 4 media",
    "Blender and EXR files",
    "private paths and credentials",
    "nested archives",
    "font binaries and unlicensed fonts",
  ]);
}

function makePackageManifest(files) {
  validateHumanGates(HUMAN_GATE_RECORDS);
  validateEvidenceManifest(files);
  const sectionCounts = {};
  for (const file of files) sectionCounts[file.category] = (sectionCounts[file.category] ?? 0) + 1;
  return {
    schema: PACKAGE_SCHEMA,
    archiveFilename: REVIEW_ZIP_NAME,
    deterministicEncoding: "canonical ZIP32 stored UTF-8; lexical entry order; DOS 1980-01-01 00:00:00",
    authority: expectedAuthority(),
    requiredEvidence: {
      fixed: FIXED_EVIDENCE,
      recordings: RECORDING_PACKAGE_PATHS,
      screenshots: SCREENSHOT_PACKAGE_PATHS,
    },
    evidence: {
      entries: files,
      entryCount: files.length,
      contentBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      sectionCounts,
    },
    humanReviewGates: HUMAN_GATE_RECORDS,
    gateAuthority: PHASE7A_GATES,
    exclusions: exclusions(),
  };
}

export function buildPackageArtifacts(inputEntries) {
  const entries = normalizeEvidenceEntries(inputEntries);
  const files = entries.map(metadataFor);
  const packageManifest = makePackageManifest(files);
  const manifestBytes = Buffer.from(stableJson(packageManifest));
  assertNoPrivateText(manifestBytes, IN_ARCHIVE_MANIFEST);
  const archiveEntries = [...entries.map(({ relativePath, data }) => ({ relativePath, data })), { relativePath: IN_ARCHIVE_MANIFEST, data: manifestBytes }];
  const archiveBytes = createStoredZipBuffer(archiveEntries);
  invariant(archiveBytes.length <= MAX_ARCHIVE_BYTES, `review ZIP exceeds ${MAX_ARCHIVE_BYTES} bytes`);
  const allEntries = archiveEntries
    .sort((left, right) => lexicalCompare(left.relativePath, right.relativePath))
    .map((entry) => ({
      relativePath: entry.relativePath,
      bytes: entry.data.length,
      sha256: sha256(entry.data),
      crc32: crc32Hex(entry.data),
    }));
  const detachedManifest = {
    schema: DETACHED_SCHEMA,
    archive: {
      filename: REVIEW_ZIP_NAME,
      bytes: archiveBytes.length,
      sha256: sha256(archiveBytes),
      entryCount: allEntries.length,
      crc32Verification: "REQUIRED",
    },
    embeddedManifest: {
      relativePath: IN_ARCHIVE_MANIFEST,
      bytes: manifestBytes.length,
      sha256: sha256(manifestBytes),
    },
    entries: allEntries,
  };
  const detachedBytes = Buffer.from(stableJson(detachedManifest));
  assertNoPrivateText(detachedBytes, "detached-manifest.json");
  return Object.freeze({ entries, files, packageManifest, manifestBytes, archiveBytes, detachedManifest, detachedBytes });
}

export function assertExternalPath(candidate, label = "path", {
  repositoryRoot = ROOT,
  temporaryRoot = os.tmpdir(),
} = {}) {
  invariant(typeof candidate === "string" && path.isAbsolute(candidate), `${label} must be an explicit absolute path`);
  const resolved = path.resolve(candidate);
  invariant(resolved !== path.parse(resolved).root, `${label} cannot be a filesystem root`);
  invariant(!isWithin(repositoryRoot, resolved), `${label} must remain outside the repository`);
  invariant(!isWithin(temporaryRoot, resolved), `${label} must remain outside OS temporary storage`);
  invariant(!/(?:^|[\\/_.-])phase[-_]?6(?:[\\/_.-]|$)|__phase6/i.test(resolved), `${label} uses a stale Phase 6 path`);
  return resolved;
}

async function canonicalExternalDirectory(candidate, label) {
  const requested = assertExternalPath(candidate, label);
  const info = await lstat(requested);
  invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} must be a real directory`);
  const resolved = await realpath(requested);
  assertExternalPath(resolved, label);
  return resolved;
}

async function canonicalExternalFile(candidate, label) {
  const requested = assertExternalPath(candidate, label);
  const info = await lstat(requested);
  invariant(info.isFile() && !info.isSymbolicLink(), `${label} must be a real file`);
  const resolved = await realpath(requested);
  assertExternalPath(resolved, label);
  return resolved;
}

async function canonicalFutureOutput(candidate) {
  const requested = assertExternalPath(candidate, "--output");
  invariant(path.basename(requested) === REVIEW_ZIP_NAME, `--output basename must be exactly ${REVIEW_ZIP_NAME}`);
  validateExternalEvidenceIntent({ output: requested, exists: false, overwrite: false, gitTracked: false }, { repositoryRoot: ROOT, temporaryRoot: os.tmpdir() });
  await mkdir(path.dirname(requested), { recursive: true });
  const parent = await realpath(path.dirname(requested));
  const resolved = path.join(parent, path.basename(requested));
  assertExternalPath(resolved, "--output");
  return resolved;
}

async function recursiveFiles(root, prefix = "") {
  const output = [];
  const children = await readdir(root, { withFileTypes: true });
  for (const child of children) {
    const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
    const absolute = path.join(root, child.name);
    invariant(!child.isSymbolicLink(), `evidence cannot contain symlinks: ${relativePath}`);
    if (child.isDirectory()) output.push(...await recursiveFiles(absolute, relativePath));
    else if (child.isFile()) output.push(relativePath);
    else throw new Error(`unsupported evidence filesystem entry: ${relativePath}`);
  }
  return output.sort(lexicalCompare);
}

async function readDirectoryMap(root, expected, label) {
  const actual = await recursiveFiles(root);
  const expectedPaths = [...expected].sort(lexicalCompare);
  invariant(actual.length === expectedPaths.length, `${label} file count differs: expected ${expectedPaths.length}, observed ${actual.length}`);
  for (let index = 0; index < expectedPaths.length; index += 1) invariant(actual[index] === expectedPaths[index], `${label} inventory differs: expected ${expectedPaths[index] ?? "<none>"}, observed ${actual[index] ?? "<none>"}`);
  const files = new Map();
  for (const relativePath of actual) {
    const absolute = path.join(root, ...relativePath.split("/"));
    const info = await lstat(absolute);
    invariant(info.isFile() && !info.isSymbolicLink(), `${label} changed during collection: ${relativePath}`);
    const data = await readFile(absolute);
    invariant(data.length > 0 && data.length <= MAX_FILE_BYTES, `${label} size boundary failed: ${relativePath}`);
    assertNoPrivateText(data, relativePath);
    files.set(relativePath, data);
  }
  return files;
}

function exactMapInventory(files, mappings, label) {
  invariant(files instanceof Map, `${label} must be a file map`);
  const expected = mappings.map(({ sourcePath }) => sourcePath).sort(lexicalCompare);
  const actual = [...files.keys()].sort(lexicalCompare);
  invariant(new Set(expected).size === expected.length, `${label} authority contains duplicate source paths`);
  invariant(actual.length === expected.length, `${label} file count differs`);
  for (let index = 0; index < expected.length; index += 1) invariant(actual[index] === expected[index], `${label} inventory differs: ${actual[index] ?? "<missing>"}`);
}

function reportHumanGates(value, label) {
  const expected = Object.fromEntries(PHASE7A_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"]));
  invariant(sameJson(value, expected), `${label} human gates differ`);
}

function validateReportBundle(files, deploymentBytes, { allowMissingDeployment = false } = {}) {
  exactMapInventory(files, REPORT_SOURCE_MAP, "report-assembler output");
  const manifest = parseJson(files.get("assembly-manifest.json"), "assembly-manifest.json");
  invariant(manifest.schema === "quantum-hub.phase-7a.report-assembly.v1.manifest" && manifest.deterministic === true && manifest.generatedAt === null, "report-assembler manifest authority differs");
  reportHumanGates(manifest.humanGates, "report-assembler manifest");
  const expectedLedger = REPORT_SOURCE_MAP.filter(({ sourcePath }) => sourcePath !== "assembly-manifest.json")
    .map(({ sourcePath }) => ({ filename: sourcePath, bytes: files.get(sourcePath).length, sha256: sha256(files.get(sourcePath)) }))
    .sort((left, right) => lexicalCompare(left.filename, right.filename));
  invariant(manifest.fileCountExcludingManifest === expectedLedger.length && sameJson(manifest.files, expectedLedger), "report-assembler manifest ledger differs");

  const index = parseJson(files.get("00-assembly-index.json"), "00-assembly-index.json");
  invariant(index.schema === "quantum-hub.phase-7a.report-assembly.v1" && Array.isArray(index.reports) && index.reports.length === 13, "report-assembler index authority differs");
  reportHumanGates(index.humanGates, "report-assembler index");
  const gates = parseJson(files.get("13-human-gates.json"), "13-human-gates.json");
  invariant(gates.status === "PENDING HUMAN REVIEW" && Array.isArray(gates.summary?.gates) && gates.summary.gates.length === PHASE7A_GATES.length, "report-assembler human gate report differs");
  invariant(gates.summary.gates.every((gate) => gate.status === "PENDING HUMAN REVIEW"), "report-assembler promoted a human gate");

  const deploymentReport = parseJson(files.get("12-deployment-provenance.json"), "12-deployment-provenance.json");
  if (deploymentBytes) {
    invariant(deploymentReport.summary?.supplied === true, "deployment JSON was supplied to packaging but is absent from the report bundle");
    invariant((deploymentReport.sources ?? []).some((source) => source.sha256 === sha256(deploymentBytes) && source.bytes === deploymentBytes.length), "deployment report does not bind the explicit deployment JSON");
  } else {
    invariant(allowMissingDeployment, "final Phase 7A packaging requires --deployment-json");
    invariant(deploymentReport.summary?.supplied === false && deploymentReport.status === "NOT AVAILABLE TO EXECUTION ENVIRONMENT", "self-test missing deployment must remain honestly unavailable");
  }
  return Object.freeze({
    index,
    gates,
    git: parseJson(files.get("11-git-provenance-deletions-tracked-deltas.json"), "11-git-provenance-deletions-tracked-deltas.json"),
    physical: parseJson(files.get("09-physical-hashes.json"), "09-physical-hashes.json"),
    publication: parseJson(files.get("08-publication.json"), "08-publication.json"),
    deployment: deploymentReport,
    reports: new Map(REPORT_SOURCE_MAP.filter(({ sourcePath }) => sourcePath.endsWith(".json") && /^\d{2}-/.test(sourcePath)).map(({ sourcePath }) => [sourcePath, parseJson(files.get(sourcePath), sourcePath)])),
  });
}

function validateCaptureBundle(files) {
  exactMapInventory(files, CAPTURE_SOURCE_MAP, "capture-runner output");
  const manifest = parseJson(files.get(CAPTURE_MANIFEST_PATH), CAPTURE_MANIFEST_PATH);
  invariant(manifest.schema === CAPTURE_SCHEMA && manifest.status === "PASS", "capture-runner manifest authority differs");
  validateHumanGates(manifest.humanGates);
  validateProducerRecordingManifest(manifest);
  const expectedLedger = CAPTURE_SOURCE_MAP.filter(({ sourcePath }) => sourcePath !== CAPTURE_MANIFEST_PATH)
    .map(({ sourcePath }) => ({ bytes: files.get(sourcePath).length, relativePath: sourcePath, sha256: sha256(files.get(sourcePath)) }))
    .sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
  invariant(sameJson(manifest.files, expectedLedger), "capture-runner manifest ledger differs");
  invariant(manifest.summary?.recordings === RECORDING_SPECS.length && manifest.summary?.screenshots === SCREENSHOT_SPECS.length, "capture-runner summary count differs");
  return manifest;
}

function validateZoomBundle(files) {
  exactMapInventory(files, ZOOM_SOURCE_MAP, "installed-Chrome zoom output");
  const reportPath = "installed-chrome-200-percent-report.json";
  const report = parseJson(files.get(reportPath), reportPath);
  invariant(report.schema === "quantum-hub.phase-7a.installed-chrome-native-zoom.v1", "installed-Chrome zoom schema differs");
  invariant(report.classification === "GENUINE INSTALLED GOOGLE CHROME BROWSER ZOOM", "installed-Chrome zoom classification differs");
  invariant(report.forbiddenSubstitutes?.viewportResize === false && report.forbiddenSubstitutes?.cssZoom === false && report.forbiddenSubstitutes?.transformScale === false && report.forbiddenSubstitutes?.deviceEmulation === false, "installed-Chrome zoom uses a forbidden proxy");
  invariant(Array.isArray(report.routes) && report.routes.length === ZOOM_ROUTES.length, "installed-Chrome zoom route count differs");
  const manifest = parseJson(files.get("manifest.json"), "installed-Chrome manifest.json");
  invariant(manifest.schema === "quantum-hub.phase-7a.installed-chrome-native-zoom.v1.artifacts.v1", "installed-Chrome manifest schema differs");
  invariant(manifest.report?.path === reportPath && manifest.report.bytes === files.get(reportPath).length && manifest.report.sha256 === sha256(files.get(reportPath)), "installed-Chrome report binding differs");
  const expectedEntries = ZOOM_SOURCE_MAP.filter(({ role }) => role === "screenshot")
    .map(({ sourcePath }) => ({ path: sourcePath, bytes: files.get(sourcePath).length, sha256: sha256(files.get(sourcePath)) }))
    .sort((left, right) => lexicalCompare(left.path, right.path));
  invariant(sameJson(manifest.entries, expectedEntries), "installed-Chrome screenshot manifest differs");
  return report;
}

function aggregateStatus(values) {
  const statuses = values.map((value) => String(value ?? "NOT OBSERVED").toUpperCase());
  for (const status of ["FAIL", "LIMITATION", "NOT AVAILABLE TO EXECUTION ENVIRONMENT", "NOT OBSERVED", "PENDING HUMAN REVIEW"]) if (statuses.includes(status)) return status;
  return statuses.every((status) => status === "PASS") ? "PASS" : "NOT OBSERVED";
}

function browserDossier(engine, reportState, captureManifest) {
  const reportNames = ["01-accessibility.json", "02-responsive.json", "03-reduced-motion.json", "04-no-js.json", "05-fallback-fonts.json", "06-performance-lifecycle.json", "07-network.json", "08-publication.json"];
  const reports = reportNames.map((sourcePath) => {
    const document = reportState.reports.get(sourcePath);
    return { sourcePath, status: document.status, statement: document.statement, summary: document.summary };
  });
  const browser = (captureManifest.browsers ?? []).find((candidate) => candidate.engine === engine) ?? null;
  return {
    schema: `${PACKAGE_SCHEMA}.browser-dossier.v1`,
    engine,
    evidenceClass: engine === "webkit" ? "WEBKIT PROXY" : "BROWSER ENGINE",
    status: aggregateStatus(reports.map(({ status }) => status)),
    statement: engine === "webkit"
      ? "WebKit automation is compatibility-proxy evidence and is not physical Safari approval."
      : "This dossier preserves report-assembler observations and capture-runner browser identity without promoting human evidence.",
    captureBrowser: browser,
    reports,
  };
}

function reportMappedEntries(files) {
  return REPORT_SOURCE_MAP.map(({ sourcePath, relativePath }) => ({ relativePath, data: Buffer.from(files.get(sourcePath)) }));
}

function captureMappedEntries(files) {
  return CAPTURE_SOURCE_MAP.map(({ sourcePath, relativePath }) => ({ relativePath, data: Buffer.from(files.get(sourcePath)) }));
}

function zoomMappedEntries(files) {
  return ZOOM_SOURCE_MAP.map(({ sourcePath, relativePath }) => ({ relativePath, data: Buffer.from(files.get(sourcePath)) }));
}

export function normalizeProducerInputs({
  reportFiles,
  captureFiles,
  zoomFiles,
  authoritativeBriefBytes,
  deploymentBytes,
  repositoryFiles,
  gitSnapshot,
  allowMissingDeployment = false,
}) {
  invariant(Buffer.from(authoritativeBriefBytes ?? []).length > 0, "authoritative task brief is empty");
  invariant(repositoryFiles instanceof Map, "repository material map is required");
  invariant(gitSnapshot && typeof gitSnapshot === "object", "Git snapshot is required");
  const reports = validateReportBundle(reportFiles, deploymentBytes, { allowMissingDeployment });
  const capture = validateCaptureBundle(captureFiles);
  validateZoomBundle(zoomFiles);
  const git = reports.git.summary;
  invariant(git && git.head === gitSnapshot.head && git.expectedParent === PHASE7A_PARENT && git.expectedBranch === PHASE7A_BRANCH, "report/Git snapshot authority differs");
  invariant(Buffer.from(gitSnapshot.productionDiff ?? []).length > 0, "production-source diff is empty");

  const entries = [
    ...reportMappedEntries(reportFiles),
    ...captureMappedEntries(captureFiles),
    ...zoomMappedEntries(zoomFiles),
    { relativePath: "00-brief/authoritative-task-brief.md", data: Buffer.from(authoritativeBriefBytes) },
    { relativePath: "01-provenance/git-provenance.json", data: Buffer.from(stableJson({ schema: `${PACKAGE_SCHEMA}.git-provenance.v1`, status: reports.git.status, branch: git.branch, head: git.head, expectedBranch: git.expectedBranch, expectedParent: git.expectedParent, frozenMainExpected: git.frozenMainExpected, localMain: git.localMain, originMain: git.originMain, worktree: git.worktree, limitations: git.limitations, failures: git.failures })) },
    { relativePath: "01-provenance/branch-and-ancestry.json", data: Buffer.from(stableJson({ schema: `${PACKAGE_SCHEMA}.branch-ancestry.v1`, status: reports.git.status, branch: git.branch, head: git.head, expectedBranch: git.expectedBranch, expectedParent: git.expectedParent, parentIsAncestor: git.parentIsAncestor, mergeCommits: git.mergeCommits, frozenMainExpected: git.frozenMainExpected, localMain: git.localMain, originMain: git.originMain })) },
    { relativePath: "02-diff/production-source.diff", data: Buffer.from(gitSnapshot.productionDiff) },
    { relativePath: "04-deletion-inventory/deleted-replaced-files.json", data: Buffer.from(stableJson({ schema: `${PACKAGE_SCHEMA}.deletion-inventory.v1`, status: aggregateStatus((git.deletionInventory ?? []).map(({ status }) => status)), entries: git.deletionInventory ?? [] })) },
    { relativePath: "05-deltas/tracked-file-and-byte-delta.json", data: Buffer.from(stableJson({ schema: `${PACKAGE_SCHEMA}.tracked-delta.v1`, status: reports.git.status, trackedTrees: git.trackedTrees, trackedChanges: git.trackedChanges })) },
    { relativePath: "05-deltas/new-tracked-files-above-1-mib.json", data: Buffer.from(stableJson({ schema: `${PACKAGE_SCHEMA}.large-tracked-files.v1`, status: "PASS", thresholdBytes: 1024 * 1024, entries: gitSnapshot.newTrackedFilesAbove1MiB })) },
    { relativePath: "06-fonts/font-licences-and-hashes.json", data: Buffer.from(stableJson({ status: "PASS", assets: TYPOGRAPHY_ASSETS.map(([assetPath, bytes, hash]) => ({ relativePath: assetPath, bytes, sha256: hash })) })) },
    { relativePath: "10-tests/test-results.json", data: Buffer.from(stableJson({ schema: `${PACKAGE_SCHEMA}.test-results.v1`, status: reports.publication.status, statement: reports.publication.statement, sources: reports.publication.sources, summary: reports.publication.summary, observations: reports.publication.observations, limitations: reports.publication.limitations })) },
    { relativePath: "15-browser/chromium-report.json", data: Buffer.from(stableJson(browserDossier("chromium", reports, capture))) },
    { relativePath: "15-browser/firefox-report.json", data: Buffer.from(stableJson(browserDossier("firefox", reports, capture))) },
    { relativePath: "15-browser/webkit-proxy-report.json", data: Buffer.from(stableJson(browserDossier("webkit", reports, capture))) },
    { relativePath: "19-deployment/deployment-authority.json", data: deploymentBytes ? Buffer.from(deploymentBytes) : Buffer.from(stableJson({ schema: `${PACKAGE_SCHEMA}.deployment-unavailable.v1`, status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT", statement: "Self-test only: no deployment record was supplied and no deployment claim is made." })) },
  ];
  for (const [relativePath, data] of repositoryFiles) entries.push({ relativePath, data: Buffer.from(data) });
  return normalizeEvidenceEntries(entries);
}

async function collectRepositoryFiles() {
  const sources = new Map([
    ["03-maps/retention-demolition-map.md", "docs/phase-7a-retention-demolition-map.md"],
    ["06-fonts/typography-study.md", "docs/phase-7a-typography-study.md"],
    ["07-reference/reference-mechanics.md", "docs/phase-7a-reference-mechanics.md"],
    ["08-architecture/architecture.md", "docs/phase-7a-architecture.md"],
    ["10-tests/test-and-fixture-disposition.md", "docs/phase-7a-test-and-fixture-disposition.md"],
  ]);
  for (const [assetPath] of TYPOGRAPHY_ASSETS.filter(([assetPath]) => /(?:^|\/)OFL-[^/]+\.txt$/i.test(assetPath))) sources.set(`06-fonts/licences/${path.posix.basename(assetPath)}`, assetPath);
  const output = new Map();
  for (const [relativePath, sourcePath] of sources) {
    const absolute = path.join(ROOT, ...sourcePath.split("/"));
    const info = await lstat(absolute);
    invariant(info.isFile() && !info.isSymbolicLink(), `tracked review material is not a real file: ${sourcePath}`);
    output.set(relativePath, await readFile(absolute));
  }
  return output;
}

async function gitText(args, label) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 50_000_000 });
  invariant(typeof stdout === "string", `${label} returned no text`);
  return stdout;
}

function parseTreeSizes(text) {
  const output = new Map();
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^\d+\s+\w+\s+[0-9a-f]+\s+(-|\d+)\t(.+)$/);
    if (match) output.set(match[2], match[1] === "-" ? 0 : Number(match[1]));
  }
  return output;
}

async function collectGitSnapshot() {
  const head = (await gitText(["rev-parse", "HEAD"], "Git HEAD")).trim();
  const productionDiff = await gitText(["diff", "--no-ext-diff", "--no-color", "--no-renames", PHASE7A_PARENT, head, "--", "src", "public", "astro.config.mjs", "package.json", "package-lock.json"], "production-source diff");
  const sizes = parseTreeSizes(await gitText(["ls-tree", "-r", "-l", head], "Git tree inventory"));
  const changes = (await gitText(["diff", "--name-status", "--no-renames", PHASE7A_PARENT, head], "Git changed paths")).split(/\r?\n/).filter(Boolean);
  const added = changes.filter((line) => line.startsWith("A\t")).map((line) => line.slice(2));
  const newTrackedFilesAbove1MiB = added.filter((relativePath) => (sizes.get(relativePath) ?? 0) > 1024 * 1024)
    .map((relativePath) => ({ relativePath, bytes: sizes.get(relativePath) }))
    .sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
  return { head, productionDiff: Buffer.from(productionDiff), newTrackedFilesAbove1MiB };
}

function siblingOutputs(output) {
  return Object.freeze({
    archive: output,
    manifest: path.join(path.dirname(output), DETACHED_MANIFEST_NAME),
    audit: path.join(path.dirname(output), INDEPENDENT_AUDIT_NAME),
  });
}

async function assertFresh(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      throw new Error(`refusing to overwrite existing output: ${candidate}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function publishFresh(pairs) {
  await assertFresh(pairs.map(({ destination }) => destination));
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
}

async function runIndependentAuditor({ archive, manifest, audit }) {
  const auditor = path.join(ROOT, "scripts", "audit-phase7a-human-review-package.mjs");
  const { stdout } = await execFileAsync(process.execPath, [
    auditor,
    "--archive", archive,
    "--manifest", manifest,
    "--audit-output", audit,
  ], { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 5_000_000 });
  let result;
  try { result = JSON.parse(stdout); } catch { throw new Error("independent Phase 7A auditor returned invalid JSON"); }
  invariant(result?.schema === `${AUDIT_SCHEMA}.result` && result?.status === "PASS", "independent Phase 7A audit did not pass");
  return result;
}

export async function assemblePackage(input) {
  invariant(input && typeof input === "object", "package options are required");
  invariant(input.deploymentJson, "final Phase 7A packaging requires --deployment-json");
  const reportsDir = await canonicalExternalDirectory(input.reportsDir, "--reports-dir");
  const captureDir = await canonicalExternalDirectory(input.captureDir, "--capture-dir");
  const zoomDir = await canonicalExternalDirectory(input.zoomDir, "--installed-chrome-zoom");
  const authoritativeBrief = await canonicalExternalFile(input.authoritativeBrief, "--authoritative-brief");
  const deploymentJson = await canonicalExternalFile(input.deploymentJson, "--deployment-json");
  const output = await canonicalFutureOutput(input.output);
  const outputs = siblingOutputs(output);
  const sourceDirectories = [reportsDir, captureDir, zoomDir];
  invariant(new Set(sourceDirectories.map((candidate) => candidate.toLowerCase())).size === sourceDirectories.length, "producer directories must be distinct");
  for (const source of sourceDirectories) invariant(!isWithin(source, path.dirname(output)) && !isWithin(path.dirname(output), source), "producer and output directories must be separate");
  await assertFresh(Object.values(outputs));
  const reportFiles = await readDirectoryMap(reportsDir, REPORT_SOURCE_MAP.map(({ sourcePath }) => sourcePath), "report-assembler output");
  const captureFiles = await readDirectoryMap(captureDir, CAPTURE_SOURCE_MAP.map(({ sourcePath }) => sourcePath), "capture-runner output");
  const zoomFiles = await readDirectoryMap(zoomDir, ZOOM_SOURCE_MAP.map(({ sourcePath }) => sourcePath), "installed-Chrome zoom output");
  const canonicalEntries = normalizeProducerInputs({
    reportFiles,
    captureFiles,
    zoomFiles,
    authoritativeBriefBytes: await readFile(authoritativeBrief),
    deploymentBytes: await readFile(deploymentJson),
    repositoryFiles: await collectRepositoryFiles(),
    gitSnapshot: await collectGitSnapshot(),
  });
  const artifacts = buildPackageArtifacts(canonicalEntries);
  const staging = path.join(path.dirname(output), `.phase7a-review-${randomUUID()}`);
  invariant(isWithin(path.dirname(output), staging) && path.basename(staging).startsWith(".phase7a-review-"), "unsafe review-package staging path");
  await mkdir(staging, { recursive: false });
  const staged = {
    archive: path.join(staging, REVIEW_ZIP_NAME),
    manifest: path.join(staging, DETACHED_MANIFEST_NAME),
    audit: path.join(staging, INDEPENDENT_AUDIT_NAME),
  };
  try {
    await writeFile(staged.archive, artifacts.archiveBytes, { flag: "wx" });
    await writeFile(staged.manifest, artifacts.detachedBytes, { flag: "wx" });
    await runIndependentAuditor(staged);
    const auditBytes = await readFile(staged.audit);
    const auditDocument = parseJson(auditBytes, INDEPENDENT_AUDIT_NAME);
    invariant(auditDocument.archive.sha256 === sha256(artifacts.archiveBytes), "independent audit archive binding differs");
    invariant(auditDocument.detachedManifest.sha256 === sha256(artifacts.detachedBytes), "independent audit detached-manifest binding differs");
    await publishFresh([
      { source: staged.archive, destination: outputs.archive },
      { source: staged.manifest, destination: outputs.manifest },
      { source: staged.audit, destination: outputs.audit },
    ]);
    return Object.freeze({
      schema: `${PACKAGE_SCHEMA}.result`,
      status: "PASS",
      zip: { path: outputs.archive, bytes: artifacts.archiveBytes.length, sha256: sha256(artifacts.archiveBytes), entryCount: artifacts.files.length + 1 },
      embeddedManifest: { relativePath: IN_ARCHIVE_MANIFEST, bytes: artifacts.manifestBytes.length, sha256: sha256(artifacts.manifestBytes) },
      detachedManifest: { path: outputs.manifest, bytes: artifacts.detachedBytes.length, sha256: sha256(artifacts.detachedBytes) },
      independentAudit: { path: outputs.audit, bytes: auditBytes.length, sha256: sha256(auditBytes) },
      crcResult: "PASS",
      humanReviewGates: HUMAN_GATE_RECORDS,
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function isoBox(type, payload) {
  const data = Buffer.from(payload);
  const output = Buffer.alloc(8 + data.length);
  output.writeUInt32BE(output.length, 0);
  output.write(type, 4, 4, "ascii");
  data.copy(output, 8);
  return output;
}

function selfTestRecording(marker) {
  const ftyp = Buffer.alloc(16);
  ftyp.write("isom", 0, 4, "ascii");
  ftyp.writeUInt32BE(0x200, 4);
  ftyp.write("isom", 8, 4, "ascii");
  ftyp.write("mp42", 12, 4, "ascii");
  return Buffer.concat([isoBox("ftyp", ftyp), isoBox("moov", Buffer.from(`authority-${marker}`)), isoBox("mdat", Buffer.from(`evidence-${marker}`))]);
}

export async function createSelfTestEntries() {
  const entries = [];
  const licences = new Map(TYPOGRAPHY_ASSETS
    .filter(([assetPath]) => /(?:^|\/)OFL-[^/]+\.txt$/i.test(assetPath))
    .map(([assetPath]) => [path.posix.basename(assetPath), assetPath]));
  for (const { relativePath, role } of FIXED_EVIDENCE) {
    if (relativePath.startsWith("06-fonts/licences/")) {
      entries.push({ relativePath, data: await readFile(path.join(ROOT, ...licences.get(path.posix.basename(relativePath)).split("/"))) });
    } else if (relativePath === "09-hashes/phase-4-hash-verification.json") {
      entries.push({ relativePath, data: Buffer.from(stableJson({ status: "PASS", assets: PHYSICAL_ASSETS.map(([assetPath, hash]) => ({ relativePath: assetPath, sha256: hash })) })) });
    } else if (relativePath === "06-fonts/font-licences-and-hashes.json") {
      entries.push({ relativePath, data: Buffer.from(stableJson({ status: "PASS", assets: TYPOGRAPHY_ASSETS.map(([assetPath, bytes, hash]) => ({ relativePath: assetPath, bytes, sha256: hash })) })) });
    } else if (relativePath === "21-recordings/capture-evidence-manifest.json") {
      continue;
    } else if (relativePath === "19-deployment/deployment-authority.json") {
      entries.push({ relativePath, data: Buffer.from(stableJson({ schema: `${PACKAGE_SCHEMA}.deployment-unavailable.v1`, status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT", statement: "Self-test only: deployment was not supplied." })) });
    } else if (path.posix.extname(relativePath) === ".json") {
      entries.push({ relativePath, data: Buffer.from(stableJson({ status: "PENDING HUMAN REVIEW", role, statement: `Self-test evidence for ${role}.` })) });
    } else {
      entries.push({ relativePath, data: Buffer.from(`# ${role}\n\nSelf-test evidence.\n`) });
    }
  }
  const recordings = RECORDING_SPECS.map((spec, index) => {
    const data = selfTestRecording(`${index + 1}-${spec.engine}-${spec.scenario}`);
    entries.push({ relativePath: `${RECORDING_PREFIX}${spec.relativePath.replace(/^recordings\//, "")}`, data });
    return {
      ...spec,
      status: "PASS",
      failures: [],
      media: { ...RECORDING_MEDIA_CONTRACT, durationSeconds: (spec.minimumSeconds + spec.maximumSeconds) / 2 },
    };
  });
  for (const [index, relativePath] of SCREENSHOT_PACKAGE_PATHS.entries()) entries.push({ relativePath, data: Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from(`phase7a-self-test-${index}-${relativePath}`)]) });
  const byPath = new Map(entries.map((entry) => [entry.relativePath, entry.data]));
  const files = CAPTURE_SOURCE_MAP.filter(({ sourcePath }) => sourcePath !== CAPTURE_MANIFEST_PATH).map(({ sourcePath, relativePath }) => ({
    bytes: byPath.get(relativePath).length,
    relativePath: sourcePath,
    sha256: sha256(byPath.get(relativePath)),
  })).sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
  entries.push({
    relativePath: "21-recordings/capture-evidence-manifest.json",
    data: Buffer.from(stableJson({
      schema: CAPTURE_SCHEMA,
      status: "PASS",
      files,
      humanGates: HUMAN_GATE_RECORDS,
      browsers: [{ engine: "chromium", executable: "chrome.exe", headed: false, version: "self-test" }, { engine: "firefox", executable: "firefox.exe", headed: false, version: "self-test" }],
      recordings,
      screenshots: SCREENSHOT_SPECS,
      summary: { recordings: RECORDING_SPECS.length, screenshots: SCREENSHOT_SPECS.length },
    })),
  });
  return entries;
}

export async function createSelfTestProducerInputs() {
  const canonical = await createSelfTestEntries();
  const byPath = new Map(canonical.map(({ relativePath, data }) => [relativePath, Buffer.from(data)]));
  const captureFiles = new Map(CAPTURE_SOURCE_MAP.map(({ sourcePath, relativePath }) => [sourcePath, Buffer.from(byPath.get(relativePath))]));
  const zoomFiles = new Map(ZOOM_SOURCE_MAP.filter(({ role }) => role === "screenshot").map(({ sourcePath, relativePath }) => [sourcePath, Buffer.from(byPath.get(relativePath))]));
  const zoomReport = Buffer.from(stableJson({
    schema: "quantum-hub.phase-7a.installed-chrome-native-zoom.v1",
    status: "PASS",
    classification: "GENUINE INSTALLED GOOGLE CHROME BROWSER ZOOM",
    forbiddenSubstitutes: { viewportResize: false, cssZoom: false, transformScale: false, deviceEmulation: false },
    routes: ZOOM_ROUTES.map((route) => ({ path: route, status: "PASS" })),
  }));
  zoomFiles.set("installed-chrome-200-percent-report.json", zoomReport);
  const zoomEntries = ZOOM_SOURCE_MAP.filter(({ role }) => role === "screenshot").map(({ sourcePath }) => ({ path: sourcePath, bytes: zoomFiles.get(sourcePath).length, sha256: sha256(zoomFiles.get(sourcePath)) })).sort((left, right) => lexicalCompare(left.path, right.path));
  zoomFiles.set("manifest.json", Buffer.from(stableJson({ schema: "quantum-hub.phase-7a.installed-chrome-native-zoom.v1.artifacts.v1", report: { path: "installed-chrome-200-percent-report.json", bytes: zoomReport.length, sha256: sha256(zoomReport) }, entries: zoomEntries })));

  const gateMap = Object.fromEntries(PHASE7A_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"]));
  const reportFiles = new Map();
  for (const { sourcePath } of REPORT_SOURCE_MAP) {
    if (sourcePath.endsWith(".md")) reportFiles.set(sourcePath, Buffer.from(`# ${sourcePath}\n\nSelf-test report.\n`));
    else reportFiles.set(sourcePath, Buffer.from(stableJson({ schema: `quantum-hub.phase-7a.report.${sourcePath}.v1`, status: "PASS", statement: "Self-test report.", sources: [], summary: {}, observations: [], limitations: [] })));
  }
  reportFiles.set("00-assembly-index.json", Buffer.from(stableJson({ schema: "quantum-hub.phase-7a.report-assembly.v1", status: "PASS", reports: Array.from({ length: 13 }, (_, index) => ({ key: String(index + 1), status: index === 12 ? "PENDING HUMAN REVIEW" : "PASS" })), humanGates: gateMap })));
  reportFiles.set("09-physical-hashes.json", Buffer.from(stableJson({ status: "PASS", summary: { assets: PHYSICAL_ASSETS.map(([assetPath, hash]) => ({ path: assetPath, actualSha256: hash, status: "PASS" })) } })));
  reportFiles.set("11-git-provenance-deletions-tracked-deltas.json", Buffer.from(stableJson({ status: "PASS", statement: "Self-test Git authority.", sources: [], observations: [], limitations: [], summary: { status: "PASS", branch: PHASE7A_BRANCH, head: "a".repeat(40), expectedBranch: PHASE7A_BRANCH, expectedParent: PHASE7A_PARENT, parentIsAncestor: true, frozenMainExpected: FROZEN_MAIN, localMain: FROZEN_MAIN, originMain: FROZEN_MAIN, mergeCommits: [], worktree: { clean: true, statusLines: [] }, deletionInventory: [], trackedTrees: { parent: { fileCount: 1, bytes: 1 }, head: { fileCount: 2, bytes: 2 }, delta: { files: 1, bytes: 1 } }, trackedChanges: { count: 1, entries: [], addedLines: 1, deletedLines: 0, binaryFiles: 0 }, failures: [], limitations: [] } })));
  reportFiles.set("12-deployment-provenance.json", Buffer.from(stableJson({ status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT", statement: "Self-test deployment unavailable.", sources: [], summary: { supplied: false }, observations: [], limitations: [] })));
  reportFiles.set("13-human-gates.json", Buffer.from(stableJson({ status: "PENDING HUMAN REVIEW", summary: { gates: PHASE7A_GATES.map((gate) => ({ gate, status: "PENDING HUMAN REVIEW" })) } })));
  const reportLedger = REPORT_SOURCE_MAP.filter(({ sourcePath }) => sourcePath !== "assembly-manifest.json").map(({ sourcePath }) => ({ filename: sourcePath, bytes: reportFiles.get(sourcePath).length, sha256: sha256(reportFiles.get(sourcePath)) })).sort((left, right) => lexicalCompare(left.filename, right.filename));
  reportFiles.set("assembly-manifest.json", Buffer.from(stableJson({ schema: "quantum-hub.phase-7a.report-assembly.v1.manifest", status: "PASS", deterministic: true, generatedAt: null, sourceBindings: [], fileCountExcludingManifest: reportLedger.length, files: reportLedger, humanGates: gateMap })));

  const repositoryPaths = ["03-maps/retention-demolition-map.md", "06-fonts/typography-study.md", "07-reference/reference-mechanics.md", "08-architecture/architecture.md", "10-tests/test-and-fixture-disposition.md", "06-fonts/licences/OFL-Anybody.txt", "06-fonts/licences/OFL-Mona-Sans.txt", "06-fonts/licences/OFL-Bricolage-Grotesque.txt", "06-fonts/licences/OFL-Archivo.txt"];
  return {
    reportFiles,
    captureFiles,
    zoomFiles,
    authoritativeBriefBytes: Buffer.from("# Phase 7A authoritative self-test brief\n"),
    deploymentBytes: null,
    repositoryFiles: new Map(repositoryPaths.map((relativePath) => [relativePath, Buffer.from(byPath.get(relativePath))])),
    gitSnapshot: { head: "a".repeat(40), productionDiff: Buffer.from("diff --git a/src/self-test b/src/self-test\n"), newTrackedFilesAbove1MiB: [] },
    allowMissingDeployment: true,
  };
}

export async function selfTest() {
  const first = buildPackageArtifacts(normalizeProducerInputs(await createSelfTestProducerInputs()));
  const second = buildPackageArtifacts(normalizeProducerInputs(await createSelfTestProducerInputs()));
  invariant(first.archiveBytes.equals(second.archiveBytes) && first.detachedBytes.equals(second.detachedBytes), "Phase 7A package determinism self-test failed");
  invariant(first.archiveBytes.length <= MAX_ARCHIVE_BYTES && first.files.length === FIXED_EVIDENCE.length + RECORDING_PACKAGE_PATHS.length + SCREENSHOT_PACKAGE_PATHS.length, "Phase 7A package topology self-test failed");
  return Object.freeze({
    schema: `${PACKAGE_SCHEMA}.self-test`,
    status: "PASS",
    archiveBytes: first.archiveBytes.length,
    archiveSha256: sha256(first.archiveBytes),
    entries: first.files.length + 1,
    recordings: RECORDING_PACKAGE_PATHS.length,
    humanGates: HUMAN_GATE_RECORDS.length,
  });
}

export function parseArguments(argv) {
  const options = { reportsDir: null, captureDir: null, zoomDir: null, authoritativeBrief: null, deploymentJson: null, output: null, selfTest: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[index + 1];
      invariant(value && !value.startsWith("--"), `${flag} requires a value`);
      index += 1;
      return value;
    };
    if (flag === "--reports-dir") options.reportsDir = next();
    else if (flag === "--capture-dir") options.captureDir = next();
    else if (flag === "--installed-chrome-zoom") options.zoomDir = next();
    else if (flag === "--authoritative-brief") options.authoritativeBrief = next();
    else if (flag === "--deployment-json") options.deploymentJson = next();
    else if (flag === "--output") options.output = next();
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown option: ${flag}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "Usage:",
    "  node scripts/package-phase7a-human-review.mjs \\",
    "    --reports-dir <absolute-report-assembler-output> \\",
    "    --capture-dir <absolute-capture-runner-output> \\",
    "    --installed-chrome-zoom <absolute-installed-Chrome-evidence-directory> \\",
    "    --authoritative-brief <absolute-task-brief> \\",
    "    --deployment-json <absolute-deployment-provenance-json> \\",
    `    --output <absolute-fresh-external>/${REVIEW_ZIP_NAME}`,
    "",
    `The packager writes ${DETACHED_MANIFEST_NAME} and ${INDEPENDENT_AUDIT_NAME} beside the ZIP.`,
    "It never overwrites an existing output.",
  ].join("\n"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(await selfTest(), null, 2)}\n`); return; }
  for (const [key, flag] of [["reportsDir", "--reports-dir"], ["captureDir", "--capture-dir"], ["zoomDir", "--installed-chrome-zoom"], ["authoritativeBrief", "--authoritative-brief"], ["deploymentJson", "--deployment-json"], ["output", "--output"]]) invariant(options[key], `${flag} is required`);
  process.stdout.write(`${JSON.stringify(await assemblePackage(options), null, 2)}\n`);
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
