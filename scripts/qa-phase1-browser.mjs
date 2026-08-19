import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import axeCore from "axe-core";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE_URL = "http://127.0.0.1:4321";
const DEFAULT_REPORT = path.join(ROOT, "artifacts", "evidence", "phase-1", "phase-1-browser-report.json");
const BUILD_REPORT = path.join(ROOT, "artifacts", "evidence", "phase-1", "phase-1-build-report.json");
const NAVIGATION_LINK_COUNT = 8;
const MOBILE_NAVIGATION_HREFS = Object.freeze([
  "/",
  "/for-partners/",
  "/for-startups/",
  "/industries/",
  "/pocs/",
  "/spark/",
  "/about/",
  "/contact/",
]);
const DEBUG = process.env.PHASE1_QA_DEBUG === "1";
const FONT_PROBE_EXPECTATIONS = Object.freeze({
  display: Object.freeze({ preferred: "Syne", fallback: "Arial Black" }),
  prose: Object.freeze({ preferred: "Newsreader", fallback: "Georgia" }),
  navigation: Object.freeze({ preferred: "Inter", fallback: "Arial" }),
});
const PREFERRED_FONT_NAMES = Object.freeze(
  Object.values(FONT_PROBE_EXPECTATIONS).map(({ preferred }) => preferred),
);
const PREFERRED_FONT_LOAD_EXPECTATIONS = Object.freeze([
  Object.freeze({ id: "syne-800", family: "Syne", weight: 800 }),
  Object.freeze({ id: "newsreader-400", family: "Newsreader", weight: 400 }),
  Object.freeze({ id: "inter-400", family: "Inter", weight: 400 }),
  Object.freeze({ id: "inter-600", family: "Inter", weight: 600 }),
]);

async function canonicalPathKey(candidate) {
  const resolved = path.resolve(candidate);
  let canonical = resolved;
  try {
    canonical = await realpath(resolved);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    try {
      canonical = path.join(await realpath(path.dirname(resolved)), path.basename(resolved));
    } catch (parentError) {
      if (!(parentError && typeof parentError === "object" && "code" in parentError && parentError.code === "ENOENT")) throw parentError;
    }
  }
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}
const PROTECTED_DISPLAY_WORDS = Object.freeze([
  "PROVE",
  "WORK",
  "WHERE",
  "DO",
  "YOU",
  "ENTER",
  "INDUSTRY",
  "STARTUPS",
  "EVIDENCE",
  "QUANTUM",
]);

const ROUTES = Object.freeze([
  { id: "home", path: "/", currentHref: "/" },
  { id: "for-industry", path: "/for-partners", currentHref: "/for-partners/" },
  { id: "for-startups", path: "/for-startups", currentHref: "/for-startups/" },
  { id: "industries", path: "/industries", currentHref: "/industries/" },
  { id: "proof", path: "/pocs", currentHref: "/pocs/" },
  { id: "maradin", path: "/pocs/maradin", currentHref: "/pocs/" },
  { id: "spark", path: "/spark", currentHref: "/spark/" },
  { id: "about", path: "/about", currentHref: "/about/" },
  { id: "contact", path: "/contact", currentHref: "/contact/" },
  { id: "404", path: "/404", currentHref: null },
]);

const REQUIRED_VIEWPORTS = Object.freeze([
  { id: "desktop-1440x900", width: 1440, height: 900, class: "desktop", required: true },
  { id: "short-desktop-1366x650", width: 1366, height: 650, class: "short-desktop", required: true },
  { id: "desktop-1280x800", width: 1280, height: 800, class: "desktop", required: true },
  { id: "tablet-landscape-1024x768", width: 1024, height: 768, class: "tablet-landscape", required: true, boundary: "1023→1024" },
  { id: "tablet-portrait-768x1024", width: 768, height: 1024, class: "tablet-portrait", required: true, boundary: "767→768" },
  { id: "mobile-390x844", width: 390, height: 844, class: "mobile", required: true, boundary: "389→390" },
  { id: "mobile-360x800", width: 360, height: 800, class: "mobile", required: true },
  { id: "narrow-320x800", width: 320, height: 800, class: "narrow", required: true },
  { id: "mobile-landscape-844x390", width: 844, height: 390, class: "mobile-landscape", required: true },
]);

const BOUNDARY_VIEWPORTS = Object.freeze([
  { id: "boundary-1199x900", width: 1199, height: 900, class: "boundary", boundary: "1199→1200" },
  { id: "boundary-1200x900", width: 1200, height: 900, class: "boundary", boundary: "1199→1200" },
  { id: "boundary-1023x768", width: 1023, height: 768, class: "boundary", boundary: "1023→1024" },
  { id: "boundary-767x1024", width: 767, height: 1024, class: "boundary", boundary: "767→768" },
  { id: "boundary-389x844", width: 389, height: 844, class: "boundary", boundary: "389→390" },
]);

const ALL_VIEWPORTS = Object.freeze([...REQUIRED_VIEWPORTS, ...BOUNDARY_VIEWPORTS]);
const VIEWPORT_BY_ID = new Map(ALL_VIEWPORTS.map((viewport) => [viewport.id, viewport]));
const ROUTE_BY_ID = new Map(ROUTES.map((route) => [route.id, route]));

const SUPPORTING_CAPTURE_ORDER = Object.freeze([
  "for-industry",
  "for-startups",
  "industries",
  "proof",
  "maradin",
  "spark",
  "about",
  "contact",
  "404",
]);

const SHORT_HEIGHT_CAPTURE_ORDER = Object.freeze([
  "for-industry",
  "for-startups",
  "industries",
  "maradin",
]);

const TYPOGRAPHY_REVIEW_ROUTE_ORDER = Object.freeze([
  "for-industry",
  "maradin",
  "spark",
  "contact",
]);

const HOME_SCENE_IDENTITIES = Object.freeze([
  "entry",
  "built-with-industry",
  "method",
  "industries",
  "proof",
  "programmes",
  "conversion",
]);

const MOBILE_H1_MINIMUM_PX = 30;
const MOBILE_H1_BODY_RATIO_MINIMUM = 1.6;

function parseArguments(argv) {
  const options = { smoke: false, list: false, report: null, browser: null, match: null, serverMode: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--smoke") options.smoke = true;
    else if (value === "--list") options.list = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--report") options.report = argv[++index] ?? null;
    else if (value === "--browser") options.browser = argv[++index] ?? null;
    else if (value === "--match") options.match = argv[++index] ?? null;
    else if (value === "--server-mode") options.serverMode = argv[++index] ?? null;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (
    (argv.includes("--report") && !options.report) ||
    (argv.includes("--browser") && !options.browser) ||
    (argv.includes("--match") && !options.match) ||
    (argv.includes("--server-mode") && !options.serverMode)
  ) {
    throw new Error("--report, --browser, --match and --server-mode require a value");
  }
  return options;
}

function usage() {
  console.log(`Phase 1 browser and visual QA

Usage:
  node scripts/qa-phase1-browser.mjs [--smoke] [--list] [--match REGEXP] [--browser PATH] [--report PATH] [--server-mode MODE]

Environment:
  PHASE1_BASE_URL  Site origin to test (default ${DEFAULT_BASE_URL})
  CHROME_PATH      Explicit Chrome executable

Full mode writes ${DEFAULT_REPORT} and keeps curated raw screenshots in a unique OS temp directory.
Smoke mode tests Home and 404 at representative viewports and writes its report beside the temp captures.`);
}

function normalizeBaseUrl(input) {
  const url = new URL(input);
  if (!/^https?:$/.test(url.protocol)) throw new Error("PHASE1_BASE_URL must use HTTP or HTTPS");
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function caseId(scenario, route, viewport) {
  return `${scenario}--${route.id}--${viewport.id}`;
}

function baselineCapture(route, viewport) {
  if (route.id === "home") {
    if ([
      "desktop-1440x900",
      "short-desktop-1366x650",
      "mobile-390x844",
      "narrow-320x800",
    ].includes(viewport.id)) {
      return {
        label: `Home · ${viewport.width}×${viewport.height}`,
        groups: [],
        groupOrder: {},
      };
    }
    if (viewport.id === "mobile-landscape-844x390") {
      return {
        label: "Home · mobile landscape · 844×390",
        groups: ["mobile-landscape"],
        groupOrder: { "mobile-landscape": 0 },
      };
    }
  }

  const supportingOrder = SUPPORTING_CAPTURE_ORDER.indexOf(route.id);
  if (supportingOrder < 0) return null;

  const groups = [];
  const groupOrder = {};
  if (viewport.id === "mobile-390x844") {
    groups.push("supporting-mobile-390");
    groupOrder["supporting-mobile-390"] = supportingOrder;
  }
  if (viewport.id === "narrow-320x800") {
    groups.push("supporting-mobile-320");
    groupOrder["supporting-mobile-320"] = supportingOrder;
  }

  const shortOrder = SHORT_HEIGHT_CAPTURE_ORDER.indexOf(route.id);
  if (viewport.id === "short-desktop-1366x650" && shortOrder >= 0) {
    groups.push("short-height");
    groupOrder["short-height"] = shortOrder;
  }
  if (viewport.id === "mobile-landscape-844x390" && shortOrder >= 0) {
    groups.push("mobile-landscape");
    groupOrder["mobile-landscape"] = shortOrder + 1;
  }

  if (groups.length > 0) {
    return {
      label: `${route.id.replaceAll("-", " ")} · ${viewport.width}×${viewport.height}`,
      groups,
      groupOrder,
    };
  }
  return null;
}

function stressCapture(id) {
  const captures = Object.fromEntries([
    ...TYPOGRAPHY_REVIEW_ROUTE_ORDER.map((routeId, index) => [
      `text-200--${routeId}--mobile`,
      {
        label: `${routeId.replaceAll("-", " ")} · 200% text · 390×844`,
        groups: ["accessibility-typography"],
        groupOrder: { "accessibility-typography": index },
      },
    ]),
    ...TYPOGRAPHY_REVIEW_ROUTE_ORDER.map((routeId, index) => [
      `fallback--${routeId}--mobile-390x844`,
      {
        label: `${routeId.replaceAll("-", " ")} · forced fallback fonts · 390×844`,
        groups: ["accessibility-typography"],
        groupOrder: { "accessibility-typography": index + TYPOGRAPHY_REVIEW_ROUTE_ORDER.length },
      },
    ]),
    [
      "keyboard-focus-mobile",
      {
        label: "Home · open keyboard navigation · 390×844",
        groups: ["accessibility-typography"],
        groupOrder: { "accessibility-typography": 8 },
      },
    ],
    [
      "js-disabled-nav-mobile",
      {
        label: "Home · open no-JavaScript navigation · 320×800",
        groups: ["accessibility-typography"],
        groupOrder: { "accessibility-typography": 9 },
      },
    ],
  ]);
  return captures[id] ?? null;
}

function buildCases(smoke) {
  if (smoke) {
    return [
      {
        id: "smoke--home--desktop-1440x900",
        route: ROUTE_BY_ID.get("home"),
        viewport: VIEWPORT_BY_ID.get("desktop-1440x900"),
        scenario: "baseline",
        mutation: null,
        javaScriptEnabled: true,
        reducedMotion: "no-preference",
        capture: null,
        runSkipLink: true,
        runMobileMenu: false,
      },
      {
        id: "smoke--home--mobile-390x844",
        route: ROUTE_BY_ID.get("home"),
        viewport: VIEWPORT_BY_ID.get("mobile-390x844"),
        scenario: "baseline",
        mutation: null,
        javaScriptEnabled: true,
        reducedMotion: "no-preference",
        capture: null,
        runSkipLink: false,
        runMobileMenu: true,
      },
      {
        id: "smoke--404--desktop-1440x900",
        route: ROUTE_BY_ID.get("404"),
        viewport: VIEWPORT_BY_ID.get("desktop-1440x900"),
        scenario: "baseline",
        mutation: null,
        javaScriptEnabled: true,
        reducedMotion: "no-preference",
        capture: null,
        runSkipLink: true,
        runMobileMenu: false,
      },
    ];
  }

  const cases = [];
  for (const route of ROUTES) {
    for (const viewport of ALL_VIEWPORTS) {
      cases.push({
        id: caseId("baseline", route, viewport),
        route,
        viewport,
        scenario: "baseline",
        mutation: null,
        javaScriptEnabled: true,
        reducedMotion: "no-preference",
        capture: baselineCapture(route, viewport),
        runSkipLink: viewport.id === "desktop-1440x900",
        runMobileMenu: route.id === "home" && viewport.id === "mobile-390x844",
      });
    }
  }

  for (const route of ROUTES) {
    for (const viewport of ALL_VIEWPORTS) {
      const id = caseId("fallback", route, viewport);
      cases.push({
        id,
        route,
        viewport,
        scenario: "fallback-font-matrix",
        mutation: "fallback-fonts",
        javaScriptEnabled: true,
        reducedMotion: "no-preference",
        capture: stressCapture(id),
        runSkipLink: false,
        runMobileMenu: false,
      });
    }
  }

  const text200Viewports = [
    VIEWPORT_BY_ID.get("desktop-1440x900"),
    VIEWPORT_BY_ID.get("mobile-390x844"),
  ];
  for (const route of ROUTES) {
    for (const viewport of text200Viewports) {
      const id = route.id === "home"
        ? `text-200-${viewport.class === "desktop" ? "desktop" : "mobile"}`
        : `text-200--${route.id}--${viewport.class === "desktop" ? "desktop" : "mobile"}`;
      cases.push({
        id,
        route,
        viewport,
        scenario: "text-200-matrix",
        mutation: "text-200",
        javaScriptEnabled: true,
        reducedMotion: "no-preference",
        capture: stressCapture(id),
        runSkipLink: false,
        runMobileMenu: false,
      });
    }
  }

  const home = ROUTE_BY_ID.get("home");
  const stressCases = [
    ["fallback-desktop", "desktop-1440x900", "fallback-fonts", true, "no-preference"],
    ["fallback-mobile", "mobile-390x844", "fallback-fonts", true, "no-preference"],
    ["long-copy-desktop", "desktop-1440x900", "long-copy", true, "no-preference"],
    ["long-copy-mobile", "mobile-390x844", "long-copy", true, "no-preference"],
    ["reduced-motion-desktop", "desktop-1440x900", null, true, "reduce"],
    ["reduced-motion-mobile", "mobile-390x844", null, true, "reduce"],
    ["keyboard-focus-desktop", "desktop-1440x900", "keyboard-focus", true, "no-preference"],
    ["keyboard-focus-mobile", "mobile-390x844", "keyboard-focus", true, "no-preference"],
    ["js-disabled-nav-mobile", "narrow-320x800", "js-disabled-nav", false, "no-preference"],
  ];
  for (const [id, viewportId, mutation, javaScriptEnabled, reducedMotion] of stressCases) {
    cases.push({
      id,
      route: home,
      viewport: VIEWPORT_BY_ID.get(viewportId),
      scenario: id,
      mutation,
      javaScriptEnabled,
      reducedMotion,
      capture: stressCapture(id),
      runSkipLink: false,
      runMobileMenu: id === "keyboard-focus-mobile",
    });
  }
  return cases;
}

function planCounts(cases) {
  return {
    baseline: cases.filter(({ scenario }) => scenario === "baseline").length,
    fallbackFontMatrix: cases.filter(({ scenario }) => scenario === "fallback-font-matrix").length,
    retainedStress: cases.filter(({ scenario }) => !["baseline", "fallback-font-matrix"].includes(scenario)).length,
    curatedCaptures: cases.filter(({ capture }) => capture).length,
    total: cases.length,
  };
}

async function exists(candidate) {
  if (!candidate) return false;
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function browserName(candidatePath, resolution) {
  if (/playwright-managed/i.test(resolution) || /chromium/i.test(path.basename(candidatePath))) return "Chromium";
  if (/google chrome|google-chrome|chrome(?:\.exe)?$/i.test(candidatePath)) return "Google Chrome";
  return "Chromium";
}

async function resolveChrome(override) {
  const candidates = [];
  if (override) candidates.push({ path: path.resolve(override), resolution: "--browser" });
  if (process.env.CHROME_PATH) candidates.push({ path: path.resolve(process.env.CHROME_PATH), resolution: "CHROME_PATH" });

  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    if (programFiles) candidates.push({ path: path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"), resolution: "Windows Program Files" });
    if (programFilesX86) candidates.push({ path: path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"), resolution: "Windows Program Files (x86)" });
    if (process.env.LOCALAPPDATA) candidates.push({ path: path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"), resolution: "Windows LocalAppData" });
  } else {
    candidates.push(
      { path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", resolution: "macOS standard path" },
      { path: "/usr/bin/google-chrome", resolution: "Linux standard path" },
      { path: "/usr/bin/google-chrome-stable", resolution: "Linux standard path" },
      { path: "/usr/bin/chromium", resolution: "Linux Chromium fallback" },
    );
  }

  const managed = chromium.executablePath?.();
  if (managed) candidates.push({ path: managed, resolution: "Playwright-managed fallback" });
  for (const candidate of candidates) {
    if (await exists(candidate.path)) {
      return {
        executablePath: path.resolve(candidate.path),
        name: browserName(candidate.path, candidate.resolution),
      };
    }
  }
  throw new Error(`Chrome was not found. Set CHROME_PATH. Tried:\n${candidates.map((candidate) => `- ${candidate.path}`).join("\n")}`);
}

function failureFor(plan, type, selector, measured, expected, message = null) {
  return {
    route: plan.route.path,
    viewport: plan.viewport.id,
    selector,
    type,
    measured,
    expected,
    ...(message ? { message } : {}),
  };
}

function debug(plan, step) {
  if (DEBUG) console.log(`  ${plan.id}: ${step}`);
}

async function withTimeout(promise, milliseconds, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms`)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function atomicWriteJson(destination, value) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function assertPortableReport(report, forbiddenPaths) {
  const strings = [];
  const visit = (value) => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(report);

  const normalizedForbidden = forbiddenPaths
    .filter(Boolean)
    .map((value) => String(value).replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase());
  const leaks = strings.filter((value) => {
    const normalized = value.replaceAll("\\", "/").toLowerCase();
    return normalizedForbidden.some((forbidden) => forbidden && normalized.includes(forbidden));
  });
  if (leaks.length > 0) {
    throw new Error(`Portable browser report contains ${leaks.length} runtime filesystem path value(s)`);
  }
}

async function settlePage(page, javaScriptEnabled) {
  await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
  if (!javaScriptEnabled) {
    await page.waitForTimeout(50);
    return;
  }
  await page.evaluate(async () => {
    const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    await Promise.race([document.fonts?.ready ?? Promise.resolve(), delay(5_000)]);
    const images = [...document.images].filter((image) => !image.complete);
    await Promise.all(images.map((image) => Promise.race([image.decode?.().catch(() => {}), delay(5_000)])));
    for (const video of document.querySelectorAll("video")) {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {}
    }
  });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
      html { scroll-behavior: auto !important; }
    `,
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function applyMutation(page, mutation) {
  if (!mutation || mutation === "keyboard-focus" || mutation === "js-disabled-nav") return null;
  if (mutation === "fallback-fonts") {
    return page.evaluate(() => {
      const display = document.querySelector("main h1");
      const proseSelectors = [
        "main .hero-support",
        "main .page-intro",
        "main .editorial-copy p",
      ];
      let prose = null;
      let proseSelector = null;
      for (const selector of proseSelectors) {
        prose = document.querySelector(selector);
        if (prose) {
          proseSelector = selector;
          break;
        }
      }
      const desktopNavigation = document.querySelector('header nav[aria-label="Primary navigation"] a');
      const mobileMenu = document.querySelector("[data-mobile-nav]");
      const desktopRect = desktopNavigation?.getBoundingClientRect();
      const desktopNavigationVisible = Boolean(desktopRect && desktopRect.width > 0 && desktopRect.height > 0);
      let openedMobileMenuForProbe = false;
      let navigation = desktopNavigation;
      let navigationSelector = 'header nav[aria-label="Primary navigation"] a';
      if (!desktopNavigationVisible && mobileMenu instanceof HTMLDetailsElement) {
        if (!mobileMenu.open) {
          mobileMenu.open = true;
          openedMobileMenuForProbe = true;
        }
        navigation = mobileMenu.querySelector('nav[aria-label="Mobile navigation"] a');
        navigationSelector = '[data-mobile-nav] nav[aria-label="Mobile navigation"] a';
      }
      const elements = { display, prose, navigation };
      const selectors = {
        display: "main h1",
        prose: proseSelector,
        navigation: navigationSelector,
      };

      const measure = (element, measureLines = true) => {
        if (!(element instanceof Element)) return null;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        let lineCount = null;
        if (measureLines) {
          const range = document.createRange();
          range.selectNodeContents(element);
          const lineTops = [];
          for (const textRect of range.getClientRects()) {
            if (textRect.width <= 0 || textRect.height <= 0) continue;
            if (!lineTops.some((top) => Math.abs(top - textRect.top) <= 1)) lineTops.push(textRect.top);
          }
          lineCount = lineTops.length;
        }
        return {
          computedFamily: style.fontFamily,
          fontSizePx: Number.parseFloat(style.fontSize),
          lineHeightPx: Number.parseFloat(style.lineHeight),
          lineCount,
          wraps: lineCount === null ? null : lineCount > 1,
          widthPx: Number(rect.width.toFixed(2)),
          heightPx: Number(rect.height.toFixed(2)),
          scrollWidthPx: element.scrollWidth,
          clientWidthPx: element.clientWidth,
        };
      };
      const snapshot = () => ({
        display: measure(elements.display),
        prose: measure(elements.prose),
        navigation: measure(elements.navigation),
      });

      const preferredFontLoads = [
        { id: "syne-800", family: "Syne", weight: 800 },
        { id: "newsreader-400", family: "Newsreader", weight: 400 },
        { id: "inter-400", family: "Inter", weight: 400 },
        { id: "inter-600", family: "Inter", weight: 600 },
      ].map((font) => {
        const query = `${font.weight} 16px "${font.family}"`;
        return {
          ...font,
          query,
          loaded: document.fonts?.check(query, "Quantum") ?? false,
        };
      });
      const preferred = snapshot();
      const fallbackVariables = {
        "--font-display": '"Arial Black", Arial, sans-serif',
        "--font-body": 'Georgia, "Times New Roman", serif',
        "--font-ui": "Arial, Helvetica, sans-serif",
      };
      for (const [property, value] of Object.entries(fallbackVariables)) {
        document.documentElement.style.setProperty(property, value);
      }

      const fallback = snapshot();
      const comparison = Object.fromEntries(
        Object.keys(elements).map((role) => [
          role,
          {
            preferredLineCount: preferred[role]?.lineCount ?? null,
            fallbackLineCount: fallback[role]?.lineCount ?? null,
            lineCountDelta: preferred[role]?.lineCount == null || fallback[role]?.lineCount == null
              ? null
              : fallback[role].lineCount - preferred[role].lineCount,
            wrapsChanged: preferred[role]?.wraps == null || fallback[role]?.wraps == null
              ? null
              : fallback[role].wraps !== preferred[role].wraps,
            heightDeltaPx: preferred[role] && fallback[role]
              ? Number((fallback[role].heightPx - preferred[role].heightPx).toFixed(2))
              : null,
          },
        ]),
      );
      if (openedMobileMenuForProbe) mobileMenu.open = false;

      return {
        applied: true,
        method: "documentElement.style custom-property override",
        openedMobileMenuForProbe,
        fallbackVariables,
        selectors,
        notApplicable: prose ? {} : { prose: "No editorial prose element exists on this route." },
        preferredFontLoads,
        preferred,
        fallback,
        comparison,
      };
    });
  }
  if (mutation === "long-copy") {
    return page.evaluate(() => {
      const target = document.querySelector(".hero-support, [data-qa-support-copy]");
      if (!target) return { applied: false, reason: "support-copy target missing" };
      const original = target.textContent?.trim() ?? "";
      const desiredLength = Math.ceil(original.length * 1.25);
      const fixtureWords = "Additional operating context tests the same proposition with deliberately longer review-only support copy.".split(" ");
      const words = [];
      let index = 0;
      while (`${original} ${words.join(" ")}`.length < desiredLength) {
        words.push(fixtureWords[index % fixtureWords.length]);
        index += 1;
      }
      target.textContent = `${original} ${words.join(" ")}`;
      target.setAttribute("data-qa-long-copy", "true");
      return {
        applied: true,
        originalLength: original.length,
        fixtureLength: target.textContent.length,
        ratio: Number((target.textContent.length / Math.max(original.length, 1)).toFixed(3)),
      };
    });
  }
  if (mutation === "text-200") {
    return page.evaluate(() => {
      const excluded = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH"]);
      const targets = [...document.body.querySelectorAll("*")]
        .filter((element) => !excluded.has(element.tagName))
        .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
        .map((element) => ({ element, fontSize: Number.parseFloat(getComputedStyle(element).fontSize) }))
        .filter(({ fontSize }) => Number.isFinite(fontSize) && fontSize > 0);
      for (const { element, fontSize } of targets) element.style.fontSize = `${fontSize * 2}px`;
      document.documentElement.setAttribute("data-qa-text-scale", "200");
      return { applied: true, scaledTextElements: targets.length, scale: 2, lineHeightOverride: false };
    });
  }
  throw new Error(`Unknown mutation: ${mutation}`);
}

function primaryFontFamily(computedFamily) {
  if (typeof computedFamily !== "string") return null;
  return computedFamily
    .split(",", 1)[0]
    .trim()
    .replace(/^(?:"([^"]+)"|'([^']+)')$/, "$1$2");
}

function fontProbeExpectation(plan, role) {
  const supportingMobileEditorialH1 = role === "display"
    && plan.route.id !== "home"
    && plan.viewport.width <= 576;
  return supportingMobileEditorialH1
    ? { preferred: "Newsreader", fallback: "Georgia" }
    : FONT_PROBE_EXPECTATIONS[role];
}

function collectFontFamilyFailures(plan, mutation) {
  const failures = [];
  for (const expectedFont of PREFERRED_FONT_LOAD_EXPECTATIONS) {
    const evidence = mutation?.preferredFontLoads?.find(({ id }) => id === expectedFont.id) ?? null;
    if (
      evidence?.family !== expectedFont.family
      || evidence?.weight !== expectedFont.weight
      || evidence?.loaded !== true
    ) {
      failures.push(failureFor(
        plan,
        "preferred-font-load",
        `document.fonts:${expectedFont.id}`,
        evidence,
        { ...expectedFont, loaded: true },
      ));
    }
  }
  for (const role of Object.keys(FONT_PROBE_EXPECTATIONS)) {
    const expected = fontProbeExpectation(plan, role);
    const selector = mutation?.selectors?.[role] ?? `font-probe:${role}`;
    const preferredEvidence = mutation?.preferred?.[role] ?? null;
    const fallbackEvidence = mutation?.fallback?.[role] ?? null;
    if (mutation?.notApplicable?.[role]) {
      if (preferredEvidence !== null || fallbackEvidence !== null) {
        failures.push(failureFor(
          plan,
          "font-probe-not-applicable",
          selector,
          { preferred: preferredEvidence, fallback: fallbackEvidence },
          { preferred: null, fallback: null, reason: mutation.notApplicable[role] },
        ));
      }
      continue;
    }
    const preferredComputed = preferredEvidence?.computedFamily ?? null;
    const fallbackComputed = fallbackEvidence?.computedFamily ?? null;
    const preferredPrimary = primaryFontFamily(preferredComputed);
    const fallbackPrimary = primaryFontFamily(fallbackComputed);
    const leakedPreferredNames = PREFERRED_FONT_NAMES.filter((fontName) =>
      String(fallbackComputed).toLowerCase().includes(fontName.toLowerCase()),
    );

    if (preferredPrimary !== expected.preferred) {
      failures.push(failureFor(
        plan,
        "preferred-font-family",
        selector,
        { computed: preferredComputed, primary: preferredPrimary },
        { primary: expected.preferred },
      ));
    }
    if (fallbackPrimary !== expected.fallback || leakedPreferredNames.length > 0) {
      failures.push(failureFor(
        plan,
        "fallback-font-family",
        selector,
        { computed: fallbackComputed, primary: fallbackPrimary, leakedPreferredNames },
        { primary: expected.fallback, preferredNamesAbsent: PREFERRED_FONT_NAMES },
      ));
    }
    if (
      !preferredEvidence
      || !fallbackEvidence
      || preferredEvidence.lineCount === null
      || fallbackEvidence.lineCount === null
    ) {
      failures.push(failureFor(
        plan,
        "font-probe-measurement",
        selector,
        { preferred: preferredEvidence, fallback: fallbackEvidence },
        { computedFamily: "recorded", lineCount: role === "prose" ? "recorded where route prose exists" : "recorded" },
      ));
    }
  }
  return failures;
}

async function collectNavigationFailures(page, plan) {
  const state = await page.evaluate((expectedHref) => {
    const navigations = [...document.querySelectorAll('header nav[aria-label="Primary navigation"], header nav[aria-label="Mobile navigation"]')]
      .map((navigation) => ({
        label: navigation.getAttribute("aria-label"),
        current: [...navigation.querySelectorAll('a[aria-current="page"]')]
          .map((link) => link.getAttribute("href"))
          .filter(Boolean),
      }));
    return { expectedHref, navigations };
  }, plan.route.currentHref);

  const failures = [];
  const expected = plan.route.currentHref === null ? [] : [plan.route.currentHref];
  for (const label of ["Primary navigation", "Mobile navigation"]) {
    const navigation = state.navigations.find((entry) => entry.label === label);
    if (!navigation || JSON.stringify(navigation.current) !== JSON.stringify(expected)) {
      failures.push(failureFor(plan, "navigation-current-route", `nav[aria-label="${label}"] a[aria-current=page]`, navigation?.current ?? null, expected));
    }
  }
  return { state, failures };
}

async function collectMobileH1Authority(page, plan) {
  const applicable = plan.route.id !== "home" && plan.viewport.width <= 390;
  if (!applicable) return { state: { applicable: false }, failures: [] };

  const state = await page.evaluate(() => {
    const h1 = document.querySelector("main h1");
    if (!(h1 instanceof HTMLElement)) return { applicable: true, found: false };
    const style = getComputedStyle(h1);
    const bodyStyle = getComputedStyle(document.body);
    const rect = h1.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(h1);
    const glyphRects = [...range.getClientRects()].filter((glyph) => glyph.width > 0 && glyph.height > 0);
    const lineTops = [];
    for (const glyph of glyphRects) {
      if (!lineTops.some((top) => Math.abs(top - glyph.top) <= 1)) lineTops.push(glyph.top);
    }
    const fontSizePx = Number.parseFloat(style.fontSize);
    const bodyFontSizePx = Number.parseFloat(bodyStyle.fontSize);
    const primaryFamily = style.fontFamily
      .split(",", 1)[0]
      .trim()
      .replace(/^(?:"([^"]+)"|'([^']+)')$/, "$1$2");
    return {
      applicable: true,
      found: true,
      text: h1.textContent?.trim() ?? "",
      fontFamily: style.fontFamily,
      primaryFamily,
      fontSizePx,
      bodyFontSizePx,
      sizeRatio: Number((fontSizePx / Math.max(bodyFontSizePx, 1)).toFixed(3)),
      lineHeightPx: Number.parseFloat(style.lineHeight),
      lineCount: lineTops.length,
      wordBreak: style.wordBreak,
      overflowWrap: style.overflowWrap,
      hyphens: style.hyphens,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      glyphBounds: glyphRects.length > 0 ? {
        left: Math.min(...glyphRects.map((glyph) => glyph.left)),
        top: Math.min(...glyphRects.map((glyph) => glyph.top)),
        right: Math.max(...glyphRects.map((glyph) => glyph.right)),
        bottom: Math.max(...glyphRects.map((glyph) => glyph.bottom)),
      } : null,
      scrollWidth: h1.scrollWidth,
      clientWidth: h1.clientWidth,
      scrollHeight: h1.scrollHeight,
      clientHeight: h1.clientHeight,
    };
  });

  const failures = [];
  if (!state.found) {
    failures.push(failureFor(plan, "mobile-h1-authority", "main h1", state, { found: true }));
    return { state, failures };
  }
  if (state.fontSizePx < MOBILE_H1_MINIMUM_PX || state.sizeRatio < MOBILE_H1_BODY_RATIO_MINIMUM) {
    failures.push(failureFor(plan, "mobile-h1-authority", "main h1", state, {
      minimumFontSizePx: MOBILE_H1_MINIMUM_PX,
      minimumBodySizeRatio: MOBILE_H1_BODY_RATIO_MINIMUM,
    }));
  }
  if (state.wordBreak !== "normal" || state.overflowWrap !== "normal" || state.hyphens !== "none") {
    failures.push(failureFor(plan, "mobile-h1-word-integrity", "main h1", state, {
      wordBreak: "normal",
      overflowWrap: "normal",
      hyphens: "none",
    }));
  }
  const glyphsInside = state.glyphBounds
    && state.glyphBounds.left >= state.rect.left - 1
    && state.glyphBounds.right <= state.rect.right + 1
    && state.glyphBounds.top >= state.rect.top - 1
    && state.glyphBounds.bottom <= state.rect.bottom + 1;
  if (!glyphsInside || state.scrollWidth > state.clientWidth + 1 || state.scrollHeight > state.clientHeight + 1) {
    failures.push(failureFor(plan, "mobile-h1-intrinsic-geometry", "main h1", state, {
      glyphsInsideElement: true,
      scrollWidthAtMost: state.clientWidth + 1,
      scrollHeightAtMost: state.clientHeight + 1,
    }));
  }
  const expectedFamily = plan.mutation === "fallback-fonts" ? "Georgia" : "Newsreader";
  if (state.primaryFamily !== expectedFamily) {
    failures.push(failureFor(plan, "mobile-h1-editorial-family", "main h1", {
      computed: state.fontFamily,
      primary: state.primaryFamily,
    }, { primary: expectedFamily }));
  }
  return { state, failures };
}

async function collectHomeSceneContract(page, plan) {
  if (plan.route.id !== "home") return { state: { applicable: false }, failures: [] };
  const state = await page.evaluate((expectedIdentities) => {
    const main = document.querySelector("main");
    const scenes = [...document.querySelectorAll("main [data-home-scene]")];
    const records = scenes.map((scene) => {
      const labelledBy = scene.getAttribute("aria-labelledby");
      const label = labelledBy ? document.getElementById(labelledBy) : null;
      const rect = scene.getBoundingClientRect();
      return {
        tagName: scene.tagName,
        identity: scene.getAttribute("data-home-scene"),
        id: scene.id || null,
        directMainChild: scene.parentElement === main,
        labelledBy,
        labelExists: Boolean(label),
        labelTagName: label?.tagName ?? null,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
      };
    });
    const threshold = document.querySelector('main > section[data-scene="threshold"]');
    const apertures = [...document.querySelectorAll('main .field-aperture[data-scene-layer="media"]')];
    return {
      applicable: true,
      expectedIdentities,
      identities: records.map(({ identity }) => identity),
      records,
      uniqueIdentities: new Set(records.map(({ identity }) => identity)).size,
      uniqueIds: new Set(records.map(({ id }) => id).filter(Boolean)).size,
      currentSignalCount: document.querySelectorAll('[data-home-scene="current-signal"]').length,
      legacyRadarCount: document.querySelectorAll('.signal-field, [class*="signal-field"]').length,
      threshold: threshold ? {
        id: threshold.id || null,
        labelledBy: threshold.getAttribute("aria-labelledby"),
        labelExists: Boolean(threshold.getAttribute("aria-labelledby") && document.getElementById(threshold.getAttribute("aria-labelledby"))),
      } : null,
      apertures: apertures.map((aperture) => ({
        ariaHidden: aperture.getAttribute("aria-hidden"),
        insideThreshold: Boolean(threshold?.contains(aperture)),
      })),
    };
  }, HOME_SCENE_IDENTITIES);

  const failures = [];
  if (JSON.stringify(state.identities) !== JSON.stringify(HOME_SCENE_IDENTITIES)) {
    failures.push(failureFor(plan, "home-scene-order", "main [data-home-scene]", state.identities, HOME_SCENE_IDENTITIES));
  }
  const validRecords = state.records.length === HOME_SCENE_IDENTITIES.length
    && state.records.every((record, index) => (
      record.tagName === "SECTION"
      && record.identity === HOME_SCENE_IDENTITIES[index]
      && record.id === record.identity
      && record.directMainChild
      && record.labelledBy
      && record.labelExists
      && /^H[1-6]$/.test(record.labelTagName ?? "")
      && record.height > 0
      && (index === 0 || record.top >= state.records[index - 1].bottom - 1)
    ));
  if (!validRecords || state.uniqueIdentities !== HOME_SCENE_IDENTITIES.length || state.uniqueIds !== HOME_SCENE_IDENTITIES.length) {
    failures.push(failureFor(plan, "home-scene-semantics", "main [data-home-scene]", state.records, {
      count: HOME_SCENE_IDENTITIES.length,
      tagName: "SECTION",
      stableUniqueIdEqualToIdentity: true,
      directMainChild: true,
      validHeadingLabel: true,
      orderedDocumentFlow: true,
    }));
  }
  if (state.currentSignalCount !== 0) {
    failures.push(failureFor(plan, "home-current-signal-publication", '[data-home-scene="current-signal"]', state.currentSignalCount, 0));
  }
  if (state.legacyRadarCount !== 0) {
    failures.push(failureFor(plan, "home-radar-removal", '.signal-field, [class*="signal-field"]', state.legacyRadarCount, 0));
  }
  const aperture = state.apertures[0];
  if (
    state.threshold?.id !== "home-threshold"
    || state.threshold?.labelledBy !== "home-title"
    || !state.threshold?.labelExists
    || state.apertures.length !== 1
    || aperture?.ariaHidden !== "true"
    || !aperture?.insideThreshold
  ) {
    failures.push(failureFor(plan, "home-threshold-contract", 'main > section[data-scene="threshold"]', {
      threshold: state.threshold,
      apertures: state.apertures,
    }, {
      threshold: { id: "home-threshold", labelledBy: "home-title", labelExists: true },
      apertureCount: 1,
      aperture: { ariaHidden: "true", insideThreshold: true },
    }));
  }
  return { state, failures };
}

async function checkSkipLink(page, plan) {
  const failures = [];
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => {
    const element = document.activeElement;
    const rect = element instanceof HTMLElement ? element.getBoundingClientRect() : null;
    return {
      selector: element instanceof HTMLElement ? `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).trim().replace(/\s+/g, ".")}` : ""}` : null,
      href: element instanceof HTMLAnchorElement ? element.getAttribute("href") : null,
      visible: Boolean(rect && rect.width >= 1 && rect.height >= 1 && rect.bottom > 0 && rect.right > 0),
    };
  });
  if (focused.href !== "#main-content" || !focused.visible) {
    failures.push(failureFor(plan, "skip-link-focus", ".skip-link", focused, { href: "#main-content", visible: true }));
  } else {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(20);
    const destination = await page.evaluate(() => ({
      activeId: document.activeElement?.id ?? null,
      hash: location.hash,
    }));
    if (destination.activeId !== "main-content" || destination.hash !== "#main-content") {
      failures.push(failureFor(plan, "skip-link-destination", "#main-content", destination, { activeId: "main-content", hash: "#main-content" }));
    }
  }
  await page.evaluate(() => {
    history.replaceState(null, "", location.pathname + location.search);
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  return failures;
}

async function collectOpenMobileMenuLayout(page, plan) {
  const state = await page.evaluate(() => {
    const menu = document.querySelector("[data-mobile-nav]");
    const trigger = menu?.querySelector("summary");
    const header = document.querySelector(".site-header");
    const panel = menu?.querySelector("nav");
    const links = [...(menu?.querySelectorAll("nav a[href]") ?? [])];
    const rectFor = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      } : null;
    };
    return {
      open: menu?.hasAttribute("open") ?? false,
      ariaExpanded: trigger?.getAttribute("aria-expanded") ?? null,
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      header: rectFor(header),
      panel: rectFor(panel),
      trigger: rectFor(trigger),
      links: links.map((link) => ({ href: link.getAttribute("href"), rect: rectFor(link) })),
    };
  });
  const failures = [];
  if (!state.open) {
    failures.push(failureFor(plan, "mobile-menu-expanded-state", "[data-mobile-nav] > summary", state, { open: true }));
  }
  if (plan.javaScriptEnabled && state.ariaExpanded !== "true") {
    failures.push(failureFor(plan, "mobile-menu-expanded-state", "[data-mobile-nav] > summary", state, { open: true, ariaExpanded: "true" }));
  }
  if (state.documentScrollWidth > state.viewportWidth + 1) {
    failures.push(failureFor(plan, "mobile-menu-open-overflow", "[data-mobile-nav]", state, { documentScrollWidthAtMost: state.viewportWidth + 1 }));
  }
  if (!state.header || !state.panel || state.panel.top < state.header.bottom - 1) {
    failures.push(failureFor(plan, "mobile-menu-header-overlap", "[data-mobile-nav] nav", {
      header: state.header,
      panel: state.panel,
    }, { panelTopAtLeast: state.header?.bottom ?? null }));
  }
  if (state.links.length !== NAVIGATION_LINK_COUNT) {
    failures.push(failureFor(plan, "mobile-menu-link-count", "[data-mobile-nav] nav", state.links.length, NAVIGATION_LINK_COUNT));
  }
  for (const [index, link] of state.links.entries()) {
    const rect = link.rect;
    const geometryPass = rect
      && rect.width >= 44
      && rect.height >= 44
      && rect.left >= -1
      && rect.right <= state.viewportWidth + 1;
    if (!geometryPass) {
      failures.push(failureFor(plan, "mobile-menu-open-target", `[data-mobile-nav] nav a:nth-of-type(${index + 1})`, rect, {
        minimumWidth: 44,
        minimumHeight: 44,
        insideViewport: true,
      }));
    }
  }
  return { state, failures };
}

async function checkMobileMenu(page, plan) {
  const failures = [];
  const summary = page.locator("[data-mobile-nav] > summary");
  if (!(await summary.isVisible())) {
    return [failureFor(plan, "mobile-menu-availability", "[data-mobile-nav] > summary", { visible: false }, { visible: true })];
  }
  await summary.focus();
  const triggerFocused = await summary.evaluate((element) => document.activeElement === element);
  if (!triggerFocused) {
    failures.push(failureFor(plan, "mobile-menu-trigger-focus", "[data-mobile-nav] > summary", triggerFocused, true));
  }
  const activationKey = plan.mutation === "keyboard-focus" ? "Space" : "Enter";
  await page.keyboard.press(activationKey);
  await page.waitForFunction(() => document.querySelector("[data-mobile-nav]")?.hasAttribute("open"));
  await page.waitForFunction(
    () => document.querySelector("[data-mobile-nav] > summary")?.getAttribute("aria-expanded") === "true",
    undefined,
    { timeout: 1_000 },
  ).catch(() => null);
  const openState = await page.evaluate(() => {
    const menu = document.querySelector("[data-mobile-nav]");
    const trigger = menu?.querySelector("summary");
    return { open: menu?.hasAttribute("open") ?? false, ariaExpanded: trigger?.getAttribute("aria-expanded") ?? null };
  });
  if (!openState.open || openState.ariaExpanded !== "true") {
    failures.push(failureFor(plan, "mobile-menu-expanded-state", "[data-mobile-nav] > summary", openState, { open: true, ariaExpanded: "true" }));
  }

  const openLayout = await collectOpenMobileMenuLayout(page, plan);
  failures.push(...openLayout.failures);

  const tabbedHrefs = [];
  for (const expectedHref of MOBILE_NAVIGATION_HREFS) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      const rect = element instanceof HTMLElement ? element.getBoundingClientRect() : null;
      return {
        href: element instanceof HTMLAnchorElement ? element.getAttribute("href") : null,
        visible: Boolean(rect && rect.width >= 1 && rect.height >= 1),
      };
    });
    tabbedHrefs.push(focused.href);
    if (focused.href !== expectedHref || !focused.visible) {
      failures.push(failureFor(plan, "mobile-menu-tab-order", "[data-mobile-nav] nav", { expectedHref, focused }, { href: expectedHref, visible: true }));
    }
  }
  if (new Set(tabbedHrefs).size !== NAVIGATION_LINK_COUNT) {
    failures.push(failureFor(plan, "mobile-menu-tab-coverage", "[data-mobile-nav] nav", tabbedHrefs, MOBILE_NAVIGATION_HREFS));
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => {
      const menu = document.querySelector("[data-mobile-nav]");
      const trigger = menu?.querySelector("summary");
      return !menu?.hasAttribute("open") && trigger?.getAttribute("aria-expanded") === "false" && document.activeElement === trigger;
    },
    undefined,
    { timeout: 1_000 },
  ).catch(() => null);
  const closeState = await page.evaluate(() => {
    const menu = document.querySelector("[data-mobile-nav]");
    const trigger = menu?.querySelector("summary");
    return {
      open: menu?.hasAttribute("open") ?? false,
      ariaExpanded: trigger?.getAttribute("aria-expanded") ?? null,
      focusReturned: document.activeElement === trigger,
    };
  });
  if (closeState.open || closeState.ariaExpanded !== "false") {
    failures.push(failureFor(plan, "mobile-menu-escape-close", "[data-mobile-nav] > summary", closeState, { open: false, ariaExpanded: "false" }));
  }
  if (!closeState.focusReturned) {
    failures.push(failureFor(plan, "mobile-menu-focus-return", "[data-mobile-nav] > summary", closeState.focusReturned, true));
  }
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  return failures;
}

async function openJavaScriptDisabledNavigation(page, plan) {
  const summary = page.locator("[data-mobile-nav] > summary");
  const failures = [];
  if (!(await summary.isVisible())) {
    failures.push(failureFor(plan, "js-disabled-navigation", "[data-mobile-nav] > summary", { visible: false }, { visible: true }));
    return { failures, state: null };
  }
  await summary.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("[data-mobile-nav]")?.hasAttribute("open"));
  const state = await page.evaluate(() => {
    const menu = document.querySelector("[data-mobile-nav]");
    const trigger = menu?.querySelector("summary");
    const links = [...(menu?.querySelectorAll("nav a[href]") ?? [])];
    const visibleLinks = links.filter((link) => {
      const rect = link.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const style = trigger instanceof HTMLElement ? getComputedStyle(trigger) : null;
    return {
      open: menu?.hasAttribute("open") ?? false,
      linkCount: links.length,
      visibleLinkCount: visibleLinks.length,
      triggerFocused: document.activeElement === trigger,
      focusVisible: trigger?.matches(":focus-visible") ?? false,
      outlineStyle: style?.outlineStyle ?? null,
      outlineWidth: style?.outlineWidth ?? null,
    };
  });
  if (!state.open || state.linkCount !== NAVIGATION_LINK_COUNT || state.visibleLinkCount !== NAVIGATION_LINK_COUNT) {
    failures.push(failureFor(plan, "js-disabled-navigation", "[data-mobile-nav] nav", state, { open: true, linkCount: NAVIGATION_LINK_COUNT, visibleLinkCount: NAVIGATION_LINK_COUNT }));
  }
  if (!state.triggerFocused || !state.focusVisible || state.outlineStyle === "none" || Number.parseFloat(state.outlineWidth ?? "0") < 2) {
    failures.push(failureFor(plan, "js-disabled-navigation-focus", "[data-mobile-nav] > summary", state, {
      triggerFocused: true,
      focusVisible: true,
      outlineStyle: "not none",
      minimumOutlineWidth: 2,
    }));
  }
  const openLayout = await collectOpenMobileMenuLayout(page, plan);
  failures.push(...openLayout.failures);
  return { failures, state: { ...state, layout: openLayout.state } };
}

async function prepareKeyboardOpenNavigationEvidence(page, plan) {
  const failures = [];
  const summary = page.locator("[data-mobile-nav] > summary");
  if (!(await summary.isVisible())) {
    return {
      failures: [failureFor(plan, "mobile-menu-evidence-availability", "[data-mobile-nav] > summary", { visible: false }, { visible: true })],
      state: null,
    };
  }
  await summary.focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelector("[data-mobile-nav]")?.hasAttribute("open"));
  await page.waitForFunction(
    () => document.querySelector("[data-mobile-nav] > summary")?.getAttribute("aria-expanded") === "true",
    undefined,
    { timeout: 1_000 },
  ).catch(() => null);
  const openLayout = await collectOpenMobileMenuLayout(page, plan);
  failures.push(...openLayout.failures);
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    const rect = element instanceof HTMLElement ? element.getBoundingClientRect() : null;
    const style = element instanceof HTMLElement ? getComputedStyle(element) : null;
    return {
      href: element instanceof HTMLAnchorElement ? element.getAttribute("href") : null,
      visible: Boolean(rect && rect.width > 0 && rect.height > 0),
      focusVisible: element instanceof HTMLElement ? element.matches(":focus-visible") : false,
      outlineStyle: style?.outlineStyle ?? null,
      outlineWidth: style?.outlineWidth ?? null,
    };
  });
  if (
    focus.href !== MOBILE_NAVIGATION_HREFS[0]
    || !focus.visible
    || !focus.focusVisible
    || focus.outlineStyle === "none"
    || Number.parseFloat(focus.outlineWidth ?? "0") < 2
  ) {
    failures.push(failureFor(plan, "mobile-menu-evidence-focus", "[data-mobile-nav] nav a:first-of-type", focus, {
      href: MOBILE_NAVIGATION_HREFS[0],
      visible: true,
      focusVisible: true,
      outlineStyle: "not none",
      minimumOutlineWidth: 2,
    }));
  }
  return { failures, state: { layout: openLayout.state, focus } };
}

async function runAxe(page, plan) {
  if (!plan.javaScriptEnabled) return { skipped: "page JavaScript intentionally disabled", violations: [], failures: [] };
  await page.addScriptTag({ content: axeCore.source });
  const result = await page.evaluate(async () => {
    const response = await window.axe.run(document.documentElement, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      resultTypes: ["violations"],
    });
    return response.violations.map((violation) => ({
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
  const failures = [];
  for (const violation of result.filter(({ impact }) => impact === "serious" || impact === "critical")) {
    for (const node of violation.nodes) {
      failures.push(
        failureFor(
          plan,
          `axe-${violation.impact}`,
          node.target.join(" "),
          { rule: violation.id, impact: violation.impact, failureSummary: node.failureSummary },
          { seriousOrCriticalViolations: 0 },
          violation.help,
        ),
      );
    }
  }
  return { violations: result, failures };
}

async function runLayoutAudit(page, plan) {
  const detected = await page.evaluate((protectedWords) => {
    const failures = [];
    const round = (value) => Number(value.toFixed(2));
    const rectJson = (rect) => ({
      left: round(rect.left),
      top: round(rect.top),
      right: round(rect.right),
      bottom: round(rect.bottom),
      width: round(rect.width),
      height: round(rect.height),
    });
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const closedDetails = element.closest("details:not([open])");
      const closedSummary = closedDetails?.querySelector(":scope > summary") ?? null;
      if (closedDetails && !closedSummary?.contains(element) && element !== closedDetails) return false;
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const selectorFor = (element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const dataKey = [...element.attributes].find((attribute) => attribute.name.startsWith("data-") && attribute.value);
      if (dataKey) return `${element.tagName.toLowerCase()}[${dataKey.name}="${CSS.escape(dataKey.value)}"]`;
      const parts = [];
      let current = element;
      while (current && current !== document.body && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        const classes = [...current.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
        if (classes) part += classes;
        else if (current.parentElement) {
          const peers = [...current.parentElement.children].filter((peer) => peer.tagName === current.tagName);
          if (peers.length > 1) part += `:nth-of-type(${peers.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(" > ") || element.tagName.toLowerCase();
    };
    const textNodes = (element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || parent.closest('[aria-hidden="true"]') || !visible(parent) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      return nodes;
    };
    const glyphRects = (element) => textNodes(element).flatMap((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    });
    const push = (type, element, measured, expected) => failures.push({
      selector: typeof element === "string" ? element : selectorFor(element),
      type,
      measured,
      expected,
    });

    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (documentWidth > document.documentElement.clientWidth + 1) {
      push("page-horizontal-overflow", "document", { scrollWidth: documentWidth, clientWidth: document.documentElement.clientWidth }, { scrollWidthAtMost: document.documentElement.clientWidth + 1 });
    }

    const allVisible = [...document.body.querySelectorAll("*")].filter(visible);
    for (const element of allVisible) {
      if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1) {
        const style = getComputedStyle(element);
        if (["auto", "scroll"].includes(style.overflowX) || element.matches("nav, ul, ol, [role=navigation]")) {
          push("nested-horizontal-overflow", element, { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflowX: style.overflowX }, { scrollWidthAtMost: element.clientWidth + 1, nestedScroller: false });
        }
      }
    }

    const textSelector = "h1, h2, h3, h4, h5, h6, p, li, a, button, summary, figcaption, label, dt, dd, blockquote, [role=heading]";
    const textElements = [...document.querySelectorAll(textSelector)].filter(visible).filter((element) => textNodes(element).length > 0);
    for (const element of textElements) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const glyphs = glyphRects(element);
      const clipsX = ["hidden", "clip", "auto", "scroll"].includes(style.overflowX);
      const clipsY = ["hidden", "clip", "auto", "scroll"].includes(style.overflowY);
      if (clipsX && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1) {
        push("text-width-clipping", element, { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflowX: style.overflowX }, { scrollWidthAtMost: element.clientWidth + 1 });
      }
      if (clipsY && element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 1) {
        push("text-height-clipping", element, { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, overflowY: style.overflowY }, { scrollHeightAtMost: element.clientHeight + 1 });
      }
      const outsideViewport = glyphs.find((glyph) => glyph.left < -1 || glyph.right > innerWidth + 1);
      if (outsideViewport) {
        push("text-outside-viewport", element, { glyph: rectJson(outsideViewport), viewport: { left: 0, right: innerWidth } }, { glyphInsideViewport: true });
      }
      if (style.display !== "inline") {
        const outsideContainer = glyphs.find((glyph) => glyph.left < rect.left - 1 || glyph.right > rect.right + 1);
        if (outsideContainer) {
          push("text-outside-container", element, { glyph: rectJson(outsideContainer), container: rectJson(rect) }, { glyphInsideContainer: true });
        }
      }
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== document.body) {
        const ancestorStyle = getComputedStyle(ancestor);
        if ([ancestorStyle.overflow, ancestorStyle.overflowX, ancestorStyle.overflowY].some((value) => value === "hidden" || value === "clip")) {
          push("text-hidden-clip-ancestor", element, { ancestor: selectorFor(ancestor), overflow: ancestorStyle.overflow, overflowX: ancestorStyle.overflowX, overflowY: ancestorStyle.overflowY }, { hiddenOrClipAncestor: false });
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }

    const displayElements = [...document.querySelectorAll("h1, h2, h3, .audience-path__copy strong, .home-domain-list strong")].filter(visible);
    for (const element of displayElements) {
      for (const node of textNodes(element)) {
        const text = node.textContent ?? "";
        for (const match of text.matchAll(/[\p{L}\p{N}’'-]+/gu)) {
          const word = match[0];
          if (word.length < 2 || (!protectedWords.includes(word.toUpperCase()) && word.length < 4)) continue;
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + word.length);
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
          if (rects.length > 1) {
            push("display-word-fragmentation", element, { word, rectCount: rects.length, rects: rects.map(rectJson) }, { rectCount: 1 });
          }
        }
      }
    }

    const interactive = [...document.querySelectorAll('a[href], button, summary, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"]')].filter(visible);
    for (const element of interactive) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 43.5 || rect.height < 43.5) {
        push("interactive-target-size", element, { width: round(rect.width), height: round(rect.height) }, { minimumWidth: 44, minimumHeight: 44 });
      }
      if (element.matches(".button, button, summary, nav a")) {
        const glyphs = glyphRects(element);
        const outside = glyphs.find((glyph) => glyph.left < rect.left - 1 || glyph.right > rect.right + 1 || glyph.top < rect.top - 1 || glyph.bottom > rect.bottom + 1);
        if (outside || element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
          push("interactive-label-overflow", element, { element: rectJson(rect), glyph: outside ? rectJson(outside) : null, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }, { labelInsideTarget: true });
        }
        const lines = [...new Set(glyphs.map((glyph) => Math.round(glyph.top)))];
        if (lines.length > 1) push("interactive-label-wrapped", element, { lineCount: lines.length }, { lineCount: 1 });
      }
    }

    const overlapCandidates = textElements.filter((element) => !element.matches("li:has(a), p:has(a), summary:has(*)"));
    const overlapGlyphs = new Map(overlapCandidates.map((element) => [element, glyphRects(element)]));
    for (let leftIndex = 0; leftIndex < overlapCandidates.length; leftIndex += 1) {
      const left = overlapCandidates[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < overlapCandidates.length; rightIndex += 1) {
        const right = overlapCandidates[rightIndex];
        if (left.contains(right) || right.contains(left)) continue;
        let intersection = null;
        for (const leftGlyph of overlapGlyphs.get(left) ?? []) {
          for (const rightGlyph of overlapGlyphs.get(right) ?? []) {
            const overlapWidth = Math.min(leftGlyph.right, rightGlyph.right) - Math.max(leftGlyph.left, rightGlyph.left);
            const overlapHeight = Math.min(leftGlyph.bottom, rightGlyph.bottom) - Math.max(leftGlyph.top, rightGlyph.top);
            if (overlapWidth > 1 && overlapHeight > 1) {
              intersection = { leftGlyph, rightGlyph, overlapWidth, overlapHeight };
              break;
            }
          }
          if (intersection) break;
        }
        if (intersection) {
          push("text-block-overlap", left, {
            with: selectorFor(right),
            overlapWidth: round(intersection.overlapWidth),
            overlapHeight: round(intersection.overlapHeight),
            firstGlyph: rectJson(intersection.leftGlyph),
            secondGlyph: rectJson(intersection.rightGlyph),
          }, { overlapWidth: 0, overlapHeight: 0 });
        }
      }
    }

    return failures;
  }, PROTECTED_DISPLAY_WORDS);

  return detected.map((item) => failureFor(plan, item.type, item.selector, item.measured, item.expected));
}

async function captureScreenshot(page, plan, captureRoot, sequence) {
  if (!plan.capture) return null;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(30);
  const filename = `${String(sequence).padStart(3, "0")}--${plan.id.replace(/[^a-z0-9-]+/gi, "-")}.png`;
  const destination = path.resolve(captureRoot, filename);
  await page.screenshot({
    path: destination,
    type: "png",
    fullPage: false,
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  const bytes = await readFile(destination);
  return {
    id: plan.id,
    route: plan.route.path,
    viewport: { id: plan.viewport.id, width: plan.viewport.width, height: plan.viewport.height },
    scenario: plan.scenario,
    label: plan.capture.label,
    groups: plan.capture.groups,
    groupOrder: plan.capture.groupOrder,
    filename,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function runCase(browser, plan, baseUrl, captureRoot, screenshotSequence) {
  const started = Date.now();
  const context = await browser.newContext({
    viewport: { width: plan.viewport.width, height: plan.viewport.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: plan.reducedMotion,
    javaScriptEnabled: plan.javaScriptEnabled,
    locale: "en-US",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  const responseFailures = [];
  const externalRequests = [];
  const baseOrigin = new URL(baseUrl).origin;
  const pageUrl = new URL(plan.route.path, `${baseUrl}/`).toString();

  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text(), location: message.location() });
    }
  });
  page.on("pageerror", (error) => pageErrors.push({ name: error.name, message: error.message, stack: error.stack ?? null }));
  page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), resourceType: request.resourceType(), failure: request.failure()?.errorText ?? "unknown" }));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      let responsePath = null;
      try {
        responsePath = new URL(response.url()).pathname.replace(/\/+$/, "") || "/";
      } catch {
        // Keep the response as a failure when its URL cannot be parsed.
      }
      const isExpected404Document = plan.route.id === "404" && response.request().isNavigationRequest() && responsePath === "/404";
      if (!isExpected404Document) responseFailures.push({ url: response.url(), status: response.status(), statusText: response.statusText(), resourceType: response.request().resourceType() });
    }
  });
  page.on("request", (request) => {
    let url;
    try {
      url = new URL(request.url());
    } catch {
      return;
    }
    if (/^https?:$/.test(url.protocol) && url.origin !== baseOrigin) {
      externalRequests.push({ url: request.url(), resourceType: request.resourceType() });
    }
  });

  const failures = [];
  let response = null;
  let mutation = null;
  let navigation = null;
  let mobileH1Authority = { applicable: false };
  let homeSceneContract = { applicable: false };
  let axe = { skipped: "navigation did not complete", violations: [], failures: [] };
  let screenshot = null;
  try {
    debug(plan, "navigate");
    response = await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!response) throw new Error("navigation returned no main-document response");
    const acceptableStatus = response.status() < 400 || (plan.route.id === "404" && response.status() === 404);
    if (!acceptableStatus) {
      failures.push(failureFor(plan, "route-status", "document", response.status(), plan.route.id === "404" ? [200, 404] : 200));
    }
    debug(plan, "settle");
    await withTimeout(settlePage(page, plan.javaScriptEnabled), 20_000, `${plan.id} page settling`);
    debug(plan, "mutation");
    mutation = await applyMutation(page, plan.mutation);
    if (plan.mutation === "fallback-fonts") {
      failures.push(...collectFontFamilyFailures(plan, mutation));
    }

    debug(plan, "navigation checks");
    const navigationResult = await collectNavigationFailures(page, plan);
    navigation = navigationResult.state;
    failures.push(...navigationResult.failures);
    debug(plan, "axe");
    axe = await withTimeout(runAxe(page, plan), 20_000, `${plan.id} axe`);
    failures.push(...axe.failures);
    debug(plan, "layout audit");
    if (plan.javaScriptEnabled) {
      failures.push(...(await withTimeout(runLayoutAudit(page, plan), 20_000, `${plan.id} layout audit`)));
    }
    debug(plan, "mobile H1 authority");
    const mobileH1Result = await withTimeout(collectMobileH1Authority(page, plan), 10_000, `${plan.id} mobile H1 authority`);
    mobileH1Authority = mobileH1Result.state;
    failures.push(...mobileH1Result.failures);
    debug(plan, "Home scene contract");
    const homeSceneResult = await withTimeout(collectHomeSceneContract(page, plan), 10_000, `${plan.id} Home scene contract`);
    homeSceneContract = homeSceneResult.state;
    failures.push(...homeSceneResult.failures);

    if (plan.runSkipLink) {
      debug(plan, "skip link");
      failures.push(...(await withTimeout(checkSkipLink(page, plan), 10_000, `${plan.id} skip link`)));
    }
    if (plan.runMobileMenu) {
      debug(plan, "mobile menu");
      failures.push(...(await withTimeout(checkMobileMenu(page, plan), 10_000, `${plan.id} mobile menu`)));
    }

    if (plan.mutation === "keyboard-focus") {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      await page.keyboard.press("Tab");
      const focusState = await page.evaluate(() => {
        const element = document.activeElement;
        const style = element instanceof HTMLElement ? getComputedStyle(element) : null;
        return {
          className: element instanceof HTMLElement ? element.className : null,
          outlineStyle: style?.outlineStyle ?? null,
          outlineWidth: style?.outlineWidth ?? null,
        };
      });
      mutation = { applied: true, focusState };
      if (focusState.outlineStyle === "none" || Number.parseFloat(focusState.outlineWidth ?? "0") < 2) {
        failures.push(failureFor(plan, "keyboard-focus-visible", ".skip-link", focusState, { outlineStyle: "not none", minimumOutlineWidth: 2 }));
      }
    }
    if (plan.mutation === "js-disabled-nav") {
      const noJavaScriptNavigation = await openJavaScriptDisabledNavigation(page, plan);
      failures.push(...noJavaScriptNavigation.failures);
      mutation = { applied: true, pageJavaScriptEnabled: false, openNavigationEvidence: noJavaScriptNavigation.state };
    }
    if (plan.id === "keyboard-focus-mobile") {
      const openNavigationEvidence = await prepareKeyboardOpenNavigationEvidence(page, plan);
      failures.push(...openNavigationEvidence.failures);
      mutation = { ...mutation, openNavigationEvidence: openNavigationEvidence.state };
    }

    debug(plan, "screenshot");
    screenshot = await withTimeout(captureScreenshot(page, plan, captureRoot, screenshotSequence), 20_000, `${plan.id} screenshot`);
  } catch (error) {
    failures.push(failureFor(plan, "case-execution", "document", { name: error.name, message: error.message }, { completed: true }));
  } finally {
    for (const entry of consoleMessages.filter(({ type }) => type === "error")) {
      let consolePath = null;
      try {
        consolePath = entry.location?.url ? new URL(entry.location.url).pathname.replace(/\/+$/, "") || "/" : null;
      } catch {
        // Preserve console errors whose source URL cannot be parsed.
      }
      const isExpected404Console = plan.route.id === "404"
        && consolePath === "/404"
        && /^Failed to load resource:.*\b404\b/i.test(entry.text);
      if (isExpected404Console) continue;
      failures.push(failureFor(plan, "console-error", entry.location?.url || "console", entry, { errors: 0 }));
    }
    for (const entry of pageErrors) failures.push(failureFor(plan, "page-error", "window", entry, { errors: 0 }));
    for (const entry of requestFailures) failures.push(failureFor(plan, "request-failure", entry.url, entry, { failures: 0 }));
    for (const entry of responseFailures) failures.push(failureFor(plan, "http-response-failure", entry.url, entry, { statusBelow: 400 }));
    for (const entry of externalRequests) {
      failures.push(failureFor(plan, "external-runtime-request", entry.url, entry, { origin: baseOrigin, externalFontOrRuntimeRequests: 0 }));
    }
    await context.close();
  }

  return {
    id: plan.id,
    route: plan.route.path,
    scenario: plan.scenario,
    viewport: plan.viewport,
    url: pageUrl,
    javaScriptEnabled: plan.javaScriptEnabled,
    reducedMotion: plan.reducedMotion,
    responseStatus: response?.status() ?? null,
    durationMs: Date.now() - started,
    mutation,
    navigation,
    mobileH1Authority,
    homeSceneContract,
    consoleMessages,
    pageErrors,
    requestFailures,
    responseFailures,
    externalRequests,
    axe: { ...(axe.skipped ? { skipped: axe.skipped } : {}), violations: axe.violations },
    failures,
    status: failures.length === 0 ? "PASS" : "FAIL",
    ...(screenshot ? { screenshot } : {}),
  };
}

async function checkUnknownPath(browser, baseUrl) {
  const route = { id: "unknown", path: "/__phase1-intentionally-missing__", currentHref: null };
  const viewport = VIEWPORT_BY_ID.get("desktop-1440x900");
  const plan = { route, viewport };
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, javaScriptEnabled: true, serviceWorkers: "block" });
  const page = await context.newPage();
  const failures = [];
  try {
    const response = await page.goto(new URL(route.path, `${baseUrl}/`).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    const state = await page.evaluate(() => ({
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
    }));
    if (response?.status() !== 404) failures.push(failureFor(plan, "unknown-route-status", "document", response?.status() ?? null, 404));
    if (!state.h1 || !/signal goes nowhere/i.test(state.h1)) failures.push(failureFor(plan, "unknown-route-content", "h1", state.h1, "Phase 1 404 heading"));
    if (!state.robots?.toLowerCase().includes("noindex")) failures.push(failureFor(plan, "unknown-route-indexing", 'meta[name="robots"]', state.robots, "contains noindex"));
    return { route: route.path, viewport, responseStatus: response?.status() ?? null, state, failures, status: failures.length ? "FAIL" : "PASS" };
  } catch (error) {
    failures.push(failureFor(plan, "unknown-route-execution", "document", { name: error.name, message: error.message }, { completed: true }));
    return { route: route.path, viewport, failures, status: "FAIL" };
  } finally {
    await context.close();
  }
}

async function dependencyVersions() {
  const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const versions = {};
  for (const dependency of ["playwright-core", "axe-core", "sharp"]) {
    const version = packageJson.devDependencies?.[dependency] ?? packageJson.dependencies?.[dependency];
    if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error(`${dependency} must be pinned to an exact version in package.json`);
    }
    versions[dependency] = version;
  }
  return versions;
}

async function productionTargetBinding(options) {
  const serverMode = options.serverMode ?? process.env.PHASE1_SERVER_MODE ?? null;
  if (!options.smoke && serverMode !== "astro-preview") {
    throw new Error("Full Phase 1 browser QA must declare --server-mode astro-preview and run against the built production preview");
  }
  const buildReportBytes = await readFile(BUILD_REPORT);
  const buildReport = JSON.parse(buildReportBytes.toString("utf8"));
  const launchRoutes = Array.isArray(buildReport.routes)
    ? buildReport.routes.filter((route) => route.path !== "/404/")
    : [];
  const includes404 = Array.isArray(buildReport.routes)
    && buildReport.routes.some((route) => route.path === "/404/" && route.output === "404.html");
  if (buildReport.passed !== true || launchRoutes.length !== 9 || !includes404) {
    throw new Error("Phase 1 build report must be a passing nine-route production verification before browser QA");
  }
  return {
    serverMode: serverMode ?? "unspecified-smoke-target",
    buildReport: {
      filename: path.basename(BUILD_REPORT),
      sha256: createHash("sha256").update(buildReportBytes).digest("hex"),
      generatedAt: buildReport.generatedAt,
      verifiedLaunchRoutes: launchRoutes.length,
      verified404: includes404,
      verifiedOutputFiles: buildReport.sizes?.fileCount ?? null,
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  let cases = buildCases(options.smoke);
  if (options.match) {
    const matcher = new RegExp(options.match, "i");
    cases = cases.filter(({ id }) => matcher.test(id));
    if (cases.length === 0) throw new Error(`--match selected no cases: ${options.match}`);
  }
  if (options.list) {
    const counts = planCounts(cases);
    for (const plannedCase of cases) {
      console.log(`${plannedCase.id}\t${plannedCase.route.path}\t${plannedCase.viewport.width}x${plannedCase.viewport.height}\t${plannedCase.capture ? "capture" : "report"}`);
    }
    console.log(
      `${counts.total} cases: ${counts.baseline} baseline, ${counts.fallbackFontMatrix} fallback-font matrix, ${counts.retainedStress} retained stress; ${counts.curatedCaptures} curated captures.`,
    );
    return;
  }
  const filteredReportAliasesCanonical = options.match && options.report
    ? await canonicalPathKey(options.report) === await canonicalPathKey(DEFAULT_REPORT)
    : false;
  if (options.match && (!options.report || filteredReportAliasesCanonical)) {
    throw new Error("A filtered --match run requires a non-canonical --report path");
  }

  const baseUrl = normalizeBaseUrl(process.env.PHASE1_BASE_URL ?? DEFAULT_BASE_URL);
  const versions = await dependencyVersions();
  const target = await productionTargetBinding(options);
  const chrome = await resolveChrome(options.browser);
  const captureRoot = await mkdtemp(path.join(tmpdir(), "quantum-phase1-qa-"));
  const reportPath = path.resolve(options.report ?? (options.smoke ? path.join(captureRoot, "phase-1-browser-smoke-report.json") : DEFAULT_REPORT));
  const browser = await chromium.launch({
    executablePath: chrome.executablePath,
    headless: true,
    args: ["--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--no-first-run"],
  });
  const browserIdentity = { name: chrome.name, version: browser.version() };

  const caseReports = [];
  let screenshotSequence = 1;
  let unknownPath = null;
  try {
    for (let index = 0; index < cases.length; index += 1) {
      const plan = cases[index];
      console.log(`[${index + 1}/${cases.length}] ${plan.id}`);
      const report = await runCase(browser, plan, baseUrl, captureRoot, screenshotSequence);
      if (report.screenshot) screenshotSequence += 1;
      caseReports.push(report);
    }
    unknownPath = await checkUnknownPath(browser, baseUrl);
  } finally {
    await browser.close();
  }

  const screenshots = caseReports.flatMap((report) => (report.screenshot ? [report.screenshot] : []));
  const failures = [...caseReports.flatMap((report) => report.failures), ...(unknownPath?.failures ?? [])];
  const seriousOrCritical = failures.filter(({ type }) => type === "axe-serious" || type === "axe-critical");
  const counts = planCounts(cases);
  const report = {
    schemaVersion: 2,
    authority: "phase-1-browser-qa",
    generatedAt: new Date().toISOString(),
    mode: options.smoke ? "smoke" : "full",
    baseUrl,
    target,
    captureSessionId: path.basename(captureRoot),
    rawCapturePolicy: "Raw captures remain in a unique OS temp session; this report stores portable basenames and hashes only.",
    dependencies: versions,
    browser: browserIdentity,
    routes: ROUTES,
    requiredViewports: REQUIRED_VIEWPORTS,
    boundaryViewports: BOUNDARY_VIEWPORTS,
    protectedDisplayWords: PROTECTED_DISPLAY_WORDS,
    cases: caseReports,
    unknownPath,
    screenshots,
    failures,
    summary: {
      status: failures.length === 0 ? "PASS" : "FAIL",
      cases: caseReports.length,
      passingCases: caseReports.filter(({ status }) => status === "PASS").length,
      failingCases: caseReports.filter(({ status }) => status === "FAIL").length,
      curatedScreenshots: screenshots.length,
      baselineCases: counts.baseline,
      fallbackFontMatrixCases: counts.fallbackFontMatrix,
      retainedStressCases: counts.retainedStress,
      totalFailures: failures.length,
      seriousOrCriticalAxeFailures: seriousOrCritical.length,
      consoleErrors: failures.filter(({ type }) => type === "console-error").length,
      requestFailures: failures.filter(({ type }) => type === "request-failure" || type === "http-response-failure").length,
      externalRuntimeRequests: failures.filter(({ type }) => type === "external-runtime-request").length,
    },
  };

  assertPortableReport(report, [ROOT, reportPath, captureRoot, chrome.executablePath, tmpdir()]);
  await atomicWriteJson(reportPath, report);
  console.log(`Report: ${reportPath}`);
  console.log(`Curated raw captures retained at: ${captureRoot}`);
  console.log(`${report.summary.status}: ${report.summary.passingCases}/${report.summary.cases} cases passed; ${report.summary.totalFailures} failures.`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Phase 1 browser QA stopped: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
