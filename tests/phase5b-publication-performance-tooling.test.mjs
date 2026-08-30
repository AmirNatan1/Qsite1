import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  AUDIT_VIEWPORT,
  GOVERNED_MARADIN_MEDIA,
  GOVERNED_MARADIN_STILLS,
  GOVERNED_MARADIN_VIDEOS,
  LONG_TASK_LIMIT_MS,
  PROOF_POSTER,
  ROUTES,
  SCHEMA,
  SHARED_MEDIA_PATHS,
  mediaPolicyFailures,
  parseArguments,
  performanceFailures,
  summarizeCodePayloads,
  validateReport,
  validateRuntimeOptions,
} from "../scripts/audit-phase5b-publication-media-performance.mjs";

const root = path.resolve(import.meta.dirname, "..");

function videoState(overrides = {}) {
  return {
    activeDecoder: false,
    currentSrc: null,
    dataSrc: GOVERNED_MARADIN_VIDEOS[0],
    duration: null,
    height: 0,
    id: "video",
    networkState: 0,
    paused: true,
    poster: GOVERNED_MARADIN_STILLS[0],
    preload: "none",
    readyState: 0,
    srcAttribute: null,
    width: 0,
    ...overrides,
  };
}

function domState(overrides = {}) {
  return {
    activeDecoderCount: 0,
    documentHeight: 1800,
    horizontalOverflow: 0,
    images: [],
    mediaReferences: [],
    route: "fixture",
    routeMediaElementCount: 0,
    runningAnimations: [],
    scrollY: 0,
    videos: [],
    viewport: AUDIT_VIEWPORT,
    ...overrides,
  };
}

function request(pathname, phase = "navigation", resourceType = "image") {
  return { path: pathname, phase, resourceType, url: `https://fixture.invalid${pathname}` };
}

function record(route = ROUTES[0]) {
  return {
    route,
    media: { initial: domState({ route: route.id }), afterScroll: domState({ route: route.id }), initiation: null },
    network: { requests: [request(SHARED_MEDIA_PATHS[0])] },
    performance: {
      cls: { load: 0, scroll: 0 },
      continuousMeasurement: { activeIntervalsAfterQuiet: 0, persistentRafCount: 0, quietRafPending: 0, quietRafRequested: 0 },
      coverage: { layoutShiftObserver: true, longTaskObserver: true },
      forwardEnd: 100,
      horizontalOverflow: 0,
      longTasks: [],
      maxLongTaskMs: 0,
      maxScroll: 100,
      reverseEnd: 0,
    },
  };
}

test("CP8 audit freezes nine routes, governed media and a single desktop performance viewport", () => {
  assert.equal(ROUTES.length, 9);
  assert.deepEqual(ROUTES.map(({ id }) => id), ["for-industry", "for-startups", "industries", "proof", "maradin", "spark", "about", "contact", "404"]);
  assert.deepEqual(AUDIT_VIEWPORT, { id: "desktop-1440x900", width: 1440, height: 900 });
  assert.equal(LONG_TASK_LIMIT_MS, 50);
  assert.equal(GOVERNED_MARADIN_STILLS.length, 3);
  assert.equal(GOVERNED_MARADIN_VIDEOS.length, 2);
  assert.equal(GOVERNED_MARADIN_MEDIA.length, 5);
  assert.equal(PROOF_POSTER, "/media/maradin/maradin-field-aperture-poster-approved.jpg");
  assert.deepEqual(SHARED_MEDIA_PATHS, [
    "/brand/quantum-full-logo-white.svg",
    "/brand/quantum-icon-color.svg",
  ]);
});

test("CP8 CLI requires exact HEAD and fresh external-output intent", () => {
  const sha = "a".repeat(40);
  const parsed = parseArguments(["--base-url", "http://127.0.0.1:4338", "--expected-head", sha, "--output", "../phase-5b-work/cp8.json", "--timeout-ms", "5000"]);
  assert.equal(parsed.baseUrl, "http://127.0.0.1:4338/");
  assert.equal(parsed.expectedHead, sha);
  assert.match(parsed.output, /phase-5b-work[\\/]cp8\.json$/);
  assert.equal(validateRuntimeOptions(parsed), true);
  assert.throws(() => parseArguments(["--expected-head", "short"]), /full 40-character/);
  assert.throws(() => parseArguments(["--output", path.join(root, "inside.json")]), /external and untracked/);
  assert.throws(() => validateRuntimeOptions(parseArguments([])), /expected-head is required/);
});

test("CP8 payload accounting separates route code from shared page chrome", () => {
  const records = [
    { bodyText: ".base{}", resourceType: "stylesheet", url: "https://fixture.invalid/_astro/BaseLayout.abc.css" },
    { bodyText: ".route{}", resourceType: "stylesheet", url: "https://fixture.invalid/_astro/industry.def.css" },
    { bodyText: "controller();", resourceType: "script", url: "https://fixture.invalid/_astro/controller.js" },
  ];
  const html = "<style>.inline{color:white}</style><script>sharedHeader()</script><script src=\"/_astro/controller.js\"></script>";
  const modeC = summarizeCodePayloads(records, html, { mode: "C" });
  assert.equal(modeC.css.routeAttributable.rawBytes, Buffer.byteLength(".route{}"));
  assert.equal(modeC.css.sharedExternal.rawBytes, Buffer.byteLength(".base{}"));
  assert.equal(modeC.javascript.routeAttributable.rawBytes, Buffer.byteLength("controller();"));
  assert.ok(modeC.javascript.pageSurface.rawBytes > modeC.javascript.routeAttributable.rawBytes);
  assert.equal(modeC.javascript.indicators.requestAnimationFrameReferences, 0);
  const modeA = summarizeCodePayloads(records.filter(({ resourceType }) => resourceType !== "script"), html, { mode: "A" });
  assert.equal(modeA.css.routeAttributable.rawBytes, Buffer.byteLength(".inline{color:white}"));
  assert.equal(modeA.javascript.routeAttributable.rawBytes, 0);
  assert.ok(modeA.css.routeAttributable.gzipBytes > 0);
});

test("CP8 media policy permits shared branding, rejects route-media leakage, and freezes Proof", () => {
  const none = record(ROUTES.find(({ media }) => media === "none"));
  none.network.requests.push(request(SHARED_MEDIA_PATHS[1], "navigation", "other"));
  assert.deepEqual(mediaPolicyFailures(none), []);
  none.network.requests.push(request(PROOF_POSTER));
  assert.ok(mediaPolicyFailures(none).some(({ code }) => code === "unexpected-route-media"));

  const proof = record(ROUTES.find(({ id }) => id === "proof"));
  proof.network.requests.push(request(PROOF_POSTER));
  proof.media.initial = domState({
    images: [{ complete: true, height: 720, loading: "eager", src: PROOF_POSTER, width: 1280 }],
    mediaReferences: [PROOF_POSTER],
    route: "proof",
    routeMediaElementCount: 1,
  });
  assert.deepEqual(mediaPolicyFailures(proof), []);
  proof.network.requests.push(request(GOVERNED_MARADIN_STILLS[1]));
  assert.ok(mediaPolicyFailures(proof).some(({ code }) => code === "proof-media-inventory"));
});

test("CP8 Maradin policy records lazy stills, dormant metadata, explicit playback and one decoder", () => {
  const maradin = record(ROUTES.find(({ id }) => id === "maradin"));
  maradin.network.requests.push(...GOVERNED_MARADIN_STILLS.map((value) => request(value, "scroll-forward")));
  maradin.network.requests.push(...GOVERNED_MARADIN_VIDEOS.map((value, index) => request(value, `media-init-${index + 1}`, "media")));
  const initialVideos = [
    videoState({ dataSrc: GOVERNED_MARADIN_VIDEOS[0], id: "field", poster: GOVERNED_MARADIN_STILLS[0] }),
    videoState({ dataSrc: GOVERNED_MARADIN_VIDEOS[1], id: "contact", poster: GOVERNED_MARADIN_STILLS[2] }),
  ];
  maradin.media.initial = domState({
    images: [
      { loading: "lazy", src: GOVERNED_MARADIN_STILLS[2] },
      { loading: "lazy", src: GOVERNED_MARADIN_STILLS[1] },
    ],
    mediaReferences: [...GOVERNED_MARADIN_MEDIA].sort(),
    route: "maradin",
    routeMediaElementCount: 4,
    videos: initialVideos,
  });
  maradin.media.afterScroll = domState({ route: "maradin", videos: initialVideos });
  const active = (index) => domState({
    activeDecoderCount: 1,
    route: "maradin",
    videos: initialVideos.map((video, videoIndex) => videoIndex === index ? videoState({ ...video, activeDecoder: true, currentSrc: `https://fixture.invalid${video.dataSrc}`, duration: 3, networkState: 2, readyState: 1, srcAttribute: video.dataSrc, width: 1280, height: 720 }) : video),
  });
  maradin.media.initiation = {
    triggerCount: 2,
    steps: [{ index: 0, metadataLoaded: true, state: active(0) }, { index: 1, metadataLoaded: true, state: active(1) }],
    final: active(1),
  };
  assert.deepEqual(mediaPolicyFailures(maradin), []);
  maradin.network.requests.push(request(GOVERNED_MARADIN_VIDEOS[0], "scroll-forward", "media"));
  assert.ok(mediaPolicyFailures(maradin).some(({ code }) => code === "maradin-video-before-initiation"));
});

test("CP8 performance policy catches scroll long tasks, overflow, perpetual RAF and decoder leaks", () => {
  const fixture = record();
  assert.deepEqual(performanceFailures(fixture), []);
  fixture.performance.maxLongTaskMs = 51;
  fixture.performance.longTasks = [{ duration: 51, phase: "scroll-forward" }];
  fixture.performance.horizontalOverflow = 4;
  fixture.performance.continuousMeasurement.persistentRafCount = 3;
  fixture.media.afterScroll.activeDecoderCount = 1;
  const codes = performanceFailures(fixture).map(({ code }) => code);
  assert.ok(codes.includes("scroll-long-task"));
  assert.ok(codes.includes("horizontal-overflow"));
  assert.ok(codes.includes("perpetual-raf"));
  assert.ok(codes.includes("unexpected-media-decoder"));
});

test("CP8 report validator requires complete measured PASS records", () => {
  const routes = ROUTES.map((route) => ({
    route,
    code: {
      css: { routeAttributable: { gzipBytes: 10, rawBytes: 20 } },
      javascript: { routeAttributable: { gzipBytes: 10, rawBytes: 20 } },
    },
    network: { requestCount: 1, transferredBytes: 100 },
    performance: { cls: { load: 0, scroll: 0 }, maxLongTaskMs: 0 },
  }));
  const report = { schema: SCHEMA, status: "PASS", routes, failures: [] };
  assert.equal(validateReport(report), true);
  assert.throws(() => validateReport({ ...report, failures: [{ code: "fixture" }] }), /failures remain/);
});

test("CP8 executable is import-safe and contains the required browser evidence mechanisms", async () => {
  const source = await readFile(path.join(root, "scripts", "audit-phase5b-publication-media-performance.mjs"), "utf8");
  assert.match(source, /PerformanceObserver/);
  assert.match(source, /type:\s*"longtask"/);
  assert.match(source, /type:\s*"layout-shift"/);
  assert.match(source, /page\.mouse\.wheel/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /persistentRafCount/);
  assert.match(source, /data-maradin-video-trigger/);
  assert.match(source, /maradin-video-before-initiation/);
  assert.match(source, /output must remain external and untracked/);
  assert.match(source, /pathToFileURL\(path\.resolve\(process\.argv\[1\]\)\)\.href === import\.meta\.url/);
  assert.doesNotMatch(source, /9a9ad82b266c663e5689c8a6884a90cfc835ef7c/);
});
