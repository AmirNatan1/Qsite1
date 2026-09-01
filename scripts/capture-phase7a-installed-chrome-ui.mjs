#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WINDOWS_CAPTURE_SCRIPT = path.join(ROOT, "scripts", "capture-installed-chrome-window.ps1");
const REPORT_NAME = "installed-chrome-ui-report.json";
const SCREENSHOT_NAME = "chrome-visible-200-percent.png";
const HASH_64 = /^[a-f0-9]{64}$/;

export const INSTALLED_CHROME_UI_SCHEMA = "quantum-hub.phase-7a-r1.installed-chrome-ui-evidence.v1";

function invariant(value, message) { if (!value) throw new Error(message); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
function safeScreenshotPath(value) {
  invariant(value === SCREENSHOT_NAME && path.posix.basename(value) === value && !value.includes("\\"), "installed-Chrome UI screenshot path differs");
  return value;
}

export function validateWindowsUiAutomationObservation(observation) {
  invariant(observation?.product === "Google Chrome" && observation.processName === "chrome.exe", "installed-Chrome UI process identity differs");
  invariant(Number.isSafeInteger(observation.processId) && observation.processId > 0 && Number.isSafeInteger(observation.windowHandle) && observation.windowHandle > 0, "installed-Chrome UI process/window authority is missing");
  invariant(observation.visible === true && observation.remoteDebuggingProcessMatched === true, "installed-Chrome UI visible remote-debugging process did not match");
  invariant(typeof observation.title === "string" && observation.title.trim().length > 0, "installed-Chrome UI visible window title is missing");
  invariant(observation.chromeMenuVisible === true && observation.zoomLabel === "Zoom: 200%", "installed-Chrome UI Automation tree does not expose Zoom: 200%");
  invariant(observation.zoomElementIsOffscreen === false, "installed-Chrome Zoom: 200% UI Automation element is offscreen");
  const bounds = observation.zoomElementBounds;
  invariant(bounds && ["left", "top", "right", "bottom", "width", "height"].every((key) => Number.isFinite(bounds[key])), "installed-Chrome Zoom: 200% UI Automation bounds are missing");
  invariant(bounds.width > 0 && bounds.height > 0 && Math.abs(bounds.width - (bounds.right - bounds.left)) < 0.05 && Math.abs(bounds.height - (bounds.bottom - bounds.top)) < 0.05, "installed-Chrome Zoom: 200% UI Automation bounds are empty or inconsistent");
  return true;
}

export function validateInstalledChromeUiEvidence(report, observedScreenshots = []) {
  invariant(report?.schema === INSTALLED_CHROME_UI_SCHEMA && report.status === "PASS", "installed-Chrome UI evidence schema/status differs");
  const window = report.browserWindow;
  invariant(window?.product === "Google Chrome" && window.processName === "chrome.exe", "installed-Chrome UI browser identity differs");
  invariant(window.visible === true && window.remoteDebuggingProcessMatched === true && typeof window.title === "string" && window.title.trim().length > 0, "installed-Chrome UI browser-window authority differs");
  invariant(report.visibleZoomConfirmation === true, "installed-Chrome visible 200% confirmation is missing");
  const observation = report.visibleZoomObservation;
  invariant(observation?.method === "windows-ui-automation-accessibility-tree", "installed-Chrome visible zoom observation method differs");
  invariant(observation.chromeMenuVisible === true && observation.observedLabel === "200%", "installed-Chrome visible 200% UI authority differs");
  invariant(observation.zoomElementIsOffscreen === false, "installed-Chrome visible 200% report marks its UI element offscreen");
  const zoomBounds = observation.zoomElementBounds;
  invariant(zoomBounds && ["left", "top", "right", "bottom", "width", "height"].every((key) => Number.isFinite(zoomBounds[key]))
    && zoomBounds.width > 0 && zoomBounds.height > 0
    && Math.abs(zoomBounds.width - (zoomBounds.right - zoomBounds.left)) < 0.05
    && Math.abs(zoomBounds.height - (zoomBounds.bottom - zoomBounds.top)) < 0.05,
  "installed-Chrome visible 200% report has empty UI Automation bounds");
  const observationScreenshot = safeScreenshotPath(observation.screenshot);

  invariant(Array.isArray(report.screenshots) && report.screenshots.length === 1, "installed-Chrome UI evidence requires exactly one screenshot record");
  invariant(Array.isArray(observedScreenshots) && observedScreenshots.length === 1, "installed-Chrome UI decoded screenshot inventory differs");
  const screenshot = report.screenshots[0];
  const observed = observedScreenshots[0];
  invariant(safeScreenshotPath(screenshot?.relativePath) === observationScreenshot, "installed-Chrome visible zoom observation is not bound to its screenshot");
  invariant(screenshot.format === "png"
    && Number.isSafeInteger(screenshot.width) && screenshot.width > 0
    && Number.isSafeInteger(screenshot.height) && screenshot.height > 0
    && Number.isSafeInteger(screenshot.bytes) && screenshot.bytes > 0
    && HASH_64.test(screenshot.sha256 ?? "")
    && Number.isFinite(screenshot.entropy) && screenshot.entropy >= 1
    && Number.isFinite(screenshot.maximumChannelRange) && screenshot.maximumChannelRange >= 80,
  "installed-Chrome visible zoom screenshot is blank or malformed");
  invariant(JSON.stringify(screenshot) === JSON.stringify(observed), "installed-Chrome visible zoom screenshot bytes/decode binding differs");
  return true;
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = { help: false, output: "", remoteDebuggingPort: 9333, selfTest: false, timeoutMs: 45_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => { const value = valueAfter(argv, index, flag); index += 1; return value; };
    if (flag === "--output") options.output = next();
    else if (flag === "--remote-debugging-port") options.remoteDebuggingPort = Number(next());
    else if (flag === "--timeout-ms") options.timeoutMs = Number(next());
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.help && !options.selfTest) {
    invariant(typeof options.output === "string" && options.output.length > 0, "--output is required");
    options.output = path.resolve(options.output);
    invariant(options.output !== path.parse(options.output).root && !within(ROOT, options.output) && !within(os.tmpdir(), options.output), "--output must be a durable external directory");
    invariant(Number.isSafeInteger(options.remoteDebuggingPort) && options.remoteDebuggingPort > 0 && options.remoteDebuggingPort <= 65_535, "--remote-debugging-port is invalid");
    invariant(Number.isSafeInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms is invalid");
  }
  return options;
}

async function doesExist(candidate) {
  try { await lstat(candidate); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function analyzePng(filename) {
  const bytes = await readFile(filename);
  const [metadata, statistics] = await Promise.all([sharp(bytes).metadata(), sharp(bytes).stats()]);
  return {
    relativePath: SCREENSHOT_NAME,
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    bytes: bytes.length,
    sha256: digest(bytes),
    entropy: statistics.entropy,
    maximumChannelRange: Math.max(...statistics.channels.slice(0, 3).map(({ min, max }) => max - min)),
  };
}

export function selfTest() {
  const parsed = parseArguments(["--output", path.resolve(ROOT, "..", "installed-chrome-ui"), "--remote-debugging-port", "9333"]);
  invariant(parsed.remoteDebuggingPort === 9333, "installed-Chrome UI port parsing differs");
  return { schema: INSTALLED_CHROME_UI_SCHEMA, status: "PASS", screenshots: 1, method: "windows-ui-automation-accessibility-tree" };
}

async function capture(options) {
  invariant(process.platform === "win32", "installed-Chrome UI evidence capture requires Windows");
  invariant(!(await doesExist(options.output)), `refusing to overwrite existing installed-Chrome UI evidence: ${options.output}`);
  await mkdir(path.dirname(options.output), { recursive: true });
  const realParent = await realpath(path.dirname(options.output));
  invariant(!within(await realpath(ROOT), realParent) && !within(await realpath(os.tmpdir()), realParent), "installed-Chrome UI output parent resolves inside a forbidden directory");
  const staging = `${options.output}.staging-${randomUUID()}`;
  invariant(!within(ROOT, staging) && !within(os.tmpdir(), staging) && !(await doesExist(staging)), "installed-Chrome UI staging path differs");
  await mkdir(staging, { recursive: false });
  let published = false;
  try {
    const screenshotPath = path.join(staging, SCREENSHOT_NAME);
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-File", WINDOWS_CAPTURE_SCRIPT,
        "-OutputPath", screenshotPath,
        "-RemoteDebuggingPort", String(options.remoteDebuggingPort),
        "-RefreshZoomBubble",
        "-EmitJson",
      ],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: options.timeoutMs, windowsHide: true },
    );
    let uiObservation;
    try { uiObservation = JSON.parse(String(stdout).trim()); } catch { throw new Error("installed-Chrome UI helper did not return parseable UI Automation authority"); }
    validateWindowsUiAutomationObservation(uiObservation);
    const screenshot = await analyzePng(screenshotPath);
    const report = {
      schema: INSTALLED_CHROME_UI_SCHEMA,
      status: "PASS",
      browserWindow: {
        product: uiObservation.product,
        processName: uiObservation.processName,
        visible: uiObservation.visible,
        remoteDebuggingProcessMatched: uiObservation.remoteDebuggingProcessMatched,
        title: uiObservation.title,
      },
      visibleZoomConfirmation: true,
      visibleZoomObservation: {
        method: "windows-ui-automation-accessibility-tree",
        chromeMenuVisible: uiObservation.chromeMenuVisible,
        observedLabel: "200%",
        zoomElementIsOffscreen: uiObservation.zoomElementIsOffscreen,
        zoomElementBounds: uiObservation.zoomElementBounds,
        screenshot: SCREENSHOT_NAME,
      },
      screenshots: [screenshot],
    };
    validateInstalledChromeUiEvidence(report, [screenshot]);
    await writeFile(path.join(staging, REPORT_NAME), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(staging, options.output);
    published = true;
    return report;
  } finally {
    if (!published) await rm(staging, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/capture-phase7a-installed-chrome-ui.mjs --output <fresh-external-dir> [--remote-debugging-port 9333] [--timeout-ms 45000]\n");
    return;
  }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`); return; }
  const report = await capture(options);
  process.stdout.write(`${JSON.stringify({ status: report.status, output: options.output, browserWindow: report.browserWindow, visibleZoomObservation: report.visibleZoomObservation }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`Phase 7A installed-Chrome UI evidence FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
}
