#!/usr/bin/env node

/**
 * Fail-closed deployment verification for the Phase 7A branch preview.
 *
 * Imports, --self-test, and --dry-run are inert. A normal run reads the local
 * dist tree, the local Git authority, GitHub's signed Cloudflare Pages check,
 * and the two supplied HTTPS preview origins. It writes exactly one fresh JSON
 * report outside both the repository and the operating-system temp directory.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  HTML_AUTHORITY_FILES,
  PUBLIC_ROUTE_OUTCOMES,
  REQUIRED_CLOUDFLARE_ACCOUNT_ID,
  REQUIRED_CLOUDFLARE_PROJECT,
  REQUIRED_HEADER_POLICIES,
  assertSafeReport,
  buildDistAuthority,
  cloudflareDetailsIdentity,
  isWithin,
  publicPathForDistFile,
  sha256,
  stableJson,
  validateDeployedRecord,
} from "./verify-phase6-deployment.mjs";

const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-7a.deployment-verification.v1";
export const REQUIRED_BRANCH = "redirect/phase-7a-signal-field-threshold";
export const REQUIRED_REPOSITORY = "AmirNatan1/Qsite1";
export const REQUIRED_REMOTE_URL = "https://github.com/AmirNatan1/Qsite1.git";
export const REQUIRED_CLOUDFLARE_APP_SLUG = "cloudflare-workers-and-pages";
export const FROZEN_MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const ACCEPTED_PARENT_SHA = "371e3e8a21a1d215ecaf2bf14b9f509432b230b0";
export const DEFAULT_DIST = path.join(ROOT, "dist");
export const SECURITY_HEADER_CONTRACT = Object.freeze({
  transport: "HTTPS preview origins only; redirects are not followed",
  contentType: "exact deployment MIME authority",
  cacheControl: "exact configured policies and no private/no-store cache on successful assets",
  cookies: "Set-Cookie prohibited on the static preview",
  technologyDisclosure: "X-Powered-By prohibited",
  cors: "wildcard origin cannot be combined with credentialed CORS",
  nosniff: "if X-Content-Type-Options is emitted, its only accepted value is nosniff",
  referrerPolicy: "if Referrer-Policy is emitted, unsafe-url is prohibited",
});

const HASH40 = /^[0-9a-f]{40}$/;
const DEFAULT_TIMEOUT_MS = 30_000;

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    expectedHead: "",
    immutableUrl: "",
    branchUrl: "",
    dist: DEFAULT_DIST,
    output: "",
    githubTokenEnvironment: "GITHUB_TOKEN",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    dryRun: false,
    selfTest: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--expected-head" || argument === "--deployed-sha") options.expectedHead = next().toLowerCase();
    else if (argument === "--immutable-url") options.immutableUrl = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--dist") options.dist = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--github-token-environment") options.githubTokenEnvironment = next();
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
    throw new Error(`${label} must be a ${REQUIRED_CLOUDFLARE_PROJECT} Cloudflare Pages preview origin`);
  }
  return url.toString();
}

export function validateExternalOutput(output, { required = true } = {}) {
  if (!output) {
    if (required) throw new Error("--output is required");
    return "";
  }
  if (path.extname(output).toLowerCase() !== ".json") throw new Error("--output must be a JSON file");
  if (isWithin(ROOT, output) || isWithin(os.tmpdir(), output)) {
    throw new Error("--output must remain outside the repository and operating-system temp directory");
  }
  return output;
}

export function validateOptions(options, { requireOutput = true } = {}) {
  if (!HASH40.test(options.expectedHead)
    || options.expectedHead === ACCEPTED_PARENT_SHA
    || options.expectedHead === FROZEN_MAIN_SHA) {
    throw new Error("--expected-head must be the new lowercase 40-character Phase 7A HEAD");
  }
  options.immutableUrl = normalizePreviewUrl(options.immutableUrl, "--immutable-url");
  options.branchUrl = normalizePreviewUrl(options.branchUrl, "--branch-url");
  if (options.immutableUrl === options.branchUrl) throw new Error("immutable and branch preview URLs must be distinct");
  const immutableLabel = new URL(options.immutableUrl).hostname.split(".")[0];
  if (!/^[0-9a-f]{8}$/.test(immutableLabel)) throw new Error("--immutable-url must begin with the lowercase eight-hex Cloudflare deployment prefix");
  const branchLabel = new URL(options.branchUrl).hostname.split(".")[0];
  if (!branchLabel.includes("phase-7a-signal-field")) throw new Error("--branch-url must identify the Phase 7A signal-field branch alias");
  if (path.resolve(options.dist) !== DEFAULT_DIST) throw new Error("--dist must be the exact repository dist directory");
  if (!/^[A-Z_][A-Z0-9_]*$/.test(options.githubTokenEnvironment)) {
    throw new Error("--github-token-environment must be an uppercase environment identifier");
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  validateExternalOutput(options.output, { required: requireOutput });
  return options;
}

function normalizedCheckRun(run) {
  return {
    id: String(run?.id ?? ""),
    name: run?.name ?? null,
    appSlug: run?.app?.slug ?? null,
    headSha: run?.head_sha ?? null,
    status: run?.status ?? null,
    conclusion: run?.conclusion ?? null,
    completedAt: run?.completed_at ?? null,
    detailsUrl: run?.details_url ?? null,
    outputTitle: run?.output?.title ?? null,
    outputSummary: run?.output?.summary ?? null,
  };
}

export function selectSignedDeploymentCheck(payload, options) {
  const runs = Array.isArray(payload) ? payload : payload?.check_runs;
  if (!Array.isArray(runs)) throw new Error("GitHub check-run response is malformed");
  const immutablePrefix = new URL(options.immutableUrl).hostname.split(".")[0];
  const matches = runs.map(normalizedCheckRun).map((check) => ({
    check,
    identity: cloudflareDetailsIdentity(check.detailsUrl),
  })).filter(({ check, identity }) => {
    const summary = String(check.outputSummary ?? "");
    return check.name === "Cloudflare Pages"
      && check.appSlug === REQUIRED_CLOUDFLARE_APP_SLUG
      && check.headSha === options.expectedHead
      && check.status === "completed"
      && check.conclusion === "success"
      && Number.isFinite(Date.parse(check.completedAt ?? ""))
      && check.outputTitle === "Deployed successfully"
      && /Deploy successful!/i.test(summary)
      && summary.includes(options.expectedHead.slice(0, 7))
      && summary.includes(options.immutableUrl.slice(0, -1))
      && summary.includes(options.branchUrl.slice(0, -1))
      && identity?.accountId === REQUIRED_CLOUDFLARE_ACCOUNT_ID
      && identity.project === REQUIRED_CLOUDFLARE_PROJECT
      && identity.deploymentId.startsWith(immutablePrefix);
  });
  if (matches.length !== 1) {
    throw new Error("expected exactly one successful signed Cloudflare check binding the deployed SHA and both preview URLs");
  }
  const { check, identity } = matches[0];
  return {
    status: "PASS",
    authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
    checkRunId: check.id,
    appSlug: check.appSlug,
    completedAt: new Date(check.completedAt).toISOString(),
    deploymentId: identity.deploymentId,
    projectName: REQUIRED_CLOUDFLARE_PROJECT,
    environment: "preview",
    branch: REQUIRED_BRANCH,
    immutableUrl: options.immutableUrl,
    branchUrl: options.branchUrl,
    deployedSha: options.expectedHead,
  };
}

function headerValue(headers, name) {
  if (headers && typeof headers.get === "function") return headers.get(name);
  const key = Object.keys(headers ?? {}).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : null;
  return Array.isArray(value) ? value.join(", ") : value ?? null;
}

export function validateSecurityHeaders(headers, { origin, relativePath }) {
  assert.equal(new URL(origin).protocol, "https:", `${relativePath} was not verified over HTTPS`);
  const setCookie = headerValue(headers, "set-cookie");
  const poweredBy = headerValue(headers, "x-powered-by");
  const allowOrigin = headerValue(headers, "access-control-allow-origin");
  const allowCredentials = headerValue(headers, "access-control-allow-credentials");
  const nosniff = headerValue(headers, "x-content-type-options");
  const referrerPolicy = headerValue(headers, "referrer-policy");
  if (setCookie) throw new Error(`static preview emitted Set-Cookie for ${relativePath}`);
  if (poweredBy) throw new Error(`static preview disclosed X-Powered-By for ${relativePath}`);
  if (allowOrigin?.trim() === "*" && allowCredentials?.trim().toLowerCase() === "true") {
    throw new Error(`unsafe wildcard credentialed CORS for ${relativePath}`);
  }
  if (nosniff && nosniff.trim().toLowerCase() !== "nosniff") {
    throw new Error(`invalid X-Content-Type-Options for ${relativePath}`);
  }
  if (referrerPolicy && referrerPolicy.toLowerCase().split(",").map((value) => value.trim()).includes("unsafe-url")) {
    throw new Error(`unsafe Referrer-Policy for ${relativePath}`);
  }
  return {
    status: "PASS",
    https: true,
    noSetCookie: true,
    noPoweredBy: true,
    noWildcardCredentialedCors: true,
    xContentTypeOptions: nosniff ?? null,
    referrerPolicy: referrerPolicy ?? null,
  };
}

async function fetchBound(url, init, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, redirect: "manual", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPublicFile(origin, publicPath, timeoutMs, fetchImpl) {
  const response = await fetchBound(new URL(publicPath, origin), { headers: { Accept: "*/*" } }, timeoutMs, fetchImpl);
  return {
    publicPath,
    status: response.status,
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
    cacheControl: response.headers.get("cache-control"),
    rawHeaders: response.headers,
  };
}

export async function verifyOrigin(origin, distAuthority, options, fetchImpl = fetch) {
  const deploymentPrefix = new URL(options.immutableUrl).hostname.split(".")[0];
  const missing404Path = `/__phase7a-real-404-${options.expectedHead.slice(0, 12)}-${deploymentPrefix}/`;
  const responses = [];
  const requestedPublicPaths = new Set();
  const exercisedPolicies = new Set();
  for (const relativePath of distAuthority.comparablePaths) {
    const local = distAuthority.byPath.get(relativePath);
    const publicPath = publicPathForDistFile(relativePath, missing404Path);
    if (requestedPublicPaths.has(publicPath)) throw new Error(`deployed origin request path is duplicated: ${publicPath}`);
    requestedPublicPaths.add(publicPath);
    const observed = await fetchPublicFile(origin, publicPath, options.timeoutMs, fetchImpl);
    const verified = validateDeployedRecord(observed, local, distAuthority.headerPolicies);
    const security = validateSecurityHeaders(observed.rawHeaders, { origin, relativePath });
    for (const policy of verified.headers.matchedPolicies) exercisedPolicies.add(policy);
    responses.push({ ...verified, security });
  }
  for (const policy of Object.keys(REQUIRED_HEADER_POLICIES)) {
    if (!exercisedPolicies.has(policy)) throw new Error(`${origin} did not exercise required _headers policy ${policy}`);
  }
  const routeRecords = PUBLIC_ROUTE_OUTCOMES.map((route) => {
    const publicPath = route.real404 ? missing404Path : route.requestPath;
    const record = responses.find((candidate) => candidate.relativePath === route.relativePath);
    if (!record || record.publicPath !== publicPath || record.actualHttpStatus !== route.status) {
      throw new Error(`exact public route outcome differs: ${route.id}`);
    }
    return { id: route.id, publicPath, httpStatus: record.actualHttpStatus, status: "PASS" };
  });
  return {
    status: "PASS",
    origin,
    real404: { publicPath: missing404Path, httpStatus: 404, localAuthority: "404.html", byteParity: true },
    exactPublicRoutes: routeRecords,
    securityHeaders: { status: "PASS", contract: SECURITY_HEADER_CONTRACT },
    fileCount: responses.length,
    totalBytes: responses.reduce((total, record) => total + record.bytes, 0),
    responses,
  };
}

async function jsonRequest(url, token, timeoutMs, fetchImpl = fetch) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "quantum-hub-phase7a-deployment-verifier",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchBound(url, { headers }, timeoutMs, fetchImpl);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`GitHub deployment authority returned HTTP ${response.status}`);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("GitHub deployment authority did not return JSON"); }
}

export async function verifySignedDeployment(options, fetchImpl = fetch) {
  const endpoint = `https://api.github.com/repos/${REQUIRED_REPOSITORY}/commits/${options.expectedHead}/check-runs?check_name=Cloudflare%20Pages&status=completed&per_page=100`;
  const payload = await jsonRequest(endpoint, process.env[options.githubTokenEnvironment], options.timeoutMs, fetchImpl);
  if (Number(payload.total_count ?? 0) > 100) throw new Error("GitHub returned more deployment checks than the bounded authority query can prove");
  return selectSignedDeploymentCheck(payload, options);
}

async function git(...args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

async function gitExit(...args) {
  try { await execFileAsync("git", args, { cwd: ROOT, windowsHide: true }); return true; }
  catch (error) { if (Number.isInteger(error?.code)) return false; throw error; }
}

export async function verifyRepository(options) {
  const [head, branch, main, originMain, originBranch, status, remote, parentAncestor, mergedMain] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("branch", "--show-current"),
    git("rev-parse", "main"),
    git("rev-parse", "origin/main"),
    git("rev-parse", `origin/${REQUIRED_BRANCH}`),
    git("status", "--porcelain=v1", "--untracked-files=all"),
    git("remote", "get-url", "origin"),
    gitExit("merge-base", "--is-ancestor", ACCEPTED_PARENT_SHA, options.expectedHead),
    gitExit("merge-base", "--is-ancestor", options.expectedHead, "main"),
  ]);
  assert.equal(head, options.expectedHead, "local HEAD differs from the deployed SHA");
  assert.equal(branch, REQUIRED_BRANCH, "local branch differs from the Phase 7A branch");
  assert.equal(main, FROZEN_MAIN_SHA, "local main differs from frozen main");
  assert.equal(originMain, FROZEN_MAIN_SHA, "origin/main differs from frozen main");
  assert.equal(originBranch, options.expectedHead, "origin Phase 7A branch differs from the deployed SHA");
  assert.equal(status, "", "deployment verification requires a clean working tree");
  assert.equal(remote.replace(/\/$/, ""), REQUIRED_REMOTE_URL, "origin URL differs from the repository authority");
  assert.equal(parentAncestor, true, "accepted Phase 7A parent is not an ancestor of the deployed SHA");
  assert.equal(mergedMain, false, "Phase 7A deployed SHA is already merged into main");
  return {
    status: "PASS",
    repository: REQUIRED_REPOSITORY,
    branch: REQUIRED_BRANCH,
    deployedSha: head,
    acceptedParent: ACCEPTED_PARENT_SHA,
    cleanTree: true,
    main: { local: main, origin: originMain, frozen: FROZEN_MAIN_SHA, containsDeployedSha: false },
    branchUpstream: { ref: `origin/${REQUIRED_BRANCH}`, sha: originBranch, parity: true },
  };
}

async function resolvedFromAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const missing = [];
  for (;;) {
    try { return path.join(await realpath(cursor), ...missing.reverse()); }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function freshExternalOutput(output) {
  try { await access(output); throw new Error(`output already exists: ${output}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const resolved = await resolvedFromAncestor(output);
  if (isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved)) {
    throw new Error("resolved output must remain outside the repository and operating-system temp directory");
  }
  await mkdir(path.dirname(resolved), { recursive: true });
  return resolved;
}

function sanitizeFailure(error) {
  return String(error?.message ?? error ?? "unknown verification failure")
    .replaceAll(ROOT, "[repository]")
    .replace(/[a-z]:[\\/]users[\\/][^\r\n]+/gi, "[private-path]")
    .slice(0, 1_000);
}

async function captured(name, failures, operation) {
  try { return { status: "PASS", data: await operation() }; }
  catch (error) {
    const message = sanitizeFailure(error);
    failures.push({ check: name, message });
    return { status: "FAIL", error: message };
  }
}

export async function verifyPhase7ADeployment(options, dependencies = {}) {
  validateOptions(options);
  const output = await freshExternalOutput(options.output);
  const failures = [];
  const repository = await captured("repository-provenance", failures, () => (dependencies.verifyRepository ?? verifyRepository)(options));
  const dist = await captured("local-dist-authority", failures, () => (dependencies.buildDistAuthority ?? buildDistAuthority)(options.dist));
  const deployment = await captured("signed-deployment-provenance", failures, () => (dependencies.verifySignedDeployment ?? verifySignedDeployment)(options));
  let immutable = { status: "NOT RUN", reason: "local dist authority unavailable" };
  let branch = { status: "NOT RUN", reason: "local dist authority unavailable" };
  if (dist.status === "PASS") {
    [immutable, branch] = await Promise.all([
      captured("immutable-origin", failures, () => (dependencies.verifyOrigin ?? verifyOrigin)(options.immutableUrl, dist.data, options)),
      captured("branch-origin", failures, () => (dependencies.verifyOrigin ?? verifyOrigin)(options.branchUrl, dist.data, options)),
    ]);
  } else {
    failures.push({ check: "origin-parity", message: "not run because local dist authority failed" });
  }
  const passed = failures.length === 0;
  const signed = deployment.status === "PASS" ? deployment.data : null;
  const report = {
    schema: SCHEMA,
    status: passed ? "PASS" : "FAIL",
    generatedAt: new Date().toISOString(),
    deployedSha: options.expectedHead,
    parity: passed ? "PASS" : "FAIL",
    deploymentId: signed?.deploymentId ?? null,
    environment: "preview",
    projectName: REQUIRED_CLOUDFLARE_PROJECT,
    immutableUrl: options.immutableUrl,
    branchUrl: options.branchUrl,
    inputs: {
      expectedDeployedSha: options.expectedHead,
      branch: REQUIRED_BRANCH,
      acceptedParent: ACCEPTED_PARENT_SHA,
      frozenMain: FROZEN_MAIN_SHA,
      localDist: "dist",
    },
    repository,
    deployment,
    dist: dist.status === "PASS" ? {
      status: "PASS",
      files: dist.data.fileLedger,
      totals: {
        files: dist.data.fileLedger.length,
        comparableFiles: dist.data.comparablePaths.length,
        bytes: dist.data.fileLedger.reduce((sum, file) => sum + file.bytes, 0),
      },
      exactHtmlAuthority: HTML_AUTHORITY_FILES,
      exactPublicRouteAuthority: PUBLIC_ROUTE_OUTCOMES,
      canonicalAuthority: dist.data.canonicalAuthority,
      requiredHeaderPolicies: REQUIRED_HEADER_POLICIES,
      excludedFromOriginComparison: ["_headers"],
    } : dist,
    origins: { immutable, branch },
    checks: {
      repositoryAndFrozenMainProvenance: repository.status === "PASS",
      signedCloudflareCheckBindsDeployedShaAndUrls: deployment.status === "PASS",
      immutableExactByteContentAndRouteParity: immutable.status === "PASS",
      branchExactByteContentAndRouteParity: branch.status === "PASS",
      real404StatusCanonicalAndNoindex: immutable.status === "PASS" && branch.status === "PASS",
      cacheMimeAndSecurityHeaders: immutable.status === "PASS" && branch.status === "PASS",
    },
    failures,
  };
  const bytes = assertSafeReport(report);
  await writeFile(output, bytes, { flag: "wx" });
  const result = { path: output, byteSize: bytes.length, sha256: sha256(bytes), report };
  if (!passed) throw Object.assign(new Error(`Phase 7A deployment verification failed (${failures.length} checks)`), { result });
  return result;
}

export function runSelfTest() {
  const options = validateOptions(parseArguments([
    "--expected-head", "b".repeat(40),
    "--immutable-url", "https://12345678.qsite1.pages.dev/",
    "--branch-url", "https://redirect-phase-7a-signal-field.qsite1.pages.dev/",
  ]), { requireOutput: false });
  const headers = new Headers({
    "cache-control": "public, max-age=0, must-revalidate",
    "content-type": "text/html; charset=utf-8",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  });
  assert.equal(validateSecurityHeaders(headers, { origin: options.immutableUrl, relativePath: "index.html" }).status, "PASS");
  assert.equal(PUBLIC_ROUTE_OUTCOMES.length, 10);
  assert.equal(PUBLIC_ROUTE_OUTCOMES.filter((route) => route.real404).length, 1);
  return {
    schema: `${SCHEMA}.self-test`,
    status: "PASS",
    branch: REQUIRED_BRANCH,
    acceptedParent: ACCEPTED_PARENT_SHA,
    frozenMain: FROZEN_MAIN_SHA,
    exactPublicRoutes: PUBLIC_ROUTE_OUTCOMES.length,
    real404Outcomes: 1,
    securityChecks: Object.keys(SECURITY_HEADER_CONTRACT).length,
  };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/verify-phase7a-deployment.mjs --expected-head <sha40> --immutable-url <https-preview> --branch-url <https-preview> --output <fresh-external-json>",
    "  node scripts/verify-phase7a-deployment.mjs --self-test",
  ].join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return void process.stdout.write(`${usage()}\n`);
  if (options.selfTest) return void process.stdout.write(stableJson(runSelfTest()));
  validateOptions(options, { requireOutput: !options.dryRun });
  if (options.dryRun) {
    return void process.stdout.write(stableJson({
      schema: `${SCHEMA}.dry-run`,
      status: "PASS",
      expectedDeployedSha: options.expectedHead,
      immutableUrl: options.immutableUrl,
      branchUrl: options.branchUrl,
      outputPolicy: "EXTERNAL_FRESH_JSON_ONLY",
    }));
  }
  const result = await verifyPhase7ADeployment(options);
  process.stdout.write(stableJson({
    schema: `${SCHEMA}.result`,
    status: "PASS",
    report: { path: result.path, byteSize: result.byteSize, sha256: result.sha256 },
  }));
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 7A deployment verification failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});

export {
  HTML_AUTHORITY_FILES,
  PUBLIC_ROUTE_OUTCOMES,
  REQUIRED_CLOUDFLARE_PROJECT,
  REQUIRED_HEADER_POLICIES,
};
