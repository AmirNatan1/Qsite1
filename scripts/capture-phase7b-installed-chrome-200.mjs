#!/usr/bin/env node

/**
 * Phase 7B genuine installed-Chrome 200% evidence.
 *
 * This tool never launches Chrome, changes its zoom, resizes its viewport, or
 * applies device/CSS/transform emulation. It attaches to one already-visible
 * installed Google Chrome remote-debugging target whose exact `Zoom: 200%`
 * browser UI has independently been observed through Windows UI Automation.
 */

import { execFile } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  PHASE7B_BRANCH,
  PHASE7B_FROZEN_MAIN,
  PHASE7B_METHOD_STAGES,
  PHASE7B_PARENT,
} from "./phase7b-contract.mjs";
import {
  DEFAULT_FFMPEG_CANDIDATES,
  DEFAULT_FFPROBE_CANDIDATES,
} from "./capture-phase7a-r1-closure.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const INSTALLED_CHROME_SCHEMA = "quantum-hub.phase-7b.installed-chrome-native-200.v1";
export const ENGINE_LIMITATION_SCHEMA = "quantum-hub.phase-7b.native-200-engine-limitation.v1";
export const INSTALLED_REPORT_NAME = "installed-chrome-native-200.json";
export const INSTALLED_RECORDING_NAME = "installed-chrome-native-200.mp4";
export const INSTALLED_SCREENSHOT_NAME = "chrome-visible-zoom-200.png";
export const FIREFOX_LIMITATION_NAME = "firefox-native-200-limitation.json";

const execFileAsync = promisify(execFile);
const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const ZOOM_TOLERANCE = 0.06;
const MAX_UI_PROOF_AGE_MS = 24 * 60 * 60 * 1000;
const FRAME_RATE = 8;
const UI_SCHEMA_R1 = "quantum-hub.phase-7a-r1.installed-chrome-ui-evidence.v1";
const UI_SCHEMA_R2 = "quantum-hub.phase-7a-r2.computer-use-chrome-ui-proof.v1";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function portableJson(value) {
  const serialized = `${JSON.stringify(canonical(value), null, 2)}\n`;
  invariant(!/(?:[a-z]:\\Users\\|file:\/\/|\/(?:Users|home)\/)/i.test(serialized), "native-200 report exposes a private local path");
  return serialized;
}

function nextValue(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

function externalPath(value, extension, flag) {
  invariant(typeof value === "string" && value.length > 0, `${flag} is required`);
  const resolved = path.resolve(value);
  invariant(resolved !== path.parse(resolved).root && !within(ROOT, resolved) && !within(os.tmpdir(), resolved), `${flag} must remain in durable external storage`);
  invariant(path.extname(resolved).toLowerCase() === extension, `${flag} must name a ${extension} file`);
  return resolved;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "",
    baselineDpr: 0,
    baselineWidth: 0,
    cdpUrl: "http://127.0.0.1:9333",
    environmentalLimitation: "",
    ffmpeg: "",
    ffprobe: "",
    help: false,
    output: "",
    revision: "",
    selfTest: false,
    timeoutMs: 45_000,
    uiProofJson: "",
    uiProofPng: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => { const value = nextValue(argv, index, flag); index += 1; return value; };
    if (flag === "--base-url") options.baseUrl = next();
    else if (flag === "--baseline-dpr") options.baselineDpr = Number(next());
    else if (flag === "--baseline-width") options.baselineWidth = Number(next());
    else if (flag === "--cdp-url") options.cdpUrl = next();
    else if (flag === "--environmental-limitation") options.environmentalLimitation = next();
    else if (flag === "--ffmpeg") options.ffmpeg = next();
    else if (flag === "--ffprobe") options.ffprobe = next();
    else if (flag === "--output") options.output = next();
    else if (flag === "--revision") options.revision = next();
    else if (flag === "--timeout-ms") options.timeoutMs = Number(next());
    else if (flag === "--ui-proof-json") options.uiProofJson = next();
    else if (flag === "--ui-proof-png") options.uiProofPng = next();
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.help && !options.selfTest) {
    invariant(HASH_40.test(options.revision), "--revision must be an exact lowercase final Phase 7B SHA");
    invariant(options.revision !== PHASE7B_PARENT, "--revision must identify a new Phase 7B commit");
    invariant(typeof options.output === "string" && options.output.length > 0, "--output is required");
    options.output = path.resolve(options.output);
    invariant(options.output !== path.parse(options.output).root && !within(ROOT, options.output) && !within(os.tmpdir(), options.output), "--output must be a durable external directory");
    invariant(Number.isSafeInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms is invalid");
    if (!options.environmentalLimitation) {
      const base = new URL(options.baseUrl);
      invariant(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "--base-url must be credential-free HTTP(S)");
      base.hash = "";
      base.search = "";
      if (!base.pathname.endsWith("/")) base.pathname += "/";
      options.baseUrl = base.toString();
      const cdp = new URL(options.cdpUrl);
      invariant(cdp.protocol === "http:" && ["127.0.0.1", "localhost"].includes(cdp.hostname), "--cdp-url must be loopback HTTP");
      invariant(Number.isFinite(options.baselineWidth) && options.baselineWidth > 0, "--baseline-width must be the pre-zoom innerWidth");
      invariant(Number.isFinite(options.baselineDpr) && options.baselineDpr > 0, "--baseline-dpr must be the pre-zoom devicePixelRatio");
      options.uiProofJson = externalPath(options.uiProofJson, ".json", "--ui-proof-json");
      options.uiProofPng = externalPath(options.uiProofPng, ".png", "--ui-proof-png");
      invariant(options.uiProofJson !== options.uiProofPng, "UI proof inputs must be distinct");
    } else {
      invariant(options.environmentalLimitation.trim().length >= 20, "--environmental-limitation must explain the unavailable native UI authority");
    }
  }
  return options;
}

function pngAuthority(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  invariant(bytes.length > 33 && bytes.subarray(0, 8).equals(signature), "visible Chrome proof is not a PNG");
  invariant(bytes.subarray(12, 16).toString("ascii") === "IHDR", "visible Chrome PNG lacks IHDR");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  invariant(width > 0 && height > 0, "visible Chrome PNG dimensions are empty");
  return { format: "png", width, height, bytes: bytes.length, sha256: digest(bytes) };
}

function titleBinds(uiTitle, pageTitle) {
  const normalized = (value) => String(value ?? "").replace(/\s*[-—|]\s*Google Chrome\s*$/i, "").trim().toLowerCase();
  const left = normalized(uiTitle);
  const right = normalized(pageTitle);
  return left.length > 0 && right.length > 0 && (left.includes(right) || right.includes(left));
}

export function validateUiProof(document, png, pageTitle = "") {
  const image = pngAuthority(png);
  let browserTitle;
  let source;
  let capturedAt = null;
  if (document?.schema === UI_SCHEMA_R2) {
    invariant(document.status === "PASS" && document.producer === "Codex Computer Use", "Computer Use Chrome proof authority differs");
    invariant(document.browserWindow?.product === "Google Chrome" && document.browserWindow.visible === true && document.browserWindow.selectedWindowCount === 1, "Computer Use proof does not bind one visible Google Chrome window");
    invariant(document.accessibility?.matchCount === 1 && document.accessibility.text === "Zoom: 200%", "Computer Use accessibility tree does not expose exactly one Zoom: 200% match");
    invariant(document.screenshot?.format === "png" && document.screenshot.bytes === image.bytes && document.screenshot.sha256 === image.sha256 && document.screenshot.width === image.width && document.screenshot.height === image.height, "Computer Use proof does not bind the supplied PNG");
    const date = new Date(document.capturedAt);
    invariant(Number.isFinite(date.valueOf()) && date.toISOString() === document.capturedAt && Math.abs(Date.now() - date.valueOf()) <= MAX_UI_PROOF_AGE_MS, "Computer Use proof is stale or has an invalid timestamp");
    browserTitle = document.browserWindow.title;
    capturedAt = document.capturedAt;
    source = "Codex Computer Use accessibility tree";
  } else if (document?.schema === UI_SCHEMA_R1) {
    invariant(document.status === "PASS" && document.browserWindow?.product === "Google Chrome" && document.browserWindow.visible === true && document.browserWindow.remoteDebuggingProcessMatched === true, "Windows UI Automation Chrome proof authority differs");
    invariant(document.visibleZoomConfirmation === true && document.visibleZoomObservation?.method === "windows-ui-automation-accessibility-tree" && document.visibleZoomObservation.chromeMenuVisible === true && document.visibleZoomObservation.observedLabel === "200%" && document.visibleZoomObservation.zoomElementIsOffscreen === false, "Windows UI Automation does not expose visible 200% Chrome UI");
    invariant(Array.isArray(document.screenshots) && document.screenshots.length === 1, "Windows UI Automation screenshot inventory differs");
    const record = document.screenshots[0];
    invariant(record.format === "png" && record.bytes === image.bytes && record.sha256 === image.sha256 && record.width === image.width && record.height === image.height && record.entropy >= 1 && record.maximumChannelRange >= 80, "Windows UI Automation report does not bind a nonblank supplied PNG");
    browserTitle = document.browserWindow.title;
    source = "Windows UI Automation accessibility tree";
  } else throw new Error("unsupported installed-Chrome UI proof schema");
  invariant(typeof browserTitle === "string" && browserTitle.trim(), "visible Chrome proof title is missing");
  if (pageTitle) invariant(titleBinds(browserTitle, pageTitle), "visible Chrome UI proof title does not bind the attached CDP page");
  return { browserTitle, capturedAt, image, source, visibleZoomConfirmation: "Zoom: 200%" };
}

async function gitText(args) {
  const result = await execFileAsync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
  return String(result.stdout).trim();
}

async function repositoryAuthority(revision) {
  const [branch, head, statusText, upstream, upstreamHead, localMain, originMain, mergeBase, mergesText] = await Promise.all([
    gitText(["branch", "--show-current"]),
    gitText(["rev-parse", "HEAD"]),
    gitText(["status", "--porcelain=v1", "--untracked-files=all"]),
    gitText(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    gitText(["rev-parse", "@{upstream}"]),
    gitText(["rev-parse", "main"]),
    gitText(["rev-parse", "origin/main"]),
    gitText(["merge-base", PHASE7B_PARENT, revision]),
    gitText(["rev-list", "--merges", `${PHASE7B_PARENT}..${revision}`]),
  ]);
  invariant(branch === PHASE7B_BRANCH && head === revision, "native-200 repository branch or HEAD differs");
  invariant(!statusText, "native-200 capture requires a clean worktree including untracked files");
  invariant(upstream === `origin/${PHASE7B_BRANCH}` && upstreamHead === revision, "native-200 capture requires local/upstream parity");
  invariant(localMain === PHASE7B_FROZEN_MAIN && originMain === PHASE7B_FROZEN_MAIN, "main changed");
  invariant(mergeBase === PHASE7B_PARENT && !mergesText, "Phase 7B ancestry is not linear from the accepted parent");
  return { branch, head, requiredParent: PHASE7B_PARENT, upstream, upstreamHead, localMain, originMain, worktreeClean: true, zeroMergeCommits: true };
}

async function executableCommand(candidates, label) {
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["-version"], { encoding: "utf8", windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
      return candidate;
    } catch {
      // Continue through the bounded existing candidate list.
    }
  }
  throw new Error(`${label} is unavailable`);
}

async function resolveMediaTools(options) {
  const ffmpeg = await executableCommand(options.ffmpeg ? [options.ffmpeg] : DEFAULT_FFMPEG_CANDIDATES, "FFmpeg");
  const siblingProbe = path.join(path.dirname(path.resolve(ffmpeg)), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const ffprobe = await executableCommand(options.ffprobe ? [options.ffprobe] : [siblingProbe, ...DEFAULT_FFPROBE_CANDIDATES], "FFprobe");
  return { ffmpeg, ffprobe };
}

export function validateNativeZoomGeometry(baseline, observed) {
  invariant(baseline?.innerWidth > 0 && baseline.devicePixelRatio > 0 && observed?.innerWidth > 0 && observed.devicePixelRatio > 0, "native zoom geometry is incomplete");
  const widthRatio = baseline.innerWidth / observed.innerWidth;
  const dprRatio = observed.devicePixelRatio / baseline.devicePixelRatio;
  const checks = {
    widthRatio: Math.abs(widthRatio - 2) <= ZOOM_TOLERANCE,
    dprRatio: Math.abs(dprRatio - 2) <= ZOOM_TOLERANCE,
    visualViewportUnscaled: Math.abs(observed.visualViewportScale - 1) <= 0.001,
    noCssZoom: observed.rootCssZoom === "1" && observed.bodyCssZoom === "1",
    noTransformSubstitute: observed.rootTransform === "none" && observed.bodyTransform === "none",
  };
  invariant(Object.values(checks).every(Boolean), "observed geometry is not genuine installed-Chrome native 200% zoom");
  return { baseline, observed, widthRatio, dprRatio, checks, status: "PASS" };
}

async function wheelTo(page, targetY, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate((target) => ({
      scrollY,
      target: Math.max(0, Math.min(target, document.documentElement.scrollHeight - innerHeight)),
      height: innerHeight,
    }), targetY);
    if (Math.abs(state.target - state.scrollY) <= 3) return state.scrollY;
    const delta = Math.max(-state.height * 0.72, Math.min(state.height * 0.72, state.target - state.scrollY));
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(45);
  }
  throw new Error("native wheel delivery did not reach the requested Method position");
}

async function observedGeometry(page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return {
      innerWidth,
      innerHeight,
      outerWidth,
      outerHeight,
      devicePixelRatio,
      visualViewportScale: visualViewport?.scale ?? 1,
      rootCssZoom: root.zoom || "1",
      bodyCssZoom: body.zoom || "1",
      rootTransform: root.transform || "none",
      bodyTransform: body.transform || "none",
    };
  });
}

async function methodStageAuthority(page, stageName) {
  const selector = `[data-method-stage="${stageName.toLowerCase()}"]`;
  const absoluteTop = await page.evaluate((target) => {
    const stage = document.querySelector(target);
    if (!stage) return null;
    return scrollY + stage.getBoundingClientRect().top - Math.min(80, innerHeight * 0.12);
  }, selector);
  invariant(Number.isFinite(absoluteTop), `${stageName} stage is missing`);
  await wheelTo(page, absoluteTop, 45_000);
  await page.waitForTimeout(180);
  return page.evaluate(({ target, expected }) => {
    const stage = document.querySelector(target);
    const heading = stage?.querySelector("h3");
    const copy = stage?.querySelector("p");
    const staticVisual = stage?.querySelector("[data-method-static]");
    const bounds = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1
        && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    };
    const headingStyle = heading ? getComputedStyle(heading) : null;
    return {
      stage: expected,
      heading: heading?.textContent?.trim() ?? "",
      copy: copy?.textContent?.trim() ?? "",
      headingBounds: bounds(heading),
      copyBounds: bounds(copy),
      headingFullyVisible: visible(heading),
      copyFullyVisible: visible(copy),
      staticVisualVisible: visible(staticVisual),
      internalWordBreaking: headingStyle ? ["break-all", "break-word", "anywhere"].includes(headingStyle.wordBreak) : true,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  }, { target: selector, expected: stageName });
}

async function fieldMapAuthority(page) {
  await wheelTo(page, 0, 45_000);
  await page.locator("[data-field-map] > summary").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("[data-field-map]")?.hasAttribute("open"));
  const open = await page.evaluate(() => {
    const links = [...document.querySelectorAll("[data-field-map] nav a")].map((link) => {
      const rect = link.getBoundingClientRect();
      return {
        name: link.textContent?.replace(/\s+/g, " ").trim() ?? "",
        width: rect.width,
        height: rect.height,
        fullyVisible: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
      };
    });
    return {
      links,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      outsideFocusable: [...document.querySelectorAll("a[href], button, summary, [tabindex]")]
        .filter((element) => !element.closest("[data-field-map]") && !element.closest("[inert]") && element.getClientRects().length > 0).length,
    };
  });
  const focus = [];
  for (let index = 0; index < 9; index += 1) {
    focus.push(await page.evaluate(() => ({ tag: document.activeElement?.tagName.toLowerCase(), inMap: document.activeElement?.closest("[data-field-map]") !== null })));
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Escape");
  const closed = await page.evaluate(() => ({
    open: document.querySelector("[data-field-map]")?.hasAttribute("open") ?? false,
    focusReturned: document.activeElement?.matches("[data-field-map] > summary") ?? false,
    inertRegions: document.querySelectorAll("[data-field-map-background][inert]").length,
  }));
  const checks = {
    eightLinks: open.links.length === 8,
    linksFullyVisible: open.links.every(({ fullyVisible }) => fullyVisible),
    targetSizes: open.links.every(({ width, height }) => width >= 44 && height >= 44),
    noOutsideFocus: open.outsideFocusable === 0 && focus.every(({ inMap }) => inMap),
    noOverflow: !open.horizontalOverflow,
    escapeRestores: !closed.open && closed.focusReturned && closed.inertRegions === 0,
  };
  invariant(Object.values(checks).every(Boolean), "Field Map fails genuine 200% keyboard/geometry authority");
  return { open, focus, closed, checks, status: "PASS" };
}

async function captureFrames(page, directory, state) {
  let index = 0;
  while (!state.stopped) {
    index += 1;
    const filename = path.join(directory, `frame-${String(index).padStart(6, "0")}.png`);
    await page.screenshot({ path: filename, type: "png", animations: "disabled", caret: "hide" });
    await page.waitForTimeout(Math.round(1000 / FRAME_RATE));
  }
  return index;
}

async function encodeRecording(tools, frames, destination) {
  await execFileAsync(tools.ffmpeg, [
    "-v", "error", "-n", "-framerate", String(FRAME_RATE), "-i", path.join(frames, "frame-%06d.png"),
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", destination,
  ], { encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  await execFileAsync(tools.ffmpeg, ["-v", "error", "-i", destination, "-f", "null", "-"], { encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  const probeResult = await execFileAsync(tools.ffprobe, ["-v", "error", "-show_entries", "format=duration,format_name:stream=codec_type,codec_name,pix_fmt,width,height", "-of", "json", destination], { encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  const probe = JSON.parse(probeResult.stdout);
  const videos = probe.streams.filter(({ codec_type: type }) => type === "video");
  const audios = probe.streams.filter(({ codec_type: type }) => type === "audio");
  invariant(videos.length === 1 && audios.length === 0 && videos[0].codec_name === "h264" && videos[0].pix_fmt === "yuv420p", "native-200 recording media contract differs");
  const bytes = await readFile(destination);
  return {
    path: INSTALLED_RECORDING_NAME,
    bytes: bytes.length,
    sha256: digest(bytes),
    container: "mp4",
    codec: videos[0].codec_name,
    pixelFormat: videos[0].pix_fmt,
    width: videos[0].width,
    height: videos[0].height,
    durationSeconds: Number(probe.format.duration),
    audioStreams: 0,
    fullDecode: true,
  };
}

export function firefoxLimitation() {
  return {
    schema: ENGINE_LIMITATION_SCHEMA,
    status: "LIMITATION",
    engine: "firefox",
    classification: "NOT APPLICABLE",
    nativeZoomPercent: 200,
    recording: null,
    reason: "Recording 9 is specifically genuine installed-Google-Chrome browser-native 200% authority; a Firefox substitute would be false evidence.",
  };
}

export function validateInstalledReport(report) {
  invariant(report?.schema === INSTALLED_CHROME_SCHEMA && ["PASS", "LIMITATION"].includes(report.status), "installed-Chrome report schema/status differs");
  invariant(report.browser === "Google Chrome" && report.genuineInstalledChrome === true && report.nativeZoomPercent === 200, "installed-Chrome identity differs");
  if (report.status === "PASS") {
    invariant(report.visibleZoomConfirmation === "Zoom: 200%", "visible native zoom confirmation differs");
    invariant(report.recording?.path === INSTALLED_RECORDING_NAME && report.recording.bytes > 0 && HASH_64.test(report.recording.sha256 ?? "") && report.recording.fullDecode === true, "installed-Chrome recording authority differs");
    invariant(report.screenshot?.path === INSTALLED_SCREENSHOT_NAME && report.screenshot.bytes > 0 && HASH_64.test(report.screenshot.sha256 ?? ""), "installed-Chrome screenshot authority differs");
    invariant(report.method?.stages?.length === 5 && report.method.stages.every((stage, index) => stage.stage === PHASE7B_METHOD_STAGES[index] && stage.headingFullyVisible && stage.copyFullyVisible && !stage.internalWordBreaking && !stage.horizontalOverflow), "installed-Chrome METHOD authority differs");
    invariant(report.fieldMap?.status === "PASS" && Object.values(report.fieldMap.checks).every(Boolean), "installed-Chrome Field Map authority differs");
  } else {
    invariant(report.visibleZoomConfirmation === null && report.recording === null && report.screenshot === null && typeof report.environmentalLimitation === "string" && report.environmentalLimitation.length >= 20, "environmental limitation report overstates native evidence");
  }
  portableJson(report);
  return true;
}

async function freshExternalOutput(output) {
  invariant(!await stat(output).then(() => true).catch(() => false), "refusing to overwrite existing native-200 evidence");
  let ancestor = path.dirname(output);
  while (!await stat(ancestor).then(() => true).catch(() => false)) ancestor = path.dirname(ancestor);
  const realAncestor = await realpath(ancestor);
  invariant(!within(await realpath(ROOT), realAncestor) && !within(await realpath(os.tmpdir()), realAncestor), "native-200 output resolves inside forbidden storage");
  await mkdir(path.dirname(output), { recursive: true });
}

async function writeLimitation(options, staging) {
  const repository = await repositoryAuthority(options.revision);
  const report = {
    schema: INSTALLED_CHROME_SCHEMA,
    status: "LIMITATION",
    browser: "Google Chrome",
    genuineInstalledChrome: true,
    nativeZoomPercent: 200,
    visibleZoomConfirmation: null,
    recording: null,
    screenshot: null,
    branch: PHASE7B_BRANCH,
    revision: options.revision,
    repository,
    environmentalLimitation: options.environmentalLimitation,
    humanGate: "PENDING HUMAN REVIEW",
  };
  validateInstalledReport(report);
  await writeFile(path.join(staging, INSTALLED_REPORT_NAME), portableJson(report), { encoding: "utf8", flag: "wx" });
  await writeFile(path.join(staging, FIREFOX_LIMITATION_NAME), portableJson(firefoxLimitation()), { encoding: "utf8", flag: "wx" });
  return report;
}

async function capture(options, staging) {
  const repository = await repositoryAuthority(options.revision);
  const tools = await resolveMediaTools(options);
  const [uiDocumentBytes, uiPng] = await Promise.all([readFile(options.uiProofJson), readFile(options.uiProofPng)]);
  let uiDocument;
  try { uiDocument = JSON.parse(uiDocumentBytes.toString("utf8")); } catch { throw new Error("installed-Chrome UI proof JSON is invalid"); }
  const preliminaryUi = validateUiProof(uiDocument, uiPng);
  const { chromium } = await import("playwright-core");
  const browser = await chromium.connectOverCDP(options.cdpUrl, { timeout: options.timeoutMs });
  try {
    const pages = browser.contexts().flatMap((context) => context.pages()).filter((page) => !page.url().startsWith("chrome://"));
    invariant(pages.length === 1, "native-200 capture requires exactly one non-Chrome CDP page in the visible browser");
    const page = pages[0];
    page.setDefaultTimeout(options.timeoutMs);
    await page.bringToFront();
    await page.keyboard.press("Escape");
    const response = await page.goto(new URL("/#entry", options.baseUrl).toString(), { waitUntil: "load", timeout: options.timeoutMs });
    invariant(response?.status() === 200, "native-200 page did not load successfully");
    await page.waitForSelector("[data-operating-field]");
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
    await page.waitForTimeout(150);
    const pageTitle = await page.title();
    const ui = validateUiProof(uiDocument, uiPng, pageTitle);
    invariant(ui.image.sha256 === preliminaryUi.image.sha256, "UI proof changed during capture");
    const geometry = validateNativeZoomGeometry(
      { innerWidth: options.baselineWidth, devicePixelRatio: options.baselineDpr },
      await observedGeometry(page),
    );
    const frames = path.join(staging, ".frames");
    await mkdir(frames, { recursive: false });
    const frameState = { stopped: false };
    const frameCapture = captureFrames(page, frames, frameState);
    let fieldMap;
    const stages = [];
    try {
      fieldMap = await fieldMapAuthority(page);
      for (const stage of PHASE7B_METHOD_STAGES) {
        const authority = await methodStageAuthority(page, stage);
        invariant(authority.heading === stage && authority.copy.length > 0 && authority.headingFullyVisible && authority.copyFullyVisible && authority.staticVisualVisible && !authority.internalWordBreaking && !authority.horizontalOverflow, `${stage} fails genuine 200% METHOD geometry`);
        stages.push(authority);
        await page.waitForTimeout(450);
      }
    } finally {
      frameState.stopped = true;
    }
    const frameCount = await frameCapture;
    invariant(frameCount >= 20, "native-200 recording has too few visual frames");
    const recording = await encodeRecording(tools, frames, path.join(staging, INSTALLED_RECORDING_NAME));
    await rm(frames, { recursive: true, force: true });
    await copyFile(options.uiProofPng, path.join(staging, INSTALLED_SCREENSHOT_NAME));
    const screenshot = { path: INSTALLED_SCREENSHOT_NAME, ...ui.image };
    const session = await page.context().newCDPSession(page);
    const product = await session.send("Browser.getVersion");
    await session.detach();
    invariant(/Chrome\//.test(product.product), "attached CDP browser is not installed Google Chrome");
    const report = {
      schema: INSTALLED_CHROME_SCHEMA,
      status: "PASS",
      browser: "Google Chrome",
      genuineInstalledChrome: true,
      nativeZoomPercent: 200,
      visibleZoomConfirmation: "Zoom: 200%",
      branch: PHASE7B_BRANCH,
      revision: options.revision,
      repository,
      browserVersion: product.product,
      targetTitle: pageTitle,
      uiProof: { source: ui.source, browserTitle: ui.browserTitle, capturedAt: ui.capturedAt, inputSha256: digest(uiDocumentBytes) },
      zoomGeometry: geometry,
      method: { stateCount: stages.length, stages },
      fieldMap,
      recording,
      screenshot,
      environmentalLimitation: null,
      humanGate: "PENDING HUMAN REVIEW",
      limitations: ["The page-state recording is captured from the already-zoomed attached Chrome target; the separate bound PNG supplies visible browser-chrome Zoom: 200% UI authority."],
    };
    validateInstalledReport(report);
    await writeFile(path.join(staging, INSTALLED_REPORT_NAME), portableJson(report), { encoding: "utf8", flag: "wx" });
    await writeFile(path.join(staging, FIREFOX_LIMITATION_NAME), portableJson(firefoxLimitation()), { encoding: "utf8", flag: "wx" });
    return report;
  } finally {
    await browser.close();
  }
}

export function selfTest() {
  const revision = "a".repeat(40);
  const parsed = parseArguments(["--revision", revision, "--output", path.resolve(ROOT, "..", "phase7b-native-200"), "--environmental-limitation", "Visible installed-Chrome UI Automation is unavailable in this execution environment."]);
  invariant(parsed.environmentalLimitation.length >= 20, "limitation parser differs");
  invariant(PHASE7B_METHOD_STAGES.length === 5, "METHOD stage authority differs");
  const firefox = firefoxLimitation();
  invariant(firefox.status === "LIMITATION" && firefox.recording === null, "Firefox limitation differs");
  return { schema: INSTALLED_CHROME_SCHEMA, status: "PASS", passPayloads: 4, methodStages: 5, firefoxNative200: "NOT APPLICABLE", zoomSubstitution: "PROHIBITED" };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage:\n  node scripts/capture-phase7b-installed-chrome-200.mjs --base-url <preview> --revision <final-head> --output <fresh-external-dir> --baseline-width <100%-innerWidth> --baseline-dpr <100%-DPR> --ui-proof-json <external UIA proof> --ui-proof-png <external visible Chrome PNG> [--cdp-url http://127.0.0.1:9333] [--ffmpeg <command>] [--ffprobe <command>]\n  node scripts/capture-phase7b-installed-chrome-200.mjs --revision <final-head> --output <fresh-external-dir> --environmental-limitation <honest reason>\nNo viewport resizing, CSS zoom, transforms, device emulation, browser launch, or synthetic native-zoom claim is performed.\n");
    return;
  }
  if (options.selfTest) { process.stdout.write(portableJson(selfTest())); return; }
  await freshExternalOutput(options.output);
  const staging = `${options.output}.staging-${randomUUID()}`;
  await mkdir(staging, { recursive: false });
  let published = false;
  try {
    const report = options.environmentalLimitation ? await writeLimitation(options, staging) : await capture(options, staging);
    await rename(staging, options.output);
    published = true;
    process.stdout.write(portableJson({ status: report.status, output: options.output, recording: report.recording?.path ?? null, screenshot: report.screenshot?.path ?? null }));
  } finally {
    if (!published) await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`Phase 7B installed-Chrome native-200 evidence FAIL: ${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
