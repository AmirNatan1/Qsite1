#!/usr/bin/env node

/**
 * Assemble the closed Phase 7B human-review evidence tree.
 *
 * This tool does not create the review ZIP. It consumes independently-created
 * browser, installed-Chrome and deployment authorities, binds them to the
 * final clean Git revision, and writes the exact 50 payloads accepted by
 * package-phase7b-human-review.mjs into one fresh external directory.
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PHASE7B_ACCEPTED_PHASE6,
  PHASE7B_BRANCH,
  PHASE7B_BRANCH_PREVIEW,
  PHASE7B_CORE_VIEWPORTS,
  PHASE7B_CYCLE_COUNT,
  PHASE7B_FROZEN_MAIN,
  PHASE7B_GATES,
  PHASE7B_MACRO_STATES,
  PHASE7B_METHOD_STAGES,
  PHASE7B_PARENT,
  PHASE7B_PERFORMANCE_BUDGET,
  PHASE7B_PRODUCTION_PATHS,
  PHASE7B_RECORDING_SCENARIOS,
  PHASE7B_STAGE_RANGES,
} from "./phase7b-contract.mjs";
import { PHYSICAL_ASSETS } from "./phase7a-contract.mjs";
import {
  PHASE7B_COMMITS_SCHEMA,
  PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH,
  PHASE7B_GATE_RECORDS,
  PHASE7B_GATES_SCHEMA,
  PHASE7B_INSTALLED_CHROME_200_SCHEMA,
  PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH,
  PHASE7B_INSTALLED_CHROME_RECORDING_PATH,
  PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH,
  PHASE7B_NATIVE_200_LIMITATION_SCHEMA,
  PHASE7B_PREPACKAGE_AUDIT_SCHEMA,
  PHASE7B_PROVENANCE_SCHEMA,
  PHASE7B_RECORDING_EVIDENCE_PATHS,
  PHASE7B_STAGE_SPEC_SCHEMA,
  PHASE7B_STANDARD_RECORDING_SCENARIOS,
  REQUIRED_PHASE7B_EVIDENCE,
  assertAllowedPhase7BEvidencePath,
  assertNoPrivateOrSecretPhase7BPayload,
  inspectPhase7BPng,
  normalizePhase7BEvidenceEntries,
  readPhase7BEvidenceDirectory,
} from "./package-phase7b-human-review.mjs";
import {
  sha256,
  stableJson,
  validateIsoBmffRecording,
} from "./package-phase7a-human-review.mjs";
import {
  PHASE7A_R2_VISUAL_REGRESSION_METHOD,
  PHASE7A_R2_VISUAL_REGRESSION_SCHEMA,
  validatePhase7aR2VisualRegressionAuthority,
} from "./phase7a-r2-visual-regression-authority.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PHASE7B_ASSEMBLER_SCHEMA = "quantum-hub.phase-7b.review-evidence-assembly.v1";
export const PHASE7B_BROWSER_QA_SCHEMA = "quantum-hub.phase-7b.operating-field-browser-qa.v1";
export const PHASE7B_BROWSER_MANIFEST_SCHEMA = "quantum-hub.phase-7b.operating-field-browser-manifest.v1";
export const PHASE7B_DEPLOYMENT_SCHEMA = "quantum-hub.phase-7b.deployment-verification.v1";
export const BROWSER_REPORT_PATH = "phase-7b-browser-qa.json";
export const BROWSER_MANIFEST_PATH = "evidence-manifest.json";
export const ASSEMBLED_PAYLOAD_COUNT = 50;

const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const execFileAsync = promisify(execFile);

const FALLBACK_IDS = Object.freeze(["reduced-motion", "no-javascript", "fallback-fonts"]);
const QA_ENGINES = Object.freeze(["chromium", "firefox", "webkit"]);
const PACKAGE_ENGINES = Object.freeze(["chromium", "firefox", "webkit-proxy"]);
const VISUAL_REGRESSION_STATES = Object.freeze(["manifesto-entry", "audience-bifurcation", "field-map-closed", "field-map-open"]);
const MANUAL_CONTRAST_COLORS = Object.freeze({ background: "#0b0e0f", muted: "#8a9797", body: "#c2cbcb", white: "#ffffff", focus: "#f06ba0", signalDecoration: "#d82b72" });
export const PHASE7B_RESPONSIVE_SELECTION = Object.freeze([
  Object.freeze({ destination: "04-responsive/desktop.png", source: "screenshots/chromium/1440x900-operating-field.png", viewport: Object.freeze([1440, 900]) }),
  Object.freeze({ destination: "04-responsive/short-desktop.png", source: "screenshots/chromium/1366x650-operating-field.png", viewport: Object.freeze([1366, 650]) }),
  Object.freeze({ destination: "04-responsive/tablet.png", source: "screenshots/chromium/768x1024-operating-field.png", viewport: Object.freeze([768, 1024]) }),
  Object.freeze({ destination: "04-responsive/mobile.png", source: "screenshots/chromium/390x844-operating-field.png", viewport: Object.freeze([390, 844]) }),
  Object.freeze({ destination: "04-responsive/narrow-320.png", source: "screenshots/chromium/320x800-operating-field.png", viewport: Object.freeze([320, 800]) }),
  Object.freeze({ destination: "04-responsive/short-landscape.png", source: "screenshots/chromium/800x360-operating-field.png", viewport: Object.freeze([800, 360]) }),
]);

export const EXPECTED_BROWSER_SOURCE_PATHS = Object.freeze([
  BROWSER_REPORT_PATH,
  ...["chromium", "firefox"].flatMap((engine) => PHASE7B_STANDARD_RECORDING_SCENARIOS.map((scenario) => `recordings/${engine}/${scenario}.mp4`)),
  ...QA_ENGINES.flatMap((engine) => PHASE7B_CORE_VIEWPORTS.map(([width, height]) => `screenshots/${engine}/${width}x${height}-operating-field.png`)),
  ...QA_ENGINES.flatMap((engine) => FALLBACK_IDS.map((id) => `screenshots/${engine}/fallback-${id}.png`)),
]);

export const EXPECTED_NATIVE_SOURCE_PATHS = Object.freeze([
  path.posix.basename(PHASE7B_INSTALLED_CHROME_RECORDING_PATH),
  path.posix.basename(PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH),
  path.posix.basename(PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH),
  path.posix.basename(PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

function parseJson(bytes, label) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error(`${label} is not valid JSON`); }
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function portableRelative(value, label) {
  invariant(typeof value === "string" && value.length > 0 && !value.includes("\\") && !path.posix.isAbsolute(value), `${label} must be portable and relative`);
  invariant(path.posix.normalize(value) === value && value !== "." && !value.startsWith("../") && !value.split("/").includes(".."), `${label} may not traverse`);
  return value;
}

function noFalseChecks(checks, label, { allowNull = true } = {}) {
  invariant(checks && typeof checks === "object" && !Array.isArray(checks), `${label} checks are missing`);
  for (const [name, value] of Object.entries(checks)) {
    invariant(value === true || (allowNull && value === null), `${label}.${name} is not affirmative`);
  }
}

function assertNoFailureStatus(value, label = "authority") {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value) && Object.hasOwn(value, "status")) invariant(value.status !== "FAIL", `${label} contains FAIL status`);
  if (Array.isArray(value)) value.forEach((entry, index) => assertNoFailureStatus(entry, `${label}[${index}]`));
  else for (const [name, entry] of Object.entries(value)) assertNoFailureStatus(entry, `${label}.${name}`);
}

function exactSet(observed, expected, label) {
  invariant(observed.length === expected.length, `${label} count differs`);
  invariant(sameJson([...observed].sort(), [...expected].sort()), `${label} topology differs`);
}

function sourceBinding(record, relativePath, bytes, label) {
  invariant(record?.relativePath === relativePath && record.bytes === bytes.length && record.sha256 === sha256(bytes) && record.decodeStatus === "PASS", `${label} byte/hash/decode binding differs`);
}

function repositoryBinding(candidate, repository, label) {
  invariant(candidate?.branch === PHASE7B_BRANCH && candidate.head === repository.head && candidate.requiredParent === PHASE7B_PARENT, `${label} branch/head/parent differs`);
  invariant(candidate.localMain === PHASE7B_FROZEN_MAIN && candidate.originMain === PHASE7B_FROZEN_MAIN && candidate.worktreeClean === true && candidate.zeroMergeCommits === true, `${label} main/clean/merge authority differs`);
  invariant(candidate.upstream === `origin/${PHASE7B_BRANCH}` && candidate.upstreamHead === repository.head, `${label} upstream parity differs`);
}

async function gitText(args, repositoryRoot = ROOT) {
  const result = await execFileAsync("git", args, { cwd: repositoryRoot, encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 32 * 1024 * 1024 });
  return String(result.stdout).trim();
}

async function gitSuccess(args, repositoryRoot = ROOT) {
  try { await gitText(args, repositoryRoot); return true; }
  catch { return false; }
}

function parseCommitRows(text) {
  return String(text).split(/\r?\n/).filter(Boolean).map((line) => {
    const [hash, parentsText, ...subjectParts] = line.split("\t");
    const parents = String(parentsText ?? "").split(/\s+/).filter(Boolean);
    return { hash, parents, subject: subjectParts.join("\t") };
  });
}

export function validateRepositoryAuthority(snapshot, revision) {
  invariant(HASH_40.test(revision ?? "") && revision !== PHASE7B_PARENT, "final revision must be a new lowercase 40-character SHA");
  invariant(snapshot?.branch === PHASE7B_BRANCH && snapshot.head === revision, "final repository branch or HEAD differs");
  invariant(snapshot.status === "", "final repository worktree is not clean including untracked files");
  invariant(snapshot.upstream === `origin/${PHASE7B_BRANCH}` && snapshot.upstreamHead === revision, "final repository local/upstream parity differs");
  invariant(snapshot.localMain === PHASE7B_FROZEN_MAIN && snapshot.originMain === PHASE7B_FROZEN_MAIN, "local or origin main changed");
  invariant(snapshot.acceptedPhase6Ancestry === true && snapshot.acceptedPhase7AAncestry === true, "accepted Phase 6/7A ancestry differs");
  invariant(snapshot.mergeCount === 0, "Phase 7B history contains a merge commit");
  exactSet(snapshot.changedSourcePaths ?? [], PHASE7B_PRODUCTION_PATHS, "Phase 7B changed source path");
  invariant(Array.isArray(snapshot.commitRows) && snapshot.commitRows.length > 0, "Phase 7B commit list is empty");
  const commits = snapshot.commitRows.map((row, index) => {
    invariant(HASH_40.test(row.hash ?? "") && row.parents?.length === 1 && HASH_40.test(row.parents[0] ?? "") && typeof row.subject === "string" && row.subject.length > 0, "Phase 7B commit row differs");
    const parent = index === 0 ? PHASE7B_PARENT : snapshot.commitRows[index - 1].hash;
    invariant(row.parents[0] === parent, "Phase 7B commit history is not linear from the accepted parent");
    return { hash: row.hash, parent, subject: row.subject };
  });
  invariant(commits.at(-1).hash === revision, "Phase 7B commit list does not end at final HEAD");
  return Object.freeze({
    branch: PHASE7B_BRANCH,
    head: revision,
    parent: PHASE7B_PARENT,
    directParent: commits.at(-1).parent,
    upstream: snapshot.upstream,
    upstreamHead: snapshot.upstreamHead,
    localMain: snapshot.localMain,
    originMain: snapshot.originMain,
    worktreeClean: true,
    upstreamParity: true,
    acceptedPhase6Ancestry: true,
    acceptedPhase7AAncestry: true,
    mergeCount: 0,
    changedSourcePaths: [...snapshot.changedSourcePaths],
    commits,
  });
}

export async function readRepositoryAuthority(revision, repositoryRoot = ROOT) {
  const [branch, head, statusText, upstream, upstreamHead, localMain, originMain, merges, commitText, changedSourceText, phase6, phase7a] = await Promise.all([
    gitText(["branch", "--show-current"], repositoryRoot),
    gitText(["rev-parse", "HEAD"], repositoryRoot),
    gitText(["status", "--porcelain=v1", "--untracked-files=all"], repositoryRoot),
    gitText(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], repositoryRoot),
    gitText(["rev-parse", "@{upstream}"], repositoryRoot),
    gitText(["rev-parse", "main"], repositoryRoot),
    gitText(["rev-parse", "origin/main"], repositoryRoot),
    gitText(["rev-list", "--merges", `${PHASE7B_PARENT}..${revision}`], repositoryRoot),
    gitText(["log", "--reverse", "--format=%H%x09%P%x09%s", `${PHASE7B_PARENT}..${revision}`], repositoryRoot),
    gitText(["diff", "--name-only", `${PHASE7B_PARENT}..${revision}`, "--", "src", "public"], repositoryRoot),
    gitSuccess(["merge-base", "--is-ancestor", PHASE7B_ACCEPTED_PHASE6, revision], repositoryRoot),
    gitSuccess(["merge-base", "--is-ancestor", PHASE7B_PARENT, revision], repositoryRoot),
  ]);
  return validateRepositoryAuthority({
    branch,
    head,
    status: statusText,
    upstream,
    upstreamHead,
    localMain,
    originMain,
    acceptedPhase6Ancestry: phase6,
    acceptedPhase7AAncestry: phase7a,
    mergeCount: merges ? merges.split(/\r?\n/).filter(Boolean).length : 0,
    changedSourcePaths: changedSourceText.split(/\r?\n/).filter(Boolean).map((value) => value.replaceAll("\\", "/")),
    commitRows: parseCommitRows(commitText),
  }, revision);
}

export async function readProductionDiff(revision, repositoryRoot = ROOT) {
  const text = await gitText(["diff", "--no-ext-diff", "--full-index", "--no-renames", `${PHASE7B_PARENT}..${revision}`, "--", ...PHASE7B_PRODUCTION_PATHS], repositoryRoot);
  invariant(text.length > 0, "Phase 7B production diff is empty");
  const paths = [...text.matchAll(/^diff --git a\/(.+?) b\/(.+?)$/gm)].map((match) => {
    invariant(match[1] === match[2], "Phase 7B production diff contains a rename");
    return match[1];
  });
  exactSet(paths, PHASE7B_PRODUCTION_PATHS, "Phase 7B production diff path");
  return Buffer.from(`${text}\n`, "utf8");
}

export async function readPhase4Authority(repositoryRoot = ROOT) {
  const assets = [];
  for (const [relativePath, expectedSha256] of PHYSICAL_ASSETS) {
    const bytes = await readFile(path.join(repositoryRoot, ...relativePath.split("/")));
    invariant(sha256(bytes) === expectedSha256, `authoritative Phase 4 hash changed: ${relativePath}`);
    assets.push({ path: relativePath, sha256: expectedSha256, bytes: bytes.length, status: "PASS" });
  }
  return Object.freeze({ status: "PASS", assetCount: assets.length, assets });
}

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const left = relativeLuminance(foreground);
  const right = relativeLuminance(background);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

export async function readManualContrastAuthority(repositoryRoot = ROOT) {
  const [tokens, methodCss] = await Promise.all([
    readFile(path.join(repositoryRoot, "src", "styles", "tokens.css"), "utf8"),
    readFile(path.join(repositoryRoot, "src", "styles", "routes", "phase-7b-operating-field.css"), "utf8"),
  ]);
  for (const color of [MANUAL_CONTRAST_COLORS.muted, MANUAL_CONTRAST_COLORS.body, MANUAL_CONTRAST_COLORS.focus, MANUAL_CONTRAST_COLORS.signalDecoration]) invariant(tokens.toLowerCase().includes(color), `manual contrast token is absent from production source: ${color}`);
  invariant(methodCss.toLowerCase().includes(MANUAL_CONTRAST_COLORS.background), "manual contrast worst-case stage background is absent from production source");
  const measure = (role, foreground, essentialText = true) => ({
    role,
    foreground,
    background: MANUAL_CONTRAST_COLORS.background,
    ratio: Number(contrastRatio(foreground, MANUAL_CONTRAST_COLORS.background).toFixed(3)),
    requiredRatio: essentialText ? 4.5 : null,
    essentialText,
    status: essentialText ? (contrastRatio(foreground, MANUAL_CONTRAST_COLORS.background) >= 4.5 ? "PASS" : "FAIL") : "DECORATION",
  });
  const measurements = [
    measure("muted text", MANUAL_CONTRAST_COLORS.muted),
    measure("body text", MANUAL_CONTRAST_COLORS.body),
    measure("white text", MANUAL_CONTRAST_COLORS.white),
    measure("focus and magenta-soft text", MANUAL_CONTRAST_COLORS.focus),
    measure("live signal", MANUAL_CONTRAST_COLORS.signalDecoration, false),
  ];
  invariant(measurements.filter(({ essentialText }) => essentialText).every(({ status }) => status === "PASS"), "manual worst-case text contrast fails WCAG AA");
  return Object.freeze({
    status: "PASS",
    method: "WCAG 2.x relative luminance: (Llighter + 0.05) / (Ldarker + 0.05)",
    worstCaseBackground: MANUAL_CONTRAST_COLORS.background,
    measurements,
    liveSignalClassification: "#d82b72 is non-text signal decoration and is not used as essential text.",
  });
}

export async function readSourcePerformanceAuthority(repositoryRoot = ROOT) {
  const [controller, model, css, currentPackage, parentPackageText] = await Promise.all([
    readFile(path.join(repositoryRoot, "src", "scripts", "operating-field.ts")),
    readFile(path.join(repositoryRoot, "src", "scripts", "operating-field-state.mjs")),
    readFile(path.join(repositoryRoot, "src", "styles", "routes", "phase-7b-operating-field.css")),
    readFile(path.join(repositoryRoot, "package.json"), "utf8"),
    gitText(["show", `${PHASE7B_PARENT}:package.json`], repositoryRoot),
  ]);
  const currentDependencies = JSON.parse(currentPackage).dependencies ?? {};
  const parentDependencies = JSON.parse(parentPackageText).dependencies ?? {};
  invariant(sameJson(currentDependencies, parentDependencies), "Phase 7B runtime dependency graph changed");
  const rawJavaScriptDelta = controller.length + model.length;
  const rawCssDelta = css.length;
  invariant(rawJavaScriptDelta <= PHASE7B_PERFORMANCE_BUDGET.rawJavaScriptDeltaMaximum && rawCssDelta <= PHASE7B_PERFORMANCE_BUDGET.rawCssDeltaMaximum, "Phase 7B raw JS/CSS budget differs");
  invariant(!/(?:fetch\s*\(|new\s+(?:Image|Audio)\b|url\s*\(\s*["']?\/?(?:media|assets?)\/)/i.test(Buffer.concat([controller, model, css]).toString("utf8")), "Phase 7B source introduces an unaccounted runtime request or asset");
  return Object.freeze({
    status: "PASS",
    rawJavaScriptDelta,
    rawJavaScriptMaximum: PHASE7B_PERFORMANCE_BUDGET.rawJavaScriptDeltaMaximum,
    rawCssDelta,
    rawCssMaximum: PHASE7B_PERFORMANCE_BUDGET.rawCssDeltaMaximum,
    builtJavaScriptDelta: "NOT OBSERVED — no accepted Phase 7A build-byte ledger was supplied to this assembler",
    builtCssDelta: "NOT OBSERVED — no accepted Phase 7A build-byte ledger was supplied to this assembler",
    addedAssetBytes: 0,
    runtimeRequestDelta: 0,
    runtimeDependencyDelta: 0,
  });
}

export function validateAcceptedPhase7ARegression(report, bytes = Buffer.from(stableJson(report))) {
  validatePhase7aR2VisualRegressionAuthority(report, { currentRevision: PHASE7B_PARENT });
  invariant(report.schema === PHASE7A_R2_VISUAL_REGRESSION_SCHEMA && report.status === "PASS" && report.method === PHASE7A_R2_VISUAL_REGRESSION_METHOD && report.currentRevision === PHASE7B_PARENT, "accepted Phase 7A visual authority differs");
  return Object.freeze({
    status: "PASS",
    schema: report.schema,
    method: report.method,
    acceptedRevision: report.currentRevision,
    sourceAuthoritySha256: sha256(bytes),
    exactDecodedPixelComparisons: report.comparisons.map(({ state, result }) => ({ state, classification: result.classification, differentPixels: result.differentPixels, maxChannelDelta: result.maxChannelDelta, status: result.status })),
  });
}

async function walkFiles(root, current = root) {
  const rows = [];
  const children = await readdir(current, { withFileTypes: true });
  for (const child of children) {
    const absolute = path.join(current, child.name);
    const info = await lstat(absolute);
    const relativePath = portableRelative(path.relative(root, absolute).split(path.sep).join("/"), "source evidence path");
    invariant(!info.isSymbolicLink(), `source evidence contains a symlink: ${relativePath}`);
    if (info.isDirectory()) rows.push(...await walkFiles(root, absolute));
    else {
      invariant(info.isFile(), `source evidence contains an unsupported node: ${relativePath}`);
      rows.push({ relativePath, data: await readFile(absolute) });
    }
  }
  return rows;
}

async function readClosedDirectory(directory, expectedPaths, label) {
  const absolute = path.resolve(directory);
  const info = await lstat(absolute);
  invariant(info.isDirectory() && !info.isSymbolicLink() && path.resolve(await realpath(absolute)) === absolute, `${label} must be a real, non-symlink directory`);
  const entries = await walkFiles(absolute);
  exactSet(entries.map(({ relativePath }) => relativePath), expectedPaths, `${label} source`);
  return new Map(entries.map((entry) => [entry.relativePath, entry.data]));
}

function validateBrowserManifest(manifest, files) {
  invariant(manifest?.schema === PHASE7B_BROWSER_MANIFEST_SCHEMA && manifest.status === "PASS", "browser evidence manifest schema/status differs");
  invariant(manifest.entryCount === EXPECTED_BROWSER_SOURCE_PATHS.length && manifest.duplicatePaths === false && manifest.traversalPaths === false && manifest.nestedArchives === false && manifest.sourceArchives === false && manifest.privatePaths === false, "browser evidence manifest governance differs");
  invariant(Array.isArray(manifest.entries), "browser evidence manifest entries are missing");
  exactSet(manifest.entries.map(({ relativePath }) => relativePath), EXPECTED_BROWSER_SOURCE_PATHS, "browser manifest entry");
  const seen = new Set();
  let totalBytes = 0;
  for (const entry of manifest.entries) {
    invariant(!seen.has(entry.relativePath), `browser manifest duplicates ${entry.relativePath}`);
    seen.add(entry.relativePath);
    const bytes = files.get(entry.relativePath);
    invariant(bytes && entry.bytes === bytes.length && entry.sha256 === sha256(bytes), `browser manifest byte/hash binding differs: ${entry.relativePath}`);
    totalBytes += bytes.length;
  }
  invariant(manifest.totalBytes === totalBytes, "browser manifest total byte count differs");
}

function responsiveViewportObject(width, height) {
  return { id: `${width}x${height}`, width, height };
}

function validateBrowserResult(result, files, repository) {
  const engine = result?.identity?.engine;
  invariant(QA_ENGINES.includes(engine), "browser QA engine identity differs");
  invariant(["PASS", "LIMITATION"].includes(result.status), `${engine} browser QA status differs`);
  noFalseChecks(result.checks, `${engine} engine`);
  for (const sectionName of ["responsive", "visualRegression", "projection", "fallback", "accessibility", "regression", "history", "lifecycle", "network", "recordings"]) {
    const section = result[sectionName];
    invariant(section && section.status !== "FAIL", `${engine} ${sectionName} authority is missing or failed`);
    if (section.checks) noFalseChecks(section.checks, `${engine} ${sectionName}`);
  }

  invariant(result.responsive.status === "PASS" && result.responsive.cases?.length === PHASE7B_CORE_VIEWPORTS.length, `${engine} responsive matrix differs`);
  result.responsive.cases.forEach((responsiveCase, index) => {
    const [width, height] = PHASE7B_CORE_VIEWPORTS[index];
    const expectedViewport = responsiveViewportObject(width, height);
    invariant(responsiveCase.status === "PASS" && sameJson(responsiveCase.viewport, expectedViewport), `${engine} responsive case differs at ${width}x${height}`);
    noFalseChecks(responsiveCase.checks, `${engine} responsive ${width}x${height}`, { allowNull: false });
    const relativePath = `screenshots/${engine}/${width}x${height}-operating-field.png`;
    const bytes = files.get(relativePath);
    inspectPhase7BPng(bytes, relativePath);
    sourceBinding(responsiveCase.screenshot, relativePath, bytes, `${engine} responsive screenshot`);
    invariant(responsiveCase.screenshot.width === width && responsiveCase.screenshot.height === height, `${engine} responsive screenshot dimensions differ at ${width}x${height}`);
  });

  invariant(result.fallback.status === "PASS" && result.fallback.cases?.length === FALLBACK_IDS.length, `${engine} fallback matrix differs`);
  result.fallback.cases.forEach((fallbackCase, index) => {
    const id = FALLBACK_IDS[index];
    invariant(fallbackCase.id === id && fallbackCase.status === "PASS", `${engine} ${id} fallback differs`);
    noFalseChecks(fallbackCase.checks, `${engine} ${id} fallback`, { allowNull: false });
    const relativePath = `screenshots/${engine}/fallback-${id}.png`;
    const bytes = files.get(relativePath);
    inspectPhase7BPng(bytes, relativePath);
    sourceBinding(fallbackCase.screenshot, relativePath, bytes, `${engine} ${id} fallback screenshot`);
  });

  invariant(["PASS", "LIMITATION"].includes(result.accessibility.status) && result.accessibility.cases?.length === 2, `${engine} accessibility matrix differs`);
  for (const axeCase of result.accessibility.cases) {
    const incomplete = axeCase.result?.incomplete ?? [];
    invariant(["PASS", "LIMITATION"].includes(axeCase.status) && axeCase.result?.violations?.length === 0 && incomplete.every(({ id }) => id === "color-contrast"), `${engine} accessibility contains a violation or non-contrast incomplete`);
    noFalseChecks(axeCase.checks, `${engine} accessibility ${axeCase.viewport?.id ?? "case"}`, { allowNull: false });
  }

  const visual = result.visualRegression;
  invariant(visual.status === "PASS" && visual.baselineAuthority?.revision === PHASE7B_PARENT && visual.baselineAuthority.captureOrigin === "ACCEPTED_IMMUTABLE_PHASE7A" && visual.currentAuthority?.revision === repository.head && visual.currentAuthority.captureOrigin === "CAPTURE_ORIGIN" && visual.retainedPngs === false, `${engine} accepted-Phase7A visual authority differs`);
  invariant(visual.cases?.length === VISUAL_REGRESSION_STATES.length, `${engine} accepted-Phase7A visual case inventory differs`);
  visual.cases.forEach((visualCase, index) => {
    invariant(visualCase.id === VISUAL_REGRESSION_STATES[index] && visualCase.status === "PASS", `${engine} visual regression case differs`);
    noFalseChecks(visualCase.checks, `${engine} visual regression ${visualCase.id}`, { allowNull: false });
    invariant(["EXACT", "BOUNDED_RENDERING_NOISE"].includes(visualCase.classification) && typeof visualCase.explanation === "string" && visualCase.explanation.length > 0, `${engine} visual regression ${visualCase.id} lacks a governed explanation`);
    for (const [authority, revision, label] of [[visualCase.baseline, PHASE7B_PARENT, "baseline"], [visualCase.current, repository.head, "current"]]) {
      invariant(authority?.revision === revision && authority.sourcePngBytes > 0 && HASH_64.test(authority.sourcePngSha256 ?? "") && HASH_64.test(authority.normalizedSha256 ?? ""), `${engine} visual regression ${visualCase.id} ${label} hash authority differs`);
    }
    invariant(visualCase.metrics && ["width", "height", "pixels", "differingPixels", "differingChannels", "changedFraction", "meanAbsoluteChannelDelta", "rootMeanSquareChannelDelta", "maximumChannelDelta"].every((name) => typeof visualCase.metrics[name] === "number" && Number.isFinite(visualCase.metrics[name])) && typeof visualCase.metrics.exact === "boolean", `${engine} visual regression ${visualCase.id} metrics differ`);
    invariant(Array.isArray(visualCase.retainedMedia) && visualCase.retainedMedia.length === 0, `${engine} visual regression raw comparison PNGs must not enter the compact source topology`);
  });

  invariant(result.projection.status === "PASS" && result.regression.status === "PASS" && result.history.status === "PASS" && result.network.status === "PASS", `${engine} projection/regression/history/network authority differs`);
  invariant(["PASS", "LIMITATION"].includes(result.lifecycle.status) && result.lifecycle.cycles?.length === PHASE7B_CYCLE_COUNT, `${engine} lifecycle authority differs`);
  noFalseChecks(result.lifecycle.checks, `${engine} lifecycle`);

  const recordings = result.recordings.recordings;
  invariant(recordings?.length === PHASE7B_RECORDING_SCENARIOS.length, `${engine} recording inventory differs`);
  recordings.forEach((record, index) => {
    const scenario = PHASE7B_RECORDING_SCENARIOS[index];
    invariant(record.engine === engine && record.scenario === scenario, `${engine} recording scenario order differs`);
    if (engine === "webkit" || scenario === "installed-chrome-200-percent") {
      invariant(record.status === "LIMITATION" && record.relativePath === null && record.media == null, `${engine} ${scenario} must remain a non-recording limitation`);
      return;
    }
    const relativePath = `recordings/${engine}/${scenario}.mp4`;
    const bytes = files.get(relativePath);
    invariant(record.status === "PASS" && record.relativePath === relativePath, `${engine} ${scenario} recording authority differs`);
    invariant(record.media?.bytes === bytes.length && record.media.sha256 === sha256(bytes) && record.media.decodeStatus === "PASS" && record.media.codec === "h264" && record.media.pixelFormat === "yuv420p" && record.media.width === 1280 && record.media.height === 720, `${engine} ${scenario} media binding differs`);
    validateIsoBmffRecording(bytes, relativePath);
  });

  if (engine === "webkit") invariant(result.identity.evidenceClass === "playwright-webkit-proxy" && /not physical Safari/i.test(result.identity.statement ?? ""), "WebKit proxy authority is overstated");
  return engine;
}

export async function validateBrowserQaInput(directory, repository) {
  const files = await readClosedDirectory(directory, [...EXPECTED_BROWSER_SOURCE_PATHS, BROWSER_MANIFEST_PATH], "browser QA directory");
  const report = parseJson(files.get(BROWSER_REPORT_PATH), BROWSER_REPORT_PATH);
  const manifest = parseJson(files.get(BROWSER_MANIFEST_PATH), BROWSER_MANIFEST_PATH);
  assertNoPrivateOrSecretPhase7BPayload(files.get(BROWSER_REPORT_PATH), BROWSER_REPORT_PATH);
  assertNoPrivateOrSecretPhase7BPayload(files.get(BROWSER_MANIFEST_PATH), BROWSER_MANIFEST_PATH);
  validateBrowserManifest(manifest, files);
  invariant(report?.schema === PHASE7B_BROWSER_QA_SCHEMA && ["PASS", "LIMITATION"].includes(report.status), "browser QA report schema/status differs");
  invariant(report.branch === PHASE7B_BRANCH && report.revision === repository.head && report.captureOrigin === "CAPTURE_ORIGIN", "browser QA branch/revision/origin authority differs");
  repositoryBinding(report.repository, repository, "browser QA repository");
  invariant(report.results?.length === QA_ENGINES.length, "browser QA must contain exactly three engine results");
  const engines = report.results.map((result) => validateBrowserResult(result, files, repository));
  exactSet(engines, QA_ENGINES, "browser QA engine");
  invariant(report.checks?.noEngineFailures === true, "browser QA reports an engine failure");
  invariant(Object.keys(report.humanGates ?? {}).length === PHASE7B_GATES.length && PHASE7B_GATES.every((gate) => report.humanGates[gate] === "PENDING HUMAN REVIEW"), "browser QA changed a human gate");
  assertNoFailureStatus(report, "browser QA report");
  return Object.freeze({ report, files, results: new Map(report.results.map((result) => [result.identity.engine, result])) });
}

export async function validateNativeChromeInput(directory, repository) {
  const files = await readClosedDirectory(directory, EXPECTED_NATIVE_SOURCE_PATHS, "installed-Chrome native-200 directory");
  const reportName = path.posix.basename(PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH);
  const recordingName = path.posix.basename(PHASE7B_INSTALLED_CHROME_RECORDING_PATH);
  const screenshotName = path.posix.basename(PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH);
  const firefoxName = path.posix.basename(PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH);
  const report = parseJson(files.get(reportName), reportName);
  const firefox = parseJson(files.get(firefoxName), firefoxName);
  const recording = files.get(recordingName);
  const screenshot = files.get(screenshotName);
  invariant(report?.schema === PHASE7B_INSTALLED_CHROME_200_SCHEMA && report.status === "PASS" && report.browser === "Google Chrome" && report.genuineInstalledChrome === true, "genuine installed-Chrome authority differs");
  invariant(report.nativeZoomPercent === 200 && report.visibleZoomConfirmation === "Zoom: 200%" && /Chrome\//.test(report.browserVersion ?? ""), "installed-Chrome visible native-zoom authority differs");
  invariant(report.branch === PHASE7B_BRANCH && report.revision === repository.head && report.humanGate === "PENDING HUMAN REVIEW", "installed-Chrome branch/revision/gate differs");
  repositoryBinding(report.repository, repository, "installed-Chrome repository");
  invariant(report.recording?.path === recordingName && report.recording.bytes === recording.length && report.recording.sha256 === sha256(recording) && report.recording.fullDecode === true, "installed-Chrome recording binding differs");
  invariant(report.screenshot?.path === screenshotName && report.screenshot.bytes === screenshot.length && report.screenshot.sha256 === sha256(screenshot), "installed-Chrome screenshot binding differs");
  invariant(report.zoomGeometry?.status === "PASS" && Object.values(report.zoomGeometry.checks ?? {}).every((value) => value === true) && Math.abs(report.zoomGeometry.widthRatio - 2) <= 0.06 && Math.abs(report.zoomGeometry.dprRatio - 2) <= 0.06, "installed-Chrome 200% geometry differs");
  invariant(report.method?.stateCount === PHASE7B_METHOD_STAGES.length && report.method.stages?.length === PHASE7B_METHOD_STAGES.length, "installed-Chrome METHOD stage inventory differs");
  report.method.stages.forEach((stage, index) => invariant(stage.stage === PHASE7B_METHOD_STAGES[index] && stage.headingFullyVisible === true && stage.copyFullyVisible === true && stage.internalWordBreaking === false && stage.horizontalOverflow === false, `installed-Chrome ${PHASE7B_METHOD_STAGES[index]} geometry differs`));
  invariant(report.fieldMap?.status === "PASS", "installed-Chrome Field Map authority differs");
  noFalseChecks(report.fieldMap.checks, "installed-Chrome Field Map", { allowNull: false });
  invariant(firefox?.schema === PHASE7B_NATIVE_200_LIMITATION_SCHEMA && firefox.status === "LIMITATION" && firefox.engine === "firefox" && firefox.classification === "NOT APPLICABLE" && firefox.nativeZoomPercent === 200 && firefox.recording === null && typeof firefox.reason === "string" && firefox.reason.length >= 24, "Firefox native-200 limitation differs");
  inspectPhase7BPng(screenshot, screenshotName);
  validateIsoBmffRecording(recording, recordingName);
  assertNoFailureStatus(report, "installed-Chrome report");
  return Object.freeze({ report, firefox, files });
}

export function validateDeploymentInput(report, repository) {
  invariant(report?.schema === PHASE7B_DEPLOYMENT_SCHEMA && report.status === "PASS" && report.parity === "PASS", "deployment verifier schema/status/parity differs");
  invariant(report.deployedSha === repository.head && UUID.test(report.deploymentId ?? "") && report.environment === "preview" && report.projectName === "qsite1", "deployment identity differs");
  const immutable = `https://${report.deploymentId.slice(0, 8)}.qsite1.pages.dev/`;
  invariant(report.immutableUrl === immutable && report.branchUrl === PHASE7B_BRANCH_PREVIEW, "deployment preview binding differs");
  invariant(report.inputs?.expectedDeployedSha === repository.head && report.inputs.branch === PHASE7B_BRANCH && report.inputs.requiredParent === PHASE7B_PARENT && report.inputs.frozenMain === PHASE7B_FROZEN_MAIN && report.inputs.localDist === "dist", "deployment input authority differs");
  for (const name of ["repository", "deployment", "productionIsolation", "phase4", "runtimeRequests"]) invariant(report[name]?.status === "PASS" && report[name].data?.status === "PASS", `deployment ${name} authority differs`);
  invariant(report.dist?.status === "PASS" && report.origins?.immutable?.status === "PASS" && report.origins.immutable.data?.status === "PASS" && report.origins?.branch?.status === "PASS" && report.origins.branch.data?.status === "PASS", "deployment local/dist/origin parity differs");
  invariant(report.dist.exactPublicRouteAuthority?.length === 10 && report.origins.immutable.data.exactPublicRoutes?.length === 10 && report.origins.branch.data.exactPublicRoutes?.length === 10 && report.origins.immutable.data.real404?.status === "PASS" && report.origins.branch.data.real404?.status === "PASS", "deployment publication route/404 authority differs");
  noFalseChecks(report.checks, "deployment", { allowNull: false });
  invariant(Array.isArray(report.failures) && report.failures.length === 0, "deployment report contains failures");
  assertNoFailureStatus(report, "deployment report");
  return report;
}

function normalizedTaskBrief() {
  return `# QUANTUM-HUB QSITE1 — PHASE 7B\n\n## THE OPERATING FIELD / ONE WORKPIECE CHANGES STATE\n\nAuthority: implement one bounded METHOD chapter in which one persistent Workpiece changes state through FRAME, SOURCE, ASSESS, TEST and DECIDE, then releases into the retained site. Preserve Phase 7A and the frozen physical opening. Use native document scroll, progressive enhancement, accessible semantic stages and no new runtime dependency.\n\nAll six Phase 7B gates remain **PENDING HUMAN REVIEW**. This evidence package does not self-accept Phase 7B, authorize a later phase, modify main or merge main.\n`;
}

function reportStatus(section) {
  invariant(section && section.status !== "FAIL", "cannot derive a PASS report from failed or missing evidence");
  if (section.checks) noFalseChecks(section.checks, "derived report source");
  return "PASS";
}

function publicResult(result) {
  return {
    engine: result.identity.engine === "webkit" ? "webkit-proxy" : result.identity.engine,
    evidenceClass: result.identity.evidenceClass,
    version: result.identity.version,
    sourceStatus: result.status,
    checks: result.checks,
    limitations: result.limitations ?? [],
  };
}

function relativeScreenshotSummary(responsiveCase, destination) {
  return {
    viewport: [responsiveCase.viewport.width, responsiveCase.viewport.height],
    status: responsiveCase.status,
    destination,
    horizontalOverflow: responsiveCase.snapshot?.horizontalOverflow ?? null,
    targetSize: responsiveCase.targetSize?.status ?? null,
    state: responsiveCase.projection?.at(-1)?.observed?.state ?? null,
  };
}

function deriveReports({ repository, browser, native, deployment, phase4, acceptedPhase7A, manualContrast, sourcePerformance }) {
  const results = QA_ENGINES.map((engine) => browser.results.get(engine));
  const chromium = browser.results.get("chromium");
  const webkit = browser.results.get("webkit");
  const limitations = [...new Set([
    ...(browser.report.limitations ?? []),
    ...results.flatMap((result) => result.limitations ?? []),
    ...results.flatMap((result) => result.lifecycle?.limitations ?? []),
    ...(native.report.limitations ?? []),
    native.firefox.reason,
  ])];
  const selected = PHASE7B_RESPONSIVE_SELECTION.map(({ destination, viewport }) => {
    const candidate = chromium.responsive.cases.find((entry) => entry.viewport.width === viewport[0] && entry.viewport.height === viewport[1]);
    invariant(candidate, `selected responsive evidence is missing at ${viewport.join("x")}`);
    return relativeScreenshotSummary(candidate, destination);
  });
  const accessibilityCases = results.flatMap((result) => result.accessibility.cases.map((entry) => ({ engine: result.identity.engine === "webkit" ? "webkit-proxy" : result.identity.engine, ...entry })));
  invariant(accessibilityCases.every((entry) => ["PASS", "LIMITATION"].includes(entry.status) && entry.result.violations.length === 0 && entry.result.incomplete.every(({ id }) => id === "color-contrast")), "accessibility report contains violations or a non-contrast incomplete");
  invariant(manualContrast?.status === "PASS" && manualContrast.measurements.filter(({ essentialText }) => essentialText).every(({ status }) => status === "PASS"), "manual contrast authority is missing or failed");
  const phase7aPass = results.every((result) => result.regression.status === "PASS");
  invariant(phase7aPass, "accepted Phase 7A regression authority differs");
  const builtFiles = deployment.dist.files ?? [];
  const currentBuiltJavaScriptBytes = builtFiles.filter(({ relativePath }) => /\.m?js$/i.test(relativePath ?? "")).reduce((sum, { bytes }) => sum + bytes, 0);
  const currentBuiltCssBytes = builtFiles.filter(({ relativePath }) => /\.css$/i.test(relativePath ?? "")).reduce((sum, { bytes }) => sum + bytes, 0);
  const sourceAndBuild = { ...sourcePerformance, currentBuiltJavaScriptBytes, currentBuiltCssBytes, currentDistBytes: deployment.dist.totals?.bytes ?? "NOT OBSERVED" };
  return {
    browserMatrix: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.browser-matrix`,
      status: "PASS",
      revision: repository.head,
      engines: PACKAGE_ENGINES,
      scenarios: PHASE7B_RECORDING_SCENARIOS,
      results: results.map(publicResult),
      limitations,
    },
    webkit: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.webkit-proxy`,
      status: webkit.status,
      classification: "WEBKIT PROXY — NOT PHYSICAL SAFARI",
      physicalSafari: false,
      identity: webkit.identity,
      checks: webkit.checks,
      limitations: webkit.limitations ?? [],
    },
    responsive: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.responsive-matrix`,
      status: "PASS",
      viewports: PHASE7B_CORE_VIEWPORTS,
      engineResults: results.map((result) => ({ engine: result.identity.engine === "webkit" ? "webkit-proxy" : result.identity.engine, status: reportStatus(result.responsive), cases: result.responsive.cases.map((entry) => ({ viewport: [entry.viewport.width, entry.viewport.height], status: entry.status, horizontalOverflow: entry.snapshot.horizontalOverflow, targets: entry.targetSize.status })) })),
      selectedPackageScreenshots: selected,
    },
    fallback: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.fallback`,
      status: "PASS",
      engines: results.map((result) => ({ engine: result.identity.engine === "webkit" ? "webkit-proxy" : result.identity.engine, status: reportStatus(result.fallback), cases: result.fallback.cases.map(({ id, status, state, targets, limitations: caseLimitations = [] }) => ({ id, status, state, targets: targets.status, limitations: caseLimitations })) })),
    },
    accessibility: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.accessibility`,
      status: "PASS",
      zeroViolations: true,
      zeroNonContrastIncomplete: true,
      axeColorContrastIncompleteCount: accessibilityCases.reduce((sum, entry) => sum + entry.result.incomplete.filter(({ id }) => id === "color-contrast").length, 0),
      manualWorstCaseContrast: manualContrast,
      cases: accessibilityCases,
      nativeChrome200FieldMap: native.report.fieldMap,
    },
    performance: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.performance`,
      status: "PASS",
      budget: PHASE7B_PERFORMANCE_BUDGET,
      sourceAndBuild,
      engines: results.map((result) => ({
        engine: result.identity.engine === "webkit" ? "webkit-proxy" : result.identity.engine,
        projectionStatus: reportStatus(result.projection),
        lifecycleSourceStatus: result.lifecycle.status,
        chapterDomNodes: result.responsive.cases.map(({ viewport, snapshot }) => ({ viewport: [viewport.width, viewport.height], domNodes: snapshot.domNodes, svgElements: snapshot.svgElements })),
        projectionChecks: result.projection.checks,
        projectionRestMetrics: result.projection.metrics,
        lifecycleBeforeMetrics: result.lifecycle.before.metrics,
        lifecycleAfterMetrics: result.lifecycle.after.metrics,
        cls: result.lifecycle.after.metrics.cls,
        lifecycleLongTasks: result.lifecycle.after.metrics.longtasks,
        scrollWindowLongTasks: result.projection.metrics?.longtasks ?? "NOT OBSERVED",
        limitations: result.lifecycle.limitations ?? [],
      })),
    },
    lifecycle: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.lifecycle`,
      status: "PASS",
      requiredCycles: PHASE7B_CYCLE_COUNT,
      engines: results.map((result) => ({
        engine: result.identity.engine === "webkit" ? "webkit-proxy" : result.identity.engine,
        sourceStatus: result.lifecycle.status,
        cycleCount: result.lifecycle.cycles.length,
        cycles: result.lifecycle.cycles,
        before: result.lifecycle.before,
        after: result.lifecycle.after,
        duplicateListenerInvariant: result.lifecycle.checks.listenerInvariant,
        routeDeparture: { departed: result.lifecycle.departed, restored: result.lifecycle.restored },
        pagehide: result.lifecycle.explicitDepartureCleanup,
        visibilityChange: "NOT OBSERVED",
        bfcacheObserved: result.lifecycle.bfcacheObserved,
        checks: result.lifecycle.checks,
        limitations: result.lifecycle.limitations ?? [],
      })),
    },
    network: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.network`,
      status: "PASS",
      browser: results.map((result) => ({ engine: result.identity.engine === "webkit" ? "webkit-proxy" : result.identity.engine, status: reportStatus(result.network), checks: result.network.checks, normal: result.network.normal, adversity: result.network.adversity })),
      deploymentRuntimeRequests: deployment.runtimeRequests.data,
      immutableOrigin: deployment.origins.immutable.data.origin,
      branchOrigin: deployment.origins.branch.data.origin,
    },
    publication: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.publication`,
      status: "PASS",
      exactHtmlAuthority: deployment.dist.exactHtmlAuthority,
      exactPublicRouteAuthority: deployment.dist.exactPublicRouteAuthority,
      immutableRoutes: deployment.origins.immutable.data.exactPublicRoutes,
      branchRoutes: deployment.origins.branch.data.exactPublicRoutes,
      real404: { immutable: deployment.origins.immutable.data.real404, branch: deployment.origins.branch.data.real404 },
      productionIsolation: deployment.productionIsolation.data,
    },
    phase7a: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.phase7a-regression`,
      status: "PASS",
      baseline: PHASE7B_PARENT,
      visualRegression: "PASS",
      method: "Accepted Phase 7A same-session exact-pixel authority plus paired final-HEAD browser comparisons and frozen source-path identity.",
      acceptedBaselineAuthority: acceptedPhase7A,
      frozenSourcePathIdentity: { status: "PASS", baseline: PHASE7B_PARENT, changedSourcePaths: repository.changedSourcePaths, authorizedPhase7BSourcePaths: PHASE7B_PRODUCTION_PATHS, allOtherSourcePathsUnchanged: true },
      engines: results.map((result) => ({
        engine: result.identity.engine === "webkit" ? "webkit-proxy" : result.identity.engine,
        retainedInvariantStatus: result.regression.status,
        retainedInvariantChecks: result.regression.checks,
        pairedVisualStatus: result.visualRegression.status,
        baselineAuthority: result.visualRegression.baselineAuthority,
        currentAuthority: result.visualRegression.currentAuthority,
        cases: result.visualRegression.cases.map(({ id, baseline, current, comparisonRegion, metrics, classification, explanation, checks, status }) => ({ id, baseline, current, comparisonRegion, metrics, classification, explanation, checks, status })),
      })),
    },
    deployment: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.deployment`,
      status: "PASS",
      head: repository.head,
      deployedSha: deployment.deployedSha,
      deploymentId: deployment.deploymentId,
      immutablePreview: deployment.immutableUrl,
      branchPreview: deployment.branchUrl,
      localDistParity: "PASS",
      project: deployment.projectName,
      environment: deployment.environment,
      checks: deployment.checks,
    },
    limitations: {
      schema: `${PHASE7B_ASSEMBLER_SCHEMA}.environmental-limitations`,
      status: "DECLARED",
      limitations,
      webkitAuthority: "Playwright WebKit proxy only; not physical Safari.",
      nativeZoomAuthority: "One separately bound, visible installed-Google-Chrome browser-native 200% recording and screenshot.",
      firefoxNativeZoom: native.firefox,
    },
    phase4,
  };
}

function jsonEntry(relativePath, value) {
  return { relativePath, data: Buffer.from(stableJson(value), "utf8") };
}

function byteEntry(relativePath, data) {
  return { relativePath, data: Buffer.from(data) };
}

function taskAndStageEntries(repository) {
  return [
    byteEntry("00-authority/task-brief.md", Buffer.from(normalizedTaskBrief(), "utf8")),
    jsonEntry("00-authority/human-gates.json", { schema: PHASE7B_GATES_SCHEMA, status: "PENDING HUMAN REVIEW", gates: PHASE7B_GATE_RECORDS }),
    jsonEntry("01-provenance/git-provenance.json", { schema: PHASE7B_PROVENANCE_SCHEMA, status: "PASS", ...repository }),
    jsonEntry("01-provenance/commits.json", { schema: PHASE7B_COMMITS_SCHEMA, status: "PASS", head: repository.head, commits: repository.commits }),
    jsonEntry("02-design/stage-state-specification.json", {
      schema: PHASE7B_STAGE_SPEC_SCHEMA,
      status: "PASS",
      persistentWorkpiece: true,
      historyRetained: true,
      macroStates: PHASE7B_MACRO_STATES,
      methodStages: PHASE7B_METHOD_STAGES,
      ranges: PHASE7B_STAGE_RANGES,
      scrollOwnership: "native document scroll",
      noJavaScript: "resolved normal-flow semantic stages",
      reducedMotion: "resolved normal-flow semantic stages",
    }),
  ];
}

function prepackageAudit(entries) {
  const paths = new Set();
  let images = 0;
  let recordings = 0;
  const payloads = [];
  for (const entry of entries) {
    assertAllowedPhase7BEvidencePath(entry.relativePath);
    invariant(!paths.has(entry.relativePath), `prepackage audit found duplicate path: ${entry.relativePath}`);
    paths.add(entry.relativePath);
    assertNoPrivateOrSecretPhase7BPayload(entry.data, entry.relativePath);
    if (entry.relativePath.endsWith(".png")) { inspectPhase7BPng(entry.data, entry.relativePath); images += 1; }
    if (entry.relativePath.endsWith(".mp4")) { validateIsoBmffRecording(entry.data, entry.relativePath); recordings += 1; }
    payloads.push({ path: entry.relativePath, bytes: entry.data.length, sha256: sha256(entry.data) });
  }
  invariant(entries.length === REQUIRED_PHASE7B_EVIDENCE.length - 1 && images === 7 && recordings === 19, "prepackage audited payload/media count differs");
  return {
    schema: PHASE7B_PREPACKAGE_AUDIT_SCHEMA,
    status: "PASS",
    auditedPayloadCount: entries.length,
    finalPayloadCount: REQUIRED_PHASE7B_EVIDENCE.length,
    mediaDecode: { images: { status: "PASS", count: images }, recordings: { status: "PASS", count: recordings } },
    duplicatePaths: false,
    traversalPaths: false,
    privacyAndSecrets: "PASS",
    sourceArchives: false,
    nestedArchives: false,
    rawPhase4Media: false,
    payloads,
  };
}

export async function createPhase7BEvidenceEntries({ repository, productionDiff, phase4, acceptedPhase7A, manualContrast, sourcePerformance, browser, native, deployment, architecture, references }) {
  const reports = deriveReports({ repository, browser, native, deployment, phase4, acceptedPhase7A, manualContrast, sourcePerformance });
  const entries = [
    ...taskAndStageEntries(repository),
    byteEntry("01-provenance/production.diff", productionDiff),
    byteEntry("02-design/phase-7b-operating-field-architecture.md", architecture),
    byteEntry("02-design/phase-7b-reference-study.md", references),
    jsonEntry("03-browser/browser-matrix.json", reports.browserMatrix),
    jsonEntry("03-browser/webkit-proxy.json", reports.webkit),
  ];

  for (const destination of PHASE7B_RECORDING_EVIDENCE_PATHS) {
    const match = /^03-recordings\/(chromium|firefox)-(.+)\.mp4$/.exec(destination);
    invariant(match, `package recording destination differs: ${destination}`);
    entries.push(byteEntry(destination, browser.files.get(`recordings/${match[1]}/${match[2]}.mp4`)));
  }
  entries.push(jsonEntry("04-responsive/responsive-matrix.json", reports.responsive));
  for (const selection of PHASE7B_RESPONSIVE_SELECTION) entries.push(byteEntry(selection.destination, browser.files.get(selection.source)));
  entries.push(
    jsonEntry("05-fallback/fallback-report.json", reports.fallback),
    jsonEntry("06-assurance/accessibility.json", reports.accessibility),
    jsonEntry("06-assurance/performance.json", reports.performance),
    jsonEntry("06-assurance/lifecycle.json", reports.lifecycle),
    jsonEntry("06-assurance/network.json", reports.network),
    jsonEntry("06-assurance/publication.json", reports.publication),
    jsonEntry("06-assurance/phase4-hashes.json", reports.phase4),
    jsonEntry("06-assurance/phase7a-regression.json", reports.phase7a),
    jsonEntry("07-deployment/deployment.json", reports.deployment),
    jsonEntry("08-governance/environmental-limitations.json", reports.limitations),
    byteEntry(PHASE7B_INSTALLED_CHROME_RECORDING_PATH, native.files.get(path.posix.basename(PHASE7B_INSTALLED_CHROME_RECORDING_PATH))),
    byteEntry(PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH, native.files.get(path.posix.basename(PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH))),
    byteEntry(PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH, native.files.get(path.posix.basename(PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH))),
    byteEntry(PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH, native.files.get(path.posix.basename(PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH))),
  );
  entries.push(jsonEntry("09-audit/prepackage-audit.json", prepackageAudit(entries)));
  return normalizePhase7BEvidenceEntries(entries);
}

export function assertExternalAssemblyPath(candidate, label, { repositoryRoot = ROOT, temporaryRoot = os.tmpdir() } = {}) {
  invariant(typeof candidate === "string" && candidate.length > 0, `${label} is required`);
  const absolute = path.resolve(candidate);
  invariant(absolute !== path.parse(absolute).root && !isWithin(repositoryRoot, absolute) && !isWithin(temporaryRoot, absolute), `${label} must remain in durable external storage`);
  return absolute;
}

async function ensureRealSource(candidate, type, label, boundaryOptions) {
  const absolute = assertExternalAssemblyPath(candidate, label, boundaryOptions);
  const info = await lstat(absolute);
  invariant(!info.isSymbolicLink() && (type === "directory" ? info.isDirectory() : info.isFile()) && path.resolve(await realpath(absolute)) === absolute, `${label} must be a real ${type}`);
  return absolute;
}

async function exclusiveWrite(filename, bytes) {
  await mkdir(path.dirname(filename), { recursive: true });
  const handle = await open(filename, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

async function publishEvidence(entries, outputDir, boundaryOptions) {
  const output = assertExternalAssemblyPath(outputDir, "--output-dir", boundaryOptions);
  const parent = path.dirname(output);
  const parentInfo = await lstat(parent);
  invariant(parentInfo.isDirectory() && !parentInfo.isSymbolicLink() && path.resolve(await realpath(parent)) === parent, "assembly output parent must be an existing real directory");
  invariant(!await stat(output).then(() => true).catch(() => false), "refusing to overwrite an existing evidence destination");
  const staging = `${output}.staging-${randomUUID()}`;
  invariant(!await stat(staging).then(() => true).catch(() => false), "assembly staging destination already exists");
  await mkdir(staging, { recursive: false });
  let published = false;
  try {
    for (const entry of entries) await exclusiveWrite(path.join(staging, ...entry.relativePath.split("/")), entry.data);
    await readPhase7BEvidenceDirectory(staging);
    await rename(staging, output);
    published = true;
  } finally {
    if (!published) await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
  return output;
}

export async function assemblePhase7BReviewEvidence(options, dependencies = {}) {
  const boundaryOptions = dependencies.boundaryOptions ?? {};
  const repositoryRoot = dependencies.repositoryRoot ?? ROOT;
  const browserQaDir = await ensureRealSource(options.browserQaDir, "directory", "--browser-qa-dir", boundaryOptions);
  const nativeChromeDir = await ensureRealSource(options.nativeChromeDir, "directory", "--native-chrome-dir", boundaryOptions);
  const deploymentReportPath = await ensureRealSource(options.deploymentReport, "file", "--deployment-report", boundaryOptions);
  const phase7aRegressionPath = await ensureRealSource(options.phase7aRegression, "file", "--phase7a-regression", boundaryOptions);
  const repository = await (dependencies.readRepositoryAuthority ?? readRepositoryAuthority)(options.revision, repositoryRoot);
  const [browser, native, deploymentBytes, phase7aRegressionBytes, productionDiff, phase4, manualContrast, sourcePerformance, architecture, references] = await Promise.all([
    validateBrowserQaInput(browserQaDir, repository),
    validateNativeChromeInput(nativeChromeDir, repository),
    readFile(deploymentReportPath),
    readFile(phase7aRegressionPath),
    (dependencies.readProductionDiff ?? readProductionDiff)(options.revision, repositoryRoot),
    (dependencies.readPhase4Authority ?? readPhase4Authority)(repositoryRoot),
    (dependencies.readManualContrastAuthority ?? readManualContrastAuthority)(repositoryRoot),
    (dependencies.readSourcePerformanceAuthority ?? readSourcePerformanceAuthority)(repositoryRoot),
    readFile(path.join(repositoryRoot, "docs", "phase-7b-operating-field-architecture.md")),
    readFile(path.join(repositoryRoot, "docs", "phase-7b-reference-study.md")),
  ]);
  assertNoPrivateOrSecretPhase7BPayload(deploymentBytes, "deployment-verifier.json");
  assertNoPrivateOrSecretPhase7BPayload(phase7aRegressionBytes, "accepted-phase7a-visual-regression.json");
  const deployment = validateDeploymentInput(parseJson(deploymentBytes, "deployment verifier report"), repository);
  const acceptedPhase7A = (dependencies.validateAcceptedPhase7ARegression ?? validateAcceptedPhase7ARegression)(parseJson(phase7aRegressionBytes, "accepted Phase 7A visual regression"), phase7aRegressionBytes);
  const entries = await createPhase7BEvidenceEntries({ repository, productionDiff, phase4, acceptedPhase7A, manualContrast, sourcePerformance, browser, native, deployment, architecture, references });
  const output = await publishEvidence(entries, options.outputDir, boundaryOptions);
  return Object.freeze({
    schema: PHASE7B_ASSEMBLER_SCHEMA,
    status: "PASS",
    output,
    revision: repository.head,
    payloadCount: entries.length,
    recordings: entries.filter(({ relativePath }) => relativePath.endsWith(".mp4")).length,
    images: entries.filter(({ relativePath }) => relativePath.endsWith(".png")).length,
    packageCreated: false,
  });
}

function nextArgument(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = { revision: "", browserQaDir: "", nativeChromeDir: "", deploymentReport: "", phase7aRegression: "", outputDir: "", help: false, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => { const value = nextArgument(argv, index, flag); index += 1; return value; };
    if (flag === "--revision") options.revision = next();
    else if (flag === "--browser-qa-dir") options.browserQaDir = next();
    else if (flag === "--native-chrome-dir") options.nativeChromeDir = next();
    else if (flag === "--deployment-report") options.deploymentReport = next();
    else if (flag === "--phase7a-regression") options.phase7aRegression = next();
    else if (flag === "--output-dir") options.outputDir = next();
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.help && !options.selfTest) {
    invariant(HASH_40.test(options.revision) && options.revision !== PHASE7B_PARENT, "--revision must be the exact final Phase 7B HEAD");
    for (const [name, value] of [["--browser-qa-dir", options.browserQaDir], ["--native-chrome-dir", options.nativeChromeDir], ["--deployment-report", options.deploymentReport], ["--phase7a-regression", options.phase7aRegression], ["--output-dir", options.outputDir]]) invariant(value, `${name} is required`);
  }
  return options;
}

export function selfTest() {
  invariant(PHASE7B_RECORDING_SCENARIOS.length === 10 && PHASE7B_STANDARD_RECORDING_SCENARIOS.length === 9, "Phase 7B recording scenario topology differs");
  invariant(EXPECTED_BROWSER_SOURCE_PATHS.length === 67 && PHASE7B_RECORDING_EVIDENCE_PATHS.length === 18, "browser source topology differs");
  invariant(PHASE7B_RESPONSIVE_SELECTION.length === 6 && REQUIRED_PHASE7B_EVIDENCE.length === ASSEMBLED_PAYLOAD_COUNT, "assembled evidence topology differs");
  return Object.freeze({ schema: PHASE7B_ASSEMBLER_SCHEMA, status: "PASS", browserSourcePayloads: 67, assembledPayloads: 50, ordinaryRecordings: 18, nativeRecordings: 1, selectedResponsiveImages: 6, packageCreated: false });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/assemble-phase7b-review-evidence.mjs --revision <final-head> --browser-qa-dir <external-dir> --native-chrome-dir <external-dir> --deployment-report <external-json> --phase7a-regression <accepted-r2-visual-stability.json> --output-dir <fresh-external-dir>\nThis command assembles 50 package-ready payloads; it does not create a ZIP.\n");
    return;
  }
  if (options.selfTest) { process.stdout.write(stableJson(selfTest())); return; }
  process.stdout.write(stableJson(await assemblePhase7BReviewEvidence(options)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`Phase 7B evidence assembly FAIL: ${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
