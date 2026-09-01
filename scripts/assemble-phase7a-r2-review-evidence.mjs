import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

import { FROZEN_MAIN, PHASE7A_PARENT, PHASE7A_R2_BRANCH, PHASE7A_R2_PARENT, PHYSICAL_ASSETS } from "./phase7a-contract.mjs";
import {
  PHASE7A_R2_BUNDLE_SCHEMA,
  PHASE7A_R2_MINIMUM_TARGET_CSS_PIXELS,
  PHASE7A_R2_REVIEW_ZIP_NAME,
  PHASE7A_R2_TARGET_SCHEMA,
  validatePhase7aR2FieldMapAuthority,
  validateR2AxeAuthority,
  validateR2FieldMapFocusAuthority,
  validateR2TargetAuthority,
} from "./phase7a-r2-field-map-authority.mjs";
import {
  REQUIRED_R2_EVIDENCE,
  R2_ARIA_DIFF_SCHEMA,
  R2_DEPLOYMENT_BINDING_SCHEMA,
  R2_HUMAN_GATES,
  R2_HUMAN_GATES_SCHEMA,
  R2_INSTALLED_CHROME_SCHEMA,
  R2_LIMITATIONS_SCHEMA,
  R2_PHASE4_HASH_SCHEMA,
  R2_PREPACKAGE_AUDIT_SCHEMA,
  R2_SOURCE_AUTHORITY_SCHEMA,
  R2_TASK_AUTHORITY_SCHEMA,
  R2_TASK_REQUIREMENTS,
  R2_TASK_SCOPE,
  R2_TEST_RECEIPT_SCHEMA,
  assertAllowedR2EvidencePath,
  assertExternalR2Path,
  assertNoPrivateOrSecretR2Payload,
  normalizeR2EvidenceEntries,
} from "./package-phase7a-r2-human-review.mjs";
import { stableJson, validateIsoBmffRecording } from "./package-phase7a-human-review.mjs";
import { PHASE7A_R2_RETAINED_QA_SCHEMA, normalizePhase7aR2RetainedQaReport } from "./qa-phase7a-browser.mjs";
import { validateR2ContrastMaskPixels } from "./phase7a-r2-contrast-pixels.mjs";
import {
  PHASE7A_R2_VISUAL_REGRESSION_CAPTURE_PATHS,
  PHASE7A_R2_VISUAL_REGRESSION_MANIFEST_SCHEMA,
  PHASE7A_R2_VISUAL_REGRESSION_PATHS,
  PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH,
  PHASE7A_R2_VISUAL_BASELINE_RECEIPT_SHA256,
  validatePhase7aR2VisualRegressionAuthority,
} from "./phase7a-r2-visual-regression-authority.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
export const ASSEMBLER_SCHEMA = "quantum-hub.phase-7a-r2.review-evidence-assembler.v1";
export const GENERIC_CAPTURE_SCHEMA = "quantum-hub.phase-7a-r2.field-map-capture.v1";
export const GENERIC_MANIFEST_SCHEMA = "quantum-hub.phase-7a-r2.capture-manifest.v1";
export const INSTALLED_CAPTURE_SCHEMA = "quantum-hub.phase-7a-r2.installed-chrome-field-map.v1";
export const INSTALLED_MANIFEST_SCHEMA = "quantum-hub.phase-7a-r2.installed-chrome-field-map.manifest.v1";
export const DEPLOYMENT_SCHEMA = "quantum-hub.phase-7a.deployment-verification.v1";

const FOCUSED_TEST_COMMAND = "node --test tests/phase7a-r2-field-map-authority.test.mjs tests/phase7a-r2-evidence-assembler.test.mjs";

const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const CLOUDFLARE_DEPLOYMENT_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const POSITIVE_DECIMAL_ID = /^[1-9]\d*$/;
const PHASE7A_R2_BRANCH_URL = "https://repair-phase-7a-r2-field-map.qsite1.pages.dev/";
const ENGINES = Object.freeze(["chromium", "firefox", "webkit"]);
const INPUT_KEYS = Object.freeze(["fieldMapDir", "installedChromeDir", "visualRegressionDir", "chromiumQa", "firefoxQa", "webkitQa", "deployment", "r1EvidenceDir", "outputDir", "revision"]);
const GENERIC_COPY = Object.freeze({
  "03-focus/chromium-focus-cycle.mp4": "recordings/chromium-field-map-forward-reverse.mp4",
  "03-focus/firefox-focus-cycle.mp4": "recordings/firefox-field-map-forward-reverse.mp4",
  "03-focus/webkit-focus-cycle.mp4": "recordings/webkit-field-map-forward-reverse.mp4",
  "04-field-map/closed.png": "screenshots/chromium-closed.png",
  "04-field-map/open.png": "screenshots/chromium-open.png",
  "04-field-map/keyboard-focus.png": "screenshots/chromium-focus.png",
  "04-field-map/escape-focus-return.png": "screenshots/chromium-escape.png",
  "04-field-map/no-javascript-native-open.png": "screenshots/chromium-no-javascript-native-open.png",
  "04-field-map/reduced-motion.png": "screenshots/chromium-reduced-motion.png",
  "06-accessibility/chromium-bifurcation-background-mask.png": "screenshots/chromium-bifurcation-background-mask.png",
  "06-accessibility/firefox-bifurcation-background-mask.png": "screenshots/firefox-bifurcation-background-mask.png",
  "06-accessibility/chromium-field-map-open-background-mask.png": "screenshots/chromium-field-map-open-background-mask.png",
  "06-accessibility/firefox-field-map-open-background-mask.png": "screenshots/firefox-field-map-open-background-mask.png",
});
const INSTALLED_COPY = Object.freeze({
  "05-chrome-200/closed.png": "screenshots/closed.png",
  "05-chrome-200/open.png": "screenshots/open.png",
  "05-chrome-200/keyboard-focus.png": "screenshots/focus.png",
  "05-chrome-200/escape-focus-return.png": "screenshots/escape.png",
  "05-chrome-200/chrome-visible-200-percent.png": "screenshots/chrome-visible-200-percent.png",
});
const CONTRAST_MASK_PATHS = Object.freeze([
  "06-accessibility/chromium-bifurcation-background-mask.png",
  "06-accessibility/firefox-bifurcation-background-mask.png",
  "06-accessibility/chromium-field-map-open-background-mask.png",
  "06-accessibility/firefox-field-map-open-background-mask.png",
]);

function invariant(value, message) { if (!value) throw new Error(message); }
function exactKeys(value, expected, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  invariant(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()), `${label} field inventory differs`);
}
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function canonical(value) { return Buffer.from(stableJson(value)); }
function portable(relativePath) {
  invariant(typeof relativePath === "string" && relativePath.length > 0 && !path.posix.isAbsolute(relativePath) && !relativePath.includes("\\") && path.posix.normalize(relativePath) === relativePath && !relativePath.split("/").some((part) => !part || part === "." || part === ".."), `unsafe relative path: ${relativePath}`);
  return relativePath;
}
function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
async function exists(candidate) { try { await lstat(candidate); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } }
async function readJson(filename, label) {
  const bytes = await readFile(filename);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`${label} is not valid JSON`); }
  return { value, bytes, sha256: digest(bytes) };
}

export function validateGitAuthority(snapshot, revision) {
  invariant(snapshot?.branch === PHASE7A_R2_BRANCH && snapshot.head === revision && HASH_40.test(revision ?? ""), "R2 Git branch/HEAD differs");
  invariant(snapshot.directParent && HASH_40.test(snapshot.directParent), "R2 direct parent is invalid");
  invariant(snapshot.localMain === FROZEN_MAIN && snapshot.originMain === FROZEN_MAIN, "R2 local/origin main moved");
  invariant(snapshot.status === "" && snapshot.upstream === `origin/${PHASE7A_R2_BRANCH}` && snapshot.upstreamHead === revision, "R2 clean upstream parity differs");
  invariant(snapshot.mergeRows === "" && snapshot.phase6Ancestor === true, "R2 merge/Phase 6 ancestry authority differs");
  invariant(JSON.stringify(snapshot.productionChangedPaths) === JSON.stringify(R2_TASK_SCOPE), "R2 production scope differs");
  invariant(Array.isArray(snapshot.commits) && snapshot.commits.length > 0, "R2 commit list is empty");
  let parent = PHASE7A_R2_PARENT;
  for (const [index, commit] of snapshot.commits.entries()) {
    invariant(HASH_40.test(commit?.hash ?? "") && HASH_40.test(commit?.parent ?? "") && commit.parent === parent && typeof commit.subject === "string", `R2 commit ${index + 1} breaks linear single-parent ancestry`);
    parent = commit.hash;
  }
  invariant(snapshot.commits.at(-1).hash === revision && snapshot.commits.at(-1).parent === snapshot.directParent, "R2 final direct-parent binding differs");
  invariant(typeof snapshot.productionDiff === "string" && snapshot.productionDiff.includes("diff --git a/src/components/SiteHeader.astro b/src/components/SiteHeader.astro") && !snapshot.productionDiff.includes("GIT binary patch"), "R2 production diff differs");
  return true;
}

async function git(repoRoot, args) {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim();
}
async function gitSuccess(repoRoot, args) { try { await git(repoRoot, args); return true; } catch (error) { if (Number.isInteger(error?.code)) return false; throw error; } }

export async function deriveR2GitAuthority({ repoRoot = ROOT, revision }) {
  const [branch, head, directParent, localMain, originMain, status, upstream, upstreamHead, mergeRows, logRows, phase6Ancestor, changed, productionDiff, parentHeader, currentHeader] = await Promise.all([
    git(repoRoot, ["branch", "--show-current"]), git(repoRoot, ["rev-parse", "HEAD"]), git(repoRoot, ["rev-parse", "HEAD^"]),
    git(repoRoot, ["rev-parse", "main"]), git(repoRoot, ["rev-parse", "origin/main"]), git(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]),
    git(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]), git(repoRoot, ["rev-parse", "@{upstream}"]),
    git(repoRoot, ["rev-list", "--merges", `${PHASE7A_R2_PARENT}..${revision}`]), git(repoRoot, ["log", "--reverse", "--format=%H%x09%P%x09%s", `${PHASE7A_R2_PARENT}..${revision}`]),
    gitSuccess(repoRoot, ["merge-base", "--is-ancestor", PHASE7A_PARENT, revision]),
    git(repoRoot, ["diff", "--name-only", `${PHASE7A_R2_PARENT}..${revision}`, "--", "public", "src"]),
    git(repoRoot, ["diff", "--no-ext-diff", "--no-color", "--full-index", `${PHASE7A_R2_PARENT}..${revision}`, "--", "src/components/SiteHeader.astro"]),
    git(repoRoot, ["show", `${PHASE7A_R2_PARENT}:src/components/SiteHeader.astro`]), readFile(path.join(repoRoot, "src/components/SiteHeader.astro"), "utf8"),
  ]);
  const commits = logRows.split(/\r?\n/).filter(Boolean).map((row) => {
    const [hash, parents, ...subject] = row.split("\t");
    const parentList = parents.split(/\s+/).filter(Boolean);
    invariant(parentList.length === 1, "R2 history contains a non-single-parent commit");
    return { hash, parent: parentList[0], subject: subject.join("\t") };
  });
  const snapshot = { branch, head, directParent, localMain, originMain, status, upstream, upstreamHead, mergeRows, phase6Ancestor, commits, productionChangedPaths: changed.split(/\r?\n/).filter(Boolean), productionDiff, parentHeader, currentHeader };
  validateGitAuthority(snapshot, revision);
  return snapshot;
}

function extractSummaryAria(source) {
  const tag = source.match(/<summary\b[\s\S]*?>/i)?.[0];
  invariant(tag, "SiteHeader Field Map summary markup is missing");
  return [...tag.matchAll(/\s(aria-[\w-]+)(?:="([^"]*)"|='([^']*)')?/gi)].map((match) => `${match[1].toLowerCase()}=${JSON.stringify(match[2] ?? match[3] ?? "")}`).sort();
}

function normalizeQa(record, engine, revision, normalizer) {
  const receipt = normalizer(record.value, { expectedEngine: engine, expectedRevision: revision });
  invariant(receipt?.schema === PHASE7A_R2_RETAINED_QA_SCHEMA && receipt.status === "PASS" && receipt.branch === PHASE7A_R2_BRANCH && receipt.revision === revision && receipt.engine === engine, `${engine} normalized retained-QA root authority differs`);
  invariant(receipt.rawReportSha256 === record.value.reportSha256 && HASH_64.test(receipt.rawReportSha256 ?? "") && HASH_64.test(record.sha256 ?? ""), `${engine} retained-QA raw/file hash authority differs`);
  invariant(Number.isSafeInteger(receipt.evidenceCaseCount) && receipt.evidenceCaseCount > 0 && receipt.failures === 0 && receipt.checks && Object.values(receipt.checks).every(Boolean), `${engine} normalized retained-QA checks differ`);
  invariant(receipt.source?.status === "PASS" && receipt.source.revision === revision && receipt.source.upstreamRevision === revision && receipt.source.worktreeClean === true && receipt.source.served?.parity === true, `${engine} normalized retained-QA source authority differs`);
  return receipt;
}

function tapCounts(output, label) {
  const value = (name) => [...output.matchAll(new RegExp(`^# ${name} (\\d+)\\r?$`, "gm"))].map((match) => Number(match[1])).at(-1);
  const testCount = value("tests");
  const passed = value("pass");
  const failures = value("fail");
  invariant(Number.isSafeInteger(testCount) && testCount > 0 && passed === testCount && failures === 0, `${label} TAP receipt differs`);
  return { testCount, passed, failures };
}

async function npmCliForCurrentNode() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0);
  for (const candidate of candidates) {
    try {
      const info = await lstat(candidate);
      if (info.isFile() && !info.isSymbolicLink() && path.basename(candidate).toLowerCase() === "npm-cli.js") return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error("npm CLI for the current exact Node executable is unavailable");
}

async function runCleanRevisionCommand({ repoRoot, revision, command, args, label, env = process.env, commandRunner = execFileAsync }) {
  const [beforeHead, beforeStatus] = await Promise.all([git(repoRoot, ["rev-parse", "HEAD"]), git(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"])]);
  invariant(beforeHead === revision && beforeStatus === "", `${label} requires the exact clean revision`);
  const result = await commandRunner(command, args, { cwd: repoRoot, env, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const [afterHead, afterStatus] = await Promise.all([git(repoRoot, ["rev-parse", "HEAD"]), git(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"])]);
  invariant(afterHead === revision && afterStatus === "", `${label} changed repository state`);
  return { output, ...tapCounts(output, label) };
}

export async function runR2BuildReceipt({ repoRoot = ROOT, revision, npmCli, commandRunner } = {}) {
  const cli = npmCli ?? await npmCliForCurrentNode();
  const governedEnvironment = { ...process.env };
  const pathKey = Object.keys(governedEnvironment).find((key) => key.toLowerCase() === "path") ?? "PATH";
  governedEnvironment[pathKey] = [path.dirname(process.execPath), governedEnvironment[pathKey]].filter(Boolean).join(path.delimiter);
  governedEnvironment.npm_node_execpath = process.execPath;
  const executed = await runCleanRevisionCommand({ repoRoot, revision, command: process.execPath, args: [cli, "run", "check:phase7a-r2"], label: "R2 governed validation", env: governedEnvironment, commandRunner });
  const diagnostic = (name) => [...executed.output.matchAll(new RegExp(`(\\d+)\\s+${name}s?`, "gi"))].map((match) => Number(match[1])).at(-1) ?? 0;
  return { command: "npm run check:phase7a-r2", status: "PASS", head: revision, worktreeClean: true, testCount: executed.testCount, passed: executed.passed, failures: executed.failures, errors: diagnostic("error"), warnings: diagnostic("warning"), hints: diagnostic("hint") };
}

export async function runR2FocusedTestReceipt({ repoRoot = ROOT, revision, commandRunner } = {}) {
  const executed = await runCleanRevisionCommand({
    repoRoot,
    revision,
    command: process.execPath,
    args: ["--test", "tests/phase7a-r2-field-map-authority.test.mjs", "tests/phase7a-r2-evidence-assembler.test.mjs"],
    label: "R2 focused validation",
    commandRunner,
  });
  return { command: FOCUSED_TEST_COMMAND, status: "PASS", head: revision, worktreeClean: true, testCount: executed.testCount, passed: executed.passed, failures: executed.failures };
}

function validateManifest(manifest, schema, revision, label) {
  invariant(manifest?.schema === schema, `${label} manifest schema differs`);
  if (schema === GENERIC_MANIFEST_SCHEMA) invariant(manifest.sourceHead === revision && Array.isArray(manifest.entries), `${label} manifest source authority differs`);
  else invariant(Array.isArray(manifest.entries) && manifest.report, `${label} manifest inventory differs`);
  const rows = new Map();
  for (const row of manifest.entries) {
    portable(row.path);
    invariant(!rows.has(row.path) && Number.isSafeInteger(row.bytes) && row.bytes > 0 && HASH_64.test(row.sha256 ?? ""), `${label} manifest ledger differs: ${row.path}`);
    rows.set(row.path, row);
  }
  return rows;
}

async function boundFile(root, relativePath, ledger, label) {
  portable(relativePath);
  const absolute = path.join(root, ...relativePath.split("/"));
  invariant(within(root, absolute), `${label} escapes its root`);
  const info = await lstat(absolute);
  invariant(info.isFile() && !info.isSymbolicLink(), `${label} is not a real file`);
  const bytes = await readFile(absolute);
  const row = ledger.get(relativePath);
  invariant(row && row.bytes === bytes.length && row.sha256 === digest(bytes), `${label} manifest binding differs`);
  return bytes;
}

function installedTarget(report) {
  const inventory = report.targetInventory;
  invariant(inventory?.minimumCssPixels === PHASE7A_R2_MINIMUM_TARGET_CSS_PIXELS && inventory.candidateCount === 9 && Array.isArray(inventory.controls) && inventory.controls.length === 9, "installed Chrome target inventory differs");
  const viewport = report.zoomProof?.observed;
  invariant(Number.isFinite(viewport?.innerWidth) && viewport.innerWidth > 0 && Number.isFinite(viewport?.innerHeight) && viewport.innerHeight > 0, "installed Chrome 200 viewport differs");
  return {
    id: "field-map-open-installed-chrome-200-percent", route: "/#entry", state: "field-map-open-native-chrome-200-percent",
    viewport: { id: "installed-chrome-native-200", width: viewport.innerWidth, height: viewport.innerHeight }, genuineInstalledChrome: true, nativeZoomPercent: 200,
    candidateCount: 9,
    controls: inventory.controls.map(({ selector, href, accessibleName, elementType, width, height, visible, intendedInteractive }) => ({ selector, href, accessibleName, elementType, width, height, visible, intendedInteractive })),
    status: "PASS",
  };
}

function deploymentBinding(report, revision) {
  invariant(report?.schema === DEPLOYMENT_SCHEMA && report.authorityProfile === "phase7a-r2" && report.status === "PASS" && report.deployedSha === revision && report.parity === "PASS"
    && report.environment === "preview" && report.projectName === "qsite1"
    && report.inputs?.expectedDeployedSha === revision && report.inputs.branch === PHASE7A_R2_BRANCH && report.inputs.acceptedParent === PHASE7A_R2_PARENT, "R2 deployment verifier root authority differs");
  invariant(report.deployment?.status === "PASS" && report.deployment?.data && typeof report.deployment.data === "object" && !Array.isArray(report.deployment.data), "R2 signed deployment wrapper differs");
  const signed = report.deployment.data;
  invariant(signed.status === "PASS" && signed.deployedSha === revision, "R2 signed deployment authority differs");
  invariant(CLOUDFLARE_DEPLOYMENT_ID.test(report.deploymentId ?? "") && report.immutableUrl === `https://${report.deploymentId.slice(0, 8)}.qsite1.pages.dev/`
    && report.branchUrl === PHASE7A_R2_BRANCH_URL && signed.deploymentId === report.deploymentId
    && signed.immutableUrl === report.immutableUrl && signed.branchUrl === report.branchUrl
    && /^https:\/\//.test(report.immutableUrl ?? "") && /^https:\/\//.test(report.branchUrl ?? ""), "R2 signed deployment identity differs");
  invariant(signed.authoritySource === "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK"
    && signed.appSlug === "cloudflare-workers-and-pages" && POSITIVE_DECIMAL_ID.test(signed.checkRunId ?? "")
    && signed.branch === PHASE7A_R2_BRANCH && signed.projectName === "qsite1" && signed.environment === "preview"
    && typeof signed.completedAt === "string" && Number.isFinite(Date.parse(signed.completedAt)), "R2 signed deployment provenance differs");
  const local = report.dist?.files?.find((row) => row.relativePath === "index.html");
  invariant(local && Number.isSafeInteger(local.bytes) && local.bytes > 0 && HASH_64.test(local.sha256 ?? ""), "R2 deployment local index authority differs");
  const parity = {};
  for (const key of ["immutable", "branch"]) {
    const wrapper = report.origins?.[key];
    invariant(wrapper?.status === "PASS" && wrapper?.data && typeof wrapper.data === "object" && !Array.isArray(wrapper.data), `R2 deployment ${key} wrapper differs`);
    const origin = wrapper.data;
    const row = origin?.responses?.find((item) => item.relativePath === "index.html");
    const expectedOrigin = key === "immutable" ? report.immutableUrl : report.branchUrl;
    invariant(origin.status === "PASS" && origin.origin === expectedOrigin && row?.status === "PASS" && row.expectedHttpStatus === 200
      && row.actualHttpStatus === 200 && row.bytes === local.bytes && row.sha256 === local.sha256, `R2 deployment ${key} index parity differs`);
    parity[key] = { status: "PASS", httpStatus: 200, bytes: row.bytes, sha256: row.sha256 };
  }
  return {
    schema: R2_DEPLOYMENT_BINDING_SCHEMA, status: "PASS", parent: PHASE7A_R2_PARENT, head: revision,
    deploymentId: report.deploymentId, immutableUrl: report.immutableUrl, branchUrl: report.branchUrl, deployedSha: revision,
    signedCheck: { name: signed.authoritySource, workflow: `GitHub check ${signed.checkRunId}`, commitSha: revision, status: "PASS" },
    localDist: { path: "dist/index.html", bytes: local.bytes, sha256: local.sha256 }, deployedParity: parity,
  };
}

async function assertExactDecodedVisualPair(baselineBytes, currentBytes, label) {
  const [baseline, current] = await Promise.all([
    sharp(baselineBytes, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(currentBytes, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  invariant(baseline.info.width === current.info.width && baseline.info.height === current.info.height && baseline.info.channels === current.info.channels, `${label} decoded dimensions differ`);
  let differentPixels = 0;
  let maxChannelDelta = 0;
  for (let offset = 0; offset < baseline.data.length; offset += baseline.info.channels) {
    let differs = false;
    for (let channel = 0; channel < baseline.info.channels; channel += 1) {
      const delta = Math.abs(baseline.data[offset + channel] - current.data[offset + channel]);
      if (delta) differs = true;
      if (delta > maxChannelDelta) maxChannelDelta = delta;
    }
    if (differs) differentPixels += 1;
  }
  invariant(differentPixels === 0 && maxChannelDelta === 0, `${label} pixels differ (${differentPixels} pixels; maximum channel delta ${maxChannelDelta})`);
  return { differentPixels, maxChannelDelta };
}

async function assertVisualImageBinding(record, bytes, label) {
  invariant(Buffer.isBuffer(bytes) && bytes.length === record.bytes && digest(bytes) === record.sha256, `${label} byte/hash binding differs`);
  const decoded = await sharp(bytes, { failOn: "error" }).metadata();
  invariant(decoded.width === record.width && decoded.height === record.height && decoded.channels === record.channels, `${label} decoded metadata differs`);
}

function normalizedLoadedAssets(binding) {
  return binding.loadedAssets.map(({ kind, url, bytes, sha256 }) => ({ kind, pathname: new URL(url).pathname, bytes, sha256 }));
}

function validateLoadedAssetReceiptBindings(binding, deploymentReport, profile) {
  for (const asset of binding.loadedAssets) {
    const pathname = new URL(asset.url).pathname;
    if (profile === "baseline") {
      const row = deploymentReport.payloadLedger?.find((entry) => entry.publicPath === pathname);
      invariant(row?.status === "PASS" && row.localDist === "PASS" && row.immutable?.status === "PASS" && row.immutable.actualHttpStatus === 200
        && row.bytes === asset.bytes && row.sha256 === asset.sha256 && row.immutable.bytes === asset.bytes && row.immutable.sha256 === asset.sha256,
      `R2 baseline loaded asset differs from the signed R1 payload ledger: ${pathname}`);
    } else {
      const row = deploymentReport.dist?.files?.find((entry) => entry.requestPath === pathname);
      const immutable = deploymentReport.origins?.immutable?.data?.responses?.find((entry) => entry.publicPath === pathname);
      invariant(row && immutable?.status === "PASS" && immutable.actualHttpStatus === 200
        && row.bytes === asset.bytes && row.sha256 === asset.sha256 && immutable.bytes === asset.bytes && immutable.sha256 === asset.sha256,
      `R2 current loaded asset differs from the signed R2 dist/immutable ledgers: ${pathname}`);
    }
  }
}

async function validateVisualRegressionEvidence(visual, revision, deploymentReport, r1DeploymentReport, deploymentReceiptSha256, r1DeploymentReceiptSha256) {
  const report = visual.report;
  validatePhase7aR2VisualRegressionAuthority(report, { currentRevision: revision });
  invariant(digest(await readFile(path.join(ROOT, ...report.captureTool.path.split("/")))) === report.captureTool.sha256, "R2 visual-regression capture-tool hash differs from repository source");
  invariant(r1DeploymentReceiptSha256 === PHASE7A_R2_VISUAL_BASELINE_RECEIPT_SHA256
    && report.bindings.baseline.receiptSha256 === r1DeploymentReceiptSha256, "R2 visual baseline receipt bytes differ from the accepted R1 authority");
  invariant(HASH_64.test(deploymentReceiptSha256 ?? "") && report.bindings.current.receiptSha256 === deploymentReceiptSha256,
    "R2 visual current receipt hash differs from the supplied deployment authority");

  const r1About = r1DeploymentReport?.payloadLedger?.find((row) => row.relativePath === "about/index.html");
  invariant(r1DeploymentReport?.schema === "quantum-hub.phase-7a-r1.evidence-assembler.v1.deployment" && r1DeploymentReport.status === "PASS"
    && r1DeploymentReport.authorityProfile === "phase7a-r1" && r1DeploymentReport.commitHash === PHASE7A_R2_PARENT
    && r1DeploymentReport.signedDeploymentBinding === true && r1DeploymentReport.signedCloudflareCheckBinding === true
    && r1About?.status === "PASS" && r1About.localDist === "PASS" && r1About.immutable?.status === "PASS" && r1About.immutable.actualHttpStatus === 200
    && r1About.immutable.bytes === r1About.bytes && r1About.immutable.sha256 === r1About.sha256
    && r1About.bytes === report.bindings.baseline.document.bytes && r1About.sha256 === report.bindings.baseline.document.sha256
    && r1DeploymentReport.deploymentId === report.bindings.baseline.deploymentId, "R2 visual baseline differs from the signed R1 deployment receipt");

  const r2About = deploymentReport?.dist?.files?.find((row) => row.relativePath === "about/index.html");
  const r2ImmutableAbout = deploymentReport?.origins?.immutable?.data?.responses?.find((row) => row.relativePath === "about/index.html");
  invariant(r2About && r2ImmutableAbout?.status === "PASS" && r2ImmutableAbout.actualHttpStatus === 200 && r2ImmutableAbout.bytes === r2About.bytes && r2ImmutableAbout.sha256 === r2About.sha256
    && r2About.bytes === report.bindings.current.document.bytes && r2About.sha256 === report.bindings.current.document.sha256
    && deploymentReport.deployedSha === revision && deploymentReport.deploymentId === report.bindings.current.deploymentId && deploymentReport.immutableUrl === report.bindings.current.immutableUrl,
  "R2 visual current differs from the signed R2 deployment receipt");

  invariant(JSON.stringify(normalizedLoadedAssets(report.bindings.baseline)) === JSON.stringify(normalizedLoadedAssets(report.bindings.current)), "R2 parent/current loaded CSS/JS/font/image inventories differ by pathname, kind, bytes, or SHA-256");
  validateLoadedAssetReceiptBindings(report.bindings.baseline, r1DeploymentReport, "baseline");
  validateLoadedAssetReceiptBindings(report.bindings.current, deploymentReport, "current");
  for (const comparison of report.comparisons) {
    const baselineBytes = visual.outputFiles.get(comparison.baseline.path);
    const currentBytes = visual.outputFiles.get(comparison.current.path);
    await assertVisualImageBinding(comparison.baseline, baselineBytes, `${comparison.state} baseline`);
    await assertVisualImageBinding(comparison.current, currentBytes, `${comparison.state} current`);
    const measured = await assertExactDecodedVisualPair(baselineBytes, currentBytes, comparison.state);
    invariant(comparison.result.classification === "EXACT_DECODED_PIXELS" && comparison.result.differentPixels === measured.differentPixels
      && comparison.result.maxChannelDelta === measured.maxChannelDelta, `${comparison.state} reported comparison differs from assembler recomputation`);
  }
  await assertVisualImageBinding(report.currentLinkFocused.image, visual.outputFiles.get(report.currentLinkFocused.image.path), "current About link-focused evidence");
  invariant(visual.reportBytes.length > 0 && digest(visual.reportBytes) === visual.reportSha256 && visual.outputFiles.get(PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH).equals(visual.reportBytes), "R2 visual-regression raw report binding differs");
  return true;
}

function sourceAuthority(gitAuthority, build) {
  return {
    schema: R2_SOURCE_AUTHORITY_SCHEMA, status: "PASS", branch: PHASE7A_R2_BRANCH, parent: PHASE7A_R2_PARENT, head: gitAuthority.head,
    acceptedPhase6: PHASE7A_PARENT, acceptedPhase6Ancestry: true, localMain: gitAuthority.localMain, originMain: gitAuthority.originMain,
    mergeCount: 0, commits: gitAuthority.commits, worktreeClean: true, worktreeStatus: [], upstream: gitAuthority.upstream, upstreamHead: gitAuthority.upstreamHead, upstreamParity: true,
    productionChangedPaths: gitAuthority.productionChangedPaths,
    build: { command: build.command, status: build.status, head: build.head, worktreeClean: build.worktreeClean, errors: build.errors, warnings: build.warnings, hints: build.hints },
  };
}

function assertContrastScreenshotBindings(axe, outputFiles) {
  const boundPaths = new Set();
  for (const measurement of axe.manualContrast.selectorMeasurements) {
    const relativePath = `06-accessibility/${path.posix.basename(measurement.screenshot.path)}`;
    invariant(CONTRAST_MASK_PATHS.includes(relativePath) && !boundPaths.has(relativePath), `R2 selector-local contrast screenshot path differs: ${relativePath}`);
    boundPaths.add(relativePath);
    const bytes = outputFiles.get(relativePath);
    invariant(Buffer.isBuffer(bytes) && bytes.length >= 24 && bytes.length === measurement.screenshot.bytes && digest(bytes) === measurement.screenshot.sha256
      && bytes.readUInt32BE(16) === measurement.screenshot.width && bytes.readUInt32BE(20) === measurement.screenshot.height, `R2 selector-local contrast screenshot binding differs: ${relativePath}`);
  }
  invariant(boundPaths.size === CONTRAST_MASK_PATHS.length && CONTRAST_MASK_PATHS.every((relativePath) => boundPaths.has(relativePath)), "R2 selector-local contrast screenshot inventory differs");
}

export async function constructR2Payloads({ authorityDocumentBytes, generic, installed, visualRegression, qa, deploymentReport, deploymentReceiptSha256, r1DeploymentReport, r1DeploymentReceiptSha256, gitAuthority, buildReceipt, focusedReceipt, normalizeQaReport = normalizePhase7aR2RetainedQaReport, mediaAudit = { png: "PASS", pngCount: 20, mp4: "PASS", mp4Count: 3 } }) {
  validateGitAuthority(gitAuthority, gitAuthority.head);
  invariant(generic.report?.schema === GENERIC_CAPTURE_SCHEMA && generic.report.status === "PASS" && generic.report.authority?.head === gitAuthority.head, "generic R2 capture authority differs");
  validateR2FieldMapFocusAuthority(generic.focus);
  validateR2AxeAuthority(generic.axe);
  assertContrastScreenshotBindings(generic.axe, generic.outputFiles);
  invariant(generic.targetFragment?.status === "PASS" && generic.targetFragment.parent === PHASE7A_R2_PARENT && Array.isArray(generic.targetFragment.states) && generic.targetFragment.states.length === 2, "generic R2 target fragment differs");
  invariant(generic.reducedMotion?.status === "PASS" && generic.reducedMotion.screenshot === "screenshots/chromium-reduced-motion.png", "generic reduced-motion evidence differs");
  invariant(installed.report?.schema === INSTALLED_CAPTURE_SCHEMA && installed.report.status === "PASS" && installed.report.branch === PHASE7A_R2_BRANCH && installed.report.parent === PHASE7A_R2_PARENT && installed.report.revision === gitAuthority.head, "installed Chrome capture authority differs");
  invariant(installed.report.zoomProof?.status === "PASS" && installed.report.zoomProof.uiZoomLabelInput === "Zoom: 200%", "installed Chrome genuine 200 percent authority differs");
  const normalizedQa = ENGINES.map((engine) => normalizeQa(qa[engine], engine, gitAuthority.head, normalizeQaReport));
  const summaries = normalizedQa.map((receipt) => ({ engine: receipt.engine, status: "PASS", passCount: receipt.evidenceCaseCount, failures: 0 }));
  invariant(buildReceipt?.command === "npm run check:phase7a-r2" && buildReceipt.status === "PASS" && buildReceipt.head === gitAuthority.head && buildReceipt.worktreeClean === true && buildReceipt.errors === 0 && Number.isSafeInteger(buildReceipt.testCount) && buildReceipt.testCount > 0 && buildReceipt.passed === buildReceipt.testCount && buildReceipt.failures === 0, "R2 governed build receipt differs");
  invariant(focusedReceipt?.command === FOCUSED_TEST_COMMAND && focusedReceipt.status === "PASS" && focusedReceipt.head === gitAuthority.head && focusedReceipt.worktreeClean === true && Number.isSafeInteger(focusedReceipt.testCount) && focusedReceipt.testCount > 0 && focusedReceipt.passed === focusedReceipt.testCount && focusedReceipt.failures === 0, "R2 focused test receipt differs");
  const targets = { schema: PHASE7A_R2_TARGET_SCHEMA, status: "PASS", parent: PHASE7A_R2_PARENT, minimumCssPixels: PHASE7A_R2_MINIMUM_TARGET_CSS_PIXELS, states: [...generic.targetFragment.states, installedTarget(installed.report)] };
  validateR2TargetAuthority(targets);
  const bundle = { schema: PHASE7A_R2_BUNDLE_SCHEMA, status: "PASS", parent: PHASE7A_R2_PARENT, reviewZipName: PHASE7A_R2_REVIEW_ZIP_NAME, focus: generic.focus, axe: generic.axe, targets };
  validatePhase7aR2FieldMapAuthority(bundle);
  const deployment = deploymentBinding(deploymentReport, gitAuthority.head);
  await validateVisualRegressionEvidence(visualRegression, gitAuthority.head, deploymentReport, r1DeploymentReport, deploymentReceiptSha256, r1DeploymentReceiptSha256);
  const reportHashes = ENGINES.map((engine) => ({ name: `${engine}-retained-qa`, sha256: qa[engine].sha256 }));
  const focusedChecks = { fieldMapFocus: true, aria: true, axe: true, targetSize: true, installedChrome200: true, sameSessionVisualStability: true };
  const retainedChecks = Object.fromEntries(Object.keys(normalizedQa[0].checks).map((key) => [key, normalizedQa.every((receipt) => receipt.checks[key] === true)]));
  const payloads = new Map();
  const addJson = (relativePath, value) => payloads.set(relativePath, canonical(value));
  addJson("00-authority/task-authority.json", { schema: R2_TASK_AUTHORITY_SCHEMA, status: "PASS", parent: PHASE7A_R2_PARENT, reviewZipName: PHASE7A_R2_REVIEW_ZIP_NAME, authorityDocument: { path: "docs/phase-7a-r2-review-authority.md", bytes: authorityDocumentBytes.length, sha256: digest(authorityDocumentBytes) }, scope: [...R2_TASK_SCOPE], requirements: [...R2_TASK_REQUIREMENTS] });
  addJson("00-authority/human-gates-status.json", { schema: R2_HUMAN_GATES_SCHEMA, status: "PENDING_HUMAN_REVIEW", gates: R2_HUMAN_GATES.map((gate) => ({ ...gate })) });
  addJson("00-authority/r2-field-map-authority.json", bundle);
  addJson("01-provenance/source-authority.json", sourceAuthority(gitAuthority, buildReceipt));
  addJson("01-provenance/deployment-binding.json", deployment);
  payloads.set("02-diff/production.diff", Buffer.from(`${gitAuthority.productionDiff.trimEnd()}\n`));
  addJson("02-diff/aria-before-after.json", { schema: R2_ARIA_DIFF_SCHEMA, status: "PASS", before: extractSummaryAria(gitAuthority.parentHeader), after: extractSummaryAria(gitAuthority.currentHeader) });
  addJson("03-focus/raw-cross-engine-focus.json", generic.focus);
  for (const [relativePath, bytes] of generic.outputFiles) payloads.set(relativePath, bytes);
  addJson("05-chrome-200/installed-chrome-200.json", { schema: R2_INSTALLED_CHROME_SCHEMA, status: "PASS", genuineInstalledChrome: true, nativeZoomPercent: 200, report: { schema: installed.report.schema, revision: installed.report.revision, browser: installed.report.browser, zoomProof: installed.report.zoomProof, accessibility: installed.report.accessibility, states: installed.report.states, targetInventory: installed.report.targetInventory, focus: installed.report.focus, repeatedCycles: installed.report.repeatedCycles, visuals: installed.report.visuals, limitations: installed.report.limitations } });
  for (const [relativePath, bytes] of installed.outputFiles) payloads.set(relativePath, bytes);
  addJson("06-accessibility/axe-and-manual-contrast.json", generic.axe);
  addJson("06-accessibility/target-inventory.json", targets);
  addJson("07-regression/focused-regression.json", { schema: R2_TEST_RECEIPT_SCHEMA, status: "PASS", command: focusedReceipt.command, testCount: focusedReceipt.testCount, failures: focusedReceipt.failures, checks: focusedChecks, engineSummaries: summaries, reportHashes });
  addJson("07-regression/retained-suite.json", { schema: R2_TEST_RECEIPT_SCHEMA, status: "PASS", command: buildReceipt.command, testCount: buildReceipt.testCount, failures: buildReceipt.failures, checks: retainedChecks, engineSummaries: summaries, reportHashes });
  for (const [relativePath, bytes] of visualRegression.outputFiles) payloads.set(relativePath, bytes);
  addJson("08-governance/phase4-hashes.json", { schema: R2_PHASE4_HASH_SCHEMA, status: "PASS", assets: PHYSICAL_ASSETS.map(([assetPath, assetSha256]) => ({ path: assetPath, sha256: assetSha256 })) });
  addJson("08-governance/environmental-limitations.json", { schema: R2_LIMITATIONS_SCHEMA, status: "DECLARED", limitations: [...new Set([...(generic.report.limitations ?? []), ...(installed.report.limitations ?? []), "Human acceptance remains external; the sole accessibility gate is not self-accepted."])], creativeStability: { status: "PASS", authorityPath: PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH, authoritySha256: visualRegression.reportSha256 } });
  invariant(payloads.size === REQUIRED_R2_EVIDENCE.length - 1, "R2 constructed pre-audit topology differs");
  const rows = [...payloads].sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right))).map(([relativePath, bytes]) => ({ path: relativePath, bytes: bytes.length, sha256: digest(bytes), status: "PASS" }));
  addJson("09-audit/prepackage-evidence-audit.json", { schema: R2_PREPACKAGE_AUDIT_SCHEMA, status: "PASS", auditedPayloadCount: rows.length, finalPayloadCount: REQUIRED_R2_EVIDENCE.length, auditedPayloadBytes: rows.reduce((sum, row) => sum + row.bytes, 0), selfExclusion: "prepackage audit excludes its own bytes to avoid self-reference", payloads: rows, checks: { topology: "PASS", pathSafety: "PASS", privacyAndSecrets: "PASS", forbiddenPayloadClasses: "PASS", semanticAuthority: "PASS" }, mediaDecode: mediaAudit });
  return payloads;
}

async function loadCaptureRoot(root, revision, installed = false) {
  const reportName = installed ? "installed-chrome-r2-field-map-report.json" : "field-map-capture.json";
  const [reportRecord, manifestRecord] = await Promise.all([readJson(path.join(root, reportName), `${reportName} report`), readJson(path.join(root, "manifest.json"), `${reportName} manifest`)]);
  const ledger = validateManifest(manifestRecord.value, installed ? INSTALLED_MANIFEST_SCHEMA : GENERIC_MANIFEST_SCHEMA, revision, installed ? "installed Chrome" : "generic capture");
  if (installed) {
    invariant(manifestRecord.value.report?.path === reportName && manifestRecord.value.report.bytes === reportRecord.bytes.length && manifestRecord.value.report.sha256 === reportRecord.sha256, "installed Chrome report manifest binding differs");
    const outputFiles = new Map();
    for (const [target, source] of Object.entries(INSTALLED_COPY)) outputFiles.set(target, await boundFile(root, source, ledger, source));
    return { report: reportRecord.value, manifest: manifestRecord.value, outputFiles };
  }
  const [focus, axe, targetFragment, reducedMotion] = await Promise.all(["focus-authority.json", "axe-authority.json", "target-fragment.json", "reduced-motion-evidence.json"].map(async (name) => (await readJson(path.join(root, name), name)).value));
  const outputFiles = new Map();
  for (const [target, source] of Object.entries(GENERIC_COPY)) outputFiles.set(target, await boundFile(root, source, ledger, source));
  return { report: reportRecord.value, manifest: manifestRecord.value, focus, axe, targetFragment, reducedMotion, outputFiles };
}

async function loadVisualRegressionRoot(root, revision) {
  const [reportRecord, manifestRecord] = await Promise.all([
    readJson(path.join(root, ...PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH.split("/")), "same-session visual-regression report"),
    readJson(path.join(root, "manifest.json"), "same-session visual-regression manifest"),
  ]);
  const manifest = manifestRecord.value;
  exactKeys(manifest, ["schema", "status", "baselineRevision", "currentRevision", "report", "entries"], "same-session visual-regression manifest");
  invariant(manifest.schema === PHASE7A_R2_VISUAL_REGRESSION_MANIFEST_SCHEMA && manifest.status === "PASS"
    && manifest.baselineRevision === PHASE7A_R2_PARENT && manifest.currentRevision === revision, "same-session visual-regression manifest authority differs");
  exactKeys(manifest.report, ["path", "bytes", "sha256"], "same-session visual-regression report ledger");
  invariant(manifest.report.path === PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH && manifest.report.bytes === reportRecord.bytes.length
    && manifest.report.sha256 === reportRecord.sha256, "same-session visual-regression report manifest binding differs");
  invariant(Array.isArray(manifest.entries) && manifest.entries.length === 5, "same-session visual-regression PNG inventory differs");
  const expectedPngPaths = Object.values(PHASE7A_R2_VISUAL_REGRESSION_PATHS);
  const ledger = new Map();
  for (const [index, row] of manifest.entries.entries()) {
    exactKeys(row, ["path", "bytes", "sha256"], `same-session visual-regression PNG ledger ${index + 1}`);
    portable(row.path);
    invariant(expectedPngPaths.includes(row.path) && !ledger.has(row.path) && Number.isSafeInteger(row.bytes) && row.bytes > 0 && HASH_64.test(row.sha256 ?? ""), `same-session visual-regression PNG ledger differs: ${row.path}`);
    ledger.set(row.path, row);
  }
  invariant(expectedPngPaths.every((relativePath) => ledger.has(relativePath)), "same-session visual-regression PNG topology differs");
  validatePhase7aR2VisualRegressionAuthority(reportRecord.value, { currentRevision: revision });
  const outputFiles = new Map([[PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH, reportRecord.bytes]]);
  for (const relativePath of expectedPngPaths) outputFiles.set(relativePath, await boundFile(root, relativePath, ledger, relativePath));
  invariant(outputFiles.size === PHASE7A_R2_VISUAL_REGRESSION_CAPTURE_PATHS.length, "same-session visual-regression loaded topology differs");
  return { report: reportRecord.value, reportBytes: reportRecord.bytes, reportSha256: reportRecord.sha256, manifest, outputFiles };
}

async function defaultMediaAudit(payloads, stagingRoot, axeAuthority, recordingDecoder = null) {
  const pngRows = [...payloads].filter(([relativePath]) => relativePath.endsWith(".png"));
  const mp4Rows = [...payloads].filter(([relativePath]) => relativePath.endsWith(".mp4"));
  invariant(pngRows.length === 20 && mp4Rows.length === 3, "prepackage media topology differs");
  const measurements = new Map(axeAuthority.manualContrast.selectorMeasurements.map((measurement) => [`06-accessibility/${path.posix.basename(measurement.screenshot.path)}`, measurement]));
  invariant(measurements.size === CONTRAST_MASK_PATHS.length && CONTRAST_MASK_PATHS.every((relativePath) => measurements.has(relativePath)), "prepackage contrast mask measurement inventory differs");
  for (const [relativePath, bytes] of pngRows) {
    const pipeline = sharp(bytes, { failOn: "error" });
    const decoded = await (measurements.has(relativePath) ? pipeline.removeAlpha() : pipeline).raw().toBuffer({ resolveWithObject: true });
    invariant(decoded.data.length > 0 && decoded.info.width > 0 && decoded.info.height > 0, `prepackage PNG decode failed: ${relativePath}`);
    if (measurements.has(relativePath)) validateR2ContrastMaskPixels({ data: decoded.data, info: decoded.info, measurement: measurements.get(relativePath) });
  }
  for (const [relativePath, bytes] of mp4Rows) {
    validateIsoBmffRecording(bytes, relativePath);
    if (recordingDecoder) invariant(await recordingDecoder({ relativePath, bytes }) === true, `prepackage MP4 full decode failed: ${relativePath}`);
    else await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-i", path.join(stagingRoot, ...relativePath.split("/")), "-map", "0:v:0", "-f", "null", "-"], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  }
  return { png: "PASS", pngCount: 20, mp4: "PASS", mp4Count: 3 };
}

async function validateExternalInput(candidate, label, boundaryOptions) {
  const resolved = assertExternalR2Path(path.resolve(candidate), label, boundaryOptions);
  const info = await lstat(resolved);
  invariant(!info.isSymbolicLink(), `${label} may not be a symlink`);
  invariant(path.resolve(await realpath(resolved)) === resolved, `${label} may not traverse a symlink`);
  return resolved;
}

export async function assembleR2ReviewEvidence(options, dependencies = {}) {
  const boundaryOptions = dependencies.boundaryOptions ?? {};
  const inputs = {};
  for (const key of ["fieldMapDir", "installedChromeDir", "visualRegressionDir", "chromiumQa", "firefoxQa", "webkitQa", "deployment", "r1EvidenceDir"]) inputs[key] = await validateExternalInput(options[key], `--${key}`, boundaryOptions);
  const outputDir = assertExternalR2Path(path.resolve(options.outputDir), "--output-dir", boundaryOptions);
  invariant(HASH_40.test(options.revision ?? "") && options.revision !== PHASE7A_R2_PARENT, "--revision must be the exact new R2 SHA");
  invariant(!await exists(outputDir), "refusing to overwrite existing R2 assembled evidence");
  const parent = path.dirname(outputDir);
  await mkdir(parent, { recursive: true });
  invariant(path.resolve(await realpath(parent)) === path.resolve(parent), "R2 output parent may not traverse a symlink");
  const gitAuthority = dependencies.gitAuthority ?? await deriveR2GitAuthority({ revision: options.revision });
  validateGitAuthority(gitAuthority, options.revision);
  let r1DeploymentInput;
  if (dependencies.testOnlyPrevalidatedR1DeploymentRecord) {
    invariant(process.env.NODE_TEST_CONTEXT, "the prevalidated R1 deployment-record seam is test-only");
    exactKeys(dependencies.testOnlyPrevalidatedR1DeploymentRecord, ["value", "sha256"], "test-only R1 deployment record");
    r1DeploymentInput = Promise.resolve(dependencies.testOnlyPrevalidatedR1DeploymentRecord);
  } else {
    r1DeploymentInput = readJson(path.join(inputs.r1EvidenceDir, "17-deployment", "deployment-verification.json"), "R1 deployment verifier");
  }
  const [generic, installed, visualRegression, deploymentRecord, r1DeploymentRecord, authorityDocumentBytes, ...qaRecords] = await Promise.all([
    loadCaptureRoot(inputs.fieldMapDir, options.revision, false), loadCaptureRoot(inputs.installedChromeDir, options.revision, true),
    loadVisualRegressionRoot(inputs.visualRegressionDir, options.revision), readJson(inputs.deployment, "deployment verifier"),
    r1DeploymentInput,
    readFile(path.join(ROOT, "docs/phase-7a-r2-review-authority.md")),
    ...ENGINES.map((engine) => readJson(inputs[`${engine}Qa`], `${engine} retained QA`)),
  ]);
  const qa = Object.fromEntries(ENGINES.map((engine, index) => [engine, qaRecords[index]]));
  const buildReceipt = dependencies.buildReceipt ?? await runR2BuildReceipt({ revision: options.revision });
  const focusedReceipt = dependencies.focusedReceipt ?? await runR2FocusedTestReceipt({ revision: options.revision });
  const normalizeQaReport = dependencies.normalizeQaReport ?? normalizePhase7aR2RetainedQaReport;
  let payloads = await constructR2Payloads({ authorityDocumentBytes, generic, installed, visualRegression, qa, deploymentReport: deploymentRecord.value, deploymentReceiptSha256: deploymentRecord.sha256, r1DeploymentReport: r1DeploymentRecord.value, r1DeploymentReceiptSha256: r1DeploymentRecord.sha256, gitAuthority, buildReceipt, focusedReceipt, normalizeQaReport });
  const staging = path.join(parent, `.${path.basename(outputDir)}.staging-${randomUUID()}`);
  await mkdir(staging, { recursive: false });
  try {
    for (const [relativePath, bytes] of payloads) {
      if (relativePath === "09-audit/prepackage-evidence-audit.json") continue;
      assertAllowedR2EvidencePath(relativePath);
      assertNoPrivateOrSecretR2Payload(bytes, relativePath);
      const filename = path.join(staging, ...relativePath.split("/"));
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, bytes, { flag: "wx" });
    }
    const reread = new Map();
    for (const [relativePath] of payloads) {
      if (relativePath === "09-audit/prepackage-evidence-audit.json") continue;
      reread.set(relativePath, await readFile(path.join(staging, ...relativePath.split("/"))));
    }
    for (const [relativePath, bytes] of reread) invariant(bytes.equals(payloads.get(relativePath)), `prepackage reread differs: ${relativePath}`);
    const mediaAudit = await defaultMediaAudit(reread, staging, generic.axe, dependencies.recordingDecoder);
    payloads = await constructR2Payloads({ authorityDocumentBytes, generic, installed, visualRegression, qa, deploymentReport: deploymentRecord.value, deploymentReceiptSha256: deploymentRecord.sha256, r1DeploymentReport: r1DeploymentRecord.value, r1DeploymentReceiptSha256: r1DeploymentRecord.sha256, gitAuthority, buildReceipt, focusedReceipt, normalizeQaReport, mediaAudit });
    const auditPath = "09-audit/prepackage-evidence-audit.json";
    await mkdir(path.join(staging, "09-audit"), { recursive: true });
    await writeFile(path.join(staging, ...auditPath.split("/")), payloads.get(auditPath), { flag: "wx" });
    const finalEntries = [];
    for (const { relativePath } of REQUIRED_R2_EVIDENCE) finalEntries.push({ relativePath, data: await readFile(path.join(staging, ...relativePath.split("/"))) });
    normalizeR2EvidenceEntries(finalEntries, { sourceEvidenceRoot: outputDir, boundaryOptions });
    await rename(staging, outputDir);
    return { schema: ASSEMBLER_SCHEMA, status: "PASS", outputDir, revision: options.revision, payloadCount: finalEntries.length, payloadBytes: finalEntries.reduce((sum, entry) => sum + entry.data.length, 0), prepackageAuditSha256: digest(payloads.get(auditPath)) };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export function parseArguments(argv) {
  const options = Object.fromEntries(INPUT_KEYS.map((key) => [key, ""]));
  let selfTest = false; let help = false;
  const names = new Map([["--field-map-dir", "fieldMapDir"], ["--installed-chrome-dir", "installedChromeDir"], ["--visual-regression-dir", "visualRegressionDir"], ["--chromium-qa", "chromiumQa"], ["--firefox-qa", "firefoxQa"], ["--webkit-qa", "webkitQa"], ["--deployment", "deployment"], ["--r1-evidence-dir", "r1EvidenceDir"], ["--output-dir", "outputDir"], ["--revision", "revision"]]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--self-test") selfTest = true;
    else if (flag === "--help") help = true;
    else {
      const key = names.get(flag); invariant(key, `unknown argument: ${flag}`);
      const value = argv[++index]; invariant(value && !value.startsWith("--"), `${flag} requires a value`); options[key] = value;
    }
  }
  if (!selfTest && !help) for (const key of INPUT_KEYS) invariant(options[key], `--${key} is required`);
  return { ...options, selfTest, help };
}

export function selfTest() {
  invariant(REQUIRED_R2_EVIDENCE.length === 40 && Object.keys(GENERIC_COPY).length === 13 && Object.keys(INSTALLED_COPY).length === 5 && PHASE7A_R2_VISUAL_REGRESSION_CAPTURE_PATHS.length === 6, "R2 assembler topology drifted");
  invariant(R2_HUMAN_GATES.filter(({ decision }) => decision === "ACCEPT").length === 5 && R2_HUMAN_GATES.filter(({ decision }) => decision === "PENDING HUMAN REVIEW").length === 1, "R2 human gate authority drifted");
  return { schema: ASSEMBLER_SCHEMA, status: "PASS", payloadCount: 40, acceptedGates: 5, pendingGates: 1, createsPackage: false };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write("Usage: node scripts/assemble-phase7a-r2-review-evidence.mjs --field-map-dir <external> --installed-chrome-dir <external> --visual-regression-dir <external> --chromium-qa <external-json> --firefox-qa <external-json> --webkit-qa <external-json> --deployment <external-json> --r1-evidence-dir <external-r1-package-root-for-signed-deployment-receipt> --output-dir <fresh-external> --revision <sha40>\n"); return; }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`); return; }
  process.stdout.write(`${JSON.stringify(await assembleR2ReviewEvidence(options), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().catch((error) => { process.stderr.write(`Phase 7A-R2 evidence assembly FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
