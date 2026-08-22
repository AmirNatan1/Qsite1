import { constants as fsConstants } from "node:fs";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import axeCore from "axe-core";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE_URL = "http://127.0.0.1:4322";
const DEFAULT_REPORT = path.join(
  ROOT,
  "artifacts",
  "evidence",
  "phase-4",
  "phase-4-browser-report.json",
);
const PHASE2B_EVIDENCE = path.join(ROOT, "artifacts", "evidence", "phase-2b");
const CONTROLLER_TIMEOUT_MS = 16_000;
const OVERFLOW_TOLERANCE_PX = 2;

const VIEWPORTS = Object.freeze([
  { id: "desktop-1440x900", width: 1440, height: 900, family: "desktop" },
  { id: "short-desktop-1366x650", width: 1366, height: 650, family: "desktop" },
  { id: "desktop-1280x800", width: 1280, height: 800, family: "desktop" },
  { id: "tablet-landscape-1024x768", width: 1024, height: 768, family: "desktop" },
  { id: "tablet-portrait-768x1024", width: 768, height: 1024, family: "mobile" },
  { id: "mobile-390x844", width: 390, height: 844, family: "mobile" },
  { id: "mobile-360x800", width: 360, height: 800, family: "mobile" },
  { id: "narrow-320x800", width: 320, height: 800, family: "mobile" },
  { id: "mobile-landscape-844x390", width: 844, height: 390, family: "mobile" },
]);

const SCROLL_VIEWPORTS = Object.freeze([
  { id: "desktop-1440x900", width: 1440, height: 900 },
  { id: "mobile-390x844", width: 390, height: 844 },
]);

const STATIC_VIEWPORTS = Object.freeze([
  { id: "desktop-1440x900", width: 1440, height: 900 },
  { id: "mobile-390x844", width: 390, height: 844 },
]);

const CHAPTERS = Object.freeze([
  "entry",
  "built-with-industry",
  "method",
  "industries",
  "proof",
  "programmes",
  "conversion",
]);

const SUPPORTING_ROUTES = Object.freeze([
  "/for-partners/",
  "/for-startups/",
  "/industries/",
  "/pocs/",
  "/pocs/maradin/",
  "/spark/",
  "/about/",
  "/contact/",
  "/404/",
]);

function argumentValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(flag + " requires a value");
  return value;
}

function pathIsWithin(parent, candidate) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  const relative = path.relative(normalize(parent), normalize(candidate));
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

function assertPhase4ReportPath(reportPath) {
  const resolved = path.resolve(reportPath);
  const segments = resolved.toLowerCase().split(/[\\/]+/);
  if (
    pathIsWithin(PHASE2B_EVIDENCE, resolved)
    || segments.includes("phase-2b")
    || segments.includes("phase2b")
  ) {
    throw new Error(
      "Phase 4 QA refuses to write into any Phase 2B path. Choose a distinct --report path.",
    );
  }
  return resolved;
}

function parseArguments(argv) {
  const options = {
    baseUrl: process.env.PHASE4_BASE_URL ?? DEFAULT_BASE_URL,
    browser: process.env.CHROME_PATH ?? null,
    report: process.env.PHASE4_REPORT
      ? path.resolve(process.env.PHASE4_REPORT)
      : DEFAULT_REPORT,
    serverMode: "astro-preview",
    smoke: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--base-url") {
      options.baseUrl = argumentValue(argv, index, value);
      index += 1;
    } else if (value === "--browser") {
      options.browser = argumentValue(argv, index, value);
      index += 1;
    } else if (value === "--report") {
      options.report = path.resolve(argumentValue(argv, index, value));
      index += 1;
    } else if (value === "--server-mode") {
      options.serverMode = argumentValue(argv, index, value);
      index += 1;
    } else if (value === "--smoke") {
      options.smoke = true;
    } else if (value === "--help" || value === "-h") {
      console.log(
        "Usage: node scripts/qa-phase4-browser.mjs [--smoke] [--base-url URL] [--browser PATH] [--report PATH] [--server-mode astro-preview|external]",
      );
      process.exit(0);
    } else {
      throw new Error("Unknown argument: " + value);
    }
  }

  if (!options.baseUrl) throw new Error("--base-url requires a value");
  if (!["astro-preview", "external"].includes(options.serverMode)) {
    throw new Error("--server-mode must be astro-preview or external");
  }
  options.report = assertPhase4ReportPath(options.report);
  return options;
}

async function executable(candidate) {
  if (!candidate) return false;
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveChrome(override) {
  const candidates = [];
  if (override) candidates.push(path.resolve(override));
  if (process.platform === "win32") {
    candidates.push(
      path.join(
        process.env.ProgramFiles ?? "C:\\Program Files",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
      path.join(
        process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
    );
    if (process.env.LOCALAPPDATA) {
      candidates.push(
        path.join(
          process.env.LOCALAPPDATA,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        ),
      );
    }
  } else {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
    );
  }

  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) {
    if (await executable(candidate)) return path.resolve(candidate);
  }
  throw new Error("Chrome/Chromium was not found. Set CHROME_PATH or pass --browser.");
}

function startPreview(baseUrl) {
  const url = new URL(baseUrl);
  const serverScript = path.join(ROOT, "scripts", "serve-phase4-dist.mjs");
  const child = spawn(
    process.execPath,
    [
      serverScript,
      "--host",
      url.hostname,
      "--port",
      url.port || "4321",
    ],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.qaOutput = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding("utf8");
    stream?.on("data", (chunk) => {
      child.qaOutput = (child.qaOutput + chunk).slice(-4000);
    });
  }
  return child;
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 30_000;
  let lastError = "no response";
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      const output = child.qaOutput?.trim();
      throw new Error(
        "Astro preview exited before it became ready ("
          + child.exitCode
          + ")."
          + (output ? " " + output : ""),
      );
    }
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
      lastError = "HTTP " + response.status;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for " + baseUrl + ": " + lastError);
}

async function settle(page) {
  await page.evaluate(
    () => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
    }),
  );
}

async function waitForScrollStable(page, timeoutMs = 1600) {
  await page.evaluate(
    (timeout) => new Promise((resolve) => {
      const started = performance.now();
      let previous = scrollY;
      let stableFrames = 0;
      const sample = () => {
        const current = scrollY;
        stableFrames = Math.abs(current - previous) < 0.5 ? stableFrames + 1 : 0;
        previous = current;
        if (stableFrames >= 4 || performance.now() - started >= timeout) {
          resolve(null);
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }),
    timeoutMs,
  );
}

function normalizedRequestPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function isCinematicMediaRequest(request) {
  const pathname = normalizedRequestPath(request.url).toLowerCase();
  return (
    pathname.includes("/media/cinematic/")
    && (request.resourceType === "media" || /\.(?:mp4|webm)$/.test(pathname))
  );
}

function isCinematicControllerRequest(request) {
  if (request.resourceType !== "script") return false;
  const pathname = normalizedRequestPath(request.url).toLowerCase();
  return pathname.includes("home-cinematic-integration") || pathname.includes("home-cinematic.");
}

function observePage(page, baseUrl) {
  const records = {
    runtimeErrors: [],
    requests: [],
    failedRequests: [],
  };
  const expectedOrigin = new URL(baseUrl).origin;

  page.on("pageerror", (error) => records.runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") records.runtimeErrors.push(message.text());
  });
  page.on("request", (request) => {
    records.requests.push({
      url: request.url(),
      resourceType: request.resourceType(),
    });
  });
  page.on("requestfailed", (request) => {
    records.failedRequests.push({
      url: request.url(),
      resourceType: request.resourceType(),
      error: request.failure()?.errorText ?? "unknown",
    });
  });

  return {
    snapshot() {
      const cinematicMedia = records.requests.filter(isCinematicMediaRequest);
      const cinematicController = records.requests.filter(isCinematicControllerRequest);
      const uniqueMediaPaths = [...new Set(cinematicMedia.map(({ url }) => normalizedRequestPath(url)))];
      const externalRequests = [
        ...new Set(
          records.requests
            .filter(({ url }) => {
              try {
                return new URL(url).origin !== expectedOrigin;
              } catch {
                return false;
              }
            })
            .map(({ url }) => url),
        ),
      ];
      return {
        runtimeErrors: [...new Set(records.runtimeErrors)],
        cinematicMediaRequests: cinematicMedia,
        uniqueMediaPaths,
        cinematicControllerRequests: cinematicController,
        failedCinematicRequests: records.failedRequests.filter((request) =>
          isCinematicMediaRequest(request) || isCinematicControllerRequest(request)),
        externalRequests,
      };
    },
  };
}

async function waitForCinematicCompletion(page) {
  try {
    await page.waitForFunction(
      () => {
        const mode = document.documentElement.dataset.cinematicMode;
        const state = document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state");
        return (
          mode !== "candidate"
          && (
            mode !== "enhanced"
            || state === "ready"
            || state === "failed"
          )
        );
      },
      undefined,
      { timeout: CONTROLLER_TIMEOUT_MS },
    );
    await settle(page);
    return true;
  } catch {
    await settle(page).catch(() => {});
    return false;
  }
}

async function readHomeState(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const shell = document.querySelector("[data-cinematic-shell]");
    const stage = document.querySelector("[data-cinematic-stage]");
    const entry = document.querySelector("#entry");
    const entryContent = entry?.querySelector(".entry-field__content");
    const video = document.querySelector("[data-cinematic-media]");
    const header = document.querySelector(".site-header");
    const skip = document.querySelector(".skip-link");
    const absoluteTop = (element) =>
      element ? element.getBoundingClientRect().top + scrollY : null;
    const number = (value) => {
      const parsed = Number.parseFloat(value ?? "");
      return Number.isFinite(parsed) ? parsed : null;
    };
    const style = (element) => (element ? getComputedStyle(element) : null);
    const shellStyle = style(shell);
    const stageStyle = style(stage);
    const entryStyle = style(entry);
    const entryContentStyle = style(entryContent);
    const main = document.querySelector("main");
    const nestedVerticalScrollers = main
      ? [...main.querySelectorAll("*")]
          .filter((element) => {
            const computed = getComputedStyle(element);
            return (
              ["auto", "scroll"].includes(computed.overflowY)
              && element.scrollHeight > element.clientHeight + 2
            );
          })
          .slice(0, 20)
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            className: String(element.className),
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          }))
      : [];
    const active = document.activeElement;

    return {
      path: location.pathname,
      hash: location.hash,
      scrollY,
      viewport: { width: innerWidth, height: innerHeight },
      maxScroll: Math.max(0, root.scrollHeight - innerHeight),
      horizontalOverflow:
        Math.max(root.scrollWidth, body?.scrollWidth ?? 0) - innerWidth,
      nestedVerticalScrollers,
      h1Count: document.querySelectorAll("h1").length,
      h1: document.querySelector("h1")?.textContent?.trim().replace(/\s+/g, " ") ?? null,
      chapterOrder: [...document.querySelectorAll("[data-home-scene]")]
        .map((element) => element.getAttribute("data-home-scene")),
      rootMode: root.getAttribute("data-cinematic-mode"),
      rootFallback: root.getAttribute("data-cinematic-fallback"),
      rootHeader: root.getAttribute("data-cinematic-header"),
      rootFocus: root.getAttribute("data-cinematic-focus"),
      rootDeepLink: root.hasAttribute("data-cinematic-deep-link"),
      shellCount: document.querySelectorAll("[data-cinematic-shell]").length,
      stageCount: document.querySelectorAll("[data-cinematic-stage]").length,
      posterCount: document.querySelectorAll("[data-cinematic-poster]").length,
      cinematicVideoCount: document.querySelectorAll("[data-cinematic-media]").length,
      totalVideoCount: document.querySelectorAll("video").length,
      shellTop: absoluteTop(shell),
      entryTop: absoluteTop(entry),
      entryHeight: entry?.getBoundingClientRect().height ?? null,
      headerHeight: header?.getBoundingClientRect().height ?? 0,
      phase: shell?.getAttribute("data-cinematic-phase") ?? null,
      interactive: shell?.getAttribute("data-cinematic-interactive") ?? null,
      mediaFamily: shell?.getAttribute("data-media-family") ?? null,
      mediaCodec: shell?.getAttribute("data-media-codec") ?? null,
      mediaSource: shell?.getAttribute("data-media-source") ?? null,
      mediaDelivery: shell?.getAttribute("data-media-delivery") ?? null,
      mediaState: shell?.getAttribute("data-media-state") ?? null,
      scrollProgress: number(shell?.getAttribute("data-scroll-progress")),
      cinematicProgress: number(shell?.getAttribute("data-cinematic-progress")),
      targetFrame: number(shell?.getAttribute("data-target-frame")),
      targetTime: number(shell?.getAttribute("data-target-time")),
      takeoverProgress: number(shell?.getAttribute("data-takeover-progress")),
      cssScrollProgress: number(shellStyle?.getPropertyValue("--cinematic-progress")),
      cssFilmProgress: number(shellStyle?.getPropertyValue("--cinematic-film-progress")),
      cssTakeover: number(shellStyle?.getPropertyValue("--cinematic-takeover")),
      cssSemantic: number(shellStyle?.getPropertyValue("--cinematic-semantic")),
      stage: stage
        ? {
            position: stageStyle?.position ?? null,
            visibility: stageStyle?.visibility ?? null,
            display: stageStyle?.display ?? null,
            opacity: number(stageStyle?.opacity),
            top: stage.getBoundingClientRect().top,
            height: stage.getBoundingClientRect().height,
          }
        : null,
      entry: entry
        ? {
            visibility: entryStyle?.visibility ?? null,
            display: entryStyle?.display ?? null,
            opacity: number(entryStyle?.opacity),
            pointerEvents: entryStyle?.pointerEvents ?? null,
            contentOpacity: number(entryContentStyle?.opacity),
          }
        : null,
      video: video
        ? {
            srcAttribute: video.getAttribute("src"),
            currentSrc: video.currentSrc,
            readyState: video.readyState,
            networkState: video.networkState,
            duration: Number.isFinite(video.duration) ? video.duration : null,
            currentTime: video.currentTime,
            seeking: video.seeking,
            paused: video.paused,
            muted: video.muted,
            defaultMuted: video.defaultMuted,
            autoplay: video.autoplay,
            controls: video.controls,
            loop: video.loop,
            playsInline: video.playsInline,
            ariaHidden: video.getAttribute("aria-hidden"),
          }
        : null,
      skip: skip
        ? {
            text: skip.textContent?.trim() ?? "",
            href: skip.getAttribute("href"),
            visible:
              skip.getBoundingClientRect().width > 0
              && skip.getBoundingClientRect().height > 0
              && style(skip)?.visibility !== "hidden",
          }
        : null,
      active: active
        ? {
            tag: active.tagName.toLowerCase(),
            id: active.id,
            className: String(active.className),
            text: active.textContent?.trim().replace(/\s+/g, " ") ?? "",
            href: active.getAttribute?.("href") ?? null,
          }
        : null,
      diagnostic: window.quantumPhase4
        ? { ...window.quantumPhase4 }
        : null,
    };
  });
}

function expect(failures, condition, scenario, type, measured, expected) {
  if (condition) return;
  const failure = { scenario, type, measured };
  if (expected !== undefined) failure.expected = expected;
  failures.push(failure);
}

function expectHomeSemantics(failures, scenario, state) {
  expect(
    failures,
    state.h1Count === 1 && state.h1?.toUpperCase() === "WHERE DO YOU ENTER?",
    scenario,
    "home-h1",
    { count: state.h1Count, text: state.h1 },
    { count: 1, text: "WHERE DO YOU ENTER?" },
  );
  expect(
    failures,
    state.chapterOrder.join("|") === CHAPTERS.join("|"),
    scenario,
    "chapter-order",
    state.chapterOrder,
    CHAPTERS,
  );
  expect(
    failures,
    state.horizontalOverflow <= OVERFLOW_TOLERANCE_PX,
    scenario,
    "horizontal-overflow",
    state.horizontalOverflow,
    "<= " + OVERFLOW_TOLERANCE_PX + "px",
  );
  expect(
    failures,
    state.nestedVerticalScrollers.length === 0,
    scenario,
    "nested-scroll-authority",
    state.nestedVerticalScrollers,
    "document scrolling only",
  );
}

function expectCleanRuntime(failures, scenario, network) {
  expect(
    failures,
    network.runtimeErrors.length === 0,
    scenario,
    "runtime-error",
    network.runtimeErrors,
    [],
  );
  expect(
    failures,
    network.failedCinematicRequests.length === 0,
    scenario,
    "cinematic-request-failure",
    network.failedCinematicRequests,
    [],
  );
  expect(
    failures,
    network.externalRequests.length === 0,
    scenario,
    "external-runtime-request",
    network.externalRequests,
    [],
  );
}

async function runReferenceViewport(browser, baseUrl, viewport, failures) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const controllerCompleted = await waitForCinematicCompletion(page);
  const state = await readHomeState(page);
  const network = observer.snapshot();
  const scenario = "reference-viewport/" + viewport.id;

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expectHomeSemantics(failures, scenario, state);
  expect(
    failures,
    controllerCompleted,
    scenario,
    "controller-timeout",
    { mode: state.rootMode, mediaState: state.mediaState },
    "enhanced and media ready within " + CONTROLLER_TIMEOUT_MS + "ms",
  );
  expect(failures, state.rootMode === "enhanced", scenario, "cinematic-mode", state.rootMode, "enhanced");
  expect(
    failures,
    state.shellCount === 1 && state.stageCount === 1 && state.posterCount === 1,
    scenario,
    "cinematic-dom",
    {
      shell: state.shellCount,
      stage: state.stageCount,
      poster: state.posterCount,
    },
    { shell: 1, stage: 1, poster: 1 },
  );
  expect(
    failures,
    state.cinematicVideoCount === 1 && state.totalVideoCount === 1,
    scenario,
    "single-video-node",
    {
      cinematic: state.cinematicVideoCount,
      total: state.totalVideoCount,
    },
    { cinematic: 1, total: 1 },
  );
  expect(
    failures,
    state.mediaFamily === viewport.family,
    scenario,
    "media-family",
    state.mediaFamily,
    viewport.family,
  );
  expect(
    failures,
    state.mediaSource?.includes("-" + viewport.family + "-"),
    scenario,
    "media-source-family",
    state.mediaSource,
    "one " + viewport.family + " cinematic source",
  );
  expect(
    failures,
    network.uniqueMediaPaths.length === 1
      && network.uniqueMediaPaths[0]?.includes("-" + viewport.family + "-"),
    scenario,
    "single-media-request-family",
    network.uniqueMediaPaths,
    ["one " + viewport.family + " media asset"],
  );
  expect(
    failures,
    state.mediaState === "ready",
    scenario,
    "media-ready",
    state.mediaState,
    "ready",
  );
  expect(
    failures,
    state.mediaDelivery === "blob" && state.video?.currentSrc?.startsWith("blob:"),
    scenario,
    "seekable-media-delivery",
    { delivery: state.mediaDelivery, currentSrc: state.video?.currentSrc },
    { delivery: "blob", currentSrc: "one browser-local Blob URL" },
  );
  expect(
    failures,
    Boolean(state.video?.currentSrc)
      && state.video?.readyState >= 1
      && state.video?.paused
      && state.video?.muted
      && !state.video?.autoplay
      && !state.video?.controls
      && !state.video?.loop
      && state.video?.playsInline
      && state.video?.ariaHidden === "true",
    scenario,
    "video-contract",
    state.video,
    "loaded, paused, muted, inline, aria-hidden, no autoplay/controls/loop",
  );
  expect(
    failures,
    typeof state.video?.duration === "number"
      && Math.abs(state.video.duration - 9) <= 0.25,
    scenario,
    "media-duration",
    state.video?.duration,
    "9.0s +/- 0.25s",
  );
  expectCleanRuntime(failures, scenario, network);

  await context.close();
  return {
    viewport: viewport.id,
    expectedFamily: viewport.family,
    controllerCompleted,
    status: response?.status() ?? null,
    state,
    network,
  };
}

async function scrollTo(page, target) {
  await page.evaluate(
    (y) => window.scrollTo({ top: y, left: 0, behavior: "instant" }),
    target,
  );
  await settle(page);
  return readHomeState(page);
}

async function waitForMediaTarget(page, tolerance = 0.12) {
  try {
    await page.waitForFunction(
      (allowedDifference) => {
        const shell = document.querySelector("[data-cinematic-shell]");
        const video = document.querySelector("[data-cinematic-media]");
        const target = Number.parseFloat(shell?.getAttribute("data-target-time") ?? "");
        return (
          video
          && video.readyState >= 1
          && !video.seeking
          && Number.isFinite(target)
          && Math.abs(video.currentTime - target) <= allowedDifference
        );
      },
      tolerance,
      { timeout: 4000 },
    );
  } catch {
    // The measured mismatch below is the reportable result.
  }
  const measured = await page.evaluate(() => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const video = document.querySelector("[data-cinematic-media]");
    const target = Number.parseFloat(shell?.getAttribute("data-target-time") ?? "");
    const actual = video?.currentTime ?? null;
    const difference =
      actual !== null && Number.isFinite(target)
        ? Math.abs(actual - target)
        : null;
    return {
      target: Number.isFinite(target) ? target : null,
      actual,
      difference,
      seeking: video?.seeking ?? null,
      readyState: video?.readyState ?? null,
      mediaState: shell?.getAttribute("data-media-state") ?? null,
    };
  });
  return {
    ...measured,
    synchronized:
      measured.difference !== null
      && measured.difference <= tolerance
      && measured.seeking === false,
  };
}

async function runScrollTraversal(browser, baseUrl, viewport, failures) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const controllerCompleted = await waitForCinematicCompletion(page);
  const initial = await readHomeState(page);
  const scenario = "cinematic-scroll/" + viewport.id;

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expect(
    failures,
    controllerCompleted && initial.rootMode === "enhanced",
    scenario,
    "enhanced-prerequisite",
    { controllerCompleted, mode: initial.rootMode, mediaState: initial.mediaState },
    "enhanced media-ready",
  );

  if (!controllerCompleted || initial.rootMode !== "enhanced") {
    const network = observer.snapshot();
    expectCleanRuntime(failures, scenario, network);
    await context.close();
    return { viewport: viewport.id, initial, unavailable: true, network };
  }

  const travel = Math.max(
    1,
    (initial.entryTop ?? 1) - initial.headerHeight - (initial.shellTop ?? 0),
  );
  const startY = Math.max(0, Math.round(initial.shellTop ?? 0));
  const endY = Math.min(initial.maxScroll, Math.round(startY + travel));

  await scrollTo(page, startY);
  await page.keyboard.press("PageDown");
  await waitForScrollStable(page);
  await settle(page);
  const nativePageDown = await readHomeState(page);
  expect(
    failures,
    nativePageDown.scrollY > startY + Math.min(100, viewport.height * 0.2),
    scenario,
    "native-keyboard-scroll",
    { from: startY, to: nativePageDown.scrollY },
    "PageDown advances the document without a scroll unlock",
  );
  expect(
    failures,
    nativePageDown.nestedVerticalScrollers.length === 0,
    scenario,
    "native-scroll-authority",
    nativePageDown.nestedVerticalScrollers,
    "document scrolling only",
  );

  const milestones = [
    { id: "physical-open", progress: 0 },
    { id: "conduction", progress: 0.16 },
    { id: "activation", progress: 0.42 },
    { id: "field", progress: 0.72 },
    { id: "portal-entry", progress: 0.985 },
    { id: "settled", progress: 1 },
  ];
  const forward = [];
  for (const milestone of milestones) {
    const target = Math.round(startY + travel * milestone.progress);
    const state = await scrollTo(page, Math.min(endY, target));
    const media = await waitForMediaTarget(page);
    forward.push({ ...milestone, target: Math.min(endY, target), state, media });
  }

  for (let index = 0; index < forward.length; index += 1) {
    const item = forward[index];
    expect(
      failures,
      Math.abs(item.state.scrollY - item.target) <= 3,
      scenario,
      "milestone-document-position",
      { milestone: item.id, target: item.target, actual: item.state.scrollY },
      "+/- 3px",
    );
    expect(
      failures,
      item.state.horizontalOverflow <= OVERFLOW_TOLERANCE_PX,
      scenario,
      "milestone-horizontal-overflow",
      { milestone: item.id, overflow: item.state.horizontalOverflow },
      "<= " + OVERFLOW_TOLERANCE_PX + "px",
    );
    expect(
      failures,
      item.state.nestedVerticalScrollers.length === 0,
      scenario,
      "milestone-nested-scroll",
      { milestone: item.id, scrollers: item.state.nestedVerticalScrollers },
      [],
    );
    expect(
      failures,
      item.media.synchronized,
      scenario,
      "media-seek",
      { milestone: item.id, ...item.media },
      "currentTime within 0.12s of the scroll-derived target",
    );
    if (index > 0) {
      const previous = forward[index - 1].state;
      expect(
        failures,
        item.state.scrollProgress + 0.002 >= previous.scrollProgress
          && item.state.cinematicProgress + 0.002 >= previous.cinematicProgress
          && item.state.targetFrame >= previous.targetFrame,
        scenario,
        "forward-monotonicity",
        {
          previous: {
            progress: previous.scrollProgress,
            film: previous.cinematicProgress,
            frame: previous.targetFrame,
          },
          current: {
            milestone: item.id,
            progress: item.state.scrollProgress,
            film: item.state.cinematicProgress,
            frame: item.state.targetFrame,
          },
        },
        "non-decreasing scroll, film and frame state",
      );
    }
  }

  const opening = forward[0].state;
  const portal = forward.find(({ id }) => id === "portal-entry").state;
  const settled = forward.at(-1).state;
  expect(
    failures,
    opening.scrollProgress <= 0.01 && opening.targetFrame <= 2,
    scenario,
    "opening-state",
    { progress: opening.scrollProgress, frame: opening.targetFrame },
    { progress: 0, frame: 1 },
  );
  expect(
    failures,
    portal.phase === "takeover"
      && portal.takeoverProgress > 0.05
      && portal.takeoverProgress < 0.98
      && portal.stage?.visibility === "visible",
    scenario,
    "portal-milestone",
    {
      phase: portal.phase,
      takeover: portal.takeoverProgress,
      stageVisibility: portal.stage?.visibility,
    },
    "visible in-progress portal takeover",
  );
  expect(
    failures,
    settled.phase === "settled"
      && settled.scrollProgress >= 0.999
      && settled.targetFrame >= 269
      && settled.takeoverProgress >= 0.99
      && settled.interactive === "true"
      && settled.stage?.visibility === "hidden"
      && settled.entry?.contentOpacity >= 0.99
      && settled.entry?.pointerEvents !== "none",
    scenario,
    "portal-settle",
    {
      phase: settled.phase,
      progress: settled.scrollProgress,
      frame: settled.targetFrame,
      takeover: settled.takeoverProgress,
      interactive: settled.interactive,
      stage: settled.stage,
      entry: settled.entry,
    },
    "frame 270 settled, stage hidden, semantic Entry interactive",
  );

  const reverseTargets = [0.985, 0.63, 0.28, 0];
  const reverse = [];
  for (const progress of reverseTargets) {
    const target = Math.round(startY + travel * progress);
    const state = await scrollTo(page, Math.min(endY, target));
    const media = await waitForMediaTarget(page);
    reverse.push({ progress, target: Math.min(endY, target), state, media });
  }
  for (let index = 0; index < reverse.length; index += 1) {
    const item = reverse[index];
    expect(
      failures,
      item.media.synchronized,
      scenario,
      "reverse-media-seek",
      { progress: item.progress, ...item.media },
      "currentTime follows the reverse target",
    );
    if (index > 0) {
      const previous = reverse[index - 1].state;
      expect(
        failures,
        item.state.scrollProgress <= previous.scrollProgress + 0.002
          && item.state.cinematicProgress <= previous.cinematicProgress + 0.002
          && item.state.targetFrame <= previous.targetFrame,
        scenario,
        "reverse-monotonicity",
        {
          previous: {
            progress: previous.scrollProgress,
            film: previous.cinematicProgress,
            frame: previous.targetFrame,
          },
          current: {
            progress: item.state.scrollProgress,
            film: item.state.cinematicProgress,
            frame: item.state.targetFrame,
          },
        },
        "non-increasing scroll, film and frame state",
      );
    }
  }
  expect(
    failures,
    reverse[0].state.phase === "takeover"
      && reverse[0].state.stage?.visibility === "visible"
      && reverse.at(-1).state.phase === "physical"
      && reverse.at(-1).state.targetFrame <= 2,
    scenario,
    "reverse-restoration",
    {
      portal: reverse[0].state,
      opening: reverse.at(-1).state,
    },
    "portal reappears and rewinds to the physical opening",
  );

  await scrollTo(page, startY);
  const fastForward = await scrollTo(page, endY);
  const fastForwardMedia = await waitForMediaTarget(page);
  expect(
    failures,
    fastForward.phase === "settled"
      && fastForward.targetFrame >= 269
      && fastForward.entry?.contentOpacity >= 0.99
      && fastForward.entry?.pointerEvents !== "none",
    scenario,
    "fast-jump-settle",
    fastForward,
    "latest scroll state settles semantically in one render pass",
  );
  expect(
    failures,
    fastForwardMedia.synchronized,
    scenario,
    "fast-jump-media-seek",
    fastForwardMedia,
    "decoder catches the latest final target",
  );

  const fastReverse = await scrollTo(page, startY);
  const fastReverseMedia = await waitForMediaTarget(page);
  expect(
    failures,
    fastReverse.phase === "physical"
      && fastReverse.targetFrame <= 2
      && fastReverse.stage?.visibility === "visible",
    scenario,
    "fast-reverse",
    fastReverse,
    "latest reverse state restores the physical opening",
  );
  expect(
    failures,
    fastReverseMedia.synchronized,
    scenario,
    "fast-reverse-media-seek",
    fastReverseMedia,
    "decoder catches the latest opening target",
  );

  await page.evaluate(
    ({ start, end }) => {
      window.scrollTo({ top: end, left: 0, behavior: "instant" });
      window.scrollTo({
        top: start + (end - start) * 0.37,
        left: 0,
        behavior: "instant",
      });
      window.scrollTo({ top: end, left: 0, behavior: "instant" });
    },
    { start: startY, end: endY },
  );
  await settle(page);
  const rapidFinal = await readHomeState(page);
  expect(
    failures,
    Math.abs(rapidFinal.scrollY - endY) <= 3
      && rapidFinal.phase === "settled"
      && rapidFinal.targetFrame >= 269,
    scenario,
    "rapid-latest-state-wins",
    rapidFinal,
    "final jump wins without stale intermediate state",
  );

  const network = observer.snapshot();
  expectCleanRuntime(failures, scenario, network);
  await context.close();
  return {
    viewport: viewport.id,
    geometry: { startY, endY, travel },
    initial,
    nativePageDown,
    forward,
    reverse,
    fastForward: { state: fastForward, media: fastForwardMedia },
    fastReverse: { state: fastReverse, media: fastReverseMedia },
    rapidFinal,
    network,
  };
}

async function runNativeScrollbarDrag(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  await context.addInitScript(() => {
    window.__phase4ScrollbarEvidence = {
      domPointerDowns: [],
      scrollEvents: [],
    };
    document.addEventListener(
      "pointerdown",
      (event) => {
        window.__phase4ScrollbarEvidence.domPointerDowns.push({
          x: event.clientX,
          y: event.clientY,
          target:
            event.target instanceof Element
              ? event.target.tagName.toLowerCase()
              : null,
        });
      },
      { capture: true },
    );
    addEventListener(
      "scroll",
      () => {
        window.__phase4ScrollbarEvidence.scrollEvents.push({
          y: scrollY,
          at: performance.now(),
        });
      },
      { passive: true },
    );
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const controllerCompleted = await waitForCinematicCompletion(page);
  const before = await readHomeState(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setScrollbarsHidden", { hidden: false });
  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const viewportHeight = innerHeight;
    const scrollHeight = root.scrollHeight;
    const maxScroll = Math.max(0, scrollHeight - viewportHeight);
    const scrollbarWidth = Math.max(0, innerWidth - root.clientWidth);
    const trackHeight = viewportHeight;
    const thumbHeight = Math.max(
      18,
      Math.min(trackHeight, trackHeight * viewportHeight / scrollHeight),
    );
    return {
      viewportWidth: innerWidth,
      viewportHeight,
      clientWidth: root.clientWidth,
      scrollbarWidth,
      scrollHeight,
      maxScroll,
      trackHeight,
      thumbHeight,
      trackTravel: Math.max(1, trackHeight - thumbHeight),
    };
  });
  const travel = Math.max(
    1,
    (before.entryTop ?? 1) - before.headerHeight - (before.shellTop ?? 0),
  );
  const requestedCinematicProgress = 0.72;
  const requestedY = Math.min(
    geometry.maxScroll,
    Math.round((before.shellTop ?? 0) + travel * requestedCinematicProgress),
  );
  const scrollbarX = geometry.scrollbarWidth > 0
    ? geometry.clientWidth + geometry.scrollbarWidth / 2
    : geometry.viewportWidth - 2;
  const openingThumbCenter = geometry.thumbHeight / 2;
  const requestedThumbCenter =
    requestedY / geometry.maxScroll * geometry.trackTravel
    + geometry.thumbHeight / 2;

  await page.mouse.move(scrollbarX, openingThumbCenter);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(scrollbarX, requestedThumbCenter, { steps: 24 });
  await page.mouse.up();
  await waitForScrollStable(page);
  await settle(page);
  const forward = await readHomeState(page);
  const forwardMedia = await waitForMediaTarget(page);
  const forwardMoved = forward.scrollY > 100;

  let reverse = null;
  let reverseMedia = null;
  if (forwardMoved) {
    const currentThumbCenter =
      forward.scrollY / geometry.maxScroll * geometry.trackTravel
      + geometry.thumbHeight / 2;
    await page.mouse.move(scrollbarX, currentThumbCenter);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(scrollbarX, openingThumbCenter, { steps: 24 });
    await page.mouse.up();
    await waitForScrollStable(page);
    await settle(page);
    reverse = await readHomeState(page);
    reverseMedia = await waitForMediaTarget(page);
  }
  const pointerEvidence = await page.evaluate(
    () => window.__phase4ScrollbarEvidence,
  );
  const network = observer.snapshot();
  const scenario = "native-root-scrollbar-drag";
  const expectedForwardProgress = Math.min(
    1,
    Math.max(0, (forward.scrollY - (before.shellTop ?? 0)) / travel),
  );
  const documentTolerance = Math.max(40, travel * 0.05);

  if (geometry.scrollbarWidth === 0) {
    await cdp.detach();
    await context.close();
    return {
      label: "Chromium native root-scrollbar pointer drag",
      inputMethod: "Pointer attempt at the viewport edge",
      usesProgrammaticScroll: false,
      executed: false,
      passed: null,
      limitation:
        "Headless Chromium exposed an overlay scrollbar (scrollbarWidth: 0); "
        + "the pointer hit page DOM and produced no native scrollbar scroll events.",
      unavailabilityEvidence: {
        scrollbarWidth: geometry.scrollbarWidth,
        pointerHitDom: pointerEvidence.domPointerDowns.length > 0,
        domPointerDowns: pointerEvidence.domPointerDowns,
        scrollEventCount: pointerEvidence.scrollEvents.length,
        beforeY: before.scrollY,
        afterY: forward.scrollY,
      },
      geometry,
      before,
      forward,
      pointerEvidence,
      network,
    };
  }

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expect(
    failures,
    controllerCompleted
      && before.rootMode === "enhanced"
      && before.scrollY <= 1,
    scenario,
    "scrollbar-prerequisite",
    {
      controllerCompleted,
      mode: before.rootMode,
      openingY: before.scrollY,
    },
    "enhanced Home at the root-scrollbar opening",
  );
  expect(
    failures,
    forwardMoved
      && Math.abs(forward.scrollY - requestedY) <= documentTolerance
      && pointerEvidence.scrollEvents.length >= 2
      && geometry.scrollbarWidth > 0
      && scrollbarX > geometry.clientWidth
      && pointerEvidence.domPointerDowns.length >= 1
      && pointerEvidence.domPointerDowns.every(
        ({ target, x }) => target === "html" && x > geometry.clientWidth,
      ),
    scenario,
    "native-scrollbar-forward-drag",
    {
      geometry,
      scrollbarX,
      openingThumbCenter,
      requestedThumbCenter,
      requestedY,
      actualY: forward.scrollY,
      tolerance: documentTolerance,
      pointerEvidence,
    },
    "pointer drag outside the root client width advances the native root scrollbar",
  );
  expect(
    failures,
    Math.abs((forward.scrollProgress ?? 0) - expectedForwardProgress) <= 0.015
      && (forward.targetFrame ?? 0) > 2
      && forwardMedia.synchronized,
    scenario,
    "scrollbar-latest-state-sync",
    {
      expectedForwardProgress,
      stateProgress: forward.scrollProgress,
      frame: forward.targetFrame,
      media: forwardMedia,
    },
    "controller and media synchronize to the latest native scrollbar position",
  );
  expect(
    failures,
    forward.nestedVerticalScrollers.length === 0
      && forward.horizontalOverflow <= OVERFLOW_TOLERANCE_PX,
    scenario,
    "scrollbar-document-authority",
    {
      nested: forward.nestedVerticalScrollers,
      horizontalOverflow: forward.horizontalOverflow,
    },
    "root document remains the only scrolling authority",
  );
  if (forwardMoved) {
    expect(
      failures,
      reverse !== null
        && reverse.scrollY <= 30
        && (reverse.scrollProgress ?? 1) <= 0.02
        && (reverse.targetFrame ?? 270) <= 3
        && reverse.stage?.visibility === "visible"
        && reverseMedia?.synchronized,
      scenario,
      "native-scrollbar-reverse-drag",
      { reverse, reverseMedia },
      "reliable reverse pointer drag restores the physical opening",
    );
  }
  expectCleanRuntime(failures, scenario, network);

  await cdp.detach();
  await context.close();
  return {
    label: "Chromium native root-scrollbar pointer drag",
    inputMethod:
      "Playwright pointer events on Chromium browser chrome with the default "
      + "--hide-scrollbars argument omitted",
    usesProgrammaticScroll: false,
    executed: true,
    passed: true,
    reverseAttempted: forwardMoved,
    geometry,
    scrollbarX,
    openingThumbCenter,
    requestedThumbCenter,
    requestedY,
    documentTolerance,
    before,
    forward,
    forwardMedia,
    reverse,
    reverseMedia,
    pointerEvidence,
    network,
  };
}

async function runKeyboardSkip(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  await waitForCinematicCompletion(page);
  await page.keyboard.press("Tab");
  const focused = await readHomeState(page);
  const scenario = "keyboard-skip";

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expect(
    failures,
    focused.active?.className.includes("skip-link")
      && focused.active?.href === "#entry"
      && focused.active?.text === "Skip cinematic intro"
      && focused.skip?.visible,
    scenario,
    "first-focus",
    { active: focused.active, skip: focused.skip },
    "visible Skip cinematic intro link targeting #entry",
  );

  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => location.hash === "#entry",
    undefined,
    { timeout: 3000 },
  ).catch(() => {});
  await waitForScrollStable(page);
  await settle(page);
  const skipped = await readHomeState(page);
  const expectedY = Math.min(
    skipped.maxScroll,
    Math.max(0, (skipped.entryTop ?? 0) - skipped.headerHeight),
  );
  expect(
    failures,
    skipped.hash === "#entry" && Math.abs(skipped.scrollY - expectedY) <= 5,
    scenario,
    "anchor-target",
    { hash: skipped.hash, scrollY: skipped.scrollY, expectedY },
    "#entry aligned below the header",
  );
  expect(
    failures,
    skipped.entry?.contentOpacity >= 0.99
      && skipped.entry?.pointerEvents !== "none"
      && skipped.stage?.visibility === "hidden",
    scenario,
    "semantic-skip-state",
    { entry: skipped.entry, stage: skipped.stage, phase: skipped.phase },
    "Entry visible and interactive without waiting for decoder state",
  );
  const network = observer.snapshot();
  expectCleanRuntime(failures, scenario, network);

  await context.close();
  return { focused, skipped, expectedY, network };
}

async function runKeyboardSkipMatrix(browser, baseUrl, failures) {
  const positions = [
    { id: "top", progress: 0 },
    { id: "conduction", progress: 0.18 },
    { id: "crt-startup", progress: 0.42 },
    { id: "camera-approach", progress: 0.72 },
  ];
  const results = [];
  for (const position of positions) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    const observer = observePage(page, baseUrl);
    const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
    const controllerCompleted = await waitForCinematicCompletion(page);
    const initial = await readHomeState(page);
    const travel = Math.max(
      1,
      (initial.entryTop ?? 1) - initial.headerHeight - (initial.shellTop ?? 0),
    );
    const setupY = Math.min(
      initial.maxScroll,
      Math.round((initial.shellTop ?? 0) + travel * position.progress),
    );
    const setup = await scrollTo(page, setupY);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(250);
    await settle(page);
    const focused = await readHomeState(page);
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => location.hash === "#entry",
      undefined,
      { timeout: 3000 },
    ).catch(() => {});
    await waitForScrollStable(page);
    await settle(page);
    const skipped = await readHomeState(page);
    const expectedY = Math.min(
      skipped.maxScroll,
      Math.max(0, (skipped.entryTop ?? 0) - skipped.headerHeight),
    );
    const network = observer.snapshot();
    const scenario = "keyboard-skip-matrix/" + position.id;

    expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
    expect(
      failures,
      controllerCompleted
        && focused.active?.className.includes("skip-link")
        && focused.active?.href === "#entry"
        && focused.skip?.visible,
      scenario,
      "skip-focus",
      {
        controllerCompleted,
        setup: {
          y: setup.scrollY,
          progress: setup.scrollProgress,
          frame: setup.targetFrame,
        },
        active: focused.active,
        skip: focused.skip,
      },
      "visible keyboard-first skip link from the requested cinematic phase",
    );
    expect(
      failures,
      skipped.hash === "#entry"
        && Math.abs(skipped.scrollY - expectedY) <= 5
        && skipped.phase === "settled"
        && skipped.stage?.visibility === "hidden"
        && skipped.entry?.contentOpacity >= 0.99
        && skipped.entry?.pointerEvents !== "none",
      scenario,
      "skip-semantic-result",
      { expectedY, skipped },
      "native anchor settles on readable interactive ENTRY",
    );
    expectCleanRuntime(failures, scenario, network);
    results.push({
      id: position.id,
      requestedProgress: position.progress,
      setupY,
      setup,
      focused,
      skipped,
      expectedY,
      network,
    });
    await context.close();
  }
  return results;
}

async function runStaticVariant(
  browser,
  baseUrl,
  { id, viewport, javaScriptEnabled, reducedMotion },
  failures,
) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    javaScriptEnabled,
    reducedMotion,
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts?.ready);
  if (javaScriptEnabled) await settle(page);
  else await page.waitForTimeout(100);
  const initial = await readHomeState(page);
  const scenario = id + "/" + viewport.id;

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expectHomeSemantics(failures, scenario, initial);
  expect(
    failures,
    initial.rootMode === (javaScriptEnabled ? "static" : null),
    scenario,
    "static-mode",
    initial.rootMode,
    javaScriptEnabled ? "static" : null,
  );
  expect(
    failures,
    initial.cinematicVideoCount === 1 && initial.totalVideoCount === 1,
    scenario,
    "single-dormant-video-node",
    {
      cinematic: initial.cinematicVideoCount,
      total: initial.totalVideoCount,
    },
    { cinematic: 1, total: 1 },
  );
  expect(
    failures,
    !initial.video?.srcAttribute && !initial.video?.currentSrc,
    scenario,
    "dormant-video",
    initial.video,
    "no source and no playback request",
  );
  expect(
    failures,
    initial.stage?.position === "absolute"
      && (initial.entryTop ?? Infinity) - (initial.shellTop ?? 0) <= viewport.height * 0.8 + 3
      && initial.entry?.contentOpacity >= 0.99
      && initial.entry?.pointerEvents !== "none",
    scenario,
    "normal-document-flow",
    {
      stage: initial.stage,
      cinematicSpan: (initial.entryTop ?? 0) - (initial.shellTop ?? 0),
      entry: initial.entry,
    },
    "bounded poster followed by visible, interactive Entry",
  );

  let keyboard = null;
  if (!javaScriptEnabled) {
    await page.keyboard.press("Tab");
    const focused = await readHomeState(page);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    const skipped = await readHomeState(page);
    keyboard = { focused, skipped };
    expect(
      failures,
      focused.active?.className.includes("skip-link")
        && focused.active?.href === "#entry"
        && skipped.hash === "#entry",
      scenario,
      "no-js-keyboard-skip",
      keyboard,
      "native skip link remains functional",
    );
  }

  const network = observer.snapshot();
  expect(
    failures,
    network.uniqueMediaPaths.length === 0,
    scenario,
    "static-media-request",
    network.uniqueMediaPaths,
    [],
  );
  expect(
    failures,
    network.cinematicControllerRequests.length === 0,
    scenario,
    "static-controller-request",
    network.cinematicControllerRequests,
    [],
  );
  expectCleanRuntime(failures, scenario, network);
  await context.close();
  return {
    id,
    viewport: viewport.id,
    status: response?.status() ?? null,
    initial,
    keyboard,
    network,
  };
}

async function readHashTarget(page, selector) {
  return page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    const rect = element?.getBoundingClientRect();
    const style = element ? getComputedStyle(element) : null;
    return {
      selector: targetSelector,
      exists: Boolean(element),
      top: rect?.top ?? null,
      bottom: rect?.bottom ?? null,
      width: rect?.width ?? null,
      height: rect?.height ?? null,
      display: style?.display ?? null,
      visibility: style?.visibility ?? null,
      opacity: style ? Number.parseFloat(style.opacity) : null,
      heading:
        element?.querySelector("h1, h2")?.textContent?.trim().replace(/\s+/g, " ")
        ?? null,
    };
  }, selector);
}

async function runDirectDeepLink(
  browser,
  baseUrl,
  { id, hash, selector, expectedHeader },
  failures,
) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/" + hash, {
    waitUntil: "domcontentloaded",
  });
  const controllerCompleted = await waitForCinematicCompletion(page);
  await waitForScrollStable(page);
  await settle(page);
  const state = await readHomeState(page);
  const target = await readHashTarget(page, selector);
  const network = observer.snapshot();
  const scenario = "direct-deep-link/" + id;

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expectHomeSemantics(failures, scenario, state);
  expect(
    failures,
    controllerCompleted
      && state.rootMode === "enhanced"
      && state.mediaState === "ready",
    scenario,
    "enhanced-deep-link",
    {
      controllerCompleted,
      mode: state.rootMode,
      mediaState: state.mediaState,
      fallback: state.rootFallback,
    },
    "enhanced controller reconstructed from the deep document position",
  );
  expect(
    failures,
    state.hash === hash
      && target.exists
      && target.top >= -3
      && target.top <= state.headerHeight + 8
      && target.bottom > Math.max(1, target.top),
    scenario,
    "hash-target-position",
    { hash: state.hash, headerHeight: state.headerHeight, target },
    "requested section starts within the readable top band",
  );
  expect(
    failures,
    state.phase === "settled"
      && state.targetFrame >= 269
      && state.stage?.visibility === "hidden"
      && state.entry?.contentOpacity >= 0.99
      && state.entry?.pointerEvents !== "none",
    scenario,
    "deep-link-semantic-state",
    {
      phase: state.phase,
      frame: state.targetFrame,
      stage: state.stage,
      entry: state.entry,
    },
    "settled semantic Home without a poster obstruction",
  );
  expect(
    failures,
    state.rootHeader === expectedHeader
      && !state.rootDeepLink,
    scenario,
    "deep-link-root-state",
    {
      header: state.rootHeader,
      deepLinkMarker: state.rootDeepLink,
    },
    { header: expectedHeader, deepLinkMarker: false },
  );
  expect(
    failures,
    network.uniqueMediaPaths.length === 1,
    scenario,
    "single-deep-link-media",
    network.uniqueMediaPaths,
    ["one selected cinematic source"],
  );
  expectCleanRuntime(failures, scenario, network);

  await context.close();
  return {
    id,
    hash,
    status: response?.status() ?? null,
    controllerCompleted,
    state,
    target,
    network,
  };
}

function withoutNavigationAborts(network) {
  return {
    ...network,
    failedCinematicRequests: network.failedCinematicRequests.filter(
      ({ error }) => !/ERR_ABORTED/i.test(error),
    ),
  };
}

async function runLifecycleRestoration(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  await context.addInitScript(() => {
    window.__phase4Lifecycle = { shows: [], hides: [] };
    addEventListener("pageshow", (event) => {
      window.__phase4Lifecycle.shows.push({
        persisted: event.persisted,
        at: performance.now(),
      });
    });
    addEventListener("pagehide", (event) => {
      window.__phase4Lifecycle.hides.push({
        persisted: event.persisted,
        at: performance.now(),
      });
    });
  });

  const reloadPage = await context.newPage();
  const reloadObserver = observePage(reloadPage, baseUrl);
  await reloadPage.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  await waitForCinematicCompletion(reloadPage);
  const initial = await readHomeState(reloadPage);
  const settledY = Math.min(
    initial.maxScroll,
    Math.round(
      (initial.entryTop ?? 0)
      - initial.headerHeight,
    ),
  );
  const beforeSettledReload = await scrollTo(reloadPage, settledY);
  await reloadPage.reload({ waitUntil: "domcontentloaded" });
  await waitForCinematicCompletion(reloadPage);
  await waitForScrollStable(reloadPage);
  await settle(reloadPage);
  const afterSettledReload = await readHomeState(reloadPage);
  const methodTop = await reloadPage.locator("#method").evaluate(
    (element) => element.getBoundingClientRect().top + scrollY,
  );
  const deepY = Math.min(
    afterSettledReload.maxScroll,
    Math.round(methodTop + 120),
  );
  const beforeDeepReload = await scrollTo(reloadPage, deepY);
  await reloadPage.reload({ waitUntil: "domcontentloaded" });
  await waitForCinematicCompletion(reloadPage);
  await waitForScrollStable(reloadPage);
  await settle(reloadPage);
  const afterDeepReload = await readHomeState(reloadPage);
  const reloadLifecycle = await reloadPage.evaluate(
    () => window.__phase4Lifecycle ?? { shows: [], hides: [] },
  );
  const reloadNetwork = reloadObserver.snapshot();
  const reloadAssertionNetwork = withoutNavigationAborts(reloadNetwork);
  const reloadScenario = "lifecycle/reload";

  expect(
    failures,
    Math.abs(afterSettledReload.scrollY - beforeSettledReload.scrollY) <= 6
      && afterSettledReload.phase === "settled"
      && afterSettledReload.targetFrame >= 269
      && afterSettledReload.stage?.visibility === "hidden"
      && afterSettledReload.entry?.contentOpacity >= 0.99,
    reloadScenario,
    "settled-reload-restoration",
    { before: beforeSettledReload, after: afterSettledReload },
    "settled ENTRY position and semantic state restored within 6px",
  );
  expect(
    failures,
    Math.abs(afterDeepReload.scrollY - beforeDeepReload.scrollY) <= 6
      && afterDeepReload.scrollY > settledY
      && afterDeepReload.phase === "settled"
      && afterDeepReload.rootHeader === "released"
      && afterDeepReload.stage?.visibility === "hidden",
    reloadScenario,
    "deep-reload-restoration",
    { before: beforeDeepReload, after: afterDeepReload, settledY },
    "deep METHOD position and released semantic state restored within 6px",
  );
  expect(
    failures,
    afterSettledReload.rootMode === "enhanced"
      && afterDeepReload.rootMode === "enhanced"
      && afterSettledReload.rootFallback === null
      && afterDeepReload.rootFallback === null,
    reloadScenario,
    "reload-controller-state",
    {
      settled: {
        mode: afterSettledReload.rootMode,
        fallback: afterSettledReload.rootFallback,
      },
      deep: {
        mode: afterDeepReload.rootMode,
        fallback: afterDeepReload.rootFallback,
      },
    },
    "fresh enhanced controller without stale fallback state",
  );
  expectCleanRuntime(failures, reloadScenario, reloadAssertionNetwork);

  const historyPage = await context.newPage();
  const historyObserver = observePage(historyPage, baseUrl);
  await historyPage.goto(baseUrl + "/about/", { waitUntil: "networkidle" });
  await historyPage.goto(baseUrl + "/#method", { waitUntil: "domcontentloaded" });
  await waitForCinematicCompletion(historyPage);
  await waitForScrollStable(historyPage);
  const homeBeforeBack = await readHomeState(historyPage);
  const methodBeforeBack = await readHashTarget(historyPage, "#method");

  await historyPage.goBack({ waitUntil: "domcontentloaded" });
  await settle(historyPage);
  const supportingAfterBack = await historyPage.evaluate(() => ({
    path: location.pathname,
    rootMode: document.documentElement.getAttribute("data-cinematic-mode"),
    cinematicShells: document.querySelectorAll("[data-cinematic-shell]").length,
    cinematicVideos: document.querySelectorAll("[data-cinematic-media]").length,
    h1Count: document.querySelectorAll("h1").length,
    horizontalOverflow:
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
  }));

  await historyPage.goForward({ waitUntil: "domcontentloaded" });
  await waitForCinematicCompletion(historyPage);
  await waitForScrollStable(historyPage);
  await settle(historyPage);
  const homeAfterForward = await readHomeState(historyPage);
  const methodAfterForward = await readHashTarget(historyPage, "#method");
  const historyLifecycle = await historyPage.evaluate(
    () => window.__phase4Lifecycle ?? { shows: [], hides: [] },
  );
  const historyNetwork = historyObserver.snapshot();
  const historyAssertionNetwork = withoutNavigationAborts(historyNetwork);
  const historyScenario = "lifecycle/history";

  expect(
    failures,
    supportingAfterBack.path === "/about/"
      && supportingAfterBack.rootMode === null
      && supportingAfterBack.cinematicShells === 0
      && supportingAfterBack.cinematicVideos === 0
      && supportingAfterBack.h1Count === 1
      && supportingAfterBack.horizontalOverflow <= OVERFLOW_TOLERANCE_PX,
    historyScenario,
    "supporting-route-back-state",
    supportingAfterBack,
    "clean supporting route without stale cinematic state",
  );
  expect(
    failures,
    homeAfterForward.path === "/"
      && homeAfterForward.hash === "#method"
      && homeAfterForward.rootMode === "enhanced"
      && homeAfterForward.phase === "settled"
      && homeAfterForward.rootFallback === null
      && homeAfterForward.stage?.visibility === "hidden"
      && methodAfterForward.top >= -3
      && methodAfterForward.top <= homeAfterForward.headerHeight + 8,
    historyScenario,
    "home-forward-state",
    {
      beforeBack: homeBeforeBack,
      beforeTarget: methodBeforeBack,
      afterForward: homeAfterForward,
      afterTarget: methodAfterForward,
    },
    "Home #method reconstructs without stale classes or a reset jump",
  );
  expect(
    failures,
    Math.abs(homeAfterForward.scrollY - homeBeforeBack.scrollY) <= 6,
    historyScenario,
    "history-scroll-restoration",
    {
      before: homeBeforeBack.scrollY,
      after: homeAfterForward.scrollY,
    },
    "+/- 6px",
  );
  expectCleanRuntime(failures, historyScenario, historyAssertionNetwork);

  const bfcachePersisted =
    historyLifecycle.shows.some(({ persisted }) => persisted)
    || historyLifecycle.hides.some(({ persisted }) => persisted);

  await context.close();
  return {
    reload: {
      settledY,
      beforeSettledReload,
      afterSettledReload,
      deepY,
      beforeDeepReload,
      afterDeepReload,
      lifecycle: reloadLifecycle,
      network: reloadNetwork,
      expectedNavigationAborts: reloadNetwork.failedCinematicRequests.filter(
        ({ error }) => /ERR_ABORTED/i.test(error),
      ),
    },
    history: {
      homeBeforeBack,
      methodBeforeBack,
      supportingAfterBack,
      homeAfterForward,
      methodAfterForward,
      lifecycle: historyLifecycle,
      bfcache: {
        attempted: true,
        persisted: bfcachePersisted,
        passed: bfcachePersisted ? true : null,
        limitation: bfcachePersisted
          ? null
          : "This Playwright/Chromium history traversal did not expose a persisted BFCache restore.",
      },
      network: historyNetwork,
      expectedNavigationAborts: historyNetwork.failedCinematicRequests.filter(
        ({ error }) => /ERR_ABORTED/i.test(error),
      ),
    },
  };
}

async function runReloadPositionMatrix(browser, baseUrl, failures) {
  const positions = [
    { id: "dormancy", kind: "cinematic", progress: 0 },
    { id: "mid-conduction", kind: "cinematic", progress: 0.18 },
    { id: "crt-startup", kind: "cinematic", progress: 0.42 },
    { id: "camera-approach", kind: "cinematic", progress: 0.72 },
    { id: "portal", kind: "cinematic", progress: 0.985 },
    { id: "entry", kind: "cinematic", progress: 1 },
    { id: "method", kind: "section", selector: "#method" },
    { id: "proof", kind: "section", selector: "#proof" },
  ];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  await waitForCinematicCompletion(page);
  const results = [];

  for (const position of positions) {
    const current = await readHomeState(page);
    let targetY;
    if (position.kind === "cinematic") {
      const travel = Math.max(
        1,
        (current.entryTop ?? 1) - current.headerHeight - (current.shellTop ?? 0),
      );
      targetY = Math.min(
        current.maxScroll,
        Math.round((current.shellTop ?? 0) + travel * position.progress),
      );
    } else {
      const sectionTop = await page.locator(position.selector).evaluate(
        (element) => element.getBoundingClientRect().top + scrollY,
      );
      targetY = Math.min(current.maxScroll, Math.round(sectionTop + 120));
    }
    const before = await scrollTo(page, targetY);
    await page.reload({ waitUntil: "domcontentloaded" });
    const controllerCompleted = await waitForCinematicCompletion(page);
    await waitForScrollStable(page);
    await settle(page);
    const after = await readHomeState(page);
    const scenario = "reload-position/" + position.id;
    const cinematicStateMatches =
      position.kind !== "cinematic"
      || (
        Math.abs((after.scrollProgress ?? 0) - (before.scrollProgress ?? 0)) <= 0.015
        && Math.abs((after.cinematicProgress ?? 0) - (before.cinematicProgress ?? 0)) <= 0.015
        && Math.abs((after.targetFrame ?? 1) - (before.targetFrame ?? 1)) <= 3
      );

    expect(
      failures,
      controllerCompleted
        && Math.abs(after.scrollY - before.scrollY) <= 6
        && cinematicStateMatches
        && after.rootMode === "enhanced"
        && after.rootFallback === null,
      scenario,
      "reload-state-reconstruction",
      {
        controllerCompleted,
        position,
        targetY,
        before: {
          y: before.scrollY,
          scroll: before.scrollProgress,
          film: before.cinematicProgress,
          frame: before.targetFrame,
          phase: before.phase,
        },
        after: {
          y: after.scrollY,
          scroll: after.scrollProgress,
          film: after.cinematicProgress,
          frame: after.targetFrame,
          phase: after.phase,
          mode: after.rootMode,
          fallback: after.rootFallback,
        },
      },
      "document position within 6px and current cinematic state reconstructed",
    );
    expectHomeSemantics(failures, scenario, after);
    if (position.kind === "section" || position.id === "entry") {
      expect(
        failures,
        after.phase === "settled"
          && after.stage?.visibility === "hidden"
          && after.entry?.contentOpacity >= 0.99
          && after.entry?.pointerEvents !== "none",
        scenario,
        "reload-deep-semantic-state",
        after,
        "settled semantic Home at or below ENTRY",
      );
    }
    results.push({
      ...position,
      targetY,
      before,
      after,
      controllerCompleted,
    });
  }

  const network = observer.snapshot();
  const assertionNetwork = withoutNavigationAborts(network);
  expectCleanRuntime(failures, "reload-position-matrix", assertionNetwork);
  await context.close();
  return {
    positions: results,
    network,
    expectedNavigationAborts: network.failedCinematicRequests.filter(
      ({ error }) => /ERR_ABORTED/i.test(error),
    ),
  };
}

async function runVisibilityLifecycle(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  await context.addInitScript(() => {
    window.__phase4VisibilityEvents = [];
    document.addEventListener("visibilitychange", () => {
      window.__phase4VisibilityEvents.push({
        state: document.visibilityState,
        hidden: document.hidden,
        at: performance.now(),
      });
    });
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  await waitForCinematicCompletion(page);
  const initial = await readHomeState(page);
  const travel = Math.max(
    1,
    (initial.entryTop ?? 1) - initial.headerHeight - (initial.shellTop ?? 0),
  );
  const before = await scrollTo(
    page,
    Math.round((initial.shellTop ?? 0) + travel * 0.32),
  );
  const cdp = await context.newCDPSession(page);
  let executed = false;
  let limitation = null;
  try {
    await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await cdp.send("Page.setWebLifecycleState", { state: "active" });
    executed = true;
  } catch (error) {
    limitation = error instanceof Error ? error.message : String(error);
  }
  await settle(page);
  const resumed = await scrollTo(
    page,
    Math.round((initial.shellTop ?? 0) + travel * 0.55),
  );
  const events = await page.evaluate(
    () => window.__phase4VisibilityEvents ?? [],
  );
  const network = observer.snapshot();
  const scenario = "visibility-lifecycle";
  let passed = null;
  if (executed) {
    passed =
      resumed.scrollProgress > before.scrollProgress
      && resumed.targetFrame > before.targetFrame
      && resumed.mediaState === "ready"
      && resumed.video?.paused
      && !resumed.video?.seeking;
    expect(
      failures,
      passed,
      scenario,
      "controller-resume",
      { before, resumed, events },
      "controller and paused decorative media resume from current document position",
    );
    expectCleanRuntime(failures, scenario, network);
  }
  await cdp.detach();
  await context.close();
  return {
    executed,
    passed,
    mechanism: "CDP Page.setWebLifecycleState frozen -> active",
    limitation,
    before,
    resumed,
    events,
    network,
  };
}

async function waitForViewportStage(page, height) {
  await page.waitForFunction(
    (expectedHeight) => {
      const stage = document.querySelector("[data-cinematic-stage]");
      return stage && Math.abs(stage.getBoundingClientRect().height - expectedHeight) <= 2;
    },
    height,
    { timeout: 3000 },
  ).catch(() => {});
  await settle(page);
}

async function runResizeOrientation(browser, baseUrl, failures) {
  const portrait = { width: 390, height: 844 };
  const landscape = { width: 844, height: 390 };
  const context = await browser.newContext({
    viewport: portrait,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const controllerCompleted = await waitForCinematicCompletion(page);
  const initial = await readHomeState(page);
  const scenario = "resize-orientation";

  expect(
    failures,
    controllerCompleted
      && initial.rootMode === "enhanced"
      && initial.mediaFamily === "mobile"
      && initial.mediaState === "ready",
    scenario,
    "mobile-prerequisite",
    {
      controllerCompleted,
      mode: initial.rootMode,
      family: initial.mediaFamily,
      mediaState: initial.mediaState,
    },
    "ready mobile cinematic",
  );

  const checkpoints = [];
  if (controllerCompleted && initial.rootMode === "enhanced") {
    for (const checkpoint of [
      { id: "conduction", progress: 0.32 },
      { id: "portal-approach", progress: 0.985 },
      { id: "settled-entry", progress: 1 },
    ]) {
      await page.setViewportSize(portrait);
      await waitForViewportStage(page, portrait.height);
      const portraitState = await readHomeState(page);
      const portraitTravel = Math.max(
        1,
        (portraitState.entryTop ?? 1)
          - portraitState.headerHeight
          - (portraitState.shellTop ?? 0),
      );
      const portraitTarget = Math.min(
        portraitState.maxScroll,
        Math.round((portraitState.shellTop ?? 0) + portraitTravel * checkpoint.progress),
      );
      const before = await scrollTo(page, portraitTarget);
      const beforeMedia = await waitForMediaTarget(page);

      await page.setViewportSize(landscape);
      await waitForViewportStage(page, landscape.height);
      const rotated = await readHomeState(page);
      const rotatedMedia = await waitForMediaTarget(page);

      await page.setViewportSize(portrait);
      await waitForViewportStage(page, portrait.height);
      const restored = await readHomeState(page);
      const restoredMedia = await waitForMediaTarget(page);

      checkpoints.push({
        id: checkpoint.id,
        requestedProgress: checkpoint.progress,
        portraitTarget,
        before,
        beforeMedia,
        rotated,
        rotatedMedia,
        restored,
        restoredMedia,
      });

      expect(
        failures,
        before.mediaFamily === "mobile"
          && rotated.mediaFamily === "mobile"
          && restored.mediaFamily === "mobile"
          && before.mediaSource === rotated.mediaSource
          && before.mediaSource === restored.mediaSource
          && Boolean(rotated.video?.currentSrc)
          && rotated.mediaState === "ready",
        scenario,
        "orientation-family-lock",
        {
          checkpoint: checkpoint.id,
          before: {
            family: before.mediaFamily,
            source: before.mediaSource,
            currentSrc: before.video?.currentSrc,
          },
          rotated: {
            family: rotated.mediaFamily,
            source: rotated.mediaSource,
            currentSrc: rotated.video?.currentSrc,
            mediaState: rotated.mediaState,
          },
          restored: {
            family: restored.mediaFamily,
            source: restored.mediaSource,
            currentSrc: restored.video?.currentSrc,
          },
        },
        "initial mobile family and source remain locked through rotation",
      );
      expect(
        failures,
        Math.abs((rotated.scrollProgress ?? 0) - (before.scrollProgress ?? 0)) <= 0.04
          && Math.abs((restored.scrollProgress ?? 0) - (before.scrollProgress ?? 0)) <= 0.04
          && Math.abs((rotated.cinematicProgress ?? 0) - (before.cinematicProgress ?? 0)) <= 0.04
          && Math.abs((restored.cinematicProgress ?? 0) - (before.cinematicProgress ?? 0)) <= 0.04,
        scenario,
        "orientation-progress-preservation",
        {
          checkpoint: checkpoint.id,
          before: {
            scroll: before.scrollProgress,
            film: before.cinematicProgress,
            frame: before.targetFrame,
            y: before.scrollY,
          },
          rotated: {
            scroll: rotated.scrollProgress,
            film: rotated.cinematicProgress,
            frame: rotated.targetFrame,
            y: rotated.scrollY,
          },
          restored: {
            scroll: restored.scrollProgress,
            film: restored.cinematicProgress,
            frame: restored.targetFrame,
            y: restored.scrollY,
          },
        },
        "normalized document and film state preserved within 0.04",
      );
      expect(
        failures,
        rotated.stage?.height !== null
          && Math.abs(rotated.stage.height - landscape.height) <= 2
          && restored.stage?.height !== null
          && Math.abs(restored.stage.height - portrait.height) <= 2
          && rotated.horizontalOverflow <= OVERFLOW_TOLERANCE_PX
          && restored.horizontalOverflow <= OVERFLOW_TOLERANCE_PX,
        scenario,
        "orientation-layout",
        {
          checkpoint: checkpoint.id,
          rotated: {
            stage: rotated.stage,
            overflow: rotated.horizontalOverflow,
          },
          restored: {
            stage: restored.stage,
            overflow: restored.horizontalOverflow,
          },
        },
        "stage tracks viewport and layout does not overflow",
      );
      expect(
        failures,
        beforeMedia.synchronized
          && rotatedMedia.synchronized
          && restoredMedia.synchronized,
        scenario,
        "orientation-media-seek",
        {
          checkpoint: checkpoint.id,
          before: beforeMedia,
          rotated: rotatedMedia,
          restored: restoredMedia,
        },
        "selected media remains decoded at the latest target",
      );
      if (checkpoint.id === "settled-entry") {
        expect(
          failures,
          before.phase === "settled"
            && rotated.phase === "settled"
            && restored.phase === "settled"
            && rotated.stage?.visibility === "hidden"
            && rotated.entry?.contentOpacity >= 0.99
            && rotated.entry?.pointerEvents !== "none",
          scenario,
          "orientation-settled-entry",
          {
            before: {
              phase: before.phase,
              stage: before.stage,
              entry: before.entry,
            },
            rotated: {
              phase: rotated.phase,
              stage: rotated.stage,
              entry: rotated.entry,
            },
            restored: {
              phase: restored.phase,
              stage: restored.stage,
              entry: restored.entry,
            },
          },
          "settled ENTRY remains semantic and interactive through rotation",
        );
      }
    }
  }

  const network = observer.snapshot();
  expect(
    failures,
    network.uniqueMediaPaths.length === 1
      && network.uniqueMediaPaths[0]?.includes("-mobile-"),
    scenario,
    "orientation-network-lock",
    network.uniqueMediaPaths,
    ["one mobile media asset"],
  );
  expectCleanRuntime(failures, scenario, network);
  await context.close();
  return { initial, checkpoints, network };
}

async function runMediaFailOpen(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const aborted = [];
  await context.route("**/media/cinematic/*", async (route) => {
    const request = route.request();
    if (/\.(?:mp4|webm)(?:\?|$)/i.test(request.url())) {
      aborted.push({
        url: request.url(),
        resourceType: request.resourceType(),
      });
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const root = document.documentElement;
      return root.dataset.cinematicMode === "static"
        && root.dataset.cinematicFallback;
    },
    undefined,
    { timeout: 5000 },
  ).catch(() => {});
  await settle(page);
  const state = await readHomeState(page);
  const network = observer.snapshot();
  const expectedConsoleErrors = network.runtimeErrors.filter(
    (message) => /Failed to load resource|ERR_FAILED/i.test(message),
  );
  const unexpectedConsoleErrors = network.runtimeErrors.filter(
    (message) => !expectedConsoleErrors.includes(message),
  );
  const scenario = "media-fail-open/aborted-request";

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expectHomeSemantics(failures, scenario, state);
  expect(
    failures,
    state.rootMode === "static"
      && state.rootFallback === "media"
      && state.mediaState === "failed"
      && state.phase === "fallback"
      && state.interactive === "true",
    scenario,
    "fail-open-state",
    {
      mode: state.rootMode,
      fallback: state.rootFallback,
      mediaState: state.mediaState,
      phase: state.phase,
      interactive: state.interactive,
    },
    {
      mode: "static",
      fallback: "media",
      mediaState: "failed",
      phase: "fallback",
      interactive: "true",
    },
  );
  expect(
    failures,
    state.stage?.position === "absolute"
      && (state.entryTop ?? Infinity) - (state.shellTop ?? 0) <= state.viewport.height * 0.8 + 3
      && state.entry?.contentOpacity >= 0.99
      && state.entry?.pointerEvents !== "none"
      && !state.video?.srcAttribute,
    scenario,
    "fail-open-document-flow",
    {
      stage: state.stage,
      cinematicSpan: (state.entryTop ?? 0) - (state.shellTop ?? 0),
      entry: state.entry,
      video: state.video,
    },
    "bounded poster and immediately readable, interactive ENTRY",
  );
  expect(
    failures,
    aborted.length === 1
      && network.uniqueMediaPaths.length === 1
      && network.failedCinematicRequests.length >= 1,
    scenario,
    "simulated-media-failure",
    {
      aborted,
      mediaPaths: network.uniqueMediaPaths,
      failedRequests: network.failedCinematicRequests,
    },
    "one selected media request is deliberately aborted",
  );
  expect(
    failures,
    unexpectedConsoleErrors.length === 0
      && expectedConsoleErrors.length <= 1,
    scenario,
    "fail-open-console",
    {
      expectedResourceErrors: expectedConsoleErrors,
      unexpectedErrors: unexpectedConsoleErrors,
    },
    "at most one expected resource error and no exception loop",
  );
  expect(
    failures,
    network.externalRequests.length === 0,
    scenario,
    "external-runtime-request",
    network.externalRequests,
    [],
  );

  await context.close();
  return {
    status: response?.status() ?? null,
    aborted,
    state,
    network,
    expectedConsoleErrors,
    unexpectedConsoleErrors,
  };
}

async function runMedia404FailOpen(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const simulatedResponses = [];
  await context.route("**/media/cinematic/*", async (route) => {
    const request = route.request();
    if (/\.(?:mp4|webm)(?:\?|$)/i.test(request.url())) {
      simulatedResponses.push({
        url: request.url(),
        resourceType: request.resourceType(),
        status: 404,
      });
      await route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "simulated missing cinematic media",
      });
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document.documentElement.getAttribute("data-cinematic-fallback") === "media",
    undefined,
    { timeout: 5000 },
  ).catch(() => {});
  await settle(page);
  const state = await readHomeState(page);
  const network = observer.snapshot();
  const expectedConsoleErrors = consoleErrors.filter(
    (message) => /404|Failed to load resource/i.test(message),
  );
  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) => !expectedConsoleErrors.includes(message),
  );
  const scenario = "media-fail-open/simulated-404";

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expectHomeSemantics(failures, scenario, state);
  expect(
    failures,
    state.rootMode === "static"
      && state.rootFallback === "media"
      && state.phase === "fallback"
      && state.mediaState === "failed"
      && state.interactive === "true"
      && !state.video?.srcAttribute,
    scenario,
    "media-404-fail-open",
    state,
    "clean static media fallback with dormant video and interactive ENTRY",
  );
  expect(
    failures,
    simulatedResponses.length === 1
      && simulatedResponses[0]?.status === 404
      && network.uniqueMediaPaths.length === 1,
    scenario,
    "media-404-simulation",
    { simulatedResponses, mediaPaths: network.uniqueMediaPaths },
    "one selected cinematic source receives a synthetic HTTP 404",
  );
  expect(
    failures,
    state.stage?.position === "absolute"
      && state.entry?.contentOpacity >= 0.99
      && state.entry?.pointerEvents !== "none"
      && state.horizontalOverflow <= OVERFLOW_TOLERANCE_PX,
    scenario,
    "media-404-document-flow",
    { stage: state.stage, entry: state.entry, overflow: state.horizontalOverflow },
    "bounded poster and readable ENTRY without overflow",
  );
  expect(
    failures,
    unexpectedConsoleErrors.length === 0
      && expectedConsoleErrors.length <= 1
      && network.externalRequests.length === 0,
    scenario,
    "media-404-runtime",
    { expectedConsoleErrors, unexpectedConsoleErrors, network },
    "only the expected 404 resource diagnostic and no exception loop",
  );

  await context.close();
  return {
    label: "Synthetic cinematic-media HTTP 404 fail-open",
    simulatedResponses,
    state,
    network,
    expectedConsoleErrors,
    unexpectedConsoleErrors,
  };
}

async function runUnsupportedCodecFailOpen(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  await context.addInitScript(() => {
    const nativeCanPlayType = HTMLMediaElement.prototype.canPlayType;
    window.__phase4CodecProbes = [];
    HTMLMediaElement.prototype.canPlayType = function canPlayType(type) {
      window.__phase4CodecProbes.push(type);
      if (/^video\/(?:mp4|webm)/i.test(type)) return "";
      return nativeCanPlayType.call(this, type);
    };
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document.documentElement.getAttribute("data-cinematic-fallback") === "codec",
    undefined,
    { timeout: 5000 },
  ).catch(() => {});
  await settle(page);
  const state = await readHomeState(page);
  const probes = await page.evaluate(() => window.__phase4CodecProbes ?? []);
  const network = observer.snapshot();
  const scenario = "media-fail-open/simulated-unsupported-codec";

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expectHomeSemantics(failures, scenario, state);
  expect(
    failures,
    state.rootMode === "static"
      && state.rootFallback === "codec"
      && state.phase === "fallback"
      && state.interactive === "true"
      && state.mediaSource === null
      && !state.video?.srcAttribute,
    scenario,
    "unsupported-codec-fail-open",
    { state, probes },
    "capability failure bypasses media before selecting a source",
  );
  expect(
    failures,
    probes.some((type) => /^video\/mp4/i.test(type))
      && probes.some((type) => /^video\/webm/i.test(type))
      && network.uniqueMediaPaths.length === 0
      && network.failedCinematicRequests.length === 0,
    scenario,
    "unsupported-codec-network",
    { probes, network },
    "both codec families rejected and zero cinematic media requested",
  );
  expect(
    failures,
    state.stage?.position === "absolute"
      && state.entry?.contentOpacity >= 0.99
      && state.entry?.pointerEvents !== "none"
      && state.horizontalOverflow <= OVERFLOW_TOLERANCE_PX,
    scenario,
    "unsupported-codec-document-flow",
    { stage: state.stage, entry: state.entry, overflow: state.horizontalOverflow },
    "bounded poster and readable interactive ENTRY",
  );
  expectCleanRuntime(failures, scenario, network);
  await context.close();
  return {
    label: "Synthetic HTMLMediaElement unsupported-codec capability check",
    override: "video canPlayType returns an empty string for MP4 and WebM",
    probes,
    state,
    network,
  };
}

async function readTextZoomFit(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const h1 = document.querySelector("#home-title");
    const paths = [...document.querySelectorAll(".entry-path")];
    const anchors = [h1, document.querySelector(".entry-paths")].filter(Boolean);
    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const metrics = paths.map((element) => {
      const bounds = rect(element);
      const style = getComputedStyle(element);
      return {
        text: element.textContent?.trim().replace(/\s+/g, " ") ?? "",
        rect: bounds,
        fontSize: Number.parseFloat(style.fontSize),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });
    return {
      rootFontSize: Number.parseFloat(getComputedStyle(root).fontSize),
      h1: h1
        ? {
            rect: rect(h1),
            fontSize: Number.parseFloat(getComputedStyle(h1).fontSize),
            text: h1.textContent?.trim().replace(/\s+/g, " ") ?? "",
          }
        : null,
      paths: metrics,
      anchorsFit: anchors.every((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= -3 && bounds.right <= innerWidth + 3;
      }),
      choicesReadable:
        metrics.length === 2
        && metrics.every(
          ({ rect: bounds, scrollWidth, clientWidth }) =>
            bounds.width > 0
            && bounds.height >= 44
            && scrollWidth <= clientWidth + 2,
        ),
      horizontalOverflow:
        Math.max(root.scrollWidth, document.body.scrollWidth) - innerWidth,
    };
  });
}

async function runTextZoom(browser, baseUrl, viewport, failures) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "no-preference",
  });
  await context.addInitScript(() => {
    const apply = () => {
      document.documentElement?.style.setProperty("font-size", "200%", "important");
    };
    apply();
    if (!document.documentElement) {
      const observer = new MutationObserver(() => {
        if (!document.documentElement) return;
        apply();
        observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const controllerCompleted = await waitForCinematicCompletion(page);
  let state = await readHomeState(page);
  const entryY = Math.min(
    state.maxScroll,
    Math.max(0, Math.round((state.entryTop ?? 0) - state.headerHeight)),
  );
  state = await scrollTo(page, entryY);
  const fit = await readTextZoomFit(page);
  const network = observer.snapshot();
  const scenario = "text-zoom-200/" + viewport.id;
  const authoredOutcome =
    state.rootMode === "static"
      ? "bypassed"
      : state.rootMode === "enhanced"
        ? "enhanced-fit"
        : "invalid";

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expectHomeSemantics(failures, scenario, state);
  expect(
    failures,
    controllerCompleted
      && Math.abs(fit.rootFontSize - 32) <= 0.5,
    scenario,
    "authored-text-zoom",
    { controllerCompleted, rootFontSize: fit.rootFontSize },
    "200% authored root text size applied before controller eligibility",
  );
  expect(
    failures,
    fit.anchorsFit
      && fit.choicesReadable
      && fit.horizontalOverflow <= OVERFLOW_TOLERANCE_PX
      && state.entry?.contentOpacity >= 0.99
      && state.entry?.pointerEvents !== "none",
    scenario,
    "zoom-readable-entry",
    { fit, entry: state.entry },
    "real H1 and two route choices fit without clipping or horizontal overflow",
  );
  expect(
    failures,
    (
      state.rootMode === "static"
      && state.rootFallback === "typography-fit"
      && state.stage?.position === "absolute"
      && network.uniqueMediaPaths.length === 0
    ) || (
      state.rootMode === "enhanced"
      && state.rootFallback === null
      && state.phase === "settled"
      && state.stage?.visibility === "hidden"
      && network.uniqueMediaPaths.length === 1
    ),
    scenario,
    "authored-bypass-or-fit",
    {
      outcome: authoredOutcome,
      mode: state.rootMode,
      fallback: state.rootFallback,
      phase: state.phase,
      stage: state.stage,
      mediaPaths: network.uniqueMediaPaths,
      fit,
    },
    "unsafe typography bypasses before media; enhanced mode is allowed only for a fully fitting authored layout",
  );
  expectCleanRuntime(failures, scenario, network);
  await context.close();
  return {
    viewport: viewport.id,
    authoredOutcome,
    status: response?.status() ?? null,
    controllerCompleted,
    state,
    fit,
    network,
  };
}

async function readFallbackFontEvidence(page) {
  await page.evaluate(() => document.fonts?.ready);
  return page.evaluate(() => {
    const faceRecords = [...(document.fonts ?? [])].map((face) => ({
      family: face.family,
      weight: face.weight,
      style: face.style,
      status: face.status,
    }));
    const checks = [
      { id: "syne", query: '800 32px "Syne"', text: "Quantum field" },
      { id: "newsreader", query: '400 18px "Newsreader"', text: "Industrial evidence" },
      { id: "inter", query: '600 16px "Inter"', text: "Choose your route" },
    ].map((record) => ({
      ...record,
      loaded: document.fonts?.check(record.query, record.text) ?? false,
    }));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const width = (font, text) => {
      if (!context) return null;
      context.font = font;
      return context.measureText(text).width;
    };
    const comparisons = [
      {
        id: "display",
        authored: width(
          '800 64px "Syne", "Arial Black", Arial, sans-serif',
          "WHERE DO YOU ENTER?",
        ),
        fallback: width(
          '800 64px "Arial Black", Arial, sans-serif',
          "WHERE DO YOU ENTER?",
        ),
      },
      {
        id: "body",
        authored: width(
          '400 24px "Newsreader", Georgia, "Times New Roman", serif',
          "Industrial evidence",
        ),
        fallback: width(
          '400 24px Georgia, "Times New Roman", serif',
          "Industrial evidence",
        ),
      },
      {
        id: "ui",
        authored: width(
          '600 20px "Inter", Arial, Helvetica, sans-serif',
          "Choose your route",
        ),
        fallback: width(
          "600 20px Arial, Helvetica, sans-serif",
          "Choose your route",
        ),
      },
    ].map((record) => ({
      ...record,
      difference:
        record.authored !== null && record.fallback !== null
          ? Math.abs(record.authored - record.fallback)
          : null,
    }));
    const h1 = document.querySelector("#home-title");
    const h1Rect = h1?.getBoundingClientRect();
    return {
      status: document.fonts?.status ?? null,
      faces: faceRecords,
      checks,
      comparisons,
      computedFamilies: {
        h1: h1 ? getComputedStyle(h1).fontFamily : null,
        body: getComputedStyle(document.body).fontFamily,
        route: document.querySelector(".entry-path")
          ? getComputedStyle(document.querySelector(".entry-path")).fontFamily
          : null,
      },
      h1Geometry: h1 && h1Rect
        ? {
            left: h1Rect.left,
            right: h1Rect.right,
            width: h1Rect.width,
            height: h1Rect.height,
            scrollWidth: h1.scrollWidth,
            clientWidth: h1.clientWidth,
            scrollHeight: h1.scrollHeight,
            clientHeight: h1.clientHeight,
          }
        : null,
    };
  });
}

async function runFallbackFonts(browser, baseUrl, viewport, failures) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "no-preference",
  });
  const expectedFontPaths = [
    "/fonts/syne-latin-800.woff2",
    "/fonts/newsreader-latin-400.woff2",
    "/fonts/inter-latin-400-600.woff2",
  ];
  const blockedFonts = [];
  await context.route(/\/fonts\/[^/?]+\.woff2(?:\?.*)?$/i, async (route) => {
    const request = route.request();
    blockedFonts.push({
      url: request.url(),
      path: normalizedRequestPath(request.url()),
      resourceType: request.resourceType(),
    });
    await route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleMessages.push({
        text: message.text(),
        location: message.location(),
      });
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const controllerCompleted = await waitForCinematicCompletion(page);
  const before = await readHomeState(page);
  const entryY = Math.min(
    before.maxScroll,
    Math.max(0, Math.round((before.entryTop ?? 0) - before.headerHeight)),
  );
  const state = await scrollTo(page, entryY);
  const fit = await readTextZoomFit(page);
  const fontEvidence = await readFallbackFontEvidence(page);
  const network = observer.snapshot();
  const expectedConsoleMessages = consoleMessages.filter(
    ({ text, location }) =>
      /ERR_BLOCKED_BY_CLIENT|Failed to load resource/i.test(text)
      && (
        !location?.url
        || expectedFontPaths.includes(normalizedRequestPath(location.url))
        || normalizedRequestPath(location.url).endsWith("/typography.css")
      ),
  );
  const unexpectedConsoleMessages = consoleMessages.filter(
    (message) => !expectedConsoleMessages.includes(message),
  );
  const blockedPaths = [...new Set(blockedFonts.map(({ path: fontPath }) => fontPath))];
  const failedPreferredFaces = fontEvidence.faces.filter(({ family, status }) =>
    ["syne", "newsreader", "inter"].includes(
      family.replaceAll('"', "").toLowerCase(),
    ) && status === "error");
  const authoredOutcome =
    state.rootMode === "static"
      ? "typography-fit-fallback"
      : state.rootMode === "enhanced"
        ? "enhanced-fallback-font-fit"
        : "invalid";
  const scenario = "fallback-fonts/" + viewport.id;

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expectHomeSemantics(failures, scenario, state);
  expect(
    failures,
    blockedPaths.length === 3
      && expectedFontPaths.every((fontPath) => blockedPaths.includes(fontPath))
      && blockedFonts.every(({ resourceType }) => resourceType === "font"),
    scenario,
    "font-request-block",
    { expectedFontPaths, blockedFonts, blockedPaths },
    "all three and only the three local WOFF2 families are blocked before render",
  );
  expect(
    failures,
    fontEvidence.status === "loaded"
      && failedPreferredFaces.length === 3
      && fontEvidence.checks.every(({ loaded }) => !loaded)
      && fontEvidence.comparisons.every(
        ({ difference }) => difference !== null && difference <= 0.1,
      ),
    scenario,
    "fallback-font-activation",
    { fontEvidence, failedPreferredFaces },
    "three preferred faces fail and authored stacks render identically to their local fallbacks",
  );
  expect(
    failures,
    controllerCompleted
      && (
        (
          state.rootMode === "enhanced"
          && state.rootFallback === null
          && state.phase === "settled"
          && state.stage?.visibility === "hidden"
        ) || (
          state.rootMode === "static"
          && state.rootFallback === "typography-fit"
          && state.stage?.position === "absolute"
          && state.phase === "fallback"
        )
      ),
    scenario,
    "fallback-font-portal-outcome",
    {
      controllerCompleted,
      authoredOutcome,
      mode: state.rootMode,
      fallback: state.rootFallback,
      phase: state.phase,
      stage: state.stage,
    },
    "enhanced only when fallback typography fits, otherwise clean typography-fit fail-open",
  );
  expect(
    failures,
    fit.anchorsFit
      && fit.choicesReadable
      && fit.horizontalOverflow <= OVERFLOW_TOLERANCE_PX
      && state.h1Count === 1
      && state.entry?.contentOpacity >= 0.99
      && state.entry?.pointerEvents !== "none"
      && state.nestedVerticalScrollers.length === 0
      && fontEvidence.h1Geometry
      && fontEvidence.h1Geometry.scrollWidth
        <= fontEvidence.h1Geometry.clientWidth + 2,
    scenario,
    "fallback-font-readable-entry",
    {
      fit,
      h1Count: state.h1Count,
      entry: state.entry,
      nested: state.nestedVerticalScrollers,
      h1Geometry: fontEvidence.h1Geometry,
    },
    "one readable H1 and two interactive route choices without clipping, overflow, or scroll lock",
  );
  expect(
    failures,
    pageErrors.length === 0
      && unexpectedConsoleMessages.length === 0
      && network.failedCinematicRequests.length === 0
      && network.externalRequests.length === 0,
    scenario,
    "fallback-font-runtime",
    {
      pageErrors,
      unexpectedConsoleMessages,
      expectedFontBlockConsoleMessages: expectedConsoleMessages,
      failedCinematicRequests: network.failedCinematicRequests,
      externalRequests: network.externalRequests,
    },
    "no exception or unexpected console/network failure beyond the three deliberate font blocks",
  );

  await context.close();
  return {
    viewport: viewport.id,
    label: "Local WOFF2-blocked fallback-font fit check",
    blockedBeforeNavigation: true,
    expectedFontPaths,
    blockedFonts,
    blockedPaths,
    controllerCompleted,
    authoredOutcome,
    before,
    state,
    fit,
    fontEvidence,
    console: {
      expectedFontBlockMessages: expectedConsoleMessages,
      unexpectedMessages: unexpectedConsoleMessages,
      pageErrors,
    },
    network,
  };
}

async function runPostLoadZoomFitTransition(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const controllerCompleted = await waitForCinematicCompletion(page);
  const before = await readHomeState(page);
  const beforeScale = await page.evaluate(() => ({
    visualViewportScale: window.visualViewport?.scale ?? null,
    visualViewportWidth: window.visualViewport?.width ?? null,
    visualViewportHeight: window.visualViewport?.height ?? null,
    innerWidth,
    innerHeight,
    outerWidth,
    outerHeight,
    rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  }));

  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  const transition = await page.evaluate(() => {
    const measured = {
      visualViewportScale: window.visualViewport?.scale ?? null,
      visualViewportWidth: window.visualViewport?.width ?? null,
      visualViewportHeight: window.visualViewport?.height ?? null,
      innerWidth,
      innerHeight,
      outerWidth,
      outerHeight,
      rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
    window.dispatchEvent(new Event("resize"));
    return measured;
  });
  await page.waitForFunction(
    () =>
      document.documentElement.getAttribute("data-cinematic-fallback")
        === "typography-fit",
    undefined,
    { timeout: 4000 },
  ).catch(() => {});
  await settle(page);
  const after = await readHomeState(page);
  const fit = await readTextZoomFit(page);
  const network = observer.snapshot();
  const expectedSourceAborts = network.failedCinematicRequests.filter(
    ({ error }) => /ERR_ABORTED/i.test(error),
  );
  const assertionNetwork = {
    ...network,
    failedCinematicRequests: network.failedCinematicRequests.filter(
      ({ error }) => !/ERR_ABORTED/i.test(error),
    ),
  };
  const scenario = "post-load-zoom-fit-transition";

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expect(
    failures,
    controllerCompleted
      && before.rootMode === "enhanced"
      && before.mediaState === "ready"
      && before.rootFallback === null,
    scenario,
    "pre-zoom-enhanced-state",
    {
      controllerCompleted,
      mode: before.rootMode,
      mediaState: before.mediaState,
      fallback: before.rootFallback,
    },
    "ready enhanced cinematic before the post-load scale transition",
  );
  expect(
    failures,
    beforeScale.visualViewportScale !== null
      && beforeScale.visualViewportScale < 1.75
      && transition.visualViewportScale !== null
      && transition.visualViewportScale >= 1.75
      && Math.abs(transition.rootFontSize - beforeScale.rootFontSize) <= 0.1,
    scenario,
    "cdp-visual-viewport-scale",
    { before: beforeScale, after: transition },
    "visual viewport scale crosses the unsafe threshold while root text size stays unchanged",
  );
  expect(
    failures,
    after.rootMode === "static"
      && after.rootFallback === "typography-fit"
      && after.phase === "fallback"
      && after.interactive === "true"
      && after.rootHeader === "released",
    scenario,
    "post-load-typography-fit-fail-open",
    {
      mode: after.rootMode,
      fallback: after.rootFallback,
      phase: after.phase,
      interactive: after.interactive,
      header: after.rootHeader,
    },
    {
      mode: "static",
      fallback: "typography-fit",
      phase: "fallback",
      interactive: "true",
      header: "released",
    },
  );
  expectHomeSemantics(failures, scenario, after);
  expect(
    failures,
    after.stage?.position === "absolute"
      && (after.entryTop ?? Infinity) - (after.shellTop ?? 0)
        <= after.viewport.height * 0.8 + 3
      && after.entry?.contentOpacity >= 0.99
      && after.entry?.pointerEvents !== "none"
      && !after.video?.srcAttribute
      && after.cinematicVideoCount === 1,
    scenario,
    "post-load-normal-document-flow",
    {
      stage: after.stage,
      cinematicSpan: (after.entryTop ?? 0) - (after.shellTop ?? 0),
      entry: after.entry,
      video: after.video,
      videoCount: after.cinematicVideoCount,
    },
    "bounded poster, one dormant video node, and readable interactive ENTRY",
  );
  expect(
    failures,
    fit.anchorsFit
      && fit.choicesReadable
      && fit.horizontalOverflow <= OVERFLOW_TOLERANCE_PX,
    scenario,
    "post-load-semantic-fit",
    fit,
    "H1 and both route choices remain readable in the static document",
  );
  expect(
    failures,
    network.uniqueMediaPaths.length === 1,
    scenario,
    "post-load-source-discipline",
    {
      mediaPaths: network.uniqueMediaPaths,
      expectedSourceAborts,
    },
    "the already selected source is not replaced or duplicated",
  );
  expectCleanRuntime(failures, scenario, assertionNetwork);

  await cdp.detach();
  await context.close();
  return {
    label: "Post-load CDP visual-viewport scale fit transition",
    zoomMethod: "Chrome DevTools Protocol Emulation.setPageScaleFactor",
    classification: "visual viewport scale emulation (pinch-style)",
    isRootTextScaling: false,
    isActualBrowserUiPageZoom: false,
    note:
      "This is a Chromium visual-viewport scale emulation, not root text scaling "
      + "and not Chrome UI desktop page zoom.",
    requestedPageScaleFactor: 2,
    controllerCompleted,
    beforeScale,
    transition,
    before,
    after,
    fit,
    network,
    expectedSourceAborts,
  };
}

async function runSimulatedSafariUaSourceSelection(browser, baseUrl, failures) {
  const simulatedUserAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) "
    + "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 "
    + "Mobile/15E148 Safari/604.1";
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
    userAgent: simulatedUserAgent,
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const controllerCompleted = await waitForCinematicCompletion(page);
  const state = await readHomeState(page);
  const actualUserAgent = await page.evaluate(() => navigator.userAgent);
  const network = observer.snapshot();
  const vp9Requests = network.uniqueMediaPaths.filter(
    (requestPath) => /vp9|\.webm$/i.test(requestPath),
  );
  const scenario = "simulated-safari-ios-ua-source-selection";

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expect(
    failures,
    controllerCompleted
      && state.rootMode === "enhanced"
      && state.mediaState === "ready",
    scenario,
    "simulated-ua-prerequisite",
    {
      controllerCompleted,
      mode: state.rootMode,
      mediaState: state.mediaState,
    },
    "ready enhanced Home in Chromium with an overridden UA",
  );
  expect(
    failures,
    actualUserAgent === simulatedUserAgent
      && state.mediaFamily === "mobile"
      && state.mediaCodec === "h264"
      && /mobile-h264.*\.mp4$/i.test(state.mediaSource ?? ""),
    scenario,
    "h264-selection",
    {
      actualUserAgent,
      family: state.mediaFamily,
      codec: state.mediaCodec,
      source: state.mediaSource,
    },
    {
      simulatedUaApplied: true,
      family: "mobile",
      codec: "h264",
      source: "mobile H.264 MP4",
    },
  );
  expect(
    failures,
    network.uniqueMediaPaths.length === 1
      && /mobile-h264.*\.mp4$/i.test(network.uniqueMediaPaths[0] ?? "")
      && vp9Requests.length === 0,
    scenario,
    "no-vp9-request",
    {
      mediaPaths: network.uniqueMediaPaths,
      vp9Requests,
    },
    "one mobile H.264 request and zero VP9/WebM requests",
  );
  expectCleanRuntime(failures, scenario, network);

  await context.close();
  return {
    label: "Simulated Safari/iOS user-agent source-selection check",
    engineUnderTest: "Chromium",
    isSafariEngineTest: false,
    note:
      "This validates user-agent-driven source selection only; "
      + "it is not a Safari or WebKit engine test.",
    simulatedUserAgent,
    actualUserAgent,
    controllerCompleted,
    state,
    network,
    vp9Requests,
  };
}

function compactAxeViolations(violations) {
  return violations.map(({ id, impact, help, helpUrl, tags, nodes }) => ({
    id,
    impact,
    help,
    helpUrl,
    tags,
    nodes: nodes.slice(0, 8).map(({ target, failureSummary }) => ({
      target,
      failureSummary,
    })),
  }));
}

async function runAxeScan(page) {
  await page.addScriptTag({ content: axeCore.source });
  return page.evaluate(async () => {
    const result = await window.axe.run(document.documentElement, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
      resultTypes: ["violations"],
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      helpUrl: violation.helpUrl,
      tags: violation.tags,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    }));
  });
}

async function readFocusEvidence(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    const rect = element instanceof HTMLElement
      ? element.getBoundingClientRect()
      : null;
    const style = element instanceof HTMLElement
      ? getComputedStyle(element)
      : null;
    const header = document.querySelector(".site-header");
    const headerInner = document.querySelector(".site-header__inner");
    const entry = document.querySelector("#entry");
    const entryContent = document.querySelector(".entry-field__content");
    const stage = document.querySelector("[data-cinematic-stage]");
    let hit = null;
    let unobscured = false;
    if (
      element instanceof HTMLElement
      && rect
      && rect.width > 0
      && rect.height > 0
      && rect.bottom > 0
      && rect.top < innerHeight
    ) {
      const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
      const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
      hit = document.elementFromPoint(x, y);
      unobscured = Boolean(
        hit
        && (
          element === hit
          || element.contains(hit)
          || hit.contains(element)
        )
      );
    }
    return {
      tag: element?.tagName?.toLowerCase() ?? null,
      id: element?.id ?? null,
      className: String(element?.className ?? ""),
      href: element?.getAttribute?.("href") ?? null,
      text: element?.textContent?.trim().replace(/\s+/g, " ") ?? "",
      focusVisible:
        element instanceof HTMLElement
          ? element.matches(":focus-visible")
          : false,
      outlineStyle: style?.outlineStyle ?? null,
      outlineWidth: style?.outlineWidth ?? null,
      rect: rect
        ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
        : null,
      inViewport: Boolean(
        rect
        && rect.width > 0
        && rect.height > 0
        && rect.left >= -1
        && rect.right <= innerWidth + 1
        && rect.top >= -1
        && rect.bottom <= innerHeight + 1
      ),
      unobscured,
      hit: hit
        ? {
            tag: hit.tagName.toLowerCase(),
            id: hit.id,
            className: String(hit.className),
          }
        : null,
      inHeader: Boolean(
        element instanceof Node
        && header?.contains(element)
      ),
      inEntry: Boolean(
        element instanceof Node
        && entry?.contains(element)
      ),
      headerInnerOpacity: headerInner
        ? Number.parseFloat(getComputedStyle(headerInner).opacity)
        : null,
      entryContentOpacity: entryContent
        ? Number.parseFloat(getComputedStyle(entryContent).opacity)
        : null,
      stageVisibility: stage ? getComputedStyle(stage).visibility : null,
      rootFocus: document.documentElement.getAttribute("data-cinematic-focus"),
    };
  });
}

async function readTargetSizes(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const closedDetails = element.closest("details:not([open])");
      const summary = closedDetails?.querySelector(":scope > summary");
      if (closedDetails && element !== summary && !summary?.contains(element)) return false;
      return (
        style.display !== "none"
        && style.visibility !== "hidden"
        && Number.parseFloat(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0
      );
    };
    const controls = [
      ...document.querySelectorAll(
        "a[href], button, summary, input:not([type=hidden]), select, textarea, [role=button], [role=link]",
      ),
    ]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.className),
          href: element.getAttribute("href"),
          label:
            (
              element.getAttribute("aria-label")
              || element.textContent
              || element.tagName
            )
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 100),
          width: rect.width,
          height: rect.height,
        };
      });
    return {
      count: controls.length,
      undersized: controls.filter(
        ({ width, height }) => width < 43.5 || height < 43.5,
      ),
      controls,
    };
  });
}

function focusPasses(focus) {
  return (
    focus.focusVisible
    && focus.outlineStyle !== "none"
    && Number.parseFloat(focus.outlineWidth ?? "0") >= 2
    && focus.inViewport
    && focus.unobscured
  );
}

async function readMethodEligibility(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const method = document.querySelector("[data-method-section]");
    const experience = document.querySelector("[data-method-experience]");
    const workpiece = document.querySelector("[data-method-workpiece]");
    const stages = [...document.querySelectorAll("[data-method-stage]")];
    const workpieceStyle = workpiece ? getComputedStyle(workpiece) : null;
    const methodStyle = method ? getComputedStyle(method) : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      rootFontSize: Number.parseFloat(getComputedStyle(root).fontSize),
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      operatingField: root.getAttribute("data-operating-field"),
      cinematicMode: root.getAttribute("data-cinematic-mode"),
      methodSticky: method?.getAttribute("data-method-sticky") ?? null,
      workpiecePosition: workpieceStyle?.position ?? null,
      workpieceTop: workpieceStyle?.top ?? null,
      methodProgress: methodStyle?.getPropertyValue("--method-progress").trim() || null,
      methodRect: method
        ? {
            top: method.getBoundingClientRect().top,
            height: method.getBoundingClientRect().height,
          }
        : null,
      experienceHeight: experience?.getBoundingClientRect().height ?? null,
      workpieceHeight: workpiece?.getBoundingClientRect().height ?? null,
      stageHeights: stages.map((stage) => stage.getBoundingClientRect().height),
      horizontalOverflow:
        Math.max(root.scrollWidth, body?.scrollWidth ?? 0) - innerWidth,
    };
  });
}

async function runMethodEligibilityMatrix(browser, baseUrl, failures) {
  const definitions = [
    {
      id: "desktop-1440x900-sticky",
      viewport: { width: 1440, height: 900 },
      expectedOperatingField: "enhanced",
      expectedSticky: true,
    },
    {
      id: "desktop-1280x800-sticky",
      viewport: { width: 1280, height: 800 },
      expectedOperatingField: "enhanced",
      expectedSticky: true,
    },
    {
      id: "short-desktop-1366x650-normal",
      viewport: { width: 1366, height: 650 },
      expectedOperatingField: "enhanced",
      expectedSticky: false,
    },
    {
      id: "tablet-1024x768-normal",
      viewport: { width: 1024, height: 768 },
      expectedOperatingField: "enhanced",
      expectedSticky: false,
    },
    {
      id: "desktop-1440x900-root-text-200-normal",
      viewport: { width: 1440, height: 900 },
      rootTextScale: 2,
      expectedOperatingField: "enhanced",
      expectedSticky: false,
    },
    {
      id: "desktop-1440x900-reduced-motion-normal",
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
      expectedOperatingField: null,
      expectedSticky: false,
    },
  ];
  const cases = [];

  for (const definition of definitions) {
    const context = await browser.newContext({
      viewport: definition.viewport,
      reducedMotion: definition.reducedMotion ?? "no-preference",
    });
    if (definition.rootTextScale) {
      await context.addInitScript((scale) => {
        const apply = () => {
          document.documentElement?.style.setProperty(
            "font-size",
            `${scale * 100}%`,
            "important",
          );
        };
        apply();
        if (!document.documentElement) {
          const observer = new MutationObserver(() => {
            if (!document.documentElement) return;
            apply();
            observer.disconnect();
          });
          observer.observe(document, { childList: true, subtree: true });
        }
      }, definition.rootTextScale);
    }
    const page = await context.newPage();
    const observer = observePage(page, baseUrl);
    const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
    await waitForCinematicCompletion(page);
    if (definition.reducedMotion !== "reduce") {
      await page.waitForFunction(
        () => document.querySelector("[data-method-section]")?.hasAttribute("data-method-sticky"),
        undefined,
        { timeout: 4000 },
      ).catch(() => {});
    }
    await settle(page);
    const methodTop = await page.locator("#method").evaluate(
      (element) => element.getBoundingClientRect().top + scrollY,
    );
    const initialState = await readHomeState(page);
    await scrollTo(
      page,
      Math.min(initialState.maxScroll, Math.round(methodTop + 220)),
    );
    const measured = await readMethodEligibility(page);
    const network = observer.snapshot();
    const scenario = "method-eligibility/" + definition.id;
    const expectedPosition = definition.expectedSticky ? "sticky" : "not sticky";

    expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
    expect(
      failures,
      measured.operatingField === definition.expectedOperatingField,
      scenario,
      "operating-field-eligibility",
      measured.operatingField,
      definition.expectedOperatingField,
    );
    expect(
      failures,
      measured.methodSticky === String(definition.expectedSticky)
        || (!definition.expectedSticky
          && definition.reducedMotion === "reduce"
          && measured.methodSticky === null),
      scenario,
      "method-sticky-attribute",
      measured.methodSticky,
      definition.reducedMotion === "reduce" ? "false or absent" : String(definition.expectedSticky),
    );
    expect(
      failures,
      definition.expectedSticky
        ? measured.workpiecePosition === "sticky" && measured.methodProgress !== null
        : measured.workpiecePosition !== "sticky" && measured.methodProgress === null,
      scenario,
      "method-layout-mode",
      {
        position: measured.workpiecePosition,
        progress: measured.methodProgress,
        rootFontSize: measured.rootFontSize,
      },
      expectedPosition + " with matching authored progress state",
    );
    expect(
      failures,
      measured.horizontalOverflow <= OVERFLOW_TOLERANCE_PX,
      scenario,
      "horizontal-overflow",
      measured.horizontalOverflow,
      "<= " + OVERFLOW_TOLERANCE_PX + "px",
    );
    expectCleanRuntime(failures, scenario, network);
    cases.push({
      ...definition,
      status: response?.status() ?? null,
      measured,
      network,
    });
    await context.close();
  }

  const deepIntegrity = [];
  for (const viewport of [
    { id: "desktop-1440x900", width: 1440, height: 900 },
    { id: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    const observer = observePage(page, baseUrl);
    const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
    const controllerCompleted = await waitForCinematicCompletion(page);
    const geometry = await page.evaluate(() => {
      const absolute = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top + scrollY,
          bottom: rect.bottom + scrollY,
          height: rect.height,
        };
      };
      return {
        chapters: [...document.querySelectorAll("[data-home-scene]")].map((element) => ({
          id: element.getAttribute("data-home-scene"),
          ...absolute(element),
        })),
        proof: absolute(document.querySelector("#proof")),
        conversion: absolute(document.querySelector("#conversion")),
        footer: absolute(document.querySelector(".site-footer")),
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      };
    });
    const proofTarget = Math.min(
      Math.max(0, geometry.scrollHeight - viewport.height),
      Math.round((geometry.proof?.top ?? 0) + 100),
    );
    const proofState = await scrollTo(page, proofTarget);
    const proofView = await readHashTarget(page, "#proof");
    const bottomState = await scrollTo(page, proofState.maxScroll);
    const bottom = await page.evaluate(() => {
      const footer = document.querySelector(".site-footer");
      const rect = footer?.getBoundingClientRect();
      const root = document.documentElement;
      const bodyStyle = getComputedStyle(document.body);
      const rootStyle = getComputedStyle(root);
      return {
        footer: rect
          ? {
              top: rect.top,
              bottom: rect.bottom,
              height: rect.height,
              absoluteBottom: rect.bottom + scrollY,
            }
          : null,
        scrollY,
        maxScroll: Math.max(0, root.scrollHeight - innerHeight),
        scrollHeight: root.scrollHeight,
        rootOverflowY: rootStyle.overflowY,
        bodyOverflowY: bodyStyle.overflowY,
        bodyPosition: bodyStyle.position,
      };
    });
    const network = observer.snapshot();
    const scenario = "deep-proof-footer/" + viewport.id;
    const ordered = geometry.chapters.every(
      (chapter, index, chapters) =>
        index === 0 || chapter.top >= chapters[index - 1].bottom - 2,
    );

    expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
    expect(
      failures,
      controllerCompleted
        && geometry.chapters.map(({ id }) => id).join("|") === CHAPTERS.join("|")
        && ordered
        && geometry.proof?.top > geometry.chapters[0].bottom
        && geometry.footer?.top >= geometry.chapters.at(-1).bottom - 2,
      scenario,
      "global-document-order",
      geometry,
      "all seven chapters, PROOF, conversion and footer retain increasing document geometry",
    );
    expect(
      failures,
      proofState.phase === "settled"
        && proofState.rootHeader === "released"
        && proofState.stage?.visibility === "hidden"
        && proofView.exists
        && proofView.bottom > 0,
      scenario,
      "deep-proof-state",
      { proofTarget, proofState, proofView },
      "deep PROOF remains in the normal settled document",
    );
    expect(
      failures,
      Math.abs(bottom.scrollY - bottom.maxScroll) <= 2
        && bottom.footer?.top < viewport.height
        && bottom.footer?.bottom > 0
        && bottom.footer?.absoluteBottom <= bottom.scrollHeight + 2
        && bottomState.nestedVerticalScrollers.length === 0
        && bottomState.horizontalOverflow <= OVERFLOW_TOLERANCE_PX
        && bottom.bodyPosition !== "fixed",
      scenario,
      "footer-global-height-integrity",
      { bottom, bottomState },
      "root scroll reaches a visible footer with no nested scroller, lock, clipping or overflow",
    );
    expectCleanRuntime(failures, scenario, network);
    deepIntegrity.push({
      viewport: viewport.id,
      controllerCompleted,
      geometry,
      proofTarget,
      proofState,
      proofView,
      bottomState,
      bottom,
      network,
    });
    await context.close();
  }

  return {
    label: "METHOD sticky eligibility and deep PROOF/footer document integrity",
    cases,
    deepIntegrity,
  };
}

async function runMobileTouchInput(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() => {
    window.__phase4TouchEvidence = {
      scrollEvents: [],
      touchEvents: [],
    };
    addEventListener("scroll", () => {
      window.__phase4TouchEvidence.scrollEvents.push({
        y: scrollY,
        at: performance.now(),
      });
    }, { passive: true });
    for (const type of ["touchstart", "touchmove", "touchend"]) {
      addEventListener(type, (event) => {
        window.__phase4TouchEvidence.touchEvents.push({
          type,
          touches: event.touches.length,
          y: scrollY,
          at: performance.now(),
        });
      }, { passive: true });
    }
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const controllerCompleted = await waitForCinematicCompletion(page);
  const before = await readHomeState(page);
  const cdp = await context.newCDPSession(page);
  let dispatched = false;
  let dispatchError = null;
  let release = before;
  let after = before;
  let media = null;
  try {
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    const x = 195;
    const startY = 720;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: startY, radiusX: 8, radiusY: 8, force: 1 }],
    });
    for (let index = 1; index <= 11; index += 1) {
      const y = Math.round(startY - index * 49);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1 }],
      });
      await new Promise((resolve) => setTimeout(resolve, 18));
    }
    release = await readHomeState(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    dispatched = true;
    await new Promise((resolve) => setTimeout(resolve, 500));
    await settle(page);
    after = await readHomeState(page);
    media = await waitForMediaTarget(page);
  } catch (error) {
    dispatchError = error instanceof Error ? error.message : String(error);
  }
  const evidence = await page.evaluate(() => ({
    trace: window.__phase4TouchEvidence,
    root: {
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
      overflowY: getComputedStyle(document.documentElement).overflowY,
    },
    body: {
      position: getComputedStyle(document.body).position,
      overflowY: getComputedStyle(document.body).overflowY,
    },
  }));
  const network = observer.snapshot();
  const executed = dispatched && after.scrollY > before.scrollY + 80;
  const syntheticContinuationPx = executed ? after.scrollY - release.scrollY : null;
  const syntheticContinuationObserved =
    syntheticContinuationPx !== null && syntheticContinuationPx > 5;
  const scenario = "mobile-touch-input/cdp-synthetic";
  let passed = null;
  if (executed) {
    passed =
      controllerCompleted
      && after.rootMode === "enhanced"
      && after.scrollProgress > before.scrollProgress
      && after.targetFrame > before.targetFrame
      && after.nestedVerticalScrollers.length === 0
      && after.horizontalOverflow <= OVERFLOW_TOLERANCE_PX
      && evidence.body.position !== "fixed"
      && media?.synchronized;
    expect(
      failures,
      passed,
      scenario,
      "touch-document-progression",
      { before, release, after, media, evidence },
      "CDP touch gesture advances the native root document and cinematic latest state without a lock",
    );
    expectCleanRuntime(failures, scenario, network);
  }
  await cdp.detach();
  await context.close();
  return {
    label: "Synthetic Chromium CDP touch-input check",
    isPhysicalTouchHardwareTest: false,
    mechanism: "CDP Input.dispatchTouchEvent (no scrollTo in the gesture)",
    executed,
    passed,
    dispatchError,
    limitation: executed
      ? null
      : "This headless Chromium run did not produce reliable native document movement from synthetic CDP touch input.",
    syntheticContinuation: {
      observed: syntheticContinuationObserved,
      observedContinuationPx: syntheticContinuationPx,
      note:
        "Any post-release movement is evidence from Chromium's synthetic CDP input path only.",
    },
    momentum: {
      executed: false,
      passed: null,
      observedSyntheticContinuationPx: syntheticContinuationPx,
      limitation:
        "Physical touch/trackpad kinetic momentum was not executed; "
        + "synthetic CDP continuation is not treated as hardware momentum proof.",
    },
    before,
    release,
    after,
    media,
    evidence,
    network,
    status: response?.status() ?? null,
  };
}

async function runColdLoadEvidence(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    const selectorFor = (element) => {
      if (!(element instanceof Element)) return null;
      if (element.id) return "#" + element.id;
      const classes = String(element.className).trim().split(/\s+/).slice(0, 2);
      return element.tagName.toLowerCase()
        + (classes[0] ? "." + classes.join(".") : "");
    };
    window.__phase4ColdLoad = {
      domContentLoaded: null,
      mediaReadyAt: null,
      largestContentfulPaint: [],
      observerErrors: [],
    };
    document.addEventListener("DOMContentLoaded", () => {
      const shell = document.querySelector("[data-cinematic-shell]");
      window.__phase4ColdLoad.domContentLoaded = {
        at: performance.now(),
        h1Count: document.querySelectorAll("h1").length,
        h1Text:
          document.querySelector("h1")?.textContent?.trim().replace(/\s+/g, " ")
          ?? null,
        mediaState: shell?.getAttribute("data-media-state") ?? null,
      };
    });
    const mutationObserver = new MutationObserver(() => {
      if (window.__phase4ColdLoad.mediaReadyAt !== null) return;
      const shell = document.querySelector("[data-cinematic-shell]");
      if (shell?.getAttribute("data-media-state") === "ready") {
        window.__phase4ColdLoad.mediaReadyAt = performance.now();
      }
    });
    mutationObserver.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-media-state"],
    });
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__phase4ColdLoad.largestContentfulPaint.push({
            startTime: entry.startTime,
            renderTime: entry.renderTime,
            loadTime: entry.loadTime,
            size: entry.size,
            url: entry.url,
            element: selectorFor(entry.element),
            text:
              entry.element?.textContent?.trim().replace(/\s+/g, " ").slice(0, 120)
              ?? null,
          });
        }
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      window.__phase4LcpObserver = observer;
    } catch (error) {
      window.__phase4ColdLoad.observerErrors.push(String(error));
    }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const responseHtml = response ? await response.text() : "";
  const controllerCompleted = await waitForCinematicCompletion(page);
  await page.waitForTimeout(250);
  const state = await readHomeState(page);
  const evidence = await page.evaluate(() => {
    window.__phase4LcpObserver?.disconnect();
    const navigation = performance.getEntriesByType("navigation")[0];
    const paints = performance.getEntriesByType("paint").map((entry) => ({
      name: entry.name,
      startTime: entry.startTime,
      duration: entry.duration,
    }));
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: entry.startTime,
      responseEnd: entry.responseEnd,
      duration: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }));
    const poster = document.querySelector("[data-cinematic-poster] img");
    return {
      timeline: window.__phase4ColdLoad,
      navigation: navigation
        ? {
            startTime: navigation.startTime,
            responseStart: navigation.responseStart,
            responseEnd: navigation.responseEnd,
            domInteractive: navigation.domInteractive,
            domContentLoadedEventStart: navigation.domContentLoadedEventStart,
            domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
            loadEventEnd: navigation.loadEventEnd,
            transferSize: navigation.transferSize,
            encodedBodySize: navigation.encodedBodySize,
          }
        : null,
      paints,
      resources,
      poster: poster
        ? {
            complete: poster.complete,
            naturalWidth: poster.naturalWidth,
            naturalHeight: poster.naturalHeight,
            currentSrc: poster.currentSrc,
            fetchPriority: poster.fetchPriority,
          }
        : null,
    };
  });
  const posterResource = evidence.resources.find(({ name }) =>
    normalizedRequestPath(name).includes("/media/cinematic/phase-3-dormant-desktop-"));
  const mediaResources = evidence.resources.filter(({ name }) =>
    /\/media\/cinematic\/.*\.(?:mp4|webm)$/i.test(normalizedRequestPath(name)));
  const firstContentfulPaint = evidence.paints.find(
    ({ name }) => name === "first-contentful-paint",
  );
  const lcpCandidates = evidence.timeline.largestContentfulPaint;
  const network = observer.snapshot();
  const scenario = "cold-load";

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expect(
    failures,
    responseHtml.includes('id="home-title"')
      && responseHtml.includes("data-cinematic-media")
      && evidence.timeline.domContentLoaded?.h1Count === 1
      && evidence.timeline.domContentLoaded?.h1Text?.toUpperCase()
        === "WHERE DO YOU ENTER?",
    scenario,
    "ssr-semantic-first",
    {
      responseContainsH1: responseHtml.includes('id="home-title"'),
      responseContainsVideoShell: responseHtml.includes("data-cinematic-media"),
      domContentLoaded: evidence.timeline.domContentLoaded,
    },
    "SSR response and DOMContentLoaded contain the real semantic H1 independent of media readiness",
  );
  expect(
    failures,
    controllerCompleted
      && state.mediaState === "ready"
      && evidence.timeline.mediaReadyAt !== null
      && evidence.navigation?.domContentLoadedEventEnd > 0,
    scenario,
    "cold-controller-timeline",
    {
      controllerCompleted,
      mediaState: state.mediaState,
      mediaReadyAt: evidence.timeline.mediaReadyAt,
      navigation: evidence.navigation,
    },
    "DOMContentLoaded and media readiness are separately timestamped",
  );
  expect(
    failures,
    evidence.poster?.complete
      && evidence.poster.naturalWidth > 0
      && evidence.poster.naturalHeight > 0
      && posterResource
      && posterResource.encodedBodySize > 0
      && posterResource.transferSize > 0,
    scenario,
    "cold-poster-readiness",
    { poster: evidence.poster, resource: posterResource },
    "eager desktop poster decodes and transfers on a cache-disabled fresh context",
  );
  expect(
    failures,
    firstContentfulPaint?.startTime > 0
      && lcpCandidates.length > 0
      && evidence.timeline.observerErrors.length === 0,
    scenario,
    "cold-paint-evidence",
    {
      firstContentfulPaint,
      lcpCandidates,
      observerErrors: evidence.timeline.observerErrors,
    },
    "FCP and at least one LCP candidate are observed",
  );
  expect(
    failures,
    network.uniqueMediaPaths.length === 1
      && mediaResources.length >= 1
      && state.h1Count === 1,
    scenario,
    "cold-media-discipline",
    {
      mediaRequestPaths: network.uniqueMediaPaths,
      mediaResources,
      h1Count: state.h1Count,
    },
    "one selected cinematic asset without gating semantic DOM",
  );
  expectCleanRuntime(failures, scenario, network);

  await cdp.detach();
  await context.close();
  return {
    label: "Cache-disabled fresh Chromium context cold-load evidence",
    cacheDisabled: true,
    response: {
      status: response?.status() ?? null,
      ssrH1Present: responseHtml.includes('id="home-title"'),
      inertVideoShellPresent: responseHtml.includes("data-cinematic-media"),
    },
    controllerCompleted,
    state,
    evidence,
    firstContentfulPaint,
    lcpCandidates,
    posterResource,
    mediaResources,
    network,
  };
}

async function readDeliverySnapshot(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector("[data-cinematic-shell]");
    const poster = document.querySelector("[data-cinematic-poster] img");
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: entry.startTime,
      responseEnd: entry.responseEnd,
      duration: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }));
    const loaders = [...document.querySelectorAll(
      "[aria-busy=true], [role=progressbar], .loader, .loading",
    )].map((element) => ({
      tag: element.tagName.toLowerCase(),
      className: String(element.className),
      role: element.getAttribute("role"),
    }));
    const navigation = performance.getEntriesByType("navigation")[0];
    return {
      dcl: window.__phase4Delivery?.domContentLoaded ?? null,
      timeline: window.__phase4Delivery ?? null,
      navigation: navigation
        ? {
            responseStart: navigation.responseStart,
            responseEnd: navigation.responseEnd,
            domInteractive: navigation.domInteractive,
            domContentLoadedEventStart: navigation.domContentLoadedEventStart,
            domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
            loadEventEnd: navigation.loadEventEnd,
            transferSize: navigation.transferSize,
            encodedBodySize: navigation.encodedBodySize,
          }
        : null,
      h1Count: document.querySelectorAll("h1").length,
      h1Text: document.querySelector("h1")?.textContent?.trim().replace(/\s+/g, " ") ?? null,
      loaderCount: loaders.length,
      loaders,
      shellCount: document.querySelectorAll("[data-cinematic-shell]").length,
      posterCount: document.querySelectorAll("[data-cinematic-poster]").length,
      videoCount: document.querySelectorAll("[data-cinematic-media]").length,
      mediaState: shell?.getAttribute("data-media-state") ?? null,
      mediaSource: shell?.getAttribute("data-media-source") ?? null,
      rootMode: root.getAttribute("data-cinematic-mode"),
      rootFallback: root.getAttribute("data-cinematic-fallback"),
      poster: poster
        ? {
            complete: poster.complete,
            naturalWidth: poster.naturalWidth,
            naturalHeight: poster.naturalHeight,
            currentSrc: poster.currentSrc,
          }
        : null,
      resources,
    };
  });
}

async function runWarmCacheEvidence(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    window.__phase4Delivery = {
      domContentLoaded: null,
      mediaReadyAt: null,
    };
    document.addEventListener("DOMContentLoaded", () => {
      const shell = document.querySelector("[data-cinematic-shell]");
      window.__phase4Delivery.domContentLoaded = {
        at: performance.now(),
        h1Count: document.querySelectorAll("h1").length,
        h1Text: document.querySelector("h1")?.textContent?.trim().replace(/\s+/g, " ") ?? null,
        shellCount: document.querySelectorAll("[data-cinematic-shell]").length,
        posterCount: document.querySelectorAll("[data-cinematic-poster]").length,
        videoCount: document.querySelectorAll("[data-cinematic-media]").length,
        loaderCount: document.querySelectorAll(
          "[aria-busy=true], [role=progressbar], .loader, .loading",
        ).length,
        mediaState: shell?.getAttribute("data-media-state") ?? null,
      };
    });
    const observer = new MutationObserver(() => {
      if (window.__phase4Delivery.mediaReadyAt !== null) return;
      const shell = document.querySelector("[data-cinematic-shell]");
      if (shell?.getAttribute("data-media-state") === "ready") {
        window.__phase4Delivery.mediaReadyAt = performance.now();
      }
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-media-state"],
    });
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });

  let phase = "prime";
  const records = { prime: [], warm: [] };
  const byRequestId = new Map();
  cdp.on("Network.requestWillBeSent", (event) => {
    if (!normalizedRequestPath(event.request.url).includes("/media/cinematic/")) return;
    const record = {
      phase,
      requestId: event.requestId,
      url: event.request.url,
      path: normalizedRequestPath(event.request.url),
      method: event.request.method,
      requestHeaders: event.request.headers,
      servedFromCache: false,
      response: null,
      encodedDataLength: null,
    };
    records[phase].push(record);
    byRequestId.set(event.requestId, record);
  });
  cdp.on("Network.requestServedFromCache", ({ requestId }) => {
    const record = byRequestId.get(requestId);
    if (record) record.servedFromCache = true;
  });
  cdp.on("Network.responseReceived", (event) => {
    const record = byRequestId.get(event.requestId);
    if (!record) return;
    record.response = {
      status: event.response.status,
      mimeType: event.response.mimeType,
      fromDiskCache: event.response.fromDiskCache,
      fromPrefetchCache: event.response.fromPrefetchCache,
      fromServiceWorker: event.response.fromServiceWorker,
      protocol: event.response.protocol,
      cacheControl:
        event.response.headers["cache-control"]
        ?? event.response.headers["Cache-Control"]
        ?? null,
    };
  });
  cdp.on("Network.loadingFinished", (event) => {
    const record = byRequestId.get(event.requestId);
    if (record) record.encodedDataLength = event.encodedDataLength;
  });

  const primeResponse = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const primeCompleted = await waitForCinematicCompletion(page);
  await page.waitForTimeout(200);
  const primeState = await readHomeState(page);
  const primeSnapshot = await readDeliverySnapshot(page);

  phase = "warm";
  const warmResponse = await page.reload({ waitUntil: "domcontentloaded" });
  const warmImmediate = await readDeliverySnapshot(page);
  const warmCompleted = await waitForCinematicCompletion(page);
  await page.waitForTimeout(200);
  const warmState = await readHomeState(page);
  const warmSnapshot = await readDeliverySnapshot(page);
  const network = observer.snapshot();
  const assertionNetwork = withoutNavigationAborts(network);
  const scenario = "warm-cache-reload";
  const posterPath = "/media/cinematic/phase-3-dormant-desktop-03f5490ab11a.png";
  const warmPosterRecords = records.warm.filter(({ path }) => path === posterPath);
  const warmPosterResource = warmSnapshot.resources.find(
    ({ name }) => normalizedRequestPath(name) === posterPath,
  );
  const warmVideoRecords = records.warm.filter(({ path }) => /\.(?:mp4|webm)$/i.test(path));
  const warmVideoResources = warmSnapshot.resources.filter(
    ({ name }) => /\/media\/cinematic\/.*\.(?:mp4|webm)$/i.test(normalizedRequestPath(name)),
  );
  const warmPosterCacheHit =
    warmPosterRecords.some((record) =>
      record.servedFromCache || record.response?.fromDiskCache)
    || (
      warmPosterResource
      && warmPosterResource.transferSize === 0
      && warmPosterResource.encodedBodySize > 0
    );
  const warmVideoPaths = [...new Set(warmVideoRecords.map(({ path }) => path))];
  const primeMediaCachePolicy = records.prime
    .filter(({ path }) => path.includes("/media/cinematic/"))
    .map(({ path, response }) => ({ path, cacheControl: response?.cacheControl ?? null }));

  expect(failures, primeResponse?.status() === 200, scenario, "prime-http", primeResponse?.status(), 200);
  expect(failures, warmResponse?.status() === 200, scenario, "warm-http", warmResponse?.status(), 200);
  expect(
    failures,
    primeCompleted
      && warmCompleted
      && primeState.mediaState === "ready"
      && warmState.mediaState === "ready",
    scenario,
    "same-context-controller",
    {
      primeCompleted,
      warmCompleted,
      primeMediaState: primeState.mediaState,
      warmMediaState: warmState.mediaState,
    },
    "prime and same-context warm reload both reach ready",
  );
  expect(
    failures,
    warmImmediate.dcl?.h1Count === 1
      && warmImmediate.dcl?.h1Text?.toUpperCase() === "WHERE DO YOU ENTER?"
      && warmImmediate.dcl?.shellCount === 1
      && warmImmediate.dcl?.posterCount === 1
      && warmImmediate.dcl?.videoCount === 1
      && warmImmediate.dcl?.loaderCount === 0,
    scenario,
    "warm-semantic-dom-immediate",
    warmImmediate.dcl,
    "one SSR H1, shell, poster and inert video with no loader at DOMContentLoaded",
  );
  expect(
    failures,
    primeMediaCachePolicy.length >= 2
      && primeMediaCachePolicy.every(({ cacheControl }) =>
        /public/i.test(cacheControl ?? "")
        && /max-age=31556952/i.test(cacheControl ?? "")
        && /immutable/i.test(cacheControl ?? ""))
      && warmPosterCacheHit,
    scenario,
    "warm-poster-cache",
    {
      primeMediaCachePolicy,
      warmPosterCacheHit,
      records: warmPosterRecords,
      resource: warmPosterResource,
    },
    "desktop poster is reused from browser cache under the production immutable media policy",
  );
  expect(
    failures,
    warmState.cinematicVideoCount === 1
      && warmState.totalVideoCount === 1
      && network.uniqueMediaPaths.length === 1
      && warmVideoPaths.length <= 1
      && warmVideoResources.length <= 1
      && warmState.mediaSource === primeState.mediaSource,
    scenario,
    "warm-source-loader-discipline",
    {
      primeSource: primeState.mediaSource,
      warmSource: warmState.mediaSource,
      allMediaPaths: network.uniqueMediaPaths,
      warmVideoPaths,
      warmVideoRecords,
      warmVideoResources,
      loaderCount: warmSnapshot.loaderCount,
    },
    "same selected video source, one video node, at most one warm video transfer entry and no loader",
  );
  expect(
    failures,
    warmSnapshot.poster?.complete
      && warmSnapshot.poster.naturalWidth > 0
      && warmSnapshot.loaderCount === 0
      && warmState.h1Count === 1,
    scenario,
    "warm-ready-document",
    { snapshot: warmSnapshot, state: warmState },
    "decoded poster and semantic Home remain available without a loader",
  );
  expectCleanRuntime(failures, scenario, assertionNetwork);

  await cdp.detach();
  await context.close();
  return {
    label: "Same-context warm reload under production cinematic-media cache policy",
    cachePolicy: {
      source: "public/_headers /media/cinematic/*",
      value: "public, max-age=31556952, immutable",
      qaPreviewMirrorsProductionHeader: true,
      note:
        "The QA-only dist server mirrors the checked-in production media header; all other local responses remain no-store.",
    },
    prime: {
      status: primeResponse?.status() ?? null,
      controllerCompleted: primeCompleted,
      state: primeState,
      snapshot: primeSnapshot,
      deliveryRecords: records.prime,
    },
    warm: {
      status: warmResponse?.status() ?? null,
      controllerCompleted: warmCompleted,
      immediate: warmImmediate,
      state: warmState,
      snapshot: warmSnapshot,
      deliveryRecords: records.warm,
      posterCacheHit: warmPosterCacheHit,
      posterRecord: warmPosterRecords,
      posterResource: warmPosterResource,
      videoPaths: warmVideoPaths,
      videoRecords: warmVideoRecords,
      videoResources: warmVideoResources,
    },
    primeMediaCachePolicy,
    network,
    expectedNavigationAborts: network.failedCinematicRequests.filter(
      ({ error }) => /ERR_ABORTED/i.test(error),
    ),
  };
}

async function runThrottledConnectionEvidence(browser, baseUrl, failures) {
  const profile = {
    label: "bounded 2 Mbps / 750 Kbps / 200 ms RTT simulated cellular",
    offline: false,
    latencyMs: 200,
    downloadBytesPerSecond: 250_000,
    uploadBytesPerSecond: 93_750,
    connectionType: "cellular3g",
    controllerTimeoutMs: 12_000,
    harnessCompletionTimeoutMs: CONTROLLER_TIMEOUT_MS,
  };
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    window.__phase4Delivery = {
      navigationStart: performance.now(),
      domContentLoaded: null,
      posterReadyAt: null,
      mediaReadyAt: null,
      mediaFailedAt: null,
      scrollEvents: [],
    };
    const recordPoster = () => {
      if (window.__phase4Delivery.posterReadyAt !== null) return;
      const poster = document.querySelector("[data-cinematic-poster] img");
      if (poster?.complete && poster.naturalWidth > 0) {
        window.__phase4Delivery.posterReadyAt = performance.now();
      }
    };
    document.addEventListener("DOMContentLoaded", () => {
      const shell = document.querySelector("[data-cinematic-shell]");
      window.__phase4Delivery.domContentLoaded = {
        at: performance.now(),
        h1Count: document.querySelectorAll("h1").length,
        h1Text: document.querySelector("h1")?.textContent?.trim().replace(/\s+/g, " ") ?? null,
        shellCount: document.querySelectorAll("[data-cinematic-shell]").length,
        posterCount: document.querySelectorAll("[data-cinematic-poster]").length,
        videoCount: document.querySelectorAll("[data-cinematic-media]").length,
        loaderCount: document.querySelectorAll(
          "[aria-busy=true], [role=progressbar], .loader, .loading",
        ).length,
        mediaState: shell?.getAttribute("data-media-state") ?? null,
      };
      const poster = document.querySelector("[data-cinematic-poster] img");
      poster?.addEventListener("load", recordPoster, { once: true });
      recordPoster();
    });
    addEventListener("scroll", () => {
      window.__phase4Delivery.scrollEvents.push({ y: scrollY, at: performance.now() });
    }, { passive: true });
    const observer = new MutationObserver(() => {
      recordPoster();
      const state = document.querySelector("[data-cinematic-shell]")
        ?.getAttribute("data-media-state");
      if (state === "ready" && window.__phase4Delivery.mediaReadyAt === null) {
        window.__phase4Delivery.mediaReadyAt = performance.now();
      }
      if (state === "failed" && window.__phase4Delivery.mediaFailedAt === null) {
        window.__phase4Delivery.mediaFailedAt = performance.now();
      }
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-media-state"],
    });
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: profile.offline,
    latency: profile.latencyMs,
    downloadThroughput: profile.downloadBytesPerSecond,
    uploadThroughput: profile.uploadBytesPerSecond,
    connectionType: profile.connectionType,
  });
  const observer = observePage(page, baseUrl);
  const startedAt = Date.now();
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const html = response ? await response.text() : "";
  const immediate = await readDeliverySnapshot(page);
  const stateBeforeInput = await readHomeState(page);
  await page.keyboard.press("PageDown");
  await waitForScrollStable(page);
  await settle(page);
  const nativeScrollAt = Date.now() - startedAt;
  const nativeScroll = await readHomeState(page);
  const deliveryAfterScroll = await readDeliverySnapshot(page);
  await page.waitForFunction(
    () => {
      const poster = document.querySelector("[data-cinematic-poster] img");
      return poster?.complete && poster.naturalWidth > 0;
    },
    undefined,
    { timeout: 8000 },
  ).catch(() => {});
  const posterAt = Date.now() - startedAt;
  const posterReady = await readDeliverySnapshot(page);
  const controllerCompleted = await waitForCinematicCompletion(page);
  const completionAt = Date.now() - startedAt;
  let finalState = await readHomeState(page);
  let fallbackSkip = null;
  if (finalState.mediaState === "failed") {
    await page.keyboard.press("Home");
    await waitForScrollStable(page);
    await page.keyboard.press("Tab");
    const focused = await readHomeState(page);
    await page.keyboard.press("Enter");
    await waitForScrollStable(page);
    await settle(page);
    finalState = await readHomeState(page);
    fallbackSkip = { focused, final: finalState };
  }
  const finalSnapshot = await readDeliverySnapshot(page);
  const network = observer.snapshot();
  const assertionNetwork = withoutNavigationAborts(network);
  const scenario = "throttled-connection";
  const posterResource = finalSnapshot.resources.find(({ name }) =>
    normalizedRequestPath(name).includes("/media/cinematic/phase-3-dormant-desktop-"));
  const videoResources = finalSnapshot.resources.filter(({ name }) =>
    /\/media\/cinematic\/.*\.(?:mp4|webm)$/i.test(normalizedRequestPath(name)));
  const timeline = finalSnapshot.timeline;
  const readyOutcome = finalState.mediaState === "ready";
  const cleanFallbackOutcome =
    finalState.mediaState === "failed"
    && ["load-timeout", "decode-timeout"].includes(finalState.rootFallback)
    && fallbackSkip?.final.hash === "#entry"
    && fallbackSkip.final.entry?.contentOpacity >= 0.99
    && fallbackSkip.final.entry?.pointerEvents !== "none"
    && fallbackSkip.final.stage?.visibility === "hidden";

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expect(
    failures,
    html.includes('id="home-title"')
      && immediate.dcl?.h1Count === 1
      && immediate.dcl?.h1Text?.toUpperCase() === "WHERE DO YOU ENTER?"
      && immediate.dcl?.shellCount === 1
      && immediate.dcl?.posterCount === 1
      && immediate.dcl?.videoCount === 1
      && immediate.dcl?.loaderCount === 0,
    scenario,
    "throttled-ssr-semantic-first",
    { responseContainsH1: html.includes('id="home-title"'), immediate: immediate.dcl },
    "SSR H1 and the inert one-poster/one-video shell exist at DOMContentLoaded with no loader",
  );
  expect(
    failures,
    stateBeforeInput.mediaState !== "ready"
      && nativeScroll.scrollY > stateBeforeInput.scrollY + 100
      && nativeScroll.nestedVerticalScrollers.length === 0
      && deliveryAfterScroll.loaderCount === 0,
    scenario,
    "throttled-native-scroll-before-video",
    {
      elapsedMs: nativeScrollAt,
      before: stateBeforeInput,
      after: nativeScroll,
      delivery: deliveryAfterScroll,
    },
    "native PageDown advances the root document while selected video is still loading and no loader is shown",
  );
  expect(
    failures,
    posterReady.poster?.complete
      && posterReady.poster.naturalWidth > 0
      && posterResource?.encodedBodySize > 0
      && timeline?.posterReadyAt !== null,
    scenario,
    "throttled-poster-readiness",
    { elapsedMs: posterAt, poster: posterReady.poster, posterResource, timeline },
    "eager poster independently completes and its exact transfer timing is recorded",
  );
  expect(
    failures,
    controllerCompleted
      && (readyOutcome || cleanFallbackOutcome),
    scenario,
    "throttled-bounded-outcome",
    {
      elapsedMs: completionAt,
      controllerCompleted,
      readyOutcome,
      cleanFallbackOutcome,
      finalState,
      fallbackSkip,
      timeline,
    },
    "eventual ready or an explicit 12-second load/decode-timeout with native keyboard access to ENTRY",
  );
  expect(
    failures,
    finalSnapshot.loaderCount === 0
      && finalState.h1Count === 1
      && finalState.cinematicVideoCount === 1
      && network.uniqueMediaPaths.length === 1
      && videoResources.length >= 1
      && videoResources.every(
        ({ name }) => normalizedRequestPath(name) === network.uniqueMediaPaths[0],
      )
      && finalState.horizontalOverflow <= OVERFLOW_TOLERANCE_PX,
    scenario,
    "throttled-delivery-discipline",
    {
      loaderCount: finalSnapshot.loaderCount,
      h1Count: finalState.h1Count,
      videoCount: finalState.cinematicVideoCount,
      mediaPaths: network.uniqueMediaPaths,
      videoResources,
      overflow: finalState.horizontalOverflow,
    },
    "one semantic H1 and selected video path (including valid range transfers), no loader and no horizontal overflow",
  );
  expectCleanRuntime(failures, scenario, assertionNetwork);

  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  }).catch(() => {});
  await cdp.detach();
  await context.close();
  return {
    label: "Bounded CDP throttled-connection delivery evidence",
    simulation: {
      ...profile,
      isPhysicalNetworkTest: false,
      note:
        "Chromium CDP applies deterministic latency and throughput; this is not carrier or radio-field evidence.",
    },
    status: response?.status() ?? null,
    timingsMs: {
      nativeScroll: nativeScrollAt,
      posterReadyProbe: posterAt,
      controllerCompletion: completionAt,
      domContentLoaded: timeline?.domContentLoaded?.at ?? null,
      posterReady: timeline?.posterReadyAt ?? null,
      mediaReady: timeline?.mediaReadyAt ?? null,
      mediaFailed: timeline?.mediaFailedAt ?? null,
    },
    immediate,
    stateBeforeInput,
    nativeScroll,
    deliveryAfterScroll,
    posterReady,
    controllerCompleted,
    outcome: readyOutcome ? "ready" : cleanFallbackOutcome ? "clean-timeout-fallback" : "unexpected",
    finalState,
    fallbackSkip,
    finalSnapshot,
    posterResource,
    videoResources,
    network,
    expectedAborts: network.failedCinematicRequests.filter(({ error }) => /ERR_ABORTED/i.test(error)),
  };
}

async function runAccessibilityAudit(browser, baseUrl, viewport, failures) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const controllerCompleted = await waitForCinematicCompletion(page);
  const scenario = "accessibility/" + viewport.id;

  await page.keyboard.press("Tab");
  await page.waitForTimeout(250);
  await settle(page);
  const skipFocus = await readFocusEvidence(page);
  await page.keyboard.press("Tab");
  await settle(page);
  const navigationFocus = await readFocusEvidence(page);

  let entryFocus = null;
  const focusSequence = [];
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("Tab");
    await settle(page);
    const focus = await readFocusEvidence(page);
    focusSequence.push(focus);
    if (focus.inEntry) {
      await waitForScrollStable(page);
      await settle(page);
      entryFocus = await readFocusEvidence(page);
      break;
    }
  }

  const focusedState = await readHomeState(page);
  const entryY = Math.min(
    focusedState.maxScroll,
    Math.max(0, Math.round((focusedState.entryTop ?? 0) - focusedState.headerHeight)),
  );
  await scrollTo(page, entryY);
  const targets = await readTargetSizes(page);
  const violations = compactAxeViolations(await runAxeScan(page));
  const severeViolations = violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );
  const finalState = await readHomeState(page);
  const network = observer.snapshot();

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expect(
    failures,
    controllerCompleted && finalState.rootMode === "enhanced",
    scenario,
    "enhanced-prerequisite",
    { controllerCompleted, mode: finalState.rootMode },
    "enhanced Home",
  );
  expect(
    failures,
    skipFocus.className.includes("skip-link")
      && skipFocus.href === "#entry"
      && focusPasses(skipFocus),
    scenario,
    "skip-focus-visibility",
    skipFocus,
    "visible, unobscured 2px focus treatment on the skip link",
  );
  expect(
    failures,
    navigationFocus.inHeader
      && navigationFocus.rootFocus === "navigation"
      && navigationFocus.headerInnerOpacity >= 0.99
      && focusPasses(navigationFocus),
    scenario,
    "navigation-focus-reveal",
    navigationFocus,
    "keyboard focus immediately reveals an unobscured header control",
  );
  expect(
    failures,
    entryFocus?.inEntry
      && entryFocus.rootFocus === "entry"
      && entryFocus.entryContentOpacity >= 0.99
      && entryFocus.stageVisibility === "hidden"
      && focusPasses(entryFocus),
    scenario,
    "entry-focus-reveal",
    { entryFocus, focusSequence },
    "keyboard focus hides opaque media and reveals an unobscured ENTRY route",
  );
  expect(
    failures,
    targets.count > 0 && targets.undersized.length === 0,
    scenario,
    "interactive-target-size",
    {
      count: targets.count,
      undersized: targets.undersized.slice(0, 20),
    },
    "all visible interactive controls are at least 44x44 CSS pixels",
  );
  expect(
    failures,
    severeViolations.length === 0,
    scenario,
    "axe-serious-critical",
    severeViolations,
    [],
  );
  expect(
    failures,
    finalState.cinematicVideoCount === 1
      && finalState.video?.ariaHidden === "true"
      && !finalState.video?.controls,
    scenario,
    "decorative-video-accessibility",
    {
      count: finalState.cinematicVideoCount,
      video: finalState.video,
    },
    "single aria-hidden, non-interactive decorative video",
  );
  expectCleanRuntime(failures, scenario, network);

  await context.close();
  return {
    viewport: viewport.id,
    controllerCompleted,
    skipFocus,
    navigationFocus,
    entryFocus,
    focusSequence,
    targets,
    axeViolations: violations,
    severeAxeViolations: severeViolations,
    finalState,
    network,
  };
}

async function runPerformanceEvidence(browser, baseUrl, failures) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  await context.addInitScript(() => {
    const supported = globalThis.PerformanceObserver?.supportedEntryTypes ?? [];
    const metrics = {
      supported: {
        longtask: supported.includes("longtask"),
        layoutShift: supported.includes("layout-shift"),
      },
      longTasks: [],
      layoutShifts: [],
      observerErrors: [],
      scrollStart: null,
      scrollEnd: null,
    };
    window.__phase4Performance = metrics;
    if (metrics.supported.longtask) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            metrics.longTasks.push({
              startTime: entry.startTime,
              duration: entry.duration,
              name: entry.name,
              attribution: [...(entry.attribution ?? [])].map((item) => ({
                name: item.name,
                entryType: item.entryType,
                containerType: item.containerType,
                containerName: item.containerName,
                containerId: item.containerId,
                containerSrc: item.containerSrc,
              })),
            });
          }
        });
        observer.observe({ type: "longtask", buffered: true });
        window.__phase4LongTaskObserver = observer;
      } catch (error) {
        metrics.observerErrors.push(String(error));
      }
    }
    if (metrics.supported.layoutShift) {
      try {
        const selector = (node) => {
          if (!(node instanceof Element)) return null;
          if (node.id) return "#" + node.id;
          const className = String(node.className).trim().split(/\s+/).slice(0, 2).join(".");
          return node.tagName.toLowerCase() + (className ? "." + className : "");
        };
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            metrics.layoutShifts.push({
              startTime: entry.startTime,
              value: entry.value,
              hadRecentInput: entry.hadRecentInput,
              sources: [...(entry.sources ?? [])].map((source) => ({
                node: selector(source.node),
                previousRect: source.previousRect
                  ? {
                      x: source.previousRect.x,
                      y: source.previousRect.y,
                      width: source.previousRect.width,
                      height: source.previousRect.height,
                    }
                  : null,
                currentRect: source.currentRect
                  ? {
                      x: source.currentRect.x,
                      y: source.currentRect.y,
                      width: source.currentRect.width,
                      height: source.currentRect.height,
                    }
                  : null,
              })),
            });
          }
        });
        observer.observe({ type: "layout-shift", buffered: true });
        window.__phase4LayoutShiftObserver = observer;
      } catch (error) {
        metrics.observerErrors.push(String(error));
      }
    }
  });

  const page = await context.newPage();
  const observer = observePage(page, baseUrl);
  const response = await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  const controllerCompleted = await waitForCinematicCompletion(page);
  const initial = await readHomeState(page);
  const startY = Math.max(0, Math.round(initial.shellTop ?? 0));
  const travel = Math.max(
    1,
    (initial.entryTop ?? 1) - initial.headerHeight - (initial.shellTop ?? 0),
  );
  const endY = Math.min(initial.maxScroll, Math.round(startY + travel));

  await page.evaluate(
    async ({ start, end }) => {
      const metrics = window.__phase4Performance;
      metrics.scrollStart = performance.now();
      const steps = 48;
      for (let index = 0; index <= steps; index += 1) {
        const progress = index / steps;
        window.scrollTo({
          top: start + (end - start) * progress,
          left: 0,
          behavior: "instant",
        });
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      }
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))));
      metrics.scrollEnd = performance.now();
    },
    { start: startY, end: endY },
  );
  await waitForMediaTarget(page);
  await page.waitForTimeout(150);
  const performance = await page.evaluate(() => {
    window.__phase4LongTaskObserver?.disconnect();
    window.__phase4LayoutShiftObserver?.disconnect();
    const metrics = window.__phase4Performance;
    const qualifyingShifts = metrics.layoutShifts.filter(
      ({ hadRecentInput }) => !hadRecentInput,
    );
    const scrollShifts = qualifyingShifts.filter(
      ({ startTime }) =>
        startTime >= metrics.scrollStart
        && startTime <= metrics.scrollEnd + 100,
    );
    const scrollLongTasks = metrics.longTasks.filter(
      ({ startTime }) =>
        startTime >= metrics.scrollStart
        && startTime <= metrics.scrollEnd + 100,
    );
    return {
      ...metrics,
      cls: qualifyingShifts.reduce((sum, entry) => sum + entry.value, 0),
      scrollCls: scrollShifts.reduce((sum, entry) => sum + entry.value, 0),
      scrollShifts,
      scrollLongTasks,
      incrementalScrollDuration:
        metrics.scrollEnd !== null && metrics.scrollStart !== null
          ? metrics.scrollEnd - metrics.scrollStart
          : null,
    };
  });
  const finalState = await readHomeState(page);
  const network = observer.snapshot();
  const scenario = "performance/incremental-scroll";

  expect(failures, response?.status() === 200, scenario, "http", response?.status(), 200);
  expect(
    failures,
    controllerCompleted
      && finalState.phase === "settled"
      && finalState.targetFrame >= 269,
    scenario,
    "representative-scroll-completion",
    { controllerCompleted, finalState },
    "48-step traversal reaches the settled final frame",
  );
  expect(
    failures,
    performance.supported.longtask
      && performance.supported.layoutShift
      && performance.observerErrors.length === 0,
    scenario,
    "performance-observer-support",
    {
      supported: performance.supported,
      errors: performance.observerErrors,
    },
    { longtask: true, layoutShift: true, errors: [] },
  );
  expect(
    failures,
    performance.scrollLongTasks.length === 0,
    scenario,
    "scroll-long-task",
    performance.scrollLongTasks,
    "0 tasks over 50ms during representative incremental scroll",
  );
  expect(
    failures,
    performance.cls <= 0.1
      && performance.scrollCls <= 0.01,
    scenario,
    "layout-shift",
    {
      cls: performance.cls,
      scrollCls: performance.scrollCls,
      scrollShifts: performance.scrollShifts,
      allShifts: performance.layoutShifts,
    },
    { totalClsAtMost: 0.1, incrementalScrollClsAtMost: 0.01 },
  );
  expectCleanRuntime(failures, scenario, network);

  await context.close();
  return {
    geometry: { startY, endY, travel },
    initial,
    finalState,
    performance,
    network,
  };
}

async function runSupportingRoutes(browser, baseUrl, routes, failures) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const results = [];

  for (const route of routes) {
    const page = await context.newPage();
    const observer = observePage(page, baseUrl);
    const requestPath = route === "/404/" ? "/phase-4-browser-qa-missing" : route;
    const response = await page.goto(baseUrl + requestPath, { waitUntil: "networkidle" });
    await settle(page);
    const state = await page.evaluate(() => ({
      path: location.pathname,
      h1Count: document.querySelectorAll("h1").length,
      cinematicShells: document.querySelectorAll("[data-cinematic-shell]").length,
      cinematicStages: document.querySelectorAll("[data-cinematic-stage]").length,
      cinematicVideos: document.querySelectorAll("[data-cinematic-media]").length,
      rootMode: document.documentElement.getAttribute("data-cinematic-mode"),
      horizontalOverflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      nestedVerticalScrollers: [...document.querySelectorAll("main *")]
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            ["auto", "scroll"].includes(style.overflowY)
            && element.scrollHeight > element.clientHeight + 2
          );
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: String(element.className),
        })),
    }));
    const network = observer.snapshot();
    const expectedStatus = route === "/404/" ? 404 : 200;
    const scenario = "supporting-route/" + route;
    expect(
      failures,
      response?.status() === expectedStatus,
      scenario,
      "http",
      response?.status(),
      expectedStatus,
    );
    expect(failures, state.h1Count === 1, scenario, "h1-count", state.h1Count, 1);
    expect(
      failures,
      state.cinematicShells === 0
        && state.cinematicStages === 0
        && state.cinematicVideos === 0
        && state.rootMode === null,
      scenario,
      "cinematic-isolation",
      state,
      "no Phase 4 DOM or root mode",
    );
    expect(
      failures,
      network.uniqueMediaPaths.length === 0,
      scenario,
      "cinematic-media-isolation",
      network.uniqueMediaPaths,
      [],
    );
    expect(
      failures,
      network.cinematicControllerRequests.length === 0,
      scenario,
      "cinematic-controller-isolation",
      network.cinematicControllerRequests,
      [],
    );
    expect(
      failures,
      state.horizontalOverflow <= OVERFLOW_TOLERANCE_PX,
      scenario,
      "horizontal-overflow",
      state.horizontalOverflow,
      "<= " + OVERFLOW_TOLERANCE_PX + "px",
    );
    expect(
      failures,
      state.nestedVerticalScrollers.length === 0,
      scenario,
      "nested-scroll-authority",
      state.nestedVerticalScrollers,
      [],
    );
    const expectedNavigationErrorIndex = route === "/404/"
      ? network.runtimeErrors.findIndex(
          (message) => /^Failed to load resource: the server responded with a status of 404 \((?:Not Found)?\)$/.test(message),
        )
      : -1;
    const assertionNetwork = expectedNavigationErrorIndex >= 0
      ? {
          ...network,
          runtimeErrors: network.runtimeErrors.filter((_, index) => index !== expectedNavigationErrorIndex),
        }
      : network;
    expectCleanRuntime(failures, scenario, assertionNetwork);
    results.push({
      route,
      requestPath,
      status: response?.status() ?? null,
      state,
      network,
      expectedNavigationErrors:
        expectedNavigationErrorIndex >= 0
          ? [network.runtimeErrors[expectedNavigationErrorIndex]]
          : [],
    });
    await page.close();
  }

  await context.close();
  return results;
}

const options = parseArguments(process.argv.slice(2));
const baseUrl = new URL(options.baseUrl).toString().replace(/\/$/, "");
let preview = null;
let browser = null;
let infrastructureError = null;
const failures = [];
const report = {
  schema: "quantum-hub.phase-4.browser-qa.v1",
  generatedAt: new Date().toISOString(),
  baseUrl,
  serverMode: options.serverMode,
  mode: options.smoke ? "smoke" : "full",
  passed: false,
  browser: "Chromium",
  browserConfiguration: {
    headless: true,
    nativeRootScrollbarExposed: true,
    ignoredPlaywrightDefaultArguments: ["--hide-scrollbars"],
  },
  viewports: [],
  scrollTraversals: [],
  scrollbarDrag: null,
  keyboardSkip: null,
  keyboardSkipMatrix: [],
  reducedMotion: [],
  noJavaScript: [],
  deepLinks: [],
  lifecycle: null,
  reloadPositionMatrix: null,
  visibilityLifecycle: null,
  resizeOrientation: null,
  mediaFailOpen: null,
  media404FailOpen: null,
  unsupportedCodecFailOpen: null,
  coldLoad: null,
  warmCache: null,
  throttledConnection: null,
  textZoom: [],
  fallbackFonts: [],
  postLoadZoomFitTransition: null,
  simulatedSafariUaSourceSelection: null,
  accessibility: [],
  performance: null,
  methodEligibility: null,
  mobileTouchInput: null,
  supportingRoutes: [],
  limitations: {
    physicalTrackpadMomentum: {
      executed: false,
      passed: null,
      limitation:
        "Headless Chromium exposes no physical trackpad device; wheel/trackpad momentum is not claimed.",
    },
    safariWebKitEngine: {
      executed: false,
      passed: null,
      limitation:
        "This local harness launched installed Chromium only; the simulated iOS/Safari UA gate is not a Safari/WebKit engine test.",
    },
    firefoxEngine: {
      executed: false,
      passed: null,
      limitation:
        "This local harness launched installed Chromium only; Firefox/Gecko was not executed.",
    },
  },
  failures,
  infrastructureError: null,
};

try {
  if (options.serverMode === "astro-preview") preview = startPreview(baseUrl);
  await waitForServer(baseUrl, preview);
  const chromePath = await resolveChrome(options.browser);
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    ignoreDefaultArgs: ["--hide-scrollbars"],
    args: ["--disable-extensions", "--disable-background-networking"],
  });

  const viewports = options.smoke
    ? VIEWPORTS.filter(({ id }) =>
        ["desktop-1440x900", "tablet-portrait-768x1024", "mobile-landscape-844x390"].includes(id))
    : VIEWPORTS;
  for (const viewport of viewports) {
    console.log("Phase 4 browser QA viewport: " + viewport.id);
    report.viewports.push(
      await runReferenceViewport(browser, baseUrl, viewport, failures),
    );
  }

  const scrollViewports = options.smoke ? SCROLL_VIEWPORTS.slice(0, 1) : SCROLL_VIEWPORTS;
  for (const viewport of scrollViewports) {
    console.log("Phase 4 browser QA scroll traversal: " + viewport.id);
    report.scrollTraversals.push(
      await runScrollTraversal(browser, baseUrl, viewport, failures),
    );
  }

  report.keyboardSkip = await runKeyboardSkip(browser, baseUrl, failures);

  const staticViewports = options.smoke ? STATIC_VIEWPORTS.slice(0, 1) : STATIC_VIEWPORTS;
  for (const viewport of staticViewports) {
    report.reducedMotion.push(
      await runStaticVariant(
        browser,
        baseUrl,
        {
          id: "reduced-motion",
          viewport,
          javaScriptEnabled: true,
          reducedMotion: "reduce",
        },
        failures,
      ),
    );
    report.noJavaScript.push(
      await runStaticVariant(
        browser,
        baseUrl,
        {
          id: "no-javascript",
          viewport,
          javaScriptEnabled: false,
          reducedMotion: "no-preference",
        },
        failures,
      ),
    );
  }

  if (!options.smoke) {
    report.scrollbarDrag = await runNativeScrollbarDrag(
      browser,
      baseUrl,
      failures,
    );
    report.coldLoad = await runColdLoadEvidence(browser, baseUrl, failures);
    report.warmCache = await runWarmCacheEvidence(browser, baseUrl, failures);
    report.throttledConnection = await runThrottledConnectionEvidence(
      browser,
      baseUrl,
      failures,
    );
    for (const deepLink of [
      {
        id: "entry",
        hash: "#entry",
        selector: "#entry",
        expectedHeader: "visible",
      },
      {
        id: "method",
        hash: "#method",
        selector: "#method",
        expectedHeader: "released",
      },
    ]) {
      report.deepLinks.push(
        await runDirectDeepLink(browser, baseUrl, deepLink, failures),
      );
    }
    report.lifecycle = await runLifecycleRestoration(browser, baseUrl, failures);
    report.reloadPositionMatrix = await runReloadPositionMatrix(
      browser,
      baseUrl,
      failures,
    );
    report.visibilityLifecycle = await runVisibilityLifecycle(
      browser,
      baseUrl,
      failures,
    );
    report.resizeOrientation = await runResizeOrientation(
      browser,
      baseUrl,
      failures,
    );
    report.mediaFailOpen = await runMediaFailOpen(browser, baseUrl, failures);
    report.media404FailOpen = await runMedia404FailOpen(
      browser,
      baseUrl,
      failures,
    );
    report.unsupportedCodecFailOpen = await runUnsupportedCodecFailOpen(
      browser,
      baseUrl,
      failures,
    );
    for (const viewport of [
      { id: "desktop-1440x900", width: 1440, height: 900 },
      { id: "mobile-390x844", width: 390, height: 844 },
    ]) {
      report.fallbackFonts.push(
        await runFallbackFonts(browser, baseUrl, viewport, failures),
      );
    }
    for (const viewport of [
      { id: "desktop-1440x900", width: 1440, height: 900 },
      { id: "mobile-390x844", width: 390, height: 844 },
    ]) {
      report.textZoom.push(
        await runTextZoom(browser, baseUrl, viewport, failures),
      );
      report.accessibility.push(
        await runAccessibilityAudit(browser, baseUrl, viewport, failures),
      );
    }
    report.postLoadZoomFitTransition =
      await runPostLoadZoomFitTransition(browser, baseUrl, failures);
    report.simulatedSafariUaSourceSelection =
      await runSimulatedSafariUaSourceSelection(browser, baseUrl, failures);
    report.performance = await runPerformanceEvidence(browser, baseUrl, failures);
    report.keyboardSkipMatrix = await runKeyboardSkipMatrix(
      browser,
      baseUrl,
      failures,
    );
    report.methodEligibility = await runMethodEligibilityMatrix(
      browser,
      baseUrl,
      failures,
    );
    report.mobileTouchInput = await runMobileTouchInput(
      browser,
      baseUrl,
      failures,
    );
  }

  const routes = options.smoke
    ? SUPPORTING_ROUTES.filter((route) => ["/about/", "/404/"].includes(route))
    : SUPPORTING_ROUTES;
  report.supportingRoutes = await runSupportingRoutes(
    browser,
    baseUrl,
    routes,
    failures,
  );
} catch (error) {
  infrastructureError = error instanceof Error ? error.stack ?? error.message : String(error);
  report.infrastructureError = infrastructureError;
  failures.push({
    scenario: "harness",
    type: "infrastructure",
    measured: infrastructureError,
  });
} finally {
  if (browser) await browser.close();
  if (preview && preview.exitCode === null) preview.kill();
}

report.passed = failures.length === 0;
await mkdir(path.dirname(options.report), { recursive: true });
const temporaryReport = options.report + ".tmp";
await writeFile(temporaryReport, JSON.stringify(report, null, 2) + "\n", "utf8");
await rename(temporaryReport, options.report);

const relativeReport = path.relative(ROOT, options.report).replaceAll("\\", "/");
if (failures.length) {
  console.error(
    "Phase 4 browser QA failed with "
      + failures.length
      + " issue"
      + (failures.length === 1 ? "" : "s")
      + ".",
  );
  for (const failure of failures.slice(0, 40)) {
    console.error("- " + failure.scenario + ": " + failure.type);
  }
  console.error("Machine report: " + relativeReport);
  process.exitCode = 1;
} else {
  console.log(
    "Verified Phase 4 across "
      + report.viewports.length
      + " reference viewports, "
      + report.scrollTraversals.length
      + " native-scroll traversals, lifecycle/fallback/accessibility/performance gates, and "
      + report.supportingRoutes.length
      + " isolated supporting routes.",
  );
  console.log("Machine report: " + relativeReport);
}
