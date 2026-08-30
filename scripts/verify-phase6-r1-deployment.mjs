#!/usr/bin/env node

/** Fail-closed deployment and byte-parity verification for Phase 6-R1. */

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
  REQUIRED_HEADER_POLICIES,
  buildDistAuthority,
  isWithin,
  sha256,
  stableJson,
  verifyDeploymentAuthority,
  verifyOrigin,
} from "./verify-phase6-deployment.mjs";

const execFileAsync = promisify(execFile);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-6-r1.deployment-verification.v1";
export const REQUIRED_BRANCH = "repair/phase-6-r1-validation-closure";
export const REQUIRED_PARENT = "aee036740b129624c54b8f1b878229f955d187ae";
export const FROZEN_MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const REQUIRED_REPOSITORY = "AmirNatan1/Qsite1";
export const REQUIRED_REMOTE_URL = "https://github.com/AmirNatan1/Qsite1.git";
export const REQUIRED_CLOUDFLARE_PROJECT = "qsite1";
export const REQUIRED_CLOUDFLARE_APP_SLUG = "cloudflare-workers-and-pages";
export const REQUIRED_BRANCH_URL = "https://repair-phase-6-r1-validation.qsite1.pages.dev/";
export const DEFAULT_DIST = path.join(ROOT, "dist");
export const PRODUCTION_DIFF_PATHS = Object.freeze([
  "src",
  "public",
  "astro.config.mjs",
  "package-lock.json",
  ".nvmrc",
  "tsconfig.json",
]);
export const ALLOWED_R1_CHANGED_PATHS = Object.freeze([
  "PHASE_6_R1_VALIDATION_CLOSURE.md",
  "package.json",
  "scripts/assemble-phase6-final-evidence.mjs",
  "scripts/audit-phase6-human-review-package.mjs",
  "scripts/capture-phase6-r1-motion-evidence.mjs",
  "scripts/ingest-phase6-r1-human-evidence.mjs",
  "scripts/package-phase6-human-review.mjs",
  "scripts/qa-phase6-accessibility-interactions.mjs",
  "scripts/qa-phase6-r1-persistent-lifecycle.mjs",
  "scripts/verify-phase6-deployment.mjs",
  "scripts/verify-phase6-r1-deployment.mjs",
  "tests/phase6-accessibility-interactions.test.mjs",
  "tests/phase6-evidence-assembler.test.mjs",
  "tests/phase6-package-tooling.test.mjs",
  "tests/phase6-r1-deployment-verifier.test.mjs",
  "tests/phase6-r1-human-evidence.test.mjs",
  "tests/phase6-r1-motion-capture.test.mjs",
  "tests/phase6-r1-persistent-lifecycle.test.mjs",
]);
export const REQUIRED_R1_TEST_FILES = Object.freeze([
  "tests/phase6-r1-human-evidence.test.mjs",
  "tests/phase6-r1-motion-capture.test.mjs",
  "tests/phase6-r1-persistent-lifecycle.test.mjs",
  "tests/phase6-r1-deployment-verifier.test.mjs",
]);
export const EXPECTED_ADDED_PACKAGE_SCRIPTS = Object.freeze({
  "audit:phase6-r1-review": "node scripts/audit-phase6-human-review-package.mjs --authority-profile phase6-r1",
  "capture:phase6-r1-motion": "node scripts/capture-phase6-r1-motion-evidence.mjs",
  "ingest:phase6-r1-human": "node scripts/ingest-phase6-r1-human-evidence.mjs",
  "package:phase6-r1-review": "node scripts/package-phase6-human-review.mjs --authority-profile phase6-r1",
  "qa:phase6-r1-lifecycle": "node scripts/qa-phase6-r1-persistent-lifecycle.mjs",
  "verify:phase6-r1-deployment": "node scripts/verify-phase6-r1-deployment.mjs",
});
export const ALLOWED_PACKAGE_SCRIPT_CHANGES = Object.freeze([
  ...Object.keys(EXPECTED_ADDED_PACKAGE_SCRIPTS),
  "check",
  "test",
].sort());

const PHASE4_SOURCE_VERIFY_SUFFIX = " && node scripts/verify-phase4-source.mjs --allow-phase5b-route-scope --allow-phase6-global-hardening";

const HASH40 = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    branchUrl: "",
    deploymentId: "",
    dist: DEFAULT_DIST,
    dryRun: false,
    expectedHead: "",
    githubTokenEnvironment: "GITHUB_TOKEN",
    help: false,
    immutableUrl: "",
    output: "",
    selfTest: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--deployment-id") options.deploymentId = next().toLowerCase();
    else if (argument === "--immutable-url") options.immutableUrl = next();
    else if (argument === "--branch-url") options.branchUrl = next();
    else if (argument === "--dist") options.dist = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--github-token-environment") options.githubTokenEnvironment = next();
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function normalizePreviewUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error(`${label} must be a credential-free HTTPS origin`);
  return url.toString();
}

export function validateOptions(options, { requireOutput = true } = {}) {
  if (!HASH40.test(options.expectedHead) || options.expectedHead === REQUIRED_PARENT || options.expectedHead === FROZEN_MAIN_SHA) throw new Error("--expected-head must be the new 40-character R1 HEAD");
  if (!UUID.test(options.deploymentId)) throw new Error("--deployment-id must be a lowercase Cloudflare UUID");
  options.immutableUrl = normalizePreviewUrl(options.immutableUrl, "--immutable-url");
  options.branchUrl = normalizePreviewUrl(options.branchUrl, "--branch-url");
  const expectedImmutable = `https://${options.deploymentId.slice(0, 8)}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`;
  if (options.immutableUrl !== expectedImmutable) throw new Error(`--immutable-url must be exactly ${expectedImmutable}`);
  if (options.branchUrl !== REQUIRED_BRANCH_URL || options.branchUrl === options.immutableUrl) throw new Error(`--branch-url must be the exact R1 branch alias ${REQUIRED_BRANCH_URL}`);
  if (path.resolve(options.dist) !== DEFAULT_DIST) throw new Error("--dist must be the repository dist directory");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5_000 || options.timeoutMs > 120_000) throw new Error("--timeout-ms must be an integer from 5000 through 120000");
  if (requireOutput) {
    if (!options.output || path.extname(options.output).toLowerCase() !== ".json") throw new Error("--output must be a fresh external JSON path");
    if (isWithin(ROOT, options.output) || isWithin(os.tmpdir(), options.output)) throw new Error("--output must remain outside the repository and OS temp");
  }
  return options;
}

export function validatePackageAuthority(parentText, currentText) {
  const parent = JSON.parse(parentText);
  const current = JSON.parse(currentText);
  const parentScripts = parent.scripts ?? {};
  const currentScripts = current.scripts ?? {};
  delete parent.scripts;
  delete current.scripts;
  assert.equal(stableJson(current), stableJson(parent), "package.json production/dependency authority changed outside scripts");
  const changedScripts = [...new Set([...Object.keys(parentScripts), ...Object.keys(currentScripts)])]
    .filter((name) => parentScripts[name] !== currentScripts[name])
    .sort();
  assert.deepEqual(changedScripts, ALLOWED_PACKAGE_SCRIPT_CHANGES, "package.json must change exactly the approved R1 scripts");

  assert.equal(typeof parentScripts.test, "string", "parent package test authority is missing");
  assert.equal(typeof parentScripts.check, "string", "parent package check authority is missing");
  assert(parentScripts.check.endsWith(PHASE4_SOURCE_VERIFY_SUFFIX), "parent package check authority has an unexpected Phase 4 verifier suffix");
  const r1Tests = REQUIRED_R1_TEST_FILES.join(" ");
  const expected = {
    ...EXPECTED_ADDED_PACKAGE_SCRIPTS,
    test: `${parentScripts.test} ${r1Tests}`,
    check: `${parentScripts.check.slice(0, -PHASE4_SOURCE_VERIFY_SUFFIX.length)} ${r1Tests}${PHASE4_SOURCE_VERIFY_SUFFIX}`,
  };
  for (const name of ALLOWED_PACKAGE_SCRIPT_CHANGES) {
    assert.equal(currentScripts[name], expected[name], `package.json script ${name} differs from exact R1 authority`);
  }
  return changedScripts;
}

export function validateChangedPathAuthority(diffText) {
  const allowed = new Set(ALLOWED_R1_CHANGED_PATHS);
  const seen = new Set();
  const records = [];
  for (const line of String(diffText).split(/\r?\n/).filter(Boolean)) {
    const fields = line.split("\t");
    assert.equal(fields.length, 2, `R1 changed-path record is malformed: ${line}`);
    const [status, rawPath] = fields;
    const file = rawPath.replaceAll("\\", "/");
    assert(["A", "M"].includes(status), `R1 changed path has forbidden status ${status}: ${file}`);
    assert(allowed.has(file), `R1 changed path is outside the exact allowlist: ${file}`);
    assert(!seen.has(file), `R1 changed path is duplicated: ${file}`);
    seen.add(file);
    records.push(`${status}\t${file}`);
  }
  assert.deepEqual([...seen].sort(), [...allowed].sort(), "R1 changed-path set must contain every exact approved tooling/report file");
  return records;
}

export function validateSignedR1Authority(authority, options) {
  assert.equal(authority?.status, "PASS", "signed deployment authority did not pass");
  assert.equal(authority?.appSlug, REQUIRED_CLOUDFLARE_APP_SLUG, "signed deployment authority is not the Cloudflare Workers and Pages app");
  assert.equal(authority?.commitHash, options.expectedHead, "signed deployment commit differs");
  assert.equal(authority?.deploymentId, options.deploymentId, "signed deployment ID differs");
  assert.equal(authority?.immutableUrl, options.immutableUrl, "signed deployment immutable URL differs");
  assert.equal(authority?.branch, REQUIRED_BRANCH, "signed deployment branch binding differs");
  assert.equal(authority?.branchUrl, REQUIRED_BRANCH_URL, "signed deployment branch alias differs");
  return {
    ...authority,
    branchBinding: {
      status: "PASS",
      source: "SIGNED_CHECK_EXACT_BRANCH_ALIAS",
      branch: REQUIRED_BRANCH,
      branchUrl: REQUIRED_BRANCH_URL,
    },
  };
}

export function parseLinearR1History(text, expectedHead) {
  const records = String(text).split(/\r?\n/).filter(Boolean).map((line) => {
    const [commit, parentsText, ...subject] = line.split("\t");
    return { commit, parents: String(parentsText ?? "").split(/\s+/).filter(Boolean), subject: subject.join("\t") };
  });
  assert(records.length >= 1, "R1 history contains no commit after the required parent");
  for (let index = 0; index < records.length; index += 1) {
    const requiredParent = index === 0 ? REQUIRED_PARENT : records[index - 1].commit;
    const record = records[index];
    assert(HASH40.test(record.commit) && record.parents.length === 1 && record.parents[0] === requiredParent && record.subject, `R1 commit ${index + 1} is not an exact linear child of ${requiredParent}`);
  }
  assert(records.at(-1).commit === expectedHead, "R1 history does not terminate at expected HEAD");
  return records;
}

async function git(...args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

async function gitExit(...args) {
  try { await execFileAsync("git", args, { cwd: ROOT, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }); return true; }
  catch (error) { if (Number.isInteger(error?.code)) return false; throw error; }
}

function parseRefs(text) {
  const refs = new Map();
  for (const line of String(text).split(/\r?\n/).filter(Boolean)) {
    const [hash, ref] = line.trim().split(/\s+/);
    assert(HASH40.test(hash) && ref && !refs.has(ref), "live remote refs are malformed or duplicated");
    refs.set(ref, hash);
  }
  return refs;
}

export async function verifyRepository(options) {
  const [head, branch, localMain, originMain, originBranch, statusText, upstreamRef, upstreamHead, remoteUrl, historyText, parentAncestor, mergedIntoMain, productionDiff, changedPathDiff, parentPackage, currentPackage] = await Promise.all([
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
    git("diff", "--name-status", "--no-renames", `${REQUIRED_PARENT}..${options.expectedHead}`, "--", ...PRODUCTION_DIFF_PATHS),
    git("diff", "--name-status", "--no-renames", `${REQUIRED_PARENT}..${options.expectedHead}`),
    git("show", `${REQUIRED_PARENT}:package.json`),
    git("show", `${options.expectedHead}:package.json`),
  ]);
  assert.equal(head, options.expectedHead, "local HEAD differs");
  assert.equal(branch, REQUIRED_BRANCH, "local branch differs");
  assert.equal(localMain, FROZEN_MAIN_SHA, "local main changed");
  assert.equal(originMain, FROZEN_MAIN_SHA, "origin/main changed");
  assert.equal(originBranch, options.expectedHead, "origin R1 branch differs");
  assert.equal(upstreamRef, `origin/${REQUIRED_BRANCH}`, "R1 branch tracks the wrong upstream");
  assert.equal(upstreamHead, options.expectedHead, "R1 upstream differs");
  assert.equal(statusText, "", "deployment verification requires a clean tree");
  assert.equal(remoteUrl.replace(/\/$/, ""), REQUIRED_REMOTE_URL, "origin URL differs");
  assert.equal(parentAncestor, true, "required R1 parent is not an ancestor");
  assert.equal(mergedIntoMain, false, "R1 HEAD is already merged into main");
  assert.equal(productionDiff, "", "R1 unexpectedly changed production source");
  const toolingReportDiff = validateChangedPathAuthority(changedPathDiff);
  const packageScriptChanges = validatePackageAuthority(parentPackage, currentPackage);
  const history = parseLinearR1History(historyText, options.expectedHead);
  const refs = parseRefs(await git("ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${REQUIRED_BRANCH}`, "refs/heads/main"));
  assert.equal(refs.get(`refs/heads/${REQUIRED_BRANCH}`), options.expectedHead, "live R1 branch differs");
  assert.equal(refs.get("refs/heads/main"), FROZEN_MAIN_SHA, "live main changed");
  return {
    status: "PASS",
    repository: REQUIRED_REPOSITORY,
    branch: REQUIRED_BRANCH,
    head,
    exactParent: REQUIRED_PARENT,
    directParent: history.at(-1).parents[0],
    cleanTree: true,
    history,
    main: { local: localMain, upstream: originMain, live: refs.get("refs/heads/main"), modifiedOrMerged: false },
    upstream: { ref: upstreamRef, head: upstreamHead, live: refs.get(`refs/heads/${REQUIRED_BRANCH}`), parity: true },
    productionSourceDiff: [],
    productionDiffScope: [...PRODUCTION_DIFF_PATHS, "package.json except approved R1 evidence/test scripts"],
    packageScriptChanges,
    toolingReportDiff,
  };
}

async function freshOutput(output) {
  try { await access(output); throw new Error(`output already exists: ${output}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  await mkdir(path.dirname(output), { recursive: true });
  const parent = await realpath(path.dirname(output));
  const canonical = path.join(parent, path.basename(output));
  assert(!isWithin(ROOT, canonical) && !isWithin(os.tmpdir(), canonical), "resolved output is not external and durable");
  return canonical;
}

function captured(name, failures, operation) {
  return Promise.resolve().then(operation).then((data) => ({ status: "PASS", data })).catch((error) => {
    const message = String(error?.message ?? error).replaceAll(ROOT, "[repository]").slice(0, 1_000);
    failures.push({ check: name, message });
    return { status: "FAIL", error: message };
  });
}

export async function verifyPhase6R1Deployment(options) {
  validateOptions(options);
  const output = await freshOutput(options.output);
  const failures = [];
  const repository = await captured("repository-authority", failures, () => verifyRepository(options));
  const dist = await captured("local-dist-authority", failures, () => buildDistAuthority(options.dist));
  const signed = await captured("signed-deployment-authority", failures, async () => {
    const authority = await verifyDeploymentAuthority({ ...options, branch: REQUIRED_BRANCH });
    return validateSignedR1Authority(authority, options);
  });
  let immutable = { status: "NOT RUN", reason: "local dist authority unavailable" };
  let branch = { status: "NOT RUN", reason: "local dist authority unavailable" };
  if (dist.status === "PASS") {
    [immutable, branch] = await Promise.all([
      captured("immutable-origin", failures, () => verifyOrigin(options.immutableUrl, dist.data, options)),
      captured("branch-origin", failures, () => verifyOrigin(options.branchUrl, dist.data, options)),
    ]);
  }
  const passed = failures.length === 0;
  const report = {
    schema: SCHEMA,
    status: passed ? "PASS" : "FAIL",
    generatedAt: new Date().toISOString(),
    inputs: {
      expectedHead: options.expectedHead,
      exactParent: REQUIRED_PARENT,
      expectedMain: FROZEN_MAIN_SHA,
      repository: REQUIRED_REPOSITORY,
      branch: REQUIRED_BRANCH,
      deploymentId: options.deploymentId,
      immutableUrl: options.immutableUrl,
      branchUrl: options.branchUrl,
      localDist: path.relative(ROOT, options.dist).replaceAll("\\", "/"),
    },
    repository,
    deployment: signed,
    dist: dist.status === "PASS" ? {
      status: "PASS",
      files: dist.data.fileLedger,
      totals: { files: dist.data.fileLedger.length, comparableFiles: dist.data.comparablePaths.length, bytes: dist.data.fileLedger.reduce((sum, file) => sum + file.bytes, 0) },
      exactHtmlAuthority: HTML_AUTHORITY_FILES,
      routeOutcomes: PUBLIC_ROUTE_OUTCOMES,
      canonicalAuthority: dist.data.canonicalAuthority,
      requiredHeaderPolicies: REQUIRED_HEADER_POLICIES,
    } : dist,
    origins: { immutable, branch },
    checks: {
      exactR1BranchParentAndFrozenMain: repository.status === "PASS",
      zeroProductionSourceDiff: repository.status === "PASS",
      signedSuccessfulDeploymentBindsExactHead: signed.status === "PASS",
      immutableLocalByteParity: immutable.status === "PASS",
      branchLocalByteParity: branch.status === "PASS",
      real404HeadersCanonicalAndTenRoutes: immutable.status === "PASS" && branch.status === "PASS",
    },
    failures,
  };
  const bytes = Buffer.from(stableJson(report));
  await writeFile(output, bytes, { flag: "wx" });
  const result = { path: output, byteSize: bytes.length, sha256: sha256(bytes), report };
  if (!passed) throw Object.assign(new Error(`R1 deployment verification failed (${failures.length} checks)`), { result });
  return result;
}

function syntheticOptions() {
  const deploymentId = "12345678-1234-4234-8234-123456789abc";
  return validateOptions(parseArguments([
    "--expected-head", "b".repeat(40),
    "--deployment-id", deploymentId,
    "--immutable-url", `https://${deploymentId.slice(0, 8)}.qsite1.pages.dev/`,
    "--branch-url", REQUIRED_BRANCH_URL,
  ]), { requireOutput: false });
}

export function runSelfTest() {
  const options = syntheticOptions();
  const first = "c".repeat(40);
  const history = parseLinearR1History(`${first}\t${REQUIRED_PARENT}\tR1 tooling\n${options.expectedHead}\t${first}\tR1 evidence`, options.expectedHead);
  return { schema: `${SCHEMA}.self-test`, status: "PASS", exactParent: REQUIRED_PARENT, frozenMain: FROZEN_MAIN_SHA, historyCommits: history.length, routes: PUBLIC_ROUTE_OUTCOMES.length };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/verify-phase6-r1-deployment.mjs --expected-head <sha40> --deployment-id <uuid> --immutable-url <url> --branch-url <url> --output <fresh-external-json> [--dist <dir>]",
    "  node scripts/verify-phase6-r1-deployment.mjs --self-test",
  ].join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return void process.stdout.write(`${usage()}\n`);
  if (options.selfTest) return void process.stdout.write(stableJson(runSelfTest()));
  validateOptions(options, { requireOutput: !options.dryRun });
  if (options.dryRun) return void process.stdout.write(stableJson({ schema: `${SCHEMA}.dry-run`, status: "PASS", branch: REQUIRED_BRANCH, exactParent: REQUIRED_PARENT, frozenMain: FROZEN_MAIN_SHA }));
  const result = await verifyPhase6R1Deployment(options);
  process.stdout.write(stableJson({ schema: `${SCHEMA}.result`, status: "PASS", report: { path: result.path, byteSize: result.byteSize, sha256: result.sha256 } }));
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 6-R1 deployment verification failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
