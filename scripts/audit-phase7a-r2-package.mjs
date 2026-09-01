import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, mkdtemp, open, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseStoredZip } from "./audit-phase7a-human-review-package.mjs";
import { FROZEN_MAIN, PHASE7A_PARENT, PHYSICAL_ASSETS } from "./phase7a-contract.mjs";
import {
  PHASE7A_R2_PARENT,
  PHASE7A_R2_REVIEW_ZIP_NAME,
  validateR2AxeAuthority,
  validateR2FieldMapFocusAuthority,
  validateR2TargetAuthority,
  validatePhase7aR2FieldMapAuthority,
} from "./phase7a-r2-field-map-authority.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const R2_PACKAGE_SCHEMA = "quantum-hub.phase-7a-r2.field-map-focus-human-review.v1";
export const R2_MANIFEST_SCHEMA = `${R2_PACKAGE_SCHEMA}.manifest`;
export const R2_AUDIT_SCHEMA = `${R2_PACKAGE_SCHEMA}.independent-audit`;
export const R2_SOURCE_AUTHORITY_SCHEMA = "quantum-hub.phase-7a-r2.source-authority.v1";
export const R2_TASK_AUTHORITY_SCHEMA = "quantum-hub.phase-7a-r2.task-authority.v1";
export const R2_HUMAN_GATES_SCHEMA = "quantum-hub.phase-7a-r2.human-gates.v1";
export const R2_DEPLOYMENT_BINDING_SCHEMA = "quantum-hub.phase-7a-r2.deployment-binding.v1";
export const R2_ARIA_DIFF_SCHEMA = "quantum-hub.phase-7a-r2.aria-before-after.v1";
export const R2_INSTALLED_CHROME_SCHEMA = "quantum-hub.phase-7a-r2.installed-chrome-200.v1";
export const R2_TEST_RECEIPT_SCHEMA = "quantum-hub.phase-7a-r2.test-receipt.v1";
export const R2_PHASE4_HASH_SCHEMA = "quantum-hub.phase-7a-r2.phase4-hashes.v1";
export const R2_LIMITATIONS_SCHEMA = "quantum-hub.phase-7a-r2.environmental-limitations.v1";
export const R2_PREPACKAGE_AUDIT_SCHEMA = "quantum-hub.phase-7a-r2.prepackage-evidence-audit.v1";
export const R2_BRANCH = "repair/phase-7a-r2-field-map-focus-semantics";
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

const execFileAsync = promisify(execFile);
const required = (relativePath, role) => Object.freeze({ relativePath, role });
export const REQUIRED_R2_EVIDENCE = Object.freeze([
  required("00-authority/task-authority.json", "task-authority"),
  required("00-authority/human-gates-status.json", "human-gates"),
  required("00-authority/r2-field-map-authority.json", "semantic-authority"),
  required("01-provenance/source-authority.json", "source-authority"),
  required("01-provenance/deployment-binding.json", "deployment-binding"),
  required("02-diff/production.diff", "production-diff"),
  required("02-diff/aria-before-after.json", "aria-before-after"),
  required("03-focus/raw-cross-engine-focus.json", "focus-authority"),
  required("03-focus/chromium-focus-cycle.mp4", "recording"),
  required("03-focus/firefox-focus-cycle.mp4", "recording"),
  required("03-focus/webkit-focus-cycle.mp4", "recording"),
  required("04-field-map/closed.png", "raster-evidence"),
  required("04-field-map/open.png", "raster-evidence"),
  required("04-field-map/keyboard-focus.png", "raster-evidence"),
  required("04-field-map/escape-focus-return.png", "raster-evidence"),
  required("04-field-map/no-javascript-native-open.png", "raster-evidence"),
  required("04-field-map/reduced-motion.png", "raster-evidence"),
  required("05-chrome-200/installed-chrome-200.json", "installed-chrome-authority"),
  required("05-chrome-200/closed.png", "raster-evidence"),
  required("05-chrome-200/open.png", "raster-evidence"),
  required("05-chrome-200/keyboard-focus.png", "raster-evidence"),
  required("05-chrome-200/escape-focus-return.png", "raster-evidence"),
  required("05-chrome-200/chrome-visible-200-percent.png", "raster-evidence"),
  required("06-accessibility/axe-and-manual-contrast.json", "axe-authority"),
  required("06-accessibility/target-inventory.json", "target-authority"),
  required("07-regression/focused-regression.json", "regression-authority"),
  required("07-regression/retained-suite.json", "retained-suite-authority"),
  required("08-governance/phase4-hashes.json", "phase4-hash-authority"),
  required("08-governance/environmental-limitations.json", "environmental-limitations"),
  required("09-audit/prepackage-evidence-audit.json", "prepackage-audit"),
]);

const R2_HUMAN_GATES = Object.freeze([
  { name: "RETENTION + DEMOLITION DISCIPLINE", decision: "ACCEPT" },
  { name: "FROZEN OPENING INTEGRITY", decision: "ACCEPT" },
  { name: "SIGNAL FIELD CREATIVE AUTHORITY", decision: "ACCEPT" },
  { name: "TYPOGRAPHY + MATERIAL AUTHORITY", decision: "ACCEPT" },
  { name: "NATIVE-SCROLL + MOTION INTEGRITY", decision: "ACCEPT" },
  { name: "ACCESSIBILITY + FALLBACK + PERFORMANCE", decision: "PENDING HUMAN REVIEW" },
]);
const R2_TASK_SCOPE = Object.freeze(["src/components/SiteHeader.astro"]);
const R2_TASK_REQUIREMENTS = Object.freeze(["native details/summary semantics", "nine-control deterministic focus containment", "Escape focus return and lifecycle cleanup", "native no-JavaScript disclosure", "cross-engine focus and axe authority", "genuine installed Chrome 200 percent authority", "frozen creative and Phase 4 media integrity"]);

const ROLE_BY_PATH = new Map(REQUIRED_R2_EVIDENCE.map(({ relativePath, role }) => [relativePath, role]));
const HASH_40 = /^[0-9a-f]{40}$/;
const ARCHIVE_EXTENSION = /\.(?:zip|7z|rar|tar|tgz|gz|bz2|xz)$/i;
const FONT_EXTENSION = /\.(?:woff2?|ttf|otf|eot)$/i;
const SOURCE_MEDIA_EXTENSION = /\.(?:mov|mkv|avi|webm|m4v|blend|exr|tiff?)$/i;
const FORBIDDEN_SEGMENT = /^(?:node_modules|src|source|sources|raw|raw-media|raw_frames?|traces?|profiles?|private|secrets?|credentials?|\.git|\.astro|\.cache|cache|code cache|gpucache|browser-cache|user data|default|service worker|__pycache__)$/i;
const WINDOWS_ABSOLUTE = /(?:^|[\s"'(=\[])\p{L}:[\\/]/imu;
const POSIX_ABSOLUTE = /(?:^|[\s"'(=\[])\/(?:Users|home|tmp|private|root|workspace|workspaces|var\/folders|mnt\/[a-z])(?:\/|\b)/imu;
const PRIVATE_MARKER = /(?:^|[\\/])\.codex(?:[\\/]|$)|\b(?:OneDrive|AppData|LocalCache)\b|file:\/\/|\\\\[^\\\s]+\\[^\\\s]+/i;
const SECRET_MARKER = /(?:github_pat_[a-z0-9_]+|gh[pousr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;
const RAW_PHASE4_HASHES = new Set(PHYSICAL_ASSETS.map(([, hash]) => hash));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  invariant(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${label} field inventory differs`);
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function assertExternalR2AuditPath(candidate, label = "path", { repositoryRoot = ROOT, temporaryRoot = os.tmpdir() } = {}) {
  invariant(typeof candidate === "string" && path.isAbsolute(candidate), `${label} must be absolute`);
  const resolved = path.resolve(candidate);
  invariant(!isWithin(repositoryRoot, resolved), `${label} must stay outside the Git repository`);
  invariant(!isWithin(temporaryRoot, resolved), `${label} must stay outside the OS temporary directory`);
  return resolved;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function lexicalCompare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) return Object.fromEntries(Object.keys(value).sort(lexicalCompare).map((key) => [key, stableValue(value[key])]));
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

export function safeR2AuditPath(value, label = "R2 ZIP entry") {
  invariant(typeof value === "string" && value.length > 0, `${label} is missing`);
  invariant(!value.includes("\\") && !value.includes("\0") && !path.posix.isAbsolute(value) && !/^[a-z]:/i.test(value), `${label} must be a portable relative path`);
  invariant(path.posix.normalize(value) === value && !value.split("/").some((part) => !part || part === "." || part === ".."), `${label} is unsafe`);
  invariant(!/%(?:2e|2f|5c)/i.test(value), `${label} contains encoded path reinterpretation`);
  return value;
}

export function assertAllowedR2AuditPath(relativePath) {
  safeR2AuditPath(relativePath);
  invariant(relativePath !== IN_ARCHIVE_MANIFEST, `${IN_ARCHIVE_MANIFEST} is reserved for the embedded manifest`);
  const segments = relativePath.split("/");
  invariant(!segments.some((segment) => FORBIDDEN_SEGMENT.test(segment)), `forbidden source/cache/private path: ${relativePath}`);
  invariant(!ARCHIVE_EXTENSION.test(relativePath), `nested archive is forbidden: ${relativePath}`);
  invariant(!FONT_EXTENSION.test(relativePath), `font binary is forbidden: ${relativePath}`);
  invariant(!SOURCE_MEDIA_EXTENSION.test(relativePath), `source media is forbidden: ${relativePath}`);
  invariant(ROLE_BY_PATH.has(relativePath), `entry is outside the closed R2 compact topology: ${relativePath}`);
  return true;
}

function scanText(bytes, relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  const isText = [".json", ".md", ".txt", ".diff", ".csv", ".html"].includes(extension) || relativePath === IN_ARCHIVE_MANIFEST;
  const data = Buffer.from(bytes);
  return isText ? data.toString("utf8") : (data.toString("latin1").match(/[\x20-\x7e]{24,}/g) ?? []).join("\n");
}

export function assertNoPrivateOrSecretR2Payload(bytes, relativePath) {
  const text = scanText(bytes, relativePath);
  invariant(!WINDOWS_ABSOLUTE.test(relativePath) && !POSIX_ABSOLUTE.test(relativePath) && !PRIVATE_MARKER.test(relativePath) && !SECRET_MARKER.test(relativePath), `privacy or secret scan failed in path: ${relativePath}`);
  invariant(!WINDOWS_ABSOLUTE.test(text) && !POSIX_ABSOLUTE.test(text) && !PRIVATE_MARKER.test(text) && !SECRET_MARKER.test(text), `privacy or secret scan failed in payload: ${relativePath}`);
  invariant(!text.includes("\0"), `text/privacy scan found a NUL payload: ${relativePath}`);
  return true;
}

function parseJson(bytes, relativePath) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error(`invalid JSON payload: ${relativePath}`); }
}

function assertIsoBmff(bytes, relativePath) {
  const data = Buffer.from(bytes);
  invariant(data.length >= 24, `recording is too small: ${relativePath}`);
  let cursor = 0;
  const types = [];
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

function assertSignature(bytes, relativePath) {
  const data = Buffer.from(bytes);
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (extension === ".json") parseJson(data, relativePath);
  else if (extension === ".png") invariant(data.length >= 8 && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")), `PNG signature differs: ${relativePath}`);
  else if (extension === ".mp4") assertIsoBmff(data, relativePath);
  else if (extension === ".diff") invariant(!data.includes(0), `diff contains NUL bytes: ${relativePath}`);
  else throw new Error(`unexpected R2 payload type: ${relativePath}`);
}

function validateSourceAuthority(document) {
  exactKeys(document, ["schema", "status", "branch", "parent", "head", "acceptedPhase6", "acceptedPhase6Ancestry", "localMain", "originMain", "mergeCount", "commits", "worktreeClean", "worktreeStatus", "upstream", "upstreamHead", "upstreamParity", "productionChangedPaths", "build"], "R2 source authority");
  invariant(document?.schema === R2_SOURCE_AUTHORITY_SCHEMA && document.status === "PASS", "R2 source authority schema/status differs");
  invariant(document.branch === R2_BRANCH && document.parent === PHASE7A_R2_PARENT, "R2 source authority branch/parent differs");
  invariant(HASH_40.test(document.head ?? "") && document.head !== document.parent, "R2 source authority final HEAD differs");
  invariant(document.acceptedPhase6 === PHASE7A_PARENT && document.acceptedPhase6Ancestry === true && document.localMain === FROZEN_MAIN && document.originMain === FROZEN_MAIN && document.mergeCount === 0, "R2 source ancestry/main authority differs");
  invariant(Array.isArray(document.commits) && document.commits.length > 0 && document.commits.every((commit) => HASH_40.test(commit?.hash ?? "") && HASH_40.test(commit?.parent ?? "") && typeof commit.subject === "string"), "R2 commit authority differs");
  invariant(document.commits[0].parent === PHASE7A_R2_PARENT && document.commits.at(-1).hash === document.head && document.commits.every((commit, index) => index === 0 || commit.parent === document.commits[index - 1].hash), "R2 linear commit authority differs");
  invariant(document.worktreeClean === true && Array.isArray(document.worktreeStatus) && document.worktreeStatus.length === 0 && document.upstream === `origin/${R2_BRANCH}` && document.upstreamHead === document.head && document.upstreamParity === true, "R2 source cleanliness/upstream differs");
  invariant(JSON.stringify(document.productionChangedPaths) === JSON.stringify(R2_TASK_SCOPE), "R2 production scope differs");
  exactKeys(document.build, ["command", "status", "head", "worktreeClean", "errors", "warnings", "hints"], "R2 build receipt");
  invariant(document.build.command === "npm run check:phase7a-r2" && document.build.status === "PASS" && document.build.head === document.head && document.build.worktreeClean === true && document.build.errors === 0 && ["warnings", "hints"].every((key) => Number.isSafeInteger(document.build[key]) && document.build[key] >= 0), "R2 build receipt differs");
}

function validateSupportingAuthorities(entries) {
  const document = (relativePath) => parseJson(entries.get(relativePath).data, relativePath);
  const task = document("00-authority/task-authority.json");
  exactKeys(task, ["schema", "status", "parent", "reviewZipName", "authorityDocument", "scope", "requirements"], "R2 task authority");
  invariant(task.schema === R2_TASK_AUTHORITY_SCHEMA && task.status === "PASS" && task.parent === PHASE7A_R2_PARENT && task.reviewZipName === PHASE7A_R2_REVIEW_ZIP_NAME, "R2 task authority differs");
  exactKeys(task.authorityDocument, ["path", "bytes", "sha256"], "R2 task authority document");
  invariant(task.authorityDocument.path === "docs/phase-7a-r2-review-authority.md" && Number.isSafeInteger(task.authorityDocument.bytes) && task.authorityDocument.bytes > 0 && /^[0-9a-f]{64}$/.test(task.authorityDocument.sha256 ?? "") && JSON.stringify(task.scope) === JSON.stringify(R2_TASK_SCOPE) && JSON.stringify(task.requirements) === JSON.stringify(R2_TASK_REQUIREMENTS), "R2 task authority document/scope differs");
  const gates = document("00-authority/human-gates-status.json");
  exactKeys(gates, ["schema", "status", "gates"], "R2 human gates");
  invariant(gates.schema === R2_HUMAN_GATES_SCHEMA && gates.status === "PENDING_HUMAN_REVIEW" && sameJson(gates.gates, R2_HUMAN_GATES), "R2 human-gates status differs");
  const source = document("01-provenance/source-authority.json");
  validateSourceAuthority(source);
  const deployment = document("01-provenance/deployment-binding.json");
  exactKeys(deployment, ["schema", "status", "parent", "head", "deploymentId", "immutableUrl", "branchUrl", "deployedSha", "signedCheck", "localDist", "deployedParity"], "R2 deployment binding");
  invariant(deployment.schema === R2_DEPLOYMENT_BINDING_SCHEMA && deployment.status === "PASS" && deployment.parent === source.parent && deployment.head === source.head && deployment.deployedSha === source.head && typeof deployment.deploymentId === "string" && deployment.deploymentId.length > 0 && /^https:\/\//.test(deployment.immutableUrl ?? "") && /^https:\/\//.test(deployment.branchUrl ?? ""), "R2 deployment binding differs");
  exactKeys(deployment.signedCheck, ["name", "workflow", "commitSha", "status"], "R2 deployment signed check");
  invariant(deployment.signedCheck.commitSha === source.head && deployment.signedCheck.status === "PASS" && deployment.signedCheck.name && deployment.signedCheck.workflow, "R2 deployment signed-check identity differs");
  exactKeys(deployment.localDist, ["path", "bytes", "sha256"], "R2 deployment local dist");
  invariant(deployment.localDist.path === "dist/index.html" && Number.isSafeInteger(deployment.localDist.bytes) && deployment.localDist.bytes > 0 && /^[0-9a-f]{64}$/.test(deployment.localDist.sha256 ?? ""), "R2 deployment local dist differs");
  exactKeys(deployment.deployedParity, ["immutable", "branch"], "R2 deployed parity");
  for (const [label, receipt] of Object.entries(deployment.deployedParity)) {
    exactKeys(receipt, ["status", "httpStatus", "bytes", "sha256"], `R2 ${label} deployed parity`);
    invariant(receipt.status === "PASS" && receipt.httpStatus === 200 && receipt.bytes === deployment.localDist.bytes && receipt.sha256 === deployment.localDist.sha256, `R2 ${label} deployed parity differs`);
  }
  const aria = document("02-diff/aria-before-after.json");
  exactKeys(aria, ["schema", "status", "before", "after"], "R2 ARIA before/after");
  invariant(aria.schema === R2_ARIA_DIFF_SCHEMA && aria.status === "PASS" && Array.isArray(aria.before) && Array.isArray(aria.after) && aria.before.every((item) => typeof item === "string") && aria.after.every((item) => typeof item === "string"), "R2 ARIA before/after differs");
  validateR2FieldMapFocusAuthority(document("03-focus/raw-cross-engine-focus.json"));
  const installed = document("05-chrome-200/installed-chrome-200.json");
  exactKeys(installed, ["schema", "status", "genuineInstalledChrome", "nativeZoomPercent", "report"], "R2 installed Chrome 200 authority");
  invariant(installed.schema === R2_INSTALLED_CHROME_SCHEMA && installed.status === "PASS" && installed.genuineInstalledChrome === true && installed.nativeZoomPercent === 200 && installed.report && typeof installed.report === "object", "R2 installed Chrome 200 authority differs");
  validateR2AxeAuthority(document("06-accessibility/axe-and-manual-contrast.json"));
  validateR2TargetAuthority(document("06-accessibility/target-inventory.json"));
  for (const relativePath of ["07-regression/focused-regression.json", "07-regression/retained-suite.json"]) {
    const receipt = document(relativePath);
    exactKeys(receipt, ["schema", "status", "command", "testCount", "failures", "checks", "engineSummaries", "reportHashes"], relativePath);
    const expectedCommand = relativePath.endsWith("retained-suite.json") ? "npm run check:phase7a-r2" : "node --test tests/phase7a-r2-field-map-authority.test.mjs tests/phase7a-r2-evidence-assembler.test.mjs";
    invariant(receipt.schema === R2_TEST_RECEIPT_SCHEMA && receipt.status === "PASS" && receipt.command === expectedCommand && Number.isSafeInteger(receipt.testCount) && receipt.testCount > 0 && receipt.failures === 0, `R2 test receipt differs: ${relativePath}`);
    invariant(receipt.checks && Object.keys(receipt.checks).length > 0 && Object.values(receipt.checks).every((value) => value === true), `R2 test checks differ: ${relativePath}`);
    invariant(Array.isArray(receipt.engineSummaries) && receipt.engineSummaries.length === 3 && receipt.engineSummaries.every((row, index) => row.engine === ["chromium", "firefox", "webkit"][index] && row.status === "PASS" && Number.isSafeInteger(row.passCount) && row.passCount > 0 && row.failures === 0), `R2 test engine summaries differ: ${relativePath}`);
    invariant(Array.isArray(receipt.reportHashes) && receipt.reportHashes.length >= 3 && receipt.reportHashes.every((row) => typeof row.name === "string" && /^[0-9a-f]{64}$/.test(row.sha256 ?? "")), `R2 test report hashes differ: ${relativePath}`);
  }
  const phase4 = document("08-governance/phase4-hashes.json");
  exactKeys(phase4, ["schema", "status", "assets"], "R2 Phase 4 hashes");
  const expectedAssets = PHYSICAL_ASSETS.map(([assetPath, assetSha256]) => ({ path: assetPath, sha256: assetSha256 }));
  invariant(phase4.schema === R2_PHASE4_HASH_SCHEMA && phase4.status === "PASS" && JSON.stringify(phase4.assets) === JSON.stringify(expectedAssets), "R2 Phase 4 authoritative hashes differ");
  const limitations = document("08-governance/environmental-limitations.json");
  exactKeys(limitations, ["schema", "status", "limitations", "creativeStability"], "R2 environmental limitations");
  invariant(limitations.schema === R2_LIMITATIONS_SCHEMA && limitations.status === "DECLARED" && Array.isArray(limitations.limitations) && limitations.limitations.length > 0 && limitations.limitations.every((item) => typeof item === "string" && item.length > 0), "R2 environmental limitations differ");
  exactKeys(limitations.creativeStability, ["baselineRevision", "currentRevision", "comparisons"], "R2 creative stability");
  invariant(limitations.creativeStability.baselineRevision === PHASE7A_R2_PARENT && limitations.creativeStability.currentRevision === source.head && Array.isArray(limitations.creativeStability.comparisons) && limitations.creativeStability.comparisons.length === 2, "R2 creative stability authority differs");
  for (const [index, comparison] of limitations.creativeStability.comparisons.entries()) {
    exactKeys(comparison, ["state", "baselinePath", "baselineSha256", "currentPath", "currentSha256", "comparison", "status"], `R2 creative stability comparison ${index + 1}`);
    invariant(comparison.state === ["closed", "open"][index] && /^[0-9a-f]{64}$/.test(comparison.baselineSha256 ?? "") && /^[0-9a-f]{64}$/.test(comparison.currentSha256 ?? "") && ["EXACT_BYTES", "EXACT_DECODED_PIXELS"].includes(comparison.comparison) && comparison.status === "PASS", `R2 creative stability comparison ${index + 1} differs`);
  }
  const audit = document("09-audit/prepackage-evidence-audit.json");
  exactKeys(audit, ["schema", "status", "auditedPayloadCount", "finalPayloadCount", "auditedPayloadBytes", "selfExclusion", "payloads", "checks", "mediaDecode"], "R2 prepackage audit");
  const auditedEntries = [...entries].filter(([relativePath]) => relativePath !== "09-audit/prepackage-evidence-audit.json");
  invariant(audit.schema === R2_PREPACKAGE_AUDIT_SCHEMA && audit.status === "PASS" && audit.auditedPayloadCount === auditedEntries.length && audit.finalPayloadCount === REQUIRED_R2_EVIDENCE.length && audit.auditedPayloadBytes === auditedEntries.reduce((sum, [, entry]) => sum + entry.data.length, 0), "R2 prepackage audit summary differs");
  invariant(audit.selfExclusion === "prepackage audit excludes its own bytes to avoid self-reference", "R2 prepackage audit self-exclusion differs");
  const expectedRows = auditedEntries.map(([relativePath, entry]) => ({ path: relativePath, bytes: entry.data.length, sha256: sha256(entry.data), status: "PASS" }));
  invariant(sameJson(audit.payloads, expectedRows), "R2 prepackage payload ledger differs");
  invariant(sameJson(audit.checks, { topology: "PASS", pathSafety: "PASS", privacyAndSecrets: "PASS", forbiddenPayloadClasses: "PASS", semanticAuthority: "PASS" }) && sameJson(audit.mediaDecode, { png: "PASS", pngCount: 11, mp4: "PASS", mp4Count: 3 }), "R2 prepackage audit checks/decode differ");
}

function validateProductionDiff(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  invariant(text.includes("diff --git a/src/components/SiteHeader.astro b/src/components/SiteHeader.astro"), "R2 production diff omits SiteHeader focus semantics");
  const headers = [...text.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)];
  invariant(headers.length === 1 && headers[0][1] === "src/components/SiteHeader.astro" && headers[0][2] === "src/components/SiteHeader.astro", "R2 production diff escapes the single-file scope");
}

function roleFor(relativePath) {
  return ROLE_BY_PATH.get(relativePath);
}

function recordFor(relativePath, entry) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return {
    path: relativePath,
    role: roleFor(relativePath),
    kind: extension === ".png" ? "image" : extension === ".mp4" ? "video" : "document",
    bytes: entry.data.length,
    sha256: sha256(entry.data),
    crc32: entry.crc32,
  };
}

function expectedManifest(payloads) {
  return {
    schema: R2_MANIFEST_SCHEMA,
    archiveFilename: PHASE7A_R2_REVIEW_ZIP_NAME,
    deterministicEncoding: "canonical ZIP32 stored UTF-8; lexical entry order; DOS 1980-01-01 00:00:00",
    authority: { branch: R2_BRANCH, exactParent: PHASE7A_R2_PARENT },
    sourceEvidence: { explicitExternalRootRequired: true, privatePathPublished: false },
    requiredEvidence: REQUIRED_R2_EVIDENCE,
    payloads,
    summary: {
      payloadCount: payloads.length,
      payloadBytes: payloads.reduce((sum, item) => sum + item.bytes, 0),
      imageCount: payloads.filter(({ kind }) => kind === "image").length,
      recordingCount: payloads.filter(({ kind }) => kind === "video").length,
    },
  };
}

function inspectR2Package(archiveInput) {
  const archiveBytes = Buffer.from(archiveInput);
  const parsed = parseStoredZip(archiveBytes, MAX_ARCHIVE_BYTES);
  invariant(parsed.crcValidated === true && parsed.deterministic === true, "R2 ZIP CRC/deterministic authority differs");
  invariant(parsed.entries.has(IN_ARCHIVE_MANIFEST), `R2 ZIP omits ${IN_ARCHIVE_MANIFEST}`);
  invariant(parsed.entries.size === REQUIRED_R2_EVIDENCE.length + 1, "R2 ZIP entry count differs");
  const payloadEntries = new Map();
  const folded = new Set();
  for (const [relativePath, entry] of parsed.entries) {
    const key = relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    invariant(!folded.has(key), `case-folded duplicate ZIP path: ${relativePath}`);
    folded.add(key);
    assertNoPrivateOrSecretR2Payload(entry.data, relativePath);
    if (relativePath === IN_ARCHIVE_MANIFEST) continue;
    assertAllowedR2AuditPath(relativePath);
    assertSignature(entry.data, relativePath);
    invariant(!RAW_PHASE4_HASHES.has(sha256(entry.data)), `raw/governed Phase 4 payload is forbidden: ${relativePath}`);
    payloadEntries.set(relativePath, entry);
  }
  invariant(payloadEntries.size === REQUIRED_R2_EVIDENCE.length && REQUIRED_R2_EVIDENCE.every(({ relativePath }) => payloadEntries.has(relativePath)), "R2 compact payload topology differs");

  validatePhase7aR2FieldMapAuthority(parseJson(payloadEntries.get("00-authority/r2-field-map-authority.json").data, "R2 semantic authority"));
  validateProductionDiff(payloadEntries.get("02-diff/production.diff").data);
  validateSupportingAuthorities(payloadEntries);

  const payloads = [...payloadEntries].map(([relativePath, entry]) => recordFor(relativePath, entry));
  const manifestEntry = parsed.entries.get(IN_ARCHIVE_MANIFEST);
  const manifest = parseJson(manifestEntry.data, IN_ARCHIVE_MANIFEST);
  invariant(Buffer.from(stableJson(manifest)).equals(manifestEntry.data), "R2 embedded manifest is not canonical JSON");
  invariant(sameJson(manifest, expectedManifest(payloads)), "R2 embedded manifest differs from independently reconstructed payload bytes/hashes");
  const crcRows = [...parsed.entries].map(([entryPath, entry]) => ({ path: entryPath, crc32: entry.crc32 }));

  return {
    entries: payloadEntries,
    report: {
      schema: R2_AUDIT_SCHEMA,
      status: "PASS",
      archive: { filename: PHASE7A_R2_REVIEW_ZIP_NAME, bytes: archiveBytes.length, sha256: sha256(archiveBytes), entryCount: parsed.entries.size },
      embeddedManifest: { path: IN_ARCHIVE_MANIFEST, bytes: manifestEntry.data.length, sha256: sha256(manifestEntry.data) },
      crc32: { status: "PASS", entryCount: parsed.entries.size, aggregateSha256: sha256(Buffer.from(stableJson(crcRows))) },
      payloads: payloads.map((payload) => ({ ...payload, byteStatus: "PASS", sha256Status: "PASS", crc32Status: "PASS" })),
      security: {
        pathSafety: "PASS",
        traversal: "PASS",
        duplicates: "PASS",
        nestedArchives: "PASS",
        fonts: "PASS",
        rawPhase4: "PASS",
        sourceMedia: "PASS",
        nodeModulesAndBrowserCaches: "PASS",
        privacyAndSecrets: "PASS",
      },
      checks: {
        exactEntryCount: "PASS",
        canonicalStoredZip: "PASS",
        crc32EveryEntry: "PASS",
        payloadBytesAndSha256: "PASS",
        closedCompactTopology: "PASS",
        forbiddenPayloadClasses: "PASS",
        privacyAndSecrets: "PASS",
        semanticAuthority: "PASS",
        embeddedManifestBinding: "PASS",
      },
      imageDecodeStatus: "PENDING FULL DECODE",
      recordingDecodeStatus: "PENDING FULL DECODE",
    },
  };
}

export function auditR2PackageBytes({ archiveBytes }) {
  return Object.freeze(inspectR2Package(archiveBytes).report);
}

async function decodePngs(entries, sharpOverride = null) {
  const images = [...entries].filter(([relativePath]) => relativePath.endsWith(".png"));
  invariant(images.length === 11, "R2 full decode requires exactly eleven PNGs");
  let sharp = sharpOverride;
  if (!sharp) {
    try { ({ default: sharp } = await import("sharp")); }
    catch (error) { throw new Error(`sharp is required for R2 PNG full decode: ${error.message}`); }
  }
  const files = [];
  for (const [relativePath, entry] of images) {
    const decoded = await sharp(entry.data, { failOn: "error", limitInputPixels: 100_000_000, sequentialRead: true }).raw().toBuffer({ resolveWithObject: true });
    invariant(decoded.data.length > 0 && decoded.info.width > 0 && decoded.info.height > 0, `R2 PNG full decode produced no pixels: ${relativePath}`);
    files.push({ path: relativePath, status: "PASS", width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels, decodedBytes: decoded.data.length });
  }
  return { status: "PASS", count: files.length, decoder: `sharp ${sharp.versions?.sharp ?? "supplied"}`, files };
}

async function resolveFfmpeg(supplied = null) {
  const candidates = [...new Set([supplied, process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean))];
  for (const command of candidates) {
    try {
      const result = await execFileAsync(command, ["-version"], { windowsHide: true, maxBuffer: 1024 * 1024 });
      return { command, version: String(result.stdout).split(/\r?\n/, 1)[0] };
    } catch { /* try the next candidate */ }
  }
  throw new Error("FFmpeg is required for R2 MP4 full decode");
}

async function decodeMp4(entries, { ffmpeg = null, recordingDecoder = null } = {}) {
  const recordings = [...entries].filter(([relativePath]) => relativePath.endsWith(".mp4"));
  const expected = ["03-focus/chromium-focus-cycle.mp4", "03-focus/firefox-focus-cycle.mp4", "03-focus/webkit-focus-cycle.mp4"];
  invariant(recordings.length === expected.length && recordings.every(([relativePath], index) => relativePath === expected[index]), "R2 full decode requires the exact cross-engine focus-cycle MP4s");
  if (recordingDecoder) {
    const files = [];
    for (const [relativePath, entry] of recordings) {
      const result = await recordingDecoder({ relativePath, bytes: Buffer.from(entry.data) });
      invariant(result === true || result?.status === "PASS", `supplied R2 MP4 decoder rejected: ${relativePath}`);
      files.push({ path: relativePath, status: "PASS" });
    }
    return { status: "PASS", count: files.length, decoder: "supplied full-decode verifier", files };
  }
  const resolved = await resolveFfmpeg(ffmpeg);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qh-phase7a-r2-decode-"));
  try {
    const files = [];
    for (const [relativePath, entry] of recordings) {
      const file = path.join(temporary, path.basename(relativePath));
      await writeFile(file, entry.data, { flag: "wx" });
      await execFileAsync(resolved.command, ["-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-i", file, "-map", "0:v:0", "-f", "null", "-"], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      files.push({ path: relativePath, status: "PASS" });
    }
    return { status: "PASS", count: files.length, decoder: resolved.version, files };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function auditR2ReviewBytes({ archiveBytes, sharp = null, ffmpeg = null, recordingDecoder = null }) {
  const inspected = inspectR2Package(archiveBytes);
  const [images, recordings] = await Promise.all([
    decodePngs(inspected.entries, sharp),
    decodeMp4(inspected.entries, { ffmpeg, recordingDecoder }),
  ]);
  return Object.freeze({
    ...inspected.report,
    mediaDecode: { images, recordings },
    imageDecodeStatus: images.status,
    recordingDecodeStatus: recordings.status,
    checks: { ...inspected.report.checks, pngFullDecode: "PASS", mp4FullDecode: "PASS" },
  });
}

async function atomicExclusiveWrite(filePath, bytes) {
  try { await lstat(filePath); throw new Error(`refusing to overwrite existing report: ${filePath}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let temporaryCreated = false;
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    await link(temporaryPath, filePath);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`refusing to overwrite existing report: ${filePath}`);
    throw error;
  } finally {
    if (temporaryCreated) await unlink(temporaryPath).catch(() => {});
  }
}

export async function auditR2ReviewFile({ zipPath, reportPath, boundaryOptions = {}, sharp = null, ffmpeg = null, recordingDecoder = null }) {
  const absoluteZipPath = assertExternalR2AuditPath(path.resolve(zipPath), "--zip", boundaryOptions);
  const absoluteReportPath = assertExternalR2AuditPath(path.resolve(reportPath), "--report", boundaryOptions);
  invariant(path.basename(absoluteZipPath) === PHASE7A_R2_REVIEW_ZIP_NAME, `--zip basename must be ${PHASE7A_R2_REVIEW_ZIP_NAME}`);
  invariant(absoluteZipPath !== absoluteReportPath, "--zip and --report must differ");
  const zipStatus = await lstat(absoluteZipPath);
  invariant(zipStatus.isFile() && !zipStatus.isSymbolicLink() && zipStatus.size > 0 && zipStatus.size <= MAX_ARCHIVE_BYTES, "R2 ZIP file boundary differs");
  invariant(path.resolve(await realpath(absoluteZipPath)) === absoluteZipPath, "R2 ZIP may not traverse a symlink");
  const archiveBytes = await readFile(absoluteZipPath);
  const audited = await auditR2ReviewBytes({ archiveBytes, sharp, ffmpeg, recordingDecoder });
  const report = Object.freeze({ ...audited, zipPath: absoluteZipPath, reportPath: absoluteReportPath });
  await mkdir(path.dirname(absoluteReportPath), { recursive: true });
  const reportDirectoryStatus = await lstat(path.dirname(absoluteReportPath));
  invariant(reportDirectoryStatus.isDirectory() && !reportDirectoryStatus.isSymbolicLink(), "audit report directory must be a real directory");
  invariant(path.resolve(await realpath(path.dirname(absoluteReportPath))) === path.resolve(path.dirname(absoluteReportPath)), "audit report directory may not traverse a symlink");
  await atomicExclusiveWrite(absoluteReportPath, Buffer.from(stableJson(report)));
  return report;
}

export function parseArguments(argv, { boundaryOptions = {} } = {}) {
  const options = { zipPath: null, reportPath: null, ffmpeg: null, selfTest: false, help: false };
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
    else if (flag === "--ffmpeg") options.ffmpeg = next(index++, flag);
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.selfTest && !options.help) {
    invariant(options.zipPath, "--zip is required");
    invariant(options.reportPath, "--report is required");
    options.zipPath = assertExternalR2AuditPath(path.resolve(options.zipPath), "--zip", boundaryOptions);
    options.reportPath = assertExternalR2AuditPath(path.resolve(options.reportPath), "--report", boundaryOptions);
    invariant(path.basename(options.zipPath) === PHASE7A_R2_REVIEW_ZIP_NAME, `--zip basename must be ${PHASE7A_R2_REVIEW_ZIP_NAME}`);
  }
  return options;
}

export function runSelfTest() {
  invariant(REQUIRED_R2_EVIDENCE.length === 30, "R2 independent audit topology drifted");
  return Object.freeze({ schema: R2_AUDIT_SCHEMA, status: "PASS", reviewZipName: PHASE7A_R2_REVIEW_ZIP_NAME, requiredPayloads: 30, realFileAuditEnabled: true });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write("Usage: node scripts/audit-phase7a-r2-package.mjs --zip <external ZIP> --report <external JSON> [--ffmpeg <executable>]\n"); return; }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`); return; }
  const report = await auditR2ReviewFile(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { process.stderr.write(`Phase 7A-R2 independent audit FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
}
