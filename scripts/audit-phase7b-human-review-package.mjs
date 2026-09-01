import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PHASE7B_BRANCH,
  PHASE7B_CORE_VIEWPORTS,
  PHASE7B_FROZEN_MAIN,
  PHASE7B_GATES,
  PHASE7B_MACRO_STATES,
  PHASE7B_METHOD_STAGES,
  PHASE7B_PARENT,
  PHASE7B_PRODUCTION_PATHS,
  PHASE7B_RECORDING_SCENARIOS,
  PHASE7B_REVIEW_ZIP_NAME,
} from "./phase7b-contract.mjs";
import { PHYSICAL_ASSETS } from "./phase7a-contract.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PHASE7B_AUDIT_SCHEMA = "quantum-hub.phase-7b.operating-field-human-review.v1.independent-audit";
export const PHASE7B_MANIFEST_SCHEMA = "quantum-hub.phase-7b.operating-field-human-review.v1.manifest";
export const PHASE7B_GATES_SCHEMA = "quantum-hub.phase-7b.operating-field-human-review.v1.human-gates";
export const PHASE7B_PROVENANCE_SCHEMA = "quantum-hub.phase-7b.operating-field-human-review.v1.provenance";
export const PHASE7B_COMMITS_SCHEMA = "quantum-hub.phase-7b.operating-field-human-review.v1.commits";
export const PHASE7B_STAGE_SPEC_SCHEMA = "quantum-hub.phase-7b.operating-field-human-review.v1.stage-specification";
export const PHASE7B_PREPACKAGE_AUDIT_SCHEMA = "quantum-hub.phase-7b.operating-field-human-review.v1.prepackage-audit";
export const PHASE7B_INSTALLED_CHROME_200_SCHEMA = "quantum-hub.phase-7b.installed-chrome-native-200.v1";
export const PHASE7B_NATIVE_200_LIMITATION_SCHEMA = "quantum-hub.phase-7b.native-200-engine-limitation.v1";
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const MAX_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

const required = (relativePath, role) => Object.freeze({ relativePath, role });
export const AUDIT_PHASE7B_STANDARD_RECORDING_SCENARIOS = Object.freeze(PHASE7B_RECORDING_SCENARIOS.filter((scenario) => scenario !== "installed-chrome-200-percent"));
export const AUDIT_PHASE7B_RECORDING_EVIDENCE_PATHS = Object.freeze(
  ["chromium", "firefox"].flatMap((engine) => AUDIT_PHASE7B_STANDARD_RECORDING_SCENARIOS.map((scenario) => `03-recordings/${engine}-${scenario}.mp4`)),
);
export const AUDIT_INSTALLED_CHROME_RECORDING_PATH = "installed-chrome-200/installed-chrome-native-200.mp4";
export const AUDIT_INSTALLED_CHROME_SCREENSHOT_PATH = "installed-chrome-200/chrome-visible-zoom-200.png";
export const AUDIT_INSTALLED_CHROME_AUTHORITY_PATH = "installed-chrome-200/installed-chrome-native-200.json";
export const AUDIT_FIREFOX_NATIVE_200_LIMITATION_PATH = "installed-chrome-200/firefox-native-200-limitation.json";
export const AUDIT_REQUIRED_PHASE7B_EVIDENCE = Object.freeze([
  required("00-authority/task-brief.md", "task-brief"),
  required("00-authority/human-gates.json", "human-gates"),
  required("01-provenance/git-provenance.json", "git-provenance"),
  required("01-provenance/commits.json", "commit-list"),
  required("01-provenance/production.diff", "production-diff"),
  required("02-design/phase-7b-operating-field-architecture.md", "architecture"),
  required("02-design/phase-7b-reference-study.md", "reference-study"),
  required("02-design/stage-state-specification.json", "stage-state-specification"),
  required("03-browser/browser-matrix.json", "browser-matrix"),
  required("03-browser/webkit-proxy.json", "webkit-proxy"),
  ...AUDIT_PHASE7B_RECORDING_EVIDENCE_PATHS.map((relativePath) => required(relativePath, "recording")),
  required("04-responsive/responsive-matrix.json", "responsive-matrix"),
  required("04-responsive/desktop.png", "screenshot"),
  required("04-responsive/short-desktop.png", "screenshot"),
  required("04-responsive/tablet.png", "screenshot"),
  required("04-responsive/mobile.png", "screenshot"),
  required("04-responsive/narrow-320.png", "screenshot"),
  required("04-responsive/short-landscape.png", "screenshot"),
  required("05-fallback/fallback-report.json", "fallback-report"),
  required("06-assurance/accessibility.json", "accessibility"),
  required("06-assurance/performance.json", "performance"),
  required("06-assurance/lifecycle.json", "lifecycle"),
  required("06-assurance/network.json", "network"),
  required("06-assurance/publication.json", "publication"),
  required("06-assurance/phase4-hashes.json", "phase4-hashes"),
  required("06-assurance/phase7a-regression.json", "phase7a-regression"),
  required("07-deployment/deployment.json", "deployment"),
  required("08-governance/environmental-limitations.json", "environmental-limitations"),
  required("09-audit/prepackage-audit.json", "prepackage-audit"),
  required(AUDIT_INSTALLED_CHROME_RECORDING_PATH, "installed-chrome-native-200-recording"),
  required(AUDIT_INSTALLED_CHROME_SCREENSHOT_PATH, "installed-chrome-native-200-screenshot"),
  required(AUDIT_INSTALLED_CHROME_AUTHORITY_PATH, "installed-chrome-native-200-authority"),
  required(AUDIT_FIREFOX_NATIVE_200_LIMITATION_PATH, "firefox-native-200-limitation"),
]);

const ROLE_BY_PATH = new Map(AUDIT_REQUIRED_PHASE7B_EVIDENCE.map(({ relativePath, role }) => [relativePath, role]));
const GATE_RECORDS = Object.freeze(PHASE7B_GATES.map((name) => Object.freeze({ name, decision: "PENDING HUMAN REVIEW" })));
const HASH_40 = /^[0-9a-f]{40}$/;
const ARCHIVE_EXTENSION = /\.(?:zip|7z|rar|tar|tgz|gz|bz2|xz)$/i;
const FONT_EXTENSION = /\.(?:woff2?|ttf|otf|eot)$/i;
const SOURCE_EXTENSION = /\.(?:astro|[cm]?[jt]sx?|css|scss|sass|less|map|wasm)$/i;
const SOURCE_MEDIA_EXTENSION = /\.(?:mov|mkv|avi|webm|m4v|blend|exr|tiff?)$/i;
const FORBIDDEN_SEGMENT = /^(?:node_modules|src|source|sources|raw|raw-media|raw_frames?|traces?|profiles?|private|secrets?|credentials?|\.git|\.astro|\.cache|cache|code cache|gpucache|browser-cache|user data|default|service worker|__pycache__)$/i;
const WINDOWS_ABSOLUTE = /(?:^|[\s"'(=\[])[a-z]:[\\/]/i;
const POSIX_ABSOLUTE = /(?:^|[\s"'(=\[])\/(?:Users|home|tmp|private|root|workspace|workspaces|var\/folders|mnt\/[a-z])(?:\/|\b)/i;
const PRIVATE_MARKER = /(?:^|[\\/])\.codex(?:[\\/]|$)|\b(?:OneDrive|AppData|LocalCache)\b|file:\/\/|\\\\[^\\\s]+\\[^\\\s]+/i;
const SECRET_MARKER = /(?:github_pat_[a-z0-9_]+|gh[pousr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;
const RAW_PHASE4_HASHES = new Set(PHYSICAL_ASSETS.map(([, hash]) => hash));
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".diff", ".csv"]);
const PNG_PATHS = Object.freeze(AUDIT_REQUIRED_PHASE7B_EVIDENCE.filter(({ relativePath }) => relativePath.endsWith(".png")).map(({ relativePath }) => relativePath));
const MP4_PATHS = Object.freeze(AUDIT_REQUIRED_PHASE7B_EVIDENCE.filter(({ relativePath }) => relativePath.endsWith(".mp4")).map(({ relativePath }) => relativePath));
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function lexicalCompare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
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

function parseJson(bytes, relativePath) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error(`invalid JSON payload: ${relativePath}`); }
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function safePhase7BAuditPath(value, label = "Phase 7B ZIP entry") {
  invariant(typeof value === "string" && value.length > 0, `${label} is missing`);
  invariant(!value.includes("\\") && !value.includes("\0") && !path.posix.isAbsolute(value) && !/^[a-z]:/i.test(value), `${label} must be portable and relative`);
  invariant(path.posix.normalize(value) === value && !value.split("/").some((part) => !part || part === "." || part === ".."), `${label} is unsafe`);
  invariant(!/%(?:2e|2f|5c)/i.test(value), `${label} contains encoded path reinterpretation`);
  return value;
}

export function assertAllowedPhase7BAuditPath(relativePath) {
  safePhase7BAuditPath(relativePath);
  invariant(relativePath !== IN_ARCHIVE_MANIFEST, `${IN_ARCHIVE_MANIFEST} is reserved`);
  invariant(!relativePath.split("/").some((segment) => FORBIDDEN_SEGMENT.test(segment)), `forbidden source/cache/private path: ${relativePath}`);
  invariant(!ARCHIVE_EXTENSION.test(relativePath) && !FONT_EXTENSION.test(relativePath) && !SOURCE_EXTENSION.test(relativePath) && !SOURCE_MEDIA_EXTENSION.test(relativePath), `forbidden payload class: ${relativePath}`);
  invariant(ROLE_BY_PATH.has(relativePath), `entry is outside the independent Phase 7B topology: ${relativePath}`);
  return true;
}

function textForScan(bytes, relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  const data = Buffer.from(bytes);
  return TEXT_EXTENSIONS.has(extension) || relativePath === IN_ARCHIVE_MANIFEST
    ? data.toString("utf8")
    : (data.toString("latin1").match(/[\x20-\x7e]{32,}/g) ?? []).join("\n");
}

export function assertNoPrivateOrSecretPhase7BAuditPayload(bytes, relativePath) {
  const text = textForScan(bytes, relativePath);
  for (const pattern of [WINDOWS_ABSOLUTE, POSIX_ABSOLUTE, PRIVATE_MARKER, SECRET_MARKER]) {
    invariant(!pattern.test(relativePath) && !pattern.test(text), `privacy or secret scan failed: ${relativePath}`);
  }
  invariant(!TEXT_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase()) || !text.includes("\0"), `text payload contains NUL bytes: ${relativePath}`);
}

function decodeUtf8(bytes, label) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error(`invalid UTF-8 ZIP name: ${label}`); }
}

export function parsePhase7BStoredZip(archiveInput) {
  const archive = Buffer.from(archiveInput);
  invariant(archive.length >= 22 && archive.length <= MAX_ARCHIVE_BYTES, "Phase 7B ZIP byte boundary differs");
  const eocdOffset = archive.length - 22;
  invariant(archive.readUInt32LE(eocdOffset) === 0x06054b50 && archive.readUInt16LE(eocdOffset + 20) === 0, "Phase 7B ZIP EOCD differs");
  invariant(archive.readUInt16LE(eocdOffset + 4) === 0 && archive.readUInt16LE(eocdOffset + 6) === 0, "multi-disk ZIP is forbidden");
  const count = archive.readUInt16LE(eocdOffset + 10);
  invariant(count === archive.readUInt16LE(eocdOffset + 8) && count === AUDIT_REQUIRED_PHASE7B_EVIDENCE.length + 1, "Phase 7B ZIP entry count differs");
  const centralBytes = archive.readUInt32LE(eocdOffset + 12);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  invariant(centralOffset + centralBytes === eocdOffset, "Phase 7B central-directory boundary differs");

  const entries = new Map();
  const localRanges = [];
  let cursor = centralOffset;
  let previousName = null;
  for (let index = 0; index < count; index += 1) {
    invariant(cursor + 46 <= eocdOffset && archive.readUInt32LE(cursor) === 0x02014b50, "Phase 7B central header differs");
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
    invariant(centralEnd <= eocdOffset && archive.readUInt16LE(cursor + 4) === 0x0314 && archive.readUInt16LE(cursor + 6) === 20 && flags === 0x0800 && method === 0 && dosTime === 0 && dosDate === 33, "Phase 7B ZIP encoding/compression/timestamp differs");
    invariant(extraLength === 0 && commentLength === 0 && disk === 0 && internal === 0 && external === 0 && compressed === uncompressed && uncompressed > 0 && uncompressed <= MAX_FILE_BYTES, "Phase 7B central entry boundary differs");
    const nameBytes = archive.subarray(cursor + 46, cursor + 46 + nameLength);
    const relativePath = decodeUtf8(nameBytes, `central entry ${index}`);
    invariant(Buffer.from(relativePath, "utf8").equals(nameBytes), `ZIP name UTF-8 round-trip differs: ${relativePath}`);
    safePhase7BAuditPath(relativePath);
    invariant(previousName === null || lexicalCompare(previousName, relativePath) < 0, "ZIP entries are not in deterministic lexical order");
    previousName = relativePath;
    invariant(!entries.has(relativePath), `duplicate ZIP path: ${relativePath}`);

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
    invariant(dataEnd <= centralOffset, `ZIP payload crosses the central directory: ${relativePath}`);
    const data = Buffer.from(archive.subarray(dataStart, dataEnd));
    invariant(crc32(data) === checksum, `ZIP CRC32 differs: ${relativePath}`);
    entries.set(relativePath, { data, crc32: checksum.toString(16).padStart(8, "0"), localOffset });
    localRanges.push([localOffset, dataEnd]);
    cursor = centralEnd;
  }
  invariant(cursor === eocdOffset, "central directory contains trailing bytes");
  localRanges.sort((left, right) => left[0] - right[0]);
  invariant(localRanges[0]?.[0] === 0 && localRanges.at(-1)?.[1] === centralOffset, "local ZIP region boundary differs");
  for (let index = 1; index < localRanges.length; index += 1) invariant(localRanges[index - 1][1] === localRanges[index][0], "local ZIP entries overlap or contain gaps");
  return Object.freeze({ archive, entries });
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
  invariant(width > 0 && height > 0 && width <= 100_000 && height <= 100_000 && width * height <= 100_000_000 && channels && [1, 2, 4, 8, 16].includes(bitDepth) && ihdr[10] === 0 && ihdr[11] === 0 && ihdr[12] === 0, `PNG dimensions or format differ: ${relativePath}`);
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: Math.min(512 * 1024 * 1024, (rowBytes + 1) * height + 1) });
  invariant(inflated.length === (rowBytes + 1) * height, `PNG decoded byte count differs: ${relativePath}`);
  for (let row = 0; row < height; row += 1) invariant(inflated[row * (rowBytes + 1)] <= 4, `PNG scanline filter differs: ${relativePath}`);
  return { path: relativePath, status: "PASS", width, height, channels, bitDepth, decodedBytes: inflated.length };
}

function inspectMp4(bytes, relativePath) {
  const data = Buffer.from(bytes);
  invariant(data.length >= 24, `MP4 is too small: ${relativePath}`);
  const boxTypes = [];
  let cursor = 0;
  while (cursor < data.length) {
    invariant(cursor + 8 <= data.length, `MP4 box header is truncated: ${relativePath}`);
    let size = data.readUInt32BE(cursor);
    const type = data.toString("ascii", cursor + 4, cursor + 8);
    let header = 8;
    if (size === 1) { invariant(cursor + 16 <= data.length, `MP4 extended box is truncated: ${relativePath}`); const extended = data.readBigUInt64BE(cursor + 8); invariant(extended <= BigInt(Number.MAX_SAFE_INTEGER), `MP4 box is too large: ${relativePath}`); size = Number(extended); header = 16; }
    else if (size === 0) size = data.length - cursor;
    invariant(size >= header && cursor + size <= data.length, `MP4 box boundary differs: ${relativePath}`);
    boxTypes.push(type);
    cursor += size;
  }
  invariant(cursor === data.length && boxTypes[0] === "ftyp" && boxTypes.includes("moov") && boxTypes.includes("mdat"), `MP4 ISO-BMFF authority differs: ${relativePath}`);
  return { path: relativePath, status: "PASS", container: "mp4", boxTypes };
}

function validateProductionDiff(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  const observed = [...text.matchAll(/^diff --git a\/(.+?) b\/(.+?)$/gm)].map((match) => { invariant(match[1] === match[2], "production diff rename is unauthorized"); return match[1]; }).sort(lexicalCompare);
  invariant(observed.length === PHASE7B_PRODUCTION_PATHS.length && sameJson(observed, [...PHASE7B_PRODUCTION_PATHS].sort(lexicalCompare)), "production diff path authority differs");
}

function validateNativeZoomAuthority(entries) {
  const installed = parseJson(entries.get(AUDIT_INSTALLED_CHROME_AUTHORITY_PATH).data, AUDIT_INSTALLED_CHROME_AUTHORITY_PATH);
  invariant(installed?.schema === PHASE7B_INSTALLED_CHROME_200_SCHEMA && installed.status === "PASS" && installed.browser === "Google Chrome" && installed.genuineInstalledChrome === true && installed.nativeZoomPercent === 200 && installed.visibleZoomConfirmation === "Zoom: 200%", "genuine installed-Chrome 200 authority differs");
  for (const [binding, expectedPath] of [[installed.recording, AUDIT_INSTALLED_CHROME_RECORDING_PATH], [installed.screenshot, AUDIT_INSTALLED_CHROME_SCREENSHOT_PATH]]) {
    const entry = entries.get(expectedPath);
    invariant(binding?.path === path.posix.basename(expectedPath) && binding.bytes === entry.data.length && binding.sha256 === sha256(entry.data), `installed-Chrome native-200 evidence binding differs: ${expectedPath}`);
  }
  const firefox = parseJson(entries.get(AUDIT_FIREFOX_NATIVE_200_LIMITATION_PATH).data, AUDIT_FIREFOX_NATIVE_200_LIMITATION_PATH);
  invariant(firefox?.schema === PHASE7B_NATIVE_200_LIMITATION_SCHEMA && firefox.status === "LIMITATION" && firefox.engine === "firefox" && firefox.classification === "NOT APPLICABLE" && firefox.nativeZoomPercent === 200 && firefox.recording === null && typeof firefox.reason === "string" && firefox.reason.length >= 24, "Firefox native-Chrome-zoom limitation authority differs");
}

function validateAuthorities(entries) {
  const document = (relativePath) => parseJson(entries.get(relativePath).data, relativePath);
  const gates = document("00-authority/human-gates.json");
  invariant(gates?.schema === PHASE7B_GATES_SCHEMA && gates.status === "PENDING HUMAN REVIEW" && sameJson(gates.gates, GATE_RECORDS), "all six human gates must remain PENDING HUMAN REVIEW");
  const provenance = document("01-provenance/git-provenance.json");
  invariant(provenance?.schema === PHASE7B_PROVENANCE_SCHEMA && provenance.status === "PASS" && provenance.branch === PHASE7B_BRANCH && provenance.parent === PHASE7B_PARENT && HASH_40.test(provenance.head ?? "") && provenance.head !== provenance.parent, "Phase 7B provenance differs");
  invariant(provenance.localMain === PHASE7B_FROZEN_MAIN && provenance.originMain === PHASE7B_FROZEN_MAIN && provenance.mergeCount === 0 && provenance.acceptedPhase6Ancestry === true && provenance.acceptedPhase7AAncestry === true && provenance.worktreeClean === true && provenance.upstreamParity === true, "Phase 7B provenance safety differs");
  invariant(Array.isArray(provenance.commits) && provenance.commits.length > 0, "commit chain is empty");
  provenance.commits.forEach((commit, index) => invariant(HASH_40.test(commit?.hash ?? "") && HASH_40.test(commit?.parent ?? "") && commit.parent === (index === 0 ? PHASE7B_PARENT : provenance.commits[index - 1].hash) && typeof commit.subject === "string" && commit.subject.length > 0, "commit chain differs"));
  invariant(provenance.commits.at(-1).hash === provenance.head, "final commit differs");
  const commits = document("01-provenance/commits.json");
  invariant(commits?.schema === PHASE7B_COMMITS_SCHEMA && commits.status === "PASS" && sameJson(commits.commits, provenance.commits), "complete commit list differs");
  validateProductionDiff(entries.get("01-provenance/production.diff").data);

  const task = entries.get("00-authority/task-brief.md").data.toString("utf8");
  const architecture = entries.get("02-design/phase-7b-operating-field-architecture.md").data.toString("utf8");
  const references = entries.get("02-design/phase-7b-reference-study.md").data.toString("utf8");
  invariant(/PHASE 7B/i.test(task) && /ONE WORKPIECE CHANGES STATE/i.test(task) && /PENDING HUMAN REVIEW/i.test(task), "task brief differs");
  invariant(/ONE WORKPIECE CHANGES STATE/i.test(architecture) && /no-JavaScript/i.test(architecture), "architecture authority differs");
  invariant(/reference/i.test(references) && /No third-party source/i.test(references), "reference authority differs");
  const stages = document("02-design/stage-state-specification.json");
  invariant(stages?.schema === PHASE7B_STAGE_SPEC_SCHEMA && stages.status === "PASS" && stages.persistentWorkpiece === true && stages.historyRetained === true && sameJson(stages.macroStates, PHASE7B_MACRO_STATES) && sameJson(stages.methodStages, PHASE7B_METHOD_STAGES), "stage-state specification differs");
  const browser = document("03-browser/browser-matrix.json");
  invariant(browser?.status === "PASS" && sameJson(browser.engines, ["chromium", "firefox", "webkit-proxy"]) && sameJson(browser.scenarios, PHASE7B_RECORDING_SCENARIOS), "browser matrix differs");
  const webkit = document("03-browser/webkit-proxy.json");
  invariant(["PASS", "LIMITATION"].includes(webkit?.status) && /WEBKIT PROXY/i.test(webkit.classification ?? "") && webkit.physicalSafari === false, "WebKit classification differs");
  const responsive = document("04-responsive/responsive-matrix.json");
  invariant(responsive?.status === "PASS" && sameJson(responsive.viewports, PHASE7B_CORE_VIEWPORTS), "responsive matrix differs");
  validateNativeZoomAuthority(entries);
  for (const relativePath of ["05-fallback/fallback-report.json", "06-assurance/accessibility.json", "06-assurance/performance.json", "06-assurance/lifecycle.json", "06-assurance/network.json", "06-assurance/publication.json", "06-assurance/phase7a-regression.json", "07-deployment/deployment.json"]) invariant(document(relativePath)?.status === "PASS", `${relativePath} must record PASS`);
  const phase4 = document("06-assurance/phase4-hashes.json");
  invariant(phase4?.status === "PASS" && Array.isArray(phase4.assets) && sameJson(phase4.assets.map((row) => [row.path ?? row.relativePath, row.sha256]), PHYSICAL_ASSETS), "Phase 4 exact hashes differ");
  const phase7a = document("06-assurance/phase7a-regression.json");
  invariant(phase7a.baseline === PHASE7B_PARENT && phase7a.visualRegression === "PASS", "Phase 7A regression authority differs");
  const deployment = document("07-deployment/deployment.json");
  invariant(deployment.head === provenance.head && deployment.deployedSha === provenance.head && typeof deployment.deploymentId === "string" && deployment.deploymentId.length > 0 && /^https:\/\//.test(deployment.immutablePreview ?? "") && /^https:\/\//.test(deployment.branchPreview ?? "") && deployment.localDistParity === "PASS", "deployment binding differs");
  const limitations = document("08-governance/environmental-limitations.json");
  invariant(limitations?.status === "DECLARED" && Array.isArray(limitations.limitations), "environmental limitations differ");
  const prepackage = document("09-audit/prepackage-audit.json");
  invariant(prepackage?.schema === PHASE7B_PREPACKAGE_AUDIT_SCHEMA && prepackage.status === "PASS" && prepackage.auditedPayloadCount === AUDIT_REQUIRED_PHASE7B_EVIDENCE.length - 1 && prepackage.finalPayloadCount === AUDIT_REQUIRED_PHASE7B_EVIDENCE.length, "prepackage audit differs");
  invariant(prepackage.mediaDecode?.images?.status === "PASS" && prepackage.mediaDecode.images.count === PNG_PATHS.length && prepackage.mediaDecode?.recordings?.status === "PASS" && prepackage.mediaDecode.recordings.count === MP4_PATHS.length, "prepackage media decode metadata differs");
  return { gates, provenance };
}

function recordFor(relativePath, entry) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return { path: relativePath, role: ROLE_BY_PATH.get(relativePath), kind: extension === ".png" ? "image" : extension === ".mp4" ? "video" : "document", bytes: entry.data.length, sha256: sha256(entry.data), crc32: entry.crc32 };
}

function expectedManifest(payloads) {
  return {
    schema: PHASE7B_MANIFEST_SCHEMA,
    archiveFilename: PHASE7B_REVIEW_ZIP_NAME,
    deterministicEncoding: "canonical ZIP32 stored UTF-8; lexical entry order; DOS 1980-01-01 00:00:00",
    authority: { branch: PHASE7B_BRANCH, exactParent: PHASE7B_PARENT, gates: "PENDING HUMAN REVIEW" },
    requiredEvidence: AUDIT_REQUIRED_PHASE7B_EVIDENCE,
    payloads,
    summary: { payloadCount: payloads.length, payloadBytes: payloads.reduce((sum, item) => sum + item.bytes, 0), imageCount: payloads.filter(({ kind }) => kind === "image").length, recordingCount: payloads.filter(({ kind }) => kind === "video").length },
    exclusions: ["source archives", "node_modules and browser caches", "raw Phase 4 media", "font binaries", "private paths and credentials", "nested archives"],
  };
}

function inspectArchive(archiveBytes) {
  const parsed = parsePhase7BStoredZip(archiveBytes);
  invariant(parsed.entries.has(IN_ARCHIVE_MANIFEST), `ZIP omits ${IN_ARCHIVE_MANIFEST}`);
  const payloadEntries = new Map();
  const folded = new Set();
  for (const [relativePath, entry] of parsed.entries) {
    const foldedPath = relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    invariant(!folded.has(foldedPath), `case-folded duplicate ZIP path: ${relativePath}`);
    folded.add(foldedPath);
    assertNoPrivateOrSecretPhase7BAuditPayload(entry.data, relativePath);
    if (relativePath === IN_ARCHIVE_MANIFEST) continue;
    assertAllowedPhase7BAuditPath(relativePath);
    invariant(!RAW_PHASE4_HASHES.has(sha256(entry.data)), `raw governed Phase 4 payload is forbidden: ${relativePath}`);
    payloadEntries.set(relativePath, entry);
  }
  invariant(payloadEntries.size === AUDIT_REQUIRED_PHASE7B_EVIDENCE.length && AUDIT_REQUIRED_PHASE7B_EVIDENCE.every(({ relativePath }) => payloadEntries.has(relativePath)), "independent Phase 7B topology differs");
  const authority = validateAuthorities(payloadEntries);
  const images = PNG_PATHS.map((relativePath) => inspectPng(payloadEntries.get(relativePath).data, relativePath));
  const recordings = MP4_PATHS.map((relativePath) => inspectMp4(payloadEntries.get(relativePath).data, relativePath));
  const payloads = [...payloadEntries].map(([relativePath, entry]) => recordFor(relativePath, entry));
  const manifestEntry = parsed.entries.get(IN_ARCHIVE_MANIFEST);
  const manifest = parseJson(manifestEntry.data, IN_ARCHIVE_MANIFEST);
  invariant(Buffer.from(stableJson(manifest)).equals(manifestEntry.data), "embedded manifest is not canonical JSON");
  invariant(sameJson(manifest, expectedManifest(payloads)), "embedded manifest differs from independently reconstructed bytes, hashes, roles, or topology");
  const crcRows = [...parsed.entries].map(([entryPath, entry]) => ({ path: entryPath, crc32: entry.crc32 }));
  return Object.freeze({
    schema: PHASE7B_AUDIT_SCHEMA,
    status: "PASS",
    archive: { filename: PHASE7B_REVIEW_ZIP_NAME, bytes: parsed.archive.length, sha256: sha256(parsed.archive), entryCount: parsed.entries.size },
    embeddedManifest: { path: IN_ARCHIVE_MANIFEST, bytes: manifestEntry.data.length, sha256: sha256(manifestEntry.data) },
    crc32: { status: "PASS", entryCount: parsed.entries.size, aggregateSha256: sha256(Buffer.from(stableJson(crcRows))) },
    payloads: payloads.map((payload) => ({ ...payload, byteStatus: "PASS", sha256Status: "PASS", crc32Status: "PASS" })),
    mediaDecode: { images: { status: "PASS", count: images.length, decoder: "independent PNG chunk CRC + zlib scanline decode", files: images }, recordings: { status: "PASS", count: recordings.length, decoder: "independent ISO-BMFF structural decode", files: recordings } },
    humanGates: authority.gates.gates,
    provenance: { branch: authority.provenance.branch, parent: authority.provenance.parent, head: authority.provenance.head, main: authority.provenance.localMain },
    security: { pathSafety: "PASS", traversal: "PASS", absolutePaths: "PASS", duplicates: "PASS", symlinks: "PASS", nestedArchives: "PASS", fonts: "PASS", sourceArchives: "PASS", sourceMedia: "PASS", rawPhase4: "PASS", nodeModulesAndCaches: "PASS", privacyAndSecrets: "PASS" },
    checks: { localHeaders: "PASS", centralDirectory: "PASS", deterministicOrderAndTimestamp: "PASS", UTF8Names: "PASS", crc32EveryEntry: "PASS", payloadBytesAndSha256: "PASS", requiredRoles: "PASS", canonicalManifest: "PASS", pngDecode: "PASS", mp4Structure: "PASS", allGatesPending: "PASS" },
  });
}

export function auditPhase7BPackageBytes({ archiveBytes }) {
  return inspectArchive(archiveBytes);
}

export function assertExternalPhase7BAuditPath(candidate, label = "path", { repositoryRoot = ROOT, temporaryRoot = os.tmpdir() } = {}) {
  const absolute = path.resolve(candidate);
  invariant(!isWithin(repositoryRoot, absolute), `${label} must remain outside Git`);
  invariant(!isWithin(temporaryRoot, absolute), `${label} must not use the transient system temporary directory`);
  return absolute;
}

async function exclusiveWrite(filename, bytes) {
  const handle = await open(filename, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

export async function auditPhase7BPackageFile({ zipPath, reportPath, boundaryOptions = {} }) {
  const absoluteZip = assertExternalPhase7BAuditPath(zipPath, "--zip", boundaryOptions);
  const absoluteReport = assertExternalPhase7BAuditPath(reportPath, "--report", boundaryOptions);
  invariant(path.basename(absoluteZip) === PHASE7B_REVIEW_ZIP_NAME && absoluteZip !== absoluteReport, `--zip basename must be ${PHASE7B_REVIEW_ZIP_NAME}`);
  const zipStatus = await lstat(absoluteZip);
  invariant(zipStatus.isFile() && !zipStatus.isSymbolicLink() && zipStatus.size > 0 && zipStatus.size <= MAX_ARCHIVE_BYTES, "ZIP file boundary differs");
  invariant(path.resolve(await realpath(absoluteZip)) === absoluteZip, "ZIP may not traverse a symlink");
  const reportParent = path.dirname(absoluteReport);
  const parentStatus = await lstat(reportParent);
  invariant(parentStatus.isDirectory() && !parentStatus.isSymbolicLink() && path.resolve(await realpath(reportParent)) === reportParent, "audit report parent must be an existing real directory");
  const report = auditPhase7BPackageBytes({ archiveBytes: await readFile(absoluteZip) });
  await exclusiveWrite(absoluteReport, Buffer.from(stableJson(report)));
  return report;
}

export function parseArguments(argv) {
  const options = { zipPath: null, reportPath: null, selfTest: false, help: false };
  const next = (index, flag) => { const value = argv[index + 1]; invariant(value && !value.startsWith("--"), `${flag} requires a value`); return value; };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help") options.help = true;
    else if (flag === "--zip") options.zipPath = next(index++, flag);
    else if (flag === "--report") options.reportPath = next(index++, flag);
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.selfTest && !options.help) { invariant(options.zipPath, "--zip is required"); invariant(options.reportPath, "--report is required"); }
  return options;
}

export function runSelfTest() {
  invariant(AUDIT_PHASE7B_STANDARD_RECORDING_SCENARIOS.length === 9 && !AUDIT_PHASE7B_RECORDING_EVIDENCE_PATHS.some((relativePath) => relativePath.includes("installed-chrome-200-percent")), "native 200 must not be fabricated as an engine-matrix recording");
  invariant(AUDIT_REQUIRED_PHASE7B_EVIDENCE.length === 50 && PNG_PATHS.length === 7 && MP4_PATHS.length === 19, "independent Phase 7B topology drifted");
  return Object.freeze({ schema: PHASE7B_AUDIT_SCHEMA, status: "PASS", reviewZipName: PHASE7B_REVIEW_ZIP_NAME, requiredPayloads: AUDIT_REQUIRED_PHASE7B_EVIDENCE.length, independentZipParser: true });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write("Usage: node scripts/audit-phase7b-human-review-package.mjs --zip <external ZIP> --report <fresh external JSON>\n"); return; }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`); return; }
  process.stdout.write(`${JSON.stringify(await auditPhase7BPackageFile(options), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { process.stderr.write(`Phase 7B independent audit FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
}
