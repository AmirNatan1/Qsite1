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
    const manifestoRevealEvents = [];
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

    let lastManifestoReveal = Symbol("unobserved");
    const recordManifestoReveal = () => {
      const shell = document.querySelector("[data-cinematic-shell]");
      if (!shell) return;
      const value = shell.getAttribute("data-manifesto-reveal");
      if (value === lastManifestoReveal) return;
      lastManifestoReveal = value;
      manifestoRevealEvents.push({ atEpochMs: Date.now(), value });
    };
    const manifestoObserver = new MutationObserver(recordManifestoReveal);
    manifestoObserver.observe(document, {
      attributeFilter: ["data-manifesto-reveal"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    queueMicrotask(recordManifestoReveal);

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
        if (blobLive.delete(value)) probe.blob.revoked += 1;
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
          manifestoRevealEvents: manifestoRevealEvents.map((event) => ({ ...event })),
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

async function snapshot(page, label, navigationId) {
  return page.evaluate(({ sampleLabel, snapshotNavigationId }) => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const homeVideo = document.querySelector("[data-cinematic-media]");
    const manifestoContent = shell?.querySelector(".manifesto-field__content");
    const audienceRouting = document.querySelector("[data-audience-routing]");
    const partnerLink = audienceRouting?.querySelector("a[href='/for-partners/']");
    const maradinPlayers = [...document.querySelectorAll("[data-maradin-player]")];
    const menu = document.querySelector("[data-mobile-nav]");
    const probe = globalThis.__phase6R1PersistentProbe?.() ?? null;
    const visibleGeometry = (element) => {
      if (!(element instanceof Element)) return null;
      const bounds = element.getBoundingClientRect();
      return {
        bottom: Math.round(bounds.bottom * 1_000) / 1_000,
        top: Math.round(bounds.top * 1_000) / 1_000,
        visible: bounds.bottom > 0 && bounds.top < innerHeight,
      };
    };
    const manifestoStyle = manifestoContent ? getComputedStyle(manifestoContent) : null;
    const manifestoBounds = manifestoContent?.getBoundingClientRect();
    return {
      capturedAtEpochMs: Date.now(),
      documentId: probe?.documentId ?? null,
      label: sampleLabel,
      navigationId: snapshotNavigationId,
      origin: location.origin,
      url: `${location.pathname}${location.hash}`,
      scrollY: Math.round(scrollY),
      maximumScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      visibilityState: document.visibilityState,
      probe,
      home: shell ? {
        mode: document.documentElement.dataset.cinematicMode ?? null,
        bootstrap: document.documentElement.dataset.cinematicBootstrap ?? null,
        eligibility: document.documentElement.dataset.cinematicEligibility ?? null,
        fallback: document.documentElement.dataset.cinematicFallback ?? null,
        header: document.documentElement.dataset.cinematicHeader ?? null,
        phase: shell.getAttribute("data-cinematic-phase"),
        interactive: shell.getAttribute("data-cinematic-interactive"),
        routeNavigation: shell.getAttribute("data-route-navigation"),
        segment: shell.getAttribute("data-cinematic-segment"),
        targetFrame: Number(shell.getAttribute("data-target-frame") ?? 0),
        presentedFrame: Number(shell.getAttribute("data-presented-frame") ?? 0),
        manifestoReveal: shell.getAttribute("data-manifesto-reveal"),
        manifesto: manifestoContent && manifestoStyle && manifestoBounds ? {
          rendered: manifestoStyle.display !== "none"
            && manifestoStyle.visibility !== "hidden"
            && Number.parseFloat(manifestoStyle.opacity) > 0
            && manifestoBounds.width > 0
            && manifestoBounds.height > 0,
          text: manifestoContent.textContent?.replace(/\s+/g, " ").trim() ?? "",
        } : null,
        mediaState: shell.getAttribute("data-media-state"),
        source: homeVideo ? {
          hasSource: Boolean(homeVideo.currentSrc || homeVideo.getAttribute("src")),
          src: homeVideo.src || null,
          currentSrc: homeVideo.currentSrc || null,
          srcAttribute: homeVideo.getAttribute("src") ?? null,
          videoNodeCount: shell.querySelectorAll("[data-cinematic-media]").length,
          sourceNodeCount: homeVideo.querySelectorAll("source").length,
          paused: homeVideo.paused,
          readyState: homeVideo.readyState,
        } : null,
        continuation: {
          audienceRouting: audienceRouting ? { ...visibleGeometry(audienceRouting), inert: audienceRouting.hasAttribute("inert") } : null,
          partnerLink: visibleGeometry(partnerLink),
        },
      } : null,
      mobileMenu: menu ? { open: menu.hasAttribute("open"), expanded: menu.querySelector("summary")?.getAttribute("aria-expanded") ?? null } : null,
      maradin: maradinPlayers.map((player) => {
        const video = player.querySelector("video");
        const launch = player.querySelector("[data-maradin-play]");
        return {
          state: player.getAttribute("data-video-state"),
          hasSource: Boolean(video?.currentSrc || video?.getAttribute("src")),
          src: video?.src || null,
          currentSrc: video?.currentSrc || null,
          currentTime: Number.isFinite(video?.currentTime) ? video.currentTime : null,
          srcAttribute: video?.getAttribute("src") ?? null,
          videoNodeCount: player.querySelectorAll("video").length,
          sourceNodeCount: video?.querySelectorAll("source").length ?? 0,
          paused: video?.paused ?? null,
          readyState: video?.readyState ?? null,
          tabIndex: video?.tabIndex ?? null,
          launchHidden: launch?.hidden ?? null,
          launchDisabled: launch?.disabled ?? null,
        };
      }),
    };
  }, { sampleLabel: label, snapshotNavigationId: navigationId });
}

async function waitForRestoredHome(page, timeoutMs) {
  await page.waitForFunction(() => {
    const root = document.documentElement;
    const shell = document.querySelector("[data-cinematic-shell]");
    if (!shell) return false;
    const enhancedReady = root.dataset.cinematicMode === "enhanced"
      && shell.getAttribute("data-media-state") === "ready";
    const staticRestored = root.dataset.cinematicMode === "static"
      && root.dataset.cinematicBootstrap === "restored-scroll"
      && root.dataset.cinematicHeader === "released"
      && shell.getAttribute("data-cinematic-phase") === "fallback"
      && shell.getAttribute("data-cinematic-interactive") === "true"
      && shell.getAttribute("data-route-navigation") === "released";
    return enhancedReady || staticRestored;
  }, undefined, { timeout: timeoutMs });
}

function phase4Resources(state) {
  return (state?.probe?.resources ?? []).filter(({ url, path: resourcePath }) => phase4MediaUrl(url ?? resourcePath));
}

export function staticRestorationCoherent(state) {
  return state?.home?.mode === "static"
    && state.home.bootstrap === "restored-scroll"
    && state.home.eligibility === "bypass"
    && state.home.fallback === null
    && state.home.header === "released"
    && state.home.phase === "fallback"
    && state.home.interactive === "true"
    && state.home.routeNavigation === "released"
    && state.home.manifesto?.rendered === true
    && state.home.manifesto.text === "We turn industrial needs into field evidence."
    && state.home.continuation?.audienceRouting?.inert === false
    && state.home.source?.hasSource === false
    && state.home.source.src === null
    && state.home.source.currentSrc === null
    && state.home.source.srcAttribute === null
    && state.home.source.videoNodeCount === 1
    && state.home.source.sourceNodeCount === 0
    && state.probe?.raf?.active === 0
    && state.probe?.intervals?.active === 0
    && state.probe?.blob?.live === 0
    && Number.isFinite(state.scrollY)
    && Number.isFinite(state.maximumScroll)
    && state.scrollY > 0
    && state.scrollY <= state.maximumScroll
    && phase4Resources(state).length === 0;
}

function menuStateClosed(state) {
  return state?.mobileMenu?.open === false && state.mobileMenu.expanded === "false";
}

function attachedHomeSource(source) {
  return source?.hasSource === true
    && typeof source.src === "string" && source.src.length > 0
    && typeof source.currentSrc === "string" && source.currentSrc.length > 0
    && typeof source.srcAttribute === "string" && source.srcAttribute.length > 0
    && source.src === source.currentSrc
    && source.currentSrc === source.srcAttribute
    && source.videoNodeCount === 1
    && source.sourceNodeCount === 0;
}

export function enhancedRestorationCoherent(state, expectedBootstrap) {
  return state?.home?.mode === "enhanced"
    && state.home.bootstrap === expectedBootstrap
    && state.home.eligibility === "eligible"
    && state.home.fallback === null
    && state.home.header === "released"
    && state.home.phase === "settled"
    && state.home.interactive === "true"
    && state.home.routeNavigation === "released"
    && state.home.mediaState === "ready"
    && attachedHomeSource(state.home.source)
    && state.probe?.raf?.active === 0
    && state.probe?.intervals?.active === 0
    && state.probe?.blob?.live === 1
    && state.home.manifestoReveal === "resolved"
    && state.home.manifesto?.rendered === true
    && state.home.manifesto.text === "We turn industrial needs into field evidence."
    && state.home.continuation?.audienceRouting?.inert === false
    && menuStateClosed(state);
}

function sourceIdentityStable(before, after) {
  const beforeSource = before?.home?.source;
  const afterSource = after?.home?.source;
  return attachedHomeSource(beforeSource)
    && attachedHomeSource(afterSource)
    && beforeSource.currentSrc === afterSource.currentSrc
    && beforeSource.srcAttribute === afterSource.srcAttribute
    && beforeSource.videoNodeCount === afterSource.videoNodeCount
    && beforeSource.sourceNodeCount === afterSource.sourceNodeCount;
}

function nonemptyNavigationId(state) {
  return typeof state?.navigationId === "string"
    && state.navigationId.length > 0
    && state.navigationId !== "pre-navigation";
}

function navigationIdentityStable(before, after) {
  return nonemptyNavigationId(before)
    && nonemptyNavigationId(after)
    && before.navigationId === after.navigationId;
}

function enhancedHomeReturnResourcesCoherent(state) {
  return state?.probe?.raf?.active === 0
    && state.probe?.intervals?.active === 0
    && state.probe?.blob?.live === 1;
}

function hiddenHomeSourceCoherent(before, hidden) {
  return sourceIdentityStable(before, hidden)
    && hidden?.home?.source?.paused === true
    && hidden.probe?.raf?.active === 0
    && hidden.probe?.intervals?.active === 0
    && hidden.probe?.blob?.live === 1;
}

function homeCurrentSemanticState(state) {
  return state?.url === "/"
    && state?.home?.mode === "enhanced"
    && state.home.phase === "physical"
    && state.home.segment === "current-orbit";
}

function homeManifestoSemanticState(state) {
  return state?.url === "/"
    && state?.home?.mode === "enhanced"
    && state.home.phase === "settled"
    && state.home.manifestoReveal === "resolved"
    && state.home.manifesto?.rendered === true
    && state.home.manifesto.text === "We turn industrial needs into field evidence.";
}

function transitionStatesEvery(transition, predicate) {
  return [transition?.before, transition?.hidden, transition?.visible].every(predicate);
}

function transitionRouteStable(transition, expectedRoute) {
  const origin = transition?.before?.origin;
  return deployedSnapshotOrigin(transition?.before)
    && [transition?.before, transition?.hidden, transition?.visible].every((state) => state?.origin === origin && state.url === expectedRoute);
}

function transitionNavigationStable(transition) {
  return navigationIdentityStable(transition?.before, transition?.hidden)
    && navigationIdentityStable(transition?.hidden, transition?.visible);
}

function activeResourceIsZero(state, resource) {
  const active = state?.probe?.[resource]?.active;
  return Number.isFinite(active) ? active === 0 : null;
}

export function homeVisibilityScenarioChecks(name, transition) {
  const whenHidden = (predicate) => observedTransitionValue(transition, "hidden", predicate);
  const whenVisible = (predicate) => observedTransitionValue(transition, "visible", predicate);
  if (name === "home-current") {
    return {
      routeStateStable: whenVisible(() => transitionRouteStable(transition, "/") && transitionNavigationStable(transition)),
      currentOrbitStateStable: whenVisible(() => transitionStatesEvery(transition, homeCurrentSemanticState)),
      homeMediaPausedWhileHidden: whenHidden((state) => hiddenHomeSourceCoherent(transition.before, state)),
      noPersistentRafWhileHidden: whenHidden((state) => activeResourceIsZero(state, "raf")),
      noPersistentIntervalWhileHidden: whenHidden((state) => activeResourceIsZero(state, "intervals")),
      noStaleTargetFrameAfterReturn: whenVisible((state) => Number.isFinite(state.home?.targetFrame)
        && Number.isFinite(state.home?.presentedFrame)
        && Math.abs(state.home.targetFrame - state.home.presentedFrame) <= 1),
      sourcePresenceStableAfterReturn: whenVisible((state) => sourceIdentityStable(transition.before, transition.hidden)
        && sourceIdentityStable(transition.hidden, state)
        && enhancedHomeReturnResourcesCoherent(state)),
    };
  }
  if (name === "home-manifesto") {
    return {
      routeStateStable: whenVisible(() => transitionRouteStable(transition, "/") && transitionNavigationStable(transition)),
      manifestoStateStable: whenVisible(() => transitionStatesEvery(transition, homeManifestoSemanticState)),
      homeMediaPausedWhileHidden: whenHidden((state) => hiddenHomeSourceCoherent(transition.before, state)),
      manifestoCoherentAfterReturn: whenVisible((state) => state.home?.manifestoReveal === "resolved"
        && state.home.manifesto?.rendered === true
        && state.home.manifesto.text === "We turn industrial needs into field evidence."
        && sourceIdentityStable(transition.before, transition.hidden)
        && sourceIdentityStable(transition.hidden, state)
        && enhancedHomeReturnResourcesCoherent(state)),
      noPersistentRafWhileHidden: whenHidden((state) => activeResourceIsZero(state, "raf")),
      noPersistentIntervalWhileHidden: whenHidden((state) => activeResourceIsZero(state, "intervals")),
    };
  }
  throw new Error(`unsupported Home visibility scenario: ${name}`);
}

function eventLedgersAppendOnly(before, after) {
  const beforeEvents = before?.probe?.events;
  const afterEvents = after?.probe?.events;
  return Array.isArray(beforeEvents)
    && Array.isArray(afterEvents)
    && beforeEvents.length <= afterEvents.length
    && JSON.stringify(beforeEvents) === JSON.stringify(afterEvents.slice(0, beforeEvents.length));
}

function manifestoRevealLedgerValid(state) {
  const events = state?.probe?.manifestoRevealEvents;
  return Array.isArray(events)
    && events.every((event, index) => (
      event
      && typeof event === "object"
      && !Array.isArray(event)
      && Number.isFinite(event.atEpochMs)
      && event.atEpochMs > 0
      && event.atEpochMs <= state.capturedAtEpochMs
      && (event.value === null || typeof event.value === "string")
      && (index === 0 || event.atEpochMs >= events[index - 1].atEpochMs)
    ));
}

function manifestoRevealLedgersAppendOnly(before, after) {
  const beforeEvents = before?.probe?.manifestoRevealEvents;
  const afterEvents = after?.probe?.manifestoRevealEvents;
  return manifestoRevealLedgerValid(before)
    && manifestoRevealLedgerValid(after)
    && beforeEvents.length <= afterEvents.length
    && JSON.stringify(beforeEvents) === JSON.stringify(afterEvents.slice(0, beforeEvents.length));
}

function resolvedManifestoObserved(state) {
  const events = state?.probe?.manifestoRevealEvents;
  return manifestoRevealLedgerValid(state)
    && events.some(({ value }) => value === "resolved")
    && state.home?.manifestoReveal === "resolved";
}

function manifestoRemainedResolvedAfterDeparture(departure, restored) {
  if (!manifestoRevealLedgersAppendOnly(departure, restored)
    || !resolvedManifestoObserved(departure)
    || !resolvedManifestoObserved(restored)) return false;
  const departureEvents = departure.probe.manifestoRevealEvents;
  const postDepartureEvents = restored.probe.manifestoRevealEvents.slice(departureEvents.length);
  return postDepartureEvents.every((event) => event.atEpochMs > departure.capturedAtEpochMs
    && event.atEpochMs <= restored.capturedAtEpochMs
    && event.value === "resolved");
}

function initialEnhancedHomeCoherent(state, expectedBootstrap) {
  return state?.home?.mode === "enhanced"
    && state.home.bootstrap === expectedBootstrap
    && state.home.eligibility === "eligible"
    && state.home.fallback === null
    && state.home.mediaState === "ready"
    && attachedHomeSource(state.home.source)
    && state.probe?.blob?.live === 1
    && menuStateClosed(state);
}

function homeProgressionCoherent(initial, resolved, expectedBootstrap) {
  return Boolean(initial?.documentId)
    && initial.documentId === resolved?.documentId
    && navigationIdentityStable(initial, resolved)
    && initial.origin === resolved.origin
    && initial.url === resolved.url
    && Number.isFinite(initial.capturedAtEpochMs) && initial.capturedAtEpochMs > 0
    && Number.isFinite(resolved.capturedAtEpochMs) && resolved.capturedAtEpochMs >= initial.capturedAtEpochMs
    && Number.isSafeInteger(initial.probe?.documentEventSequence) && initial.probe.documentEventSequence >= 0
    && Number.isSafeInteger(resolved.probe?.documentEventSequence)
    && resolved.probe.documentEventSequence >= initial.probe.documentEventSequence
    && eventLedgersAppendOnly(initial, resolved)
    && manifestoRevealLedgersAppendOnly(initial, resolved)
    && resolvedManifestoObserved(resolved)
    && initialEnhancedHomeCoherent(initial, expectedBootstrap)
    && enhancedRestorationCoherent(resolved, expectedBootstrap)
    && sourceIdentityStable(initial, resolved);
}

function visibleContextRestored(before, after) {
  const beforeLink = before?.home?.continuation?.partnerLink;
  const afterLink = after?.home?.continuation?.partnerLink;
  return beforeLink?.visible === true
    && afterLink?.visible === true
    && Number.isFinite(beforeLink.top)
    && Number.isFinite(afterLink.top)
    && Math.abs(beforeLink.top - afterLink.top) <= 3;
}

async function wheelToEnd(page, timeoutMs, navigationIdForPage) {
  const started = Date.now();
  let previous = -1;
  let unchanged = 0;
  await page.mouse.move(20, 20);
  for (;;) {
    const state = await snapshot(page, "wheel-progress", navigationIdForPage(page));
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
  const bareSameDocument = Boolean(states.bareManifesto.documentId)
    && states.bareManifesto.documentId === states.bareBack.documentId;
  const bareExactRestoration = bareSameDocument
    && enhancedRestorationCoherent(states.bareBack, "eligible")
    && sourceIdentityStable(states.bareManifesto, states.bareBack)
    && navigationIdentityStable(states.bareManifesto, states.bareBack)
    && Number.isFinite(states.bareBack.scrollY)
    && Number.isFinite(states.bareManifesto.scrollY)
    && Math.abs(states.bareBack.scrollY - states.bareManifesto.scrollY) <= 2;
  const bareStaticRestoration = !bareSameDocument
    && staticRestorationCoherent(states.bareBack)
    && visibleContextRestored(states.bareManifesto, states.bareBack);
  const bareCorrect = states.bare.url === "/" && states.bare.scrollY === 0
    && states.bare.probe?.navigation?.type === "navigate"
    && states.bareManifesto.url === "/"
    && states.bareManifesto.probe?.navigation?.type === "navigate"
    && homeProgressionCoherent(states.bare, states.bareManifesto, "eligible");
  const bareBackCorrect = states.bareBack.url === "/"
    && states.bareBack.probe?.navigation?.type === "back_forward"
    && (bareExactRestoration || bareStaticRestoration);
  const bareBackNoManifestoReplay = bareSameDocument
    ? manifestoRemainedResolvedAfterDeparture(states.bareManifesto, states.bareBack)
    : null;
  const bareForwardCorrect = states.supportAfterBare.url === "/for-partners/"
    && states.supportAfterBare.probe?.navigation?.type === "navigate"
    && states.supportForward.url === "/for-partners/"
    && states.supportForward.probe?.navigation?.type === "back_forward"
    && Math.abs(states.supportForward.scrollY - states.supportAfterBare.scrollY) <= 2;
  const entryCorrect = states.entryInitial.url === "/#entry"
    && states.entryInitial.probe?.navigation?.type === "navigate"
    && states.entryResolved.url === "/#entry"
    && states.entryResolved.probe?.navigation?.type === "navigate"
    && homeProgressionCoherent(states.entryInitial, states.entryResolved, "semantic-entry");
  const entrySameDocument = Boolean(states.entryResolved.documentId)
    && states.entryResolved.documentId === states.entryBack.documentId;
  const entryBackCorrect = states.supportAfterEntry.url === "/for-partners/"
    && states.supportAfterEntry.probe?.navigation?.type === "navigate"
    && states.entryBack.url === "/#entry"
    && states.entryBack.probe?.navigation?.type === "back_forward"
    && enhancedRestorationCoherent(states.entryBack, "semantic-entry")
    && (!entrySameDocument || (sourceIdentityStable(states.entryResolved, states.entryBack)
      && navigationIdentityStable(states.entryResolved, states.entryBack)
      && manifestoRemainedResolvedAfterDeparture(states.entryResolved, states.entryBack)))
    && Number.isFinite(states.entryBack.scrollY)
    && Number.isFinite(states.entryResolved.scrollY)
    && Math.abs(states.entryBack.scrollY - states.entryResolved.scrollY) <= 2;
  const entryBackManifestoResolved = states.entryBack.home?.manifestoReveal === "resolved";
  const entryForwardCorrect = states.entryForward.url === "/for-partners/"
    && states.entryForward.probe?.navigation?.type === "back_forward"
    && Math.abs(states.entryForward.scrollY - states.supportAfterEntry.scrollY) <= 2;
  const menuClosed = [
    states.bare,
    states.bareManifesto,
    states.supportAfterBare,
    states.bareBack,
    states.supportForward,
    states.entryInitial,
    states.entryResolved,
    states.supportAfterEntry,
    states.entryBack,
    states.entryForward,
  ].every(menuStateClosed);
  return {
    bareCorrect,
    bareBackCorrect,
    bareBackNoManifestoReplay,
    bareForwardCorrect,
    entryCorrect,
    entryBackCorrect,
    entryBackManifestoResolved,
    entryForwardCorrect,
    menuClosed,
  };
}

function eventUrlMatches(event, expectedOrigin, expectedRoute) {
  try {
    const url = new URL(event.href);
    return url.protocol === "https:"
      && url.origin === expectedOrigin
      && url.search === ""
      && `${url.pathname}${url.hash}` === expectedRoute;
  }
  catch { return false; }
}

function deployedSnapshotOrigin(state) {
  try {
    const url = new URL(state?.origin);
    return url.protocol === "https:" && url.origin === state.origin;
  } catch {
    return false;
  }
}

function ledgerContainsEvent(ledger, expected) {
  const serialized = JSON.stringify(expected);
  return Array.isArray(ledger) && ledger.some((event) => JSON.stringify(event) === serialized);
}

function bfcachePairBoundToSnapshots(departure, restored, pagehide, pageshow, expectedRoute) {
  const departureEvents = departure?.probe?.events;
  const restoredEvents = restored?.probe?.events;
  if (!deployedSnapshotOrigin(departure)
    || restored?.origin !== departure.origin
    || departure.url !== expectedRoute
    || restored.url !== expectedRoute
    || !eventUrlMatches(pagehide, departure.origin, expectedRoute)
    || !eventUrlMatches(pageshow, departure.origin, expectedRoute)
    || !Number.isFinite(departure.capturedAtEpochMs) || departure.capturedAtEpochMs <= 0
    || !Number.isFinite(restored.capturedAtEpochMs) || restored.capturedAtEpochMs <= 0
    || !Number.isFinite(pagehide?.atEpochMs) || pagehide.atEpochMs <= departure.capturedAtEpochMs
    || !Number.isFinite(pageshow?.atEpochMs) || pageshow.atEpochMs <= pagehide.atEpochMs
    || pageshow.atEpochMs > restored.capturedAtEpochMs
    || !Number.isSafeInteger(departure.probe?.documentEventSequence) || departure.probe.documentEventSequence < 0
    || !Number.isSafeInteger(restored.probe?.documentEventSequence) || restored.probe.documentEventSequence < 0
    || !Number.isSafeInteger(pagehide?.documentEventSequence) || pagehide.documentEventSequence <= departure.probe.documentEventSequence
    || !Number.isSafeInteger(pageshow?.documentEventSequence) || pageshow.documentEventSequence <= pagehide.documentEventSequence
    || pageshow.documentEventSequence > restored.probe.documentEventSequence
    || !eventLedgersAppendOnly(departure, restored)
    || ledgerContainsEvent(departureEvents, pagehide)
    || ledgerContainsEvent(departureEvents, pageshow)
    || !ledgerContainsEvent(restoredEvents, pagehide)
    || !ledgerContainsEvent(restoredEvents, pageshow)) return false;
  const hideIndex = restoredEvents.findIndex((event) => JSON.stringify(event) === JSON.stringify(pagehide));
  const showIndex = restoredEvents.findIndex((event) => JSON.stringify(event) === JSON.stringify(pageshow));
  return hideIndex >= departureEvents.length && showIndex > hideIndex;
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
      if (show?.type !== "pageshow" || show.persisted !== true || show.synthetic === true || show.documentId !== state.documentId || !eventUrlMatches(show, departure.origin, expectedRoute)) continue;
      for (let hideIndex = showIndex - 1; hideIndex >= 0; hideIndex -= 1) {
        const hide = events[hideIndex];
        if (hide?.documentId !== state.documentId || !eventUrlMatches(hide, departure.origin, expectedRoute) || (hide.type !== "pagehide" && hide.type !== "pageshow")) continue;
        if (usedHideIndexes.has(hideIndex) || hide.type !== "pagehide" || hide.persisted !== true || hide.synthetic === true) break;
        usedHideIndexes.add(hideIndex);
        const expectedBootstrap = expectedRoute === "/#entry" ? "semantic-entry" : "eligible";
        const coherent = bfcachePairBoundToSnapshots(departure, state, hide, show, expectedRoute)
          && enhancedRestorationCoherent(state, expectedBootstrap)
          && sourceIdentityStable(departure, state)
          && navigationIdentityStable(departure, state)
          && manifestoRemainedResolvedAfterDeparture(departure, state)
          && Number.isFinite(state.scrollY)
          && Number.isFinite(departure.scrollY)
          && Math.abs(state.scrollY - departure.scrollY) <= 2;
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
  const status = scenarios.some(({ status: scenarioStatus }) => scenarioStatus === STATUS.FAIL)
    ? STATUS.FAIL
    : scenarios.some(({ status: scenarioStatus }) => scenarioStatus === STATUS.NOT_OBSERVED)
      ? STATUS.NOT_OBSERVED
      : STATUS.PASS;
  return {
    status,
    persistedEvents,
    pairedRestorations,
    scenarios,
    notRestoredReasons: Object.fromEntries(Object.entries(states).map(([key, state]) => [key, state.probe?.navigation?.notRestoredReasons ?? null])),
    statement: status === STATUS.PASS
      ? "Both Home routes produced snapshot-bound pagehide/pageshow persisted pairs for the same Document and remained coherent."
      : "A paired persisted Home restoration was observed but failed state-coherence checks.",
  };
}

async function runHistory(page, options, navigationIdForPage) {
  const states = {};
  await page.goto(targetUrl(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "ready", undefined, { timeout: options.timeoutMs });
  states.bare = await snapshot(page, "bare-home", navigationIdForPage(page));
  await wheelToEnd(page, options.timeoutMs, navigationIdForPage);
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: options.timeoutMs });
  const barePartner = page.locator("[data-audience-routing] a[href='/for-partners/']");
  await barePartner.scrollIntoViewIfNeeded({ timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  states.bareManifesto = await snapshot(page, "bare-home-manifesto", navigationIdForPage(page));
  await barePartner.click({ timeout: options.timeoutMs });
  await waitForUrl(page, (url) => url.pathname === "/for-partners/", options.timeoutMs);
  states.supportAfterBare = await snapshot(page, "support-after-bare", navigationIdForPage(page));
  await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  await waitForRestoredHome(page, options.timeoutMs);
  const bareBackMode = await page.evaluate(() => document.documentElement.dataset.cinematicMode ?? null);
  if (bareBackMode === "enhanced") {
    await page.waitForFunction(
      () => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved",
      undefined,
      { timeout: Math.min(options.timeoutMs, 3_000) },
    ).catch(() => false);
  }
  states.bareBack = await snapshot(page, "bare-back", navigationIdForPage(page));
  await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  states.supportForward = await snapshot(page, "support-forward", navigationIdForPage(page));

  await page.locator(".brand-link[href='/#entry']").first().click({ timeout: options.timeoutMs });
  await waitForUrl(page, (url) => url.pathname === "/" && url.hash === "#entry", options.timeoutMs);
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "ready", undefined, { timeout: options.timeoutMs });
  states.entryInitial = await snapshot(page, "entry-initial", navigationIdForPage(page));
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: options.timeoutMs });
  const entryPartner = page.locator("[data-audience-routing] a[href='/for-partners/']");
  await entryPartner.scrollIntoViewIfNeeded({ timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  states.entryResolved = await snapshot(page, "entry-resolved", navigationIdForPage(page));
  await entryPartner.click({ timeout: options.timeoutMs });
  await waitForUrl(page, (url) => url.pathname === "/for-partners/", options.timeoutMs);
  states.supportAfterEntry = await snapshot(page, "support-after-entry", navigationIdForPage(page));
  await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "ready", undefined, { timeout: options.timeoutMs });
  await page.waitForFunction(
    () => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved",
    undefined,
    { timeout: Math.min(options.timeoutMs, 3_000) },
  ).catch(() => false);
  states.entryBack = await snapshot(page, "entry-back", navigationIdForPage(page));
  await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  states.entryForward = await snapshot(page, "entry-forward", navigationIdForPage(page));

  const checks = navigationChecks(states);
  const events = states.entryForward.probe?.events ?? [];
  return { status: Object.values(checks).every((value) => value === true || value === null) ? STATUS.PASS : STATUS.FAIL, checks, events, states, bfcache: bfcacheResult(events, states) };
}

async function tabSwitch(primary, background, options, label, navigationIdForPage) {
  const transitionTimeoutMs = Math.min(options.timeoutMs, 5_000);
  await primary.bringToFront();
  const beforeVisible = await primary.waitForFunction(() => document.visibilityState === "visible", undefined, { polling: 100, timeout: transitionTimeoutMs })
    .then(() => true, () => false);
  const before = await snapshot(primary, `${label}-before`, navigationIdForPage(primary));
  await background.bringToFront();
  const hiddenReached = await primary.waitForFunction(() => document.visibilityState === "hidden", undefined, { polling: 100, timeout: transitionTimeoutMs })
    .then(() => true, () => false);
  if (hiddenReached) await primary.waitForTimeout(150);
  const hidden = await snapshot(primary, `${label}-background`, navigationIdForPage(primary));
  await primary.bringToFront();
  const visibleReached = await primary.waitForFunction(() => document.visibilityState === "visible", undefined, { polling: 100, timeout: transitionTimeoutMs })
    .then(() => true, () => false);
  if (visibleReached) await primary.waitForTimeout(150);
  const visible = await snapshot(primary, `${label}-foreground`, navigationIdForPage(primary));
  return { before, hidden, visible, waits: { beforeVisible, hiddenReached, visibleReached } };
}

export function visibilityTransitionEvidence(transition) {
  const { before, hidden, visible } = transition ?? {};
  const documentId = before?.documentId;
  const sameDocument = Boolean(documentId)
    && hidden?.documentId === documentId
    && visible?.documentId === documentId
    && deployedSnapshotOrigin(before)
    && hidden?.origin === before.origin
    && visible?.origin === before.origin
    && hidden?.url === before.url
    && visible?.url === before.url
    && navigationIdentityStable(before, hidden)
    && navigationIdentityStable(hidden, visible);
  const sequenceBound = Number.isSafeInteger(before?.probe?.documentEventSequence)
    && before.probe.documentEventSequence >= 0
    && Number.isSafeInteger(hidden?.probe?.documentEventSequence)
    && hidden.probe.documentEventSequence >= before.probe.documentEventSequence
    && Number.isSafeInteger(visible?.probe?.documentEventSequence)
    && visible.probe.documentEventSequence >= hidden.probe.documentEventSequence;
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
  const hiddenEvent = events[hiddenEventIndex];
  const visibleEvent = events[visibleEventIndex];
  const hiddenEventSequence = Number(hiddenEvent?.documentEventSequence);
  const visibleEventSequence = Number(visibleEvent?.documentEventSequence);
  const beforeEvents = before?.probe?.events;
  const hiddenEvents = hidden?.probe?.events;
  const visibleEvents = visible?.probe?.events;
  const temporalSnapshots = [before, hidden, visible].every((state) => Number.isFinite(state?.capturedAtEpochMs) && state.capturedAtEpochMs > 0);
  const appendOnlyLedgers = eventLedgersAppendOnly(before, hidden) && eventLedgersAppendOnly(hidden, visible);
  const hiddenEventBound = hiddenEventIndex >= 0
    && eventUrlMatches(hiddenEvent, before?.origin, before?.url)
    && Number.isFinite(hiddenEvent?.atEpochMs)
    && hiddenEvent.atEpochMs > before.capturedAtEpochMs
    && hiddenEvent.atEpochMs <= hidden.capturedAtEpochMs
    && hiddenEventSequence > sequenceStart
    && hiddenEventSequence <= Number(hidden?.probe?.documentEventSequence)
    && !ledgerContainsEvent(beforeEvents, hiddenEvent)
    && ledgerContainsEvent(hiddenEvents, hiddenEvent);
  const visibleEventBound = visibleEventIndex > hiddenEventIndex
    && eventUrlMatches(visibleEvent, before?.origin, before?.url)
    && Number.isFinite(visibleEvent?.atEpochMs)
    && visibleEvent.atEpochMs > hidden.capturedAtEpochMs
    && visibleEvent.atEpochMs <= visible.capturedAtEpochMs
    && visibleEventSequence > Number(hidden?.probe?.documentEventSequence)
    && visibleEventSequence <= Number(visible?.probe?.documentEventSequence)
    && !ledgerContainsEvent(hiddenEvents, visibleEvent)
    && ledgerContainsEvent(visibleEvents, visibleEvent);
  const checks = {
    sameDocument,
    sequenceBound,
    beforeVisible: before?.visibilityState === "visible",
    hiddenObserved: hidden?.visibilityState === "hidden",
    visibleRestored: visible?.visibilityState === "visible",
    orderedVisibilityEvents: hiddenEventIndex >= 0
      && visibleEventIndex > hiddenEventIndex
      && temporalSnapshots
      && appendOnlyLedgers
      && hiddenEventBound
      && visibleEventBound,
  };
  return {
    status: Object.values(checks).every(Boolean) ? STATUS.PASS : STATUS.NOT_OBSERVED,
    checks,
    transitionEvents: events,
  };
}

export function observedTransitionValue(transition, stateKey, predicate) {
  if (visibilityTransitionEvidence(transition).status !== STATUS.PASS) return null;
  const state = transition?.[stateKey];
  const expectedVisibility = stateKey === "hidden" ? "hidden" : stateKey === "visible" ? "visible" : null;
  if (!expectedVisibility || state?.visibilityState !== expectedVisibility) return null;
  return predicate(state);
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
    && media.src === null
    && media.currentSrc === null
    && media.srcAttribute === null
    && media.videoNodeCount === 1
    && media.sourceNodeCount === 0
    && media.paused === true
    && media.readyState === 0
    && media.tabIndex === -1
    && media.launchHidden === false
    && media.launchDisabled === false;
}

export function maradinSourceFreeState(state) {
  return Array.isArray(state?.maradin) && state.maradin.length === 2 && state.maradin.every(maradinMediaSourceFree);
}

function attachedMaradinMedia(media) {
  return media?.state === "active"
    && media.hasSource === true
    && typeof media.src === "string" && media.src.length > 0
    && typeof media.currentSrc === "string" && media.currentSrc.length > 0
    && typeof media.srcAttribute === "string" && media.srcAttribute.length > 0
    && media.src === media.currentSrc
    && media.currentSrc === media.srcAttribute
    && media.videoNodeCount === 1
    && media.sourceNodeCount === 0
    && media.paused === false
    && media.readyState >= 2
    && media.tabIndex === 0
    && media.launchHidden === true
    && media.launchDisabled === false;
}

export function maradinActiveState(state) {
  if (!Array.isArray(state?.maradin) || state.maradin.length !== 2 || state.probe?.blob?.live !== 1) return false;
  const active = state.maradin.filter(attachedMaradinMedia);
  const dormant = state.maradin.filter(maradinMediaSourceFree);
  return active.length === 1 && dormant.length === 1;
}

export function maradinRetryActiveState(state) {
  return maradinActiveState(state)
    && state.retryActivated === true
    && state.retryPlayback?.advanced === true
    && Number.isFinite(state.retryPlayback?.startTime)
    && Number.isFinite(state.retryPlayback?.endTime)
    && state.retryPlayback.endTime > state.retryPlayback.startTime;
}

function sameDocumentSnapshotProgression(before, after, expectedRoute) {
  return Boolean(before?.documentId)
    && after?.documentId === before.documentId
    && deployedSnapshotOrigin(before)
    && after?.origin === before.origin
    && before.url === expectedRoute
    && after.url === expectedRoute
    && navigationIdentityStable(before, after)
    && Number.isFinite(before.capturedAtEpochMs) && before.capturedAtEpochMs > 0
    && Number.isFinite(after.capturedAtEpochMs) && after.capturedAtEpochMs >= before.capturedAtEpochMs
    && Number.isSafeInteger(before.probe?.documentEventSequence) && before.probe.documentEventSequence >= 0
    && Number.isSafeInteger(after.probe?.documentEventSequence)
    && after.probe.documentEventSequence >= before.probe.documentEventSequence
    && eventLedgersAppendOnly(before, after);
}

export function maradinVisibilityScenarioChecks(name, transition, retryActive = null) {
  const whenHidden = (predicate) => observedTransitionValue(transition, "hidden", predicate);
  const whenVisible = (predicate) => observedTransitionValue(transition, "visible", predicate);
  const routeStateStable = transition == null ? null : whenVisible(() => transitionRouteStable(transition, "/pocs/maradin/") && transitionNavigationStable(transition));
  if (name === "maradin-release") {
    return {
      routeStateStable,
      activeBeforeHide: transition == null ? null : observedTransitionValue(transition, "hidden", () => maradinActiveState(transition.before)),
      sourceFreeWhileHidden: whenHidden(maradinSourceFreeState),
      sourceFreeAfterReturn: whenVisible((state) => maradinSourceFreeState(state)
        && state.probe?.blob?.live === 0
        && state.probe?.raf?.active === 0
        && state.probe?.intervals?.active === 0),
      noLiveOrphanBlobWhileHidden: whenHidden((state) => state.probe?.blob?.live === 0),
      noPersistentRafWhileHidden: whenHidden((state) => activeResourceIsZero(state, "raf")),
      noPersistentIntervalWhileHidden: whenHidden((state) => activeResourceIsZero(state, "intervals")),
    };
  }
  if (name === "maradin-retry-release") {
    return {
      routeStateStable,
      retryActivatedWithSource: retryActive == null || transition == null ? null : maradinRetryActiveState(retryActive)
        && sameDocumentSnapshotProgression(retryActive, transition.before, "/pocs/maradin/"),
      sourceFreeOnSecondHide: whenHidden(maradinSourceFreeState),
      sourceFreeAfterSecondReturn: whenVisible((state) => maradinSourceFreeState(state)
        && state.probe?.blob?.live === 0
        && state.probe?.raf?.active === 0
        && state.probe?.intervals?.active === 0),
      noLiveOrphanBlobOnSecondHide: whenHidden((state) => state.probe?.blob?.live === 0),
    };
  }
  throw new Error(`unsupported Maradin visibility scenario: ${name}`);
}

async function runVisibility(context, options, navigationIdForPage) {
  const primary = await context.newPage();
  const background = await context.newPage();
  try {
    await background.goto("about:blank");
    await primary.goto(targetUrl(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(primary, options.timeoutMs);
    await primary.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "ready", undefined, { timeout: options.timeoutMs });
    await primary.mouse.wheel(0, 900);
    await primary.waitForTimeout(350);
    const current = await tabSwitch(primary, background, options, "home-current", navigationIdForPage);
    await wheelToEnd(primary, options.timeoutMs, navigationIdForPage);
    await primary.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: options.timeoutMs });
    const manifesto = await tabSwitch(primary, background, options, "home-manifesto", navigationIdForPage);

    await primary.goto(targetUrl(options.baseUrl, "/pocs/maradin/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(primary, options.timeoutMs);
    await primary.locator("[data-maradin-play]").first().click({ timeout: options.timeoutMs });
    await primary.waitForFunction(() => {
      const players = [...document.querySelectorAll("[data-maradin-player]")];
      const active = players.filter((player) => player.getAttribute("data-video-state") === "active");
      const video = active[0]?.querySelector("video");
      return players.length === 2 && active.length === 1 && Boolean(video?.currentSrc || video?.getAttribute("src")) && video.paused === false && video.readyState >= 2;
    }, undefined, { timeout: options.timeoutMs });
    const maradin = await tabSwitch(primary, background, options, "maradin", navigationIdForPage);
    const maradinSourceFreeAfterReturn = observedTransitionValue(maradin, "visible", maradinSourceFreeState);
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
      const retryStart = await snapshot(primary, "maradin-retry-start", navigationIdForPage(primary));
      const retryStartTime = retryStart.maradin[0]?.currentTime;
      const retryAdvanced = retryActivated && Number.isFinite(retryStartTime)
        ? await primary.waitForFunction((startTime) => {
          const video = document.querySelector("[data-maradin-player] video");
          return video?.paused === false && Number.isFinite(video.currentTime) && video.currentTime >= startTime + 0.05;
        }, retryStartTime, { polling: 50, timeout: options.timeoutMs }).then(() => true, () => false)
        : false;
      retryActive = await snapshot(primary, "maradin-retry-active", navigationIdForPage(primary));
      retryActive.retryActivated = retryActivated;
      retryActive.retryPlayback = {
        advanced: retryAdvanced,
        endTime: retryActive.maradin[0]?.currentTime ?? null,
        startTime: retryStartTime ?? null,
      };
      maradinRetry = await tabSwitch(primary, background, options, "maradin-retry", navigationIdForPage);
    }

    const scenarios = [
      evaluateVisibilityScenario("home-current", current, homeVisibilityScenarioChecks("home-current", current)),
      evaluateVisibilityScenario("home-manifesto", manifesto, homeVisibilityScenarioChecks("home-manifesto", manifesto)),
      evaluateVisibilityScenario("maradin-release", maradin, maradinVisibilityScenarioChecks("maradin-release", maradin)),
      evaluateVisibilityScenario("maradin-retry-release", maradinRetry, maradinVisibilityScenarioChecks("maradin-retry-release", maradinRetry, retryActive)),
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

function validByteRange(value) {
  if (typeof value !== "string" || !/^bytes=/i.test(value)) return false;
  const ranges = value.slice(value.indexOf("=") + 1).split(",");
  if (!ranges.length) return false;
  try {
    return ranges.every((range) => {
      const match = /^\s*(\d*)-(\d*)\s*$/.exec(range);
      if (!match || (!match[1] && !match[2])) return false;
      if (!match[1]) return BigInt(match[2]) > 0n;
      if (!match[2]) return true;
      return BigInt(match[1]) <= BigInt(match[2]);
    });
  } catch {
    return false;
  }
}

function authoritativePhase4Request(request) {
  try {
    const requestUrl = new URL(request.url);
    const documentUrl = new URL(request.documentUrl);
    const documentRoute = `${documentUrl.pathname}${documentUrl.hash}`;
    return request.method === "GET"
      && request.resourceType === "fetch"
      && typeof request.frameNavigationId === "string"
      && request.frameNavigationId.length > 0
      && request.frameNavigationId !== "pre-navigation"
      && documentUrl.origin === requestUrl.origin
      && documentUrl.search === ""
      && ["/", "/#entry"].includes(documentRoute)
      && (request.range === null || validByteRange(request.range))
      && phase4MediaUrl(requestUrl.href) === request.path;
  } catch {
    return false;
  }
}

export function summarizeMediaTelemetry(records, snapshotInput) {
  const snapshots = Array.isArray(snapshotInput) ? snapshotInput : collectLifecycleSnapshots(snapshotInput);
  const homeDocuments = new Map();
  for (const state of snapshots) {
    if (!state.home || !state.documentId) continue;
    const document = homeDocuments.get(state.documentId) ?? {
      documentId: state.documentId,
      labels: new Set(),
      modes: new Set(),
      observations: new Set(),
      paths: new Set(),
      selectionDocumentUrl: null,
      selectionNavigationId: null,
      selectionStable: true,
      sourceObserved: false,
    };
    document.labels.add(state.label);
    if (typeof state.home.mode === "string") document.modes.add(state.home.mode);
    if (state.home.source?.hasSource === true) document.sourceObserved = true;
    for (const resource of state.probe?.resources ?? []) {
      const mediaUrl = phase4MediaUrl(resource.url ?? resource.path);
      if (!mediaUrl) continue;
      document.paths.add(mediaUrl);
      document.observations.add(`${mediaUrl}\u0000${Number(resource.startTime ?? -1)}`);
      let selectionDocumentUrl = null;
      try { selectionDocumentUrl = new URL(state.url, state.origin).href; } catch { /* invalidated below */ }
      if (document.selectionNavigationId === null) {
        document.selectionNavigationId = state.navigationId ?? null;
        document.selectionDocumentUrl = selectionDocumentUrl;
      } else if (document.selectionNavigationId !== state.navigationId || document.selectionDocumentUrl !== selectionDocumentUrl) {
        document.selectionStable = false;
      }
    }
    homeDocuments.set(state.documentId, document);
  }
  const documents = [...homeDocuments.values()].map((document) => {
    const modes = [...document.modes].sort();
    const paths = [...document.paths].sort();
    const mediaExpected = modes.includes("enhanced") || (modes.length === 0 && paths.length > 0);
    return {
      documentId: document.documentId,
      labels: [...document.labels].sort(),
      mediaExpected,
      modes,
      paths,
      resourceObservations: document.observations.size,
      selectionDocumentUrl: document.selectionDocumentUrl,
      selectionNavigationId: document.selectionNavigationId,
      selectionStable: document.selectionStable,
      sourceFree: !document.sourceObserved,
    };
  }).sort((left, right) => left.documentId.localeCompare(right.documentId));
  const phase4Requests = records.filter(({ path: requestPath }) => phase4MediaUrl(requestPath));
  const expectedDocuments = documents.filter(({ mediaExpected }) => mediaExpected);
  const enhancedMediaDocuments = documents.filter(({ modes }) => modes.includes("enhanced"));
  const bypassDocuments = documents.filter(({ mediaExpected }) => !mediaExpected);
  const bypassDocumentsSourceFree = bypassDocuments.every(({ modes, paths, sourceFree }) => (
    modes.length === 1 && modes[0] === "static" && paths.length === 0 && sourceFree
  ));
  const noDuplicateSourceWithinDocument = documents.length > 0 && documents.every(({ mediaExpected, paths }) => (
    mediaExpected ? paths.length === 1 : paths.length === 0
  ));
  const uniqueNetworkPaths = [...new Set(phase4Requests.map(({ path: requestPath }) => phase4MediaUrl(requestPath)).filter(Boolean))].sort();
  const selectedPaths = [...new Set(documents.flatMap(({ paths }) => paths))].sort();
  const selectedPathsMatchNetwork = selectedPaths.length === uniqueNetworkPaths.length
    && selectedPaths.every((selectedPath, index) => selectedPath === uniqueNetworkPaths[index]);
  const selectingDocumentsByPath = new Map();
  for (const document of documents) {
    for (const selectedPath of document.paths) {
      selectingDocumentsByPath.set(selectedPath, (selectingDocumentsByPath.get(selectedPath) ?? 0) + 1);
    }
  }
  const expectedSelectionIds = expectedDocuments.map(({ selectionNavigationId }) => selectionNavigationId);
  const uniqueExpectedSelectionIds = new Set(expectedSelectionIds);
  const selectionKeys = new Map();
  for (const document of expectedDocuments) {
    for (const selectedPath of document.paths) {
      const key = `${document.selectionNavigationId}\u0000${selectedPath}`;
      const selection = selectionKeys.get(key) ?? { count: 0, documentUrl: document.selectionDocumentUrl };
      selection.count += 1;
      if (selection.documentUrl !== document.selectionDocumentUrl) selection.documentUrl = null;
      selectionKeys.set(key, selection);
    }
  }
  const navigationIdsByPath = new Map();
  const nonRangeRequestsByNavigationPath = new Map();
  for (const request of phase4Requests) {
    const requestPath = phase4MediaUrl(request.path);
    const navigationIds = navigationIdsByPath.get(requestPath) ?? new Set();
    navigationIds.add(request.frameNavigationId);
    navigationIdsByPath.set(requestPath, navigationIds);
    if (!validByteRange(request.range)) {
      const key = `${request.frameNavigationId}\u0000${requestPath}`;
      nonRangeRequestsByNavigationPath.set(key, (nonRangeRequestsByNavigationPath.get(key) ?? 0) + 1);
    }
  }
  const requestAuthorityValid = phase4Requests.every(authoritativePhase4Request);
  const navigationCoverageValid = expectedSelectionIds.every((navigationId) => typeof navigationId === "string" && navigationId.length > 0 && navigationId !== "pre-navigation")
    && expectedDocuments.length === enhancedMediaDocuments.length
    && expectedDocuments.every(({ selectionDocumentUrl, selectionStable }) => typeof selectionDocumentUrl === "string" && selectionDocumentUrl.length > 0 && selectionStable)
    && uniqueExpectedSelectionIds.size === expectedDocuments.length
    && selectionKeys.size === expectedDocuments.length
    && [...selectionKeys.values()].every(({ count, documentUrl }) => count === 1 && typeof documentUrl === "string")
    && phase4Requests.every((request) => {
      const selection = selectionKeys.get(`${request.frameNavigationId}\u0000${phase4MediaUrl(request.path)}`);
      try { return selection?.count === 1 && new URL(request.documentUrl).href === selection.documentUrl; }
      catch { return false; }
    })
    && [...selectionKeys.keys()].every((key) => phase4Requests.some((request) => `${request.frameNavigationId}\u0000${phase4MediaUrl(request.path)}` === key))
    && selectedPaths.every((selectedPath) => navigationIdsByPath.get(selectedPath)?.size === selectingDocumentsByPath.get(selectedPath));
  const expectedPhase4Present = expectedDocuments.length > 0
    && expectedDocuments.every(({ paths }) => paths.length >= 1)
    && phase4Requests.length >= 1
    && selectedPathsMatchNetwork
    && requestAuthorityValid
    && navigationCoverageValid;
  const nonRangeRequestsByPath = new Map();
  for (const request of phase4Requests) {
    if (validByteRange(request.range)) continue;
    const requestPath = phase4MediaUrl(request.path);
    nonRangeRequestsByPath.set(requestPath, (nonRangeRequestsByPath.get(requestPath) ?? 0) + 1);
  }
  const nonRangeSelections = [...nonRangeRequestsByPath.entries()].map(([requestPath, count]) => ({
    path: requestPath,
    count,
    logicalHomeDocuments: selectingDocumentsByPath.get(requestPath) ?? 0,
  })).sort((left, right) => left.path.localeCompare(right.path));
  const noDuplicateNonRangeRequests = nonRangeSelections.every(({ count, logicalHomeDocuments }) => count <= logicalHomeDocuments)
    && [...nonRangeRequestsByNavigationPath.values()].every((count) => count <= 1);
  return {
    status: expectedPhase4Present && bypassDocumentsSourceFree && noDuplicateSourceWithinDocument && noDuplicateNonRangeRequests ? STATUS.PASS : STATUS.FAIL,
    bypassDocumentsSourceFree,
    expectedPhase4Present,
    noDuplicateSourceWithinDocument,
    noDuplicateNonRangeRequests,
    documents,
    network: {
      phase4Requests,
      requestCount: phase4Requests.length,
      rangeRequestCount: phase4Requests.filter(({ range }) => validByteRange(range)).length,
      nonRangeRequestCount: phase4Requests.filter(({ range }) => !validByteRange(range)).length,
      nonRangeSelections,
      uniquePaths: uniqueNetworkPaths,
      interpretation: "Repeated HTTP range requests for one selected path are telemetry. Non-range selections may occur at most once per logical Home Document selecting that exact path.",
    },
  };
}

function listenerSnapshot(state) {
  const listeners = state?.probe?.listeners;
  const activeByType = listeners?.activeByType;
  if (!listeners
    || ![listeners.active, listeners.added, listeners.removed, listeners.duplicateAttempts].every((value) => Number.isSafeInteger(value) && value >= 0)
    || !listeners.activeByType
    || typeof listeners.activeByType !== "object"
    || Array.isArray(listeners.activeByType)
    || Object.values(activeByType).some((value) => !Number.isSafeInteger(value) || value < 0)
    || listeners.active !== Object.values(activeByType).reduce((sum, value) => sum + value, 0)
    || listeners.active !== listeners.added - listeners.removed) return null;
  return {
    active: listeners.active,
    activeByType: listeners.activeByType,
    added: listeners.added,
    duplicateAttempts: listeners.duplicateAttempts,
    removed: listeners.removed,
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
  if (after.added < before.added) failures.push("listener-added-counter-decreased");
  if (after.removed < before.removed) failures.push("listener-removed-counter-decreased");
  if (after.duplicateAttempts < before.duplicateAttempts) failures.push("listener-duplicate-counter-decreased");
  return failures;
}

function lifecycleResourceKey(resource) {
  if (!resource || typeof resource !== "object" || Array.isArray(resource)
    || !Number.isFinite(resource.startTime) || resource.startTime < 0) return null;
  try {
    const value = resource.url ?? resource.path;
    if (typeof value !== "string" || !value) return null;
    return `${new URL(value, TEST_RESOURCE_ORIGIN).href}\u0000${resource.startTime}`;
  } catch {
    return null;
  }
}

const TEST_RESOURCE_ORIGIN = "https://phase6.invalid/";

function cumulativeTelemetryFailures(before, after) {
  if (!before?.probe || !after?.probe || before.documentId !== after.documentId) return ["same-document-telemetry-unavailable"];
  const failures = [];
  const cumulativeFields = [
    ["raf", "scheduled"], ["raf", "executed"], ["raf", "cancelled"],
    ["intervals", "created"], ["intervals", "cleared"],
    ["blob", "created"], ["blob", "revoked"],
    ["listeners", "added"], ["listeners", "removed"], ["listeners", "duplicateAttempts"],
  ];
  for (const [section, field] of cumulativeFields) {
    if (after.probe?.[section]?.[field] < before.probe?.[section]?.[field]) failures.push(`${section}-${field}-counter-decreased`);
  }
  const beforeKeys = (before.probe.resources ?? []).map(lifecycleResourceKey);
  const afterKeys = new Set((after.probe.resources ?? []).map(lifecycleResourceKey));
  if (beforeKeys.includes(null) || afterKeys.has(null)) failures.push("resource-ledger-invalid");
  else if (beforeKeys.some((key) => !afterKeys.has(key))) failures.push("resource-observation-disappeared");
  return failures;
}

function chronologicalSameDocumentPairs(snapshots) {
  const indexed = snapshots.map((state, index) => ({ index, state }));
  const groups = new Map();
  for (const item of indexed) {
    if (!item.state?.documentId) continue;
    const group = groups.get(item.state.documentId) ?? [];
    group.push(item);
    groups.set(item.state.documentId, group);
  }
  return [...groups.entries()].flatMap(([documentId, group]) => {
    group.sort((left, right) => left.state.capturedAtEpochMs - right.state.capturedAtEpochMs || left.index - right.index);
    return group.slice(1).map((item, index) => ({
      after: item.state,
      before: group[index].state,
      documentId,
    }));
  });
}

export function summarizeListenerTelemetry(history, visibility) {
  const snapshots = collectLifecycleSnapshots({ history, visibility });
  const invalidCounterSnapshots = snapshots.filter((state) => {
    const listenersValid = listenerSnapshot(state) !== null;
    const raf = state.probe?.raf;
    const intervals = state.probe?.intervals;
    const blob = state.probe?.blob;
    const safeCounters = (record, keys) => record && keys.every((key) => Number.isSafeInteger(record[key]) && record[key] >= 0);
    return !listenersValid
      || !safeCounters(raf, ["scheduled", "executed", "cancelled", "active"])
      || raf.active !== raf.scheduled - raf.executed - raf.cancelled
      || !safeCounters(intervals, ["created", "cleared", "active"])
      || intervals.active !== intervals.created - intervals.cleared
      || !safeCounters(blob, ["created", "revoked", "live"])
      || blob.live !== blob.created - blob.revoked;
  });
  const duplicateDocuments = [...new Map(snapshots.filter((state) => (state.probe?.listeners?.duplicateAttempts ?? 0) > 0)
    .map((state) => [state.documentId, {
      documentId: state.documentId,
      duplicateAttempts: state.probe.listeners.duplicateAttempts,
      label: state.label,
    }])).values()];
  const telemetryRegressions = chronologicalSameDocumentPairs(snapshots).flatMap(({ before, after, documentId }) => {
    const failures = cumulativeTelemetryFailures(before, after);
    return failures.length ? [{ after: after.label, before: before.label, documentId, failures }] : [];
  });
  const candidatePairs = [
    ["bare-back", history?.states?.bareManifesto, history?.states?.bareBack],
    ["entry-back", history?.states?.entryResolved, history?.states?.entryBack],
    ...(visibility?.scenarios ?? [])
      .filter((scenario) => scenario.observation?.status === STATUS.PASS)
      .flatMap((scenario) => [
        [`${scenario.name}-hidden`, scenario.transition?.before, scenario.transition?.hidden],
        [`${scenario.name}-foreground`, scenario.transition?.hidden, scenario.transition?.visible],
      ]),
  ];
  const comparisons = candidatePairs.flatMap(([name, beforeState, afterState]) => {
    if (!beforeState?.documentId || beforeState.documentId !== afterState?.documentId) return [];
    const before = listenerSnapshot(beforeState);
    const after = listenerSnapshot(afterState);
    const failures = listenerGrowth(before, after);
    return [{ name, documentId: beforeState.documentId, before, after, failures, stable: failures.length === 0 }];
  });
  const failed = invalidCounterSnapshots.length > 0 || duplicateDocuments.length > 0 || telemetryRegressions.length > 0 || comparisons.some(({ stable }) => !stable);
  return {
    status: failed ? STATUS.FAIL : comparisons.length > 0 ? STATUS.PASS : STATUS.NOT_OBSERVED,
    duplicateDocuments,
    comparisons,
    telemetryRegressions,
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
  const frameRouteNavigationIds = new WeakMap();
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
        if (frame !== page.mainFrame()) return;
        let route = frame.url();
        try {
          const url = new URL(route);
          route = `${url.pathname}${url.hash}`;
        } catch { /* non-URL frame state gets its own opaque key */ }
        const routeIds = frameRouteNavigationIds.get(frame) ?? new Map();
        if (!routeIds.has(route)) routeIds.set(route, `navigation-${++nextNavigationId}`);
        frameRouteNavigationIds.set(frame, routeIds);
        frameNavigationIds.set(frame, routeIds.get(route));
      });
    };
    for (const page of context.pages()) registerPage(page);
    context.on("page", registerPage);
    const navigationIdForPage = (page) => frameNavigationIds.get(page.mainFrame()) ?? null;
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
        url: request.url(),
      });
    });
    const pages = context.pages();
    const page = pages[0] ?? await context.newPage();
    const history = await runHistory(page, options, navigationIdForPage);
    await page.close();
    const visibility = await runVisibility(context, options, navigationIdForPage);
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
