import { access, mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_SHA = "005a36860ecbfd6fedb3d3f2223f168c1edfbb05";
const DESKTOP = Object.freeze({ width: 1440, height: 900 });
const SQUARE = Object.freeze({ width: 800, height: 800 });
const HOME_H264 = /\/media\/cinematic\/phase-4r2\/.*h264.*\.mp4(?:[?#]|$)/i;
const HOME_CONTROLLER_CHUNK = /\/(?:_astro\/home-cinematic-integration\.[^/?#]+\.js|src\/scripts\/home-cinematic-integration\.ts)(?:[?#]|$)/i;
const MARADIN_MP4 = /\/media\/maradin\/.*\.mp4(?:[?#]|$)/i;
const CONTROLLER_CHUNK_STALL_MS = 4_600;

export const SCHEMA = "quantum-hub.phase-6.repair-regressions.v1";
export const REPAIR_CASES = Object.freeze([
  Object.freeze({ id: "home-controller-watchdog", beforeEvidence: "P6-001" }),
  Object.freeze({ id: "home-exact-top-media-failure", beforeEvidence: Object.freeze(["P6-003", "P6-010"]) }),
  Object.freeze({ id: "home-entry-failure-reverse", beforeEvidence: "P6-002" }),
  Object.freeze({ id: "home-square-family", beforeEvidence: "P6-006" }),
  Object.freeze({ id: "home-positive-fractional-wheel", beforeEvidence: "P6-007" }),
  Object.freeze({ id: "maradin-repeated-persisted-lifecycle", beforeEvidence: "P6-004" }),
  Object.freeze({ id: "maradin-media-failure", beforeEvidence: "P6-005" }),
]);
export const SHARED_DOM_EVIDENCE = Object.freeze(["P6-008", "P6-009"]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function nextValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4338/",
    browser: "",
    headed: false,
    help: false,
    output: "",
    selfTest: false,
    timeoutMs: 12_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-url") {
      options.baseUrl = nextValue(argv, index, argument);
      index += 1;
    } else if (argument === "--browser") {
      options.browser = path.resolve(nextValue(argv, index, argument));
      index += 1;
    } else if (argument === "--headed") {
      options.headed = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--output") {
      options.output = path.resolve(nextValue(argv, index, argument));
      index += 1;
    } else if (argument === "--self-test") {
      options.selfTest = true;
    } else if (argument === "--timeout-ms") {
      options.timeoutMs = Number(nextValue(argv, index, argument));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  invariant(Number.isFinite(options.timeoutMs) && options.timeoutMs >= 6_000, "--timeout-ms must be at least 6000");
  const parsedBase = new URL(options.baseUrl);
  invariant(parsedBase.protocol === "http:" || parsedBase.protocol === "https:", "--base-url must use HTTP or HTTPS");
  parsedBase.hash = "";
  parsedBase.search = "";
  if (!parsedBase.pathname.endsWith("/")) parsedBase.pathname += "/";
  options.baseUrl = parsedBase.toString();
  if (!options.help && !options.selfTest && !options.output) throw new Error("--output is required for a live run");
  if (options.output) assertExternalOutputPath(options.output);
  return options;
}

function pathIsWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertExternalOutputPath(filePath) {
  const resolved = path.resolve(filePath);
  invariant(path.extname(resolved).toLowerCase() === ".json", "--output must be a JSON file");
  invariant(!pathIsWithin(ROOT, resolved), "repair-regression evidence must stay outside the repository");
  invariant(!pathIsWithin(os.tmpdir(), resolved), "repair-regression evidence must stay outside OS temporary storage");
  return resolved;
}

export async function assertFreshExternalOutput(filePath) {
  const resolved = assertExternalOutputPath(filePath);
  try {
    await stat(resolved);
    throw new Error(`refusing to overwrite existing repair-regression evidence: ${resolved}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return resolved;
}

async function writeFreshExternal(filePath, report) {
  const resolved = await assertFreshExternalOutput(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveChromium(explicitPath = "") {
  const candidates = [];
  if (explicitPath) candidates.push(path.resolve(explicitPath));
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    candidates.push("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser");
  }
  for (const candidate of [...new Set(candidates)]) if (await exists(candidate)) return candidate;
  throw new Error("Chromium executable unavailable; install Playwright Chromium or pass --browser PATH");
}

function target(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString();
}

export function moduleScriptUrls(html, baseUrl) {
  const urls = [];
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\btype\s*=\s*(["'])module\1/i.test(tag)) continue;
    const source = tag.match(/\bsrc\s*=\s*(["'])([^"']+)\1/i)?.[2];
    if (source) urls.push(new URL(source, baseUrl).toString());
  }
  return [...new Set(urls)];
}

export async function discoverHomeEntryModule(baseUrl) {
  const response = await fetch(target(baseUrl, "/"));
  invariant(response.ok, `Home HTML discovery returned HTTP ${response.status}`);
  const scripts = moduleScriptUrls(await response.text(), baseUrl);
  const ledgerPattern = scripts.find((url) => /index\.astro_astro_type_script_index_0_lang.*\.js(?:[?#]|$)/i.test(url));
  if (ledgerPattern) return { candidates: scripts, discovery: "accepted-ledger-pattern", url: ledgerPattern };
  for (const url of scripts) {
    const moduleResponse = await fetch(url);
    if (!moduleResponse.ok) continue;
    const source = await moduleResponse.text();
    if (/home-cinematic-integration|cinematicController|__quantumHomeControllerWatchdog/.test(source)) {
      return { candidates: scripts, discovery: "module-content", url };
    }
  }
  throw new Error(`outer Home entry module was not discoverable among ${scripts.length} module scripts`);
}

export function assertion(name, pass, actual, expected) {
  return { actual, expected, name, pass: Boolean(pass) };
}

export function finishCheck(id, beforeEvidence, evidence, assertions) {
  return {
    assertions,
    beforeEvidence,
    evidence,
    id,
    status: assertions.every(({ pass }) => pass) ? "PASS" : "FAIL",
  };
}

function errorCheck(definition, error) {
  return {
    assertions: [],
    beforeEvidence: definition.beforeEvidence,
    error: error instanceof Error ? error.message : String(error),
    evidence: null,
    id: definition.id,
    status: "ERROR",
  };
}

function startDiagnostics(page) {
  const diagnostics = { consoleErrors: [], pageErrors: [], requestFailures: [], requests: [] };
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push({ location: message.location(), text: message.text() });
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push({ message: error.message, name: error.name }));
  page.on("request", (request) => diagnostics.requests.push({ resourceType: request.resourceType(), url: request.url() }));
  page.on("requestfailed", (request) => diagnostics.requestFailures.push({ error: request.failure()?.errorText ?? "unknown", url: request.url() }));
  return diagnostics;
}

async function createContext(browser, options = {}) {
  const context = await browser.newContext({
    reducedMotion: options.reducedMotion ?? "no-preference",
    serviceWorkers: "block",
    viewport: options.viewport ?? DESKTOP,
  });
  await context.addInitScript(() => {
    const cls = { entries: [], value: 0 };
    globalThis.__phase6RepairCls = cls;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          cls.value += entry.value;
          cls.entries.push({ startTime: entry.startTime, value: entry.value });
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
    } catch { /* Chromium capability probe */ }
  });
  return context;
}

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function homeEvidence(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector("[data-cinematic-shell]");
    const stage = document.querySelector("[data-cinematic-stage]");
    const runway = document.querySelector(".cinematic-runway");
    const poster = document.querySelector("[data-cinematic-poster]");
    const video = document.querySelector("[data-cinematic-media]");
    const entry = document.querySelector("#entry");
    const h1 = document.querySelector("main h1");
    const header = document.querySelector(".site-header");
    const usable = (element) => {
      if (!element || element.closest("[inert],[hidden],[aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
    };
    const media = video ? {
      currentSrc: video.currentSrc,
      currentTime: video.currentTime,
      paused: video.paused,
      readyState: video.readyState,
      seeking: video.seeking,
      src: video.getAttribute("src") ?? "",
    } : null;
    return {
      cls: globalThis.__phase6RepairCls?.value ?? null,
      cinematicInteractive: shell?.getAttribute("data-cinematic-interactive") ?? null,
      cinematicFootprintHeight: shell && entry
        ? entry.getBoundingClientRect().bottom - shell.getBoundingClientRect().top
        : null,
      cohort: root.dataset.cinematicCohort ?? null,
      controller: root.dataset.cinematicController ?? null,
      fallback: root.dataset.cinematicFallback ?? null,
      h1Usable: usable(h1),
      headerInert: header?.hasAttribute("inert") ?? null,
      entryIntent: root.dataset.cinematicEntryIntent ?? null,
      inertCount: document.querySelectorAll("[inert]").length,
      media,
      mediaFamily: shell?.getAttribute("data-media-family") ?? null,
      mediaState: shell?.getAttribute("data-media-state") ?? null,
      manifestoReveal: shell?.getAttribute("data-manifesto-reveal") ?? null,
      mode: root.dataset.cinematicMode ?? null,
      navUsable: [...document.querySelectorAll(".desktop-nav a[href]")].some(usable),
      poster: poster ? {
        display: getComputedStyle(poster).display,
        opacity: Number(getComputedStyle(poster).opacity),
        visibility: getComputedStyle(poster).visibility,
      } : null,
      routeNavigation: shell?.getAttribute("data-route-navigation") ?? null,
      runwayHeight: runway?.getBoundingClientRect().height ?? null,
      shellHeight: shell?.getBoundingClientRect().height ?? null,
      stageVisibility: stage ? getComputedStyle(stage).visibility : null,
      scrollY,
      viewportHeight: innerHeight,
      watchdogPending: typeof globalThis.__quantumHomeControllerWatchdog === "number",
    };
  });
}

function noActiveHomeMedia(evidence) {
  const media = evidence.media;
  return Boolean(media && !media.src && !media.currentSrc && media.readyState === 0 && media.paused);
}

async function runOuterModuleWatchdogProbe(browser, options, moduleDiscovery, { pathname = "/", progress = false } = {}) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const diagnostics = startDiagnostics(page);
  let moduleAborted = false;
  await page.route((url) => url.href === moduleDiscovery.url, (route) => {
    moduleAborted = true;
    return route.abort("blockedbyclient");
  });
  try {
    await page.goto(target(options.baseUrl, pathname), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    let beforeTimeout = null;
    if (progress) {
      for (let index = 0; index < 5; index += 1) {
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(40);
      }
      await twoFrames(page);
      beforeTimeout = await homeEvidence(page);
    }
    await page.waitForFunction(() => [
      "controller-timeout",
      "controller-timeout-preserve-runway",
    ].includes(document.documentElement.dataset.cinematicFallback ?? ""), undefined, { timeout: options.timeoutMs }).catch(() => undefined);
    await twoFrames(page);
    const afterTimeout = await homeEvidence(page);
    await page.waitForTimeout(350);
    await twoFrames(page);
    const stable = await homeEvidence(page);
    return { ...afterTimeout, beforeTimeout, diagnostics, moduleAborted, moduleDiscovery, pathname, stable };
  } finally {
    await context.close();
  }
}

async function runControllerWatchdog(browser, options, moduleDiscovery) {
  const definition = REPAIR_CASES[0];
  const outerModule = await runOuterModuleWatchdogProbe(browser, options, moduleDiscovery);
  const progressedOuterModule = await runOuterModuleWatchdogProbe(browser, options, moduleDiscovery, { progress: true });
  const semanticEntryOuterModule = await runOuterModuleWatchdogProbe(browser, options, moduleDiscovery, { pathname: "/#entry" });

  let innerController;
  const innerContext = await createContext(browser);
  const innerPage = await innerContext.newPage();
  const innerDiagnostics = startDiagnostics(innerPage);
  let innerChunkUrl = null;
  let innerChunkStallMs = 0;
  let settleInnerRoute;
  const innerRouteSettled = new Promise((resolve) => { settleInnerRoute = resolve; });
  await innerPage.route(HOME_CONTROLLER_CHUNK, async (route) => {
    innerChunkUrl = route.request().url();
    const startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, CONTROLLER_CHUNK_STALL_MS));
    try {
      await route.abort("timedout");
    } finally {
      innerChunkStallMs = Date.now() - startedAt;
      settleInnerRoute();
    }
  });
  try {
    await innerPage.goto(target(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await innerPage.waitForFunction(() => document.documentElement.dataset.cinematicFallback === "controller-timeout", undefined, { timeout: options.timeoutMs }).catch(() => undefined);
    if (innerChunkUrl) await innerRouteSettled;
    await twoFrames(innerPage);
    innerController = { ...(await homeEvidence(innerPage)), diagnostics: innerDiagnostics, innerChunkStallMs, innerChunkUrl };
  } finally {
    await innerContext.close();
  }

  const evidence = { innerController, outerModule, progressedOuterModule, semanticEntryOuterModule };
  const released = (record) => record.inertCount === 0
    && record.headerInert === false
    && record.h1Usable
    && record.navUsable
    && record.watchdogPending === false
    && record.cinematicInteractive === "true"
    && record.routeNavigation === "released";
  const coherentStatic = (record) => record.mode === "static"
    && record.fallback === "controller-timeout"
    && record.mediaState === "failed"
    && released(record);
  const coherentPreserved = (record) => record.mode === "enhanced"
    && record.fallback === "controller-timeout-preserve-runway"
    && record.mediaState === "failed-preserve-runway"
    && record.manifestoReveal === "resolved"
    && released(record);
  const compact = (record) => record.cinematicFootprintHeight <= record.viewportHeight * 2.05;
  const progressedBefore = progressedOuterModule.beforeTimeout;
  const progressedGeometryRetained = progressedBefore
    && Math.abs(progressedOuterModule.cinematicFootprintHeight - progressedBefore.cinematicFootprintHeight) <= 1
    && Math.abs(progressedOuterModule.runwayHeight - progressedBefore.runwayHeight) <= 1
    && progressedOuterModule.cinematicFootprintHeight > progressedOuterModule.viewportHeight * 5;
  const progressedTerminalStable = progressedOuterModule.stable.mode === progressedOuterModule.mode
    && progressedOuterModule.stable.fallback === progressedOuterModule.fallback
    && progressedOuterModule.stable.mediaState === progressedOuterModule.mediaState
    && progressedOuterModule.stable.manifestoReveal === progressedOuterModule.manifestoReveal
    && progressedOuterModule.stable.inertCount === 0;
  return finishCheck(definition.id, definition.beforeEvidence, evidence, [
    assertion("outer Home entry module was aborted in top, progressed and semantic-entry probes", [outerModule, progressedOuterModule, semanticEntryOuterModule].every(({ moduleAborted }) => moduleAborted), [outerModule.moduleAborted, progressedOuterModule.moduleAborted, semanticEntryOuterModule.moduleAborted], [true, true, true]),
    assertion("outer-module watchdog reaches coherent static Home at exact top", coherentStatic(outerModule), outerModule, "controller-timeout static mode, failed media state, no inert regions, usable H1/navigation, no pending watchdog"),
    assertion("outer-module fallback is compact", compact(outerModule), { cinematicFootprintHeight: outerModule.cinematicFootprintHeight, viewportHeight: outerModule.viewportHeight }, "cinematic footprint through #entry <= 2.05 viewports"),
    assertion("inner Home controller chunk was held beyond the watchdog bound", Boolean(innerChunkUrl) && innerChunkStallMs >= 4_000, { innerChunkStallMs, innerChunkUrl }, ">= 4000ms stalled controller chunk"),
    assertion("inner-controller watchdog reaches coherent static Home", coherentStatic(innerController), innerController, "controller-timeout static mode, failed media state, no inert regions, usable H1/navigation, no pending watchdog"),
    assertion("late inner-controller rejection preserves controller-timeout", innerController.fallback === "controller-timeout", innerController.fallback, "controller-timeout"),
    assertion("inner-controller fallback is compact", compact(innerController), { cinematicFootprintHeight: innerController.cinematicFootprintHeight, viewportHeight: innerController.viewportHeight }, "cinematic footprint through #entry <= 2.05 viewports"),
    assertion("progressed watchdog retains native scroll without CLS", progressedBefore && progressedBefore.scrollY > 0 && Math.abs(progressedOuterModule.scrollY - progressedBefore.scrollY) <= 1 && progressedOuterModule.cls === 0, { afterScrollY: progressedOuterModule.scrollY, beforeScrollY: progressedBefore?.scrollY ?? null, cls: progressedOuterModule.cls }, "positive scroll retained within 1px and CLS 0"),
    assertion("progressed watchdog preserves committed runway geometry", progressedGeometryRetained, { afterFootprint: progressedOuterModule.cinematicFootprintHeight, afterRunway: progressedOuterModule.runwayHeight, beforeFootprint: progressedBefore?.cinematicFootprintHeight ?? null, beforeRunway: progressedBefore?.runwayHeight ?? null }, "runway/footprint retained within 1px and footprint > 5 viewports"),
    assertion("progressed watchdog releases a coherent non-running enhanced fallback", coherentPreserved(progressedOuterModule), progressedOuterModule, "enhanced controller-timeout-preserve-runway, resolved manifesto, released interaction/navigation, zero inert"),
    assertion("progressed watchdog terminal fallback remains stable", progressedTerminalStable, { after: { fallback: progressedOuterModule.fallback, manifestoReveal: progressedOuterModule.manifestoReveal, mediaState: progressedOuterModule.mediaState, mode: progressedOuterModule.mode }, stable: { fallback: progressedOuterModule.stable.fallback, manifestoReveal: progressedOuterModule.stable.manifestoReveal, mediaState: progressedOuterModule.stable.mediaState, mode: progressedOuterModule.stable.mode } }, "terminal preserve-runway state unchanged after quiet"),
    assertion("semantic #entry watchdog preserves runway and releases pending intent", coherentPreserved(semanticEntryOuterModule) && semanticEntryOuterModule.entryIntent === null, semanticEntryOuterModule, "enhanced controller-timeout-preserve-runway with resolved manifesto, released semantics and no pending intent"),
  ]);
}

async function runExactTopMediaFailure(browser, options) {
  const definition = REPAIR_CASES[1];
  const context = await createContext(browser);
  const page = await context.newPage();
  const diagnostics = startDiagnostics(page);
  const blocked = [];
  await page.route(HOME_H264, (route) => {
    blocked.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  try {
    await page.goto(target(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "static" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "failed", undefined, { timeout: options.timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(250);
    const evidence = { ...(await homeEvidence(page)), blocked, diagnostics };
    return finishCheck(definition.id, definition.beforeEvidence, evidence, [
      assertion("selected Home H264 was blocked", blocked.length === 1, blocked, "one blocked H264 request"),
      assertion("fresh exact-top media failure becomes static", evidence.mode === "static" && evidence.mediaState === "failed" && evidence.scrollY === 0, { mode: evidence.mode, mediaState: evidence.mediaState, scrollY: evidence.scrollY }, { mode: "static", mediaState: "failed", scrollY: 0 }),
      assertion("exact-top cinematic failure is compact", evidence.cinematicFootprintHeight <= evidence.viewportHeight * 2.05, { cinematicFootprintHeight: evidence.cinematicFootprintHeight, shellHeight: evidence.shellHeight, viewportHeight: evidence.viewportHeight }, "cinematic footprint through #entry <= 2.05 viewports"),
      assertion("P6-010 exact-top collapse has zero CLS", evidence.cls === 0, evidence.cls, 0),
      assertion("failed Home owns no active media source or decoder", noActiveHomeMedia(evidence), evidence.media, { src: "", currentSrc: "", readyState: 0, paused: true }),
    ]);
  } finally {
    await context.close();
  }
}

async function wheelToTop(page) {
  let attempts = 0;
  while (attempts < 24 && await page.evaluate(() => scrollY) > 0) {
    await page.mouse.wheel(0, -900);
    await page.waitForTimeout(55);
    attempts += 1;
  }
  await twoFrames(page);
  return attempts;
}

async function runEntryFailureReverse(browser, options) {
  const definition = REPAIR_CASES[2];
  const context = await createContext(browser);
  const page = await context.newPage();
  const diagnostics = startDiagnostics(page);
  const blocked = [];
  await page.route(HOME_H264, (route) => {
    blocked.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  try {
    await page.goto(target(options.baseUrl, "/#entry"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForFunction(() => {
      const shell = document.querySelector("[data-cinematic-shell]");
      return shell?.getAttribute("data-media-state") === "failed-preserve-runway"
        && !document.documentElement.dataset.cinematicEntryIntent;
    }, undefined, { timeout: options.timeoutMs }).catch(() => undefined);
    const beforeReverse = await homeEvidence(page);
    const wheelAttempts = await wheelToTop(page);
    await page.waitForTimeout(180);
    const evidence = { afterReverse: await homeEvidence(page), beforeReverse, blocked, diagnostics, wheelAttempts };
    const after = evidence.afterReverse;
    const posterVisible = after.stageVisibility === "visible" && after.poster?.display !== "none" && after.poster?.visibility === "visible" && after.poster.opacity > 0.99;
    return finishCheck(definition.id, definition.beforeEvidence, evidence, [
      assertion("semantic-entry media request was blocked", blocked.length === 1, blocked, "one blocked H264 request"),
      assertion("semantic entry intent clears after failed-media positioning", beforeReverse.entryIntent === null && after.entryIntent === null, { before: beforeReverse.entryIntent, after: after.entryIntent }, null),
      assertion("native reverse wheel reaches document top", after.scrollY === 0 && wheelAttempts > 0, { scrollY: after.scrollY, wheelAttempts }, { scrollY: 0, wheelAttempts: "> 0" }),
      assertion("reverse traversal reveals the governed stage and poster", posterVisible, { stageVisibility: after.stageVisibility, poster: after.poster }, { stageVisibility: "visible", posterOpacity: 1 }),
      assertion("failed entry media is released", noActiveHomeMedia(after), after.media, { src: "", currentSrc: "", readyState: 0, paused: true }),
    ]);
  } finally {
    await context.close();
  }
}

async function runSquareFamily(browser, options) {
  const definition = REPAIR_CASES[3];
  const context = await createContext(browser, { viewport: SQUARE });
  const page = await context.newPage();
  const diagnostics = startDiagnostics(page);
  const fontDelayMs = 2_000;
  await page.route(/\/fonts\/.*\.woff2(?:[?#]|$)/i, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, fontDelayMs));
    await route.continue();
  });
  try {
    const selectedH264 = page.waitForRequest((request) => /portrait-h264.*\.mp4(?:[?#]|$)/i.test(request.url()), { timeout: options.timeoutMs }).catch(() => null);
    await page.goto(target(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await selectedH264;
    await page.waitForTimeout(180);
    const home = await homeEvidence(page);
    const urls = diagnostics.requests.map(({ url }) => url);
    const h264 = urls.filter((url) => /h264.*\.mp4(?:[?#]|$)/i.test(url));
    const posters = diagnostics.requests
      .filter(({ resourceType, url }) => resourceType === "image" && /\/media\/cinematic\/.*(?:poster|dormant).*\.png(?:[?#]|$)/i.test(url))
      .map(({ url }) => url);
    const vp9 = urls.filter((url) => /vp9|\.webm(?:[?#]|$)/i.test(url));
    const evidence = {
      ...home,
      diagnostics,
      fontReadinessControl: `font responses delayed ${fontDelayMs}ms so the candidate cohort is measured before post-font typography fallback`,
      h264,
      posters,
      vp9,
    };
    return finishCheck(definition.id, definition.beforeEvidence, evidence, [
      assertion("exact square uses portrait bootstrap and controller family", evidence.cohort === "portrait" && evidence.mediaFamily === "portrait", { cohort: evidence.cohort, mediaFamily: evidence.mediaFamily }, { cohort: "portrait", mediaFamily: "portrait" }),
      assertion("exact square requests only a portrait poster", posters.length === 1 && posters.every((url) => /portrait-poster|dormant-mobile/i.test(url)), posters, "one portrait poster request"),
      assertion("exact square requests exactly one portrait H264", h264.length === 1 && /portrait-h264/i.test(h264[0]), h264, "one portrait H264 request"),
      assertion("exact square requests no VP9/WebM authority", vp9.length === 0, vp9, []),
    ]);
  } finally {
    await context.close();
  }
}

async function fractionalState(page) {
  return page.evaluate(() => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const video = document.querySelector("[data-cinematic-media]");
    return {
      cinematicProgress: Number(shell?.getAttribute("data-cinematic-progress") ?? NaN),
      conceptualFrame: Number(shell?.getAttribute("data-conceptual-frame") ?? NaN),
      currentTime: video?.currentTime ?? null,
      paused: video?.paused ?? null,
      presentedFrame: Number(shell?.getAttribute("data-presented-frame") ?? NaN),
      scrollY,
      seeking: video?.seeking ?? null,
      targetFrame: Number(shell?.getAttribute("data-target-frame") ?? NaN),
    };
  });
}

async function runPositiveFractionalWheel(browser, options) {
  const definition = REPAIR_CASES[4];
  const context = await createContext(browser);
  const page = await context.newPage();
  const diagnostics = startDiagnostics(page);
  try {
    await page.goto(target(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "ready", undefined, { timeout: options.timeoutMs }).catch(() => undefined);
    const before = await fractionalState(page);
    await page.mouse.move(DESKTOP.width / 2, DESKTOP.height / 2);
    const attemptedDeltas = [];
    for (const deltaY of [0.25, 0.25, 0.5, 1]) {
      attemptedDeltas.push(deltaY);
      await page.mouse.wheel(0, deltaY);
      await page.waitForTimeout(70);
      if (await page.evaluate(() => scrollY > 0)) break;
    }
    await page.waitForFunction(() => Number(document.querySelector("[data-cinematic-shell]")?.getAttribute("data-conceptual-frame")) >= 46, undefined, { timeout: 2_500 }).catch(() => undefined);
    await page.waitForFunction(() => document.querySelector("[data-cinematic-media]")?.seeking === false, undefined, { timeout: 2_500 }).catch(() => undefined);
    await page.waitForTimeout(120);
    const firstRest = await fractionalState(page);
    await page.waitForTimeout(420);
    const secondRest = await fractionalState(page);
    const evidence = { attemptedDeltas, before, diagnostics, firstRest, secondRest };
    const frozen = firstRest.paused === true
      && secondRest.paused === true
      && Math.abs(secondRest.currentTime - firstRest.currentTime) <= 0.002
      && secondRest.targetFrame === firstRest.targetFrame
      && secondRest.conceptualFrame === firstRest.conceptualFrame;
    return finishCheck(definition.id, definition.beforeEvidence, evidence, [
      assertion("fresh enhanced Home begins at exact zero", before.scrollY === 0, before.scrollY, 0),
      assertion("fractional Playwright wheel inputs were exercised", attemptedDeltas.some((delta) => delta > 0 && delta < 1), attemptedDeltas, "includes 0 < deltaY < 1"),
      assertion("tiny positive Playwright wheel produces positive native offset", firstRest.scrollY > 0, firstRest.scrollY, "> 0"),
      assertion("every observed positive offset maps to F46 or later", firstRest.conceptualFrame >= 46 && firstRest.targetFrame >= 46, { conceptualFrame: firstRest.conceptualFrame, targetFrame: firstRest.targetFrame }, ">= 46"),
      assertion("paused decoder and mapped frame freeze at rest", frozen, { firstRest, secondRest }, "paused with stable time and frame"),
    ]);
  } finally {
    await context.close();
  }
}

async function maradinPlayers(page) {
  return page.evaluate(() => ({
    players: [...document.querySelectorAll("[data-maradin-player]")].map((player) => {
      const video = player.querySelector("[data-maradin-video]");
      const launch = player.querySelector("[data-maradin-play]");
      return {
        currentSrc: video?.currentSrc ?? "",
        launchHidden: launch?.hidden ?? null,
        readyState: video?.readyState ?? null,
        src: video?.getAttribute("src") ?? "",
        state: player.getAttribute("data-video-state"),
        tabIndex: video?.tabIndex ?? null,
      };
    }),
  }));
}

function playersDormant(state) {
  return state.players.length === 2 && state.players.every((player) => (
    player.state === "dormant"
      && player.src === ""
      && player.readyState === 0
      && player.tabIndex === -1
      && player.launchHidden === false
  ));
}

function onePlayerActive(state) {
  return state.players.filter((player) => player.state === "active" && Boolean(player.src)).length === 1;
}

async function dispatchPersisted(page, type) {
  return page.evaluate((eventType) => {
    let event;
    let constructor = "PageTransitionEvent";
    try {
      event = new PageTransitionEvent(eventType, { persisted: true });
    } catch {
      constructor = "Event-with-persisted";
      event = new Event(eventType);
      Object.defineProperty(event, "persisted", { value: true });
    }
    dispatchEvent(event);
    return { constructor, persisted: event.persisted === true, type: event.type };
  }, type);
}

async function waitDormant(page) {
  await page.waitForFunction(() => [...document.querySelectorAll("[data-maradin-player]")].every((player) => {
    const video = player.querySelector("[data-maradin-video]");
    const launch = player.querySelector("[data-maradin-play]");
    return player.getAttribute("data-video-state") === "dormant"
      && !video?.hasAttribute("src")
      && video?.readyState === 0
      && launch?.hidden === false;
  }), undefined, { timeout: 3_000 }).catch(() => undefined);
}

async function clickPlayer(page, index, options) {
  await page.locator("[data-maradin-play]").nth(index).click({ timeout: options.timeoutMs });
  await page.waitForFunction((expected) => {
    const players = [...document.querySelectorAll("[data-maradin-player]")];
    return players[expected]?.getAttribute("data-video-state") === "active";
  }, index, { timeout: 3_000 }).catch(() => undefined);
  return maradinPlayers(page);
}

async function runRepeatedPersistedLifecycle(browser, options) {
  const definition = REPAIR_CASES[5];
  const context = await createContext(browser);
  const page = await context.newPage();
  const diagnostics = startDiagnostics(page);
  try {
    await page.goto(target(options.baseUrl, "/pocs/maradin/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    const firstInitiation = await clickPlayer(page, 0, options);
    const firstPagehide = await dispatchPersisted(page, "pagehide");
    await waitDormant(page);
    const firstRelease = await maradinPlayers(page);
    const firstPageshow = await dispatchPersisted(page, "pageshow");
    const secondInitiation = await clickPlayer(page, 1, options);
    const secondPagehide = await dispatchPersisted(page, "pagehide");
    await waitDormant(page);
    const secondRelease = await maradinPlayers(page);
    const secondPageshow = await dispatchPersisted(page, "pageshow");
    const thirdInitiation = await clickPlayer(page, 0, options);
    const evidence = {
      diagnostics,
      firstInitiation,
      firstPagehide,
      firstPageshow,
      firstRelease,
      secondInitiation,
      secondPagehide,
      secondPageshow,
      secondRelease,
      thirdInitiation,
    };
    return finishCheck(definition.id, definition.beforeEvidence, evidence, [
      assertion("first persisted pagehide releases both sources and decoders", playersDormant(firstRelease), firstRelease, "two dormant source-free readyState=0 players"),
      assertion("first persisted pageshow permits re-initiation", firstPagehide.persisted && firstPageshow.persisted && onePlayerActive(secondInitiation), { firstPagehide, firstPageshow, secondInitiation }, "persisted lifecycle followed by one active player"),
      assertion("second persisted pagehide also releases both sources and decoders", playersDormant(secondRelease), secondRelease, "two dormant source-free readyState=0 players"),
      assertion("second persisted pageshow still permits re-initiation", secondPagehide.persisted && secondPageshow.persisted && onePlayerActive(thirdInitiation), { secondPagehide, secondPageshow, thirdInitiation }, "persisted lifecycle followed by one active player"),
    ]);
  } finally {
    await context.close();
  }
}

async function runMaradinFailure(browser, options) {
  const definition = REPAIR_CASES[6];
  const context = await createContext(browser);
  const page = await context.newPage();
  const diagnostics = startDiagnostics(page);
  const blocked = [];
  await page.route(MARADIN_MP4, (route) => {
    blocked.push(route.request().url());
    return route.abort("failed");
  });
  try {
    await page.goto(target(options.baseUrl, "/pocs/maradin/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.locator("[data-maradin-play]").first().click({ timeout: options.timeoutMs });
    await waitDormant(page);
    const players = await maradinPlayers(page);
    const evidence = { blocked, diagnostics, players };
    return finishCheck(definition.id, definition.beforeEvidence, evidence, [
      assertion("initiated Maradin media request failed", blocked.length === 1, blocked, "one failed MP4 request"),
      assertion("media failure restores both players to retryable dormancy", playersDormant(players), players, "two dormant source-free readyState=0 players with launches visible"),
    ]);
  } finally {
    await context.close();
  }
}

async function runSharedDomChecks(browser, options) {
  const context = await createContext(browser, { reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto(target(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    const home = await page.evaluate(() => ({
      footerHref: document.querySelector(".site-footer .brand-link")?.getAttribute("href") ?? null,
      logos: [...document.querySelectorAll(".site-header .brand-link img,.site-footer .brand-link img")].map((image) => ({
        height: image.getAttribute("height"),
        width: image.getAttribute("width"),
      })),
    }));
    const response = await page.goto(target(options.baseUrl, "/__phase6-intentional-404__/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    const notFound = await page.evaluate(() => ({
      href: document.querySelector(".recovery-link")?.getAttribute("href") ?? null,
      route: document.querySelector("[data-route-production]")?.getAttribute("data-route-production") ?? null,
    }));
    const evidence = { home, notFound, status: response?.status() ?? null };
    return finishCheck("shared-home-intent-and-logo-dom", SHARED_DOM_EVIDENCE, evidence, [
      assertion("header and footer logo metadata reserve 242x182", home.logos.length === 2 && home.logos.every(({ width, height }) => width === "242" && height === "182"), home.logos, [{ width: "242", height: "182" }, { width: "242", height: "182" }]),
      assertion("footer intentional Home action targets /#entry", home.footerHref === "/#entry", home.footerHref, "/#entry"),
      assertion("real 404 recovery Home action targets /#entry", evidence.status === 404 && notFound.route === "404" && notFound.href === "/#entry", { status: evidence.status, ...notFound }, { status: 404, route: "404", href: "/#entry" }),
    ]);
  } finally {
    await context.close();
  }
}

function allFailures(checks) {
  return checks.flatMap((check) => {
    if (check.status === "PASS") return [];
    if (check.status === "ERROR") return [{ beforeEvidence: check.beforeEvidence, check: check.id, error: check.error, status: check.status }];
    return check.assertions.filter(({ pass }) => !pass).map((failure) => ({ beforeEvidence: check.beforeEvidence, check: check.id, failure, status: check.status }));
  });
}

export function validateReport(report) {
  invariant(report.schema === SCHEMA, "repair-regression report schema differs");
  invariant(report.beforeEvidence.acceptedBaselineSha === BASELINE_SHA, "before-evidence baseline SHA differs");
  invariant(report.checks.length === REPAIR_CASES.length, "repair-regression report must contain exactly seven primary checks");
  invariant(JSON.stringify(report.checks.map(({ id }) => id)) === JSON.stringify(REPAIR_CASES.map(({ id }) => id)), "repair-regression check order or identity differs");
  for (let index = 0; index < REPAIR_CASES.length; index += 1) {
    invariant(JSON.stringify(report.checks[index].beforeEvidence) === JSON.stringify(REPAIR_CASES[index].beforeEvidence), `${REPAIR_CASES[index].id} before-evidence identifier differs`);
  }
  invariant(JSON.stringify(report.sharedDom.beforeEvidence) === JSON.stringify(SHARED_DOM_EVIDENCE), "shared DOM before-evidence identifiers differ");
  if (report.status === "PASS") invariant(report.failures.length === 0, "PASS repair-regression report contains failures");
  return true;
}

export async function runRepairRegressions(options) {
  const baseResponse = await fetch(options.baseUrl, { redirect: "manual" });
  invariant(baseResponse.status >= 200 && baseResponse.status < 400, `base URL returned HTTP ${baseResponse.status}`);
  const moduleDiscovery = await discoverHomeEntryModule(options.baseUrl);
  const executablePath = await resolveChromium(options.browser);
  const browser = await chromium.launch({
    args: ["--disable-background-networking", "--disable-extensions"],
    executablePath,
    headless: !options.headed,
  });
  const runners = [
    () => runControllerWatchdog(browser, options, moduleDiscovery),
    () => runExactTopMediaFailure(browser, options),
    () => runEntryFailureReverse(browser, options),
    () => runSquareFamily(browser, options),
    () => runPositiveFractionalWheel(browser, options),
    () => runRepeatedPersistedLifecycle(browser, options),
    () => runMaradinFailure(browser, options),
  ];
  try {
    const checks = [];
    for (let index = 0; index < runners.length; index += 1) {
      try {
        checks.push(await runners[index]());
      } catch (error) {
        checks.push(errorCheck(REPAIR_CASES[index], error));
      }
    }
    let sharedDom;
    try {
      sharedDom = await runSharedDomChecks(browser, options);
    } catch (error) {
      sharedDom = {
        assertions: [],
        beforeEvidence: SHARED_DOM_EVIDENCE,
        error: error instanceof Error ? error.message : String(error),
        evidence: null,
        id: "shared-home-intent-and-logo-dom",
        status: "ERROR",
      };
    }
    const failures = allFailures([...checks, sharedDom]);
    const report = {
      beforeEvidence: {
        acceptedBaselineSha: BASELINE_SHA,
        identifiers: [...REPAIR_CASES.flatMap(({ beforeEvidence }) => Array.isArray(beforeEvidence) ? beforeEvidence : [beforeEvidence]), ...SHARED_DOM_EVIDENCE],
        source: "PHASE_6_DEFECT_LEDGER.md",
      },
      browser: { executablePath, headed: options.headed, name: "Chromium", version: browser.version() },
      checks,
      failures,
      generatedAt: new Date().toISOString(),
      schema: SCHEMA,
      sharedDom,
      status: failures.length ? "FAIL" : "PASS",
      target: { baseUrl: options.baseUrl, timeoutMs: options.timeoutMs },
      viewport: { default: DESKTOP, square: SQUARE },
    };
    validateReport(report);
    return report;
  } finally {
    await browser.close();
  }
}

export function runSelfTest() {
  const options = parseArguments(["--self-test"]);
  const fixture = '<script src="/_astro/shared.js" type="module"></script><script type="module" src="/_astro/index.astro_astro_type_script_index_0_lang.ABC.js"></script>';
  const urls = moduleScriptUrls(fixture, options.baseUrl);
  invariant(urls.length === 2 && /index\.astro_astro_type_script_index_0_lang/.test(urls[1]), "module discovery self-test differs");
  invariant(REPAIR_CASES.length === 7, "primary repair case count differs");
  const primaryIdentifiers = REPAIR_CASES.flatMap(({ beforeEvidence }) => Array.isArray(beforeEvidence) ? beforeEvidence : [beforeEvidence]);
  invariant(new Set(primaryIdentifiers).size === 8, "primary before-evidence identifiers must be unique");
  invariant(SHARED_DOM_EVIDENCE.join(",") === "P6-008,P6-009", "shared DOM before-evidence identifiers differ");
  assertExternalOutputPath(path.resolve(ROOT, "..", "phase-6-work", "phase6-repair-self-test.json"));
  const probe = finishCheck("fixture", "P6-000", { observed: true }, [assertion("fixture passes", true, true, true)]);
  invariant(probe.status === "PASS", "assertion aggregation self-test differs");
  return {
    beforeEvidence: [...primaryIdentifiers, ...SHARED_DOM_EVIDENCE],
    cases: REPAIR_CASES.length,
    schema: SCHEMA,
    sharedDomChecks: SHARED_DOM_EVIDENCE.length,
    status: "PASS",
  };
}

function usage() {
  return [
    "Usage: node scripts/qa-phase6-repair-regressions.mjs --base-url <preview> --output <external-fresh.json> [--browser <path>] [--timeout-ms 12000] [--headed]",
    "       node scripts/qa-phase6-repair-regressions.mjs --self-test",
  ].join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
    return;
  }
  await assertFreshExternalOutput(options.output);
  const report = await runRepairRegressions(options);
  await writeFreshExternal(options.output, report);
  process.stdout.write(`${JSON.stringify({ failures: report.failures.length, output: options.output, status: report.status }, null, 2)}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 6 repair-regression QA failed: ${error.message}`);
  process.exitCode = 1;
});
