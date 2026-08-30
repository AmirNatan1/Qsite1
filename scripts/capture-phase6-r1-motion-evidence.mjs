#!/usr/bin/env node

/**
 * Phase 6-R1 supplemental machine motion evidence.
 *
 * This deliberately records native wheel/pointer navigation only. It never
 * writes page scroll state and it never represents its output as physical
 * device evidence.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { chromium, firefox } from "playwright-core";

import {
  ENCODER_CONTRACT,
  RECORDING_VIEW,
  assertExternalDurablePath,
  encoderArguments,
  recordingContractResult,
} from "./capture-phase6-review-evidence.mjs";

const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-6-r1.motion-evidence.v1";
export const REPORT_PATH = "motion-evidence-report.json";
export const RECORDING_SPECS = Object.freeze([
  Object.freeze({ id: "forward-physical-to-manifesto", filename: "01-forward-physical-to-manifesto.mp4" }),
  Object.freeze({ id: "reverse-manifesto-to-f1", filename: "02-reverse-manifesto-to-f1.mp4" }),
  Object.freeze({ id: "stop-at-authored-states", filename: "03-stop-at-authored-states.mp4" }),
  Object.freeze({ id: "resize-orientation-mid-current-and-manifesto", filename: "04-resize-orientation-mid-current-and-manifesto.mp4" }),
  Object.freeze({ id: "supporting-route-entry-and-reverse", filename: "05-supporting-route-entry-and-reverse.mp4" }),
]);

const BROWSER_TYPES = Object.freeze({ chromium, firefox });
const PHYSICAL_LANDMARKS = Object.freeze([
  Object.freeze({ label: "F1", frame: 1 }),
  Object.freeze({ label: "current", frame: 150 }),
  Object.freeze({ label: "arrival", frame: 285 }),
  Object.freeze({ label: "indicator", frame: 292 }),
  Object.freeze({ label: "line", frame: 307 }),
  Object.freeze({ label: "raster", frame: 340 }),
  Object.freeze({ label: "Q", frame: 370 }),
  Object.freeze({ label: "threshold", frame: 490 }),
]);
const DEFAULT_FFMPEG = path.resolve(ROOT, "..", "phase-5a-r-work", "tooling", "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const DEFAULT_FFPROBE = path.resolve(ROOT, "..", "phase-5a-r-work", "tooling", "node_modules", "ffprobe-static", "bin", process.platform === "win32" ? path.join("win32", "x64", "ffprobe.exe") : "ffprobe");
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,})/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    timeoutMs: 45_000,
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
  if (!Object.hasOwn(BROWSER_TYPES, options.engine)) throw new Error("--engine must be chromium or firefox");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  if (!options.help && !options.selfTest) {
    options.baseUrl = normalizeBaseUrl(options.baseUrl);
    options.output = assertExternalDurablePath(options.output, "R1 motion output");
  }
  return options;
}

export function expectedArtifactPaths() {
  return [...RECORDING_SPECS.map(({ filename }) => `recordings/${filename}`), REPORT_PATH]
    .sort((left, right) => left.localeCompare(right));
}

async function exists(candidate) {
  try { await access(candidate); return true; } catch { return false; }
}

async function executableVersion(candidate) {
  try {
    const { stdout, stderr } = await execFileAsync(candidate, ["-version"], { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
    return String(stdout || stderr).split(/\r?\n/)[0].trim();
  } catch {
    return null;
  }
}

async function resolveExecutable(explicit, candidates, label) {
  for (const candidate of [...new Set([explicit, ...candidates].filter(Boolean))]) {
    const version = await executableVersion(candidate);
    if (version) return { command: candidate, version };
  }
  throw new Error(`${label} was not found`);
}

async function resolveTools(options) {
  const ffmpeg = await resolveExecutable(options.ffmpeg, [DEFAULT_FFMPEG, "ffmpeg"], "FFmpeg");
  const sibling = path.join(path.dirname(ffmpeg.command), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const ffprobe = await resolveExecutable(options.ffprobe, [sibling, DEFAULT_FFPROBE, "ffprobe"], "FFprobe");
  return { ffmpeg, ffprobe };
}

async function assertFreshDirectory(directory) {
  assertExternalDurablePath(directory, "R1 motion output");
  if (await exists(directory)) throw new Error(`refusing to overwrite existing R1 motion evidence: ${directory}`);
}

export function stagingPathForOutput(output, pid = process.pid, nonce = randomUUID().slice(0, 8)) {
  assert(Number.isInteger(pid) && pid > 0, "staging process id differs");
  assert(/^[0-9a-f]{8}$/i.test(nonce), "staging nonce differs");
  // Keep the transient basename deliberately short: FFmpeg on Windows may still
  // encounter MAX_PATH through native codec libraries even when Node itself does not.
  return path.join(path.dirname(path.resolve(output)), `.p6r1-${pid}-${nonce}`);
}

function inside(parent, candidate) {
  const resolvedParent = path.resolve(parent);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedParent, resolved);
  assert(relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)), "owned output path escaped");
  return resolved;
}

export function assertOwnedRawFile(rawDirectory, candidate) {
  const resolvedDirectory = path.resolve(rawDirectory);
  const resolved = inside(resolvedDirectory, candidate);
  assert(resolved !== resolvedDirectory, "raw recording path must be a file below its owned raw directory");
  return resolved;
}

function urlFor(baseUrl, routePath) {
  return new URL(routePath, baseUrl).toString();
}

function safeRequestPath(value) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return "unparseable-request";
  }
}

async function installOriginGuard(context, baseUrl, ledger, scope) {
  const origin = new URL(baseUrl).origin;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) {
      ledger.blocked.push({ method: request.method(), path: safeRequestPath(request.url()), resourceType: request.resourceType(), scope });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
}

function attachDiagnostics(page, ledger, scope) {
  const requestMap = new Map();
  const consoleHandler = (message) => {
    if (["error", "warning"].includes(message.type())) ledger.console.push({ scope, type: message.type(), text: message.text().slice(0, 500) });
  };
  const pageErrorHandler = (error) => ledger.pageErrors.push({ scope, message: error.message.slice(0, 500) });
  const requestHandler = (request) => {
    const record = { failure: null, method: request.method(), path: safeRequestPath(request.url()), resourceType: request.resourceType(), scope, status: null };
    requestMap.set(request, record);
    ledger.requests.push(record);
  };
  const responseHandler = (response) => {
    const record = requestMap.get(response.request());
    if (record) record.status = response.status();
  };
  const failedHandler = (request) => {
    const record = requestMap.get(request);
    if (record) record.failure = request.failure()?.errorText ?? "unknown";
  };
  page.on("console", consoleHandler);
  page.on("pageerror", pageErrorHandler);
  page.on("request", requestHandler);
  page.on("response", responseHandler);
  page.on("requestfailed", failedHandler);
  return () => {
    page.off("console", consoleHandler);
    page.off("pageerror", pageErrorHandler);
    page.off("request", requestHandler);
    page.off("response", responseHandler);
    page.off("requestfailed", failedHandler);
  };
}

function isExpectedBlobMediaTeardown(record) {
  return record?.method === "GET"
    && record?.resourceType === "media"
    && record?.status === null
    && /^(?:net::ERR_ABORTED|NS_BINDING_ABORTED)$/i.test(String(record?.failure ?? ""))
    // safeRequestPath returns a nested HTTP(S) URL only for blob: media URLs.
    && /^https?:\/\//i.test(String(record?.path ?? ""));
}

export function evaluateDiagnostics(ledger) {
  const failures = [];
  for (const error of ledger?.pageErrors ?? []) {
    failures.push({ type: "PAGE ERROR", scope: error.scope ?? null, message: error.message ?? "unknown page error" });
  }
  for (const request of ledger?.blocked ?? []) {
    failures.push({
      type: "BLOCKED REQUEST",
      scope: request.scope ?? null,
      method: request.method ?? null,
      path: request.path ?? null,
      resourceType: request.resourceType ?? null,
    });
  }
  for (const request of ledger?.requests ?? []) {
    if (request?.failure && !isExpectedBlobMediaTeardown(request)) {
      failures.push({
        type: "FAILED REQUEST",
        scope: request.scope ?? null,
        method: request.method ?? null,
        path: request.path ?? null,
        resourceType: request.resourceType ?? null,
        failure: request.failure,
      });
    }
  }
  return { status: failures.length === 0 ? "PASS" : "FAIL", failures };
}

async function settle(page, timeoutMs) {
  await page.waitForLoadState("load", { timeout: timeoutMs }).catch(() => undefined);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(120);
}

async function homeState(page, label) {
  return page.evaluate((sampleLabel) => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const video = document.querySelector("[data-cinematic-media]");
    const state = window.quantumPhase4 ?? {};
    return {
      label: sampleLabel,
      url: `${location.pathname}${location.hash}`,
      viewport: { width: innerWidth, height: innerHeight },
      documentHidden: document.hidden,
      scrollY: Math.round(scrollY),
      maximumScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      mode: document.documentElement.dataset.cinematicMode ?? null,
      mediaState: shell?.getAttribute("data-media-state") ?? null,
      phase: shell?.getAttribute("data-cinematic-phase") ?? null,
      segment: shell?.getAttribute("data-cinematic-segment") ?? state.segment ?? null,
      targetFrame: Number(shell?.getAttribute("data-target-frame") ?? state.targetFrame ?? 0),
      presentedFrame: Number(shell?.getAttribute("data-presented-frame") ?? state.presentedFrame ?? 0),
      manifestoReveal: shell?.getAttribute("data-manifesto-reveal") ?? null,
      navigationReleased: shell?.getAttribute("data-route-navigation") ?? null,
      video: video ? {
        currentTime: Number(video.currentTime.toFixed(4)),
        paused: video.paused,
        readyState: video.readyState,
        hasSource: Boolean(video.currentSrc || video.getAttribute("src")),
      } : null,
    };
  }, label);
}

async function openEnhancedHome(page, options, routePath = "/") {
  const response = await page.goto(urlFor(options.baseUrl, routePath), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  assert(response?.ok(), `Home returned ${response?.status() ?? "no response"}`);
  await settle(page, options.timeoutMs);
  await page.waitForFunction(() => {
    const root = document.documentElement;
    const media = document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state");
    return root.dataset.cinematicMode === "enhanced" && media === "ready";
  }, undefined, { timeout: options.timeoutMs });
}

async function waitForPresentedFrame(page, timeoutMs) {
  await page.waitForFunction(() => {
    const state = window.quantumPhase4;
    return state && state.mediaReady && Math.abs(state.presentedFrame - state.targetFrame) <= 1;
  }, undefined, { timeout: Math.min(timeoutMs, 12_000) });
}

async function wheelUntilFrame(page, frame, timeoutMs) {
  const started = Date.now();
  await page.mouse.move(24, 24);
  for (;;) {
    const state = await homeState(page, "wheel-progress");
    const reached = frame <= 1
      ? state.scrollY === 0
      : state.targetFrame >= frame && state.targetFrame <= frame + 6;
    if (reached) break;
    if (Date.now() - started > timeoutMs) throw new Error(`native wheel timed out targeting F${frame} from F${state.targetFrame}`);
    const direction = state.targetFrame < frame ? 1 : -1;
    const distance = Math.abs(state.targetFrame - frame);
    const delta = direction * (distance > 80 ? 70 : distance > 20 ? 32 : 10);
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(35);
  }
  await waitForPresentedFrame(page, timeoutMs);
}

async function wheelToBoundary(page, boundary, timeoutMs) {
  const started = Date.now();
  await page.mouse.move(24, 24);
  let unchanged = 0;
  let previous = -1;
  for (;;) {
    const state = await homeState(page, "wheel-boundary");
    const reached = boundary === "end" ? state.scrollY >= state.maximumScroll - 1 : state.scrollY === 0;
    if (reached) return;
    if (Date.now() - started > timeoutMs) throw new Error(`native wheel timed out targeting ${boundary}`);
    unchanged = state.scrollY === previous ? unchanged + 1 : 0;
    if (unchanged > 4) throw new Error(`native wheel stalled before ${boundary} at ${state.scrollY}`);
    previous = state.scrollY;
    await page.mouse.wheel(0, boundary === "end" ? 240 : -240);
    await page.waitForTimeout(45);
  }
}

async function sampleLandmark(page, samples, landmark, options, pauseMs = 320) {
  await wheelUntilFrame(page, landmark.frame, options.timeoutMs);
  await page.waitForTimeout(pauseMs);
  samples.push(await homeState(page, landmark.label));
}

async function waitForManifesto(page, timeoutMs) {
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", undefined, { timeout: Math.min(timeoutMs, 8_000) });
}

async function wheelToManifestoThreshold(page, timeoutMs) {
  const started = Date.now();
  await page.mouse.move(24, 24);
  for (;;) {
    const state = await homeState(page, "manifesto-progress");
    if (state.phase === "settled" || state.manifestoReveal !== "hidden") return state;
    if (Date.now() - started > timeoutMs) throw new Error(`native wheel timed out before manifesto threshold at ${state.scrollY}`);
    await page.mouse.wheel(0, 70);
    await page.waitForTimeout(45);
  }
}

async function forwardPhysicalToManifesto(page, options) {
  await openEnhancedHome(page, options, "/");
  const samples = [await homeState(page, "F1")];
  for (const landmark of PHYSICAL_LANDMARKS.slice(1)) await sampleLandmark(page, samples, landmark, options);
  await wheelToManifestoThreshold(page, options.timeoutMs);
  samples.push(await homeState(page, "manifesto-threshold"));
  await waitForManifesto(page, options.timeoutMs);
  await page.waitForTimeout(900);
  samples.push(await homeState(page, "manifesto-resolved"));
  return { samples, status: "PASS" };
}

async function reverseManifestoToF1(page, options) {
  await openEnhancedHome(page, options, "/#entry");
  await waitForManifesto(page, options.timeoutMs);
  const samples = [await homeState(page, "manifesto")];
  const reverse = [
    { label: "threshold", frame: 490 },
    { label: "Q", frame: 370 },
    { label: "raster", frame: 340 },
    { label: "line", frame: 307 },
    { label: "arrival", frame: 285 },
    { label: "current", frame: 150 },
    { label: "F1", frame: 1 },
  ];
  for (const landmark of reverse) await sampleLandmark(page, samples, landmark, options);
  await wheelToBoundary(page, "top", options.timeoutMs);
  await page.waitForTimeout(700);
  samples.push(await homeState(page, "F1-rest"));
  return { samples, status: "PASS" };
}

async function stopAtAuthoredStates(page, options) {
  await openEnhancedHome(page, options, "/");
  const stops = [];
  for (const landmark of PHYSICAL_LANDMARKS.filter(({ label }) => ["current", "line", "raster", "Q"].includes(label))) {
    await wheelUntilFrame(page, landmark.frame, options.timeoutMs);
    const before = await homeState(page, `${landmark.label}-before-pause`);
    await page.waitForTimeout(1_250);
    const after = await homeState(page, `${landmark.label}-after-pause`);
    const stable = Math.abs(after.scrollY - before.scrollY) <= 1
      && after.targetFrame === before.targetFrame
      && after.presentedFrame === before.presentedFrame
      && after.video?.paused === true
      && Math.abs((after.video?.currentTime ?? 0) - (before.video?.currentTime ?? 0)) <= 0.04;
    assert(stable, `${landmark.label} did not remain physically frozen at rest`);
    stops.push({ label: landmark.label, before, after, status: "PASS" });
  }
  return { stops, status: "PASS" };
}

async function resizeOrientation(page, options) {
  await openEnhancedHome(page, options, "/");
  await wheelUntilFrame(page, 150, options.timeoutMs);
  const samples = [await homeState(page, "current-landscape-before")];
  await page.setViewportSize({ width: 720, height: 1280 });
  await settle(page, options.timeoutMs);
  await page.waitForTimeout(600);
  samples.push(await homeState(page, "current-portrait"));
  await page.setViewportSize(RECORDING_VIEW);
  await settle(page, options.timeoutMs);
  samples.push(await homeState(page, "current-landscape-return"));
  await wheelToManifestoThreshold(page, options.timeoutMs);
  await waitForManifesto(page, options.timeoutMs);
  samples.push(await homeState(page, "manifesto-landscape-before"));
  await page.setViewportSize({ width: 720, height: 1280 });
  await settle(page, options.timeoutMs);
  await page.waitForTimeout(600);
  samples.push(await homeState(page, "manifesto-portrait"));
  await page.setViewportSize(RECORDING_VIEW);
  await settle(page, options.timeoutMs);
  await page.waitForTimeout(600);
  samples.push(await homeState(page, "manifesto-landscape-return"));
  assert(samples.every(({ horizontalOverflow }) => horizontalOverflow <= 1), "orientation simulation exposed horizontal overflow");
  return { samples, status: "PASS" };
}

async function supportingRouteEntryAndReverse(page, options) {
  const response = await page.goto(urlFor(options.baseUrl, "/about/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  assert(response?.ok(), `About returned ${response?.status() ?? "no response"}`);
  await settle(page, options.timeoutMs);
  const samples = [await homeState(page, "supporting-about")];
  await page.locator(".brand-link[href='/#entry']").first().click({ timeout: options.timeoutMs });
  await page.waitForURL((url) => url.pathname === "/" && url.hash === "#entry", { timeout: options.timeoutMs });
  await settle(page, options.timeoutMs);
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced", undefined, { timeout: options.timeoutMs });
  await waitForManifesto(page, options.timeoutMs);
  samples.push(await homeState(page, "home-entry"));
  for (const landmark of [
    { label: "Q", frame: 370 },
    { label: "raster", frame: 340 },
    { label: "line", frame: 307 },
    { label: "arrival", frame: 285 },
    { label: "current", frame: 150 },
    { label: "F1", frame: 1 },
  ]) await sampleLandmark(page, samples, landmark, options);
  await wheelToBoundary(page, "top", options.timeoutMs);
  return { samples, status: "PASS" };
}

const ACTIONS = Object.freeze({
  "forward-physical-to-manifesto": forwardPhysicalToManifesto,
  "reverse-manifesto-to-f1": reverseManifestoToF1,
  "stop-at-authored-states": stopAtAuthoredStates,
  "resize-orientation-mid-current-and-manifesto": resizeOrientation,
  "supporting-route-entry-and-reverse": supportingRouteEntryAndReverse,
});

async function runCommand(command, args, label) {
  try {
    return await execFileAsync(command, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`${label} failed: ${error.stderr || error.message}`);
  }
}

async function normalizeRecording(tools, staging, rawDirectory, rawFile, relativePath) {
  const ownedRawFile = assertOwnedRawFile(rawDirectory, rawFile);
  const destination = inside(staging, path.join(staging, ...relativePath.split("/")));
  const partial = inside(staging, `${destination}.partial.mp4`);
  await mkdir(path.dirname(destination), { recursive: true });
  await runCommand(tools.ffmpeg.command, encoderArguments(ownedRawFile, partial), "FFmpeg normalization");
  await runCommand(tools.ffmpeg.command, ["-v", "error", "-i", partial, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], "FFmpeg full-decode validation");
  const { stdout } = await runCommand(tools.ffprobe.command, [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,duration:format=format_name,duration",
    "-of", "json",
    partial,
  ], "FFprobe recording validation");
  const validation = recordingContractResult(JSON.parse(stdout));
  assert(validation.status === "PASS", `${relativePath} encoder contract failed`);
  await rename(partial, destination);
  await rm(assertOwnedRawFile(rawDirectory, ownedRawFile), { force: true });
  const info = await stat(destination);
  return { relativePath, byteSize: info.size, sha256: createHash("sha256").update(await readFile(destination)).digest("hex"), validation };
}

async function recordStory(browser, options, staging, rawRoot, tools, ledger, spec) {
  const rawDirectory = inside(staging, path.join(rawRoot, spec.id));
  await mkdir(rawDirectory, { recursive: true });
  const context = await browser.newContext({
    colorScheme: "dark",
    recordVideo: { dir: rawDirectory, size: RECORDING_VIEW },
    serviceWorkers: "block",
    viewport: RECORDING_VIEW,
  });
  await installOriginGuard(context, options.baseUrl, ledger, spec.id);
  const page = await context.newPage();
  const detach = attachDiagnostics(page, ledger, spec.id);
  const video = page.video();
  let observations;
  try {
    observations = await ACTIONS[spec.id](page, options);
  } finally {
    detach();
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
  const rawFile = await video.path();
  const media = await normalizeRecording(tools, staging, rawDirectory, rawFile, `recordings/${spec.filename}`);
  return { ...spec, evidenceClass: "SUPPLEMENTAL MACHINE RECORDING", observations, ...media };
}

async function walk(directory, root = directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = inside(root, path.join(directory, entry.name));
    if (entry.isDirectory()) results.push(...await walk(absolute, root));
    else if (entry.isFile()) results.push(path.relative(root, absolute).replaceAll("\\", "/"));
    else throw new Error("unsupported filesystem entry in R1 motion evidence");
  }
  return results.sort((left, right) => left.localeCompare(right));
}

function assertPrivacySafe(document) {
  assert(!PRIVATE_TEXT.test(JSON.stringify(document)), "motion report contains private path or secret-like text");
}

export function runSelfTest() {
  assert(RECORDING_SPECS.length === 5, "five R1 stories are required");
  assert(expectedArtifactPaths().length === 6, "R1 motion topology differs");
  assert(!expectedArtifactPaths().some((value) => value.endsWith(".webm")), "raw WebM must not be retained");
  return { schema: `${SCHEMA}.self-test`, status: "PASS", recordings: 5, artifacts: 6 };
}

export async function capturePhase6R1MotionEvidence(options) {
  validateOptions(options);
  await assertFreshDirectory(options.output);
  const staging = assertExternalDurablePath(stagingPathForOutput(options.output), "R1 motion staging");
  await assertFreshDirectory(staging);
  const rawRoot = inside(staging, path.join(staging, ".raw"));
  let published = false;
  try {
    const browserType = BROWSER_TYPES[options.engine];
    const executablePath = browserType.executablePath();
    assert(await exists(executablePath), `managed ${options.engine} browser is unavailable`);
    const tools = await resolveTools(options);
    await mkdir(staging, { recursive: false });
    await mkdir(rawRoot, { recursive: true });
    const browser = await browserType.launch({ executablePath, headless: !options.headed });
    const browserVersion = browser.version();
    const ledger = { blocked: [], console: [], pageErrors: [], requests: [] };
    const recordings = [];
    try {
      for (const spec of RECORDING_SPECS) recordings.push(await recordStory(browser, options, staging, rawRoot, tools, ledger, spec));
    } finally {
      await browser.close().catch(() => undefined);
    }
    await rm(rawRoot, { recursive: true, force: true });
    const diagnostics = evaluateDiagnostics(ledger);
    const report = {
      schema: SCHEMA,
      status: diagnostics.status,
      createdAt: new Date().toISOString(),
      evidenceClass: "SUPPLEMENTAL MACHINE EVIDENCE — NOT PHYSICAL DEVICE EVIDENCE",
      baseUrl: options.baseUrl,
      browser: { engine: options.engine, headed: options.headed, version: browserVersion },
      inputPolicy: "Playwright native wheel, pointer, viewport and link activation; no page scroll-position writes",
      encoder: { contract: ENCODER_CONTRACT, ffmpeg: tools.ffmpeg.version, ffprobe: tools.ffprobe.version, fullDecodeValidated: true },
      recordings,
      requests: ledger,
      diagnostics,
      summary: { recordings: recordings.length, expected: RECORDING_SPECS.length, failures: diagnostics.failures.length },
    };
    assertPrivacySafe(report);
    await writeFile(inside(staging, path.join(staging, REPORT_PATH)), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    const observed = await walk(staging);
    assert(JSON.stringify(observed) === JSON.stringify(expectedArtifactPaths()), `R1 motion topology differs: ${JSON.stringify(observed)}`);
    await rename(staging, options.output);
    published = true;
    return report;
  } finally {
    if (!published && await exists(staging)) await rm(staging, { recursive: true, force: true });
  }
}

function usage() {
  return [
    "Usage:",
    "  node scripts/capture-phase6-r1-motion-evidence.mjs --base-url <preview> --output <fresh-external-dir> --engine chromium|firefox [--headed] [--ffmpeg <path>] [--ffprobe <path>]",
    "  node scripts/capture-phase6-r1-motion-evidence.mjs --dry-run --base-url <preview> --output <fresh-external-dir> --engine chromium|firefox",
    "  node scripts/capture-phase6-r1-motion-evidence.mjs --self-test",
    "",
    "The five MP4 files are supplemental machine evidence and never satisfy physical-device requirements.",
  ].join("\n");
}

async function main() {
  const options = validateOptions(parseArguments(process.argv.slice(2)));
  if (options.help) return void process.stdout.write(`${usage()}\n`);
  if (options.selfTest) return void process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
  if (options.dryRun) {
    return void process.stdout.write(`${JSON.stringify({ schema: SCHEMA, status: "DRY-RUN", engine: options.engine, topology: expectedArtifactPaths() }, null, 2)}\n`);
  }
  const report = await capturePhase6R1MotionEvidence(options);
  process.stdout.write(`${JSON.stringify({ status: report.status, summary: report.summary }, null, 2)}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 6-R1 motion capture failed: ${error.message}`);
  process.exitCode = 1;
});
