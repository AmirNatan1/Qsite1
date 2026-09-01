#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_NAME = "installed-chrome-r2-field-map-report.json";
const MANIFEST_NAME = "manifest.json";
const HASH_40 = /^[a-f0-9]{40}$/;
const HASH_64 = /^[a-f0-9]{64}$/;
const TIMEOUT_MS = 45_000;
const MINIMUM_TARGET_CSS_PIXELS = 44;
const ZOOM_RATIO_TOLERANCE = 0.04;
const VISUAL_VIEWPORT_SCALE_TOLERANCE = 0.001;
const MAX_COMPUTER_USE_PROOF_AGE_MS = 24 * 60 * 60 * 1000;
const OUTSIDE_CONTROL_ID = "phase7a-r2-installed-chrome-outside-test-control";

export const PHASE7A_R2_INSTALLED_CHROME_SCHEMA = "quantum-hub.phase-7a-r2.installed-chrome-field-map.v1";
export const PHASE7A_R2_INSTALLED_CHROME_MANIFEST_SCHEMA = "quantum-hub.phase-7a-r2.installed-chrome-field-map.manifest.v1";
export const PHASE7A_R2_COMPUTER_USE_UI_PROOF_SCHEMA = "quantum-hub.phase-7a-r2.computer-use-chrome-ui-proof.v1";
export const PHASE7A_R2_BRANCH = "repair/phase-7a-r2-field-map-focus-semantics";
export const PHASE7A_R2_PARENT = "016fef45323432f25b3eea849512a707174fe6c5";
export const FIELD_MAP_SUMMARY_AX_NAME = "FIELD MAP";

export const FIELD_MAP_DESTINATIONS = Object.freeze([
  Object.freeze({ href: "/#entry", accessibleName: "00 Home 00 / origin", focusName: "Home" }),
  Object.freeze({ href: "/for-partners/", accessibleName: "01 For industry 01 / need", focusName: "For industry" }),
  Object.freeze({ href: "/for-startups/", accessibleName: "02 For startups 02 / capability", focusName: "For startups" }),
  Object.freeze({ href: "/industries/", accessibleName: "03 Industries 03 / context", focusName: "Industries" }),
  Object.freeze({ href: "/pocs/", accessibleName: "04 Proof 04 / evidence", focusName: "Proof" }),
  Object.freeze({ href: "/spark/", accessibleName: "05 SPARK 05 / programme", focusName: "SPARK" }),
  Object.freeze({ href: "/about/", accessibleName: "06 About 06 / position", focusName: "About" }),
  Object.freeze({ href: "/contact/", accessibleName: "07 Contact 07 / signal", focusName: "Contact" }),
]);

const PAGE_VISUALS = Object.freeze([
  Object.freeze({ label: "closed", relativePath: "screenshots/closed.png" }),
  Object.freeze({ label: "open", relativePath: "screenshots/open.png" }),
  Object.freeze({ label: "focus", relativePath: "screenshots/focus.png" }),
  Object.freeze({ label: "escape", relativePath: "screenshots/escape.png" }),
]);
const COMPUTER_USE_VISUAL = Object.freeze({
  label: "chrome-visible-200-percent",
  relativePath: "screenshots/chrome-visible-200-percent.png",
});
const ALL_VISUALS = Object.freeze([...PAGE_VISUALS, COMPUTER_USE_VISUAL]);

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function round(value, places = 4) {
  return Number(Number(value).toFixed(places));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
    return result;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value), null, 2) + "\n";
}

function portableText(value) {
  return String(value).replaceAll("\\", "/").toLowerCase();
}

function privacyCheckedReportJson(report, forbiddenPaths = []) {
  const serialized = canonicalJson(report);
  const portable = portableText(serialized);
  for (const forbidden of forbiddenPaths.filter(Boolean)) {
    invariant(!portable.includes(portableText(path.resolve(forbidden))), "installed-Chrome report exposes a private source path");
  }
  invariant(!/(?:^|["'\s])(?:[a-z]:\/+|file:\/{2,}|\/(?:users|home)\/)/im.test(portable), "installed-Chrome report exposes an absolute private path");
  return serialized;
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), label + " must be an object");
  const actual = Object.keys(value).sort();
  const authority = [...expected].sort();
  invariant(JSON.stringify(actual) === JSON.stringify(authority), label + " field inventory differs");
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), flag + " requires a value");
  return value;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "",
    baselineDpr: 0,
    baselineWidth: 0,
    help: false,
    output: "",
    remoteDebuggingPort: 9333,
    revision: "",
    selfTest: false,
    uiProofJson: "",
    uiProofPng: "",
    uiZoomLabel: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = valueAfter(argv, index, flag);
      index += 1;
      return value;
    };
    if (flag === "--base-url") options.baseUrl = next();
    else if (flag === "--baseline-dpr") options.baselineDpr = Number(next());
    else if (flag === "--baseline-width") options.baselineWidth = Number(next());
    else if (flag === "--output") options.output = next();
    else if (flag === "--remote-debugging-port") options.remoteDebuggingPort = Number(next());
    else if (flag === "--revision") options.revision = next();
    else if (flag === "--ui-zoom-label") options.uiZoomLabel = next();
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--ui-proof-json") options.uiProofJson = next();
    else if (flag === "--ui-proof-png") options.uiProofPng = next();
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error("unknown argument: " + flag);
  }
  if (!options.help && !options.selfTest) {
    const base = new URL(options.baseUrl);
    invariant(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "--base-url must be credential-free HTTP(S)");
    base.hash = "";
    base.search = "";
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    options.baseUrl = base.toString();
    invariant(HASH_40.test(options.revision), "--revision must be an exact lowercase 40-character Git SHA");
    invariant(options.revision !== PHASE7A_R2_PARENT, "--revision must be a new R2 commit, not the exact R1 parent");
    invariant(Number.isSafeInteger(options.remoteDebuggingPort) && options.remoteDebuggingPort > 0 && options.remoteDebuggingPort <= 65_535, "--remote-debugging-port is invalid");
    invariant(Number.isFinite(options.baselineWidth) && options.baselineWidth > 0, "--baseline-width must be positive");
    invariant(Number.isFinite(options.baselineDpr) && options.baselineDpr > 0, "--baseline-dpr must be positive");
    invariant(options.uiZoomLabel === "Zoom: 200%", "--ui-zoom-label must be the observed installed-Chrome label Zoom: 200%");
    invariant(typeof options.output === "string" && options.output.length > 0, "--output is required");
    options.output = path.resolve(options.output);
    invariant(options.output !== path.parse(options.output).root, "--output cannot be a filesystem root");
    invariant(!within(ROOT, options.output), "--output must remain outside the repository");
    invariant(!within(os.tmpdir(), options.output), "--output must remain outside OS temporary storage");
    for (const [flag, key, extension] of [["--ui-proof-json", "uiProofJson", ".json"], ["--ui-proof-png", "uiProofPng", ".png"]]) {
      invariant(typeof options[key] === "string" && options[key].length > 0, flag + " is required");
      options[key] = path.resolve(options[key]);
      invariant(options[key] !== path.parse(options[key]).root, flag + " cannot be a filesystem root");
      invariant(path.extname(options[key]).toLowerCase() === extension, flag + " must identify an external " + extension.slice(1).toUpperCase() + " file");
      invariant(!within(ROOT, options[key]), flag + " must remain outside the repository");
      invariant(!within(os.tmpdir(), options[key]), flag + " must remain outside OS temporary storage");
    }
    invariant(options.uiProofJson !== options.uiProofPng, "Computer Use proof JSON and PNG inputs must be distinct");
  }
  return options;
}

async function doesExist(candidate) {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function nearestExistingDirectory(candidate) {
  let cursor = path.resolve(candidate);
  for (;;) {
    try {
      const entry = await lstat(cursor);
      invariant(entry.isDirectory() || entry.isSymbolicLink(), "installed-Chrome R2 output ancestor is not a directory");
      return cursor;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(cursor);
    invariant(parent !== cursor, "installed-Chrome R2 output has no existing directory ancestor");
    cursor = parent;
  }
}

async function git(...args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return String(stdout).trim();
}

export function validateRepositoryAuthority(authority, revision) {
  invariant(HASH_40.test(revision ?? ""), "repository expected revision is invalid");
  invariant(authority?.branch === PHASE7A_R2_BRANCH, "repository branch differs from exact R2 authority");
  invariant(authority.head === revision, "repository HEAD differs from --revision");
  invariant(authority.exactParent === PHASE7A_R2_PARENT, "repository exact R1 parent differs");
  invariant(authority.mergeBase === PHASE7A_R2_PARENT, "repository merge base differs from exact R1 parent");
  invariant(authority.firstCommitParent === PHASE7A_R2_PARENT, "first R2 commit is not directly based on the exact R1 parent");
  invariant(Array.isArray(authority.commits) && authority.commits.length > 0, "repository R2 commit list is empty");
  invariant(authority.commits.every((sha) => HASH_40.test(sha)), "repository R2 commit inventory contains an invalid SHA");
  invariant(new Set(authority.commits).size === authority.commits.length, "repository R2 commit inventory is duplicated");
  invariant(authority.commits.at(-1) === revision, "repository R2 commit inventory does not end at --revision");
  invariant(authority.commitCount === authority.commits.length, "repository R2 commit count differs");
  invariant(Array.isArray(authority.mergeCommits) && authority.mergeCommits.length === 0, "repository R2 ancestry contains a merge commit");
  invariant(Array.isArray(authority.worktreeStatus) && authority.worktreeStatus.length === 0, "repository worktree is not clean");
  return true;
}

async function captureRepositoryAuthority(revision) {
  const [branch, head, mergeBase, commitsText, mergeText, countText, statusText] = await Promise.all([
    git("branch", "--show-current"),
    git("rev-parse", "HEAD"),
    git("merge-base", PHASE7A_R2_PARENT, revision),
    git("rev-list", "--reverse", "--first-parent", PHASE7A_R2_PARENT + ".." + revision),
    git("rev-list", "--merges", PHASE7A_R2_PARENT + ".." + revision),
    git("rev-list", "--count", PHASE7A_R2_PARENT + ".." + revision),
    git("status", "--porcelain=v1", "--untracked-files=all"),
  ]);
  const commits = commitsText.split(/\r?\n/).filter(Boolean);
  const authority = {
    branch,
    commitCount: Number(countText),
    commits,
    exactParent: PHASE7A_R2_PARENT,
    firstCommitParent: commits.length ? await git("rev-parse", commits[0] + "^") : null,
    head,
    mergeBase,
    mergeCommits: mergeText.split(/\r?\n/).filter(Boolean),
    worktreeStatus: statusText.split(/\r?\n/).filter(Boolean),
  };
  validateRepositoryAuthority(authority, revision);
  return authority;
}

function noPopup(value) {
  return value === null || value === undefined || value === false || value === "false";
}

export function validateSummaryAuthority(summary, expanded, label) {
  invariant(summary?.tag === "summary", label + " is not the native summary element");
  invariant(summary.ariaControls === "field-map-navigation", label + " aria-controls differs");
  invariant(summary.authoredAriaHasPopup === null, label + " falsely authors popup semantics");
  invariant(summary.authoredAriaExpanded === null, label + " falsely authors expanded semantics over native details");
  invariant(summary.axRole === "DisclosureTriangle", label + " CDP accessibility role differs");
  invariant(summary.axName === FIELD_MAP_SUMMARY_AX_NAME, label + " CDP accessibility name differs");
  invariant(summary.axExpanded === expanded, label + " CDP native expanded state differs");
  invariant(noPopup(summary.axHasPopup) && summary.noPopup === true, label + " CDP accessibility authority exposes popup semantics");
  invariant(summary.axFocusable === true && summary.axIgnored === false, label + " CDP accessibility focusability differs");
  return true;
}

export function validateLinkAuthority(links) {
  invariant(Array.isArray(links) && links.length === FIELD_MAP_DESTINATIONS.length, "CDP accessibility link inventory must contain exactly eight destinations");
  const hrefs = new Set();
  const names = new Set();
  links.forEach((link, index) => {
    const expected = FIELD_MAP_DESTINATIONS[index];
    invariant(link?.href === expected.href, "CDP accessibility link " + (index + 1) + " href differs");
    invariant(link.accessibleName === expected.accessibleName && link.focusName === expected.focusName, "CDP accessibility link " + (index + 1) + " name differs");
    invariant(link.axRole === "link" && link.axName === expected.accessibleName, "CDP accessibility link " + (index + 1) + " role/name differs");
    invariant(link.axFocusable === true && link.axIgnored === false, "CDP accessibility link " + (index + 1) + " is not exposed as focusable");
    invariant(!hrefs.has(link.href) && !names.has(link.accessibleName), "CDP accessibility link inventory contains a duplicate");
    hrefs.add(link.href);
    names.add(link.accessibleName);
  });
  return true;
}

function expectedTargetControls() {
  return [
    { selector: "[data-field-map] > summary", href: null, accessibleName: "Field map", elementType: "summary" },
    ...FIELD_MAP_DESTINATIONS.map((destination) => ({
      selector: "[data-field-map] a[href=\"" + destination.href + "\"]",
      href: destination.href,
      accessibleName: destination.accessibleName,
      elementType: "a",
    })),
  ];
}

export function validateTargetInventory(inventory) {
  const expected = expectedTargetControls();
  invariant(inventory?.minimumCssPixels === MINIMUM_TARGET_CSS_PIXELS, "installed-Chrome target minimum differs");
  invariant(inventory.candidateCount === expected.length, "installed-Chrome target candidate count is not exactly nine");
  invariant(Array.isArray(inventory.controls) && inventory.controls.length === expected.length, "installed-Chrome target inventory is not exactly nine controls");
  const selectors = new Set();
  inventory.controls.forEach((control, index) => {
    const authority = expected[index];
    invariant(control?.selector === authority.selector && control.href === authority.href && control.accessibleName === authority.accessibleName && control.elementType === authority.elementType, "installed-Chrome target " + (index + 1) + " identity differs");
    invariant(!selectors.has(control.selector), "installed-Chrome target inventory contains a duplicate selector");
    selectors.add(control.selector);
    invariant(control.visible === true && control.focusable === true && control.intendedInteractive === true, "installed-Chrome target " + (index + 1) + " is not a visible active control");
    invariant(control.fullyInViewport === true && control.unoccluded === true, "installed-Chrome target " + (index + 1) + " is clipped or occluded");
    invariant(Number.isFinite(control.width) && control.width >= MINIMUM_TARGET_CSS_PIXELS, "installed-Chrome target " + (index + 1) + " width is below 44 CSS pixels");
    invariant(Number.isFinite(control.height) && control.height >= MINIMUM_TARGET_CSS_PIXELS, "installed-Chrome target " + (index + 1) + " height is below 44 CSS pixels");
  });
  return true;
}

function validateClosedState(state, label, focusReturn = false) {
  invariant(state?.open === false && state.rootOpen === false, label + " is not closed");
  invariant(state.controller === "ready", label + " enhanced controller is not ready");
  invariant(Number.isSafeInteger(state.backgroundRegionCount) && state.backgroundRegionCount >= 3, label + " background region count differs");
  invariant(state.inertRegionCount === 0 && state.ownedInertCount === 0, label + " retains stale inert ownership");
  if (focusReturn) invariant(state.activeElement === "field-map-summary", label + " did not return focus to the summary");
  return true;
}

function validateOpenState(state, label) {
  invariant(state?.open === true && state.rootOpen === true, label + " is not open");
  invariant(state.controller === "ready", label + " enhanced controller is not ready");
  invariant(Number.isSafeInteger(state.backgroundRegionCount) && state.backgroundRegionCount >= 3, label + " background region count differs");
  invariant(state.inertRegionCount === state.backgroundRegionCount && state.ownedInertCount === state.backgroundRegionCount, label + " inert ownership differs");
  invariant(state.backgroundAvailableFocusableCount === 0, label + " leaves an available background target");
  invariant(state.documentFocusableCount === 9 && state.fieldMapFocusableCount === 9 && state.outsideFocusableCount === 0, label + " focusable inventory is not exactly the nine Field Map controls");
  return true;
}

function focusRecord(element, destinationName = null) {
  return { activeDestinationName: destinationName, activeElement: element };
}

const FORWARD_STOPS = Object.freeze([
  ...FIELD_MAP_DESTINATIONS.map((destination) => focusRecord("a", destination.focusName)),
  focusRecord("field-map-summary"),
]);

const REVERSE_STOPS = Object.freeze([
  ...[...FIELD_MAP_DESTINATIONS].reverse().map((destination) => focusRecord("a", destination.focusName)),
  focusRecord("field-map-summary"),
]);

function validateFocusRecord(actual, expected, label, step) {
  invariant(actual?.step === step, label + " step differs");
  invariant(actual.activeElement === expected.activeElement && (actual.activeDestinationName ?? null) === expected.activeDestinationName, label + " target differs");
}

export function validateFocusAuthority(focus) {
  invariant(focus?.automaticOpen?.activeElement === "a" && focus.automaticOpen.activeDestinationName === "About", "installed-Chrome automatic open focus differs");
  invariant(focus.forward?.start?.activeElement === "field-map-summary", "installed-Chrome forward sequence start differs");
  invariant(Array.isArray(focus.forward?.stops) && focus.forward.stops.length === 9, "installed-Chrome forward sequence is not exactly nine stops");
  focus.forward.stops.forEach((record, index) => validateFocusRecord(record, FORWARD_STOPS[index], "installed-Chrome forward stop " + (index + 1), index + 1));
  invariant(focus.reverse?.start?.activeElement === "field-map-summary", "installed-Chrome reverse sequence start differs");
  invariant(Array.isArray(focus.reverse?.stops) && focus.reverse.stops.length === 9, "installed-Chrome reverse sequence is not exactly nine stops");
  focus.reverse.stops.forEach((record, index) => validateFocusRecord(record, REVERSE_STOPS[index], "installed-Chrome reverse stop " + (index + 1), index + 1));
  for (const [name, expectedAttempt] of [["bodyRecapture", "body"], ["outsideRecapture", OUTSIDE_CONTROL_ID]]) {
    const record = focus[name];
    invariant(record?.attempted === expectedAttempt, "installed-Chrome " + name + " attempted target differs");
    invariant(Array.isArray(record.focusinTargets) && record.focusinTargets.includes(expectedAttempt), "installed-Chrome " + name + " does not prove the outside focus attempt");
    invariant(record.final?.activeElement === "a" && record.final.activeDestinationName === "About", "installed-Chrome " + name + " did not recapture preferred focus");
  }
  invariant(focus.postCloseOutsideFocus?.activeElement === OUTSIDE_CONTROL_ID, "installed-Chrome containment remains active after close");
  return true;
}

export function validateZoomProof(proof) {
  invariant(proof?.method === "installed Google Chrome native browser zoom over a visible headed window", "installed-Chrome zoom method differs");
  invariant(proof.uiZoomLabelInput === "Zoom: 200%" && proof.computerUseAccessibilityText === "Zoom: 200%", "installed-Chrome visible UI zoom authority differs");
  invariant(Number.isFinite(proof.baseline?.innerWidth) && proof.baseline.innerWidth > 0 && Number.isFinite(proof.baseline?.devicePixelRatio) && proof.baseline.devicePixelRatio > 0, "installed-Chrome zoom baseline differs");
  invariant(Number.isFinite(proof.observed?.innerWidth) && proof.observed.innerWidth > 0 && Number.isFinite(proof.observed?.devicePixelRatio) && proof.observed.devicePixelRatio > 0, "installed-Chrome zoom observation differs");
  const expectedWidthRatio = proof.baseline.innerWidth / proof.observed.innerWidth;
  const expectedDprRatio = proof.observed.devicePixelRatio / proof.baseline.devicePixelRatio;
  invariant(Math.abs(proof.widthRatio - expectedWidthRatio) < 0.0001 && Math.abs(proof.dprRatio - expectedDprRatio) < 0.0001, "installed-Chrome zoom ratios are not derived from their measurements");
  invariant(Math.abs(expectedWidthRatio - 2) <= ZOOM_RATIO_TOLERANCE, "installed-Chrome innerWidth is not approximately half the baseline");
  invariant(Math.abs(expectedDprRatio - 2) <= ZOOM_RATIO_TOLERANCE, "installed-Chrome devicePixelRatio is not approximately double the baseline");
  invariant(Math.abs(proof.observed.visualViewport?.scale - 1) <= VISUAL_VIEWPORT_SCALE_TOLERANCE, "installed-Chrome visualViewport.scale is not 1");
  invariant(proof.observed.rootCssZoom === "1" && proof.observed.rootTransform === "none" && proof.observed.bodyTransform === "none", "installed-Chrome capture exposes a CSS zoom/transform substitute");
  invariant(proof.status === "PASS" && Object.values(proof.checks ?? {}).every((value) => value === true), "installed-Chrome zoom proof does not pass every check");
  return true;
}

function validateScreenshot(record, expected, label) {
  exactKeys(record, ["browserTitle", "bytes", "entropy", "format", "height", "label", "maximumChannelRange", "relativePath", "sha256", "width"], label);
  invariant(record?.label === expected.label && record.relativePath === expected.relativePath, label + " identity differs");
  invariant(record.format === "png" && Number.isSafeInteger(record.bytes) && record.bytes > 0 && HASH_64.test(record.sha256 ?? ""), label + " bytes/hash differ");
  invariant(Number.isSafeInteger(record.width) && record.width > 0 && Number.isSafeInteger(record.height) && record.height > 0, label + " dimensions differ");
  invariant(Number.isFinite(record.entropy) && record.entropy >= 1 && Number.isFinite(record.maximumChannelRange) && record.maximumChannelRange >= 80, label + " is blank or lacks contrast");
  invariant(typeof record.browserTitle === "string" && record.browserTitle.trim().length > 0, label + " Chrome title is missing");
}

export function validateVisualAuthority(visuals) {
  invariant(Array.isArray(visuals) && visuals.length === PAGE_VISUALS.length, "installed-Chrome page-state visual inventory must contain exactly four PNGs");
  visuals.forEach((record, index) => validateScreenshot(record, PAGE_VISUALS[index], "installed-Chrome page-state visual " + (index + 1)));
  invariant(new Set(visuals.map((record) => record.sha256)).size === visuals.length, "installed-Chrome closed/open/focus/escape PNGs are not distinct");
  return true;
}

function titlesBind(computerUseTitle, cdpTitle) {
  const observed = String(computerUseTitle ?? "").replace(/\s+/g, " ").trim();
  const target = String(cdpTitle ?? "").replace(/\s+/g, " ").trim();
  return Boolean(observed && target && (observed === target || observed.includes(target)));
}

export function validateComputerUseUiProof(document, pngRecord, expectedBrowserTitle, expectedZoomText = "Zoom: 200%") {
  exactKeys(document, ["schema", "status", "producer", "capturedAt", "browserWindow", "accessibility", "screenshot"], "Computer Use proof");
  invariant(document.schema === PHASE7A_R2_COMPUTER_USE_UI_PROOF_SCHEMA && document.status === "PASS", "Computer Use proof schema/status differs");
  invariant(document.producer === "Codex Computer Use", "Computer Use proof producer differs");
  const capturedAt = new Date(document.capturedAt);
  invariant(Number.isFinite(capturedAt.valueOf()) && capturedAt.toISOString() === document.capturedAt, "Computer Use proof capture time is not canonical ISO-8601 UTC");
  exactKeys(document.browserWindow, ["product", "selectedWindowCount", "title", "visible"], "Computer Use browser window");
  invariant(document.browserWindow.product === "Google Chrome", "Computer Use proof did not select Google Chrome");
  invariant(document.browserWindow.selectedWindowCount === 1 && document.browserWindow.visible === true, "Computer Use proof does not bind one uniquely selected visible Chrome window");
  invariant(typeof document.browserWindow.title === "string" && document.browserWindow.title.trim().length > 0, "Computer Use proof browser title is missing");
  invariant(titlesBind(document.browserWindow.title, expectedBrowserTitle), "Computer Use browser title does not bind the CDP target title");
  exactKeys(document.accessibility, ["matchCount", "text"], "Computer Use accessibility proof");
  invariant(document.accessibility.matchCount === 1 && document.accessibility.text === expectedZoomText && expectedZoomText === "Zoom: 200%", "Computer Use accessibility proof does not expose exactly one Zoom: 200% text match");
  exactKeys(document.screenshot, ["bytes", "format", "height", "sha256", "width"], "Computer Use screenshot binding");
  validateScreenshot(pngRecord, COMPUTER_USE_VISUAL, "Computer Use visible-Chrome proof PNG");
  invariant(pngRecord.browserTitle === document.browserWindow.title, "Computer Use proof PNG title binding differs");
  invariant(document.screenshot.format === "png"
    && document.screenshot.bytes === pngRecord.bytes
    && document.screenshot.sha256 === pngRecord.sha256
    && document.screenshot.width === pngRecord.width
    && document.screenshot.height === pngRecord.height,
  "Computer Use proof JSON does not bind the supplied PNG bytes, hash, and dimensions");
  return {
    accessibility: { ...document.accessibility },
    browserWindow: { ...document.browserWindow },
    capturedAt: document.capturedAt,
    producer: document.producer,
    schema: document.schema,
    screenshot: { ...pngRecord },
    status: document.status,
  };
}

function validateComputerUseReportProof(proof, browserTitle, expectedZoomText) {
  exactKeys(proof, ["schema", "status", "producer", "capturedAt", "browserWindow", "accessibility", "screenshot"], "installed-Chrome Computer Use report proof");
  return validateComputerUseUiProof({
    accessibility: proof.accessibility,
    browserWindow: proof.browserWindow,
    capturedAt: proof.capturedAt,
    producer: proof.producer,
    schema: proof.schema,
    screenshot: {
      bytes: proof.screenshot?.bytes,
      format: proof.screenshot?.format,
      height: proof.screenshot?.height,
      sha256: proof.screenshot?.sha256,
      width: proof.screenshot?.width,
    },
    status: proof.status,
  }, proof.screenshot, browserTitle, expectedZoomText);
}

export function validateInstalledChromeReport(report, expectedRevision) {
  invariant(report?.schema === PHASE7A_R2_INSTALLED_CHROME_SCHEMA && report.status === "PASS", "installed-Chrome R2 report schema/status differs");
  invariant(report.branch === PHASE7A_R2_BRANCH && report.parent === PHASE7A_R2_PARENT && report.revision === expectedRevision, "installed-Chrome R2 root authority differs");
  invariant(report.baseUrl === new URL(report.baseUrl).toString(), "installed-Chrome base URL is not canonical");
  validateRepositoryAuthority(report.repository, expectedRevision);
  invariant(report.browser?.product === "Google Chrome" && /^Chrome\/\d/.test(report.browser.cdpProduct ?? ""), "installed-Chrome browser product differs");
  invariant(report.browser.headed === true && report.browser.connection === "loopback CDP", "installed-Chrome headed/CDP authority differs");
  invariant(typeof report.browser.userAgent === "string" && report.browser.userAgent.includes("Chrome/") && !report.browser.userAgent.includes("HeadlessChrome"), "installed-Chrome user agent is not headed Google Chrome");
  invariant(report.browser.window?.windowState !== "minimized" && report.browser.window?.width > 0 && report.browser.window?.height > 0, "installed-Chrome visible window bounds differ");
  validateZoomProof(report.zoomProof);
  validateComputerUseReportProof(report.computerUseUiProof, report.browser.targetTitle, report.zoomProof.uiZoomLabelInput);
  const reportTime = Date.parse(report.createdAt ?? "");
  const computerUseTime = Date.parse(report.computerUseUiProof.capturedAt ?? "");
  invariant(Number.isFinite(reportTime)
    && reportTime >= computerUseTime
    && reportTime - computerUseTime <= MAX_COMPUTER_USE_PROOF_AGE_MS,
  "Computer Use proof capture time is future-dated or older than 24 hours at report creation");
  invariant(report.accessibility?.method === "CDP Accessibility.getPartialAXTree", "installed-Chrome accessibility method differs");
  validateSummaryAuthority(report.accessibility.closedSummary, false, "installed-Chrome closed summary");
  validateSummaryAuthority(report.accessibility.openSummary, true, "installed-Chrome open summary");
  validateSummaryAuthority(report.accessibility.escapeSummary, false, "installed-Chrome Escape summary");
  validateLinkAuthority(report.accessibility.links);
  validateClosedState(report.states?.closed, "installed-Chrome initial state");
  validateOpenState(report.states?.open, "installed-Chrome open state");
  validateOpenState(report.states?.focus, "installed-Chrome focus state");
  validateClosedState(report.states?.escape, "installed-Chrome Escape state", true);
  validateTargetInventory(report.targetInventory);
  validateFocusAuthority(report.focus);
  invariant(Array.isArray(report.repeatedCycles) && report.repeatedCycles.length === 10, "installed-Chrome repeated-cycle evidence must contain exactly ten cycles");
  report.repeatedCycles.forEach((cycle, index) => {
    invariant(cycle?.cycle === index + 1 && cycle.activationKey === (index % 2 === 0 ? "Enter" : "Space"), "installed-Chrome repeated-cycle order/key differs");
    validateOpenState(cycle.opened, "installed-Chrome cycle " + (index + 1) + " open");
    invariant(cycle.opened.activeElement === "a" && cycle.opened.activeDestinationName === "About", "installed-Chrome cycle " + (index + 1) + " preferred focus differs");
    validateClosedState(cycle.closed, "installed-Chrome cycle " + (index + 1) + " close", true);
  });
  validateVisualAuthority(report.visuals);
  invariant(report.visuals.every((visual) => visual.browserTitle === report.browser.targetTitle), "installed-Chrome page-state PNG title binding differs");
  invariant(new Set([...report.visuals.map((visual) => visual.sha256), report.computerUseUiProof.screenshot.sha256]).size === ALL_VISUALS.length, "installed-Chrome page-state and Computer Use PNG hashes are not distinct");
  invariant(Array.isArray(report.limitations) && report.limitations.some((value) => value.includes("not physical Safari")), "installed-Chrome environmental limitation is missing");
  return true;
}

export function validateManifest(manifest, reportBytes, reportHash, visuals, computerUseVisual) {
  invariant(manifest?.schema === PHASE7A_R2_INSTALLED_CHROME_MANIFEST_SCHEMA, "installed-Chrome manifest schema differs");
  invariant(manifest.report?.path === REPORT_NAME && manifest.report.bytes === reportBytes && manifest.report.sha256 === reportHash, "installed-Chrome manifest report binding differs");
  invariant(Array.isArray(manifest.entries) && manifest.entries.length === ALL_VISUALS.length, "installed-Chrome manifest screenshot inventory differs");
  const expected = [...visuals, computerUseVisual].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  invariant(new Set(expected.map((visual) => visual.relativePath)).size === ALL_VISUALS.length, "installed-Chrome manifest visual paths are duplicated");
  manifest.entries.forEach((entry, index) => {
    const visual = expected[index];
    invariant(entry.path === visual.relativePath && entry.bytes === visual.bytes && entry.sha256 === visual.sha256, "installed-Chrome manifest entry " + (index + 1) + " differs");
  });
  return true;
}

function parseAxValue(value) {
  return value?.value ?? null;
}

async function partialAxNode(session, selector) {
  const expression = "document.querySelector(" + JSON.stringify(selector) + ")";
  const evaluated = await session.send("Runtime.evaluate", {
    expression,
    objectGroup: "phase7a-r2-installed-chrome-ax",
    returnByValue: false,
    silent: true,
  });
  invariant(!evaluated.exceptionDetails && evaluated.result?.objectId, "CDP could not resolve accessibility selector: " + selector);
  const tree = await session.send("Accessibility.getPartialAXTree", {
    fetchRelatives: false,
    objectId: evaluated.result.objectId,
  });
  const node = tree.nodes?.find((candidate) => candidate.ignored === false) ?? tree.nodes?.[0];
  invariant(node, "CDP accessibility tree is empty for selector: " + selector);
  const properties = Object.fromEntries((node.properties ?? []).map((property) => [property.name, parseAxValue(property.value)]));
  return {
    expanded: Object.hasOwn(properties, "expanded") ? properties.expanded : null,
    focusable: properties.focusable === true,
    hasPopup: Object.hasOwn(properties, "hasPopup") ? properties.hasPopup : null,
    ignored: node.ignored === true,
    name: parseAxValue(node.name),
    role: parseAxValue(node.role),
  };
}

async function captureSummaryAuthority(page, session) {
  const [dom, ax] = await Promise.all([
    page.locator("[data-field-map] > summary").evaluate((summary) => ({
      ariaControls: summary.getAttribute("aria-controls"),
      authoredAriaExpanded: summary.getAttribute("aria-expanded"),
      authoredAriaHasPopup: summary.getAttribute("aria-haspopup"),
      tag: summary.tagName.toLowerCase(),
    })),
    partialAxNode(session, "[data-field-map] > summary"),
  ]);
  const result = {
    ...dom,
    axExpanded: ax.expanded,
    axFocusable: ax.focusable,
    axHasPopup: ax.hasPopup,
    axIgnored: ax.ignored,
    axName: ax.name,
    axRole: ax.role,
    noPopup: dom.authoredAriaHasPopup === null && noPopup(ax.hasPopup),
  };
  validateSummaryAuthority(result, await page.locator("[data-field-map]").evaluate((map) => map.open), "live installed-Chrome summary");
  return result;
}

async function captureLinkAuthority(page, session) {
  const result = [];
  for (const destination of FIELD_MAP_DESTINATIONS) {
    const selector = "[data-field-map] a[href=\"" + destination.href + "\"]";
    const [dom, ax] = await Promise.all([
      page.locator(selector).evaluate((link) => ({
        accessibleName: link.getAttribute("aria-label"),
        focusName: link.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        href: link.getAttribute("href"),
      })),
      partialAxNode(session, selector),
    ]);
    result.push({
      ...dom,
      axFocusable: ax.focusable,
      axIgnored: ax.ignored,
      axName: ax.name,
      axRole: ax.role,
    });
  }
  validateLinkAuthority(result);
  return result;
}

async function inspectGeometry(page) {
  return page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    return {
      bodyTransform: bodyStyle.transform,
      devicePixelRatio,
      innerHeight,
      innerWidth,
      outerHeight,
      outerWidth,
      rootCssZoom: rootStyle.zoom || "1",
      rootTransform: rootStyle.transform,
      screen: { height: screen.height, width: screen.width },
      visualViewport: visualViewport ? {
        height: visualViewport.height,
        offsetLeft: visualViewport.offsetLeft,
        offsetTop: visualViewport.offsetTop,
        pageLeft: visualViewport.pageLeft,
        pageTop: visualViewport.pageTop,
        scale: visualViewport.scale,
        width: visualViewport.width,
      } : null,
    };
  });
}

async function inspectFieldMapState(page, label) {
  return page.evaluate((stateLabel) => {
    const map = document.querySelector("[data-field-map]");
    const summary = map?.querySelector(":scope > summary");
    const destinations = [...(map?.querySelectorAll("a[href]") ?? [])];
    const background = [...document.querySelectorAll("[data-field-map-background]")];
    const selector = "a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex=\"-1\"]),[contenteditable=\"true\"]";
    const allCandidates = [...document.querySelectorAll(selector)];
    const isAvailable = (element) => {
      if (!(element instanceof HTMLElement) || element.closest("[inert],[hidden]") || element.matches(":disabled") || element.tabIndex < 0) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && !["hidden", "collapse"].includes(style.visibility)
        && Number.parseFloat(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0;
    };
    const available = allCandidates.filter(isAvailable);
    const backgroundCandidates = [...new Set(background.flatMap((region) => [
      ...(region.matches(selector) ? [region] : []),
      ...region.querySelectorAll(selector),
    ]))];
    const active = document.activeElement;
    const activeElement = active === summary
      ? "field-map-summary"
      : active instanceof HTMLAnchorElement && active.closest("[data-field-map]")
        ? "a"
        : active === document.body
          ? "body"
          : active?.id || active?.tagName.toLowerCase() || null;
    const activeDestinationName = active instanceof HTMLAnchorElement && active.closest("[data-field-map]")
      ? active.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? null
      : null;
    return {
      activeDestinationName,
      activeElement,
      backgroundAvailableFocusableCount: backgroundCandidates.filter(isAvailable).length,
      backgroundPotentialFocusableCount: backgroundCandidates.length,
      backgroundRegionCount: background.length,
      controller: map?.getAttribute("data-controller") ?? null,
      documentFocusableCount: available.length,
      fieldMapFocusableCount: available.filter((element) => Boolean(element.closest("[data-field-map]"))).length,
      inertRegionCount: background.filter((region) => region.hasAttribute("inert")).length,
      label: stateLabel,
      open: map instanceof HTMLDetailsElement && map.open,
      outsideFocusableCount: available.filter((element) => !element.closest("[data-field-map]")).length,
      ownedInertCount: background.filter((region) => region.getAttribute("data-field-map-inert-owned") === "true").length,
      rootOpen: document.documentElement.hasAttribute("data-field-map-open"),
    };
  }, label);
}

async function inspectTargets(page) {
  const controls = await page.evaluate((expected) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement) || element.closest("[inert],[hidden]")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && !["hidden", "collapse"].includes(style.visibility)
        && Number.parseFloat(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0;
    };
    return expected.map((authority) => {
      const element = document.querySelector(authority.selector);
      if (!(element instanceof HTMLElement)) return { ...authority, missing: true };
      const rect = element.getBoundingClientRect();
      const centerX = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const centerY = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(centerX, centerY);
      const accessibleName = element.tagName === "SUMMARY"
        ? element.querySelector(".field-map__trigger-label")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
        : element.getAttribute("aria-label") ?? "";
      return {
        accessibleName,
        elementType: element.tagName.toLowerCase(),
        focusable: element.tabIndex >= 0 && !element.closest("[inert]"),
        fullyInViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        height: rect.height,
        href: element.getAttribute("href"),
        intendedInteractive: element.tagName === "SUMMARY" || (element.tagName === "A" && element.hasAttribute("href")),
        selector: authority.selector,
        unoccluded: Boolean(hit && (hit === element || element.contains(hit))),
        visible: visible(element),
        width: rect.width,
      };
    });
  }, expectedTargetControls());
  const inventory = {
    candidateCount: controls.length,
    controls: controls.map((control) => ({
      ...control,
      height: round(control.height),
      width: round(control.width),
    })),
    minimumCssPixels: MINIMUM_TARGET_CSS_PIXELS,
  };
  validateTargetInventory(inventory);
  return inventory;
}

async function readFocus(page) {
  return page.evaluate(() => {
    const map = document.querySelector("[data-field-map]");
    const summary = map?.querySelector(":scope > summary");
    const active = document.activeElement;
    return {
      activeDestinationName: active instanceof HTMLAnchorElement && active.closest("[data-field-map]")
        ? active.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? null
        : null,
      activeElement: active === summary
        ? "field-map-summary"
        : active instanceof HTMLAnchorElement && active.closest("[data-field-map]")
          ? "a"
          : active === document.body
            ? "body"
            : active?.id || active?.tagName.toLowerCase() || null,
    };
  });
}

async function waitOpen(page) {
  await page.waitForFunction(() => {
    const map = document.querySelector("[data-field-map]");
    const regions = [...document.querySelectorAll("[data-field-map-background]")];
    return map instanceof HTMLDetailsElement
      && map.open
      && document.documentElement.hasAttribute("data-field-map-open")
      && regions.length >= 3
      && regions.every((region) => region.hasAttribute("inert") && region.getAttribute("data-field-map-inert-owned") === "true");
  });
}

async function waitClosed(page) {
  await page.waitForFunction(() => {
    const map = document.querySelector("[data-field-map]");
    return map instanceof HTMLDetailsElement
      && !map.open
      && !document.documentElement.hasAttribute("data-field-map-open")
      && !document.querySelector("[data-field-map-background][inert], [data-field-map-background][data-field-map-inert-owned]");
  });
}

async function waitForAboutFocus(page) {
  await page.waitForFunction(() => document.activeElement instanceof HTMLAnchorElement
    && document.activeElement.closest("[data-field-map]")
    && document.activeElement.querySelector("strong")?.textContent?.trim() === "About");
}

async function focusSequence(page, reverse = false) {
  const summary = page.locator("[data-field-map] > summary");
  await summary.focus();
  const start = await readFocus(page);
  const stops = [];
  for (let index = 0; index < 9; index += 1) {
    await page.keyboard.press(reverse ? "Shift+Tab" : "Tab");
    await page.waitForTimeout(25);
    stops.push({ step: index + 1, ...(await readFocus(page)) });
  }
  return { start, stops };
}

async function bodyRecapture(page) {
  return page.evaluate(async () => {
    const map = document.querySelector("[data-field-map]");
    const focusinTargets = [];
    const identity = (element) => {
      if (element === document.body) return "body";
      if (element instanceof HTMLAnchorElement && element.closest("[data-field-map]")) return element.querySelector("strong")?.textContent?.trim() ?? "a";
      return element?.id || element?.tagName.toLowerCase() || null;
    };
    const listener = (event) => focusinTargets.push(identity(event.target));
    document.addEventListener("focusin", listener, true);
    const body = document.body;
    const hadTabIndex = body.hasAttribute("tabindex");
    const previousTabIndex = body.getAttribute("tabindex");
    body.setAttribute("tabindex", "-1");
    body.focus({ preventScroll: true });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    document.removeEventListener("focusin", listener, true);
    if (hadTabIndex) body.setAttribute("tabindex", previousTabIndex);
    else body.removeAttribute("tabindex");
    const active = document.activeElement;
    return {
      attempted: "body",
      final: {
        activeDestinationName: active instanceof HTMLAnchorElement && active.closest("[data-field-map]")
          ? active.querySelector("strong")?.textContent?.trim() ?? null
          : null,
        activeElement: active === map?.querySelector(":scope > summary")
          ? "field-map-summary"
          : active instanceof HTMLAnchorElement && active.closest("[data-field-map]")
            ? "a"
            : active === document.body
              ? "body"
              : active?.id || active?.tagName.toLowerCase() || null,
      },
      focusinTargets,
    };
  });
}

async function outsideRecapture(page) {
  return page.evaluate(async (outsideId) => {
    document.getElementById(outsideId)?.remove();
    const button = document.createElement("button");
    button.id = outsideId;
    button.type = "button";
    button.textContent = "Capture-only outside focus control";
    button.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.append(button);
    const focusinTargets = [];
    const identity = (element) => {
      if (element === document.body) return "body";
      if (element instanceof HTMLAnchorElement && element.closest("[data-field-map]")) return element.querySelector("strong")?.textContent?.trim() ?? "a";
      return element?.id || element?.tagName.toLowerCase() || null;
    };
    const listener = (event) => focusinTargets.push(identity(event.target));
    document.addEventListener("focusin", listener, true);
    button.focus({ preventScroll: true });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    document.removeEventListener("focusin", listener, true);
    const map = document.querySelector("[data-field-map]");
    const active = document.activeElement;
    return {
      attempted: outsideId,
      final: {
        activeDestinationName: active instanceof HTMLAnchorElement && active.closest("[data-field-map]")
          ? active.querySelector("strong")?.textContent?.trim() ?? null
          : null,
        activeElement: active === map?.querySelector(":scope > summary")
          ? "field-map-summary"
          : active instanceof HTMLAnchorElement && active.closest("[data-field-map]")
            ? "a"
            : active === document.body
              ? "body"
              : active?.id || active?.tagName.toLowerCase() || null,
      },
      focusinTargets,
    };
  }, OUTSIDE_CONTROL_ID);
}

async function postCloseOutsideFocus(page) {
  return page.evaluate(async (outsideId) => {
    const button = document.getElementById(outsideId);
    if (!(button instanceof HTMLButtonElement)) throw new Error("capture-only outside focus control is missing");
    button.focus({ preventScroll: true });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const activeElement = document.activeElement?.id || document.activeElement?.tagName.toLowerCase() || null;
    button.remove();
    return { activeElement };
  }, OUTSIDE_CONTROL_ID);
}

function createZoomProof(options, observed, computerUseProof) {
  const widthRatio = options.baselineWidth / observed.innerWidth;
  const dprRatio = observed.devicePixelRatio / options.baselineDpr;
  const proof = {
    baseline: { devicePixelRatio: options.baselineDpr, innerWidth: options.baselineWidth },
    checks: {
      dprApproximatelyDoubled: Math.abs(dprRatio - 2) <= ZOOM_RATIO_TOLERANCE,
      innerWidthApproximatelyHalved: Math.abs(widthRatio - 2) <= ZOOM_RATIO_TOLERANCE,
      noCssTransformOrZoom: observed.rootCssZoom === "1" && observed.rootTransform === "none" && observed.bodyTransform === "none",
      computerUseProofMatchesInput: options.uiZoomLabel === "Zoom: 200%" && computerUseProof.accessibility.text === options.uiZoomLabel,
      visualViewportScaleOne: Math.abs(observed.visualViewport?.scale - 1) <= VISUAL_VIEWPORT_SCALE_TOLERANCE,
    },
    computerUseAccessibilityText: computerUseProof.accessibility.text,
    dprRatio,
    method: "installed Google Chrome native browser zoom over a visible headed window",
    observed,
    status: "FAIL",
    uiZoomLabelInput: options.uiZoomLabel,
    widthRatio,
  };
  proof.status = Object.values(proof.checks).every(Boolean) ? "PASS" : "FAIL";
  validateZoomProof(proof);
  return proof;
}

async function analyzePng(filename, label, relativePath, browserTitle) {
  const bytes = await readFile(filename);
  const [metadata, statistics] = await Promise.all([sharp(bytes).metadata(), sharp(bytes).stats()]);
  const record = {
    bytes: bytes.length,
    entropy: statistics.entropy,
    format: metadata.format,
    height: metadata.height,
    label,
    maximumChannelRange: Math.max(...statistics.channels.slice(0, 3).map((channel) => channel.max - channel.min)),
    relativePath,
    sha256: digest(bytes),
    width: metadata.width,
    browserTitle: String(browserTitle).trim().slice(0, 200),
  };
  validateScreenshot(record, { label, relativePath }, "installed-Chrome " + label + " screenshot");
  return record;
}

async function capturePageState(page, staging, visual, browserTitle) {
  await page.bringToFront();
  await page.waitForTimeout(180);
  const filename = path.join(staging, ...visual.relativePath.split("/"));
  await page.screenshot({ animations: "disabled", caret: "hide", fullPage: false, path: filename, type: "png" });
  return analyzePng(filename, visual.label, visual.relativePath, browserTitle);
}

async function resolveExternalProofFile(candidate, extension, label) {
  const resolved = await realpath(candidate);
  const [realRoot, realTemp, entry] = await Promise.all([realpath(ROOT), realpath(os.tmpdir()), lstat(resolved)]);
  invariant(entry.isFile(), label + " must resolve to a regular file");
  invariant(path.extname(resolved).toLowerCase() === extension, label + " resolved extension differs");
  invariant(!within(realRoot, resolved) && !within(realTemp, resolved), label + " resolved inside a forbidden directory");
  return resolved;
}

async function loadComputerUseUiProof(options, staging, browserTitle) {
  const [jsonPath, pngPath] = await Promise.all([
    resolveExternalProofFile(options.uiProofJson, ".json", "Computer Use proof JSON"),
    resolveExternalProofFile(options.uiProofPng, ".png", "Computer Use proof PNG"),
  ]);
  invariant(jsonPath !== pngPath, "Computer Use proof inputs resolve to the same file");
  const jsonBytes = await readFile(jsonPath);
  invariant(jsonBytes.length > 0 && jsonBytes.length <= 64 * 1024, "Computer Use proof JSON byte size is invalid");
  let document;
  try {
    document = JSON.parse(jsonBytes.toString("utf8"));
  } catch {
    throw new Error("Computer Use proof JSON is not valid UTF-8 JSON");
  }
  const destination = path.join(staging, ...COMPUTER_USE_VISUAL.relativePath.split("/"));
  await copyFile(pngPath, destination);
  const pngRecord = await analyzePng(destination, COMPUTER_USE_VISUAL.label, COMPUTER_USE_VISUAL.relativePath, document?.browserWindow?.title);
  return validateComputerUseUiProof(document, pngRecord, browserTitle, options.uiZoomLabel);
}

async function browserAuthority(session) {
  const [version, target] = await Promise.all([
    session.send("Browser.getVersion"),
    session.send("Target.getTargetInfo"),
  ]);
  invariant(/^Chrome\/\d/.test(version.product ?? ""), "CDP endpoint is not installed Google Chrome");
  invariant(typeof version.userAgent === "string" && version.userAgent.includes("Chrome/") && !version.userAgent.includes("HeadlessChrome"), "CDP endpoint is not headed Google Chrome");
  invariant(target.targetInfo?.type === "page" && typeof target.targetInfo.title === "string" && target.targetInfo.title.trim().length > 0, "CDP page title authority is missing");
  const windowForTarget = await session.send("Browser.getWindowForTarget", { targetId: target.targetInfo.targetId });
  const windowBounds = await session.send("Browser.getWindowBounds", { windowId: windowForTarget.windowId });
  invariant(windowBounds.bounds?.windowState !== "minimized" && windowBounds.bounds?.width > 0 && windowBounds.bounds?.height > 0, "CDP target does not belong to a visible installed-Chrome window");
  return {
    cdpProduct: version.product,
    connection: "loopback CDP",
    headed: true,
    jsVersion: version.jsVersion,
    product: "Google Chrome",
    protocolVersion: version.protocolVersion,
    targetTitle: target.targetInfo.title,
    userAgent: version.userAgent,
    version: version.product.replace(/^Chrome\//, ""),
    window: {
      height: windowBounds.bounds.height,
      left: windowBounds.bounds.left,
      top: windowBounds.bounds.top,
      width: windowBounds.bounds.width,
      windowId: windowForTarget.windowId,
      windowState: windowBounds.bounds.windowState,
    },
  };
}

async function repeatedCycles(page) {
  const summary = page.locator("[data-field-map] > summary");
  const cycles = [];
  for (let index = 0; index < 10; index += 1) {
    const activationKey = index % 2 === 0 ? "Enter" : "Space";
    await summary.focus();
    await summary.press(activationKey);
    await waitOpen(page);
    await waitForAboutFocus(page);
    const opened = await inspectFieldMapState(page, "cycle-" + (index + 1) + "-open");
    await page.keyboard.press("Escape");
    await waitClosed(page);
    const closed = await inspectFieldMapState(page, "cycle-" + (index + 1) + "-closed");
    cycles.push({ activationKey, closed, cycle: index + 1, opened });
  }
  return cycles;
}

async function capture(options) {
  invariant(process.platform === "win32", "installed-Chrome R2 capture requires Windows");
  invariant(!(await doesExist(options.output)), "refusing to overwrite existing installed-Chrome R2 evidence: " + options.output);
  const repository = await captureRepositoryAuthority(options.revision);
  const outputParent = path.dirname(options.output);
  const existingOutputAncestor = await nearestExistingDirectory(outputParent);
  const [realRoot, realTemp, realExistingAncestor] = await Promise.all([realpath(ROOT), realpath(os.tmpdir()), realpath(existingOutputAncestor)]);
  invariant(!within(realRoot, realExistingAncestor) && !within(realTemp, realExistingAncestor), "installed-Chrome R2 output ancestor resolves inside a forbidden directory");
  await mkdir(outputParent, { recursive: true });
  const realParent = await realpath(outputParent);
  invariant(!within(realRoot, realParent) && !within(realTemp, realParent), "installed-Chrome R2 output parent resolves inside a forbidden directory");
  const staging = options.output + ".staging-" + randomUUID();
  invariant(!within(realRoot, staging) && !within(realTemp, staging) && !(await doesExist(staging)), "installed-Chrome R2 staging path differs");
  await mkdir(path.join(staging, "screenshots"), { recursive: true });
  let published = false;
  let browser;
  let session;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:" + options.remoteDebuggingPort, { timeout: TIMEOUT_MS });
    const origin = new URL(options.baseUrl).origin;
    const pages = browser.contexts().flatMap((context) => context.pages()).filter((page) => {
      try {
        return new URL(page.url()).origin === origin;
      } catch {
        return false;
      }
    });
    invariant(pages.length === 1, "expected exactly one installed-Chrome page for the supplied base URL; observed " + pages.length);
    const page = pages[0];
    page.setDefaultTimeout(TIMEOUT_MS);
    await page.bringToFront();
    const response = await page.goto(new URL("/about/", options.baseUrl).toString(), { waitUntil: "load" });
    invariant(response?.status() === 200, "installed-Chrome /about/ navigation did not return HTTP 200");
    await page.locator("[data-field-map][data-controller=\"ready\"]").waitFor({ state: "attached" });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(120);
    session = await page.context().newCDPSession(page);
    await Promise.all([session.send("Accessibility.enable"), session.send("DOM.enable"), session.send("Runtime.enable")]);
    const browserInfo = await browserAuthority(session);
    const computerUseUiProof = await loadComputerUseUiProof(options, staging, browserInfo.targetTitle);

    const map = page.locator("[data-field-map]");
    if (await map.evaluate((node) => node.open)) {
      await page.keyboard.press("Escape");
      await waitClosed(page);
    }
    const closedState = await inspectFieldMapState(page, "closed");
    validateClosedState(closedState, "live installed-Chrome initial state");
    const closedSummary = await captureSummaryAuthority(page, session);
    validateSummaryAuthority(closedSummary, false, "live installed-Chrome closed summary");
    const closedVisual = await capturePageState(page, staging, PAGE_VISUALS[0], browserInfo.targetTitle);
    const observedGeometry = await inspectGeometry(page);
    const zoomProof = createZoomProof(options, observedGeometry, computerUseUiProof);

    const summary = page.locator("[data-field-map] > summary");
    await summary.focus();
    await summary.press("Enter");
    await waitOpen(page);
    await waitForAboutFocus(page);
    const openState = await inspectFieldMapState(page, "open");
    validateOpenState(openState, "live installed-Chrome open state");
    const openSummary = await captureSummaryAuthority(page, session);
    validateSummaryAuthority(openSummary, true, "live installed-Chrome open summary");
    const links = await captureLinkAuthority(page, session);
    const targetInventory = await inspectTargets(page);
    const automaticOpen = await readFocus(page);
    const openVisual = await capturePageState(page, staging, PAGE_VISUALS[1], browserInfo.targetTitle);

    const forward = await focusSequence(page, false);
    const reverse = await focusSequence(page, true);
    await summary.focus();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(25);
    const focusState = await inspectFieldMapState(page, "focus");
    validateOpenState(focusState, "live installed-Chrome focus state");
    invariant((await readFocus(page)).activeDestinationName === "Home", "installed-Chrome focus screenshot target differs");
    const focusVisual = await capturePageState(page, staging, PAGE_VISUALS[2], browserInfo.targetTitle);

    const body = await bodyRecapture(page);
    const outside = await outsideRecapture(page);
    await page.keyboard.press("Escape");
    await waitClosed(page);
    const escapeState = await inspectFieldMapState(page, "escape");
    validateClosedState(escapeState, "live installed-Chrome Escape state", true);
    const escapeSummary = await captureSummaryAuthority(page, session);
    validateSummaryAuthority(escapeSummary, false, "live installed-Chrome Escape summary");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(25);
    invariant((await readFocus(page)).activeElement === "field-map-summary", "installed-Chrome Escape focus-paint round-trip did not return to the summary");
    const escapeVisual = await capturePageState(page, staging, PAGE_VISUALS[3], browserInfo.targetTitle);
    const postCloseOutside = await postCloseOutsideFocus(page);

    const cycles = await repeatedCycles(page);
    const visuals = [closedVisual, openVisual, focusVisual, escapeVisual];
    const report = {
      accessibility: {
        closedSummary,
        escapeSummary,
        links,
        method: "CDP Accessibility.getPartialAXTree",
        openSummary,
      },
      baseUrl: options.baseUrl,
      branch: PHASE7A_R2_BRANCH,
      browser: browserInfo,
      computerUseUiProof,
      createdAt: new Date().toISOString(),
      focus: {
        automaticOpen,
        bodyRecapture: body,
        forward,
        outsideRecapture: outside,
        postCloseOutsideFocus: postCloseOutside,
        reverse,
      },
      limitations: [
        "This is genuine installed Google Chrome evidence, not physical Safari evidence.",
        "The visible Chrome-window and Zoom: 200% proof is supplied by Codex Computer Use and cryptographically rebound to the copied PNG; the four page-state PNGs are captured through the attached page.",
        "The structured Escape state is captured immediately after Escape; its screenshot follows one Tab/Shift+Tab paint round-trip that ends on the restored summary so Chromium visibly rasterizes the focus indicator.",
      ],
      parent: PHASE7A_R2_PARENT,
      repeatedCycles: cycles,
      repository,
      revision: options.revision,
      schema: PHASE7A_R2_INSTALLED_CHROME_SCHEMA,
      states: {
        closed: closedState,
        escape: escapeState,
        focus: focusState,
        open: openState,
      },
      status: "PASS",
      targetInventory,
      visuals,
      zoomProof,
    };
    validateInstalledChromeReport(report, options.revision);

    const reportPath = path.join(staging, REPORT_NAME);
    const reportJson = privacyCheckedReportJson(report, [ROOT, options.uiProofJson, options.uiProofPng, options.output, staging]);
    await writeFile(reportPath, reportJson, { encoding: "utf8", flag: "wx" });
    const reportBytes = await readFile(reportPath);
    const entries = [...visuals, computerUseUiProof.screenshot]
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
      .map((visual) => ({ bytes: visual.bytes, path: visual.relativePath, sha256: visual.sha256 }));
    const manifest = {
      entries,
      report: { bytes: reportBytes.length, path: REPORT_NAME, sha256: digest(reportBytes) },
      schema: PHASE7A_R2_INSTALLED_CHROME_MANIFEST_SCHEMA,
    };
    validateManifest(manifest, reportBytes.length, digest(reportBytes), visuals, computerUseUiProof.screenshot);
    await writeFile(path.join(staging, MANIFEST_NAME), canonicalJson(manifest), { encoding: "utf8", flag: "wx" });
    await rename(staging, options.output);
    published = true;
    return {
      manifest,
      output: options.output,
      report,
    };
  } finally {
    await session?.send("Runtime.releaseObjectGroup", { objectGroup: "phase7a-r2-installed-chrome-ax" }).catch(() => undefined);
    await session?.detach().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    if (!published) await rm(staging, { force: true, recursive: true }).catch(() => undefined);
  }
}

function expectReject(fn, pattern, label) {
  let rejected = false;
  try {
    fn();
  } catch (error) {
    rejected = pattern.test(String(error?.message ?? error));
  }
  invariant(rejected, label + " was not rejected");
}

function fixtureSummary(expanded) {
  return {
    ariaControls: "field-map-navigation",
    authoredAriaExpanded: null,
    authoredAriaHasPopup: null,
    axExpanded: expanded,
    axFocusable: true,
    axHasPopup: null,
    axIgnored: false,
    axName: FIELD_MAP_SUMMARY_AX_NAME,
    axRole: "DisclosureTriangle",
    noPopup: true,
    tag: "summary",
  };
}

function fixtureTargets() {
  return {
    candidateCount: 9,
    controls: expectedTargetControls().map((control) => ({
      ...control,
      focusable: true,
      fullyInViewport: true,
      height: 44,
      intendedInteractive: true,
      unoccluded: true,
      visible: true,
      width: 44,
    })),
    minimumCssPixels: 44,
  };
}

export function selfTest() {
  const revision = "b".repeat(40);
  const validArgs = [
    "--base-url", "http://127.0.0.1:4322/",
    "--revision", revision,
    "--output", path.resolve(ROOT, "..", "phase7a-r2-installed-chrome-self-test"),
    "--remote-debugging-port", "9333",
    "--baseline-width", "1400",
    "--baseline-dpr", "1.25",
    "--ui-zoom-label", "Zoom: 200%",
    "--ui-proof-json", path.resolve(ROOT, "..", "phase7a-r2-computer-use-self-test", "proof.json"),
    "--ui-proof-png", path.resolve(ROOT, "..", "phase7a-r2-computer-use-self-test", "proof.png"),
  ];
  const parsed = parseArguments(validArgs);
  invariant(parsed.baseUrl === "http://127.0.0.1:4322/" && parsed.revision === revision && parsed.remoteDebuggingPort === 9333, "installed-Chrome R2 argument parsing differs");
  expectReject(() => parseArguments(validArgs.map((value, index) => index === 5 ? path.join(ROOT, "evidence") : value)), /outside the repository/, "repository output");
  expectReject(() => parseArguments(validArgs.map((value, index) => index === 5 ? path.join(os.tmpdir(), "evidence") : value)), /temporary/, "temporary output");
  expectReject(() => parseArguments(validArgs.map((value, index) => index === 3 ? PHASE7A_R2_PARENT : value)), /new R2 commit/, "parent revision");
  expectReject(() => parseArguments(validArgs.map((value, index) => index === 13 ? "Zoom: 175%" : value)), /Zoom: 200%/, "incorrect zoom label");
  expectReject(() => parseArguments(validArgs.map((value, index) => index === 15 ? path.join(ROOT, "proof.json") : value)), /outside the repository/, "repository Computer Use proof JSON");
  expectReject(() => parseArguments(validArgs.map((value, index) => index === 17 ? path.join(os.tmpdir(), "proof.png") : value)), /temporary/, "temporary Computer Use proof PNG");

  const repository = {
    branch: PHASE7A_R2_BRANCH,
    commitCount: 1,
    commits: [revision],
    exactParent: PHASE7A_R2_PARENT,
    firstCommitParent: PHASE7A_R2_PARENT,
    head: revision,
    mergeBase: PHASE7A_R2_PARENT,
    mergeCommits: [],
    worktreeStatus: [],
  };
  validateRepositoryAuthority(repository, revision);
  expectReject(() => validateRepositoryAuthority({ ...repository, mergeCommits: [revision] }, revision), /merge commit/, "merge ancestry");
  validateSummaryAuthority(fixtureSummary(false), false, "self-test closed summary");
  validateSummaryAuthority(fixtureSummary(true), true, "self-test open summary");
  expectReject(() => validateSummaryAuthority({ ...fixtureSummary(true), authoredAriaHasPopup: "true", noPopup: false }, true, "self-test popup summary"), /popup/, "popup semantics");
  validateLinkAuthority(FIELD_MAP_DESTINATIONS.map((destination) => ({
    accessibleName: destination.accessibleName,
    axFocusable: true,
    axIgnored: false,
    axName: destination.accessibleName,
    axRole: "link",
    focusName: destination.focusName,
    href: destination.href,
  })));
  validateTargetInventory(fixtureTargets());
  const focus = {
    automaticOpen: focusRecord("a", "About"),
    bodyRecapture: { attempted: "body", final: focusRecord("a", "About"), focusinTargets: ["body", "About"] },
    forward: { start: focusRecord("field-map-summary"), stops: FORWARD_STOPS.map((record, index) => ({ step: index + 1, ...record })) },
    outsideRecapture: { attempted: OUTSIDE_CONTROL_ID, final: focusRecord("a", "About"), focusinTargets: [OUTSIDE_CONTROL_ID, "About"] },
    postCloseOutsideFocus: { activeElement: OUTSIDE_CONTROL_ID },
    reverse: { start: focusRecord("field-map-summary"), stops: REVERSE_STOPS.map((record, index) => ({ step: index + 1, ...record })) },
  };
  validateFocusAuthority(focus);
  validateZoomProof({
    baseline: { devicePixelRatio: 1.25, innerWidth: 1400 },
    checks: {
      dprApproximatelyDoubled: true,
      innerWidthApproximatelyHalved: true,
      noCssTransformOrZoom: true,
      computerUseProofMatchesInput: true,
      visualViewportScaleOne: true,
    },
    computerUseAccessibilityText: "Zoom: 200%",
    dprRatio: 2,
    method: "installed Google Chrome native browser zoom over a visible headed window",
    observed: {
      bodyTransform: "none",
      devicePixelRatio: 2.5,
      innerWidth: 700,
      rootCssZoom: "1",
      rootTransform: "none",
      visualViewport: { scale: 1 },
    },
    status: "PASS",
    uiZoomLabelInput: "Zoom: 200%",
    widthRatio: 2,
  });
  invariant(canonicalJson({ z: 1, a: { d: 2, b: 1 } }) === canonicalJson({ a: { b: 1, d: 2 }, z: 1 }), "canonical JSON ordering differs");
  invariant(privacyCheckedReportJson({ baseUrl: "http://127.0.0.1:4322/", status: "PASS", screenshot: COMPUTER_USE_VISUAL.relativePath }, [ROOT]).includes('"status": "PASS"'), "private-path report check rejected portable evidence");
  expectReject(() => privacyCheckedReportJson({ source: path.join(ROOT, "proof.png") }, [ROOT]), /private source path|absolute private path/, "private source path in report");
  const visuals = PAGE_VISUALS.map((visual, index) => ({
    bytes: 100 + index,
    browserTitle: "Quantum",
    entropy: 3,
    format: "png",
    height: 900,
    label: visual.label,
    maximumChannelRange: 255,
    relativePath: visual.relativePath,
    sha256: String(index + 1).repeat(64),
    width: 1440,
  }));
  validateVisualAuthority(visuals);
  const computerUseVisual = {
    browserTitle: "Quantum - Google Chrome",
    bytes: 104,
    entropy: 3,
    format: "png",
    height: 900,
    label: COMPUTER_USE_VISUAL.label,
    maximumChannelRange: 255,
    relativePath: COMPUTER_USE_VISUAL.relativePath,
    sha256: "5".repeat(64),
    width: 1440,
  };
  const computerUseDocument = {
    accessibility: { matchCount: 1, text: "Zoom: 200%" },
    browserWindow: { product: "Google Chrome", selectedWindowCount: 1, title: "Quantum - Google Chrome", visible: true },
    capturedAt: "2026-09-01T00:00:00.000Z",
    producer: "Codex Computer Use",
    schema: PHASE7A_R2_COMPUTER_USE_UI_PROOF_SCHEMA,
    screenshot: { bytes: 104, format: "png", height: 900, sha256: "5".repeat(64), width: 1440 },
    status: "PASS",
  };
  const computerUseProof = validateComputerUseUiProof(computerUseDocument, computerUseVisual, "Quantum", "Zoom: 200%");
  validateComputerUseReportProof(computerUseProof, "Quantum", "Zoom: 200%");
  expectReject(() => validateComputerUseUiProof({ ...computerUseDocument, accessibility: { matchCount: 1, text: "Zoom: 175%" } }, computerUseVisual, "Quantum"), /Zoom: 200%/, "incorrect Computer Use accessibility text");
  expectReject(() => validateComputerUseUiProof({ ...computerUseDocument, browserWindow: { ...computerUseDocument.browserWindow, selectedWindowCount: 2 } }, computerUseVisual, "Quantum"), /uniquely selected/, "ambiguous Computer Use window");
  expectReject(() => validateComputerUseUiProof({ ...computerUseDocument, screenshot: { ...computerUseDocument.screenshot, sha256: "6".repeat(64) } }, computerUseVisual, "Quantum"), /does not bind/, "mismatched Computer Use PNG hash");
  const reportHash = "a".repeat(64);
  const manifest = {
    entries: [...visuals, computerUseVisual].sort((left, right) => left.relativePath.localeCompare(right.relativePath)).map((visual) => ({ bytes: visual.bytes, path: visual.relativePath, sha256: visual.sha256 })),
    report: { bytes: 1234, path: REPORT_NAME, sha256: reportHash },
    schema: PHASE7A_R2_INSTALLED_CHROME_MANIFEST_SCHEMA,
  };
  validateManifest(manifest, 1234, reportHash, visuals, computerUseVisual);
  return {
    accessibility: { links: 8, method: "CDP Accessibility.getPartialAXTree", summaryRole: "DisclosureTriangle" },
    branch: PHASE7A_R2_BRANCH,
    canonicalJson: "PASS",
    computerUseProof: { screenshot: COMPUTER_USE_VISUAL.relativePath, status: "PASS" },
    focusStops: { forward: 9, reverse: 9 },
    parent: PHASE7A_R2_PARENT,
    repeatedCycles: 10,
    schema: PHASE7A_R2_INSTALLED_CHROME_SCHEMA,
    status: "PASS",
    targets: 9,
    zoom: "native 200 percent contract",
  };
}

function helpText() {
  return [
    "Phase 7A-R2 installed-Chrome Field Map capture",
    "",
    "Usage:",
    "  node scripts/capture-phase7a-r2-installed-chrome.mjs \\",
    "    --base-url <credential-free HTTP(S) origin> \\",
    "    --revision <exact lowercase R2 SHA40> \\",
    "    --output <fresh durable external directory> \\",
    "    --remote-debugging-port <loopback Chrome CDP port> \\",
    "    --baseline-width <observed 100% innerWidth> \\",
    "    --baseline-dpr <observed 100% devicePixelRatio> \\",
    "    --ui-zoom-label \"Zoom: 200%\" \\",
    "    --ui-proof-json <external Computer Use proof JSON> \\",
    "    --ui-proof-png <external Computer Use Chrome-window PNG>",
    "",
    `Computer Use JSON schema: ${PHASE7A_R2_COMPUTER_USE_UI_PROOF_SCHEMA}. It must bind one visible Google Chrome window, its title, one exact Zoom: 200% accessibility match, a canonical UTC capture time no older than 24 hours, and the supplied PNG's bytes/SHA-256/dimensions.`,
    "Use --self-test for pure write-free contract checks. The live path connects to an existing visible installed Google Chrome and captures page states through that attached page; it never launches, emulates, or controls the Windows UI directly.",
    "",
  ].join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  if (options.selfTest) {
    process.stdout.write(canonicalJson(selfTest()));
    return;
  }
  const result = await capture(options);
  process.stdout.write(canonicalJson({
    manifest: result.manifest,
    output: result.output,
    revision: result.report.revision,
    status: result.report.status,
    zoomProof: result.report.zoomProof,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write("Phase 7A-R2 installed-Chrome capture FAIL: " + (error?.stack ?? error) + "\n");
    process.exitCode = 1;
  });
}
