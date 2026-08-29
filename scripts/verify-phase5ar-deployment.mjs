#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const SCHEMA = "quantum-hub.phase-5a-r.deployment-verification.v1";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REQUIRED_BRANCH = "codex/phase-5a-r-manifesto-route-identity-repair";
export const REQUIRED_REMOTE_URL = "https://github.com/AmirNatan1/Qsite1.git";
export const ACCEPTED_PHASE5A_SHA = "799ee284355f161e06404919d5022cd051165bf5";
export const FROZEN_MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const REQUIRED_PROJECT = "qsite1";
export const REPORT_FILENAME = "phase-5a-r-deployment-verification.json";
export const MANIFESTO_TEXT = "WE TURN INDUSTRIAL NEEDS INTO FIELD EVIDENCE.";
export const CHECKPOINT_SUBJECTS = Object.freeze([
  "Implement post-CRT Quantum manifesto threshold",
  "Diversify Phase 5 supporting-route document architecture",
  "Repair Phase 5 route responsive overtures",
  "Complete Phase 5A-R anti-template visual preproduction",
  "Complete Phase 5A-R deployed manifesto evidence and review package",
]);
export const SUPPORTING_HTML = Object.freeze([
  "404.html",
  "about/index.html",
  "contact/index.html",
  "for-partners/index.html",
  "for-startups/index.html",
  "industries/index.html",
  "pocs/index.html",
  "pocs/maradin/index.html",
  "spark/index.html",
]);

const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_TEXT = /(?:[a-z]:[\\/]users[\\/]|onedrive|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|(?:api|access|auth|secret)[_-]?token["'=:\s]+[a-z0-9._-]{16,})/i;

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
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
    acceptedPhase5A: ACCEPTED_PHASE5A_SHA,
    frozenMain: FROZEN_MAIN_SHA,
    branch: REQUIRED_BRANCH,
    remote: "origin",
    deploymentId: null,
    immutableUrl: null,
    branchUrl: null,
    output: null,
    dist: path.join(ROOT, "dist"),
    timeoutMs: 30_000,
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
    else if (argument === "--accepted-phase5a") options.acceptedPhase5A = next().toLowerCase();
    else if (argument === "--frozen-main") options.frozenMain = next().toLowerCase();
    else if (argument === "--branch") options.branch = next();
    else if (argument === "--remote") options.remote = next();
    else if (argument === "--deployment-id") options.deploymentId = next();
    else if (argument === "--immutable-url") options.immutableUrl = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--dist") options.dist = path.resolve(next());
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
  if (!url.hostname.endsWith(`.${REQUIRED_PROJECT}.pages.dev`) || url.hostname === `${REQUIRED_PROJECT}.pages.dev`) {
    throw new Error(`${label} must be an observed ${REQUIRED_PROJECT} Pages preview origin`);
  }
  return url.toString();
}

export function validateOptions(options, { requireOutput = true } = {}) {
  if (!HASH40.test(options.expectedHead ?? "")) throw new Error("--expected-head must be a 40-character lowercase Git SHA");
  if (options.acceptedPhase5A !== ACCEPTED_PHASE5A_SHA) throw new Error(`--accepted-phase5a must remain ${ACCEPTED_PHASE5A_SHA}`);
  if (options.frozenMain !== FROZEN_MAIN_SHA) throw new Error(`--frozen-main must remain ${FROZEN_MAIN_SHA}`);
  if (options.branch !== REQUIRED_BRANCH) throw new Error(`--branch must remain ${REQUIRED_BRANCH}`);
  if (!UUID.test(options.deploymentId ?? "")) throw new Error("--deployment-id must be a Cloudflare UUID");
  options.immutableUrl = normalizePreviewUrl(options.immutableUrl, "--immutable-url");
  options.branchUrl = normalizePreviewUrl(options.branchUrl, "--branch-url");
  if (options.immutableUrl === options.branchUrl) throw new Error("immutable and branch previews must be distinct origins");
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) throw new Error("--timeout-ms must be 5000..120000");
  if (requireOutput) {
    if (!options.output || path.basename(options.output) !== REPORT_FILENAME) throw new Error(`--output must end with ${REPORT_FILENAME}`);
    if (isWithin(ROOT, options.output) || isWithin(os.tmpdir(), options.output)) throw new Error("deployment report must be durable and outside the repository/temp directory");
  }
  return options;
}

function help() {
  process.stdout.write(`Phase 5A-R deployment verifier\n\nUsage:\n  node scripts/verify-phase5ar-deployment.mjs \\\n+    --expected-head <40-hex> --deployment-id <uuid> \\\n+    --immutable-url https://<id>.qsite1.pages.dev/ \\\n+    --branch-url https://<branch>.qsite1.pages.dev/ \\\n+    --output <external>/${REPORT_FILENAME}\n\nThe local dist must already be built. The verifier is read-only except for the fresh external report.\n`);
}

async function git(...arguments_) {
  const { stdout } = await execFileAsync("git", arguments_, { cwd: ROOT, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim();
}

export function parseLinearLog(text, accepted = ACCEPTED_PHASE5A_SHA) {
  const records = text.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, parents, ...subject] = line.split("\t");
    return { sha, parents: parents.split(" ").filter(Boolean), subject: subject.join("\t") };
  });
  assert.equal(records.length, CHECKPOINT_SUBJECTS.length, "Phase 5A-R must contain the exact five checkpoint commits");
  records.forEach((record, index) => {
    assert.match(record.sha, HASH40, `checkpoint ${index + 1} SHA`);
    assert.equal(record.parents.length, 1, `checkpoint ${index + 1} must be linear`);
    assert.equal(record.subject, CHECKPOINT_SUBJECTS[index], `checkpoint ${index + 1} subject differs`);
    assert.equal(record.parents[0], index === 0 ? accepted : records[index - 1].sha, `checkpoint ${index + 1} parent differs`);
  });
  return records;
}

function parseLsRemote(text) {
  return new Map(text.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, reference] = line.split(/\s+/);
    return [reference, sha];
  }));
}

async function verifyGit(options) {
  const [head, statusText, localMain, upstreamMain, upstreamBranch, remoteUrl, logText] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("status", "--porcelain=v1", "--untracked-files=all"),
    git("rev-parse", "main"),
    git("rev-parse", `${options.remote}/main`),
    git("rev-parse", `${options.remote}/${options.branch}`),
    git("remote", "get-url", options.remote),
    git("log", "--format=%H%x09%P%x09%s", "--reverse", `${options.acceptedPhase5A}..${options.expectedHead}`),
  ]);
  assert.equal(head, options.expectedHead, "local HEAD differs from expected final SHA");
  assert.equal(statusText, "", "deployment verification requires a clean tree");
  assert.equal(remoteUrl, REQUIRED_REMOTE_URL, "origin URL differs");
  assert.equal(localMain, options.frozenMain, "local main changed");
  assert.equal(upstreamMain, options.frozenMain, "origin/main changed");
  assert.equal(upstreamBranch, options.expectedHead, "origin branch differs from final HEAD");
  const commits = parseLinearLog(logText, options.acceptedPhase5A);
  assert.equal(commits.at(-1).sha, options.expectedHead, "final checkpoint is not HEAD");

  const liveText = await git("ls-remote", "--heads", options.remote, `refs/heads/${options.branch}`, "refs/heads/main");
  const live = parseLsRemote(liveText);
  assert.equal(live.get(`refs/heads/${options.branch}`), options.expectedHead, "live remote feature branch differs");
  assert.equal(live.get("refs/heads/main"), options.frozenMain, "live remote main changed");
  return { head, parent: commits[0].parents[0], commits, remoteUrl, localMain, upstreamMain, upstreamBranch, liveBranch: live.get(`refs/heads/${options.branch}`), liveMain: live.get("refs/heads/main"), cleanTree: true };
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(candidate));
    else if (entry.isFile()) files.push(candidate);
    else throw new Error(`unsupported dist entry ${candidate}`);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function posix(relative) { return relative.replaceAll("\\", "/"); }

function htmlText(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function servedPath(relative) {
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
}

async function distAuthority(dist) {
  if (!(await exists(dist)) || !(await stat(dist)).isDirectory()) throw new Error("built dist directory is missing");
  const index = await readFile(path.join(dist, "index.html"), "utf8");
  assert.equal((index.match(/<h1\b/gi) ?? []).length, 1, "deployed homepage authority must contain exactly one H1");
  const h1 = index.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  assert.ok(h1, "homepage H1 is missing");
  assert.equal(htmlText(h1).toUpperCase(), MANIFESTO_TEXT, "homepage H1 differs from the manifesto");
  for (const relative of SUPPORTING_HTML) assert.ok(await exists(path.join(dist, ...relative.split("/"))), `dist is missing ${relative}`);

  const records = [];
  for (const absolute of await walk(dist)) {
    const relativePath = posix(path.relative(dist, absolute));
    if (["_headers", "_redirects"].includes(relativePath)) continue;
    const bytes = await readFile(absolute);
    records.push({ relativePath, requestPath: servedPath(relativePath), bytes: bytes.length, sha256: sha256(bytes), data: bytes });
  }
  return { h1: MANIFESTO_TEXT, records };
}

async function fetchWithTimeout(url, timeoutMs, headers = {}) {
  return fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
}

export function cloudflareDetailsBindDeployment(value, deploymentId) {
  try {
    const details = new URL(value);
    if (details.protocol !== "https:" || details.hostname !== "dash.cloudflare.com") return false;
    if (details.pathname.endsWith(`/${deploymentId}`)) return true;
    const routedTarget = details.searchParams.get("to");
    if (!routedTarget) return false;
    const routed = new URL(routedTarget, details.origin);
    return routed.origin === details.origin && routed.pathname.endsWith(`/${deploymentId}`);
  } catch {
    return false;
  }
}

async function githubCheck(options) {
  const endpoint = `https://api.github.com/repos/AmirNatan1/Qsite1/commits/${options.expectedHead}/check-runs`;
  const response = await fetchWithTimeout(endpoint, options.timeoutMs, {
    Accept: "application/vnd.github+json",
    "User-Agent": "quantum-hub-phase5ar-deployment-verifier",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  if (!response.ok) throw new Error(`GitHub check-runs request failed (${response.status})`);
  const payload = await response.json();
  const candidates = (payload.check_runs ?? []).filter((run) => /cloudflare/i.test(`${run.name} ${run.app?.name ?? ""} ${run.output?.title ?? ""}`));
  const match = candidates.find((run) => cloudflareDetailsBindDeployment(run.details_url, options.deploymentId));
  assert.ok(match, "GitHub exposes no Cloudflare check bound to the observed deployment UUID");
  assert.equal(match.head_sha, options.expectedHead, "Cloudflare check head SHA differs");
  assert.equal(match.status, "completed", "Cloudflare check is not complete");
  assert.equal(match.conclusion, "success", "Cloudflare check did not succeed");
  return { id: String(match.id), name: match.name, app: match.app?.name ?? null, headSha: match.head_sha, status: match.status, conclusion: match.conclusion, detailsUrl: match.details_url };
}

async function verifyOrigin(origin, records, timeoutMs) {
  const failures = [];
  const responses = [];
  for (const record of records) {
    const url = new URL(record.requestPath, origin);
    const response = await fetchWithTimeout(url, timeoutMs);
    const bytes = Buffer.from(await response.arrayBuffer());
    const observed = { relativePath: record.relativePath, status: response.status, bytes: bytes.length, sha256: sha256(bytes), cacheControl: response.headers.get("cache-control"), contentType: response.headers.get("content-type") };
    responses.push(observed);
    if (!response.ok || bytes.length !== record.bytes || observed.sha256 !== record.sha256) failures.push(observed);
  }
  assert.equal(failures.length, 0, `${origin} byte parity failed: ${JSON.stringify(failures.slice(0, 5))}`);
  return { origin, files: responses.length, bytes: responses.reduce((total, item) => total + item.bytes, 0), responses };
}

function publicRecord(record) {
  return { relativePath: record.relativePath, requestPath: record.requestPath, bytes: record.bytes, sha256: record.sha256 };
}

export async function verifyDeployment(options) {
  validateOptions(options);
  if (await exists(options.output)) throw new Error(`refusing to overwrite existing report: ${options.output}`);
  const gitAuthority = await verifyGit(options);
  const dist = await distAuthority(options.dist);
  const check = await githubCheck(options);
  const [immutable, branch] = await Promise.all([
    verifyOrigin(options.immutableUrl, dist.records, options.timeoutMs),
    verifyOrigin(options.branchUrl, dist.records, options.timeoutMs),
  ]);
  const report = {
    schema: SCHEMA,
    status: "PASS",
    generatedAt: new Date().toISOString(),
    git: gitAuthority,
    deployment: {
      provider: "Cloudflare Pages",
      project: REQUIRED_PROJECT,
      environment: "preview",
      deploymentId: options.deploymentId,
      exactSha: options.expectedHead,
      branch: options.branch,
      immutableUrl: options.immutableUrl,
      branchUrl: options.branchUrl,
      githubCheck: check,
      dashboardObservationRequired: true,
    },
    dist: { h1: dist.h1, files: dist.records.map(publicRecord), totals: { files: dist.records.length, bytes: dist.records.reduce((total, record) => total + record.bytes, 0) } },
    origins: {
      immutable: { origin: immutable.origin, files: immutable.files, bytes: immutable.bytes, responses: immutable.responses },
      branch: { origin: branch.origin, files: branch.files, bytes: branch.bytes, responses: branch.responses },
    },
    checks: {
      exactFiveCommitChain: true,
      cleanTree: true,
      localUpstreamLiveParity: true,
      mainFrozen: true,
      signedCloudflareCheckSuccess: true,
      immutableByteParity: true,
      branchByteParity: true,
      exactlyOneManifestoH1: true,
      publicSupportingRouteOutputPresent: true,
    },
    authorization: { humanAccepted: false, mainMerged: false, phase5BAuthorized: false },
  };
  const bytes = Buffer.from(stableJson(report));
  if (PRIVATE_TEXT.test(bytes.toString("utf8"))) throw new Error("deployment report contains private local data or a credential-like string");
  await mkdir(path.dirname(options.output), { recursive: true });
  const temporary = `${options.output}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try { await rename(temporary, options.output); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return { path: options.output, bytes: bytes.length, sha256: sha256(bytes), report };
}

export async function selfTest() {
  const base = {
    expectedHead: "a".repeat(40),
    acceptedPhase5A: ACCEPTED_PHASE5A_SHA,
    frozenMain: FROZEN_MAIN_SHA,
    branch: REQUIRED_BRANCH,
    remote: "origin",
    deploymentId: "11111111-2222-4333-8444-555555555555",
    immutableUrl: "https://12345678.qsite1.pages.dev/",
    branchUrl: "https://codex-phase-5a-r.qsite1.pages.dev/",
    output: path.join(path.dirname(ROOT), REPORT_FILENAME),
    dist: path.join(ROOT, "dist"),
    timeoutMs: 30_000,
  };
  assert.equal(validateOptions({ ...base }).branch, REQUIRED_BRANCH);
  assert.throws(() => validateOptions({ ...base, branch: "main" }), /--branch/);
  assert.throws(() => validateOptions({ ...base, immutableUrl: "http://12345678.qsite1.pages.dev/" }), /HTTPS/);
  assert.throws(() => validateOptions({ ...base, output: path.join(ROOT, REPORT_FILENAME) }), /outside/);
  const rows = CHECKPOINT_SUBJECTS.map((subject, index) => {
    const sha = String(index + 1).repeat(40);
    const parent = index === 0 ? ACCEPTED_PHASE5A_SHA : String(index).repeat(40);
    return `${sha}\t${parent}\t${subject}`;
  });
  assert.equal(parseLinearLog(rows.join("\n")).length, 5);
  assert.throws(() => parseLinearLog(rows.slice(1).join("\n")), /exact five/);
  return { status: "PASS", tests: 6 };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { help(); return; }
  if (options.selfTest) { process.stdout.write(stableJson({ schema: `${SCHEMA}.self-test`, ...await selfTest() })); return; }
  validateOptions(options, { requireOutput: !options.dryRun });
  if (options.dryRun) {
    process.stdout.write(stableJson({ schema: `${SCHEMA}.dry-run`, status: "PASS", expectedHead: options.expectedHead, deploymentId: options.deploymentId, immutableUrl: options.immutableUrl, branchUrl: options.branchUrl }));
    return;
  }
  const result = await verifyDeployment(options);
  process.stdout.write(stableJson({ schema: `${SCHEMA}.result`, status: "PASS", report: { path: result.path, bytes: result.bytes, sha256: result.sha256 } }));
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { process.stderr.write(`Phase 5A-R deployment verification failed: ${error.stack || error.message}\n`); process.exitCode = 1; });
