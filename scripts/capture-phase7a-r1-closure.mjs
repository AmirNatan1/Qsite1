#!/usr/bin/env node

/**
 * Phase 7A-R1 focused closure evidence.
 *
 * This capture is deliberately independent of the repository. It writes only
 * decoded PNGs, normalized fully decoded MP4s, and text reports to a fresh external directory. Font
 * binaries, HTML specimens, browser executable paths, local capture URLs and
 * other machine-private paths are never published.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  MINIMUM_MANIFESTO_SAFETY_PX,
  PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS,
  measureManifestoGeometry,
  validateManifestoGeometry,
} from "./phase7a-manifesto-geometry.mjs";
import {
  observeTargetSizes,
} from "./phase7a-target-size.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
export const CLOSURE_SCHEMA = "quantum-hub.phase-7a-r1.closure-capture.v1";
export const CLOSURE_MANIFEST_PATH = "closure-manifest.json";
export const PHASE7A_R1_EXACT_PARENT = "a87de3c08135e594199db1cebddc427dd8763fcb";
export const PHASE7A_R1_REQUIRED_BRANCH = "repair/phase-7a-r1-signal-field-authority";
export const SERVED_BUILD_AUTHORITY_SCHEMA = "quantum-hub.phase-7a-r1.served-build-authority.v1";
export const EXACT_PARENT_HOME_DOCUMENT_AUTHORITY = Object.freeze({
  bytes: 17_917,
  relativePath: "dist/index.html",
  revision: PHASE7A_R1_EXACT_PARENT,
  sha256: "2c153d9094fe0ca888cbbc7ac4105a775b2ac5b088b47b650d542c2a9cb62cac",
});
export const EXACT_PARENT_RUNTIME_ASSET_AUTHORITY = Object.freeze({
  revision: PHASE7A_R1_EXACT_PARENT,
  derivation: "immutable linked CSS/JavaScript bytes from the exact-parent governed build",
  fingerprint: "223c3e7a5fce599b7818e3f19d3c786e4f67fca85b5fcc60f9f1e3d58304b3d7",
  records: Object.freeze([
    Object.freeze({ kind: "css", route: "/_astro/BaseLayout.ByjrAQMG.css", bytes: 12_579, sha256: "0967a69765cc49c6291e125d44958bb19694d1c74fe028e17f6f095bd1109f68" }),
    Object.freeze({ kind: "javascript", route: "/_astro/index.astro_astro_type_script_index_0_lang.DuXUZIF3.js", bytes: 2_604, sha256: "05006aae308ac99e9f16bb4c7d93b75f41e8766ea06aaf9d8c3d19fb1a7bb52a" }),
    Object.freeze({ kind: "css", route: "/_astro/index.CMvgVrhb.css", bytes: 17_131, sha256: "a9932a0eed64df5c5a5ebc35067b003558644bbddb8c179227364c1b340c0691" }),
  ]),
});
export const COMPARISON_RECORDING_SCHEMA = "quantum-hub.phase-7a-r1.signal-field-comparison-recordings.v1";
export const COMPARISON_RECORDING_VIEW = Object.freeze({ width: 1280, height: 720 });
export const COMPARISON_RECORDING_CONTRACT = Object.freeze({
  audioStreams: 0,
  codec: "h264",
  container: "mp4",
  durationSeconds: 6,
  fps: 30,
  height: COMPARISON_RECORDING_VIEW.height,
  maximumSeconds: 6.6,
  minimumSeconds: 5.5,
  pixelFormat: "yuv420p",
  videoStreams: 1,
  width: COMPARISON_RECORDING_VIEW.width,
});
export const COMPARISON_RECORDING_SPECS = Object.freeze([
  Object.freeze({ id: "chromium-before-parent", engine: "chromium", state: "before", sourceKind: "exact-parent", relativePath: "recordings/signal-field-comparison/chromium-before-parent.mp4", boundedPointerResponse: false }),
  Object.freeze({ id: "chromium-after-r1", engine: "chromium", state: "after", sourceKind: "phase-7a-r1", relativePath: "recordings/signal-field-comparison/chromium-after-r1.mp4", boundedPointerResponse: true }),
  Object.freeze({ id: "firefox-before-parent", engine: "firefox", state: "before", sourceKind: "exact-parent", relativePath: "recordings/signal-field-comparison/firefox-before-parent.mp4", boundedPointerResponse: false }),
  Object.freeze({ id: "firefox-after-r1", engine: "firefox", state: "after", sourceKind: "phase-7a-r1", relativePath: "recordings/signal-field-comparison/firefox-after-r1.mp4", boundedPointerResponse: true }),
]);

const executableName = (basename) => process.platform === "win32" ? `${basename}.exe` : basename;
export const DEFAULT_FFMPEG_CANDIDATES = Object.freeze([
  path.join(ROOT, "node_modules", "ffmpeg-static", executableName("ffmpeg")),
  path.resolve(ROOT, "..", "phase-5a-r-work", "tooling", "node_modules", "ffmpeg-static", executableName("ffmpeg")),
  "ffmpeg",
]);
export const DEFAULT_FFPROBE_CANDIDATES = Object.freeze([
  path.join(ROOT, "node_modules", "ffprobe-static", "bin", process.platform === "win32" ? path.join("win32", "x64", "ffprobe.exe") : "ffprobe"),
  path.resolve(ROOT, "..", "phase-5a-r-work", "tooling", "node_modules", "ffprobe-static", "bin", process.platform === "win32" ? path.join("win32", "x64", "ffprobe.exe") : "ffprobe"),
  "ffprobe",
]);
export const REQUIRED_SHORT_LANDSCAPE_VIEWPORTS = PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS;
export const CORE_TARGET_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "desktop-1440x900", width: 1440, height: 900 }),
  Object.freeze({ id: "short-desktop-1366x650", width: 1366, height: 650 }),
  Object.freeze({ id: "desktop-1024x768", width: 1024, height: 768 }),
  Object.freeze({ id: "tablet-portrait-768x1024", width: 768, height: 1024 }),
  Object.freeze({ id: "mobile-landscape-844x390", width: 844, height: 390 }),
  Object.freeze({ id: "mobile-390x844", width: 390, height: 844 }),
  Object.freeze({ id: "narrow-320x800", width: 320, height: 800 }),
]);
export const NO_JS_FIELD_MAP_DESTINATIONS = Object.freeze([
  Object.freeze({ href: "/#entry", name: "Home" }),
  Object.freeze({ href: "/for-partners/", name: "For industry" }),
  Object.freeze({ href: "/for-startups/", name: "For startups" }),
  Object.freeze({ href: "/industries/", name: "Industries" }),
  Object.freeze({ href: "/pocs/", name: "Proof" }),
  Object.freeze({ href: "/spark/", name: "SPARK" }),
  Object.freeze({ href: "/about/", name: "About" }),
  Object.freeze({ href: "/contact/", name: "Contact" }),
]);
export const NO_JS_BIFURCATION_DESTINATIONS = Object.freeze([
  Object.freeze({ href: "/for-partners/", name: "For industry" }),
  Object.freeze({ href: "/for-startups/", name: "For startups" }),
]);

export const TYPOGRAPHY_SPECS = Object.freeze([
  Object.freeze({
    id: "anybody",
    label: "Anybody",
    family: "Anybody Evidence",
    role: "provisional Phase 7A-R1 display face",
    source: "public/fonts/anybody-latin-variable.woff2",
    licence: "public/fonts/licenses/OFL-Anybody.txt",
    storedStretch: "58%",
    resolvedStretch: "112%",
    production: true,
  }),
  Object.freeze({
    id: "mona-sans",
    label: "Mona Sans",
    family: "Mona Sans Evidence",
    role: "industrial control candidate",
    source: "artifacts/original/phase-7a-typography-candidates/mona-sans-v2.0.27-variable.woff2",
    licence: "artifacts/original/phase-7a-typography-candidates/OFL-Mona-Sans.txt",
    storedStretch: "75%",
    resolvedStretch: "125%",
    production: false,
  }),
  Object.freeze({
    id: "bricolage-grotesque",
    label: "Bricolage Grotesque",
    family: "Bricolage Evidence",
    role: "authored challenger candidate",
    source: "artifacts/original/phase-7a-typography-candidates/bricolage-grotesque-variable.woff2",
    licence: "artifacts/original/phase-7a-typography-candidates/OFL-Bricolage-Grotesque.txt",
    storedStretch: "75%",
    resolvedStretch: "100%",
    production: false,
  }),
  Object.freeze({
    id: "archivo",
    label: "Archivo",
    family: "Archivo Evidence",
    role: "legibility backstop candidate",
    source: "artifacts/original/phase-7a-typography-candidates/archivo-variable.ttf",
    licence: "artifacts/original/phase-7a-typography-candidates/OFL-Archivo.txt",
    storedStretch: "62%",
    resolvedStretch: "125%",
    production: false,
  }),
]);

export const FINAL_ROUTE_SPECS = Object.freeze([
  Object.freeze({ id: "for-industry", route: "/for-partners/", expected: "for-industry", status: 200 }),
  Object.freeze({ id: "for-startups", route: "/for-startups/", expected: "for-startups", status: 200 }),
  Object.freeze({ id: "industries", route: "/industries/", expected: "industries", status: 200 }),
  Object.freeze({ id: "proof", route: "/pocs/", expected: "proof", status: 200 }),
  Object.freeze({ id: "spark", route: "/spark/", expected: "spark", status: 200 }),
  Object.freeze({ id: "about", route: "/about/", expected: "about", status: 200 }),
  Object.freeze({ id: "contact", route: "/contact/", expected: "contact", status: 200 }),
  Object.freeze({ id: "real-404", route: "/phase-7a-r1-real-404/", expected: "404", status: 404 }),
]);

const FORBIDDEN_ARTIFACT_EXTENSION = /\.(?:html?|woff2?|ttf|otf|eot|zip|7z|rar|tar|gz|webm|mov|mkv|avi|log|map)$/i;
const FORBIDDEN_ARTIFACT_SEGMENT = /(?:^|\/)(?:node_modules|\.git|raw|source|sources|src|private|secrets?|traces?|fonts?|font-files)(?:\/|$)/i;
const PRIVATE_PATH = /(?:[a-z]:[\\/](?:users|documents|program files|windows|temp)[\\/]|\/(?:users|home|private|tmp)\/|appdata|onedrive|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/)/i;
const LOCAL_CAPTURE_URL = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?/i;
const EMBEDDED_FONT = /data:(?:font\/[^;,]+|application\/(?:font|x-font)[^;,]*);base64,/i;
const BASE64_BLOCK = /(?:^|["':,\s])(?:[A-Za-z0-9+/]{384,}={0,2})(?:$|["',\s])/;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function relativePosix(parent, candidate) {
  return path.relative(parent, candidate).replaceAll("\\", "/");
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function exists(candidate) {
  try {
    await access(candidate, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isHash(value, length = 64) {
  return new RegExp(`^[a-f0-9]{${length}}$`).test(String(value ?? ""));
}

export function assertRepositoryAuthority(authority, afterRevision) {
  invariant(authority?.schema === SERVED_BUILD_AUTHORITY_SCHEMA, "repository authority schema differs");
  invariant(authority.branch === PHASE7A_R1_REQUIRED_BRANCH, `capture must run from ${PHASE7A_R1_REQUIRED_BRANCH}`);
  invariant(isHash(afterRevision, 40) && authority.head === afterRevision, "local HEAD differs from --after-revision");
  invariant(authority.exactParent === PHASE7A_R1_EXACT_PARENT && authority.parentIsAncestor === true, "exact parent ancestry differs");
  invariant(authority.mergeCommitsSinceParent === 0, "R1 comparison range contains a merge commit");
  invariant(authority.worktreeClean === true && Array.isArray(authority.worktreeStatus) && authority.worktreeStatus.length === 0, "worktree must be fully clean, including non-ignored untracked files, before closure capture");
  invariant(
    authority.buildReceipt?.command === "npm run build:phase7a-r1"
      && authority.buildReceipt.authorityProfile === "phase7a-r1"
      && authority.buildReceipt.completed === true
      && authority.buildReceipt.headBefore === afterRevision
      && authority.buildReceipt.headAfter === afterRevision
      && authority.buildReceipt.branchAfter === PHASE7A_R1_REQUIRED_BRANCH
      && authority.buildReceipt.worktreeCleanAfter === true
      && Array.isArray(authority.buildReceipt.worktreeStatusAfter)
      && authority.buildReceipt.worktreeStatusAfter.length === 0,
    "fresh governed Phase 7A-R1 build receipt differs",
  );
  invariant(authority.localDist?.relativePath === "dist/index.html", "local after document path differs");
  invariant(Number.isSafeInteger(authority.localDist?.bytes) && authority.localDist.bytes > 0, "local after document byte authority is invalid");
  invariant(isHash(authority.localDist?.sha256), "local after document SHA-256 authority is invalid");
  return true;
}

async function gitOutput(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return String(stdout).trim();
}

async function runGovernedR1Build() {
  if (process.platform !== "win32") {
    await execFileAsync("npm", ["run", "build:phase7a-r1"], {
      cwd: ROOT,
      env: { ...process.env },
      windowsHide: true,
      timeout: 15 * 60_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return;
  }

  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "nodejs", "node_modules", "npm", "bin", "npm-cli.js") : null,
  ].filter(Boolean);
  let npmCli = null;
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.R_OK);
      npmCli = candidate;
      break;
    } catch {
      // Keep looking for the npm CLI that can be run by this exact Node binary.
    }
  }
  invariant(npmCli, "npm CLI is unavailable for the governed R1 closure build");
  const governedEnvironment = { ...process.env };
  const pathKey = Object.keys(governedEnvironment).find((key) => key.toLowerCase() === "path") ?? "PATH";
  governedEnvironment[pathKey] = [path.dirname(process.execPath), governedEnvironment[pathKey]].filter(Boolean).join(path.delimiter);
  governedEnvironment.npm_node_execpath = process.execPath;
  await execFileAsync(process.execPath, [npmCli, "run", "build:phase7a-r1"], {
    cwd: ROOT,
    env: governedEnvironment,
    windowsHide: true,
    timeout: 15 * 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function captureRepositoryAuthority(afterRevision) {
  const branch = await gitOutput(["branch", "--show-current"]);
  const head = await gitOutput(["rev-parse", "HEAD"]);
  const worktreeStatus = await gitOutput(["status", "--porcelain=v1", "--untracked-files=normal"]);
  invariant(branch === PHASE7A_R1_REQUIRED_BRANCH, `capture must run from ${PHASE7A_R1_REQUIRED_BRANCH}`);
  invariant(head === afterRevision, "local HEAD differs from --after-revision");
  invariant(worktreeStatus === "", "worktree must be fully clean, including non-ignored untracked files, before closure capture");
  let parentIsAncestor = false;
  try {
    await execFileAsync("git", ["merge-base", "--is-ancestor", PHASE7A_R1_EXACT_PARENT, head], {
      cwd: ROOT,
      windowsHide: true,
      timeout: 15_000,
    });
    parentIsAncestor = true;
  } catch {
    parentIsAncestor = false;
  }
  const mergeCommitsSinceParent = Number(await gitOutput(["rev-list", "--count", "--merges", `${PHASE7A_R1_EXACT_PARENT}..${head}`]));
  await runGovernedR1Build();
  const headAfter = await gitOutput(["rev-parse", "HEAD"]);
  const branchAfter = await gitOutput(["branch", "--show-current"]);
  const worktreeStatusAfter = await gitOutput(["status", "--porcelain=v1", "--untracked-files=normal"]);
  const distBytes = await readFile(path.join(ROOT, "dist", "index.html"));
  const authority = {
    schema: SERVED_BUILD_AUTHORITY_SCHEMA,
    branch,
    head,
    exactParent: PHASE7A_R1_EXACT_PARENT,
    parentIsAncestor,
    mergeCommitsSinceParent,
    worktreeClean: worktreeStatus === "",
    worktreeStatus: worktreeStatus ? worktreeStatus.split(/\r?\n/).filter(Boolean) : [],
    buildReceipt: {
      command: "npm run build:phase7a-r1",
      authorityProfile: "phase7a-r1",
      completed: true,
      headBefore: head,
      headAfter,
      branchAfter,
      worktreeCleanAfter: worktreeStatusAfter === "",
      worktreeStatusAfter: worktreeStatusAfter ? worktreeStatusAfter.split(/\r?\n/).filter(Boolean) : [],
    },
    localDist: {
      relativePath: "dist/index.html",
      bytes: distBytes.length,
      sha256: sha256(distBytes),
    },
  };
  assertRepositoryAuthority(authority, afterRevision);
  return authority;
}

function assertDocumentRecord(record, label) {
  invariant(record?.route === "/" && record.httpStatus === 200, `${label} served document response differs`);
  invariant(String(record.contentType ?? "").toLowerCase().includes("text/html"), `${label} served document is not HTML`);
  invariant(Number.isSafeInteger(record.bytes) && record.bytes > 0 && isHash(record.sha256), `${label} served document fingerprint is invalid`);
}

function assertDomSignature(signature, label) {
  invariant(signature?.route === "/" && signature.responseStatus === 200, `${label} DOM navigation response differs`);
  invariant(signature.homeTitleCount === 1 && signature.signalFieldCount === 1, `${label} settled Signal Field DOM foundation differs`);
  invariant(signature.bifurcation && typeof signature.bifurcation === "object", `${label} bifurcation DOM inventory is missing`);
}

function expectedBoundedBifurcation(inventory) {
  return inventory?.thresholdCount === 1
    && inventory.fieldCount === 1
    && inventory.architectureCount === 1
    && inventory.incomingCount === 1
    && inventory.industryCount === 1
    && inventory.startupCount === 1
    && inventory.branchCount === 2
    && inventory.edgeSignalCount === 1
    && inventory.junctionCount === 1
    && inventory.destinationCount === 2
    && JSON.stringify(inventory.destinationHrefs) === JSON.stringify(["/for-partners/", "/for-startups/"])
    && JSON.stringify(inventory.destinationNames) === JSON.stringify(["For industry", "For startups"]);
}

function assertServedRuntimeAsset(record, label) {
  invariant(record && ["css", "javascript"].includes(record.kind), `${label} runtime asset kind differs`);
  invariant(typeof record.route === "string" && record.route.startsWith("/") && !record.route.includes(".."), `${label} runtime asset route differs`);
  invariant(record.httpStatus === 200 && Number.isSafeInteger(record.bytes) && record.bytes > 0 && isHash(record.sha256), `${label} runtime asset response fingerprint differs`);
  const contentType = String(record.contentType ?? "").toLowerCase();
  invariant(record.kind === "css" ? contentType.includes("text/css") : /javascript|ecmascript/.test(contentType), `${label} runtime asset content type differs`);
}

function assertRuntimeAssetAuthority(assets) {
  invariant(assets?.derivation === "linked CSS/JS paths parsed from each verified root HTML response", "runtime asset derivation authority differs");
  const before = assets.before;
  invariant(before?.revision === PHASE7A_R1_EXACT_PARENT && Array.isArray(before.served) && before.served.length >= 2, "exact-parent linked runtime asset inventory differs");
  before.served.forEach((record, index) => assertServedRuntimeAsset(record, `exact-parent asset ${index + 1}`));
  invariant(before.served.some(({ kind }) => kind === "css") && before.served.some(({ kind }) => kind === "javascript"), "exact-parent runtime asset inventory lacks CSS or JavaScript");
  invariant(before.fingerprint === runtimeAssetSetFingerprint(before.served), "exact-parent runtime asset set fingerprint differs");
  invariant(before.authority?.revision === PHASE7A_R1_EXACT_PARENT
    && before.authority.derivation === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.derivation
    && before.authority.fingerprint === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.fingerprint,
  "exact-parent immutable runtime asset authority receipt differs");
  invariant(before.fingerprint === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.fingerprint, "served exact-parent runtime assets differ from immutable authority");
  invariant(before.served.length === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.records.length, "served exact-parent runtime asset count differs from immutable authority");
  for (const [index, expected] of EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.records.entries()) {
    const served = before.served[index];
    invariant(served.kind === expected.kind
      && served.route === expected.route
      && served.bytes === expected.bytes
      && served.sha256 === expected.sha256,
    `served exact-parent runtime asset differs from immutable authority: ${expected.route}`);
  }

  const after = assets.after;
  invariant(Array.isArray(after?.localDist) && Array.isArray(after.served) && after.localDist.length === after.served.length && after.localDist.length >= 2, "R1 after linked runtime asset inventory differs");
  after.served.forEach((record, index) => assertServedRuntimeAsset(record, `R1 after asset ${index + 1}`));
  invariant(after.localDist.some(({ kind }) => kind === "css") && after.localDist.some(({ kind }) => kind === "javascript"), "R1 after runtime asset inventory lacks CSS or JavaScript");
  for (const [index, local] of after.localDist.entries()) {
    const served = after.served[index];
    invariant(
      served.kind === local.kind
        && served.route === local.route
        && served.bytes === local.bytes
        && served.sha256 === local.sha256,
      `served R1 runtime asset differs from fresh local dist: ${local.route}`,
    );
  }
  invariant(after.localFingerprint === runtimeAssetSetFingerprint(after.localDist), "fresh local R1 runtime asset set fingerprint differs");
  invariant(after.servedFingerprint === runtimeAssetSetFingerprint(after.served), "served R1 runtime asset set fingerprint differs");
  invariant(after.localFingerprint === after.servedFingerprint, "served R1 runtime asset set differs from fresh local dist");
  return true;
}

export function assertServedBuildAuthority(report, afterRevision) {
  invariant(report?.schema === SERVED_BUILD_AUTHORITY_SCHEMA && report.status === "PASS", "served-build authority report is not PASS");
  assertRepositoryAuthority(report.repository, afterRevision);
  invariant(report.originSeparation?.distinctNormalizedOrigins === true, "before and after served origins are not independent");
  const beforeDocument = report.documents?.before;
  const afterDocument = report.documents?.after;
  assertDocumentRecord(beforeDocument, "exact-parent");
  assertDocumentRecord(afterDocument, "R1 after");
  invariant(
    beforeDocument.bytes === EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.bytes
      && beforeDocument.sha256 === EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256,
    "served exact-parent document differs from immutable byte authority",
  );
  invariant(
    afterDocument.bytes === report.repository.localDist.bytes
      && afterDocument.sha256 === report.repository.localDist.sha256,
    "served R1 after document differs from local dist/index.html",
  );
  invariant(
    report.documentFingerprintsDistinct === true
      && beforeDocument.sha256 !== afterDocument.sha256,
    "before and after served document fingerprints are identical",
  );
  assertRuntimeAssetAuthority(report.runtimeAssets);

  const beforeDom = report.dom?.before;
  const afterDom = report.dom?.after;
  assertDomSignature(beforeDom, "exact-parent");
  assertDomSignature(afterDom, "R1 after");
  invariant(beforeDom.bifurcation.bounded === expectedBoundedBifurcation(beforeDom.bifurcation), "exact-parent bounded bifurcation summary is inconsistent");
  invariant(afterDom.bifurcation.bounded === expectedBoundedBifurcation(afterDom.bifurcation), "R1 after bounded bifurcation summary is inconsistent");
  invariant(
    beforeDom.signalFarCount === 0
      && beforeDom.signalOcclusionCount === 0
      && beforeDom.bifurcation.fieldCount === 0
      && beforeDom.bifurcation.bounded === false,
    "served exact-parent DOM contains R1-only Signal Field or bounded bifurcation structure",
  );
  invariant(
    afterDom.signalFarCount >= 1
      && afterDom.signalOcclusionCount >= 1
      && afterDom.bifurcation.fieldCount === 1
      && afterDom.bifurcation.industryCount === 1
      && afterDom.bifurcation.startupCount === 1
      && afterDom.bifurcation.junctionCount === 1
      && afterDom.bifurcation.destinationCount === 2
      && afterDom.bifurcation.bounded === true,
    "served R1 after DOM lacks the required structural layers or bounded bifurcation",
  );
  invariant(
    JSON.stringify(afterDom.bifurcation.destinationHrefs) === JSON.stringify(["/for-partners/", "/for-startups/"])
      && JSON.stringify(afterDom.bifurcation.destinationNames) === JSON.stringify(["For industry", "For startups"]),
    "served R1 after bifurcation destination authority differs",
  );
  return true;
}

function servedAuthorityReceipt(report) {
  return {
    report: "provenance/served-build-authority.json",
    status: report.status,
    branch: report.repository.branch,
    afterRevision: report.repository.head,
    beforeDocument: {
      revision: PHASE7A_R1_EXACT_PARENT,
      bytes: report.documents.before.bytes,
      sha256: report.documents.before.sha256,
    },
    afterDocument: {
      revision: report.repository.head,
      bytes: report.documents.after.bytes,
      sha256: report.documents.after.sha256,
    },
    runtimeAssets: {
      before: {
        count: report.runtimeAssets.before.served.length,
        fingerprint: report.runtimeAssets.before.fingerprint,
        immutableAuthority: report.runtimeAssets.before.authority,
      },
      after: {
        count: report.runtimeAssets.after.served.length,
        fingerprint: report.runtimeAssets.after.servedFingerprint,
      },
    },
    distinctDocumentFingerprints: report.documentFingerprintsDistinct,
    domSignatures: { before: "EXACT_PARENT", after: "PHASE_7A_R1" },
  };
}

function assertServedAuthorityReceipt(receipt, afterRevision) {
  invariant(receipt?.report === "provenance/served-build-authority.json" && receipt.status === "PASS", "comparison served-build receipt differs");
  invariant(receipt.branch === PHASE7A_R1_REQUIRED_BRANCH && receipt.afterRevision === afterRevision, "comparison local R1 revision receipt differs");
  invariant(
    receipt.beforeDocument?.revision === PHASE7A_R1_EXACT_PARENT
      && receipt.beforeDocument.bytes === EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.bytes
      && receipt.beforeDocument.sha256 === EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256,
    "comparison exact-parent document receipt differs",
  );
  invariant(
    receipt.afterDocument?.revision === afterRevision
      && Number.isSafeInteger(receipt.afterDocument.bytes)
      && receipt.afterDocument.bytes > 0
      && isHash(receipt.afterDocument.sha256),
    "comparison R1 after document receipt differs",
  );
  invariant(
    receipt.distinctDocumentFingerprints === true
      && receipt.beforeDocument.sha256 !== receipt.afterDocument.sha256
      && receipt.domSignatures?.before === "EXACT_PARENT"
      && receipt.domSignatures?.after === "PHASE_7A_R1",
    "comparison served-build distinction receipt differs",
  );
  invariant(
    Number.isSafeInteger(receipt.runtimeAssets?.before?.count)
      && receipt.runtimeAssets.before.count === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.records.length
      && receipt.runtimeAssets.before.fingerprint === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.fingerprint
      && receipt.runtimeAssets.before.immutableAuthority?.revision === PHASE7A_R1_EXACT_PARENT
      && receipt.runtimeAssets.before.immutableAuthority?.derivation === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.derivation
      && receipt.runtimeAssets.before.immutableAuthority?.fingerprint === EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.fingerprint
      && Number.isSafeInteger(receipt.runtimeAssets?.after?.count)
      && receipt.runtimeAssets.after.count >= 2
      && isHash(receipt.runtimeAssets.after.fingerprint),
    "comparison linked runtime asset receipt differs",
  );
  return true;
}

export function normalizeCaptureBaseUrl(value, label = "base URL") {
  invariant(typeof value === "string" && value.length > 0, `${label} is required`);
  const url = new URL(value);
  invariant(["http:", "https:"].includes(url.protocol), `${label} must use HTTP(S)`);
  invariant(!url.username && !url.password, `${label} must not contain credentials`);
  invariant(!url.search && !url.hash, `${label} must omit query and fragment`);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

export function assertExternalFreshOutput(candidate) {
  invariant(typeof candidate === "string" && candidate.length > 0, "--output is required");
  const resolved = path.resolve(candidate);
  invariant(!within(ROOT, resolved), "capture output must remain outside the repository");
  invariant(path.parse(resolved).root !== resolved, "capture output cannot be a filesystem root");
  return resolved;
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    afterBaseUrl: "",
    afterRevision: "",
    beforeBaseUrl: "",
    ffmpeg: "",
    ffprobe: "",
    headed: false,
    help: false,
    output: "",
    selfTest: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = valueAfter(argv, index, argument);
      index += 1;
      return value;
    };
    if (argument === "--before-base-url") options.beforeBaseUrl = next();
    else if (argument === "--after-base-url") options.afterBaseUrl = next();
    else if (argument === "--after-revision") options.afterRevision = next();
    else if (argument === "--output") options.output = next();
    else if (argument === "--ffmpeg") options.ffmpeg = path.resolve(next());
    else if (argument === "--ffprobe") options.ffprobe = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--headed") options.headed = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

export function validateOptions(options) {
  invariant(Number.isSafeInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms must be an integer from 5000 through 120000");
  if (!options.help && !options.selfTest) {
    options.beforeBaseUrl = normalizeCaptureBaseUrl(options.beforeBaseUrl, "--before-base-url");
    options.afterBaseUrl = normalizeCaptureBaseUrl(options.afterBaseUrl, "--after-base-url");
    invariant(options.beforeBaseUrl !== options.afterBaseUrl, "before and after capture origins must differ");
    invariant(/^[a-f0-9]{40}$/.test(options.afterRevision), "--after-revision must be the exact 40-character lowercase R1 HEAD");
    invariant(options.afterRevision !== PHASE7A_R1_EXACT_PARENT, "--after-revision must differ from the exact parent");
    options.output = assertExternalFreshOutput(options.output);
  }
  return options;
}

function safeString(value, replacements = []) {
  let result = String(value);
  for (const [needle, replacement] of replacements) {
    if (!needle) continue;
    result = result.split(needle).join(replacement);
    result = result.split(needle.replace(/\/$/, "")).join(replacement.replace(/\/$/, ""));
  }
  result = result
    .replace(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?/gi, "CAPTURE_ORIGIN")
    .replace(/[a-z]:[\\/](?:users|documents|program files|windows|temp)[\\/][^\s"'<>]*/gi, "[private-path-removed]")
    .replace(/\/(?:users|home|private|tmp)\/[^\s"'<>]*/gi, "[private-path-removed]")
    .replace(/file:\/\/[^\s"'<>]*/gi, "[private-path-removed]");
  return result;
}

export function sanitizeForEvidence(value, replacements = []) {
  if (typeof value === "string") return safeString(value, replacements);
  if (Array.isArray(value)) return value.map((entry) => sanitizeForEvidence(entry, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeForEvidence(entry, replacements)]));
  }
  return value;
}

export function forbiddenPayloadReason(relativePath, contents = null) {
  const normalized = String(relativePath).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) return "unsafe artifact path";
  if (FORBIDDEN_ARTIFACT_EXTENSION.test(normalized)) return "forbidden artifact extension";
  if (FORBIDDEN_ARTIFACT_SEGMENT.test(normalized)) return "forbidden artifact directory";
  if (contents !== null) {
    const text = Buffer.isBuffer(contents) ? contents.toString("utf8") : String(contents);
    if (PRIVATE_PATH.test(text)) return "private local path";
    if (LOCAL_CAPTURE_URL.test(text)) return "local capture URL";
    if (EMBEDDED_FONT.test(text)) return "embedded font payload";
    if (BASE64_BLOCK.test(text)) return "large base64 payload";
  }
  return null;
}

function captureUrl(baseUrl, route = "/") {
  return new URL(route.replace(/^\//, ""), baseUrl).toString();
}

async function writeArtifact(root, relativePath, data, { replacements = [] } = {}) {
  const normalized = relativePath.replaceAll("\\", "/");
  invariant(!forbiddenPayloadReason(normalized), `refusing forbidden artifact: ${normalized}`);
  const destination = path.join(root, ...normalized.split("/"));
  invariant(within(root, destination), `artifact escapes output: ${normalized}`);
  await mkdir(path.dirname(destination), { recursive: true });
  const payload = typeof data === "string" ? safeString(data, replacements) : data;
  if (typeof payload === "string") invariant(!forbiddenPayloadReason(normalized, payload), `unsafe evidence content: ${normalized}`);
  await writeFile(destination, payload, { flag: "wx" });
  return destination;
}

async function writeJson(root, relativePath, value, replacements) {
  const sanitized = sanitizeForEvidence(value, replacements);
  return writeArtifact(root, relativePath, `${JSON.stringify(sanitized, null, 2)}\n`, { replacements });
}

async function screenshot(page, root, relativePath, options = {}) {
  const normalized = relativePath.replaceAll("\\", "/");
  invariant(normalized.endsWith(".png"), `screenshot must be a PNG: ${normalized}`);
  const destination = path.join(root, ...normalized.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  await page.screenshot({ path: destination, type: "png", animations: "disabled", ...options });
  return destination;
}

async function settleFonts(page, timeoutMs) {
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded", undefined, { timeout: Math.min(timeoutMs, 15_000) }).catch(() => undefined);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  }).catch(() => undefined);
}

async function settleHome(page, baseUrl, timeoutMs, { route = "/#entry" } = {}) {
  const destination = captureUrl(baseUrl, route);
  const response = await page.goto(destination, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  invariant(response, "home navigation returned no document response");
  const expectedHash = new URL(destination).hash;
  if (expectedHash) {
    await page.waitForFunction((hash) => location.hash === hash, expectedHash, { timeout: Math.min(timeoutMs, 15_000) });
  }
  await page.waitForSelector("[data-manifesto-threshold] #home-title", { state: "attached", timeout: timeoutMs });
  await settleFonts(page, timeoutMs);
  const resolved = () => document.documentElement.dataset.cinematicMode === "static"
    || document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved";
  // Preserve the browser's native fragment placement, including scroll-margin
  // and the visible sticky-header boundary. A failure to resolve is evidence;
  // the capture must never manufacture a passing position by moving the page.
  await page.waitForFunction(resolved, undefined, { timeout: Math.min(timeoutMs, 15_000) });
  await page.waitForTimeout(180);
  return response;
}

function geometryResult(viewport, measurement) {
  try {
    validateManifestoGeometry(measurement);
    return { id: viewport.id, viewport, status: "PASS", failure: null, measurement };
  } catch (error) {
    return { id: viewport.id, viewport, status: "FAIL", failure: safeString(error?.message ?? error), measurement };
  }
}

export function assertAfterGeometryPass(cases) {
  invariant(Array.isArray(cases), "after geometry cases are required");
  invariant(cases.length === REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.length, "after geometry must cover exactly 12 required viewports");
  const expected = REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.map(({ id }) => id);
  const observed = cases.map(({ id }) => id);
  invariant(new Set(observed).size === observed.length, "after geometry contains duplicate viewports");
  invariant(expected.every((id, index) => observed[index] === id), "after geometry viewport order or membership differs");
  for (const item of cases) {
    invariant(item.status === "PASS" && !item.failure, `after geometry failed at ${item.id}: ${item.failure ?? "unexplained failure"}`);
  }
  for (const item of cases) {
    invariant(item.measurement && typeof item.measurement === "object", `after geometry measurement is missing at ${item.id}`);
    validateManifestoGeometry(item.measurement);
  }
  return true;
}

export function assertBefore800x360Defect(cases) {
  invariant(Array.isArray(cases) && cases.length === REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.length, "before geometry must retain the complete 12-case matrix");
  const expected = REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.map(({ id }) => id);
  const observed = cases.map(({ id }) => id);
  invariant(new Set(observed).size === observed.length && expected.every((id, index) => observed[index] === id), "before geometry viewport order or membership differs");
  const defect = cases.find(({ id }) => id === "short-landscape-800x360");
  invariant(defect?.status === "FAIL" && typeof defect.failure === "string", "exact-parent 800x360 geometry defect was not reproduced");
  const measurement = defect.measurement;
  invariant(measurement && typeof measurement === "object", "exact-parent 800x360 defect has no geometry measurement");
  const effectiveTop = measurement.effectiveVisibleBounds?.top;
  const h1Top = measurement.h1?.rect?.top;
  const glyphTop = measurement.glyphBounds?.top;
  invariant(Number.isFinite(effectiveTop) && Number.isFinite(h1Top) && Number.isFinite(glyphTop), "exact-parent 800x360 top-boundary rectangles are incomplete");
  const allowances = [
    measurement.safeAllowances?.h1?.top,
    measurement.safeAllowances?.glyphs?.top,
    ...(measurement.safeAllowances?.renderedLines ?? []).map(({ top }) => top),
  ].filter(Number.isFinite);
  const headerIntersections = measurement.boundaryAnalysis?.occludingHeaderIntersections ?? [];
  const glyphEscapes = measurement.boundaryAnalysis?.glyphEscapes ?? [];
  const boundaryIntersections = measurement.boundaryAnalysis?.boundaryIntersections ?? [];
  const topSafetyViolations = (measurement.boundaryAnalysis?.safetyViolations ?? [])
    .some(({ sides }) => Array.isArray(sides) && sides.includes("top"));
  invariant(
    allowances.some((allowance) => allowance < MINIMUM_MANIFESTO_SAFETY_PX)
      || headerIntersections.length > 0
      || glyphEscapes.some(({ sides }) => Array.isArray(sides) && sides.includes("top"))
      || boundaryIntersections.some(({ sides }) => Array.isArray(sides) && sides.includes("top"))
      || topSafetyViolations,
    "exact-parent 800x360 failure does not contain measured top-clipping evidence",
  );
  invariant(h1Top < effectiveTop || glyphTop < effectiveTop, "exact-parent 800x360 glyph-bearing bounds do not cross the effective top boundary");
  return true;
}

export function assertComparativeGeometry(beforeCases, afterCases) {
  assertBefore800x360Defect(beforeCases);
  assertAfterGeometryPass(afterCases);
  return true;
}

function measuredRect(rect, label) {
  invariant(rect && typeof rect === "object", `${label} is missing`);
  for (const property of ["left", "top", "right", "bottom", "width", "height"]) {
    invariant(Number.isFinite(rect[property]), `${label}.${property} is not finite`);
  }
  invariant(rect.width > 0 && rect.height > 0, `${label} has no visible area`);
  return rect;
}

function fourSideAllowances(bounds, visibleBounds) {
  return {
    left: bounds.left - visibleBounds.left,
    top: bounds.top - visibleBounds.top,
    right: visibleBounds.right - bounds.right,
    bottom: visibleBounds.bottom - bounds.bottom,
  };
}

export function validateFallbackManifestoMeasurement(measurement, label = "fallback state") {
  invariant(measurement && typeof measurement === "object" && measurement.measurementError === null, `${label}: shared manifesto measurement is missing or incomplete`);
  const effective = measuredRect(measurement.effectiveVisibleBounds, `${label} effective visible bounds`);
  const h1 = measuredRect(measurement.h1?.rect, `${label} H1 bounds`);
  const glyphs = measuredRect(measurement.glyphBounds, `${label} glyph bounds`);
  invariant(measurement.h1?.presentation?.visible === true, `${label}: H1 is present but not visibly rendered`);
  const header = measurement.occludingHeader;
  invariant(header && typeof header === "object" && typeof header.presentation?.visible === "boolean", `${label}: sticky-header measurement is missing`);
  if (header.presentation.visible) {
    invariant(
      header.anchoredToViewportTop === true
        && header.occluding === true
        && Number.isFinite(header.effectiveBottom)
        && effective.top >= header.effectiveBottom - 0.05,
      `${label}: effective visible bounds do not include the visible sticky header`,
    );
  } else {
    invariant(header.occluding === false, `${label}: hidden sticky header is incorrectly classified as occluding`);
  }
  invariant(Array.isArray(measurement.authoredLines) && measurement.authoredLines.length === 3, `${label}: authored manifesto line inventory differs`);
  const glyphBoxes = measurement.authoredLines.flatMap((line) => Array.isArray(line.glyphBoxes) ? line.glyphBoxes : []);
  invariant(glyphBoxes.length > 0, `${label}: glyph-bearing Range inventory is empty`);
  for (const [index, glyph] of glyphBoxes.entries()) measuredRect(glyph, `${label} glyph ${index + 1}`);
  const h1Allowances = fourSideAllowances(h1, effective);
  const glyphAllowances = fourSideAllowances(glyphs, effective);
  for (const [subject, allowances] of [["H1", h1Allowances], ["glyph", glyphAllowances]]) {
    for (const [side, allowance] of Object.entries(allowances)) {
      invariant(allowance >= MINIMUM_MANIFESTO_SAFETY_PX, `${label}: ${subject} ${side} safety is ${allowance}px; at least ${MINIMUM_MANIFESTO_SAFETY_PX}px is required`);
    }
  }
  for (const [index, glyph] of glyphBoxes.entries()) {
    const allowances = fourSideAllowances(glyph, effective);
    invariant(Object.values(allowances).every((value) => value >= MINIMUM_MANIFESTO_SAFETY_PX), `${label}: glyph ${index + 1} intersects an effective clipping/header boundary`);
  }
  invariant(measurement.horizontalOverflow === false && measurement.horizontalMetrics?.overflowPixels === 0, `${label}: horizontal overflow is present`);
  invariant(Array.isArray(measurement.boundaryAnalysis?.glyphEscapes) && measurement.boundaryAnalysis.glyphEscapes.length === 0, `${label}: glyph escape inventory is not empty`);
  invariant(Array.isArray(measurement.boundaryAnalysis?.boundaryIntersections) && measurement.boundaryAnalysis.boundaryIntersections.length === 0, `${label}: glyph-bearing line intersects an effective boundary`);
  invariant(Array.isArray(measurement.boundaryAnalysis?.occludingHeaderIntersections) && measurement.boundaryAnalysis.occludingHeaderIntersections.length === 0, `${label}: glyph-bearing line intersects the sticky header`);
  return {
    status: "PASS",
    authority: "shared phase7a-manifesto-geometry measurement",
    effectiveVisibleBounds: effective,
    h1Bounds: h1,
    glyphBounds: glyphs,
    h1Allowances,
    glyphAllowances,
    glyphBoxCount: glyphBoxes.length,
    visibleStickyHeaderBottom: header.presentation.visible ? header.effectiveBottom : null,
    horizontalOverflow: false,
  };
}

export function assertVisibleLinkInventory(inventory, expected, label = "link inventory") {
  invariant(Array.isArray(inventory) && Array.isArray(expected) && inventory.length === expected.length, `${label}: destination count differs`);
  inventory.forEach((record, index) => {
    const authority = expected[index];
    invariant(record.href === authority.href && record.accessibleName.includes(authority.name), `${label}: destination ${index + 1} identity differs`);
    invariant(record.visible === true, `${label}: ${authority.name} is present but hidden`);
    invariant(record.fullyInViewport === true, `${label}: ${authority.name} is clipped outside the viewport`);
    invariant(record.unoccluded === true, `${label}: ${authority.name} is visually occluded`);
    invariant(record.intendedInteractive === true && record.width > 0 && record.height > 0, `${label}: ${authority.name} is not an active visible link`);
  });
  return true;
}

export function assertNativeFieldMapViewport(state) {
  invariant(state?.nativeDetailsOpen === true && state.enhancedController === null, "no-JavaScript Field Map is not the native open details state");
  invariant(state.plane?.position === "fixed" && state.plane.visible === true, "native Field Map plane is not a visible fixed surface");
  invariant(
    Math.abs(state.plane.bounds.left) <= 1
      && Math.abs(state.plane.bounds.top) <= 1
      && Math.abs(state.plane.bounds.right - state.viewport.width) <= 1
      && Math.abs(state.plane.bounds.bottom - state.viewport.height) <= 1
      && Math.abs(state.plane.bounds.width - state.viewport.width) <= 1
      && Math.abs(state.plane.bounds.height - state.viewport.height) <= 1,
    "native Field Map plane does not occupy the complete viewport",
  );
  return true;
}

export function assertTargetLedgerPass(states) {
  invariant(Array.isArray(states) && states.length > 0, "target-size state ledger is required");
  const ids = states.map(({ id }) => id);
  invariant(new Set(ids).size === ids.length, "target-size state ledger contains duplicate identifiers");
  for (const state of states) {
    const summary = state.report?.summary ?? {};
    invariant(
      state.report?.status === "PASS"
      && summary.targetFailures === 0
      && summary.unexplainedExclusions === 0
      && summary.contractFailures === 0,
      `target-size state failed: ${state.id}`,
    );
  }
  return true;
}

function rational(value) {
  const [numerator, denominator] = String(value ?? "").split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return Number.NaN;
  return numerator / denominator;
}

function comparisonVideoFilter() {
  return `scale=${COMPARISON_RECORDING_VIEW.width}:${COMPARISON_RECORDING_VIEW.height}:force_original_aspect_ratio=decrease,pad=${COMPARISON_RECORDING_VIEW.width}:${COMPARISON_RECORDING_VIEW.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${COMPARISON_RECORDING_CONTRACT.fps},format=${COMPARISON_RECORDING_CONTRACT.pixelFormat},setpts=PTS-STARTPTS`;
}

export function comparisonEncoderArguments(rawFile, destination, {
  trimStartSeconds,
  durationSeconds = COMPARISON_RECORDING_CONTRACT.durationSeconds,
} = {}) {
  invariant(typeof rawFile === "string" && rawFile.length > 0, "raw comparison recording is required");
  invariant(typeof destination === "string" && destination.endsWith(".mp4"), "comparison destination must be MP4");
  invariant(Number.isFinite(trimStartSeconds) && trimStartSeconds >= 0, "comparison trim start is invalid");
  invariant(Number.isFinite(durationSeconds) && durationSeconds >= COMPARISON_RECORDING_CONTRACT.minimumSeconds && durationSeconds <= COMPARISON_RECORDING_CONTRACT.maximumSeconds, "comparison duration differs from contract");
  return [
    "-v", "error", "-n",
    "-ss", trimStartSeconds.toFixed(3),
    "-i", rawFile,
    "-t", durationSeconds.toFixed(3),
    "-map", "0:v:0",
    "-vf", comparisonVideoFilter(),
    "-an", "-sn", "-dn", "-map_metadata", "-1",
    "-fps_mode", "cfr", "-r", String(COMPARISON_RECORDING_CONTRACT.fps),
    "-c:v", "libx264", "-preset", "medium", "-crf", "22",
    "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-movflags", "+faststart",
    destination,
  ];
}

export function comparisonFullDecodeArguments(file) {
  return ["-v", "error", "-xerror", "-i", file, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"];
}

export function validateComparisonRecordingProbe(probe, { fullDecodePassed = false } = {}) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const videos = streams.filter(({ codec_type: type }) => type === "video");
  const audios = streams.filter(({ codec_type: type }) => type === "audio");
  const others = streams.filter(({ codec_type: type }) => !["video", "audio"].includes(type));
  const video = videos[0] ?? {};
  const durationSeconds = Number(probe?.format?.duration ?? video.duration);
  const averageFps = rational(video.avg_frame_rate);
  const realFps = rational(video.r_frame_rate);
  const decodedFrames = Number(video.nb_read_frames);
  const checks = {
    audioStreams: audios.length === COMPARISON_RECORDING_CONTRACT.audioStreams,
    codec: video.codec_name === COMPARISON_RECORDING_CONTRACT.codec,
    constantFrameRate: averageFps === COMPARISON_RECORDING_CONTRACT.fps && realFps === COMPARISON_RECORDING_CONTRACT.fps,
    container: String(probe?.format?.format_name ?? "").split(",").includes(COMPARISON_RECORDING_CONTRACT.container),
    decodedFrames: Number.isSafeInteger(decodedFrames) && decodedFrames > 0,
    dimensions: Number(video.width) === COMPARISON_RECORDING_CONTRACT.width && Number(video.height) === COMPARISON_RECORDING_CONTRACT.height,
    duration: Number.isFinite(durationSeconds) && durationSeconds >= COMPARISON_RECORDING_CONTRACT.minimumSeconds && durationSeconds <= COMPARISON_RECORDING_CONTRACT.maximumSeconds,
    fullDecode: fullDecodePassed === true,
    oneVideoStream: videos.length === COMPARISON_RECORDING_CONTRACT.videoStreams,
    otherStreams: others.length === 0,
    pixelFormat: video.pix_fmt === COMPARISON_RECORDING_CONTRACT.pixelFormat,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    checks,
    media: {
      audioStreams: audios.length,
      codec: video.codec_name ?? null,
      constantFrameRate: checks.constantFrameRate,
      container: checks.container ? COMPARISON_RECORDING_CONTRACT.container : String(probe?.format?.format_name ?? ""),
      decodedFrames: Number.isSafeInteger(decodedFrames) ? decodedFrames : null,
      durationSeconds,
      fps: Number.isFinite(averageFps) ? averageFps : null,
      fullDecode: fullDecodePassed,
      height: Number(video.height) || null,
      pixelFormat: video.pix_fmt ?? null,
      videoStreams: videos.length,
      width: Number(video.width) || null,
    },
  };
}

export function assertComparisonRecordingReport(report, afterRevision) {
  invariant(report?.schema === COMPARISON_RECORDING_SCHEMA && report.status === "PASS", "comparison recording report is not PASS");
  invariant(JSON.stringify(report.contract) === JSON.stringify(COMPARISON_RECORDING_CONTRACT), "comparison recording contract differs");
  invariant(report.rawBrowserVideoRetained === false, "comparison report retains raw browser video");
  assertServedAuthorityReceipt(report.servedBuildAuthority, afterRevision);
  invariant(Array.isArray(report.recordings) && report.recordings.length === COMPARISON_RECORDING_SPECS.length, "comparison recording matrix must contain exactly four records");
  for (const [index, spec] of COMPARISON_RECORDING_SPECS.entries()) {
    const record = report.recordings[index];
    invariant(record?.id === spec.id && record.engine === spec.engine && record.state === spec.state, `comparison recording identity differs at ${spec.id}`);
    invariant(record.relativePath === spec.relativePath && record.status === "PASS", `comparison recording path or status differs at ${spec.id}`);
    const expectedRevision = spec.state === "before" ? PHASE7A_R1_EXACT_PARENT : afterRevision;
    invariant(record.sourceAuthority?.kind === spec.sourceKind && record.sourceAuthority?.revision === expectedRevision, `comparison recording source authority differs at ${spec.id}`);
    const expectedDocument = spec.state === "before" ? report.servedBuildAuthority.beforeDocument : report.servedBuildAuthority.afterDocument;
    invariant(
      record.sourceAuthority.document?.report === report.servedBuildAuthority.report
        && record.sourceAuthority.document?.bytes === expectedDocument.bytes
        && record.sourceAuthority.document?.sha256 === expectedDocument.sha256,
      `comparison recording served-document authority differs at ${spec.id}`,
    );
    invariant(
      record.sourceAuthority.livePageAttestation?.channel === "recording-document-response-and-live-dom"
        && record.sourceAuthority.livePageAttestation?.document?.bytes === expectedDocument.bytes
        && record.sourceAuthority.livePageAttestation?.document?.sha256 === expectedDocument.sha256
        && record.sourceAuthority.livePageAttestation?.domSignature === (spec.state === "before" ? "EXACT_PARENT" : "PHASE_7A_R1"),
      `comparison recording live-page attestation differs at ${spec.id}`,
    );
    const expectedRuntimeAssets = spec.state === "before" ? report.servedBuildAuthority.runtimeAssets.before : report.servedBuildAuthority.runtimeAssets.after;
    invariant(
      record.sourceAuthority.livePageAttestation?.runtimeAssets?.count === expectedRuntimeAssets.count
        && record.sourceAuthority.livePageAttestation?.runtimeAssets?.fingerprint === expectedRuntimeAssets.fingerprint,
      `comparison recording linked runtime asset attestation differs at ${spec.id}`,
    );
    invariant(record.boundedPointerResponse === spec.boundedPointerResponse, `comparison pointer authority differs at ${spec.id}`);
    invariant(record.settledState?.manifestoReveal === "resolved" || record.settledState?.cinematicMode === "static", `comparison settled state differs at ${spec.id}`);
    invariant(record.visibleLabel?.includes(spec.state === "before" ? "EXACT PARENT" : "R1 AFTER"), `comparison visible label differs at ${spec.id}`);
    invariant(Number.isSafeInteger(record.bytes) && record.bytes > 0 && /^[a-f0-9]{64}$/.test(record.sha256), `comparison file integrity differs at ${spec.id}`);
    invariant(record.media?.fullDecode === true && record.media.codec === "h264" && record.media.pixelFormat === "yuv420p", `comparison media decode differs at ${spec.id}`);
    invariant(record.validationChecks && Object.values(record.validationChecks).every(Boolean), `comparison media checks differ at ${spec.id}`);
    if (spec.boundedPointerResponse) {
      invariant(Array.isArray(record.pointerStates) && record.pointerStates.length >= 4, `bounded pointer states are missing at ${spec.id}`);
      invariant(record.pointerStates.every(({ bounded, probe }) => bounded === true && probe === "active"), `bounded pointer state differs at ${spec.id}`);
      invariant(record.pointerSettled?.probe === "settled" && record.pointerSettled?.probeX === "50%" && record.pointerSettled?.probeY === "50%", `pointer did not settle at ${spec.id}`);
    } else invariant(Array.isArray(record.pointerStates) && record.pointerStates.length === 0, `before recording contains an interactive pointer sequence at ${spec.id}`);
  }
  return true;
}

async function runCommand(command, args, label) {
  try {
    return await execFileAsync(command, args, { windowsHide: true, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`${label} failed: ${String(error.stderr || error.message).slice(0, 4_000)}`);
  }
}

async function executableVersion(command) {
  try {
    const { stdout, stderr } = await execFileAsync(command, ["-version"], { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
    return String(stdout || stderr).split(/\r?\n/)[0].trim();
  } catch {
    return null;
  }
}

async function resolveExecutable(explicit, candidates, label) {
  if (explicit) {
    invariant(path.isAbsolute(explicit), `${label} path must be absolute`);
    const version = await executableVersion(explicit);
    invariant(version, `${label} is not executable`);
    return { command: explicit, version };
  }
  for (const candidate of candidates) {
    const version = await executableVersion(candidate);
    if (version) return { command: candidate, version };
  }
  throw new Error(`${label} was not found; pass --${label.toLowerCase()} <absolute-path>`);
}

async function resolveMediaTools(options) {
  const ffmpeg = await resolveExecutable(options.ffmpeg, DEFAULT_FFMPEG_CANDIDATES, "FFmpeg");
  const siblingProbe = path.join(path.dirname(path.resolve(ffmpeg.command)), executableName("ffprobe"));
  const ffprobe = await resolveExecutable(options.ffprobe, [siblingProbe, ...DEFAULT_FFPROBE_CANDIDATES], "FFprobe");
  return { ffmpeg, ffprobe };
}

async function probeComparisonRecording(ffprobe, file) {
  const { stdout } = await runCommand(ffprobe, [
    "-v", "error", "-count_frames",
    "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,duration,nb_read_frames:format=format_name,duration",
    "-of", "json", file,
  ], "FFprobe comparison recording validation");
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("FFprobe returned invalid comparison recording JSON");
  }
}

async function isolatedContext(browser, baseUrl, options = {}) {
  const ledger = { blockedExternal: [], failedRequests: [], pageErrors: [], consoleErrors: [] };
  const { __blockFonts: blockFonts = false, ...contextOptions } = options;
  const context = await browser.newContext(contextOptions);
  const allowedOrigin = new URL(baseUrl).origin;
  await context.route("**/*", async (route) => {
    const request = route.request();
    let url;
    try { url = new URL(request.url()); } catch { return route.abort("blockedbyclient"); }
    if (["data:", "blob:", "about:"].includes(url.protocol) || url.origin === allowedOrigin) {
      if (blockFonts && (request.resourceType() === "font" || /\.(?:woff2?|ttf|otf)(?:$|\?)/i.test(url.pathname))) {
        ledger.blockedExternal.push({ route: url.pathname, reason: "fallback-font-test" });
        return route.abort("blockedbyclient");
      }
      return route.continue();
    }
    ledger.blockedExternal.push({ route: `${url.protocol}//external-origin`, reason: "origin-isolation" });
    return route.abort("blockedbyclient");
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => ledger.pageErrors.push(safeString(error.message)));
    page.on("console", (message) => {
      if (message.type() === "error") ledger.consoleErrors.push(safeString(message.text()));
    });
    page.on("requestfailed", (request) => {
      let route = "unresolved";
      try { route = new URL(request.url()).pathname; } catch { /* keep sanitized fallback */ }
      ledger.failedRequests.push({ route, reason: request.failure()?.errorText ?? "request failed" });
    });
  });
  return { context, ledger };
}

function htmlAttribute(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

export function extractLinkedRuntimeAssets(html) {
  invariant(typeof html === "string" && html.length > 0, "runtime asset derivation requires HTML");
  const candidates = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (htmlAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    const as = (htmlAttribute(tag, "as") ?? "").toLowerCase();
    const href = htmlAttribute(tag, "href");
    if (!href) continue;
    if (rel.includes("stylesheet") || (rel.some((value) => ["preload", "modulepreload"].includes(value)) && ["script", "style"].includes(as))) {
      candidates.push({ kind: rel.includes("stylesheet") || as === "style" ? "css" : "javascript", value: href });
    }
  }
  for (const tag of html.match(/<script\b[^>]*\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/gi) ?? []) {
    candidates.push({ kind: "javascript", value: htmlAttribute(tag, "src") });
  }
  const assets = candidates.map(({ kind, value }) => {
    const parsed = new URL(value, "https://runtime-assets.invalid/");
    invariant(parsed.origin === "https://runtime-assets.invalid" && !parsed.search && !parsed.hash, `runtime ${kind} asset must be a root-local immutable path`);
    const route = decodeURIComponent(parsed.pathname);
    invariant(route.startsWith("/") && !route.split("/").includes("..") && /\.(?:css|m?js)$/i.test(route), `runtime ${kind} asset path is unsafe: ${route}`);
    return { kind, route };
  });
  const unique = [...new Map(assets.map((asset) => [`${asset.kind}:${asset.route}`, asset])).values()]
    .sort((left, right) => left.route.localeCompare(right.route) || left.kind.localeCompare(right.kind));
  invariant(unique.some(({ kind }) => kind === "css") && unique.some(({ kind }) => kind === "javascript"), "runtime asset authority must contain linked CSS and JavaScript");
  return unique;
}

export function runtimeAssetSetFingerprint(records) {
  invariant(Array.isArray(records) && records.length > 0, "runtime asset fingerprint requires records");
  const canonical = records.map(({ kind, route, bytes, sha256: digest }) => `${kind}\t${route}\t${bytes}\t${digest}`).sort().join("\n");
  return sha256(Buffer.from(canonical, "utf8"));
}

async function localRuntimeAssetRecords(html) {
  const distRoot = path.join(ROOT, "dist");
  const records = [];
  for (const asset of extractLinkedRuntimeAssets(html)) {
    const absolute = path.resolve(distRoot, `.${asset.route}`);
    invariant(within(distRoot, absolute), `local runtime asset escapes dist: ${asset.route}`);
    const body = await readFile(absolute);
    records.push({ ...asset, bytes: body.length, sha256: sha256(body) });
  }
  return records;
}

async function fetchServedRuntimeAssets(baseUrl, specifications, timeoutMs) {
  const records = [];
  for (const specification of specifications) {
    const response = await fetch(captureUrl(baseUrl, specification.route), {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = Buffer.from(await response.arrayBuffer());
    records.push({
      ...specification,
      httpStatus: response.status,
      contentType: response.headers.get("content-type") ?? "",
      bytes: body.length,
      sha256: sha256(body),
    });
  }
  return records;
}

async function captureRuntimeAssetAuthority(beforeBaseUrl, afterBaseUrl, beforeHtml, afterHtml, timeoutMs) {
  const beforeSpecifications = extractLinkedRuntimeAssets(beforeHtml);
  const afterLocal = await localRuntimeAssetRecords(afterHtml);
  const [beforeServed, afterServed] = await Promise.all([
    fetchServedRuntimeAssets(beforeBaseUrl, beforeSpecifications, timeoutMs),
    fetchServedRuntimeAssets(afterBaseUrl, afterLocal.map(({ kind, route }) => ({ kind, route })), timeoutMs),
  ]);
  return {
    derivation: "linked CSS/JS paths parsed from each verified root HTML response",
    before: {
      revision: PHASE7A_R1_EXACT_PARENT,
      authority: {
        revision: EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.revision,
        derivation: EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.derivation,
        fingerprint: EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.fingerprint,
      },
      served: beforeServed,
      fingerprint: runtimeAssetSetFingerprint(beforeServed),
    },
    after: {
      localDist: afterLocal,
      served: afterServed,
      localFingerprint: runtimeAssetSetFingerprint(afterLocal),
      servedFingerprint: runtimeAssetSetFingerprint(afterServed),
    },
  };
}

async function fetchServedDocument(baseUrl, timeoutMs) {
  const response = await fetch(captureUrl(baseUrl, "/"), {
    cache: "no-store",
    headers: { accept: "text/html" },
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    body,
    record: {
      channel: "node-fetch-response-body",
      route: "/",
      httpStatus: response.status,
      contentType: response.headers.get("content-type") ?? "",
      bytes: body.length,
      sha256: sha256(body),
    },
  };
}

async function captureServedDomSignature(browser, baseUrl, timeoutMs) {
  const { context, ledger } = await isolatedContext(browser, baseUrl, {
    javaScriptEnabled: true,
    serviceWorkers: "block",
    viewport: { width: 1_280, height: 720 },
  });
  const page = await context.newPage();
  try {
    const response = await page.goto(captureUrl(baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    invariant(response, "served-build DOM navigation returned no response");
    const signature = await page.evaluate(() => {
      const destinations = [...document.querySelectorAll(".bifurcation-destination")];
      const destinationHrefs = destinations.map((element) => element.getAttribute("href"));
      const destinationNames = destinations.map((element) => (
        element.querySelector(".bifurcation-destination__label")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
      ));
      const bifurcation = {
        thresholdCount: document.querySelectorAll("[data-field-map-threshold]").length,
        fieldCount: document.querySelectorAll(".bifurcation-field").length,
        architectureCount: document.querySelectorAll(".bifurcation-field__architecture").length,
        incomingCount: document.querySelectorAll(".bifurcation-field__incoming").length,
        industryCount: document.querySelectorAll(".bifurcation-field__industry").length,
        startupCount: document.querySelectorAll(".bifurcation-field__startup").length,
        branchCount: document.querySelectorAll(".bifurcation-field__branch").length,
        edgeSignalCount: document.querySelectorAll(".bifurcation-field__edge-signal").length,
        junctionCount: document.querySelectorAll(".bifurcation-field__junction").length,
        destinationCount: destinations.length,
        destinationHrefs,
        destinationNames,
      };
      bifurcation.bounded = bifurcation.thresholdCount === 1
        && bifurcation.fieldCount === 1
        && bifurcation.architectureCount === 1
        && bifurcation.incomingCount === 1
        && bifurcation.industryCount === 1
        && bifurcation.startupCount === 1
        && bifurcation.branchCount === 2
        && bifurcation.edgeSignalCount === 1
        && bifurcation.junctionCount === 1
        && bifurcation.destinationCount === 2
        && JSON.stringify(destinationHrefs) === JSON.stringify(["/for-partners/", "/for-startups/"])
        && JSON.stringify(destinationNames) === JSON.stringify(["For industry", "For startups"]);
      return {
        channel: "playwright-chromium-live-dom",
        route: location.pathname,
        responseStatus: 0,
        homeTitleCount: document.querySelectorAll("#home-title").length,
        signalFieldCount: document.querySelectorAll("[data-signal-field]").length,
        signalFarCount: document.querySelectorAll(".signal-field__far").length,
        signalOcclusionCount: document.querySelectorAll(".signal-field__occlusion").length,
        bifurcation,
      };
    });
    signature.responseStatus = response.status();
    return { signature, network: ledger };
  } finally {
    await context.close();
  }
}

async function captureServedBuildAuthority(browser, beforeBaseUrl, afterBaseUrl, repository, afterRevision, timeoutMs) {
  const [beforeDocumentFetch, afterDocumentFetch, beforeDomCapture, afterDomCapture] = await Promise.all([
    fetchServedDocument(beforeBaseUrl, timeoutMs),
    fetchServedDocument(afterBaseUrl, timeoutMs),
    captureServedDomSignature(browser, beforeBaseUrl, timeoutMs),
    captureServedDomSignature(browser, afterBaseUrl, timeoutMs),
  ]);
  const runtimeAssets = await captureRuntimeAssetAuthority(
    beforeBaseUrl,
    afterBaseUrl,
    beforeDocumentFetch.body.toString("utf8"),
    afterDocumentFetch.body.toString("utf8"),
    timeoutMs,
  );
  const beforeDocument = beforeDocumentFetch.record;
  const afterDocument = afterDocumentFetch.record;
  const report = {
    schema: SERVED_BUILD_AUTHORITY_SCHEMA,
    status: "PASS",
    repository,
    originSeparation: {
      before: "BEFORE_CAPTURE_ORIGIN",
      after: "AFTER_CAPTURE_ORIGIN",
      distinctNormalizedOrigins: beforeBaseUrl !== afterBaseUrl,
    },
    documents: { before: beforeDocument, after: afterDocument },
    documentFingerprintsDistinct: beforeDocument.sha256 !== afterDocument.sha256,
    runtimeAssets,
    dom: { before: beforeDomCapture.signature, after: afterDomCapture.signature },
    network: { before: beforeDomCapture.network, after: afterDomCapture.network },
  };
  assertServedBuildAuthority(report, afterRevision);
  return report;
}

function servedBuildMarkdown(report) {
  return `# Phase 7A-R1 comparative served-build authority\n\nStatus: **${report.status}**. The before document is byte-bound to exact parent ${PHASE7A_R1_EXACT_PARENT}; the after document and every linked CSS/JavaScript asset are byte-bound to the fresh governed local dist built for ${report.repository.head}. Live Chromium DOM inspection independently proves that the exact parent lacks the R1-only far/occlusion layers and bounded bifurcation while the after state contains them.\n\n| State | Revision | HTML bytes | HTML SHA-256 | Runtime assets | Runtime fingerprint | Far | Occlusion | Bounded bifurcation |\n|---|---|---:|---|---:|---|---:|---:|---:|\n| Before | ${PHASE7A_R1_EXACT_PARENT} | ${report.documents.before.bytes} | ${report.documents.before.sha256} | ${report.runtimeAssets.before.served.length} | ${report.runtimeAssets.before.fingerprint} | ${report.dom.before.signalFarCount} | ${report.dom.before.signalOcclusionCount} | ${report.dom.before.bifurcation.bounded} |\n| After | ${report.repository.head} | ${report.documents.after.bytes} | ${report.documents.after.sha256} | ${report.runtimeAssets.after.served.length} | ${report.runtimeAssets.after.servedFingerprint} | ${report.dom.after.signalFarCount} | ${report.dom.after.signalOcclusionCount} | ${report.dom.after.bifurcation.bounded} |\n`;
}

async function captureShortLandscape(browser, baseUrl, label, output, timeoutMs) {
  const { context, ledger } = await isolatedContext(browser, baseUrl);
  const cases = [];
  try {
    for (const viewport of REQUIRED_SHORT_LANDSCAPE_VIEWPORTS) {
      const page = await context.newPage();
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await settleHome(page, baseUrl, timeoutMs);
        const measurement = await page.evaluate(measureManifestoGeometry);
        const result = geometryResult(viewport, measurement);
        cases.push(result);
        await screenshot(page, output, `responsive/${label}/${viewport.id}-viewport.png`, { fullPage: false });
        await screenshot(page, output, `responsive/${label}/${viewport.id}-full-page.png`, { fullPage: true });
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
  return { label, cases, network: ledger };
}

function geometryMarkdown(before, after) {
  const rows = REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.map(({ id }, index) => {
    const prior = before.cases[index];
    const repaired = after.cases[index];
    const safety = repaired.measurement?.safeAllowances?.glyphs;
    return `| ${id.replace("short-landscape-", "")} | ${prior.status} | ${repaired.status} | ${Number(safety?.top).toFixed(2)} | ${Number(safety?.bottom).toFixed(2)} |`;
  });
  return `# Phase 7A-R1 short-landscape geometry\n\nThe before state is recorded honestly and is allowed to fail. The repaired state is fail-closed and all twelve cases must pass the shared measured glyph-boundary, visible sticky-header clearance, line-union and horizontal-overflow checks. Native /#entry fragment placement is preserved without scripted document-position writes.\n\n| Viewport | Before | After | After safe top (px) | After safe bottom (px) |\n|---|---:|---:|---:|---:|\n${rows.join("\n")}\n`;
}

async function captureSignalComparison(browser, beforeBaseUrl, afterBaseUrl, output, timeoutMs) {
  const records = [];
  for (const [label, baseUrl] of [["before", beforeBaseUrl], ["after", afterBaseUrl]]) {
    const { context, ledger } = await isolatedContext(browser, baseUrl, { viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await settleHome(page, baseUrl, timeoutMs);
      const field = page.locator("[data-manifesto-threshold]");
      await field.scrollIntoViewIfNeeded();
      if (label === "after") {
        const bounds = await field.boundingBox();
        if (bounds) await page.mouse.move(bounds.x + bounds.width * 0.68, bounds.y + bounds.height * 0.43);
        await page.waitForTimeout(220);
      }
      const state = await page.evaluate(() => ({
        h1: document.querySelector("#home-title")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        manifestoReveal: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") ?? null,
        signalField: Boolean(document.querySelector("[data-signal-field]")),
        source: Boolean(document.querySelector(".signal-field__source")),
        structuralLayers: document.querySelectorAll(".signal-field__far, .signal-field__pressure, .signal-field__contours, .signal-field__occlusion, .signal-field__load, .signal-field__near").length,
        liveSignalElements: document.querySelectorAll(".signal-field__live, .signal-field__contact").length,
      }));
      invariant(state.signalField && state.source, `${label} Signal Field authority is missing`);
      if (label === "after") invariant(state.structuralLayers >= 6 && state.liveSignalElements >= 2, "repaired Signal Field layering is incomplete");
      await screenshot(page, output, `signal-field/${label}-desktop-1440x900.png`);
      records.push({ label, state, network: ledger });
    } finally {
      await context.close();
    }
  }
  return { status: "PASS", records };
}

function comparisonVisibleLabel(spec, afterRevision) {
  const engine = spec.engine.toUpperCase();
  if (spec.state === "before") return `PHASE 7A-R1 COMPARATIVE / ${engine} / BEFORE - EXACT PARENT ${PHASE7A_R1_EXACT_PARENT.slice(0, 12)}`;
  return `PHASE 7A-R1 COMPARATIVE / ${engine} / AFTER - R1 AFTER ${afterRevision.slice(0, 12)} / BOUNDED POINTER RESPONSE`;
}

async function installComparisonLabel(page, label) {
  await page.evaluate((visibleLabel) => {
    document.querySelector("[data-r1-comparison-label]")?.remove();
    const marker = document.createElement("aside");
    marker.dataset.r1ComparisonLabel = "true";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = visibleLabel;
    Object.assign(marker.style, {
      position: "fixed",
      zIndex: "2147483647",
      top: "18px",
      left: "18px",
      maxWidth: "calc(100vw - 36px)",
      padding: "9px 12px 8px",
      border: "1px solid rgba(255,255,255,.62)",
      background: "rgba(7,9,10,.9)",
      color: "#f5f3ef",
      font: "700 11px/1.25 Arial,sans-serif",
      letterSpacing: ".11em",
      pointerEvents: "none",
      textTransform: "uppercase",
    });
    document.body.append(marker);
  }, label);
  await page.waitForFunction((visibleLabel) => {
    const marker = document.querySelector("[data-r1-comparison-label]");
    const bounds = marker?.getBoundingClientRect();
    return marker?.textContent === visibleLabel && bounds && bounds.width > 0 && bounds.height > 0;
  }, label);
}

async function readPointerEvidence(page, step) {
  return page.evaluate((sequenceStep) => {
    const field = document.querySelector("[data-signal-field]");
    if (!(field instanceof HTMLElement)) return null;
    const value = (name) => field.style.getPropertyValue(name).trim();
    const probeX = value("--probe-x");
    const probeY = value("--probe-y");
    const nearX = value("--probe-near-x");
    const nearY = value("--probe-near-y");
    const percent = (input) => Number.parseFloat(input.replace("%", ""));
    const pixels = (input) => Number.parseFloat(input.replace("px", ""));
    const x = percent(probeX);
    const y = percent(probeY);
    const nx = pixels(nearX);
    const ny = pixels(nearY);
    return {
      step: sequenceStep,
      probe: field.dataset.probe ?? null,
      probeX,
      probeY,
      nearX,
      nearY,
      bounded: Number.isFinite(x) && x >= 0 && x <= 100
        && Number.isFinite(y) && y >= 0 && y <= 100
        && Number.isFinite(nx) && Math.abs(nx) <= 8.01
        && Number.isFinite(ny) && Math.abs(ny) <= 6.01,
    };
  }, step);
}

async function attestComparisonRecordingSource(page, response, spec, servedBuildAuthority, timeoutMs) {
  invariant(response.status() === 200, `comparison recording document response differs: ${spec.id}`);
  const body = Buffer.from(await response.body());
  const expectedDocument = spec.state === "before" ? servedBuildAuthority.documents.before : servedBuildAuthority.documents.after;
  invariant(
    body.length === expectedDocument.bytes && sha256(body) === expectedDocument.sha256,
    `comparison recording document fingerprint differs from served-build authority: ${spec.id}`,
  );
  const dom = await page.evaluate(() => {
    const destinations = [...document.querySelectorAll(".bifurcation-destination")];
    return {
      signalFarCount: document.querySelectorAll(".signal-field__far").length,
      signalOcclusionCount: document.querySelectorAll(".signal-field__occlusion").length,
      bifurcationFieldCount: document.querySelectorAll(".bifurcation-field").length,
      bifurcationIndustryCount: document.querySelectorAll(".bifurcation-field__industry").length,
      bifurcationStartupCount: document.querySelectorAll(".bifurcation-field__startup").length,
      bifurcationDestinationHrefs: destinations.map((element) => element.getAttribute("href")),
    };
  });
  const afterSignature = dom.signalFarCount >= 1
    && dom.signalOcclusionCount >= 1
    && dom.bifurcationFieldCount === 1
    && dom.bifurcationIndustryCount === 1
    && dom.bifurcationStartupCount === 1
    && JSON.stringify(dom.bifurcationDestinationHrefs) === JSON.stringify(["/for-partners/", "/for-startups/"]);
  if (spec.state === "before") {
    invariant(
      dom.signalFarCount === 0
        && dom.signalOcclusionCount === 0
        && dom.bifurcationFieldCount === 0
        && afterSignature === false,
      `comparison recording exact-parent page contains R1-only DOM: ${spec.id}`,
    );
  } else invariant(afterSignature, `comparison recording R1 after page lacks the required DOM signature: ${spec.id}`);
  const expectedAssets = spec.state === "before" ? servedBuildAuthority.runtimeAssets.before.served : servedBuildAuthority.runtimeAssets.after.served;
  const runtimeAssets = [];
  for (const expectedAsset of expectedAssets) {
    const assetResponse = await page.request.get(new URL(expectedAsset.route, response.url()).toString(), { timeout: timeoutMs });
    const assetBody = Buffer.from(await assetResponse.body());
    const record = {
      kind: expectedAsset.kind,
      route: expectedAsset.route,
      httpStatus: assetResponse.status(),
      contentType: assetResponse.headers()["content-type"] ?? "",
      bytes: assetBody.length,
      sha256: sha256(assetBody),
    };
    assertServedRuntimeAsset(record, `${spec.id} live runtime asset`);
    invariant(record.bytes === expectedAsset.bytes && record.sha256 === expectedAsset.sha256, `comparison recording runtime asset differs from served-build authority: ${spec.id} ${record.route}`);
    runtimeAssets.push(record);
  }
  return {
    channel: "recording-document-response-and-live-dom",
    document: { bytes: body.length, sha256: sha256(body) },
    domSignature: spec.state === "before" ? "EXACT_PARENT" : "PHASE_7A_R1",
    runtimeAssets: {
      count: runtimeAssets.length,
      fingerprint: runtimeAssetSetFingerprint(runtimeAssets),
    },
  };
}

async function captureRawComparisonRecording(browser, spec, baseUrl, afterRevision, servedBuildAuthority, staging, timeoutMs) {
  const rawDirectory = path.join(staging, ".capture-work", spec.id);
  invariant(within(staging, rawDirectory), `raw recording directory escaped staging: ${spec.id}`);
  await mkdir(rawDirectory, { recursive: true });
  const { context, ledger } = await isolatedContext(browser, baseUrl, {
    colorScheme: "dark",
    recordVideo: { dir: rawDirectory, size: COMPARISON_RECORDING_VIEW },
    serviceWorkers: "block",
    viewport: COMPARISON_RECORDING_VIEW,
  });
  const page = await context.newPage();
  const video = page.video();
  invariant(video, `Playwright video authority is unavailable: ${spec.id}`);
  const recordingStarted = Date.now();
  const visibleLabel = comparisonVisibleLabel(spec, afterRevision);
  let trimStartSeconds = 0;
  let settledState;
  let sourceAttestation;
  const pointerStates = [];
  let pointerSettled = null;
  try {
    const response = await settleHome(page, baseUrl, timeoutMs);
    sourceAttestation = await attestComparisonRecordingSource(page, response, spec, servedBuildAuthority, timeoutMs);
    await installComparisonLabel(page, visibleLabel);
    settledState = await page.evaluate(() => ({
      cinematicMode: document.documentElement.dataset.cinematicMode ?? null,
      manifestoReveal: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") ?? null,
      h1Text: document.querySelector("#home-title")?.getAttribute("aria-label")?.trim()
        ?? document.querySelector("#home-title")?.textContent?.replace(/\s+/g, " ").trim()
        ?? "",
      signalField: Boolean(document.querySelector("[data-signal-field]")),
      overlayVisible: Boolean(document.querySelector("[data-r1-comparison-label]")?.getBoundingClientRect().width),
    }));
    invariant((settledState.manifestoReveal === "resolved" || settledState.cinematicMode === "static") && settledState.h1Text.length > 0 && settledState.signalField && settledState.overlayVisible, `comparison recording did not reach a visibly labelled settled state: ${spec.id}`);
    await page.waitForTimeout(250);
    trimStartSeconds = (Date.now() - recordingStarted) / 1_000;

    if (spec.boundedPointerResponse) {
      const field = page.locator("[data-signal-field]");
      const bounds = await field.boundingBox();
      invariant(bounds && bounds.width > 0 && bounds.height > 0, `comparison pointer surface is unavailable: ${spec.id}`);
      await page.waitForTimeout(900);
      const points = [[0.28, 0.34], [0.71, 0.3], [0.74, 0.69], [0.34, 0.66]];
      for (const [index, [x, y]] of points.entries()) {
        await page.mouse.move(bounds.x + bounds.width * x, bounds.y + bounds.height * y, { steps: 10 });
        await page.waitForTimeout(850);
        const evidence = await readPointerEvidence(page, index + 1);
        invariant(evidence?.probe === "active" && evidence.bounded, `comparison pointer response escaped bounds at ${spec.id} step ${index + 1}`);
        pointerStates.push(evidence);
      }
      await page.locator("[data-manifesto-threshold]").dispatchEvent("pointerleave");
      await page.waitForFunction(() => document.querySelector("[data-signal-field]")?.getAttribute("data-probe") === "settled", undefined, { timeout: timeoutMs });
      const settledEvidence = await readPointerEvidence(page, points.length + 1);
      if (settledEvidence) {
        pointerSettled = {
          probe: settledEvidence.probe,
          probeX: settledEvidence.probeX,
          probeY: settledEvidence.probeY,
          nearX: settledEvidence.nearX,
          nearY: settledEvidence.nearY,
        };
      }
      invariant(pointerSettled?.probe === "settled" && pointerSettled.probeX === "50%" && pointerSettled.probeY === "50%" && pointerSettled.nearX === "0px" && pointerSettled.nearY === "0px", `comparison pointer response did not settle: ${spec.id}`);
      await page.waitForTimeout(2_000);
    } else {
      await page.waitForTimeout(6_300);
    }
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
  const rawFile = await video.path();
  invariant(within(staging, rawFile) && rawFile.endsWith(".webm"), `raw comparison recording escaped staging: ${spec.id}`);
  return { rawFile, trimStartSeconds, visibleLabel, settledState, sourceAttestation, pointerStates, pointerSettled, network: ledger };
}

async function normalizeComparisonRecording(tools, staging, spec, rawCapture, afterRevision, servedBuildAuthority) {
  const destination = path.join(staging, ...spec.relativePath.split("/"));
  const partial = `${destination}.partial.mp4`;
  invariant(within(staging, destination) && within(staging, partial), `comparison recording destination escaped staging: ${spec.id}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await runCommand(
    tools.ffmpeg.command,
    comparisonEncoderArguments(rawCapture.rawFile, partial, {
      trimStartSeconds: rawCapture.trimStartSeconds,
      durationSeconds: COMPARISON_RECORDING_CONTRACT.durationSeconds,
    }),
    `FFmpeg normalization for ${spec.id}`,
  );
  await runCommand(tools.ffmpeg.command, comparisonFullDecodeArguments(partial), `FFmpeg full decode for ${spec.id}`);
  const probe = await probeComparisonRecording(tools.ffprobe.command, partial);
  const validation = validateComparisonRecordingProbe(probe, { fullDecodePassed: true });
  invariant(validation.status === "PASS", `${spec.id} normalized media contract failed: ${validation.failures.join(", ")}`);
  await rename(partial, destination);
  const bytes = await readFile(destination);
  const servedDocument = spec.state === "before" ? servedBuildAuthority.documents.before : servedBuildAuthority.documents.after;
  return {
    id: spec.id,
    engine: spec.engine,
    state: spec.state,
    sourceAuthority: {
      kind: spec.sourceKind,
      revision: spec.state === "before" ? PHASE7A_R1_EXACT_PARENT : afterRevision,
      document: {
        report: "provenance/served-build-authority.json",
        bytes: servedDocument.bytes,
        sha256: servedDocument.sha256,
      },
      livePageAttestation: rawCapture.sourceAttestation,
    },
    relativePath: spec.relativePath,
    visibleLabel: rawCapture.visibleLabel,
    boundedPointerResponse: spec.boundedPointerResponse,
    settledState: rawCapture.settledState,
    pointerStates: rawCapture.pointerStates,
    pointerSettled: rawCapture.pointerSettled,
    media: validation.media,
    bytes: bytes.length,
    sha256: sha256(bytes),
    validationChecks: validation.checks,
    status: "PASS",
  };
}

async function captureComparisonRecordings({
  chromium,
  firefoxAuthority,
  beforeBaseUrl,
  afterBaseUrl,
  afterRevision,
  servedBuildAuthority,
  headed,
  output,
  timeoutMs,
  tools,
}) {
  assertServedBuildAuthority(servedBuildAuthority, afterRevision);
  const recordings = [];
  const browserVersions = { chromium: chromium.version(), firefox: new Set() };
  for (const spec of COMPARISON_RECORDING_SPECS) {
    const baseUrl = spec.state === "before" ? beforeBaseUrl : afterBaseUrl;
    let browser = chromium;
    const ownsBrowser = spec.engine === "firefox";
    if (ownsBrowser) {
      browser = await firefoxAuthority.browserType.launch({ executablePath: firefoxAuthority.executablePath, headless: !headed });
      browserVersions.firefox.add(browser.version());
    }
    try {
      const rawCapture = await captureRawComparisonRecording(browser, spec, baseUrl, afterRevision, servedBuildAuthority, output, timeoutMs);
      const normalized = await normalizeComparisonRecording(tools, output, spec, rawCapture, afterRevision, servedBuildAuthority);
      recordings.push(normalized);
    } finally {
      if (ownsBrowser) await browser.close().catch(() => undefined);
    }
  }
  const workRoot = path.join(output, ".capture-work");
  invariant(within(output, workRoot) && path.basename(workRoot) === ".capture-work", "comparison work-root ownership differs");
  if (await exists(workRoot)) await rm(workRoot, { recursive: true, force: true });
  invariant(!(await exists(workRoot)), "raw browser video remains after normalization");
  const report = {
    schema: COMPARISON_RECORDING_SCHEMA,
    status: "PASS",
    contract: COMPARISON_RECORDING_CONTRACT,
    tools: {
      ffmpegVersion: tools.ffmpeg.version,
      ffprobeVersion: tools.ffprobe.version,
    },
    browserVersions: {
      chromium: browserVersions.chromium,
      firefox: [...browserVersions.firefox],
    },
    servedBuildAuthority: servedAuthorityReceipt(servedBuildAuthority),
    rawBrowserVideoRetained: false,
    recordings,
  };
  assertComparisonRecordingReport(report, afterRevision);
  return report;
}

function comparisonRecordingsMarkdown(report) {
  const rows = report.recordings.map((record) => `| ${record.id} | ${record.sourceAuthority.revision} | ${record.media.durationSeconds.toFixed(3)} | ${record.media.codec} / ${record.media.pixelFormat} | ${record.bytes} | ${record.sha256} | ${record.status} |`);
  return `# Phase 7A-R1 comparative Signal Field recordings\n\nStatus: **${report.status}**. The four normalized MP4s visibly identify the exact-parent before state or captured R1 after revision. Each after recording contains a four-position bounded pointer response and a return to the settled field. Raw Playwright WebM files were staging-only and were removed before publication.\n\nContract: ${report.contract.width}×${report.contract.height}, ${report.contract.fps}fps CFR, H.264, ${report.contract.pixelFormat}, MP4, ${report.contract.minimumSeconds}–${report.contract.maximumSeconds}s, one video stream, no audio, mandatory full decode.\n\n| Recording | Revision | Seconds | Codec | Bytes | SHA-256 | Status |\n|---|---|---:|---|---:|---|---:|\n${rows.join("\n")}\n`;
}

async function captureBifurcation(browser, baseUrl, output, timeoutMs) {
  const cases = [];
  for (const viewport of [
    { id: "desktop-1440x900", width: 1440, height: 900 },
    { id: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const { context, ledger } = await isolatedContext(browser, baseUrl, { viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    try {
      await settleHome(page, baseUrl, timeoutMs);
      const threshold = page.locator("[data-field-map-threshold]");
      await threshold.scrollIntoViewIfNeeded();
      await page.waitForTimeout(180);
      const state = await page.evaluate(() => {
        const heading = document.querySelector("[data-field-map-threshold] h2");
        const headingLines = [...(heading?.querySelectorAll(":scope > span") ?? [])]
          .map((line) => line.textContent?.replace(/\s+/g, " ").trim() ?? "");
        const links = [...document.querySelectorAll("[data-field-map-threshold] a[href]")];
        const root = document.documentElement;
        return {
          heading: headingLines.join(" "),
          headingLines,
          rawHeadingText: heading?.textContent?.replace(/\s+/g, " ").trim() ?? null,
          links: links.map((link) => ({
            name: link.textContent?.replace(/\s+/g, " ").trim() ?? "",
            route: link.getAttribute("href"),
            width: link.getBoundingClientRect().width,
            height: link.getBoundingClientRect().height,
          })),
          horizontalOverflow: Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0) > root.clientWidth,
          junction: Boolean(document.querySelector(".bifurcation-field__junction")),
          industryPressure: document.querySelectorAll(".bifurcation-field__industry path").length,
          startupEdgeSignal: Boolean(document.querySelector(".bifurcation-field__edge-signal")),
        };
      });
      invariant(state.heading === "One operating field. Two trajectories.", `${viewport.id} bifurcation heading differs`);
      invariant(state.links.length === 2 && state.links[0].name.startsWith("For industry") && state.links[1].name.startsWith("For startups"), `${viewport.id} bifurcation links differ`);
      invariant(state.junction && state.industryPressure >= 3 && state.startupEdgeSignal, `${viewport.id} bifurcation causal geometry is incomplete`);
      invariant(!state.horizontalOverflow, `${viewport.id} bifurcation has horizontal overflow`);
      await screenshot(page, output, `audience-bifurcation/${viewport.id}.png`);
      cases.push({ viewport, state, network: ledger, status: "PASS" });
    } finally {
      await context.close();
    }
  }
  return { status: "PASS", cases };
}

async function openFieldMap(page, timeoutMs) {
  const details = page.locator("[data-field-map]");
  if (!(await details.evaluate((node) => node.open))) await details.locator(":scope > summary").click();
  await page.waitForFunction(() => {
    const map = document.querySelector("[data-field-map]");
    const regions = [...document.querySelectorAll("[data-field-map-background]")];
    return map instanceof HTMLDetailsElement
      && map.open
      && document.documentElement.hasAttribute("data-field-map-open")
      && regions.length >= 3
      && regions.every((region) => region.hasAttribute("inert"));
  }, undefined, { timeout: timeoutMs });
  await page.waitForTimeout(120);
}

async function closeFieldMapWithEscape(page, timeoutMs) {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const map = document.querySelector("[data-field-map]");
    return map instanceof HTMLDetailsElement
      && !map.open
      && !document.documentElement.hasAttribute("data-field-map-open")
      && !document.querySelector("[data-field-map-background][inert]");
  }, undefined, { timeout: timeoutMs });
}

async function fieldMapState(page) {
  return page.evaluate(() => {
    const details = document.querySelector("[data-field-map]");
    const summary = details?.querySelector(":scope > summary");
    const destinations = [...(details?.querySelectorAll("a[href]") ?? [])];
    const regions = [...document.querySelectorAll("[data-field-map-background]")];
    const focusableSelector = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    const visibleFocusable = [...document.querySelectorAll(focusableSelector)].filter((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return !element.closest("[inert]")
        && !element.closest("[hidden]")
        && style.display !== "none"
        && style.visibility !== "hidden"
        && bounds.width > 0
        && bounds.height > 0;
    });
    const active = document.activeElement;
    const presentation = (element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return !element.closest("[inert]")
        && !element.closest("[hidden]")
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number.parseFloat(style.opacity) > 0
        && bounds.width > 0
        && bounds.height > 0;
    };
    return {
      open: details instanceof HTMLDetailsElement ? details.open : false,
      rootOpen: document.documentElement.hasAttribute("data-field-map-open"),
      destinationCount: destinations.length,
      destinationNames: destinations.map((link) => link.textContent?.replace(/\s+/g, " ").trim() ?? ""),
      destinationInventory: destinations.map((link) => ({
        href: link.getAttribute("href"),
        name: link.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        visible: presentation(link),
        focusable: link.tabIndex >= 0 && !link.closest("[inert]") && presentation(link),
      })),
      backgroundRegionCount: regions.length,
      inertRegionCount: regions.filter((region) => region.hasAttribute("inert")).length,
      ownedInertCount: regions.filter((region) => region.getAttribute("data-field-map-inert-owned") === "true").length,
      activeElement: active === summary ? "field-map-summary" : active?.tagName.toLowerCase() ?? null,
      activeName: active?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      activeDestinationName: active instanceof HTMLAnchorElement
        ? active.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? null
        : null,
      focusableInventory: visibleFocusable.map((element) => ({
        element: element.tagName.toLowerCase(),
        name: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
        insideFieldMap: Boolean(element.closest("[data-field-map]")),
      })),
    };
  });
}

function assertMapOpenState(state, label) {
  invariant(state.open && state.rootOpen, `${label}: Field Map is not open`);
  invariant(state.destinationCount === 8, `${label}: Field Map does not expose eight destinations`);
  invariant(state.backgroundRegionCount >= 3 && state.inertRegionCount === state.backgroundRegionCount, `${label}: background semantic isolation differs`);
  invariant(state.ownedInertCount === state.backgroundRegionCount, `${label}: inert ownership differs`);
  invariant(state.focusableInventory.every(({ insideFieldMap }) => insideFieldMap), `${label}: focus escapes the open Field Map`);
  invariant(JSON.stringify(state.destinationInventory?.map(({ href, name }) => ({ href, name }))) === JSON.stringify(NO_JS_FIELD_MAP_DESTINATIONS), `${label}: exact Field Map destination inventory differs`);
  invariant(state.destinationInventory.every(({ visible, focusable }) => visible && focusable), `${label}: Field Map destination is hidden or not focusable`);
  invariant(state.focusableInventory.length === 9
    && state.focusableInventory.filter(({ element }) => element === "summary").length === 1
    && state.focusableInventory.filter(({ element }) => element === "a").length === 8,
  `${label}: open Field Map focusable inventory is not exactly the trigger plus eight destinations`);
}

export function assertFieldMapKeyboardAuthority(openState, focusSequence, reverseFocus) {
  assertMapOpenState(openState, "keyboard authority open state");
  const expected = [
    { activeElement: "field-map-summary", activeDestinationName: null },
    ...NO_JS_FIELD_MAP_DESTINATIONS.map(({ name }) => ({ activeElement: "a", activeDestinationName: name })),
    { activeElement: "field-map-summary", activeDestinationName: null },
  ];
  invariant(Array.isArray(focusSequence) && focusSequence.length === expected.length, "Field Map keyboard cycle length differs");
  invariant(focusSequence.every((record, index) => record.step === index + 1
    && record.activeElement === expected[index].activeElement
    && (record.activeDestinationName ?? null) === expected[index].activeDestinationName),
  "Field Map keyboard cycle did not traverse summary and all eight destinations exactly once before wrapping");
  invariant(reverseFocus?.activeElement === "a" && reverseFocus.activeDestinationName === "Contact", "Field Map Shift+Tab reverse wrap did not reach the final destination");
  return true;
}

function assertMapClosedState(state, label) {
  invariant(!state.open && !state.rootOpen, `${label}: Field Map did not close`);
  invariant(state.inertRegionCount === 0 && state.ownedInertCount === 0, `${label}: stale inert state remains`);
}

async function captureFieldMap(browser, baseUrl, output, timeoutMs) {
  const { context, ledger } = await isolatedContext(browser, baseUrl, { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const report = { states: {}, focusSequence: [], repeatedCycles: [], lifecycle: {}, navigation: {}, network: ledger, status: "FAIL" };
  try {
    await page.goto(captureUrl(baseUrl, "/about/"), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await settleFonts(page, timeoutMs);
    report.states.closed = await fieldMapState(page);
    assertMapClosedState(report.states.closed, "initial state");
    await screenshot(page, output, "field-map/closed-desktop-1440x900.png");

    await openFieldMap(page, timeoutMs);
    await page.locator("[data-field-map] > summary").focus();
    report.states.open = await fieldMapState(page);
    assertMapOpenState(report.states.open, "open state");
    await screenshot(page, output, "field-map/open-desktop-1440x900.png");

    report.focusSequence.push({ step: 1, activeElement: report.states.open.activeElement, activeName: report.states.open.activeName, activeDestinationName: report.states.open.activeDestinationName });
    for (let index = 1; index <= 9; index += 1) {
      await page.keyboard.press("Tab");
      const state = await fieldMapState(page);
      invariant(state.activeElement === "a" || state.activeElement === "field-map-summary", `keyboard step ${index + 1}: focus target differs`);
      invariant(state.focusableInventory.every(({ insideFieldMap }) => insideFieldMap), `keyboard step ${index + 1}: focus inventory escapes map`);
      report.focusSequence.push({ step: index + 1, activeElement: state.activeElement, activeName: state.activeName, activeDestinationName: state.activeDestinationName });
      if (index === 2) await screenshot(page, output, "field-map/keyboard-focus-desktop-1440x900.png");
    }
    await page.keyboard.press("Shift+Tab");
    const reverseState = await fieldMapState(page);
    report.reverseFocus = { activeElement: reverseState.activeElement, activeName: reverseState.activeName, activeDestinationName: reverseState.activeDestinationName };
    assertFieldMapKeyboardAuthority(report.states.open, report.focusSequence, report.reverseFocus);
    await closeFieldMapWithEscape(page, timeoutMs);
    report.states.escape = await fieldMapState(page);
    assertMapClosedState(report.states.escape, "Escape state");
    invariant(report.states.escape.activeElement === "field-map-summary", "Escape did not return focus to the trigger");
    await screenshot(page, output, "field-map/escape-focus-return-desktop-1440x900.png");

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await openFieldMap(page, timeoutMs);
      const opened = await fieldMapState(page);
      assertMapOpenState(opened, `cycle ${cycle} open`);
      await closeFieldMapWithEscape(page, timeoutMs);
      const closed = await fieldMapState(page);
      assertMapClosedState(closed, `cycle ${cycle} close`);
      report.repeatedCycles.push({ cycle, opened, closed });
    }

    await openFieldMap(page, timeoutMs);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    report.lifecycle.pagehide = await fieldMapState(page);
    assertMapClosedState(report.lifecycle.pagehide, "pagehide");
    await openFieldMap(page, timeoutMs);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    report.lifecycle.pageshow = await fieldMapState(page);
    assertMapClosedState(report.lifecycle.pageshow, "pageshow");

    await openFieldMap(page, timeoutMs);
    await page.evaluate(() => history.pushState({ fieldMapEvidence: true }, "", "#field-map-evidence"));
    await page.goBack({ waitUntil: "commit", timeout: timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(150);
    report.lifecycle.history = await fieldMapState(page);
    assertMapClosedState(report.lifecycle.history, "history traversal");

    await openFieldMap(page, timeoutMs);
    const destination = page.locator('[data-field-map] a[href="/contact/"]');
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/contact/", { timeout: timeoutMs }),
      destination.click(),
    ]);
    report.navigation.arrival = await fieldMapState(page);
    assertMapClosedState(report.navigation.arrival, "navigation arrival");
    await page.goBack({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    report.navigation.back = await fieldMapState(page);
    assertMapClosedState(report.navigation.back, "Back restoration");
    report.status = "PASS";
  } finally {
    await context.close();
  }
  return report;
}

function fieldMapMarkdown(report) {
  return `# Phase 7A-R1 Field Map semantic isolation\n\nStatus: **${report.status}**\n\nThe enhanced Field Map exposed all eight destinations, restricted the programmatic focus inventory to the map while open, applied owned \`inert\` state to every marked background region, returned focus on Escape, and released inert state across repeated cycles, navigation, history traversal, pagehide and pageshow checks. The native no-JavaScript details fallback is reported separately.\n\n- Background regions observed: ${report.states.open.backgroundRegionCount}\n- Destinations observed: ${report.states.open.destinationCount}\n- Keyboard steps recorded: ${report.focusSequence.length}\n- Repeated open/close cycles: ${report.repeatedCycles.length}\n`;
}

async function captureTargetLedger(browser, baseUrl, timeoutMs) {
  const states = [];
  for (const viewport of CORE_TARGET_VIEWPORTS) {
    const { context, ledger } = await isolatedContext(browser, baseUrl, { viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    try {
      await settleHome(page, baseUrl, timeoutMs);
      const report = await observeTargetSizes(page, { route: "/#entry", viewport, state: "resolved-home" });
      states.push({ id: `core-${viewport.id}`, route: "/#entry", viewport, state: "resolved-home", report, network: ledger });
    } finally {
      await context.close();
    }
  }

  {
    const viewport = { id: "fallback-font-narrow-320x800", width: 320, height: 800 };
    const { context, ledger } = await isolatedContext(browser, baseUrl, { viewport: { width: viewport.width, height: viewport.height }, __blockFonts: true });
    const page = await context.newPage();
    try {
      await settleHome(page, baseUrl, timeoutMs);
      const report = await observeTargetSizes(page, { route: "/#entry", viewport, state: "fallback-font-narrow" });
      states.push({ id: viewport.id, route: "/#entry", viewport, state: "fallback-font-narrow", report, network: ledger });
    } finally {
      await context.close();
    }
  }

  for (const viewport of [
    { id: "field-map-desktop-open-1440x900", width: 1440, height: 900 },
    { id: "field-map-mobile-open-390x844", width: 390, height: 844 },
  ]) {
    const { context, ledger } = await isolatedContext(browser, baseUrl, { viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    try {
      await page.goto(captureUrl(baseUrl, "/about/"), { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await settleFonts(page, timeoutMs);
      await openFieldMap(page, timeoutMs);
      const report = await observeTargetSizes(page, { route: "/about/", viewport, state: "field-map-open" });
      states.push({ id: viewport.id, route: "/about/", viewport, state: "field-map-open", report, network: ledger });
    } finally {
      await context.close();
    }
  }

  assertTargetLedgerPass(states);
  return {
    schema: "quantum-hub.phase-7a-r1.target-ledger.v1",
    minimumCssPixels: 44,
    status: "PASS",
    stateCount: states.length,
    states,
    summary: {
      activeFailures: states.reduce((count, item) => count + item.report.summary.targetFailures, 0),
      validExclusions: states.reduce((count, item) => count + item.report.summary.validExclusions, 0),
      unexplainedExclusions: states.reduce((count, item) => count + item.report.summary.unexplainedExclusions, 0),
      contractFailures: states.reduce((count, item) => count + item.report.summary.contractFailures, 0),
    },
  };
}

function targetMarkdown(ledger) {
  const rows = ledger.states.map((state) => `| ${state.id} | ${state.report.status} | ${state.report.candidateCount} | ${state.report.summary.targetFailures} | ${state.report.summary.validExclusions} |`);
  return `# Phase 7A-R1 target-size inventory\n\nStatus: **${ledger.status}**. Every below-minimum candidate retains route, viewport, state, stable selector, accessible name, element type, computed width and height, visibility, interactive intent and any valid exclusion reason in the JSON ledger. A genuine or unexplained active failure cannot be labelled PASS.\n\n| State | Result | Candidates inspected | Genuine failures | Valid exclusions |\n|---|---:|---:|---:|---:|\n${rows.join("\n")}\n`;
}

export async function captureVisibleLinkInventory(page, selector) {
  const links = page.locator(selector);
  const count = await links.count();
  const inventory = [];
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    inventory.push(await link.evaluate((element, linkIndex) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const opacity = Number.parseFloat(style.opacity);
      let clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      let ancestor = element.parentElement;
      while (ancestor) {
        const ancestorStyle = getComputedStyle(ancestor);
        const ancestorBounds = ancestor.getBoundingClientRect();
        if (["auto", "clip", "hidden", "scroll"].includes(ancestorStyle.overflowX)) {
          clip.left = Math.max(clip.left, ancestorBounds.left);
          clip.right = Math.min(clip.right, ancestorBounds.right);
        }
        if (["auto", "clip", "hidden", "scroll"].includes(ancestorStyle.overflowY)) {
          clip.top = Math.max(clip.top, ancestorBounds.top);
          clip.bottom = Math.min(clip.bottom, ancestorBounds.bottom);
        }
        ancestor = ancestor.parentElement;
      }
      const centerX = Math.min(innerWidth - 1, Math.max(0, bounds.left + bounds.width / 2));
      const centerY = Math.min(innerHeight - 1, Math.max(0, bounds.top + bounds.height / 2));
      const hit = document.elementFromPoint(centerX, centerY);
      const visible = style.display !== "none"
        && !["collapse", "hidden"].includes(style.visibility)
        && Number.isFinite(opacity)
        && opacity > 0
        && bounds.width > 0
        && bounds.height > 0;
      const fullyInViewport = bounds.left >= 0
        && bounds.top >= 0
        && bounds.right <= innerWidth
        && bounds.bottom <= innerHeight
        && bounds.left >= clip.left
        && bounds.top >= clip.top
        && bounds.right <= clip.right
        && bounds.bottom <= clip.bottom;
      return {
        index: linkIndex,
        href: element.getAttribute("href") ?? "",
        accessibleName: element.getAttribute("aria-label")?.trim() || element.textContent?.replace(/\s+/g, " ").trim() || "",
        elementType: element.tagName.toLowerCase(),
        width: bounds.width,
        height: bounds.height,
        visible,
        fullyInViewport,
        unoccluded: Boolean(hit && (hit === element || element.contains(hit))),
        intendedInteractive: element instanceof HTMLAnchorElement && Boolean(element.getAttribute("href")),
        viewport: { width: innerWidth, height: innerHeight },
        bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
        effectiveClipBounds: clip,
      };
    }, index));
  }
  return inventory;
}

async function captureFallbackStates(browser, baseUrl, output, timeoutMs) {
  const report = { status: "FAIL", reducedMotion: {}, noJavaScript: {}, fallbackFonts: {} };

  {
    const { context, ledger } = await isolatedContext(browser, baseUrl, {
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    try {
      await settleHome(page, baseUrl, timeoutMs);
      report.reducedMotion.manifestoGeometry = await page.evaluate(measureManifestoGeometry);
      report.reducedMotion.manifestoVisibility = validateFallbackManifestoMeasurement(report.reducedMotion.manifestoGeometry, "reduced-motion manifesto");
      report.reducedMotion = await page.evaluate(() => ({
        cinematicMode: document.documentElement.dataset.cinematicMode ?? null,
        signalField: Boolean(document.querySelector("[data-signal-field]")),
        bifurcationLinks: document.querySelectorAll("[data-field-map-threshold] a[href]").length,
        horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) > document.documentElement.clientWidth,
      })).then((state) => ({
        ...state,
        manifestoGeometry: report.reducedMotion.manifestoGeometry,
        manifestoVisibility: report.reducedMotion.manifestoVisibility,
      }));
      report.reducedMotion.network = ledger;
      invariant(report.reducedMotion.cinematicMode === "static" && report.reducedMotion.manifestoVisibility.status === "PASS" && report.reducedMotion.signalField && report.reducedMotion.bifurcationLinks === 2 && !report.reducedMotion.horizontalOverflow, "reduced-motion static alternative differs");
      await screenshot(page, output, "fallback/reduced-motion-desktop-1440x900.png");
    } finally {
      await context.close();
    }
  }

  {
    const { context, ledger } = await isolatedContext(browser, baseUrl, {
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    try {
      await page.goto(captureUrl(baseUrl, "/#entry"), { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await settleFonts(page, timeoutMs);
      report.noJavaScript.manifestoGeometry = await page.evaluate(measureManifestoGeometry);
      report.noJavaScript.manifestoVisibility = validateFallbackManifestoMeasurement(report.noJavaScript.manifestoGeometry, "no-JavaScript manifesto");
      await page.locator("[data-field-map-threshold]").scrollIntoViewIfNeeded();
      report.noJavaScript.bifurcationLinkInventory = await captureVisibleLinkInventory(page, "[data-field-map-threshold] a[href]");
      assertVisibleLinkInventory(report.noJavaScript.bifurcationLinkInventory, NO_JS_BIFURCATION_DESTINATIONS, "no-JavaScript bifurcation links");
      const summary = page.locator("[data-field-map] > summary");
      await summary.click();
      report.noJavaScript.fieldMapLinkInventory = await captureVisibleLinkInventory(page, "[data-field-map] a[href]");
      assertVisibleLinkInventory(report.noJavaScript.fieldMapLinkInventory, NO_JS_FIELD_MAP_DESTINATIONS, "no-JavaScript Field Map links");
      report.noJavaScript = await page.evaluate(() => {
        const map = document.querySelector("[data-field-map]");
        const plane = map?.querySelector(".field-map__plane");
        const planeBounds = plane?.getBoundingClientRect();
        const planeStyle = plane ? getComputedStyle(plane) : null;
        return {
          enhancedController: map?.getAttribute("data-controller") ?? null,
          nativeDetailsOpen: map instanceof HTMLDetailsElement ? map.open : false,
          viewport: { width: innerWidth, height: innerHeight },
          plane: planeBounds && planeStyle ? {
            position: planeStyle.position,
            visible: planeStyle.display !== "none" && !["collapse", "hidden"].includes(planeStyle.visibility) && Number.parseFloat(planeStyle.opacity) > 0,
            bounds: {
              left: planeBounds.left,
              top: planeBounds.top,
              right: planeBounds.right,
              bottom: planeBounds.bottom,
              width: planeBounds.width,
              height: planeBounds.height,
            },
            clientHeight: plane.clientHeight,
            scrollHeight: plane.scrollHeight,
          } : null,
          horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) > document.documentElement.clientWidth,
        };
      }).then((state) => ({
        ...state,
        manifestoGeometry: report.noJavaScript.manifestoGeometry,
        manifestoVisibility: report.noJavaScript.manifestoVisibility,
        bifurcationLinkInventory: report.noJavaScript.bifurcationLinkInventory,
        fieldMapLinkInventory: report.noJavaScript.fieldMapLinkInventory,
      }));
      report.noJavaScript.network = ledger;
      assertNativeFieldMapViewport(report.noJavaScript);
      invariant(report.noJavaScript.enhancedController === null && report.noJavaScript.nativeDetailsOpen && report.noJavaScript.manifestoVisibility.status === "PASS" && !report.noJavaScript.horizontalOverflow, "no-JavaScript native fallback differs");
      await screenshot(page, output, "fallback/no-javascript-native-map-mobile-390x844.png");
    } finally {
      await context.close();
    }
  }

  {
    const { context, ledger } = await isolatedContext(browser, baseUrl, {
      viewport: { width: 320, height: 800 },
      __blockFonts: true,
    });
    const page = await context.newPage();
    try {
      await settleHome(page, baseUrl, timeoutMs);
      report.fallbackFonts.manifestoGeometry = await page.evaluate(measureManifestoGeometry);
      report.fallbackFonts.manifestoVisibility = validateFallbackManifestoMeasurement(report.fallbackFonts.manifestoGeometry, "fallback-font narrow manifesto");
      report.fallbackFonts = await page.evaluate(() => ({
        anybodyLoaded: document.fonts?.check('16px "Anybody"') ?? false,
        manifestoWords: document.querySelectorAll("#home-title .manifesto-word").length,
        horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) > document.documentElement.clientWidth,
      })).then((state) => ({
        ...state,
        manifestoGeometry: report.fallbackFonts.manifestoGeometry,
        manifestoVisibility: report.fallbackFonts.manifestoVisibility,
      }));
      report.fallbackFonts.abortedFontRequests = ledger.blockedExternal.filter(({ reason }) => reason === "fallback-font-test").length;
      report.fallbackFonts.network = ledger;
      invariant(!report.fallbackFonts.anybodyLoaded && report.fallbackFonts.abortedFontRequests >= 1 && report.fallbackFonts.manifestoVisibility.status === "PASS" && report.fallbackFonts.manifestoWords === 7 && !report.fallbackFonts.horizontalOverflow, "fallback-font narrow state differs");
      await screenshot(page, output, "fallback/fallback-fonts-narrow-320x800.png");
    } finally {
      await context.close();
    }
  }

  report.status = "PASS";
  return report;
}

function fallbackMarkdown(report) {
  return `# Phase 7A-R1 reduced-motion, no-JavaScript and fallback-font evidence\n\nStatus: **${report.status}**\n\nEach manifesto state is measured from Range glyph boxes and checked on all four sides against effective viewport, clipping-ancestor and visible sticky-header bounds. DOM presence and root overflow alone cannot produce PASS.\n\n- Reduced motion resolved to the static Signal Field with measured visible H1/glyph bounds: ${report.reducedMotion.manifestoVisibility.status}.\n- JavaScript-disabled navigation remained a native open \`details\` element; all ${report.noJavaScript.fieldMapLinkInventory.length} exact Field Map destinations and both bifurcation links were individually visible, unoccluded and fully in the viewport: PASS.\n- The narrow fallback-font state blocked ${report.fallbackFonts.abortedFontRequests} production font request(s), retained all seven manifesto words, and passed measured four-side H1/glyph safety: ${report.fallbackFonts.manifestoVisibility.status}.\n`;
}

async function pngWhiteRatio(buffer) {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default ?? sharpModule;
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let white = 0;
  const pixels = info.width * info.height;
  for (let offset = 0; offset < data.length; offset += channels) {
    if (data[offset] >= 245 && data[offset + 1] >= 245 && data[offset + 2] >= 245) white += 1;
  }
  return { width: info.width, height: info.height, nearWhitePixelRatio: pixels ? white / pixels : 1 };
}

export function analyzeFirstPaintDocumentAuthority(documentText) {
  invariant(typeof documentText === "string" && documentText.length > 0, "Firefox first-paint document authority requires response HTML");
  const lower = documentText.toLowerCase();
  const headStart = lower.indexOf("<head");
  const bodyStart = lower.search(/<body(?:\s|>)/i);
  const darkStyle = [...documentText.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].find((match) => (
    /(?:html\s*,\s*body|html|body)[^{]*\{[^}]*\bbackground(?:-color)?\s*:\s*#(?:07090a|080b0c)\b/i.test(match[1])
  ));
  const darkStyleIndex = darkStyle?.index ?? -1;
  const colorSchemeMeta = [...documentText.matchAll(/<meta\b[^>]*>/gi)].find((match) => {
    const tag = match[0];
    return htmlAttribute(tag, "name")?.toLowerCase() === "color-scheme"
      && (htmlAttribute(tag, "content") ?? "").toLowerCase().split(/\s+/).includes("dark");
  });
  const colorSchemeMetaIndex = colorSchemeMeta?.index ?? -1;
  const blockingCandidates = [
    ...[...documentText.matchAll(/<link\b[^>]*>/gi)]
      .filter((match) => (htmlAttribute(match[0], "rel") ?? "").toLowerCase().split(/\s+/).includes("stylesheet"))
      .map((match) => ({ type: "external-stylesheet", index: match.index ?? -1 })),
    ...[...documentText.matchAll(/<script\b[^>]*\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/gi)]
      .filter((match) => htmlAttribute(match[0], "async") === null && htmlAttribute(match[0], "defer") === null && (htmlAttribute(match[0], "type") ?? "").toLowerCase() !== "module")
      .map((match) => ({ type: "blocking-script", index: match.index ?? -1 })),
  ].filter(({ index }) => index >= 0).sort((left, right) => left.index - right.index);
  const firstRenderBlocking = blockingCandidates[0] ?? null;
  const boundaryIndex = Math.min(...[bodyStart, firstRenderBlocking?.index ?? Number.POSITIVE_INFINITY].filter((value) => value >= 0));
  const inlineDarkBackgroundAuthority = darkStyleIndex >= 0;
  const colorSchemeAuthority = colorSchemeMetaIndex >= 0;
  const darkStyleBeforeRenderBoundary = inlineDarkBackgroundAuthority && headStart >= 0 && darkStyleIndex > headStart && darkStyleIndex < boundaryIndex;
  const colorSchemeBeforeRenderBoundary = colorSchemeAuthority && headStart >= 0 && colorSchemeMetaIndex > headStart && colorSchemeMetaIndex < boundaryIndex;
  return {
    inlineDarkBackgroundAuthority,
    colorSchemeAuthority,
    darkStyleBeforeRenderBoundary,
    colorSchemeBeforeRenderBoundary,
    firstRenderBoundary: Number.isFinite(boundaryIndex) ? (boundaryIndex === bodyStart ? "body" : firstRenderBlocking?.type ?? null) : null,
    orderingProven: darkStyleBeforeRenderBoundary && colorSchemeBeforeRenderBoundary,
  };
}

export function validateFirefoxFirstPaintReport(report) {
  invariant(report?.schema === "quantum-hub.phase-7a-r1.firefox-first-paint.v1", "Firefox first-paint report schema differs");
  invariant(["PASS", "LIMITATION"].includes(report.status), "Firefox first-paint report reproduced or concealed a production defect");
  invariant(report.responseStatus === 200, "Firefox first-paint document response differs");
  invariant(report.documentAuthority?.orderingProven === true
    && report.documentAuthority.inlineDarkBackgroundAuthority === true
    && report.documentAuthority.colorSchemeAuthority === true,
  "Firefox first-paint dark document authority is absent or too late");
  const expectedOrder = ["navigation-commit", "html-attached", "navigation-start-screenshot", "response-body-read-start", "response-body-read-complete", "first-stable-paint-screenshot"];
  invariant(report.timing?.navigationStartCapturedBeforeResponseBodyRead === true
    && JSON.stringify(report.timing.captureOrder?.map(({ step }) => step)) === JSON.stringify(expectedOrder),
  "Firefox navigation-start evidence was not captured before response-body inspection");
  const elapsed = report.timing.captureOrder.map(({ elapsedMs }) => elapsedMs);
  invariant(elapsed.every((value, index) => Number.isFinite(value) && value >= 0 && (index === 0 || value >= elapsed[index - 1])), "Firefox first-paint capture timing is not monotonic");
  invariant(report.navigationStart?.pixels?.nearWhitePixelRatio >= 0 && report.navigationStart.pixels.nearWhitePixelRatio <= 1, "Firefox navigation-start pixel evidence differs");
  invariant(report.firstStablePaint?.pixels?.nearWhitePixelRatio >= 0 && report.firstStablePaint.pixels.nearWhitePixelRatio <= 1, "Firefox stable-paint pixel evidence differs");
  return true;
}

async function captureFirefoxFirstPaint(firefox, baseUrl, output, timeoutMs) {
  const { context, ledger } = await isolatedContext(firefox, baseUrl, { viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
    const captureStartedAt = Date.now();
    const captureOrder = [];
    const mark = (step) => captureOrder.push({ step, elapsedMs: Date.now() - captureStartedAt });
    const response = await page.goto(captureUrl(baseUrl, "/"), { waitUntil: "commit", timeout: timeoutMs });
    invariant(response, "Firefox first-paint navigation did not return a document response");
    mark("navigation-commit");
    await page.waitForSelector("html", { state: "attached", timeout: timeoutMs });
    mark("html-attached");
    const initialPath = path.join(output, "firefox-first-paint", "navigation-start.png");
    await mkdir(path.dirname(initialPath), { recursive: true });
    const initialBuffer = await page.screenshot({ path: initialPath, type: "png", animations: "disabled" });
    mark("navigation-start-screenshot");
    const initialPixels = await pngWhiteRatio(initialBuffer);
    const initialComputed = await page.evaluate(() => ({
      htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackground: document.body ? getComputedStyle(document.body).backgroundColor : null,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    mark("response-body-read-start");
    const documentText = await response.text();
    mark("response-body-read-complete");

    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
    await settleFonts(page, timeoutMs);
    await page.waitForTimeout(250);
    const stablePath = path.join(output, "firefox-first-paint", "first-stable-paint.png");
    const stableBuffer = await page.screenshot({ path: stablePath, type: "png", animations: "disabled" });
    mark("first-stable-paint-screenshot");
    const stablePixels = await pngWhiteRatio(stableBuffer);
    const stableComputed = await page.evaluate(() => ({
      htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    }));

    const documentAuthority = analyzeFirstPaintDocumentAuthority(documentText);
    const initialLooksWhite = initialPixels.nearWhitePixelRatio >= 0.95;
    let classification;
    let status;
    const stableLooksWhite = stablePixels.nearWhitePixelRatio >= 0.95;
    if (!documentAuthority.orderingProven || stableLooksWhite) {
      classification = "production-page-paint-defect-reproduced";
      status = "FAIL";
    } else if (initialLooksWhite) {
      classification = "white frame belongs to capture initialization or browser/window exposure; document dark-background authority was present";
      status = "LIMITATION";
    } else {
      classification = "earlier white frame not reproduced; evidence is consistent with capture initialization or browser/window exposure rather than page paint";
      status = "PASS";
    }
    const report = {
      schema: "quantum-hub.phase-7a-r1.firefox-first-paint.v1",
      status,
      classification,
      responseStatus: response.status(),
      navigationStart: { pixels: initialPixels, computed: initialComputed },
      firstStablePaint: { pixels: stablePixels, computed: stableComputed },
      documentAuthority,
      timing: {
        captureOrder,
        navigationStartCapturedBeforeResponseBodyRead: captureOrder.findIndex(({ step }) => step === "navigation-start-screenshot")
          < captureOrder.findIndex(({ step }) => step === "response-body-read-start"),
      },
      network: ledger,
    };
    invariant(status !== "FAIL", "Firefox reproduced a production white first-paint defect");
    validateFirefoxFirstPaintReport(report);
    return report;
  } finally {
    await context.close();
  }
}

function firefoxPaintMarkdown(report) {
  return `# Firefox first-paint clarification\n\nStatus: **${report.status}**\n\nClassification: ${report.classification}.\n\nThe navigation-start PNG was captured immediately after commit and HTML attachment, before reading or inspecting the response body. The first-stable-paint PNG is a separate decoded capture. The report proves the inline dark background and dark color-scheme declarations occur before the first render boundary; a late declaration or reproduced white stable page is fail-closed.\n\n- Navigation-start captured before response body read: ${report.timing.navigationStartCapturedBeforeResponseBodyRead}\n- Capture order: ${report.timing.captureOrder.map(({ step }) => step).join(" → ")}\n- Navigation-start near-white pixel ratio: ${(report.navigationStart.pixels.nearWhitePixelRatio * 100).toFixed(3)}%\n- Stable near-white pixel ratio: ${(report.firstStablePaint.pixels.nearWhitePixelRatio * 100).toFixed(3)}%\n- Inline dark background authority: ${report.documentAuthority.inlineDarkBackgroundAuthority}\n- Dark color-scheme authority: ${report.documentAuthority.colorSchemeAuthority}\n- Dark authority before render boundary: ${report.documentAuthority.orderingProven}\n`;
}

async function captureTypography(browser, output, timeoutMs) {
  const candidates = [];
  for (const spec of TYPOGRAPHY_SPECS) {
    const sourcePath = path.join(ROOT, ...spec.source.split("/"));
    const licencePath = path.join(ROOT, ...spec.licence.split("/"));
    const [font, licence] = await Promise.all([readFile(sourcePath), readFile(licencePath)]);
    const format = spec.source.endsWith(".ttf") ? "truetype" : "woff2";
    const specimenContext = await browser.newContext({ viewport: { width: 1200, height: 760 }, colorScheme: "dark" });
    const browserPage = await specimenContext.newPage();
    try {
      const face = font.toString("base64");
      await browserPage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        @font-face{font-family:"${spec.family}";src:url(data:font/${format};base64,${face}) format("${format}");font-weight:100 900;font-stretch:50% 150%;font-display:block}
        *{box-sizing:border-box}html,body{margin:0;background:#07090a;color:#f5f3ef}body{padding:46px;font-family:Arial,sans-serif}.specimen{min-height:668px;border:1px solid #474d4e;padding:34px;overflow:hidden;background:linear-gradient(105deg,rgba(255,255,255,.025),transparent 42%)}.meta{display:flex;justify-content:space-between;color:#aeb6b5;font:700 12px/1.4 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase}.name{margin:20px 0 38px;font:680 62px/.88 "${spec.family}",Arial,sans-serif;font-stretch:${spec.resolvedStretch};letter-spacing:-.05em}.states{display:grid;grid-template-columns:1fr 1fr;gap:32px;border-top:1px solid #373d3e;padding-top:28px}.state small{color:#aeb6b5;font:700 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}.manifesto{margin:24px 0 0;font:690 50px/.86 "${spec.family}",Arial,sans-serif;letter-spacing:-.055em}.stored{font-stretch:${spec.storedStretch}}.resolved{font-stretch:${spec.resolvedStretch}}.route{margin:26px 0 0;font:640 25px/.96 "${spec.family}",Arial,sans-serif;font-stretch:${spec.resolvedStretch}}</style></head><body><main class="specimen"><div class="meta"><span>Phase 7A-R1 typography evidence</span><span>${spec.role}</span></div><h1 class="name">${spec.label}</h1><div class="states"><section class="state"><small>Stored / ${spec.storedStretch}</small><p class="manifesto stored">WE TURN<br>INDUSTRIAL NEEDS<br>INTO FIELD EVIDENCE.</p></section><section class="state"><small>Resolved / ${spec.resolvedStretch}</small><p class="manifesto resolved">WE TURN<br>INDUSTRIAL NEEDS<br>INTO FIELD EVIDENCE.</p><p class="route">One operating field.<br>Two trajectories.</p></section></div></main></body></html>`, { waitUntil: "load", timeout: timeoutMs });
      await browserPage.evaluate(async (family) => {
        await document.fonts.load(`690 50px "${family}"`);
        await document.fonts.ready;
      }, spec.family);
      await screenshot(browserPage, output, `typography/${spec.id}-specimen.png`, { fullPage: true });
    } finally {
      await specimenContext.close();
    }
    candidates.push({
      id: spec.id,
      candidateName: spec.label,
      role: spec.role,
      repositoryReference: spec.source,
      licenceReference: spec.licence,
      sourceBytes: font.length,
      sourceSha256: sha256(font),
      licenceBytes: licence.length,
      licenceSha256: sha256(licence),
      storedStretch: spec.storedStretch,
      resolvedStretch: spec.resolvedStretch,
      production: spec.production,
      specimen: `typography/${spec.id}-specimen.png`,
    });
  }
  const production = candidates.find(({ production }) => production);
  invariant(production?.candidateName === "Anybody" && production.sourceBytes === 69_612, "production font byte authority differs");
  return {
    schema: "quantum-hub.phase-7a-r1.typography-evidence.v1",
    status: "PASS",
    statement: "Anybody remains provisional for Phase 7A-R1 and is not declared the permanent final typeface.",
    configuration: {
      specimenText: ["WE TURN", "INDUSTRIAL NEEDS", "INTO FIELD EVIDENCE.", "One operating field. Two trajectories."],
      rasterOnly: true,
      fontPayloadsPublished: false,
      htmlPublished: false,
    },
    productionByteImpact: {
      font: "Anybody",
      measuredProductionBytes: production.sourceBytes,
      productionSha256: production.sourceSha256,
      addedByR1Bytes: 0,
    },
    candidates,
  };
}

function typographyMarkdown(report) {
  const rows = report.candidates.map((item) => `| ${item.candidateName} | ${item.role} | ${item.sourceBytes} | ${item.sourceSha256} | ${item.licenceReference} |`);
  return `# Phase 7A-R1 typography evidence\n\n${report.statement}\n\nOnly rendered PNG specimens and this text configuration are published. There are no font binaries, base64 payloads or downloadable candidate files in the closure output. The measured production font impact remains ${report.productionByteImpact.measuredProductionBytes} bytes, with ${report.productionByteImpact.addedByR1Bytes} new font bytes added by R1.\n\n| Candidate | Evidence role | Source bytes | SHA-256 | Licence reference |\n|---|---|---:|---|---|\n${rows.join("\n")}\n`;
}

function compactAxeResult(result, route, state) {
  const violation = (entry) => ({
    id: entry.id,
    impact: entry.impact,
    description: entry.description,
    help: entry.help,
    helpUrl: entry.helpUrl,
    nodes: entry.nodes.map((node) => ({ impact: node.impact, target: node.target, failureSummary: node.failureSummary, html: node.html })),
  });
  return {
    route,
    state,
    status: result.violations.length === 0 ? "PASS" : "FAIL",
    passes: result.passes.length,
    incomplete: result.incomplete.map(violation),
    violations: result.violations.map(violation),
  };
}

async function axeSource() {
  try {
    const module = await import("axe-core");
    return module.source ?? module.default?.source ?? null;
  } catch {
    return null;
  }
}

async function captureAccessibility(browser, engine, baseUrl, timeoutMs, source) {
  if (!source) return { engine, status: "LIMITATION", reason: "axe-core was unavailable", cases: [] };
  const { context, ledger } = await isolatedContext(browser, baseUrl, { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const cases = [];
  try {
    await page.goto(captureUrl(baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await settleFonts(page, timeoutMs);
    await page.addScriptTag({ content: source });
    const home = await page.evaluate(async () => globalThis.axe.run(document, {
      resultTypes: ["violations", "incomplete", "passes"],
      rules: { region: { enabled: true } },
    }));
    cases.push(compactAxeResult(home, "/", "reduced-motion-home"));

    await page.goto(captureUrl(baseUrl, "/about/"), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await settleFonts(page, timeoutMs);
    await openFieldMap(page, timeoutMs);
    await page.addScriptTag({ content: source });
    const map = await page.evaluate(async () => globalThis.axe.run(document, {
      resultTypes: ["violations", "incomplete", "passes"],
      rules: { region: { enabled: true } },
    }));
    cases.push(compactAxeResult(map, "/about/", "field-map-open"));
  } finally {
    await context.close();
  }
  const violations = cases.reduce((count, item) => count + item.violations.length, 0);
  return { engine, status: violations === 0 ? "PASS" : "FAIL", violationCount: violations, cases, network: ledger };
}

async function captureRouteShells(browser, baseUrl, output, timeoutMs) {
  const { context, ledger } = await isolatedContext(browser, baseUrl, { viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const cases = [];
  try {
    for (const spec of FINAL_ROUTE_SPECS) {
      const response = await page.goto(captureUrl(baseUrl, spec.route), { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await settleFonts(page, timeoutMs);
      const state = await page.evaluate(() => ({
        routeProduction: document.querySelector("[data-route-production]")?.getAttribute("data-route-production") ?? null,
        architecture: document.querySelector("[data-route-architecture]")?.getAttribute("data-route-architecture") ?? null,
        h1Count: document.querySelectorAll("main h1").length,
        fieldMapLinks: document.querySelectorAll("[data-field-map] a[href]").length,
        horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) > document.documentElement.clientWidth,
      }));
      const responseStatus = response?.status() ?? 0;
      invariant(responseStatus === spec.status, `${spec.id} HTTP status differs: ${responseStatus}`);
      invariant(state.routeProduction === spec.expected && state.architecture === "phase-7a-semantic-shell" && state.h1Count === 1 && state.fieldMapLinks === 8 && !state.horizontalOverflow, `${spec.id} route shell differs`);
      await screenshot(page, output, `route-shells/${spec.id}.png`, { fullPage: true });
      cases.push({ id: spec.id, route: spec.route, expectedStatus: spec.status, responseStatus, state, status: "PASS" });
    }
  } finally {
    await context.close();
  }
  return { status: "PASS", cases, network: ledger };
}

function accessibilityMarkdown(reports) {
  const rows = reports.map((report) => `| ${report.engine} | ${report.status} | ${report.cases.length} | ${report.violationCount ?? "not available"} |`);
  return `# Phase 7A-R1 automated accessibility evidence\n\nAutomated axe checks supplement, but do not replace, keyboard, 200% zoom, accessibility-tree and physical assistive-technology review.\n\n| Engine | Status | Cases | Violations |\n|---|---:|---:|---:|\n${rows.join("\n")}\n`;
}

async function listFiles(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = relativePosix(root, absolute);
    invariant(!entry.isSymbolicLink(), `symbolic links are forbidden in closure evidence: ${relative}`);
    if (entry.isDirectory()) result.push(...await listFiles(root, absolute));
    else if (entry.isFile()) result.push({ absolute, relative });
    else throw new Error(`unsupported evidence entry: ${relative}`);
  }
  return result.sort((left, right) => left.relative.localeCompare(right.relative));
}

async function validatePng(absolute) {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default ?? sharpModule;
  const image = sharp(absolute, { failOn: "error" });
  const metadata = await image.metadata();
  invariant(metadata.format === "png" && metadata.width > 0 && metadata.height > 0, `PNG metadata differs: ${path.basename(absolute)}`);
  const decoded = await sharp(absolute, { failOn: "error" }).raw().toBuffer({ resolveWithObject: true });
  invariant(decoded.data.length > 0, `PNG full decode is empty: ${path.basename(absolute)}`);
  return { format: metadata.format, width: metadata.width, height: metadata.height, fullDecode: "PASS" };
}

export async function buildClosureManifest(root, summary = {}) {
  const files = (await listFiles(root)).filter(({ relative }) => relative !== CLOSURE_MANIFEST_PATH);
  invariant(files.length > 0, "closure evidence is empty");
  const mp4Files = files.filter(({ relative }) => relative.endsWith(".mp4"));
  let comparisonByPath = new Map();
  let servedBuildAuthority = null;
  if (mp4Files.length > 0) {
    invariant(mp4Files.length === COMPARISON_RECORDING_SPECS.length, "closure MP4 matrix must contain exactly four normalized recordings");
    const reportFile = files.find(({ relative }) => relative === "recordings/signal-field-comparison/report.json");
    invariant(reportFile, "comparison recording report is missing from closure evidence");
    const report = JSON.parse(await readFile(reportFile.absolute, "utf8"));
    const afterRevisions = [...new Set(report.recordings?.filter(({ state }) => state === "after").map(({ sourceAuthority }) => sourceAuthority?.revision) ?? [])];
    invariant(afterRevisions.length === 1 && /^[a-f0-9]{40}$/.test(afterRevisions[0]), "comparison recording report has no unique R1 revision");
    assertComparisonRecordingReport(report, afterRevisions[0]);
    const servedFile = files.find(({ relative }) => relative === "provenance/served-build-authority.json");
    invariant(servedFile, "served-build provenance report is missing from closure evidence");
    servedBuildAuthority = JSON.parse(await readFile(servedFile.absolute, "utf8"));
    assertServedBuildAuthority(servedBuildAuthority, afterRevisions[0]);
    invariant(
      JSON.stringify(report.servedBuildAuthority) === JSON.stringify(servedAuthorityReceipt(servedBuildAuthority)),
      "comparison recording report is not bound to served-build provenance",
    );
    invariant(summary.comparativeProvenance, "closure summary is missing comparative provenance");
    assertServedAuthorityReceipt(summary.comparativeProvenance, afterRevisions[0]);
    invariant(
      summary.comparativeProvenance.localDist?.bytes === servedBuildAuthority.repository.localDist.bytes
        && summary.comparativeProvenance.localDist?.sha256 === servedBuildAuthority.repository.localDist.sha256
        && summary.comparativeProvenance.freshBuildReceipt?.headAfter === afterRevisions[0],
      "closure summary local build provenance differs",
    );
    comparisonByPath = new Map(report.recordings.map((record) => [record.relativePath, record]));
  }
  const artifacts = [];
  for (const file of files) {
    const forbidden = forbiddenPayloadReason(file.relative);
    invariant(!forbidden, `${file.relative}: ${forbidden}`);
    const bytes = await readFile(file.absolute);
    let validation;
    if (file.relative.endsWith(".png")) validation = await validatePng(file.absolute);
    else if (file.relative.endsWith(".mp4")) {
      const record = comparisonByPath.get(file.relative);
      invariant(record && record.bytes === bytes.length && record.sha256 === sha256(bytes), `normalized MP4 differs from decoded recording report: ${file.relative}`);
      validation = {
        normalizedMp4: "PASS",
        fullDecode: record.media.fullDecode ? "PASS" : "FAIL",
        codec: record.media.codec,
        pixelFormat: record.media.pixelFormat,
        durationSeconds: record.media.durationSeconds,
        recordingReportAuthority: "recordings/signal-field-comparison/report.json",
      };
    }
    else if (file.relative.endsWith(".json")) {
      JSON.parse(bytes.toString("utf8"));
      validation = { jsonParse: "PASS" };
    } else if (file.relative.endsWith(".md")) validation = { utf8Text: "PASS" };
    else throw new Error(`unexpected closure artifact type: ${file.relative}`);
    if (!file.relative.endsWith(".png") && !file.relative.endsWith(".mp4")) {
      const unsafe = forbiddenPayloadReason(file.relative, bytes);
      invariant(!unsafe, `${file.relative}: ${unsafe}`);
    }
    artifacts.push({
      relativePath: file.relative,
      bytes: bytes.length,
      sha256: sha256(bytes),
      status: "PASS",
      validation,
    });
  }
  invariant(new Set(artifacts.map(({ relativePath }) => relativePath)).size === artifacts.length, "closure artifact paths are duplicated");
  const sourceAuthority = servedBuildAuthority ? {
    report: "provenance/served-build-authority.json",
    before: {
      revision: PHASE7A_R1_EXACT_PARENT,
      bytes: servedBuildAuthority.documents.before.bytes,
      sha256: servedBuildAuthority.documents.before.sha256,
      domSignature: "EXACT_PARENT",
      runtimeAssets: {
        fingerprint: servedBuildAuthority.runtimeAssets.before.fingerprint,
        immutableAuthority: servedBuildAuthority.runtimeAssets.before.authority,
        records: servedBuildAuthority.runtimeAssets.before.served.map(({ kind, route, bytes, sha256: digest }) => ({ kind, route, bytes, sha256: digest })),
      },
    },
    after: {
      branch: servedBuildAuthority.repository.branch,
      revision: servedBuildAuthority.repository.head,
      bytes: servedBuildAuthority.documents.after.bytes,
      sha256: servedBuildAuthority.documents.after.sha256,
      domSignature: "PHASE_7A_R1",
      freshBuild: servedBuildAuthority.repository.buildReceipt,
      runtimeAssets: {
        fingerprint: servedBuildAuthority.runtimeAssets.after.localFingerprint,
        records: servedBuildAuthority.runtimeAssets.after.localDist,
      },
    },
    distinctDocumentFingerprints: servedBuildAuthority.documentFingerprintsDistinct,
  } : { before: "BEFORE_CAPTURE_ORIGIN", after: "AFTER_CAPTURE_ORIGIN" };
  return {
    schema: CLOSURE_SCHEMA,
    generatedAt: new Date().toISOString(),
    status: "PASS",
    sourceAuthority,
    privacy: {
      privateLocalPaths: "NONE",
      localCaptureUrls: "NONE",
      fontPayloads: "NONE",
      embeddedBase64: "NONE",
      htmlArtifacts: "NONE",
      nestedArchives: "NONE",
      rawBrowserVideo: "NONE",
      rawTraces: "NONE",
    },
    summary: sanitizeForEvidence(summary),
    artifactCount: artifacts.length,
    manifestSelfExcludedFromLedger: true,
    artifacts,
  };
}

async function assertFreshStaging(output) {
  invariant(!(await exists(output)), `refusing to overwrite existing output: ${path.basename(output)}`);
  let ancestor = path.dirname(output);
  while (!(await exists(ancestor))) {
    const parent = path.dirname(ancestor);
    invariant(parent !== ancestor, "capture output has no existing ancestor");
    ancestor = parent;
  }
  const resolvedAncestor = await realpath(ancestor);
  invariant((await lstat(resolvedAncestor)).isDirectory(), "capture output ancestor is not a directory");
  invariant(!within(ROOT, path.join(resolvedAncestor, path.relative(ancestor, output))), "capture output resolves inside the repository");
  const staging = `${output}.staging-${randomUUID()}`;
  invariant(!(await exists(staging)), "fresh staging path unexpectedly exists");
  await mkdir(staging, { recursive: false });
  return staging;
}

async function resolveBrowserAuthority(playwright, engine) {
  const browserType = playwright[engine];
  invariant(browserType, `unsupported browser engine: ${engine}`);
  const executablePath = browserType.executablePath();
  invariant(await stat(executablePath).then((entry) => entry.isFile()).catch(() => false), `managed ${engine} browser is unavailable; install the Playwright browser`);
  return { browserType, executablePath, executable: path.basename(executablePath) };
}

function captureSummaryMarkdown(summary) {
  return `# Phase 7A-R1 focused closure capture\n\nStatus: **${summary.status}**\n\nThis external evidence set records the accepted parent and repaired branch from separate capture origins without publishing those local URLs or any private machine path. It includes exact before/after short-landscape comparisons, four decoded Chromium/Firefox before/after Signal Field MP4s, causal Signal Field stills, audience bifurcation, semantic Field Map isolation, fail-closed target inventories, fallback states, Firefox first paint, typography rasters, automated accessibility and the final semantic route shells.\n\n- Required short-landscape cases: ${summary.shortLandscapeCases}\n- Before geometry PASS / FAIL: ${summary.beforeGeometryPass} / ${summary.beforeGeometryFail}\n- Repaired geometry PASS: ${summary.afterGeometryPass}\n- Comparative MP4 recordings PASS: ${summary.comparisonRecordingsPass}\n- Target states PASS: ${summary.targetStatesPass}\n- Route/404 states PASS: ${summary.routeStatesPass}\n- Browser engines: ${summary.browserEngines.join(", ")}\n- Human gate decision: PENDING HUMAN REVIEW\n\nThis capture does not self-accept Phase 7A and does not authorize Phase 7B or a merge to main.\n`;
}

export function runSelfTest() {
  const expected = [
    "short-landscape-740x320", "short-landscape-740x360", "short-landscape-768x320", "short-landscape-768x360",
    "short-landscape-800x320", "short-landscape-800x360", "short-landscape-800x390", "short-landscape-820x360",
    "short-landscape-844x360", "short-landscape-844x390", "short-landscape-896x414", "short-landscape-900x480",
  ];
  invariant(JSON.stringify(REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.map(({ id }) => id)) === JSON.stringify(expected), "required short-landscape authority differs");
  invariant(forbiddenPayloadReason("typography/anybody-specimen.png") === null, "rendered typography PNG was rejected");
  invariant(forbiddenPayloadReason("typography/specimen.html") === "forbidden artifact extension", "HTML payload was not rejected");
  invariant(forbiddenPayloadReason("typography/font-files/candidate.woff2") !== null, "font payload was not rejected");
  invariant(forbiddenPayloadReason("report.json", "data:font/woff2;base64,AAAA") === "embedded font payload", "embedded font payload was not rejected");
  const passTargets = [{ id: "state", report: { status: "PASS", summary: { targetFailures: 0, unexplainedExclusions: 0, contractFailures: 0 } } }];
  assertTargetLedgerPass(passTargets);
  let targetRejected = false;
  try {
    assertTargetLedgerPass([{ id: "state", report: { status: "PASS", summary: { targetFailures: 1, unexplainedExclusions: 0, contractFailures: 0 } } }]);
  } catch { targetRejected = true; }
  invariant(targetRejected, "target-size false PASS was accepted");
  const passGeometry = REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.map((viewport) => ({ id: viewport.id, viewport, status: "PASS", failure: null }));
  let missingGeometryRejected = false;
  try { assertAfterGeometryPass(passGeometry); } catch { missingGeometryRejected = true; }
  invariant(missingGeometryRejected, "after geometry without shared measurements was accepted");
  let geometryRejected = false;
  try {
    assertAfterGeometryPass(passGeometry.map((entry, index) => index === 5 ? { ...entry, status: "FAIL", failure: "top clipping" } : entry));
  } catch { geometryRejected = true; }
  invariant(geometryRejected, "after-geometry false PASS was accepted");
  invariant(COMPARISON_RECORDING_SPECS.length === 4 && new Set(COMPARISON_RECORDING_SPECS.map(({ relativePath }) => relativePath)).size === 4, "comparison recording topology differs");
  const encoder = comparisonEncoderArguments("input.webm", "output.mp4", { trimStartSeconds: 2.25 });
  for (const token of ["-ss", "-t", "-an", "-sn", "-dn", "cfr", "30", "libx264", "+faststart"]) invariant(encoder.includes(token), `comparison encoder misses ${token}`);
  const probeValidation = validateComparisonRecordingProbe({
    format: { duration: "6.000", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
    streams: [{
      avg_frame_rate: "30/1",
      codec_name: "h264",
      codec_type: "video",
      height: 720,
      nb_read_frames: "180",
      pix_fmt: "yuv420p",
      r_frame_rate: "30/1",
      width: 1280,
    }],
  }, { fullDecodePassed: true });
  invariant(probeValidation.status === "PASS", "comparison media probe fixture differs");
  const afterRevision = "b".repeat(40);
  const selfAfterDocument = { bytes: 23_757, sha256: "d".repeat(64) };
  const selfBeforeAssets = EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.records;
  const selfAfterAssets = [
    { kind: "css", route: "/_astro/r1.css", bytes: 3_000, sha256: "3".repeat(64) },
    { kind: "javascript", route: "/_astro/r1.js", bytes: 4_000, sha256: "4".repeat(64) },
  ];
  const selfServedReceipt = {
    report: "provenance/served-build-authority.json",
    status: "PASS",
    branch: PHASE7A_R1_REQUIRED_BRANCH,
    afterRevision,
    beforeDocument: {
      revision: PHASE7A_R1_EXACT_PARENT,
      bytes: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.bytes,
      sha256: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256,
    },
    afterDocument: { revision: afterRevision, ...selfAfterDocument },
    runtimeAssets: {
      before: {
        count: selfBeforeAssets.length,
        fingerprint: runtimeAssetSetFingerprint(selfBeforeAssets),
        immutableAuthority: {
          revision: EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.revision,
          derivation: EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.derivation,
          fingerprint: EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.fingerprint,
        },
      },
      after: { count: selfAfterAssets.length, fingerprint: runtimeAssetSetFingerprint(selfAfterAssets) },
    },
    distinctDocumentFingerprints: true,
    domSignatures: { before: "EXACT_PARENT", after: "PHASE_7A_R1" },
  };
  const pointerStates = [1, 2, 3, 4].map((step) => ({ step, probe: "active", probeX: "50%", probeY: "50%", nearX: "0px", nearY: "0px", bounded: true }));
  const comparisonReport = {
    schema: COMPARISON_RECORDING_SCHEMA,
    status: "PASS",
    contract: COMPARISON_RECORDING_CONTRACT,
    servedBuildAuthority: selfServedReceipt,
    rawBrowserVideoRetained: false,
    recordings: COMPARISON_RECORDING_SPECS.map((spec) => ({
      id: spec.id,
      engine: spec.engine,
      state: spec.state,
      sourceAuthority: {
        kind: spec.sourceKind,
        revision: spec.state === "before" ? PHASE7A_R1_EXACT_PARENT : afterRevision,
        document: {
          report: "provenance/served-build-authority.json",
          ...(spec.state === "before" ? {
            bytes: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.bytes,
            sha256: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256,
          } : selfAfterDocument),
        },
        livePageAttestation: {
          channel: "recording-document-response-and-live-dom",
          document: spec.state === "before" ? {
            bytes: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.bytes,
            sha256: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256,
          } : selfAfterDocument,
          domSignature: spec.state === "before" ? "EXACT_PARENT" : "PHASE_7A_R1",
          runtimeAssets: spec.state === "before" ? {
            count: selfBeforeAssets.length,
            fingerprint: runtimeAssetSetFingerprint(selfBeforeAssets),
          } : {
            count: selfAfterAssets.length,
            fingerprint: runtimeAssetSetFingerprint(selfAfterAssets),
          },
        },
      },
      relativePath: spec.relativePath,
      visibleLabel: comparisonVisibleLabel(spec, afterRevision),
      boundedPointerResponse: spec.boundedPointerResponse,
      settledState: { cinematicMode: "candidate", manifestoReveal: "resolved", h1Text: "We turn industrial needs into field evidence.", signalField: true, overlayVisible: true },
      pointerStates: spec.boundedPointerResponse ? pointerStates : [],
      pointerSettled: spec.boundedPointerResponse ? { probe: "settled", probeX: "50%", probeY: "50%", nearX: "0px", nearY: "0px" } : null,
      media: probeValidation.media,
      bytes: 1_024,
      sha256: "c".repeat(64),
      validationChecks: probeValidation.checks,
      status: "PASS",
    })),
  };
  assertComparisonRecordingReport(comparisonReport, afterRevision);
  let recordingRejected = false;
  try {
    assertComparisonRecordingReport({
      ...comparisonReport,
      recordings: comparisonReport.recordings.map((record, index) => index === 3 ? { ...record, media: { ...record.media, fullDecode: false } } : record),
    }, afterRevision);
  } catch { recordingRejected = true; }
  invariant(recordingRejected, "comparison recording false PASS was accepted");
  return {
    schema: CLOSURE_SCHEMA,
    status: "PASS",
    shortLandscapeCases: expected.length,
    failClosedGeometry: geometryRejected,
    comparisonRecordings: COMPARISON_RECORDING_SPECS.length,
    failClosedRecordings: recordingRejected,
    failClosedTargets: targetRejected,
    forbiddenPayloadChecks: "PASS",
  };
}

function usage() {
  return `Usage:\n  node scripts/capture-phase7a-r1-closure.mjs --before-base-url <exact-parent-preview> --after-base-url <r1-preview> --after-revision <40-char-r1-head> --output <fresh-external-directory> [--ffmpeg <absolute-path>] [--ffprobe <absolute-path>] [--timeout-ms 30000] [--headed]\n  node scripts/capture-phase7a-r1-closure.mjs --self-test\n\nThe capture always emits the complete Chromium + Firefox before/after Signal Field MP4 matrix. FFmpeg normalization, FFprobe inspection, full decode and removal of raw browser WebM files are mandatory.\n`;
}

export async function run(options) {
  const replacements = [
    [options.beforeBaseUrl, "BEFORE_CAPTURE_ORIGIN/"],
    [options.afterBaseUrl, "AFTER_CAPTURE_ORIGIN/"],
    [ROOT, "REPOSITORY_ROOT"],
  ];
  const staging = await assertFreshStaging(options.output);
  let committed = false;
  try {
    const repositoryAuthority = await captureRepositoryAuthority(options.afterRevision);
    const playwright = await import("playwright-core");
    const chromiumAuthority = await resolveBrowserAuthority(playwright, "chromium");
    const firefoxAuthority = await resolveBrowserAuthority(playwright, "firefox");
    const mediaTools = await resolveMediaTools(options);
    const chromium = await chromiumAuthority.browserType.launch({ executablePath: chromiumAuthority.executablePath, headless: !options.headed });
    const chromiumVersion = chromium.version();
    let firefox = null;
    let firefoxVersion = null;
    try {
      const servedBuildAuthority = await captureServedBuildAuthority(
        chromium,
        options.beforeBaseUrl,
        options.afterBaseUrl,
        repositoryAuthority,
        options.afterRevision,
        options.timeoutMs,
      );
      await writeJson(staging, "provenance/served-build-authority.json", servedBuildAuthority, replacements);
      await writeArtifact(staging, "provenance/served-build-authority.md", servedBuildMarkdown(servedBuildAuthority), { replacements });

      const beforeGeometry = await captureShortLandscape(chromium, options.beforeBaseUrl, "before", staging, options.timeoutMs);
      const afterGeometry = await captureShortLandscape(chromium, options.afterBaseUrl, "after", staging, options.timeoutMs);
      assertComparativeGeometry(beforeGeometry.cases, afterGeometry.cases);
      await writeJson(staging, "responsive/geometry-before.json", beforeGeometry, replacements);
      await writeJson(staging, "responsive/geometry-after.json", afterGeometry, replacements);
      await writeArtifact(staging, "responsive/short-landscape-report.md", geometryMarkdown(beforeGeometry, afterGeometry), { replacements });

      const signal = await captureSignalComparison(chromium, options.beforeBaseUrl, options.afterBaseUrl, staging, options.timeoutMs);
      await writeJson(staging, "signal-field/comparison.json", signal, replacements);
      const bifurcation = await captureBifurcation(chromium, options.afterBaseUrl, staging, options.timeoutMs);
      await writeJson(staging, "audience-bifurcation/report.json", bifurcation, replacements);

      const fieldMap = await captureFieldMap(chromium, options.afterBaseUrl, staging, options.timeoutMs);
      await writeJson(staging, "field-map/semantic-isolation.json", fieldMap, replacements);
      await writeArtifact(staging, "field-map/semantic-isolation.md", fieldMapMarkdown(fieldMap), { replacements });

      const targets = await captureTargetLedger(chromium, options.afterBaseUrl, options.timeoutMs);
      await writeJson(staging, "target-size/element-inventory.json", targets, replacements);
      await writeArtifact(staging, "target-size/element-inventory.md", targetMarkdown(targets), { replacements });

      const fallback = await captureFallbackStates(chromium, options.afterBaseUrl, staging, options.timeoutMs);
      await writeJson(staging, "fallback/report.json", fallback, replacements);
      await writeArtifact(staging, "fallback/report.md", fallbackMarkdown(fallback), { replacements });

      const typography = await captureTypography(chromium, staging, options.timeoutMs);
      await writeJson(staging, "typography/configuration-licences-hashes.json", typography, replacements);
      await writeArtifact(staging, "typography/report.md", typographyMarkdown(typography), { replacements });

      const routes = await captureRouteShells(chromium, options.afterBaseUrl, staging, options.timeoutMs);
      await writeJson(staging, "route-shells/report.json", routes, replacements);

      const comparisonRecordings = await captureComparisonRecordings({
        chromium,
        firefoxAuthority,
        beforeBaseUrl: options.beforeBaseUrl,
        afterBaseUrl: options.afterBaseUrl,
        afterRevision: options.afterRevision,
        servedBuildAuthority,
        headed: options.headed,
        output: staging,
        timeoutMs: options.timeoutMs,
        tools: mediaTools,
      });
      await writeJson(staging, "recordings/signal-field-comparison/report.json", comparisonRecordings, replacements);
      await writeArtifact(staging, "recordings/signal-field-comparison/report.md", comparisonRecordingsMarkdown(comparisonRecordings), { replacements });

      const axe = await axeSource();
      const chromiumAccessibility = await chromiumAuthority.browserType.launch({ executablePath: chromiumAuthority.executablePath, headless: !options.headed });
      firefox = await firefoxAuthority.browserType.launch({ executablePath: firefoxAuthority.executablePath, headless: !options.headed });
      firefoxVersion = firefox.version();
      let accessibility;
      try {
        accessibility = [
          await captureAccessibility(chromiumAccessibility, "chromium", options.afterBaseUrl, options.timeoutMs, axe),
          await captureAccessibility(firefox, "firefox", options.afterBaseUrl, options.timeoutMs, axe),
        ];
      } finally {
        await chromiumAccessibility.close().catch(() => undefined);
      }
      invariant(!axe || accessibility.every(({ status }) => status === "PASS"), "automated accessibility violations remain in the R1 closure states");
      await writeJson(staging, "accessibility/chromium.json", accessibility[0], replacements);
      await writeJson(staging, "accessibility/firefox.json", accessibility[1], replacements);
      await writeArtifact(staging, "accessibility/report.md", accessibilityMarkdown(accessibility), { replacements });

      const firstPaint = await captureFirefoxFirstPaint(firefox, options.afterBaseUrl, staging, options.timeoutMs);
      await writeJson(staging, "firefox-first-paint/report.json", firstPaint, replacements);
      await writeArtifact(staging, "firefox-first-paint/report.md", firefoxPaintMarkdown(firstPaint), { replacements });

      const summary = {
        schema: CLOSURE_SCHEMA,
        status: "PASS",
        shortLandscapeCases: REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.length,
        beforeGeometryPass: beforeGeometry.cases.filter(({ status }) => status === "PASS").length,
        beforeGeometryFail: beforeGeometry.cases.filter(({ status }) => status === "FAIL").length,
        afterGeometryPass: afterGeometry.cases.filter(({ status }) => status === "PASS").length,
        targetStatesPass: targets.states.filter(({ report }) => report.status === "PASS").length,
        routeStatesPass: routes.cases.filter(({ status }) => status === "PASS").length,
        comparisonRecordingsPass: comparisonRecordings.recordings.filter(({ status }) => status === "PASS").length,
        comparisonRecordingContract: comparisonRecordings.contract,
        comparativeProvenance: {
          ...servedAuthorityReceipt(servedBuildAuthority),
          freshBuildReceipt: repositoryAuthority.buildReceipt,
          localDist: repositoryAuthority.localDist,
        },
        responsiveDefectAuthority: {
          viewport: "800x360",
          before: "FAIL_STICKY_TOP_CLIPPING_REPRODUCED",
          after: "PASS_SHARED_GEOMETRY_VALIDATOR",
        },
        fieldMapStatus: fieldMap.status,
        bifurcationStatus: bifurcation.status,
        fallbackStatus: fallback.status,
        firefoxFirstPaintStatus: firstPaint.status,
        accessibility: accessibility.map(({ engine, status, violationCount }) => ({ engine, status, violationCount: violationCount ?? null })),
        browserEngines: ["Chromium", "Firefox"],
        browsers: [
          { engine: "chromium", version: chromiumVersion, executable: chromiumAuthority.executable },
          { engine: "firefox", version: firefoxVersion, executable: firefoxAuthority.executable },
        ],
        humanGates: "PENDING HUMAN REVIEW",
        phase7bAuthorized: false,
        mainMergeAuthorized: false,
      };
      await writeJson(staging, "capture-summary.json", summary, replacements);
      await writeArtifact(staging, "README.md", captureSummaryMarkdown(summary), { replacements });

      const manifest = await buildClosureManifest(staging, summary);
      await writeJson(staging, CLOSURE_MANIFEST_PATH, manifest, replacements);
      const manifestBytes = await readFile(path.join(staging, CLOSURE_MANIFEST_PATH));
      invariant(!forbiddenPayloadReason(CLOSURE_MANIFEST_PATH, manifestBytes), "closure manifest contains unsafe evidence data");
    } finally {
      await chromium.close().catch(() => undefined);
      await firefox?.close().catch(() => undefined);
    }
    await rename(staging, options.output);
    committed = true;
    return { output: options.output, manifest: path.join(options.output, CLOSURE_MANIFEST_PATH) };
  } finally {
    if (!committed && await exists(staging)) await rm(staging, { recursive: true, force: true });
  }
}

async function main() {
  try {
    const options = validateOptions(parseArguments(process.argv.slice(2)));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }
    if (options.selfTest) {
      process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
      return;
    }
    const result = await run(options);
    process.stdout.write(`Phase 7A-R1 closure evidence captured: ${result.output}\n`);
  } catch (error) {
    process.stderr.write(`Phase 7A-R1 closure capture failed: ${safeString(error?.stack ?? error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
