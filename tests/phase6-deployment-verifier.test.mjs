import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ACCEPTED_PHASE5B_SHA,
  DEFAULT_DIST,
  FROZEN_MAIN_SHA,
  HTML_AUTHORITY_FILES,
  PRODUCTION_ORIGIN,
  PUBLIC_ROUTE_OUTCOMES,
  REQUIRED_BRANCH,
  REQUIRED_CLOUDFLARE_ACCOUNT_ID,
  REQUIRED_CLOUDFLARE_PROJECT,
  REQUIRED_HEADER_POLICIES,
  REQUIRED_REPOSITORY,
  ROOT,
  SCHEMA,
  assertRequiredHeaderPolicies,
  assertSafeReport,
  canonicalForDistFile,
  parseArguments,
  parseHeadersFile,
  parseLinearHistory,
  publicPathForDistFile,
  selectDeploymentCheck,
  validateCanonicalHtml,
  validateDeployedRecord,
  validateDistRecords,
  validateExternalOutput,
  validateOptions,
} from "../scripts/verify-phase6-deployment.mjs";

const SCRIPT = path.join(ROOT, "scripts", "verify-phase6-deployment.mjs");
const DEPLOYMENT_ID = ["12345678", "1234", "4234", "8234", "123456789abc"].join("-");
const EXPECTED_HEAD = "a".repeat(40);

function argv(extra = []) {
  return [
    "--expected-head", EXPECTED_HEAD,
    "--immutable-url", `https://${DEPLOYMENT_ID.slice(0, 8)}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`,
    "--branch-url", `https://phase-six-test.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`,
    "--deployment-id", DEPLOYMENT_ID,
    ...extra,
  ];
}

function options(extra = []) {
  return validateOptions(parseArguments(argv(extra)), { requireOutput: false });
}

function headersText() {
  return Object.entries(REQUIRED_HEADER_POLICIES)
    .map(([pattern, value]) => `${pattern}\n  Cache-Control: ${value}`)
    .join("\n\n");
}

function htmlFor(relativePath) {
  if (relativePath === "404.html") return '<!doctype html><meta name="robots" content="noindex, follow"><h1>Not found</h1>';
  return `<!doctype html><link href="${canonicalForDistFile(relativePath)}" rel="canonical"><h1>Route</h1>`;
}

function syntheticDistRecords() {
  return [
    ...HTML_AUTHORITY_FILES.map((relativePath) => ({ relativePath, bytes: Buffer.from(htmlFor(relativePath)) })),
    { relativePath: "_headers", bytes: Buffer.from(headersText()) },
    { relativePath: "robots.txt", bytes: Buffer.from("User-agent: *\nAllow: /") },
    { relativePath: "sitemap.xml", bytes: Buffer.from("<?xml version=\"1.0\"?><urlset/>") },
    { relativePath: "_astro/app.js", bytes: Buffer.from("export{}") },
    { relativePath: "media/cinematic/phase-4r2/manifests/production.json", bytes: Buffer.from("{}") },
    { relativePath: "media/cinematic/phase-4r2/media/desktop.mp4", bytes: Buffer.from("mp4") },
    { relativePath: "media/cinematic/phase-4r2/posters/desktop.png", bytes: Buffer.from("png") },
  ];
}

test("contract fixes the exact Phase 6 branch, ancestry, main, and ten route outcomes", () => {
  assert.equal(SCHEMA, "quantum-hub.phase-6.deployment-verification.v1");
  assert.equal(REQUIRED_REPOSITORY, "AmirNatan1/Qsite1");
  assert.equal(REQUIRED_BRANCH, "feature/phase-6-global-hardening");
  assert.equal(ACCEPTED_PHASE5B_SHA, "005a36860ecbfd6fedb3d3f2223f168c1edfbb05");
  assert.equal(FROZEN_MAIN_SHA, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(PUBLIC_ROUTE_OUTCOMES.length, 10);
  assert.equal(PUBLIC_ROUTE_OUTCOMES.filter((route) => route.real404 && route.status === 404).length, 1);
  assert.deepEqual(new Set(PUBLIC_ROUTE_OUTCOMES.map((route) => route.relativePath)), new Set(HTML_AUTHORITY_FILES));
});

test("CLI binds a supplied deployment UUID to its immutable origin without baking a future identity", () => {
  const parsed = options();
  assert.equal(parsed.expectedHead, EXPECTED_HEAD);
  assert.equal(parsed.deploymentId, DEPLOYMENT_ID);
  assert.equal(parsed.dist, DEFAULT_DIST);
  assert.throws(() => options(["--branch", "main"]), /exactly feature\/phase-6/);
  assert.throws(() => options(["--immutable-url", "https://deadbeef.qsite1.pages.dev/"]), /must be exactly/);
  assert.throws(() => options(["--branch-url", parsed.immutableUrl]), /distinct/);
  assert.throws(() => options(["--expected-head", ACCEPTED_PHASE5B_SHA]), /new Phase 6/);
});

test("fresh report boundary is external JSON and the serialized payload is privacy-safe", () => {
  assert.throws(() => validateExternalOutput(path.join(ROOT, "report.json")), /outside/);
  assert.throws(() => validateExternalOutput(path.join(os.tmpdir(), "report.json")), /outside/);
  assert.throws(() => validateExternalOutput(path.resolve(ROOT, "..", "report.txt")), /JSON/);
  assert.equal(validateExternalOutput(path.resolve(ROOT, "..", "phase6-report.json")), path.resolve(ROOT, "..", "phase6-report.json"));
  assert.throws(() => assertSafeReport({ path: "file:///private" }), /private path/);
  assert.doesNotThrow(() => assertSafeReport({ path: "dist", deploymentId: DEPLOYMENT_ID }));
});

test("_headers authority requires all four exact cache policies", () => {
  const policies = parseHeadersFile(headersText());
  assert.equal(policies.length, 4);
  assert.equal(assertRequiredHeaderPolicies(policies), true);
  const incomplete = parseHeadersFile("/_astro/*\n  Cache-Control: public, max-age=31556952, immutable");
  assert.throws(() => assertRequiredHeaderPolicies(incomplete), /exact Phase 6 cache policy/);
});

test("canonical behavior is production-stable and the real 404 is deliberately non-canonical", () => {
  assert.equal(canonicalForDistFile("index.html"), `${PRODUCTION_ORIGIN}/`);
  assert.equal(canonicalForDistFile("pocs/maradin/index.html"), `${PRODUCTION_ORIGIN}/pocs/maradin/`);
  assert.equal(canonicalForDistFile("404.html"), null);
  assert.deepEqual(validateCanonicalHtml(`<link rel="canonical" href="${PRODUCTION_ORIGIN}/about/">`, "about/index.html"), {
    canonical: `${PRODUCTION_ORIGIN}/about/`, robotsNoindex: false, status: "PASS",
  });
  assert.equal(validateCanonicalHtml('<meta content="noindex, follow" name="robots">', "404.html").robotsNoindex, true);
  assert.throws(() => validateCanonicalHtml(`<link rel="canonical" href="${PRODUCTION_ORIGIN}/404/"><meta name="robots" content="noindex">`, "404.html"), /omit canonical/);
});

test("dist topology compares every deployable file and excludes only Cloudflare-consumed _headers", () => {
  const authority = validateDistRecords(syntheticDistRecords());
  assert.equal(authority.htmlPaths.length, 10);
  assert.equal(authority.comparablePaths.length, authority.paths.length - 1);
  assert.equal(authority.fileLedger.find((record) => record.relativePath === "_headers").deploymentComparison, "EXCLUDED_CLOUDFLARE_CONFIGURATION");
  assert.equal(publicPathForDistFile("index.html"), "/");
  assert.equal(publicPathForDistFile("about/index.html"), "/about/");
  assert.equal(publicPathForDistFile("404.html", "/missing-proof/"), "/missing-proof/");
  assert.throws(() => validateDistRecords([...syntheticDistRecords(), { relativePath: "_redirects", bytes: Buffer.from("/* /index.html 200") }]), /SPA redirects/);
});

test("HTTP, byte, MIME, cache-policy, and real-404 checks fail closed", () => {
  const policies = parseHeadersFile(headersText());
  const asset = { relativePath: "_astro/app.js", bytes: Buffer.from("export{}") };
  const response = {
    publicPath: "/_astro/app.js",
    status: 200,
    bytes: Buffer.from("export{}"),
    contentType: "text/javascript; charset=utf-8",
    cacheControl: "public, max-age=31556952, immutable",
  };
  assert.equal(validateDeployedRecord(response, asset, policies).status, "PASS");
  assert.throws(() => validateDeployedRecord({ ...response, bytes: Buffer.from("changed") }, asset, policies), /byte parity/);
  assert.throws(() => validateDeployedRecord({ ...response, status: 302 }, asset, policies), /HTTP status/);
  assert.throws(() => validateDeployedRecord({ ...response, cacheControl: "public, max-age=0" }, asset, policies), /does not enforce/);
  const notFound = { relativePath: "404.html", bytes: Buffer.from('<meta name="robots" content="noindex">') };
  assert.equal(validateDeployedRecord({
    publicPath: "/missing/", status: 404, bytes: notFound.bytes,
    contentType: "text/html", cacheControl: "no-store",
  }, notFound, policies).actualHttpStatus, 404);
});

test("linear history starts at accepted Phase 5B and terminates at the supplied HEAD", () => {
  const first = "b".repeat(40);
  const history = `${first}\t${ACCEPTED_PHASE5B_SHA}\tCP0 baseline\n${EXPECTED_HEAD}\t${first}\tCP1 hardening`;
  assert.equal(parseLinearHistory(history, EXPECTED_HEAD).length, 2);
  assert.throws(() => parseLinearHistory(`${EXPECTED_HEAD}\t${FROZEN_MAIN_SHA}\twrong base`, EXPECTED_HEAD), /linear child/);
  assert.throws(() => parseLinearHistory(`${first}\t${ACCEPTED_PHASE5B_SHA}\tfirst`, EXPECTED_HEAD), /terminate/);
});

test("signed GitHub check uniquely binds successful Cloudflare deployment, HEAD, and both previews", () => {
  const parsed = options();
  const details = `https://dash.cloudflare.com/${REQUIRED_CLOUDFLARE_ACCOUNT_ID}/pages/view/${REQUIRED_CLOUDFLARE_PROJECT}/${DEPLOYMENT_ID}`;
  const run = {
    id: 42,
    name: "Cloudflare Pages",
    app: { slug: "cloudflare-pages" },
    head_sha: EXPECTED_HEAD,
    status: "completed",
    conclusion: "success",
    completed_at: "2026-08-30T12:00:00Z",
    details_url: details,
    output: {
      title: "Deployed successfully",
      summary: `Deploy successful! <code>${EXPECTED_HEAD.slice(0, 7)}</code> ${parsed.immutableUrl.slice(0, -1)} ${parsed.branchUrl.slice(0, -1)}`,
    },
  };
  const authority = selectDeploymentCheck({ total_count: 1, check_runs: [run] }, parsed);
  assert.equal(authority.commitHash, EXPECTED_HEAD);
  assert.equal(authority.deploymentId, DEPLOYMENT_ID);
  assert.equal(authority.environment, "preview");
  assert.throws(() => selectDeploymentCheck({ check_runs: [{ ...run, conclusion: "failure" }] }, parsed), /exactly one/);
  assert.throws(() => selectDeploymentCheck({ check_runs: [run, structuredClone(run)] }, parsed), /exactly one/);
});

test("module import, self-test, and dry-run are executable and perform no verifier I/O", async () => {
  const importResult = spawnSync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); process.stdout.write("IMPORTED")`], {
    cwd: ROOT, encoding: "utf8", windowsHide: true,
  });
  assert.equal(importResult.status, 0, importResult.stderr);
  assert.equal(importResult.stdout, "IMPORTED");

  const self = spawnSync(process.execPath, [SCRIPT, "--self-test"], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(self.status, 0, self.stderr);
  const selfPayload = JSON.parse(self.stdout);
  assert.equal(selfPayload.status, "PASS");
  assert.equal(selfPayload.writesPerformed, false);

  const dry = spawnSync(process.execPath, [SCRIPT, ...argv(), "--dry-run"], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(dry.status, 0, dry.stderr);
  const dryPayload = JSON.parse(dry.stdout);
  assert.equal(dryPayload.status, "PASS");
  assert.equal(dryPayload.filesystemReadsPerformed, false);
  assert.equal(dryPayload.gitCommandsPerformed, false);
  assert.equal(dryPayload.networkRequestsPerformed, false);
  assert.equal(dryPayload.writesPerformed, false);
});

test("source contains no baked future deployment UUID or immutable preview", async () => {
  const source = await readFile(fileURLToPath(new URL("../scripts/verify-phase6-deployment.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.doesNotMatch(source, /https:\/\/[0-9a-f]{8}\.qsite1\.pages\.dev\//i);
  assert.match(source, /--deployment-id/);
  assert.match(source, /--immutable-url/);
  assert.match(source, /--branch-url/);
});
