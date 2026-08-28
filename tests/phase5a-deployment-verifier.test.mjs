import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  ACCEPTED_PHASE4_SHA,
  ACTIVE_MEDIA_MANIFEST_RELATIVE,
  CHECKPOINT_SUBJECTS,
  FONT_AUTHORITY_FILES,
  HTML_AUTHORITY_FILES,
  HUMAN_GATES,
  MAIN_SHA,
  MARADIN_AUTHORITY_FILES,
  REPORT_FILENAME,
  REQUIRED_BRANCH,
  REQUIRED_CLOUDFLARE_PROJECT,
  REQUIRED_HEADER_POLICIES,
  REQUIRED_REMOTE_URL,
  REQUIRED_REPOSITORY,
  SCHEMA,
  assertCheckpointChain,
  assertRequiredHeaderPolicies,
  classifyDistPath,
  parseArguments,
  parseHeadersFile,
  publicPathForDistFile,
  sha256,
  validateDistGraphRecords,
  validateObservedHeaders,
  validateOptions,
  verifyCloudflareGithubCheck,
} from "../scripts/verify-phase5a-deployment.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function dryRunArguments() {
  return [
    "--expected-head", "a".repeat(40),
    "--expected-base", ACCEPTED_PHASE4_SHA,
    "--expected-main", MAIN_SHA,
    "--repository", REQUIRED_REPOSITORY,
    "--branch", REQUIRED_BRANCH,
    "--github-check-run-id", "123456789",
    "--cloudflare-account-id", "b".repeat(32),
    "--cloudflare-project", REQUIRED_CLOUDFLARE_PROJECT,
    "--cloudflare-deployment-id", "11111111-2222-4333-8444-555555555555",
    "--observed-immutable-url", "https://12345678.qsite1.pages.dev/",
    "--observed-branch-url", "https://feature-phase-5a.qsite1.pages.dev/",
    "--output", path.resolve(ROOT, "..", REPORT_FILENAME),
    "--dry-run",
  ];
}

function checkpointChain() {
  return CHECKPOINT_SUBJECTS.map((subject, index) => ({
    sha: index === CHECKPOINT_SUBJECTS.length - 1 ? "a".repeat(40) : String(index + 1).repeat(40),
    parents: [index === 0 ? ACCEPTED_PHASE4_SHA : String(index).repeat(40)],
    subject,
  }));
}

function syntheticDistFixture() {
  const assetSpecs = [
    ["desktop", "video", "media/phase-4r2-desktop-h264-a.mp4", Buffer.from("desktop-video")],
    ["desktop", "poster", "posters/phase-4r2-desktop-poster-a.png", Buffer.from("desktop-poster")],
    ["portrait", "video", "media/phase-4r2-portrait-h264-b.mp4", Buffer.from("portrait-video")],
    ["portrait", "poster", "posters/phase-4r2-portrait-poster-b.png", Buffer.from("portrait-poster")],
    ["landscape", "video", "media/phase-4r2-landscape-h264-c.mp4", Buffer.from("landscape-video")],
    ["landscape", "poster", "posters/phase-4r2-landscape-poster-c.png", Buffer.from("landscape-poster")],
  ];
  const manifest = {
    assets: assetSpecs.map(([family, kind, file, bytes]) => ({ family, kind, codec: kind === "video" ? "h264" : undefined, file, bytes: bytes.length, sha256: sha256(bytes) })),
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const records = [];
  const add = (relativePath, value) => records.push({ relativePath, bytes: Buffer.isBuffer(value) ? value : Buffer.from(value) });
  const sharedHead = '<link rel="stylesheet" href="/_astro/app.hash.css"><script type="module" src="/_astro/app.hash.js"></script>';
  for (const html of HTML_AUTHORITY_FILES) {
    const maradin = html === "pocs/maradin/index.html"
      ? MARADIN_AUTHORITY_FILES.map((file) => `<img src="/${file}">`).join("")
      : "";
    add(html, `<!doctype html>${sharedHead}${maradin}`);
  }
  add("_astro/app.hash.css", FONT_AUTHORITY_FILES.map((file) => `@font-face{src:url(/${file})}`).join(""));
  add("_astro/app.hash.js", 'import(`./chunk.hash.js`);const manifest="/media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json";');
  add("_astro/chunk.hash.js", "export const ready=true;");
  for (const font of FONT_AUTHORITY_FILES) add(font, `font:${font}`);
  for (const file of MARADIN_AUTHORITY_FILES) add(file, `maradin:${file}`);
  add("media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json", manifestBytes);
  for (const [, , file, bytes] of assetSpecs) add(`media/cinematic/phase-4r2/${file}`, bytes);
  add("robots.txt", "User-agent: *\nAllow: /\n");
  add("sitemap.xml", "<?xml version=\"1.0\"?><urlset></urlset>");
  add("_headers", Object.entries(REQUIRED_HEADER_POLICIES).map(([pattern, value]) => `${pattern}\n  Cache-Control: ${value}`).join("\n\n"));
  return { records, manifest, manifestBytes };
}

test("Phase 5A constants freeze base/main/branch/repository/project and six pending gates", () => {
  assert.equal(SCHEMA, "quantum-hub.phase-5a.deployment-verification.v1");
  assert.equal(ACCEPTED_PHASE4_SHA, "47a6f3cc7f464b09c9c143cac273c2a1f5a35bfa");
  assert.equal(MAIN_SHA, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(REQUIRED_BRANCH, "feature/phase-5a-scroll-crt-route-preproduction");
  assert.equal(REQUIRED_REPOSITORY, "AmirNatan1/Qsite1");
  assert.equal(REQUIRED_REMOTE_URL, "https://github.com/AmirNatan1/Qsite1.git");
  assert.equal(REQUIRED_CLOUDFLARE_PROJECT, "qsite1");
  assert.equal(ACTIVE_MEDIA_MANIFEST_RELATIVE.includes("phase-4r2-1-causal-signal-scroll-stability"), true);
  assert.equal(Object.keys(HUMAN_GATES).length, 6);
  assert.equal(new Set(Object.values(HUMAN_GATES)).size, 1);
  assert.equal(Object.values(HUMAN_GATES)[0], "PENDING HUMAN REVIEW");
});

test("CLI requires explicit final HEAD/check/deployment/observed origins and exact authorities", () => {
  const options = validateOptions(parseArguments(dryRunArguments()));
  assert.equal(options.output.endsWith(REPORT_FILENAME), true);
  assert.throws(() => validateOptions({ ...options, expectedBase: "0".repeat(40) }), /expected-base/);
  assert.throws(() => validateOptions({ ...options, expectedMain: "0".repeat(40) }), /expected-main/);
  assert.throws(() => validateOptions({ ...options, repository: "other/repo" }), /repository/);
  assert.throws(() => validateOptions({ ...options, branch: "main" }), /branch/);
  assert.throws(() => validateOptions({ ...options, cloudflareProject: "other" }), /project/);
  assert.throws(() => validateOptions({ ...options, observedImmutableUrl: "http://127.0.0.1:4321/" }), /HTTPS|observed/);
  assert.throws(() => validateOptions({ ...options, output: path.join(ROOT, REPORT_FILENAME) }), /outside/);
});

test("exact five-commit checkpoint chain rejects missing, renamed, merge, and wrong-parent commits", () => {
  const valid = checkpointChain();
  assert.equal(assertCheckpointChain(valid, "a".repeat(40)), true);
  assert.throws(() => assertCheckpointChain(valid.slice(0, 4), "a".repeat(40)), /exactly 5/);
  const renamed = structuredClone(valid); renamed[2].subject = "Almost CP3";
  assert.throws(() => assertCheckpointChain(renamed, "a".repeat(40)), /CP3/);
  const merge = structuredClone(valid); merge[3].parents.push("f".repeat(40));
  assert.throws(() => assertCheckpointChain(merge, "a".repeat(40)), /linear child/);
  const wrongParent = structuredClone(valid); wrongParent[0].parents = [MAIN_SHA];
  assert.throws(() => assertCheckpointChain(wrongParent, "a".repeat(40)), /linear child/);
});

test("signed GitHub-check fallback binds account/project/deployment/final HEAD and both observed URLs", () => {
  const options = validateOptions(parseArguments(dryRunArguments()));
  const github = { checkRun: {
    name: "Cloudflare Pages",
    status: "completed",
    conclusion: "success",
    completedAt: "2026-08-28T00:00:00.000Z",
    detailsUrl: `https://dash.cloudflare.com/?to=/${"b".repeat(32)}/pages/view/qsite1/${options.cloudflareDeploymentId}`,
    outputTitle: "Deployed successfully",
    outputSummary: `<code>aaaaaaa</code> Deploy successful! ${options.observedImmutableUrl.slice(0, -1)} ${options.observedBranchUrl.slice(0, -1)}`,
  } };
  const authority = verifyCloudflareGithubCheck(options, github);
  assert.equal(authority.authoritySource, "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK");
  assert.equal(authority.deploymentId, options.cloudflareDeploymentId);
  const wrong = structuredClone(options); wrong.cloudflareDeploymentId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  assert.throws(() => verifyCloudflareGithubCheck(wrong, github), /identity/);
});

test("complete dist graph requires all HTML/real 404, transitive JS, CSS/fonts, cinematic, Maradin, and controls", () => {
  const fixture = syntheticDistFixture();
  const graph = validateDistGraphRecords(fixture.records, fixture.manifest, fixture.manifestBytes);
  assert.equal(graph.counts.html, 10);
  assert.equal(graph.counts.font, 3);
  assert.equal(graph.counts.maradin, 5);
  assert.equal(graph.counts.javascript, 2);
  assert.equal(publicPathForDistFile("404.html", "/missing-proof/"), "/missing-proof/");
  assert.equal(publicPathForDistFile("pocs/maradin/index.html"), "/pocs/maradin/");
  assert.equal(classifyDistPath("media/cinematic/phase-4r2/media/a.mp4"), "cinematic");

  const orphan = fixture.records.map((record) => ({ ...record, bytes: Buffer.from(record.bytes) }));
  orphan.push({ relativePath: "_astro/orphan.hash.js", bytes: Buffer.from("export{}") });
  assert.throws(() => validateDistGraphRecords(orphan, fixture.manifest, fixture.manifestBytes), /transitively reachable/);
  const no404 = fixture.records.filter((record) => record.relativePath !== "404.html");
  assert.throws(() => validateDistGraphRecords(no404, fixture.manifest, fixture.manifestBytes), /real 404 HTML/);
  const altered = fixture.records.map((record) => ({ ...record, bytes: Buffer.from(record.bytes) }));
  altered.find((record) => record.relativePath.endsWith("desktop-h264-a.mp4")).bytes = Buffer.from("changed");
  assert.throws(() => validateDistGraphRecords(altered, fixture.manifest, fixture.manifestBytes), /cinematic byte\/hash/);
});

test("_headers parser freezes required policies and observed response enforcement", () => {
  const text = Object.entries(REQUIRED_HEADER_POLICIES).map(([pattern, value]) => `${pattern}\n  Cache-Control: ${value}`).join("\n\n");
  const policies = parseHeadersFile(text);
  assert.equal(assertRequiredHeaderPolicies(policies), true);
  const observed = validateObservedHeaders({
    publicPath: "/_astro/app.hash.js",
    contentType: "text/javascript; charset=utf-8",
    cacheControl: "public, max-age=31556952, immutable",
  }, "_astro/app.hash.js", policies);
  assert.deepEqual(observed.matchedPolicies, ["/_astro/*"]);
  assert.throws(() => validateObservedHeaders({
    publicPath: "/_astro/app.hash.js",
    contentType: "text/javascript",
    cacheControl: "public, max-age=0",
  }, "_astro/app.hash.js", policies), /does not enforce/);
});

test("real 404 accepts Cloudflare no-store without weakening successful asset cache safety", () => {
  const policies = [];
  assert.doesNotThrow(() => validateObservedHeaders({
    publicPath: "/__phase5a-real-404-proof/",
    status: 404,
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
  }, "404.html", policies));
  assert.throws(() => validateObservedHeaders({
    publicPath: "/index.html",
    status: 200,
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
  }, "index.html", policies), /Unsafe deployed Cache-Control/);
  assert.throws(() => validateObservedHeaders({
    publicPath: "/404.html",
    status: 200,
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
  }, "404.html", policies), /Unsafe deployed Cache-Control/);
  assert.throws(() => validateObservedHeaders({
    publicPath: "/__phase5a-real-404-proof/",
    status: 404,
    contentType: "text/html; charset=utf-8",
    cacheControl: "private",
  }, "404.html", policies), /Unsafe deployed Cache-Control/);
});

test("self-test/dry-run are executable and verifier import remains inert", async () => {
  const script = path.join(ROOT, "scripts", "verify-phase5a-deployment.mjs");
  const self = await execFileAsync(process.execPath, [script, "--self-test"], { cwd: ROOT, windowsHide: true });
  assert.equal(JSON.parse(self.stdout).status, "PASS");
  const dry = await execFileAsync(process.execPath, [script, ...dryRunArguments()], { cwd: ROOT, windowsHide: true });
  const report = JSON.parse(dry.stdout);
  assert.equal(report.status, "PASS");
  assert.equal(report.networkRequestsPerformed, false);
  assert.equal(report.gitCommandsPerformed, false);
  assert.equal(report.filesystemReadsPerformed, false);
  const source = await readFile(script, "utf8");
  assert.match(source, /invokedDirectly/);
  assert.equal(source.includes("verify-phase4r2-1-deployment.mjs"), false);
  assert.equal(source.includes("https://b513942a.qsite1.pages.dev/"), false);
});
