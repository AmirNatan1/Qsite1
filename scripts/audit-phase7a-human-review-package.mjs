import { createHash } from "node:crypto";
import { access, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
  HUMAN_GATE_RECORDS,
  REAL_404_PATH,
  RECORDING_SPECS,
  safeRelativeEvidencePath,
  validateEvidenceManifest,
  validateHumanGates,
  validateRecordingReport,
} from "./phase7a-browser-contract.mjs";
import {
  MANIFEST_PATH as CAPTURE_MANIFEST_PATH,
  SCHEMA as CAPTURE_SCHEMA,
  SCREENSHOT_SPECS,
} from "./capture-phase7a-review-evidence.mjs";

const SCRIPT = fileURLToPath(import.meta.url);

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
const REPORT_EVIDENCE = Object.freeze([
  fixed("01-provenance/report-assembly-index.json", "report-assembly-index"), fixed("01-provenance/report-assembly-index.md", "report-assembly-index"),
  fixed("11-accessibility/accessibility-report.json", "accessibility-report"), fixed("11-accessibility/accessibility-report.md", "accessibility-report"),
  fixed("13-responsive/responsive-report.json", "responsive-report"), fixed("13-responsive/responsive-report.md", "responsive-report"),
  fixed("12-fallback/reduced-motion-report.json", "reduced-motion-report"), fixed("12-fallback/reduced-motion-report.md", "reduced-motion-report"),
  fixed("12-fallback/no-js-report.json", "no-js-report"), fixed("12-fallback/no-js-report.md", "no-js-report"),
  fixed("12-fallback/fallback-font-report.json", "fallback-font-report"), fixed("12-fallback/fallback-font-report.md", "fallback-font-report"),
  fixed("16-performance/performance-and-lifecycle-report.json", "performance-and-lifecycle-report"), fixed("16-performance/performance-and-lifecycle-report.md", "performance-and-lifecycle-report"),
  fixed("17-network/network-report.json", "network-report"), fixed("17-network/network-report.md", "network-report"),
  fixed("18-publication/publication-scan.json", "publication-scan"), fixed("18-publication/publication-scan.md", "publication-scan"),
  fixed("09-hashes/phase-4-hash-verification.json", "phase-4-hash-verification"), fixed("09-hashes/phase-4-hash-verification.md", "phase-4-hash-verification"),
  fixed("22-limitations/environmental-limitations.json", "environmental-limitations"), fixed("22-limitations/environmental-limitations.md", "environmental-limitations"),
  fixed("01-provenance/git-provenance-deletions-and-deltas-report.json", "git-provenance-combined-report"), fixed("01-provenance/git-provenance-deletions-and-deltas-report.md", "git-provenance-combined-report"),
  fixed("19-deployment/deployment-provenance-report.json", "deployment-provenance-report"), fixed("19-deployment/deployment-provenance-report.md", "deployment-provenance-report"),
  fixed("00-brief/human-review-gates.json", "human-review-gates"), fixed("00-brief/human-review-gates.md", "human-review-gates"),
  fixed("01-provenance/report-assembly-manifest.json", "report-assembly-manifest"),
]);
const FIXED_EVIDENCE = Object.freeze([
  ...REPORT_EVIDENCE,
  fixed("00-brief/authoritative-task-brief.md", "authoritative-task-brief"),
  fixed("01-provenance/git-provenance.json", "git-provenance"), fixed("01-provenance/branch-and-ancestry.json", "branch-and-ancestry-report"),
  fixed("02-diff/production-source.diff", "production-source-diff"), fixed("03-maps/retention-demolition-map.md", "retention-demolition-map"),
  fixed("04-deletion-inventory/deleted-replaced-files.json", "deleted-replaced-file-inventory"),
  fixed("05-deltas/tracked-file-and-byte-delta.json", "tracked-file-and-byte-delta"), fixed("05-deltas/new-tracked-files-above-1-mib.json", "new-tracked-files-above-1-mib"),
  fixed("06-fonts/typography-study.md", "typography-study"), fixed("06-fonts/typography-specimen.html", "typography-specimen"), fixed("06-fonts/font-licences-and-hashes.json", "font-licences-and-hashes"),
  fixed("06-fonts/licences/OFL-Anybody.txt", "font-licence"), fixed("06-fonts/licences/OFL-Mona-Sans.txt", "font-licence"), fixed("06-fonts/licences/OFL-Bricolage-Grotesque.txt", "font-licence"), fixed("06-fonts/licences/OFL-Archivo.txt", "font-licence"),
  fixed("07-reference/reference-mechanics.md", "reference-mechanics-report"), fixed("08-architecture/architecture.md", "architecture-report"),
  fixed("10-tests/test-results.json", "test-results"), fixed("10-tests/test-and-fixture-disposition.md", "test-and-fixture-disposition"),
  fixed("14-zoom-200/installed-chrome-200-percent-report.json", "genuine-200-percent-status"), fixed("14-zoom-200/manifest.json", "genuine-200-percent-manifest"),
  fixed("15-browser/chromium-report.json", "chromium-browser-evidence"), fixed("15-browser/firefox-report.json", "firefox-browser-evidence"), fixed("15-browser/webkit-proxy-report.json", "webkit-proxy-evidence"),
  fixed("19-deployment/deployment-authority.json", "deployment-authority"), fixed("21-recordings/capture-evidence-manifest.json", "capture-evidence-manifest"),
]);

const SCREENSHOT_PREFIX = "20-screenshots/";
const RECORDING_PREFIX = "21-recordings/";
const RECORDING_PACKAGE_PATHS = Object.freeze(RECORDING_SPECS.map((spec) => (
  `${RECORDING_PREFIX}${spec.relativePath.replace(/^recordings\//, "")}`
)));
const captureScreenshotPaths = SCREENSHOT_SPECS.map((spec) => `${SCREENSHOT_PREFIX}chromium/${spec.relativePath.replace(/^screenshots\//, "")}`);
function zoomScreenshotSourcePath(route) {
  return route === "/" ? "home-top.png" : `${route.replaceAll("/", "-").replace(/^-|-$/g, "")}-top.png`;
}
const zoomScreenshotPaths = [...PUBLIC_ROUTES.map(({ route }) => route), REAL_404_PATH]
  .map((route) => `${SCREENSHOT_PREFIX}installed-chrome-200/${zoomScreenshotSourcePath(route)}`);
zoomScreenshotPaths.push(`${SCREENSHOT_PREFIX}installed-chrome-200/home-field-map-open.png`);
const SCREENSHOT_PACKAGE_PATHS = Object.freeze([...captureScreenshotPaths, ...zoomScreenshotPaths].sort(lexicalCompare));
const FIXED_ROLE_BY_PATH = new Map(FIXED_EVIDENCE.map(({ relativePath, role }) => [relativePath, role]));
const RECORDING_PATH_SET = new Set(RECORDING_PACKAGE_PATHS);
const SCREENSHOT_PATH_SET = new Set(SCREENSHOT_PACKAGE_PATHS);
const SCREENSHOT_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".diff", ".html"]);
const FORBIDDEN_PATH = /(?:^|\/)(?:src|source|scripts?|node_modules|\.git|\.astro|\.cache|caches?|browser[-_ ]?cache|raw(?:[-_ ]?(?:media|frames?|traces?))?|frames?|traces?|heap[-_ ]?dumps?|profiles?|private|secrets?|credentials?|temp|tmp|__pycache__)(?:\/|$)|(?:^|\/)\.(?:env|ds_store)(?:\.|$)|\.(?:zip|7z|rar|tar|tgz|gz|bz2|xz|blend\d*|exr|tiff?|mov|mkv|avi|webm|heapsnapshot|trace|pem|key|p12|pfx|woff2?|ttf|otf)$/i;
const PRIVATE_OR_SECRET_TEXT = /(?:(?:^|[\s"'=:(`\[])[a-z]:[\\/]|(?:^|[\s"'=:(`\[])\/(?:users|home|tmp|private|var\/folders)\/[^/\s]+(?:\/|\b)|(?:^|[^a-z])onedrive(?:[^a-z]|$)|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;
const RAW_PHASE4_HASHES = new Set(PHYSICAL_ASSETS.filter(([assetPath]) => /public\/media\/cinematic\/phase-4r2\/(?:media|posters)\//.test(assetPath)).map(([_assetPath, hash]) => hash));
const DOS_DATE = (1 << 5) | 1;

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

function safePackagePath(value, label = "archive path") {
  safeRelativeEvidencePath(value, label);
  invariant(!value.includes("\0") && !value.split("/").some((part) => !part || part === "." || part === ".."), `${label} is unsafe`);
  return value;
}

function roleForEvidencePath(relativePath) {
  safePackagePath(relativePath);
  if (FIXED_ROLE_BY_PATH.has(relativePath)) return FIXED_ROLE_BY_PATH.get(relativePath);
  if (RECORDING_PATH_SET.has(relativePath)) return "recording";
  if (SCREENSHOT_PATH_SET.has(relativePath)) return "screenshot";
  throw new Error(`entry is outside the independent Phase 7A topology: ${relativePath}`);
}

function assertAllowedEvidencePath(relativePath) {
  safePackagePath(relativePath);
  invariant(!FORBIDDEN_PATH.test(relativePath), `forbidden source/cache/raw/archive/private payload: ${relativePath}`);
  roleForEvidencePath(relativePath);
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

function assertNoPrivateText(bytes, relativePath) {
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
}

function parseJson(bytes, label) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error(`invalid JSON: ${label}`); }
}

function rebuildStoredZip(entries) {
  const normalized = [...entries].map(([relativePath, entry]) => ({ relativePath, data: Buffer.from(entry.data) }))
    .sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of normalized) {
    const name = Buffer.from(entry.relativePath, "utf8");
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE, 12);
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
    central.writeUInt16LE(DOS_DATE, 14);
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

export function parseStoredZip(input, maximumBytes = MAX_ARCHIVE_BYTES) {
  const bytes = Buffer.from(input);
  invariant(bytes.length >= 22 && bytes.length <= maximumBytes, "ZIP size boundary failed");
  const endOffset = bytes.length - 22;
  invariant(bytes.readUInt32LE(endOffset) === 0x06054b50, "canonical ZIP EOCD is missing");
  const disk = bytes.readUInt16LE(endOffset + 4);
  const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const diskEntries = bytes.readUInt16LE(endOffset + 8);
  const totalEntries = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  const commentLength = bytes.readUInt16LE(endOffset + 20);
  invariant(disk === 0 && centralDisk === 0 && diskEntries === totalEntries && commentLength === 0, "multi-disk/commented ZIP is forbidden");
  invariant(centralOffset + centralSize === endOffset, "ZIP central directory boundary differs");

  const entries = new Map();
  let cursor = centralOffset;
  let expectedLocalOffset = 0;
  let previous = null;
  for (let index = 0; index < totalEntries; index += 1) {
    invariant(cursor + 46 <= endOffset && bytes.readUInt32LE(cursor) === 0x02014b50, "ZIP central entry is truncated");
    const madeBy = bytes.readUInt16LE(cursor + 4);
    const needed = bytes.readUInt16LE(cursor + 6);
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const time = bytes.readUInt16LE(cursor + 12);
    const date = bytes.readUInt16LE(cursor + 14);
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const entryCommentLength = bytes.readUInt16LE(cursor + 32);
    const startDisk = bytes.readUInt16LE(cursor + 34);
    const internalAttributes = bytes.readUInt16LE(cursor + 36);
    const externalAttributes = bytes.readUInt32LE(cursor + 38);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    invariant(madeBy === 0x0314 && needed === 20 && flags === 0x0800 && method === 0 && time === 0 && date === DOS_DATE, "ZIP entry is not canonical stored UTF-8");
    invariant(compressedSize === size && nameLength > 0 && extraLength === 0 && entryCommentLength === 0 && startDisk === 0 && internalAttributes === 0 && externalAttributes === 0, "ZIP entry has forbidden metadata");
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    invariant(nameEnd <= endOffset, "ZIP central path is truncated");
    const nameBytes = bytes.subarray(nameStart, nameEnd);
    const relativePath = nameBytes.toString("utf8");
    invariant(Buffer.from(relativePath, "utf8").equals(nameBytes), "ZIP entry path is not valid canonical UTF-8");
    safePackagePath(relativePath, "ZIP entry");
    invariant(!entries.has(relativePath) && (previous === null || lexicalCompare(previous, relativePath) < 0), "ZIP paths are duplicate or not in canonical lexical order");
    invariant(localOffset === expectedLocalOffset && localOffset + 30 <= centralOffset, "ZIP local offsets are not contiguous");
    invariant(bytes.readUInt32LE(localOffset) === 0x04034b50, "ZIP local header is missing");
    const localNeeded = bytes.readUInt16LE(localOffset + 4);
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localTime = bytes.readUInt16LE(localOffset + 10);
    const localDate = bytes.readUInt16LE(localOffset + 12);
    const localCrc = bytes.readUInt32LE(localOffset + 14);
    const localCompressed = bytes.readUInt32LE(localOffset + 18);
    const localSize = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    invariant(localNeeded === needed && localFlags === flags && localMethod === method && localTime === time && localDate === date && localCrc === checksum && localCompressed === compressedSize && localSize === size && localNameLength === nameLength && localExtraLength === 0, "local and central ZIP metadata differ");
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    invariant(bytes.subarray(localNameStart, localNameEnd).equals(nameBytes), "local and central ZIP paths differ");
    const dataStart = localNameEnd;
    const dataEnd = dataStart + size;
    invariant(dataEnd <= centralOffset, "ZIP payload is truncated");
    const data = Buffer.from(bytes.subarray(dataStart, dataEnd));
    invariant(crc32(data) === checksum, `CRC rejection for ${relativePath}`);
    entries.set(relativePath, Object.freeze({ data, bytes: size, sha256: sha256(data), crc32: crc32Hex(data) }));
    previous = relativePath;
    expectedLocalOffset = dataEnd;
    cursor = nameEnd;
  }
  invariant(cursor === endOffset && expectedLocalOffset === centralOffset, "ZIP local/central surfaces are not contiguous");
  invariant(rebuildStoredZip(entries).equals(bytes), "ZIP is not the unique deterministic stored encoding");
  return Object.freeze({ entries, crcValidated: true, deterministic: true });
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

function assertRecording(bytes, relativePath) {
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
  invariant(cursor === data.length && boxTypes[0] === "ftyp" && boxTypes.includes("moov") && boxTypes.includes("mdat"), `recording is not a complete ISO-BMFF artifact: ${relativePath}`);
}

function metadataFor(relativePath, role, data) {
  return Object.freeze({
    relativePath,
    role,
    category: relativePath.split("/", 1)[0],
    kind: role === "recording" ? "video" : role === "screenshot" ? "image" : "document",
    bytes: data.length,
    sha256: sha256(data),
    crc32: crc32Hex(data),
  });
}

function authorityRows(document, relativePath) {
  const rows = document?.assets ?? document?.files ?? document?.entries ?? document?.summary?.assets;
  invariant(Array.isArray(rows), `${relativePath} must contain an assets/files/entries array`);
  return rows.map((row) => ({ relativePath: row?.relativePath ?? row?.path, sha256: row?.sha256 ?? row?.actualSha256 }));
}

function validateExactHashAuthority(bytes, relativePath, authority) {
  const document = parseJson(bytes, relativePath);
  invariant(document?.status === "PASS", `${relativePath} must record PASS for exact hash authority`);
  const expected = new Map(authority.map(([assetPath, hash]) => [assetPath, hash]));
  const observed = new Map();
  for (const row of authorityRows(document, relativePath)) {
    invariant(typeof row.relativePath === "string" && /^[0-9a-f]{64}$/.test(row.sha256 ?? "") && !observed.has(row.relativePath), `${relativePath} contains an invalid or duplicate hash row`);
    observed.set(row.relativePath, row.sha256);
  }
  invariant(observed.size === expected.size, `${relativePath} hash inventory count differs`);
  for (const [assetPath, hash] of expected) invariant(observed.get(assetPath) === hash, `${relativePath} authority mismatch: ${assetPath}`);
}

function validateFontLicences(entries) {
  const authorities = new Map(TYPOGRAPHY_ASSETS
    .filter(([assetPath]) => /(?:^|\/)OFL-[^/]+\.txt$/i.test(assetPath))
    .map(([assetPath, bytes, hash]) => [path.posix.basename(assetPath), { bytes, hash }]));
  invariant(authorities.size === 4, "Phase 7A font licence authority differs");
  for (const [basename, authority] of authorities) {
    const relativePath = `06-fonts/licences/${basename}`;
    const entry = entries.get(relativePath);
    invariant(entry && entry.data.length === authority.bytes && sha256(entry.data) === authority.hash, `font licence bytes differ: ${relativePath}`);
  }
}

function validateRecordingInventory(entries) {
  const relativePath = "21-recordings/capture-evidence-manifest.json";
  const report = parseJson(entries.get(relativePath).data, relativePath);
  invariant(report.schema === CAPTURE_SCHEMA && report.status === "PASS", "capture evidence manifest authority differs");
  validateHumanGates(report.humanGates);
  validateRecordingReport(report);
  const records = new Map(report.recordings.map((record) => [record.relativePath, record]));
  const ledger = new Map((report.files ?? []).map((record) => [record.relativePath, record]));
  invariant(ledger.size === RECORDING_PACKAGE_PATHS.length + SCREENSHOT_SPECS.length + 1, "capture evidence manifest file count differs");
  for (const spec of RECORDING_SPECS) {
    const entry = entries.get(`${RECORDING_PREFIX}${spec.relativePath.replace(/^recordings\//, "")}`);
    const record = records.get(spec.relativePath);
    const bound = ledger.get(spec.relativePath);
    invariant(entry && record && bound && bound.bytes === entry.data.length && bound.sha256 === sha256(entry.data), `recording hash/byte binding differs: ${spec.relativePath}`);
  }
  for (const spec of SCREENSHOT_SPECS) {
    const packagePath = `${SCREENSHOT_PREFIX}chromium/${spec.relativePath.replace(/^screenshots\//, "")}`;
    const entry = entries.get(packagePath);
    const bound = ledger.get(spec.relativePath);
    invariant(entry && bound && bound.bytes === entry.data.length && bound.sha256 === sha256(entry.data), `capture screenshot binding differs: ${spec.relativePath}`);
  }
  const specimen = entries.get("06-fonts/typography-specimen.html");
  const specimenBound = ledger.get("typography/phase7a-portable-specimen.html");
  invariant(specimen && specimenBound && specimenBound.bytes === specimen.data.length && specimenBound.sha256 === sha256(specimen.data), "capture typography specimen binding differs");
}

function auditEvidence(entries) {
  const payload = new Map([...entries].filter(([relativePath]) => relativePath !== IN_ARCHIVE_MANIFEST));
  for (const { relativePath } of FIXED_EVIDENCE) invariant(payload.has(relativePath), `package omits ${relativePath}`);
  for (const relativePath of RECORDING_PACKAGE_PATHS) invariant(payload.has(relativePath), `package omits ${relativePath}`);
  for (const relativePath of SCREENSHOT_PACKAGE_PATHS) invariant(payload.has(relativePath), `package omits ${relativePath}`);
  const files = [];
  let screenshotCount = 0;
  for (const [relativePath, entry] of payload) {
    assertAllowedEvidencePath(relativePath);
    invariant(entry.data.length > 0 && entry.data.length <= MAX_FILE_BYTES, `evidence size boundary failed: ${relativePath}`);
    assertNoPrivateText(entry.data, relativePath);
    const role = roleForEvidencePath(relativePath);
    invariant(!RAW_PHASE4_HASHES.has(sha256(entry.data)), `raw Phase 4 media is forbidden: ${relativePath}`);
    if (role === "recording") assertRecording(entry.data, relativePath);
    if (role === "screenshot") { assertScreenshot(entry.data, relativePath); screenshotCount += 1; }
    files.push(metadataFor(relativePath, role, entry.data));
  }
  invariant(screenshotCount === SCREENSHOT_PACKAGE_PATHS.length, "package screenshot count differs");
  invariant(payload.size === FIXED_EVIDENCE.length + RECORDING_PACKAGE_PATHS.length + SCREENSHOT_PACKAGE_PATHS.length, "package contains unexpected evidence entries");
  validateFontLicences(payload);
  validateExactHashAuthority(payload.get("09-hashes/phase-4-hash-verification.json").data, "09-hashes/phase-4-hash-verification.json", PHYSICAL_ASSETS);
  validateExactHashAuthority(payload.get("06-fonts/font-licences-and-hashes.json").data, "06-fonts/font-licences-and-hashes.json", TYPOGRAPHY_ASSETS.map(([assetPath, _bytes, hash]) => [assetPath, hash]));
  validateRecordingInventory(payload);
  return files.sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
}

function expectedAuthority() {
  return {
    branch: PHASE7A_BRANCH,
    acceptedParent: PHASE7A_PARENT,
    frozenMain: FROZEN_MAIN,
    physicalAssets: PHYSICAL_ASSETS.map(([relativePath, hash]) => ({ relativePath, sha256: hash })),
    recordingScenarios: [...RECORDING_SCENARIOS],
    reviewZipName: REVIEW_ZIP_NAME,
  };
}

function exclusions() {
  return [
    "repository source archive",
    "node_modules and caches",
    "raw traces, heap dumps, and frame sequences",
    "raw Phase 4 media",
    "Blender and EXR files",
    "private paths and credentials",
    "nested archives",
    "font binaries and unlicensed fonts",
  ];
}

function expectedPackageManifest(files) {
  const sectionCounts = {};
  for (const file of files) sectionCounts[file.category] = (sectionCounts[file.category] ?? 0) + 1;
  return {
    schema: PACKAGE_SCHEMA,
    archiveFilename: REVIEW_ZIP_NAME,
    deterministicEncoding: "canonical ZIP32 stored UTF-8; lexical entry order; DOS 1980-01-01 00:00:00",
    authority: expectedAuthority(),
    requiredEvidence: { fixed: FIXED_EVIDENCE, recordings: RECORDING_PACKAGE_PATHS, screenshots: SCREENSHOT_PACKAGE_PATHS },
    evidence: { entries: files, entryCount: files.length, contentBytes: files.reduce((sum, file) => sum + file.bytes, 0), sectionCounts },
    humanReviewGates: HUMAN_GATE_RECORDS,
    gateAuthority: PHASE7A_GATES,
    exclusions: exclusions(),
  };
}

function entryInventory(entries) {
  return [...entries].map(([relativePath, entry]) => ({
    relativePath,
    bytes: entry.data.length,
    sha256: sha256(entry.data),
    crc32: crc32Hex(entry.data),
  }));
}

export function auditPackageBytes({ archiveBytes: archiveInput, detachedBytes: detachedInput }) {
  const archiveBytes = Buffer.from(archiveInput);
  const detachedBytes = Buffer.from(detachedInput);
  const parsed = parseStoredZip(archiveBytes);
  invariant(parsed.entries.has(IN_ARCHIVE_MANIFEST), `ZIP omits ${IN_ARCHIVE_MANIFEST}`);
  const files = auditEvidence(parsed.entries);
  validateEvidenceManifest(files);
  validateHumanGates(HUMAN_GATE_RECORDS);

  const manifestEntry = parsed.entries.get(IN_ARCHIVE_MANIFEST);
  assertNoPrivateText(manifestEntry.data, IN_ARCHIVE_MANIFEST);
  const embedded = parseJson(manifestEntry.data, IN_ARCHIVE_MANIFEST);
  invariant(Buffer.from(stableJson(embedded)).equals(manifestEntry.data), "embedded manifest is not canonical JSON");
  const expectedEmbedded = expectedPackageManifest(files);
  invariant(sameJson(embedded, expectedEmbedded), "embedded manifest differs from independently reconstructed authority");

  assertNoPrivateText(detachedBytes, DETACHED_MANIFEST_NAME);
  const detached = parseJson(detachedBytes, DETACHED_MANIFEST_NAME);
  invariant(Buffer.from(stableJson(detached)).equals(detachedBytes), "detached manifest is not canonical JSON");
  const expectedDetached = {
    schema: DETACHED_SCHEMA,
    archive: { filename: REVIEW_ZIP_NAME, bytes: archiveBytes.length, sha256: sha256(archiveBytes), entryCount: parsed.entries.size, crc32Verification: "REQUIRED" },
    embeddedManifest: { relativePath: IN_ARCHIVE_MANIFEST, bytes: manifestEntry.data.length, sha256: sha256(manifestEntry.data) },
    entries: entryInventory(parsed.entries),
  };
  invariant(sameJson(detached, expectedDetached), "detached manifest differs from independently reconstructed archive inventory");

  return Object.freeze({
    schema: AUDIT_SCHEMA,
    status: "PASS",
    archive: { filename: REVIEW_ZIP_NAME, bytes: archiveBytes.length, sha256: sha256(archiveBytes), entryCount: parsed.entries.size },
    detachedManifest: { filename: DETACHED_MANIFEST_NAME, bytes: detachedBytes.length, sha256: sha256(detachedBytes) },
    embeddedManifest: { relativePath: IN_ARCHIVE_MANIFEST, bytes: manifestEntry.data.length, sha256: sha256(manifestEntry.data) },
    checks: {
      exactAuthorityFilename: "PASS",
      deterministicOrderingAndEncoding: "PASS",
      crc32EveryEntry: "PASS",
      sha256EveryEntry: "PASS",
      detachedManifestBinding: "PASS",
      closedEvidenceTopology: "PASS",
      requiredEvidenceRoles: "PASS",
      recordingCrossProductAndBindings: "PASS",
      phase4AndFontAuthorities: "PASS",
      exclusionsAndPrivacyScan: "PASS",
      humanGatesPending: "PASS",
    },
    crcResult: "PASS",
    humanReviewGates: HUMAN_GATE_RECORDS,
  });
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

async function canonicalExistingFile(candidate, label, basename) {
  const requested = assertExternalPath(candidate, label);
  invariant(path.basename(requested) === basename, `${label} basename must be exactly ${basename}`);
  const info = await lstat(requested);
  invariant(info.isFile() && !info.isSymbolicLink(), `${label} must be a real file`);
  const resolved = await realpath(requested);
  assertExternalPath(resolved, label);
  return resolved;
}

async function assertFresh(candidate) {
  try {
    await access(candidate);
    throw new Error(`refusing to overwrite existing audit: ${candidate}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export async function auditPackage(input) {
  invariant(input && typeof input === "object", "audit options are required");
  const archive = await canonicalExistingFile(input.archive, "--archive", REVIEW_ZIP_NAME);
  const manifest = await canonicalExistingFile(input.manifest, "--manifest", DETACHED_MANIFEST_NAME);
  const auditOutput = assertExternalPath(input.auditOutput, "--audit-output");
  invariant(path.basename(auditOutput) === INDEPENDENT_AUDIT_NAME, `--audit-output basename must be exactly ${INDEPENDENT_AUDIT_NAME}`);
  const auditParent = await realpath(path.dirname(auditOutput));
  const resolvedAudit = path.join(auditParent, path.basename(auditOutput));
  assertExternalPath(resolvedAudit, "--audit-output");
  invariant(path.dirname(archive) === path.dirname(manifest) && path.dirname(manifest) === path.dirname(resolvedAudit), "archive, detached manifest, and audit must be siblings");
  await assertFresh(resolvedAudit);
  const audit = auditPackageBytes({ archiveBytes: await readFile(archive), detachedBytes: await readFile(manifest) });
  const auditBytes = Buffer.from(stableJson(audit));
  assertNoPrivateText(auditBytes, INDEPENDENT_AUDIT_NAME);
  await writeFile(resolvedAudit, auditBytes, { flag: "wx" });
  return Object.freeze({
    schema: `${AUDIT_SCHEMA}.result`,
    status: "PASS",
    audit: { filename: INDEPENDENT_AUDIT_NAME, bytes: auditBytes.length, sha256: sha256(auditBytes) },
    archiveSha256: audit.archive.sha256,
    detachedManifestSha256: audit.detachedManifest.sha256,
    crcResult: "PASS",
  });
}

export function selfTest() {
  const entries = new Map([
    ["a.json", { data: Buffer.from("{\"status\":\"PASS\"}\n") }],
    ["b.txt", { data: Buffer.from("independent CRC fixture\n") }],
  ]);
  const archive = rebuildStoredZip(entries);
  const parsed = parseStoredZip(archive, 1024 * 1024);
  invariant(parsed.entries.size === 2 && parsed.crcValidated && parsed.deterministic, "independent ZIP parser self-test failed");
  const tampered = Buffer.from(archive);
  tampered[31 + Buffer.byteLength("a.json")] ^= 0x01;
  let rejected = false;
  try { parseStoredZip(tampered, 1024 * 1024); } catch { rejected = true; }
  invariant(rejected, "independent ZIP parser accepted tampering");
  return Object.freeze({ schema: `${AUDIT_SCHEMA}.self-test`, status: "PASS", entries: parsed.entries.size, crcTamperRejected: true });
}

export function parseArguments(argv) {
  const options = { archive: null, manifest: null, auditOutput: null, selfTest: false, help: false };
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
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown option: ${flag}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "Usage:",
    "  node scripts/audit-phase7a-human-review-package.mjs",
    `    --archive <absolute-external>/${REVIEW_ZIP_NAME}`,
    `    --manifest <absolute-external>/${DETACHED_MANIFEST_NAME}`,
    `    --audit-output <absolute-fresh-external>/${INDEPENDENT_AUDIT_NAME}`,
  ].join("\n"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`); return; }
  invariant(options.archive, "--archive is required");
  invariant(options.manifest, "--manifest is required");
  invariant(options.auditOutput, "--audit-output is required");
  process.stdout.write(`${JSON.stringify(await auditPackage(options), null, 2)}\n`);
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
