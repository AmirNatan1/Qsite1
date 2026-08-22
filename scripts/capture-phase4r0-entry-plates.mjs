#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_URL = "http://127.0.0.1:4334/";
const DEFAULT_TIMEOUT_MS = 20_000;
const MANIFEST_FILENAME = "phase-4r0-entry-plates-manifest.json";
const EXPECTED_H1 = "Where do you enter?";
const EXPECTED_ROUTE_PATHS = Object.freeze(["/for-partners/", "/for-startups/"]);

const RUNTIME_AUTHORITY_PATHS = Object.freeze([
  "src/pages/index.astro",
  "src/components/home/EntryField.astro",
  "src/scripts/home-cinematic-integration.ts",
  "src/styles/routes/home.css",
  "src/styles/routes/home-cinematic.css",
  "src/styles/routes/home-responsive.css",
]);

const VIEWPORTS = Object.freeze([
  { id: "desktop-1440x900", width: 1440, height: 900, required: true, expectedFamily: "desktop" },
  { id: "short-height-1366x650", width: 1366, height: 650, required: true, expectedFamily: "desktop" },
  { id: "desktop-1280x800", width: 1280, height: 800, required: true, expectedFamily: "desktop" },
  { id: "tablet-landscape-1024x768", width: 1024, height: 768, required: true, expectedFamily: "desktop" },
  { id: "tablet-portrait-768x1024", width: 768, height: 1024, required: true, expectedFamily: "mobile" },
  { id: "mobile-390x844", width: 390, height: 844, required: true, expectedFamily: "mobile" },
  { id: "mobile-360x800", width: 360, height: 800, required: true, expectedFamily: "mobile" },
  { id: "narrow-320x800", width: 320, height: 800, required: true, expectedFamily: "mobile" },
  {
    id: "mobile-landscape-844x390",
    width: 844,
    height: 390,
    required: true,
    expectedFamily: "mobile",
    shortLandscapeOverride: true,
  },
  {
    id: "short-landscape-neighbor-740x360",
    width: 740,
    height: 360,
    required: false,
    expectedFamily: "mobile",
    shortLandscapeOverride: true,
  },
  {
    id: "short-landscape-neighbor-800x360",
    width: 800,
    height: 360,
    required: false,
    expectedFamily: "mobile",
    shortLandscapeOverride: true,
  },
  {
    id: "short-landscape-neighbor-896x414",
    width: 896,
    height: 414,
    required: false,
    expectedFamily: "mobile",
    shortLandscapeOverride: true,
  },
  {
    id: "short-landscape-neighbor-900x480",
    width: 900,
    height: 480,
    required: false,
    expectedFamily: "mobile",
    shortLandscapeOverride: true,
  },
]);

/*
 * This style is injected into the Playwright document only. It never enters dist
 * or source CSS. The selector requires a capture-only root marker, and every
 * declaration is scoped to ENTRY. It composes short landscape as two columns,
 * stacks the two route destinations, and trims component-local spacing/type.
 * There is deliberately no html/body/root font-size or zoom transform.
 */
const SHORT_LANDSCAPE_PREVIEW_CSS = String.raw`
html[data-phase4r0-entry-plate="short-landscape"] .cinematic-shell > .entry-field {
  min-height: calc(100svh - var(--cinematic-header-px, 100.25px)) !important;
}

html[data-phase4r0-entry-plate="short-landscape"] .entry-field__content {
  width: min(calc(100% - (2 * clamp(1.25rem, 4vw, 3rem))), 84rem) !important;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr) !important;
  grid-template-rows: auto minmax(0, 1fr) !important;
  gap: clamp(0.3rem, 1.4vh, 0.6rem) clamp(1.25rem, 4vw, 2.75rem) !important;
  padding-block: clamp(0.48rem, 1.8vh, 0.82rem) !important;
}

html[data-phase4r0-entry-plate="short-landscape"] .entry-field__content > .field-label {
  grid-column: 1 / -1 !important;
  grid-row: 1 !important;
}

html[data-phase4r0-entry-plate="short-landscape"] .entry-field h1 {
  grid-column: 1 !important;
  grid-row: 2 !important;
  align-self: center !important;
  width: 100% !important;
  max-width: none !important;
  font-size: clamp(2.55rem, 6.35vw, 3.7rem) !important;
  line-height: 0.78 !important;
  text-align: left !important;
}

html[data-phase4r0-entry-plate="short-landscape"] .entry-paths {
  grid-column: 2 !important;
  grid-row: 2 !important;
  align-self: center !important;
  grid-template-columns: minmax(0, 1fr) !important;
  gap: 0 !important;
}

html[data-phase4r0-entry-plate="short-landscape"] .entry-path {
  min-height: 0 !important;
  grid-template-columns: minmax(0, 1fr) auto !important;
  grid-template-rows: auto auto !important;
  column-gap: clamp(0.75rem, 2vw, 1.25rem) !important;
  padding-block: clamp(0.42rem, 1.55vh, 0.66rem) !important;
}

html[data-phase4r0-entry-plate="short-landscape"] .entry-path--startup {
  text-align: left !important;
}

html[data-phase4r0-entry-plate="short-landscape"] .entry-path--startup .entry-path__audience,
html[data-phase4r0-entry-plate="short-landscape"] .entry-path--startup .entry-path__statement {
  grid-column: 1 !important;
}

html[data-phase4r0-entry-plate="short-landscape"] .entry-path .entry-path__direction,
html[data-phase4r0-entry-plate="short-landscape"] .entry-path--startup .entry-path__direction {
  grid-column: 2 !important;
  grid-row: 1 / span 2 !important;
  justify-self: end !important;
}

html[data-phase4r0-entry-plate="short-landscape"] .entry-path__audience,
html[data-phase4r0-entry-plate="short-landscape"] .entry-path__direction {
  font-size: 0.78rem !important;
}

html[data-phase4r0-entry-plate="short-landscape"] .entry-path__statement {
  font-size: 0.9rem !important;
  line-height: 1.22 !important;
}

html[data-phase4r0-entry-plate="short-landscape"] .entry-field,
html[data-phase4r0-entry-plate="short-landscape"] .entry-field * {
  animation: none !important;
  transition: none !important;
}
`;

function argumentValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArguments(argv) {
  const options = {
    url: DEFAULT_URL,
    output: null,
    chromium: process.env.CHROME_PATH ?? null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--url" || value === "--base-url") {
      options.url = argumentValue(argv, index, value);
      index += 1;
    } else if (value === "--output") {
      options.output = path.resolve(argumentValue(argv, index, value));
      index += 1;
    } else if (value === "--chromium" || value === "--browser") {
      options.chromium = path.resolve(argumentValue(argv, index, value));
      index += 1;
    } else if (value === "--timeout-ms") {
      options.timeoutMs = Number(argumentValue(argv, index, value));
      index += 1;
    } else if (value === "--help" || value === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }
  if (options.help) return options;
  if (!options.output) throw new Error("--output is required and must be an external Phase 4-R0 root");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 4-R0 semantic ENTRY plate capture

Usage:
  node scripts/capture-phase4r0-entry-plates.mjs \\
    --url <local-dist-or-preview-url> \\
    --output <fresh-external-phase-4r0-root> \\
    [--chromium <executable>] [--timeout-ms <milliseconds>]

Options:
  --url URL          Loopback dist/preview root (default ${DEFAULT_URL})
  --output DIR       Required fresh or empty external Phase 4-R0 output root
  --chromium FILE    Chrome/Chromium executable; otherwise auto-detect
  --timeout-ms N     Preview/navigation timeout (default ${DEFAULT_TIMEOUT_MS})
  --help, -h         Show this help without writing files

The script captures ${VIEWPORTS.filter(({ required }) => required).length} required ENTRY plates and
${VIEWPORTS.filter(({ required }) => !required).length} nearby short-landscape plates. It waits for
the three accepted local fonts, requires exactly one H1 and two ENTRY routes,
and writes exact-size PNG plus box/overflow JSON for each viewport.

Short-landscape captures use a labeled, ENTRY-only style injected into the
browser page. It is preview evidence, not a production/runtime CSS mutation.
Output is hard-refused inside this repository or in any Phase 2B/3/4 accepted
evidence location. Use a basename containing phase-4r0 (for example,
C:\\Temp\\phase-4r0-entry-plates-20260822).
`);
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(parent, candidate) {
  const relative = path.relative(normalizedPath(parent), normalizedPath(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveFromExistingAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const missing = [];
  for (;;) {
    try {
      return path.join(await realpath(cursor), ...missing.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

function acceptedEvidenceLabel(candidate) {
  const portable = path.resolve(candidate).replaceAll("\\", "/").toLowerCase();
  const withoutR0 = portable.replace(/phase[-_ ]?4[-_ ]?r0/g, "phase-four-r-zero");
  return (
    /(?:^|[/_-])phase[-_ ]?2b(?:$|[/_-])/.test(withoutR0) ||
    /(?:^|[/_-])phase[-_ ]?3(?:$|[/_-])/.test(withoutR0) ||
    /(?:^|[/_-])phase[-_ ]?4(?:$|[/_-])/.test(withoutR0) ||
    /artifacts\/(?:evidence|original)\/(?:phase[-_ ]?(?:2b|3|4))(?:$|\/)/.test(withoutR0)
  );
}

async function validateExternalOutput(output) {
  if (!/phase[-_]?4[-_]?r0/i.test(path.basename(output))) {
    throw new Error("--output basename must clearly contain phase-4r0, phase4r0, or phase_4_r0");
  }
  if (acceptedEvidenceLabel(output)) {
    throw new Error("--output must not reuse a Phase 2B, Phase 3, or accepted Phase 4 evidence path");
  }
  if (isWithin(ROOT, output)) {
    throw new Error("--output must be outside the repository; repository and accepted evidence paths are read-only");
  }
  const resolved = await resolveFromExistingAncestor(output);
  if (isWithin(ROOT, resolved)) {
    throw new Error("Resolved --output aliases the repository or accepted evidence; choose a genuinely external root");
  }
  if (acceptedEvidenceLabel(resolved)) {
    throw new Error("Resolved --output aliases a Phase 2B, Phase 3, or accepted Phase 4 evidence path");
  }
  if (await pathExists(output)) {
    const information = await stat(output);
    if (!information.isDirectory()) throw new Error("--output exists and is not a directory");
    if ((await readdir(output)).length > 0) {
      throw new Error("--output already contains files; choose a fresh or empty external Phase 4-R0 root");
    }
  }
}

function normalizePreviewUrl(value) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("--url must use http or https");
  const hostname = url.hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("--url must be a loopback dist/preview URL");
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

async function executable(candidate) {
  if (!candidate) return false;
  try {
    await access(candidate, fsConstants.X_OK);
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function resolveChromium(override) {
  const candidates = [];
  if (override) candidates.push(path.resolve(override));
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
    );
    if (process.env.LOCALAPPDATA) {
      candidates.push(
        path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"),
      );
    }
  } else {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) {
    if (await executable(candidate)) return path.resolve(candidate);
  }
  throw new Error("Chrome/Chromium was not found; pass --chromium <executable>");
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok || (response.status >= 300 && response.status < 400)) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Local preview did not become available at ${url}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Capture is not a valid PNG");
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

async function atomicJson(destination, value) {
  await atomicWrite(destination, `${JSON.stringify(value, null, 2)}\n`);
}

async function fileRecord(absolute, relativePath = null) {
  const bytes = await readFile(absolute);
  return {
    ...(relativePath ? { path: relativePath.replaceAll("\\", "/") } : {}),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

async function runtimeAuthorityRecords() {
  return Promise.all(
    RUNTIME_AUTHORITY_PATHS.map(async (relativePath) => ({
      repositoryRelativePath: relativePath,
      ...await fileRecord(path.join(ROOT, ...relativePath.split("/"))),
    })),
  );
}

async function repositoryState() {
  const git = async (args) => (await execFileAsync("git", args, { cwd: ROOT, windowsHide: true })).stdout.trim();
  const status = await git(["status", "--short"]);
  return {
    head: await git(["rev-parse", "HEAD"]),
    branch: await git(["branch", "--show-current"]),
    dirty: status.length > 0,
    status: status ? status.split(/\r?\n/) : [],
  };
}

async function twoAnimationFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function loadAcceptedFonts(page) {
  return page.evaluate(async () => {
    if (!document.fonts) return { supported: false, status: null, requested: [], faces: [] };
    const requested = await Promise.all([
      document.fonts.load('800 64px "Syne"', "Where do you enter?"),
      document.fonts.load('400 18px "Newsreader"', "Quantum"),
      document.fonts.load('600 16px "Inter"', "For industry Explore"),
    ]);
    await document.fonts.ready;
    return {
      supported: true,
      status: document.fonts.status,
      requested: ["Syne", "Newsreader", "Inter"].map((family, index) => ({ family, matchedFaces: requested[index].length })),
      checks: {
        Syne: document.fonts.check('800 64px "Syne"', "Where do you enter?"),
        Newsreader: document.fonts.check('400 18px "Newsreader"', "Quantum"),
        Inter: document.fonts.check('600 16px "Inter"', "For industry Explore"),
      },
      faces: [...document.fonts].map((face) => ({
        family: face.family,
        style: face.style,
        weight: face.weight,
        status: face.status,
      })),
    };
  });
}

async function alignEntryPlate(page) {
  return page.evaluate(async () => {
    const root = document.documentElement;
    const entry = document.querySelector("#entry");
    if (!(entry instanceof HTMLElement)) throw new Error("#entry was not found");
    root.style.scrollBehavior = "auto";
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    entry.scrollIntoView({ block: "start", behavior: "instant" });

    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    await frame();
    await frame();
    const adjustments = [];
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const header = document.querySelector(".site-header");
      const headerRect = header?.getBoundingClientRect();
      const visibleHeaderBottom = headerRect && headerRect.bottom > 0 && headerRect.top < innerHeight
        ? Math.max(0, Math.min(innerHeight, headerRect.bottom))
        : 0;
      const targets = [
        entry.querySelector("h1"),
        ...entry.querySelectorAll(".entry-paths a[href]"),
      ].filter((element) => element instanceof HTMLElement);
      const rectangles = targets.map((element) => element.getBoundingClientRect());
      const top = Math.min(...rectangles.map((rect) => rect.top));
      const bottom = Math.max(...rectangles.map((rect) => rect.bottom));
      const height = bottom - top;
      const available = innerHeight - visibleHeaderBottom;
      const margin = 1;
      let delta = 0;
      let reason = "accepted-deep-link-layout-already-fits";
      if (top < visibleHeaderBottom + margin) {
        delta = top - (visibleHeaderBottom + margin);
        reason = "minimal-shift-below-visible-header";
      } else if (bottom > innerHeight - margin) {
        delta = bottom - (innerHeight - margin);
        reason = "minimal-shift-to-show-both-route-destinations";
      }
      adjustments.push({
        iteration,
        strategy: "preserve-accepted-deep-link-layout-with-minimal-fit-correction-only",
        reason,
        top,
        bottom,
        height,
        visibleHeaderBottom,
        available,
        delta,
      });
      if (Math.abs(delta) <= 0.5) break;
      window.scrollBy({ top: delta, left: 0, behavior: "instant" });
      await frame();
      await frame();
    }
    return { scrollY: window.scrollY, adjustments };
  });
}

async function readPlateState(page) {
  return page.evaluate(({ expectedH1, expectedRoutePaths }) => {
    const root = document.documentElement;
    const body = document.body;
    const header = document.querySelector(".site-header");
    const shell = document.querySelector("[data-cinematic-shell]");
    const entry = document.querySelector("#entry");
    const content = entry?.querySelector(".entry-field__content");
    const label = entry?.querySelector(".field-label");
    const h1 = entry?.querySelector("h1");
    const paths = entry?.querySelector(".entry-paths");
    const routes = [...(entry?.querySelectorAll(".entry-paths a[href]") ?? [])];
    const normalize = (value) => value?.replace(/\s+/g, " ").trim() ?? "";
    const round = (value) => Number(value.toFixed(3));
    const rectangle = (element) => {
      if (!(element instanceof Element)) return null;
      const bounds = element.getBoundingClientRect();
      return Object.fromEntries(
        ["x", "y", "width", "height", "top", "right", "bottom", "left"].map((key) => [key, round(bounds[key])]),
      );
    };
    const styleRecord = (element) => {
      if (!(element instanceof Element)) return null;
      const style = getComputedStyle(element);
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        position: style.position,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    };
    const elementRecord = (element) => ({ rect: rectangle(element), style: styleRecord(element) });
    const headerRect = rectangle(header);
    const visibleHeaderBottom = headerRect && headerRect.bottom > 0 && headerRect.top < innerHeight
      ? Math.max(0, Math.min(innerHeight, headerRect.bottom))
      : 0;
    const semanticRects = [h1, ...routes]
      .map((element) => rectangle(element))
      .filter(Boolean);
    const semanticUnion = semanticRects.length
      ? {
          top: round(Math.min(...semanticRects.map((rect) => rect.top))),
          right: round(Math.max(...semanticRects.map((rect) => rect.right))),
          bottom: round(Math.max(...semanticRects.map((rect) => rect.bottom))),
          left: round(Math.min(...semanticRects.map((rect) => rect.left))),
        }
      : null;
    if (semanticUnion) {
      semanticUnion.width = round(semanticUnion.right - semanticUnion.left);
      semanticUnion.height = round(semanticUnion.bottom - semanticUnion.top);
    }
    const horizontalOffenders = [h1, ...routes]
      .map((element) => ({
        selector: element === h1 ? "#entry h1" : `#entry [data-entry-path=\"${element.getAttribute("data-entry-path")}\"]`,
        rect: rectangle(element),
      }))
      .filter(({ rect }) => rect && (rect.left < -0.5 || rect.right > innerWidth + 0.5));
    const checks = {
      exactlyOneDocumentH1: document.querySelectorAll("h1").length === 1,
      exactlyOneEntryH1: entry?.querySelectorAll("h1").length === 1,
      h1TextMatches: normalize(h1?.textContent) === expectedH1,
      entryLabelOwnsH1: entry?.getAttribute("aria-labelledby") === h1?.id && Boolean(h1?.id),
      exactlyTwoEntryRoutes: routes.length === 2,
      routePathsMatch: JSON.stringify(routes.map((route) => new URL(route.href).pathname).sort()) === JSON.stringify([...expectedRoutePaths].sort()),
      routeNamesPresent: routes.every((route) => normalize(route.textContent).length > 0),
      acceptedFontsLoaded: document.fonts?.status === "loaded" &&
        document.fonts.check('800 64px "Syne"', "Where do you enter?") &&
        document.fonts.check('400 18px "Newsreader"', "Quantum") &&
        document.fonts.check('600 16px "Inter"', "For industry Explore"),
      semanticContentVisible: [h1, ...routes].every((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility === "visible" && Number(style.opacity) > 0.95;
      }),
      semanticContentInteractive: routes.every((route) => getComputedStyle(route).pointerEvents !== "none") &&
        getComputedStyle(entry).pointerEvents !== "none",
      semanticHorizontalFit: semanticUnion !== null && semanticUnion.left >= -0.5 && semanticUnion.right <= innerWidth + 0.5,
      semanticVerticalFit: semanticUnion !== null && semanticUnion.top >= visibleHeaderBottom - 0.75 && semanticUnion.bottom <= innerHeight + 0.75,
      noRootHorizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) <= innerWidth + 1,
      entryHorizontalOverflowContained: entry instanceof HTMLElement &&
        (entry.scrollWidth <= entry.clientWidth + 1 || ["clip", "hidden"].includes(getComputedStyle(entry).overflowX)),
    };
    return {
      url: location.href,
      title: document.title,
      viewport: {
        innerWidth,
        innerHeight,
        devicePixelRatio,
        visualViewport: window.visualViewport
          ? {
              width: round(window.visualViewport.width),
              height: round(window.visualViewport.height),
              scale: window.visualViewport.scale,
              offsetLeft: round(window.visualViewport.offsetLeft),
              offsetTop: round(window.visualViewport.offsetTop),
            }
          : null,
      },
      scroll: { x: scrollX, y: scrollY },
      cinematic: {
        mode: root.dataset.cinematicMode ?? null,
        fallback: root.dataset.cinematicFallback ?? null,
        deepLinkMarker: root.hasAttribute("data-cinematic-deep-link"),
        headerState: root.dataset.cinematicHeader ?? null,
        phase: shell?.getAttribute("data-cinematic-phase") ?? null,
        interactive: shell?.getAttribute("data-cinematic-interactive") ?? null,
        mediaFamily: shell?.getAttribute("data-media-family") ?? null,
        mediaDelivery: shell?.getAttribute("data-media-delivery") ?? null,
      },
      semantic: {
        documentH1Count: document.querySelectorAll("h1").length,
        entryH1Count: entry?.querySelectorAll("h1").length ?? 0,
        h1Text: normalize(h1?.textContent),
        entryAriaLabelledby: entry?.getAttribute("aria-labelledby") ?? null,
        routeCount: routes.length,
        routes: routes.map((route) => ({
          key: route.getAttribute("data-entry-path"),
          href: route.getAttribute("href"),
          resolvedPath: new URL(route.href).pathname,
          accessibleText: normalize(route.textContent),
          ...elementRecord(route),
        })),
      },
      boxes: {
        header: elementRecord(header),
        shell: elementRecord(shell),
        entry: elementRecord(entry),
        content: elementRecord(content),
        fieldLabel: elementRecord(label),
        h1: elementRecord(h1),
        paths: elementRecord(paths),
        semanticUnion,
        visibleHeaderBottom: round(visibleHeaderBottom),
      },
      overflow: {
        document: {
          rootClientWidth: root.clientWidth,
          rootScrollWidth: root.scrollWidth,
          rootClientHeight: root.clientHeight,
          rootScrollHeight: root.scrollHeight,
          bodyClientWidth: body.clientWidth,
          bodyScrollWidth: body.scrollWidth,
          bodyClientHeight: body.clientHeight,
          bodyScrollHeight: body.scrollHeight,
          horizontalPixels: Math.max(0, Math.max(root.scrollWidth, body.scrollWidth) - innerWidth),
          verticalScrollable: Math.max(root.scrollHeight, body.scrollHeight) > innerHeight,
        },
        entry: entry instanceof HTMLElement
          ? {
              clientWidth: entry.clientWidth,
              scrollWidth: entry.scrollWidth,
              clientHeight: entry.clientHeight,
              scrollHeight: entry.scrollHeight,
              horizontalPixels: Math.max(0, entry.scrollWidth - entry.clientWidth),
              verticalPixels: Math.max(0, entry.scrollHeight - entry.clientHeight),
            }
          : null,
        semanticHorizontalOffenders: horizontalOffenders,
      },
      previewMarker: root.dataset.phase4r0EntryPlate ?? null,
      checks,
    };
  }, { expectedH1: EXPECTED_H1, expectedRoutePaths: EXPECTED_ROUTE_PATHS });
}

function checkFailures(state, viewport, fontEvidence, consoleErrors, pageErrors) {
  const failures = [];
  for (const [name, passed] of Object.entries(state.checks)) {
    if (!passed) failures.push(`${name} failed`);
  }
  if (state.viewport.innerWidth !== viewport.width || state.viewport.innerHeight !== viewport.height) {
    failures.push(`viewport resolved ${state.viewport.innerWidth}x${state.viewport.innerHeight}, expected ${viewport.width}x${viewport.height}`);
  }
  if (!fontEvidence.supported || fontEvidence.status !== "loaded") failures.push("document.fonts was not ready");
  for (const request of fontEvidence.requested ?? []) {
    if (request.matchedFaces < 1) failures.push(`${request.family} did not resolve to a local accepted font face`);
  }
  if (state.cinematic.mediaFamily && state.cinematic.mediaFamily !== viewport.expectedFamily) {
    failures.push(`cinematic family ${state.cinematic.mediaFamily} did not match ${viewport.expectedFamily}`);
  }
  if (viewport.shortLandscapeOverride && state.previewMarker !== "short-landscape") {
    failures.push("short-landscape preview marker was not present");
  }
  if (!viewport.shortLandscapeOverride && state.previewMarker) {
    failures.push("preview override leaked into a non-short-landscape context");
  }
  for (const message of consoleErrors) failures.push(`console error: ${message}`);
  for (const message of pageErrors) failures.push(`page error: ${message}`);
  return failures;
}

async function captureViewport(browser, options, viewport, generatedAt) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "no-preference",
    locale: "en-GB",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const fontResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/fonts/")) {
      fontResponses.push({ url: url.pathname, status: response.status(), fromServiceWorker: response.fromServiceWorker() });
    }
  });

  const captureUrl = new URL(options.url);
  captureUrl.hash = "entry";
  try {
    await page.goto(captureUrl.toString(), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForSelector("#entry h1", { state: "attached", timeout: options.timeoutMs });
    await page.waitForFunction(
      () => {
        const root = document.documentElement;
        const shell = document.querySelector("[data-cinematic-shell]");
        return root.dataset.cinematicMode === "static" ||
          (root.dataset.cinematicMode === "enhanced" && shell?.getAttribute("data-cinematic-interactive") === "true");
      },
      null,
      { timeout: options.timeoutMs },
    );
    const fontEvidence = await loadAcceptedFonts(page);
    await twoAnimationFrames(page);

    const previewOverride = viewport.shortLandscapeOverride
      ? {
          applied: true,
          classification: "PREVIEW_ONLY_ENTRY_SCOPED_SHORT_LANDSCAPE_COMPOSITION_NOT_PRODUCTION_RUNTIME_CSS",
          marker: "html[data-phase4r0-entry-plate=\"short-landscape\"]",
          rationale: "Fit the complete accepted H1 and both route destinations at 844x390 and nearby short landscapes without changing global/root typography.",
          globalTypographyShrinkApplied: false,
          rootFontSizeChanged: false,
          browserZoomChanged: false,
          productionFilesChanged: false,
          css: SHORT_LANDSCAPE_PREVIEW_CSS.trim(),
          cssSha256: sha256(Buffer.from(SHORT_LANDSCAPE_PREVIEW_CSS)),
        }
      : {
          applied: false,
          classification: "UNMODIFIED_PRODUCTION_ENTRY_LAYOUT",
          globalTypographyShrinkApplied: false,
          rootFontSizeChanged: false,
          browserZoomChanged: false,
          productionFilesChanged: false,
        };
    if (viewport.shortLandscapeOverride) {
      await page.evaluate(() => {
        document.documentElement.dataset.phase4r0EntryPlate = "short-landscape";
      });
      await page.addStyleTag({ content: SHORT_LANDSCAPE_PREVIEW_CSS });
      await twoAnimationFrames(page);
    }

    const alignment = await alignEntryPlate(page);
    await twoAnimationFrames(page);
    const state = await readPlateState(page);
    const failures = checkFailures(state, viewport, fontEvidence, consoleErrors, pageErrors);
    const filename = `${viewport.id}-entry.png`;
    const jsonFilename = `${viewport.id}-entry.json`;
    const png = await page.screenshot({
      type: "png",
      fullPage: false,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
    const dimensions = pngDimensions(png);
    if (dimensions.width !== viewport.width || dimensions.height !== viewport.height) {
      failures.push(`PNG resolved ${dimensions.width}x${dimensions.height}, expected ${viewport.width}x${viewport.height}`);
    }
    const pngPath = path.join(options.output, "plates", filename);
    await atomicWrite(pngPath, png);
    const record = {
      schema: "quantum-hub.phase-4r0.semantic-entry-plate.v1",
      status: failures.length ? "FAIL" : "PASS",
      generatedAt,
      evidenceClassification: "R0_EXTERNAL_PREVIEW_PLATE_NOT_ACCEPTED_PHASE2B_PHASE3_OR_PHASE4_EVIDENCE",
      viewport,
      preview: { baseUrl: options.url, captureUrl: captureUrl.toString(), directEntryHash: true },
      previewOverride,
      alignment,
      fonts: { ...fontEvidence, responses: fontResponses },
      state,
      browserDiagnostics: { consoleErrors, pageErrors },
      plate: {
        path: `plates/${filename}`,
        bytes: png.length,
        sha256: sha256(png),
        ...dimensions,
      },
      failures,
    };
    await atomicJson(path.join(options.output, "reports", jsonFilename), record);
    return {
      id: viewport.id,
      required: viewport.required,
      width: viewport.width,
      height: viewport.height,
      status: record.status,
      previewOverrideApplied: previewOverride.applied,
      png: record.plate,
      report: `reports/${jsonFilename}`,
      checks: state.checks,
      semanticUnion: state.boxes.semanticUnion,
      overflow: state.overflow,
      cinematic: state.cinematic,
      failures,
    };
  } finally {
    await context.close();
  }
}

async function listFiles(root, relative = "") {
  const directory = path.join(root, ...relative.split("/").filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, next));
    else if (entry.isFile()) files.push(next);
  }
  return files;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  options.url = normalizePreviewUrl(options.url);
  await validateExternalOutput(options.output);
  await waitForServer(options.url, options.timeoutMs);
  const chromiumPath = await resolveChromium(options.chromium);
  const repository = await repositoryState();
  const runtimeBefore = await runtimeAuthorityRecords();

  await mkdir(options.output, { recursive: true });
  if (isWithin(ROOT, await realpath(options.output))) {
    throw new Error("Created output unexpectedly resolves inside the repository");
  }
  await mkdir(path.join(options.output, "plates"));
  await mkdir(path.join(options.output, "reports"));

  const generatedAt = new Date().toISOString();
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumPath,
    timeout: options.timeoutMs,
    args: ["--disable-extensions", "--disable-background-networking"],
  });
  const browserVersion = browser.version();
  const captures = [];
  try {
    for (const viewport of VIEWPORTS) {
      process.stdout.write(`Capturing ${viewport.id} (${viewport.width}x${viewport.height})...\n`);
      captures.push(await captureViewport(browser, options, viewport, generatedAt));
    }
  } finally {
    await browser.close();
  }

  const runtimeAfter = await runtimeAuthorityRecords();
  const runtimeSourcesUnchanged = JSON.stringify(runtimeBefore) === JSON.stringify(runtimeAfter);
  const failures = captures.flatMap((capture) => capture.failures.map((failure) => `${capture.id}: ${failure}`));
  if (!runtimeSourcesUnchanged) failures.push("Runtime authority files changed during read-only capture");

  const preManifestFiles = await listFiles(options.output);
  const files = await Promise.all(
    preManifestFiles.map((relativePath) => fileRecord(path.join(options.output, ...relativePath.split("/")), relativePath)),
  );
  const manifest = {
    schema: "quantum-hub.phase-4r0.semantic-entry-plates-manifest.v1",
    status: failures.length ? "FAIL" : "PASS",
    generatedAt,
    evidenceClassification: "R0_EXTERNAL_PREVIEW_PLATES_NOT_ACCEPTED_PHASE2B_PHASE3_OR_PHASE4_EVIDENCE",
    honesty: {
      sourcePage: "real built semantic ENTRY from the supplied local dist/preview",
      directEntryDeepLinkUsed: true,
      javascriptEnabled: true,
      playwrightHeadlessBrowser: true,
      humanAcceptanceClaimed: false,
      productionRuntimeFilesMutated: false,
      outputExternalToRepository: true,
      acceptedPhase2bPhase3Phase4EvidenceMutated: false,
      shortLandscapeTreatment: "capture-only ENTRY-scoped injected CSS; not production CSS",
      globalTypographyShrinkApplied: false,
    },
    preview: { url: options.url, policy: "loopback dist/preview only" },
    browser: { engine: "Chromium", version: browserVersion, executable: chromiumPath, headless: true },
    repository,
    output: { root: options.output, manifest: MANIFEST_FILENAME },
    viewports: {
      required: VIEWPORTS.filter(({ required }) => required).map(({ id, width, height }) => ({ id, width, height })),
      shortLandscapeNeighbors: VIEWPORTS.filter(({ required }) => !required).map(({ id, width, height }) => ({ id, width, height })),
    },
    previewOverride: {
      appliedTo: VIEWPORTS.filter(({ shortLandscapeOverride }) => shortLandscapeOverride).map(({ id }) => id),
      marker: "html[data-phase4r0-entry-plate=\"short-landscape\"]",
      cssSha256: sha256(Buffer.from(SHORT_LANDSCAPE_PREVIEW_CSS)),
      css: SHORT_LANDSCAPE_PREVIEW_CSS.trim(),
      globalTypographyShrinkApplied: false,
      productionRuntimeFilesMutated: false,
    },
    runtimeAuthority: {
      before: runtimeBefore,
      after: runtimeAfter,
      unchanged: runtimeSourcesUnchanged,
    },
    captures,
    files,
    summary: {
      requiredViewports: VIEWPORTS.filter(({ required }) => required).length,
      neighborViewports: VIEWPORTS.filter(({ required }) => !required).length,
      captures: captures.length,
      passed: captures.filter(({ status }) => status === "PASS").length,
      failed: captures.filter(({ status }) => status === "FAIL").length,
      failures: failures.length,
    },
    failures,
  };
  await atomicJson(path.join(options.output, MANIFEST_FILENAME), manifest);
  const manifestBytes = await readFile(path.join(options.output, MANIFEST_FILENAME));
  process.stdout.write(`Phase 4-R0 ENTRY plates ${manifest.status}: ${options.output}\n`);
  process.stdout.write(`Manifest SHA-256 ${sha256(manifestBytes)}\n`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Phase 4-R0 ENTRY plate capture failed: ${error.stack ?? error}\n`);
  process.exitCode = 1;
});
