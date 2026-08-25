import { constants as fsConstants } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_FILENAME = "phase4r1-chrome-evidence-report.json";
const SCHEMA = "quantum-hub.phase-4r1.chrome-evidence.v2";
const SOURCE_LABEL = "current-runtime chrome-state proxy — R1 physical runtime integration not authorized";
const DESKTOP = Object.freeze({ id: "desktop-1440x900", width: 1440, height: 900 });
const MOBILE = Object.freeze({ id: "mobile-390x844", width: 390, height: 844 });
const REQUIRED_STATE_IDS = Object.freeze([
  "first-paint-desktop",
  "first-paint-mobile",
  "dormancy",
  "conduction-25",
  "conduction-50",
  "q-activation",
  "q-hold",
  "approach",
  "threshold",
  "breathing",
  "entry-first-readable",
  "entry-settled",
  "reverse-one-step",
  "fast-jump-forward",
  "fast-jump-reverse",
  "fast-jump-latest",
  "skip-media-pending",
  "reduced-motion",
  "no-javascript",
  "deep-link-entry",
  "deep-link-method",
  "restored-settled",
  "restored-lower",
  "text-200-desktop",
  "text-200-mobile",
  "media-abort",
  "media-404",
  "supporting-about",
  "real-404",
]);

function argumentValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4336",
    browser: process.env.CHROME_PATH ?? null,
    ffmpeg: process.env.FFMPEG_PATH ?? null,
    output: null,
    serverMode: "astro-preview",
    allowDirty: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--base-url") {
      options.baseUrl = argumentValue(argv, index, value);
      index += 1;
    } else if (value === "--browser") {
      options.browser = argumentValue(argv, index, value);
      index += 1;
    } else if (value === "--ffmpeg") {
      options.ffmpeg = argumentValue(argv, index, value);
      index += 1;
    } else if (value === "--output") {
      options.output = path.resolve(argumentValue(argv, index, value));
      index += 1;
    } else if (value === "--server-mode") {
      options.serverMode = argumentValue(argv, index, value);
      index += 1;
    } else if (value === "--allow-dirty") {
      options.allowDirty = true;
    } else if (value === "--help" || value === "-h") {
      console.log("Usage: node scripts/capture-phase4r1-chrome-evidence.mjs --output ABSOLUTE_EXTERNAL_DIR --ffmpeg PATH [--browser PATH] [--base-url URL] [--server-mode astro-preview|external] [--allow-dirty]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  if (!options.output) throw new Error("--output is required");
  if (!options.ffmpeg) throw new Error("--ffmpeg is required");
  if (!path.isAbsolute(options.output)) throw new Error("--output must be absolute");
  if ([ROOT, path.join(ROOT, "artifacts")].some((parent) => pathIsWithin(parent, options.output))) {
    throw new Error("Chrome evidence must be external to Git");
  }
  if (!['astro-preview', 'external'].includes(options.serverMode)) {
    throw new Error("--server-mode must be astro-preview or external");
  }
  return options;
}

function pathIsWithin(parent, candidate) {
  const normalize = (value) => process.platform === "win32"
    ? path.resolve(value).toLowerCase()
    : path.resolve(value);
  const relative = path.relative(normalize(parent), normalize(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
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
  if (override) candidates.push(path.resolve(override));
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    );
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) if (await executable(candidate)) return path.resolve(candidate);
  throw new Error("Chrome/Chromium was not found. Set CHROME_PATH or pass --browser.");
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function startPreview(baseUrl) {
  const url = new URL(baseUrl);
  const child = spawn(process.execPath, [
    path.join(ROOT, "scripts", "serve-phase4-dist.mjs"),
    "--host",
    url.hostname,
    "--port",
    url.port || "4321",
  ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  child.captureOutput = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding("utf8");
    stream?.on("data", (chunk) => {
      child.captureOutput = (child.captureOutput + chunk).slice(-6000);
    });
  }
  return child;
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`Preview exited (${child.exitCode}): ${child.captureOutput}`);
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function fileRecord(absolutePath, relativeBase) {
  const buffer = await readFile(absolutePath);
  return {
    relativePath: path.relative(relativeBase, absolutePath).replaceAll("\\", "/"),
    bytes: buffer.length,
    sha256: sha256(buffer),
  };
}

async function producerAuthority(relativePath, requireTracked = true) {
  if (requireTracked) git("ls-files", "--error-unmatch", relativePath);
  const absolutePath = path.join(ROOT, ...relativePath.split("/"));
  const buffer = await readFile(absolutePath);
  return { path: relativePath, bytes: buffer.length, sha256: sha256(buffer) };
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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

async function readState(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector("[data-cinematic-shell]");
    const header = document.querySelector(".site-header");
    const entry = document.querySelector("#entry");
    const entryContent = entry?.querySelector(".entry-field__content");
    const stage = document.querySelector("[data-cinematic-stage]");
    const video = document.querySelector("[data-cinematic-media]");
    const menu = header?.querySelector("[data-mobile-nav]");
    const active = document.activeElement;
    const style = (element) => element ? getComputedStyle(element) : null;
    const number = (value) => {
      const parsed = Number.parseFloat(value ?? "");
      return Number.isFinite(parsed) ? parsed : null;
    };
    const focusableSelector = "a[href],button,summary,input:not([type=hidden]),select,textarea,[tabindex]";
    const effectiveFocusable = (element) => !element.closest("[inert]") && !element.hasAttribute("disabled") && element.tabIndex >= 0;
    const visible = (element) => {
      const computed = style(element);
      const rect = element?.getBoundingClientRect();
      return Boolean(element && computed && rect && computed.display !== "none" && computed.visibility !== "hidden" && Number.parseFloat(computed.opacity) > .001 && rect.width > 0 && rect.height > 0);
    };
    const headerStyle = style(header);
    const entryStyle = style(entry);
    const headerRect = header?.getBoundingClientRect();
    const hitTested = Boolean(header && headerRect && headerRect.width > 0 && headerRect.height > 0 && document.elementsFromPoint(
      Math.min(innerWidth - 1, Math.max(0, headerRect.left + headerRect.width / 2)),
      Math.min(innerHeight - 1, Math.max(0, headerRect.top + headerRect.height / 2)),
    ).some((element) => element === header || header.contains(element)));
    const nestedVerticalScrollers = [...document.querySelectorAll("main *")].filter((element) => {
      const computed = style(element);
      return computed && ["auto", "scroll"].includes(computed.overflowY) && element.scrollHeight > element.clientHeight + 2;
    }).map((element) => `${element.tagName.toLowerCase()}.${String(element.className)}`);
    const absoluteTop = (element) => element ? element.getBoundingClientRect().top + scrollY : null;
    return {
      url: location.href,
      path: location.pathname,
      hash: location.hash,
      viewport: { width: innerWidth, height: innerHeight },
      scrollY,
      maxScroll: Math.max(0, root.scrollHeight - innerHeight),
      horizontalOverflow: Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0) - innerWidth,
      nestedVerticalScrollers,
      rootMode: root.getAttribute("data-cinematic-mode"),
      rootEligibility: root.getAttribute("data-cinematic-eligibility"),
      rootBootstrap: root.getAttribute("data-cinematic-bootstrap"),
      rootHeader: root.getAttribute("data-cinematic-header"),
      rootFallback: root.getAttribute("data-cinematic-fallback"),
      phase: shell?.getAttribute("data-cinematic-phase") ?? null,
      shellInteractive: shell?.getAttribute("data-cinematic-interactive") ?? null,
      scrollProgress: number(shell?.getAttribute("data-scroll-progress")),
      cinematicProgress: number(shell?.getAttribute("data-cinematic-progress")),
      targetFrame: number(shell?.getAttribute("data-target-frame")),
      takeoverProgress: number(shell?.getAttribute("data-takeover-progress")),
      mediaState: shell?.getAttribute("data-media-state") ?? null,
      mediaSource: shell?.getAttribute("data-media-source") ?? null,
      shellCount: document.querySelectorAll("[data-cinematic-shell]").length,
      cinematicVideoCount: document.querySelectorAll("[data-cinematic-media]").length,
      h1Count: document.querySelectorAll("h1").length,
      entryRouteCount: entry?.querySelectorAll(".entry-path[href]").length ?? 0,
      shellTop: absoluteTop(shell),
      entryTop: absoluteTop(entry),
      headerHeight: headerRect?.height ?? 0,
      stage: stage ? { visibility: style(stage)?.visibility ?? null, position: style(stage)?.position ?? null } : null,
      video: video ? { srcAttribute: video.getAttribute("src"), currentSrc: video.currentSrc, readyState: video.readyState } : null,
      header: header ? {
        visibility: headerStyle?.visibility ?? null,
        opacity: number(headerStyle?.opacity),
        pointerEvents: headerStyle?.pointerEvents ?? null,
        inert: header.hasAttribute("inert"),
        hitTested,
        focusableDescendantCount: [...header.querySelectorAll(focusableSelector)].filter(effectiveFocusable).length,
        visibleDescendantCount: [header.querySelector(".brand-link"), header.querySelector(".desktop-nav"), header.querySelector(".mobile-nav > summary")].filter(visible).length,
        detailsOpen: Boolean(menu?.hasAttribute("open")),
      } : null,
      entry: entry ? {
        inert: entry.hasAttribute("inert"),
        pointerEvents: entryStyle?.pointerEvents ?? null,
        contentOpacity: number(style(entryContent)?.opacity),
        focusableDescendantCount: [...entry.querySelectorAll(focusableSelector)].filter(effectiveFocusable).length,
      } : null,
      chromeVisibleCount: header ? [header.querySelector(".brand-link"), header.querySelector(".desktop-nav"), header.querySelector(".mobile-nav > summary")].filter(visible).length : 0,
      activeElement: active ? {
        tag: active.tagName.toLowerCase(),
        id: active.id,
        className: String(active.className),
        href: active.getAttribute?.("href") ?? null,
        inHeader: Boolean(header && header.contains(active)),
        inEntry: Boolean(entry && entry.contains(active)),
      } : null,
      historyMarker: history.state?.quantumHomeCinematic ?? null,
      rootFontSize: Number.parseFloat(getComputedStyle(root).fontSize),
    };
  });
}

function createChecks(measured, expectation, extras = []) {
  const checks = [];
  const add = (id, passed, expected, actual) => checks.push({ id, expected, actual, passed: Boolean(passed) });
  if (expectation !== "supporting") {
    add("semantic-h1-single", measured.h1Count === 1, 1, measured.h1Count);
    add("semantic-entry-route-count-two", measured.entryRouteCount === 2, 2, measured.entryRouteCount);
    add("horizontal-overflow-safe", measured.horizontalOverflow <= 2, "<=2px", measured.horizontalOverflow);
    add("native-document-scroll-authority", measured.nestedVerticalScrollers.length === 0, [], measured.nestedVerticalScrollers);
    add("runtime-proxy-labeled", true, SOURCE_LABEL, SOURCE_LABEL);
  }
  if (expectation === "concealed") {
    add("root-state-concealed", measured.rootHeader === "concealed", "concealed", measured.rootHeader);
    add("header-visibility-hidden", measured.header?.visibility === "hidden", "hidden", measured.header?.visibility);
    add("header-opacity-zero", (measured.header?.opacity ?? 1) <= .001, 0, measured.header?.opacity);
    add("header-pointer-events-none", measured.header?.pointerEvents === "none", "none", measured.header?.pointerEvents);
    add("header-inert", measured.header?.inert === true, true, measured.header?.inert);
    add("header-hit-test-excluded", measured.header?.hitTested === false, false, measured.header?.hitTested);
    add("header-focusable-descendants-zero", measured.header?.focusableDescendantCount === 0, 0, measured.header?.focusableDescendantCount);
    add("header-visible-chrome-zero", measured.chromeVisibleCount === 0, 0, measured.chromeVisibleCount);
    add("mobile-menu-closed", measured.header?.detailsOpen === false, false, measured.header?.detailsOpen);
    add("entry-inert", measured.entry?.inert === true, true, measured.entry?.inert);
    add("entry-pointer-events-none", measured.entry?.pointerEvents === "none", "none", measured.entry?.pointerEvents);
    add("entry-focusable-descendants-zero", measured.entry?.focusableDescendantCount === 0, 0, measured.entry?.focusableDescendantCount);
    add("shell-interactive-false", measured.shellInteractive === "false", "false", measured.shellInteractive);
  } else if (expectation === "released") {
    add("root-state-released", measured.rootHeader === "released", "released", measured.rootHeader);
    add("header-visibility-visible", measured.header?.visibility === "visible", "visible", measured.header?.visibility);
    add("header-opacity-one", (measured.header?.opacity ?? 0) >= .999, 1, measured.header?.opacity);
    add("header-pointer-active", measured.header?.pointerEvents !== "none", "not none", measured.header?.pointerEvents);
    add("header-not-inert", measured.header?.inert === false, false, measured.header?.inert);
    add("header-hit-test-active", measured.header?.hitTested === true, true, measured.header?.hitTested);
    add("header-visible-chrome-present", measured.chromeVisibleCount >= 2, ">=2", measured.chromeVisibleCount);
    add("entry-not-inert", measured.entry?.inert === false, false, measured.entry?.inert);
    add("entry-pointer-active", measured.entry?.pointerEvents !== "none", "not none", measured.entry?.pointerEvents);
    add("entry-focusable-descendants-two", measured.entry?.focusableDescendantCount === 2, 2, measured.entry?.focusableDescendantCount);
  } else if (expectation === "nojs") {
    add("nojs-no-root-state", measured.rootMode === null && measured.rootHeader === null, { mode: null, header: null }, { mode: measured.rootMode, header: measured.rootHeader });
    add("nojs-header-released", measured.header?.visibility === "visible" && measured.header?.inert === false && measured.header?.pointerEvents !== "none", "visible, non-inert, pointer-active", measured.header);
  } else if (expectation === "supporting") {
    add("supporting-cinematic-isolation", measured.rootMode === null && measured.shellCount === 0 && measured.cinematicVideoCount === 0, "no cinematic root/DOM/media", { rootMode: measured.rootMode, shellCount: measured.shellCount, videoCount: measured.cinematicVideoCount });
    add("supporting-header-visible", measured.header?.visibility === "visible" && measured.header?.inert === false && measured.chromeVisibleCount >= 2, "visible normal header", measured.header);
    add("supporting-h1-single", measured.h1Count === 1, 1, measured.h1Count);
  }
  for (const extra of extras) add(extra.id, extra.passed, extra.expected, extra.actual);
  return checks;
}

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function wrapLabel(value, maximumCharacters) {
  const words = String(value).split(/\s+/u);
  const lines = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || `${current} ${word}`.length > maximumCharacters) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines;
}

function observeRequests(page) {
  const record = {
    controllerRequests: [],
    mediaRequests: [],
    failedRequests: [],
    runtimeErrors: [],
  };
  page.on("request", (request) => {
    const url = request.url();
    if (/home-cinematic-integration[^/]*\.js(?:\?|$)/.test(url)) record.controllerRequests.push(url);
    if (/\/media\/cinematic\/.*\.(?:mp4|webm)(?:\?|$)/i.test(url)) record.mediaRequests.push(url);
  });
  page.on("requestfailed", (request) => record.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? null }));
  page.on("pageerror", (error) => record.runtimeErrors.push(error.message));
  return record;
}

async function screenshotState({ page, outputRoot, id, group, expectation, viewport, extras = [], expected = {}, settleFrames = true }) {
  if (settleFrames) await settle(page);
  const measured = await readState(page);
  const relativePath = `screenshots/${id}.png`;
  const absolutePath = path.join(outputRoot, ...relativePath.split("/"));
  await page.screenshot({ path: absolutePath, fullPage: false, animations: "disabled" });
  const screenshot = await fileRecord(absolutePath, outputRoot);
  const checks = createChecks(measured, expectation, extras);
  return {
    id,
    group,
    sourceLabel: SOURCE_LABEL,
    viewport,
    url: measured.url,
    expected: { chrome: expectation, ...expected },
    measured,
    checks,
    passed: checks.every(({ passed }) => passed),
    screenshot,
  };
}

async function geometry(page) {
  const initial = await readState(page);
  const travel = Math.max(1, (initial.entryTop ?? 1) - initial.headerHeight - (initial.shellTop ?? 0));
  return {
    startY: Math.max(0, Math.round(initial.shellTop ?? 0)),
    endY: Math.min(initial.maxScroll, Math.round((initial.shellTop ?? 0) + travel)),
    travel,
  };
}

async function setProgress(page, layout, progress, { waitForMedia = true } = {}) {
  const y = Math.round(layout.startY + (layout.endY - layout.startY) * progress);
  await page.evaluate((target) => window.scrollTo({ top: target, left: 0, behavior: "instant" }), y);
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
  return y;
}

async function createContactSheet({ items, destination, columns, tileWidth, tileHeight, title }) {
  const narrow = tileWidth < 400;
  const labelHeight = narrow ? 72 : 54;
  const labelFontSize = narrow ? 15 : 20;
  const titleHeight = 76;
  const rows = Math.ceil(items.length / columns);
  const width = columns * tileWidth;
  const height = titleHeight + rows * (tileHeight + labelHeight);
  const composites = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const left = (index % columns) * tileWidth;
    const top = titleHeight + Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(item.path).resize(tileWidth, tileHeight, { fit: "contain", background: "#050708" }).png().toBuffer();
    const labelLines = wrapLabel(item.label, narrow ? 29 : 46);
    const lineMarkup = labelLines.map((line, lineIndex) => `<tspan x="${narrow ? 12 : 18}" y="${narrow ? 25 + lineIndex * 21 : 33 + lineIndex * 24}">${xmlEscape(line)}</tspan>`).join("");
    const labelSvg = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101416"/><text fill="#f6f7f5" font-family="Arial, sans-serif" font-size="${labelFontSize}">${lineMarkup}</text></svg>`);
    composites.push({ input: image, left, top }, { input: labelSvg, left, top: top + tileHeight });
  }
  const titleSvg = Buffer.from(`<svg width="${width}" height="${titleHeight}"><rect width="100%" height="100%" fill="#080b0c"/><text x="24" y="34" fill="#ffffff" font-family="Arial, sans-serif" font-size="24" font-weight="700">${xmlEscape(title)}</text><text x="24" y="59" fill="#b8c0c2" font-family="Arial, sans-serif" font-size="15">${xmlEscape(SOURCE_LABEL)}</text></svg>`);
  composites.push({ input: titleSvg, left: 0, top: 0 });
  await sharp({ create: { width, height, channels: 3, background: "#050708" } }).composite(composites).png().toFile(destination);
}

async function createLabeledFrame(source, destination, label) {
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? DESKTOP.width;
  const height = metadata.height ?? DESKTOP.height;
  const panel = Buffer.from(`<svg width="${width}" height="88"><rect width="100%" height="100%" fill="#080b0c" fill-opacity="0.94"/><text x="30" y="38" fill="#ffffff" font-family="Arial, sans-serif" font-size="25" font-weight="700">${xmlEscape(label)}</text><text x="30" y="68" fill="#c2c9ca" font-family="Arial, sans-serif" font-size="16">${xmlEscape(SOURCE_LABEL)}</text></svg>`);
  await sharp(source).composite([{ input: panel, left: 0, top: Math.max(0, height - 88) }]).png().toFile(destination);
}

function runFfmpeg(ffmpeg, framesRoot, destination) {
  execFileSync(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-framerate",
    "8",
    "-i",
    path.join(framesRoot, "frame-%03d.png"),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    destination,
  ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
}

function probeVideo(ffmpeg, videoPath) {
  const ffprobe = path.join(path.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  if (!execFileSync || !ffprobe) return null;
  try {
    return JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "format=duration,size:stream=codec_name,width,height,avg_frame_rate,nb_frames", "-of", "json", videoPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch {
    return null;
  }
}

async function captureHeldFirstPaint(browser, baseUrl, outputRoot, viewport, id) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "no-preference" });
  await context.addInitScript(() => {
    const audit = {
      installedAt: performance.now(),
      paintEntries: [],
      animationFrameSamples: [],
    };
    Object.defineProperty(globalThis, "__quantumChromePaintAudit", {
      value: audit,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    const sample = (source, timestamp) => {
      const header = document.querySelector(".site-header");
      const entry = document.querySelector("#entry");
      const style = header ? getComputedStyle(header) : null;
      audit.animationFrameSamples.push({
        source,
        timestamp,
        readyState: document.readyState,
        rootMode: document.documentElement?.dataset.cinematicMode ?? null,
        rootHeader: document.documentElement?.dataset.cinematicHeader ?? null,
        headerPresent: Boolean(header),
        headerVisibility: style?.visibility ?? null,
        headerOpacity: style ? Number.parseFloat(style.opacity) : null,
        headerPointerEvents: style?.pointerEvents ?? null,
        headerInert: header?.hasAttribute("inert") ?? null,
        entryInert: entry?.hasAttribute("inert") ?? null,
      });
    };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          audit.paintEntries.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration });
          sample(`performance-observer:${entry.name}`, entry.startTime);
        }
      }).observe({ type: "paint", buffered: true });
    } catch {}
    let frameCount = 0;
    const onFrame = (timestamp) => {
      sample("request-animation-frame", timestamp);
      frameCount += 1;
      if (frameCount < 8) requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
  });
  let releaseController;
  let heldRequest = null;
  let controllerReleasedAt = null;
  await context.route("**/home-cinematic-integration*.js", async (route) => {
    heldRequest = { url: route.request().url(), heldAt: Date.now() };
    await new Promise((resolve) => {
      releaseController = async () => {
        controllerReleasedAt = Date.now();
        await route.continue();
        resolve();
      };
    });
  });
  const page = await context.newPage();
  const network = observeRequests(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Performance.enable");
  await cdp.send("Page.setLifecycleEventsEnabled", { enabled: true });
  let navigationStartedAt = null;
  let resolveFirstContentfulPaint;
  let rejectFirstContentfulPaint;
  const firstContentfulPaintPromise = new Promise((resolve, reject) => {
    resolveFirstContentfulPaint = resolve;
    rejectFirstContentfulPaint = reject;
  });
  let firstPaintCaptureStarted = false;
  cdp.on("Page.lifecycleEvent", (event) => {
    if (!navigationStartedAt || firstPaintCaptureStarted || event.name !== "firstContentfulPaint") return;
    firstPaintCaptureStarted = true;
    void (async () => {
      const expression = `(() => {
        const root = document.documentElement;
        const header = document.querySelector('.site-header');
        const entry = document.querySelector('#entry');
        const style = header ? getComputedStyle(header) : null;
        const headerRect = header?.getBoundingClientRect() ?? null;
        const focusableSelector = 'a[href],button,summary,input:not([type=hidden]),select,textarea,[tabindex]';
        const effectiveFocusable = (element) => !element.closest('[inert]') && !element.hasAttribute('disabled') && element.tabIndex >= 0;
        const visible = (element) => {
          if (!element) return false;
          const computed = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return computed.display !== 'none' && computed.visibility !== 'hidden' && Number.parseFloat(computed.opacity) > .001 && rect.width > 0 && rect.height > 0;
        };
        const hitTested = Boolean(header && headerRect && headerRect.width > 0 && headerRect.height > 0 && document.elementsFromPoint(
          Math.min(innerWidth - 1, Math.max(0, headerRect.left + headerRect.width / 2)),
          Math.min(innerHeight - 1, Math.max(0, headerRect.top + headerRect.height / 2)),
        ).some((element) => element === header || header.contains(element)));
        return {
          performanceNow: performance.now(),
          readyState: document.readyState,
          rootMode: root?.dataset.cinematicMode ?? null,
          rootHeader: root?.dataset.cinematicHeader ?? null,
          headerPresent: Boolean(header),
          headerVisibility: style?.visibility ?? null,
          headerOpacity: style ? Number.parseFloat(style.opacity) : null,
          headerPointerEvents: style?.pointerEvents ?? null,
          headerInert: header?.hasAttribute('inert') ?? null,
          headerHitTested: hitTested,
          headerFocusableDescendantCount: header ? [...header.querySelectorAll(focusableSelector)].filter(effectiveFocusable).length : 0,
          headerVisibleDescendantCount: header ? [header.querySelector('.brand-link'), header.querySelector('.desktop-nav'), header.querySelector('.mobile-nav > summary')].filter(visible).length : 0,
          entryPresent: Boolean(entry),
          entryInert: entry?.hasAttribute('inert') ?? null,
          entryFocusableDescendantCount: entry ? [...entry.querySelectorAll(focusableSelector)].filter(effectiveFocusable).length : 0,
          activeElement: document.activeElement ? {
            tag: document.activeElement.tagName.toLowerCase(),
            className: String(document.activeElement.className),
            inHeader: Boolean(header && header.contains(document.activeElement)),
            inEntry: Boolean(entry && entry.contains(document.activeElement)),
          } : null,
        };
      })()`;
      const [domResult, screenshotResult, performanceResult] = await Promise.all([
        cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: false }),
        cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }),
        cdp.send("Performance.getMetrics"),
      ]);
      resolveFirstContentfulPaint({
        lifecycleEvent: event,
        capturedAt: Date.now(),
        dom: domResult.result?.value ?? null,
        screenshotData: screenshotResult.data,
        performanceMetrics: Object.fromEntries(performanceResult.metrics.map(({ name, value }) => [name, value])),
      });
    })().catch(rejectFirstContentfulPaint);
  });
  const startedAt = Date.now();
  navigationStartedAt = startedAt;
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  const firstPaint = await Promise.race([
    firstContentfulPaintPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`No CDP firstContentfulPaint event for ${id}`)), 8_000)),
  ]);
  const firstPaintRelativePath = `screenshots/${id}-cdp-first-contentful-paint.png`;
  const firstPaintAbsolutePath = path.join(outputRoot, ...firstPaintRelativePath.split("/"));
  await writeFile(firstPaintAbsolutePath, Buffer.from(firstPaint.screenshotData, "base64"));
  const firstPaintScreenshot = await fileRecord(firstPaintAbsolutePath, outputRoot);
  await page.waitForSelector(".site-header", { state: "attached" });
  await page.waitForFunction(() => document.querySelector(".site-header")?.hasAttribute("inert") && document.querySelector("#entry")?.hasAttribute("inert"));
  const paintAudit = await page.evaluate(() => globalThis.__quantumChromePaintAudit ?? null);
  const lifecycleDom = firstPaint.dom;
  const firstPaintHadNoChrome = Boolean(lifecycleDom)
    && lifecycleDom.headerVisibleDescendantCount === 0
    && lifecycleDom.headerFocusableDescendantCount === 0
    && lifecycleDom.headerHitTested === false
    && (!lifecycleDom.headerPresent || (
      lifecycleDom.headerVisibility === "hidden"
      && (lifecycleDom.headerOpacity ?? 1) <= .001
      && lifecycleDom.headerPointerEvents === "none"
      && lifecycleDom.headerInert === true
    ))
    && (!lifecycleDom.entryPresent || (
      lifecycleDom.entryInert === true
      && lifecycleDom.entryFocusableDescendantCount === 0
    ));
  const record = await screenshotState({
    page,
    outputRoot,
    id,
    group: "first-paint",
    expectation: "concealed",
    viewport,
    expected: { controllerRequest: "held before capture" },
    extras: [
      { id: "controller-request-held", passed: Boolean(heldRequest), expected: true, actual: Boolean(heldRequest) },
      { id: "bootstrap-before-body", passed: (await page.evaluate(() => document.documentElement.dataset.cinematicMode)) === "candidate", expected: "candidate", actual: await page.evaluate(() => document.documentElement.dataset.cinematicMode) },
      {
        id: "no-first-paint-flash",
        passed: firstPaintHadNoChrome && controllerReleasedAt === null,
        expected: "CDP firstContentfulPaint has no visible, hittable, or focusable header/ENTRY chrome before controller release",
        actual: {
          lifecycleName: firstPaint.lifecycleEvent.name,
          lifecycleTimestamp: firstPaint.lifecycleEvent.timestamp,
          capturedAt: firstPaint.capturedAt,
          controllerReleasedAt,
          dom: lifecycleDom,
          evidenceScreenshot: firstPaintScreenshot,
        },
      },
    ],
  });
  const tracePayload = {
    schema: "quantum-hub.phase-4r1.chrome-first-paint-trace.v1",
    sourceLabel: SOURCE_LABEL,
    stateId: id,
    navigationStartedAt,
    lifecycleEvent: firstPaint.lifecycleEvent,
    capturedAt: firstPaint.capturedAt,
    controllerReleasedAt,
    heldRequest,
    domAtFirstContentfulPaint: lifecycleDom,
    performanceMetrics: firstPaint.performanceMetrics,
    pagePaintAudit: paintAudit,
    network,
    screenshot: firstPaintScreenshot,
  };
  const traceRelativePath = `screenshots/${id}-paint-trace.json`;
  const traceAbsolutePath = path.join(outputRoot, ...traceRelativePath.split("/"));
  await writeFile(traceAbsolutePath, `${JSON.stringify(tracePayload, null, 2)}\n`, "utf8");
  record.firstPaintTrace = {
    ...tracePayload,
    traceFile: await fileRecord(traceAbsolutePath, outputRoot),
    elapsedMs: Date.now() - startedAt,
  };
  if (releaseController) await releaseController();
  await context.close();
  return record;
}

const PROXY_MILESTONES = Object.freeze([
  { id: "dormancy", label: "Dormancy / physical opening", progress: 0 },
  { id: "conduction-25", label: "25% conduction proxy", progress: .18 },
  { id: "conduction-50", label: "50% conduction proxy", progress: .36 },
  { id: "q-activation", label: "Q activation proxy", progress: .52 },
  { id: "q-hold", label: "Q hold proxy", progress: .66 },
  { id: "approach", label: "Screen approach proxy", progress: .82 },
  { id: "threshold", label: "Threshold proxy", progress: .955 },
  { id: "breathing", label: "Breathing-beat proxy", progress: .972 },
  { id: "entry-first-readable", label: "First readable ENTRY", progress: .985 },
  { id: "entry-settled", label: "Settled ENTRY + released chrome", progress: 1 },
]);

async function captureDesktopTrack(browser, baseUrl, outputRoot, temporaryRoot) {
  const context = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const network = observeRequests(page);
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await waitForController(page);
  const layout = await geometry(page);
  const states = [];
  const sheetItems = [];
  for (const milestone of PROXY_MILESTONES) {
    await setProgress(page, layout, milestone.progress);
    const settled = milestone.id === "entry-settled";
    const measuredBefore = await readState(page);
    const record = await screenshotState({
      page,
      outputRoot,
      id: milestone.id,
      group: "runtime-proxy-milestone",
      expectation: settled ? "released" : "concealed",
      viewport: DESKTOP,
      expected: { requestedDocumentProgress: milestone.progress, label: milestone.label },
      extras: [
        { id: "proxy-milestone-declared", passed: true, expected: SOURCE_LABEL, actual: SOURCE_LABEL },
        ...(settled ? [{ id: "settled-boundary-at-least-0.9995", passed: (measuredBefore.scrollProgress ?? 0) >= .9995, expected: ">=0.9995", actual: measuredBefore.scrollProgress }] : []),
      ],
    });
    states.push(record);
    sheetItems.push({ path: path.join(outputRoot, ...record.screenshot.relativePath.split("/")), label: milestone.label });
  }

  await page.evaluate(() => {
    const menu = document.querySelector("[data-mobile-nav]");
    if (menu instanceof HTMLDetailsElement) menu.open = true;
    document.querySelector(".site-header a")?.focus();
  });
  await setProgress(page, layout, .995);
  const reverseMeasured = await readState(page);
  const reverse = await screenshotState({
    page,
    outputRoot,
    id: "reverse-one-step",
    group: "reverse",
    expectation: "concealed",
    viewport: DESKTOP,
    expected: { requestedDocumentProgress: .995 },
    extras: [
      { id: "reverse-below-settle-boundary", passed: (reverseMeasured.scrollProgress ?? 1) < .9995, expected: "<0.9995", actual: reverseMeasured.scrollProgress },
      { id: "reverse-focus-safe", passed: reverseMeasured.activeElement?.className.includes("skip-link") === true, expected: "skip-link", actual: reverseMeasured.activeElement },
      { id: "reverse-menu-closed", passed: reverseMeasured.header?.detailsOpen === false, expected: false, actual: reverseMeasured.header?.detailsOpen },
    ],
  });
  states.push(reverse);
  sheetItems.push({ path: path.join(outputRoot, ...reverse.screenshot.relativePath.split("/")), label: "One-step reverse: chrome concealed" });

  await setProgress(page, layout, 0);
  await page.evaluate(({ startY, endY }) => {
    window.scrollTo({ top: startY, left: 0, behavior: "instant" });
    window.scrollTo({ top: endY, left: 0, behavior: "instant" });
  }, layout);
  await settle(page);
  const fastForward = await screenshotState({
    page, outputRoot, id: "fast-jump-forward", group: "latest-position", expectation: "released", viewport: DESKTOP,
    extras: [{ id: "latest-position-wins", passed: (await readState(page)).phase === "settled", expected: "settled", actual: (await readState(page)).phase }],
  });
  states.push(fastForward);

  await page.evaluate(({ startY, endY }) => {
    window.scrollTo({ top: endY, left: 0, behavior: "instant" });
    window.scrollTo({ top: startY, left: 0, behavior: "instant" });
  }, layout);
  await settle(page);
  const fastReverse = await screenshotState({
    page, outputRoot, id: "fast-jump-reverse", group: "latest-position", expectation: "concealed", viewport: DESKTOP,
    extras: [{ id: "latest-position-wins", passed: (await readState(page)).phase === "physical", expected: "physical", actual: (await readState(page)).phase }],
  });
  states.push(fastReverse);

  await page.evaluate(({ startY, endY }) => {
    window.scrollTo({ top: endY, left: 0, behavior: "instant" });
    window.scrollTo({ top: Math.round(startY + (endY - startY) * .37), left: 0, behavior: "instant" });
    window.scrollTo({ top: endY, left: 0, behavior: "instant" });
  }, layout);
  await settle(page);
  const fastLatest = await screenshotState({
    page, outputRoot, id: "fast-jump-latest", group: "latest-position", expectation: "released", viewport: DESKTOP,
    extras: [{ id: "latest-position-wins", passed: (await readState(page)).phase === "settled", expected: "settled", actual: (await readState(page)).phase }],
  });
  states.push(fastLatest);

  const recordingRoot = path.join(temporaryRoot, "reveal-reverse");
  await mkdir(recordingRoot, { recursive: true });
  const recordingProgress = [0, .18, .36, .66, .82, .955, .972, .985, .995, 1, 1, .995, .985, .972, .82, .36, 0];
  for (let index = 0; index < recordingProgress.length; index += 1) {
    const progress = recordingProgress[index];
    await setProgress(page, layout, progress);
    const raw = path.join(temporaryRoot, `reveal-raw-${String(index).padStart(3, "0")}.png`);
    await page.screenshot({ path: raw, fullPage: false, animations: "disabled" });
    await createLabeledFrame(raw, path.join(recordingRoot, `frame-${String(index).padStart(3, "0")}.png`), `Document progress ${(progress * 100).toFixed(1)}% — ${progress >= .9995 ? "chrome released" : "chrome concealed"}`);
  }
  await context.close();
  return { states, sheetItems, network, layout, recordingRoot };
}

async function captureMobileTrack(browser, baseUrl, outputRoot) {
  const context = await browser.newContext({ viewport: { width: MOBILE.width, height: MOBILE.height }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const network = observeRequests(page);
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await waitForController(page);
  const layout = await geometry(page);
  const supplementalStates = [];
  const sheetItems = [];
  for (const milestone of PROXY_MILESTONES) {
    await setProgress(page, layout, milestone.progress);
    const record = await screenshotState({
      page,
      outputRoot,
      id: `mobile-${milestone.id}`,
      group: "responsive-runtime-proxy-milestone",
      expectation: milestone.id === "entry-settled" ? "released" : "concealed",
      viewport: MOBILE,
      expected: { requestedDocumentProgress: milestone.progress, label: milestone.label },
      extras: [{ id: "proxy-milestone-declared", passed: true, expected: SOURCE_LABEL, actual: SOURCE_LABEL }],
    });
    supplementalStates.push(record);
    sheetItems.push({ path: path.join(outputRoot, ...record.screenshot.relativePath.split("/")), label: milestone.label });
  }
  await page.locator(".mobile-nav > summary").focus();
  await page.evaluate(() => document.querySelector("[data-mobile-nav]")?.setAttribute("open", ""));
  await setProgress(page, layout, .995);
  const reverseMeasured = await readState(page);
  const reverse = await screenshotState({
    page,
    outputRoot,
    id: "mobile-reverse-one-step",
    group: "responsive-reverse",
    expectation: "concealed",
    viewport: MOBILE,
    expected: { requestedDocumentProgress: .995 },
    extras: [
      { id: "reverse-below-settle-boundary", passed: (reverseMeasured.scrollProgress ?? 1) < .9995, expected: "<0.9995", actual: reverseMeasured.scrollProgress },
      { id: "reverse-focus-safe", passed: reverseMeasured.activeElement?.className.includes("skip-link") === true, expected: "skip-link", actual: reverseMeasured.activeElement },
      { id: "reverse-menu-closed", passed: reverseMeasured.header?.detailsOpen === false, expected: false, actual: reverseMeasured.header?.detailsOpen },
    ],
  });
  supplementalStates.push(reverse);
  sheetItems.push({ path: path.join(outputRoot, ...reverse.screenshot.relativePath.split("/")), label: "Mobile one-step reverse — chrome concealed" });
  await context.close();
  return { supplementalStates, sheetItems, network, layout };
}

async function captureSkipPending(browser, baseUrl, outputRoot, temporaryRoot) {
  const context = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height }, reducedMotion: "no-preference" });
  let releaseMedia;
  let heldMedia = null;
  await context.route("**/media/cinematic/*", async (route) => {
    if (!/\.(?:mp4|webm)(?:\?|$)/i.test(route.request().url())) return route.continue();
    heldMedia = { url: route.request().url(), heldAt: Date.now() };
    await new Promise((resolve) => {
      releaseMedia = async () => {
        await route.abort("aborted");
        resolve();
      };
    });
  });
  const page = await context.newPage();
  const network = observeRequests(page);
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "loading");
  const framesRoot = path.join(temporaryRoot, "skip-pending");
  await mkdir(framesRoot, { recursive: true });
  const captureFrame = async (index, label) => {
    const raw = path.join(temporaryRoot, `skip-raw-${String(index).padStart(3, "0")}.png`);
    await page.screenshot({ path: raw, fullPage: false, animations: "disabled" });
    await createLabeledFrame(raw, path.join(framesRoot, `frame-${String(index).padStart(3, "0")}.png`), label);
  };
  await captureFrame(0, "Media deliberately pending — chrome concealed");
  await captureFrame(1, "Media deliberately pending — chrome concealed");
  await page.keyboard.press("Tab");
  await settle(page);
  await captureFrame(2, "Skip cinematic intro focused — media still pending");
  await captureFrame(3, "Skip cinematic intro focused — no hidden navigation target");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.hash === "#entry" && document.documentElement.dataset.cinematicHeader === "released");
  await settle(page);
  const before = await readState(page);
  const record = await screenshotState({
    page,
    outputRoot,
    id: "skip-media-pending",
    group: "accessibility",
    expectation: "released",
    viewport: DESKTOP,
    extras: [
      { id: "skip-media-request-pending", passed: Boolean(heldMedia) && before.mediaState === "loading", expected: "held/loading", actual: { heldMedia, mediaState: before.mediaState } },
      { id: "skip-hash-entry", passed: before.hash === "#entry", expected: "#entry", actual: before.hash },
      { id: "skip-settled", passed: before.phase === "settled", expected: "settled", actual: before.phase },
      { id: "skip-focus-entry", passed: before.activeElement?.inEntry === true, expected: true, actual: before.activeElement },
      { id: "skip-media-not-required", passed: before.video?.readyState === 0, expected: 0, actual: before.video?.readyState },
    ],
  });
  await captureFrame(4, "Skip activated — settled ENTRY and chrome released immediately");
  await captureFrame(5, "Settled semantic page — media remains pending");
  await captureFrame(6, "Settled semantic page — navigation pointer-active");
  await captureFrame(7, "No timer, cookie, or permanent preference");
  if (releaseMedia) await releaseMedia();
  await context.close();
  return { record, network, heldMedia, recordingRoot: framesRoot };
}

function noRequestExtras(network) {
  return [
    { id: "fallback-controller-not-requested", passed: network.controllerRequests.length === 0, expected: [], actual: network.controllerRequests },
    { id: "fallback-media-not-requested", passed: network.mediaRequests.length === 0, expected: [], actual: network.mediaRequests },
  ];
}

async function captureFallbacks(browser, baseUrl, outputRoot) {
  const states = [];
  const sheetItems = [];
  const addSheet = (record, label) => sheetItems.push({ path: path.join(outputRoot, ...record.screenshot.relativePath.split("/")), label });

  {
    const context = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const network = observeRequests(page);
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const before = await readState(page);
    const record = await screenshotState({
      page, outputRoot, id: "reduced-motion", group: "fallback", expectation: "released", viewport: DESKTOP,
      extras: [
        { id: "fallback-reduced-motion", passed: before.rootMode === "static" && before.rootBootstrap === "reduced-motion", expected: { mode: "static", reason: "reduced-motion" }, actual: { mode: before.rootMode, reason: before.rootBootstrap } },
        ...noRequestExtras(network),
      ],
    });
    states.push(record); addSheet(record, "Reduced motion — normal header");
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height }, javaScriptEnabled: false, reducedMotion: "no-preference" });
    const page = await context.newPage();
    const network = observeRequests(page);
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    const record = await screenshotState({
      page, outputRoot, id: "no-javascript", group: "fallback", expectation: "nojs", viewport: DESKTOP,
      extras: noRequestExtras(network),
      settleFrames: false,
    });
    states.push(record); addSheet(record, "No JavaScript — SSR semantics + header");
    await context.close();
  }

  for (const deepLink of [
    { id: "deep-link-entry", hash: "#entry", label: "Direct #entry" },
    { id: "deep-link-method", hash: "#method", label: "Direct #method" },
  ]) {
    const context = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    const network = observeRequests(page);
    await page.goto(`${baseUrl}/${deepLink.hash}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const before = await readState(page);
    const record = await screenshotState({
      page, outputRoot, id: deepLink.id, group: "fallback", expectation: "released", viewport: DESKTOP,
      extras: [
        { id: "fallback-deep-link", passed: before.rootMode === "static" && before.rootBootstrap === "deep-link", expected: { mode: "static", reason: "deep-link" }, actual: { mode: before.rootMode, reason: before.rootBootstrap } },
        ...noRequestExtras(network),
      ],
    });
    states.push(record); addSheet(record, `${deepLink.label} — no cinematic reconstruction`);
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    const network = observeRequests(page);
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await waitForController(page);
    const layout = await geometry(page);
    await setProgress(page, layout, 1);
    const settledMarker = (await readState(page)).historyMarker;
    const baselineController = network.controllerRequests.length;
    const baselineMedia = network.mediaRequests.length;
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page);
    const settledBefore = await readState(page);
    const settledRecord = await screenshotState({
      page, outputRoot, id: "restored-settled", group: "fallback", expectation: "released", viewport: DESKTOP,
      extras: [
        { id: "restored-first-paint-released", passed: settledBefore.rootMode === "static" && settledBefore.rootBootstrap === "restored-scroll", expected: "static/restored-scroll", actual: { mode: settledBefore.rootMode, reason: settledBefore.rootBootstrap } },
        { id: "restored-history-marker", passed: settledMarker?.version === 1 && settledMarker.settledOrLower === true, expected: { version: 1, settledOrLower: true }, actual: settledMarker },
        { id: "fallback-controller-not-requested", passed: network.controllerRequests.length === baselineController, expected: 0, actual: network.controllerRequests.length - baselineController },
        { id: "fallback-media-not-requested", passed: network.mediaRequests.length === baselineMedia, expected: 0, actual: network.mediaRequests.length - baselineMedia },
      ],
    });
    states.push(settledRecord); addSheet(settledRecord, "Restored settled ENTRY — released before paint");

    const methodTop = await page.locator("#method").evaluate((element) => element.getBoundingClientRect().top + scrollY);
    await page.evaluate((target) => window.scrollTo({ top: target, left: 0, behavior: "instant" }), Math.round(methodTop + 120));
    await settle(page);
    const lowerBaselineController = network.controllerRequests.length;
    const lowerBaselineMedia = network.mediaRequests.length;
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page);
    const lowerBefore = await readState(page);
    const lowerRecord = await screenshotState({
      page, outputRoot, id: "restored-lower", group: "fallback", expectation: "released", viewport: DESKTOP,
      extras: [
        { id: "restored-first-paint-released", passed: lowerBefore.rootMode === "static" && lowerBefore.rootBootstrap === "restored-scroll", expected: "static/restored-scroll", actual: { mode: lowerBefore.rootMode, reason: lowerBefore.rootBootstrap } },
        { id: "restored-history-marker", passed: lowerBefore.historyMarker?.settledOrLower === true, expected: true, actual: lowerBefore.historyMarker },
        { id: "fallback-controller-not-requested", passed: network.controllerRequests.length === lowerBaselineController, expected: 0, actual: network.controllerRequests.length - lowerBaselineController },
        { id: "fallback-media-not-requested", passed: network.mediaRequests.length === lowerBaselineMedia, expected: 0, actual: network.mediaRequests.length - lowerBaselineMedia },
      ],
    });
    states.push(lowerRecord); addSheet(lowerRecord, "Restored lower section — released before paint");
    await context.close();
  }

  for (const viewport of [DESKTOP, MOBILE]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "no-preference" });
    await context.addInitScript(() => {
      const apply = () => document.documentElement?.style.setProperty("font-size", "200%", "important");
      apply();
      if (!document.documentElement) new MutationObserver((_, observer) => {
        if (document.documentElement) { apply(); observer.disconnect(); }
      }).observe(document, { childList: true, subtree: true });
    });
    const page = await context.newPage();
    const network = observeRequests(page);
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.locator("#entry").scrollIntoViewIfNeeded();
    await settle(page);
    const before = await readState(page);
    const id = viewport === DESKTOP ? "text-200-desktop" : "text-200-mobile";
    const record = await screenshotState({
      page, outputRoot, id, group: "fallback", expectation: "released", viewport,
      extras: [
        { id: "fallback-text-zoom", passed: before.rootMode === "static" && before.rootBootstrap === "text-zoom", expected: { mode: "static", reason: "text-zoom" }, actual: { mode: before.rootMode, reason: before.rootBootstrap } },
        { id: "root-font-size-200-percent", passed: Math.abs(before.rootFontSize - 32) <= .5, expected: 32, actual: before.rootFontSize },
        ...noRequestExtras(network),
      ],
    });
    states.push(record); addSheet(record, `200% text — ${viewport.id}`);
    await context.close();
  }

  for (const failureMode of ["abort", "404"]) {
    const context = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height }, reducedMotion: "no-preference" });
    await context.route("**/media/cinematic/*", async (route) => {
      if (!/\.(?:mp4|webm)(?:\?|$)/i.test(route.request().url())) return route.continue();
      if (failureMode === "abort") return route.abort("failed");
      return route.fulfill({ status: 404, contentType: "text/plain", body: "synthetic chrome-evidence media 404" });
    });
    const page = await context.newPage();
    const network = observeRequests(page);
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "static" && document.documentElement.dataset.cinematicFallback === "media", undefined, { timeout: 5_000 });
    await settle(page);
    const before = await readState(page);
    const id = failureMode === "abort" ? "media-abort" : "media-404";
    const record = await screenshotState({
      page, outputRoot, id, group: "fallback", expectation: "released", viewport: DESKTOP,
      extras: [
        { id: "fallback-static", passed: before.rootMode === "static" && before.phase === "fallback", expected: "static/fallback", actual: { mode: before.rootMode, phase: before.phase } },
        { id: "media-failure-reason", passed: before.rootFallback === "media", expected: "media", actual: before.rootFallback },
        { id: "media-node-dormant", passed: !before.video?.srcAttribute && !before.video?.currentSrc, expected: "no source", actual: before.video },
      ],
    });
    states.push(record); addSheet(record, failureMode === "abort" ? "Media abort — fully fail open" : "Media 404 — fully fail open");
    record.network = network;
    await context.close();
  }

  for (const route of [
    { id: "supporting-about", path: "/about/", label: "Supporting /about/" },
    { id: "real-404", path: "/phase4r1-chrome-evidence-missing", label: "Real 404" },
  ]) {
    const context = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height } });
    const page = await context.newPage();
    const network = observeRequests(page);
    const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const record = await screenshotState({
      page, outputRoot, id: route.id, group: "route-isolation", expectation: "supporting", viewport: DESKTOP,
      extras: [{ id: "route-http-status", passed: response?.status() === (route.id === "real-404" ? 404 : 200), expected: route.id === "real-404" ? 404 : 200, actual: response?.status() ?? null }],
    });
    states.push(record); addSheet(record, `${route.label} — normal header`);
    record.network = network;
    await context.close();
  }

  return { states, sheetItems };
}

const REQUIRED_CHECK_IDS = Object.freeze([
  "semantic-h1-single",
  "semantic-entry-route-count-two",
  "horizontal-overflow-safe",
  "native-document-scroll-authority",
  "runtime-proxy-labeled",
  "root-state-concealed",
  "header-visibility-hidden",
  "header-opacity-zero",
  "header-pointer-events-none",
  "header-inert",
  "header-hit-test-excluded",
  "header-focusable-descendants-zero",
  "header-visible-chrome-zero",
  "mobile-menu-closed",
  "entry-inert",
  "entry-pointer-events-none",
  "entry-focusable-descendants-zero",
  "shell-interactive-false",
  "root-state-released",
  "header-visibility-visible",
  "header-opacity-one",
  "header-pointer-active",
  "header-not-inert",
  "header-hit-test-active",
  "header-visible-chrome-present",
  "entry-not-inert",
  "entry-pointer-active",
  "entry-focusable-descendants-two",
  "controller-request-held",
  "bootstrap-before-body",
  "no-first-paint-flash",
  "proxy-milestone-declared",
  "settled-boundary-at-least-0.9995",
  "reverse-below-settle-boundary",
  "reverse-focus-safe",
  "reverse-menu-closed",
  "latest-position-wins",
  "skip-media-request-pending",
  "skip-hash-entry",
  "skip-settled",
  "skip-focus-entry",
  "skip-media-not-required",
  "fallback-reduced-motion",
  "fallback-controller-not-requested",
  "fallback-media-not-requested",
  "nojs-no-root-state",
  "nojs-header-released",
  "fallback-deep-link",
  "restored-first-paint-released",
  "restored-history-marker",
  "fallback-text-zoom",
  "root-font-size-200-percent",
  "fallback-static",
  "media-failure-reason",
  "media-node-dormant",
  "supporting-cinematic-isolation",
  "supporting-header-visible",
  "supporting-h1-single",
  "route-http-status",
]);

function unique(values) {
  return [...new Set(values)];
}

function gitAuthority({ allowDirty }) {
  const branch = git("branch", "--show-current");
  const head = git("rev-parse", "HEAD");
  const status = git("status", "--porcelain=v1", "--untracked-files=all");
  let upstream = null;
  let upstreamHead = null;
  try {
    upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}");
    upstreamHead = git("rev-parse", "@{upstream}");
  } catch {}
  let remoteHead = upstreamHead;
  let remoteVerifiedByLsRemote = false;
  if (!allowDirty) {
    const expectedRef = `refs/heads/${branch}`;
    const remoteLine = git("ls-remote", "--exit-code", "origin", expectedRef).split(/\s+/u);
    remoteHead = remoteLine[0] ?? null;
    remoteVerifiedByLsRemote = Boolean(remoteHead);
  }
  let remoteUrl = null;
  try { remoteUrl = git("remote", "get-url", "origin"); } catch {}
  return {
    branch,
    head,
    expectedBranch: "redirect/phase-4r1-proving-hall-environment",
    workingTreeClean: status === "",
    statusPorcelain: status ? status.split(/\r?\n/u) : [],
    upstream,
    upstreamHead,
    remoteBranch: `origin/${branch}`,
    remoteRef: `refs/heads/${branch}`,
    remoteHead,
    remoteVerifiedByLsRemote,
    remoteUrl,
    headMatchesUpstream: Boolean(upstreamHead) && head === upstreamHead,
    headMatchesRemote: Boolean(remoteHead) && head === remoteHead,
  };
}

async function runtimeMediaAuthorities() {
  const paths = [
    "public/media/cinematic/phase-3-desktop-vp9-44a1d9facd43.webm",
    "public/media/cinematic/phase-3-desktop-h264-a73be0bb9890.mp4",
    "public/media/cinematic/phase-3-mobile-vp9-0ffcf12a431b.webm",
    "public/media/cinematic/phase-3-mobile-h264-34319f80ae39.mp4",
  ];
  return Promise.all(paths.map(async (relativePath) => {
    const buffer = await readFile(path.join(ROOT, ...relativePath.split("/")));
    return { path: relativePath, bytes: buffer.length, sha256: sha256(buffer) };
  }));
}

async function artifactRecord(outputRoot, roleId, filename, mediaType) {
  return {
    roleId,
    ...(await fileRecord(path.join(outputRoot, filename), outputRoot)),
    mediaType,
  };
}

async function writeJsonAtomic(destination, value) {
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const chromePath = await resolveChrome(options.browser);
  if (!await executable(options.ffmpeg)) throw new Error(`ffmpeg is not executable: ${options.ffmpeg}`);
  if (await exists(options.output)) throw new Error(`Refusing to overwrite existing evidence directory: ${options.output}`);

  const gitState = gitAuthority({ allowDirty: options.allowDirty });
  const authorityReady = gitState.branch === gitState.expectedBranch
    && gitState.workingTreeClean
    && gitState.headMatchesUpstream
    && gitState.headMatchesRemote;
  if (!options.allowDirty && !authorityReady) {
    throw new Error(`Clean pushed authority is required: ${JSON.stringify(gitState, null, 2)}`);
  }

  await mkdir(path.join(options.output, "screenshots"), { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "qsite-phase4r1-chrome-evidence-"));
  let preview = null;
  let browser = null;
  try {
    if (options.serverMode === "astro-preview") preview = startPreview(options.baseUrl);
    await waitForServer(options.baseUrl, preview);
    browser = await chromium.launch({ executablePath: chromePath, headless: true });

    console.log("Capturing CDP first-paint evidence...");
    const firstPaintDesktop = await captureHeldFirstPaint(browser, options.baseUrl, options.output, DESKTOP, "first-paint-desktop");
    const firstPaintMobile = await captureHeldFirstPaint(browser, options.baseUrl, options.output, MOBILE, "first-paint-mobile");

    console.log("Capturing desktop and responsive chrome-state tracks...");
    const desktop = await captureDesktopTrack(browser, options.baseUrl, options.output, temporaryRoot);
    const mobile = await captureMobileTrack(browser, options.baseUrl, options.output);

    console.log("Capturing skip-pending and fallback matrices...");
    const skip = await captureSkipPending(browser, options.baseUrl, options.output, temporaryRoot);
    const fallbacks = await captureFallbacks(browser, options.baseUrl, options.output);

    const states = [
      firstPaintDesktop,
      firstPaintMobile,
      ...desktop.states,
      skip.record,
      ...fallbacks.states,
    ];
    const actualStateIds = states.map(({ id }) => id);
    const missingStateIds = REQUIRED_STATE_IDS.filter((id) => !actualStateIds.includes(id));
    const unexpectedStateIds = actualStateIds.filter((id) => !REQUIRED_STATE_IDS.includes(id));
    const duplicatedStateIds = unique(actualStateIds.filter((id, index) => actualStateIds.indexOf(id) !== index));
    if (missingStateIds.length || unexpectedStateIds.length || duplicatedStateIds.length || states.length !== REQUIRED_STATE_IDS.length) {
      throw new Error(`State matrix mismatch: ${JSON.stringify({ missingStateIds, unexpectedStateIds, duplicatedStateIds, count: states.length })}`);
    }

    const allStateChecks = [...states, ...mobile.supplementalStates].flatMap(({ checks }) => checks);
    const observedCheckIds = unique(allStateChecks.map(({ id }) => id)).sort();
    const missingCheckIds = REQUIRED_CHECK_IDS.filter((id) => !observedCheckIds.includes(id));
    if (missingCheckIds.length) throw new Error(`Required check IDs missing: ${missingCheckIds.join(", ")}`);

    console.log("Building labeled sheets and recordings...");
    const desktopFirstPaintSource = path.join(options.output, ...firstPaintDesktop.firstPaintTrace.screenshot.relativePath.split("/"));
    const mobileFirstPaintSource = path.join(options.output, ...firstPaintMobile.firstPaintTrace.screenshot.relativePath.split("/"));
    await copyFile(desktopFirstPaintSource, path.join(options.output, "first-paint-desktop.png"));
    await copyFile(mobileFirstPaintSource, path.join(options.output, "first-paint-mobile.png"));
    await createContactSheet({
      items: [{ path: desktopFirstPaintSource, label: "CDP firstContentfulPaint — controller held" }, ...desktop.sheetItems],
      destination: path.join(options.output, "chrome-visibility-desktop-sheet.png"),
      columns: 3,
      tileWidth: 480,
      tileHeight: 300,
      title: "Phase 4-R1 chrome visibility — desktop current-runtime proxy",
    });
    await createContactSheet({
      items: [{ path: mobileFirstPaintSource, label: "CDP firstContentfulPaint — controller held" }, ...mobile.sheetItems],
      destination: path.join(options.output, "chrome-visibility-mobile-sheet.png"),
      columns: 3,
      tileWidth: 260,
      tileHeight: 563,
      title: "Phase 4-R1 chrome visibility — mobile current-runtime proxy",
    });
    await createContactSheet({
      items: fallbacks.sheetItems,
      destination: path.join(options.output, "chrome-fallbacks-sheet.png"),
      columns: 3,
      tileWidth: 480,
      tileHeight: 300,
      title: "Phase 4-R1 chrome fallbacks and route isolation",
    });
    runFfmpeg(options.ffmpeg, desktop.recordingRoot, path.join(options.output, "chrome-reveal-reverse.mp4"));
    runFfmpeg(options.ffmpeg, skip.recordingRoot, path.join(options.output, "chrome-skip-media-pending.mp4"));

    const artifacts = await Promise.all([
      artifactRecord(options.output, "CHROME_FIRST_PAINT_DESKTOP", "first-paint-desktop.png", "image/png"),
      artifactRecord(options.output, "CHROME_FIRST_PAINT_MOBILE", "first-paint-mobile.png", "image/png"),
      artifactRecord(options.output, "CHROME_MILESTONES_DESKTOP_SHEET", "chrome-visibility-desktop-sheet.png", "image/png"),
      artifactRecord(options.output, "CHROME_MILESTONES_MOBILE_SHEET", "chrome-visibility-mobile-sheet.png", "image/png"),
      artifactRecord(options.output, "CHROME_REVEAL_REVERSE_RECORDING", "chrome-reveal-reverse.mp4", "video/mp4"),
      artifactRecord(options.output, "CHROME_SKIP_PENDING_RECORDING", "chrome-skip-media-pending.mp4", "video/mp4"),
      artifactRecord(options.output, "CHROME_FALLBACKS_SHEET", "chrome-fallbacks-sheet.png", "image/png"),
    ]);
    const producerAuthorities = {
      captureScript: await producerAuthority("scripts/capture-phase4r1-chrome-evidence.mjs", !options.allowDirty),
      artifactBuilder: await producerAuthority("scripts/capture-phase4r1-chrome-evidence.mjs", !options.allowDirty),
      browserQa: await producerAuthority("scripts/qa-phase4-browser.mjs", !options.allowDirty),
      controller: await producerAuthority("src/scripts/home-cinematic-integration.ts", !options.allowDirty),
    };
    const stateCheckInventory = Object.fromEntries(states.map(({ id, checks }) => [id, checks.map(({ id: checkId }) => checkId)]));
    const machineChecksPass = allStateChecks.every(({ passed }) => passed);
    const reportPassed = machineChecksPass && authorityReady;
    const report = {
      schema: SCHEMA,
      generatedAt: new Date().toISOString(),
      evidenceLabel: SOURCE_LABEL,
      passed: reportPassed,
      humanAcceptance: null,
      productionRuntimeAuthority: {
        frameCount: 270,
        frameRate: 30,
        durationSeconds: 9,
        integratedR1PhysicalMedia: false,
        source: "accepted Phase 3 current runtime media",
        media: await runtimeMediaAuthorities(),
        git: gitState,
      },
      producerAuthorities,
      environment: {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        chromePath,
        ffmpegPath: path.resolve(options.ffmpeg),
        baseUrl: options.baseUrl,
        serverMode: options.serverMode,
        developmentAllowDirty: options.allowDirty,
        desktopViewport: DESKTOP,
        mobileViewport: MOBILE,
      },
      contract: {
        requiredStateIds: REQUIRED_STATE_IDS,
        requiredCheckIds: REQUIRED_CHECK_IDS,
        observedCheckIds,
        stateCheckInventory,
        mediaArtifactRoles: artifacts.map(({ roleId }) => roleId),
        reportAuthorityRole: "CHROME_MACHINE_REPORT",
        reportSelfHashExcluded: true,
      },
      summary: {
        requiredStateCount: REQUIRED_STATE_IDS.length,
        capturedStateCount: states.length,
        supplementalResponsiveStateCount: mobile.supplementalStates.length,
        checkCount: allStateChecks.length,
        failedCheckCount: allStateChecks.filter(({ passed }) => !passed).length,
        failedChecks: [...states, ...mobile.supplementalStates].flatMap((state) => state.checks.filter(({ passed }) => !passed).map((check) => ({ stateId: state.id, ...check }))),
        authorityReady,
        machineChecksPass,
      },
      accessibilityAndFallbackCoverage: {
        oneSemanticH1: true,
        twoEntryRoutes: true,
        nativeDocumentScroll: true,
        skipWhileMediaPending: "skip-media-pending",
        hiddenPointerFocusAudit: ["first-paint-desktop", "first-paint-mobile", "dormancy", "reverse-one-step"],
        fastLatestPosition: ["fast-jump-forward", "fast-jump-reverse", "fast-jump-latest"],
        reducedMotion: "reduced-motion",
        noJavaScript: "no-javascript",
        deepLinks: ["deep-link-entry", "deep-link-method"],
        restoredScroll: ["restored-settled", "restored-lower"],
        text200Percent: ["text-200-desktop", "text-200-mobile"],
        mediaFailure: ["media-abort", "media-404"],
        supportingRoutes: ["supporting-about", "real-404"],
      },
      states,
      supplementalResponsiveStates: mobile.supplementalStates,
      networkTraces: {
        desktop: desktop.network,
        mobile: mobile.network,
        skipMediaPending: skip.network,
      },
      recordings: {
        revealReverse: probeVideo(options.ffmpeg, path.join(options.output, "chrome-reveal-reverse.mp4")),
        skipMediaPending: probeVideo(options.ffmpeg, path.join(options.output, "chrome-skip-media-pending.mp4")),
      },
      artifacts,
      limitations: [
        "This is a current-runtime chrome-state proxy. It does not integrate, render, or evaluate R1 physical runtime media.",
        "The 270-frame / 30 fps accepted Phase 3 films remain the only browser media authority.",
        "Scripted PASS is machine evidence only and is not human acceptance of any Phase 4-R1 review gate.",
        "CDP firstContentfulPaint screenshots and lifecycle-time DOM measurements establish the pre-controller chrome state; contact sheets and recordings remain review proxies.",
      ],
    };

    await writeJsonAtomic(path.join(options.output, REPORT_FILENAME), report);
    const reportAuthority = await fileRecord(path.join(options.output, REPORT_FILENAME), options.output);
    console.log(JSON.stringify({
      passed: reportPassed,
      report: { ...reportAuthority, filename: REPORT_FILENAME },
      output: options.output,
      stateCount: states.length,
      supplementalStateCount: mobile.supplementalStates.length,
      artifactCount: artifacts.length,
      failedCheckCount: report.summary.failedCheckCount,
      authorityReady,
    }, null, 2));
    if (!reportPassed) process.exitCode = 2;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (preview && preview.exitCode === null) {
      preview.kill();
      await new Promise((resolve) => {
        preview.once("exit", resolve);
        setTimeout(resolve, 2_000);
      });
    }
    const temporaryParent = path.resolve(os.tmpdir());
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (path.dirname(resolvedTemporaryRoot) === temporaryParent && path.basename(resolvedTemporaryRoot).startsWith("qsite-phase4r1-chrome-evidence-")) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
