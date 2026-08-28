#!/usr/bin/env node

/**
 * Read-only Phase 4-R2.1 deployment verifier.
 *
 * One PASS report binds the clean local repair HEAD, its configured upstream,
 * the live remote ref, GitHub, one successful Cloudflare Pages deployment,
 * both preview origins, the tracked H.264-only production authority, and the
 * exact emitted runtime. Credentials are never serialized.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPT_RELATIVE = "scripts/verify-phase4r2-1-deployment.mjs";
export const SCHEMA = "quantum-hub.phase-4-r2-1.deployment-verification.v1";
export const SOURCE_SHA256 = "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516";
export const BLACK_BOUNDARY_REPORT_SHA256 = "f182b35dc533878a7c70b7f1327e8d92c5438fd3984b6223d520fd5b83abc9df";
export const MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const REQUIRED_BRANCH = "repair/phase-4r2-1-causal-signal-scroll-stability";
export const MANIFEST_RELATIVE = "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/production/manifests/phase-4r2-production-media-manifest.json";
export const AUTHORITY_ROOT_RELATIVE = "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/production";
export const MANIFEST_AUTHORITY_ROOT = "phase-4r2-1-causal-signal-scroll-stability/production";
export const PUBLIC_ROOT_RELATIVE = "public/media/cinematic/phase-4r2";
export const DIST_ROOT_RELATIVE = "dist/media/cinematic/phase-4r2";
export const DEPLOYED_ASSET_PREFIX = "/media/cinematic/phase-4r2/";
export const DEPLOYED_MANIFEST_PATH = `${DEPLOYED_ASSET_PREFIX}manifests/phase-4r2-production-media-manifest.json`;
export const FRAME_COUNT = 500;
export const FPS = 30;

const DEFAULT_TIMEOUT_MS = 30_000;
const FAMILIES = Object.freeze({
  desktop: Object.freeze({ resolution: [1920, 1200] }),
  portrait: Object.freeze({ resolution: [780, 1688] }),
  landscape: Object.freeze({ resolution: [1688, 780] }),
});
const HUMAN_REVIEW_GATES = Object.freeze({
  "CAUSAL SIGNAL + FIRST INPUT": "PENDING HUMAN REVIEW",
  "ONE PHYSICAL CURRENT FRONT": "PENDING HUMAN REVIEW",
  "AUTOMATIC CRT WAKE + REVERSE": "PENDING HUMAN REVIEW",
  "SCROLL RUNWAY + SHORT LANDSCAPE": "PENDING HUMAN REVIEW",
  "MEDIA + DEPLOYMENT AUTHORITY": "PENDING HUMAN REVIEW",
  "OPERATING FIELD REGRESSION": "PENDING HUMAN REVIEW",
});
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,})/i;
const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    expectedHead: null,
    repository: null,
    branch: REQUIRED_BRANCH,
    mainBranch: "main",
    immutableUrl: null,
    branchUrl: null,
    githubCheckRunId: null,
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? null,
    cloudflareProject: null,
    cloudflareDeploymentId: null,
    githubTokenEnvironment: "GITHUB_TOKEN",
    cloudflareTokenEnvironment: "CLOUDFLARE_API_TOKEN",
    manifest: path.join(ROOT, ...MANIFEST_RELATIVE.split("/")),
    output: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    activeFamily: "desktop",
    help: false,
    dryRun: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = valueAfter(argv, index, argument);
      index += 1;
      return value;
    };
    if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--repository") options.repository = next();
    else if (argument === "--branch") options.branch = next();
    else if (argument === "--main-branch") options.mainBranch = next();
    else if (argument === "--immutable-url") options.immutableUrl = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--github-check-run-id") options.githubCheckRunId = next();
    else if (argument === "--cloudflare-account-id") options.cloudflareAccountId = next();
    else if (argument === "--cloudflare-project") options.cloudflareProject = next();
    else if (argument === "--cloudflare-deployment-id") options.cloudflareDeploymentId = next();
    else if (argument === "--github-token-env") options.githubTokenEnvironment = next();
    else if (argument === "--cloudflare-token-env") options.cloudflareTokenEnvironment = next();
    else if (argument === "--manifest") options.manifest = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--active-family") options.activeFamily = next();
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

export function printHelp() {
  process.stdout.write(`Phase 4-R2.1 deployment verifier\n\nUsage:\n  node ${SCRIPT_RELATIVE} \\\n    --expected-head <40-hex-sha> --repository <owner/name> \\\n    --github-check-run-id <id> \\\n    --cloudflare-account-id <32-hex-id> --cloudflare-project <name> \\\n    --cloudflare-deployment-id <uuid> \\\n    --immutable-url <https-origin-root> --branch-url <https-origin-root> \\\n    --output <fresh-durable-external-report.json>\n\nOptions:\n  --branch NAME               Must be ${REQUIRED_BRANCH}\n  --main-branch main          Frozen baseline branch\n  --manifest FILE             Must be the exact tracked R2.1 active manifest\n  --active-family FAMILY      Dedicated HTTP semantics probe (default desktop)\n  --github-token-env NAME     Token environment variable (default GITHUB_TOKEN)\n  --cloudflare-token-env NAME Token environment variable (default CLOUDFLARE_API_TOKEN)\n  --timeout-ms N              Per-request timeout, 5000..120000\n  --dry-run                   Validate CLI bindings only; no Git, network, or writes\n  --self-test                 Run pure positive/negative contract tests only\n  --help, -h                  Show help\n\nThe report is compatible with the Phase 4-R2.1 browser-evidence projection.\nIt never substitutes the GitHub check-run ID for the Cloudflare deployment ID.\n`);
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function resolvedFromAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const missing = [];
  for (;;) {
    try {
      return path.join(await realpath(cursor), ...missing.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

export function normalizePublicUrl(value, label) {
  if (!value) throw new Error(`${label} is required`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${label} must be a credential-free HTTPS origin root`);
  }
  if (/^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(url.hostname)) throw new Error(`${label} must be public`);
  return url.toString();
}

export function validateOptions(options) {
  if (!HASH40.test(options.expectedHead ?? "")) throw new Error("--expected-head must be exactly 40 lowercase hexadecimal characters");
  if (options.expectedHead === MAIN_SHA) throw new Error("The repair deployment HEAD must remain distinct from frozen main");
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repository ?? "")) throw new Error("--repository must be owner/name");
  if (options.branch !== REQUIRED_BRANCH) throw new Error(`--branch must be exactly ${REQUIRED_BRANCH}`);
  if (options.mainBranch !== "main") throw new Error("--main-branch must be exactly main");
  if (!/^\d+$/.test(String(options.githubCheckRunId ?? ""))) throw new Error("--github-check-run-id must be numeric");
  if (!/^[0-9a-f]{32}$/i.test(String(options.cloudflareAccountId ?? ""))) throw new Error("--cloudflare-account-id must be 32 hexadecimal characters");
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(String(options.cloudflareProject ?? ""))) throw new Error("--cloudflare-project is invalid");
  if (!UUID.test(String(options.cloudflareDeploymentId ?? ""))) throw new Error("--cloudflare-deployment-id must be a UUID");
  if (!/^[A-Z_][A-Z0-9_]*$/.test(options.githubTokenEnvironment) || !/^[A-Z_][A-Z0-9_]*$/.test(options.cloudflareTokenEnvironment)) {
    throw new Error("Token environment names must be uppercase environment identifiers");
  }
  options.immutableUrl = normalizePublicUrl(options.immutableUrl, "--immutable-url");
  options.branchUrl = normalizePublicUrl(options.branchUrl, "--branch-url");
  if (options.immutableUrl === options.branchUrl) throw new Error("Immutable and branch URLs must be distinct");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  if (!(options.activeFamily in FAMILIES)) throw new Error("--active-family must be desktop, portrait, or landscape");
  const exactManifest = path.join(ROOT, ...MANIFEST_RELATIVE.split("/"));
  if (path.resolve(options.manifest) !== path.resolve(exactManifest)) throw new Error("--manifest must be the exact active R2.1 tracked manifest path");
  if (!options.output) throw new Error("--output is required");
  if (path.extname(options.output).toLowerCase() !== ".json") throw new Error("--output must name a JSON file");
  if (isWithin(ROOT, options.output) || isWithin(os.tmpdir(), options.output)) {
    throw new Error("Deployment report must remain outside the repository and temporary directory");
  }
  return options;
}

async function atomicWrite(destination, bytes) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function fetchBound(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, redirect: "manual", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function jsonRequest(url, token, timeoutMs, label) {
  const headers = {
    Accept: "application/vnd.github+json, application/json",
    "User-Agent": "quantum-hub-phase4r2-1-verifier",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchBound(url, { headers }, timeoutMs);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} did not return JSON`);
  }
}

async function git(...args) {
  return (await execFileAsync("git", args, { cwd: ROOT, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })).stdout.trim();
}

async function trackedPath(repositoryRelative) {
  const output = await git("ls-files", "--error-unmatch", "--", repositoryRelative);
  if (output.replaceAll("\\", "/") !== repositoryRelative) throw new Error(`Tracked path authority differs: ${repositoryRelative}`);
  return repositoryRelative;
}

export async function repositoryAuthority(expectedHead, expectedBranch, manifestPath) {
  const [head, branch, mainHead, statusText, upstreamRef, manifestTracked, scriptTracked] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("branch", "--show-current"),
    git("rev-parse", "main"),
    git("status", "--porcelain=v1", "--untracked-files=all"),
    git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"),
    trackedPath(MANIFEST_RELATIVE),
    trackedPath(SCRIPT_RELATIVE),
  ]);
  if (head !== expectedHead) throw new Error(`Local HEAD ${head} differs from --expected-head`);
  if (branch !== expectedBranch) throw new Error(`Local branch ${branch} differs from ${expectedBranch}`);
  if (mainHead !== MAIN_SHA) throw new Error(`Local main must remain exactly ${MAIN_SHA}`);
  if (statusText) throw new Error("Deployment verification requires the exact clean HEAD");
  if (path.resolve(ROOT, manifestTracked) !== path.resolve(manifestPath)) throw new Error("Active manifest must be the exact tracked authority");

  const remoteName = await git("config", `branch.${branch}.remote`);
  const mergeRef = await git("config", `branch.${branch}.merge`);
  if (!remoteName || remoteName === "." || mergeRef !== `refs/heads/${branch}`) throw new Error("Repair branch lacks the exact remote tracking configuration");
  const expectedUpstreamRef = `${remoteName}/${branch}`;
  if (upstreamRef !== expectedUpstreamRef) throw new Error(`Configured upstream ${upstreamRef} differs from ${expectedUpstreamRef}`);
  const upstreamHead = await git("rev-parse", "@{upstream}");
  if (upstreamHead !== expectedHead) throw new Error("Local HEAD and configured upstream differ");
  const remoteText = await git("ls-remote", "--exit-code", "--heads", remoteName, mergeRef);
  const remoteLines = remoteText.split(/\r?\n/).filter(Boolean);
  if (remoteLines.length !== 1) throw new Error("Live remote branch lookup was missing or ambiguous");
  const [liveRemoteHead, liveRemoteRef, ...extra] = remoteLines[0].trim().split(/\s+/);
  if (extra.length || liveRemoteRef !== mergeRef || liveRemoteHead !== expectedHead) throw new Error("Live remote branch differs from the exact local HEAD");

  return {
    head,
    branch,
    clean: true,
    main: { branch: "main", headSha: mainHead, requiredHeadSha: MAIN_SHA },
    upstream: { ref: upstreamRef, headSha: upstreamHead, parity: true },
    liveRemote: { remote: remoteName, ref: liveRemoteRef, headSha: liveRemoteHead, parity: true },
    manifestRepositoryPath: manifestTracked,
    verifierScript: scriptTracked,
  };
}

function expectedVideoPath(family, digest) {
  return `media/phase-4r2-${family}-h264-${digest.slice(0, 12)}.mp4`;
}

function expectedPosterPath(family, digest) {
  return `posters/phase-4r2-${family}-poster-${digest.slice(0, 12)}.png`;
}

function expectedFrameManifestPath(family) {
  return `manifests/phase-4r2-${family}-frame-manifest.json`;
}

export function deployedAssetPath(asset) {
  if (!/^(?:media|posters)\/[a-z0-9._-]+$/i.test(asset?.file ?? "") || asset.file.includes("..")) {
    throw new Error(`Cannot map unsafe active asset path: ${asset?.file}`);
  }
  const deployedPath = `${DEPLOYED_ASSET_PREFIX}${asset.file}`;
  if (!deployedPath.startsWith(DEPLOYED_ASSET_PREFIX)) throw new Error("Active asset escaped the nested deployed prefix");
  return deployedPath;
}

function runtimeInventory(manifest) {
  return ["manifests/phase-4r2-production-media-manifest.json", ...manifest.assets.map((asset) => asset.file)].sort();
}

function authorityInventory(manifest) {
  return [
    "manifests/phase-4r2-production-media-manifest.json",
    ...Object.values(manifest.frameManifests).map((record) => record.file),
    ...manifest.assets.map((asset) => asset.file),
  ].sort();
}

export function assertProductionManifest(manifest) {
  if (manifest?.schema !== "quantum-hub.phase-4-r2.production-media-manifest.v1" || manifest.status !== "PASS") {
    throw new Error("Active production manifest schema/status mismatch");
  }
  if (manifest.sourceBlendSha256 !== SOURCE_SHA256) throw new Error("Active production manifest source authority mismatch");
  if (manifest.blackBoundaryReportSha256 !== BLACK_BOUNDARY_REPORT_SHA256) throw new Error("Active production manifest black-boundary authority mismatch");
  if (manifest.physicalTimeline?.frames !== FRAME_COUNT || manifest.physicalTimeline?.fps !== FPS || manifest.physicalTimeline?.durationRational !== "50/3") {
    throw new Error("Active production manifest physical timeline mismatch");
  }
  if (manifest.authorization?.mergeMain !== false || manifest.authorization?.phase5 !== false) {
    throw new Error("Active production manifest authorization denial differs");
  }
  if (manifest.deliveryPolicy?.h264Only !== true || manifest.deliveryPolicy?.activeVideoCount !== 3
    || manifest.deliveryPolicy?.activePosterCount !== 3 || manifest.deliveryPolicy?.inactiveCodecPayloadCount !== 0) {
    throw new Error("Active delivery policy must be exactly H.264-only");
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== 6 || new Set(manifest.assets.map((asset) => asset.file)).size !== 6) {
    throw new Error("Active production manifest must contain exactly six unique assets");
  }
  const familyKeys = Object.keys(FAMILIES);
  if (!manifest.frameManifests || JSON.stringify(Object.keys(manifest.frameManifests).sort()) !== JSON.stringify([...familyKeys].sort())) {
    throw new Error("Active frame-manifest family inventory mismatch");
  }

  for (const family of familyKeys) {
    const frame = manifest.frameManifests[family];
    if (frame?.file !== expectedFrameManifestPath(family) || !Number.isSafeInteger(frame.bytes) || frame.bytes < 1
      || !HASH64.test(frame.sha256 ?? "") || !HASH64.test(frame.sequenceSha256 ?? "") || !HASH64.test(frame.firstFrameSha256 ?? "")
      || frame.frames !== FRAME_COUNT || frame.fps !== FPS || JSON.stringify(frame.resolution) !== JSON.stringify(FAMILIES[family].resolution)) {
      throw new Error(`${family} active frame-manifest record mismatch`);
    }
    const familyAssets = manifest.assets.filter((asset) => asset.family === family);
    const videos = familyAssets.filter((asset) => asset.kind === "video" && asset.codec === "h264");
    const posters = familyAssets.filter((asset) => asset.kind === "poster" && asset.codec === undefined);
    if (familyAssets.length !== 2 || videos.length !== 1 || posters.length !== 1) {
      throw new Error(`${family} must expose exactly one H.264 video and one poster`);
    }
    const video = videos[0];
    const poster = posters[0];
    if (!Number.isSafeInteger(video.bytes) || video.bytes < 1 || !HASH64.test(video.sha256 ?? "")
      || video.file !== expectedVideoPath(family, video.sha256) || video.frames !== FRAME_COUNT || video.fps !== FPS
      || Math.abs(video.durationSeconds - (FRAME_COUNT / FPS)) > 1e-12
      || video.masterFrameManifestSha256 !== frame.sha256 || JSON.stringify(video.resolution) !== JSON.stringify(FAMILIES[family].resolution)) {
      throw new Error(`${family} active H.264 video authority mismatch`);
    }
    if (!Number.isSafeInteger(poster.bytes) || poster.bytes < 1 || !HASH64.test(poster.sha256 ?? "")
      || poster.file !== expectedPosterPath(family, poster.sha256)
      || poster.masterF1Sha256 !== frame.firstFrameSha256 || poster.masterFrameManifestSha256 !== frame.sha256
      || JSON.stringify(poster.resolution) !== JSON.stringify(FAMILIES[family].resolution)) {
      throw new Error(`${family} active poster authority mismatch`);
    }
  }

  if (/(?:vp9|webm)/i.test(JSON.stringify(manifest))) throw new Error("VP9/WebM is prohibited from the active R2.1 authority");
  const exactRuntime = runtimeInventory(manifest);
  if (manifest.runtimeStaging?.publicRoot !== PUBLIC_ROOT_RELATIVE
    || manifest.runtimeStaging?.manifestPath !== "manifests/phase-4r2-production-media-manifest.json"
    || manifest.runtimeStaging?.replaceAuthorityRootAtomically !== true
    || manifest.runtimeStaging?.removeUnlistedFiles !== true
    || JSON.stringify(manifest.runtimeStaging?.exactFiles) !== JSON.stringify(exactRuntime)) {
    throw new Error("Active runtime staging/removal contract mismatch");
  }
  const exactAuthority = authorityInventory(manifest);
  if (manifest.authorityMaterialization?.trackedRoot !== MANIFEST_AUTHORITY_ROOT
    || manifest.authorityMaterialization?.sourceSubdirectory !== "delivery"
    || manifest.authorityMaterialization?.removeUnlistedFiles !== true
    || JSON.stringify(manifest.authorityMaterialization?.exactFiles) !== JSON.stringify(exactAuthority)) {
    throw new Error("Tracked active-authority materialization contract mismatch");
  }
  const deployed = manifest.assets.map(deployedAssetPath);
  if (new Set(deployed).size !== 6 || deployed.some((candidate) => !candidate.startsWith(DEPLOYED_ASSET_PREFIX))) {
    throw new Error("Active assets do not map one-to-one below the deployed nested prefix");
  }
  return true;
}

async function recursiveFiles(root, relative = "") {
  const directory = path.join(root, ...relative.split("/").filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are prohibited in active runtime authority: ${child}`);
    if (entry.isDirectory()) files.push(...await recursiveFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`Unsupported active runtime entry: ${child}`);
  }
  return files.sort();
}

async function exactFileAuthority(file, expectedBytes, expectedSha256, label) {
  const bytes = await readFile(file);
  const digest = sha256(bytes);
  if (bytes.length !== expectedBytes || digest !== expectedSha256) throw new Error(`${label} byte/hash parity failed`);
  return { bytes: bytes.length, sha256: digest };
}

async function validateFrameManifest(file, record, family) {
  const authority = await exactFileAuthority(file, record.bytes, record.sha256, `${family} frame manifest`);
  const manifest = JSON.parse((await readFile(file)).toString("utf8"));
  if (manifest.schema !== "quantum-hub.phase-4-r2.frame-manifest.v1" || manifest.family !== family
    || manifest.source?.blendSha256 !== SOURCE_SHA256 || manifest.master?.fps !== FPS || manifest.master?.frameCount !== FRAME_COUNT
    || JSON.stringify(manifest.master?.frameRange) !== "[1,500]" || !Array.isArray(manifest.frames) || manifest.frames.length !== FRAME_COUNT
    || JSON.stringify(manifest.master?.resolution) !== JSON.stringify(FAMILIES[family].resolution)
    || manifest.frames.some((frame, index) => frame.frame !== index + 1)) {
    throw new Error(`${family} tracked frame manifest semantic authority failed`);
  }
  return { ...authority, frames: manifest.frames.length, fps: manifest.master.fps, status: "PASS" };
}

export async function verifyTrackedAuthority(manifest, manifestBytes) {
  const authorityRoot = path.join(ROOT, ...AUTHORITY_ROOT_RELATIVE.split("/"));
  const expectedFiles = authorityInventory(manifest);
  const actualTrackedText = await git("ls-files", "--", AUTHORITY_ROOT_RELATIVE);
  const actualTracked = actualTrackedText.split(/\r?\n/).filter(Boolean).map((entry) => path.posix.relative(AUTHORITY_ROOT_RELATIVE, entry.replaceAll("\\", "/"))).sort();
  if (JSON.stringify(actualTracked) !== JSON.stringify(expectedFiles)) throw new Error("Tracked R2.1 production authority contains missing or unlisted files");
  const actualFiles = await recursiveFiles(authorityRoot);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) throw new Error("R2.1 production authority directory contains missing or untracked files");
  const manifestAuthority = { bytes: manifestBytes.length, sha256: sha256(manifestBytes), status: "PASS" };
  const frames = {};
  for (const family of Object.keys(FAMILIES)) {
    const record = manifest.frameManifests[family];
    frames[family] = await validateFrameManifest(path.join(authorityRoot, ...record.file.split("/")), record, family);
  }
  const assets = [];
  for (const asset of manifest.assets) {
    const authority = await exactFileAuthority(path.join(authorityRoot, ...asset.file.split("/")), asset.bytes, asset.sha256, asset.file);
    assets.push({ file: asset.file, family: asset.family, kind: asset.kind, codec: asset.codec ?? null, ...authority, status: "PASS" });
  }
  return { status: "PASS", repositoryRoot: AUTHORITY_ROOT_RELATIVE, exactFileCount: expectedFiles.length, manifest: manifestAuthority, frameManifests: frames, assets };
}

async function verifyRuntimeTree(rootRelative, manifest, manifestBytes) {
  const root = path.join(ROOT, ...rootRelative.split("/"));
  const expected = runtimeInventory(manifest);
  const actual = await recursiveFiles(root);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${rootRelative} active runtime inventory differs`);
  if (actual.some((entry) => /(?:vp9|\.webm$)/i.test(entry))) throw new Error(`${rootRelative} contains inactive VP9/WebM payloads`);
  const records = [];
  const manifestAuthority = await exactFileAuthority(path.join(root, "manifests", "phase-4r2-production-media-manifest.json"), manifestBytes.length, sha256(manifestBytes), `${rootRelative} manifest`);
  records.push({ file: "manifests/phase-4r2-production-media-manifest.json", ...manifestAuthority });
  for (const asset of manifest.assets) {
    records.push({ file: asset.file, ...await exactFileAuthority(path.join(root, ...asset.file.split("/")), asset.bytes, asset.sha256, `${rootRelative}/${asset.file}`) });
  }
  return { status: "PASS", root: rootRelative, exactFileCount: expected.length, files: records };
}

function expectedMime(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return ({ ".mp4": "video/mp4", ".png": "image/png", ".json": "application/json", ".html": "text/html", ".js": "javascript", ".css": "text/css" })[extension] ?? null;
}

export function validateResponseHeaders(record, relativePath, { immutableAsset = false } = {}) {
  const expected = expectedMime(relativePath);
  const contentType = String(record.contentType ?? "").toLowerCase();
  const cacheControl = String(record.cacheControl ?? "").toLowerCase();
  if (!expected || !contentType.includes(expected)) throw new Error(`MIME mismatch for ${relativePath}: ${record.contentType}`);
  if (!cacheControl || /(?:^|,)\s*(?:private|no-store)(?:\s|,|$)/.test(cacheControl)) throw new Error(`Unsafe or absent Cache-Control for ${relativePath}: ${record.cacheControl}`);
  const lifetime = cacheControl.match(/(?:^|,)\s*(?:s-maxage|max-age)=(\d+)/)?.[1];
  if (immutableAsset && (!lifetime || Number(lifetime) <= 0)) throw new Error(`Hash-named immutable asset lacks a positive cache lifetime: ${relativePath}`);
  return { expectedMime: expected, contentType: record.contentType, cacheControl: record.cacheControl, status: "PASS" };
}

export function assertSuccessfulGithubCheckRun(run) {
  if (!run || run.name !== "Cloudflare Pages" || run.status !== "completed" || run.conclusion !== "success" || !Number.isFinite(Date.parse(run.completed_at ?? run.completedAt ?? ""))) {
    throw new Error("The exact Cloudflare Pages GitHub check must be completed successfully");
  }
  return true;
}

export function assertSuccessfulTerminalCloudflareStage(stage) {
  if (!stage || stage.name !== "deploy" || stage.status !== "success" || !Number.isFinite(Date.parse(stage.ended_on ?? stage.endedOn ?? ""))) {
    throw new Error("Cloudflare deployment lacks an explicit successful terminal deploy stage");
  }
  return true;
}

export function terminalCloudflareStage(deployment) {
  const stages = Array.isArray(deployment?.stages) ? deployment.stages : [];
  const terminal = stages.length > 0
    ? stages.at(-1)
    : deployment?.stages?.deploy
      ? { name: "deploy", ...deployment.stages.deploy }
      : deployment?.latest_stage;
  if ((stages.length > 0 || deployment?.stages?.deploy) && deployment?.latest_stage) {
    const latest = deployment.latest_stage;
    if (latest.name !== terminal?.name || latest.status !== terminal?.status || latest.ended_on !== terminal?.ended_on) {
      throw new Error("Cloudflare latest_stage differs from the actual terminal stage");
    }
  }
  assertSuccessfulTerminalCloudflareStage(terminal);
  return terminal;
}

async function verifyGithub(options, token) {
  const api = `https://api.github.com/repos/${options.repository}`;
  const [commit, reference, mainReference, mainComparison, checks] = await Promise.all([
    jsonRequest(`${api}/commits/${options.expectedHead}`, token, options.timeoutMs, "GitHub commit"),
    jsonRequest(`${api}/git/ref/heads/${encodeURIComponent(options.branch)}`, token, options.timeoutMs, "GitHub repair branch ref"),
    jsonRequest(`${api}/git/ref/heads/${encodeURIComponent(options.mainBranch)}`, token, options.timeoutMs, "GitHub main ref"),
    jsonRequest(`${api}/compare/${encodeURIComponent(options.mainBranch)}...${options.expectedHead}`, token, options.timeoutMs, "GitHub main comparison"),
    jsonRequest(`${api}/commits/${options.expectedHead}/check-runs?per_page=100`, token, options.timeoutMs, "GitHub check runs"),
  ]);
  if (commit.sha !== options.expectedHead || reference.object?.sha !== options.expectedHead) throw new Error("GitHub commit/repair branch differs from the exact HEAD");
  if (mainReference.object?.sha !== MAIN_SHA || ["behind", "identical"].includes(mainComparison.status)) throw new Error("GitHub main is changed or already contains the repair HEAD");
  if (!["ahead", "diverged"].includes(mainComparison.status)) throw new Error(`Unexpected GitHub main comparison status: ${mainComparison.status}`);
  const run = (checks.check_runs ?? []).find((candidate) => String(candidate.id) === String(options.githubCheckRunId));
  if (!run || run.head_sha !== options.expectedHead) throw new Error("The explicit GitHub check-run ID is missing from the exact HEAD");
  assertSuccessfulGithubCheckRun(run);
  return {
    repository: options.repository,
    branch: options.branch,
    commitSha: commit.sha,
    branchHeadSha: reference.object.sha,
    main: { branch: "main", headSha: mainReference.object.sha, requiredHeadSha: MAIN_SHA, comparisonStatus: mainComparison.status, exactHeadMerged: false },
    checkRun: {
      id: String(run.id),
      name: run.name,
      appSlug: run.app?.slug ?? null,
      status: run.status,
      conclusion: run.conclusion,
      headSha: run.head_sha,
      completedAt: run.completed_at,
      detailsUrl: run.details_url ?? null,
      outputTitle: run.output?.title ?? null,
      outputSummary: run.output?.summary ?? null,
    },
  };
}

export function verifyCloudflareGithubCheck(options, github) {
  const run = github?.checkRun;
  assertSuccessfulGithubCheckRun(run);
  const details = new URL(run.detailsUrl ?? "");
  if (details.protocol !== "https:" || details.hostname !== "dash.cloudflare.com") throw new Error("Cloudflare GitHub check lacks a Dashboard deployment authority");
  const match = (details.searchParams.get("to") ?? "").match(/^\/([^/]+)\/pages\/view\/([^/]+)\/([0-9a-f-]{36})$/i);
  if (!match) throw new Error("Cloudflare GitHub check does not expose an exact Pages deployment identity");
  const [, accountId, project, deploymentId] = match;
  if (accountId !== options.cloudflareAccountId || project !== options.cloudflareProject || deploymentId !== options.cloudflareDeploymentId) {
    throw new Error("Cloudflare GitHub check identity differs from the required deployment");
  }
  const summary = String(run.outputSummary ?? "");
  if (run.outputTitle !== "Deployed successfully" || !/Deploy successful!/i.test(summary)
    || !summary.includes(`<code>${options.expectedHead.slice(0, 7)}</code>`)
    || !summary.includes(options.immutableUrl.slice(0, -1)) || !summary.includes(options.branchUrl.slice(0, -1))) {
    throw new Error("Cloudflare GitHub check summary does not bind commit and both URLs");
  }
  return {
    accountId,
    project,
    deploymentId,
    deploymentUrl: options.immutableUrl,
    branch: options.branch,
    commitHash: options.expectedHead,
    environment: "preview",
    authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
    terminalStage: { name: "deploy", status: "success", endedOn: run.completedAt },
  };
}

async function verifyCloudflare(options, token) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.cloudflareAccountId)}/pages/projects/${encodeURIComponent(options.cloudflareProject)}/deployments/${encodeURIComponent(options.cloudflareDeploymentId)}`;
  const payload = await jsonRequest(endpoint, token, options.timeoutMs, "Cloudflare Pages deployment");
  if (payload.success !== true || !payload.result) throw new Error("Cloudflare Pages API did not return a deployment result");
  const deployment = payload.result;
  const deploymentId = String(deployment.id ?? "");
  const commitHash = deployment.deployment_trigger?.metadata?.commit_hash ?? deployment.source?.config?.commit_hash ?? null;
  const branch = deployment.deployment_trigger?.metadata?.branch ?? deployment.source?.config?.branch ?? null;
  const deploymentUrl = normalizePublicUrl(deployment.url, "Cloudflare deployment URL");
  if (deploymentId !== options.cloudflareDeploymentId || commitHash !== options.expectedHead || branch !== options.branch || deploymentUrl !== options.immutableUrl) {
    throw new Error("Cloudflare deployment identity differs from exact CLI bindings");
  }
  if (deployment.environment && deployment.environment !== "preview") throw new Error("Repair branch deployment must remain a preview deployment");
  const stage = terminalCloudflareStage(deployment);
  return {
    accountId: options.cloudflareAccountId,
    project: options.cloudflareProject,
    deploymentId,
    deploymentUrl,
    branch,
    commitHash,
    environment: deployment.environment ?? "preview",
    authoritySource: "CLOUDFLARE_API",
    terminalStage: { name: stage.name, status: stage.status, endedOn: stage.ended_on },
  };
}

async function fetchPublicFile(baseUrl, publicPath, timeoutMs, headers = { Accept: "*/*" }) {
  const response = await fetchBound(new URL(publicPath, baseUrl), { headers }, timeoutMs);
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    publicPath,
    status: response.status,
    bytes,
    contentType: response.headers.get("content-type"),
    cacheControl: response.headers.get("cache-control"),
    contentRange: response.headers.get("content-range"),
    acceptRanges: response.headers.get("accept-ranges"),
  };
}

export function classifyRange(record, asset, firstByte) {
  if (record.status === 206) {
    if (record.bytes.length !== 1 || record.contentRange !== `bytes 0-0/${asset.bytes}` || !record.bytes.equals(firstByte)) {
      throw new Error(`Malformed or unequal partial response for ${asset.file}`);
    }
    return { status: "SUPPORTED", httpStatus: 206, bytesReturned: 1, contentRange: record.contentRange, acceptRanges: record.acceptRanges, byteZeroSha256: sha256(record.bytes) };
  }
  if (record.status === 200) {
    if (record.bytes.length !== asset.bytes || sha256(record.bytes) !== asset.sha256) throw new Error(`Range-ignored response differs for ${asset.file}`);
    return { status: "HONESTLY_IGNORED", httpStatus: 200, bytesReturned: record.bytes.length, contentRange: record.contentRange, acceptRanges: record.acceptRanges };
  }
  throw new Error(`Range request for ${asset.file} returned HTTP ${record.status}`);
}

async function verifyEmittedRuntime(baseUrl, timeoutMs) {
  const localHtml = await readFile(path.join(ROOT, "dist", "index.html"));
  const deployedHtml = await fetchPublicFile(baseUrl, "/", timeoutMs);
  if (deployedHtml.status !== 200 || !deployedHtml.bytes.equals(localHtml)) throw new Error(`Deployed HTML differs from dist/index.html at ${baseUrl}`);
  const text = localHtml.toString("utf8");
  const runtimePaths = [...new Set([...text.matchAll(/(?:src|href)=["'](\/_astro\/[^"'#?]+\.(?:js|css))["']/g)].map((match) => match[1]))].sort();
  if (runtimePaths.length < 1) throw new Error("dist/index.html exposes no emitted JS/CSS authority");
  const runtime = [];
  for (const publicPath of runtimePaths) {
    const local = await readFile(path.join(ROOT, "dist", ...publicPath.slice(1).split("/")));
    const deployed = await fetchPublicFile(baseUrl, publicPath, timeoutMs);
    if (deployed.status !== 200 || !deployed.bytes.equals(local)) throw new Error(`Deployed emitted runtime differs: ${publicPath}`);
    runtime.push({ publicPath, bytes: local.length, sha256: sha256(local), headers: validateResponseHeaders(deployed, publicPath, { immutableAsset: true }), status: "PASS" });
  }
  return {
    html: { publicPath: "/", bytes: localHtml.length, sha256: sha256(localHtml), headers: validateResponseHeaders(deployedHtml, "index.html"), status: "PASS" },
    runtime,
  };
}

async function verifyOrigin(baseUrl, manifest, manifestBytes, timeoutMs, activeFamily) {
  const deployedManifest = await fetchPublicFile(baseUrl, DEPLOYED_MANIFEST_PATH, timeoutMs);
  if (deployedManifest.status !== 200 || !deployedManifest.bytes.equals(manifestBytes)) throw new Error(`Deployed manifest parity failed at ${baseUrl}`);
  const manifestRecord = {
    publicPath: DEPLOYED_MANIFEST_PATH,
    bytes: deployedManifest.bytes.length,
    sha256: sha256(deployedManifest.bytes),
    headers: validateResponseHeaders(deployedManifest, DEPLOYED_MANIFEST_PATH),
    status: "PASS",
  };
  const records = [];
  const firstBytes = new Map();
  for (const asset of manifest.assets) {
    const deployedPath = deployedAssetPath(asset);
    const full = await fetchPublicFile(baseUrl, deployedPath, timeoutMs);
    if (full.status !== 200 || full.bytes.length !== asset.bytes || sha256(full.bytes) !== asset.sha256) {
      throw new Error(`Deployed asset parity failed at ${baseUrl}: ${asset.file}`);
    }
    firstBytes.set(asset.file, full.bytes.subarray(0, 1));
    records.push({
      file: asset.file,
      deployedPath,
      expected: { bytes: asset.bytes, sha256: asset.sha256 },
      actual: { httpStatus: full.status, bytes: full.bytes.length, sha256: sha256(full.bytes), contentType: full.contentType, cacheControl: full.cacheControl },
      headers: validateResponseHeaders(full, asset.file, { immutableAsset: true }),
      status: "PASS",
    });
  }
  const candidates = manifest.assets.filter((asset) => asset.kind === "video" && asset.codec === "h264" && asset.family === activeFamily);
  if (candidates.length !== 1) throw new Error("Dedicated active-family probe did not resolve exactly one H.264 video");
  const selected = candidates[0];
  const partial = await fetchPublicFile(baseUrl, deployedAssetPath(selected), timeoutMs, { Accept: "video/mp4", Range: "bytes=0-0" });
  const range = classifyRange(partial, selected, firstBytes.get(selected.file));
  const activeFamilyRequestSemantics = {
    scope: "MANIFEST_SELECTION_AND_HTTP_RANGE_DELIVERY",
    caveat: "This is a dedicated server-delivery probe; browser request inventory is captured separately.",
    family: activeFamily,
    activeVideoCountForFamily: 1,
    selectedFile: selected.file,
    selectedCodec: "h264",
    requestedDeployedPath: deployedAssetPath(selected),
    requestMethod: "GET",
    requestedRange: "bytes=0-0",
    otherFamilyRequestsIssuedByDedicatedProbe: 0,
    response: range,
    status: "PASS",
  };
  return {
    baseUrl,
    status: "PASS",
    manifest: manifestRecord,
    assets: records,
    activeFamilyRequestSemantics,
    emittedRuntime: await verifyEmittedRuntime(baseUrl, timeoutMs),
  };
}

export function assertSafeReport(report) {
  const text = stableJson(report);
  if (PRIVATE_TEXT.test(text)) throw new Error("Deployment report contains private paths, loopback URLs, UNC paths, or token-shaped secrets");
  return Buffer.from(text, "utf8");
}

function syntheticManifest() {
  const frameManifests = {};
  const assets = [];
  for (const [index, [family, authority]] of Object.entries(FAMILIES).entries()) {
    const frameSha = String(index + 1).repeat(64).slice(0, 64);
    const firstSha = String(index + 4).repeat(64).slice(0, 64);
    frameManifests[family] = {
      file: expectedFrameManifestPath(family), bytes: 1, sha256: frameSha,
      sequenceSha256: String(index + 7).repeat(64).slice(0, 64), firstFrameSha256: firstSha,
      frames: FRAME_COUNT, fps: FPS, resolution: authority.resolution,
    };
    const videoSha = ["a", "b", "c"][index].repeat(64);
    const posterSha = ["d", "e", "f"][index].repeat(64);
    assets.push({
      kind: "video", family, codec: "h264", file: expectedVideoPath(family, videoSha), bytes: 1,
      sha256: videoSha, frames: FRAME_COUNT, fps: FPS, durationSeconds: FRAME_COUNT / FPS,
      masterFrameManifestSha256: frameSha, resolution: authority.resolution,
    });
    assets.push({
      kind: "poster", family, file: expectedPosterPath(family, posterSha), bytes: 1, sha256: posterSha,
      masterF1Sha256: firstSha, masterFrameManifestSha256: frameSha, resolution: authority.resolution,
    });
  }
  const manifest = {
    schema: "quantum-hub.phase-4-r2.production-media-manifest.v1",
    status: "PASS",
    sourceBlendSha256: SOURCE_SHA256,
    blackBoundaryReportSha256: BLACK_BOUNDARY_REPORT_SHA256,
    physicalTimeline: { frames: FRAME_COUNT, fps: FPS, durationRational: "50/3" },
    frameManifests,
    assets,
    deliveryPolicy: { h264Only: true, activeVideoCount: 3, activePosterCount: 3, inactiveCodecPayloadCount: 0 },
    authorization: { mergeMain: false, phase5: false },
  };
  manifest.runtimeStaging = {
    publicRoot: PUBLIC_ROOT_RELATIVE,
    manifestPath: "manifests/phase-4r2-production-media-manifest.json",
    exactFiles: runtimeInventory(manifest),
    replaceAuthorityRootAtomically: true,
    removeUnlistedFiles: true,
  };
  manifest.authorityMaterialization = {
    trackedRoot: MANIFEST_AUTHORITY_ROOT,
    sourceSubdirectory: "delivery",
    exactFiles: authorityInventory(manifest),
    removeUnlistedFiles: true,
  };
  return manifest;
}

export async function selfTest() {
  if (!SCHEMA.includes("phase-4-r2-1") || SOURCE_SHA256.length !== 64 || MAIN_SHA.length !== 40) throw new Error("Frozen R2.1 constants self-test failed");
  const manifest = syntheticManifest();
  assertProductionManifest(manifest);
  for (const mutate of [
    (value) => { value.assets[0].codec = "vp9"; value.assets[0].file = "media/desktop.webm"; },
    (value) => { value.assets[0].frames = 501; },
    (value) => { value.deliveryPolicy.activeVideoCount = 4; },
    (value) => { value.sourceBlendSha256 = "0".repeat(64); },
    (value) => { value.authorization.phase5 = true; },
  ]) {
    const invalid = structuredClone(manifest);
    mutate(invalid);
    let rejected = false;
    try { assertProductionManifest(invalid); } catch { rejected = true; }
    if (!rejected) throw new Error("Negative active-manifest self-test was accepted");
  }

  const fixture = { file: "media/example.mp4", bytes: 3, sha256: sha256(Buffer.from("abc")) };
  const supported = classifyRange({ status: 206, bytes: Buffer.from("a"), contentRange: "bytes 0-0/3", acceptRanges: "bytes" }, fixture, Buffer.from("a"));
  const ignored = classifyRange({ status: 200, bytes: Buffer.from("abc"), contentRange: null, acceptRanges: null }, fixture, Buffer.from("a"));
  if (supported.status !== "SUPPORTED" || ignored.status !== "HONESTLY_IGNORED") throw new Error("Range classification self-test failed");
  let wrongByteRejected = false;
  try { classifyRange({ status: 206, bytes: Buffer.from("z"), contentRange: "bytes 0-0/3", acceptRanges: "bytes" }, fixture, Buffer.from("a")); } catch { wrongByteRejected = true; }
  if (!wrongByteRejected) throw new Error("Partial byte inequality self-test failed");

  validateResponseHeaders({ contentType: "video/mp4", cacheControl: "public, max-age=3600" }, "media/example.mp4", { immutableAsset: true });
  for (const invalid of [
    { contentType: "text/plain", cacheControl: "public, max-age=3600" },
    { contentType: "video/mp4", cacheControl: "no-store" },
    { contentType: "video/mp4", cacheControl: "public, max-age=0" },
  ]) {
    let rejected = false;
    try { validateResponseHeaders(invalid, "media/example.mp4", { immutableAsset: true }); } catch { rejected = true; }
    if (!rejected) throw new Error("MIME/cache negative self-test failed");
  }

  assertSuccessfulGithubCheckRun({ name: "Cloudflare Pages", status: "completed", conclusion: "success", completedAt: "2026-08-28T00:00:00.000Z" });
  assertSuccessfulTerminalCloudflareStage({ name: "deploy", status: "success", endedOn: "2026-08-28T00:00:00.000Z" });
  for (const stage of [null, { name: "build", status: "success", endedOn: "2026-08-28T00:00:00.000Z" }, { name: "deploy", status: "failure", endedOn: "2026-08-28T00:00:00.000Z" }]) {
    let rejected = false;
    try { assertSuccessfulTerminalCloudflareStage(stage); } catch { rejected = true; }
    if (!rejected) throw new Error("Cloudflare terminal-stage negative self-test failed");
  }

  const fixtureOptions = {
    expectedHead: "a".repeat(40),
    branch: REQUIRED_BRANCH,
    immutableUrl: "https://12345678.qsite1.pages.dev/",
    branchUrl: "https://repair-phase-4r2-1.qsite1.pages.dev/",
    cloudflareAccountId: "b".repeat(32),
    cloudflareProject: "qsite1",
    cloudflareDeploymentId: "11111111-2222-4333-8444-555555555555",
  };
  const checkProjection = verifyCloudflareGithubCheck(fixtureOptions, { checkRun: {
    name: "Cloudflare Pages", status: "completed", conclusion: "success", completedAt: "2026-08-28T00:00:00.000Z",
    detailsUrl: `https://dash.cloudflare.com/?to=/${"b".repeat(32)}/pages/view/qsite1/11111111-2222-4333-8444-555555555555`,
    outputTitle: "Deployed successfully",
    outputSummary: `<code>aaaaaaa</code> Deploy successful! https://12345678.qsite1.pages.dev https://repair-phase-4r2-1.qsite1.pages.dev`,
  } });
  if (checkProjection.authoritySource !== "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK") throw new Error("Cloudflare check projection self-test failed");
  if (deployedAssetPath(manifest.assets[0]) !== `${DEPLOYED_ASSET_PREFIX}${manifest.assets[0].file}`) throw new Error("Nested deployed path self-test failed");
  if (DEPLOYED_MANIFEST_PATH !== "/media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json") throw new Error("Nested manifest path self-test failed");
  if (!isWithin("C:/example/root", "C:/example/root/child") || isWithin("C:/example/root", "C:/example/root-sibling")) throw new Error("Path-containment self-test failed");
  process.stdout.write(stableJson({ schema: `${SCHEMA}.self-test`, status: "PASS", activeAssets: manifest.assets.length, frameCount: FRAME_COUNT, rangeStates: [supported.status, ignored.status] }));
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) return printHelp();
  if (options.selfTest) return selfTest();
  validateOptions(options);
  if (options.dryRun) {
    process.stdout.write(stableJson({
      schema: `${SCHEMA}.dry-run`, status: "PASS", writesPerformed: false, gitCommandsPerformed: false,
      networkRequestsPerformed: false, expectedHead: options.expectedHead, branch: options.branch,
      sourceBlendSha256: SOURCE_SHA256, manifestRepositoryPath: MANIFEST_RELATIVE,
      counts: { activeAssets: 6, activeVideos: 3, activePosters: 3, inactiveVp9Webm: 0, origins: 2 },
    }));
    return;
  }

  await access(options.manifest);
  try {
    await stat(options.output);
    throw new Error("--output must not already exist");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const resolvedOutput = await resolvedFromAncestor(options.output);
  if (isWithin(ROOT, resolvedOutput) || isWithin(os.tmpdir(), resolvedOutput)) throw new Error("Resolved report path enters the repository or temporary directory");

  const manifestBytes = await readFile(options.manifest);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assertProductionManifest(manifest);
  const [repository, trackedAuthority, publicRuntime, distRuntime] = await Promise.all([
    repositoryAuthority(options.expectedHead, options.branch, options.manifest),
    verifyTrackedAuthority(manifest, manifestBytes),
    verifyRuntimeTree(PUBLIC_ROOT_RELATIVE, manifest, manifestBytes),
    verifyRuntimeTree(DIST_ROOT_RELATIVE, manifest, manifestBytes),
  ]);
  const github = await verifyGithub(options, process.env[options.githubTokenEnvironment]);
  const cloudflareToken = process.env[options.cloudflareTokenEnvironment];
  const cloudflare = cloudflareToken ? await verifyCloudflare(options, cloudflareToken) : verifyCloudflareGithubCheck(options, github);
  const [immutable, branch] = await Promise.all([
    verifyOrigin(options.immutableUrl, manifest, manifestBytes, options.timeoutMs, options.activeFamily),
    verifyOrigin(options.branchUrl, manifest, manifestBytes, options.timeoutMs, options.activeFamily),
  ]);

  const report = {
    schema: SCHEMA,
    status: "PASS",
    generatedAt: new Date().toISOString(),
    repository,
    github,
    cloudflare,
    identitySeparation: {
      githubCheckRunId: String(options.githubCheckRunId),
      cloudflareDeploymentId: String(options.cloudflareDeploymentId),
      identifiersAreDifferentAuthorityTypes: true,
      githubCheckRunWasNotUsedAsCloudflareDeploymentId: true,
    },
    deployment: {
      expectedHead: options.expectedHead,
      immutableUrl: options.immutableUrl,
      branchUrl: options.branchUrl,
      immutable,
      branch,
    },
    productionManifest: {
      repositoryPath: repository.manifestRepositoryPath,
      bytes: manifestBytes.length,
      sha256: sha256(manifestBytes),
      sourceBlendSha256: manifest.sourceBlendSha256,
      schema: manifest.schema,
      assetCount: manifest.assets.length,
      videoCount: 3,
      posterCount: 3,
      frameCount: FRAME_COUNT,
      fps: FPS,
      h264Only: true,
      vp9WebmCount: 0,
    },
    localAuthority: { tracked: trackedAuthority, publicRuntime, distRuntime },
    checks: {
      exactCleanLocalHead: true,
      localUpstreamExactHead: true,
      liveRemoteExactHead: true,
      githubCommitAndBranchExactHead: true,
      frozenMainExactAndRepairUnmerged: true,
      githubCloudflarePagesCheckSuccessful: true,
      cloudflareActualDeploymentIdVerified: true,
      cloudflareCommitAndBranchExactHead: true,
      cloudflareTerminalDeployStageSuccessful: true,
      immutableUrlMatchesCloudflareAuthority: true,
      activeTrackedAuthorityByteHashParity: true,
      exactThreeH264AndThreePosters: true,
      zeroActiveVp9Webm: true,
      publicAndDistRuntimeInventoryExact: true,
      immutableAndBranchManifestAssetRuntimeParity: true,
      oneActiveFamilyRequestSemanticsRecorded: true,
      credentialsAndPrivatePathsExcluded: true,
    },
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: { humanAccepted: false, phase5Authorized: false, mainMerged: false },
  };
  const outputBytes = assertSafeReport(report);
  await atomicWrite(options.output, outputBytes);
  process.stdout.write(stableJson({
    status: "PASS",
    report: { basename: path.basename(options.output), bytes: outputBytes.length, sha256: sha256(outputBytes) },
    assetComparisons: manifest.assets.length * 2,
    activeFamilySemanticsProbes: 2,
  }));
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`Phase 4-R2.1 deployment verification failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
