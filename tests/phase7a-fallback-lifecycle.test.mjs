import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  fallbackChecksFromObservation,
  homeMaradinChecksFromObservation,
  parseArguments,
  selfTest,
} from "../scripts/qa-phase7a-fallback-lifecycle.mjs";

const sourceFree = () => ({
  controls: true,
  currentSrc: null,
  currentTime: 0,
  duration: null,
  networkState: 0,
  paused: true,
  readyState: 0,
  sourceChildren: 0,
  srcAttribute: null,
  tabIndex: -1,
});

const active = (src) => ({ ...sourceFree(), currentSrc: src, duration: 12, networkState: 1, paused: false, readyState: 4, srcAttribute: src, tabIndex: 0 });

const home = (entry = false) => ({
  blob: { created: 1, revoked: 0, live: 1 },
  home: {
    hash: entry ? "#entry" : "",
    h1: "We turn industrial needs into field evidence.",
    media: active("blob:https://example.test/owned"),
    mediaSource: "/media/cinematic/phase-4r2/media/phase-4r2-desktop-h264-aaaaaaaaaaaa.mp4",
    mediaState: "ready",
    mode: "enhanced",
    physical: { conceptualFrame: entry ? 540 : 1, presentedFrame: entry ? 500 : 1, targetFrame: entry ? 500 : 1 },
    reveal: entry ? "resolved" : "hidden",
  },
});

const dormantPlayers = () => [0, 1].map(() => ({ state: "dormant", launchHidden: false, video: sourceFree() }));

function passingLifecycleObservation() {
  const maradinInitial = { blob: { created: 0, revoked: 0, live: 0 }, listeners: { active: 8, duplicateAttempts: 0 }, maradin: dormantPlayers(), raf: { active: 0 }, intervals: { active: 0 } };
  const firstActive = structuredClone(maradinInitial);
  firstActive.maradin[0] = { state: "active", launchHidden: true, video: active("/media/maradin/one.mp4") };
  const secondActive = structuredClone(maradinInitial);
  secondActive.maradin[1] = { state: "active", launchHidden: true, video: active("/media/maradin/two.mp4") };
  const maradinDeparture = structuredClone(maradinInitial);
  return {
    homeStart: home(false),
    homeDeparture: { blob: { created: 1, revoked: 1, live: 0 } },
    maradinInitial,
    firstActive,
    secondActive,
    maradinDeparture,
    homeReturn: home(true),
    scrubbers: [{ passed: true }, { passed: true }],
    mediaRequests: [
      { path: "/media/maradin/one.mp4" },
      { path: "/media/maradin/two.mp4" },
    ],
  };
}

test("focused runner freezes exact fallback and Home/Maradin scope", () => {
  assert.deepEqual(selfTest(), {
    schema: "quantum-hub.phase-7a.fallback-lifecycle.v1.self-test",
    status: "PASS",
    fallbackCases: 51,
    homeMaradinCycles: 10,
    syntheticLifecycle: false,
  });
});

test("CLI accepts local base URL, browser engine and external JSON output", () => {
  const output = path.resolve(process.cwd(), "..", "phase7a-focused-evidence", "proof.json");
  const options = parseArguments(["--base-url", "http://127.0.0.1:4322", "--engine", "firefox", "--output", output, "--timeout-ms", "45000"]);
  assert.equal(options.baseUrl, "http://127.0.0.1:4322/");
  assert.equal(options.engine, "firefox");
  assert.equal(options.output, output);
  assert.equal(options.timeoutMs, 45_000);
  assert.throws(() => parseArguments(["--engine", "safari", "--output", output]), /engine must be/i);
  assert.throws(() => parseArguments(["--output", path.join(process.cwd(), "proof.json")]), /outside the repository/i);
});

test("fallback checks bind semantic content, ordinary links, whole words, overflow, focusability and network policy", () => {
  const authority = { route: "home" };
  const observation = {
    networkPolicy: true,
    state: {
      h1: "We turn industrial needs into field evidence.",
      h1Count: 1,
      hiddenFocusable: [],
      horizontalOverflow: false,
      links: [{ href: "/about/", onclick: null, resolved: "https://example.test/about/" }],
      mainCount: 1,
      wordFailures: [],
    },
  };
  assert.deepEqual(Object.values(fallbackChecksFromObservation(authority, observation)), [true, true, true, true, true, true]);
  observation.state.wordFailures.push({ word: "overflow" });
  assert.equal(fallbackChecksFromObservation(authority, observation).wholeWordWrapping, false);
});

test("Home/Maradin checks require owned F1-F500 media, dormant launch, replacement, cleanup, scrubbers and bounded resources", () => {
  const observation = passingLifecycleObservation();
  assert.deepEqual(Object.values(homeMaradinChecksFromObservation(observation)), [true, true, true, true, true, true, true, true, true, true]);

  const leaked = passingLifecycleObservation();
  leaked.maradinDeparture.blob = { created: 1, revoked: 0, live: 1 };
  assert.equal(homeMaradinChecksFromObservation(leaked).blobBalanceClosed, false);

  const retried = passingLifecycleObservation();
  retried.mediaRequests = Array.from({ length: 9 }, () => ({ path: "/media/maradin/one.mp4" }));
  assert.equal(homeMaradinChecksFromObservation(retried).noRetryStorm, false);
});
