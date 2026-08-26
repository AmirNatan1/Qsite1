import { constants as fsConstants } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_RELATIVE_PATH = "scripts/capture-phase4r1-1-browser-regression-evidence.mjs";
const REPORT_FILENAME = "phase-4r1-1-browser-regression-report.json";
const SCHEMA = "quantum-hub.phase-4r1-1.browser-regression-evidence.v1";
const EXPECTED_BRANCH = "repair/phase-4r1-1-periphery-current-mobile-crt";
const EVIDENCE_LABEL = "accepted prior/runtime proxy — final R1.1 refined-media integration is not authorized and has not started";
const AUTHORIZATION = Object.freeze({
  full540FrameCyclesFilm: false,
  finalRefinedMediaIntegration: false,
  finalRefinedMediaDeployment: false,
  phase5: false,
  humanAccepted: false,
});

const VIEWPORTS = Object.freeze([
  Object.freeze({ id: "320x800", width: 320, height: 800, expectedRuntimeFamily: "mobile", familyReason: "portrait viewport width is at most 800px" }),
  Object.freeze({ id: "360x800", width: 360, height: 800, expectedRuntimeFamily: "mobile", familyReason: "portrait viewport width is at most 800px" }),
  Object.freeze({ id: "768x1024", width: 768, height: 1024, expectedRuntimeFamily: "mobile", familyReason: "portrait tablet width is at most 800px" }),
  Object.freeze({ id: "844x390", width: 844, height: 390, expectedRuntimeFamily: "mobile", familyReason: "narrow landscape width is at most 900px and height is at most 480px" }),
]);

const EXPECTED_OPERATING_SECTION_IDS = Object.freeze([
  "entry",
  "built-with-industry",
  "method",
  "industries",
  "proof",
  "programmes",
  "conversion",
]);

const REQUIRED_STATE_IDS = Object.freeze([
  "settled-entry-320x800",
  "settled-entry-360x800",
  "settled-entry-768x1024",
  "active-cinematic-844x390",
  "settled-entry-844x390",
  "reverse-concealed-844x390",
  "skip-intro-844x390",
  "reduced-motion-844x390",
  "no-javascript-844x390",
  "native-scroll-operating-field-768x1024",
]);

const RUNTIME_SOURCE_PATHS = Object.freeze([
  "src/pages/index.astro",
  "src/components/home/EntryField.astro",
  "src/scripts/home-cinematic-integration.ts",
  "src/scripts/home-operating-field.ts",
  "src/styles/routes/home-cinematic.css",
  "src/styles/routes/home-responsive.css",
]);

const PRIOR_RUNTIME_MEDIA_PATHS = Object.freeze([
  "public/media/cinematic/phase-3-desktop-vp9-44a1d9facd43.webm",
  "public/media/cinematic/phase-3-desktop-h264-a73be0bb9890.mp4",
  "public/media/cinematic/phase-3-mobile-vp9-0ffcf12a431b.webm",
  "public/media/cinematic/phase-3-mobile-h264-34319f80ae39.mp4",
]);

const PRIVATE_PATTERNS = Object.freeze([
  Object.freeze({ id: "windows-user-path", expression: /[A-Za-z]:[\\/]Users[\\/]/iu }),
  Object.freeze({ id: "mac-user-path", expression: /\/Users\/[^/\s"']+/iu }),
  Object.freeze({ id: "linux-home-path", expression: /\/home\/[^/\s"']+/iu }),
  Object.freeze({ id: "onedrive-component", expression: /OneDrive/iu }),
  Object.freeze({ id: "appdata-component", expression: /AppData/iu }),
  Object.freeze({ id: "file-uri", expression: /file:\/\//iu }),
]);

function optionValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4338",
    browser: process.env.CHROME_PATH ?? null,
    expectedBranch: EXPECTED_BRANCH,
    expectedHead: null,
    output: null,
    selfTest: false,
    serverMode: "astro-preview",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-url") {
      options.baseUrl = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--browser") {
      options.browser = path.resolve(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--expected-branch") {
      options.expectedBranch = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--expected-head") {
      options.expectedHead = optionValue(argv, index, argument).toLowerCase();
      index += 1;
    } else if (argument === "--output") {
      options.output = path.resolve(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--server-mode") {
      options.serverMode = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--self-test") {
      options.selfTest = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "Phase 4-R1.1 browser/regression evidence producer",
    "",
    "Usage:",
    `  node ${SCRIPT_RELATIVE_PATH} \\`,
    "    --expected-head <40-hex-final-HEAD> \\",
    "    --output <absolute-external-directory> \\",
    `    [--expected-branch ${EXPECTED_BRANCH}] \\`,
    "    [--base-url http://127.0.0.1:4338] \\",
    "    [--browser <Chrome-or-Chromium>] \\",
    "    [--server-mode astro-preview|external]",
    "",
    "Dry self-test (never launches a browser/server or writes files):",
    `  node ${SCRIPT_RELATIVE_PATH} --self-test`,
    "",
    "The capture binds every state to the exact passed HEAD, requires a clean local/upstream",
    "parity state, writes only to a new external directory, sanitizes every PNG, and labels",
    "the currently integrated Phase 3 media as an accepted prior/runtime proxy. It does not",
    "claim or perform final R1.1 refined-media integration.",
    "",
  ].join("\n"));
}

function normalizePath(candidate) {
  const resolved = path.resolve(candidate);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function pathIsWithin(parent, candidate) {
  const relative = path.relative(normalizePath(parent), normalizePath(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function validateCaptureArguments(options) {
  if (!options.expectedHead || !/^[0-9a-f]{40}$/u.test(options.expectedHead)) {
    throw new Error("--expected-head is required and must be the exact 40-hex final HEAD");
  }
  if (!options.expectedBranch.trim()) throw new Error("--expected-branch must not be empty");
  if (!options.output || !path.isAbsolute(options.output)) throw new Error("--output must be an absolute path");
  if (pathIsWithin(ROOT, options.output) || pathIsWithin(options.output, ROOT)) {
    throw new Error("--output must be external to, and must not contain, the repository");
  }
  if (!["astro-preview", "external"].includes(options.serverMode)) {
    throw new Error("--server-mode must be astro-preview or external");
  }
  const parsed = new URL(options.baseUrl);
  if (parsed.protocol !== "http:" || !new Set(["127.0.0.1", "localhost", "[::1]"]).has(parsed.hostname)) {
    throw new Error("--base-url must be a loopback HTTP URL");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("--base-url must not contain credentials, query parameters, or a fragment");
  }
  parsed.pathname = "/";
  options.baseUrl = parsed.toString().replace(/\/$/u, "");
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }).trim();
}

function gitState(expectedHead, expectedBranch) {
  const branch = git("branch", "--show-current");
  const head = git("rev-parse", "HEAD").toLowerCase();
  const status = git("status", "--porcelain=v1", "--untracked-files=all");
  let upstream = null;
  let upstreamHead = null;
  try {
    upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}");
    upstreamHead = git("rev-parse", "@{upstream}").toLowerCase();
  } catch {}
  return {
    branch,
    head,
    expectedBranch,
    expectedHead,
    workingTreeClean: status === "",
    statusPorcelain: status ? status.split(/\r?\n/u) : [],
    upstream,
    upstreamHead,
    exactHeadBinding: head === expectedHead,
    expectedBranchBinding: branch === expectedBranch,
    upstreamParity: Boolean(upstreamHead) && head === upstreamHead,
    liveRemoteQueriedByProducer: false,
    ready: head === expectedHead && branch === expectedBranch && status === "" && Boolean(upstreamHead) && head === upstreamHead,
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function authorityRecord(relativePath, requireTracked = true) {
  if (requireTracked) git("ls-files", "--error-unmatch", relativePath);
  const bytes = await readFile(path.join(ROOT, ...relativePath.split("/")));
  return { relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

async function authorityRecords(paths) {
  return Promise.all(paths.map((relativePath) => authorityRecord(relativePath)));
}

async function exists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
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
  if (override) candidates.push(override);
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    );
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) {
    if (await executable(candidate)) return path.resolve(candidate);
  }
  throw new Error("Chrome/Chromium was not found. Set CHROME_PATH or pass --browser.");
}

function startPreview(baseUrl) {
  const url = new URL(baseUrl);
  const child = spawn(process.execPath, [
    path.join(ROOT, "scripts", "serve-phase4-dist.mjs"),
    "--host",
    url.hostname,
    "--port",
    url.port || "80",
  ], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.captureOutput = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding("utf8");
    stream?.on("data", (chunk) => {
      child.captureOutput = `${child.captureOutput}${chunk}`.slice(-6000);
    });
  }
  return child;
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`Preview exited (${child.exitCode}) before readiness`);
    }
    try {
      const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for loopback preview at ${baseUrl}`);
}

function safeRequestPath(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "[unparseable-request-url]";
  }
}

function sanitizeMessage(value) {
  return String(value ?? "")
    .replace(/[A-Za-z]:[\\/]Users[\\/][^\s"']+/giu, "[REDACTED_LOCAL_PATH]")
    .replace(/\/(?:Users|home)\/[^\s"']+/giu, "[REDACTED_LOCAL_PATH]")
    .replace(/OneDrive|AppData/giu, "[REDACTED_LOCAL_COMPONENT]")
    .slice(0, 800);
}

function observeNetwork(page) {
  const record = {
    controllerRequests: [],
    mediaRequests: [],
    failedRequests: [],
    pageErrors: [],
    consoleErrors: [],
  };
  page.on("request", (request) => {
    const requestPath = safeRequestPath(request.url());
    if (/home-cinematic-integration[^/]*\.js(?:\?|$)/u.test(requestPath)) record.controllerRequests.push(requestPath);
    if (/\/media\/cinematic\/.*\.(?:mp4|webm)(?:\?|$)/iu.test(requestPath)) record.mediaRequests.push(requestPath);
  });
  page.on("requestfailed", (request) => record.failedRequests.push({
    path: safeRequestPath(request.url()),
    error: sanitizeMessage(request.failure()?.errorText),
  }));
  page.on("pageerror", (error) => record.pageErrors.push(sanitizeMessage(error.message)));
  page.on("console", (message) => {
    if (message.type() === "error") record.consoleErrors.push(sanitizeMessage(message.text()));
  });
  return {
    record,
    snapshot: () => structuredClone(record),
  };
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(50);
}

async function waitForController(page) {
  await page.waitForFunction(() => {
    const root = document.documentElement;
    const mediaState = document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state");
    return root.dataset.cinematicMode !== "candidate"
      && (root.dataset.cinematicMode !== "enhanced" || ["ready", "failed"].includes(mediaState ?? ""));
  }, undefined, { timeout: 16_000 });
  await settle(page);
}

async function readHomeState(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const shell = document.querySelector("[data-cinematic-shell]");
    const header = document.querySelector(".site-header");
    const entry = document.querySelector("#entry");
    const entryContent = entry?.querySelector(".entry-field__content");
    const h1 = document.querySelector("h1");
    const routes = [...document.querySelectorAll("#entry .entry-path[href]")];
    const method = document.querySelector("#method");
    const active = document.activeElement;
    const number = (value) => {
      const parsed = Number.parseFloat(value ?? "");
      return Number.isFinite(parsed) ? parsed : null;
    };
    const rounded = (value) => Number.isFinite(value) ? Number(value.toFixed(3)) : null;
    const rect = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        x: rounded(bounds.x),
        y: rounded(bounds.y),
        width: rounded(bounds.width),
        height: rounded(bounds.height),
        top: rounded(bounds.top),
        right: rounded(bounds.right),
        bottom: rounded(bounds.bottom),
        left: rounded(bounds.left),
      };
    };
    const style = (element) => element ? getComputedStyle(element) : null;
    const visible = (element) => {
      const computed = style(element);
      const bounds = element?.getBoundingClientRect();
      return Boolean(element && computed && bounds
        && computed.display !== "none"
        && computed.visibility !== "hidden"
        && Number.parseFloat(computed.opacity) > .001
        && bounds.width > 0
        && bounds.height > 0);
    };
    const focusableSelector = "a[href],button,summary,input:not([type=hidden]),select,textarea,[tabindex]";
    const effectiveFocusable = (element) => !element.closest("[inert]") && !element.hasAttribute("disabled") && element.tabIndex >= 0;
    const headerStyle = style(header);
    const entryStyle = style(entry);
    const headerBounds = header?.getBoundingClientRect();
    const headerHitTested = Boolean(header && headerBounds && headerBounds.width > 0 && headerBounds.height > 0
      && document.elementsFromPoint(
        Math.min(innerWidth - 1, Math.max(0, headerBounds.left + headerBounds.width / 2)),
        Math.min(innerHeight - 1, Math.max(0, headerBounds.top + headerBounds.height / 2)),
      ).some((element) => element === header || header.contains(element)));
    const nestedVerticalScrollers = [...document.querySelectorAll("main *")]
      .filter((element) => {
        const computed = style(element);
        return computed && ["auto", "scroll"].includes(computed.overflowY) && element.scrollHeight > element.clientHeight + 2;
      })
      .map((element) => ({ tag: element.tagName.toLowerCase(), id: element.id || null, className: String(element.className).slice(0, 160) }));
    const operatingSections = [...document.querySelectorAll("main [data-field-section]")].map((section) => ({
      id: section.id || null,
      className: String(section.className),
      heading: section.querySelector("h1,h2,h3")?.textContent?.replace(/\s+/gu, " ").trim() ?? null,
      bounds: rect(section),
    }));
    return {
      location: `${location.pathname}${location.hash}`,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      document: {
        readyState: document.readyState,
        scrollX: rounded(scrollX),
        scrollY: rounded(scrollY),
        maxScroll: rounded(Math.max(0, root.scrollHeight - innerHeight)),
        horizontalOverflow: rounded(Math.max(root.scrollWidth, body?.scrollWidth ?? 0) - innerWidth),
        nestedVerticalScrollers,
        mainCount: document.querySelectorAll("main").length,
        headerCount: document.querySelectorAll("header.site-header").length,
        footerCount: document.querySelectorAll("footer").length,
      },
      root: {
        cinematicMode: root.getAttribute("data-cinematic-mode"),
        cinematicEligibility: root.getAttribute("data-cinematic-eligibility"),
        cinematicBootstrap: root.getAttribute("data-cinematic-bootstrap"),
        cinematicHeader: root.getAttribute("data-cinematic-header"),
        cinematicFallback: root.getAttribute("data-cinematic-fallback"),
        operatingField: root.getAttribute("data-operating-field"),
      },
      shell: shell ? {
        count: document.querySelectorAll("[data-cinematic-shell]").length,
        phase: shell.getAttribute("data-cinematic-phase"),
        interactive: shell.getAttribute("data-cinematic-interactive"),
        mediaState: shell.getAttribute("data-media-state"),
        mediaFamily: shell.getAttribute("data-media-family"),
        mediaCodec: shell.getAttribute("data-media-codec"),
        mediaSource: shell.getAttribute("data-media-source"),
        scrollProgress: number(shell.getAttribute("data-scroll-progress")),
        cinematicProgress: number(shell.getAttribute("data-cinematic-progress")),
        targetFrame: number(shell.getAttribute("data-target-frame")),
        takeoverProgress: number(shell.getAttribute("data-takeover-progress")),
        bounds: rect(shell),
      } : null,
      header: header ? {
        visibility: headerStyle?.visibility ?? null,
        opacity: number(headerStyle?.opacity),
        pointerEvents: headerStyle?.pointerEvents ?? null,
        inert: header.hasAttribute("inert"),
        hitTested: headerHitTested,
        visibleChromeCount: [header.querySelector(".brand-link"), header.querySelector(".desktop-nav"), header.querySelector(".mobile-nav > summary")].filter(visible).length,
        focusableDescendantCount: [...header.querySelectorAll(focusableSelector)].filter(effectiveFocusable).length,
        bounds: rect(header),
      } : null,
      entry: entry ? {
        dataHomeScene: entry.getAttribute("data-home-scene"),
        inert: entry.hasAttribute("inert"),
        pointerEvents: entryStyle?.pointerEvents ?? null,
        bounds: rect(entry),
        contentBounds: rect(entryContent),
        contentOpacity: number(style(entryContent)?.opacity),
        focusableDescendantCount: [...entry.querySelectorAll(focusableSelector)].filter(effectiveFocusable).length,
      } : null,
      semantics: {
        h1Count: document.querySelectorAll("h1").length,
        h1Text: h1?.textContent?.replace(/\s+/gu, " ").trim() ?? null,
        h1Bounds: rect(h1),
        routes: routes.map((route) => ({
          href: route.getAttribute("href"),
          text: route.textContent?.replace(/\s+/gu, " ").trim() ?? "",
          bounds: rect(route),
        })),
        operatingSections,
      },
      method: method ? {
        dataMethodSticky: method.getAttribute("data-method-sticky"),
        bounds: rect(method),
        heading: method.querySelector("h2")?.textContent?.replace(/\s+/gu, " ").trim() ?? null,
      } : null,
      activeElement: active ? {
        tag: active.tagName.toLowerCase(),
        id: active.id || null,
        className: String(active.className),
        href: active.getAttribute?.("href") ?? null,
        inEntry: Boolean(entry && entry.contains(active)),
        inHeader: Boolean(header && header.contains(active)),
      } : null,
      historyMarker: history.state?.quantumHomeCinematic ?? null,
    };
  });
}

async function cinematicGeometry(page) {
  const initial = await readHomeState(page);
  const shellTop = (initial.shell?.bounds?.top ?? 0) + (initial.document.scrollY ?? 0);
  const entryTop = (initial.entry?.bounds?.top ?? 1) + (initial.document.scrollY ?? 0);
  const headerHeight = initial.header?.bounds?.height ?? 0;
  const travel = Math.max(1, entryTop - headerHeight - shellTop);
  return {
    startY: Math.max(0, Math.round(shellTop)),
    endY: Math.min(initial.document.maxScroll ?? 0, Math.round(shellTop + travel)),
    travel,
  };
}

async function setProgress(page, geometry, progress, waitForMedia = true) {
  const targetY = Math.round(geometry.startY + (geometry.endY - geometry.startY) * progress);
  await page.evaluate((value) => window.scrollTo({ top: value, left: 0, behavior: "instant" }), targetY);
  await settle(page);
  if (waitForMedia) {
    await page.waitForFunction(() => {
      const shell = document.querySelector("[data-cinematic-shell]");
      const video = document.querySelector("[data-cinematic-media]");
      const target = Number.parseFloat(shell?.getAttribute("data-target-time") ?? "");
      return video && video.readyState >= 1 && !video.seeking && Number.isFinite(target) && Math.abs(video.currentTime - target) <= .15;
    }, undefined, { timeout: 4_000 }).catch(() => {});
  }
  await settle(page);
  return targetY;
}

function check(id, passed, expected, actual) {
  return { id, status: passed ? "PASS" : "FAIL", passed: Boolean(passed), expected, actual };
}

function withinViewport(bounds, viewport, tolerance = 3) {
  return Boolean(bounds
    && bounds.top >= -tolerance
    && bounds.left >= -tolerance
    && bounds.right <= viewport.width + tolerance
    && bounds.bottom <= viewport.height + tolerance);
}

function semanticChecks(measured) {
  const sectionIds = measured.semantics.operatingSections.map(({ id }) => id);
  const routeHrefs = measured.semantics.routes.map(({ href }) => href);
  return [
    check("single-semantic-h1", measured.semantics.h1Count === 1, 1, measured.semantics.h1Count),
    check("exact-entry-h1", measured.semantics.h1Text?.toUpperCase() === "WHERE DO YOU ENTER?", "WHERE DO YOU ENTER?", measured.semantics.h1Text),
    check("semantic-entry-scene", measured.entry?.dataHomeScene === "entry", "entry", measured.entry?.dataHomeScene),
    check("two-entry-routes", JSON.stringify(routeHrefs) === JSON.stringify(["/for-partners/", "/for-startups/"]), ["/for-partners/", "/for-startups/"], routeHrefs),
    check("operating-field-section-order", JSON.stringify(sectionIds) === JSON.stringify(EXPECTED_OPERATING_SECTION_IDS), EXPECTED_OPERATING_SECTION_IDS, sectionIds),
    check("operating-field-headings-present", measured.semantics.operatingSections.every(({ heading }) => Boolean(heading)), "all seven sections have semantic headings", measured.semantics.operatingSections.map(({ id, heading }) => ({ id, heading }))),
    check("native-document-scroll-only", measured.document.nestedVerticalScrollers.length === 0, [], measured.document.nestedVerticalScrollers),
    check("horizontal-overflow-safe", (measured.document.horizontalOverflow ?? Infinity) <= 2, "<=2 CSS px", measured.document.horizontalOverflow),
    check("single-main-landmark", measured.document.mainCount === 1, 1, measured.document.mainCount),
    check("runtime-proxy-labeled", EVIDENCE_LABEL.includes("accepted prior/runtime proxy") && EVIDENCE_LABEL.includes("not authorized"), EVIDENCE_LABEL, EVIDENCE_LABEL),
    check("integration-authorization-denied", AUTHORIZATION.finalRefinedMediaIntegration === false, false, AUTHORIZATION.finalRefinedMediaIntegration),
  ];
}

function releasedChecks(measured, viewport, { requireEnhanced = true, requireCompleteEntry = false, expectedRuntimeFamily = null } = {}) {
  const completeBounds = [measured.entry?.contentBounds, measured.semantics.h1Bounds, ...measured.semantics.routes.map(({ bounds }) => bounds)];
  return [
    ...semanticChecks(measured),
    check("cinematic-mode-enhanced", !requireEnhanced || measured.root.cinematicMode === "enhanced", requireEnhanced ? "enhanced" : "enhanced or static", measured.root.cinematicMode),
    check("settled-phase", measured.shell?.phase === "settled", "settled", measured.shell?.phase),
    check("settled-progress", (measured.shell?.scrollProgress ?? 0) >= .9995, ">=0.9995", measured.shell?.scrollProgress),
    check("chrome-released", measured.root.cinematicHeader === "released", "released", measured.root.cinematicHeader),
    check("header-visible", measured.header?.visibility === "visible" && (measured.header?.opacity ?? 0) >= .999, "visible at opacity 1", { visibility: measured.header?.visibility, opacity: measured.header?.opacity }),
    check("header-interactive", measured.header?.inert === false && measured.header?.pointerEvents !== "none" && measured.header?.hitTested === true, "non-inert, pointer-active, hit-tested", measured.header),
    check("entry-interactive", measured.entry?.inert === false && measured.entry?.pointerEvents !== "none" && measured.entry?.focusableDescendantCount === 2, "non-inert with two focusable routes", measured.entry),
    check("entry-content-opaque", (measured.entry?.contentOpacity ?? 0) >= .999, ">=0.999", measured.entry?.contentOpacity),
    check("runtime-media-family", !expectedRuntimeFamily || measured.shell?.mediaFamily === expectedRuntimeFamily, expectedRuntimeFamily, measured.shell?.mediaFamily),
    check("complete-entry-in-viewport", !requireCompleteEntry || completeBounds.every((bounds) => withinViewport(bounds, viewport)), "ENTRY content, H1, and both routes fully within viewport", completeBounds),
  ];
}

function concealedChecks(measured, expectedRuntimeFamily) {
  return [
    ...semanticChecks(measured),
    check("active-not-settled", measured.shell?.phase !== "settled" && (measured.shell?.scrollProgress ?? 1) < .9995, "phase is physical/takeover below 0.9995", { phase: measured.shell?.phase, scrollProgress: measured.shell?.scrollProgress }),
    check("chrome-concealed", measured.root.cinematicHeader === "concealed", "concealed", measured.root.cinematicHeader),
    check("header-fully-suppressed", measured.header?.visibility === "hidden" && (measured.header?.opacity ?? 1) <= .001 && measured.header?.pointerEvents === "none" && measured.header?.inert === true && measured.header?.hitTested === false && measured.header?.visibleChromeCount === 0, "hidden, opacity 0, inert, not hit-tested", measured.header),
    check("entry-fully-suppressed", measured.entry?.inert === true && measured.entry?.pointerEvents === "none" && measured.entry?.focusableDescendantCount === 0, "inert, pointer-disabled, no focus targets", measured.entry),
    check("runtime-media-family", measured.shell?.mediaFamily === expectedRuntimeFamily, expectedRuntimeFamily, measured.shell?.mediaFamily),
  ];
}

function privacyFindings(bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString("latin1") : String(bytes);
  return PRIVATE_PATTERNS
    .filter(({ expression }) => expression.test(text))
    .map(({ id }) => id);
}

async function sanitizePng(rawBytes, viewport) {
  const sanitized = await sharp(rawBytes, { failOn: "error" })
    .rotate()
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toBuffer();
  const metadata = await sharp(sanitized, { failOn: "error" }).metadata();
  if (metadata.format !== "png" || metadata.width !== viewport.width || metadata.height !== viewport.height) {
    throw new Error(`Sanitized PNG geometry mismatch: ${metadata.width}x${metadata.height}, expected ${viewport.width}x${viewport.height}`);
  }
  const retainedMetadata = ["exif", "icc", "iptc", "xmp"].filter((field) => Boolean(metadata[field]));
  const findings = privacyFindings(sanitized);
  if (retainedMetadata.length || findings.length) {
    throw new Error(`PNG sanitization failed: ${JSON.stringify({ retainedMetadata, findings })}`);
  }
  return { bytes: sanitized, metadata: { format: metadata.format, width: metadata.width, height: metadata.height, retainedMetadata, privacyFindings: findings } };
}

async function atomicWrite(destination, bytes) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try {
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function artifactRecord(relativePath, bytes, details) {
  return {
    relativePath: relativePath.replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: sha256(bytes),
    ...details,
  };
}

async function captureState({ page, outputRoot, finalHead, id, group, viewport, expected, checks }) {
  await settle(page);
  const measured = await readHomeState(page);
  const raw = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", caret: "hide", scale: "css" });
  const sanitized = await sanitizePng(raw, viewport);
  const screenshotRelativePath = `captures/${id}.png`;
  await atomicWrite(path.join(outputRoot, ...screenshotRelativePath.split("/")), sanitized.bytes);
  const screenshot = artifactRecord(screenshotRelativePath, sanitized.bytes, {
    mediaType: "image/png",
    purpose: `${group} browser evidence`,
    viewport: `${viewport.width}x${viewport.height}`,
    stateId: id,
    sanitization: sanitized.metadata,
  });
  const evaluatedChecks = checks(measured);
  evaluatedChecks.push(check("screenshot-exact-viewport", sanitized.metadata.width === viewport.width && sanitized.metadata.height === viewport.height, viewport, { width: sanitized.metadata.width, height: sanitized.metadata.height }));
  evaluatedChecks.push(check("screenshot-private-metadata-absent", sanitized.metadata.retainedMetadata.length === 0 && sanitized.metadata.privacyFindings.length === 0, "no EXIF/ICC/IPTC/XMP or private path text", sanitized.metadata));
  const record = {
    schema: "quantum-hub.phase-4r1-1.browser-regression-state.v1",
    id,
    group,
    status: evaluatedChecks.every(({ passed }) => passed) ? "PASS" : "FAIL",
    evidenceClassification: "ACCEPTED_PRIOR_RUNTIME_PROXY",
    evidenceLabel: EVIDENCE_LABEL,
    finalHead,
    viewport,
    expected,
    measured,
    checks: evaluatedChecks,
    authorization: AUTHORIZATION,
    screenshot,
    privacy: {
      status: "PASS",
      pngMetadataStripped: true,
      privatePathPatternsAbsent: true,
    },
  };
  const stateRelativePath = `states/${id}.json`;
  const stateBytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  const statePrivacyFindings = privacyFindings(stateBytes);
  if (statePrivacyFindings.length) throw new Error(`${id} JSON privacy failure: ${statePrivacyFindings.join(", ")}`);
  await atomicWrite(path.join(outputRoot, ...stateRelativePath.split("/")), stateBytes);
  const stateJson = artifactRecord(stateRelativePath, stateBytes, {
    mediaType: "application/json",
    purpose: `${group} measurements and checks`,
    viewport: `${viewport.width}x${viewport.height}`,
    stateId: id,
  });
  return { record, screenshot, stateJson };
}

async function gotoHome(page, baseUrl) {
  const response = await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (!response || response.status() !== 200) throw new Error(`Homepage returned ${response?.status() ?? "no response"}`);
  return response.status();
}

function contextOptions(viewport, extras = {}) {
  return {
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "no-preference",
    ...extras,
  };
}

async function captureSettledViewport(browser, options, viewport) {
  const context = await browser.newContext(contextOptions(viewport));
  const page = await context.newPage();
  const network = observeNetwork(page);
  try {
    await gotoHome(page, options.baseUrl);
    await waitForController(page);
    const geometry = await cinematicGeometry(page);
    await setProgress(page, geometry, 1);
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-cinematic-phase") === "settled" && document.documentElement.dataset.cinematicHeader === "released");
    const id = `settled-entry-${viewport.id}`;
    return await captureState({
      page,
      outputRoot: options.output,
      finalHead: options.expectedHead,
      id,
      group: "responsive-settled-entry",
      viewport,
      expected: {
        state: "complete settled semantic ENTRY",
        runtimeFamily: viewport.expectedRuntimeFamily,
        runtimeFamilyReason: viewport.familyReason,
        runtimeMediaClassification: EVIDENCE_LABEL,
      },
      checks: (measured) => [
        ...releasedChecks(measured, viewport, { requireEnhanced: true, requireCompleteEntry: true, expectedRuntimeFamily: viewport.expectedRuntimeFamily }),
        check("runtime-media-ready", measured.shell?.mediaState === "ready", "ready", measured.shell?.mediaState),
        check("runtime-network-clean", network.record.pageErrors.length === 0 && network.record.consoleErrors.length === 0, "no page or console errors", network.snapshot()),
      ],
    });
  } finally {
    await context.close();
  }
}

async function captureChromeTrack(browser, options, viewport) {
  const context = await browser.newContext(contextOptions(viewport));
  const page = await context.newPage();
  const network = observeNetwork(page);
  const records = [];
  try {
    await gotoHome(page, options.baseUrl);
    await waitForController(page);
    const geometry = await cinematicGeometry(page);

    await setProgress(page, geometry, .66);
    records.push(await captureState({
      page,
      outputRoot: options.output,
      finalHead: options.expectedHead,
      id: "active-cinematic-844x390",
      group: "chrome-active-cinematic",
      viewport,
      expected: { state: "active accepted-prior physical runtime proxy with all site chrome concealed", requestedDocumentProgress: .66 },
      checks: (measured) => [
        ...concealedChecks(measured, viewport.expectedRuntimeFamily),
        check("active-runtime-ready", measured.shell?.mediaState === "ready", "ready", measured.shell?.mediaState),
      ],
    }));

    await setProgress(page, geometry, 1);
    records.push(await captureState({
      page,
      outputRoot: options.output,
      finalHead: options.expectedHead,
      id: "settled-entry-844x390",
      group: "responsive-settled-entry",
      viewport,
      expected: { state: "complete settled semantic ENTRY; site chrome released only at settled boundary", runtimeFamily: viewport.expectedRuntimeFamily, runtimeFamilyReason: viewport.familyReason },
      checks: (measured) => [
        ...releasedChecks(measured, viewport, { requireEnhanced: true, requireCompleteEntry: true, expectedRuntimeFamily: viewport.expectedRuntimeFamily }),
        check("settled-runtime-ready", measured.shell?.mediaState === "ready", "ready", measured.shell?.mediaState),
      ],
    }));

    await page.evaluate(() => {
      const menu = document.querySelector("[data-mobile-nav]");
      if (menu instanceof HTMLDetailsElement) menu.open = true;
      document.querySelector(".site-header a")?.focus();
    });
    await setProgress(page, geometry, .995);
    records.push(await captureState({
      page,
      outputRoot: options.output,
      finalHead: options.expectedHead,
      id: "reverse-concealed-844x390",
      group: "chrome-reverse",
      viewport,
      expected: { state: "one-step reverse below settled boundary reconceals chrome and closes the menu", requestedDocumentProgress: .995 },
      checks: (measured) => [
        ...concealedChecks(measured, viewport.expectedRuntimeFamily),
        check("reverse-progress-below-settle", (measured.shell?.scrollProgress ?? 1) < .9995, "<0.9995", measured.shell?.scrollProgress),
        check("reverse-focus-safe", measured.activeElement?.className.includes("skip-link") === true, "focus moved to skip-link", measured.activeElement),
      ],
    }));
    const snapshot = network.snapshot();
    if (snapshot.pageErrors.length || snapshot.consoleErrors.length) {
      throw new Error(`Chrome track runtime errors: ${JSON.stringify(snapshot)}`);
    }
    return records;
  } finally {
    await context.close();
  }
}

async function captureSkipIntro(browser, options, viewport) {
  const context = await browser.newContext(contextOptions(viewport));
  let releaseHeldMedia = null;
  let heldMedia = null;
  await context.route("**/media/cinematic/*", async (route) => {
    if (!/\.(?:mp4|webm)(?:\?|$)/iu.test(route.request().url())) return route.continue();
    heldMedia = { path: safeRequestPath(route.request().url()), held: true };
    await new Promise((resolve) => {
      releaseHeldMedia = async () => {
        await route.abort("aborted");
        resolve();
      };
    });
  });
  const page = await context.newPage();
  const network = observeNetwork(page);
  try {
    await gotoHome(page, options.baseUrl);
    await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "loading");
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => document.activeElement?.classList.contains("skip-link"));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => location.hash === "#entry" && document.documentElement.dataset.cinematicHeader === "released" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-cinematic-phase") === "settled");
    const record = await captureState({
      page,
      outputRoot: options.output,
      finalHead: options.expectedHead,
      id: "skip-intro-844x390",
      group: "skip-intro",
      viewport,
      expected: { state: "native skip settles and exposes semantic ENTRY while accepted-prior media remains deliberately pending" },
      checks: (measured) => [
        ...releasedChecks(measured, viewport, { requireEnhanced: true, requireCompleteEntry: true, expectedRuntimeFamily: viewport.expectedRuntimeFamily }),
        check("skip-hash-entry", measured.location === "/#entry", "/#entry", measured.location),
        check("skip-focus-entry", measured.activeElement?.inEntry === true, true, measured.activeElement),
        check("skip-does-not-require-media", Boolean(heldMedia) && measured.shell?.mediaState === "loading", "held media request and loading state", { heldMedia, mediaState: measured.shell?.mediaState }),
      ],
    });
    return record;
  } finally {
    if (releaseHeldMedia) await releaseHeldMedia().catch(() => {});
    await context.close();
  }
}

async function captureReducedMotion(browser, options, viewport) {
  const context = await browser.newContext(contextOptions(viewport, { reducedMotion: "reduce" }));
  const page = await context.newPage();
  const network = observeNetwork(page);
  try {
    await gotoHome(page, options.baseUrl);
    await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "static" && document.documentElement.dataset.cinematicHeader === "released");
    return await captureState({
      page,
      outputRoot: options.output,
      finalHead: options.expectedHead,
      id: "reduced-motion-844x390",
      group: "fallback-reduced-motion",
      viewport,
      expected: { state: "released static semantic Home; cinematic controller and media are not requested" },
      checks: (measured) => [
        ...semanticChecks(measured),
        check("reduced-motion-static", measured.root.cinematicMode === "static" && measured.root.cinematicBootstrap === "reduced-motion", "static/reduced-motion", measured.root),
        check("reduced-motion-chrome-released", measured.root.cinematicHeader === "released" && measured.header?.inert === false && measured.header?.visibility === "visible", "released visible non-inert header", { root: measured.root, header: measured.header }),
        check("reduced-motion-entry-interactive", measured.entry?.inert === false && measured.entry?.focusableDescendantCount === 2, "interactive ENTRY", measured.entry),
        check("reduced-motion-no-controller-or-media", network.record.controllerRequests.length === 0 && network.record.mediaRequests.length === 0, "no controller or media requests", network.snapshot()),
      ],
    });
  } finally {
    await context.close();
  }
}

async function captureNoJavaScript(browser, options, viewport) {
  const context = await browser.newContext(contextOptions(viewport, { javaScriptEnabled: false }));
  const page = await context.newPage();
  const network = observeNetwork(page);
  try {
    await gotoHome(page, options.baseUrl);
    const record = await captureState({
      page,
      outputRoot: options.output,
      finalHead: options.expectedHead,
      id: "no-javascript-844x390",
      group: "fallback-no-javascript",
      viewport,
      expected: { state: "SSR semantic Home remains visible and usable with JavaScript disabled" },
      checks: (measured) => [
        ...semanticChecks(measured),
        check("nojs-cinematic-attributes-absent", measured.root.cinematicMode === null && measured.root.cinematicHeader === null, { cinematicMode: null, cinematicHeader: null }, measured.root),
        check("nojs-header-visible", measured.header?.visibility === "visible" && measured.header?.inert === false && measured.header?.pointerEvents !== "none", "visible non-inert pointer-active header", measured.header),
        check("nojs-entry-interactive", measured.entry?.inert === false && measured.entry?.focusableDescendantCount === 2, "interactive ENTRY with two routes", measured.entry),
        check("nojs-no-controller-or-media", network.record.controllerRequests.length === 0 && network.record.mediaRequests.length === 0, "no controller or media requests", network.snapshot()),
      ],
    });
    return record;
  } finally {
    await context.close();
  }
}

async function captureNativeOperatingField(browser, options, viewport) {
  const context = await browser.newContext(contextOptions(viewport));
  const page = await context.newPage();
  const network = observeNetwork(page);
  try {
    await gotoHome(page, options.baseUrl);
    await waitForController(page);
    const geometry = await cinematicGeometry(page);
    await setProgress(page, geometry, 1);
    await page.waitForFunction(() => document.documentElement.dataset.operatingField === "enhanced" && document.querySelector("#method")?.getAttribute("data-method-sticky") === "false");
    await page.locator("#method").evaluate((element) => {
      const header = document.querySelector(".site-header");
      const top = element.getBoundingClientRect().top + scrollY - (header?.getBoundingClientRect().height ?? 0) - 16;
      window.scrollTo({ top, left: 0, behavior: "instant" });
    });
    await settle(page);
    const beforeKeyboardScroll = await readHomeState(page);
    await page.keyboard.press("PageDown");
    await page.waitForFunction((before) => scrollY > before + 40, beforeKeyboardScroll.document.scrollY, { timeout: 4_000 });
    await settle(page);
    return await captureState({
      page,
      outputRoot: options.output,
      finalHead: options.expectedHead,
      id: "native-scroll-operating-field-768x1024",
      group: "native-scroll-semantic-operating-field",
      viewport,
      expected: {
        state: "semantic Operating Field in native root document flow",
        keyboardProbe: "PageDown advances root scroll without a nested scroller",
        expectedOperatingField: "enhanced",
        expectedMethodSticky: "false",
      },
      checks: (measured) => [
        ...semanticChecks(measured),
        check("native-keyboard-scroll", (measured.document.scrollY ?? 0) > (beforeKeyboardScroll.document.scrollY ?? 0) + 40, `>${(beforeKeyboardScroll.document.scrollY ?? 0) + 40}`, measured.document.scrollY),
        check("operating-field-enhanced", measured.root.operatingField === "enhanced", "enhanced", measured.root.operatingField),
        check("tablet-method-normal-flow", measured.method?.dataMethodSticky === "false", "false", measured.method?.dataMethodSticky),
        check("method-semantic-heading", measured.method?.heading === "A disciplined route through uncertainty.", "A disciplined route through uncertainty.", measured.method?.heading),
        check("chrome-remains-released-below-entry", measured.root.cinematicHeader === "released" && measured.header?.inert === false, "released non-inert header", { rootHeader: measured.root.cinematicHeader, headerInert: measured.header?.inert }),
        check("operating-field-network-clean", network.record.pageErrors.length === 0 && network.record.consoleErrors.length === 0, "no page or console errors", network.snapshot()),
      ],
    });
  } finally {
    await context.close();
  }
}

function runtimeFamilyFor(viewport) {
  const portraitTabletOrPhone = viewport.width <= 800 && viewport.height > viewport.width;
  const narrowLandscape = viewport.width <= 900 && viewport.height <= 480;
  return portraitTabletOrPhone || narrowLandscape ? "mobile" : "desktop";
}

function runSelfTest() {
  const checks = [
    check("required-state-ids-unique", new Set(REQUIRED_STATE_IDS).size === REQUIRED_STATE_IDS.length, REQUIRED_STATE_IDS.length, new Set(REQUIRED_STATE_IDS).size),
    check("required-state-count", REQUIRED_STATE_IDS.length === 10, 10, REQUIRED_STATE_IDS.length),
    check("responsive-family-contract", VIEWPORTS.every((viewport) => runtimeFamilyFor(viewport) === viewport.expectedRuntimeFamily), "all viewport family declarations match runtime selection logic", VIEWPORTS.map((viewport) => ({ id: viewport.id, declared: viewport.expectedRuntimeFamily, calculated: runtimeFamilyFor(viewport) }))),
    check("operating-section-contract", EXPECTED_OPERATING_SECTION_IDS.length === 7 && new Set(EXPECTED_OPERATING_SECTION_IDS).size === 7, "seven unique semantic Operating Field sections", EXPECTED_OPERATING_SECTION_IDS),
    check("proxy-label-unambiguous", EVIDENCE_LABEL.includes("accepted prior/runtime proxy") && EVIDENCE_LABEL.includes("not authorized") && EVIDENCE_LABEL.includes("has not started"), "prior/runtime proxy with explicit integration denial", EVIDENCE_LABEL),
    check("authorization-denials", Object.values(AUTHORIZATION).every((value) => value === false), "all authorization flags false", AUTHORIZATION),
    check("privacy-detector-positive-control", privacyFindings("C:\\Users\\example\\OneDrive\\evidence.json").includes("windows-user-path"), true, privacyFindings("C:\\Users\\example\\OneDrive\\evidence.json")),
    check("privacy-detector-negative-control", privacyFindings(`${EVIDENCE_LABEL} scripts/example.mjs`).length === 0, [], privacyFindings(`${EVIDENCE_LABEL} scripts/example.mjs`)),
  ];
  const status = checks.every(({ passed }) => passed) ? "PASS" : "FAIL";
  process.stdout.write(`${JSON.stringify({
    schema: "quantum-hub.phase-4r1-1.browser-regression-self-test.v1",
    status,
    browserLaunched: false,
    serverStarted: false,
    filesystemWrites: 0,
    checks,
  }, null, 2)}\n`);
  if (status !== "PASS") process.exitCode = 2;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  validateCaptureArguments(options);
  if (await exists(options.output)) throw new Error(`Refusing to overwrite existing output directory: ${options.output}`);

  const beforeGit = gitState(options.expectedHead, options.expectedBranch);
  if (!beforeGit.ready) throw new Error(`Exact clean pushed local/upstream authority is required: ${JSON.stringify(beforeGit, null, 2)}`);
  const producerAuthority = await authorityRecord(SCRIPT_RELATIVE_PATH);
  const runtimeSourcesBefore = await authorityRecords(RUNTIME_SOURCE_PATHS);
  const runtimeMediaBefore = await authorityRecords(PRIOR_RUNTIME_MEDIA_PATHS);
  const chromePath = await resolveChrome(options.browser);

  await mkdir(path.join(options.output, "captures"), { recursive: true });
  await mkdir(path.join(options.output, "states"), { recursive: true });
  let preview = null;
  let browser = null;
  try {
    if (options.serverMode === "astro-preview") preview = startPreview(options.baseUrl);
    await waitForServer(options.baseUrl, preview);
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
    const browserVersion = browser.version();
    const states = [];

    for (const viewport of VIEWPORTS.filter(({ id }) => id !== "844x390")) {
      states.push(await captureSettledViewport(browser, options, viewport));
    }
    states.push(...await captureChromeTrack(browser, options, VIEWPORTS.find(({ id }) => id === "844x390")));
    states.push(await captureSkipIntro(browser, options, VIEWPORTS.find(({ id }) => id === "844x390")));
    states.push(await captureReducedMotion(browser, options, VIEWPORTS.find(({ id }) => id === "844x390")));
    states.push(await captureNoJavaScript(browser, options, VIEWPORTS.find(({ id }) => id === "844x390")));
    states.push(await captureNativeOperatingField(browser, options, VIEWPORTS.find(({ id }) => id === "768x1024")));

    const actualStateIds = states.map(({ record }) => record.id);
    const missingStateIds = REQUIRED_STATE_IDS.filter((id) => !actualStateIds.includes(id));
    const unexpectedStateIds = actualStateIds.filter((id) => !REQUIRED_STATE_IDS.includes(id));
    const duplicateStateIds = [...new Set(actualStateIds.filter((id, index) => actualStateIds.indexOf(id) !== index))];
    const stateInventoryPass = missingStateIds.length === 0 && unexpectedStateIds.length === 0 && duplicateStateIds.length === 0 && actualStateIds.length === REQUIRED_STATE_IDS.length;

    const runtimeSourcesAfter = await authorityRecords(RUNTIME_SOURCE_PATHS);
    const runtimeMediaAfter = await authorityRecords(PRIOR_RUNTIME_MEDIA_PATHS);
    const afterGit = gitState(options.expectedHead, options.expectedBranch);
    const runtimeSourceMutationAbsent = JSON.stringify(runtimeSourcesBefore) === JSON.stringify(runtimeSourcesAfter);
    const runtimeMediaMutationAbsent = JSON.stringify(runtimeMediaBefore) === JSON.stringify(runtimeMediaAfter);
    const repositoryMutationAbsent = beforeGit.head === afterGit.head
      && beforeGit.branch === afterGit.branch
      && beforeGit.workingTreeClean
      && afterGit.workingTreeClean
      && JSON.stringify(beforeGit.statusPorcelain) === JSON.stringify(afterGit.statusPorcelain);
    const allStateChecksPass = states.every(({ record }) => record.status === "PASS");
    const artifacts = states.flatMap(({ screenshot, stateJson }) => [screenshot, stateJson]);
    const privacyChecks = artifacts.map((artifact) => ({ relativePath: artifact.relativePath, status: "PASS", privatePathPatternsAbsent: true }));
    const reportStatus = stateInventoryPass
      && allStateChecksPass
      && repositoryMutationAbsent
      && runtimeSourceMutationAbsent
      && runtimeMediaMutationAbsent
      && afterGit.ready
      && Object.values(AUTHORIZATION).every((value) => value === false)
      ? "PASS"
      : "FAIL";
    const report = {
      schema: SCHEMA,
      status: reportStatus,
      humanAcceptance: null,
      evidenceClassification: "ACCEPTED_PRIOR_RUNTIME_PROXY",
      evidenceLabel: EVIDENCE_LABEL,
      binding: {
        passedFinalHead: options.expectedHead,
        capturedHead: afterGit.head,
        exact: afterGit.head === options.expectedHead,
        branch: afterGit.branch,
        expectedBranch: options.expectedBranch,
        cleanTree: afterGit.workingTreeClean,
        upstream: afterGit.upstream,
        upstreamHead: afterGit.upstreamHead,
        localUpstreamParity: afterGit.upstreamParity,
        liveRemoteQueriedByProducer: false,
        note: "Live remote parity is a separate final handoff invariant; this producer binds payloads to the exact passed local/upstream HEAD without embedding remote credentials or URLs.",
      },
      authorization: AUTHORIZATION,
      runtimeMediaAuthority: {
        classification: "accepted-prior-runtime-proxy",
        sourceGeneration: "accepted Phase 3 runtime media",
        finalR11RefinedMediaIntegrated: false,
        finalR11RefinedMediaIntegrationAuthorized: false,
        media: runtimeMediaAfter,
        limitation: "Browser captures prove responsive semantic/chrome/fallback behavior against the currently integrated accepted prior runtime. They are not evidence that final R1.1 Blender media has been integrated.",
      },
      responsiveAuthority: VIEWPORTS.map((viewport) => ({
        viewport: viewport.id,
        authoredRuntimeFamily: viewport.expectedRuntimeFamily,
        reason: viewport.familyReason,
      })),
      producerAuthorities: {
        captureScript: producerAuthority,
        runtimeSources: runtimeSourcesAfter,
      },
      environment: {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        browser: { product: "Chromium", version: browserVersion },
        baseUrl: options.baseUrl,
        serverMode: options.serverMode,
        devicePixelRatio: 1,
      },
      contract: {
        requiredStateIds: REQUIRED_STATE_IDS,
        actualStateIds,
        missingStateIds,
        unexpectedStateIds,
        duplicateStateIds,
        stateInventoryPass,
        expectedOperatingSectionIds: EXPECTED_OPERATING_SECTION_IDS,
        outputExternalToRepository: true,
        overwriteRefused: true,
        rawUnsanitizedPngsRetained: false,
      },
      summary: {
        stateCount: states.length,
        passedStateCount: states.filter(({ record }) => record.status === "PASS").length,
        failedStateCount: states.filter(({ record }) => record.status !== "PASS").length,
        checkCount: states.reduce((total, { record }) => total + record.checks.length, 0),
        failedChecks: states.flatMap(({ record }) => record.checks.filter(({ passed }) => !passed).map((item) => ({ stateId: record.id, ...item }))),
        responsiveSettledEntry: ["320x800", "360x800", "768x1024", "844x390"],
        chromeSuppression: ["active-cinematic-844x390", "settled-entry-844x390", "reverse-concealed-844x390"],
        fallbacks: ["skip-intro-844x390", "reduced-motion-844x390", "no-javascript-844x390"],
        operatingField: "native-scroll-operating-field-768x1024",
      },
      mutationAudit: {
        status: repositoryMutationAbsent && runtimeSourceMutationAbsent && runtimeMediaMutationAbsent ? "PASS" : "FAIL",
        repositoryMutationAbsent,
        runtimeSourceMutationAbsent,
        runtimeMediaMutationAbsent,
        before: beforeGit,
        after: afterGit,
      },
      privacyAudit: {
        status: "PASS",
        policy: "Every screenshot is decoded and re-encoded by Sharp without EXIF/ICC/IPTC/XMP; every PNG and JSON payload is scanned for private local path markers before atomic write.",
        privatePatterns: PRIVATE_PATTERNS.map(({ id }) => id),
        checkedPayloadCount: artifacts.length,
        checks: privacyChecks,
        reportValidatedBeforeAtomicWrite: true,
      },
      states: states.map(({ record, screenshot, stateJson }) => ({
        id: record.id,
        group: record.group,
        status: record.status,
        viewport: record.viewport,
        expected: record.expected,
        failedChecks: record.checks.filter(({ passed }) => !passed),
        screenshot,
        stateJson,
      })),
      artifacts,
      limitations: [
        "The browser-visible film is the accepted prior Phase 3 runtime proxy; final R1.1 refined-media integration has not started and is not authorized.",
        "The browser producer proves semantic, responsive, chrome, skip, reduced-motion, no-JavaScript, and native-scroll behavior; it does not judge the final Blender periphery, graphite current, mobile optics, or CRT phosphor appearance.",
        "Machine PASS is not human acceptance of Phase 4-R1.1.",
        "Live remote parity is intentionally not queried by this capture producer and must be verified separately in the final Git handoff.",
      ],
    };
    const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
    const reportPrivacyFindings = privacyFindings(reportBytes);
    if (reportPrivacyFindings.length) throw new Error(`Report privacy failure: ${reportPrivacyFindings.join(", ")}`);
    await atomicWrite(path.join(options.output, REPORT_FILENAME), reportBytes);
    process.stdout.write(`${JSON.stringify({
      status: reportStatus,
      output: options.output,
      report: { filename: REPORT_FILENAME, bytes: reportBytes.length, sha256: sha256(reportBytes) },
      finalHead: options.expectedHead,
      stateCount: states.length,
      artifactCount: artifacts.length,
      failedStateCount: report.summary.failedStateCount,
      repositoryMutationAbsent,
      finalRefinedMediaIntegration: false,
    }, null, 2)}\n`);
    if (reportStatus !== "PASS") process.exitCode = 2;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (preview && preview.exitCode === null) {
      preview.kill();
      await new Promise((resolve) => {
        preview.once("exit", resolve);
        setTimeout(resolve, 2_000);
      });
    }
  }
}

main().catch((error) => {
  process.stderr.write(`Phase 4-R1.1 browser/regression producer failed: ${sanitizeMessage(error.stack ?? error.message)}\n`);
  process.exitCode = 1;
});
