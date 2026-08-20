#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionRootNames = Object.freeze(["src", "public", "dist"]);
const productionRoots = productionRootNames.map((entry) => path.join(repositoryRoot, entry));
const mediaLabRoot = path.join(repositoryRoot, "prototypes", "phase-3-crt-media-lab");
const candidateDefinitions = [
  {
    id: "desktop-mp4",
    flag: "desktop-mp4",
    role: "desktop",
    container: "mp4",
    codec: "h264",
    mime: 'video/mp4; codecs="avc1"',
  },
  {
    id: "desktop-webm",
    flag: "desktop-webm",
    role: "desktop",
    container: "webm",
    codec: "vp9",
    mime: 'video/webm; codecs="vp9"',
  },
  {
    id: "mobile-mp4",
    flag: "mobile-mp4",
    role: "mobile",
    container: "mp4",
    codec: "h264",
    mime: 'video/mp4; codecs="avc1"',
  },
  {
    id: "mobile-webm",
    flag: "mobile-webm",
    role: "mobile",
    container: "webm",
    codec: "vp9",
    mime: 'video/webm; codecs="vp9"',
  },
];

const HELP = [
  "Phase 3 isolated media QA",
  "",
  "Usage:",
  "  node scripts/qa-phase3-media.mjs \\",
  "    --ffprobe <absolute-path> --output <report.json> \\",
  "    --desktop-mp4 <file> --desktop-webm <file> \\",
  "    --mobile-mp4 <file> --mobile-webm <file>",
  "",
  "Options:",
  "  --browser-executable <file>   Explicit Chromium executable",
  "  --headed                      Run Chromium visibly for focus/visibility evidence",
  "  --require-browser             Fail unless browser evidence is complete",
  "  --record-video <file.webm>    Record the actual isolated media-lab UI run",
  "  --record-candidate <id>       Candidate shown in recording; default desktop-webm",
  "  --expected-fps <number>       Default: 30",
  "  --expected-duration <seconds> Default: 9",
  "  --expected-frames <integer>   Default: 270",
  "  --expected-gop <integer>      Default: 12",
  "  --desktop-width <integer>     Default: 1920",
  "  --desktop-height <integer>    Default: 1080",
  "  --mobile-width <integer>      Default: 720",
  "  --mobile-height <integer>     Default: 1280",
  "  --seed <uint32>               Default: 303270",
  "  --seek-timeout-ms <integer>   Default: 5000",
  "  --metadata-timeout-ms <int>   Default: 12000",
  "  --linear-sample-ms <integer>  Default: 1200",
  "",
  "All media is served from an in-memory localhost harness. The script rejects",
  "candidate, report, and recorded-video paths inside src, public, or dist.",
  "Recording requires --headed and writes Playwright WebM to the exact path.",
].join("\n");

function parseArguments(argv) {
  const values = new Map();
  const booleans = new Set(["help", "headed", "require-browser"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error("Unexpected positional argument: " + token);
    }
    const name = token.slice(2);
    if (booleans.has(name)) {
      values.set(name, true);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error("Missing value for --" + name);
    }
    values.set(name, next);
    index += 1;
  }
  if (values.get("help")) {
    process.stdout.write(HELP + "\n");
    process.exit(0);
  }

  const required = ["ffprobe", "output", ...candidateDefinitions.map((entry) => entry.flag)];
  for (const name of required) {
    if (!values.has(name)) {
      throw new Error("Missing required option --" + name + "\n\n" + HELP);
    }
  }

  const numberOption = (name, fallback, integer = false) => {
    const raw = values.get(name);
    const parsed = raw === undefined ? fallback : Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0 || (integer && !Number.isInteger(parsed))) {
      throw new Error("--" + name + " must be a positive " + (integer ? "integer" : "number"));
    }
    return parsed;
  };

  const headed = values.get("headed") === true;
  const recordVideo = values.has("record-video")
    ? path.resolve(String(values.get("record-video")))
    : null;
  const recordCandidate = String(values.get("record-candidate") || "desktop-webm");
  const knownCandidateIds = new Set(candidateDefinitions.map(({ id }) => id));
  if (!knownCandidateIds.has(recordCandidate)) {
    throw new Error(
      "--record-candidate must be one of " + [...knownCandidateIds].join(", "),
    );
  }
  if (recordVideo && path.extname(recordVideo).toLowerCase() !== ".webm") {
    throw new Error("--record-video must use a .webm extension because Playwright records WebM");
  }
  if (recordVideo && !headed) {
    throw new Error("--record-video requires --headed for visible review evidence");
  }

  const options = {
    ffprobe: path.resolve(String(values.get("ffprobe"))),
    output: path.resolve(String(values.get("output"))),
    browserExecutable: values.has("browser-executable")
      ? path.resolve(String(values.get("browser-executable")))
      : null,
    headed,
    requireBrowser: values.get("require-browser") === true || recordVideo !== null,
    recordVideo,
    recordCandidate,
    expectedFps: numberOption("expected-fps", 30),
    expectedDuration: numberOption("expected-duration", 9),
    expectedFrames: numberOption("expected-frames", 270, true),
    expectedGop: numberOption("expected-gop", 12, true),
    desktopWidth: numberOption("desktop-width", 1920, true),
    desktopHeight: numberOption("desktop-height", 1080, true),
    mobileWidth: numberOption("mobile-width", 720, true),
    mobileHeight: numberOption("mobile-height", 1280, true),
    seed: numberOption("seed", 303270, true) >>> 0,
    seekTimeoutMs: numberOption("seek-timeout-ms", 5000, true),
    metadataTimeoutMs: numberOption("metadata-timeout-ms", 12000, true),
    linearSampleMs: numberOption("linear-sample-ms", 1200, true),
    candidates: candidateDefinitions.map((definition) => ({
      ...definition,
      absolutePath: path.resolve(String(values.get(definition.flag))),
    })),
  };

  return options;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertIsolatedPath(absolutePath, label) {
  for (const [index, root] of productionRoots.entries()) {
    if (isWithin(root, absolutePath)) {
      throw new Error(
        label + " must remain outside production root " + productionRootNames[index],
      );
    }
  }
}

function portablePath(absolutePath) {
  const resolved = path.resolve(absolutePath);
  if (isWithin(repositoryRoot, resolved)) {
    return path.relative(repositoryRoot, resolved).replaceAll("\\", "/");
  }
  return path.basename(resolved);
}

function portablePathScope(absolutePath) {
  return isWithin(repositoryRoot, path.resolve(absolutePath)) ? "repository-relative" : "external-basename";
}

function escapedPattern(value) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function knownHostRoots(additionalPaths = []) {
  return [
    repositoryRoot,
    process.cwd(),
    process.env.USERPROFILE,
    process.env.HOME,
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    process.env.TEMP,
    process.env.TMP,
    ...additionalPaths,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => path.resolve(value))
    .sort((left, right) => right.length - left.length);
}

function sanitizeTrackedString(value, additionalPaths = []) {
  let sanitized = value;
  for (const root of knownHostRoots(additionalPaths)) {
    const variants = new Set([root, root.replaceAll("\\", "/"), root.replaceAll("/", "\\")]);
    for (const variant of variants) {
      sanitized = sanitized.replace(
        new RegExp(escapedPattern(variant), process.platform === "win32" ? "gi" : "g"),
        "<host-root>",
      );
    }
  }
  sanitized = sanitized
    .replace(
      /(^|[\s"'\x60(])([A-Za-z]:[\\/][^\r\n"'\x60<>|]*)/gm,
      (_match, boundary) => boundary + "<host-path>",
    )
    .replace(
      /(^|[\s"'\x60(])\/(?:Users|home|tmp|private\/var|var\/tmp|Applications|opt|usr\/bin|usr\/local\/bin)\/[^\r\n"'\x60<>|]*/gm,
      (_match, boundary) => boundary + "<host-path>",
    );
  return sanitized;
}

function sanitizeTrackedValue(value, additionalPaths = []) {
  if (typeof value === "string") return sanitizeTrackedString(value, additionalPaths);
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeTrackedValue(entry, additionalPaths));
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      sanitizeTrackedValue(child, additionalPaths),
    ]),
  );
}

function assertTrackedReportPrivacy(value, additionalPaths = []) {
  const failures = [];
  const visit = (child, location) => {
    if (typeof child === "string") {
      if (/(?:^|[\s"'\x60(])[A-Za-z]:[\\/]/m.test(child)) {
        failures.push(location + " contains a drive-absolute path");
      }
      if (
        /(?:^|[\s"'\x60(])\/(?:Users|home|tmp|private\/var|var\/tmp|Applications|opt|usr\/bin|usr\/local\/bin)\//m.test(
          child,
        )
      ) {
        failures.push(location + " contains a host-absolute path");
      }
      for (const root of knownHostRoots(additionalPaths)) {
        if (
          child.includes(root) ||
          child.includes(root.replaceAll("\\", "/")) ||
          child.includes(root.replaceAll("/", "\\"))
        ) {
          failures.push(location + " contains a known host root");
          break;
        }
      }
      return;
    }
    if (Array.isArray(child)) {
      child.forEach((entry, index) => visit(entry, location + "[" + index + "]"));
      return;
    }
    if (child && typeof child === "object") {
      for (const [key, entry] of Object.entries(child)) visit(entry, location + "." + key);
    }
  };
  visit(value, "$");
  if (failures.length > 0) {
    throw new Error(
      "Tracked media QA report failed absolute-path privacy assertion: " +
        failures.slice(0, 8).join("; "),
    );
  }
}

async function exists(absolutePath) {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseRational(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!value.includes("/")) {
    const direct = Number(value);
    return Number.isFinite(direct) ? direct : null;
  }
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function sha256(absolutePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(absolutePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function runExecutable(executable, args, label) {
  try {
    const result = await execFileAsync(executable, args, {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const stderr = String(error.stderr || "").trim();
    return {
      ok: false,
      error: label + " failed: " + String(error.message || error) + (stderr ? " | " + stderr : ""),
    };
  }
}

function check(id, expected, actual, pass, tolerance = null) {
  return {
    id,
    expected,
    actual,
    tolerance,
    pass: Boolean(pass),
  };
}

function expectedCompatibility(candidate) {
  if (candidate.container === "mp4") {
    return {
      safariIos: {
        status: "expected-not-executed",
        tested: false,
        expectation: "expected",
        basis: "H.264 in MP4 is the compatibility delivery candidate; profile, level, color, and device behavior still require target-device execution.",
      },
      firefox: {
        status: "expected-not-executed",
        tested: false,
        expectation: "expected",
        basis: "H.264 MP4 is expected where the operating system exposes an H.264 decoder; this report does not claim a Firefox execution result.",
      },
    };
  }
  return {
    safariIos: {
      status: "expected-not-executed",
      tested: false,
      expectation: "conditional",
      basis: "VP9 WebM support varies by Safari/iOS version and hardware path; retain H.264 MP4 as the compatibility fallback.",
    },
    firefox: {
      status: "expected-not-executed",
      tested: false,
      expectation: "expected",
      basis: "VP9 WebM is expected in current Firefox releases, but Firefox was not executed by this Chromium-only protocol.",
    },
  };
}

async function probeCandidate(options, candidate) {
  const expectedWidth = candidate.role === "desktop" ? options.desktopWidth : options.mobileWidth;
  const expectedHeight = candidate.role === "desktop" ? options.desktopHeight : options.mobileHeight;
  const base = {
    id: candidate.id,
    role: candidate.role,
    path: portablePath(candidate.absolutePath),
    pathScope: portablePathScope(candidate.absolutePath),
    expected: {
      container: candidate.container,
      codec: candidate.codec,
      width: expectedWidth,
      height: expectedHeight,
      fps: options.expectedFps,
      durationSeconds: options.expectedDuration,
      frames: options.expectedFrames,
      gopFrames: options.expectedGop,
      audioStreams: 0,
    },
    compatibility: expectedCompatibility(candidate),
  };

  if (!(await exists(candidate.absolutePath))) {
    return {
      ...base,
      status: "failed",
      file: { exists: false },
      probe: { tested: false, reason: "candidate file does not exist" },
      validations: [check("file-exists", true, false, false)],
    };
  }

  const fileStat = await stat(candidate.absolutePath);
  const fileHash = await sha256(candidate.absolutePath);
  const metadataRun = await runExecutable(
    options.ffprobe,
    [
      "-hide_banner",
      "-v",
      "error",
      "-count_frames",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      candidate.absolutePath,
    ],
    "ffprobe metadata for " + candidate.id,
  );
  if (!metadataRun.ok) {
    return {
      ...base,
      status: "failed",
      file: { exists: true, bytes: fileStat.size, sha256: fileHash },
      probe: { tested: true, passed: false, error: metadataRun.error },
      validations: [check("ffprobe-readable", true, false, false)],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(metadataRun.stdout);
  } catch (error) {
    return {
      ...base,
      status: "failed",
      file: { exists: true, bytes: fileStat.size, sha256: fileHash },
      probe: { tested: true, passed: false, error: "ffprobe returned invalid JSON: " + error.message },
      validations: [check("ffprobe-json", true, false, false)],
    };
  }

  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const videoStreams = streams.filter((stream) => stream.codec_type === "video");
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  const auxiliaryStreams = streams.filter(
    (stream) => stream.codec_type !== "video" && stream.codec_type !== "audio",
  );
  const video = videoStreams[0] || {};
  const fps = parseRational(video.avg_frame_rate) ?? parseRational(video.r_frame_rate);
  const duration = numeric(video.duration) ?? numeric(parsed.format?.duration);
  const frameCount =
    numeric(video.nb_read_frames) ??
    numeric(video.nb_frames) ??
    (duration !== null && fps !== null ? Math.round(duration * fps) : null);
  const bitRate = numeric(video.bit_rate) ?? numeric(parsed.format?.bit_rate);
  const formatName = String(parsed.format?.format_name || "");
  const codecName = String(video.codec_name || "");
  const durationTolerance = Math.max(0.002, 0.5 / options.expectedFps);
  const fpsTolerance = 0.001;

  const keyframeRun = await runExecutable(
    options.ffprobe,
    [
      "-hide_banner",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-skip_frame",
      "nokey",
      "-show_frames",
      "-show_entries",
      "frame=best_effort_timestamp_time,pkt_dts_time,key_frame,pict_type",
      "-of",
      "json",
      candidate.absolutePath,
    ],
    "ffprobe keyframes for " + candidate.id,
  );

  let keyframes = [];
  let keyframeError = null;
  if (keyframeRun.ok) {
    try {
      const keyframeJson = JSON.parse(keyframeRun.stdout);
      keyframes = (Array.isArray(keyframeJson.frames) ? keyframeJson.frames : [])
        .map((frame) => {
          const seconds =
            numeric(frame.best_effort_timestamp_time) ?? numeric(frame.pkt_dts_time);
          return {
            seconds: round(seconds, 6),
            frame: seconds !== null && fps !== null ? Math.round(seconds * fps) : null,
            pictureType: frame.pict_type || null,
          };
        })
        .filter((entry) => entry.seconds !== null);
    } catch (error) {
      keyframeError = "Unable to parse ffprobe keyframe JSON: " + error.message;
    }
  } else {
    keyframeError = keyframeRun.error;
  }

  const keyframeIntervals = [];
  for (let index = 1; index < keyframes.length; index += 1) {
    const previous = keyframes[index - 1];
    const current = keyframes[index];
    keyframeIntervals.push({
      seconds: round(current.seconds - previous.seconds, 6),
      frames:
        current.frame !== null && previous.frame !== null ? current.frame - previous.frame : null,
    });
  }
  const intervalFrames = keyframeIntervals.map((entry) => entry.frames).filter(Number.isFinite);
  const firstKeyframe = keyframes[0]?.frame ?? null;
  const lastKeyframe = keyframes.at(-1)?.frame ?? null;
  const tailFrames =
    lastKeyframe !== null && frameCount !== null ? Math.max(0, frameCount - lastKeyframe) : null;
  const cadencePass =
    keyframeError === null &&
    keyframes.length > 0 &&
    firstKeyframe === 0 &&
    intervalFrames.every((frames) => frames === options.expectedGop) &&
    tailFrames !== null &&
    tailFrames > 0 &&
    tailFrames <= options.expectedGop;

  const containerPass =
    candidate.container === "mp4" ? /(?:mov|mp4)/i.test(formatName) : /webm/i.test(formatName);
  const validations = [
    check("exactly-one-video-stream", 1, videoStreams.length, videoStreams.length === 1),
    check("no-audio-stream", 0, audioStreams.length, audioStreams.length === 0),
    check("no-auxiliary-stream", 0, auxiliaryStreams.length, auxiliaryStreams.length === 0),
    check("container", candidate.container, formatName, containerPass),
    check("codec", candidate.codec, codecName, codecName === candidate.codec),
    check("width", expectedWidth, numeric(video.width), numeric(video.width) === expectedWidth),
    check("height", expectedHeight, numeric(video.height), numeric(video.height) === expectedHeight),
    check(
      "fps",
      options.expectedFps,
      round(fps, 6),
      fps !== null && Math.abs(fps - options.expectedFps) <= fpsTolerance,
      fpsTolerance,
    ),
    check(
      "duration-seconds",
      options.expectedDuration,
      round(duration, 6),
      duration !== null && Math.abs(duration - options.expectedDuration) <= durationTolerance,
      round(durationTolerance, 6),
    ),
    check("frame-count", options.expectedFrames, frameCount, frameCount === options.expectedFrames),
    check(
      "keyframe-gop-cadence",
      options.expectedGop,
      {
        firstKeyframe,
        intervalsFrames: intervalFrames,
        tailFrames,
      },
      cadencePass,
    ),
  ];
  const passed = validations.every((entry) => entry.pass);

  return {
    ...base,
    status: passed ? "passed-probe" : "failed",
    file: {
      exists: true,
      bytes: fileStat.size,
      sha256: fileHash,
    },
    probe: {
      tested: true,
      passed,
      formatName,
      formatLongName: parsed.format?.format_long_name || null,
      codecName,
      codecLongName: video.codec_long_name || null,
      codecProfile: video.profile || null,
      codecLevel: numeric(video.level),
      pixelFormat: video.pix_fmt || null,
      colorSpace: video.color_space || null,
      colorTransfer: video.color_transfer || null,
      colorPrimaries: video.color_primaries || null,
      width: numeric(video.width),
      height: numeric(video.height),
      fps: round(fps, 6),
      fpsSource: video.avg_frame_rate || video.r_frame_rate || null,
      durationSeconds: round(duration, 6),
      frames: frameCount,
      bitRateBitsPerSecond: bitRate,
      bitRateMegabitsPerSecond: bitRate === null ? null : round(bitRate / 1_000_000, 3),
      videoStreams: videoStreams.length,
      audioStreams: audioStreams.length,
      auxiliaryStreams: auxiliaryStreams.length,
      keyframes: {
        tested: keyframeError === null,
        error: keyframeError,
        count: keyframes.length,
        positions: keyframes,
        intervals: keyframeIntervals,
        observedMaxGopFrames: intervalFrames.length ? Math.max(...intervalFrames) : null,
        expectedGopFrames: options.expectedGop,
        tailFrames,
        passed: cadencePass,
      },
    },
    validations,
  };
}

function seededFractions(seed, count) {
  let state = seed >>> 0;
  const values = [];
  for (let index = 0; index < count; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const unit = state / 4294967296;
    values.push(round(0.04 + unit * 0.92, 9));
  }
  return values;
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const position = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function latencyDistribution(seeks) {
  const values = seeks
    .filter((entry) => entry.ok && Number.isFinite(entry.displayLatencyMs))
    .map((entry) => entry.displayLatencyMs)
    .sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    samples: values.length,
    minimumMs: round(values[0]),
    medianMs: round(percentile(values, 0.5)),
    p90Ms: round(percentile(values, 0.9)),
    p95Ms: round(percentile(values, 0.95)),
    maximumMs: round(values.at(-1)),
    meanMs: values.length ? round(total / values.length) : null,
  };
}

async function resolveChromium(explicitExecutable) {
  let playwright;
  try {
    playwright = await import("playwright-core");
  } catch (error) {
    return {
      available: false,
      reason: "playwright-core import failed: " + error.message,
    };
  }

  const candidates = [];
  if (explicitExecutable) candidates.push({ path: explicitExecutable, source: "cli" });
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    candidates.push({
      path: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      source: "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
    });
  }
  try {
    const managed = playwright.chromium.executablePath();
    if (managed) candidates.push({ path: managed, source: "playwright-managed" });
  } catch {
    // An installed playwright-core package does not guarantee a managed browser.
  }

  if (process.platform === "win32") {
    const roots = [
      process.env.PROGRAMFILES,
      process.env["PROGRAMFILES(X86)"],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    for (const root of roots) {
      candidates.push(
        { path: path.join(root, "Google", "Chrome", "Application", "chrome.exe"), source: "chrome" },
        {
          path: path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
          source: "edge",
        },
      );
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      {
        path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        source: "chrome",
      },
      {
        path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        source: "edge",
      },
    );
  } else {
    for (const executable of [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    ]) {
      candidates.push({ path: executable, source: "system-browser" });
    }
  }

  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate.path) continue;
    const absolute = path.resolve(candidate.path);
    const key = process.platform === "win32" ? absolute.toLowerCase() : absolute;
    if (seen.has(key)) continue;
    seen.add(key);
    if (await exists(absolute)) {
      return {
        available: true,
        playwright,
        chromium: playwright.chromium,
        executablePath: absolute,
        executableSource: candidate.source,
      };
    }
  }

  return {
    available: false,
    reason:
      "playwright-core is installed but no Chromium executable was found; pass --browser-executable",
  };
}

function mimeFor(candidate) {
  return candidate.container === "mp4" ? "video/mp4" : "video/webm";
}

function pageHtml(candidate) {
  const safeId = JSON.stringify(candidate.id);
  const source = "/media/" + encodeURIComponent(candidate.id);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>Phase 3 isolated media QA</title>",
    "<style>",
    "html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#080b0c}",
    "video{display:block;width:100%;height:100%;object-fit:contain;background:#080b0c}",
    "</style>",
    "</head>",
    "<body>",
    '<video id="candidate" muted playsinline preload="auto"></video>',
    "<script>",
    "const video=document.getElementById('candidate');",
    "window.__phase3Qa={id:" + safeId + ",events:[],createdAt:performance.now()};",
    "for(const name of ['loadstart','loadedmetadata','loadeddata','canplay','playing','pause','seeking','seeked','waiting','stalled','suspend','ended','error']){",
    "video.addEventListener(name,()=>window.__phase3Qa.events.push({name,time:performance.now(),currentTime:video.currentTime,readyState:video.readyState,networkState:video.networkState,error:video.error?video.error.code:null}));",
    "}",
    "video.src=" + JSON.stringify(source) + ";",
    "video.load();",
    "</script>",
    "</body>",
    "</html>",
  ].join("");
}

async function createHarnessServer(candidates) {
  const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const headers = {
        "Cache-Control": "no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      };
      if (url.pathname === "/health") {
        response.writeHead(200, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
        response.end("phase-3-media-qa\n");
        return;
      }
      if (url.pathname === "/lab") {
        response.writeHead(308, { ...headers, Location: "/lab/" });
        response.end();
        return;
      }
      const labFiles = new Map([
        ["/lab/", { name: "index.html", type: "text/html; charset=utf-8" }],
        ["/lab/index.html", { name: "index.html", type: "text/html; charset=utf-8" }],
        ["/lab/app.js", { name: "app.js", type: "text/javascript; charset=utf-8" }],
        ["/lab/styles.css", { name: "styles.css", type: "text/css; charset=utf-8" }],
      ]);
      const labFile = labFiles.get(url.pathname);
      if (labFile) {
        const contents = await readFile(path.join(mediaLabRoot, labFile.name));
        const labHeaders = {
          ...headers,
          "Content-Type": labFile.type,
        };
        if (labFile.name === "index.html") {
          labHeaders["Content-Security-Policy"] =
            "default-src 'self'; base-uri 'none'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self'; frame-ancestors 'none'";
        }
        response.writeHead(200, labHeaders);
        response.end(contents);
        return;
      }
      if (url.pathname === "/qa") {
        const id = url.searchParams.get("id");
        const candidate = candidateMap.get(id);
        if (!candidate) {
          response.writeHead(404, headers);
          response.end();
          return;
        }
        const html = pageHtml(candidate);
        response.writeHead(200, {
          ...headers,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'self'; base-uri 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'",
        });
        response.end(html);
        return;
      }
      if (url.pathname.startsWith("/media/")) {
        const id = decodeURIComponent(url.pathname.slice("/media/".length));
        const candidate = candidateMap.get(id);
        if (!candidate || !(await exists(candidate.absolutePath))) {
          response.writeHead(404, headers);
          response.end();
          return;
        }
        const fileStat = await stat(candidate.absolutePath);
        const range = request.headers.range;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
          if (!match) {
            response.writeHead(416, {
              ...headers,
              "Content-Range": "bytes */" + fileStat.size,
            });
            response.end();
            return;
          }
          const start = match[1] === "" ? 0 : Number(match[1]);
          const end = match[2] === "" ? fileStat.size - 1 : Number(match[2]);
          if (
            !Number.isInteger(start) ||
            !Number.isInteger(end) ||
            start < 0 ||
            end < start ||
            start >= fileStat.size
          ) {
            response.writeHead(416, {
              ...headers,
              "Content-Range": "bytes */" + fileStat.size,
            });
            response.end();
            return;
          }
          const boundedEnd = Math.min(end, fileStat.size - 1);
          response.writeHead(206, {
            ...headers,
            "Accept-Ranges": "bytes",
            "Content-Type": mimeFor(candidate),
            "Content-Length": boundedEnd - start + 1,
            "Content-Range": "bytes " + start + "-" + boundedEnd + "/" + fileStat.size,
          });
          createReadStream(candidate.absolutePath, { start, end: boundedEnd }).pipe(response);
          return;
        }
        response.writeHead(200, {
          ...headers,
          "Accept-Ranges": "bytes",
          "Content-Type": mimeFor(candidate),
          "Content-Length": fileStat.size,
        });
        if (request.method === "HEAD") {
          response.end();
        } else {
          createReadStream(candidate.absolutePath).pipe(response);
        }
        return;
      }
      response.writeHead(404, headers);
      response.end();
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(String(error.message || error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    server,
    origin: "http://127.0.0.1:" + address.port,
  };
}

async function waitForMetadata(page, timeoutMs) {
  const started = Date.now();
  try {
    await page.waitForFunction(
      () => {
        const video = document.getElementById("candidate");
        return video && (video.readyState >= 1 || video.error);
      },
      null,
      { timeout: timeoutMs },
    );
  } catch {
    // Return a structured timeout record below.
  }
  return page.evaluate((wallLatencyMs) => {
    const video = document.getElementById("candidate");
    const events = window.__phase3Qa?.events || [];
    const createdAt = window.__phase3Qa?.createdAt || 0;
    const event = (name) => events.find((entry) => entry.name === name);
    const loadedMetadata = event("loadedmetadata");
    const loadedData = event("loadeddata");
    return {
      ok: Boolean(video && video.readyState >= 1 && !video.error),
      wallLatencyMs,
      metadataLatencyMs: loadedMetadata ? loadedMetadata.time - createdAt : null,
      firstUsableFrameLatencyMs: loadedData ? loadedData.time - createdAt : null,
      duration: Number.isFinite(video?.duration) ? video.duration : null,
      videoWidth: video?.videoWidth || null,
      videoHeight: video?.videoHeight || null,
      readyState: video?.readyState ?? null,
      networkState: video?.networkState ?? null,
      errorCode: video?.error?.code ?? null,
      canPlayType: {
        mp4H264: video?.canPlayType('video/mp4; codecs="avc1"') || "",
        webmVp9: video?.canPlayType('video/webm; codecs="vp9"') || "",
      },
      events,
    };
  }, Date.now() - started);
}

async function seekOnce(page, targetSeconds, label, timeoutMs, fps) {
  return page.evaluate(
    ({ targetSeconds, label, timeoutMs, fps }) =>
      new Promise((resolve) => {
        const video = document.getElementById("candidate");
        const start = performance.now();
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const maximum = Math.max(0, duration - Math.max(0.001, 0.25 / fps));
        const target = Math.min(maximum, Math.max(0, targetSeconds));
        let completed = false;
        let seekedAt = null;
        let timeoutId = null;
        let frameFallbackId = null;

        const finish = (details) => {
          if (completed) return;
          completed = true;
          clearTimeout(timeoutId);
          clearTimeout(frameFallbackId);
          video.removeEventListener("seeked", onSeeked);
          const actual = video.currentTime;
          const tolerance = Math.max(0.06, 1.5 / fps);
          resolve({
            label,
            targetSeconds: target,
            actualSeconds: actual,
            absoluteErrorSeconds: Math.abs(actual - target),
            toleranceSeconds: tolerance,
            seekEventLatencyMs: seekedAt === null ? null : seekedAt - start,
            displayLatencyMs: performance.now() - start,
            readyState: video.readyState,
            networkState: video.networkState,
            requestVideoFrameCallback: "requestVideoFrameCallback" in video,
            framePresented: Boolean(details.framePresented),
            mediaTime: details.mediaTime ?? null,
            presentationTime: details.presentationTime ?? null,
            timedOut: Boolean(details.timedOut),
            note: details.note || null,
            ok:
              !details.timedOut &&
              !video.error &&
              Math.abs(actual - target) <= tolerance &&
              (details.framePresented || !("requestVideoFrameCallback" in video)),
            errorCode: video.error?.code ?? null,
          });
        };

        const present = () => {
          if ("requestVideoFrameCallback" in video) {
            video.requestVideoFrameCallback((presentationTime, metadata) => {
              finish({
                framePresented: true,
                mediaTime: metadata.mediaTime,
                presentationTime,
              });
            });
            frameFallbackId = setTimeout(
              () =>
                finish({
                  framePresented: false,
                  note: "seeked but no video-frame callback arrived",
                }),
              Math.min(1000, timeoutMs / 2),
            );
          } else {
            finish({
              framePresented: false,
              note: "requestVideoFrameCallback unavailable; seeked event is the display proxy",
            });
          }
        };

        function onSeeked() {
          seekedAt = performance.now();
          present();
        }

        timeoutId = setTimeout(
          () => finish({ framePresented: false, timedOut: true, note: "seek timed out" }),
          timeoutMs,
        );
        video.pause();
        video.addEventListener("seeked", onSeeked, { once: true });
        if (Math.abs(video.currentTime - target) < 1e-7 && !video.seeking) {
          seekedAt = performance.now();
          present();
        } else {
          video.currentTime = target;
        }
      }),
    { targetSeconds, label, timeoutMs, fps },
  ).then((result) => ({
    ...result,
    targetSeconds: round(result.targetSeconds, 6),
    actualSeconds: round(result.actualSeconds, 6),
    absoluteErrorSeconds: round(result.absoluteErrorSeconds, 6),
    toleranceSeconds: round(result.toleranceSeconds, 6),
    seekEventLatencyMs: round(result.seekEventLatencyMs),
    displayLatencyMs: round(result.displayLatencyMs),
    mediaTime: round(result.mediaTime, 6),
    presentationTime: round(result.presentationTime),
  }));
}

async function rapidBurst(page, targets, timeoutMs, fps) {
  const raw = await page.evaluate(
    ({ targets, timeoutMs, fps }) =>
      new Promise((resolve) => {
        const video = document.getElementById("candidate");
        const start = performance.now();
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const maximum = Math.max(0, duration - Math.max(0.001, 0.25 / fps));
        const bounded = targets.map((target) => Math.min(maximum, Math.max(0, target)));
        const finalTarget = bounded.at(-1);
        let completed = false;
        let timeoutId;
        const finish = (framePresented, timedOut) => {
          if (completed) return;
          completed = true;
          clearTimeout(timeoutId);
          const actual = video.currentTime;
          const tolerance = Math.max(0.06, 1.5 / fps);
          resolve({
            issuedTargets: bounded,
            finalTarget,
            actualSeconds: actual,
            absoluteErrorSeconds: Math.abs(actual - finalTarget),
            toleranceSeconds: tolerance,
            latencyMs: performance.now() - start,
            framePresented,
            timedOut,
            ok:
              !timedOut &&
              !video.error &&
              Math.abs(actual - finalTarget) <= tolerance &&
              (framePresented || !("requestVideoFrameCallback" in video)),
            errorCode: video.error?.code ?? null,
          });
        };
        const onSeeked = () => {
          if ("requestVideoFrameCallback" in video) {
            video.requestVideoFrameCallback(() => finish(true, false));
          } else {
            finish(false, false);
          }
        };
        timeoutId = setTimeout(() => finish(false, true), timeoutMs);
        video.pause();
        video.addEventListener("seeked", onSeeked, { once: true });
        for (const target of bounded) video.currentTime = target;
      }),
    { targets, timeoutMs, fps },
  );
  return {
    ...raw,
    issuedTargets: raw.issuedTargets.map((value) => round(value, 6)),
    finalTarget: round(raw.finalTarget, 6),
    actualSeconds: round(raw.actualSeconds, 6),
    absoluteErrorSeconds: round(raw.absoluteErrorSeconds, 6),
    toleranceSeconds: round(raw.toleranceSeconds, 6),
    latencyMs: round(raw.latencyMs),
  };
}

async function playbackQuality(page, sampleMs) {
  const before = await page.evaluate(async () => {
    const video = document.getElementById("candidate");
    const quality =
      typeof video.getVideoPlaybackQuality === "function"
        ? video.getVideoPlaybackQuality()
        : null;
    let playError = null;
    try {
      await video.play();
    } catch (error) {
      playError = String(error.message || error);
    }
    return {
      currentTime: video.currentTime,
      totalVideoFrames: quality?.totalVideoFrames ?? video.webkitDecodedFrameCount ?? null,
      droppedVideoFrames: quality?.droppedVideoFrames ?? video.webkitDroppedFrameCount ?? null,
      corruptedVideoFrames: quality?.corruptedVideoFrames ?? null,
      playError,
    };
  });
  await page.waitForTimeout(sampleMs);
  const after = await page.evaluate(() => {
    const video = document.getElementById("candidate");
    video.pause();
    const quality =
      typeof video.getVideoPlaybackQuality === "function"
        ? video.getVideoPlaybackQuality()
        : null;
    return {
      currentTime: video.currentTime,
      totalVideoFrames: quality?.totalVideoFrames ?? video.webkitDecodedFrameCount ?? null,
      droppedVideoFrames: quality?.droppedVideoFrames ?? video.webkitDroppedFrameCount ?? null,
      corruptedVideoFrames: quality?.corruptedVideoFrames ?? null,
      readyState: video.readyState,
      networkState: video.networkState,
      errorCode: video.error?.code ?? null,
    };
  });
  const decodedDelta =
    Number.isFinite(before.totalVideoFrames) && Number.isFinite(after.totalVideoFrames)
      ? after.totalVideoFrames - before.totalVideoFrames
      : null;
  const droppedDelta =
    Number.isFinite(before.droppedVideoFrames) && Number.isFinite(after.droppedVideoFrames)
      ? after.droppedVideoFrames - before.droppedVideoFrames
      : null;
  return {
    sampleDurationMs: sampleMs,
    playError: before.playError,
    mediaAdvanceSeconds: round(after.currentTime - before.currentTime, 6),
    decodedFramesDelta: decodedDelta,
    droppedFramesDelta: droppedDelta,
    droppedFrameRatio:
      decodedDelta && droppedDelta !== null ? round(droppedDelta / decodedDelta, 6) : null,
    corruptedFrames:
      Number.isFinite(after.corruptedVideoFrames) ? after.corruptedVideoFrames : null,
    readyState: after.readyState,
    networkState: after.networkState,
    errorCode: after.errorCode,
    passed:
      before.playError === null &&
      after.errorCode === null &&
      after.currentTime > before.currentTime &&
      (droppedDelta === null || droppedDelta === 0),
  };
}

async function hiddenTabBehavior(context, page, origin, executionMode) {
  const before = await page.evaluate(async () => {
    const video = document.getElementById("candidate");
    let playError = null;
    try {
      await video.play();
    } catch (error) {
      playError = String(error.message || error);
    }
    return {
      time: video.currentTime,
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      playError,
    };
  });
  const cover = await context.newPage();
  await cover.goto(origin + "/health");
  await cover.bringToFront();
  await page.waitForTimeout(700);
  const background = await page.evaluate(() => {
    const video = document.getElementById("candidate");
    return {
      time: video.currentTime,
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      paused: video.paused,
      ended: video.ended,
      errorCode: video.error?.code ?? null,
    };
  });
  await page.bringToFront();
  await page.waitForTimeout(300);
  const resumed = await page.evaluate(() => {
    const video = document.getElementById("candidate");
    const snapshot = {
      time: video.currentTime,
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      paused: video.paused,
      ended: video.ended,
      errorCode: video.error?.code ?? null,
    };
    video.pause();
    return snapshot;
  });
  await cover.close();
  const visibilityWasActuallyHidden =
    background.hidden === true || background.visibilityState === "hidden";
  const behaviorPassed =
    visibilityWasActuallyHidden &&
    before.playError === null &&
    background.errorCode === null &&
    resumed.errorCode === null &&
    resumed.hidden === false;
  return {
    tested: visibilityWasActuallyHidden,
    status: visibilityWasActuallyHidden
      ? behaviorPassed
        ? "complete-pass"
        : "complete-fail"
      : "partial-inconclusive",
    executionMode,
    conclusion: visibilityWasActuallyHidden ? (behaviorPassed ? "pass" : "fail") : "inconclusive",
    requiresFollowUp: !visibilityWasActuallyHidden,
    reason: visibilityWasActuallyHidden
      ? null
      : "Opening and focusing a second page did not expose a real hidden document state in this browser session.",
    followUp: visibilityWasActuallyHidden
      ? null
      : executionMode === "headless"
        ? "Rerun with --headed in an environment that permits a visible Chromium window, then verify hidden and foreground visibility states."
        : "The headed session still did not expose hidden state; collect a manual visible-browser focus-switch trace.",
    startingVisibility: before.visibilityState,
    hiddenVisibility: background.visibilityState,
    resumedVisibility: resumed.visibilityState,
    playError: before.playError,
    mediaAdvanceWhileBackgroundedSeconds: round(background.time - before.time, 6),
    mediaAdvanceAfterForegroundSeconds: round(resumed.time - background.time, 6),
    pausedWhileBackgrounded: background.paused,
    pausedAfterForeground: resumed.paused,
    errorCode: background.errorCode ?? resumed.errorCode,
    passed: behaviorPassed,
  };
}

async function imageFingerprint(page) {
  try {
    const buffer = await page.locator("#candidate").screenshot({
      type: "png",
      animations: "disabled",
    });
    return {
      captured: true,
      bytes: buffer.length,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    };
  } catch (error) {
    return {
      captured: false,
      error: String(error.message || error),
    };
  }
}

async function testCandidateInBrowser(context, origin, options, candidate, randomFractions) {
  const viewport =
    candidate.role === "desktop" ? { width: 960, height: 540 } : { width: 360, height: 640 };
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));

  const navigationStarted = Date.now();
  try {
    await page.goto(origin + "/qa?id=" + encodeURIComponent(candidate.id), {
      waitUntil: "domcontentloaded",
      timeout: options.metadataTimeoutMs,
    });
  } catch (error) {
    await page.close();
    return {
      tested: true,
      passed: false,
      supported: false,
      error: "navigation failed: " + String(error.message || error),
    };
  }
  const metadata = await waitForMetadata(page, options.metadataTimeoutMs);
  metadata.navigationWallLatencyMs = Date.now() - navigationStarted;
  metadata.wallLatencyMs = round(metadata.wallLatencyMs);
  metadata.metadataLatencyMs = round(metadata.metadataLatencyMs);
  metadata.firstUsableFrameLatencyMs = round(metadata.firstUsableFrameLatencyMs);
  metadata.duration = round(metadata.duration, 6);
  metadata.events = metadata.events.map((event) => ({
    ...event,
    time: round(event.time),
    currentTime: round(event.currentTime, 6),
  }));

  if (!metadata.ok) {
    await page.close();
    return {
      tested: true,
      passed: false,
      supported: false,
      metadata,
      consoleErrors,
      pageErrors,
    };
  }

  const duration = metadata.duration;
  const fps = options.expectedFps;
  await seekOnce(
    page,
    Math.min(duration / 2, Math.max(1 / fps, 0.1)),
    "warmup-unscored",
    options.seekTimeoutMs,
    fps,
  );

  const first = await seekOnce(page, 0, "first-frame", options.seekTimeoutMs, fps);
  const firstFingerprint = await imageFingerprint(page);
  const finalTarget = Math.max(0, duration - 1 / fps);
  const final = await seekOnce(
    page,
    finalTarget,
    "final-frame",
    options.seekTimeoutMs,
    fps,
  );
  const finalFingerprint = await imageFingerprint(page);

  const random = [];
  for (let index = 0; index < randomFractions.length; index += 1) {
    random.push(
      await seekOnce(
        page,
        randomFractions[index] * duration,
        "random-" + String(index + 1).padStart(2, "0"),
        options.seekTimeoutMs,
        fps,
      ),
    );
  }

  const alternatingFractions = [0.12, 0.88, 0.16, 0.84, 0.2, 0.8, 0.24, 0.76];
  const alternating = [];
  for (let index = 0; index < alternatingFractions.length; index += 1) {
    alternating.push(
      await seekOnce(
        page,
        alternatingFractions[index] * duration,
        "alternating-" + String(index + 1).padStart(2, "0"),
        options.seekTimeoutMs,
        fps,
      ),
    );
  }
  const burst = await rapidBurst(
    page,
    alternatingFractions.map((fraction) => fraction * duration),
    options.seekTimeoutMs,
    fps,
  );

  const nearbyOffsets = [-3, -2, -1, 0, 1, 2, 3];
  const nearby = [];
  for (const offset of nearbyOffsets) {
    nearby.push(
      await seekOnce(
        page,
        duration * 0.5 + offset / fps,
        "nearby-" + (offset >= 0 ? "+" : "") + offset,
        options.seekTimeoutMs,
        fps,
      ),
    );
  }

  const forward = [];
  for (let index = 1; index <= 6; index += 1) {
    forward.push(
      await seekOnce(
        page,
        duration * (index / 7),
        "forward-" + String(index).padStart(2, "0"),
        options.seekTimeoutMs,
        fps,
      ),
    );
  }
  const reverse = [];
  for (let index = 6; index >= 1; index -= 1) {
    reverse.push(
      await seekOnce(
        page,
        duration * (index / 7),
        "reverse-" + String(7 - index).padStart(2, "0"),
        options.seekTimeoutMs,
        fps,
      ),
    );
  }

  await seekOnce(page, duration * 0.2, "linear-playback-setup", options.seekTimeoutMs, fps);
  const linearPlayback = await playbackQuality(page, options.linearSampleMs);
  const hiddenTab = await hiddenTabBehavior(
    context,
    page,
    origin,
    options.headed ? "headed" : "headless",
  );
  const allSeeks = [first, final, ...random, ...alternating, ...nearby, ...forward, ...reverse];
  const failedSeeks = allSeeks.filter((entry) => !entry.ok);
  const visibleFailures = [];
  if (!first.ok) visibleFailures.push("first-frame-seek-failed");
  if (!final.ok) visibleFailures.push("final-frame-seek-failed");
  if (!firstFingerprint.captured) visibleFailures.push("first-frame-capture-failed");
  if (!finalFingerprint.captured) visibleFailures.push("final-frame-capture-failed");
  if (
    firstFingerprint.captured &&
    finalFingerprint.captured &&
    firstFingerprint.sha256 === finalFingerprint.sha256
  ) {
    visibleFailures.push("first-and-final-render-identically");
  }
  if (!burst.ok) visibleFailures.push("rapid-burst-final-frame-failed");
  if (!linearPlayback.passed) visibleFailures.push("linear-playback-quality-failed");
  if (hiddenTab.tested && !hiddenTab.passed) visibleFailures.push("hidden-tab-behavior-failed");
  if (consoleErrors.length) visibleFailures.push("browser-console-errors");
  if (pageErrors.length) visibleFailures.push("browser-page-errors");

  const hardChecksPassed = failedSeeks.length === 0 && visibleFailures.length === 0;
  const status = !hardChecksPassed
    ? "failed"
    : hiddenTab.tested
      ? "passed"
      : "partial-hidden-tab-inconclusive";
  const result = {
    tested: true,
    status,
    passed: status === "passed",
    partial: status === "partial-hidden-tab-inconclusive",
    supported: true,
    browserReportedDimensions: {
      width: metadata.videoWidth,
      height: metadata.videoHeight,
    },
    metadata,
    seekPlan: {
      seed: options.seed,
      randomNormalizedTargets: randomFractions,
      totalMeasuredSeeks: allSeeks.length,
      targetToleranceSeconds: round(Math.max(0.06, 1.5 / fps), 6),
    },
    seeks: {
      first,
      final,
      random,
      rapidAlternating: alternating,
      rapidBurst: burst,
      nearby,
      forward,
      reverse,
      failedCount: failedSeeks.length,
      failedLabels: failedSeeks.map((entry) => entry.label),
      latencyDistribution: latencyDistribution(allSeeks),
    },
    presentationFingerprints: {
      first: firstFingerprint,
      final: finalFingerprint,
      distinct: Boolean(
        firstFingerprint.captured &&
          finalFingerprint.captured &&
          firstFingerprint.sha256 !== finalFingerprint.sha256,
      ),
      note: "Hashes identify the Chromium-rendered video element, not source frames.",
    },
    linearPlayback,
    hiddenTab,
    visibleFailures,
    consoleErrors,
    pageErrors,
  };
  await page.close();
  return result;
}

async function runRecordedLabExercise(page, exerciseId, timeoutMs) {
  const beforeCount = await page.evaluate(
    () => window.phase3MediaLabReport?.runs?.length || 0,
  );
  await page.locator('[data-exercise="' + exerciseId + '"]').click();
  await page.waitForFunction(
    ({ beforeCount, exerciseId }) => {
      const runs = window.phase3MediaLabReport?.runs || [];
      const latest = runs.at(-1);
      return (
        runs.length > beforeCount &&
        latest?.id === exerciseId &&
        latest?.status !== "running"
      );
    },
    { beforeCount, exerciseId },
    { timeout: timeoutMs },
  );
  return page.evaluate((exerciseId) => {
    const run = [...(window.phase3MediaLabReport?.runs || [])]
      .reverse()
      .find((entry) => entry.id === exerciseId);
    return run
      ? {
          id: run.id,
          label: run.label,
          status: run.status,
          measurements: run.measurements?.length || 0,
          summary: run.summary || null,
          error: run.error || null,
        }
      : null;
  }, exerciseId);
}

async function recordMediaLabEvidence(browser, origin, options, candidate) {
  const requestedPath = options.recordVideo;
  const result = {
    requested: true,
    status: "failed",
    candidateId: options.recordCandidate,
    output: {
      path: portablePath(requestedPath),
      pathScope: portablePathScope(requestedPath),
      container: "webm",
      bytes: null,
      sha256: null,
    },
    capture: {
      authority: "playwright-video-of-actual-isolated-media-lab-ui",
      surface: "prototypes/phase-3-crt-media-lab",
      interactionMode: "visible DOM controls",
      syntheticSeekScript: false,
      headed: options.headed,
      viewport: { width: 1280, height: 720 },
    },
    interactions: [],
    hiddenTab: null,
    labSummary: null,
    errors: [],
  };
  if (!candidate) {
    result.errors.push("The selected recording candidate is unavailable.");
    return result;
  }

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "phase3-media-lab-video-"));
  let context = null;
  let page = null;
  let video = null;
  try {
    await mkdir(path.dirname(requestedPath), { recursive: true });
    context = await browser.newContext({
      serviceWorkers: "block",
      colorScheme: "dark",
      viewport: { width: 1280, height: 720 },
      recordVideo: {
        dir: temporaryRoot,
        size: { width: 1280, height: 720 },
      },
    });
    page = await context.newPage();
    video = page.video();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));

    const sourcePath = "/media/" + encodeURIComponent(candidate.id);
    const labUrl =
      origin +
      "/lab/?src=" +
      encodeURIComponent(sourcePath) +
      "&fps=" +
      encodeURIComponent(String(options.expectedFps));
    await page.goto(labUrl, {
      waitUntil: "networkidle",
      timeout: options.metadataTimeoutMs,
    });
    await page.waitForFunction(
      () => {
        const report = window.phase3MediaLabReport;
        const timeline = document.querySelector("#timeline");
        return (
          report?.source?.durationSeconds > 0 &&
          timeline instanceof HTMLInputElement &&
          !timeline.disabled
        );
      },
      null,
      { timeout: options.metadataTimeoutMs },
    );

    const frameRate = options.expectedFps;
    const timeline = page.locator("#timeline");
    await page.locator(".stage-panel").scrollIntoViewIfNeeded();
    await page.waitForTimeout(450);
    await timeline.focus();
    await timeline.press("End");
    await page.waitForFunction(
      (frameRate) => {
        const media = document.querySelector("#media");
        return (
          media instanceof HTMLVideoElement &&
          Number.isFinite(media.duration) &&
          media.currentTime >= media.duration - 2 / frameRate
        );
      },
      frameRate,
      { timeout: options.seekTimeoutMs },
    );
    result.interactions.push({ control: "timeline", action: "End", status: "completed" });
    await page.waitForTimeout(350);
    await timeline.press("Home");
    await page.waitForFunction(
      (frameRate) => {
        const media = document.querySelector("#media");
        return media instanceof HTMLVideoElement && media.currentTime <= 2 / frameRate;
      },
      frameRate,
      { timeout: options.seekTimeoutMs },
    );
    result.interactions.push({ control: "timeline", action: "Home", status: "completed" });
    await page.waitForTimeout(350);

    await page.locator('[data-exercise="first-frame"]').scrollIntoViewIfNeeded();
    const exerciseTimeout = Math.max(60_000, options.seekTimeoutMs * 40);
    for (const exerciseId of [
      "first-frame",
      "final-frame",
      "random-10",
      "rapid-alternating",
      "forward-reverse",
    ]) {
      const exercise = await runRecordedLabExercise(page, exerciseId, exerciseTimeout);
      result.interactions.push({
        control: "exercise-button",
        action: exerciseId,
        status: exercise?.status || "missing",
        measurements: exercise?.measurements ?? null,
      });
      if (!exercise || exercise.status !== "passed") {
        throw new Error("Recorded media-lab exercise did not pass: " + exerciseId);
      }
      await page.waitForTimeout(300);
    }

    await page.locator("#media").scrollIntoViewIfNeeded();
    await page.locator("#media").focus();
    await page.keyboard.press("Space");
    let playbackStarted = false;
    try {
      await page.waitForFunction(
        () => {
          const media = document.querySelector("#media");
          return media instanceof HTMLVideoElement && !media.paused && !media.ended;
        },
        null,
        { timeout: 2500 },
      );
      playbackStarted = true;
    } catch {
      // Native video keyboard behavior can vary; record the observed result.
    }

    const visibilityBefore = await page.evaluate(
      () => window.phase3MediaLabReport?.visibility?.transitions || 0,
    );
    const cover = await context.newPage();
    await cover.goto(origin + "/health");
    await cover.bringToFront();
    await page.waitForTimeout(900);
    await page.bringToFront();
    await page.waitForTimeout(500);
    await cover.close();
    const visibilityAfter = await page.evaluate(
      () => window.phase3MediaLabReport?.visibility || null,
    );
    result.hiddenTab = {
      playbackStartedThroughFocusedNativeControl: playbackStarted,
      transitionsBefore: visibilityBefore,
      transitionsAfter: visibilityAfter?.transitions ?? null,
      completedHiddenSessions: visibilityAfter?.completedHiddenSessions ?? null,
      totalHiddenMs: visibilityAfter?.totalHiddenMs ?? null,
      status:
        visibilityAfter?.completedHiddenSessions > 0
          ? "recorded"
          : "inconclusive-no-hidden-state",
    };

    await page.locator("#result-rows").scrollIntoViewIfNeeded();
    await page.waitForTimeout(650);
    await page.locator("#report-preview").scrollIntoViewIfNeeded();
    await page.waitForTimeout(850);
    result.labSummary = await page.evaluate(() => {
      const report = window.phase3MediaLabReport;
      return {
        schema: report?.schema || null,
        canary: report?.canary || null,
        source: report?.source
          ? {
              kind: report.source.kind,
              name: report.source.name,
              configuredFrameRate: report.source.configuredFrameRate,
              durationSeconds: report.source.durationSeconds,
              dimensions: report.source.dimensions,
            }
          : null,
        runs: (report?.runs || []).map((run) => ({
          id: run.id,
          status: run.status,
          measurements: run.measurements?.length || 0,
          summary: run.summary || null,
        })),
        visibility: report?.visibility || null,
      };
    });
    result.errors.push(...consoleErrors, ...pageErrors);

    await context.close();
    context = null;
    if (!video) throw new Error("Playwright did not expose a video recording handle.");
    await video.saveAs(requestedPath);
    const outputStat = await stat(requestedPath);
    result.output.bytes = outputStat.size;
    result.output.sha256 = await sha256(requestedPath);
    result.status =
      result.errors.length === 0 &&
      result.interactions.every((entry) => entry.status === "completed" || entry.status === "passed")
        ? "passed"
        : "failed";
    return result;
  } catch (error) {
    result.errors.push(String(error.message || error));
    if (context) {
      try {
        await context.close();
      } catch {
        // Preserve the primary recording failure.
      }
    }
    return result;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function runBrowserQa(options, probeRecords) {
  const resolution = await resolveChromium(options.browserExecutable);
  if (!resolution.available) {
    return {
      tested: false,
      status: "not-executed",
      reason: resolution.reason,
      required: options.requireBrowser,
      reviewVideo: {
        requested: options.recordVideo !== null,
        status: options.recordVideo ? "not-executed" : "not-requested",
        output: options.recordVideo
          ? {
              path: portablePath(options.recordVideo),
              pathScope: portablePathScope(options.recordVideo),
            }
          : null,
      },
      candidateResults: {},
    };
  }

  const candidatePaths = options.candidates.filter((candidate) =>
    probeRecords.some(
      (record) => record.id === candidate.id && record.file?.exists === true,
    ),
  );
  const harness = await createHarnessServer(candidatePaths);
  let browser;
  try {
    browser = await resolution.chromium.launch({
      executablePath: resolution.executablePath,
      headless: !options.headed,
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--no-first-run",
      ],
    });
  } catch (error) {
    await new Promise((resolve) => harness.server.close(resolve));
    return {
      tested: false,
      status: "launch-failed",
      reason: sanitizeTrackedString(String(error.message || error), [
        resolution.executablePath,
      ]),
      required: options.requireBrowser,
      executablePath: portablePath(resolution.executablePath),
      executableScope: portablePathScope(resolution.executablePath),
      executableSource: resolution.executableSource,
      reviewVideo: {
        requested: options.recordVideo !== null,
        status: options.recordVideo ? "not-executed" : "not-requested",
        output: options.recordVideo
          ? {
              path: portablePath(options.recordVideo),
              pathScope: portablePathScope(options.recordVideo),
            }
          : null,
      },
      candidateResults: {},
    };
  }

  const candidateResults = {};
  let reviewVideo = {
    requested: options.recordVideo !== null,
    status: options.recordVideo ? "pending" : "not-requested",
    output: options.recordVideo
      ? {
          path: portablePath(options.recordVideo),
          pathScope: portablePathScope(options.recordVideo),
        }
      : null,
  };
  let version = null;
  try {
    version = browser.version();
    const context = await browser.newContext({
      serviceWorkers: "block",
      colorScheme: "dark",
    });
    const randomFractions = seededFractions(options.seed, 10);
    for (const candidate of candidatePaths) {
      candidateResults[candidate.id] = await testCandidateInBrowser(
        context,
        harness.origin,
        options,
        candidate,
        randomFractions,
      );
    }
    await context.close();
    if (options.recordVideo) {
      const recordingCandidate = candidatePaths.find(
        (candidate) => candidate.id === options.recordCandidate,
      );
      reviewVideo = await recordMediaLabEvidence(
        browser,
        harness.origin,
        options,
        recordingCandidate,
      );
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => harness.server.close(resolve));
  }

  const results = Object.values(candidateResults);
  const recordingFailed = reviewVideo.requested && reviewVideo.status !== "passed";
  const browserStatus = results.some((entry) => entry.status === "failed") || recordingFailed
    ? "failed"
    : results.some((entry) => entry.status === "partial-hidden-tab-inconclusive")
      ? "partial-hidden-tab-inconclusive"
      : "passed";
  return {
    tested: true,
    status: browserStatus,
    complete: browserStatus === "passed",
    executionMode: options.headed ? "headed" : "headless",
    required: options.requireBrowser,
    product: "Chromium",
    version,
    automation: "playwright-core",
    executablePath: portablePath(resolution.executablePath),
    executableScope: portablePathScope(resolution.executablePath),
    executableSource: resolution.executableSource,
    harness: {
      productionRoutesEntered: false,
      productionDirectoriesServed: false,
      binding: "127.0.0.1 ephemeral port",
      mediaSources: "only the four explicit candidate files",
      mediaLabSurfaceServed: true,
      mediaLabSource: "prototypes/phase-3-crt-media-lab",
    },
    reviewVideo,
    candidateResults,
  };
}

function summarize(options, candidates, browser) {
  const probeFailures = candidates.filter(
    (candidate) => !candidate.probe?.passed || candidate.validations?.some((entry) => !entry.pass),
  );
  const browserFailures = browser.tested
    ? Object.entries(browser.candidateResults)
        .filter(([, result]) => result.status === "failed")
        .map(([id]) => id)
    : [];
  const browserPartialIds = browser.tested
    ? Object.entries(browser.candidateResults)
        .filter(([, result]) => result.status === "partial-hidden-tab-inconclusive")
        .map(([id]) => id)
    : [];
  const browserMissing = !browser.tested;
  const recordingFailure =
    browser.tested &&
    browser.reviewVideo?.requested === true &&
    browser.reviewVideo.status !== "passed";
  const hardFailed =
    probeFailures.length > 0 || browserFailures.length > 0 || recordingFailure;
  const browserIncomplete = browserMissing || browserPartialIds.length > 0;
  const status = hardFailed
    ? "failed"
    : browserIncomplete
      ? "partial-browser-evidence-incomplete"
      : "passed";
  const commandSucceeded = !hardFailed && !(options.requireBrowser && browserIncomplete);
  return {
    status,
    passed: status === "passed",
    commandSucceeded,
    browserEvidenceComplete: !browserIncomplete,
    probeCandidatesPassed: candidates.length - probeFailures.length,
    probeCandidatesTotal: candidates.length,
    probeFailureIds: probeFailures.map((candidate) => candidate.id),
    chromiumExecuted: browser.tested,
    chromiumFailureIds: browserFailures,
    chromiumPartialIds: browserPartialIds,
    recordedMediaLabVideoRequested: browser.reviewVideo?.requested === true,
    recordedMediaLabVideoStatus: browser.reviewVideo?.status || "not-requested",
    expectedCompatibilityClaimsAreExecutionResults: false,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  assertIsolatedPath(options.output, "Report output");
  for (const candidate of options.candidates) {
    assertIsolatedPath(candidate.absolutePath, "Candidate " + candidate.id);
  }
  if (options.recordVideo) {
    assertIsolatedPath(options.recordVideo, "Recorded media-lab video");
    const comparable = (value) =>
      process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
    if (comparable(options.recordVideo) === comparable(options.output)) {
      throw new Error("--record-video and --output must be different files");
    }
    if (
      options.candidates.some(
        (candidate) => comparable(candidate.absolutePath) === comparable(options.recordVideo),
      )
    ) {
      throw new Error("--record-video may not overwrite a media candidate");
    }
  }
  if (!(await exists(options.ffprobe))) {
    throw new Error("ffprobe executable does not exist: " + portablePath(options.ffprobe));
  }

  const versionRun = await runExecutable(options.ffprobe, ["-version"], "ffprobe version");
  if (!versionRun.ok) throw new Error(versionRun.error);
  const ffprobeVersion = versionRun.stdout.split(/\r?\n/, 1)[0].trim();

  const candidates = [];
  for (const candidate of options.candidates) {
    candidates.push(await probeCandidate(options, candidate));
  }
  const browser = await runBrowserQa(options, candidates);
  for (const candidate of candidates) {
    const browserResult = browser.candidateResults?.[candidate.id];
    candidate.compatibility.chromium = browserResult
      ? {
          status: browserResult.partial ? "tested-partial" : "tested",
          tested: true,
          passed:
            browserResult.status === "passed"
              ? true
              : browserResult.status === "failed"
                ? false
                : null,
          supported: browserResult.supported,
          conclusion:
            browserResult.status === "partial-hidden-tab-inconclusive"
              ? "inconclusive-hidden-tab"
              : browserResult.status,
          product: browser.product,
          version: browser.version,
        }
      : {
          status: "not-executed",
          tested: false,
          passed: null,
          supported: null,
          reason: browser.reason || "candidate did not reach browser execution",
        };
    if (candidate.status !== "failed") {
      candidate.status = browserResult
        ? browserResult.status === "passed"
          ? "passed"
          : browserResult.status === "failed"
            ? "failed"
            : "passed-probe-browser-partial-hidden-tab"
        : "passed-probe-browser-not-executed";
    }
  }

  const report = {
    schema: "quantum-hub.phase-3-media-qa.v1",
    authority: "isolated-ffprobe-and-playwright-chromium",
    deterministicProtocol: {
      stableFieldOrder: true,
      seededSeekTargets: true,
      seed: options.seed,
      timingValuesAreMeasurements: true,
      note: "The verifier test order and target times are deterministic; measured latency and playback counters intentionally reflect the executing machine. An optional recorded media-lab run uses the lab's own live controls and remains separate from this seeded telemetry.",
    },
    isolation: {
      productionImports: [],
      productionRootsRejected: productionRootNames,
      productionRoutesEntered: false,
      productionBuildRequired: false,
      recordedMediaLabVideoPath: options.recordVideo ? portablePath(options.recordVideo) : null,
      recordedMediaLabVideoPathScope: options.recordVideo
        ? portablePathScope(options.recordVideo)
        : null,
    },
    expectations: {
      fps: options.expectedFps,
      durationSeconds: options.expectedDuration,
      frames: options.expectedFrames,
      gopFrames: options.expectedGop,
      desktop: { width: options.desktopWidth, height: options.desktopHeight },
      mobile: { width: options.mobileWidth, height: options.mobileHeight },
      audioStreams: 0,
    },
    tooling: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      ffprobe: {
        path: portablePath(options.ffprobe),
        pathScope: portablePathScope(options.ffprobe),
        version: ffprobeVersion,
      },
      chromium: {
        tested: browser.tested,
        executionMode: browser.executionMode || null,
        product: browser.product || null,
        version: browser.version || null,
        executablePath: browser.executablePath || null,
        executableScope: browser.executableScope || null,
        executableSource: browser.executableSource || null,
      },
    },
    protocol: {
      metadataTimeoutMs: options.metadataTimeoutMs,
      seekTimeoutMs: options.seekTimeoutMs,
      linearPlaybackSampleMs: options.linearSampleMs,
      randomSeekCount: 10,
      randomNormalizedTargets: seededFractions(options.seed, 10),
      rapidAlternatingNormalizedTargets: [0.12, 0.88, 0.16, 0.84, 0.2, 0.8, 0.24, 0.76],
      nearbyFrameOffsets: [-3, -2, -1, 0, 1, 2, 3],
      forwardSeekCount: 6,
      reverseSeekCount: 6,
      latencyPercentiles: ["minimum", "median", "p90", "p95", "maximum", "mean"],
      recordedMediaLabRun: options.recordVideo
        ? {
            requested: true,
            candidateId: options.recordCandidate,
            headedRequired: true,
            controlAuthority: "actual isolated media-lab DOM controls",
            syntheticSeekScript: false,
            randomSeekAuthority: "the media lab's live random-10 control",
          }
        : {
            requested: false,
          },
    },
    candidates,
    browser,
    privacy: {
      absoluteHostPathsAllowed: false,
      repositoryFiles: "repository-relative",
      externalExecutables: "basename-only",
      errorStringsSanitized: true,
      preWriteAssertion: true,
    },
    summary: null,
  };
  report.summary = summarize(options, candidates, browser);
  const privateExecutionPaths = [
    options.ffprobe,
    options.output,
    options.recordVideo,
    options.browserExecutable,
    ...options.candidates.map((candidate) => candidate.absolutePath),
  ].filter(Boolean);
  const trackedReport = sanitizeTrackedValue(report, privateExecutionPaths);
  assertTrackedReportPrivacy(trackedReport, privateExecutionPaths);

  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, JSON.stringify(trackedReport, null, 2) + "\n", "utf8");
  process.stdout.write(
    "Phase 3 media QA " +
      trackedReport.summary.status +
      ": " +
      options.output +
      " (" +
      trackedReport.summary.probeCandidatesPassed +
      "/" +
      trackedReport.summary.probeCandidatesTotal +
      " probe candidates passed; Chromium " +
      (browser.tested ? browser.status : "not executed") +
      ")\n",
  );
  if (!trackedReport.summary.commandSucceeded) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    "Phase 3 media QA failed before report generation: " +
      sanitizeTrackedString(String(error.message || error)) +
      "\n",
  );
  process.exitCode = 1;
});
