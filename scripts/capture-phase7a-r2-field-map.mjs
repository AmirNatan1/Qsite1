#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import axeCore from "axe-core";
import { chromium, firefox, webkit } from "playwright-core";
import sharp from "sharp";

import {
  PHASE7A_R2_AXE_SCHEMA,
  PHASE7A_R2_AXE_VERSION,
  PHASE7A_R2_FIELD_MAP_DESTINATIONS,
  PHASE7A_R2_FIELD_MAP_SCHEMA,
  PHASE7A_R2_LOCAL_CONTRAST_CASES,
  PHASE7A_R2_MINIMUM_TARGET_CSS_PIXELS,
  PHASE7A_R2_PARENT,
  PHASE7A_R2_SUMMARY_AX_NAME,
  PHASE7A_R2_SUMMARY_AX_ROLE,
  validateR2AxeAuthority,
  validateR2FieldMapFocusAuthority,
} from "./phase7a-r2-field-map-authority.mjs";
import { PHASE7A_R2_BRANCH, PHYSICAL_ASSETS } from "./phase7a-contract.mjs";
import { validateR2ContrastMaskPixels } from "./phase7a-r2-contrast-pixels.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HASH40 = /^[a-f0-9]{40}$/;
const ENGINES = Object.freeze({ chromium, firefox, webkit });
const DEFAULT_CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const RECORDING_DWELL_MS = 160;
const TARGET_VIEWPORT_EPSILON = 1;
const CONTRAST_DPR_EPSILON = 1e-6;
const MINIMUM_RECORDING_SECONDS = 2;
const MINIMUM_RECORDING_FRAMES = 24;
const REDUCED_MOTION_SCREENSHOT = "screenshots/chromium-reduced-motion.png";
const VIEWPORTS = Object.freeze([
  Object.freeze({ id: "desktop-1440x900", width: 1440, height: 900 }),
  Object.freeze({ id: "mobile-390x844", width: 390, height: 844 }),
  Object.freeze({ id: "narrow-320x800", width: 320, height: 800 }),
  Object.freeze({ id: "short-landscape-800x360", width: 800, height: 360 }),
]);
const FOCUS_ORDER = Object.freeze([
  Object.freeze({ element: "field-map-summary", name: null }),
  ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ focusName }) => Object.freeze({ element: "a", name: focusName })),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function externalDirectory(candidate) {
  const resolved = path.resolve(candidate);
  invariant(!within(ROOT, resolved), "R2 evidence must remain outside the repository");
  invariant(!within(os.tmpdir(), resolved), "R2 evidence must remain outside OS temporary storage");
  return resolved;
}

async function nearestExistingDirectory(candidate) {
  let current = path.resolve(candidate);
  while (true) {
    try {
      const entry = await lstat(current);
      invariant(entry.isDirectory(), `R2 evidence ancestor is not a directory: ${current}`);
      return current;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      invariant(parent !== current, `R2 evidence has no existing directory ancestor: ${candidate}`);
      current = parent;
    }
  }
}

async function assertRealExternalDirectory(candidate) {
  const resolved = path.resolve(candidate);
  const ancestor = await nearestExistingDirectory(path.dirname(resolved));
  const [realRoot, realTemporary, realAncestor] = await Promise.all([
    realpath(ROOT),
    realpath(os.tmpdir()),
    realpath(ancestor),
  ]);
  const projected = path.resolve(realAncestor, path.relative(ancestor, resolved));
  invariant(!within(realRoot, projected), "R2 evidence real path must remain outside the repository");
  invariant(!within(realTemporary, projected), "R2 evidence real path must remain outside OS temporary storage");
  return resolved;
}

function nextValue(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4397/",
    chromeExecutable: DEFAULT_CHROME,
    ffmpeg: "",
    ffprobe: "",
    firefoxExecutable: "",
    help: false,
    output: "",
    revision: "",
    selfTest: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--base-url") { options.baseUrl = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--chrome-executable") { options.chromeExecutable = path.resolve(nextValue(argv, index, flag)); index += 1; }
    else if (flag === "--ffmpeg") { options.ffmpeg = path.resolve(nextValue(argv, index, flag)); index += 1; }
    else if (flag === "--ffprobe") { options.ffprobe = path.resolve(nextValue(argv, index, flag)); index += 1; }
    else if (flag === "--firefox-executable") { options.firefoxExecutable = path.resolve(nextValue(argv, index, flag)); index += 1; }
    else if (flag === "--output") { options.output = externalDirectory(nextValue(argv, index, flag)); index += 1; }
    else if (flag === "--revision") { options.revision = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--timeout-ms") { options.timeoutMs = Number(nextValue(argv, index, flag)); index += 1; }
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  const base = new URL(options.baseUrl);
  invariant(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "--base-url must be credential-free HTTP(S)");
  base.hash = "";
  base.search = "";
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  options.baseUrl = base.toString();
  if (!options.ffprobe && options.ffmpeg) {
    options.ffprobe = path.join(path.dirname(options.ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  }
  invariant(Number.isInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms must be 5000..120000");
  if (!options.help && !options.selfTest) {
    invariant(options.output, "--output is required");
    invariant(HASH40.test(options.revision), "--revision must be an exact 40-character SHA");
    invariant(options.ffmpeg, "--ffmpeg is required");
    invariant(options.ffprobe, "--ffprobe is required or must be discoverable beside --ffmpeg");
  }
  return options;
}

function git(args) {
  const result = process.platform === "win32"
    ? execFileAsync("git.exe", args, { cwd: ROOT, encoding: "utf8" })
    : execFileAsync("git", args, { cwd: ROOT, encoding: "utf8" });
  return result.then(({ stdout }) => stdout.trim());
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filename) {
  return sha256(await readFile(filename));
}

function stableJson(value) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") return Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]));
    return item;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

async function writeJson(root, relative, value) {
  const filename = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, stableJson(value), "utf8");
  return filename;
}

async function exists(filename) {
  try { await access(filename); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function settle(page) {
  await page.waitForLoadState("load");
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded", null, { timeout: 4_000 }).catch(() => undefined);
  await page.waitForTimeout(100);
}

async function gotoRoute(page, baseUrl, route = "/about/") {
  await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "load" });
  await settle(page);
}

async function activeFocus(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const summary = document.querySelector("[data-field-map] > summary");
    if (active === summary) return { activeElement: "field-map-summary", activeDestinationName: null };
    if (active?.matches?.("[data-field-map] a[href]")) return {
      activeElement: "a",
      activeDestinationName: active.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    };
    if (active?.matches?.("[data-r2-outside-test]")) return { activeElement: "outside-test-control", activeDestinationName: null };
    return { activeElement: active?.tagName?.toLowerCase?.() ?? null, activeDestinationName: null };
  });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const map = document.querySelector("[data-field-map]");
    const trigger = map?.querySelector(":scope > summary");
    const visible = (node) => {
      if (!(node instanceof HTMLElement) || node.closest("[inert]")) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const describe = (node) => {
      if (node === trigger) return { element: "summary", name: "Field map", insideFieldMap: true };
      return { element: "a", name: node.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? null, insideFieldMap: Boolean(node.closest("[data-field-map]")) };
    };
    const active = document.activeElement;
    const activeElement = active === trigger ? "field-map-summary" : active?.matches?.("[data-field-map] a[href]") ? "a" : active?.matches?.("[data-r2-outside-test]") ? "outside-test-control" : active?.tagName?.toLowerCase?.() ?? null;
    const activeDestinationName = active?.matches?.("[data-field-map] a[href]") ? active.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? null : null;
    const destinations = [...(map?.querySelectorAll("a[href]") ?? [])].map((link) => {
      const style = getComputedStyle(link);
      const rect = link.getBoundingClientRect();
      return {
        href: link.getAttribute("href"),
        accessibleName: link.getAttribute("aria-label") ?? link.textContent?.replace(/\s+/g, " ").trim() ?? "",
        focusName: link.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
        focusable: link.tabIndex >= 0 && !link.closest("[inert]"),
        axRole: null,
      };
    });
    const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex=\"-1\"])";
    const backgroundFocusable = [...document.querySelectorAll(focusableSelector)].filter((node) => !node.closest("[data-field-map]") && visible(node));
    return {
      open: Boolean(map?.open),
      rootOpen: document.documentElement.hasAttribute("data-field-map-open"),
      backgroundRegionCount: document.querySelectorAll("[data-field-map-background]").length,
      inertRegionCount: document.querySelectorAll("[data-field-map-background][inert]").length,
      ownedInertCount: document.querySelectorAll("[data-field-map-background][data-field-map-inert-owned]").length,
      backgroundFocusableCount: backgroundFocusable.length,
      activeElement,
      activeDestinationName,
      trigger: {
        tag: trigger?.tagName?.toLowerCase() ?? null,
        ariaControls: trigger?.getAttribute("aria-controls") ?? null,
        ariaHasPopup: trigger?.getAttribute("aria-haspopup") ?? null,
        authoredAriaExpanded: trigger?.getAttribute("aria-expanded") ?? null,
      },
      destinations,
      focusableInventory: [trigger, ...destinations.map((_, index) => map?.querySelectorAll("a[href]")[index])].filter(visible).map(describe),
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) > document.documentElement.clientWidth + 1,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
}

async function fullControlInventory(page, identity) {
  const expectedControls = [
    { selector: "[data-field-map] > summary", href: null, accessibleName: "Field map", elementType: "summary" },
    ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ href, name }) => ({
      selector: `[data-field-map] a[href="${href}"]`,
      href,
      accessibleName: name,
      elementType: "a",
    })),
  ];
  return page.evaluate(async ({ stateIdentity, expected, minimum, epsilon }) => {
    const controls = [document.querySelector("[data-field-map] > summary"), ...document.querySelectorAll("[data-field-map] a[href]")];
    const records = [];
    for (const [index, control] of controls.entries()) {
      if (!(control instanceof HTMLElement)) {
        records.push(null);
        continue;
      }
      if (index > 0) {
        control.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      const rect = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      const href = control.tagName === "A" ? control.getAttribute("href") : null;
      const selector = index === 0 ? "[data-field-map] > summary" : `[data-field-map] a[href="${href}"]`;
      const accessibleName = index === 0
        ? control.textContent?.replace(/\b(?:Open|Close)\b/g, "").replace(/\s+/g, " ").trim() ?? ""
        : control.getAttribute("aria-label") ?? control.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const visible = style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0
        && !control.closest("[inert]");
      const fullyInViewport = rect.left >= -epsilon
        && rect.top >= -epsilon
        && rect.right <= innerWidth + epsilon
        && rect.bottom <= innerHeight + epsilon;
      const intersectsViewport = rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const hit = centerX >= 0 && centerX < innerWidth && centerY >= 0 && centerY < innerHeight
        ? document.elementFromPoint(centerX, centerY)
        : null;
      const intendedInteractive = control.matches("summary") || control.matches("a[href]");
      records.push({
        selector,
        href,
        accessibleName,
        elementType: control.tagName.toLowerCase(),
        width: rect.width,
        height: rect.height,
        visible,
        intendedInteractive,
        focusable: control.tabIndex >= 0,
        fullyInViewport,
        intersectsViewport,
        unoccluded: hit === control || Boolean(hit && control.contains(hit)),
        measuredScrollPosition: { x: scrollX, y: scrollY, planeY: document.querySelector(".field-map__plane")?.scrollTop ?? null },
      });
    }
    const identityExact = records.length === expected.length && records.every((record, index) => record
      && record.selector === expected[index].selector
      && record.href === expected[index].href
      && record.accessibleName === expected[index].accessibleName
      && record.elementType === expected[index].elementType);
    const controlsPass = identityExact && records.every((record) => record.visible
      && record.intendedInteractive
      && record.focusable
      && record.fullyInViewport
      && record.intersectsViewport
      && record.unoccluded
      && record.width >= minimum
      && record.height >= minimum);
    return {
      ...stateIdentity,
      viewport: { id: stateIdentity.id, width: innerWidth, height: innerHeight },
      genuineInstalledChrome: false,
      nativeZoomPercent: null,
      candidateCount: records.length,
      controls: records,
      identityExact,
      status: controlsPass ? "PASS" : "FAIL",
    };
  }, {
    stateIdentity: identity,
    expected: expectedControls,
    minimum: PHASE7A_R2_MINIMUM_TARGET_CSS_PIXELS,
    epsilon: TARGET_VIEWPORT_EPSILON,
  });
}

function axProperty(node, name) {
  return node?.properties?.find((property) => property.name === name)?.value?.value ?? null;
}

async function accessibilityTree(page) {
  const session = await page.context().newCDPSession(page);
  let nodes;
  let summaryNodes;
  let summaryBackendNodeId;
  try {
    await session.send("Accessibility.enable");
    await session.send("DOM.enable");
    const { root } = await session.send("DOM.getDocument", { depth: 0, pierce: true });
    const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-field-map] > summary" });
    invariant(nodeId > 0, "R2 Field Map summary DOM node is missing from CDP");
    const { node } = await session.send("DOM.describeNode", { nodeId });
    summaryBackendNodeId = node.backendNodeId;
    ({ nodes: summaryNodes } = await session.send("Accessibility.getPartialAXTree", { backendNodeId: summaryBackendNodeId, fetchRelatives: false }));
    ({ nodes } = await session.send("Accessibility.getFullAXTree"));
  } finally {
    await session.detach();
  }
  const summaryMatches = summaryNodes.filter((node) => node.backendDOMNodeId === summaryBackendNodeId);
  invariant(summaryMatches.length === 1, "R2 Field Map summary accessibility-tree identity differs");
  const summary = summaryMatches[0];
  invariant(summary.role?.value === PHASE7A_R2_SUMMARY_AX_ROLE && summary.name?.value === PHASE7A_R2_SUMMARY_AX_NAME, "R2 Field Map summary accessibility-tree role/name differs");
  const links = nodes.filter((node) => node.role?.value === "link" && PHASE7A_R2_FIELD_MAP_DESTINATIONS.some(({ name }) => name === node.name?.value));
  return {
    trigger: {
      axRole: summary?.role?.value ?? null,
      axName: summary?.name?.value ?? null,
      axExpanded: axProperty(summary, "expanded"),
      axHasPopup: axProperty(summary, "hasPopup"),
    },
    links: PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ name }) => {
      const node = links.find((candidate) => candidate.name?.value === name);
      return { role: node?.role?.value ?? null, name: node?.name?.value ?? null };
    }),
  };
}

async function openMap(page, mechanism = "Enter") {
  const summary = page.locator("[data-field-map] > summary");
  await summary.focus();
  await summary.press(mechanism);
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-field-map-open"));
  await page.waitForFunction(() => document.activeElement?.matches?.("[data-field-map] a[href]"));
}

async function closeWithEscape(page) {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-field-map-open"));
}

async function exerciseFocus(page, { cycles = 10, dwellMs = 0 } = {}) {
  invariant(Number.isInteger(dwellMs) && dwellMs >= 0 && dwellMs <= 1_000, "R2 focus dwell must be 0..1000ms");
  const dwell = async () => { if (dwellMs > 0) await page.waitForTimeout(dwellMs); };
  const initialFocusedElement = await page.evaluate(() => {
    document.querySelector("[data-field-map] > summary")?.focus();
    return document.activeElement?.tagName?.toLowerCase() ?? null;
  });
  await openMap(page, "Enter");
  await dwell();
  const opened = await snapshot(page);
  const forwardCycle = [{ step: 1, ...await activeFocus(page) }];
  for (let step = 2; step <= 10; step += 1) {
    await page.keyboard.press("Tab");
    await dwell();
    forwardCycle.push({ step, ...await activeFocus(page) });
  }
  const forwardBodyStops = forwardCycle.filter(({ activeElement }) => activeElement === "body").length;
  const expectedForwardCycle = [
    { activeElement: "a", activeDestinationName: "About" },
    { activeElement: "a", activeDestinationName: "Contact" },
    { activeElement: "field-map-summary", activeDestinationName: null },
    ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.slice(0, 6).map(({ focusName }) => ({ activeElement: "a", activeDestinationName: focusName })),
    { activeElement: "a", activeDestinationName: "About" },
  ];
  const forwardOrderExact = forwardCycle.every((record, index) => record.activeElement === expectedForwardCycle[index]?.activeElement
    && (record.activeDestinationName ?? null) === expectedForwardCycle[index]?.activeDestinationName);

  await page.locator("[data-field-map] > summary").focus();
  await dwell();
  await page.keyboard.press("Shift+Tab");
  await dwell();
  const reverseFromSummary = await activeFocus(page);
  const reverseCycle = [{ step: 1, ...reverseFromSummary }];
  for (let step = 2; step <= 9; step += 1) {
    await page.keyboard.press("Shift+Tab");
    await dwell();
    reverseCycle.push({ step, ...await activeFocus(page) });
  }
  const reverseBodyStops = reverseCycle.filter(({ activeElement }) => activeElement === "body").length;
  const expectedReverseCycle = [
    ...[...PHASE7A_R2_FIELD_MAP_DESTINATIONS].reverse().map(({ focusName }) => ({ activeElement: "a", activeDestinationName: focusName })),
    { activeElement: "field-map-summary", activeDestinationName: null },
  ];
  const reverseOrderExact = reverseCycle.every((record, index) => record.activeElement === expectedReverseCycle[index]?.activeElement
    && (record.activeDestinationName ?? null) === expectedReverseCycle[index]?.activeDestinationName);

  await page.evaluate(() => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.r2OutsideTest = "true";
    button.textContent = "Outside test control";
    button.style.cssText = "position:fixed;left:-200vw;top:0;width:44px;height:44px";
    document.body.append(button);
    button.focus();
  });
  await dwell();
  const outsideRecapture = await activeFocus(page);
  await closeWithEscape(page);
  await dwell();
  const escape = await snapshot(page);
  const postCloseOutsideFocus = await page.evaluate(() => {
    const button = document.querySelector("[data-r2-outside-test]");
    button?.focus();
    const value = document.activeElement === button ? "outside-test-control" : document.activeElement?.tagName?.toLowerCase() ?? null;
    button?.remove();
    return value;
  });

  const repeatedCycles = [];
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    await openMap(page, cycle % 2 === 0 ? "Space" : "Enter");
    await dwell();
    const cycleOpen = await snapshot(page);
    await page.keyboard.press("Tab");
    await dwell();
    const oneStepAfterOpen = await activeFocus(page);
    await page.evaluate(() => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.r2OutsideTest = "true";
      button.textContent = "Outside test control";
      button.style.cssText = "position:fixed;left:-200vw;top:0;width:44px;height:44px";
      document.body.append(button);
      button.focus();
    });
    await dwell();
    const recaptured = await activeFocus(page);
    await closeWithEscape(page);
    await dwell();
    const cycleClosed = await snapshot(page);
    const retained = await page.evaluate(() => {
      const button = document.querySelector("[data-r2-outside-test]");
      button?.focus();
      const result = document.activeElement === button;
      button?.remove();
      return result;
    });
    repeatedCycles.push({
      cycle,
      mechanism: cycle % 2 === 0 ? "Space" : "Enter",
      controller: await page.locator("[data-field-map]").getAttribute("data-controller"),
      opened: cycleOpen,
      oneStepAfterOpen,
      outsideRecapture: recaptured,
      closed: cycleClosed,
      postCloseOutsideRetained: retained,
    });
  }

  const duplicateBindingInvariant = {
    method: "After each open, one Tab must advance exactly one position from About to Contact; duplicate key handlers would advance more than one position.",
    cycles,
    status: repeatedCycles.every(({ controller, oneStepAfterOpen }) => controller === "ready"
      && oneStepAfterOpen.activeElement === "a"
      && oneStepAfterOpen.activeDestinationName === "Contact") ? "PASS" : "FAIL",
  };

  return {
    initialFocusedElement,
    openMechanism: "Enter",
    opened,
    initial: forwardCycle[0],
    forwardCycle,
    reverseFromSummary,
    reverseCycle,
    outsideRecapture,
    escape,
    postCloseOutsideFocus,
    repeatedCycles,
    duplicateBindingInvariant,
    bodyStops: { forward: forwardBodyStops, reverse: reverseBodyStops },
    status: initialFocusedElement === "summary"
      && forwardBodyStops === 0
      && reverseBodyStops === 0
      && forwardOrderExact
      && reverseOrderExact
      && outsideRecapture.activeElement === "a"
      && escape.activeElement === "field-map-summary"
      && escape.inertRegionCount === 0
      && postCloseOutsideFocus === "outside-test-control"
      && repeatedCycles.length === cycles
      && duplicateBindingInvariant.status === "PASS"
      && repeatedCycles.every(({ opened: stateOpen, outsideRecapture: recapture, closed, postCloseOutsideRetained }) => stateOpen.backgroundFocusableCount === 0 && recapture.activeElement === "a" && closed.inertRegionCount === 0 && closed.ownedInertCount === 0 && postCloseOutsideRetained)
      ? "PASS" : "FAIL",
  };
}

async function matrixCase(browser, baseUrl, viewport, engine, timeoutMs, reducedMotion = false) {
  const context = await browser.newContext({ viewport, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await gotoRoute(page, baseUrl, "/about/");
  const focus = await exerciseFocus(page, { cycles: 1 });
  const target = await openMapAndTargets(page, viewport, reducedMotion);
  await closeWithEscape(page);
  await context.close();
  return { engine, viewport, reducedMotion, focus, target, status: focus.status === "PASS" && target.status === "PASS" ? "PASS" : "FAIL" };
}

async function openMapAndTargets(page, viewport, reducedMotion) {
  if (!await page.evaluate(() => document.documentElement.hasAttribute("data-field-map-open"))) await openMap(page);
  return fullControlInventory(page, {
    id: `field-map-open-${reducedMotion ? "reduced-motion-" : ""}${viewport.id}`,
    route: "/about/",
    state: reducedMotion ? "field-map-open-reduced-motion" : "field-map-open",
  });
}

async function noJavaScriptCase(browser, baseUrl, timeoutMs, staging) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await gotoRoute(page, baseUrl, "/about/");
  const summary = page.locator("[data-field-map] > summary");
  await summary.focus();
  await summary.press("Enter");
  await page.waitForFunction(() => document.querySelector("[data-field-map]")?.open === true);
  await page.waitForTimeout(100);
  const screenshotRelative = "screenshots/chromium-no-javascript-native-open.png";
  await mkdir(path.join(staging, "screenshots"), { recursive: true });
  await page.screenshot({ path: path.join(staging, ...screenshotRelative.split("/")), fullPage: false });
  const state = await snapshot(page);
  const tree = await accessibilityTree(page);
  const destinations = await page.evaluate(() => [...document.querySelectorAll("[data-field-map] a[href]")].map((link) => {
    const rect = link.getBoundingClientRect();
    const style = getComputedStyle(link);
    return {
      href: link.getAttribute("href"),
      accessibleName: link.getAttribute("aria-label"),
      visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
      fullyInViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      unoccluded: (() => { const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2)), Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2))); return hit === link || link.contains(hit); })(),
    };
  }));
  const report = {
    controller: await page.locator("[data-field-map]").getAttribute("data-controller"),
    nativeDetailsOpen: state.open,
    horizontalOverflow: state.horizontalOverflow,
    trigger: {
      ...state.trigger,
      axRole: tree.trigger.axRole,
      axName: tree.trigger.axName,
      axExpanded: tree.trigger.axExpanded,
    },
    destinations,
  };
  await context.close();
  return { authority: report, screenshot: screenshotRelative };
}

async function reducedMotionScreenshotCase(browser, baseUrl, timeoutMs, staging) {
  const viewport = { width: 1440, height: 900 };
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await gotoRoute(page, baseUrl, "/about/");
  const mediaMatches = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  invariant(mediaMatches, "R2 Chromium reduced-motion emulation did not reach the page");
  await openMap(page);
  await page.waitForTimeout(RECORDING_DWELL_MS);
  await mkdir(path.join(staging, "screenshots"), { recursive: true });
  const png = await page.screenshot({ path: path.join(staging, ...REDUCED_MOTION_SCREENSHOT.split("/")), fullPage: false });
  const state = await snapshot(page);
  const status = png.length > 0
    && state.viewport.width === viewport.width
    && state.viewport.height === viewport.height
    && state.open === true
    && state.rootOpen === true
    && state.activeElement === "a"
    && state.activeDestinationName === "About"
    && state.inertRegionCount === state.backgroundRegionCount
    && state.ownedInertCount === state.backgroundRegionCount
    && state.horizontalOverflow === false
    ? "PASS" : "FAIL";
  invariant(status === "PASS", "R2 Chromium reduced-motion Field Map screenshot state differs");
  await context.close();
  return {
    engine: "chromium",
    route: "/about/",
    state: "field-map-open-reduced-motion",
    viewport,
    mediaMatches,
    screenshot: REDUCED_MOTION_SCREENSHOT,
    bytes: png.length,
    open: state.open,
    activeDestinationName: state.activeDestinationName,
    inertRegionCount: state.inertRegionCount,
    backgroundRegionCount: state.backgroundRegionCount,
    horizontalOverflow: state.horizontalOverflow,
    status,
  };
}

function cleanupState(state) {
  return {
    open: state.open,
    rootOpen: state.rootOpen,
    backgroundRegionCount: state.backgroundRegionCount,
    inertRegionCount: state.inertRegionCount,
    ownedInertCount: state.ownedInertCount,
    activeElement: state.activeElement,
  };
}

function cleanupPassed(state) {
  return Number.isInteger(state.backgroundRegionCount)
    && state.backgroundRegionCount >= 3
    && state.open === false
    && state.rootOpen === false
    && state.inertRegionCount === 0
    && state.ownedInertCount === 0;
}

async function linkNavigationCase(browser, baseUrl, timeoutMs) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await gotoRoute(page, baseUrl, "/about/");
  await page.evaluate(() => {
    sessionStorage.removeItem("phase7a-r2-pre-navigation-cleanup");
    sessionStorage.removeItem("phase7a-r2-pagehide-cleanup");
    const current = () => ({
      open: Boolean(document.querySelector("[data-field-map]")?.open),
      rootOpen: document.documentElement.hasAttribute("data-field-map-open"),
      inertRegionCount: document.querySelectorAll("[data-field-map-background][inert]").length,
      ownedInertCount: document.querySelectorAll("[data-field-map-background][data-field-map-inert-owned]").length,
    });
    addEventListener("pagehide", () => {
      sessionStorage.setItem("phase7a-r2-pagehide-cleanup", JSON.stringify(current()));
    }, { once: true });
  });
  await openMap(page);
  await page.evaluate(() => {
    const current = () => ({
      open: Boolean(document.querySelector("[data-field-map]")?.open),
      rootOpen: document.documentElement.hasAttribute("data-field-map-open"),
      inertRegionCount: document.querySelectorAll("[data-field-map-background][inert]").length,
      ownedInertCount: document.querySelectorAll("[data-field-map-background][data-field-map-inert-owned]").length,
    });
    document.addEventListener("click", (event) => {
      const link = event.target instanceof Element ? event.target.closest('[data-field-map] a[href="/contact/"]') : null;
      if (link) sessionStorage.setItem("phase7a-r2-pre-navigation-cleanup", JSON.stringify(current()));
    }, { once: true });
  });
  const before = cleanupState(await snapshot(page));
  const navigationPromise = page.waitForNavigation({ waitUntil: "load" });
  await page.locator('[data-field-map] a[href="/contact/"]').click();
  const response = await navigationPromise;
  await settle(page);
  const after = cleanupState(await snapshot(page));
  const destinationFocus = await activeFocus(page);
  const witness = await page.evaluate(() => ({
    preNavigation: JSON.parse(sessionStorage.getItem("phase7a-r2-pre-navigation-cleanup") ?? "null"),
    pagehide: JSON.parse(sessionStorage.getItem("phase7a-r2-pagehide-cleanup") ?? "null"),
    pathname: location.pathname,
  }));
  const responseStatus = response?.status() ?? null;
  const witnessClean = (record) => record?.open === false
    && record.rootOpen === false
    && record.inertRegionCount === 0
    && record.ownedInertCount === 0;
  const status = before.open === true
    && before.inertRegionCount === before.backgroundRegionCount
    && before.ownedInertCount === before.backgroundRegionCount
    && witnessClean(witness.preNavigation)
    && witnessClean(witness.pagehide)
    && cleanupPassed(after)
    && witness.pathname === "/contact/"
    && responseStatus === 200
    ? "PASS" : "FAIL";
  await context.close();
  return {
    route: "/about/",
    activatedSelector: '[data-field-map] a[href="/contact/"]',
    destination: "/contact/",
    responseStatus,
    before,
    preNavigationCleanupWitness: witness.preNavigation,
    pagehideCleanupWitness: witness.pagehide,
    after,
    activeElementAfterNavigation: destinationFocus,
    status,
  };
}

async function lifecycleCleanupCase(browser, baseUrl, timeoutMs) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await gotoRoute(page, baseUrl, "/about/");
  const cases = [];

  await openMap(page);
  await page.evaluate(() => { location.hash = "phase7a-r2-hashchange"; });
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-field-map-open"));
  cases.push({ event: "hashchange", delivery: "real same-document hash navigation", state: cleanupState(await snapshot(page)) });
  await page.evaluate(() => history.replaceState({}, "", "/about/"));

  await page.evaluate(() => history.pushState({}, "", "#phase7a-r2-popstate"));
  await openMap(page);
  await page.goBack();
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-field-map-open"));
  cases.push({ event: "popstate", delivery: "real history traversal", state: cleanupState(await snapshot(page)) });

  for (const eventName of ["pagehide", "pageshow"]) {
    await openMap(page);
    await page.evaluate((name) => {
      dispatchEvent(new PageTransitionEvent(name, { persisted: false }));
    }, eventName);
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-field-map-open"));
    cases.push({
      event: eventName,
      delivery: "scripted PageTransitionEvent listener exercise; not BFCache authority",
      state: cleanupState(await snapshot(page)),
    });
  }
  const status = cases.length === 4 && cases.every(({ state }) => cleanupPassed(state)) ? "PASS" : "FAIL";
  await context.close();
  return { route: "/about/", cases, status };
}

function luminance(hex) {
  const values = hex.replace("#", "").match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function manualContrastPairs() {
  return [
    { id: "closed-header-white-over-authored-upper-bound", foreground: "#ffffff", background: "#242424", threshold: 4.5 },
    { id: "closed-header-muted-over-authored-upper-bound", foreground: "#8a9797", background: "#242424", threshold: 4.5 },
    { id: "manifesto-white-over-live-magenta", foreground: "#ffffff", background: "#d82b72", threshold: 3 },
  ].map((pair) => ({ ...pair, ratio: Number(contrast(pair.foreground, pair.background).toFixed(3)) }));
}

function manualContrastAuthority(selectorMeasurements, bindings) {
  const pairs = manualContrastPairs();
  return {
    method: "WCAG 2.x relative luminance; the closed header uses a channel-wise #242424 upper bound derived from rgba(8,11,12,0.9) over any clipped backdrop; the manifesto uses its authored live-magenta pair; every incomplete over complex home or open-Field-Map material is bound one-to-one to an engine-local masked screenshot using temporary color:transparent and -webkit-text-fill-color:transparent while preserving layout, element backgrounds and pseudo-elements",
    pairs,
    selectorMeasurements,
    bindings,
    status: pairs.every(({ ratio, threshold }) => ratio >= threshold)
      && selectorMeasurements.length === 4
      && selectorMeasurements.every(({ status }) => status === "PASS")
      && bindings.length > 0 ? "PASS" : "FAIL",
  };
}

function contrastAuthorityForIncompleteNode(state, node) {
  invariant(Array.isArray(node?.target) && node.target.length === 1 && typeof node.target[0] === "string", `R2 axe ${state} target shape differs`);
  const target = node.target[0];
  const local = PHASE7A_R2_LOCAL_CONTRAST_CASES.find((record) => record.state === state)?.selectors.find(({ selector }) => selector === target);
  if (local) return { authorityKind: "selector-local", authorityId: local.id };
  if (state === "reduced-motion-home") {
    if (target === ".field-map__trigger-label" || target === ".brand-link > span") return { authorityKind: "fixed-pair", authorityId: "closed-header-white-over-authored-upper-bound" };
    if (target === ".field-map__trigger-state") return { authorityKind: "fixed-pair", authorityId: "closed-header-muted-over-authored-upper-bound" };
    const manifestoTarget = /^(?:\.manifesto-line--(?:one|two|three)\s*>\s*\.manifesto-word(?::nth-child\([123]\))?|\.manifesto-word(?:--contact|:nth-child\(3\)))$/;
    if (manifestoTarget.test(target)) return { authorityKind: "fixed-pair", authorityId: "manifesto-white-over-live-magenta" };
  }
  return null;
}

function bindIncompleteContrast(result, engine, route, state) {
  const bindings = [];
  for (const incomplete of result.incomplete) {
    invariant(incomplete.id === "color-contrast" && incomplete.impact !== "critical", `R2 axe ${state} contains unsupported incomplete ${incomplete.id}`);
    invariant(Array.isArray(incomplete.nodes) && incomplete.nodes.length > 0, `R2 axe ${state} incomplete has no nodes`);
    for (const node of incomplete.nodes) {
      const authority = contrastAuthorityForIncompleteNode(state, node);
      invariant(authority, `R2 axe ${state} color-contrast target is not bound to a governed production selector: ${(node.target ?? []).flat(Infinity).join(" ")}`);
      bindings.push({ engine, route, state, target: node.target, ...authority });
    }
  }
  return bindings;
}

function compactCssColor(value) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function parseCssColor(value) {
  const match = /^(?:rgb|rgba)\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/.exec(value);
  invariant(match, `R2 selector-local foreground color is unsupported: ${value}`);
  return { channels: match.slice(1, 4).map(Number), alpha: match[4] === undefined ? 1 : Number(match[4]) };
}

function rgbHex(channels) {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function rgbLuminance(channels) {
  const values = channels.map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function rgbContrast(first, second) {
  const values = [rgbLuminance(first), rgbLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function assertContrastBindingOwnership(page, bindings) {
  const rows = await page.evaluate((records) => records.map((record) => {
    const selector = record.target[0];
    let nodes;
    try { nodes = document.querySelectorAll(selector); } catch { return { selector, count: -1, governed: false }; }
    const node = nodes[0] ?? null;
    const governed = nodes.length === 1 && (record.authorityKind === "selector-local"
      ? record.state === "field-map-open"
        ? node?.closest?.("[data-field-map]") instanceof Element
        : node?.closest?.("[data-field-map-threshold]") instanceof Element
      : record.state === "reduced-motion-home"
        && (selector === ".brand-link > span" || selector.startsWith(".field-map__trigger-") || node?.closest?.("#home-title") instanceof Element));
    return { selector, count: nodes.length, governed };
  }), bindings);
  for (const row of rows) invariant(row.count === 1 && row.governed === true, `R2 axe contrast target is not uniquely owned by its governed region: ${row.selector}`);
}

async function selectorLocalContrastMeasurement(page, engine, contrastCase, screenshotPath) {
  const screenshotRelativePath = `screenshots/${engine}-${contrastCase.id}-background-mask.png`;
  const originalScrollY = await page.evaluate(() => scrollY);
  if (contrastCase.state === "reduced-motion-home") {
    await page.evaluate(() => document.querySelector("[data-field-map-threshold]")?.scrollIntoView({ block: "start" }));
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const observedViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, observedDevicePixelRatio: devicePixelRatio }));
  invariant(observedViewport.width === 1440 && observedViewport.height === 900
    && Math.abs(observedViewport.observedDevicePixelRatio - 1) <= CONTRAST_DPR_EPSILON, `R2 ${engine} selector-local contrast viewport differs: ${JSON.stringify(observedViewport)}`);
  const viewport = {
    width: observedViewport.width,
    height: observedViewport.height,
    deviceScaleFactor: Number(observedViewport.observedDevicePixelRatio.toFixed(6)),
  };
  const selectors = contrastCase.selectors.map(({ selector }) => selector);
  const geometry = await page.evaluate((records) => records.map(({ id, selector, foreground, threshold }) => {
    const element = document.querySelector(selector);
    if (!(element instanceof Element)) return { id, selector, missing: true };
    const rect = element.getBoundingClientRect();
    const rounded = Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, Number(rect[key].toFixed(3))]));
    return { id, selector, foreground: getComputedStyle(element).color.replace(/\s+/g, "").toLowerCase(), expectedForeground: foreground, threshold, rect: rounded, missing: false };
  }), contrastCase.selectors);
  for (const record of geometry) {
    invariant(record.missing === false && record.foreground === record.expectedForeground, `R2 ${engine} selector-local foreground differs: ${record.selector}`);
    invariant(record.rect.x >= 0 && record.rect.y >= 0 && record.rect.width > 0 && record.rect.height > 0
      && record.rect.x + record.rect.width <= viewport.width + 0.01
      && record.rect.y + record.rect.height <= viewport.height + 0.01, `R2 ${engine} selector-local rectangle escapes the viewport: ${record.selector}`);
  }

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  const mask = await page.addStyleTag({ content: `${selectors.join(",")} { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }` });
  let png;
  try {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    png = await page.screenshot({ path: screenshotPath, type: "png" });
  } finally {
    await mask.evaluate((node) => node.remove()).catch(() => undefined);
    await page.evaluate((y) => scrollTo(0, y), originalScrollY).catch(() => undefined);
  }
  const decoded = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  invariant(decoded.info.width === viewport.width && decoded.info.height === viewport.height && decoded.info.channels === 3, `R2 ${engine} selector-local screenshot decode differs`);

  const samples = geometry.map((record) => {
    const pixelBounds = {
      x0: Math.floor(record.rect.x),
      y0: Math.floor(record.rect.y),
      x1: Math.ceil(record.rect.x + record.rect.width),
      y1: Math.ceil(record.rect.y + record.rect.height),
    };
    const foreground = parseCssColor(record.foreground);
    let minimumRatio = Number.POSITIVE_INFINITY;
    let worstBackground = null;
    let worstComposite = null;
    for (let y = pixelBounds.y0; y < pixelBounds.y1; y += 1) {
      for (let x = pixelBounds.x0; x < pixelBounds.x1; x += 1) {
        const offset = (y * decoded.info.width + x) * decoded.info.channels;
        const background = [decoded.data[offset], decoded.data[offset + 1], decoded.data[offset + 2]];
        const composite = foreground.channels.map((channel, index) => Math.round(channel * foreground.alpha + background[index] * (1 - foreground.alpha)));
        const ratio = rgbContrast(composite, background);
        if (ratio < minimumRatio) {
          minimumRatio = ratio;
          worstBackground = background;
          worstComposite = composite;
        }
      }
    }
    const sampledPixelCount = (pixelBounds.x1 - pixelBounds.x0) * (pixelBounds.y1 - pixelBounds.y0);
    invariant(sampledPixelCount > 0 && worstBackground && worstComposite && minimumRatio >= record.threshold, `R2 ${engine} selector-local contrast fails: ${record.selector}`);
    return {
      id: record.id,
      selector: record.selector,
      foreground: record.foreground,
      threshold: record.threshold,
      rect: record.rect,
      pixelBounds,
      sampledPixelCount,
      worstBackground: rgbHex(worstBackground),
      compositedForeground: rgbHex(worstComposite),
      minimumRatio: Number(minimumRatio.toFixed(3)),
      status: "PASS",
    };
  });
  const measurement = {
    engine,
    route: contrastCase.route,
    state: contrastCase.state,
    viewport,
    maskingMethod: "temporary color:transparent and -webkit-text-fill-color:transparent on every exact selector-local axe-incomplete text selector; layout, element backgrounds and pseudo-elements preserved; screenshot pixels sampled beneath original element bounding boxes",
    screenshot: {
      path: screenshotRelativePath,
      bytes: png.length,
      sha256: createHash("sha256").update(png).digest("hex"),
      width: decoded.info.width,
      height: decoded.info.height,
    },
    samples,
    status: samples.every(({ status }) => status === "PASS") ? "PASS" : "FAIL",
  };
  validateR2ContrastMaskPixels({ data: decoded.data, info: decoded.info, measurement });
  return measurement;
}

async function productionContrastSelectorBinding(page, state) {
  const localRecords = PHASE7A_R2_LOCAL_CONTRAST_CASES.find((record) => record.state === state)?.selectors ?? [];
  const binding = await page.evaluate(({ caseState, localRecords: browserLocalRecords }) => {
    const compactColor = (value) => value.replace(/\s+/g, "").toLowerCase();
    const canonicalHex = (value) => {
      const compact = value.trim().toLowerCase();
      const shorthand = /^#([a-f\d])([a-f\d])([a-f\d])$/.exec(compact);
      return shorthand ? `#${shorthand[1]}${shorthand[1]}${shorthand[2]}${shorthand[2]}${shorthand[3]}${shorthand[3]}` : compact;
    };
    const root = getComputedStyle(document.documentElement);
    const tokens = {
      white: canonicalHex(root.getPropertyValue("--q-white")),
      muted: canonicalHex(root.getPropertyValue("--q-neutral-400")),
      magenta: canonicalHex(root.getPropertyValue("--q-magenta")),
    };
    if (caseState === "field-map-open") {
      const plane = document.querySelector(".field-map__plane");
      const active = document.querySelector('.field-map-destination[aria-current="page"]');
      const white = [...document.querySelectorAll("[data-field-map] .field-map__trigger-label, [data-field-map] a > strong")];
      const muted = [...document.querySelectorAll("[data-field-map] .field-map__trigger-state, [data-field-map] .field-map__heading > p, [data-field-map] a > span, [data-field-map] .field-map__legend")];
      if (![plane, active].every((node) => node instanceof Element) || white.length !== 9 || muted.length !== 20) return { state: caseState, missing: true, tokens };
      const planeStyle = getComputedStyle(plane);
      return {
        state: caseState,
        missing: false,
        tokens,
        selectors: [".field-map__plane", "[data-field-map] .field-map__trigger-label", "[data-field-map] a > strong", "[data-field-map] .field-map__trigger-state", "[data-field-map] .field-map__heading > p", "[data-field-map] a > span", "[data-field-map] .field-map__legend", '.field-map-destination[aria-current="page"]'],
        observed: {
          planeBackgroundColor: compactColor(planeStyle.backgroundColor),
          planeBackgroundImage: compactColor(planeStyle.backgroundImage),
          mutedColors: [...new Set(muted.map((node) => compactColor(getComputedStyle(node).color)))],
          whiteColors: [...new Set(white.map((node) => compactColor(getComputedStyle(node).color)))],
          activeBackgroundImage: compactColor(getComputedStyle(active).backgroundImage),
        },
        conservativeComposite: null,
      };
    }
    const header = document.querySelector(".site-header");
    const heading = document.querySelector("#home-title");
    const contact = document.querySelector(".manifesto-word--contact");
    const threshold = document.querySelector(".field-map-threshold");
    const local = browserLocalRecords.map(({ id, selector, foreground }) => {
      const node = document.querySelector(selector);
      return { id, selector, foreground, color: node instanceof Element ? compactColor(getComputedStyle(node).color) : null };
    });
    if (![header, heading, contact, threshold].every((node) => node instanceof Element) || local.some(({ color }) => color === null)) return { state: caseState, missing: true, tokens };
    return {
      state: caseState,
      missing: false,
      tokens,
      selectors: [".site-header", "#home-title", ".manifesto-word--contact::after", ".field-map-threshold", ...local.map(({ selector }) => selector)],
      observed: {
        headerBackgroundColor: compactColor(getComputedStyle(header).backgroundColor),
        headingColor: compactColor(getComputedStyle(heading).color),
        liveSignalColor: compactColor(getComputedStyle(contact, "::after").backgroundColor),
        thresholdBackgroundColor: compactColor(getComputedStyle(threshold).backgroundColor),
        local,
      },
      conservativeComposite: null,
    };
  }, { caseState: state, localRecords });
  invariant(binding.missing === false, `R2 ${state} manual-contrast selectors are missing`);
  invariant(binding.tokens.white === "#ffffff" && binding.tokens.muted === "#8a9797" && binding.tokens.magenta === "#d82b72", `R2 ${state} production contrast tokens differ`);
  if (state === "field-map-open") {
    invariant(binding.observed.planeBackgroundColor === "rgb(9,12,13)", "R2 Field Map plane background differs");
    invariant(binding.observed.planeBackgroundImage.includes("rgba(86,52,63,0.15)"), "R2 Field Map layered plane differs");
    invariant(JSON.stringify(binding.observed.mutedColors) === JSON.stringify(["rgb(138,151,151)"]) && JSON.stringify(binding.observed.whiteColors) === JSON.stringify(["rgb(255,255,255)"]), "R2 Field Map bound text colors differ");
    invariant(binding.observed.activeBackgroundImage.includes("rgba(216,43,114,0.08)"), "R2 Field Map active signal overlay differs");
  } else {
    invariant(binding.observed.headerBackgroundColor === "rgba(8,11,12,0.9)", "R2 closed-header authored upper-bound source differs");
    invariant(binding.observed.headingColor === "rgb(255,255,255)" && binding.observed.liveSignalColor === "rgb(216,43,114)", "R2 manifesto bound colors differ");
    invariant(binding.observed.thresholdBackgroundColor === "rgb(9,12,13)", "R2 bifurcation field background differs");
    invariant(binding.observed.local.every(({ foreground, color }) => foreground === color), "R2 bifurcation selector-local text colors differ");
  }
  return binding;
}

async function axeCase(browser, baseUrl, engine, route, state, timeoutMs, staging) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: state === "reduced-motion-home" ? "reduce" : "no-preference" });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await gotoRoute(page, baseUrl, route);
  if (state === "field-map-open") await openMap(page);
  await page.addScriptTag({ content: axeCore.source });
  const result = await page.evaluate(async () => {
    const outcome = await globalThis.axe.run(document, { resultTypes: ["passes", "violations", "incomplete"] });
    const compact = (items) => items.map(({ id, impact, nodes, help }) => ({ id, impact, help, nodes: nodes.map(({ target, failureSummary, html }) => ({ target, failureSummary, html })) }));
    return { version: globalThis.axe.version, passes: outcome.passes.length, violations: compact(outcome.violations), incomplete: compact(outcome.incomplete) };
  });
  invariant(result.version === PHASE7A_R2_AXE_VERSION, `R2 ${engine} runtime axe version differs`);
  const selectorBinding = await productionContrastSelectorBinding(page, state);
  const incompleteBindings = bindIncompleteContrast(result, engine, route, state);
  await assertContrastBindingOwnership(page, incompleteBindings);
  const contrastCase = PHASE7A_R2_LOCAL_CONTRAST_CASES.find((record) => record.route === route && record.state === state);
  invariant(contrastCase, `R2 ${engine} ${state} selector-local contrast case differs`);
  const selectorMeasurement = await selectorLocalContrastMeasurement(
    page,
    engine,
    contrastCase,
    path.join(staging, "screenshots", `${engine}-${contrastCase.id}-background-mask.png`),
  );
  await context.close();
  const invalidAriaIncomplete = result.incomplete.some(({ id, impact }) => id === "aria-valid-attr-value" || impact === "critical");
  const unsupportedIncomplete = result.incomplete.some(({ id }) => id !== "color-contrast");
  const authority = { route, state, passes: result.passes, violations: result.violations, incomplete: result.incomplete, status: result.violations.length === 0 && !invalidAriaIncomplete && !unsupportedIncomplete ? "PASS" : "FAIL" };
  return { authority, selectorBinding: { engine, route, state, axeVersion: result.version, selectors: selectorBinding, incompleteBindings, selectorMeasurement, status: authority.status } };
}

async function axeAuthority(browsers, baseUrl, timeoutMs, staging) {
  const engines = [];
  const selectorBindings = [];
  for (const engine of ["chromium", "firefox"]) {
    const cases = [];
    for (const item of [{ route: "/", state: "reduced-motion-home" }, { route: "/about/", state: "field-map-open" }]) {
      const captured = await axeCase(browsers[engine], baseUrl, engine, item.route, item.state, timeoutMs, staging);
      cases.push(captured.authority);
      selectorBindings.push(captured.selectorBinding);
    }
    const violationCount = cases.reduce((sum, item) => sum + item.violations.length, 0);
    const incompleteCount = cases.reduce((sum, item) => sum + item.incomplete.length, 0);
    engines.push({ engine, status: cases.every(({ status }) => status === "PASS") ? "PASS" : "FAIL", violationCount, incompleteCount, cases });
  }
  const manualContrast = manualContrastAuthority(
    selectorBindings.filter(({ selectorMeasurement }) => selectorMeasurement).map(({ selectorMeasurement }) => selectorMeasurement),
    selectorBindings.flatMap(({ incompleteBindings }) => incompleteBindings),
  );
  const authority = {
    schema: PHASE7A_R2_AXE_SCHEMA,
    status: engines.every(({ status }) => status === "PASS") && manualContrast.status === "PASS" ? "PASS" : "FAIL",
    parent: PHASE7A_R2_PARENT,
    axeVersion: PHASE7A_R2_AXE_VERSION,
    engines,
    manualContrast,
  };
  return {
    authority,
    selectorBindings: {
      schema: "quantum-hub.phase-7a-r2.contrast-selector-bindings.v1",
      status: selectorBindings.every(({ status }) => status === "PASS") ? "PASS" : "FAIL",
      parent: PHASE7A_R2_PARENT,
      cases: selectorBindings.map(({ selectorMeasurement, ...record }) => record),
    },
  };
}

async function transcodeVideo(rawPath, outputPath, ffmpeg, ffprobe) {
  const partial = `${outputPath}.partial`;
  await execFileAsync(ffmpeg, ["-y", "-v", "error", "-i", rawPath, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-f", "mp4", partial], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  await execFileAsync(ffmpeg, ["-v", "error", "-i", partial, "-f", "null", "-"], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  await rename(partial, outputPath);
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "error",
    "-select_streams", "v:0",
    "-count_frames",
    "-show_entries", "stream=codec_name,width,height,avg_frame_rate,nb_read_frames,duration:format=duration,size",
    "-of", "json",
    outputPath,
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const probe = JSON.parse(stdout);
  invariant(Array.isArray(probe.streams) && probe.streams.length === 1, "R2 recording must contain exactly one video stream");
  const stream = probe.streams[0];
  const durationSeconds = Number(stream.duration ?? probe.format?.duration);
  const frameCount = Number(stream.nb_read_frames);
  const bytes = (await stat(outputPath)).size;
  invariant(stream.codec_name === "h264", "R2 recording codec is not H.264");
  invariant(stream.width === 960 && stream.height === 600, "R2 recording dimensions differ");
  invariant(Number.isFinite(durationSeconds) && durationSeconds >= MINIMUM_RECORDING_SECONDS, "R2 recording is too brief to review");
  invariant(Number.isSafeInteger(frameCount) && frameCount >= MINIMUM_RECORDING_FRAMES, "R2 recording frame inventory is too small");
  invariant(Number(probe.format?.size) === bytes && bytes > 0, "R2 recording byte authority differs");
  await rm(rawPath, { force: true });
  return {
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
    durationSeconds,
    frameCount,
    averageFrameRate: stream.avg_frame_rate,
    bytes,
    decodeStatus: "PASS",
  };
}

async function semanticInventory(page, engine) {
  if (engine === "chromium") return {
    method: "Chromium CDP Accessibility.getFullAXTree (authoritative AX-property source)",
    available: true,
    status: "PASS",
  };
  try {
    const aria = await page.locator("[data-field-map]").ariaSnapshot();
    const destinationNames = PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ name }) => ({ name, present: aria.includes(name) }));
    const status = aria.includes("Field map") && destinationNames.every(({ present }) => present) ? "PASS" : "FAIL";
    return {
      method: "Playwright locator.ariaSnapshot semantic inventory; not a native platform accessibility-tree property dump",
      available: true,
      snapshot: aria,
      destinationNames,
      status,
    };
  } catch {
    return {
      method: "Playwright locator.ariaSnapshot semantic inventory",
      available: false,
      limitation: `ariaSnapshot was unavailable for ${engine}; no native roles were inferred`,
      status: "LIMITED",
    };
  }
}

async function primaryEngineCapture(browser, engine, baseUrl, staging, timeoutMs, ffmpeg, ffprobe) {
  const rawDirectory = path.join(staging, "raw", engine);
  await mkdir(rawDirectory, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: rawDirectory, size: { width: 960, height: 600 } } });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const video = page.video();
  await gotoRoute(page, baseUrl, "/about/");
  const initialClosedState = await snapshot(page);
  const initialClosedTree = engine === "chromium" ? await accessibilityTree(page) : null;
  await mkdir(path.join(staging, "screenshots"), { recursive: true });
  await page.waitForTimeout(RECORDING_DWELL_MS);
  await page.screenshot({ path: path.join(staging, "screenshots", `${engine}-closed.png`), fullPage: false });
  const focus = await exerciseFocus(page, { cycles: 10, dwellMs: RECORDING_DWELL_MS });
  const escapeTree = engine === "chromium" ? await accessibilityTree(page) : null;
  await openMap(page);
  await page.waitForTimeout(RECORDING_DWELL_MS);
  await page.screenshot({ path: path.join(staging, "screenshots", `${engine}-open.png`), fullPage: false });
  const openState = await snapshot(page);
  const openTree = engine === "chromium" ? await accessibilityTree(page) : null;
  const openSemanticInventory = await semanticInventory(page, engine);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(RECORDING_DWELL_MS);
  await page.screenshot({ path: path.join(staging, "screenshots", `${engine}-focus.png`), fullPage: false });
  await closeWithEscape(page);
  await page.waitForTimeout(RECORDING_DWELL_MS);
  await page.screenshot({ path: path.join(staging, "screenshots", `${engine}-escape.png`), fullPage: false });
  await context.close();
  const rawPath = await video.path();
  const outputPath = path.join(staging, "recordings", `${engine}-field-map-forward-reverse.mp4`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const recordingMetadata = await transcodeVideo(rawPath, outputPath, ffmpeg, ffprobe);
  return {
    focus,
    initialClosedState,
    openState,
    openSemanticInventory,
    accessibilityTrees: engine === "chromium" ? { initialClosed: initialClosedTree, open: openTree, escape: escapeTree } : null,
    recording: path.relative(staging, outputPath).replaceAll(path.sep, "/"),
    recordingMetadata,
  };
}

async function launchBrowsers(options) {
  const opened = [];
  try {
    const chromiumBrowser = await chromium.launch({ executablePath: options.chromeExecutable, headless: false });
    opened.push(chromiumBrowser);
    const firefoxExecutable = options.firefoxExecutable || firefox.executablePath();
    const firefoxBrowser = await firefox.launch({ headless: false, executablePath: firefoxExecutable });
    opened.push(firefoxBrowser);
    const webkitBrowser = await webkit.launch({ headless: true, executablePath: webkit.executablePath() });
    opened.push(webkitBrowser);
    return { chromium: chromiumBrowser, firefox: firefoxBrowser, webkit: webkitBrowser };
  } catch (error) {
    await Promise.allSettled(opened.map((browser) => browser.close()));
    throw error;
  }
}

async function browserIdentity(browser, engine, options) {
  const identity = { engine, version: browser.version() };
  if (engine === "chromium") {
    invariant(/^chrome(?:\.exe)?$/i.test(path.basename(options.chromeExecutable)), "R2 installed Chromium executable is not named Google Chrome");
    const session = await browser.newBrowserCDPSession();
    let product;
    try {
      product = await session.send("Browser.getVersion");
    } finally {
      await session.detach();
    }
    invariant(/^Chrome\/\d/.test(product.product), `R2 installed Chromium product is not Google Chrome: ${product.product}`);
    invariant(/\bChrome\/\d/.test(product.userAgent) && !/\b(?:Edg|OPR)\//.test(product.userAgent), "R2 installed Chromium user agent is not unbranded Google Chrome");
    return {
      ...identity,
      product: product.product,
      revision: product.revision,
      authority: "installed/headed Google Chrome verified by CDP Browser.getVersion",
      headed: true,
      executableName: path.basename(options.chromeExecutable),
    };
  }
  if (engine === "firefox") {
    invariant(/^\d+(?:\.\d+)+/.test(identity.version), "R2 Firefox browser version is unavailable");
    return {
      ...identity,
      authority: options.firefoxExecutable ? "headed Firefox supplied by verified executable override" : "Playwright-managed headed Firefox",
      headed: true,
      executableName: path.basename(options.firefoxExecutable || firefox.executablePath()),
    };
  }
  return {
    ...identity,
    authority: "Playwright WebKit headless proxy; not physical Safari",
    headed: false,
    executableName: path.basename(webkit.executablePath()),
  };
}

async function closeBrowsers(browsers) {
  await Promise.allSettled(Object.values(browsers).map((browser) => browser.close()));
}

function triggerWithAx(trigger, tree) {
  return {
    ...trigger,
    axRole: tree.trigger.axRole,
    axName: tree.trigger.axName,
    axExpanded: tree.trigger.axExpanded,
  };
}

function destinationsWithAx(destinations, tree) {
  return destinations.map((destination) => {
    const link = tree.links.find(({ name }) => name === destination.accessibleName);
    return { ...destination, axRole: link?.role ?? null };
  });
}

function compactEngineEvidence(primary) {
  const classifications = {
    chromium: "installed/headed Google Chrome; Chromium CDP AX-property authority",
    firefox: "headed Firefox automation",
    webkit: "Playwright WebKit proxy; not physical Safari",
  };
  return Object.keys(ENGINES).map((engine) => {
    const focus = primary[engine]?.focus;
    invariant(focus, `R2 ${engine} raw focus evidence is missing`);
    const repeatedCycleStatus = focus.repeatedCycles.length === 10
      && focus.repeatedCycles.every(({ opened, outsideRecapture, closed, postCloseOutsideRetained }) => opened.backgroundFocusableCount === 0
        && opened.inertRegionCount === opened.backgroundRegionCount
        && opened.ownedInertCount === opened.backgroundRegionCount
        && outsideRecapture.activeElement === "a"
        && closed.activeElement === "field-map-summary"
        && closed.inertRegionCount === 0
        && closed.ownedInertCount === 0
        && postCloseOutsideRetained === true)
      ? "PASS" : "FAIL";
    return {
      engine,
      classification: classifications[engine],
      forwardCycle: focus.forwardCycle,
      reverseCycle: focus.reverseCycle,
      bodyStops: focus.bodyStops,
      escape: {
        activeElement: focus.escape.activeElement,
        open: focus.escape.open,
        rootOpen: focus.escape.rootOpen,
        backgroundRegionCount: focus.escape.backgroundRegionCount,
        inertRegionCount: focus.escape.inertRegionCount,
        ownedInertCount: focus.escape.ownedInertCount,
      },
      repeatedCycleCount: focus.repeatedCycles.length,
      repeatedCycleStatus,
      duplicateBinding: {
        cycles: focus.duplicateBindingInvariant.cycles,
        status: focus.duplicateBindingInvariant.status,
      },
      status: focus.status === "PASS" && repeatedCycleStatus === "PASS" && focus.duplicateBindingInvariant.status === "PASS" ? "PASS" : "FAIL",
    };
  });
}

async function buildCanonicalFocus(primary, noJavaScript) {
  const chromium = primary.chromium;
  const trees = chromium.accessibilityTrees;
  invariant(trees?.initialClosed && trees?.open && trees?.escape, "Chromium accessibility-tree state inventory is incomplete");
  const closed = { ...chromium.initialClosedState, trigger: triggerWithAx(chromium.initialClosedState.trigger, trees.initialClosed) };
  delete closed.backgroundFocusableCount;
  delete closed.activeDestinationName;
  delete closed.destinations;
  delete closed.focusableInventory;
  delete closed.horizontalOverflow;
  delete closed.viewport;
  const open = {
    ...chromium.focus.opened,
    trigger: triggerWithAx(chromium.focus.opened.trigger, trees.open),
    destinations: destinationsWithAx(chromium.focus.opened.destinations, trees.open),
  };
  for (const key of ["backgroundFocusableCount", "horizontalOverflow", "viewport"]) delete open[key];
  const escape = { ...chromium.focus.escape, trigger: triggerWithAx(chromium.focus.escape.trigger, trees.escape) };
  for (const key of ["backgroundFocusableCount", "activeDestinationName", "destinations", "focusableInventory", "horizontalOverflow", "viewport"]) delete escape[key];
  const repeatedCycles = chromium.focus.repeatedCycles.slice(0, 3).map(({ cycle, opened, closed: closedCycle }) => {
    const openCycle = {
      ...opened,
      trigger: triggerWithAx(opened.trigger, trees.open),
      destinations: destinationsWithAx(opened.destinations, trees.open),
    };
    for (const key of ["backgroundFocusableCount", "horizontalOverflow", "viewport"]) delete openCycle[key];
    const closedCopy = { ...closedCycle, trigger: triggerWithAx(closedCycle.trigger, trees.escape) };
    for (const key of ["backgroundFocusableCount", "activeDestinationName", "destinations", "focusableInventory", "horizontalOverflow", "viewport"]) delete closedCopy[key];
    return { cycle, opened: openCycle, closed: closedCopy };
  });
  return {
    schema: PHASE7A_R2_FIELD_MAP_SCHEMA,
    status: chromium.focus.status,
    parent: PHASE7A_R2_PARENT,
    route: "/about/",
    states: { closed, open, escape },
    focus: {
      initial: chromium.focus.initial,
      forwardCycle: chromium.focus.forwardCycle,
      reverseFromSummary: chromium.focus.reverseFromSummary,
      outsideRecapture: chromium.focus.outsideRecapture,
      postCloseOutsideFocus: chromium.focus.postCloseOutsideFocus,
    },
    repeatedCycles,
    engineEvidence: compactEngineEvidence(primary),
    noJavaScript,
  };
}

function canonicalTargetControl(control) {
  return {
    selector: control.selector,
    href: control.href,
    accessibleName: control.accessibleName,
    elementType: control.elementType,
    width: control.width,
    height: control.height,
    visible: control.visible,
    intendedInteractive: control.intendedInteractive,
  };
}

function buildTargetFragment(matrices) {
  const expectedIds = ["desktop-1440x900", "mobile-390x844"];
  const states = expectedIds.map((viewportId) => {
    const record = matrices.find((item) => item.engine === "chromium" && item.reducedMotion === false && item.viewport.id === viewportId);
    invariant(record, `R2 Chromium ${viewportId} target state is missing`);
    invariant(record.target?.identityExact === true, `R2 Chromium ${viewportId} target identity or order differs`);
    invariant(Array.isArray(record.target.controls) && record.target.controls.length === FOCUS_ORDER.length, `R2 Chromium ${viewportId} full target inventory differs`);
    return {
      id: record.target.id,
      route: record.target.route,
      state: record.target.state,
      viewport: record.target.viewport,
      genuineInstalledChrome: record.target.genuineInstalledChrome,
      nativeZoomPercent: record.target.nativeZoomPercent,
      candidateCount: record.target.candidateCount,
      controls: record.target.controls.map(canonicalTargetControl),
      status: record.target.status,
    };
  });
  return {
    schema: "quantum-hub.phase-7a-r2.field-map-target-fragment.v1",
    status: states.every(({ status }) => status === "PASS") ? "PASS" : "FAIL",
    parent: PHASE7A_R2_PARENT,
    minimumCssPixels: PHASE7A_R2_MINIMUM_TARGET_CSS_PIXELS,
    states,
    requiredInstalledChromeStateId: "field-map-open-installed-chrome-200-percent",
  };
}

async function manifestFor(root) {
  const walk = async (directory) => {
    const output = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) output.push(...await walk(absolute));
      else if (entry.isFile()) output.push(absolute);
    }
    return output;
  };
  const files = (await walk(root)).filter((filename) => path.basename(filename) !== "manifest.json").sort();
  return Promise.all(files.map(async (filename) => ({
    path: path.relative(root, filename).replaceAll(path.sep, "/"),
    bytes: (await stat(filename)).size,
    sha256: await sha256File(filename),
  })));
}

async function provenance(revision) {
  const [branch, head, localMain, originMain, merges, firstCommit, statusRows] = await Promise.all([
    git(["branch", "--show-current"]),
    git(["rev-parse", "HEAD"]),
    git(["rev-parse", "main"]),
    git(["rev-parse", "origin/main"]),
    git(["rev-list", "--merges", `${PHASE7A_R2_PARENT}..HEAD`]),
    git(["rev-list", "--reverse", `${PHASE7A_R2_PARENT}..HEAD`]),
    git(["status", "--porcelain=v1", "--untracked-files=all"]),
  ]);
  invariant(branch === PHASE7A_R2_BRANCH, "R2 capture branch differs");
  invariant(head === revision, "R2 capture HEAD differs");
  invariant(localMain === "501040c42bba30b9d9517b88a8f9857992a2dba4" && originMain === localMain, "main authority moved");
  invariant(!merges, "R2 history contains a merge");
  invariant(!statusRows, "R2 capture requires a clean worktree");
  const commits = firstCommit ? firstCommit.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
  invariant(commits.length > 0 && await git(["rev-parse", `${commits[0]}^`]) === PHASE7A_R2_PARENT, "R2 first commit parent differs");
  return { branch, head, parent: PHASE7A_R2_PARENT, localMain, originMain, mergeCount: 0, commits };
}

async function phase4Hashes() {
  const assets = [];
  for (const [relative, expectedSha256] of PHYSICAL_ASSETS) {
    const absolute = path.join(ROOT, ...relative.split("/"));
    const actualSha256 = await sha256File(absolute);
    assets.push({ path: relative, expectedSha256, actualSha256, bytes: (await stat(absolute)).size, status: actualSha256 === expectedSha256 ? "PASS" : "FAIL" });
  }
  return { status: assets.every(({ status }) => status === "PASS") ? "PASS" : "FAIL", assets };
}

export function selfTest() {
  invariant(VIEWPORTS.length === 4, "R2 viewport matrix must contain four viewports");
  invariant(FOCUS_ORDER.length === 9, "R2 focus order must contain summary plus eight links");
  invariant(PHASE7A_R2_FIELD_MAP_DESTINATIONS.length === 8, "R2 destination inventory must contain eight links");
  invariant(PHASE7A_R2_MINIMUM_TARGET_CSS_PIXELS === 44, "R2 target minimum differs");
  invariant(REDUCED_MOTION_SCREENSHOT === "screenshots/chromium-reduced-motion.png", "R2 reduced-motion screenshot path differs");
  invariant(PHASE7A_R2_LOCAL_CONTRAST_CASES.length === 2 && PHASE7A_R2_LOCAL_CONTRAST_CASES[0].selectors.length === 8 && PHASE7A_R2_LOCAL_CONTRAST_CASES[1].selectors.length === 29, "R2 selector-local contrast case inventory differs");
  invariant(contrastAuthorityForIncompleteNode("field-map-open", { target: [".field-map__trigger-state"] })?.authorityId === "open-field-map-trigger-state", "R2 muted contrast binding differs");
  invariant(contrastAuthorityForIncompleteNode("field-map-open", { target: [".field-map__trigger-label"] })?.authorityId === "open-field-map-trigger-label", "R2 white contrast binding differs");
  invariant(contrastAuthorityForIncompleteNode("field-map-open", { target: ['a[href$="industries/"] > span:nth-child(3)'] })?.authorityId === "open-industries-coordinate", "R2 destination-span contrast binding differs");
  invariant(contrastAuthorityForIncompleteNode("reduced-motion-home", { target: [".field-map-threshold__coordinate"] })?.authorityId === "bifurcation-coordinate", "R2 bifurcation coordinate binding differs");
  invariant(contrastAuthorityForIncompleteNode("reduced-motion-home", { target: ["#field-map-threshold-title > span:nth-child(1)"] })?.authorityId === "bifurcation-heading-one", "R2 bifurcation heading binding differs");
  invariant(contrastAuthorityForIncompleteNode("reduced-motion-home", { target: [".bifurcation-destination--industry > .bifurcation-destination__label"] })?.authorityId === "bifurcation-industry-label", "R2 bifurcation label binding differs");
  invariant(contrastAuthorityForIncompleteNode("reduced-motion-home", { target: [".manifesto-line--one > .manifesto-word:nth-child(1)"] })?.authorityId === "manifesto-white-over-live-magenta", "R2 manifesto contrast binding differs");
  invariant(contrastAuthorityForIncompleteNode("reduced-motion-home", { target: [".field-map__trigger-state"] })?.authorityId === "closed-header-muted-over-authored-upper-bound", "R2 closed-header upper-bound contrast binding differs");
  invariant(contrastAuthorityForIncompleteNode("reduced-motion-home", { target: ["footer p"] }) === null, "R2 contrast binding expanded outside its governed selectors");
  const pairs = manualContrastPairs();
  invariant(pairs.length === 3 && pairs.every(({ ratio, threshold }) => ratio >= threshold), "manual contrast pairs must pass");
  return { status: "PASS", viewports: VIEWPORTS.length, controls: FOCUS_ORDER.length, contrast: { status: "PASS", pairs } };
}

async function capture(options) {
  await assertRealExternalDirectory(options.output);
  invariant(!await exists(options.output), "refusing to overwrite existing R2 evidence");
  await access(options.chromeExecutable);
  await access(options.ffmpeg);
  await access(options.ffprobe);
  if (options.firefoxExecutable) await access(options.firefoxExecutable);
  const authority = await provenance(options.revision);
  const staging = path.join(path.dirname(options.output), `.${path.basename(options.output)}.staging-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  let browsers;
  try {
    browsers = await launchBrowsers(options);
    const identities = Object.fromEntries(await Promise.all(Object.entries(browsers).map(async ([engine, browser]) => [engine, await browserIdentity(browser, engine, options)])));
    const primary = {};
    for (const engine of Object.keys(ENGINES)) primary[engine] = await primaryEngineCapture(browsers[engine], engine, options.baseUrl, staging, options.timeoutMs, options.ffmpeg, options.ffprobe);
    const matrices = [];
    for (const engine of Object.keys(ENGINES)) {
      for (const viewport of VIEWPORTS) matrices.push(await matrixCase(browsers[engine], options.baseUrl, viewport, engine, options.timeoutMs));
      matrices.push(await matrixCase(browsers[engine], options.baseUrl, VIEWPORTS[1], engine, options.timeoutMs, true));
    }
    const noJavaScriptCapture = await noJavaScriptCase(browsers.chromium, options.baseUrl, options.timeoutMs, staging);
    const noJavaScript = noJavaScriptCapture.authority;
    const reducedMotionScreenshot = await reducedMotionScreenshotCase(browsers.chromium, options.baseUrl, options.timeoutMs, staging);
    const axeCapture = await axeAuthority(browsers, options.baseUrl, options.timeoutMs, staging);
    const axe = axeCapture.authority;
    const canonicalFocus = await buildCanonicalFocus(primary, noJavaScript);
    validateR2FieldMapFocusAuthority(canonicalFocus);
    validateR2AxeAuthority(axe);
    const targetFragment = buildTargetFragment(matrices);
    const linkNavigation = await linkNavigationCase(browsers.chromium, options.baseUrl, options.timeoutMs);
    const lifecycleCleanup = await lifecycleCleanupCase(browsers.chromium, options.baseUrl, options.timeoutMs);
    const phase4 = await phase4Hashes();
    const report = {
      schema: "quantum-hub.phase-7a-r2.field-map-capture.v1",
      status: Object.values(primary).every(({ focus, openSemanticInventory, recordingMetadata }) => focus.status === "PASS"
        && openSemanticInventory.status !== "FAIL"
        && recordingMetadata.decodeStatus === "PASS")
        && matrices.every(({ status }) => status === "PASS")
        && reducedMotionScreenshot.status === "PASS"
        && targetFragment.status === "PASS"
        && axe.status === "PASS"
        && axeCapture.selectorBindings.status === "PASS"
        && linkNavigation.status === "PASS"
        && lifecycleCleanup.status === "PASS"
        && phase4.status === "PASS" ? "PASS" : "FAIL",
      authority,
      identities,
      primary,
      matrices,
      canonicalFocus,
      noJavaScriptEvidence: noJavaScriptCapture,
      reducedMotionScreenshot,
      axe,
      contrastSelectorBindings: axeCapture.selectorBindings,
      targetFragment,
      linkNavigation,
      lifecycleCleanup,
      phase4,
      limitations: [
        "Playwright WebKit is proxy evidence and is not physical Safari.",
        "Automated keyboard delivery supplements but does not replace physical human-input review.",
        "Contrast cases unresolved by axe use reproducible authored fixed bounds or engine-local masked-pixel minima bound to the included screenshots.",
        "The pagehide/pageshow lifecycle listener exercise is a scripted PageTransitionEvent check and is not promoted as BFCache authority.",
        "The sole Phase 7A accessibility gate remains PENDING HUMAN REVIEW.",
      ],
    };
    invariant(report.status === "PASS", "R2 Field Map capture contains a failed authority");
    await writeJson(staging, "field-map-capture.json", report);
    await writeJson(staging, "focus-authority.json", canonicalFocus);
    await writeJson(staging, "axe-authority.json", axe);
    await writeJson(staging, "contrast-selector-bindings.json", axeCapture.selectorBindings);
    await writeJson(staging, "target-fragment.json", targetFragment);
    await writeJson(staging, "link-navigation.json", linkNavigation);
    await writeJson(staging, "lifecycle-cleanup.json", lifecycleCleanup);
    await writeJson(staging, "no-javascript-evidence.json", noJavaScriptCapture);
    await writeJson(staging, "reduced-motion-evidence.json", reducedMotionScreenshot);
    await writeJson(staging, "phase4-hashes.json", phase4);
    await writeJson(staging, "provenance.json", authority);
    await closeBrowsers(browsers);
    browsers = null;
    await rm(path.join(staging, "raw"), { recursive: true, force: true });
    const manifestEntries = await manifestFor(staging);
    const manifest = { schema: "quantum-hub.phase-7a-r2.capture-manifest.v1", sourceHead: options.revision, entries: manifestEntries };
    await writeJson(staging, "manifest.json", manifest);
    await rename(staging, options.output);
    return {
      status: report.status,
      output: options.output,
      engines: identities,
      matrixCases: matrices.length,
      recordings: manifestEntries.filter(({ path: relativePath }) => relativePath.endsWith(".mp4")).length,
      screenshots: manifestEntries.filter(({ path: relativePath }) => relativePath.endsWith(".png")).length,
    };
  } catch (error) {
    if (browsers) await closeBrowsers(browsers);
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/capture-phase7a-r2-field-map.mjs --base-url <preview> --revision <sha40> --output <fresh-external-directory> --ffmpeg <absolute-path> [--ffprobe <absolute-path>] [--chrome-executable <absolute-path>] [--firefox-executable <absolute-path>] [--timeout-ms 30000]\n");
    return;
  }
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await capture(options), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`Phase 7A-R2 Field Map capture FAIL: ${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
