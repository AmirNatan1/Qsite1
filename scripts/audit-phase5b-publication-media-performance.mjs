import { execFile } from "node:child_process";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import { chromium } from "playwright-core";

import { PHASE5B_ROUTES } from "./phase5b-route-contract.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HASH40 = /^[0-9a-f]{40}$/;
const MEDIA_PATH = /\.(?:avif|gif|jpe?g|png|svg|webp|mp4|webm)(?:$|[?#])/i;
const VIDEO_PATH = /\.(?:mp4|webm)(?:$|[?#])/i;
const PHASE4_CINEMATIC = /\/media\/cinematic\/|phase-4r?2|phase-3-(?:desktop|mobile|dormant)/i;
const BASE_LAYOUT_CSS = /\/_astro\/BaseLayout\.[^/]+\.css(?:$|[?#])/;

export const SCHEMA = "quantum-hub.phase-5b.publication-media-performance.v1";
export const LONG_TASK_LIMIT_MS = 50;
export const OVERFLOW_TOLERANCE_PX = 1.5;
export const QUIET_RAF_TOLERANCE = 2;
export const AUDIT_VIEWPORT = Object.freeze({ id: "desktop-1440x900", width: 1440, height: 900 });
export const ROUTES = Object.freeze(PHASE5B_ROUTES.map((route) => Object.freeze({
  id: route.id,
  media: route.media,
  mode: route.mode,
  path: route.path,
})));
export const SHARED_MEDIA_PATHS = Object.freeze([
  "/brand/quantum-full-logo-white.svg",
  "/brand/quantum-icon-color.svg",
]);
export const GOVERNED_MARADIN_STILLS = Object.freeze([
  "/media/maradin/maradin-field-aperture-poster-approved.jpg",
  "/media/maradin/maradin-prove-field-frame-approved.jpg",
  "/media/maradin/maradin-real-field-still-approved.jpg",
]);
export const GOVERNED_MARADIN_VIDEOS = Object.freeze([
  "/media/maradin/maradin-field-aperture-approved.mp4",
  "/media/maradin/maradin-test-contact-approved.mp4",
]);
export const GOVERNED_MARADIN_MEDIA = Object.freeze([...GOVERNED_MARADIN_STILLS, ...GOVERNED_MARADIN_VIDEOS]);
export const PROOF_POSTER = GOVERNED_MARADIN_STILLS[0];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function byteLength(value) {
  return Buffer.byteLength(value ?? "", "utf8");
}

function gzipLength(value) {
  if (!value) return 0;
  return gzipSync(Buffer.from(value, "utf8"), { level: 9, mtime: 0 }).length;
}

function pathnameOf(value) {
  try { return new URL(value, "http://phase5b.invalid/").pathname; } catch { return value.split(/[?#]/)[0]; }
}

function routeUrl(baseUrl, route) {
  return new URL(route.path.replace(/^\//, ""), baseUrl).toString();
}

function expectedStatus(route) {
  return route.id === "404" ? 404 : 200;
}

function externalPath(filePath) {
  const resolved = path.resolve(filePath);
  const relativeToRoot = path.relative(ROOT, resolved);
  assert(relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot), "output must remain external and untracked");
  const relativeToTemp = path.relative(path.resolve(os.tmpdir()), resolved);
  assert(relativeToTemp.startsWith("..") && !path.isAbsolute(relativeToTemp), "output must not use OS temporary storage");
  return resolved;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4338/",
    browser: "",
    expectedHead: "",
    output: "",
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => argv[++index] ?? "";
    if (argument === "--base-url") options.baseUrl = next();
    else if (argument === "--browser") options.browser = next();
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  options.baseUrl = new URL(options.baseUrl).toString();
  if (options.expectedHead && !HASH40.test(options.expectedHead)) throw new Error("--expected-head must be a full 40-character Git SHA");
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) throw new Error("--timeout-ms must be between 5000 and 120000");
  if (options.output) options.output = externalPath(options.output);
  return options;
}

export function validateRuntimeOptions(options) {
  assert(HASH40.test(options.expectedHead ?? ""), "--expected-head is required and must be a full 40-character Git SHA");
  assert(options.output, "--output is required");
  externalPath(options.output);
  return true;
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function resolveBrowser(explicitPath) {
  const candidates = [];
  if (explicitPath) candidates.push(path.resolve(explicitPath));
  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    candidates.push("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium");
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of unique(candidates)) if (await exists(candidate)) return candidate;
  throw new Error("Chrome/Chromium not found; pass --browser PATH");
}

async function gitValue(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, windowsHide: true });
  return stdout.trim();
}

async function writeFreshExternal(filePath, contents) {
  const resolved = externalPath(filePath);
  assert(!(await exists(resolved)), `refusing to overwrite existing evidence: ${resolved}`);
  await mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp-${process.pid}`;
  await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
  await rename(temporary, resolved);
}

function inlineBlocks(html, tag) {
  const withNoSource = tag === "script" ? "(?![^>]*\\bsrc=)" : "";
  return [...html.matchAll(new RegExp(`<${tag}\\b${withNoSource}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((match) => match[1]);
}

function payloadGroup(sources) {
  const populated = sources.filter(({ text }) => typeof text === "string");
  return {
    assets: populated.map(({ id, text }) => ({ id, gzipBytes: gzipLength(text), rawBytes: byteLength(text) })),
    gzipBytes: populated.reduce((sum, { text }) => sum + gzipLength(text), 0),
    rawBytes: populated.reduce((sum, { text }) => sum + byteLength(text), 0),
  };
}

export function summarizeCodePayloads(records, documentHtml, route) {
  const byUrl = new Map();
  for (const record of records) {
    if (!record.bodyText || !["script", "stylesheet"].includes(record.resourceType)) continue;
    byUrl.set(record.url, record);
  }
  const externalCss = [...byUrl.values()].filter(({ resourceType }) => resourceType === "stylesheet").map((record) => ({ id: record.url, text: record.bodyText }));
  const externalJs = [...byUrl.values()].filter(({ resourceType }) => resourceType === "script").map((record) => ({ id: record.url, text: record.bodyText }));
  const inlineCss = inlineBlocks(documentHtml, "style").map((text, index) => ({ id: `inline:style:${index + 1}`, text }));
  const inlineJs = inlineBlocks(documentHtml, "script").map((text, index) => ({ id: `inline:script:${index + 1}`, text }));
  const routeCss = route.mode === "A"
    ? inlineCss
    : externalCss.filter(({ id }) => !BASE_LAYOUT_CSS.test(id));
  const routeJs = externalJs;
  const routeJavaScript = routeJs.map(({ text }) => text).join("\n");
  return {
    css: {
      pageSurface: payloadGroup([...externalCss, ...inlineCss]),
      routeAttributable: payloadGroup(routeCss),
      sharedExternal: payloadGroup(externalCss.filter(({ id }) => BASE_LAYOUT_CSS.test(id))),
    },
    javascript: {
      indicators: {
        boundingClientRectReferences: (routeJavaScript.match(/getBoundingClientRect/g) ?? []).length,
        offsetHeightReferences: (routeJavaScript.match(/offsetHeight/g) ?? []).length,
        requestAnimationFrameReferences: (routeJavaScript.match(/requestAnimationFrame/g) ?? []).length,
        resizeObserverReferences: (routeJavaScript.match(/ResizeObserver/g) ?? []).length,
        setIntervalReferences: (routeJavaScript.match(/setInterval/g) ?? []).length,
      },
      pageSurface: payloadGroup([...externalJs, ...inlineJs]),
      routeAttributable: payloadGroup(routeJs),
      sharedInline: payloadGroup(inlineJs),
    },
  };
}

function installPerformanceAudit() {
  const state = {
    activeIntervals: new Set(),
    activeRaf: new Set(),
    layoutShiftSupported: false,
    layoutShifts: [],
    listeners: { resize: 0, scroll: 0, wheel: 0 },
    longTaskSupported: false,
    longTasks: [],
    phase: "bootstrap",
    raf: { callbacks: 0, cancelled: 0, requested: 0 },
  };
  const selector = (node) => {
    if (!(node instanceof Element)) return null;
    if (node.id) return `#${node.id}`;
    const classes = [...node.classList].slice(0, 2).join(".");
    return `${node.localName}${classes ? `.${classes}` : ""}`;
  };
  const originalRaf = window.requestAnimationFrame.bind(window);
  const originalCancelRaf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    state.raf.requested += 1;
    let handle = 0;
    handle = originalRaf((timestamp) => {
      state.activeRaf.delete(handle);
      state.raf.callbacks += 1;
      callback(timestamp);
    });
    state.activeRaf.add(handle);
    return handle;
  };
  window.cancelAnimationFrame = (handle) => {
    state.activeRaf.delete(handle);
    state.raf.cancelled += 1;
    originalCancelRaf(handle);
  };
  const originalSetInterval = window.setInterval.bind(window);
  const originalClearInterval = window.clearInterval.bind(window);
  window.setInterval = (handler, timeout, ...args) => {
    const handle = originalSetInterval(handler, timeout, ...args);
    state.activeIntervals.add(handle);
    return handle;
  };
  window.clearInterval = (handle) => {
    state.activeIntervals.delete(handle);
    originalClearInterval(handle);
  };
  const originalWindowAdd = window.addEventListener.bind(window);
  window.addEventListener = (type, listener, options) => {
    if (Object.hasOwn(state.listeners, type)) state.listeners[type] += 1;
    return originalWindowAdd(type, listener, options);
  };
  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.longTasks.push({
        attribution: (entry.attribution ?? []).map((item) => ({
          containerId: item.containerId || null,
          containerName: item.containerName || null,
          containerSrc: item.containerSrc || null,
          containerType: item.containerType || null,
        })),
        duration: entry.duration,
        name: entry.name,
        phase: state.phase,
        startTime: entry.startTime,
      });
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
    state.longTaskSupported = true;
  } catch {}
  try {
    const layoutShiftObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.layoutShifts.push({
        hadRecentInput: entry.hadRecentInput,
        phase: state.phase,
        sources: (entry.sources ?? []).map((source) => selector(source.node)).filter(Boolean),
        startTime: entry.startTime,
        value: entry.value,
      });
    });
    layoutShiftObserver.observe({ type: "layout-shift", buffered: true });
    state.layoutShiftSupported = true;
  } catch {}
  state.resetEntries = () => {
    state.layoutShifts = [];
    state.longTasks = [];
  };
  state.snapshot = () => ({
    activeIntervals: state.activeIntervals.size,
    layoutShiftSupported: state.layoutShiftSupported,
    layoutShifts: state.layoutShifts.map((entry) => ({ ...entry })),
    listeners: { ...state.listeners },
    longTaskSupported: state.longTaskSupported,
    longTasks: state.longTasks.map((entry) => ({ ...entry })),
    phase: state.phase,
    raf: { ...state.raf, pending: state.activeRaf.size },
  });
  window.__quantumPhase5BPerformanceAudit = state;
}

function startNetworkLedger(page) {
  const records = [];
  const byRequest = new Map();
  const pending = new Set();
  let phase = "navigation";
  const diagnostics = { consoleErrors: [], consoleWarnings: [], pageErrors: [], requestFailures: [] };
  const track = (promise) => {
    pending.add(promise);
    promise.finally(() => pending.delete(promise));
  };
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
    if (message.type() === "warning") diagnostics.consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("request", (request) => {
    const record = {
      bodyText: null,
      failure: null,
      headers: {},
      method: request.method(),
      phase,
      resourceType: request.resourceType(),
      sizes: null,
      status: null,
      url: request.url(),
    };
    byRequest.set(request, record);
    records.push(record);
  });
  page.on("response", (response) => {
    const record = byRequest.get(response.request());
    if (!record) return;
    const task = (async () => {
      record.status = response.status();
      record.headers = typeof response.allHeaders === "function" ? await response.allHeaders() : await response.headers();
      if (["document", "script", "stylesheet"].includes(record.resourceType)) {
        try { record.bodyText = (await response.body()).toString("utf8"); } catch {}
      }
    })();
    track(task);
  });
  page.on("requestfinished", (request) => {
    const record = byRequest.get(request);
    if (!record || typeof request.sizes !== "function") return;
    const task = request.sizes().then((sizes) => { record.sizes = sizes; }).catch(() => undefined);
    track(task);
  });
  page.on("requestfailed", (request) => {
    const record = byRequest.get(request);
    const failure = request.failure()?.errorText ?? "unknown";
    if (record) record.failure = failure;
    diagnostics.requestFailures.push({ phase: record?.phase ?? phase, resourceType: request.resourceType(), url: request.url(), failure });
  });
  return {
    diagnostics,
    records,
    async flush() { await Promise.allSettled([...pending]); },
    setPhase(value) { phase = value; },
  };
}

function publicRequest(record) {
  const sizes = record.sizes;
  return {
    contentEncoding: record.headers["content-encoding"] ?? null,
    contentLength: record.headers["content-length"] ?? null,
    contentRange: record.headers["content-range"] ?? null,
    contentType: record.headers["content-type"] ?? null,
    failure: record.failure,
    method: record.method,
    path: pathnameOf(record.url),
    phase: record.phase,
    resourceType: record.resourceType,
    status: record.status,
    transferredBytes: sizes ? sizes.responseBodySize + sizes.responseHeadersSize : null,
    url: record.url,
  };
}

function summarizeNetwork(records, performanceEntries) {
  const requests = records.map(publicRequest);
  const measured = requests.filter(({ transferredBytes }) => Number.isFinite(transferredBytes));
  return {
    browserPerformanceTransferredBytes: performanceEntries.reduce((sum, entry) => sum + (Number(entry.transferSize) || 0), 0),
    failedRequests: requests.filter(({ failure }) => failure),
    measuredTransferRequests: measured.length,
    requestCount: requests.length,
    requests,
    transferredBytes: measured.reduce((sum, request) => sum + request.transferredBytes, 0),
  };
}

async function settle(page) {
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(80);
}

async function runtimeSnapshot(page) {
  return page.evaluate(() => window.__quantumPhase5BPerformanceAudit?.snapshot?.() ?? null);
}

async function setRuntimePhase(page, phase, reset = false) {
  await page.evaluate(({ phase, reset }) => {
    const audit = window.__quantumPhase5BPerformanceAudit;
    if (!audit) return;
    audit.phase = phase;
    if (reset) audit.resetEntries();
  }, { phase, reset });
}

async function inspectDom(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-route-production]");
    const values = root ? [...root.querySelectorAll("*")].flatMap((element) => [...element.attributes].map((attribute) => attribute.value)) : [];
    const mediaReferences = [];
    for (const value of values) {
      for (const match of value.matchAll(/\/media\/[a-z0-9._~!$&'()*+,;=:@%\/-]+/gi)) mediaReferences.push(match[0]);
    }
    const videos = [...(root?.querySelectorAll("video") ?? [])].map((video) => ({
      activeDecoder: Boolean(video.currentSrc) && video.networkState !== HTMLMediaElement.NETWORK_EMPTY,
      currentSrc: video.currentSrc || null,
      dataSrc: video.getAttribute("data-src"),
      duration: Number.isFinite(video.duration) ? video.duration : null,
      height: video.videoHeight,
      id: video.id,
      networkState: video.networkState,
      paused: video.paused,
      poster: video.getAttribute("poster"),
      preload: video.getAttribute("preload"),
      readyState: video.readyState,
      srcAttribute: video.getAttribute("src"),
      width: video.videoWidth,
    }));
    const images = [...(root?.querySelectorAll("img") ?? [])].map((image) => ({
      complete: image.complete,
      height: image.naturalHeight,
      loading: image.getAttribute("loading"),
      src: image.getAttribute("src"),
      width: image.naturalWidth,
    }));
    const runningAnimations = document.getAnimations().filter((animation) => animation.playState === "running").map((animation) => {
      const timing = animation.effect?.getTiming?.() ?? {};
      return { duration: Number(timing.duration) || 0, iterations: timing.iterations === Infinity ? "Infinity" : Number(timing.iterations) || 0 };
    });
    return {
      activeDecoderCount: videos.filter(({ activeDecoder }) => activeDecoder).length,
      documentHeight: document.documentElement.scrollHeight,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
      images,
      mediaReferences: [...new Set(mediaReferences)].sort(),
      route: root?.getAttribute("data-route-production") ?? null,
      routeMediaElementCount: root?.querySelectorAll("img,picture,video,audio,source,canvas").length ?? 0,
      runningAnimations,
      scrollY,
      videos,
      viewport: { height: innerHeight, width: innerWidth },
    };
  });
}

async function performanceEntries(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation").map((entry) => ({
      decodedBodySize: entry.decodedBodySize,
      encodedBodySize: entry.encodedBodySize,
      initiatorType: "navigation",
      name: entry.name,
      transferSize: entry.transferSize,
    }));
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      decodedBodySize: entry.decodedBodySize,
      encodedBodySize: entry.encodedBodySize,
      initiatorType: entry.initiatorType,
      name: entry.name,
      transferSize: entry.transferSize,
    }));
    return [...navigation, ...resources];
  });
}

async function nativeScrollJourney(page, ledger) {
  const initialDom = await inspectDom(page);
  const loadPerformance = await runtimeSnapshot(page);
  await setRuntimePhase(page, "scroll-forward", true);
  ledger.setPhase("scroll-forward");
  const maxScroll = Math.max(0, initialDom.documentHeight - initialDom.viewport.height);
  const delta = Math.max(160, Math.floor(initialDom.viewport.height * 0.72));
  const maximumSteps = Math.min(64, Math.max(2, Math.ceil(maxScroll / delta) + 4));
  const samples = [];
  let stagnant = 0;
  let previous = 0;
  for (let index = 0; index < maximumSteps; index += 1) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(55);
    const observation = await inspectDom(page);
    samples.push({ direction: "forward", horizontalOverflow: observation.horizontalOverflow, scrollY: observation.scrollY });
    if (observation.scrollY >= maxScroll - 1) break;
    stagnant = observation.scrollY <= previous + 0.5 ? stagnant + 1 : 0;
    if (stagnant >= 2) break;
    previous = observation.scrollY;
  }
  const forwardEnd = await inspectDom(page);
  await setRuntimePhase(page, "scroll-reverse");
  ledger.setPhase("scroll-reverse");
  stagnant = 0;
  previous = forwardEnd.scrollY;
  for (let index = 0; index < maximumSteps; index += 1) {
    await page.mouse.wheel(0, -delta);
    await page.waitForTimeout(55);
    const observation = await inspectDom(page);
    samples.push({ direction: "reverse", horizontalOverflow: observation.horizontalOverflow, scrollY: observation.scrollY });
    if (observation.scrollY <= 1) break;
    stagnant = observation.scrollY >= previous - 0.5 ? stagnant + 1 : 0;
    if (stagnant >= 2) break;
    previous = observation.scrollY;
  }
  const reverseEnd = await inspectDom(page);
  await setRuntimePhase(page, "quiet");
  ledger.setPhase("quiet");
  await page.waitForTimeout(300);
  const quietStart = await runtimeSnapshot(page);
  await page.waitForTimeout(600);
  const quietEnd = await runtimeSnapshot(page);
  const scrollPerformance = await runtimeSnapshot(page);
  const scrollLongTasks = (scrollPerformance?.longTasks ?? []).filter(({ phase }) => phase === "scroll-forward" || phase === "scroll-reverse");
  const cls = (entries) => entries.filter(({ hadRecentInput }) => !hadRecentInput).reduce((sum, entry) => sum + entry.value, 0);
  return {
    cls: {
      load: cls(loadPerformance?.layoutShifts ?? []),
      scroll: cls(scrollPerformance?.layoutShifts ?? []),
      scrollEntries: scrollPerformance?.layoutShifts ?? [],
    },
    continuousMeasurement: {
      activeIntervalsAfterQuiet: quietEnd?.activeIntervals ?? null,
      listeners: quietEnd?.listeners ?? null,
      persistentRafCount: Math.max(0, (quietEnd?.raf.callbacks ?? 0) - (quietStart?.raf.callbacks ?? 0)),
      quietRafPending: quietEnd?.raf.pending ?? null,
      quietRafRequested: Math.max(0, (quietEnd?.raf.requested ?? 0) - (quietStart?.raf.requested ?? 0)),
      runningAnimations: reverseEnd.runningAnimations,
    },
    coverage: {
      layoutShiftObserver: Boolean(scrollPerformance?.layoutShiftSupported),
      longTaskObserver: Boolean(scrollPerformance?.longTaskSupported),
    },
    forwardEnd: forwardEnd.scrollY,
    horizontalOverflow: Math.max(initialDom.horizontalOverflow, forwardEnd.horizontalOverflow, reverseEnd.horizontalOverflow, ...samples.map((sample) => sample.horizontalOverflow)),
    initialDom,
    longTasks: scrollLongTasks,
    maxLongTaskMs: Math.max(0, ...scrollLongTasks.map(({ duration }) => duration)),
    maxScroll,
    reverseEnd: reverseEnd.scrollY,
    samples,
  };
}

async function initiateMaradinMedia(page, ledger, timeoutMs) {
  const trigger = page.locator("[data-maradin-video-trigger]");
  const count = await trigger.count();
  const steps = [];
  for (let index = 0; index < count; index += 1) {
    const phase = `media-init-${index + 1}`;
    ledger.setPhase(phase);
    await setRuntimePhase(page, phase);
    await trigger.nth(index).click();
    let metadataLoaded = true;
    try {
      await page.waitForFunction((videoIndex) => document.querySelectorAll("[data-maradin-video]")[videoIndex]?.readyState >= 1, index, { timeout: Math.min(timeoutMs, 12_000) });
    } catch { metadataLoaded = false; }
    await page.waitForTimeout(120);
    const state = await inspectDom(page);
    steps.push({ index, metadataLoaded, state });
    await page.locator("[data-maradin-video]").nth(index).evaluate((video) => video.pause());
  }
  ledger.setPhase("post-media-init");
  await setRuntimePhase(page, "post-media-init");
  await page.waitForTimeout(120);
  return { triggerCount: count, steps, final: await inspectDom(page) };
}

function isMediaRequest(request) {
  return request.resourceType === "media" || request.resourceType === "image" || MEDIA_PATH.test(request.url);
}

function governedRequestPaths(requests) {
  return unique(requests.filter(isMediaRequest).map(({ path, url }) => path || pathnameOf(url)).filter((value) => !SHARED_MEDIA_PATHS.includes(value)));
}

export function mediaPolicyFailures(record) {
  const failures = [];
  const add = (code, actual = null) => failures.push({ code, actual });
  const requests = record.network?.requests ?? [];
  const mediaRequests = requests.filter(isMediaRequest);
  const phase4 = requests.filter(({ url, path: requestPath }) => PHASE4_CINEMATIC.test(url) || PHASE4_CINEMATIC.test(requestPath ?? ""));
  if (phase4.length) add("phase4-cinematic-request", phase4);
  const normalRequests = mediaRequests.filter(({ phase }) => !/^media-init-/.test(phase) && phase !== "post-media-init");
  const normalPaths = governedRequestPaths(normalRequests);
  const allPaths = governedRequestPaths(mediaRequests);
  const normalVideos = normalRequests.filter(({ url, path: requestPath, resourceType }) => resourceType === "media" || VIDEO_PATH.test(requestPath ?? url));
  if (record.route.media === "none") {
    if (allPaths.length) add("unexpected-route-media", allPaths);
    if (record.media.initial.routeMediaElementCount !== 0) add("unexpected-media-element", record.media.initial);
  } else if (record.route.media === "governed-poster") {
    if (JSON.stringify(allPaths) !== JSON.stringify([PROOF_POSTER])) add("proof-media-inventory", allPaths);
    if (JSON.stringify(record.media.initial.mediaReferences) !== JSON.stringify([PROOF_POSTER])) add("proof-dom-media-inventory", record.media.initial.mediaReferences);
    if (record.media.initial.images.length !== 1 || record.media.initial.videos.length !== 0) add("proof-media-elements", record.media.initial);
  } else if (record.route.media === "governed-documentary") {
    if (normalVideos.length) add("maradin-video-before-initiation", normalVideos);
    if (JSON.stringify(normalPaths) !== JSON.stringify([...GOVERNED_MARADIN_STILLS].sort())) add("maradin-preinit-still-inventory", normalPaths);
    if (JSON.stringify(allPaths) !== JSON.stringify([...GOVERNED_MARADIN_MEDIA].sort())) add("maradin-total-media-inventory", allPaths);
    if (JSON.stringify(record.media.initial.mediaReferences) !== JSON.stringify([...GOVERNED_MARADIN_MEDIA].sort())) add("maradin-dom-media-inventory", record.media.initial.mediaReferences);
    if (record.media.initial.images.length !== 2 || record.media.initial.images.some(({ loading }) => loading !== "lazy")) add("maradin-stills-not-lazy", record.media.initial.images);
    if (record.media.initial.videos.length !== 2 || record.media.initial.videos.some((video) => video.preload !== "none" || video.srcAttribute !== null || video.currentSrc !== null || video.readyState !== 0 || video.activeDecoder)) add("maradin-preinit-video-state", record.media.initial.videos);
    if (record.media.initial.activeDecoderCount !== 0) add("maradin-preinit-decoder", record.media.initial.activeDecoderCount);
    if (record.media.initiation?.triggerCount !== 2 || record.media.initiation.steps.length !== 2) add("maradin-initiation-controls", record.media.initiation);
    if (record.media.initiation?.steps.some(({ metadataLoaded }) => !metadataLoaded)) add("maradin-metadata-load", record.media.initiation.steps);
    if (record.media.initiation?.steps.some(({ state }) => state.activeDecoderCount !== 1)) add("maradin-decoder-count", record.media.initiation.steps);
    if (record.media.initiation?.final.activeDecoderCount !== 1) add("maradin-final-decoder-count", record.media.initiation?.final);
  }
  return failures;
}

export function performanceFailures(record) {
  const failures = [];
  const add = (code, actual = null) => failures.push({ code, actual });
  if (!record.performance.coverage.longTaskObserver) add("long-task-observer-unavailable");
  if (!record.performance.coverage.layoutShiftObserver) add("layout-shift-observer-unavailable");
  if (record.performance.maxLongTaskMs > LONG_TASK_LIMIT_MS) add("scroll-long-task", record.performance.longTasks);
  if (record.performance.horizontalOverflow > OVERFLOW_TOLERANCE_PX) add("horizontal-overflow", record.performance.horizontalOverflow);
  if (record.performance.maxScroll > 1 && record.performance.forwardEnd < record.performance.maxScroll - 2) add("forward-scroll-incomplete", { actual: record.performance.forwardEnd, expected: record.performance.maxScroll });
  if (record.performance.reverseEnd > 2) add("reverse-scroll-incomplete", record.performance.reverseEnd);
  const continuous = record.performance.continuousMeasurement;
  if (continuous.persistentRafCount > QUIET_RAF_TOLERANCE || continuous.quietRafRequested > QUIET_RAF_TOLERANCE || continuous.quietRafPending > 0) add("perpetual-raf", continuous);
  if (continuous.activeIntervalsAfterQuiet > 0) add("continuous-interval", continuous.activeIntervalsAfterQuiet);
  const expectedDecoders = record.route.media === "governed-documentary" ? 1 : 0;
  const observedDecoders = Math.max(record.media.initial.activeDecoderCount, record.media.afterScroll.activeDecoderCount, ...(record.media.initiation?.steps.map(({ state }) => state.activeDecoderCount) ?? []));
  if (observedDecoders > expectedDecoders) add("unexpected-media-decoder", { actual: observedDecoders, expected: expectedDecoders });
  return failures;
}

function diagnosticFailures(record) {
  const failures = [];
  const expected404 = record.route.id === "404";
  for (const error of record.diagnostics.consoleErrors) {
    if (!(expected404 && /status of 404/i.test(error))) failures.push({ code: "console-error", actual: error });
  }
  for (const error of record.diagnostics.pageErrors) failures.push({ code: "page-error", actual: error });
  for (const failure of record.diagnostics.requestFailures) {
    const expectedMediaRelease = record.route.id === "maradin" && /^media-init-/.test(failure.phase) && failure.resourceType === "media" && /abort|cancel/i.test(failure.failure);
    if (!expectedMediaRelease) failures.push({ code: "request-failure", actual: failure });
  }
  return failures;
}

async function auditRoute(browser, options, route) {
  const context = await browser.newContext({
    colorScheme: "dark",
    serviceWorkers: "block",
    viewport: { width: AUDIT_VIEWPORT.width, height: AUDIT_VIEWPORT.height },
  });
  await context.addInitScript(installPerformanceAudit);
  const page = await context.newPage();
  const ledger = startNetworkLedger(page);
  try {
    const response = await page.goto(routeUrl(options.baseUrl, route), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(page);
    await ledger.flush();
    const documentHtml = await page.content();
    const initial = await inspectDom(page);
    const performance = await nativeScrollJourney(page, ledger);
    await page.waitForTimeout(180);
    await ledger.flush();
    const afterScroll = await inspectDom(page);
    const preInitiationRequestCount = ledger.records.length;
    const initiation = route.id === "maradin" ? await initiateMaradinMedia(page, ledger, options.timeoutMs) : null;
    await ledger.flush();
    const entries = await performanceEntries(page);
    const network = summarizeNetwork(ledger.records, entries);
    const normalNetwork = summarizeNetwork(ledger.records.slice(0, preInitiationRequestCount), entries.filter(({ name }) => !GOVERNED_MARADIN_VIDEOS.includes(pathnameOf(name))));
    const code = summarizeCodePayloads(ledger.records, documentHtml, route);
    performance.continuousMeasurement.sourceIndicators = code.javascript.indicators;
    const record = {
      code,
      diagnostics: ledger.diagnostics,
      httpStatus: response?.status() ?? null,
      media: { afterScroll, initial, initiation },
      network,
      normalNetwork,
      performance,
      route,
      target: routeUrl(options.baseUrl, route),
    };
    const failures = [];
    if (record.httpStatus !== expectedStatus(route)) failures.push({ code: "http-status", actual: record.httpStatus, expected: expectedStatus(route) });
    if (initial.route !== route.id) failures.push({ code: "route-identity", actual: initial.route, expected: route.id });
    failures.push(...performanceFailures(record), ...mediaPolicyFailures(record), ...diagnosticFailures(record));
    if (!Number.isFinite(code.css.routeAttributable.rawBytes) || !Number.isFinite(code.javascript.routeAttributable.rawBytes)) failures.push({ code: "code-size-coverage" });
    return { ...record, failures, status: failures.length ? "FAIL" : "PASS" };
  } finally {
    await context.close();
  }
}

export function validateReport(report) {
  assert(report.schema === SCHEMA, "publication/media/performance schema differs");
  assert(report.routes.length === ROUTES.length, "audit must cover all nine routes");
  assert(unique(report.routes.map(({ route }) => route.id)).length === ROUTES.length, "route coverage is duplicated or incomplete");
  assert(report.routes.every(({ code }) => Number.isFinite(code.css.routeAttributable.rawBytes) && Number.isFinite(code.css.routeAttributable.gzipBytes)), "CSS measurements are incomplete");
  assert(report.routes.every(({ code }) => Number.isFinite(code.javascript.routeAttributable.rawBytes) && Number.isFinite(code.javascript.routeAttributable.gzipBytes)), "JavaScript measurements are incomplete");
  assert(report.routes.every(({ network }) => Number.isFinite(network.requestCount) && Number.isFinite(network.transferredBytes)), "network measurements are incomplete");
  assert(report.routes.every(({ performance }) => Number.isFinite(performance.maxLongTaskMs) && Number.isFinite(performance.cls.load) && Number.isFinite(performance.cls.scroll)), "performance measurements are incomplete");
  assert(report.failures.length === 0, `publication/media/performance failures remain: ${report.failures.length}`);
  assert(report.status === "PASS", "publication/media/performance status is not PASS");
  return true;
}

export async function runPhase5BPublicationMediaPerformance(options) {
  validateRuntimeOptions(options);
  const observedHead = (await gitValue(["rev-parse", "HEAD"])).toLowerCase();
  if (observedHead !== options.expectedHead) throw new Error(`HEAD mismatch: expected ${options.expectedHead}, observed ${observedHead}`);
  const branch = await gitValue(["branch", "--show-current"]);
  const executablePath = await resolveBrowser(options.browser);
  const browser = await chromium.launch({ headless: true, executablePath, args: ["--disable-extensions", "--disable-background-networking"] });
  try {
    const routes = [];
    for (const route of ROUTES) routes.push(await auditRoute(browser, options, route));
    const failures = routes.flatMap((record) => record.failures.map((failure) => ({ route: record.route.id, ...failure })));
    const report = {
      baseUrl: options.baseUrl,
      browser: { executable: path.basename(executablePath), version: browser.version() },
      failures,
      generatedAt: new Date().toISOString(),
      git: { branch, expectedHead: options.expectedHead, observedHead },
      routes,
      schema: SCHEMA,
      status: failures.length ? "FAIL" : "PASS",
      summary: {
        clsLoadMaximum: Math.max(...routes.map(({ performance }) => performance.cls.load)),
        clsScrollMaximum: Math.max(...routes.map(({ performance }) => performance.cls.scroll)),
        failures: failures.length,
        maximumScrollLongTaskMs: Math.max(...routes.map(({ performance }) => performance.maxLongTaskMs)),
        phase4CinematicRequests: routes.reduce((sum, record) => sum + record.network.requests.filter(({ url, path: requestPath }) => PHASE4_CINEMATIC.test(url) || PHASE4_CINEMATIC.test(requestPath ?? "")).length, 0),
        requestCount: routes.reduce((sum, record) => sum + record.network.requestCount, 0),
        routeCount: routes.length,
        transferredBytes: routes.reduce((sum, record) => sum + record.network.transferredBytes, 0),
      },
      viewport: AUDIT_VIEWPORT,
    };
    if (report.status === "PASS") validateReport(report);
    return report;
  } finally {
    await browser.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/audit-phase5b-publication-media-performance.mjs --base-url <preview-or-deployment> --expected-head <full-sha> --output <fresh-external-json> [--browser <path>] [--timeout-ms 30000]\n");
    return;
  }
  validateRuntimeOptions(options);
  const report = await runPhase5BPublicationMediaPerformance(options);
  await writeFreshExternal(options.output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: report.status, output: options.output, summary: report.summary }, null, 2)}\n`);
  if (report.status !== "PASS") throw new Error(`${report.failures.length} publication/media/performance failures remain; inspect the written report`);
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { console.error(`Phase 5B publication/media/performance audit failed: ${error.message}`); process.exitCode = 1; });
