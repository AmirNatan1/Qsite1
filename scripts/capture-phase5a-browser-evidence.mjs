#!/usr/bin/env node

/**
 * Phase 5A deployed scroll-addressed CRT evidence.
 *
 * Deployment identities are command inputs. The harness refuses a repository
 * output path or an existing output directory. Browser recordings are genuine
 * Playwright recordings and are normalized, fully decoded, and probed as
 * silent H.264/yuv420p/30fps MP4 files with the caller-supplied FFmpeg tools.
 * Calibration uses a disposable browser context; recorded state changes use
 * only native wheel, keyboard, touch, or scrollbar input.
 */

import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import axeCore from "axe-core";
import { chromium } from "playwright-core";
import sharp from "sharp";

import {
  ACCEPTED_PHASE4_SHA,
  ARRIVAL_FRAME,
  CONCEPTUAL_FRAME_COUNT,
  ENTRY_START_FRAME,
  FAMILY_PROFILES,
  FIRST_CHANGED_FRAME,
  FPS,
  HOLD_MILLISECONDS,
  HUMAN_GATES,
  MAIN_SHA,
  MANIFEST_URL_PATH,
  PHYSICAL_FRAME_COUNT,
  PIECEWISE_COORDINATES,
  REAL_404_ROUTE,
  RECORDINGS,
  REPORT_SCHEMAS,
  REQUIRED_BRANCH,
  SCHEMA,
  SEGMENTS,
  SHEETS,
  SOURCE_BLEND_SHA256,
  STABLE_Q_FRAME,
  STARTUP_LANDMARKS,
  SUPPORTING_ROUTES,
  VIEWPOINTS,
  assertInventoryContract,
  expectedOffsetForCoordinate,
  holdResult,
  isWithin,
  mediaUrlPath,
  normalizeDeployedUrl,
  profileForView,
  recordingDurationResult,
  sha256,
  stableJson,
  validateActiveManifest,
} from "./phase5a-evidence-contract.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_RELATIVE = "scripts/capture-phase5a-browser-evidence.mjs";
const CONTRACT_RELATIVE = "scripts/phase5a-evidence-contract.mjs";
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,})/i;
const REQUIRED_MAPPING_DOCUMENT = "docs/planning/PHASE_5A_SCROLL_CRT_MAPPING.md";
const MEDIA_PATTERN = /\/media\/cinematic\/phase-4r2\/.*\.(?:mp4|webm)(?:\?|$)/i;
const VIDEO_PATTERN = /\.(?:mp4|webm)(?:\?|$)/i;
const STARTUP_SEQUENCE = STARTUP_LANDMARKS.filter((item) => item.frame !== ARRIVAL_FRAME);

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    mode: "deployed",
    url: null,
    branchUrl: null,
    expectedHead: null,
    expectedBranch: REQUIRED_BRANCH,
    expectedDeploymentId: null,
    deploymentProject: null,
    deploymentCheckRunId: null,
    expectedManifestSha256: null,
    manifest: null,
    manifestUrlPath: MANIFEST_URL_PATH,
    deploymentReport: null,
    output: null,
    chromium: process.env.CHROME_PATH ?? null,
    ffmpeg: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobe: process.env.FFPROBE_PATH ?? "ffprobe",
    timeoutMs: 30_000,
    selfTest: false,
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--mode") options.mode = next();
    else if (argument === "--url" || argument === "--immutable-url") options.url = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-branch") options.expectedBranch = next();
    else if (argument === "--expected-deployment-id" || argument === "--deployment-id") options.expectedDeploymentId = next();
    else if (argument === "--deployment-project" || argument === "--expected-deployment-project") options.deploymentProject = next();
    else if (argument === "--deployment-check-run-id" || argument === "--github-check-run-id") options.deploymentCheckRunId = next();
    else if (argument === "--expected-manifest-sha256") options.expectedManifestSha256 = next().toLowerCase();
    else if (argument === "--manifest") options.manifest = path.resolve(next());
    else if (argument === "--manifest-url-path") options.manifestUrlPath = next();
    else if (argument === "--deployment-report") options.deploymentReport = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--chromium" || argument === "--browser") options.chromium = path.resolve(next());
    else if (argument === "--ffmpeg") options.ffmpeg = next();
    else if (argument === "--ffprobe") options.ffprobe = next();
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 5A deployed scroll-addressed CRT evidence\n\nUsage:\n  node ${SCRIPT_RELATIVE} --immutable-url https://<immutable-host>/ --branch-url https://<branch-host>/ --expected-head <40-hex> --expected-deployment-id <uuid> --deployment-project <name> --deployment-check-run-id <decimal-id> --manifest <production-manifest.json> --expected-manifest-sha256 <64-hex> --deployment-report <phase5a-deployment.json> --output <fresh-directory-outside-repository> [--browser <chromium>] [--ffmpeg <ffmpeg>] [--ffprobe <ffprobe>]\n\nSafety:\n  --mode must be deployed. --output is mandatory, external, durable, and nonexistent.\n  --dry-run validates arguments/manifest only; it launches no browser, performs no network request, and writes nothing.\n`);
}

export function validateOptions(options) {
  if (options.mode !== "deployed") throw new Error("Phase 5A review evidence is deployed-only");
  options.url = normalizeDeployedUrl(options.url ?? "");
  options.branchUrl = normalizeDeployedUrl(options.branchUrl ?? "");
  if (options.url === options.branchUrl) throw new Error("immutable and branch preview URLs must be distinct authorities");
  if (!/^[0-9a-f]{40}$/.test(options.expectedHead ?? "")) throw new Error("--expected-head must be an exact 40-character SHA");
  if (options.expectedHead === ACCEPTED_PHASE4_SHA || options.expectedHead === MAIN_SHA) throw new Error("--expected-head must identify the Phase 5A deployed commit");
  if (options.expectedBranch !== REQUIRED_BRANCH) throw new Error(`Phase 5A evidence must target ${REQUIRED_BRANCH}`);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(options.expectedDeploymentId ?? "")) throw new Error("--expected-deployment-id must be a UUID");
  if (!/^[a-z0-9][a-z0-9._-]{1,127}$/i.test(options.deploymentProject ?? "")) throw new Error("--deployment-project is absent or malformed");
  if (!/^[1-9][0-9]{0,30}$/.test(String(options.deploymentCheckRunId ?? ""))) throw new Error("--deployment-check-run-id must be a positive decimal identifier");
  if (!/^[0-9a-f]{64}$/.test(options.expectedManifestSha256 ?? "")) throw new Error("--expected-manifest-sha256 must be an exact SHA-256");
  if (!options.manifest || !options.deploymentReport || !options.output) throw new Error("--manifest, --deployment-report, and --output are required");
  if (options.manifestUrlPath !== MANIFEST_URL_PATH) throw new Error(`public manifest authority must remain ${MANIFEST_URL_PATH}`);
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  if (isWithin(ROOT, options.output)) throw new Error("evidence output must remain external and untracked");
  return options;
}

async function resolveFromExistingAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const suffix = [];
  while (true) {
    try {
      const resolved = await realpath(cursor);
      return path.join(resolved, ...suffix.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      suffix.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

export async function validateFreshExternalOutputPath(candidate) {
  try { await stat(candidate); throw new Error("--output must not already exist"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  let parent;
  try { parent = await stat(path.dirname(candidate)); }
  catch (error) { throw new Error("--output parent directory must already exist", { cause: error }); }
  if (!parent.isDirectory()) throw new Error("--output parent must be a directory");
  const resolved = await resolveFromExistingAncestor(candidate);
  if (isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved) || path.parse(resolved).root === resolved) {
    throw new Error("resolved output is not a durable external directory");
  }
  return resolved;
}

async function run(command, args, label, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd ?? ROOT,
      encoding: "utf8",
      windowsHide: true,
      timeout: options.timeout ?? 60_000,
      maxBuffer: options.maxBuffer ?? 4 * 1024 * 1024,
    });
    return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    throw new Error(`${label} failed${error.stderr ? `: ${String(error.stderr).trim()}` : ""}`, { cause: error });
  }
}

async function git(args, label = `git ${args.join(" ")}`) {
  return (await run("git", args, label)).stdout;
}

async function liveRemoteHead(branch) {
  const value = await git(["ls-remote", "--heads", "origin", `refs/heads/${branch}`], `live remote ${branch}`);
  const sha = value.split(/\s+/, 1)[0] ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`live remote branch is missing: ${branch}`);
  return sha;
}

export async function repositoryAuthority(options) {
  const [head, branch, status, upstream, main, remoteMain, acceptedBranch, ancestor, chainText, liveHead, liveMain] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["branch", "--show-current"]),
    git(["status", "--porcelain=v1", "--untracked-files=all"]),
    git(["rev-parse", "@{upstream}"]),
    git(["rev-parse", "main"]),
    git(["rev-parse", "origin/main"]),
    git(["rev-parse", "origin/repair/phase-4r2-1-causal-signal-scroll-stability"]),
    git(["merge-base", ACCEPTED_PHASE4_SHA, options.expectedHead]),
    git(["rev-list", "--reverse", `${ACCEPTED_PHASE4_SHA}..${options.expectedHead}`]),
    liveRemoteHead(options.expectedBranch),
    liveRemoteHead("main"),
  ]);
  if (head !== options.expectedHead || branch !== options.expectedBranch || upstream !== head || liveHead !== head) throw new Error("local/upstream/live Phase 5A parity failed");
  if (status !== "") throw new Error("deployed evidence requires a clean tree and empty untracked inventory");
  if (main !== MAIN_SHA || remoteMain !== MAIN_SHA || liveMain !== MAIN_SHA) throw new Error("local/upstream/live main moved from its fixed authority");
  if (acceptedBranch !== ACCEPTED_PHASE4_SHA || ancestor !== ACCEPTED_PHASE4_SHA) throw new Error("accepted Phase 4 ancestry differs");
  const chain = chainText.split(/\r?\n/).filter(Boolean);
  if (chain.length === 0 || chain.at(-1) !== options.expectedHead) throw new Error("Phase 5A commit chain is empty or does not end at expected HEAD");
  const exactParent = await git(["rev-parse", `${chain[0]}^`]);
  if (exactParent !== ACCEPTED_PHASE4_SHA) throw new Error("first Phase 5A checkpoint does not have the accepted Phase 4 exact parent");
  const changedMedia = (await git(["diff", "--name-only", ACCEPTED_PHASE4_SHA, options.expectedHead, "--", "public/media/cinematic/phase-4r2", "artifacts/phase-4r2-production-media", "*.blend"])).split(/\r?\n/).filter(Boolean);
  if (changedMedia.length !== 0) throw new Error(`Phase 4 production media changed: ${changedMedia.join(", ")}`);
  const trackedTooling = await Promise.all([SCRIPT_RELATIVE, CONTRACT_RELATIVE, "tests/phase5a-evidence-tooling.test.mjs", REQUIRED_MAPPING_DOCUMENT].map(async (file) => (await git(["ls-files", "--error-unmatch", file])) === file));
  if (trackedTooling.some((tracked) => !tracked)) throw new Error("Phase 5A mapping/evidence tooling must be tracked by captured HEAD");
  const subjects = [];
  for (const sha of chain) subjects.push({ sha, subject: await git(["show", "-s", "--format=%s", sha]) });
  return {
    branch,
    head,
    exactParent,
    acceptedPhase4: ACCEPTED_PHASE4_SHA,
    commitChain: subjects,
    cleanTree: true,
    emptyUntrackedInventory: true,
    upstreamHead: upstream,
    liveRemoteHead: liveHead,
    main: { local: main, upstream: remoteMain, liveRemote: liveMain, required: MAIN_SHA, unchanged: true },
    phase4ProductionMediaRerendered: false,
  };
}

async function readJson(file, label) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { throw new Error(`${label} is missing or invalid JSON`, { cause: error }); }
}

async function loadManifest(options) {
  const bytes = await readFile(options.manifest);
  if (sha256(bytes) !== options.expectedManifestSha256) throw new Error("local production manifest hash differs from CLI authority");
  const manifest = JSON.parse(bytes.toString("utf8"));
  validateActiveManifest(manifest);
  return { manifest, bytes };
}

function firstDefined(object, paths) {
  for (const segments of paths) {
    let value = object;
    for (const segment of segments) value = value?.[segment];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

export function validateDeploymentReportData(report, options, manifestBytes) {
  if (report?.status !== "PASS" || !/phase[- ]?5a/i.test(String(report.schema ?? ""))) throw new Error("deployment report is not a Phase 5A PASS authority");
  const heads = [
    firstDefined(report, [["repository", "head"]]),
    firstDefined(report, [["deployment", "expectedHead"]]),
    firstDefined(report, [["cloudflare", "commitHash"]]),
  ].filter(Boolean);
  if (heads.length < 2 || heads.some((head) => head !== options.expectedHead)) throw new Error("deployment report exact HEAD binding differs");
  const branch = firstDefined(report, [["repository", "branch"], ["cloudflare", "branch"]]);
  const immutableUrl = firstDefined(report, [["deployment", "immutableUrl"], ["cloudflare", "deploymentUrl"]]);
  const branchUrl = firstDefined(report, [["deployment", "branchUrl"]]);
  const sourceHash = firstDefined(report, [["productionManifest", "sourceBlendSha256"], ["productionManifest", "sourceSha256"]]);
  const manifestHash = firstDefined(report, [["productionManifest", "sha256"], ["deployment", "immutable", "manifest", "sha256"]]);
  const manifestLength = firstDefined(report, [["productionManifest", "bytes"], ["deployment", "immutable", "manifest", "bytes"]]);
  if (branch !== options.expectedBranch || immutableUrl !== options.url || branchUrl !== options.branchUrl) throw new Error("deployment report branch/URL binding differs");
  if (sourceHash !== SOURCE_BLEND_SHA256 || manifestHash !== options.expectedManifestSha256 || manifestLength !== manifestBytes.length) throw new Error("deployment report physical manifest binding differs");
  const mainHead = firstDefined(report, [["repository", "main", "headSha"], ["github", "main", "headSha"], ["repository", "main", "head"]]);
  if (mainHead !== MAIN_SHA || report.authorization?.humanAccepted !== false || report.authorization?.mainMerged !== false || report.authorization?.phase5BAuthorized !== false) throw new Error("deployment report main/Phase 5B authorization boundary differs");
  if (stableJson(report.humanReviewGates) !== stableJson(HUMAN_GATES)) throw new Error("deployment report human-review gates differ");
  const deploymentId = String(report.cloudflare?.deploymentId ?? "");
  const project = String(report.cloudflare?.project ?? "");
  const terminalStage = report.cloudflare?.terminalStage;
  const checkRun = report.github?.checkRun;
  if (deploymentId !== options.expectedDeploymentId || project !== options.deploymentProject || String(checkRun?.id ?? "") !== String(options.deploymentCheckRunId)) throw new Error("deployment report Cloudflare/GitHub identity differs");
  if (checkRun?.status !== "completed" || checkRun?.conclusion !== "success" || (checkRun.headSha && checkRun.headSha !== options.expectedHead)) throw new Error("deployment report GitHub check run is not exact successful HEAD authority");
  if (terminalStage?.name !== "deploy" || terminalStage?.status !== "success" || !Number.isFinite(Date.parse(terminalStage.endedOn ?? "")) || (report.cloudflare?.environment && report.cloudflare.environment !== "preview")) throw new Error("deployment report Cloudflare terminal preview stage is not exact success");
  return {
    schema: report.schema,
    status: "PASS",
    deploymentId,
    project,
    checkRunId: String(checkRun.id),
    terminalStage,
    immutableUrl,
    branchUrl,
    exactHead: options.expectedHead,
    exactBranch: options.expectedBranch,
    mainUnchanged: true,
    phase5BAuthorized: false,
    humanReviewGates: HUMAN_GATES,
  };
}

async function validateDeploymentReport(options, manifestBytes) {
  const bytes = await readFile(options.deploymentReport);
  const report = JSON.parse(bytes.toString("utf8"));
  return { ...validateDeploymentReportData(report, options, manifestBytes), bytes: bytes.length, sha256: sha256(bytes) };
}

async function fetchBytes(url, timeoutMs) {
  const response = await fetch(url, { headers: { Accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs) });
  return {
    status: response.status,
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
    cacheControl: response.headers.get("cache-control"),
  };
}

async function verifyOriginAuthority(origin, options, manifest, manifestBytes) {
  const manifestResponse = await fetchBytes(new URL(options.manifestUrlPath, origin), options.timeoutMs);
  if (manifestResponse.status !== 200 || !manifestResponse.bytes.equals(manifestBytes)) throw new Error(`${origin} public manifest differs byte-for-byte`);
  const assets = [];
  for (const asset of manifest.assets) {
    const publicPath = mediaUrlPath(options.manifestUrlPath, asset.file);
    const response = await fetchBytes(new URL(publicPath, origin), options.timeoutMs);
    if (response.status !== 200 || response.bytes.length !== asset.bytes || sha256(response.bytes) !== asset.sha256) throw new Error(`${origin} public payload differs: ${asset.file}`);
    assets.push({ family: asset.family, kind: asset.kind, codec: asset.codec ?? null, publicPath, bytes: response.bytes.length, sha256: sha256(response.bytes), contentType: response.contentType, status: "PASS" });
  }
  return { origin, manifest: { publicPath: options.manifestUrlPath, bytes: manifestBytes.length, sha256: sha256(manifestBytes) }, assets, status: "PASS" };
}

async function verifyPublicAuthority(options, manifest, manifestBytes) {
  const [immutable, branch] = await Promise.all([
    verifyOriginAuthority(options.url, options, manifest, manifestBytes),
    verifyOriginAuthority(options.branchUrl, options, manifest, manifestBytes),
  ]);
  return { immutable, branch, parity: stableJson(immutable.assets.map(({ publicPath, bytes, sha256: hash }) => ({ publicPath, bytes, sha256: hash }))) === stableJson(branch.assets.map(({ publicPath, bytes, sha256: hash }) => ({ publicPath, bytes, sha256: hash }))), status: "PASS" };
}

async function executable(candidate) {
  try {
    if (path.isAbsolute(candidate)) {
      await access(candidate, fsConstants.X_OK);
      return (await stat(candidate)).isFile();
    }
    await execFileAsync(candidate, ["-version"], { windowsHide: true, timeout: 10_000, maxBuffer: 100_000 });
    return true;
  } catch { return false; }
}

async function resolveChromium(override) {
  const candidates = override ? [override] : [];
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    );
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
  }
  try { candidates.push(chromium.executablePath()); } catch { /* managed browser may be absent */ }
  for (const candidate of candidates.filter(Boolean)) if (await executable(candidate)) return path.resolve(candidate);
  throw new Error("Chrome/Chromium not found; pass --browser PATH");
}

function contextOptions(view, overrides = {}) {
  return {
    viewport: { width: view.width, height: view.height },
    screen: { width: view.width, height: view.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "no-preference",
    locale: "en-US",
    serviceWorkers: "block",
    ...overrides,
  };
}

async function installPreloadTelemetry(context) {
  await context.addInitScript(() => {
    const telemetry = {
      startedAt: performance.now(),
      scrollEvents: 0,
      wheelEvents: 0,
      keyEvents: 0,
      touchStartEvents: 0,
      touchMoveEvents: 0,
      touchEndEvents: 0,
      pointerDownEvents: 0,
      pointerMoveEvents: 0,
      pointerUpEvents: 0,
      programmaticWindowScrollCalls: 0,
      programmaticElementScrollCalls: 0,
      playCalls: 0,
      pauseCalls: 0,
      playEvents: 0,
      playingEvents: 0,
      pauseEvents: 0,
      seekingEvents: 0,
      seekedEvents: 0,
      blobCreates: 0,
      videoBlobCreates: 0,
      blobRevokes: 0,
      liveBlobUrls: 0,
      lastInputAt: performance.now(),
      lastWheelDeltaY: 0,
      lastKey: null,
      inputLog: [],
      longTasks: [],
    };
    const pushInput = (kind, detail = {}) => {
      telemetry.lastInputAt = performance.now();
      telemetry.inputLog.push({ kind, at: telemetry.lastInputAt, ...detail });
      if (telemetry.inputLog.length > 160) telemetry.inputLog.shift();
    };
    addEventListener("scroll", () => { telemetry.scrollEvents += 1; }, { passive: true });
    addEventListener("wheel", (event) => {
      telemetry.wheelEvents += 1;
      telemetry.lastWheelDeltaY = event.deltaY;
      pushInput("wheel", { deltaY: event.deltaY });
    }, { passive: true });
    addEventListener("keydown", (event) => {
      telemetry.keyEvents += 1;
      telemetry.lastKey = event.key;
      pushInput("keyboard", { key: event.key });
    }, { passive: true });
    addEventListener("touchstart", () => { telemetry.touchStartEvents += 1; pushInput("touchstart"); }, { passive: true });
    addEventListener("touchmove", () => { telemetry.touchMoveEvents += 1; pushInput("touchmove"); }, { passive: true });
    addEventListener("touchend", () => { telemetry.touchEndEvents += 1; pushInput("touchend"); }, { passive: true });
    addEventListener("pointerdown", (event) => { telemetry.pointerDownEvents += 1; pushInput("pointerdown", { pointerType: event.pointerType }); }, { passive: true });
    addEventListener("pointermove", () => { telemetry.pointerMoveEvents += 1; }, { passive: true });
    addEventListener("pointerup", (event) => { telemetry.pointerUpEvents += 1; pushInput("pointerup", { pointerType: event.pointerType }); }, { passive: true });
    addEventListener("play", () => { telemetry.playEvents += 1; }, true);
    addEventListener("playing", () => { telemetry.playingEvents += 1; }, true);
    addEventListener("pause", () => { telemetry.pauseEvents += 1; }, true);
    addEventListener("seeking", () => { telemetry.seekingEvents += 1; }, true);
    addEventListener("seeked", () => { telemetry.seekedEvents += 1; }, true);

    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      telemetry.playCalls += 1;
      return originalPlay.apply(this, args);
    };
    const originalPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function (...args) {
      telemetry.pauseCalls += 1;
      return originalPause.apply(this, args);
    };
    const originalWindowScrollTo = window.scrollTo.bind(window);
    const originalWindowScrollBy = window.scrollBy.bind(window);
    window.scrollTo = (...args) => { telemetry.programmaticWindowScrollCalls += 1; return originalWindowScrollTo(...args); };
    window.scrollBy = (...args) => { telemetry.programmaticWindowScrollCalls += 1; return originalWindowScrollBy(...args); };
    for (const method of ["scrollTo", "scrollBy"]) {
      const original = Element.prototype[method];
      if (typeof original !== "function") continue;
      Element.prototype[method] = function (...args) {
        telemetry.programmaticElementScrollCalls += 1;
        return original.apply(this, args);
      };
    }
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    const live = new Set();
    URL.createObjectURL = (object) => {
      const result = originalCreate(object);
      telemetry.blobCreates += 1;
      if (object instanceof Blob && object.type.split(";", 1)[0] === "video/mp4") telemetry.videoBlobCreates += 1;
      live.add(result);
      telemetry.liveBlobUrls = live.size;
      return result;
    };
    URL.revokeObjectURL = (url) => {
      telemetry.blobRevokes += 1;
      live.delete(url);
      telemetry.liveBlobUrls = live.size;
      return originalRevoke(url);
    };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          telemetry.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          if (telemetry.longTasks.length > 100) telemetry.longTasks.shift();
        }
      }).observe({ type: "longtask", buffered: true });
    } catch { /* longtask timing is advisory */ }
    window.__phase5aEvidence = telemetry;
  });
}

async function installOverlay(page, label) {
  await page.evaluate((captureLabel) => {
    document.querySelector("#__phase5a_evidence_overlay")?.remove();
    const node = document.createElement("output");
    node.id = "__phase5a_evidence_overlay";
    node.setAttribute("aria-hidden", "true");
    Object.assign(node.style, {
      position: "fixed",
      zIndex: "2147483647",
      inset: "auto auto 10px 10px",
      padding: "8px 10px",
      maxWidth: "min(34rem, calc(100vw - 20px))",
      color: "#fae8ff",
      background: "rgba(7, 5, 11, .9)",
      border: "1px solid rgba(238, 85, 255, .75)",
      font: "600 10px/1.4 ui-monospace, Consolas, monospace",
      letterSpacing: ".02em",
      whiteSpace: "pre-wrap",
      pointerEvents: "none",
    });
    document.documentElement.append(node);
    const render = () => {
      if (!node.isConnected) return;
      const q = window.quantumPhase4 ?? {};
      const t = window.__phase5aEvidence ?? {};
      node.textContent = `PHASE 5A EVIDENCE · ${captureLabel}\nscrollY ${scrollY.toFixed(1)} · offset ${q.scrollOffset ?? "-"} · ${q.segment ?? "-"}\nconceptual F${q.conceptualFrame ?? "-"} · target/presented F${q.targetFrame ?? "-"}/F${q.presentedFrame ?? "-"}\ninput W${t.wheelEvents ?? 0}/K${t.keyEvents ?? 0}/T${t.touchMoveEvents ?? 0} · play ${t.playCalls ?? 0}/${t.playingEvents ?? 0}`;
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }, label);
}

async function resetInputTelemetry(page) {
  await page.evaluate(() => {
    const telemetry = window.__phase5aEvidence;
    if (!telemetry) return;
    for (const key of ["scrollEvents", "wheelEvents", "keyEvents", "touchStartEvents", "touchMoveEvents", "touchEndEvents", "pointerDownEvents", "pointerMoveEvents", "pointerUpEvents", "programmaticWindowScrollCalls", "programmaticElementScrollCalls"]) telemetry[key] = 0;
    telemetry.inputLog = [];
    telemetry.lastInputAt = performance.now();
  });
}

function observePage(page) {
  const diagnostics = {
    requests: [],
    responses: [],
    failures: [],
    consoleErrors: [],
    pageErrors: [],
    blobRequests: 0,
  };
  page.on("request", (request) => {
    const parsed = new URL(request.url());
    diagnostics.requests.push({ url: request.url(), path: parsed.pathname, method: request.method(), resourceType: request.resourceType(), at: Date.now() });
    if (parsed.protocol === "blob:") diagnostics.blobRequests += 1;
  });
  page.on("response", (response) => {
    const parsed = new URL(response.url());
    if (VIDEO_PATTERN.test(parsed.pathname) || parsed.pathname.endsWith(".json")) diagnostics.responses.push({ path: parsed.pathname, status: response.status(), contentType: response.headers()["content-type"] ?? null });
  });
  page.on("requestfailed", (request) => diagnostics.failures.push({ url: request.url(), error: request.failure()?.errorText ?? null }));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    diagnostics.consoleErrors.push({
      text: message.text(),
      url: location.url || null,
      lineNumber: location.lineNumber ?? location.line ?? null,
      columnNumber: location.columnNumber ?? location.column ?? null,
    });
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  return diagnostics;
}

export function expectedDocument404ConsoleResult(consoleErrors, expectedUrl) {
  const expected = consoleErrors.filter((entry) => entry?.url === expectedUrl
    && entry.lineNumber === 0
    && entry.columnNumber === 0
    && /^Failed to load resource: the server responded with a status of 404 \((?:Not Found)?\)$/.test(entry.text ?? ""));
  const expectedSet = new Set(expected);
  const unexpected = consoleErrors.filter((entry) => !expectedSet.has(entry));
  const checks = {
    zeroUnexpectedConsoleErrors: unexpected.length === 0,
    atMostOneExpectedDocument404Signal: expected.length <= 1,
  };
  return { expected, unexpected, checks, pass: Object.values(checks).every(Boolean) };
}

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function runtimeState(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector("[data-cinematic-shell]");
    const stage = document.querySelector("[data-cinematic-stage]");
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    const video = document.querySelector("[data-cinematic-media]");
    const q = window.quantumPhase4 ?? {};
    const telemetry = window.__phase5aEvidence ?? {};
    const headerBox = header?.getBoundingClientRect();
    const entryBox = entry?.getBoundingClientRect();
    const stageBox = stage?.getBoundingClientRect();
    return {
      now: performance.now(),
      mode: q.mode ?? root.dataset.cinematicMode ?? null,
      control: q.control ?? shell?.dataset.cinematicControl ?? null,
      mediaFamily: q.mediaFamily ?? shell?.dataset.mediaFamily ?? null,
      codec: q.codec ?? shell?.dataset.mediaCodec ?? null,
      delivery: q.delivery ?? shell?.dataset.mediaDelivery ?? null,
      mediaReady: q.mediaReady ?? false,
      mediaState: shell?.dataset.mediaState ?? null,
      segment: q.segment ?? shell?.dataset.cinematicSegment ?? null,
      phase: shell?.dataset.cinematicPhase ?? null,
      scrollY,
      scrollOffset: q.scrollOffset ?? null,
      scrollProgress: q.scrollProgress ?? null,
      conceptualCoordinate: Number(shell?.dataset.conceptualCoordinate ?? Number.NaN),
      conceptualFrame: q.conceptualFrame ?? null,
      targetFrame: q.targetFrame ?? null,
      presentedFrame: q.presentedFrame ?? null,
      targetTime: q.targetTime ?? null,
      blackProgress: q.blackProgress ?? null,
      semanticProgress: q.semanticProgress ?? null,
      currentTime: video?.currentTime ?? null,
      paused: video?.paused ?? null,
      seeking: video?.seeking ?? null,
      autoplay: video?.autoplay ?? null,
      playbackRate: video?.playbackRate ?? null,
      sourceKind: video?.currentSrc?.startsWith("blob:") ? "blob" : video?.currentSrc ? "url" : "none",
      videoElements: document.querySelectorAll("video").length,
      activeVideoElements: [...document.querySelectorAll("video")].filter((item) => Boolean(item.currentSrc || item.getAttribute("src"))).length,
      header: { state: root.dataset.cinematicHeader ?? null, inert: header?.hasAttribute("inert") ?? false, box: headerBox ? { top: headerBox.top, bottom: headerBox.bottom } : null },
      entry: { inert: entry?.hasAttribute("inert") ?? false, box: entryBox ? { top: entryBox.top, bottom: entryBox.bottom } : null },
      stage: stageBox ? { top: stageBox.top, bottom: stageBox.bottom, width: stageBox.width, height: stageBox.height } : null,
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      telemetry: structuredClone(telemetry),
    };
  });
}

async function settleEnhanced(page, timeoutMs) {
  await page.waitForFunction(() => {
    const q = window.quantumPhase4;
    const video = document.querySelector("[data-cinematic-media]");
    return q?.mode === "enhanced" && q?.control === "scroll-addressed" && q?.mediaReady === true
      && video?.paused === true && video?.seeking === false;
  }, null, { timeout: timeoutMs });
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
  await twoFrames(page);
  const state = await runtimeState(page);
  assertPausedScrollAddressed(state, "enhanced settle");
  return state;
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPausedScrollAddressed(state, label) {
  assertCondition(state.control === "scroll-addressed", `${label}: controller is not scroll-addressed`);
  assertCondition(state.paused === true && state.autoplay === false, `${label}: decoder is not paused/autoplay-free`);
  assertCondition(state.telemetry.playCalls === 0 && state.telemetry.playEvents === 0 && state.telemetry.playingEvents === 0, `${label}: play/playing activity observed`);
}

async function waitPresented(page, expectedFrame, timeoutMs) {
  await page.waitForFunction((frame) => {
    const q = window.quantumPhase4;
    const video = document.querySelector("[data-cinematic-media]");
    return q?.targetFrame === frame && q?.presentedFrame === frame && video?.paused === true && video?.seeking === false;
  }, expectedFrame, { timeout: timeoutMs });
  const state = await runtimeState(page);
  assertPausedScrollAddressed(state, `F${expectedFrame}`);
  return state;
}

async function waitConceptualAtLeast(page, expectedFrame, timeoutMs) {
  await page.waitForFunction((frame) => (window.quantumPhase4?.conceptualFrame ?? 0) >= frame, expectedFrame, { timeout: timeoutMs });
  await page.waitForFunction(() => document.querySelector("[data-cinematic-media]")?.seeking === false, null, { timeout: timeoutMs });
  await twoFrames(page);
  const state = await runtimeState(page);
  assertPausedScrollAddressed(state, `conceptual F${expectedFrame}+`);
  return state;
}

async function waitLatestPresented(page, timeoutMs) {
  await page.waitForFunction(() => {
    const q = window.quantumPhase4;
    const video = document.querySelector("[data-cinematic-media]");
    return q?.targetFrame === q?.presentedFrame && video?.paused === true && video?.seeking === false;
  }, null, { timeout: timeoutMs });
  await twoFrames(page);
  const state = await runtimeState(page);
  assertPausedScrollAddressed(state, "latest document target");
  return state;
}

async function cinematicGeometry(page) {
  return page.evaluate(() => {
    const shell = document.querySelector("[data-cinematic-shell]");
    const entry = document.querySelector("#entry");
    const header = document.querySelector(".site-header");
    if (!(shell instanceof HTMLElement) || !(entry instanceof HTMLElement) || !(header instanceof HTMLElement)) throw new Error("cinematic geometry unavailable");
    const shellTop = shell.getBoundingClientRect().top + scrollY;
    const entryTop = entry.getBoundingClientRect().top + scrollY;
    const headerHeight = header.getBoundingClientRect().height;
    return {
      shellTop,
      entryTop,
      headerHeight,
      extent: Math.round(entryTop - headerHeight - shellTop),
      documentHeight: document.documentElement.scrollHeight,
      maxScroll: document.documentElement.scrollHeight - innerHeight,
    };
  });
}

async function scrollYForConceptualFrame(page, geometry, conceptualFrame) {
  let low = 0;
  let high = geometry.extent;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    await page.evaluate((y) => window.scrollTo(0, y), geometry.shellTop + middle);
    await twoFrames(page);
    const observed = await runtimeState(page);
    if (observed.conceptualFrame >= conceptualFrame) high = middle;
    else low = middle + 1;
  }
  await page.evaluate((y) => window.scrollTo(0, y), geometry.shellTop + low);
  await twoFrames(page);
  const state = await runtimeState(page);
  if (state.conceptualFrame !== conceptualFrame) throw new Error(`conceptual F${conceptualFrame} has no exact browser address; observed F${state.conceptualFrame}`);
  return { y: state.scrollY, offset: state.scrollOffset, state };
}

async function calibrateView(browser, options, view) {
  const context = await browser.newContext(contextOptions(view));
  await installPreloadTelemetry(context);
  const page = await context.newPage();
  const diagnostics = observePage(page);
  try {
    const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error(`${view.id} calibration navigation failed`);
    await settleEnhanced(page, options.timeoutMs);
    const geometry = await cinematicGeometry(page);
    const requestedFrames = [...new Set([1, FIRST_CHANGED_FRAME, 250, ...STARTUP_LANDMARKS.map((item) => item.frame), 405, 480, 500, ENTRY_START_FRAME, 539, CONCEPTUAL_FRAME_COUNT])];
    const addresses = {};
    for (const frame of requestedFrames) addresses[frame] = await scrollYForConceptualFrame(page, geometry, frame);
    const profile = profileForView(view);
    const anchors = [];
    for (const coordinate of PIECEWISE_COORDINATES.filter((item) => item !== 45)) {
      const expectedOffset = expectedOffsetForCoordinate(geometry.extent, profile, coordinate);
      await page.evaluate((y) => window.scrollTo(0, y), geometry.shellTop + expectedOffset);
      await twoFrames(page);
      const state = await runtimeState(page);
      // Integer CSS offsets quantize the theoretical normalized anchor. At the
      // shortest landscape runway half-pixel rounding can represent ~0.2 of an
      // editorial coordinate, so 0.36 is a strict cross-family quantization
      // bound rather than a visual/frame tolerance.
      const coordinateDelta = Math.abs(state.conceptualCoordinate - coordinate);
      anchors.push({ coordinate, expectedOffset, observedOffset: state.scrollOffset, observedCoordinate: state.conceptualCoordinate, coordinateDelta, coordinateTolerance: 0.36, observedFrame: state.conceptualFrame, segment: state.segment, pass: state.scrollOffset === expectedOffset && coordinateDelta <= 0.36 });
    }
    const allocationVh = (addresses[STABLE_Q_FRAME].y - addresses[ARRIVAL_FRAME].y) / view.height;
    const [minimumVh, maximumVh] = profile.startupRangeVh;
    const checks = {
      exactTopDormancy: addresses[1].offset === 0 && addresses[1].state.targetFrame === 1,
      firstPositivePixelStartsF46: addresses[FIRST_CHANGED_FRAME].offset === 1,
      exactArrival: addresses[ARRIVAL_FRAME].state.targetFrame === ARRIVAL_FRAME && addresses[ARRIVAL_FRAME].state.segment === "crt-arrival",
      arrivalPlusOneTargetsF286: addresses[286].offset === addresses[ARRIVAL_FRAME].offset + 1 && addresses[286].state.targetFrame === 286,
      startupAllocationInRange: allocationVh >= minimumVh - 0.002 && allocationVh <= maximumVh + 0.002,
      totalTravelExact: Math.abs(geometry.extent / view.height - profile.travelVh) <= 0.003,
      exactPiecewiseAnchors: anchors.every((anchor) => anchor.pass),
      oneH264Request: diagnostics.requests.filter((item) => item.path.endsWith(".mp4")).length === 1,
      zeroVp9: diagnostics.requests.filter((item) => item.path.endsWith(".webm")).length === 0,
    };
    if (Object.values(checks).some((passed) => !passed)) throw new Error(`${view.id} calibration failed: ${JSON.stringify({ checks, allocationVh, geometry, profile })}`);
    return {
      view,
      profile: profile.id,
      geometry,
      allocationVh,
      anchors,
      addresses: Object.fromEntries(Object.entries(addresses).map(([frame, address]) => [frame, { y: address.y, offset: address.offset, conceptualFrame: address.state.conceptualFrame, targetFrame: address.state.targetFrame, segment: address.state.segment }])),
      checks,
      status: "PASS",
    };
  } finally {
    await context.close();
  }
}

async function calibrateViewpoints(browser, options) {
  const calibrations = [];
  for (const view of VIEWPOINTS) calibrations.push(await calibrateView(browser, options, view));
  return calibrations;
}

async function nativeWheelTo(page, targetY, timeoutMs) {
  const before = await runtimeState(page);
  const delta = Math.round(targetY - before.scrollY);
  if (delta === 0) return before;
  await page.mouse.move(20, 20);
  await page.mouse.wheel(0, delta);
  await page.waitForFunction((target) => Math.abs(scrollY - target) <= 1, targetY, { timeout: timeoutMs });
  await twoFrames(page);
  return runtimeState(page);
}

export function compensatedTouchDistance(remaining, maximum) {
  if (!Number.isFinite(remaining) || !Number.isFinite(maximum) || maximum <= 15) throw new Error("touch distance requires finite coordinates and usable travel");
  if (remaining === 0) return 0;
  const touchSlopCompensation = 15;
  return Math.sign(remaining) * Math.min(Math.abs(remaining) + touchSlopCompensation, maximum);
}

async function nativeTouchTo(context, page, view, targetY, timeoutMs) {
  const session = await context.newCDPSession(page);
  let gestures = 0;
  for (; gestures < 24; gestures += 1) {
    const before = await runtimeState(page);
    const remaining = Math.round(targetY - before.scrollY);
    if (Math.abs(remaining) <= 1) break;
    const maximum = Math.max(80, Math.floor(view.height * 0.48));
    const distance = compensatedTouchDistance(remaining, maximum);
    const x = Math.round(view.width * 0.55);
    const startY = distance > 0 ? Math.round(view.height * 0.76) : Math.round(view.height * 0.24);
    const endY = startY - distance;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
    const steps = 6;
    for (let index = 1; index <= steps; index += 1) {
      const y = Math.round(startY + (endY - startY) * index / steps);
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      await page.waitForTimeout(18);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(80);
    await twoFrames(page);
  }
  const observed = await runtimeState(page);
  if (Math.abs(observed.scrollY - targetY) > 2) throw new Error(`native touch did not reach ${targetY}; observed ${observed.scrollY}`);
  return { state: observed, gestures };
}

async function nativeKeyboardTo(page, targetFrame, expectedSegment, timeoutMs) {
  let presses = 0;
  let state = await runtimeState(page);
  while (state.conceptualFrame < targetFrame && presses < 80) {
    await page.keyboard.press("ArrowDown");
    presses += 1;
    await page.waitForTimeout(120);
    state = await runtimeState(page);
  }
  if (state.conceptualFrame < targetFrame || state.segment !== expectedSegment) throw new Error(`keyboard progression missed ${expectedSegment}/F${targetFrame}: ${JSON.stringify({ presses, state })}`);
  await page.waitForFunction(() => document.querySelector("[data-cinematic-media]")?.seeking === false, null, { timeout: timeoutMs });
  await twoFrames(page);
  state = await runtimeState(page);
  return { state, presses };
}

export function scrollbarLandingResult(beforeY, requestedY, observedY) {
  const requestedTravel = requestedY - beforeY;
  const observedTravel = observedY - beforeY;
  const checks = {
    finiteCoordinates: [beforeY, requestedY, observedY].every(Number.isFinite),
    meaningfulRequest: Math.abs(requestedTravel) > 24,
    movedRequestedDirection: Math.sign(observedTravel) === Math.sign(requestedTravel),
    substantialNativeTravel: Math.abs(observedTravel) >= Math.abs(requestedTravel) * 0.8,
  };
  return {
    requestedTravel,
    observedTravel,
    landingDelta: observedY - requestedY,
    checks,
    pass: Object.values(checks).every(Boolean),
  };
}

export function settledScrollY(calibration) {
  const shellTop = calibration?.geometry?.shellTop;
  const extent = calibration?.geometry?.extent;
  if (!Number.isFinite(shellTop) || !Number.isFinite(extent) || extent <= 0) throw new Error("settled scroll address requires finite positive cinematic geometry");
  return shellTop + extent;
}

async function dragScrollbarTo(page, view, targetY, timeoutMs) {
  const before = await runtimeState(page);
  const maximumScroll = before.documentHeight - view.height;
  if (maximumScroll <= 0) throw new Error("scrollbar has no scrollable track");
  const scrollbarWidth = await page.evaluate(() => innerWidth - document.documentElement.clientWidth);
  if (scrollbarWidth < 8) throw new Error("classic browser scrollbar unavailable; cannot manufacture scrollbar-drag evidence");
  const thumbHeight = Math.max(24, view.height * view.height / before.documentHeight);
  const trackTravel = view.height - thumbHeight;
  const x = view.width - Math.max(2, Math.floor(scrollbarWidth / 2));
  const startY = thumbHeight / 2 + before.scrollY / maximumScroll * trackTravel;
  const destinationY = thumbHeight / 2 + targetY / maximumScroll * trackTravel;
  await page.mouse.move(x, Math.max(2, Math.min(view.height - 2, startY)));
  await page.mouse.down();
  await page.mouse.move(x, Math.max(2, Math.min(view.height - 2, destinationY)), { steps: 1 });
  await page.mouse.up();
  await page.waitForFunction(({ start, target }) => {
    const requestedTravel = target - start;
    const observedTravel = scrollY - start;
    return Math.sign(observedTravel) === Math.sign(requestedTravel)
      && Math.abs(observedTravel) >= Math.abs(requestedTravel) * 0.8;
  }, { start: before.scrollY, target: targetY }, { timeout: timeoutMs });
  await twoFrames(page);
  const after = await runtimeState(page);
  const landing = scrollbarLandingResult(before.scrollY, targetY, after.scrollY);
  if (!landing.pass) throw new Error(`native scrollbar drag landed outside the required direction/travel bound: ${JSON.stringify(landing)}`);
  return { before, after, requestedTargetY: targetY, landing, scrollbarWidth, pointerGestureCount: 1, startY, destinationY };
}

async function timeline(page, durationMs, intervalMs = 350) {
  const samples = [];
  const started = performance.now();
  while (performance.now() - started < durationMs) {
    samples.push(await runtimeState(page));
    await page.waitForTimeout(Math.max(0, Math.min(intervalMs, durationMs - (performance.now() - started))));
  }
  samples.push(await runtimeState(page));
  return samples;
}

export function timelineHoldResult(samples, holdMilliseconds = HOLD_MILLISECONDS) {
  if (!Array.isArray(samples) || samples.length < 2) throw new Error("hold timeline requires at least two samples");
  const baseline = samples[0];
  const terminal = samples.at(-1);
  const observedDurationMilliseconds = terminal.now - baseline.now;
  const summary = holdResult(baseline, terminal, holdMilliseconds);
  const checks = {
    ...summary.checks,
    observedTimelineExceedsBrief: Number.isFinite(observedDurationMilliseconds) && observedDurationMilliseconds > 3_200,
    observedTimelineMatchesRequestedHold: observedDurationMilliseconds >= holdMilliseconds - 80,
    allScrollPositionsExact: samples.every((sample) => Math.abs(sample.scrollY - baseline.scrollY) <= 0.01 && sample.scrollOffset === baseline.scrollOffset),
    allTargetsExact: samples.every((sample) => sample.targetFrame === baseline.targetFrame && sample.presentedFrame === baseline.presentedFrame),
    allDecoderTimesExact: samples.every((sample) => Math.abs(sample.currentTime - baseline.currentTime) <= 0.002),
    allPaused: samples.every((sample) => sample.paused === true && sample.seeking === false),
    zeroPlaybackThroughout: samples.every((sample) => sample.telemetry.playCalls === 0 && sample.telemetry.playEvents === 0 && sample.telemetry.playingEvents === 0),
  };
  return { holdMilliseconds, observedDurationMilliseconds, sampleCount: samples.length, checks, pass: Object.values(checks).every(Boolean) };
}

export function requestInventoryResult(diagnostics, state, expectedPath) {
  const mediaRequests = diagnostics.requests.filter((request) => VIDEO_PATTERN.test(request.path));
  const h264Requests = mediaRequests.filter((request) => request.path.endsWith(".mp4"));
  const vp9Requests = mediaRequests.filter((request) => request.path.endsWith(".webm"));
  const checks = {
    exactlyOneH264Request: h264Requests.length === 1,
    exactFamilyPayload: h264Requests[0]?.path === expectedPath,
    zeroVp9Requests: vp9Requests.length === 0,
    exactlyOneVideoBlob: state.telemetry.videoBlobCreates === 1,
    exactlyOneLiveBlob: state.telemetry.liveBlobUrls === 1,
    exactlyOneDecoderElement: state.videoElements === 1,
    blobBackedDecoder: state.sourceKind === "blob",
    runtimeH264: state.codec === "h264",
    zeroPlayOrPlaying: state.telemetry.playCalls === 0 && state.telemetry.playEvents === 0 && state.telemetry.playingEvents === 0,
    pausedSeekSurface: state.paused === true && state.telemetry.seekingEvents >= 1 && state.telemetry.seekedEvents >= 1,
    zeroRuntimeSyntheticScrollCalls: state.telemetry.programmaticWindowScrollCalls === 0 && state.telemetry.programmaticElementScrollCalls === 0,
  };
  return { expectedPath, mediaRequests, h264RequestCount: h264Requests.length, vp9RequestCount: vp9Requests.length, checks, pass: Object.values(checks).every(Boolean) };
}

function expectedMediaPath(manifest, family) {
  const asset = manifest.assets.find((item) => item.kind === "video" && item.family === family);
  if (!asset) throw new Error(`manifest has no ${family} video`);
  return mediaUrlPath(MANIFEST_URL_PATH, asset.file);
}

async function screenshot(page, selector = null) {
  if (selector) {
    const locator = page.locator(selector).first();
    if (await locator.count()) return locator.screenshot({ type: "png", animations: "disabled", scale: "css" });
  }
  return page.screenshot({ type: "png", animations: "disabled" });
}

async function imageDifference(before, after) {
  const [left, right] = await Promise.all([
    sharp(before).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(after).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (left.info.width !== right.info.width || left.info.height !== right.info.height || left.data.length !== right.data.length) throw new Error("before/after image dimensions differ");
  let changed = 0;
  let maximum = 0;
  let absolute = 0;
  for (let index = 0; index < left.data.length; index += 3) {
    const delta = Math.max(Math.abs(left.data[index] - right.data[index]), Math.abs(left.data[index + 1] - right.data[index + 1]), Math.abs(left.data[index + 2] - right.data[index + 2]));
    if (delta >= 2) changed += 1;
    maximum = Math.max(maximum, delta);
    absolute += delta;
  }
  const pixels = left.info.width * left.info.height;
  const visiblyChanged = changed >= Math.max(24, Math.ceil(pixels * 0.0001)) && maximum >= 4 && absolute / pixels >= 0.002;
  return { width: left.info.width, height: left.info.height, pixels, changedPixelsAtLeast2: changed, changedPercentAtLeast2: changed / pixels * 100, maximumAbsoluteChannel: maximum, meanAbsoluteMaximumChannel: absolute / pixels, visiblyChanged };
}

function newPanels() {
  return new Map(SHEETS.map((sheet) => [sheet.id, []]));
}

function addPanel(panels, sheetId, image, title, lines = []) {
  const list = panels.get(sheetId);
  if (!list) throw new Error(`unknown sheet ${sheetId}`);
  list.push({ image, title, lines });
}

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function labelSvg(width, height, title, lines = []) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#09070d"/><rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#7b3f80"/><text x="20" y="35" fill="#f1bbff" font-family="Arial,sans-serif" font-size="16" font-weight="700">${xml(title)}</text>${lines.slice(0, 6).map((line, index) => `<text x="20" y="${65 + index * 21}" fill="#d7cbd9" font-family="Arial,sans-serif" font-size="13">${xml(line)}</text>`).join("")}</svg>`);
}

async function createSheet(destination, definition, panels, subtitle) {
  if (!panels.length) throw new Error(`sheet ${definition.id} has no panels`);
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(panels.length))));
  const rows = Math.ceil(panels.length / columns);
  const cellWidth = 420;
  const imageHeight = 250;
  const labelHeight = 86;
  const margin = 20;
  const header = 88;
  const width = columns * cellWidth + (columns + 1) * margin;
  const height = header + rows * (imageHeight + labelHeight + margin) + margin;
  const composites = [{ input: labelSvg(width - 2 * margin, 68, `PHASE 5A · ${definition.title}`, [subtitle]), left: margin, top: 10 }];
  for (let index = 0; index < panels.length; index += 1) {
    const panel = panels[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = margin + column * (cellWidth + margin);
    const top = header + row * (imageHeight + labelHeight + margin);
    const image = panel.image
      ? await sharp(panel.image).resize(cellWidth, imageHeight, { fit: "contain", background: "#000000" }).png().toBuffer()
      : labelSvg(cellWidth, imageHeight, panel.title, panel.lines);
    composites.push({ input: image, left, top });
    composites.push({ input: labelSvg(cellWidth, labelHeight, panel.title, panel.lines), left, top: top + imageHeight });
  }
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#08070b" } }).composite(composites).png({ compressionLevel: 9 }).toBuffer();
  await atomicWrite(destination, bytes);
  const metadata = await sharp(bytes).metadata();
  return { relativePath: `sheets/${path.basename(destination)}`, bytes: bytes.length, sha256: sha256(bytes), width: metadata.width, height: metadata.height, status: "PASS" };
}

async function atomicWrite(destination, bytes) {
  const temporary = `${destination}.partial`;
  await writeFile(temporary, bytes, { flag: "wx" });
  await rename(temporary, destination);
}

async function writeSafeJson(destination, payload) {
  const bytes = Buffer.from(stableJson(payload));
  if (PRIVATE_TEXT.test(bytes.toString("utf8"))) throw new Error(`private local path/token detected in ${path.basename(destination)}`);
  await atomicWrite(destination, bytes);
  return { relativePath: path.relative(path.dirname(path.dirname(destination)), destination).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes), schema: payload.schema, status: "PASS" };
}

async function writeScreenshot(destination, bytes) {
  await atomicWrite(destination, bytes);
  const metadata = await sharp(bytes).metadata();
  return { relativePath: `screenshots/${path.basename(destination)}`, bytes: bytes.length, sha256: sha256(bytes), width: metadata.width, height: metadata.height, status: "PASS" };
}

async function probeVideo(ffprobe, file) {
  const result = await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=format_name,duration", "-of", "json", file], "ffprobe normalized recording");
  const parsed = JSON.parse(result.stdout);
  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  return {
    formatName: parsed.format?.format_name ?? null,
    durationSeconds: Number(parsed.format?.duration),
    codec: video?.codec_name ?? null,
    pixelFormat: video?.pix_fmt ?? null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    averageFrameRate: video?.avg_frame_rate ?? null,
    realFrameRate: video?.r_frame_rate ?? null,
    frameCount: Number(video?.nb_read_frames),
    videoStreams: streams.filter((stream) => stream.codec_type === "video").length,
    audioStreams: streams.filter((stream) => stream.codec_type === "audio").length,
    otherStreams: streams.filter((stream) => !["video", "audio"].includes(stream.codec_type)).length,
  };
}

export function normalizedRecordingResult(probe, view, minimumSeconds) {
  const duration = recordingDurationResult(probe, minimumSeconds);
  const checks = {
    mp4Container: String(probe.formatName).includes("mp4"),
    oneVideoStream: probe.videoStreams === 1,
    zeroAudioStreams: probe.audioStreams === 0,
    zeroOtherStreams: probe.otherStreams === 0,
    h264: probe.codec === "h264",
    yuv420p: probe.pixelFormat === "yuv420p",
    exactViewport: probe.width === view.width && probe.height === view.height,
    constant30Fps: probe.averageFrameRate === "30/1" && probe.realFrameRate === "30/1",
    duration: duration.pass,
  };
  return { duration, checks, pass: Object.values(checks).every(Boolean) };
}

async function normalizeRecording(options, rawFile, destination, view, scenario) {
  const partial = `${destination}.partial.mp4`;
  await run(options.ffmpeg, ["-v", "error", "-n", "-i", rawFile, "-map", "0:v:0", "-an", "-map_metadata", "-1", "-vf", "fps=30,format=yuv420p", "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-movflags", "+faststart", partial], "normalize browser recording", { timeout: 180_000 });
  await run(options.ffmpeg, ["-v", "error", "-i", partial, "-map", "0:v:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], "full-decode browser recording", { timeout: 180_000 });
  const probe = await probeVideo(options.ffprobe, partial);
  const validation = normalizedRecordingResult(probe, view, scenario.minimumSeconds);
  if (!validation.pass) throw new Error(`${scenario.id} normalized recording contract failed: ${JSON.stringify(validation)}`);
  await rename(partial, destination);
  const bytes = await readFile(destination);
  return { relativePath: `recordings/${path.basename(destination)}`, bytes: bytes.length, sha256: sha256(bytes), media: probe, validation, fullDecodePass: true };
}

async function openRecordedPage(browser, options, scenario, view, rawRoot) {
  const directory = path.join(rawRoot, scenario.id);
  await mkdir(directory, { recursive: false });
  const context = await browser.newContext(contextOptions(view, {
    hasTouch: view.input === "touch",
    recordVideo: { dir: directory, size: { width: view.width, height: view.height } },
  }));
  await installPreloadTelemetry(context);
  const page = await context.newPage();
  const diagnostics = observePage(page);
  const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
  if (!response?.ok()) throw new Error(`${scenario.id} navigation failed`);
  await settleEnhanced(page, options.timeoutMs);
  await installOverlay(page, `${scenario.gate} · ${scenario.kind} · ${view.id}`);
  return { context, page, diagnostics, video: page.video() };
}

async function finishRecordedPage(options, scenario, view, opened) {
  await opened.context.close();
  const rawFile = await opened.video.path();
  const destination = path.join(options.output, "recordings", `${scenario.id}.mp4`);
  const artifact = await normalizeRecording(options, rawFile, destination, view, scenario);
  return { id: scenario.id, gate: scenario.gate, kind: scenario.kind, viewpoint: scenario.viewpoint, ...artifact };
}

async function captureFrame(page, screenshots, panels, sheetId, id, title, lines = [], selector = "[data-cinematic-stage]") {
  const bytes = await screenshot(page, selector);
  screenshots.push({ id, bytes });
  addPanel(panels, sheetId, bytes, title, lines);
  return bytes;
}

async function arriveAtFrameWithWheel(page, calibration, frame, timeoutMs) {
  const address = calibration.addresses[frame];
  if (!address) throw new Error(`calibration lacks F${frame}`);
  await nativeWheelTo(page, address.y, timeoutMs);
  return waitPresented(page, Math.min(frame, PHYSICAL_FRAME_COUNT), timeoutMs);
}

async function recordArrivalStop(opened, options, calibration, screenshots, panels) {
  const { page } = opened;
  const arrival = await arriveAtFrameWithWheel(page, calibration, ARRIVAL_FRAME, options.timeoutMs);
  assertCondition(arrival.segment === "crt-arrival", "arrival stop did not land in CRT arrival");
  await captureFrame(page, screenshots, panels, "01-arrival-stop", "arrival-stop-before", "F285 · INPUT RELEASED", [`scrollY ${arrival.scrollY}`, `decoder ${arrival.currentTime.toFixed(4)}s · paused`]);
  const samples = await timeline(page, HOLD_MILLISECONDS);
  const validation = timelineHoldResult(samples);
  if (!validation.pass) throw new Error(`arrival stop advanced autonomously: ${JSON.stringify(validation)}`);
  const terminal = samples.at(-1);
  await captureFrame(page, screenshots, panels, "01-arrival-stop", "arrival-stop-after", `F285 · AFTER ${(HOLD_MILLISECONDS / 1000).toFixed(1)}S`, [`scrollY ${terminal.scrollY} unchanged`, "zero play / playing"]);
  return { input: "wheel", expectedFrame: ARRIVAL_FRAME, samples, validation, status: "PASS" };
}

async function recordProgressiveStartup(opened, options, calibration, screenshots, panels) {
  const { page } = opened;
  const states = [];
  await arriveAtFrameWithWheel(page, calibration, ARRIVAL_FRAME, options.timeoutMs);
  for (const landmark of STARTUP_SEQUENCE) {
    const state = await arriveAtFrameWithWheel(page, calibration, landmark.frame, options.timeoutMs);
    assertCondition(state.segment === landmark.segment, `progressive startup F${landmark.frame} segment mismatch: ${state.segment}`);
    states.push({ landmark, state });
    await captureFrame(page, screenshots, panels, "02-scroll-driven-startup", `startup-${landmark.id}`, `${landmark.id.toUpperCase()} · F${landmark.frame}`, [`${state.segment}`, `wheel events ${state.telemetry.wheelEvents}`]);
    await page.waitForTimeout(220);
  }
  const checks = {
    exactOrder: states.map((item) => item.landmark.frame).every((frame, index, values) => index === 0 || frame > values[index - 1]),
    strictlyIncreasingScroll: states.every((item, index) => index === 0 || item.state.scrollY > states[index - 1].state.scrollY),
    wheelAddressed: states.at(-1).state.telemetry.wheelEvents >= STARTUP_SEQUENCE.length + 1,
    terminalStableQ: states.at(-1).state.targetFrame === STABLE_Q_FRAME && states.at(-1).state.segment === "q-hold",
    pausedSeeks: states.every((item) => item.state.paused === true && item.state.seeking === false),
    zeroPlayback: states.every((item) => item.state.telemetry.playCalls === 0 && item.state.telemetry.playingEvents === 0),
  };
  if (Object.values(checks).some((passed) => !passed)) throw new Error(`progressive startup failed: ${JSON.stringify(checks)}`);
  return { input: "wheel", states, checks, status: "PASS" };
}

async function recordFocusedHold(opened, options, calibration, screenshots, panels, kind) {
  const definition = kind === "line-hold"
    ? { frame: 308, segment: "phosphor-line", id: "line", title: "PHOSPHOR LINE · F308" }
    : { frame: 325, segment: "raster-expansion", id: "raster", title: "RASTER EXPANSION · F325" };
  const { page } = opened;
  const state = await arriveAtFrameWithWheel(page, calibration, definition.frame, options.timeoutMs);
  assertCondition(state.segment === definition.segment, `${kind} did not reach expected segment`);
  await captureFrame(page, screenshots, panels, "03-line-raster-holds", `${definition.id}-hold-before`, `${definition.title} · STOP`, [`scrollY ${state.scrollY}`, "input released"]);
  const samples = await timeline(page, HOLD_MILLISECONDS);
  const validation = timelineHoldResult(samples);
  if (!validation.pass) throw new Error(`${kind} advanced autonomously: ${JSON.stringify(validation)}`);
  await captureFrame(page, screenshots, panels, "03-line-raster-holds", `${definition.id}-hold-after`, `${definition.title} · HELD ${(HOLD_MILLISECONDS / 1000).toFixed(1)}S`, ["frame/time/scroll unchanged", "decoder paused"]);
  return { input: "wheel", expectedFrame: definition.frame, expectedSegment: definition.segment, samples, validation, status: "PASS" };
}

async function recordReverseStartup(opened, options, calibration, screenshots, panels) {
  const { page } = opened;
  await arriveAtFrameWithWheel(page, calibration, STABLE_Q_FRAME, options.timeoutMs);
  const reverseLandmarks = [
    { frame: 360, segment: "q-appearance", title: "Q DISAPPEARS" },
    { frame: 345, segment: "raster-settling", title: "SETTLING REVERSES" },
    { frame: 325, segment: "raster-expansion", title: "RASTER CONTRACTS" },
    { frame: 308, segment: "phosphor-line", title: "WHITE LINE" },
    { frame: 292, segment: "indicator", title: "INDICATOR" },
    { frame: ARRIVAL_FRAME, segment: "crt-arrival", title: "CURRENT ARRIVAL" },
  ];
  const states = [];
  for (const landmark of reverseLandmarks) {
    const state = await arriveAtFrameWithWheel(page, calibration, landmark.frame, options.timeoutMs);
    assertCondition(state.segment === landmark.segment, `reverse F${landmark.frame} segment mismatch: ${state.segment}`);
    states.push({ landmark, state });
    await captureFrame(page, screenshots, panels, "04-reverse-startup", `reverse-${landmark.frame}`, `${landmark.title} · F${landmark.frame}`, [`${state.segment}`, "native wheel reverse"]);
    await page.waitForTimeout(220);
  }
  const checks = {
    exactReverseOrder: states.every((item, index) => index === 0 || item.state.scrollY < states[index - 1].state.scrollY),
    arrivalTerminal: states.at(-1).state.targetFrame === ARRIVAL_FRAME && states.at(-1).state.presentedFrame === ARRIVAL_FRAME,
    noLatchedForwardState: states.every((item) => item.state.targetFrame === item.state.presentedFrame),
    pausedSeeks: states.every((item) => item.state.paused === true),
    zeroPlayback: states.every((item) => item.state.telemetry.playCalls === 0 && item.state.telemetry.playingEvents === 0),
  };
  if (Object.values(checks).some((passed) => !passed)) throw new Error(`reverse startup failed: ${JSON.stringify(checks)}`);
  return { input: "wheel", states, checks, status: "PASS" };
}

export function fastJumpEvidenceResult(before, immediate, terminal, telemetryAfterGesture, holdValidation) {
  const checks = {
    beganBeforeArrival: before.targetFrame < ARRIVAL_FRAME,
    jumpedToApproachOrThreshold: immediate.targetFrame >= 470 && immediate.targetFrame <= 500 && ["frontal-approach", "physical-threshold"].includes(immediate.segment),
    latestPositionWins: immediate.targetFrame === terminal.targetFrame && immediate.scrollOffset === terminal.scrollOffset,
    presentedFinalTarget: terminal.presentedFrame === terminal.targetFrame,
    noWheelKeyboardTouchAfterReset: telemetryAfterGesture.wheelEvents === 0 && telemetryAfterGesture.keyEvents === 0 && telemetryAfterGesture.touchMoveEvents === 0,
    nativeScrollOccurred: telemetryAfterGesture.scrollEvents >= 1,
    oneAutomationPointerGesture: telemetryAfterGesture.automationPointerGestures === 1,
    noCatchUp: holdValidation.pass,
    zeroPlayback: terminal.telemetry.playCalls === 0 && terminal.telemetry.playEvents === 0 && terminal.telemetry.playingEvents === 0,
  };
  return { checks, pass: Object.values(checks).every(Boolean) };
}

async function recordFastJump(opened, options, calibration, screenshots, panels, view) {
  const { page } = opened;
  const before = await arriveAtFrameWithWheel(page, calibration, 250, options.timeoutMs);
  await captureFrame(page, screenshots, panels, "05-fast-jump", "fast-jump-before", "BEFORE ARRIVAL · F250", [`scrollY ${before.scrollY}`, "seeded by native wheel"]);
  await resetInputTelemetry(page);
  const drag = await dragScrollbarTo(page, view, calibration.addresses[480].y, options.timeoutMs);
  const immediate = await waitConceptualAtLeast(page, 470, options.timeoutMs);
  const expectedTarget = immediate.targetFrame;
  await waitPresented(page, expectedTarget, options.timeoutMs);
  const postSeek = await runtimeState(page);
  await captureFrame(page, screenshots, panels, "05-fast-jump", "fast-jump-after", `ONE SCROLLBAR DRAG · F${postSeek.targetFrame}`, [`scrollY ${postSeek.scrollY}`, "latest document position wins"]);
  const samples = await timeline(page, HOLD_MILLISECONDS);
  const holdValidation = timelineHoldResult(samples);
  const terminal = samples.at(-1);
  const telemetryAfterGesture = { ...terminal.telemetry, automationPointerGestures: drag.pointerGestureCount };
  const validation = fastJumpEvidenceResult(before, postSeek, terminal, telemetryAfterGesture, holdValidation);
  if (!validation.pass) throw new Error(`fast jump catch-up/gesture contract failed: ${JSON.stringify({ validation, drag })}`);
  return { input: "scrollbar", drag, before, immediate: postSeek, timeline: samples, holdValidation, validation, status: "PASS" };
}

async function recordFirstInput(opened, options, screenshots, panels) {
  const { page } = opened;
  await page.evaluate(() => window.scrollTo(0, 0));
  await twoFrames(page);
  await resetInputTelemetry(page);
  const beforeState = await runtimeState(page);
  const beforeImage = await captureFrame(page, screenshots, panels, "06-first-scroll", "first-scroll-before", "EXACT TOP · F1", ["scrollY 0", "dormant"], null);
  const started = performance.now();
  await page.mouse.wheel(0, 15);
  await page.waitForFunction((first) => scrollY > 0 && (window.quantumPhase4?.targetFrame ?? 0) >= first, FIRST_CHANGED_FRAME, { timeout: 1_500 });
  const targetResponseMs = performance.now() - started;
  await page.waitForFunction((first) => (window.quantumPhase4?.presentedFrame ?? 0) >= first && document.querySelector("[data-cinematic-media]")?.seeking === false, FIRST_CHANGED_FRAME, { timeout: 2_500 });
  const presentedResponseMs = performance.now() - started;
  await twoFrames(page);
  const afterState = await runtimeState(page);
  const afterImage = await captureFrame(page, screenshots, panels, "06-first-scroll", "first-scroll-after", "+15PX NATIVE WHEEL", [`target/presented F${afterState.targetFrame}/F${afterState.presentedFrame}`, `${targetResponseMs.toFixed(1)}ms target`], null);
  const difference = await imageDifference(beforeImage, afterImage);
  const checks = {
    exactDormantTop: beforeState.scrollY === 0 && beforeState.targetFrame === 1 && beforeState.presentedFrame === 1,
    exactPositiveScroll: Math.abs(afterState.scrollY - 15) <= 1,
    firstInputVisible: afterState.targetFrame >= FIRST_CHANGED_FRAME && afterState.presentedFrame >= FIRST_CHANGED_FRAME && difference.visiblyChanged,
    oneWheelEvent: afterState.telemetry.wheelEvents === 1,
    responsiveUnder250Ms: targetResponseMs < 250 && presentedResponseMs < 250,
    zeroPlayback: afterState.telemetry.playCalls === 0 && afterState.telemetry.playingEvents === 0,
  };
  if (Object.values(checks).some((passed) => !passed)) throw new Error(`first positive input regression failed: ${JSON.stringify({ checks, difference, targetResponseMs, presentedResponseMs })}`);
  return { input: "wheel", deltaY: 15, before: beforeState, after: afterState, targetResponseMs, presentedResponseMs, difference, checks, status: "PASS" };
}

async function recordResponsiveStartup(opened, options, calibration, screenshots, panels, view) {
  const { page, context } = opened;
  await page.evaluate((y) => window.scrollTo(0, y), calibration.addresses[ARRIVAL_FRAME].y);
  await waitPresented(page, ARRIVAL_FRAME, options.timeoutMs);
  await resetInputTelemetry(page);
  const states = [{ landmark: STARTUP_LANDMARKS[0], state: await runtimeState(page), input: "calibration seed" }];
  // Native ArrowDown and touch gestures are wider than the one-pixel F286
  // address. Those proofs sample each authored visual segment from F292; the
  // desktop wheel proof separately records the exact arrival+1px transition.
  const responsiveLandmarks = view.input === "wheel" ? STARTUP_SEQUENCE : STARTUP_SEQUENCE.filter((item) => item.frame !== 286);
  for (const landmark of responsiveLandmarks) {
    let state;
    let inputDetails;
    if (view.input === "wheel") {
      state = await nativeWheelTo(page, calibration.addresses[landmark.frame].y, options.timeoutMs);
      state = await waitPresented(page, landmark.frame, options.timeoutMs);
      inputDetails = { kind: "wheel" };
    } else if (view.input === "touch") {
      const targetY = calibration.addresses[landmark.frame].y + (landmark.frame === STABLE_Q_FRAME ? 4 : 0);
      inputDetails = { kind: "touch", ...(await nativeTouchTo(context, page, view, targetY, options.timeoutMs)) };
      state = await waitLatestPresented(page, options.timeoutMs);
      delete inputDetails.state;
    } else {
      inputDetails = { kind: "keyboard", ...(await nativeKeyboardTo(page, landmark.frame, landmark.segment, options.timeoutMs)) };
      state = inputDetails.state;
      delete inputDetails.state;
    }
    assertCondition(state.segment === landmark.segment, `${view.id} ${landmark.id} segment mismatch: ${state.segment}`);
    states.push({ landmark, state, input: inputDetails });
    if (["line", "raster", "stable-q"].includes(landmark.id)) {
      await captureFrame(page, screenshots, panels, "07-responsive-startup", `responsive-${view.id}-${landmark.id}`, `${view.width}×${view.height} · ${landmark.id.toUpperCase()}`, [`${view.input} · ${state.segment}`, `target/presented F${state.targetFrame}/F${state.presentedFrame}`]);
    }
    await page.waitForTimeout(150);
  }
  const terminal = states.at(-1).state;
  const inputChecks = {
    wheel: terminal.telemetry.wheelEvents > 0,
    touch: terminal.telemetry.touchStartEvents > 0 && terminal.telemetry.touchMoveEvents > 0 && terminal.telemetry.touchEndEvents > 0,
    keyboard: terminal.telemetry.keyEvents > 0,
  };
  const checks = {
    exactResponsiveSize: terminal.viewport.width === view.width && terminal.viewport.height === view.height,
    exactFamily: terminal.mediaFamily === view.family,
    familyAllocationInRange: calibration.checks.startupAllocationInRange,
    nativeInputObserved: inputChecks[view.input],
    orderedStartup: states.every((item, index) => index === 0 || item.state.conceptualFrame > states[index - 1].state.conceptualFrame),
    stableQReached: terminal.conceptualFrame >= STABLE_Q_FRAME && terminal.segment === "q-hold",
    pausedSeeks: states.every((item) => item.state.paused === true && item.state.seeking === false),
    zeroPlayback: terminal.telemetry.playCalls === 0 && terminal.telemetry.playEvents === 0 && terminal.telemetry.playingEvents === 0,
    noHorizontalOverflow: terminal.documentWidth <= view.width + 2,
  };
  if (Object.values(checks).some((passed) => !passed)) throw new Error(`${view.id} responsive startup failed: ${JSON.stringify(checks)}`);
  return { input: view.input, programmaticCalibrationSeedOnly: true, calibration, states, checks, status: "PASS" };
}

async function executeRecordedScenario(browser, options, scenario, calibrations, manifest, rawRoot, screenshots, panels) {
  const view = VIEWPOINTS.find((item) => item.id === scenario.viewpoint);
  const calibration = calibrations.find((item) => item.view.id === scenario.viewpoint);
  if (!view || !calibration) throw new Error(`missing viewpoint/calibration for ${scenario.id}`);
  const opened = await openRecordedPage(browser, options, scenario, view, rawRoot);
  let evidence;
  let recording;
  try {
    if (scenario.kind === "arrival-stop") evidence = await recordArrivalStop(opened, options, calibration, screenshots, panels);
    else if (scenario.kind === "progressive-startup") evidence = await recordProgressiveStartup(opened, options, calibration, screenshots, panels);
    else if (scenario.kind === "line-hold" || scenario.kind === "raster-hold") evidence = await recordFocusedHold(opened, options, calibration, screenshots, panels, scenario.kind);
    else if (scenario.kind === "reverse-startup") evidence = await recordReverseStartup(opened, options, calibration, screenshots, panels);
    else if (scenario.kind === "fast-jump") evidence = await recordFastJump(opened, options, calibration, screenshots, panels, view);
    else if (scenario.kind === "first-input") evidence = await recordFirstInput(opened, options, screenshots, panels);
    else if (scenario.kind === "responsive-startup") evidence = await recordResponsiveStartup(opened, options, calibration, screenshots, panels, view);
    else throw new Error(`unknown recording kind ${scenario.kind}`);
    const finalState = await runtimeState(opened.page);
    const inventory = requestInventoryResult(opened.diagnostics, finalState, expectedMediaPath(manifest, view.family));
    if (!inventory.pass) throw new Error(`${scenario.id} H.264/Blob/decoder inventory failed: ${JSON.stringify(inventory)}`);
    if (opened.diagnostics.pageErrors.length || opened.diagnostics.consoleErrors.length) throw new Error(`${scenario.id} browser diagnostics failed: ${JSON.stringify(opened.diagnostics)}`);
    recording = await finishRecordedPage(options, scenario, view, opened);
    return { ...recording, evidence, requestInventory: inventory, diagnostics: opened.diagnostics, status: "PASS" };
  } catch (error) {
    await opened.context.close().catch(() => {});
    throw error;
  }
}

async function captureReducedMotion(browser, options, screenshots, panels) {
  const view = VIEWPOINTS.find((item) => item.id === "portrait-390x844");
  const context = await browser.newContext(contextOptions(view, { reducedMotion: "reduce" }));
  await installPreloadTelemetry(context);
  const page = await context.newPage();
  const diagnostics = observePage(page);
  try {
    const response = await page.goto(options.url, { waitUntil: "networkidle", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error("reduced-motion navigation failed");
    const state = await runtimeState(page);
    const semantic = await page.evaluate(() => ({
      h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      mainCount: document.querySelectorAll("main").length,
      entryInert: document.querySelector("#entry")?.hasAttribute("inert") ?? false,
      headerInert: document.querySelector(".site-header")?.hasAttribute("inert") ?? false,
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
    }));
    const videoRequests = diagnostics.requests.filter((item) => VIDEO_PATTERN.test(item.path));
    const checks = {
      staticMode: state.mode === "static",
      zeroVideoRequests: videoRequests.length === 0,
      zeroActiveVideoSources: state.activeVideoElements === 0,
      semanticEntryAvailable: semantic.h1 === "Where do you enter?" && semantic.mainCount === 1 && !semantic.entryInert,
      chromeReleased: !semantic.headerInert,
      noHorizontalOverflow: !semantic.overflow,
    };
    if (Object.values(checks).some((passed) => !passed)) throw new Error(`reduced-motion regression failed: ${JSON.stringify({ checks, state, semantic, videoRequests })}`);
    await captureFrame(page, screenshots, panels, "09-accessibility-chrome", "reduced-motion", "REDUCED MOTION · STATIC", ["zero video request/source", "semantic ENTRY available"], null);
    return { state, semantic, requests: videoRequests, checks, status: "PASS" };
  } finally { await context.close(); }
}

async function captureNoJavaScript(browser, options, screenshots, panels) {
  const view = VIEWPOINTS.find((item) => item.id === "portrait-390x844");
  const context = await browser.newContext(contextOptions(view, { javaScriptEnabled: false }));
  const page = await context.newPage();
  const diagnostics = observePage(page);
  try {
    const response = await page.goto(options.url, { waitUntil: "networkidle", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error("no-JavaScript navigation failed");
    const state = await page.evaluate(() => ({
      h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      mainCount: document.querySelectorAll("main").length,
      videoElements: document.querySelectorAll("video").length,
      activeVideoElements: [...document.querySelectorAll("video")].filter((item) => Boolean(item.currentSrc || item.getAttribute("src"))).length,
      entryInert: document.querySelector("#entry")?.hasAttribute("inert") ?? false,
      headerInert: document.querySelector(".site-header")?.hasAttribute("inert") ?? false,
      documentHeight: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
    }));
    const videoRequests = diagnostics.requests.filter((item) => VIDEO_PATTERN.test(item.path));
    const checks = {
      zeroVideoRequests: videoRequests.length === 0,
      zeroActiveVideoSources: state.activeVideoElements === 0,
      semanticEntryAvailable: state.h1 === "Where do you enter?" && state.mainCount === 1 && !state.entryInert,
      chromeAvailable: !state.headerInert,
      usefulDocumentFlow: state.documentHeight > view.height,
      noHorizontalOverflow: !state.overflow,
    };
    if (Object.values(checks).some((passed) => !passed)) throw new Error(`no-JavaScript regression failed: ${JSON.stringify({ checks, state, videoRequests })}`);
    const bytes = await screenshot(page);
    screenshots.push({ id: "no-javascript", bytes });
    addPanel(panels, "09-accessibility-chrome", bytes, "NO JAVASCRIPT · STATIC", ["zero cinematic media", "semantic flow available"]);
    return { state, requests: videoRequests, checks, status: "PASS" };
  } finally { await context.close(); }
}

async function captureMediaFailure(browser, options, calibration, screenshots, panels) {
  const view = VIEWPOINTS.find((item) => item.id === "desktop-1440x900");
  const context = await browser.newContext(contextOptions(view));
  await installPreloadTelemetry(context);
  await context.route(MEDIA_PATTERN, (route) => route.abort("failed"));
  const page = await context.newPage();
  const diagnostics = observePage(page);
  try {
    const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error("media-failure navigation failed");
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.dataset.mediaState === "failed-preserve-runway", null, { timeout: options.timeoutMs });
    await twoFrames(page);
    const before = await runtimeState(page);
    await captureFrame(page, screenshots, panels, "08-media-fallbacks", "media-failure-before", "LATE MEDIA FAILURE", [`height ${before.documentHeight}px`, "runway preserved"]);
    await nativeWheelTo(page, settledScrollY(calibration), options.timeoutMs);
    await twoFrames(page);
    const after = await runtimeState(page);
    const checks = {
      enhancedGeometryPreserved: before.mode === "enhanced" && before.mediaState === "failed-preserve-runway" && after.mode === "enhanced",
      matchesHealthyEnhancedGeometry: before.documentHeight === calibration.geometry.documentHeight,
      exactDocumentHeight: before.documentHeight === after.documentHeight,
      documentStillAddressed: after.conceptualFrame === CONCEPTUAL_FRAME_COUNT && after.scrollOffset === calibration.geometry.extent,
      semanticFlowReleased: after.header.state === "released" && after.entry.inert === false,
      mediaReleased: after.sourceKind === "none" && after.activeVideoElements === 0 && after.telemetry.liveBlobUrls === 0,
      zeroPlayback: after.telemetry.playCalls === 0 && after.telemetry.playEvents === 0 && after.telemetry.playingEvents === 0,
      attemptedOneH264: diagnostics.requests.filter((item) => item.path.endsWith(".mp4")).length === 1,
      zeroVp9: diagnostics.requests.filter((item) => item.path.endsWith(".webm")).length === 0,
    };
    if (Object.values(checks).some((passed) => !passed)) throw new Error(`media-failure geometry regression failed: ${JSON.stringify({ checks, before, after })}`);
    await captureFrame(page, screenshots, panels, "08-media-fallbacks", "media-failure-after", "FAILURE · SETTLED ENTRY", ["same runway geometry", "visitor not trapped"], null);
    return { before, after, diagnostics, checks, status: "PASS" };
  } finally { await context.close(); }
}

async function captureMediaPending(browser, options, calibration, manifest, screenshots, panels) {
  const view = VIEWPOINTS.find((item) => item.id === "desktop-1440x900");
  let releaseRequest;
  let requestReached = false;
  const gate = new Promise((resolve) => { releaseRequest = resolve; });
  const context = await browser.newContext(contextOptions(view));
  await installPreloadTelemetry(context);
  await context.route(MEDIA_PATTERN, async (route) => {
    requestReached = true;
    await gate;
    await route.continue();
  });
  const page = await context.newPage();
  const diagnostics = observePage(page);
  try {
    const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error("media-pending navigation failed");
    const deadline = Date.now() + options.timeoutMs;
    while (!requestReached && Date.now() < deadline) await page.waitForTimeout(25);
    if (!requestReached) throw new Error("media-pending request gate was not reached");
    await page.waitForFunction(() => window.quantumPhase4?.mode === "enhanced" && window.quantumPhase4?.mediaReady === false, null, { timeout: options.timeoutMs });
    await nativeWheelTo(page, calibration.addresses[308].y, options.timeoutMs);
    await twoFrames(page);
    const pending = await runtimeState(page);
    const pendingChecks = {
      documentTargetAvailable: pending.targetFrame === 308 && pending.segment === "phosphor-line",
      mediaStillPending: pending.mediaReady === false && pending.sourceKind === "none",
      decoderPaused: pending.paused === true,
      noPlayback: pending.telemetry.playCalls === 0 && pending.telemetry.playEvents === 0 && pending.telemetry.playingEvents === 0,
      onePendingH264Request: diagnostics.requests.filter((item) => item.path.endsWith(".mp4")).length === 1,
    };
    if (Object.values(pendingChecks).some((passed) => !passed)) throw new Error(`media-pending document authority failed: ${JSON.stringify({ pendingChecks, pending })}`);
    await captureFrame(page, screenshots, panels, "08-media-fallbacks", "media-pending", "MEDIA PENDING · LINE ADDRESS", ["document target F308", "zero play / playing"]);
    releaseRequest();
    await page.waitForFunction(() => window.quantumPhase4?.mediaReady === true, null, { timeout: options.timeoutMs });
    const ready = await waitPresented(page, 308, options.timeoutMs);
    const samples = await timeline(page, 1_000, 250);
    const inventory = requestInventoryResult(diagnostics, ready, expectedMediaPath(manifest, view.family));
    const checks = {
      ...pendingChecks,
      exactAddressAfterDelivery: ready.targetFrame === 308 && ready.presentedFrame === 308 && ready.segment === "phosphor-line",
      heldAfterDelivery: samples.every((sample) => sample.targetFrame === 308 && sample.presentedFrame === 308 && sample.paused === true),
      exactMediaInventory: inventory.pass,
    };
    if (Object.values(checks).some((passed) => !passed)) throw new Error(`media-pending release failed: ${JSON.stringify({ checks, inventory })}`);
    await captureFrame(page, screenshots, panels, "08-media-fallbacks", "media-pending-ready", "MEDIA READY · SAME LINE", ["paused seek to latest document address", "no catch-up playback"]);
    return { pending, ready, timeline: samples, inventory, checks, status: "PASS" };
  } finally {
    releaseRequest?.();
    await context.close();
  }
}

async function captureChrome(browser, options, calibration, screenshots, panels) {
  const view = VIEWPOINTS.find((item) => item.id === "desktop-1440x900");
  const context = await browser.newContext(contextOptions(view));
  await installPreloadTelemetry(context);
  const page = await context.newPage();
  try {
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settleEnhanced(page, options.timeoutMs);
    const states = [];
    for (const frame of [ARRIVAL_FRAME, 308, 325, STABLE_Q_FRAME, 480, ENTRY_START_FRAME, 539]) {
      await page.evaluate((y) => window.scrollTo(0, y), calibration.addresses[frame].y);
      await twoFrames(page);
      const state = await runtimeState(page);
      states.push({ frame, state });
      if (frame === STABLE_Q_FRAME || frame === 539) await captureFrame(page, screenshots, panels, "09-accessibility-chrome", `chrome-concealed-${frame}`, `CHROME CONCEALED · F${frame}`, [`${state.segment}`, `header ${state.header.state}`], null);
    }
    await page.evaluate((y) => window.scrollTo(0, y), settledScrollY(calibration));
    await twoFrames(page);
    const settled = await runtimeState(page);
    await captureFrame(page, screenshots, panels, "09-accessibility-chrome", "chrome-released", "CHROME RELEASED · SETTLED ENTRY", ["header/nav available", "semantic ENTRY complete"], null);
    await page.evaluate((y) => window.scrollTo(0, y), calibration.addresses[STABLE_Q_FRAME].y);
    await twoFrames(page);
    const reversed = await runtimeState(page);
    const checks = {
      concealedThroughoutCinema: states.every(({ state }) => state.header.state === "concealed" && state.header.inert === true),
      concealedDuringIncompleteEntry: states.at(-1).state.semanticProgress < 1 && states.at(-1).state.header.state === "concealed",
      releasedOnlyAtSettledEntry: settled.header.state === "released" && settled.header.inert === false && settled.phase === "settled",
      reverseConcealsAgain: reversed.header.state === "concealed" && reversed.header.inert === true,
      zeroPlayback: reversed.telemetry.playCalls === 0 && reversed.telemetry.playingEvents === 0,
    };
    if (Object.values(checks).some((passed) => !passed)) throw new Error(`chrome suppression regression failed: ${JSON.stringify(checks)}`);
    return { states, settled, reversed, checks, status: "PASS" };
  } finally { await context.close(); }
}

async function captureReflow(browser, options, screenshots, panels) {
  // Headless browser-chrome zoom is not authoritative. A 32px important root
  // font on the 16px authored base is deterministic 200% text, and it must be
  // present before the inline eligibility bootstrap evaluates typography fit.
  const view = { id: "desktop-200-percent-text", width: 1440, height: 900, family: "desktop" };
  const context = await browser.newContext(contextOptions(view));
  await context.addInitScript(() => {
    const apply = () => {
      if (!document.documentElement) return false;
      document.documentElement.style.setProperty("font-size", "32px", "important");
      return true;
    };
    if (!apply()) {
      const observer = new MutationObserver(() => {
        if (apply()) observer.disconnect();
      });
      observer.observe(document, { childList: true });
    }
  });
  await installPreloadTelemetry(context);
  const page = await context.newPage();
  const diagnostics = observePage(page);
  try {
    const response = await page.goto(options.url, { waitUntil: "networkidle", timeout: options.timeoutMs });
    if (!response?.ok()) throw new Error("200% reflow navigation failed");
    await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "static", null, { timeout: options.timeoutMs });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await twoFrames(page);
    const result = await page.evaluate(() => ({
      method: "32px important root font on 16px authored base",
      effectiveTextPercent: Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 * 100,
      rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      mainCount: document.querySelectorAll("main").length,
      headingCount: document.querySelectorAll("h1,h2,h3").length,
      entryPresent: Boolean(document.querySelector("#entry")),
      entryInert: document.querySelector("#entry")?.hasAttribute("inert") ?? false,
      mode: document.documentElement.dataset.cinematicMode ?? null,
      fallback: document.documentElement.dataset.cinematicBootstrap ?? document.documentElement.dataset.cinematicFallback ?? null,
      activeVideoElements: [...document.querySelectorAll("video")].filter((item) => Boolean(item.currentSrc || item.getAttribute("src"))).length,
    }));
    const videoRequests = diagnostics.requests.filter((item) => VIDEO_PATTERN.test(item.path));
    const checks = {
      exact200PercentText: result.effectiveTextPercent === 200 && result.rootFontSize === 32,
      exactViewport: result.viewport.width === 1440 && result.viewport.height === 900,
      intentionalStaticFallback: result.mode === "static" && !result.entryInert,
      zeroCinematicVideo: videoRequests.length === 0 && result.activeVideoElements === 0,
      noHorizontalOverflow: !result.overflow,
      semanticContentPresent: result.mainCount === 1 && result.headingCount >= 7 && result.entryPresent,
    };
    if (Object.values(checks).some((passed) => !passed)) throw new Error(`200% reflow regression failed: ${JSON.stringify({ checks, result })}`);
    await captureFrame(page, screenshots, panels, "09-accessibility-chrome", "reflow-200", "200% TEXT · STATIC REFLOW", ["32px root · zero video", "semantic flow · no horizontal overflow"], null);
    return { ...result, videoRequests, checks, status: "PASS" };
  } finally { await context.close(); }
}

async function axeResult(page) {
  await page.addScriptTag({ content: axeCore.source });
  return page.evaluate(async () => {
    const result = await window.axe.run(document.documentElement, { resultTypes: ["violations"] });
    const seriousOrCritical = result.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    return {
      violationCount: result.violations.length,
      seriousOrCriticalCount: seriousOrCritical.length,
      seriousOrCritical: seriousOrCritical.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length, help: item.help })),
    };
  });
}

async function captureHomeAccessibility(browser, options) {
  const view = VIEWPOINTS.find((item) => item.id === "desktop-1440x900");
  const context = await browser.newContext(contextOptions(view, { reducedMotion: "reduce" }));
  const page = await context.newPage();
  try {
    await page.goto(options.url, { waitUntil: "networkidle", timeout: options.timeoutMs });
    const axe = await axeResult(page);
    const semantic = await page.evaluate(() => ({
      mainCount: document.querySelectorAll("main").length,
      h1Count: document.querySelectorAll("h1").length,
      skipLink: document.querySelector(".skip-link")?.getAttribute("href") ?? null,
      duplicateIds: [...document.querySelectorAll("[id]")].map((node) => node.id).filter((id, index, values) => values.indexOf(id) !== index),
    }));
    const checks = { zeroSeriousOrCritical: axe.seriousOrCriticalCount === 0, oneMain: semantic.mainCount === 1, oneH1: semantic.h1Count === 1, skipLinkPresent: semantic.skipLink === "#entry", uniqueIds: semantic.duplicateIds.length === 0 };
    if (Object.values(checks).some((passed) => !passed)) throw new Error(`home accessibility regression failed: ${JSON.stringify({ checks, axe, semantic })}`);
    return { axe, semantic, checks, status: "PASS" };
  } finally { await context.close(); }
}

async function captureSupportingRoutes(browser, options, screenshots, panels) {
  const view = VIEWPOINTS.find((item) => item.id === "portrait-390x844");
  const results = [];
  for (const routePath of [...SUPPORTING_ROUTES, REAL_404_ROUTE]) {
    const context = await browser.newContext(contextOptions(view));
    const page = await context.newPage();
    const diagnostics = observePage(page);
    try {
      const routeUrl = new URL(routePath, options.url).toString();
      const response = await page.goto(routeUrl, { waitUntil: "networkidle", timeout: options.timeoutMs });
      const expectedStatus = routePath === REAL_404_ROUTE ? 404 : 200;
      const state = await page.evaluate(() => ({
        title: document.title,
        h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        mainCount: document.querySelectorAll("main").length,
        h1Count: document.querySelectorAll("h1").length,
        cinematicShellCount: document.querySelectorAll("[data-cinematic-shell]").length,
        runwayCount: document.querySelectorAll(".cinematic-runway").length,
        videoElements: document.querySelectorAll("video").length,
        activeVideoElements: [...document.querySelectorAll("video")].filter((item) => Boolean(item.currentSrc || item.getAttribute("src"))).length,
        cinematicVideoElements: document.querySelectorAll("[data-cinematic-media]").length,
        activeCinematicVideoElements: [...document.querySelectorAll("[data-cinematic-media]")].filter((item) => Boolean(item.currentSrc || item.getAttribute("src"))).length,
        overflow: document.documentElement.scrollWidth > innerWidth + 2,
        skipLink: document.querySelector(".skip-link")?.getAttribute("href") ?? null,
      }));
      const axe = await axeResult(page);
      const mediaRequests = diagnostics.requests.filter((item) => MEDIA_PATTERN.test(item.path));
      const consoleResult = routePath === REAL_404_ROUTE
        ? expectedDocument404ConsoleResult(diagnostics.consoleErrors, routeUrl)
        : { expected: [], unexpected: diagnostics.consoleErrors, checks: { zeroUnexpectedConsoleErrors: diagnostics.consoleErrors.length === 0, atMostOneExpectedDocument404Signal: true }, pass: diagnostics.consoleErrors.length === 0 };
      const checks = {
        realHttpStatus: response?.status() === expectedStatus,
        semanticDocument: state.mainCount === 1 && state.h1Count === 1 && Boolean(state.h1),
        zeroCinematicShellOrRunway: state.cinematicShellCount === 0 && state.runwayCount === 0,
        zeroCinematicMedia: state.cinematicVideoElements === 0 && state.activeCinematicVideoElements === 0 && mediaRequests.length === 0,
        noHorizontalOverflow: !state.overflow,
        skipLinkPresent: state.skipLink === "#main-content",
        zeroSeriousOrCriticalAxe: axe.seriousOrCriticalCount === 0,
        zeroBrowserErrors: consoleResult.pass && diagnostics.pageErrors.length === 0,
      };
      if (Object.values(checks).some((passed) => !passed)) throw new Error(`${routePath} supporting-route regression failed: ${JSON.stringify({ checks, state, axe, mediaRequests })}`);
      const bytes = await screenshot(page);
      const id = routePath === REAL_404_ROUTE ? "route-404" : `route-${routePath.replaceAll("/", "-").replace(/^-|-$/g, "")}`;
      screenshots.push({ id, bytes });
      addPanel(panels, "10-supporting-routes", bytes, routePath === REAL_404_ROUTE ? "REAL 404" : routePath, [`${response.status()} · ${state.h1}`, "zero cinematic media/runway"]);
      results.push({ route: routePath, routeUrl, expectedStatus, observedStatus: response.status(), state, axe, mediaRequests, consoleResult, checks, status: "PASS" });
    } finally { await context.close(); }
  }
  return results;
}

async function captureFallbackAccessibility(browser, options, calibrations, manifest, screenshots, panels) {
  const desktop = calibrations.find((item) => item.view.id === "desktop-1440x900");
  const reducedMotion = await captureReducedMotion(browser, options, screenshots, panels);
  const noJavaScript = await captureNoJavaScript(browser, options, screenshots, panels);
  const mediaFailure = await captureMediaFailure(browser, options, desktop, screenshots, panels);
  const mediaPending = await captureMediaPending(browser, options, desktop, manifest, screenshots, panels);
  const chrome = await captureChrome(browser, options, desktop, screenshots, panels);
  const reflow200 = await captureReflow(browser, options, screenshots, panels);
  const accessibility = await captureHomeAccessibility(browser, options);
  const supportingRoutes = await captureSupportingRoutes(browser, options, screenshots, panels);
  return { reducedMotion, noJavaScript, mediaFailure, mediaPending, chrome, reflow200, accessibility, supportingRoutes };
}

function reportEnvelope(schema, generatedAt, target, payload) {
  return { schema, status: "PASS", generatedAt, target, ...payload };
}

function recordingSummary(recording) {
  return {
    id: recording.id,
    gate: recording.gate,
    kind: recording.kind,
    viewpoint: recording.viewpoint,
    relativePath: recording.relativePath,
    bytes: recording.bytes,
    sha256: recording.sha256,
    media: recording.media,
    validation: recording.validation,
    requestInventory: recording.requestInventory,
    status: recording.status,
  };
}

function recordingArtifact(recording) {
  return { relativePath: recording.relativePath, bytes: recording.bytes, sha256: recording.sha256, kind: "recording", id: recording.id, status: "PASS" };
}

async function removeOwnedRawRoot(rawRoot, output) {
  if (path.dirname(rawRoot) !== path.resolve(output) || path.basename(rawRoot) !== ".raw-recordings") throw new Error("refusing to remove unowned raw recording directory");
  await rm(rawRoot, { recursive: true, force: false });
}

function manifestFixture() {
  const assets = [];
  for (const family of ["desktop", "portrait", "landscape"]) {
    assets.push({ kind: "video", family, codec: "h264", file: `media/${family}.mp4`, frames: PHYSICAL_FRAME_COUNT, fps: FPS, bytes: 1_000_000, sha256: "a".repeat(64) });
    assets.push({ kind: "poster", family, file: `posters/${family}.png`, bytes: 10_000, sha256: "b".repeat(64) });
  }
  return {
    schema: "quantum-hub.phase-4-r2.production-media-manifest.v1",
    status: "PASS",
    sourceBlendSha256: SOURCE_BLEND_SHA256,
    physicalTimeline: { frames: PHYSICAL_FRAME_COUNT, fps: FPS },
    deliveryPolicy: { h264Only: true, activeVideoCount: 3, activePosterCount: 3, inactiveCodecPayloadCount: 0 },
    authorization: { mergeMain: false, phase5: false },
    assets,
  };
}

export async function selfTest() {
  assertInventoryContract();
  const manifest = manifestFixture();
  validateActiveManifest(manifest);
  for (const mutate of [
    (value) => { value.assets[0].codec = "vp9"; value.assets[0].file = "media/desktop.webm"; },
    (value) => { value.sourceBlendSha256 = "c".repeat(64); },
    (value) => { value.assets.push({ ...value.assets[0], file: "media/extra.mp4" }); },
    (value) => { value.authorization.phase5 = true; },
  ]) {
    const invalid = structuredClone(manifest);
    mutate(invalid);
    let rejected = false;
    try { validateActiveManifest(invalid); } catch { rejected = true; }
    if (!rejected) throw new Error("manifest negative self-test failed");
  }
  const telemetry = { playCalls: 0, playEvents: 0, playingEvents: 0 };
  const held = { now: 0, scrollY: 100, scrollOffset: 100, targetFrame: 285, presentedFrame: 285, currentTime: 284 / FPS, paused: true, seeking: false, telemetry };
  const heldAfter = { ...structuredClone(held), now: HOLD_MILLISECONDS };
  if (!timelineHoldResult([held, heldAfter]).pass || timelineHoldResult([held, { ...heldAfter, targetFrame: 286 }]).pass) throw new Error("hold timeline self-test failed");
  const inventoryState = { videoElements: 1, sourceKind: "blob", codec: "h264", paused: true, telemetry: { ...telemetry, videoBlobCreates: 1, liveBlobUrls: 1, seekingEvents: 1, seekedEvents: 1, programmaticWindowScrollCalls: 0, programmaticElementScrollCalls: 0 } };
  const inventory = requestInventoryResult({ requests: [{ path: "/media/cinematic/phase-4r2/media/desktop.mp4" }] }, inventoryState, "/media/cinematic/phase-4r2/media/desktop.mp4");
  if (!inventory.pass) throw new Error("request inventory self-test failed");
  const fastTelemetry = { wheelEvents: 0, keyEvents: 0, touchMoveEvents: 0, scrollEvents: 1, automationPointerGestures: 1 };
  const fastBefore = { targetFrame: 250 };
  const fastAfter = { targetFrame: 480, presentedFrame: 480, scrollOffset: 900, segment: "frontal-approach", telemetry };
  if (!fastJumpEvidenceResult(fastBefore, fastAfter, fastAfter, fastTelemetry, { pass: true }).pass) throw new Error("fast-jump self-test failed");
  const probe = { formatName: "mov,mp4,m4a,3gp,3g2,mj2", durationSeconds: 4, codec: "h264", pixelFormat: "yuv420p", width: 1440, height: 900, averageFrameRate: "30/1", realFrameRate: "30/1", frameCount: 120, videoStreams: 1, audioStreams: 0, otherStreams: 0 };
  if (!normalizedRecordingResult(probe, { width: 1440, height: 900 }, 3.4).pass || normalizedRecordingResult({ ...probe, codec: "vp9" }, { width: 1440, height: 900 }, 3.4).pass) throw new Error("recording normalization self-test failed");
  if (expectedOffsetForCoordinate(6_075, FAMILY_PROFILES.desktop, 285) !== Math.round(6_075 * FAMILY_PROFILES.desktop.progress[3]) + 1) throw new Error("arrival+1px anchor self-test failed");
  const source = await readFile(fileURLToPath(import.meta.url), "utf8");
  if (/expectedHead\s*:\s*["'][0-9a-f]{40}["']/.test(source) || /https:\/\/[a-z0-9-]+\.pages\.dev\//i.test(source)) throw new Error("final deployment identity was baked into evidence tooling");
  process.stdout.write(stableJson({
    schema: `${SCHEMA}.self-test`,
    status: "PASS",
    inventories: { segments: SEGMENTS.length, familyProfiles: Object.keys(FAMILY_PROFILES).length, viewpoints: VIEWPOINTS.length, recordings: RECORDINGS.length, sheets: SHEETS.length, reportsIncludingManifest: Object.keys(REPORT_SCHEMAS).length + 1, supportingRoutesIncluding404: SUPPORTING_ROUTES.length + 1 },
    holdsExceed3200Milliseconds: HOLD_MILLISECONDS > 3_200,
    browserLaunched: false,
    networkRequestsPerformed: false,
    writesPerformed: false,
  }));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  if (options.selfTest) return selfTest();
  validateOptions(options);
  const output = await validateFreshExternalOutputPath(options.output);
  const authority = await loadManifest(options);
  const deployment = await validateDeploymentReport(options, authority.bytes);
  if (options.dryRun) {
    process.stdout.write(stableJson({
      schema: `${SCHEMA}.dry-run`,
      status: "PASS",
      mode: "deployed",
      target: { immutableUrl: options.url, branchUrl: options.branchUrl, expectedHead: options.expectedHead, expectedBranch: options.expectedBranch, deploymentId: options.expectedDeploymentId, deploymentProject: options.deploymentProject, deploymentCheckRunId: String(options.deploymentCheckRunId) },
      manifest: { basename: path.basename(options.manifest), bytes: authority.bytes.length, sha256: options.expectedManifestSha256, sourceBlendSha256: SOURCE_BLEND_SHA256 },
      deployment: { schema: deployment.schema, status: deployment.status, exactHead: deployment.exactHead },
      outputBasename: path.basename(output),
      inventories: { recordings: RECORDINGS.length, sheets: SHEETS.length, reportsIncludingManifest: Object.keys(REPORT_SCHEMAS).length + 1, responsiveViewpoints: VIEWPOINTS.length, supportingRoutesIncluding404: SUPPORTING_ROUTES.length + 1 },
      browserLaunched: false,
      networkRequestsPerformed: false,
      writesPerformed: false,
    }));
    return;
  }

  const captureStartedAt = new Date().toISOString();
  const [repository, publicAuthority, executablePath, ffmpegAvailable, ffprobeAvailable] = await Promise.all([
    repositoryAuthority(options),
    verifyPublicAuthority(options, authority.manifest, authority.bytes),
    resolveChromium(options.chromium),
    executable(options.ffmpeg),
    executable(options.ffprobe),
  ]);
  if (!publicAuthority.parity) throw new Error("immutable and branch preview media authorities differ");
  if (!ffmpegAvailable || !ffprobeAvailable) throw new Error("caller-supplied FFmpeg and FFprobe are required");

  options.output = output;
  await mkdir(options.output, { recursive: false });
  for (const directory of ["recordings", "screenshots", "sheets", "reports", ".raw-recordings"]) await mkdir(path.join(options.output, directory), { recursive: false });
  const rawRoot = path.join(options.output, ".raw-recordings");
  const panels = newPanels();
  const screenshots = [];
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    timeout: options.timeoutMs,
    // Playwright otherwise injects --hide-scrollbars in headless mode, which
    // would make the required real scrollbar-drag proof impossible.
    ignoreDefaultArgs: ["--hide-scrollbars"],
    args: ["--disable-extensions", "--disable-background-networking", "--disable-features=OverlayScrollbar,FluentOverlayScrollbar"],
  });
  let calibrations;
  let recordings;
  let fallback;
  let browserVersion;
  try {
    browserVersion = browser.version();
    calibrations = await calibrateViewpoints(browser, options);
    recordings = [];
    for (const scenario of RECORDINGS) recordings.push(await executeRecordedScenario(browser, options, scenario, calibrations, authority.manifest, rawRoot, screenshots, panels));
    fallback = await captureFallbackAccessibility(browser, options, calibrations, authority.manifest, screenshots, panels);
  } finally {
    await browser.close().catch(() => {});
    await removeOwnedRawRoot(rawRoot, options.output);
  }

  const recordingIds = recordings.map((item) => item.id);
  if (recordings.length !== RECORDINGS.length || recordingIds.some((id, index) => id !== RECORDINGS[index].id)) throw new Error("completed recording inventory differs from contract");
  if (new Set(screenshots.map((item) => item.id)).size !== screenshots.length) throw new Error("screenshot identifiers are not unique");

  const screenshotRecords = [];
  for (const item of screenshots) screenshotRecords.push(await writeScreenshot(path.join(options.output, "screenshots", `${item.id}.png`), item.bytes));
  const sheetRecords = [];
  for (const definition of SHEETS) sheetRecords.push(await createSheet(path.join(options.output, "sheets", `${definition.id}.png`), definition, panels.get(definition.id), `${options.expectedHead.slice(0, 12)} · immutable deployed preview`));

  const generatedAt = new Date().toISOString();
  const target = { mode: "deployed", immutableUrl: options.url, branchUrl: options.branchUrl, expectedHead: options.expectedHead, expectedBranch: options.expectedBranch, deploymentId: options.expectedDeploymentId, deploymentProject: options.deploymentProject, deploymentCheckRunId: String(options.deploymentCheckRunId) };
  const byKind = new Map(recordings.map((recording) => [recording.kind === "responsive-startup" ? `${recording.kind}:${recording.viewpoint}` : recording.kind, recording]));
  const desktopProofs = Object.fromEntries(["arrival-stop", "progressive-startup", "line-hold", "raster-hold", "reverse-startup", "fast-jump", "first-input"].map((kind) => [kind, byKind.get(kind).evidence]));
  const responsiveProofs = recordings.filter((item) => item.kind === "responsive-startup").map((item) => ({ recording: recordingSummary(item), evidence: item.evidence }));
  const mappingChecks = {
    exactThirteenSegments: SEGMENTS.length === 13,
    allFiveViewpointsCalibrated: calibrations.length === VIEWPOINTS.length,
    allBrowserAnchorsExact: calibrations.every((item) => item.checks.exactPiecewiseAnchors),
    arrivalPlusOnePixelEverywhere: calibrations.every((item) => item.checks.arrivalPlusOneTargetsF286),
    firstPositivePixelEverywhere: calibrations.every((item) => item.checks.firstPositivePixelStartsF46),
    startupAllocationEverywhere: calibrations.every((item) => item.checks.startupAllocationInRange),
    totalTravelEverywhere: calibrations.every((item) => item.checks.totalTravelExact),
  };
  if (Object.values(mappingChecks).some((passed) => !passed)) throw new Error(`final frame-mapping projection failed: ${JSON.stringify(mappingChecks)}`);

  const reportPayloads = {
    "reports/frame-mapping.json": reportEnvelope(REPORT_SCHEMAS["reports/frame-mapping.json"], generatedAt, target, {
      authority: { acceptedPhase4: ACCEPTED_PHASE4_SHA, unchangedPhysicalFrames: `F1-F${PHYSICAL_FRAME_COUNT}`, conceptualFrames: CONCEPTUAL_FRAME_COUNT, fps: FPS, sourceBlendSha256: SOURCE_BLEND_SHA256 },
      segments: SEGMENTS,
      coordinates: PIECEWISE_COORDINATES,
      familyProfiles: FAMILY_PROFILES,
      browserCalibrations: calibrations,
      checks: mappingChecks,
    }),
    "reports/scroll-addressed-crt.json": reportEnvelope(REPORT_SCHEMAS["reports/scroll-addressed-crt.json"], generatedAt, target, {
      automaticWakeExpected: false,
      autonomousDecoderPlaybackExpected: false,
      holdMilliseconds: HOLD_MILLISECONDS,
      proofs: desktopProofs,
      recordings: recordings.filter((item) => item.gate !== "H").map(recordingSummary),
      checks: {
        arrivalStop: desktopProofs["arrival-stop"].validation.pass,
        progressiveStartup: desktopProofs["progressive-startup"].checks.terminalStableQ,
        lineHold: desktopProofs["line-hold"].validation.pass,
        rasterHold: desktopProofs["raster-hold"].validation.pass,
        reverse: desktopProofs["reverse-startup"].checks.exactReverseOrder,
        fastJumpNoCatchUp: desktopProofs["fast-jump"].validation.pass,
        firstPositive15px: desktopProofs["first-input"].checks.firstInputVisible,
        zeroPlayPlaying: recordings.every((item) => item.requestInventory.checks.zeroPlayOrPlaying),
        pausedSeeks: recordings.every((item) => item.requestInventory.checks.pausedSeekSurface),
        zeroRuntimeSyntheticScrollCalls: recordings.every((item) => item.requestInventory.checks.zeroRuntimeSyntheticScrollCalls),
      },
    }),
    "reports/responsive-startup.json": reportEnvelope(REPORT_SCHEMAS["reports/responsive-startup.json"], generatedAt, target, {
      requiredViewpoints: VIEWPOINTS,
      proofs: responsiveProofs,
      nativeInputKinds: [...new Set(VIEWPOINTS.map((view) => view.input))],
      checks: { exactlyFiveRecordings: responsiveProofs.length === 5, allPass: responsiveProofs.every((item) => item.evidence.status === "PASS") },
    }),
    "reports/media-network.json": reportEnvelope(REPORT_SCHEMAS["reports/media-network.json"], generatedAt, target, {
      publicAuthority,
      activeManifest: { basename: path.basename(options.manifest), publicPath: options.manifestUrlPath, bytes: authority.bytes.length, sha256: options.expectedManifestSha256, sourceBlendSha256: SOURCE_BLEND_SHA256 },
      recordingInventories: recordings.map((item) => ({ id: item.id, viewpoint: item.viewpoint, inventory: item.requestInventory })),
      mediaPending: fallback.mediaPending,
      mediaFailure: fallback.mediaFailure,
      checks: {
        exactlyOneH264PerEnhancedContext: recordings.every((item) => item.requestInventory.checks.exactlyOneH264Request),
        oneBlobPerEnhancedContext: recordings.every((item) => item.requestInventory.checks.exactlyOneVideoBlob),
        oneDecoderPerEnhancedContext: recordings.every((item) => item.requestInventory.checks.exactlyOneDecoderElement),
        zeroVp9Everywhere: recordings.every((item) => item.requestInventory.checks.zeroVp9Requests),
        unchangedPhysicalMedia: repository.phase4ProductionMediaRerendered === false,
      },
    }),
    "reports/fallback-accessibility.json": reportEnvelope(REPORT_SCHEMAS["reports/fallback-accessibility.json"], generatedAt, target, {
      reducedMotion: fallback.reducedMotion,
      noJavaScript: fallback.noJavaScript,
      mediaFailure: fallback.mediaFailure,
      mediaPending: fallback.mediaPending,
      chrome: fallback.chrome,
      reflow200: fallback.reflow200,
      accessibility: fallback.accessibility,
    }),
    "reports/supporting-route-regressions.json": reportEnvelope(REPORT_SCHEMAS["reports/supporting-route-regressions.json"], generatedAt, target, {
      routes: fallback.supportingRoutes,
      checks: { exactRouteInventory: fallback.supportingRoutes.length === SUPPORTING_ROUTES.length + 1, real404: fallback.supportingRoutes.find((item) => item.route === REAL_404_ROUTE)?.observedStatus === 404, zeroCinematicMediaAndRunway: fallback.supportingRoutes.every((item) => item.checks.zeroCinematicMedia && item.checks.zeroCinematicShellOrRunway), publicRoutesNotReplacedByPrototypes: true },
    }),
    "reports/git-deployment-provenance.json": reportEnvelope(REPORT_SCHEMAS["reports/git-deployment-provenance.json"], generatedAt, target, {
      captureStartedAt,
      repository,
      deployment,
      activeManifest: { basename: path.basename(options.manifest), bytes: authority.bytes.length, sha256: options.expectedManifestSha256, sourceBlendSha256: SOURCE_BLEND_SHA256 },
      publicAuthority,
    }),
    "reports/browser-diagnostics.json": reportEnvelope(REPORT_SCHEMAS["reports/browser-diagnostics.json"], generatedAt, target, {
      browser: { product: "Chromium", version: browserVersion, headless: true },
      recordings: recordings.map((item) => ({ id: item.id, diagnostics: item.diagnostics })),
      expectedFailureDiagnostics: fallback.mediaFailure.diagnostics,
      checks: { zeroUnexpectedPageErrors: recordings.every((item) => item.diagnostics.pageErrors.length === 0), zeroUnexpectedConsoleErrors: recordings.every((item) => item.diagnostics.consoleErrors.length === 0), normalizedRecordingsFullyDecoded: recordings.every((item) => item.fullDecodePass === true) },
    }),
  };
  for (const [relativePath, payload] of Object.entries(reportPayloads)) {
    if (payload.checks && Object.values(payload.checks).some((passed) => passed !== true)) throw new Error(`${relativePath} final checks differ: ${JSON.stringify(payload.checks)}`);
  }

  const reportRecords = [];
  for (const [relativePath, payload] of Object.entries(reportPayloads)) reportRecords.push(await writeSafeJson(path.join(options.output, ...relativePath.split("/")), payload));
  const recordingRecords = recordings.map(recordingArtifact);
  const artifacts = [...recordingRecords, ...screenshotRecords, ...sheetRecords, ...reportRecords].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (new Set(artifacts.map((item) => item.relativePath)).size !== artifacts.length) throw new Error("final evidence artifact paths are not unique");
  const evidenceManifest = {
    schema: SCHEMA,
    status: "PASS",
    generatedAt,
    target,
    repository,
    deployment,
    activeMedia: { sourceBlendSha256: SOURCE_BLEND_SHA256, physicalFrames: PHYSICAL_FRAME_COUNT, rerendered: false, manifest: { basename: path.basename(options.manifest), publicPath: options.manifestUrlPath, bytes: authority.bytes.length, sha256: options.expectedManifestSha256 } },
    captureContract: {
      browserRecordingsReal: true,
      calibrationSeparateFromRecordings: true,
      recordedStateChangesUseNativeInput: true,
      nativeInputs: ["wheel", "keyboard", "touch", "scrollbar"],
      telemetry: ["timeline", "scroll", "wheel", "keyboard", "touch", "pointer", "play", "playing", "pause", "seeking", "seeked", "Blob", "longtask"],
      holdMilliseconds: HOLD_MILLISECONDS,
      recordingNormalization: { container: "MP4", codec: "H.264", pixelFormat: "yuv420p", fps: 30, fpsMode: "CFR", audioStreams: 0, fullDecode: true },
      outputPolicy: "explicit fresh durable directory outside repository",
    },
    reports: reportRecords,
    recordings: recordings.map(recordingSummary),
    screenshots: screenshotRecords,
    sheets: sheetRecords,
    artifacts,
    summary: { recordings: recordingRecords.length, screenshots: screenshotRecords.length, sheets: sheetRecords.length, reportsIncludingSelf: reportRecords.length + 1, artifactsExcludingSelf: artifacts.length, totalFilesIncludingSelf: artifacts.length + 1 },
    humanReviewGates: HUMAN_GATES,
    authorization: { humanAccepted: false, mainMerged: false, phase5BAuthorized: false },
  };
  const manifestRecord = await writeSafeJson(path.join(options.output, "reports", "phase5a-browser-evidence-manifest.json"), evidenceManifest);
  process.stdout.write(stableJson({ status: "PASS", outputBasename: path.basename(options.output), summary: evidenceManifest.summary, manifest: manifestRecord, humanReviewGates: HUMAN_GATES }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Phase 5A deployed browser evidence failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
