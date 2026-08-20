#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_FILENAME = "phase-3-entry-capture-report.json";
const HORIZONTAL_OVERFLOW_TOLERANCE_CSS_PX = 1;

const VIEWPORTS = Object.freeze([
  { id: "desktop-1440x900", width: 1440, height: 900 },
  { id: "short-desktop-1366x650", width: 1366, height: 650 },
  { id: "desktop-1280x800", width: 1280, height: 800 },
  { id: "tablet-landscape-1024x768", width: 1024, height: 768 },
  { id: "mobile-390x844", width: 390, height: 844 },
  { id: "mobile-360x800", width: 360, height: 800 },
  { id: "narrow-320x800", width: 320, height: 800 },
  { id: "mobile-landscape-844x390", width: 844, height: 390 },
]);

const SELECTORS = Object.freeze({
  header: ".site-header",
  entry: "#entry",
  raster: ".entry-field__raster",
  h1: "#home-title",
  routeGroup: ".entry-paths",
  industryRoute: '[data-entry-path="industry"]',
  startupRoute: '[data-entry-path="startup"]',
});

const STYLE_PROPERTIES = Object.freeze({
  header: [
    "position",
    "z-index",
    "height",
    "min-height",
    "border-bottom-width",
    "border-bottom-style",
    "border-bottom-color",
    "background-color",
    "backdrop-filter",
  ],
  entry: [
    "display",
    "position",
    "height",
    "min-height",
    "overflow",
    "overflow-x",
    "overflow-y",
    "background-color",
  ],
  raster: [
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "width",
    "height",
    "border-top-width",
    "border-top-style",
    "border-top-color",
    "background-color",
    "background-image",
    "opacity",
    "transform",
  ],
  h1: [
    "display",
    "width",
    "max-width",
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "letter-spacing",
    "text-align",
    "text-transform",
    "white-space",
    "overflow-wrap",
    "word-break",
    "hyphens",
  ],
  routeGroup: [
    "display",
    "grid-template-columns",
    "grid-template-rows",
    "gap",
    "row-gap",
    "column-gap",
  ],
  route: [
    "display",
    "position",
    "grid-template-columns",
    "grid-template-rows",
    "gap",
    "row-gap",
    "column-gap",
    "min-width",
    "min-height",
    "padding-top",
    "padding-bottom",
    "border-top-width",
    "border-top-style",
    "border-top-color",
    "color",
    "font-family",
    "text-align",
  ],
  routePseudo: [
    "display",
    "position",
    "top",
    "right",
    "left",
    "width",
    "height",
    "background-color",
    "opacity",
    "transform",
  ],
  routeText: [
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "text-align",
    "grid-column",
    "grid-row",
    "justify-self",
    "align-self",
  ],
});

function parseArguments(argv) {
  const options = { url: null, output: null, chromium: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    if (argument === "--url") options.url = next();
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--chromium") options.chromium = path.resolve(next());
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 3 frozen Phase 2B ENTRY evidence capture

Usage:
  node scripts/capture-phase3-entry-evidence.mjs \\
    --url <homepage-url> \\
    --output <evidence-directory> \\
    [--chromium <executable>]

Required:
  --url URL          Actual built/previewed Phase 2B homepage URL
  --output DIR       Explicit destination for eight PNGs and ${REPORT_FILENAME}

Optional:
  --chromium FILE    Explicit Chrome/Chromium executable; otherwise use Playwright's browser
  --help, -h         Show this help without launching a browser or writing output

The output directory must not be src, public, or dist. The script captures only
scrollY=0 at DPR 1 and fails if required ENTRY nodes/fonts are missing or if the
page has more than ${HORIZONTAL_OVERFLOW_TOLERANCE_CSS_PX} CSS px of horizontal overflow.
`);
}

function publicUrl(value) {
  const parsed = new URL(value);
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("--url must use http or https");
  }
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return parsed.toString();
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateOutputRoot(output) {
  if (!output) throw new Error("--output is required and must be explicit");
  if (output === ROOT) throw new Error("--output must not be the repository root");
  for (const productionRoot of ["src", "public", "dist"].map((name) => path.join(ROOT, name))) {
    if (isWithin(productionRoot, output)) {
      throw new Error(`--output must remain outside production root ${path.relative(ROOT, productionRoot)}`);
    }
  }
}

async function validateChromium(executable) {
  if (!executable) return;
  await access(executable, fsConstants.X_OK);
  if (!(await stat(executable)).isFile()) throw new Error(`--chromium is not a file: ${executable}`);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Chromium screenshot is not a valid PNG");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function replaceFile(temporary, destination) {
  await unlink(destination).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  await rename(temporary, destination);
}

async function atomicWrite(destination, bytes) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try {
    await replaceFile(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function settleEntry(page) {
  await page.waitForFunction(() => document.readyState === "complete", null, { timeout: 30_000 });
  await page.evaluate(async () => {
    const bounded = (promise, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${label} did not settle within 10 seconds`)), 10_000),
        ),
      ]);
    if (document.fonts) await bounded(document.fonts.ready, "document fonts");
    const visibleImages = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
    });
    await bounded(
      Promise.all(visibleImages.map((image) => image.decode().catch(() => undefined))),
      "visible images",
    );
  });
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded", null, {
    timeout: 10_000,
  });
  await page.evaluate(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(80);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
}

async function measureEntry(page) {
  return page.evaluate(
    ({ selectors, styleProperties, overflowTolerance }) => {
      const round = (value) => (Number.isFinite(value) ? Number(value.toFixed(3)) : null);
      const rectangle = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: round(rect.x),
          y: round(rect.y),
          width: round(rect.width),
          height: round(rect.height),
          top: round(rect.top),
          right: round(rect.right),
          bottom: round(rect.bottom),
          left: round(rect.left),
        };
      };
      const styles = (element, properties, pseudo = null) => {
        const computed = getComputedStyle(element, pseudo);
        return Object.fromEntries(properties.map((property) => [property, computed.getPropertyValue(property).trim()]));
      };
      const required = (selector, label) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) throw new Error(`Missing ${label}: ${selector}`);
        return element;
      };
      const node = (selector, label, properties) => {
        const element = required(selector, label);
        return {
          selector,
          rect: rectangle(element),
          styles: styles(element, properties),
        };
      };
      const route = (selector, label) => {
        const element = required(selector, label);
        const textRecord = (childSelector) => {
          const child = element.querySelector(childSelector);
          if (!(child instanceof HTMLElement)) throw new Error(`Missing ${label} child: ${childSelector}`);
          return {
            text: child.textContent?.trim() ?? "",
            rect: rectangle(child),
            styles: styles(child, styleProperties.routeText),
          };
        };
        return {
          selector,
          href: element.getAttribute("href"),
          rect: rectangle(element),
          styles: styles(element, styleProperties.route),
          before: styles(element, styleProperties.routePseudo, "::before"),
          audience: textRecord(".entry-path__audience"),
          statement: textRecord(".entry-path__statement"),
          direction: textRecord(".entry-path__direction"),
        };
      };

      const header = required(selectors.header, "header");
      const entry = required(selectors.entry, "ENTRY section");
      const h1 = required(selectors.h1, "ENTRY H1");
      const raster = required(selectors.raster, "ENTRY raster");
      const root = document.documentElement;
      const body = document.body;
      const horizontalOverflow = Math.max(
        0,
        Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth,
      );
      const relevantFamilies = new Set(["syne", "newsreader", "inter"]);
      const fontFaces = document.fonts
        ? [...document.fonts]
            .filter((face) => relevantFamilies.has(String(face.family).replaceAll('"', "").toLowerCase()))
            .map((face) => ({
              family: String(face.family).replaceAll('"', ""),
              style: face.style,
              weight: face.weight,
              status: face.status,
            }))
            .sort((left, right) =>
              `${left.family}\u0000${left.weight}\u0000${left.style}`.localeCompare(
                `${right.family}\u0000${right.weight}\u0000${right.style}`,
              ),
            )
        : [];
      const fontChecks = {
        syne800: document.fonts?.check('800 64px "Syne"', "WHERE DO YOU ENTER?") ?? false,
        newsreader400: document.fonts?.check('400 16px "Newsreader"', "Bring us a challenge") ?? false,
        inter600: document.fonts?.check('600 16px "Inter"', "For industry") ?? false,
      };

      return {
        page: {
          title: document.title,
          bodyClass: body.className,
          entryScene: entry.getAttribute("data-home-scene"),
          h1Text: h1.textContent?.replace(/\s+/g, " ").trim() ?? "",
          readyState: document.readyState,
        },
        devicePixelRatio: round(window.devicePixelRatio),
        scroll: { x: round(window.scrollX), y: round(window.scrollY) },
        fonts: {
          status: document.fonts?.status ?? "unsupported",
          checks: fontChecks,
          relevantFaces: fontFaces,
          pass:
            (document.fonts?.status ?? "unsupported") === "loaded" &&
            Object.values(fontChecks).every(Boolean) &&
            fontFaces.length >= 3 &&
            fontFaces.every((face) => face.status === "loaded"),
        },
        horizontalOverflow: {
          documentClientWidth: root.clientWidth,
          documentScrollWidth: root.scrollWidth,
          bodyScrollWidth: body.scrollWidth,
          overflowCssPx: round(horizontalOverflow),
          toleranceCssPx: overflowTolerance,
          pass: horizontalOverflow <= overflowTolerance,
        },
        elements: {
          header: {
            selector: selectors.header,
            rect: rectangle(header),
            styles: styles(header, styleProperties.header),
          },
          entry: {
            selector: selectors.entry,
            rect: rectangle(entry),
            styles: styles(entry, styleProperties.entry),
          },
          raster: {
            selector: selectors.raster,
            rect: rectangle(raster),
            styles: styles(raster, styleProperties.raster),
          },
          h1: {
            selector: selectors.h1,
            text: h1.textContent?.replace(/\s+/g, " ").trim() ?? "",
            rect: rectangle(h1),
            spanRects: [...h1.querySelectorAll("span")].map((span) => ({
              text: span.textContent?.trim() ?? "",
              rect: rectangle(span),
            })),
            styles: styles(h1, styleProperties.h1),
          },
          routeGroup: node(selectors.routeGroup, "ENTRY route group", styleProperties.routeGroup),
          routes: {
            industry: route(selectors.industryRoute, "industry route"),
            startup: route(selectors.startupRoute, "startup route"),
          },
        },
      };
    },
    {
      selectors: SELECTORS,
      styleProperties: STYLE_PROPERTIES,
      overflowTolerance: HORIZONTAL_OVERFLOW_TOLERANCE_CSS_PX,
    },
  );
}

function validateMeasurement(viewport, measurement) {
  const failures = [];
  if (measurement.devicePixelRatio !== 1) failures.push("device-pixel-ratio-is-not-1");
  if (measurement.scroll.x !== 0 || measurement.scroll.y !== 0) failures.push("scroll-position-is-not-zero");
  if (!measurement.fonts.pass) failures.push("required-local-fonts-not-loaded");
  if (!measurement.horizontalOverflow.pass) failures.push("horizontal-overflow");
  if (!String(measurement.page.bodyClass).split(/\s+/).includes("home-page")) {
    failures.push("page-is-not-home-page");
  }
  if (measurement.page.entryScene !== "entry") failures.push("entry-scene-authority-missing");
  if (measurement.page.h1Text.toUpperCase() !== "WHERE DO YOU ENTER?") failures.push("entry-h1-copy-drift");
  if (measurement.elements.routes.industry.href !== "/for-partners/") failures.push("industry-route-drift");
  if (measurement.elements.routes.startup.href !== "/for-startups/") failures.push("startup-route-drift");
  return failures.map((failure) => ({ viewport: viewport.id, failure }));
}

async function captureViewport(browser, options, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    locale: "en-US",
    reducedMotion: "no-preference",
    timezoneId: "UTC",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));

  try {
    const response = await page.goto(options.url, { waitUntil: "networkidle", timeout: 30_000 });
    if (!response || !response.ok()) {
      throw new Error(`Homepage returned HTTP ${response?.status() ?? "no-response"} at ${options.url}`);
    }
    await settleEntry(page);
    const screenshotBuffer = await page.screenshot({
      type: "png",
      fullPage: false,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
    const dimensions = pngDimensions(screenshotBuffer);
    if (dimensions.width !== viewport.width || dimensions.height !== viewport.height) {
      throw new Error(
        `${viewport.id} screenshot is ${dimensions.width}x${dimensions.height}; expected ${viewport.width}x${viewport.height}`,
      );
    }
    const measurement = await measureEntry(page);
    const screenshotFilename = `phase-3-entry-${viewport.id}.png`;
    await atomicWrite(path.join(options.output, screenshotFilename), screenshotBuffer);
    const failures = [
      ...validateMeasurement(viewport, measurement),
      ...consoleErrors.map((message) => ({ viewport: viewport.id, failure: "console-error", message })),
      ...pageErrors.map((message) => ({ viewport: viewport.id, failure: "page-error", message })),
    ];
    return {
      id: viewport.id,
      viewport: { width: viewport.width, height: viewport.height },
      dpr: measurement.devicePixelRatio,
      fonts: measurement.fonts,
      screenshot: {
        filename: screenshotFilename,
        width: dimensions.width,
        height: dimensions.height,
        bytes: screenshotBuffer.length,
        sha256: sha256(screenshotBuffer),
      },
      scrollY: measurement.scroll.y,
      horizontalOverflow: measurement.horizontalOverflow,
      page: measurement.page,
      elements: measurement.elements,
      runtime: { consoleErrors, pageErrors },
      failures,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.url) throw new Error("--url is required and must point to the actual Phase 2B homepage");
  options.url = publicUrl(options.url);
  validateOutputRoot(options.output);
  await validateChromium(options.chromium);
  await mkdir(options.output, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: options.chromium ?? undefined,
    timeout: 20_000,
  });
  const browserVersion = browser.version();
  const captures = [];
  try {
    for (const viewport of VIEWPORTS) {
      const capture = await captureViewport(browser, options, viewport);
      captures.push(capture);
      process.stdout.write(`Captured ${capture.id}: ${capture.screenshot.bytes} bytes\n`);
    }
  } finally {
    await browser.close();
  }

  const failures = captures.flatMap((capture) => capture.failures);
  const report = {
    schema: "quantum-hub.phase-3-entry-responsive-evidence.v1",
    status: failures.length === 0 ? "PASS" : "FAIL",
    authority: "actual-frozen-phase-2b-homepage-at-scrollY-0",
    url: options.url,
    browser: { product: "Chromium", version: browserVersion },
    capturePolicy: {
      viewportCount: VIEWPORTS.length,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "no-preference",
      animationsDisabledForScreenshot: true,
      horizontalOverflowToleranceCssPx: HORIZONTAL_OVERFLOW_TOLERANCE_CSS_PX,
      outputDestinationWasExplicit: true,
      productionFilesWritten: false,
    },
    selectors: SELECTORS,
    captures,
    failures,
  };
  const reportPath = path.join(options.output, REPORT_FILENAME);
  await atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `Phase 3 ENTRY evidence ${report.status}: ${VIEWPORTS.length} viewports; report ${reportPath}\n`,
  );
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Phase 3 ENTRY evidence capture failed: ${error.message}\n`);
  process.exitCode = 1;
});
