import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  CAPTURE_VIEWS,
  ENCODER_CONTRACT,
  RECORDING_SPECS,
  REPORT_PATH,
  ROOT,
  SCHEMA,
  assertExternalDurablePath,
  encoderArguments,
  expectedArtifactPaths,
  parseArguments,
  recordingContractResult,
  runSelfTest,
  validateOptions,
} from "../scripts/capture-phase6-review-evidence.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

test("review capture freezes forty route PNGs, four sheets, four MP4s and one report", () => {
  const topology = expectedArtifactPaths();
  assert.equal(topology.length, 49);
  assert.equal(topology.filter((value) => value.startsWith("routes/") && value.endsWith(".png")).length, 40);
  assert.equal(topology.filter((value) => value.startsWith("contact-sheets/")).length, 4);
  assert.equal(topology.filter((value) => value.startsWith("recordings/") && value.endsWith(".mp4")).length, 4);
  assert.ok(topology.includes(REPORT_PATH));
  assert.ok(topology.includes("routes/home/desktop-1440x900.png"));
  assert.ok(topology.includes("routes/404/landscape-844x390.png"));
  assert.ok(topology.includes("contact-sheets/all-routes-narrow-320x800.png"));
  assert.ok(topology.includes("recordings/04-maradin-media-lifecycle.mp4"));
  assert.equal(new Set(topology).size, topology.length);
  assert.ok(!topology.some((value) => /\.webm$|raw|frames/i.test(value)));
});

test("review capture freezes the required four viewports and lifecycle stories", () => {
  assert.deepEqual(CAPTURE_VIEWS.map(({ width, height }) => `${width}x${height}`), ["1440x900", "390x844", "320x800", "844x390"]);
  assert.deepEqual(RECORDING_SPECS.map(({ id }) => id), [
    "home-forward-reverse-stop",
    "home-entry-manifesto-history",
    "supporting-signature-motion",
    "maradin-media-lifecycle",
  ]);
});

test("encoder command is silent CFR 30fps H.264 yuv420p with stripped metadata", () => {
  const args = encoderArguments("raw.webm", "final.partial.mp4");
  assert.deepEqual(ENCODER_CONTRACT, { audioStreams: 0, codec: "h264", container: "mp4", fps: 30, pixelFormat: "yuv420p" });
  assert.ok(args.includes("-an"));
  assert.deepEqual(args.slice(args.indexOf("-map_metadata"), args.indexOf("-map_metadata") + 2), ["-map_metadata", "-1"]);
  assert.deepEqual(args.slice(args.indexOf("-vf"), args.indexOf("-vf") + 2), ["-vf", "fps=30,format=yuv420p"]);
  assert.deepEqual(args.slice(args.indexOf("-fps_mode"), args.indexOf("-fps_mode") + 2), ["-fps_mode", "cfr"]);
  assert.deepEqual(args.slice(args.indexOf("-c:v"), args.indexOf("-c:v") + 2), ["-c:v", "libx264"]);
  assert.ok(args.includes("+faststart"));
});

test("FFprobe contract rejects audio, variable rate and wrong pixels", () => {
  const valid = {
    format: { duration: "4.2", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
    streams: [{ avg_frame_rate: "30/1", codec_name: "h264", codec_type: "video", height: 720, pix_fmt: "yuv420p", r_frame_rate: "30/1", width: 1280 }],
  };
  assert.equal(recordingContractResult(valid).status, "PASS");
  const invalid = structuredClone(valid);
  invalid.streams[0].pix_fmt = "yuv444p";
  invalid.streams[0].avg_frame_rate = "30000/1001";
  invalid.streams.push({ codec_name: "aac", codec_type: "audio" });
  const result = recordingContractResult(invalid);
  assert.equal(result.status, "FAIL");
  assert.equal(result.checks.yuv420p, false);
  assert.equal(result.checks.constant30Fps, false);
  assert.equal(result.checks.zeroAudioStreams, false);
});

test("CLI accepts an engine, headed mode and optional media-tool paths", () => {
  const output = path.resolve(root, "..", "phase-6-review-work", "firefox-capture");
  const parsed = validateOptions(parseArguments([
    "--base-url", "http://127.0.0.1:4338",
    "--output", output,
    "--engine", "firefox",
    "--headed",
    "--ffmpeg", "C:\\tools\\ffmpeg.exe",
    "--ffprobe", "C:\\tools\\ffprobe.exe",
    "--timeout-ms", "5000",
  ]));
  assert.equal(parsed.baseUrl, "http://127.0.0.1:4338/");
  assert.equal(parsed.engine, "firefox");
  assert.equal(parsed.headed, true);
  assert.equal(parsed.output, output);
  assert.match(parsed.ffmpeg, /tools[\\/]ffmpeg\.exe$/);
  assert.throws(() => validateOptions(parseArguments(["--base-url", "http://127.0.0.1:4338", "--output", output, "--engine", "all"])), /chromium, webkit or firefox/);
});

test("write boundary rejects repository, temp and filesystem-root destinations", () => {
  const external = path.resolve(root, "..", "phase-6-review-work", "capture");
  assert.equal(assertExternalDurablePath(external), external);
  assert.throws(() => assertExternalDurablePath(path.join(root, "artifacts", "phase-6")), /outside the repository/);
  assert.throws(() => assertExternalDurablePath(path.join(os.tmpdir(), "phase-6-review")), /temporary storage/);
  assert.throws(() => assertExternalDurablePath(path.parse(root).root), /filesystem root/);
  assert.equal(ROOT, root);
});

test("self-test and dry-run are import-safe and perform no capture writes", async () => {
  assert.deepEqual(runSelfTest(), { artifacts: 49, recordings: 4, routes: 10, schema: SCHEMA, status: "PASS", views: 4 });
  const output = path.resolve(root, "..", "phase-6-review-work", "dry-run-does-not-write");
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(root, "scripts", "capture-phase6-review-evidence.mjs"),
    "--dry-run",
    "--base-url", "http://127.0.0.1:4338",
    "--output", output,
    "--engine", "webkit",
  ], { cwd: root, windowsHide: true });
  const result = JSON.parse(stdout);
  assert.equal(result.status, "DRY-RUN");
  assert.equal(result.topology.length, 49);
});

test("capture source has guarded publication, raw cleanup and no page scroll writes", async () => {
  const source = await readFile(path.join(root, "scripts", "capture-phase6-review-evidence.mjs"), "utf8");
  assert.match(source, /assertExternalDurablePath\(options\.output\)/);
  assert.match(source, /refusing to overwrite existing Phase 6 capture/);
  assert.match(source, /recordVideo:/);
  assert.match(source, /await rm\(rawFile, \{ force: true \}\)/);
  assert.match(source, /await removeOwnedDirectory\(staging, rawRoot\)/);
  assert.match(source, /validateTopology\(staging/);
  assert.match(source, /path\.resolve\(process\.argv\[1\]\).*fileURLToPath/);
  assert.doesNotMatch(source, /scrollTo\s*\(|scrollIntoView\s*\(|\.scrollTop\s*=/);
  assert.doesNotMatch(source, /artifacts[\\/]evidence[\\/]phase-6|path\.join\(ROOT,\s*["']artifacts/);
});
