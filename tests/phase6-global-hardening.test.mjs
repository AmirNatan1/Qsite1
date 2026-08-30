import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CHROMIUM_VIEWPORTS,
  CROSS_ENGINE_VIEWPORTS,
  EXPECTED_MATRIX_CASES,
  HOME_EXTRA_VIEWPORTS,
  PHASE6_ENGINES,
  PHASE6_ROUTES,
  PHASE6_SCHEMA,
  matrixForEngine,
  validatePhase6Contract,
} from "../scripts/phase6-contract.mjs";
import {
  assertExternalOutputPath,
  diagnosticFailures,
  dormantPlayers,
  expectedHttpStatus,
  parseArguments,
  runSelfTest,
  semanticFailures,
  validateReport,
} from "../scripts/qa-phase6-global-hardening.mjs";

const root = path.resolve(import.meta.dirname, "..");

function semanticObservation(route = PHASE6_ROUTES[0]) {
  return {
    h1: { count: 1, text: ["Fixture heading"] },
    headingIssues: [],
    headings: [{ level: 1, text: "Fixture heading" }, { level: 2, text: "Section" }],
    homeIdentity: route.id === "home",
    horizontalOverflow: 0,
    landmarks: { banner: 1, contentinfo: 1, main: 1, namedNavigation: 3 },
    routeIdentity: route.id === "home" ? null : route.identity,
    smallTargets: [],
    viewport: { height: 900, width: 1440 },
    withinOverflowTolerance: true,
  };
}

test("Phase 6 freezes Home, eight supporting routes and one real HTTP 404", () => {
  assert.equal(validatePhase6Contract(), true);
  assert.equal(PHASE6_ROUTES.length, 10);
  assert.deepEqual(PHASE6_ROUTES.map(({ path }) => path), [
    "/",
    "/for-partners/",
    "/for-startups/",
    "/industries/",
    "/pocs/",
    "/pocs/maradin/",
    "/spark/",
    "/about/",
    "/contact/",
    "/__phase6-intentional-404__/",
  ]);
  assert.deepEqual(PHASE6_ROUTES.filter(({ real404 }) => real404).map(({ expectedStatus }) => expectedStatus), [404]);
});

test("Phase 6 freezes the exact 130 + 34 + 34 cross-engine matrix", () => {
  assert.deepEqual(PHASE6_ENGINES, ["chromium", "webkit", "firefox"]);
  assert.equal(CHROMIUM_VIEWPORTS.length, 13);
  assert.deepEqual(CHROMIUM_VIEWPORTS.map(({ width, height }) => `${width}x${height}`), [
    "1440x900", "1366x650", "1280x800", "1024x768", "768x1024", "390x844", "360x800",
    "320x800", "844x390", "740x360", "800x360", "896x414", "900x480",
  ]);
  assert.deepEqual(CROSS_ENGINE_VIEWPORTS.map(({ width, height }) => `${width}x${height}`), ["1440x900", "390x844", "844x390"]);
  assert.deepEqual(HOME_EXTRA_VIEWPORTS.map(({ width, height }) => `${width}x${height}`), ["1366x650", "1024x768", "768x1024", "320x800"]);
  assert.equal(matrixForEngine("chromium").length, 130);
  assert.equal(matrixForEngine("webkit").length, 34);
  assert.equal(matrixForEngine("firefox").length, 34);
  assert.deepEqual(EXPECTED_MATRIX_CASES, { chromium: 130, webkit: 34, firefox: 34, all: 198 });
});

test("Phase 6 CLI selects engines, headed Firefox and a fresh external intent", () => {
  const output = path.resolve(root, "..", "phase-6-work", "firefox.json");
  const parsed = parseArguments([
    "--engine", "firefox",
    "--headed",
    "--base-url", "http://127.0.0.1:4338",
    "--output", output,
    "--timeout-ms", "5000",
  ]);
  assert.equal(parsed.engine, "firefox");
  assert.equal(parsed.headed, true);
  assert.equal(parsed.baseUrl, "http://127.0.0.1:4338/");
  assert.equal(parsed.output, output);
  assert.throws(() => parseArguments(["--engine", "safari", "--output", output]), /chromium, webkit, firefox or all/);
  assert.throws(() => parseArguments(["--engine", "chromium"]), /--output is required/);
});

test("Phase 6 report output cannot overwrite tracked or temporary evidence space", () => {
  const external = path.resolve(root, "..", "phase-6-work", "report.json");
  assert.equal(assertExternalOutputPath(external), external);
  assert.throws(() => assertExternalOutputPath(path.join(root, "artifacts", "phase6.json")), /outside the repository/);
  assert.throws(() => assertExternalOutputPath(path.join(os.tmpdir(), "phase6.json")), /temporary storage/);
  assert.throws(() => assertExternalOutputPath(path.resolve(root, "..", "phase-6-work", "report.txt")), /JSON file/);
});

test("semantic validator catches heading, landmark, overflow and 44px regressions", () => {
  const observation = semanticObservation();
  observation.headingIssues.push({ code: "heading-level-skip" });
  observation.landmarks.main = 2;
  observation.withinOverflowTolerance = false;
  observation.horizontalOverflow = 12;
  observation.smallTargets.push({ selector: "a.fixture", rect: { width: 20, height: 20 } });
  const codes = semanticFailures(observation, PHASE6_ROUTES[0]).map(({ code }) => code);
  assert.ok(codes.includes("heading-level-skip"));
  assert.ok(codes.includes("main-landmark"));
  assert.ok(codes.includes("horizontal-overflow"));
  assert.ok(codes.includes("target-size"));
});

test("request validator permits only the intentional navigation 404 and labelled media aborts", () => {
  const baseUrl = "https://example.test/";
  const notFound = PHASE6_ROUTES.at(-1);
  const diagnostics = {
    consoleErrors: [{ text: "Failed to load resource: the server responded with a status of 404", location: {} }],
    consoleWarnings: [],
    pageErrors: [],
    requests: [{ url: "https://example.test/missing/", method: "GET", resourceType: "document", isNavigation: true, status: 404, failure: null }],
  };
  assert.deepEqual(diagnosticFailures(diagnostics, notFound, baseUrl), []);
  diagnostics.requests.push({ url: "https://foreign.test/runtime.js", method: "GET", resourceType: "script", isNavigation: false, status: 200, failure: null });
  assert.ok(diagnosticFailures(diagnostics, notFound, baseUrl).some(({ code }) => code === "cross-origin-request"));
  const abort = { consoleErrors: [], consoleWarnings: [], pageErrors: [], requests: [{ url: "blob:https://example.test/phase6-media", resourceType: "media", status: null, failure: "net::ERR_ABORTED" }] };
  assert.deepEqual(diagnosticFailures(abort, PHASE6_ROUTES[0], baseUrl, { allowExpectedMediaAbort: true }), []);
  abort.requests[0].url = "https://example.test/media/maradin/maradin-field-aperture-approved.mp4";
  abort.requests[0].resourceType = "other";
  assert.deepEqual(diagnosticFailures(abort, PHASE6_ROUTES[5], baseUrl, { allowExpectedMediaAbort: true }), []);
  abort.requests[0].url = "https://example.test/video.mp4";
  assert.ok(diagnosticFailures(abort, PHASE6_ROUTES[5], baseUrl, { allowExpectedMediaAbort: true }).some(({ code }) => code === "request-failure"));
  const firefoxPosterDeparture = { consoleErrors: [], consoleWarnings: [], pageErrors: [], requests: [{
    url: "https://example.test/media/cinematic/phase-4r2/posters/phase-4r2-desktop-poster-8dc538810811.png",
    resourceType: "image",
    status: 200,
    failure: "NS_BINDING_ABORTED",
  }] };
  assert.deepEqual(diagnosticFailures(firefoxPosterDeparture, PHASE6_ROUTES[0], baseUrl), []);
  firefoxPosterDeparture.requests[0].url = "https://example.test/unrelated.png";
  assert.ok(diagnosticFailures(firefoxPosterDeparture, PHASE6_ROUTES[0], baseUrl, { allowExpectedMediaAbort: true }).some(({ code }) => code === "request-failure"));
});

test("successful WebKit cache revalidation does not weaken real HTTP status authority", () => {
  assert.equal(expectedHttpStatus(200, 200), true);
  assert.equal(expectedHttpStatus(304, 200), true);
  assert.equal(expectedHttpStatus(304, 404), false);
  assert.equal(expectedHttpStatus(404, 404), true);
  assert.equal(expectedHttpStatus(500, 200), false);
});

test("dormant media accepts stale engine metadata only after decoder teardown", () => {
  const player = {
    currentSrc: "https://example.test/stale-engine-metadata.mp4",
    launchHidden: false,
    preload: "none",
    readyState: 0,
    src: "",
    state: "dormant",
    tabIndex: -1,
  };
  assert.equal(dormantPlayers({ players: [player, { ...player, currentSrc: "" }] }), true);
  assert.equal(dormantPlayers({ players: [{ ...player, readyState: 1 }, { ...player }] }), false);
  assert.equal(dormantPlayers({ players: [{ ...player, src: "/active.mp4" }, { ...player }] }), false);
});

test("report validator keeps unsupported capabilities distinct from failures", () => {
  const selectedEngines = ["firefox"];
  const engine = {
    engine: "firefox",
    status: "PASS",
    matrix: Array.from({ length: 34 }, () => ({})),
    noJavaScript: [{}, {}],
    history: { bfcache: { status: "not-observed" } },
    capabilities: { performanceMemory: { status: "unsupported" } },
  };
  const report = {
    engines: [engine],
    failures: [],
    routes: PHASE6_ROUTES,
    schema: PHASE6_SCHEMA,
    selectedEngines,
    status: "PASS",
    summary: { matrixExpected: 34 },
  };
  assert.equal(validateReport(report), true);
  assert.equal(runSelfTest().status, "PASS");
});

test("executable remains compact, cross-engine and free of capture or scroll-position writes", async () => {
  const source = await readFile(path.join(root, "scripts", "qa-phase6-global-hardening.mjs"), "utf8");
  assert.match(source, /import \{ chromium, firefox, webkit \} from "playwright-core"/);
  assert.match(source, /--engine chromium\|webkit\|firefox\|all/);
  assert.match(source, /--headed/);
  assert.match(source, /PageTransitionEvent/);
  assert.match(source, /pageshow\.persisted/);
  assert.doesNotMatch(source, /\.screenshot\s*\(/);
  assert.doesNotMatch(source, /recordVideo|video:\s*\{/);
  assert.doesNotMatch(source, /scrollTo\s*\(|scrollIntoView\s*\(|\.scrollTop\s*=/);
});
