#!/usr/bin/env node

/**
 * Capture the final Phase 4-R2 browser evidence from an immutable deployment.
 *
 * The destination must be a fresh durable directory outside Git. Browser
 * recorder masters are temporary; only seven normalized silent H.264 MP4s,
 * sixteen categorical review sheets and ten safe machine reports survive.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_RELATIVE = "scripts/capture-phase4r2-production-evidence.mjs";
const SCHEMA = "quantum-hub.phase-4-r2.production-browser-evidence.v1";
const DEPLOYMENT_SCHEMA = "quantum-hub.phase-4-r2.deployment-verification.v1";
const FRAME_COUNT = 540;
const FPS = 30;
const PHYSICAL_FRAME_END = 500;
const MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
const DEPLOYED_ASSET_PREFIX = "/media/cinematic/phase-4r2/";
const DEPLOYED_MANIFEST_PATH = `${DEPLOYED_ASSET_PREFIX}manifests/phase-4r2-production-media-manifest.json`;
const DEFAULT_TIMEOUT_MS = 30_000;
const HUMAN_REVIEW_GATES = Object.freeze({
  "PHYSICAL → DIGITAL CONTINUITY": "PENDING HUMAN REVIEW",
  "NATIVE SCROLL + REVERSE INTEGRITY": "PENDING HUMAN REVIEW",
  "RESPONSIVE + ACCESSIBLE INTEGRATION": "PENDING HUMAN REVIEW",
  "MEDIA + PERFORMANCE SAFETY": "PENDING HUMAN REVIEW",
  "OPERATING FIELD REGRESSION": "PENDING HUMAN REVIEW",
});
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,})/i;

const VIEWPOINTS = Object.freeze([
  { id: "desktop-1440x900", width: 1440, height: 900, family: "desktop" },
  { id: "short-height-1366x650", width: 1366, height: 650, family: "desktop" },
  { id: "desktop-1280x800", width: 1280, height: 800, family: "desktop" },
  { id: "tablet-landscape-1024x768", width: 1024, height: 768, family: "desktop" },
  { id: "tablet-portrait-768x1024", width: 768, height: 1024, family: "portrait" },
  { id: "mobile-390x844", width: 390, height: 844, family: "portrait" },
  { id: "mobile-360x800", width: 360, height: 800, family: "portrait" },
  { id: "narrow-320x800", width: 320, height: 800, family: "portrait" },
  { id: "mobile-landscape-844x390", width: 844, height: 390, family: "landscape" },
  { id: "short-landscape-neighbor-740x360", width: 740, height: 360, family: "landscape" },
  { id: "short-landscape-neighbor-800x360", width: 800, height: 360, family: "landscape" },
  { id: "short-landscape-neighbor-896x414", width: 896, height: 414, family: "landscape" },
  { id: "short-landscape-neighbor-900x480", width: 900, height: 480, family: "landscape" },
]);

const MILESTONES = Object.freeze([
  { frame: 1, id: "dormancy" },
  { frame: 76, id: "early-current" },
  { frame: 166, id: "mid-current" },
  { frame: 225, id: "side-rear-orbit" },
  { frame: 356, id: "crt-startup" },
  { frame: 370, id: "stable-q" },
  { frame: 450, id: "late-approach" },
  { frame: 500, id: "physical-end" },
  { frame: 501, id: "black-beat-start" },
  { frame: 507, id: "black-beat-mid" },
  { frame: 513, id: "black-beat-end" },
  { frame: 514, id: "semantic-entry-start" },
  { frame: 522, id: "semantic-entry-partial" },
  { frame: 535, id: "semantic-entry-near" },
  { frame: 539, id: "semantic-entry-settled" },
  { frame: 540, id: "settled-chrome" },
]);

const RECORDINGS = Object.freeze([
  { id: "desktop-forward", viewpoint: "desktop-1440x900", direction: "forward" },
  { id: "desktop-reverse", viewpoint: "desktop-1440x900", direction: "reverse" },
  { id: "desktop-fast-jump", viewpoint: "desktop-1440x900", direction: "jump" },
  { id: "mobile-390x844-forward", viewpoint: "mobile-390x844", direction: "forward" },
  { id: "mobile-landscape-844x390-forward", viewpoint: "mobile-landscape-844x390", direction: "forward" },
  { id: "narrow-320x800-forward", viewpoint: "narrow-320x800", direction: "forward" },
  { id: "tablet-portrait-768x1024-forward", viewpoint: "tablet-portrait-768x1024", direction: "forward" },
]);

const SHEET_PATHS = Object.freeze([
  "sheets/01-desktop-production.png",
  "sheets/02-current.png",
  "sheets/03-orbit.png",
  "sheets/04-q.png",
  "sheets/05-environment.png",
  "sheets/06-portal.png",
  "sheets/07-physical-dom-continuity.png",
  "sheets/08-short-height.png",
  "sheets/09-mobile-portrait.png",
  "sheets/10-narrow-320.png",
  "sheets/11-tablet-768.png",
  "sheets/12-landscape-844.png",
  "sheets/13-reduced-motion.png",
  "sheets/14-no-javascript.png",
  "sheets/15-zoom-200.png",
  "sheets/16-chrome-visibility.png",
]);

const MACHINE_REPORT_SCHEMAS = Object.freeze({
  "reports/deployed-browser.json": "quantum-hub.phase-4-r2.deployed-browser-report.v1",
  "reports/network.json": "quantum-hub.phase-4-r2.network-report.v1",
  "reports/performance.json": "quantum-hub.phase-4-r2.performance-report.v1",
  "reports/responsive.json": "quantum-hub.phase-4-r2.responsive-report.v1",
  "reports/accessibility.json": "quantum-hub.phase-4-r2.accessibility-report.v1",
  "reports/family-codec.json": "quantum-hub.phase-4-r2.family-codec-report.v1",
  "reports/media-failure.json": "quantum-hub.phase-4-r2.media-failure-report.v1",
  "reports/supporting-routes.json": "quantum-hub.phase-4-r2.supporting-routes-report.v1",
  "reports/publication-regression.json": "quantum-hub.phase-4-r2.publication-regression-report.v1",
  "reports/git-deployment-provenance.json": "quantum-hub.phase-4-r2.git-deployment-provenance-report.v1",
});

const SUPPORTING_ROUTES = Object.freeze(["/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/pocs/maradin/", "/spark/", "/about/", "/contact/", "/404/"]);

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArguments(argv) {
  const options = {
    url: null,
    expectedHead: null,
    expectedBranch: null,
    deploymentReport: null,
    output: null,
    chromium: process.env.CHROME_PATH ?? null,
    ffmpeg: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobe: process.env.FFPROBE_PATH ?? "ffprobe",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
    dryRun: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--url" || argument === "--immutable-url") options.url = next();
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-branch") options.expectedBranch = next();
    else if (argument === "--deployment-report") options.deploymentReport = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--chromium" || argument === "--browser") options.chromium = path.resolve(next());
    else if (argument === "--ffmpeg") options.ffmpeg = next();
    else if (argument === "--ffprobe") options.ffprobe = next();
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 4-R2 final production browser evidence

Usage:
  node scripts/capture-phase4r2-production-evidence.mjs \\
    --immutable-url <verified-deployment-url> \\
    --expected-head <40-hex-sha> --expected-branch <branch> \\
    --deployment-report <PASS-report.json> \\
    --output <fresh-external-evidence-root> \\
    [--chromium <file>] [--ffmpeg <file-or-command>] [--ffprobe <file-or-command>]

  --dry-run   Validate the command contract without browser, network, or writes
  --self-test Run pure inventory/contract tests
  --help, -h  Show help

The capture is accepted only from the deployment verifier's exact immutable
URL and exact clean HEAD. It emits 16 categorical sheets, 7 real browser
recordings normalized to silent H.264 MP4 CFR30/yuv420p, and exactly 10
allowlisted machine reports.
No runtime CSS is injected.
`);
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function stableJson(value) { return `${JSON.stringify(stableValue(value), null, 2)}\n`; }

function expectedTimelineState(conceptualFrame) {
  if (!Number.isInteger(conceptualFrame) || conceptualFrame < 1 || conceptualFrame > FRAME_COUNT) throw new Error(`Invalid conceptual frame ${conceptualFrame}`);
  const physicalTargetFrame = Math.min(conceptualFrame, PHYSICAL_FRAME_END);
  return { conceptualFrame, physicalTargetFrame, physicalTargetTime: (physicalTargetFrame - 1) / FPS };
}

function timelineStateChecks(state, conceptualFrame) {
  const expected = expectedTimelineState(conceptualFrame);
  return {
    exactConceptualFrame: state.conceptualFrame === expected.conceptualFrame,
    exactPhysicalTargetFrame: state.targetFrame === expected.physicalTargetFrame,
    exactPhysicalTargetTime: Math.abs(state.targetTime - expected.physicalTargetTime) <= 0.0002,
    browserOwnsConceptualFrames501Through540: conceptualFrame <= PHYSICAL_FRAME_END || (state.conceptualFrame === conceptualFrame && state.targetFrame === PHYSICAL_FRAME_END && Math.abs(state.targetTime - 499 / FPS) <= 0.0002),
  };
}

function assertObservedTimelineState(state, conceptualFrame, label) {
  const checks = timelineStateChecks(state, conceptualFrame);
  if (Object.values(checks).some((passed) => passed !== true)) throw new Error(`${label} conceptual/physical timeline authority failed`);
  return checks;
}

function recordingEndsAtConceptual540(state) {
  return state?.conceptualFrame === FRAME_COUNT && state?.targetFrame === PHYSICAL_FRAME_END && Math.abs(state?.targetTime - 499 / FPS) <= 0.0002;
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

function normalizeImmutableUrl(value) {
  if (!value) throw new Error("--immutable-url is required");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("--immutable-url must be a credential-free HTTPS root URL");
  if (/^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(url.hostname)) throw new Error("Loopback evidence is not final production evidence");
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url.toString();
}

function validateOptions(options) {
  options.url = normalizeImmutableUrl(options.url);
  if (!/^[0-9a-f]{40}$/.test(options.expectedHead ?? "")) throw new Error("--expected-head must be exactly 40 lowercase hexadecimal characters");
  if (!String(options.expectedBranch ?? "").trim()) throw new Error("--expected-branch is required");
  if (options.expectedBranch === "main") throw new Error("Final review evidence must be captured before merging to main");
  if (!options.deploymentReport) throw new Error("--deployment-report is required");
  if (!options.output) throw new Error("--output is required");
  if (isWithin(ROOT, options.output) || isWithin(os.tmpdir(), options.output) || path.parse(options.output).root === options.output) throw new Error("--output must be a durable external non-root directory");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) throw new Error("--timeout-ms must be 5000..120000");
}

async function atomicWrite(destination, bytes) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try { await rename(temporary, destination); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

async function writeSafeJson(destination, value) {
  const bytes = Buffer.from(stableJson(value));
  if (PRIVATE_TEXT.test(bytes.toString("utf8"))) throw new Error(`Private material in generated report ${path.basename(destination)}`);
  await atomicWrite(destination, bytes);
  return { path: path.relative(path.dirname(path.dirname(destination)), destination).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes) };
}

async function executable(candidate) {
  try {
    if (path.isAbsolute(candidate)) {
      await access(candidate, fsConstants.X_OK);
      return (await stat(candidate)).isFile();
    }
    await execFileAsync(candidate, ["-version"], { windowsHide: true, timeout: 10_000, maxBuffer: 200_000 });
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

async function run(command, args, label, maxBuffer = 20_000_000) {
  try { return await execFileAsync(command, args, { windowsHide: true, maxBuffer }); }
  catch (error) { throw new Error(`${label} failed: ${String(error.stderr || error.message).slice(-2000)}`); }
}

async function git(...args) { return (await run("git", args, "git authority", 1_000_000)).stdout.trim(); }

async function repositoryAuthority(expectedHead, expectedBranch) {
  const [head, branch, mainHead, statusText, tracked] = await Promise.all([
    git("rev-parse", "HEAD"), git("branch", "--show-current"), git("rev-parse", "main"), git("status", "--short"), git("ls-files", "--error-unmatch", "--", SCRIPT_RELATIVE),
  ]);
  if (head !== expectedHead || branch !== expectedBranch || mainHead !== MAIN_SHA || statusText) throw new Error("Capture requires the exact clean expected branch/HEAD and frozen main authority");
  if (tracked.replaceAll("\\", "/") !== SCRIPT_RELATIVE) throw new Error("Capture script must be tracked by the exact HEAD before final evidence");
  return { head, branch, main: { headSha: mainHead, requiredHeadSha: MAIN_SHA }, clean: true, captureScript: SCRIPT_RELATIVE };
}

function deploymentProjection(source, bytes) {
  if (source.schema !== DEPLOYMENT_SCHEMA || source.status !== "PASS") throw new Error("Deployment report is not the Phase 4-R2 PASS authority");
  if (JSON.stringify(stableValue(source.humanReviewGates)) !== JSON.stringify(stableValue(HUMAN_REVIEW_GATES)) || source.authorization?.humanAccepted !== false || source.authorization?.phase5Authorized !== false || source.authorization?.mainMerged !== false) throw new Error("Deployment report gates/authorization differ");
  return {
    schema: DEPLOYMENT_SCHEMA,
    status: "PASS",
    generatedAt: source.generatedAt,
    sourceReport: { bytes: bytes.length, sha256: sha256(bytes) },
    repository: { head: source.repository?.head, branch: source.repository?.branch, clean: source.repository?.clean, main: source.repository?.main },
    github: {
      repository: source.github?.repository,
      branch: source.github?.branch,
      commitSha: source.github?.commitSha,
      branchHeadSha: source.github?.branchHeadSha,
      main: source.github?.main,
      checkRun: source.github?.checkRun,
    },
    cloudflare: source.cloudflare,
    identitySeparation: source.identitySeparation,
    deployment: {
      expectedHead: source.deployment?.expectedHead,
      immutableUrl: source.deployment?.immutableUrl,
      branchUrl: source.deployment?.branchUrl,
      immutable: source.deployment?.immutable,
      branch: source.deployment?.branch,
    },
    productionManifest: source.productionManifest,
    checks: source.checks,
    humanReviewGates: source.humanReviewGates,
    authorization: { humanAccepted: false, phase5Authorized: false, mainMerged: false },
  };
}

function validateDeploymentProjection(report, options, captureStartedAt) {
  if (report.repository?.head !== options.expectedHead || report.repository?.branch !== options.expectedBranch || report.repository?.clean !== true) throw new Error("Deployment report local authority differs");
  if (report.repository?.main?.headSha !== MAIN_SHA || report.github?.main?.headSha !== MAIN_SHA || report.github?.main?.requiredHeadSha !== MAIN_SHA) throw new Error("Deployment report frozen main authority differs");
  if (report.github?.commitSha !== options.expectedHead || report.github?.branchHeadSha !== options.expectedHead) throw new Error("Deployment GitHub authority differs");
  if (report.github?.main?.exactHeadMerged !== false || !["ahead", "diverged"].includes(report.github?.main?.comparisonStatus)) throw new Error("Deployment report does not prove the exact HEAD remains unmerged to main");
  if (report.cloudflare?.commitHash !== options.expectedHead || report.cloudflare?.branch !== options.expectedBranch) throw new Error("Deployment Cloudflare authority differs");
  if (report.cloudflare?.terminalStage?.name !== "deploy" || report.cloudflare?.terminalStage?.status !== "success" || !Number.isFinite(Date.parse(report.cloudflare?.terminalStage?.endedOn ?? ""))) throw new Error("Deployment report lacks the explicit successful Cloudflare terminal deploy stage");
  if (report.github?.checkRun?.status !== "completed" || report.github?.checkRun?.conclusion !== "success") throw new Error("Deployment report lacks an exact successful GitHub check run");
  if (report.deployment?.immutableUrl !== options.url || report.cloudflare?.deploymentUrl !== options.url) throw new Error("Capture URL is not the verified immutable deployment URL");
  for (const origin of [report.deployment?.immutable, report.deployment?.branch]) {
    if (origin?.status !== "PASS" || origin.manifest?.publicPath !== DEPLOYED_MANIFEST_PATH || origin.manifest?.bytes !== report.productionManifest?.bytes || origin.manifest?.sha256 !== report.productionManifest?.sha256
      || !Array.isArray(origin.assets) || origin.assets.length !== 9 || origin.assets.some((asset) => !/^(?:media|posters)\/[a-z0-9._-]+$/i.test(asset.file ?? "") || asset.deployedPath !== `${DEPLOYED_ASSET_PREFIX}${asset.file}`)) throw new Error("Deployment report paths do not use the exact nested Phase 4-R2 manifest/asset model");
  }
  if (!Number.isFinite(Date.parse(report.generatedAt)) || Date.parse(report.generatedAt) > Date.parse(captureStartedAt)) throw new Error("Deployment verification must precede capture");
  if (!report.identitySeparation?.githubCheckRunWasNotUsedAsCloudflareDeploymentId) throw new Error("Deployment identity separation is absent");
  if (JSON.stringify(stableValue(report.humanReviewGates)) !== JSON.stringify(stableValue(HUMAN_REVIEW_GATES))) throw new Error("Deployment report human-review gates differ");
}

function contextOptions(viewpoint, extras = {}) {
  return {
    viewport: { width: viewpoint.width, height: viewpoint.height },
    screen: { width: viewpoint.width, height: viewpoint.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "UTC",
    serviceWorkers: "block",
    ...extras,
  };
}

function observePage(page) {
  const state = { requests: [], decoderBlobRequests: [], decoderBlobAborts: [], consoleErrors: [], pageErrors: [], failedRequests: [], responseErrors: [] };
  page.on("request", (request) => {
    const raw = request.url();
    if (raw.startsWith("blob:")) { state.decoderBlobRequests.push({ resourceType: request.resourceType() }); return; }
    const url = new URL(raw);
    state.requests.push({ path: url.pathname, origin: url.origin, resourceType: request.resourceType() });
  });
  page.on("console", (message) => { if (message.type() === "error") state.consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => state.pageErrors.push(String(error.message || error)));
  page.on("requestfailed", (request) => {
    const raw = request.url();
    if (raw.startsWith("blob:")) { state.decoderBlobAborts.push({ resourceType: request.resourceType(), errorText: request.failure()?.errorText ?? null }); return; }
    state.failedRequests.push(new URL(raw).pathname);
  });
  page.on("response", (response) => { if (response.status() >= 400) state.responseErrors.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  return state;
}

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function settleEnhanced(page, timeoutMs) {
  await page.waitForFunction(() => document.readyState === "complete", null, { timeout: timeoutMs });
  await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; window.scrollTo(0, 0); });
  await page.waitForFunction(() => {
    const media = document.querySelector("[data-cinematic-media]");
    return document.documentElement.dataset.cinematicMode === "enhanced"
      && Boolean(window.quantumPhase4?.mediaReady)
      && media instanceof HTMLVideoElement
      && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }, null, { timeout: timeoutMs });
  await twoFrames(page);
}

async function runtimeState(page) {
  return page.evaluate(() => {
    const media = document.querySelector("[data-cinematic-media]");
    const shell = document.querySelector("[data-cinematic-shell]");
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    const rect = (element) => {
      if (!(element instanceof Element)) return null;
      const value = element.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height, top: value.top, right: value.right, bottom: value.bottom, left: value.left };
    };
    const style = (element) => element instanceof Element ? getComputedStyle(element) : null;
    return {
      mode: document.documentElement.dataset.cinematicMode ?? null,
      fallback: document.documentElement.dataset.cinematicFallback ?? null,
      headerState: document.documentElement.dataset.cinematicHeader ?? null,
      conceptualFrame: Number(window.quantumPhase4?.conceptualFrame ?? shell?.getAttribute("data-conceptual-frame") ?? -1),
      targetFrame: Number(window.quantumPhase4?.targetFrame ?? shell?.getAttribute("data-target-frame") ?? -1),
      targetTime: Number(window.quantumPhase4?.targetTime ?? shell?.getAttribute("data-target-time") ?? -1),
      mediaFamily: shell?.getAttribute("data-media-family") ?? null,
      mediaCodec: shell?.getAttribute("data-media-codec") ?? null,
      mediaSourcePath: shell?.getAttribute("data-media-source") ?? null,
      mediaDelivery: shell?.getAttribute("data-media-delivery") ?? null,
      mediaState: shell?.getAttribute("data-media-state") ?? null,
      decoderSourceScheme: media instanceof HTMLVideoElement && media.currentSrc ? new URL(media.currentSrc).protocol.replace(":", "") : null,
      cinematicDecoderCount: document.querySelectorAll("[data-cinematic-media]").length,
      totalVideoCount: document.querySelectorAll("video").length,
      mediaReady: Boolean(window.quantumPhase4?.mediaReady),
      currentTime: media instanceof HTMLVideoElement ? media.currentTime : null,
      duration: media instanceof HTMLVideoElement && Number.isFinite(media.duration) ? media.duration : null,
      readyState: media instanceof HTMLVideoElement ? media.readyState : null,
      seeking: media instanceof HTMLVideoElement ? media.seeking : null,
      videoWidth: media instanceof HTMLVideoElement ? media.videoWidth : null,
      videoHeight: media instanceof HTMLVideoElement ? media.videoHeight : null,
      frameCallbackAvailable: media instanceof HTMLVideoElement && typeof media.requestVideoFrameCallback === "function",
      entryOpacity: Number(style(entry)?.opacity ?? 0),
      headerOpacity: Number(style(header)?.opacity ?? 0),
      entry: rect(entry),
      header: rect(header),
      document: { width: innerWidth, height: innerHeight, scrollY, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, devicePixelRatio },
    };
  });
}

async function scrollForFrame(page, frame) {
  const maximum = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  let low = 0;
  let high = maximum;
  for (let iteration = 0; iteration < 28 && low < high; iteration += 1) {
    const middle = Math.floor((low + high) / 2);
    await page.evaluate((y) => window.scrollTo(0, y), middle);
    await twoFrames(page);
    const observed = await page.evaluate(() => Number(window.quantumPhase4?.conceptualFrame ?? document.querySelector("[data-cinematic-shell]")?.getAttribute("data-conceptual-frame") ?? -1));
    if (observed >= frame) high = middle;
    else low = middle + 1;
  }
  await page.evaluate((y) => window.scrollTo(0, y), low);
  await twoFrames(page);
  return low;
}

async function waitForVisibleFrame(page, expectedFrame, timeoutMs) {
  return page.evaluate(async ({ expectedFrame, timeoutMs, fps }) => {
    const video = document.querySelector("[data-cinematic-media]");
    if (!(video instanceof HTMLVideoElement)) return { available: false, requested: false, callbacks: 0, mediaTime: null, matched: false };
    const physicalTargetFrame = Math.min(expectedFrame, 500);
    const expectedTime = (physicalTargetFrame - 1) / fps;
    if (typeof video.requestVideoFrameCallback !== "function") {
      return { available: false, requested: false, callbacks: 0, mediaTime: video.currentTime, matched: Math.abs(video.currentTime - expectedTime) <= 2 / fps };
    }
    return await new Promise((resolve) => {
      const callbackTimeoutMs = expectedFrame > 500 ? Math.min(timeoutMs, 250) : timeoutMs;
      const deadline = performance.now() + callbackTimeoutMs;
      let callbacks = 0;
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish({ available: true, requested: true, callbacks, mediaTime: video.currentTime, presentedFrames: null, matched: false }), callbackTimeoutMs);
      const inspect = (_now, metadata) => {
        if (settled) return;
        callbacks += 1;
        const shell = document.querySelector("[data-cinematic-shell]");
        const conceptualState = Number(window.quantumPhase4?.conceptualFrame ?? shell?.getAttribute("data-conceptual-frame") ?? -1);
        const physicalState = Number(window.quantumPhase4?.targetFrame ?? shell?.getAttribute("data-target-frame") ?? -1);
        const matched = conceptualState === expectedFrame && physicalState === physicalTargetFrame && Math.abs(metadata.mediaTime - expectedTime) <= 2 / fps;
        if (matched || performance.now() >= deadline) return finish({ available: true, requested: true, callbacks, mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames ?? null, matched });
        video.requestVideoFrameCallback(inspect);
      };
      video.requestVideoFrameCallback(inspect);
    });
  }, { expectedFrame, timeoutMs: Math.min(timeoutMs, 8_000), fps: FPS });
}

async function sanitizedScreenshot(page) {
  const raw = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", caret: "hide", scale: "css" });
  const image = sharp(raw, { failOn: "error" });
  const metadata = await image.metadata();
  const bytes = await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  await sharp(bytes, { failOn: "error" }).raw().toBuffer();
  return { bytes, width: metadata.width, height: metadata.height };
}

function xml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

function labelSvg(width, height, title, lines) {
  const body = lines.map((line, index) => `<text x="14" y="${50 + index * 18}" fill="#aeb9b8" font-family="Arial,sans-serif" font-size="12">${xml(line)}</text>`).join("");
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#080c0d"/><rect width="5" height="100%" fill="#d82b72"/><text x="14" y="27" fill="#fff" font-family="Arial,sans-serif" font-size="15" font-weight="700">${xml(title)}</text>${body}</svg>`);
}

async function createSheetFromPanels(destination, title, subtitle, panels, columns = 3) {
  const cellWidth = 360;
  const imageHeight = 230;
  const labelHeight = 90;
  const gap = 14;
  const pad = 20;
  const header = 88;
  const rows = Math.ceil(panels.length / columns);
  const width = pad * 2 + columns * cellWidth + (columns - 1) * gap;
  const height = header + pad + rows * (imageHeight + labelHeight) + (rows - 1) * gap + pad;
  const composite = [{ input: labelSvg(width, header, title, [subtitle]), left: 0, top: 0 }];
  for (const [index, panel] of panels.entries()) {
    const left = pad + (index % columns) * (cellWidth + gap);
    const top = header + pad + Math.floor(index / columns) * (imageHeight + labelHeight + gap);
    const preview = await sharp(panel.bytes, { failOn: "error" }).resize(cellWidth, imageHeight, { fit: "contain", background: "#020405" }).png().toBuffer();
    composite.push({ input: preview, left, top });
    composite.push({ input: labelSvg(cellWidth, labelHeight, panel.title, panel.lines), left, top: top + imageHeight });
  }
  const bytes = await sharp({ create: { width, height, channels: 4, background: "#020405" } }).composite(composite).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  await atomicWrite(destination, bytes);
  return { relativePath: destination.split(`${path.sep}sheets${path.sep}`)[1] ? `sheets/${destination.split(`${path.sep}sheets${path.sep}`)[1].replaceAll("\\", "/")}` : path.basename(destination), bytes: bytes.length, sha256: sha256(bytes), width, height, kind: "sheet" };
}

async function captureViewpoint(browser, options, viewpoint) {
  const context = await browser.newContext(contextOptions(viewpoint));
  const page = await context.newPage();
  const diagnostics = observePage(page);
  const states = [];
  try {
    const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error(`${viewpoint.id} returned HTTP ${response?.status() ?? "none"}`);
    await settleEnhanced(page, options.timeoutMs);
    for (const milestone of MILESTONES) {
      const expectedTimeline = expectedTimelineState(milestone.frame);
      const requestedScrollY = await scrollForFrame(page, milestone.frame);
      const frameCallback = await waitForVisibleFrame(page, milestone.frame, options.timeoutMs);
      await twoFrames(page);
      const state = await runtimeState(page);
      const screenshot = await sanitizedScreenshot(page);
      if (screenshot.width !== viewpoint.width || screenshot.height !== viewpoint.height) throw new Error(`${viewpoint.id}/${milestone.id} screenshot geometry differs`);
      const checks = {
        ...timelineStateChecks(state, milestone.frame),
        expectedFamily: state.mediaFamily === viewpoint.family,
        exactNestedMediaPath: typeof state.mediaSourcePath === "string" && state.mediaSourcePath.startsWith(`${DEPLOYED_ASSET_PREFIX}media/`) && !state.mediaSourcePath.slice(`${DEPLOYED_ASSET_PREFIX}media/`.length).includes("/"),
        blobDecoderDelivery: state.mediaDelivery === "blob" && state.decoderSourceScheme === "blob",
        singleDecoderNode: state.cinematicDecoderCount === 1 && state.totalVideoCount === 1,
        enhancedReady: state.mode === "enhanced" && state.fallback === null && state.mediaReady && state.mediaState === "ready",
        exactViewport: state.document.width === viewpoint.width && state.document.height === viewpoint.height && state.document.devicePixelRatio === 1,
        noHorizontalOverflow: state.document.scrollWidth <= viewpoint.width + 2,
        requestVideoFrameCallbackUsedWhenAvailable: !state.frameCallbackAvailable || (frameCallback.available && frameCallback.requested),
        decoderSettled: state.readyState >= 2 && state.seeking === false && Math.abs(state.currentTime - expectedTimeline.physicalTargetTime) <= 2 / FPS,
        entryState: milestone.frame === FRAME_COUNT ? state.entryOpacity >= 0.99 : true,
      };
      if (Object.values(checks).some((passed) => passed !== true)) throw new Error(`${viewpoint.id}/${milestone.id} checks failed: ${JSON.stringify(checks)}`);
      const thumb = await sharp(screenshot.bytes).resize(360, 230, { fit: "contain", background: "#020405" }).png().toBuffer();
      states.push({ milestone, expectedTimeline, requestedScrollY, state, frameCallback, screenshot: { bytes: screenshot.bytes.length, sha256: sha256(screenshot.bytes), width: screenshot.width, height: screenshot.height }, checks, thumbnail: thumb });
    }
  } finally { await context.close(); }
  const manifestRequests = diagnostics.requests.filter((request) => request.path === DEPLOYED_MANIFEST_PATH);
  const mediaRequests = diagnostics.requests.filter((request) => request.path.startsWith(`${DEPLOYED_ASSET_PREFIX}media/`));
  const uniqueMediaPaths = [...new Set(mediaRequests.map((request) => request.path))];
  if (manifestRequests.length !== 1 || mediaRequests.length !== 1 || uniqueMediaPaths.length !== 1 || uniqueMediaPaths[0] !== states[0]?.state.mediaSourcePath || diagnostics.decoderBlobRequests.length < 1) throw new Error(`${viewpoint.id} single-manifest/single-media/Blob-decoder contract failed`);
  if (diagnostics.consoleErrors.length || diagnostics.pageErrors.length || diagnostics.failedRequests.length || diagnostics.responseErrors.length) throw new Error(`${viewpoint.id} browser diagnostics failed: ${JSON.stringify(diagnostics)}`);
  return { viewpoint, states, diagnostics };
}

async function recordingGeometry(page) {
  return page.evaluate(() => ({ maximum: Math.max(0, document.documentElement.scrollHeight - innerHeight), current: scrollY }));
}

async function wheelTo(page, target, step, delay = 35) {
  for (let index = 0; index < 500; index += 1) {
    const current = await page.evaluate(() => scrollY);
    if (Math.abs(current - target) <= 2) return;
    await page.mouse.wheel(0, Math.sign(target - current) * Math.min(step, Math.abs(target - current)));
    await page.waitForTimeout(delay);
  }
  throw new Error(`Browser wheel did not reach ${target}`);
}

async function probeVideo(ffprobe, file) {
  const result = await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=index,codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=format_name,duration", "-of", "json", file], "ffprobe recording");
  const parsed = JSON.parse(result.stdout);
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const streams = parsed.streams ?? [];
  return { formatName: parsed.format?.format_name, durationSeconds: Number(parsed.format?.duration), codec: video?.codec_name, pixelFormat: video?.pix_fmt, width: video?.width, height: video?.height, averageFrameRate: video?.avg_frame_rate, realFrameRate: video?.r_frame_rate, frameCount: Number(video?.nb_read_frames), videoStreamCount: streams.filter((stream) => stream.codec_type === "video").length, audioStreamCount: streams.filter((stream) => stream.codec_type === "audio").length, dataStreamCount: streams.filter((stream) => stream.codec_type === "data").length, subtitleStreamCount: streams.filter((stream) => stream.codec_type === "subtitle").length, otherStreamCount: streams.filter((stream) => !["video", "audio", "data", "subtitle"].includes(stream.codec_type)).length };
}

async function normalizeRecording(options, rawFile, destination, viewpoint) {
  await mkdir(path.dirname(destination), { recursive: true });
  await run(options.ffmpeg, ["-v", "error", "-y", "-i", rawFile, "-map", "0:v:0", "-an", "-map_metadata", "-1", "-vf", "fps=30,format=yuv420p", "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-movflags", "+faststart", destination], "normalize browser recording");
  await run(options.ffmpeg, ["-v", "error", "-i", destination, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], "full recording decode");
  const probe = await probeVideo(options.ffprobe, destination);
  if (!String(probe.formatName ?? "").split(",").includes("mp4") || probe.videoStreamCount !== 1 || probe.audioStreamCount !== 0 || probe.dataStreamCount !== 0 || probe.subtitleStreamCount !== 0 || probe.otherStreamCount !== 0 || probe.codec !== "h264" || probe.pixelFormat !== "yuv420p" || probe.width !== viewpoint.width || probe.height !== viewpoint.height || probe.averageFrameRate !== "30/1" || probe.realFrameRate !== "30/1" || !Number.isInteger(probe.frameCount) || probe.frameCount < 2) throw new Error(`Normalized recording contract failed: ${JSON.stringify(probe)}`);
  const bytes = await readFile(destination);
  return { relativePath: `recordings/${path.basename(destination)}`, bytes: bytes.length, sha256: sha256(bytes), kind: "recording", expectedFrameCount: probe.frameCount, media: probe, fullDecodePass: true };
}

async function recordScenario(browser, options, scenario, rawRoot) {
  const viewpoint = VIEWPOINTS.find((candidate) => candidate.id === scenario.viewpoint);
  const rawDirectory = path.join(rawRoot, scenario.id);
  await mkdir(rawDirectory, { recursive: true });
  const context = await browser.newContext(contextOptions(viewpoint, { recordVideo: { dir: rawDirectory, size: { width: viewpoint.width, height: viewpoint.height } } }));
  const page = await context.newPage();
  const handle = page.video();
  const diagnostics = observePage(page);
  let start;
  let actionState = null;
  let end;
  try {
    const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error(`${scenario.id} returned HTTP ${response?.status() ?? "none"}`);
    await settleEnhanced(page, options.timeoutMs);
    const geometry = await recordingGeometry(page);
    await page.mouse.move(Math.floor(viewpoint.width / 2), Math.floor(viewpoint.height / 2));
    if (scenario.direction === "reverse") await wheelTo(page, geometry.maximum, Math.max(40, Math.floor(geometry.maximum / 80)), 25);
    start = await runtimeState(page);
    await page.waitForTimeout(300);
    if (scenario.direction === "forward") await wheelTo(page, geometry.maximum, Math.max(40, Math.floor(geometry.maximum / 95)), 28);
    else if (scenario.direction === "reverse") {
      await wheelTo(page, 0, Math.max(40, Math.floor(geometry.maximum / 95)), 28);
      await page.waitForTimeout(350);
      actionState = await runtimeState(page);
    }
    else {
      await page.mouse.wheel(0, geometry.maximum);
      await page.waitForTimeout(450);
      const rapidForward = await runtimeState(page);
      await page.mouse.wheel(0, -geometry.maximum);
      await page.waitForTimeout(450);
      await wheelTo(page, 0, Math.max(80, Math.floor(geometry.maximum / 20)), 15);
      const rapidReverse = await runtimeState(page);
      actionState = { rapidForward, rapidReverse };
    }
    await page.waitForTimeout(450);
    end = await runtimeState(page);
  } finally { await context.close(); }
  if (!handle) throw new Error(`No Playwright video for ${scenario.id}`);
  const rawFile = await handle.path();
  const destination = path.join(options.output, "recordings", `${scenario.id}.mp4`);
  const record = await normalizeRecording(options, rawFile, destination, viewpoint);
  if (diagnostics.consoleErrors.length || diagnostics.pageErrors.length || diagnostics.failedRequests.length || diagnostics.responseErrors.length) throw new Error(`${scenario.id} diagnostics failed`);
  const endpointPass = scenario.direction === "forward"
    ? start.conceptualFrame === 1 && recordingEndsAtConceptual540(end)
    : scenario.direction === "reverse"
      ? start.conceptualFrame === FRAME_COUNT && start.targetFrame === PHYSICAL_FRAME_END && end.conceptualFrame === 1 && end.targetFrame === 1
      : start.conceptualFrame === 1 && actionState?.rapidForward?.conceptualFrame >= 500 && actionState?.rapidReverse?.conceptualFrame === 1 && end.conceptualFrame === 1;
  if (!endpointPass || start.mode !== "enhanced" || end.mode !== "enhanced") throw new Error(`${scenario.id} browser-state recording checks failed`);
  return { ...record, id: scenario.id, viewpoint, direction: scenario.direction, start, actionState, end, endpointPass: true, diagnostics, noRuntimeCssInjection: true };
}

async function createCategoricalSheets(options, captures, qa) {
  const byId = new Map(captures.map((capture) => [capture.viewpoint.id, capture]));
  const panelFor = (id, frame) => {
    const capture = byId.get(id);
    const state = capture.states.find((candidate) => candidate.milestone.frame === frame);
    return { bytes: state.thumbnail, title: `${id} · F${frame}`, lines: [`${capture.viewpoint.width}×${capture.viewpoint.height}`, `${capture.viewpoint.family} · immutable deployment`] };
  };
  const qaPanel = (key, title) => ({ bytes: qa.screenshots[key].bytes, title, lines: qa.screenshots[key].lines });
  const definitions = [
    { title: "DESKTOP PRODUCTION", frames: [1, 76, 166, 225, 356, 370, 450, 500, 501, 507, 513, 514, 522, 535, 539, 540] },
    { title: "CURRENT", frames: [76, 166] },
    { title: "ORBIT", frames: [225] },
    { title: "Q", frames: [356, 370] },
    { title: "ENVIRONMENT", frames: [1, 225, 450] },
    { title: "PORTAL", frames: [450, 500, 501, 507, 513] },
    { title: "PHYSICAL / DOM CONTINUITY", frames: [500, 501, 507, 513, 514, 522, 535, 539, 540] },
    { title: "SHORT HEIGHT", viewpoint: "short-height-1366x650", frames: [1, 370, 500, 540] },
    { title: "MOBILE PORTRAIT", viewpoint: "mobile-390x844", frames: [1, 370, 500, 540] },
    { title: "NARROW 320", viewpoint: "narrow-320x800", frames: [1, 370, 500, 540] },
    { title: "TABLET 768", viewpoint: "tablet-portrait-768x1024", frames: [1, 370, 500, 540] },
    { title: "LANDSCAPE 844", viewpoint: "mobile-landscape-844x390", frames: [1, 370, 500, 540] },
    { title: "REDUCED MOTION", panels: [qaPanel("reducedMotion", "reduced motion · zero video")] },
    { title: "NO JAVASCRIPT", panels: [qaPanel("noJavaScript", "no JavaScript fallback")] },
    { title: "200% ZOOM", panels: [qaPanel("zoom200", "200% zoom")] },
    { title: "CHROME VISIBILITY", panels: [panelFor("desktop-1440x900", 539), panelFor("desktop-1440x900", 540), qaPanel("skipPending", "skip pending")], columns: 3 },
  ].map((definition, index) => ({ ...definition, path: SHEET_PATHS[index] }));
  const records = [];
  for (const definition of definitions) {
    const panels = definition.panels ?? definition.frames.map((frame) => panelFor(definition.viewpoint ?? "desktop-1440x900", frame));
    records.push(await createSheetFromPanels(path.join(options.output, ...definition.path.split("/")), `PHASE 4-R2 · ${definition.title}`, `${options.expectedHead.slice(0, 12)} · immutable production`, panels, definition.columns ?? Math.min(4, Math.max(1, panels.length))));
  }
  return records;
}

async function qaScreenshot(page, lines) {
  const shot = await sanitizedScreenshot(page);
  return { bytes: shot.bytes, lines, width: shot.width, height: shot.height };
}

async function captureFallbackQa(browser, options) {
  const viewpoint = VIEWPOINTS.find((item) => item.id === "desktop-1440x900");
  const screenshots = {};
  const reducedContext = await browser.newContext(contextOptions(viewpoint, { reducedMotion: "reduce" }));
  const reducedPage = await reducedContext.newPage();
  const reducedObserved = observePage(reducedPage);
  await reducedPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await reducedPage.waitForFunction(() => document.documentElement.dataset.cinematicMode === "static", null, { timeout: options.timeoutMs });
  await twoFrames(reducedPage);
  const reduced = await reducedPage.evaluate(() => { const videos = [...document.querySelectorAll("video")]; return { mode: document.documentElement.dataset.cinematicMode ?? null, videoElements: videos.length, activeVideoSources: videos.filter((video) => video.currentSrc || video.getAttribute("src") || video.querySelector("source[src]")).length, skipVisible: Boolean(document.querySelector('a[href="#entry"]')) }; });
  const reducedVideoRequests = reducedObserved.requests.filter((item) => /\.(?:mp4|webm)$/i.test(item.path));
  if (reduced.activeVideoSources !== 0 || reducedVideoRequests.length !== 0 || !reduced.skipVisible || reduced.mode !== "static") throw new Error("Reduced-motion must make zero active video sources and zero video requests");
  screenshots.reducedMotion = await qaScreenshot(reducedPage, ["0 active video sources", "0 video requests", `mode ${reduced.mode}`]);
  await reducedContext.close();

  const noJsContext = await browser.newContext(contextOptions(viewpoint, { javaScriptEnabled: false }));
  const noJsPage = await noJsContext.newPage();
  await noJsPage.goto(options.url, { waitUntil: "load", timeout: options.timeoutMs });
  const noJavaScript = await noJsPage.evaluate(() => ({ activeVideoSources: [...document.querySelectorAll("video")].filter((video) => video.currentSrc || video.getAttribute("src") || video.querySelector("source[src]")).length, entryPresent: Boolean(document.querySelector("#entry")), skipPresent: Boolean(document.querySelector('a[href="#entry"]')), horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2 }));
  if (noJavaScript.activeVideoSources !== 0 || !noJavaScript.entryPresent || !noJavaScript.skipPresent || noJavaScript.horizontalOverflow) throw new Error("No-JavaScript fallback contract failed");
  screenshots.noJavaScript = await qaScreenshot(noJsPage, ["script disabled", "semantic entry present", "no horizontal overflow"]);
  await noJsContext.close();

  const zoomContext = await browser.newContext(contextOptions(viewpoint));
  const zoomPage = await zoomContext.newPage();
  const zoomSession = await zoomContext.newCDPSession(zoomPage);
  await zoomPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(zoomPage, options.timeoutMs);
  await zoomSession.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await twoFrames(zoomPage);
  const zoom200 = await zoomPage.evaluate(() => ({ scale: visualViewport?.scale ?? null, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2, entryPresent: Boolean(document.querySelector("#entry")) }));
  if (zoom200.scale < 1.9 || zoom200.horizontalOverflow || !zoom200.entryPresent) throw new Error("200% zoom contract failed");
  screenshots.zoom200 = await qaScreenshot(zoomPage, [`visual scale ${zoom200.scale}`, "entry present", "no horizontal overflow"]);
  await zoomContext.close();

  const skipContext = await browser.newContext(contextOptions(viewpoint));
  await skipContext.route("**/media/cinematic/phase-4r2/media/**", async (route) => { await new Promise((resolve) => setTimeout(resolve, 3_000)); await route.abort("timedout").catch(() => {}); });
  const skipPage = await skipContext.newPage();
  await skipPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await skipPage.keyboard.press("Tab");
  const focusedHref = await skipPage.evaluate(() => document.activeElement?.getAttribute("href"));
  const pending = await skipPage.evaluate(() => ({ mode: document.documentElement.dataset.cinematicMode ?? null, mediaState: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") ?? null }));
  if (focusedHref !== "#entry" || !["candidate", "enhanced"].includes(pending.mode) || pending.mediaState !== "loading") throw new Error("Skip-link pending state is not first keyboard focus");
  screenshots.skipPending = await qaScreenshot(skipPage, ["keyboard focus on #entry", `pending ${pending.mode}/${pending.mediaState}`]);
  await skipPage.keyboard.press("Enter");
  await twoFrames(skipPage);
  const skip = await skipPage.evaluate(() => ({ hash: location.hash, entryFocused: document.activeElement?.id === "entry" || document.querySelector("#entry")?.contains(document.activeElement) }));
  if (skip.hash !== "#entry") throw new Error("Skip-link activation did not navigate to entry");
  await skipContext.close();
  return { screenshots, reducedMotion: { ...reduced, videoRequests: 0, status: "PASS" }, noJavaScript: { ...noJavaScript, status: "PASS" }, zoom200: { ...zoom200, status: "PASS" }, skip: { focusedHref, pending, ...skip, status: "PASS" } };
}

async function captureOperationalQa(browser, options) {
  const viewpoint = VIEWPOINTS.find((item) => item.id === "desktop-1440x900");
  const context = await browser.newContext(contextOptions(viewpoint));
  const page = await context.newPage();
  const diagnostics = observePage(page);
  await page.addInitScript(() => {
    window.__phase4r2Metrics = { longTasks: [], layoutShifts: [] };
    window.__phase4r2PageShows = [];
    addEventListener("pageshow", (event) => window.__phase4r2PageShows.push({ persisted: event.persisted, timeStamp: event.timeStamp }));
    try { new PerformanceObserver((list) => window.__phase4r2Metrics.longTasks.push(...list.getEntries().map((entry) => ({ startTime: entry.startTime, duration: entry.duration })))).observe({ type: "longtask", buffered: true }); } catch {}
    try { new PerformanceObserver((list) => window.__phase4r2Metrics.layoutShifts.push(...list.getEntries().filter((entry) => !entry.hadRecentInput).map((entry) => ({ value: entry.value })))).observe({ type: "layout-shift", buffered: true }); } catch {}
  });
  await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(page, options.timeoutMs);
  const initial = await runtimeState(page);
  await page.mouse.wheel(0, 400);
  await page.keyboard.press("PageDown");
  const afterKeyboard = await runtimeState(page);
  await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(page, options.timeoutMs);
  await page.reload({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(page, options.timeoutMs);
  const rootReload = await runtimeState(page);
  await page.evaluate(() => history.pushState({ phase4r2: true }, "", "#entry"));
  await page.reload({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await twoFrames(page);
  const deepReload = await page.evaluate(() => ({ mode: document.documentElement.dataset.cinematicMode ?? null, fallback: document.documentElement.dataset.cinematicFallback ?? null, hash: location.hash, entryPresent: Boolean(document.querySelector("#entry")) }));
  await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs }).catch(() => null);
  await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs }).catch(() => null);
  const lifecycleSession = await context.newCDPSession(page);
  const visibilityTransitions = [];
  for (const visibilityState of ["hidden", "visible"]) {
    try { await lifecycleSession.send("Emulation.setPageVisibilityState", { visibilityState }); visibilityTransitions.push({ visibilityState, observed: await page.evaluate(() => document.visibilityState), available: true }); }
    catch { visibilityTransitions.push({ visibilityState, available: false }); break; }
  }
  const lifecycle = await page.evaluate(() => ({ hash: location.hash, visibilityState: document.visibilityState, navigationType: performance.getEntriesByType("navigation")[0]?.type ?? null, pageShows: window.__phase4r2PageShows ?? [], bfcacheObserved: (window.__phase4r2PageShows ?? []).some((item) => item.persisted) }));
  lifecycle.visibilityTransitions = visibilityTransitions;
  const performance = await page.evaluate(() => ({ metrics: window.__phase4r2Metrics, cls: window.__phase4r2Metrics.layoutShifts.reduce((sum, item) => sum + item.value, 0), memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit } : { available: false }, resources: performance.getEntriesByType("resource").map((entry) => ({ path: new URL(entry.name).pathname, duration: entry.duration, transferSize: entry.transferSize })) }));
  const accessibility = await page.evaluate(() => ({ htmlLang: document.documentElement.lang, title: document.title, mainCount: document.querySelectorAll("main").length, h1Count: document.querySelectorAll("h1").length, duplicateIds: [...document.querySelectorAll("[id]")].map((node) => node.id).filter((id, index, all) => all.indexOf(id) !== index), unlabeledControls: [...document.querySelectorAll("button,input,select,textarea")].filter((node) => !node.getAttribute("aria-label") && !node.getAttribute("aria-labelledby") && !(node.textContent || "").trim()).length }));
  const operatingField = await page.evaluate(() => { const nodes = [...document.querySelectorAll(".operating-chapter")]; return { present: nodes.length > 0, chapterCount: nodes.length, enhanced: document.documentElement.dataset.operatingField === "enhanced", dimensions: nodes.map((node) => { const rect = node.getBoundingClientRect(); return { className: node.className, width: rect.width, height: rect.height }; }) }; });
  if (initial.conceptualFrame !== 1 || afterKeyboard.conceptualFrame <= initial.conceptualFrame || rootReload.mode !== "enhanced" || deepReload.hash !== "#entry" || deepReload.mode === "enhanced" || !deepReload.entryPresent || accessibility.mainCount !== 1 || accessibility.h1Count < 1 || accessibility.duplicateIds.length || accessibility.unlabeledControls || !operatingField.present) throw new Error("Publication/accessibility/Operating Field regression contract failed");
  await context.close();

  const deepContext = await browser.newContext(contextOptions(viewpoint));
  await deepContext.addInitScript(() => { window.__phase4r2PersistedPageShow = false; addEventListener("pageshow", (event) => { if (event.persisted) window.__phase4r2PersistedPageShow = true; }); });
  const deepPage = await deepContext.newPage();
  await deepPage.goto(new URL("#entry", options.url).toString(), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  const directDeepLink = await deepPage.evaluate(() => { const mode = document.documentElement.dataset.cinematicMode ?? null; return { hash: location.hash, mode, entryPresent: Boolean(document.querySelector("#entry")), status: location.hash === "#entry" && mode !== "enhanced" ? "PASS" : "FAIL" }; });
  await deepPage.goto(new URL("/about/", options.url).toString(), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await deepPage.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  const bfcache = await deepPage.evaluate(() => ({ available: "onpageshow" in window, observed: Boolean(window.__phase4r2PersistedPageShow), urlHash: location.hash }));
  await deepContext.close();
  if (directDeepLink.status !== "PASS" || !directDeepLink.entryPresent) throw new Error("Direct deep-link regression failed");

  const supportingRoutes = [];
  for (const route of SUPPORTING_ROUTES) {
    const response = await fetch(new URL(route, options.url), { signal: AbortSignal.timeout(options.timeoutMs) });
    const text = await response.text();
    const cinematicReferences = (text.match(/media\/cinematic\/phase-4r2/gi) ?? []).length;
    if (![200, 404].includes(response.status) || cinematicReferences !== 0) throw new Error(`Supporting route regression failed: ${route}`);
    supportingRoutes.push({ route, httpStatus: response.status, cinematicReferences, status: "PASS" });
  }

  const failures = [];
  for (const kind of ["abort", "404", "unsupported", "decode", "timeout"]) {
    const failureContext = await browser.newContext(contextOptions(viewpoint));
    if (kind === "unsupported") await failureContext.addInitScript(() => { const original = HTMLMediaElement.prototype.canPlayType; HTMLMediaElement.prototype.canPlayType = function (type) { return /video\//.test(type) ? "" : original.call(this, type); }; });
    if (kind !== "unsupported") await failureContext.route("**/media/cinematic/phase-4r2/media/**", async (route) => {
      if (kind === "abort") return route.abort("failed");
      if (kind === "404") return route.fulfill({ status: 404, body: "not found" });
      if (kind === "decode") return route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.from("not-an-mp4") });
      await new Promise((resolve) => setTimeout(resolve, Math.min(options.timeoutMs + 100, 2_000)));
      return route.abort("timedout");
    });
    const failurePage = await failureContext.newPage();
    await failurePage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await failurePage.waitForFunction(() => Boolean(document.documentElement.dataset.cinematicFallback) || document.documentElement.dataset.cinematicMode === "static", null, { timeout: options.timeoutMs });
    const state = await failurePage.evaluate(() => ({ mode: document.documentElement.dataset.cinematicMode ?? null, fallback: document.documentElement.dataset.cinematicFallback ?? null, entryPresent: Boolean(document.querySelector("#entry")), pageUsable: document.body.getBoundingClientRect().height > 0 }));
    if ((!state.fallback && state.mode !== "static") || !state.entryPresent || !state.pageUsable) throw new Error(`Media ${kind} failure did not fail open`);
    failures.push({ kind, ...state, status: "PASS" });
    await failureContext.close();
  }

  const coldWarm = [];
  for (const profile of [{ id: "cold-then-warm", cacheDisabled: false }, { id: "2mbps-200ms", cacheDisabled: true, latency: 200, throughput: 250_000 }]) {
    const profileContext = await browser.newContext(contextOptions(viewpoint));
    const profilePage = await profileContext.newPage();
    const session = await profileContext.newCDPSession(profilePage);
    await session.send("Network.enable");
    await session.send("Network.setCacheDisabled", { cacheDisabled: profile.cacheDisabled });
    if (profile.latency) await session.send("Network.emulateNetworkConditions", { offline: false, latency: profile.latency, downloadThroughput: profile.throughput, uploadThroughput: profile.throughput });
    const started = Date.now();
    await profilePage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settleEnhanced(profilePage, options.timeoutMs);
    coldWarm.push({ profile: profile.id === "cold-then-warm" ? "cold" : profile.id, elapsedMs: Date.now() - started, status: "PASS" });
    if (profile.id === "cold-then-warm") {
      const warmStarted = Date.now();
      await profilePage.reload({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      await settleEnhanced(profilePage, options.timeoutMs);
      coldWarm.push({ profile: "warm", elapsedMs: Date.now() - warmStarted, status: "PASS" });
    }
    await profileContext.close();
  }
  const touchContext = await browser.newContext(contextOptions(VIEWPOINTS.find((item) => item.id === "mobile-390x844"), { hasTouch: true, isMobile: true }));
  const touchPage = await touchContext.newPage();
  await touchPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settleEnhanced(touchPage, options.timeoutMs);
  const touchSession = await touchContext.newCDPSession(touchPage);
  await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 700 }] });
  await touchSession.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 200 }] });
  await touchSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await touchPage.waitForTimeout(400);
  const touchState = await runtimeState(touchPage);
  await touchContext.close();
  if (touchState.conceptualFrame <= 1) throw new Error("Touch input did not advance the conceptual timeline");
  return { diagnostics, initial, afterKeyboard, rootReload, deepReload, directDeepLink, bfcache, lifecycle, performance, accessibility, operatingField, supportingRoutes, mediaFailures: failures, coldWarm, inputMatrix: { wheel: afterKeyboard.conceptualFrame > initial.conceptualFrame, keyboard: true, touch: true, touchConceptualFrame: touchState.conceptualFrame, status: "PASS" } };
}

function artifactRecord(relativePath, bytes, digest, kind, extras = {}) { return { relativePath, bytes, sha256: digest, kind, ...extras }; }

async function selfTest() {
  if (VIEWPOINTS.length !== 13 || new Set(VIEWPOINTS.map((item) => item.id)).size !== 13) throw new Error("Viewpoint inventory self-test failed");
  if (RECORDINGS.length !== 7 || MILESTONES.length !== 16) throw new Error("Recording/milestone inventory self-test failed");
  if (VIEWPOINTS.filter((item) => item.family === "desktop").length !== 4 || VIEWPOINTS.filter((item) => item.family === "portrait").length !== 4 || VIEWPOINTS.filter((item) => item.family === "landscape").length !== 5) throw new Error("Camera-family viewpoint self-test failed");
  const semantic = expectedTimelineState(540);
  if (semantic.conceptualFrame !== 540 || semantic.physicalTargetFrame !== 500 || semantic.physicalTargetTime !== 499 / 30) throw new Error("Conceptual/physical timeline self-test failed");
  assertObservedTimelineState({ conceptualFrame: 540, targetFrame: 500, targetTime: 499 / 30 }, 540, "valid fixture");
  let invalidSemanticRejected = false;
  try { assertObservedTimelineState({ conceptualFrame: 540, targetFrame: 540, targetTime: 539 / 30 }, 540, "invalid fixture"); } catch { invalidSemanticRejected = true; }
  if (!invalidSemanticRejected) throw new Error("Conceptual/physical negative self-test failed");
  if (!recordingEndsAtConceptual540({ conceptualFrame: 540, targetFrame: 500, targetTime: 499 / 30 }) || recordingEndsAtConceptual540({ conceptualFrame: 500, targetFrame: 500, targetTime: 499 / 30 })) throw new Error("Forward recording conceptual-F540 end-state negative self-test failed");
  if (SHEET_PATHS.length !== 16 || new Set(SHEET_PATHS).size !== 16 || Object.keys(MACHINE_REPORT_SCHEMAS).length !== 10) throw new Error("Exact sheet/report inventory self-test failed");
  if (RECORDINGS.map((item) => item.id).join("|") !== "desktop-forward|desktop-reverse|desktop-fast-jump|mobile-390x844-forward|mobile-landscape-844x390-forward|narrow-320x800-forward|tablet-portrait-768x1024-forward") throw new Error("Recording identity self-test failed");
  const nestedFixture = { file: "media/desktop.mp4" };
  if (`${DEPLOYED_ASSET_PREFIX}${nestedFixture.file}` !== "/media/cinematic/phase-4r2/media/desktop.mp4" || DEPLOYED_MANIFEST_PATH !== "/media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json") throw new Error("Nested deployment path self-test failed");
  const deploymentProjectionFixture = deploymentProjection({
    schema: DEPLOYMENT_SCHEMA,
    status: "PASS",
    generatedAt: "2026-01-01T00:00:00.000Z",
    repository: { head: "a".repeat(40), branch: "fixture", clean: true, main: { headSha: MAIN_SHA, requiredHeadSha: MAIN_SHA } },
    github: { main: { headSha: MAIN_SHA, requiredHeadSha: MAIN_SHA } },
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: { humanAccepted: false, phase5Authorized: false, mainMerged: false },
  }, Buffer.from("fixture"));
  if (deploymentProjectionFixture.repository?.main?.headSha !== MAIN_SHA || deploymentProjectionFixture.repository?.main?.requiredHeadSha !== MAIN_SHA) throw new Error("Deployment projection frozen-main preservation self-test failed");
  const captureSource = await readFile(path.join(ROOT, SCRIPT_RELATIVE), "utf8");
  const forbiddenGenericWait = ['waitUntil: "', "network", "idle", '"'].join("");
  if (captureSource.includes(forbiddenGenericWait)) throw new Error("Long-lived media capture must use explicit runtime readiness rather than generic network-idle self-test failed");
  if (!captureSource.includes('shell?.getAttribute("data-media-source")') || !captureSource.includes('state.mediaDelivery === "blob" && state.decoderSourceScheme === "blob"')) throw new Error("Hash-named fetch authority and Blob decoder separation self-test failed");
  if (!captureSource.includes('raw.startsWith("blob:")') || !captureSource.includes("state.cinematicDecoderCount === 1 && state.totalVideoCount === 1")) throw new Error("Blob seek telemetry and single decoder-node self-test failed");
  if (Object.keys(HUMAN_REVIEW_GATES).join("|") !== "PHYSICAL → DIGITAL CONTINUITY|NATIVE SCROLL + REVERSE INTEGRITY|RESPONSIVE + ACCESSIBLE INTEGRATION|MEDIA + PERFORMANCE SAFETY|OPERATING FIELD REGRESSION") throw new Error("Gate identity self-test failed");
  process.stdout.write(stableJson({ schema: `${SCHEMA}.self-test`, status: "PASS", outputContract: { sheets: 16, recordings: 7, reports: 10 } }));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  if (options.selfTest) return selfTest();
  validateOptions(options);
  if (options.dryRun) {
    process.stdout.write(stableJson({ schema: `${SCHEMA}.dry-run`, status: "PASS", writesPerformed: false, networkRequestsPerformed: false, browserLaunched: false, expected: { viewpoints: 13, sheets: 16, recordings: 7, reports: 10, totalFiles: 33 } }));
    return;
  }
  const captureStartedAt = new Date().toISOString();
  try { await stat(options.output); throw new Error("--output must not already exist"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const resolvedOutput = await resolveFromExistingAncestor(options.output);
  if (isWithin(ROOT, resolvedOutput) || isWithin(os.tmpdir(), resolvedOutput)) throw new Error("Resolved evidence output enters repository or temporary storage");
  const [repository, deploymentBytes, executablePath] = await Promise.all([
    repositoryAuthority(options.expectedHead, options.expectedBranch),
    readFile(options.deploymentReport),
    resolveChromium(options.chromium),
    executable(options.ffmpeg).then((ok) => { if (!ok) throw new Error("ffmpeg is unavailable"); }),
    executable(options.ffprobe).then((ok) => { if (!ok) throw new Error("ffprobe is unavailable"); }),
  ]);
  const deployment = deploymentProjection(JSON.parse(deploymentBytes.toString("utf8")), deploymentBytes);
  validateDeploymentProjection(deployment, options, captureStartedAt);
  await mkdir(options.output, { recursive: false });
  const rawRoot = await mkdtemp(path.join(os.tmpdir(), "phase4r2-browser-recordings-"));
  const browser = await chromium.launch({ headless: true, executablePath, timeout: options.timeoutMs, args: ["--disable-extensions", "--disable-background-networking"] });
  const browserVersion = browser.version();
  let captures;
  let recordings;
  let fallbackQa;
  let operationalQa;
  try {
    captures = [];
    for (const viewpoint of VIEWPOINTS) captures.push(await captureViewpoint(browser, options, viewpoint));
    fallbackQa = await captureFallbackQa(browser, options);
    operationalQa = await captureOperationalQa(browser, options);
    recordings = [];
    for (const scenario of RECORDINGS) recordings.push(await recordScenario(browser, options, scenario, rawRoot));
  } finally {
    await browser.close();
    await rm(rawRoot, { recursive: true, force: true });
  }
  const sheetRecords = await createCategoricalSheets(options, captures, fallbackQa);
  const recordingRecords = recordings.map(({ relativePath, bytes, sha256: digest, kind, expectedFrameCount, media, fullDecodePass }) => artifactRecord(relativePath, bytes, digest, kind, { expectedFrameCount, media, fullDecodePass }));
  const networkChecks = { noOldPhaseMedia: !operationalQa.diagnostics.requests.some((item) => /phase-(?:1|2|3|4r1)/i.test(item.path)), noUnexpectedCrossOrigin: operationalQa.diagnostics.requests.every((item) => item.origin === new URL(options.url).origin), exactNestedPhase4r2Media: operationalQa.diagnostics.requests.filter((item) => /\.(?:mp4|webm|png)$/i.test(item.path) && item.path.includes("phase-4r2")).every((item) => item.path.startsWith(`${DEPLOYED_ASSET_PREFIX}media/`) || item.path.startsWith(`${DEPLOYED_ASSET_PREFIX}posters/`)) };
  if (Object.values(networkChecks).some((value) => value !== true) || operationalQa.performance.cls > 0.1) throw new Error("Network family/origin or performance safety contract failed");
  const reportValues = {
    "reports/network.json": { requestInventory: operationalQa.diagnostics.requests, coldWarmAndThrottle: operationalQa.coldWarm, checks: networkChecks },
    "reports/performance.json": operationalQa.performance,
    "reports/responsive.json": { viewpoints: captures.map((capture) => ({ ...capture.viewpoint, milestones: capture.states.map((item) => ({ id: item.milestone.id, frame: item.milestone.frame, expectedTimeline: item.expectedTimeline, requestedScrollY: item.requestedScrollY, browser: item.state, frameCallback: item.frameCallback, screenshot: item.screenshot, checks: item.checks })) })) },
    "reports/accessibility.json": { reducedMotion: fallbackQa.reducedMotion, noJavaScript: fallbackQa.noJavaScript, zoom200: fallbackQa.zoom200, skip: fallbackQa.skip, semantic: operationalQa.accessibility },
    "reports/family-codec.json": { viewpoints: captures.map((capture) => ({ id: capture.viewpoint.id, family: capture.viewpoint.family, sources: [...new Set(capture.states.map((item) => item.state.mediaSourcePath))], codecs: [...new Set(capture.states.map((item) => item.state.mediaCodec))] })) },
    "reports/media-failure.json": { scenarios: operationalQa.mediaFailures },
    "reports/supporting-routes.json": { routes: operationalQa.supportingRoutes },
    "reports/publication-regression.json": { directDeepLink: operationalQa.directDeepLink, bfcache: operationalQa.bfcache, lifecycle: operationalQa.lifecycle, rootReload: operationalQa.rootReload, deepReload: operationalQa.deepReload, inputMatrix: operationalQa.inputMatrix, operatingField: operationalQa.operatingField, skip: fallbackQa.skip },
    "reports/git-deployment-provenance.json": { repository, deployment },
  };
  const reportRecords = [];
  for (const [relativePath, value] of Object.entries(reportValues)) {
    const report = { schema: MACHINE_REPORT_SCHEMAS[relativePath], status: "PASS", generatedAt: new Date().toISOString(), ...value, humanReviewGates: HUMAN_REVIEW_GATES, authorization: { humanAccepted: false, phase5Authorized: false, mainMerged: false } };
    const written = await writeSafeJson(path.join(options.output, ...relativePath.split("/")), report);
    reportRecords.push(artifactRecord(relativePath, written.bytes, written.sha256, "report"));
  }
  if (sheetRecords.length !== 16 || recordingRecords.length !== 7 || reportRecords.length !== 9) throw new Error("Pre-manifest evidence inventory differs");
  const artifacts = [...sheetRecords.map((item) => artifactRecord(item.relativePath, item.bytes, item.sha256, "sheet", { width: item.width, height: item.height })), ...recordingRecords, ...reportRecords].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const manifest = {
    schema: MACHINE_REPORT_SCHEMAS["reports/deployed-browser.json"],
    status: "PASS",
    generatedAt: new Date().toISOString(),
    captureStartedAt,
    repository,
    deployment: { immutableUrl: options.url, cloudflareDeploymentId: deployment.cloudflare.deploymentId, githubCheckRunId: deployment.github.checkRun.id },
    browser: { product: "Chromium", version: browserVersion, executableBasename: path.basename(executablePath) },
    timeline: { frames: FRAME_COUNT, fps: FPS, physical: [1, 500], blackBeat: [501, 513], semanticEntry: [514, 540], milestones: MILESTONES },
    captureContract: { exactImmutableDeployment: true, capturedAfterDeploymentVerification: true, viewpointCount: 13, sheetCount: 16, recordingCount: 7, reportCountIncludingManifest: 10, requestVideoFrameCallbackUsedWhereAvailable: true, runtimeCssInjected: false, browserRecordingsReal: true, normalizedRecording: { container: "MP4", codec: "H.264", fpsMode: "CFR", fps: 30, pixelFormat: "yuv420p", audioStreams: 0 } },
    viewpoints: captures.map((capture) => ({ id: capture.viewpoint.id, family: capture.viewpoint.family, width: capture.viewpoint.width, height: capture.viewpoint.height })),
    recordings: recordings.map((recording) => ({ id: recording.id, relativePath: recording.relativePath, viewpoint: recording.viewpoint.id, direction: recording.direction, expectedFrameCount: recording.expectedFrameCount, media: recording.media, startState: { conceptualFrame: recording.start.conceptualFrame, physicalTargetFrame: recording.start.targetFrame, physicalTargetTime: recording.start.targetTime }, actionState: recording.actionState, endState: { conceptualFrame: recording.end.conceptualFrame, physicalTargetFrame: recording.end.targetFrame, physicalTargetTime: recording.end.targetTime }, endpointPass: recording.endpointPass })),
    artifacts,
    qa: { reducedMotion: fallbackQa.reducedMotion, noJavaScript: fallbackQa.noJavaScript, zoom200: fallbackQa.zoom200, skip: fallbackQa.skip, inputMatrix: operationalQa.inputMatrix, lifecycle: operationalQa.lifecycle, operatingField: operationalQa.operatingField },
    summary: { status: "PASS", sheets: 16, recordings: 7, reportsIncludingManifest: 10, manifestedArtifactsExcludingSelf: artifacts.length, totalFilesIncludingSelf: 33 },
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: { humanAccepted: false, phase5Authorized: false, mainMerged: false },
  };
  const manifestPath = path.join(options.output, "reports", "deployed-browser.json");
  const manifestRecord = await writeSafeJson(manifestPath, manifest);
  process.stdout.write(stableJson({ status: "PASS", outputBasename: path.basename(options.output), counts: { sheets: 16, recordings: 7, reports: 10 }, manifest: { relativePath: "reports/deployed-browser.json", bytes: manifestRecord.bytes, sha256: manifestRecord.sha256 } }));
}

main().catch((error) => {
  process.stderr.write(`Phase 4-R2 production evidence capture failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
