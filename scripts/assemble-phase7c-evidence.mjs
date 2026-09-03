import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { lstat, mkdir, open, readFile, readdir, realpath } from "node:fs/promises";
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
import {
  crc32,
  createStoredZipBuffer,
  stableJson,
  validateIsoBmffRecording,
} from "./package-phase7a-human-review.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PHASE7C_PACKAGE_SCHEMA = "quantum-hub.phase-7c.territory-proof-human-review.v1";
export const PHASE7C_MANIFEST_SCHEMA = `${PHASE7C_PACKAGE_SCHEMA}.manifest`;
export const PHASE7C_GATES_SCHEMA = `${PHASE7C_PACKAGE_SCHEMA}.human-gates`;
export const PHASE7C_RECORDING_INVENTORY_SCHEMA = `${PHASE7C_PACKAGE_SCHEMA}.recording-inventory`;
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const GATES_PATH = "00-authority/human-gates.json";
export const MAX_FILE_BYTES = 192 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

const required = (relativePath, role) => Object.freeze({ relativePath, role });
export const REQUIRED_PHASE7C_INPUTS = Object.freeze([
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

export const PHASE7C_GATE_RECORDS = Object.freeze(PHASE7C_GATES.map((name) => Object.freeze({
  name,
  decision: "PENDING HUMAN REVIEW",
})));

const ROLE_BY_PATH = new Map(REQUIRED_PHASE7C_INPUTS.map(({ relativePath, role }) => [relativePath, role]));
const REQUIRED_PATHS = new Set(REQUIRED_PHASE7C_INPUTS.map(({ relativePath }) => relativePath));
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

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function crc32Hex(bytes) {
  return crc32(bytes).toString(16).padStart(8, "0");
}

export function safePhase7CEvidencePath(value, label = "Phase 7C evidence path") {
  invariant(typeof value === "string" && value.length > 0, `${label} is missing`);
  invariant(!value.includes("\\") && !/[<>:"|?*\x00-\x1f]/.test(value) && !path.posix.isAbsolute(value) && !/^[a-z]:/i.test(value), `${label} must be portable and relative`);
  invariant(path.posix.normalize(value) === value && !value.split("/").some((part) => !part || part === "." || part === ".." || part.startsWith(".")), `${label} is unsafe`);
  invariant(!value.split("/").some((part) => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || /[ .]$/.test(part)), `${label} contains a non-portable segment`);
  invariant(!/%(?:2e|2f|5c)/i.test(value), `${label} contains encoded path reinterpretation`);
  return value;
}

export function assertAllowedPhase7CEvidencePath(relativePath) {
  safePhase7CEvidencePath(relativePath);
  invariant(relativePath !== IN_ARCHIVE_MANIFEST && relativePath !== GATES_PATH, `${relativePath} is reserved for trusted package metadata`);
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

export function assertNoPrivateOrSecretPhase7CPayload(bytes, relativePath) {
  const text = textForScan(bytes, relativePath);
  for (const pattern of [WINDOWS_ABSOLUTE, POSIX_ABSOLUTE, PRIVATE_MARKER, SECRET_MARKER]) {
    invariant(!pattern.test(relativePath) && !pattern.test(text), `privacy or secret scan failed: ${relativePath}`);
  }
  invariant(!TEXT_EXTENSION.has(path.posix.extname(relativePath).toLowerCase()) || !text.includes("\0"), `text payload contains NUL bytes: ${relativePath}`);
  return true;
}

export function inspectPhase7CPng(bytes, relativePath = "image.png") {
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
    if (type === "IHDR") {
      invariant(!ihdr && length === 13 && cursor === 8, `PNG IHDR differs: ${relativePath}`);
      ihdr = Buffer.from(payload);
    } else if (type === "IDAT") idat.push(Buffer.from(payload));
    else if (type === "IEND") {
      invariant(length === 0, `PNG IEND differs: ${relativePath}`);
      sawIend = true;
      cursor = end;
      break;
    }
    cursor = end;
  }
  invariant(ihdr && sawIend && cursor === data.length && idat.length > 0, `PNG structure is incomplete: ${relativePath}`);
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType);
  invariant(width > 0 && height > 0 && width * height <= 100_000_000 && channels && [1, 2, 4, 8, 16].includes(bitDepth), `PNG dimensions or format differ: ${relativePath}`);
  invariant(ihdr[10] === 0 && ihdr[11] === 0 && ihdr[12] === 0, `PNG encoding differs: ${relativePath}`);
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const decoded = inflateSync(Buffer.concat(idat), { maxOutputLength: Math.min(512 * 1024 * 1024, (rowBytes + 1) * height + 1) });
  invariant(decoded.length === (rowBytes + 1) * height, `PNG decoded byte count differs: ${relativePath}`);
  for (let row = 0; row < height; row += 1) invariant(decoded[row * (rowBytes + 1)] <= 4, `PNG scanline filter differs: ${relativePath}`);
  return Object.freeze({ width, height, bitDepth, colorType, decodedBytes: decoded.length });
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
  return ROLE_BY_PATH.get(relativePath) ?? (kindFor(relativePath) === "video" ? "recording" : kindFor(relativePath) === "image" ? "visual-evidence" : "supporting-evidence");
}

function validateRecordingInventory(entriesByPath) {
  const relativePath = "03-recordings/recording-inventory.json";
  const inventory = parseJson(entriesByPath.get(relativePath).data, relativePath);
  invariant(inventory?.schema === PHASE7C_RECORDING_INVENTORY_SCHEMA, "Phase 7C recording inventory schema differs");
  invariant(["PASS", "LIMITATION", "NOT OBSERVED", "NOT AVAILABLE TO EXECUTION ENVIRONMENT"].includes(inventory.status), "Phase 7C recording inventory status differs");
  invariant(Array.isArray(inventory.scenarios) && inventory.scenarios.length === PHASE7C_RECORDING_SCENARIOS.length, "Phase 7C recording scenario count differs");
  const observed = new Set();
  inventory.scenarios.forEach((row, index) => {
    invariant(row?.scenario === PHASE7C_RECORDING_SCENARIOS[index] && !observed.has(row.scenario), "Phase 7C recording scenario order differs");
    observed.add(row.scenario);
    invariant(["PASS", "LIMITATION", "NOT OBSERVED", "NOT AVAILABLE TO EXECUTION ENVIRONMENT"].includes(row.status), `recording status differs: ${row.scenario}`);
    invariant(Array.isArray(row.artifacts), `recording artifacts differ: ${row.scenario}`);
    if (row.status === "PASS") invariant(row.artifacts.length > 0, `PASS recording has no bound artifact: ${row.scenario}`);
    for (const artifact of row.artifacts) {
      safePhase7CEvidencePath(artifact, `recording artifact for ${row.scenario}`);
      invariant(entriesByPath.has(artifact), `recording artifact is absent: ${artifact}`);
      invariant(artifact.startsWith("03-recordings/") && artifact !== relativePath, `recording artifact is outside its evidence boundary: ${artifact}`);
    }
    if (row.status === "PASS" && !REPORTABLE_RECORDING_SCENARIOS.has(row.scenario)) invariant(row.artifacts.some((artifact) => artifact.endsWith(".mp4")), `PASS visual recording has no MP4: ${row.scenario}`);
  });
}

export function normalizePhase7CEvidenceEntries(inputEntries) {
  invariant(Array.isArray(inputEntries), "Phase 7C evidence entries must be an array");
  const entries = inputEntries.map((entry) => {
    invariant(entry && typeof entry.relativePath === "string", "Phase 7C evidence path is required");
    assertAllowedPhase7CEvidencePath(entry.relativePath);
    const data = Buffer.from(entry.data ?? []);
    invariant(data.length > 0 && data.length <= MAX_FILE_BYTES, `Phase 7C evidence byte boundary differs: ${entry.relativePath}`);
    assertNoPrivateOrSecretPhase7CPayload(data, entry.relativePath);
    invariant(!RAW_PHASE4_HASHES.has(sha256(data)), `raw governed Phase 4 media is forbidden: ${entry.relativePath}`);
    const extension = path.posix.extname(entry.relativePath).toLowerCase();
    if (extension === ".json") {
      const document = parseJson(data, entry.relativePath);
      assertNoPrivateOrSecretPhase7CPayload(Buffer.from(JSON.stringify(document)), entry.relativePath);
      invariant(PHASE7C_ALLOWED_STATUSES.includes(document?.status), `Phase 7C evidence status taxonomy differs: ${entry.relativePath}`);
      invariant(document?.status !== "FAIL", `unresolved FAIL evidence is not packageable: ${entry.relativePath}`);
    } else if (extension === ".png") inspectPhase7CPng(data, entry.relativePath);
    else if (extension === ".mp4") validateIsoBmffRecording(data, entry.relativePath);
    return { relativePath: entry.relativePath, role: roleFor(entry.relativePath), kind: kindFor(entry.relativePath), data };
  }).sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));

  const paths = new Set();
  const folded = new Set();
  for (const entry of entries) {
    const foldedPath = entry.relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    invariant(!paths.has(entry.relativePath) && !folded.has(foldedPath), `duplicate Phase 7C evidence path: ${entry.relativePath}`);
    paths.add(entry.relativePath);
    folded.add(foldedPath);
  }
  invariant(REQUIRED_PHASE7C_INPUTS.every(({ relativePath }) => paths.has(relativePath)), "Phase 7C required evidence topology is incomplete");
  const task = entries.find(({ relativePath }) => relativePath === "00-authority/task-brief.md").data.toString("utf8");
  invariant(/PHASE 7C/i.test(task) && /PENDING HUMAN REVIEW/i.test(task), "Phase 7C task authority differs");
  validateRecordingInventory(new Map(entries.map((entry) => [entry.relativePath, entry])));
  return entries;
}

function gatesDocument() {
  return {
    schema: PHASE7C_GATES_SCHEMA,
    status: "PENDING HUMAN REVIEW",
    gates: PHASE7C_GATE_RECORDS,
    phase7D: "NOT AUTHORIZED",
    main: "NOT MERGED",
  };
}

function payloadRecord(entry) {
  return {
    path: entry.relativePath,
    role: entry.role,
    kind: entry.kind,
    bytes: entry.data.length,
    sha256: sha256(entry.data),
    crc32: crc32Hex(entry.data),
  };
}

export function buildPhase7CReviewArtifacts(inputEntries) {
  const sourceEntries = normalizePhase7CEvidenceEntries(inputEntries);
  const gateBytes = Buffer.from(stableJson(gatesDocument()));
  assertNoPrivateOrSecretPhase7CPayload(gateBytes, GATES_PATH);
  const entries = [...sourceEntries, { relativePath: GATES_PATH, role: "human-gates", kind: "document", data: gateBytes }]
    .sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));
  const payloads = entries.map(payloadRecord);
  const manifest = {
    schema: PHASE7C_MANIFEST_SCHEMA,
    archiveFilename: PHASE7C_REVIEW_ZIP_NAME,
    deterministicEncoding: "canonical ZIP32 stored UTF-8; lexical entry order; DOS 1980-01-01 00:00:00",
    authority: {
      branch: PHASE7C_BRANCH,
      exactParent: PHASE7C_PARENT,
      frozenMain: PHASE7C_FROZEN_MAIN,
      gates: "PENDING HUMAN REVIEW",
      phase7D: "NOT AUTHORIZED",
      main: "NOT MERGED",
    },
    requiredInputs: REQUIRED_PHASE7C_INPUTS,
    payloads,
    summary: {
      payloadCount: payloads.length,
      payloadBytes: payloads.reduce((sum, entry) => sum + entry.bytes, 0),
      imageCount: payloads.filter(({ kind }) => kind === "image").length,
      recordingCount: payloads.filter(({ kind }) => kind === "video").length,
    },
    exclusions: ["source archives", "node_modules and browser caches", "raw Phase 4 media", "font binaries", "private paths and credentials", "nested archives"],
  };
  const manifestBytes = Buffer.from(stableJson(manifest));
  assertNoPrivateOrSecretPhase7CPayload(manifestBytes, IN_ARCHIVE_MANIFEST);
  const archiveBytes = createStoredZipBuffer([...entries.map(({ relativePath, data }) => ({ relativePath, data })), { relativePath: IN_ARCHIVE_MANIFEST, data: manifestBytes }]);
  invariant(archiveBytes.length <= MAX_ARCHIVE_BYTES, "Phase 7C review ZIP exceeds its byte boundary");
  return Object.freeze({
    entries,
    manifest,
    manifestBytes,
    archiveBytes,
    report: Object.freeze({
      schema: PHASE7C_PACKAGE_SCHEMA,
      status: "PASS",
      archive: { filename: PHASE7C_REVIEW_ZIP_NAME, bytes: archiveBytes.length, sha256: sha256(archiveBytes), entryCount: entries.length + 1 },
      embeddedManifest: { path: IN_ARCHIVE_MANIFEST, bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
      payloadCount: payloads.length,
      payloadBytes: manifest.summary.payloadBytes,
      payloads,
    }),
  });
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

export async function readPhase7CEvidenceRoot(evidenceRoot) {
  const absolute = path.resolve(evidenceRoot);
  const status = await lstat(absolute);
  invariant(status.isDirectory() && !status.isSymbolicLink(), "Phase 7C evidence root must be a real directory");
  invariant(path.resolve(await realpath(absolute)) === absolute, "Phase 7C evidence root may not traverse a symlink");
  return normalizePhase7CEvidenceEntries(await walkEvidence(absolute));
}

export function assertExternalPhase7CPath(candidate, label = "output path", { repositoryRoot = ROOT, temporaryRoot = os.tmpdir() } = {}) {
  const absolute = path.resolve(candidate);
  invariant(!isWithin(repositoryRoot, absolute), `${label} must remain outside Git`);
  invariant(!isWithin(temporaryRoot, absolute), `${label} must not use the transient system temporary directory`);
  return absolute;
}

async function assertRealDirectory(directory, label) {
  const status = await lstat(directory);
  invariant(status.isDirectory() && !status.isSymbolicLink() && path.resolve(await realpath(directory)) === path.resolve(directory), `${label} must be an existing real directory`);
}

async function assertAbsent(candidate, label) {
  try { await lstat(candidate); throw new Error(`${label} already exists: ${candidate}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

async function exclusiveWrite(filename, bytes) {
  const handle = await open(filename, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

async function writeStagingTree(stagingDir, entries, manifestBytes) {
  await mkdir(stagingDir);
  for (const entry of [...entries, { relativePath: IN_ARCHIVE_MANIFEST, data: manifestBytes }]) {
    const target = path.join(stagingDir, ...entry.relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await exclusiveWrite(target, entry.data);
  }
}

export async function assemblePhase7CEvidence({ evidenceRoot, stagingDir, zipPath, boundaryOptions = {} }) {
  const absoluteStaging = assertExternalPhase7CPath(stagingDir, "--staging-dir", boundaryOptions);
  const absoluteZip = assertExternalPhase7CPath(zipPath, "--zip-path", boundaryOptions);
  invariant(path.basename(absoluteZip) === PHASE7C_REVIEW_ZIP_NAME, `ZIP filename must be ${PHASE7C_REVIEW_ZIP_NAME}`);
  invariant(!isWithin(absoluteStaging, absoluteZip), "ZIP target must not be inside the staging tree");
  await assertRealDirectory(path.dirname(absoluteStaging), "staging parent");
  await assertRealDirectory(path.dirname(absoluteZip), "ZIP parent");
  await assertAbsent(absoluteStaging, "fresh staging directory");
  await assertAbsent(absoluteZip, "fresh ZIP path");
  const sourceEntries = await readPhase7CEvidenceRoot(evidenceRoot);
  const artifacts = buildPhase7CReviewArtifacts(sourceEntries);
  await writeStagingTree(absoluteStaging, artifacts.entries, artifacts.manifestBytes);
  await exclusiveWrite(absoluteZip, artifacts.archiveBytes);
  return Object.freeze({ ...artifacts.report, evidenceRoot: path.resolve(evidenceRoot), stagingDir: absoluteStaging, zipPath: absoluteZip });
}

export function parseArguments(argv) {
  const options = { evidenceRoot: null, stagingDir: null, zipPath: null, selfTest: false, help: false };
  const next = (index, flag) => {
    const value = argv[index + 1];
    invariant(value && !value.startsWith("--"), `${flag} requires a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help") options.help = true;
    else if (flag === "--evidence-root") options.evidenceRoot = next(index++, flag);
    else if (flag === "--staging-dir") options.stagingDir = next(index++, flag);
    else if (flag === "--zip-path") options.zipPath = next(index++, flag);
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.selfTest && !options.help) {
    invariant(options.evidenceRoot, "--evidence-root is required");
    invariant(options.stagingDir, "--staging-dir is required");
    invariant(options.zipPath, "--zip-path is required");
  }
  return options;
}

export function runSelfTest() {
  invariant(PHASE7C_GATES.length === 6 && PHASE7C_GATE_RECORDS.every(({ decision }) => decision === "PENDING HUMAN REVIEW"), "Phase 7C human-gate authority drifted");
  invariant(REQUIRED_PHASE7C_INPUTS.length === REQUIRED_PATHS.size, "Phase 7C required input paths are not unique");
  invariant(PHASE7C_RECORDING_SCENARIOS.length === 12, "Phase 7C recording scenario authority drifted");
  return Object.freeze({ schema: PHASE7C_PACKAGE_SCHEMA, status: "PASS", reviewZipName: PHASE7C_REVIEW_ZIP_NAME, requiredInputs: REQUIRED_PHASE7C_INPUTS.length, gates: PHASE7C_GATE_RECORDS.length, recordingScenarios: PHASE7C_RECORDING_SCENARIOS.length });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/assemble-phase7c-evidence.mjs --evidence-root <directory> --staging-dir <fresh external directory> --zip-path <external phase-7c-territory-proof-threshold-human-review.zip>\n");
    return;
  }
  if (options.selfTest) process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(await assemblePhase7CEvidence(options), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { process.stderr.write(`Phase 7C evidence assembly FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
}
