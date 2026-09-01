#!/usr/bin/env node

/**
 * Phase 7B operating-field browser authority.
 *
 * This is a capture tool, not application runtime. It writes a fresh portable
 * evidence directory outside the repository containing JSON, decoded PNGs and
 * normalized H.264 MP4s. It never substitutes emulation, CSS zoom or transforms
 * for genuine browser-native 200% evidence.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import axeCore from "axe-core";
import { chromium, firefox, webkit } from "playwright-core";
import sharp from "sharp";

import {
  PHASE7B_BRANCH,
  PHASE7B_CORE_VIEWPORTS,
  PHASE7B_CYCLE_COUNT,
  PHASE7B_ENGINES,
  PHASE7B_FROZEN_MAIN,
  PHASE7B_GATES,
  PHASE7B_MACRO_STATES,
  PHASE7B_METHOD_STAGES,
  PHASE7B_PARENT,
  PHASE7B_PERFORMANCE_BUDGET,
  PHASE7B_RECORDING_SCENARIOS,
  PHASE7B_STAGE_RANGES,
} from "./phase7b-contract.mjs";
import { observeTargetSizes } from "./phase7a-target-size.mjs";
import {
  DEFAULT_FFMPEG_CANDIDATES,
  DEFAULT_FFPROBE_CANDIDATES,
} from "./capture-phase7a-r1-closure.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-7b.operating-field-browser-qa.v1";
export const MANIFEST_SCHEMA = "quantum-hub.phase-7b.operating-field-browser-manifest.v1";
export const REPORT_PATH = "phase-7b-browser-qa.json";
export const MANIFEST_PATH = "evidence-manifest.json";
export const RECORDING_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
export const EXPECTED_H2 = "One workpiece changes state.";
export const EXPECTED_H1 = "We turn industrial needs into field evidence.";
export const EXPECTED_AUDIENCES = Object.freeze(["For industry", "For startups"]);
export const EXPECTED_FIELD_MAP_DESTINATIONS = 8;
export const PHASE7A_ACCEPTED_IMMUTABLE_PREVIEW = "https://3b260649.qsite1.pages.dev/";
export const VISUAL_REGRESSION_STATES = Object.freeze([
  Object.freeze({ id: "manifesto-entry", pathname: "/#entry", anchor: "entry", fieldMapOpen: false }),
  Object.freeze({ id: "audience-bifurcation", pathname: "/#entry", anchor: "audience", fieldMapOpen: false }),
  Object.freeze({ id: "field-map-closed", pathname: "/about/", anchor: "route-top", fieldMapOpen: false }),
  Object.freeze({ id: "field-map-open", pathname: "/about/", anchor: "route-top", fieldMapOpen: true }),
]);

const execFileAsync = promisify(execFile);
const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const BROWSER_TYPES = Object.freeze({ chromium, firefox, webkit });
const EVIDENCE_STATUSES = Object.freeze(["PASS", "FAIL", "LIMITATION"]);
const PORTABLE_PATH_DENY = /(?:^|\/)(?:node_modules|\.git|browser-cache|raw|source)(?:\/|$)/i;
const PRIVATE_STRING = /(?:[a-z]:\\Users\\|\/Users\/|\/home\/|file:\/\/)/i;

export const CORE_VIEWPORTS = Object.freeze(PHASE7B_CORE_VIEWPORTS.map(([width, height]) => Object.freeze({
  id: `${width}x${height}`,
  width,
  height,
})));

export const MACRO_SAMPLES = Object.freeze(PHASE7B_MACRO_STATES.map((state) => {
  const [start, end] = PHASE7B_STAGE_RANGES[state];
  return Object.freeze({ state, progress: Number(((start + end) / 2).toFixed(4)) });
}));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function nextValue(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

export function safeRelativePath(value, label = "evidence path") {
  invariant(typeof value === "string" && value.length > 0, `${label} is required`);
  invariant(!value.includes("\\") && !path.posix.isAbsolute(value), `${label} must be portable and relative`);
  invariant(path.posix.normalize(value) === value && value !== "." && !value.startsWith("../"), `${label} may not traverse`);
  invariant(!PORTABLE_PATH_DENY.test(value), `${label} enters a forbidden payload directory`);
  invariant(!/\.(?:zip|7z|rar|tar|tgz)$/i.test(value), `${label} may not be a nested archive`);
  return value;
}

export function assertExternalOutput(candidate, { repositoryRoot = ROOT, temporaryRoot = os.tmpdir() } = {}) {
  invariant(typeof candidate === "string" && candidate.length > 0, "--output is required");
  const resolved = path.resolve(candidate);
  invariant(resolved !== path.parse(resolved).root, "--output may not be a filesystem root");
  invariant(!within(repositoryRoot, resolved), "--output must remain outside the repository");
  invariant(!within(temporaryRoot, resolved), "--output must remain outside OS temporary storage");
  return resolved;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4322/",
    chromiumExecutable: "",
    engine: "all",
    ffmpeg: "",
    ffprobe: "",
    headed: false,
    help: false,
    output: "",
    phase7aBaselineUrl: "",
    retainVisualRegressionPngs: false,
    revision: "",
    selfTest: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--base-url") { options.baseUrl = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--chromium-executable") { options.chromiumExecutable = path.resolve(nextValue(argv, index, flag)); index += 1; }
    else if (flag === "--engine") { options.engine = nextValue(argv, index, flag).toLowerCase(); index += 1; }
    else if (flag === "--ffmpeg") { options.ffmpeg = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--ffprobe") { options.ffprobe = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--output") { options.output = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--phase7a-baseline-url") { options.phase7aBaselineUrl = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--revision") { options.revision = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--timeout-ms") { options.timeoutMs = Number(nextValue(argv, index, flag)); index += 1; }
    else if (flag === "--headed") options.headed = true;
    else if (flag === "--retain-visual-regression-pngs") options.retainVisualRegressionPngs = true;
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  invariant(["all", "chromium", "firefox", "webkit"].includes(options.engine), "--engine must be all, chromium, firefox or webkit");
  invariant(Number.isInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms must be 5000..120000");
  const url = new URL(options.baseUrl);
  invariant(["http:", "https:"].includes(url.protocol) && !url.username && !url.password, "--base-url must be credential-free HTTP(S)");
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  options.baseUrl = url.toString();
  if (!options.help && !options.selfTest) {
    invariant(HASH_40.test(options.revision), "--revision must be an exact lowercase 40-character final HEAD");
    invariant(options.revision !== PHASE7B_PARENT, "--revision must identify a new Phase 7B commit");
    invariant(options.phase7aBaselineUrl, "--phase7a-baseline-url is required");
    const baseline = new URL(options.phase7aBaselineUrl);
    baseline.hash = "";
    baseline.search = "";
    if (!baseline.pathname.endsWith("/")) baseline.pathname += "/";
    options.phase7aBaselineUrl = baseline.toString();
    invariant(options.phase7aBaselineUrl === PHASE7A_ACCEPTED_IMMUTABLE_PREVIEW, "--phase7a-baseline-url must be the accepted immutable 626812c preview");
    options.output = assertExternalOutput(options.output);
  }
  return options;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filename) {
  return sha256(await readFile(filename));
}

function portableJson(value) {
  const visit = (candidate, key = "root") => {
    if (typeof candidate === "string") {
      invariant(!PRIVATE_STRING.test(candidate), `${key} exposes a private local path`);
      return;
    }
    if (Array.isArray(candidate)) candidate.forEach((entry, index) => visit(entry, `${key}[${index}]`));
    else if (candidate && typeof candidate === "object") {
      for (const [name, entry] of Object.entries(candidate)) visit(entry, `${key}.${name}`);
    }
  };
  visit(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

function honestStatus(checks, limitations = []) {
  const failures = Object.entries(checks).filter(([, value]) => value === false).map(([name]) => name);
  const unobserved = Object.entries(checks).filter(([, value]) => value === null).map(([name]) => name);
  if (failures.length) return { status: "FAIL", failures, limitations };
  if (limitations.length || unobserved.length) return { status: "LIMITATION", failures: [], limitations: [...limitations, ...unobserved.map((name) => `${name} was not observable`)] };
  return { status: "PASS", failures: [], limitations: [] };
}

function expectedState(progress) {
  for (const state of PHASE7B_MACRO_STATES) {
    const [, end] = PHASE7B_STAGE_RANGES[state];
    if (progress < end || state === "RELEASE") return state.toLowerCase().replace("_", "-");
  }
  return "release";
}

function rectVisible(rect, viewport) {
  return Boolean(rect && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < viewport.width && rect.top < viewport.height);
}

export function validateStageSnapshot(snapshot, viewport) {
  const checks = {
    oneChapter: snapshot?.chapterCount === 1,
    onePersistentWorkpiece: snapshot?.workpieceCount === 1 && snapshot?.sameWorkpiece === true,
    semanticStageOrder: JSON.stringify(snapshot?.stageNames) === JSON.stringify(PHASE7B_METHOD_STAGES),
    oneH2NoH1: snapshot?.h2Count === 1 && snapshot?.h1Count === 0 && snapshot?.h2Text === EXPECTED_H2,
    fiveH3: snapshot?.stageHeadings?.length === 5 && snapshot.stageHeadings.every((heading, index) => heading.text === PHASE7B_METHOD_STAGES[index]),
    headingsVisible: snapshot?.stageHeadings?.every((heading) => heading.visible === true) === true,
    openingVisible: rectVisible(snapshot?.h2Rect, viewport),
    noHorizontalOverflow: snapshot?.horizontalOverflow === false,
    boundedDom: Number.isInteger(snapshot?.domNodes) && snapshot.domNodes <= PHASE7B_PERFORMANCE_BUDGET.methodDomNodeMaximum,
    boundedSvg: Number.isInteger(snapshot?.svgElements) && snapshot.svgElements <= PHASE7B_PERFORMANCE_BUDGET.methodSvgElementMaximum,
    fiveStaticFallbacks: snapshot?.staticFallbackCount === 5,
  };
  return { ...honestStatus(checks), checks };
}

export function recordingSpecifications(engine) {
  invariant(["chromium", "firefox", "webkit"].includes(engine), `unsupported recording engine: ${engine}`);
  return PHASE7B_RECORDING_SCENARIOS.map((scenario) => {
    const nativeZoomAuthority = scenario === "installed-chrome-200-percent";
    const captureMedia = engine !== "webkit" && !nativeZoomAuthority;
    return Object.freeze({
      engine,
      scenario,
      relativePath: captureMedia ? `recordings/${engine}/${scenario}.mp4` : null,
      nativeZoomAuthority,
      captureMedia,
    });
  });
}

async function gitText(args) {
  const result = await execFileAsync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
  return String(result.stdout).trim();
}

async function repositoryAuthority(revision) {
  const [branch, head, parent, statusText, upstream, upstreamHead, localMain, originMain, mergesText] = await Promise.all([
    gitText(["branch", "--show-current"]),
    gitText(["rev-parse", "HEAD"]),
    gitText(["rev-parse", "HEAD^"]),
    gitText(["status", "--porcelain=v1", "--untracked-files=all"]),
    gitText(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    gitText(["rev-parse", "@{upstream}"]),
    gitText(["rev-parse", "main"]),
    gitText(["rev-parse", "origin/main"]),
    gitText(["rev-list", "--merges", `${PHASE7B_PARENT}..${revision}`]),
  ]);
  const status = statusText.split(/\r?\n/).filter(Boolean);
  invariant(branch === PHASE7B_BRANCH && head === revision, "browser capture branch or exact HEAD differs");
  invariant(parent !== PHASE7B_PARENT ? await gitText(["merge-base", "--is-ancestor", PHASE7B_PARENT, revision]).then(() => true) : true, "Phase 7B parent is not an ancestor");
  invariant(status.length === 0, "browser capture requires a clean worktree including untracked files");
  invariant(upstream === `origin/${PHASE7B_BRANCH}` && upstreamHead === revision, "browser capture requires exact local/upstream parity");
  invariant(localMain === PHASE7B_FROZEN_MAIN && originMain === PHASE7B_FROZEN_MAIN, "local or origin main changed");
  invariant(!mergesText, "Phase 7B browser authority contains a merge commit");
  return {
    branch,
    head,
    requiredParent: PHASE7B_PARENT,
    directParent: parent,
    upstream,
    upstreamHead,
    localMain,
    originMain,
    worktreeClean: true,
    zeroMergeCommits: true,
  };
}

function browserCandidates(explicit = "") {
  if (explicit) return [explicit];
  if (process.platform === "win32") return [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Chromium\\Application\\chrome.exe",
  ];
  if (process.platform === "darwin") return [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
}

async function firstFile(candidates) {
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) continue;
    if (await stat(candidate).then((entry) => entry.isFile()).catch(() => false)) return candidate;
  }
  return null;
}

async function executableCommand(candidates, label) {
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["-version"], { encoding: "utf8", windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
      return candidate;
    } catch {
      // Continue through the bounded existing-helper candidate list.
    }
  }
  throw new Error(`${label} is unavailable; pass its explicit executable flag`);
}

async function resolveMediaTools(options) {
  const ffmpegCandidates = options.ffmpeg ? [options.ffmpeg] : DEFAULT_FFMPEG_CANDIDATES;
  const ffmpeg = await executableCommand(ffmpegCandidates, "FFmpeg");
  const sibling = path.join(path.dirname(path.resolve(ffmpeg)), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const ffprobeCandidates = options.ffprobe ? [options.ffprobe] : [sibling, ...DEFAULT_FFPROBE_CANDIDATES];
  const ffprobe = await executableCommand(ffprobeCandidates, "FFprobe");
  return { ffmpeg, ffprobe };
}

async function browserAuthority(engine, options) {
  if (engine === "chromium") {
    const executablePath = await firstFile(browserCandidates(options.chromiumExecutable));
    invariant(executablePath, "installed Google Chrome/Chromium is unavailable; use --chromium-executable");
    return {
      browserType: chromium,
      executablePath,
      evidenceClass: options.headed ? "installed-headed-chromium" : "installed-headless-chromium",
      statement: options.headed
        ? "Installed Google Chrome/Chromium driven headed through Playwright."
        : "Installed Google Chrome/Chromium driven headlessly through Playwright; not headed physical-input evidence.",
    };
  }
  const browserType = BROWSER_TYPES[engine];
  const executablePath = browserType.executablePath();
  invariant(await stat(executablePath).then((entry) => entry.isFile()).catch(() => false), `managed ${engine} executable is unavailable`);
  return {
    browserType,
    executablePath,
    evidenceClass: engine === "webkit" ? "playwright-webkit-proxy" : "playwright-managed-firefox",
    statement: engine === "webkit"
      ? "Playwright WebKit proxy evidence only; not physical Safari."
      : "Playwright managed Firefox automation evidence.",
  };
}

function qaInstrumentation() {
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCancelRaf = window.cancelAnimationFrame.bind(window);
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  const nativeScrollTo = window.scrollTo.bind(window);
  const nativeScrollBy = window.scrollBy.bind(window);
  const nativeScrollIntoView = Element.prototype.scrollIntoView;
  const rafs = new Set();
  const intervals = new Set();
  const runtimeScrollWrites = [];
  const listenerAdds = new Map();
  const listenerRemoves = new Map();
  const activeObservers = { IntersectionObserver: 0, ResizeObserver: 0, MutationObserver: 0 };
  const observedEntries = { cls: [], longtasks: [] };
  const pageTransitions = [];

  window.requestAnimationFrame = (callback) => {
    let id = 0;
    id = nativeRaf((time) => { rafs.delete(id); callback(time); });
    rafs.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); nativeCancelRaf(id); };
  window.setInterval = (callback, delay, ...args) => {
    const id = nativeSetInterval(callback, delay, ...args);
    intervals.add(id);
    return id;
  };
  window.clearInterval = (id) => { intervals.delete(id); nativeClearInterval(id); };

  const nativeAdd = EventTarget.prototype.addEventListener;
  const nativeRemove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function addEventListener(type, callback, options) {
    listenerAdds.set(type, (listenerAdds.get(type) ?? 0) + 1);
    return nativeAdd.call(this, type, callback, options);
  };
  EventTarget.prototype.removeEventListener = function removeEventListener(type, callback, options) {
    listenerRemoves.set(type, (listenerRemoves.get(type) ?? 0) + 1);
    return nativeRemove.call(this, type, callback, options);
  };
  nativeAdd.call(window, "pagehide", (event) => pageTransitions.push({ type: "pagehide", persisted: Boolean(event.persisted) }));
  nativeAdd.call(window, "pageshow", (event) => pageTransitions.push({ type: "pageshow", persisted: Boolean(event.persisted) }));

  for (const name of Object.keys(activeObservers)) {
    const NativeObserver = window[name];
    if (typeof NativeObserver !== "function") continue;
    window[name] = class QaObserved extends NativeObserver {
      constructor(...args) {
        super(...args);
        activeObservers[name] += 1;
        this.__qaActive = true;
      }
      disconnect() {
        if (this.__qaActive) activeObservers[name] -= 1;
        this.__qaActive = false;
        return super.disconnect();
      }
    };
  }

  const supported = globalThis.PerformanceObserver?.supportedEntryTypes ?? [];
  if (supported.includes("longtask")) {
    const observer = new PerformanceObserver((list) => observedEntries.longtasks.push(...list.getEntries().map((entry) => ({ duration: entry.duration, startTime: entry.startTime }))));
    observer.observe({ type: "longtask", buffered: true });
  }
  if (supported.includes("layout-shift")) {
    const observer = new PerformanceObserver((list) => observedEntries.cls.push(...list.getEntries().filter((entry) => !entry.hadRecentInput).map((entry) => entry.value)));
    observer.observe({ type: "layout-shift", buffered: true });
  }

  window.scrollTo = (...args) => { runtimeScrollWrites.push("scrollTo"); return nativeScrollTo(...args); };
  window.scrollBy = (...args) => { runtimeScrollWrites.push("scrollBy"); return nativeScrollBy(...args); };
  Element.prototype.scrollIntoView = function scrollIntoView(...args) {
    runtimeScrollWrites.push("scrollIntoView");
    return nativeScrollIntoView.apply(this, args);
  };

  const snapshot = () => ({
    activeIntervals: intervals.size,
    activeObservers: Object.values(activeObservers).reduce((sum, count) => sum + count, 0),
    cls: observedEntries.cls.reduce((sum, value) => sum + value, 0),
    listenerAdds: Object.fromEntries(listenerAdds),
    listenerRemoves: Object.fromEntries(listenerRemoves),
    longtasks: observedEntries.longtasks.slice(),
    pageTransitions: pageTransitions.slice(),
    pendingAnimationFrames: rafs.size,
    runtimeScrollWrites: runtimeScrollWrites.slice(),
  });

  globalThis.__phase7bQa = {
    resetMetrics() {
      observedEntries.cls.length = 0;
      observedEntries.longtasks.length = 0;
      pageTransitions.length = 0;
      runtimeScrollWrites.length = 0;
    },
    scrollTo(y) { return nativeScrollTo(0, y); },
    snapshot,
    workpiece: null,
  };
}

async function addInstrumentation(context) {
  await context.addInitScript(qaInstrumentation);
}

function route(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString();
}

async function settle(page, timeoutMs) {
  await page.waitForFunction(() => document.readyState === "complete", null, { timeout: timeoutMs });
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
  await page.waitForTimeout(100);
}

async function gotoHome(page, baseUrl, timeoutMs, pathname = "/#entry") {
  const response = await page.goto(route(baseUrl, pathname), { waitUntil: "load", timeout: timeoutMs });
  invariant(response && response.status() === 200, `home returned ${response?.status() ?? "no response"}`);
  await page.waitForSelector("[data-operating-field]", { timeout: timeoutMs });
  await settle(page, timeoutMs);
  return response.status();
}

async function chapterGeometry(page) {
  return page.evaluate(() => {
    const field = document.querySelector("[data-operating-field]");
    if (!field) return null;
    const rect = field.getBoundingClientRect();
    return {
      start: window.scrollY + rect.top,
      travel: Math.max(1, rect.height - window.innerHeight),
      height: rect.height,
      maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    };
  });
}

async function scrollToProgress(page, geometry, progress, timeoutMs) {
  const expected = expectedState(progress);
  await page.evaluate(({ start, travel, progress: value }) => globalThis.__phase7bQa.scrollTo(start + travel * value), { ...geometry, progress });
  await page.waitForFunction(({ state, value }) => {
    const field = document.querySelector("[data-operating-field]");
    const actual = Number(field?.getAttribute("data-method-progress"));
    return field?.getAttribute("data-method-state") === state && Math.abs(actual - value) <= 0.025;
  }, { state: expected, value: progress }, { timeout: timeoutMs });
  await page.waitForTimeout(80);
  return page.evaluate(() => {
    const field = document.querySelector("[data-operating-field]");
    return {
      progress: Number(field?.getAttribute("data-method-progress")),
      state: field?.getAttribute("data-method-state"),
      style: field?.getAttribute("style") ?? "",
      workpieceSame: globalThis.__phase7bQa.workpiece === field?.querySelector("[data-workpiece]"),
    };
  });
}

async function writeScreenshot(page, output, relativePath, options = {}) {
  safeRelativePath(relativePath);
  const absolute = path.join(output, ...relativePath.split("/"));
  await mkdir(path.dirname(absolute), { recursive: true });
  const bytes = await page.screenshot({ path: absolute, type: "png", animations: "disabled", ...options });
  const metadata = await sharp(bytes).metadata();
  invariant(metadata.format === "png" && metadata.width > 0 && metadata.height > 0, `${relativePath} did not decode as PNG`);
  return { relativePath, bytes: bytes.length, sha256: sha256(bytes), width: metadata.width, height: metadata.height, decodeStatus: "PASS" };
}

export async function normalizeVisualRegressionPng(buffer, { comparisonWidth = null, comparisonHeight = null } = {}) {
  invariant(Buffer.isBuffer(buffer) && buffer.length > 0, "visual-regression PNG buffer is required");
  let pipeline = sharp(buffer).rotate().toColorspace("srgb").ensureAlpha();
  const metadata = await pipeline.metadata();
  invariant(metadata.format === "png" && Number.isInteger(metadata.width) && metadata.width > 0 && Number.isInteger(metadata.height) && metadata.height > 0, "visual-regression input did not decode as PNG");
  const width = comparisonWidth === null ? metadata.width : Math.min(metadata.width, Math.max(1, Math.floor(comparisonWidth)));
  const height = comparisonHeight === null ? metadata.height : Math.min(metadata.height, Math.max(1, Math.floor(comparisonHeight)));
  if (width !== metadata.width || height !== metadata.height) pipeline = pipeline.extract({ left: 0, top: 0, width, height });
  const normalized = await pipeline.raw().toBuffer();
  return {
    sourceBytes: buffer.length,
    sourceSha256: sha256(buffer),
    normalized,
    normalizedSha256: sha256(normalized),
    width,
    height,
    channels: 4,
  };
}

export function compareNormalizedVisuals(baseline, current) {
  invariant(baseline?.width === current?.width && baseline?.height === current?.height && baseline?.channels === 4 && current?.channels === 4, "visual-regression normalized dimensions differ");
  invariant(Buffer.isBuffer(baseline.normalized) && Buffer.isBuffer(current.normalized) && baseline.normalized.length === current.normalized.length, "visual-regression normalized bytes differ in length");
  let differingChannels = 0;
  let differingPixels = 0;
  let sumAbsolute = 0;
  let sumSquares = 0;
  let maximumChannelDelta = 0;
  let minX = baseline.width;
  let minY = baseline.height;
  let maxX = -1;
  let maxY = -1;
  for (let offset = 0; offset < baseline.normalized.length; offset += 4) {
    let pixelDiffers = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(baseline.normalized[offset + channel] - current.normalized[offset + channel]);
      if (delta > 0) { differingChannels += 1; pixelDiffers = true; }
      sumAbsolute += delta;
      sumSquares += delta * delta;
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
    }
    if (pixelDiffers) {
      differingPixels += 1;
      const pixel = offset / 4;
      const x = pixel % baseline.width;
      const y = Math.floor(pixel / baseline.width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  const pixels = baseline.width * baseline.height;
  const channels = pixels * 4;
  const exact = differingPixels === 0;
  const metrics = {
    width: baseline.width,
    height: baseline.height,
    pixels,
    differingPixels,
    differingChannels,
    changedFraction: differingPixels / pixels,
    meanAbsoluteChannelDelta: sumAbsolute / channels,
    rootMeanSquareChannelDelta: Math.sqrt(sumSquares / channels),
    maximumChannelDelta,
    differenceBounds: exact ? null : { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1, width: maxX - minX + 1, height: maxY - minY + 1 },
    exact,
  };
  const boundedRenderingNoise = !exact
    && metrics.changedFraction <= 0.00025
    && metrics.meanAbsoluteChannelDelta <= 0.001
    && metrics.maximumChannelDelta <= 4;
  return {
    metrics,
    status: exact || boundedRenderingNoise ? "PASS" : "FAIL",
    classification: exact ? "EXACT" : boundedRenderingNoise ? "BOUNDED_RENDERING_NOISE" : "UNEXPLAINED_DIFFERENCE",
    explanation: exact
      ? "Normalized pixels are exact."
      : boundedRenderingNoise
        ? "The difference is confined to at most 0.025% of pixels, a mean channel delta no greater than 0.001 and a maximum channel delta no greater than 4; this is the governed in-process raster-noise envelope."
        : null,
  };
}

async function prepareFrozenVisualState(page, origin, specification, timeoutMs, expectedOperatingFields) {
  const target = new URL(specification.pathname, origin).toString();
  let response = await page.goto(target, { waitUntil: "load", timeout: timeoutMs });
  if (!response && page.url() === target) response = await page.reload({ waitUntil: "load", timeout: timeoutMs });
  invariant(response && response.status() === 200, `${specification.id} returned ${response?.status() ?? "no response"}`);
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
  if (specification.anchor === "entry") {
    await page.waitForSelector("#entry h1", { timeout: timeoutMs });
    await page.waitForFunction(() => {
      const shell = document.querySelector("[data-cinematic-shell]");
      return !shell || shell.getAttribute("data-manifesto-reveal") === "resolved";
    }, null, { timeout: timeoutMs });
    await page.evaluate(() => {
      const anchor = document.querySelector("#entry");
      if (!anchor) return;
      const top = scrollY + anchor.getBoundingClientRect().top;
      globalThis.__phase7bQa.scrollTo(Math.max(0, top));
    });
  } else if (specification.anchor === "audience") {
    await page.waitForSelector("[data-field-map-threshold]", { timeout: timeoutMs });
    await page.evaluate(() => {
      const anchor = document.querySelector("[data-field-map-threshold]");
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const top = scrollY + rect.top + rect.height / 2 - innerHeight / 2;
      globalThis.__phase7bQa.scrollTo(Math.max(0, top));
    });
  } else await page.evaluate(() => globalThis.__phase7bQa.scrollTo(0));
  await page.waitForTimeout(180);
  if (specification.fieldMapOpen) {
    const summary = page.locator("[data-field-map] > summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("[data-field-map]")?.hasAttribute("open"), null, { timeout: timeoutMs });
    await page.waitForTimeout(100);
  }
  const semantic = await page.evaluate(({ id, expectedCount }) => {
    const canonicalText = (element) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const audience = document.querySelector("[data-field-map-threshold]");
    const audienceRect = audience?.getBoundingClientRect();
    return {
      state: id,
      h1: canonicalText(document.querySelector("#entry h1")),
      audienceHeading: canonicalText(audience?.querySelector("h2")),
      audienceLinks: [...(audience?.querySelectorAll("a") ?? [])].map(canonicalText),
      fieldMapOpen: document.querySelector("[data-field-map]")?.hasAttribute("open") ?? false,
      fieldMapLinks: [...document.querySelectorAll("[data-field-map] nav a")].map(canonicalText),
      operatingFields: document.querySelectorAll("[data-operating-field]").length,
      expectedOperatingFields: expectedCount,
      frozenBoundaryBottom: audienceRect ? audienceRect.bottom : null,
      clientWidth: document.documentElement.clientWidth,
      innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  }, { id: specification.id, expectedCount: expectedOperatingFields });
  invariant(semantic.operatingFields === expectedOperatingFields, `${specification.id} source does not match its expected Phase authority`);
  invariant(semantic.fieldMapOpen === specification.fieldMapOpen, `${specification.id} Field Map state differs`);
  const screenshot = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
  return { semantic, screenshot };
}

function frozenSemanticSignature(semantic) {
  const { operatingFields: _operatingFields, expectedOperatingFields: _expectedOperatingFields, frozenBoundaryBottom: _frozenBoundaryBottom, ...frozen } = semantic;
  return frozen;
}

async function writeOptionalComparisonPng(output, relativePath, buffer) {
  safeRelativePath(relativePath);
  const destination = path.join(output, ...relativePath.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, buffer, { flag: "wx" });
  return { relativePath, bytes: buffer.length, sha256: sha256(buffer) };
}

async function phase7aVisualRegression(browser, engine, options, output) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await addInstrumentation(context);
  const baselinePage = await context.newPage();
  const currentPage = await context.newPage();
  baselinePage.setDefaultTimeout(options.timeoutMs);
  currentPage.setDefaultTimeout(options.timeoutMs);
  const cases = [];
  try {
    for (const specification of VISUAL_REGRESSION_STATES) {
      const isHome = specification.pathname.startsWith("/#entry");
      const [baseline, current] = await Promise.all([
        prepareFrozenVisualState(baselinePage, options.phase7aBaselineUrl, specification, options.timeoutMs, 0),
        prepareFrozenVisualState(currentPage, options.baseUrl, specification, options.timeoutMs, isHome ? 1 : 0),
      ]);
      const semanticMatch = JSON.stringify(frozenSemanticSignature(baseline.semantic)) === JSON.stringify(frozenSemanticSignature(current.semantic));
      const comparisonHeight = specification.anchor === "audience"
        ? Math.max(1, Math.floor(Math.min(baseline.semantic.innerHeight, current.semantic.innerHeight, baseline.semantic.frozenBoundaryBottom, current.semantic.frozenBoundaryBottom)))
        : Math.min(baseline.semantic.innerHeight, current.semantic.innerHeight);
      const comparisonWidth = Math.min(baseline.semantic.clientWidth, current.semantic.clientWidth);
      const [baselineNormalized, currentNormalized] = await Promise.all([
        normalizeVisualRegressionPng(baseline.screenshot, { comparisonWidth, comparisonHeight }),
        normalizeVisualRegressionPng(current.screenshot, { comparisonWidth, comparisonHeight }),
      ]);
      const comparison = compareNormalizedVisuals(baselineNormalized, currentNormalized);
      const retainedMedia = [];
      if (options.retainVisualRegressionPngs) {
        retainedMedia.push(
          await writeOptionalComparisonPng(output, `visual-regression/${engine}/${specification.id}-phase7a-baseline.png`, baseline.screenshot),
          await writeOptionalComparisonPng(output, `visual-regression/${engine}/${specification.id}-phase7b-current.png`, current.screenshot),
        );
      }
      const checks = {
        semanticMatch,
        noOverflow: !baseline.semantic.horizontalOverflow && !current.semantic.horizontalOverflow,
        matchedDimensions: baselineNormalized.width === currentNormalized.width && baselineNormalized.height === currentNormalized.height,
        explainedPixels: comparison.status === "PASS",
        insertedChapterOnly: !isHome || (baseline.semantic.operatingFields === 0 && current.semantic.operatingFields === 1),
      };
      const authority = honestStatus(checks);
      cases.push({
        id: specification.id,
        baseline: {
          revision: PHASE7B_PARENT,
          sourcePngBytes: baselineNormalized.sourceBytes,
          sourcePngSha256: baselineNormalized.sourceSha256,
          normalizedSha256: baselineNormalized.normalizedSha256,
          semantic: baseline.semantic,
        },
        current: {
          revision: options.revision,
          sourcePngBytes: currentNormalized.sourceBytes,
          sourcePngSha256: currentNormalized.sourceSha256,
          normalizedSha256: currentNormalized.normalizedSha256,
          semantic: current.semantic,
        },
        comparisonRegion: {
          width: comparisonWidth,
          height: comparisonHeight,
          excludedRows: baseline.semantic.innerHeight - comparisonHeight,
          exclusionReason: specification.anchor === "audience" && comparisonHeight < baseline.semantic.innerHeight
            ? "Rows after the accepted audience-bifurcation boundary are excluded because Phase 7B intentionally inserts the new chapter there."
            : null,
        },
        metrics: comparison.metrics,
        classification: comparison.classification,
        explanation: comparison.explanation,
        retainedMedia,
        ...authority,
        checks,
      });
    }
  } finally {
    await context.close();
  }
  const checks = {
    fourFrozenStates: cases.length === VISUAL_REGRESSION_STATES.length,
    everyDifferenceExplained: cases.every(({ status }) => status === "PASS"),
    baselineMediaNotRetainedByDefault: options.retainVisualRegressionPngs || cases.every(({ retainedMedia }) => retainedMedia.length === 0),
  };
  return {
    baselineAuthority: { revision: PHASE7B_PARENT, captureOrigin: "ACCEPTED_IMMUTABLE_PHASE7A" },
    currentAuthority: { revision: options.revision, captureOrigin: "CAPTURE_ORIGIN" },
    retainedPngs: options.retainVisualRegressionPngs,
    cases,
    ...honestStatus(checks),
    checks,
  };
}

async function inspectChapter(page, viewport) {
  return page.evaluate(async ({ expectedStages, expectedH2, viewport: view }) => {
    const field = document.querySelector("[data-operating-field]");
    const workpiece = field?.querySelector("[data-workpiece]") ?? null;
    if (globalThis.__phase7bQa) globalThis.__phase7bQa.workpiece ??= workpiece;
    const h2 = field?.querySelector("h2") ?? null;
    const stages = [...(field?.querySelectorAll("[data-method-stage]") ?? [])];
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const visible = (element) => {
      if (!element) return false;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.right > 0
        && bounds.top < view.height && bounds.left < view.width
        && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    };
    const stageHeadings = [];
    for (const stage of stages) {
      const heading = stage.querySelector("h3");
      heading?.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, 30));
      stageHeadings.push({ text: heading?.textContent?.trim() ?? "", rect: rect(heading), visible: visible(heading) });
    }
    h2?.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const h2Rect = rect(h2);
    return {
      chapterCount: document.querySelectorAll("[data-operating-field]").length,
      domNodes: field?.querySelectorAll("*").length ?? -1,
      h1Count: field?.querySelectorAll("h1").length ?? -1,
      h2Count: field?.querySelectorAll("h2").length ?? -1,
      h2Rect,
      h2Text: h2?.textContent?.trim() ?? "",
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      sameWorkpiece: globalThis.__phase7bQa?.workpiece === workpiece,
      stageHeadings,
      stageNames: stages.map((stage) => stage.getAttribute("data-method-stage")?.toUpperCase()),
      staticFallbackCount: field?.querySelectorAll("[data-method-static]").length ?? -1,
      svgElements: field?.querySelectorAll("svg *").length ?? -1,
      workpieceCount: field?.querySelectorAll("[data-workpiece]").length ?? -1,
      expectedStages,
      expectedH2,
    };
  }, { expectedStages: PHASE7B_METHOD_STAGES, expectedH2: EXPECTED_H2, viewport });
}

async function responsiveMatrix(browser, engine, options, output) {
  const cases = [];
  for (const viewport of CORE_VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    await addInstrumentation(context);
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    try {
      await gotoHome(page, options.baseUrl, options.timeoutMs);
      const geometry = await chapterGeometry(page);
      invariant(geometry, `${engine} ${viewport.id} chapter geometry unavailable`);
      await page.evaluate(() => { globalThis.__phase7bQa.workpiece = document.querySelector("[data-operating-field] [data-workpiece]"); });
      const projection = [];
      for (const sample of MACRO_SAMPLES) projection.push({ ...sample, observed: await scrollToProgress(page, geometry, sample.progress, options.timeoutMs) });
      const snapshot = await inspectChapter(page, viewport);
      const authority = validateStageSnapshot(snapshot, viewport);
      const projectionChecks = {
        everyMacroState: projection.every(({ state, observed }) => observed.state === state.toLowerCase().replace("_", "-")),
        directProgress: projection.every(({ progress, observed }) => Math.abs(progress - observed.progress) <= 0.025),
        persistentAcrossStates: projection.every(({ observed }) => observed.workpieceSame),
      };
      const projectionAuthority = honestStatus(projectionChecks);
      await scrollToProgress(page, geometry, 0.905, options.timeoutMs);
      const screenshot = await writeScreenshot(page, output, `screenshots/${engine}/${viewport.id}-operating-field.png`);
      const targetSize = await observeTargetSizes(page, { route: "/#entry", viewport, state: "phase7b-operating-field" });
      const checks = {
        structure: authority.status === "PASS",
        projection: projectionAuthority.status === "PASS",
        targets: targetSize.status === "PASS",
      };
      cases.push({ viewport, geometry, snapshot, projection, targetSize, screenshot, ...honestStatus(checks), checks });
    } finally {
      await context.close();
    }
  }
  return { cases, ...honestStatus({ allViewports: cases.length === CORE_VIEWPORTS.length, everyCase: cases.every(({ status }) => status === "PASS") }) };
}

async function projectionIntegrity(browser, options) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await addInstrumentation(context);
  const page = await context.newPage();
  page.setDefaultTimeout(options.timeoutMs);
  try {
    await gotoHome(page, options.baseUrl, options.timeoutMs);
    const geometry = await chapterGeometry(page);
    invariant(geometry, "projection geometry unavailable");
    await page.evaluate(() => {
      globalThis.__phase7bQa.workpiece = document.querySelector("[data-operating-field] [data-workpiece]");
      globalThis.__phase7bQa.resetMetrics();
    });
    const forward = [];
    for (const sample of MACRO_SAMPLES) forward.push(await scrollToProgress(page, geometry, sample.progress, options.timeoutMs));
    const reverse = [];
    for (const sample of [...MACRO_SAMPLES].reverse()) reverse.push(await scrollToProgress(page, geometry, sample.progress, options.timeoutMs));

    await page.evaluate(({ start, travel }) => {
      globalThis.__phase7bQa.scrollTo(start + travel * 0.93);
      globalThis.__phase7bQa.scrollTo(start + travel * 0.13);
    }, geometry);
    await page.waitForFunction(() => document.querySelector("[data-operating-field]")?.getAttribute("data-method-state") === "frame", null, { timeout: options.timeoutMs });
    const fastReverse = await page.evaluate(() => ({
      progress: Number(document.querySelector("[data-operating-field]")?.getAttribute("data-method-progress")),
      state: document.querySelector("[data-operating-field]")?.getAttribute("data-method-state"),
    }));
    await page.evaluate(({ start, travel }) => {
      globalThis.__phase7bQa.scrollTo(start + travel * 0.13);
      globalThis.__phase7bQa.scrollTo(start + travel * 0.93);
    }, geometry);
    await page.waitForFunction(() => document.querySelector("[data-operating-field]")?.getAttribute("data-method-state") === "decide", null, { timeout: options.timeoutMs });
    const fastForward = await page.evaluate(() => ({
      progress: Number(document.querySelector("[data-operating-field]")?.getAttribute("data-method-progress")),
      state: document.querySelector("[data-operating-field]")?.getAttribute("data-method-state"),
    }));
    const stableBefore = await page.evaluate(() => ({
      state: document.querySelector("[data-operating-field]")?.getAttribute("data-method-state"),
      progress: document.querySelector("[data-operating-field]")?.getAttribute("data-method-progress"),
      style: document.querySelector("[data-operating-field]")?.getAttribute("style"),
    }));
    await page.waitForTimeout(350);
    const stableAfter = await page.evaluate(() => ({
      state: document.querySelector("[data-operating-field]")?.getAttribute("data-method-state"),
      progress: document.querySelector("[data-operating-field]")?.getAttribute("data-method-progress"),
      style: document.querySelector("[data-operating-field]")?.getAttribute("style"),
    }));
    const probeBounds = await page.locator("[data-operating-field-probe]").boundingBox();
    invariant(probeBounds, "pointer probe geometry unavailable");
    await page.mouse.move(probeBounds.x + probeBounds.width * 0.62, probeBounds.y + probeBounds.height * 0.43);
    await page.waitForTimeout(100);
    const probeActive = await page.evaluate(() => {
      const field = document.querySelector("[data-operating-field]");
      const style = getComputedStyle(field);
      const pixels = ["--method-probe-far-x", "--method-probe-far-y", "--method-probe-mid-x", "--method-probe-mid-y", "--method-probe-near-x", "--method-probe-near-y"]
        .map((property) => Math.abs(Number.parseFloat(style.getPropertyValue(property))) || 0);
      return { state: field?.getAttribute("data-method-probe"), maximumPixels: Math.max(...pixels) };
    });
    await page.evaluate(({ start }) => globalThis.__phase7bQa.scrollTo(Math.max(0, start - 200)), geometry);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
    const probeSettled = await page.evaluate(() => document.querySelector("[data-operating-field]")?.getAttribute("data-method-probe"));
    const metrics = await page.evaluate(() => globalThis.__phase7bQa.snapshot());
    const checks = {
      forwardOrder: forward.map(({ state }) => state).join(",") === MACRO_SAMPLES.map(({ state }) => state.toLowerCase().replace("_", "-")).join(","),
      reverseOrder: reverse.map(({ state }) => state).join(",") === [...MACRO_SAMPLES].reverse().map(({ state }) => state.toLowerCase().replace("_", "-")).join(","),
      fastReverseLatestPosition: fastReverse.state === "frame" && Math.abs(fastReverse.progress - 0.13) <= 0.025,
      fastForwardLatestPosition: fastForward.state === "decide" && Math.abs(fastForward.progress - 0.93) <= 0.025,
      stableStop: JSON.stringify(stableBefore) === JSON.stringify(stableAfter),
      persistentWorkpiece: forward.every(({ workpieceSame }) => workpieceSame) && reverse.every(({ workpieceSame }) => workpieceSame),
      noRuntimeScrollWrites: metrics.runtimeScrollWrites.length === 0,
      noIdleRaf: metrics.pendingAnimationFrames === 0,
      noIntervals: metrics.activeIntervals === 0,
      boundedPointerProbe: probeActive.state === "active" && probeActive.maximumPixels <= 7,
      pointerSettles: probeSettled === "settled",
    };
    return { geometry, forward, reverse, fastReverse, fastForward, stableBefore, stableAfter, probeActive, probeSettled, metrics, ...honestStatus(checks), checks };
  } finally {
    await context.close();
  }
}

async function fallbackMatrix(browser, engine, options, output) {
  const specifications = [
    { id: "reduced-motion", context: { viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }, pathname: "/#entry" },
    { id: "no-javascript", context: { viewport: { width: 390, height: 844 }, javaScriptEnabled: false }, pathname: "/#entry" },
    { id: "fallback-fonts", context: { viewport: { width: 320, height: 800 } }, pathname: "/#entry", blockFonts: true },
  ];
  const cases = [];
  for (const specification of specifications) {
    const context = await browser.newContext(specification.context);
    if (specification.id !== "no-javascript") await addInstrumentation(context);
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    if (specification.blockFonts) await page.route("**/*", (requestRoute) => requestRoute.request().resourceType() === "font" ? requestRoute.abort("blockedbyclient") : requestRoute.continue());
    try {
      await gotoHome(page, options.baseUrl, options.timeoutMs, specification.pathname);
      const state = await page.evaluate(() => {
        const field = document.querySelector("[data-operating-field]");
        const visible = (element) => {
          if (!element) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        return {
          fallback: field?.getAttribute("data-method-fallback") ?? null,
          h2: field?.querySelector("h2")?.textContent?.trim() ?? "",
          h3: [...(field?.querySelectorAll("[data-method-stage] h3") ?? [])].map((entry) => entry.textContent?.trim()),
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          mode: field?.getAttribute("data-method-mode") ?? null,
          staticVisible: [...(field?.querySelectorAll("[data-method-static]") ?? [])].filter(visible).length,
          workpieces: field?.querySelectorAll("[data-workpiece]").length ?? 0,
        };
      });
      const screenshot = await writeScreenshot(page, output, `screenshots/${engine}/fallback-${specification.id}.png`, { fullPage: false });
      const viewport = { id: specification.id, ...specification.context.viewport };
      const targets = await observeTargetSizes(page, { route: specification.pathname, viewport, state: specification.id });
      const checks = {
        semanticHeading: state.h2 === EXPECTED_H2 && JSON.stringify(state.h3) === JSON.stringify(PHASE7B_METHOD_STAGES),
        oneWorkpiece: state.workpieces === 1,
        noHorizontalOverflow: !state.horizontalOverflow,
        staticAuthoredStages: state.staticVisible === 5,
        correctMode: specification.id === "reduced-motion"
          ? state.mode === "static" && state.fallback === "reduced-motion"
          : specification.id === "no-javascript" ? state.mode === "static" : true,
        targets: targets.status === "PASS",
      };
      cases.push({ id: specification.id, state, screenshot, targets, ...honestStatus(checks), checks });
    } finally {
      await context.close();
    }
  }
  return { cases, ...honestStatus({ completeMatrix: cases.length === specifications.length, everyCase: cases.every(({ status }) => status === "PASS") }) };
}

function compactAxe(result) {
  const compact = (entry) => ({
    id: entry.id,
    impact: entry.impact,
    help: entry.help,
    nodes: entry.nodes.map((node) => ({ impact: node.impact, target: node.target, failureSummary: node.failureSummary })),
  });
  return { violations: result.violations.map(compact), incomplete: result.incomplete.map(compact), passes: result.passes.length };
}

async function axeMatrix(browser, options) {
  const cases = [];
  for (const viewport of [{ id: "desktop", width: 1440, height: 900 }, { id: "narrow", width: 320, height: 800 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    await addInstrumentation(context);
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    try {
      await gotoHome(page, options.baseUrl, options.timeoutMs);
      const geometry = await chapterGeometry(page);
      await scrollToProgress(page, geometry, 0.74, options.timeoutMs);
      await page.addScriptTag({ content: axeCore.source });
      const raw = await page.evaluate(async () => globalThis.axe.run(document, { resultTypes: ["violations", "incomplete", "passes"] }));
      const result = compactAxe(raw);
      const nonContrastIncomplete = result.incomplete.filter(({ id }) => id !== "color-contrast");
      const limitations = result.incomplete.filter(({ id }) => id === "color-contrast").length
        ? ["axe could not determine Signal Field contrast; bind this case to a manual worst-case contrast calculation before human review"]
        : [];
      const checks = { zeroViolations: result.violations.length === 0, zeroNonContrastIncomplete: nonContrastIncomplete.length === 0 };
      cases.push({ viewport, result, ...honestStatus(checks, limitations), checks });
    } finally {
      await context.close();
    }
  }
  const checks = { completeMatrix: cases.length === 2, noFailures: cases.every(({ status }) => status !== "FAIL") };
  const limitations = cases.flatMap((entry) => entry.limitations);
  return { cases, ...honestStatus(checks, limitations), checks };
}

async function phase7aRegression(browser, options) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await addInstrumentation(context);
  const page = await context.newPage();
  page.setDefaultTimeout(options.timeoutMs);
  try {
    await gotoHome(page, options.baseUrl, options.timeoutMs);
    const retained = await page.evaluate(({ expectedH1 }) => {
      const names = (selector) => [...document.querySelectorAll(selector)].map((entry) => entry.textContent?.replace(/\s+/g, " ").trim());
      return {
        audienceNames: names("[data-field-map-threshold] .bifurcation-destination__label"),
        cinematicShells: document.querySelectorAll("[data-cinematic-shell]").length,
        fieldMapDestinations: document.querySelectorAll("[data-field-map] nav a").length,
        fieldMaps: document.querySelectorAll("[data-field-map]").length,
        hash: location.hash,
        h1: document.querySelector("#entry h1")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        manifestoThresholds: document.querySelectorAll("[data-manifesto-threshold]").length,
        signalFields: document.querySelectorAll("[data-signal-field]").length,
        expectedH1,
      };
    }, { expectedH1: EXPECTED_H1 });
    await page.evaluate(() => globalThis.__phase7bQa.scrollTo(0));
    await page.waitForTimeout(100);
    const firstFrame = await page.evaluate(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-target-frame"));
    await page.evaluate(() => {
      const threshold = document.querySelector("[data-field-map-threshold]");
      if (!threshold) return;
      const bounds = threshold.getBoundingClientRect();
      globalThis.__phase7bQa.scrollTo(scrollY + bounds.top + bounds.height / 2 - innerHeight / 2);
    });
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.dataset.routeNavigation === "released");
    await page.waitForTimeout(120);
    const finalFrame = await page.evaluate(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-target-frame"));
    const summary = page.locator("[data-field-map] > summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("[data-field-map]")?.hasAttribute("open"));
    const mapOpen = await page.evaluate(() => ({
      active: document.activeElement?.matches("[data-field-map] summary, [data-field-map] a") ?? false,
      backgroundFocusable: [...document.querySelectorAll("[data-field-map-background]")]
        .flatMap((region) => [
          ...(region.matches("a[href], button, summary, [tabindex]") ? [region] : []),
          ...region.querySelectorAll("a[href], button, summary, [tabindex]"),
        ])
        .filter((entry) => !entry.closest("[inert]") && entry.getClientRects().length > 0).length,
      inertRegions: document.querySelectorAll("[data-field-map-background][inert]").length,
      open: document.querySelector("[data-field-map]")?.hasAttribute("open") ?? false,
    }));
    await page.keyboard.press("Tab");
    const mapTab = await page.evaluate(() => document.activeElement?.matches("[data-field-map] summary, [data-field-map] a") ?? false);
    await page.keyboard.press("Escape");
    const mapClosed = await page.evaluate(() => ({
      focusReturned: document.activeElement?.matches("[data-field-map] > summary") ?? false,
      inertRegions: document.querySelectorAll("[data-field-map-background][inert]").length,
      open: document.querySelector("[data-field-map]")?.hasAttribute("open") ?? false,
    }));
    const checks = {
      exactH1: retained.h1.toLowerCase() === EXPECTED_H1.toLowerCase(),
      frozenHooks: retained.cinematicShells === 1 && retained.manifestoThresholds === 1 && retained.signalFields === 1,
      audienceBifurcation: JSON.stringify(retained.audienceNames) === JSON.stringify(EXPECTED_AUDIENCES),
      fieldMap: retained.fieldMaps === 1 && retained.fieldMapDestinations === EXPECTED_FIELD_MAP_DESTINATIONS,
      deliberateEntry: retained.hash === "#entry",
      physicalFrameEndpoints: firstFrame === "1" && finalFrame === "500",
      fieldMapKeyboardRegression: mapOpen.open && mapOpen.active && mapOpen.inertRegions >= 2 && mapOpen.backgroundFocusable === 0 && mapTab && !mapClosed.open && mapClosed.focusReturned && mapClosed.inertRegions === 0,
    };
    return { retained, firstFrame, finalFrame, mapOpen, mapTab, mapClosed, ...honestStatus(checks), checks };
  } finally {
    await context.close();
  }
}

async function historyCase(browser, options) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await addInstrumentation(context);
  const page = await context.newPage();
  page.setDefaultTimeout(options.timeoutMs);
  try {
    const about = await page.goto(route(options.baseUrl, "/about/"), { waitUntil: "load", timeout: options.timeoutMs });
    const entry = await page.goto(route(options.baseUrl, "/#entry"), { waitUntil: "load", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    const entryState = await page.evaluate(() => ({ hash: location.hash, operatingField: document.querySelectorAll("[data-operating-field]").length, entry: document.querySelectorAll("#entry").length }));
    await page.goBack({ waitUntil: "load", timeout: options.timeoutMs });
    const back = await page.evaluate(() => ({ pathname: location.pathname, operatingField: document.querySelectorAll("[data-operating-field]").length }));
    await page.goForward({ waitUntil: "load", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    const forward = await page.evaluate(() => ({ pathname: location.pathname, hash: location.hash, operatingField: document.querySelectorAll("[data-operating-field]").length }));
    const checks = {
      status: about?.status() === 200 && entry?.status() === 200,
      entryIntent: entryState.hash === "#entry" && entryState.entry === 1 && entryState.operatingField === 1,
      backRoute: back.pathname === "/about/" && back.operatingField === 0,
      forwardRestoration: forward.pathname === "/" && forward.hash === "#entry" && forward.operatingField === 1,
    };
    return { entryState, back, forward, ...honestStatus(checks), checks };
  } finally {
    await context.close();
  }
}

async function lifecycleCase(browser, options) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await addInstrumentation(context);
  const page = await context.newPage();
  page.setDefaultTimeout(options.timeoutMs);
  try {
    await gotoHome(page, options.baseUrl, options.timeoutMs);
    const geometry = await chapterGeometry(page);
    await page.evaluate(() => {
      globalThis.__phase7bQa.workpiece = document.querySelector("[data-operating-field] [data-workpiece]");
      globalThis.__phase7bQa.resetMetrics();
    });
    const before = await page.evaluate(() => ({
      metrics: globalThis.__phase7bQa.snapshot(),
      dom: document.querySelector("[data-operating-field]")?.querySelectorAll("*").length,
      svg: document.querySelector("[data-operating-field]")?.querySelectorAll("svg *").length,
    }));
    const cycles = [];
    for (let cycle = 1; cycle <= PHASE7B_CYCLE_COUNT; cycle += 1) {
      const forward = await scrollToProgress(page, geometry, 0.94, options.timeoutMs);
      const reverse = await scrollToProgress(page, geometry, 0.02, options.timeoutMs);
      cycles.push({ cycle, forward: { state: forward.state, progress: forward.progress }, reverse: { state: reverse.state, progress: reverse.progress }, workpieceSame: forward.workpieceSame && reverse.workpieceSame });
    }
    await page.waitForTimeout(350);
    const after = await page.evaluate(() => ({
      metrics: globalThis.__phase7bQa.snapshot(),
      dom: document.querySelector("[data-operating-field]")?.querySelectorAll("*").length,
      svg: document.querySelector("[data-operating-field]")?.querySelectorAll("svg *").length,
    }));
    const listenerAdded = (metrics) => Object.values(metrics.listenerAdds).reduce((sum, count) => sum + count, 0);
    const checks = {
      tenCycles: cycles.length === PHASE7B_CYCLE_COUNT,
      exactStates: cycles.every(({ forward, reverse }) => forward.state === "decide" && reverse.state === "open-field"),
      persistentWorkpiece: cycles.every(({ workpieceSame }) => workpieceSame),
      stableDom: before.dom === after.dom && before.svg === after.svg,
      listenerInvariant: listenerAdded(after.metrics) === listenerAdded(before.metrics),
      observerBudget: after.metrics.activeObservers <= PHASE7B_PERFORMANCE_BUDGET.activeObserverMaximum,
      idleRafBudget: after.metrics.pendingAnimationFrames <= PHASE7B_PERFORMANCE_BUDGET.idleRafMaximum,
      intervalBudget: after.metrics.activeIntervals <= PHASE7B_PERFORMANCE_BUDGET.idleIntervalMaximum,
      clsBudget: after.metrics.cls <= PHASE7B_PERFORMANCE_BUDGET.clsMaximum,
      longTaskBudget: after.metrics.longtasks.length <= PHASE7B_PERFORMANCE_BUDGET.attributableLongTaskMaximum,
      nativeScrollOwnership: after.metrics.runtimeScrollWrites.length === 0,
    };
    const supported = await page.evaluate(() => ({
      cls: PerformanceObserver.supportedEntryTypes?.includes("layout-shift") ?? false,
      longtask: PerformanceObserver.supportedEntryTypes?.includes("longtask") ?? false,
    }));
    await page.goto(route(options.baseUrl, "/about/"), { waitUntil: "load", timeout: options.timeoutMs });
    const departed = await page.evaluate(() => document.querySelectorAll("[data-operating-field]").length);
    await page.goBack({ waitUntil: "load", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    const restored = await page.evaluate(() => ({
      controller: document.querySelector("[data-operating-field]")?.getAttribute("data-method-controller") ?? null,
      fields: document.querySelectorAll("[data-operating-field]").length,
      pageTransitions: globalThis.__phase7bQa?.snapshot().pageTransitions ?? [],
      workpieces: document.querySelectorAll("[data-operating-field] [data-workpiece]").length,
    }));
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
    const explicitDepartureCleanup = await page.evaluate(() => ({
      controller: document.querySelector("[data-operating-field]")?.getAttribute("data-method-controller") ?? null,
      metrics: globalThis.__phase7bQa.snapshot(),
    }));
    checks.routeDepartureCleanup = departed === 0 && restored.fields === 1 && restored.workpieces === 1 && ["ready", null].includes(restored.controller);
    checks.pagehideCleanup = explicitDepartureCleanup.controller === null
      && explicitDepartureCleanup.metrics.pendingAnimationFrames === 0
      && explicitDepartureCleanup.metrics.activeIntervals === 0;
    const bfcacheObserved = restored.pageTransitions.some(({ type, persisted }) => type === "pageshow" && persisted);
    const limitations = [
      ...(!supported.cls ? ["layout-shift PerformanceObserver unsupported in this engine"] : []),
      ...(!supported.longtask ? ["long-task PerformanceObserver unsupported in this engine"] : []),
      ...(!bfcacheObserved ? ["BFCache restoration was not observed in this automated navigation"] : []),
      "Hidden-document visibility cleanup requires separate browser lifecycle evidence; this run validates rest, pagehide and route departure cleanup.",
    ];
    if (!supported.cls) checks.clsBudget = null;
    if (!supported.longtask) checks.longTaskBudget = null;
    return { before, cycles, after, supported, departed, restored, explicitDepartureCleanup, bfcacheObserved, ...honestStatus(checks, limitations), checks };
  } finally {
    await context.close();
  }
}

async function networkCase(browser, options) {
  const origin = new URL(options.baseUrl).origin;
  const normalContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await addInstrumentation(normalContext);
  const page = await normalContext.newPage();
  page.setDefaultTimeout(options.timeoutMs);
  const requests = [];
  const failures = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    requests.push({ path: url.protocol === "blob:" ? "blob:generated" : url.pathname, resourceType: request.resourceType(), sameOrigin: [origin, "null"].includes(url.origin) || ["blob:", "data:"].includes(url.protocol) });
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    failures.push({ path: url.pathname, reason: request.failure()?.errorText ?? "unknown" });
  });
  let normal;
  try {
    await gotoHome(page, options.baseUrl, options.timeoutMs);
    const geometry = await chapterGeometry(page);
    await scrollToProgress(page, geometry, 0.74, options.timeoutMs);
    const checks = {
      noThirdPartyRequests: requests.every(({ sameOrigin }) => sameOrigin),
      noFailedRequests: failures.length === 0,
      boundedRequestInventory: requests.length > 0 && requests.length < 80,
    };
    normal = { requestCount: requests.length, requests, requestFailures: failures, ...honestStatus(checks), checks };
  } finally {
    await normalContext.close();
  }

  const adversity = [];
  for (const policy of ["blocked", "slow"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await addInstrumentation(context);
    const candidate = await context.newPage();
    candidate.setDefaultTimeout(options.timeoutMs);
    let interceptedMediaRequests = 0;
    await candidate.route(/phase-4[^?#]*\.mp4(?:[?#]|$)/i, async (requestRoute) => {
      interceptedMediaRequests += 1;
      if (policy === "blocked") await requestRoute.abort("failed");
      else {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await requestRoute.continue();
      }
    });
    try {
      const response = await candidate.goto(route(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      await candidate.waitForTimeout(policy === "blocked" ? 1_500 : 900);
      const state = await candidate.evaluate(() => ({
        h2: document.querySelector("[data-operating-field] h2")?.textContent?.trim() ?? "",
        stages: [...document.querySelectorAll("[data-method-stage] h3")].map((entry) => entry.textContent?.trim()),
        workpieces: document.querySelectorAll("[data-operating-field] [data-workpiece]").length,
      }));
      const checks = {
        documentAvailable: response?.status() === 200,
        failurePolicyExercised: interceptedMediaRequests === 1,
        semanticMethodSurvives: state.h2 === EXPECTED_H2 && JSON.stringify(state.stages) === JSON.stringify(PHASE7B_METHOD_STAGES),
        oneWorkpiece: state.workpieces === 1,
      };
      adversity.push({ policy, interceptedMediaRequests, state, ...honestStatus(checks), checks });
    } finally {
      await context.close();
    }
  }
  const checks = {
    normalNetwork: normal.status === "PASS",
    networkFailureResilience: adversity.every(({ status }) => status === "PASS"),
  };
  return { normal, adversity, ...honestStatus(checks), checks };
}

async function mediaProbe(ffprobe, filename) {
  const result = await execFileAsync(ffprobe, ["-v", "error", "-show_entries", "format=format_name,duration:stream=index,codec_name,codec_type,pix_fmt,width,height", "-of", "json", filename], { encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(result.stdout);
}

async function normalizeVideo(tools, raw, destination, { trimStartSeconds = 0 } = {}) {
  await mkdir(path.dirname(destination), { recursive: true });
  const trim = trimStartSeconds > 0 ? ["-ss", trimStartSeconds.toFixed(3)] : [];
  await execFileAsync(tools.ffmpeg, [
    "-v", "error", "-n", "-i", raw, ...trim,
    "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,fps=30",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", destination,
  ], { encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  await execFileAsync(tools.ffmpeg, ["-v", "error", "-i", destination, "-f", "null", "-"], { encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  const probe = await mediaProbe(tools.ffprobe, destination);
  const videoStreams = probe.streams.filter(({ codec_type: type }) => type === "video");
  const audioStreams = probe.streams.filter(({ codec_type: type }) => type === "audio");
  const stream = videoStreams[0];
  invariant(videoStreams.length === 1 && audioStreams.length === 0, "normalized recording stream inventory differs");
  invariant(stream.codec_name === "h264" && stream.pix_fmt === "yuv420p" && stream.width === 1280 && stream.height === 720, "normalized recording media contract differs");
  return {
    bytes: (await stat(destination)).size,
    codec: stream.codec_name,
    decodeStatus: "PASS",
    durationSeconds: Number(probe.format.duration),
    height: stream.height,
    pixelFormat: stream.pix_fmt,
    sha256: await sha256File(destination),
    width: stream.width,
  };
}

async function wheelToDocumentPosition(page, targetY, timeoutMs, { dwellMs = 35, stepFactor = 0.72 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let samples = 0;
  while (Date.now() < deadline) {
    const state = await page.evaluate((target) => ({
      delta: target - window.scrollY,
      height: window.innerHeight,
      max: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      scrollY: window.scrollY,
    }), targetY);
    const boundedTarget = Math.min(state.max, Math.max(0, targetY));
    if (Math.abs(boundedTarget - state.scrollY) <= 3) return { samples, scrollY: state.scrollY, targetY: boundedTarget };
    const maximumStep = Math.max(120, state.height * stepFactor);
    const delta = Math.max(-maximumStep, Math.min(maximumStep, boundedTarget - state.scrollY));
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(dwellMs);
    samples += 1;
  }
  throw new Error(`native wheel delivery did not reach the requested document position within ${timeoutMs}ms`);
}

async function scenarioAction(page, scenario, options) {
  const actionStartedAt = Date.now();
  await gotoHome(page, options.baseUrl, options.timeoutMs);
  const geometry = await chapterGeometry(page);
  const dwell = (duration = 220) => page.waitForTimeout(duration);
  if (scenario === "full-forward-method") {
    for (const sample of MACRO_SAMPLES) {
      await wheelToDocumentPosition(page, geometry.start + geometry.travel * sample.progress, options.timeoutMs);
      await dwell(300);
    }
  } else if (scenario === "full-reverse-method") {
    await wheelToDocumentPosition(page, geometry.start + geometry.travel * 0.985, options.timeoutMs, { dwellMs: 12, stepFactor: 1.8 });
    await dwell(300);
    const trimStartSeconds = (Date.now() - actionStartedAt) / 1000;
    for (const sample of [...MACRO_SAMPLES].reverse()) {
      await wheelToDocumentPosition(page, geometry.start + geometry.travel * sample.progress, options.timeoutMs);
      await dwell(300);
    }
    await wheelToDocumentPosition(page, Math.max(0, geometry.start - 1.25 * RECORDING_VIEWPORT.height), options.timeoutMs);
    await dwell(450);
    return { trimStartSeconds, inputModel: "Playwright wheel delivery to native document scroll" };
  } else if (scenario === "resolved-stop-states") {
    for (const sample of MACRO_SAMPLES) {
      await wheelToDocumentPosition(page, geometry.start + geometry.travel * sample.progress, options.timeoutMs);
      await dwell(900);
    }
  } else if (scenario === "fast-forward-immediate-reverse") {
    await page.mouse.wheel(0, geometry.start + geometry.travel * 0.94 - await page.evaluate(() => scrollY));
    await dwell(500);
    await page.mouse.wheel(0, geometry.start + geometry.travel * 0.13 - await page.evaluate(() => scrollY));
    await dwell(500);
  } else if (scenario === "responsive-matrix") {
    for (const viewport of CORE_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const current = await chapterGeometry(page);
      await wheelToDocumentPosition(page, current.start + current.travel * 0.88, options.timeoutMs, { dwellMs: 15, stepFactor: 1.5 });
      await dwell(180);
    }
  } else if (scenario === "mobile-authored-forward-reverse") {
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await chapterGeometry(page);
    for (const sample of MACRO_SAMPLES) await wheelToDocumentPosition(page, mobile.start + mobile.travel * sample.progress, options.timeoutMs);
    for (const sample of [...MACRO_SAMPLES].reverse()) await wheelToDocumentPosition(page, mobile.start + mobile.travel * sample.progress, options.timeoutMs);
  } else if (scenario === "reduced-motion-resolved-states" || scenario === "no-javascript-semantic-method") {
    for (const stage of await page.locator("[data-method-stage]").all()) {
      const box = await stage.boundingBox();
      if (box) await wheelToDocumentPosition(page, await page.evaluate(() => scrollY) + box.y - 80, options.timeoutMs);
      await dwell(500);
    }
  } else if (scenario === "lifecycle-ten-cycles") {
    for (let cycle = 0; cycle < PHASE7B_CYCLE_COUNT; cycle += 1) {
      await wheelToDocumentPosition(page, geometry.start + geometry.travel * 0.94, options.timeoutMs, { dwellMs: 12, stepFactor: 1.8 });
      await wheelToDocumentPosition(page, geometry.start + geometry.travel * 0.02, options.timeoutMs, { dwellMs: 12, stepFactor: 1.8 });
    }
  }
  return { trimStartSeconds: 0, inputModel: "Playwright wheel delivery to native document scroll" };
}

async function captureRecordings(browser, engine, options, output, tools) {
  const records = [];
  const rawRoot = path.join(output, ".capture-work");
  await mkdir(rawRoot, { recursive: true });
  try {
    for (const specification of recordingSpecifications(engine)) {
      if (engine === "webkit") {
        records.push({
          ...specification,
          relativePath: null,
          status: "LIMITATION",
          failures: [],
          limitations: ["WebKit is proxy validation authority only; Phase 7B human-review recordings are required from Chromium and Firefox."],
        });
        continue;
      }
      if (specification.nativeZoomAuthority) {
        records.push({
          ...specification,
          relativePath: null,
          status: "LIMITATION",
          failures: [],
          limitations: [engine === "chromium"
            ? "This harness does not emulate native browser 200% zoom; bind separately captured visible installed-Chrome 200% evidence."
            : "Installed-Chrome 200% is not applicable to this engine."],
        });
        continue;
      }
      const rawDirectory = path.join(rawRoot, `${engine}-${specification.scenario}`);
      await mkdir(rawDirectory, { recursive: true });
      const contextOptions = {
        viewport: RECORDING_VIEWPORT,
        recordVideo: { dir: rawDirectory, size: RECORDING_VIEWPORT },
        ...(specification.scenario === "reduced-motion-resolved-states" ? { reducedMotion: "reduce" } : {}),
        ...(specification.scenario === "no-javascript-semantic-method" ? { javaScriptEnabled: false } : {}),
      };
      const context = await browser.newContext(contextOptions);
      if (contextOptions.javaScriptEnabled !== false) await addInstrumentation(context);
      const page = await context.newPage();
      page.setDefaultTimeout(options.timeoutMs);
      const video = page.video();
      let action = null;
      try {
        action = await scenarioAction(page, specification.scenario, options);
      } finally {
        await page.close();
        await context.close();
      }
      invariant(video, `${specification.scenario} did not create a browser recording`);
      const raw = path.join(rawDirectory, "capture.webm");
      await video.saveAs(raw);
      const destination = path.join(output, ...specification.relativePath.split("/"));
      const media = await normalizeVideo(tools, raw, destination, { trimStartSeconds: action?.trimStartSeconds ?? 0 });
      records.push({ ...specification, inputModel: action?.inputModel ?? "native document scroll", media, status: "PASS", failures: [], limitations: [] });
    }
  } finally {
    await rm(rawRoot, { recursive: true, force: true });
  }
  const checks = {
    completeInventory: records.length === PHASE7B_RECORDING_SCENARIOS.length,
    noRecordingFailures: records.every(({ status }) => status !== "FAIL"),
    decodedMedia: engine === "webkit" || records.filter(({ nativeZoomAuthority }) => !nativeZoomAuthority).every(({ media }) => media?.decodeStatus === "PASS"),
  };
  return { recordings: records, ...honestStatus(checks, records.flatMap(({ limitations }) => limitations)), checks };
}

async function runEngine(engine, options, output, tools) {
  const authority = await browserAuthority(engine, options);
  const browser = await authority.browserType.launch({ executablePath: authority.executablePath, headless: !options.headed });
  try {
    const identity = {
      engine,
      executable: path.basename(authority.executablePath),
      version: browser.version(),
      evidenceClass: authority.evidenceClass,
      statement: authority.statement,
    };
    const responsive = await responsiveMatrix(browser, engine, options, output);
    const visualRegression = await phase7aVisualRegression(browser, engine, options, output);
    const projection = await projectionIntegrity(browser, options);
    const fallback = await fallbackMatrix(browser, engine, options, output);
    const accessibility = await axeMatrix(browser, options);
    const regression = await phase7aRegression(browser, options);
    const history = await historyCase(browser, options);
    const lifecycle = await lifecycleCase(browser, options);
    const network = await networkCase(browser, options);
    const recordings = await captureRecordings(browser, engine, options, output, tools);
    const sections = { responsive, visualRegression, projection, fallback, accessibility, regression, history, lifecycle, network, recordings };
    const checks = Object.fromEntries(Object.entries(sections).map(([name, section]) => [name, section.status !== "FAIL"]));
    const limitations = Object.values(sections).flatMap((section) => section.limitations ?? []);
    return { identity, ...sections, ...honestStatus(checks, limitations), checks };
  } finally {
    await browser.close();
  }
}

async function listEvidence(root, current = root) {
  const entries = [];
  const children = await readdir(current, { withFileTypes: true });
  children.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  for (const child of children) {
    const absolute = path.join(current, child.name);
    const relativePath = safeRelativePath(path.relative(root, absolute).split(path.sep).join("/"));
    const info = await lstat(absolute);
    invariant(!info.isSymbolicLink(), `evidence may not contain a symlink: ${relativePath}`);
    if (child.isDirectory()) entries.push(...await listEvidence(root, absolute));
    else if (child.isFile()) entries.push({ relativePath, bytes: info.size, sha256: await sha256File(absolute) });
    else throw new Error(`unsupported evidence entry: ${relativePath}`);
  }
  return entries;
}

export function validatePortableReport(report) {
  invariant(report?.schema === SCHEMA, "Phase 7B browser report schema differs");
  invariant(report.branch === PHASE7B_BRANCH && HASH_40.test(report.revision ?? ""), "Phase 7B browser report authority differs");
  invariant(Array.isArray(report.results) && report.results.length > 0, "Phase 7B browser report has no engine results");
  for (const result of report.results) {
    invariant(["chromium", "firefox", "webkit"].includes(result.identity?.engine), "browser identity differs");
    invariant(EVIDENCE_STATUSES.includes(result.status), "engine status differs");
    invariant(result.responsive?.cases?.length === CORE_VIEWPORTS.length, "engine lacks the exact 13 responsive cases");
    invariant(result.visualRegression?.baselineAuthority?.revision === PHASE7B_PARENT && result.visualRegression?.cases?.length === VISUAL_REGRESSION_STATES.length, "engine accepted-Phase7A visual regression inventory differs");
    invariant(JSON.stringify(result.visualRegression.cases.map(({ id }) => id)) === JSON.stringify(VISUAL_REGRESSION_STATES.map(({ id }) => id)), "engine accepted-Phase7A visual regression state order differs");
    invariant(EVIDENCE_STATUSES.includes(result.visualRegression.status), "engine accepted-Phase7A visual regression status differs");
    for (const visualCase of result.visualRegression.cases) {
      invariant(visualCase.baseline?.revision === PHASE7B_PARENT && visualCase.current?.revision === report.revision, `engine visual regression ${visualCase.id} revision binding differs`);
      invariant(HASH_64.test(visualCase.baseline?.sourcePngSha256 ?? "") && HASH_64.test(visualCase.current?.sourcePngSha256 ?? "") && HASH_64.test(visualCase.baseline?.normalizedSha256 ?? "") && HASH_64.test(visualCase.current?.normalizedSha256 ?? ""), `engine visual regression ${visualCase.id} hash binding differs`);
      invariant(visualCase.baseline?.sourcePngBytes > 0 && visualCase.current?.sourcePngBytes > 0, `engine visual regression ${visualCase.id} source PNG byte binding differs`);
      invariant(visualCase.baseline?.semantic?.innerHeight === 900 && visualCase.current?.semantic?.innerHeight === 900 && visualCase.comparisonRegion?.width > 0 && visualCase.comparisonRegion.width <= 1440 && visualCase.comparisonRegion?.height > 0 && visualCase.comparisonRegion.height <= 900, `engine visual regression ${visualCase.id} matched 1440x900 authority differs`);
      invariant(Array.isArray(visualCase.retainedMedia), `engine visual regression ${visualCase.id} retained-media inventory differs`);
      if (result.visualRegression.retainedPngs) invariant(visualCase.retainedMedia.length === 2 && visualCase.retainedMedia.every(({ relativePath }) => safeRelativePath(relativePath).startsWith(`visual-regression/${result.identity.engine}/`)), `engine visual regression ${visualCase.id} selected PNG inventory differs`);
      else invariant(visualCase.retainedMedia.length === 0, `engine visual regression ${visualCase.id} retained redundant baseline media by default`);
      if (visualCase.status === "PASS") {
        invariant(visualCase.checks?.semanticMatch === true && visualCase.checks?.explainedPixels === true, `engine visual regression ${visualCase.id} is a false PASS`);
        invariant(["EXACT", "BOUNDED_RENDERING_NOISE"].includes(visualCase.classification) && typeof visualCase.explanation === "string", `engine visual regression ${visualCase.id} has no governed PASS explanation`);
        if (visualCase.classification === "EXACT") invariant(visualCase.metrics?.exact === true && visualCase.metrics?.differingPixels === 0 && visualCase.baseline.normalizedSha256 === visualCase.current.normalizedSha256, `engine visual regression ${visualCase.id} exact pixels are not hash-identical`);
        else invariant(visualCase.metrics?.exact === false && visualCase.metrics?.changedFraction <= 0.00025 && visualCase.metrics?.meanAbsoluteChannelDelta <= 0.001 && visualCase.metrics?.maximumChannelDelta <= 4, `engine visual regression ${visualCase.id} exceeds the bounded raster-noise envelope`);
      } else {
        invariant(visualCase.status === "FAIL" && Object.values(visualCase.checks ?? {}).some((value) => value === false), `engine visual regression ${visualCase.id} does not fail closed`);
        if (visualCase.classification === "UNEXPLAINED_DIFFERENCE") invariant(visualCase.checks?.explainedPixels === false && visualCase.explanation === null, `engine visual regression ${visualCase.id} unexplained difference is overstated`);
      }
    }
    invariant(result.recordings?.recordings?.length === PHASE7B_RECORDING_SCENARIOS.length, "engine recording inventory differs");
    const specifications = recordingSpecifications(result.identity.engine);
    for (let index = 0; index < specifications.length; index += 1) {
      const authority = specifications[index];
      const record = result.recordings.recordings[index];
      invariant(record?.scenario === authority.scenario, "engine recording scenario order differs");
      if (authority.captureMedia) {
        invariant(record.status === "PASS" && record.relativePath === authority.relativePath && record.media?.decodeStatus === "PASS", `${authority.engine} ${authority.scenario} recording media is missing or a false PASS`);
      } else {
        invariant(record.status === "LIMITATION" && record.relativePath === null && !record.media, `${authority.engine} ${authority.scenario} must remain an unrecorded limitation`);
      }
    }
    invariant(result.lifecycle?.cycles?.length === PHASE7B_CYCLE_COUNT, "engine lifecycle cycle count differs");
    if (result.status === "PASS") invariant(Object.values(result.checks).every(Boolean), "engine is a false PASS");
    if (result.identity.engine === "webkit") invariant(result.identity.evidenceClass === "playwright-webkit-proxy" && /not physical Safari/i.test(result.identity.statement), "WebKit proxy is overstated");
  }
  invariant(Object.keys(report.humanGates ?? {}).length === PHASE7B_GATES.length && Object.values(report.humanGates).every((status) => status === "PENDING HUMAN REVIEW"), "Phase 7B human gates must remain pending");
  portableJson(report);
  return true;
}

export function selfTest() {
  invariant(CORE_VIEWPORTS.length === 13, "Phase 7B QA requires 13 core viewports");
  invariant(MACRO_SAMPLES.length === 7, "Phase 7B QA requires seven macro-state samples");
  invariant(PHASE7B_METHOD_STAGES.length === 5, "Phase 7B QA requires five semantic stages");
  invariant(PHASE7B_RECORDING_SCENARIOS.length === 10, "Phase 7B QA requires ten recording scenarios");
  invariant(PHASE7B_ENGINES.join(",") === "chromium,firefox,webkit-proxy", "Phase 7B engine contract differs");
  invariant(PHASE7B_CYCLE_COUNT === 10, "Phase 7B lifecycle requires ten cycles");
  invariant(PHASE7B_GATES.length === 6, "Phase 7B has six human gates");
  invariant(VISUAL_REGRESSION_STATES.length === 4, "Phase 7B QA requires four accepted-Phase7A frozen visual states");
  return {
    schema: SCHEMA,
    status: "PASS",
    coreViewports: CORE_VIEWPORTS.length,
    macroStates: MACRO_SAMPLES.length,
    semanticStages: PHASE7B_METHOD_STAGES.length,
    recordingScenarios: PHASE7B_RECORDING_SCENARIOS.length,
    ordinaryRecordingMedia: 18,
    webkitRecordingMedia: 0,
    installedChromeNative200Media: "separate authority",
    frozenPhase7aVisualStates: VISUAL_REGRESSION_STATES.length,
    phase7aBaselineRevision: PHASE7B_PARENT,
    cyclesPerEngine: PHASE7B_CYCLE_COUNT,
    engines: ["installed Chromium", "Firefox", "Playwright WebKit proxy"],
    nativeZoomPolicy: "separate visible installed-Chrome browser-native evidence; never emulated by this harness",
  };
}

async function assertFreshOutput(output) {
  invariant(!await stat(output).then(() => true).catch(() => false), "refusing to overwrite an existing evidence directory");
  const parent = await realpath(path.dirname(output));
  invariant(!within(ROOT, parent) && !within(os.tmpdir(), parent), "evidence parent must remain external and non-temporary");
  await mkdir(output, { recursive: false });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/qa-phase7b-operating-field.mjs --base-url <url> --phase7a-baseline-url https://3b260649.qsite1.pages.dev/ --revision <exact-final-head> --output <fresh-external-directory> [--engine all|chromium|firefox|webkit] [--chromium-executable <installed Chrome>] [--ffmpeg <command>] [--ffprobe <command>] [--headed] [--retain-visual-regression-pngs]\nThe accepted-Phase7A comparison keeps paired baseline/current rasters in memory by default and records their hashes and normalized difference metrics. The harness never simulates genuine installed-Chrome browser-native 200% zoom; bind that separate visible-browser evidence during package assembly.\n");
    return;
  }
  if (options.selfTest) {
    process.stdout.write(portableJson(selfTest()));
    return;
  }
  await assertFreshOutput(options.output);
  try {
    const repository = await repositoryAuthority(options.revision);
    const tools = await resolveMediaTools(options);
    const engines = options.engine === "all" ? ["chromium", "firefox", "webkit"] : [options.engine];
    const results = [];
    for (const engine of engines) results.push(await runEngine(engine, options, options.output, tools));
    const limitations = [
      "WebKit evidence is a Playwright proxy and is not physical Safari.",
      "Programmatic scroll samples product projection; they are not physical wheel, trackpad or touch evidence.",
      "Genuine installed-Chrome browser-native 200% zoom requires separate visible-browser evidence and is never emulated here.",
      ...results.flatMap((result) => result.limitations),
    ];
    const checks = { noEngineFailures: results.every(({ status }) => status !== "FAIL") };
    const report = {
      schema: SCHEMA,
      branch: PHASE7B_BRANCH,
      revision: options.revision,
      captureOrigin: "CAPTURE_ORIGIN",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      repository,
      results,
      limitations,
      humanGates: Object.fromEntries(PHASE7B_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"])),
      ...honestStatus(checks, limitations),
      checks,
    };
    validatePortableReport(report);
    await writeFile(path.join(options.output, REPORT_PATH), portableJson(report), { encoding: "utf8", flag: "wx" });
    const entries = await listEvidence(options.output);
    const manifest = {
      schema: MANIFEST_SCHEMA,
      status: "PASS",
      entryCount: entries.length,
      totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      entries,
      duplicatePaths: false,
      traversalPaths: false,
      nestedArchives: false,
      sourceArchives: false,
      privatePaths: false,
    };
    await writeFile(path.join(options.output, MANIFEST_PATH), portableJson(manifest), { encoding: "utf8", flag: "wx" });
    process.stdout.write(portableJson({ status: report.status, output: path.basename(options.output), engines: results.map(({ identity, status }) => ({ engine: identity.engine, status })) }));
    if (report.status === "FAIL") process.exitCode = 1;
  } catch (error) {
    await rm(options.output, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`Phase 7B browser QA FAIL: ${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
