#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_FILENAME = "phase-4-cinematic-evidence-manifest.json";
const FRAME_COUNT = 270;
const FRAME_RATE = 30;
const FINAL_FRAME_INDEX = FRAME_COUNT - 1;
const DEFAULT_TIMEOUT_MS = 12_000;
const SCREENSHOT_SETTLE_TIMEOUT_MS = 6_000;

const VIEWPORTS = Object.freeze([
  {
    id: "desktop-1440x900",
    width: 1440,
    height: 900,
    expectedFamily: "desktop",
    expectedObjectPosition: "48% 50%",
    authority: "accepted desktop review size",
  },
  {
    id: "mobile-390x844",
    width: 390,
    height: 844,
    expectedFamily: "mobile",
    expectedObjectPosition: "54% 50%",
    authority: "accepted mobile review size",
  },
  {
    id: "narrow-320x800",
    width: 320,
    height: 800,
    expectedFamily: "mobile",
    expectedObjectPosition: "55% 50%",
    authority: "accepted narrow-mobile review size",
  },
  {
    id: "tablet-portrait-768x1024",
    width: 768,
    height: 1024,
    expectedFamily: "mobile",
    expectedObjectPosition: "54% 50%",
    authority: "mandatory Phase 4 portrait-tablet family gate",
  },
  {
    id: "mobile-landscape-844x390",
    width: 844,
    height: 390,
    expectedFamily: "mobile",
    expectedObjectPosition: "53% 48%",
    authority: "mandatory accepted mobile-landscape family gate",
  },
]);

const MILESTONES = Object.freeze([
  { id: "dormancy", frame: 1, phase: "DORMANCY" },
  { id: "conduction", frame: 72, phase: "SPIRAL CONDUCTION" },
  { id: "phosphor-wake", frame: 126, phase: "PHOSPHOR WAKE" },
  { id: "picture-field", frame: 144, phase: "PICTURE FIELD" },
  { id: "quantum-content", frame: 196, phase: "QUANTUM CONTENT" },
  { id: "camera-entry", frame: 218, phase: "CAMERA ENTRY" },
  { id: "late-flattening", frame: 250, phase: "LATE FLATTENING" },
  { id: "portal-near-final", frame: 262, phase: "PORTAL NEAR-FINAL" },
  { id: "semantic-handoff", frame: 270, phase: "SEMANTIC HANDOFF" },
]);

const SOURCE_AUTHORITY_PATHS = Object.freeze([
  "src/pages/index.astro",
  "src/scripts/home-cinematic-integration.ts",
  "src/styles/routes/home-cinematic.css",
  "scripts/stage-phase4-media.mjs",
  "artifacts/original/phase-3-crt-opening/manifests/phase-3-r-candidate-authority.json",
  "docs/planning/PHASE_3_PORTAL_ALIGNMENT_CONTRACT.md",
]);

function parseArguments(argv) {
  const options = {
    url: null,
    output: null,
    chromium: process.env.CHROME_PATH ?? null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    if (argument === "--url" || argument === "--base-url") options.url = next();
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--chromium" || argument === "--browser") options.chromium = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 1000 through 120000");
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 4 cinematic milestone evidence capture

Usage:
  node scripts/capture-phase4-evidence.mjs \\
    --url <local-preview-url> \\
    --output <distinct-phase4-review-root> \\
    [--chromium <executable>] \\
    [--timeout-ms <milliseconds>]

Required:
  --url URL          Current local Astro preview homepage (http/https)
  --output DIR       Explicit Phase 4-only review destination

Optional:
  --chromium FILE    Chrome/Chromium executable; otherwise auto-detect
  --timeout-ms N     Page/media readiness timeout (default ${DEFAULT_TIMEOUT_MS})
  --help, -h         Show this help without writing files

Captures ${VIEWPORTS.length} required viewports at ${MILESTONES.length} accepted timeline milestones,
writes exact-size PNGs, one labeled contact sheet per viewport, and ${REPORT_FILENAME}.
The output path is rejected if it is inside src, public, dist, accepted Phase 2B
or Phase 3 evidence, or any non-Phase-4 child of artifacts/evidence.
`);
}

function normalizeUrl(value) {
  if (!value) throw new Error("--url is required");
  const parsed = new URL(value);
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("--url must use http or https");
  }
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return parsed.toString();
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateOutputRootLexically(output) {
  if (!output) throw new Error("--output is required and must be explicit");
  if (output === ROOT) throw new Error("--output must not be the repository root");

  const forbiddenRoots = [
    "src",
    "public",
    "dist",
    "artifacts/evidence/phase-2b",
    "artifacts/evidence/phase-3",
    "artifacts/original/phase-3-crt-opening",
  ].map((relative) => path.join(ROOT, ...relative.split("/")));
  for (const forbidden of forbiddenRoots) {
    if (isWithin(forbidden, output)) {
      throw new Error(`--output must not be inside ${path.relative(ROOT, forbidden).replaceAll("\\", "/")}`);
    }
  }

  const evidenceRoot = path.join(ROOT, "artifacts", "evidence");
  if (isWithin(evidenceRoot, output)) {
    const [phaseDirectory] = path.relative(evidenceRoot, output).split(path.sep);
    if (!/^phase-4(?:$|-)/.test(phaseDirectory ?? "")) {
      throw new Error("Repository evidence output must use a phase-4 or phase-4-* directory");
    }
  }
}

async function resolveFromExistingAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const missingSegments = [];
  for (;;) {
    try {
      return path.join(await realpath(cursor), ...missingSegments.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missingSegments.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function validateOutputRootResolved(output) {
  const resolvedOutput = await resolveFromExistingAncestor(output);
  const forbidden = await Promise.all(
    [
      "src",
      "public",
      "dist",
      "artifacts/evidence/phase-2b",
      "artifacts/evidence/phase-3",
      "artifacts/original/phase-3-crt-opening",
    ].map(async (relative) => {
      const candidate = path.join(ROOT, ...relative.split("/"));
      return resolveFromExistingAncestor(candidate);
    }),
  );
  for (const forbiddenRoot of forbidden) {
    if (isWithin(forbiddenRoot, resolvedOutput)) {
      throw new Error("Resolved --output aliases a protected production or accepted-evidence root");
    }
  }
}

async function executable(candidate) {
  if (!candidate) return false;
  try {
    await access(candidate, fsConstants.X_OK);
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function resolveChromium(override) {
  const candidates = [];
  if (override) candidates.push(path.resolve(override));
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    );
    if (process.env.LOCALAPPDATA) {
      candidates.push(
        path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"),
      );
    }
  } else {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) {
    if (await executable(candidate)) return path.resolve(candidate);
  }
  throw new Error("Chrome/Chromium was not found; pass --chromium <executable>");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(Number(value).toFixed(digits)) : null;
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Capture is not a valid PNG");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function replaceFile(temporary, destination) {
  await unlink(destination).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  await rename(temporary, destination);
}

async function atomicWrite(destination, bytes) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try {
    await replaceFile(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function fileRecord(relativePath) {
  const absolute = path.join(ROOT, ...relativePath.split("/"));
  const bytes = await readFile(absolute);
  return { repositoryRelativePath: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

async function repositoryProvenance() {
  const git = async (args) =>
    (await execFileAsync("git", args, { cwd: ROOT, windowsHide: true })).stdout.trim();
  const statusText = await git(["status", "--short"]);
  const branch = await git(["branch", "--show-current"]);
  return {
    captureHead: await git(["rev-parse", "HEAD"]),
    branch,
    workingTreeDirty: statusText.length > 0,
    workingTreeStatus: statusText ? statusText.split(/\r?\n/) : [],
    sourceAuthorities: await Promise.all(SOURCE_AUTHORITY_PATHS.map(fileRecord)),
  };
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok || (response.status >= 300 && response.status < 400)) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Local preview did not become available at ${url}`);
}

async function twoAnimationFrames(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function settlePage(page, timeoutMs) {
  await page.waitForFunction(() => document.readyState === "complete", null, { timeout: timeoutMs });
  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = "auto";
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    if (document.fonts) await document.fonts.ready;
    const poster = document.querySelector("[data-cinematic-poster] img");
    if (poster instanceof HTMLImageElement) await poster.decode().catch(() => undefined);
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.cinematicMode === "enhanced" && Boolean(window.quantumPhase4),
    null,
    { timeout: timeoutMs },
  );
  await page.waitForFunction(
    () => {
      const video = document.querySelector("[data-cinematic-media]");
      const shell = document.querySelector("[data-cinematic-shell]");
      return Boolean(
        window.quantumPhase4?.mediaReady &&
        video instanceof HTMLVideoElement &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        shell?.getAttribute("data-media-state") === "ready",
      );
    },
    null,
    { timeout: timeoutMs },
  );
  await twoAnimationFrames(page);
}

async function scrollAndRead(page, y) {
  await page.evaluate((nextY) => window.scrollTo(0, nextY), y);
  await twoAnimationFrames(page);
  return page.evaluate(() => ({
    y: window.scrollY,
    scrollProgress: Number(window.quantumPhase4?.scrollProgress ?? -1),
    cinematicProgress: Number(window.quantumPhase4?.cinematicProgress ?? -1),
    targetFrame: Number(window.quantumPhase4?.targetFrame ?? -1),
  }));
}

async function firstScrollMatching(page, maximumY, predicate) {
  let low = 0;
  let high = maximumY;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const telemetry = await scrollAndRead(page, middle);
    if (predicate(telemetry)) high = middle;
    else low = middle + 1;
  }
  return low;
}

async function cinematicEndScroll(page) {
  const maximumY = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  );
  const atEnd = await scrollAndRead(page, maximumY);
  if (atEnd.scrollProgress < 0.999) {
    throw new Error(`Cinematic progress only reached ${atEnd.scrollProgress} at the document limit`);
  }
  return firstScrollMatching(page, maximumY, ({ scrollProgress }) => scrollProgress >= 0.9999);
}

async function scrollForFrame(page, endY, expectedFrame) {
  if (expectedFrame === 1) return 0;
  if (expectedFrame === FRAME_COUNT) return endY;

  const first = await firstScrollMatching(page, endY, ({ targetFrame }) => targetFrame >= expectedFrame);
  const firstTelemetry = await scrollAndRead(page, first);
  if (firstTelemetry.targetFrame !== expectedFrame) {
    throw new Error(
      `No scroll position resolves target frame ${expectedFrame}; first candidate is ${firstTelemetry.targetFrame}`,
    );
  }

  const next = await firstScrollMatching(page, endY, ({ targetFrame }) => targetFrame > expectedFrame);
  const nextTelemetry = await scrollAndRead(page, next);
  const last = nextTelemetry.targetFrame > expectedFrame ? Math.max(first, next - 1) : first;
  return Math.floor((first + last) / 2);
}

async function expectedCodec(page) {
  return page.evaluate(() => {
    const probe = document.createElement("video");
    const vp9 = probe.canPlayType('video/webm; codecs="vp09.00.10.08"');
    const h264 =
      probe.canPlayType('video/mp4; codecs="avc1.640028"') ||
      probe.canPlayType('video/mp4; codecs="avc1.42E01E"');
    return {
      selected: vp9 === "probably" ? "vp9" : h264 ? "h264" : null,
      support: { vp9, h264 },
    };
  });
}

async function waitForVisibleFrame(page, expectedFrame, expectedTime) {
  try {
    await page.waitForFunction(
      ({ frame, time }) => {
        const video = document.querySelector("[data-cinematic-media]");
        const state = window.quantumPhase4;
        return Boolean(
          video instanceof HTMLVideoElement &&
          state?.targetFrame === frame &&
          state.mediaReady &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          Math.abs(video.currentTime - time) <= 2 / 30,
        );
      },
      { frame: expectedFrame, time: expectedTime },
      { timeout: SCREENSHOT_SETTLE_TIMEOUT_MS },
    );
    return true;
  } catch {
    return false;
  }
}

async function visibleState(page) {
  return page.evaluate(({ frameRate, frameCount }) => {
    const root = document.documentElement;
    const shell = document.querySelector("[data-cinematic-shell]");
    const stage = document.querySelector("[data-cinematic-stage]");
    const poster = document.querySelector("[data-cinematic-poster]");
    const video = document.querySelector("[data-cinematic-media]");
    const portal = document.querySelector("[data-cinematic-portal-surface]");
    const entry = document.querySelector("#entry");
    const entryContent = document.querySelector(".entry-field__content");
    const header = document.querySelector(".site-header");
    const style = (element) => (element instanceof Element ? getComputedStyle(element) : null);
    const rectangle = (element) => {
      if (!(element instanceof Element)) return null;
      const rect = element.getBoundingClientRect();
      return Object.fromEntries(
        ["x", "y", "width", "height", "top", "right", "bottom", "left"].map((key) => [
          key,
          Number(rect[key].toFixed(3)),
        ]),
      );
    };
    const videoElement = video instanceof HTMLVideoElement ? video : null;
    const state = window.quantumPhase4 ?? {};
    const mediaTime = videoElement?.currentTime ?? 0;
    return {
      rootMode: root.dataset.cinematicMode ?? null,
      fallback: root.dataset.cinematicFallback ?? null,
      headerState: root.dataset.cinematicHeader ?? null,
      shell: {
        phase: shell?.getAttribute("data-cinematic-phase"),
        interactive: shell?.getAttribute("data-cinematic-interactive"),
        mediaState: shell?.getAttribute("data-media-state"),
        mediaFamily: shell?.getAttribute("data-media-family"),
        mediaCodec: shell?.getAttribute("data-media-codec"),
        mediaSource: shell?.getAttribute("data-media-source"),
        scrollProgress: Number(shell?.getAttribute("data-scroll-progress")),
        cinematicProgress: Number(shell?.getAttribute("data-cinematic-progress")),
        targetFrame: Number(shell?.getAttribute("data-target-frame")),
        targetTime: Number(shell?.getAttribute("data-target-time")),
        takeoverProgress: Number(shell?.getAttribute("data-takeover-progress")),
      },
      telemetry: {
        ...state,
        actualTime: Number(mediaTime.toFixed(4)),
      },
      media: {
        currentSrc: videoElement?.currentSrc ?? null,
        currentTime: Number(mediaTime.toFixed(4)),
        estimatedFrame: Math.min(frameCount, Math.max(1, Math.round(mediaTime * frameRate) + 1)),
        duration: Number.isFinite(videoElement?.duration) ? Number(videoElement.duration.toFixed(4)) : null,
        readyState: videoElement?.readyState ?? null,
        networkState: videoElement?.networkState ?? null,
        paused: videoElement?.paused ?? null,
        videoWidth: videoElement?.videoWidth ?? null,
        videoHeight: videoElement?.videoHeight ?? null,
        objectPosition: style(video)?.objectPosition ?? null,
        opacity: style(video)?.opacity ?? null,
        visibility: style(video)?.visibility ?? null,
      },
      visibleLayers: {
        stage: { visibility: style(stage)?.visibility ?? null, opacity: style(stage)?.opacity ?? null },
        poster: { visibility: style(poster)?.visibility ?? null, opacity: style(poster)?.opacity ?? null },
        portal: { visibility: style(portal)?.visibility ?? null, opacity: style(portal)?.opacity ?? null },
        entry: { visibility: style(entry)?.visibility ?? null, opacity: style(entry)?.opacity ?? null },
        entryContent: {
          visibility: style(entryContent)?.visibility ?? null,
          opacity: style(entryContent)?.opacity ?? null,
        },
        header: { visibility: style(header)?.visibility ?? null, opacity: style(header)?.opacity ?? null },
      },
      rectangles: {
        stage: rectangle(stage),
        entry: rectangle(entry),
        entryContent: rectangle(entryContent),
        header: rectangle(header),
      },
      document: {
        scrollX: Number(window.scrollX.toFixed(3)),
        scrollY: Number(window.scrollY.toFixed(3)),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
    };
  }, { frameRate: FRAME_RATE, frameCount: FRAME_COUNT });
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svg(width, height, content) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`,
  );
}

function labelSvg(capture, width, height) {
  const expected = capture.expected;
  const actual = capture.actual;
  const line1 = `${expected.phase} · EXPECT F${String(expected.frame).padStart(3, "0")} / ${expected.timeSeconds.toFixed(4)}s`;
  const line2 = `ACTUAL F${String(actual.media.estimatedFrame).padStart(3, "0")} / ${actual.media.currentTime.toFixed(4)}s · TARGET F${String(actual.shell.targetFrame).padStart(3, "0")}`;
  const line3 = `${actual.shell.mediaFamily}/${actual.shell.mediaCodec} · scroll ${actual.shell.scrollProgress.toFixed(4)} · film ${actual.shell.cinematicProgress.toFixed(4)}`;
  return svg(
    width,
    height,
    `<rect width="100%" height="100%" fill="#101516"/>
     <rect x="0" y="0" width="5" height="100%" fill="#d82b72"/>
     <text x="16" y="22" fill="#f4f6f5" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700">${escapeXml(line1)}</text>
     <text x="16" y="43" fill="#c8d0cf" font-family="Arial, Helvetica, sans-serif" font-size="12">${escapeXml(line2)}</text>
     <text x="16" y="63" fill="#8f9b9a" font-family="Arial, Helvetica, sans-serif" font-size="11">${escapeXml(line3)}</text>`,
  );
}

async function contactSheet(outputRoot, viewport, captures) {
  const columns = 3;
  const padding = 22;
  const gap = 16;
  const headerHeight = 88;
  const tileWidth = 400;
  const previewHeight = 300;
  const labelHeight = 78;
  const tileHeight = previewHeight + labelHeight;
  const rows = Math.ceil(captures.length / columns);
  const width = padding * 2 + columns * tileWidth + (columns - 1) * gap;
  const height = headerHeight + padding + rows * tileHeight + (rows - 1) * gap + padding;
  const composites = [
    {
      input: svg(
        width,
        headerHeight,
        `<rect width="100%" height="100%" fill="#070a0b"/>
         <rect x="22" y="24" width="14" height="3" fill="#d82b72"/>
         <text x="46" y="34" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="0.8">${escapeXml(`PHASE 4 · ${viewport.id.toUpperCase()} · CINEMATIC MILESTONES`)}</text>
         <text x="22" y="63" fill="#8f9b9a" font-family="Arial, Helvetica, sans-serif" font-size="12">${escapeXml(`${viewport.width}×${viewport.height} · expected ${viewport.expectedFamily} · actual/expected decoder metadata shown per panel`)}</text>`,
      ),
      left: 0,
      top: 0,
    },
  ];

  for (const [index, capture] of captures.entries()) {
    const screenshotPath = path.join(outputRoot, capture.screenshot.filename);
    const preview = await sharp(screenshotPath)
      .resize(tileWidth, previewHeight, {
        fit: "contain",
        position: "centre",
        background: "#050708",
        withoutEnlargement: false,
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = padding + column * (tileWidth + gap);
    const top = headerHeight + padding + row * (tileHeight + gap);
    composites.push({ input: preview, left, top });
    composites.push({ input: labelSvg(capture, tileWidth, labelHeight), left, top: top + previewHeight });
    composites.push({
      input: svg(
        tileWidth,
        tileHeight,
        `<rect x="0.5" y="0.5" width="${tileWidth - 1}" height="${tileHeight - 1}" fill="none" stroke="#344040"/>`,
      ),
      left,
      top,
    });
  }

  const filename = `phase-4-${viewport.id}-milestones.png`;
  const destination = path.join(outputRoot, filename);
  const buffer = await sharp({ create: { width, height, channels: 4, background: "#050708" } })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await atomicWrite(destination, buffer);
  return {
    filename,
    width,
    height,
    bytes: buffer.length,
    sha256: sha256(buffer),
    sourceScreenshots: captures.map((capture) => capture.screenshot.filename),
    labelsContainExpectedAndActualMetadata: true,
  };
}

function captureFailures(viewport, expectedCodecRecord, milestone, actual, settled) {
  const failures = [];
  const add = (failure, details = undefined) =>
    failures.push({ viewport: viewport.id, milestone: milestone.id, failure, ...(details ? { details } : {}) });
  if (!settled) add("decoder-did-not-settle-at-expected-time");
  if (actual.rootMode !== "enhanced") add("cinematic-mode-is-not-enhanced", actual.rootMode);
  if (actual.fallback) add("cinematic-fallback-active", actual.fallback);
  if (actual.shell.mediaFamily !== viewport.expectedFamily) {
    add("media-family-mismatch", { expected: viewport.expectedFamily, actual: actual.shell.mediaFamily });
  }
  if (!expectedCodecRecord.selected || actual.shell.mediaCodec !== expectedCodecRecord.selected) {
    add("media-codec-mismatch", { expected: expectedCodecRecord.selected, actual: actual.shell.mediaCodec });
  }
  if (actual.shell.targetFrame !== milestone.frame) {
    add("target-frame-mismatch", { expected: milestone.frame, actual: actual.shell.targetFrame });
  }
  const expectedTime = (milestone.frame - 1) / FRAME_RATE;
  if (Math.abs(actual.shell.targetTime - expectedTime) > 0.0002) {
    add("target-time-mismatch", { expected: round(expectedTime), actual: actual.shell.targetTime });
  }
  if (Math.abs(actual.media.currentTime - expectedTime) > 2 / FRAME_RATE) {
    add("visible-media-time-mismatch", { expected: round(expectedTime), actual: actual.media.currentTime });
  }
  if (actual.media.objectPosition !== viewport.expectedObjectPosition) {
    add("object-position-mismatch", {
      expected: viewport.expectedObjectPosition,
      actual: actual.media.objectPosition,
    });
  }
  if (!actual.telemetry.mediaReady || actual.shell.mediaState !== "ready") add("media-is-not-ready");
  if (actual.document.devicePixelRatio !== 1) add("device-pixel-ratio-is-not-1");
  if (actual.document.scrollWidth > viewport.width + 1) {
    add("horizontal-overflow", { viewportWidth: viewport.width, scrollWidth: actual.document.scrollWidth });
  }
  if (milestone.frame < 270 && actual.visibleLayers.stage.visibility === "hidden") {
    add("physical-stage-hidden-before-semantic-handoff");
  }
  if (milestone.frame === 270) {
    if (actual.visibleLayers.stage.visibility !== "hidden") add("physical-stage-visible-at-semantic-handoff");
    if (Number(actual.visibleLayers.entryContent.opacity) < 0.99) add("semantic-entry-not-fully-visible-at-handoff");
  }
  return failures;
}

async function captureViewport(browser, options, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "UTC",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));

  try {
    const response = await page.goto(options.url, { waitUntil: "networkidle", timeout: options.timeoutMs });
    if (!response || !response.ok()) {
      throw new Error(`Homepage returned HTTP ${response?.status() ?? "no-response"} at ${options.url}`);
    }
    await settlePage(page, options.timeoutMs);
    const codecRecord = await expectedCodec(page);
    if (!codecRecord.selected) throw new Error(`${viewport.id} browser supports neither accepted codec`);
    const endY = await cinematicEndScroll(page);
    const milestoneScrolls = new Map();
    for (const milestone of MILESTONES) {
      milestoneScrolls.set(milestone.id, await scrollForFrame(page, endY, milestone.frame));
    }

    const captures = [];
    for (const milestone of MILESTONES) {
      const expectedTime = (milestone.frame - 1) / FRAME_RATE;
      const expectedProgress = (milestone.frame - 1) / FINAL_FRAME_INDEX;
      const requestedScrollY = milestoneScrolls.get(milestone.id);
      await scrollAndRead(page, requestedScrollY);
      const settled = await waitForVisibleFrame(page, milestone.frame, expectedTime);
      await twoAnimationFrames(page);
      const actual = await visibleState(page);
      const screenshotBuffer = await page.screenshot({
        type: "png",
        fullPage: false,
        animations: "disabled",
        caret: "hide",
        scale: "css",
      });
      const dimensions = pngDimensions(screenshotBuffer);
      if (dimensions.width !== viewport.width || dimensions.height !== viewport.height) {
        throw new Error(
          `${viewport.id}/${milestone.id} capture is ${dimensions.width}x${dimensions.height}; expected ${viewport.width}x${viewport.height}`,
        );
      }
      const filename = `phase-4-${viewport.id}-f${String(milestone.frame).padStart(3, "0")}-${milestone.id}.png`;
      await atomicWrite(path.join(options.output, filename), screenshotBuffer);
      const expected = {
        id: milestone.id,
        phase: milestone.phase,
        frame: milestone.frame,
        timeSeconds: round(expectedTime),
        cinematicProgress: round(expectedProgress, 6),
        family: viewport.expectedFamily,
        codec: codecRecord.selected,
        objectPosition: viewport.expectedObjectPosition,
      };
      const failures = captureFailures(viewport, codecRecord, milestone, actual, settled);
      captures.push({
        id: `${viewport.id}--${milestone.id}`,
        expected,
        actual,
        deltas: {
          targetFrame: actual.shell.targetFrame - milestone.frame,
          visibleFrame: actual.media.estimatedFrame - milestone.frame,
          targetTimeSeconds: round(actual.shell.targetTime - expectedTime, 6),
          visibleTimeSeconds: round(actual.media.currentTime - expectedTime, 6),
        },
        requestedScrollY,
        decoderSettledBeforeCapture: settled,
        screenshot: {
          filename,
          width: dimensions.width,
          height: dimensions.height,
          bytes: screenshotBuffer.length,
          sha256: sha256(screenshotBuffer),
          cleanProductionPixels: true,
          metadataVisibleInContactSheet: true,
        },
        failures,
      });
      process.stdout.write(
        `Captured ${viewport.id} ${milestone.id}: expected F${milestone.frame}, actual F${actual.media.estimatedFrame}\n`,
      );
    }

    const sheet = await contactSheet(options.output, viewport, captures);
    const failures = [
      ...captures.flatMap((capture) => capture.failures),
      ...consoleErrors.map((message) => ({ viewport: viewport.id, failure: "console-error", details: message })),
      ...pageErrors.map((message) => ({ viewport: viewport.id, failure: "page-error", details: message })),
    ];
    return {
      id: viewport.id,
      viewport: { width: viewport.width, height: viewport.height, deviceScaleFactor: 1 },
      authority: viewport.authority,
      expectedFamily: viewport.expectedFamily,
      expectedCodec: codecRecord,
      expectedObjectPosition: viewport.expectedObjectPosition,
      cinematicEndScrollY: endY,
      captures,
      contactSheet: sheet,
      runtime: { consoleErrors, pageErrors },
      failures,
    };
  } finally {
    await context.close();
  }
}

function outputIdentity(output) {
  if (isWithin(ROOT, output)) {
    return {
      scope: "REPOSITORY_PHASE4_EVIDENCE",
      repositoryRelativePath: path.relative(ROOT, output).replaceAll("\\", "/"),
    };
  }
  return { scope: "EXPLICIT_OUTSIDE_REPOSITORY_PHASE4_EVIDENCE", basename: path.basename(output) };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  options.url = normalizeUrl(options.url);
  validateOutputRootLexically(options.output);
  await validateOutputRootResolved(options.output);
  await mkdir(options.output, { recursive: true });
  await validateOutputRootResolved(options.output);
  await waitForServer(options.url, options.timeoutMs);
  const executablePath = await resolveChromium(options.chromium);

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    timeout: options.timeoutMs,
    args: ["--disable-extensions", "--disable-background-networking"],
  });
  const browserVersion = browser.version();
  const viewportRecords = [];
  try {
    for (const viewport of VIEWPORTS) {
      viewportRecords.push(await captureViewport(browser, options, viewport));
    }
  } finally {
    await browser.close();
  }

  const failures = viewportRecords.flatMap((viewport) => viewport.failures);
  const repository = await repositoryProvenance();
  const report = {
    schema: "quantum-hub.phase-4-cinematic-evidence.v1",
    status: failures.length === 0 ? "PASS" : "FAIL",
    evidenceClassification: "PHASE4_INTEGRATION_REPRODUCTION_FROM_CURRENT_LOCAL_PREVIEW",
    generatedAt: new Date().toISOString(),
    repository,
    preview: { url: options.url, localPreviewRequired: true },
    output: {
      ...outputIdentity(options.output),
      explicit: true,
      acceptedPhase2bOrPhase3EvidenceOverwritten: false,
    },
    browser: {
      product: "Chromium",
      version: browserVersion,
      executable: path.basename(executablePath),
    },
    timeline: {
      frameCount: FRAME_COUNT,
      framesPerSecond: FRAME_RATE,
      durationSeconds: 9,
      normalizedProgressFormula: "(frame - 1) / 269",
      milestones: MILESTONES,
    },
    capturePolicy: {
      viewportCount: VIEWPORTS.length,
      milestoneCountPerViewport: MILESTONES.length,
      screenshotCount: VIEWPORTS.length * MILESTONES.length,
      contactSheetCount: VIEWPORTS.length,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "no-preference",
      exactViewportScreenshots: true,
      cleanScreenshots: true,
      expectedAndActualMetadataVisibleOnContactSheets: true,
      expectedAndActualMetadataRecordedInManifest: true,
      currentDecoderTimeUsedForVisibleFrameEstimate: true,
      productionFilesWritten: false,
      acceptedEvidencePathsProtected: true,
    },
    viewports: viewportRecords,
    summary: {
      status: failures.length === 0 ? "PASS" : "FAIL",
      viewports: viewportRecords.length,
      screenshots: viewportRecords.reduce((sum, viewport) => sum + viewport.captures.length, 0),
      contactSheets: viewportRecords.filter((viewport) => viewport.contactSheet).length,
      failures: failures.length,
    },
    failures,
  };
  const reportPath = path.join(options.output, REPORT_FILENAME);
  await atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `Phase 4 cinematic evidence ${report.status}: ${report.summary.screenshots} screenshots, ${report.summary.contactSheets} contact sheets; ${reportPath}\n`,
  );
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Phase 4 evidence capture failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
