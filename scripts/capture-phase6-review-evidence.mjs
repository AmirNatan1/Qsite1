#!/usr/bin/env node

/**
 * Compact Phase 6 browser review capture.
 *
 * The destination and all owned staging files remain in a fresh durable
 * directory outside both the repository and OS temporary storage. Playwright
 * WebM is temporary; only silent CFR 30fps H.264/yuv420p MP4 is published.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "playwright-core";
import sharp from "sharp";

import { PHASE6_ENGINES, PHASE6_ROUTES } from "./phase6-contract.mjs";

const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-6.review-evidence-capture.v1";
export const REPORT_PATH = "capture-report.json";
export const RECORDING_VIEW = Object.freeze({ id: "recording-1280x720", width: 1280, height: 720 });
export const DEFAULT_FFMPEG = path.resolve(ROOT, "..", "phase-5a-r-work", "tooling", "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
export const DEFAULT_FFPROBE = path.resolve(ROOT, "..", "phase-5a-r-work", "tooling", "node_modules", "ffprobe-static", "bin", process.platform === "win32" ? path.join("win32", "x64", "ffprobe.exe") : "ffprobe");

export const CAPTURE_VIEWS = Object.freeze([
  Object.freeze({ id: "desktop-1440x900", label: "Desktop 1440×900", width: 1440, height: 900, columns: 2, panelWidth: 480, panelHeight: 300 }),
  Object.freeze({ id: "portrait-390x844", label: "Portrait 390×844", width: 390, height: 844, columns: 5, panelWidth: 195, panelHeight: 422 }),
  Object.freeze({ id: "narrow-320x800", label: "Narrow 320×800", width: 320, height: 800, columns: 5, panelWidth: 176, panelHeight: 440 }),
  Object.freeze({ id: "landscape-844x390", label: "Landscape 844×390", width: 844, height: 390, columns: 2, panelWidth: 480, panelHeight: 222 }),
]);

export const RECORDING_SPECS = Object.freeze([
  Object.freeze({ id: "home-forward-reverse-stop", filename: "01-home-forward-reverse-stop.mp4", description: "Home native-wheel forward, settled stop and reverse reconstruction" }),
  Object.freeze({ id: "home-entry-manifesto-history", filename: "02-home-entry-manifesto-history.mp4", description: "Supporting route to /#entry, autonomous manifesto and Back/Forward" }),
  Object.freeze({ id: "supporting-signature-motion", filename: "03-supporting-signature-motion.mp4", description: "Industries representative native-scroll signature motion" }),
  Object.freeze({ id: "maradin-media-lifecycle", filename: "04-maradin-media-lifecycle.mp4", description: "Maradin dormant, first/second initiation, replacement, departure and return" }),
]);

export const ENCODER_CONTRACT = Object.freeze({
  audioStreams: 0,
  codec: "h264",
  container: "mp4",
  fps: 30,
  pixelFormat: "yuv420p",
});

const BROWSER_TYPES = Object.freeze({ chromium, webkit, firefox });
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,})/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function relativePosix(parent, candidate) {
  return path.relative(parent, candidate).replaceAll("\\", "/");
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("--base-url must be a credential-free HTTP(S) URL without query or fragment");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

export function assertExternalDurablePath(candidate, label = "capture output") {
  if (!candidate) throw new Error(`${label} is required`);
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root) throw new Error(`${label} cannot be a filesystem root`);
  if (within(ROOT, resolved)) throw new Error(`${label} must remain outside the repository`);
  if (within(os.tmpdir(), resolved)) throw new Error(`${label} must remain outside OS temporary storage`);
  return resolved;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "",
    dryRun: false,
    engine: "chromium",
    ffmpeg: "",
    ffprobe: "",
    headed: false,
    help: false,
    output: "",
    selfTest: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--base-url") options.baseUrl = next();
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--engine") options.engine = next().toLowerCase();
    else if (argument === "--headed") options.headed = true;
    else if (argument === "--ffmpeg") options.ffmpeg = path.resolve(next());
    else if (argument === "--ffprobe") options.ffprobe = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

export function validateOptions(options) {
  if (!PHASE6_ENGINES.includes(options.engine)) throw new Error("--engine must be chromium, webkit or firefox");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  if (!options.help && !options.selfTest) {
    options.baseUrl = normalizeBaseUrl(options.baseUrl);
    options.output = assertExternalDurablePath(options.output);
  }
  return options;
}

export function expectedArtifactPaths() {
  return [
    ...PHASE6_ROUTES.flatMap((route) => CAPTURE_VIEWS.map((view) => `routes/${route.id}/${view.id}.png`)),
    ...CAPTURE_VIEWS.map((view) => `contact-sheets/all-routes-${view.id}.png`),
    ...RECORDING_SPECS.map(({ filename }) => `recordings/${filename}`),
    REPORT_PATH,
  ].sort((left, right) => left.localeCompare(right));
}

export function encoderArguments(rawFile, destination) {
  return [
    "-v", "error", "-n", "-i", rawFile,
    "-map", "0:v:0", "-an", "-map_metadata", "-1",
    "-vf", "fps=30,format=yuv420p", "-fps_mode", "cfr",
    "-c:v", "libx264", "-preset", "medium", "-crf", "26",
    "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-movflags", "+faststart", destination,
  ];
}

export function recordingContractResult(probe, expectedView = RECORDING_VIEW) {
  const videoStreams = (probe?.streams ?? []).filter(({ codec_type: type }) => type === "video");
  const audioStreams = (probe?.streams ?? []).filter(({ codec_type: type }) => type === "audio");
  const video = videoStreams[0] ?? {};
  const duration = Number(probe?.format?.duration ?? video.duration);
  const checks = {
    mp4Container: /(?:^|,)mp4(?:,|$)/.test(String(probe?.format?.format_name ?? "")),
    oneVideoStream: videoStreams.length === 1,
    zeroAudioStreams: audioStreams.length === 0,
    h264: video.codec_name === ENCODER_CONTRACT.codec,
    yuv420p: video.pix_fmt === ENCODER_CONTRACT.pixelFormat,
    dimensions: Number(video.width) === expectedView.width && Number(video.height) === expectedView.height,
    constant30Fps: [video.avg_frame_rate, video.r_frame_rate].every((value) => value === "30/1"),
    conciseDuration: Number.isFinite(duration) && duration >= 1.5 && duration <= 45,
  };
  return {
    checks,
    duration,
    media: {
      audioStreams: audioStreams.length,
      codec: video.codec_name ?? null,
      fps: video.avg_frame_rate ?? null,
      format: probe?.format?.format_name ?? null,
      height: Number(video.height) || null,
      pixelFormat: video.pix_fmt ?? null,
      width: Number(video.width) || null,
    },
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  };
}

async function exists(candidate) {
  try { await access(candidate, fsConstants.F_OK); return true; } catch { return false; }
}

async function executableVersion(candidate) {
  try {
    const { stdout, stderr } = await execFileAsync(candidate, ["-version"], { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
    return String(stdout || stderr).split(/\r?\n/)[0].trim();
  } catch {
    return null;
  }
}

async function resolveExecutable(explicit, candidates, label, { required = true } = {}) {
  const ordered = [...new Set([explicit, ...candidates].filter(Boolean))];
  if (explicit && !(await executableVersion(explicit))) throw new Error(`${label} is not executable: ${explicit}`);
  for (const candidate of ordered) {
    const version = await executableVersion(candidate);
    if (version) return { command: candidate, version };
  }
  if (required) throw new Error(`${label} was not found; pass --${label.toLowerCase()} <path>`);
  return null;
}

async function resolveMediaTools(options) {
  const ffmpeg = await resolveExecutable(options.ffmpeg, [DEFAULT_FFMPEG, "ffmpeg"], "FFmpeg");
  const siblingProbe = path.join(path.dirname(path.resolve(ffmpeg.command)), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const ffprobe = await resolveExecutable(options.ffprobe, [siblingProbe, DEFAULT_FFPROBE, "ffprobe"], "FFprobe", { required: false });
  return { ffmpeg, ffprobe };
}

async function resolveBrowser(engine) {
  const browserType = BROWSER_TYPES[engine];
  const executablePath = browserType.executablePath();
  if (!(await exists(executablePath))) {
    throw new Error(`Managed ${engine} is unavailable. Install it with: node .\\node_modules\\playwright-core\\cli.js install ${engine}`);
  }
  return { browserType, executablePath };
}

async function assertFreshDirectory(directory) {
  assertExternalDurablePath(directory);
  let ancestor = path.resolve(directory);
  while (!(await exists(ancestor))) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const [resolvedAncestor, resolvedRoot, resolvedTemp] = await Promise.all([
    realpath(ancestor),
    realpath(ROOT),
    realpath(os.tmpdir()),
  ]);
  const resolvedCandidate = path.resolve(resolvedAncestor, path.relative(ancestor, path.resolve(directory)));
  assert(!within(resolvedRoot, resolvedCandidate), "capture output resolves inside the repository through a linked ancestor");
  assert(!within(resolvedTemp, resolvedCandidate), "capture output resolves inside OS temporary storage through a linked ancestor");
  try {
    await lstat(directory);
    throw new Error(`refusing to overwrite existing Phase 6 capture: ${directory}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function assertInside(parent, candidate, label = "owned path") {
  const resolved = path.resolve(candidate);
  assert(within(parent, resolved), `${label} escaped the owned capture directory`);
  return resolved;
}

async function removeOwnedDirectory(ownedRoot, candidate = ownedRoot) {
  const root = assertExternalDurablePath(ownedRoot, "owned staging root");
  const target = assertInside(root, candidate, "cleanup target");
  await rm(target, { recursive: true, force: true });
}

function urlFor(baseUrl, routePath) {
  return new URL(routePath, baseUrl).toString();
}

async function settle(page, timeoutMs) {
  await page.waitForLoadState("load", { timeout: timeoutMs }).catch(() => undefined);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(100);
}

function safeRequestUrl(value) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return "unparseable-request";
  }
}

async function installOriginGuard(context, baseUrl, ledger) {
  const origin = new URL(baseUrl).origin;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) {
      ledger.blocked.push({ method: request.method(), path: safeRequestUrl(request.url()), resourceType: request.resourceType() });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
}

function diagnosticsFor(page, ledger, scope) {
  const byRequest = new Map();
  const handlers = {
    console(message) {
      if (["error", "warning"].includes(message.type())) ledger.console.push({ scope, type: message.type(), text: message.text().slice(0, 500) });
    },
    pageerror(error) {
      ledger.pageErrors.push({ scope, message: error.message.slice(0, 500) });
    },
    request(request) {
      const record = { failure: null, method: request.method(), path: safeRequestUrl(request.url()), resourceType: request.resourceType(), scope, status: null };
      byRequest.set(request, record);
      ledger.requests.push(record);
    },
    response(response) {
      const record = byRequest.get(response.request());
      if (record) record.status = response.status();
    },
    requestfailed(request) {
      const record = byRequest.get(request);
      if (record) record.failure = request.failure()?.errorText ?? "unknown";
    },
  };
  for (const [event, handler] of Object.entries(handlers)) page.on(event, handler);
  return () => { for (const [event, handler] of Object.entries(handlers)) page.off(event, handler); };
}

async function openRoute(page, options, route) {
  const response = await page.goto(urlFor(options.baseUrl, route.path), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  if (response?.status() !== route.expectedStatus) throw new Error(`${route.id} returned HTTP ${response?.status() ?? "none"}; expected ${route.expectedStatus}`);
  const identity = await page.evaluate(() => ({
    h1: document.querySelectorAll("main h1").length,
    route: document.body.classList.contains("home-page") ? "home" : document.querySelector("[data-route-production]")?.getAttribute("data-route-production") ?? null,
  }));
  if (identity.h1 !== 1 || identity.route !== route.identity) throw new Error(`${route.id} identity check failed: ${JSON.stringify(identity)}`);
  return response;
}

async function captureRoutePngs(browser, options, staging, ledger) {
  const records = [];
  for (const view of CAPTURE_VIEWS) {
    const context = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block", viewport: { width: view.width, height: view.height } });
    await installOriginGuard(context, options.baseUrl, ledger);
    const page = await context.newPage();
    const detach = diagnosticsFor(page, ledger, `screenshots:${view.id}`);
    try {
      for (const route of PHASE6_ROUTES) {
        await openRoute(page, options, route);
        const relativePath = `routes/${route.id}/${view.id}.png`;
        const destination = assertInside(staging, path.join(staging, ...relativePath.split("/")), "screenshot destination");
        await mkdir(path.dirname(destination), { recursive: true });
        await page.screenshot({ animations: "disabled", caret: "hide", path: destination, scale: "css", type: "png" });
        const metadata = await sharp(destination, { failOn: "error" }).metadata();
        assert(metadata.width === view.width && metadata.height === view.height, `${relativePath} dimensions differ`);
        records.push({ height: metadata.height, relativePath, route: route.id, view: view.id, width: metadata.width });
      }
    } finally {
      detach();
      await context.close();
    }
  }
  return records;
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function composeContactSheet(staging, view, engine) {
  const gap = 18;
  const outer = 30;
  const header = 84;
  const labelHeight = 42;
  const rows = Math.ceil(PHASE6_ROUTES.length / view.columns);
  const width = (outer * 2) + (view.columns * view.panelWidth) + ((view.columns - 1) * gap);
  const height = header + outer + (rows * (view.panelHeight + labelHeight)) + ((rows - 1) * gap) + outer;
  const composites = [];
  const titleSvg = `<svg width="${width}" height="${header}"><rect width="100%" height="100%" fill="#0b0e0f"/><text x="${outer}" y="38" fill="#f5f2ed" font-size="24" font-family="Arial, sans-serif" font-weight="700">Phase 6 · ${escapeXml(view.label)} · ${escapeXml(engine)}</text><text x="${outer}" y="65" fill="#9da8a6" font-size="14" font-family="Arial, sans-serif">All ten public route outcomes · viewport captures</text></svg>`;
  composites.push({ input: Buffer.from(titleSvg), left: 0, top: 0 });
  for (let index = 0; index < PHASE6_ROUTES.length; index += 1) {
    const route = PHASE6_ROUTES[index];
    const column = index % view.columns;
    const row = Math.floor(index / view.columns);
    const left = outer + (column * (view.panelWidth + gap));
    const top = header + outer + (row * (view.panelHeight + labelHeight + gap));
    const source = assertInside(staging, path.join(staging, "routes", route.id, `${view.id}.png`), "contact-sheet source");
    const thumbnail = await sharp(source, { failOn: "error" }).resize({
      background: "#050708",
      fit: "contain",
      height: view.panelHeight,
      width: view.panelWidth,
    }).png().toBuffer();
    composites.push({ input: thumbnail, left, top });
    const label = `<svg width="${view.panelWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#121718"/><text x="12" y="26" fill="#f5f2ed" font-size="15" font-family="Arial, sans-serif" font-weight="600">${String(index + 1).padStart(2, "0")} · ${escapeXml(route.id)} · ${escapeXml(route.path)}</text></svg>`;
    composites.push({ input: Buffer.from(label), left, top: top + view.panelHeight });
  }
  const relativePath = `contact-sheets/all-routes-${view.id}.png`;
  const destination = assertInside(staging, path.join(staging, ...relativePath.split("/")), "contact-sheet destination");
  await mkdir(path.dirname(destination), { recursive: true });
  await sharp({ create: { background: "#080b0c", channels: 4, height, width } }).composite(composites).png().toFile(destination);
  return { height, relativePath, routes: PHASE6_ROUTES.length, view: view.id, width };
}

async function nativeWheelTo(page, targetY, timeoutMs, { pause = 70, step = 620 } = {}) {
  const started = Date.now();
  const maximum = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  const target = Math.max(0, Math.min(maximum, Math.round(targetY)));
  await page.mouse.move(20, 20);
  let previous = null;
  for (;;) {
    const current = await page.evaluate(() => Math.round(scrollY));
    if (Math.abs(current - target) <= 2) return current;
    if (Date.now() - started > timeoutMs) throw new Error(`native wheel timed out at ${current} while targeting ${target}`);
    const delta = Math.sign(target - current) * Math.min(step, Math.abs(target - current));
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(pause);
    const next = await page.evaluate(() => Math.round(scrollY));
    if (next === current && previous === current) throw new Error(`native wheel stalled at ${current}`);
    previous = current;
  }
}

async function maximumScroll(page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
}

async function waitForHomeController(page, timeoutMs) {
  await page.waitForFunction(() => {
    const mode = document.documentElement.dataset.cinematicMode;
    const media = document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state");
    return mode === "static" || media === "ready" || media?.startsWith("failed");
  }, undefined, { timeout: Math.min(timeoutMs, 15_000) }).catch(() => undefined);
}

async function scrollLocatorIntoViewWithWheel(page, locator, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const box = await locator.boundingBox().catch(() => null);
    if (box && box.y >= 40 && box.y + box.height <= RECORDING_VIEW.height - 30) return;
    await page.mouse.wheel(0, box && box.y < 40 ? -520 : 520);
    await page.waitForTimeout(80);
  }
  throw new Error("native wheel could not reveal the requested control");
}

async function observeRecordingState(page) {
  return page.evaluate(() => ({
    activeMaradinVideos: [...document.querySelectorAll("[data-maradin-player][data-video-state='active']")].map((player) => player.querySelector("video")?.id ?? null),
    cinematicMode: document.documentElement.dataset.cinematicMode ?? null,
    hash: location.hash,
    manifestoReveal: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") ?? null,
    path: location.pathname,
    scrollY: Math.round(scrollY),
  }));
}

async function homeForwardReverseStop(page, options) {
  await page.goto(urlFor(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  await waitForHomeController(page, options.timeoutMs);
  const states = { initial: await observeRecordingState(page) };
  const maximum = await maximumScroll(page);
  await page.waitForTimeout(350);
  await nativeWheelTo(page, maximum * 0.26, options.timeoutMs, { pause: 90, step: 380 });
  states.forward = await observeRecordingState(page);
  await page.waitForTimeout(800);
  states.stopped = await observeRecordingState(page);
  await nativeWheelTo(page, maximum * 0.10, options.timeoutMs, { pause: 85, step: 330 });
  states.reverse = await observeRecordingState(page);
  await page.waitForTimeout(650);
  return states;
}

async function homeEntryManifestoHistory(page, options) {
  await page.goto(urlFor(options.baseUrl, "/about/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  const states = { supporting: await observeRecordingState(page) };
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/" && url.hash === "#entry", { timeout: options.timeoutMs }),
    page.locator(".brand-link[href='/#entry']").first().click({ timeout: options.timeoutMs }),
  ]);
  await settle(page, options.timeoutMs);
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: Math.min(options.timeoutMs, 5_000) }).catch(() => undefined);
  states.entry = await observeRecordingState(page);
  await page.waitForTimeout(850);
  await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  states.back = await observeRecordingState(page);
  await page.waitForTimeout(450);
  await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  states.forward = await observeRecordingState(page);
  await page.waitForTimeout(750);
  return states;
}

async function supportingSignatureMotion(page, options) {
  await page.goto(urlFor(options.baseUrl, "/industries/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  const states = { initial: await observeRecordingState(page) };
  const maximum = await maximumScroll(page);
  await nativeWheelTo(page, maximum * 0.48, options.timeoutMs, { pause: 100, step: 440 });
  states.forward = await observeRecordingState(page);
  await page.waitForTimeout(650);
  await nativeWheelTo(page, maximum * 0.16, options.timeoutMs, { pause: 90, step: 380 });
  states.reverse = await observeRecordingState(page);
  await page.waitForTimeout(650);
  return states;
}

async function maradinMediaLifecycle(page, options) {
  await page.goto(urlFor(options.baseUrl, "/pocs/maradin/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  const players = page.locator("[data-maradin-player]");
  const states = { dormant: await observeRecordingState(page) };
  await page.waitForTimeout(450);
  await players.nth(0).locator("[data-maradin-play]").click({ timeout: options.timeoutMs });
  await page.waitForFunction(() => document.querySelectorAll("[data-maradin-player][data-video-state='active']").length === 1);
  states.first = await observeRecordingState(page);
  await page.waitForTimeout(750);
  const second = players.nth(1).locator("[data-maradin-play]");
  await scrollLocatorIntoViewWithWheel(page, second, options.timeoutMs);
  await second.click({ timeout: options.timeoutMs });
  await page.waitForFunction(() => document.querySelectorAll("[data-maradin-player][data-video-state='active']").length === 1);
  states.second = await observeRecordingState(page);
  await page.waitForTimeout(750);
  await page.goto(urlFor(options.baseUrl, "/about/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  states.departed = await observeRecordingState(page);
  await page.waitForTimeout(500);
  await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  states.returned = await observeRecordingState(page);
  await page.waitForTimeout(550);
  return states;
}

const RECORDING_ACTIONS = Object.freeze({
  "home-forward-reverse-stop": homeForwardReverseStop,
  "home-entry-manifesto-history": homeEntryManifestoHistory,
  "supporting-signature-motion": supportingSignatureMotion,
  "maradin-media-lifecycle": maradinMediaLifecycle,
});

async function runCommand(command, args, label) {
  try {
    return await execFileAsync(command, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`${label} failed: ${error.stderr || error.message}`);
  }
}

async function probeRecording(ffprobe, file) {
  const { stdout } = await runCommand(ffprobe, [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,duration:format=format_name,duration",
    "-of", "json",
    file,
  ], "FFprobe recording validation");
  return JSON.parse(stdout);
}

async function normalizeRecording(tools, staging, rawFile, relativePath) {
  assertInside(staging, rawFile, "raw recording");
  const destination = assertInside(staging, path.join(staging, ...relativePath.split("/")), "recording destination");
  const partial = assertInside(staging, `${destination}.partial.mp4`, "recording partial");
  await mkdir(path.dirname(destination), { recursive: true });
  await runCommand(tools.ffmpeg.command, encoderArguments(rawFile, partial), "FFmpeg normalization");
  await runCommand(tools.ffmpeg.command, ["-v", "error", "-i", partial, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], "FFmpeg full-decode validation");
  let validation = { status: "FFPROBE_UNAVAILABLE", checks: null, statement: "Full FFmpeg decode passed; no FFprobe executable was available." };
  if (tools.ffprobe) {
    const probe = await probeRecording(tools.ffprobe.command, partial);
    validation = recordingContractResult(probe);
    if (validation.status !== "PASS") throw new Error(`${relativePath} encoder contract failed: ${JSON.stringify(validation)}`);
  }
  await rename(partial, destination);
  await rm(rawFile, { force: true });
  return { relativePath, validation };
}

async function recordEvidence(browser, options, staging, rawRoot, tools, ledger) {
  const records = [];
  for (const spec of RECORDING_SPECS) {
    const rawDirectory = assertInside(staging, path.join(rawRoot, spec.id), "raw recording directory");
    await mkdir(rawDirectory, { recursive: true });
    const context = await browser.newContext({
      colorScheme: "dark",
      recordVideo: { dir: rawDirectory, size: { width: RECORDING_VIEW.width, height: RECORDING_VIEW.height } },
      serviceWorkers: "block",
      viewport: { width: RECORDING_VIEW.width, height: RECORDING_VIEW.height },
    });
    await installOriginGuard(context, options.baseUrl, ledger);
    const page = await context.newPage();
    const detach = diagnosticsFor(page, ledger, `recording:${spec.id}`);
    const video = page.video();
    let states;
    try {
      states = await RECORDING_ACTIONS[spec.id](page, options);
    } finally {
      detach();
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
    const rawFile = await video.path();
    const normalized = await normalizeRecording(tools, staging, rawFile, `recordings/${spec.filename}`);
    records.push({ description: spec.description, id: spec.id, states, ...normalized });
  }
  return records;
}

async function walkFiles(root, directory = root) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = assertInside(root, path.join(directory, entry.name), "artifact walk path");
    if (entry.isDirectory()) results.push(...await walkFiles(root, absolute));
    else if (entry.isFile()) results.push(relativePosix(root, absolute));
    else throw new Error(`capture contains unsupported filesystem entry: ${relativePosix(root, absolute)}`);
  }
  return results.sort((left, right) => left.localeCompare(right));
}

export async function validateTopology(directory, { includeReport = true } = {}) {
  const expected = expectedArtifactPaths().filter((relativePath) => includeReport || relativePath !== REPORT_PATH);
  const actual = await walkFiles(directory);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `capture topology differs: expected ${expected.length}, observed ${actual.length}`);
  assert(!actual.some((relativePath) => /(?:^|\/)(?:\.raw|raw|frames)(?:\/|$)|\.(?:webm|partial\.mp4)$/i.test(relativePath)), "raw/intermediate capture files remain");
  return true;
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function fileManifest(staging) {
  const paths = (await walkFiles(staging)).filter((relativePath) => relativePath !== REPORT_PATH);
  const records = [];
  for (const relativePath of paths) {
    const absolute = assertInside(staging, path.join(staging, ...relativePath.split("/")), "manifest artifact");
    const info = await stat(absolute);
    records.push({ bytes: info.size, relativePath, sha256: await sha256File(absolute) });
  }
  return records;
}

function assertPrivacySafe(value) {
  const serialized = JSON.stringify(value);
  assert(!PRIVATE_TEXT.test(serialized), "capture report contains a private path or secret-like value");
  return true;
}

export function runSelfTest() {
  assert(PHASE6_ROUTES.length === 10, "self-test route count differs");
  assert(CAPTURE_VIEWS.length === 4, "self-test view count differs");
  assert(RECORDING_SPECS.length === 4, "self-test recording count differs");
  assert(expectedArtifactPaths().length === 49, "self-test topology count differs");
  assert(!expectedArtifactPaths().some((value) => value.endsWith(".webm")), "self-test topology retains WebM");
  const args = encoderArguments("input.webm", "output.mp4");
  for (const token of ["-an", "fps=30,format=yuv420p", "cfr", "libx264", "+faststart"]) assert(args.includes(token), `encoder self-test misses ${token}`);
  const fixture = recordingContractResult({
    format: { duration: "4.0", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
    streams: [{ avg_frame_rate: "30/1", codec_name: "h264", codec_type: "video", height: 720, pix_fmt: "yuv420p", r_frame_rate: "30/1", width: 1280 }],
  });
  assert(fixture.status === "PASS", "encoder probe self-test differs");
  assertExternalDurablePath(path.resolve(ROOT, "..", "phase-6-review-work", "self-test"));
  return { artifacts: 49, recordings: 4, routes: 10, schema: SCHEMA, status: "PASS", views: 4 };
}

export async function capturePhase6ReviewEvidence(options) {
  validateOptions(options);
  await assertFreshDirectory(options.output);
  const staging = assertExternalDurablePath(`${options.output}.staging-${process.pid}-${randomUUID()}`, "owned staging root");
  await assertFreshDirectory(staging);
  const rawRoot = assertInside(staging, path.join(staging, ".raw"), "raw root");
  let published = false;
  try {
    const [resolvedBrowser, tools] = await Promise.all([resolveBrowser(options.engine), resolveMediaTools(options)]);
    await mkdir(path.dirname(staging), { recursive: true });
    await mkdir(staging, { recursive: false });
    await mkdir(rawRoot, { recursive: true });
    const browser = await resolvedBrowser.browserType.launch({
      executablePath: resolvedBrowser.executablePath,
      headless: !options.headed,
    });
    const browserVersion = browser.version();
    const ledger = { blocked: [], console: [], pageErrors: [], requests: [] };
    let screenshots;
    let contactSheets;
    let recordings;
    try {
      screenshots = await captureRoutePngs(browser, options, staging, ledger);
      contactSheets = [];
      for (const view of CAPTURE_VIEWS) contactSheets.push(await composeContactSheet(staging, view, options.engine));
      recordings = await recordEvidence(browser, options, staging, rawRoot, tools, ledger);
    } finally {
      await browser.close().catch(() => undefined);
    }
    await removeOwnedDirectory(staging, rawRoot);
    await validateTopology(staging, { includeReport: false });
    const files = await fileManifest(staging);
    const report = {
      baseUrl: options.baseUrl,
      browser: {
        engine: options.engine,
        executable: path.basename(resolvedBrowser.executablePath),
        headed: options.headed,
        version: browserVersion,
      },
      capturePolicy: {
        externalFreshOutput: true,
        inputs: "Playwright native wheel, keyboard, pointer and browser history only; no page scroll-position writes",
        privacySafe: true,
        rawFramesRetained: false,
        rawWebmRetained: false,
      },
      contactSheets,
      createdAt: new Date().toISOString(),
      encoder: {
        contract: ENCODER_CONTRACT,
        ffmpeg: tools.ffmpeg.version,
        ffprobe: tools.ffprobe?.version ?? null,
        fullDecodeValidated: true,
      },
      files,
      recordings,
      requests: ledger,
      routes: PHASE6_ROUTES.map(({ id, path: routePath, expectedStatus }) => ({ expectedStatus, id, path: routePath })),
      schema: SCHEMA,
      screenshots,
      status: "CAPTURED",
      summary: {
        artifacts: expectedArtifactPaths().length,
        blockedExternalRequests: ledger.blocked.length,
        contactSheets: contactSheets.length,
        recordings: recordings.length,
        routePngs: screenshots.length,
        routes: PHASE6_ROUTES.length,
      },
    };
    assertPrivacySafe(report);
    const reportPath = assertInside(staging, path.join(staging, REPORT_PATH), "capture report");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await validateTopology(staging);
    await rename(staging, options.output);
    published = true;
    return report;
  } finally {
    if (!published && await exists(staging)) await removeOwnedDirectory(staging);
  }
}

function usage() {
  return [
    "Usage:",
    "  node scripts/capture-phase6-review-evidence.mjs --base-url <preview> --output <fresh-external-dir> --engine chromium|webkit|firefox [--headed] [--ffmpeg <path>] [--ffprobe <path>]",
    "  node scripts/capture-phase6-review-evidence.mjs --dry-run --base-url <preview> --output <fresh-external-dir> --engine chromium|webkit|firefox [--headed] [--ffmpeg <path>]",
    "  node scripts/capture-phase6-review-evidence.mjs --self-test",
    "",
    "Firefox may require --headed on this Windows host. A supplied/sibling FFprobe is used for exact stream validation; FFmpeg always performs a full decode.",
  ].join("\n");
}

async function main() {
  const options = validateOptions(parseArguments(process.argv.slice(2)));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
    return;
  }
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({
      baseUrl: options.baseUrl,
      engine: options.engine,
      headed: options.headed,
      outputPolicy: "fresh durable external directory; dry-run performs no writes",
      schema: SCHEMA,
      status: "DRY-RUN",
      topology: expectedArtifactPaths(),
    }, null, 2)}\n`);
    return;
  }
  const report = await capturePhase6ReviewEvidence(options);
  process.stdout.write(`${JSON.stringify({ output: options.output, status: report.status, summary: report.summary }, null, 2)}\n`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 6 review capture failed: ${error.message}`);
  process.exitCode = 1;
});
