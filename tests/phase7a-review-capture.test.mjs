import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CAPTURE_RECORDING_SPECS,
  CAPTURE_SETTLE_TIMEOUTS,
  MANIFEST_PATH,
  PORTABLE_SERVED_BUILD_SCHEMA,
  RECORDING_VIEW,
  RESPONSIVE_GEOMETRY_VIEWPORTS,
  ROOT,
  SCHEMA,
  SCREENSHOT_SPECS,
  TYPOGRAPHY_SPECIMEN_PATH,
  assertExternalFreshPath,
  capturePlan,
  dryRunReport,
  encoderArguments,
  expectedArtifactPaths,
  fullDecodeArguments,
  normalizeBaseUrl,
  parseArguments,
  portableServedBuildReference,
  recordingBrowserLaunchPlan,
  recordingContractResult,
  requestFailureDisposition,
  renderPortableTypographySpecimen,
  runSelfTest,
  validateManifestLedger,
  validateOptions,
  validatePortableCaptureBindings,
  validatePortableServedBuildReceipt,
  validateResponsiveGeometryState,
  validateScenarioStates,
} from "../scripts/capture-phase7a-review-evidence.mjs";
import {
  CORE_VIEWPORTS,
  HUMAN_GATE_RECORDS,
  RECORDING_MEDIA_CONTRACT,
  RECORDING_SPECS,
} from "../scripts/phase7a-browser-contract.mjs";
import { NO_JS_FIELD_MAP_DESTINATIONS, PHASE7A_R1_REQUIRED_BRANCH, runtimeAssetSetFingerprint } from "../scripts/capture-phase7a-r1-closure.mjs";
import {
  parseArguments as parseQaArguments,
  validateQaServedBuildBindings,
} from "../scripts/qa-phase7a-browser.mjs";

const freshExternal = (name = "capture") => path.resolve(ROOT, "..", `phase-7a-${name}-${process.pid}`);

const validProbe = (authority = CAPTURE_RECORDING_SPECS[0]) => ({
  format: {
    duration: String((authority.minimumSeconds + authority.maximumSeconds) / 2),
    format_name: "mov,mp4,m4a,3gp,3g2,mj2",
  },
  streams: [{
    avg_frame_rate: "30/1",
    codec_name: "h264",
    codec_type: "video",
    height: 720,
    nb_read_frames: "720",
    pix_fmt: "yuv420p",
    r_frame_rate: "30/1",
    width: 1280,
  }],
});

const fakeLedger = () => expectedArtifactPaths()
  .filter((relativePath) => relativePath !== MANIFEST_PATH)
  .map((relativePath) => ({ bytes: 1, relativePath, sha256: "a".repeat(64) }));

const portableReceipt = (revision = "b".repeat(40)) => {
  const runtimeAssets = [
    { kind: "css", route: "/_astro/final.css", bytes: 100, sha256: "1".repeat(64) },
    { kind: "javascript", route: "/_astro/final.js", bytes: 200, sha256: "2".repeat(64) },
  ];
  return {
    schema: PORTABLE_SERVED_BUILD_SCHEMA,
    status: "PASS",
    branch: PHASE7A_R1_REQUIRED_BRANCH,
    revision,
    document: { relativePath: "dist/index.html", bytes: 1_000, sha256: "3".repeat(64) },
    runtimeFingerprint: runtimeAssetSetFingerprint(runtimeAssets),
    runtimeAssets,
    servedParity: { document: true, runtimeAssets: true },
    freshBuild: {
      command: "npm run build:phase7a-r1",
      headBefore: revision,
      headAfter: revision,
      worktreeCleanBefore: true,
      worktreeCleanAfter: true,
    },
  };
};

test("Phase 7A review capture freezes the exact 14-recording authority", () => {
  assert.strictEqual(CAPTURE_RECORDING_SPECS, RECORDING_SPECS);
  assert.equal(CAPTURE_RECORDING_SPECS.length, 14);
  assert.deepEqual(new Set(CAPTURE_RECORDING_SPECS.map(({ engine }) => engine)), new Set(["chromium", "firefox"]));
  assert.equal(new Set(CAPTURE_RECORDING_SPECS.map(({ scenario }) => scenario)).size, 7);
  assert.equal(new Set(CAPTURE_RECORDING_SPECS.map(({ relativePath }) => relativePath)).size, 14);
  for (const engine of ["chromium", "firefox"]) {
    assert.equal(CAPTURE_RECORDING_SPECS.filter((record) => record.engine === engine).length, 7);
  }
  assert.deepEqual(RECORDING_VIEW, { id: "recording-1280x720", width: 1280, height: 720 });
  assert.deepEqual(RECORDING_MEDIA_CONTRACT, {
    container: "mp4",
    codec: "h264",
    pixelFormat: "yuv420p",
    videoStreams: 1,
    audioStreams: 0,
    fps: 30,
    constantFrameRate: true,
    fullDecode: true,
    width: 1280,
    height: 720,
  });
});

test("general recordings and screenshots bind one clean final-HEAD served-build receipt", () => {
  const receipt = portableReceipt();
  assert.equal(validatePortableServedBuildReceipt(receipt, receipt.revision), true);
  const sourceAuthority = portableServedBuildReference(receipt);
  const manifest = {
    servedBuild: receipt,
    recordings: CAPTURE_RECORDING_SPECS.map(({ relativePath }) => ({ relativePath, sourceAuthority })),
    screenshots: SCREENSHOT_SPECS.map(({ relativePath }) => ({ relativePath, sourceAuthority })),
  };
  assert.equal(validatePortableCaptureBindings(manifest), true);
  const stale = structuredClone(manifest);
  stale.recordings[3].sourceAuthority.revision = "c".repeat(40);
  assert.throws(() => validatePortableCaptureBindings(stale), /source authority differs/);
  const staleAsset = structuredClone(receipt);
  staleAsset.runtimeAssets[0].sha256 = "f".repeat(64);
  assert.throws(() => validatePortableServedBuildReceipt(staleAsset, staleAsset.revision), /runtime fingerprint differs/);
  const dirtyBuild = structuredClone(receipt);
  dirtyBuild.freshBuild.worktreeCleanBefore = false;
  assert.throws(() => validatePortableServedBuildReceipt(dirtyBuild, dirtyBuild.revision), /clean final-HEAD governed build/);
});

test("Windows governed build runs npm through the exact capture Node executable", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "capture-phase7a-review-evidence.mjs"), "utf8");
  assert.match(source, /execFileAsync\(process\.execPath, \[npmCli, "run", "build:phase7a-r1"\]/);
  assert.match(source, /path\.dirname\(process\.execPath\)/);
  assert.match(source, /governedEnvironment\.npm_node_execpath = process\.execPath/);
  assert.doesNotMatch(source, /execFileAsync\(npm, \["run", "build:phase7a-r1"\]/);
});

test("R1 browser QA reports require the same portable final-HEAD receipt per engine", () => {
  const receipt = portableReceipt();
  const sourceAuthority = portableServedBuildReference(receipt);
  const report = {
    authorityProfile: "phase7a-r1",
    servedBuild: receipt,
    results: ["chromium", "firefox", "webkit"].map((engine) => ({ identity: { engine }, sourceAuthority })),
  };
  assert.equal(validateQaServedBuildBindings(report), true);
  const stale = structuredClone(report);
  stale.results[1].sourceAuthority = {
    ...stale.results[1].sourceAuthority,
    document: { ...stale.results[1].sourceAuthority.document, sha256: "f".repeat(64) },
  };
  assert.throws(() => validateQaServedBuildBindings(stale), /engine result served-build binding differs/);
  assert.throws(() => parseQaArguments(["--authority-profile", "phase7a-r1", "--base-url", "http://127.0.0.1:4322", "--output", `${freshExternal("qa")}.json`]), /exact 40-character/);
  assert.equal(parseQaArguments(["--authority-profile", "phase7a-r1", "--base-url", "http://127.0.0.1:4322", "--revision", receipt.revision, "--output", `${freshExternal("qa-bound")}.json`]).revision, receipt.revision);
});

test("browser QA fallback states use shared glyph/header geometry and full native-map inventories", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "qa-phase7a-browser.mjs"), "utf8");
  const fallbackSource = source.slice(
    source.indexOf("async function fallbackCases"),
    source.indexOf("async function intentHistoryCase"),
  );
  assert.match(fallbackSource, /validateFallbackManifestoMeasurement\(measurement, label\)/);
  assert.match(fallbackSource, /captureVisibleLinkInventory\(page, "\[data-field-map\] nav a\[href\]"\)/);
  assert.match(fallbackSource, /assertNativeFieldMapViewport\(details\)/);
  assert.doesNotMatch(fallbackSource, /visibleLinks:\s*\[\.\.\.document\.querySelectorAll/);
  assert.doesNotMatch(fallbackSource, /state\.h1Rect\.left\s*>=\s*-1/);
});

test("Firefox gets one fresh browser per recording segment while Chromium stays shared", () => {
  const launches = recordingBrowserLaunchPlan();
  const chromium = launches.filter(({ engine }) => engine === "chromium");
  const firefox = launches.filter(({ engine }) => engine === "firefox");
  assert.equal(launches.length, 16);
  assert.equal(chromium.length, 8);
  assert.equal(firefox.length, 8);
  assert.deepEqual(new Set(chromium.map(({ sessionId }) => sessionId)), new Set(["chromium:shared"]));
  assert.equal(new Set(firefox.map(({ sessionId }) => sessionId)).size, firefox.length);
  assert.ok(firefox.every(({ sessionId }) => sessionId.startsWith("firefox:")));
  assert.deepEqual(
    firefox.filter(({ scenario }) => scenario === "reduced-motion-and-no-js").map(({ segment }) => segment),
    ["reduced-motion", "no-javascript"],
  );
  assert.notEqual(
    firefox.find(({ segment }) => segment === "reduced-motion").sessionId,
    firefox.find(({ segment }) => segment === "no-javascript").sessionId,
  );
});

test("capture settling is bounded when Firefox suppresses animation frames", () => {
  assert.deepEqual(CAPTURE_SETTLE_TIMEOUTS, { fontsMs: 1_000, visualMs: 500 });
  assert.ok(Object.isFrozen(CAPTURE_SETTLE_TIMEOUTS));
});

test("reduced-motion evidence uses native semantic-entry placement before glyph measurement", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "capture-phase7a-review-evidence.mjs"), "utf8");
  const segment = source.slice(
    source.indexOf("async function reducedMotionSegment"),
    source.indexOf("async function noJavaScriptSegment"),
  );
  const screenshot = source.slice(
    source.indexOf("async function prepareScreenshotState"),
    source.indexOf("async function captureScreenshots"),
  );
  assert.match(segment, /await goto\(page, options, "\/#entry"\)/);
  assert.match(screenshot, /spec\.mode === "reduced-motion"\) \{\s*await goto\(page, options, "\/#entry"\)/);
});

test("no-JavaScript screenshots distinguish the document top from measured semantic entry", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "capture-phase7a-review-evidence.mjs"), "utf8");
  const screenshot = source.slice(
    source.indexOf("async function prepareScreenshotState"),
    source.indexOf("async function captureScreenshots"),
  );
  assert.match(screenshot, /spec\.mode === "no-javascript"\) \{\s*await goto\(page, options, "\/"\)/);
  assert.match(screenshot, /spec\.mode === "no-javascript-entry"\) \{\s*await goto\(page, options, "\/#entry"\)/);
  assert.match(screenshot, /spec\.mode === "no-javascript"[\s\S]*?status:\s*"NOT_APPLICABLE"/);
  assert.match(screenshot, /spec\.mode === "no-javascript-entry"[\s\S]*?manifestoVisibility\.status === "PASS"/);
});

test("capture records only bounded media and responsive-poster aborts as expected lifecycle cancellations", () => {
  assert.equal(requestFailureDisposition({
    failure: "net::ERR_ABORTED",
    resourceType: "media",
    url: "blob:http://127.0.0.1:4322/fixture",
  }), "EXPECTED_BLOB_MEDIA_ABORT");
  assert.equal(requestFailureDisposition({
    failure: "NS_BINDING_ABORTED",
    resourceType: "media",
    url: "blob:http://127.0.0.1:4322/fixture",
  }), "EXPECTED_BLOB_MEDIA_ABORT");
  assert.equal(requestFailureDisposition({
    failure: "NS_BINDING_ABORTED",
    resourceType: "image",
    url: "http://127.0.0.1:4322/media/cinematic/phase-4r2/posters/phase-4r2-desktop-poster-8dc538810811.png",
  }), "EXPECTED_RESPONSIVE_POSTER_ABORT");
  for (const fixture of [
    { failure: "net::ERR_FAILED", resourceType: "media", url: "blob:http://127.0.0.1:4322/fixture" },
    { failure: "net::ERR_ABORTED", resourceType: "media", url: "http://127.0.0.1:4322/media/file.mp4" },
    { failure: "net::ERR_ABORTED", resourceType: "document", url: "blob:http://127.0.0.1:4322/fixture" },
    { failure: "NS_BINDING_ABORTED", resourceType: "image", url: "http://127.0.0.1:4322/unrelated.png" },
  ]) assert.equal(requestFailureDisposition(fixture), "UNEXPECTED");
});

test("screenshot authority covers all thirteen core viewports and key alternatives", () => {
  const core = SCREENSHOT_SPECS.filter(({ group }) => group === "core");
  assert.equal(core.length, 13);
  assert.deepEqual(
    new Set(core.map(({ width, height }) => `${width}x${height}`)),
    new Set(CORE_VIEWPORTS.map(({ width, height }) => `${width}x${height}`)),
  );
  const modes = new Set(SCREENSHOT_SPECS.map(({ mode }) => mode));
  for (const mode of [
    "reduced-motion",
    "no-javascript",
    "no-javascript-entry",
    "fallback-fonts",
    "field-map-open",
    "field-map-focus-return",
  ]) assert.ok(modes.has(mode), `missing ${mode}`);
  assert.equal(SCREENSHOT_SPECS.length, 21);
});

test("published topology is exact, external-review-only and free of stale paths", () => {
  const paths = expectedArtifactPaths();
  assert.equal(paths.length, 37);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(paths.filter((value) => value.endsWith(".mp4")).length, 14);
  assert.equal(paths.filter((value) => value.endsWith(".png")).length, 21);
  assert.ok(paths.includes(TYPOGRAPHY_SPECIMEN_PATH));
  assert.ok(paths.includes(MANIFEST_PATH));
  assert.ok(paths.every((value) => !/(?:^|[\/_.-])phase[-_]?6(?:[\/_.-]|$)|__phase6/i.test(value)));
  assert.ok(paths.every((value) => !/\.(?:webm|partial\.mp4)$/i.test(value)));
});

test("FFmpeg arguments force a silent H.264 yuv420p CFR30 1280x720 publication", () => {
  const single = encoderArguments(["raw.webm"], "published.mp4");
  for (const token of ["-an", "-sn", "-dn", "cfr", "30", "libx264", "+faststart"]) assert.ok(single.includes(token), token);
  assert.ok(single.some((value) => value.includes("scale=1280:720")));
  assert.ok(single.some((value) => value.includes("fps=30,format=yuv420p")));

  const joined = encoderArguments(["reduced.webm", "nojs.webm"], "published.mp4");
  assert.ok(joined.includes("-filter_complex"));
  assert.ok(joined.some((value) => value.includes("concat=n=2:v=1:a=0")));
  assert.deepEqual(fullDecodeArguments("published.mp4").slice(0, 7), ["-v", "error", "-xerror", "-i", "published.mp4", "-map", "0:v:0"]);
});

test("FFprobe authority requires complete media truth and full decode", () => {
  const authority = CAPTURE_RECORDING_SPECS[0];
  const passing = recordingContractResult(validProbe(authority), authority, { fullDecodePassed: true });
  assert.equal(passing.status, "PASS");
  assert.deepEqual(passing.failures, []);
  assert.deepEqual(passing.media, {
    audioStreams: 0,
    codec: "h264",
    constantFrameRate: true,
    container: "mp4",
    durationSeconds: (authority.minimumSeconds + authority.maximumSeconds) / 2,
    fps: 30,
    fullDecode: true,
    height: 720,
    pixelFormat: "yuv420p",
    videoStreams: 1,
    width: 1280,
  });

  for (const mutate of [
    (probe) => { probe.streams[0].codec_name = "vp9"; },
    (probe) => { probe.streams[0].pix_fmt = "yuv444p"; },
    (probe) => { probe.streams[0].avg_frame_rate = "30000/1001"; },
    (probe) => { probe.streams[0].width = 1920; },
    (probe) => { probe.streams.push({ codec_type: "audio" }); },
    (probe) => { probe.streams[0].nb_read_frames = "0"; },
    (probe) => { probe.format.duration = "1"; },
  ]) {
    const probe = structuredClone(validProbe(authority));
    mutate(probe);
    assert.equal(recordingContractResult(probe, authority, { fullDecodePassed: true }).status, "FAIL");
  }
  assert.equal(recordingContractResult(validProbe(authority), authority, { fullDecodePassed: false }).status, "FAIL");
});

test("scenario validation requires Signal Field, Field Map, fallback and typography truth", () => {
  const signal = { signalField: true, manifestoWords: 7, horizontalOverflow: false };
  const cinematic = (cinematicPhase, cinematicSegment, conceptualCoordinate, manifestoReveal = "hidden", additions = {}) => ({
    cinematicPhase,
    cinematicSegment,
    conceptualCoordinate,
    conceptualFrame: Math.min(540, Math.floor(conceptualCoordinate) + 1),
    targetFrame: Math.min(500, Math.floor(conceptualCoordinate) + 1),
    manifestoReveal,
    ...additions,
  });
  const stable = (state) => ({ ...state, arrival: structuredClone(state), postDwell: structuredClone(state), dwellMs: 4_100 });
  assert.equal(validateScenarioStates("complete-threshold-entry", {
    "complete-threshold-entry": {
      initial: cinematic("physical", "top-dormancy", 0, "hidden", { ...signal, path: "/", scrollY: 0 }),
      latePhysical: cinematic("physical", "physical-threshold", 490, "hidden", { scrollY: 100 }),
      threshold: cinematic("entry", "entry-reveal", 520, "revealing", { scrollY: 200 }),
      manifesto: cinematic("settled", "entry-reveal", 540, "resolved", { manifestoWords: 7, scrollY: 300 }),
      signalField: cinematic("settled", "entry-reveal", 540, "resolved", { signalField: true, fieldMapLinks: 8, bifurcationPresent: true, bifurcationLinks: 2, scrollY: 700 }),
    },
  }), true);
  assert.equal(validateScenarioStates("complete-reverse", {
    "complete-reverse": {
      settled: cinematic("settled", "entry-reveal", 540, "resolved", { scrollY: 600 }),
      entry: cinematic("entry", "entry-reveal", 527, "resolved", { scrollY: 560 }),
      digitalBlack: cinematic("black", "digital-breathing", 506, "hidden", { scrollY: 520 }),
      physicalThreshold: cinematic("physical", "physical-threshold", 490, "hidden", { scrollY: 480 }),
      qHold: cinematic("physical", "q-hold", 380, "hidden", { scrollY: 380 }),
      raster: cinematic("physical", "raster-settling", 340, "hidden", { scrollY: 340 }),
      line: cinematic("physical", "phosphor-line", 305, "hidden", { scrollY: 300 }),
      physical: cinematic("physical", "current-orbit", 150, "hidden", { scrollY: 100 }),
      top: cinematic("physical", "top-dormancy", 0, "hidden", { scrollY: 0 }),
    },
  }), true);
  const physicalThreshold = cinematic("physical", "physical-threshold", 490, "hidden", { scrollY: 480 });
  const digitalBlack = cinematic("black", "digital-breathing", 506, "hidden", { scrollY: 505 });
  const breach = cinematic("entry", "entry-reveal", 518, "resolved", { scrollY: 522 });
  const partialManifesto = cinematic("entry", "entry-reveal", 532, "resolved", { scrollY: 530 });
  const completedManifesto = cinematic("settled", "entry-reveal", 540, "resolved", { scrollY: 540 });
  const validStopStates = {
    physicalThreshold: stable(physicalThreshold),
    digitalBlack: stable(digitalBlack),
    breach: stable(breach),
    partialManifesto: stable(partialManifesto),
    completedManifesto: stable(completedManifesto),
    openFieldMap: { fieldMapOpen: true, fieldMapRootOpen: true, fieldMapLinks: 8, backgroundInert: true },
    fieldMapKeyboard: { fieldMapOpen: true, activeElement: "a" },
    fieldMapEscape: { fieldMapOpen: false, fieldMapRootOpen: false, activeElement: "field-map-summary", backgroundInert: false },
  };
  assert.equal(validateScenarioStates("stop-states", {
    "stop-states": validStopStates,
  }), true);
  assert.equal(validateScenarioStates("home-intent", {
    "home-intent": {
      supporting: { path: "/about/" },
      entryIntent: { path: "/", hash: "#entry", manifestoReveal: "resolved" },
      reverseAccess: cinematic("physical", "top-dormancy", 0, "hidden", { scrollY: 0, signalField: true }),
    },
  }), true);
  const responsive = Object.fromEntries([
    "desktop-1440x900", "short-desktop-1366x650", "tablet-portrait-768x1024",
    "mobile-390x844", "narrow-320x800", "mobile-landscape-844x390",
  ].map((id) => [id, signal]));
  for (const { id } of RESPONSIVE_GEOMETRY_VIEWPORTS) responsive[id] = {
    ...signal,
    manifestoGeometry: { status: "PASS", failure: null, measurement: { fixture: id } },
  };
  responsive.resizeDuringBreach = { signalField: true };
  responsive.resizeAfterManifesto = { signalField: true, manifestoReveal: "resolved" };
  const measured = [];
  assert.equal(validateScenarioStates("responsive-authority", { "responsive-authority": responsive }, {
    manifestoValidator(measurement) {
      assert.match(measurement.fixture, /^r1-/);
      measured.push(measurement.fixture);
      return true;
    },
  }), true);
  assert.deepEqual(measured, RESPONSIVE_GEOMETRY_VIEWPORTS.map(({ id }) => id));
  assert.equal(validateScenarioStates("reduced-motion-and-no-js", {
    "reduced-motion": {
      staticHome: { cinematicMode: "static", signalField: true, manifestoVisibility: { status: "PASS" } },
      fieldMap: { fieldMapOpen: true, fieldMapLinks: 8 },
      evidenceNetwork: { cinematicRequests: 0 },
    },
    "no-javascript": {
      entry: { signalField: true, manifestoWords: 7, manifestoVisibility: { status: "PASS" } },
      nativeFieldMap: {
        fieldMapOpen: true,
        fieldMapLinks: 8,
        linkInventory: NO_JS_FIELD_MAP_DESTINATIONS.map((destination, index) => ({
          index,
          href: destination.href,
          accessibleName: destination.name,
          elementType: "a",
          width: 220,
          height: 48,
          visible: true,
          fullyInViewport: true,
          unoccluded: true,
          intendedInteractive: true,
        })),
        nativePlane: {
          enhancedController: null,
          nativeDetailsOpen: true,
          viewport: { width: 1280, height: 720 },
          plane: { position: "fixed", visible: true, bounds: { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 } },
        },
      },
      evidenceNetwork: { cinematicRequests: 0 },
    },
  }), true);
  assert.equal(validateScenarioStates("typography", {
    typography: {
      candidates: 4,
      candidate1: { label: "Anybody", visible: true },
      candidate2: { label: "Mona Sans", visible: true },
      candidate3: { label: "Bricolage Grotesque", visible: true },
      candidate4: { label: "Archivo", visible: true },
    },
  }), true);

  const falseThreshold = {
    "complete-threshold-entry": {
      initial: cinematic("physical", "top-dormancy", 0, "hidden", { ...signal, path: "/", scrollY: 0 }),
      latePhysical: cinematic("physical", "physical-threshold", 490, "hidden", { scrollY: 0 }),
      threshold: cinematic("entry", "entry-reveal", 520, "revealing", { scrollY: 0 }),
      manifesto: cinematic("settled", "entry-reveal", 540, "resolved", { manifestoWords: 7 }),
      signalField: cinematic("settled", "entry-reveal", 540, "resolved", { signalField: true, fieldMapLinks: 8, bifurcationPresent: true, bifurcationLinks: 2 }),
    },
  };
  assert.throws(() => validateScenarioStates("complete-threshold-entry", falseThreshold), /late physical opening/i);
  const unstableStops = structuredClone(validStopStates);
  unstableStops.digitalBlack.postDwell.conceptualCoordinate = 507;
  assert.throws(() => validateScenarioStates("stop-states", { "stop-states": unstableStops }), /changed phase, coordinate, frame, reveal, or scroll/);
  const identicalStops = structuredClone(validStopStates);
  identicalStops.digitalBlack = structuredClone(identicalStops.physicalThreshold);
  assert.throws(() => validateScenarioStates("stop-states", { "stop-states": identicalStops }), /digital black|materially identical/i);
  const scrollOnlyReverse = {
    "complete-reverse": Object.fromEntries(["settled", "entry", "digitalBlack", "physicalThreshold", "qHold", "raster", "line", "physical", "top"].map((key, index) => [key, { scrollY: 800 - index * 100, manifestoReveal: key === "settled" ? "resolved" : "hidden" }])),
  };
  assert.throws(() => validateScenarioStates("complete-reverse", scrollOnlyReverse), /cinematic phase differs/);
  assert.throws(() => validateScenarioStates("home-intent", {
    "home-intent": {
      supporting: { path: "/about/" },
      entryIntent: { path: "/", hash: "#entry", manifestoReveal: "resolved" },
      reverseAccess: { scrollY: 0, signalField: true, manifestoReveal: "hidden" },
    },
  }), /reverse F1 access cinematic phase differs/);
  assert.throws(() => validateScenarioStates("typography", { typography: { candidates: 3 } }), /candidate count/i);

  const missingGeometry = structuredClone(responsive);
  delete missingGeometry[RESPONSIVE_GEOMETRY_VIEWPORTS[0].id].manifestoGeometry;
  assert.throws(() => validateScenarioStates("responsive-authority", { "responsive-authority": missingGeometry }, { manifestoValidator: () => true }), /misses shared manifesto geometry/);

  const reportedFailure = structuredClone(responsive);
  reportedFailure["r1-800x360"].manifestoGeometry = { status: "FAIL", failure: "glyph intersects sticky header", measurement: { fixture: "r1-800x360" } };
  assert.throws(() => validateScenarioStates("responsive-authority", { "responsive-authority": reportedFailure }, { manifestoValidator: () => true }), /shared manifesto geometry failed.*800x360/);

  assert.throws(() => validateScenarioStates("responsive-authority", { "responsive-authority": responsive }, {
    manifestoValidator(measurement) {
      if (measurement.fixture === "r1-844x390") throw new Error("manifesto geometry: glyph left safety is -1px");
      return true;
    },
  }), /glyph left safety/);
});

test("manifest validator rejects missing, duplicate, stale and unexpected evidence", () => {
  const ledger = fakeLedger();
  assert.equal(validateManifestLedger(ledger), true);

  assert.throws(() => validateManifestLedger(ledger.slice(1)), /missing .*required artifact/i);
  assert.throws(() => validateManifestLedger([...ledger, { ...ledger[0] }]), /duplicate path/i);

  const stale = structuredClone(ledger);
  stale[0].relativePath = "recordings/phase-6/stale.mp4";
  assert.throws(() => validateManifestLedger(stale), /stale Phase 6 path/i);

  const unexpected = structuredClone(ledger);
  unexpected[0].relativePath = "screenshots/unexpected.png";
  assert.throws(() => validateManifestLedger(unexpected), /missing .*required artifact|stale or unexpected artifact/i);
});

test("portable typography specimen embeds all four candidates without local paths", () => {
  const html = renderPortableTypographySpecimen({ anybody: "QQ==", mona: "Qg==", bricolage: "Qw==", archivo: "RA==" });
  assert.equal((html.match(/data-candidate=/g) ?? []).length, 4);
  assert.equal((html.match(/@font-face/g) ?? []).length, 4);
  assert.match(html, /WE TURN INDUSTRIAL NEEDS INTO FIELD EVIDENCE\./);
  assert.match(html, /Industry 4\.0 \/ Advanced Manufacturing/);
  assert.match(html, /pending human review/i);
  assert.doesNotMatch(html, /file:\/\/|[a-z]:\\users\\|onedrive|\.codex/i);
});

test("self-test and dry-run expose the exact plan without creating output", async () => {
  const self = runSelfTest();
  assert.deepEqual(self, {
    artifacts: 37,
    coreScreenshots: 13,
    recordings: 14,
    schema: SCHEMA,
    screenshots: 21,
    status: "PASS",
    typographyCandidates: 4,
  });
  const plan = capturePlan();
  assert.deepEqual(plan.engines, ["chromium", "firefox"]);
  assert.equal(plan.recordings.length, 14);
  assert.deepEqual(plan.humanGates, HUMAN_GATE_RECORDS);

  const output = freshExternal("dry-run");
  const report = dryRunReport(validateOptions({
    ...parseArguments(["--dry-run", "--base-url", "http://127.0.0.1:4322", "--revision", "b".repeat(40), "--output", output]),
  }));
  assert.equal(report.status, "DRY-RUN");
  assert.equal(report.output, undefined);
  assert.equal(report.recordings.length, 14);
  assert.equal(report.topology.length, 37);
  await assert.rejects(access(output));
});

test("argument and external-output policy fail closed", () => {
  assert.equal(normalizeBaseUrl("https://example.test/review"), "https://example.test/review/");
  assert.throws(() => normalizeBaseUrl("file:///private/site"), /HTTP/i);
  assert.throws(() => normalizeBaseUrl("https://user:secret@example.test/"), /credential-free/i);
  assert.throws(() => normalizeBaseUrl("https://example.test/phase-6-preview/"), /stale Phase 6 path/i);
  assert.throws(() => parseArguments(["--unknown"]), /unknown option/i);
  assert.throws(() => validateOptions({ ...parseArguments(["--dry-run", "--base-url", "http://127.0.0.1:4322", "--revision", "b".repeat(40), "--output", ROOT]), timeoutMs: 30_000 }), /outside the repository/i);
  assert.throws(() => validateOptions({ ...parseArguments(["--dry-run", "--base-url", "http://127.0.0.1:4322", "--revision", "short", "--output", freshExternal("bad-revision")]), timeoutMs: 30_000 }), /exact 40-character/);
  assert.throws(() => assertExternalFreshPath(path.join(os.tmpdir(), "phase-7a-review")), /outside OS temporary/i);
  assert.throws(() => assertExternalFreshPath(freshExternal("phase-6-stale")), /stale Phase 6 path/i);
  assert.equal(assertExternalFreshPath(freshExternal("valid")), freshExternal("valid"));
});
