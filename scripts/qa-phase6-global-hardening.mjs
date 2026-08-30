import { constants as fsConstants } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "playwright-core";

import {
  EXPECTED_MATRIX_CASES,
  HISTORY_VIEWPORT,
  HOME_CHECK_VIEWPORT,
  MARADIN_VIEWPORT,
  PHASE6_ENGINES,
  PHASE6_ROUTES,
  PHASE6_SCHEMA,
  matrixForEngine,
  routeById,
  validatePhase6Contract,
} from "./phase6-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BROWSER_TYPES = Object.freeze({ chromium, webkit, firefox });
const TARGET_MINIMUM_PX = 44;
const OVERFLOW_TOLERANCE_PX = 2;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4338/",
    engine: "all",
    headed: false,
    output: "",
    selfTest: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-url") {
      options.baseUrl = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument === "--engine") {
      options.engine = valueAfter(argv, index, argument).toLowerCase();
      index += 1;
    } else if (argument === "--headed") {
      options.headed = true;
    } else if (argument === "--output") {
      options.output = path.resolve(valueAfter(argv, index, argument));
      index += 1;
    } else if (argument === "--timeout-ms") {
      options.timeoutMs = Number(valueAfter(argv, index, argument));
      index += 1;
    } else if (argument === "--self-test") {
      options.selfTest = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (![...PHASE6_ENGINES, "all"].includes(options.engine)) {
    throw new Error("--engine must be chromium, webkit, firefox or all");
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5_000) {
    throw new Error("--timeout-ms must be at least 5000");
  }
  const parsedBaseUrl = new URL(options.baseUrl);
  if (!["http:", "https:"].includes(parsedBaseUrl.protocol)) throw new Error("--base-url must use HTTP or HTTPS");
  parsedBaseUrl.hash = "";
  parsedBaseUrl.search = "";
  if (!parsedBaseUrl.pathname.endsWith("/")) parsedBaseUrl.pathname += "/";
  options.baseUrl = parsedBaseUrl.toString();
  if (!options.help && !options.selfTest && !options.output) throw new Error("--output is required for a browser run");
  return options;
}

function pathIsWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertExternalOutputPath(filePath) {
  const resolved = path.resolve(filePath);
  assert(path.extname(resolved).toLowerCase() === ".json", "--output must be a JSON file");
  assert(!pathIsWithin(ROOT, resolved), "Phase 6 output must remain external and untracked (outside the repository)");
  assert(!pathIsWithin(os.tmpdir(), resolved), "Phase 6 output must not use OS temporary storage");
  return resolved;
}

export async function assertFreshExternalOutput(filePath) {
  const resolved = assertExternalOutputPath(filePath);
  try {
    await stat(resolved);
    throw new Error(`refusing to overwrite existing Phase 6 evidence: ${resolved}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return resolved;
}

async function writeFreshExternal(filePath, contents) {
  const resolved = await assertFreshExternalOutput(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, contents, { encoding: "utf8", flag: "wx" });
}

function selectedEngines(engine) {
  return engine === "all" ? [...PHASE6_ENGINES] : [engine];
}

function targetUrl(baseUrl, routePath) {
  return new URL(routePath, baseUrl).toString();
}

async function settle(page, timeoutMs) {
  await page.waitForLoadState("load", { timeout: timeoutMs }).catch(() => undefined);
  await page.waitForFunction(
    () => !document.fonts || document.fonts.status === "loaded",
    undefined,
    { timeout: Math.min(timeoutMs, 2_000) },
  ).catch(() => undefined);
  await page.waitForTimeout(112);
}

function startDiagnostics(page) {
  const report = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requests: [],
  };
  const byRequest = new Map();
  const handlers = {
    console(message) {
      const record = { text: message.text(), location: message.location() };
      if (message.type() === "error") report.consoleErrors.push(record);
      else if (message.type() === "warning") report.consoleWarnings.push(record);
    },
    pageerror(error) {
      report.pageErrors.push({ message: error.message, name: error.name });
    },
    request(request) {
      const record = {
        failure: null,
        isNavigation: request.isNavigationRequest(),
        method: request.method(),
        resourceType: request.resourceType(),
        status: null,
        url: request.url(),
      };
      byRequest.set(request, record);
      report.requests.push(record);
    },
    response(response) {
      const request = response.request();
      const record = byRequest.get(request);
      if (record) {
        record.status = response.status();
        record.fromServiceWorker = response.fromServiceWorker();
      }
    },
    requestfailed(request) {
      const record = byRequest.get(request);
      if (record) record.failure = request.failure()?.errorText ?? "unknown";
    },
  };
  for (const [event, handler] of Object.entries(handlers)) page.on(event, handler);
  return {
    stop() {
      for (const [event, handler] of Object.entries(handlers)) page.off(event, handler);
      return structuredClone(report);
    },
  };
}

function mergeDiagnostics(...reports) {
  return reports.reduce((merged, report) => {
    for (const key of Object.keys(merged)) merged[key].push(...(report?.[key] ?? []));
    return merged;
  }, { consoleErrors: [], consoleWarnings: [], pageErrors: [], requests: [] });
}

function expected404Console(record, route) {
  return route.expectedStatus === 404 && /failed to load resource.*404|status of 404/i.test(record.text);
}

export function diagnosticFailures(diagnostics, route, baseUrl, options = {}) {
  const failures = [];
  for (const actual of diagnostics.consoleErrors ?? []) {
    if (!expected404Console(actual, route)) failures.push({ code: "console-error", actual });
  }
  for (const actual of diagnostics.consoleWarnings ?? []) failures.push({ code: "console-warning", actual });
  for (const actual of diagnostics.pageErrors ?? []) failures.push({ code: "page-error", actual });
  const expectedOrigin = new URL(baseUrl).origin;
  for (const request of diagnostics.requests ?? []) {
    const url = new URL(request.url);
    if (["http:", "https:"].includes(url.protocol) && url.origin !== expectedOrigin) {
      failures.push({ code: "cross-origin-request", actual: request });
    }
    const expected404Navigation = route.expectedStatus === 404 && request.isNavigation && request.status === 404;
    if (request.status >= 400 && !expected404Navigation) failures.push({ code: "http-error", actual: request });
    if (request.failure) {
      const expectedHomeBlobAbort = route.id === "home" && url.protocol === "blob:";
      const expectedMaradinReleaseAbort = route.id === "maradin"
        && url.origin === expectedOrigin
        && [
          "/media/maradin/maradin-field-aperture-approved.mp4",
          "/media/maradin/maradin-test-contact-approved.mp4",
        ].includes(url.pathname);
      const expectedHomePosterCancellation = route.id === "home"
        && request.resourceType === "image"
        && url.origin === expectedOrigin
        && /^\/media\/cinematic\/phase-4r2\/posters\/phase-4r2-(?:desktop|portrait|landscape)-poster-[a-f0-9]+\.png$/i.test(url.pathname)
        && /NS_BINDING_ABORTED/i.test(request.failure);
      const expectedMediaAbort = options.allowExpectedMediaAbort
        && ["media", "other"].includes(request.resourceType)
        && (expectedHomeBlobAbort || expectedMaradinReleaseAbort)
        && /aborted|cancelled|canceled|NS_ERROR_PARSED_DATA_CACHED/i.test(request.failure);
      if (!(expectedMediaAbort || expectedHomePosterCancellation)) {
        failures.push({ code: "request-failure", actual: request });
      }
    }
  }
  return failures;
}

export function expectedHttpStatus(actual, expected) {
  return actual === expected || (expected === 200 && actual === 304);
}

async function observeSemantics(page) {
  return page.evaluate(({ minimum, tolerance }) => {
    const visible = (element) => {
      if (element.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
    };
    const selector = (element) => {
      if (element.id) return `#${element.id}`;
      const classes = [...element.classList].slice(0, 2).join(".");
      return `${element.localName}${classes ? `.${classes}` : ""}`;
    };
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        bottom: value.bottom,
        height: value.height,
        left: value.left,
        right: value.right,
        top: value.top,
        width: value.width,
      };
    };
    const headings = [...document.querySelectorAll("main h1,main h2,main h3,main h4,main h5,main h6")].map((element) => ({
      level: Number(element.localName.slice(1)),
      text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }));
    const headingIssues = [];
    if (headings.length && headings[0].level !== 1) headingIssues.push({ code: "first-heading-not-h1", actual: headings[0] });
    for (let index = 1; index < headings.length; index += 1) {
      if (headings[index].level - headings[index - 1].level > 1) {
        headingIssues.push({ code: "heading-level-skip", from: headings[index - 1], to: headings[index] });
      }
    }
    const focusable = [...document.querySelectorAll("a[href],button:not([disabled]),summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])")].filter(visible);
    const smallTargets = focusable.flatMap((element) => {
      const value = rect(element);
      return value.width + 0.01 >= minimum && value.height + 0.01 >= minimum
        ? []
        : [{ selector: selector(element), text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 100) ?? "", rect: value }];
    });
    const h1 = [...document.querySelectorAll("main h1")];
    return {
      headingIssues,
      headings,
      h1: {
        count: h1.length,
        text: h1.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""),
      },
      homeIdentity: document.body.classList.contains("home-page") && Boolean(document.querySelector("#entry")),
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) - document.documentElement.clientWidth,
      landmarks: {
        banner: document.querySelectorAll("body > header, body > .site-header").length,
        contentinfo: document.querySelectorAll("body > footer, body > .site-footer").length,
        main: document.querySelectorAll("main").length,
        namedNavigation: document.querySelectorAll("nav[aria-label],nav[aria-labelledby]").length,
      },
      routeIdentity: document.querySelector("[data-route-production]")?.getAttribute("data-route-production") ?? null,
      smallTargets,
      viewport: { height: innerHeight, width: innerWidth },
      withinOverflowTolerance: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) <= document.documentElement.clientWidth + tolerance,
    };
  }, { minimum: TARGET_MINIMUM_PX, tolerance: OVERFLOW_TOLERANCE_PX });
}

export function semanticFailures(observation, route) {
  const failures = [];
  if (observation.h1.count !== 1 || !observation.h1.text[0]) failures.push({ code: "h1", actual: observation.h1 });
  for (const issue of observation.headingIssues) failures.push({ code: issue.code, actual: issue });
  if (observation.landmarks.main !== 1) failures.push({ code: "main-landmark", actual: observation.landmarks.main });
  if (observation.landmarks.banner !== 1) failures.push({ code: "banner-landmark", actual: observation.landmarks.banner });
  if (observation.landmarks.contentinfo !== 1) failures.push({ code: "contentinfo-landmark", actual: observation.landmarks.contentinfo });
  if (observation.landmarks.namedNavigation < 1) failures.push({ code: "navigation-landmark", actual: observation.landmarks.namedNavigation });
  if (!observation.withinOverflowTolerance) failures.push({ code: "horizontal-overflow", actual: observation.horizontalOverflow });
  if (observation.smallTargets.length) failures.push({ code: "target-size", actual: observation.smallTargets });
  if (route.id === "home" ? !observation.homeIdentity : observation.routeIdentity !== route.identity) {
    failures.push({ code: "route-identity", actual: observation.routeIdentity, expected: route.identity });
  }
  return failures;
}

async function probeCapabilities(page) {
  const values = await page.evaluate(() => {
    const entries = globalThis.PerformanceObserver?.supportedEntryTypes ?? [];
    return {
      cssDvh: CSS.supports("height", "100dvh"),
      cssSvh: CSS.supports("height", "100svh"),
      intersectionObserver: "IntersectionObserver" in window,
      layoutShift: entries.includes("layout-shift"),
      longTask: entries.includes("longtask"),
      navigationActivationStart: "PerformanceNavigationTiming" in window && "activationStart" in PerformanceNavigationTiming.prototype,
      pageTransitionEvent: "PageTransitionEvent" in window,
      performanceMemory: "memory" in performance,
      requestVideoFrameCallback: "requestVideoFrameCallback" in HTMLVideoElement.prototype,
      userAgent: navigator.userAgent,
      visualViewport: "visualViewport" in window,
    };
  });
  const labelled = {};
  for (const [name, value] of Object.entries(values)) {
    labelled[name] = name === "userAgent" ? { status: "reported", value } : { status: value ? "supported" : "unsupported" };
  }
  labelled.bfcache = { status: "observable", detail: "reported from pageshow.persisted; absence is not treated as a failure" };
  return labelled;
}

async function resolveManagedExecutable(engine) {
  const browserType = BROWSER_TYPES[engine];
  const executablePath = browserType.executablePath();
  try {
    await access(executablePath, fsConstants.F_OK);
  } catch {
    throw new Error(`Managed ${engine} executable is unavailable at ${executablePath}. Install it with: node .\\node_modules\\playwright-core\\cli.js install ${engine}`);
  }
  return executablePath;
}

async function launchEngine(engine, options) {
  const browserType = BROWSER_TYPES[engine];
  const executablePath = await resolveManagedExecutable(engine);
  const launchOptions = { executablePath, headless: !options.headed };
  if (engine === "chromium") launchOptions.args = ["--disable-background-networking", "--disable-extensions"];
  try {
    const browser = await browserType.launch(launchOptions);
    return { browser, executablePath };
  } catch (error) {
    const headedHint = engine === "firefox" && !options.headed ? " Retry this host with --engine firefox --headed." : "";
    throw new Error(`${engine} launch failed: ${error.message}.${headedHint}`);
  }
}

async function runRouteMatrix(browser, engine, options) {
  const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block" });
  const page = await context.newPage();
  const records = [];
  try {
    for (const { route, viewport } of matrixForEngine(engine)) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const collector = startDiagnostics(page);
      let response = null;
      let observation = null;
      let thrown = null;
      try {
        response = await page.goto(targetUrl(options.baseUrl, route.path), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
        await settle(page, options.timeoutMs);
        observation = await observeSemantics(page);
      } catch (error) {
        thrown = error instanceof Error ? error.message : String(error);
      }
      const diagnostics = collector.stop();
      const failures = [];
      if (thrown) failures.push({ code: "case-error", actual: thrown });
      if (!thrown && !expectedHttpStatus(response?.status() ?? null, route.expectedStatus)) failures.push({ code: "http-status", actual: response?.status() ?? null, expected: route.expectedStatus });
      if (observation) failures.push(...semanticFailures(observation, route));
      failures.push(...diagnosticFailures(diagnostics, route, options.baseUrl));
      records.push({
        engine,
        failures,
        httpStatus: response?.status() ?? null,
        observation,
        requests: diagnostics.requests,
        route: route.id,
        status: failures.length ? "FAIL" : "PASS",
        viewport,
      });
    }
  } finally {
    await context.close();
  }
  return records;
}

async function observeHomeFallback(page) {
  return page.evaluate(() => {
    const runway = document.querySelector(".cinematic-runway");
    const runwayRect = runway?.getBoundingClientRect();
    const media = document.querySelector("[data-cinematic-media]");
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    const entryRect = entry?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    return {
      bootstrap: document.documentElement.dataset.cinematicBootstrap ?? null,
      cinematicCurrentSrc: media?.currentSrc ?? "",
      cinematicMode: document.documentElement.dataset.cinematicMode ?? null,
      cinematicSrc: media?.getAttribute("src") ?? "",
      entry: entryRect ? { bottom: entryRect.bottom, top: entryRect.top } : null,
      entryAlignmentDelta: entryRect && headerRect ? entryRect.top - Math.max(0, headerRect.bottom) : null,
      hash: location.hash,
      navigationLinks: document.querySelectorAll(".desktop-nav a,.mobile-nav a,.brand-link").length,
      path: location.pathname,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      runwayHeight: runwayRect?.height ?? null,
      scrollY,
      viewportHeight: innerHeight,
    };
  });
}

function videoRequests(diagnostics) {
  return diagnostics.requests.filter(({ resourceType, url }) => resourceType === "media" || /\.(?:mp4|webm)(?:$|[?#])/i.test(url));
}

async function runReducedMotionHome(browser, options) {
  const context = await browser.newContext({
    colorScheme: "dark",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    viewport: { width: HOME_CHECK_VIEWPORT.width, height: HOME_CHECK_VIEWPORT.height },
  });
  const page = await context.newPage();
  const collector = startDiagnostics(page);
  try {
    const route = routeById("home");
    const response = await page.goto(targetUrl(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    const [observation, home] = await Promise.all([observeSemantics(page), observeHomeFallback(page)]);
    const diagnostics = collector.stop();
    const requests = videoRequests(diagnostics);
    const failures = [
      ...semanticFailures(observation, route),
      ...diagnosticFailures(diagnostics, route, options.baseUrl),
    ];
    if (response?.status() !== 200) failures.push({ code: "http-status", actual: response?.status() ?? null, expected: 200 });
    if (!home.reducedMotion) failures.push({ code: "reduced-motion-preference", actual: false });
    if (home.cinematicMode !== "static" || home.bootstrap !== "reduced-motion") failures.push({ code: "reduced-motion-mode", actual: home });
    if (home.cinematicSrc || home.cinematicCurrentSrc || requests.length) failures.push({ code: "reduced-motion-video-request", actual: requests });
    if (home.runwayHeight > home.viewportHeight + OVERFLOW_TOLERANCE_PX) failures.push({ code: "reduced-motion-runway", actual: home.runwayHeight });
    return { diagnostics, failures, home, observation, status: failures.length ? "FAIL" : "PASS", videoRequests: requests };
  } finally {
    await context.close();
  }
}

async function runNoJavaScriptHome(browser, options) {
  const route = routeById("home");
  const records = [];
  for (const suffix of ["", "#entry"]) {
    const context = await browser.newContext({
      colorScheme: "dark",
      javaScriptEnabled: false,
      serviceWorkers: "block",
      viewport: { width: HOME_CHECK_VIEWPORT.width, height: HOME_CHECK_VIEWPORT.height },
    });
    const page = await context.newPage();
    const collector = startDiagnostics(page);
    try {
      const response = await page.goto(targetUrl(options.baseUrl, `/${suffix}`), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      await settle(page, options.timeoutMs);
      const [observation, home] = await Promise.all([observeSemantics(page), observeHomeFallback(page)]);
      const diagnostics = collector.stop();
      const requests = videoRequests(diagnostics);
      const failures = [
        ...semanticFailures(observation, route),
        ...diagnosticFailures(diagnostics, route, options.baseUrl),
      ];
      if (response?.status() !== 200) failures.push({ code: "http-status", actual: response?.status() ?? null, expected: 200 });
      if (home.cinematicSrc || home.cinematicCurrentSrc || requests.length) failures.push({ code: "no-js-video-request", actual: requests });
      if (home.runwayHeight > home.viewportHeight + OVERFLOW_TOLERANCE_PX) failures.push({ code: "no-js-runway", actual: home.runwayHeight });
      if (home.navigationLinks < 3) failures.push({ code: "no-js-navigation", actual: home.navigationLinks });
      if (suffix && (home.hash !== "#entry" || home.scrollY <= 0 || !home.entry || home.entry.top > home.viewportHeight / 2)) {
        failures.push({ code: "no-js-entry-fragment", actual: home });
      }
      records.push({ diagnostics, failures, home, observation, status: failures.length ? "FAIL" : "PASS", url: `/${suffix}`, videoRequests: requests });
    } finally {
      await context.close();
    }
  }
  return records;
}

async function installLifecycleProbe(context) {
  await context.addInitScript(() => {
    const storageKey = "__quantumPhase6MediaLifecycle";
    const readStored = () => {
      try { return JSON.parse(sessionStorage.getItem(storageKey) ?? "[]"); } catch { return []; }
    };
    const store = (entry) => {
      try {
        const records = readStored();
        records.push({ at: performance.now(), path: location.pathname, ...entry });
        sessionStorage.setItem(storageKey, JSON.stringify(records.slice(-200)));
      } catch {}
    };
    const probe = {
      lifecycle: [],
      listenerAdds: {},
      mediaEvents: readStored,
      storageKey,
    };
    Object.defineProperty(window, "__phase6Probe", { configurable: true, value: probe });

    const originalAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function phase6AddEventListener(type, listener, options) {
      probe.listenerAdds[type] = (probe.listenerAdds[type] ?? 0) + 1;
      return originalAdd.call(this, type, listener, options);
    };

    const originalRemoveAttribute = Element.prototype.removeAttribute;
    Element.prototype.removeAttribute = function phase6RemoveAttribute(name) {
      if (this instanceof HTMLMediaElement && name.toLowerCase() === "src") {
        store({ action: "remove-src", id: this.id || null, src: this.getAttribute("src") });
      }
      return originalRemoveAttribute.call(this, name);
    };

    for (const method of ["load", "pause", "play"]) {
      const original = HTMLMediaElement.prototype[method];
      HTMLMediaElement.prototype[method] = function phase6MediaMethod(...args) {
        store({ action: method, id: this.id || null, src: this.getAttribute("src") });
        return original.apply(this, args);
      };
    }

    for (const type of ["pageshow", "pagehide", "visibilitychange"]) {
      originalAdd.call(window, type, (event) => {
        probe.lifecycle.push({ persisted: "persisted" in event ? Boolean(event.persisted) : null, type, visibilityState: document.visibilityState });
      }, { capture: true });
    }
  });
}

async function observeHistoryState(page) {
  return page.evaluate(() => {
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    const entryRect = entry?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    return {
      activeElement: document.activeElement?.id || document.activeElement?.localName || null,
      cinematicMode: document.documentElement.dataset.cinematicMode ?? null,
      entryAlignmentDelta: entryRect && headerRect ? entryRect.top - Math.max(0, headerRect.bottom) : null,
      hash: location.hash,
      lifecycle: [...(window.__phase6Probe?.lifecycle ?? [])],
      listenerAdds: { ...(window.__phase6Probe?.listenerAdds ?? {}) },
      navigationType: performance.getEntriesByType("navigation")[0]?.type ?? null,
      path: location.pathname,
      scrollY,
    };
  });
}

async function waitForEntryAlignment(page, timeoutMs) {
  await page.waitForFunction(() => {
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    if (!entry || !header || location.hash !== "#entry") return false;
    return Math.abs(entry.getBoundingClientRect().top - Math.max(0, header.getBoundingClientRect().bottom)) <= 12;
  }, undefined, { timeout: Math.min(timeoutMs, 5_000) }).catch(() => undefined);
  await page.waitForTimeout(80);
}

async function runHistoryChecks(browser, options) {
  const context = await browser.newContext({
    colorScheme: "dark",
    serviceWorkers: "block",
    viewport: { width: HISTORY_VIEWPORT.width, height: HISTORY_VIEWPORT.height },
  });
  await installLifecycleProbe(context);
  const directPage = await context.newPage();
  const directCollector = startDiagnostics(directPage);
  let directEntry;
  try {
    await directPage.goto(targetUrl(options.baseUrl, "/#entry"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(directPage, options.timeoutMs);
    await waitForEntryAlignment(directPage, options.timeoutMs);
    directEntry = await observeHistoryState(directPage);
  } finally {
    const directDiagnostics = directCollector.stop();
    await directPage.close();
    directEntry = { ...directEntry, diagnostics: directDiagnostics };
  }

  const page = await context.newPage();
  const collector = startDiagnostics(page);
  let states = {};
  try {
    await page.goto(targetUrl(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    states.bare = await observeHistoryState(page);

    await page.goto(targetUrl(options.baseUrl, "/#entry"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await waitForEntryAlignment(page, options.timeoutMs);
    states.entry = await observeHistoryState(page);

    await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForTimeout(100);
    states.backBare = await observeHistoryState(page);

    await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await waitForEntryAlignment(page, options.timeoutMs);
    states.forwardEntry = await observeHistoryState(page);

    await page.goto(targetUrl(options.baseUrl, "/about/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    states.about = await observeHistoryState(page);

    await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await waitForEntryAlignment(page, options.timeoutMs);
    states.backFromAbout = await observeHistoryState(page);

    await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    states.forwardAbout = await observeHistoryState(page);
  } finally {
    const diagnostics = collector.stop();
    await context.close();
    states = { ...states, diagnostics: mergeDiagnostics(directEntry.diagnostics, diagnostics) };
  }

  const route = routeById("home");
  const failures = diagnosticFailures(states.diagnostics, route, options.baseUrl, { allowExpectedMediaAbort: true });
  if (states.bare.path !== "/" || states.bare.hash !== "" || states.bare.scrollY > OVERFLOW_TOLERANCE_PX) failures.push({ code: "fresh-bare-home", actual: states.bare });
  if (directEntry.path !== "/" || directEntry.hash !== "#entry" || directEntry.scrollY <= 0 || Math.abs(directEntry.entryAlignmentDelta ?? Infinity) > 12) failures.push({ code: "fresh-entry-home", actual: directEntry });
  if (states.backBare.path !== "/" || states.backBare.hash !== "") failures.push({ code: "history-back-bare", actual: states.backBare });
  if (states.forwardEntry.path !== "/" || states.forwardEntry.hash !== "#entry") failures.push({ code: "history-forward-entry", actual: states.forwardEntry });
  if (states.backFromAbout.path !== "/" || states.backFromAbout.hash !== "#entry") failures.push({ code: "history-back-supporting", actual: states.backFromAbout });
  if (states.forwardAbout.path !== "/about/") failures.push({ code: "history-forward-supporting", actual: states.forwardAbout });
  const allLifecycle = [directEntry, ...Object.values(states)].flatMap((state) => state?.lifecycle ?? []);
  const persistedObserved = allLifecycle.some(({ type, persisted }) => type === "pageshow" && persisted === true);
  return {
    bfcache: {
      status: persistedObserved ? "observed" : "not-observed",
      statement: persistedObserved
        ? "A pageshow.persisted restoration was observed."
        : "No pageshow.persisted restoration was observed in this run; this is a capability/result label, not a failure.",
    },
    directEntry,
    failures,
    states,
    status: failures.length ? "FAIL" : "PASS",
  };
}

async function observeMaradinPlayers(page) {
  return page.evaluate(() => ({
    players: [...document.querySelectorAll("[data-maradin-player]")].map((player) => {
      const video = player.querySelector("[data-maradin-video]");
      const launch = player.querySelector("[data-maradin-play]");
      return {
        currentSrc: video?.currentSrc ?? "",
        id: video?.id ?? null,
        launchHidden: launch?.hidden ?? null,
        preload: video?.preload ?? null,
        readyState: video?.readyState ?? null,
        src: video?.getAttribute("src") ?? "",
        state: player.getAttribute("data-video-state"),
        tabIndex: video?.tabIndex ?? null,
      };
    }),
    storedMediaEvents: window.__phase6Probe?.mediaEvents?.() ?? [],
  }));
}

export function dormantPlayers(state) {
  return state.players.length === 2 && state.players.every((player) => (
    player.state === "dormant"
    && !player.src
    && player.readyState === 0
    && player.preload === "none"
    && player.tabIndex === -1
    && player.launchHidden === false
  ));
}

function activePlayerCount(state) {
  return state.players.filter((player) => player.state === "active" && Boolean(player.src)).length;
}

async function dispatchSyntheticTransition(page, type) {
  return page.evaluate((eventType) => {
    let event;
    let constructor = "Event";
    try {
      if (typeof PageTransitionEvent !== "function") throw new Error("PageTransitionEvent unavailable");
      event = new PageTransitionEvent(eventType, { persisted: true });
      constructor = "PageTransitionEvent";
    } catch {
      event = new Event(eventType);
      Object.defineProperty(event, "persisted", { value: true });
    }
    dispatchEvent(event);
    return { constructor, persisted: event.persisted === true };
  }, type);
}

async function runMaradinChecks(browser, options) {
  const context = await browser.newContext({
    colorScheme: "dark",
    serviceWorkers: "block",
    viewport: { width: MARADIN_VIEWPORT.width, height: MARADIN_VIEWPORT.height },
  });
  await installLifecycleProbe(context);
  const page = await context.newPage();
  const collector = startDiagnostics(page);
  const states = {};
  try {
    await page.goto(targetUrl(options.baseUrl, "/pocs/maradin/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    states.dormant = await observeMaradinPlayers(page);

    await page.locator("[data-maradin-play]").nth(0).click({ timeout: options.timeoutMs });
    await page.waitForFunction(() => document.querySelectorAll("[data-maradin-player][data-video-state='active']").length === 1);
    states.first = await observeMaradinPlayers(page);

    await page.locator("[data-maradin-play]").nth(1).click({ timeout: options.timeoutMs });
    await page.waitForFunction(() => document.querySelectorAll("[data-maradin-player][data-video-state='active']").length === 1);
    states.second = await observeMaradinPlayers(page);
    states.eventsBeforeDeparture = states.second.storedMediaEvents.length;

    await page.goto(targetUrl(options.baseUrl, "/about/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    states.departureEvents = await page.evaluate(() => window.__phase6Probe?.mediaEvents?.() ?? []);

    await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    states.returned = await observeMaradinPlayers(page);
  } finally {
    states.diagnostics = collector.stop();
    await page.close();
  }

  const syntheticPage = await context.newPage();
  const syntheticCollector = startDiagnostics(syntheticPage);
  const synthetic = {};
  try {
    await syntheticPage.goto(targetUrl(options.baseUrl, "/pocs/maradin/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(syntheticPage, options.timeoutMs);
    await syntheticPage.locator("[data-maradin-play]").nth(0).click({ timeout: options.timeoutMs });
    synthetic.firstPagehideEvent = await dispatchSyntheticTransition(syntheticPage, "pagehide");
    synthetic.afterFirstPagehide = await observeMaradinPlayers(syntheticPage);
    synthetic.pageshowEvent = await dispatchSyntheticTransition(syntheticPage, "pageshow");
    await syntheticPage.locator("[data-maradin-play]").nth(1).click({ timeout: options.timeoutMs });
    synthetic.afterSecondInitiation = await observeMaradinPlayers(syntheticPage);
    synthetic.secondPagehideEvent = await dispatchSyntheticTransition(syntheticPage, "pagehide");
    synthetic.afterSecondPagehide = await observeMaradinPlayers(syntheticPage);
  } finally {
    synthetic.diagnostics = syntheticCollector.stop();
    await context.close();
  }

  const route = routeById("maradin");
  const diagnostics = mergeDiagnostics(states.diagnostics, synthetic.diagnostics);
  const failures = diagnosticFailures(diagnostics, route, options.baseUrl, { allowExpectedMediaAbort: true });
  if (!dormantPlayers(states.dormant)) failures.push({ code: "maradin-initial-dormancy", actual: states.dormant });
  if (activePlayerCount(states.first) !== 1 || states.first.players[0].state !== "active" || states.first.players[1].state !== "dormant") failures.push({ code: "maradin-first-initiation", actual: states.first });
  if (activePlayerCount(states.second) !== 1 || states.second.players[0].state !== "dormant" || states.second.players[1].state !== "active") failures.push({ code: "maradin-second-replacement", actual: states.second });
  const departureTail = states.departureEvents.slice(states.eventsBeforeDeparture);
  if (!departureTail.some(({ action, id }) => action === "remove-src" && id === "maradin-contact-video")) failures.push({ code: "maradin-route-departure-release", actual: departureTail });
  if (!dormantPlayers(states.returned)) failures.push({ code: "maradin-history-return-dormancy", actual: states.returned });
  if (!dormantPlayers(synthetic.afterFirstPagehide)) failures.push({ code: "maradin-first-persisted-pagehide-release", actual: synthetic.afterFirstPagehide });
  if (activePlayerCount(synthetic.afterSecondInitiation) !== 1) failures.push({ code: "maradin-post-pageshow-initiation", actual: synthetic.afterSecondInitiation });
  if (!dormantPlayers(synthetic.afterSecondPagehide)) failures.push({ code: "maradin-repeated-persisted-pagehide-release", actual: synthetic.afterSecondPagehide });
  return { diagnostics, failures, states, status: failures.length ? "FAIL" : "PASS", synthetic };
}

function withSection(section, failures) {
  return failures.map((failure) => ({ section, ...failure }));
}

async function runEngine(engine, options) {
  const launched = await launchEngine(engine, options);
  const { browser, executablePath } = launched;
  try {
    const capabilityContext = await browser.newContext();
    const capabilityPage = await capabilityContext.newPage();
    const capabilities = await probeCapabilities(capabilityPage);
    await capabilityContext.close();

    const matrix = await runRouteMatrix(browser, engine, options);
    const reducedMotion = await runReducedMotionHome(browser, options);
    const noJavaScript = await runNoJavaScriptHome(browser, options);
    const history = await runHistoryChecks(browser, options);
    capabilities.bfcache = {
      ...capabilities.bfcache,
      observedStatus: history.bfcache.status,
    };
    const maradin = await runMaradinChecks(browser, options);
    const failures = [
      ...matrix.flatMap((record) => withSection("route-matrix", record.failures).map((failure) => ({ route: record.route, viewport: record.viewport.id, ...failure }))),
      ...withSection("reduced-motion-home", reducedMotion.failures),
      ...noJavaScript.flatMap((record) => withSection("no-javascript-home", record.failures).map((failure) => ({ url: record.url, ...failure }))),
      ...withSection("history", history.failures),
      ...withSection("maradin", maradin.failures),
    ];
    return {
      browser: {
        engine,
        executablePath,
        headed: options.headed,
        version: browser.version(),
      },
      capabilities,
      failures,
      history,
      maradin,
      matrix,
      noJavaScript,
      reducedMotion,
      status: failures.length ? "FAIL" : "PASS",
      summary: {
        failedMatrixCases: matrix.filter(({ status }) => status === "FAIL").length,
        failures: failures.length,
        matrixCases: matrix.length,
        matrixExpected: EXPECTED_MATRIX_CASES[engine],
        noJavaScriptCases: noJavaScript.length,
      },
    };
  } finally {
    await browser.close();
  }
}

async function ensureBaseUrlAvailable(baseUrl) {
  const response = await fetch(baseUrl, { redirect: "manual" });
  if (response.status < 200 || response.status >= 400) throw new Error(`Phase 6 base URL returned HTTP ${response.status}: ${baseUrl}`);
}

export function validateReport(report) {
  assert(report.schema === PHASE6_SCHEMA, "Phase 6 report schema differs");
  assert(report.routes.length === 10, "Phase 6 report must freeze ten route outcomes");
  assert(report.selectedEngines.length >= 1, "Phase 6 report has no selected engines");
  assert(report.engines.length === report.selectedEngines.length, "Phase 6 report engine results are incomplete");
  for (const engine of report.engines) {
    assert(report.selectedEngines.includes(engine.engine), `unexpected engine result: ${engine.engine}`);
    if (engine.status !== "ERROR") {
      assert(engine.matrix.length === EXPECTED_MATRIX_CASES[engine.engine], `${engine.engine} route matrix is incomplete`);
      assert(engine.noJavaScript.length === 2, `${engine.engine} no-JavaScript Home matrix is incomplete`);
      assert(engine.history?.bfcache?.status === "observed" || engine.history?.bfcache?.status === "not-observed", `${engine.engine} BFCache result is unlabeled`);
    }
  }
  assert(report.summary.matrixExpected === report.selectedEngines.reduce((sum, engine) => sum + EXPECTED_MATRIX_CASES[engine], 0), "Phase 6 expected matrix summary differs");
  if (report.status === "PASS") assert(report.failures.length === 0, "PASS report contains failures");
  return true;
}

export async function runPhase6GlobalHardening(options) {
  validatePhase6Contract();
  await ensureBaseUrlAvailable(options.baseUrl);
  const engines = [];
  for (const engine of selectedEngines(options.engine)) {
    try {
      engines.push({ engine, ...(await runEngine(engine, options)) });
    } catch (error) {
      engines.push({
        engine,
        failure: error instanceof Error ? error.message : String(error),
        status: "ERROR",
      });
    }
  }
  const failures = engines.flatMap((result) => result.status === "ERROR"
    ? [{ engine: result.engine, section: "engine-launch-or-run", code: "engine-error", actual: result.failure }]
    : result.failures.map((failure) => ({ engine: result.engine, ...failure })));
  const selected = selectedEngines(options.engine);
  const report = {
    baseUrl: options.baseUrl,
    generatedAt: new Date().toISOString(),
    headed: options.headed,
    engines,
    failures,
    routes: PHASE6_ROUTES,
    schema: PHASE6_SCHEMA,
    selectedEngines: selected,
    status: failures.length ? "FAIL" : "PASS",
    summary: {
      engineErrors: engines.filter(({ status }) => status === "ERROR").length,
      engines: engines.length,
      failures: failures.length,
      matrixCases: engines.reduce((sum, engine) => sum + (engine.matrix?.length ?? 0), 0),
      matrixExpected: selected.reduce((sum, engine) => sum + EXPECTED_MATRIX_CASES[engine], 0),
      unsupportedCapabilities: engines.reduce((sum, engine) => sum + Object.values(engine.capabilities ?? {}).filter(({ status }) => status === "unsupported").length, 0),
    },
  };
  validateReport(report);
  return report;
}

export function runSelfTest() {
  validatePhase6Contract();
  const externalCandidate = path.resolve(ROOT, "..", "phase-6-work", "phase6-self-test.json");
  assertExternalOutputPath(externalCandidate);
  assert(matrixForEngine("chromium").length === 130, "Chromium self-test matrix differs");
  assert(matrixForEngine("webkit").length === 34, "WebKit self-test matrix differs");
  assert(matrixForEngine("firefox").length === 34, "Firefox self-test matrix differs");
  assert(EXPECTED_MATRIX_CASES.all === 198, "combined self-test matrix differs");
  return {
    matrixCases: EXPECTED_MATRIX_CASES,
    routes: PHASE6_ROUTES.length,
    schema: PHASE6_SCHEMA,
    status: "PASS",
  };
}

function usage() {
  return [
    "Usage: node scripts/qa-phase6-global-hardening.mjs --engine chromium|webkit|firefox|all --base-url <preview> --output <external-fresh.json> [--headed] [--timeout-ms 30000]",
    "       node scripts/qa-phase6-global-hardening.mjs --self-test",
    "",
    "Firefox on this Windows host may require --headed. Missing managed engines are labelled as engine errors; unsupported telemetry is only capability-labelled.",
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
  const report = await runPhase6GlobalHardening(options);
  await writeFreshExternal(options.output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output: options.output, status: report.status, summary: report.summary }, null, 2)}\n`);
  if (report.status !== "PASS") throw new Error(`${report.failures.length} Phase 6 QA failures remain; inspect the fresh external report`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 6 global-hardening QA failed: ${error.message}`);
  process.exitCode = 1;
});
