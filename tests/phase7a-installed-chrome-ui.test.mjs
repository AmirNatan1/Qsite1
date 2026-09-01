import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  INSTALLED_CHROME_UI_SCHEMA,
  parseArguments,
  selfTest,
  validateInstalledChromeUiEvidence,
  validateWindowsUiAutomationObservation,
} from "../scripts/capture-phase7a-installed-chrome-ui.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function screenshot() {
  return {
    relativePath: "chrome-visible-200-percent.png",
    format: "png",
    width: 1600,
    height: 1000,
    bytes: 250_000,
    sha256: "a".repeat(64),
    entropy: 4.5,
    maximumChannelRange: 255,
  };
}

function report() {
  const image = screenshot();
  return {
    schema: INSTALLED_CHROME_UI_SCHEMA,
    status: "PASS",
    browserWindow: { product: "Google Chrome", processName: "chrome.exe", visible: true, remoteDebuggingProcessMatched: true, title: "Qsite1 - Google Chrome" },
    visibleZoomConfirmation: true,
    visibleZoomObservation: {
      method: "windows-ui-automation-accessibility-tree",
      chromeMenuVisible: true,
      observedLabel: "200%",
      zoomElementIsOffscreen: false,
      zoomElementBounds: { left: 1000, top: 80, right: 1420, bottom: 180, width: 420, height: 100 },
      screenshot: image.relativePath,
    },
    screenshots: [image],
  };
}

test("installed-Chrome visible zoom producer has a strict external CLI", () => {
  assert.deepEqual(selfTest(), { schema: INSTALLED_CHROME_UI_SCHEMA, status: "PASS", screenshots: 1, method: "windows-ui-automation-accessibility-tree" });
  const parsed = parseArguments(["--output", path.resolve(ROOT, "..", "chrome-ui-proof"), "--remote-debugging-port", "9333", "--timeout-ms", "60000"]);
  assert.equal(parsed.remoteDebuggingPort, 9333);
  assert.throws(() => parseArguments(["--output", path.join(ROOT, "chrome-ui-proof")]), /external/);
  assert.throws(() => parseArguments(["--output", path.resolve(ROOT, "..", "chrome-ui-proof"), "--remote-debugging-port", "0"]), /invalid/);
  assert.throws(() => parseArguments([]), /--output/);
});

test("installed-Chrome UI Automation observation fails closed on process and visible-label mismatch", () => {
  const valid = {
    product: "Google Chrome",
    processName: "chrome.exe",
    processId: 1234,
    windowHandle: 5678,
    visible: true,
    remoteDebuggingProcessMatched: true,
    title: "Qsite1 - Google Chrome",
    chromeMenuVisible: true,
    zoomLabel: "Zoom: 200%",
    zoomElementIsOffscreen: false,
    zoomElementBounds: { left: 1000, top: 80, right: 1420, bottom: 180, width: 420, height: 100 },
  };
  assert.equal(validateWindowsUiAutomationObservation(valid), true);
  assert.throws(() => validateWindowsUiAutomationObservation({ ...valid, processName: "msedge.exe" }), /process identity/);
  assert.throws(() => validateWindowsUiAutomationObservation({ ...valid, remoteDebuggingProcessMatched: false }), /did not match/);
  assert.throws(() => validateWindowsUiAutomationObservation({ ...valid, chromeMenuVisible: false }), /does not expose/);
  assert.throws(() => validateWindowsUiAutomationObservation({ ...valid, zoomLabel: "Zoom: 175%" }), /does not expose/);
  assert.throws(() => validateWindowsUiAutomationObservation({ ...valid, zoomElementIsOffscreen: true }), /offscreen/);
  assert.throws(() => validateWindowsUiAutomationObservation({ ...valid, zoomElementBounds: { left: 10, top: 10, right: 10, bottom: 10, width: 0, height: 0 } }), /empty or inconsistent/);
});

test("installed-Chrome visible 200 percent report is bound to one decoded nonblank PNG", () => {
  const valid = report();
  assert.equal(validateInstalledChromeUiEvidence(valid, structuredClone(valid.screenshots)), true);

  const claimOnly = structuredClone(valid);
  claimOnly.visibleZoomConfirmation = false;
  assert.throws(() => validateInstalledChromeUiEvidence(claimOnly, structuredClone(valid.screenshots)), /confirmation is missing/);

  const wrongMethod = structuredClone(valid);
  wrongMethod.visibleZoomObservation.method = "human-visual-review";
  assert.throws(() => validateInstalledChromeUiEvidence(wrongMethod, structuredClone(valid.screenshots)), /method differs/);

  const offscreen = structuredClone(valid);
  offscreen.visibleZoomObservation.zoomElementIsOffscreen = true;
  assert.throws(() => validateInstalledChromeUiEvidence(offscreen, structuredClone(valid.screenshots)), /offscreen/);

  const emptyBounds = structuredClone(valid);
  emptyBounds.visibleZoomObservation.zoomElementBounds.width = 0;
  emptyBounds.visibleZoomObservation.zoomElementBounds.right = emptyBounds.visibleZoomObservation.zoomElementBounds.left;
  assert.throws(() => validateInstalledChromeUiEvidence(emptyBounds, structuredClone(valid.screenshots)), /empty UI Automation bounds/);

  const blank = structuredClone(valid);
  blank.screenshots[0].entropy = 0;
  assert.throws(() => validateInstalledChromeUiEvidence(blank, structuredClone(blank.screenshots)), /blank or malformed/);

  const rebound = structuredClone(valid);
  const observed = structuredClone(valid.screenshots);
  rebound.screenshots[0].sha256 = "b".repeat(64);
  assert.throws(() => validateInstalledChromeUiEvidence(rebound, observed), /bytes\/decode binding differs/);

  const traversal = structuredClone(valid);
  traversal.visibleZoomObservation.screenshot = "../chrome.png";
  assert.throws(() => validateInstalledChromeUiEvidence(traversal, structuredClone(valid.screenshots)), /path differs/);
});

test("Windows helper requires a matched chrome.exe process and exact visible Zoom: 200% UIA node", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "capture-installed-chrome-window.ps1"), "utf8");
  assert.match(source, /Name -eq "chrome\.exe"/);
  assert.match(source, /remote-debugging port/);
  assert.match(source, /AutomationElement\]::NameProperty/);
  assert.match(source, /Current\.IsOffscreen/);
  assert.match(source, /Current\.BoundingRectangle/);
  assert.match(source, /"Zoom: 200%"/);
  assert.match(source, /does not expose an onscreen, non-empty Zoom: 200%/);
  assert.match(source, /Refusing to overwrite/);
});
