import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  AUTHORITY_ROOT_RELATIVE,
  BLACK_BOUNDARY_REPORT_SHA256,
  DEPLOYED_ASSET_PREFIX,
  DEPLOYED_MANIFEST_PATH,
  MAIN_SHA,
  MANIFEST_RELATIVE,
  MANIFEST_AUTHORITY_ROOT,
  PUBLIC_ROOT_RELATIVE,
  REQUIRED_BRANCH,
  SCHEMA,
  SOURCE_SHA256,
  assertProductionManifest,
  assertSafeReport,
  deployedAssetPath,
  parseArguments,
  validateOptions,
  verifyCloudflareGithubCheck,
} from "../scripts/verify-phase4r2-1-deployment.mjs";
import { validateDeploymentReport as validatePackageDeploymentReport } from "../scripts/package-phase4r2-1-human-review.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESOLUTIONS = Object.freeze({ desktop: [1920, 1200], portrait: [780, 1688], landscape: [1688, 780] });

function activeManifest() {
  const frameManifests = {};
  const assets = [];
  for (const [index, [family, resolution]] of Object.entries(RESOLUTIONS).entries()) {
    const frameSha = ["1", "2", "3"][index].repeat(64);
    const firstSha = ["4", "5", "6"][index].repeat(64);
    const videoSha = ["a", "b", "c"][index].repeat(64);
    const posterSha = ["d", "e", "f"][index].repeat(64);
    frameManifests[family] = {
      file: `manifests/phase-4r2-${family}-frame-manifest.json`,
      bytes: 1,
      sha256: frameSha,
      sequenceSha256: ["7", "8", "9"][index].repeat(64),
      firstFrameSha256: firstSha,
      frames: 500,
      fps: 30,
      resolution,
    };
    assets.push({
      kind: "video",
      family,
      codec: "h264",
      file: `media/phase-4r2-${family}-h264-${videoSha.slice(0, 12)}.mp4`,
      bytes: 1,
      sha256: videoSha,
      frames: 500,
      fps: 30,
      durationSeconds: 500 / 30,
      masterFrameManifestSha256: frameSha,
      resolution,
    });
    assets.push({
      kind: "poster",
      family,
      file: `posters/phase-4r2-${family}-poster-${posterSha.slice(0, 12)}.png`,
      bytes: 1,
      sha256: posterSha,
      masterF1Sha256: firstSha,
      masterFrameManifestSha256: frameSha,
      resolution,
    });
  }
  const manifest = {
    schema: "quantum-hub.phase-4-r2.production-media-manifest.v1",
    status: "PASS",
    sourceBlendSha256: SOURCE_SHA256,
    blackBoundaryReportSha256: BLACK_BOUNDARY_REPORT_SHA256,
    physicalTimeline: { frames: 500, fps: 30, durationRational: "50/3" },
    frameManifests,
    assets,
    deliveryPolicy: { h264Only: true, activeVideoCount: 3, activePosterCount: 3, inactiveCodecPayloadCount: 0 },
    authorization: { mergeMain: false, phase5: false },
  };
  manifest.runtimeStaging = {
    publicRoot: PUBLIC_ROOT_RELATIVE,
    manifestPath: "manifests/phase-4r2-production-media-manifest.json",
    exactFiles: ["manifests/phase-4r2-production-media-manifest.json", ...assets.map((asset) => asset.file)].sort(),
    replaceAuthorityRootAtomically: true,
    removeUnlistedFiles: true,
  };
  manifest.authorityMaterialization = {
    trackedRoot: MANIFEST_AUTHORITY_ROOT,
    sourceSubdirectory: "delivery",
    exactFiles: [
      "manifests/phase-4r2-production-media-manifest.json",
      ...Object.values(frameManifests).map((record) => record.file),
      ...assets.map((asset) => asset.file),
    ].sort(),
    removeUnlistedFiles: true,
  };
  return manifest;
}

function dryRunArguments() {
  return [
    "--expected-head", "a".repeat(40),
    "--repository", "owner/repository",
    "--branch", REQUIRED_BRANCH,
    "--github-check-run-id", "123456789",
    "--cloudflare-account-id", "b".repeat(32),
    "--cloudflare-project", "qsite1",
    "--cloudflare-deployment-id", "11111111-2222-4333-8444-555555555555",
    "--immutable-url", "https://12345678.qsite1.pages.dev/",
    "--branch-url", "https://repair-phase-4r2-1.qsite1.pages.dev/",
    "--output", path.resolve(ROOT, "..", "phase4r2-1-deployment-dry-run.json"),
    "--dry-run",
  ];
}

test("R2.1 deployment constants bind the repair authority and nested public model", () => {
  assert.equal(SCHEMA, "quantum-hub.phase-4-r2-1.deployment-verification.v1");
  assert.equal(SOURCE_SHA256, "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516");
  assert.equal(MAIN_SHA, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(MANIFEST_RELATIVE, "artifacts/original/phase-4r2-1-causal-signal-scroll-stability/production/manifests/phase-4r2-production-media-manifest.json");
  assert.equal(DEPLOYED_MANIFEST_PATH, "/media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json");
  assert.equal(deployedAssetPath(activeManifest().assets[0]).startsWith(DEPLOYED_ASSET_PREFIX), true);
});

test("active manifest permits exactly three H.264 videos, three posters, and no inactive codec", () => {
  const manifest = activeManifest();
  assert.equal(assertProductionManifest(manifest), true);
  const mutations = [
    (value) => { value.assets[0].codec = "vp9"; value.assets[0].file = "media/desktop.webm"; },
    (value) => { value.assets.push({ ...value.assets[0], file: "media/extra.mp4" }); },
    (value) => { value.assets[0].frames = 540; },
    (value) => { value.deliveryPolicy.inactiveCodecPayloadCount = 1; },
    (value) => { value.blackBoundaryReportSha256 = "0".repeat(64); },
    (value) => { value.authorization.mergeMain = true; },
    (value) => { value.runtimeStaging.removeUnlistedFiles = false; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(manifest);
    mutate(invalid);
    assert.throws(() => assertProductionManifest(invalid));
  }
});

test("CLI validation requires the exact repair branch, manifest, public roots, IDs, and durable output", () => {
  const options = validateOptions(parseArguments(dryRunArguments()));
  assert.equal(options.branch, REQUIRED_BRANCH);
  assert.equal(options.activeFamily, "desktop");
  assert.equal(options.manifest, path.join(ROOT, ...MANIFEST_RELATIVE.split("/")));
  assert.throws(() => validateOptions({ ...options, branch: "main" }), /branch/);
  assert.throws(() => validateOptions({ ...options, expectedHead: MAIN_SHA }), /distinct/);
  assert.throws(() => validateOptions({ ...options, manifest: path.join(ROOT, "wrong.json") }), /exact active/);
  assert.throws(() => validateOptions({ ...options, immutableUrl: "http://127.0.0.1:4321/" }), /HTTPS/);
  assert.throws(() => validateOptions({ ...options, output: path.join(ROOT, "report.json") }), /outside/);
  assert.throws(() => validateOptions({ ...options, cloudflareDeploymentId: options.githubCheckRunId }), /UUID/);
});

test("Cloudflare signed-check fallback binds deployment ID, commit, branch, and both URLs", () => {
  const options = validateOptions(parseArguments(dryRunArguments()));
  const authority = verifyCloudflareGithubCheck(options, { checkRun: {
    name: "Cloudflare Pages",
    status: "completed",
    conclusion: "success",
    completedAt: "2026-08-28T00:00:00.000Z",
    detailsUrl: `https://dash.cloudflare.com/?to=/${"b".repeat(32)}/pages/view/qsite1/11111111-2222-4333-8444-555555555555`,
    outputTitle: "Deployed successfully",
    outputSummary: `<code>aaaaaaa</code> Deploy successful! https://12345678.qsite1.pages.dev https://repair-phase-4r2-1.qsite1.pages.dev`,
  } });
  assert.equal(authority.deploymentId, options.cloudflareDeploymentId);
  assert.equal(authority.commitHash, options.expectedHead);
  assert.equal(authority.branch, REQUIRED_BRANCH);
  const wrong = structuredClone(options);
  wrong.cloudflareDeploymentId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  assert.throws(() => verifyCloudflareGithubCheck(wrong, { checkRun: {
    name: "Cloudflare Pages", status: "completed", conclusion: "success", completedAt: "2026-08-28T00:00:00.000Z",
    detailsUrl: authority.deploymentUrl, outputTitle: "Deployed successfully", outputSummary: "Deploy successful!",
  } }));
});

test("PASS report projection satisfies the R2.1 capture/package deployment contract", () => {
  const expectedHead = "a".repeat(40);
  const expectedManifestSha256 = "c".repeat(64);
  const immutableUrl = "https://12345678.qsite1.pages.dev/";
  const branchUrl = "https://repair-phase-4r2-1.qsite1.pages.dev/";
  const expectedDeploymentId = "11111111-2222-4333-8444-555555555555";
  const report = {
    schema: SCHEMA,
    status: "PASS",
    repository: { head: expectedHead, branch: REQUIRED_BRANCH, main: { headSha: MAIN_SHA } },
    deployment: { expectedHead, immutableUrl, branchUrl, immutable: { manifest: { bytes: 123, sha256: expectedManifestSha256 } } },
    cloudflare: { deploymentId: expectedDeploymentId, deploymentUrl: immutableUrl, branch: REQUIRED_BRANCH, commitHash: expectedHead },
    productionManifest: { bytes: 123, sha256: expectedManifestSha256, sourceBlendSha256: SOURCE_SHA256 },
    authorization: { humanAccepted: false, phase5Authorized: false, mainMerged: false },
  };
  const identity = validatePackageDeploymentReport(report, {
    expectedHead,
    expectedBranch: REQUIRED_BRANCH,
    immutableUrl,
    branchUrl,
    expectedDeploymentId,
    expectedSourceSha256: SOURCE_SHA256,
    expectedManifestSha256,
  });
  assert.equal(identity.deploymentId, expectedDeploymentId);
  assert.equal(identity.sourceSha256, SOURCE_SHA256);
  assert.equal(identity.manifestSha256, expectedManifestSha256);
});

test("report privacy guard rejects private paths and loopback authorities", () => {
  assert.doesNotThrow(() => assertSafeReport({ schema: SCHEMA, status: "PASS", repository: { branch: REQUIRED_BRANCH } }));
  assert.throws(() => assertSafeReport({ leaked: "C:/Users/person/AppData/Local/report.json" }), /private/);
  assert.throws(() => assertSafeReport({ leaked: "http://127.0.0.1:4321/" }), /private/);
});

test("self-test and dry-run are strict, read-only, and independently executable", async () => {
  const script = path.join(ROOT, "scripts", "verify-phase4r2-1-deployment.mjs");
  const self = await execFileAsync(process.execPath, [script, "--self-test"], { cwd: ROOT, windowsHide: true });
  const selfReport = JSON.parse(self.stdout);
  assert.equal(selfReport.status, "PASS");
  assert.equal(selfReport.activeAssets, 6);
  const dry = await execFileAsync(process.execPath, [script, ...dryRunArguments()], { cwd: ROOT, windowsHide: true });
  const dryReport = JSON.parse(dry.stdout);
  assert.equal(dryReport.status, "PASS");
  assert.equal(dryReport.writesPerformed, false);
  assert.equal(dryReport.gitCommandsPerformed, false);
  assert.equal(dryReport.networkRequestsPerformed, false);
  assert.equal(dryReport.counts.inactiveVp9Webm, 0);
});

test("verifier import is inert and contains no stale R2 source or deployment authority", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "verify-phase4r2-1-deployment.mjs"), "utf8");
  assert.match(source, /invokedDirectly/);
  assert.equal(source.includes("b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0"), false);
  assert.equal(source.includes("phase-4r2-final-cinematic-production/manifests"), false);
  assert.equal(source.includes("https://b513942a.qsite1.pages.dev/"), false);
});
