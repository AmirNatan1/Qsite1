#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  HTML_AUTHORITY_FILES,
  PRODUCTION_ORIGIN,
  PUBLIC_ROUTE_OUTCOMES,
  REQUIRED_CLOUDFLARE_PROJECT,
  REQUIRED_HEADER_POLICIES,
  buildDistAuthority,
  publicPathForDistFile,
  sha256,
  stableJson,
  validateDeployedRecord,
} from "./verify-phase6-deployment.mjs";
import { PHYSICAL_ASSETS } from "./phase7a-contract.mjs";
import {
  PHASE7C_BRANCH,
  PHASE7C_FROZEN_MAIN,
  PHASE7C_FROZEN_PHASE7B_BLOBS,
  PHASE7C_FROZEN_PHASE7B_PATHS,
  PHASE7C_PARENT,
  PHASE7C_PRODUCTION_PATHS,
} from "./phase7c-contract.mjs";
import { verifyPhase7CDocumentaryAssets } from "./verify-phase7c-documentary-assets.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
export const SCHEMA = "quantum-hub.phase-7c.deployment-verification.v1";
export const BINDING_SCHEMA = "quantum-hub.phase-7c.deployment-binding.v1";
export const REQUIRED_REPOSITORY = "AmirNatan1/Qsite1";
export const REQUIRED_REMOTE = "https://github.com/AmirNatan1/Qsite1.git";
export const REQUIRED_CLOUDFLARE_APP = "cloudflare-workers-and-pages";
export const DEFAULT_DIST = path.join(ROOT, "dist");

const derivedBranchLabel = PHASE7C_BRANCH
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 28);
export const REQUIRED_BRANCH_URL = `https://${derivedBranchLabel}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`;

const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEFAULT_TIMEOUT_MS = 30_000;

export const REGRESSION_PATHS = Object.freeze([
  "src/layouts/BaseLayout.astro",
  "src/components/SiteHeader.astro",
  "src/components/home/SignalThreshold.astro",
  "src/scripts/home-cinematic-integration.ts",
  "src/scripts/signal-field.ts",
  "src/styles/navigation.css",
  "src/styles/typography.css",
  "src/styles/routes/phase-7a-signal-field.css",
  ...PHASE7C_FROZEN_PHASE7B_PATHS,
]);

export const PUBLICATION_PATHS = Object.freeze([
  "src/content",
  "src/pages/pocs",
  "src/components/routes",
  "src/scripts/routes",
  "src/styles/routes/maradin.css",
  "src/styles/routes/production-foundations.css",
  "public/media/maradin",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizedPath(value) {
  return value.replaceAll("\\", "/");
}

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function git(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
  }
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function exactKeys(value, keys, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `${label} keys differ`);
}

function headerValue(headers, name) {
  if (headers && typeof headers.get === "function") return headers.get(name);
  const key = Object.keys(headers ?? {}).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

export function normalizePreviewUrl(value, label) {
  invariant(typeof value === "string" && value.length > 0, `${label} is required`);
  const url = new URL(value);
  invariant(
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === "/",
    `${label} must be a credential-free HTTPS origin root`,
  );
  invariant(
    url.hostname.endsWith(`.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev`) &&
    url.hostname !== `${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev`,
    `${label} must be a ${REQUIRED_CLOUDFLARE_PROJECT} preview origin`,
  );
  return url.toString();
}

export function validateOptions(options, { requireOutput = true } = {}) {
  invariant(HASH40.test(options.expectedHead ?? ""), "--expected-head must be a lowercase 40-character Git SHA");
  invariant(options.expectedHead !== PHASE7C_PARENT, "--expected-head must be newer than the accepted Phase 7B parent");
  invariant(options.expectedHead !== PHASE7C_FROZEN_MAIN, "--expected-head must not be production main");
  invariant(UUID.test(options.deploymentId ?? ""), "--deployment-id must be a lowercase Cloudflare deployment UUID");
  options.immutableUrl = normalizePreviewUrl(options.immutableUrl, "--immutable-url");
  options.branchUrl = normalizePreviewUrl(options.branchUrl, "--branch-url");
  invariant(options.branchUrl === REQUIRED_BRANCH_URL, `--branch-url must be the exact Phase 7C branch preview ${REQUIRED_BRANCH_URL}`);
  invariant(options.branchUrl !== options.immutableUrl, "immutable and branch preview origins must be distinct");
  const expectedImmutable = `https://${options.deploymentId.slice(0, 8)}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`;
  invariant(options.immutableUrl === expectedImmutable, `--immutable-url must be exactly ${expectedImmutable}`);
  invariant(Number.isInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms must be an integer from 5000 through 120000");
  invariant(typeof options.bindingJson === "string" && options.bindingJson.length > 0, "--binding-json is required");
  invariant(typeof options.dist === "string" && options.dist.length > 0, "--dist is required");
  if (requireOutput) {
    invariant(typeof options.output === "string" && path.extname(options.output).toLowerCase() === ".json", "--output must be an explicit JSON path");
  }
  return options;
}

export function validateDeploymentBinding(metadata, options) {
  exactKeys(metadata, [
    "schema", "source", "provider", "repository", "project", "environment", "branch",
    "deploymentId", "deployedSha", "immutableUrl", "branchUrl", "githubCheck",
  ], "deployment binding");
  invariant(metadata.schema === BINDING_SCHEMA, "deployment binding schema differs");
  invariant(metadata.source === "CALLER_SUPPLIED_GITHUB_CHECK_METADATA", "deployment binding source must remain explicitly caller supplied");
  invariant(metadata.provider === "Cloudflare Pages", "deployment provider differs");
  invariant(metadata.repository === REQUIRED_REPOSITORY, "deployment repository differs");
  invariant(metadata.project === REQUIRED_CLOUDFLARE_PROJECT, "Cloudflare Pages project differs");
  invariant(metadata.environment === "preview", "deployment must remain a preview rather than production");
  invariant(metadata.branch === PHASE7C_BRANCH, "deployment branch differs from Phase 7C authority");
  invariant(metadata.deploymentId === options.deploymentId, "binding deployment ID differs from caller authority");
  invariant(metadata.deployedSha === options.expectedHead, "binding deployed Git SHA differs from expected HEAD");
  invariant(normalizePreviewUrl(metadata.immutableUrl, "binding immutableUrl") === options.immutableUrl, "binding immutable preview differs");
  invariant(normalizePreviewUrl(metadata.branchUrl, "binding branchUrl") === options.branchUrl, "binding branch preview differs");

  exactKeys(metadata.githubCheck, ["id", "appSlug", "status", "conclusion", "headSha", "completedAt", "detailsUrl"], "deployment githubCheck");
  invariant(Number.isSafeInteger(metadata.githubCheck.id) && metadata.githubCheck.id > 0, "GitHub check ID is invalid");
  invariant(metadata.githubCheck.appSlug === REQUIRED_CLOUDFLARE_APP, "GitHub check application differs");
  invariant(metadata.githubCheck.status === "completed" && metadata.githubCheck.conclusion === "success", "GitHub deployment check is not successfully completed");
  invariant(metadata.githubCheck.headSha === options.expectedHead, "GitHub check SHA differs from expected HEAD");
  invariant(
    typeof metadata.githubCheck.completedAt === "string" &&
    Number.isFinite(Date.parse(metadata.githubCheck.completedAt)) &&
    new Date(metadata.githubCheck.completedAt).toISOString() === metadata.githubCheck.completedAt,
    "GitHub check completion time must be canonical ISO-8601",
  );
  const details = new URL(metadata.githubCheck.detailsUrl);
  invariant(details.protocol === "https:" && details.hostname === "dash.cloudflare.com" && !details.username && !details.password, "GitHub check details URL is not a credential-free Cloudflare dashboard URL");
  invariant(`${details.pathname}${details.search}`.includes(`/pages/view/${REQUIRED_CLOUDFLARE_PROJECT}/${options.deploymentId}`), "GitHub check details URL does not bind the project and deployment ID");

  return {
    schema: metadata.schema,
    evidenceMode: "CALLER_SUPPLIED_CROSS_CHECKED",
    source: metadata.source,
    provider: metadata.provider,
    repository: metadata.repository,
    project: metadata.project,
    environment: metadata.environment,
    branch: metadata.branch,
    deploymentId: metadata.deploymentId,
    deployedSha: metadata.deployedSha,
    immutableUrl: options.immutableUrl,
    branchUrl: options.branchUrl,
    githubCheck: { ...metadata.githubCheck },
    status: "PASS",
  };
}

export function validateRepositorySnapshot(snapshot, expectedHead) {
  invariant(snapshot.head === expectedHead, "local HEAD differs from deployed Git SHA");
  invariant(snapshot.branch === PHASE7C_BRANCH, "local branch differs from Phase 7C authority");
  invariant(snapshot.main === PHASE7C_FROZEN_MAIN, "local main moved");
  invariant(snapshot.originMain === PHASE7C_FROZEN_MAIN, "origin main moved");
  invariant(snapshot.originBranch === expectedHead, "origin Phase 7C branch differs from deployed Git SHA");
  invariant(snapshot.upstreamRef === `origin/${PHASE7C_BRANCH}`, "Phase 7C branch tracks the wrong upstream");
  invariant(snapshot.upstreamHead === expectedHead, "configured upstream differs from deployed Git SHA");
  invariant(snapshot.status === "", "canonical repository worktree is not clean");
  invariant(snapshot.parentAncestor === true, "accepted Phase 7B parent is not an ancestor");
  invariant(snapshot.firstParent === PHASE7C_PARENT, "first Phase 7C commit is not a direct child of the accepted parent");
  invariant(Array.isArray(snapshot.merges) && snapshot.merges.length === 0, "Phase 7C history contains merge commits");
  invariant(String(snapshot.remote).replace(/\/$/, "") === REQUIRED_REMOTE.replace(/\/$/, ""), "origin remote differs from repository authority");
  return {
    branch: snapshot.branch,
    head: snapshot.head,
    parent: PHASE7C_PARENT,
    firstParent: snapshot.firstParent,
    upstream: { ref: snapshot.upstreamRef, sha: snapshot.upstreamHead, parity: true },
    main: { local: snapshot.main, origin: snapshot.originMain, frozen: PHASE7C_FROZEN_MAIN, unchanged: true },
    zeroMergeCommits: true,
    cleanWorktree: true,
    status: "PASS",
  };
}

export async function verifyRepository(root, expectedHead) {
  const repository = await realpath(path.resolve(root));
  const text = (args) => git(repository, args).stdout;
  const head = text(["rev-parse", "HEAD"]);
  const branch = text(["branch", "--show-current"]);
  const main = text(["rev-parse", "refs/heads/main"]);
  const originMain = text(["rev-parse", "refs/remotes/origin/main"]);
  const originBranch = text(["rev-parse", `refs/remotes/origin/${PHASE7C_BRANCH}`]);
  const upstreamRef = text(["rev-parse", "--abbrev-ref", "@{upstream}"]);
  const upstreamHead = text(["rev-parse", "@{upstream}"]);
  const status = text(["status", "--porcelain"]);
  const remote = text(["remote", "get-url", "origin"]);
  const parentAncestor = git(repository, ["merge-base", "--is-ancestor", PHASE7C_PARENT, head], { allowFailure: true }).status === 0;
  const commits = text(["rev-list", "--reverse", `${PHASE7C_PARENT}..${head}`]).split(/\r?\n/).filter(Boolean);
  invariant(commits.length > 0, "Phase 7C history has no commit after its accepted parent");
  const firstParent = text(["rev-parse", `${commits[0]}^`]);
  const merges = text(["rev-list", "--merges", `${PHASE7C_PARENT}..${head}`]).split(/\r?\n/).filter(Boolean);
  return validateRepositorySnapshot({
    head, branch, main, originMain, originBranch, upstreamRef, upstreamHead, status,
    remote, parentAncestor, firstParent, merges,
  }, expectedHead);
}

export function validateSecurityHeaders(headers, label) {
  const setCookie = headerValue(headers, "set-cookie");
  const poweredBy = headerValue(headers, "x-powered-by");
  const allowOrigin = headerValue(headers, "access-control-allow-origin");
  const allowCredentials = headerValue(headers, "access-control-allow-credentials");
  const nosniff = headerValue(headers, "x-content-type-options");
  const referrerPolicy = headerValue(headers, "referrer-policy");
  invariant(!setCookie, `${label} unexpectedly emits Set-Cookie`);
  invariant(!poweredBy, `${label} unexpectedly emits X-Powered-By`);
  invariant(!(allowOrigin === "*" && String(allowCredentials).toLowerCase() === "true"), `${label} emits wildcard credentialed CORS`);
  invariant(!nosniff || String(nosniff).toLowerCase() === "nosniff", `${label} emits an invalid X-Content-Type-Options value`);
  invariant(!referrerPolicy || !String(referrerPolicy).toLowerCase().includes("unsafe-url"), `${label} emits an unsafe Referrer-Policy`);
  return {
    setCookie: false,
    poweredBy: false,
    wildcardCredentialedCors: false,
    contentTypeOptions: nosniff ?? null,
    referrerPolicy: referrerPolicy ?? null,
    status: "PASS",
  };
}

async function fetchRecord(origin, publicPath, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`deployment request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetchImpl(new URL(publicPath, origin), {
      headers: { Accept: "*/*" },
      redirect: "manual",
      signal: controller.signal,
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      publicPath,
      status: response.status,
      bytes,
      contentType: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
      headers: response.headers,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyPreviewOrigin(origin, distAuthority, options, fetchImpl = fetch) {
  const missing404Path = `/__phase7c-real-404-${options.expectedHead.slice(0, 12)}-${options.deploymentId.slice(0, 8)}/`;
  const responses = [];
  const exercisedPolicies = new Set();

  for (const relativePath of distAuthority.comparablePaths) {
    const local = distAuthority.byPath.get(relativePath);
    invariant(local && Buffer.isBuffer(local.bytes), `local dist authority is missing ${relativePath}`);
    const publicPath = publicPathForDistFile(relativePath, missing404Path);
    const observed = await fetchRecord(origin, publicPath, options.timeoutMs, fetchImpl);
    const parity = validateDeployedRecord(observed, local, distAuthority.headerPolicies);
    const security = validateSecurityHeaders(observed.headers, `${origin}${publicPath}`);
    for (const policy of parity.headers.matchedPolicies) exercisedPolicies.add(policy);
    responses.push({
      ...parity,
      sha256: digest(observed.bytes),
      security,
    });
  }

  for (const policy of Object.keys(REQUIRED_HEADER_POLICIES)) {
    invariant(exercisedPolicies.has(policy), `${origin} did not exercise required header policy ${policy}`);
  }

  const routeMatrix = PUBLIC_ROUTE_OUTCOMES.map((route) => {
    const response = responses.find(({ relativePath }) => relativePath === route.relativePath);
    invariant(response, `${origin} route evidence is missing ${route.id}`);
    invariant(response.actualHttpStatus === route.status, `${origin} route status differs for ${route.id}`);
    return {
      id: route.id,
      requestPath: route.real404 ? missing404Path : route.requestPath,
      localAuthority: route.relativePath,
      expectedStatus: route.status,
      actualStatus: response.actualHttpStatus,
      bytes: response.bytes,
      sha256: response.sha256,
      canonical: response.canonical,
      headers: response.headers,
      security: response.security,
      status: "PASS",
    };
  });

  const real404 = routeMatrix.find(({ id }) => id === "404");
  invariant(real404?.actualStatus === 404 && real404.canonical?.canonical === null && real404.canonical?.robotsNoindex === true, `${origin} did not prove a real canonical-free noindex 404`);
  return {
    origin,
    comparableFileCount: distAuthority.comparablePaths.length,
    byteParityCount: responses.length,
    responses,
    routes: routeMatrix,
    real404: {
      requestPath: missing404Path,
      localAuthority: "404.html",
      httpStatus: 404,
      canonical: null,
      robotsNoindex: true,
      byteParity: true,
      status: "PASS",
    },
    exercisedHeaderPolicies: [...exercisedPolicies].sort(),
    status: "PASS",
  };
}

export function validatePhase4ExactHashes(sourceRecords, distRecords, expectedAssets = PHYSICAL_ASSETS) {
  const source = new Map(sourceRecords.map((record) => [record.relativePath, record.bytes]));
  const dist = distRecords instanceof Map
    ? new Map([...distRecords].map(([relativePath, value]) => [relativePath, Buffer.isBuffer(value) ? value : value.bytes]))
    : new Map(distRecords.map((record) => [record.relativePath, record.bytes]));
  const assets = [];
  for (const [sourcePath, expectedSha256] of expectedAssets) {
    invariant(HASH64.test(expectedSha256), `Phase 4 expected SHA-256 is malformed: ${sourcePath}`);
    const distPath = sourcePath.replace(/^public\//, "");
    const sourceBytes = source.get(sourcePath);
    const distBytes = dist.get(distPath);
    invariant(Buffer.isBuffer(sourceBytes), `Phase 4 source authority is missing: ${sourcePath}`);
    invariant(Buffer.isBuffer(distBytes), `Phase 4 dist authority is missing: ${distPath}`);
    const sourceSha256 = digest(sourceBytes);
    const distSha256 = digest(distBytes);
    invariant(sourceSha256 === expectedSha256, `Phase 4 source hash differs: ${sourcePath}`);
    invariant(distSha256 === expectedSha256 && distBytes.equals(sourceBytes), `Phase 4 source/dist byte parity differs: ${sourcePath}`);
    assets.push({ sourcePath, distPath, bytes: sourceBytes.length, sha256: expectedSha256, sourceDistByteParity: true, status: "PASS" });
  }
  return { assetCount: assets.length, assets, status: "PASS" };
}

function changedPaths(root, expectedHead, paths) {
  const text = git(root, ["diff", "--name-only", PHASE7C_PARENT, expectedHead, "--", ...paths]).stdout;
  return text ? text.split(/\r?\n/).filter(Boolean).map(normalizedPath) : [];
}

function sameStringSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

export async function verifyGovernanceEvidence(root, distAuthority, expectedHead) {
  const repository = await realpath(path.resolve(root));
  invariant(git(repository, ["rev-parse", `${expectedHead}^{commit}`]).stdout === expectedHead, "governance expected HEAD is unavailable");
  const sourceRecords = await Promise.all(PHYSICAL_ASSETS.map(async ([relativePath]) => ({
    relativePath,
    bytes: await readFile(path.join(repository, ...relativePath.split("/"))),
  })));
  const phase4 = validatePhase4ExactHashes(sourceRecords, distAuthority.byPath);
  const documentary = await verifyPhase7CDocumentaryAssets(repository);

  const productionChanges = changedPaths(repository, expectedHead, ["src", "public", "package.json"]);
  invariant(
    sameStringSet(productionChanges, PHASE7C_PRODUCTION_PATHS),
    `Phase 7C production delta differs from its exact five-path authority: ${productionChanges.join(", ")}`,
  );

  const acceptedRegressionChanges = changedPaths(repository, expectedHead, REGRESSION_PATHS);
  invariant(acceptedRegressionChanges.length === 0, `accepted Phase 7A/7B regression paths changed: ${acceptedRegressionChanges.join(", ")}`);
  const publicationChanges = changedPaths(repository, expectedHead, PUBLICATION_PATHS);
  invariant(publicationChanges.length === 0, `publication-controlled paths changed: ${publicationChanges.join(", ")}`);

  const phase7bBlobs = [];
  for (const relativePath of PHASE7C_FROZEN_PHASE7B_PATHS) {
    const actual = git(repository, ["rev-parse", `${expectedHead}:${relativePath}`]).stdout;
    const expected = PHASE7C_FROZEN_PHASE7B_BLOBS[relativePath];
    invariant(actual === expected, `accepted Phase 7B Git blob differs: ${relativePath}`);
    phase7bBlobs.push({ path: relativePath, gitBlob: actual, status: "PASS" });
  }

  return {
    phase4,
    publication: {
      controlledPathChanges: publicationChanges,
      documentary,
      expandedClaimsAuthorized: false,
      status: "PASS",
    },
    regression: {
      authorizedProductionChanges: [...PHASE7C_PRODUCTION_PATHS],
      observedProductionChanges: productionChanges,
      acceptedPathChanges: acceptedRegressionChanges,
      phase7bExactBlobs: phase7bBlobs,
      acceptedPhase7AUnchanged: true,
      acceptedPhase7BUnchanged: true,
      status: "PASS",
    },
    status: "PASS",
  };
}

function localDistReport(distAuthority) {
  const records = distAuthority.fileLedger.map((record) => ({ ...record }));
  return {
    fileCount: records.length,
    comparableFileCount: distAuthority.comparablePaths.length,
    excludedFromDeploymentByteComparison: ["_headers"],
    htmlAuthorityFiles: [...HTML_AUTHORITY_FILES],
    inventorySha256: digest(Buffer.from(records.map(({ relativePath, bytes, sha256: hash }) => `${relativePath}\0${bytes}\0${hash}\n`).join(""))),
    files: records,
    status: "PASS",
  };
}

export async function verifyPhase7CDeployment(options, dependencies = {}) {
  validateOptions(options, { requireOutput: false });
  const binding = validateDeploymentBinding(options.bindingMetadata, options);
  const repository = dependencies.repositoryReport ?? await verifyRepository(dependencies.repositoryRoot ?? ROOT, options.expectedHead);
  invariant(repository.status === "PASS" && repository.head === options.expectedHead, "repository evidence does not bind deployed HEAD");
  const distAuthority = dependencies.distAuthority ?? await buildDistAuthority(options.dist);
  const governance = dependencies.governanceReport ?? await verifyGovernanceEvidence(dependencies.repositoryRoot ?? ROOT, distAuthority, options.expectedHead);
  invariant(governance.status === "PASS", "governance evidence did not pass");
  const verifyOrigin = dependencies.verifyOrigin ?? verifyPreviewOrigin;
  const immutable = await verifyOrigin(options.immutableUrl, distAuthority, options, dependencies.fetchImpl ?? fetch);
  const branch = await verifyOrigin(options.branchUrl, distAuthority, options, dependencies.fetchImpl ?? fetch);
  invariant(immutable.status === "PASS" && branch.status === "PASS", "both preview origins must pass exact deployment verification");

  return {
    schema: SCHEMA,
    status: "PASS",
    authority: {
      repository: REQUIRED_REPOSITORY,
      branch: PHASE7C_BRANCH,
      parent: PHASE7C_PARENT,
      frozenMain: PHASE7C_FROZEN_MAIN,
      productionOriginUntouched: PRODUCTION_ORIGIN,
    },
    deployment: binding,
    repository,
    localDist: localDistReport(distAuthority),
    origins: { immutable, branch },
    governance,
    checks: {
      deploymentIdBound: true,
      immutablePreviewBound: true,
      branchPreviewBound: true,
      deployedGitShaBound: true,
      routeStatusHeaderCanonicalParity: true,
      real404: true,
      localDistDeployedByteParity: true,
      phase4ExactHashes: true,
      publicationBoundary: true,
      acceptedRegressionBoundary: true,
    },
  };
}

function portableReportBytes(report) {
  const bytes = Buffer.from(stableJson(report));
  const text = bytes.toString("utf8");
  invariant(!/[a-z]:[\\/]users[\\/]|(?:^|[\\/])\.codex(?:[\\/]|$)|onedrive|appdata|file:\/\/|github_pat_|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}/i.test(text), "deployment report contains a private path or credential pattern");
  return bytes;
}

export async function writePhase7CDeploymentReport(options, dependencies = {}) {
  validateOptions(options);
  const output = path.resolve(options.output);
  const dist = await realpath(path.resolve(options.dist));
  invariant(!isInside(dist, output), "--output must remain outside dist");
  const report = await verifyPhase7CDeployment(options, dependencies);
  const bytes = portableReportBytes(report);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes);
  return { report, output: { bytes: bytes.length, sha256: sha256(bytes) } };
}

export function parseArguments(argv) {
  const options = { dist: DEFAULT_DIST, timeoutMs: DEFAULT_TIMEOUT_MS, output: "" };
  const names = new Map([
    ["--expected-head", "expectedHead"],
    ["--deployment-id", "deploymentId"],
    ["--immutable-url", "immutableUrl"],
    ["--branch-url", "branchUrl"],
    ["--binding-json", "bindingJson"],
    ["--dist", "dist"],
    ["--timeout-ms", "timeoutMs"],
    ["--output", "output"],
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const key = names.get(argument);
    invariant(key, `Unknown argument: ${argument}`);
    invariant(!seen.has(key), `Duplicate argument: ${argument}`);
    const value = argv[index + 1];
    invariant(value && !value.startsWith("--"), `${argument} requires a value`);
    options[key] = key === "timeoutMs" ? Number(value) : value;
    seen.add(key);
    index += 1;
  }
  options.dist = path.resolve(options.dist);
  if (options.output) options.output = path.resolve(options.output);
  if (options.bindingJson) options.bindingJson = path.resolve(options.bindingJson);
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    validateOptions(options);
    options.bindingMetadata = JSON.parse(await readFile(options.bindingJson, "utf8"));
    const result = await writePhase7CDeploymentReport(options);
    process.stdout.write(stableJson({
      schema: SCHEMA,
      status: result.report.status,
      deploymentId: result.report.deployment.deploymentId,
      immutableUrl: result.report.deployment.immutableUrl,
      branchUrl: result.report.deployment.branchUrl,
      deployedSha: result.report.deployment.deployedSha,
      comparableFileCount: result.report.localDist.comparableFileCount,
      report: result.output,
    }));
  } catch (error) {
    process.stdout.write(stableJson({
      schema: SCHEMA,
      status: "FAIL",
      error: { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) },
    }));
    process.exitCode = 1;
  }
}
