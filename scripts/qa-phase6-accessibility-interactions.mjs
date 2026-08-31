#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import axeCore from "axe-core";
import { chromium, firefox, webkit } from "playwright-core";

import { PHASE6_ENGINES, PHASE6_ROUTES } from "./phase6-contract.mjs";
import {
  assertExternalOutputPath,
  assertFreshExternalOutput,
  diagnosticFailures,
  expectedHttpStatus,
} from "./qa-phase6-global-hardening.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-6.accessibility-interactions.v1";
export const ACCESSIBILITY_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "desktop-1440x900", width: 1440, height: 900 }),
  Object.freeze({ id: "portrait-390x844", width: 390, height: 844 }),
]);
export const KEYBOARD_VIEWPORT = ACCESSIBILITY_VIEWPORTS[0];
export const MOBILE_VIEWPORT = ACCESSIBILITY_VIEWPORTS[1];
export const MENU_REPEAT_CYCLES = 4;

const BROWSER_TYPES = Object.freeze({ chromium, webkit, firefox });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    axeOnly: false,
    baseUrl: "http://127.0.0.1:4338/",
    engine: "all",
    headed: false,
    help: false,
    output: "",
    selfTest: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--axe-only") {
      options.axeOnly = true;
    } else if (argument === "--base-url") {
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
  if (![...PHASE6_ENGINES, "all"].includes(options.engine)) throw new Error("--engine must be chromium, webkit, firefox or all");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  const baseUrl = new URL(options.baseUrl);
  if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) throw new Error("--base-url must be credential-free HTTP(S)");
  baseUrl.search = "";
  baseUrl.hash = "";
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
  options.baseUrl = baseUrl.toString();
  if (!options.help && !options.selfTest) {
    if (!options.output) throw new Error("--output is required");
    options.output = assertExternalOutputPath(options.output);
  }
  return options;
}

function selectedEngines(engine) {
  return engine === "all" ? [...PHASE6_ENGINES] : [engine];
}

export function expectedAxeCases(engine = "all") {
  return selectedEngines(engine).length * PHASE6_ROUTES.length * ACCESSIBILITY_VIEWPORTS.length;
}

function targetUrl(baseUrl, routePath) {
  return new URL(routePath, baseUrl).toString();
}

async function settle(page, timeoutMs) {
  await page.waitForLoadState("load", { timeout: timeoutMs }).catch(() => undefined);
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded", undefined, { timeout: Math.min(timeoutMs, 2_000) }).catch(() => undefined);
  await page.waitForTimeout(100);
}

function startDiagnostics(page) {
  const report = { consoleErrors: [], consoleWarnings: [], pageErrors: [], requests: [] };
  const byRequest = new Map();
  const handlers = {
    console(message) {
      const record = { location: message.location(), text: message.text() };
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
      const record = byRequest.get(response.request());
      if (record) {
        record.fromServiceWorker = response.fromServiceWorker();
        record.status = response.status();
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

async function openRoute(page, options, route) {
  const response = await page.goto(targetUrl(options.baseUrl, route.path), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  return response?.status() ?? null;
}

export function normalizeAxeViolations(violations) {
  return (violations ?? []).map((violation) => ({
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => ({
      failureSummary: node.failureSummary,
      html: node.html.slice(0, 400),
      selectors: node.target,
    })),
    tags: violation.tags,
  }));
}

export function seriousCriticalAxeFailures(record) {
  return record.violations
    .filter(({ impact }) => impact === "serious" || impact === "critical")
    .map((violation) => ({
      code: "axe-serious-critical",
      help: violation.help,
      id: violation.id,
      impact: violation.impact,
      route: record.route,
      selectors: violation.nodes.flatMap(({ selectors }) => selectors),
      viewport: record.viewport.id,
    }));
}

async function runAxeMatrix(browser, engine, options) {
  const records = [];
  for (const viewport of ACCESSIBILITY_VIEWPORTS) {
    const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block", viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    try {
      for (const route of PHASE6_ROUTES) {
        const collector = startDiagnostics(page);
        let httpStatus = null;
        let violations = [];
        let incompleteCount = 0;
        let thrown = null;
        try {
          httpStatus = await openRoute(page, options, route);
          await page.addScriptTag({ content: axeCore.source });
          const result = await page.evaluate(async () => window.axe.run(document.documentElement, {
            resultTypes: ["violations", "incomplete"],
          }));
          violations = normalizeAxeViolations(result.violations);
          incompleteCount = result.incomplete.length;
        } catch (error) {
          thrown = error instanceof Error ? error.message : String(error);
        }
        const diagnostics = collector.stop();
        const record = { engine, failures: [], httpStatus, incompleteCount, route: route.id, violations, viewport };
        if (thrown) record.failures.push({ code: "axe-case-error", actual: thrown });
        if (!thrown && !expectedHttpStatus(httpStatus, route.expectedStatus)) record.failures.push({ code: "http-status", actual: httpStatus, expected: route.expectedStatus });
        if (violations.length) record.failures.push({ code: "axe-violations", actual: violations.length, expected: 0 });
        record.failures.push(...seriousCriticalAxeFailures(record));
        record.failures.push(...diagnosticFailures(diagnostics, route, options.baseUrl, { allowExpectedMediaAbort: true }));
        record.status = record.failures.length ? "FAIL" : "PASS";
        records.push(record);
      }
    } finally {
      await context.close();
    }
  }
  return records;
}

async function observeFocus(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    const style = element instanceof Element ? getComputedStyle(element) : null;
    const rect = element instanceof Element ? element.getBoundingClientRect() : null;
    let focusVisible = false;
    try { focusVisible = element instanceof Element && element.matches(":focus-visible"); } catch {}
    const classes = element instanceof Element ? [...element.classList].slice(0, 3) : [];
    const selector = element instanceof Element
      ? element.id
        ? `#${element.id}`
        : `${element.localName}${classes.length ? `.${classes.join(".")}` : ""}`
      : null;
    const href = element instanceof Element ? element.getAttribute("href") : null;
    const text = element instanceof Element ? element.textContent?.replace(/\s+/g, " ").trim().slice(0, 100) ?? "" : "";
    return {
      classes,
      focusVisible,
      href,
      key: `${element?.localName ?? "none"}|${href ?? ""}|${text}`,
      outlineStyle: style?.outlineStyle ?? null,
      outlineWidth: style?.outlineWidth ?? null,
      rect: rect ? { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width } : null,
      selector,
      tag: element?.localName ?? null,
      text,
      visible: Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && style?.display !== "none" && style?.visibility !== "hidden"),
    };
  });
}

function visiblyFocused(observation) {
  return observation.focusVisible
    && observation.visible
    && observation.outlineStyle !== "none"
    && Number.parseFloat(observation.outlineWidth ?? "0") >= 2;
}

export function keyboardFailures(record) {
  const failures = [];
  if (!record.first.classes.includes("skip-link") || !visiblyFocused(record.first)) failures.push({ code: "skip-link-focus", actual: record.first });
  if (record.first.href !== record.expectedHash) failures.push({ code: "skip-link-target", actual: record.first.href, expected: record.expectedHash });
  if (record.afterActivation.hash !== record.expectedHash || record.afterActivation.activeId !== record.expectedHash.slice(1) || !record.afterActivation.targetVisible) {
    failures.push({ code: "skip-link-activation", actual: record.afterActivation, expected: record.expectedHash });
  }
  if (!visiblyFocused(record.forwardFirst) || !visiblyFocused(record.forwardSecond)) failures.push({ code: "forward-focus-visibility", actual: [record.forwardFirst, record.forwardSecond] });
  if (!visiblyFocused(record.backward) || record.backward.key !== record.forwardFirst.key) failures.push({ code: "shift-tab-order", actual: record.backward, expected: record.forwardFirst });
  if (record.route === "home") {
    if (!record.forwardFirst.classes.includes("audience-trajectory") || record.forwardFirst.href !== "/for-partners/") {
      failures.push({ code: "home-audience-first", actual: record.forwardFirst, expected: "/for-partners/" });
    }
    if (!record.forwardSecond.classes.includes("audience-trajectory") || record.forwardSecond.href !== "/for-startups/") {
      failures.push({ code: "home-audience-second", actual: record.forwardSecond, expected: "/for-startups/" });
    }
  }
  const desktopHome = record.desktopHome;
  if (desktopHome?.activationError) failures.push({ code: "desktop-home-navigation-wait", actual: desktopHome.activationError });
  if (desktopHome?.backError) failures.push({ code: "desktop-home-back-wait", actual: desktopHome.backError });
  if (desktopHome?.forwardError) failures.push({ code: "desktop-home-forward-wait", actual: desktopHome.forwardError });
  if (!desktopHome || !visiblyFocused(desktopHome.focus) || desktopHome.focus.href !== "/#entry") {
    failures.push({ code: "desktop-home-focus", actual: desktopHome?.focus ?? null, expected: "/#entry" });
  }
  if (!desktopHome?.arrival || desktopHome.arrival.path !== "/" || desktopHome.arrival.hash !== "#entry"
    || desktopHome.arrival.entryInert !== false || desktopHome.arrival.manifestoReveal !== "resolved") {
    failures.push({ code: "desktop-home-arrival", actual: desktopHome?.arrival ?? null });
  }
  if (!desktopHome?.back || desktopHome.back.route !== record.routePath || desktopHome.back.hash !== "") {
    failures.push({ code: "desktop-home-back", actual: desktopHome?.back ?? null, expected: record.routePath });
  }
  if (!desktopHome?.forward || desktopHome.forward.path !== "/" || desktopHome.forward.hash !== "#entry") {
    failures.push({ code: "desktop-home-forward", actual: desktopHome?.forward ?? null });
  }
  return failures;
}

async function observeDesktopHomeState(page) {
  return page.evaluate(() => {
    const entry = document.querySelector("#entry");
    const shell = document.querySelector("[data-cinematic-shell]");
    return {
      entryInert: entry?.hasAttribute("inert") ?? null,
      hash: location.hash,
      manifestoReveal: shell?.getAttribute("data-manifesto-reveal") ?? null,
      path: location.pathname,
      route: `${location.pathname}${location.hash}`,
    };
  });
}

async function observeDesktopHomeNavigation(page, options, route) {
  await openRoute(page, options, route);
  const focus = await focusByTab(page, ".site-header .brand-link[href='/#entry']", 40);
  let arrival = await observeDesktopHomeState(page);
  let back = null;
  let forward = null;
  let activationError = null;
  let backError = null;
  let forwardError = null;
  if (focus.href === "/#entry") {
    try {
      await Promise.all([
        page.waitForURL((url) => url.pathname === "/" && url.hash === "#entry", { timeout: options.timeoutMs, waitUntil: "commit" }),
        page.keyboard.press("Enter"),
      ]);
    } catch (error) {
      activationError = error instanceof Error ? error.message : String(error);
    }
    await settle(page, options.timeoutMs).catch(() => undefined);
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: Math.min(options.timeoutMs, 5_000) }).catch(() => undefined);
    arrival = await observeDesktopHomeState(page);
    if (arrival.path === "/" && arrival.hash === "#entry") {
      try {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
        await settle(page, options.timeoutMs);
        back = await observeDesktopHomeState(page);
      } catch (error) {
        backError = error instanceof Error ? error.message : String(error);
      }
      if (back) {
        try {
          await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
          await settle(page, options.timeoutMs);
          forward = await observeDesktopHomeState(page);
        } catch (error) {
          forwardError = error instanceof Error ? error.message : String(error);
        }
      }
    }
  }
  return { activationError, arrival, back, backError, focus, forward, forwardError };
}

async function observeSkipActivation(page, expectedHash) {
  return page.evaluate((hash) => {
    const target = document.querySelector(hash);
    const rect = target?.getBoundingClientRect();
    return {
      activeId: document.activeElement?.id ?? null,
      hash: location.hash,
      targetVisible: Boolean(rect && rect.bottom > 0 && rect.top < innerHeight),
    };
  }, expectedHash);
}

async function runKeyboardChecks(browser, engine, options) {
  const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block", viewport: { width: KEYBOARD_VIEWPORT.width, height: KEYBOARD_VIEWPORT.height } });
  const page = await context.newPage();
  const records = [];
  try {
    for (const route of PHASE6_ROUTES) {
      await openRoute(page, options, route);
      const expectedHash = route.id === "home" ? "#entry" : "#main-content";
      await page.keyboard.press("Tab");
      await page.waitForTimeout(180);
      const first = await observeFocus(page);
      if (first.href === expectedHash) {
        await page.keyboard.press("Enter");
        await page.waitForFunction((hash) => location.hash === hash, expectedHash, { timeout: Math.min(options.timeoutMs, 5_000) }).catch(() => undefined);
        await page.waitForTimeout(100);
      }
      const afterActivation = await observeSkipActivation(page, expectedHash);
      await page.keyboard.press("Tab");
      await page.waitForTimeout(80);
      const forwardFirst = await observeFocus(page);
      await page.keyboard.press("Tab");
      await page.waitForTimeout(80);
      const forwardSecond = await observeFocus(page);
      await page.keyboard.press("Shift+Tab");
      await page.waitForTimeout(80);
      const backward = await observeFocus(page);
      const desktopHome = await observeDesktopHomeNavigation(page, options, route);
      const record = { afterActivation, backward, desktopHome, engine, expectedHash, first, forwardFirst, forwardSecond, route: route.id, routePath: route.path };
      record.failures = keyboardFailures(record);
      record.status = record.failures.length ? "FAIL" : "PASS";
      records.push(record);
    }
  } finally {
    await context.close();
  }
  return records;
}

async function focusByTab(page, selector, limit = 10) {
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    if (await page.locator(selector).evaluate((element) => element === document.activeElement).catch(() => false)) return observeFocus(page);
  }
  return observeFocus(page);
}

async function observeMenu(page) {
  return page.evaluate(() => {
    const menu = document.querySelector("[data-mobile-nav]");
    const trigger = menu?.querySelector("summary");
    return {
      activeIsTrigger: document.activeElement === trigger,
      ariaExpanded: trigger?.getAttribute("aria-expanded") ?? null,
      open: menu?.hasAttribute("open") ?? false,
      path: location.pathname,
      hash: location.hash,
    };
  });
}

async function waitForMenu(page, open, timeoutMs) {
  await page.waitForFunction((expected) => {
    const menu = document.querySelector("[data-mobile-nav]");
    const trigger = menu?.querySelector("summary");
    return Boolean(menu?.hasAttribute("open")) === expected && trigger?.getAttribute("aria-expanded") === String(expected);
  }, open, { timeout: Math.min(timeoutMs, 3_000) });
  return observeMenu(page);
}

export function mobileMenuFailures(record) {
  const failures = [];
  if (!visiblyFocused(record.triggerFocus)) failures.push({ code: "mobile-menu-trigger-focus", actual: record.triggerFocus });
  if (!record.ordinaryOpen.open || record.ordinaryOpen.ariaExpanded !== "true") failures.push({ code: "mobile-menu-open", actual: record.ordinaryOpen });
  if (record.ordinaryClose.open || record.ordinaryClose.ariaExpanded !== "false" || !record.ordinaryClose.activeIsTrigger) failures.push({ code: "mobile-menu-close", actual: record.ordinaryClose });
  if (!visiblyFocused(record.firstMenuLink)) failures.push({ code: "mobile-menu-link-focus", actual: record.firstMenuLink });
  if (record.escapeClose.open || record.escapeClose.ariaExpanded !== "false" || !record.escapeClose.activeIsTrigger) failures.push({ code: "mobile-menu-escape-focus-return", actual: record.escapeClose });
  for (const [index, cycle] of record.cycles.entries()) {
    if (!cycle.open.open || cycle.open.ariaExpanded !== "true" || cycle.close.open || cycle.close.ariaExpanded !== "false" || !cycle.close.activeIsTrigger) {
      failures.push({ code: "mobile-menu-repeat-cycle", cycle: index + 1, actual: cycle });
    }
  }
  if (!visiblyFocused(record.navigation.focus) || record.navigation.focus.href !== "/#entry") {
    failures.push({ code: "mobile-menu-navigation-focus", actual: record.navigation.focus, expected: "/#entry" });
  }
  if (record.navigation.activationError) failures.push({ code: "mobile-menu-navigation-wait", actual: record.navigation.activationError });
  if (record.navigation.backError) failures.push({ code: "mobile-menu-history-wait", actual: record.navigation.backError });
  if (record.navigation.arrival.path !== "/" || record.navigation.arrival.hash !== "#entry") failures.push({ code: "mobile-menu-navigation", actual: record.navigation.arrival });
  if (!record.navigation.back || record.navigation.back.path !== "/about/" || record.navigation.back.open || record.navigation.back.ariaExpanded !== "false") {
    failures.push({ code: "mobile-menu-history-return", actual: record.navigation.back });
  }
  return failures;
}

async function runMobileMenuChecks(browser, engine, options) {
  const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block", viewport: { width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height } });
  const page = await context.newPage();
  try {
    await page.goto(targetUrl(options.baseUrl, "/about/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    const triggerFocus = await focusByTab(page, "[data-mobile-nav] summary");
    await page.keyboard.press("Enter");
    const ordinaryOpen = await waitForMenu(page, true, options.timeoutMs);
    await page.keyboard.press("Enter");
    const ordinaryClose = await waitForMenu(page, false, options.timeoutMs);

    await page.keyboard.press("Enter");
    await waitForMenu(page, true, options.timeoutMs);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(80);
    const firstMenuLink = await observeFocus(page);
    await page.keyboard.press("Escape");
    const escapeClose = await waitForMenu(page, false, options.timeoutMs);

    const cycles = [];
    for (let index = 0; index < MENU_REPEAT_CYCLES; index += 1) {
      await page.keyboard.press("Enter");
      const open = await waitForMenu(page, true, options.timeoutMs);
      await page.keyboard.press("Escape");
      const close = await waitForMenu(page, false, options.timeoutMs);
      cycles.push({ close, open });
    }

    await page.keyboard.press("Enter");
    await waitForMenu(page, true, options.timeoutMs);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(80);
    const navigationFocus = await observeFocus(page);
    let arrival = await observeMenu(page);
    let back = null;
    let activationError = null;
    let backError = null;
    if (navigationFocus.href === "/#entry") {
      try {
        await Promise.all([
          page.waitForURL((url) => url.pathname === "/" && url.hash === "#entry", { timeout: options.timeoutMs, waitUntil: "commit" }),
          page.keyboard.press("Enter"),
        ]);
      } catch (error) {
        activationError = error instanceof Error ? error.message : String(error);
      }
      await settle(page, options.timeoutMs).catch(() => undefined);
      arrival = await observeMenu(page);
      if (arrival.path === "/" && arrival.hash === "#entry") {
        try {
          await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
          await settle(page, options.timeoutMs);
          back = await observeMenu(page);
        } catch (error) {
          backError = error instanceof Error ? error.message : String(error);
        }
      }
    }
    const record = { cycles, engine, escapeClose, firstMenuLink, navigation: { activationError, arrival, back, backError, focus: navigationFocus }, ordinaryClose, ordinaryOpen, triggerFocus };
    record.failures = mobileMenuFailures(record);
    record.status = record.failures.length ? "FAIL" : "PASS";
    return record;
  } finally {
    await context.close();
  }
}

async function observeHistory(page) {
  return page.evaluate(() => {
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    const entryRect = entry?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    return {
      entryAlignmentDelta: entryRect && headerRect ? entryRect.top - Math.max(0, headerRect.bottom) : null,
      hash: location.hash,
      path: location.pathname,
      scrollY: Math.round(scrollY),
    };
  });
}

async function waitForEntry(page, timeoutMs) {
  await page.waitForFunction(() => {
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    if (!entry || !header || location.hash !== "#entry") return false;
    return Math.abs(entry.getBoundingClientRect().top - Math.max(0, header.getBoundingClientRect().bottom)) <= 12;
  }, undefined, { timeout: Math.min(timeoutMs, 5_000) }).catch(() => undefined);
  await page.waitForTimeout(80);
}

export function historyFailures(record) {
  const failures = [];
  if (record.bare.path !== "/" || record.bare.hash !== "" || record.bare.scrollY > 2) failures.push({ code: "same-document-bare", actual: record.bare });
  if (record.entry.path !== "/" || record.entry.hash !== "#entry" || record.entry.scrollY <= 0 || Math.abs(record.entry.entryAlignmentDelta ?? Infinity) > 12) failures.push({ code: "same-document-entry", actual: record.entry });
  if (record.back.path !== "/" || record.back.hash !== "") failures.push({ code: "same-document-back", actual: record.back });
  if (record.forward.path !== "/" || record.forward.hash !== "#entry") failures.push({ code: "same-document-forward", actual: record.forward });
  return failures;
}

async function runHistoryChecks(browser, engine, options) {
  const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block", viewport: { width: KEYBOARD_VIEWPORT.width, height: KEYBOARD_VIEWPORT.height } });
  const page = await context.newPage();
  try {
    await page.goto(targetUrl(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    const bare = await observeHistory(page);
    await page.goto(targetUrl(options.baseUrl, "/#entry"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await waitForEntry(page, options.timeoutMs);
    const entry = await observeHistory(page);
    await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForTimeout(100);
    const back = await observeHistory(page);
    await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await waitForEntry(page, options.timeoutMs);
    const forward = await observeHistory(page);
    const record = { back, bare, engine, entry, forward };
    record.failures = historyFailures(record);
    record.status = record.failures.length ? "FAIL" : "PASS";
    return record;
  } finally {
    await context.close();
  }
}

async function resolveBrowser(engine) {
  const browserType = BROWSER_TYPES[engine];
  const executablePath = browserType.executablePath();
  try {
    await import("node:fs/promises").then(({ access }) => access(executablePath));
  } catch {
    throw new Error(`Managed ${engine} is unavailable. Install it with: node .\\node_modules\\playwright-core\\cli.js install ${engine}`);
  }
  return { browserType, executablePath };
}

async function runEngine(engine, options) {
  const { browserType, executablePath } = await resolveBrowser(engine);
  const browser = await browserType.launch({ executablePath, headless: !options.headed });
  try {
    const axe = await runAxeMatrix(browser, engine, options);
    const keyboard = options.axeOnly ? [] : await runKeyboardChecks(browser, engine, options);
    const mobileMenu = options.axeOnly ? null : await runMobileMenuChecks(browser, engine, options);
    const history = options.axeOnly ? null : await runHistoryChecks(browser, engine, options);
    const failures = [
      ...axe.flatMap((record) => record.failures.map((failure) => ({ section: "axe", route: record.route, viewport: record.viewport.id, ...failure }))),
      ...keyboard.flatMap((record) => record.failures.map((failure) => ({ section: "keyboard", route: record.route, ...failure }))),
      ...(mobileMenu?.failures ?? []).map((failure) => ({ section: "mobile-menu", ...failure })),
      ...(history?.failures ?? []).map((failure) => ({ section: "history", ...failure })),
    ];
    return {
      axe,
      browser: { engine, executable: path.basename(executablePath), headed: options.headed, version: browser.version() },
      engine,
      failures,
      history,
      keyboard,
      mobileMenu,
      status: failures.length ? "FAIL" : "PASS",
      summary: {
        axeCases: axe.length,
        axeViolations: axe.reduce((sum, record) => sum + record.violations.length, 0),
        failures: failures.length,
        keyboardCases: keyboard.length,
        seriousCritical: axe.reduce((sum, record) => sum + record.violations.filter(({ impact }) => impact === "serious" || impact === "critical").length, 0),
      },
    };
  } finally {
    await browser.close();
  }
}

export function validateReport(report) {
  assert(report.schema === SCHEMA, "accessibility report schema differs");
  const expectedRoutes = PHASE6_ROUTES.map(({ expectedStatus, id, path: routePath }) => ({ expectedStatus, id, path: routePath }));
  assert(sameJson(report.routes, expectedRoutes), "accessibility report route inventory differs");
  assert(sameJson(report.viewports, ACCESSIBILITY_VIEWPORTS), "accessibility report viewport inventory differs");
  assert(sameJson(report.selectedEngines, selectedEngines(report.engine)), "accessibility selected-engine inventory differs");
  assert(report.engines.length === report.selectedEngines.length, "accessibility engine inventory is incomplete");
  assert(sameJson(report.engines.map(({ engine }) => engine), report.selectedEngines), "accessibility engine result inventory differs");
  const topFailures = [];
  for (const result of report.engines) {
    assert(report.selectedEngines.includes(result.engine), `${result.engine} is not a selected accessibility engine`);
    if (result.status === "ERROR") {
      assert(typeof result.failure === "string" && result.failure.length > 0, `${result.engine} engine error is incomplete`);
      topFailures.push({ actual: result.failure, code: "engine-error", engine: result.engine, section: "engine" });
      continue;
    }
    assert(Array.isArray(result.axe) && result.axe.length === PHASE6_ROUTES.length * ACCESSIBILITY_VIEWPORTS.length, `${result.engine} axe matrix is incomplete`);
    const axeKeys = new Set();
    for (const record of result.axe) {
      const route = PHASE6_ROUTES.find(({ id }) => id === record?.route);
      const viewport = ACCESSIBILITY_VIEWPORTS.find(({ id }) => id === record?.viewport?.id);
      assert(route && viewport && sameJson(record.viewport, viewport), `${result.engine} axe row route/viewport differs`);
      const key = `${record.route}\u0000${record.viewport.id}`;
      assert(!axeKeys.has(key), `${result.engine} axe row is duplicated`);
      axeKeys.add(key);
      assert(record.engine === result.engine
        && Array.isArray(record.violations)
        && Array.isArray(record.failures)
        && Number.isSafeInteger(record.incompleteCount) && record.incompleteCount >= 0
        && expectedHttpStatus(record.httpStatus, route.expectedStatus), `${result.engine} axe raw row differs`);
      const expectedStatus = record.failures.length ? "FAIL" : "PASS";
      assert(record.status === expectedStatus, `${result.engine} axe row status differs`);
      if (record.status === "PASS") assert(record.violations.length === 0, `${result.engine} PASS axe row contains violations`);
    }
    const derivedEngineFailures = [
      ...result.axe.flatMap((record) => record.failures.map((failure) => ({ section: "axe", route: record.route, viewport: record.viewport.id, ...failure }))),
    ];
    if (!report.axeOnly) {
      assert(result.keyboard.length === PHASE6_ROUTES.length, `${result.engine} keyboard matrix is incomplete`);
      const keyboardRoutes = new Set();
      for (const record of result.keyboard) {
        const route = PHASE6_ROUTES.find(({ id }) => id === record?.route);
        assert(route && record.engine === result.engine && record.routePath === route.path && !keyboardRoutes.has(record.route), `${result.engine} keyboard route row differs`);
        keyboardRoutes.add(record.route);
        const failures = keyboardFailures(record);
        assert(sameJson(record.failures, failures) && record.status === (failures.length ? "FAIL" : "PASS"), `${result.engine} keyboard raw row/status differs`);
      }
      assert(result.mobileMenu && Array.isArray(result.mobileMenu.cycles) && result.mobileMenu.cycles.length === MENU_REPEAT_CYCLES, `${result.engine} mobile-menu cycles are incomplete`);
      const menuFailures = mobileMenuFailures(result.mobileMenu);
      assert(sameJson(result.mobileMenu.failures, menuFailures)
        && result.mobileMenu.status === (menuFailures.length ? "FAIL" : "PASS"), `${result.engine} mobile-menu raw evidence differs`);
      assert(result.history, `${result.engine} history evidence is absent`);
      const derivedHistoryFailures = historyFailures(result.history);
      assert(sameJson(result.history.failures, derivedHistoryFailures)
        && result.history.status === (derivedHistoryFailures.length ? "FAIL" : "PASS"), `${result.engine} history raw evidence differs`);
      derivedEngineFailures.push(
        ...result.keyboard.flatMap((record) => record.failures.map((failure) => ({ section: "keyboard", route: record.route, ...failure }))),
        ...result.mobileMenu.failures.map((failure) => ({ section: "mobile-menu", ...failure })),
        ...result.history.failures.map((failure) => ({ section: "history", ...failure })),
      );
    } else {
      assert(Array.isArray(result.keyboard) && result.keyboard.length === 0 && result.mobileMenu === null && result.history === null, `${result.engine} axe-only interaction evidence differs`);
    }
    assert(sameJson(result.failures, derivedEngineFailures), `${result.engine} failure ledger differs`);
    assert(result.status === (derivedEngineFailures.length ? "FAIL" : "PASS"), `${result.engine} status differs`);
    const expectedEngineSummary = {
      axeCases: result.axe.length,
      axeViolations: result.axe.reduce((sum, record) => sum + record.violations.length, 0),
      failures: derivedEngineFailures.length,
      keyboardCases: result.keyboard.length,
      seriousCritical: result.axe.reduce((sum, record) => sum + record.violations.filter(({ impact }) => impact === "serious" || impact === "critical").length, 0),
    };
    assert(sameJson(result.summary, expectedEngineSummary), `${result.engine} summary differs`);
    topFailures.push(...derivedEngineFailures.map((failure) => ({ engine: result.engine, ...failure })));
  }
  assert(sameJson(report.failures, topFailures), "accessibility top-level failure ledger differs");
  const expectedSummary = {
    axeCases: report.engines.reduce((sum, result) => sum + (result.axe?.length ?? 0), 0),
    axeExpected: expectedAxeCases(report.engine),
    axeViolations: report.engines.reduce((sum, result) => sum + (result.summary?.axeViolations ?? 0), 0),
    engineErrors: report.engines.filter(({ status }) => status === "ERROR").length,
    failures: topFailures.length,
    seriousCritical: report.engines.reduce((sum, result) => sum + (result.summary?.seriousCritical ?? 0), 0),
  };
  assert(sameJson(report.summary, expectedSummary), "accessibility top-level summary differs");
  assert(report.status === (topFailures.length ? "FAIL" : "PASS"), "accessibility top-level status differs");
  if (report.status === "PASS") {
    assert(report.failures.length === 0, "PASS report contains failures");
    assert(report.summary.seriousCritical === 0, "PASS report contains serious/critical axe violations");
  }
  return true;
}

export async function runPhase6AccessibilityInteractions(options) {
  const response = await fetch(options.baseUrl, { redirect: "manual" });
  if (response.status < 200 || response.status >= 400) throw new Error(`base URL returned HTTP ${response.status}: ${options.baseUrl}`);
  const engines = [];
  for (const engine of selectedEngines(options.engine)) {
    try {
      engines.push(await runEngine(engine, options));
    } catch (error) {
      engines.push({ engine, failure: error instanceof Error ? error.message : String(error), status: "ERROR" });
    }
  }
  const failures = engines.flatMap((result) => result.status === "ERROR"
    ? [{ actual: result.failure, code: "engine-error", engine: result.engine, section: "engine" }]
    : result.failures.map((failure) => ({ engine: result.engine, ...failure })));
  const report = {
    axeOnly: options.axeOnly,
    baseUrl: options.baseUrl,
    engine: options.engine,
    engines,
    failures,
    generatedAt: new Date().toISOString(),
    headed: options.headed,
    routes: PHASE6_ROUTES.map(({ expectedStatus, id, path: routePath }) => ({ expectedStatus, id, path: routePath })),
    schema: SCHEMA,
    selectedEngines: selectedEngines(options.engine),
    status: failures.length ? "FAIL" : "PASS",
    summary: {
      axeCases: engines.reduce((sum, result) => sum + (result.axe?.length ?? 0), 0),
      axeExpected: expectedAxeCases(options.engine),
      axeViolations: engines.reduce((sum, result) => sum + (result.summary?.axeViolations ?? 0), 0),
      engineErrors: engines.filter(({ status }) => status === "ERROR").length,
      failures: failures.length,
      seriousCritical: engines.reduce((sum, result) => sum + (result.summary?.seriousCritical ?? 0), 0),
    },
    viewports: ACCESSIBILITY_VIEWPORTS,
  };
  validateReport(report);
  return report;
}

async function writeFreshExternal(filePath, report) {
  const resolved = await assertFreshExternalOutput(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

export function runSelfTest() {
  assert(PHASE6_ROUTES.length === 10, "self-test route count differs");
  assert(ACCESSIBILITY_VIEWPORTS.length === 2, "self-test viewport count differs");
  assert(expectedAxeCases("all") === 60, "self-test all-engine axe count differs");
  assert(MENU_REPEAT_CYCLES >= 3, "self-test menu repetition is insufficient");
  assertExternalOutputPath(path.resolve(ROOT, "..", "phase-6-work", "accessibility-self-test.json"));
  return { axeCases: 60, engines: 3, menuCycles: MENU_REPEAT_CYCLES, routes: 10, schema: SCHEMA, status: "PASS", viewports: 2 };
}

function usage() {
  return [
    "Usage: node scripts/qa-phase6-accessibility-interactions.mjs --base-url <preview> --output <fresh-external.json> [--engine chromium|webkit|firefox|all] [--axe-only] [--headed] [--timeout-ms 30000]",
    "       node scripts/qa-phase6-accessibility-interactions.mjs --self-test",
    "",
    "Firefox may require --headed on this Windows host. The default --engine all contract contains 60 axe cases.",
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
  const report = await runPhase6AccessibilityInteractions(options);
  await writeFreshExternal(options.output, report);
  process.stdout.write(`${JSON.stringify({ output: options.output, status: report.status, summary: report.summary }, null, 2)}\n`);
  if (report.status !== "PASS") throw new Error(`${report.failures.length} Phase 6 accessibility/interaction failures remain`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 6 accessibility/interaction QA failed: ${error.message}`);
  process.exitCode = 1;
});
