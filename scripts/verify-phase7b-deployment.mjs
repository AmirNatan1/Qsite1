#!/usr/bin/env node

/**
 * Fail-closed Phase 7B Cloudflare Pages preview verification.
 *
 * Normal execution binds the exact Git/GitHub/Cloudflare authority, compares
 * every deployable dist byte with both preview origins, verifies the frozen
 * Phase 4 payloads, and writes one fresh portable JSON report outside the
 * repository and the operating-system temporary directory. Imports,
 * --self-test, and --dry-run perform no network or filesystem writes.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  HTML_AUTHORITY_FILES,
  PRODUCTION_ORIGIN,
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
import { PHYSICAL_ASSETS } from "./phase7a-contract.mjs";
import {
  PHASE7B_BRANCH,
  PHASE7B_BRANCH_PREVIEW,
  PHASE7B_FROZEN_MAIN,
  PHASE7B_PARENT,
} from "./phase7b-contract.mjs";

const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-7b.deployment-verification.v1";
export const REQUIRED_REPOSITORY = "AmirNatan1/Qsite1";
export const REQUIRED_REMOTE_URL = "https://github.com/AmirNatan1/Qsite1.git";
export const REQUIRED_CLOUDFLARE_APP_SLUG = "cloudflare-workers-and-pages";
export const REQUIRED_BRANCH = PHASE7B_BRANCH;
export const REQUIRED_PARENT = PHASE7B_PARENT;
export const FROZEN_MAIN_SHA = PHASE7B_FROZEN_MAIN;
export const REQUIRED_BRANCH_URL = PHASE7B_BRANCH_PREVIEW;
export const DEFAULT_DIST = path.join(ROOT, "dist");

const derivedBranchLabel = REQUIRED_BRANCH.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28);
if (REQUIRED_BRANCH_URL !== `https://${derivedBranchLabel}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`) {
  throw new Error("Phase 7B branch preview alias differs from the exact bounded Cloudflare branch authority");
}

export const SECURITY_HEADER_CONTRACT = Object.freeze({
  transport: "credential-free HTTPS preview origins only; redirects are not followed",
  contentType: "exact deployment MIME authority",
  cacheControl: "exact configured policies and no private/no-store cache on successful assets",
  cookies: "Set-Cookie prohibited on the static preview",
  technologyDisclosure: "X-Powered-By prohibited",
  cors: "wildcard origin cannot be combined with credentialed CORS",
  nosniff: "if emitted, X-Content-Type-Options must be nosniff",
  referrerPolicy: "if emitted, Referrer-Policy must not contain unsafe-url",
});

const HASH40 = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEFAULT_TIMEOUT_MS = 30_000;
const TEXT_DEPLOYABLE = /\.(?:css|html|js|mjs)$/i;

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
    deploymentId: "",
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
    else if (argument === "--deployment-id") options.deploymentId = next().toLowerCase();
    else if (argument === "--dist") options.dist = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--github-token-environment" || argument === "--github-token-env") options.githubTokenEnvironment = next();
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

export function validatePortableReport(report) {
  const bytes = assertSafeReport(report);
  const text = bytes.toString("utf8");
  if (/[a-z]:\\{1,2}users\\{1,2}|\\{1,2}(?:onedrive|appdata|\.codex)\\{1,2}/i.test(text)) {
    throw new Error("deployment report contains a private path");
  }
  return bytes;
}

/** Validate the fixed authority and any explicitly supplied deployment values. */
export function validateOptions(options, { requireOutput = true, requireResolvedBinding = false } = {}) {
  if (!HASH40.test(options.expectedHead)
    || options.expectedHead === REQUIRED_PARENT
    || options.expectedHead === FROZEN_MAIN_SHA) {
    throw new Error("--expected-head must be the new lowercase 40-character Phase 7B final HEAD");
  }
  if (options.immutableUrl) {
    options.immutableUrl = normalizePreviewUrl(options.immutableUrl, "--immutable-url");
    if (!/^[0-9a-f]{8}$/.test(new URL(options.immutableUrl).hostname.split(".")[0])) {
      throw new Error("--immutable-url must begin with the lowercase eight-hex Cloudflare deployment prefix");
    }
  }
  if (options.branchUrl) {
    options.branchUrl = normalizePreviewUrl(options.branchUrl, "--branch-url");
    if (options.branchUrl !== REQUIRED_BRANCH_URL) {
      throw new Error(`--branch-url must be the exact Phase 7B preview alias ${REQUIRED_BRANCH_URL}`);
    }
  }
  if (options.deploymentId && !UUID.test(options.deploymentId)) {
    throw new Error("--deployment-id must be a lowercase Cloudflare deployment UUID");
  }
  if (options.deploymentId && options.immutableUrl) {
    const exact = `https://${options.deploymentId.slice(0, 8)}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`;
    if (options.immutableUrl !== exact) throw new Error(`--immutable-url must be exactly ${exact}`);
  }
  if (options.immutableUrl && options.branchUrl && options.immutableUrl === options.branchUrl) {
    throw new Error("immutable and branch preview URLs must be distinct");
  }
  if (requireResolvedBinding && (!options.immutableUrl || !options.branchUrl || !options.deploymentId)) {
    throw new Error("signed deployment discovery did not resolve both preview URLs and the deployment UUID");
  }
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

/** Return only credential-free qsite1 preview roots present in signed text. */
export function extractSignedPreviewUrls(summary) {
  const found = new Set();
  for (const match of String(summary ?? "").matchAll(/https:\/\/[a-z0-9-]+\.qsite1\.pages\.dev\/?/gi)) {
    try { found.add(normalizePreviewUrl(match[0].endsWith("/") ? match[0] : `${match[0]}/`, "signed preview URL")); }
    catch { /* malformed candidates are not authorities */ }
  }
  return [...found].sort();
}

/**
 * Select exactly one signed Cloudflare Pages check and resolve/cross-check its
 * deployment UUID, immutable origin, and exact branch alias.
 */
export function selectSignedDeploymentCheck(payload, suppliedOptions) {
  const options = validateOptions({ ...suppliedOptions }, { requireOutput: false });
  const runs = Array.isArray(payload) ? payload : payload?.check_runs;
  if (!Array.isArray(runs)) throw new Error("GitHub check-run response is malformed");
  const candidates = [];
  for (const check of runs.map(normalizedCheckRun)) {
    const identity = cloudflareDetailsIdentity(check.detailsUrl);
    const summary = String(check.outputSummary ?? "");
    if (check.name !== "Cloudflare Pages"
      || check.appSlug !== REQUIRED_CLOUDFLARE_APP_SLUG
      || check.headSha !== options.expectedHead
      || check.status !== "completed"
      || check.conclusion !== "success"
      || !Number.isFinite(Date.parse(check.completedAt ?? ""))
      || check.outputTitle !== "Deployed successfully"
      || !/Deploy successful!/i.test(summary)
      || !summary.includes(options.expectedHead.slice(0, 7))
      || identity?.accountId !== REQUIRED_CLOUDFLARE_ACCOUNT_ID
      || identity.project !== REQUIRED_CLOUDFLARE_PROJECT
      || !UUID.test(identity.deploymentId)) continue;
    const immutableUrl = `https://${identity.deploymentId.slice(0, 8)}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`;
    const signedUrls = extractSignedPreviewUrls(summary);
    if (!signedUrls.includes(immutableUrl) || !signedUrls.includes(REQUIRED_BRANCH_URL)) continue;
    if (options.immutableUrl && options.immutableUrl !== immutableUrl) continue;
    if (options.branchUrl && options.branchUrl !== REQUIRED_BRANCH_URL) continue;
    if (options.deploymentId && options.deploymentId !== identity.deploymentId) continue;
    candidates.push({ check, identity, immutableUrl, signedUrls });
  }
  if (candidates.length !== 1) {
    throw new Error("expected exactly one successful signed Cloudflare check binding Phase 7B HEAD, UUID, immutable preview, and exact branch preview");
  }
  const { check, identity, immutableUrl } = candidates[0];
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
    immutableUrl,
    branchUrl: REQUIRED_BRANCH_URL,
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
  if (nosniff && nosniff.trim().toLowerCase() !== "nosniff") throw new Error(`invalid X-Content-Type-Options for ${relativePath}`);
  if (referrerPolicy?.toLowerCase().split(",").map((value) => value.trim()).includes("unsafe-url")) {
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

function htmlAttributes(tag) {
  const result = {};
  for (const match of String(tag).matchAll(/\b([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

function srcsetValues(value) {
  return String(value ?? "").split(",").map((part) => part.trim().split(/\s+/, 1)[0]).filter(Boolean);
}

/** Extract literal network-bearing references from one emitted HTML/CSS/JS file. */
export function extractRuntimeRequests(relativePath, bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes ?? "");
  const requests = [];
  const add = (value, kind) => { if (value) requests.push({ from: relativePath, value, kind }); };
  if (/\.html$/i.test(relativePath)) {
    for (const match of text.matchAll(/<(script|img|source|video|audio|track|iframe|object|link)\b[^>]*>/gi)) {
      const tag = match[1].toLowerCase();
      const attributes = htmlAttributes(match[0]);
      if (tag === "link") {
        const relations = String(attributes.rel ?? "").toLowerCase().split(/\s+/);
        if (relations.some((value) => ["stylesheet", "icon", "preload", "modulepreload", "manifest"].includes(value))) add(attributes.href, `html:${tag}`);
      } else if (tag === "object") add(attributes.data, `html:${tag}`);
      else {
        add(attributes.src, `html:${tag}`);
        if (tag === "video") add(attributes.poster, "html:poster");
        for (const value of srcsetValues(attributes.srcset)) add(value, `html:${tag}:srcset`);
      }
    }
  } else if (/\.css$/i.test(relativePath)) {
    for (const match of text.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\s*\)/gi)) add(match[1] ?? match[2] ?? match[3], "css:url");
    for (const match of text.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)')/gi)) add(match[1] ?? match[2], "css:import");
  } else if (/\.(?:js|mjs)$/i.test(relativePath)) {
    const callPattern = /\b(fetch|importScripts|Worker|SharedWorker|Request)\s*\(\s*(?:"([^"]+)"|'([^']+)'|`([^`$]+)`)/g;
    for (const match of text.matchAll(callPattern)) add(match[2] ?? match[3] ?? match[4], `js:${match[1]}`);
    for (const match of text.matchAll(/\bimport\s*\(\s*(?:"([^"]+)"|'([^']+)'|`([^`$]+)`)/g)) add(match[1] ?? match[2] ?? match[3], "js:import");
  }
  return requests;
}

function recordsMap(recordsOrAuthority) {
  if (recordsOrAuthority?.byPath instanceof Map) return recordsOrAuthority.byPath;
  if (recordsOrAuthority instanceof Map) return recordsOrAuthority;
  if (Array.isArray(recordsOrAuthority)) return new Map(recordsOrAuthority.map((record) => [record.relativePath, record]));
  throw new Error("runtime graph requires dist records");
}

function localDistTarget(value, fromPath) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.startsWith("#") || /^(?:data|blob|mailto|tel|javascript):/i.test(raw)) return null;
  const baseDirectory = path.posix.dirname(`/${fromPath}`);
  const parsed = new URL(raw, `https://runtime.invalid${baseDirectory}/`);
  if (parsed.origin !== "https://runtime.invalid") throw new Error(`unexpected runtime origin in ${fromPath}: ${parsed.origin}`);
  if (parsed.username || parsed.password) throw new Error(`credentialed runtime request in ${fromPath}`);
  const pathname = decodeURIComponent(parsed.pathname);
  if (pathname.includes("..")) throw new Error(`runtime traversal path in ${fromPath}`);
  return pathname === "/" ? "index.html" : pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
}

/**
 * Prove every literal runtime request is same-origin and backed by one exact
 * dist payload. Every deployable dist file is independently compared by the
 * origin verifier, including dynamic assets not statically enumerable.
 */
export function validateRuntimeRequestGraph(recordsOrAuthority) {
  const byPath = recordsMap(recordsOrAuthority);
  const requests = [];
  for (const [relativePath, record] of byPath) {
    if (!TEXT_DEPLOYABLE.test(relativePath)) continue;
    requests.push(...extractRuntimeRequests(relativePath, record.bytes));
  }
  const normalized = requests.map((request) => ({ ...request, target: localDistTarget(request.value, request.from) })).filter(({ target }) => target !== null);
  for (const request of normalized) {
    if (!byPath.has(request.target)) throw new Error(`runtime request from ${request.from} has no exact dist payload: /${request.target}`);
  }
  return {
    status: "PASS",
    literalRequestCount: normalized.length,
    sameOriginRequestCount: normalized.length,
    unexpectedRuntimeOriginCount: 0,
    missingDistTargetCount: 0,
    allDeployablePayloadsOriginCompared: true,
    requests: normalized.map(({ from, kind, target }) => ({ from, kind, publicPath: `/${target}` })),
  };
}

function bufferFromRecord(record, label) {
  if (!Buffer.isBuffer(record?.bytes)) throw new Error(`${label} does not carry bytes`);
  return record.bytes;
}

/** Verify exact frozen Phase 4/brand hashes in source and emitted dist bytes. */
export function validatePhase4HashAuthority(sourceRecords, distRecordsOrAuthority, expectedAssets = PHYSICAL_ASSETS) {
  const source = sourceRecords instanceof Map ? sourceRecords : new Map(sourceRecords.map((record) => [record.relativePath, record]));
  const dist = recordsMap(distRecordsOrAuthority);
  const assets = [];
  for (const [sourcePath, expectedSha256] of expectedAssets) {
    const sourceBytes = bufferFromRecord(source.get(sourcePath), sourcePath);
    const distPath = sourcePath.replace(/^public\//, "");
    const distBytes = bufferFromRecord(dist.get(distPath), distPath);
    const actualSource = sha256(sourceBytes);
    const actualDist = sha256(distBytes);
    if (actualSource !== expectedSha256 || actualDist !== expectedSha256 || !sourceBytes.equals(distBytes)) {
      throw new Error(`frozen Phase 4 hash or source/dist byte parity differs: ${sourcePath}`);
    }
    assets.push({ sourcePath, publicPath: `/${distPath}`, bytes: sourceBytes.length, sha256: expectedSha256, status: "PASS" });
  }
  return { status: "PASS", assetCount: assets.length, assets };
}

async function verifyPhase4Hashes(distAuthority) {
  const records = [];
  for (const [relativePath] of PHYSICAL_ASSETS) {
    records.push({ relativePath, bytes: await readFile(path.join(ROOT, ...relativePath.split("/"))) });
  }
  return validatePhase4HashAuthority(records, distAuthority);
}

async function fetchBound(url, init, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...init, redirect: "manual", signal: controller.signal }); }
  finally { clearTimeout(timeout); }
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
  const binding = validateOptions({ ...options }, { requireOutput: false, requireResolvedBinding: true });
  const missing404Path = `/__phase7b-real-404-${binding.expectedHead.slice(0, 12)}-${binding.deploymentId.slice(0, 8)}/`;
  const responses = [];
  const requestedPublicPaths = new Set();
  const exercisedPolicies = new Set();
  for (const relativePath of distAuthority.comparablePaths) {
    const local = distAuthority.byPath.get(relativePath);
    const publicPath = publicPathForDistFile(relativePath, missing404Path);
    if (requestedPublicPaths.has(publicPath)) throw new Error(`deployed origin request path is duplicated: ${publicPath}`);
    requestedPublicPaths.add(publicPath);
    const observed = await fetchPublicFile(origin, publicPath, binding.timeoutMs, fetchImpl);
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
    if (!record || record.publicPath !== publicPath || record.actualHttpStatus !== route.status) throw new Error(`exact public route outcome differs: ${route.id}`);
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
    "User-Agent": "quantum-hub-phase7b-deployment-verifier",
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
  validateOptions({ ...options }, { requireOutput: false });
  const endpoint = `https://api.github.com/repos/${REQUIRED_REPOSITORY}/commits/${options.expectedHead}/check-runs?check_name=Cloudflare%20Pages&status=completed&per_page=100`;
  const payload = await jsonRequest(endpoint, process.env[options.githubTokenEnvironment], options.timeoutMs, fetchImpl);
  if (Number(payload.total_count ?? 0) > 100) throw new Error("GitHub returned more deployment checks than the bounded authority query can prove");
  return selectSignedDeploymentCheck(payload, options);
}

/** Validate a pure repository snapshot; used by real Git checks and tests. */
export function parseLinearHistory(text, expectedHead) {
  const rows = String(text).split(/\r?\n/).filter(Boolean).map((line) => {
    const [commit, parentsText, ...subject] = line.split("\t");
    return { commit, parents: String(parentsText ?? "").split(/\s+/).filter(Boolean), subject: subject.join("\t") };
  });
  if (rows.length < 1) throw new Error("Phase 7B history contains no commit after the exact required parent");
  for (let index = 0; index < rows.length; index += 1) {
    const expectedParent = index === 0 ? REQUIRED_PARENT : rows[index - 1].commit;
    const row = rows[index];
    if (!HASH40.test(row.commit) || row.parents.length !== 1 || row.parents[0] !== expectedParent || !row.subject) {
      throw new Error(`Phase 7B commit ${index + 1} is not an exact non-empty linear child of ${expectedParent}`);
    }
  }
  if (rows.at(-1).commit !== expectedHead) throw new Error("Phase 7B linear history does not terminate at final HEAD");
  return rows;
}

export function validateRepositorySnapshot(snapshot, options) {
  assert.equal(snapshot.head, options.expectedHead, "local HEAD differs from the deployed SHA");
  assert.equal(snapshot.branch, REQUIRED_BRANCH, "local branch differs from the exact Phase 7B branch");
  assert.equal(snapshot.main, FROZEN_MAIN_SHA, "local main differs from frozen main");
  assert.equal(snapshot.originMain, FROZEN_MAIN_SHA, "origin/main differs from frozen main");
  assert.equal(snapshot.originBranch, options.expectedHead, "origin Phase 7B branch differs from deployed SHA");
  assert.equal(snapshot.upstreamRef, `origin/${REQUIRED_BRANCH}`, "Phase 7B branch tracks the wrong upstream");
  assert.equal(snapshot.upstreamHead, options.expectedHead, "configured upstream differs from deployed SHA");
  assert.equal(snapshot.status, "", "deployment verification requires a clean working tree");
  assert.equal(String(snapshot.remote).replace(/\/$/, ""), REQUIRED_REMOTE_URL, "origin URL differs from repository authority");
  assert.equal(snapshot.parentAncestor, true, "exact Phase 7B parent is not an ancestor of deployed SHA");
  assert.equal(snapshot.mergedMain, false, "Phase 7B deployed SHA is already merged into main");
  assert.equal(snapshot.liveOriginBranch, options.expectedHead, "live origin Phase 7B branch differs from deployed SHA");
  assert.equal(snapshot.liveOriginMain, FROZEN_MAIN_SHA, "live origin main differs from frozen main");
  const history = parseLinearHistory(snapshot.history, options.expectedHead);
  return {
    status: "PASS",
    repository: REQUIRED_REPOSITORY,
    branch: REQUIRED_BRANCH,
    deployedSha: snapshot.head,
    requiredParent: REQUIRED_PARENT,
    directParent: history.at(-1).parents[0],
    cleanTree: true,
    zeroMergeCommits: true,
    history,
    main: { local: snapshot.main, origin: snapshot.originMain, live: snapshot.liveOriginMain, frozen: FROZEN_MAIN_SHA, containsDeployedSha: false },
    branchUpstream: { ref: snapshot.upstreamRef, sha: snapshot.upstreamHead, live: snapshot.liveOriginBranch, parity: true },
  };
}

async function git(...args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

async function gitExit(...args) {
  try { await execFileAsync("git", args, { cwd: ROOT, windowsHide: true }); return true; }
  catch (error) { if (Number.isInteger(error?.code)) return false; throw error; }
}

function parseLiveRefs(text) {
  const refs = new Map();
  for (const line of String(text).split(/\r?\n/).filter(Boolean)) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (!HASH40.test(sha) || !ref || refs.has(ref)) throw new Error("live remote refs are malformed or duplicated");
    refs.set(ref, sha);
  }
  return refs;
}

export async function verifyRepository(options) {
  validateOptions({ ...options }, { requireOutput: false });
  const [head, branch, main, originMain, originBranch, status, upstreamRef, upstreamHead, remote, history, parentAncestor, mergedMain] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("branch", "--show-current"),
    git("rev-parse", "main"),
    git("rev-parse", "origin/main"),
    git("rev-parse", `origin/${REQUIRED_BRANCH}`),
    git("status", "--porcelain=v1", "--untracked-files=all"),
    git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"),
    git("rev-parse", "@{upstream}"),
    git("remote", "get-url", "origin"),
    git("log", "--reverse", "--format=%H%x09%P%x09%s", `${REQUIRED_PARENT}..${options.expectedHead}`),
    gitExit("merge-base", "--is-ancestor", REQUIRED_PARENT, options.expectedHead),
    gitExit("merge-base", "--is-ancestor", options.expectedHead, "main"),
  ]);
  const live = parseLiveRefs(await git("ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${REQUIRED_BRANCH}`, "refs/heads/main"));
  if (live.size !== 2) throw new Error("live origin did not return exactly Phase 7B and main refs");
  return validateRepositorySnapshot({
    head, branch, main, originMain, originBranch, status, upstreamRef, upstreamHead, remote, history, parentAncestor, mergedMain,
    liveOriginBranch: live.get(`refs/heads/${REQUIRED_BRANCH}`),
    liveOriginMain: live.get("refs/heads/main"),
  }, options);
}

/** Prove the signed deployment is preview-only and cannot stand for main. */
export function validateProductionIsolation(repository, deployment) {
  if (repository?.status !== "PASS" || deployment?.status !== "PASS") throw new Error("production isolation requires passed repository and signed deployment authorities");
  if (deployment.environment !== "preview" || deployment.branch !== REQUIRED_BRANCH || deployment.deployedSha !== repository.deployedSha) {
    throw new Error("signed deployment is not the exact Phase 7B preview authority");
  }
  for (const value of [deployment.immutableUrl, deployment.branchUrl]) {
    if (new URL(value).origin === PRODUCTION_ORIGIN) throw new Error("production origin was supplied as Phase 7B preview evidence");
  }
  if (repository.main.local !== FROZEN_MAIN_SHA || repository.main.origin !== FROZEN_MAIN_SHA || repository.main.live !== FROZEN_MAIN_SHA || repository.main.containsDeployedSha) {
    throw new Error("frozen main or production isolation differs");
  }
  return {
    status: "PASS",
    frozenMain: FROZEN_MAIN_SHA,
    mainUnchanged: true,
    phase7bHeadNotInMain: true,
    signedEnvironment: "preview",
    productionOriginUsedAsPreview: false,
    productionDeploymentAuthorized: false,
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
  if (isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved)) throw new Error("resolved output must remain outside repository and temporary directory");
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

export async function verifyOriginsSerially(options, distAuthority, failures, verifyOriginImpl = verifyOrigin) {
  const immutable = await captured("immutable-origin", failures, () => verifyOriginImpl(options.immutableUrl, distAuthority, options));
  const branch = await captured("branch-origin", failures, () => verifyOriginImpl(options.branchUrl, distAuthority, options));
  return { immutable, branch };
}

export async function verifyPhase7BDeployment(options, dependencies = {}) {
  validateOptions(options);
  const output = await freshExternalOutput(options.output);
  const failures = [];
  const repository = await captured("repository-provenance", failures, () => (dependencies.verifyRepository ?? verifyRepository)(options));
  const dist = await captured("local-dist-authority", failures, () => (dependencies.buildDistAuthority ?? buildDistAuthority)(options.dist));
  const deployment = await captured("signed-deployment-provenance", failures, () => (dependencies.verifySignedDeployment ?? verifySignedDeployment)(options));
  const binding = deployment.status === "PASS" ? deployment.data : null;
  const resolvedOptions = binding ? validateOptions({
    ...options,
    immutableUrl: binding.immutableUrl,
    branchUrl: binding.branchUrl,
    deploymentId: binding.deploymentId,
  }, { requireResolvedBinding: true }) : options;
  const runtime = dist.status === "PASS"
    ? await captured("runtime-request-graph", failures, () => (dependencies.validateRuntimeRequestGraph ?? validateRuntimeRequestGraph)(dist.data))
    : { status: "NOT RUN", reason: "local dist authority unavailable" };
  const phase4 = dist.status === "PASS"
    ? await captured("frozen-phase4-hashes", failures, () => (dependencies.verifyPhase4Hashes ?? verifyPhase4Hashes)(dist.data))
    : { status: "NOT RUN", reason: "local dist authority unavailable" };
  let immutable = { status: "NOT RUN", reason: "dist or signed deployment authority unavailable" };
  let branch = { status: "NOT RUN", reason: "dist or signed deployment authority unavailable" };
  if (dist.status === "PASS" && binding) {
    ({ immutable, branch } = await verifyOriginsSerially(resolvedOptions, dist.data, failures, dependencies.verifyOrigin ?? verifyOrigin));
  } else failures.push({ check: "origin-parity", message: "not run because local dist or signed deployment authority failed" });
  const productionIsolation = repository.status === "PASS" && deployment.status === "PASS"
    ? await captured("production-isolation", failures, () => validateProductionIsolation(repository.data, deployment.data))
    : { status: "NOT RUN", reason: "repository or signed deployment authority unavailable" };
  const passed = failures.length === 0;
  const report = {
    schema: SCHEMA,
    status: passed ? "PASS" : "FAIL",
    generatedAt: new Date().toISOString(),
    deployedSha: options.expectedHead,
    parity: passed ? "PASS" : "FAIL",
    deploymentId: binding?.deploymentId ?? null,
    environment: "preview",
    projectName: REQUIRED_CLOUDFLARE_PROJECT,
    immutableUrl: binding?.immutableUrl ?? null,
    branchUrl: binding?.branchUrl ?? null,
    inputs: {
      expectedDeployedSha: options.expectedHead,
      branch: REQUIRED_BRANCH,
      requiredParent: REQUIRED_PARENT,
      frozenMain: FROZEN_MAIN_SHA,
      localDist: "dist",
      urlBindingMode: options.immutableUrl && options.branchUrl ? "EXPLICIT_AND_SIGNED" : "DISCOVERED_FROM_SIGNED_CHECK",
    },
    repository,
    deployment,
    productionIsolation,
    phase4,
    runtimeRequests: runtime,
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
      exactRepositoryBranchParentHeadAndFrozenMain: repository.status === "PASS",
      signedCloudflareCheckBindsUuidShaAndBothPreviews: deployment.status === "PASS",
      previewOnlyAndMainNotProductionDeployed: productionIsolation.status === "PASS",
      immutableAllDistByteStatusHeaderCanonicalParity: immutable.status === "PASS",
      branchAllDistByteStatusHeaderCanonicalParity: branch.status === "PASS",
      real404: immutable.status === "PASS" && branch.status === "PASS",
      noUnexpectedRuntimeOrigins: runtime.status === "PASS",
      authoritativePhase4Hashes: phase4.status === "PASS",
    },
    failures,
  };
  const bytes = validatePortableReport(report);
  await writeFile(output, bytes, { flag: "wx" });
  const result = { path: output, byteSize: bytes.length, sha256: sha256(bytes), report };
  if (!passed) throw Object.assign(new Error(`Phase 7B deployment verification failed (${failures.length} checks)`), { result });
  return result;
}

export function runSelfTest() {
  const head = "b".repeat(40);
  const deploymentId = "12345678-1234-4234-8234-123456789abc";
  const options = validateOptions(parseArguments(["--expected-head", head]), { requireOutput: false });
  const check = {
    id: 7,
    name: "Cloudflare Pages",
    app: { slug: REQUIRED_CLOUDFLARE_APP_SLUG },
    head_sha: head,
    status: "completed",
    conclusion: "success",
    completed_at: "2026-09-01T12:00:00Z",
    details_url: `https://dash.cloudflare.com/?to=/${REQUIRED_CLOUDFLARE_ACCOUNT_ID}/pages/view/${REQUIRED_CLOUDFLARE_PROJECT}/${deploymentId}`,
    output: { title: "Deployed successfully", summary: `Deploy successful! ${head.slice(0, 7)} https://12345678.qsite1.pages.dev ${REQUIRED_BRANCH_URL.slice(0, -1)}` },
  };
  const selected = selectSignedDeploymentCheck({ check_runs: [check] }, options);
  assert.equal(selected.deploymentId, deploymentId);
  assert.equal(selected.branchUrl, REQUIRED_BRANCH_URL);
  return {
    schema: `${SCHEMA}.self-test`,
    status: "PASS",
    branch: REQUIRED_BRANCH,
    requiredParent: REQUIRED_PARENT,
    frozenMain: FROZEN_MAIN_SHA,
    exactPublicRoutes: PUBLIC_ROUTE_OUTCOMES.length,
    phase4Assets: PHYSICAL_ASSETS.length,
    urlDiscovery: "SIGNED_CLOUDFLARE_GITHUB_CHECK",
  };
}

export function usage() {
  return [
    "Usage:",
    "  node scripts/verify-phase7b-deployment.mjs --expected-head <sha40> [--immutable-url <https-preview> --branch-url <exact-preview> --deployment-id <uuid>] --output <fresh-external-json>",
    "  node scripts/verify-phase7b-deployment.mjs --self-test",
    "",
    "Omit preview URLs and deployment UUID to discover all three from exactly one signed successful Cloudflare Pages GitHub check. Supplied values are always cross-checked against that signed authority.",
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
      branchUrl: options.branchUrl || null,
      immutableUrl: options.immutableUrl || null,
      deploymentId: options.deploymentId || null,
      bindingMode: options.immutableUrl && options.branchUrl && options.deploymentId ? "EXPLICIT_REQUIRES_SIGNED_CROSS_CHECK" : "SIGNED_DISCOVERY_REQUIRED",
      outputPolicy: "EXTERNAL_FRESH_JSON_ONLY",
    }));
  }
  const result = await verifyPhase7BDeployment(options);
  process.stdout.write(stableJson({
    schema: `${SCHEMA}.result`,
    status: "PASS",
    report: { path: result.path, byteSize: result.byteSize, sha256: result.sha256 },
  }));
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 7B deployment verification failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});

export {
  HTML_AUTHORITY_FILES,
  PUBLIC_ROUTE_OUTCOMES,
  REQUIRED_CLOUDFLARE_PROJECT,
  REQUIRED_HEADER_POLICIES,
};
