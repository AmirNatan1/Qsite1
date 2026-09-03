import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PHASE7C_BRANCH,
  PHASE7C_ALLOWED_STATUSES,
  PHASE7C_FROZEN_MAIN,
  PHASE7C_GATES,
  PHASE7C_PARENT,
  PHASE7C_RECORDING_SCENARIOS,
  PHASE7C_REVIEW_ZIP_NAME,
} from "./phase7c-contract.mjs";
import { PHYSICAL_ASSETS } from "./phase7a-contract.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PHASE7C_AUDIT_SCHEMA = "quantum-hub.phase-7c.territory-proof-human-review.v1.independent-audit";
export const PHASE7C_MANIFEST_SCHEMA = "quantum-hub.phase-7c.territory-proof-human-review.v1.manifest";
export const PHASE7C_GATES_SCHEMA = "quantum-hub.phase-7c.territory-proof-human-review.v1.human-gates";
export const PHASE7C_RECORDING_INVENTORY_SCHEMA = "quantum-hub.phase-7c.territory-proof-human-review.v1.recording-inventory";
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const GATES_PATH = "00-authority/human-gates.json";
export const MAX_FILE_BYTES = 192 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

const required = (relativePath, role) => Object.freeze({ relativePath, role });
export const AUDIT_REQUIRED_PHASE7C_INPUTS = Object.freeze([
  required("00-authority/task-brief.md", "task-authority"),
  required("01-provenance/git-provenance.json", "git-provenance"),
  required("01-provenance/commits.json", "commit-list"),
  required("01-provenance/production.diff", "production-diff"),
  required("02-design/phase-7c-territory-proof-architecture.md", "architecture"),
  required("02-design/phase-7c-reference-study.md", "reference-study"),
  required("02-design/phase-7c-documentary-asset-ledger.md", "documentary-asset-ledger"),
  required("02-design/state-specification.json", "state-specification"),
  required("03-browser/browser-matrix.json", "browser-matrix"),
  required("03-browser/webkit-proxy.json", "webkit-proxy"),
  required("03-recordings/recording-inventory.json", "recording-inventory"),
  required("04-responsive/responsive-matrix.json", "responsive-matrix"),
  required("05-assurance/accessibility.json", "accessibility"),
  required("05-assurance/target-sizes.json", "target-sizes"),
  required("05-assurance/performance.json", "performance"),
  required("05-assurance/lifecycle.json", "lifecycle"),
  required("05-assurance/cls.json", "cycle-attributable-cls"),
  required("05-assurance/network.json", "media-network"),
  required("05-assurance/publication.json", "publication"),
  required("05-assurance/phase4-hashes.json", "phase4-hashes"),
  required("05-assurance/phase7a-regression.json", "phase7a-regression"),
  required("05-assurance/phase7b-regression.json", "phase7b-regression"),
  required("06-deployment/deployment.json", "deployment-binding"),
  required("07-governance/environmental-limitations.json", "environmental-limitations"),
  required("08-audit/prepackage-audit.json", "prepackage-audit"),
]);

const EXPECTED_GATE_RECORDS = Object.freeze(PHASE7C_GATES.map((name) => Object.freeze({ name, decision: "PENDING HUMAN REVIEW" })));
const ROLE_BY_PATH = new Map(AUDIT_REQUIRED_PHASE7C_INPUTS.map(({ relativePath, role }) => [relativePath, role]));
const REQUIRED_PATHS = new Set(AUDIT_REQUIRED_PHASE7C_INPUTS.map(({ relativePath }) => relativePath));
const ALLOWED_TOP_LEVEL = new Set(["00-authority", "01-provenance", "02-design", "03-browser", "03-recordings", "04-responsive", "05-assurance", "06-deployment", "07-governance", "08-audit"]);
const ALLOWED_EXTENSION = /\.(?:json|md|txt|diff|csv|png|jpe?g|webp|mp4)$/i;
const ARCHIVE_EXTENSION = /\.(?:zip|7z|rar|tar|tgz|gz|bz2|xz)$/i;
const FONT_EXTENSION = /\.(?:woff2?|ttf|otf|eot)$/i;
const SOURCE_EXTENSION = /\.(?:astro|[cm]?[jt]sx?|css|scss|sass|less|map|wasm)$/i;
const SOURCE_MEDIA_EXTENSION = /\.(?:mov|mkv|avi|webm|m4v|blend\d*|exr|tiff?)$/i;
const FORBIDDEN_SEGMENT = /^(?:node_modules|src|source|sources|scripts?|raw|raw-media|raw_frames?|traces?|profiles?|private|secrets?|credentials?|\.git|\.astro|\.cache|cache|caches|browser-cache|user data|default|service worker|__pycache__)$/i;
const TEXT_EXTENSION = new Set([".json", ".md", ".txt", ".diff", ".csv"]);
const WINDOWS_ABSOLUTE = /(?:^|[\s"'(=\[])[a-z]:[\\/]/i;
const POSIX_ABSOLUTE = /(?:^|[\s"'(=\[])\/(?:Users|home|tmp|private|root|workspace|workspaces|var\/folders|mnt\/[a-z])(?:\/|\b)/i;
const PRIVATE_MARKER = /(?:^|[\\/])\.codex(?:[\\/]|$)|\b(?:OneDrive|AppData|LocalCache)\b|file:\/\/|\\\\[^\\\s]+\\[^\\\s]+/i;
const SECRET_MARKER = /(?:github_pat_[a-z0-9_]+|gh[pousr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;
const RAW_PHASE4_HASHES = new Set(PHYSICAL_ASSETS
  .filter(([assetPath]) => /public\/media\/cinematic\/phase-4r2\/(?:media|posters)\//.test(assetPath))
  .map(([_assetPath, digest]) => digest));
const REPORTABLE_RECORDING_SCENARIOS = new Set(["documentary-media-network", "lifecycle-ten-cycles"]);

const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_unused, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
}));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function lexicalCompare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function crc32Hex(bytes) {
  return crc32(bytes).toString(16).padStart(8, "0");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.keys(value).sort(lexicalCompare).map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

export function safePhase7CAuditPath(value, label = "Phase 7C ZIP entry") {
  invariant(typeof value === "string" && value.length > 0, `${label} is missing`);
  invariant(!value.includes("\\") && !/[<>:"|?*\x00-\x1f]/.test(value) && !path.posix.isAbsolute(value) && !/^[a-z]:/i.test(value), `${label} must be portable and relative`);
  invariant(path.posix.normalize(value) === value && !value.split("/").some((part) => !part || part === "." || part === ".." || part.startsWith(".")), `${label} is unsafe`);
  invariant(!value.split("/").some((part) => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || /[ .]$/.test(part)), `${label} contains a non-portable segment`);
  invariant(!/%(?:2e|2f|5c)/i.test(value), `${label} contains encoded path reinterpretation`);
  return value;
}

export function assertAllowedPhase7CAuditPath(relativePath) {
  safePhase7CAuditPath(relativePath);
  if (relativePath === IN_ARCHIVE_MANIFEST || relativePath === GATES_PATH) return true;
  const segments = relativePath.split("/");
  invariant(ALLOWED_TOP_LEVEL.has(segments[0]), `entry is outside the Phase 7C evidence topology: ${relativePath}`);
  invariant(!segments.some((segment) => FORBIDDEN_SEGMENT.test(segment)), `forbidden source/cache/private path: ${relativePath}`);
  invariant(ALLOWED_EXTENSION.test(relativePath), `unsupported evidence type: ${relativePath}`);
  invariant(!ARCHIVE_EXTENSION.test(relativePath), `nested archive is forbidden: ${relativePath}`);
  invariant(!FONT_EXTENSION.test(relativePath), `font binary is forbidden: ${relativePath}`);
  invariant(!SOURCE_EXTENSION.test(relativePath), `source payload is forbidden: ${relativePath}`);
  invariant(!SOURCE_MEDIA_EXTENSION.test(relativePath), `raw/source media is forbidden: ${relativePath}`);
  return true;
}

function textForScan(bytes, relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  const data = Buffer.from(bytes);
  return TEXT_EXTENSION.has(extension) || relativePath === IN_ARCHIVE_MANIFEST
    ? data.toString("utf8")
    : (data.toString("latin1").match(/[\x20-\x7e]{32,}/g) ?? []).join("\n");
}

export function assertNoPrivateOrSecretPhase7CAuditPayload(bytes, relativePath) {
  const text = textForScan(bytes, relativePath);
  for (const pattern of [WINDOWS_ABSOLUTE, POSIX_ABSOLUTE, PRIVATE_MARKER, SECRET_MARKER]) {
    invariant(!pattern.test(relativePath) && !pattern.test(text), `privacy or secret scan failed: ${relativePath}`);
  }
  invariant(!TEXT_EXTENSION.has(path.posix.extname(relativePath).toLowerCase()) || !text.includes("\0"), `text payload contains NUL bytes: ${relativePath}`);
  return true;
}

function decodeUtf8(bytes, label) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error(`invalid UTF-8 ZIP name: ${label}`); }
}

export function parsePhase7CStoredZip(archiveInput) {
  const archive = Buffer.from(archiveInput);
  invariant(archive.length >= 22 && archive.length <= MAX_ARCHIVE_BYTES, "Phase 7C ZIP byte boundary differs");
  const eocdOffset = archive.length - 22;
  invariant(archive.readUInt32LE(eocdOffset) === 0x06054b50 && archive.readUInt16LE(eocdOffset + 20) === 0, "Phase 7C ZIP EOCD differs");
  invariant(archive.readUInt16LE(eocdOffset + 4) === 0 && archive.readUInt16LE(eocdOffset + 6) === 0, "multi-disk ZIP is forbidden");
  const count = archive.readUInt16LE(eocdOffset + 10);
  invariant(count === archive.readUInt16LE(eocdOffset + 8) && count >= AUDIT_REQUIRED_PHASE7C_INPUTS.length + 2, "Phase 7C ZIP entry count differs");
  const centralBytes = archive.readUInt32LE(eocdOffset + 12);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  invariant(centralOffset + centralBytes === eocdOffset, "Phase 7C central-directory boundary differs");

  const entries = new Map();
  const folded = new Set();
  const localRanges = [];
  let cursor = centralOffset;
  let previousName = null;
  for (let index = 0; index < count; index += 1) {
    invariant(cursor + 46 <= eocdOffset && archive.readUInt32LE(cursor) === 0x02014b50, "Phase 7C central header differs");
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const dosTime = archive.readUInt16LE(cursor + 12);
    const dosDate = archive.readUInt16LE(cursor + 14);
    const checksum = archive.readUInt32LE(cursor + 16);
    const compressed = archive.readUInt32LE(cursor + 20);
    const uncompressed = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const disk = archive.readUInt16LE(cursor + 34);
    const internal = archive.readUInt16LE(cursor + 36);
    const external = archive.readUInt32LE(cursor + 38);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const centralEnd = cursor + 46 + nameLength + extraLength + commentLength;
    invariant(centralEnd <= eocdOffset && archive.readUInt16LE(cursor + 4) === 0x0314 && archive.readUInt16LE(cursor + 6) === 20 && flags === 0x0800 && method === 0 && dosTime === 0 && dosDate === 33, "Phase 7C ZIP encoding/compression/timestamp differs");
    invariant(extraLength === 0 && commentLength === 0 && disk === 0 && internal === 0 && external === 0 && compressed === uncompressed && uncompressed > 0 && uncompressed <= MAX_FILE_BYTES, "Phase 7C central entry boundary differs");
    const nameBytes = archive.subarray(cursor + 46, cursor + 46 + nameLength);
    const relativePath = decodeUtf8(nameBytes, `central entry ${index}`);
    invariant(Buffer.from(relativePath, "utf8").equals(nameBytes), `ZIP name UTF-8 round-trip differs: ${relativePath}`);
    safePhase7CAuditPath(relativePath);
    invariant(previousName === null || lexicalCompare(previousName, relativePath) < 0, "ZIP entries are not in deterministic lexical order");
    previousName = relativePath;
    const foldedPath = relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    invariant(!entries.has(relativePath) && !folded.has(foldedPath), `duplicate ZIP path: ${relativePath}`);
    folded.add(foldedPath);

    invariant(localOffset + 30 <= centralOffset && archive.readUInt32LE(localOffset) === 0x04034b50 && archive.readUInt16LE(localOffset + 4) === 20, `local ZIP header differs: ${relativePath}`);
    invariant(archive.readUInt16LE(localOffset + 6) === flags && archive.readUInt16LE(localOffset + 8) === method && archive.readUInt16LE(localOffset + 10) === dosTime && archive.readUInt16LE(localOffset + 12) === dosDate, `local/central metadata differs: ${relativePath}`);
    invariant(archive.readUInt32LE(localOffset + 14) === checksum && archive.readUInt32LE(localOffset + 18) === compressed && archive.readUInt32LE(localOffset + 22) === uncompressed, `local/central byte authority differs: ${relativePath}`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    invariant(localExtraLength === 0 && localNameLength === nameLength, `local ZIP name/extra differs: ${relativePath}`);
    const localName = archive.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    invariant(localName.equals(nameBytes), `local/central ZIP name differs: ${relativePath}`);
    const dataStart = localOffset + 30 + localNameLength;
    const dataEnd = dataStart + uncompressed;
    invariant(dataEnd <= centralOffset, `ZIP payload crosses central directory: ${relativePath}`);
    const data = Buffer.from(archive.subarray(dataStart, dataEnd));
    invariant(crc32(data) === checksum, `ZIP CRC32 differs: ${relativePath}`);
    entries.set(relativePath, { data, crc32: checksum.toString(16).padStart(8, "0"), localOffset, dataStart });
    localRanges.push([localOffset, dataEnd]);
    cursor = centralEnd;
  }
  invariant(cursor === eocdOffset, "central directory contains trailing bytes");
  localRanges.sort((left, right) => left[0] - right[0]);
  invariant(localRanges[0]?.[0] === 0 && localRanges.at(-1)?.[1] === centralOffset, "local ZIP region boundary differs");
  for (let index = 1; index < localRanges.length; index += 1) invariant(localRanges[index - 1][1] === localRanges[index][0], "local ZIP entries overlap or contain gaps");
  return Object.freeze({ archive, entries });
}

function parseJson(bytes, relativePath) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error(`invalid JSON payload: ${relativePath}`); }
}

function kindFor(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return "image";
  if (extension === ".mp4") return "video";
  return "document";
}

function roleFor(relativePath) {
  if (relativePath === GATES_PATH) return "human-gates";
  return ROLE_BY_PATH.get(relativePath) ?? (kindFor(relativePath) === "video" ? "recording" : kindFor(relativePath) === "image" ? "visual-evidence" : "supporting-evidence");
}

function inspectPng(bytes, relativePath) {
  const data = Buffer.from(bytes);
  invariant(data.length >= 57 && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")), `PNG signature differs: ${relativePath}`);
  let cursor = 8;
  let ihdr = null;
  let sawIend = false;
  const idat = [];
  while (cursor < data.length) {
    invariant(cursor + 12 <= data.length, `PNG chunk header is truncated: ${relativePath}`);
    const length = data.readUInt32BE(cursor);
    const end = cursor + 12 + length;
    invariant(end <= data.length, `PNG chunk boundary differs: ${relativePath}`);
    const type = data.toString("ascii", cursor + 4, cursor + 8);
    const payload = data.subarray(cursor + 8, cursor + 8 + length);
    invariant(crc32(data.subarray(cursor + 4, cursor + 8 + length)) === data.readUInt32BE(cursor + 8 + length), `PNG chunk CRC differs: ${relativePath}`);
    if (type === "IHDR") { invariant(!ihdr && length === 13 && cursor === 8, `PNG IHDR differs: ${relativePath}`); ihdr = Buffer.from(payload); }
    else if (type === "IDAT") idat.push(Buffer.from(payload));
    else if (type === "IEND") { invariant(length === 0, `PNG IEND differs: ${relativePath}`); sawIend = true; cursor = end; break; }
    cursor = end;
  }
  invariant(ihdr && sawIend && cursor === data.length && idat.length > 0, `PNG structure is incomplete: ${relativePath}`);
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType);
  invariant(width > 0 && height > 0 && width * height <= 100_000_000 && channels && [1, 2, 4, 8, 16].includes(bitDepth), `PNG dimensions or format differs: ${relativePath}`);
  invariant(ihdr[10] === 0 && ihdr[11] === 0 && ihdr[12] === 0, `PNG encoding differs: ${relativePath}`);
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const decoded = inflateSync(Buffer.concat(idat), { maxOutputLength: Math.min(512 * 1024 * 1024, (rowBytes + 1) * height + 1) });
  invariant(decoded.length === (rowBytes + 1) * height, `PNG decoded byte count differs: ${relativePath}`);
  for (let row = 0; row < height; row += 1) invariant(decoded[row * (rowBytes + 1)] <= 4, `PNG scanline filter differs: ${relativePath}`);
  return { path: relativePath, status: "PASS", width, height, decodedBytes: decoded.length };
}

function inspectIsoBmff(bytes, relativePath) {
  const data = Buffer.from(bytes);
  invariant(data.length >= 24, `MP4 is too small: ${relativePath}`);
  let cursor = 0;
  const boxes = [];
  while (cursor < data.length) {
    invariant(cursor + 8 <= data.length, `MP4 box header is truncated: ${relativePath}`);
    let size = data.readUInt32BE(cursor);
    const type = data.toString("ascii", cursor + 4, cursor + 8);
    let header = 8;
    if (size === 1) {
      invariant(cursor + 16 <= data.length, `MP4 extended box is truncated: ${relativePath}`);
      const extended = data.readBigUInt64BE(cursor + 8);
      invariant(extended <= BigInt(Number.MAX_SAFE_INTEGER), `MP4 box is too large: ${relativePath}`);
      size = Number(extended);
      header = 16;
    } else if (size === 0) size = data.length - cursor;
    invariant(size >= header && cursor + size <= data.length && /^[\x20-\x7e]{4}$/.test(type), `MP4 box boundary differs: ${relativePath}`);
    boxes.push(type);
    cursor += size;
  }
  invariant(cursor === data.length && boxes[0] === "ftyp" && boxes.includes("moov") && boxes.includes("mdat"), `MP4 required boxes differ: ${relativePath}`);
  return { boxes };
}

function ffprobeDecoder(bytes, relativePath) {
  const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=format_name,duration", "-of", "json", "pipe:0"], { input: bytes, encoding: "utf8", maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  if (result.error?.code === "ENOENT") return { path: relativePath, status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT", tool: "ffprobe", reason: "ffprobe is not installed or callable" };
  invariant(!result.error && result.status === 0, `ffprobe decode failed: ${relativePath}`);
  const metadata = JSON.parse(result.stdout || "{}");
  invariant(typeof metadata?.format?.format_name === "string", `ffprobe metadata differs: ${relativePath}`);
  return { path: relativePath, status: "PASS", tool: "ffprobe", format: metadata.format.format_name, duration: metadata.format.duration ?? null };
}

function validateGates(document) {
  const expected = { schema: PHASE7C_GATES_SCHEMA, status: "PENDING HUMAN REVIEW", gates: EXPECTED_GATE_RECORDS, phase7D: "NOT AUTHORIZED", main: "NOT MERGED" };
  invariant(sameJson(document, expected), "all six authoritative Phase 7C gates must remain PENDING HUMAN REVIEW");
}

function validateRecordingInventory(document, entries) {
  invariant(document?.schema === PHASE7C_RECORDING_INVENTORY_SCHEMA, "Phase 7C recording inventory schema differs");
  invariant(["PASS", "LIMITATION", "NOT OBSERVED", "NOT AVAILABLE TO EXECUTION ENVIRONMENT"].includes(document.status), "Phase 7C recording inventory status differs");
  invariant(Array.isArray(document.scenarios) && document.scenarios.length === PHASE7C_RECORDING_SCENARIOS.length, "Phase 7C recording scenario count differs");
  document.scenarios.forEach((row, index) => {
    invariant(row?.scenario === PHASE7C_RECORDING_SCENARIOS[index], "Phase 7C recording scenario order differs");
    invariant(["PASS", "LIMITATION", "NOT OBSERVED", "NOT AVAILABLE TO EXECUTION ENVIRONMENT"].includes(row.status) && Array.isArray(row.artifacts), `recording evidence differs: ${row.scenario}`);
    if (row.status === "PASS") invariant(row.artifacts.length > 0, `PASS recording has no bound artifact: ${row.scenario}`);
    for (const artifact of row.artifacts) {
      safePhase7CAuditPath(artifact, `recording artifact for ${row.scenario}`);
      invariant(artifact.startsWith("03-recordings/") && artifact !== "03-recordings/recording-inventory.json", `recording artifact is outside its evidence boundary: ${artifact}`);
      invariant(entries.has(artifact), `recording artifact is absent: ${artifact}`);
    }
    if (row.status === "PASS" && !REPORTABLE_RECORDING_SCENARIOS.has(row.scenario)) invariant(row.artifacts.some((artifact) => artifact.endsWith(".mp4")), `PASS visual recording has no MP4: ${row.scenario}`);
  });
}

export function auditPhase7CPackageBytes({ archiveBytes, mp4Decoder = ffprobeDecoder }) {
  const { archive, entries } = parsePhase7CStoredZip(archiveBytes);
  invariant(entries.has(IN_ARCHIVE_MANIFEST) && entries.has(GATES_PATH), "manifest or human-gate payload is absent");
  const manifestEntry = entries.get(IN_ARCHIVE_MANIFEST);
  const manifest = parseJson(manifestEntry.data, IN_ARCHIVE_MANIFEST);
  invariant(manifest?.schema === PHASE7C_MANIFEST_SCHEMA && manifest.archiveFilename === PHASE7C_REVIEW_ZIP_NAME, "Phase 7C embedded manifest authority differs");
  invariant(manifest.authority?.branch === PHASE7C_BRANCH && manifest.authority?.exactParent === PHASE7C_PARENT && manifest.authority?.frozenMain === PHASE7C_FROZEN_MAIN, "Phase 7C manifest repository authority differs");
  invariant(manifest.authority?.gates === "PENDING HUMAN REVIEW" && manifest.authority?.phase7D === "NOT AUTHORIZED" && manifest.authority?.main === "NOT MERGED", "Phase 7C manifest human authority differs");
  invariant(sameJson(manifest.requiredInputs, AUDIT_REQUIRED_PHASE7C_INPUTS), "Phase 7C required-input manifest differs");
  invariant(Array.isArray(manifest.payloads) && manifest.payloads.length === entries.size - 1, "Phase 7C manifest payload count differs");

  const payloadPaths = new Set(manifest.payloads.map(({ path: payloadPath }) => payloadPath));
  invariant(payloadPaths.size === manifest.payloads.length && !payloadPaths.has(IN_ARCHIVE_MANIFEST), "Phase 7C manifest contains duplicate or recursive payloads");
  for (const requiredPath of REQUIRED_PATHS) invariant(payloadPaths.has(requiredPath), `required payload is absent: ${requiredPath}`);
  invariant(payloadPaths.has(GATES_PATH), "human-gate payload is absent from manifest");
  invariant([...entries.keys()].every((relativePath) => relativePath === IN_ARCHIVE_MANIFEST || payloadPaths.has(relativePath)), "ZIP contains an unmanifested payload");

  const png = [];
  const mp4 = [];
  const verified = [];
  for (const record of manifest.payloads) {
    safePhase7CAuditPath(record.path, "manifest payload path");
    assertAllowedPhase7CAuditPath(record.path);
    const entry = entries.get(record.path);
    invariant(entry, `manifest payload is absent: ${record.path}`);
    assertNoPrivateOrSecretPhase7CAuditPayload(entry.data, record.path);
    invariant(!RAW_PHASE4_HASHES.has(sha256(entry.data)), `raw governed Phase 4 media is forbidden: ${record.path}`);
    invariant(record.bytes === entry.data.length && record.sha256 === sha256(entry.data) && record.crc32 === crc32Hex(entry.data), `payload hash or byte authority differs: ${record.path}`);
    invariant(record.kind === kindFor(record.path) && record.role === roleFor(record.path), `payload kind or role differs: ${record.path}`);
    const extension = path.posix.extname(record.path).toLowerCase();
    if (extension === ".json") {
      const document = parseJson(entry.data, record.path);
      assertNoPrivateOrSecretPhase7CAuditPayload(Buffer.from(JSON.stringify(document)), record.path);
      invariant(PHASE7C_ALLOWED_STATUSES.includes(document?.status), `Phase 7C evidence status taxonomy differs: ${record.path}`);
      invariant(document?.status !== "FAIL", `unresolved FAIL evidence is not packageable: ${record.path}`);
    } else if (extension === ".png") png.push(inspectPng(entry.data, record.path));
    else if (extension === ".mp4") {
      const structure = inspectIsoBmff(entry.data, record.path);
      const decoded = mp4Decoder(entry.data, record.path);
      invariant(decoded && ["PASS", "NOT AVAILABLE TO EXECUTION ENVIRONMENT"].includes(decoded.status), `MP4 decoder result differs: ${record.path}`);
      mp4.push({ ...decoded, structureStatus: "PASS", boxes: structure.boxes });
    }
    verified.push({ path: record.path, bytes: entry.data.length, sha256: sha256(entry.data), crc32: entry.crc32, status: "PASS" });
  }

  assertNoPrivateOrSecretPhase7CAuditPayload(manifestEntry.data, IN_ARCHIVE_MANIFEST);
  validateGates(parseJson(entries.get(GATES_PATH).data, GATES_PATH));
  validateRecordingInventory(parseJson(entries.get("03-recordings/recording-inventory.json").data, "03-recordings/recording-inventory.json"), entries);
  invariant(manifest.summary?.payloadCount === verified.length && manifest.summary?.payloadBytes === verified.reduce((sum, row) => sum + row.bytes, 0), "Phase 7C manifest summary arithmetic differs");
  invariant(manifest.summary?.imageCount === manifest.payloads.filter(({ kind }) => kind === "image").length && manifest.summary?.recordingCount === mp4.length, "Phase 7C manifest media arithmetic differs");

  const mp4Status = mp4.length === 0 ? "NOT OBSERVED" : mp4.every(({ status }) => status === "PASS") ? "PASS" : "NOT AVAILABLE TO EXECUTION ENVIRONMENT";
  return Object.freeze({
    schema: PHASE7C_AUDIT_SCHEMA,
    status: "PASS",
    archive: { filename: PHASE7C_REVIEW_ZIP_NAME, bytes: archive.length, sha256: sha256(archive), entryCount: entries.size, crc: "PASS" },
    embeddedManifest: { path: IN_ARCHIVE_MANIFEST, bytes: manifestEntry.data.length, sha256: sha256(manifestEntry.data), status: "PASS" },
    payloadVerification: { status: "PASS", count: verified.length, everyHashAndByteCountMatched: true, entries: verified },
    pathSafety: { status: "PASS", duplicatePaths: false, unicodeFoldedDuplicates: false, traversalPaths: false },
    privacyAndSecrets: { status: "PASS", privatePaths: false, credentials: false },
    mediaDecode: { png: { status: png.length ? "PASS" : "NOT OBSERVED", count: png.length, entries: png }, mp4: { status: mp4Status, count: mp4.length, entries: mp4 } },
    prohibitedCategories: { status: "PASS", nestedArchives: false, packagedFonts: false, sourceArchives: false, rawPhase4Media: false, sourceMedia: false, browserCaches: false },
    humanGates: EXPECTED_GATE_RECORDS,
    phase7D: "NOT AUTHORIZED",
    main: "NOT MERGED",
  });
}

export function assertExternalPhase7CAuditPath(candidate, label = "audit path", { repositoryRoot = ROOT, temporaryRoot = os.tmpdir() } = {}) {
  const absolute = path.resolve(candidate);
  invariant(!isWithin(repositoryRoot, absolute), `${label} must remain outside Git`);
  invariant(!isWithin(temporaryRoot, absolute), `${label} must not use the transient system temporary directory`);
  return absolute;
}

async function assertRealFile(filename, label) {
  const status = await lstat(filename);
  invariant(status.isFile() && !status.isSymbolicLink() && path.resolve(await realpath(filename)) === path.resolve(filename), `${label} must be a real file`);
}

async function assertRealDirectory(directory, label) {
  const status = await lstat(directory);
  invariant(status.isDirectory() && !status.isSymbolicLink() && path.resolve(await realpath(directory)) === path.resolve(directory), `${label} must be an existing real directory`);
}

async function exclusiveWrite(filename, bytes) {
  const handle = await open(filename, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

export async function auditPhase7CPackageFile({ zipPath, reportPath, boundaryOptions = {}, mp4Decoder }) {
  const absoluteZip = assertExternalPhase7CAuditPath(zipPath, "--zip", boundaryOptions);
  const absoluteReport = assertExternalPhase7CAuditPath(reportPath, "--report", boundaryOptions);
  invariant(path.basename(absoluteZip) === PHASE7C_REVIEW_ZIP_NAME, `ZIP filename must be ${PHASE7C_REVIEW_ZIP_NAME}`);
  await assertRealFile(absoluteZip, "Phase 7C ZIP");
  await assertRealDirectory(path.dirname(absoluteReport), "audit report parent");
  const report = auditPhase7CPackageBytes({ archiveBytes: await readFile(absoluteZip), ...(mp4Decoder ? { mp4Decoder } : {}) });
  await exclusiveWrite(absoluteReport, Buffer.from(stableJson(report)));
  return Object.freeze({ ...report, zipPath: absoluteZip, reportPath: absoluteReport });
}

export function parseArguments(argv) {
  const options = { zipPath: null, reportPath: null, selfTest: false, help: false };
  const next = (index, flag) => {
    const value = argv[index + 1];
    invariant(value && !value.startsWith("--"), `${flag} requires a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help") options.help = true;
    else if (flag === "--zip") options.zipPath = next(index++, flag);
    else if (flag === "--report") options.reportPath = next(index++, flag);
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.selfTest && !options.help) {
    invariant(options.zipPath, "--zip is required");
    invariant(options.reportPath, "--report is required");
  }
  return options;
}

export function runSelfTest() {
  invariant(AUDIT_REQUIRED_PHASE7C_INPUTS.length === REQUIRED_PATHS.size, "independent Phase 7C required paths are not unique");
  invariant(EXPECTED_GATE_RECORDS.length === 6 && EXPECTED_GATE_RECORDS.every(({ decision }) => decision === "PENDING HUMAN REVIEW"), "independent Phase 7C human-gate authority drifted");
  return Object.freeze({ schema: PHASE7C_AUDIT_SCHEMA, status: "PASS", reviewZipName: PHASE7C_REVIEW_ZIP_NAME, requiredInputs: AUDIT_REQUIRED_PHASE7C_INPUTS.length, gates: EXPECTED_GATE_RECORDS.length });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/audit-phase7c-package.mjs --zip <external phase-7c-territory-proof-threshold-human-review.zip> --report <fresh external audit.json>\n");
    return;
  }
  if (options.selfTest) process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(await auditPhase7CPackageFile(options), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { process.stderr.write(`Phase 7C independent package audit FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
}
