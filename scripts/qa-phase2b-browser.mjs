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
const DEFAULT_REPORT = path.join(ROOT, "artifacts", "evidence", "phase-2b", "phase-2b-browser-report.json");
const VIEWPORTS = Object.freeze([
  { id: "desktop-1440x900", width: 1440, height: 900 },
  { id: "short-desktop-1366x650", width: 1366, height: 650 },
  { id: "desktop-1280x800", width: 1280, height: 800 },
  { id: "tablet-landscape-1024x768", width: 1024, height: 768 },
  { id: "tablet-portrait-768x1024", width: 768, height: 1024 },
  { id: "mobile-390x844", width: 390, height: 844 },
  { id: "mobile-360x800", width: 360, height: 800 },
  { id: "narrow-320x800", width: 320, height: 800 },
  { id: "mobile-landscape-844x390", width: 844, height: 390 },
]);
const CHAPTERS = Object.freeze(["entry", "built-with-industry", "method", "industries", "proof", "programmes", "conversion"]);
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

function parseArguments(argv) {
  const options = { baseUrl: process.env.PHASE2B_BASE_URL ?? DEFAULT_BASE_URL, browser: process.env.CHROME_PATH ?? null, report: DEFAULT_REPORT, serverMode: "astro-preview", smoke: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--base-url") options.baseUrl = argv[++index];
    else if (value === "--browser") options.browser = argv[++index];
    else if (value === "--report") options.report = path.resolve(argv[++index]);
    else if (value === "--server-mode") options.serverMode = argv[++index];
    else if (value === "--smoke") options.smoke = true;
    else if (value === "--help" || value === "-h") {
      console.log("Usage: node scripts/qa-phase2b-browser.mjs [--smoke] [--base-url URL] [--browser PATH] [--report PATH] [--server-mode astro-preview|external]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${value}`);
  }
  if (!options.baseUrl) throw new Error("--base-url requires a value");
  if (!['astro-preview', 'external'].includes(options.serverMode)) throw new Error("--server-mode must be astro-preview or external");
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
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    );
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
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
  for (const candidate of candidates) if (await executable(candidate)) return path.resolve(candidate);
  throw new Error("Chrome/Chromium was not found. Set CHROME_PATH or pass --browser.");
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 30_000;
  let lastError = "no response";
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) throw new Error(`Astro preview exited before it became ready (${child.exitCode}).`);
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${baseUrl}: ${lastError}`);
}

function startPreview(baseUrl) {
  const url = new URL(baseUrl);
  const astroBin = path.join(ROOT, "node_modules", "astro", "bin", "astro.mjs");
  return spawn(process.execPath, [astroBin, "preview", "--host", url.hostname, "--port", url.port || "4321"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
  }));
}

function compactAxe(violations) {
  return violations.map(({ id, impact, nodes, help }) => ({
    id,
    impact,
    help,
    nodes: nodes.slice(0, 4).map(({ target, failureSummary }) => ({ target, failureSummary })),
  }));
}

async function axe(page) {
  await page.addScriptTag({ content: axeCore.source });
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      resultTypes: ["violations"],
      rules: {
        region: { enabled: false },
      },
    });
    return result.violations;
  });
}

async function inspectLayout(page) {
  return page.evaluate((chapterOrder) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const chapters = [...document.querySelectorAll("[data-home-scene]")].map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.getAttribute("data-home-scene"), top: rect.top + scrollY, width: rect.width, height: rect.height };
    });
    const controls = [...document.querySelectorAll("a[href], button, summary")]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { label: (element.getAttribute("aria-label") || element.textContent || element.tagName).trim().replace(/\s+/g, " ").slice(0, 90), width: rect.width, height: rect.height };
      });
    const textOverhang = [...document.querySelectorAll("main h1, main h2, main h3, main p, main a")]
      .filter(visible)
      .filter((element) => element.scrollWidth > element.clientWidth + 2)
      .map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const contentRects = [...range.getClientRects()];
        const clippingAncestors = [];
        for (let ancestor = element; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (!["hidden", "clip"].includes(style.overflowX) && !["hidden", "clip"].includes(style.overflow)) continue;
          const rect = ancestor.getBoundingClientRect();
          if (contentRects.some((content) => content.left < rect.left - 1 || content.right > rect.right + 1)) {
            clippingAncestors.push({ tag: ancestor.tagName, className: String(ancestor.className).slice(0, 120) });
          }
        }
        return { tag: element.tagName, text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, clippingAncestors };
      });
    const nestedScroll = [...document.querySelectorAll("main *")]
      .filter(visible)
      .filter((element) => {
        const overflow = getComputedStyle(element).overflowY;
        return ["auto", "scroll"].includes(overflow) && element.scrollHeight > element.clientHeight + 2;
      })
      .map((element) => ({ tag: element.tagName, className: String(element.className), scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
    const h1 = document.querySelector("h1");
    const method = document.querySelector("[data-method-section]");
    const workpiece = document.querySelector("[data-method-workpiece]");
    return {
      chapterOrder,
      chapters,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      textOverhang,
      textClipping: textOverhang.filter(({ clippingAncestors }) => clippingAncestors.length > 0),
      nestedScroll,
      undersizedControls: controls.filter(({ width, height }) => width < 44 || height < 44),
      h1FontSize: h1 ? Number.parseFloat(getComputedStyle(h1).fontSize) : 0,
      methodStickyFlag: method?.getAttribute("data-method-sticky") ?? null,
      workpiecePosition: workpiece ? getComputedStyle(workpiece).position : null,
      operatingMode: document.documentElement.getAttribute("data-operating-field"),
    };
  }, CHAPTERS);
}

async function runViewport(browser, baseUrl, viewport, failures) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const runtimeErrors = [];
  const externalRequests = [];
  const expectedOrigin = new URL(baseUrl).origin;
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== expectedOrigin) externalRequests.push(request.url());
  });
  const response = await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await settle(page);
  const layout = await inspectLayout(page);
  const violations = await axe(page);
  const expectedOrder = CHAPTERS.join("|");
  if (layout.chapters.map(({ id }) => id).join("|") !== expectedOrder) failures.push({ scenario: "viewport", viewport: viewport.id, type: "chapter-order", measured: layout.chapters.map(({ id }) => id), expected: CHAPTERS });
  if (layout.chapters.some(({ width, height }) => width <= 0 || height <= 0)) failures.push({ scenario: "viewport", viewport: viewport.id, type: "chapter-layout", measured: layout.chapters });
  if (layout.chapters.some((chapter, index) => index > 0 && chapter.top <= layout.chapters[index - 1].top)) failures.push({ scenario: "viewport", viewport: viewport.id, type: "chapter-flow", measured: layout.chapters.map(({ id, top }) => ({ id, top })) });
  if (layout.horizontalOverflow > 2) failures.push({ scenario: "viewport", viewport: viewport.id, type: "horizontal-overflow", measured: layout.horizontalOverflow, expected: "<= 2px" });
  if (layout.textClipping.length) failures.push({ scenario: "viewport", viewport: viewport.id, type: "text-clipping", measured: layout.textClipping });
  if (layout.nestedScroll.length) failures.push({ scenario: "viewport", viewport: viewport.id, type: "nested-scroll", measured: layout.nestedScroll });
  if (layout.undersizedControls.length) failures.push({ scenario: "viewport", viewport: viewport.id, type: "target-size", measured: layout.undersizedControls.slice(0, 12), expected: ">=44x44" });
  if (viewport.width <= 390 && layout.h1FontSize < 30) failures.push({ scenario: "viewport", viewport: viewport.id, type: "mobile-h1-scale", measured: layout.h1FontSize, expected: ">=30px" });
  if (violations.length) failures.push({ scenario: "viewport", viewport: viewport.id, type: "axe", measured: compactAxe(violations) });
  if (runtimeErrors.length) failures.push({ scenario: "viewport", viewport: viewport.id, type: "runtime-error", measured: runtimeErrors });
  if (externalRequests.length) failures.push({ scenario: "viewport", viewport: viewport.id, type: "external-runtime-request", measured: externalRequests });
  if (response?.status() !== 200) failures.push({ scenario: "viewport", viewport: viewport.id, type: "http", measured: response?.status(), expected: 200 });
  await context.close();
  return { viewport: viewport.id, layout, axeViolations: compactAxe(violations), runtimeErrors, externalRequests };
}

async function runStaticMode(browser, baseUrl, { id, javaScriptEnabled = true, reducedMotion = "no-preference", fontFallback = false, textZoom = false }, failures) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled, reducedMotion });
  if (fontFallback) await context.route(/\.(?:woff2?|ttf|otf)(?:\?|$)/i, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  if (textZoom) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  if (javaScriptEnabled) await settle(page);
  else await page.waitForTimeout(50);
  const layout = await inspectLayout(page);
  const semantic = await page.evaluate(() => ({
    h1: document.querySelector("h1")?.innerText?.trim().replace(/\s+/g, " "),
    chapters: [...document.querySelectorAll("[data-home-scene]")].map((element) => element.getAttribute("data-home-scene")),
    visibleChapters: [...document.querySelectorAll("[data-home-scene]")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }).length,
  }));
  if (semantic.h1?.toUpperCase() !== "WHERE DO YOU ENTER?") failures.push({ scenario: id, type: "h1", measured: semantic.h1 });
  if (semantic.chapters.join("|") !== CHAPTERS.join("|") || semantic.visibleChapters !== CHAPTERS.length) failures.push({ scenario: id, type: "static-chapters", measured: semantic });
  if (layout.horizontalOverflow > 2 || layout.textClipping.length || layout.nestedScroll.length) failures.push({ scenario: id, type: "layout", measured: { horizontalOverflow: layout.horizontalOverflow, textClipping: layout.textClipping, nestedScroll: layout.nestedScroll } });
  if ((!javaScriptEnabled || reducedMotion === "reduce") && (layout.operatingMode === "enhanced" || layout.methodStickyFlag === "true" || layout.workpiecePosition === "sticky")) failures.push({ scenario: id, type: "motion-bypass", measured: layout, expected: "static non-sticky" });
  await context.close();
  return { id, layout, semantic };
}

async function runKeyboardAndMenu(browser, baseUrl, failures) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const firstFocus = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), className: document.activeElement?.className }));
  if (!String(firstFocus.className).includes("skip-link")) failures.push({ scenario: "keyboard", type: "skip-link-order", measured: firstFocus });
  await page.keyboard.press("Enter");
  const mainFocused = await page.evaluate(() => document.activeElement?.id === "main-content");
  if (!mainFocused) failures.push({ scenario: "keyboard", type: "skip-link-target", measured: await page.evaluate(() => document.activeElement?.id) });
  const menu = page.locator("[data-mobile-nav]");
  await menu.locator("summary").click();
  if (!(await menu.evaluate((element) => element.hasAttribute("open")))) failures.push({ scenario: "mobile-menu", type: "open-state" });
  const visibleLinks = await menu.locator("nav a:visible").count();
  if (visibleLinks !== 8) failures.push({ scenario: "mobile-menu", type: "link-count", measured: visibleLinks, expected: 8 });
  await page.keyboard.press("Escape");
  const menuState = await menu.evaluate((element) => ({ open: element.hasAttribute("open"), focused: document.activeElement === element.querySelector("summary") }));
  if (menuState.open || !menuState.focused) failures.push({ scenario: "mobile-menu", type: "escape-return", measured: menuState });
  await context.close();
  return { firstFocus, mainFocused, visibleLinks, menuState };
}

async function readScrollState(page) {
  return page.evaluate(() => {
    const method = document.querySelector("[data-method-section]");
    const stages = [...document.querySelectorAll("[data-method-stage]")];
    const value = (name) => Number.parseFloat(method?.style.getPropertyValue(name) || getComputedStyle(method).getPropertyValue(name)) || 0;
    return {
      y: scrollY,
      mode: document.documentElement.getAttribute("data-operating-field"),
      sticky: method?.getAttribute("data-method-sticky"),
      methodProgress: value("--method-progress"),
      stageProgress: stages.map((_, index) => value(`--method-${["frame", "source", "assess", "test", "decide"][index]}`)),
      nestedScrollbars: [...document.querySelectorAll("main *")].filter((element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 2).length,
      workpiecePosition: getComputedStyle(document.querySelector("[data-method-workpiece]")).position,
    };
  });
}

async function scrollTo(page, y) {
  await page.evaluate((target) => window.scrollTo(0, target), y);
  await settle(page);
  return readScrollState(page);
}

async function runScrollBehavior(browser, baseUrl, failures) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await settle(page);
  await page.evaluate(() => {
    window.__phase2bLongTasks = [];
    if (!("PerformanceObserver" in window)) return;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__phase2bLongTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }
    });
    try {
      observer.observe({ type: "longtask", buffered: false });
      window.__phase2bLongTaskObserver = observer;
    } catch {}
  });
  const geometry = await page.evaluate(() => {
    const absolute = (element) => element.getBoundingClientRect().top + scrollY;
    const method = document.querySelector("[data-method-section]");
    const stages = [...document.querySelectorAll("[data-method-stage]")];
    const chapters = Object.fromEntries([...document.querySelectorAll("[data-home-scene]")].map((element) => [element.getAttribute("data-home-scene"), absolute(element)]));
    return {
      methodTop: absolute(method),
      methodBottom: absolute(method) + method.getBoundingClientRect().height,
      stageTops: stages.map(absolute),
      chapters,
      max: document.documentElement.scrollHeight - innerHeight,
    };
  });
  const slowTargets = Array.from({ length: 9 }, (_, index) => Math.round(geometry.max * index / 8));
  const slow = [];
  for (const target of slowTargets) slow.push(await scrollTo(page, target));
  const monotonic = slow.every((state, index) => index === 0 || state.y >= slow[index - 1].y);
  if (!monotonic || slow.some(({ nestedScrollbars }) => nestedScrollbars > 0)) failures.push({ scenario: "slow-forward", type: "scroll-authority", measured: slow });

  await scrollTo(page, Math.max(0, geometry.methodTop - 100));
  const fast = await scrollTo(page, Math.min(geometry.max, geometry.methodBottom + 100));
  if (Math.abs(fast.y - Math.min(geometry.max, geometry.methodBottom + 100)) > 3 || fast.nestedScrollbars) failures.push({ scenario: "fast-forward", type: "immediate-final-state", measured: fast });

  const reverse = [];
  for (const id of ["conversion", "programmes", "proof", "industries", "method"]) reverse.push({ id, state: await scrollTo(page, Math.min(geometry.max, geometry.chapters[id] + 20)) });
  if (!reverse.every((item, index) => index === 0 || item.state.y <= reverse[index - 1].state.y)) failures.push({ scenario: "reverse", type: "document-order", measured: reverse });

  const largeJump = await scrollTo(page, Math.round(geometry.max * 0.88));
  if (Math.abs(largeJump.y - Math.round(geometry.max * 0.88)) > 3) failures.push({ scenario: "large-jump", type: "document-position", measured: largeJump });

  const alternating = [];
  for (const target of [geometry.methodTop + 2, geometry.methodBottom - 2, geometry.methodTop + 20, geometry.methodBottom - 20, geometry.methodTop + 40]) alternating.push(await scrollTo(page, Math.max(0, Math.min(geometry.max, target))));
  if (alternating.some(({ nestedScrollbars }) => nestedScrollbars > 0)) failures.push({ scenario: "rapid-alternating", type: "nested-scroll", measured: alternating });

  const methodStates = [];
  for (const target of [geometry.methodTop, ...geometry.stageTops, geometry.methodBottom]) methodStates.push(await scrollTo(page, Math.max(0, Math.min(geometry.max, target - 200))));
  if (methodStates[0].mode !== "enhanced" || methodStates[0].sticky !== "true" || methodStates[0].workpiecePosition !== "sticky") failures.push({ scenario: "method-sticky", type: "desktop-eligibility", measured: methodStates[0], expected: "enhanced bounded sticky" });
  if (methodStates.some(({ nestedScrollbars }) => nestedScrollbars > 0)) failures.push({ scenario: "method-sticky", type: "nested-scroll", measured: methodStates });
  if (methodStates.some((state, index) => index > 0 && state.methodProgress + 0.01 < methodStates[index - 1].methodProgress)) failures.push({ scenario: "method-sticky", type: "progress-mapping", measured: methodStates.map(({ y, methodProgress }) => ({ y, methodProgress })) });
  const longTasks = await page.evaluate(() => {
    window.__phase2bLongTaskObserver?.disconnect();
    return window.__phase2bLongTasks ?? [];
  });
  if (longTasks.some(({ duration }) => duration > 100)) failures.push({ scenario: "scroll-performance", type: "long-task", measured: longTasks, expected: "no task >100ms during traversal" });
  await context.close();
  return { geometry, slow, fast, reverse, largeJump, alternating, methodStates, longTasks };
}

async function runBackForwardCache(browser, baseUrl, failures) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__phase2bPageShows = [];
    addEventListener("pageshow", (event) => window.__phase2bPageShows.push({ persisted: event.persisted, at: performance.now() }));
  });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await settle(page);
  const methodTop = await page.locator("[data-method-section]").evaluate((element) => element.getBoundingClientRect().top + scrollY);
  await scrollTo(page, methodTop + 400);
  await page.goto(`${baseUrl}/about/`, { waitUntil: "networkidle" });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await settle(page);
  const restored = await page.evaluate(() => ({
    path: location.pathname,
    h1: document.querySelector("h1")?.innerText?.trim().replace(/\s+/g, " "),
    mode: document.documentElement.getAttribute("data-operating-field"),
    sticky: document.querySelector("[data-method-section]")?.getAttribute("data-method-sticky"),
    pageShows: window.__phase2bPageShows ?? [],
    y: scrollY,
  }));
  const beforeProgress = await readScrollState(page);
  await scrollTo(page, Math.min(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), methodTop + 1000));
  const afterProgress = await readScrollState(page);
  if (restored.path !== "/" || restored.h1?.toUpperCase() !== "WHERE DO YOU ENTER?" || restored.mode !== "enhanced" || restored.sticky !== "true") failures.push({ scenario: "back-forward-cache", type: "restore-state", measured: restored });
  if (afterProgress.y <= beforeProgress.y || afterProgress.methodProgress + 0.01 < beforeProgress.methodProgress) failures.push({ scenario: "back-forward-cache", type: "controller-resume", measured: { beforeProgress, afterProgress } });
  await context.close();
  return { restored, beforeProgress, afterProgress, persisted: restored.pageShows.some(({ persisted }) => persisted) };
}

async function runSupportingSmoke(browser, baseUrl, failures) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const results = [];
  for (const route of SUPPORTING_ROUTES) {
    const runtimeErrors = [];
    const onError = (error) => runtimeErrors.push(error.message);
    page.on("pageerror", onError);
    const requestPath = route === "/404/" ? "/phase-2b-404-smoke" : route;
    const response = await page.goto(`${baseUrl}${requestPath}`, { waitUntil: "networkidle" });
    const state = await page.evaluate(() => ({ h1: document.querySelectorAll("h1").length, homeHooks: document.querySelectorAll("[data-home-scene], [data-method-section]").length, mode: document.documentElement.getAttribute("data-operating-field"), horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth }));
    const expectedStatus = route === "/404/" ? 404 : 200;
    if (response?.status() !== expectedStatus || state.h1 !== 1 || state.homeHooks !== 0 || state.mode !== null || state.horizontalOverflow > 2 || runtimeErrors.length) failures.push({ scenario: "supporting-route", route, measured: { status: response?.status(), ...state, runtimeErrors }, expected: { status: expectedStatus, h1: 1, homeHooks: 0, mode: null, horizontalOverflow: "<=2" } });
    results.push({ route, requestPath, status: response?.status(), ...state, runtimeErrors });
    page.off("pageerror", onError);
  }
  await context.close();
  return results;
}

const options = parseArguments(process.argv.slice(2));
const baseUrl = new URL(options.baseUrl).toString().replace(/\/$/, "");
let preview = null;
let browser = null;
const failures = [];
const report = { schema: "quantum-hub.phase-2b.browser-qa.v1", generatedAt: new Date().toISOString(), baseUrl, passed: false, browser: "Chromium", viewports: [], stress: [], keyboard: null, scroll: null, backForwardCache: null, supportingRoutes: [], failures };

try {
  if (options.serverMode === "astro-preview") preview = startPreview(baseUrl);
  await waitForServer(baseUrl, preview);
  const chromePath = await resolveChrome(options.browser);
  browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ["--disable-extensions", "--disable-background-networking"] });
  const viewports = options.smoke ? VIEWPORTS.filter(({ id }) => ["desktop-1440x900", "narrow-320x800"].includes(id)) : VIEWPORTS;
  for (const viewport of viewports) {
    console.log(`Phase 2B browser QA: ${viewport.id}`);
    report.viewports.push(await runViewport(browser, baseUrl, viewport, failures));
  }
  report.stress.push(await runStaticMode(browser, baseUrl, { id: "reduced-motion", reducedMotion: "reduce" }, failures));
  report.stress.push(await runStaticMode(browser, baseUrl, { id: "no-js", javaScriptEnabled: false }, failures));
  if (!options.smoke) {
    report.stress.push(await runStaticMode(browser, baseUrl, { id: "fallback-fonts", fontFallback: true }, failures));
    report.stress.push(await runStaticMode(browser, baseUrl, { id: "text-200", textZoom: true }, failures));
    report.keyboard = await runKeyboardAndMenu(browser, baseUrl, failures);
    report.scroll = await runScrollBehavior(browser, baseUrl, failures);
    report.backForwardCache = await runBackForwardCache(browser, baseUrl, failures);
  }
  report.supportingRoutes = await runSupportingSmoke(browser, baseUrl, failures);
} finally {
  if (browser) await browser.close();
  if (preview && preview.exitCode === null) preview.kill();
}

report.passed = failures.length === 0;
await mkdir(path.dirname(options.report), { recursive: true });
const temporary = `${options.report}.tmp`;
await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await rename(temporary, options.report);

if (failures.length) {
  console.error(`Phase 2B browser QA failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}.`);
  for (const failure of failures.slice(0, 30)) console.error(`- ${failure.scenario}${failure.viewport ? `/${failure.viewport}` : ""}: ${failure.type ?? failure.route ?? "failure"}`);
  console.error(`Machine report: ${path.relative(ROOT, options.report).replaceAll("\\", "/")}`);
  process.exitCode = 1;
} else {
  console.log(`Verified Phase 2B browser behavior across ${report.viewports.length} viewport${report.viewports.length === 1 ? "" : "s"}, static accessibility modes, native-scroll traversal and ${report.supportingRoutes.length} supporting routes.`);
  console.log(`Machine report: ${path.relative(ROOT, options.report).replaceAll("\\", "/")}`);
}
