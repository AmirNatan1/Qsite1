import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ACCEPTED_PARENT_SHA,
  DEFAULT_DIST,
  FROZEN_MAIN_SHA,
  HTML_AUTHORITY_FILES,
  PUBLIC_ROUTE_OUTCOMES,
  REQUIRED_BRANCH,
  REQUIRED_BRANCH_URL,
  REQUIRED_CLOUDFLARE_PROJECT,
  REQUIRED_HEADER_POLICIES,
  ROOT,
  SCHEMA,
  SECURITY_HEADER_CONTRACT,
  parseArguments,
  runSelfTest,
  selectSignedDeploymentCheck,
  validateExternalOutput,
  validateOptions,
  validateSecurityHeaders,
  verifyOrigin,
} from "../scripts/verify-phase7a-deployment.mjs";

const HEAD = "b".repeat(40);
const IMMUTABLE_URL = "https://12345678.qsite1.pages.dev/";
const BRANCH_URL = REQUIRED_BRANCH_URL;
const DEPLOYMENT_ID = "12345678-1234-4234-8234-123456789abc";

function options(extra = []) {
  return validateOptions(parseArguments([
    "--expected-head", HEAD,
    "--immutable-url", IMMUTABLE_URL,
    "--branch-url", BRANCH_URL,
    ...extra,
  ]), { requireOutput: false });
}

function checkRun(overrides = {}) {
  return {
    id: 987654321,
    name: "Cloudflare Pages",
    app: { slug: "cloudflare-workers-and-pages" },
    head_sha: HEAD,
    status: "completed",
    conclusion: "success",
    completed_at: "2026-08-31T12:00:00Z",
    details_url: `https://dash.cloudflare.com/?to=/16bccc18bf7d54fd2538de7c1b5f19ed/pages/view/qsite1/${DEPLOYMENT_ID}`,
    output: {
      title: "Deployed successfully",
      summary: `Deploy successful! ${HEAD.slice(0, 7)} ${IMMUTABLE_URL.slice(0, -1)} ${BRANCH_URL.slice(0, -1)}`,
    },
    ...overrides,
  };
}

function canonicalForRoute(route) {
  if (route.real404) return "<meta name=\"robots\" content=\"noindex, follow\"><h1>Not found</h1>";
  return `<link rel=\"canonical\" href=\"https://qsite1.pages.dev${route.requestPath}\"><h1>${route.id}</h1>`;
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
    { relativePath: "media/cinematic/phase-4r2/media/m.webm", requestPath: "/media/cinematic/phase-4r2/media/m.webm", bytes: Buffer.from("webm"), contentType: "video/webm", cacheControl: REQUIRED_HEADER_POLICIES["/media/cinematic/phase-4r2/media/*"] },
    { relativePath: "media/cinematic/phase-4r2/posters/p.webp", requestPath: "/media/cinematic/phase-4r2/posters/p.webp", bytes: Buffer.from("webp"), contentType: "image/webp", cacheControl: REQUIRED_HEADER_POLICIES["/media/cinematic/phase-4r2/posters/*"] },
  );
  return {
    comparablePaths: records.map((record) => record.relativePath),
    byPath: new Map(records.map((record) => [record.relativePath, record])),
    headerPolicies: Object.entries(REQUIRED_HEADER_POLICIES).map(([pattern, value]) => ({ pattern, headers: { "cache-control": value } })),
    records,
  };
}

function mockOriginFetch(authority, { mutate = null } = {}) {
  return async (url) => {
    const pathname = new URL(url).pathname;
    let record = authority.records.find((candidate) => candidate.requestPath === pathname);
    if (pathname.startsWith("/__phase7a-real-404-")) record = authority.records.find((candidate) => candidate.relativePath === "404.html");
    assert(record, `unexpected mock request ${pathname}`);
    const body = mutate?.(record, pathname) ?? record.bytes;
    return new Response(body, {
      status: record.relativePath === "404.html" ? 404 : 200,
      headers: {
        "content-type": record.contentType,
        "cache-control": record.cacheControl,
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
      },
    });
  };
}

test("Phase 7A deployment constants preserve exact branch, parent, frozen main, and ten-route authority", () => {
  assert.equal(SCHEMA, "quantum-hub.phase-7a.deployment-verification.v1");
  assert.equal(REQUIRED_BRANCH, "redirect/phase-7a-signal-field-threshold");
  assert.equal(ACCEPTED_PARENT_SHA, "371e3e8a21a1d215ecaf2bf14b9f509432b230b0");
  assert.equal(FROZEN_MAIN_SHA, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(REQUIRED_CLOUDFLARE_PROJECT, "qsite1");
  assert.deepEqual(PUBLIC_ROUTE_OUTCOMES.map(({ status }) => status), [200, 200, 200, 200, 200, 200, 200, 200, 200, 404]);
  assert.deepEqual(PUBLIC_ROUTE_OUTCOMES.map(({ relativePath }) => relativePath).sort(), [...HTML_AUTHORITY_FILES].sort());
  assert.equal(Object.keys(SECURITY_HEADER_CONTRACT).length, 8);
});

test("CLI accepts only explicit, distinct Phase 7A HTTPS preview bindings and exact local dist", () => {
  const parsed = options();
  assert.equal(parsed.expectedHead, HEAD);
  assert.equal(parsed.immutableUrl, IMMUTABLE_URL);
  assert.equal(parsed.branchUrl, BRANCH_URL);
  assert.equal(parsed.dist, DEFAULT_DIST);
  assert.throws(() => options(["--immutable-url", "http://12345678.qsite1.pages.dev/"]), /HTTPS/);
  assert.throws(() => options(["--immutable-url", "https://qsite1.pages.dev/"]), /preview origin/);
  assert.throws(() => options(["--immutable-url", "https://nothex12.qsite1.pages.dev/"]), /eight-hex/);
  assert.throws(() => options(["--branch-url", IMMUTABLE_URL]), /distinct/);
  assert.throws(() => options(["--branch-url", "https://some-other-branch.qsite1.pages.dev/"]), /exact Cloudflare Pages alias/);
  assert.throws(() => options(["--dist", path.join(ROOT, "another-dist")]), /exact repository dist/);
  assert.throws(() => options(["--expected-head", ACCEPTED_PARENT_SHA]), /new lowercase/);
});

test("external report policy rejects repository, OS temp, missing, and non-JSON paths", () => {
  assert.throws(() => validateExternalOutput(""), /required/);
  assert.throws(() => validateExternalOutput(path.join(ROOT, "deployment.json")), /outside/);
  assert.throws(() => validateExternalOutput(path.join(os.tmpdir(), "deployment.json")), /outside/);
  assert.throws(() => validateExternalOutput(path.resolve(ROOT, "..", "deployment.txt")), /JSON/);
  assert.equal(validateExternalOutput(path.resolve(ROOT, "..", "phase7a-deployment.json")), path.resolve(ROOT, "..", "phase7a-deployment.json"));
});

test("signed Cloudflare authority binds exact deployed SHA and both supplied previews", () => {
  const parsed = options();
  const selected = selectSignedDeploymentCheck({ total_count: 1, check_runs: [checkRun()] }, parsed);
  assert.equal(selected.status, "PASS");
  assert.equal(selected.deploymentId, DEPLOYMENT_ID);
  assert.equal(selected.deployedSha, HEAD);
  assert.equal(selected.immutableUrl, IMMUTABLE_URL);
  assert.equal(selected.branchUrl, BRANCH_URL);
  assert.throws(() => selectSignedDeploymentCheck({ check_runs: [checkRun({ head_sha: "c".repeat(40) })] }, parsed), /exactly one/);
  assert.throws(() => selectSignedDeploymentCheck({ check_runs: [checkRun({ app: { slug: "untrusted" } })] }, parsed), /exactly one/);
  assert.throws(() => selectSignedDeploymentCheck({ check_runs: [checkRun({ conclusion: "failure" })] }, parsed), /exactly one/);
  assert.throws(() => selectSignedDeploymentCheck({ check_runs: [checkRun(), checkRun({ id: 2 })] }, parsed), /exactly one/);
});

test("security response contract fails closed on cookies, disclosure, unsafe CORS, nosniff, and referrer policy", () => {
  const context = { origin: IMMUTABLE_URL, relativePath: "index.html" };
  const safe = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
  assert.equal(validateSecurityHeaders(safe, context).status, "PASS");
  assert.throws(() => validateSecurityHeaders({ ...safe, "set-cookie": "session=secret" }, context), /Set-Cookie/);
  assert.throws(() => validateSecurityHeaders({ ...safe, "x-powered-by": "framework" }, context), /X-Powered-By/);
  assert.throws(() => validateSecurityHeaders({ ...safe, "access-control-allow-origin": "*", "access-control-allow-credentials": "true" }, context), /wildcard credentialed CORS/);
  assert.throws(() => validateSecurityHeaders({ ...safe, "x-content-type-options": "off" }, context), /X-Content-Type-Options/);
  assert.throws(() => validateSecurityHeaders({ ...safe, "referrer-policy": "unsafe-url" }, context), /Referrer-Policy/);
  assert.throws(() => validateSecurityHeaders(safe, { ...context, origin: "http://preview.invalid/" }), /HTTPS/);
});

test("origin verifier proves exact ten routes, real 404, canonical content, headers, and byte parity", async () => {
  const parsed = options();
  const authority = syntheticDistAuthority();
  const report = await verifyOrigin(IMMUTABLE_URL, authority, parsed, mockOriginFetch(authority));
  assert.equal(report.status, "PASS");
  assert.equal(report.fileCount, 14);
  assert.equal(report.exactPublicRoutes.length, 10);
  assert.equal(report.exactPublicRoutes.at(-1).httpStatus, 404);
  assert.match(report.real404.publicPath, /^\/__phase7a-real-404-b{12}-12345678\/$/);
  assert.equal(report.responses.every((record) => record.status === "PASS" && record.security.status === "PASS"), true);
  await assert.rejects(
    verifyOrigin(IMMUTABLE_URL, authority, parsed, mockOriginFetch(authority, {
      mutate: (record) => record.relativePath === "index.html" ? Buffer.from("changed") : record.bytes,
    })),
    /byte parity differs/,
  );
});

test("self-test is deterministic, inert, and covers route, 404, and security contracts", () => {
  assert.deepEqual(runSelfTest(), {
    schema: `${SCHEMA}.self-test`,
    status: "PASS",
    branch: REQUIRED_BRANCH,
    acceptedParent: ACCEPTED_PARENT_SHA,
    frozenMain: FROZEN_MAIN_SHA,
    exactPublicRoutes: 10,
    real404Outcomes: 1,
    securityChecks: 8,
  });
});
