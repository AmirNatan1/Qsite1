#!/usr/bin/env node

/**
 * Read-only Phase 5B Cloudflare deployment verifier.
 *
 * The normal verification path may write one fresh report outside the
 * repository and temporary directory. Imports, --self-test, and --dry-run do
 * not run Git, read the build, access the network, or write a report.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPT_RELATIVE = "scripts/verify-phase5b-deployment.mjs";
export const SCHEMA = "quantum-hub.phase-5b.deployment-verification.v1";
export const REPORT_FILENAME = "phase-5b-deployment-verification.json";
export const REQUIRED_REPOSITORY = "AmirNatan1/Qsite1";
export const REQUIRED_REMOTE_URL = "https://github.com/AmirNatan1/Qsite1.git";
export const REQUIRED_BRANCH = "feature/phase-5b-supporting-route-production";
export const ACCEPTED_PHASE5AR_SHA = "b6a9d4f6e05412dfd460a657edfd8be4ce7eef2c";
export const FROZEN_MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const REQUIRED_CLOUDFLARE_ACCOUNT_ID = "16bccc18bf7d54fd2538de7c1b5f19ed";
export const REQUIRED_CLOUDFLARE_PROJECT = "qsite1";
export const REQUIRED_BRANCH_URL = "https://feature-phase-5b-supporting.qsite1.pages.dev/";
export const CP8_HEAD_SHA = "1b890e945973ce4bc90ba5dda917d9656c4db9d6";
export const PROVISIONAL_CP8_CHECK_RUN_ID = "99183081974";
export const PROVISIONAL_CP8_DEPLOYMENT_ID = "d1775212-92ca-4217-94cc-b61bb32db1cc";
export const PROVISIONAL_CP8_IMMUTABLE_URL = "https://d1775212.qsite1.pages.dev/";

export const CHECKPOINT_SUBJECTS = Object.freeze([
  "Establish Phase 5B route production architecture",
  "Implement Phase 5B industry and startup experiences",
  "Implement Phase 5B industry territory experience",
  "Implement Phase 5B Proof and Maradin documentary routes",
  "Implement Phase 5B SPARK and About experiences",
  "Implement Phase 5B Contact and 404 experiences",
  "Harden Phase 5B responsive and accessibility behavior",
  "Harden Phase 5B publication media and performance safety",
  "Complete Phase 5B deployed human-review evidence",
]);

export const FIXED_CHECKPOINT_SHAS = Object.freeze([
  "1fcc260fc51810934b160eec38971184db2008e1",
  "58a87e333cca47b2495c373d2c934e69ec25d290",
  "5458b5d74411ac16b83874b725cc021605851326",
  "996c9a05a0f8a3a810f0d47a0288c12fac430093",
  "11952af17bb1cdb3f079902dfb5300ddafe42594",
  "508d54a517b9c28ac683fb3257df3afad24b72bb",
  "9a9ad82b266c663e5689c8a6884a90cfc835ef7c",
  CP8_HEAD_SHA,
]);

export const HUMAN_GATES = Object.freeze({
  "SUPPORTING-ROUTE PRODUCTION FIDELITY": "PENDING HUMAN REVIEW",
  "ROUTE-SPECIFIC SPATIAL IDENTITY": "PENDING HUMAN REVIEW",
  "RESPONSIVE + ACCESSIBLE INTEGRATION": "PENDING HUMAN REVIEW",
  "PUBLICATION + MEDIA SAFETY": "PENDING HUMAN REVIEW",
  "PERFORMANCE + RUNTIME SAFETY": "PENDING HUMAN REVIEW",
  "HOMEPAGE + PHASE 4/5A REGRESSION": "PENDING HUMAN REVIEW",
});

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

export const REQUIRED_HEADER_POLICIES = Object.freeze({
  "/_astro/*": "public, max-age=31556952, immutable",
  "/media/cinematic/phase-4r2/manifests/*": "public, max-age=0, must-revalidate",
  "/media/cinematic/phase-4r2/media/*": "public, max-age=31556952, immutable",
  "/media/cinematic/phase-4r2/posters/*": "public, max-age=31556952, immutable",
});

const HASH40 = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_DIST = path.join(ROOT, "dist");
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|(?:api|access|auth|secret)[_-]?token["'=:\s]+[a-z0-9._-]{16,})/i;

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

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    expectedHead: null,
    expectedBase: ACCEPTED_PHASE5AR_SHA,
    expectedMain: FROZEN_MAIN_SHA,
    repository: null,
    branch: REQUIRED_BRANCH,
    mainBranch: "main",
    remote: "origin",
    githubCheckRunId: null,
    cloudflareAccountId: null,
    cloudflareProject: null,
    cloudflareDeploymentId: null,
    observedImmutableUrl: null,
    observedBranchUrl: null,
    githubTokenEnvironment: "GITHUB_TOKEN",
    cloudflareTokenEnvironment: "CLOUDFLARE_API_TOKEN",
    dist: DEFAULT_DIST,
    output: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    dryRun: false,
    selfTest: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = valueAfter(argv, index, argument);
      index += 1;
      return value;
    };
    if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--expected-base" || argument === "--accepted-phase5ar") options.expectedBase = next().toLowerCase();
    else if (argument === "--expected-main" || argument === "--frozen-main") options.expectedMain = next().toLowerCase();
    else if (argument === "--repository") options.repository = next();
    else if (argument === "--branch") options.branch = next();
    else if (argument === "--main-branch") options.mainBranch = next();
    else if (argument === "--remote") options.remote = next();
    else if (argument === "--github-check-run-id") options.githubCheckRunId = next();
    else if (argument === "--cloudflare-account-id") options.cloudflareAccountId = next().toLowerCase();
    else if (argument === "--cloudflare-project") options.cloudflareProject = next();
    else if (argument === "--cloudflare-deployment-id" || argument === "--deployment-id") options.cloudflareDeploymentId = next().toLowerCase();
    else if (argument === "--observed-immutable-url" || argument === "--immutable-url") options.observedImmutableUrl = next();
    else if (argument === "--observed-branch-url" || argument === "--branch-url") options.observedBranchUrl = next();
    else if (argument === "--github-token-env") options.githubTokenEnvironment = next();
    else if (argument === "--cloudflare-token-env") options.cloudflareTokenEnvironment = next();
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

export function normalizePreviewUrl(value, label) {
  if (!value) throw new Error(`${label} is required`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${label} must be a credential-free HTTPS origin root`);
  }
  if (!url.hostname.endsWith(`.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev`)
    || url.hostname === `${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev`) {
    throw new Error(`${label} must be an observed ${REQUIRED_CLOUDFLARE_PROJECT} Cloudflare Pages preview origin`);
  }
  return url.toString();
}

function validateExternalOutput(output, required) {
  if (!output) {
    if (required) throw new Error(`--output must end exactly in ${REPORT_FILENAME}`);
    return;
  }
  if (path.basename(output) !== REPORT_FILENAME) throw new Error(`--output must end exactly in ${REPORT_FILENAME}`);
  if (isWithin(ROOT, output) || isWithin(os.tmpdir(), output)) {
    throw new Error("deployment report must remain outside the repository and temporary directory");
  }
}

export function validateOptions(options, { requireOutput = true } = {}) {
  if (!HASH40.test(options.expectedHead ?? "")) throw new Error("--expected-head must be exactly 40 lowercase hexadecimal characters");
  if (options.expectedHead === ACCEPTED_PHASE5AR_SHA || options.expectedHead === FROZEN_MAIN_SHA || options.expectedHead === CP8_HEAD_SHA) {
    throw new Error("--expected-head must be the new CP9 commit, not an earlier authority");
  }
  if (options.expectedBase !== ACCEPTED_PHASE5AR_SHA) throw new Error(`--expected-base must be exactly ${ACCEPTED_PHASE5AR_SHA}`);
  if (options.expectedMain !== FROZEN_MAIN_SHA) throw new Error(`--expected-main must be exactly ${FROZEN_MAIN_SHA}`);
  if (options.repository !== REQUIRED_REPOSITORY) throw new Error(`--repository must be exactly ${REQUIRED_REPOSITORY}`);
  if (options.branch !== REQUIRED_BRANCH) throw new Error(`--branch must be exactly ${REQUIRED_BRANCH}`);
  if (options.mainBranch !== "main") throw new Error("--main-branch must be exactly main");
  if (options.remote !== "origin") throw new Error("--remote must be exactly origin");
  if (!/^\d+$/.test(String(options.githubCheckRunId ?? ""))) throw new Error("--github-check-run-id must be numeric");
  if (String(options.githubCheckRunId) === PROVISIONAL_CP8_CHECK_RUN_ID) throw new Error("the provisional CP8 GitHub check cannot authorize CP9");
  if (options.cloudflareAccountId !== REQUIRED_CLOUDFLARE_ACCOUNT_ID) {
    throw new Error(`--cloudflare-account-id must be exactly ${REQUIRED_CLOUDFLARE_ACCOUNT_ID}`);
  }
  if (options.cloudflareProject !== REQUIRED_CLOUDFLARE_PROJECT) {
    throw new Error(`--cloudflare-project must be exactly ${REQUIRED_CLOUDFLARE_PROJECT}`);
  }
  if (!UUID.test(String(options.cloudflareDeploymentId ?? ""))) {
    throw new Error("--cloudflare-deployment-id must be a UUID, never a GitHub check-run ID");
  }
  if (options.cloudflareDeploymentId === PROVISIONAL_CP8_DEPLOYMENT_ID) {
    throw new Error("the provisional CP8 deployment UUID cannot authorize CP9");
  }
  if (!/^[A-Z_][A-Z0-9_]*$/.test(options.githubTokenEnvironment)
    || !/^[A-Z_][A-Z0-9_]*$/.test(options.cloudflareTokenEnvironment)) {
    throw new Error("token environment names must be uppercase environment identifiers");
  }

  options.observedImmutableUrl = normalizePreviewUrl(options.observedImmutableUrl, "--observed-immutable-url");
  options.observedBranchUrl = normalizePreviewUrl(options.observedBranchUrl, "--observed-branch-url");
  const requiredImmutable = `https://${options.cloudflareDeploymentId.slice(0, 8)}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`;
  if (options.observedImmutableUrl !== requiredImmutable) {
    throw new Error(`--observed-immutable-url must be exactly ${requiredImmutable}`);
  }
  if (options.observedBranchUrl !== REQUIRED_BRANCH_URL) {
    throw new Error(`--observed-branch-url must be exactly ${REQUIRED_BRANCH_URL}`);
  }
  if (options.observedImmutableUrl === options.observedBranchUrl) throw new Error("immutable and branch URLs must be distinct");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  if (path.resolve(options.dist) !== DEFAULT_DIST) throw new Error("--dist must be the exact repository dist root");
  validateExternalOutput(options.output, requireOutput);
  return options;
}

export function printHelp() {
  process.stdout.write(`Phase 5B deployment verifier\n\nUsage:\n  node ${SCRIPT_RELATIVE} \\\n+    --expected-head <40-hex-CP9-SHA> \\\n+    --expected-base ${ACCEPTED_PHASE5AR_SHA} --expected-main ${FROZEN_MAIN_SHA} \\\n+    --repository ${REQUIRED_REPOSITORY} --branch ${REQUIRED_BRANCH} \\\n+    --github-check-run-id <new-numeric-id> \\\n+    --cloudflare-account-id ${REQUIRED_CLOUDFLARE_ACCOUNT_ID} \\\n+    --cloudflare-project ${REQUIRED_CLOUDFLARE_PROJECT} --cloudflare-deployment-id <new-uuid> \\\n+    --observed-immutable-url https://<new-uuid-prefix>.qsite1.pages.dev/ \\\n+    --observed-branch-url ${REQUIRED_BRANCH_URL} \\\n+    --output <durable-external-directory>/${REPORT_FILENAME}\n\nOptions:\n  --remote origin              Exact configured/live remote\n  --main-branch main           Frozen production branch\n  --dist DIR                   Exact local emitted dist root\n  --github-token-env NAME      Default GITHUB_TOKEN\n  --cloudflare-token-env NAME  Default CLOUDFLARE_API_TOKEN; signed-check fallback when absent\n  --timeout-ms N               Per-request timeout, 5000..120000\n  --dry-run                    Validate bindings only; no Git, build reads, network, or writes\n  --self-test                  Run pure contract tests only\n  --help, -h                   Show help\n`);
}

export function assertCheckpointChain(records, expectedHead) {
  if (!Array.isArray(records) || records.length !== CHECKPOINT_SUBJECTS.length) {
    throw new Error(`Phase 5B must contain exactly ${CHECKPOINT_SUBJECTS.length} checkpoint commits`);
  }
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const expectedSha = index < FIXED_CHECKPOINT_SHAS.length ? FIXED_CHECKPOINT_SHAS[index] : expectedHead;
    if (!HASH40.test(record?.sha ?? "") || record.sha !== expectedSha) {
      throw new Error(`Phase 5B checkpoint CP${index + 1} SHA differs from its exact authority`);
    }
    if (record.subject !== CHECKPOINT_SUBJECTS[index]) {
      throw new Error(`Phase 5B checkpoint CP${index + 1} subject differs`);
    }
    const parents = Array.isArray(record.parents) ? record.parents : [];
    const expectedParent = index === 0 ? ACCEPTED_PHASE5AR_SHA : records[index - 1].sha;
    if (parents.length !== 1 || parents[0] !== expectedParent) {
      throw new Error(`Phase 5B checkpoint CP${index + 1} must be the exact linear child of ${expectedParent}`);
    }
  }
  if (records.at(-1).sha !== expectedHead) throw new Error("Phase 5B CP9 is not the explicit final HEAD");
  return true;
}

export function parseLinearLog(text, expectedHead) {
  const records = String(text).split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, parentText, ...subject] = line.split("\t");
    return { sha, parents: String(parentText ?? "").split(/\s+/).filter(Boolean), subject: subject.join("\t") };
  });
  assertCheckpointChain(records, expectedHead);
  return records;
}

function parseRemoteRefs(text) {
  return new Map(String(text).split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, reference, ...extra] = line.trim().split(/\s+/);
    if (extra.length || !HASH40.test(sha ?? "") || !reference) throw new Error("live remote ref response is malformed");
    return [reference, sha];
  }));
}

async function git(...arguments_) {
  const { stdout } = await execFileAsync("git", arguments_, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}

async function gitExit(...arguments_) {
  try {
    await execFileAsync("git", arguments_, { cwd: ROOT, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    return true;
  } catch (error) {
    if (Number.isInteger(error?.code)) return false;
    throw error;
  }
}

function normalizedRemoteUrl(value) {
  return String(value ?? "").replace(/\/$/, "");
}

async function verifyRepository(options) {
  const [
    head,
    branch,
    mainHead,
    originMain,
    originBranch,
    statusText,
    upstreamRef,
    upstreamHead,
    remoteUrl,
    logText,
    mergeCommits,
    acceptedAncestor,
    headMergedIntoMain,
    trackedScript,
  ] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("branch", "--show-current"),
    git("rev-parse", "main"),
    git("rev-parse", "origin/main"),
    git("rev-parse", `origin/${REQUIRED_BRANCH}`),
    git("status", "--porcelain=v1", "--untracked-files=all"),
    git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"),
    git("rev-parse", "@{upstream}"),
    git("remote", "get-url", "origin"),
    git("log", "--reverse", "--format=%H%x09%P%x09%s", `${ACCEPTED_PHASE5AR_SHA}..${options.expectedHead}`),
    git("rev-list", "--merges", `${ACCEPTED_PHASE5AR_SHA}..${options.expectedHead}`),
    gitExit("merge-base", "--is-ancestor", ACCEPTED_PHASE5AR_SHA, options.expectedHead),
    gitExit("merge-base", "--is-ancestor", options.expectedHead, "main"),
    git("ls-files", "--error-unmatch", "--", SCRIPT_RELATIVE),
  ]);

  assert.equal(head, options.expectedHead, "local HEAD differs from the expected CP9 SHA");
  assert.equal(branch, REQUIRED_BRANCH, "local branch differs from the Phase 5B branch");
  assert.equal(statusText, "", "deployment verification requires a clean tree, including no untracked files");
  assert.equal(mainHead, FROZEN_MAIN_SHA, "local main changed");
  assert.equal(originMain, FROZEN_MAIN_SHA, "origin/main changed");
  assert.equal(originBranch, options.expectedHead, "origin Phase 5B branch differs from CP9");
  assert.equal(upstreamRef, `origin/${REQUIRED_BRANCH}`, "Phase 5B branch tracks the wrong upstream");
  assert.equal(upstreamHead, options.expectedHead, "configured upstream differs from CP9");
  assert.equal(normalizedRemoteUrl(remoteUrl), normalizedRemoteUrl(REQUIRED_REMOTE_URL), "origin URL differs from the Qsite1 repository");
  assert.equal(acceptedAncestor, true, "accepted Phase 5A-R is not an ancestor of CP9");
  assert.equal(headMergedIntoMain, false, "CP9 is already merged into main");
  assert.equal(mergeCommits, "", "merge commits are prohibited in the Phase 5B checkpoint chain");
  assert.equal(trackedScript.replaceAll("\\", "/"), SCRIPT_RELATIVE, "deployment verifier is not the exact tracked script");
  const checkpoints = parseLinearLog(logText, options.expectedHead);

  const liveText = await git("ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${REQUIRED_BRANCH}`, "refs/heads/main");
  const live = parseRemoteRefs(liveText);
  if (live.size !== 2
    || live.get(`refs/heads/${REQUIRED_BRANCH}`) !== options.expectedHead
    || live.get("refs/heads/main") !== FROZEN_MAIN_SHA) {
    throw new Error("live origin branch/main refs differ from the Phase 5B authorities");
  }

  return {
    repository: REQUIRED_REPOSITORY,
    remoteUrl: REQUIRED_REMOTE_URL,
    branch: REQUIRED_BRANCH,
    head,
    exactParent: ACCEPTED_PHASE5AR_SHA,
    cleanTree: true,
    checkpoints,
    main: { branch: "main", headSha: mainHead, frozenAt: FROZEN_MAIN_SHA, containsPhase5BHead: false },
    upstream: { ref: upstreamRef, headSha: upstreamHead, parity: true },
    liveRemote: {
      branchRef: `refs/heads/${REQUIRED_BRANCH}`,
      branchHeadSha: live.get(`refs/heads/${REQUIRED_BRANCH}`),
      mainRef: "refs/heads/main",
      mainHeadSha: live.get("refs/heads/main"),
      parity: true,
    },
  };
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

async function jsonRequest(url, token, timeoutMs, label, github = false) {
  const headers = { Accept: github ? "application/vnd.github+json" : "application/json", "User-Agent": "quantum-hub-phase5b-deployment-verifier" };
  if (github) headers["X-GitHub-Api-Version"] = "2022-11-28";
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

function githubCheckpointRecords(comparison) {
  return (comparison.commits ?? []).map((commit) => ({
    sha: commit.sha,
    parents: (commit.parents ?? []).map((parent) => parent.sha),
    subject: String(commit.commit?.message ?? "").split(/\r?\n/, 1)[0],
  }));
}

function normalizedCheckRun(run) {
  return {
    id: String(run?.id ?? ""),
    name: run?.name ?? null,
    appSlug: run?.app?.slug ?? run?.appSlug ?? null,
    headSha: run?.head_sha ?? run?.headSha ?? null,
    status: run?.status ?? null,
    conclusion: run?.conclusion ?? null,
    completedAt: run?.completed_at ?? run?.completedAt ?? null,
    detailsUrl: run?.details_url ?? run?.detailsUrl ?? null,
    outputTitle: run?.output?.title ?? run?.outputTitle ?? null,
    outputSummary: run?.output?.summary ?? run?.outputSummary ?? null,
  };
}

export function assertSuccessfulGithubCheckRun(run) {
  const check = normalizedCheckRun(run);
  if (check.name !== "Cloudflare Pages" || check.status !== "completed" || check.conclusion !== "success"
    || !Number.isFinite(Date.parse(check.completedAt ?? ""))) {
    throw new Error("the explicit Cloudflare Pages GitHub check must be completed successfully");
  }
  return check;
}

function cloudflareDetailsIdentity(value) {
  try {
    const details = new URL(value);
    if (details.protocol !== "https:" || details.hostname !== "dash.cloudflare.com" || details.username || details.password || details.hash) return null;
    const routedTarget = details.searchParams.get("to");
    const target = routedTarget ?? details.pathname;
    if (routedTarget && (!target.startsWith("/") || target.startsWith("//") || target.includes("?") || target.includes("#"))) return null;
    const match = target.match(/^\/([0-9a-f]{32})\/pages\/view\/([^/]+)\/([0-9a-f-]{36})\/?$/i);
    if (!match) return null;
    return { accountId: match[1].toLowerCase(), project: match[2], deploymentId: match[3].toLowerCase() };
  } catch {
    return null;
  }
}

export function cloudflareDetailsBindDeployment(value, deploymentId) {
  const identity = cloudflareDetailsIdentity(value);
  return identity?.accountId === REQUIRED_CLOUDFLARE_ACCOUNT_ID
    && identity.project === REQUIRED_CLOUDFLARE_PROJECT
    && identity.deploymentId === String(deploymentId).toLowerCase();
}

export function verifyCloudflareGithubCheck(options, run) {
  const check = assertSuccessfulGithubCheckRun(run);
  assert.equal(check.id, String(options.githubCheckRunId), "GitHub check-run ID differs from the explicit authority");
  assert.equal(check.headSha, options.expectedHead, "Cloudflare GitHub check head differs from CP9");
  if (!cloudflareDetailsBindDeployment(check.detailsUrl, options.cloudflareDeploymentId)) {
    throw new Error("Cloudflare GitHub check details do not bind the exact account/project/deployment UUID");
  }
  const summary = String(check.outputSummary ?? "");
  if (check.outputTitle !== "Deployed successfully" || !/Deploy successful!/i.test(summary)
    || !summary.includes(`<code>${options.expectedHead.slice(0, 7)}</code>`)
    || !summary.includes(options.observedImmutableUrl.slice(0, -1))
    || !summary.includes(options.observedBranchUrl.slice(0, -1))) {
    throw new Error("Cloudflare signed check summary does not bind CP9 and both observed URLs");
  }
  return {
    authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
    accountId: REQUIRED_CLOUDFLARE_ACCOUNT_ID,
    project: REQUIRED_CLOUDFLARE_PROJECT,
    deploymentId: options.cloudflareDeploymentId,
    immutableUrl: options.observedImmutableUrl,
    branchUrl: options.observedBranchUrl,
    branch: REQUIRED_BRANCH,
    commitHash: options.expectedHead,
    environment: "preview",
    terminalStage: { name: "deploy", status: "success", endedOn: check.completedAt },
  };
}

async function verifyGithub(options, token) {
  const api = `https://api.github.com/repos/${REQUIRED_REPOSITORY}`;
  const [commit, branchReference, mainReference, baseComparison, checkRun] = await Promise.all([
    jsonRequest(`${api}/commits/${options.expectedHead}`, token, options.timeoutMs, "GitHub final commit", true),
    jsonRequest(`${api}/git/ref/heads/${encodeURIComponent(REQUIRED_BRANCH)}`, token, options.timeoutMs, "GitHub Phase 5B branch", true),
    jsonRequest(`${api}/git/ref/heads/main`, token, options.timeoutMs, "GitHub main", true),
    jsonRequest(`${api}/compare/${ACCEPTED_PHASE5AR_SHA}...${options.expectedHead}`, token, options.timeoutMs, "GitHub Phase 5B comparison", true),
    jsonRequest(`${api}/check-runs/${options.githubCheckRunId}`, token, options.timeoutMs, "GitHub Cloudflare check", true),
  ]);
  assert.equal(commit.sha, options.expectedHead, "GitHub final commit differs from CP9");
  assert.equal(branchReference.object?.sha, options.expectedHead, "GitHub Phase 5B branch differs from CP9");
  assert.equal(mainReference.object?.sha, FROZEN_MAIN_SHA, "GitHub main changed");
  if (baseComparison.merge_base_commit?.sha !== ACCEPTED_PHASE5AR_SHA || baseComparison.status !== "ahead"
    || baseComparison.ahead_by !== CHECKPOINT_SUBJECTS.length || baseComparison.behind_by !== 0) {
    throw new Error("GitHub Phase 5B comparison does not preserve the exact parent and nine-commit count");
  }
  const checkpoints = githubCheckpointRecords(baseComparison);
  assertCheckpointChain(checkpoints, options.expectedHead);
  const check = assertSuccessfulGithubCheckRun(checkRun);
  assert.equal(check.id, String(options.githubCheckRunId), "GitHub returned a different check-run ID");
  assert.equal(check.headSha, options.expectedHead, "GitHub Cloudflare check is not attached to CP9");
  return {
    repository: REQUIRED_REPOSITORY,
    commitSha: commit.sha,
    commitUrl: commit.html_url ?? null,
    branch: REQUIRED_BRANCH,
    branchHeadSha: branchReference.object.sha,
    mainHeadSha: mainReference.object.sha,
    acceptedBase: ACCEPTED_PHASE5AR_SHA,
    checkpoints,
    checkRun: check,
  };
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

async function verifyCloudflareApi(options, token) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${REQUIRED_CLOUDFLARE_ACCOUNT_ID}/pages/projects/${REQUIRED_CLOUDFLARE_PROJECT}/deployments/${options.cloudflareDeploymentId}`;
  const payload = await jsonRequest(endpoint, token, options.timeoutMs, "Cloudflare Pages deployment");
  if (payload.success !== true || !payload.result) throw new Error("Cloudflare API did not return a successful deployment result");
  const deployment = payload.result;
  const commitHash = deployment.deployment_trigger?.metadata?.commit_hash ?? deployment.source?.config?.commit_hash ?? null;
  const branch = deployment.deployment_trigger?.metadata?.branch ?? deployment.source?.config?.branch ?? null;
  const immutableUrl = normalizePreviewUrl(deployment.url, "Cloudflare deployment URL");
  const aliases = Array.isArray(deployment.aliases)
    ? deployment.aliases.map((alias) => normalizePreviewUrl(/^https:\/\//i.test(alias) ? alias : `https://${alias.replace(/\/$/, "")}/`, "Cloudflare alias"))
    : [];
  if (String(deployment.id).toLowerCase() !== options.cloudflareDeploymentId || commitHash !== options.expectedHead
    || branch !== REQUIRED_BRANCH || immutableUrl !== options.observedImmutableUrl
    || deployment.project_name !== REQUIRED_CLOUDFLARE_PROJECT || deployment.environment !== "preview"
    || !aliases.includes(options.observedBranchUrl)) {
    throw new Error("Cloudflare API deployment identity differs from the exact CP9 bindings");
  }
  const stage = terminalCloudflareStage(deployment);
  return {
    authoritySource: "CLOUDFLARE_API",
    accountId: REQUIRED_CLOUDFLARE_ACCOUNT_ID,
    project: REQUIRED_CLOUDFLARE_PROJECT,
    deploymentId: options.cloudflareDeploymentId,
    immutableUrl,
    branchUrl: options.observedBranchUrl,
    branch,
    commitHash,
    environment: deployment.environment,
    terminalStage: { name: stage.name, status: stage.status, endedOn: stage.ended_on ?? stage.endedOn },
  };
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameSet(left, right) {
  const a = sorted(left);
  const b = sorted(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function recursiveFiles(root, relative = "") {
  const directory = relative ? path.join(root, ...relative.split("/")) : root;
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`symbolic links are prohibited in dist: ${child}`);
    if (entry.isDirectory()) files.push(...await recursiveFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`unsupported dist entry: ${child}`);
  }
  return sorted(files);
}

export function parseHeadersFile(text) {
  const policies = [];
  let current = null;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      if (!line.startsWith("/") || /\s/.test(line)) throw new Error(`invalid _headers route rule: ${line}`);
      current = { pattern: line, headers: {} };
      policies.push(current);
      continue;
    }
    if (!current) throw new Error("_headers field appears before a route rule");
    const match = line.trim().match(/^([^:]+):\s*(.+)$/);
    if (!match) throw new Error(`invalid _headers field: ${line.trim()}`);
    const name = match[1].trim().toLowerCase();
    if (name in current.headers) throw new Error(`duplicate _headers field ${name} for ${current.pattern}`);
    current.headers[name] = match[2].trim();
  }
  if (policies.length < 1) throw new Error("_headers contains no route policies");
  return policies;
}

function normalizedHeaderDirectives(value) {
  return String(value ?? "").toLowerCase().split(",").map((part) => part.trim()).filter(Boolean).sort();
}

export function assertRequiredHeaderPolicies(policies) {
  for (const [pattern, requiredValue] of Object.entries(REQUIRED_HEADER_POLICIES)) {
    const matches = policies.filter((policy) => policy.pattern === pattern);
    if (matches.length !== 1
      || !sameSet(normalizedHeaderDirectives(matches[0].headers["cache-control"]), normalizedHeaderDirectives(requiredValue))) {
      throw new Error(`_headers must contain the exact Phase 5B cache policy for ${pattern}`);
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
  const expected = expectedMime(relativePath);
  const contentType = String(record.contentType ?? "").toLowerCase();
  if (expected.length < 1 || !expected.some((mime) => contentType.includes(mime))) {
    throw new Error(`MIME mismatch for ${relativePath}: ${record.contentType}`);
  }
  const matched = matchingHeaderPolicies(policies, record.publicPath);
  for (const policy of matched) {
    const required = normalizedHeaderDirectives(policy.headers["cache-control"]);
    const actual = normalizedHeaderDirectives(record.cacheControl);
    if (!required.every((directive) => actual.includes(directive))) {
      throw new Error(`observed Cache-Control does not enforce _headers rule ${policy.pattern}`);
    }
  }
  const cacheControl = String(record.cacheControl ?? "");
  const privateResponse = /(?:^|,)\s*private(?:\s|,|$)/i.test(cacheControl);
  const noStoreResponse = /(?:^|,)\s*no-store(?:\s|,|$)/i.test(cacheControl);
  const real404 = relativePath === "404.html" && record.status === 404;
  if (privateResponse || (noStoreResponse && !real404)) throw new Error(`unsafe deployed Cache-Control for ${relativePath}`);
  return {
    contentType: record.contentType,
    cacheControl: record.cacheControl,
    matchedPolicies: matched.map((policy) => policy.pattern),
    status: "PASS",
  };
}

export function publicPathForDistFile(relativePath, missing404Path = "/__phase5b-real-404-probe__/") {
  if (relativePath === "404.html") return missing404Path;
  if (relativePath === "index.html") return "/";
  if (relativePath.endsWith("/index.html")) return `/${relativePath.slice(0, -"index.html".length)}`;
  return `/${relativePath}`;
}

function hasNoindex(html) {
  return [...String(html).matchAll(/<meta\b[^>]*>/gi)].some((match) => /\bname=["']robots["']/i.test(match[0])
    && /\bcontent=["'][^"']*\bnoindex\b[^"']*["']/i.test(match[0]));
}

export function validateDistRecords(records) {
  if (!Array.isArray(records) || records.length < 1) throw new Error("dist inventory is empty");
  const byPath = new Map();
  for (const record of records) {
    const relativePath = String(record?.relativePath ?? "").replaceAll("\\", "/");
    if (!relativePath || relativePath.startsWith("/") || relativePath.includes("..")
      || relativePath !== path.posix.normalize(relativePath) || byPath.has(relativePath) || !Buffer.isBuffer(record?.bytes)) {
      throw new Error(`invalid or duplicate dist record: ${relativePath}`);
    }
    if (/\.(?:map|zip|key|pem|env)$/i.test(relativePath)
      || /(?:^|\/)(?:node_modules|src|source|cache|\.cache|\.git|artifacts)(?:\/|$)/i.test(relativePath)) {
      throw new Error(`forbidden source/cache/private payload in dist: ${relativePath}`);
    }
    byPath.set(relativePath, { relativePath, bytes: record.bytes });
  }
  const paths = sorted(byPath.keys());
  const htmlPaths = paths.filter((relativePath) => relativePath.endsWith(".html"));
  if (!sameSet(htmlPaths, HTML_AUTHORITY_FILES)) {
    throw new Error("dist must contain the exact homepage, nine supporting outputs, and real 404 HTML authority");
  }
  if (paths.includes("_redirects")) throw new Error("SPA redirects are prohibited because the real 404 must retain HTTP 404 semantics");
  for (const required of ["_headers", "robots.txt", "sitemap.xml"]) {
    if (!byPath.has(required)) throw new Error(`dist is missing required public control: ${required}`);
  }
  for (const prefix of ["_astro/", "media/cinematic/phase-4r2/manifests/", "media/cinematic/phase-4r2/media/", "media/cinematic/phase-4r2/posters/"]) {
    if (!paths.some((relativePath) => relativePath.startsWith(prefix))) throw new Error(`dist does not exercise required deployment policy: /${prefix}*`);
  }
  const notFound = byPath.get("404.html").bytes.toString("utf8");
  if (!hasNoindex(notFound) || !/data-route-production=["']404["']/i.test(notFound)
    || !/href=["']\/["']/i.test(notFound)) {
    throw new Error("real 404 HTML lacks noindex, production identity, or Home recovery");
  }
  const headerPolicies = parseHeadersFile(byPath.get("_headers").bytes.toString("utf8"));
  assertRequiredHeaderPolicies(headerPolicies);
  const fileLedger = paths.map((relativePath) => ({
    relativePath,
    requestPath: relativePath === "_headers" ? null : publicPathForDistFile(relativePath),
    bytes: byPath.get(relativePath).bytes.length,
    sha256: sha256(byPath.get(relativePath).bytes),
  }));
  return { byPath, paths, htmlPaths: sorted(htmlPaths), headerPolicies, fileLedger };
}

export async function buildDistAuthority(distRoot = DEFAULT_DIST) {
  const metadata = await stat(distRoot);
  if (!metadata.isDirectory()) throw new Error("built dist authority is not a directory");
  const records = [];
  for (const relativePath of await recursiveFiles(distRoot)) {
    const absolute = path.join(distRoot, ...relativePath.split("/"));
    const item = await lstat(absolute);
    if (!item.isFile() || item.isSymbolicLink()) throw new Error(`dist authority is not a regular file: ${relativePath}`);
    records.push({ relativePath, bytes: await readFile(absolute) });
  }
  return validateDistRecords(records);
}

export function validateDeployedRecord(response, localRecord, policies) {
  const expectedStatus = localRecord.relativePath === "404.html" ? 404 : 200;
  if (response.status !== expectedStatus) {
    throw new Error(`deployed HTTP status differs for ${localRecord.relativePath}: ${response.status}`);
  }
  if (!Buffer.isBuffer(response.bytes) || !response.bytes.equals(localRecord.bytes)) {
    throw new Error(`deployed byte parity differs for ${localRecord.relativePath}`);
  }
  const headers = validateObservedHeaders(response, localRecord.relativePath, policies);
  return {
    relativePath: localRecord.relativePath,
    publicPath: response.publicPath,
    expectedHttpStatus: expectedStatus,
    actualHttpStatus: response.status,
    bytes: localRecord.bytes.length,
    sha256: sha256(localRecord.bytes),
    headers,
    status: "PASS",
  };
}

async function fetchPublicFile(origin, publicPath, timeoutMs) {
  const response = await fetchBound(new URL(publicPath, origin), { headers: { Accept: "*/*" } }, timeoutMs);
  return {
    publicPath,
    status: response.status,
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
    cacheControl: response.headers.get("cache-control"),
  };
}

async function verifyOrigin(origin, distAuthority, options) {
  const missing404Path = `/__phase5b-real-404-${options.expectedHead.slice(0, 12)}-${options.cloudflareDeploymentId.slice(0, 8)}/`;
  const responses = [];
  const exercisedPolicies = new Set();
  for (const relativePath of distAuthority.paths.filter((candidate) => candidate !== "_headers")) {
    const local = distAuthority.byPath.get(relativePath);
    const publicPath = publicPathForDistFile(relativePath, missing404Path);
    const response = await fetchPublicFile(origin, publicPath, options.timeoutMs);
    const verified = validateDeployedRecord(response, local, distAuthority.headerPolicies);
    for (const policy of verified.headers.matchedPolicies) exercisedPolicies.add(policy);
    responses.push(verified);
  }
  for (const policy of Object.keys(REQUIRED_HEADER_POLICIES)) {
    if (!exercisedPolicies.has(policy)) throw new Error(`${origin} did not exercise required _headers policy ${policy}`);
  }
  return {
    origin,
    status: "PASS",
    real404: { publicPath: missing404Path, httpStatus: 404, localAuthority: "404.html", byteParity: true },
    fileCount: responses.length,
    totalBytes: responses.reduce((total, record) => total + record.bytes, 0),
    responses,
  };
}

function assertSafeReport(report) {
  const text = stableJson(report);
  if (PRIVATE_TEXT.test(text)) throw new Error("deployment report contains a private path, loopback URL, or credential-like value");
  return Buffer.from(text, "utf8");
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

function syntheticOptions() {
  return validateOptions(parseArguments([
    "--expected-head", "a".repeat(40),
    "--repository", REQUIRED_REPOSITORY,
    "--branch", REQUIRED_BRANCH,
    "--github-check-run-id", "123456789",
    "--cloudflare-account-id", REQUIRED_CLOUDFLARE_ACCOUNT_ID,
    "--cloudflare-project", REQUIRED_CLOUDFLARE_PROJECT,
    "--cloudflare-deployment-id", "12345678-1234-4234-8234-123456789abc",
    "--observed-immutable-url", "https://12345678.qsite1.pages.dev/",
    "--observed-branch-url", REQUIRED_BRANCH_URL,
    "--output", path.resolve(ROOT, "..", REPORT_FILENAME),
  ]));
}

function syntheticCheckpointChain(expectedHead) {
  return CHECKPOINT_SUBJECTS.map((subject, index) => ({
    sha: index < FIXED_CHECKPOINT_SHAS.length ? FIXED_CHECKPOINT_SHAS[index] : expectedHead,
    parents: [index === 0 ? ACCEPTED_PHASE5AR_SHA : index <= FIXED_CHECKPOINT_SHAS.length
      ? FIXED_CHECKPOINT_SHAS[index - 1]
      : expectedHead],
    subject,
  }));
}

export async function selfTest() {
  const options = syntheticOptions();
  const checkpoints = syntheticCheckpointChain(options.expectedHead);
  assertCheckpointChain(checkpoints, options.expectedHead);
  assert.throws(() => assertCheckpointChain(checkpoints.slice(0, -1), options.expectedHead), /exactly 9/);
  const policies = parseHeadersFile(Object.entries(REQUIRED_HEADER_POLICIES)
    .map(([pattern, value]) => `${pattern}\n  Cache-Control: ${value}`).join("\n\n"));
  assertRequiredHeaderPolicies(policies);
  const local404 = { relativePath: "404.html", bytes: Buffer.from("not-found") };
  validateDeployedRecord({
    publicPath: "/__phase5b-real-404-probe__/",
    status: 404,
    bytes: Buffer.from("not-found"),
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
  }, local404, policies);
  assert.equal(Object.keys(HUMAN_GATES).length, 6);
  assert.equal(new Set(Object.values(HUMAN_GATES)).size, 1);
  return {
    status: "PASS",
    tests: 8,
    checkpointCount: checkpoints.length,
    pendingHumanGateCount: Object.keys(HUMAN_GATES).length,
    requiredHeaderPolicyCount: Object.keys(REQUIRED_HEADER_POLICIES).length,
    provisionalCp8Rejected: true,
  };
}

export async function verifyDeployment(options) {
  validateOptions(options);
  try {
    await stat(options.output);
    throw new Error("--output must be fresh and must not already exist");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const resolvedOutput = await resolvedFromAncestor(options.output);
  if (isWithin(ROOT, resolvedOutput) || isWithin(os.tmpdir(), resolvedOutput)) {
    throw new Error("resolved deployment report path enters the repository or temporary directory");
  }
  await access(options.dist);
  const verificationStartedAt = new Date().toISOString();
  const [repository, distAuthority] = await Promise.all([
    verifyRepository(options),
    buildDistAuthority(options.dist),
  ]);
  const github = await verifyGithub(options, process.env[options.githubTokenEnvironment]);
  const cloudflareToken = process.env[options.cloudflareTokenEnvironment];
  const cloudflare = cloudflareToken
    ? await verifyCloudflareApi(options, cloudflareToken)
    : verifyCloudflareGithubCheck(options, github.checkRun);
  const [immutable, branch] = await Promise.all([
    verifyOrigin(options.observedImmutableUrl, distAuthority, options),
    verifyOrigin(options.observedBranchUrl, distAuthority, options),
  ]);

  const report = {
    schema: SCHEMA,
    status: "PASS",
    verificationStartedAt,
    generatedAt: new Date().toISOString(),
    repository,
    github,
    cloudflare,
    dist: {
      files: distAuthority.fileLedger,
      totals: {
        files: distAuthority.fileLedger.length,
        bytes: distAuthority.fileLedger.reduce((total, record) => total + record.bytes, 0),
      },
      exactHtmlAuthority: [...HTML_AUTHORITY_FILES],
      real404Authority: "404.html",
      requiredHeaderPolicies: REQUIRED_HEADER_POLICIES,
    },
    origins: { immutable, branch },
    checks: {
      exactNineCommitChain: true,
      fixedCp1ThroughCp8Shas: true,
      cp9DirectParentIsCp8: true,
      cleanTree: true,
      localUpstreamLiveParity: true,
      frozenMainUnchanged: true,
      cloudflareDeploymentIdentityBound: true,
      provisionalCp8DeploymentRejected: true,
      completeImmutableByteParity: true,
      completeBranchByteParity: true,
      real404StatusAndByteParity: true,
      requiredHeadersObservedOnBothOrigins: true,
    },
    humanReview: {
      status: "PENDING HUMAN REVIEW",
      gates: HUMAN_GATES,
      allSixPending: true,
    },
    authorization: {
      humanAccepted: false,
      mainMerged: false,
      phase6Authorized: false,
    },
  };
  const bytes = assertSafeReport(report);
  await atomicWrite(options.output, bytes);
  return { path: options.output, bytes: bytes.length, sha256: sha256(bytes), report };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    printHelp();
    return;
  }
  if (options.selfTest) {
    process.stdout.write(stableJson({ schema: `${SCHEMA}.self-test`, ...await selfTest() }));
    return;
  }
  validateOptions(options, { requireOutput: !options.dryRun });
  if (options.dryRun) {
    process.stdout.write(stableJson({
      schema: `${SCHEMA}.dry-run`,
      status: "PASS",
      writesPerformed: false,
      filesystemReadsPerformed: false,
      gitCommandsPerformed: false,
      networkRequestsPerformed: false,
      expectedHead: options.expectedHead,
      expectedBase: ACCEPTED_PHASE5AR_SHA,
      expectedMain: FROZEN_MAIN_SHA,
      branch: REQUIRED_BRANCH,
      checkpointCount: CHECKPOINT_SUBJECTS.length,
      cloudflare: {
        accountId: REQUIRED_CLOUDFLARE_ACCOUNT_ID,
        project: REQUIRED_CLOUDFLARE_PROJECT,
        checkRunId: String(options.githubCheckRunId),
        deploymentId: options.cloudflareDeploymentId,
        immutableUrl: options.observedImmutableUrl,
        branchUrl: options.observedBranchUrl,
      },
      pendingHumanGates: HUMAN_GATES,
      provisionalCp8AuthorityRejected: true,
    }));
    return;
  }
  const result = await verifyDeployment(options);
  process.stdout.write(stableJson({
    schema: `${SCHEMA}.result`,
    status: "PASS",
    report: { path: result.path, bytes: result.bytes, sha256: result.sha256 },
  }));
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`Phase 5B deployment verification failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
