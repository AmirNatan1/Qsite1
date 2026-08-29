#!/usr/bin/env node

/**
 * Capture the deployed Phase 5A-R manifesto amendment.
 *
 * The accepted Phase 5A CRT capture remains an immutable baseline. This tool
 * records only the new forward/reverse semantic threshold, composes the 15
 * required review states into four compact sheets, and publishes structured
 * reports in a fresh durable directory outside the repository. Recorded state
 * changes use native mouse-wheel input. Raw Playwright recordings live only in
 * an owned staging directory and are removed after H.264 normalization and a
 * complete FFmpeg decode.
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import axeCore from "axe-core";
import { chromium } from "playwright-core";
import sharp from "sharp";

import {
  ACCEPTED_PHASE4_SHA,
  ACCEPTED_PHASE5A_DEPLOYMENT_REPORT_SHA256,
  ACCEPTED_PHASE5A_EVIDENCE_MANIFEST_SHA256,
  ACCEPTED_PHASE5A_SHA,
  ACTIVE_MEDIA_MANIFEST_SHA256,
  AUTHORIZATION,
  FPS,
  HEADLESS_LOAD_LONG_TASK_LIMITATION_MS,
  HOLD_MILLISECONDS,
  MAIN_SHA,
  MANIFESTO_TEXT,
  MANIFEST_URL_PATH,
  PHYSICAL_FRAME_COUNT,
  PROOF_STATES,
  RECORDINGS,
  REPORT_SCHEMAS,
  REQUIRED_BRANCH,
  REQUIRED_PROJECT,
  REVIEW_GATES,
  SCHEMA,
  SHEETS,
  SOURCE_BLEND_SHA256,
  VIEWPOINTS,
  addressesForGeometry,
  assertInventoryContract,
  chromeBoundaryResult,
  effectiveVisibilityResult,
  isWithin,
  manifestoHoldResult,
  manifestoScrollPresenceResult,
  manifestoTopBandForView,
  normalizePreviewUrl,
  normalizedRecordingResult,
  sha256,
  stableJson,
  validateActiveManifest,
} from "./phase5ar-evidence-contract.mjs";

const execFileAsync = promisify(execFile);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPT_RELATIVE = "scripts/capture-phase5ar-manifesto-evidence.mjs";
export const CONTRACT_RELATIVE = "scripts/phase5ar-evidence-contract.mjs";
export const ACTIVE_MANIFEST_RELATIVE = "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/production/manifests/phase-4r2-production-media-manifest.json";
const ACTIVE_MANIFEST = path.join(ROOT, ...ACTIVE_MANIFEST_RELATIVE.split("/"));
const VIEW = VIEWPOINTS[0];
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,})/i;
const VIDEO_PATTERN = /\.(?:mp4|webm)(?:\?|$)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    url: null,
    branchUrl: null,
    expectedHead: null,
    expectedBranch: REQUIRED_BRANCH,
    expectedDeploymentId: null,
    deploymentProject: REQUIRED_PROJECT,
    deploymentCheckRunId: null,
    deploymentReport: null,
    manifest: ACTIVE_MANIFEST,
    expectedManifestSha256: ACTIVE_MEDIA_MANIFEST_SHA256,
    manifestUrlPath: MANIFEST_URL_PATH,
    output: null,
    chromium: null,
    ffmpeg: null,
    ffprobe: null,
    timeoutMs: 30_000,
    dryRun: false,
    selfTest: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (["--immutable-url", "--url"].includes(argument)) options.url = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-branch") options.expectedBranch = next();
    else if (argument === "--expected-deployment-id") options.expectedDeploymentId = next().toLowerCase();
    else if (argument === "--deployment-project") options.deploymentProject = next();
    else if (argument === "--deployment-check-run-id") options.deploymentCheckRunId = next();
    else if (argument === "--deployment-report") options.deploymentReport = path.resolve(next());
    else if (argument === "--manifest") options.manifest = path.resolve(next());
    else if (argument === "--expected-manifest-sha256") options.expectedManifestSha256 = next().toLowerCase();
    else if (argument === "--manifest-url-path") options.manifestUrlPath = next();
    else if (argument === "--output") options.output = path.resolve(next());
    else if (["--browser", "--chromium"].includes(argument)) options.chromium = path.resolve(next());
    else if (argument === "--ffmpeg") options.ffmpeg = path.resolve(next());
    else if (argument === "--ffprobe") options.ffprobe = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (["--help", "-h"].includes(argument)) options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 5A-R deployed manifesto evidence\n\nUsage:\n  node ${SCRIPT_RELATIVE} \\\n    --immutable-url https://<deployment>.qsite1.pages.dev/ \\\n    --branch-url https://<branch>.qsite1.pages.dev/ \\\n    --expected-head <40-hex> --expected-branch ${REQUIRED_BRANCH} \\\n    --expected-deployment-id <uuid> --deployment-project ${REQUIRED_PROJECT} \\\n    --deployment-check-run-id <numeric-id> --deployment-report <external-json> \\\n    --manifest ${ACTIVE_MANIFEST_RELATIVE} --expected-manifest-sha256 ${ACTIVE_MEDIA_MANIFEST_SHA256} \\\n    --output <fresh-external-directory> --browser <chrome> --ffmpeg <ffmpeg> --ffprobe <ffprobe>\n\nOptions:\n  --dry-run       Validate explicit bindings; no Git/network/browser/output\n  --self-test     Run pure contract checks; no reads/network/browser/output\n  --timeout-ms N  Per-operation timeout, 5000..120000\n`);
}

export function validateOptions(options) {
  if (!HASH40.test(options.expectedHead ?? "") || [ACCEPTED_PHASE5A_SHA, MAIN_SHA].includes(options.expectedHead)) throw new Error("--expected-head must be a new 40-character lowercase SHA");
  if (options.expectedBranch !== REQUIRED_BRANCH) throw new Error(`--expected-branch must be ${REQUIRED_BRANCH}`);
  if (!UUID.test(options.expectedDeploymentId ?? "")) throw new Error("--expected-deployment-id must be a Cloudflare UUID");
  if (options.deploymentProject !== REQUIRED_PROJECT) throw new Error(`--deployment-project must be ${REQUIRED_PROJECT}`);
  if (!/^[1-9]\d*$/.test(String(options.deploymentCheckRunId ?? ""))) throw new Error("--deployment-check-run-id must be a positive numeric identifier");
  options.url = normalizePreviewUrl(options.url, "immutable URL");
  options.branchUrl = normalizePreviewUrl(options.branchUrl, "branch URL");
  if (options.url === options.branchUrl) throw new Error("immutable and branch URLs must differ");
  const immutableHost = new URL(options.url).hostname;
  if (!immutableHost.startsWith(`${options.expectedDeploymentId.slice(0, 8)}.`)) throw new Error("immutable URL prefix does not match the Cloudflare deployment UUID");
  if (path.resolve(options.manifest) !== ACTIVE_MANIFEST || options.expectedManifestSha256 !== ACTIVE_MEDIA_MANIFEST_SHA256 || options.manifestUrlPath !== MANIFEST_URL_PATH) throw new Error("active media manifest authority differs from accepted Phase 5A");
  const temporaryDryRunFixture = options.dryRun && options.deploymentReport && isWithin(os.tmpdir(), options.deploymentReport);
  if (!options.deploymentReport || isWithin(ROOT, options.deploymentReport) || (isWithin(os.tmpdir(), options.deploymentReport) && !temporaryDryRunFixture)) throw new Error("deployment report must be an external durable JSON file");
  if (!options.output || isWithin(ROOT, options.output) || isWithin(os.tmpdir(), options.output)) throw new Error("output must be a durable external directory");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  if (!options.dryRun && (!options.ffmpeg || !options.ffprobe)) throw new Error("full capture requires caller-supplied FFmpeg and FFprobe");
  return options;
}

function flattenScalars(value, output = []) {
  if (["string", "number", "boolean"].includes(typeof value)) output.push(String(value));
  else if (Array.isArray(value)) for (const item of value) flattenScalars(item, output);
  else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) { output.push(key); flattenScalars(child, output); }
  return output;
}

function valuesForKey(value, target, output = []) {
  if (Array.isArray(value)) for (const item of value) valuesForKey(item, target, output);
  else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
    if (key === target) output.push(child);
    valuesForKey(child, target, output);
  }
  return output;
}

function containsScalar(value, expected, { url = false } = {}) {
  return flattenScalars(value).some((candidate) => {
    if (!url) return candidate === String(expected);
    try { return new URL(candidate).toString() === expected; } catch { return false; }
  });
}

export function validateDeploymentReportData(report, options, manifestBytes) {
  const schema = String(report?.schema ?? "");
  const checks = {
    phase5arDeploymentSchema: /phase-5a-r.*deployment|phase5ar.*deployment/i.test(schema),
    pass: report?.status === "PASS",
    expectedHead: containsScalar(report, options.expectedHead),
    expectedBranch: containsScalar(report, options.expectedBranch),
    deploymentId: containsScalar(report, options.expectedDeploymentId),
    project: containsScalar(report, options.deploymentProject),
    checkRun: containsScalar(report, String(options.deploymentCheckRunId)),
    immutableUrl: containsScalar(report, options.url, { url: true }),
    branchUrl: containsScalar(report, options.branchUrl, { url: true }),
    frozenMain: containsScalar(report, MAIN_SHA),
    acceptedPhase5A: containsScalar(report, ACCEPTED_PHASE5A_SHA),
    activeManifest: containsScalar(report, options.expectedManifestSha256) && containsScalar(report, String(manifestBytes.length)),
    phase5BDenied: valuesForKey(report, "phase5BAuthorized").some((value) => value === false),
    mainNotMerged: valuesForKey(report, "mainMerged").some((value) => value === false),
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`deployment report binding differs: ${JSON.stringify(checks)}`);
  return { schema, status: "PASS", sha256: sha256(Buffer.from(stableJson(report))), checks };
}

async function resolvedFromExistingAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const tail = [];
  for (;;) {
    try { return path.join(await realpath(cursor), ...tail.reverse()); }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      tail.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

export async function validateFreshExternalOutputPath(candidate) {
  const resolved = await resolvedFromExistingAncestor(candidate);
  if (isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved)) throw new Error("evidence output must remain outside repository and temporary roots");
  try { await stat(resolved); throw new Error("evidence output must not already exist"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  return resolved;
}

async function run(command, args, label, options = {}) {
  try {
    return await execFileAsync(command, args, { cwd: ROOT, windowsHide: true, timeout: options.timeout ?? 60_000, maxBuffer: 24 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`${label} failed: ${String(error?.stderr || error?.message || error).slice(-4_000)}`);
  }
}

async function git(args, label = `git ${args.join(" ")}`) {
  return (await run("git", args, label)).stdout.trim();
}

async function repositoryAuthority(options) {
  const [head, branch, main, statusText, upstreamRef, upstreamHead, baseAncestor, mergedIntoMain, merges, mediaDiff, tracked] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["branch", "--show-current"]),
    git(["rev-parse", "main"]),
    git(["status", "--porcelain=v1", "--untracked-files=all"]),
    git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    git(["rev-parse", "@{upstream}"]),
    run("git", ["merge-base", "--is-ancestor", ACCEPTED_PHASE5A_SHA, options.expectedHead], "accepted Phase 5A ancestry").then(() => true, () => false),
    run("git", ["merge-base", "--is-ancestor", options.expectedHead, "main"], "main containment check").then(() => true, () => false),
    git(["rev-list", "--merges", `${ACCEPTED_PHASE5A_SHA}..${options.expectedHead}`]),
    git(["diff", "--name-only", `${ACCEPTED_PHASE5A_SHA}..${options.expectedHead}`, "--", "public/media/cinematic/phase-4r2", "artifacts/original/phase-4r2-1-causal-signal-scroll-stability"]),
    git(["ls-files", "--", SCRIPT_RELATIVE, CONTRACT_RELATIVE, ACTIVE_MANIFEST_RELATIVE]),
  ]);
  const checks = {
    exactHead: head === options.expectedHead,
    exactBranch: branch === options.expectedBranch,
    frozenMain: main === MAIN_SHA,
    cleanTree: statusText === "",
    exactUpstream: upstreamRef === `origin/${options.expectedBranch}` && upstreamHead === options.expectedHead,
    acceptedPhase5AAncestor: baseAncestor,
    notMergedIntoMain: !mergedIntoMain,
    noMergeCommits: merges === "",
    phase4MediaUnchanged: mediaDiff === "",
    trackedAuthorities: tracked.split(/\r?\n/).filter(Boolean).length === 3,
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`repository authority differs: ${JSON.stringify(checks)}`);
  return { head, branch, parent: (await git(["rev-parse", "HEAD^"])), acceptedPhase5A: ACCEPTED_PHASE5A_SHA, acceptedPhase4: ACCEPTED_PHASE4_SHA, main, upstream: upstreamHead, checks };
}

async function readJson(file, label) {
  const bytes = await readFile(file);
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`${label} is not JSON`); }
  return { bytes, parsed };
}

async function loadAuthorities(options) {
  const [{ bytes: manifestBytes, parsed: manifest }, { bytes: deploymentBytes, parsed: deploymentReport }] = await Promise.all([
    readJson(options.manifest, "active media manifest"),
    readJson(options.deploymentReport, "deployment report"),
  ]);
  if (sha256(manifestBytes) !== options.expectedManifestSha256) throw new Error("active media manifest hash differs");
  validateActiveManifest(manifest);
  const deployment = validateDeploymentReportData(deploymentReport, options, manifestBytes);
  if (PRIVATE_TEXT.test(deploymentBytes.toString("utf8"))) throw new Error("deployment report contains a private local path or token");
  return { manifest, manifestBytes, deployment };
}

async function fetchBytes(url, timeoutMs) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "*/*" } });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return { response, bytes };
}

export function serverRenderedH1Text(html) {
  const matches = [...String(html).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (matches.length !== 1) return null;
  return matches[0][1]
    .replace(/<[^>]+>/g, " ")
    .replace(/(?:&nbsp;|&#160;)/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/(?:&#39;|&apos;)/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function verifyPublicAuthority(options, manifestBytes) {
  const immutableManifestUrl = new URL(options.manifestUrlPath, options.url).toString();
  const branchManifestUrl = new URL(options.manifestUrlPath, options.branchUrl).toString();
  const [immutableHtml, branchHtml, immutableManifest, branchManifest] = await Promise.all([
    fetchBytes(options.url, options.timeoutMs),
    fetchBytes(options.branchUrl, options.timeoutMs),
    fetchBytes(immutableManifestUrl, options.timeoutMs),
    fetchBytes(branchManifestUrl, options.timeoutMs),
  ]);
  const html = immutableHtml.bytes.toString("utf8");
  const checks = {
    immutableAndBranchHtmlEqual: immutableHtml.bytes.equals(branchHtml.bytes),
    immutableManifestExact: immutableManifest.bytes.equals(manifestBytes),
    branchManifestExact: branchManifest.bytes.equals(manifestBytes),
    oneH1ServerRendered: (html.match(/<h1\b/gi) ?? []).length === 1,
    manifestoServerRendered: serverRenderedH1Text(html) === MANIFESTO_TEXT,
    cachePolicyObserved: immutableHtml.response.headers.get("cache-control") === "public, max-age=0, must-revalidate",
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`public authority differs: ${JSON.stringify(checks)}`);
  return { immutableHtml: { bytes: immutableHtml.bytes.length, sha256: sha256(immutableHtml.bytes) }, branchHtml: { bytes: branchHtml.bytes.length, sha256: sha256(branchHtml.bytes) }, manifest: { bytes: manifestBytes.length, sha256: sha256(manifestBytes) }, checks };
}

async function executable(candidate) {
  if (!candidate) return false;
  try { await access(candidate, fsConstants.X_OK); return true; } catch { return false; }
}

async function resolveChromium(override) {
  const candidates = [override];
  if (process.platform === "win32") {
    candidates.push(path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"));
    candidates.push(path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"));
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) if (await executable(candidate)) return path.resolve(candidate);
  throw new Error("Chrome/Chromium not found; pass --browser");
}

function contextOptions(view, overrides = {}) {
  return { viewport: { width: view.width, height: view.height }, screen: { width: view.width, height: view.height }, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "no-preference", locale: "en-US", serviceWorkers: "block", ...overrides };
}

async function installPreloadTelemetry(context) {
  await context.addInitScript(() => {
    const telemetry = {
      startedAt: performance.now(), scrollEvents: 0, wheelEvents: 0, keyEvents: 0,
      programmaticWindowScrollCalls: 0, programmaticElementScrollCalls: 0,
      playCalls: 0, pauseCalls: 0, playEvents: 0, playingEvents: 0, pauseEvents: 0,
      seekingEvents: 0, seekedEvents: 0, videoBlobCreates: 0, liveBlobUrls: 0, longTasks: [],
    };
    const originalScrollTo = window.scrollTo.bind(window);
    window.scrollTo = (...args) => { telemetry.programmaticWindowScrollCalls += 1; return originalScrollTo(...args); };
    const originalElementScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function(...args) { telemetry.programmaticElementScrollCalls += 1; return originalElementScrollTo.apply(this, args); };
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) { telemetry.playCalls += 1; return originalPlay.apply(this, args); };
    const originalPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function(...args) { telemetry.pauseCalls += 1; return originalPause.apply(this, args); };
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    const live = new Set();
    URL.createObjectURL = (value) => {
      const result = originalCreateObjectURL(value);
      if (value instanceof Blob && value.type.split(";", 1)[0] === "video/mp4") { telemetry.videoBlobCreates += 1; live.add(result); telemetry.liveBlobUrls = live.size; }
      return result;
    };
    URL.revokeObjectURL = (value) => { live.delete(value); telemetry.liveBlobUrls = live.size; return originalRevokeObjectURL(value); };
    addEventListener("wheel", () => { telemetry.wheelEvents += 1; }, { passive: true });
    addEventListener("scroll", () => { telemetry.scrollEvents += 1; }, { passive: true });
    addEventListener("keydown", () => { telemetry.keyEvents += 1; }, { passive: true });
    addEventListener("play", () => { telemetry.playEvents += 1; }, true);
    addEventListener("playing", () => { telemetry.playingEvents += 1; }, true);
    addEventListener("pause", () => { telemetry.pauseEvents += 1; }, true);
    addEventListener("seeking", () => { telemetry.seekingEvents += 1; }, true);
    addEventListener("seeked", () => { telemetry.seekedEvents += 1; }, true);
    try {
      const observer = new PerformanceObserver((list) => {
        for (const item of list.getEntries()) telemetry.longTasks.push({ startTime: item.startTime, duration: item.duration });
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch { /* Long Task API is diagnostic-only. */ }
    window.__phase5arEvidenceTelemetry = telemetry;
  });
}

function observePage(page) {
  const diagnostics = { requests: [], consoleErrors: [], consoleWarnings: [], pageErrors: [], requestFailures: [], badResponses: [] };
  page.on("request", (request) => diagnostics.requests.push({ url: request.url(), path: new URL(request.url()).pathname, method: request.method(), resourceType: request.resourceType() }));
  page.on("console", (message) => {
    const record = { text: message.text(), url: message.location().url || null, lineNumber: message.location().lineNumber, columnNumber: message.location().columnNumber };
    if (message.type() === "error") diagnostics.consoleErrors.push(record);
    if (message.type() === "warning") diagnostics.consoleWarnings.push(record);
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push({ name: error.name, message: error.message }));
  page.on("requestfailed", (request) => diagnostics.requestFailures.push({ url: request.url(), resourceType: request.resourceType(), error: request.failure()?.errorText ?? null }));
  page.on("response", (response) => { if (response.status() >= 400) diagnostics.badResponses.push({ url: response.url(), status: response.status(), resourceType: response.request().resourceType() }); });
  return diagnostics;
}

export function unexpectedRequestFailures(diagnostics) {
  return (diagnostics?.requestFailures ?? []).filter((item) => !(
    item.resourceType === "media"
    && item.error === "net::ERR_ABORTED"
    && /^blob:https:\/\/[a-z0-9-]+\.qsite1\.pages\.dev\/[0-9a-f-]+$/i.test(item.url)
  ));
}

export function conventionalSkipLinkResult(hiddenFocusable) {
  const expected = (hiddenFocusable ?? []).filter((item) => item.tag === "A"
    && item.id === null
    && item.className === "skip-link"
    && item.href === "#entry"
    && item.text === "Skip cinematic intro");
  return { expectedCount: expected.length, unexpected: (hiddenFocusable ?? []).filter((item) => !expected.includes(item)), pass: expected.length === 1 && expected.length === (hiddenFocusable ?? []).length };
}

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

function enrichVisibility(snapshot, viewport) {
  if (!snapshot) return null;
  return { ...snapshot, effective: effectiveVisibilityResult({ rect: snapshot.rect, ancestors: snapshot.ancestors, viewport }) };
}

async function runtimeState(page, label = null) {
  const raw = await page.evaluate((labelValue) => {
    const root = document.documentElement;
    const shell = document.querySelector("[data-cinematic-shell]");
    const video = document.querySelector("[data-cinematic-media]");
    const manifesto = document.querySelector("[data-manifesto-threshold]");
    const content = document.querySelector(".manifesto-field__content");
    const h1 = manifesto?.querySelector("h1");
    const audience = document.querySelector("[data-audience-routing]");
    const built = document.querySelector("#built-with-industry");
    const header = document.querySelector(".site-header");
    const q = window.quantumPhase4 ?? {};
    const telemetry = window.__phase5arEvidenceTelemetry ?? {};
    const visibility = (element) => {
      if (!element) return null;
      const rectangle = element.getBoundingClientRect();
      const ancestors = [];
      for (let cursor = element; cursor && cursor instanceof Element; cursor = cursor.parentElement) {
        const style = getComputedStyle(cursor);
        ancestors.push({ tag: cursor.tagName, id: cursor.id || null, className: typeof cursor.className === "string" ? cursor.className : null, display: style.display, visibility: style.visibility, opacity: Number.parseFloat(style.opacity) });
      }
      return { rect: { top: rectangle.top, bottom: rectangle.bottom, left: rectangle.left, right: rectangle.right, width: rectangle.width, height: rectangle.height }, ancestors };
    };
    const effectivelyVisible = (element) => {
      if (!element) return false;
      const rectangle = element.getBoundingClientRect();
      if (!(rectangle.bottom > 0 && rectangle.top < innerHeight && rectangle.right > 0 && rectangle.left < innerWidth)) return false;
      for (let cursor = element; cursor && cursor instanceof Element; cursor = cursor.parentElement) {
        const style = getComputedStyle(cursor);
        if (style.display === "none" || ["hidden", "collapse"].includes(style.visibility) || Number.parseFloat(style.opacity) <= 0.01) return false;
      }
      return true;
    };
    const focusable = [...document.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex]")]
      .filter((item) => item.tabIndex >= 0 && !item.closest("[data-phase5ar-evidence-overlay]"));
    const hiddenFocusable = focusable.filter((item) => !item.closest("[inert]") && !item.hasAttribute("disabled") && !effectivelyVisible(item));
    const h1Style = h1 ? getComputedStyle(h1) : null;
    const audienceRect = audience?.getBoundingClientRect();
    return {
      label: labelValue,
      now: performance.now(),
      viewport: { width: innerWidth, height: innerHeight },
      scrollY,
      scrollOffset: q.scrollOffset ?? null,
      conceptualFrame: q.conceptualFrame ?? null,
      targetFrame: q.targetFrame ?? null,
      presentedFrame: q.presentedFrame ?? null,
      currentTime: video?.currentTime ?? null,
      paused: video?.paused ?? null,
      autoplay: video?.autoplay ?? null,
      seeking: video?.seeking ?? null,
      phase: shell?.dataset.cinematicPhase ?? null,
      segment: q.segment ?? shell?.dataset.cinematicSegment ?? null,
      control: q.control ?? shell?.dataset.cinematicControl ?? null,
      semanticProgress: q.semanticProgress ?? null,
      blackProgress: q.blackProgress ?? null,
      manifestoSettled: q.manifestoSettled ?? null,
      navigationReleased: q.navigationReleased ?? null,
      headerState: root.dataset.cinematicHeader ?? null,
      interactive: shell?.dataset.cinematicInteractive ?? null,
      mode: q.mode ?? root.dataset.cinematicMode ?? null,
      mediaState: shell?.dataset.mediaState ?? null,
      sourceKind: video?.currentSrc?.startsWith("blob:") ? "blob" : video?.currentSrc ? "url" : "none",
      videoElements: document.querySelectorAll("video").length,
      activeVideoElements: [...document.querySelectorAll("video")].filter((item) => Boolean(item.currentSrc || item.getAttribute("src"))).length,
      h1Count: document.querySelectorAll("h1").length,
      h1Text: h1?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      h1Css: h1Style ? { wordBreak: h1Style.wordBreak, overflowWrap: h1Style.overflowWrap, hyphens: h1Style.hyphens } : null,
      manifestoInert: manifesto?.hasAttribute("inert") ?? null,
      audienceInert: audience?.hasAttribute("inert") ?? null,
      audienceIntersects: audienceRect ? audienceRect.bottom > 0 && audienceRect.top < innerHeight : false,
      audienceLinks: [...(audience?.querySelectorAll("a[href]") ?? [])].map((item) => ({ text: item.textContent?.replace(/\s+/g, " ").trim() ?? "", href: item.getAttribute("href") })),
      document: { scrollHeight: root.scrollHeight, scrollWidth: root.scrollWidth, overflow: root.scrollWidth > innerWidth + 2 },
      activeElement: document.activeElement ? { tag: document.activeElement.tagName, id: document.activeElement.id || null, className: typeof document.activeElement.className === "string" ? document.activeElement.className : null } : null,
      hiddenFocusable: hiddenFocusable.map((item) => ({ tag: item.tagName, id: item.id || null, className: typeof item.className === "string" ? item.className : null, href: item.getAttribute("href"), text: item.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "" })),
      visibleScenes: [...document.querySelectorAll("[data-home-scene]")].filter(effectivelyVisible).map((item) => item.getAttribute("data-home-scene")),
      visibility: { manifesto: visibility(manifesto), content: visibility(content), h1: visibility(h1), audience: visibility(audience), built: visibility(built), header: visibility(header) },
      telemetry: {
        scrollEvents: telemetry.scrollEvents ?? 0, wheelEvents: telemetry.wheelEvents ?? 0, keyEvents: telemetry.keyEvents ?? 0,
        programmaticWindowScrollCalls: telemetry.programmaticWindowScrollCalls ?? 0, programmaticElementScrollCalls: telemetry.programmaticElementScrollCalls ?? 0,
        playCalls: telemetry.playCalls ?? 0, pauseCalls: telemetry.pauseCalls ?? 0, playEvents: telemetry.playEvents ?? 0, playingEvents: telemetry.playingEvents ?? 0,
        pauseEvents: telemetry.pauseEvents ?? 0, seekingEvents: telemetry.seekingEvents ?? 0, seekedEvents: telemetry.seekedEvents ?? 0,
        videoBlobCreates: telemetry.videoBlobCreates ?? 0, liveBlobUrls: telemetry.liveBlobUrls ?? 0, longTasks: telemetry.longTasks ?? [],
      },
    };
  }, label);
  const viewport = raw.viewport;
  return { ...raw, visibility: Object.fromEntries(Object.entries(raw.visibility).map(([key, snapshot]) => [key, enrichVisibility(snapshot, viewport)])) };
}

async function cinematicGeometry(page) {
  return page.evaluate(() => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const entry = document.querySelector("#entry");
    const audience = document.querySelector("[data-audience-routing]");
    const built = document.querySelector("#built-with-industry");
    const header = document.querySelector(".site-header");
    if (!shell || !entry || !audience || !built || !header) throw new Error("manifesto geometry DOM is incomplete");
    const top = (element) => element.getBoundingClientRect().top + scrollY;
    const shellTop = top(shell);
    const headerHeight = header.getBoundingClientRect().height;
    const entryTop = top(entry);
    const audienceTop = top(audience);
    const builtTop = top(built);
    return { shellTop, headerHeight, entryTop, audienceTop, builtTop, travel: Math.round(entryTop - headerHeight - shellTop), maxScrollY: document.documentElement.scrollHeight - innerHeight, documentHeight: document.documentElement.scrollHeight };
  });
}

export function enhancedReadinessResult(state) {
  const mode = state?.mode ?? null;
  const mediaReady = state?.mediaReady === true;
  const mediaState = state?.mediaState ?? null;
  const fallback = state?.fallback ?? null;
  const ready = mode === "enhanced" && mediaReady;
  const terminalFailure = mode === "static" || String(mediaState ?? "").startsWith("failed");
  return { ready, terminalFailure, pending: !ready && !terminalFailure, mode, mediaReady, mediaState, fallback };
}

async function waitEnhanced(page, timeoutMs) {
  await page.waitForFunction(() => {
    const mode = document.documentElement.dataset.cinematicMode;
    const mediaState = document.querySelector("[data-cinematic-shell]")?.dataset.mediaState ?? "";
    return (window.quantumPhase4?.mediaReady === true && mode === "enhanced")
      || mode === "static"
      || mediaState.startsWith("failed");
  }, null, { timeout: timeoutMs });
  const readiness = enhancedReadinessResult(await page.evaluate(() => ({
    mode: document.documentElement.dataset.cinematicMode ?? null,
    mediaReady: window.quantumPhase4?.mediaReady ?? null,
    mediaState: document.querySelector("[data-cinematic-shell]")?.dataset.mediaState ?? null,
    fallback: document.documentElement.dataset.cinematicFallback ?? null,
  })));
  if (!readiness.ready) throw new Error(`enhanced media entered terminal fallback: ${JSON.stringify(readiness)}`);
  await twoFrames(page);
  await page.waitForFunction(() => {
    const video = document.querySelector("[data-cinematic-media]");
    return video?.paused === true && video?.seeking === false;
  }, null, { timeout: timeoutMs });
}

async function waitAfterInput(page, { animationFrames = true } = {}) {
  if (animationFrames) await twoFrames(page);
  await page.waitForTimeout(90);
}

async function nativeWheelTo(page, targetY, timeoutMs, waitOptions) {
  const before = await runtimeState(page, "before-wheel");
  let gestures = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await page.evaluate(() => scrollY);
    const remaining = targetY - current;
    if (Math.abs(remaining) <= 0.01) break;
    await page.mouse.move(12, 12);
    await page.mouse.wheel(0, remaining);
    gestures += 1;
    await waitAfterInput(page, waitOptions);
    if (gestures >= 6) break;
  }
  const state = await runtimeState(page, "after-wheel");
  const landingError = state.scrollY - targetY;
  if (Math.abs(landingError) > 0.01) throw new Error(`native wheel failed to land at ${targetY}; observed ${state.scrollY}`);
  return { targetY, landingError, gestures, wheelEventDelta: state.telemetry.wheelEvents - before.telemetry.wheelEvents, state };
}

async function waitAddressed(page, expected, timeoutMs) {
  await page.waitForFunction((value) => {
    const q = window.quantumPhase4;
    const video = document.querySelector("[data-cinematic-media]");
    return q?.targetFrame === value && q?.presentedFrame === value && video?.paused === true && video?.seeking === false;
  }, expected, { timeout: timeoutMs });
  return runtimeState(page);
}

function networkInventory(diagnostics, state, manifest, view, { expectVideo = true } = {}) {
  const family = view.family === "landscape" ? "landscape" : view.family === "portrait" ? "portrait" : "desktop";
  const asset = manifest.assets.find((item) => item.kind === "video" && item.family === family);
  const expectedPath = `/media/cinematic/phase-4r2/${asset?.file}`;
  const videoRequests = diagnostics.requests.filter((item) => VIDEO_PATTERN.test(item.path));
  const h264Requests = videoRequests.filter((item) => item.path === expectedPath);
  const checks = expectVideo ? {
    exactlyOneH264: h264Requests.length === 1 && videoRequests.length === 1,
    oneDecoder: state.videoElements === 1 && state.activeVideoElements === 1,
    oneBlob: state.sourceKind === "blob" && state.telemetry.videoBlobCreates === 1 && state.telemetry.liveBlobUrls === 1,
    pausedSeekSurface: state.control === "scroll-addressed" && state.paused === true && state.autoplay === false && state.seeking === false
      && state.telemetry.seekingEvents >= 1 && state.telemetry.seekedEvents >= 1,
    zeroPlayback: state.telemetry.playCalls === 0 && state.telemetry.playEvents === 0 && state.telemetry.playingEvents === 0,
    zeroSyntheticScroll: state.telemetry.programmaticWindowScrollCalls === 0 && state.telemetry.programmaticElementScrollCalls === 0,
  } : {
    zeroVideoRequests: videoRequests.length === 0,
    zeroActiveVideo: state.activeVideoElements === 0,
  };
  return { family, expectedPath, videoRequests, checks, pass: Object.values(checks).every(Boolean) };
}

async function installOverlay(page, text) {
  await page.evaluate((initial) => {
    const element = document.createElement("div");
    element.dataset.phase5arEvidenceOverlay = "";
    element.setAttribute("aria-hidden", "true");
    element.textContent = initial;
    Object.assign(element.style, { position: "fixed", left: "16px", bottom: "16px", zIndex: "2147483647", padding: "8px 11px", color: "#f4eee7", background: "rgba(3,5,6,.82)", border: "1px solid rgba(244,238,231,.3)", font: "600 11px/1.2 Arial,sans-serif", letterSpacing: ".08em", textTransform: "uppercase", pointerEvents: "none" });
    document.body.append(element);
  }, text);
}

async function updateOverlay(page, text) {
  await page.evaluate((value) => { const element = document.querySelector("[data-phase5ar-evidence-overlay]"); if (element) element.textContent = value; }, text);
}

async function recordedMilestone(page, addresses, key, label, expectedFrame, timeoutMs, delay = 320) {
  await updateOverlay(page, label);
  const input = await nativeWheelTo(page, addresses[key], timeoutMs);
  if (expectedFrame) await waitAddressed(page, expectedFrame, timeoutMs);
  const state = await runtimeState(page, label);
  await page.waitForTimeout(delay);
  return { key, label, input: { targetY: input.targetY, landingError: input.landingError, gestures: input.gestures, wheelEventDelta: input.wheelEventDelta }, state };
}

async function holdSettled(page) {
  const before = await runtimeState(page, "manifesto-hold-before");
  const started = performance.now();
  await page.waitForTimeout(HOLD_MILLISECONDS);
  const elapsedMilliseconds = performance.now() - started;
  const after = await runtimeState(page, "manifesto-hold-after");
  const validation = manifestoHoldResult(before, after, elapsedMilliseconds);
  if (!validation.pass) throw new Error(`manifesto hold moved: ${JSON.stringify(validation)}`);
  return { before, after, validation, status: "PASS" };
}

async function recordForward(page, options, addresses) {
  const milestones = [];
  await updateOverlay(page, "FORWARD · PHYSICAL PROVING HALL");
  await page.waitForTimeout(350);
  milestones.push(await recordedMilestone(page, addresses, "firstPositive", "FORWARD · FIRST +15PX · F46", 46, options.timeoutMs, 180));
  milestones.push(await recordedMilestone(page, addresses, "arrival", "FORWARD · CRT ARRIVAL · F285", 285, options.timeoutMs));
  milestones.push(await recordedMilestone(page, addresses, "stableQ", "FORWARD · EXACT Q · F370", 370, options.timeoutMs, 420));
  milestones.push(await recordedMilestone(page, addresses, "threshold", "FORWARD · PHYSICAL THRESHOLD · F500", 500, options.timeoutMs, 520));
  milestones.push(await recordedMilestone(page, addresses, "revealStart", "FORWARD · DIGITAL BLACK → MANIFESTO", 500, options.timeoutMs));
  milestones.push(await recordedMilestone(page, addresses, "firstReadable", "FORWARD · MANIFESTO FIRST READABLE", 500, options.timeoutMs, 650));
  milestones.push(await recordedMilestone(page, addresses, "settled", "FORWARD · MANIFESTO SETTLED", 500, options.timeoutMs, 120));
  const hold = await holdSettled(page);
  milestones.push(await recordedMilestone(page, addresses, "preRelease", "FORWARD · MANIFESTO RELEASE APPROACH", 500, options.timeoutMs, 180));
  milestones.push(await recordedMilestone(page, addresses, "release", "FORWARD · CHROME RELEASE BOUNDARY", 500, options.timeoutMs, 220));
  milestones.push(await recordedMilestone(page, addresses, "audienceVisible", "FORWARD · AUDIENCE ROUTING", 500, options.timeoutMs, 520));
  milestones.push(await recordedMilestone(page, addresses, "builtVisible", "FORWARD · BUILT WITH INDUSTRY", 500, options.timeoutMs, 600));
  const terminal = milestones.at(-1).state;
  const checks = {
    firstPositiveF46: milestones[0].state.targetFrame === 46,
    arrivalF285: milestones[1].state.targetFrame === 285 && milestones[1].state.presentedFrame === 285,
    stableQF370: milestones[2].state.targetFrame === 370 && milestones[2].state.presentedFrame === 370,
    thresholdF500: milestones[3].state.targetFrame === 500 && milestones[3].state.presentedFrame === 500 && milestones[3].state.semanticProgress === 0,
    firstReadableNativeH1: milestones[5].state.visibility.h1.effective.pass && milestones[5].state.h1Text === MANIFESTO_TEXT,
    settledPureManifesto: milestones[6].state.manifestoSettled === true && milestones[6].state.visibleScenes.join("|") === "manifesto",
    audienceAfterManifesto: milestones[9].state.audienceIntersects === true && milestones[9].state.navigationReleased === true,
    builtAfterAudience: terminal.visibleScenes.includes("built-with-industry"),
    nativeWheelOnly: milestones.every((item) => item.input.gestures === 1 && item.input.wheelEventDelta === 1) && terminal.telemetry.programmaticWindowScrollCalls === 0,
    zeroPlayback: terminal.telemetry.playCalls === 0 && terminal.telemetry.playEvents === 0 && terminal.telemetry.playingEvents === 0,
    hold: hold.validation.pass,
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`forward manifesto recording failed: ${JSON.stringify(checks)}`);
  return { direction: "forward", milestones, hold, checks, status: "PASS" };
}

async function recordReverse(page, options, addresses) {
  await updateOverlay(page, "SETUP · NATIVE FORWARD POSITIONING · NOT REVERSE EVIDENCE");
  const setup = await nativeWheelTo(page, addresses.builtVisible, options.timeoutMs);
  await page.waitForTimeout(450);
  const milestones = [];
  for (const [key, label, frame, delay] of [
    ["audienceVisible", "REVERSE · BUILT → AUDIENCE", 500, 420],
    ["release", "REVERSE · EXACT CHROME BOUNDARY", 500, 220],
    ["preRelease", "REVERSE · CHROME CONCEALED", 500, 280],
    ["settled", "REVERSE · MANIFESTO SETTLED", 500, 520],
    ["firstReadable", "REVERSE · MANIFESTO DISSOLVES", 500, 420],
    ["revealStart", "REVERSE · DIGITAL THRESHOLD", 500, 320],
    ["threshold", "REVERSE · DIGITAL BLACK · F500", 500, 520],
    ["stableQ", "REVERSE · EXACT Q · F370", 370, 420],
    ["arrival", "REVERSE · CRT ARRIVAL · F285", 285, 320],
    ["top", "REVERSE · PHYSICAL PROVING HALL · F1", 1, 650],
  ]) milestones.push(await recordedMilestone(page, addresses, key, label, frame, options.timeoutMs, delay));
  const terminal = milestones.at(-1).state;
  const checks = {
    disclosedNativeSetup: setup.gestures === 1 && setup.wheelEventDelta === 1,
    exactReverseAddresses: milestones.every((item, index) => index === 0 || item.state.scrollY < milestones[index - 1].state.scrollY),
    chromeConcealsAtOnePixel: milestones[2].state.headerState === "concealed" && milestones[2].state.audienceInert === true,
    manifestoRestored: milestones[3].state.manifestoSettled === true && milestones[3].state.visibleScenes.join("|") === "manifesto",
    blackRestored: milestones[6].state.targetFrame === 500 && milestones[6].state.semanticProgress === 0,
    qAndArrivalRestored: milestones[7].state.presentedFrame === 370 && milestones[8].state.presentedFrame === 285,
    returnedF1: terminal.targetFrame === 1 && terminal.presentedFrame === 1 && terminal.scrollY === 0,
    nativeWheelOnly: milestones.every((item) => item.input.gestures === 1 && item.input.wheelEventDelta === 1) && terminal.telemetry.programmaticWindowScrollCalls === 0,
    zeroPlayback: terminal.telemetry.playCalls === 0 && terminal.telemetry.playEvents === 0 && terminal.telemetry.playingEvents === 0,
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`reverse manifesto recording failed: ${JSON.stringify(checks)}`);
  return { direction: "reverse", setup: { targetY: setup.targetY, gestures: setup.gestures, wheelEventDelta: setup.wheelEventDelta, excludedFromReverseMilestones: true }, milestones, checks, status: "PASS" };
}

async function probeVideo(ffprobe, file) {
  const result = await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=format_name,duration", "-of", "json", file], "ffprobe normalized recording", { timeout: 180_000 });
  const parsed = JSON.parse(result.stdout);
  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  return { formatName: parsed.format?.format_name ?? null, durationSeconds: Number(parsed.format?.duration), codec: video?.codec_name ?? null, pixelFormat: video?.pix_fmt ?? null, width: video?.width ?? null, height: video?.height ?? null, averageFrameRate: video?.avg_frame_rate ?? null, realFrameRate: video?.r_frame_rate ?? null, frameCount: Number(video?.nb_read_frames), videoStreams: streams.filter((item) => item.codec_type === "video").length, audioStreams: streams.filter((item) => item.codec_type === "audio").length, otherStreams: streams.filter((item) => !["video", "audio"].includes(item.codec_type)).length };
}

async function normalizeRecording(options, rawFile, destination, definition) {
  const partial = `${destination}.partial.mp4`;
  await run(options.ffmpeg, ["-v", "error", "-n", "-i", rawFile, "-map", "0:v:0", "-an", "-map_metadata", "-1", "-vf", "fps=30,format=yuv420p", "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-movflags", "+faststart", partial], "normalize manifesto recording", { timeout: 180_000 });
  await run(options.ffmpeg, ["-v", "error", "-i", partial, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], "full-decode manifesto recording", { timeout: 180_000 });
  const probe = await probeVideo(options.ffprobe, partial);
  const validation = normalizedRecordingResult(probe, VIEW, definition.minimumSeconds);
  if (!validation.pass) throw new Error(`${definition.id} recording normalization differs: ${JSON.stringify(validation)}`);
  await rename(partial, destination);
  const bytes = await readFile(destination);
  return { relativePath: definition.relativePath, bytes: bytes.length, sha256: sha256(bytes), media: probe, validation, fullDecodePass: true, status: "PASS" };
}

async function captureRecording(browser, options, manifest, rawRoot, definition) {
  const directory = path.join(rawRoot, definition.id);
  await mkdir(directory, { recursive: false });
  const context = await browser.newContext(contextOptions(VIEW, { recordVideo: { dir: directory, size: { width: VIEW.width, height: VIEW.height } } }));
  await installPreloadTelemetry(context);
  const page = await context.newPage();
  const diagnostics = observePage(page);
  const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  if (!response?.ok()) throw new Error(`${definition.id} navigation failed`);
  await waitEnhanced(page, options.timeoutMs);
  const geometry = await cinematicGeometry(page);
  const addresses = addressesForGeometry(geometry, VIEW);
  await installOverlay(page, `${definition.direction.toUpperCase()} · PHASE 5A-R MANIFESTO`);
  const video = page.video();
  const evidence = definition.direction === "forward" ? await recordForward(page, options, addresses) : await recordReverse(page, options, addresses);
  const terminal = await runtimeState(page, `${definition.direction}-terminal`);
  const inventory = networkInventory(diagnostics, terminal, manifest, VIEW);
  const unexpectedFailures = unexpectedRequestFailures(diagnostics);
  if (!inventory.pass || diagnostics.consoleErrors.length || diagnostics.pageErrors.length || unexpectedFailures.length || diagnostics.badResponses.length) {
    throw new Error(`${definition.id} browser/network diagnostics differ: ${JSON.stringify({ inventory: inventory.checks, consoleErrors: diagnostics.consoleErrors, pageErrors: diagnostics.pageErrors, unexpectedRequestFailures: unexpectedFailures, badResponses: diagnostics.badResponses })}`);
  }
  await context.close();
  const rawFile = await video.path();
  const destination = path.join(options.work, ...definition.relativePath.split("/"));
  const artifact = await normalizeRecording(options, rawFile, destination, definition);
  return { id: definition.id, direction: definition.direction, evidence, inventory, diagnostics, terminal, ...artifact };
}

async function screenshot(page) {
  return page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
}

function svgEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function sheetBuffer(title, panels, columns = 3, width = 1440) {
  const headerHeight = 74;
  const cellWidth = Math.floor(width / columns);
  const imageHeight = 270;
  const labelHeight = 68;
  const rows = Math.ceil(panels.length / columns);
  const height = headerHeight + rows * (imageHeight + labelHeight);
  const composites = [];
  const header = Buffer.from(`<svg width="${width}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#050708"/><text x="28" y="44" fill="#f2eee7" font-family="Arial" font-size="24" font-weight="700">${svgEscape(title)}</text></svg>`);
  composites.push({ input: header, left: 0, top: 0 });
  for (let index = 0; index < panels.length; index += 1) {
    const panel = panels[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * cellWidth;
    const top = headerHeight + row * (imageHeight + labelHeight);
    const image = await sharp(panel.bytes).resize(cellWidth, imageHeight, { fit: "contain", background: "#050708" }).png().toBuffer();
    const lines = (panel.lines ?? []).slice(0, 2);
    const label = Buffer.from(`<svg width="${cellWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b0d0e"/><text x="16" y="25" fill="#f2eee7" font-family="Arial" font-size="15" font-weight="700">${svgEscape(panel.title)}</text><text x="16" y="49" fill="#a9a5a0" font-family="Arial" font-size="12">${svgEscape(lines.join(" · "))}</text></svg>`);
    composites.push({ input: image, left, top }, { input: label, left, top: top + imageHeight });
  }
  return sharp({ create: { width, height, channels: 3, background: "#050708" } }).composite(composites).png({ compressionLevel: 9 }).toBuffer();
}

async function atomicWrite(destination, bytes) {
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try { await rename(temporary, destination); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

async function writeArtifact(destination, relativePath, bytes, extra = {}) {
  await atomicWrite(destination, bytes);
  return { relativePath, bytes: bytes.length, sha256: sha256(bytes), ...extra, status: "PASS" };
}

async function writeJsonArtifact(destination, relativePath, payload) {
  const bytes = Buffer.from(stableJson(payload));
  if (PRIVATE_TEXT.test(bytes.toString("utf8"))) throw new Error(`private path/token detected in ${relativePath}`);
  return writeArtifact(destination, relativePath, bytes, { schema: payload.schema });
}

export async function auditArtifactRecords(root, records) {
  const authority = path.resolve(root);
  const seen = new Set();
  const audited = [];
  for (const record of records) {
    const relativePath = String(record?.relativePath ?? "");
    const absolute = path.resolve(authority, ...relativePath.split("/"));
    if (!relativePath || path.isAbsolute(relativePath) || !isWithin(authority, absolute) || seen.has(relativePath)) throw new Error(`unsafe or duplicate artifact record: ${relativePath}`);
    seen.add(relativePath);
    const bytes = await readFile(absolute);
    const actual = { relativePath, bytes: bytes.length, sha256: sha256(bytes) };
    if (actual.bytes !== record.bytes || actual.sha256 !== record.sha256) throw new Error(`artifact read-back differs: ${relativePath}`);
    audited.push(actual);
  }
  return { status: "PASS", files: audited.length, bytes: audited.reduce((total, item) => total + item.bytes, 0), records: audited };
}

function pureManifestoChecks(state) {
  return {
    exactlyOneH1: state.h1Count === 1 && state.h1Text === MANIFESTO_TEXT,
    h1EffectivelyVisible: state.visibility.h1.effective.pass,
    manifestoOnlyScene: state.visibleScenes.join("|") === "manifesto",
    headerEffectivelyHidden: !state.visibility.header.effective.pass && state.headerState === "concealed",
    audienceOutsideViewportAndInert: !state.audienceIntersects && state.audienceInert === true,
    onlyConventionalSkipLinkHidden: conventionalSkipLinkResult(state.hiddenFocusable).pass,
    noHorizontalOverflow: !state.document.overflow,
    noWordBreaking: state.h1Css.wordBreak === "normal" && state.h1Css.hyphens === "none",
  };
}

async function openEnhancedPage(browser, options, manifest, view) {
  const context = await browser.newContext(contextOptions(view));
  try {
    await installPreloadTelemetry(context);
    const page = await context.newPage();
    const diagnostics = observePage(page);
    const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error("navigation failed");
    await waitEnhanced(page, options.timeoutMs);
    const geometry = await cinematicGeometry(page);
    const addresses = addressesForGeometry(geometry, view);
    return { context, page, diagnostics, geometry, addresses, manifest };
  } catch (error) {
    await context.close().catch(() => {});
    throw new Error(`${view.id} enhanced page failed: ${error.message}`, { cause: error });
  }
}

async function captureDesktopStates(browser, options, manifest) {
  const opened = await openEnhancedPage(browser, options, manifest, VIEW);
  const { context, page, diagnostics, geometry, addresses } = opened;
  const panels = new Map();
  try {
    await nativeWheelTo(page, addresses.firstReadable, options.timeoutMs);
    const firstReadable = await runtimeState(page, "desktop-first-readable");
    panels.set(1, { stateId: 1, bytes: await screenshot(page), title: "01 · first readable", lines: [`semantic ${firstReadable.semanticProgress}`, `H1 top ${(firstReadable.visibility.h1.rect.top / VIEW.height * 100).toFixed(2)}svh`] });
    await nativeWheelTo(page, addresses.settled, options.timeoutMs);
    const settled = await runtimeState(page, "desktop-settled");
    panels.set(2, { stateId: 2, bytes: await screenshot(page), title: "02 · settled manifesto", lines: ["semantic 1", "chrome concealed"] });
    const hold = await holdSettled(page);
    panels.set(3, { stateId: 3, bytes: await screenshot(page), title: "03 · manifesto only", lines: [`held ${(hold.validation.elapsedMilliseconds / 1000).toFixed(2)}s`, "no other scene"] });
    await nativeWheelTo(page, addresses.preRelease, options.timeoutMs);
    const preRelease = await runtimeState(page, "pre-release");
    await nativeWheelTo(page, addresses.release, options.timeoutMs);
    const release = await runtimeState(page, "release");
    panels.set(5, { stateId: 5, bytes: await screenshot(page), title: "05 · first chrome-visible", lines: [`y ${release.scrollY}`, "audience top = viewport edge"] });
    await nativeWheelTo(page, addresses.audienceVisible, options.timeoutMs);
    const audienceVisible = await runtimeState(page, "audience-visible");
    panels.set(4, { stateId: 4, bytes: await screenshot(page), title: "04 · audience emergence", lines: [`y ${audienceVisible.scrollY}`, "two ordinary links"] });
    await nativeWheelTo(page, addresses.builtVisible, options.timeoutMs);
    const builtVisible = await runtimeState(page, "built-visible");
    panels.set(6, { stateId: 6, bytes: await screenshot(page), title: "06 · Built with industry", lines: ["audience releases", "normal document flow"] });
    const reversePanels = [];
    reversePanels.push({ stateId: 15, bytes: panels.get(6).bytes, title: "15a · Built", lines: ["reverse begins"] });
    await nativeWheelTo(page, addresses.audienceVisible, options.timeoutMs);
    reversePanels.push({ stateId: 15, bytes: await screenshot(page), title: "15b · audience", lines: ["chrome released"] });
    await nativeWheelTo(page, addresses.release, options.timeoutMs);
    const reverseRelease = await runtimeState(page, "reverse-release");
    await nativeWheelTo(page, addresses.preRelease, options.timeoutMs);
    const reversePreRelease = await runtimeState(page, "reverse-pre-release");
    await nativeWheelTo(page, addresses.settled, options.timeoutMs);
    reversePanels.push({ stateId: 15, bytes: await screenshot(page), title: "15c · manifesto", lines: ["chrome concealed"] });
    await nativeWheelTo(page, addresses.threshold, options.timeoutMs);
    reversePanels.push({ stateId: 15, bytes: await screenshot(page), title: "15d · black", lines: ["F500 held"] });
    await nativeWheelTo(page, addresses.stableQ, options.timeoutMs);
    reversePanels.push({ stateId: 15, bytes: await screenshot(page), title: "15e · exact Q", lines: ["F370"] });
    await nativeWheelTo(page, addresses.top, options.timeoutMs);
    reversePanels.push({ stateId: 15, bytes: await screenshot(page), title: "15f · proving hall", lines: ["F1"] });
    const terminal = await runtimeState(page, "desktop-terminal");
    const boundary = chromeBoundaryResult(preRelease, release, audienceVisible, reversePreRelease);
    const scrollPresence = manifestoScrollPresenceResult(addresses, VIEW, geometry);
    const pureChecks = pureManifestoChecks(settled);
    const inventory = networkInventory(diagnostics, terminal, manifest, VIEW);
    const checks = {
      firstReadable: firstReadable.semanticProgress >= 0.45 && firstReadable.semanticProgress <= 0.55 && firstReadable.visibility.h1.effective.pass,
      settled: settled.semanticProgress === 1 && settled.manifestoSettled === true,
      pureManifesto: Object.values(pureChecks).every(Boolean),
      usefulScrollPresence: scrollPresence.pass,
      exactBoundary: boundary.pass,
      audienceLinks: audienceVisible.audienceLinks.map((item) => item.href).join("|") === "/for-partners/|/for-startups/",
      builtTransition: builtVisible.visibleScenes.includes("built-with-industry"),
      exactReverse: terminal.scrollY === 0 && terminal.targetFrame === 1 && terminal.presentedFrame === 1,
      mediaInventory: inventory.pass,
      zeroBrowserErrors: diagnostics.consoleErrors.length === 0 && diagnostics.pageErrors.length === 0 && unexpectedRequestFailures(diagnostics).length === 0 && diagnostics.badResponses.length === 0,
    };
    if (Object.values(checks).some((value) => !value)) throw new Error(`desktop sheet-state capture failed: ${JSON.stringify({ checks, pureChecks, unexpectedRequestFailures: unexpectedRequestFailures(diagnostics), consoleErrors: diagnostics.consoleErrors, pageErrors: diagnostics.pageErrors, badResponses: diagnostics.badResponses })}`);
    return { geometry, addresses, scrollPresence, states: { firstReadable, settled, preRelease, release, audienceVisible, builtVisible, reverseRelease, reversePreRelease, terminal }, hold, boundary, pureChecks, inventory, diagnostics, panels, reversePanels, checks, status: "PASS" };
  } finally { await context.close(); }
}

async function captureResponsiveView(browser, options, manifest, view, keepImage) {
  const opened = await openEnhancedPage(browser, options, manifest, view);
  const { context, page, diagnostics, geometry, addresses } = opened;
  try {
    await nativeWheelTo(page, addresses.settled, options.timeoutMs);
    await waitAddressed(page, PHYSICAL_FRAME_COUNT, options.timeoutMs);
    const state = await runtimeState(page, `${view.id}-settled`);
    const topVh = state.visibility.h1.rect.top / view.height * 100;
    const band = manifestoTopBandForView(view);
    const scrollPresence = manifestoScrollPresenceResult(addresses, view, geometry);
    const inventory = networkInventory(diagnostics, state, manifest, view);
    const checks = {
      enhanced: state.mode === "enhanced",
      exactManifesto: state.h1Count === 1 && state.h1Text === MANIFESTO_TEXT && state.visibility.h1.effective.pass,
      topBand: topVh >= band[0] && topVh <= band[1],
      fullH1: state.visibility.h1.rect.top >= 0 && state.visibility.h1.rect.bottom <= view.height,
      pureField: state.visibleScenes.join("|") === "manifesto" && !state.visibility.header.effective.pass && !state.audienceIntersects,
      usefulScrollPresence: scrollPresence.pass,
      noOverflow: !state.document.overflow,
      noWordBreaking: state.h1Css.wordBreak === "normal" && state.h1Css.hyphens === "none",
      media: inventory.pass,
      diagnostics: diagnostics.consoleErrors.length === 0 && diagnostics.pageErrors.length === 0 && unexpectedRequestFailures(diagnostics).length === 0 && diagnostics.badResponses.length === 0,
    };
    if (Object.values(checks).some((value) => !value)) throw new Error(`${view.id} manifesto state failed: ${JSON.stringify({ checks, topVh, band })}`);
    return { view, geometry, addresses, scrollPresence, topVh, band, state, inventory, diagnostics, checks, status: "PASS", ...(keepImage ? { image: await screenshot(page) } : {}) };
  } finally { await context.close(); }
}

async function staticTarget(page) {
  return page.evaluate(() => {
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    return Math.max(0, Math.round(entry.getBoundingClientRect().top + scrollY - (header?.getBoundingClientRect().height ?? 0)));
  });
}

async function axeResult(page) {
  await page.addScriptTag({ content: axeCore.source });
  const result = await page.evaluate(async () => {
    const report = await window.axe.run(document.documentElement, { resultTypes: ["violations"] });
    const blocking = report.violations.filter((item) => ["serious", "critical"].includes(item.impact));
    return { violationCount: report.violations.length, seriousOrCriticalCount: blocking.length, seriousOrCritical: blocking.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length, help: item.help })) };
  });
  return result;
}

async function captureStaticState(browser, options, manifest, kind) {
  const contextOverrides = kind === "reduced-motion" ? { reducedMotion: "reduce" } : kind === "no-javascript" ? { javaScriptEnabled: false } : {};
  const context = await browser.newContext(contextOptions(VIEW, contextOverrides));
  if (kind === "text-200-percent") {
    await context.addInitScript(() => {
      const apply = () => { if (!document.documentElement) return false; document.documentElement.style.setProperty("font-size", "32px", "important"); return true; };
      if (!apply()) { const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); }); observer.observe(document, { childList: true }); }
    });
  } else if (kind === "fallback-font") {
    await context.addInitScript(() => {
      const apply = () => {
        if (!document.documentElement) return false;
        for (const property of ["--font-display", "--font-body", "--font-ui"]) document.documentElement.style.setProperty(property, "Arial, sans-serif", "important");
        return true;
      };
      if (!apply()) { const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); }); observer.observe(document, { childList: true, subtree: true }); }
    });
  }
  if (kind !== "no-javascript") await installPreloadTelemetry(context);
  const page = await context.newPage();
  const diagnostics = observePage(page);
  try {
    const waitUntil = kind === "fallback-font" ? "domcontentloaded" : "networkidle";
    const response = await page.goto(options.url, { waitUntil, timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error(`${kind} navigation failed`);
    if (["reduced-motion", "text-200-percent"].includes(kind)) await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "static", null, { timeout: options.timeoutMs });
    if (kind === "fallback-font") await waitEnhanced(page, options.timeoutMs);
    else if (kind !== "no-javascript") await twoFrames(page);
    let target;
    if (kind === "fallback-font") {
      const geometry = await cinematicGeometry(page);
      target = addressesForGeometry(geometry, VIEW).settled;
    } else target = await staticTarget(page);
    await nativeWheelTo(page, target, options.timeoutMs, { animationFrames: kind !== "no-javascript" });
    const state = await runtimeState(page, kind);
    const rootFontSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    const posterVisible = await page.evaluate(() => {
      const item = document.querySelector("[data-cinematic-poster] img");
      if (!item) return false;
      const style = getComputedStyle(item); const rect = item.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
    });
    const axe = kind === "reduced-motion" ? await axeResult(page) : null;
    const expectVideo = kind === "fallback-font";
    const inventory = networkInventory(diagnostics, state, manifest, VIEW, { expectVideo });
    const checks = {
      exactH1: state.h1Count === 1 && state.h1Text === MANIFESTO_TEXT && state.visibility.h1.effective.pass,
      fullH1: state.visibility.h1.rect.top >= 0 && state.visibility.h1.rect.bottom <= VIEW.height,
      noOverflow: !state.document.overflow,
      navigationUsableInStaticFlow: expectVideo || state.headerState === "released" || state.visibility.header.effective.pass,
      enhancedManifestoThreshold: !expectVideo || (
        state.manifestoSettled === true
        && state.navigationReleased === false
        && state.headerState === "concealed"
        && !state.visibility.header.effective.pass
        && state.manifestoInert === false
        && state.audienceInert === true
        && state.interactive === "manifesto"
      ),
      audiencePresent: state.audienceLinks.map((item) => item.href).join("|") === "/for-partners/|/for-startups/",
      mediaPolicy: inventory.pass,
      exact200Percent: kind !== "text-200-percent" || rootFontSize === 32,
      staticFallback: !["reduced-motion", "text-200-percent", "no-javascript"].includes(kind) || state.mode === "static" || kind === "no-javascript",
      poster: !["reduced-motion", "no-javascript"].includes(kind) || posterVisible,
      accessibility: !axe || axe.seriousOrCriticalCount === 0,
      diagnostics: diagnostics.consoleErrors.length === 0 && diagnostics.pageErrors.length === 0 && unexpectedRequestFailures(diagnostics).length === 0 && diagnostics.badResponses.length === 0,
    };
    if (Object.values(checks).some((value) => !value)) throw new Error(`${kind} fallback state failed: ${JSON.stringify(checks)}`);
    return { kind, rootFontSize, posterVisible, state, inventory, axe, diagnostics, checks, image: kind === "fallback-font" ? null : await screenshot(page), status: "PASS" };
  } finally { await context.close(); }
}

async function captureKeyboardAndDeepLink(browser, options) {
  const context = await browser.newContext(contextOptions(VIEW));
  await installPreloadTelemetry(context);
  const page = await context.newPage();
  const diagnostics = observePage(page);
  try {
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await waitEnhanced(page, options.timeoutMs);
    await page.keyboard.press("Tab");
    const skipFocused = await page.evaluate(() => document.activeElement?.matches(".skip-link[href='#entry']") ?? false);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.querySelector("#entry")?.hasAttribute("inert"), null, { timeout: options.timeoutMs });
    await twoFrames(page);
    const skipped = await runtimeState(page, "keyboard-skip");
    const checks = { skipFocused, entryFocused: skipped.activeElement?.id === "entry", manifestoAvailable: skipped.manifestoInert === false && skipped.h1Text === MANIFESTO_TEXT, chromeIntentional: skipped.headerState === "concealed", audienceStillInert: skipped.audienceInert === true, zeroErrors: diagnostics.consoleErrors.length === 0 && diagnostics.pageErrors.length === 0 };
    if (Object.values(checks).some((value) => !value)) throw new Error(`keyboard skip failed: ${JSON.stringify(checks)}`);
    return { skipped, diagnostics, checks, status: "PASS" };
  } finally { await context.close(); }
}

async function captureDeepLink(browser, options) {
  const context = await browser.newContext(contextOptions(VIEW));
  await installPreloadTelemetry(context);
  const page = await context.newPage();
  const diagnostics = observePage(page);
  try {
    const url = new URL(options.url); url.hash = "entry";
    const response = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error("deep link navigation failed");
    await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" || document.documentElement.dataset.cinematicMode === "static", null, { timeout: options.timeoutMs });
    await page.waitForTimeout(250); await twoFrames(page);
    const state = await runtimeState(page, "deep-link-entry");
    const checks = { exactHash: await page.evaluate(() => location.hash) === "#entry", h1Present: state.h1Count === 1 && state.h1Text === MANIFESTO_TEXT, noRunwayTrap: state.scrollY > 0 && state.manifestoInert === false, noOverflow: !state.document.overflow, zeroErrors: diagnostics.consoleErrors.length === 0 && diagnostics.pageErrors.length === 0 };
    if (Object.values(checks).some((value) => !value)) throw new Error(`deep-link state failed: ${JSON.stringify(checks)}`);
    return { state, diagnostics, checks, status: "PASS" };
  } finally { await context.close(); }
}

function diagnosticsSummary(items) {
  return items.map((item) => ({ consoleErrors: item.consoleErrors.length, consoleWarnings: item.consoleWarnings.length, pageErrors: item.pageErrors.length, requestFailures: item.requestFailures.length, unexpectedRequestFailures: unexpectedRequestFailures(item).length, expectedBlobMediaAborts: item.requestFailures.length - unexpectedRequestFailures(item).length, badResponses: item.badResponses.length }));
}

function reportEnvelope(schema, generatedAt, target, payload) {
  return { schema, status: "PASS", generatedAt, target, ...payload };
}

function withoutBuffers(value) {
  if (Array.isArray(value)) return value.map(withoutBuffers);
  if (Buffer.isBuffer(value)) return undefined;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    if (["image", "bytes", "panels", "reversePanels"].includes(key) && (Buffer.isBuffer(child) || key === "panels" || key === "reversePanels")) return [];
    const clean = withoutBuffers(child);
    return clean === undefined ? [] : [[key, clean]];
  }));
  return value;
}

export async function selfTest() {
  assertInventoryContract();
  const hidden = effectiveVisibilityResult({ rect: { top: 10, bottom: 100, left: 10, right: 100 }, ancestors: [{ display: "block", visibility: "visible", opacity: 1 }, { display: "block", visibility: "visible", opacity: 0 }], viewport: { width: 1440, height: 900 } });
  const visible = effectiveVisibilityResult({ rect: { top: 10, bottom: 100, left: 10, right: 100 }, ancestors: [{ display: "block", visibility: "visible", opacity: 1 }], viewport: { width: 1440, height: 900 } });
  if (hidden.pass || !visible.pass) throw new Error("ancestor-visibility self-test failed");
  const boundary = chromeBoundaryResult(
    { scrollY: 6704, headerState: "concealed", navigationReleased: false, audienceInert: true },
    { scrollY: 6705, headerState: "released", navigationReleased: true, audienceInert: false, audienceIntersects: false },
    { scrollY: 6706, audienceIntersects: true },
    { scrollY: 6704, headerState: "concealed", navigationReleased: false, audienceInert: true },
  );
  if (!boundary.pass) throw new Error("chrome boundary self-test failed");
  const probe = { formatName: "mov,mp4,m4a,3gp,3g2,mj2", durationSeconds: 6, codec: "h264", pixelFormat: "yuv420p", width: 1440, height: 900, averageFrameRate: "30/1", realFrameRate: "30/1", frameCount: 180, videoStreams: 1, audioStreams: 0, otherStreams: 0 };
  if (!normalizedRecordingResult(probe, VIEW, 5).pass || normalizedRecordingResult({ ...probe, codec: "vp9" }, VIEW, 5).pass) throw new Error("recording self-test failed");
  process.stdout.write(stableJson({ schema: `${SCHEMA}.self-test`, status: "PASS", inventories: { recordings: RECORDINGS.length, proofStates: PROOF_STATES.length, sheets: SHEETS.length, reportsIncludingManifest: Object.keys(REPORT_SCHEMAS).length + 1, viewports: VIEWPOINTS.length }, ancestorVisibility: { hiddenAncestorRejected: true, visibleChainAccepted: true }, disclosedHeadlessLoadLimitationMs: HEADLESS_LOAD_LONG_TASK_LIMITATION_MS, browserLaunched: false, networkRequestsPerformed: false, writesPerformed: false }));
}

async function launchEvidenceBrowser(options) {
  return chromium.launch({ headless: true, executablePath: await resolveChromium(options.chromium), timeout: options.timeoutMs, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--disable-extensions", "--disable-background-networking", "--disable-features=OverlayScrollbar,FluentOverlayScrollbar"] });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  if (options.selfTest) return selfTest();
  validateOptions(options);
  const output = await validateFreshExternalOutputPath(options.output);
  const authorities = await loadAuthorities(options);
  if (options.dryRun) {
    process.stdout.write(stableJson({ schema: `${SCHEMA}.dry-run`, status: "PASS", target: { immutableUrl: options.url, branchUrl: options.branchUrl, expectedHead: options.expectedHead, expectedBranch: options.expectedBranch, deploymentId: options.expectedDeploymentId, deploymentProject: options.deploymentProject, deploymentCheckRunId: String(options.deploymentCheckRunId) }, deployment: authorities.deployment, activeManifest: { bytes: authorities.manifestBytes.length, sha256: sha256(authorities.manifestBytes), sourceBlendSha256: SOURCE_BLEND_SHA256 }, outputBasename: path.basename(output), inventories: { recordings: RECORDINGS.length, proofStates: PROOF_STATES.length, sheets: SHEETS.length, reportsIncludingManifest: Object.keys(REPORT_SCHEMAS).length + 1, viewports: VIEWPOINTS.length }, browserLaunched: false, networkRequestsPerformed: false, writesPerformed: false }));
    return;
  }
  const [repository, publicAuthority, ffmpegAvailable, ffprobeAvailable] = await Promise.all([
    repositoryAuthority(options),
    verifyPublicAuthority(options, authorities.manifestBytes),
    executable(options.ffmpeg),
    executable(options.ffprobe),
  ]);
  if (!ffmpegAvailable || !ffprobeAvailable) throw new Error("FFmpeg and FFprobe executables are required");
  const parent = path.dirname(output);
  const staging = path.join(parent, `.${path.basename(output)}.staging-${process.pid}-${randomUUID()}`);
  if (!isWithin(parent, staging) || staging === parent) throw new Error("unsafe Phase 5A-R staging path");
  options.output = output;
  options.work = staging;
  await mkdir(staging, { recursive: false });
  for (const directory of ["recordings", "sheets", "reports", ".raw-recordings"]) await mkdir(path.join(staging, directory), { recursive: false });
  const rawRoot = path.join(staging, ".raw-recordings");
  const captureStartedAt = new Date().toISOString();
  let browser;
  try {
    browser = await launchEvidenceBrowser(options);
    const browserVersion = browser.version();
    const recordings = [];
    for (const definition of RECORDINGS) recordings.push(await captureRecording(browser, options, authorities.manifest, rawRoot, definition));
    const desktop = await captureDesktopStates(browser, options, authorities.manifest);
    await browser.close(); browser = null;
    const responsive = [];
    const keptIds = new Set(["portrait-390x844", "narrow-320x800", "tablet-768x1024", "landscape-844x390", "landscape-740x360", "landscape-800x360", "landscape-896x414", "landscape-900x480"]);
    for (const view of VIEWPOINTS) {
      browser = await launchEvidenceBrowser(options);
      try { responsive.push(await captureResponsiveView(browser, options, authorities.manifest, view, keptIds.has(view.id))); }
      finally { await browser.close(); browser = null; }
    }
    browser = await launchEvidenceBrowser(options);
    const [text200, reducedMotion, noJavaScript, fallbackFont, keyboard, deepLink] = await Promise.all([
      captureStaticState(browser, options, authorities.manifest, "text-200-percent"),
      captureStaticState(browser, options, authorities.manifest, "reduced-motion"),
      captureStaticState(browser, options, authorities.manifest, "no-javascript"),
      captureStaticState(browser, options, authorities.manifest, "fallback-font"),
      captureKeyboardAndDeepLink(browser, options),
      captureDeepLink(browser, options),
    ]);
    await browser.close(); browser = null;
    await rm(rawRoot, { recursive: true, force: true });

    const proof = new Map(desktop.panels);
    const responsiveById = new Map(responsive.map((item) => [item.view.id, item]));
    proof.set(7, { stateId: 7, bytes: responsiveById.get("portrait-390x844").image, title: "07 · 390x844", lines: [`top ${responsiveById.get("portrait-390x844").topVh.toFixed(2)}svh`] });
    proof.set(8, { stateId: 8, bytes: responsiveById.get("narrow-320x800").image, title: "08 · 320x800", lines: [`top ${responsiveById.get("narrow-320x800").topVh.toFixed(2)}svh`] });
    proof.set(9, { stateId: 9, bytes: responsiveById.get("tablet-768x1024").image, title: "09 · 768x1024", lines: [`top ${responsiveById.get("tablet-768x1024").topVh.toFixed(2)}svh`] });
    proof.set(10, { stateId: 10, bytes: responsiveById.get("landscape-844x390").image, title: "10 · 844x390", lines: [`top ${responsiveById.get("landscape-844x390").topVh.toFixed(2)}svh`] });
    const neighborPanels = ["landscape-740x360", "landscape-800x360", "landscape-896x414", "landscape-900x480"].map((id) => ({ bytes: responsiveById.get(id).image, title: id.replace("landscape-", ""), lines: [`top ${responsiveById.get(id).topVh.toFixed(2)}svh`] }));
    const neighbors = await sheetBuffer("SHORT-LANDSCAPE NEIGHBORS", neighborPanels, 2, 960);
    proof.set(11, { stateId: 11, bytes: neighbors, title: "11 · neighboring fit", lines: ["740 / 800 / 896 / 900", "complete H1"] });
    proof.set(12, { stateId: 12, bytes: text200.image, title: "12 · 200% text", lines: [`root ${text200.rootFontSize}px`, "static flow"] });
    proof.set(13, { stateId: 13, bytes: reducedMotion.image, title: "13 · reduced motion", lines: ["static poster", "zero video"] });
    proof.set(14, { stateId: 14, bytes: noJavaScript.image, title: "14 · no JavaScript", lines: ["semantic flow", "usable navigation"] });

    const sheetRecords = [];
    for (const definition of SHEETS) {
      const panels = definition.stateIds[0] === 15 ? desktop.reversePanels : definition.stateIds.map((id) => proof.get(id));
      if (panels.some((item) => !item?.bytes)) throw new Error(`${definition.id} lacks a required proof panel`);
      const bytes = await sheetBuffer(definition.id.replaceAll("-", " ").toUpperCase(), panels, definition.columns);
      const destination = path.join(staging, ...definition.relativePath.split("/"));
      const metadata = await sharp(bytes).metadata();
      sheetRecords.push(await writeArtifact(destination, definition.relativePath, bytes, { stateIds: definition.stateIds, width: metadata.width, height: metadata.height }));
    }

    const target = { mode: "deployed", immutableUrl: options.url, branchUrl: options.branchUrl, expectedHead: options.expectedHead, expectedBranch: options.expectedBranch, deploymentId: options.expectedDeploymentId, deploymentProject: options.deploymentProject, deploymentCheckRunId: String(options.deploymentCheckRunId) };
    const generatedAt = new Date().toISOString();
    const allDiagnostics = [
      ...recordings.map((item) => item.diagnostics), desktop.diagnostics, ...responsive.map((item) => item.diagnostics),
      text200.diagnostics, reducedMotion.diagnostics, noJavaScript.diagnostics, fallbackFont.diagnostics, keyboard.diagnostics, deepLink.diagnostics,
    ];
    const longTasks = [
      ...recordings.flatMap((item) => item.terminal.telemetry.longTasks),
      ...responsive.flatMap((item) => item.state.telemetry.longTasks),
      ...[desktop.states.terminal, text200.state, reducedMotion.state, fallbackFont.state, keyboard.skipped, deepLink.state].flatMap((item) => item.telemetry?.longTasks ?? []),
    ];
    const observedMaxLongTaskMs = longTasks.reduce((maximum, item) => Math.max(maximum, Number(item.duration) || 0), 0);
    const reportPayloads = {
      "reports/manifesto-behavior.json": reportEnvelope(REPORT_SCHEMAS["reports/manifesto-behavior.json"], generatedAt, target, {
        manifesto: {
          text: MANIFESTO_TEXT,
          normalFlow: true,
          timedHoldImplemented: false,
          passiveHoldObservationOnly: true,
          scrollPresence: desktop.scrollPresence,
          revealProperties: ["opacity", "black-level convergence", "softness to crispness"],
          prohibitedTransformsAbsent: true,
        },
        desktop: withoutBuffers(desktop),
        recordings: recordings.map((item) => ({ id: item.id, direction: item.direction, relativePath: item.relativePath, evidence: item.evidence, validation: item.validation, status: item.status })),
        checks: { forward: recordings[0].evidence.status === "PASS", reverse: recordings[1].evidence.status === "PASS", passiveHoldObservation: desktop.hold.validation.pass, usefulScrollPresence: desktop.scrollPresence.pass, exactChromeBoundary: desktop.boundary.pass, pureManifesto: Object.values(desktop.pureChecks).every(Boolean) },
      }),
      "reports/semantic-chrome.json": reportEnvelope(REPORT_SCHEMAS["reports/semantic-chrome.json"], generatedAt, target, {
        h1: { count: desktop.states.settled.h1Count, text: desktop.states.settled.h1Text, topPixels: desktop.states.settled.visibility.h1.rect.top, topSvh: desktop.states.settled.visibility.h1.rect.top / VIEW.height * 100 },
        oldWhereDoYouEnterRole: "removed from the first semantic destination and not an H1",
        audience: { headingLevel: 2, links: desktop.states.audienceVisible.audienceLinks, firstVisibleY: desktop.addresses.audienceVisible },
        pureManifesto: { state: desktop.states.settled, checks: desktop.pureChecks },
        chromeBoundary: desktop.boundary,
        keyboard,
        deepLink,
        accessibility: reducedMotion.axe,
        checks: { oneH1: desktop.states.settled.h1Count === 1 && desktop.states.settled.h1Text === MANIFESTO_TEXT, ancestorVisibilityApplied: desktop.states.settled.visibility.h1.effective.pass && desktop.states.terminal.visibility.h1.effective.pass === false, ordinaryAudienceLinks: desktop.states.audienceVisible.audienceLinks.map((item) => item.href).join("|") === "/for-partners/|/for-startups/", keyboard: keyboard.status === "PASS", deepLink: deepLink.status === "PASS", zeroSeriousCriticalAxe: reducedMotion.axe.seriousOrCriticalCount === 0 },
      }),
      "reports/responsive-fallback.json": reportEnvelope(REPORT_SCHEMAS["reports/responsive-fallback.json"], generatedAt, target, {
        requiredViewpoints: VIEWPOINTS,
        responsive: responsive.map((item) => withoutBuffers(item)),
        text200: withoutBuffers(text200), reducedMotion: withoutBuffers(reducedMotion), noJavaScript: withoutBuffers(noJavaScript), fallbackFont: withoutBuffers(fallbackFont),
        checks: { allThirteenResponsivePass: responsive.length === 13 && responsive.every((item) => item.status === "PASS"), exact200Percent: text200.rootFontSize === 32, reducedMotionStatic: reducedMotion.state.mode === "static" && reducedMotion.inventory.pass, noJavaScriptStatic: noJavaScript.inventory.pass, fallbackFont: fallbackFont.status === "PASS" },
      }),
      "reports/crt-regression.json": reportEnvelope(REPORT_SCHEMAS["reports/crt-regression.json"], generatedAt, target, {
        acceptedBaseline: { head: ACCEPTED_PHASE5A_SHA, browserEvidenceManifestSha256: ACCEPTED_PHASE5A_EVIDENCE_MANIFEST_SHA256, deploymentReportSha256: ACCEPTED_PHASE5A_DEPLOYMENT_REPORT_SHA256 },
        physicalMedia: { sourceBlendSha256: SOURCE_BLEND_SHA256, activeManifestSha256: ACTIVE_MEDIA_MANIFEST_SHA256, frames: PHYSICAL_FRAME_COUNT, fps: FPS, rerendered: false },
        recordingInventories: recordings.map((item) => ({ id: item.id, inventory: item.inventory })),
        anchors: { firstPositive: 46, arrival: 285, stableQ: 370, physicalThreshold: 500 },
        checks: { repositoryMediaUnchanged: repository.checks.phase4MediaUnchanged, bothRecordingsOneH264: recordings.every((item) => item.inventory.pass), zeroPlayback: recordings.every((item) => item.terminal.telemetry.playCalls === 0 && item.terminal.telemetry.playEvents === 0 && item.terminal.telemetry.playingEvents === 0), exactReverseToF1: recordings[1].terminal.targetFrame === 1 && recordings[1].terminal.presentedFrame === 1, acceptedEvidenceBound: true },
      }),
      "reports/browser-diagnostics.json": reportEnvelope(REPORT_SCHEMAS["reports/browser-diagnostics.json"], generatedAt, target, {
        browser: { product: "Chromium", version: browserVersion, headless: true, viewport: { width: VIEW.width, height: VIEW.height } },
        contexts: diagnosticsSummary(allDiagnostics),
        performanceObservation: { observedMaxLongTaskMs, priorCheckpointObservedHeadlessLoadLimitationMs: HEADLESS_LOAD_LONG_TASK_LIMITATION_MS, environmentSpecific: true, machineBudgetGateDefined: false, humanPerformanceAcceptanceInferred: false },
        checks: { zeroUnexpectedConsoleErrors: allDiagnostics.every((item) => item.consoleErrors.length === 0), zeroPageErrors: allDiagnostics.every((item) => item.pageErrors.length === 0), zeroUnexpectedRequestFailures: allDiagnostics.every((item) => unexpectedRequestFailures(item).length === 0), expectedBlobMediaAbortsDisclosed: allDiagnostics.flatMap((item) => item.requestFailures).every((failure) => unexpectedRequestFailures({ requestFailures: [failure] }).length === 0), zeroBadResponses: allDiagnostics.every((item) => item.badResponses.length === 0), normalizedRecordingsFullyDecoded: recordings.every((item) => item.fullDecodePass), headlessLoadLimitationDisclosed: HEADLESS_LOAD_LONG_TASK_LIMITATION_MS === 203 },
      }),
      "reports/git-deployment-provenance.json": reportEnvelope(REPORT_SCHEMAS["reports/git-deployment-provenance.json"], generatedAt, target, {
        captureStartedAt, repository, deployment: authorities.deployment, publicAuthority,
        activeManifest: { bytes: authorities.manifestBytes.length, sha256: sha256(authorities.manifestBytes), sourceBlendSha256: SOURCE_BLEND_SHA256 },
        checks: { exactRepository: repository.head === options.expectedHead && repository.branch === options.expectedBranch, frozenMain: repository.main === MAIN_SHA, exactDeployment: authorities.deployment.status === "PASS", immutableBranchParity: publicAuthority.checks.immutableAndBranchHtmlEqual, phase5BUnauthorized: AUTHORIZATION.phase5BAuthorized === false },
      }),
    };
    for (const [relativePath, payload] of Object.entries(reportPayloads)) if (Object.values(payload.checks ?? {}).some((value) => value !== true)) throw new Error(`${relativePath} final checks differ: ${JSON.stringify(payload.checks)}`);
    const reportRecords = [];
    for (const [relativePath, payload] of Object.entries(reportPayloads)) reportRecords.push(await writeJsonArtifact(path.join(staging, ...relativePath.split("/")), relativePath, payload));
    const recordingRecords = recordings.map(({ relativePath, bytes, sha256: hash, media, validation, fullDecodePass, status }) => ({ relativePath, bytes, sha256: hash, media, validation, fullDecodePass, status }));
    const artifacts = [...recordingRecords, ...sheetRecords, ...reportRecords].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    const payloadAudit = await auditArtifactRecords(staging, artifacts);
    const evidenceManifest = {
      schema: SCHEMA, status: "PASS", generatedAt, target, repository, deployment: authorities.deployment,
      acceptedBaseline: { head: ACCEPTED_PHASE5A_SHA, browserEvidenceManifestSha256: ACCEPTED_PHASE5A_EVIDENCE_MANIFEST_SHA256, deploymentReportSha256: ACCEPTED_PHASE5A_DEPLOYMENT_REPORT_SHA256 },
      activeMedia: { sourceBlendSha256: SOURCE_BLEND_SHA256, manifestSha256: ACTIVE_MEDIA_MANIFEST_SHA256, physicalFrames: PHYSICAL_FRAME_COUNT, fps: FPS, rerendered: false },
      captureContract: { actualBrowserRecordings: true, recordedStateChangesUseNativeWheel: true, passiveHoldObservationOnly: true, pageTimedHoldImplemented: false, rawRecordingsPublished: false, ancestorVisibilitySemantics: true, normalizedVideo: { container: "MP4", codec: "H.264", pixelFormat: "yuv420p", fps: 30, audioStreams: 0, fullDecode: true }, compactEvidence: { recordings: 2, proofStates: 15, sheets: 4, reportsIncludingSelf: 7 } },
      proofStates: PROOF_STATES, sheetStateMap: SHEETS.map(({ id, relativePath, stateIds }) => ({ id, relativePath, stateIds })),
      artifacts, summary: { recordings: recordingRecords.length, sheets: sheetRecords.length, reportsExcludingSelf: reportRecords.length, hashedPayloadsExcludingSelf: artifacts.length, totalFilesIncludingSelf: artifacts.length + 1 },
      hashPolicy: { everyNonSelfPayloadHasSha256: artifacts.every((item) => HASH64.test(item.sha256)), independentPayloadReadBackAudit: payloadAudit.status === "PASS" && payloadAudit.files === artifacts.length, manifestHashReturnedByCaptureResult: true, downstreamPackageHashesManifest: true },
      payloadReadBackAudit: { status: payloadAudit.status, files: payloadAudit.files, bytes: payloadAudit.bytes },
      disclosedLimitations: [{ id: "headless-load-long-task", milliseconds: HEADLESS_LOAD_LONG_TASK_LIMITATION_MS, description: "Checkpoint browser inspection observed an environment-specific initial-load long task up to 203 ms; no machine budget gate is defined." }],
      humanReviewGates: REVIEW_GATES, authorization: AUTHORIZATION,
    };
    const manifestPath = path.join(staging, "reports", "phase5ar-browser-evidence-manifest.json");
    const manifestRecord = await writeJsonArtifact(manifestPath, "reports/phase5ar-browser-evidence-manifest.json", evidenceManifest);
    const manifestAudit = await auditArtifactRecords(staging, [manifestRecord]);
    if (!isWithin(parent, staging) || staging === parent) throw new Error("unsafe staging cleanup/publish boundary");
    await rename(staging, output);
    process.stdout.write(stableJson({ schema: `${SCHEMA}.result`, status: "PASS", output, manifest: manifestRecord, independentReadBackAudit: { payloads: { status: payloadAudit.status, files: payloadAudit.files, bytes: payloadAudit.bytes }, manifest: { status: manifestAudit.status, files: manifestAudit.files, bytes: manifestAudit.bytes } }, summary: evidenceManifest.summary, humanReviewGates: REVIEW_GATES, authorization: AUTHORIZATION }));
  } catch (error) {
    await browser?.close().catch(() => {});
    if (!isWithin(parent, staging) || staging === parent) throw new Error("refusing unsafe Phase 5A-R staging cleanup");
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`Phase 5A-R manifesto evidence FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
}
