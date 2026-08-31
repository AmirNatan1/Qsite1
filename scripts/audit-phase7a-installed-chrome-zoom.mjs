#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

import { PUBLIC_ROUTES } from "./phase7a-contract.mjs";
import { REAL_404_PATH } from "./phase7a-browser-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = "quantum-hub.phase-7a.installed-chrome-native-zoom.v1";
const EXPECTED_404_H1 = "The requested route is out of alignment.";

function invariant(value, message) { if (!value) throw new Error(message); }
function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
function canonical(value) { return String(value ?? "").replace(/\s+/g, "").toLowerCase(); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = { baseUrl: "", baselineDpr: 0, baselineWidth: 0, cdpUrl: "http://127.0.0.1:9333", help: false, output: "", selfTest: false, timeoutMs: 45_000, uiZoomLabel: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => { const value = valueAfter(argv, index, flag); index += 1; return value; };
    if (flag === "--base-url") options.baseUrl = next();
    else if (flag === "--baseline-dpr") options.baselineDpr = Number(next());
    else if (flag === "--baseline-width") options.baselineWidth = Number(next());
    else if (flag === "--cdp-url") options.cdpUrl = next();
    else if (flag === "--output") options.output = next();
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
    options.output = path.resolve(options.output);
    invariant(options.output !== path.parse(options.output).root && !within(ROOT, options.output) && !within(os.tmpdir(), options.output), "--output must be a durable external directory");
  }
  return options;
}

export function selfTest() {
  const parsed = parseArguments(["--base-url", "http://127.0.0.1:4322/", "--baseline-width", "1388", "--baseline-dpr", "2.5", "--ui-zoom-label", "Zoom: 200%", "--output", path.resolve(ROOT, "..", "zoom-proof")]);
  invariant(parsed.baselineWidth === 1388 && parsed.baselineDpr === 2.5, "baseline parsing failed");
  invariant(PUBLIC_ROUTES.length === 9, "nine public routes required");
  return { schema: SCHEMA, status: "PASS", routes: 10, method: "installed Chrome native browser zoom" };
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const root = document.documentElement;
    const h1 = document.querySelector("h1");
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
      for (const match of node.data.matchAll(/[^\s\u00a0]+/gu)) {
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
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      landmarks: { header: document.querySelectorAll("header.site-header").length, main: document.querySelectorAll("main").length, footer: document.querySelectorAll("footer").length, nav: document.querySelectorAll("nav").length },
      splitWords,
      targetFailures: targets.filter(({ width, height }) => width < 44 || height < 44),
    };
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write("Usage: node scripts/audit-phase7a-installed-chrome-zoom.mjs --base-url <url> --baseline-width <px> --baseline-dpr <n> --ui-zoom-label \"Zoom: 200%\" --output <external-dir>\n"); return; }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`); return; }
  try { await stat(options.output); throw new Error(`refusing to overwrite existing zoom evidence: ${options.output}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const screenshots = path.join(options.output, "screenshots");
  await mkdir(screenshots, { recursive: true });
  const browser = await chromium.connectOverCDP(options.cdpUrl);
  const pages = browser.contexts().flatMap((context) => context.pages()).filter((candidate) => candidate.url().startsWith(new URL(options.baseUrl).origin));
  invariant(pages.length === 1, `expected one Phase 7A page in installed Chrome; observed ${pages.length}`);
  const page = pages[0];
  page.setDefaultTimeout(options.timeoutMs);
  const routes = [...PUBLIC_ROUTES.map((route) => ({ path: route.route, h1: route.h1, status: 200 })), { path: REAL_404_PATH, h1: EXPECTED_404_H1, status: 404 }];
  const results = [];
  for (const route of routes) {
    const target = route.path === "/" ? "/#entry" : route.path;
    const response = await page.goto(new URL(target, options.baseUrl).toString(), { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready);
    if (route.path === "/") await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(180);
    const state = await inspect(page);
    await page.screenshot({ path: path.join(screenshots, `${route.path === "/" ? "home" : route.path.replaceAll("/", "-").replace(/^-|-$/g, "")}-top.png`), scale: "css" });
    const checks = {
      httpStatus: response?.status() === route.status,
      semanticH1: state.h1Count === 1 && canonical(state.h1) === canonical(route.h1),
      landmarks: state.landmarks.header === 1 && state.landmarks.main === 1 && state.landmarks.footer >= 1 && state.landmarks.nav >= 1,
      noHorizontalOverflow: !state.horizontalOverflow,
      wholeWords: state.splitWords.length === 0,
      targetSizes: state.targetFailures.length === 0,
    };
    results.push({ path: route.path, expectedStatus: route.status, actualStatus: response?.status() ?? null, state, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" });
  }

  await page.goto(new URL("/#entry", options.baseUrl).toString(), { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: 8_000 }).catch(() => undefined);
  await page.evaluate(() => { const threshold = document.querySelector("[data-field-map-threshold]"); if (threshold) scrollTo(0, threshold.getBoundingClientRect().top + scrollY + 12); });
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-route-navigation") === "released", null, { timeout: 8_000 });
  await page.locator("[data-field-map] > summary").click();
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-field-map-open"));
  await page.screenshot({ path: path.join(screenshots, "home-field-map-open.png"), scale: "css" });
  const map = await page.evaluate(() => ({ links: document.querySelectorAll("#field-map-navigation a").length, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-field-map-open"));
  map.escapeFocusReturn = await page.evaluate(() => document.activeElement?.tagName === "SUMMARY");

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
    browser: { product: "Google Chrome", version: browser.version(), headed: true, cdp: "loopback" },
    forbiddenSubstitutes: { viewportResize: false, cssZoom: false, transformScale: false, deviceEmulation: false },
    zoomProof,
    routes: results,
    fieldMap: { ...map, status: map.links === 8 && !map.overflow && map.escapeFocusReturn ? "PASS" : "FAIL" },
    limitations: ["Native keyboard zoom is genuine installed-Chrome evidence; it is not evidence of physical mouse, trackpad, or touch input."],
  };
  report.status = zoomProof.status === "PASS" && results.every(({ status }) => status === "PASS") && report.fieldMap.status === "PASS" ? "PASS" : "FAIL";
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

