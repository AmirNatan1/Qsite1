import { execFile } from "node:child_process";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

import { PHASE5B_ROUTES, RESPONSIVE_MATRIX } from "./phase5b-route-contract.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AXE_PATH = path.join(ROOT, "node_modules", "axe-core", "axe.min.js");
const TARGET_MINIMUM = 44;
const OVERFLOW_TOLERANCE = 1.5;

export const SCHEMA = "quantum-hub.phase-5b.responsive-accessibility.v1";
export const ROUTES = Object.freeze(PHASE5B_ROUTES.map((route) => Object.freeze({
  id: route.id,
  path: route.path,
  acts: route.acts,
  regions: route.regions,
})));
export const REQUIRED_VIEWPORTS = Object.freeze(RESPONSIVE_MATRIX.map(([width, height]) => Object.freeze({
  id: `${width}x${height}`,
  width,
  height,
})));
export const ACCESSIBILITY_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "desktop-1440x900", width: 1440, height: 900 }),
  Object.freeze({ id: "portrait-390x844", width: 390, height: 844 }),
]);
export const TEXT_200_PROXY = Object.freeze({ id: "text-200-proxy-720x450", width: 720, height: 450 });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4338/",
    browser: "",
    expectedHead: "",
    output: "",
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => argv[++index] ?? "";
    if (argument === "--base-url") options.baseUrl = next();
    else if (argument === "--browser") options.browser = next();
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  options.baseUrl = new URL(options.baseUrl).toString();
  if (options.expectedHead && !/^[0-9a-f]{40}$/.test(options.expectedHead)) throw new Error("--expected-head must be a full 40-character Git SHA");
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5_000) throw new Error("--timeout-ms must be at least 5000");
  return options;
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function resolveBrowser(explicitPath) {
  const candidates = [];
  if (explicitPath) candidates.push(path.resolve(explicitPath));
  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    candidates.push("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium");
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  throw new Error("Chrome/Chromium not found; pass --browser PATH");
}

async function gitHead() {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: ROOT, windowsHide: true });
  return stdout.trim().toLowerCase();
}

function targetUrl(baseUrl, route) {
  return new URL(route.path.replace(/^\//, ""), baseUrl).toString();
}

function expectedStatus(route) {
  return route.id === "404" ? 404 : 200;
}

async function settle(page) {
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(40);
}

async function observePage(page) {
  return page.evaluate(({ targetMinimum, overflowTolerance }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
    };
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const selector = (element) => {
      if (element.id) return `#${element.id}`;
      const classes = [...element.classList].slice(0, 2).join(".");
      return `${element.localName}${classes ? `.${classes}` : ""}`;
    };
    const clippingAncestors = (element) => {
      const elementRect = element.getBoundingClientRect();
      const hits = [];
      for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (![style.overflow, style.overflowX, style.overflowY].some((value) => /hidden|clip/.test(value))) continue;
        const ancestorRect = ancestor.getBoundingClientRect();
        if (elementRect.left < ancestorRect.left - overflowTolerance || elementRect.right > ancestorRect.right + overflowTolerance || elementRect.top < ancestorRect.top - overflowTolerance || elementRect.bottom > ancestorRect.bottom + overflowTolerance) {
          hits.push(selector(ancestor));
        }
      }
      return hits;
    };

    const routeRoot = document.querySelector("[data-route-production]");
    const h1 = document.querySelector("main h1");
    const h1Rect = rect(h1);
    const headings = [...document.querySelectorAll("main h1,main h2,main h3,main h4,main h5,main h6")];
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const brokenLabelledBy = [...document.querySelectorAll("[aria-labelledby]")].flatMap((element) => (
      element.getAttribute("aria-labelledby").split(/\s+/).filter((id) => !document.getElementById(id)).map((id) => ({ selector: selector(element), id }))
    ));
    const focusable = [...document.querySelectorAll("a[href],button:not([disabled]),summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])")].filter(visible);
    const smallTargets = focusable.flatMap((element) => {
      const value = rect(element);
      if (value.width + 0.01 >= targetMinimum && value.height + 0.01 >= targetMinimum) return [];
      return [{ selector: selector(element), text: element.textContent?.trim().slice(0, 80), rect: value }];
    });
    const semantic = [...document.querySelectorAll("main h1,main h2,main h3,main p,main li,main a,main button,main summary,main figcaption")].filter(visible);
    const horizontalOutliers = semantic.flatMap((element) => {
      const value = rect(element);
      if (value.left >= -overflowTolerance && value.right <= document.documentElement.clientWidth + overflowTolerance) return [];
      return [{ selector: selector(element), text: element.textContent?.trim().slice(0, 80), rect: value }];
    });
    const clippedText = semantic.flatMap((element) => clippingAncestors(element).map((ancestor) => ({ selector: selector(element), ancestor })));
    const actRecords = [...document.querySelectorAll("[data-route-act]")].map((element) => ({
      id: element.getAttribute("data-route-act"),
      textLength: element.textContent?.replace(/\s+/g, " ").trim().length ?? 0,
      visible: visible(element),
    }));
    const routeScripts = [...document.scripts].map((script) => script.src).filter(Boolean);
    const animations = document.getAnimations().filter((animation) => animation.playState === "running").map((animation) => ({
      duration: Number(animation.effect?.getTiming?.().duration) || 0,
      iterations: Number(animation.effect?.getTiming?.().iterations) || 0,
    }));
    return {
      acts: actRecords,
      architecture: routeRoot?.getAttribute("data-route-architecture") ?? null,
      brokenLabelledBy,
      clippedText,
      documentHeight: document.documentElement.scrollHeight,
      duplicateIds,
      focusableCount: focusable.length,
      h1: {
        clippedBy: h1 ? clippingAncestors(h1) : [],
        count: document.querySelectorAll("main h1").length,
        rect: h1Rect,
        text: h1?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        visible: Boolean(h1 && visible(h1)),
      },
      headings: headings.map((element) => ({ level: Number(element.localName.slice(1)), text: element.textContent?.replace(/\s+/g, " ").trim() ?? "" })),
      horizontalOutliers,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
      mainCount: document.querySelectorAll("main").length,
      mediaInRoute: routeRoot?.querySelectorAll("img,picture,video,audio,source,canvas,svg").length ?? 0,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      regions: document.querySelectorAll("[data-route-region]").length,
      route: routeRoot?.getAttribute("data-route-production") ?? null,
      routeScripts,
      runningAnimations: animations,
      skipLinkValid: document.querySelector(".skip-link")?.getAttribute("href") === "#main-content" && document.querySelectorAll("#main-content").length === 1,
      smallTargets,
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, { targetMinimum: TARGET_MINIMUM, overflowTolerance: OVERFLOW_TOLERANCE });
}

export function layoutFailures(record, route, options = {}) {
  const failures = [];
  const add = (code, details = {}) => failures.push({ code, route: route.id, viewport: record.viewport, ...details });
  if (record.route !== route.id) add("route-identity", { actual: record.route });
  if (record.mainCount !== 1) add("main-count", { actual: record.mainCount });
  if (record.h1.count !== 1 || !record.h1.visible || !record.h1.text) add("h1", { actual: record.h1 });
  if (record.h1.rect && (record.h1.rect.left < -OVERFLOW_TOLERANCE || record.h1.rect.right > record.viewport.width + OVERFLOW_TOLERANCE)) add("h1-horizontal", { actual: record.h1.rect });
  if (options.requireH1InFirstViewport && record.h1.rect && (record.h1.rect.top < -OVERFLOW_TOLERANCE || record.h1.rect.bottom > record.viewport.height + OVERFLOW_TOLERANCE)) add("h1-first-viewport", { actual: record.h1.rect });
  if (record.h1.clippedBy.length) add("h1-clipped", { actual: record.h1.clippedBy });
  if (record.horizontalOverflow > OVERFLOW_TOLERANCE) add("horizontal-overflow", { actual: record.horizontalOverflow });
  if (record.horizontalOutliers.length) add("semantic-horizontal-overflow", { actual: record.horizontalOutliers });
  if (record.clippedText.length) add("clipped-text", { actual: record.clippedText });
  if (record.smallTargets.length) add("target-size", { actual: record.smallTargets });
  if (record.duplicateIds.length) add("duplicate-id", { actual: record.duplicateIds });
  if (record.brokenLabelledBy.length) add("aria-labelledby", { actual: record.brokenLabelledBy });
  if (!record.skipLinkValid) add("skip-link");
  if (record.acts.length !== route.acts || record.acts.some((act) => !act.visible || act.textLength < 8)) add("route-acts", { actual: record.acts, expected: route.acts });
  if (route.regions !== undefined && record.regions !== route.regions) add("route-regions", { actual: record.regions, expected: route.regions });
  if (options.expectReduced && (!record.reducedMotion || record.runningAnimations.some((animation) => animation.duration > 20 || animation.iterations > 1))) add("reduced-motion", { actual: record.runningAnimations });
  return failures;
}

function diagnosticsFor(page, route) {
  for (const event of ["console", "pageerror", "requestfailed", "response"]) page.removeAllListeners(event);
  const report = { consoleErrors: [], consoleWarnings: [], pageErrors: [], requestFailures: [], httpErrors: [] };
  page.on("console", (message) => {
    if (message.type() === "error" && !(route.id === "404" && /server responded with a status of 404/i.test(message.text()))) report.consoleErrors.push(message.text());
    if (message.type() === "warning") report.consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  page.on("requestfailed", (request) => report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" }));
  page.on("response", (response) => {
    if (response.status() >= 400 && !(route.id === "404" && response.request().isNavigationRequest() && response.status() === 404)) report.httpErrors.push({ url: response.url(), status: response.status() });
  });
  return report;
}

async function openRoute(page, options, route) {
  const diagnostics = diagnosticsFor(page, route);
  const response = await page.goto(targetUrl(options.baseUrl, route), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page);
  return { diagnostics, httpStatus: response?.status() ?? null };
}

async function runResponsiveMatrix(browser, options) {
  const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block" });
  const page = await context.newPage();
  const cases = [];
  try {
    for (const viewport of REQUIRED_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of ROUTES) {
        const opened = await openRoute(page, options, route);
        const observation = await observePage(page);
        const failures = [
          ...layoutFailures(observation, route, { requireH1InFirstViewport: true }),
          ...(opened.httpStatus === expectedStatus(route) ? [] : [{ code: "http-status", route: route.id, viewport, actual: opened.httpStatus, expected: expectedStatus(route) }]),
        ];
        cases.push({ route: route.id, viewport, observation, diagnostics: opened.diagnostics, failures, status: failures.length ? "FAIL" : "PASS" });
      }
    }
  } finally {
    await context.close();
  }
  return cases;
}

async function runStaticVariant(browser, options, variant) {
  const records = [];
  for (const viewport of variant.viewports) {
    const context = await browser.newContext({
      colorScheme: "dark",
      javaScriptEnabled: variant.javaScriptEnabled,
      reducedMotion: variant.reducedMotion,
      serviceWorkers: "block",
      viewport: { width: viewport.width, height: viewport.height },
    });
    if (variant.blockFonts) await context.route(/\/fonts\//, (route) => route.abort("blockedbyclient"));
    const page = await context.newPage();
    try {
      for (const route of ROUTES) {
        const opened = await openRoute(page, options, route);
        const observation = await observePage(page);
        const failures = layoutFailures(observation, route, { requireH1InFirstViewport: true, expectReduced: variant.reducedMotion === "reduce" });
        if (opened.httpStatus !== expectedStatus(route)) failures.push({ code: "http-status", route: route.id, viewport, actual: opened.httpStatus, expected: expectedStatus(route) });
        if (variant.blockFonts) {
          const fontState = await page.evaluate(() => ({
            interLoaded: document.fonts.check("16px Inter"),
            newsreaderLoaded: document.fonts.check("16px Newsreader"),
            syneLoaded: document.fonts.check("16px Syne"),
          }));
          observation.fontState = fontState;
          if (Object.values(fontState).some(Boolean)) failures.push({ code: "fallback-font-not-forced", route: route.id, viewport, actual: fontState });
          opened.diagnostics.requestFailures = opened.diagnostics.requestFailures.filter((failure) => !/\/fonts\//.test(failure.url));
          opened.diagnostics.consoleErrors = opened.diagnostics.consoleErrors.filter((message) => !/font|ERR_FAILED|ERR_BLOCKED_BY_CLIENT/i.test(message));
        }
        records.push({ route: route.id, viewport, observation, diagnostics: opened.diagnostics, failures, status: failures.length ? "FAIL" : "PASS" });
      }
    } finally {
      await context.close();
    }
  }
  return { id: variant.id, records };
}

async function runMobileNavigation(browser, options) {
  const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const records = [];
  try {
    for (const route of ROUTES) {
      const opened = await openRoute(page, options, route);
      const trigger = page.locator(".mobile-nav summary");
      await trigger.click();
      await page.waitForTimeout(50);
      const state = await page.evaluate(({ minimum, tolerance }) => {
        const details = document.querySelector(".mobile-nav");
        const links = [...document.querySelectorAll(".mobile-nav nav a")].map((element) => {
          const rect = element.getBoundingClientRect();
          return { text: element.textContent?.trim(), rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } };
        });
        return {
          ariaExpanded: details?.querySelector("summary")?.getAttribute("aria-expanded"),
          horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          links,
          open: details?.hasAttribute("open") ?? false,
          pass: Boolean(details?.hasAttribute("open")) && links.length === 8 && links.every((link) => link.rect.width + 0.01 >= minimum && link.rect.height + 0.01 >= minimum && link.rect.left >= -tolerance && link.rect.right <= innerWidth + tolerance),
        };
      }, { minimum: TARGET_MINIMUM, tolerance: OVERFLOW_TOLERANCE });
      const failures = state.pass && state.ariaExpanded === "true" && state.horizontalOverflow <= OVERFLOW_TOLERANCE ? [] : [{ code: "mobile-navigation", route: route.id, actual: state }];
      records.push({ route: route.id, state, diagnostics: opened.diagnostics, failures, status: failures.length ? "FAIL" : "PASS" });
    }
  } finally {
    await context.close();
  }
  return records;
}

async function runKeyboard(browser, options) {
  const records = [];
  for (const viewport of ACCESSIBILITY_VIEWPORTS) {
    const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block", viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    try {
      for (const route of ROUTES) {
        const opened = await openRoute(page, options, route);
        const sequence = [];
        for (let index = 0; index < 12; index += 1) {
          await page.keyboard.press("Tab");
          if (index === 0) await page.waitForTimeout(220);
          sequence.push(await page.evaluate(() => {
            const element = document.activeElement;
            const style = element ? getComputedStyle(element) : null;
            const rect = element?.getBoundingClientRect();
            return {
              href: element?.getAttribute?.("href") ?? null,
              outlineStyle: style?.outlineStyle ?? null,
              outlineWidth: style?.outlineWidth ?? null,
              rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
              tag: element?.localName ?? null,
              text: element?.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "",
            };
          }));
        }
        const unique = new Set(sequence.map((item) => `${item.tag}|${item.text}|${item.href}`));
        const first = sequence[0];
        const focusVisible = sequence.filter((item) => item.outlineStyle && item.outlineStyle !== "none" && Number.parseFloat(item.outlineWidth) >= 2);
        const failures = [];
        if (first?.text !== "Skip to content" || first?.rect?.top < -OVERFLOW_TOLERANCE) failures.push({ code: "skip-link-keyboard", route: route.id, viewport, actual: first });
        if (unique.size < 4) failures.push({ code: "keyboard-order", route: route.id, viewport, actual: sequence });
        if (!focusVisible.length) failures.push({ code: "focus-visible", route: route.id, viewport, actual: sequence });
        records.push({ route: route.id, viewport, sequence, diagnostics: opened.diagnostics, failures, status: failures.length ? "FAIL" : "PASS" });
      }
    } finally {
      await context.close();
    }
  }
  return records;
}

async function runAxe(browser, options) {
  const records = [];
  for (const viewport of ACCESSIBILITY_VIEWPORTS) {
    const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block", viewport: { width: viewport.width, height: viewport.height } });
    await context.addInitScript({ path: AXE_PATH });
    const page = await context.newPage();
    try {
      for (const route of ROUTES) {
        const opened = await openRoute(page, options, route);
        const result = await page.evaluate(async () => window.axe.run(document, {
          resultTypes: ["violations", "incomplete"],
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
        }));
        const violations = result.violations.map((violation) => ({
          help: violation.help,
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => ({ failureSummary: node.failureSummary, html: node.html.slice(0, 400), target: node.target })),
        }));
        const seriousCritical = violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
        const failures = seriousCritical.map((violation) => ({ code: "axe-serious-critical", route: route.id, viewport, actual: violation }));
        records.push({ route: route.id, viewport, violations, incompleteCount: result.incomplete.length, diagnostics: opened.diagnostics, failures, status: failures.length ? "FAIL" : "PASS" });
      }
    } finally {
      await context.close();
    }
  }
  return records;
}

function diagnosticsFailures(section, records) {
  return records.flatMap((record) => {
    const diagnostics = record.diagnostics ?? {};
    const entries = [
      ...((diagnostics.consoleErrors ?? []).map((actual) => ({ code: "console-error", actual }))),
      ...((diagnostics.consoleWarnings ?? []).map((actual) => ({ code: "console-warning", actual }))),
      ...((diagnostics.pageErrors ?? []).map((actual) => ({ code: "page-error", actual }))),
      ...((diagnostics.requestFailures ?? []).map((actual) => ({ code: "request-failure", actual }))),
      ...((diagnostics.httpErrors ?? []).map((actual) => ({ code: "http-error", actual }))),
    ];
    return entries.map((entry) => ({ section, route: record.route, viewport: record.viewport ?? null, ...entry }));
  });
}

export function validateReport(report) {
  assert(report.schema === SCHEMA, "responsive/accessibility report schema differs");
  assert(report.routes.length === 9, "report must cover nine routes");
  assert(report.responsive.length === 9 * REQUIRED_VIEWPORTS.length, "responsive matrix is incomplete");
  assert(report.axe.length === 9 * ACCESSIBILITY_VIEWPORTS.length, "axe matrix is incomplete");
  assert(report.keyboard.length === 9 * ACCESSIBILITY_VIEWPORTS.length, "keyboard matrix is incomplete");
  assert(report.mobileNavigation.length === 9, "mobile navigation matrix is incomplete");
  assert(report.variants.every((variant) => variant.records.length === 9 * variant.viewports.length), "static variant matrix is incomplete");
  assert(report.summary.seriousCriticalAxe === 0, "serious/critical axe findings remain");
  assert(report.failures.length === 0, `responsive/accessibility failures remain: ${report.failures.length}`);
  assert(report.status === "PASS", "responsive/accessibility status is not PASS");
  return true;
}

async function writeFreshExternal(filePath, contents) {
  const resolved = path.resolve(filePath);
  const relativeToRoot = path.relative(ROOT, resolved);
  assert(relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot), "output must remain external and untracked");
  const relativeToTemp = path.relative(path.resolve(os.tmpdir()), resolved);
  assert(relativeToTemp.startsWith("..") && !path.isAbsolute(relativeToTemp), "output must not use OS temporary storage");
  assert(!(await exists(resolved)), `refusing to overwrite existing evidence: ${resolved}`);
  await mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp-${process.pid}`;
  await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
  await rename(temporary, resolved);
}

export async function runPhase5BResponsiveAccessibility(options) {
  await access(AXE_PATH);
  const observedHead = await gitHead();
  if (options.expectedHead && observedHead !== options.expectedHead) throw new Error(`HEAD mismatch: expected ${options.expectedHead}, observed ${observedHead}`);
  const executablePath = await resolveBrowser(options.browser);
  const browser = await chromium.launch({ headless: true, executablePath, args: ["--disable-extensions", "--disable-background-networking"] });
  try {
    const responsive = await runResponsiveMatrix(browser, options);
    const variants = [];
    for (const variant of [
      { id: "reduced-motion", reducedMotion: "reduce", viewports: ACCESSIBILITY_VIEWPORTS },
      { id: "no-javascript", javaScriptEnabled: false, viewports: ACCESSIBILITY_VIEWPORTS },
      { id: "fallback-fonts", blockFonts: true, viewports: [TEXT_200_PROXY] },
      { id: "text-200-proxy", viewports: [TEXT_200_PROXY] },
    ]) variants.push({ ...variant, ...(await runStaticVariant(browser, options, variant)) });
    const mobileNavigation = await runMobileNavigation(browser, options);
    const keyboard = await runKeyboard(browser, options);
    const axe = await runAxe(browser, options);
    const recordFailures = [
      ...responsive.flatMap((record) => record.failures),
      ...variants.flatMap((variant) => variant.records.flatMap((record) => record.failures.map((failure) => ({ variant: variant.id, ...failure })))),
      ...mobileNavigation.flatMap((record) => record.failures),
      ...keyboard.flatMap((record) => record.failures),
      ...axe.flatMap((record) => record.failures),
    ];
    const diagnosticFailures = [
      ...diagnosticsFailures("responsive", responsive),
      ...variants.flatMap((variant) => diagnosticsFailures(variant.id, variant.records)),
      ...diagnosticsFailures("mobile-navigation", mobileNavigation),
      ...diagnosticsFailures("keyboard", keyboard),
      ...diagnosticsFailures("axe", axe),
    ];
    const seriousCriticalAxe = axe.reduce((sum, record) => sum + record.violations.filter((violation) => ["serious", "critical"].includes(violation.impact)).length, 0);
    const failures = [...recordFailures, ...diagnosticFailures];
    const report = {
      schema: SCHEMA,
      status: failures.length ? "FAIL" : "PASS",
      generatedAt: new Date().toISOString(),
      git: { branch: "feature/phase-5b-supporting-route-production", head: observedHead },
      browser: { executable: path.basename(executablePath), version: browser.version() },
      baseUrl: options.baseUrl,
      routes: ROUTES,
      viewports: REQUIRED_VIEWPORTS,
      responsive,
      variants: variants.map((variant) => ({ id: variant.id, viewports: variant.viewports, records: variant.records })),
      mobileNavigation,
      keyboard,
      axe,
      failures,
      summary: {
        axeCases: axe.length,
        axeViolations: axe.reduce((sum, record) => sum + record.violations.length, 0),
        failures: failures.length,
        keyboardCases: keyboard.length,
        mobileNavigationCases: mobileNavigation.length,
        responsiveCases: responsive.length,
        seriousCriticalAxe,
        variantCases: variants.reduce((sum, variant) => sum + variant.records.length, 0),
      },
    };
    if (report.status === "PASS") validateReport(report);
    else {
      assert(report.responsive.length === 9 * REQUIRED_VIEWPORTS.length, "responsive matrix is incomplete");
      assert(report.axe.length === 9 * ACCESSIBILITY_VIEWPORTS.length, "axe matrix is incomplete");
      assert(report.keyboard.length === 9 * ACCESSIBILITY_VIEWPORTS.length, "keyboard matrix is incomplete");
    }
    return report;
  } finally {
    await browser.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/qa-phase5b-responsive-accessibility.mjs --base-url <preview> --expected-head <sha> --output <external-json> [--browser <path>]\n");
    return;
  }
  const report = await runPhase5BResponsiveAccessibility(options);
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) await writeFreshExternal(options.output, text);
  process.stdout.write(`${JSON.stringify({ status: report.status, output: options.output || null, summary: report.summary }, null, 2)}\n`);
  if (report.status !== "PASS") throw new Error(`${report.failures.length} responsive/accessibility failures remain; inspect the written report`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => { console.error(`Phase 5B responsive/accessibility QA failed: ${error.message}`); process.exitCode = 1; });
