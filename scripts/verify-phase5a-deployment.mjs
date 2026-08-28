#!/usr/bin/env node

/**
 * Read-only Phase 5A deployment verifier.
 *
 * A PASS binds the exact linear Phase 5A checkpoint chain, clean local and
 * live Git authority, GitHub, one successful Cloudflare Pages preview, and
 * byte parity for the complete emitted dist authority on both observed
 * origins. The generated report is fresh, external, and never contains
 * credentials.
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  lstat,
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

import {
  ACCEPTED_PHASE4_SHA,
  HUMAN_GATES,
  MAIN_SHA,
  MANIFEST_URL_PATH,
  REQUIRED_BRANCH,
  SOURCE_BLEND_SHA256,
  isWithin,
  sha256,
  stableJson,
  validateActiveManifest,
} from "./phase5a-evidence-contract.mjs";

export { ACCEPTED_PHASE4_SHA, HUMAN_GATES, MAIN_SHA, REQUIRED_BRANCH, sha256 };

const execFileAsync = promisify(execFile);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPT_RELATIVE = "scripts/verify-phase5a-deployment.mjs";
export const SCHEMA = "quantum-hub.phase-5a.deployment-verification.v1";
export const REQUIRED_REPOSITORY = "AmirNatan1/Qsite1";
export const REQUIRED_REMOTE_URL = "https://github.com/AmirNatan1/Qsite1.git";
export const REQUIRED_CLOUDFLARE_PROJECT = "qsite1";
export const ACTIVE_MEDIA_MANIFEST_RELATIVE = "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/production/manifests/phase-4r2-production-media-manifest.json";
export const ACTIVE_MEDIA_MANIFEST_SHA256 = "06f9f5b256577ed1b0f159a435135fca6a78185be57b4db8853b9b276c080a54";
export const REPORT_FILENAME = "phase-5a-deployment-verification.json";
export const DEFAULT_DIST_RELATIVE = "dist";
export const CHECKPOINT_SUBJECTS = Object.freeze([
  "Restore scroll-driven CRT activation for Phase 5",
  "Audit Phase 5 supporting-route content and constraints",
  "Define Phase 5 supporting-route experience system",
  "Complete Phase 5 supporting-route visual preproduction",
  "Complete Phase 5A deployed interaction and human-review evidence",
]);
export const HTML_AUTHORITY_FILES = Object.freeze([
  "404.html",
  "about/index.html",
  "contact/index.html",
  "for-partners/index.html",
  "for-startups/index.html",
  "index.html",
  "industries/index.html",
  "pocs/index.html",
  "pocs/maradin/index.html",
  "spark/index.html",
]);
export const MARADIN_AUTHORITY_FILES = Object.freeze([
  "media/maradin/maradin-field-aperture-approved.mp4",
  "media/maradin/maradin-field-aperture-poster-approved.jpg",
  "media/maradin/maradin-prove-field-frame-approved.jpg",
  "media/maradin/maradin-real-field-still-approved.jpg",
  "media/maradin/maradin-test-contact-approved.mp4",
]);
export const FONT_AUTHORITY_FILES = Object.freeze([
  "fonts/inter-latin-400-600.woff2",
  "fonts/newsreader-latin-400.woff2",
  "fonts/syne-latin-800.woff2",
]);
export const REQUIRED_HEADER_POLICIES = Object.freeze({
  "/_astro/*": "public, max-age=31556952, immutable",
  "/media/cinematic/phase-4r2/manifests/*": "public, max-age=0, must-revalidate",
  "/media/cinematic/phase-4r2/media/*": "public, max-age=31556952, immutable",
  "/media/cinematic/phase-4r2/posters/*": "public, max-age=31556952, immutable",
});

const DEFAULT_TIMEOUT_MS = 30_000;
const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|(?:api|access|auth|secret)[_-]?token["'=:\s]+[a-z0-9._-]{16,})/i;

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    expectedHead: null,
    expectedBase: ACCEPTED_PHASE4_SHA,
    expectedMain: MAIN_SHA,
    repository: null,
    branch: REQUIRED_BRANCH,
    mainBranch: "main",
    remote: "origin",
    githubCheckRunId: null,
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? null,
    cloudflareProject: null,
    cloudflareDeploymentId: null,
    observedImmutableUrl: null,
    observedBranchUrl: null,
    githubTokenEnvironment: "GITHUB_TOKEN",
    cloudflareTokenEnvironment: "CLOUDFLARE_API_TOKEN",
    manifest: path.join(ROOT, ...ACTIVE_MEDIA_MANIFEST_RELATIVE.split("/")),
    dist: path.join(ROOT, DEFAULT_DIST_RELATIVE),
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
    else if (argument === "--expected-base") options.expectedBase = next().toLowerCase();
    else if (argument === "--expected-main") options.expectedMain = next().toLowerCase();
    else if (argument === "--repository") options.repository = next();
    else if (argument === "--branch") options.branch = next();
    else if (argument === "--main-branch") options.mainBranch = next();
    else if (argument === "--remote") options.remote = next();
    else if (argument === "--github-check-run-id") options.githubCheckRunId = next();
    else if (argument === "--cloudflare-account-id") options.cloudflareAccountId = next();
    else if (argument === "--cloudflare-project") options.cloudflareProject = next();
    else if (argument === "--cloudflare-deployment-id") options.cloudflareDeploymentId = next();
    else if (argument === "--observed-immutable-url" || argument === "--immutable-url") options.observedImmutableUrl = next();
    else if (argument === "--observed-branch-url" || argument === "--branch-url") options.observedBranchUrl = next();
    else if (argument === "--github-token-env") options.githubTokenEnvironment = next();
    else if (argument === "--cloudflare-token-env") options.cloudflareTokenEnvironment = next();
    else if (argument === "--manifest") options.manifest = path.resolve(next());
    else if (argument === "--dist") options.dist = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

export function printHelp() {
  process.stdout.write(`Phase 5A deployment verifier\n\nUsage:\n  node ${SCRIPT_RELATIVE} \\\n    --expected-head <40-hex-final-sha> \\\n    --expected-base ${ACCEPTED_PHASE4_SHA} --expected-main ${MAIN_SHA} \\\n    --repository ${REQUIRED_REPOSITORY} --branch ${REQUIRED_BRANCH} \\\n    --github-check-run-id <numeric-id> \\\n    --cloudflare-account-id <32-hex-id> --cloudflare-project ${REQUIRED_CLOUDFLARE_PROJECT} \\\n    --cloudflare-deployment-id <uuid> \\\n    --observed-immutable-url <https-origin-root> \\\n    --observed-branch-url <https-origin-root> \\\n    --output <external-directory>/${REPORT_FILENAME}\n\nOptions:\n  --remote origin              Exact configured upstream/live remote\n  --main-branch main           Frozen main branch\n  --manifest FILE              Exact accepted Phase 4 active-media manifest\n  --dist DIR                   Exact local emitted dist root\n  --github-token-env NAME      Default GITHUB_TOKEN\n  --cloudflare-token-env NAME  Default CLOUDFLARE_API_TOKEN; signed check fallback when absent\n  --timeout-ms N               Per-request timeout, 5000..120000\n  --dry-run                    Validate bindings only; no Git, network, filesystem reads, or writes\n  --self-test                  Run pure contract tests only\n  --help, -h                   Show help\n`);
}

export function normalizeObservedUrl(value, label) {
  if (!value) throw new Error(`${label} is required`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${label} must be a credential-free HTTPS origin root`);
  }
  if (!url.hostname.endsWith(`.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev`) || url.hostname === `${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev`) {
    throw new Error(`${label} must be an observed ${REQUIRED_CLOUDFLARE_PROJECT} Cloudflare Pages preview origin`);
  }
  return url.toString();
}

export function validateOptions(options) {
  if (!HASH40.test(options.expectedHead ?? "")) throw new Error("--expected-head must be exactly 40 lowercase hexadecimal characters");
  if (options.expectedHead === ACCEPTED_PHASE4_SHA || options.expectedHead === MAIN_SHA) throw new Error("Final Phase 5A HEAD must differ from accepted Phase 4 and frozen main");
  if (options.expectedBase !== ACCEPTED_PHASE4_SHA) throw new Error(`--expected-base must be exactly ${ACCEPTED_PHASE4_SHA}`);
  if (options.expectedMain !== MAIN_SHA) throw new Error(`--expected-main must be exactly ${MAIN_SHA}`);
  if (options.repository !== REQUIRED_REPOSITORY) throw new Error(`--repository must be exactly ${REQUIRED_REPOSITORY}`);
  if (options.branch !== REQUIRED_BRANCH) throw new Error(`--branch must be exactly ${REQUIRED_BRANCH}`);
  if (options.mainBranch !== "main") throw new Error("--main-branch must be exactly main");
  if (options.remote !== "origin") throw new Error("--remote must be exactly origin");
  if (!/^\d+$/.test(String(options.githubCheckRunId ?? ""))) throw new Error("--github-check-run-id must be numeric");
  if (!/^[0-9a-f]{32}$/i.test(String(options.cloudflareAccountId ?? ""))) throw new Error("--cloudflare-account-id must be 32 hexadecimal characters");
  if (options.cloudflareProject !== REQUIRED_CLOUDFLARE_PROJECT) throw new Error(`--cloudflare-project must be exactly ${REQUIRED_CLOUDFLARE_PROJECT}`);
  if (!UUID.test(String(options.cloudflareDeploymentId ?? ""))) throw new Error("--cloudflare-deployment-id must be a UUID, never a GitHub check-run ID");
  if (String(options.cloudflareDeploymentId) === String(options.githubCheckRunId)) throw new Error("Cloudflare deployment UUID and GitHub check-run ID are distinct authorities");
  if (!/^[A-Z_][A-Z0-9_]*$/.test(options.githubTokenEnvironment) || !/^[A-Z_][A-Z0-9_]*$/.test(options.cloudflareTokenEnvironment)) {
    throw new Error("Token environment names must be uppercase environment identifiers");
  }
  options.observedImmutableUrl = normalizeObservedUrl(options.observedImmutableUrl, "--observed-immutable-url");
  options.observedBranchUrl = normalizeObservedUrl(options.observedBranchUrl, "--observed-branch-url");
  if (options.observedImmutableUrl === options.observedBranchUrl) throw new Error("Observed immutable and branch URLs must be distinct");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  const exactManifest = path.join(ROOT, ...ACTIVE_MEDIA_MANIFEST_RELATIVE.split("/"));
  if (path.resolve(options.manifest) !== exactManifest) throw new Error("--manifest must be the exact accepted active-media manifest");
  if (path.resolve(options.dist) !== path.join(ROOT, DEFAULT_DIST_RELATIVE)) throw new Error("--dist must be the exact repository dist root");
  if (!options.output || path.basename(options.output) !== REPORT_FILENAME) throw new Error(`--output must end exactly in ${REPORT_FILENAME}`);
  if (isWithin(ROOT, options.output) || isWithin(os.tmpdir(), options.output)) throw new Error("Deployment report must remain outside the repository and temporary directory");
  return options;
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
    "User-Agent": "quantum-hub-phase5a-deployment-verifier",
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
  return (await execFileAsync("git", args, { cwd: ROOT, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
}

async function gitExit(...args) {
  try {
    await execFileAsync("git", args, { cwd: ROOT, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    return true;
  } catch (error) {
    if (Number.isInteger(error?.code)) return false;
    throw error;
  }
}

function normalizedRemoteUrl(value) {
  return String(value ?? "").replace(/\/$/, "");
}

async function trackedPath(repositoryRelative) {
  const output = await git("ls-files", "--error-unmatch", "--", repositoryRelative);
  if (output.replaceAll("\\", "/") !== repositoryRelative) throw new Error(`Tracked path authority differs: ${repositoryRelative}`);
  return repositoryRelative;
}

export function assertCheckpointChain(records, expectedHead) {
  if (!Array.isArray(records) || records.length !== CHECKPOINT_SUBJECTS.length) {
    throw new Error(`Phase 5A must contain exactly ${CHECKPOINT_SUBJECTS.length} narrow checkpoints`);
  }
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!HASH40.test(record?.sha ?? "") || record.subject !== CHECKPOINT_SUBJECTS[index]) throw new Error(`Phase 5A checkpoint CP${index + 1} identity differs`);
    const parents = Array.isArray(record.parents) ? record.parents : [];
    const expectedParent = index === 0 ? ACCEPTED_PHASE4_SHA : records[index - 1].sha;
    if (parents.length !== 1 || parents[0] !== expectedParent) throw new Error(`Phase 5A checkpoint CP${index + 1} is not an exact linear child of ${expectedParent}`);
  }
  if (records.at(-1).sha !== expectedHead) throw new Error("Phase 5A CP5 is not the explicit final HEAD");
  return true;
}

function parseLocalCheckpointLog(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, parentText, ...subjectParts] = line.split("\t");
    return { sha, parents: parentText.split(/\s+/).filter(Boolean), subject: subjectParts.join("\t") };
  });
}

export async function repositoryAuthority(expectedHead, manifestPath) {
  const [
    head,
    branch,
    mainHead,
    statusText,
    upstreamRef,
    originUrl,
    checkpointText,
    mergeCommits,
    baseAncestor,
    headMergedIntoMain,
    manifestTracked,
    scriptTracked,
  ] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("branch", "--show-current"),
    git("rev-parse", "main"),
    git("status", "--porcelain=v1", "--untracked-files=all"),
    git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"),
    git("remote", "get-url", "origin"),
    git("log", "--reverse", "--format=%H%x09%P%x09%s", `${ACCEPTED_PHASE4_SHA}..${expectedHead}`),
    git("rev-list", "--merges", `${ACCEPTED_PHASE4_SHA}..${expectedHead}`),
    gitExit("merge-base", "--is-ancestor", ACCEPTED_PHASE4_SHA, expectedHead),
    gitExit("merge-base", "--is-ancestor", expectedHead, "main"),
    trackedPath(ACTIVE_MEDIA_MANIFEST_RELATIVE),
    trackedPath(SCRIPT_RELATIVE),
  ]);
  if (head !== expectedHead) throw new Error(`Local HEAD ${head} differs from --expected-head`);
  if (branch !== REQUIRED_BRANCH) throw new Error(`Local branch ${branch} differs from ${REQUIRED_BRANCH}`);
  if (mainHead !== MAIN_SHA) throw new Error(`Local main must remain exactly ${MAIN_SHA}`);
  if (statusText) throw new Error("Phase 5A deployment verification requires a clean tree and empty untracked inventory");
  if (upstreamRef !== `origin/${REQUIRED_BRANCH}`) throw new Error("Phase 5A branch must track the exact origin branch");
  if (normalizedRemoteUrl(originUrl) !== normalizedRemoteUrl(REQUIRED_REMOTE_URL)) throw new Error("origin URL differs from the exact Qsite1 repository");
  if (!baseAncestor || headMergedIntoMain) throw new Error("Accepted Phase 4 ancestry or unmerged-main boundary differs");
  if (mergeCommits) throw new Error("Merge commits are prohibited in the Phase 5A checkpoint chain");
  const checkpoints = parseLocalCheckpointLog(checkpointText);
  assertCheckpointChain(checkpoints, expectedHead);
  if (path.resolve(ROOT, manifestTracked) !== path.resolve(manifestPath)) throw new Error("Active manifest is not the exact tracked accepted authority");

  const [upstreamHead, liveText] = await Promise.all([
    git("rev-parse", "@{upstream}"),
    git("ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${REQUIRED_BRANCH}`, "refs/heads/main"),
  ]);
  if (upstreamHead !== expectedHead) throw new Error("Local HEAD and configured upstream differ");
  const live = new Map(liveText.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, ref, ...extra] = line.trim().split(/\s+/);
    if (extra.length || !HASH40.test(sha ?? "") || !ref) throw new Error("Live remote ref response is malformed");
    return [ref, sha];
  }));
  if (live.size !== 2 || live.get(`refs/heads/${REQUIRED_BRANCH}`) !== expectedHead || live.get("refs/heads/main") !== MAIN_SHA) {
    throw new Error("Live origin branch/main refs differ from the explicit Phase 5A authorities");
  }
  return {
    repository: REQUIRED_REPOSITORY,
    remoteUrl: REQUIRED_REMOTE_URL,
    head,
    branch,
    clean: true,
    untrackedCount: 0,
    exactParent: ACCEPTED_PHASE4_SHA,
    acceptedPhase4Ancestor: true,
    noMergeCommits: true,
    checkpoints,
    main: { branch: "main", headSha: mainHead, requiredHeadSha: MAIN_SHA, containsPhase5AHead: false },
    upstream: { ref: upstreamRef, headSha: upstreamHead, parity: true },
    liveRemote: {
      remote: "origin",
      branchRef: `refs/heads/${REQUIRED_BRANCH}`,
      branchHeadSha: live.get(`refs/heads/${REQUIRED_BRANCH}`),
      mainRef: "refs/heads/main",
      mainHeadSha: live.get("refs/heads/main"),
      parity: true,
    },
    manifestRepositoryPath: manifestTracked,
    verifierScript: scriptTracked,
  };
}

export function assertSuccessfulGithubCheckRun(run) {
  if (!run || run.name !== "Cloudflare Pages" || run.status !== "completed" || run.conclusion !== "success"
    || !Number.isFinite(Date.parse(run.completed_at ?? run.completedAt ?? ""))) {
    throw new Error("The explicit Cloudflare Pages GitHub check must be completed successfully");
  }
  return true;
}

export function assertSuccessfulTerminalCloudflareStage(stage) {
  if (!stage || stage.name !== "deploy" || stage.status !== "success"
    || !Number.isFinite(Date.parse(stage.ended_on ?? stage.endedOn ?? ""))) {
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

function githubCheckpointRecords(compare) {
  return (compare.commits ?? []).map((commit) => ({
    sha: commit.sha,
    parents: (commit.parents ?? []).map((parent) => parent.sha),
    subject: String(commit.commit?.message ?? "").split(/\r?\n/, 1)[0],
  }));
}

async function verifyGithub(options, token) {
  const api = `https://api.github.com/repos/${REQUIRED_REPOSITORY}`;
  const [commit, branchReference, mainReference, baseComparison, mainComparison, checks] = await Promise.all([
    jsonRequest(`${api}/commits/${options.expectedHead}`, token, options.timeoutMs, "GitHub final commit"),
    jsonRequest(`${api}/git/ref/heads/${encodeURIComponent(REQUIRED_BRANCH)}`, token, options.timeoutMs, "GitHub Phase 5A branch ref"),
    jsonRequest(`${api}/git/ref/heads/main`, token, options.timeoutMs, "GitHub main ref"),
    jsonRequest(`${api}/compare/${ACCEPTED_PHASE4_SHA}...${options.expectedHead}`, token, options.timeoutMs, "GitHub accepted-base comparison"),
    jsonRequest(`${api}/compare/main...${options.expectedHead}`, token, options.timeoutMs, "GitHub main comparison"),
    jsonRequest(`${api}/commits/${options.expectedHead}/check-runs?per_page=100`, token, options.timeoutMs, "GitHub check runs"),
  ]);
  if (commit.sha !== options.expectedHead || branchReference.object?.sha !== options.expectedHead) {
    throw new Error("GitHub commit/Phase 5A branch differs from the explicit final HEAD");
  }
  if (mainReference.object?.sha !== MAIN_SHA || !["ahead", "diverged"].includes(mainComparison.status)) {
    throw new Error("GitHub main changed or already contains the Phase 5A HEAD");
  }
  if (baseComparison.merge_base_commit?.sha !== ACCEPTED_PHASE4_SHA || baseComparison.status !== "ahead"
    || baseComparison.ahead_by !== CHECKPOINT_SUBJECTS.length || baseComparison.behind_by !== 0) {
    throw new Error("GitHub accepted-base ancestry/checkpoint count differs");
  }
  const checkpoints = githubCheckpointRecords(baseComparison);
  assertCheckpointChain(checkpoints, options.expectedHead);
  const run = (checks.check_runs ?? []).find((candidate) => String(candidate.id) === String(options.githubCheckRunId));
  if (!run || run.head_sha !== options.expectedHead) throw new Error("The explicit GitHub check-run ID is missing from the exact final HEAD");
  assertSuccessfulGithubCheckRun(run);
  return {
    repository: REQUIRED_REPOSITORY,
    branch: REQUIRED_BRANCH,
    commitSha: commit.sha,
    commitUrl: commit.html_url ?? null,
    branchHeadSha: branchReference.object.sha,
    acceptedBase: { sha: ACCEPTED_PHASE4_SHA, comparisonStatus: baseComparison.status, exactParent: true, checkpointCount: checkpoints.length },
    checkpoints,
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
  if (accountId !== options.cloudflareAccountId || project !== REQUIRED_CLOUDFLARE_PROJECT || deploymentId !== options.cloudflareDeploymentId) {
    throw new Error("Cloudflare signed-check identity differs from the required account/project/deployment UUID");
  }
  const summary = String(run.outputSummary ?? "");
  if (run.outputTitle !== "Deployed successfully" || !/Deploy successful!/i.test(summary)
    || !summary.includes(`<code>${options.expectedHead.slice(0, 7)}</code>`)
    || !summary.includes(options.observedImmutableUrl.slice(0, -1))
    || !summary.includes(options.observedBranchUrl.slice(0, -1))) {
    throw new Error("Cloudflare signed GitHub check summary does not bind the final HEAD and both observed URLs");
  }
  return {
    accountId,
    project,
    deploymentId,
    deploymentUrl: options.observedImmutableUrl,
    branchUrl: options.observedBranchUrl,
    branch: REQUIRED_BRANCH,
    commitHash: options.expectedHead,
    environment: "preview",
    authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
    terminalStage: { name: "deploy", status: "success", endedOn: run.completedAt },
  };
}

async function verifyCloudflare(options, token) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.cloudflareAccountId)}/pages/projects/${encodeURIComponent(REQUIRED_CLOUDFLARE_PROJECT)}/deployments/${encodeURIComponent(options.cloudflareDeploymentId)}`;
  const payload = await jsonRequest(endpoint, token, options.timeoutMs, "Cloudflare Pages deployment");
  if (payload.success !== true || !payload.result) throw new Error("Cloudflare Pages API did not return a deployment result");
  const deployment = payload.result;
  const deploymentId = String(deployment.id ?? "");
  const commitHash = deployment.deployment_trigger?.metadata?.commit_hash ?? deployment.source?.config?.commit_hash ?? null;
  const branch = deployment.deployment_trigger?.metadata?.branch ?? deployment.source?.config?.branch ?? null;
  const deploymentUrl = normalizeObservedUrl(deployment.url, "Cloudflare deployment URL");
  if (deploymentId !== options.cloudflareDeploymentId || commitHash !== options.expectedHead || branch !== REQUIRED_BRANCH
    || deploymentUrl !== options.observedImmutableUrl || (deployment.project_name && deployment.project_name !== REQUIRED_CLOUDFLARE_PROJECT)) {
    throw new Error("Cloudflare deployment identity differs from the exact Phase 5A bindings");
  }
  if (deployment.environment && deployment.environment !== "preview") throw new Error("Phase 5A branch deployment must remain a preview deployment");
  if (Array.isArray(deployment.aliases) && deployment.aliases.length > 0) {
    const aliases = deployment.aliases.map((alias) => normalizeObservedUrl(alias, "Cloudflare deployment alias"));
    if (!aliases.includes(options.observedBranchUrl)) throw new Error("Observed branch URL is absent from Cloudflare deployment aliases");
  }
  const stage = terminalCloudflareStage(deployment);
  return {
    accountId: options.cloudflareAccountId,
    project: REQUIRED_CLOUDFLARE_PROJECT,
    deploymentId,
    deploymentUrl,
    branchUrl: options.observedBranchUrl,
    branch,
    commitHash,
    environment: deployment.environment ?? "preview",
    authoritySource: "CLOUDFLARE_API",
    terminalStage: { name: stage.name, status: stage.status, endedOn: stage.ended_on },
  };
}

async function recursiveFiles(root, relative = "") {
  const directory = relative ? path.join(root, ...relative.split("/")) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are prohibited in dist: ${child}`);
    if (entry.isDirectory()) files.push(...await recursiveFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`Unsupported dist entry: ${child}`);
  }
  return files.sort((left, right) => Buffer.from(left, "utf8").compare(Buffer.from(right, "utf8")));
}

export function classifyDistPath(relativePath) {
  const normalized = String(relativePath ?? "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized !== path.posix.normalize(normalized)) return "invalid";
  if (normalized === "_headers") return "headers";
  if (normalized === "robots.txt") return "robots";
  if (/^(?:sitemap(?:-index|-\d+)?\.xml)$/.test(normalized)) return "sitemap";
  if (normalized.endsWith(".html")) return "html";
  if (/^_astro\/[a-z0-9._-]+\.css$/i.test(normalized)) return "css";
  if (/^_astro\/[a-z0-9._-]+\.js$/i.test(normalized)) return "javascript";
  if (/^fonts\/[a-z0-9._-]+\.woff2$/i.test(normalized)) return "font";
  if (/^fonts\/licenses\/[a-z0-9._-]+\.txt$/i.test(normalized)) return "font-license";
  if (/^brand\/[a-z0-9._-]+\.svg$/i.test(normalized)) return "brand";
  if (/^media\/cinematic\/phase-4r2\/(?:manifests\/[a-z0-9._-]+\.json|media\/[a-z0-9._-]+\.mp4|posters\/[a-z0-9._-]+\.png)$/i.test(normalized)) return "cinematic";
  if (/^media\/maradin\/[a-z0-9._-]+\.(?:mp4|jpe?g|png)$/i.test(normalized)) return "maradin";
  return "unsupported";
}

export function publicPathForDistFile(relativePath, missing404Path = "/__phase5a-real-404-probe__/") {
  if (relativePath === "404.html") return missing404Path;
  if (relativePath === "index.html") return "/";
  if (relativePath.endsWith("/index.html")) return `/${relativePath.slice(0, -"index.html".length)}`;
  return `/${relativePath}`;
}

function stripReferenceSuffix(reference) {
  return reference.split("#", 1)[0].split("?", 1)[0];
}

export function resolveDistReference(fromRelativePath, rawReference) {
  const raw = String(rawReference ?? "").trim();
  if (!raw || raw.startsWith("#") || /^(?:data|blob|mailto|tel|javascript):/i.test(raw) || /^https?:\/\//i.test(raw) || raw.startsWith("//")) return null;
  let reference;
  try {
    reference = decodeURIComponent(stripReferenceSuffix(raw));
  } catch {
    throw new Error(`Malformed percent encoding in dist reference: ${raw}`);
  }
  if (!reference) return null;
  let candidate = reference.startsWith("/")
    ? path.posix.normalize(reference.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), reference));
  if (candidate === ".") candidate = "index.html";
  else if (reference.endsWith("/")) candidate = `${candidate.replace(/\/$/, "")}/index.html`;
  candidate = candidate.replace(/^\.\//, "");
  if (!path.posix.extname(candidate) && !candidate.endsWith("index.html")) candidate = `${candidate}/index.html`;
  if (!candidate || candidate === ".." || candidate.startsWith("../") || path.posix.isAbsolute(candidate)) throw new Error(`Dist reference escapes the build root: ${raw}`);
  return candidate;
}

export function extractDistReferences(relativePath, text) {
  const references = new Set();
  const add = (value) => { if (value) references.add(value); };
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (extension === ".html") {
    for (const match of text.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
    for (const match of text.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
      for (const candidate of match[1].split(",")) add(candidate.trim().split(/\s+/, 1)[0]);
    }
  } else if (extension === ".css") {
    for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(match[1]);
    for (const match of text.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)) add(match[1]);
  } else if (extension === ".js") {
    for (const match of text.matchAll(/["'`]([^"'`\r\n]+\.(?:js|css|json|mp4|png|jpe?g|svg|woff2)(?:[?#][^"'`]*)?)["'`]/gi)) add(match[1]);
  }
  return [...references].sort();
}

function setEquals(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function exactManifestRuntimeFiles(manifest) {
  return [
    MANIFEST_URL_PATH.slice(1),
    ...manifest.assets.map((asset) => `media/cinematic/phase-4r2/${asset.file}`),
  ].sort();
}

export function validateDistGraphRecords(records, manifest, manifestBytes) {
  if (!Array.isArray(records) || records.length < 1) throw new Error("dist inventory is empty");
  const byPath = new Map(records.map((record) => [record.relativePath, record]));
  if (byPath.size !== records.length) throw new Error("dist inventory contains duplicate paths");
  const paths = sorted(byPath.keys());
  for (const relativePath of paths) {
    const category = classifyDistPath(relativePath);
    if (["invalid", "unsupported"].includes(category)) throw new Error(`Unclassified or unsafe dist file: ${relativePath}`);
    if (/\.(?:map|webm|zip|key|pem|env)$/i.test(relativePath) || /(?:^|\/)(?:node_modules|src|source|cache|\.cache|\.git|artifacts)(?:\/|$)/i.test(relativePath)) {
      throw new Error(`Forbidden source/cache/private payload in dist: ${relativePath}`);
    }
    if (!Buffer.isBuffer(byPath.get(relativePath).bytes)) throw new Error(`dist record lacks bytes: ${relativePath}`);
  }
  const categoryPaths = (category) => paths.filter((relativePath) => classifyDistPath(relativePath) === category);
  if (!setEquals(categoryPaths("html"), [...HTML_AUTHORITY_FILES])) throw new Error("dist must contain the exact homepage, eight supporting routes, Maradin route, and real 404 HTML authority");
  if (!setEquals(categoryPaths("font"), [...FONT_AUTHORITY_FILES])) throw new Error("dist font authority differs");
  if (!setEquals(categoryPaths("maradin"), [...MARADIN_AUTHORITY_FILES])) throw new Error("dist Maradin authority differs");
  if (!setEquals(categoryPaths("headers"), ["_headers"]) || !setEquals(categoryPaths("robots"), ["robots.txt"]) || categoryPaths("sitemap").length < 1) {
    throw new Error("dist robots/sitemap/_headers authority is incomplete");
  }
  if (categoryPaths("css").length < 1 || categoryPaths("javascript").length < 1) throw new Error("dist emitted CSS/JavaScript authority is incomplete");
  const cinematic = categoryPaths("cinematic");
  const expectedCinematic = exactManifestRuntimeFiles(manifest);
  if (!setEquals(cinematic, expectedCinematic)) throw new Error("dist cinematic inventory differs from the exact unchanged production manifest");
  const deployedManifest = byPath.get(MANIFEST_URL_PATH.slice(1))?.bytes;
  if (!deployedManifest?.equals(manifestBytes)) throw new Error("dist active-media manifest lacks exact byte parity with tracked authority");
  for (const asset of manifest.assets) {
    const relativePath = `media/cinematic/phase-4r2/${asset.file}`;
    const bytes = byPath.get(relativePath)?.bytes;
    if (!bytes || bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) throw new Error(`dist cinematic byte/hash authority differs: ${relativePath}`);
  }

  const edges = new Map();
  for (const relativePath of [...categoryPaths("html"), ...categoryPaths("css"), ...categoryPaths("javascript")]) {
    const targets = [];
    for (const reference of extractDistReferences(relativePath, byPath.get(relativePath).bytes.toString("utf8"))) {
      const resolved = resolveDistReference(relativePath, reference);
      if (!resolved) continue;
      if (!byPath.has(resolved)) {
        if (reference.startsWith("/") || reference.startsWith("./") || reference.startsWith("../")) throw new Error(`Local dist reference is missing: ${relativePath} -> ${reference}`);
        continue;
      }
      targets.push(resolved);
    }
    edges.set(relativePath, sorted(new Set(targets)));
  }
  const walk = (roots, allowedCategory) => {
    const reached = new Set();
    const queue = [...roots];
    while (queue.length) {
      const current = queue.shift();
      if (reached.has(current)) continue;
      reached.add(current);
      for (const target of edges.get(current) ?? []) if (classifyDistPath(target) === allowedCategory) queue.push(target);
    }
    return reached;
  };
  const htmlEdges = categoryPaths("html").flatMap((relativePath) => edges.get(relativePath) ?? []);
  const reachableCss = walk(htmlEdges.filter((candidate) => classifyDistPath(candidate) === "css"), "css");
  const reachableJs = walk(htmlEdges.filter((candidate) => classifyDistPath(candidate) === "javascript"), "javascript");
  if (!setEquals(sorted(reachableCss), categoryPaths("css"))) throw new Error("Every emitted CSS file must be reachable from HTML");
  if (!setEquals(sorted(reachableJs), categoryPaths("javascript"))) throw new Error("Every emitted JavaScript file must be transitively reachable from HTML");
  const referencedFonts = new Set(categoryPaths("css").flatMap((relativePath) => edges.get(relativePath) ?? []).filter((candidate) => classifyDistPath(candidate) === "font"));
  if (!setEquals(sorted(referencedFonts), categoryPaths("font"))) throw new Error("Every emitted font must be referenced by emitted CSS");
  const referencedCinematicManifest = categoryPaths("javascript").some((relativePath) => (edges.get(relativePath) ?? []).includes(MANIFEST_URL_PATH.slice(1)));
  if (!referencedCinematicManifest) throw new Error("The exact cinematic manifest must be referenced by emitted JavaScript");
  const maradinHtml = "pocs/maradin/index.html";
  const referencedMaradin = new Set((edges.get(maradinHtml) ?? []).filter((candidate) => classifyDistPath(candidate) === "maradin"));
  if (!setEquals(sorted(referencedMaradin), categoryPaths("maradin"))) throw new Error("Every Maradin asset must be referenced by the Maradin route");

  const fileLedger = paths.map((relativePath) => ({
    relativePath,
    category: classifyDistPath(relativePath),
    bytes: byPath.get(relativePath).bytes.length,
    sha256: sha256(byPath.get(relativePath).bytes),
  }));
  const counts = Object.fromEntries([...new Set(fileLedger.map((record) => record.category))].sort().map((category) => [category, fileLedger.filter((record) => record.category === category).length]));
  return { paths, byPath, edges, fileLedger, counts, publicPaths: paths.filter((relativePath) => relativePath !== "_headers") };
}

export function parseHeadersFile(text) {
  const policies = [];
  let current = null;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      if (!line.startsWith("/") || /\s/.test(line)) throw new Error(`Invalid _headers route rule: ${line}`);
      current = { pattern: line, headers: {} };
      policies.push(current);
      continue;
    }
    if (!current) throw new Error("_headers field appears before a route rule");
    const match = line.trim().match(/^([^:]+):\s*(.+)$/);
    if (!match) throw new Error(`Invalid _headers field: ${line.trim()}`);
    const name = match[1].trim().toLowerCase();
    if (name in current.headers) throw new Error(`Duplicate _headers field ${name} for ${current.pattern}`);
    current.headers[name] = match[2].trim();
  }
  if (policies.length < 1) throw new Error("_headers contains no route policies");
  return policies;
}

function normalizedHeaderDirectives(value) {
  return String(value ?? "").toLowerCase().split(",").map((part) => part.trim()).filter(Boolean).sort();
}

export function assertRequiredHeaderPolicies(policies) {
  for (const [pattern, cacheControl] of Object.entries(REQUIRED_HEADER_POLICIES)) {
    const matches = policies.filter((policy) => policy.pattern === pattern);
    if (matches.length !== 1 || !setEquals(normalizedHeaderDirectives(matches[0].headers["cache-control"]), normalizedHeaderDirectives(cacheControl))) {
      throw new Error(`_headers must contain the exact Phase 5A cache policy for ${pattern}`);
    }
  }
  return true;
}

function headerPatternMatches(pattern, publicPath) {
  const expression = `^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`;
  return new RegExp(expression).test(publicPath);
}

function matchingHeaderPolicies(policies, publicPath) {
  return policies.filter((policy) => headerPatternMatches(policy.pattern, publicPath));
}

function expectedMime(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return ({
    ".html": ["text/html"],
    ".css": ["text/css"],
    ".js": ["javascript"],
    ".woff2": ["font/woff2", "application/font-woff2"],
    ".svg": ["image/svg+xml"],
    ".mp4": ["video/mp4"],
    ".png": ["image/png"],
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".json": ["application/json"],
    ".txt": ["text/plain"],
    ".xml": ["application/xml", "text/xml"],
  })[extension] ?? [];
}

export function validateObservedHeaders(record, relativePath, policies) {
  const contentType = String(record.contentType ?? "").toLowerCase();
  const expected = expectedMime(relativePath);
  if (expected.length < 1 || !expected.some((mime) => contentType.includes(mime))) throw new Error(`MIME mismatch for ${relativePath}: ${record.contentType}`);
  const matched = matchingHeaderPolicies(policies, record.publicPath);
  for (const policy of matched) {
    const required = normalizedHeaderDirectives(policy.headers["cache-control"]);
    const actual = normalizedHeaderDirectives(record.cacheControl);
    if (!required.every((directive) => actual.includes(directive))) throw new Error(`Observed Cache-Control does not enforce _headers rule ${policy.pattern}`);
  }
  const cacheControl = String(record.cacheControl ?? "");
  const privateResponse = /(?:^|,)\s*private(?:\s|,|$)/i.test(cacheControl);
  const noStoreResponse = /(?:^|,)\s*no-store(?:\s|,|$)/i.test(cacheControl);
  const expectedReal404 = relativePath === "404.html" && record.status === 404;
  if (privateResponse || (noStoreResponse && !expectedReal404)) throw new Error(`Unsafe deployed Cache-Control for ${relativePath}`);
  return {
    expectedMime: expected,
    contentType: record.contentType,
    cacheControl: record.cacheControl,
    matchedPolicies: matched.map((policy) => policy.pattern),
    status: "PASS",
  };
}

export async function buildDistAuthority(distRoot, manifest, manifestBytes) {
  const paths = await recursiveFiles(distRoot);
  const records = [];
  for (const relativePath of paths) {
    const absolute = path.join(distRoot, ...relativePath.split("/"));
    const metadata = await lstat(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`dist authority is not a regular file: ${relativePath}`);
    records.push({ relativePath, bytes: await readFile(absolute) });
  }
  const graph = validateDistGraphRecords(records, manifest, manifestBytes);
  const headerPolicies = parseHeadersFile(graph.byPath.get("_headers").bytes.toString("utf8"));
  assertRequiredHeaderPolicies(headerPolicies);
  return { ...graph, headerPolicies };
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

export function classifyRange(record, expectedBytes) {
  if (record.status === 206) {
    if (record.bytes.length !== 1 || record.contentRange !== `bytes 0-0/${expectedBytes.length}` || !record.bytes.equals(expectedBytes.subarray(0, 1))) {
      throw new Error("Malformed or unequal partial response for the active H.264 range probe");
    }
    return { status: "SUPPORTED", httpStatus: 206, bytesReturned: 1, contentRange: record.contentRange, acceptRanges: record.acceptRanges, byteZeroSha256: sha256(record.bytes) };
  }
  if (record.status === 200) {
    if (!record.bytes.equals(expectedBytes)) throw new Error("Range-ignored active H.264 response lacks full byte parity");
    return { status: "HONESTLY_IGNORED", httpStatus: 200, bytesReturned: record.bytes.length, contentRange: record.contentRange, acceptRanges: record.acceptRanges };
  }
  throw new Error(`Active H.264 range request returned HTTP ${record.status}`);
}

async function verifyOrigin(baseUrl, distAuthority, manifest, options) {
  const missing404Path = `/__phase5a-real-404-${options.expectedHead.slice(0, 12)}-${options.cloudflareDeploymentId.slice(0, 8)}/`;
  const files = [];
  const enforcedPolicies = new Set();
  for (const relativePath of distAuthority.publicPaths) {
    const publicPath = publicPathForDistFile(relativePath, missing404Path);
    const response = await fetchPublicFile(baseUrl, publicPath, options.timeoutMs);
    const expectedStatus = relativePath === "404.html" ? 404 : 200;
    const local = distAuthority.byPath.get(relativePath).bytes;
    if (response.status !== expectedStatus || !response.bytes.equals(local)) {
      throw new Error(`Deployed dist byte/status parity failed at ${baseUrl}: ${relativePath}`);
    }
    const headers = validateObservedHeaders(response, relativePath, distAuthority.headerPolicies);
    for (const pattern of headers.matchedPolicies) enforcedPolicies.add(pattern);
    files.push({
      relativePath,
      publicPath,
      expectedHttpStatus: expectedStatus,
      actualHttpStatus: response.status,
      bytes: local.length,
      sha256: sha256(local),
      headers,
      status: "PASS",
    });
  }
  for (const pattern of Object.keys(REQUIRED_HEADER_POLICIES)) {
    if (!enforcedPolicies.has(pattern)) throw new Error(`No deployed response exercised required _headers policy: ${pattern}`);
  }
  const desktopVideo = manifest.assets.find((asset) => asset.kind === "video" && asset.codec === "h264" && asset.family === "desktop");
  if (!desktopVideo) throw new Error("Active manifest has no unique desktop H.264 range authority");
  const videoRelative = `media/cinematic/phase-4r2/${desktopVideo.file}`;
  const videoPublicPath = `/${videoRelative}`;
  const rangeResponse = await fetchPublicFile(baseUrl, videoPublicPath, options.timeoutMs, { Accept: "video/mp4", Range: "bytes=0-0" });
  const range = classifyRange(rangeResponse, distAuthority.byPath.get(videoRelative).bytes);
  return {
    baseUrl,
    status: "PASS",
    missing404Probe: { publicPath: missing404Path, httpStatus: 404, localAuthority: "404.html", byteParity: true },
    completeDistGraph: {
      publicFileCount: files.length,
      allPublicFilesCompared: true,
      localHeadersControlExcludedFromPublicFetch: true,
      localHeadersControlBehaviorObserved: true,
      files,
    },
    activeH264RangeSemantics: { publicPath: videoPublicPath, response: range, status: "PASS" },
  };
}

export function assertSafeReport(report) {
  const text = stableJson(report);
  if (PRIVATE_TEXT.test(text)) throw new Error("Deployment report contains private paths, loopback URLs, UNC paths, or token-shaped secrets");
  return Buffer.from(text, "utf8");
}

function syntheticOptions() {
  return validateOptions(parseArguments([
    "--expected-head", "a".repeat(40),
    "--repository", REQUIRED_REPOSITORY,
    "--branch", REQUIRED_BRANCH,
    "--github-check-run-id", "123456789",
    "--cloudflare-account-id", "b".repeat(32),
    "--cloudflare-project", REQUIRED_CLOUDFLARE_PROJECT,
    "--cloudflare-deployment-id", "11111111-2222-4333-8444-555555555555",
    "--observed-immutable-url", "https://12345678.qsite1.pages.dev/",
    "--observed-branch-url", "https://feature-phase-5a.qsite1.pages.dev/",
    "--output", path.resolve(ROOT, "..", REPORT_FILENAME),
    "--dry-run",
  ]));
}

export async function selfTest() {
  const options = syntheticOptions();
  const checkpoints = CHECKPOINT_SUBJECTS.map((subject, index) => ({
    sha: index === CHECKPOINT_SUBJECTS.length - 1 ? options.expectedHead : String(index + 1).repeat(40),
    parents: [index === 0 ? ACCEPTED_PHASE4_SHA : String(index).repeat(40)],
    subject,
  }));
  assertCheckpointChain(checkpoints, options.expectedHead);
  const policies = parseHeadersFile(Object.entries(REQUIRED_HEADER_POLICIES).map(([pattern, value]) => `${pattern}\n  Cache-Control: ${value}`).join("\n\n"));
  assertRequiredHeaderPolicies(policies);
  if (classifyDistPath("404.html") !== "html" || classifyDistPath("_headers") !== "headers"
    || classifyDistPath("_astro/app.hash.js") !== "javascript" || classifyDistPath("media/maradin/proof.jpg") !== "maradin") {
    throw new Error("dist classifier self-test failed");
  }
  if (publicPathForDistFile("pocs/maradin/index.html") !== "/pocs/maradin/"
    || resolveDistReference("_astro/app.hash.js", "./chunk.hash.js") !== "_astro/chunk.hash.js") {
    throw new Error("dist public/reference mapping self-test failed");
  }
  const supported = classifyRange({ status: 206, bytes: Buffer.from("a"), contentRange: "bytes 0-0/3", acceptRanges: "bytes" }, Buffer.from("abc"));
  const ignored = classifyRange({ status: 200, bytes: Buffer.from("abc"), contentRange: null, acceptRanges: null }, Buffer.from("abc"));
  if (supported.status !== "SUPPORTED" || ignored.status !== "HONESTLY_IGNORED") throw new Error("range self-test failed");
  assertSafeReport({ schema: SCHEMA, status: "PASS", branch: REQUIRED_BRANCH });
  process.stdout.write(stableJson({
    schema: `${SCHEMA}.self-test`,
    status: "PASS",
    checkpointCount: checkpoints.length,
    requiredHeaderPolicyCount: policies.filter((policy) => policy.pattern in REQUIRED_HEADER_POLICIES).length,
    rangeStates: [supported.status, ignored.status],
  }));
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) return printHelp();
  if (options.selfTest) return selfTest();
  validateOptions(options);
  if (options.dryRun) {
    process.stdout.write(stableJson({
      schema: `${SCHEMA}.dry-run`,
      status: "PASS",
      writesPerformed: false,
      filesystemReadsPerformed: false,
      gitCommandsPerformed: false,
      networkRequestsPerformed: false,
      expectedHead: options.expectedHead,
      expectedBase: ACCEPTED_PHASE4_SHA,
      expectedMain: MAIN_SHA,
      repository: REQUIRED_REPOSITORY,
      branch: REQUIRED_BRANCH,
      cloudflare: { project: REQUIRED_CLOUDFLARE_PROJECT, deploymentId: options.cloudflareDeploymentId },
      observedUrls: { immutable: options.observedImmutableUrl, branch: options.observedBranchUrl },
      checkpointCount: CHECKPOINT_SUBJECTS.length,
      origins: 2,
    }));
    return;
  }

  const verificationStartedAt = new Date().toISOString();
  await Promise.all([access(options.manifest), access(options.dist)]);
  try {
    await stat(options.output);
    throw new Error("--output must be fresh and must not already exist");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const resolvedOutput = await resolvedFromAncestor(options.output);
  if (isWithin(ROOT, resolvedOutput) || isWithin(os.tmpdir(), resolvedOutput)) throw new Error("Resolved deployment report path enters the repository or temporary directory");

  const manifestBytes = await readFile(options.manifest);
  if (sha256(manifestBytes) !== ACTIVE_MEDIA_MANIFEST_SHA256) throw new Error("Accepted active-media manifest byte authority changed");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  validateActiveManifest(manifest);
  const [repository, distAuthority] = await Promise.all([
    repositoryAuthority(options.expectedHead, options.manifest),
    buildDistAuthority(options.dist, manifest, manifestBytes),
  ]);
  const github = await verifyGithub(options, process.env[options.githubTokenEnvironment]);
  const cloudflareToken = process.env[options.cloudflareTokenEnvironment];
  const cloudflare = cloudflareToken ? await verifyCloudflare(options, cloudflareToken) : verifyCloudflareGithubCheck(options, github);
  const [immutable, branch] = await Promise.all([
    verifyOrigin(options.observedImmutableUrl, distAuthority, manifest, options),
    verifyOrigin(options.observedBranchUrl, distAuthority, manifest, options),
  ]);

  const report = {
    schema: SCHEMA,
    status: "PASS",
    verificationStartedAt,
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
      expectedBase: ACCEPTED_PHASE4_SHA,
      expectedMain: MAIN_SHA,
      immutableUrl: options.observedImmutableUrl,
      branchUrl: options.observedBranchUrl,
      immutable,
      branch,
    },
    productionManifest: {
      repositoryPath: ACTIVE_MEDIA_MANIFEST_RELATIVE,
      publicPath: MANIFEST_URL_PATH,
      bytes: manifestBytes.length,
      sha256: sha256(manifestBytes),
      sourceBlendSha256: SOURCE_BLEND_SHA256,
      schema: manifest.schema,
      assetCount: manifest.assets.length,
      unchangedAndNotRerendered: true,
      h264Only: true,
      vp9WebmCount: 0,
    },
    distGraph: {
      status: "PASS",
      completeFileCount: distAuthority.fileLedger.length,
      publicFileCount: distAuthority.publicPaths.length,
      localHeadersControl: distAuthority.fileLedger.find((record) => record.relativePath === "_headers"),
      localHeadersPolicies: distAuthority.headerPolicies,
      counts: distAuthority.counts,
      files: distAuthority.fileLedger,
      allHtmlAndReal404: true,
      everyTransitiveJavaScript: true,
      allCssFontsCinematicMaradinRobotsSitemap: true,
      headersBehaviorVerifiedOnBothOrigins: true,
    },
    checks: {
      exactCleanHeadAndEmptyUntrackedInventory: true,
      acceptedPhase4ExactParentAndAncestor: true,
      exactFiveLinearCheckpointsAndNoMerges: true,
      localUpstreamLiveRemoteParity: true,
      localRemoteGithubMainUnchanged: true,
      githubCommitBranchAndCheckRunExact: true,
      cloudflareAccountProjectDeploymentCommitBranchExact: true,
      cloudflareTerminalPreviewDeploySuccessful: true,
      bothObservedOriginsExact: true,
      completeDistGraphByteParityOnBothOrigins: true,
      real404StatusAndBodyParityOnBothOrigins: true,
      localHeadersControlAndObservedBehaviorParity: true,
      unchangedPhase4ProductionMedia: true,
      credentialsAndPrivatePathsExcluded: true,
    },
    humanReviewGates: HUMAN_GATES,
    authorization: {
      authorSelfApproved: false,
      deployerSelfApproved: false,
      humanAccepted: false,
      mainMerged: false,
      phase5BAuthorized: false,
    },
  };
  const outputBytes = assertSafeReport(report);
  await atomicWrite(options.output, outputBytes);
  process.stdout.write(stableJson({
    status: "PASS",
    report: { basename: path.basename(options.output), bytes: outputBytes.length, sha256: sha256(outputBytes) },
    completeDistFileCount: distAuthority.fileLedger.length,
    publicByteComparisons: distAuthority.publicPaths.length * 2,
    real404Probes: 2,
    rangeSemanticsProbes: 2,
  }));
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`Phase 5A deployment verification failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
