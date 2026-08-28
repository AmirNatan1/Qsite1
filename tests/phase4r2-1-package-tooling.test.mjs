import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_MEDIA_SCHEMA,
  ARCHIVE_FILENAME,
  AUDIT_FILENAME,
  AUTHORITY_REPORT_SCHEMAS,
  AUTHORIZATION,
  DETACHED_MANIFEST_FILENAME,
  EVIDENCE_REPORT_SCHEMAS,
  EXPECTED_COUNTS,
  PACKAGE_SCHEMA,
  RESULT_FILENAME,
  SOURCE_SHA256,
  assertAllowedEntry,
  assertDurableReviewLocation,
  assertExternalPath,
  assertNoPrivateText,
  assertVideoProbeContract,
  createStoredZipBuffer,
  parseArguments,
  parseStoredZip,
  safeRelativePath,
  semanticCounts,
  validateActiveMediaManifest,
  validateDeploymentReport,
  validateEvidenceManifestStructure,
  validateOptionShape,
  validatePackageManifest,
} from "../scripts/package-phase4r2-1-human-review.mjs";
import {
  HUMAN_GATES,
  MAIN_SHA,
  RECORDINGS,
  REQUIRED_BRANCH,
  SCHEMA as EVIDENCE_SCHEMA,
  SHEETS,
  VIEWPOINTS,
  stableJson,
} from "../scripts/phase4r2-1-evidence-contract.mjs";
import {
  FAMILIES,
  activeFrameManifestRelativePath,
  activePosterRelativePath,
  activeVideoRelativePath,
  buildActiveProductionManifest,
} from "../scripts/phase4r2-1-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEAD = "a".repeat(40);
const PARENT = "b".repeat(40);
const MANIFEST_SHA = "c".repeat(64);
const DEPLOYMENT_ID = "deployment-123456";
const IMMUTABLE_URL = "https://01234567.qsite1.pages.dev/";
const BRANCH_URL = "https://repair-phase-4r2-1.qsite1.pages.dev/";
const bindings = Object.freeze({
  expectedHead: HEAD,
  expectedParent: PARENT,
  expectedBranch: REQUIRED_BRANCH,
  expectedSourceSha256: SOURCE_SHA256,
  expectedManifestSha256: MANIFEST_SHA,
  expectedDeploymentId: DEPLOYMENT_ID,
  immutableUrl: IMMUTABLE_URL,
  branchUrl: BRANCH_URL,
});

function lexical(left, right) { return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")); }

function activeManifest() {
  const frameManifests = Object.fromEntries(Object.entries(FAMILIES).map(([family, value], index) => [family, {
    file: activeFrameManifestRelativePath(family),
    bytes: 50_000 + index,
    sha256: String(index + 1).repeat(64),
    sequenceSha256: String(index + 4).repeat(64),
    firstFrameSha256: String(index + 7).repeat(64),
    frames: 500,
    fps: 30,
    resolution: [value.width, value.height],
  }]));
  const assets = Object.entries(FAMILIES).flatMap(([family, value], index) => {
    const resolution = [value.width, value.height];
    const videoSha = String.fromCharCode(97 + index).repeat(64);
    const posterSha = String.fromCharCode(100 + index).repeat(64);
    return [{
    kind: "video",
    family,
    codec: "h264",
    file: activeVideoRelativePath(family, videoSha),
    bytes: 1000 + index,
    sha256: videoSha,
    frames: 500,
    fps: 30,
    durationSeconds: 500 / 30,
    masterFrameManifestSha256: frameManifests[family].sha256,
    resolution,
  }, {
    kind: "poster",
    family,
    file: activePosterRelativePath(family, posterSha),
    bytes: 2000 + index,
    sha256: posterSha,
    masterF1Sha256: frameManifests[family].firstFrameSha256,
    masterFrameManifestSha256: frameManifests[family].sha256,
    resolution,
  }];
  });
  const manifest = buildActiveProductionManifest({ frameManifests, toolchain: {}, assets });
  assert.equal(manifest.schema, ACTIVE_MEDIA_SCHEMA);
  return manifest;
}

function evidenceManifest() {
  const recordings = RECORDINGS.map((item, index) => ({
    ...item,
    relativePath: `recordings/${item.id}.mp4`,
    bytes: 10_000 + index,
    sha256: String((index % 9) + 1).repeat(64),
    expectedFrameCount: 60 + index,
    media: { frameCount: 60 + index },
    fullDecodePass: true,
    status: "PASS",
  }));
  const sheets = SHEETS.map((item, index) => ({
    ...item,
    relativePath: `sheets/${item.id}.png`,
    bytes: 20_000 + index,
    sha256: String(((index + 3) % 9) + 1).repeat(64),
    width: 1600,
    height: 1200,
  }));
  const reports = Object.keys(EVIDENCE_REPORT_SCHEMAS)
    .filter((relativePath) => !relativePath.endsWith("browser-evidence-manifest.json"))
    .map((relativePath, index) => ({ relativePath, bytes: 30_000 + index, sha256: String(((index + 6) % 9) + 1).repeat(64), kind: "report" }));
  return {
    schema: EVIDENCE_SCHEMA,
    status: "PASS",
    target: { head: HEAD, branch: REQUIRED_BRANCH, url: IMMUTABLE_URL, branchUrl: BRANCH_URL },
    repository: { head: HEAD, branch: REQUIRED_BRANCH, main: { head: MAIN_SHA } },
    deployment: { deploymentId: DEPLOYMENT_ID, immutableUrl: IMMUTABLE_URL, branchUrl: BRANCH_URL },
    activeMedia: { sourceBlendSha256: SOURCE_SHA256, manifest: { sha256: MANIFEST_SHA } },
    artifacts: [
      ...recordings.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256, kind: "recording" })),
      ...sheets.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256, kind: "sheet" })),
      ...reports,
    ],
    recordings,
    sheets,
    summary: { recordings: 17, sheets: 17, reports: 10 },
    humanReviewGates: HUMAN_GATES,
    authorization: AUTHORIZATION,
  };
}

function packageFiles() {
  const records = [
    ...RECORDINGS.map(({ id, viewpoint }) => {
      const view = VIEWPOINTS.find((item) => item.id === viewpoint);
      return { relativePath: `recordings/${id}.mp4`, kind: "recording", purpose: id, viewport: { id: view.id, width: view.width, height: view.height }, frameRange: null, engine: "test H.264", expectedFrameCount: 30, media: {}, byteSize: 10, sha256: "1".repeat(64), finalBlenderSourceHash: SOURCE_SHA256 };
    }),
    ...SHEETS.map(({ id }) => ({ relativePath: `sheets/${id}.png`, kind: "sheet", purpose: id, viewport: "multiple", frameRange: null, engine: "test PNG", width: 10, height: 10, byteSize: 10, sha256: "2".repeat(64), finalBlenderSourceHash: SOURCE_SHA256 })),
    ...Object.entries(EVIDENCE_REPORT_SCHEMAS).map(([relativePath, schema]) => ({ relativePath, kind: "report", reportClass: "evidence", purpose: relativePath, viewport: null, frameRange: null, engine: "test evidence", schema, status: "PASS", byteSize: 10, sha256: "3".repeat(64), finalBlenderSourceHash: SOURCE_SHA256 })),
    ...Object.entries(AUTHORITY_REPORT_SCHEMAS).map(([relativePath, schema]) => ({ relativePath, kind: "report", reportClass: "authority", purpose: relativePath, viewport: null, frameRange: null, engine: "test authority", schema, status: "PASS", byteSize: 10, sha256: "4".repeat(64), finalBlenderSourceHash: SOURCE_SHA256 })),
  ];
  return records.sort((left, right) => lexical(left.relativePath, right.relativePath));
}

test("R2.1 package contract has exact durable basename and 17/17/10/6 inventory", () => {
  assert.equal(ARCHIVE_FILENAME, "phase-4r2-1-causal-signal-scroll-stability-human-review.zip");
  assert.equal(DETACHED_MANIFEST_FILENAME, "phase-4r2-1-causal-signal-scroll-stability-human-review-manifest.json");
  assert.equal(AUDIT_FILENAME, "phase-4r2-1-causal-signal-scroll-stability-human-review-audit.json");
  assert.equal(RESULT_FILENAME, "phase-4r2-1-causal-signal-scroll-stability-human-review-result.json");
  assert.deepEqual(semanticCounts(packageFiles()), EXPECTED_COUNTS);
  assert.equal(Object.keys(EVIDENCE_REPORT_SCHEMAS).length, 10);
  assert.equal(Object.keys(AUTHORITY_REPORT_SCHEMAS).length, 6);
});

test("exact evidence manifest binds all A-L recordings, all sheets, final deployment, media, source, and pending gates", () => {
  const writtenAndParsed = JSON.parse(stableJson(evidenceManifest()));
  assert.deepEqual(validateEvidenceManifestStructure(writtenAndParsed, bindings), {
    head: HEAD,
    branch: REQUIRED_BRANCH,
    immutableUrl: IMMUTABLE_URL,
    branchUrl: BRANCH_URL,
    sourceSha256: SOURCE_SHA256,
    manifestSha256: MANIFEST_SHA,
    deploymentId: DEPLOYMENT_ID,
    main: MAIN_SHA,
  });
  for (const mutate of [
    (value) => { value.artifacts.pop(); },
    (value) => { value.recordings[0].expectedFrameCount += 1; },
    (value) => { value.target.head = "d".repeat(40); },
    (value) => { value.humanReviewGates["MEDIA + PERFORMANCE SAFETY"] = "ACCEPT"; },
    (value) => { value.authorization.phase5Authorized = true; },
  ]) {
    const invalid = structuredClone(evidenceManifest());
    mutate(invalid);
    assert.throws(() => validateEvidenceManifestStructure(invalid, bindings));
  }
});

test("active production authority is exactly three H.264 videos, three posters, and zero VP9", () => {
  assert.equal(validateActiveMediaManifest(activeManifest()), true);
  for (const mutate of [
    (value) => { value.assets[0].codec = "vp9"; },
    (value) => { value.assets[0].file = "media/candidate.webm"; },
    (value) => { value.assets[0].frames = 499; },
    (value) => { value.assets.push(structuredClone(value.assets[0])); },
    (value) => { value.deliveryPolicy.inactiveCodecPayloadCount = 1; },
    (value) => { value.authorization.phase5 = true; },
  ]) {
    const invalid = structuredClone(activeManifest());
    mutate(invalid);
    assert.throws(() => validateActiveMediaManifest(invalid));
  }
});

test("deployment report must independently agree with exact final identity", () => {
  const report = {
    schema: "quantum-hub.phase-4-r2-1.git-deployment-provenance-evidence.v1",
    status: "PASS",
    repository: { head: HEAD, branch: REQUIRED_BRANCH, main: { head: MAIN_SHA } },
    deployment: { expectedHead: HEAD, immutableUrl: IMMUTABLE_URL, branchUrl: BRANCH_URL },
    cloudflare: { commitHash: HEAD, branch: REQUIRED_BRANCH, deploymentId: DEPLOYMENT_ID, deploymentUrl: IMMUTABLE_URL },
    productionManifest: { sourceBlendSha256: SOURCE_SHA256, sha256: MANIFEST_SHA },
    authorization: { phase5Authorized: false, mainMerged: false },
  };
  assert.equal(validateDeploymentReport(report, bindings).deploymentId, DEPLOYMENT_ID);
  const capturedProjection = {
    schema: "quantum-hub.phase-4-r2-1.git-deployment-provenance-evidence.v1",
    status: "PASS",
    repository: { head: HEAD, branch: REQUIRED_BRANCH, main: { head: MAIN_SHA } },
    deployment: { exactHead: HEAD, immutableUrl: IMMUTABLE_URL, branchUrl: BRANCH_URL, deploymentId: DEPLOYMENT_ID },
    activeProductionManifest: { sourceBlendSha256: SOURCE_SHA256, sha256: MANIFEST_SHA },
    authorization: { humanAccepted: false, phase5Authorized: false, mainMerged: false },
  };
  assert.equal(validateDeploymentReport(capturedProjection, bindings).deploymentId, DEPLOYMENT_ID);
  for (const mutate of [
    (value) => { value.cloudflare.commitHash = "f".repeat(40); },
    (value) => { value.deployment.branchUrl = "https://wrong.example/"; },
    (value) => { value.productionManifest.sha256 = "f".repeat(64); },
    (value) => { value.authorization.phase5Authorized = true; },
  ]) {
    const invalid = structuredClone(report);
    mutate(invalid);
    assert.throws(() => validateDeploymentReport(invalid, bindings));
  }
});

test("package manifest is exhaustive and binds every payload to final Blender authority", () => {
  const files = packageFiles();
  const manifest = {
    schema: PACKAGE_SCHEMA,
    status: "PASS",
    generatedAt: "1980-01-01T00:00:00.000Z",
    source: { head: HEAD, parent: PARENT, branch: REQUIRED_BRANCH, mainHead: MAIN_SHA, blenderSourceSha256: SOURCE_SHA256, mediaManifestSha256: MANIFEST_SHA },
    deployment: { deploymentId: DEPLOYMENT_ID, immutableUrl: IMMUTABLE_URL, branchUrl: BRANCH_URL },
    payloadBytes: files.reduce((sum, item) => sum + item.byteSize, 0),
    unmanifestedArchiveEntries: ["README.md", "MANIFEST.json"],
    files,
    humanReviewGates: HUMAN_GATES,
    authorization: AUTHORIZATION,
  };
  assert.equal(validatePackageManifest(manifest, bindings), true);
  const invalid = structuredClone(manifest);
  invalid.files[0].finalBlenderSourceHash = "0".repeat(64);
  assert.throws(() => validatePackageManifest(invalid, bindings), /Blender|ledger/i);
});

test("ZIP parser proves deterministic lexical paths, CRC, and local/central parity", () => {
  const entries = [{ path: "reports/b.json", data: Buffer.from("bravo\n") }, { path: "reports/a.json", data: Buffer.from("alpha\n") }];
  const archive = createStoredZipBuffer(entries);
  assert.deepEqual(parseStoredZip(archive).map((item) => item.path), ["reports/a.json", "reports/b.json"]);
  assert.deepEqual(archive, createStoredZipBuffer([...entries].reverse()));
  const corrupt = Buffer.from(archive);
  const nameLength = corrupt.readUInt16LE(26);
  corrupt[30 + nameLength] ^= 0xff;
  assert.throws(() => parseStoredZip(corrupt), /CRC|mismatch/);
  assert.throws(() => parseStoredZip(createStoredZipBuffer(entries, { preserveInputOrder: true })), /lexical/);
});

test("paths, secrets, raw masters, rejected media, Blender, VP9, and caches fail closed", () => {
  for (const value of ["../x", "/x", "a\\b", "a//b", "a/../b"]) assert.throws(() => safeRelativePath(value));
  for (const value of ["raw/F046.png", "masters/desktop/F046.png", "frames/F046.png", "rejected/test.mp4", "authority/source.blend", "recordings/test.webm", "cache/data.json", ".env"]) assert.throws(() => assertAllowedEntry(value));
  assert.doesNotThrow(() => assertAllowedEntry("recordings/A-first-input-response.mp4"));
  assert.doesNotThrow(() => assertNoPrivateText(Buffer.from('{"authorization":{"phase5Authorized":false}}'), "reports/safe.json"));
  assert.doesNotThrow(() => assertNoPrivateText(Buffer.from(JSON.stringify({ diagram: "\\--retreat---/\n" })), "reports/diagram.json"), "JSON escaping must not turn a single diagram stroke into a false UNC path");
  for (const value of ["C:\\Users\\person\\private", "source=OneDrive/private", "token=sk-example_secret_abcdefghijklmnopqrstuvwxyz"]) assert.throws(() => assertNoPrivateText(Buffer.from(value), "reports/private.json"));
  assert.throws(() => assertNoPrivateText(Buffer.from(JSON.stringify({ path: "\\\\server\\share\\private.json" })), "reports/private.json"), "a real UNC path must still fail after semantic JSON decoding");
  assert.throws(() => assertNoPrivateText(Buffer.from(JSON.stringify({ authorization: "Bearer abcdefghijklmnopqrstuvwxyz" })), "reports/private.json"), "structured credentials must still fail after semantic JSON decoding");
  assert.throws(() => assertExternalPath(ROOT));
  assert.doesNotThrow(() => assertExternalPath(path.resolve(ROOT, "..", ARCHIVE_FILENAME)));
  assert.doesNotThrow(() => assertDurableReviewLocation(path.resolve(ROOT, "..", ARCHIVE_FILENAME)));
  assert.throws(() => assertDurableReviewLocation(path.resolve(ROOT, "..", "other", ARCHIVE_FILENAME)), /beside/);
});

test("recording probe requires exact silent H.264 MP4 CFR 30, frame count, and viewport", () => {
  const probe = { formatName: "mov,mp4,m4a,3gp,3g2,mj2", videoStreamCount: 1, audioStreamCount: 0, otherStreamCount: 0, codec: "h264", pixelFormat: "yuv420p", averageFrameRate: "30/1", realFrameRate: "30/1", frameCount: 120, width: 844, height: 390 };
  assert.equal(assertVideoProbeContract(probe, 120, { width: 844, height: 390 }), true);
  for (const override of [{ codec: "vp9" }, { formatName: "matroska,webm" }, { audioStreamCount: 1 }, { frameCount: 119 }, { width: 845 }, { averageFrameRate: "30000/1001" }]) assert.throws(() => assertVideoProbeContract({ ...probe, ...override }, 120, { width: 844, height: 390 }));
});

test("CLI dry-run requires explicit final Git/deployment/media/source bindings and writes nothing", () => {
  const output = path.resolve(ROOT, "..", ARCHIVE_FILENAME);
  const evidenceRoot = path.resolve(ROOT, "..", "phase-4r2-1-evidence-dry-run");
  const argv = [
    "--evidence-root", evidenceRoot,
    "--media-manifest", path.join(ROOT, "authority.json"),
    "--deployment-report", path.join(evidenceRoot, "reports", "git-deployment-provenance.json"),
    "--expected-head", HEAD,
    "--expected-parent", PARENT,
    "--expected-source-sha256", SOURCE_SHA256,
    "--expected-manifest-sha256", MANIFEST_SHA,
    "--expected-deployment-id", DEPLOYMENT_ID,
    "--immutable-url", IMMUTABLE_URL,
    "--branch-url", BRANCH_URL,
    "--output", output,
    "--dry-run",
  ];
  const parsed = parseArguments(argv);
  assert.equal(validateOptionShape(parsed, "build"), parsed);
  const result = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "scripts", "package-phase4r2-1-human-review.mjs"), ...argv], { encoding: "utf8", windowsHide: true }));
  assert.equal(result.status, "PASS");
  assert.equal(result.writesPerformed, false);
  assert.deepEqual(result.counts, EXPECTED_COUNTS);
});
