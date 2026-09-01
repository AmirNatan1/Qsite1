#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import axeCore from "axe-core";
import { chromium, firefox, webkit } from "playwright-core";

import { PHASE7A_GATES, PUBLIC_ROUTES, authorityProfileById } from "./phase7a-contract.mjs";
import {
  PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS,
  measureManifestoGeometry,
  validateManifestoGeometry,
} from "./phase7a-manifesto-geometry.mjs";
import { observeTargetSizes } from "./phase7a-target-size.mjs";
import {
  AXE_VIEWPORT_IDS,
  CORE_VIEWPORTS,
  CROSS_ENGINE_VIEWPORT_IDS,
  HOME_EXTRA_VIEWPORT_IDS,
  REAL_404_PATH,
  ROUTE_MATRIX_COUNTS,
  SCHEMA as BROWSER_EVIDENCE_SCHEMA,
} from "./phase7a-browser-contract.mjs";
import {
  capturePortableServedBuildReceipt,
  portableServedBuildReference,
  validatePortableServedBuildReceipt,
} from "./capture-phase7a-review-evidence.mjs";
import {
  NO_JS_FIELD_MAP_DESTINATIONS,
  assertNativeFieldMapViewport,
  assertVisibleLinkInventory,
  captureVisibleLinkInventory,
  validateFallbackManifestoMeasurement,
} from "./capture-phase7a-r1-closure.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const BROWSERS = Object.freeze({ chromium, firefox, webkit });
const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const R2_PROFILE = "phase7a-r2";
const R2_ACCEPTED_GATES = new Set(PHASE7A_GATES.filter((gate) => gate !== "ACCESSIBILITY + FALLBACK + PERFORMANCE"));
const MANIFESTO = "We turn industrial needs into field evidence.";
const INTENTIONAL_404 = Object.freeze({
  route: REAL_404_PATH,
  h1: "The requested route is out of alignment.",
  expectedStatus: 404,
});

export const SCHEMA = BROWSER_EVIDENCE_SCHEMA;
export const PHASE7A_R2_QA_SOURCE_SCHEMA = "quantum-hub.phase-7a-r2.browser-qa-source.v1";
export const PHASE7A_R2_RETAINED_QA_SCHEMA = "quantum-hub.phase-7a-r2.retained-qa.v1";
export const RESPONSIVE_VIEWPORTS = CORE_VIEWPORTS;
export const AXE_VIEWPORTS = Object.freeze(AXE_VIEWPORT_IDS.map((id) => CORE_VIEWPORTS.find((viewport) => viewport.id === id)));
export const ROUTE_OUTCOMES = Object.freeze([
  ...PUBLIC_ROUTES.map((item) => ({ ...item, expectedStatus: 200 })),
  INTENTIONAL_404,
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertExternalOutput(candidate) {
  const resolved = path.resolve(candidate);
  invariant(path.extname(resolved).toLowerCase() === ".json", "--output must name a JSON file");
  invariant(!within(ROOT, resolved), "browser evidence must remain outside the repository");
  invariant(!within(os.tmpdir(), resolved), "browser evidence must remain outside OS temporary storage");
  return resolved;
}

function nextValue(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

function portableDistPath(value) {
  invariant(
    typeof value === "string"
      && value.length > 0
      && !value.includes("\\")
      && !path.posix.isAbsolute(value)
      && path.posix.normalize(value) === value
      && !value.split("/").some((part) => !part || part === "." || part === ".."),
    `unsafe dist evidence path: ${String(value)}`,
  );
  return value;
}

function fingerprintRows(rows, fields) {
  const serialized = rows.map((row) => fields.map((field) => String(row[field])).join("\0")).join("\n");
  return sha256(Buffer.from(`${serialized}\n`, "utf8"));
}

export function distLedgerFingerprint(files) {
  invariant(Array.isArray(files) && files.length > 0, "R2 QA dist inventory is empty");
  return fingerprintRows(files, ["relativePath", "bytes", "sha256"]);
}

export function servedLedgerFingerprint(assets) {
  invariant(Array.isArray(assets) && assets.length > 0, "R2 QA served inventory is empty");
  return fingerprintRows(assets, ["route", "relativePath", "httpStatus", "bytes", "sha256"]);
}

async function gitText(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return String(stdout).trim();
}

async function captureR2RepositoryBoundary(revision) {
  const profile = authorityProfileById(R2_PROFILE);
  const [branch, head, statusText, upstream, upstreamRevision] = await Promise.all([
    gitText(["branch", "--show-current"]),
    gitText(["rev-parse", "HEAD"]),
    gitText(["status", "--porcelain=v1", "--untracked-files=all"]),
    gitText(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    gitText(["rev-parse", "@{upstream}"]),
  ]);
  const status = statusText.split(/\r?\n/).filter(Boolean);
  invariant(branch === profile.branch && head === revision, "R2 QA repository branch or exact revision differs");
  invariant(status.length === 0, "R2 QA requires a fully clean worktree, including untracked files");
  invariant(upstream === `origin/${profile.branch}` && upstreamRevision === revision, "R2 QA requires exact local/upstream parity");
  return { branch, head, upstream, upstreamRevision, worktreeClean: true, status };
}

async function walkDist(directory, prefix = "") {
  const rows = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  for (const entry of entries) {
    const relativePath = portableDistPath(prefix ? `${prefix}/${entry.name}` : entry.name);
    const absolute = path.join(directory, entry.name);
    const info = await lstat(absolute);
    invariant(!info.isSymbolicLink(), `R2 QA dist may not contain symlinks: ${relativePath}`);
    if (info.isDirectory()) rows.push(...await walkDist(absolute, relativePath));
    else if (info.isFile()) {
      const bytes = await readFile(absolute);
      rows.push({ relativePath, bytes: bytes.length, sha256: sha256(bytes) });
    } else throw new Error(`R2 QA dist contains an unsupported entry: ${relativePath}`);
  }
  return rows;
}

async function captureR2DistInventory() {
  const distRoot = path.join(ROOT, "dist");
  const info = await lstat(distRoot);
  invariant(info.isDirectory() && !info.isSymbolicLink(), "R2 QA requires a real current dist directory");
  invariant(path.resolve(await realpath(distRoot)) === path.resolve(distRoot), "R2 QA dist root may not traverse a symlink");
  const files = await walkDist(distRoot);
  invariant(files.some(({ relativePath }) => relativePath === "index.html"), "R2 QA dist lacks index.html");
  invariant(files.some(({ relativePath }) => relativePath.endsWith(".css")), "R2 QA dist lacks production CSS");
  invariant(files.some(({ relativePath }) => /\.m?js$/i.test(relativePath)), "R2 QA dist lacks production JavaScript");
  return {
    root: "dist",
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    fingerprint: distLedgerFingerprint(files),
    files,
  };
}

function linkedRuntimeRoutes(html) {
  const routes = new Set();
  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+\.(?:css|m?js)(?:[?#][^"']*)?)["']/gi)) {
    const parsed = new URL(match[1], "https://phase7a.invalid/");
    invariant(parsed.origin === "https://phase7a.invalid", `R2 QA runtime asset is not local: ${match[1]}`);
    routes.add(parsed.pathname);
  }
  return [...routes].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

async function captureR2ServedParity(baseUrl, timeoutMs, dist) {
  const byPath = new Map(dist.files.map((file) => [file.relativePath, file]));
  const index = byPath.get("index.html");
  const html = (await readFile(path.join(ROOT, "dist", "index.html"))).toString("utf8");
  const specifications = [
    { route: "/", relativePath: "index.html" },
    ...linkedRuntimeRoutes(html).map((route) => ({ route, relativePath: route.replace(/^\/+/, "") })),
  ];
  invariant(specifications.length >= 3, "R2 QA served parity must bind the document, CSS and JavaScript");
  const assets = [];
  for (const specification of specifications) {
    const expected = byPath.get(specification.relativePath);
    invariant(expected, `R2 QA linked runtime asset is absent from dist: ${specification.relativePath}`);
    const response = await fetch(new URL(specification.route, baseUrl), {
      cache: "no-store",
      headers: { accept: specification.relativePath === "index.html" ? "text/html" : "*/*" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = Buffer.from(await response.arrayBuffer());
    invariant(response.status === 200, `R2 QA served asset returned ${response.status}: ${specification.route}`);
    invariant(body.length === expected.bytes && sha256(body) === expected.sha256, `R2 QA served asset differs from current dist: ${specification.route}`);
    assets.push({
      ...specification,
      httpStatus: response.status,
      contentType: (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase(),
      bytes: body.length,
      sha256: expected.sha256,
    });
  }
  invariant(index && assets[0].sha256 === index.sha256, "R2 QA served document authority differs");
  return { assetCount: assets.length, fingerprint: servedLedgerFingerprint(assets), parity: true, assets };
}

async function captureR2QaBoundary(revision) {
  const [repository, dist] = await Promise.all([
    captureR2RepositoryBoundary(revision),
    captureR2DistInventory(),
  ]);
  return { repository, dist };
}

function sameR2Boundary(left, right) {
  return JSON.stringify(left.repository) === JSON.stringify(right.repository)
    && left.dist.fingerprint === right.dist.fingerprint
    && left.dist.fileCount === right.dist.fileCount
    && left.dist.totalBytes === right.dist.totalBytes;
}

async function finalizeR2QaSourceAuthority(options, start) {
  const end = await captureR2QaBoundary(options.revision);
  invariant(sameR2Boundary(start, end), "R2 QA repository or dist changed during the browser run");
  const served = await captureR2ServedParity(options.baseUrl, options.timeoutMs, end.dist);
  const receipt = {
    schema: PHASE7A_R2_QA_SOURCE_SCHEMA,
    status: "PASS",
    authorityProfile: R2_PROFILE,
    branch: end.repository.branch,
    revision: options.revision,
    runBoundary: {
      start: { ...start.repository, distFingerprint: start.dist.fingerprint },
      end: { ...end.repository, distFingerprint: end.dist.fingerprint },
      stable: true,
    },
    dist: end.dist,
    served,
  };
  validateR2QaSourceAuthority(receipt, options.revision);
  return receipt;
}

export function parseArguments(argv) {
  const options = {
    authorityProfile: "phase7a",
    baseUrl: "http://127.0.0.1:4322/",
    engine: "all",
    headed: false,
    help: false,
    output: "",
    revision: "",
    selfTest: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--authority-profile") { options.authorityProfile = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--base-url") { options.baseUrl = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--engine") { options.engine = nextValue(argv, index, flag).toLowerCase(); index += 1; }
    else if (flag === "--output") { options.output = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--revision") { options.revision = nextValue(argv, index, flag); index += 1; }
    else if (flag === "--timeout-ms") { options.timeoutMs = Number(nextValue(argv, index, flag)); index += 1; }
    else if (flag === "--headed") options.headed = true;
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  invariant(["all", ...Object.keys(BROWSERS)].includes(options.engine), "--engine must be all, chromium, firefox or webkit");
  authorityProfileById(options.authorityProfile);
  invariant(Number.isInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms must be 5000..120000");
  const base = new URL(options.baseUrl);
  invariant(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "--base-url must be credential-free HTTP(S)");
  base.hash = "";
  base.search = "";
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  options.baseUrl = base.toString();
  if (!options.help && !options.selfTest) {
    invariant(options.output, "--output is required");
    options.output = assertExternalOutput(options.output);
    if (options.authorityProfile === "phase7a-r1") invariant(HASH_40.test(options.revision), "--revision must be the exact 40-character final R1 HEAD");
    if (options.authorityProfile === R2_PROFILE) invariant(HASH_40.test(options.revision), "--revision must be the exact 40-character final R2 HEAD");
  }
  return options;
}

function validateDistLedger(dist) {
  invariant(dist?.root === "dist" && Array.isArray(dist.files) && dist.files.length > 0, "R2 QA dist authority differs");
  const paths = new Set();
  let totalBytes = 0;
  let previous = null;
  for (const file of dist.files) {
    portableDistPath(file?.relativePath);
    invariant(!paths.has(file.relativePath), `R2 QA dist inventory repeats ${file.relativePath}`);
    invariant(previous === null || Buffer.compare(Buffer.from(previous), Buffer.from(file.relativePath)) < 0, "R2 QA dist inventory is not bytewise sorted");
    invariant(Number.isSafeInteger(file.bytes) && file.bytes > 0 && HASH_64.test(file.sha256 ?? ""), `R2 QA dist file authority differs: ${file.relativePath}`);
    paths.add(file.relativePath);
    totalBytes += file.bytes;
    previous = file.relativePath;
  }
  invariant(paths.has("index.html") && [...paths].some((name) => name.endsWith(".css")) && [...paths].some((name) => /\.m?js$/i.test(name)), "R2 QA dist inventory lacks its document, CSS or JavaScript");
  invariant(dist.fileCount === dist.files.length && dist.totalBytes === totalBytes && dist.fingerprint === distLedgerFingerprint(dist.files), "R2 QA dist fingerprint or counts differ");
  return new Map(dist.files.map((file) => [file.relativePath, file]));
}

function validateRepositoryBoundary(boundary, revision, label) {
  const profile = authorityProfileById(R2_PROFILE);
  invariant(boundary?.branch === profile.branch && boundary.head === revision, `${label} branch or revision differs`);
  invariant(boundary.upstream === `origin/${profile.branch}` && boundary.upstreamRevision === revision, `${label} upstream parity differs`);
  invariant(boundary.worktreeClean === true && Array.isArray(boundary.status) && boundary.status.length === 0, `${label} worktree is not clean`);
  return true;
}

export function validateR2QaSourceAuthority(receipt, expectedRevision) {
  const profile = authorityProfileById(R2_PROFILE);
  invariant(receipt?.schema === PHASE7A_R2_QA_SOURCE_SCHEMA && receipt.status === "PASS" && receipt.authorityProfile === R2_PROFILE, "R2 QA source receipt differs");
  invariant(HASH_40.test(expectedRevision ?? "") && expectedRevision !== profile.parent, "R2 QA expected revision is not a new exact SHA");
  invariant(receipt.branch === profile.branch && receipt.revision === expectedRevision, "R2 QA source branch or revision differs");
  validateRepositoryBoundary(receipt.runBoundary?.start, expectedRevision, "R2 QA start boundary");
  validateRepositoryBoundary(receipt.runBoundary?.end, expectedRevision, "R2 QA end boundary");
  const byPath = validateDistLedger(receipt.dist);
  invariant(receipt.runBoundary.stable === true
    && receipt.runBoundary.start.distFingerprint === receipt.dist.fingerprint
    && receipt.runBoundary.end.distFingerprint === receipt.dist.fingerprint,
  "R2 QA run-boundary dist stability differs");
  invariant(receipt.served?.parity === true && Array.isArray(receipt.served.assets) && receipt.served.assets.length >= 3, "R2 QA served parity differs");
  const routes = new Set();
  let hasDocument = false;
  let hasCss = false;
  let hasJavaScript = false;
  for (const asset of receipt.served.assets) {
    invariant(typeof asset.route === "string" && asset.route.startsWith("/") && !asset.route.includes("..") && !routes.has(asset.route), `R2 QA served route authority differs: ${String(asset.route)}`);
    portableDistPath(asset.relativePath);
    const local = byPath.get(asset.relativePath);
    invariant(local && asset.httpStatus === 200 && asset.bytes === local.bytes && asset.sha256 === local.sha256, `R2 QA served/dist binding differs: ${asset.route}`);
    invariant(typeof asset.contentType === "string" && asset.contentType.length > 0, `R2 QA served content type is missing: ${asset.route}`);
    routes.add(asset.route);
    hasDocument ||= asset.route === "/" && asset.relativePath === "index.html";
    hasCss ||= asset.relativePath.endsWith(".css");
    hasJavaScript ||= /\.m?js$/i.test(asset.relativePath);
  }
  invariant(hasDocument && hasCss && hasJavaScript, "R2 QA served receipt lacks its document, CSS or JavaScript");
  invariant(receipt.served.assetCount === receipt.served.assets.length && receipt.served.fingerprint === servedLedgerFingerprint(receipt.served.assets), "R2 QA served fingerprint or count differs");
  return true;
}

export function r2QaSourceAuthorityReference(receipt) {
  validateR2QaSourceAuthority(receipt, receipt?.revision);
  return {
    schema: receipt.schema,
    status: receipt.status,
    branch: receipt.branch,
    revision: receipt.revision,
    upstream: receipt.runBoundary.end.upstream,
    upstreamRevision: receipt.runBoundary.end.upstreamRevision,
    worktreeClean: receipt.runBoundary.end.worktreeClean,
    dist: {
      fileCount: receipt.dist.fileCount,
      totalBytes: receipt.dist.totalBytes,
      fingerprint: receipt.dist.fingerprint,
    },
    served: {
      assetCount: receipt.served.assetCount,
      fingerprint: receipt.served.fingerprint,
      parity: receipt.served.parity,
    },
  };
}

export function validateQaServedBuildBindings(report) {
  if (report.authorityProfile === "phase7a-r1") {
    validatePortableServedBuildReceipt(report.servedBuild, report.servedBuild?.revision);
    const expected = portableServedBuildReference(report.servedBuild);
    invariant(Array.isArray(report.results) && report.results.length > 0, "R1 QA report lacks engine results");
    invariant(report.results.every(({ sourceAuthority }) => JSON.stringify(sourceAuthority) === JSON.stringify(expected)), "R1 QA engine result served-build binding differs");
  } else if (report.authorityProfile === R2_PROFILE) {
    validateR2QaSourceAuthority(report.sourceAuthority, report.revision);
    const expected = r2QaSourceAuthorityReference(report.sourceAuthority);
    invariant(Array.isArray(report.results) && report.results.length > 0, "R2 QA report lacks engine results");
    invariant(report.results.every(({ sourceAuthority }) => JSON.stringify(sourceAuthority) === JSON.stringify(expected)), "R2 QA engine result source binding differs");
  }
  return true;
}

function canonicalText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function canonicalHeading(value) {
  return canonicalText(value).replace(/\s/g, "");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function qaReportSha256(report) {
  invariant(report && typeof report === "object" && !Array.isArray(report), "QA report must be an object");
  const payload = {};
  for (const [key, value] of Object.entries(report)) if (key !== "reportSha256") payload[key] = value;
  return sha256(Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8"));
}

function passingRows(value, label) {
  invariant(Array.isArray(value) && value.length > 0, `R2 retained QA lacks ${label} cases`);
  invariant(value.every((row) => row?.status === "PASS"), `R2 retained QA ${label} contains a failure`);
  return { caseCount: value.length, status: "PASS" };
}

export function normalizePhase7aR2RetainedQaReport(report, { expectedEngine, expectedRevision } = {}) {
  const profile = authorityProfileById(R2_PROFILE);
  invariant(Object.hasOwn(BROWSERS, expectedEngine), "R2 retained QA expected engine is invalid");
  invariant(HASH_40.test(expectedRevision ?? "") && expectedRevision !== profile.parent, "R2 retained QA expected revision must be the exact new SHA");
  invariant(report?.schema === SCHEMA && report.authorityProfile === R2_PROFILE && report.branch === profile.branch && report.revision === expectedRevision, "R2 retained QA root authority differs");
  invariant(report.status === "PASS" && report.reportSha256 === qaReportSha256(report), "R2 retained QA report status or SHA-256 differs");
  validateQaServedBuildBindings(report);
  invariant(Array.isArray(report.results) && report.results.length === 1, "R2 retained QA assembler input must contain exactly one engine result");
  const result = report.results[0];
  invariant(result?.identity?.engine === expectedEngine && result.status === "PASS" && Array.isArray(result.failures) && result.failures.length === 0, `${expectedEngine} retained QA engine result differs`);
  const routes = passingRows(result.routes, "route");
  const accessibility = passingRows(result.accessibility, "axe");
  const responsive = passingRows(result.responsive, "responsive");
  const network = passingRows(result.network, "network");
  invariant(result.fieldMap?.status === "PASS", "R2 retained QA Field Map case failed");
  invariant(result.history?.status === "PASS", "R2 retained QA history case failed");
  invariant(result.cycles?.status === "PASS", "R2 retained QA lifecycle case failed");
  for (const key of ["reducedMotion", "noJavaScript", "fallbackFont"]) invariant(result.fallback?.[key]?.status === "PASS", `R2 retained QA ${key} case failed`);
  const shortLandscape = result.responsive.find(({ viewport }) => viewport?.width === 800 && viewport?.height === 360);
  if (expectedEngine === "chromium") invariant(shortLandscape?.status === "PASS" && shortLandscape.checks?.verticalClipping === true, "R2 retained QA lacks the passing 800x360 clipping invariant");
  const checks = {
    sourceBound: true,
    routeMatrix: true,
    axe: true,
    responsive: true,
    shortLandscape800x360: expectedEngine !== "chromium" || Boolean(shortLandscape),
    fieldMap: true,
    reducedMotion: true,
    noJavaScript: true,
    fallbackFont: true,
    history: true,
    reverseLifecycle: true,
    network: true,
  };
  invariant(Object.values(checks).every(Boolean), `${expectedEngine} retained QA normalized checks differ`);
  const coverage = {
    routes,
    accessibility,
    responsive: {
      ...responsive,
      shortLandscape800x360: {
        required: expectedEngine === "chromium",
        observed: Boolean(shortLandscape),
        status: shortLandscape?.status ?? "NOT_RUN_ON_CROSS_ENGINE_REDUCED_MATRIX",
      },
    },
    fieldMap: { caseCount: 1, status: "PASS" },
    fallback: { caseCount: 3, status: "PASS" },
    history: { caseCount: 1, status: "PASS" },
    reverseLifecycle: { caseCount: 1, cycles: result.cycles.samples?.length ?? null, status: "PASS" },
    network,
  };
  const evidenceCaseCount = routes.caseCount + accessibility.caseCount + responsive.caseCount + network.caseCount + 6;
  return {
    schema: PHASE7A_R2_RETAINED_QA_SCHEMA,
    status: "PASS",
    authorityProfile: R2_PROFILE,
    branch: profile.branch,
    revision: expectedRevision,
    engine: expectedEngine,
    rawReportSha256: report.reportSha256,
    evidenceCaseCount,
    failures: 0,
    checks,
    coverage,
    source: r2QaSourceAuthorityReference(report.sourceAuthority),
  };
}

async function settle(page, delay = 80) {
  await page.waitForLoadState("load").catch(() => undefined);
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded", null, { timeout: 3_000 }).catch(() => undefined);
  await page.waitForTimeout(delay);
}

async function diagnostics(page) {
  const output = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on("console", (message) => { if (message.type() === "error") output.consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => output.pageErrors.push(error.message));
  page.on("requestfailed", (request) => output.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? "unknown" }));
  return output;
}

async function inspectDocument(page, context = {}) {
  const state = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const rect = h1?.getBoundingClientRect();
    const root = document.documentElement;
    const body = document.body;
    const visible = (node) => {
      if (!(node instanceof Element)) return false;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
    };
    const targets = [...document.querySelectorAll("a[href], summary, button, input, select, textarea")]
      .filter(visible)
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { tag: node.tagName.toLowerCase(), text: node.textContent?.replace(/\s+/g, " ").trim().slice(0, 80), width: box.width, height: box.height };
      });
    return {
      activeElement: document.activeElement?.tagName.toLowerCase() ?? null,
      bodyHeight: body?.scrollHeight ?? 0,
      cinematicMode: root.dataset.cinematicMode ?? null,
      fieldMapOpen: root.hasAttribute("data-field-map-open"),
      h1: h1?.getAttribute("aria-label") || h1?.textContent?.replace(/\s+/g, " ").trim() || null,
      h1Count: document.querySelectorAll("h1").length,
      h1Rect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      horizontalOverflow: Math.max(root.scrollWidth, body?.scrollWidth ?? 0) > root.clientWidth + 1,
      htmlHeight: root.scrollHeight,
      landmarkCounts: {
        footer: document.querySelectorAll("footer").length,
        header: document.querySelectorAll("header.site-header").length,
        main: document.querySelectorAll("main").length,
        navigation: document.querySelectorAll("nav").length,
      },
      manifestoReveal: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") ?? null,
      routeNavigation: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-route-navigation") ?? null,
      scrollY,
      targetMinimum: targets.length ? Math.min(...targets.map(({ width, height }) => Math.min(width, height))) : null,
      targetFailures: targets.filter(({ width, height }) => width < 44 || height < 44),
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  const pageUrl = new URL(page.url());
  const targetSize = await observeTargetSizes(page, {
    route: context.route ?? `${pageUrl.pathname}${pageUrl.hash}`,
    state: context.state ?? "document",
    viewport: context.viewport ?? state.viewport,
  });
  return { ...state, targetSize, targetFailures: targetSize.targetFailures };
}

function documentChecks(state, expectedH1) {
  return {
    oneH1: state.h1Count === 1,
    expectedH1: canonicalHeading(state.h1) === canonicalHeading(expectedH1),
    landmarks: state.landmarkCounts.header === 1 && state.landmarkCounts.main === 1 && state.landmarkCounts.footer >= 1 && state.landmarkCounts.navigation >= 1,
    noHorizontalOverflow: !state.horizontalOverflow,
    targetSizes: state.targetSize?.status === "PASS",
  };
}

async function axe(page) {
  await page.addScriptTag({ content: axeCore.source });
  const result = await page.evaluate(async () => {
    const outcome = await globalThis.axe.run(document, {
      resultTypes: ["violations", "incomplete"],
      rules: { region: { enabled: true } },
    });
    return {
      incomplete: outcome.incomplete.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length })),
      violations: outcome.violations.map(({ id, impact, nodes, help }) => ({ id, impact, nodes: nodes.length, help })),
    };
  });
  return { ...result, status: result.violations.length === 0 ? "PASS" : "FAIL" };
}

function routeViewports(engine) {
  if (engine === "chromium") return RESPONSIVE_VIEWPORTS;
  return CROSS_ENGINE_VIEWPORT_IDS.map((id) => RESPONSIVE_VIEWPORTS.find((viewport) => viewport.id === id));
}

async function routeMatrix(browser, baseUrl, timeoutMs, engine) {
  const cases = [];
  for (const viewport of routeViewports(engine)) {
    for (const route of ROUTE_OUTCOMES) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      const diag = await diagnostics(page);
      const response = await page.goto(new URL(route.route, baseUrl).toString(), { waitUntil: "load" });
      await settle(page);
      const state = await inspectDocument(page);
      const checks = {
        status: response?.status() === route.expectedStatus,
        ...documentChecks(state, route.h1),
        console: diag.pageErrors.length === 0 && (diag.consoleErrors.length === 0 || (
          route.expectedStatus === 404
          && diag.consoleErrors.every((message) => /failed to load resource.*404|status of 404/i.test(message))
        )),
      };
      cases.push({ route: route.route, viewport, responseStatus: response?.status() ?? null, state, diagnostics: diag, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" });
      await context.close();
    }
  }
  if (engine !== "chromium") {
    for (const viewport of HOME_EXTRA_VIEWPORT_IDS.map((id) => RESPONSIVE_VIEWPORTS.find((candidate) => candidate.id === id))) {
      const route = ROUTE_OUTCOMES[0];
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      const diag = await diagnostics(page);
      const response = await page.goto(new URL(route.route, baseUrl).toString(), { waitUntil: "load" });
      await settle(page);
      const state = await inspectDocument(page);
      const checks = { status: response?.status() === 200, ...documentChecks(state, route.h1), console: diag.consoleErrors.length === 0 && diag.pageErrors.length === 0 };
      cases.push({ route: route.route, viewport, responseStatus: response?.status() ?? null, state, diagnostics: diag, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" });
      await context.close();
    }
  }
  return cases;
}

async function axeMatrix(browser, baseUrl, timeoutMs) {
  const cases = [];
  for (const viewport of AXE_VIEWPORTS) {
    for (const route of ROUTE_OUTCOMES) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      const response = await page.goto(new URL(route.route, baseUrl).toString(), { waitUntil: "load" });
      await settle(page);
      const accessibility = await axe(page);
      const checks = { status: response?.status() === route.expectedStatus, axe: accessibility.status === "PASS" };
      cases.push({ route: route.route, viewport, responseStatus: response?.status() ?? null, accessibility, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" });
      await context.close();
    }
  }
  return cases;
}

async function responsiveMatrix(browser, baseUrl, timeoutMs, engine, authorityProfile) {
  const standardViews = engine === "chromium" ? RESPONSIVE_VIEWPORTS : ["desktop-1440x900", "tablet-portrait-768x1024", "narrow-320x800", "mobile-landscape-844x390"].map((id) => RESPONSIVE_VIEWPORTS.find((viewport) => viewport.id === id));
  const enhancedResponsiveProfile = authorityProfile === "phase7a-r1" || authorityProfile === R2_PROFILE;
  const views = enhancedResponsiveProfile && engine === "chromium"
    ? [...new Map([...standardViews, ...PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS].map((viewport) => [`${viewport.width}x${viewport.height}`, viewport])).values()]
    : standardViews;
  const cases = [];
  for (const viewport of views) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    const diag = await diagnostics(page);
    await page.goto(new URL("#entry", baseUrl).toString(), { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: 5_000 }).catch(() => undefined);
    await settle(page, 100);
    const state = await inspectDocument(page, { route: "/#entry", state: "resolved-manifesto", viewport });
    const words = await page.evaluate(() => [...document.querySelectorAll(".manifesto-word")].map((word) => {
      const box = word.getBoundingClientRect();
      return { text: word.textContent, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    const intact = words.length === 7 && words.every(({ left, right }) => left >= -1 && right <= viewport.width + 1);
    const h1Fits = state.h1Rect && state.h1Rect.left >= -1 && state.h1Rect.right <= viewport.width + 1 && state.h1Rect.bottom <= viewport.height + 1;
    let manifestoGeometry = null;
    let manifestoGeometryError = null;
    const isShortLandscape = PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS.some(({ width, height }) => width === viewport.width && height === viewport.height);
    if (enhancedResponsiveProfile && isShortLandscape) {
      manifestoGeometry = await page.evaluate(measureManifestoGeometry);
      try { validateManifestoGeometry(manifestoGeometry); } catch (error) { manifestoGeometryError = error.message; }
    }
    const checks = {
      ...documentChecks(state, MANIFESTO),
      manifestoResolved: state.manifestoReveal === "resolved",
      wholeWords: intact,
      h1Fits: Boolean(h1Fits),
      ...(manifestoGeometry ? { verticalClipping: manifestoGeometryError === null } : {}),
      console: diag.consoleErrors.length === 0 && diag.pageErrors.length === 0,
    };
    cases.push({ viewport, state, words, manifestoGeometry, manifestoGeometryError, diagnostics: diag, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" });
    await context.close();
  }
  return cases;
}

async function fieldMapCase(browser, baseUrl, timeoutMs) {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.goto(new URL("#entry", baseUrl).toString(), { waitUntil: "load" });
  await settle(page);
  await page.evaluate(() => {
    const threshold = document.querySelector("[data-field-map-threshold]");
    if (threshold) window.scrollTo(0, threshold.getBoundingClientRect().top + scrollY + 12);
  });
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-route-navigation") === "released");
  const summary = page.locator("[data-field-map] > summary");
  await summary.focus();
  const focusBefore = await page.evaluate(() => document.activeElement?.tagName);
  await summary.press("Enter");
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-field-map-open"));
  const opened = await page.evaluate(() => {
    const plane = document.querySelector(".field-map__plane")?.getBoundingClientRect();
    const links = [...document.querySelectorAll("#field-map-navigation a")].map((link) => {
      const rect = link.getBoundingClientRect();
      return { href: link.getAttribute("href"), width: rect.width, height: rect.height };
    });
    const background = [...document.querySelectorAll("[data-field-map-background]")].map((node) => ({
      tag: node.tagName.toLowerCase(),
      inert: node.hasAttribute("inert"),
      owned: node.hasAttribute("data-field-map-inert-owned"),
    }));
    return { active: document.activeElement?.getAttribute("href"), links, background, plane: plane ? { left: plane.left, right: plane.right, top: plane.top, bottom: plane.bottom } : null };
  });
  const openTargets = await observeTargetSizes(page, { route: "/#entry", state: "field-map-mobile-open", viewport: { id: "field-map-mobile", width: 320, height: 800 } });
  await page.keyboard.press("Tab");
  const tabFocus = await page.evaluate(() => ({
    inMap: Boolean(document.activeElement?.closest("[data-field-map]")),
    text: document.activeElement?.textContent?.replace(/\s+/g, " ").trim() ?? null,
  }));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-field-map-open"));
  const closed = await page.evaluate(() => ({
    active: document.activeElement?.tagName.toLowerCase(),
    open: document.querySelector("[data-field-map]")?.hasAttribute("open"),
    rootOpen: document.documentElement.hasAttribute("data-field-map-open"),
    inertCount: document.querySelectorAll("[data-field-map-background][inert]").length,
    ownedCount: document.querySelectorAll("[data-field-map-background][data-field-map-inert-owned]").length,
  }));
  const repeatedCycles = [];
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await summary.press("Enter");
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-field-map-open"));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-field-map-open"));
    repeatedCycles.push(await page.evaluate((cycleNumber) => ({
      cycle: cycleNumber,
      focusReturned: document.activeElement === document.querySelector("[data-field-map] > summary"),
      inertCount: document.querySelectorAll("[data-field-map-background][inert]").length,
      ownedCount: document.querySelectorAll("[data-field-map-background][data-field-map-inert-owned]").length,
    }), cycle));
  }
  const checks = {
    focusBefore: focusBefore === "SUMMARY",
    eightLinks: opened.links.length === 8,
    ordinaryLinks: opened.links.every(({ href }) => typeof href === "string" && href.startsWith("/")),
    targetSizes: openTargets.status === "PASS",
    backgroundInert: opened.background.length >= 3 && opened.background.every(({ inert, owned }) => inert && owned),
    keyboardContained: tabFocus.inMap,
    fullViewport: Boolean(opened.plane && opened.plane.left <= 1 && opened.plane.right >= 319 && opened.plane.top <= 1 && opened.plane.bottom >= 799),
    escapeCloses: closed.open === false && closed.rootOpen === false,
    focusReturn: closed.active === "summary",
    inertReleased: closed.inertCount === 0 && closed.ownedCount === 0,
    repeatedCyclesRestore: repeatedCycles.every(({ focusReturned, inertCount, ownedCount }) => focusReturned && inertCount === 0 && ownedCount === 0),
  };
  await context.close();
  return { opened, openTargets, tabFocus, closed, repeatedCycles, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
}

async function fallbackCases(browser, baseUrl, timeoutMs) {
  const results = {};

  const manifestoAuthority = async (page, label) => {
    const measurement = await page.evaluate(measureManifestoGeometry);
    try {
      return { measurement, receipt: validateFallbackManifestoMeasurement(measurement, label), status: "PASS", failure: null };
    } catch (error) {
      return { measurement, receipt: null, status: "FAIL", failure: String(error?.message ?? error) };
    }
  };

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(new URL("#entry", baseUrl).toString(), { waitUntil: "load" });
    await settle(page);
    const state = await inspectDocument(page);
    const manifestoGeometry = await manifestoAuthority(page, "QA reduced-motion manifesto");
    const checks = { staticMode: state.cinematicMode === "static", manifesto: canonicalText(state.h1) === canonicalText(MANIFESTO), measuredManifestoVisible: manifestoGeometry.status === "PASS", noCinematicRequest: !requests.some((url) => /phase-4r2.*\.mp4/i.test(url)), noOverflow: !state.horizontalOverflow };
    results.reducedMotion = { state, manifestoGeometry, cinematicRequests: requests.filter((url) => /phase-4r2|\.mp4/i.test(url)), checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(new URL("#entry", baseUrl).toString(), { waitUntil: "load" });
    await settle(page);
    const state = await inspectDocument(page);
    const manifestoGeometry = await manifestoAuthority(page, "QA no-JavaScript manifesto");
    await page.locator("[data-field-map] > summary").click();
    const linkInventory = await captureVisibleLinkInventory(page, "[data-field-map] nav a[href]");
    let linksStatus = "PASS";
    let linksFailure = null;
    try { assertVisibleLinkInventory(linkInventory, NO_JS_FIELD_MAP_DESTINATIONS, "QA no-JavaScript Field Map links"); } catch (error) { linksStatus = "FAIL"; linksFailure = String(error?.message ?? error); }
    const details = await page.evaluate(() => {
      const map = document.querySelector("[data-field-map]");
      const plane = map?.querySelector(".field-map__plane");
      const bounds = plane?.getBoundingClientRect();
      const style = plane ? getComputedStyle(plane) : null;
      return {
        enhancedController: map?.getAttribute("data-controller") ?? null,
        nativeDetailsOpen: map instanceof HTMLDetailsElement ? map.open : false,
        viewport: { width: innerWidth, height: innerHeight },
        plane: bounds && style ? {
          position: style.position,
          visible: style.display !== "none" && !["collapse", "hidden"].includes(style.visibility) && Number.parseFloat(style.opacity) > 0,
          bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height },
        } : null,
      };
    });
    let planeStatus = "PASS";
    let planeFailure = null;
    try { assertNativeFieldMapViewport(details); } catch (error) { planeStatus = "FAIL"; planeFailure = String(error?.message ?? error); }
    const checks = { manifesto: canonicalText(state.h1) === canonicalText(MANIFESTO), measuredManifestoVisible: manifestoGeometry.status === "PASS", compact: state.bodyHeight < 4_000, exactVisibleLinks: linksStatus === "PASS", nativeMapViewport: planeStatus === "PASS", noCinematicRequest: !requests.some((url) => /phase-4r2.*\.mp4/i.test(url)), noOverflow: !state.horizontalOverflow };
    results.noJavaScript = { state, manifestoGeometry, details, linkInventory, linksFailure, planeFailure, cinematicRequests: requests.filter((url) => /phase-4r2|\.mp4/i.test(url)), checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.route(/\.(?:woff2?|ttf|otf)(?:[?#]|$)/i, (route) => route.abort("failed"));
    await page.goto(new URL("#entry", baseUrl).toString(), { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: 5_000 }).catch(() => undefined);
    await settle(page);
    const state = await inspectDocument(page);
    const manifestoGeometry = await manifestoAuthority(page, "QA fallback-font narrow manifesto");
    const font = await page.locator("h1").evaluate((node) => ({ family: getComputedStyle(node).fontFamily, stretch: getComputedStyle(node).fontStretch }));
    const checks = { manifesto: canonicalText(state.h1) === canonicalText(MANIFESTO), noOverflow: !state.horizontalOverflow, measuredManifestoVisible: manifestoGeometry.status === "PASS" };
    results.fallbackFont = { state, manifestoGeometry, font, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
    await context.close();
  }
  return results;
}

async function intentHistoryCase(browser, baseUrl, timeoutMs) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 650 } });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.goto(new URL("for-partners/", baseUrl).toString(), { waitUntil: "load" });
  await page.locator("a.brand-link").click();
  await page.waitForURL(/\/#entry$/);
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: 5_000 }).catch(() => undefined);
  const entry = await inspectDocument(page);
  await page.goBack({ waitUntil: "load" });
  const back = { url: page.url(), h1: await page.locator("h1").getAttribute("aria-label") ?? await page.locator("h1").textContent() };
  await page.goForward({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: 5_000 }).catch(() => undefined);
  await settle(page);
  const forward = await inspectDocument(page);
  const checks = {
    exactEntry: new URL(page.url()).hash === "#entry",
    entryResolved: entry.manifestoReveal === "resolved" && entry.scrollY > 0,
    noF1FlashState: entry.cinematicMode === "enhanced" && entry.h1Rect?.bottom > 0,
    backRoute: new URL(back.url).pathname === "/for-partners/",
    forwardEntry: forward.manifestoReveal === "resolved" && forward.scrollY > 0,
  };
  await context.close();
  return { entry, back, forward, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
}

async function reverseCyclesCase(browser, baseUrl, timeoutMs) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    const originalRaf = window.requestAnimationFrame.bind(window);
    const originalCancel = window.cancelAnimationFrame.bind(window);
    const originalInterval = window.setInterval.bind(window);
    const originalClearInterval = window.clearInterval.bind(window);
    const rafs = new Set();
    const intervals = new Set();
    window.requestAnimationFrame = (callback) => {
      let id = 0;
      id = originalRaf((time) => { rafs.delete(id); callback(time); });
      rafs.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => { rafs.delete(id); originalCancel(id); };
    window.setInterval = (callback, delay, ...args) => { const id = originalInterval(callback, delay, ...args); intervals.add(id); return id; };
    window.clearInterval = (id) => { intervals.delete(id); originalClearInterval(id); };
    window.__phase7aWork = { rafs, intervals };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "enhanced", null, { timeout: 8_000 }).catch(() => undefined);
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const entry = document.querySelector("#entry");
    if (!shell || !entry) return null;
    return { entry: entry.offsetTop, max: Math.max(0, document.documentElement.scrollHeight - innerHeight), shell: shell.offsetHeight };
  });
  invariant(geometry, "cinematic geometry unavailable");
  const samples = [];
  for (let cycle = 1; cycle <= 10; cycle += 1) {
    await page.evaluate((y) => window.scrollTo(0, y), geometry.entry + 20);
    await page.waitForFunction(() => {
      const shell = document.querySelector("[data-cinematic-shell]");
      return shell?.getAttribute("data-cinematic-progress") === "1.0000"
        && ["revealing", "resolved"].includes(shell?.getAttribute("data-manifesto-reveal") ?? "");
    }, null, { timeout: 3_000 });
    const forward = await page.evaluate(() => ({ reveal: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal"), progress: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-cinematic-progress"), scrollY }));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => {
      const shell = document.querySelector("[data-cinematic-shell]");
      return shell?.getAttribute("data-cinematic-progress") === "0.0000"
        && shell?.getAttribute("data-manifesto-reveal") === "hidden";
    }, null, { timeout: 3_000 });
    const reverse = await page.evaluate(() => ({ reveal: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal"), progress: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-cinematic-progress"), scrollY }));
    samples.push({ cycle, forward, reverse });
  }
  await page.waitForTimeout(350);
  const rest = await page.evaluate(() => ({ pendingAnimationFrames: globalThis.__phase7aWork?.rafs.size ?? null, activeIntervals: globalThis.__phase7aWork?.intervals.size ?? null }));
  const checks = {
    tenCycles: samples.length === 10,
    forwardLatestPosition: samples.every(({ forward }) => forward.scrollY > 0),
    reverseExactTop: samples.every(({ reverse }) => reverse.scrollY === 0),
    reverseClearsManifesto: samples.every(({ reverse }) => reverse.reveal === "hidden"),
    noIdleRaf: rest.pendingAnimationFrames === 0,
    noIntervals: rest.activeIntervals === 0,
  };
  await context.close();
  return { geometry, samples, rest, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
}

async function networkCases(browser, baseUrl, timeoutMs) {
  const results = [];
  for (const policy of ["blocked", "slow"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    let cinematicRequests = 0;
    await page.route(/phase-4r2.*\.mp4(?:[?#]|$)/i, async (route) => {
      cinematicRequests += 1;
      if (policy === "blocked") await route.abort("failed");
      else { await new Promise((resolve) => setTimeout(resolve, 500)); await route.continue(); }
    });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(policy === "blocked" ? 4_500 : 900);
    const state = await inspectDocument(page);
    const checks = { semanticH1: canonicalText(state.h1) === canonicalText(MANIFESTO), noOverflow: !state.horizontalOverflow, boundedRequests: cinematicRequests <= 1 };
    results.push({ policy, cinematicRequests, state, checks, status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" });
    await context.close();
  }
  return results;
}

async function runEngine(engine, options) {
  const browserType = BROWSERS[engine];
  const executablePath = browserType.executablePath();
  const executable = await stat(executablePath).then(() => executablePath).catch(() => null);
  invariant(executable, `managed ${engine} executable unavailable: ${executablePath}`);
  const browser = await browserType.launch({ headless: !options.headed, executablePath });
  try {
    const identity = { engine, executable: path.basename(executablePath), version: browser.version(), authority: engine === "webkit" ? "Playwright WebKit proxy; not physical Safari" : `Playwright managed ${engine}` };
    const routes = await routeMatrix(browser, options.baseUrl, options.timeoutMs, engine);
    const accessibility = await axeMatrix(browser, options.baseUrl, options.timeoutMs);
    const responsive = await responsiveMatrix(browser, options.baseUrl, options.timeoutMs, engine, options.authorityProfile);
    const fieldMap = await fieldMapCase(browser, options.baseUrl, options.timeoutMs);
    const fallback = await fallbackCases(browser, options.baseUrl, options.timeoutMs);
    const history = await intentHistoryCase(browser, options.baseUrl, options.timeoutMs);
    const cycles = await reverseCyclesCase(browser, options.baseUrl, options.timeoutMs);
    const network = await networkCases(browser, options.baseUrl, options.timeoutMs);
    const failures = [
      ...routes.filter(({ status }) => status !== "PASS").map(({ route, viewport }) => `route:${route}:${viewport.id}`),
      ...accessibility.filter(({ status }) => status !== "PASS").map(({ route, viewport }) => `axe:${route}:${viewport.id}`),
      ...responsive.filter(({ status }) => status !== "PASS").map(({ viewport }) => `responsive:${viewport.id}`),
      ...(fieldMap.status === "PASS" ? [] : ["field-map"]),
      ...Object.entries(fallback).filter(([, value]) => value.status !== "PASS").map(([key]) => `fallback:${key}`),
      ...(history.status === "PASS" ? [] : ["history"]),
      ...(cycles.status === "PASS" ? [] : ["lifecycle"]),
      ...network.filter(({ status }) => status !== "PASS").map(({ policy }) => `network:${policy}`),
    ];
    return { identity, routes, accessibility, responsive, fieldMap, fallback, history, cycles, network, failures, status: failures.length ? "FAIL" : "PASS" };
  } finally {
    await browser.close();
  }
}

export function selfTest() {
  invariant(RESPONSIVE_VIEWPORTS.length === 13, "responsive contract must contain 13 viewports");
  invariant(ROUTE_OUTCOMES.length === 10, "route contract must contain nine public routes and a real 404");
  invariant(AXE_VIEWPORTS.length * ROUTE_OUTCOMES.length * 3 === 60, "full accessibility matrix must contain 60 cases");
  invariant(PHASE7A_GATES.length === 6 && PHASE7A_GATES.every(Boolean), "six human gates required");
  invariant(ROUTE_MATRIX_COUNTS.all === 198, "route matrix contract must contain 198 cases");
  invariant(authorityProfileById(R2_PROFILE).id === R2_PROFILE, "R2 QA authority profile is unavailable");
  return {
    schema: SCHEMA,
    status: "PASS",
    responsiveViewports: 13,
    routeOutcomes: 10,
    fullRouteCases: 198,
    fullAxeCases: 60,
    thresholdCyclesPerEngine: 10,
    enhancedResponsiveProfiles: ["phase7a-r1", R2_PROFILE],
    r2SourceSchema: PHASE7A_R2_QA_SOURCE_SCHEMA,
    r2NormalizedSchema: PHASE7A_R2_RETAINED_QA_SCHEMA,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/qa-phase7a-browser.mjs --base-url <url> --output <external.json> [--authority-profile phase7a|phase7a-r1|phase7a-r2] [--revision <exact-final-head>] [--engine all|chromium|firefox|webkit] [--headed]\nR2 reads the existing governed dist, requires a clean exact branch/HEAD with upstream parity, and binds document/CSS/JavaScript served bytes without invoking the R1 portable-build helper.\n");
    return;
  }
  if (options.selfTest) { process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`); return; }
  try { await stat(options.output); throw new Error(`refusing to overwrite existing evidence: ${options.output}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const startedAt = new Date().toISOString();
  const servedBuild = options.authorityProfile === "phase7a-r1" ? await capturePortableServedBuildReceipt(options) : null;
  const r2Start = options.authorityProfile === R2_PROFILE ? await captureR2QaBoundary(options.revision) : null;
  const engines = options.engine === "all" ? Object.keys(BROWSERS) : [options.engine];
  const results = [];
  for (const engine of engines) results.push(await runEngine(engine, options));
  const r2SourceAuthority = r2Start ? await finalizeR2QaSourceAuthority(options, r2Start) : null;
  const sourceReference = servedBuild
    ? portableServedBuildReference(servedBuild)
    : r2SourceAuthority ? r2QaSourceAuthorityReference(r2SourceAuthority) : null;
  if (sourceReference) for (const result of results) result.sourceAuthority = sourceReference;
  const humanGates = options.authorityProfile === R2_PROFILE
    ? Object.fromEntries(PHASE7A_GATES.map((gate) => [gate, R2_ACCEPTED_GATES.has(gate) ? "ACCEPT" : "PENDING HUMAN REVIEW"]))
    : Object.fromEntries(PHASE7A_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"]));
  const report = {
    schema: SCHEMA,
    authorityProfile: options.authorityProfile,
    branch: authorityProfileById(options.authorityProfile).branch,
    ...(options.revision ? { revision: options.revision } : {}),
    captureOrigin: options.authorityProfile === R2_PROFILE ? options.baseUrl : "CAPTURE_ORIGIN",
    startedAt,
    completedAt: new Date().toISOString(),
    results,
    ...(servedBuild ? { servedBuild } : {}),
    ...(r2SourceAuthority ? { sourceAuthority: r2SourceAuthority } : {}),
    limitations: [
      "WebKit is the Playwright WebKit proxy and is not physical Safari.",
      "Programmatic scroll in the harness observes product response; it is not evidence of physical wheel or touch input.",
      "Automated focus, contrast and target checks supplement but do not replace human review.",
      options.authorityProfile === R2_PROFILE
        ? "Five prior human gate decisions remain ACCEPT; the accessibility, fallback and performance gate remains PENDING HUMAN REVIEW regardless of automated status."
        : "All six creative and integration gates remain PENDING HUMAN REVIEW regardless of automated status.",
    ],
    humanGates,
    status: results.every(({ status }) => status === "PASS") ? "PASS" : "FAIL",
  };
  validateQaServedBuildBindings(report);
  report.reportSha256 = qaReportSha256(report);
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({ status: report.status, output: options.output, engines: results.map(({ identity, failures }) => ({ engine: identity.engine, version: identity.version, failures })) }, null, 2)}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`Phase 7A browser validation FAIL: ${error.stack ?? error}\n`); process.exitCode = 1; });
}
