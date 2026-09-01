import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, readdir, realpath, unlink } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { FROZEN_MAIN, PHASE7A_PARENT, PHYSICAL_ASSETS } from "./phase7a-contract.mjs";
import {
  crc32,
  createStoredZipBuffer,
  sha256,
  stableJson,
  validateIsoBmffRecording,
} from "./package-phase7a-human-review.mjs";
import {
  PHASE7A_R2_PARENT,
  PHASE7A_R2_REVIEW_ZIP_NAME,
  validateR2AxeAuthority,
  validateR2FieldMapFocusAuthority,
  validateR2TargetAuthority,
  validatePhase7aR2FieldMapAuthority,
} from "./phase7a-r2-field-map-authority.mjs";

export { PHASE7A_R2_REVIEW_ZIP_NAME };

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const R2_PACKAGE_SCHEMA = "quantum-hub.phase-7a-r2.field-map-focus-human-review.v1";
export const R2_MANIFEST_SCHEMA = `${R2_PACKAGE_SCHEMA}.manifest`;
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
export const MAX_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

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
  required("06-accessibility/chromium-bifurcation-background-mask.png", "raster-evidence"),
  required("06-accessibility/firefox-bifurcation-background-mask.png", "raster-evidence"),
  required("06-accessibility/chromium-field-map-open-background-mask.png", "raster-evidence"),
  required("06-accessibility/firefox-field-map-open-background-mask.png", "raster-evidence"),
  required("07-regression/focused-regression.json", "regression-authority"),
  required("07-regression/retained-suite.json", "retained-suite-authority"),
  required("08-governance/phase4-hashes.json", "phase4-hash-authority"),
  required("08-governance/environmental-limitations.json", "environmental-limitations"),
  required("09-audit/prepackage-evidence-audit.json", "prepackage-audit"),
]);

export const R2_HUMAN_GATES = Object.freeze([
  Object.freeze({ name: "RETENTION + DEMOLITION DISCIPLINE", decision: "ACCEPT" }),
  Object.freeze({ name: "FROZEN OPENING INTEGRITY", decision: "ACCEPT" }),
  Object.freeze({ name: "SIGNAL FIELD CREATIVE AUTHORITY", decision: "ACCEPT" }),
  Object.freeze({ name: "TYPOGRAPHY + MATERIAL AUTHORITY", decision: "ACCEPT" }),
  Object.freeze({ name: "NATIVE-SCROLL + MOTION INTEGRITY", decision: "ACCEPT" }),
  Object.freeze({ name: "ACCESSIBILITY + FALLBACK + PERFORMANCE", decision: "PENDING HUMAN REVIEW" }),
]);
export const R2_TASK_SCOPE = Object.freeze(["src/components/SiteHeader.astro"]);
export const R2_TASK_REQUIREMENTS = Object.freeze([
  "native details/summary semantics",
  "nine-control deterministic focus containment",
  "Escape focus return and lifecycle cleanup",
  "native no-JavaScript disclosure",
  "cross-engine focus and axe authority",
  "genuine installed Chrome 200 percent authority",
  "frozen creative and Phase 4 media integrity",
]);

const REQUIRED_ROLE = new Map(REQUIRED_R2_EVIDENCE.map(({ relativePath, role }) => [relativePath, role]));
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
const CONTRAST_MASK_PATHS = Object.freeze([
  "06-accessibility/chromium-bifurcation-background-mask.png",
  "06-accessibility/firefox-bifurcation-background-mask.png",
  "06-accessibility/chromium-field-map-open-background-mask.png",
  "06-accessibility/firefox-field-map-open-background-mask.png",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  invariant(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${label} field inventory differs`);
}

function lexicalCompare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function crc32Hex(bytes) {
  return crc32(bytes).toString(16).padStart(8, "0");
}

export function safeR2EvidencePath(value, label = "R2 evidence path") {
  invariant(typeof value === "string" && value.length > 0, `${label} is missing`);
  invariant(!value.includes("\\") && !value.includes("\0") && !path.posix.isAbsolute(value) && !/^[a-z]:/i.test(value), `${label} must be a portable relative path`);
  invariant(path.posix.normalize(value) === value && !value.split("/").some((part) => !part || part === "." || part === ".."), `${label} is unsafe`);
  invariant(!/%(?:2e|2f|5c)/i.test(value), `${label} contains encoded path reinterpretation`);
  return value;
}

export function assertAllowedR2EvidencePath(relativePath) {
  safeR2EvidencePath(relativePath);
  invariant(relativePath !== IN_ARCHIVE_MANIFEST, `${IN_ARCHIVE_MANIFEST} is reserved for the embedded manifest`);
  const segments = relativePath.split("/");
  invariant(!segments.some((segment) => FORBIDDEN_SEGMENT.test(segment)), `forbidden source/cache/private path: ${relativePath}`);
  invariant(!ARCHIVE_EXTENSION.test(relativePath), `nested archive is forbidden: ${relativePath}`);
  invariant(!FONT_EXTENSION.test(relativePath), `font binary is forbidden: ${relativePath}`);
  invariant(!SOURCE_MEDIA_EXTENSION.test(relativePath), `source media is forbidden: ${relativePath}`);
  invariant(REQUIRED_ROLE.has(relativePath), `entry is outside the closed R2 compact topology: ${relativePath}`);
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

function validateSourceAuthority(document) {
  exactKeys(document, ["schema", "status", "branch", "parent", "head", "acceptedPhase6", "acceptedPhase6Ancestry", "localMain", "originMain", "mergeCount", "commits", "worktreeClean", "worktreeStatus", "upstream", "upstreamHead", "upstreamParity", "productionChangedPaths", "build"], "R2 source authority");
  invariant(document?.schema === R2_SOURCE_AUTHORITY_SCHEMA && document.status === "PASS", "R2 source authority schema/status differs");
  invariant(document.branch === R2_BRANCH && document.parent === PHASE7A_R2_PARENT, "R2 source authority branch/parent differs");
  invariant(HASH_40.test(document.head ?? "") && document.head !== document.parent, "R2 source authority final HEAD differs");
  invariant(document.acceptedPhase6 === PHASE7A_PARENT && document.acceptedPhase6Ancestry === true, "R2 accepted Phase 6 ancestry differs");
  invariant(document.localMain === FROZEN_MAIN && document.originMain === FROZEN_MAIN && document.mergeCount === 0, "R2 frozen main or merge authority differs");
  invariant(Array.isArray(document.commits) && document.commits.length > 0 && document.commits.every((commit) => HASH_40.test(commit?.hash ?? "") && HASH_40.test(commit?.parent ?? "") && typeof commit.subject === "string"), "R2 commit authority differs");
  invariant(document.commits[0].parent === PHASE7A_R2_PARENT && document.commits.at(-1).hash === document.head, "R2 first-parent commit chain differs");
  invariant(document.commits.every((commit, index) => index === 0 || commit.parent === document.commits[index - 1].hash), "R2 linear commit authority differs");
  invariant(document.worktreeClean === true && Array.isArray(document.worktreeStatus) && document.worktreeStatus.length === 0, "R2 source cleanliness differs");
  invariant(document.upstream === `origin/${R2_BRANCH}` && document.upstreamHead === document.head && document.upstreamParity === true, "R2 upstream parity differs");
  invariant(JSON.stringify(document.productionChangedPaths) === JSON.stringify(R2_TASK_SCOPE), "R2 production scope differs");
  exactKeys(document.build, ["command", "status", "head", "worktreeClean", "errors", "warnings", "hints"], "R2 build receipt");
  invariant(document.build.command === "npm run check:phase7a-r2" && document.build.status === "PASS" && document.build.head === document.head && document.build.worktreeClean === true, "R2 build receipt differs");
  invariant(["errors", "warnings", "hints"].every((key) => Number.isSafeInteger(document.build[key]) && document.build[key] >= 0) && document.build.errors === 0, "R2 build diagnostics differ");
}

function validateSupportingAuthorities(entries) {
  const document = (relativePath) => parseJson(entries.find((entry) => entry.relativePath === relativePath).data, relativePath);
  const task = document("00-authority/task-authority.json");
  exactKeys(task, ["schema", "status", "parent", "reviewZipName", "authorityDocument", "scope", "requirements"], "R2 task authority");
  invariant(task.schema === R2_TASK_AUTHORITY_SCHEMA && task.status === "PASS" && task.parent === PHASE7A_R2_PARENT && task.reviewZipName === PHASE7A_R2_REVIEW_ZIP_NAME, "R2 task authority differs");
  exactKeys(task.authorityDocument, ["path", "bytes", "sha256"], "R2 task authority document");
  invariant(task.authorityDocument.path === "docs/phase-7a-r2-review-authority.md" && Number.isSafeInteger(task.authorityDocument.bytes) && task.authorityDocument.bytes > 0 && /^[0-9a-f]{64}$/.test(task.authorityDocument.sha256 ?? ""), "R2 task authority document binding differs");
  invariant(JSON.stringify(task.scope) === JSON.stringify(R2_TASK_SCOPE) && JSON.stringify(task.requirements) === JSON.stringify(R2_TASK_REQUIREMENTS), "R2 task normalized scope/requirements differ");

  const gates = document("00-authority/human-gates-status.json");
  exactKeys(gates, ["schema", "status", "gates"], "R2 human gates");
  invariant(gates.schema === R2_HUMAN_GATES_SCHEMA && gates.status === "PENDING_HUMAN_REVIEW" && stableJson(gates.gates) === stableJson(R2_HUMAN_GATES), "R2 human-gates status/inventory differs");

  const source = document("01-provenance/source-authority.json");
  validateSourceAuthority(source);
  const deployment = document("01-provenance/deployment-binding.json");
  exactKeys(deployment, ["schema", "status", "parent", "head", "deploymentId", "immutableUrl", "branchUrl", "deployedSha", "signedCheck", "localDist", "deployedParity"], "R2 deployment binding");
  invariant(deployment.schema === R2_DEPLOYMENT_BINDING_SCHEMA && deployment.status === "PASS" && deployment.parent === source.parent && deployment.head === source.head && deployment.deployedSha === source.head, "R2 deployment binding differs");
  invariant(typeof deployment.deploymentId === "string" && deployment.deploymentId.length > 0 && /^https:\/\//.test(deployment.immutableUrl ?? "") && /^https:\/\//.test(deployment.branchUrl ?? ""), "R2 deployment identity differs");
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
  invariant(aria.schema === R2_ARIA_DIFF_SCHEMA && aria.status === "PASS" && Array.isArray(aria.before) && Array.isArray(aria.after), "R2 ARIA before/after differs");
  invariant(aria.before.every((item) => typeof item === "string") && aria.after.every((item) => typeof item === "string"), "R2 ARIA inventories differ");

  validateR2FieldMapFocusAuthority(document("03-focus/raw-cross-engine-focus.json"));
  const installed = document("05-chrome-200/installed-chrome-200.json");
  exactKeys(installed, ["schema", "status", "genuineInstalledChrome", "nativeZoomPercent", "report"], "R2 installed Chrome 200 authority");
  invariant(installed.schema === R2_INSTALLED_CHROME_SCHEMA && installed.status === "PASS" && installed.genuineInstalledChrome === true && installed.nativeZoomPercent === 200 && installed.report && typeof installed.report === "object", "R2 installed Chrome 200 authority differs");
  const axe = document("06-accessibility/axe-and-manual-contrast.json");
  validateR2AxeAuthority(axe);
  const boundContrastPaths = new Set();
  for (const measurement of axe.manualContrast.selectorMeasurements) {
    const relativePath = `06-accessibility/${path.posix.basename(measurement.screenshot.path)}`;
    invariant(CONTRAST_MASK_PATHS.includes(relativePath) && !boundContrastPaths.has(relativePath), `R2 selector-local contrast screenshot path differs: ${relativePath}`);
    boundContrastPaths.add(relativePath);
    const entry = entries.find((candidate) => candidate.relativePath === relativePath);
    invariant(entry && entry.data.length >= 24 && entry.data.length === measurement.screenshot.bytes && sha256(entry.data) === measurement.screenshot.sha256
      && entry.data.readUInt32BE(16) === measurement.screenshot.width && entry.data.readUInt32BE(20) === measurement.screenshot.height, `R2 selector-local contrast screenshot binding differs: ${relativePath}`);
  }
  invariant(boundContrastPaths.size === CONTRAST_MASK_PATHS.length && CONTRAST_MASK_PATHS.every((relativePath) => boundContrastPaths.has(relativePath)), "R2 selector-local contrast screenshot inventory differs");
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
  invariant(phase4.schema === R2_PHASE4_HASH_SCHEMA && phase4.status === "PASS" && Array.isArray(phase4.assets), "R2 Phase 4 hash authority differs");
  const expectedAssets = PHYSICAL_ASSETS.map(([assetPath, assetSha256]) => ({ path: assetPath, sha256: assetSha256 }));
  invariant(JSON.stringify(phase4.assets) === JSON.stringify(expectedAssets), "R2 Phase 4 authoritative hashes differ");

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
  const auditedEntries = entries.filter(({ relativePath }) => relativePath !== "09-audit/prepackage-evidence-audit.json");
  invariant(audit.schema === R2_PREPACKAGE_AUDIT_SCHEMA && audit.status === "PASS" && audit.auditedPayloadCount === auditedEntries.length && audit.finalPayloadCount === REQUIRED_R2_EVIDENCE.length && audit.auditedPayloadBytes === auditedEntries.reduce((sum, entry) => sum + entry.data.length, 0), "R2 prepackage audit summary differs");
  invariant(audit.selfExclusion === "prepackage audit excludes its own bytes to avoid self-reference", "R2 prepackage audit self-exclusion differs");
  const expectedRows = auditedEntries.map((entry) => ({ path: entry.relativePath, bytes: entry.data.length, sha256: sha256(entry.data), status: "PASS" }));
  invariant(stableJson(audit.payloads) === stableJson(expectedRows), "R2 prepackage payload ledger differs");
  invariant(stableJson(audit.checks) === stableJson({ topology: "PASS", pathSafety: "PASS", privacyAndSecrets: "PASS", forbiddenPayloadClasses: "PASS", semanticAuthority: "PASS" }), "R2 prepackage checks differ");
  invariant(stableJson(audit.mediaDecode) === stableJson({ png: "PASS", pngCount: 15, mp4: "PASS", mp4Count: 3 }), "R2 prepackage media decode differs");
}

function validateProductionDiff(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  invariant(text.length > 0 && text.includes("diff --git a/src/components/SiteHeader.astro b/src/components/SiteHeader.astro"), "R2 production diff omits SiteHeader focus semantics");
  const headers = [...text.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)];
  invariant(headers.length === 1 && headers[0][1] === "src/components/SiteHeader.astro" && headers[0][2] === "src/components/SiteHeader.astro", "R2 production diff escapes the single-file scope");
}

function assertPayloadSignature(bytes, relativePath) {
  const data = Buffer.from(bytes);
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (extension === ".json") parseJson(data, relativePath);
  else if (extension === ".png") invariant(data.length >= 8 && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")), `PNG signature differs: ${relativePath}`);
  else if (extension === ".mp4") validateIsoBmffRecording(data, relativePath);
  else if (extension === ".diff") invariant(!data.includes(0), `diff payload contains NUL bytes: ${relativePath}`);
  else throw new Error(`unexpected R2 payload type: ${relativePath}`);
}

export function assertExternalR2Path(candidate, label = "path", { repositoryRoot = ROOT, temporaryRoot = os.tmpdir() } = {}) {
  invariant(typeof candidate === "string" && path.isAbsolute(candidate), `${label} must be absolute`);
  const resolved = path.resolve(candidate);
  invariant(!isWithin(repositoryRoot, resolved), `${label} must stay outside the Git repository`);
  invariant(!isWithin(temporaryRoot, resolved), `${label} must stay outside the OS temporary directory`);
  return resolved;
}

export function normalizeR2EvidenceEntries(input, { sourceEvidenceRoot, boundaryOptions = {} } = {}) {
  assertExternalR2Path(sourceEvidenceRoot, "source evidence root", boundaryOptions);
  invariant(Array.isArray(input) && input.length > 0, "R2 evidence entries must be a non-empty array");
  const normalized = input.map((entry) => {
    invariant(entry && typeof entry.relativePath === "string", "every R2 evidence entry requires relativePath");
    assertAllowedR2EvidencePath(entry.relativePath);
    const data = Buffer.from(entry.data ?? []);
    invariant(data.length > 0 && data.length <= MAX_FILE_BYTES, `R2 evidence byte boundary failed: ${entry.relativePath}`);
    assertNoPrivateOrSecretR2Payload(data, entry.relativePath);
    assertPayloadSignature(data, entry.relativePath);
    invariant(!RAW_PHASE4_HASHES.has(sha256(data)), `raw/governed Phase 4 payload is forbidden: ${entry.relativePath}`);
    return Object.freeze({ relativePath: entry.relativePath, role: REQUIRED_ROLE.get(entry.relativePath), data });
  }).sort((left, right) => lexicalCompare(left.relativePath, right.relativePath));

  const paths = new Set();
  const folded = new Set();
  let bytes = 0;
  for (const entry of normalized) {
    const key = entry.relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    invariant(!paths.has(entry.relativePath) && !folded.has(key), `duplicate R2 evidence path: ${entry.relativePath}`);
    paths.add(entry.relativePath);
    folded.add(key);
    bytes += entry.data.length;
  }
  invariant(bytes <= MAX_ARCHIVE_BYTES, "R2 evidence exceeds the compact package byte limit");
  invariant(paths.size === REQUIRED_R2_EVIDENCE.length && REQUIRED_R2_EVIDENCE.every(({ relativePath }) => paths.has(relativePath)), "R2 compact evidence topology differs");

  validatePhase7aR2FieldMapAuthority(parseJson(normalized.find(({ relativePath }) => relativePath === "00-authority/r2-field-map-authority.json").data, "R2 semantic authority"));
  validateProductionDiff(normalized.find(({ relativePath }) => relativePath === "02-diff/production.diff").data);
  validateSupportingAuthorities(normalized);
  return normalized;
}

function metadataFor(entry) {
  const extension = path.posix.extname(entry.relativePath).toLowerCase();
  return Object.freeze({
    path: entry.relativePath,
    role: entry.role,
    kind: extension === ".png" ? "image" : extension === ".mp4" ? "video" : "document",
    bytes: entry.data.length,
    sha256: sha256(entry.data),
    crc32: crc32Hex(entry.data),
  });
}

function makeManifest(payloads) {
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

export function buildR2ReviewArtifacts(inputEntries, options = {}) {
  const entries = normalizeR2EvidenceEntries(inputEntries, options);
  const payloads = entries.map(metadataFor);
  const manifest = makeManifest(payloads);
  const manifestBytes = Buffer.from(stableJson(manifest));
  assertNoPrivateOrSecretR2Payload(manifestBytes, IN_ARCHIVE_MANIFEST);
  const archiveBytes = createStoredZipBuffer([
    ...entries.map(({ relativePath, data }) => ({ relativePath, data })),
    { relativePath: IN_ARCHIVE_MANIFEST, data: manifestBytes },
  ]);
  invariant(archiveBytes.length <= MAX_ARCHIVE_BYTES, "R2 review ZIP exceeds the archive limit");
  return Object.freeze({ entries, payloads, manifest, manifestBytes, archiveBytes });
}

async function inventoryFiles(root) {
  const files = [];
  const expectedDirectories = new Set(REQUIRED_R2_EVIDENCE.flatMap(({ relativePath }) => {
    const parts = relativePath.split("/").slice(0, -1);
    return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
  }));
  const visit = async (absoluteDirectory, relativeDirectory = "") => {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      safeR2EvidencePath(relativePath, "source evidence filesystem path");
      invariant(!entry.isSymbolicLink(), `source evidence symlink is forbidden: ${relativePath}`);
      if (entry.isDirectory()) {
        invariant(expectedDirectories.has(relativePath), `unexpected source evidence directory: ${relativePath}`);
        await visit(path.join(absoluteDirectory, entry.name), relativePath);
      } else {
        invariant(entry.isFile(), `unsupported source evidence filesystem entry: ${relativePath}`);
        files.push(relativePath);
      }
    }
  };
  await visit(root);
  return files.sort(lexicalCompare);
}

export async function readR2EvidenceDirectory(evidenceDir, { boundaryOptions = {} } = {}) {
  const sourceEvidenceRoot = assertExternalR2Path(path.resolve(evidenceDir), "source evidence root", boundaryOptions);
  const sourceStatus = await lstat(sourceEvidenceRoot);
  invariant(sourceStatus.isDirectory() && !sourceStatus.isSymbolicLink(), "source evidence root must be a real directory");
  const resolvedRoot = await realpath(sourceEvidenceRoot);
  invariant(path.resolve(resolvedRoot) === path.resolve(sourceEvidenceRoot), "source evidence root may not traverse a symlink");
  const inventory = await inventoryFiles(sourceEvidenceRoot);
  const expected = REQUIRED_R2_EVIDENCE.map(({ relativePath }) => relativePath).sort(lexicalCompare);
  invariant(JSON.stringify(inventory) === JSON.stringify(expected), "source evidence filesystem topology differs from the closed R2 contract");
  const entries = await Promise.all(inventory.map(async (relativePath) => {
    const absolutePath = path.join(sourceEvidenceRoot, ...relativePath.split("/"));
    const status = await lstat(absolutePath);
    invariant(status.isFile() && !status.isSymbolicLink(), `source evidence payload must be a real file: ${relativePath}`);
    invariant(path.resolve(await realpath(absolutePath)) === path.resolve(absolutePath), `source evidence payload may not traverse a symlink: ${relativePath}`);
    return { relativePath, data: await readFile(absolutePath) };
  }));
  normalizeR2EvidenceEntries(entries, { sourceEvidenceRoot, boundaryOptions });
  return entries;
}

async function atomicExclusiveWrite(filePath, bytes) {
  try { await lstat(filePath); throw new Error(`refusing to overwrite existing output: ${filePath}`); }
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
    if (error?.code === "EEXIST") throw new Error(`refusing to overwrite existing output: ${filePath}`);
    throw error;
  } finally {
    if (temporaryCreated) await unlink(temporaryPath).catch(() => {});
  }
}

export async function packageR2ReviewDirectory({ evidenceDir, outputDir, boundaryOptions = {} }) {
  const sourceEvidenceRoot = assertExternalR2Path(path.resolve(evidenceDir), "--evidence-dir", boundaryOptions);
  const outputRoot = assertExternalR2Path(path.resolve(outputDir), "--output-dir", boundaryOptions);
  invariant(!isWithin(sourceEvidenceRoot, outputRoot) && !isWithin(outputRoot, sourceEvidenceRoot), "source evidence and package output directories must be separate");
  const entries = await readR2EvidenceDirectory(sourceEvidenceRoot, { boundaryOptions });
  await mkdir(outputRoot, { recursive: true });
  const outputStatus = await lstat(outputRoot);
  invariant(outputStatus.isDirectory() && !outputStatus.isSymbolicLink(), "package output root must be a real directory");
  invariant(path.resolve(await realpath(outputRoot)) === outputRoot, "package output root may not traverse a symlink");
  const artifacts = buildR2ReviewArtifacts(entries, { sourceEvidenceRoot, boundaryOptions });
  const zipPath = path.join(outputRoot, PHASE7A_R2_REVIEW_ZIP_NAME);
  await atomicExclusiveWrite(zipPath, artifacts.archiveBytes);
  const result = {
    schema: R2_PACKAGE_SCHEMA,
    status: "PASS",
    zipPath: path.resolve(zipPath),
    bytes: artifacts.archiveBytes.length,
    sha256: sha256(artifacts.archiveBytes),
    entryCount: artifacts.payloads.length + 1,
    manifestSha256: sha256(artifacts.manifestBytes),
    payloadCount: artifacts.payloads.length,
    payloadBytes: artifacts.payloads.reduce((sum, payload) => sum + payload.bytes, 0),
  };
  return Object.freeze(result);
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
    options.evidenceDir = assertExternalR2Path(path.resolve(options.evidenceDir), "--evidence-dir");
    options.outputDir = assertExternalR2Path(path.resolve(options.outputDir), "--output-dir");
    invariant(options.evidenceDir !== options.outputDir, "source evidence and package output directories must differ");
  }
  return options;
}

export function runSelfTest() {
  invariant(PHASE7A_R2_REVIEW_ZIP_NAME === "phase-7a-r2-field-map-focus-human-review.zip", "R2 ZIP name drifted");
  invariant(REQUIRED_R2_EVIDENCE.length === 34, "R2 compact topology drifted");
  return Object.freeze({
    schema: R2_PACKAGE_SCHEMA,
    status: "PASS",
    reviewZipName: PHASE7A_R2_REVIEW_ZIP_NAME,
    requiredPayloads: REQUIRED_R2_EVIDENCE.length,
    realPackageCreationEnabled: true,
  });
}

function usage() {
  return [
    "Usage:",
    "  node scripts/package-phase7a-r2-human-review.mjs --self-test",
    "  node scripts/package-phase7a-r2-human-review.mjs --evidence-dir <external> --output-dir <external>",
  ].join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); return; }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`); return; }
  const result = await packageR2ReviewDirectory(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { process.stderr.write(`Phase 7A-R2 compact package FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
}
