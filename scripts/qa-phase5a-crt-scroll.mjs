import { constants as fsConstants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_URL = "http://127.0.0.1:4335/";
const HOLD_MS = 3_200;
const VIEWPORTS = [
  { id: "desktop-1440x900", width: 1440, height: 900, family: "desktop", minimumVh: 0.75, maximumVh: 1 },
  { id: "mobile-390x844", width: 390, height: 844, family: "portrait", minimumVh: 0.6, maximumVh: 0.8 },
  { id: "narrow-320x800", width: 320, height: 800, family: "portrait", minimumVh: 0.6, maximumVh: 0.8 },
  { id: "tablet-portrait-768x1024", width: 768, height: 1024, family: "portrait", minimumVh: 0.6, maximumVh: 0.8 },
  { id: "mobile-landscape-844x390", width: 844, height: 390, family: "landscape", minimumVh: 0.6, maximumVh: 0.8 },
];
const STARTUP_FRAMES = [
  { frame: 285, segment: "crt-arrival" },
  { frame: 292, segment: "indicator" },
  { frame: 308, segment: "phosphor-line" },
  { frame: 325, segment: "raster-expansion" },
  { frame: 345, segment: "raster-settling" },
  { frame: 370, segment: "q-hold" },
];

function option(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function executable(candidate) {
  if (!candidate) return false;
  try { await access(candidate, fsConstants.X_OK); return true; } catch { return false; }
}

async function resolveChrome(override) {
  const candidates = [override];
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    );
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) if (await executable(candidate)) return path.resolve(candidate);
  throw new Error("Chrome/Chromium not found; pass --browser PATH");
}

function startPreview(url) {
  const parsed = new URL(url);
  return spawn(process.execPath, [path.join(ROOT, "scripts", "serve-phase4-dist.mjs"), "--host", parsed.hostname, "--port", parsed.port], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function waitForServer(url, processHandle) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`preview exited with ${processHandle.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`preview did not become ready at ${url}`);
}

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function state(page) {
  return page.evaluate(() => {
    const video = document.querySelector("[data-cinematic-media]");
    const shell = document.querySelector("[data-cinematic-shell]");
    const q = window.quantumPhase4;
    const telemetry = window.__phase5aTelemetry ?? {};
    return {
      scrollY: window.scrollY,
      scrollOffset: q?.scrollOffset ?? null,
      targetFrame: q?.targetFrame ?? null,
      presentedFrame: q?.presentedFrame ?? null,
      conceptualFrame: q?.conceptualFrame ?? null,
      segment: q?.segment ?? shell?.dataset.cinematicSegment ?? null,
      control: q?.control ?? shell?.dataset.cinematicControl ?? null,
      mediaReady: q?.mediaReady ?? false,
      mode: q?.mode ?? document.documentElement.dataset.cinematicMode ?? null,
      mediaState: shell?.dataset.mediaState ?? null,
      currentTime: video?.currentTime ?? null,
      paused: video?.paused ?? null,
      seeking: video?.seeking ?? null,
      videoElements: document.querySelectorAll("video").length,
      source: video?.currentSrc ?? null,
      telemetry: { ...telemetry },
      documentHeight: document.documentElement.scrollHeight,
      header: document.documentElement.dataset.cinematicHeader ?? null,
    };
  });
}

async function openEnhanced(context, url, requests) {
  const page = await context.newPage();
  page.on("request", (request) => {
    const candidate = request.url();
    if (/phase-4r2\/.*\.(?:mp4|json)(?:\?|$)/.test(candidate)) requests.push(candidate);
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.waitForFunction(() => window.quantumPhase4?.mediaReady === true, null, { timeout: 20_000 });
  await twoFrames(page);
  return page;
}

async function scrollYForFrame(page, frame) {
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    if (!shell || !entry || !header) throw new Error("cinematic geometry unavailable");
    const shellTop = shell.getBoundingClientRect().top + window.scrollY;
    const entryTop = entry.getBoundingClientRect().top + window.scrollY;
    return { shellTop, extent: Math.round(entryTop - header.getBoundingClientRect().height - shellTop) };
  });
  let low = 0;
  let high = geometry.extent;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    await page.evaluate((y) => window.scrollTo(0, y), geometry.shellTop + middle);
    await twoFrames(page);
    const target = (await state(page)).targetFrame;
    if (target >= frame) high = middle;
    else low = middle + 1;
  }
  await page.evaluate((y) => window.scrollTo(0, y), geometry.shellTop + low);
  await twoFrames(page);
  const resolved = await state(page);
  if (resolved.targetFrame !== frame) throw new Error(`F${frame} has no exact browser address; resolved F${resolved.targetFrame}`);
  return resolved.scrollY;
}

async function waitPresented(page, frame) {
  await page.waitForFunction((target) => {
    const q = window.quantumPhase4;
    const video = document.querySelector("[data-cinematic-media]");
    return q?.targetFrame === target && q?.presentedFrame === target && video?.paused === true && video?.seeking === false;
  }, frame, { timeout: 8_000 });
  return state(page);
}

async function wheelTo(page, targetY) {
  const before = await state(page);
  await page.mouse.move(10, 10);
  await page.mouse.wheel(0, targetY - before.scrollY);
  await page.waitForFunction((target) => Math.abs(window.scrollY - target) <= 1, targetY, { timeout: 5_000 });
  await twoFrames(page);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unchanged(before, after, label) {
  assert(Math.abs(after.scrollY - before.scrollY) <= 0.01, `${label}: scrollY moved`);
  assert(after.targetFrame === before.targetFrame, `${label}: target frame moved`);
  assert(after.presentedFrame === before.presentedFrame, `${label}: presented frame moved`);
  assert(Math.abs(after.currentTime - before.currentTime) <= 0.002, `${label}: decoder time moved`);
  assert(after.paused === true, `${label}: decoder is not paused`);
  assert(after.telemetry.playEvents === before.telemetry.playEvents && after.telemetry.playingEvents === before.telemetry.playingEvents, `${label}: playback event occurred`);
}

async function hold(page, label) {
  const before = await state(page);
  await page.waitForTimeout(HOLD_MS);
  const after = await state(page);
  unchanged(before, after, label);
  return { label, holdMs: HOLD_MS, before, after, status: "PASS" };
}

async function mainScenario(browser, url) {
  const requests = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  await context.addInitScript(() => {
    window.__phase5aTelemetry = { wheelEvents: 0, scrollEvents: 0, playEvents: 0, playingEvents: 0, lastWheelDeltaY: 0 };
    addEventListener("wheel", (event) => { window.__phase5aTelemetry.wheelEvents += 1; window.__phase5aTelemetry.lastWheelDeltaY = event.deltaY; }, { passive: true });
    addEventListener("scroll", () => { window.__phase5aTelemetry.scrollEvents += 1; }, { passive: true });
    addEventListener("play", () => { window.__phase5aTelemetry.playEvents += 1; }, true);
    addEventListener("playing", () => { window.__phase5aTelemetry.playingEvents += 1; }, true);
  });
  const page = await openEnhanced(context, url, requests);
  const y = {};
  for (const { frame } of STARTUP_FRAMES) y[frame] = await scrollYForFrame(page, frame);
  y[250] = await scrollYForFrame(page, 250);
  y[480] = await scrollYForFrame(page, 480);

  await page.evaluate(() => window.scrollTo(0, 0));
  await twoFrames(page);
  const top = await state(page);
  await page.mouse.wheel(0, 15);
  await page.waitForFunction(() => window.scrollY > 0 && (window.quantumPhase4?.targetFrame ?? 0) >= 46);
  const firstInput = await state(page);
  assert(firstInput.targetFrame >= 46 && firstInput.targetFrame > top.targetFrame, "first 15px input did not visibly begin at F46+");

  await page.evaluate((target) => window.scrollTo(0, target), y[285]);
  await waitPresented(page, 285);
  const arrivalStop = await hold(page, "arrival F285");
  assert(arrivalStop.after.segment === "crt-arrival", "arrival segment mismatch");

  const progressive = [];
  for (const item of STARTUP_FRAMES.slice(1)) {
    await wheelTo(page, y[item.frame]);
    const observed = await waitPresented(page, item.frame);
    assert(observed.segment === item.segment, `F${item.frame} segment mismatch: ${observed.segment}`);
    progressive.push({ input: "wheel", targetY: y[item.frame], expectedFrame: item.frame, expectedSegment: item.segment, observed });
  }
  assert(progressive.every((item, index) => index === 0 || item.observed.scrollY > progressive[index - 1].observed.scrollY), "progressive startup did not use positive document changes");

  await wheelTo(page, y[308]);
  await waitPresented(page, 308);
  const stopOnLine = await hold(page, "phosphor line F308");
  await wheelTo(page, y[325]);
  await waitPresented(page, 325);
  const stopOnRaster = await hold(page, "raster expansion F325");

  await wheelTo(page, y[370]);
  await waitPresented(page, 370);
  const reverse = [];
  for (const item of [...STARTUP_FRAMES].reverse().slice(1)) {
    await wheelTo(page, y[item.frame]);
    const observed = await waitPresented(page, item.frame);
    reverse.push({ input: "wheel", targetY: y[item.frame], expectedFrame: item.frame, expectedSegment: item.segment, observed });
  }
  assert(reverse.at(-1)?.observed.targetFrame === 285, "reverse did not return to F285");

  await page.evaluate((target) => window.scrollTo(0, target), y[250]);
  await waitPresented(page, 250);
  const beforeFast = await state(page);
  await wheelTo(page, y[480]);
  const fastTarget = await waitPresented(page, 480);
  const fastJumpHold = await hold(page, "fast jump F250 to F480");
  assert(fastTarget.telemetry.wheelEvents === beforeFast.telemetry.wheelEvents + 1, "fast jump was not one wheel input");

  const h264Requests = [...new Set(requests.filter((candidate) => /\.mp4(?:\?|$)/.test(candidate)))];
  const final = await state(page);
  assert(h264Requests.length === 1, `expected one H.264 request, observed ${h264Requests.length}`);
  assert(final.videoElements === 1 && final.source?.startsWith("blob:"), "one Blob-backed decoder invariant failed");
  assert(final.telemetry.playEvents === 0 && final.telemetry.playingEvents === 0, "autonomous playback event observed");
  await context.close();
  return { firstInput: { top, after: firstInput }, arrivalStop, progressive, stopOnLine, stopOnRaster, reverse, fastJump: { before: beforeFast, target: fastTarget, hold: fastJumpHold }, requests: { h264: h264Requests, all: requests }, status: "PASS" };
}

async function responsiveScenario(browser, url) {
  const results = [];
  for (const viewport of VIEWPORTS) {
    const requests = [];
    const context = await browser.newContext({ viewport, reducedMotion: "no-preference" });
    await context.addInitScript(() => {
      window.__phase5aTelemetry = { wheelEvents: 0, scrollEvents: 0, playEvents: 0, playingEvents: 0, lastWheelDeltaY: 0 };
      addEventListener("wheel", (event) => { window.__phase5aTelemetry.wheelEvents += 1; window.__phase5aTelemetry.lastWheelDeltaY = event.deltaY; }, { passive: true });
      addEventListener("scroll", () => { window.__phase5aTelemetry.scrollEvents += 1; }, { passive: true });
      addEventListener("play", () => { window.__phase5aTelemetry.playEvents += 1; }, true);
      addEventListener("playing", () => { window.__phase5aTelemetry.playingEvents += 1; }, true);
    });
    const page = await openEnhanced(context, url, requests);
    const states = [];
    const positions = {};
    for (const item of STARTUP_FRAMES) positions[item.frame] = await scrollYForFrame(page, item.frame);
    await page.evaluate((target) => window.scrollTo(0, target), positions[285]);
    await waitPresented(page, 285);
    for (const item of STARTUP_FRAMES.slice(1)) {
      await wheelTo(page, positions[item.frame]);
      const observed = await waitPresented(page, item.frame);
      assert(observed.segment === item.segment, `${viewport.id} F${item.frame} segment mismatch`);
      states.push(observed);
    }
    const allocationVh = (positions[370] - positions[285]) / viewport.height;
    assert(allocationVh >= viewport.minimumVh && allocationVh <= viewport.maximumVh, `${viewport.id} allocation ${allocationVh.toFixed(4)}vh outside target`);
    const terminal = await state(page);
    assert(terminal.telemetry.playEvents === 0 && terminal.telemetry.playingEvents === 0, `${viewport.id} observed playback`);
    results.push({ viewport, positions, allocationVh, states, requestCount: [...new Set(requests.filter((candidate) => /\.mp4(?:\?|$)/.test(candidate)))].length, status: "PASS" });
    await context.close();
  }
  return results;
}

async function fallbackScenarios(browser, url) {
  const reducedRequests = [];
  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  reducedPage.on("request", (request) => { if (/phase-4r2\/.*\.mp4(?:\?|$)/.test(request.url())) reducedRequests.push(request.url()); });
  await reducedPage.goto(url, { waitUntil: "networkidle" });
  const reducedState = await state(reducedPage);
  assert(reducedRequests.length === 0 && reducedState.mode === "static", "reduced motion requested cinematic video or failed to release static flow");
  await reduced.close();

  const noJsRequests = [];
  const noJs = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const noJsPage = await noJs.newPage();
  noJsPage.on("request", (request) => { if (/phase-4r2\/.*\.mp4(?:\?|$)/.test(request.url())) noJsRequests.push(request.url()); });
  await noJsPage.goto(url, { waitUntil: "networkidle" });
  const noJsState = await noJsPage.evaluate(() => ({ videoSources: [...document.querySelectorAll("video")].filter((video) => video.currentSrc || video.getAttribute("src")).length, h1: document.querySelector("h1")?.textContent?.trim(), height: document.documentElement.scrollHeight }));
  assert(noJsRequests.length === 0 && noJsState.videoSources === 0 && noJsState.h1 === "Where do you enter?", "no-JS static flow regression");
  await noJs.close();

  const failed = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const failedPage = await failed.newPage();
  await failedPage.route(/phase-4r2\/media\/.*\.mp4(?:\?.*)?$/, (route) => route.abort("failed"));
  await failedPage.goto(url, { waitUntil: "domcontentloaded" });
  await failedPage.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.dataset.mediaState === "failed-preserve-runway", null, { timeout: 15_000 });
  const failureTop = await state(failedPage);
  await failedPage.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await twoFrames(failedPage);
  const failureEnd = await state(failedPage);
  assert(failureTop.documentHeight === failureEnd.documentHeight && failureEnd.header === "released", "late media failure lost runway or trapped semantic flow");
  await failed.close();
  return { reducedMotion: { requests: reducedRequests, state: reducedState, status: "PASS" }, noJavaScript: { requests: noJsRequests, state: noJsState, status: "PASS" }, mediaFailure: { top: failureTop, end: failureEnd, status: "PASS" } };
}

async function main() {
  const argv = process.argv.slice(2);
  const url = option(argv, "--url", DEFAULT_URL);
  const report = option(argv, "--report");
  const browserPath = await resolveChrome(option(argv, "--browser", process.env.CHROME_PATH));
  const external = argv.includes("--external");
  if (!report) throw new Error("--report OUTSIDE_REPOSITORY is required");
  if (isWithin(ROOT, report)) throw new Error("Phase 5A browser QA report must remain external/untracked");
  const server = external ? null : startPreview(url);
  let browser;
  try {
    if (server) await waitForServer(url, server);
    browser = await chromium.launch({ headless: true, executablePath: browserPath, args: ["--disable-extensions", "--disable-background-networking"] });
    const startedAt = new Date().toISOString();
    const [mainResult, responsive, fallbacks] = await Promise.all([
      mainScenario(browser, url),
      responsiveScenario(browser, url),
      fallbackScenarios(browser, url),
    ]);
    const payload = {
      schema: "quantum-hub.phase-5a.crt-browser-qa.v1",
      status: "PASS",
      startedAt,
      completedAt: new Date().toISOString(),
      target: url,
      browser: browserPath,
      holdMilliseconds: HOLD_MS,
      automaticPlaybackPathsExpected: 0,
      main: mainResult,
      responsive,
      fallbacks,
    };
    await mkdir(path.dirname(path.resolve(report)), { recursive: true });
    await writeFile(path.resolve(report), `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
    console.log(`Phase 5A CRT browser QA PASS: ${path.resolve(report)}`);
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) server.kill();
  }
}

await main();
