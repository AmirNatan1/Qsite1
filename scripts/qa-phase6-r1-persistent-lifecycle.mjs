#!/usr/bin/env node

/**
 * Deployed-origin Phase 6-R1 history, BFCache and real visibility probe.
 *
 * The browser runs with a fresh persistent Chromium profile. The script never
 * synthesizes page lifecycle events and never upgrades an unobserved persisted
 * restoration or hidden transition to PASS.
 */

import { randomUUID } from "node:crypto";
import { access, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-6-r1.persistent-lifecycle.v1";
export const STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  LIMITATION: "LIMITATION",
  NOT_OBSERVED: "NOT OBSERVED",
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertExternalPath(candidate, label) {
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root) throw new Error(`${label} cannot be a filesystem root`);
  if (within(ROOT, resolved)) throw new Error(`${label} must remain outside the repository`);
  if (within(os.tmpdir(), resolved)) throw new Error(`${label} must remain outside OS temporary storage`);
  return resolved;
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("--base-url must be a credential-free deployed HTTPS origin without query or fragment");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

export function parseArguments(argv) {
  const options = { baseUrl: "", headed: true, help: false, output: "", selfTest: false, timeoutMs: 45_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--base-url") options.baseUrl = next();
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--headless") options.headed = false;
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

export function validateOptions(options) {
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  if (!options.help && !options.selfTest) {
    options.baseUrl = normalizeBaseUrl(options.baseUrl);
    options.output = assertExternalPath(options.output, "--output");
    if (path.extname(options.output).toLowerCase() !== ".json") throw new Error("--output must be a JSON file");
  }
  return options;
}

async function exists(candidate) {
  try { await access(candidate); return true; }
  catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function targetUrl(baseUrl, route) {
  return new URL(route, baseUrl).toString();
}

async function installProbe(context) {
  await context.addInitScript(() => {
    const STORAGE_KEY = "__quantum_phase6_r1_lifecycle_v1";
    const documentId = globalThis.crypto?.randomUUID?.()
      ?? `${performance.timeOrigin}-${Math.random().toString(16).slice(2)}`;
    let documentEventSequence = 0;
    const rafActive = new Set();
    const intervalActive = new Set();
    const blobLive = new Map();
    const listenerRecords = [];
    const probe = {
      blob: { created: 0, revoked: 0 },
      intervals: { created: 0, cleared: 0 },
      listeners: { added: 0, duplicateAttempts: 0, removed: 0 },
      raf: { scheduled: 0, executed: 0, cancelled: 0 },
    };

    try { performance.setResourceTimingBufferSize(2_000); } catch { /* optional telemetry */ }

    const readEvents = () => {
      try {
        const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    };
    const appendEvent = (record) => {
      try {
        const events = readEvents();
        events.push({
          ...record,
          atEpochMs: Date.now(),
          documentEventSequence: ++documentEventSequence,
          documentId,
          href: location.href,
          visibilityState: document.visibilityState,
        });
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-250)));
      } catch { /* labelled unsupported by snapshot */ }
    };

    const nativeRaf = globalThis.requestAnimationFrame.bind(globalThis);
    const nativeCancelRaf = globalThis.cancelAnimationFrame.bind(globalThis);
    globalThis.requestAnimationFrame = (callback) => {
      let identifier = 0;
      identifier = nativeRaf((timestamp) => {
        rafActive.delete(identifier);
        probe.raf.executed += 1;
        callback(timestamp);
      });
      probe.raf.scheduled += 1;
      rafActive.add(identifier);
      return identifier;
    };
    globalThis.cancelAnimationFrame = (identifier) => {
      if (rafActive.delete(identifier)) probe.raf.cancelled += 1;
      return nativeCancelRaf(identifier);
    };

    const nativeSetInterval = globalThis.setInterval.bind(globalThis);
    const nativeClearInterval = globalThis.clearInterval.bind(globalThis);
    globalThis.setInterval = (handler, timeout, ...args) => {
      const identifier = nativeSetInterval(handler, timeout, ...args);
      intervalActive.add(identifier);
      probe.intervals.created += 1;
      return identifier;
    };
    globalThis.clearInterval = (identifier) => {
      if (intervalActive.delete(identifier)) probe.intervals.cleared += 1;
      return nativeClearInterval(identifier);
    };

    try {
      const nativeCreate = URL.createObjectURL.bind(URL);
      const nativeRevoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (object) => {
        const value = nativeCreate(object);
        blobLive.set(value, { kind: object?.constructor?.name ?? "unknown", size: Number(object?.size ?? 0), type: object?.type ?? "" });
        probe.blob.created += 1;
        return value;
      };
      URL.revokeObjectURL = (value) => {
        blobLive.delete(value);
        probe.blob.revoked += 1;
        return nativeRevoke(value);
      };
    } catch { /* current-document snapshot labels availability */ }

    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    const listenerCapture = (options) => typeof options === "boolean" ? options : Boolean(options?.capture);
    const matchingListener = (target, type, listener, capture) => listenerRecords.find((record) => (
      record.active
      && record.target === target
      && record.type === type
      && record.listener === listener
      && record.capture === capture
    ));
    const deactivateListener = (record) => {
      if (!record?.active) return;
      record.active = false;
      const index = listenerRecords.indexOf(record);
      if (index >= 0) listenerRecords.splice(index, 1);
      if (record.abortSignal && record.abortListener) {
        nativeRemove.call(record.abortSignal, "abort", record.abortListener, false);
        record.abortSignal = null;
        record.abortListener = null;
      }
      probe.listeners.removed += 1;
    };
    EventTarget.prototype.addEventListener = function phase6R1Add(type, listener, options) {
      if (!listener) return nativeAdd.call(this, type, listener, options);
      const capture = listenerCapture(options);
      if (matchingListener(this, type, listener, capture)) {
        probe.listeners.duplicateAttempts += 1;
        return;
      }
      const signal = typeof options === "object" ? options?.signal : null;
      if (signal?.aborted) return nativeAdd.call(this, type, listener, options);
      const once = typeof options === "object" && options?.once === true;
      const record = { abortListener: null, abortSignal: null, active: true, capture, listener, nativeListener: listener, target: this, type };
      if (once) {
        record.nativeListener = function phase6R1OnceListener(event) {
          deactivateListener(record);
          if (typeof listener === "function") return listener.call(this, event);
          return listener.handleEvent?.call(listener, event);
        };
      }
      nativeAdd.call(this, type, record.nativeListener, options);
      listenerRecords.push(record);
      probe.listeners.added += 1;
      if (signal) {
        record.abortSignal = signal;
        record.abortListener = () => deactivateListener(record);
        nativeAdd.call(signal, "abort", record.abortListener, { once: true });
      }
    };
    EventTarget.prototype.removeEventListener = function phase6R1Remove(type, listener, options) {
      const capture = listenerCapture(options);
      const record = matchingListener(this, type, listener, capture);
      if (!record) return nativeRemove.call(this, type, listener, options);
      deactivateListener(record);
      return nativeRemove.call(this, type, record.nativeListener, capture);
    };

    for (const type of ["pageshow", "pagehide", "popstate", "hashchange"]) {
      nativeAdd.call(globalThis, type, (event) => appendEvent({ type, persisted: typeof event.persisted === "boolean" ? event.persisted : null }));
    }
    nativeAdd.call(document, "visibilitychange", () => appendEvent({ type: "visibilitychange", persisted: null }));

    Object.defineProperty(globalThis, "__phase6R1PersistentProbe", {
      configurable: true,
      value: () => {
        const navigation = performance.getEntriesByType("navigation")[0];
        let notRestoredReasons = null;
        try {
          const source = navigation?.notRestoredReasons;
          notRestoredReasons = source?.toJSON ? source.toJSON() : source ? JSON.parse(JSON.stringify(source)) : null;
        } catch { notRestoredReasons = { status: "unserializable" }; }
        return {
          documentId,
          documentEventSequence,
          blob: { ...probe.blob, live: blobLive.size },
          intervals: { ...probe.intervals, active: intervalActive.size },
          listeners: {
            ...probe.listeners,
            active: listenerRecords.filter(({ active }) => active).length,
            activeByType: Object.fromEntries([...listenerRecords.filter(({ active }) => active).reduce((counts, { type }) => {
              counts.set(type, (counts.get(type) ?? 0) + 1);
              return counts;
            }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right))),
          },
          raf: { ...probe.raf, active: rafActive.size },
          events: readEvents(),
          navigation: { type: navigation?.type ?? null, notRestoredReasons },
          resources: performance.getEntriesByType("resource").flatMap((entry) => {
            try {
              const url = new URL(entry.name, location.href);
              if (!/\.mp4$/i.test(url.pathname)) return [];
              return [{
                path: url.pathname,
                url: `${url.pathname}${url.search}`,
                initiatorType: entry.initiatorType || null,
                startTime: Math.round(entry.startTime * 1_000) / 1_000,
                transferSize: Number(entry.transferSize ?? 0),
              }];
            } catch {
              return [];
            }
          }),
        };
      },
    });
  });
}

async function settle(page, timeoutMs) {
  await page.waitForLoadState("load", { timeout: timeoutMs }).catch(() => undefined);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(250);
}

async function snapshot(page, label) {
  return page.evaluate((sampleLabel) => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const homeVideo = document.querySelector("[data-cinematic-media]");
    const maradinPlayers = [...document.querySelectorAll("[data-maradin-player]")];
    const menu = document.querySelector("[data-mobile-nav]");
    const probe = globalThis.__phase6R1PersistentProbe?.() ?? null;
    return {
      capturedAtEpochMs: Date.now(),
      documentId: probe?.documentId ?? null,
      label: sampleLabel,
      url: `${location.pathname}${location.hash}`,
      scrollY: Math.round(scrollY),
      maximumScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      visibilityState: document.visibilityState,
      probe,
      home: shell ? {
        mode: document.documentElement.dataset.cinematicMode ?? null,
        phase: shell.getAttribute("data-cinematic-phase"),
        segment: shell.getAttribute("data-cinematic-segment"),
        targetFrame: Number(shell.getAttribute("data-target-frame") ?? 0),
        presentedFrame: Number(shell.getAttribute("data-presented-frame") ?? 0),
        manifestoReveal: shell.getAttribute("data-manifesto-reveal"),
        mediaState: shell.getAttribute("data-media-state"),
        source: homeVideo ? { hasSource: Boolean(homeVideo.currentSrc || homeVideo.getAttribute("src")), paused: homeVideo.paused, readyState: homeVideo.readyState } : null,
      } : null,
      mobileMenu: menu ? { open: menu.hasAttribute("open"), expanded: menu.querySelector("summary")?.getAttribute("aria-expanded") ?? null } : null,
      maradin: maradinPlayers.map((player) => {
        const video = player.querySelector("video");
        const launch = player.querySelector("[data-maradin-play]");
        return {
          state: player.getAttribute("data-video-state"),
          hasSource: Boolean(video?.currentSrc || video?.getAttribute("src")),
          currentSrc: video?.currentSrc || null,
          currentTime: Number.isFinite(video?.currentTime) ? video.currentTime : null,
          srcAttribute: video?.getAttribute("src") ?? null,
          paused: video?.paused ?? null,
          readyState: video?.readyState ?? null,
          tabIndex: video?.tabIndex ?? null,
          launchHidden: launch?.hidden ?? null,
          launchDisabled: launch?.disabled ?? null,
        };
      }),
    };
  }, label);
}

async function wheelToEnd(page, timeoutMs) {
  const started = Date.now();
  let previous = -1;
  let unchanged = 0;
  await page.mouse.move(20, 20);
  for (;;) {
    const state = await snapshot(page, "wheel-progress");
    if (state.scrollY >= state.maximumScroll - 1) return;
    if (Date.now() - started > timeoutMs) throw new Error(`native wheel timed out at ${state.scrollY}`);
    unchanged = state.scrollY === previous ? unchanged + 1 : 0;
    if (unchanged > 4) throw new Error(`native wheel stalled at ${state.scrollY}`);
    previous = state.scrollY;
    await page.mouse.wheel(0, 360);
    await page.waitForTimeout(45);
  }
}

async function waitForUrl(page, predicate, timeoutMs) {
  await page.waitForURL(predicate, { timeout: timeoutMs });
  await settle(page, timeoutMs);
}

export function navigationChecks(states) {
  const bareCorrect = states.bare.url === "/" && states.bare.scrollY === 0;
  const bareBackCorrect = states.bareBack.url === "/" && Math.abs(states.bareBack.scrollY - states.bareManifesto.scrollY) <= 2;
  const bareBackManifestoResolved = states.bareBack.home?.manifestoReveal === "resolved";
  const bareForwardCorrect = states.supportForward.url === "/for-partners/"
    && Math.abs(states.supportForward.scrollY - states.supportAfterBare.scrollY) <= 2;
  const entryCorrect = states.entryResolved.url === "/#entry" && states.entryResolved.home?.manifestoReveal === "resolved";
  const entryBackCorrect = states.entryBack.url === "/#entry" && Math.abs(states.entryBack.scrollY - states.entryResolved.scrollY) <= 2;
  const entryBackManifestoResolved = states.entryBack.home?.manifestoReveal === "resolved";
  const entryForwardCorrect = states.entryForward.url === "/for-partners/"
    && Math.abs(states.entryForward.scrollY - states.supportAfterEntry.scrollY) <= 2;
  const menuClosed = [states.bareBack, states.supportForward, states.entryBack, states.entryForward]
    .every((state) => state.mobileMenu?.open === false);
  return {
    bareCorrect,
    bareBackCorrect,
    bareBackManifestoResolved,
    bareForwardCorrect,
    entryCorrect,
    entryBackCorrect,
    entryBackManifestoResolved,
    entryForwardCorrect,
    menuClosed,
  };
}

function eventRoute(event) {
  try {
    const url = new URL(event.href);
    return `${url.pathname}${url.hash}`;
  }
  catch { return false; }
}

export function bfcacheResult(events, states) {
  const persistedEvents = events.filter(({ type, persisted }) => (type === "pageshow" || type === "pagehide") && persisted === true);
  const usedHideIndexes = new Set();
  const scenarios = [
    { departureKey: "bareManifesto", stateKey: "bareBack", expectedRoute: "/", state: states.bareBack },
    { departureKey: "entryResolved", stateKey: "entryBack", expectedRoute: "/#entry", state: states.entryBack },
  ].map(({ departureKey, stateKey, expectedRoute, state }) => {
    const departure = states[departureKey];
    if (!state?.documentId || departure?.documentId !== state.documentId || departure.url !== expectedRoute || state.url !== expectedRoute) {
      return { departureKey, stateKey, expectedRoute, status: STATUS.NOT_OBSERVED, pair: null, coherent: null };
    }
    for (let showIndex = 0; showIndex < events.length; showIndex += 1) {
      const show = events[showIndex];
      if (show?.type !== "pageshow" || show.persisted !== true || show.documentId !== state.documentId || eventRoute(show) !== expectedRoute) continue;
      for (let hideIndex = showIndex - 1; hideIndex >= 0; hideIndex -= 1) {
        const hide = events[hideIndex];
        if (hide?.documentId !== state.documentId || eventRoute(hide) !== expectedRoute || (hide.type !== "pagehide" && hide.type !== "pageshow")) continue;
        if (usedHideIndexes.has(hideIndex) || hide.type !== "pagehide" || hide.persisted !== true) break;
        usedHideIndexes.add(hideIndex);
        const coherent = state.home?.manifestoReveal === "resolved" && state.mobileMenu?.open === false;
        return {
          departureKey,
          stateKey,
          expectedRoute,
          status: coherent ? STATUS.PASS : STATUS.FAIL,
          pair: { pagehide: hide, pageshow: show },
          coherent,
        };
      }
    }
    return { departureKey, stateKey, expectedRoute, status: STATUS.NOT_OBSERVED, pair: null, coherent: null };
  });
  const pairedRestorations = scenarios.filter(({ pair }) => pair).map(({ pair, stateKey }) => ({ ...pair, stateKey }));
  if (!pairedRestorations.length) {
    return {
      status: STATUS.NOT_OBSERVED,
      persistedEvents,
      pairedRestorations: [],
      scenarios,
      notRestoredReasons: Object.fromEntries(Object.entries(states).map(([key, state]) => [key, state.probe?.navigation?.notRestoredReasons ?? null])),
      statement: "No relevant Home pageshow.persisted=true restoration paired to an earlier pagehide.persisted=true for the same Document was observed; ordinary Back/Forward evidence remains separate.",
    };
  }
  const failed = scenarios.some(({ status }) => status === STATUS.FAIL);
  const passed = scenarios.some(({ status }) => status === STATUS.PASS);
  const status = failed ? STATUS.FAIL : passed ? STATUS.PASS : STATUS.NOT_OBSERVED;
  return {
    status,
    persistedEvents,
    pairedRestorations,
    scenarios,
    notRestoredReasons: Object.fromEntries(Object.entries(states).map(([key, state]) => [key, state.probe?.navigation?.notRestoredReasons ?? null])),
    statement: status === STATUS.PASS
      ? "A relevant Home pageshow.persisted=true restoration was paired to pagehide.persisted=true for the same Document and remained coherent."
      : "A paired persisted Home restoration was observed but failed state-coherence checks.",
  };
}

async function runHistory(page, options) {
  const states = {};
  await page.goto(targetUrl(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "ready", undefined, { timeout: options.timeoutMs });
  states.bare = await snapshot(page, "bare-home");
  await wheelToEnd(page, options.timeoutMs);
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: options.timeoutMs });
  states.bareManifesto = await snapshot(page, "bare-home-manifesto");
  await page.locator("[data-audience-routing] a[href='/for-partners/']").click({ timeout: options.timeoutMs });
  await waitForUrl(page, (url) => url.pathname === "/for-partners/", options.timeoutMs);
  states.supportAfterBare = await snapshot(page, "support-after-bare");
  await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "ready", undefined, { timeout: options.timeoutMs });
  await page.waitForFunction(
    () => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved",
    undefined,
    { timeout: Math.min(options.timeoutMs, 3_000) },
  ).catch(() => false);
  states.bareBack = await snapshot(page, "bare-back");
  await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  states.supportForward = await snapshot(page, "support-forward");

  await page.locator(".brand-link[href='/#entry']").first().click({ timeout: options.timeoutMs });
  await waitForUrl(page, (url) => url.pathname === "/" && url.hash === "#entry", options.timeoutMs);
  states.entryInitial = await snapshot(page, "entry-initial");
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: options.timeoutMs });
  states.entryResolved = await snapshot(page, "entry-resolved");
  await page.locator("[data-audience-routing] a[href='/for-partners/']").click({ timeout: options.timeoutMs });
  await waitForUrl(page, (url) => url.pathname === "/for-partners/", options.timeoutMs);
  states.supportAfterEntry = await snapshot(page, "support-after-entry");
  await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "ready", undefined, { timeout: options.timeoutMs });
  await page.waitForFunction(
    () => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved",
    undefined,
    { timeout: Math.min(options.timeoutMs, 3_000) },
  ).catch(() => false);
  states.entryBack = await snapshot(page, "entry-back");
  await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  states.entryForward = await snapshot(page, "entry-forward");

  const checks = navigationChecks(states);
  const events = states.entryForward.probe?.events ?? [];
  return { status: Object.values(checks).every(Boolean) ? STATUS.PASS : STATUS.FAIL, checks, events, states, bfcache: bfcacheResult(events, states) };
}

async function tabSwitch(primary, background, options, label) {
  const transitionTimeoutMs = Math.min(options.timeoutMs, 5_000);
  await primary.bringToFront();
  const beforeVisible = await primary.waitForFunction(() => document.visibilityState === "visible", undefined, { polling: 100, timeout: transitionTimeoutMs })
    .then(() => true, () => false);
  const before = await snapshot(primary, `${label}-before`);
  await background.bringToFront();
  const hiddenReached = await primary.waitForFunction(() => document.visibilityState === "hidden", undefined, { polling: 100, timeout: transitionTimeoutMs })
    .then(() => true, () => false);
  if (hiddenReached) await primary.waitForTimeout(150);
  const hidden = await snapshot(primary, `${label}-background`);
  await primary.bringToFront();
  const visibleReached = await primary.waitForFunction(() => document.visibilityState === "visible", undefined, { polling: 100, timeout: transitionTimeoutMs })
    .then(() => true, () => false);
  if (visibleReached) await primary.waitForTimeout(150);
  const visible = await snapshot(primary, `${label}-foreground`);
  return { before, hidden, visible, waits: { beforeVisible, hiddenReached, visibleReached } };
}

export function visibilityTransitionEvidence(transition) {
  const { before, hidden, visible } = transition ?? {};
  const documentId = before?.documentId;
  const sameDocument = Boolean(documentId) && hidden?.documentId === documentId && visible?.documentId === documentId;
  const sequenceBound = Number.isInteger(before?.probe?.documentEventSequence);
  const sequenceStart = sequenceBound ? before.probe.documentEventSequence : -1;
  const events = (visible?.probe?.events ?? []).filter((event) => (
    event?.type === "visibilitychange"
    && event.documentId === documentId
    && Number(event.documentEventSequence) > sequenceStart
  ));
  const hiddenEventIndex = events.findIndex(({ visibilityState }) => visibilityState === "hidden");
  const visibleEventIndex = hiddenEventIndex < 0
    ? -1
    : events.findIndex(({ visibilityState }, index) => index > hiddenEventIndex && visibilityState === "visible");
  const checks = {
    sameDocument,
    sequenceBound,
    beforeVisible: before?.visibilityState === "visible",
    hiddenObserved: hidden?.visibilityState === "hidden",
    visibleRestored: visible?.visibilityState === "visible",
    orderedVisibilityEvents: hiddenEventIndex >= 0 && visibleEventIndex > hiddenEventIndex,
  };
  return {
    status: Object.values(checks).every(Boolean) ? STATUS.PASS : STATUS.NOT_OBSERVED,
    checks,
    transitionEvents: events,
  };
}

export function evaluateVisibilityScenario(name, transition, checks) {
  const observation = visibilityTransitionEvidence(transition);
  const entries = Object.entries(checks);
  const failedChecks = entries.filter(([, value]) => value === false).map(([key]) => key);
  const unavailableChecks = entries.filter(([, value]) => value == null).map(([key]) => key);
  const status = failedChecks.length
    ? STATUS.FAIL
    : observation.status === STATUS.PASS && unavailableChecks.length === 0
      ? STATUS.PASS
      : STATUS.NOT_OBSERVED;
  return { name, status, observation, checks, failedChecks, unavailableChecks, transition };
}

export function aggregateVisibilityScenarios(scenarios) {
  const statuses = scenarios.map(({ status }) => status);
  const status = statuses.includes(STATUS.FAIL)
    ? STATUS.FAIL
    : statuses.includes(STATUS.NOT_OBSERVED)
      ? STATUS.NOT_OBSERVED
      : STATUS.PASS;
  return {
    status,
    scenarios,
    statement: status === STATUS.PASS
      ? "Every scenario proved an ordered visible-to-hidden-to-visible transition and passed its observed lifecycle checks."
      : status === STATUS.FAIL
        ? "At least one observed scenario failed; an unobserved scenario cannot suppress that failure."
        : "No observed scenario failed, but at least one real visible-to-hidden-to-visible transition was not observed.",
  };
}

function maradinMediaSourceFree(media) {
  return media?.state === "dormant"
    && media.hasSource === false
    && media.currentSrc === null
    && media.srcAttribute === null
    && media.paused === true
    && media.readyState === 0
    && media.tabIndex === -1
    && media.launchHidden === false
    && media.launchDisabled === false;
}

export function maradinSourceFreeState(state) {
  return Array.isArray(state?.maradin) && state.maradin.length === 2 && state.maradin.every(maradinMediaSourceFree);
}

export function maradinRetryActiveState(state) {
  if (!Array.isArray(state?.maradin) || state.maradin.length !== 2) return false;
  const active = state.maradin.filter((media) => media.state === "active");
  const inactive = state.maradin.filter((media) => media.state !== "active");
  return state.retryActivated === true
    && state.retryPlayback?.advanced === true
    && Number.isFinite(state.retryPlayback?.startTime)
    && Number.isFinite(state.retryPlayback?.endTime)
    && state.retryPlayback.endTime > state.retryPlayback.startTime
    && active.length === 1
    && active[0].hasSource === true
    && active[0].paused === false
    && active[0].readyState >= 2
    && active[0].tabIndex === 0
    && active[0].launchHidden === true
    && inactive.length === 1
    && maradinMediaSourceFree(inactive[0]);
}

async function runVisibility(context, options) {
  const primary = await context.newPage();
  const background = await context.newPage();
  try {
    await background.goto("about:blank");
    await primary.goto(targetUrl(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(primary, options.timeoutMs);
    await primary.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "ready", undefined, { timeout: options.timeoutMs });
    await primary.mouse.wheel(0, 900);
    await primary.waitForTimeout(350);
    const current = await tabSwitch(primary, background, options, "home-current");
    await wheelToEnd(primary, options.timeoutMs);
    await primary.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: options.timeoutMs });
    const manifesto = await tabSwitch(primary, background, options, "home-manifesto");

    await primary.goto(targetUrl(options.baseUrl, "/pocs/maradin/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(primary, options.timeoutMs);
    await primary.locator("[data-maradin-play]").first().click({ timeout: options.timeoutMs });
    await primary.waitForFunction(() => {
      const players = [...document.querySelectorAll("[data-maradin-player]")];
      const active = players.filter((player) => player.getAttribute("data-video-state") === "active");
      const video = active[0]?.querySelector("video");
      return players.length === 2 && active.length === 1 && Boolean(video?.currentSrc || video?.getAttribute("src")) && video.paused === false && video.readyState >= 2;
    }, undefined, { timeout: options.timeoutMs });
    const maradin = await tabSwitch(primary, background, options, "maradin");
    const maradinSourceFreeAfterReturn = maradin.visible.visibilityState === "visible"
      ? maradinSourceFreeState(maradin.visible)
      : null;
    let retryActive = null;
    let maradinRetry = null;
    if (maradinSourceFreeAfterReturn === true) {
      await primary.locator("[data-maradin-play]").first().click({ timeout: options.timeoutMs });
      const retryActivated = await primary.waitForFunction(() => {
        const players = [...document.querySelectorAll("[data-maradin-player]")];
        const active = players.filter((player) => player.getAttribute("data-video-state") === "active");
        const video = active[0]?.querySelector("video");
        return players.length === 2 && active.length === 1 && Boolean(video?.currentSrc || video?.getAttribute("src")) && video.paused === false && video.readyState >= 2;
      }, undefined, { timeout: options.timeoutMs }).then(() => true, () => false);
      const retryStart = await snapshot(primary, "maradin-retry-start");
      const retryStartTime = retryStart.maradin[0]?.currentTime;
      const retryAdvanced = retryActivated && Number.isFinite(retryStartTime)
        ? await primary.waitForFunction((startTime) => {
          const video = document.querySelector("[data-maradin-player] video");
          return video?.paused === false && Number.isFinite(video.currentTime) && video.currentTime >= startTime + 0.05;
        }, retryStartTime, { polling: 50, timeout: options.timeoutMs }).then(() => true, () => false)
        : false;
      retryActive = await snapshot(primary, "maradin-retry-active");
      retryActive.retryActivated = retryActivated;
      retryActive.retryPlayback = {
        advanced: retryAdvanced,
        endTime: retryActive.maradin[0]?.currentTime ?? null,
        startTime: retryStartTime ?? null,
      };
      maradinRetry = await tabSwitch(primary, background, options, "maradin-retry");
    }

    const whenHidden = (transition, predicate) => transition.hidden.visibilityState === "hidden" ? predicate(transition.hidden) : null;
    const whenVisible = (transition, predicate) => transition.visible.visibilityState === "visible" ? predicate(transition.visible) : null;
    const activeResourceIsZero = (state, resource) => {
      const active = state.probe?.[resource]?.active;
      return Number.isFinite(active) ? active === 0 : null;
    };
    const scenarios = [
      evaluateVisibilityScenario("home-current", current, {
        homeMediaPausedWhileHidden: whenHidden(current, (state) => state.home?.source?.paused === true),
        noPersistentRafWhileHidden: whenHidden(current, (state) => activeResourceIsZero(state, "raf")),
        noPersistentIntervalWhileHidden: whenHidden(current, (state) => activeResourceIsZero(state, "intervals")),
        noStaleTargetFrameAfterReturn: whenVisible(current, (state) => Math.abs(state.home?.targetFrame - state.home?.presentedFrame) <= 1),
        sourcePresenceStableAfterReturn: whenVisible(current, (state) => {
          const beforeSource = current.before.home?.source?.hasSource;
          const afterSource = state.home?.source?.hasSource;
          return typeof beforeSource === "boolean" && typeof afterSource === "boolean" ? beforeSource === afterSource : null;
        }),
      }),
      evaluateVisibilityScenario("home-manifesto", manifesto, {
        manifestoCoherentAfterReturn: whenVisible(manifesto, (state) => state.home?.manifestoReveal === "resolved"),
        noPersistentRafWhileHidden: whenHidden(manifesto, (state) => activeResourceIsZero(state, "raf")),
        noPersistentIntervalWhileHidden: whenHidden(manifesto, (state) => activeResourceIsZero(state, "intervals")),
      }),
      evaluateVisibilityScenario("maradin-release", maradin, {
        sourceFreeWhileHidden: whenHidden(maradin, maradinSourceFreeState),
        sourceFreeAfterReturn: maradinSourceFreeAfterReturn,
        noLiveOrphanBlobWhileHidden: whenHidden(maradin, (state) => state.probe?.blob?.live === 0),
        noPersistentRafWhileHidden: whenHidden(maradin, (state) => activeResourceIsZero(state, "raf")),
        noPersistentIntervalWhileHidden: whenHidden(maradin, (state) => activeResourceIsZero(state, "intervals")),
      }),
      evaluateVisibilityScenario("maradin-retry-release", maradinRetry, {
        retryActivatedWithSource: retryActive == null ? null : maradinRetryActiveState(retryActive),
        sourceFreeOnSecondHide: maradinRetry == null ? null : whenHidden(maradinRetry, maradinSourceFreeState),
        sourceFreeAfterSecondReturn: maradinRetry == null ? null : whenVisible(maradinRetry, maradinSourceFreeState),
        noLiveOrphanBlobOnSecondHide: maradinRetry == null ? null : whenHidden(maradinRetry, (state) => state.probe?.blob?.live === 0),
      }),
    ];
    return { ...aggregateVisibilityScenarios(scenarios), current, manifesto, maradin, retryActive, maradinRetry };
  } finally {
    await Promise.all([primary.close().catch(() => undefined), background.close().catch(() => undefined)]);
  }
}

function collectLifecycleSnapshots(value, snapshots = [], visited = new Set()) {
  if (!value || typeof value !== "object" || visited.has(value)) return snapshots;
  visited.add(value);
  if (typeof value.label === "string" && Object.hasOwn(value, "documentId") && value.probe) snapshots.push(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectLifecycleSnapshots(child, snapshots, visited);
  return snapshots;
}

function phase4MediaUrl(value) {
  try {
    const url = new URL(value, "https://phase6.invalid/");
    return /\/media\/cinematic\/phase-4r2\/media\/[^/]+\.mp4$/i.test(url.pathname) ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

export function summarizeMediaTelemetry(records, snapshotInput) {
  const snapshots = Array.isArray(snapshotInput) ? snapshotInput : collectLifecycleSnapshots(snapshotInput);
  const homeDocuments = new Map();
  for (const state of snapshots) {
    if (!state.home || !state.documentId) continue;
    const document = homeDocuments.get(state.documentId) ?? { documentId: state.documentId, labels: new Set(), observations: new Set(), paths: new Set() };
    document.labels.add(state.label);
    for (const resource of state.probe?.resources ?? []) {
      const mediaUrl = phase4MediaUrl(resource.url ?? resource.path);
      if (!mediaUrl) continue;
      document.paths.add(mediaUrl);
      document.observations.add(`${mediaUrl}\u0000${Number(resource.startTime ?? -1)}`);
    }
    homeDocuments.set(state.documentId, document);
  }
  const documents = [...homeDocuments.values()].map((document) => ({
    documentId: document.documentId,
    labels: [...document.labels].sort(),
    paths: [...document.paths].sort(),
    resourceObservations: document.observations.size,
  })).sort((left, right) => left.documentId.localeCompare(right.documentId));
  const phase4Requests = records.filter(({ path: requestPath }) => phase4MediaUrl(requestPath));
  const expectedPhase4Present = documents.length > 0
    && documents.every(({ paths }) => paths.length >= 1)
    && phase4Requests.length >= 1;
  const noDuplicateSourceWithinDocument = documents.length > 0 && documents.every(({ paths }) => paths.length === 1);
  const uniqueNetworkPaths = [...new Set(phase4Requests.map(({ path: requestPath }) => phase4MediaUrl(requestPath)).filter(Boolean))].sort();
  const selectingDocumentsByPath = new Map();
  for (const document of documents) {
    for (const selectedPath of document.paths) {
      selectingDocumentsByPath.set(selectedPath, (selectingDocumentsByPath.get(selectedPath) ?? 0) + 1);
    }
  }
  const nonRangeRequestsByPath = new Map();
  for (const request of phase4Requests) {
    if (request.range) continue;
    const requestPath = phase4MediaUrl(request.path);
    nonRangeRequestsByPath.set(requestPath, (nonRangeRequestsByPath.get(requestPath) ?? 0) + 1);
  }
  const nonRangeSelections = [...nonRangeRequestsByPath.entries()].map(([requestPath, count]) => ({
    path: requestPath,
    count,
    logicalHomeDocuments: selectingDocumentsByPath.get(requestPath) ?? 0,
  })).sort((left, right) => left.path.localeCompare(right.path));
  const noDuplicateNonRangeRequests = nonRangeSelections.every(({ count, logicalHomeDocuments }) => count <= logicalHomeDocuments);
  return {
    status: expectedPhase4Present && noDuplicateSourceWithinDocument && noDuplicateNonRangeRequests ? STATUS.PASS : STATUS.FAIL,
    expectedPhase4Present,
    noDuplicateSourceWithinDocument,
    noDuplicateNonRangeRequests,
    documents,
    network: {
      phase4Requests,
      requestCount: phase4Requests.length,
      rangeRequestCount: phase4Requests.filter(({ range }) => Boolean(range)).length,
      nonRangeRequestCount: phase4Requests.filter(({ range }) => !range).length,
      nonRangeSelections,
      uniquePaths: uniqueNetworkPaths,
      interpretation: "Repeated HTTP range requests for one selected path are telemetry. Non-range selections may occur at most once per logical Home Document selecting that exact path.",
    },
  };
}

function listenerSnapshot(state) {
  const listeners = state?.probe?.listeners;
  if (!listeners
    || !Number.isFinite(listeners.active)
    || !Number.isFinite(listeners.duplicateAttempts)
    || !listeners.activeByType
    || typeof listeners.activeByType !== "object"
    || Array.isArray(listeners.activeByType)) return null;
  return {
    active: listeners.active,
    activeByType: listeners.activeByType,
    duplicateAttempts: listeners.duplicateAttempts,
  };
}

function listenerGrowth(before, after) {
  if (!before || !after) return ["listener-telemetry-unavailable"];
  const failures = [];
  if (after.active > before.active) failures.push("active-listener-count-grew");
  for (const [type, count] of Object.entries(after.activeByType)) {
    if (Number(count) > Number(before.activeByType[type] ?? 0)) failures.push(`active-${type}-listeners-grew`);
  }
  if (after.duplicateAttempts > before.duplicateAttempts) failures.push("duplicate-registration-attempted-during-restore");
  return failures;
}

export function summarizeListenerTelemetry(history, visibility) {
  const snapshots = collectLifecycleSnapshots({ history, visibility });
  const duplicateDocuments = [...new Map(snapshots.filter((state) => (state.probe?.listeners?.duplicateAttempts ?? 0) > 0)
    .map((state) => [state.documentId, {
      documentId: state.documentId,
      duplicateAttempts: state.probe.listeners.duplicateAttempts,
      label: state.label,
    }])).values()];
  const candidatePairs = [
    ["bare-back", history?.states?.bareManifesto, history?.states?.bareBack],
    ["entry-back", history?.states?.entryResolved, history?.states?.entryBack],
    ...(visibility?.scenarios ?? [])
      .filter((scenario) => scenario.observation?.status === STATUS.PASS)
      .map((scenario) => [`${scenario.name}-foreground`, scenario.transition?.before, scenario.transition?.visible]),
  ];
  const comparisons = candidatePairs.flatMap(([name, beforeState, afterState]) => {
    if (!beforeState?.documentId || beforeState.documentId !== afterState?.documentId) return [];
    const before = listenerSnapshot(beforeState);
    const after = listenerSnapshot(afterState);
    const failures = listenerGrowth(before, after);
    return [{ name, documentId: beforeState.documentId, before, after, failures, stable: failures.length === 0 }];
  });
  const failed = duplicateDocuments.length > 0 || comparisons.some(({ stable }) => !stable);
  return {
    status: failed ? STATUS.FAIL : comparisons.length > 0 ? STATUS.PASS : STATUS.NOT_OBSERVED,
    duplicateDocuments,
    comparisons,
    statement: failed
      ? "Duplicate registration attempts or listener growth were observed."
      : comparisons.length > 0
        ? "No duplicate registration attempt or active-listener growth was observed across same-Document restoration/visibility comparisons."
        : "No same-Document restoration/visibility comparison was observed; duplicate-attempt counters remain available without promoting stability to PASS.",
  };
}

export function profileCleanupResult({ closeError = null, removeError = null, verificationError = null, profileExists = null } = {}) {
  const errors = [closeError, removeError, verificationError].filter(Boolean).map((error) => String(error?.message ?? error).slice(0, 500));
  const deletionVerified = profileExists === false && errors.length === 0;
  return {
    status: deletionVerified ? STATUS.PASS : STATUS.FAIL,
    deletionVerified,
    profileRetained: profileExists == null ? null : profileExists,
    errors,
  };
}

export function deriveTopLevelStatus(components) {
  const statuses = (Array.isArray(components) ? components : Object.values(components)).map((component) => (
    typeof component === "string" ? component : component?.status
  ));
  if (statuses.some((status) => status === STATUS.FAIL || ![STATUS.PASS, STATUS.NOT_OBSERVED, STATUS.LIMITATION].includes(status))) return STATUS.FAIL;
  if (statuses.some((status) => status === STATUS.NOT_OBSERVED || status === STATUS.LIMITATION)) return STATUS.LIMITATION;
  return STATUS.PASS;
}

export function runSelfTest() {
  assert(STATUS.NOT_OBSERVED === "NOT OBSERVED", "unobserved status must remain explicit");
  assert(!/dispatchEvent|PageTransitionEvent/.test(installProbe.toString()), "probe must not synthesize lifecycle transitions");
  return { schema: `${SCHEMA}.self-test`, status: STATUS.PASS, persistentProfile: true, syntheticLifecycle: false };
}

export async function runPersistentLifecycle(options) {
  validateOptions(options);
  if (await exists(options.output)) throw new Error(`refusing to overwrite output: ${options.output}`);
  await mkdir(path.dirname(options.output), { recursive: true });
  const durableRoot = assertExternalPath(path.dirname(options.output), "output parent");
  const profile = path.join(durableRoot, `.phase6-r1-profile-${randomUUID()}`);
  const resolvedParent = await realpath(durableRoot);
  assert(within(resolvedParent, profile), "profile escaped output parent");
  await mkdir(profile, { recursive: false });
  const requests = [];
  const frameNavigationIds = new WeakMap();
  let nextNavigationId = 0;
  let context;
  let collected = null;
  let runError = null;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: chromium.executablePath(),
      headless: !options.headed,
      serviceWorkers: "block",
      viewport: { width: 390, height: 844 },
    });
    await installProbe(context);
    const registerPage = (page) => {
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) frameNavigationIds.set(frame, `navigation-${++nextNavigationId}`);
      });
    };
    for (const page of context.pages()) registerPage(page);
    context.on("page", registerPage);
    context.on("request", (request) => {
      const url = new URL(request.url());
      const headers = request.headers();
      let frame = null;
      try { frame = request.frame(); } catch { /* frame-less browser request */ }
      requests.push({
        frameNavigationId: frame ? frameNavigationIds.get(frame) ?? "pre-navigation" : null,
        documentUrl: frame?.url() ?? null,
        method: request.method(),
        path: `${url.pathname}${url.search}`,
        range: headers.range ?? null,
        resourceType: request.resourceType(),
      });
    });
    const pages = context.pages();
    const page = pages[0] ?? await context.newPage();
    const history = await runHistory(page, options);
    await page.close();
    const visibility = await runVisibility(context, options);
    collected = { browserVersion: context.browser()?.version() ?? null, history, visibility };
  } catch (error) {
    runError = error;
  }

  let closeError = null;
  let removeError = null;
  let verificationError = null;
  let profileExists = null;
  try { await context?.close(); } catch (error) { closeError = error; }
  try { await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 125 }); } catch (error) { removeError = error; }
  try { profileExists = await exists(profile); } catch (error) { verificationError = error; }
  if (runError) {
    const cleanupErrors = [closeError, removeError, verificationError].filter(Boolean);
    if (cleanupErrors.length) throw new AggregateError([runError, ...cleanupErrors], "Lifecycle run and persistent-profile cleanup both failed");
    throw runError;
  }

  const cleanup = profileCleanupResult({ closeError, removeError, verificationError, profileExists });
  const mediaRequests = summarizeMediaTelemetry(requests, { history: collected.history, visibility: collected.visibility });
  const listeners = summarizeListenerTelemetry(collected.history, collected.visibility);
  const status = deriveTopLevelStatus([
    collected.history,
    collected.history.bfcache,
    collected.visibility,
    mediaRequests,
    listeners,
    cleanup,
  ]);
  const report = {
    schema: SCHEMA,
    status,
    createdAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    browser: {
      engine: "chromium",
      headed: options.headed,
      persistentProfile: true,
      profileRetained: cleanup.profileRetained,
      version: collected.browserVersion,
    },
    profileCleanup: cleanup,
    history: collected.history,
    bfcache: collected.history.bfcache,
    visibility: collected.visibility,
    listeners,
    mediaRequests,
    interpretation: {
      bfcache: "PASS requires a relevant Home pageshow.persisted=true restoration paired to pagehide.persisted=true for the same Document; absence remains NOT OBSERVED.",
      visibility: "PASS requires ordered visible-to-hidden-to-visible states and native visibilitychange events in every scenario; observed failures dominate limitations.",
      ordinaryHistory: "Ordinary Back/Forward correctness, including both Forward destinations, is reported independently from BFCache eligibility.",
      overall: "PASS means every required component passed; NOT OBSERVED becomes LIMITATION; any observed failure becomes FAIL.",
    },
  };
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return report;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/qa-phase6-r1-persistent-lifecycle.mjs --base-url <deployed-https-origin> --output <fresh-external-json> [--headless] [--timeout-ms <ms>]",
    "  node scripts/qa-phase6-r1-persistent-lifecycle.mjs --self-test",
    "",
    "The default headed run uses a fresh persistent Chromium profile and real tab switches. Profile deletion is verified before the report is written.",
  ].join("\n");
}

async function main() {
  const options = validateOptions(parseArguments(process.argv.slice(2)));
  if (options.help) return void process.stdout.write(`${usage()}\n`);
  if (options.selfTest) return void process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
  const report = await runPersistentLifecycle(options);
  process.stdout.write(`${JSON.stringify({ status: report.status, bfcache: report.bfcache.status, visibility: report.visibility.status, history: report.history.status }, null, 2)}\n`);
  if (report.status === STATUS.FAIL) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 6-R1 persistent lifecycle failed: ${error.message}`);
  process.exitCode = 1;
});
