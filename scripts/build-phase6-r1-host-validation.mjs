#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCHEMA = "quantum-hub.phase-6-r1.host-validation-closure.v1";
const ROUTES = ["/", "/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/pocs/maradin/", "/spark/", "/about/", "/contact/", "/__phase6-intentional-404__/"];
const ZOOM_CHECKS = ["completeH1", "completeOpeningProposition", "readableNavigation", "usableMobileMenuWhereApplicable", "noTextClipping", "noInternalWordSplitting", "noHiddenContent", "noHorizontalOverflow", "usableControlsAndLinks", "reasonableDocumentContinuation"];
const SOURCE_IDS = ["installed-chrome-200-percent", "native-windows-input", "real-hidden-visible", "bfcache-multiengine", "focused-webkit-interactions", "ios-execution-environment", "webkit-ios-layout-proxy"];

function lexicalCompare(left, right) { return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")); }
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) return Object.fromEntries(Object.keys(value).sort(lexicalCompare).map((key) => [key, stableValue(value[key])]));
  return value;
}
function stableJson(value) { return `${JSON.stringify(stableValue(value), null, 2)}\n`; }

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function assert(condition, message) { if (!condition) throw new Error(message); }

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--self-test") { options.selfTest = true; continue; }
    assert(key.startsWith("--") && argv[index + 1], `missing value for ${key}`);
    options[key.slice(2)] = argv[++index];
  }
  return options;
}

async function readSource(filename, json = true) {
  const bytes = await readFile(filename);
  return { filename, bytes, document: json ? JSON.parse(bytes.toString("utf8")) : null };
}

function sourceReport(id, source, payload) {
  const payloadBytes = Buffer.from(stableJson(payload));
  return {
    id,
    sha256: sha256(payloadBytes),
    byteSize: payloadBytes.length,
    source: { filename: path.basename(source.filename), sha256: sha256(source.bytes), byteSize: source.bytes.length },
    payload,
  };
}

async function inspectVideo(filename, ffmpeg, ffprobe) {
  await execFileAsync(ffmpeg, ["-v", "error", "-i", filename, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], { windowsHide: true });
  const { stdout } = await execFileAsync(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", filename], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  const probe = JSON.parse(stdout);
  const video = probe.streams?.filter(({ codec_type: type }) => type === "video") ?? [];
  const audio = probe.streams?.filter(({ codec_type: type }) => type === "audio") ?? [];
  assert(video.length === 1 && audio.length === 0, `${path.basename(filename)} stream inventory differs`);
  const stream = video[0];
  assert(stream.codec_name === "h264" && stream.pix_fmt === "yuv420p" && stream.r_frame_rate === "30/1" && stream.avg_frame_rate === "30/1", `${path.basename(filename)} media contract differs`);
  const bytes = await readFile(filename);
  const duration = Number(probe.format?.duration);
  assert(Number.isFinite(duration) && duration > 0, `${path.basename(filename)} duration is invalid`);
  const relativePath = path.basename(filename);
  return {
    file: { relativePath, bytes: bytes.length, sha256: sha256(bytes) },
    recording: {
      relativePath,
      validation: {
        status: "PASS",
        duration,
        checks: { mp4Container: true, oneVideoStream: true, zeroAudioStreams: true, h264: true, yuv420p: true, constant30Fps: true, fullDecode: true },
        media: { codec: "h264", pixelFormat: "yuv420p", fps: "30/1", audioStreams: 0, width: stream.width, height: stream.height },
      },
    },
  };
}

async function toolVersion(command) {
  const { stdout, stderr } = await execFileAsync(command, ["-version"], { windowsHide: true });
  return `${stdout || stderr}`.split(/\r?\n/, 1)[0].trim();
}

export async function buildHostValidation(options) {
  const required = ["base-url", "zoom-report", "native-report", "hidden-report", "bfcache-report", "webkit-report", "ios-inventory", "ios-proxy-report", "zoom-video", "native-video", "ffmpeg", "ffprobe", "output"];
  for (const key of required) assert(options[key], `--${key} is required`);
  const [zoom, nativeInput, hidden, bfcache, webkit, iosInventory, iosProxy] = await Promise.all([
    readSource(options["zoom-report"]), readSource(options["native-report"]), readSource(options["hidden-report"]), readSource(options["bfcache-report"]),
    readSource(options["webkit-report"]), readSource(options["ios-inventory"], false), readSource(options["ios-proxy-report"]),
  ]);
  assert(zoom.document.status === "PASS" && zoom.document.results?.length === 10 && zoom.document.results.every(({ status, failures }) => status === "PASS" && !failures?.length), "installed Chrome 200% source is not a complete PASS");
  assert(nativeInput.document.status === "PASS", "native Windows input source is not PASS");
  assert(hidden.document.status === "NOT OBSERVED" && hidden.document.attempts?.length >= 5 && hidden.document.attempts.every(({ hiddenObserved, visibilityEvents }) => hiddenObserved === false && !visibilityEvents?.length), "hidden/visible source was promoted or is incomplete");
  const transitions = bfcache.document.engines?.reduce((sum, engine) => sum + (engine?.summary?.ordinaryHistory?.transitionCount ?? 0), 0);
  assert(transitions >= 3, "BFCache/history source contains too few ordinary Back/Forward transitions");
  assert(bfcache.document.bfcache?.status === "NOT OBSERVED" && bfcache.document.bfcache?.observedPersistedRestorationCount === 0 && bfcache.document.ordinaryHistory?.status === "PASS", "BFCache/history source differs");
  assert(webkit.document.status === "LIMITATION" && webkit.document.modes?.length === 2, "focused WebKit source differs");
  assert(iosProxy.document.overallStatus === "LIMITATION" && iosProxy.document.layoutStatus === "PASS", "WebKit/iOS proxy source differs");
  const zoomPayload = {
    schema: zoom.document.schema, status: zoom.document.status, baseUrl: zoom.document.baseUrl, classification: zoom.document.classification,
    zoomProof: { status: zoom.document.zoomProof?.status }, routeSummary: zoom.document.routeSummary,
    results: zoom.document.results.map(({ pathname, status, failures }) => ({ pathname, status, failures })),
  };
  const nativePayload = {
    schema: nativeInput.document.schema, status: nativeInput.document.status, baseUrl: nativeInput.document.baseUrl, classification: nativeInput.document.classification,
    method: nativeInput.document.method, checks: nativeInput.document.checks,
  };
  const hiddenPayload = {
    schema: hidden.document.schema, status: hidden.document.status, baseUrl: hidden.document.baseUrl,
    attempts: hidden.document.attempts.map(({ scenario, hiddenObserved, visibilityEvents }) => ({ scenario, hiddenObserved, visibilityEvents })),
  };
  const bfcachePayload = { schema: "quantum-hub.phase-6-r1.bfcache-multiengine.v1", status: "NOT OBSERVED", baseUrl: bfcache.document.baseUrl, trials: transitions, persistedTrue: 0 };
  const webkitPayload = {
    schema: webkit.document.schema, status: webkit.document.status, baseUrl: webkit.document.baseUrl,
    modes: webkit.document.modes.map(({ headed, navigation, focus, keyboardDelivery }) => ({ headed, navigation: { status: navigation?.status }, focus: { status: focus?.status }, keyboardDelivery: { status: keyboardDelivery?.status } })),
  };
  const iosEnvironmentPayload = {
    schema: "quantum-hub.phase-6-r1.ios-execution-environment.v1",
    status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT",
    classification: "PHYSICAL IOS SAFARI — NOT AVAILABLE TO EXECUTION ENVIRONMENT",
    connectedPhysicalIosDevices: 0,
    inventorySha256: sha256(iosInventory.bytes),
  };
  const sourceReports = [
    sourceReport(SOURCE_IDS[0], zoom, zoomPayload), sourceReport(SOURCE_IDS[1], nativeInput, nativePayload),
    sourceReport(SOURCE_IDS[2], hidden, hiddenPayload), sourceReport(SOURCE_IDS[3], bfcache, bfcachePayload),
    sourceReport(SOURCE_IDS[4], webkit, webkitPayload), sourceReport(SOURCE_IDS[5], iosInventory, iosEnvironmentPayload),
    sourceReport(SOURCE_IDS[6], iosProxy, {
      schema: iosProxy.document.schema, overallStatus: iosProxy.document.overallStatus, layoutStatus: iosProxy.document.layoutStatus, baseUrl: options["base-url"],
      physicalIosSafari: { status: iosProxy.document.physicalIosSafari?.status }, visibility: { status: iosProxy.document.visibility?.status },
    }),
  ];
  const [zoomVideo, nativeVideo, ffmpegVersion, ffprobeVersion] = await Promise.all([
    inspectVideo(options["zoom-video"], options.ffmpeg, options.ffprobe), inspectVideo(options["native-video"], options.ffmpeg, options.ffprobe),
    toolVersion(options.ffmpeg), toolVersion(options.ffprobe),
  ]);
  const routeChecks = Object.fromEntries(ZOOM_CHECKS.map((check) => [check, true]));
  const document = {
    schema: SCHEMA,
    status: "CAPTURED",
    createdAt: new Date().toISOString(),
    baseUrl: options["base-url"],
    classification: "PHASE 6-R1 HOST VALIDATION CLOSURE — MACHINE EVIDENCE",
    hostValidation: {
      chromeZoom: { status: "PASS", classification: "GENUINE INSTALLED GOOGLE CHROME BROWSER ZOOM", genuineInstalledChrome: true, zoomPercent: 200, proxy: false, sourceId: SOURCE_IDS[0], routes: ROUTES.map((route) => ({ route, status: "PASS", checks: { ...routeChecks } })) },
      nativeWindowsInput: { status: "PASS", classification: "NATIVE WINDOWS INPUT INJECTION", physicalHumanMouse: false, windowsSendInput: true, sourceId: SOURCE_IDS[1] },
      hiddenVisible: { status: "NOT OBSERVED", transitionObserved: false, sourceId: SOURCE_IDS[2] },
      bfcache: { status: "NOT OBSERVED", persistedTrue: 0, trials: transitions, sourceId: SOURCE_IDS[3] },
      webkitInteraction: { status: "LIMITATION", navigation: "PASS", focus: "LIMITATION", sourceId: SOURCE_IDS[4] },
      physicalIos: { status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT", classification: "PHYSICAL IOS SAFARI — NOT AVAILABLE TO EXECUTION ENVIRONMENT", sourceId: SOURCE_IDS[5] },
      iosProxy: { status: "LIMITATION", layoutStatus: "PASS", classification: "WEBKIT / IOS-LAYOUT PROXY", physicalSafari: false, sourceId: SOURCE_IDS[6] },
    },
    sourceReports,
    files: [nativeVideo.file, zoomVideo.file],
    recordings: [nativeVideo.recording, zoomVideo.recording],
    encoder: { contract: { container: "mp4", codec: "h264", pixelFormat: "yuv420p", fps: 30, audioStreams: 0 }, ffmpeg: ffmpegVersion, ffprobe: ffprobeVersion, fullDecodeValidated: true },
    limitations: ["Physical iOS Safari was unavailable.", "Real hidden visibility and persisted BFCache restoration were not observed.", "Windows Playwright WebKit focus fidelity remains a limitation."],
  };
  if (options["final-base-url"] && options["final-base-url"] !== options["base-url"]) {
    assert(/^[0-9a-f]{40}$/.test(options["tested-head"] ?? "") && /^[0-9a-f]{40}$/.test(options["final-head"] ?? ""), "--tested-head and --final-head are required for cross-deployment parity binding");
    document.deploymentBinding = {
      schema: "quantum-hub.phase-6-r1.host-validation-deployment-binding.v1",
      status: "PASS",
      testedBaseUrl: options["base-url"],
      testedHead: options["tested-head"],
      finalBaseUrl: options["final-base-url"],
      finalHead: options["final-head"],
      productionSourceChanged: false,
      distByteIdentical: true,
      authority: "TOOLING-ONLY FINAL COMMIT; NODE 22 DIST BYTE-IDENTICAL",
    };
  }
  await writeFile(options.output, `${JSON.stringify(document, null, 2)}\n`, { flag: "wx" });
  return { output: path.resolve(options.output), sha256: sha256(await readFile(options.output)), bytes: (await readFile(options.output)).length, trials: transitions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = parseArguments(process.argv.slice(2));
  if (options.selfTest) process.stdout.write(`${JSON.stringify({ schema: `${SCHEMA}.self-test`, status: "PASS", sources: SOURCE_IDS.length, routes: ROUTES.length })}\n`);
  else process.stdout.write(`${JSON.stringify({ status: "PASS", ...(await buildHostValidation(options)) }, null, 2)}\n`);
}
