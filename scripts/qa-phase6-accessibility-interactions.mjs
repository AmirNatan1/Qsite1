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
const VISIBLE_OUTLINE_STYLES = new Set(["auto", "dashed", "dotted", "double", "groove", "inset", "outset", "ridge", "solid"]);
const EXPECTED_OUTLINE_COLOR = "rgb(240, 107, 160)";
const EXPECTED_BROWSER_EXECUTABLES = Object.freeze({ chromium: "chrome.exe", firefox: "firefox.exe", webkit: "Playwright.exe" });
const BROWSER_VERSION_PATTERN = /^\d+(?:\.\d+){1,3}$/;

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
      const record = { documentUrl: page.url(), location: message.location(), text: message.text() };
      if (message.type() === "error") report.consoleErrors.push(record);
      else if (message.type() === "warning") report.consoleWarnings.push(record);
    },
    pageerror(error) {
      report.pageErrors.push({ message: error.message, name: error.name });
    },
    request(request) {
      let documentUrl = null;
      let isMainFrame = false;
      try {
        const frame = request.frame();
        documentUrl = frame.url() || null;
        isMainFrame = frame === page.mainFrame();
      } catch {}
      const record = {
        documentUrl,
        failure: null,
        isMainFrame,
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

function canonicalDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics)
    || !sameJson(Object.keys(diagnostics).sort(), ["consoleErrors", "consoleWarnings", "pageErrors", "requests"])) return false;
  const consoleRecord = (record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)
      || !sameJson(Object.keys(record).sort(), ["documentUrl", "location", "text"])
      || typeof record.documentUrl !== "string" || typeof record.text !== "string"
      || !record.location || typeof record.location !== "object" || Array.isArray(record.location)) return false;
    try { new URL(record.documentUrl); } catch { return false; }
    return true;
  };
  const pageError = (record) => record && typeof record === "object" && !Array.isArray(record)
    && typeof record.message === "string" && typeof record.name === "string";
  const requestRecord = (record) => {
    const expectedKeys = ["documentUrl", "failure", "isMainFrame", "isNavigation", "method", "resourceType", "status", "url"];
    if (Object.hasOwn(record ?? {}, "fromServiceWorker")) expectedKeys.push("fromServiceWorker");
    if (!record || typeof record !== "object" || Array.isArray(record)
      || !sameJson(Object.keys(record).sort(), expectedKeys.sort())
      || !(record.documentUrl === null || typeof record.documentUrl === "string")
      || typeof record.isMainFrame !== "boolean"
      || typeof record.isNavigation !== "boolean" || typeof record.method !== "string" || !/^[A-Z]+$/.test(record.method)
      || typeof record.resourceType !== "string" || !record.resourceType
      || !(record.failure === null || (typeof record.failure === "string" && record.failure.length > 0))
      || !(record.status === null || (Number.isSafeInteger(record.status) && record.status >= 100 && record.status <= 599))
      || !(record.fromServiceWorker === undefined || typeof record.fromServiceWorker === "boolean")
      || typeof record.url !== "string") return false;
    try {
      new URL(record.url);
      if (record.documentUrl !== null) new URL(record.documentUrl);
    } catch { return false; }
    return true;
  };
  return Array.isArray(diagnostics.consoleErrors) && diagnostics.consoleErrors.every(consoleRecord)
    && Array.isArray(diagnostics.consoleWarnings) && diagnostics.consoleWarnings.every(consoleRecord)
    && Array.isArray(diagnostics.pageErrors) && diagnostics.pageErrors.every(pageError)
    && Array.isArray(diagnostics.requests) && diagnostics.requests.every(requestRecord);
}

function interactionDiagnosticFailures(diagnostics, route, baseUrl, { allowHomeTransitions = false } = {}) {
  if (!canonicalDiagnostics(diagnostics)) return [{ code: "diagnostics-incomplete", actual: diagnostics ?? null }];
  try {
    const failures = [];
    const expectedRouteUrl = new URL(route.path, baseUrl);
    const expectedOrigin = expectedRouteUrl.origin;
    let coveredInitialNavigation = false;
    let coveredHomeNavigation = !allowHomeTransitions || expectedRouteUrl.pathname === "/";
    for (const actual of diagnostics.consoleErrors) {
      const documentUrl = new URL(actual.documentUrl);
      let locationUrl = null;
      try { locationUrl = new URL(actual.location.url); } catch {}
      const expected404 = route.expectedStatus === 404
        && documentUrl.origin === expectedOrigin
        && locationUrl?.origin === expectedOrigin && locationUrl.pathname === expectedRouteUrl.pathname && locationUrl.search === expectedRouteUrl.search
        && /failed to load resource.*404|status of 404/i.test(actual.text);
      if (!expected404) failures.push({ code: "console-error", actual });
    }
    for (const actual of diagnostics.consoleWarnings) failures.push({ code: "console-warning", actual });
    for (const actual of diagnostics.pageErrors) failures.push({ code: "page-error", actual });
    for (const request of diagnostics.requests) {
      const url = new URL(request.url);
      const hasStatus = request.status !== null;
      const hasFailure = request.failure !== null;
      if (request.method !== "GET") failures.push({ code: "diagnostic-method", actual: request });
      if (!hasStatus && !hasFailure) failures.push({ code: "diagnostic-request-terminal", actual: request });
      if (hasStatus && request.fromServiceWorker !== false) failures.push({ code: "diagnostic-service-worker", actual: request });
      if (!hasStatus && hasFailure && Object.hasOwn(request, "fromServiceWorker")) failures.push({ code: "diagnostic-failed-request-service-worker", actual: request });
      if (["blob:", "http:", "https:"].includes(url.protocol) && url.origin !== expectedOrigin) failures.push({ code: "cross-origin-request", actual: request });
      const exactInitialNavigation = request.isNavigation && request.isMainFrame && request.resourceType === "document" && request.method === "GET"
        && url.origin === expectedRouteUrl.origin && url.pathname === expectedRouteUrl.pathname && url.search === expectedRouteUrl.search
        && hasStatus && expectedHttpStatus(request.status, route.expectedStatus);
      if (exactInitialNavigation) coveredInitialNavigation = true;
      const exactHomeNavigation = request.isNavigation && request.isMainFrame && request.resourceType === "document" && request.method === "GET"
        && url.origin === expectedRouteUrl.origin && url.pathname === "/" && url.search === ""
        && hasStatus && expectedHttpStatus(request.status, 200);
      if (exactHomeNavigation) coveredHomeNavigation = true;
      const expectedIntentional404 = route.expectedStatus === 404 && exactInitialNavigation && request.status === 404;
      if (hasStatus && request.status >= 400 && !expectedIntentional404) failures.push({ code: "http-error", actual: request });
      if (hasFailure) {
        let documentUrl = null;
        try { documentUrl = request.documentUrl ? new URL(request.documentUrl) : null; } catch {}
        const documentBoundHome = request.isMainFrame && documentUrl?.origin === expectedOrigin && documentUrl.pathname === "/"
          && documentUrl.search === "" && ["", "#entry"].includes(documentUrl.hash);
        const expectedHomeContext = documentBoundHome && (route.id === "home" || allowHomeTransitions);
        const expectedHomeBlobAbort = expectedHomeContext && url.protocol === "blob:" && url.origin === expectedOrigin;
        const expectedMaradinDocument = request.isMainFrame && documentUrl?.origin === expectedOrigin && documentUrl.pathname === "/pocs/maradin/"
          && documentUrl.search === "" && documentUrl.hash === "";
        const expectedMaradinReleaseAbort = route.id === "maradin" && expectedMaradinDocument && url.origin === expectedOrigin && [
          "/media/maradin/maradin-field-aperture-approved.mp4",
          "/media/maradin/maradin-test-contact-approved.mp4",
        ].includes(url.pathname);
        const expectedHomePosterCancellation = expectedHomeContext
          && request.resourceType === "image" && url.origin === expectedOrigin
          && /^\/media\/cinematic\/phase-4r2\/posters\/phase-4r2-(?:desktop|portrait|landscape)-poster-[a-f0-9]+\.png$/i.test(url.pathname)
          && /NS_BINDING_ABORTED/i.test(request.failure);
        const expectedMediaAbort = ["media", "other"].includes(request.resourceType)
          && (expectedHomeBlobAbort || expectedMaradinReleaseAbort)
          && /aborted|cancelled|canceled|NS_ERROR_PARSED_DATA_CACHED/i.test(request.failure);
        if (!(expectedMediaAbort || expectedHomePosterCancellation)) failures.push({ code: "request-failure", actual: request });
      }
    }
    if (!coveredInitialNavigation) {
      failures.push({ code: "diagnostic-navigation-coverage", actual: diagnostics.requests, expected: { method: "GET", path: route.path, status: route.expectedStatus } });
    }
    if (!coveredHomeNavigation) {
      failures.push({ code: "diagnostic-home-navigation-coverage", actual: diagnostics.requests, expected: { method: "GET", path: "/", status: 200 } });
    }
    return failures;
  } catch (error) {
    return [{ code: "diagnostics-invalid", actual: error instanceof Error ? error.message : String(error) }];
  }
}

async function openRoute(page, options, route) {
  const response = await page.goto(targetUrl(options.baseUrl, route.path), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  return response?.status() ?? null;
}

async function waitForInteractionReady(page, route, timeoutMs) {
  if (route.id !== "home") return true;
  return page.waitForFunction(() => (
    document.documentElement.dataset.cinematicMode === "enhanced"
    && window.quantumPhase4?.mode === "enhanced"
    && document.querySelector('.skip-link[href="#entry"]') instanceof HTMLAnchorElement
    && document.querySelector('#entry[tabindex="-1"]') instanceof HTMLElement
  ), undefined, { polling: 50, timeout: Math.min(timeoutMs, 5_000) }).then(() => true, () => false);
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
        const record = { caseError: thrown, diagnostics, engine, failures: [], httpStatus, incompleteCount, route: route.id, violations, viewport };
        if (thrown) record.failures.push({ code: "axe-case-error", actual: thrown });
        if (!thrown && !expectedHttpStatus(httpStatus, route.expectedStatus)) record.failures.push({ code: "http-status", actual: httpStatus, expected: route.expectedStatus });
        if (violations.length) record.failures.push({ code: "axe-violations", actual: violations.length, expected: 0 });
        record.failures.push(...seriousCriticalAxeFailures(record));
        record.failures.push(...interactionDiagnosticFailures(diagnostics, route, options.baseUrl));
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
    const visibilityChain = [];
    for (let current = element; current instanceof Element; current = current.parentElement) {
      const currentStyle = getComputedStyle(current);
      visibilityChain.push({
        ariaHidden: current.getAttribute("aria-hidden"),
        contentVisibility: currentStyle.contentVisibility || "visible",
        display: currentStyle.display,
        hidden: current.hasAttribute("hidden"),
        inert: current.hasAttribute("inert"),
        opacity: Number.parseFloat(currentStyle.opacity),
        tag: current.localName,
        visibility: currentStyle.visibility,
      });
    }
    const renderedVisible = visibilityChain.length > 0 && visibilityChain.every((current) => (
      current.ariaHidden?.toLowerCase() !== "true" && current.contentVisibility !== "hidden" && current.display !== "none"
      && current.hidden === false && current.inert === false && Number.isFinite(current.opacity) && current.opacity > 0.01
      && !["collapse", "hidden"].includes(current.visibility)
    ));
    return {
      ariaLabel: element instanceof Element ? element.getAttribute("aria-label") : null,
      classes,
      focusVisible,
      href,
      key: `${element?.localName ?? "none"}|${href ?? ""}|${text}`,
      outlineColor: style?.outlineColor ?? null,
      outlineStyle: style?.outlineStyle ?? null,
      outlineWidth: style?.outlineWidth ?? null,
      rect: rect ? { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width } : null,
      renderedVisible,
      selector,
      tag: element?.localName ?? null,
      text,
      visible: Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && style?.display !== "none" && style?.visibility !== "hidden"),
      visibilityChain,
      withinMobileNav: element instanceof Element && Boolean(element.closest("[data-mobile-nav]")),
      withinSiteHeader: element instanceof Element && Boolean(element.closest(".site-header")),
    };
  });
}

async function waitForActiveElementFullyVisible(page, timeoutMs) {
  return page.waitForFunction(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0
      && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth
      && style.display !== "none" && style.visibility !== "hidden";
  }, undefined, { polling: 50, timeout: Math.min(timeoutMs, 5_000) }).then(() => true, () => false);
}

function hasConsistentRectGeometry(rect) {
  return rect && [rect.top, rect.left, rect.bottom, rect.right, rect.width, rect.height].every(Number.isFinite)
    && rect.right >= rect.left && rect.bottom >= rect.top
    && Math.abs((rect.right - rect.left) - rect.width) <= 0.5
    && Math.abs((rect.bottom - rect.top) - rect.height) <= 0.5;
}

function visiblyFocused(observation, viewport = KEYBOARD_VIEWPORT) {
  const rect = observation?.rect;
  const classesAreStrings = Array.isArray(observation?.classes) && observation.classes.every((value) => typeof value === "string");
  const hrefIsPrimitive = observation?.href === null || typeof observation?.href === "string";
  const ariaLabelIsPrimitive = observation?.ariaLabel === null || typeof observation?.ariaLabel === "string";
  const identityIsCanonical = typeof observation?.tag === "string" && /^[a-z][a-z0-9-]*$/.test(observation.tag)
    && hrefIsPrimitive && ariaLabelIsPrimitive && typeof observation?.text === "string"
    && typeof observation?.key === "string" && observation.key.length > 0
    && observation.key === `${observation.tag}|${observation.href ?? ""}|${observation.text}`;
  const outlineWidthIsCanonical = typeof observation?.outlineWidth === "string"
    && /^(?:(?:0|[1-9]\d*)(?:\.\d+)?|\.\d+)px$/.test(observation.outlineWidth);
  const outlineWidth = outlineWidthIsCanonical ? Number.parseFloat(observation.outlineWidth) : Number.NaN;
  const fullyContained = hasConsistentRectGeometry(rect)
    && rect.width > 0 && rect.height > 0
    && rect.top >= 0 && rect.left >= 0 && rect.bottom <= viewport.height && rect.right <= viewport.width;
  return observation?.focusVisible === true
    && observation.visible === true
    && renderedVisibilityIsCanonical(observation)
    && classesAreStrings
    && identityIsCanonical
    && fullyContained
    && observation.outlineColor === EXPECTED_OUTLINE_COLOR
    && VISIBLE_OUTLINE_STYLES.has(observation.outlineStyle)
    && Number.isFinite(outlineWidth) && outlineWidth >= 2;
}

function renderedVisibilityChainIsCanonical(chain, expectedTag, observedRenderedVisible) {
  if (!Array.isArray(chain) || chain.length < 2 || chain[0]?.tag !== expectedTag || chain.at(-1)?.tag !== "html") return false;
  const derived = chain.every((current) => current && typeof current === "object" && !Array.isArray(current)
    && typeof current.tag === "string" && /^[a-z][a-z0-9-]*$/.test(current.tag)
    && (current.ariaHidden === null || typeof current.ariaHidden === "string")
    && typeof current.contentVisibility === "string" && current.contentVisibility.length > 0
    && typeof current.display === "string" && current.display.length > 0
    && typeof current.hidden === "boolean" && typeof current.inert === "boolean"
    && Number.isFinite(current.opacity) && typeof current.visibility === "string" && current.visibility.length > 0)
    && chain.every((current) => current.ariaHidden?.trim().toLowerCase() !== "true"
      && current.contentVisibility.toLowerCase() !== "hidden" && current.display.toLowerCase() !== "none"
      && current.hidden === false && current.inert === false && current.opacity > 0.01
      && !["collapse", "hidden"].includes(current.visibility.toLowerCase()));
  return observedRenderedVisible === derived && derived === true;
}

function renderedVisibilityIsCanonical(observation) {
  return renderedVisibilityChainIsCanonical(observation?.visibilityChain, observation?.tag, observation?.renderedVisible);
}

function skipTargetIsVisible(observation, expectedHash, viewport = KEYBOARD_VIEWPORT) {
  const rect = observation?.targetRect;
  const expectedDisplay = expectedHash === "#entry" ? "grid" : "block";
  const expectedTag = expectedHash === "#entry" ? "section" : "main";
  return observation?.targetVisible === true
    && observation.targetTag === expectedTag
    && renderedVisibilityChainIsCanonical(observation.targetVisibilityChain, observation.targetTag, observation.targetRenderedVisible)
    && observation.targetVisibilityChain[0].display === observation.targetDisplay
    && observation.targetVisibilityChain[0].visibility === observation.targetVisibility
    && observation.targetDisplay === expectedDisplay && observation.targetVisibility === "visible"
    && hasConsistentRectGeometry(rect) && rect.width > 0 && rect.height > 0
    && rect.bottom > 0 && rect.right > 0 && rect.top < viewport.height && rect.left < viewport.width;
}

function hasObservedClass(observation, className) {
  return Array.isArray(observation?.classes)
    && observation.classes.every((value) => typeof value === "string")
    && observation.classes.includes(className);
}

const FORWARD_CONTROL_TAGS_BY_ROUTE = new Map([
  ["maradin", ["button", "button"]],
  ["spark", ["summary", "summary"]],
]);

function visiblyFocusedExpectedControl(observation, expectedTag) {
  if (!visiblyFocused(observation) || observation.tag !== expectedTag) return false;
  return observation.tag === "a"
    ? typeof observation.href === "string" && observation.href.length > 0
    : observation.href === null;
}

export function keyboardFailures(record) {
  const failures = [];
  const route = PHASE6_ROUTES.find(({ id }) => id === record.route);
  const expectedHash = route ? (route.id === "home" ? "#entry" : "#main-content") : null;
  const expectedSkipLabel = route?.id === "home" ? "Skip cinematic intro" : "Skip to content";
  if (record.interactionReady !== true) failures.push({ code: "interaction-readiness", actual: record.interactionReady ?? null, expected: true });
  if (record.expectedHash !== expectedHash) failures.push({ code: "skip-link-route-contract", actual: record.expectedHash ?? null, expected: expectedHash });
  if (record.firstVisibilityReady !== true) failures.push({ code: "skip-link-visibility-wait", actual: record.firstVisibilityReady ?? null, expected: true });
  if (record.activationReady !== true) failures.push({ code: "skip-link-activation-wait", actual: record.activationReady ?? null, expected: true });
  if (!hasObservedClass(record.first, "skip-link") || record.first.tag !== "a" || record.first.text !== expectedSkipLabel
    || record.first.ariaLabel !== null || !visiblyFocused(record.first)) failures.push({ code: "skip-link-focus", actual: record.first });
  if (record.first.href !== expectedHash) failures.push({ code: "skip-link-target", actual: record.first.href, expected: expectedHash });
  if (!expectedHash || record.afterActivation.path !== route?.path || record.afterActivation.hash !== expectedHash
    || record.afterActivation.activeId !== expectedHash.slice(1) || !skipTargetIsVisible(record.afterActivation, expectedHash)) {
    failures.push({ code: "skip-link-activation", actual: record.afterActivation, expected: expectedHash });
  }
  const forwardTags = FORWARD_CONTROL_TAGS_BY_ROUTE.get(record.route) ?? ["a", "a"];
  if (!visiblyFocusedExpectedControl(record.forwardFirst, forwardTags[0]) || !visiblyFocusedExpectedControl(record.forwardSecond, forwardTags[1])) failures.push({ code: "forward-focus-visibility", actual: [record.forwardFirst, record.forwardSecond] });
  if (!visiblyFocused(record.backward) || record.backward.key !== record.forwardFirst.key) failures.push({ code: "shift-tab-order", actual: record.backward, expected: record.forwardFirst });
  if (record.route === "home") {
    if (!hasObservedClass(record.forwardFirst, "audience-trajectory") || record.forwardFirst.href !== "/for-partners/") {
      failures.push({ code: "home-audience-first", actual: record.forwardFirst, expected: "/for-partners/" });
    }
    if (!hasObservedClass(record.forwardSecond, "audience-trajectory") || record.forwardSecond.href !== "/for-startups/") {
      failures.push({ code: "home-audience-second", actual: record.forwardSecond, expected: "/for-startups/" });
    }
  }
  const desktopHome = record.desktopHome;
  if (record.route === "home") {
    const preparation = desktopHome?.preparation;
    if (!preparation || preparation.input !== "NATIVE WHEEL" || preparation.ready !== true
      || preparation.resolved !== true || !Number.isInteger(preparation.wheelSteps)
      || preparation.wheelSteps < 1 || preparation.wheelSteps > 24
      || preparation.state?.path !== "/" || preparation.state?.hash !== "" || preparation.state?.route !== "/"
      || preparation.state?.cinematicMode !== "enhanced" || preparation.state?.mediaState !== "ready"
      || preparation.state?.entryInert !== false || preparation.state?.manifestoReveal !== "resolved") {
      failures.push({ code: "desktop-home-preparation", actual: preparation ?? null });
    }
  }
  if (desktopHome?.activationError !== null) failures.push({ code: "desktop-home-navigation-wait", actual: desktopHome?.activationError ?? null });
  if (desktopHome?.arrivalReady !== true) failures.push({ code: "desktop-home-arrival-wait", actual: desktopHome?.arrivalReady ?? null, expected: true });
  if (desktopHome?.backError !== null) failures.push({ code: "desktop-home-back-wait", actual: desktopHome?.backError ?? null });
  if (desktopHome?.forwardError !== null) failures.push({ code: "desktop-home-forward-wait", actual: desktopHome?.forwardError ?? null });
  if (!desktopHome || desktopHome.focus?.tag !== "a" || desktopHome.focus.withinSiteHeader !== true
    || !hasObservedClass(desktopHome.focus, "brand-link") || desktopHome.focus.ariaLabel !== "Quantum home"
    || desktopHome.focus.text !== "" || !visiblyFocused(desktopHome.focus) || desktopHome.focus.href !== "/#entry") {
    failures.push({ code: "desktop-home-focus", actual: desktopHome?.focus ?? null, expected: "/#entry" });
  }
  if (!resolvedHomeState(desktopHome?.arrival, "#entry")) {
    failures.push({ code: "desktop-home-arrival", actual: desktopHome?.arrival ?? null });
  }
  const validBack = record.route === "home"
    ? resolvedHomeState(desktopHome?.back, "")
    : desktopHome?.back?.path === record.routePath && desktopHome.back.hash === "" && desktopHome.back.route === record.routePath
      && desktopHome.back.cinematicMode === null && desktopHome.back.mediaState === null
      && desktopHome.back.entryInert === null && desktopHome.back.manifestoReveal === null;
  if (!validBack) {
    failures.push({ code: "desktop-home-back", actual: desktopHome?.back ?? null, expected: record.routePath });
  }
  if (!resolvedHomeState(desktopHome?.forward, "#entry")) {
    failures.push({ code: "desktop-home-forward", actual: desktopHome?.forward ?? null });
  }
  return failures;
}

function resolvedHomeState(state, hash) {
  return state?.path === "/" && state.hash === hash && state.route === `/${hash}`
    && state.cinematicMode === "enhanced" && state.mediaState === "ready"
    && state.entryInert === false && state.manifestoReveal === "resolved";
}

async function observeDesktopHomeState(page) {
  return page.evaluate(() => {
    const entry = document.querySelector("#entry");
    const shell = document.querySelector("[data-cinematic-shell]");
    return {
      cinematicMode: document.documentElement.dataset.cinematicMode ?? null,
      entryInert: entry?.hasAttribute("inert") ?? null,
      hash: location.hash,
      manifestoReveal: shell?.getAttribute("data-manifesto-reveal") ?? null,
      mediaState: shell?.getAttribute("data-media-state") ?? null,
      path: location.pathname,
      route: `${location.pathname}${location.hash}`,
    };
  });
}

async function waitForResolvedHomeState(page, timeoutMs) {
  await page.waitForFunction(() => {
    const entry = document.querySelector("#entry");
    const shell = document.querySelector("[data-cinematic-shell]");
    return location.pathname === "/" && location.hash === "#entry"
      && document.documentElement.dataset.cinematicMode === "enhanced"
      && shell?.getAttribute("data-media-state") === "ready"
      && shell.getAttribute("data-manifesto-reveal") === "resolved"
      && !entry?.hasAttribute("inert");
  }, undefined, { timeout: Math.min(timeoutMs, 6_000) });
}

async function prepareHomeHeaderNavigation(page, options) {
  const ready = await page.waitForFunction(() => (
    document.documentElement.dataset.cinematicMode === "enhanced"
    && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "ready"
  ), undefined, { timeout: options.timeoutMs }).then(() => true, () => false);
  let wheelSteps = 0;
  while (wheelSteps < 24) {
    const resolved = await page.locator("[data-cinematic-shell]").getAttribute("data-manifesto-reveal").catch(() => null);
    if (resolved === "resolved") break;
    await page.mouse.wheel(0, 1_200);
    wheelSteps += 1;
    await page.waitForTimeout(80);
  }
  const resolved = await page.waitForFunction(() => (
    document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved"
    && !document.querySelector("#entry")?.hasAttribute("inert")
  ), undefined, { timeout: Math.min(options.timeoutMs, 6_000) }).then(() => true, () => false);
  const state = await observeDesktopHomeState(page);
  return { input: "NATIVE WHEEL", ready, resolved, wheelSteps, state };
}

async function observeDesktopHomeNavigation(page, options, route) {
  await openRoute(page, options, route);
  const preparation = route.id === "home" ? await prepareHomeHeaderNavigation(page, options) : null;
  const focus = await focusByTab(page, ".site-header .brand-link[href='/#entry']", 40);
  let arrival = await observeDesktopHomeState(page);
  let back = null;
  let forward = null;
  let activationError = null;
  let arrivalReady = false;
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
    arrivalReady = await waitForResolvedHomeState(page, options.timeoutMs).then(() => true, () => false);
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
          await waitForResolvedHomeState(page, options.timeoutMs);
          forward = await observeDesktopHomeState(page);
        } catch (error) {
          forwardError = error instanceof Error ? error.message : String(error);
        }
      }
    }
  }
  return { activationError, arrival, arrivalReady, back, backError, focus, forward, forwardError, preparation };
}

async function observeSkipActivation(page, expectedHash) {
  return page.evaluate((hash) => {
    const target = document.querySelector(hash);
    const rect = target?.getBoundingClientRect();
    const style = target instanceof Element ? getComputedStyle(target) : null;
    const targetVisibilityChain = [];
    for (let current = target; current instanceof Element; current = current.parentElement) {
      const currentStyle = getComputedStyle(current);
      targetVisibilityChain.push({
        ariaHidden: current.getAttribute("aria-hidden"),
        contentVisibility: currentStyle.contentVisibility || "visible",
        display: currentStyle.display,
        hidden: current.hasAttribute("hidden"),
        inert: current.hasAttribute("inert"),
        opacity: Number.parseFloat(currentStyle.opacity),
        tag: current.localName,
        visibility: currentStyle.visibility,
      });
    }
    const targetRenderedVisible = targetVisibilityChain.length > 0 && targetVisibilityChain.every((current) => (
      current.ariaHidden?.toLowerCase() !== "true" && current.contentVisibility !== "hidden" && current.display !== "none"
      && current.hidden === false && current.inert === false && Number.isFinite(current.opacity) && current.opacity > 0.01
      && !["collapse", "hidden"].includes(current.visibility)
    ));
    const targetRect = rect ? { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width } : null;
    return {
      activeId: document.activeElement?.id ?? null,
      hash: location.hash,
      path: location.pathname,
      targetDisplay: style?.display ?? null,
      targetRenderedVisible,
      targetRect,
      targetTag: target?.localName ?? null,
      targetVisibility: style?.visibility ?? null,
      targetVisibilityChain,
      targetVisible: Boolean(rect && rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth
        && ["block", "grid"].includes(style?.display) && style.visibility === "visible"),
    };
  }, expectedHash);
}

async function runKeyboardChecks(browser, engine, options) {
  const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block", viewport: { width: KEYBOARD_VIEWPORT.width, height: KEYBOARD_VIEWPORT.height } });
  const page = await context.newPage();
  const records = [];
  try {
    for (const route of PHASE6_ROUTES) {
      const collector = startDiagnostics(page);
      await openRoute(page, options, route);
      const interactionReady = await waitForInteractionReady(page, route, options.timeoutMs);
      const expectedHash = route.id === "home" ? "#entry" : "#main-content";
      await page.keyboard.press("Tab");
      const firstVisibilityReady = await waitForActiveElementFullyVisible(page, options.timeoutMs);
      const first = await observeFocus(page);
      let activationReady = false;
      if (first.href === expectedHash) {
        await page.keyboard.press("Enter");
        activationReady = await page.waitForFunction((hash) => location.hash === hash, expectedHash, { timeout: Math.min(options.timeoutMs, 5_000) }).then(() => true, () => false);
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
      const diagnostics = collector.stop();
      const record = { activationReady, afterActivation, backward, desktopHome, diagnostics, engine, expectedHash, first, firstVisibilityReady, forwardFirst, forwardSecond, interactionReady, route: route.id, routePath: route.path };
      record.failures = [...keyboardFailures(record), ...interactionDiagnosticFailures(diagnostics, route, options.baseUrl, { allowHomeTransitions: true })];
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
  const onAboutRoute = (state) => state?.path === "/about/" && state.hash === "";
  if (record.triggerFocus?.tag !== "summary" || record.triggerFocus.withinMobileNav !== true
    || record.triggerFocus.href !== null || record.triggerFocus.ariaLabel !== null || record.triggerFocus.text !== "Menu"
    || !visiblyFocused(record.triggerFocus, MOBILE_VIEWPORT)) failures.push({ code: "mobile-menu-trigger-focus", actual: record.triggerFocus });
  if (!onAboutRoute(record.ordinaryOpen) || record.ordinaryOpen.open !== true || record.ordinaryOpen.ariaExpanded !== "true" || record.ordinaryOpen.activeIsTrigger !== true) failures.push({ code: "mobile-menu-open", actual: record.ordinaryOpen });
  if (!onAboutRoute(record.ordinaryClose) || record.ordinaryClose.open !== false || record.ordinaryClose.ariaExpanded !== "false" || record.ordinaryClose.activeIsTrigger !== true) failures.push({ code: "mobile-menu-close", actual: record.ordinaryClose });
  if (record.firstMenuLink?.tag !== "a" || record.firstMenuLink.withinMobileNav !== true
    || record.firstMenuLink.href !== "/#entry" || record.firstMenuLink.ariaLabel !== null || record.firstMenuLink.text !== "Home"
    || !visiblyFocused(record.firstMenuLink, MOBILE_VIEWPORT)) failures.push({ code: "mobile-menu-link-focus", actual: record.firstMenuLink });
  if (!onAboutRoute(record.escapeClose) || record.escapeClose.open !== false || record.escapeClose.ariaExpanded !== "false" || record.escapeClose.activeIsTrigger !== true) failures.push({ code: "mobile-menu-escape-focus-return", actual: record.escapeClose });
  for (const [index, cycle] of record.cycles.entries()) {
    if (!onAboutRoute(cycle.open) || cycle.open.open !== true || cycle.open.ariaExpanded !== "true" || cycle.open.activeIsTrigger !== true
      || !onAboutRoute(cycle.close) || cycle.close.open !== false || cycle.close.ariaExpanded !== "false" || cycle.close.activeIsTrigger !== true) {
      failures.push({ code: "mobile-menu-repeat-cycle", cycle: index + 1, actual: cycle });
    }
  }
  if (record.navigation.focus?.tag !== "a" || record.navigation.focus.withinMobileNav !== true
    || !visiblyFocused(record.navigation.focus, MOBILE_VIEWPORT) || record.navigation.focus.href !== "/#entry"
    || record.navigation.focus.ariaLabel !== null || record.navigation.focus.text !== "Home") {
    failures.push({ code: "mobile-menu-navigation-focus", actual: record.navigation.focus, expected: "/#entry" });
  }
  if (record.navigation.activationError !== null) failures.push({ code: "mobile-menu-navigation-wait", actual: record.navigation.activationError });
  if (record.navigation.backError !== null) failures.push({ code: "mobile-menu-history-wait", actual: record.navigation.backError });
  if (record.navigation.arrival?.path !== "/" || record.navigation.arrival.hash !== "#entry"
    || record.navigation.arrival.open !== false || record.navigation.arrival.ariaExpanded !== "false" || record.navigation.arrival.activeIsTrigger !== false) {
    failures.push({ code: "mobile-menu-navigation", actual: record.navigation.arrival });
  }
  if (!record.navigation.back || record.navigation.back.path !== "/about/" || record.navigation.back.hash !== ""
    || record.navigation.back.open !== false || record.navigation.back.ariaExpanded !== "false" || record.navigation.back.activeIsTrigger !== false) {
    failures.push({ code: "mobile-menu-history-return", actual: record.navigation.back });
  }
  return failures;
}

async function runMobileMenuChecks(browser, engine, options) {
  const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block", viewport: { width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height } });
  const page = await context.newPage();
  try {
    const collector = startDiagnostics(page);
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
    const diagnostics = collector.stop();
    const record = { cycles, diagnostics, engine, escapeClose, firstMenuLink, navigation: { activationError, arrival, back, backError, focus: navigationFocus }, ordinaryClose, ordinaryOpen, triggerFocus };
    const route = PHASE6_ROUTES.find(({ id }) => id === "about");
    record.failures = [...mobileMenuFailures(record), ...interactionDiagnosticFailures(diagnostics, route, options.baseUrl, { allowHomeTransitions: true })];
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
  const ready = await page.waitForFunction(() => {
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    if (!entry || !header || location.hash !== "#entry") return false;
    return Math.abs(entry.getBoundingClientRect().top - Math.max(0, header.getBoundingClientRect().bottom)) <= 12;
  }, undefined, { timeout: Math.min(timeoutMs, 5_000) }).then(() => true, () => false);
  await page.waitForTimeout(80);
  return ready;
}

export function historyFailures(record) {
  const failures = [];
  const hasMetrics = (state) => Number.isSafeInteger(state?.scrollY) && state.scrollY >= 0 && Number.isFinite(state.entryAlignmentDelta);
  if (record.entryReady !== true) failures.push({ code: "same-document-entry-wait", actual: record.entryReady ?? null, expected: true });
  if (record.forwardReady !== true) failures.push({ code: "same-document-forward-wait", actual: record.forwardReady ?? null, expected: true });
  if (!hasMetrics(record.bare) || record.bare.path !== "/" || record.bare.hash !== "" || record.bare.scrollY > 2) failures.push({ code: "same-document-bare", actual: record.bare });
  if (!hasMetrics(record.entry) || record.entry.path !== "/" || record.entry.hash !== "#entry" || record.entry.scrollY <= 0 || Math.abs(record.entry.entryAlignmentDelta) > 12) failures.push({ code: "same-document-entry", actual: record.entry });
  if (!hasMetrics(record.back) || record.back.path !== "/" || record.back.hash !== "" || record.back.scrollY > 2) failures.push({ code: "same-document-back", actual: record.back });
  if (!hasMetrics(record.forward) || record.forward.path !== "/" || record.forward.hash !== "#entry" || record.forward.scrollY <= 0 || Math.abs(record.forward.entryAlignmentDelta) > 12) failures.push({ code: "same-document-forward", actual: record.forward });
  return failures;
}

async function runHistoryChecks(browser, engine, options) {
  const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block", viewport: { width: KEYBOARD_VIEWPORT.width, height: KEYBOARD_VIEWPORT.height } });
  const page = await context.newPage();
  try {
    const collector = startDiagnostics(page);
    await page.goto(targetUrl(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settle(page, options.timeoutMs);
    const bare = await observeHistory(page);
    await page.goto(targetUrl(options.baseUrl, "/#entry"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    const entryReady = await waitForEntry(page, options.timeoutMs);
    const entry = await observeHistory(page);
    await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForTimeout(100);
    const back = await observeHistory(page);
    await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    const forwardReady = await waitForEntry(page, options.timeoutMs);
    const forward = await observeHistory(page);
    const diagnostics = collector.stop();
    const record = { back, bare, diagnostics, engine, entry, entryReady, forward, forwardReady };
    const route = PHASE6_ROUTES.find(({ id }) => id === "home");
    record.failures = [...historyFailures(record), ...interactionDiagnosticFailures(diagnostics, route, options.baseUrl)];
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
  assert([...PHASE6_ENGINES, "all"].includes(report.engine), "accessibility report engine differs");
  assert(typeof report.axeOnly === "boolean", "accessibility axe-only authority differs");
  assert(typeof report.headed === "boolean", "accessibility headed authority differs");
  let reportBaseUrl = null;
  try { reportBaseUrl = new URL(report.baseUrl); } catch {}
  assert(reportBaseUrl && ["http:", "https:"].includes(reportBaseUrl.protocol)
    && !reportBaseUrl.username && !reportBaseUrl.password && !reportBaseUrl.search && !reportBaseUrl.hash
    && reportBaseUrl.pathname.endsWith("/") && reportBaseUrl.toString() === report.baseUrl,
  "accessibility base URL authority differs");
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
    assert(result.browser && typeof result.browser === "object" && !Array.isArray(result.browser)
      && result.browser.engine === result.engine && result.browser.headed === report.headed
      && result.browser.executable === EXPECTED_BROWSER_EXECUTABLES[result.engine]
      && typeof result.browser.version === "string" && BROWSER_VERSION_PATTERN.test(result.browser.version),
    `${result.engine} browser identity differs`);
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
        && (record.caseError === null || (typeof record.caseError === "string" && record.caseError.length > 0))
        && Array.isArray(record.violations)
        && Array.isArray(record.failures)
        && Number.isSafeInteger(record.incompleteCount) && record.incompleteCount >= 0
        && (record.httpStatus === null || (Number.isSafeInteger(record.httpStatus) && record.httpStatus >= 100 && record.httpStatus <= 599)), `${result.engine} axe raw row differs`);
      const expectedFailures = [];
      if (record.caseError !== null) expectedFailures.push({ code: "axe-case-error", actual: record.caseError });
      if (record.caseError === null && !expectedHttpStatus(record.httpStatus, route.expectedStatus)) expectedFailures.push({ code: "http-status", actual: record.httpStatus, expected: route.expectedStatus });
      if (record.violations.length) expectedFailures.push({ code: "axe-violations", actual: record.violations.length, expected: 0 });
      expectedFailures.push(...seriousCriticalAxeFailures(record));
      expectedFailures.push(...interactionDiagnosticFailures(record.diagnostics, route, report.baseUrl));
      assert(sameJson(record.failures, expectedFailures), `${result.engine} axe raw failure ledger differs`);
      const expectedStatus = expectedFailures.length ? "FAIL" : "PASS";
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
        const failures = [...keyboardFailures(record), ...interactionDiagnosticFailures(record.diagnostics, route, report.baseUrl, { allowHomeTransitions: true })];
        assert(sameJson(record.failures, failures) && record.status === (failures.length ? "FAIL" : "PASS"), `${result.engine} keyboard raw row/status differs`);
      }
      assert(result.mobileMenu && result.mobileMenu.engine === result.engine && Array.isArray(result.mobileMenu.cycles) && result.mobileMenu.cycles.length === MENU_REPEAT_CYCLES, `${result.engine} mobile-menu cycles are incomplete`);
      const menuRoute = PHASE6_ROUTES.find(({ id }) => id === "about");
      const menuFailures = [...mobileMenuFailures(result.mobileMenu), ...interactionDiagnosticFailures(result.mobileMenu.diagnostics, menuRoute, report.baseUrl, { allowHomeTransitions: true })];
      assert(sameJson(result.mobileMenu.failures, menuFailures)
        && result.mobileMenu.status === (menuFailures.length ? "FAIL" : "PASS"), `${result.engine} mobile-menu raw evidence differs`);
      assert(result.history && result.history.engine === result.engine, `${result.engine} history evidence is absent or mislabeled`);
      const historyRoute = PHASE6_ROUTES.find(({ id }) => id === "home");
      const derivedHistoryFailures = [...historyFailures(result.history), ...interactionDiagnosticFailures(result.history.diagnostics, historyRoute, report.baseUrl)];
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
