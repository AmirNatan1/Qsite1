import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CAPTURE_RECORDING_SPECS,
  MANIFEST_PATH,
  RECORDING_VIEW,
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
  recordingBrowserLaunchPlan,
  recordingContractResult,
  renderPortableTypographySpecimen,
  runSelfTest,
  validateManifestLedger,
  validateOptions,
  validateScenarioStates,
} from "../scripts/capture-phase7a-review-evidence.mjs";
import {
  CORE_VIEWPORTS,
  HUMAN_GATE_RECORDS,
  RECORDING_MEDIA_CONTRACT,
  RECORDING_SPECS,
} from "../scripts/phase7a-browser-contract.mjs";

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
  assert.equal(validateScenarioStates("complete-threshold-entry", {
    "complete-threshold-entry": {
      initial: { ...signal, path: "/" },
      latePhysical: { scrollY: 100 },
      threshold: { scrollY: 200 },
      manifesto: { manifestoReveal: "resolved", manifestoWords: 7 },
      signalField: { signalField: true, fieldMapLinks: 8 },
    },
  }), true);
  assert.equal(validateScenarioStates("complete-reverse", {
    "complete-reverse": {
      settled: { manifestoReveal: "resolved" },
      breach: { scrollY: 500 },
      raster: { scrollY: 400 },
      line: { scrollY: 300 },
      physical: { scrollY: 100 },
      top: { scrollY: 0, manifestoReveal: "hidden" },
    },
  }), true);
  assert.equal(validateScenarioStates("stop-states", {
    "stop-states": {
      physicalThreshold: {}, digitalBlack: {}, breach: {}, partialManifesto: {},
      completedManifesto: { manifestoReveal: "resolved" },
      openFieldMap: { fieldMapOpen: true, fieldMapRootOpen: true, fieldMapLinks: 8 },
    },
  }), true);
  assert.equal(validateScenarioStates("home-intent", {
    "home-intent": {
      supporting: { path: "/about/" },
      entryIntent: { path: "/", hash: "#entry", manifestoReveal: "resolved" },
      reverseAccess: { scrollY: 0, signalField: true },
    },
  }), true);
  const responsive = Object.fromEntries([
    "desktop-1440x900", "short-desktop-1366x650", "tablet-portrait-768x1024",
    "mobile-390x844", "narrow-320x800", "mobile-landscape-844x390",
  ].map((id) => [id, signal]));
  responsive.resizeDuringBreach = { signalField: true };
  responsive.resizeAfterManifesto = { signalField: true, manifestoReveal: "resolved" };
  assert.equal(validateScenarioStates("responsive-authority", { "responsive-authority": responsive }), true);
  assert.equal(validateScenarioStates("reduced-motion-and-no-js", {
    "reduced-motion": {
      staticHome: { cinematicMode: "static", signalField: true },
      fieldMap: { fieldMapOpen: true, fieldMapLinks: 8 },
      evidenceNetwork: { cinematicRequests: 0 },
    },
    "no-javascript": {
      entry: { signalField: true, manifestoWords: 7 },
      nativeFieldMap: { fieldMapOpen: true, fieldMapLinks: 8 },
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
      initial: { ...signal, path: "/" }, latePhysical: { scrollY: 0 }, threshold: { scrollY: 0 },
      manifesto: { manifestoReveal: "resolved", manifestoWords: 7 }, signalField: { signalField: true, fieldMapLinks: 8 },
    },
  };
  assert.throws(() => validateScenarioStates("complete-threshold-entry", falseThreshold), /late physical opening/i);
  assert.throws(() => validateScenarioStates("typography", { typography: { candidates: 3 } }), /candidate count/i);
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
    ...parseArguments(["--dry-run", "--base-url", "http://127.0.0.1:4322", "--output", output]),
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
  assert.throws(() => validateOptions({ ...parseArguments(["--dry-run", "--base-url", "http://127.0.0.1:4322", "--output", ROOT]), timeoutMs: 30_000 }), /outside the repository/i);
  assert.throws(() => assertExternalFreshPath(path.join(os.tmpdir(), "phase-7a-review")), /outside OS temporary/i);
  assert.throws(() => assertExternalFreshPath(freshExternal("phase-6-stale")), /stale Phase 6 path/i);
  assert.equal(assertExternalFreshPath(freshExternal("valid")), freshExternal("valid"));
});
