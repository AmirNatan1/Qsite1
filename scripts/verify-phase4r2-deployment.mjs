#!/usr/bin/env node

/**
 * Verify that one immutable Cloudflare Pages deployment and its branch alias
 * both serve the exact Phase 4-R2 production-media authority from one Git HEAD.
 *
 * This tool is deliberately read-only apart from its explicit external report.
 * Credentials are read from environment variables and are never serialized.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_RELATIVE = "scripts/verify-phase4r2-deployment.mjs";
const SCHEMA = "quantum-hub.phase-4-r2.deployment-verification.v1";
const SOURCE_SHA256 = "b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0";
const MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
const MANIFEST_RELATIVE = "artifacts/original/phase-4r2-final-cinematic-production/manifests/phase-4r2-production-media-manifest.json";
const DEPLOYED_ASSET_PREFIX = "/media/cinematic/phase-4r2/";
const DEPLOYED_MANIFEST_PATH = `${DEPLOYED_ASSET_PREFIX}manifests/phase-4r2-production-media-manifest.json`;
const DEFAULT_TIMEOUT_MS = 30_000;
const HUMAN_REVIEW_GATES = Object.freeze({
  "PHYSICAL → DIGITAL CONTINUITY": "PENDING HUMAN REVIEW",
  "NATIVE SCROLL + REVERSE INTEGRITY": "PENDING HUMAN REVIEW",
  "RESPONSIVE + ACCESSIBLE INTEGRATION": "PENDING HUMAN REVIEW",
  "MEDIA + PERFORMANCE SAFETY": "PENDING HUMAN REVIEW",
  "OPERATING FIELD REGRESSION": "PENDING HUMAN REVIEW",
});
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,})/i;

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArguments(argv) {
  const options = {
    expectedHead: null,
    repository: null,
    branch: null,
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
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Phase 4-R2 deployment verifier

Usage:
  node scripts/verify-phase4r2-deployment.mjs \\
    --expected-head <40-hex-sha> --repository <owner/name> --branch <branch> \\
    [--main-branch main] \\
    --github-check-run-id <id> \\
    --cloudflare-account-id <id> --cloudflare-project <name> \\
    --cloudflare-deployment-id <actual-pages-deployment-id> \\
    --immutable-url <https://deployment.project.pages.dev/> \\
    --branch-url <https://branch.project.pages.dev/> \\
    --output <fresh-external-report.json>

Options:
  --manifest FILE             Tracked production media manifest
  --github-token-env NAME     Token environment variable (default GITHUB_TOKEN)
  --cloudflare-token-env NAME Token environment variable (default CLOUDFLARE_API_TOKEN)
  --timeout-ms N              Per-request timeout, 5000..120000
  --dry-run                   Validate the command contract; do not use network or write
  --self-test                 Run pure validation tests only
  --help, -h                  Show help

The GitHub check-run ID and the Cloudflare deployment ID are separate required
authorities. The report never substitutes one for the other. Range support is
reported as SUPPORTED or HONESTLY_IGNORED; malformed partial responses fail.
`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

function normalizePublicUrl(value, label) {
  if (!value) throw new Error(`${label} is required`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`${label} may not contain credentials, query, or fragment`);
  if (/^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(url.hostname)) throw new Error(`${label} must be a public deployment URL`);
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url.toString();
}

function validateOptions(options, { requireSecrets = true } = {}) {
  if (!/^[0-9a-f]{40}$/.test(options.expectedHead ?? "")) throw new Error("--expected-head must be exactly 40 lowercase hexadecimal characters");
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repository ?? "")) throw new Error("--repository must be owner/name");
  for (const key of ["branch", "mainBranch", "githubCheckRunId", "cloudflareAccountId", "cloudflareProject", "cloudflareDeploymentId"]) {
    if (!String(options[key] ?? "").trim()) throw new Error(`Missing required ${key}`);
  }
  if (options.branch === options.mainBranch) throw new Error("Final review deployment branch must remain distinct from the unmerged main branch");
  if (options.mainBranch !== "main") throw new Error("--main-branch must be exactly main for the frozen baseline authority");
  options.immutableUrl = normalizePublicUrl(options.immutableUrl, "--immutable-url");
  options.branchUrl = normalizePublicUrl(options.branchUrl, "--branch-url");
  if (options.immutableUrl === options.branchUrl) throw new Error("Immutable and branch URLs must be distinct");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  if (!options.output) throw new Error("--output is required");
  if (isWithin(ROOT, options.output) || isWithin(os.tmpdir(), options.output)) throw new Error("Deployment report must remain outside the repository and temporary directory");
  if (path.extname(options.output).toLowerCase() !== ".json") throw new Error("--output must name a JSON file");
  if (requireSecrets) {
    if (!process.env[options.githubTokenEnvironment]) throw new Error(`Missing GitHub token environment variable ${options.githubTokenEnvironment}`);
    if (!process.env[options.cloudflareTokenEnvironment]) throw new Error(`Missing Cloudflare token environment variable ${options.cloudflareTokenEnvironment}`);
  }
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
  const response = await fetchBound(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "User-Agent": "quantum-hub-phase4r2-verifier" },
  }, timeoutMs);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} did not return JSON`);
  }
}

async function git(...args) {
  return (await execFileAsync("git", args, { cwd: ROOT, windowsHide: true })).stdout.trim();
}

async function repositoryAuthority(expectedHead, expectedBranch, manifestPath) {
  const [head, branch, mainHead, statusText, tracked, trackedScript] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("branch", "--show-current"),
    git("rev-parse", "main"),
    git("status", "--short"),
    git("ls-files", "--error-unmatch", "--", path.relative(ROOT, manifestPath).replaceAll("\\", "/")),
    git("ls-files", "--error-unmatch", "--", SCRIPT_RELATIVE),
  ]);
  if (head !== expectedHead) throw new Error(`Local HEAD ${head} differs from --expected-head`);
  if (branch !== expectedBranch) throw new Error(`Local branch ${branch} differs from --branch ${expectedBranch}`);
  if (mainHead !== MAIN_SHA) throw new Error(`Local main must remain exactly ${MAIN_SHA}`);
  if (statusText) throw new Error("Deployment verification requires the exact clean HEAD");
  if (path.resolve(ROOT, tracked) !== path.resolve(manifestPath)) throw new Error("Production manifest must be the exact tracked authority");
  if (trackedScript.replaceAll("\\", "/") !== SCRIPT_RELATIVE) throw new Error("Deployment verifier must be tracked by the exact HEAD");
  return { head, branch, main: { branch: "main", headSha: mainHead, requiredHeadSha: MAIN_SHA }, clean: true, manifestRepositoryPath: tracked.replaceAll("\\", "/"), verifierScript: SCRIPT_RELATIVE };
}

function assertProductionManifest(manifest) {
  if (manifest.schema !== "quantum-hub.phase-4-r2.production-media-manifest.v1") throw new Error("Production manifest schema mismatch");
  if (manifest.sourceBlendSha256 !== SOURCE_SHA256) throw new Error("Production manifest source authority mismatch");
  if (manifest.authorization?.mergeMain !== false || manifest.authorization?.phase5 !== false) throw new Error("Production manifest authorization must remain denied");
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== 9) throw new Error("Production manifest must contain exactly nine deployed assets");
  const names = manifest.assets.map((asset) => asset.file);
  if (new Set(names).size !== names.length) throw new Error("Production manifest asset paths are duplicated");
  for (const asset of manifest.assets) {
    if (!/^(?:media|posters)\/[a-z0-9._-]+$/i.test(asset.file) || asset.file.includes("..")) throw new Error(`Unsafe production asset path: ${asset.file}`);
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || !/^[0-9a-f]{64}$/.test(asset.sha256 ?? "")) throw new Error(`Invalid production asset authority: ${asset.file}`);
  }
  const videos = manifest.assets.filter((asset) => asset.kind === "video");
  const posters = manifest.assets.filter((asset) => asset.kind === "poster");
  const expectedVideos = ["desktop", "portrait", "landscape"].flatMap((family) => ["h264", "vp9"].map((codec) => `${family}:${codec}`)).sort();
  const actualVideos = videos.map((asset) => `${asset.family}:${asset.codec}`).sort();
  const expectedPosters = ["desktop", "portrait", "landscape"].sort();
  const actualPosters = posters.map((asset) => asset.family).sort();
  if (videos.length !== 6 || posters.length !== 3 || JSON.stringify(actualVideos) !== JSON.stringify(expectedVideos) || JSON.stringify(actualPosters) !== JSON.stringify(expectedPosters)) {
    throw new Error("Production manifest must contain the exact three-family video-codec cartesian product and three posters");
  }
  const deployedPaths = manifest.assets.map(deployedAssetPath);
  if (new Set(deployedPaths).size !== manifest.assets.length || deployedPaths.some((candidate) => !candidate.startsWith(DEPLOYED_ASSET_PREFIX))) throw new Error("Production assets do not map one-to-one beneath the exact deployed Phase 4-R2 prefix");
}

function deployedAssetPath(asset) {
  if (!/^(?:media|posters)\/[a-z0-9._-]+$/i.test(asset?.file ?? "")) throw new Error(`Cannot map unsafe production asset path: ${asset?.file}`);
  const deployedPath = `${DEPLOYED_ASSET_PREFIX}${asset.file}`;
  const suffix = deployedPath.slice(DEPLOYED_ASSET_PREFIX.length);
  if (!deployedPath.startsWith(DEPLOYED_ASSET_PREFIX) || !/^(?:media|posters)\/[a-z0-9._-]+$/i.test(suffix)) throw new Error(`Deployment asset path escaped the exact nested Phase 4-R2 model: ${deployedPath}`);
  return deployedPath;
}

function expectedMime(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return ({ ".mp4": "video/mp4", ".webm": "video/webm", ".png": "image/png", ".json": "application/json", ".html": "text/html", ".js": "javascript", ".css": "text/css" })[extension] ?? null;
}

function validateResponseHeaders(record, relativePath, { immutableAsset = false } = {}) {
  const expected = expectedMime(relativePath);
  const contentType = String(record.contentType ?? "").toLowerCase();
  const cacheControl = String(record.cacheControl ?? "").toLowerCase();
  if (!expected || !contentType.includes(expected)) throw new Error(`MIME mismatch for ${relativePath}: ${record.contentType}`);
  if (!cacheControl || /(?:^|,)\s*(?:private|no-store)(?:\s|,|$)/.test(cacheControl)) throw new Error(`Unsafe or absent Cache-Control for ${relativePath}: ${record.cacheControl}`);
  const lifetime = cacheControl.match(/(?:^|,)\s*(?:s-maxage|max-age)=(\d+)/)?.[1];
  if (immutableAsset && (!lifetime || Number(lifetime) <= 0)) throw new Error(`Hash-named immutable asset lacks a positive cache lifetime: ${relativePath}`);
  return { expectedMime: expected, contentType: record.contentType, cacheControl: record.cacheControl, status: "PASS" };
}

function assertSuccessfulGithubCheckRun(run) {
  if (!run || run.status !== "completed" || run.conclusion !== "success") throw new Error("The explicit GitHub check run must be completed with conclusion success");
}

function assertSuccessfulTerminalCloudflareStage(stage) {
  if (!stage || stage.name !== "deploy" || stage.status !== "success" || !Number.isFinite(Date.parse(stage.ended_on ?? ""))) throw new Error("Cloudflare deployment lacks an explicit successful terminal deploy stage with ended_on");
}

function terminalCloudflareStage(deployment) {
  const stages = Array.isArray(deployment?.stages) ? deployment.stages : [];
  const terminal = stages.length > 0 ? stages.at(-1) : deployment?.stages?.deploy ? { name: "deploy", ...deployment.stages.deploy } : deployment?.latest_stage;
  if ((stages.length > 0 || deployment?.stages?.deploy) && deployment?.latest_stage) {
    const latest = deployment.latest_stage;
    if (latest.name !== terminal?.name || latest.status !== terminal?.status || latest.ended_on !== terminal?.ended_on) throw new Error("Cloudflare latest_stage differs from the actual final stages[] entry");
  }
  assertSuccessfulTerminalCloudflareStage(terminal);
  return terminal;
}

async function verifyGithub(options, token) {
  const api = `https://api.github.com/repos/${options.repository}`;
  const [commit, reference, mainReference, mainComparison, checks] = await Promise.all([
    jsonRequest(`${api}/commits/${options.expectedHead}`, token, options.timeoutMs, "GitHub commit"),
    jsonRequest(`${api}/git/ref/heads/${encodeURIComponent(options.branch)}`, token, options.timeoutMs, "GitHub branch ref"),
    jsonRequest(`${api}/git/ref/heads/${encodeURIComponent(options.mainBranch)}`, token, options.timeoutMs, "GitHub main ref"),
    jsonRequest(`${api}/compare/${encodeURIComponent(options.mainBranch)}...${options.expectedHead}`, token, options.timeoutMs, "GitHub main comparison"),
    jsonRequest(`${api}/commits/${options.expectedHead}/check-runs?per_page=100`, token, options.timeoutMs, "GitHub check runs"),
  ]);
  if (commit.sha !== options.expectedHead) throw new Error("GitHub commit endpoint did not bind the expected HEAD");
  if (reference.object?.sha !== options.expectedHead) throw new Error("GitHub branch does not point to the expected HEAD");
  if (mainReference.object?.sha === options.expectedHead || ["behind", "identical"].includes(mainComparison.status)) throw new Error("The exact final review HEAD is already contained by main");
  if (options.mainBranch !== "main" || mainReference.object?.sha !== MAIN_SHA) throw new Error(`GitHub main must remain exactly ${MAIN_SHA}`);
  if (!["ahead", "diverged"].includes(mainComparison.status)) throw new Error(`Unexpected GitHub main comparison status: ${mainComparison.status}`);
  const run = (checks.check_runs ?? []).find((candidate) => String(candidate.id) === String(options.githubCheckRunId));
  if (!run) throw new Error("The explicit GitHub check-run ID was not found on the expected HEAD");
  if (run.head_sha !== options.expectedHead) throw new Error("The explicit GitHub check run is not attached to the expected HEAD");
  assertSuccessfulGithubCheckRun(run);
  return {
    repository: options.repository,
    branch: options.branch,
    commitSha: commit.sha,
    branchHeadSha: reference.object.sha,
    main: { branch: options.mainBranch, headSha: mainReference.object?.sha, requiredHeadSha: MAIN_SHA, comparisonStatus: mainComparison.status, exactHeadMerged: false },
    checkRun: { id: String(run.id), name: run.name, appSlug: run.app?.slug ?? null, status: run.status, conclusion: run.conclusion, headSha: run.head_sha },
  };
}

async function verifyCloudflare(options, token) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.cloudflareAccountId)}/pages/projects/${encodeURIComponent(options.cloudflareProject)}/deployments/${encodeURIComponent(options.cloudflareDeploymentId)}`;
  const payload = await jsonRequest(endpoint, token, options.timeoutMs, "Cloudflare Pages deployment");
  if (payload.success !== true || !payload.result) throw new Error("Cloudflare Pages API did not return a successful deployment result");
  const deployment = payload.result;
  const deploymentId = String(deployment.id ?? "");
  const commitHash = deployment.deployment_trigger?.metadata?.commit_hash ?? deployment.source?.config?.commit_hash ?? null;
  const branch = deployment.deployment_trigger?.metadata?.branch ?? deployment.source?.config?.branch ?? null;
  const immutableApiUrl = normalizePublicUrl(deployment.url, "Cloudflare deployment URL");
  if (deploymentId !== String(options.cloudflareDeploymentId)) throw new Error("Cloudflare returned a different deployment ID");
  if (commitHash !== options.expectedHead || branch !== options.branch) throw new Error("Cloudflare deployment is not bound to the expected branch and HEAD");
  if (immutableApiUrl !== options.immutableUrl) throw new Error("Cloudflare API immutable URL differs from --immutable-url");
  const stage = terminalCloudflareStage(deployment);
  return {
    accountId: options.cloudflareAccountId,
    project: options.cloudflareProject,
    deploymentId,
    deploymentUrl: immutableApiUrl,
    branch,
    commitHash,
    environment: deployment.environment ?? null,
    terminalStage: { name: stage.name ?? null, status: stage.status, endedOn: stage.ended_on },
  };
}

async function fetchAssetAuthority(baseUrl, asset, timeoutMs, range = false) {
  const deployedPath = deployedAssetPath(asset);
  const url = new URL(deployedPath, baseUrl).toString();
  const response = await fetchBound(url, { headers: range ? { Range: "bytes=0-0", Accept: "*/*" } : { Accept: "*/*" } }, timeoutMs);
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    urlPath: new URL(url).pathname,
    status: response.status,
    contentLength: response.headers.get("content-length"),
    contentRange: response.headers.get("content-range"),
    acceptRanges: response.headers.get("accept-ranges"),
    contentType: response.headers.get("content-type"),
    cacheControl: response.headers.get("cache-control"),
    bytes,
  };
}

function classifyRange(record, asset) {
  if (record.status === 206) {
    if (record.bytes.length !== 1 || record.contentRange !== `bytes 0-0/${asset.bytes}`) throw new Error(`Malformed Range response for ${asset.file}`);
    if (!asset.firstByte || !record.bytes.equals(asset.firstByte)) throw new Error(`Range byte zero differs from the full deployed asset: ${asset.file}`);
    return { status: "SUPPORTED", httpStatus: 206, bytesReturned: 1, byteZeroSha256: sha256(record.bytes), contentRange: record.contentRange, acceptRanges: record.acceptRanges };
  }
  if (record.status === 200) {
    if (record.bytes.length !== asset.bytes || sha256(record.bytes) !== asset.sha256) throw new Error(`Range-ignored full response differs for ${asset.file}`);
    return { status: "HONESTLY_IGNORED", httpStatus: 200, bytesReturned: record.bytes.length, contentRange: record.contentRange, acceptRanges: record.acceptRanges };
  }
  throw new Error(`Range request for ${asset.file} returned HTTP ${record.status}`);
}

async function fetchPublicFile(baseUrl, publicPath, timeoutMs) {
  const response = await fetchBound(new URL(publicPath, baseUrl), { headers: { Accept: "*/*" } }, timeoutMs);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { publicPath, status: response.status, bytes, contentType: response.headers.get("content-type"), cacheControl: response.headers.get("cache-control") };
}

async function verifyEmittedRuntime(baseUrl, timeoutMs) {
  const localHtmlPath = path.join(ROOT, "dist", "index.html");
  const localHtml = await readFile(localHtmlPath);
  const deployedHtml = await fetchPublicFile(baseUrl, "/", timeoutMs);
  if (deployedHtml.status !== 200 || !deployedHtml.bytes.equals(localHtml)) throw new Error(`Deployed HTML differs from dist/index.html at ${baseUrl}`);
  const htmlHeaders = validateResponseHeaders(deployedHtml, "index.html");
  const text = localHtml.toString("utf8");
  const runtimePaths = [...new Set([...text.matchAll(/(?:src|href)=["'](\/_astro\/[^"'#?]+\.(?:js|css))["']/g)].map((match) => match[1]))].sort();
  if (runtimePaths.length < 1) throw new Error("dist/index.html exposes no authoritative emitted JS/CSS assets");
  const runtime = [];
  for (const publicPath of runtimePaths) {
    const local = await readFile(path.join(ROOT, "dist", ...publicPath.slice(1).split("/")));
    const deployed = await fetchPublicFile(baseUrl, publicPath, timeoutMs);
    if (deployed.status !== 200 || !deployed.bytes.equals(local)) throw new Error(`Deployed emitted runtime differs: ${publicPath}`);
    runtime.push({ publicPath, bytes: local.length, sha256: sha256(local), headers: validateResponseHeaders(deployed, publicPath, { immutableAsset: true }), status: "PASS" });
  }
  return { html: { publicPath: "/", bytes: localHtml.length, sha256: sha256(localHtml), headers: htmlHeaders, status: "PASS" }, runtime };
}

async function verifyOrigin(baseUrl, assets, manifestBytes, timeoutMs) {
  const deployedManifest = await fetchPublicFile(baseUrl, DEPLOYED_MANIFEST_PATH, timeoutMs);
  if (deployedManifest.status !== 200 || !deployedManifest.bytes.equals(manifestBytes)) throw new Error(`Deployed production manifest parity failed at ${baseUrl}`);
  const manifestRecord = { publicPath: DEPLOYED_MANIFEST_PATH, bytes: deployedManifest.bytes.length, sha256: sha256(deployedManifest.bytes), headers: validateResponseHeaders(deployedManifest, DEPLOYED_MANIFEST_PATH), status: "PASS" };
  const records = [];
  for (const asset of assets) {
    const full = await fetchAssetAuthority(baseUrl, asset, timeoutMs, false);
    if (full.status !== 200 || full.bytes.length !== asset.bytes || sha256(full.bytes) !== asset.sha256) throw new Error(`Deployed asset parity failed at ${baseUrl}: ${asset.file}`);
    const fullWithByte = { ...asset, firstByte: full.bytes.subarray(0, 1) };
    const ranged = await fetchAssetAuthority(baseUrl, asset, timeoutMs, true);
    records.push({
      file: asset.file,
      deployedPath: deployedAssetPath(asset),
      expected: { bytes: asset.bytes, sha256: asset.sha256 },
      actual: { httpStatus: full.status, bytes: full.bytes.length, sha256: sha256(full.bytes), contentType: full.contentType, cacheControl: full.cacheControl },
      headers: validateResponseHeaders(full, asset.file, { immutableAsset: true }),
      range: classifyRange(ranged, fullWithByte),
      status: "PASS",
    });
  }
  const emittedRuntime = await verifyEmittedRuntime(baseUrl, timeoutMs);
  return { baseUrl, status: "PASS", manifest: manifestRecord, assets: records, emittedRuntime };
}

function assertSafeReport(report) {
  const text = stableJson(report);
  if (PRIVATE_TEXT.test(text)) throw new Error("Deployment report contains private paths, loopback URLs, UNC paths, or token-shaped secrets");
  return Buffer.from(text, "utf8");
}

async function selfTest() {
  if (MAIN_SHA !== "501040c42bba30b9d9517b88a8f9857992a2dba4") throw new Error("Frozen main self-test failed");
  const fixture = { file: "media/a.mp4", bytes: 3, sha256: sha256(Buffer.from("abc")), firstByte: Buffer.from("a") };
  const ignored = classifyRange({ status: 200, bytes: Buffer.from("abc"), contentRange: null, acceptRanges: null }, fixture);
  const supported = classifyRange({ status: 206, bytes: Buffer.from("a"), contentRange: "bytes 0-0/3", acceptRanges: "bytes" }, fixture);
  if (ignored.status !== "HONESTLY_IGNORED" || supported.status !== "SUPPORTED") throw new Error("Range-classification self-test failed");
  let wrongRangeByteRejected = false;
  try { classifyRange({ status: 206, bytes: Buffer.from("z"), contentRange: "bytes 0-0/3", acceptRanges: "bytes" }, fixture); } catch { wrongRangeByteRejected = true; }
  if (!wrongRangeByteRejected) throw new Error("Range byte-zero equality negative self-test failed");
  const deployed = deployedAssetPath({ file: "media/phase-4r2-desktop-h264-abcdef123456.mp4" });
  if (deployed !== "/media/cinematic/phase-4r2/media/phase-4r2-desktop-h264-abcdef123456.mp4") throw new Error("Nested deployment-prefix self-test failed");
  if (DEPLOYED_MANIFEST_PATH !== "/media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json") throw new Error("Deployed manifest path self-test failed");
  for (const invalidAsset of [{ file: "media/nested/escape.mp4" }, { file: "/media/cinematic/phase-4r2/escape.mp4" }]) {
    let rejected = false;
    try { deployedAssetPath(invalidAsset); } catch { rejected = true; }
    if (!rejected) throw new Error("Deployment-prefix negative self-test failed");
  }
  validateResponseHeaders({ contentType: "video/mp4", cacheControl: "public, max-age=3600" }, "media/example.mp4", { immutableAsset: true });
  for (const invalidHeaders of [{ contentType: "text/plain", cacheControl: "public, max-age=3600" }, { contentType: "video/mp4", cacheControl: "no-store" }, { contentType: "video/mp4", cacheControl: "public, max-age=0" }]) {
    let rejected = false;
    try { validateResponseHeaders(invalidHeaders, "media/example.mp4", { immutableAsset: true }); } catch { rejected = true; }
    if (!rejected) throw new Error("MIME/cache negative self-test failed");
  }
  assertSuccessfulGithubCheckRun({ status: "completed", conclusion: "success" });
  for (const conclusion of ["neutral", "skipped", "failure", null]) {
    let rejected = false;
    try { assertSuccessfulGithubCheckRun({ status: "completed", conclusion }); } catch { rejected = true; }
    if (!rejected) throw new Error(`GitHub conclusion negative self-test accepted ${conclusion}`);
  }
  assertSuccessfulTerminalCloudflareStage({ name: "deploy", status: "success", ended_on: "2026-08-27T00:00:00.000Z" });
  for (const invalidStage of [null, { name: "build", status: "success", ended_on: "2026-08-27T00:00:00.000Z" }, { name: "deploy", status: "success", ended_on: null }, { name: "deploy", status: "failure", ended_on: "2026-08-27T00:00:00.000Z" }]) {
    let rejected = false;
    try { assertSuccessfulTerminalCloudflareStage(invalidStage); } catch { rejected = true; }
    if (!rejected) throw new Error("Cloudflare terminal-stage negative self-test failed");
  }
  let mismatchedTerminalRejected = false;
  try { terminalCloudflareStage({ latest_stage: { name: "deploy", status: "success", ended_on: "2026-08-27T00:00:00.000Z" }, stages: [{ name: "deploy", status: "failure", ended_on: "2026-08-27T00:00:01.000Z" }] }); } catch { mismatchedTerminalRejected = true; }
  if (!mismatchedTerminalRejected) throw new Error("Cloudflare terminal-stage mismatch negative self-test failed");
  assertProductionManifest({
    schema: "quantum-hub.phase-4-r2.production-media-manifest.v1",
    sourceBlendSha256: SOURCE_SHA256,
    authorization: { mergeMain: false, phase5: false },
    assets: [
      ...["desktop", "portrait", "landscape"].flatMap((family) => ["h264", "vp9"].map((codec) => ({ kind: "video", family, codec, file: `media/${family}-${codec}.${codec === "h264" ? "mp4" : "webm"}`, bytes: 1, sha256: "a".repeat(64) }))),
      ...["desktop", "portrait", "landscape"].map((family) => ({ kind: "poster", family, file: `posters/${family}.png`, bytes: 1, sha256: "b".repeat(64) })),
    ],
  });
  process.stdout.write(`${stableJson({ schema: `${SCHEMA}.self-test`, status: "PASS", rangeStates: [supported.status, ignored.status] })}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  if (options.selfTest) return selfTest();
  validateOptions(options, { requireSecrets: !options.dryRun });
  if (options.dryRun) {
    process.stdout.write(stableJson({ schema: `${SCHEMA}.dry-run`, status: "PASS", writesPerformed: false, networkRequestsPerformed: false, expectedHead: options.expectedHead, counts: { deployedAssets: 9, origins: 2 } }));
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
  const [repository, manifestBytes] = await Promise.all([
    repositoryAuthority(options.expectedHead, options.branch, options.manifest),
    readFile(options.manifest),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assertProductionManifest(manifest);
  const [github, cloudflare] = await Promise.all([
    verifyGithub(options, process.env[options.githubTokenEnvironment]),
    verifyCloudflare(options, process.env[options.cloudflareTokenEnvironment]),
  ]);
  const [immutable, branch] = await Promise.all([
    verifyOrigin(options.immutableUrl, manifest.assets, manifestBytes, options.timeoutMs),
    verifyOrigin(options.branchUrl, manifest.assets, manifestBytes, options.timeoutMs),
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
    deployment: { expectedHead: options.expectedHead, immutableUrl: options.immutableUrl, branchUrl: options.branchUrl, immutable, branch },
    productionManifest: { repositoryPath: repository.manifestRepositoryPath, bytes: manifestBytes.length, sha256: sha256(manifestBytes), sourceBlendSha256: manifest.sourceBlendSha256, assetCount: manifest.assets.length },
    checks: {
      exactCleanLocalHead: true,
      githubCommitAndBranchExactHead: true,
      exactHeadNotMergedToMain: true,
      githubCheckRunSuccessful: true,
      cloudflareActualDeploymentIdVerified: true,
      cloudflareCommitAndBranchExactHead: true,
      immutableUrlMatchesCloudflareApi: true,
      immutableAndBranchAssetParity: true,
      rangeBehaviorRecordedWithoutAssumption: true,
      credentialsExcluded: true,
    },
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: { humanAccepted: false, phase5Authorized: false, mainMerged: false },
  };
  const outputBytes = assertSafeReport(report);
  await atomicWrite(options.output, outputBytes);
  process.stdout.write(stableJson({ status: "PASS", report: { basename: path.basename(options.output), bytes: outputBytes.length, sha256: sha256(outputBytes) }, assetComparisons: manifest.assets.length * 2 }));
}

main().catch((error) => {
  process.stderr.write(`Phase 4-R2 deployment verification failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
