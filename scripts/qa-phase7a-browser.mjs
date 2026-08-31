#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import axeCore from "axe-core";
import { chromium, firefox, webkit } from "playwright-core";

import { PHASE7A_BRANCH, PHASE7A_GATES, PUBLIC_ROUTES } from "./phase7a-contract.mjs";
import {
  AXE_VIEWPORT_IDS,
  CORE_VIEWPORTS,
  CROSS_ENGINE_VIEWPORT_IDS,
  HOME_EXTRA_VIEWPORT_IDS,
  REAL_404_PATH,
  ROUTE_MATRIX_COUNTS,
} from "./phase7a-browser-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BROWSERS = Object.freeze({ chromium, firefox, webkit });
const MANIFESTO = "We turn industrial needs into field evidence.";
const INTENTIONAL_404 = Object.freeze({
  route: REAL_404_PATH,
  h1: "Signal not found.",
  expectedStatus: 404,
});

export const SCHEMA = "quantum-hub.phase-7a.browser-validation.v1";
export const RESPONSIVE_VIEWPORTS = CORE_VIEWPORTS;
export const AXE_VIEWPORTS = Object.freeze(AXE_VIEWPORT_IDS.map((id) => CORE_VIEWPORTS.find((viewport) => viewport.id === id)));
export const ROUTE_OUTCOMES = Object.freeze([
  ...PUBLIC_ROUTES.map((item) => ({ ...item, expectedStatus: 200 })),
  INTENTIONAL_404,
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertExternalOutput(candidate) {
  const resolved = path.resolve(candidate);
  invariant(path.extname(resolved).toLowerCase() === ".json", "--output must name a JSON file");
  invariant(!within(ROOT, resolved), "browser evidence must remain outside the repository");
  invariant(!within(os.tmpdir(), resolved), "browser evidence must remain outside OS temporary storage");
  return resolved;
}

function nextValue(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4322/",
    engine: "all",
    headed: false,
    help: false,
    output: "",
    selfTest: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--base-url") { options.baseUrl = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--engine") { options.engine = nextValue(argv, index, flag).toLowerCase(); index += 1; }
    else if (flag === "--output") { options.output = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--timeout-ms") { options.timeoutMs = Number(nextValue(argv, index, flag)); index += 1; }
    else if (flag === "--headed") options.headed = true;
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  invariant(["all", ...Object.keys(BROWSERS)].includes(options.engine), "--engine must be all, chromium, firefox or webkit");
  invariant(Number.isInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms must be 5000..120000");
  const base = new URL(options.baseUrl);
  invariant(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "--base-url must be credential-free HTTP(S)");
  base.hash = "";
  base.search = "";
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  options.baseUrl = base.toString();
  if (!options.help && !options.selfTest) {
    invariant(options.output, "--output is required");
    options.output = assertExternalOutput(options.output);
  }
  return options;
}

function canonicalText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function settle(page, delay = 80) {
  await page.waitForLoadState("load").catch(() => undefined);
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded", null, { timeout: 3_000 }).catch(() => undefined);
  await page.waitForTimeout(delay);
}

async function diagnostics(page) {
  const output = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on("console", (message) => { if (message.type() === "error") output.consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => output.pageErrors.push(error.message));
  page.on("requestfailed", (request) => output.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? "unknown" }));
  return output;
}

async function inspectDocument(page) {
  return page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const rect = h1?.getBoundingClientRect();
    const root = document.documentElement;
    const body = document.body;
    const visible = (node) => {
      if (!(node instanceof Element)) return false;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
    };
    const targets = [...document.querySelectorAll("a[href], summary, button, input, select, textarea")]
      .filter(visible)
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { tag: node.tagName.toLowerCase(), text: node.textContent?.replace(/\s+/g, " ").trim().slice(0, 80), width: box.width, height: box.height };
      });
    return {
      activeElement: document.activeElement?.tagName.toLowerCase() ?? null,
      bodyHeight: body?.scrollHeight ?? 0,
      cinematicMode: root.dataset.cinematicMode ?? null,
      fieldMapOpen: root.hasAttribute("data-field-map-open"),
      h1: h1?.getAttribute("aria-label") || h1?.textContent?.replace(/\s+/g, " ").trim() || null,
      h1Count: document.querySelectorAll("h1").length,
      h1Rect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      horizontalOverflow: Math.max(root.scrollWidth, body?.scrollWidth ?? 0) > root.clientWidth + 1,
      htmlHeight: root.scrollHeight,
      landmarkCounts: {
        footer: document.querySelectorAll("footer").length,
        header: document.querySelectorAll("header.site-header").length,
        main: document.querySelectorAll("main").length,
        navigation: document.querySelectorAll("nav").length,
      },
      manifestoReveal: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") ?? null,
      routeNavigation: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-route-navigation") ?? null,
      scrollY,
      targetMinimum: targets.length ? Math.min(...targets.map(({ width, height }) => Math.min(width, height))) : null,
      targetFailures: targets.filter(({ width, height }) => width < 44 || height < 44),
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
}

function documentChecks(state, expectedH1) {
  return {
    oneH1: state.h1Count === 1,
    expectedH1: canonicalText(state.h1) === canonicalText(expectedH1),
    landmarks: state.landmarkCounts.header === 1 && state.landmarkCounts.main === 1 && state.landmarkCounts.footer === 1 && state.landmarkCounts.navigation >= 1,
    noHorizontalOverflow: !state.horizontalOverflow,
    targetSizes: state.targetFailures.length === 0,
  };
}

async function axe(page) {
  await page.addScriptTag({ content: axeCore.source });
  const result = await page.evaluate(async () => {
    const outcome = await globalThis.axe.run(document, {
      resultTypes: ["violations", "incomplete"],
      rules: { region: { enabled: true } },
    });
    return {
      incomplete: outcome.incomplete.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length })),
      violations: outcome.violations.map(({ id, impact, nodes, help }) => ({ id, impact, nodes: nodes.length, help })),
    };
  });
  return { ...result, status: result.violations.length === 0 ? "PASS" : "FAIL" };
}

function routeViewports(engine) {
  if (engine === "chromium") return RESPONSIVE_VIEWPORTS;
  return CROSS_ENGINE_VIEWPORT_IDS.map((id) => RESPONSIVE_VIEWPORTS.find((viewport) => viewport.id === id));
}

async function routeMatrix(browser, baseUrl, timeoutMs, engine) {
  const cases = [];
  for (const viewport of routeViewports(engine)) {
    for (const route of ROUTE_OUTCOMES) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      const diag = await diagnostics(page);
      const response = await page.goto(new URL(route.route, baseUrl).toString(), { waitUntil: "load" });
      await settle(page);
      const state = await inspectDocument(page);
      const checks = {
        status: response?.status() === route.expectedStatus,
        ...documentChecks(state, route.h1),
        console: diag.consoleErrors.length === 0 && diag.pageErrors.length === 0,
      };
      cases.push({ route: route.route, viewport, responseStatus: response?.status() ?? null, state, diagnostics: diag, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" });
      await context.close();
    }
  }
  if (engine !== "chromium") {
    for (const viewport of HOME_EXTRA_VIEWPORT_IDS.map((id) => RESPONSIVE_VIEWPORTS.find((candidate) => candidate.id === id))) {
      const route = ROUTE_OUTCOMES[0];
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      const diag = await diagnostics(page);
      const response = await page.goto(new URL(route.route, baseUrl).toString(), { waitUntil: "load" });
      await settle(page);
      const state = await inspectDocument(page);
      const checks = { status: response?.status() === 200, ...documentChecks(state, route.h1), console: diag.consoleErrors.length === 0 && diag.pageErrors.length === 0 };
      cases.push({ route: route.route, viewport, responseStatus: response?.status() ?? null, state, diagnostics: diag, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" });
      await context.close();
    }
  }
  return cases;
}

async function axeMatrix(browser, baseUrl, timeoutMs) {
  const cases = [];
  for (const viewport of AXE_VIEWPORTS) {
    for (const route of ROUTE_OUTCOMES) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      const response = await page.goto(new URL(route.route, baseUrl).toString(), { waitUntil: "load" });
      await settle(page);
      const accessibility = await axe(page);
      const checks = { status: response?.status() === route.expectedStatus, axe: accessibility.status === "PASS" };
      cases.push({ route: route.route, viewport, responseStatus: response?.status() ?? null, accessibility, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" });
      await context.close();
    }
  }
  return cases;
}

async function responsiveMatrix(browser, baseUrl, timeoutMs, engine) {
  const views = engine === "chromium" ? RESPONSIVE_VIEWPORTS : ["desktop-1440x900", "tablet-portrait-768x1024", "narrow-320x800", "mobile-landscape-844x390"].map((id) => RESPONSIVE_VIEWPORTS.find((viewport) => viewport.id === id));
  const cases = [];
  for (const viewport of views) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    const diag = await diagnostics(page);
    await page.goto(new URL("#entry", baseUrl).toString(), { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: 5_000 }).catch(() => undefined);
    await settle(page, 100);
    const state = await inspectDocument(page);
    const words = await page.evaluate(() => [...document.querySelectorAll(".manifesto-word")].map((word) => {
      const box = word.getBoundingClientRect();
      return { text: word.textContent, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    const intact = words.length === 7 && words.every(({ left, right }) => left >= -1 && right <= viewport.width + 1);
    const h1Fits = state.h1Rect && state.h1Rect.left >= -1 && state.h1Rect.right <= viewport.width + 1 && state.h1Rect.bottom <= viewport.height + 1;
    const checks = { ...documentChecks(state, MANIFESTO), manifestoResolved: state.manifestoReveal === "resolved", wholeWords: intact, h1Fits: Boolean(h1Fits), console: diag.consoleErrors.length === 0 && diag.pageErrors.length === 0 };
    cases.push({ viewport, state, words, diagnostics: diag, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" });
    await context.close();
  }
  return cases;
}

async function fieldMapCase(browser, baseUrl, timeoutMs) {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.goto(new URL("#entry", baseUrl).toString(), { waitUntil: "load" });
  await settle(page);
  await page.evaluate(() => {
    const threshold = document.querySelector("[data-field-map-threshold]");
    if (threshold) window.scrollTo(0, threshold.getBoundingClientRect().top + scrollY + 12);
  });
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-route-navigation") === "released");
  const summary = page.locator("[data-field-map] > summary");
  await summary.focus();
  const focusBefore = await page.evaluate(() => document.activeElement?.tagName);
  await summary.press("Enter");
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-field-map-open"));
  const opened = await page.evaluate(() => {
    const plane = document.querySelector(".field-map__plane")?.getBoundingClientRect();
    const links = [...document.querySelectorAll("#field-map-navigation a")].map((link) => {
      const rect = link.getBoundingClientRect();
      return { href: link.getAttribute("href"), width: rect.width, height: rect.height };
    });
    return { active: document.activeElement?.getAttribute("href"), links, plane: plane ? { left: plane.left, right: plane.right, top: plane.top, bottom: plane.bottom } : null };
  });
  await page.keyboard.press("Escape");
  const closed = await page.evaluate(() => ({
    active: document.activeElement?.tagName.toLowerCase(),
    open: document.querySelector("[data-field-map]")?.hasAttribute("open"),
    rootOpen: document.documentElement.hasAttribute("data-field-map-open"),
  }));
  const checks = {
    focusBefore: focusBefore === "SUMMARY",
    eightLinks: opened.links.length === 8,
    ordinaryLinks: opened.links.every(({ href }) => typeof href === "string" && href.startsWith("/")),
    targetSizes: opened.links.every(({ width, height }) => width >= 44 && height >= 44),
    fullViewport: Boolean(opened.plane && opened.plane.left <= 1 && opened.plane.right >= 319 && opened.plane.top <= 1 && opened.plane.bottom >= 799),
    escapeCloses: closed.open === false && closed.rootOpen === false,
    focusReturn: closed.active === "summary",
  };
  await context.close();
  return { opened, closed, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
}

async function fallbackCases(browser, baseUrl, timeoutMs) {
  const results = {};

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(baseUrl, { waitUntil: "load" });
    await settle(page);
    const state = await inspectDocument(page);
    const checks = { staticMode: state.cinematicMode === "static", manifesto: canonicalText(state.h1) === canonicalText(MANIFESTO), noCinematicRequest: !requests.some((url) => /phase-4r2.*\.mp4/i.test(url)), noOverflow: !state.horizontalOverflow };
    results.reducedMotion = { state, cinematicRequests: requests.filter((url) => /phase-4r2|\.mp4/i.test(url)), checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 320, height: 800 }, javaScriptEnabled: false });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(baseUrl, { waitUntil: "load" });
    await settle(page);
    const state = await inspectDocument(page);
    await page.locator("[data-field-map] > summary").click();
    const details = await page.evaluate(() => ({
      links: document.querySelectorAll("[data-field-map] nav a").length,
      open: document.querySelector("[data-field-map]")?.hasAttribute("open") ?? false,
      visibleLinks: [...document.querySelectorAll("[data-field-map] nav a")].filter((node) => node.getBoundingClientRect().height > 0).length,
    }));
    const checks = { manifesto: canonicalText(state.h1) === canonicalText(MANIFESTO), compact: state.bodyHeight < 4_000, eightLinks: details.links === 8, nativeMapUsable: details.open && details.visibleLinks === 8, noCinematicRequest: !requests.some((url) => /phase-4r2.*\.mp4/i.test(url)), noOverflow: !state.horizontalOverflow };
    results.noJavaScript = { state, details, cinematicRequests: requests.filter((url) => /phase-4r2|\.mp4/i.test(url)), checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.route(/\.(?:woff2?|ttf|otf)(?:[?#]|$)/i, (route) => route.abort("failed"));
    await page.goto(new URL("#entry", baseUrl).toString(), { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: 5_000 }).catch(() => undefined);
    await settle(page);
    const state = await inspectDocument(page);
    const font = await page.locator("h1").evaluate((node) => ({ family: getComputedStyle(node).fontFamily, stretch: getComputedStyle(node).fontStretch }));
    const checks = { manifesto: canonicalText(state.h1) === canonicalText(MANIFESTO), noOverflow: !state.horizontalOverflow, fits: Boolean(state.h1Rect && state.h1Rect.left >= -1 && state.h1Rect.right <= 321 && state.h1Rect.bottom <= 801) };
    results.fallbackFont = { state, font, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
    await context.close();
  }
  return results;
}

async function intentHistoryCase(browser, baseUrl, timeoutMs) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 650 } });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.goto(new URL("for-partners/", baseUrl).toString(), { waitUntil: "load" });
  await page.locator("a.brand-link").click();
  await page.waitForURL(/\/#entry$/);
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: 5_000 }).catch(() => undefined);
  const entry = await inspectDocument(page);
  await page.goBack({ waitUntil: "load" });
  const back = { url: page.url(), h1: await page.locator("h1").getAttribute("aria-label") ?? await page.locator("h1").textContent() };
  await page.goForward({ waitUntil: "load" });
  await settle(page);
  const forward = await inspectDocument(page);
  const checks = {
    exactEntry: new URL(page.url()).hash === "#entry",
    entryResolved: entry.manifestoReveal === "resolved" && entry.scrollY > 0,
    noF1FlashState: entry.cinematicMode === "enhanced" && entry.h1Rect?.bottom > 0,
    backRoute: new URL(back.url).pathname === "/for-partners/",
    forwardEntry: forward.manifestoReveal === "resolved" && forward.scrollY > 0,
  };
  await context.close();
  return { entry, back, forward, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
}

async function reverseCyclesCase(browser, baseUrl, timeoutMs) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    const originalRaf = window.requestAnimationFrame.bind(window);
    const originalCancel = window.cancelAnimationFrame.bind(window);
    const originalInterval = window.setInterval.bind(window);
    const originalClearInterval = window.clearInterval.bind(window);
    const rafs = new Set();
    const intervals = new Set();
    window.requestAnimationFrame = (callback) => {
      let id = 0;
      id = originalRaf((time) => { rafs.delete(id); callback(time); });
      rafs.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => { rafs.delete(id); originalCancel(id); };
    window.setInterval = (callback, delay, ...args) => { const id = originalInterval(callback, delay, ...args); intervals.add(id); return id; };
    window.clearInterval = (id) => { intervals.delete(id); originalClearInterval(id); };
    window.__phase7aWork = { rafs, intervals };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced", null, { timeout: 8_000 }).catch(() => undefined);
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const entry = document.querySelector("#entry");
    if (!shell || !entry) return null;
    return { entry: entry.offsetTop, max: Math.max(0, document.documentElement.scrollHeight - innerHeight), shell: shell.offsetHeight };
  });
  invariant(geometry, "cinematic geometry unavailable");
  const samples = [];
  for (let cycle = 1; cycle <= 10; cycle += 1) {
    await page.evaluate((y) => window.scrollTo(0, y), geometry.entry + 20);
    await page.waitForTimeout(80);
    const forward = await page.evaluate(() => ({ reveal: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal"), progress: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-cinematic-progress"), scrollY }));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(80);
    const reverse = await page.evaluate(() => ({ reveal: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal"), progress: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-cinematic-progress"), scrollY }));
    samples.push({ cycle, forward, reverse });
  }
  await page.waitForTimeout(350);
  const rest = await page.evaluate(() => ({ pendingAnimationFrames: globalThis.__phase7aWork?.rafs.size ?? null, activeIntervals: globalThis.__phase7aWork?.intervals.size ?? null }));
  const checks = {
    tenCycles: samples.length === 10,
    forwardLatestPosition: samples.every(({ forward }) => forward.scrollY > 0),
    reverseExactTop: samples.every(({ reverse }) => reverse.scrollY === 0),
    reverseClearsManifesto: samples.every(({ reverse }) => reverse.reveal === "hidden"),
    noIdleRaf: rest.pendingAnimationFrames === 0,
    noIntervals: rest.activeIntervals === 0,
  };
  await context.close();
  return { geometry, samples, rest, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
}

async function networkCases(browser, baseUrl, timeoutMs) {
  const results = [];
  for (const policy of ["blocked", "slow"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    let cinematicRequests = 0;
    await page.route(/phase-4r2.*\.mp4(?:[?#]|$)/i, async (route) => {
      cinematicRequests += 1;
      if (policy === "blocked") await route.abort("failed");
      else { await new Promise((resolve) => setTimeout(resolve, 500)); await route.continue(); }
    });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(policy === "blocked" ? 4_500 : 900);
    const state = await inspectDocument(page);
    const checks = { semanticH1: canonicalText(state.h1) === canonicalText(MANIFESTO), noOverflow: !state.horizontalOverflow, boundedRequests: cinematicRequests <= 1 };
    results.push({ policy, cinematicRequests, state, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" });
    await context.close();
  }
  return results;
}

async function runEngine(engine, options) {
  const browserType = BROWSERS[engine];
  const executablePath = browserType.executablePath();
  const executable = await stat(executablePath).then(() => executablePath).catch(() => null);
  invariant(executable, `managed ${engine} executable unavailable: ${executablePath}`);
  const browser = await browserType.launch({ headless: !options.headed, executablePath });
  try {
    const identity = { engine, executable: path.basename(executablePath), version: browser.version(), authority: engine === "webkit" ? "Playwright WebKit proxy; not physical Safari" : `Playwright managed ${engine}` };
    const routes = await routeMatrix(browser, options.baseUrl, options.timeoutMs, engine);
    const accessibility = await axeMatrix(browser, options.baseUrl, options.timeoutMs);
    const responsive = await responsiveMatrix(browser, options.baseUrl, options.timeoutMs, engine);
    const fieldMap = await fieldMapCase(browser, options.baseUrl, options.timeoutMs);
    const fallback = await fallbackCases(browser, options.baseUrl, options.timeoutMs);
    const history = await intentHistoryCase(browser, options.baseUrl, options.timeoutMs);
    const cycles = await reverseCyclesCase(browser, options.baseUrl, options.timeoutMs);
    const network = await networkCases(browser, options.baseUrl, options.timeoutMs);
    const failures = [
      ...routes.filter(({ status }) => status !== "PASS").map(({ route, viewport }) => `route:${route}:${viewport.id}`),
      ...accessibility.filter(({ status }) => status !== "PASS").map(({ route, viewport }) => `axe:${route}:${viewport.id}`),
      ...responsive.filter(({ status }) => status !== "PASS").map(({ viewport }) => `responsive:${viewport.id}`),
      ...(fieldMap.status === "PASS" ? [] : ["field-map"]),
      ...Object.entries(fallback).filter(([, value]) => value.status !== "PASS").map(([key]) => `fallback:${key}`),
      ...(history.status === "PASS" ? [] : ["history"]),
      ...(cycles.status === "PASS" ? [] : ["lifecycle"]),
      ...network.filter(({ status }) => status !== "PASS").map(({ policy }) => `network:${policy}`),
    ];
    return { identity, routes, accessibility, responsive, fieldMap, fallback, history, cycles, network, failures, status: failures.length ? "FAIL" : "PASS" };
  } finally {
    await browser.close();
  }
}

export function selfTest() {
  invariant(RESPONSIVE_VIEWPORTS.length === 13, "responsive contract must contain 13 viewports");
  invariant(ROUTE_OUTCOMES.length === 10, "route contract must contain nine public routes and a real 404");
  invariant(AXE_VIEWPORTS.length * ROUTE_OUTCOMES.length * 3 === 60, "full accessibility matrix must contain 60 cases");
  invariant(PHASE7A_GATES.length === 6 && PHASE7A_GATES.every(Boolean), "six human gates required");
  invariant(ROUTE_MATRIX_COUNTS.all === 198, "route matrix contract must contain 198 cases");
  return { schema: SCHEMA, status: "PASS", responsiveViewports: 13, routeOutcomes: 10, fullRouteCases: 198, fullAxeCases: 60, thresholdCyclesPerEngine: 10 };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/qa-phase7a-browser.mjs --base-url <url> --output <external.json> [--engine all|chromium|firefox|webkit]\n");
    return;
  }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`); return; }
  try { await stat(options.output); throw new Error(`refusing to overwrite existing evidence: ${options.output}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const startedAt = new Date().toISOString();
  const engines = options.engine === "all" ? Object.keys(BROWSERS) : [options.engine];
  const results = [];
  for (const engine of engines) results.push(await runEngine(engine, options));
  const report = {
    schema: SCHEMA,
    branch: PHASE7A_BRANCH,
    baseUrl: options.baseUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    results,
    limitations: [
      "WebKit is the Playwright WebKit proxy and is not physical Safari.",
      "Programmatic scroll in the harness observes product response; it is not evidence of physical wheel or touch input.",
      "Automated focus, contrast and target checks supplement but do not replace human review.",
      "All six creative and integration gates remain PENDING HUMAN REVIEW regardless of automated status.",
    ],
    humanGates: Object.fromEntries(PHASE7A_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"])),
    status: results.every(({ status }) => status === "PASS") ? "PASS" : "FAIL",
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  report.reportSha256 = sha256(serialized);
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({ status: report.status, output: options.output, engines: results.map(({ identity, failures }) => ({ engine: identity.engine, version: identity.version, failures })) }, null, 2)}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`Phase 7A browser validation FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
}
