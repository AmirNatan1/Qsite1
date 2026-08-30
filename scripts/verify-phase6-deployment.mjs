#!/usr/bin/env node

/**
 * Fail-closed Phase 6 Cloudflare Pages deployment verification.
 *
 * Imports, --self-test, and --dry-run are inert: they do not run Git, read
 * dist, access the network, or write a report. A normal run writes exactly one
 * fresh, privacy-safe JSON report outside both the repository and OS temp.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPT_RELATIVE = "scripts/verify-phase6-deployment.mjs";
export const TEST_RELATIVE = "tests/phase6-deployment-verifier.test.mjs";
export const SCHEMA = "quantum-hub.phase-6.deployment-verification.v1";
export const REQUIRED_REPOSITORY = "AmirNatan1/Qsite1";
export const REQUIRED_REMOTE_URL = "https://github.com/AmirNatan1/Qsite1.git";
export const REQUIRED_BRANCH = "feature/phase-6-global-hardening";
export const ACCEPTED_PHASE5B_SHA = "005a36860ecbfd6fedb3d3f2223f168c1edfbb05";
export const FROZEN_MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const REQUIRED_CLOUDFLARE_ACCOUNT_ID = "16bccc18bf7d54fd2538de7c1b5f19ed";
export const REQUIRED_CLOUDFLARE_PROJECT = "qsite1";
export const PRODUCTION_ORIGIN = "https://qsite1.pages.dev";
export const DEFAULT_DIST = path.join(ROOT, "dist");

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

export const PUBLIC_ROUTE_OUTCOMES = Object.freeze([
  Object.freeze({ id: "home", relativePath: "index.html", requestPath: "/", status: 200 }),
  Object.freeze({ id: "for-industry", relativePath: "for-partners/index.html", requestPath: "/for-partners/", status: 200 }),
  Object.freeze({ id: "for-startups", relativePath: "for-startups/index.html", requestPath: "/for-startups/", status: 200 }),
  Object.freeze({ id: "industries", relativePath: "industries/index.html", requestPath: "/industries/", status: 200 }),
  Object.freeze({ id: "proof", relativePath: "pocs/index.html", requestPath: "/pocs/", status: 200 }),
  Object.freeze({ id: "maradin", relativePath: "pocs/maradin/index.html", requestPath: "/pocs/maradin/", status: 200 }),
  Object.freeze({ id: "spark", relativePath: "spark/index.html", requestPath: "/spark/", status: 200 }),
  Object.freeze({ id: "about", relativePath: "about/index.html", requestPath: "/about/", status: 200 }),
  Object.freeze({ id: "contact", relativePath: "contact/index.html", requestPath: "/contact/", status: 200 }),
  Object.freeze({ id: "404", relativePath: "404.html", requestPath: null, status: 404, real404: true }),
]);

export const REQUIRED_HEADER_POLICIES = Object.freeze({
  "/_astro/*": "public, max-age=31556952, immutable",
  "/media/cinematic/phase-4r2/manifests/*": "public, max-age=0, must-revalidate",
  "/media/cinematic/phase-4r2/media/*": "public, max-age=31556952, immutable",
  "/media/cinematic/phase-4r2/posters/*": "public, max-age=31556952, immutable",
});

const REPORT_FILENAME_HINT = "phase-6-deployment-verification.json";
const HASH40 = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEFAULT_TIMEOUT_MS = 30_000;
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
    expectedBase: ACCEPTED_PHASE5B_SHA,
    expectedMain: FROZEN_MAIN_SHA,
    repository: REQUIRED_REPOSITORY,
    branch: REQUIRED_BRANCH,
    mainBranch: "main",
    remote: "origin",
    immutableUrl: null,
    branchUrl: null,
    deploymentId: null,
    dist: DEFAULT_DIST,
    output: null,
    githubTokenEnvironment: "GITHUB_TOKEN",
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
    else if (argument === "--expected-base" || argument === "--accepted-phase5b") options.expectedBase = next().toLowerCase();
    else if (argument === "--expected-main" || argument === "--frozen-main") options.expectedMain = next().toLowerCase();
    else if (argument === "--repository") options.repository = next();
    else if (argument === "--branch") options.branch = next();
    else if (argument === "--main-branch") options.mainBranch = next();
    else if (argument === "--remote") options.remote = next();
    else if (argument === "--immutable-url" || argument === "--observed-immutable-url") options.immutableUrl = next();
    else if (argument === "--branch-url" || argument === "--observed-branch-url") options.branchUrl = next();
    else if (argument === "--deployment-id" || argument === "--cloudflare-deployment-id") options.deploymentId = next().toLowerCase();
    else if (argument === "--dist") options.dist = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--github-token-env") options.githubTokenEnvironment = next();
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

export function normalizePreviewUrl(value, label = "preview URL") {
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

export function validateExternalOutput(output, required = true) {
  if (!output) {
    if (required) throw new Error("--output is required");
    return null;
  }
  if (path.extname(output).toLowerCase() !== ".json") throw new Error("--output must be a JSON file");
  if (isWithin(ROOT, output) || isWithin(os.tmpdir(), output)) {
    throw new Error("deployment report must remain outside the repository and temporary directory");
  }
  return output;
}

export function validateOptions(options, { requireOutput = true } = {}) {
  if (!HASH40.test(options.expectedHead ?? "")) throw new Error("--expected-head must be exactly 40 lowercase hexadecimal characters");
  if (options.expectedHead === ACCEPTED_PHASE5B_SHA || options.expectedHead === FROZEN_MAIN_SHA) {
    throw new Error("--expected-head must be the new Phase 6 final commit");
  }
  if (options.expectedBase !== ACCEPTED_PHASE5B_SHA) throw new Error(`--expected-base must be exactly ${ACCEPTED_PHASE5B_SHA}`);
  if (options.expectedMain !== FROZEN_MAIN_SHA) throw new Error(`--expected-main must be exactly ${FROZEN_MAIN_SHA}`);
  if (options.repository !== REQUIRED_REPOSITORY) throw new Error(`--repository must be exactly ${REQUIRED_REPOSITORY}`);
  if (options.branch !== REQUIRED_BRANCH) throw new Error(`--branch must be exactly ${REQUIRED_BRANCH}`);
  if (options.mainBranch !== "main") throw new Error("--main-branch must be exactly main");
  if (options.remote !== "origin") throw new Error("--remote must be exactly origin");
  if (!UUID.test(String(options.deploymentId ?? ""))) throw new Error("--deployment-id must be a Cloudflare deployment UUID");
  if (!/^[A-Z_][A-Z0-9_]*$/.test(options.githubTokenEnvironment)) {
    throw new Error("--github-token-env must be an uppercase environment identifier");
  }
  options.immutableUrl = normalizePreviewUrl(options.immutableUrl, "--immutable-url");
  options.branchUrl = normalizePreviewUrl(options.branchUrl, "--branch-url");
  const expectedImmutable = `https://${options.deploymentId.slice(0, 8)}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`;
  if (options.immutableUrl !== expectedImmutable) {
    throw new Error(`--immutable-url must be exactly ${expectedImmutable}`);
  }
  if (options.branchUrl === options.immutableUrl) throw new Error("immutable and branch preview URLs must be distinct");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  }
  if (path.resolve(options.dist) !== DEFAULT_DIST) throw new Error("--dist must be the exact repository dist root");
  validateExternalOutput(options.output, requireOutput);
  return options;
}

export function printHelp() {
  process.stdout.write(`Phase 6 deployment verifier\n\nUsage:\n  node ${SCRIPT_RELATIVE} \\\n    --expected-head <40-hex-final-SHA> \\\n    --immutable-url https://<deployment-prefix>.qsite1.pages.dev/ \\\n    --branch-url https://<observed-branch-alias>.qsite1.pages.dev/ \\\n    --deployment-id <Cloudflare-UUID> \\\n    --dist ./dist --output <durable-external>/${REPORT_FILENAME_HINT}\n\nOptions:\n  --expected-base SHA       Fixed accepted Phase 5B authority\n  --expected-main SHA       Fixed production-main authority\n  --repository OWNER/REPO   Exact GitHub repository\n  --branch NAME             Exact Phase 6 branch\n  --remote origin           Configured and live remote\n  --main-branch main        Frozen production branch\n  --github-token-env NAME   Optional API token environment (default GITHUB_TOKEN)\n  --timeout-ms N            Per request, 5000..120000\n  --dry-run                 Validate bindings only; perform no I/O\n  --self-test               Run pure contract checks only\n  --help, -h                Show help\n`);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameSet(left, right) {
  const a = sorted(left);
  const b = sorted(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
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
      throw new Error(`_headers must contain the exact Phase 6 cache policy for ${pattern}`);
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
    ".avif": ["image/avif"],
    ".css": ["text/css"],
    ".html": ["text/html"],
    ".ico": ["image/x-icon", "image/vnd.microsoft.icon"],
    ".jpeg": ["image/jpeg"],
    ".jpg": ["image/jpeg"],
    ".js": ["javascript"],
    ".json": ["application/json"],
    ".mjs": ["javascript"],
    ".mp4": ["video/mp4"],
    ".pdf": ["application/pdf"],
    ".png": ["image/png"],
    ".svg": ["image/svg+xml"],
    ".txt": ["text/plain"],
    ".wasm": ["application/wasm"],
    ".webm": ["video/webm"],
    ".webp": ["image/webp"],
    ".woff": ["font/woff", "application/font-woff"],
    ".woff2": ["font/woff2", "application/font-woff2"],
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

function parseHtmlAttributes(tag) {
  const attributes = {};
  const expression = /\b([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(expression)) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  return attributes;
}

export function canonicalForDistFile(relativePath) {
  if (relativePath === "404.html") return null;
  if (relativePath === "index.html") return `${PRODUCTION_ORIGIN}/`;
  if (relativePath.endsWith("/index.html")) return `${PRODUCTION_ORIGIN}/${relativePath.slice(0, -"index.html".length)}`;
  return null;
}

function hasNoindex(html) {
  return [...String(html).matchAll(/<meta\b[^>]*>/gi)].some((match) => {
    const attributes = parseHtmlAttributes(match[0]);
    return attributes.name?.toLowerCase() === "robots" && /(?:^|,)\s*noindex(?:\s|,|$)/i.test(attributes.content ?? "");
  });
}

export function validateCanonicalHtml(html, relativePath) {
  const canonicals = [...String(html).matchAll(/<link\b[^>]*>/gi)]
    .map((match) => parseHtmlAttributes(match[0]))
    .filter((attributes) => String(attributes.rel ?? "").toLowerCase().split(/\s+/).includes("canonical"))
    .map((attributes) => attributes.href ?? null);
  const expected = canonicalForDistFile(relativePath);
  if (relativePath === "404.html") {
    if (canonicals.length !== 0 || !hasNoindex(html)) throw new Error("real 404 must omit canonical and carry robots noindex");
    return { canonical: null, robotsNoindex: true, status: "PASS" };
  }
  if (!expected || canonicals.length !== 1 || canonicals[0] !== expected) {
    throw new Error(`canonical mismatch for ${relativePath}`);
  }
  return { canonical: expected, robotsNoindex: false, status: "PASS" };
}

export function publicPathForDistFile(relativePath, missing404Path = "/__phase6-real-404-probe__/") {
  if (relativePath === "_headers") return null;
  if (relativePath === "404.html") return missing404Path;
  if (relativePath === "index.html") return "/";
  if (relativePath.endsWith("/index.html")) return `/${relativePath.slice(0, -"index.html".length)}`;
  return `/${relativePath}`;
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
  if (!sameSet(htmlPaths, HTML_AUTHORITY_FILES)) throw new Error("dist must contain exactly the ten Phase 6 public HTML outcomes");
  if (paths.includes("_redirects")) throw new Error("SPA redirects are prohibited because the real 404 must retain HTTP 404 semantics");
  for (const required of ["_headers", "robots.txt", "sitemap.xml"]) {
    if (!byPath.has(required)) throw new Error(`dist is missing required public control: ${required}`);
  }
  for (const prefix of ["_astro/", "media/cinematic/phase-4r2/manifests/", "media/cinematic/phase-4r2/media/", "media/cinematic/phase-4r2/posters/"]) {
    if (!paths.some((relativePath) => relativePath.startsWith(prefix))) throw new Error(`dist does not exercise required deployment policy: /${prefix}*`);
  }
  const canonicalAuthority = {};
  for (const relativePath of htmlPaths) {
    canonicalAuthority[relativePath] = validateCanonicalHtml(byPath.get(relativePath).bytes.toString("utf8"), relativePath);
  }
  const headerPolicies = parseHeadersFile(byPath.get("_headers").bytes.toString("utf8"));
  assertRequiredHeaderPolicies(headerPolicies);
  const fileLedger = paths.map((relativePath) => ({
    relativePath,
    deploymentComparison: relativePath === "_headers" ? "EXCLUDED_CLOUDFLARE_CONFIGURATION" : "REQUIRED",
    requestPath: publicPathForDistFile(relativePath),
    bytes: byPath.get(relativePath).bytes.length,
    sha256: sha256(byPath.get(relativePath).bytes),
  }));
  const comparablePaths = paths.filter((relativePath) => relativePath !== "_headers");
  return { byPath, paths, comparablePaths, htmlPaths, canonicalAuthority, headerPolicies, fileLedger };
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
  if (response.status !== expectedStatus) throw new Error(`deployed HTTP status differs for ${localRecord.relativePath}: ${response.status}`);
  if (!Buffer.isBuffer(response.bytes) || !response.bytes.equals(localRecord.bytes)) {
    throw new Error(`deployed byte parity differs for ${localRecord.relativePath}`);
  }
  const headers = validateObservedHeaders(response, localRecord.relativePath, policies);
  const canonical = localRecord.relativePath.endsWith(".html")
    ? validateCanonicalHtml(response.bytes.toString("utf8"), localRecord.relativePath)
    : null;
  return {
    relativePath: localRecord.relativePath,
    publicPath: response.publicPath,
    expectedHttpStatus: expectedStatus,
    actualHttpStatus: response.status,
    bytes: localRecord.bytes.length,
    sha256: sha256(localRecord.bytes),
    headers,
    canonical,
    status: "PASS",
  };
}

export function parseLinearHistory(text, expectedHead) {
  const records = String(text).split(/\r?\n/).filter(Boolean).map((line) => {
    const [commit, parentsText, ...subjectParts] = line.split("\t");
    return { commit, parents: String(parentsText ?? "").split(/\s+/).filter(Boolean), subject: subjectParts.join("\t") };
  });
  if (records.length < 1) throw new Error("Phase 6 history contains no commits after accepted Phase 5B");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const requiredParent = index === 0 ? ACCEPTED_PHASE5B_SHA : records[index - 1].commit;
    if (!HASH40.test(record.commit) || record.parents.length !== 1 || record.parents[0] !== requiredParent || !record.subject) {
      throw new Error(`Phase 6 commit ${index + 1} is not an exact non-empty linear child of ${requiredParent}`);
    }
  }
  if (records.at(-1).commit !== expectedHead) throw new Error("Phase 6 linear history does not terminate at expected HEAD");
  return records;
}

function parseRemoteRefs(text) {
  const result = new Map();
  for (const line of String(text).split(/\r?\n/).filter(Boolean)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 2 || !HASH40.test(parts[0]) || result.has(parts[1])) throw new Error("live remote refs are malformed or duplicated");
    result.set(parts[1], parts[0]);
  }
  return result;
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

export async function verifyRepository(options) {
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
    historyText,
    acceptedAncestor,
    headMergedIntoMain,
    trackedVerifier,
    trackedTest,
    productionDeltaText,
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
    git("log", "--reverse", "--format=%H%x09%P%x09%s", `${ACCEPTED_PHASE5B_SHA}..${options.expectedHead}`),
    gitExit("merge-base", "--is-ancestor", ACCEPTED_PHASE5B_SHA, options.expectedHead),
    gitExit("merge-base", "--is-ancestor", options.expectedHead, "main"),
    git("ls-files", "--error-unmatch", "--", SCRIPT_RELATIVE),
    git("ls-files", "--error-unmatch", "--", TEST_RELATIVE),
    git("diff", "--name-status", "--no-renames", `${ACCEPTED_PHASE5B_SHA}..${options.expectedHead}`, "--", "src", "public", "astro.config.mjs"),
  ]);
  assert.equal(head, options.expectedHead, "local HEAD differs from --expected-head");
  assert.equal(branch, REQUIRED_BRANCH, "local branch differs from the exact Phase 6 branch");
  assert.equal(statusText, "", "deployment verification requires a clean tree, including untracked files");
  assert.equal(mainHead, FROZEN_MAIN_SHA, "local main changed");
  assert.equal(originMain, FROZEN_MAIN_SHA, "origin/main changed");
  assert.equal(originBranch, options.expectedHead, "origin Phase 6 branch differs from expected HEAD");
  assert.equal(upstreamRef, `origin/${REQUIRED_BRANCH}`, "Phase 6 branch tracks the wrong upstream");
  assert.equal(upstreamHead, options.expectedHead, "configured upstream differs from expected HEAD");
  assert.equal(normalizedRemoteUrl(remoteUrl), normalizedRemoteUrl(REQUIRED_REMOTE_URL), "origin URL differs from the Qsite1 authority");
  assert.equal(acceptedAncestor, true, "accepted Phase 5B is not an ancestor of expected HEAD");
  assert.equal(headMergedIntoMain, false, "Phase 6 HEAD is already merged into main");
  assert.equal(trackedVerifier.replaceAll("\\", "/"), SCRIPT_RELATIVE, "deployment verifier is not tracked");
  assert.equal(trackedTest.replaceAll("\\", "/"), TEST_RELATIVE, "deployment verifier test is not tracked");
  const history = parseLinearHistory(historyText, options.expectedHead);
  const liveText = await git("ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${REQUIRED_BRANCH}`, "refs/heads/main");
  const live = parseRemoteRefs(liveText);
  if (live.size !== 2 || live.get(`refs/heads/${REQUIRED_BRANCH}`) !== options.expectedHead || live.get("refs/heads/main") !== FROZEN_MAIN_SHA) {
    throw new Error("live origin Phase 6/main refs differ from the exact authorities");
  }
  const productionDelta = String(productionDeltaText).split(/\r?\n/).filter(Boolean).map((line) => {
    const [statusCode, ...parts] = line.split("\t");
    return { status: statusCode, path: parts.join("\t").replaceAll("\\", "/") };
  });
  return {
    repository: REQUIRED_REPOSITORY,
    branch: REQUIRED_BRANCH,
    head,
    acceptedBase: ACCEPTED_PHASE5B_SHA,
    directParent: history.at(-1).parents[0],
    cleanTree: true,
    history,
    productionDelta,
    main: { branch: "main", headSha: mainHead, frozenAt: FROZEN_MAIN_SHA, containsPhase6Head: false },
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

export function cloudflareDetailsIdentity(value) {
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

export function selectDeploymentCheck(payload, options) {
  const runs = Array.isArray(payload) ? payload : payload?.check_runs;
  if (!Array.isArray(runs)) throw new Error("GitHub check-run response is malformed");
  const matches = runs.map(normalizedCheckRun).filter((check) => {
    const identity = cloudflareDetailsIdentity(check.detailsUrl);
    const summary = String(check.outputSummary ?? "");
    return check.name === "Cloudflare Pages"
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
      && identity.deploymentId === options.deploymentId;
  });
  if (matches.length !== 1) throw new Error("expected exactly one successful signed Cloudflare check binding HEAD, deployment ID, and both previews");
  const match = matches[0];
  return {
    authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
    checkRunId: match.id,
    appSlug: match.appSlug,
    completedAt: match.completedAt,
    deploymentId: options.deploymentId,
    immutableUrl: options.immutableUrl,
    branchUrl: options.branchUrl,
    branch: options.branch ?? REQUIRED_BRANCH,
    commitHash: options.expectedHead,
    environment: "preview",
    status: "PASS",
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

async function jsonRequest(url, token, timeoutMs) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "quantum-hub-phase6-deployment-verifier",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchBound(url, { headers }, timeoutMs);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`GitHub deployment authority returned HTTP ${response.status}`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("GitHub deployment authority did not return JSON");
  }
}

export async function verifyDeploymentAuthority(options) {
  const endpoint = `https://api.github.com/repos/${REQUIRED_REPOSITORY}/commits/${options.expectedHead}/check-runs?check_name=Cloudflare%20Pages&status=completed&per_page=100`;
  const payload = await jsonRequest(endpoint, process.env[options.githubTokenEnvironment], options.timeoutMs);
  if (Number(payload.total_count ?? 0) > 100) throw new Error("GitHub returned more deployment checks than the bounded authority query can prove");
  return selectDeploymentCheck(payload, options);
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

export async function verifyOrigin(origin, distAuthority, options) {
  const missing404Path = `/__phase6-real-404-${options.expectedHead.slice(0, 12)}-${options.deploymentId.slice(0, 8)}/`;
  const responses = [];
  const exercisedPolicies = new Set();
  for (const relativePath of distAuthority.comparablePaths) {
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

function sanitizeFailure(error) {
  let message = String(error?.message ?? error ?? "unknown verification failure");
  message = message.replaceAll(ROOT, "[repository]").replace(/[a-z]:[\\/]users[\\/][^\r\n]+/gi, "[private-path]");
  return message.slice(0, 1_000);
}

export function assertSafeReport(report) {
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

async function assertFreshExternalResolved(output) {
  try {
    await access(output);
    throw new Error("--output must be fresh and must not already exist");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const resolved = await resolvedFromAncestor(output);
  if (isWithin(ROOT, resolved) || isWithin(os.tmpdir(), resolved)) {
    throw new Error("resolved deployment report path enters the repository or temporary directory");
  }
}

async function writeFresh(output, bytes) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes, { flag: "wx" });
}

async function capturedStage(name, failures, operation) {
  try {
    return { status: "PASS", data: await operation() };
  } catch (error) {
    const message = sanitizeFailure(error);
    failures.push({ check: name, message });
    return { status: "FAIL", error: message };
  }
}

export class DeploymentVerificationError extends Error {
  constructor(message, result) {
    super(message);
    this.name = "DeploymentVerificationError";
    this.result = result;
  }
}

export async function verifyDeployment(options) {
  validateOptions(options);
  await assertFreshExternalResolved(options.output);
  const verificationStartedAt = new Date().toISOString();
  const failures = [];
  const repositoryStage = await capturedStage("repository-authority", failures, () => verifyRepository(options));
  const distStage = await capturedStage("local-dist-authority", failures, () => buildDistAuthority(options.dist));
  const deploymentStage = await capturedStage("signed-deployment-authority", failures, () => verifyDeploymentAuthority(options));
  let immutableStage = { status: "NOT_RUN", reason: "local dist authority unavailable" };
  let branchStage = { status: "NOT_RUN", reason: "local dist authority unavailable" };
  if (distStage.status === "PASS") {
    [immutableStage, branchStage] = await Promise.all([
      capturedStage("immutable-origin", failures, () => verifyOrigin(options.immutableUrl, distStage.data, options)),
      capturedStage("branch-origin", failures, () => verifyOrigin(options.branchUrl, distStage.data, options)),
    ]);
  } else {
    failures.push({ check: "origin-byte-parity", message: "not run because local dist authority failed" });
  }
  const passed = failures.length === 0;
  const distReport = distStage.status === "PASS" ? {
    status: "PASS",
    files: distStage.data.fileLedger,
    totals: {
      files: distStage.data.fileLedger.length,
      comparableFiles: distStage.data.comparablePaths.length,
      excludedCloudflareControls: distStage.data.paths.length - distStage.data.comparablePaths.length,
      bytes: distStage.data.fileLedger.reduce((total, record) => total + record.bytes, 0),
    },
    exactHtmlAuthority: [...HTML_AUTHORITY_FILES],
    routeOutcomes: PUBLIC_ROUTE_OUTCOMES,
    canonicalAuthority: distStage.data.canonicalAuthority,
    requiredHeaderPolicies: REQUIRED_HEADER_POLICIES,
  } : distStage;
  const report = {
    schema: SCHEMA,
    status: passed ? "PASS" : "FAIL",
    verificationStartedAt,
    generatedAt: new Date().toISOString(),
    inputs: {
      expectedHead: options.expectedHead,
      acceptedBase: ACCEPTED_PHASE5B_SHA,
      expectedMain: FROZEN_MAIN_SHA,
      repository: REQUIRED_REPOSITORY,
      branch: REQUIRED_BRANCH,
      deploymentId: options.deploymentId,
      immutableUrl: options.immutableUrl,
      branchUrl: options.branchUrl,
      localDist: "dist",
    },
    repository: repositoryStage,
    deployment: deploymentStage,
    dist: distReport,
    origins: { immutable: immutableStage, branch: branchStage },
    checks: {
      exactGitBranchMainAuthority: repositoryStage.status === "PASS",
      signedSuccessfulDeploymentBindsExactHead: deploymentStage.status === "PASS",
      allDeployableFilesComparedWhereCloudflarePermits: immutableStage.status === "PASS" && branchStage.status === "PASS",
      branchImmutableLocalByteParity: immutableStage.status === "PASS" && branchStage.status === "PASS",
      successfulHttpOutcomes: immutableStage.status === "PASS" && branchStage.status === "PASS",
      real404StatusAndByteParity: immutableStage.status === "PASS" && branchStage.status === "PASS",
      requiredHeadersAndCachePolicies: immutableStage.status === "PASS" && branchStage.status === "PASS",
      canonicalBehavior: immutableStage.status === "PASS" && branchStage.status === "PASS",
      productionMainUnchangedAndPhase6Unmerged: repositoryStage.status === "PASS",
    },
    failures,
  };
  const bytes = assertSafeReport(report);
  await writeFresh(options.output, bytes);
  const result = { path: options.output, bytes: bytes.length, sha256: sha256(bytes), report };
  if (!passed) throw new DeploymentVerificationError(`Phase 6 deployment verification failed (${failures.length} checks); report was written`, result);
  return result;
}

function syntheticOptions() {
  const deploymentId = ["12345678", "1234", "4234", "8234", "123456789abc"].join("-");
  return validateOptions(parseArguments([
    "--expected-head", "a".repeat(40),
    "--immutable-url", `https://${deploymentId.slice(0, 8)}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`,
    "--branch-url", `https://phase-six-self-test.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`,
    "--deployment-id", deploymentId,
  ]), { requireOutput: false });
}

export async function selfTest() {
  assert.equal(PUBLIC_ROUTE_OUTCOMES.length, 10);
  assert.equal(PUBLIC_ROUTE_OUTCOMES.filter((route) => route.real404).length, 1);
  assert.equal(new Set(PUBLIC_ROUTE_OUTCOMES.map((route) => route.relativePath)).size, HTML_AUTHORITY_FILES.length);
  const options = syntheticOptions();
  const policies = parseHeadersFile(Object.entries(REQUIRED_HEADER_POLICIES)
    .map(([pattern, value]) => `${pattern}\n  Cache-Control: ${value}`).join("\n\n"));
  assertRequiredHeaderPolicies(policies);
  assert.equal(canonicalForDistFile("about/index.html"), `${PRODUCTION_ORIGIN}/about/`);
  validateCanonicalHtml(`<link href="${PRODUCTION_ORIGIN}/" rel="canonical">`, "index.html");
  validateCanonicalHtml('<meta content="noindex, follow" name="robots">', "404.html");
  const local = { relativePath: "404.html", bytes: Buffer.from('<meta name="robots" content="noindex">') };
  validateDeployedRecord({
    publicPath: "/__phase6-real-404-probe__/",
    status: 404,
    bytes: local.bytes,
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
  }, local, policies);
  assert.throws(() => validateOptions({ ...options, branchUrl: options.immutableUrl }, { requireOutput: false }), /distinct/);
  assert.throws(() => assertSafeReport({ local: "file:///private" }), /private path/);
  return {
    status: "PASS",
    tests: 10,
    routeOutcomeCount: PUBLIC_ROUTE_OUTCOMES.length,
    requiredHeaderPolicyCount: Object.keys(REQUIRED_HEADER_POLICIES).length,
    writesPerformed: false,
    filesystemReadsPerformed: false,
    gitCommandsPerformed: false,
    networkRequestsPerformed: false,
  };
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
      acceptedBase: ACCEPTED_PHASE5B_SHA,
      expectedMain: FROZEN_MAIN_SHA,
      repository: REQUIRED_REPOSITORY,
      branch: REQUIRED_BRANCH,
      deployment: {
        deploymentId: options.deploymentId,
        immutableUrl: options.immutableUrl,
        branchUrl: options.branchUrl,
      },
      localDist: "dist",
      comparableOutputRule: "all emitted files except Cloudflare-consumed _headers",
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
    process.stderr.write(`Phase 6 deployment verification failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
