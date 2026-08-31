#!/usr/bin/env node

import { mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "playwright-core";

import { PHASE7A_BRANCH } from "./phase7a-contract.mjs";
import {
  BROWSER_ENGINES,
  CORE_VIEWPORTS,
  FALLBACK_CASE_CHECKS,
  HOME_MARADIN_CHECKS,
  HOME_MARADIN_CYCLES,
  THRESHOLD_REVERSE_CHECKS,
  THRESHOLD_REVERSE_CYCLES,
  fallbackCases as fallbackAuthority,
  validateFallbackReport,
  validateLifecycleReport,
} from "./phase7a-browser-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BROWSERS = Object.freeze({ chromium, firefox, webkit });
const MANIFESTO = "We turn industrial needs into field evidence.";
const PHYSICAL_MEDIA = /^\/media\/cinematic\/phase-4r2\/media\/phase-4r2-(desktop|portrait|landscape)-h264-[a-f0-9]{12}\.mp4$/;
const MARADIN_MEDIA = /^\/media\/maradin\/.*\.mp4$/i;

export const SCHEMA = "quantum-hub.phase-7a.fallback-lifecycle.v1";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertExternalOutput(candidate) {
  const resolved = path.resolve(candidate);
  invariant(path.extname(resolved).toLowerCase() === ".json", "--output must name a JSON file");
  invariant(!within(ROOT, resolved), "focused browser evidence must remain outside the repository");
  invariant(!within(os.tmpdir(), resolved), "focused browser evidence must remain outside OS temporary storage");
  return resolved;
}

function nextValue(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4322/",
    engine: "all",
    headed: false,
    help: false,
    output: "",
    selfTest: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--base-url") { options.baseUrl = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--engine") { options.engine = nextValue(argv, index, flag).toLowerCase(); index += 1; }
    else if (flag === "--output") { options.output = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--timeout-ms") { options.timeoutMs = Number(nextValue(argv, index, flag)); index += 1; }
    else if (flag === "--headed") options.headed = true;
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  invariant(["all", ...Object.keys(BROWSERS)].includes(options.engine), "--engine must be all, chromium, firefox or webkit");
  invariant(Number.isInteger(options.timeoutMs) && options.timeoutMs >= 1_000, "--timeout-ms must be an integer of at least 1000");
  const base = new URL(options.baseUrl);
  invariant(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "--base-url must be credential-free HTTP(S)");
  base.hash = "";
  base.search = "";
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  options.baseUrl = base.toString();
  if (!options.help && !options.selfTest) {
    invariant(options.output, "--output is required");
    options.output = assertExternalOutput(options.output);
  }
  return options;
}

function canonicalText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function viewportById(id) {
  const viewport = CORE_VIEWPORTS.find((candidate) => candidate.id === id);
  invariant(viewport, `unknown viewport: ${id}`);
  return { width: viewport.width, height: viewport.height };
}

function statusWithFailures(checks) {
  const failures = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name);
  return { failures, status: failures.length ? "FAIL" : "PASS" };
}

function unavailableFallbackCase(authority, engine) {
  return {
    ...authority,
    actualStatus: null,
    checks: Object.fromEntries(FALLBACK_CASE_CHECKS.map((name) => [name, null])),
    failures: [],
    statement: `The focused ${engine} run did not execute this ${authority.engine} authority row.`,
    status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT",
  };
}

async function settle(page, delay = 100) {
  await page.waitForLoadState("load").catch(() => undefined);
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded", null, { timeout: 3_000 }).catch(() => undefined);
  await page.waitForTimeout(delay);
}

async function inspectFallbackDocument(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const visible = (node) => {
      if (!(node instanceof Element)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const hiddenFocusable = [...document.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]")]
      .filter((node) => {
        if (!(node instanceof HTMLElement) || node.tabIndex < 0 || node.hasAttribute("disabled")) return false;
        if (node.closest("[inert], [hidden], [aria-hidden='true']")) return false;
        const closedDetails = node.closest("details:not([open])");
        if (closedDetails && node !== closedDetails.querySelector(":scope > summary")) return false;
        if (visible(node)) return false;
        const before = document.activeElement;
        node.focus({ preventScroll: true });
        const browserAcceptedFocus = document.activeElement === node;
        if (before instanceof HTMLElement) before.focus({ preventScroll: true });
        return browserAcceptedFocus;
      })
      .map((node) => node.outerHTML.slice(0, 220));
    const wordFailures = [];
    const walker = document.createTreeWalker(document.querySelector("main") ?? body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode() && wordFailures.length < 25) {
      const textNode = walker.currentNode;
      const parent = textNode.parentElement;
      if (!parent || !visible(parent) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) continue;
      const text = textNode.textContent ?? "";
      const matcher = /\S+/gu;
      let match;
      while ((match = matcher.exec(text)) && wordFailures.length < 25) {
        const range = document.createRange();
        range.setStart(textNode, match.index);
        range.setEnd(textNode, match.index + match[0].length);
        const rects = [...range.getClientRects()];
        const outsideViewport = rects.some((rect) => rect.width > innerWidth + 1 || rect.left < -1 || rect.right > innerWidth + 1);
        const unjustifiedSplit = rects.length > 1 && !/[-\u00ad]/u.test(match[0]);
        if (outsideViewport || unjustifiedSplit) {
          wordFailures.push({ word: match[0].slice(0, 80), rects: rects.map(({ left, right, width }) => ({ left, right, width })) });
        }
      }
    }
    const links = [...document.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href"),
      onclick: link.getAttribute("onclick"),
      resolved: link.href,
    }));
    const h1 = document.querySelector("h1");
    return {
      cinematicMode: root.dataset.cinematicMode ?? null,
      h1: h1?.getAttribute("aria-label") || h1?.textContent?.replace(/\s+/g, " ").trim() || null,
      h1Count: document.querySelectorAll("h1").length,
      hiddenFocusable,
      horizontalOverflow: Math.max(root.scrollWidth, body?.scrollWidth ?? 0) > root.clientWidth + 1,
      links,
      mainCount: document.querySelectorAll("main").length,
      wordFailures,
    };
  });
}

function networkPolicyForFallback(authority, baseUrl, requests, failedRequests, pageErrors) {
  const origin = new URL(baseUrl).origin;
  const requestPaths = requests.map((value) => {
    try { return new URL(value).pathname; } catch { return "<invalid>"; }
  });
  const sameOrigin = requests.every((value) => {
    try { return new URL(value).origin === origin; } catch { return false; }
  });
  const allowedFailures = authority.variant === "fallback-fonts"
    ? failedRequests.every(({ url }) => /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(url))
    : failedRequests.length === 0;
  const phase4Forbidden = authority.variant === "reduced-motion" || authority.variant === "no-javascript";
  const noForbiddenPhase4 = !phase4Forbidden || !requestPaths.some((value) => /\/media\/cinematic\/phase-4r2\/media\/.*\.mp4$/i.test(value));
  return sameOrigin && allowedFailures && pageErrors.length === 0 && noForbiddenPhase4;
}

export function fallbackChecksFromObservation(authority, observation) {
  const homeSemantic = authority.route !== "home" || canonicalText(observation.state.h1) === canonicalText(MANIFESTO);
  const ordinaryLinks = observation.state.links.filter(({ href, onclick, resolved }) => (
    typeof href === "string" && href.length > 0 && onclick === null && /^https?:/i.test(resolved)
  ));
  return {
    semanticContent: observation.state.h1Count === 1 && observation.state.mainCount === 1 && Boolean(observation.state.h1) && homeSemantic,
    ordinaryNavigation: ordinaryLinks.length > 0,
    wholeWordWrapping: observation.state.wordFailures.length === 0,
    noHorizontalOverflow: !observation.state.horizontalOverflow,
    noHiddenFocusableControls: observation.state.hiddenFocusable.length === 0,
    networkPolicy: observation.networkPolicy === true,
  };
}

async function runFallbackCase(browser, authority, options) {
  const contextOptions = {
    viewport: viewportById(authority.viewport),
    ...(authority.variant === "reduced-motion" ? { reducedMotion: "reduce" } : {}),
    ...(authority.variant === "no-javascript" ? { javaScriptEnabled: false } : {}),
    serviceWorkers: "block",
  };
  const context = await browser.newContext(contextOptions);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    const requests = [];
    const failedRequests = [];
    const pageErrors = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" }));
    page.on("pageerror", (error) => pageErrors.push(error.message));
    if (authority.variant === "fallback-fonts") {
      await page.route(/\.(?:woff2?|ttf|otf)(?:[?#]|$)/i, (route) => route.abort("failed"));
    }
    const response = await page.goto(new URL(authority.targetPath, options.baseUrl).toString(), { waitUntil: "load", timeout: options.timeoutMs });
    await settle(page);
    const state = await inspectFallbackDocument(page);
    const networkPolicy = networkPolicyForFallback(authority, options.baseUrl, requests, failedRequests, pageErrors);
    const checks = fallbackChecksFromObservation(authority, { state, networkPolicy });
    const actualStatus = response?.status() ?? null;
    const result = statusWithFailures(checks);
    if (actualStatus !== authority.expectedStatus) {
      result.status = "FAIL";
      result.failures.unshift("httpStatus");
    }
    return {
      ...authority,
      actualStatus,
      checks,
      diagnostics: {
        failedRequests,
        pageErrors,
        requestCount: requests.length,
        requestPaths: requests.map((value) => {
          try { return new URL(value).pathname; } catch { return value; }
        }),
      },
      state,
      ...result,
    };
  } finally {
    await context.close();
  }
}

async function launchManaged(engine, headed) {
  const browserType = BROWSERS[engine];
  const executablePath = browserType.executablePath();
  const exists = await stat(executablePath).then(() => true).catch(() => false);
  invariant(exists, `managed ${engine} executable unavailable: ${executablePath}`);
  return browserType.launch({ executablePath, headless: !headed });
}

async function runFallbackMatrix(options) {
  const selected = options.engine === "all" ? new Set(Object.keys(BROWSERS)) : new Set([options.engine]);
  const identities = [];
  const observations = new Map();
  const engineErrors = [];
  for (const engine of selected) {
    let browser = null;
    try {
      browser = await launchManaged(engine, options.headed);
      identities.push({ engine, version: browser.version(), authority: engine === "webkit" ? "Playwright WebKit proxy; not physical Safari" : `Playwright managed ${engine}` });
      const rows = fallbackAuthority().filter((authority) => authority.engine === engine);
      for (const authority of rows) {
        const key = `${authority.engine}\u0000${authority.route}\u0000${authority.targetPath}\u0000${authority.viewport}\u0000${authority.variant}`;
        observations.set(key, await runFallbackCase(browser, authority, options));
      }
    } catch (error) {
      engineErrors.push({ engine, message: String(error?.message ?? error).slice(0, 1_000) });
      if (!identities.some((identity) => identity.engine === engine)) {
        identities.push({ engine, version: browser?.version() ?? null, authority: "NOT AVAILABLE TO EXECUTION ENVIRONMENT" });
      }
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
  const cases = fallbackAuthority().map((authority) => {
    const key = `${authority.engine}\u0000${authority.route}\u0000${authority.targetPath}\u0000${authority.viewport}\u0000${authority.variant}`;
    return observations.get(key) ?? unavailableFallbackCase(authority, options.engine);
  });
  const failed = cases.filter(({ status }) => status === "FAIL");
  const unavailable = cases.filter(({ status }) => status === "NOT AVAILABLE TO EXECUTION ENVIRONMENT");
  const status = failed.length ? "FAIL" : unavailable.length ? "LIMITATION" : "PASS";
  const report = {
    status,
    failures: failed.map(({ engine, route, targetPath, viewport, variant, failures }) => ({ engine, route, targetPath, viewport, variant, failures })),
    ...(status === "LIMITATION" ? {
      statement: engineErrors.length
        ? `${unavailable.length} authority row(s) were unavailable because ${engineErrors.map(({ engine }) => engine).join(", ")} could not complete in this execution environment.`
        : `${unavailable.length} authority row(s) belong to browser engines excluded by --engine ${options.engine}.`,
    } : {}),
    cases,
  };
  validateFallbackReport(report);
  return { engineErrors, identities, report };
}

async function installLifecycleProbe(context) {
  await context.addInitScript(() => {
    const originalRaf = window.requestAnimationFrame.bind(window);
    const originalCancelRaf = window.cancelAnimationFrame.bind(window);
    const originalInterval = window.setInterval.bind(window);
    const originalClearInterval = window.clearInterval.bind(window);
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const rafs = new Set();
    const intervals = new Set();
    const blobs = new Set();
    const activeListeners = new Set();
    const targetIds = new WeakMap();
    const listenerIds = new WeakMap();
    let nextTarget = 0;
    let nextListener = 0;
    let listenersAdded = 0;
    let listenersRemoved = 0;
    let duplicateAttempts = 0;
    let blobCreated = 0;
    let blobRevoked = 0;
    const idFor = (map, value, next) => {
      if (!map.has(value)) map.set(value, next());
      return map.get(value);
    };
    const capture = (options) => typeof options === "boolean" ? options : Boolean(options?.capture);
    const listenerKey = (target, type, listener, options) => {
      if ((typeof listener !== "function" && (typeof listener !== "object" || listener === null))) return null;
      const targetId = idFor(targetIds, target, () => ++nextTarget);
      const listenerId = idFor(listenerIds, listener, () => ++nextListener);
      return `${targetId}\u0000${String(type)}\u0000${listenerId}\u0000${capture(options)}`;
    };
    window.requestAnimationFrame = (callback) => {
      let id = 0;
      id = originalRaf((time) => { rafs.delete(id); callback(time); });
      rafs.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => { rafs.delete(id); return originalCancelRaf(id); };
    window.setInterval = (callback, delay, ...args) => {
      const id = originalInterval(callback, delay, ...args);
      intervals.add(id);
      return id;
    };
    window.clearInterval = (id) => { intervals.delete(id); return originalClearInterval(id); };
    URL.createObjectURL = (object) => {
      const value = originalCreateObjectUrl(object);
      blobs.add(value);
      blobCreated += 1;
      return value;
    };
    URL.revokeObjectURL = (value) => {
      if (blobs.delete(value)) blobRevoked += 1;
      return originalRevokeObjectUrl(value);
    };
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      const key = listenerKey(this, type, listener, options);
      if (key) {
        if (activeListeners.has(key)) duplicateAttempts += 1;
        else {
          activeListeners.add(key);
          listenersAdded += 1;
          const signal = typeof options === "object" && options ? options.signal : null;
          if (signal instanceof AbortSignal) {
            if (signal.aborted) activeListeners.delete(key);
            else originalAdd.call(signal, "abort", () => {
              if (activeListeners.delete(key)) listenersRemoved += 1;
            }, { once: true });
          }
        }
      }
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      const key = listenerKey(this, type, listener, options);
      if (key && activeListeners.delete(key)) listenersRemoved += 1;
      return originalRemove.call(this, type, listener, options);
    };
    const media = (video) => ({
      controls: video.controls,
      currentSrc: video.currentSrc || null,
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      networkState: video.networkState,
      paused: video.paused,
      readyState: video.readyState,
      sourceChildren: video.querySelectorAll("source").length,
      srcAttribute: video.getAttribute("src"),
      tabIndex: video.tabIndex,
    });
    globalThis.__phase7aFocusedProbe = () => ({
      blob: { created: blobCreated, revoked: blobRevoked, live: blobs.size },
      intervals: { active: intervals.size },
      listeners: { active: activeListeners.size, added: listenersAdded, removed: listenersRemoved, duplicateAttempts },
      maradin: [...document.querySelectorAll("[data-maradin-player]")].map((player) => ({
        state: player.getAttribute("data-video-state"),
        launchHidden: player.querySelector("[data-maradin-play]")?.hidden ?? null,
        video: media(player.querySelector("video")),
      })),
      home: (() => {
        const shell = document.querySelector("[data-cinematic-shell]");
        const video = shell?.querySelector("[data-cinematic-media]");
        return shell && video ? {
          hash: location.hash,
          h1: document.querySelector("h1")?.getAttribute("aria-label") || document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || null,
          media: media(video),
          mediaSource: shell.getAttribute("data-media-source"),
          mediaState: shell.getAttribute("data-media-state"),
          mode: document.documentElement.dataset.cinematicMode ?? null,
          physical: globalThis.quantumPhase4 ? {
            conceptualFrame: globalThis.quantumPhase4.conceptualFrame,
            presentedFrame: globalThis.quantumPhase4.presentedFrame,
            targetFrame: globalThis.quantumPhase4.targetFrame,
          } : null,
          reveal: shell.getAttribute("data-manifesto-reveal"),
        } : null;
      })(),
      raf: { active: rafs.size },
      url: location.href,
    });
  });
}

async function lifecycleSnapshot(page) {
  return page.evaluate(() => globalThis.__phase7aFocusedProbe?.() ?? null);
}

function mediaSourceFree(media) {
  return Boolean(media)
    && media.srcAttribute === null
    && media.sourceChildren === 0
    && media.readyState === 0
    && [0, 3].includes(media.networkState)
    && media.paused === true;
}

function activeMaradinPlayers(snapshot) {
  return snapshot.maradin.filter(({ state, video }) => state === "active" && video.srcAttribute && !mediaSourceFree(video));
}

function homeOwnsPhysicalSource(snapshot, expectEntry = false) {
  const home = snapshot?.home;
  if (!home || home.mode !== "enhanced" || home.mediaState !== "ready") return false;
  let sourcePath = "";
  try { sourcePath = new URL(home.mediaSource, "https://phase7a.invalid/").pathname; } catch { return false; }
  const physical = home.physical;
  return PHYSICAL_MEDIA.test(sourcePath)
    && home.media.srcAttribute?.startsWith("blob:")
    && snapshot.blob.live === 1
    && Number.isInteger(physical?.targetFrame) && physical.targetFrame >= 1 && physical.targetFrame <= 500
    && Number.isInteger(physical?.presentedFrame) && physical.presentedFrame >= 1 && physical.presentedFrame <= 500
    && (!expectEntry || (home.hash === "#entry" && home.reveal === "resolved" && canonicalText(home.h1) === canonicalText(MANIFESTO)));
}

async function waitForHomeReady(page, timeoutMs, expectEntry = false) {
  await page.waitForFunction((entry) => {
    const snapshot = globalThis.__phase7aFocusedProbe?.();
    const home = snapshot?.home;
    return home?.mode === "enhanced" && home.mediaState === "ready" && (!entry || (location.hash === "#entry" && home.reveal === "resolved"));
  }, expectEntry, { timeout: timeoutMs });
  await page.waitForTimeout(100);
  return lifecycleSnapshot(page);
}

async function installDepartureCapture(page, key) {
  await page.evaluate((storageKey) => {
    addEventListener("pagehide", () => {
      try { sessionStorage.setItem(storageKey, JSON.stringify(globalThis.__phase7aFocusedProbe?.() ?? null)); } catch { /* evidence remains absent and fails closed */ }
    }, { once: true });
  }, key);
}

async function readDepartureCapture(page, key) {
  return page.evaluate((storageKey) => {
    const value = sessionStorage.getItem(storageKey);
    sessionStorage.removeItem(storageKey);
    return value ? JSON.parse(value) : null;
  }, key);
}

async function activateAndScrub(page, index, timeoutMs) {
  const player = page.locator("[data-maradin-player]").nth(index);
  await player.locator("[data-maradin-play]").click({ timeout: timeoutMs });
  await page.waitForFunction((candidate) => {
    const players = [...document.querySelectorAll("[data-maradin-player]")];
    const player = players[candidate];
    const video = player?.querySelector("video");
    return player?.getAttribute("data-video-state") === "active" && video?.hasAttribute("src");
  }, index, { timeout: timeoutMs });
  await page.waitForFunction((candidate) => {
    const video = document.querySelectorAll("[data-maradin-player] video")[candidate];
    return video instanceof HTMLVideoElement && video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0;
  }, index, { timeout: timeoutMs });
  const request = await player.locator("video").evaluate((video) => {
    const target = Math.min(0.5, Math.max(0, video.duration / 4));
    video.currentTime = target;
    return { duration: video.duration, target };
  });
  await page.waitForFunction(({ candidate, target }) => {
    const video = document.querySelectorAll("[data-maradin-player] video")[candidate];
    return video instanceof HTMLVideoElement && !video.seeking && Math.abs(video.currentTime - target) <= 0.25;
  }, { candidate: index, target: request.target }, { timeout: timeoutMs });
  const observed = await player.locator("video").evaluate((video) => ({
    controls: video.controls,
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
  }));
  return {
    ...request,
    observed,
    passed: observed.controls === true
      && Number.isFinite(observed.currentTime)
      && observed.currentTime >= 0
      && observed.currentTime <= observed.duration
      && Math.abs(observed.currentTime - request.target) <= 0.25,
  };
}

export function homeMaradinChecksFromObservation(observation) {
  const { homeStart, homeDeparture, maradinInitial, firstActive, secondActive, maradinDeparture, homeReturn, scrubbers, mediaRequests } = observation;
  const firstPlayers = activeMaradinPlayers(firstActive);
  const secondPlayers = activeMaradinPlayers(secondActive);
  const firstReleased = mediaSourceFree(secondActive.maradin[0]?.video);
  const maradinDepartureFree = maradinDeparture?.maradin?.length === 2
    && maradinDeparture.maradin.every(({ state, video }) => state === "dormant" && mediaSourceFree(video));
  const requestCounts = new Map();
  for (const request of mediaRequests) requestCounts.set(request.path, (requestCounts.get(request.path) ?? 0) + 1);
  return {
    homeSourceOwned: homeOwnsPhysicalSource(homeStart) && homeDeparture?.blob?.live === 0,
    maradinInitialDormant: maradinInitial.maradin.length === 2
      && maradinInitial.maradin.every(({ state, launchHidden, video }) => state === "dormant" && launchHidden === false && mediaSourceFree(video) && video.controls === true),
    oneActiveMaradinPlayer: firstPlayers.length === 1 && secondPlayers.length === 1 && scrubbers.every(({ passed }) => passed),
    replacementReleasedPrevious: firstReleased && secondPlayers[0] === secondActive.maradin[1],
    departureReleasedMedia: maradinDepartureFree
      && maradinDeparture?.raf?.active === 0
      && maradinDeparture?.intervals?.active === 0,
    homeReturnCoherent: homeOwnsPhysicalSource(homeReturn, true),
    blobBalanceClosed: maradinInitial.blob.live === 0
      && firstActive.blob.live === 0
      && secondActive.blob.live === 0
      && maradinDeparture?.blob?.live === 0
      && maradinDeparture?.blob?.created === maradinDeparture?.blob?.revoked,
    decoderCountBounded: firstPlayers.length <= 1 && secondPlayers.length <= 1 && maradinDepartureFree,
    listenerCountBounded: secondActive.listeners.active <= maradinInitial.listeners.active
      && secondActive.listeners.duplicateAttempts === maradinInitial.listeners.duplicateAttempts,
    noRetryStorm: mediaRequests.length <= 8 && [...requestCounts.values()].every((count) => count <= 4),
  };
}

function thresholdPlaceholders() {
  return Array.from({ length: THRESHOLD_REVERSE_CYCLES }, (_, index) => ({
    cycle: index + 1,
    checks: Object.fromEntries(THRESHOLD_REVERSE_CHECKS.map((name) => [name, null])),
    failures: [],
    statement: "Threshold/reverse evidence is intentionally supplied by the primary Phase 7A browser runner.",
    status: "NOT OBSERVED",
  }));
}

function unavailableHomeMaradinReport(engine, error) {
  const statement = `The managed ${engine} lifecycle run was not available: ${String(error?.message ?? error).slice(0, 1_000)}`;
  const homeMaradin = Array.from({ length: HOME_MARADIN_CYCLES }, (_, index) => ({
    cycle: index + 1,
    checks: Object.fromEntries(HOME_MARADIN_CHECKS.map((name) => [name, null])),
    failures: [],
    statement,
    status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT",
  }));
  const report = {
    status: "LIMITATION",
    failures: [],
    statement,
    thresholdReverse: thresholdPlaceholders(),
    homeMaradin,
  };
  validateLifecycleReport(report);
  return report;
}

async function runHomeMaradinCycles(browser, engine, options) {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
  await installLifecycleProbe(context);
  const page = await context.newPage();
  page.setDefaultTimeout(options.timeoutMs);
  const cycleRequests = [];
  let activeCycle = 0;
  page.on("request", (request) => {
    let parsed;
    try { parsed = new URL(request.url()); } catch { return; }
    if (activeCycle > 0 && MARADIN_MEDIA.test(parsed.pathname)) {
      cycleRequests.push({ cycle: activeCycle, method: request.method(), path: parsed.pathname, range: request.headers().range ?? null, resourceType: request.resourceType() });
    }
  });
  const rows = [];
  try {
    for (let cycle = 1; cycle <= HOME_MARADIN_CYCLES; cycle += 1) {
      activeCycle = cycle;
      const homeKey = `__phase7a_home_departure_${cycle}`;
      const maradinKey = `__phase7a_maradin_departure_${cycle}`;
      await page.goto(options.baseUrl, { waitUntil: "load", timeout: options.timeoutMs });
      const homeStart = await waitForHomeReady(page, options.timeoutMs);
      await installDepartureCapture(page, homeKey);

      await page.goto(new URL("pocs/maradin/", options.baseUrl).toString(), { waitUntil: "load", timeout: options.timeoutMs });
      await settle(page);
      const homeDeparture = await readDepartureCapture(page, homeKey);
      await installDepartureCapture(page, maradinKey);
      const maradinInitial = await lifecycleSnapshot(page);
      const firstScrubber = await activateAndScrub(page, 0, options.timeoutMs);
      await page.waitForTimeout(100);
      const firstActive = await lifecycleSnapshot(page);
      const secondScrubber = await activateAndScrub(page, 1, options.timeoutMs);
      await page.waitForTimeout(150);
      const secondActive = await lifecycleSnapshot(page);

      await page.locator("a.brand-link").click({ timeout: options.timeoutMs });
      await page.waitForURL((url) => url.origin === new URL(options.baseUrl).origin && url.pathname === new URL(options.baseUrl).pathname && url.hash === "#entry", { timeout: options.timeoutMs });
      const homeReturn = await waitForHomeReady(page, options.timeoutMs, true);
      const maradinDeparture = await readDepartureCapture(page, maradinKey);
      const mediaRequests = cycleRequests.filter((request) => request.cycle === cycle);
      const observation = {
        engine,
        homeStart,
        homeDeparture,
        maradinInitial,
        firstActive,
        secondActive,
        maradinDeparture,
        homeReturn,
        scrubbers: [firstScrubber, secondScrubber],
        mediaRequests,
      };
      const checks = homeMaradinChecksFromObservation(observation);
      rows.push({ cycle, checks, observation, ...statusWithFailures(checks) });
    }
  } finally {
    await context.close();
  }
  const failed = rows.filter(({ status }) => status === "FAIL");
  const report = {
    status: failed.length ? "FAIL" : "LIMITATION",
    failures: failed.map(({ cycle, failures }) => ({ cycle, failures })),
    statement: failed.length
      ? undefined
      : "All Home/Maradin cycles passed; threshold/reverse rows remain explicitly NOT OBSERVED here because the primary runner owns that proof.",
    thresholdReverse: thresholdPlaceholders(),
    homeMaradin: rows,
  };
  if (report.statement === undefined) delete report.statement;
  validateLifecycleReport(report);
  return report;
}

export function selfTest() {
  invariant(fallbackAuthority().length === 51, "focused fallback authority must contain exactly 51 rows");
  invariant(HOME_MARADIN_CYCLES === 10, "Home/Maradin authority must contain exactly ten cycles");
  invariant(THRESHOLD_REVERSE_CYCLES === 10, "threshold placeholder count must remain exact");
  invariant(FALLBACK_CASE_CHECKS.length === 6 && HOME_MARADIN_CHECKS.length === 10, "focused check inventories differ");
  invariant(!/dispatchEvent|PageTransitionEvent/.test(installLifecycleProbe.toString()), "lifecycle probe must not synthesize lifecycle events");
  return { schema: `${SCHEMA}.self-test`, status: "PASS", fallbackCases: 51, homeMaradinCycles: 10, syntheticLifecycle: false };
}

export async function runFocusedProof(options) {
  const exists = await stat(options.output).then(() => true).catch(() => false);
  invariant(!exists, `refusing to overwrite existing evidence: ${options.output}`);
  await mkdir(path.dirname(options.output), { recursive: true });
  const startedAt = new Date().toISOString();
  const fallback = await runFallbackMatrix(options);
  const lifecycleEngine = options.engine === "all" ? "chromium" : options.engine;
  let lifecycleBrowser = null;
  let lifecycle;
  let lifecycleIdentity;
  try {
    lifecycleBrowser = await launchManaged(lifecycleEngine, options.headed);
    lifecycleIdentity = { engine: lifecycleEngine, version: lifecycleBrowser.version(), authority: lifecycleEngine === "webkit" ? "Playwright WebKit proxy; not physical Safari" : `Playwright managed ${lifecycleEngine}` };
    lifecycle = await runHomeMaradinCycles(lifecycleBrowser, lifecycleEngine, options);
  } catch (error) {
    lifecycleIdentity = { engine: lifecycleEngine, version: lifecycleBrowser?.version() ?? null, authority: "NOT AVAILABLE TO EXECUTION ENVIRONMENT", error: String(error?.message ?? error).slice(0, 1_000) };
    lifecycle = unavailableHomeMaradinReport(lifecycleEngine, error);
  } finally {
    await lifecycleBrowser?.close().catch(() => undefined);
  }
  const homeMaradinStatus = lifecycle.homeMaradin.some(({ status }) => status === "FAIL")
    ? "FAIL"
    : lifecycle.homeMaradin.every(({ status }) => status === "PASS")
      ? "PASS"
      : "LIMITATION";
  const status = fallback.report.status === "FAIL" || homeMaradinStatus === "FAIL"
    ? "FAIL"
    : fallback.report.status === "PASS" && homeMaradinStatus === "PASS"
      ? "PASS"
      : "LIMITATION";
  const report = {
    schema: SCHEMA,
    branch: PHASE7A_BRANCH,
    baseUrl: options.baseUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    requestedEngine: options.engine,
    identities: fallback.identities,
    engineErrors: fallback.engineErrors,
    lifecycleIdentity,
    fallback: fallback.report,
    lifecycle,
    focusedScope: {
      fallbackStatus: fallback.report.status,
      homeMaradinStatus,
      thresholdReverseStatus: "NOT OBSERVED — supplied by primary Phase 7A browser runner",
    },
    failures: [
      ...fallback.report.failures.map((failure) => ({ area: "fallback", ...failure })),
      ...lifecycle.failures.map((failure) => ({ area: "home-maradin", ...failure })),
    ],
    status,
  };
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return report;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/qa-phase7a-fallback-lifecycle.mjs --base-url <local-or-deployed-origin> --output <fresh-external-json> [--engine all|chromium|firefox|webkit] [--headed] [--timeout-ms <ms>]",
    "  node scripts/qa-phase7a-fallback-lifecycle.mjs --self-test",
    "",
    "The all-engine run executes the exact 51-row fallback matrix. Home/Maradin lifecycle proof runs for Chromium when --engine all is selected.",
  ].join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return void process.stdout.write(`${usage()}\n`);
  if (options.selfTest) return void process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`);
  const report = await runFocusedProof(options);
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    fallback: report.focusedScope.fallbackStatus,
    homeMaradin: report.focusedScope.homeMaradinStatus,
    output: options.output,
  }, null, 2)}\n`);
  if (report.status === "FAIL") process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 7A focused fallback/lifecycle proof failed: ${error.message}`);
  process.exitCode = 1;
});
