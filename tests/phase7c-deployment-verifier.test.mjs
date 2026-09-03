import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PRODUCTION_ORIGIN,
  PUBLIC_ROUTE_OUTCOMES,
  REQUIRED_HEADER_POLICIES,
  publicPathForDistFile,
  validateDistRecords,
} from "../scripts/verify-phase6-deployment.mjs";
import {
  BINDING_SCHEMA,
  REQUIRED_BRANCH_URL,
  SCHEMA,
  parseArguments,
  validateDeploymentBinding,
  validateOptions,
  validatePhase4ExactHashes,
  validateRepositorySnapshot,
  validateSecurityHeaders,
  verifyPhase7CDeployment,
  verifyPreviewOrigin,
  writePhase7CDeploymentReport,
} from "../scripts/verify-phase7c-deployment.mjs";
import { PHASE7C_BRANCH, PHASE7C_FROZEN_MAIN, PHASE7C_PARENT } from "../scripts/phase7c-contract.mjs";

const HEAD = "b".repeat(40);
const DEPLOYMENT_ID = "12345678-1234-4234-8234-123456789abc";
const IMMUTABLE_URL = "https://12345678.qsite1.pages.dev/";

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function binding(overrides = {}) {
  return {
    schema: BINDING_SCHEMA,
    source: "CALLER_SUPPLIED_GITHUB_CHECK_METADATA",
    provider: "Cloudflare Pages",
    repository: "AmirNatan1/Qsite1",
    project: "qsite1",
    environment: "preview",
    branch: PHASE7C_BRANCH,
    deploymentId: DEPLOYMENT_ID,
    deployedSha: HEAD,
    immutableUrl: IMMUTABLE_URL,
    branchUrl: REQUIRED_BRANCH_URL,
    githubCheck: {
      id: 987654321,
      appSlug: "cloudflare-workers-and-pages",
      status: "completed",
      conclusion: "success",
      headSha: HEAD,
      completedAt: "2026-09-03T12:00:00.000Z",
      detailsUrl: `https://dash.cloudflare.com/?to=/account/pages/view/qsite1/${DEPLOYMENT_ID}`,
    },
    ...overrides,
  };
}

function options(overrides = {}) {
  return {
    expectedHead: HEAD,
    deploymentId: DEPLOYMENT_ID,
    immutableUrl: IMMUTABLE_URL,
    branchUrl: REQUIRED_BRANCH_URL,
    bindingJson: "fixture-binding.json",
    bindingMetadata: binding(),
    dist: "fixture-dist",
    output: "",
    timeoutMs: 5_000,
    ...overrides,
  };
}

function canonicalHtml(route) {
  if (route.real404) return Buffer.from('<!doctype html><meta name="robots" content="noindex, follow"><h1>Not found</h1>');
  return Buffer.from(`<!doctype html><link rel="canonical" href="${PRODUCTION_ORIGIN}${route.requestPath}"><h1>${route.id}</h1>`);
}

function headersFile() {
  return Buffer.from(`${Object.entries(REQUIRED_HEADER_POLICIES).map(([pattern, cache]) => `${pattern}\n  Cache-Control: ${cache}`).join("\n\n")}\n`);
}

function distAuthority() {
  const records = PUBLIC_ROUTE_OUTCOMES.map((route) => ({ relativePath: route.relativePath, bytes: canonicalHtml(route) }));
  records.push(
    { relativePath: "_headers", bytes: headersFile() },
    { relativePath: "robots.txt", bytes: Buffer.from("User-agent: *\nAllow: /\n") },
    { relativePath: "sitemap.xml", bytes: Buffer.from("<?xml version=\"1.0\"?><urlset></urlset>\n") },
    { relativePath: "_astro/app.js", bytes: Buffer.from("export{}\n") },
    { relativePath: "media/cinematic/phase-4r2/manifests/manifest.json", bytes: Buffer.from("{}\n") },
    { relativePath: "media/cinematic/phase-4r2/media/desktop.mp4", bytes: Buffer.from("mp4") },
    { relativePath: "media/cinematic/phase-4r2/posters/desktop.png", bytes: Buffer.from("png") },
  );
  return validateDistRecords(records);
}

function mime(relativePath) {
  if (relativePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (relativePath.endsWith(".js")) return "application/javascript";
  if (relativePath.endsWith(".json")) return "application/json";
  if (relativePath.endsWith(".mp4")) return "video/mp4";
  if (relativePath.endsWith(".png")) return "image/png";
  if (relativePath.endsWith(".xml")) return "application/xml";
  return "text/plain; charset=utf-8";
}

function cacheFor(relativePath) {
  const publicPath = `/${relativePath}`;
  if (publicPath.startsWith("/_astro/")) return REQUIRED_HEADER_POLICIES["/_astro/*"];
  if (publicPath.startsWith("/media/cinematic/phase-4r2/manifests/")) return REQUIRED_HEADER_POLICIES["/media/cinematic/phase-4r2/manifests/*"];
  if (publicPath.startsWith("/media/cinematic/phase-4r2/media/")) return REQUIRED_HEADER_POLICIES["/media/cinematic/phase-4r2/media/*"];
  if (publicPath.startsWith("/media/cinematic/phase-4r2/posters/")) return REQUIRED_HEADER_POLICIES["/media/cinematic/phase-4r2/posters/*"];
  return "public, max-age=0, must-revalidate";
}

function mockFetch(authority, { mutatePath = null, bad404 = false, extraHeaders = {} } = {}) {
  return async (url) => {
    const pathname = new URL(url).pathname;
    const missing404Path = `/__phase7c-real-404-${HEAD.slice(0, 12)}-${DEPLOYMENT_ID.slice(0, 8)}/`;
    let relativePath = authority.comparablePaths.find((candidate) => publicPathForDistFile(candidate, missing404Path) === pathname);
    if (pathname.startsWith("/__phase7c-real-404-")) relativePath = "404.html";
    assert(relativePath, `unexpected fixture request: ${pathname}`);
    const local = authority.byPath.get(relativePath);
    const body = relativePath === mutatePath ? Buffer.from("counterfeit") : local.bytes;
    const status = relativePath === "404.html" ? bad404 ? 200 : 404 : 200;
    return new Response(body, {
      status,
      headers: {
        "content-type": mime(relativePath),
        "cache-control": cacheFor(relativePath),
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        ...extraHeaders,
      },
    });
  };
}

function repositorySnapshot(overrides = {}) {
  return {
    head: HEAD,
    branch: PHASE7C_BRANCH,
    main: PHASE7C_FROZEN_MAIN,
    originMain: PHASE7C_FROZEN_MAIN,
    originBranch: HEAD,
    upstreamRef: `origin/${PHASE7C_BRANCH}`,
    upstreamHead: HEAD,
    status: "",
    parentAncestor: true,
    firstParent: PHASE7C_PARENT,
    merges: [],
    remote: "https://github.com/AmirNatan1/Qsite1.git",
    ...overrides,
  };
}

test("Phase 7C deployment constants and options bind the exact preview authority", () => {
  assert.equal(SCHEMA, "quantum-hub.phase-7c.deployment-verification.v1");
  assert.equal(REQUIRED_BRANCH_URL, "https://feature-phase-7c-territory-p.qsite1.pages.dev/");
  assert.equal(new URL(REQUIRED_BRANCH_URL).hostname.split(".")[0].length, 28);
  assert.equal(validateOptions(options(), { requireOutput: false }).expectedHead, HEAD);
  assert.throws(() => validateOptions(options({ expectedHead: PHASE7C_PARENT }), { requireOutput: false }), /newer than/);
  assert.throws(() => validateOptions(options({ branchUrl: "https://other.qsite1.pages.dev/" }), { requireOutput: false }), /exact Phase 7C/);
  assert.throws(() => validateOptions(options({ immutableUrl: "https://87654321.qsite1.pages.dev/" }), { requireOutput: false }), /must be exactly/);
  assert.throws(() => validateOptions(options({ deploymentId: "not-a-uuid" }), { requireOutput: false }), /deployment UUID/);
});

test("caller-supplied metadata is explicitly labelled and fully cross-bound", () => {
  const report = validateDeploymentBinding(binding(), options());
  assert.equal(report.status, "PASS");
  assert.equal(report.evidenceMode, "CALLER_SUPPLIED_CROSS_CHECKED");
  assert.equal(report.deploymentId, DEPLOYMENT_ID);
  assert.equal(report.deployedSha, HEAD);
  assert.throws(() => validateDeploymentBinding(binding({ deployedSha: "c".repeat(40) }), options()), /deployed Git SHA/);
  assert.throws(() => validateDeploymentBinding(binding({ environment: "production" }), options()), /must remain a preview/);
  assert.throws(() => validateDeploymentBinding(binding({ source: "SIGNED" }), options()), /explicitly caller supplied/);
  assert.throws(() => validateDeploymentBinding(binding({ githubCheck: { ...binding().githubCheck, conclusion: "failure" } }), options()), /not successfully completed/);
});

test("repository snapshot validation freezes branch, parity, main, ancestry and linear history", () => {
  const report = validateRepositorySnapshot(repositorySnapshot(), HEAD);
  assert.equal(report.status, "PASS");
  assert.equal(report.zeroMergeCommits, true);
  assert.equal(report.upstream.parity, true);
  assert.throws(() => validateRepositorySnapshot(repositorySnapshot({ main: "c".repeat(40) }), HEAD), /local main moved/);
  assert.throws(() => validateRepositorySnapshot(repositorySnapshot({ originBranch: "c".repeat(40) }), HEAD), /origin Phase 7C branch/);
  assert.throws(() => validateRepositorySnapshot(repositorySnapshot({ merges: ["c".repeat(40)] }), HEAD), /merge commits/);
  assert.throws(() => validateRepositorySnapshot(repositorySnapshot({ status: "?? evidence/" }), HEAD), /not clean/);
});

test("both preview origins prove complete byte, route, header, canonical and real-404 parity", async () => {
  const authority = distAuthority();
  const immutable = await verifyPreviewOrigin(IMMUTABLE_URL, authority, options(), mockFetch(authority));
  assert.equal(immutable.status, "PASS");
  assert.equal(immutable.byteParityCount, authority.comparablePaths.length);
  assert.equal(immutable.routes.length, 10);
  assert.ok(immutable.routes.every(({ status }) => status === "PASS"));
  assert.equal(immutable.real404.httpStatus, 404);
  assert.equal(immutable.real404.byteParity, true);
  assert.deepEqual(immutable.exercisedHeaderPolicies, Object.keys(REQUIRED_HEADER_POLICIES).sort());

  await assert.rejects(
    verifyPreviewOrigin(IMMUTABLE_URL, authority, options(), mockFetch(authority, { mutatePath: "index.html" })),
    /deployed byte parity differs/,
  );
  await assert.rejects(
    verifyPreviewOrigin(IMMUTABLE_URL, authority, options(), mockFetch(authority, { bad404: true })),
    /HTTP status differs/,
  );
  await assert.rejects(
    verifyPreviewOrigin(IMMUTABLE_URL, authority, options(), mockFetch(authority, { extraHeaders: { "set-cookie": "session=secret" } })),
    /Set-Cookie/,
  );
});

test("Phase 4 evidence binds exact source hash and source/dist bytes", () => {
  const bytesA = Buffer.from("phase4-a");
  const bytesB = Buffer.from("phase4-b");
  const expected = [
    ["public/media/cinematic/a.bin", digest(bytesA)],
    ["public/brand/b.bin", digest(bytesB)],
  ];
  const source = [
    { relativePath: expected[0][0], bytes: bytesA },
    { relativePath: expected[1][0], bytes: bytesB },
  ];
  const dist = [
    { relativePath: "media/cinematic/a.bin", bytes: Buffer.from(bytesA) },
    { relativePath: "brand/b.bin", bytes: Buffer.from(bytesB) },
  ];
  const report = validatePhase4ExactHashes(source, dist, expected);
  assert.equal(report.status, "PASS");
  assert.equal(report.assetCount, 2);
  assert.throws(() => validatePhase4ExactHashes(source, [{ ...dist[0], bytes: Buffer.from("changed") }, dist[1]], expected), /source\/dist byte parity/);
  assert.throws(() => validatePhase4ExactHashes(source, dist, [[expected[0][0], "0".repeat(64)], expected[1]]), /source hash differs/);
});

test("security checks reject response state that byte parity alone cannot prove safe", () => {
  const safe = new Headers({ "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" });
  assert.equal(validateSecurityHeaders(safe, "fixture").status, "PASS");
  assert.throws(() => validateSecurityHeaders(new Headers({ "set-cookie": "secret=value" }), "fixture"), /Set-Cookie/);
  assert.throws(() => validateSecurityHeaders(new Headers({ "x-powered-by": "framework" }), "fixture"), /X-Powered-By/);
  assert.throws(() => validateSecurityHeaders(new Headers({ "access-control-allow-origin": "*", "access-control-allow-credentials": "true" }), "fixture"), /wildcard credentialed CORS/);
});

test("the complete structured report keeps caller evidence, proxy-free origin evidence and governance distinct", async () => {
  const authority = distAuthority();
  const repositoryReport = validateRepositorySnapshot(repositorySnapshot(), HEAD);
  const governanceReport = {
    phase4: { status: "PASS", assetCount: 9 },
    publication: { status: "PASS", expandedClaimsAuthorized: false },
    regression: { status: "PASS", acceptedPhase7AUnchanged: true, acceptedPhase7BUnchanged: true },
    status: "PASS",
  };
  const report = await verifyPhase7CDeployment(options(), {
    repositoryReport,
    distAuthority: authority,
    governanceReport,
    fetchImpl: mockFetch(authority),
  });
  assert.equal(report.status, "PASS");
  assert.equal(report.deployment.deploymentId, DEPLOYMENT_ID);
  assert.equal(report.deployment.deployedSha, HEAD);
  assert.equal(report.origins.immutable.status, "PASS");
  assert.equal(report.origins.branch.status, "PASS");
  assert.equal(report.localDist.comparableFileCount, authority.comparablePaths.length);
  assert.ok(Object.values(report.checks).every(Boolean));
  assert.equal(report.governance.publication.expandedClaimsAuthorized, false);
});

test("deployment governance separates production source from package command metadata", async () => {
  const source = await readFile("scripts/verify-phase7c-deployment.mjs", "utf8");
  assert.match(source, /changedPaths\(repository, expectedHead, \["src", "public"\]\)/);
  assert.doesNotMatch(source, /changedPaths\(repository, expectedHead, \["src", "public", "package\.json"\]\)/);
});

test("report writing is external to dist and produces portable hashable JSON", async (context) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "phase7c-deployment-report-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const dist = path.join(temporary, "dist");
  const reports = path.join(temporary, "reports");
  await mkdir(dist, { recursive: true });
  const authority = distAuthority();
  const dependency = {
    repositoryReport: validateRepositorySnapshot(repositorySnapshot(), HEAD),
    distAuthority: authority,
    governanceReport: { status: "PASS", phase4: { status: "PASS" }, publication: { status: "PASS" }, regression: { status: "PASS" } },
    fetchImpl: mockFetch(authority),
  };
  const reportOptions = options({ dist, output: path.join(reports, "deployment.json") });
  const result = await writePhase7CDeploymentReport(reportOptions, dependency);
  const bytes = await readFile(reportOptions.output);
  assert.equal(result.output.bytes, bytes.length);
  assert.equal(result.output.sha256, digest(bytes));
  assert.equal(JSON.parse(bytes).status, "PASS");

  await assert.rejects(
    writePhase7CDeploymentReport({ ...reportOptions, output: path.join(dist, "inside.json") }, dependency),
    /outside dist/,
  );
});

test("CLI parsing requires explicit values and preserves the caller-supplied binding path", () => {
  const parsed = parseArguments([
    "--expected-head", HEAD,
    "--deployment-id", DEPLOYMENT_ID,
    "--immutable-url", IMMUTABLE_URL,
    "--branch-url", REQUIRED_BRANCH_URL,
    "--binding-json", "binding.json",
    "--dist", "dist",
    "--timeout-ms", "5000",
    "--output", "deployment.json",
  ]);
  assert.equal(parsed.expectedHead, HEAD);
  assert.equal(parsed.timeoutMs, 5000);
  assert.match(parsed.bindingJson, /binding\.json$/);
  assert.throws(() => parseArguments(["--unknown", "value"]), /Unknown argument/);
  assert.throws(() => parseArguments(["--expected-head"]), /requires a value/);
});
