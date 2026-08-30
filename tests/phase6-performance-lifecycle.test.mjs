import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  DEFAULT_CYCLES,
  DEFAULT_ITERATIONS,
  LIMITATIONS,
  MEDIA_NETWORK_SCENARIOS,
  REPRESENTATIVE_SCENARIOS,
  SCHEMA,
  VIEWPORT,
  assessMediaNetworkDiagnostic,
  assessLifecycleBoundedness,
  assertExternalOutputPath,
  buildPlan,
  parseArguments,
  reportFailures,
  runSelfTest,
  summarizeDurations,
  summarizeRepresentativeSamples,
  validateReport,
} from "../scripts/qa-phase6-performance-lifecycle.mjs";

const root = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(root, "scripts", "qa-phase6-performance-lifecycle.mjs");
const externalOutput = path.resolve(root, "..", "phase-6-work", "phase6-performance.json");

test("performance QA freezes Chromium 1440x900 and exactly ten representative outcomes", () => {
  assert.deepEqual(VIEWPORT, { width: 1440, height: 900 });
  assert.deepEqual(REPRESENTATIVE_SCENARIOS.map(({ label }) => label), [
    "Home enhanced",
    "Home reduced",
    "Home H264 blocked",
    "For industry",
    "For startups",
    "Industries",
    "Maradin pre-video",
    "Maradin post-user-initiation",
    "Contact",
    "real 404",
  ]);
  assert.deepEqual(REPRESENTATIVE_SCENARIOS.map(({ path }) => path), [
    "/",
    "/",
    "/",
    "/for-partners/",
    "/for-startups/",
    "/industries/",
    "/pocs/maradin/",
    "/pocs/maradin/",
    "/contact/",
    "/__phase6-performance-intentional-404__/",
  ]);
  assert.equal(REPRESENTATIVE_SCENARIOS.at(-1).expectedStatus, 404);
});

test("defaults provide five cold and warm iterations plus both ten-cycle loops", () => {
  const options = parseArguments(["--self-test"]);
  const plan = buildPlan(options);
  assert.equal(DEFAULT_ITERATIONS, 5);
  assert.equal(DEFAULT_CYCLES, 10);
  assert.equal(plan.iterationsPerCacheClass, 5);
  assert.deepEqual(plan.cacheClasses, ["cold", "warm"]);
  assert.equal(plan.representativeSamples, 100);
  assert.deepEqual(plan.lifecycleLoops.map(({ id, cycles }) => [id, cycles]), [["home-support", 10], ["home-maradin", 10]]);
  assert.equal(plan.defaultsSatisfyBrief, true);
});

test("CLI is configurable, import-safe and reserves output only for real browser runs", () => {
  const parsed = parseArguments([
    "--base-url", "http://127.0.0.1:4555",
    "--output", externalOutput,
    "--iterations", "2",
    "--cycles", "3",
    "--cpu-rate", "6",
    "--settle-ms", "150",
    "--timeout-ms", "5000",
    "--headed",
  ]);
  assert.equal(parsed.baseUrl, "http://127.0.0.1:4555/");
  assert.equal(parsed.output, externalOutput);
  assert.equal(parsed.iterations, 2);
  assert.equal(parsed.cycles, 3);
  assert.equal(parsed.cpuRate, 6);
  assert.equal(parsed.headed, true);
  assert.equal(parseArguments(["--dry-run"]).output, "");
  assert.throws(() => parseArguments([]), /--output is required/);
  assert.throws(() => parseArguments(["--dry-run", "--iterations", "0"]), /--iterations/);
  assert.throws(() => parseArguments(["--self-test", "--dry-run"]), /mutually exclusive/);
});

test("fresh JSON evidence is constrained outside repository and OS temp space", () => {
  assert.equal(assertExternalOutputPath(externalOutput), externalOutput);
  assert.throws(() => assertExternalOutputPath(path.join(root, "phase6-performance.json")), /outside the repository/);
  assert.throws(() => assertExternalOutputPath(path.join(os.tmpdir(), "phase6-performance.json")), /outside OS temporary storage/);
  assert.throws(() => assertExternalOutputPath(path.resolve(root, "..", "phase-6-work", "phase6-performance.txt")), /JSON file/);
});

test("long-task statistics expose min, median, p95 and max without inventing empty values", () => {
  assert.deepEqual(summarizeDurations([100, 1, 4, 3, 2]), {
    count: 5,
    min: 1,
    median: 3,
    p95: 80.8,
    max: 100,
    unit: "ms",
  });
  assert.deepEqual(summarizeDurations([]), {
    count: 0,
    min: null,
    median: null,
    p95: null,
    max: null,
    unit: "ms",
  });
});

test("scenario summaries retain cold/warm and stage-labelled long-task windows", () => {
  const fixture = REPRESENTATIVE_SCENARIOS.flatMap((scenario) => [
    {
      atRest: { second: { intervalActive: 0, rafActive: 0 } },
      cacheClass: "cold",
      layout: { cls: 0.01, horizontalOverflowPx: 0 },
      network: { cachedRequestCount: 0, encodedBytes: 100, requestCount: 2 },
      scenario: scenario.id,
      status: "PASS",
      telemetry: { longTasks: [{ duration: 51, stage: "scroll-forward-window" }] },
    },
    {
      atRest: { second: { intervalActive: 0, rafActive: 0 } },
      cacheClass: "warm",
      layout: { cls: 0, horizontalOverflowPx: 0 },
      network: { cachedRequestCount: 1, encodedBytes: 10, requestCount: 2 },
      scenario: scenario.id,
      status: "PASS",
      telemetry: { longTasks: [] },
    },
  ]);
  const summary = summarizeRepresentativeSamples(fixture);
  assert.equal(summary.length, 10);
  assert.equal(summary[0].cold.longTasks.overall.max, 51);
  assert.equal(summary[0].cold.longTasks.byStage["scroll-forward-window"].count, 1);
  assert.equal(summary[0].cold.cls.unit, "score");
  assert.equal(summary[0].warm.cachedRequests, 1);
});

test("forced-GC lifecycle assessment distinguishes bounded state from monotonic retention", () => {
  const snapshot = (cycle, label, extra = {}) => ({
    blobLive: label === "post-loop-cleanup" ? 0 : 1,
    cdpDocuments: 2,
    cdpEventListeners: label === "home" ? 44 : 18,
    cdpHeapUsedBytes: label === "home" ? 2_000_000 : 1_500_000,
    cdpNodes: label === "home" ? 620 : 340,
    cycle,
    domNodes: label === "home" ? 308 : label === "support" ? 210 : 127,
    intervalActive: 0,
    label,
    mediaActive: 0,
    mediaWithSource: label === "home" ? 1 : 0,
    persistentBlobCreates: 3,
    persistentBlobRevokes: label === "post-loop-cleanup" ? 3 : 2,
    persistentBlobTelemetry: "available",
    rafActive: 0,
    ...extra,
  });
  const bounded = assessLifecycleBoundedness([
    snapshot(1, "home"), snapshot(1, "support"),
    snapshot(2, "home"), snapshot(2, "support"),
    snapshot(3, "home"), snapshot(3, "support"),
    snapshot(4, "home"), snapshot(4, "support"),
    snapshot(4, "post-loop-cleanup"),
  ]);
  assert.equal(bounded.bounded, true);
  const unbounded = assessLifecycleBoundedness([
    snapshot(1, "home"), snapshot(1, "support"),
    snapshot(2, "home"), snapshot(2, "support"),
    snapshot(3, "home"), snapshot(3, "support"),
    snapshot(4, "home", { cdpDocuments: 12 }), snapshot(4, "support"),
    snapshot(4, "post-loop-cleanup"),
  ]);
  assert.equal(unbounded.bounded, false);
});

test("cross-document Blob accounting ignores lossy binding delivery and fails closed on ledger gaps", () => {
  const cleanup = (extra = {}) => ({
    bindingBlobCreates: 10,
    bindingBlobRevokes: 0,
    blobLive: 0,
    cycle: 10,
    intervalActive: 0,
    label: "post-loop-cleanup",
    mediaActive: 0,
    mediaWithSource: 0,
    persistentBlobCreates: 10,
    persistentBlobRevokes: 10,
    persistentBlobTelemetry: "available",
    rafActive: 0,
    ...extra,
  });
  const balanced = assessLifecycleBoundedness([cleanup()]);
  assert.equal(balanced.bounded, true);
  assert.equal(balanced.checks.find(({ id }) => id === "cleanup-persistent-blob-balance")?.actual, 0);

  const leaked = assessLifecycleBoundedness([cleanup({ persistentBlobRevokes: 9 })]);
  assert.equal(leaked.bounded, false);
  assert.equal(leaked.checks.find(({ id }) => id === "cleanup-persistent-blob-balance")?.actual, 1);

  const unavailable = assessLifecycleBoundedness([cleanup({
    persistentBlobCreates: null,
    persistentBlobRevokes: null,
    persistentBlobTelemetry: "unsupported",
  })]);
  assert.equal(unavailable.bounded, false);
  assert.equal(unavailable.checks.find(({ id }) => id === "cleanup-persistent-blob-telemetry")?.pass, false);
});

test("report validator requires the full representative, lifecycle and media-network matrices", () => {
  const iterations = 1;
  const cycles = 1;
  const samples = REPRESENTATIVE_SCENARIOS.flatMap((scenario) => ["cold", "warm"].map((cacheClass) => ({
    cacheClass,
    iteration: 1,
    scenario: scenario.id,
    status: "PASS",
  })));
  const report = {
    browser: { viewport: VIEWPORT },
    configuration: { cycles, iterations },
    lifecycleLoops: {
      homeMaradin: { cycles, status: "COMPLETE" },
      homeSupport: { cycles, status: "COMPLETE" },
    },
    limitations: LIMITATIONS,
    mediaNetwork: MEDIA_NETWORK_SCENARIOS.map(({ id }) => ({ assertions: [], failures: [], id, status: "PASS" })),
    representative: { samples, scenarios: REPRESENTATIVE_SCENARIOS },
    schema: SCHEMA,
  };
  assert.equal(validateReport(report), true);
  report.mediaNetwork.pop();
  assert.throws(() => validateReport(report), /media network diagnostic matrix/);
});

test("source instruments long tasks, layout, bytes, rest activity and lifecycle without scroll writes", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /PerformanceObserver/);
  assert.match(source, /type: "longtask"/);
  assert.match(source, /type: "layout-shift"/);
  assert.match(source, /"Network\.loadingFinished"/);
  assert.match(source, /encodedDataLength/);
  assert.match(source, /globalThis\.requestAnimationFrame =/);
  assert.match(source, /globalThis\.setInterval =/);
  assert.match(source, /URL\.createObjectURL =/);
  assert.match(source, /URL\.revokeObjectURL =/);
  assert.match(source, /sessionStorage\.setItem\(persistentBlobKey/);
  assert.match(source, /persistentBlob: readPersistentBlob\(\)/);
  assert.match(source, /persistentBlobCreates: runtime\.persistentBlob\?\.created/);
  assert.match(source, /bindingBlobRevokes: persistentEvents\.filter/);
  assert.match(source, /"Memory\.getDOMCounters"/);
  assert.match(source, /"Performance\.getMetrics"/);
  assert.match(source, /page\.mouse\.wheel/);
  assert.doesNotMatch(source, /scrollTo\s*\(|scrollIntoView\s*\(|\.scrollTop\s*=/);
});

test("source includes real visibility/history probes and every required degraded-media diagnostic", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /background\.bringToFront\(\)/);
  assert.match(source, /document\.visibilityState/);
  assert.match(source, /page\.goBack/);
  assert.match(source, /page\.goForward/);
  assert.match(source, /persisted === true/);
  assert.match(source, /"Network\.emulateNetworkConditions"/);
  assert.match(source, /context\.setOffline\(true\)/);
  assert.match(source, /route\.abort\("blockedbyclient"\)/);
  assert.match(source, /route\.abort\("connectionreset"\)/);
  assert.match(source, /status: 503/);
  assert.match(source, /"Emulation\.setCPUThrottlingRate"/);
  assert.deepEqual(MEDIA_NETWORK_SCENARIOS.map(({ id }) => id), [
    "high-latency-media",
    "low-bandwidth-media",
    "blocked-media",
    "failed-media",
    "offline-media",
    "home-connection-drop-during-load",
    "home-connection-drop-after-blob",
    "home-poster-failure",
  ]);
});

function releasedContact() {
  return {
    blob: { live: 0 },
    intervals: { active: 0 },
    media: [],
    raf: { active: 0 },
    routeIdentity: "contact",
  };
}

function semanticRuntime(extra = {}) {
  return {
    blob: { live: 0 },
    cls: 0,
    horizontalOverflowPx: 0,
    media: [],
    semantic: { h1Count: 1, mainCount: 1, usableNavigationLinks: 3, visibleBusyOverlays: 0 },
    ...extra,
  };
}

function diagnosticObservation(extra = {}) {
  return {
    afterTeardown: releasedContact(),
    beforeCleanup: semanticRuntime(),
    cleanup: releasedContact(),
    condition: { status: "applied" },
    diagnostics: { consoleErrors: [], pageErrors: [], responsesAtOrAbove400: [] },
    documentStatus: 200,
    lifecycleEvents: [],
    network: { requests: [] },
    ...extra,
  };
}

test("degraded-media assessment proves the fault, coherent state, cleanup, and retry bound", () => {
  const blocked = MEDIA_NETWORK_SCENARIOS.find(({ id }) => id === "blocked-media");
  const blockedRequest = { failed: "net::ERR_BLOCKED_BY_CLIENT", status: null, url: "http://127.0.0.1:4338/media/maradin/test.mp4" };
  const maradin = assessMediaNetworkDiagnostic(blocked, diagnosticObservation({
    beforeCleanup: semanticRuntime({
      maradin: {
        activePlayers: 0,
        sourcedPlayers: 0,
        players: [0, 1].map(() => ({ currentSrc: "", hasSrcAttribute: false, launchVisible: true, paused: true, readyState: 0, state: "dormant" })),
      },
      routeIdentity: "maradin",
    }),
    diagnostics: { consoleErrors: [{ text: "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT" }], pageErrors: [], responsesAtOrAbove400: [] },
    network: { requests: [blockedRequest] },
  }));
  assert.equal(maradin.status, "PASS");

  const homeDrop = MEDIA_NETWORK_SCENARIOS.find(({ id }) => id === "home-connection-drop-during-load");
  const homeRequest = { failed: "net::ERR_CONNECTION_RESET", status: null, url: "http://127.0.0.1:4338/media/cinematic/phase-4r2/media/desktop-h264.mp4" };
  const home = assessMediaNetworkDiagnostic(homeDrop, diagnosticObservation({
    beforeCleanup: semanticRuntime({
      home: {
        cinematicFootprintHeight: 1_800,
        fallback: "media",
        mediaState: "failed",
        mode: "static",
        posterVisible: true,
        stageVisible: true,
        video: { currentSrc: "", hasSrcAttribute: false, paused: true, readyState: 0 },
        viewportHeight: 900,
      },
      media: [{ currentSrc: "", hasSrcAttribute: false, paused: true, readyState: 0 }],
    }),
    diagnostics: { consoleErrors: [{ text: "Failed to load resource: net::ERR_CONNECTION_RESET" }], pageErrors: [], responsesAtOrAbove400: [] },
    network: { requests: [homeRequest] },
  }));
  assert.equal(home.status, "PASS");
});

test("unobserved, unsupported, retrying, or unclean degraded-media evidence fails closed", () => {
  const blocked = MEDIA_NETWORK_SCENARIOS.find(({ id }) => id === "blocked-media");
  const base = diagnosticObservation({
    beforeCleanup: semanticRuntime({
      maradin: {
        activePlayers: 0,
        sourcedPlayers: 0,
        players: [0, 1].map(() => ({ currentSrc: "", hasSrcAttribute: false, launchVisible: true, paused: true, readyState: 0, state: "dormant" })),
      },
      routeIdentity: "maradin",
    }),
  });
  assert.equal(assessMediaNetworkDiagnostic(blocked, base).status, "FAIL");
  const request = { failed: "net::ERR_BLOCKED_BY_CLIENT", status: null, url: "http://127.0.0.1:4338/media/maradin/test.mp4" };
  assert.equal(assessMediaNetworkDiagnostic(blocked, { ...base, condition: { status: "unsupported" }, network: { requests: [request] } }).status, "FAIL");
  assert.equal(assessMediaNetworkDiagnostic(blocked, { ...base, network: { requests: [request, { ...request }] } }).status, "FAIL");
  assert.equal(assessMediaNetworkDiagnostic(blocked, { ...base, cleanup: { ...releasedContact(), media: [{ currentSrc: "blob:test", hasSrcAttribute: true, paused: false, readyState: 4 }] }, network: { requests: [request] } }).status, "FAIL");
  assert.equal(reportFailures({
    cpuThrottle: { status: "COMPLETE" },
    history: { status: "PASS" },
    lifecycleLoops: {},
    mediaNetwork: [{ id: "unobserved", status: "NOT_OBSERVED" }, { id: "errored", status: "ERROR", error: "boom" }],
    representative: { samples: [] },
    visibility: { status: "NOT_OBSERVED" },
  }).filter(({ section }) => section === "media-network").length, 2);
});

test("self-test and dry-run execute without launching a browser or writing output", () => {
  assert.equal(runSelfTest().status, "PASS");
  const selfTest = spawnSync(process.execPath, [scriptPath, "--self-test"], { cwd: root, encoding: "utf8" });
  assert.equal(selfTest.status, 0, selfTest.stderr);
  assert.equal(JSON.parse(selfTest.stdout).status, "PASS");
  const dryRun = spawnSync(process.execPath, [scriptPath, "--dry-run", "--iterations", "1", "--cycles", "1"], { cwd: root, encoding: "utf8" });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  const plan = JSON.parse(dryRun.stdout);
  assert.equal(plan.representativeSamples, 20);
  assert.equal(plan.defaultsSatisfyBrief, false);
});
