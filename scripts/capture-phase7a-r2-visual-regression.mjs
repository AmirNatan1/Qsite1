#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright-core";
import sharp from "sharp";

import { PHASE7A_R2_PARENT } from "./phase7a-r2-field-map-authority.mjs";
import {
  PHASE7A_R2_VISUAL_REGRESSION_CAPTURE_PATHS,
  PHASE7A_R2_VISUAL_REGRESSION_MANIFEST_SCHEMA,
  PHASE7A_R2_VISUAL_REGRESSION_METHOD,
  PHASE7A_R2_VISUAL_REGRESSION_PATHS,
  PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH,
  PHASE7A_R2_VISUAL_REGRESSION_SCHEMA,
  PHASE7A_R2_VISUAL_BASELINE_RECEIPT_SHA256,
  phase7aR2VisualRegressionSelfTest,
  validatePhase7aR2VisualRegressionAuthority,
} from "./phase7a-r2-visual-regression-authority.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT), "..");
const DEFAULT_CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const ROUTE = "/about/";
const CAPTURE_SETTLE_MS = 150;
const DEFAULT_TIMEOUT_MS = 45_000;
const NETWORK_DRAIN_TIMEOUT_MS = 15_000;
const RESPONSE_BODY_TIMEOUT_MS = 10_000;

function invariant(value, message) { if (!value) throw new Error(message); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function stable(value) {
  const normalize = (item) => Array.isArray(item) ? item.map(normalize) : item && typeof item === "object"
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])])) : item;
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}
async function withDeadline(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms`)), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
async function exists(candidate) { try { await access(candidate); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } }
async function nearestExistingDirectory(candidate) {
  let cursor = path.resolve(candidate);
  for (;;) {
    try { const info = await lstat(cursor); invariant(info.isDirectory(), `visual-regression ancestor is not a directory: ${cursor}`); return cursor; }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    const parent = path.dirname(cursor);
    invariant(parent !== cursor, "visual-regression output has no existing ancestor");
    cursor = parent;
  }
}
async function assertExternalOutput(candidate) {
  const resolved = path.resolve(candidate);
  invariant(resolved !== path.parse(resolved).root && !within(ROOT, resolved) && !within(os.tmpdir(), resolved), "visual-regression output must be a fresh external non-temporary directory");
  const ancestor = await nearestExistingDirectory(path.dirname(resolved));
  const [realRoot, realTemp, realAncestor] = await Promise.all([realpath(ROOT), realpath(os.tmpdir()), realpath(ancestor)]);
  const projected = path.resolve(realAncestor, path.relative(ancestor, resolved));
  invariant(!within(realRoot, projected) && !within(realTemp, projected), "visual-regression output real path must remain external and non-temporary");
  invariant(!await exists(resolved), "refusing to overwrite existing visual-regression evidence");
  return resolved;
}
function valueAfter(argv, index, flag) { const value = argv[index + 1]; invariant(value && !value.startsWith("--"), `${flag} requires a value`); return value; }
function immutableUrl(value, flag) {
  const url = new URL(value);
  invariant(url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash && /^[0-9a-f]{8}\.qsite1\.pages\.dev$/.test(url.hostname), `${flag} must be a Qsite1 immutable deployment URL`);
  return url.toString();
}

export function parseArguments(argv) {
  const options = { baselineUrl: "", currentUrl: "", baselineDeployment: "", currentDeployment: "", chromeExecutable: DEFAULT_CHROME, currentRevision: "", output: "", timeoutMs: DEFAULT_TIMEOUT_MS, selfTest: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => { const value = valueAfter(argv, index, flag); index += 1; return value; };
    if (flag === "--baseline-url") options.baselineUrl = immutableUrl(next(), flag);
    else if (flag === "--current-url") options.currentUrl = immutableUrl(next(), flag);
    else if (flag === "--baseline-deployment") options.baselineDeployment = path.resolve(next());
    else if (flag === "--current-deployment") options.currentDeployment = path.resolve(next());
    else if (flag === "--chrome-executable") options.chromeExecutable = path.resolve(next());
    else if (flag === "--current-revision") options.currentRevision = next();
    else if (flag === "--output") options.output = path.resolve(next());
    else if (flag === "--timeout-ms") options.timeoutMs = Number(next());
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.help && !options.selfTest) {
    for (const key of ["baselineUrl", "currentUrl", "baselineDeployment", "currentDeployment", "currentRevision", "output"]) invariant(options[key], `--${key} is required`);
    invariant(HASH_40.test(options.currentRevision) && options.currentRevision !== PHASE7A_R2_PARENT, "--current-revision must be the exact new R2 SHA");
    invariant(options.baselineUrl !== options.currentUrl, "baseline and current immutable URLs must differ");
    invariant(Number.isSafeInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms must be 5000..120000");
  }
  return options;
}

function exactImmutableUrl(deploymentId) { invariant(UUID.test(deploymentId ?? ""), "deployment UUID differs"); return `https://${deploymentId.slice(0, 8)}.qsite1.pages.dev/`; }
export function deploymentBindingFromReceipt(report, revision, profile) {
  if (profile === "baseline") {
    invariant(report?.schema === "quantum-hub.phase-7a-r1.evidence-assembler.v1.deployment" && report.status === "PASS" && report.authorityProfile === "phase7a-r1"
      && revision === PHASE7A_R2_PARENT && report.commitHash === revision && report.signedDeploymentBinding === true && report.signedCloudflareCheckBinding === true, "R1 deployment receipt authority differs");
    const row = report.payloadLedger?.find((item) => item.relativePath === "about/index.html");
    invariant(row?.status === "PASS" && row.localDist === "PASS" && row.immutable?.status === "PASS" && row.immutable.actualHttpStatus === 200
      && Number.isSafeInteger(row.bytes) && row.bytes > 0 && HASH_64.test(row.sha256 ?? "") && row.immutable.bytes === row.bytes && row.immutable.sha256 === row.sha256, "R1 about document deployment binding differs");
    return { revision, deploymentId: report.deploymentId, immutableUrl: exactImmutableUrl(report.deploymentId), expectedDocument: { bytes: row.bytes, sha256: row.sha256 } };
  }
  invariant(report?.schema === "quantum-hub.phase-7a.deployment-verification.v1" && report.status === "PASS" && report.authorityProfile === "phase7a-r2"
    && report.deployedSha === revision && report.parity === "PASS" && report.deployment?.status === "PASS" && report.deployment.data?.status === "PASS"
    && report.deployment.data.deployedSha === revision && report.deployment.data.deploymentId === report.deploymentId && report.deployment.data.immutableUrl === report.immutableUrl, "R2 deployment receipt authority differs");
  const row = report.dist?.files?.find((item) => item.relativePath === "about/index.html");
  invariant(row && Number.isSafeInteger(row.bytes) && row.bytes > 0 && HASH_64.test(row.sha256 ?? ""), "R2 about document deployment binding differs");
  const immutableRow = report.origins?.immutable?.data?.responses?.find((item) => item.relativePath === "about/index.html");
  invariant(report.origins?.immutable?.status === "PASS" && report.origins.immutable.data?.status === "PASS" && immutableRow?.status === "PASS"
    && immutableRow.actualHttpStatus === 200 && immutableRow.bytes === row.bytes && immutableRow.sha256 === row.sha256, "R2 immutable about response binding differs");
  invariant(report.immutableUrl === exactImmutableUrl(report.deploymentId), "R2 immutable deployment URL differs");
  return { revision, deploymentId: report.deploymentId, immutableUrl: report.immutableUrl, expectedDocument: { bytes: row.bytes, sha256: row.sha256 } };
}

function receiptAssetRows(report, profile) {
  if (profile === "baseline") {
    return new Map((report.payloadLedger ?? []).filter((row) => typeof row.publicPath === "string").map((row) => [row.publicPath, {
      bytes: row.bytes, sha256: row.sha256, status: row.status, httpStatus: row.immutable?.actualHttpStatus,
      deployedBytes: row.immutable?.bytes, deployedSha256: row.immutable?.sha256, deployedStatus: row.immutable?.status,
    }]));
  }
  const deployed = new Map((report.origins?.immutable?.data?.responses ?? []).filter((row) => typeof row.publicPath === "string").map((row) => [row.publicPath, row]));
  return new Map((report.dist?.files ?? []).filter((row) => typeof row.requestPath === "string").map((row) => {
    const immutable = deployed.get(row.requestPath);
    return [row.requestPath, {
      bytes: row.bytes, sha256: row.sha256, status: "PASS", httpStatus: immutable?.actualHttpStatus,
      deployedBytes: immutable?.bytes, deployedSha256: immutable?.sha256, deployedStatus: immutable?.status,
    }];
  }));
}

export function validateLoadedAssetsAgainstReceipt(assets, report, profile) {
  invariant(Array.isArray(assets) && assets.length > 0, `${profile} loaded asset inventory is empty`);
  const signedRows = receiptAssetRows(report, profile);
  for (const asset of assets) {
    const pathname = new URL(asset.url).pathname;
    const row = signedRows.get(pathname);
    invariant(row && row.status === "PASS" && row.deployedStatus === "PASS" && row.httpStatus === 200
      && row.bytes === asset.bytes && row.sha256 === asset.sha256 && row.deployedBytes === asset.bytes && row.deployedSha256 === asset.sha256,
    `${profile} loaded asset differs from its signed deployment receipt: ${pathname}`);
  }
  return true;
}

export async function exactDecodedPixels(leftBytes, rightBytes, label = "visual pair") {
  const [left, right] = await Promise.all([
    sharp(leftBytes, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(rightBytes, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  invariant(left.info.width === right.info.width && left.info.height === right.info.height && left.info.channels === right.info.channels, `${label} decoded dimensions differ`);
  let differentPixels = 0;
  let maxChannelDelta = 0;
  for (let offset = 0; offset < left.data.length; offset += left.info.channels) {
    let differs = false;
    for (let channel = 0; channel < left.info.channels; channel += 1) {
      const delta = Math.abs(left.data[offset + channel] - right.data[offset + channel]);
      if (delta) differs = true;
      if (delta > maxChannelDelta) maxChannelDelta = delta;
    }
    if (differs) differentPixels += 1;
  }
  invariant(differentPixels === 0 && maxChannelDelta === 0, `${label} pixels differ (${differentPixels} pixels; maximum channel delta ${maxChannelDelta})`);
  return { classification: "EXACT_DECODED_PIXELS", encodedBytesEqual: Buffer.from(leftBytes).equals(Buffer.from(rightBytes)), differentPixels, maxChannelDelta, status: "PASS" };
}

async function browserIdentity(browser) {
  const session = await browser.newBrowserCDPSession();
  try {
    const identity = await session.send("Browser.getVersion");
    invariant(/^Chrome\/\d/.test(identity.product ?? "") && /\bChrome\/\d/.test(identity.userAgent ?? "") && !/\b(?:HeadlessChrome|Edg|OPR)\//.test(identity.userAgent ?? ""), "visual-regression browser is not installed/headed Google Chrome");
    return { name: "Google Chrome", product: identity.product, version: browser.version(), userAgent: identity.userAgent, installed: true, headed: true };
  } finally { await session.detach(); }
}

async function drainRevisionNetwork(page, phase, revision, timeoutMs) {
  const deadlineMs = Math.min(timeoutMs, NETWORK_DRAIN_TIMEOUT_MS);
  const deadline = Date.now() + deadlineMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  await withDeadline(page.waitForLoadState("networkidle", { timeout: remaining() }), remaining(), `${revision} network-idle wait`);
  let emptyRounds = 0;
  while (Date.now() < deadline && emptyRounds < 3) {
    const pending = phase.pendingByRevision.get(revision);
    const snapshot = [...pending];
    if (snapshot.length > 0) {
      await withDeadline(Promise.all(snapshot), remaining(), `${revision} response-body drain`);
      emptyRounds = 0;
    } else {
      await withDeadline(page.waitForTimeout(50), remaining(), `${revision} late-response settle`);
      emptyRounds = pending.size === 0 ? emptyRounds + 1 : 0;
    }
  }
  const errors = phase.assetErrorsByRevision.get(revision);
  invariant(phase.pendingByRevision.get(revision).size === 0 && emptyRounds === 3, `${revision} network response handlers did not drain before the deadline`);
  invariant(errors.length === 0, `${revision} asset authority failed: ${errors.map((error) => error.message).join("; ")}`);
}

async function metrics(page) {
  return page.evaluate(() => ({
    innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight,
    outerWidth, outerHeight, visualViewportWidth: visualViewport?.width ?? null, visualViewportHeight: visualViewport?.height ?? null,
    visualViewportScale: visualViewport?.scale ?? null, scrollbarWidth: innerWidth - document.documentElement.clientWidth,
    devicePixelRatio, scrollX, scrollY, fontsReady: !document.fonts || document.fonts.status === "loaded",
  }));
}

async function keyboardFocusSummary(page) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  for (let step = 0; step < 24; step += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement === document.querySelector("[data-field-map] > summary"))) return;
  }
  throw new Error("keyboard traversal did not reach the Field Map summary");
}

async function keyboardReturnToSummary(page) {
  for (let step = 0; step < 12; step += 1) {
    if (await page.evaluate(() => document.activeElement === document.querySelector("[data-field-map] > summary"))) return;
    await page.keyboard.press("Shift+Tab");
  }
  throw new Error("reverse keyboard traversal did not return to the Field Map summary");
}

async function stableScreenshot(page, label) {
  const first = await page.screenshot({ type: "png", fullPage: false });
  await page.waitForTimeout(CAPTURE_SETTLE_MS);
  const second = await page.screenshot({ type: "png", fullPage: false });
  await exactDecodedPixels(first, second, `${label} duplicate neutral capture`);
  return first;
}

async function imageRecord(bytes, relativePath, recordedMetrics, focus, fieldMapOpen) {
  const info = await sharp(bytes, { failOn: "error" }).metadata();
  return { path: relativePath, bytes: bytes.length, sha256: digest(bytes), width: info.width, height: info.height, channels: info.channels, focus, fieldMapOpen, metrics: recordedMetrics };
}

async function captureRevision({ page, binding, runtime, phase, includeLinkFocus = false }) {
  phase.value = binding.revision;
  const response = await page.goto(new URL(ROUTE, binding.immutableUrl).toString(), { waitUntil: "load" });
  invariant(response && response.status() === 200 && !response.request().redirectedFrom(), `${binding.revision} about navigation differs`);
  const documentBytes = await withDeadline(response.body(), Math.min(phase.timeoutMs, RESPONSE_BODY_TIMEOUT_MS), `${binding.revision} document body`);
  invariant(documentBytes.length === binding.expectedDocument.bytes && digest(documentBytes) === binding.expectedDocument.sha256, `${binding.revision} served about document differs from deployment receipt`);
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded", null, { timeout: 10_000 });
  await drainRevisionNetwork(page, phase, binding.revision, phase.timeoutMs);
  await page.waitForTimeout(CAPTURE_SETTLE_MS);
  await keyboardFocusSummary(page);
  const closedBytes = await stableScreenshot(page, `${binding.revision} closed summary focus`);
  const closedMetrics = await metrics(page);
  invariant(closedMetrics.fontsReady === true, `${binding.revision} fonts were not ready`);

  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("[data-field-map]")?.open === true && document.documentElement.hasAttribute("data-field-map-open"));
  await page.waitForFunction(() => document.activeElement?.matches?.("[data-field-map] a[href]"));
  await keyboardReturnToSummary(page);
  await page.waitForTimeout(CAPTURE_SETTLE_MS);
  const openBytes = await stableScreenshot(page, `${binding.revision} open summary focus`);
  const openMetrics = await metrics(page);

  let link = null;
  if (includeLinkFocus) {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("[data-field-map]")?.open === false
      && !document.documentElement.hasAttribute("data-field-map-open")
      && document.activeElement === document.querySelector("[data-field-map] > summary"));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("[data-field-map]")?.open === true
      && document.documentElement.hasAttribute("data-field-map-open")
      && document.activeElement?.matches?.("[data-field-map] a[aria-current=\"page\"]"));
    const focused = await page.evaluate(() => ({
      match: document.activeElement?.matches?.("[data-field-map] a[aria-current=\"page\"]") === true,
      name: document.activeElement?.getAttribute?.("aria-label") ?? null,
      geometry: (() => { const rect = document.activeElement?.getBoundingClientRect?.(); return rect ? { selector: "[data-field-map] a[aria-current=\"page\"]", x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null; })(),
    }));
    invariant(focused.match && focused.name === "06 About 06 / position" && focused.geometry, "current-first link focus differs");
    await page.waitForTimeout(CAPTURE_SETTLE_MS);
    const bytes = await stableScreenshot(page, `${binding.revision} open About link focus`);
    link = { bytes, accessibleName: focused.name, focusedElementGeometry: focused.geometry, metrics: await metrics(page) };
  }
  await drainRevisionNetwork(page, phase, binding.revision, phase.timeoutMs);
  const revisionErrors = (rows) => rows.filter((row) => row.revision === binding.revision);
  invariant([runtime.consoleErrors, runtime.pageErrors, runtime.failedRequests, runtime.redirects].every((rows) => revisionErrors(rows).length === 0), `${binding.revision} runtime/network errors differ`);
  return { document: { status: response.status(), bytes: documentBytes.length, sha256: digest(documentBytes), finalUrl: page.url() }, closedBytes, openBytes, closedMetrics, openMetrics, link };
}

async function writeBytes(root, relativePath, bytes) { const target = path.join(root, ...relativePath.split("/")); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: "wx" }); }

export async function capturePhase7aR2VisualRegression(options) {
  options.output = await assertExternalOutput(options.output);
  for (const filename of [options.baselineDeployment, options.currentDeployment, options.chromeExecutable]) invariant(await exists(filename), `required visual-regression input is missing: ${path.basename(filename)}`);
  const [baselineReceiptBytes, currentReceiptBytes] = await Promise.all([options.baselineDeployment, options.currentDeployment].map((filename) => readFile(filename)));
  invariant(digest(baselineReceiptBytes) === PHASE7A_R2_VISUAL_BASELINE_RECEIPT_SHA256, "R1 deployment receipt bytes differ from the accepted authority");
  const baselineReceipt = JSON.parse(baselineReceiptBytes.toString("utf8"));
  const currentReceipt = JSON.parse(currentReceiptBytes.toString("utf8"));
  const baselineBinding = { ...deploymentBindingFromReceipt(baselineReceipt, PHASE7A_R2_PARENT, "baseline"), receiptSha256: digest(baselineReceiptBytes) };
  const currentBinding = { ...deploymentBindingFromReceipt(currentReceipt, options.currentRevision, "current"), receiptSha256: digest(currentReceiptBytes) };
  invariant(options.baselineUrl === baselineBinding.immutableUrl && options.currentUrl === currentBinding.immutableUrl, "capture URLs differ from signed immutable deployment receipts");
  invariant(/^chrome(?:\.exe)?$/i.test(path.basename(options.chromeExecutable)), "installed browser executable must be named Chrome");

  const staging = path.join(path.dirname(options.output), `.${path.basename(options.output)}.staging-${randomUUID()}`);
  let browser;
  try {
    await mkdir(staging, { recursive: false });
    browser = await chromium.launch({ executablePath: options.chromeExecutable, headless: false });
    const identity = await browserIdentity(browser);
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "no-preference" });
    const page = await context.newPage();
    const topology = { browserCount: 1, contextCount: browser.contexts().length, pageCount: context.pages().length };
    invariant(topology.contextCount === 1 && topology.pageCount === 1, "visual-regression browser topology differs from the single-context/single-page authority");
    Object.assign(identity, topology);
    page.setDefaultTimeout(options.timeoutMs);
    const runtime = { consoleErrors: [], pageErrors: [], failedRequests: [], redirects: [] };
    const phase = {
      value: "", timeoutMs: options.timeoutMs,
      pendingByRevision: new Map([[PHASE7A_R2_PARENT, new Set()], [options.currentRevision, new Set()]]),
      assetErrorsByRevision: new Map([[PHASE7A_R2_PARENT, []], [options.currentRevision, []]]),
    };
    const assetsByRevision = new Map([[PHASE7A_R2_PARENT, new Map()], [options.currentRevision, new Map()]]);
    page.on("console", (message) => { if (message.type() === "error") runtime.consoleErrors.push({ revision: phase.value, text: message.text() }); });
    page.on("pageerror", (error) => runtime.pageErrors.push({ revision: phase.value, message: error.message }));
    page.on("requestfailed", (request) => runtime.failedRequests.push({ revision: phase.value, url: request.url(), error: request.failure()?.errorText ?? "unknown" }));
    page.on("response", (response) => {
      const responseOrigin = new URL(response.url()).origin;
      const revision = responseOrigin === new URL(baselineBinding.immutableUrl).origin ? PHASE7A_R2_PARENT
        : responseOrigin === new URL(currentBinding.immutableUrl).origin ? options.currentRevision : phase.value;
      const request = response.request();
      if (request.redirectedFrom()) runtime.redirects.push({ revision, url: response.url() });
      if (!["stylesheet", "script", "font", "image"].includes(request.resourceType())) return;
      const pending = withDeadline((async () => {
        const binding = revision === PHASE7A_R2_PARENT ? baselineBinding : currentBinding;
        invariant(new URL(response.url()).origin === new URL(binding.immutableUrl).origin, `${revision} loaded an external visual/runtime asset`);
        invariant(response.status() >= 200 && response.status() < 300, `${revision} asset response failed: ${response.url()}`);
        const bytes = await response.body();
        invariant(bytes.length > 0, `${revision} asset response is empty: ${response.url()}`);
        assetsByRevision.get(revision).set(response.url(), { kind: request.resourceType(), url: response.url(), status: response.status(), contentType: response.headers()["content-type"] ?? "unknown", bytes: bytes.length, sha256: digest(bytes) });
      })(), Math.min(options.timeoutMs, RESPONSE_BODY_TIMEOUT_MS), `${revision} asset response body: ${response.url()}`).catch((error) => {
        phase.assetErrorsByRevision.get(revision).push(error);
      });
      const pendingSet = phase.pendingByRevision.get(revision);
      pendingSet.add(pending);
      pending.finally(() => pendingSet.delete(pending));
    });

    const baseline = await captureRevision({ page, binding: baselineBinding, runtime, phase });
    const current = await captureRevision({ page, binding: currentBinding, runtime, phase, includeLinkFocus: true });
    invariant(browser.contexts().length === 1 && context.pages().length === 1, "visual-regression browser topology changed during capture");
    await context.close();
    await browser.close();
    browser = null;

    const pathFor = (revision, state) => revision === PHASE7A_R2_PARENT
      ? (state === "closed" ? PHASE7A_R2_VISUAL_REGRESSION_PATHS.parentClosed : PHASE7A_R2_VISUAL_REGRESSION_PATHS.parentOpen)
      : (state === "closed" ? PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentClosed : PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentOpen);
    const rows = [];
    for (const [state, fieldMapOpen] of [["closed", false], ["open", true]]) {
      const baselineBytes = baseline[`${state}Bytes`];
      const currentBytes = current[`${state}Bytes`];
      const baselineImage = await imageRecord(baselineBytes, pathFor(PHASE7A_R2_PARENT, state), baseline[`${state}Metrics`], "field-map-summary", fieldMapOpen);
      const currentImage = await imageRecord(currentBytes, pathFor(options.currentRevision, state), current[`${state}Metrics`], "field-map-summary", fieldMapOpen);
      rows.push({ state: `${state}-summary-focused`, baseline: baselineImage, current: currentImage, result: await exactDecodedPixels(baselineBytes, currentBytes, `${state} parent/current same-session pair`) });
    }
    const currentLinkBytes = current.link.bytes;
    const currentLinkImage = await imageRecord(currentLinkBytes, PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentLinkFocused, current.link.metrics, "field-map-link", true);
    const loaded = (revision) => [...assetsByRevision.get(revision).values()].sort((left, right) => Buffer.compare(Buffer.from(left.url), Buffer.from(right.url)));
    validateLoadedAssetsAgainstReceipt(loaded(PHASE7A_R2_PARENT), baselineReceipt, "baseline");
    validateLoadedAssetsAgainstReceipt(loaded(options.currentRevision), currentReceipt, "current");
    const report = {
      schema: PHASE7A_R2_VISUAL_REGRESSION_SCHEMA, status: "PASS", method: PHASE7A_R2_VISUAL_REGRESSION_METHOD,
      baselineRevision: PHASE7A_R2_PARENT, currentRevision: options.currentRevision,
      captureTool: { path: "scripts/capture-phase7a-r2-visual-regression.mjs", sha256: digest(await readFile(SCRIPT)) },
      browser: identity, viewport: { ...VIEWPORT, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "no-preference" },
      bindings: {
        baseline: { revision: baselineBinding.revision, deploymentId: baselineBinding.deploymentId, immutableUrl: baselineBinding.immutableUrl, receiptSha256: baselineBinding.receiptSha256, document: baseline.document, loadedAssets: loaded(PHASE7A_R2_PARENT) },
        current: { revision: currentBinding.revision, deploymentId: currentBinding.deploymentId, immutableUrl: currentBinding.immutableUrl, receiptSha256: currentBinding.receiptSha256, document: current.document, loadedAssets: loaded(options.currentRevision) },
      },
      captureOrder: ["baseline:closed-summary-focused", "baseline:open-summary-focused", "current:closed-summary-focused", "current:open-summary-focused", "current:open-link-focused"],
      comparisons: rows,
      currentLinkFocused: { image: currentLinkImage, accessibleName: current.link.accessibleName, focusedElementGeometry: current.link.focusedElementGeometry, excludedFromCreativeComparison: true },
      runtime, neutralMasks: [],
      checks: { sameInstalledHeadedBrowserSession: true, sameContextAndPage: true, sameViewportDprAndScrollbar: rows.every((row) => JSON.stringify(row.baseline.metrics) === JSON.stringify(row.current.metrics)), summaryFocusedPairs: true, stableDuplicateFrames: true, exactDecodedPixels: true, linkFocusedEvidenceSeparate: true, deploymentDocumentsRecorded: true },
    };
    validatePhase7aR2VisualRegressionAuthority(report, { currentRevision: options.currentRevision });
    invariant(report.checks.sameViewportDprAndScrollbar, "parent/current geometry differs inside the same browser session");
    for (const [relativePath, bytes] of [
      [PHASE7A_R2_VISUAL_REGRESSION_PATHS.parentClosed, baseline.closedBytes], [PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentClosed, current.closedBytes],
      [PHASE7A_R2_VISUAL_REGRESSION_PATHS.parentOpen, baseline.openBytes], [PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentOpen, current.openBytes],
      [PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentLinkFocused, currentLinkBytes],
    ]) await writeBytes(staging, relativePath, bytes);
    const reportBytes = Buffer.from(stable(report));
    await writeBytes(staging, PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH, reportBytes);
    const records = [];
    for (const relativePath of PHASE7A_R2_VISUAL_REGRESSION_CAPTURE_PATHS) {
      const bytes = await readFile(path.join(staging, ...relativePath.split("/")));
      records.push({ path: relativePath, bytes: bytes.length, sha256: digest(bytes) });
    }
    const reportRecord = records.find(({ path: relativePath }) => relativePath === PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH);
    const entries = records.filter(({ path: relativePath }) => relativePath !== PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH);
    await writeBytes(staging, "manifest.json", Buffer.from(stable({ schema: PHASE7A_R2_VISUAL_REGRESSION_MANIFEST_SCHEMA, status: "PASS", baselineRevision: PHASE7A_R2_PARENT, currentRevision: options.currentRevision, report: reportRecord, entries })));
    await rename(staging, options.output);
    return { output: options.output, report, entries: records };
  } catch (error) {
    if (browser) await browser.close().catch(() => undefined);
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export function selfTest() {
  const authority = phase7aR2VisualRegressionSelfTest();
  invariant(ROUTE === "/about/", "visual-regression route contract drifted");
  return { ...authority, exactDecodedPixels: true, linkFocusEvidenceSeparate: true, installedHeadedChrome: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) process.stdout.write("Usage: node scripts/capture-phase7a-r2-visual-regression.mjs --baseline-url <immutable-r1> --current-url <immutable-r2> --baseline-deployment <r1-json> --current-deployment <r2-json> --current-revision <sha40> --output <fresh-external-directory> [--chrome-executable <chrome.exe>] [--timeout-ms 45000]\n");
  else if (options.selfTest) process.stdout.write(stable(selfTest()));
  else capturePhase7aR2VisualRegression(options).then((result) => process.stdout.write(stable({ schema: PHASE7A_R2_VISUAL_REGRESSION_SCHEMA, status: "PASS", output: result.output, files: result.entries.length }))).catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
