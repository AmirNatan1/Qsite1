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
  deriveTopLevelStatus,
  evaluateVisibilityScenario,
  maradinRetryActiveState,
  maradinSourceFreeState,
  navigationChecks,
  normalizeBaseUrl,
  parseArguments,
  profileCleanupResult,
  runSelfTest,
  summarizeListenerTelemetry,
  summarizeMediaTelemetry,
  validateOptions,
  visibilityTransitionEvidence,
} from "../scripts/qa-phase6-r1-persistent-lifecycle.mjs";

function probe(documentId, overrides = {}) {
  return {
    documentId,
    documentEventSequence: 0,
    events: [],
    listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, duplicateAttempts: 0 },
    resources: [],
    ...overrides,
  };
}

function snapshot(label, documentId, overrides = {}) {
  return {
    documentId,
    home: null,
    label,
    maradin: [],
    mobileMenu: { open: false },
    probe: probe(documentId),
    scrollY: 0,
    url: "/",
    visibilityState: "visible",
    ...overrides,
  };
}

function homeState(label, documentId, url = "/", overrides = {}) {
  return snapshot(label, documentId, {
    home: { manifestoReveal: "resolved", source: { hasSource: true, paused: true } },
    url,
    ...overrides,
  });
}

function lifecycleEvent(type, documentId, route, persisted = true, documentEventSequence = 1) {
  return {
    documentEventSequence,
    documentId,
    href: `https://example.pages.dev${route}`,
    persisted,
    type,
    visibilityState: "visible",
  };
}

function visibilityTransition(documentId = "visibility-document") {
  const before = snapshot("before", documentId, {
    probe: probe(documentId, { documentEventSequence: 3 }),
    visibilityState: "visible",
  });
  const hiddenEvent = { ...lifecycleEvent("visibilitychange", documentId, "/", null, 4), visibilityState: "hidden" };
  const visibleEvent = { ...lifecycleEvent("visibilitychange", documentId, "/", null, 5), visibilityState: "visible" };
  const hidden = snapshot("hidden", documentId, {
    probe: probe(documentId, { documentEventSequence: 4, events: [hiddenEvent] }),
    visibilityState: "hidden",
  });
  const visible = snapshot("visible", documentId, {
    probe: probe(documentId, { documentEventSequence: 5, events: [hiddenEvent, visibleEvent] }),
    visibilityState: "visible",
  });
  return { before, hidden, visible };
}

function dormantMaradin() {
  return {
    currentSrc: null,
    hasSource: false,
    launchDisabled: false,
    launchHidden: false,
    paused: true,
    readyState: 0,
    srcAttribute: null,
    state: "dormant",
    tabIndex: -1,
  };
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
    bareBack: homeState("bare-back", "bare", "/", { scrollY: 800 }),
    supportAfterBare: snapshot("support-bare", "support-a", { url: "/for-partners/", scrollY: 40 }),
    supportForward: snapshot("support-forward", "support-a", { url: "/for-partners/", scrollY: 40 }),
    entryResolved: homeState("entry", "entry", "/#entry", { scrollY: 900 }),
    entryBack: homeState("entry-back", "entry", "/#entry", { scrollY: 900 }),
    supportAfterEntry: snapshot("support-entry", "support-b", { url: "/for-partners/", scrollY: 20 }),
    entryForward: snapshot("entry-forward", "support-b", { url: "/for-partners/", scrollY: 20 }),
  };
  assert.ok(Object.values(navigationChecks(states)).every(Boolean));
  assert.equal(navigationChecks({ ...states, supportForward: { ...states.supportForward, url: "/wrong/" } }).bareForwardCorrect, false);
  assert.equal(navigationChecks({ ...states, entryForward: { ...states.entryForward, scrollY: 200 } }).entryForwardCorrect, false);
  assert.equal(navigationChecks({
    ...states,
    bareBack: homeState("bare-back-hidden", "bare", "/", {
      home: { manifestoReveal: "hidden", source: { hasSource: true, paused: true } },
      scrollY: 800,
    }),
  }).bareBackManifestoResolved, false);
  assert.equal(navigationChecks({
    ...states,
    entryBack: homeState("entry-back-hidden", "entry", "/#entry", {
      home: { manifestoReveal: "hidden", source: { hasSource: true, paused: true } },
      scrollY: 900,
    }),
  }).entryBackManifestoResolved, false);
});

test("BFCache requires an ordered exact-route pagehide/pageshow pair for the restored Home Document", () => {
  const states = {
    bareManifesto: homeState("bare-before", "bare-document", "/"),
    bareBack: homeState("bare-back", "bare-document", "/"),
    entryResolved: homeState("entry-before", "entry-document", "/#entry"),
    entryBack: homeState("entry-back", "entry-document", "/#entry"),
  };
  const barePair = [
    lifecycleEvent("pagehide", "bare-document", "/", true, 1),
    lifecycleEvent("pageshow", "bare-document", "/", true, 2),
  ];
  assert.equal(bfcacheResult(barePair, states).status, STATUS.PASS);
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
  assert.equal(bfcacheResult(barePair, reloadedStates).status, STATUS.NOT_OBSERVED);
  const incoherent = { ...states, bareBack: homeState("bare-back", "bare-document", "/", { mobileMenu: { open: true } }) };
  assert.equal(bfcacheResult(barePair, incoherent).status, STATUS.FAIL);
  assert.equal(deriveTopLevelStatus([STATUS.PASS, bfcacheResult(barePair, incoherent), STATUS.PASS]), STATUS.FAIL);
});

test("visibility requires an ordered visible-hidden-visible transition for the same Document", () => {
  const transition = visibilityTransition();
  assert.equal(visibilityTransitionEvidence(transition).status, STATUS.PASS);
  assert.equal(visibilityTransitionEvidence({ ...transition, before: { ...transition.before, visibilityState: "hidden" } }).status, STATUS.NOT_OBSERVED);
  assert.equal(visibilityTransitionEvidence({ ...transition, hidden: { ...transition.hidden, documentId: "other" } }).status, STATUS.NOT_OBSERVED);
  assert.equal(visibilityTransitionEvidence({ ...transition, visible: { ...transition.visible, probe: probe("visibility-document", { documentEventSequence: 5, events: [] }) } }).status, STATUS.NOT_OBSERVED);
  assert.equal(visibilityTransitionEvidence({ ...transition, before: { ...transition.before, probe: { events: [] } } }).status, STATUS.NOT_OBSERVED);
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
    { path: "/media/cinematic/phase-4r2/media/mobile.mp4", range: "bytes=0-1023" },
    { path: "/media/cinematic/phase-4r2/media/mobile.mp4", range: "bytes=1024-2047" },
  ];
  const result = summarizeMediaTelemetry(records, [mediaState, { ...mediaState, label: "home-restored" }]);
  assert.equal(result.status, STATUS.PASS);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].resourceObservations, 1);
  assert.equal(result.network.rangeRequestCount, 2);
  assert.equal(result.network.nonRangeRequestCount, 0);
  assert.equal(result.noDuplicateNonRangeRequests, true);
  assert.equal(summarizeMediaTelemetry([], [mediaState]).status, STATUS.FAIL);
  const duplicateNonRangeRequests = [
    { path: "/media/cinematic/phase-4r2/media/mobile.mp4", range: null },
    { path: "/media/cinematic/phase-4r2/media/mobile.mp4", range: null },
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
  const missing = homeState("after-missing", "restored-document", "/", {
    probe: probe("restored-document", { listeners: { duplicateAttempts: 0 } }),
  });
  assert.equal(summarizeListenerTelemetry({ states: { bareManifesto: before, bareBack: missing } }, { scenarios: [] }).status, STATUS.FAIL);
  assert.equal(summarizeListenerTelemetry({ states: { bareManifesto: before, bareBack: homeState("reload", "new-document") } }, { scenarios: [] }).status, STATUS.NOT_OBSERVED);
});

test("Maradin retry proof requires two players, stable playback, and a fully dormant peer", () => {
  const dormant = dormantMaradin();
  assert.equal(maradinSourceFreeState({ maradin: [dormant, { ...dormant }] }), true);
  assert.equal(maradinSourceFreeState({ maradin: [dormant, { ...dormant, launchHidden: true }] }), false);
  const active = {
    currentSrc: "https://example.pages.dev/media/maradin.mp4",
    currentTime: 0.2,
    hasSource: true,
    launchDisabled: false,
    launchHidden: true,
    paused: false,
    readyState: 3,
    srcAttribute: "/media/maradin.mp4",
    state: "active",
    tabIndex: 0,
  };
  const advanced = { advanced: true, endTime: 0.2, startTime: 0.05 };
  assert.equal(maradinRetryActiveState({ retryActivated: true, retryPlayback: advanced, maradin: [active, dormant] }), true);
  assert.equal(maradinRetryActiveState({ retryActivated: true, retryPlayback: advanced, maradin: [active, { ...active }] }), false);
  assert.equal(maradinRetryActiveState({ retryActivated: false, retryPlayback: advanced, maradin: [active, dormant] }), false);
  assert.equal(maradinRetryActiveState({ retryActivated: true, retryPlayback: { ...advanced, advanced: false }, maradin: [active, dormant] }), false);
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
  assert.doesNotMatch(source, /dispatchEvent\s*\(|new PageTransitionEvent/);
  assert.doesNotMatch(source, /status:\s*["']COMPLETE["']/);
});
