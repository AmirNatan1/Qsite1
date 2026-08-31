import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ROOT,
  SCHEMA,
  STATUS,
  aggregateVisibilityScenarios,
  assertExternalPath,
  bfcacheResult,
  bindRequestDocumentIdentity,
  deriveTopLevelStatus,
  evaluateVisibilityScenario,
  homeVisibilityScenarioChecks,
  maradinActiveState,
  maradinRetryActiveState,
  maradinVisibilityScenarioChecks,
  maradinSourceFreeState,
  navigationChecks,
  normalizeBaseUrl,
  observedTransitionValue,
  parseArguments,
  profileCleanupResult,
  runSelfTest,
  summarizeListenerTelemetry,
  summarizeMediaTelemetry,
  validateOptions,
  visibilityTransitionEvidence,
} from "../scripts/qa-phase6-r1-persistent-lifecycle.mjs";

const TEST_ORIGIN = "https://example.pages.dev";
const TEST_EPOCH = 1_800_000_000_000;
let snapshotSequence = 0;

function probe(documentId, overrides = {}) {
  const defaults = {
    documentId,
    documentEventSequence: 0,
    events: [],
    manifestoRevealEvents: [{ atEpochMs: TEST_EPOCH + 1, value: "resolved" }],
    blob: { created: 1, revoked: 0, live: 1 },
    intervals: { created: 0, cleared: 0, active: 0 },
    listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 3, duplicateAttempts: 0, removed: 0 },
    navigation: { type: "navigate", notRestoredReasons: null },
    raf: { scheduled: 0, executed: 0, cancelled: 0, active: 0 },
    resources: [],
  };
  return {
    ...defaults,
    ...overrides,
    blob: { ...defaults.blob, ...overrides.blob },
    intervals: { ...defaults.intervals, ...overrides.intervals },
    listeners: {
      ...defaults.listeners,
      ...overrides.listeners,
      activeByType: overrides.listeners?.activeByType ?? defaults.listeners.activeByType,
    },
    navigation: { ...defaults.navigation, ...overrides.navigation },
    raf: { ...defaults.raf, ...overrides.raf },
  };
}

function snapshot(label, documentId, overrides = {}) {
  return {
    capturedAtEpochMs: TEST_EPOCH + (++snapshotSequence * 100),
    documentId,
    home: null,
    label,
    maradin: [],
    maximumScroll: 1_000,
    mobileMenu: { open: false, expanded: "false" },
    navigationId: `navigation-${documentId}`,
    origin: TEST_ORIGIN,
    probe: probe(documentId, { blob: { created: 0, revoked: 0, live: 0 } }),
    scrollY: 0,
    url: "/",
    visibilityState: "visible",
    ...overrides,
  };
}

function homeState(label, documentId, url = "/", overrides = {}) {
  const homeDefaults = {
    bootstrap: url === "/#entry" ? "semantic-entry" : "eligible",
    continuation: { audienceRouting: { inert: false }, partnerLink: { top: 100, visible: true } },
    eligibility: "eligible",
    fallback: null,
    header: "released",
    interactive: "true",
    manifesto: { rendered: true, text: "We turn industrial needs into field evidence." },
    manifestoReveal: "resolved",
    mediaState: "ready",
    mode: "enhanced",
    phase: "settled",
    routeNavigation: "released",
    source: {
      hasSource: true,
      src: `blob:https://example.pages.dev/${documentId}`,
      currentSrc: `blob:https://example.pages.dev/${documentId}`,
      srcAttribute: `blob:https://example.pages.dev/${documentId}`,
      videoNodeCount: 1,
      sourceNodeCount: 0,
      paused: true,
      readyState: 4,
    },
  };
  const homeOverrides = overrides.home ?? {};
  return snapshot(label, documentId, {
    url,
    ...overrides,
    probe: overrides.probe ?? probe(documentId),
    home: {
      ...homeDefaults,
      ...homeOverrides,
      continuation: {
        ...homeDefaults.continuation,
        ...homeOverrides.continuation,
        audienceRouting: { ...homeDefaults.continuation.audienceRouting, ...homeOverrides.continuation?.audienceRouting },
        partnerLink: { ...homeDefaults.continuation.partnerLink, ...homeOverrides.continuation?.partnerLink },
      },
      manifesto: { ...homeDefaults.manifesto, ...homeOverrides.manifesto },
      source: { ...homeDefaults.source, ...homeOverrides.source },
    },
  });
}

function lifecycleEvent(type, documentId, route, persisted = true, documentEventSequence = 1, atEpochMs = TEST_EPOCH + (documentEventSequence * 10)) {
  return {
    atEpochMs,
    documentEventSequence,
    documentId,
    href: `https://example.pages.dev${route}`,
    persisted,
    type,
    visibilityState: "visible",
  };
}

function mediaRequest(requestPath, range, frameNavigationId = "navigation-home-document", overrides = {}) {
  const inferredDocumentId = frameNavigationId.startsWith("navigation-")
    ? frameNavigationId.slice("navigation-".length)
    : null;
  const documentUrl = overrides.documentUrl ?? "https://example.pages.dev/";
  const inferredGeneration = inferredDocumentId === "entry-document" ? 2 : 1;
  return {
    correlatedDocumentUrl: overrides.correlatedDocumentUrl ?? documentUrl,
    documentIdentityCorrelation: "CORRELATED",
    documentUrl,
    frameDocumentGeneration: overrides.frameDocumentGeneration ?? inferredGeneration,
    frameDocumentId: inferredDocumentId,
    frameNavigationId,
    method: "GET",
    path: requestPath,
    range,
    resourceType: "fetch",
    url: `https://example.pages.dev${requestPath}`,
    ...overrides,
  };
}

function visibilityTransition(documentId = "visibility-document") {
  const before = snapshot("before", documentId, {
    capturedAtEpochMs: TEST_EPOCH + 10,
    probe: probe(documentId, { documentEventSequence: 3 }),
    visibilityState: "visible",
  });
  const hiddenEvent = { ...lifecycleEvent("visibilitychange", documentId, "/", null, 4, TEST_EPOCH + 20), visibilityState: "hidden" };
  const visibleEvent = { ...lifecycleEvent("visibilitychange", documentId, "/", null, 5, TEST_EPOCH + 40), visibilityState: "visible" };
  const hidden = snapshot("hidden", documentId, {
    capturedAtEpochMs: TEST_EPOCH + 30,
    probe: probe(documentId, { documentEventSequence: 4, events: [hiddenEvent] }),
    visibilityState: "hidden",
  });
  const visible = snapshot("visible", documentId, {
    capturedAtEpochMs: TEST_EPOCH + 50,
    probe: probe(documentId, { documentEventSequence: 5, events: [hiddenEvent, visibleEvent] }),
    visibilityState: "visible",
  });
  return { before, hidden, visible };
}

function homeVisibilityTransition(name) {
  const documentId = `${name}-document`;
  const transition = visibilityTransition(documentId);
  const semanticHome = homeState(`${name}-semantic`, documentId).home;
  if (name === "home-current") {
    semanticHome.phase = "physical";
    semanticHome.segment = "current-orbit";
  }
  for (const key of ["before", "hidden", "visible"]) {
    transition[key].home = structuredClone(semanticHome);
    transition[key].url = "/";
    transition[key].home.targetFrame = 42;
    transition[key].home.presentedFrame = 42;
  }
  transition.hidden.home.source.paused = true;
  return transition;
}

function dormantMaradin() {
  return {
    currentSrc: null,
    hasSource: false,
    launchDisabled: false,
    launchHidden: false,
    paused: true,
    readyState: 0,
    src: null,
    srcAttribute: null,
    state: "dormant",
    tabIndex: -1,
    videoNodeCount: 1,
    sourceNodeCount: 0,
  };
}

function activeMaradin() {
  return {
    currentSrc: "https://example.pages.dev/media/maradin.mp4",
    currentTime: 0.2,
    hasSource: true,
    launchDisabled: false,
    launchHidden: true,
    paused: false,
    readyState: 3,
    src: "https://example.pages.dev/media/maradin.mp4",
    srcAttribute: "https://example.pages.dev/media/maradin.mp4",
    state: "active",
    tabIndex: 0,
    videoNodeCount: 1,
    sourceNodeCount: 0,
  };
}

function maradinVisibilityTransition(documentId = "maradin-visibility-document") {
  const transition = visibilityTransition(documentId);
  for (const key of ["before", "hidden", "visible"]) transition[key].url = "/pocs/maradin/";
  for (const event of [...transition.hidden.probe.events, ...transition.visible.probe.events]) {
    event.href = "https://example.pages.dev/pocs/maradin/";
  }
  transition.before.maradin = [activeMaradin(), dormantMaradin()];
  for (const key of ["hidden", "visible"]) {
    transition[key].maradin = [dormantMaradin(), dormantMaradin()];
    transition[key].probe.blob = { created: 1, revoked: 1, live: 0 };
  }
  return transition;
}

test("persistent lifecycle exposes only honest top-level and observation statuses", () => {
  assert.deepEqual(STATUS, { PASS: "PASS", FAIL: "FAIL", LIMITATION: "LIMITATION", NOT_OBSERVED: "NOT OBSERVED" });
  assert.deepEqual(runSelfTest(), { schema: `${SCHEMA}.self-test`, status: "PASS", persistentProfile: true, syntheticLifecycle: false });
  assert.equal(deriveTopLevelStatus([STATUS.PASS, STATUS.PASS]), STATUS.PASS);
  assert.equal(deriveTopLevelStatus([STATUS.PASS, STATUS.NOT_OBSERVED]), STATUS.LIMITATION);
  assert.equal(deriveTopLevelStatus([STATUS.PASS, STATUS.FAIL, STATUS.NOT_OBSERVED]), STATUS.FAIL);
  assert.equal(deriveTopLevelStatus([STATUS.PASS, undefined]), STATUS.FAIL);
});

test("persistent lifecycle accepts only a deployed HTTPS origin and external JSON output", () => {
  assert.equal(normalizeBaseUrl("https://example.pages.dev"), "https://example.pages.dev/");
  assert.throws(() => normalizeBaseUrl("http://127.0.0.1:4338"), /deployed HTTPS/);
  assert.throws(() => normalizeBaseUrl("https://user@example.com"), /deployed HTTPS/);
  const output = path.resolve(ROOT, "..", "phase-6-r1-lifecycle", "report.json");
  const options = validateOptions(parseArguments(["--base-url", "https://example.pages.dev", "--output", output, "--headless"]));
  assert.equal(options.output, output);
  assert.equal(options.headed, false);
  assert.throws(() => assertExternalPath(path.join(ROOT, "artifacts", "report.json"), "output"), /outside the repository/);
  assert.throws(() => assertExternalPath(path.join(os.tmpdir(), "report.json"), "output"), /temporary storage/);
});

test("ordinary history requires both Forward destinations, restored manifesto state, and Back state", () => {
  const states = {
    bare: homeState("bare", "bare", "/"),
    bareManifesto: homeState("bare-manifesto", "bare", "/", { scrollY: 800 }),
    bareBack: homeState("bare-back", "bare", "/", { probe: probe("bare", { navigation: { type: "back_forward", notRestoredReasons: null } }), scrollY: 800 }),
    supportAfterBare: snapshot("support-bare", "support-a", { url: "/for-partners/", scrollY: 40 }),
    supportForward: snapshot("support-forward", "support-a", { probe: probe("support-a", { navigation: { type: "back_forward", notRestoredReasons: null } }), url: "/for-partners/", scrollY: 40 }),
    entryInitial: homeState("entry-initial", "entry", "/#entry", { scrollY: 900 }),
    entryResolved: homeState("entry", "entry", "/#entry", { scrollY: 900 }),
    entryBack: homeState("entry-back", "entry", "/#entry", { probe: probe("entry", { navigation: { type: "back_forward", notRestoredReasons: null } }), scrollY: 900 }),
    supportAfterEntry: snapshot("support-entry", "support-b", { url: "/for-partners/", scrollY: 20 }),
    entryForward: snapshot("entry-forward", "support-b", { probe: probe("support-b", { navigation: { type: "back_forward", notRestoredReasons: null } }), url: "/for-partners/", scrollY: 20 }),
  };
  assert.ok(Object.values(navigationChecks(states)).every(Boolean));
  const routeAndNavigationMatrix = {
    bare: ["/", "navigate"],
    bareManifesto: ["/", "navigate"],
    supportAfterBare: ["/for-partners/", "navigate"],
    bareBack: ["/", "back_forward"],
    supportForward: ["/for-partners/", "back_forward"],
    entryInitial: ["/#entry", "navigate"],
    entryResolved: ["/#entry", "navigate"],
    supportAfterEntry: ["/for-partners/", "navigate"],
    entryBack: ["/#entry", "back_forward"],
    entryForward: ["/for-partners/", "back_forward"],
  };
  for (const [stateKey, [expectedUrl, expectedNavigationType]] of Object.entries(routeAndNavigationMatrix)) {
    const wrongUrl = structuredClone(states);
    wrongUrl[stateKey].url = `${expectedUrl}wrong`;
    assert.ok(Object.values(navigationChecks(wrongUrl)).some((value) => value === false), `${stateKey} URL was not bound`);
    const wrongNavigation = structuredClone(states);
    wrongNavigation[stateKey].probe.navigation.type = expectedNavigationType === "navigate" ? "back_forward" : "navigate";
    assert.ok(Object.values(navigationChecks(wrongNavigation)).some((value) => value === false), `${stateKey} navigation type was not bound`);
    for (const mutation of [{ open: true, expanded: "true" }, { open: false, expanded: "true" }]) {
      const wrongMenu = structuredClone(states);
      wrongMenu[stateKey].mobileMenu = mutation;
      assert.equal(navigationChecks(wrongMenu).menuClosed, false, `${stateKey} menu state was not bound`);
    }
  }
  assert.equal(navigationChecks({ ...states, supportForward: { ...states.supportForward, url: "/wrong/" } }).bareForwardCorrect, false);
  assert.equal(navigationChecks({ ...states, entryForward: { ...states.entryForward, scrollY: 200 } }).entryForwardCorrect, false);
  assert.equal(navigationChecks({
    ...states,
    bareBack: homeState("bare-back-hidden", "bare", "/", {
      home: { manifestoReveal: "hidden", source: { hasSource: true, paused: true } },
      scrollY: 800,
    }),
  }).bareBackNoManifestoReplay, false);
  assert.equal(navigationChecks({
    ...states,
    entryBack: homeState("entry-back-hidden", "entry", "/#entry", {
      home: { manifestoReveal: "hidden", source: { hasSource: true, paused: true } },
      scrollY: 900,
    }),
  }).entryBackManifestoResolved, false);
  const strictRestorationMutations = [
    (state) => { state.home.mode = "static"; },
    (state) => { state.home.bootstrap = "restored-scroll"; },
    (state) => { state.home.eligibility = "bypass"; },
    (state) => { state.home.fallback = "media"; },
    (state) => { state.home.mediaState = "loading"; },
    (state) => { state.home.source.hasSource = false; },
    (state) => { state.home.source.currentSrc = "blob:https://example.pages.dev/different"; },
    (state) => { state.home.source.srcAttribute = "blob:https://example.pages.dev/different"; },
    (state) => { state.home.source.videoNodeCount = 2; },
    (state) => { state.home.source.sourceNodeCount = 1; },
    (state) => { state.home.manifestoReveal = "hidden"; },
    (state) => { state.home.manifesto.rendered = false; },
    (state) => { state.home.manifesto.text = "Wrong manifesto"; },
    (state) => { state.home.interactive = "false"; },
    (state) => { state.home.routeNavigation = "concealed"; },
    (state) => { state.home.header = "concealed"; },
    (state) => { state.home.phase = "current"; },
  ];
  for (const restorationKey of ["bareBack", "entryBack"]) {
    for (const mutate of strictRestorationMutations) {
      const contradiction = structuredClone(states);
      mutate(contradiction[restorationKey]);
      const check = restorationKey === "bareBack" ? "bareBackCorrect" : "entryBackCorrect";
      assert.equal(navigationChecks(contradiction)[check], false, `${restorationKey} accepted an incoherent enhanced restoration`);
    }
  }
  for (const [initialKey, resolvedKey, check] of [
    ["bare", "bareManifesto", "bareCorrect"],
    ["entryInitial", "entryResolved", "entryCorrect"],
  ]) {
    const differentDocument = structuredClone(states);
    differentDocument[resolvedKey].documentId = `${differentDocument[resolvedKey].documentId}-other`;
    assert.equal(navigationChecks(differentDocument)[check], false, `${resolvedKey} document identity was not bound`);
    const changedSource = structuredClone(states);
    changedSource[resolvedKey].home.source.currentSrc = "blob:https://example.pages.dev/replaced";
    assert.equal(navigationChecks(changedSource)[check], false, `${resolvedKey} source identity was not bound`);
    const changedNavigation = structuredClone(states);
    changedNavigation[resolvedKey].navigationId = `${changedNavigation[resolvedKey].navigationId}-other`;
    assert.equal(navigationChecks(changedNavigation)[check], false, `${resolvedKey} navigation identity was not bound`);
    const initialNotReady = structuredClone(states);
    initialNotReady[initialKey].home.mediaState = "loading";
    assert.equal(navigationChecks(initialNotReady)[check], false, `${initialKey} ready state was not bound`);
    const initialSourceFree = structuredClone(states);
    initialSourceFree[initialKey].home.source.hasSource = false;
    assert.equal(navigationChecks(initialSourceFree)[check], false, `${initialKey} source presence was not bound`);
    const resolvedNotManifesto = structuredClone(states);
    resolvedNotManifesto[resolvedKey].home.manifesto.rendered = false;
    assert.equal(navigationChecks(resolvedNotManifesto)[check], false, `${resolvedKey} manifesto departure was not bound`);
    const reversedCapture = structuredClone(states);
    reversedCapture[resolvedKey].capturedAtEpochMs = reversedCapture[initialKey].capturedAtEpochMs - 1;
    assert.equal(navigationChecks(reversedCapture)[check], false, `${initialKey} to ${resolvedKey} chronology was not bound`);
    const nonPrefixEvents = structuredClone(states);
    nonPrefixEvents[initialKey].probe.events = [lifecycleEvent("popstate", nonPrefixEvents[initialKey].documentId, nonPrefixEvents[initialKey].url, null, 1)];
    nonPrefixEvents[initialKey].probe.documentEventSequence = 1;
    assert.equal(navigationChecks(nonPrefixEvents)[check], false, `${initialKey} to ${resolvedKey} event prefix was not bound`);
  }
  for (const [departureKey, restoredKey, check] of [
    ["bareManifesto", "bareBack", "bareBackNoManifestoReplay"],
    ["entryResolved", "entryBack", "entryBackCorrect"],
  ]) {
    const replayed = structuredClone(states);
    replayed[restoredKey].probe.manifestoRevealEvents.push({
      atEpochMs: replayed[departureKey].capturedAtEpochMs + 1,
      value: "hidden",
    });
    assert.equal(navigationChecks(replayed)[check], false, `${restoredKey} accepted a post-departure manifesto replay`);
    const detachedLedger = structuredClone(states);
    detachedLedger[restoredKey].probe.manifestoRevealEvents = [];
    assert.equal(navigationChecks(detachedLedger)[check], false, `${restoredKey} accepted an erased manifesto ledger`);
  }
});

test("ordinary history accepts only the intentional source-free static restored-scroll continuation after a non-persisted bare-Home Back", () => {
  const departure = homeState("bare-manifesto", "enhanced-document", "/", {
    home: {
      continuation: { partnerLink: { top: 360, visible: true } },
      manifestoReveal: "resolved",
      mode: "enhanced",
      source: { hasSource: true, paused: true },
    },
    scrollY: 5_800,
  });
  const restored = homeState("bare-back", "restored-document", "/", {
    home: {
      bootstrap: "restored-scroll",
      continuation: { audienceRouting: { inert: false }, partnerLink: { top: 361, visible: true } },
      eligibility: "bypass",
      fallback: null,
      header: "released",
      interactive: "true",
      manifesto: { rendered: true, text: "We turn industrial needs into field evidence." },
      manifestoReveal: null,
      mediaState: null,
      mode: "static",
      phase: "fallback",
      routeNavigation: "released",
      source: { hasSource: false, src: null, currentSrc: null, srcAttribute: null, videoNodeCount: 1, sourceNodeCount: 0, paused: true, readyState: 0 },
    },
    probe: probe("restored-document", { blob: { created: 0, revoked: 0, live: 0 }, navigation: { type: "back_forward", notRestoredReasons: null }, resources: [] }),
    maximumScroll: 11_970,
    scrollY: 1_581,
  });
  const base = {
    bare: homeState("bare", "enhanced-document", "/", { scrollY: 0 }),
    bareManifesto: departure,
    bareBack: restored,
    supportAfterBare: snapshot("support-bare", "support-a", { url: "/for-partners/", scrollY: 40 }),
    supportForward: snapshot("support-forward", "support-a", { probe: probe("support-a", { navigation: { type: "back_forward", notRestoredReasons: null } }), url: "/for-partners/", scrollY: 40 }),
    entryInitial: homeState("entry-initial", "entry", "/#entry", { scrollY: 900 }),
    entryResolved: homeState("entry", "entry", "/#entry", { scrollY: 900 }),
    entryBack: homeState("entry-back", "entry", "/#entry", { probe: probe("entry", { navigation: { type: "back_forward", notRestoredReasons: null } }), scrollY: 900 }),
    supportAfterEntry: snapshot("support-entry", "support-b", { url: "/for-partners/", scrollY: 20 }),
    entryForward: snapshot("entry-forward", "support-b", { probe: probe("support-b", { navigation: { type: "back_forward", notRestoredReasons: null } }), url: "/for-partners/", scrollY: 20 }),
  };
  assert.equal(navigationChecks(base).bareBackCorrect, true);
  assert.equal(navigationChecks(base).bareBackNoManifestoReplay, null, "new-Document static restoration must not claim transient no-replay proof");
  assert.equal(navigationChecks({ ...base, bareBack: { ...restored, home: { ...restored.home, bootstrap: "eligible" } } }).bareBackCorrect, false);
  assert.equal(navigationChecks({ ...base, bareBack: { ...restored, home: { ...restored.home, source: { hasSource: true } } } }).bareBackCorrect, false);
  assert.equal(navigationChecks({ ...base, bareBack: { ...restored, home: { ...restored.home, continuation: { partnerLink: { top: 361, visible: false } } } } }).bareBackCorrect, false);
});

test("BFCache requires an ordered exact-route pagehide/pageshow pair for the restored Home Document", () => {
  const barePair = [
    lifecycleEvent("pagehide", "bare-document", "/", true, 1, TEST_EPOCH + 20),
    lifecycleEvent("pageshow", "bare-document", "/", true, 2, TEST_EPOCH + 30),
  ];
  const entryPair = [
    lifecycleEvent("pagehide", "entry-document", "/#entry", true, 1, TEST_EPOCH + 60),
    lifecycleEvent("pageshow", "entry-document", "/#entry", true, 2, TEST_EPOCH + 70),
  ];
  const allEvents = [...barePair, ...entryPair];
  const states = {
    bareManifesto: homeState("bare-before", "bare-document", "/", {
      capturedAtEpochMs: TEST_EPOCH + 10,
      probe: probe("bare-document", { documentEventSequence: 0, events: [] }),
    }),
    bareBack: homeState("bare-back", "bare-document", "/", {
      capturedAtEpochMs: TEST_EPOCH + 40,
      probe: probe("bare-document", { documentEventSequence: 2, events: barePair, navigation: { type: "back_forward", notRestoredReasons: null } }),
    }),
    entryResolved: homeState("entry-before", "entry-document", "/#entry", {
      capturedAtEpochMs: TEST_EPOCH + 50,
      probe: probe("entry-document", { documentEventSequence: 0, events: barePair }),
    }),
    entryBack: homeState("entry-back", "entry-document", "/#entry", {
      capturedAtEpochMs: TEST_EPOCH + 80,
      probe: probe("entry-document", { documentEventSequence: 2, events: allEvents, navigation: { type: "back_forward", notRestoredReasons: null } }),
    }),
  };
  assert.equal(bfcacheResult(allEvents, states).status, STATUS.PASS);
  assert.equal(bfcacheResult(barePair, states).status, STATUS.NOT_OBSERVED, "one route must not promote aggregate BFCache to PASS");
  assert.equal(bfcacheResult(barePair.slice(0, 1), states).status, STATUS.NOT_OBSERVED);
  assert.equal(bfcacheResult([...barePair].reverse(), states).status, STATUS.NOT_OBSERVED);
  assert.equal(bfcacheResult([
    lifecycleEvent("pagehide", "bare-document", "/for-partners/", true, 1),
    lifecycleEvent("pageshow", "bare-document", "/for-partners/", true, 2),
  ], states).status, STATUS.NOT_OBSERVED);
  assert.equal(bfcacheResult([
    lifecycleEvent("pagehide", "other-document", "/", true, 1),
    lifecycleEvent("pageshow", "bare-document", "/", true, 2),
  ], states).status, STATUS.NOT_OBSERVED);
  assert.equal(bfcacheResult([
    lifecycleEvent("pagehide", "bare-document", "/", true, 1),
    lifecycleEvent("pagehide", "bare-document", "/", false, 2),
    lifecycleEvent("pageshow", "bare-document", "/", true, 3),
  ], states).status, STATUS.NOT_OBSERVED);
  const reloadedStates = { ...states, bareBack: homeState("bare-back", "new-document", "/") };
  assert.equal(bfcacheResult(allEvents, reloadedStates).status, STATUS.NOT_OBSERVED);
  const incoherent = { ...states, bareBack: homeState("bare-back", "bare-document", "/", { mobileMenu: { open: true } }) };
  Object.assign(incoherent.bareBack, { capturedAtEpochMs: TEST_EPOCH + 40, probe: states.bareBack.probe });
  assert.equal(bfcacheResult(allEvents, incoherent).status, STATUS.FAIL);
  const staticSameDocument = structuredClone(states);
  Object.assign(staticSameDocument.bareBack.home, { mode: "static", mediaState: null });
  Object.assign(staticSameDocument.bareBack.home.source, { hasSource: false, currentSrc: null, srcAttribute: null });
  assert.equal(bfcacheResult(allEvents, staticSameDocument).status, STATUS.FAIL, "static same-Document restoration became BFCache PASS");
  const changedSource = structuredClone(states);
  changedSource.bareBack.home.source.currentSrc = "blob:https://example.pages.dev/replaced";
  assert.equal(bfcacheResult(allEvents, changedSource).status, STATUS.FAIL, "changed Home source identity became BFCache PASS");
  const staleHide = structuredClone(allEvents);
  staleHide[0].atEpochMs = TEST_EPOCH + 5;
  const staleStates = structuredClone(states);
  staleStates.bareBack.probe.events[0].atEpochMs = TEST_EPOCH + 5;
  assert.equal(bfcacheResult(staleHide, staleStates).status, STATUS.FAIL, "pagehide predating departure became BFCache PASS");
  const postdatedShow = structuredClone(allEvents);
  postdatedShow[1].atEpochMs = TEST_EPOCH + 45;
  const postdatedStates = structuredClone(states);
  postdatedStates.bareBack.probe.events[1].atEpochMs = TEST_EPOCH + 45;
  assert.equal(bfcacheResult(postdatedShow, postdatedStates).status, STATUS.FAIL, "pageshow after restored capture became BFCache PASS");
  const departureContainsHide = structuredClone(states);
  departureContainsHide.bareManifesto.probe.events = [barePair[0]];
  departureContainsHide.bareManifesto.probe.documentEventSequence = 1;
  assert.equal(bfcacheResult(allEvents, departureContainsHide).status, STATUS.FAIL, "departure ledger containing pagehide became BFCache PASS");
  const wrongOrigin = structuredClone(allEvents);
  wrongOrigin[0].href = "https://wrong.example/";
  assert.equal(bfcacheResult(wrongOrigin, states).status, STATUS.NOT_OBSERVED);
  assert.equal(deriveTopLevelStatus([STATUS.PASS, bfcacheResult(allEvents, incoherent), STATUS.PASS]), STATUS.FAIL);
});

test("visibility requires an ordered visible-hidden-visible transition for the same Document", () => {
  const transition = visibilityTransition();
  assert.equal(visibilityTransitionEvidence(transition).status, STATUS.PASS);
  assert.equal(observedTransitionValue(transition, "visible", () => true), true);
  const neverHidden = {
    ...transition,
    hidden: { ...transition.hidden, visibilityState: "visible", probe: probe("visibility-document", { documentEventSequence: 3, events: [] }) },
    visible: { ...transition.visible, probe: probe("visibility-document", { documentEventSequence: 3, events: [] }) },
  };
  assert.equal(observedTransitionValue(neverHidden, "visible", () => false), null, "a visible snapshot without an observed hidden transition must not become FAIL");
  assert.equal(visibilityTransitionEvidence({ ...transition, before: { ...transition.before, visibilityState: "hidden" } }).status, STATUS.NOT_OBSERVED);
  assert.equal(visibilityTransitionEvidence({ ...transition, hidden: { ...transition.hidden, documentId: "other" } }).status, STATUS.NOT_OBSERVED);
  assert.equal(visibilityTransitionEvidence({ ...transition, visible: { ...transition.visible, probe: probe("visibility-document", { documentEventSequence: 5, events: [] }) } }).status, STATUS.NOT_OBSERVED);
  assert.equal(visibilityTransitionEvidence({ ...transition, before: { ...transition.before, probe: { events: [] } } }).status, STATUS.NOT_OBSERVED);
  const hiddenSnapshotPredatesEvent = structuredClone(transition);
  hiddenSnapshotPredatesEvent.hidden.probe.documentEventSequence = transition.before.probe.documentEventSequence;
  assert.equal(visibilityTransitionEvidence(hiddenSnapshotPredatesEvent).status, STATUS.NOT_OBSERVED);
  const staleHidden = structuredClone(transition);
  staleHidden.hidden.probe.events[0].atEpochMs = staleHidden.before.capturedAtEpochMs;
  staleHidden.visible.probe.events[0].atEpochMs = staleHidden.before.capturedAtEpochMs;
  assert.equal(visibilityTransitionEvidence(staleHidden).status, STATUS.NOT_OBSERVED, "stale hidden event became observed");
  const visibleBeforeHiddenCapture = structuredClone(transition);
  visibleBeforeHiddenCapture.visible.probe.events[1].atEpochMs = visibleBeforeHiddenCapture.hidden.capturedAtEpochMs;
  assert.equal(visibilityTransitionEvidence(visibleBeforeHiddenCapture).status, STATUS.NOT_OBSERVED, "visible event predating the hidden snapshot became observed");
  const visibleAlreadyHidden = structuredClone(transition);
  visibleAlreadyHidden.hidden.probe.events.push(visibleAlreadyHidden.visible.probe.events[1]);
  visibleAlreadyHidden.hidden.probe.documentEventSequence = 5;
  assert.equal(visibilityTransitionEvidence(visibleAlreadyHidden).status, STATUS.NOT_OBSERVED, "visible event already present in hidden ledger became observed");
  const nonPrefixLedger = structuredClone(transition);
  nonPrefixLedger.hidden.probe.events.unshift(lifecycleEvent("popstate", "visibility-document", "/", null, 1, TEST_EPOCH + 5));
  assert.equal(visibilityTransitionEvidence(nonPrefixLedger).status, STATUS.NOT_OBSERVED, "non-prefix visibility ledger became observed");
});

test("Home visibility checks bind hidden source ownership and scenario semantics", () => {
  for (const name of ["home-current", "home-manifesto"]) {
    const transition = homeVisibilityTransition(name);
    assert.ok(Object.values(homeVisibilityScenarioChecks(name, transition)).every((value) => value === true), `${name} fixture did not prove every check`);
    const mutations = [
      (candidate) => { candidate.hidden.home.source.hasSource = false; },
      (candidate) => { candidate.hidden.home.source.src = "blob:https://example.pages.dev/swapped"; },
      (candidate) => { candidate.hidden.home.source.currentSrc = "blob:https://example.pages.dev/mismatch"; },
      (candidate) => { candidate.hidden.home.source.videoNodeCount = 2; },
      (candidate) => { candidate.hidden.probe.blob = { created: 0, revoked: 0, live: 0 }; },
      (candidate) => { candidate.hidden.home.source.paused = false; },
      (candidate) => { candidate.visible.home.source.srcAttribute = "blob:https://example.pages.dev/replaced"; },
      (candidate) => { candidate.hidden.url = "/for-partners/"; },
      (candidate) => { candidate.hidden.navigationId = "navigation-other"; },
    ];
    if (name === "home-current") {
      mutations.push(
        (candidate) => { candidate.hidden.home.phase = "settled"; },
        (candidate) => { candidate.visible.home.segment = "arrival"; },
      );
    } else {
      mutations.push(
        (candidate) => { candidate.before.home.phase = "physical"; },
        (candidate) => { candidate.hidden.home.manifestoReveal = "hidden"; },
        (candidate) => { candidate.visible.home.manifesto.rendered = false; },
      );
    }
    for (const mutate of mutations) {
      const contradiction = structuredClone(transition);
      mutate(contradiction);
      const checks = homeVisibilityScenarioChecks(name, contradiction);
      assert.equal(Object.values(checks).every((value) => value === true), false, `${name} accepted a forged hidden/semantic state`);
    }
  }
});

test("visibility aggregation preserves an observed failure when another scenario is unobserved", () => {
  const passing = evaluateVisibilityScenario("passing", visibilityTransition("pass-document"), { release: true });
  const unobserved = evaluateVisibilityScenario("unobserved", null, { release: null });
  const failing = evaluateVisibilityScenario("failing", visibilityTransition("fail-document"), { release: false });
  assert.equal(aggregateVisibilityScenarios([passing, unobserved]).status, STATUS.NOT_OBSERVED);
  assert.equal(aggregateVisibilityScenarios([passing, unobserved, failing]).status, STATUS.FAIL);
  const partialTransition = visibilityTransition("partial-document");
  const partiallyObservedFailure = evaluateVisibilityScenario("partial", {
    ...partialTransition,
    before: { ...partialTransition.before, visibilityState: "hidden" },
  }, { hiddenRelease: false });
  assert.equal(partiallyObservedFailure.status, STATUS.FAIL);
});

test("logical Phase 4 media telemetry requires presence and ignores repeated range requests for one URL", () => {
  const mediaState = homeState("home-ready", "home-document", "/", {
    probe: probe("home-document", {
      resources: [
        { startTime: 12, url: "/media/cinematic/phase-4r2/media/mobile.mp4" },
        { startTime: 12, url: "/media/cinematic/phase-4r2/media/mobile.mp4" },
      ],
    }),
  });
  const records = [
    mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", "bytes=0-1023"),
    mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", "bytes=1024-2047"),
  ];
  const result = summarizeMediaTelemetry(records, [mediaState, { ...mediaState, label: "home-restored" }]);
  assert.equal(result.status, STATUS.PASS);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].resourceObservations, 1);
  assert.equal(result.network.rangeRequestCount, 2);
  assert.equal(result.network.nonRangeRequestCount, 0);
  assert.equal(result.noDuplicateNonRangeRequests, true);
  assert.equal(summarizeMediaTelemetry([
    records[0],
    { ...records[1], frameDocumentGeneration: 4 },
  ], [mediaState]).status, STATUS.PASS, "range traffic for one BFCache-restored Document was rejected across browser generations");
  assert.equal(summarizeMediaTelemetry([], [mediaState]).status, STATUS.FAIL);
  const duplicateNonRangeRequests = [
    mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", null),
    mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", null),
  ];
  const duplicateNonRangeResult = summarizeMediaTelemetry(duplicateNonRangeRequests, [mediaState]);
  assert.equal(duplicateNonRangeResult.status, STATUS.FAIL);
  assert.equal(duplicateNonRangeResult.noDuplicateNonRangeRequests, false);
  assert.deepEqual(duplicateNonRangeResult.network.nonRangeSelections, [{
    path: "/media/cinematic/phase-4r2/media/mobile.mp4",
    count: 2,
    logicalHomeDocuments: 1,
  }]);
  const duplicateSelection = {
    ...mediaState,
    probe: probe("home-document", { resources: [
      { startTime: 1, url: "/media/cinematic/phase-4r2/media/mobile.mp4" },
      { startTime: 2, url: "/media/cinematic/phase-4r2/media/desktop.mp4" },
    ] }),
  };
  assert.equal(summarizeMediaTelemetry(records, [duplicateSelection]).status, STATUS.FAIL);
  const queryVariantSelection = {
    ...mediaState,
    probe: probe("home-document", { resources: [
      { startTime: 1, url: "/media/cinematic/phase-4r2/media/mobile.mp4?v=1" },
      { startTime: 2, url: "/media/cinematic/phase-4r2/media/mobile.mp4?v=2" },
    ] }),
  };
  assert.equal(summarizeMediaTelemetry(records, [queryVariantSelection]).status, STATUS.FAIL);
  const staticRestored = homeState("static-restored", "static-document", "/", {
    home: { mode: "static", source: { hasSource: false, paused: true } },
    probe: probe("static-document", { navigation: { type: "back_forward", notRestoredReasons: null }, resources: [] }),
  });
  const enhanced = { ...mediaState, home: { ...mediaState.home, mode: "enhanced" } };
  const withStaticBypass = summarizeMediaTelemetry(records, [enhanced, staticRestored]);
  assert.equal(withStaticBypass.status, STATUS.PASS);
  assert.equal(withStaticBypass.bypassDocumentsSourceFree, true);
  const staticRequestedMedia = {
    ...staticRestored,
    probe: probe("static-document", { resources: [{ startTime: 3, url: "/media/cinematic/phase-4r2/media/mobile.mp4" }] }),
  };
  assert.equal(summarizeMediaTelemetry(records, [enhanced, staticRequestedMedia]).status, STATUS.FAIL);
  const missingSelectedPath = [mediaRequest("/media/cinematic/phase-4r2/media/desktop.mp4", "bytes=0-1023")];
  assert.equal(summarizeMediaTelemetry(missingSelectedPath, [mediaState]).status, STATUS.FAIL);
  const orphanNetworkPath = [...records, mediaRequest("/media/cinematic/phase-4r2/media/desktop.mp4", "bytes=0-1023")];
  assert.equal(summarizeMediaTelemetry(orphanNetworkPath, [mediaState]).status, STATUS.FAIL);
  const wrongRequestAuthority = [mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", "bytes=0-1023", "pre-navigation")];
  assert.equal(summarizeMediaTelemetry(wrongRequestAuthority, [mediaState]).status, STATUS.FAIL);
  const pathWithoutEnhancedMode = { ...mediaState, home: { ...mediaState.home, mode: null } };
  assert.equal(summarizeMediaTelemetry(records, [pathWithoutEnhancedMode]).status, STATUS.FAIL, "a selected path without an enhanced Home document became PASS");
  for (const malformedRange of ["", "items=0-1", "bytes=", "bytes=-", "bytes=5-3", "bytes=-0", 42, false]) {
    const malformed = [mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", malformedRange)];
    const malformedResult = summarizeMediaTelemetry(malformed, [mediaState]);
    assert.equal(malformedResult.status, STATUS.FAIL, `malformed Range ${String(malformedRange)} became PASS`);
    assert.equal(malformedResult.network.nonRangeRequestCount, 1, `malformed Range ${String(malformedRange)} bypassed non-range accounting`);
  }
  for (const validRange of ["bytes=0-", "bytes=-5", "bytes=0-1, 4-9"]) {
    assert.equal(summarizeMediaTelemetry([
      mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", validRange),
    ], [mediaState]).status, STATUS.PASS, `valid Range ${validRange} was rejected`);
  }
  for (const documentUrl of [
    "https://example.pages.dev/?forged=1",
    "https://example.pages.dev/#entry?forged=1",
    "https://example.pages.dev/for-partners/",
  ]) {
    assert.equal(summarizeMediaTelemetry([
      mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", "bytes=0-1023", mediaState.navigationId, { documentUrl }),
    ], [mediaState]).status, STATUS.FAIL, `${documentUrl} became an authoritative Home request`);
  }
  const secondDocument = homeState("entry-ready", "entry-document", "/#entry", {
    navigationId: "navigation-entry-document",
    probe: probe("entry-document", { resources: [{ startTime: 20, url: "/media/cinematic/phase-4r2/media/mobile.mp4" }] }),
  });
  const twoDocumentRecords = [
    mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", "bytes=0-1023", mediaState.navigationId),
    mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", "bytes=0-1023", secondDocument.navigationId, { documentUrl: "https://example.pages.dev/#entry" }),
  ];
  assert.equal(summarizeMediaTelemetry(twoDocumentRecords, [mediaState, secondDocument]).status, STATUS.PASS);
  assert.equal(summarizeMediaTelemetry([
    { ...twoDocumentRecords[0], documentUrl: "https://example.pages.dev/#entry" },
    { ...twoDocumentRecords[1], documentUrl: "https://example.pages.dev/" },
  ], [mediaState, secondDocument]).status, STATUS.FAIL, "request document routes were accepted after swapping logical Home documents");
  assert.equal(summarizeMediaTelemetry([
    twoDocumentRecords[0],
    { ...twoDocumentRecords[1], frameNavigationId: mediaState.navigationId },
  ], [mediaState, secondDocument]).status, STATUS.FAIL, "request navigation provenance was detached from its correlated Document");
  const forgedSelectionNavigation = { ...secondDocument, navigationId: mediaState.navigationId };
  assert.equal(summarizeMediaTelemetry(twoDocumentRecords, [mediaState, forgedSelectionNavigation]).status, STATUS.FAIL, "snapshot navigation provenance was detached from its correlated Document");

  const sameRouteReload = homeState("entry-reloaded", "entry-reloaded-document", "/#entry", {
    navigationId: secondDocument.navigationId,
    probe: probe("entry-reloaded-document", { resources: [{ startTime: 30, url: "/media/cinematic/phase-4r2/media/mobile.mp4" }] }),
  });
  const sameRouteReloadRecords = [
    mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", null, secondDocument.navigationId, {
      documentUrl: "https://example.pages.dev/#entry",
      frameDocumentId: secondDocument.documentId,
    }),
    mediaRequest("/media/cinematic/phase-4r2/media/mobile.mp4", null, secondDocument.navigationId, {
      documentUrl: "https://example.pages.dev/#entry",
      frameDocumentGeneration: 3,
      frameDocumentId: sameRouteReload.documentId,
    }),
  ];
  const sameRouteReloadResult = summarizeMediaTelemetry(sameRouteReloadRecords, [secondDocument, sameRouteReload]);
  assert.equal(sameRouteReloadResult.status, STATUS.PASS, "two fresh Documents at the same route were collapsed into one media selection");
  assert.equal(sameRouteReloadResult.noDuplicateNonRangeRequests, true);
  assert.equal(summarizeMediaTelemetry([
    sameRouteReloadRecords[0],
    { ...sameRouteReloadRecords[1], frameDocumentId: secondDocument.documentId },
  ], [secondDocument, sameRouteReload]).status, STATUS.FAIL, "one correlated Document identity covered two fresh Documents");
  assert.equal(summarizeMediaTelemetry([
    sameRouteReloadRecords[0],
    { ...sameRouteReloadRecords[1], frameDocumentGeneration: sameRouteReloadRecords[0].frameDocumentGeneration },
  ], [secondDocument, sameRouteReload]).status, STATUS.FAIL, "one browser generation covered two fresh Documents");
  assert.equal(summarizeMediaTelemetry([
    sameRouteReloadRecords[0],
    { ...sameRouteReloadRecords[1], frameDocumentId: null },
  ], [secondDocument, sameRouteReload]).status, STATUS.FAIL, "an uncorrelated Phase 4 request became authoritative");
  assert.equal(summarizeMediaTelemetry([
    sameRouteReloadRecords[0],
    { ...sameRouteReloadRecords[1], documentIdentityCorrelation: "PENDING" },
  ], [secondDocument, sameRouteReload]).status, STATUS.FAIL, "a pending Document correlation became authoritative");
  assert.equal(summarizeMediaTelemetry([
    sameRouteReloadRecords[0],
    { ...sameRouteReloadRecords[1], correlatedDocumentUrl: "https://example.pages.dev/" },
  ], [secondDocument, sameRouteReload]).status, STATUS.FAIL, "a request correlated to another Home route became authoritative");

  const deferredSameRouteRequest = {
    correlatedDocumentUrl: null,
    documentIdentityCorrelation: "PENDING",
    documentUrl: "https://example.pages.dev/#entry",
    frameDocumentGeneration: 10,
    frameDocumentId: null,
  };
  assert.equal(bindRequestDocumentIdentity(deferredSameRouteRequest, {
    documentId: "next-entry-document",
    documentUrl: "https://example.pages.dev/#entry",
  }, 11), false);
  assert.equal(deferredSameRouteRequest.documentIdentityCorrelation, "DOCUMENT GENERATION CHANGED");
  assert.equal(deferredSameRouteRequest.frameDocumentId, null, "a delayed request bound to the next same-route Document");
});

test("listener telemetry detects duplicate attempts and same-Document listener growth", () => {
  const before = homeState("before", "restored-document");
  const stable = homeState("after", "restored-document");
  const history = { states: { bareManifesto: before, bareBack: stable } };
  assert.equal(summarizeListenerTelemetry(history, { scenarios: [] }).status, STATUS.PASS);
  const duplicate = homeState("after-duplicate", "restored-document", "/", {
    probe: probe("restored-document", { listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, duplicateAttempts: 1 } }),
  });
  assert.equal(summarizeListenerTelemetry({ states: { bareManifesto: before, bareBack: duplicate } }, { scenarios: [] }).status, STATUS.FAIL);
  const growth = homeState("after-growth", "restored-document", "/", {
    probe: probe("restored-document", { listeners: { active: 4, activeByType: { click: 3, visibilitychange: 1 }, duplicateAttempts: 0 } }),
  });
  assert.equal(summarizeListenerTelemetry({ states: { bareManifesto: before, bareBack: growth } }, { scenarios: [] }).status, STATUS.FAIL);
  const impossible = homeState("after-impossible", "restored-document", "/", {
    probe: probe("restored-document", { listeners: { active: -5, activeByType: { click: -5 }, added: 0, duplicateAttempts: 0, removed: 5 } }),
  });
  assert.equal(summarizeListenerTelemetry({ states: { bareManifesto: before, bareBack: impossible } }, { scenarios: [] }).status, STATUS.FAIL);
  const impossibleRaf = homeState("after-impossible-raf", "restored-document", "/", {
    probe: probe("restored-document", { raf: { scheduled: 0, executed: 0, cancelled: 0, active: -1 } }),
  });
  assert.equal(summarizeListenerTelemetry({ states: { bareManifesto: before, bareBack: impossibleRaf } }, { scenarios: [] }).status, STATUS.FAIL);
  assert.equal(summarizeListenerTelemetry({ states: { bareManifesto: before, bareBack: homeState("reload", "new-document") } }, { scenarios: [] }).status, STATUS.NOT_OBSERVED);

  const cumulativeCases = [
    ["raf-scheduled-counter-decreased", { raf: { scheduled: 5, executed: 4, cancelled: 1, active: 0 } }, { raf: { scheduled: 4, executed: 3, cancelled: 1, active: 0 } }],
    ["raf-executed-counter-decreased", { raf: { scheduled: 5, executed: 4, cancelled: 1, active: 0 } }, { raf: { scheduled: 5, executed: 3, cancelled: 1, active: 1 } }],
    ["raf-cancelled-counter-decreased", { raf: { scheduled: 5, executed: 3, cancelled: 2, active: 0 } }, { raf: { scheduled: 5, executed: 4, cancelled: 1, active: 0 } }],
    ["intervals-created-counter-decreased", { intervals: { created: 2, cleared: 2, active: 0 } }, { intervals: { created: 1, cleared: 1, active: 0 } }],
    ["intervals-cleared-counter-decreased", { intervals: { created: 2, cleared: 2, active: 0 } }, { intervals: { created: 2, cleared: 1, active: 1 } }],
    ["blob-created-counter-decreased", { blob: { created: 3, revoked: 2, live: 1 } }, { blob: { created: 2, revoked: 1, live: 1 } }],
    ["blob-revoked-counter-decreased", { blob: { created: 3, revoked: 2, live: 1 } }, { blob: { created: 3, revoked: 1, live: 2 } }],
    ["listeners-added-counter-decreased", { listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 5, removed: 2 } }, { listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 4, removed: 1 } }],
    ["listeners-removed-counter-decreased", { listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 5, removed: 2 } }, { listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 4, removed: 1 } }],
    ["listeners-duplicateAttempts-counter-decreased", { listeners: { duplicateAttempts: 1 } }, { listeners: { duplicateAttempts: 0 } }],
  ];
  for (const [expectedFailure, beforeOverrides, afterOverrides] of cumulativeCases) {
    const earlier = homeState(`before-${expectedFailure}`, `document-${expectedFailure}`, "/", { probe: probe(`document-${expectedFailure}`, beforeOverrides) });
    const later = homeState(`after-${expectedFailure}`, `document-${expectedFailure}`, "/", { probe: probe(`document-${expectedFailure}`, afterOverrides) });
    const result = summarizeListenerTelemetry({ states: { bareManifesto: earlier, bareBack: later } }, { scenarios: [] });
    assert.equal(result.status, STATUS.FAIL);
    assert.ok(result.telemetryRegressions.some(({ failures }) => failures.includes(expectedFailure)), `${expectedFailure} was not recorded`);
  }
  const resource = { startTime: 12, url: "/media/cinematic/phase-4r2/media/mobile.mp4" };
  const resourceBefore = homeState("before-resource", "resource-document", "/", { probe: probe("resource-document", { resources: [resource] }) });
  const resourceAfter = homeState("after-resource", "resource-document", "/", { probe: probe("resource-document", { resources: [] }) });
  const disappearingResource = summarizeListenerTelemetry({ states: { bareManifesto: resourceBefore, bareBack: resourceAfter } }, { scenarios: [] });
  assert.ok(disappearingResource.telemetryRegressions.some(({ failures }) => failures.includes("resource-observation-disappeared")));
});

test("Maradin retry proof requires two players, stable playback, and a fully dormant peer", () => {
  const dormant = dormantMaradin();
  assert.equal(maradinSourceFreeState({ maradin: [dormant, { ...dormant }] }), true);
  assert.equal(maradinSourceFreeState({ maradin: [dormant, { ...dormant, launchHidden: true }] }), false);
  const active = activeMaradin();
  const advanced = { advanced: true, endTime: 0.2, startTime: 0.05 };
  const activeState = { probe: { blob: { live: 1 } }, retryActivated: true, retryPlayback: advanced, maradin: [active, dormant] };
  assert.equal(maradinActiveState(activeState), true);
  assert.equal(maradinRetryActiveState(activeState), true);
  assert.equal(maradinRetryActiveState({ ...activeState, maradin: [active, { ...active }] }), false);
  assert.equal(maradinRetryActiveState({ ...activeState, retryActivated: false }), false);
  assert.equal(maradinRetryActiveState({ ...activeState, retryPlayback: { ...advanced, advanced: false } }), false);
  for (const mutate of [
    (state) => { state.maradin[0].src = null; },
    (state) => { state.maradin[0].currentSrc = "https://example.pages.dev/media/other.mp4"; },
    (state) => { state.maradin[0].videoNodeCount = 2; },
    (state) => { state.probe.blob.live = 0; },
  ]) {
    const contradiction = structuredClone(activeState);
    mutate(contradiction);
    assert.equal(maradinActiveState(contradiction), false);
  }
});

test("Maradin visibility checks bind exact route, active ownership, retry provenance and released resources", () => {
  const release = maradinVisibilityTransition("maradin-release-document");
  assert.ok(Object.values(maradinVisibilityScenarioChecks("maradin-release", release)).every((value) => value === true));
  for (const mutate of [
    (candidate) => { candidate.before.url = "/"; },
    (candidate) => { candidate.hidden.navigationId = "navigation-other"; },
    (candidate) => { candidate.before.maradin[0].currentSrc = "https://example.pages.dev/media/other.mp4"; },
    (candidate) => { candidate.before.maradin[0].videoNodeCount = 2; },
    (candidate) => { candidate.before.probe.blob.live = 0; },
    (candidate) => { candidate.hidden.maradin[0].hasSource = true; },
    (candidate) => { candidate.visible.probe.raf.active = 1; },
  ]) {
    const contradiction = structuredClone(release);
    mutate(contradiction);
    assert.equal(Object.values(maradinVisibilityScenarioChecks("maradin-release", contradiction)).every((value) => value === true), false);
  }

  const retry = maradinVisibilityTransition("maradin-retry-document");
  const retryActive = snapshot("maradin-retry-active", "maradin-retry-document", {
    capturedAtEpochMs: TEST_EPOCH + 5,
    maradin: [activeMaradin(), dormantMaradin()],
    navigationId: retry.before.navigationId,
    probe: probe("maradin-retry-document", { blob: { created: 1, revoked: 0, live: 1 }, documentEventSequence: 3, events: [] }),
    retryActivated: true,
    retryPlayback: { advanced: true, endTime: 0.2, startTime: 0.05 },
    url: "/pocs/maradin/",
  });
  assert.ok(Object.values(maradinVisibilityScenarioChecks("maradin-retry-release", retry, retryActive)).every((value) => value === true));
  for (const mutate of [
    (candidate) => { candidate.documentId = "detached-document"; candidate.probe.documentId = "detached-document"; },
    (candidate) => { candidate.navigationId = "navigation-other"; },
    (candidate) => { candidate.url = "/"; },
    (candidate) => { candidate.maradin[1] = activeMaradin(); },
  ]) {
    const contradiction = structuredClone(retryActive);
    mutate(contradiction);
    assert.equal(maradinVisibilityScenarioChecks("maradin-retry-release", retry, contradiction).retryActivatedWithSource, false);
  }
});

test("profile cleanup cannot claim deletion before successful close, removal, and verification", () => {
  assert.deepEqual(profileCleanupResult({ profileExists: false }), {
    status: STATUS.PASS,
    deletionVerified: true,
    profileRetained: false,
    errors: [],
  });
  assert.equal(profileCleanupResult({ closeError: new Error("close failed"), profileExists: false }).status, STATUS.FAIL);
  assert.deepEqual(profileCleanupResult({ removeError: new Error("remove failed"), profileExists: true }), {
    status: STATUS.FAIL,
    deletionVerified: false,
    profileRetained: true,
    errors: ["remove failed"],
  });
  assert.equal(profileCleanupResult({ verificationError: new Error("verify failed"), profileExists: null }).profileRetained, null);
});

test("probe uses native lifecycle events, stable Document IDs, logical resources, and duplicate-registration counters", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "qa-phase6-r1-persistent-lifecycle.mjs"), "utf8");
  assert.match(source, /launchPersistentContext/);
  assert.match(source, /crypto\?\.randomUUID/);
  assert.match(source, /duplicateAttempts/);
  assert.match(source, /signal\?\.aborted/);
  assert.match(source, /phase6R1OnceListener/);
  assert.match(source, /page\.goBack/);
  assert.match(source, /page\.goForward/);
  assert.match(source, /background\.bringToFront/);
  assert.match(source, /notRestoredReasons/);
  assert.match(source, /if \(blobLive\.delete\(value\)\) probe\.blob\.revoked \+= 1/);
  assert.match(source, /navigationId: snapshotNavigationId/);
  assert.match(source, /origin: location\.origin/);
  assert.doesNotMatch(source, /dispatchEvent\s*\(|new PageTransitionEvent/);
  assert.doesNotMatch(source, /status:\s*["']COMPLETE["']/);
});
