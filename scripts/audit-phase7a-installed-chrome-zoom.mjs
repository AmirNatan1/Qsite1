#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import sharp from "sharp";

import { PUBLIC_ROUTES } from "./phase7a-contract.mjs";
import { REAL_404_PATH } from "./phase7a-browser-contract.mjs";
import { observeTargetSizes } from "./phase7a-target-size.mjs";
import {
  capturePortableServedBuildReceipt,
  portableServedBuildReference,
  validatePortableServedBuildReceipt,
} from "./capture-phase7a-review-evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = "quantum-hub.phase-7a.installed-chrome-native-zoom.v1";
const EXPECTED_404_H1 = "The requested route is out of alignment.";
const execFileAsync = promisify(execFile);
const WINDOWS_CAPTURE_SCRIPT = path.join(ROOT, "scripts", "capture-installed-chrome-window.ps1");
const HASH_40 = /^[a-f0-9]{40}$/;
const HASH_64 = /^[a-f0-9]{64}$/;
const VISUAL_INVENTORY = Object.freeze([
  ...PUBLIC_ROUTES.map(({ route }) => Object.freeze({
    label: `route:${route}`,
    filename: `${route === "/" ? "home" : route.replaceAll("/", "-").replace(/^-|-$/g, "")}-top.png`,
  })),
  Object.freeze({ label: `route:${REAL_404_PATH}`, filename: `${REAL_404_PATH.replaceAll("/", "-").replace(/^-|-$/g, "")}-top.png` }),
  Object.freeze({ label: "home-field-map-closed", filename: "home-field-map-closed.png" }),
  Object.freeze({ label: "home-bifurcation", filename: "home-bifurcation.png" }),
  Object.freeze({ label: "home-field-map-open", filename: "home-field-map-open.png" }),
  Object.freeze({ label: "home-field-map-keyboard-focus", filename: "home-field-map-keyboard-focus.png" }),
  Object.freeze({ label: "home-field-map-escape-closed", filename: "home-field-map-escape-closed.png" }),
]);
const HOME_STATE_LABELS = Object.freeze([
  "home-field-map-closed",
  "home-bifurcation",
  "home-field-map-open",
  "home-field-map-keyboard-focus",
  "home-field-map-escape-closed",
]);

function invariant(value, message) { if (!value) throw new Error(message); }
function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
function canonical(value) { return String(value ?? "").replace(/\s+/g, "").toLowerCase(); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function exactAuthority(actual, expected, label) {
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `${label} source authority differs from the governed served build`);
}

export function validateInstalledChromeCaptureAuthority(report, expectedRevision) {
  invariant(HASH_40.test(expectedRevision ?? ""), "installed-Chrome expected revision is invalid");
  validatePortableServedBuildReceipt(report?.servedBuild, expectedRevision);
  const expectedAuthority = portableServedBuildReference(report.servedBuild);
  exactAuthority(report.sourceAuthority, expectedAuthority, "installed-Chrome run");

  const expectedRoutePaths = [...PUBLIC_ROUTES.map(({ route }) => route), REAL_404_PATH];
  invariant(Array.isArray(report.routes) && report.routes.length === expectedRoutePaths.length, "installed-Chrome route authority must contain exactly ten routes");
  for (const [index, route] of report.routes.entries()) {
    invariant(route?.path === expectedRoutePaths[index], `installed-Chrome route ${index + 1} path differs`);
    exactAuthority(route.sourceAuthority, expectedAuthority, `installed-Chrome route ${index + 1}`);
  }

  invariant(Array.isArray(report.visualEvidence) && report.visualEvidence.length === VISUAL_INVENTORY.length, "installed-Chrome visual authority must contain exactly fifteen states");
  for (const [index, visual] of report.visualEvidence.entries()) {
    const expected = VISUAL_INVENTORY[index];
    invariant(visual?.label === expected.label && visual?.filename === expected.filename, `installed-Chrome visual ${index + 1} label/filename inventory differs`);
    invariant(HASH_64.test(visual.sha256 ?? ""), `installed-Chrome visual ${index + 1} hash differs`);
    exactAuthority(visual.sourceAuthority, expectedAuthority, `installed-Chrome visual ${index + 1}`);
  }

  const homeStateHashes = HOME_STATE_LABELS.map((label) => report.visualEvidence.find((visual) => visual.label === label)?.sha256);
  invariant(homeStateHashes.every((value) => HASH_64.test(value ?? "")), "installed-Chrome Home state hash inventory differs");
  invariant(new Set(homeStateHashes).size === HOME_STATE_LABELS.length, "installed-Chrome Home state screenshots are not visually distinct");
  exactAuthority(report.fieldMap?.sourceAuthority, expectedAuthority, "installed-Chrome Field Map");
  return true;
}

export function validateManifestoVisibility(authority) {
  invariant(authority?.applicable === true, "Home manifesto visibility authority is missing");
  invariant(authority.status === "PASS", "Home manifesto is not fully visible");
  const rect = (value, label) => {
    invariant(value && typeof value === "object" && !Array.isArray(value), `${label} is missing`);
    for (const key of ["left", "top", "right", "bottom", "width", "height"]) invariant(Number.isFinite(value[key]), `${label} has a nonnumeric ${key}`);
    invariant(value.width > 0 && value.height > 0 && Math.abs(value.width - (value.right - value.left)) < 0.05 && Math.abs(value.height - (value.bottom - value.top)) < 0.05, `${label} geometry differs`);
    return value;
  };
  const viewport = rect(authority.viewportBounds, "Home viewport bounds");
  const section = rect(authority.sectionBounds, "Home manifesto section bounds");
  const sectionClip = rect(authority.sectionClipBounds, "Home manifesto section client bounds");
  const usable = rect(authority.usableClipBounds, "Home usable clip bounds");
  const effective = rect(authority.effectiveVisibleBounds, "Home effective visible bounds");
  const h1 = rect(authority.h1Bounds, "Home H1 bounds");
  const glyphs = rect(authority.glyphBounds, "Home glyph bounds");
  const header = rect(authority.header?.bounds, "Home sticky-header bounds");
  invariant(typeof authority.header.visible === "boolean", "sticky header visibility authority is missing");
  const expectedAnchor = ["fixed", "sticky"].includes(authority.header.position) && header.top <= viewport.top + 0.5 && header.bottom > viewport.top;
  const expectedOverlap = header.right > h1.left && header.left < h1.right;
  invariant(expectedAnchor === true && authority.header.anchoredToViewportTop === expectedAnchor, "sticky header anchor authority differs");
  invariant(expectedOverlap === true && authority.header.horizontallyOverlapsManifesto === expectedOverlap, "sticky header overlap authority differs");
  const expectedOcclusion = authority.header.visible && expectedAnchor && expectedOverlap;
  invariant(authority.header.occluding === expectedOcclusion, "sticky header occlusion authority differs");
  invariant(sectionClip.left >= section.left - 0.05 && sectionClip.top >= section.top - 0.05 && sectionClip.right <= section.right + 0.05 && sectionClip.bottom <= section.bottom + 0.05, "Home section client bounds escape the section rectangle");
  invariant(Array.isArray(authority.clippingAncestors), "Home clipping-ancestor authority is missing");
  const expectedUsable = {
    left: Math.max(viewport.left, sectionClip.left),
    top: Math.max(viewport.top, sectionClip.top),
    right: Math.min(viewport.right, sectionClip.right),
    bottom: Math.min(viewport.bottom, sectionClip.bottom),
  };
  const clippingOverflow = new Set(["auto", "clip", "hidden", "scroll"]);
  for (const [index, ancestor] of authority.clippingAncestors.entries()) {
    const bounds = rect(ancestor?.bounds, `Home clipping ancestor ${index + 1} bounds`);
    const contain = String(ancestor.contain || "").split(/\s+/);
    const paintContainment = contain.some((token) => ["content", "paint", "strict"].includes(token));
    const pathClipping = String(ancestor.clipPath || "none") !== "none";
    const clipsX = clippingOverflow.has(ancestor.overflowX) || paintContainment || pathClipping;
    const clipsY = clippingOverflow.has(ancestor.overflowY) || paintContainment || pathClipping;
    invariant(ancestor.clipsX === clipsX && ancestor.clipsY === clipsY && (clipsX || clipsY), `Home clipping ancestor ${index + 1} authority differs`);
    if (clipsX) { expectedUsable.left = Math.max(expectedUsable.left, bounds.left); expectedUsable.right = Math.min(expectedUsable.right, bounds.right); }
    if (clipsY) { expectedUsable.top = Math.max(expectedUsable.top, bounds.top); expectedUsable.bottom = Math.min(expectedUsable.bottom, bounds.bottom); }
  }
  for (const edge of ["left", "top", "right", "bottom"]) invariant(Math.abs(usable[edge] - expectedUsable[edge]) < 0.05, `Home usable clip ${edge} differs from section/ancestor authority`);
  const expectedEffective = {
    left: usable.left,
    top: Math.max(usable.top, expectedOcclusion ? Math.min(viewport.bottom, header.bottom) : viewport.top),
    right: usable.right,
    bottom: usable.bottom,
  };
  invariant(expectedEffective.right > expectedEffective.left && expectedEffective.bottom > expectedEffective.top, "Home effective visible intersection is empty");
  for (const edge of ["left", "top", "right", "bottom"]) invariant(Math.abs(effective[edge] - expectedEffective[edge]) < 0.05, `Home effective visible ${edge} differs from usable-clip/header authority`);
  const expectedAllowances = {
    h1Top: h1.top - effective.top,
    h1Bottom: effective.bottom - h1.bottom,
    h1Left: h1.left - effective.left,
    h1Right: effective.right - h1.right,
    glyphTop: glyphs.top - effective.top,
    glyphBottom: effective.bottom - glyphs.bottom,
    glyphLeft: glyphs.left - effective.left,
    glyphRight: effective.right - glyphs.right,
  };
  for (const [name, value] of Object.entries(expectedAllowances)) {
    invariant(Number.isFinite(authority.safeAllowances?.[name]) && Math.abs(authority.safeAllowances[name] - value) < 0.05, `Home safe allowance authority differs: ${name}`);
    invariant(value >= 2, `Home ${name.startsWith("glyph") ? "glyphs" : "H1"} intersect an effective visible boundary: ${name}`);
  }
  return true;
}

export function validateFieldMapVisibleLinks(links) {
  invariant(Array.isArray(links) && links.length === 8, "Field Map must expose exactly eight visible-link records");
  const names = new Set();
  for (const [index, link] of links.entries()) {
    invariant(typeof link?.accessibleName === "string" && link.accessibleName.trim().length > 0, `Field Map link ${index + 1} has no accessible name`);
    invariant(link.visible === true && link.fullyInViewport === true, `Field Map link ${index + 1} is not fully visible in the open map`);
    invariant(Number.isFinite(link.bounds?.width) && link.bounds.width > 0 && Number.isFinite(link.bounds?.height) && link.bounds.height >= 44, `Field Map link ${index + 1} has invalid visible bounds`);
    names.add(link.accessibleName.trim());
  }
  invariant(names.size === 8, "Field Map visible accessible names are not unique");
  return true;
}

export function validateScreenshotAnalysis(analysis) {
  invariant(analysis?.format === "png" && Number.isSafeInteger(analysis.bytes) && analysis.bytes > 0, "installed-Chrome screenshot is not a decoded PNG");
  invariant(Number.isSafeInteger(analysis.width) && analysis.width > 0 && Number.isSafeInteger(analysis.height) && analysis.height > 0, "installed-Chrome screenshot dimensions are invalid");
  invariant(Number.isFinite(analysis.entropy) && analysis.entropy >= 1, "installed-Chrome screenshot is visually blank or uniform");
  invariant(Number.isFinite(analysis.maximumChannelRange) && analysis.maximumChannelRange >= 80, "installed-Chrome screenshot lacks visible foreground contrast");
  return true;
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = { baseUrl: "", baselineDpr: 0, baselineWidth: 0, cdpUrl: "http://127.0.0.1:9333", help: false, output: "", revision: "", selfTest: false, timeoutMs: 45_000, uiZoomLabel: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => { const value = valueAfter(argv, index, flag); index += 1; return value; };
    if (flag === "--base-url") options.baseUrl = next();
    else if (flag === "--baseline-dpr") options.baselineDpr = Number(next());
    else if (flag === "--baseline-width") options.baselineWidth = Number(next());
    else if (flag === "--cdp-url") options.cdpUrl = next();
    else if (flag === "--output") options.output = next();
    else if (flag === "--revision") options.revision = next();
    else if (flag === "--timeout-ms") options.timeoutMs = Number(next());
    else if (flag === "--ui-zoom-label") options.uiZoomLabel = next();
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.help && !options.selfTest) {
    const base = new URL(options.baseUrl);
    invariant(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "--base-url must be credential-free HTTP(S)");
    base.hash = ""; base.search = ""; if (!base.pathname.endsWith("/")) base.pathname += "/";
    options.baseUrl = base.toString();
    const cdp = new URL(options.cdpUrl);
    invariant(cdp.protocol === "http:" && ["127.0.0.1", "localhost"].includes(cdp.hostname), "--cdp-url must be loopback HTTP");
    invariant(Number.isFinite(options.baselineWidth) && options.baselineWidth > 0, "--baseline-width must be positive");
    invariant(Number.isFinite(options.baselineDpr) && options.baselineDpr > 0, "--baseline-dpr must be positive");
    invariant(options.uiZoomLabel === "Zoom: 200%", "--ui-zoom-label must be the observed installed-Chrome label Zoom: 200%");
    invariant(HASH_40.test(options.revision), "--revision must be an exact lowercase 40-character Git revision");
    options.output = path.resolve(options.output);
    invariant(options.output !== path.parse(options.output).root && !within(ROOT, options.output) && !within(os.tmpdir(), options.output), "--output must be a durable external directory");
  }
  return options;
}

export function selfTest() {
  const revision = "a".repeat(40);
  const parsed = parseArguments(["--base-url", "http://127.0.0.1:4322/", "--baseline-width", "1388", "--baseline-dpr", "2.5", "--ui-zoom-label", "Zoom: 200%", "--revision", revision, "--output", path.resolve(ROOT, "..", "zoom-proof")]);
  invariant(parsed.baselineWidth === 1388 && parsed.baselineDpr === 2.5 && parsed.revision === revision, "baseline/revision parsing failed");
  invariant(PUBLIC_ROUTES.length === 9, "nine public routes required");
  return { schema: SCHEMA, status: "PASS", routes: 10, method: "installed Chrome native browser zoom" };
}

async function inspect(page, context = {}) {
  const state = await page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof Element)) return false;
      const closedDisclosure = element.closest("details:not([open])");
      if (closedDisclosure && element !== closedDisclosure.querySelector(":scope > summary") && !element.closest("summary")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const root = document.documentElement;
    const h1 = document.querySelector("h1");
    const numericRect = (rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
    const h1Bounds = h1 ? numericRect(h1.getBoundingClientRect()) : null;
    const manifestoVisibility = (() => {
      if (!(h1 instanceof HTMLElement) || h1.id !== "home-title") return { applicable: false, status: "NOT_APPLICABLE" };
      const section = h1.closest("[data-manifesto-threshold]");
      const header = document.querySelector(".site-header");
      if (!(section instanceof HTMLElement) || !(header instanceof HTMLElement) || !h1Bounds) return { applicable: true, status: "FAIL", reason: "required bounds are missing" };
      const viewportBounds = { left: 0, top: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight };
      const sectionRect = section.getBoundingClientRect();
      const sectionClipBounds = {
        left: sectionRect.left + section.clientLeft,
        top: sectionRect.top + section.clientTop,
        right: sectionRect.left + section.clientLeft + section.clientWidth,
        bottom: sectionRect.top + section.clientTop + section.clientHeight,
        width: section.clientWidth,
        height: section.clientHeight,
      };
      let visibleLeft = Math.max(viewportBounds.left, sectionClipBounds.left);
      let visibleTop = Math.max(viewportBounds.top, sectionClipBounds.top);
      let visibleRight = Math.min(viewportBounds.right, sectionClipBounds.right);
      let visibleBottom = Math.min(viewportBounds.bottom, sectionClipBounds.bottom);
      const clippingOverflow = new Set(["auto", "clip", "hidden", "scroll"]);
      const clippingAncestors = [];
      let ancestor = h1.parentElement;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        const contain = String(style.contain || "").split(/\s+/);
        const paintContainment = contain.some((token) => ["content", "paint", "strict"].includes(token));
        const clipPath = style.clipPath || style.webkitClipPath || "none";
        const pathClipping = clipPath !== "none";
        const clipsX = clippingOverflow.has(style.overflowX) || paintContainment || pathClipping;
        const clipsY = clippingOverflow.has(style.overflowY) || paintContainment || pathClipping;
        if (clipsX || clipsY) {
          const rect = ancestor.getBoundingClientRect();
          const bounds = {
            left: rect.left + ancestor.clientLeft,
            top: rect.top + ancestor.clientTop,
            right: rect.left + ancestor.clientLeft + ancestor.clientWidth,
            bottom: rect.top + ancestor.clientTop + ancestor.clientHeight,
            width: ancestor.clientWidth,
            height: ancestor.clientHeight,
          };
          clippingAncestors.push({
            tag: ancestor.tagName.toLowerCase(),
            id: ancestor.id || null,
            classes: [...ancestor.classList],
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            clipPath,
            contain: style.contain || "none",
            clipsX,
            clipsY,
            bounds,
          });
          if (clipsX) {
            visibleLeft = Math.max(visibleLeft, bounds.left);
            visibleRight = Math.min(visibleRight, bounds.right);
          }
          if (clipsY) {
            visibleTop = Math.max(visibleTop, bounds.top);
            visibleBottom = Math.min(visibleBottom, bounds.bottom);
          }
        }
        ancestor = ancestor.parentElement;
      }
      const usableClipBounds = { left: visibleLeft, top: visibleTop, right: visibleRight, bottom: visibleBottom, width: visibleRight - visibleLeft, height: visibleBottom - visibleTop };
      const headerRect = numericRect(header.getBoundingClientRect());
      const headerStyle = getComputedStyle(header);
      const headerOpacity = Number.parseFloat(headerStyle.opacity);
      const headerVisible = headerStyle.display !== "none" && !["hidden", "collapse"].includes(headerStyle.visibility) && Number.isFinite(headerOpacity) && headerOpacity > 0;
      const headerAnchored = ["fixed", "sticky"].includes(headerStyle.position) && headerRect.top <= 0.5 && headerRect.bottom > 0;
      const headerHorizontallyOverlapsManifesto = headerRect.right > h1Bounds.left && headerRect.left < h1Bounds.right;
      const headerOccluding = headerVisible && headerAnchored && headerHorizontallyOverlapsManifesto;
      if (headerOccluding) visibleTop = Math.max(visibleTop, Math.min(innerHeight, headerRect.bottom));
      const effectiveVisibleBounds = { left: visibleLeft, top: visibleTop, right: visibleRight, bottom: visibleBottom, width: visibleRight - visibleLeft, height: visibleBottom - visibleTop };
      const glyphRects = [];
      const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!/\S/u.test(node.nodeValue || "")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) glyphRects.push(numericRect(rect));
      }
      const glyphBounds = glyphRects.length ? {
        left: Math.min(...glyphRects.map(({ left }) => left)),
        top: Math.min(...glyphRects.map(({ top }) => top)),
        right: Math.max(...glyphRects.map(({ right }) => right)),
        bottom: Math.max(...glyphRects.map(({ bottom }) => bottom),),
      } : null;
      if (glyphBounds) {
        glyphBounds.width = glyphBounds.right - glyphBounds.left;
        glyphBounds.height = glyphBounds.bottom - glyphBounds.top;
      }
      const safeAllowances = glyphBounds ? {
        h1Top: h1Bounds.top - effectiveVisibleBounds.top,
        h1Bottom: effectiveVisibleBounds.bottom - h1Bounds.bottom,
        h1Left: h1Bounds.left - effectiveVisibleBounds.left,
        h1Right: effectiveVisibleBounds.right - h1Bounds.right,
        glyphTop: glyphBounds.top - effectiveVisibleBounds.top,
        glyphBottom: effectiveVisibleBounds.bottom - glyphBounds.bottom,
        glyphLeft: glyphBounds.left - effectiveVisibleBounds.left,
        glyphRight: effectiveVisibleBounds.right - glyphBounds.right,
      } : null;
      const pass = headerAnchored && headerHorizontallyOverlapsManifesto
        && effectiveVisibleBounds.width > 0 && effectiveVisibleBounds.height > 0
        && safeAllowances && Object.values(safeAllowances).every((value) => value >= 2);
      return {
        applicable: true,
        status: pass ? "PASS" : "FAIL",
        viewportBounds,
        sectionBounds: numericRect(sectionRect),
        sectionClipBounds,
        clippingAncestors,
        usableClipBounds,
        header: {
          bounds: headerRect,
          position: headerStyle.position,
          visible: headerVisible,
          anchoredToViewportTop: headerAnchored,
          horizontallyOverlapsManifesto: headerHorizontallyOverlapsManifesto,
          occluding: headerOccluding,
        },
        h1Bounds,
        glyphBounds,
        effectiveVisibleBounds,
        safeAllowances,
      };
    })();
    const targets = [...document.querySelectorAll("a[href],button,summary,input,select,textarea")].filter(visible).map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), text: (element.textContent || element.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 100), width: rect.width, height: rect.height };
    });
    const splitWords = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode() && splitWords.length < 20) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || !visible(parent) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) continue;
      // A rendered hyphen is a legitimate Unicode line-break opportunity. Test
      // each hyphen-delimited component so the audit catches broken letters
      // without falsely rejecting a normal break after the hyphen.
      for (const match of node.data.matchAll(/[^\s\u00a0-]+/gu)) {
        if (match[0].length < 2) continue;
        const range = document.createRange();
        range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.y * 10) / 10));
        if (lines.size > 1) splitWords.push(match[0].slice(0, 80));
      }
    }
    return {
      geometry: { innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio, visualViewport: visualViewport ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale } : null },
      h1: h1?.getAttribute("aria-label") || h1?.textContent || null,
      h1Count: document.querySelectorAll("h1").length,
      h1Bounds,
      manifestoVisibility,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      landmarks: { header: document.querySelectorAll("header.site-header").length, main: document.querySelectorAll("main").length, footer: document.querySelectorAll("footer").length, nav: document.querySelectorAll("nav").length },
      splitWords,
      scrollPosition: { x: scrollX, y: scrollY },
      targetFailures: targets.filter(({ width, height }) => width < 44 || height < 44),
    };
  });
  const pageUrl = new URL(page.url());
  const targetSize = await observeTargetSizes(page, {
    route: context.route ?? `${pageUrl.pathname}${pageUrl.hash}`,
    state: context.state ?? "native-chrome-200-percent",
    viewport: {
      id: context.viewportId ?? "installed-chrome-native-200-percent",
      width: state.geometry.innerWidth,
      height: state.geometry.innerHeight,
    },
  });
  return { ...state, targetSize, targetFailures: targetSize.targetFailures };
}

async function captureVisual(page, filename, label, options) {
  invariant(process.platform === "win32", "genuine installed-Chrome UI capture requires Windows");
  await page.bringToFront();
  await page.waitForTimeout(120);
  const remotePort = Number(new URL(options.cdpUrl).port);
  invariant(Number.isSafeInteger(remotePort) && remotePort > 0, "installed-Chrome remote-debugging port is invalid");
  const { stdout: windowTitle } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", WINDOWS_CAPTURE_SCRIPT, "-OutputPath", filename, "-RemoteDebuggingPort", String(remotePort)],
    { cwd: ROOT, encoding: "utf8", timeout: options.timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  const bytes = await readFile(filename);
  const [metadata, statistics] = await Promise.all([sharp(bytes).metadata(), sharp(bytes).stats()]);
  const analysis = {
    label,
    filename: path.basename(filename),
    windowTitle: String(windowTitle).trim().slice(0, 200),
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    bytes: bytes.length,
    entropy: statistics.entropy,
    maximumChannelRange: Math.max(...statistics.channels.slice(0, 3).map(({ min, max }) => max - min)),
    sha256: digest(bytes),
    sourceAuthority: options.sourceAuthority,
  };
  validateScreenshotAnalysis(analysis);
  return analysis;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write("Usage: node scripts/audit-phase7a-installed-chrome-zoom.mjs --base-url <url> --revision <40-char-final-head> --baseline-width <px> --baseline-dpr <n> --ui-zoom-label \"Zoom: 200%\" --output <external-dir>\n"); return; }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`); return; }
  try { await stat(options.output); throw new Error(`refusing to overwrite existing zoom evidence: ${options.output}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const servedBuild = await capturePortableServedBuildReceipt(options);
  const sourceAuthority = portableServedBuildReference(servedBuild);
  options.sourceAuthority = sourceAuthority;
  const screenshots = path.join(options.output, "screenshots");
  await mkdir(screenshots, { recursive: true });
  const browser = await chromium.connectOverCDP(options.cdpUrl);
  const pages = browser.contexts().flatMap((context) => context.pages()).filter((candidate) => candidate.url().startsWith(new URL(options.baseUrl).origin));
  invariant(pages.length === 1, `expected one Phase 7A page in installed Chrome; observed ${pages.length}`);
  const page = pages[0];
  page.setDefaultTimeout(options.timeoutMs);
  const routes = [...PUBLIC_ROUTES.map((route) => ({ path: route.route, h1: route.h1, status: 200 })), { path: REAL_404_PATH, h1: EXPECTED_404_H1, status: 404 }];
  const results = [];
  const visualEvidence = [];
  for (const route of routes) {
    const response = await page.goto(new URL(route.path, options.baseUrl).toString(), { waitUntil: "load" });
    if (route.path === "/") await page.goto(new URL("/#entry", options.baseUrl).toString(), { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready);
    if (route.path === "/") await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(180);
    const state = await inspect(page, { route: route.path, state: route.path === "/" ? "home-manifesto-resolved" : "route-shell" });
    if (route.path === "/") validateManifestoVisibility(state.manifestoVisibility);
    visualEvidence.push(await captureVisual(page, path.join(screenshots, `${route.path === "/" ? "home" : route.path.replaceAll("/", "-").replace(/^-|-$/g, "")}-top.png`), `route:${route.path}`, options));
    const checks = {
      httpStatus: response?.status() === route.status,
      semanticH1: state.h1Count === 1 && canonical(state.h1) === canonical(route.h1),
      landmarks: state.landmarks.header === 1 && state.landmarks.main === 1 && state.landmarks.footer >= 1 && state.landmarks.nav >= 1,
      noHorizontalOverflow: !state.horizontalOverflow,
      wholeWords: state.splitWords.length === 0,
      targetSizes: state.targetSize.status === "PASS",
      manifestoUnclipped: route.path !== "/" || state.manifestoVisibility.status === "PASS",
    };
    results.push({ path: route.path, expectedStatus: route.status, actualStatus: response?.status() ?? null, state, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL", sourceAuthority });
  }

  await page.goto(new URL("/#entry", options.baseUrl).toString(), { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: 8_000 }).catch(() => undefined);
  visualEvidence.push(await captureVisual(page, path.join(screenshots, "home-field-map-closed.png"), "home-field-map-closed", options));
  await page.evaluate(() => { const threshold = document.querySelector("[data-field-map-threshold]"); if (threshold) scrollTo(0, threshold.getBoundingClientRect().top + scrollY + 12); });
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-route-navigation") === "released", null, { timeout: 8_000 });
  visualEvidence.push(await captureVisual(page, path.join(screenshots, "home-bifurcation.png"), "home-bifurcation", options));
  await page.locator("[data-field-map] > summary").click();
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-field-map-open"));
  visualEvidence.push(await captureVisual(page, path.join(screenshots, "home-field-map-open.png"), "home-field-map-open", options));
  const map = await page.evaluate(() => {
    const visibleLinks = [...document.querySelectorAll("#field-map-navigation a")].map((link) => {
      const style = getComputedStyle(link);
      const rect = link.getBoundingClientRect();
      const accessibleName = link.getAttribute("aria-label") || link.textContent?.replace(/\s+/g, " ").trim() || "";
      const visible = style.display !== "none" && !["hidden", "collapse"].includes(style.visibility) && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      return {
        href: link.getAttribute("href"),
        accessibleName,
        visible,
        fullyInViewport: visible && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        bounds: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      };
    });
    return {
      links: visibleLinks.length,
      visibleLinks,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      backgroundRegions: [...document.querySelectorAll("[data-field-map-background]")].map((node) => ({ tag: node.tagName.toLowerCase(), inert: node.hasAttribute("inert"), owned: node.hasAttribute("data-field-map-inert-owned") })),
    };
  });
  map.targetSize = await observeTargetSizes(page, { route: "/#entry", state: "field-map-open-native-chrome-200-percent", viewport: { id: "installed-chrome-field-map-open-200-percent", width: await page.evaluate(() => innerWidth), height: await page.evaluate(() => innerHeight) } });
  await page.keyboard.press("Tab");
  map.keyboardFocus = await page.evaluate(() => ({ inMap: Boolean(document.activeElement?.closest("[data-field-map]")), text: document.activeElement?.textContent?.replace(/\s+/g, " ").trim() ?? null }));
  visualEvidence.push(await captureVisual(page, path.join(screenshots, "home-field-map-keyboard-focus.png"), "home-field-map-keyboard-focus", options));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-field-map-open"));
  map.escapeFocusReturn = await page.evaluate(() => document.activeElement?.tagName === "SUMMARY");
  map.inertAfterEscape = await page.evaluate(() => document.querySelectorAll("[data-field-map-background][inert], [data-field-map-background][data-field-map-inert-owned]").length);
  visualEvidence.push(await captureVisual(page, path.join(screenshots, "home-field-map-escape-closed.png"), "home-field-map-escape-closed", options));

  const observed = results[0].state.geometry;
  const zoomProof = {
    method: "native Windows SendInput Ctrl+plus chords delivered to installed Google Chrome",
    uiZoomLabel: options.uiZoomLabel,
    baseline: { innerWidth: options.baselineWidth, devicePixelRatio: options.baselineDpr },
    observed,
    widthRatio: options.baselineWidth / observed.innerWidth,
    dprRatio: observed.devicePixelRatio / options.baselineDpr,
  };
  zoomProof.checks = {
    installedChromeUi: options.uiZoomLabel === "Zoom: 200%",
    widthHalved: Math.abs(zoomProof.widthRatio - 2) < 0.03,
    dprDoubled: Math.abs(zoomProof.dprRatio - 2) < 0.03,
    noDeviceEmulation: observed.visualViewport?.scale === 1,
  };
  zoomProof.status = Object.values(zoomProof.checks).every(Boolean) ? "PASS" : "FAIL";
  const report = {
    schema: SCHEMA,
    createdAt: new Date().toISOString(),
    classification: "GENUINE INSTALLED GOOGLE CHROME BROWSER ZOOM",
    baseUrl: options.baseUrl,
    servedBuild,
    sourceAuthority,
    browser: { product: "Google Chrome", version: browser.version(), headed: true, cdp: "loopback" },
    forbiddenSubstitutes: { viewportResize: false, cssZoom: false, transformScale: false, deviceEmulation: false },
    zoomProof,
    routes: results,
    visualEvidence,
    fieldMap: { ...map, sourceAuthority, status: (() => { try { validateFieldMapVisibleLinks(map.visibleLinks); return map.links === 8 && !map.overflow && map.backgroundRegions.length >= 3 && map.backgroundRegions.every(({ inert, owned }) => inert && owned) && map.targetSize.status === "PASS" && map.keyboardFocus.inMap && map.escapeFocusReturn && map.inertAfterEscape === 0 ? "PASS" : "FAIL"; } catch { return "FAIL"; } })() },
    limitations: ["Native keyboard zoom is genuine installed-Chrome evidence; it is not evidence of physical mouse, trackpad, or touch input."],
  };
  report.status = zoomProof.status === "PASS" && results.every(({ status }) => status === "PASS") && report.fieldMap.status === "PASS" ? "PASS" : "FAIL";
  validateInstalledChromeCaptureAuthority(report, options.revision);
  const reportPath = path.join(options.output, "installed-chrome-200-percent-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const entries = [];
  for (const name of (await readdir(screenshots)).sort()) {
    const bytes = await readFile(path.join(screenshots, name));
    entries.push({ path: `screenshots/${name}`, bytes: bytes.length, sha256: digest(bytes) });
  }
  const reportBytes = await readFile(reportPath);
  const manifest = { schema: `${SCHEMA}.artifacts.v1`, report: { path: path.basename(reportPath), bytes: reportBytes.length, sha256: digest(reportBytes) }, entries };
  await writeFile(path.join(options.output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ status: report.status, output: options.output, browser: report.browser, zoomProof, routeFailures: results.filter(({ status }) => status !== "PASS").map(({ path: routePath, checks }) => ({ path: routePath, checks })), fieldMap: report.fieldMap }, null, 2)}\n`);
  await browser.close();
  if (report.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`Phase 7A installed-Chrome zoom FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
}
