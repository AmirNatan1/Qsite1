import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { lstat, mkdir, open, readFile, readdir, realpath } from "node:fs/promises";
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
import {
  crc32,
  createStoredZipBuffer,
  sha256,
  stableJson,
  validateIsoBmffRecording,
} from "./package-phase7a-human-review.mjs";

export { PHASE7B_REVIEW_ZIP_NAME };

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PHASE7B_PACKAGE_SCHEMA = "quantum-hub.phase-7b.operating-field-human-review.v1";
export const PHASE7B_MANIFEST_SCHEMA = `${PHASE7B_PACKAGE_SCHEMA}.manifest`;
export const PHASE7B_GATES_SCHEMA = `${PHASE7B_PACKAGE_SCHEMA}.human-gates`;
export const PHASE7B_PROVENANCE_SCHEMA = `${PHASE7B_PACKAGE_SCHEMA}.provenance`;
export const PHASE7B_COMMITS_SCHEMA = `${PHASE7B_PACKAGE_SCHEMA}.commits`;
export const PHASE7B_STAGE_SPEC_SCHEMA = `${PHASE7B_PACKAGE_SCHEMA}.stage-specification`;
export const PHASE7B_PREPACKAGE_AUDIT_SCHEMA = `${PHASE7B_PACKAGE_SCHEMA}.prepackage-audit`;
export const PHASE7B_INSTALLED_CHROME_200_SCHEMA = "quantum-hub.phase-7b.installed-chrome-native-200.v1";
export const PHASE7B_NATIVE_200_LIMITATION_SCHEMA = "quantum-hub.phase-7b.native-200-engine-limitation.v1";
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const MAX_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

const required = (relativePath, role) => Object.freeze({ relativePath, role });
export const PHASE7B_STANDARD_RECORDING_SCENARIOS = Object.freeze(PHASE7B_RECORDING_SCENARIOS.filter((scenario) => scenario !== "installed-chrome-200-percent"));
export const PHASE7B_RECORDING_EVIDENCE_PATHS = Object.freeze(
  ["chromium", "firefox"].flatMap((engine) => PHASE7B_STANDARD_RECORDING_SCENARIOS.map((scenario) => `03-recordings/${engine}-${scenario}.mp4`)),
);
export const PHASE7B_INSTALLED_CHROME_RECORDING_PATH = "installed-chrome-200/installed-chrome-native-200.mp4";
export const PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH = "installed-chrome-200/chrome-visible-zoom-200.png";
export const PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH = "installed-chrome-200/installed-chrome-native-200.json";
export const PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH = "installed-chrome-200/firefox-native-200-limitation.json";
export const REQUIRED_PHASE7B_EVIDENCE = Object.freeze([
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
  ...PHASE7B_RECORDING_EVIDENCE_PATHS.map((relativePath) => required(relativePath, "recording")),
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
  required(PHASE7B_INSTALLED_CHROME_RECORDING_PATH, "installed-chrome-native-200-recording"),
  required(PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH, "installed-chrome-native-200-screenshot"),
  required(PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH, "installed-chrome-native-200-authority"),
  required(PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH, "firefox-native-200-limitation"),
]);

export const PHASE7B_GATE_RECORDS = Object.freeze(PHASE7B_GATES.map((name) => Object.freeze({ name, decision: "PENDING HUMAN REVIEW" })));

const ROLE_BY_PATH = new Map(REQUIRED_PHASE7B_EVIDENCE.map(({ relativePath, role }) => [relativePath, role]));
const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
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
const PNG_PATHS = Object.freeze(REQUIRED_PHASE7B_EVIDENCE.filter(({ relativePath }) => relativePath.endsWith(".png")).map(({ relativePath }) => relativePath));
const MP4_PATHS = Object.freeze(REQUIRED_PHASE7B_EVIDENCE.filter(({ relativePath }) => relativePath.endsWith(".mp4")).map(({ relativePath }) => relativePath));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function lexicalCompare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function crc32Hex(bytes) {
  return crc32(bytes).toString(16).padStart(8, "0");
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

export function safePhase7BEvidencePath(value, label = "Phase 7B evidence path") {
  invariant(typeof value === "string" && value.length > 0, `${label} is missing`);
  invariant(!value.includes("\\") && !value.includes("\0") && !path.posix.isAbsolute(value) && !/^[a-z]:/i.test(value), `${label} must be portable and relative`);
  invariant(path.posix.normalize(value) === value && !value.split("/").some((part) => !part || part === "." || part === ".."), `${label} is unsafe`);
  invariant(!/%(?:2e|2f|5c)/i.test(value), `${label} contains encoded path reinterpretation`);
  return value;
}

export function assertAllowedPhase7BEvidencePath(relativePath) {
  safePhase7BEvidencePath(relativePath);
  invariant(relativePath !== IN_ARCHIVE_MANIFEST, `${IN_ARCHIVE_MANIFEST} is reserved`);
  invariant(!relativePath.split("/").some((segment) => FORBIDDEN_SEGMENT.test(segment)), `forbidden source/cache/private path: ${relativePath}`);
  invariant(!ARCHIVE_EXTENSION.test(relativePath), `nested archive is forbidden: ${relativePath}`);
  invariant(!FONT_EXTENSION.test(relativePath), `font binary is forbidden: ${relativePath}`);
  invariant(!SOURCE_EXTENSION.test(relativePath), `source payload is forbidden: ${relativePath}`);
  invariant(!SOURCE_MEDIA_EXTENSION.test(relativePath), `source media is forbidden: ${relativePath}`);
  invariant(ROLE_BY_PATH.has(relativePath), `entry is outside the closed Phase 7B topology: ${relativePath}`);
  return true;
}

function textForScan(bytes, relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  const data = Buffer.from(bytes);
  return TEXT_EXTENSIONS.has(extension) || relativePath === IN_ARCHIVE_MANIFEST
    ? data.toString("utf8")
    : (data.toString("latin1").match(/[\x20-\x7e]{32,}/g) ?? []).join("\n");
}

export function assertNoPrivateOrSecretPhase7BPayload(bytes, relativePath) {
  const text = textForScan(bytes, relativePath);
  for (const pattern of [WINDOWS_ABSOLUTE, POSIX_ABSOLUTE, PRIVATE_MARKER, SECRET_MARKER]) {
    invariant(!pattern.test(relativePath) && !pattern.test(text), `privacy or secret scan failed: ${relativePath}`);
  }
  invariant(!TEXT_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase()) || !text.includes("\0"), `text payload contains NUL bytes: ${relativePath}`);
  return true;
}

export function inspectPhase7BPng(bytes, relativePath = "image.png") {
  const data = Buffer.from(bytes);
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  invariant(data.length >= 57 && data.subarray(0, 8).equals(signature), `PNG signature differs: ${relativePath}`);
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
    const checksum = data.readUInt32BE(cursor + 8 + length);
    invariant(crc32(data.subarray(cursor + 4, cursor + 8 + length)) === checksum, `PNG chunk CRC differs: ${relativePath}`);
    if (type === "IHDR") {
      invariant(!ihdr && length === 13 && cursor === 8, `PNG IHDR differs: ${relativePath}`);
      ihdr = Buffer.from(payload);
    } else if (type === "IDAT") idat.push(Buffer.from(payload));
    else if (type === "IEND") { invariant(length === 0, `PNG IEND differs: ${relativePath}`); sawIend = true; cursor = end; break; }
    cursor = end;
  }
  invariant(ihdr && sawIend && cursor === data.length && idat.length > 0, `PNG structure is incomplete: ${relativePath}`);
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType);
  invariant(width > 0 && height > 0 && width <= 100_000 && height <= 100_000 && width * height <= 100_000_000 && channels && [1, 2, 4, 8, 16].includes(bitDepth), `PNG dimensions or format differ: ${relativePath}`);
  invariant(ihdr[10] === 0 && ihdr[11] === 0 && ihdr[12] === 0, `PNG compression/filter/interlace differs: ${relativePath}`);
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: Math.min(512 * 1024 * 1024, (rowBytes + 1) * height + 1) });
  invariant(inflated.length === (rowBytes + 1) * height, `PNG decoded byte count differs: ${relativePath}`);
  for (let row = 0; row < height; row += 1) invariant(inflated[row * (rowBytes + 1)] <= 4, `PNG scanline filter differs: ${relativePath}`);
  return Object.freeze({ width, height, bitDepth, colorType, channels, decodedBytes: inflated.length });
}

function validateGates(document) {
  invariant(document?.schema === PHASE7B_GATES_SCHEMA && document.status === "PENDING HUMAN REVIEW", "Phase 7B gate authority differs");
  invariant(sameJson(document.gates, PHASE7B_GATE_RECORDS), "all six Phase 7B gates must remain PENDING HUMAN REVIEW");
}

function validateProvenance(document) {
  invariant(document?.schema === PHASE7B_PROVENANCE_SCHEMA && document.status === "PASS", "Phase 7B provenance schema/status differs");
  invariant(document.branch === PHASE7B_BRANCH && document.parent === PHASE7B_PARENT && HASH_40.test(document.head ?? "") && document.head !== document.parent, "Phase 7B branch/parent/head differs");
  invariant(document.localMain === PHASE7B_FROZEN_MAIN && document.originMain === PHASE7B_FROZEN_MAIN && document.mergeCount === 0, "Phase 7B frozen main or merge authority differs");
  invariant(document.acceptedPhase6Ancestry === true && document.acceptedPhase7AAncestry === true && document.worktreeClean === true && document.upstreamParity === true, "Phase 7B ancestry/cleanliness/upstream authority differs");
  invariant(Array.isArray(document.commits) && document.commits.length > 0, "Phase 7B commit chain is empty");
  document.commits.forEach((commit, index) => {
    invariant(HASH_40.test(commit?.hash ?? "") && HASH_40.test(commit?.parent ?? "") && typeof commit.subject === "string" && commit.subject.length > 0, "Phase 7B commit row differs");
    invariant(commit.parent === (index === 0 ? PHASE7B_PARENT : document.commits[index - 1].hash), "Phase 7B commit chain is not linear");
  });
  invariant(document.commits.at(-1).hash === document.head, "Phase 7B final commit differs");
}

function validateProductionDiff(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  const observed = [...text.matchAll(/^diff --git a\/(.+?) b\/(.+?)$/gm)].map((match) => {
    invariant(match[1] === match[2], "production diff rename is outside Phase 7B authority");
    return match[1];
  }).sort(lexicalCompare);
  invariant(observed.length === PHASE7B_PRODUCTION_PATHS.length && sameJson(observed, [...PHASE7B_PRODUCTION_PATHS].sort(lexicalCompare)), "production diff path authority differs");
}

function validatePhase4(document) {
  invariant(document?.status === "PASS" && Array.isArray(document.assets), "Phase 4 hash authority differs");
  const rows = document.assets.map((row) => [row.path ?? row.relativePath, row.sha256]);
  invariant(sameJson(rows, PHYSICAL_ASSETS), "Phase 4 exact hashes differ");
}

function validateNativeZoomAuthority(byPath) {
  const installed = parseJson(byPath.get(PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH).data, PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH);
  invariant(installed?.schema === PHASE7B_INSTALLED_CHROME_200_SCHEMA && installed.status === "PASS" && installed.browser === "Google Chrome" && installed.genuineInstalledChrome === true && installed.nativeZoomPercent === 200 && installed.visibleZoomConfirmation === "Zoom: 200%", "genuine installed-Chrome 200 authority differs");
  const bindings = [[installed.recording, PHASE7B_INSTALLED_CHROME_RECORDING_PATH], [installed.screenshot, PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH]];
  for (const [binding, expectedPath] of bindings) {
    const entry = byPath.get(expectedPath);
    invariant(binding?.path === path.posix.basename(expectedPath) && binding.bytes === entry.data.length && binding.sha256 === sha256(entry.data), `installed-Chrome native-200 evidence binding differs: ${expectedPath}`);
  }
  const firefox = parseJson(byPath.get(PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH).data, PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH);
  invariant(firefox?.schema === PHASE7B_NATIVE_200_LIMITATION_SCHEMA && firefox.status === "LIMITATION" && firefox.engine === "firefox" && firefox.classification === "NOT APPLICABLE" && firefox.nativeZoomPercent === 200 && firefox.recording === null && typeof firefox.reason === "string" && firefox.reason.length >= 24, "Firefox native-Chrome-zoom limitation authority differs");
}

function validateRequiredAuthorities(entries) {
  const byPath = new Map(entries.map((entry) => [entry.relativePath, entry]));
  const json = (relativePath) => parseJson(byPath.get(relativePath).data, relativePath);
  validateGates(json("00-authority/human-gates.json"));
  const provenance = json("01-provenance/git-provenance.json");
  validateProvenance(provenance);
  const commits = json("01-provenance/commits.json");
  invariant(commits?.schema === PHASE7B_COMMITS_SCHEMA && commits.status === "PASS" && sameJson(commits.commits, provenance.commits), "complete commit list differs from provenance");
  validateProductionDiff(byPath.get("01-provenance/production.diff").data);

  const task = byPath.get("00-authority/task-brief.md").data.toString("utf8");
  const architecture = byPath.get("02-design/phase-7b-operating-field-architecture.md").data.toString("utf8");
  const references = byPath.get("02-design/phase-7b-reference-study.md").data.toString("utf8");
  invariant(/PHASE 7B/i.test(task) && /ONE WORKPIECE CHANGES STATE/i.test(task) && /PENDING HUMAN REVIEW/i.test(task), "normalized task brief authority differs");
  invariant(/ONE WORKPIECE CHANGES STATE/i.test(architecture) && /no-JavaScript/i.test(architecture), "architecture document authority differs");
  invariant(/reference/i.test(references) && /No third-party source/i.test(references), "reference study authority differs");

  const stages = json("02-design/stage-state-specification.json");
  invariant(stages?.schema === PHASE7B_STAGE_SPEC_SCHEMA && stages.status === "PASS" && stages.persistentWorkpiece === true && stages.historyRetained === true, "stage-state authority differs");
  invariant(sameJson(stages.macroStates, PHASE7B_MACRO_STATES) && sameJson(stages.methodStages, PHASE7B_METHOD_STAGES), "stage order differs");

  const browser = json("03-browser/browser-matrix.json");
  invariant(browser?.status === "PASS" && sameJson(browser.engines, ["chromium", "firefox", "webkit-proxy"]) && sameJson(browser.scenarios, PHASE7B_RECORDING_SCENARIOS), "browser matrix authority differs");
  const webkit = json("03-browser/webkit-proxy.json");
  invariant(["PASS", "LIMITATION"].includes(webkit?.status) && /WEBKIT PROXY/i.test(webkit.classification ?? "") && webkit.physicalSafari === false, "WebKit must remain proxy evidence");
  const responsive = json("04-responsive/responsive-matrix.json");
  invariant(responsive?.status === "PASS" && sameJson(responsive.viewports, PHASE7B_CORE_VIEWPORTS), "responsive matrix authority differs");
  validateNativeZoomAuthority(byPath);

  for (const relativePath of [
    "05-fallback/fallback-report.json", "06-assurance/accessibility.json", "06-assurance/performance.json",
    "06-assurance/lifecycle.json", "06-assurance/network.json", "06-assurance/publication.json",
    "06-assurance/phase7a-regression.json", "07-deployment/deployment.json",
  ]) invariant(json(relativePath)?.status === "PASS", `${relativePath} must record PASS`);
  validatePhase4(json("06-assurance/phase4-hashes.json"));
  const phase7a = json("06-assurance/phase7a-regression.json");
  invariant(phase7a.baseline === PHASE7B_PARENT && phase7a.visualRegression === "PASS", "accepted Phase 7A regression authority differs");
  const deployment = json("07-deployment/deployment.json");
  invariant(deployment.head === provenance.head && deployment.deployedSha === provenance.head && typeof deployment.deploymentId === "string" && deployment.deploymentId.length > 0, "deployment SHA binding differs");
  invariant(/^https:\/\//.test(deployment.immutablePreview ?? "") && /^https:\/\//.test(deployment.branchPreview ?? "") && deployment.localDistParity === "PASS", "deployment URL/parity authority differs");
  const limitations = json("08-governance/environmental-limitations.json");
  invariant(limitations?.status === "DECLARED" && Array.isArray(limitations.limitations), "environmental limitations authority differs");
  const prepackage = json("09-audit/prepackage-audit.json");
  invariant(prepackage?.schema === PHASE7B_PREPACKAGE_AUDIT_SCHEMA && prepackage.status === "PASS", "prepackage audit authority differs");
  invariant(prepackage.auditedPayloadCount === REQUIRED_PHASE7B_EVIDENCE.length - 1 && prepackage.finalPayloadCount === REQUIRED_PHASE7B_EVIDENCE.length, "prepackage audit payload count differs");
  invariant(prepackage.mediaDecode?.images?.status === "PASS" && prepackage.mediaDecode.images.count === PNG_PATHS.length && prepackage.mediaDecode?.recordings?.status === "PASS" && prepackage.mediaDecode.recordings.count === MP4_PATHS.length, "prepackage media decode metadata differs");
}

export function normalizePhase7BEvidenceEntries(input) {
  invariant(Array.isArray(input), "Phase 7B evidence entries must be an array");
  const normalized = input.map((entry) => {
    invariant(entry && typeof entry.relativePath === "string", "Phase 7B evidence path is required");
    assertAllowedPhase7BEvidencePath(entry.relativePath);
    const data = Buffer.from(entry.data ?? []);
    invariant(data.length > 0 && data.length <= MAX_FILE_BYTES, `Phase 7B evidence byte boundary differs: ${entry.relativePath}`);
    assertNoPrivateOrSecretPhase7BPayload(data, entry.relativePath);
    invariant(!RAW_PHASE4_HASHES.has(sha256(data)), `raw governed Phase 4 payload is forbidden: ${entry.relativePath}`);
    if (entry.relativePath.endsWith(".png")) inspectPhase7BPng(data, entry.relativePath);
    if (entry.relativePath.endsWith(".mp4")) validateIsoBmffRecording(data, entry.relativePath);
    return { relativePath: entry.relativePath, role: ROLE_BY_PATH.get(entry.relativePath), data };
  }).sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
  const paths = new Set();
  const folded = new Set();
  for (const entry of normalized) {
    const foldedPath = entry.relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    invariant(!paths.has(entry.relativePath) && !folded.has(foldedPath), `duplicate Phase 7B evidence path: ${entry.relativePath}`);
    paths.add(entry.relativePath);
    folded.add(foldedPath);
  }
  invariant(normalized.length === REQUIRED_PHASE7B_EVIDENCE.length && REQUIRED_PHASE7B_EVIDENCE.every(({ relativePath }) => paths.has(relativePath)), "Phase 7B compact evidence topology differs");
  validateRequiredAuthorities(normalized);
  return normalized;
}

function recordFor(entry) {
  const extension = path.posix.extname(entry.relativePath).toLowerCase();
  return {
    path: entry.relativePath,
    role: entry.role,
    kind: extension === ".png" ? "image" : extension === ".mp4" ? "video" : "document",
    bytes: entry.data.length,
    sha256: sha256(entry.data),
    crc32: crc32Hex(entry.data),
  };
}

function manifestFor(payloads) {
  return {
    schema: PHASE7B_MANIFEST_SCHEMA,
    archiveFilename: PHASE7B_REVIEW_ZIP_NAME,
    deterministicEncoding: "canonical ZIP32 stored UTF-8; lexical entry order; DOS 1980-01-01 00:00:00",
    authority: { branch: PHASE7B_BRANCH, exactParent: PHASE7B_PARENT, gates: "PENDING HUMAN REVIEW" },
    requiredEvidence: REQUIRED_PHASE7B_EVIDENCE,
    payloads,
    summary: {
      payloadCount: payloads.length,
      payloadBytes: payloads.reduce((sum, item) => sum + item.bytes, 0),
      imageCount: payloads.filter(({ kind }) => kind === "image").length,
      recordingCount: payloads.filter(({ kind }) => kind === "video").length,
    },
    exclusions: ["source archives", "node_modules and browser caches", "raw Phase 4 media", "font binaries", "private paths and credentials", "nested archives"],
  };
}

export function buildPhase7BReviewArtifacts(inputEntries) {
  const entries = normalizePhase7BEvidenceEntries(inputEntries);
  const payloads = entries.map(recordFor);
  const manifest = manifestFor(payloads);
  const manifestBytes = Buffer.from(stableJson(manifest));
  assertNoPrivateOrSecretPhase7BPayload(manifestBytes, IN_ARCHIVE_MANIFEST);
  const archiveBytes = createStoredZipBuffer([...entries.map(({ relativePath, data }) => ({ relativePath, data })), { relativePath: IN_ARCHIVE_MANIFEST, data: manifestBytes }]);
  invariant(archiveBytes.length <= MAX_ARCHIVE_BYTES, "Phase 7B review ZIP exceeds its byte boundary");
  return Object.freeze({
    archiveBytes,
    manifest,
    report: Object.freeze({
      schema: PHASE7B_PACKAGE_SCHEMA,
      status: "PASS",
      archive: { filename: PHASE7B_REVIEW_ZIP_NAME, bytes: archiveBytes.length, sha256: sha256(archiveBytes), entryCount: entries.length + 1 },
      embeddedManifest: { path: IN_ARCHIVE_MANIFEST, bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
      payloadCount: entries.length,
      payloadBytes: payloads.reduce((sum, item) => sum + item.bytes, 0),
    }),
  });
}

export function assertExternalPhase7BOutputPath(candidate, label = "output path", { repositoryRoot = ROOT, temporaryRoot = os.tmpdir() } = {}) {
  const absolute = path.resolve(candidate);
  invariant(!isWithin(repositoryRoot, absolute), `${label} must remain outside Git`);
  invariant(!isWithin(temporaryRoot, absolute), `${label} must not use the transient system temporary directory`);
  return absolute;
}

async function walkEvidence(directory, relative = "") {
  const rows = [];
  const children = await readdir(directory, { withFileTypes: true });
  for (const child of children) {
    const relativePath = relative ? `${relative}/${child.name}` : child.name;
    const absolutePath = path.join(directory, child.name);
    const status = await lstat(absolutePath);
    invariant(!status.isSymbolicLink(), `symlink is forbidden in evidence: ${relativePath}`);
    if (status.isDirectory()) rows.push(...await walkEvidence(absolutePath, relativePath));
    else {
      invariant(status.isFile(), `unsupported evidence node: ${relativePath}`);
      rows.push({ relativePath: relativePath.replaceAll("\\", "/"), data: await readFile(absolutePath) });
    }
  }
  return rows;
}

export async function readPhase7BEvidenceDirectory(evidenceDir) {
  const absolute = path.resolve(evidenceDir);
  const status = await lstat(absolute);
  invariant(status.isDirectory() && !status.isSymbolicLink(), "Phase 7B evidence root must be a real directory");
  invariant(path.resolve(await realpath(absolute)) === absolute, "Phase 7B evidence root may not traverse a symlink");
  return normalizePhase7BEvidenceEntries(await walkEvidence(absolute));
}

async function exclusiveWrite(filename, bytes) {
  const handle = await open(filename, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

export async function packagePhase7BReviewDirectory({ evidenceDir, outputDir, boundaryOptions = {} }) {
  const entries = await readPhase7BEvidenceDirectory(evidenceDir);
  const artifacts = buildPhase7BReviewArtifacts(entries);
  const absoluteOutput = assertExternalPhase7BOutputPath(outputDir, "--output-dir", boundaryOptions);
  const parent = path.dirname(absoluteOutput);
  const parentStatus = await lstat(parent);
  invariant(parentStatus.isDirectory() && !parentStatus.isSymbolicLink() && path.resolve(await realpath(parent)) === parent, "output parent must be an existing real directory");
  try { await lstat(absoluteOutput); throw new Error(`fresh output directory already exists: ${absoluteOutput}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  await mkdir(absoluteOutput);
  const zipPath = path.join(absoluteOutput, PHASE7B_REVIEW_ZIP_NAME);
  await exclusiveWrite(zipPath, artifacts.archiveBytes);
  return Object.freeze({ ...artifacts.report, zipPath });
}

export function parseArguments(argv) {
  const options = { evidenceDir: null, outputDir: null, selfTest: false, help: false };
  const next = (index, flag) => {
    const value = argv[index + 1];
    invariant(value && !value.startsWith("--"), `${flag} requires a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help") options.help = true;
    else if (flag === "--evidence-dir") options.evidenceDir = next(index++, flag);
    else if (flag === "--output-dir") options.outputDir = next(index++, flag);
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.selfTest && !options.help) {
    invariant(options.evidenceDir, "--evidence-dir is required");
    invariant(options.outputDir, "--output-dir is required");
  }
  return options;
}

export function runSelfTest() {
  invariant(PHASE7B_STANDARD_RECORDING_SCENARIOS.length === 9 && !PHASE7B_RECORDING_EVIDENCE_PATHS.some((relativePath) => relativePath.includes("installed-chrome-200-percent")), "native 200 must not be fabricated as an engine-matrix recording");
  invariant(PNG_PATHS.length === 7 && MP4_PATHS.length === 19 && REQUIRED_PHASE7B_EVIDENCE.length === 50, "Phase 7B compact topology drifted");
  return Object.freeze({ schema: PHASE7B_PACKAGE_SCHEMA, status: "PASS", reviewZipName: PHASE7B_REVIEW_ZIP_NAME, requiredPayloads: REQUIRED_PHASE7B_EVIDENCE.length, images: PNG_PATHS.length, recordings: MP4_PATHS.length });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write("Usage: node scripts/package-phase7b-human-review.mjs --evidence-dir <directory> --output-dir <fresh external directory>\n"); return; }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`); return; }
  process.stdout.write(`${JSON.stringify(await packagePhase7BReviewDirectory(options), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { process.stderr.write(`Phase 7B package FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
}
