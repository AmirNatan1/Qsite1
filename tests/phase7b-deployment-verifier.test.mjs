import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_DIST,
  FROZEN_MAIN_SHA,
  HTML_AUTHORITY_FILES,
  PUBLIC_ROUTE_OUTCOMES,
  REQUIRED_BRANCH,
  REQUIRED_BRANCH_URL,
  REQUIRED_CLOUDFLARE_PROJECT,
  REQUIRED_HEADER_POLICIES,
  REQUIRED_PARENT,
  ROOT,
  SCHEMA,
  SECURITY_HEADER_CONTRACT,
  extractRuntimeRequests,
  extractSignedPreviewUrls,
  parseArguments,
  parseLinearHistory,
  runSelfTest,
  selectSignedDeploymentCheck,
  validateExternalOutput,
  validateOptions,
  validatePhase4HashAuthority,
  validatePortableReport,
  validateProductionIsolation,
  validateRepositorySnapshot,
  validateRuntimeRequestGraph,
  validateSecurityHeaders,
  verifyOrigin,
  verifyOriginsSerially,
} from "../scripts/verify-phase7b-deployment.mjs";

const HEAD = "b".repeat(40);
const DEPLOYMENT_ID = "12345678-1234-4234-8234-123456789abc";
const IMMUTABLE_URL = "https://12345678.qsite1.pages.dev/";

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function options(extra = [], { resolved = false } = {}) {
  const base = ["--expected-head", HEAD];
  if (resolved) base.push("--immutable-url", IMMUTABLE_URL, "--branch-url", REQUIRED_BRANCH_URL, "--deployment-id", DEPLOYMENT_ID);
  return validateOptions(parseArguments([...base, ...extra]), { requireOutput: false, requireResolvedBinding: resolved });
}

function checkRun(overrides = {}) {
  return {
    id: 987654321,
    name: "Cloudflare Pages",
    app: { slug: "cloudflare-workers-and-pages" },
    head_sha: HEAD,
    status: "completed",
    conclusion: "success",
    completed_at: "2026-09-01T12:00:00Z",
    details_url: `https://dash.cloudflare.com/?to=/16bccc18bf7d54fd2538de7c1b5f19ed/pages/view/qsite1/${DEPLOYMENT_ID}`,
    output: {
      title: "Deployed successfully",
      summary: `Deploy successful! ${HEAD.slice(0, 7)} ${IMMUTABLE_URL.slice(0, -1)} ${REQUIRED_BRANCH_URL.slice(0, -1)}`,
    },
    ...overrides,
  };
}

function canonicalForRoute(route) {
  if (route.real404) return '<meta name="robots" content="noindex, follow"><h1>Not found</h1>';
  return `<link rel="canonical" href="https://qsite1.pages.dev${route.requestPath}"><h1>${route.id}</h1>`;
}

function syntheticDistAuthority() {
  const records = PUBLIC_ROUTE_OUTCOMES.map((route) => ({
    relativePath: route.relativePath,
    requestPath: route.requestPath,
    bytes: Buffer.from(canonicalForRoute(route)),
    contentType: "text/html; charset=utf-8",
    cacheControl: "public, max-age=0, must-revalidate",
  }));
  records.push(
    { relativePath: "_astro/app.js", requestPath: "/_astro/app.js", bytes: Buffer.from("export{}"), contentType: "application/javascript", cacheControl: REQUIRED_HEADER_POLICIES["/_astro/*"] },
    { relativePath: "media/cinematic/phase-4r2/manifests/m.json", requestPath: "/media/cinematic/phase-4r2/manifests/m.json", bytes: Buffer.from("{}"), contentType: "application/json", cacheControl: REQUIRED_HEADER_POLICIES["/media/cinematic/phase-4r2/manifests/*"] },
    { relativePath: "media/cinematic/phase-4r2/media/m.mp4", requestPath: "/media/cinematic/phase-4r2/media/m.mp4", bytes: Buffer.from("mp4"), contentType: "video/mp4", cacheControl: REQUIRED_HEADER_POLICIES["/media/cinematic/phase-4r2/media/*"] },
    { relativePath: "media/cinematic/phase-4r2/posters/p.png", requestPath: "/media/cinematic/phase-4r2/posters/p.png", bytes: Buffer.from("png"), contentType: "image/png", cacheControl: REQUIRED_HEADER_POLICIES["/media/cinematic/phase-4r2/posters/*"] },
  );
  return {
    comparablePaths: records.map((record) => record.relativePath),
    byPath: new Map(records.map((record) => [record.relativePath, record])),
    headerPolicies: Object.entries(REQUIRED_HEADER_POLICIES).map(([pattern, value]) => ({ pattern, headers: { "cache-control": value } })),
    records,
  };
}

function mockOriginFetch(authority, { mutate = null, headers = {} } = {}) {
  return async (url) => {
    const pathname = new URL(url).pathname;
    let record = authority.records.find((candidate) => candidate.requestPath === pathname);
    if (pathname.startsWith("/__phase7b-real-404-")) record = authority.records.find((candidate) => candidate.relativePath === "404.html");
    assert(record, `unexpected mock request ${pathname}`);
    const body = mutate?.(record, pathname) ?? record.bytes;
    return new Response(body, {
      status: record.relativePath === "404.html" ? 404 : 200,
      headers: {
        "content-type": record.contentType,
        "cache-control": record.cacheControl,
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        ...headers,
      },
    });
  };
}

function repositorySnapshot(overrides = {}) {
  return {
    head: HEAD,
    branch: REQUIRED_BRANCH,
    main: FROZEN_MAIN_SHA,
    originMain: FROZEN_MAIN_SHA,
    originBranch: HEAD,
    upstreamRef: `origin/${REQUIRED_BRANCH}`,
    upstreamHead: HEAD,
    status: "",
    remote: "https://github.com/AmirNatan1/Qsite1.git",
    parentAncestor: true,
    mergedMain: false,
    liveOriginBranch: HEAD,
    liveOriginMain: FROZEN_MAIN_SHA,
    history: `${HEAD}\t${REQUIRED_PARENT}\tfeat(phase7b): implement operating field`,
    ...overrides,
  };
}

test("Phase 7B deployment constants bind exact branch, parent, alias, main, route, and header authorities", () => {
  assert.equal(SCHEMA, "quantum-hub.phase-7b.deployment-verification.v1");
  assert.equal(REQUIRED_BRANCH, "feature/phase-7b-operating-field-workpiece");
  assert.equal(REQUIRED_PARENT, "626812c85f84ee8a48228a1f168d58c07d7943e7");
  assert.equal(FROZEN_MAIN_SHA, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(REQUIRED_BRANCH_URL, "https://feature-phase-7b-operating-f.qsite1.pages.dev/");
  assert.equal(new URL(REQUIRED_BRANCH_URL).hostname.split(".")[0].length, 28);
  assert.equal(REQUIRED_CLOUDFLARE_PROJECT, "qsite1");
  assert.deepEqual(PUBLIC_ROUTE_OUTCOMES.map(({ status }) => status), [200, 200, 200, 200, 200, 200, 200, 200, 200, 404]);
  assert.deepEqual(PUBLIC_ROUTE_OUTCOMES.map(({ relativePath }) => relativePath).sort(), [...HTML_AUTHORITY_FILES].sort());
  assert.equal(Object.keys(SECURITY_HEADER_CONTRACT).length, 8);
});

test("CLI accepts explicit signed bindings or signed discovery and rejects counterfeit authority values", () => {
  const discovery = options();
  assert.equal(discovery.immutableUrl, "");
  assert.equal(discovery.branchUrl, "");
  const explicit = options([], { resolved: true });
  assert.equal(explicit.immutableUrl, IMMUTABLE_URL);
  assert.equal(explicit.branchUrl, REQUIRED_BRANCH_URL);
  assert.equal(explicit.deploymentId, DEPLOYMENT_ID);
  assert.equal(explicit.dist, DEFAULT_DIST);
  assert.throws(() => options(["--expected-head", REQUIRED_PARENT]), /final HEAD/);
  assert.throws(() => options(["--branch-url", "https://other.qsite1.pages.dev/"]), /exact Phase 7B preview alias/);
  assert.throws(() => options(["--immutable-url", "http://12345678.qsite1.pages.dev/"]), /HTTPS/);
  assert.throws(() => options(["--immutable-url", "https://qsite1.pages.dev/"]), /preview origin/);
  assert.throws(() => options(["--immutable-url", "https://nothex12.qsite1.pages.dev/"]), /eight-hex/);
  assert.throws(() => options(["--deployment-id", "not-a-uuid"]), /deployment UUID/);
  assert.throws(() => options(["--immutable-url", IMMUTABLE_URL, "--deployment-id", "87654321-1234-4234-8234-123456789abc"]), /must be exactly/);
  assert.throws(() => options(["--dist", path.join(ROOT, "other-dist")]), /exact repository dist/);
});

test("signed preview URL extraction is bounded to credential-free qsite1 preview origins", () => {
  assert.deepEqual(extractSignedPreviewUrls(`ok ${IMMUTABLE_URL.slice(0, -1)} and ${REQUIRED_BRANCH_URL}`), [IMMUTABLE_URL, REQUIRED_BRANCH_URL].sort());
  assert.deepEqual(extractSignedPreviewUrls("https://qsite1.pages.dev/ https://evil.invalid/"), []);
});

test("signed Cloudflare discovery binds exact HEAD, UUID, immutable hostname, and branch preview", () => {
  const selected = selectSignedDeploymentCheck({ total_count: 1, check_runs: [checkRun()] }, options());
  assert.equal(selected.status, "PASS");
  assert.equal(selected.deployedSha, HEAD);
  assert.equal(selected.deploymentId, DEPLOYMENT_ID);
  assert.equal(selected.immutableUrl, IMMUTABLE_URL);
  assert.equal(selected.branchUrl, REQUIRED_BRANCH_URL);
  assert.equal(selected.environment, "preview");
  assert.equal(selectSignedDeploymentCheck({ check_runs: [checkRun()] }, options([], { resolved: true })).deploymentId, DEPLOYMENT_ID);
});

test("counterfeit signed checks fail closed", () => {
  const supplied = options();
  assert.throws(() => selectSignedDeploymentCheck({ check_runs: [checkRun({ head_sha: "c".repeat(40) })] }, supplied), /exactly one/);
  assert.throws(() => selectSignedDeploymentCheck({ check_runs: [checkRun({ app: { slug: "counterfeit" } })] }, supplied), /exactly one/);
  assert.throws(() => selectSignedDeploymentCheck({ check_runs: [checkRun({ conclusion: "failure" })] }, supplied), /exactly one/);
  assert.throws(() => selectSignedDeploymentCheck({ check_runs: [checkRun({ details_url: "https://evil.invalid/" })] }, supplied), /exactly one/);
  assert.throws(() => selectSignedDeploymentCheck({ check_runs: [checkRun({ output: { title: "Deployed successfully", summary: `Deploy successful! ${HEAD.slice(0, 7)} ${IMMUTABLE_URL}` } })] }, supplied), /exactly one/);
  assert.throws(() => selectSignedDeploymentCheck({ check_runs: [checkRun(), checkRun({ id: 2 })] }, supplied), /exactly one/);
  assert.throws(() => selectSignedDeploymentCheck({ check_runs: [checkRun()] }, options(["--deployment-id", "87654321-1234-4234-8234-123456789abc"])), /exactly one/);
});

test("linear history and repository snapshot enforce exact base, zero merges, parity, and frozen main", () => {
  const parsed = parseLinearHistory(repositorySnapshot().history, HEAD);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].parents[0], REQUIRED_PARENT);
  const report = validateRepositorySnapshot(repositorySnapshot(), options());
  assert.equal(report.status, "PASS");
  assert.equal(report.zeroMergeCommits, true);
  assert.equal(report.main.containsDeployedSha, false);
  assert.throws(() => validateRepositorySnapshot(repositorySnapshot({ main: "c".repeat(40) }), options()), /local main/);
  assert.throws(() => validateRepositorySnapshot(repositorySnapshot({ originBranch: "c".repeat(40) }), options()), /origin Phase 7B branch/);
  assert.throws(() => validateRepositorySnapshot(repositorySnapshot({ upstreamRef: "" }), options()), /tracks the wrong upstream/);
  assert.throws(() => validateRepositorySnapshot(repositorySnapshot({ upstreamHead: "c".repeat(40) }), options()), /configured upstream/);
  assert.throws(() => validateRepositorySnapshot(repositorySnapshot({ mergedMain: true }), options()), /already merged/);
  assert.throws(() => validateRepositorySnapshot(repositorySnapshot({ history: `${HEAD}\t${REQUIRED_PARENT} ${"c".repeat(40)}\tmerge` }), options()), /not an exact/);
});

test("production isolation rejects main or production-origin substitution", () => {
  const repository = validateRepositorySnapshot(repositorySnapshot(), options());
  const deployment = selectSignedDeploymentCheck({ check_runs: [checkRun()] }, options());
  assert.equal(validateProductionIsolation(repository, deployment).status, "PASS");
  assert.throws(() => validateProductionIsolation({ ...repository, main: { ...repository.main, containsDeployedSha: true } }, deployment), /frozen main/);
  assert.throws(() => validateProductionIsolation(repository, { ...deployment, environment: "production" }), /not the exact/);
  assert.throws(() => validateProductionIsolation(repository, { ...deployment, immutableUrl: "https://qsite1.pages.dev/" }), /production origin/);
});

test("runtime graph inventories HTML, CSS, and JS requests and rejects external or missing payloads", () => {
  const records = [
    { relativePath: "index.html", bytes: Buffer.from('<link rel="stylesheet" href="/_astro/app.css"><script src="/_astro/app.js"></script><img src="/asset.png">') },
    { relativePath: "_astro/app.css", bytes: Buffer.from('@font-face{src:url("/font.woff2")} .x{mask:url(#local)}') },
    { relativePath: "_astro/app.js", bytes: Buffer.from('fetch("/manifest.json"); import("./chunk.js")') },
    { relativePath: "_astro/chunk.js", bytes: Buffer.from("export{}") },
    { relativePath: "asset.png", bytes: Buffer.from("png") },
    { relativePath: "font.woff2", bytes: Buffer.from("font") },
    { relativePath: "manifest.json", bytes: Buffer.from("{}") },
  ];
  assert.equal(extractRuntimeRequests("index.html", records[0].bytes).length, 3);
  const report = validateRuntimeRequestGraph(records);
  assert.equal(report.status, "PASS");
  assert.equal(report.literalRequestCount, 6);
  assert.equal(report.unexpectedRuntimeOriginCount, 0);
  const external = records.map((record) => record.relativePath === "index.html" ? { ...record, bytes: Buffer.from('<script src="https://cdn.invalid/app.js"></script>') } : record);
  assert.throws(() => validateRuntimeRequestGraph(external), /unexpected runtime origin/);
  const missing = records.filter((record) => record.relativePath !== "asset.png");
  assert.throws(() => validateRuntimeRequestGraph(missing), /no exact dist payload/);
});

test("frozen Phase 4 pure validator binds exact source/dist bytes and rejects counterfeits", () => {
  const bytes = Buffer.from("frozen-asset");
  const expected = [["public/media/cinematic/frozen.bin", digest(bytes)]];
  const source = [{ relativePath: expected[0][0], bytes }];
  const dist = [{ relativePath: "media/cinematic/frozen.bin", bytes: Buffer.from(bytes) }];
  assert.equal(validatePhase4HashAuthority(source, dist, expected).status, "PASS");
  assert.throws(() => validatePhase4HashAuthority(source, [{ ...dist[0], bytes: Buffer.from("counterfeit") }], expected), /hash or source\/dist byte parity differs/);
  assert.throws(() => validatePhase4HashAuthority(source, dist, [[expected[0][0], "0".repeat(64)]]), /hash or source\/dist byte parity differs/);
});

test("security response contract fails closed on unsafe response headers", () => {
  const context = { origin: IMMUTABLE_URL, relativePath: "index.html" };
  const safe = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" };
  assert.equal(validateSecurityHeaders(safe, context).status, "PASS");
  assert.throws(() => validateSecurityHeaders({ ...safe, "set-cookie": "session=secret" }, context), /Set-Cookie/);
  assert.throws(() => validateSecurityHeaders({ ...safe, "x-powered-by": "framework" }, context), /X-Powered-By/);
  assert.throws(() => validateSecurityHeaders({ ...safe, "access-control-allow-origin": "*", "access-control-allow-credentials": "true" }, context), /wildcard credentialed CORS/);
  assert.throws(() => validateSecurityHeaders({ ...safe, "x-content-type-options": "off" }, context), /X-Content-Type-Options/);
  assert.throws(() => validateSecurityHeaders({ ...safe, "referrer-policy": "unsafe-url" }, context), /Referrer-Policy/);
});

test("origin verifier proves all dist bytes, exact routes, canonical content, headers, and real 404", async () => {
  const authority = syntheticDistAuthority();
  const parsed = options([], { resolved: true });
  const report = await verifyOrigin(IMMUTABLE_URL, authority, parsed, mockOriginFetch(authority));
  assert.equal(report.status, "PASS");
  assert.equal(report.fileCount, 14);
  assert.equal(report.exactPublicRoutes.length, 10);
  assert.equal(report.exactPublicRoutes.at(-1).httpStatus, 404);
  assert.match(report.real404.publicPath, /^\/__phase7b-real-404-b{12}-12345678\/$/);
  assert.equal(report.responses.every((record) => record.status === "PASS" && record.security.status === "PASS"), true);
  await assert.rejects(verifyOrigin(IMMUTABLE_URL, authority, parsed, mockOriginFetch(authority, {
    mutate: (record) => record.relativePath === "index.html" ? Buffer.from("changed") : record.bytes,
  })), /byte parity differs/);
  await assert.rejects(verifyOrigin(IMMUTABLE_URL, authority, parsed, mockOriginFetch(authority, { headers: { "set-cookie": "secret=value" } })), /Set-Cookie/);
});

test("both preview origins are verified serially", async () => {
  const parsed = options([], { resolved: true });
  const calls = [];
  let active = 0;
  let maximum = 0;
  const verify = async (origin) => {
    calls.push(origin);
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return { status: "PASS", origin };
  };
  const failures = [];
  const result = await verifyOriginsSerially(parsed, syntheticDistAuthority(), failures, verify);
  assert.deepEqual(calls, [IMMUTABLE_URL, REQUIRED_BRANCH_URL]);
  assert.equal(maximum, 1);
  assert.deepEqual(failures, []);
  assert.equal(result.immutable.status, "PASS");
  assert.equal(result.branch.status, "PASS");
});

test("external report policy and self-test remain inert and deterministic", () => {
  assert.throws(() => validateExternalOutput(""), /required/);
  assert.throws(() => validateExternalOutput(path.join(ROOT, "deployment.json")), /outside/);
  assert.throws(() => validateExternalOutput(path.join(os.tmpdir(), "deployment.json")), /outside/);
  assert.throws(() => validateExternalOutput(path.resolve(ROOT, "..", "deployment.txt")), /JSON/);
  assert.match(validatePortableReport({ status: "PASS", relativePath: "dist/index.html" }).toString("utf8"), /dist\/index\.html/);
  assert.throws(() => validatePortableReport({ localPath: "C:\\Users\\someone\\secret.json" }), /private path/);
  assert.throws(() => validatePortableReport({ token: "github_pat_counterfeit01234567890123456789" }), /credential/);
  assert.deepEqual(runSelfTest(), {
    schema: `${SCHEMA}.self-test`,
    status: "PASS",
    branch: REQUIRED_BRANCH,
    requiredParent: REQUIRED_PARENT,
    frozenMain: FROZEN_MAIN_SHA,
    exactPublicRoutes: 10,
    phase4Assets: 9,
    urlDiscovery: "SIGNED_CLOUDFLARE_GITHUB_CHECK",
  });
});
