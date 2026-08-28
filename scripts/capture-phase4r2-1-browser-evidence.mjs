#!/usr/bin/env node

/**
 * Phase 4-R2.1 local/deployed browser QA and evidence capture.
 *
 * Final hashes and URLs are command inputs, never baked into this harness. A
 * deployed run is accepted only when repository, production manifest,
 * deployment report, public manifest, and public payload bytes all agree.
 * Browser recordings are real Playwright screen recordings normalized to
 * silent H.264 MP4. Evidence telemetry is a labelled capture overlay; it does
 * not alter the production controller, scroll position, or CSS authority.
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import axeCore from "axe-core";
import { chromium } from "playwright-core";
import sharp from "sharp";

import {
  ARRIVAL_FRAME,
  BLACK_BEAT_FRAME_COUNT,
  BLACK_START_FRAME,
  CURRENT_PROGRESS_SAMPLES,
  ENTRY_START_FRAME,
  FIRST_CHANGED_FRAME,
  FIRST_INPUT_PROBES,
  FPS,
  FRAME_COUNT,
  HUMAN_GATES,
  MAIN_SHA,
  MINIMUM_RECORDING_SECONDS,
  PHYSICAL_FRAME_COUNT,
  RECORDINGS,
  REQUIRED_BRANCH,
  SCHEMA,
  SHEETS,
  SHORT_LANDSCAPE_IDS,
  STABLE_Q_FRAME,
  SUPPORTING_ROUTES,
  TIMEOUT_POSITIONS,
  VIEWPOINTS,
  WAKE_DURATION_SECONDS,
  assertInventoryContract,
  isWithin,
  mediaUrlPath,
  normalizeTargetUrl,
  sha256,
  stableJson,
  validateActiveManifest,
} from "./phase4r2-1-evidence-contract.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_RELATIVE = "scripts/capture-phase4r2-1-browser-evidence.mjs";
const CONTRACT_RELATIVE = "scripts/phase4r2-1-evidence-contract.mjs";
const BASE_SHA = "af0b196e2b1e81925c6cefdc477df6fcb94b4a41";
const ORIGINAL_SOURCE_SHA256 = "b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0";
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,})/i;
const DEFAULT_REPORTS = Object.freeze({
  rootCause: "artifacts/reports/phase-4r2-1/phase-4r2-1-signal-root-cause-matrix.json",
  current: "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/review/diagnostics/iteration-02-report.json",
  sourceAudit: "artifacts/reports/phase-4r2-1/phase-4r2-1-source-signal-audit.json",
  mapping: "artifacts/reports/phase-4r2-1/phase-4r2-1-current-mapping-report.json",
  reaction: "artifacts/reports/phase-4r2-1-cinematic-reaction-state-machine.md",
});
export const REPORT_SCHEMAS = Object.freeze({
  "reports/first-input.json": "quantum-hub.phase-4-r2-1.first-input-evidence.v1",
  "reports/current-order.json": "quantum-hub.phase-4-r2-1.current-order-evidence.v1",
  "reports/automatic-wake.json": "quantum-hub.phase-4-r2-1.automatic-wake-evidence.v1",
  "reports/timeout-geometry.json": "quantum-hub.phase-4-r2-1.timeout-geometry-evidence.v1",
  "reports/responsive.json": "quantum-hub.phase-4-r2-1.responsive-evidence.v1",
  "reports/codec-network-performance.json": "quantum-hub.phase-4-r2-1.codec-network-performance-evidence.v1",
  "reports/accessibility-fallback.json": "quantum-hub.phase-4-r2-1.accessibility-fallback-evidence.v1",
  "reports/operating-field-regression.json": "quantum-hub.phase-4-r2-1.operating-field-regression-evidence.v1",
  "reports/git-deployment-provenance.json": "quantum-hub.phase-4-r2-1.git-deployment-provenance-evidence.v1",
});

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    mode: null,
    url: null,
    branchUrl: null,
    expectedHead: null,
    expectedBranch: REQUIRED_BRANCH,
    expectedSourceSha256: null,
    expectedManifestSha256: null,
    manifest: null,
    manifestUrlPath: null,
    deploymentReport: null,
    output: null,
    chromium: process.env.CHROME_PATH ?? null,
    ffmpeg: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobe: process.env.FFPROBE_PATH ?? "ffprobe",
    timeoutMs: 30_000,
    reports: { ...DEFAULT_REPORTS },
    selfTest: false,
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--mode") options.mode = next();
    else if (argument === "--url" || argument === "--immutable-url") options.url = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-branch") options.expectedBranch = next();
    else if (argument === "--expected-source-sha256") options.expectedSourceSha256 = next().toLowerCase();
    else if (argument === "--expected-manifest-sha256") options.expectedManifestSha256 = next().toLowerCase();
    else if (argument === "--manifest") options.manifest = path.resolve(next());
    else if (argument === "--manifest-url-path") options.manifestUrlPath = next();
    else if (argument === "--deployment-report") options.deploymentReport = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--chromium" || argument === "--browser") options.chromium = path.resolve(next());
    else if (argument === "--ffmpeg") options.ffmpeg = next();
    else if (argument === "--ffprobe") options.ffprobe = next();
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--root-cause-report") options.reports.rootCause = next();
    else if (argument === "--current-report") options.reports.current = next();
    else if (argument === "--source-audit-report") options.reports.sourceAudit = next();
    else if (argument === "--mapping-report") options.reports.mapping = next();
    else if (argument === "--reaction-report") options.reports.reaction = next();
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 4-R2.1 causal-signal browser QA/evidence\n\nUsage:\n  node ${SCRIPT_RELATIVE} --mode <local|deployed> --url <origin-root> \\\n    --expected-head <40-hex> --expected-source-sha256 <64-hex> \\\n    --expected-manifest-sha256 <64-hex> --manifest <active-manifest.json> \\\n    --manifest-url-path </public/manifest.json> --output <fresh-durable-external-dir> \\\n    [--branch-url <https-root> --deployment-report <PASS-report.json>] \\\n    [--chromium <file>] [--ffmpeg <file-or-command>] [--ffprobe <file-or-command>]\n\nDeployed mode requires the branch URL and deployment report. Local mode requires\na loopback origin. --dry-run checks the command/authority contract without a\nbrowser or writes. --self-test runs pure negative/positive contract tests.\n`);
}

export function validateOptions(options) {
  if (!["local", "deployed"].includes(options.mode)) throw new Error("--mode must be local or deployed");
  options.url = normalizeTargetUrl(options.url, options.mode);
  if (options.mode === "deployed") {
    options.branchUrl = normalizeTargetUrl(options.branchUrl, "deployed");
    if (!options.deploymentReport) throw new Error("deployed capture requires --deployment-report");
  }
  if (!/^[0-9a-f]{40}$/.test(options.expectedHead ?? "")) throw new Error("--expected-head must be 40 lowercase hexadecimal characters");
  if (options.expectedBranch !== REQUIRED_BRANCH) throw new Error(`capture branch must be ${REQUIRED_BRANCH}`);
  if (!/^[0-9a-f]{64}$/.test(options.expectedSourceSha256 ?? "")) throw new Error("--expected-source-sha256 must be 64 lowercase hexadecimal characters");
  if (!/^[0-9a-f]{64}$/.test(options.expectedManifestSha256 ?? "")) throw new Error("--expected-manifest-sha256 must be 64 lowercase hexadecimal characters");
  if (!options.manifest || !options.output || !/^\/[a-z0-9._\/-]+\.json$/i.test(options.manifestUrlPath ?? "") || options.manifestUrlPath.includes("..")) throw new Error("manifest, public manifest path, and output are required");
  if (isWithin(ROOT, options.output) || isWithin(os.tmpdir(), options.output) || path.parse(options.output).root === options.output) throw new Error("--output must be a durable external non-root directory");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 15_000 || options.timeoutMs > 120_000) throw new Error("--timeout-ms must be 15000..120000");
  return options;
}

async function resolveFromExistingAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const missing = [];
  for (;;) {
    try { return path.join(await realpath(cursor), ...missing.reverse()); }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function atomicWrite(destination, bytes) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try { await rename(temporary, destination); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

async function removeOwnedRawRecordingRoot(candidate) {
  const [resolvedCandidate, resolvedTemporaryRoot] = await Promise.all([realpath(candidate), realpath(os.tmpdir())]);
  if (!isWithin(resolvedTemporaryRoot, resolvedCandidate) || !path.basename(resolvedCandidate).startsWith("phase4r2-1-browser-recordings-")) {
    throw new Error("refusing to remove an unowned raw recording root");
  }
  await rm(resolvedCandidate, { recursive: true, force: true });
}

async function writeSafeJson(destination, value) {
  const bytes = Buffer.from(stableJson(value), "utf8");
  if (PRIVATE_TEXT.test(bytes.toString("utf8"))) throw new Error(`private path/token material in ${path.basename(destination)}`);
  await atomicWrite(destination, bytes);
  return { relativePath: path.relative(path.dirname(path.dirname(destination)), destination).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes), kind: "report" };
}

async function run(command, args, label, maxBuffer = 20_000_000) {
  try { return await execFileAsync(command, args, { windowsHide: true, maxBuffer }); }
  catch (error) { throw new Error(`${label} failed: ${String(error.stderr || error.message).slice(-2000)}`); }
}

async function git(...args) { return (await run("git", args, "Git authority", 2_000_000)).stdout.trim(); }

async function repositoryAuthority(options) {
  const [head, branch, main, statusText, upstream, liveRemote, trackedScript, trackedContract, frozenDiff] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("branch", "--show-current"),
    git("rev-parse", "main"),
    git("status", "--short"),
    git("rev-parse", "@{upstream}"),
    git("ls-remote", "--heads", "origin", options.expectedBranch),
    git("ls-files", "--error-unmatch", "--", SCRIPT_RELATIVE),
    git("ls-files", "--error-unmatch", "--", CONTRACT_RELATIVE),
    git("diff", "--name-only", BASE_SHA, "HEAD", "--", "src/components/home", "src/styles/routes/home.css"),
  ]);
  const liveHead = liveRemote.split(/\s+/)[0] ?? "";
  if (head !== options.expectedHead || branch !== options.expectedBranch || main !== MAIN_SHA || statusText || upstream !== head || liveHead !== head) throw new Error("repository/remote authority differs from exact clean expected HEAD");
  if (trackedScript.replaceAll("\\", "/") !== SCRIPT_RELATIVE || trackedContract.replaceAll("\\", "/") !== CONTRACT_RELATIVE) throw new Error("evidence tooling must be tracked by the captured HEAD");
  if (frozenDiff) throw new Error(`Operating Field source freeze violated: ${frozenDiff}`);
  return { head, branch, clean: true, upstreamHead: upstream, liveRemoteHead: liveHead, main: { head: main, requiredHead: MAIN_SHA }, base: BASE_SHA, operatingFieldSourceFreeze: true };
}

async function readJson(file, label) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { throw new Error(`${label} is missing or invalid JSON`, { cause: error }); }
}

async function loadAuthorities(options) {
  const manifestBytes = await readFile(options.manifest);
  if (sha256(manifestBytes) !== options.expectedManifestSha256) throw new Error("local active manifest hash differs from --expected-manifest-sha256");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  validateActiveManifest(manifest, options.expectedSourceSha256);
  const publicRoot = `/${String(manifest.runtimeStaging?.publicRoot ?? "").replaceAll("\\", "/").replace(/^public\//, "").replace(/^\/+|\/+$/g, "")}`;
  const stagedManifestPath = String(manifest.runtimeStaging?.manifestPath ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
  const expectedPublicManifestPath = `${publicRoot}/${stagedManifestPath}`;
  const expectedRuntimeFiles = [stagedManifestPath, ...manifest.assets.map((asset) => asset.file)].sort();
  if (publicRoot === "/" || expectedPublicManifestPath !== options.manifestUrlPath || manifest.runtimeStaging?.removeUnlistedFiles !== true || JSON.stringify([...(manifest.runtimeStaging?.exactFiles ?? [])].sort()) !== JSON.stringify(expectedRuntimeFiles)) throw new Error("active runtime staging/public manifest authority mismatch");
  const reports = {};
  for (const [id, candidate] of Object.entries(options.reports)) {
    const absolute = path.resolve(ROOT, candidate);
    if (!isWithin(ROOT, absolute)) throw new Error(`${id} report escapes repository`);
    const bytes = await readFile(absolute);
    reports[id] = { basename: path.basename(absolute), bytes: bytes.length, sha256: sha256(bytes), content: id === "reaction" ? bytes.toString("utf8") : JSON.parse(bytes.toString("utf8")) };
  }
  if (reports.rootCause.content?.schema !== "quantum-hub.phase-4-r2-1.signal-root-cause-matrix.v1"
    || reports.rootCause.content?.status !== "PASS"
    || reports.rootCause.content?.baseline?.head !== BASE_SHA
    || !Array.isArray(reports.rootCause.content?.matrix)
    || reports.rootCause.content.matrix.length !== 4
    || reports.rootCause.content.matrix.map((item) => item.defect).join("|") !== ["outer/inner loop appear to activate together", "dark signal sections at arrival", "CRT needs more scroll after arrival", "first-scroll dead zone"].join("|")) throw new Error("root-cause matrix authority mismatch");
  if (reports.current.content?.schema !== "quantum-hub.phase-4-r2-1.current-diagnostic.v1"
    || reports.current.content?.status !== "PASS"
    || reports.current.content?.source?.sha256 !== options.expectedSourceSha256
    || !Array.isArray(reports.current.content?.coverage)
    || reports.current.content.coverage.length !== 3
    || reports.current.content.coverage.map((item) => item.family).join(",") !== "desktop,portrait,landscape"
    || reports.current.content.coverage.some((item) => item.frame !== ARRIVAL_FRAME
      || item.darkCount !== 0
      || item.allSegmentsEnergized !== true
      || item.allSegmentsTrailOrBrighter !== true
      || item.routeOrderContiguous !== true
      || item.energizedCount !== item.segmentCount
      || !Array.isArray(item.alphas)
      || item.alphas.length !== item.segmentCount
      || item.alphas.some((alpha) => !(alpha > 0)))) throw new Error("current continuity authority mismatch");
  const sourceFamilies = reports.sourceAudit.content?.families;
  if (reports.sourceAudit.content?.schema !== "quantum-hub.phase-4-r2-1.source-signal-audit.v1"
    || reports.sourceAudit.content?.status !== "PASS"
    || reports.sourceAudit.content?.source?.sha256 !== ORIGINAL_SOURCE_SHA256
    || !sourceFamilies
    || ["desktop", "portrait", "landscape"].some((family) => !Array.isArray(sourceFamilies[family]?.physicalRanges)
      || !Array.isArray(sourceFamilies[family]?.frameStates)
      || sourceFamilies[family].frameStates.some((state) => state.frame >= FIRST_CHANGED_FRAME && state.frame <= ARRIVAL_FRAME
        && (state.energizedIntervals?.length !== 1 || state.brightFrontIntervals?.length !== 1)))) throw new Error("source signal/loop authority mismatch");
  if (reports.mapping.content?.schema !== "quantum-hub.phase-4-r2-1.current-mapping-diagnosis.v1"
    || reports.mapping.content?.status !== "PASS"
    || reports.mapping.content?.baselineHead !== BASE_SHA
    || reports.mapping.content?.conceptualTimeline?.frames !== FRAME_COUNT
    || reports.mapping.content?.conceptualTimeline?.physicalFrames !== PHYSICAL_FRAME_COUNT
    || reports.mapping.content?.conceptualTimeline?.fps !== FPS) throw new Error("mapping report authority mismatch");
  if (!reports.reaction.content.includes("wake-forward") || !reports.reaction.content.includes("wake-reverse")) throw new Error("reaction state-machine report authority mismatch");
  return { manifest, manifestBytes, reports };
}

function firstDefined(object, paths) {
  for (const segments of paths) {
    let value = object;
    for (const segment of segments) value = value?.[segment];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

async function validateDeploymentReport(options, manifestBytes) {
  if (options.mode !== "deployed") return { mode: "local", status: "NOT_APPLICABLE" };
  const bytes = await readFile(options.deploymentReport);
  const report = JSON.parse(bytes.toString("utf8"));
  if (report.status !== "PASS" || !String(report.schema ?? "").includes("phase-4-r2-1")) throw new Error("deployment report is not R2.1 PASS authority");
  const heads = [
    firstDefined(report, [["repository", "head"]]),
    firstDefined(report, [["deployment", "expectedHead"]]),
    firstDefined(report, [["cloudflare", "commitHash"]]),
  ].filter(Boolean);
  if (heads.length < 2 || heads.some((head) => head !== options.expectedHead)) throw new Error("deployment report exact HEAD binding differs");
  const branch = firstDefined(report, [["repository", "branch"], ["cloudflare", "branch"]]);
  const immutableUrl = firstDefined(report, [["deployment", "immutableUrl"], ["cloudflare", "deploymentUrl"]]);
  const branchUrl = firstDefined(report, [["deployment", "branchUrl"]]);
  const sourceHash = firstDefined(report, [["productionManifest", "sourceBlendSha256"], ["productionManifest", "sourceSha256"]]);
  const manifestHash = firstDefined(report, [["productionManifest", "sha256"], ["deployment", "immutable", "manifest", "sha256"]]);
  if (branch !== options.expectedBranch || immutableUrl !== options.url || branchUrl !== options.branchUrl) throw new Error("deployment report branch/URL binding differs");
  if (sourceHash !== options.expectedSourceSha256
    || report.cloudflare?.commitHash !== options.expectedHead
    || report.cloudflare?.branch !== options.expectedBranch
    || report.cloudflare?.deploymentUrl !== options.url
    || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(report.cloudflare?.deploymentId ?? "")) throw new Error("deployment report exact Cloudflare/source authority differs");
  if (manifestHash !== options.expectedManifestSha256 || manifestBytes.length !== firstDefined(report, [["productionManifest", "bytes"], ["deployment", "immutable", "manifest", "bytes"]])) throw new Error("deployment report manifest authority differs");
  const mainHead = firstDefined(report, [["repository", "main", "headSha"], ["github", "main", "headSha"], ["repository", "main", "head"]]);
  if (mainHead !== MAIN_SHA || report.authorization?.phase5Authorized !== false || report.authorization?.mainMerged !== false) throw new Error("deployment report main/authorization denial differs");
  return { schema: report.schema, status: "PASS", bytes: bytes.length, sha256: sha256(bytes), deploymentId: report.cloudflare?.deploymentId ?? null, immutableUrl: options.url, branchUrl: options.branchUrl, exactHead: options.expectedHead };
}

async function fetchBytes(url, timeoutMs) {
  const response = await fetch(url, { headers: { Accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs) });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, bytes, contentType: response.headers.get("content-type"), cacheControl: response.headers.get("cache-control") };
}

async function verifyPublicAuthority(options, manifest, manifestBytes) {
  const manifestResponse = await fetchBytes(new URL(options.manifestUrlPath, options.url), options.timeoutMs);
  if (manifestResponse.status !== 200 || !manifestResponse.bytes.equals(manifestBytes)) throw new Error("served active manifest differs byte-for-byte");
  const assets = [];
  for (const asset of manifest.assets) {
    const publicPath = mediaUrlPath(options.manifestUrlPath, asset.file);
    const response = await fetchBytes(new URL(publicPath, options.url), options.timeoutMs);
    if (response.status !== 200 || response.bytes.length !== asset.bytes || sha256(response.bytes) !== asset.sha256) throw new Error(`served payload differs: ${asset.file}`);
    assets.push({ family: asset.family, kind: asset.kind, codec: asset.codec ?? null, publicPath, bytes: response.bytes.length, sha256: sha256(response.bytes), contentType: response.contentType, status: "PASS" });
  }
  return { manifest: { publicPath: options.manifestUrlPath, bytes: manifestBytes.length, sha256: sha256(manifestBytes) }, assets, status: "PASS" };
}

async function executable(candidate) {
  try {
    if (path.isAbsolute(candidate)) { await access(candidate, fsConstants.X_OK); return (await stat(candidate)).isFile(); }
    await execFileAsync(candidate, ["-version"], { windowsHide: true, timeout: 10_000, maxBuffer: 100_000 });
    return true;
  } catch { return false; }
}

async function resolveChromium(override) {
  const candidates = override ? [override] : [];
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    );
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) if (await executable(candidate)) return path.resolve(candidate);
  throw new Error("Chrome/Chromium not found; pass --chromium");
}

function viewpoint(id) {
  const value = VIEWPOINTS.find((item) => item.id === id);
  if (!value) throw new Error(`unknown viewpoint ${id}`);
  return value;
}

function contextOptions(view, extras = {}) {
  return {
    viewport: { width: view.width, height: view.height },
    screen: { width: view.width, height: view.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "UTC",
    serviceWorkers: "block",
    ...extras,
  };
}

async function observePage(page) {
  const state = { requests: [], blobRequests: 0, consoleErrors: [], pageErrors: [], failedRequests: [], responses: [] };
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    window.__phase4r21BlobLifecycle = { created: 0, revoked: 0, live: 0 };
    URL.createObjectURL = (value) => {
      const result = create(value);
      window.__phase4r21BlobLifecycle.created += 1;
      window.__phase4r21BlobLifecycle.live += 1;
      return result;
    };
    URL.revokeObjectURL = (value) => {
      window.__phase4r21BlobLifecycle.revoked += 1;
      window.__phase4r21BlobLifecycle.live = Math.max(0, window.__phase4r21BlobLifecycle.live - 1);
      return revoke(value);
    };
  });
  page.on("request", (request) => {
    if (request.url().startsWith("blob:")) { state.blobRequests += 1; return; }
    const url = new URL(request.url());
    state.requests.push({ path: url.pathname, origin: url.origin, resourceType: request.resourceType() });
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (/phase-4r2/i.test(url.pathname)) state.responses.push({ path: url.pathname, status: response.status(), contentType: response.headers()["content-type"] ?? null });
  });
  page.on("requestfailed", (request) => { if (!request.url().startsWith("blob:")) state.failedRequests.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText ?? null }); });
  page.on("console", (message) => { if (message.type() === "error") state.consoleErrors.push(message.text().slice(0, 300)); });
  page.on("pageerror", (error) => state.pageErrors.push(String(error.message).slice(0, 300)));
  return state;
}

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function settleEnhanced(page, timeoutMs, { resetScroll = true } = {}) {
  await page.waitForFunction(() => document.readyState === "complete", null, { timeout: timeoutMs });
  await page.evaluate(async (shouldResetScroll) => {
    if (document.fonts) await document.fonts.ready;
    if (shouldResetScroll) window.scrollTo(0, 0);
  }, resetScroll);
  await page.waitForFunction(() => {
    const root = document.documentElement;
    const shell = document.querySelector("[data-cinematic-shell]");
    return root.dataset.cinematicMode === "enhanced" && shell?.getAttribute("data-media-state") === "ready" && window.quantumPhase4?.mediaReady === true;
  }, null, { timeout: timeoutMs });
  await twoFrames(page);
}

async function runtimeState(page) {
  return page.evaluate(() => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const video = document.querySelector("[data-cinematic-media]");
    const poster = document.querySelector("[data-cinematic-poster]");
    const entry = document.querySelector("[data-home-scene='entry']");
    const h1 = entry?.querySelector("h1");
    const routes = [...(entry?.querySelectorAll(".entry-path") ?? [])];
    const header = document.querySelector(".site-header");
    const rect = (node) => {
      if (!(node instanceof Element)) return null;
      const value = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { x: value.x, y: value.y, width: value.width, height: value.height, top: value.top, right: value.right, bottom: value.bottom, left: value.left, opacity: Number(style.opacity), display: style.display, visibility: style.visibility };
    };
    const chapter = [...document.querySelectorAll("[data-home-scene]")].find((node) => { const box = node.getBoundingClientRect(); return box.top <= innerHeight * 0.5 && box.bottom >= innerHeight * 0.5; });
    const publicState = window.quantumPhase4 ?? {};
    const shellTop = shell ? shell.getBoundingClientRect().top + scrollY : 0;
    const travel = Number.parseFloat(shell?.style.getPropertyValue("--cinematic-travel-px") || "0");
    return {
      mode: document.documentElement.dataset.cinematicMode ?? null,
      fallback: document.documentElement.dataset.cinematicFallback ?? null,
      headerMode: document.documentElement.dataset.cinematicHeader ?? null,
      phase: shell?.getAttribute("data-cinematic-phase") ?? null,
      mediaState: shell?.getAttribute("data-media-state") ?? null,
      mediaFamily: publicState.mediaFamily ?? shell?.getAttribute("data-media-family") ?? null,
      codec: publicState.codec ?? shell?.getAttribute("data-media-codec") ?? null,
      delivery: publicState.delivery ?? null,
      mediaReady: publicState.mediaReady ?? false,
      conceptualFrame: publicState.conceptualFrame ?? null,
      targetFrame: publicState.targetFrame ?? null,
      targetTime: publicState.targetTime ?? null,
      presentedFrame: publicState.presentedFrame ?? null,
      reactionState: publicState.reactionState ?? shell?.getAttribute("data-cinematic-reaction") ?? null,
      scrollProgress: publicState.scrollProgress ?? null,
      semanticProgress: publicState.semanticProgress ?? null,
      blackProgress: publicState.blackProgress ?? null,
      blackBreath: Number.parseFloat(shell?.style.getPropertyValue("--cinematic-black-breath") || "0"),
      scrollY,
      maximumScrollY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      viewport: { width: innerWidth, height: innerHeight },
      shellTop,
      travel,
      settledY: shellTop + travel,
      video: video instanceof HTMLVideoElement ? { currentTime: video.currentTime, paused: video.paused, readyState: video.readyState, hasSource: Boolean(video.currentSrc || video.src), sourcePath: video.currentSrc.startsWith("blob:") ? "<BLOB>" : video.currentSrc ? new URL(video.currentSrc).pathname : null, box: rect(video) } : null,
      poster: poster ? { box: rect(poster), sourcePath: (() => { const image = poster.querySelector("img"); return image?.currentSrc ? new URL(image.currentSrc, location.href).pathname : null; })() } : null,
      videoElements: document.querySelectorAll("video").length,
      blobLifecycle: window.__phase4r21BlobLifecycle ?? { created: 0, revoked: 0, live: 0 },
      chapter: chapter?.getAttribute("data-home-scene") ?? null,
      chapterBox: rect(chapter),
      entry: { box: rect(entry), h1: rect(h1), routes: routes.map(rect), h1Text: h1?.textContent?.trim() ?? null },
      header: rect(header),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
    };
  });
}

function arrivalProgress(family, shortDesktop) {
  const input = family === "portrait" || family === "landscape"
    ? [0, 0.04, 0.3267, 0.6133, 1]
    : shortDesktop ? [0, 0.0358, 0.3343, 0.6269, 1] : [0, 0.0411, 0.3425, 0.6301, 1];
  const progress = (((ARRIVAL_FRAME - 1) / FRAME_COUNT) - 0.42) / 0.36;
  return input[2] + (input[3] - input[2]) * progress;
}

function interpolate(value, input, output) {
  const progress = Math.min(1, Math.max(0, value));
  for (let index = 1; index < input.length; index += 1) {
    if (progress <= input[index]) {
      const ratio = (progress - input[index - 1]) / Math.max(Number.EPSILON, input[index] - input[index - 1]);
      return output[index - 1] + (output[index] - output[index - 1]) * ratio;
    }
  }
  return output.at(-1);
}

function conceptualCoordinateAtOffset(offset, travel, family, shortDesktop) {
  const extent = Math.max(1, Math.round(travel));
  const bounded = Math.min(extent, Math.max(0, Math.round(offset)));
  if (bounded === 0) return 0;
  const input = family === "portrait" || family === "landscape"
    ? [0, 0.04, 0.3267, 0.6133, 1]
    : shortDesktop ? [0, 0.0358, 0.3343, 0.6269, 1] : [0, 0.0411, 0.3425, 0.6301, 1];
  const arrival = Math.max(1, Math.round(extent * arrivalProgress(family, shortDesktop)));
  const anchors = input.map((value) => Math.round(value * extent));
  if (bounded < arrival) return interpolate(bounded / arrival, [0, anchors[1] / arrival, anchors[2] / arrival, 1], [FIRST_CHANGED_FRAME - 1, 54, 226.8, ARRIVAL_FRAME - 1]);
  if (bounded === arrival) return ARRIVAL_FRAME - 1;
  const postExtent = Math.max(extent - arrival - 1, 1);
  return interpolate((bounded - arrival - 1) / postExtent, [0, Math.max(0, anchors[3] - arrival - 1) / postExtent, 1], [STABLE_Q_FRAME, 421.2, FRAME_COUNT]);
}

async function frameScrollY(page, frame) {
  if (!Number.isInteger(frame) || frame < 1 || frame > FRAME_COUNT) throw new Error(`invalid conceptual frame ${frame}`);
  const initial = await runtimeState(page);
  if (!(initial.travel > 0)) throw new Error("runtime did not publish cinematic travel");
  if (frame === 1) return initial.shellTop;
  if (frame === ARRIVAL_FRAME) {
    const shortDesktop = initial.mediaFamily === "desktop" && initial.viewport.height <= 650;
    return Math.round(initial.shellTop + initial.travel * arrivalProgress(initial.mediaFamily, shortDesktop));
  }
  const shortDesktop = initial.mediaFamily === "desktop" && initial.viewport.height <= 650;
  let low = 0;
  let high = Math.round(initial.travel);
  for (let iteration = 0; iteration < 18 && low < high; iteration += 1) {
    const middle = Math.floor((low + high) / 2);
    const observed = Math.min(FRAME_COUNT, Math.max(1, Math.floor(conceptualCoordinateAtOffset(middle, initial.travel, initial.mediaFamily, shortDesktop)) + 1));
    if (observed < frame) low = middle + 1;
    else high = middle;
  }
  return Math.round(initial.shellTop + low);
}

async function scrollToFrame(page, frame, { presented = false, timeoutMs = 8_000 } = {}) {
  const y = await frameScrollY(page, frame);
  await page.evaluate((target) => window.scrollTo(0, target), y);
  await page.waitForFunction(({ frame, presented }) => {
    const state = window.quantumPhase4;
    if (!state || state.conceptualFrame < frame) return false;
    return !presented || state.presentedFrame >= Math.min(frame, PHYSICAL_FRAME_COUNT);
  }, { frame, presented }, { timeout: timeoutMs });
  await twoFrames(page);
  return { requestedY: y, state: await runtimeState(page) };
}

async function animateScroll(page, targetY, durationMs) {
  await page.evaluate(async ({ targetY, durationMs }) => {
    const startY = scrollY;
    const started = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - started) / Math.max(1, durationMs));
        const eased = t * t * (3 - 2 * t);
        window.scrollTo(0, startY + (targetY - startY) * eased);
        if (t >= 1) resolve(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { targetY, durationMs });
  await twoFrames(page);
}

async function wheelToY(page, targetY) {
  const before = await page.evaluate(() => scrollY);
  const delta = targetY - before;
  if (Math.abs(delta) <= 0.5) return before;
  await page.mouse.wheel(0, delta);
  await page.waitForFunction(({ targetY, before, direction }) => {
    if (Math.abs(scrollY - targetY) <= 2) return true;
    return direction > 0 ? scrollY > before + 1 : scrollY < before - 1;
  }, { targetY, before, direction: Math.sign(delta) }, { timeout: 2_000 });
  await twoFrames(page);
  const observed = await page.evaluate(() => scrollY);
  if (Math.abs(observed - targetY) > 2) throw new Error(`wheel input did not reach requested native scroll position: ${observed} vs ${targetY}`);
  return observed;
}

async function chapterScrollY(page, id) {
  return page.evaluate((chapterId) => {
    const node = document.querySelector(`[data-home-scene='${chapterId}']`);
    if (!(node instanceof HTMLElement)) throw new Error(`missing chapter ${chapterId}`);
    const header = document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0;
    return Math.max(0, node.getBoundingClientRect().top + scrollY - header);
  }, id);
}

async function screenshot(page, selector = null) {
  if (selector) {
    const locator = page.locator(selector).first();
    if (await locator.count()) return locator.screenshot({ type: "png", animations: "disabled" });
  }
  return page.screenshot({ type: "png", animations: "disabled" });
}

export function visiblePixelChangeResult(metrics) {
  const minimumChangedPixels = Math.max(24, Math.ceil(metrics.pixels * 0.0001));
  const visiblyChanged = metrics.changedPixelsAtLeast2 >= minimumChangedPixels
    && metrics.maximumAbsoluteChannel >= 4
    && metrics.meanAbsoluteMaximumChannel >= 0.002;
  return { minimumChangedPixels, visiblyChanged };
}

async function imageDifference(before, after) {
  const [left, right] = await Promise.all([sharp(before).removeAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(after).removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
  if (left.info.width !== right.info.width || left.info.height !== right.info.height || left.data.length !== right.data.length) throw new Error("before/after image dimensions differ");
  let absolute = 0;
  let changed = 0;
  let maximum = 0;
  for (let index = 0; index < left.data.length; index += 3) {
    const delta = Math.max(Math.abs(left.data[index] - right.data[index]), Math.abs(left.data[index + 1] - right.data[index + 1]), Math.abs(left.data[index + 2] - right.data[index + 2]));
    absolute += delta;
    if (delta >= 2) changed += 1;
    maximum = Math.max(maximum, delta);
  }
  const pixels = left.info.width * left.info.height;
  const metrics = { width: left.info.width, height: left.info.height, pixels, changedPixelsAtLeast2: changed, changedPercentAtLeast2: changed / pixels * 100, meanAbsoluteMaximumChannel: absolute / pixels, maximumAbsoluteChannel: maximum };
  return { ...metrics, ...visiblePixelChangeResult(metrics) };
}

async function installTelemetry(page, label) {
  await page.evaluate((captureLabel) => {
    document.querySelector("#__phase4r21_evidence_telemetry")?.remove();
    const state = { scrollEvents: 0, wheelEvents: 0, keyEvents: 0, touchEvents: 0, lastInputAt: performance.now() };
    const node = document.createElement("output");
    node.id = "__phase4r21_evidence_telemetry";
    node.setAttribute("aria-hidden", "true");
    Object.assign(node.style, {
      position: "fixed", zIndex: "2147483647", inset: "auto auto 12px 12px", padding: "9px 11px",
      maxWidth: "min(31rem, calc(100vw - 24px))", color: "#f7eaff", background: "rgba(7, 5, 11, .88)",
      border: "1px solid rgba(238, 85, 255, .78)", font: "600 11px/1.42 ui-monospace, Consolas, monospace",
      letterSpacing: ".02em", whiteSpace: "pre-wrap", pointerEvents: "none",
    });
    document.documentElement.append(node);
    const mark = (kind) => { state[kind] += 1; state.lastInputAt = performance.now(); };
    addEventListener("scroll", () => mark("scrollEvents"), { passive: true });
    addEventListener("wheel", () => mark("wheelEvents"), { passive: true });
    addEventListener("keydown", () => mark("keyEvents"), { passive: true });
    addEventListener("touchmove", () => mark("touchEvents"), { passive: true });
    window.__phase4r21EvidenceTelemetry = state;
    const render = () => {
      const q = window.quantumPhase4 ?? {};
      node.textContent = `R2.1 EVIDENCE · ${captureLabel}\nscrollY ${scrollY.toFixed(1)} · inputs S${state.scrollEvents}/W${state.wheelEvents}/K${state.keyEvents}/T${state.touchEvents}\nframe ${q.conceptualFrame ?? "–"} · presented ${q.presentedFrame ?? "–"} · ${q.reactionState ?? "–"}\nms since input ${Math.round(performance.now() - state.lastInputAt)}`;
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }, label);
}

async function telemetryState(page) {
  return page.evaluate(() => ({ ...(window.__phase4r21EvidenceTelemetry ?? {}), now: performance.now() }));
}

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function labelSvg(width, height, title, lines = []) {
  const safeLines = lines.slice(0, 8);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#09070d"/><rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#7b3f80"/><text x="24" y="42" fill="#f1bbff" font-family="Arial,sans-serif" font-size="18" font-weight="700">${xml(title)}</text>${safeLines.map((line, index) => `<text x="24" y="${78 + index * 24}" fill="#d7cbd9" font-family="Arial,sans-serif" font-size="15">${xml(line)}</text>`).join("")}</svg>`);
}

function newPanels() {
  return new Map(SHEETS.map((sheet) => [sheet.id, []]));
}

function addPanel(panels, sheetId, image, title, lines = []) {
  const destination = panels.get(sheetId);
  if (!destination) throw new Error(`unknown sheet ${sheetId}`);
  destination.push({ image, title, lines });
}

async function createSheet(destination, definition, panels, subtitle) {
  if (!panels.length) throw new Error(`sheet ${definition.id} has no panels`);
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(panels.length))));
  const rows = Math.ceil(panels.length / columns);
  const cellWidth = 480;
  const imageHeight = 270;
  const labelHeight = 94;
  const margin = 24;
  const header = 96;
  const width = columns * cellWidth + (columns + 1) * margin;
  const height = header + rows * (imageHeight + labelHeight + margin) + margin;
  const background = sharp({ create: { width, height, channels: 3, background: "#08070b" } });
  const composites = [{ input: labelSvg(width - 2 * margin, 72, `PHASE 4-R2.1 · ${definition.title}`, [subtitle]), left: margin, top: 12 }];
  for (let index = 0; index < panels.length; index += 1) {
    const panel = panels[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = margin + column * (cellWidth + margin);
    const top = header + row * (imageHeight + labelHeight + margin);
    const image = panel.image
      ? await sharp(panel.image).resize(cellWidth, imageHeight, { fit: "contain", background: "#000000" }).png().toBuffer()
      : labelSvg(cellWidth, imageHeight, panel.title, panel.lines);
    composites.push({ input: image, left, top });
    composites.push({ input: labelSvg(cellWidth, labelHeight, panel.title, panel.lines), left, top: top + imageHeight });
  }
  const bytes = await background.composite(composites).png({ compressionLevel: 9 }).toBuffer();
  await atomicWrite(destination, bytes);
  const metadata = await sharp(bytes).metadata();
  return { relativePath: `sheets/${path.basename(destination)}`, bytes: bytes.length, sha256: sha256(bytes), kind: "sheet", id: definition.id, width: metadata.width, height: metadata.height, status: "PASS" };
}

async function probeVideo(ffprobe, file) {
  const result = await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=format_name,duration", "-of", "json", file], "ffprobe recording");
  const parsed = JSON.parse(result.stdout);
  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  return { formatName: parsed.format?.format_name ?? null, durationSeconds: Number(parsed.format?.duration), codec: video?.codec_name ?? null, pixelFormat: video?.pix_fmt ?? null, width: video?.width ?? null, height: video?.height ?? null, averageFrameRate: video?.avg_frame_rate ?? null, realFrameRate: video?.r_frame_rate ?? null, frameCount: Number(video?.nb_read_frames), videoStreams: streams.filter((stream) => stream.codec_type === "video").length, audioStreams: streams.filter((stream) => stream.codec_type === "audio").length, otherStreams: streams.filter((stream) => !["video", "audio"].includes(stream.codec_type)).length };
}

export function recordingDurationResult(probe, minimumSeconds) {
  const minimumExpectedFrameCount = Math.ceil(minimumSeconds * FPS);
  const decodedSeconds = probe.frameCount / FPS;
  const durationDeltaSeconds = Math.abs(decodedSeconds - probe.durationSeconds);
  const checks = {
    finiteDuration: Number.isFinite(probe.durationSeconds) && probe.durationSeconds > 0,
    minimumScenarioDuration: probe.durationSeconds >= minimumSeconds && probe.frameCount >= minimumExpectedFrameCount,
    frameDurationConsistent: durationDeltaSeconds <= Math.max(2 / FPS, 0.08),
  };
  return { minimumSeconds, minimumExpectedFrameCount, decodedSeconds, durationDeltaSeconds, checks, pass: Object.values(checks).every(Boolean) };
}

async function normalizeRecording(options, rawFile, destination, view, scenario) {
  await run(options.ffmpeg, ["-v", "error", "-y", "-i", rawFile, "-map", "0:v:0", "-an", "-map_metadata", "-1", "-vf", "fps=30,format=yuv420p", "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-movflags", "+faststart", destination], "normalize browser recording");
  await run(options.ffmpeg, ["-v", "error", "-i", destination, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], "decode browser recording");
  const probe = await probeVideo(options.ffprobe, destination);
  if (!String(probe.formatName).includes("mp4") || probe.videoStreams !== 1 || probe.audioStreams !== 0 || probe.otherStreams !== 0 || probe.codec !== "h264" || probe.pixelFormat !== "yuv420p" || probe.width !== view.width || probe.height !== view.height || probe.averageFrameRate !== "30/1" || probe.realFrameRate !== "30/1" || !Number.isInteger(probe.frameCount) || probe.frameCount < 2) throw new Error(`recording contract failed: ${path.basename(destination)}`);
  const duration = recordingDurationResult(probe, MINIMUM_RECORDING_SECONDS[scenario.id]);
  if (!duration.pass) throw new Error(`recording duration/frame contract failed: ${scenario.id} ${JSON.stringify(duration)}`);
  const bytes = await readFile(destination);
  return { relativePath: `recordings/${path.basename(destination)}`, bytes: bytes.length, sha256: sha256(bytes), kind: "recording", expectedFrameCount: probe.frameCount, minimumExpectedFrameCount: duration.minimumExpectedFrameCount, minimumExpectedDurationSeconds: duration.minimumSeconds, media: probe, durationValidation: duration, fullDecodePass: true };
}

async function openRecordedPage(browser, options, scenario, rawRoot, routeSetup = null) {
  const view = viewpoint(scenario.viewpoint);
  const directory = path.join(rawRoot, scenario.id);
  await mkdir(directory, { recursive: true });
  const context = await browser.newContext(contextOptions(view, { recordVideo: { dir: directory, size: { width: view.width, height: view.height } } }));
  if (routeSetup) await routeSetup(context);
  const page = await context.newPage();
  const diagnostics = await observePage(page);
  const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  if (!response?.ok()) throw new Error(`${scenario.id} navigation failed`);
  return { view, context, page, diagnostics };
}

async function finishRecordedPage(options, scenario, opened) {
  const video = opened.page.video();
  await opened.context.close();
  const rawFile = await video.path();
  const destination = path.join(options.output, "recordings", `${scenario.id}.mp4`);
  const record = await normalizeRecording(options, rawFile, destination, opened.view, scenario);
  return { ...record, id: scenario.id, gate: scenario.gate, kind: scenario.kind, viewpoint: scenario.viewpoint, diagnostics: opened.diagnostics };
}

async function applyFirstInput(page, context, probe, view) {
  if (probe.kind === "programmatic") await page.evaluate((delta) => window.scrollTo(0, delta), probe.delta);
  else if (probe.kind === "wheel") await page.mouse.wheel(0, probe.delta);
  else if (probe.kind === "keyboard") await page.keyboard.press(probe.key);
  else if (probe.kind === "touch") {
    const session = await context.newCDPSession(page);
    const x = Math.round(view.width / 2);
    const startY = Math.max(80, Math.round(view.height * 0.78));
    const endY = Math.max(30, startY - probe.delta);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: endY }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else throw new Error(`unknown first-input kind ${probe.kind}`);
}

function expectedMediaPath(manifest, manifestUrlPath, family) {
  const asset = manifest.assets.find((item) => item.kind === "video" && item.family === family);
  if (!asset) throw new Error(`missing active ${family} video`);
  return mediaUrlPath(manifestUrlPath, asset.file);
}

function requestInventory(diagnostics, runtime, manifest, manifestUrlPath, family) {
  const expected = expectedMediaPath(manifest, manifestUrlPath, family);
  const videoRequests = diagnostics.requests.filter((item) => /\.(?:mp4|webm)$/i.test(item.path));
  const h264 = videoRequests.filter((item) => item.path.endsWith(".mp4"));
  const vp9 = videoRequests.filter((item) => item.path.endsWith(".webm"));
  const unique = [...new Set(videoRequests.map((item) => item.path))];
  const result = {
    expectedFamily: family,
    expectedH264Path: expected,
    videoRequests,
    h264RequestCount: h264.length,
    vp9RequestCount: vp9.length,
    uniqueVideoPaths: unique,
    blobRequestCount: diagnostics.blobRequests,
    blobUrlCreateCount: runtime.blobLifecycle?.created ?? 0,
    liveBlobUrlCount: runtime.blobLifecycle?.live ?? 0,
    videoElementCount: runtime.videoElements,
    runtimeCodec: runtime.codec,
    runtimeDelivery: runtime.delivery,
    checks: {
      exactlyOneH264Request: h264.length === 1,
      zeroVp9Requests: vp9.length === 0,
      exactExpectedFamilyPath: unique.length === 1 && unique[0] === expected,
      exactlyOneBlob: runtime.blobLifecycle?.created === 1 && runtime.blobLifecycle?.live === 1,
      exactlyOneDecoderElement: runtime.videoElements === 1,
      runtimeH264: runtime.codec === "h264",
      blobDelivery: runtime.delivery === "blob" || runtime.video?.sourcePath === "<BLOB>",
    },
  };
  if (Object.values(result.checks).some((passed) => !passed)) throw new Error(`H.264/one-decoder request inventory failed: ${JSON.stringify(result)}`);
  return { ...result, status: "PASS" };
}

async function captureFirstInputMatrix(browser, options, manifest, panels) {
  const results = [];
  for (const view of VIEWPOINTS.filter((item) => item.firstInput)) {
    for (const probe of FIRST_INPUT_PROBES) {
      const context = await browser.newContext(contextOptions(view, probe.kind === "touch" ? { hasTouch: true } : {}));
      const page = await context.newPage();
      const diagnostics = await observePage(page);
      await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      await settleEnhanced(page, options.timeoutMs);
      const beforeState = await runtimeState(page);
      if (Math.abs(beforeState.scrollY) > 0.5 || beforeState.conceptualFrame !== 1 || beforeState.targetFrame !== 1 || beforeState.presentedFrame !== 1) throw new Error(`${view.id}/${probe.id} did not begin at exact dormant top`);
      const before = await screenshot(page, "[data-cinematic-stage]");
      const started = performance.now();
      await applyFirstInput(page, context, probe, view);
      await page.waitForFunction((first) => window.quantumPhase4?.targetFrame >= first, FIRST_CHANGED_FRAME, { timeout: 1_500 });
      const targetResponseMs = performance.now() - started;
      await page.waitForFunction((first) => window.quantumPhase4?.presentedFrame >= first, FIRST_CHANGED_FRAME, { timeout: 2_500 });
      const presentedResponseMs = performance.now() - started;
      await twoFrames(page);
      const afterState = await runtimeState(page);
      const after = await screenshot(page, "[data-cinematic-stage]");
      const difference = await imageDifference(before, after);
      const checks = {
        positiveRootScroll: afterState.scrollY > 0,
        visibleTargetImmediately: afterState.targetFrame >= FIRST_CHANGED_FRAME,
        visiblePresentation: afterState.presentedFrame >= FIRST_CHANGED_FRAME,
        stagePixelsChanged: difference.visiblyChanged,
        noDeadZoneOverOneCssPixel: beforeState.targetFrame === 1 && afterState.targetFrame >= FIRST_CHANGED_FRAME,
        responsiveSafetyBoundUnder250Ms: targetResponseMs < 250,
        presentedSafetyBoundUnder250Ms: presentedResponseMs < 250,
      };
      if (Object.values(checks).some((passed) => !passed)) throw new Error(`${view.id}/${probe.id} first-input response failed: ${JSON.stringify({ checks, beforeState, afterState, difference })}`);
      if (probe.id === "programmatic-15px") {
        addPanel(panels, "01-first-input-before-after", before, `${view.id} · BEFORE`, ["F1 dormant", `scrollY ${beforeState.scrollY}`]);
        addPanel(panels, "01-first-input-before-after", after, `${view.id} · +15 px`, [`target F${afterState.targetFrame}`, `presented F${afterState.presentedFrame}`, `${targetResponseMs.toFixed(1)} ms target`]);
      }
      const inventory = requestInventory(diagnostics, afterState, manifest, options.manifestUrlPath, view.family);
      results.push({ viewpoint: view, probe, before: beforeState, after: afterState, targetResponseMs, presentedResponseMs, strongTargetUnder100Ms: targetResponseMs < 100, strongPresentedUnder100Ms: presentedResponseMs < 100, difference, checks, requestInventory: inventory, status: "PASS" });
      await context.close();
    }
  }
  return { cases: results, caseCount: results.length, strongTargetUnder100MsCount: results.filter((item) => item.strongTargetUnder100Ms).length, strongPresentedUnder100MsCount: results.filter((item) => item.strongPresentedUnder100Ms).length, allVisible: true, status: "PASS" };
}

function intervalCount(values, predicate) {
  let intervals = 0;
  let active = false;
  for (const value of values) {
    const next = predicate(value);
    if (next && !active) intervals += 1;
    active = next;
  }
  return intervals;
}

export function validateLoopRanges(ranges) {
  if (!Array.isArray(ranges) || ranges.length < 2) throw new Error("physical loop range inventory is incomplete");
  const checks = {
    beginsAtOrigin: Math.abs(ranges[0]?.normalizedStart ?? Number.NaN) <= 1e-8,
    endsAtConnection: Math.abs((ranges.at(-1)?.normalizedEnd ?? Number.NaN) - 1) <= 1e-8,
    normalizedContiguous: true,
    frameOrderCausal: true,
    segmentOrderContiguous: true,
  };
  for (let index = 0; index < ranges.length; index += 1) {
    const item = ranges[index];
    if (!(Number.isFinite(item.normalizedStart) && Number.isFinite(item.normalizedEnd) && item.normalizedStart <= item.normalizedEnd)
      || !Array.isArray(item.segmentIndexRange) || item.segmentIndexRange.length !== 2
      || !Number.isInteger(item.frontEntersFrame) || !Number.isInteger(item.frontLastSegmentArrivalFrame)
      || item.frontEntersFrame > item.frontLastSegmentArrivalFrame) throw new Error("physical loop range is malformed");
    if (index > 0) {
      const previous = ranges[index - 1];
      if (Math.abs(item.normalizedStart - previous.normalizedEnd) > 1e-8) checks.normalizedContiguous = false;
      if (item.frontEntersFrame < previous.frontLastSegmentArrivalFrame - 1) checks.frameOrderCausal = false;
      if (item.segmentIndexRange[0] !== previous.segmentIndexRange[1]) checks.segmentOrderContiguous = false;
    }
  }
  const pass = Object.values(checks).every(Boolean);
  if (!pass) throw new Error(`physical loop ordering failed: ${JSON.stringify(checks)}`);
  return { checks, pass };
}

async function readVerifiedDiagnostic(root, record, label) {
  if (!record?.relativePath || record.relativePath.includes("..") || path.isAbsolute(record.relativePath)
    || !/^[a-z0-9._\/-]+$/i.test(record.relativePath)
    || !Number.isSafeInteger(record.bytes) || record.bytes <= 0
    || !/^[0-9a-f]{64}$/.test(record.sha256 ?? "")) throw new Error(`${label} diagnostic record is unsafe`);
  const absolute = path.resolve(root, ...record.relativePath.split("/"));
  if (!isWithin(root, absolute)) throw new Error(`${label} diagnostic escapes its authority root`);
  const bytes = await readFile(absolute);
  if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw new Error(`${label} diagnostic authority differs`);
  return bytes;
}

async function captureCurrentOrder(browser, options, authorities, panels) {
  const view = viewpoint("desktop-1440x900");
  const context = await browser.newContext(contextOptions(view));
  const page = await context.newPage();
  const diagnostics = await observePage(page);
  await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(page, options.timeoutMs);
  const samples = [];
  for (const progress of CURRENT_PROGRESS_SAMPLES) {
    const frame = Math.round(FIRST_CHANGED_FRAME + (ARRIVAL_FRAME - FIRST_CHANGED_FRAME) * progress / 100);
    const moved = await scrollToFrame(page, frame, { presented: progress < 100, timeoutMs: 8_000 });
    const image = await screenshot(page, "[data-cinematic-stage]");
    addPanel(panels, "03-current-loop-order", image, `${progress}% · F${frame}`, [`target F${moved.state.targetFrame}`, `presented F${moved.state.presentedFrame}`, `front ${progress.toFixed(0)}% origin → CRT`]);
    if ([97, 100].includes(progress)) addPanel(panels, "04-full-arrival-cable", image, `${progress}% · production`, [`F${frame}`, progress === 100 ? "arrival / full route" : "late front"]);
    samples.push({ progressPercent: progress, expectedFrame: frame, scrollY: moved.state.scrollY, targetFrame: moved.state.targetFrame, presentedFrame: moved.state.presentedFrame, reactionState: moved.state.reactionState, screenshot: { bytes: image.length, sha256: sha256(image) } });
  }
  const finalState = await runtimeState(page);
  const inventory = requestInventory(diagnostics, finalState, authorities.manifest, options.manifestUrlPath, "desktop");
  await context.close();

  const sourceAudit = authorities.reports.sourceAudit.content;
  const loopBoundaries = Object.fromEntries(Object.entries(sourceAudit.families).map(([family, value]) => {
    validateLoopRanges(value.physicalRanges);
    return [family, value.physicalRanges];
  }));
  const coverage = authorities.reports.current.content.coverage.map((item) => {
    const energizedIntervalCount = intervalCount(item.alphas, (alpha) => alpha > 0);
    const darkGapCount = intervalCount(item.alphas, (alpha) => !(alpha > 0));
    return { family: item.family, frame: item.frame, totalSamples: item.segmentCount, energizedSamples: item.energizedCount, darkSamples: item.darkCount, energizedIntervalCount, darkGapCount, maximumAdjacentSurfaceSeparationMeters: item.maximumAdjacentSurfaceSeparationMeters, coveragePercent: item.energizedCount / item.segmentCount * 100, originCoverage: item.alphas[0] > 0, connectionCoverage: item.alphas.at(-1) > 0, endpointCoverage: item.allSegmentsEnergized, routeOrderContiguous: item.routeOrderContiguous };
  });
  if (coverage.some((item) => item.coveragePercent !== 100 || item.darkSamples !== 0 || item.energizedIntervalCount !== 1 || item.darkGapCount !== 0 || !item.originCoverage || !item.connectionCoverage || !item.endpointCoverage || !item.routeOrderContiguous || item.maximumAdjacentSurfaceSeparationMeters !== 0)) throw new Error("arrival source continuity projection failed");
  const matrix = authorities.reports.rootCause.content.matrix;
  for (const item of matrix) addPanel(panels, "02-root-cause-matrix", null, item.defect.toUpperCase(), [`Blender ${item.blender} · RGB16 ${item.rgb16Master}`, `H.264 ${item.h264} · VP9 ${item.vp9}`, `browser ${item.browserMapping}`, String(item.rootCause).slice(0, 150)]);
  for (const item of coverage) addPanel(panels, "04-full-arrival-cable", null, `${item.family.toUpperCase()} · SOURCE COVERAGE`, [`${item.energizedSamples}/${item.totalSamples} energized`, `${item.darkSamples} dark gaps`, `${item.coveragePercent.toFixed(0)}% one contiguous interval`]);
  const diagnosticRoot = path.dirname(path.resolve(ROOT, options.reports.current));
  const desktopDiagnostic = authorities.reports.current.content.outputs?.find((item) => item.family === "desktop" && item.frame === ARRIVAL_FRAME && item.relativePath?.startsWith("current-sheath/"));
  if (desktopDiagnostic) {
    const bytes = await readVerifiedDiagnostic(diagnosticRoot, desktopDiagnostic, "desktop arrival");
    addPanel(panels, "04-full-arrival-cable", bytes, "F285 · BLOOM/SPILL DISABLED", ["actual current + graphite sheath", "hall/CRT/local spill suppressed", "diagnostic, not production exposure"]);
  }
  const graphic = authorities.reports.current.content.coverageGraphic;
  if (graphic?.relativePath) {
    const bytes = await readVerifiedDiagnostic(diagnosticRoot, graphic, "unwrapped coverage");
    addPanel(panels, "04-full-arrival-cable", bytes, "F285 · UNWRAPPED ARC COVERAGE", ["source → CRT", "100% contiguous internal signal", "0 dark gaps"]);
  }
  const browserChecks = {
    exactSampleInventory: samples.length === CURRENT_PROGRESS_SAMPLES.length && samples.every((item, index) => item.progressPercent === CURRENT_PROGRESS_SAMPLES[index]),
    targetFramesMonotonic: samples.every((item, index) => index === 0 || item.targetFrame >= samples[index - 1].targetFrame),
    presentedFramesMonotonicBeforeArrival: samples.slice(0, -1).every((item, index) => index === 0 || item.presentedFrame >= samples[index - 1].presentedFrame),
    firstSampleIsVisibleOnset: samples[0]?.expectedFrame === FIRST_CHANGED_FRAME && samples[0]?.targetFrame >= FIRST_CHANGED_FRAME && samples[0]?.presentedFrame >= FIRST_CHANGED_FRAME,
    finalSampleIsArrival: samples.at(-1)?.expectedFrame === ARRIVAL_FRAME && samples.at(-1)?.targetFrame === ARRIVAL_FRAME && samples.at(-1)?.presentedFrame >= ARRIVAL_FRAME,
  };
  if (Object.values(browserChecks).some((passed) => !passed)) throw new Error(`current-order browser sampling failed: ${JSON.stringify(browserChecks)}`);
  return { browserSamples: samples, browserChecks, loopBoundaries, arrivalCoverage: coverage, rootCauseAuthority: { basename: authorities.reports.rootCause.basename, bytes: authorities.reports.rootCause.bytes, sha256: authorities.reports.rootCause.sha256 }, currentAuthority: { basename: authorities.reports.current.basename, bytes: authorities.reports.current.bytes, sha256: authorities.reports.current.sha256 }, requestInventory: inventory, status: "PASS" };
}

async function waitStableQ(page, timeoutMs) {
  await page.waitForFunction((stable) => {
    const value = window.quantumPhase4;
    return value?.reactionState === "stable-hold" && value.presentedFrame >= stable;
  }, STABLE_Q_FRAME, { timeout: Math.min(timeoutMs, 10_000) });
  await twoFrames(page);
  return runtimeState(page);
}

async function waitReverseComplete(page, targetFrame, timeoutMs) {
  await page.waitForFunction((target) => {
    const value = window.quantumPhase4;
    return value && value.presentedFrame <= target + 1 && ["pre-arrival", "post-arrival"].includes(value.reactionState);
  }, targetFrame, { timeout: Math.min(timeoutMs, 10_000) });
  await twoFrames(page);
  return runtimeState(page);
}

async function recordStandardScenario(browser, options, scenario, rawRoot, panels) {
  const opened = await openRecordedPage(browser, options, scenario, rawRoot);
  const { page } = opened;
  await settleEnhanced(page, options.timeoutMs);
  await installTelemetry(page, scenario.id);
  const states = [];
  states.push({ id: "start", state: await runtimeState(page), telemetry: await telemetryState(page) });
  let checks = {};

  if (scenario.kind === "first-input") {
    const before = await screenshot(page);
    const beforeStage = await screenshot(page, "[data-cinematic-stage]");
    await page.waitForTimeout(600);
    await page.mouse.wheel(0, 15);
    await page.waitForFunction((first) => window.quantumPhase4?.presentedFrame >= first, FIRST_CHANGED_FRAME, { timeout: 2_500 });
    await page.waitForTimeout(700);
    const after = await screenshot(page);
    const afterStage = await screenshot(page, "[data-cinematic-stage]");
    const state = await runtimeState(page);
    const difference = await imageDifference(beforeStage, afterStage);
    addPanel(panels, "01-first-input-before-after", before, "RECORDING A · BEFORE INPUT", ["telemetry visible", "exact dormant top"]);
    addPanel(panels, "01-first-input-before-after", after, "RECORDING A · FIRST SMALL WHEEL", [`target F${state.targetFrame}`, `presented F${state.presentedFrame}`]);
    checks = { advanced: state.targetFrame >= FIRST_CHANGED_FRAME, scrollPositive: state.scrollY > 0, recordingStartsBeforeInput: states[0].telemetry.wheelEvents === 0 && states[0].telemetry.keyEvents === 0 && states[0].telemetry.touchEvents === 0, telemetryPresent: Boolean(states[0].telemetry && Number.isFinite(states[0].telemetry.now)), stagePixelsChanged: difference.visiblyChanged };
  } else if (scenario.kind === "ordered-current") {
    const startY = await frameScrollY(page, FIRST_CHANGED_FRAME);
    const arrivalY = await frameScrollY(page, ARRIVAL_FRAME);
    await page.evaluate((y) => window.scrollTo(0, y), startY);
    await page.waitForTimeout(400);
    await animateScroll(page, arrivalY, 8_000);
    const state = await runtimeState(page);
    checks = { reachedArrival: state.targetFrame >= ARRIVAL_FRAME, oneContinuousGesture: true, normalSpeedSeconds: 8 };
  } else if (["wake-no-input", "wake-continue", "wake-reverse-indicator", "wake-reverse-raster", "wake-reverse-after-q", "wake-reentry-reload"].includes(scenario.kind)) {
    await scrollToFrame(page, 270, { presented: true });
    await page.waitForTimeout(400);
    const arrivalY = await frameScrollY(page, ARRIVAL_FRAME);
    await wheelToY(page, arrivalY);
    await page.waitForFunction((arrival) => window.quantumPhase4?.presentedFrame >= arrival, ARRIVAL_FRAME, { timeout: 4_000 });
    const arrival = await runtimeState(page);
    const arrivalObservedAt = performance.now();
    const inputAtArrival = await telemetryState(page);
    const arrivalImage = await screenshot(page);
    addPanel(panels, "05-auto-wake", arrivalImage, `${scenario.id} · ARRIVAL`, [`scrollY ${arrival.scrollY.toFixed(1)}`, `reaction ${arrival.reactionState}`]);
    if (scenario.kind === "wake-no-input") {
      const stable = await waitStableQ(page, options.timeoutMs);
      const wakeElapsedMs = performance.now() - arrivalObservedAt;
      const telemetry = await telemetryState(page);
      const stableImage = await screenshot(page);
      addPanel(panels, "05-auto-wake", stableImage, "NO INPUT · STABLE Q", [`F${stable.presentedFrame}`, `scroll Δ ${(stable.scrollY - arrival.scrollY).toFixed(2)} px`, `scroll events Δ ${telemetry.scrollEvents - inputAtArrival.scrollEvents}`]);
      checks = {
        stableQ: stable.presentedFrame >= STABLE_Q_FRAME,
        noInputScrollEvents: telemetry.scrollEvents === inputAtArrival.scrollEvents,
        noWheelKeyOrTouchInput: telemetry.wheelEvents === inputAtArrival.wheelEvents && telemetry.keyEvents === inputAtArrival.keyEvents && telemetry.touchEvents === inputAtArrival.touchEvents,
        unchangedScrollY: Math.abs(stable.scrollY - arrival.scrollY) <= 1,
        authoredRateWithinTolerance: Math.abs(wakeElapsedMs / 1_000 - WAKE_DURATION_SECONDS) <= 0.5,
      };
      checks.authoredDurationSeconds = WAKE_DURATION_SECONDS;
      checks.measuredWakeDurationMs = wakeElapsedMs;
    } else if (scenario.kind === "wake-continue") {
      await page.waitForFunction(() => (window.quantumPhase4?.presentedFrame ?? 0) >= 300, null, { timeout: 4_000 });
      const targetY = await frameScrollY(page, 450);
      await wheelToY(page, targetY);
      await page.waitForFunction(() => (window.quantumPhase4?.targetFrame ?? 0) >= 450 && window.quantumPhase4?.reactionState === "post-arrival", null, { timeout: 4_000 });
      const end = await runtimeState(page);
      checks = { latestPositionWins: end.targetFrame >= 450, postArrival: end.reactionState === "post-arrival", noScrollLock: end.scrollY > arrival.scrollY };
    } else if (scenario.kind === "wake-reverse-indicator" || scenario.kind === "wake-reverse-raster") {
      const trigger = scenario.kind === "wake-reverse-indicator" ? 292 : 325;
      await page.waitForFunction((frame) => (window.quantumPhase4?.presentedFrame ?? 0) >= frame, trigger, { timeout: 5_000 });
      const beforeReverse = await screenshot(page);
      const targetY = await frameScrollY(page, 250);
      await wheelToY(page, targetY);
      const end = await waitReverseComplete(page, 250, options.timeoutMs);
      const afterReverse = await screenshot(page);
      addPanel(panels, "06-reverse-wake", beforeReverse, `${scenario.id} · REVERSE START`, [`presented ≥ F${trigger}`]);
      addPanel(panels, "06-reverse-wake", afterReverse, `${scenario.id} · RECONSTRUCTED`, [`presented F${end.presentedFrame}`, `state ${end.reactionState}`]);
      checks = { reverseTargetReached: end.presentedFrame <= 251, noStaleWake: end.reactionState === "pre-arrival", noRuntimeScrollWrite: Math.abs(end.scrollY - targetY) <= 1 };
    } else if (scenario.kind === "wake-reverse-after-q") {
      const stable = await waitStableQ(page, options.timeoutMs);
      const beforeReverse = await screenshot(page);
      const targetY = await frameScrollY(page, 250);
      await wheelToY(page, targetY);
      const end = await waitReverseComplete(page, 250, options.timeoutMs);
      const afterReverse = await screenshot(page);
      addPanel(panels, "06-reverse-wake", beforeReverse, "STABLE Q · BEFORE REVERSE", [`F${stable.presentedFrame}`]);
      addPanel(panels, "06-reverse-wake", afterReverse, "AFTER AUTHORED UNWIND", [`F${end.presentedFrame}`, `state ${end.reactionState}`]);
      checks = { stableBeforeReverse: stable.presentedFrame >= STABLE_Q_FRAME, coherentUnwind: end.presentedFrame <= 251, preArrival: end.reactionState === "pre-arrival", noRuntimeScrollWrite: Math.abs(end.scrollY - targetY) <= 1 };
    } else {
      const firstStable = await waitStableQ(page, options.timeoutMs);
      const retreatY = await frameScrollY(page, 250);
      await wheelToY(page, retreatY);
      await waitReverseComplete(page, 250, options.timeoutMs);
      await wheelToY(page, arrivalY);
      const secondStable = await waitStableQ(page, options.timeoutMs);
      const beforeReload = await runtimeState(page);
      await page.reload({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      await settleEnhanced(page, options.timeoutMs, { resetScroll: false });
      await installTelemetry(page, `${scenario.id} · restored`);
      await page.waitForFunction((arrival) => (window.quantumPhase4?.presentedFrame ?? 0) >= arrival && window.quantumPhase4?.reactionState !== "pre-arrival", ARRIVAL_FRAME, { timeout: 5_000 });
      const restored = await runtimeState(page);
      checks = { firstCrossingStable: firstStable.presentedFrame >= STABLE_Q_FRAME, secondCrossingStable: secondStable.presentedFrame >= STABLE_Q_FRAME, restoredWithoutDormancy: restored.presentedFrame >= ARRIVAL_FRAME && restored.reactionState !== "pre-arrival", restoredScrollPosition: Math.abs(restored.scrollY - beforeReload.scrollY) <= 1 };
    }
  } else if (scenario.kind === "full-forward") {
    const targetY = scenario.id.startsWith("F-") ? await chapterScrollY(page, "method") : (await runtimeState(page)).settledY;
    await animateScroll(page, targetY, scenario.id.startsWith("F-") ? 12_000 : 10_000);
    await page.waitForTimeout(700);
    const end = await runtimeState(page);
    if (scenario.id.startsWith("F-")) addPanel(panels, "17-operating-field-regression", await screenshot(page), "DESKTOP · METHOD", ["accepted Operating Field", "native document scroll"]);
    else if (scenario.id.startsWith("I-")) addPanel(panels, "10-landscape-844x390", await screenshot(page), "844 × 390 · SETTLED ENTRY", ["complete H1 + both routes", "chrome restored"]);
    checks = scenario.id.startsWith("F-")
      ? { methodReached: end.chapter === "method", physicalThresholdComplete: end.presentedFrame >= PHYSICAL_FRAME_COUNT, chromeRestored: end.headerMode === "released" }
      : { settledEntryReached: end.phase === "settled", physicalThresholdComplete: end.presentedFrame >= PHYSICAL_FRAME_COUNT, chromeRestored: end.headerMode === "released" };
  } else if (scenario.kind === "full-reverse") {
    const methodY = await chapterScrollY(page, "method");
    await page.evaluate((y) => window.scrollTo(0, y), methodY);
    await page.waitForTimeout(700);
    await animateScroll(page, 0, 12_000);
    const end = await runtimeState(page);
    checks = { dormancyReached: end.conceptualFrame === 1 && end.presentedFrame <= 1, exactTop: Math.abs(end.scrollY) <= 0.5 };
  } else if (scenario.kind === "fast-jump") {
    const settledY = (await runtimeState(page)).settledY;
    await page.evaluate((y) => window.scrollTo(0, y), settledY);
    await page.waitForFunction(() => window.quantumPhase4?.conceptualFrame === 540 && (window.quantumPhase4?.presentedFrame ?? 0) >= 500, null, { timeout: 5_000 });
    await twoFrames(page);
    const settled = await runtimeState(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => window.quantumPhase4?.conceptualFrame === 1 && (window.quantumPhase4?.presentedFrame ?? 500) <= 1, null, { timeout: 5_000 });
    await twoFrames(page);
    const top = await runtimeState(page);
    checks = { settledReached: settled.phase === "settled" && settled.presentedFrame >= PHYSICAL_FRAME_COUNT, topReached: top.conceptualFrame === 1 && top.presentedFrame <= 1 && Math.abs(top.scrollY) <= 0.5 };
  } else throw new Error(`standard recorder does not handle ${scenario.kind}`);

  const endState = await runtimeState(page);
  const endTelemetry = await telemetryState(page);
  checks.oneDecoderElement = endState.videoElements === 1;
  checks.atMostOneLiveBlob = (endState.blobLifecycle?.live ?? 0) <= 1;
  if (Object.values(checks).some((passed) => passed === false)) throw new Error(`${scenario.id} checks failed: ${JSON.stringify(checks)}`);
  states.push({ id: "end", state: endState, telemetry: endTelemetry });
  const record = await finishRecordedPage(options, scenario, opened);
  return { ...record, states, checks, status: "PASS" };
}

function timeoutInitScript() {
  window.__phase4r21TimeoutMetrics = { layoutShifts: [] };
  try {
    new PerformanceObserver((list) => window.__phase4r21TimeoutMetrics.layoutShifts.push(...list.getEntries().filter((entry) => !entry.hadRecentInput).map((entry) => ({ value: entry.value, startTime: entry.startTime })))).observe({ type: "layout-shift", buffered: true });
  } catch {}
}

export function timeoutGeometryResult(before, after, clsDuringTimeout) {
  const geometry = {
    documentHeightDelta: after.documentHeight - before.documentHeight,
    scrollYDelta: after.scrollY - before.scrollY,
    chapterBefore: before.chapter,
    chapterAfter: after.chapter,
    chapterTopDelta: before.chapterBox && after.chapterBox ? after.chapterBox.top - before.chapterBox.top : null,
    entryTopDelta: before.entry?.box && after.entry?.box ? after.entry.box.top - before.entry.box.top : null,
    headerTopDelta: before.header && after.header ? after.header.top - before.header.top : null,
    clsDuringTimeout,
  };
  const checks = {
    enhancedGeometryPreserved: after.mode === "enhanced" && after.mediaState === "failed-preserve-runway",
    documentHeightStable: Math.abs(geometry.documentHeightDelta) <= 1,
    scrollPositionStable: Math.abs(geometry.scrollYDelta) <= 1,
    chapterStable: before.chapter === after.chapter,
    chapterPositionStable: geometry.chapterTopDelta === null || Math.abs(geometry.chapterTopDelta) <= 1,
    entryPositionStable: geometry.entryTopDelta === null || Math.abs(geometry.entryTopDelta) <= 1,
    headerPositionStable: geometry.headerTopDelta === null || Math.abs(geometry.headerTopDelta) <= 1,
    constrainedClsBelowPointOne: geometry.clsDuringTimeout < 0.1,
    chromeStateStable: before.headerMode === after.headerMode,
    semanticContentPresent: Boolean(after.entry?.box),
    posterRetainedAndVisible: Boolean(after.poster?.box && after.poster.box.display !== "none" && after.poster.box.visibility !== "hidden" && after.poster.box.opacity >= 0.99 && after.poster.box.width > 0 && after.poster.box.height > 0 && after.poster.sourcePath),
    decoderPayloadReleased: after.video?.hasSource === false && (after.blobLifecycle?.live ?? 0) === 0,
  };
  return { geometry, checks, pass: Object.values(checks).every(Boolean) };
}

async function timeoutTargetY(page, position) {
  if (position === "top") return 0;
  if (position === "mid-current") return frameScrollY(page, 166);
  if (position === "entry") return (await runtimeState(page)).settledY;
  if (position === "built-with-industry") return chapterScrollY(page, "built-with-industry");
  if (position === "method") return chapterScrollY(page, "method");
  if (position === "bottom-conversion") return page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  throw new Error(`unknown timeout position ${position}`);
}

async function captureTimeoutCase(browser, options, position, rawRoot, panels, scenario = null) {
  const view = viewpoint("desktop-1440x900");
  const emulation = { throughputBitsPerSecond: 2_000_000, roundTripTimeMs: 200, cacheDisabled: true, fault: "target H.264 request held past the 12 s runtime timeout then aborted" };
  const directory = scenario ? path.join(rawRoot, scenario.id) : null;
  if (directory) await mkdir(directory, { recursive: true });
  const context = await browser.newContext(contextOptions(view, scenario ? { recordVideo: { dir: directory, size: { width: view.width, height: view.height } } } : {}));
  await context.addInitScript(timeoutInitScript);
  await context.route((url) => url.pathname.endsWith(".mp4") && /phase-4r2/i.test(url.pathname), async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 13_000));
    await route.abort("timedout").catch(() => {});
  });
  const page = await context.newPage();
  const networkSession = await context.newCDPSession(page);
  await networkSession.send("Network.enable");
  await networkSession.send("Network.setCacheDisabled", { cacheDisabled: true });
  await networkSession.send("Network.emulateNetworkConditions", { offline: false, latency: emulation.roundTripTimeMs, downloadThroughput: emulation.throughputBitsPerSecond / 8, uploadThroughput: emulation.throughputBitsPerSecond / 8 });
  const diagnostics = await observePage(page);
  const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  if (!response?.ok()) throw new Error(`timeout ${position} navigation failed`);
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "loading", null, { timeout: 8_000 });
  if (scenario) await installTelemetry(page, scenario.id);
  const targetY = await timeoutTargetY(page, position);
  await page.evaluate((y) => window.scrollTo(0, y), targetY);
  await twoFrames(page);
  const before = await runtimeState(page);
  const beforeMetrics = await page.evaluate(() => ({ cls: (window.__phase4r21TimeoutMetrics?.layoutShifts ?? []).reduce((sum, item) => sum + item.value, 0), shifts: window.__phase4r21TimeoutMetrics?.layoutShifts ?? [] }));
  const beforeImage = await screenshot(page);
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "failed-preserve-runway", null, { timeout: 20_000 });
  await twoFrames(page);
  const after = await runtimeState(page);
  const afterMetrics = await page.evaluate(() => ({ cls: (window.__phase4r21TimeoutMetrics?.layoutShifts ?? []).reduce((sum, item) => sum + item.value, 0), shifts: window.__phase4r21TimeoutMetrics?.layoutShifts ?? [] }));
  const afterImage = await screenshot(page);
  const evaluated = timeoutGeometryResult(before, after, afterMetrics.cls - beforeMetrics.cls);
  evaluated.checks.expectedThrottledLoadTimeout = after.fallback === "load-timeout";
  evaluated.pass = evaluated.pass && evaluated.checks.expectedThrottledLoadTimeout;
  const { geometry, checks } = evaluated;
  if (!evaluated.pass) throw new Error(`timeout geometry failed at ${position}: ${JSON.stringify({ geometry, checks, before, after })}`);
  if (scenario) {
    addPanel(panels, "12-timeout-geometry", beforeImage, `${position.toUpperCase()} · BEFORE TIMEOUT`, [`height ${before.documentHeight}`, `scrollY ${before.scrollY.toFixed(1)}`, `chapter ${before.chapter ?? "cinematic"}`]);
    addPanel(panels, "12-timeout-geometry", afterImage, `${position.toUpperCase()} · AFTER TIMEOUT`, [`height Δ ${geometry.documentHeightDelta}px`, `scroll Δ ${geometry.scrollYDelta.toFixed(2)}px`, `CLS ${geometry.clsDuringTimeout.toFixed(6)}`]);
  }
  let recording = null;
  if (scenario) {
    const video = page.video();
    await context.close();
    const rawFile = await video.path();
    const destination = path.join(options.output, "recordings", `${scenario.id}.mp4`);
    recording = { ...(await normalizeRecording(options, rawFile, destination, view, scenario)), id: scenario.id, gate: scenario.gate, kind: scenario.kind, viewpoint: scenario.viewpoint, position, diagnostics, status: "PASS" };
  } else await context.close();
  return { position, emulation, before, after, geometry, checks, diagnostics, recording, status: "PASS" };
}

async function captureTimeoutMatrix(browser, options, rawRoot, panels) {
  const cases = [];
  for (const position of TIMEOUT_POSITIONS) {
    const scenario = RECORDINGS.find((item) => item.kind === "timeout" && item.position === position) ?? null;
    cases.push(await captureTimeoutCase(browser, options, position, rawRoot, panels, scenario));
  }
  return { cases, recordings: cases.map((item) => item.recording).filter(Boolean), maximumAbsoluteDocumentHeightDelta: Math.max(...cases.map((item) => Math.abs(item.geometry.documentHeightDelta))), maximumAbsoluteScrollYDelta: Math.max(...cases.map((item) => Math.abs(item.geometry.scrollYDelta))), maximumCls: Math.max(...cases.map((item) => item.geometry.clsDuringTimeout)), allPositionsPass: true, status: "PASS" };
}

function withinViewport(box, view, topInset = 0) {
  return box && box.display !== "none" && box.visibility !== "hidden" && box.opacity >= 0.99 && box.left >= -1 && box.right <= view.width + 1 && box.top >= topInset - 1 && box.bottom <= view.height + 1;
}

async function captureSettledResponsive(browser, options, view, panels) {
  const context = await browser.newContext(contextOptions(view));
  const page = await context.newPage();
  const diagnostics = await observePage(page);
  await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(page, options.timeoutMs);
  const initial = await runtimeState(page);
  await page.evaluate((y) => window.scrollTo(0, y), initial.settledY);
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-cinematic-phase") === "settled", null, { timeout: 5_000 });
  await twoFrames(page);
  const settled = await runtimeState(page);
  const image = await screenshot(page);
  const topInset = settled.header?.bottom ?? 0;
  const routes = settled.entry.routes;
  const routeOverlap = routes.length === 2 && !(routes[0].right <= routes[1].left || routes[1].right <= routes[0].left || routes[0].bottom <= routes[1].top || routes[1].bottom <= routes[0].top);
  const checks = {
    correctFamily: settled.mediaFamily === view.family,
    settledPhase: settled.phase === "settled",
    completeH1: settled.entry.h1Text?.replace(/\s+/g, " ").toUpperCase() === "WHERE DO YOU ENTER?" && withinViewport(settled.entry.h1, view, topInset),
    exactlyTwoRoutes: routes.length === 2 && routes.every((box) => withinViewport(box, view, topInset)),
    routesDoNotOverlap: !routeOverlap,
    chromeReleased: settled.headerMode === "released" && settled.header?.opacity >= 0.99,
    noHorizontalOverflow: !settled.horizontalOverflow,
  };
  if (Object.values(checks).some((passed) => !passed)) throw new Error(`${view.id} settled ENTRY failed: ${JSON.stringify({ checks, settled })}`);
  const sheet = view.id === "landscape-844x390" ? "10-landscape-844x390" : SHORT_LANDSCAPE_IDS.includes(view.id) ? "11-short-landscape-neighbors" : view.id === "narrow-320x800" ? "09-physical-dom-continuity" : "07-desktop-production";
  addPanel(panels, sheet, image, `${view.width} × ${view.height} · SETTLED ENTRY`, [`family ${settled.mediaFamily}`, "H1 + 2 routes complete", "chrome released"]);
  const inventory = requestInventory(diagnostics, settled, options.authorities.manifest, options.manifestUrlPath, view.family);
  await context.close();
  return { viewpoint: view, initial, settled, checks, requestInventory: inventory, screenshot: { bytes: image.length, sha256: sha256(image) }, status: "PASS" };
}

async function captureResponsiveQa(browser, options, panels) {
  const selected = VIEWPOINTS.filter((item) => SHORT_LANDSCAPE_IDS.includes(item.id) || ["narrow-320x800", "tablet-768x1024", "desktop-1440x900"].includes(item.id));
  const settled = [];
  for (const view of selected) settled.push(await captureSettledResponsive(browser, options, view, panels));
  const journeys = [];
  for (const id of ["narrow-320x800", "tablet-768x1024"]) {
    const view = viewpoint(id);
    const context = await browser.newContext(contextOptions(view));
    const page = await context.newPage();
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settleEnhanced(page, options.timeoutMs);
    const milestones = [];
    for (const frame of [1, 76, 166, 225, ARRIVAL_FRAME, STABLE_Q_FRAME, 450, 500, 540]) {
      if (frame === STABLE_Q_FRAME) {
        await scrollToFrame(page, ARRIVAL_FRAME);
        await waitStableQ(page, options.timeoutMs);
      } else if (frame === FRAME_COUNT) {
        const settledY = (await runtimeState(page)).settledY;
        await page.evaluate((y) => window.scrollTo(0, y), settledY);
        await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-cinematic-phase") === "settled", null, { timeout: 5_000 });
        await twoFrames(page);
      } else await scrollToFrame(page, frame, { presented: frame <= PHYSICAL_FRAME_COUNT, timeoutMs: 8_000 });
      const state = await runtimeState(page);
      const image = await screenshot(page);
      milestones.push({ frame, state, screenshot: { bytes: image.length, sha256: sha256(image) } });
      if ([1, ARRIVAL_FRAME, STABLE_Q_FRAME, 500, 540].includes(frame)) addPanel(panels, "09-physical-dom-continuity", image, `${view.width} × ${view.height} · F${frame}`, [`phase ${state.phase}`, `family ${state.mediaFamily}`]);
    }
    const byFrame = new Map(milestones.map((item) => [item.frame, item.state]));
    const journeyChecks = {
      correctFamilyThroughout: milestones.every((item) => item.state.mediaFamily === view.family),
      noHorizontalOverflow: milestones.every((item) => !item.state.horizontalOverflow),
      dormantTop: byFrame.get(1)?.conceptualFrame === 1 && byFrame.get(1)?.presentedFrame === 1 && byFrame.get(1)?.headerMode === "concealed",
      arrivalDelivered: byFrame.get(ARRIVAL_FRAME)?.conceptualFrame === ARRIVAL_FRAME && byFrame.get(ARRIVAL_FRAME)?.presentedFrame >= ARRIVAL_FRAME,
      automaticStableQ: byFrame.get(STABLE_Q_FRAME)?.reactionState === "stable-hold" && byFrame.get(STABLE_Q_FRAME)?.presentedFrame >= STABLE_Q_FRAME,
      physicalThreshold: byFrame.get(PHYSICAL_FRAME_COUNT)?.phase === "physical" && byFrame.get(PHYSICAL_FRAME_COUNT)?.presentedFrame >= PHYSICAL_FRAME_COUNT,
      settledEntry: byFrame.get(FRAME_COUNT)?.phase === "settled" && byFrame.get(FRAME_COUNT)?.headerMode === "released" && byFrame.get(FRAME_COUNT)?.semanticProgress >= 0.99,
    };
    if (Object.values(journeyChecks).some((passed) => !passed)) throw new Error(`${view.id} full physical/DOM journey failed: ${JSON.stringify(journeyChecks)}`);
    journeys.push({ viewpoint: view, milestones, checks: journeyChecks, status: "PASS" });
    await context.close();
  }
  const portal = await capturePortalQa(browser, options, panels);
  return { settled, journeys, portal, shortLandscapeCount: settled.filter((item) => SHORT_LANDSCAPE_IDS.includes(item.viewpoint.id)).length, status: "PASS" };
}

async function capturePortalQa(browser, options, panels) {
  const view = viewpoint("desktop-1440x900");
  const context = await browser.newContext(contextOptions(view));
  const page = await context.newPage();
  await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(page, options.timeoutMs);
  const states = [];
  for (const frame of [1, 76, 166, 225, STABLE_Q_FRAME, 450, 500, 501, 507, 513, 522, 540]) {
    if (frame === STABLE_Q_FRAME) {
      await scrollToFrame(page, ARRIVAL_FRAME);
      await waitStableQ(page, options.timeoutMs);
    } else if (frame === FRAME_COUNT) {
      const settledY = (await runtimeState(page)).settledY;
      await page.evaluate((y) => window.scrollTo(0, y), settledY);
      await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-cinematic-phase") === "settled", null, { timeout: 5_000 });
      await twoFrames(page);
    } else await scrollToFrame(page, frame, { presented: frame <= PHYSICAL_FRAME_COUNT, timeoutMs: 8_000 });
    const state = await runtimeState(page);
    const image = await screenshot(page);
    states.push({ frame, state, screenshot: { bytes: image.length, sha256: sha256(image) } });
    if ([1, 76, 166, 225, STABLE_Q_FRAME, 450].includes(frame)) addPanel(panels, "07-desktop-production", image, `DESKTOP · F${frame}`, [`phase ${state.phase}`, `presented F${state.presentedFrame}`]);
    if ([500, 501, 507, 513, 522, 540].includes(frame)) addPanel(panels, "08-portal", image, `PORTAL · F${frame}`, [`phase ${state.phase}`, `semantic ${state.semanticProgress}`]);
    if ([500, 513, 540].includes(frame)) addPanel(panels, "09-physical-dom-continuity", image, `DESKTOP · F${frame}`, [frame === 500 ? "physical threshold" : frame === 513 ? "black/ENTRY boundary" : "settled semantic ENTRY"]);
  }
  const timeline = portalTimelineResult(states);
  if (!timeline.pass) throw new Error(`portal/threshold timeline failed: ${JSON.stringify(timeline)}`);
  await context.close();
  return { states, checks: timeline.checks, status: "PASS" };
}

export function portalTimelineResult(states) {
  const byFrame = new Map(states.map((item) => [item.frame, item.state]));
  const frame = (value) => byFrame.get(value) ?? {};
  const f500 = frame(500);
  const f501 = frame(BLACK_START_FRAME);
  const f507 = frame(507);
  const f513 = frame(ENTRY_START_FRAME - 1);
  const f522 = frame(522);
  const f540 = frame(FRAME_COUNT);
  const checks = {
    requestedFramesActuallyReached: states.every((item) => item.frame === STABLE_Q_FRAME
      ? item.state.presentedFrame >= STABLE_Q_FRAME && item.state.conceptualFrame === ARRIVAL_FRAME
      : Math.abs((item.state.conceptualFrame ?? -1) - item.frame) <= 1),
    physicalThresholdAtF500: f500.phase === "physical" && f500.targetFrame === PHYSICAL_FRAME_COUNT && f500.presentedFrame >= PHYSICAL_FRAME_COUNT,
    blackBeginsAtF501: f501.phase === "black" && f501.blackProgress === 1 && f501.semanticProgress === 0 && f501.blackBreath <= 0.25,
    thirteenFrameBreathingPeak: f507.phase === "black" && f507.blackProgress === 1 && f507.semanticProgress === 0 && f507.blackBreath >= 0.75,
    breathingEndsBeforeEntry: f513.phase === "black" && f513.semanticProgress === 0 && f513.blackBreath <= 0.25,
    gradualSemanticEntry: f522.phase === "entry" && f522.semanticProgress > 0 && f522.semanticProgress < 1,
    settledEntryAtF540: f540.phase === "settled" && f540.semanticProgress >= 0.99 && f540.headerMode === "released",
    chromeConcealedUntilSettled: states.filter((item) => item.frame < FRAME_COUNT).every((item) => item.state.headerMode === "concealed"),
  };
  return { constants: { blackStartFrame: BLACK_START_FRAME, entryStartFrame: ENTRY_START_FRAME, blackBeatFrameCount: BLACK_BEAT_FRAME_COUNT }, checks, pass: Object.values(checks).every(Boolean) };
}

async function waitStaticOrFailure(page, timeoutMs) {
  await page.waitForFunction(() => {
    const mode = document.documentElement.dataset.cinematicMode;
    const mediaState = document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state");
    return mode === "static" || mediaState === "failed-preserve-runway";
  }, null, { timeout: timeoutMs });
  await twoFrames(page);
}

async function exerciseUnlockedWheelScroll(page) {
  const before = await runtimeState(page);
  const direction = before.scrollY < before.maximumScrollY - 120 ? 1 : -1;
  await page.mouse.wheel(0, direction * 180);
  await page.waitForFunction(({ beforeY, direction }) => direction > 0 ? scrollY > beforeY + 1 : scrollY < beforeY - 1, { beforeY: before.scrollY, direction }, { timeout: 2_000 });
  await twoFrames(page);
  const after = await runtimeState(page);
  return { beforeScrollY: before.scrollY, afterScrollY: after.scrollY, requestedDelta: direction * 180, observedDelta: after.scrollY - before.scrollY, pass: direction > 0 ? after.scrollY > before.scrollY + 1 : after.scrollY < before.scrollY - 1 };
}

async function captureFallbackAccessibility(browser, options, panels) {
  const desktop = viewpoint("desktop-1440x900");

  const reducedContext = await browser.newContext(contextOptions(desktop, { reducedMotion: "reduce" }));
  const reducedPage = await reducedContext.newPage();
  const reducedDiagnostics = await observePage(reducedPage);
  await reducedPage.goto(options.url, { waitUntil: "load", timeout: options.timeoutMs });
  await reducedPage.waitForFunction(() => document.documentElement.dataset.cinematicMode === "static", null, { timeout: options.timeoutMs });
  const reduced = await reducedPage.evaluate(() => ({ mode: document.documentElement.dataset.cinematicMode, videos: document.querySelectorAll("video").length, activeSources: [...document.querySelectorAll("video")].filter((video) => video.currentSrc || video.src || video.querySelector("source[src]")).length, skipPresent: Boolean(document.querySelector('a[href="#entry"]')), entryPresent: Boolean(document.querySelector("#entry")), overflow: document.documentElement.scrollWidth > innerWidth + 2 }));
  const reducedImage = await screenshot(reducedPage);
  addPanel(panels, "14-reduced-motion", reducedImage, "REDUCED MOTION", [`mode ${reduced.mode}`, `${reduced.activeSources} active sources`, "semantic ENTRY present"]);
  if (reduced.mode !== "static" || reduced.activeSources !== 0 || reducedDiagnostics.requests.some((item) => /\.(?:mp4|webm)$/i.test(item.path)) || !reduced.skipPresent || !reduced.entryPresent || reduced.overflow) throw new Error("reduced-motion fallback failed");
  await reducedContext.close();

  const lateMotionContext = await browser.newContext(contextOptions(desktop));
  await lateMotionContext.addInitScript(timeoutInitScript);
  const lateMotionPage = await lateMotionContext.newPage();
  await lateMotionPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(lateMotionPage, options.timeoutMs);
  await scrollToFrame(lateMotionPage, 166, { presented: true });
  const lateMotionBefore = await runtimeState(lateMotionPage);
  const lateMotionBeforeCls = await lateMotionPage.evaluate(() => (window.__phase4r21TimeoutMetrics?.layoutShifts ?? []).reduce((sum, item) => sum + item.value, 0));
  const lateMotionBeforeImage = await screenshot(lateMotionPage);
  await lateMotionPage.emulateMedia({ reducedMotion: "reduce" });
  await lateMotionPage.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "failed-preserve-runway", null, { timeout: 5_000 });
  await twoFrames(lateMotionPage);
  const lateMotionAfter = await runtimeState(lateMotionPage);
  const lateMotionAfterCls = await lateMotionPage.evaluate(() => (window.__phase4r21TimeoutMetrics?.layoutShifts ?? []).reduce((sum, item) => sum + item.value, 0));
  const lateMotionGeometry = timeoutGeometryResult(lateMotionBefore, lateMotionAfter, lateMotionAfterCls - lateMotionBeforeCls);
  const lateMotionUnlockedScroll = await exerciseUnlockedWheelScroll(lateMotionPage);
  const lateMotionAfterImage = await screenshot(lateMotionPage);
  addPanel(panels, "14-reduced-motion", lateMotionBeforeImage, "LATE PREFERENCE · BEFORE", ["enhanced runway committed", `F${lateMotionBefore.presentedFrame}`, `scrollY ${lateMotionBefore.scrollY.toFixed(1)}`]);
  addPanel(panels, "14-reduced-motion", lateMotionAfterImage, "LATE PREFERENCE · PRESERVE RUNWAY", [`height Δ ${lateMotionGeometry.geometry.documentHeightDelta}px`, `scroll Δ ${lateMotionGeometry.geometry.scrollYDelta.toFixed(2)}px`, `CLS ${lateMotionGeometry.geometry.clsDuringTimeout.toFixed(6)}`]);
  if (!lateMotionGeometry.pass || lateMotionAfter.fallback !== "reduced-motion-change" || !lateMotionUnlockedScroll.pass) throw new Error(`late reduced-motion failure did not preserve enhanced geometry: ${JSON.stringify({ lateMotionGeometry, lateMotionUnlockedScroll, fallback: lateMotionAfter.fallback })}`);
  await lateMotionContext.close();

  const noJsContext = await browser.newContext(contextOptions(desktop, { javaScriptEnabled: false }));
  const noJsPage = await noJsContext.newPage();
  await noJsPage.goto(options.url, { waitUntil: "load", timeout: options.timeoutMs });
  const noJavaScript = await noJsPage.evaluate(() => ({ videos: document.querySelectorAll("video").length, activeSources: [...document.querySelectorAll("video")].filter((video) => video.currentSrc || video.src || video.querySelector("source[src]")).length, entryPresent: Boolean(document.querySelector("#entry")), skipPresent: Boolean(document.querySelector('a[href="#entry"]')), overflow: document.documentElement.scrollWidth > innerWidth + 2 }));
  const noJsImage = await screenshot(noJsPage);
  addPanel(panels, "15-no-javascript", noJsImage, "NO JAVASCRIPT", [`${noJavaScript.activeSources} active sources`, "semantic ENTRY present", "native document flow"]);
  if (noJavaScript.activeSources !== 0 || !noJavaScript.entryPresent || !noJavaScript.skipPresent || noJavaScript.overflow) throw new Error("no-JavaScript fallback failed");
  await noJsContext.close();

  // Chromium headless ignores browser chrome zoom shortcuts and
  // Emulation.setPageScaleFactor performs pinch zoom without layout reflow.
  // A half-sized CSS viewport at DPR 2 is the deterministic 200% reflow
  // equivalent: the captured physical surface remains 1440x900 while the
  // document must lay out into 720x450 CSS pixels.
  const zoomView = { id: "desktop-200-percent-reflow", width: 720, height: 450, family: "landscape" };
  const zoomContext = await browser.newContext(contextOptions(zoomView, { deviceScaleFactor: 2, screen: { width: 1440, height: 900 } }));
  const zoomPage = await zoomContext.newPage();
  await zoomPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(zoomPage, options.timeoutMs);
  const zoomInitial = await runtimeState(zoomPage);
  await zoomPage.evaluate((y) => window.scrollTo(0, y), zoomInitial.settledY);
  await twoFrames(zoomPage);
  const zoom200 = await zoomPage.evaluate(() => ({ method: "half CSS viewport + DPR 2 reflow equivalence", effectivePercent: 200, layoutViewport: { width: innerWidth, height: innerHeight }, devicePixelRatio, physicalCapture: { width: innerWidth * devicePixelRatio, height: innerHeight * devicePixelRatio }, overflow: document.documentElement.scrollWidth > innerWidth + 2, entryPresent: Boolean(document.querySelector("#entry")), headingsPresent: document.querySelectorAll("h1,h2,h3").length }));
  const zoomImage = await screenshot(zoomPage);
  addPanel(panels, "16-zoom-200", zoomImage, "200% REFLOW EQUIVALENT", [`${zoom200.layoutViewport.width} × ${zoom200.layoutViewport.height} CSS @ DPR ${zoom200.devicePixelRatio}`, `${zoom200.physicalCapture.width} × ${zoom200.physicalCapture.height} physical capture`, "ENTRY present · no horizontal overflow"]);
  if (zoom200.effectivePercent !== 200 || zoom200.devicePixelRatio !== 2 || zoom200.layoutViewport.width !== 720 || zoom200.layoutViewport.height !== 450 || zoom200.physicalCapture.width !== 1440 || zoom200.physicalCapture.height !== 900 || zoom200.overflow || !zoom200.entryPresent || zoom200.headingsPresent < 7) throw new Error("200% reflow-equivalent regression failed");
  await zoomContext.close();

  const skipContext = await browser.newContext(contextOptions(desktop));
  const skipPage = await skipContext.newPage();
  await skipPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(skipPage, options.timeoutMs);
  await skipPage.keyboard.press("Tab");
  const focusedHref = await skipPage.evaluate(() => document.activeElement?.getAttribute("href"));
  await skipPage.keyboard.press("Enter");
  await twoFrames(skipPage);
  const skip = await skipPage.evaluate(() => ({ hash: location.hash, entryFocused: document.activeElement?.id === "entry" || Boolean(document.querySelector("#entry")?.contains(document.activeElement)), scrollY }));
  if (focusedHref !== "#entry" || skip.hash !== "#entry" || !skip.entryFocused) throw new Error("skip-intro focus/activation failed");
  await skipContext.close();

  const accessibilityContext = await browser.newContext(contextOptions(desktop));
  const accessibilityPage = await accessibilityContext.newPage();
  await accessibilityPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(accessibilityPage, options.timeoutMs);
  const settledY = (await runtimeState(accessibilityPage)).settledY;
  await accessibilityPage.evaluate((y) => window.scrollTo(0, y), settledY);
  await twoFrames(accessibilityPage);
  await accessibilityPage.addScriptTag({ content: axeCore.source });
  const axe = await accessibilityPage.evaluate(async () => {
    const result = await window.axe.run(document.documentElement, { resultTypes: ["violations"] });
    return { violations: result.violations.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length, help: item.help })), seriousOrCritical: result.violations.filter((item) => ["serious", "critical"].includes(item.impact)).length };
  });
  const semantic = await accessibilityPage.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, mainCount: document.querySelectorAll("main").length, h1Count: document.querySelectorAll("h1").length, duplicateIds: [...document.querySelectorAll("[id]")].map((node) => node.id).filter((id, index, all) => all.indexOf(id) !== index), unlabeledControls: [...document.querySelectorAll("button,input,select,textarea")].filter((node) => !node.getAttribute("aria-label") && !node.getAttribute("aria-labelledby") && !(node.textContent || "").trim()).length }));
  if (axe.seriousOrCritical !== 0 || semantic.mainCount !== 1 || semantic.h1Count !== 1 || semantic.duplicateIds.length || semantic.unlabeledControls) throw new Error(`accessibility regression failed: ${JSON.stringify({ axe, semantic })}`);

  const initialChromeContext = await browser.newContext(contextOptions(desktop));
  const chromePage = await initialChromeContext.newPage();
  await chromePage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(chromePage, options.timeoutMs);
  const chromeInitial = await runtimeState(chromePage);
  const initialImage = await screenshot(chromePage);
  await chromePage.evaluate((y) => window.scrollTo(0, y), chromeInitial.settledY);
  await twoFrames(chromePage);
  const chromeSettled = await runtimeState(chromePage);
  const settledImage = await screenshot(chromePage);
  await chromePage.evaluate(() => window.scrollTo(0, 0));
  await pageWait(chromePage, 900);
  const chromeReverse = await runtimeState(chromePage);
  const reverseImage = await screenshot(chromePage);
  addPanel(panels, "13-chrome-visibility", initialImage, "DORMANCY · CHROME CONCEALED", [`header ${chromeInitial.headerMode}`, `opacity ${chromeInitial.header?.opacity}`]);
  addPanel(panels, "13-chrome-visibility", settledImage, "SETTLED · CHROME RELEASED", [`header ${chromeSettled.headerMode}`, `opacity ${chromeSettled.header?.opacity}`]);
  addPanel(panels, "13-chrome-visibility", reverseImage, "REVERSE · CHROME CONCEALED", [`header ${chromeReverse.headerMode}`, `opacity ${chromeReverse.header?.opacity}`]);
  if (chromeInitial.headerMode !== "concealed" || chromeSettled.headerMode !== "released" || chromeReverse.headerMode !== "concealed") throw new Error("chrome suppression/release regression failed");
  await initialChromeContext.close();

  const deepContext = await browser.newContext(contextOptions(desktop));
  const deepPage = await deepContext.newPage();
  await deepPage.goto(new URL("#entry", options.url).toString(), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  const directDeepLink = await deepPage.evaluate(() => ({ hash: location.hash, mode: document.documentElement.dataset.cinematicMode ?? null, entryPresent: Boolean(document.querySelector("#entry")) }));
  if (directDeepLink.hash !== "#entry" || directDeepLink.mode === "enhanced" || !directDeepLink.entryPresent) throw new Error("direct #entry deep link failed");
  await deepPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(deepPage, options.timeoutMs);
  await scrollToFrame(deepPage, ARRIVAL_FRAME);
  await waitStableQ(deepPage, options.timeoutMs);
  const beforeRestorationReload = await runtimeState(deepPage);
  await deepPage.reload({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(deepPage, options.timeoutMs, { resetScroll: false });
  await deepPage.waitForFunction((arrival) => (window.quantumPhase4?.presentedFrame ?? 0) >= arrival && window.quantumPhase4?.reactionState !== "pre-arrival", ARRIVAL_FRAME, { timeout: 5_000 });
  const restoration = await runtimeState(deepPage);
  if (restoration.presentedFrame < ARRIVAL_FRAME || restoration.reactionState === "pre-arrival" || Math.abs(restoration.scrollY - beforeRestorationReload.scrollY) > 1) throw new Error("reload/history state replayed dormancy or lost restored scroll position");
  await deepContext.close();

  const mediaFailures = [];
  const desktopVideoAsset = options.authorities.manifest.assets.find((asset) => asset.kind === "video" && asset.family === "desktop");
  if (!desktopVideoAsset || !Number.isSafeInteger(desktopVideoAsset.bytes) || desktopVideoAsset.bytes <= 0) throw new Error("desktop decode-failure fixture lacks an exact active asset size");
  for (const kind of ["unsupported", "404", "abort", "decode"]) {
    const context = await browser.newContext(contextOptions(desktop));
    if (kind === "unsupported") await context.addInitScript(() => { const original = HTMLMediaElement.prototype.canPlayType; HTMLMediaElement.prototype.canPlayType = function (type) { return /video\//.test(type) ? "" : original.call(this, type); }; });
    else await context.route((url) => url.pathname.endsWith(".mp4") && /phase-4r2/i.test(url.pathname), async (route) => {
      if (kind === "404") return route.fulfill({ status: 404, body: "not found" });
      if (kind === "abort") return route.abort("failed");
      // Match the manifest byte contract so the runtime reaches the actual
      // decoder error path rather than failing early on Blob-size validation.
      return route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.alloc(desktopVideoAsset.bytes, 0) });
    });
    const page = await context.newPage();
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await waitStaticOrFailure(page, options.timeoutMs);
    const state = await runtimeState(page);
    const unlockedScroll = await exerciseUnlockedWheelScroll(page);
    const preservedVisual = state.mode !== "enhanced" || Boolean(state.mediaState === "failed-preserve-runway" && state.poster?.sourcePath && state.poster.box?.opacity >= 0.99 && state.video?.hasSource === false && (state.blobLifecycle?.live ?? 0) === 0);
    const checks = { failedOpen: state.mode === "static" || state.mediaState === "failed-preserve-runway", lateFailuresPreserveRunwayPoster: kind === "unsupported" ? state.mode === "static" || preservedVisual : state.mode === "enhanced" && preservedVisual, actualDecodePathReached: kind !== "decode" || (state.blobLifecycle?.created === 1 && state.blobLifecycle?.revoked === 1 && state.blobLifecycle?.live === 0), semanticEntryPresent: Boolean(state.entry.box), pageUsable: state.documentHeight > 0, noScrollLock: unlockedScroll.pass };
    if (Object.values(checks).some((passed) => !passed)) throw new Error(`${kind} media failure failed open`);
    mediaFailures.push({ kind, state, unlockedScroll, checks, status: "PASS" });
    await context.close();
  }

  const safariMaybeContext = await browser.newContext(contextOptions(desktop));
  await safariMaybeContext.addInitScript(() => {
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) {
      return /video\/mp4/i.test(type) ? "maybe" : original.call(this, type);
    };
  });
  const safariMaybePage = await safariMaybeContext.newPage();
  const safariMaybeDiagnostics = await observePage(safariMaybePage);
  await safariMaybePage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(safariMaybePage, options.timeoutMs);
  const safariMaybeState = await runtimeState(safariMaybePage);
  const safariMaybeInventory = requestInventory(safariMaybeDiagnostics, safariMaybeState, options.authorities.manifest, options.manifestUrlPath, "desktop");
  const safariStyleSelectionLogic = {
    maybeSupport: { enhanced: safariMaybeState.mode === "enhanced" && safariMaybeState.mediaReady, requestInventory: safariMaybeInventory },
    emptySupport: { failedOpen: mediaFailures.find((item) => item.kind === "unsupported")?.checks?.failedOpen === true },
    fullWebKitExecutionClaimed: false,
  };
  safariStyleSelectionLogic.status = safariStyleSelectionLogic.maybeSupport.enhanced && safariStyleSelectionLogic.emptySupport.failedOpen ? "PASS" : "FAIL";
  if (safariStyleSelectionLogic.status !== "PASS") throw new Error(`Safari-style H.264 selection logic failed: ${JSON.stringify(safariStyleSelectionLogic)}`);
  await safariMaybeContext.close();

  const pendingContext = await browser.newContext(contextOptions(desktop));
  await pendingContext.route((url) => url.pathname.endsWith(".mp4") && /phase-4r2/i.test(url.pathname), async (route) => { await new Promise((resolve) => setTimeout(resolve, 3_000)); await route.abort("timedout").catch(() => {}); });
  const pendingPage = await pendingContext.newPage();
  await pendingPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await pendingPage.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "loading", null, { timeout: 8_000 });
  const pendingStart = await runtimeState(pendingPage);
  await pendingPage.evaluate((y) => window.scrollTo(0, y), pendingStart.settledY);
  await twoFrames(pendingPage);
  const pendingOutrun = await runtimeState(pendingPage);
  await waitStaticOrFailure(pendingPage, options.timeoutMs);
  const pendingTerminal = await runtimeState(pendingPage);
  const pendingUnlockedScroll = await exerciseUnlockedWheelScroll(pendingPage);
  if (pendingOutrun.phase !== "settled" || pendingOutrun.scrollY <= 0 || pendingTerminal.mode !== "enhanced" || pendingTerminal.mediaState !== "failed-preserve-runway" || pendingTerminal.documentHeight !== pendingOutrun.documentHeight || !pendingTerminal.poster?.sourcePath || pendingTerminal.poster.box?.opacity < 0.99 || !pendingUnlockedScroll.pass) throw new Error("media-pending arrival/semantic outrun trapped scroll or lost stable poster/runway");
  await pendingContext.close();

  const supportingRoutes = [];
  for (const route of SUPPORTING_ROUTES) {
    const response = await fetch(new URL(route, options.url), { signal: AbortSignal.timeout(options.timeoutMs) });
    const text = await response.text();
    const cinematicReferences = (text.match(/media\/cinematic\/phase-4r2/gi) ?? []).length;
    if (![200, 404].includes(response.status) || cinematicReferences !== 0) throw new Error(`supporting route regression failed: ${route}`);
    supportingRoutes.push({ route, httpStatus: response.status, cinematicReferences, status: "PASS" });
  }
  const real404Response = await fetch(new URL("/__phase4r21_missing_authority__/", options.url), { signal: AbortSignal.timeout(options.timeoutMs) });
  const real404 = { status: real404Response.status, pass: real404Response.status === 404 };
  if (!real404.pass) throw new Error("real 404 route did not return HTTP 404");

  const operatingField = await accessibilityPage.evaluate(() => ({ chapters: [...document.querySelectorAll("[data-home-scene]")].map((node) => ({ id: node.getAttribute("data-home-scene"), heading: node.querySelector("h1,h2,h3")?.textContent?.trim() ?? null })), operatingFieldMode: document.documentElement.dataset.operatingField ?? null, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2 }));
  const operatingChapterIds = ["built-with-industry", "method", "industries", "proof", "programmes", "conversion"];
  const observedOperatingIds = operatingField.chapters.map((item) => item.id);
  if (operatingField.horizontalOverflow || operatingChapterIds.some((id) => !observedOperatingIds.includes(id)) || operatingField.chapters.filter((item) => operatingChapterIds.includes(item.id)).some((item) => !item.heading)) throw new Error(`Operating Field browser topology differs: ${JSON.stringify(operatingField)}`);
  for (const chapterId of operatingChapterIds) {
    const y = await chapterScrollY(accessibilityPage, chapterId);
    await accessibilityPage.evaluate((target) => window.scrollTo(0, target), y);
    await twoFrames(accessibilityPage);
    const image = await screenshot(accessibilityPage);
    const heading = operatingField.chapters.find((item) => item.id === chapterId)?.heading ?? chapterId;
    addPanel(panels, "17-operating-field-regression", image, `OPERATING FIELD · ${heading.toUpperCase()}`, ["accepted component source frozen", "native document scroll", "no horizontal overflow"]);
  }
  await accessibilityContext.close();

  return {
    reducedMotion: { earlyStatic: { ...reduced, videoRequests: 0 }, latePreferenceChange: { before: lateMotionBefore, after: lateMotionAfter, geometry: lateMotionGeometry, unlockedScroll: lateMotionUnlockedScroll }, status: "PASS" },
    noJavaScript: { ...noJavaScript, status: "PASS" },
    zoom200: { ...zoom200, status: "PASS" },
    skip: { focusedHref, ...skip, status: "PASS" },
    accessibility: { axe, semantic, status: "PASS" },
    chrome: { initial: chromeInitial, settled: chromeSettled, reverse: chromeReverse, status: "PASS" },
    directDeepLink: { ...directDeepLink, status: "PASS" },
    restoration: { state: restoration, status: "PASS" },
    mediaFailures,
    mediaPending: { start: pendingStart, outrun: pendingOutrun, terminal: pendingTerminal, unlockedScroll: pendingUnlockedScroll, status: "PASS" },
    supportingRoutes,
    real404,
    safariStyleSelectionLogic,
    operatingField,
    status: "PASS",
  };
}

async function pageWait(page, milliseconds) {
  await page.waitForTimeout(milliseconds);
  await twoFrames(page);
}

async function performanceSnapshot(page, startedAt, diagnostics) {
  return page.evaluate(({ startedAt, requestCount, blobRequests }) => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    return {
      elapsedToSnapshotMs: Date.now() - startedAt,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      loadEventMs: navigation?.loadEventEnd ?? null,
      transferBytes: resources.reduce((sum, item) => sum + (item.transferSize || 0), 0),
      decodedBodyBytes: resources.reduce((sum, item) => sum + (item.decodedBodySize || 0), 0),
      resourceCount: resources.length,
      requestCount,
      blobRequests,
      heap: performance.memory ? { usedJsHeapBytes: performance.memory.usedJSHeapSize, limitBytes: performance.memory.jsHeapSizeLimit } : { available: false },
    };
  }, { startedAt, requestCount: diagnostics.requests.length, blobRequests: diagnostics.blobRequests });
}

async function captureNetworkPerformance(browser, options, manifest) {
  const desktop = viewpoint("desktop-1440x900");
  const context = await browser.newContext(contextOptions(desktop));
  const page = await context.newPage();
  const diagnostics = await observePage(page);
  const coldStarted = Date.now();
  await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(page, options.timeoutMs);
  const coldState = await runtimeState(page);
  const cold = { metrics: await performanceSnapshot(page, coldStarted, diagnostics), state: coldState, requestInventory: requestInventory(diagnostics, coldState, manifest, options.manifestUrlPath, "desktop"), status: "PASS" };
  const beforeWarmRequests = diagnostics.requests.length;
  const beforeWarmBlobRequests = diagnostics.blobRequests;
  const warmStarted = Date.now();
  await page.reload({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(page, options.timeoutMs);
  const warmState = await runtimeState(page);
  const warmDiagnostics = { ...diagnostics, requests: diagnostics.requests.slice(beforeWarmRequests), blobRequests: Math.max(0, diagnostics.blobRequests - beforeWarmBlobRequests) };
  const warm = { metrics: await performanceSnapshot(page, warmStarted, warmDiagnostics), state: warmState, requestInventory: requestInventory(warmDiagnostics, warmState, manifest, options.manifestUrlPath, "desktop"), status: "PASS" };
  await context.close();

  const constrainedContext = await browser.newContext(contextOptions(desktop));
  const constrainedPage = await constrainedContext.newPage();
  const constrainedDiagnostics = await observePage(constrainedPage);
  const session = await constrainedContext.newCDPSession(constrainedPage);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  await session.send("Network.emulateNetworkConditions", { offline: false, latency: 200, downloadThroughput: 250_000, uploadThroughput: 250_000 });
  const constrainedStarted = Date.now();
  await constrainedPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await constrainedPage.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced", null, { timeout: 8_000 });
  const initial = await runtimeState(constrainedPage);
  await constrainedPage.evaluate((y) => window.scrollTo(0, y), initial.settledY);
  await twoFrames(constrainedPage);
  const outrun = await runtimeState(constrainedPage);
  await constrainedPage.waitForFunction(() => window.quantumPhase4?.mediaReady === true || document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "failed-preserve-runway", null, { timeout: 25_000 });
  await twoFrames(constrainedPage);
  const terminal = await runtimeState(constrainedPage);
  const expectedConstrainedPath = expectedMediaPath(manifest, options.manifestUrlPath, "desktop");
  const constrainedVideoRequests = constrainedDiagnostics.requests.filter((item) => /\.(?:mp4|webm)$/i.test(item.path));
  const constrainedUniqueVideoPaths = [...new Set(constrainedVideoRequests.map((item) => item.path))];
  const constrained = {
    emulation: { throughputBitsPerSecond: 2_000_000, roundTripTimeMs: 200 },
    metrics: await performanceSnapshot(constrainedPage, constrainedStarted, constrainedDiagnostics),
    outrun,
    terminal,
    requestInventory: { expectedH264Path: expectedConstrainedPath, videoRequests: constrainedVideoRequests, uniqueVideoPaths: constrainedUniqueVideoPaths, blobLifecycle: terminal.blobLifecycle, videoElementCount: terminal.videoElements },
    checks: {
      nativeOutrun: outrun.phase === "settled",
      noScrollTrap: outrun.scrollY > 0,
      terminalUsable: terminal.mediaReady || terminal.mediaState === "failed-preserve-runway",
      geometryPreservedOnFailure: terminal.mediaReady || terminal.documentHeight === outrun.documentHeight,
      exactlyOneH264Request: constrainedVideoRequests.filter((item) => item.path.endsWith(".mp4")).length === 1,
      zeroVp9Requests: constrainedVideoRequests.every((item) => !item.path.endsWith(".webm")),
      exactExpectedFamilyPath: constrainedUniqueVideoPaths.length === 1 && constrainedUniqueVideoPaths[0] === expectedConstrainedPath,
      oneDecoderElement: terminal.videoElements === 1,
      atMostOneBlob: (terminal.blobLifecycle?.created ?? 0) <= 1,
    },
    status: "PASS",
  };
  if (Object.values(constrained.checks).some((passed) => !passed)) throw new Error(`constrained-network regression failed: ${JSON.stringify(constrained)}`);
  await constrainedContext.close();
  return { cold, warm, constrained, activeManifest: { sourceBlendSha256: manifest.sourceBlendSha256, assets: manifest.assets.map((item) => ({ kind: item.kind, family: item.family, codec: item.codec ?? null, file: item.file, bytes: item.bytes, sha256: item.sha256 })) }, status: "PASS" };
}

function recordingArtifact(record) {
  return { relativePath: record.relativePath, bytes: record.bytes, sha256: record.sha256, kind: "recording", id: record.id, gate: record.gate, viewpoint: record.viewpoint, expectedFrameCount: record.expectedFrameCount, minimumExpectedFrameCount: record.minimumExpectedFrameCount, minimumExpectedDurationSeconds: record.minimumExpectedDurationSeconds, media: record.media, durationValidation: record.durationValidation, fullDecodePass: record.fullDecodePass };
}

function recordingSummary(record) {
  return { id: record.id, gate: record.gate, kind: record.kind, viewpoint: record.viewpoint, relativePath: record.relativePath, bytes: record.bytes, sha256: record.sha256, expectedFrameCount: record.expectedFrameCount, minimumExpectedFrameCount: record.minimumExpectedFrameCount, minimumExpectedDurationSeconds: record.minimumExpectedDurationSeconds, media: record.media, durationValidation: record.durationValidation, fullDecodePass: record.fullDecodePass, states: record.states ?? null, checks: record.checks ?? null, position: record.position ?? null, status: record.status };
}

function sourceReportProjection(authorities) {
  return Object.fromEntries(Object.entries(authorities.reports).map(([id, value]) => [id, { basename: value.basename, bytes: value.bytes, sha256: value.sha256 }]));
}

function reportEnvelope(schema, generatedAt, target, data) {
  return { schema, status: "PASS", generatedAt, target, ...data, humanReviewGates: HUMAN_GATES, authorization: { humanAccepted: false, mainMerged: false, phase5Authorized: false } };
}

function manifestFixture(sourceSha256 = "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516") {
  const assets = [];
  for (const family of ["desktop", "portrait", "landscape"]) {
    assets.push({ kind: "video", family, codec: "h264", file: `media/phase-4r2-1-${family}-h264-aaaaaaaaaaaa.mp4`, bytes: 1, sha256: "a".repeat(64), frames: 500, fps: 30 });
    assets.push({ kind: "poster", family, file: `posters/phase-4r2-1-${family}-poster-bbbbbbbbbbbb.png`, bytes: 1, sha256: "b".repeat(64) });
  }
  return { schema: "quantum-hub.phase-4-r2.production-media-manifest.v1", status: "PASS", sourceBlendSha256: sourceSha256, physicalTimeline: { frames: 500, fps: 30 }, assets, deliveryPolicy: { h264Only: true, activeVideoCount: 3, activePosterCount: 3, inactiveCodecPayloadCount: 0 }, authorization: { mergeMain: false, phase5: false } };
}

async function selfTest() {
  assertInventoryContract();
  const sourceHash = "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516";
  const fixture = manifestFixture(sourceHash);
  validateActiveManifest(fixture, sourceHash);
  for (const corrupt of [
    (value) => value.assets.push({ ...value.assets[0], file: "media/extra.mp4" }),
    (value) => { value.assets[0].codec = "vp9"; value.assets[0].file = "media/active.webm"; },
    (value) => { value.deliveryPolicy.inactiveCodecPayloadCount = 1; },
    (value) => { value.sourceBlendSha256 = "c".repeat(64); },
  ]) {
    const invalid = structuredClone(fixture);
    corrupt(invalid);
    let rejected = false;
    try { validateActiveManifest(invalid, sourceHash); } catch { rejected = true; }
    if (!rejected) throw new Error("active-manifest negative self-test failed");
  }
  if (mediaUrlPath("/media/cinematic/phase-4r2/manifests/active.json", "media/family.mp4") !== "/media/cinematic/phase-4r2/media/family.mp4") throw new Error("public media path self-test failed");
  if (normalizeTargetUrl("http://127.0.0.1:4321/", "local") !== "http://127.0.0.1:4321/" || normalizeTargetUrl("https://12345678.qsite1.pages.dev/", "deployed") !== "https://12345678.qsite1.pages.dev/") throw new Error("target URL self-test failed");
  const before = { documentHeight: 10_000, scrollY: 2_000, chapter: "entry", chapterBox: { top: 0 }, entry: { box: { top: 0 } }, header: { top: 0 }, headerMode: "released" };
  const after = { ...structuredClone(before), mode: "enhanced", mediaState: "failed-preserve-runway", poster: { sourcePath: "/poster.png", box: { display: "block", visibility: "visible", opacity: 1, width: 100, height: 100 } }, video: { hasSource: false }, blobLifecycle: { live: 0 } };
  if (!timeoutGeometryResult(before, after, 0).pass || timeoutGeometryResult(before, { ...after, documentHeight: 5_000 }, 0).pass || timeoutGeometryResult(before, after, 0.1).pass) throw new Error("timeout geometry positive/negative self-test failed");
  if (visiblePixelChangeResult({ pixels: 1_000_000, changedPixelsAtLeast2: 24, maximumAbsoluteChannel: 2, meanAbsoluteMaximumChannel: 0.0001 }).visiblyChanged
    || !visiblePixelChangeResult({ pixels: 1_000_000, changedPixelsAtLeast2: 500, maximumAbsoluteChannel: 8, meanAbsoluteMaximumChannel: 0.01 }).visiblyChanged) throw new Error("visible pixel-change self-test failed");
  if (!recordingDurationResult({ frameCount: 300, durationSeconds: 10 }, 8).pass || recordingDurationResult({ frameCount: 2, durationSeconds: 2 / FPS }, 8).pass) throw new Error("recording duration self-test failed");
  if (Object.keys(REPORT_SCHEMAS).length !== 9 || new Set(Object.values(REPORT_SCHEMAS)).size !== 9) throw new Error("report schema inventory self-test failed");
  const source = await readFile(fileURLToPath(import.meta.url), "utf8");
  const priorDeploymentHost = ["b513", "942a.qsite1.pages.dev"].join("");
  if (source.includes(priorDeploymentHost) || /expectedManifestSha256:\s*["'][0-9a-f]{64}/.test(source)) throw new Error("final deployment/media authority was baked into capture tooling");
  process.stdout.write(stableJson({ schema: `${SCHEMA}.self-test`, status: "PASS", inventories: { viewpoints: VIEWPOINTS.length, firstInputCases: VIEWPOINTS.filter((item) => item.firstInput).length * FIRST_INPUT_PROBES.length, recordings: RECORDINGS.length, sheets: SHEETS.length, reports: 10, timeoutPositions: TIMEOUT_POSITIONS.length }, sourceAuthorityPassedViaCli: true, capturesPerformed: false }));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  if (options.selfTest) return selfTest();
  validateOptions(options);
  const authorities = await loadAuthorities(options);
  if (options.dryRun) {
    process.stdout.write(stableJson({ schema: `${SCHEMA}.dry-run`, status: "PASS", mode: options.mode, expectedHead: options.expectedHead, expectedBranch: options.expectedBranch, sourceBlendSha256: options.expectedSourceSha256, manifestSha256: options.expectedManifestSha256, inventories: { firstInputCases: 35, recordings: 17, sheets: 17, reports: 10, totalFiles: 44 }, browserLaunched: false, networkRequestsPerformed: false, writesPerformed: false }));
    return;
  }
  try { await stat(options.output); throw new Error("--output must not already exist"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const resolvedOutput = await resolveFromExistingAncestor(options.output);
  if (isWithin(ROOT, resolvedOutput) || isWithin(os.tmpdir(), resolvedOutput) || path.parse(resolvedOutput).root === resolvedOutput) throw new Error("resolved output is not a durable external directory");

  const captureStartedAt = new Date().toISOString();
  const [repository, deployment, publicAuthority, executablePath] = await Promise.all([
    repositoryAuthority(options),
    validateDeploymentReport(options, authorities.manifestBytes),
    verifyPublicAuthority(options, authorities.manifest, authorities.manifestBytes),
    resolveChromium(options.chromium),
  ]);
  if (!(await executable(options.ffmpeg)) || !(await executable(options.ffprobe))) throw new Error("FFmpeg/FFprobe are required for evidence recording normalization and decode audit");
  await mkdir(path.join(options.output, "recordings"), { recursive: true });
  await mkdir(path.join(options.output, "sheets"), { recursive: true });
  await mkdir(path.join(options.output, "reports"), { recursive: true });
  options.authorities = authorities;
  const panels = newPanels();
  const rawRoot = await mkdtemp(path.join(os.tmpdir(), "phase4r2-1-browser-recordings-"));
  const browser = await chromium.launch({ headless: true, executablePath, timeout: options.timeoutMs, args: ["--disable-extensions", "--disable-background-networking"] });
  let firstInput;
  let currentOrder;
  let standardRecordings;
  let timeout;
  let responsive;
  let fallback;
  let networkPerformance;
  try {
    firstInput = await captureFirstInputMatrix(browser, options, authorities.manifest, panels);
    currentOrder = await captureCurrentOrder(browser, options, authorities, panels);
    standardRecordings = [];
    for (const scenario of RECORDINGS.filter((item) => item.kind !== "timeout")) standardRecordings.push(await recordStandardScenario(browser, options, scenario, rawRoot, panels));
    timeout = await captureTimeoutMatrix(browser, options, rawRoot, panels);
    responsive = await captureResponsiveQa(browser, options, panels);
    fallback = await captureFallbackAccessibility(browser, options, panels);
    networkPerformance = await captureNetworkPerformance(browser, options, authorities.manifest);
  } finally {
    await browser.close().catch(() => {});
    await removeOwnedRawRecordingRoot(rawRoot);
  }

  const allRecordings = [...standardRecordings, ...timeout.recordings].sort((left, right) => left.id.localeCompare(right.id));
  if (allRecordings.length !== RECORDINGS.length || allRecordings.some((record, index) => record.id !== [...RECORDINGS].sort((a, b) => a.id.localeCompare(b.id))[index].id)) throw new Error("completed recording inventory differs from A-L contract");
  const recordingRecords = allRecordings.map(recordingArtifact);

  const sheetRecords = [];
  for (const definition of SHEETS) {
    const record = await createSheet(path.join(options.output, "sheets", `${definition.id}.png`), definition, panels.get(definition.id), `${options.expectedHead.slice(0, 12)} · ${options.mode === "deployed" ? "immutable Cloudflare" : "local predeployment"}`);
    sheetRecords.push(record);
  }
  if (sheetRecords.length !== 17) throw new Error("completed sheet inventory differs");

  const generatedAt = new Date().toISOString();
  const target = options.mode === "deployed"
    ? { mode: "deployed", immutableUrl: options.url, branchUrl: options.branchUrl, expectedHead: options.expectedHead, expectedBranch: options.expectedBranch }
    : { mode: "local", origin: "<LOCAL_PREVIEW>", expectedHead: options.expectedHead, expectedBranch: options.expectedBranch };
  const sourceReports = sourceReportProjection(authorities);
  const wakeRecordingAuthorities = allRecordings.filter((item) => ["C", "D", "E"].includes(item.gate));
  const wakeRecordings = wakeRecordingAuthorities.map(recordingSummary);
  const wakeByKind = new Map(wakeRecordingAuthorities.map((item) => [item.kind, item]));
  const automaticWakeChecks = {
    noInput: wakeByKind.get("wake-no-input")?.checks?.stableQ === true && wakeByKind.get("wake-no-input")?.checks?.unchangedScrollY === true && wakeByKind.get("wake-no-input")?.checks?.noInputScrollEvents === true && wakeByKind.get("wake-no-input")?.checks?.noWheelKeyOrTouchInput === true && wakeByKind.get("wake-no-input")?.checks?.authoredRateWithinTolerance === true,
    continueForward: wakeByKind.get("wake-continue")?.checks?.latestPositionWins === true && wakeByKind.get("wake-continue")?.checks?.noScrollLock === true,
    reverseIndicator: wakeByKind.get("wake-reverse-indicator")?.checks?.noStaleWake === true,
    reverseRaster: wakeByKind.get("wake-reverse-raster")?.checks?.noStaleWake === true,
    reverseAfterStableQ: wakeByKind.get("wake-reverse-after-q")?.checks?.coherentUnwind === true,
    reentry: wakeByKind.get("wake-reentry-reload")?.checks?.secondCrossingStable === true,
    reloadAtOrAfterArrival: wakeByKind.get("wake-reentry-reload")?.checks?.restoredWithoutDormancy === true && wakeByKind.get("wake-reentry-reload")?.checks?.restoredScrollPosition === true,
    oneDecoder: wakeRecordingAuthorities.every((item) => item.states?.at(-1)?.state?.videoElements === 1),
    scrollUnlocked: wakeByKind.get("wake-continue")?.checks?.noScrollLock === true
      && wakeByKind.get("wake-reverse-indicator")?.checks?.noRuntimeScrollWrite === true
      && wakeByKind.get("wake-reverse-raster")?.checks?.noRuntimeScrollWrite === true
      && wakeByKind.get("wake-reverse-after-q")?.checks?.noRuntimeScrollWrite === true,
  };
  if (Object.values(automaticWakeChecks).some((passed) => !passed)) throw new Error(`automatic-wake report projection differs from recording evidence: ${JSON.stringify(automaticWakeChecks)}`);
  const reportPayloads = {
    "reports/first-input.json": reportEnvelope(REPORT_SCHEMAS["reports/first-input.json"], generatedAt, target, { firstInput, mappingAuthority: sourceReports.mapping }),
    "reports/current-order.json": reportEnvelope(REPORT_SCHEMAS["reports/current-order.json"], generatedAt, target, { currentOrder, sourceAuthorities: { rootCause: sourceReports.rootCause, current: sourceReports.current, sourceAudit: sourceReports.sourceAudit } }),
    "reports/automatic-wake.json": reportEnvelope(REPORT_SCHEMAS["reports/automatic-wake.json"], generatedAt, target, { landmarks: { arrivalFrame: ARRIVAL_FRAME, stableQFrame: STABLE_Q_FRAME, authoredFps: FPS, authoredWakeSeconds: WAKE_DURATION_SECONDS }, recordings: wakeRecordings, stateMachineAuthority: sourceReports.reaction, checks: automaticWakeChecks }),
    "reports/timeout-geometry.json": reportEnvelope(REPORT_SCHEMAS["reports/timeout-geometry.json"], generatedAt, target, { positions: timeout.cases.map((item) => ({ position: item.position, emulation: item.emulation, before: item.before, after: item.after, geometry: item.geometry, checks: item.checks, recording: item.recording ? recordingSummary(item.recording) : null, status: item.status })), summary: { maximumAbsoluteDocumentHeightDelta: timeout.maximumAbsoluteDocumentHeightDelta, maximumAbsoluteScrollYDelta: timeout.maximumAbsoluteScrollYDelta, maximumCls: timeout.maximumCls } }),
    "reports/responsive.json": reportEnvelope(REPORT_SCHEMAS["reports/responsive.json"], generatedAt, target, { responsive, requiredFamilies: ["desktop", "portrait", "landscape"], shortLandscape: SHORT_LANDSCAPE_IDS }),
    "reports/codec-network-performance.json": reportEnvelope(REPORT_SCHEMAS["reports/codec-network-performance.json"], generatedAt, target, { publicAuthority, networkPerformance, codecContract: { activeH264Videos: 3, activeVp9Videos: 0, exactlyOneFamilyRequestPerContext: true, oneBlob: true, oneDecoder: true, safariStyleLogicOnly: true, fullWebKitClaimed: false } }),
    "reports/accessibility-fallback.json": reportEnvelope(REPORT_SCHEMAS["reports/accessibility-fallback.json"], generatedAt, target, { reducedMotion: fallback.reducedMotion, noJavaScript: fallback.noJavaScript, zoom200: fallback.zoom200, skip: fallback.skip, accessibility: fallback.accessibility, chrome: fallback.chrome, directDeepLink: fallback.directDeepLink, restoration: fallback.restoration, mediaFailures: fallback.mediaFailures, mediaPending: fallback.mediaPending, supportingRoutes: fallback.supportingRoutes, real404: fallback.real404, safariStyleSelectionLogic: fallback.safariStyleSelectionLogic }),
    "reports/operating-field-regression.json": reportEnvelope(REPORT_SCHEMAS["reports/operating-field-regression.json"], generatedAt, target, { sourceFreeze: { baseSha: BASE_SHA, changedProtectedFiles: [], pass: repository.operatingFieldSourceFreeze }, browser: fallback.operatingField, permittedRepairScope: ["short-landscape ENTRY layout", "cinematic failure geometry", "cinematic mapping/codec integration"] }),
    "reports/git-deployment-provenance.json": reportEnvelope(REPORT_SCHEMAS["reports/git-deployment-provenance.json"], generatedAt, target, { captureStartedAt, repository, deployment, activeProductionManifest: { basename: path.basename(options.manifest), bytes: authorities.manifestBytes.length, sha256: options.expectedManifestSha256, sourceBlendSha256: options.expectedSourceSha256, schema: authorities.manifest.schema, assetCount: authorities.manifest.assets.length }, publicAuthority, sourceReports }),
  };
  const reportRecords = [];
  for (const [relativePath, payload] of Object.entries(reportPayloads)) reportRecords.push(await writeSafeJson(path.join(options.output, ...relativePath.split("/")), payload));
  if (reportRecords.length !== 9) throw new Error("completed non-manifest report inventory differs");

  const artifacts = [...recordingRecords, ...sheetRecords, ...reportRecords].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (artifacts.length !== 43 || new Set(artifacts.map((item) => item.relativePath)).size !== artifacts.length) throw new Error("evidence artifact inventory differs or contains duplicates");
  const evidenceManifest = {
    schema: SCHEMA,
    status: "PASS",
    generatedAt,
    target,
    repository,
    deployment,
    activeMedia: { sourceBlendSha256: options.expectedSourceSha256, manifest: { basename: path.basename(options.manifest), publicPath: options.manifestUrlPath, bytes: authorities.manifestBytes.length, sha256: options.expectedManifestSha256 }, publicAuthority },
    captureContract: { firstInputCases: firstInput.caseCount, currentSamples: CURRENT_PROGRESS_SAMPLES.length, timeoutPositions: TIMEOUT_POSITIONS.length, responsiveViewpoints: VIEWPOINTS.length, recordings: 17, sheets: 17, reportsIncludingSelf: 10, totalFilesIncludingSelf: 44, runtimeCssModified: false, evidenceTelemetryOverlay: true, browserRecordingsReal: true, recordingNormalization: { container: "MP4", codec: "H.264", fps: 30, fpsMode: "CFR", pixelFormat: "yuv420p", audioStreams: 0 }, finalValuesPassedByCli: true },
    sourceReports,
    reports: reportRecords.map((item) => ({ relativePath: item.relativePath, bytes: item.bytes, sha256: item.sha256, schema: reportPayloads[item.relativePath].schema })),
    recordings: allRecordings.map(recordingSummary),
    sheets: sheetRecords,
    artifacts,
    summary: { status: "PASS", recordings: 17, sheets: 17, reportsIncludingSelf: 10, artifactsExcludingSelf: 43, totalFilesIncludingSelf: 44 },
    humanReviewGates: HUMAN_GATES,
    authorization: { humanAccepted: false, mainMerged: false, phase5Authorized: false },
  };
  const manifestRecord = await writeSafeJson(path.join(options.output, "reports", "phase4r2-1-browser-evidence-manifest.json"), evidenceManifest);
  process.stdout.write(stableJson({ status: "PASS", outputBasename: path.basename(options.output), counts: evidenceManifest.summary, manifest: manifestRecord, finalValuesWereCliInputs: true }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Phase 4-R2.1 browser evidence failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
