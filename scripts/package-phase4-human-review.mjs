#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
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
const FRAME_COUNT = 270;
const FRAME_RATE = 30;
const DEFAULT_TIMEOUT_MS = 20_000;
const ARCHIVE_FILENAME = "phase-4-full-cinematic-integration-human-review.zip";
const MANIFEST_FILENAME = "phase-4-full-cinematic-integration-human-review-manifest.json";
const RESULT_FILENAME = "phase-4-full-cinematic-integration-human-review-result.json";
const README_FILENAME = "README.md";
const ACCEPTED_F270_SOURCE = "artifacts/original/phase-3-crt-opening/review/full-resolution-stills/phase-3-r-desktop-f270-p1.0000-full-resolution.png";

const SELECTED_AUTHORITY_REPORTS = Object.freeze([
  "artifacts/evidence/phase-2b/phase-2b-build-report.json",
  "artifacts/evidence/phase-2b/review/phase-2b-visual-evidence-manifest.json",
  "artifacts/original/phase-3-crt-opening/review/phase-3-r-media-qa-report.json",
  "artifacts/original/phase-3-crt-opening/review/phase-3-r-render-determinism-report.json",
  "artifacts/original/phase-3-crt-opening/manifests/phase-3-r-candidate-authority.json",
]);

const PRODUCTION_ASSETS = Object.freeze([
  { id: "desktop-vp9", path: "/media/cinematic/phase-3-desktop-vp9-44a1d9facd43.webm", kind: "video", expectedMime: "video/webm" },
  { id: "desktop-h264", path: "/media/cinematic/phase-3-desktop-h264-a73be0bb9890.mp4", kind: "video", expectedMime: "video/mp4" },
  { id: "mobile-vp9", path: "/media/cinematic/phase-3-mobile-vp9-0ffcf12a431b.webm", kind: "video", expectedMime: "video/webm" },
  { id: "mobile-h264", path: "/media/cinematic/phase-3-mobile-h264-34319f80ae39.mp4", kind: "video", expectedMime: "video/mp4" },
  { id: "dormant-desktop", path: "/media/cinematic/phase-3-dormant-desktop-03f5490ab11a.png", kind: "poster", expectedMime: "image/png" },
  { id: "dormant-mobile", path: "/media/cinematic/phase-3-dormant-mobile-9d5c19b1a5e2.png", kind: "poster", expectedMime: "image/png" },
  { id: "dormant-narrow", path: "/media/cinematic/phase-3-dormant-narrow-451d05bcc3d5.png", kind: "poster", expectedMime: "image/png" },
]);

const RESPONSIVE_VIEWPORTS = Object.freeze([
  { id: "mobile-390x844", sheetId: "phase-4-mobile-390x844-contact-sheet", reviewTitle: "PHASE 4 · MOBILE · 390×844", width: 390, height: 844, family: "mobile", objectPosition: "54% 50%", sheetColumns: 2 },
  { id: "narrow-320x800", sheetId: "phase-4-320x800-contact-sheet", reviewTitle: "PHASE 4 · NARROW · 320×800", width: 320, height: 800, family: "mobile", objectPosition: "55% 50%", sheetColumns: 2 },
  { id: "tablet-portrait-768x1024", sheetId: "phase-4-768x1024-contact-sheet", reviewTitle: "PHASE 4 · TABLET PORTRAIT · 768×1024", width: 768, height: 1024, family: "mobile", objectPosition: "54% 50%", sheetColumns: 2 },
  { id: "mobile-landscape-844x390", sheetId: "phase-4-844x390-landscape-contact-sheet", reviewTitle: "PHASE 4 · LANDSCAPE · 844×390", width: 844, height: 390, family: "mobile", objectPosition: "53% 48%", sheetColumns: 1 },
]);

const RESPONSIVE_FRAMES = Object.freeze([1, 72, 126, 144, 196, 218, 250, 262, 270]);
const DESKTOP_PRODUCTION_FRAMES = Object.freeze([1, 36, 72, 116, 126, 144, 196, 218, 235, 250, 262, 268, 270]);
const PORTAL_FRAMES = Object.freeze([250, 262, 265, 267, 268, 269, 270]);
const SHORT_HEIGHT_FRAMES = Object.freeze([1, 72, 144, 218, 250, 262, 270]);
const ACCEPTED_DESKTOP_ALIGNMENT = Object.freeze({
  header: Object.freeze({ x: 0, y: 0, width: 1440, height: 121.31 }),
  entry: Object.freeze({ x: 0, y: 121.31, width: 1440, height: 812 }),
  entryContent: Object.freeze({ x: 48, y: 121.31, width: 1344, height: 812 }),
  h1: Object.freeze({ x: 48, y: 347.41, width: 1344, height: 316.73 }),
  routes: Object.freeze({ x: 48, y: 802.13, width: 1344, height: 86.19 }),
});

const SOURCE_AUTHORITY_PATHS = Object.freeze([
  "src/pages/index.astro",
  "src/components/home/EntryField.astro",
  "src/scripts/home-cinematic-integration.ts",
  "src/styles/routes/home-cinematic.css",
  "scripts/capture-phase4-evidence.mjs",
  "scripts/qa-phase4-browser.mjs",
  "scripts/package-phase4-human-review.mjs",
  "docs/planning/PHASE_3_PORTAL_ALIGNMENT_CONTRACT.md",
  ACCEPTED_F270_SOURCE,
  "artifacts/original/phase-3-crt-opening/manifests/phase-3-r-candidate-authority.json",
]);

function argumentValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArguments(argv) {
  const options = {
    url: "http://127.0.0.1:4322/",
    output: null,
    chromium: process.env.CHROME_PATH ?? null,
    milestoneManifest: process.env.PHASE4_MILESTONE_MANIFEST ?? null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    runBrowserQa: true,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--url" || value === "--base-url") {
      options.url = argumentValue(argv, index, value);
      index += 1;
    } else if (value === "--output") {
      options.output = path.resolve(argumentValue(argv, index, value));
      index += 1;
    } else if (value === "--chromium" || value === "--browser") {
      options.chromium = argumentValue(argv, index, value);
      index += 1;
    } else if (value === "--milestone-manifest") {
      options.milestoneManifest = path.resolve(argumentValue(argv, index, value));
      index += 1;
    } else if (value === "--timeout-ms") {
      options.timeoutMs = Number(argumentValue(argv, index, value));
      index += 1;
    } else if (value === "--skip-browser-qa") {
      options.runBrowserQa = false;
    } else if (value === "--help" || value === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  if (options.help) return options;
  if (!options.output) throw new Error("--output is required and must be a fresh external Phase 4 review root");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 4 full-cinematic human-review packager

Usage:
  node scripts/package-phase4-human-review.mjs \\
    --url <approved-preview-url> \\
    --output <fresh-external-phase4-root> \\
    [--chromium <executable>] \\
    [--milestone-manifest <phase4-manifest.json>] \\
    [--timeout-ms <milliseconds>] [--skip-browser-qa]

The output must not exist, must be outside the repository, and must be clearly
named for Phase 4. The tool records actual Playwright browser videos, captures
responsive/reduced/no-JS/zoom sheets, runs the current browser QA by default,
and writes ${ARCHIVE_FILENAME} with README and manifest.
`);
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(parent, candidate) {
  const relative = path.relative(normalizedPath(parent), normalizedPath(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveFromExistingAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const missing = [];
  for (;;) {
    try {
      return path.join(await realpath(cursor), ...missing.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function validateFreshExternalRoot(output) {
  const label = path.basename(output);
  if (!/phase[-_]?4/i.test(label)) {
    throw new Error("--output basename must clearly contain phase4, phase-4, or phase_4");
  }
  if (/(?:^|[-_])phase[-_]?(?:2b|3)(?:[-_]|$)/i.test(label)) {
    throw new Error("--output must not be labeled as Phase 2B or Phase 3 evidence");
  }
  if (isWithin(ROOT, output)) {
    throw new Error("--output must be external to the repository to prevent duplicate Git media bloat");
  }
  if (await pathExists(output)) {
    throw new Error("--output already exists; choose a fresh Phase 4 review root");
  }
  const resolved = await resolveFromExistingAncestor(output);
  if (isWithin(ROOT, resolved)) {
    throw new Error("Resolved --output aliases the repository or accepted evidence; choose a genuinely external root");
  }
}

function previewScope(url) {
  const hostname = url.hostname.toLowerCase();
  if (["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) return "LOOPBACK_PREVIEW";
  if (hostname === "qsite1.pages.dev" || hostname.endsWith(".qsite1.pages.dev")) return "QSITE1_CLOUDFLARE_PAGES_PREVIEW";
  return null;
}

function normalizePreviewUrl(value) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("--url must use http or https");
  const scope = previewScope(url);
  if (!scope) throw new Error("--url must be loopback or the exact Qsite1 Cloudflare Pages host (qsite1.pages.dev or *.qsite1.pages.dev)");
  if (scope === "QSITE1_CLOUDFLARE_PAGES_PREVIEW" && url.protocol !== "https:") throw new Error("Qsite1 Cloudflare Pages previews must use HTTPS");
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
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
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
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

async function resolveFfmpeg() {
  const direct = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  if (await executable(direct)) return direct;
  const roots = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0") {
    roots.push(path.resolve(process.env.PLAYWRIGHT_BROWSERS_PATH));
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    roots.push(path.join(process.env.LOCALAPPDATA, "ms-playwright"));
  } else if (process.env.HOME) {
    roots.push(path.join(process.env.HOME, ".cache", "ms-playwright"));
  }
  for (const root of roots) {
    let names = [];
    try {
      names = await readdir(root);
    } catch {
      continue;
    }
    for (const directory of names.filter((name) => name.startsWith("ffmpeg-")).sort().reverse()) {
      const candidates = process.platform === "win32"
        ? ["ffmpeg-win64.exe", "ffmpeg.exe"]
        : ["ffmpeg-linux", "ffmpeg-mac", "ffmpeg"];
      for (const filename of candidates) {
        const candidate = path.join(root, directory, filename);
        if (await executable(candidate)) return candidate;
      }
    }
  }
  return null;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

async function atomicWrite(destination, bytes) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes);
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function atomicJson(destination, value) {
  await atomicWrite(destination, `${JSON.stringify(value, null, 2)}\n`);
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

async function twoFrames(page) {
  try {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  } catch (error) {
    if (!String(error.message || error).includes("garbage collected")) throw error;
    await page.waitForTimeout(50);
  }
}

function observePage(page) {
  const record = {
    consoleErrors: [],
    pageErrors: [],
    requests: [],
    failedRequests: [],
    responses: [],
    transferTasks: [],
    transfers: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error") record.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => record.pageErrors.push(String(error.message || error)));
  page.on("request", (request) => record.requests.push(request.url()));
  page.on("requestfailed", (request) => record.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? null }));
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/media/cinematic/") && !url.includes("home-cinematic-integration")) return;
    const headers = response.headers();
    record.responses.push({
      url,
      status: response.status(),
      contentType: headers["content-type"] ?? null,
      contentLength: headers["content-length"] ?? null,
      contentRange: headers["content-range"] ?? null,
      acceptRanges: headers["accept-ranges"] ?? null,
      transferEncoding: headers["transfer-encoding"] ?? null,
    });
  });
  page.on("requestfinished", (request) => {
    const url = request.url();
    if (!url.includes("/media/cinematic/") && !url.includes("home-cinematic-integration")) return;
    const task = request.sizes()
      .then((sizes) => record.transfers.push({ url, ...sizes }))
      .catch((error) => record.transfers.push({ url, sizeError: String(error.message || error) }));
    record.transferTasks.push(task);
  });
  return record;
}

async function requestSummary(record) {
  await Promise.all(record.transferTasks);
  const paths = record.requests.map((value) => {
    try {
      return new URL(value).pathname;
    } catch {
      return value;
    }
  });
  return {
    requestCount: record.requests.length,
    cinematicAssets: [...new Set(paths.filter((value) => value.includes("/media/cinematic/")))],
    cinematicVideo: [...new Set(paths.filter((value) => value.includes("/media/cinematic/") && /\.(?:webm|mp4)$/i.test(value)))],
    cinematicPosters: [...new Set(paths.filter((value) => value.includes("/media/cinematic/") && /\.(?:png|jpe?g|webp|avif)$/i.test(value)))],
    cinematicController: [...new Set(paths.filter((value) => value.includes("home-cinematic-integration")))],
    failedRequests: record.failedRequests,
    responses: record.responses,
    transfers: record.transfers,
    consoleErrors: [...new Set(record.consoleErrors)],
    pageErrors: [...new Set(record.pageErrors)],
  };
}

async function settleBase(page, timeoutMs) {
  await page.waitForFunction(() => document.readyState === "complete", null, { timeout: timeoutMs });
  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = "auto";
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    if (document.fonts) await document.fonts.ready;
    const poster = document.querySelector("[data-cinematic-poster] img");
    if (poster instanceof HTMLImageElement) await poster.decode().catch(() => undefined);
  });
  await twoFrames(page);
}

async function settleEnhanced(page, timeoutMs) {
  await settleBase(page, timeoutMs);
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
        window.quantumPhase4?.mediaReady
        && video instanceof HTMLVideoElement
        && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && shell?.getAttribute("data-media-state") === "ready",
      );
    },
    null,
    { timeout: timeoutMs },
  );
  await page.evaluate(() => {
    const video = document.querySelector("[data-cinematic-media]");
    if (!(video instanceof HTMLVideoElement) || !("requestVideoFrameCallback" in video) || window.__phase4PresentedFrameObserver) return;
    window.__phase4PresentedFrameObserver = true;
    window.__phase4PresentedFrame = null;
    const observe = (_now, metadata) => {
      window.__phase4PresentedFrame = {
        mediaTime: Number(metadata.mediaTime.toFixed(6)),
        presentedFrames: metadata.presentedFrames,
        width: metadata.width,
        height: metadata.height,
      };
      video.requestVideoFrameCallback(observe);
    };
    video.requestVideoFrameCallback(observe);
  });
  await twoFrames(page);
}

async function runtimeState(page) {
  return page.evaluate(({ frameCount, frameRate }) => {
    const root = document.documentElement;
    const shell = document.querySelector("[data-cinematic-shell]");
    const video = document.querySelector("[data-cinematic-media]");
    const stage = document.querySelector("[data-cinematic-stage]");
    const entry = document.querySelector("#entry");
    const entryContent = document.querySelector(".entry-field__content");
    const header = document.querySelector(".site-header");
    const h1 = entry?.querySelector("h1");
    const routes = entry?.querySelector(".entry-paths");
    const industryRoute = entry?.querySelector('[data-entry-path="industry"]');
    const startupRoute = entry?.querySelector('[data-entry-path="startup"]');
    const method = document.querySelector("#method");
    const rect = (element) => {
      if (!(element instanceof Element)) return null;
      const value = element.getBoundingClientRect();
      return Object.fromEntries(["x", "y", "width", "height", "top", "right", "bottom", "left"].map((key) => [key, Number(value[key].toFixed(3))]));
    };
    const style = (element) => (element instanceof Element ? getComputedStyle(element) : null);
    const numeric = (value) => {
      const parsed = Number.parseFloat(value ?? "");
      return Number.isFinite(parsed) ? parsed : null;
    };
    const videoNode = video instanceof HTMLVideoElement ? video : null;
    const currentTime = videoNode?.currentTime ?? 0;
    const presented = window.__phase4PresentedFrame ?? null;
    const visibleTime = presented?.mediaTime ?? currentTime;
    const scene = [...document.querySelectorAll("[data-home-scene]")]
      .map((element) => ({ id: element.getAttribute("data-home-scene"), rect: element.getBoundingClientRect() }))
      .find(({ rect: bounds }) => bounds.top <= innerHeight * 0.5 && bounds.bottom >= innerHeight * 0.5)?.id ?? null;
    return {
      url: location.href,
      mode: root.dataset.cinematicMode ?? null,
      fallback: root.dataset.cinematicFallback ?? null,
      headerState: root.dataset.cinematicHeader ?? null,
      phase: shell?.getAttribute("data-cinematic-phase") ?? null,
      interactive: shell?.getAttribute("data-cinematic-interactive") ?? null,
      mediaState: shell?.getAttribute("data-media-state") ?? null,
      mediaFamily: shell?.getAttribute("data-media-family") ?? null,
      mediaCodec: shell?.getAttribute("data-media-codec") ?? null,
      mediaSource: shell?.getAttribute("data-media-source") ?? null,
      scrollProgress: numeric(shell?.getAttribute("data-scroll-progress")),
      cinematicProgress: numeric(shell?.getAttribute("data-cinematic-progress")),
      targetFrame: numeric(shell?.getAttribute("data-target-frame")),
      targetTime: numeric(shell?.getAttribute("data-target-time")),
      takeoverProgress: numeric(shell?.getAttribute("data-takeover-progress")),
      controller: window.quantumPhase4 ? { ...window.quantumPhase4 } : null,
      video: videoNode
        ? {
            currentSrc: videoNode.currentSrc || null,
            currentTime: Number(currentTime.toFixed(4)),
            visibleFrame: Math.min(frameCount, Math.max(1, Math.round(visibleTime * frameRate) + 1)),
            visibleTime: Number(visibleTime.toFixed(4)),
            presentationAuthority: presented ? "requestVideoFrameCallback metadata.mediaTime" : "settled HTMLVideoElement.currentTime fallback",
            presentedFrameMetadata: presented,
            duration: Number.isFinite(videoNode.duration) ? Number(videoNode.duration.toFixed(4)) : null,
            readyState: videoNode.readyState,
            paused: videoNode.paused,
            objectPosition: style(videoNode)?.objectPosition ?? null,
            visibility: style(videoNode)?.visibility ?? null,
            opacity: numeric(style(videoNode)?.opacity),
          }
        : null,
      visibility: {
        stage: style(stage)?.visibility ?? null,
        stageOpacity: numeric(style(stage)?.opacity),
        entryOpacity: numeric(style(entryContent)?.opacity),
        entryPointerEvents: style(entry)?.pointerEvents ?? null,
      },
      rectangles: {
        header: rect(header),
        stage: rect(stage),
        entry: rect(entry),
        entryContent: rect(entryContent),
        h1: rect(h1),
        routes: rect(routes),
        industryRoute: rect(industryRoute),
        startupRoute: rect(startupRoute),
        method: rect(method),
      },
      document: {
        scrollX: Number(scrollX.toFixed(3)),
        scrollY: Number(scrollY.toFixed(3)),
        width: innerWidth,
        height: innerHeight,
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
        maxScroll: Math.max(0, root.scrollHeight - innerHeight),
        devicePixelRatio,
      },
      visualViewport: window.visualViewport
        ? {
            width: Number(window.visualViewport.width.toFixed(3)),
            height: Number(window.visualViewport.height.toFixed(3)),
            scale: Number(window.visualViewport.scale.toFixed(3)),
          }
        : null,
      outer: { width: outerWidth, height: outerHeight },
      currentScene: scene,
      fontsReady: document.fonts?.status === "loaded",
      h1Text: h1?.textContent?.trim().replace(/\s+/g, " ") ?? null,
      videoCount: document.querySelectorAll("video").length,
    };
  }, { frameCount: FRAME_COUNT, frameRate: FRAME_RATE });
}

async function scrollAndRead(page, y) {
  await page.evaluate((nextY) => window.scrollTo({ top: nextY, left: 0, behavior: "instant" }), y);
  await twoFrames(page);
  return page.evaluate(() => ({
    y: window.scrollY,
    scrollProgress: Number(window.quantumPhase4?.scrollProgress ?? -1),
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
  const maximumY = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  const atEnd = await scrollAndRead(page, maximumY);
  if (atEnd.scrollProgress < 0.999) throw new Error(`Cinematic progress only reached ${atEnd.scrollProgress}`);
  return firstScrollMatching(page, maximumY, ({ scrollProgress }) => scrollProgress >= 0.9999);
}

async function scrollForFrame(page, endY, frame) {
  if (frame === 1) return 0;
  if (frame === FRAME_COUNT) return endY;
  const first = await firstScrollMatching(page, endY, ({ targetFrame }) => targetFrame >= frame);
  const firstState = await scrollAndRead(page, first);
  if (firstState.targetFrame !== frame) throw new Error(`No scroll position resolves target frame ${frame}`);
  const next = await firstScrollMatching(page, endY, ({ targetFrame }) => targetFrame > frame);
  const nextState = await scrollAndRead(page, next);
  const last = nextState.targetFrame > frame ? Math.max(first, next - 1) : first;
  return Math.floor((first + last) / 2);
}

async function waitForFrame(page, frame, timeoutMs = 6_000) {
  const expectedTime = (frame - 1) / FRAME_RATE;
  try {
    await page.waitForFunction(
      ({ expectedFrame, time }) => {
        const video = document.querySelector("[data-cinematic-media]");
        const presentedTime = window.__phase4PresentedFrame?.mediaTime;
        const visibleTime = Number.isFinite(presentedTime) ? presentedTime : video?.currentTime;
        return Boolean(
          video instanceof HTMLVideoElement
          && window.quantumPhase4?.targetFrame === expectedFrame
          && window.quantumPhase4?.mediaReady
          && !video.seeking
          && Number.isFinite(visibleTime)
          && Math.abs(visibleTime - time) <= 2 / 30,
        );
      },
      { expectedFrame: frame, time: expectedTime },
      { timeout: timeoutMs },
    );
    return true;
  } catch {
    return false;
  }
}

async function screenshotRecord(page, outputRoot, relativePath) {
  const buffer = await page.screenshot({
    type: "png",
    fullPage: false,
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  const metadata = await sharp(buffer).metadata();
  const absolute = path.join(outputRoot, ...relativePath.split("/"));
  await atomicWrite(absolute, buffer);
  return {
    path: relativePath,
    width: metadata.width,
    height: metadata.height,
    bytes: buffer.length,
    sha256: sha256(buffer),
  };
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
  return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`);
}

function wrapText(value, maximumCharacters) {
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current || `${current} ${word}`.length <= maximumCharacters) current = current ? `${current} ${word}` : word;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function createSheet(outputRoot, { filename, title, subtitle, panels, columns = 2 }) {
  if (columns < 1 || columns > 2) throw new Error("Review sheets intentionally support only one or two columns");
  const padding = 24;
  const gap = 18;
  const cellWidth = columns === 1 ? 900 : 620;
  const previewHeight = columns === 1 ? 620 : 520;
  const titleLines = panels.map((panel) => wrapText(panel.title, columns === 1 ? 78 : 52));
  const detailLines = panels.map((panel) => panel.lines.flatMap((line) => wrapText(line, columns === 1 ? 105 : 72)));
  const labelHeight = Math.max(...panels.map((_, index) => 26 + titleLines[index].length * 21 + detailLines[index].length * 18 + 16));
  const headerHeight = 112;
  const cellHeight = previewHeight + labelHeight;
  const rows = Math.ceil(panels.length / columns);
  const width = padding * 2 + columns * cellWidth + (columns - 1) * gap;
  const height = headerHeight + padding + rows * cellHeight + (rows - 1) * gap + padding;
  const composites = [{
    input: svg(width, headerHeight, `<rect width="100%" height="100%" fill="#070a0b"/><rect x="24" y="23" width="14" height="3" fill="#d82b72"/><text x="48" y="35" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700">${escapeXml(title)}</text><text x="24" y="68" fill="#9aa6a5" font-family="Arial,Helvetica,sans-serif" font-size="13">${escapeXml(subtitle)}</text><text x="24" y="91" fill="#687574" font-family="Arial,Helvetica,sans-serif" font-size="11">TWO-COLUMN MAXIMUM · WRAPPED METADATA · CLEAN BROWSER PIXELS ABOVE LABEL BARS</text>`),
    left: 0,
    top: 0,
  }];
  for (const [index, panel] of panels.entries()) {
    const image = await sharp(path.join(outputRoot, ...panel.path.split("/")))
      .resize(cellWidth, previewHeight, { fit: "contain", position: "centre", background: "#030506" })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = padding + column * (cellWidth + gap);
    const top = headerHeight + padding + row * (cellHeight + gap);
    const text = [];
    let y = 27;
    for (const line of titleLines[index]) {
      text.push(`<text x="16" y="${y}" fill="#f5f7f6" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700">${escapeXml(line)}</text>`);
      y += 21;
    }
    for (const line of detailLines[index]) {
      text.push(`<text x="16" y="${y}" fill="#a8b3b2" font-family="Arial,Helvetica,sans-serif" font-size="12">${escapeXml(line)}</text>`);
      y += 18;
    }
    composites.push({ input: image, left, top });
    composites.push({
      input: svg(cellWidth, labelHeight, `<rect width="100%" height="100%" fill="#101516"/><rect width="5" height="100%" fill="#d82b72"/>${text.join("")}`),
      left,
      top: top + previewHeight,
    });
    composites.push({ input: svg(cellWidth, cellHeight, `<rect x="0.5" y="0.5" width="${cellWidth - 1}" height="${cellHeight - 1}" fill="none" stroke="#33403f"/>`), left, top });
  }
  const buffer = await sharp({ create: { width, height, channels: 4, background: "#030506" } })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const relativePath = `sheets/${filename}`;
  await atomicWrite(path.join(outputRoot, ...relativePath.split("/")), buffer);
  return {
    id: path.basename(filename, ".png"),
    path: relativePath,
    width,
    height,
    bytes: buffer.length,
    sha256: sha256(buffer),
    columns,
    wrappedLabels: true,
    sourcePanels: panels.map(({ path: panelPath }) => panelPath),
  };
}

function contextOptions(viewport, extra = {}) {
  return {
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "UTC",
    serviceWorkers: "block",
    ...extra,
  };
}

async function captureMilestoneSet(browser, options, viewport, frames, id, title, failures, review = {}) {
  const context = await browser.newContext(contextOptions(viewport));
  const page = await context.newPage();
  const diagnostics = observePage(page);
  const captures = [];
  try {
    const response = await page.goto(options.url, { waitUntil: "networkidle", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error(`${id} received HTTP ${response?.status() ?? "none"}`);
    await settleEnhanced(page, options.timeoutMs);
    const endY = await cinematicEndScroll(page);
    for (const frame of frames) {
      const y = await scrollForFrame(page, endY, frame);
      await scrollAndRead(page, y);
      const decoderSettled = await waitForFrame(page, frame);
      await twoFrames(page);
      const state = await runtimeState(page);
      const slug = `f${String(frame).padStart(3, "0")}`;
      const screenshot = await screenshotRecord(page, options.output, `captures/${id}/${id}-${slug}.png`);
      const expectedTime = (frame - 1) / FRAME_RATE;
      const frameFailures = [];
      if (!decoderSettled) frameFailures.push("decoder-not-settled");
      if (state.targetFrame !== frame) frameFailures.push("target-frame-mismatch");
      if (Math.abs((state.video?.visibleFrame ?? -1000) - frame) > 2) frameFailures.push("visible-frame-outside-two-frame-tolerance");
      if (state.mediaFamily !== viewport.family) frameFailures.push("family-mismatch");
      if (state.video?.objectPosition !== viewport.objectPosition) frameFailures.push("object-position-mismatch");
      if (state.document.scrollWidth > viewport.width + 1) frameFailures.push("horizontal-overflow");
      captures.push({
        id: `${id}-${slug}`,
        expected: { frame, time: round(expectedTime), family: viewport.family, objectPosition: viewport.objectPosition },
        actual: state,
        deltas: {
          targetFrame: (state.targetFrame ?? -1000) - frame,
          presentedFrame: (state.video?.visibleFrame ?? -1000) - frame,
          presentedTimeSeconds: round((state.video?.visibleTime ?? -1000) - expectedTime, 6),
          mediaElementTimeSeconds: round((state.video?.currentTime ?? -1000) - expectedTime, 6),
        },
        requestedScrollY: y,
        decoderSettled,
        screenshot,
        failures: frameFailures,
      });
      for (const failure of frameFailures) failures.push({ scenario: `${id}/${slug}`, failure });
      process.stdout.write(`Curated capture ${id} F${frame}: visible F${state.video?.visibleFrame ?? "?"}\n`);
    }
    const continuationCaptures = [];
    for (const continuation of review.continuations ?? []) {
      await page.evaluate((selector) => {
        const target = document.querySelector(selector);
        const header = document.querySelector(".site-header");
        const top = (target?.getBoundingClientRect().top ?? 0) + scrollY;
        const headerHeight = header?.getBoundingClientRect().height ?? 0;
        window.scrollTo({ top: Math.max(0, top - headerHeight), left: 0, behavior: "instant" });
      }, continuation.selector);
      await twoFrames(page);
      const state = await runtimeState(page);
      const screenshot = await screenshotRecord(page, options.output, `captures/${id}/${id}-${continuation.id}.png`);
      const continuationFailures = [];
      if (state.currentScene !== continuation.expectedScene) continuationFailures.push("continuation-scene-mismatch");
      if (state.document.scrollWidth > viewport.width + 1) continuationFailures.push("continuation-horizontal-overflow");
      for (const failure of continuationFailures) failures.push({ scenario: `${id}/${continuation.id}`, failure });
      continuationCaptures.push({ ...continuation, state, screenshot, failures: continuationFailures });
    }
    const network = await requestSummary(diagnostics);
    if (network.pageErrors.length || network.failedRequests.length) failures.push({ scenario: id, failure: "runtime-errors", details: network });
    const panels = captures.map((capture) => ({
      path: capture.screenshot.path,
      title: review.frameLabels?.[capture.expected.frame] ?? `F${String(capture.expected.frame).padStart(3, "0")} · ${capture.actual.phase?.toUpperCase() ?? "UNKNOWN"}`,
      lines: [
        `Expected ${capture.expected.time.toFixed(4)}s · visible F${String(capture.actual.video?.visibleFrame ?? 0).padStart(3, "0")} at ${(capture.actual.video?.currentTime ?? 0).toFixed(4)}s`,
        `${capture.actual.mediaFamily}/${capture.actual.mediaCodec} · scroll ${(capture.actual.scrollProgress ?? 0).toFixed(4)} · takeover ${(capture.actual.takeoverProgress ?? 0).toFixed(4)}`,
      ],
    }));
    for (const continuationCapture of continuationCaptures) {
      panels.push({
        path: continuationCapture.screenshot.path,
        title: continuationCapture.title,
        lines: [
          `Actual semantic continuation · scene ${continuationCapture.state.currentScene ?? "unknown"}`,
          `${continuationCapture.state.document.width}×${continuationCapture.state.document.height} · y ${continuationCapture.state.document.scrollY.toFixed(0)} · family ${continuationCapture.state.mediaFamily}`,
        ],
      });
    }
    const sheet = await createSheet(options.output, {
      filename: `${id}.png`,
      title,
      subtitle: `${viewport.width}×${viewport.height} · actual and expected decoder state · preview URL recorded in manifest`,
      panels,
      columns: review.columns ?? viewport.sheetColumns ?? 2,
    });
    return { id, viewport, endY, captures, continuations: continuationCaptures, sheet, network };
  } finally {
    await context.close();
  }
}

async function injectRecordingOverlay(page, title, method) {
  await page.evaluate(({ heading, inputMethod }) => {
    let overlay = document.querySelector("[data-phase4-review-recording]");
    if (!(overlay instanceof HTMLElement)) {
      overlay = document.createElement("div");
      overlay.dataset.phase4ReviewRecording = "true";
      Object.assign(overlay.style, {
        position: "fixed",
        top: "12px",
        right: "12px",
        zIndex: "2147483647",
        maxWidth: "min(560px, calc(100vw - 24px))",
        padding: "10px 12px",
        border: "1px solid rgba(240,107,160,.72)",
        borderLeft: "5px solid #d82b72",
        background: "rgba(5,8,9,.9)",
        color: "#f5f7f6",
        font: "600 12px/1.45 Arial, sans-serif",
        letterSpacing: ".02em",
        pointerEvents: "none",
        whiteSpace: "pre-line",
      });
      document.body.append(overlay);
    }
    overlay.dataset.heading = heading;
    overlay.dataset.inputMethod = inputMethod;
  }, { heading: title, inputMethod: method });
  await updateRecordingOverlay(page);
}

async function updateRecordingOverlay(page) {
  await page.evaluate(() => {
    const overlay = document.querySelector("[data-phase4-review-recording]");
    if (!(overlay instanceof HTMLElement)) return;
    const state = window.quantumPhase4;
    const scene = [...document.querySelectorAll("[data-home-scene]")]
      .map((element) => ({ id: element.getAttribute("data-home-scene"), rect: element.getBoundingClientRect() }))
      .find(({ rect }) => rect.top <= innerHeight * 0.5 && rect.bottom >= innerHeight * 0.5)?.id ?? "between sections";
    overlay.textContent = `${overlay.dataset.heading}\nAUTOMATED PLAYWRIGHT · ${overlay.dataset.inputMethod}\nNOT HUMAN TRACKPAD INPUT\ny ${Math.round(scrollY)} · ${scene} · ${state ? `F${state.targetFrame} ${state.actualTime.toFixed(3)}s` : "static"}`;
  });
}

async function recordingGeometry(page) {
  return page.evaluate(() => {
    const absolute = (element, edge) => {
      const rect = element?.getBoundingClientRect();
      return rect ? rect[edge] + scrollY : null;
    };
    const shell = document.querySelector("[data-cinematic-shell]");
    const entry = document.querySelector("#entry");
    const method = document.querySelector("#method");
    const header = document.querySelector(".site-header");
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    const shellTop = absolute(shell, "top") ?? 0;
    const entryTop = absolute(entry, "top") ?? 0;
    const entryBottom = absolute(entry, "bottom") ?? entryTop;
    const methodTop = absolute(method, "top") ?? entryBottom;
    const methodBottom = absolute(method, "bottom") ?? methodTop;
    return {
      headerHeight,
      cinematicEndY: Math.max(0, entryTop - headerHeight - shellTop),
      entryTop,
      entryBottom,
      methodTop,
      methodBottom,
      maxScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      viewportHeight: innerHeight,
    };
  });
}

async function wheelIncrementally(page, targetY, step, delayMs) {
  const trace = [];
  let previous = -1;
  for (let index = 0; index < 800; index += 1) {
    const current = await page.evaluate(() => window.scrollY);
    if (Math.abs(targetY - current) <= 2) break;
    const delta = Math.sign(targetY - current) * Math.min(Math.abs(step), Math.abs(targetY - current));
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(delayMs);
    await updateRecordingOverlay(page);
    const next = await page.evaluate(() => window.scrollY);
    if (index % 8 === 0 || Math.abs(targetY - next) <= 2) {
      const state = await runtimeState(page);
      trace.push({ step: index + 1, y: state.document.scrollY, frame: state.targetFrame, visibleFrame: state.video?.visibleFrame ?? null, phase: state.phase, scene: state.currentScene });
    }
    if (next === previous && Math.abs(targetY - next) > 2) throw new Error(`Incremental wheel stalled at ${next}, target ${targetY}`);
    previous = next;
  }
  return trace;
}

async function inspectVideo(file, requestedSize, ffmpegPath) {
  const bytes = await readFile(file);
  const record = {
    bytes: bytes.length,
    sha256: sha256(bytes),
    containerSignature: bytes.subarray(0, 4).toString("hex"),
    requestedWidth: requestedSize.width,
    requestedHeight: requestedSize.height,
    actualWidth: null,
    actualHeight: null,
    durationSeconds: null,
    ffmpegProbe: ffmpegPath ? "bundled Playwright ffmpeg stderr metadata" : "unavailable",
  };
  if (ffmpegPath) {
    let stderr = "";
    try {
      const result = await execFileAsync(ffmpegPath, ["-hide_banner", "-i", file], { windowsHide: true, maxBuffer: 2_000_000 });
      stderr = result.stderr ?? "";
    } catch (error) {
      stderr = String(error.stderr ?? "");
    }
    const size = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})(?:[\s,])/s);
    if (size) {
      record.actualWidth = Number(size[1]);
      record.actualHeight = Number(size[2]);
    }
    const duration = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (duration) record.durationSeconds = round(Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]), 3);
  }
  return record;
}

async function recordScenario(browser, options, ffmpegPath, scenario, failures) {
  const temporaryDir = path.join(options.output, ".recording-temp");
  await mkdir(temporaryDir, { recursive: true });
  const context = await browser.newContext(contextOptions(scenario.viewport, {
    recordVideo: { dir: temporaryDir, size: { width: scenario.viewport.width, height: scenario.viewport.height } },
  }));
  const page = await context.newPage();
  const video = page.video();
  const diagnostics = observePage(page);
  let geometry;
  let trace = [];
  let checkpoints = {};
  try {
    const response = await page.goto(options.url, { waitUntil: "networkidle", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error(`${scenario.id} received HTTP ${response?.status() ?? "none"}`);
    await settleEnhanced(page, options.timeoutMs);
    geometry = await recordingGeometry(page);
    await page.mouse.move(Math.floor(scenario.viewport.width / 2), Math.floor(scenario.viewport.height / 2));

    if (scenario.action === "reverse") {
      const target = Math.min(geometry.maxScroll, geometry.methodBottom - geometry.viewportHeight * 0.55);
      await scrollAndRead(page, target);
      await page.waitForTimeout(700);
    }
    await injectRecordingOverlay(page, scenario.title, scenario.inputLabel);
    await page.waitForTimeout(600);
    checkpoints.start = await runtimeState(page);

    if (scenario.action === "forward-method") {
      const target = Math.min(geometry.maxScroll, geometry.methodBottom - geometry.viewportHeight * 0.55);
      trace = await wheelIncrementally(page, target, 76, 62);
      await page.waitForTimeout(800);
    } else if (scenario.action === "reverse") {
      trace = await wheelIncrementally(page, 0, 82, 60);
      await page.waitForTimeout(800);
      await waitForFrame(page, 1).catch(() => false);
    } else if (scenario.action === "fast-jump") {
      const portalY = Math.round(geometry.cinematicEndY * 0.985);
      const methodY = Math.min(geometry.maxScroll, Math.round(geometry.methodTop + geometry.viewportHeight * 0.2));
      await page.mouse.wheel(0, portalY);
      await page.waitForTimeout(850);
      await updateRecordingOverlay(page);
      checkpoints.topToPortal = await runtimeState(page);
      await page.mouse.wheel(0, methodY - portalY);
      await page.waitForTimeout(850);
      await updateRecordingOverlay(page);
      checkpoints.portalToMethod = await runtimeState(page);
      await page.mouse.wheel(0, portalY - methodY);
      await page.waitForTimeout(850);
      await updateRecordingOverlay(page);
      checkpoints.reverseToPortal = await runtimeState(page);
    } else if (scenario.action === "mobile-forward") {
      const target = Math.min(geometry.maxScroll, geometry.entryBottom - geometry.viewportHeight * 0.2);
      trace = await wheelIncrementally(page, target, 54, 68);
      await page.waitForTimeout(800);
    } else {
      throw new Error(`Unknown recording action ${scenario.action}`);
    }
    checkpoints.end = await runtimeState(page);
  } finally {
    await context.close();
  }
  if (!video) throw new Error(`Playwright did not create a video handle for ${scenario.id}`);
  const generatedPath = await video.path();
  const relativePath = `recordings/${scenario.filename}`;
  const destination = path.join(options.output, ...relativePath.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(generatedPath, destination);
  await rmdir(temporaryDir).catch(() => {});
  const media = await inspectVideo(destination, scenario.viewport, ffmpegPath);
  const checks = {
    webmSignature: media.containerSignature === "1a45dfa3",
    requestedDimensionsVerified: media.actualWidth === null || (media.actualWidth === scenario.viewport.width && media.actualHeight === scenario.viewport.height),
    enhancedAtStart: checkpoints.start?.mode === "enhanced",
    reachedExpectedEnd: true,
  };
  if (scenario.action === "forward-method") checks.reachedExpectedEnd = checkpoints.end?.currentScene === "method" && checkpoints.end.document.scrollY >= geometry.methodTop;
  if (scenario.action === "reverse") checks.reachedExpectedEnd = checkpoints.end?.document.scrollY <= 2 && checkpoints.end?.targetFrame <= 2 && checkpoints.end?.phase === "physical";
  if (scenario.action === "mobile-forward") checks.reachedExpectedEnd = checkpoints.end?.document.scrollY >= geometry.cinematicEndY && checkpoints.end?.mediaFamily === "mobile";
  if (scenario.action === "fast-jump") {
    checks.reachedExpectedEnd = checkpoints.topToPortal?.phase === "takeover"
      && checkpoints.portalToMethod?.currentScene === "method"
      && checkpoints.reverseToPortal?.phase === "takeover";
  }
  for (const [check, passed] of Object.entries(checks)) {
    if (!passed) failures.push({ scenario: `recording/${scenario.id}`, failure: check });
  }
  const network = await requestSummary(diagnostics);
  if (network.pageErrors.length || network.failedRequests.length) failures.push({ scenario: `recording/${scenario.id}`, failure: "runtime-errors", details: network });
  process.stdout.write(`Recorded ${scenario.id}: ${media.bytes} bytes\n`);
  return {
    id: scenario.id,
    title: scenario.title,
    path: relativePath,
    viewport: scenario.viewport,
    inputMethod: scenario.inputLabel,
    humanInputClaimed: false,
    overlayVisibleInRecording: true,
    geometry,
    checkpoints,
    trace,
    network,
    media,
    checks,
  };
}

async function alignEntryBelowHeader(page) {
  await page.evaluate(() => {
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    const entryTop = (entry?.getBoundingClientRect().top ?? 0) + scrollY;
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: Math.max(0, entryTop - headerHeight), left: 0, behavior: "instant" });
  });
  await twoFrames(page);
}

async function captureStaticVariants(browser, options, kind, viewports, failures) {
  const captures = [];
  for (const viewport of viewports) {
    const isNoJs = kind === "no-javascript";
    const context = await browser.newContext(contextOptions(viewport, {
      javaScriptEnabled: !isNoJs,
      reducedMotion: kind === "reduced-motion" ? "reduce" : "no-preference",
    }));
    const page = await context.newPage();
    const diagnostics = observePage(page);
    try {
      const response = await page.goto(options.url, { waitUntil: "networkidle", timeout: options.timeoutMs });
      if (!response?.ok()) throw new Error(`${kind}/${viewport.id} received HTTP ${response?.status() ?? "none"}`);
      await settleBase(page, options.timeoutMs);
      const before = await runtimeState(page);
      const topShot = await screenshotRecord(page, options.output, `captures/${kind}/${kind}-${viewport.id}-top.png`);
      let navigationMethod = "review harness scroll to ENTRY";
      if (isNoJs) {
        await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(350);
        navigationMethod = "native no-JS skip link (Tab, Enter)";
      } else {
        await alignEntryBelowHeader(page);
      }
      const entry = await runtimeState(page);
      const entryShot = await screenshotRecord(page, options.output, `captures/${kind}/${kind}-${viewport.id}-entry.png`);
      const network = await requestSummary(diagnostics);
      const expectedMode = isNoJs ? null : "static";
      const checks = {
        mode: before.mode === expectedMode,
        fallback: kind === "reduced-motion" ? [null, "reduced-motion"].includes(before.fallback) : before.fallback === null,
        noVideoRequest: network.cinematicVideo.length === 0,
        onePosterRequest: network.cinematicPosters.length === 1,
        noControllerRequest: network.cinematicController.length === 0,
        dormantVideo: !before.video?.currentSrc,
        semanticEntryVisible: (entry.visibility.entryOpacity ?? 0) >= 0.99,
        noHorizontalOverflow: entry.document.scrollWidth <= viewport.width + 2,
      };
      for (const [check, passed] of Object.entries(checks)) {
        if (!passed) failures.push({ scenario: `${kind}/${viewport.id}`, failure: check, details: { before, entry, network } });
      }
      captures.push({ viewport, before, entry, navigationMethod, screenshots: { top: topShot, entry: entryShot }, network, checks });
    } finally {
      await context.close();
    }
  }
  const panels = captures.flatMap((capture) => [
    {
      path: capture.screenshots.top.path,
      title: `${capture.viewport.width}×${capture.viewport.height} · TOP`,
      lines: [`${kind} · mode ${capture.before.mode ?? "unset"} · fallback ${capture.before.fallback ?? "none"}`, `video requests ${capture.network.cinematicVideo.length} · poster requests ${capture.network.cinematicPosters.length} · controller requests ${capture.network.cinematicController.length}`],
    },
    {
      path: capture.screenshots.entry.path,
      title: `${capture.viewport.width}×${capture.viewport.height} · ENTRY`,
      lines: [capture.navigationMethod, `ENTRY opacity ${(capture.entry.visibility.entryOpacity ?? 0).toFixed(2)} · horizontal overflow ${Math.max(0, capture.entry.document.scrollWidth - capture.viewport.width)}px`],
    },
  ]);
  const sheet = await createSheet(options.output, {
    filename: `phase-4-${kind}.png`,
    title: `PHASE 4 · ${kind.replaceAll("-", " ").toUpperCase()}`,
    subtitle: `${captures.length} authored fallback viewport${captures.length === 1 ? "" : "s"} · top and semantic ENTRY states`,
    panels,
    columns: 2,
  });
  return { id: kind, captures, sheet };
}

async function openZoomPage(browser, options, viewport, instrumentationFallback = false) {
  const context = await browser.newContext(contextOptions(viewport));
  const page = await context.newPage();
  const diagnostics = observePage(page);
  let method = "Chrome DevTools Protocol Emulation.setPageScaleFactor(2)";
  if (instrumentationFallback) {
    method = "unzoomed safety-path instrumentation: visualViewport.scale reported as 2 before authored controller initialization";
    await page.addInitScript(() => {
      if (window.visualViewport) Object.defineProperty(window.visualViewport, "scale", { configurable: true, get: () => 2 });
    });
  } else {
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  }
  const response = await page.goto(options.url, { waitUntil: "networkidle", timeout: options.timeoutMs });
  if (!response?.ok()) throw new Error(`zoom/${viewport.id} received HTTP ${response?.status() ?? "none"}`);
  await settleBase(page, options.timeoutMs);
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode !== "candidate", null, { timeout: options.timeoutMs }).catch(() => {});
  return { context, page, diagnostics, method, state: await runtimeState(page), instrumentationFallback };
}

async function captureZoomVariants(browser, options, viewports, failures) {
  const captures = [];
  for (const viewport of viewports) {
    let opened = await openZoomPage(browser, options, viewport, false);
    const reliable = (opened.state.visualViewport?.scale ?? 1) >= 1.75
      && opened.state.mode === "static"
      && opened.state.fallback === "typography-fit";
    if (!reliable) {
      await opened.context.close();
      opened = await openZoomPage(browser, options, viewport, true);
    }
    const { context, page, diagnostics, method, instrumentationFallback } = opened;
    try {
      const before = await runtimeState(page);
      const topShot = await screenshotRecord(page, options.output, `captures/zoom-200/zoom-200-${viewport.id}-top.png`);
      await alignEntryBelowHeader(page);
      const entry = await runtimeState(page);
      const entryShot = await screenshotRecord(page, options.output, `captures/zoom-200/zoom-200-${viewport.id}-entry.png`);
      const network = await requestSummary(diagnostics);
      const checks = {
        authoredCleanBypass: before.mode === "static" && before.fallback === "typography-fit",
        requestedScaleObserved: instrumentationFallback || (before.visualViewport?.scale ?? 1) >= 1.75,
        noVideoRequest: network.cinematicVideo.length === 0,
        onePosterRequest: network.cinematicPosters.length === 1,
        semanticEntryVisible: (entry.visibility.entryOpacity ?? 0) >= 0.99,
        noHorizontalOverflow: entry.document.scrollWidth <= viewport.width + 2,
      };
      for (const [check, passed] of Object.entries(checks)) {
        if (!passed) failures.push({ scenario: `zoom-200/${viewport.id}`, failure: check, details: { before, entry, network, method } });
      }
      captures.push({ viewport, method, instrumentationFallback, before, entry, screenshots: { top: topShot, entry: entryShot }, network, checks });
    } finally {
      await context.close();
    }
  }
  const panels = captures.flatMap((capture) => [
    {
      path: capture.screenshots.top.path,
      title: `${capture.viewport.width}×${capture.viewport.height} · 200% TOP`,
      lines: [capture.method, `observed scale ${capture.before.visualViewport?.scale ?? "n/a"} · authored fallback ${capture.before.fallback ?? "none"}`],
    },
    {
      path: capture.screenshots.entry.path,
      title: `${capture.viewport.width}×${capture.viewport.height} · 200% ENTRY`,
      lines: [capture.instrumentationFallback ? "Clean bypass capture; content is not natively zoomed" : "Native CDP page-scale capture", `ENTRY opacity ${(capture.entry.visibility.entryOpacity ?? 0).toFixed(2)} · video requests ${capture.network.cinematicVideo.length} · poster requests ${capture.network.cinematicPosters.length}`],
    },
  ]);
  const sheet = await createSheet(options.output, {
    filename: "phase-4-zoom-200.png",
    title: "PHASE 4 · 200% PAGE ZOOM",
    subtitle: "Desktop and mobile · authored typography-fit bypass · capture method stated per panel",
    panels,
    columns: 2,
  });
  return { id: "zoom-200", captures, sheet };
}

async function observeSupportingRoute(browser, options, failures) {
  const route = "/about/";
  const context = await browser.newContext(contextOptions({ width: 1280, height: 800 }));
  const page = await context.newPage();
  const diagnostics = observePage(page);
  try {
    const url = new URL(route, options.url).toString();
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: options.timeoutMs });
    await settleBase(page, options.timeoutMs);
    const state = await page.evaluate(() => ({
      path: location.pathname,
      h1Count: document.querySelectorAll("h1").length,
      cinematicShells: document.querySelectorAll("[data-cinematic-shell]").length,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
    }));
    const network = await requestSummary(diagnostics);
    const checks = {
      http200: response?.status() === 200,
      noCinematicVideo: network.cinematicVideo.length === 0,
      noCinematicPoster: network.cinematicPosters.length === 0,
      noCinematicController: network.cinematicController.length === 0,
      noCinematicDom: state.cinematicShells === 0,
      oneH1: state.h1Count === 1,
      noHorizontalOverflow: state.horizontalOverflow <= 2,
    };
    for (const [check, passed] of Object.entries(checks)) {
      if (!passed) failures.push({ scenario: `supporting-route${route}`, failure: check, details: { state, network } });
    }
    return { route, url, status: response?.status() ?? null, state, network, checks };
  } finally {
    await context.close();
  }
}

function selectedHeaders(response) {
  const headers = response.headers;
  return {
    contentType: headers.get("content-type"),
    contentLength: headers.get("content-length"),
    contentRange: headers.get("content-range"),
    acceptRanges: headers.get("accept-ranges"),
    cacheControl: headers.get("cache-control"),
    etag: headers.get("etag"),
    lastModified: headers.get("last-modified"),
  };
}

async function probeProductionAssets(options, failures) {
  const probes = [];
  for (const asset of PRODUCTION_ASSETS) {
    const url = new URL(asset.path, options.url).toString();
    const headResponse = await fetch(url, { method: "HEAD", redirect: "manual" });
    const head = {
      method: "HEAD",
      status: headResponse.status,
      statusText: headResponse.statusText,
      headers: selectedHeaders(headResponse),
    };
    let range = null;
    if (asset.kind === "video") {
      const rangeResponse = await fetch(url, { headers: { Range: "bytes=0-1" }, redirect: "manual" });
      const body = Buffer.from(await rangeResponse.arrayBuffer());
      range = {
        method: "GET",
        requestRange: "bytes=0-1",
        status: rangeResponse.status,
        statusText: rangeResponse.statusText,
        responseMode: rangeResponse.status === 206
          ? "206_PARTIAL_CONTENT"
          : rangeResponse.status === 200
            ? "200_FULL_RESPONSE_TO_RANGE_REQUEST"
            : "UNEXPECTED_STATUS",
        headers: selectedHeaders(rangeResponse),
        receivedBodyBytes: body.length,
        receivedBodySha256: sha256(body),
        note: rangeResponse.status === 200
          ? "A full 200 response to Range is recorded honestly and is not an automatic failure; browser seek behavior is validated separately."
          : "Partial-range capability observed directly.",
      };
    }
    const checks = {
      headAvailable: headResponse.status === 200,
      mimeMatches: head.headers.contentType?.split(";", 1)[0].toLowerCase() === asset.expectedMime,
      rangeResponseAccepted: range ? [200, 206].includes(range.status) : true,
      partialRangeWellFormed: range?.status === 206 ? /^bytes\s+0-1\//i.test(range.headers.contentRange ?? "") && range.receivedBodyBytes === 2 : true,
    };
    for (const [check, passed] of Object.entries(checks)) {
      if (!passed) failures.push({ scenario: `asset-probe/${asset.id}`, failure: check, details: { head, range } });
    }
    probes.push({ ...asset, url, head, range, checks });
  }
  return {
    preview: options.url,
    assets: probes,
    summary: {
      assets: probes.length,
      videos: probes.filter(({ kind }) => kind === "video").length,
      posters: probes.filter(({ kind }) => kind === "poster").length,
      range206Partial: probes.filter(({ range }) => range?.status === 206).length,
      range200Full: probes.filter(({ range }) => range?.status === 200).length,
      failedChecks: probes.flatMap(({ checks }) => Object.values(checks)).filter((passed) => !passed).length,
    },
  };
}

function rectangleDelta(expected, actual) {
  const fields = ["x", "y", "width", "height"];
  const delta = Object.fromEntries(fields.map((field) => [field, round((actual?.[field] ?? Number.NaN) - expected[field], 3)]));
  const maximumAbsolute = Math.max(...Object.values(delta).map((value) => Math.abs(value)));
  return { expected, actual: actual ? Object.fromEntries(fields.map((field) => [field, actual[field]])) : null, delta, maximumAbsolute: round(maximumAbsolute, 3) };
}

async function createAlignmentEvidence(options, portalSet, failures) {
  const finalCapture = portalSet.captures.find(({ expected }) => expected.frame === 270);
  const physicalCapture = portalSet.captures.find(({ expected }) => expected.frame === 269);
  if (!finalCapture || !physicalCapture) throw new Error("Portal capture set lacks F269 or F270 alignment panels");
  const measurements = Object.fromEntries(Object.entries(ACCEPTED_DESKTOP_ALIGNMENT).map(([key, expected]) => [key, rectangleDelta(expected, finalCapture.actual.rectangles[key])]));
  const maximumAbsoluteDelta = Math.max(...Object.values(measurements).map(({ maximumAbsolute }) => maximumAbsolute));
  const passesThreePixelContract = maximumAbsoluteDelta <= 3;
  if (!passesThreePixelContract) failures.push({ scenario: "physical-dom-alignment", failure: "mapped-anchor-delta", measured: maximumAbsoluteDelta, expected: "<= 3 CSS px" });

  const overlayRelative = "captures/alignment/phase-4-desktop-alignment-overlay.png";
  const overlaySource = path.join(options.output, ...finalCapture.screenshot.path.split("/"));
  const boxes = [];
  for (const [key, measurement] of Object.entries(measurements)) {
    const expected = measurement.expected;
    const actual = measurement.actual;
    boxes.push(`<rect x="${expected.x}" y="${expected.y}" width="${expected.width}" height="${expected.height}" fill="none" stroke="#42dbe5" stroke-width="2" stroke-dasharray="9 7"/>`);
    if (actual) boxes.push(`<rect x="${actual.x}" y="${actual.y}" width="${actual.width}" height="${actual.height}" fill="none" stroke="#f06ba0" stroke-width="2"/>`);
    boxes.push(`<text x="${Math.max(8, expected.x + 6)}" y="${Math.max(18, expected.y + 18)}" fill="#ffffff" stroke="#050708" stroke-width="3" paint-order="stroke" font-family="Arial,sans-serif" font-size="13">${escapeXml(key)} Δmax ${measurement.maximumAbsolute.toFixed(3)}px</text>`);
  }
  const overlay = await sharp(overlaySource)
    .composite([{ input: svg(1440, 900, `${boxes.join("")}<rect x="16" y="842" width="825" height="42" rx="4" fill="rgba(4,7,8,.90)"/><text x="30" y="868" fill="#f5f7f6" font-family="Arial,sans-serif" font-size="15">CYAN DASH = frozen Phase 2B box · MAGENTA = current runtime DOM · MAX Δ ${maximumAbsoluteDelta.toFixed(3)} CSS px</text>`), left: 0, top: 0 }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await atomicWrite(path.join(options.output, ...overlayRelative.split("/")), overlay);
  const overlayRecord = { path: overlayRelative, width: 1440, height: 900, bytes: overlay.length, sha256: sha256(overlay) };

  const rows = Object.entries(measurements).map(([key, value], index) => {
    const y = 150 + index * 70;
    return `<text x="55" y="${y}" fill="#ffffff" font-family="Arial,sans-serif" font-size="19" font-weight="700">${escapeXml(key)}</text><text x="280" y="${y}" fill="#a8b3b2" font-family="Arial,sans-serif" font-size="17">Δx ${value.delta.x.toFixed(3)} · Δy ${value.delta.y.toFixed(3)} · Δw ${value.delta.width.toFixed(3)} · Δh ${value.delta.height.toFixed(3)} · max ${value.maximumAbsolute.toFixed(3)}px</text>`;
  });
  const tableRelative = "captures/alignment/phase-4-desktop-alignment-delta-table.png";
  const table = await sharp(svg(1440, 900, `<rect width="100%" height="100%" fill="#070a0b"/><rect x="48" y="52" width="18" height="4" fill="#d82b72"/><text x="80" y="67" fill="#ffffff" font-family="Arial,sans-serif" font-size="29" font-weight="700">PHYSICAL → DOM ALIGNMENT MEASUREMENT</text><text x="52" y="105" fill="#a8b3b2" font-family="Arial,sans-serif" font-size="16">Current F270 runtime DOM compared with the frozen Phase 2B 1440×900 CSS-box authority.</text>${rows.join("")}<text x="52" y="535" fill="#42dbe5" font-family="Arial,sans-serif" font-size="23" font-weight="700">MAXIMUM ABSOLUTE DELTA: ${maximumAbsoluteDelta.toFixed(3)} CSS px · ${passesThreePixelContract ? "PASS" : "FAIL"} (≤ 3px)</text><text x="52" y="590" fill="#a8b3b2" font-family="Arial,sans-serif" font-size="15">Live F269 shows the actual crossover; the accepted F270 source is separately projected and labeled.</text><text x="52" y="620" fill="#a8b3b2" font-family="Arial,sans-serif" font-size="15">Cabinet/bezel/cable structural mapping is not applicable after authored exit; this sheet does not fabricate a physical anchor.</text><text x="52" y="650" fill="#a8b3b2" font-family="Arial,sans-serif" font-size="15">Human review remains required for raster grade, continuity, and perceptual crossover.</text>`))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await atomicWrite(path.join(options.output, ...tableRelative.split("/")), table);
  const tableRecord = { path: tableRelative, width: 1440, height: 900, bytes: table.length, sha256: sha256(table) };

  const acceptedSourcePath = path.join(ROOT, ...ACCEPTED_F270_SOURCE.split("/"));
  const acceptedSourceBytes = await readFile(acceptedSourcePath);
  const acceptedSourceMetadata = await sharp(acceptedSourceBytes).metadata();
  const scale = Math.max(1440 / acceptedSourceMetadata.width, 900 / acceptedSourceMetadata.height);
  const resizedWidth = Math.round(acceptedSourceMetadata.width * scale);
  const resizedHeight = Math.round(acceptedSourceMetadata.height * scale);
  const cropLeft = Math.max(0, Math.min(resizedWidth - 1440, Math.round((resizedWidth - 1440) * 0.48)));
  const cropTop = Math.max(0, Math.min(resizedHeight - 900, Math.round((resizedHeight - 900) * 0.5)));
  const projectedRelative = "captures/alignment/phase-4-accepted-f270-source-projection-1440x900.png";
  const projected = await sharp(acceptedSourceBytes)
    .resize(resizedWidth, resizedHeight, { fit: "fill" })
    .extract({ left: cropLeft, top: cropTop, width: 1440, height: 900 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await atomicWrite(path.join(options.output, ...projectedRelative.split("/")), projected);
  const projectedRecord = {
    path: projectedRelative,
    width: 1440,
    height: 900,
    bytes: projected.length,
    sha256: sha256(projected),
    derivedFrom: {
      path: ACCEPTED_F270_SOURCE,
      width: acceptedSourceMetadata.width,
      height: acceptedSourceMetadata.height,
      bytes: acceptedSourceBytes.length,
      sha256: sha256(acceptedSourceBytes),
    },
    projection: {
      fit: "cover",
      objectPosition: "48% 50%",
      resizedWidth,
      resizedHeight,
      cropLeft,
      cropTop,
      note: "review-only projection of accepted source; the live F270 stage is correctly hidden",
    },
  };

  const sheet = await createSheet(options.output, {
    filename: "phase-4-physical-dom-alignment-sheet.png",
    title: "PHASE 4 · PHYSICAL → DOM ALIGNMENT",
    subtitle: `1440×900 · frozen Phase 2B box authority · maximum measured delta ${maximumAbsoluteDelta.toFixed(3)} CSS px`,
    panels: [
      { path: physicalCapture.screenshot.path, title: "F269 · LIVE LATE CROSSOVER", lines: ["Actual runtime pixels · physical stage and semantic crossover", "Last live pre-settlement state; no claim that this is an isolated F270 physical frame"] },
      { path: projectedRecord.path, title: "ACCEPTED F270 SOURCE · REVIEW PROJECTION", lines: ["Accepted 1920×1080 source projected with cover at 48% 50%", "Review-only derivative; live settled stage is correctly hidden"] },
      { path: finalCapture.screenshot.path, title: "F270 · SEMANTIC DOM HANDOFF", lines: ["Actual runtime pixels · stage hidden · ENTRY interactive", `Current DOM measured against accepted 1440×900 geometry`] },
      { path: overlayRecord.path, title: "EXPECTED / ACTUAL BOX OVERLAY", lines: ["Cyan dashed = frozen authority · magenta = current DOM", `Maximum absolute delta ${maximumAbsoluteDelta.toFixed(3)} CSS px`] },
      { path: tableRecord.path, title: "SIGNED CSS-PIXEL DELTAS", lines: ["x, y, width, and height measured per applicable anchor", "No fabricated physical anchor after cabinet/bezel/cable exit"] },
    ],
    columns: 2,
  });
  return {
    authority: "docs/planning/PHASE_3_PORTAL_ALIGNMENT_CONTRACT.md accepted 1440x900 geometry",
    physicalPanelFrame: 269,
    semanticPanelFrame: 270,
    measurements,
    maximumAbsoluteDelta: round(maximumAbsoluteDelta, 3),
    toleranceCssPixels: 3,
    passesThreePixelContract,
    physicalKeepoutMapping: { applicable: false, reason: "cabinet, bezel, and cable have authored out of frame at semantic handoff; no physical anchor is fabricated" },
    overlay: overlayRecord,
    deltaTable: tableRecord,
    acceptedF270Projection: projectedRecord,
    sheet,
  };
}

async function runBrowserQa(options, chromiumPath, failures) {
  const relativePath = "reports/phase-4-browser-report-current.json";
  const destination = path.join(options.output, ...relativePath.split("/"));
  if (!options.runBrowserQa) return { executed: false, path: null, passed: null };
  const args = [
    path.join(ROOT, "scripts", "qa-phase4-browser.mjs"),
    "--base-url", options.url,
    "--browser", chromiumPath,
    "--report", destination,
    "--server-mode", "external",
  ];
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    const result = await execFileAsync(process.execPath, args, { cwd: ROOT, windowsHide: true, maxBuffer: 8_000_000 });
    stdout = result.stdout ?? "";
    stderr = result.stderr ?? "";
  } catch (error) {
    stdout = String(error.stdout ?? "");
    stderr = String(error.stderr ?? "");
    exitCode = Number(error.code) || 1;
  }
  await atomicWrite(path.join(options.output, "reports", "phase-4-browser-qa-console.txt"), `exit code: ${exitCode}\n\nSTDOUT\n${stdout}\nSTDERR\n${stderr}`);
  let report = null;
  if (await pathExists(destination)) report = JSON.parse(await readFile(destination, "utf8"));
  const passed = exitCode === 0 && report?.passed === true;
  if (!passed) failures.push({ scenario: "browser-qa", failure: "current-full-browser-report", details: { exitCode, reportPassed: report?.passed ?? null } });
  return { executed: true, path: relativePath, exitCode, passed, summary: report ? { generatedAt: report.generatedAt, mode: report.mode, viewports: report.viewports?.length, scrollTraversals: report.scrollTraversals?.length, failures: report.failures?.length } : null };
}

async function copyMilestoneManifest(options, failures) {
  if (!options.milestoneManifest) return { supplied: false };
  const bytes = await readFile(options.milestoneManifest);
  const parsed = JSON.parse(bytes.toString("utf8"));
  const relativePath = "reports/phase-4-cinematic-evidence-manifest.json";
  await atomicWrite(path.join(options.output, ...relativePath.split("/")), bytes);
  if (parsed.status !== "PASS") failures.push({ scenario: "milestone-manifest", failure: "supplied-manifest-not-pass", measured: parsed.status });
  return { supplied: true, source: options.milestoneManifest, path: relativePath, bytes: bytes.length, sha256: sha256(bytes), status: parsed.status ?? null, summary: parsed.summary ?? null };
}

async function copySelectedAuthorityReports(options) {
  const copies = [];
  for (const sourceRelativePath of SELECTED_AUTHORITY_REPORTS) {
    const source = path.join(ROOT, ...sourceRelativePath.split("/"));
    const bytes = await readFile(source);
    const destinationRelativePath = `reports/authorities/${path.basename(sourceRelativePath)}`;
    await atomicWrite(path.join(options.output, ...destinationRelativePath.split("/")), bytes);
    copies.push({
      sourceRepositoryPath: sourceRelativePath,
      packagePath: destinationRelativePath,
      bytes: bytes.length,
      sha256: sha256(bytes),
      copiedWithoutSourceMutation: true,
    });
  }
  return copies;
}

async function writeNetworkTransferReport(options, evidence, productionAssetProbes) {
  const observations = [];
  const add = (scenario, network) => observations.push({ scenario, ...network });
  for (const recording of evidence.recordings) add(`recording/${recording.id}`, recording.network);
  add(`sheet/${evidence.desktopProductionEvidence.id}`, evidence.desktopProductionEvidence.network);
  for (const item of evidence.responsiveEvidence) add(`sheet/${item.id}`, item.network);
  add(`sheet/${evidence.portalEvidence.id}`, evidence.portalEvidence.network);
  add(`sheet/${evidence.shortHeightEvidence.id}`, evidence.shortHeightEvidence.network);
  for (const item of evidence.reducedMotionEvidence.captures) add(`reduced-motion/${item.viewport.id}`, item.network);
  for (const item of evidence.noJavaScriptEvidence.captures) add(`no-javascript/${item.viewport.id}`, item.network);
  for (const item of evidence.zoomEvidence.captures) add(`zoom-200/${item.viewport.id}`, item.network);
  add(`supporting-route${evidence.supportingRouteEvidence.route}`, evidence.supportingRouteEvidence.network);
  const responses = observations.flatMap(({ scenario, responses: values }) => values.map((value) => ({ scenario, ...value })));
  const transfers = observations.flatMap(({ scenario, transfers: values }) => values.map((value) => ({ scenario, ...value })));
  const report = {
    schema: "quantum-hub.phase-4.network-transfer.v1",
    generatedAt: new Date().toISOString(),
    preview: options.url,
    measurement: {
      responseMetadata: "Playwright Response status and response headers",
      transferSizes: "Playwright Request.sizes() after requestfinished",
      note: "This is a dedicated transfer report; QA request URL arrays are not represented as byte-transfer evidence.",
    },
    observations,
    directProductionAssetProbes: productionAssetProbes,
    responseRecords: responses,
    transferRecords: transfers,
    summary: {
      scenarios: observations.length,
      cinematicResponses: responses.length,
      measuredTransfers: transfers.filter((value) => Number.isFinite(value.responseBodySize)).length,
      responseBodyBytesAcrossScenarioLoads: transfers.reduce((sum, value) => sum + (Number.isFinite(value.responseBodySize) ? value.responseBodySize : 0), 0),
      responseHeaderBytesAcrossScenarioLoads: transfers.reduce((sum, value) => sum + (Number.isFinite(value.responseHeadersSize) ? value.responseHeadersSize : 0), 0),
      supportingRoute: evidence.supportingRouteEvidence.route,
      supportingRouteCinematicAssets: evidence.supportingRouteEvidence.network.cinematicAssets.length,
      directAssetProbeFailures: productionAssetProbes.summary.failedChecks,
    },
  };
  const relativePath = "reports/phase-4-network-transfer-report.json";
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  await atomicWrite(path.join(options.output, ...relativePath.split("/")), bytes);
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes), summary: report.summary };
}

async function sourceRecord(relativePath) {
  const absolute = path.join(ROOT, ...relativePath.split("/"));
  const bytes = await readFile(absolute);
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

async function repositoryProvenance() {
  const git = async (args) => (await execFileAsync("git", args, { cwd: ROOT, windowsHide: true })).stdout.trim();
  const statusText = await git(["status", "--short"]);
  return {
    head: await git(["rev-parse", "HEAD"]),
    branch: await git(["branch", "--show-current"]),
    workingTreeDirty: Boolean(statusText),
    workingTreeStatus: statusText ? statusText.split(/\r?\n/) : [],
    sources: await Promise.all(SOURCE_AUTHORITY_PATHS.map(sourceRecord)),
  };
}

function readmeText({ generatedAt, options, browserVersion, recordings, alignment, zoomEvidence, browserQa, milestoneManifest, authorityReports, networkTransferReport, productionAssetProbes, supportingRouteEvidence, status }) {
  const recordingRows = recordings.map((item) => `| ${item.title} | \`${item.path}\` | ${item.viewport.width}×${item.viewport.height} | ${item.inputMethod} |`).join("\n");
  const zoomMethods = zoomEvidence.captures.map((item) => `- ${item.viewport.width}×${item.viewport.height}: ${item.method}${item.instrumentationFallback ? " (unzoomed clean-bypass instrumentation; not represented as native zoom)" : ""}.`).join("\n");
  return `# Quantum Hub Qsite1 — Phase 4 full cinematic human review

Package status: **${status}**

Generated: ${generatedAt}

Preview under test: \`${options.url}\`

Browser: ${browserVersion}

## Honesty and scope

These are automated Playwright captures of the preview URL listed above. The realistic traversal recordings use incremental synthetic \`mouse.wheel\` events. They are **not human trackpad recordings**, and each video carries a visible label stating that fact. The fast-jump recording uses three large synthetic wheel legs: top → portal, portal → METHOD, and METHOD → portal.

The package is external to the Git repository. It does not replace, mutate, or claim acceptance for Phase 2B or Phase 3 evidence. Human review is still required for perceived pacing, continuity, raster grade, typography, and comfort.

## Recordings

| Review | File | Browser viewport | Input |
| --- | --- | ---: | --- |
${recordingRows}

The forward desktop recording traverses the complete cinematic handoff, ENTRY, Built with industry, and through METHOD. The reverse recording begins at the METHOD endpoint and incrementally returns to the dormant physical opening. The mobile recording uses the authored mobile family and continues beyond semantic ENTRY.

## Curated sheets

- \`sheets/phase-4-desktop-production-contact-sheet.png\`: all 17 required 1440×900 physical, portal, and Operating Field states through CONVERSION.
- \`sheets/phase-4-portal-takeover-contact-sheet.png\`: late physical field through semantic handoff.
- \`sheets/phase-4-physical-dom-alignment-sheet.png\`: live F269 crossover, accepted F270 source projection, F270 semantic DOM, guide overlay, and signed CSS-pixel delta table.
- \`sheets/phase-4-short-height-1366x650.png\`: short-height timeline review.
- \`sheets/phase-4-mobile-390x844-contact-sheet.png\`, \`phase-4-320x800-contact-sheet.png\`, \`phase-4-768x1024-contact-sheet.png\`, and \`phase-4-844x390-landscape-contact-sheet.png\`: responsive milestones. The landscape sheet is deliberately single-column; all others use no more than two columns and wrapped labels.
- \`sheets/phase-4-reduced-motion.png\`: 1440×900, 390×844, and 320×800 authored static states.
- \`sheets/phase-4-no-javascript.png\`: desktop/mobile native no-JS fallback and skip-link states.
- \`sheets/phase-4-zoom-200.png\`: desktop/mobile 200% safety review.

## Alignment interpretation

Maximum current DOM-to-frozen-authority delta: **${alignment.maximumAbsoluteDelta.toFixed(3)} CSS px** against the ≤ ${alignment.toleranceCssPixels}px rule. The numeric comparison is the F270 runtime DOM versus the frozen Phase 2B 1440×900 boxes in \`PHASE_3_PORTAL_ALIGNMENT_CONTRACT.md\`. A live F269 crossover and clearly labeled projection of the accepted F270 source provide the physical-side references. Once cabinet, bezel, and cable have authored out of frame, a structural physical anchor is not applicable; the sheet says so instead of fabricating a passing distance.

## 200% capture method

${zoomMethods}

When native CDP page-scale reporting is available, the sheet shows the truly scaled browser view and the authored \`typography-fit\` bypass. If native scaling is unavailable, the panel is explicitly labeled as an unzoomed safety-path instrumentation capture, as allowed by the review request.

## Machine reports

- Current full browser QA: ${browserQa.executed ? `\`${browserQa.path}\` — ${browserQa.passed ? "PASS" : "FAIL"}` : "not run by explicit option"}.
- Milestone evidence manifest: ${milestoneManifest.supplied ? `\`${milestoneManifest.path}\` — ${milestoneManifest.status}` : "not supplied"}.
- Dedicated response/byte transfer report: \`${networkTransferReport.path}\`.
- Direct production-asset probes: ${productionAssetProbes.summary.assets} exact assets, ${productionAssetProbes.summary.range206Partial} video Range requests returned 206 partial and ${productionAssetProbes.summary.range200Full} returned 200 full; both are reported honestly.
- Supporting-route network isolation: \`${supportingRouteEvidence.route}\` — ${supportingRouteEvidence.checks.noCinematicVideo && supportingRouteEvidence.checks.noCinematicController ? "PASS" : "FAIL"}.
- ${authorityReports.length} compact Phase 2B / accepted Phase 3-R authority reports copied read-only under \`reports/authorities/\`.
- Package manifest: \`${MANIFEST_FILENAME}\`.

## Human review checklist

1. Watch each WebM at normal speed and confirm forward/reverse continuity, including the late portal crossover.
2. Review the portal and alignment sheets at 100% scale; compare physical grade, scanline residue, magenta/white continuity, and semantic ownership.
3. Confirm responsive sheets have readable labels and no crop, blank bridge, permanent letterbox, duplicated semantic text, or abrupt aspect snap.
4. Confirm short-height, reduced-motion, no-JS, and 200% states expose usable semantic content without horizontal overflow.
5. Record human acceptance separately; this automated package does not self-approve perceptual quality.
`;
}

async function listFiles(root, relative = "") {
  const directory = path.join(root, ...relative.split("/").filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, next));
    else if (entry.isFile()) files.push(next);
  }
  return files;
}

async function packageFileRecords(root, files) {
  return Promise.all(files.map(async (relativePath) => {
    const bytes = await readFile(path.join(root, ...relativePath.split("/")));
    return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
  }));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

async function createStoredZip(root, files, destination, generatedAt) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime(new Date(generatedAt));
  for (const relativePath of files) {
    const name = Buffer.from(relativePath.replaceAll("\\", "/"), "utf8");
    const data = await readFile(path.join(root, ...relativePath.split("/")));
    const crc = crc32(data);
    if (data.length > 0xffffffff || offset > 0xffffffff) throw new Error("Review package exceeds classic ZIP limits");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  await atomicWrite(destination, Buffer.concat([...localParts, ...centralParts, end]));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  options.url = normalizePreviewUrl(options.url);
  options.previewScope = previewScope(new URL(options.url));
  await validateFreshExternalRoot(options.output);
  await waitForServer(options.url, options.timeoutMs);
  const chromiumPath = await resolveChromium(options.chromium);
  const ffmpegPath = await resolveFfmpeg();
  await mkdir(options.output, { recursive: false });
  if (isWithin(ROOT, await realpath(options.output))) throw new Error("Created output unexpectedly resolves inside the repository");
  for (const directory of ["recordings", "captures", "sheets", "reports"]) await mkdir(path.join(options.output, directory));

  const generatedAt = new Date().toISOString();
  const failures = [];
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumPath,
    timeout: options.timeoutMs,
    args: ["--disable-extensions", "--disable-background-networking"],
  });
  const browserVersion = browser.version();
  let recordings;
  let desktopProductionEvidence;
  let responsiveEvidence;
  let portalEvidence;
  let shortHeightEvidence;
  let reducedMotionEvidence;
  let noJavaScriptEvidence;
  let zoomEvidence;
  let supportingRouteEvidence;
  let alignment;
  try {
    const recordingScenarios = [
      {
        id: "desktop-forward-through-method",
        title: "DESKTOP FORWARD · THROUGH METHOD",
        filename: "phase-4-desktop-1440x900-forward-through-method.webm",
        viewport: { id: "desktop-1440x900", width: 1440, height: 900 },
        action: "forward-method",
        inputLabel: "incremental synthetic mouse.wheel forward",
      },
      {
        id: "desktop-reverse-to-dormancy",
        title: "DESKTOP REVERSE · METHOD TO DORMANCY",
        filename: "phase-4-desktop-1440x900-reverse-to-dormancy.webm",
        viewport: { id: "desktop-1440x900", width: 1440, height: 900 },
        action: "reverse",
        inputLabel: "incremental synthetic mouse.wheel reverse",
      },
      {
        id: "desktop-fast-jump",
        title: "DESKTOP COMPACT FAST JUMP",
        filename: "phase-4-desktop-1440x900-fast-jump.webm",
        viewport: { id: "desktop-1440x900", width: 1440, height: 900 },
        action: "fast-jump",
        inputLabel: "single large synthetic mouse.wheel delta each direction",
      },
      {
        id: "mobile-forward",
        title: "MOBILE FORWARD · CINEMATIC TO ENTRY",
        filename: "phase-4-mobile-390x844-forward.webm",
        viewport: { id: "mobile-390x844", width: 390, height: 844 },
        action: "mobile-forward",
        inputLabel: "incremental synthetic mouse.wheel forward",
      },
    ];
    recordings = [];
    for (const scenario of recordingScenarios) recordings.push(await recordScenario(browser, options, ffmpegPath, scenario, failures));

    desktopProductionEvidence = await captureMilestoneSet(
      browser,
      options,
      { id: "desktop-1440x900", width: 1440, height: 900, family: "desktop", objectPosition: "48% 50%" },
      DESKTOP_PRODUCTION_FRAMES,
      "phase-4-desktop-production-contact-sheet",
      "PHASE 4 · DESKTOP PRODUCTION · 1440×900",
      failures,
      {
        columns: 2,
        frameLabels: {
          1: "01 · DORMANT · F001",
          36: "02 · EARLY CONDUCTION · F036",
          72: "03 · MID CONDUCTION · F072",
          116: "04 · CURRENT ARRIVAL · F116",
          126: "05 · PHOSPHOR LINE · F126",
          144: "06 · RASTER EXPANSION · F144",
          196: "07 · QUANTUM SIGNAL · F196",
          218: "08 · EARLY CAMERA APPROACH · F218",
          235: "09 · MID CAMERA APPROACH · F235",
          250: "10 · RASTER FILLS VIEWPORT · F250",
          262: "11 · PORTAL PRE-TAKEOVER · F262",
          268: "12 · MIXED PHYSICAL / SEMANTIC · F268",
          270: "13 · SETTLED ENTRY · F270",
        },
        continuations: [
          { id: "built-with-industry", selector: "#built-with-industry", expectedScene: "built-with-industry", title: "14 · BUILT WITH INDUSTRY" },
          { id: "method-test", selector: "#method-test", expectedScene: "method", title: "15 · METHOD · TEST" },
          { id: "proof", selector: "#proof", expectedScene: "proof", title: "16 · PROOF" },
          { id: "conversion", selector: "#conversion", expectedScene: "conversion", title: "17 · CONVERSION" },
        ],
      },
    );

    responsiveEvidence = [];
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      responsiveEvidence.push(await captureMilestoneSet(
        browser,
        options,
        viewport,
        RESPONSIVE_FRAMES,
        viewport.sheetId,
        viewport.reviewTitle,
        failures,
        { columns: viewport.sheetColumns },
      ));
    }
    portalEvidence = await captureMilestoneSet(
      browser,
      options,
      { id: "desktop-1440x900", width: 1440, height: 900, family: "desktop", objectPosition: "48% 50%" },
      PORTAL_FRAMES,
      "phase-4-portal-takeover-contact-sheet",
      "PHASE 4 · CURATED PORTAL TAKEOVER",
      failures,
    );
    shortHeightEvidence = await captureMilestoneSet(
      browser,
      options,
      { id: "short-height-1366x650", width: 1366, height: 650, family: "desktop", objectPosition: "48% 50%" },
      SHORT_HEIGHT_FRAMES,
      "phase-4-short-height-1366x650",
      "PHASE 4 · SHORT HEIGHT · 1366×650",
      failures,
      { continuations: [{ id: "method", selector: "#method", expectedScene: "method", title: "METHOD · SHORT-HEIGHT CONTINUATION" }] },
    );
    alignment = await createAlignmentEvidence(options, portalEvidence, failures);
    reducedMotionEvidence = await captureStaticVariants(browser, options, "reduced-motion", [
      { id: "desktop-1440x900", width: 1440, height: 900 },
      { id: "mobile-390x844", width: 390, height: 844 },
      { id: "narrow-320x800", width: 320, height: 800 },
    ], failures);
    noJavaScriptEvidence = await captureStaticVariants(browser, options, "no-javascript", [
      { id: "desktop-1440x900", width: 1440, height: 900 },
      { id: "mobile-390x844", width: 390, height: 844 },
    ], failures);
    zoomEvidence = await captureZoomVariants(browser, options, [
      { id: "desktop-1440x900", width: 1440, height: 900 },
      { id: "mobile-390x844", width: 390, height: 844 },
    ], failures);
    supportingRouteEvidence = await observeSupportingRoute(browser, options, failures);
  } finally {
    await browser.close();
  }

  const browserQa = await runBrowserQa(options, chromiumPath, failures);
  const milestoneManifest = await copyMilestoneManifest(options, failures);
  const authorityReports = await copySelectedAuthorityReports(options);
  const productionAssetProbes = await probeProductionAssets(options, failures);
  const networkTransferReport = await writeNetworkTransferReport(options, {
    recordings,
    desktopProductionEvidence,
    responsiveEvidence,
    portalEvidence,
    shortHeightEvidence,
    reducedMotionEvidence,
    noJavaScriptEvidence,
    zoomEvidence,
    supportingRouteEvidence,
  }, productionAssetProbes);
  const repository = await repositoryProvenance();
  const status = failures.length === 0 ? "PASS" : "FAIL";
  const staticEvidence = { reducedMotion: reducedMotionEvidence, noJavaScript: noJavaScriptEvidence };
  await atomicWrite(path.join(options.output, README_FILENAME), readmeText({
    generatedAt,
    options,
    browserVersion,
    recordings,
    alignment,
    zoomEvidence,
    browserQa,
    milestoneManifest,
    authorityReports,
    networkTransferReport,
    productionAssetProbes,
    supportingRouteEvidence,
    status,
  }));

  const preManifestFiles = (await listFiles(options.output)).filter((value) => ![ARCHIVE_FILENAME, MANIFEST_FILENAME, RESULT_FILENAME].includes(value));
  const fileRecords = await packageFileRecords(options.output, preManifestFiles);
  const manifest = {
    schema: "quantum-hub.phase-4.full-cinematic-human-review.v1",
    status,
    generatedAt,
    evidenceClassification: "AUTOMATED_REVIEW_PACKAGE_FROM_RECORDED_PREVIEW_URL_NOT_HUMAN_ACCEPTANCE",
    honesty: {
      browserRecordingsAreActualPlaywrightVideos: true,
      interactionSource: "synthetic Playwright mouse.wheel",
      humanTrackpadInputClaimed: false,
      perceptualHumanAcceptanceClaimed: false,
      acceptedPhase2bOrPhase3EvidenceMutated: false,
      outputExternalToRepository: true,
    },
    preview: {
      url: options.url,
      scope: options.previewScope,
      allowedHostPolicy: "loopback or HTTPS qsite1.pages.dev / *.qsite1.pages.dev only",
    },
    output: { basename: path.basename(options.output), archive: ARCHIVE_FILENAME, manifest: MANIFEST_FILENAME },
    browser: { name: "Chromium", version: browserVersion, executable: chromiumPath, ffmpegProbe: ffmpegPath },
    repository,
    recordings,
    desktopProductionEvidence,
    responsiveEvidence,
    portalEvidence,
    alignment,
    shortHeightEvidence,
    staticEvidence,
    zoomEvidence,
    browserQa,
    milestoneManifest,
    authorityReports,
    networkTransferReport,
    productionAssetProbes,
    supportingRouteEvidence,
    files: fileRecords,
    summary: {
      recordings: recordings.length,
      responsiveMilestoneSheets: responsiveEvidence.length,
      curatedSheets: 1 + 1 + 1 + 1 + responsiveEvidence.length + 1 + 1 + 1,
      alignmentMaximumDeltaCssPixels: alignment.maximumAbsoluteDelta,
      browserQaPassed: browserQa.passed,
      failures: failures.length,
    },
    failures,
  };
  await atomicJson(path.join(options.output, MANIFEST_FILENAME), manifest);
  const archiveFiles = (await listFiles(options.output)).filter((value) => ![ARCHIVE_FILENAME, RESULT_FILENAME].includes(value));
  const archivePath = path.join(options.output, ARCHIVE_FILENAME);
  await createStoredZip(options.output, archiveFiles, archivePath, generatedAt);
  const archiveBytes = await readFile(archivePath);
  const manifestBytes = await readFile(path.join(options.output, MANIFEST_FILENAME));
  const result = {
    schema: "quantum-hub.phase-4.full-cinematic-human-review.result.v1",
    status,
    generatedAt,
    outputRoot: options.output,
    archive: { path: archivePath, bytes: archiveBytes.length, sha256: sha256(archiveBytes), entries: archiveFiles.length },
    manifest: { path: path.join(options.output, MANIFEST_FILENAME), bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
    readme: path.join(options.output, README_FILENAME),
    failures,
  };
  await atomicJson(path.join(options.output, RESULT_FILENAME), result);
  process.stdout.write(`Phase 4 human-review package ${status}: ${archivePath}\n`);
  process.stdout.write(`Archive SHA-256 ${result.archive.sha256}\n`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Phase 4 human-review packaging failed: ${error.stack ?? error}\n`);
  process.exitCode = 1;
});
