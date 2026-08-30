import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  AUTHORIZATION,
  BRIEF_REQUIREMENTS,
  FINAL_HANDOFF_FIELDS,
  FINAL_METADATA_SCHEMA,
  HUMAN_REVIEW_GATES,
  POSTER_FAMILIES,
  REQUIRED_ARTIFACT_ROLES,
  REQUIRED_BRANCH,
  REQUIRED_BRANCH_URL,
  REQUIRED_PARENT,
  FROZEN_MAIN,
  RESERVED_PATHS,
  TOPOLOGY_SECTIONS,
  assembleFinalEvidence,
  buildEvidenceEntries,
  createMetadataTemplate,
  generatePosterEvidence,
  parseArguments,
  selfTest,
  sanitizeJsonValue,
  sha256,
  stableJson,
  validateDocumentAuthority,
  validateEvidenceEntries,
} from "../scripts/assemble-phase6-final-evidence.mjs";
import {
  PACKAGE_SCHEMA,
  REPORT_SPECS,
  REQUIRED_ARCHIVE_FILENAME,
  REQUIRED_REMOTE_URL,
  REQUIRED_REPOSITORY,
  buildPackageArtifacts,
} from "../scripts/package-phase6-human-review.mjs";
import { auditBuffers } from "../scripts/audit-phase6-human-review-package.mjs";

const GENERATED_AT = "2026-08-30T14:00:00.000Z";
const FINAL_HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEPLOYMENT_ID = "12345678-1234-4234-8234-123456789abc";
const IMMUTABLE_URL = "https://12345678.qsite1.pages.dev/";
const BRANCH_URL = REQUIRED_BRANCH_URL;
const LOCAL_BASE_URL = "http://127.0.0.1:4338/";

async function put(root, relativePath, bytes) {
  const destination = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  await writeFile(destination, data);
  return { source: relativePath, expectedSha256: sha256(data), bytes: data };
}

function globalReport(engine, marker = engine) {
  const matrixCases = engine === "chromium" ? 130 : 34;
  const unsupportedCapabilities = { chromium: 0, webkit: 5, firefox: 4 }[engine];
  return {
    schema: "quantum-hub.phase-6.global-hardening.v1",
    status: "PASS",
    baseUrl: LOCAL_BASE_URL,
    selectedEngines: [engine],
    engines: [{ engine, browser: { executablePath: `C:\\Users\\fixture\\${marker}\\browser.exe`, version: `1.0-${marker}` }, history: { marker }, status: "PASS" }],
    routes: [{ marker }],
    failures: [],
    summary: { engines: 1, engineErrors: 0, failures: 0, matrixCases, matrixExpected: matrixCases, unsupportedCapabilities },
  };
}

function performanceReport() {
  const cycle = (id) => ({ id, status: "COMPLETE", boundedness: { bounded: true }, cycles: 10, snapshots: Array.from({ length: 10 }, (_, index) => ({ cycle: index + 1, status: "PASS" })) });
  return {
    schema: "quantum-hub.phase-6.performance-lifecycle.v1",
    status: "PASS",
    browser: { name: "Chromium", executablePath: "C:\\Users\\fixture\\browser.exe", version: "1" },
    configuration: { baseUrl: LOCAL_BASE_URL, briefDefaultsSatisfied: true, cpuRate: 4, cycles: 10, iterations: 5, settleMs: 350, timeoutMs: 30000 },
    representative: {
      samples: Array.from({ length: 100 }, (_, index) => ({ index, status: "PASS" })),
      scenarios: Array.from({ length: 10 }, (_, index) => ({ id: `scenario-${index}`, status: "PASS" })),
      summary: Array.from({ length: 10 }, (_, index) => ({ id: `scenario-${index}`, status: "PASS" })),
    },
    lifecycleLoops: { homeMaradin: cycle("home-maradin"), homeSupport: cycle("home-support") },
    mediaNetwork: Array.from({ length: 5 }, (_, index) => ({ id: `network-${index}`, status: "PASS" })),
    history: [{ status: "PASS", bfcache: "NOT_OBSERVED" }],
    visibility: { status: "NOT_OBSERVED" },
    limitations: ["Visibility hidden state was not observed."],
  };
}

function accessibilityReport(engine, { axeOnly = false, failed = false } = {}) {
  return {
    schema: "quantum-hub.phase-6.accessibility-interactions.v1",
    status: failed ? "FAIL" : "PASS",
    baseUrl: LOCAL_BASE_URL,
    engine,
    selectedEngines: [engine],
    engines: [{ engine, status: failed ? "ERROR" : "PASS" }],
    axeOnly,
    failures: failed ? [{ check: "webkit-interaction", message: "engine timeout" }] : [],
    summary: { axeCases: failed ? 0 : 20, axeExpected: 20, axeViolations: 0, engineErrors: failed ? 1 : 0, failures: failed ? 1 : 0, seriousCritical: 0 },
  };
}

function deploymentReport() {
  const history = [{ commit: FINAL_HEAD, parents: [REQUIRED_PARENT], subject: "Phase 6 final evidence" }];
  return {
    schema: "quantum-hub.phase-6.deployment-verification.v1",
    status: "PASS",
    inputs: { expectedHead: FINAL_HEAD, acceptedBase: REQUIRED_PARENT, expectedMain: FROZEN_MAIN, repository: REQUIRED_REPOSITORY, branch: REQUIRED_BRANCH, deploymentId: DEPLOYMENT_ID, immutableUrl: IMMUTABLE_URL, branchUrl: BRANCH_URL, localDist: "dist" },
    repository: {
      status: "PASS",
      data: {
        repository: REQUIRED_REPOSITORY,
        branch: REQUIRED_BRANCH,
        head: FINAL_HEAD,
        acceptedBase: REQUIRED_PARENT,
        directParent: REQUIRED_PARENT,
        cleanTree: true,
        history,
        productionDelta: [],
        main: { branch: "main", headSha: FROZEN_MAIN, frozenAt: FROZEN_MAIN, containsPhase6Head: false },
        upstream: { ref: `origin/${REQUIRED_BRANCH}`, headSha: FINAL_HEAD, parity: true },
        liveRemote: { branchRef: `refs/heads/${REQUIRED_BRANCH}`, branchHeadSha: FINAL_HEAD, mainRef: "refs/heads/main", mainHeadSha: FROZEN_MAIN, parity: true },
      },
    },
    deployment: { status: "PASS", data: { authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK", checkRunId: "123", appSlug: "cloudflare-pages", completedAt: GENERATED_AT, deploymentId: DEPLOYMENT_ID, immutableUrl: IMMUTABLE_URL, branchUrl: BRANCH_URL, branch: REQUIRED_BRANCH, commitHash: FINAL_HEAD, environment: "preview", status: "PASS" } },
    dist: { status: "PASS", files: [{ path: "index.html", sha256: "b".repeat(64), bytes: 1 }] },
    origins: { immutable: { status: "PASS", data: { origin: IMMUTABLE_URL, status: "PASS" } }, branch: { status: "PASS", data: { origin: BRANCH_URL, status: "PASS" } } },
    checks: { exactGitBranchMainAuthority: true, signedSuccessfulDeploymentBindsExactHead: true, allDeployableFilesComparedWhereCloudflarePermits: true, branchImmutableLocalByteParity: true, successfulHttpOutcomes: true, real404StatusAndByteParity: true, requiredHeadersAndCachePolicies: true, canonicalBehavior: true, productionMainUnchangedAndPhase6Unmerged: true },
    failures: [],
  };
}

function regressionReport() {
  return {
    schema: "quantum-hub.phase-6.repair-regressions.v1",
    status: "PASS",
    target: { baseUrl: LOCAL_BASE_URL },
    checks: Array.from({ length: 7 }, (_, index) => ({ id: `repair-${index + 1}`, status: "PASS" })),
    sharedDom: { id: "shared", status: "PASS", assertions: [{ name: "shared DOM authority", pass: true }] },
    failures: [],
  };
}

function fakeMp4(marker) {
  const bytes = Buffer.alloc(20, 0);
  bytes.writeUInt32BE(20, 0);
  bytes.write("ftyp", 4, "ascii");
  bytes.write("isom", 8, "ascii");
  bytes.write(marker.slice(0, 8), 12, "ascii");
  return bytes;
}

async function createPosterFixture(parent) {
  const originals = path.join(parent, "poster-originals");
  const candidates = path.join(parent, "poster-candidates");
  await Promise.all([mkdir(originals), mkdir(candidates)]);
  for (const [index, family] of POSTER_FAMILIES.entries()) {
    const width = 24 + index * 3;
    const height = 18 + index * 5;
    const pixels = Buffer.alloc(width * height * 3);
    for (let offset = 0; offset < pixels.length; offset += 1) pixels[offset] = (offset * (index + 3) + index * 41) % 256;
    const original = await sharp(pixels, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
    const lossless = await sharp(pixels, { raw: { width, height, channels: 3 } }).webp({ lossless: true }).toBuffer();
    const lossy = await sharp(pixels, { raw: { width, height, channels: 3 } }).webp({ quality: 72, smartSubsample: false }).toBuffer();
    await Promise.all([
      writeFile(path.join(originals, family.original), original),
      writeFile(path.join(candidates, family.lossless), lossless),
      writeFile(path.join(candidates, family.lossy), lossy),
    ]);
  }
  return { originals, candidates };
}

async function createFixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), "phase6-assembler-"));
  const sourceRoot = path.join(parent, "source");
  await mkdir(sourceRoot);
  const artifacts = [];
  async function jsonArtifact(relativePath, destination, role, document, extra = {}) {
    const file = await put(sourceRoot, relativePath, stableJson(document));
    artifacts.push({ source: file.source, destination, role, final: true, expectedSha256: file.expectedSha256, status: extra.status ?? "PASS", ...extra });
    return file;
  }

  await jsonArtifact("final/deployment-verifier.json", "00-provenance/deployment-verification.json", "deployment-verifier", deploymentReport());
  for (const engine of ["chromium", "webkit", "firefox"]) {
    await jsonArtifact(`final/global-${engine}.json`, `02-cross-engine/global-${engine}.json`, "cross-engine-summary", globalReport(engine), { engine });
  }
  await jsonArtifact("final/homepage.json", "03-homepage-motion/homepage.json", "homepage-motion-summary", globalReport("chromium", "homepage"), { select: ["/engines", "/routes", "/summary", "/status"] });
  await jsonArtifact("final/supporting.json", "04-supporting-routes/supporting.json", "supporting-route-summary", globalReport("chromium", "supporting"), { select: ["/routes", "/summary", "/status"] });
  await jsonArtifact("final/history.json", "05-history-bfcache/history.json", "history-bfcache-summary", globalReport("chromium", "history"), { select: ["/engines", "/summary", "/status"] });
  const performance = performanceReport();
  const performanceFile = await jsonArtifact("final/phase6-performance-final.json", "06-performance/performance.json", "performance-summary", performance, { select: ["/browser", "/configuration", "/representative", "/limitations", "/status"] });
  artifacts.push({ source: performanceFile.source, destination: "07-memory/lifecycle.json", role: "memory-summary", final: true, expectedSha256: performanceFile.expectedSha256, status: "PASS", select: ["/lifecycleLoops", "/visibility", "/limitations", "/status"] });
  artifacts.push({ source: performanceFile.source, destination: "08-network-media/network.json", role: "network-media-summary", final: true, expectedSha256: performanceFile.expectedSha256, status: "PASS", select: ["/mediaNetwork", "/history", "/limitations", "/status"] });
  for (const engine of ["chromium", "firefox", "webkit"]) {
    await jsonArtifact(`final/accessibility-${engine}.json`, `09-accessibility/accessibility-${engine}.json`, "accessibility-summary", accessibilityReport(engine, { axeOnly: engine === "webkit" }), { engine });
  }
  await jsonArtifact("final/accessibility-webkit-timeout.json", "09-accessibility/accessibility-webkit-interaction-limitation.json", "accessibility-interaction-limitation", accessibilityReport("webkit", { failed: true }), { engine: "webkit", status: "LIMITATION", limitation: "WebKit interaction run timed out; the separate WebKit axe-only report passed 20/20 cases." });
  await jsonArtifact("final/repair-regressions-final.json", "12-regression/repair-regressions.json", "regression-summary", regressionReport());

  const imageSpecs = [
    ["capture-chromium/home.png", "02-cross-engine/screenshots/home-chromium.png", "cross-engine-screenshot", "chromium"],
    ["capture-webkit/home.png", "02-cross-engine/screenshots/home-webkit.png", "cross-engine-screenshot", "webkit"],
    ["capture-firefox/home.png", "02-cross-engine/screenshots/home-firefox.png", "cross-engine-screenshot", "firefox"],
    ["capture-chromium/desktop.png", "04-supporting-routes/contact-sheets/desktop.png", "supporting-desktop-sheet"],
    ["capture-chromium/portrait.png", "04-supporting-routes/contact-sheets/portrait.png", "supporting-portrait-sheet"],
    ["capture-chromium/narrow.png", "04-supporting-routes/contact-sheets/narrow.png", "supporting-narrow-sheet"],
    ["capture-chromium/landscape.png", "04-supporting-routes/contact-sheets/landscape.png", "supporting-landscape-sheet"],
  ];
  for (const [index, [source, destination, role, engine]] of imageSpecs.entries()) {
    const bytes = await sharp({ create: { width: 12 + index, height: 10 + index, channels: 3, background: { r: 20 + index * 21, g: 40 + index * 13, b: 70 + index * 11 } } }).png().toBuffer();
    const file = await put(sourceRoot, source, bytes);
    artifacts.push({ source, destination, role, final: true, expectedSha256: file.expectedSha256, status: "PASS", ...(engine ? { engine } : {}) });
  }

  const videos = [
    { source: "capture-chromium/recordings/01-home-forward-reverse-stop.mp4", destination: "02-cross-engine/recordings/home-forward-reverse-stop.mp4", role: "cross-engine-recording", duration: 4.734, marker: "cross001" },
    { source: "capture-chromium/recordings/02-home-entry-manifesto-history.mp4", destination: "03-homepage-motion/home-entry-manifesto-history.mp4", role: "homepage-motion-recording", duration: 5.167, marker: "home0002" },
    { source: "capture-chromium/recordings/03-supporting-signature-motion.mp4", destination: "04-supporting-routes/supporting-signature-motion.mp4", role: "supporting-motion-recording", duration: 3.034, marker: "support3" },
  ];
  const videoFiles = [];
  for (const video of videos) videoFiles.push({ ...video, ...(await put(sourceRoot, video.source, fakeMp4(video.marker))) });
  const report = {
    schema: "quantum-hub.phase-6.review-evidence-capture.v1",
    status: "CAPTURED",
    encoder: { contract: { codec: "h264", pixelFormat: "yuv420p", fps: 30, audioStreams: 0 }, fullDecodeValidated: true },
    files: videoFiles.map((video) => ({ relativePath: video.source.replace("capture-chromium/", ""), bytes: video.bytes.length, sha256: video.expectedSha256 })),
    recordings: videoFiles.map((video) => ({ relativePath: video.source.replace("capture-chromium/", ""), validation: { status: "PASS", duration: video.duration, checks: { mp4Container: true, oneVideoStream: true, zeroAudioStreams: true, h264: true, yuv420p: true, dimensions: true, constant30Fps: true, conciseDuration: true }, media: { audioStreams: 0, codec: "h264", fps: "30/1", pixelFormat: "yuv420p", width: 1280, height: 720 } } })),
  };
  const reportFile = await put(sourceRoot, "capture-chromium/capture-report.json", stableJson(report));
  for (const video of videoFiles) {
    artifacts.push({
      source: video.source,
      destination: video.destination,
      role: video.role,
      final: true,
      expectedSha256: video.expectedSha256,
      status: "PASS",
      mediaContract: { codec: "h264", pixelFormat: "yuv420p", fps: 30, audioStreams: 0, constantFrameRate: true, fullDecodeValidated: true, durationSeconds: video.duration, validationReport: { source: reportFile.source, expectedSha256: reportFile.expectedSha256, recordingRelativePath: video.source.replace("capture-chromium/", "") } },
    });
  }

  const { originals, candidates } = await createPosterFixture(parent);
  const sections = Object.fromEntries(TOPOLOGY_SECTIONS.slice(0, -1).map((section) => [section, {
    status: section === "11-physical-device" ? "PENDING HUMAN DEVICE REVIEW" : "PASS",
    summary: `Final evidence status for ${section}.`,
    limitations: section === "11-physical-device" ? ["No genuine physical-device run was performed; human device review remains pending."] : [],
  }]));
  const metadata = {
    schema: FINAL_METADATA_SCHEMA,
    status: "READY",
    generatedAt: GENERATED_AT,
    repository: { branch: REQUIRED_BRANCH, exactParent: REQUIRED_PARENT, finalHead: FINAL_HEAD, directParent: REQUIRED_PARENT, cleanTree: true, localHead: FINAL_HEAD, upstreamHead: FINAL_HEAD, liveHead: FINAL_HEAD, main: { local: FROZEN_MAIN, upstream: FROZEN_MAIN, public: FROZEN_MAIN, modifiedOrMerged: false }, commitChain: [{ sha: FINAL_HEAD, parents: [REQUIRED_PARENT], subject: "Phase 6 final evidence" }] },
    deployment: { id: DEPLOYMENT_ID, immutableUrl: IMMUTABLE_URL, branchUrl: BRANCH_URL, deployedSha: FINAL_HEAD, parity: "PASS", headers: "PASS", real404: "PASS", canonical: "PASS", productionMainDeployed: false },
    evidenceContext: { browserQa: { origin: "LOCAL", baseUrl: LOCAL_BASE_URL }, deploymentBinding: { method: "DEPLOYMENT_VERIFIER_LOCAL_DIST_ORIGIN_BYTE_PARITY", status: "PASS", verifierArtifactRole: "deployment-verifier" } },
    changes: { productionFiles: ["src/pages/index.astro"], toolingReportFiles: ["scripts/assemble-phase6-final-evidence.mjs"], trackedFileDelta: 2, trackedByteDelta: 2048, newTrackedFilesAbove1MiB: [] },
    verification: { build: { status: "PASS" }, tests: { status: "PASS", total: 4, passed: 4, failed: 0, skipped: 0 }, publication: { status: "PASS" }, routeBudgets: { status: "PASS" } },
    baseline: { acceptedPhase5bReferenceHashes: { report: "c".repeat(64) }, initialBrowserRuntimeInventory: { chromium: "1", webkit: "1", firefox: "1" } },
    limitations: ["Physical-device review is pending.", "Visibility hidden state was not observed in automation."],
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
    sections,
    artifacts,
  };
  return { parent, sourceRoot, originals, candidates, metadata };
}

test("contract exposes exact topology, review gates, 104 bullets and 66 final fields", () => {
  assert.equal(TOPOLOGY_SECTIONS.length, 14);
  assert.equal(Object.values(BRIEF_REQUIREMENTS).flat().length, 104);
  assert.equal(FINAL_HANDOFF_FIELDS.length, 66);
  assert.equal(Object.keys(REQUIRED_ARTIFACT_ROLES).length, 19);
  assert.equal(Object.keys(HUMAN_REVIEW_GATES).length, 6);
  assert.equal(REQUIRED_BRANCH_URL, "https://feature-phase-6-global-harde.qsite1.pages.dev/");
  assert.ok(Object.values(HUMAN_REVIEW_GATES).every((value) => value === "PENDING HUMAN REVIEW"));
  assert.deepEqual(selfTest().status, "PASS");
  assert.equal(parseArguments(["--source-evidence-root", "x", "--final-metadata", "m.json", "--output-root", "out", "--poster-study-directory", "posters"]).posterStudyDirectory, path.resolve("posters"));
});

test("privacy sanitization preserves portable route paths while redacting absolute private roots", () => {
  assert.equal(sanitizeJsonValue("capture-chromium/routes/home/desktop-1440x900.png"), "capture-chromium/routes/home/desktop-1440x900.png");
  assert.equal(sanitizeJsonValue("https://qsite1.pages.dev/home/"), "https://qsite1.pages.dev/home/");
  assert.match(sanitizeJsonValue("stored at /home/reviewer/private.json"), /<PRIVATE_PATH>\/private\.json/);
  assert.match(sanitizeJsonValue("stored at /var/folders/ab/cache.json"), /<PRIVATE_PATH>\/redacted/);
});

test("authority validators match final report array/object tuples", () => {
  const metadata = { evidenceContext: { browserQa: { baseUrl: LOCAL_BASE_URL } } };
  for (const engine of ["chromium", "webkit", "firefox"]) assert.doesNotThrow(() => validateDocumentAuthority({ role: "cross-engine-summary", engine }, globalReport(engine), metadata));
  const legacyGlobalShape = globalReport("chromium");
  legacyGlobalShape.engines = legacyGlobalShape.engines[0];
  assert.throws(() => validateDocumentAuthority({ role: "cross-engine-summary", engine: "chromium" }, legacyGlobalShape, metadata), /cross-engine exact tuple differs/);
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "performance-summary" }, performanceReport(), metadata));
  const legacyPerformanceShape = performanceReport();
  legacyPerformanceShape.lifecycleLoops = [legacyPerformanceShape.lifecycleLoops];
  assert.throws(() => validateDocumentAuthority({ role: "performance-summary" }, legacyPerformanceShape, metadata), /performance exact tuple differs/);
  for (const engine of ["chromium", "firefox", "webkit"]) assert.doesNotThrow(() => validateDocumentAuthority({ role: "accessibility-summary", engine }, accessibilityReport(engine, { axeOnly: engine === "webkit" }), metadata));
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "accessibility-interaction-limitation", engine: "webkit" }, accessibilityReport("webkit", { failed: true }), metadata));
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "regression-summary" }, regressionReport(), metadata));
});

test("build is deterministic, complete, privacy-safe and maps every brief bullet", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const options = { sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false };
  const first = await buildEvidenceEntries(options);
  const second = await buildEvidenceEntries(options);
  assert.deepEqual(first.entries.map((entry) => [entry.path, sha256(entry.data)]), second.entries.map((entry) => [entry.path, sha256(entry.data)]));
  assert.deepEqual(Object.keys(first.sections), TOPOLOGY_SECTIONS);
  assert.ok(Object.values(first.sections).every((count) => count > 0));
  assert.ok([...RESERVED_PATHS].every((reserved) => !first.entries.some((entry) => entry.path === reserved)));
  const deploymentEntry = first.entries.find((entry) => entry.role === "deployment-verifier");
  assert.equal(deploymentEntry?.path, "00-provenance/deployment-verification.json");
  assert.equal(JSON.parse(deploymentEntry.data).schema, "quantum-hub.phase-6.deployment-verification.v1");
  assert.deepEqual(deploymentEntry.data, await readFile(path.join(fixture.sourceRoot, "final", "deployment-verifier.json")));
  assert.ok(first.entries.some((entry) => entry.path === "00-provenance/deployment-authority-summary.json" && entry.role === "generated-authority"));
  assert.equal(first.entries.filter((entry) => entry.path === "00-provenance/deployment-verification.json").length, 1);
  const summaries = first.entries.filter((entry) => entry.path.endsWith("section-summary.json")).map((entry) => JSON.parse(entry.data));
  assert.equal(summaries.reduce((sum, summary) => sum + summary.requirements.length, 0), 104);
  assert.ok(summaries.flatMap((summary) => summary.requirements).every((requirement) => requirement.evidence.length > 0));
  const performance = first.entries.find((entry) => entry.path === "06-performance/performance.json").data.toString("utf8");
  assert.doesNotMatch(performance, /C:\\Users|fixture\\browser/i);
  assert.match(performance, /PRIVATE_PATH/);
  const limitation = JSON.parse(first.entries.find((entry) => entry.path.includes("webkit-interaction-limitation")).data);
  assert.equal(limitation.status, "LIMITATION");
  assert.equal(limitation.sourceStatus, "FAIL");
  assert.equal(first.entries.filter((entry) => entry.role === "poster-side-by-side").length, 3);
  assert.equal(first.entries.filter((entry) => entry.role === "poster-difference").length, 3);
});

test("assembled evidence is directly consumable by the deterministic packager and independent auditor", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const assembled = await buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });
  const trackedReports = REPORT_SPECS.map(({ source }) => source).sort();
  const payloadEntries = [
    ...assembled.entries,
    ...REPORT_SPECS.map((report, index) => ({ path: report.archive, data: Buffer.from(`# ${report.source}\nfixture report ${index}\n`) })),
    {
      path: "00-provenance/git-provenance.json",
      data: Buffer.from(stableJson({
        schema: `${PACKAGE_SCHEMA}.git-provenance`,
        status: "PASS",
        branch: REQUIRED_BRANCH,
        head: FINAL_HEAD,
        directParents: [REQUIRED_PARENT],
        cleanTree: true,
        acceptedBase: REQUIRED_PARENT,
        acceptedBaseAncestor: true,
        headMergedIntoMain: false,
        localMain: { ref: "refs/heads/main", head: FROZEN_MAIN },
        originMain: { ref: "refs/remotes/origin/main", head: FROZEN_MAIN },
        liveMain: { ref: "refs/heads/main", head: FROZEN_MAIN },
        upstream: { ref: `origin/${REQUIRED_BRANCH}`, head: FINAL_HEAD, liveHead: FINAL_HEAD, parity: true },
        remote: { name: "origin", url: REQUIRED_REMOTE_URL, repository: REQUIRED_REPOSITORY },
        trackedReports,
      })),
    },
  ];
  const provenance = {
    branch: REQUIRED_BRANCH,
    expectedHead: FINAL_HEAD,
    observedHead: FINAL_HEAD,
    acceptedBase: REQUIRED_PARENT,
    expectedMain: FROZEN_MAIN,
    deployment: { id: DEPLOYMENT_ID, immutableUrl: IMMUTABLE_URL, branchUrl: BRANCH_URL },
  };
  const packaged = buildPackageArtifacts({ payloadEntries, provenance, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT });
  const audited = auditBuffers({
    archiveBytes: packaged.archiveBytes,
    detachedBytes: packaged.detachedBytes,
    archiveFilename: REQUIRED_ARCHIVE_FILENAME,
    expected: { expectedHead: FINAL_HEAD, branch: REQUIRED_BRANCH, deploymentId: DEPLOYMENT_ID, immutableUrl: IMMUTABLE_URL, branchUrl: BRANCH_URL },
  });
  assert.equal(audited.reviewPolicy, "PASS");
  assert.equal(audited.deploymentVerification.document.schema, "quantum-hub.phase-6.deployment-verification.v1");
  assert.ok(packaged.archiveBytes.length < 75 * 1024 * 1024);
});

test("publication is fresh-only and writes the validated external topology", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const metadataPath = path.join(fixture.parent, "metadata.json");
  const outputRoot = path.join(fixture.parent, "assembled");
  await writeFile(metadataPath, stableJson(fixture.metadata));
  const result = await assembleFinalEvidence({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadataPath: metadataPath, outputRoot, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false, maximumBytes: 75 * 1024 * 1024 });
  assert.equal(result.status, "PASS");
  assert.equal(result.posterComparisonsIncluded, true);
  assert.equal(JSON.parse(await readFile(path.join(outputRoot, "13-package", "evidence-assembly-summary.json"), "utf8")).status, "PASS");
  await assert.rejects(() => assembleFinalEvidence({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadataPath: metadataPath, outputRoot, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false }), /already exists/);
});

test("metadata template inventories exact hashes without embedding its external root", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  await put(fixture.sourceRoot, "draft-smoke.json", stableJson({ status: "PASS" }));
  const template = await createMetadataTemplate(fixture.sourceRoot, GENERATED_AT);
  assert.match(template.schema, /\.template$/);
  assert.ok(template.sourceInventory.some((record) => record.path === "final/phase6-performance-final.json" && record.sha256 === fixture.metadata.artifacts.find((record) => record.role === "performance-summary").expectedSha256));
  assert.ok(template.rejectedSourceInventory.some((record) => record.path === "draft-smoke.json"));
  assert.doesNotMatch(stableJson(template), new RegExp(fixture.parent.replaceAll("\\", "\\\\"), "i"));
});

test("fails closed for missing posters, missing roles, bad hashes, private secrets and duplicate payloads", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  await assert.rejects(() => buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata }), /poster-study-directory is mandatory/);
  const missingRole = structuredClone(fixture.metadata);
  missingRole.artifacts = missingRole.artifacts.filter((record) => record.role !== "accessibility-interaction-limitation");
  await assert.rejects(() => buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: missingRole, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false }), /mandatory evidence role is missing/);
  const badHash = structuredClone(fixture.metadata);
  badHash.artifacts[0].expectedSha256 = "0".repeat(64);
  await assert.rejects(() => buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: badHash, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false }), /SHA-256 differs/);
  const wrongDeploymentPath = structuredClone(fixture.metadata);
  wrongDeploymentPath.artifacts.find((record) => record.role === "deployment-verifier").destination = "00-provenance/deployment-verifier.json";
  await assert.rejects(() => buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: wrongDeploymentPath, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false }), /must occupy 00-provenance\/deployment-verification\.json/);
  const projectedDeployment = structuredClone(fixture.metadata);
  projectedDeployment.artifacts.find((record) => record.role === "deployment-verifier").select = ["/checks"];
  await assert.rejects(() => buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: projectedDeployment, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false }), /included whole/);
  const wrongBranchAlias = structuredClone(fixture.metadata);
  wrongBranchAlias.deployment.branchUrl = "https://feature-phase-6-global-hardening.qsite1.pages.dev/";
  await assert.rejects(() => buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: wrongBranchAlias, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false }), /deployment URL\/UUID binding differs/);
  const uppercaseDeploymentId = structuredClone(fixture.metadata);
  uppercaseDeploymentId.deployment.id = uppercaseDeploymentId.deployment.id.toUpperCase();
  await assert.rejects(() => buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: uppercaseDeploymentId, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false }), /final deployment authority differs/);
  const secret = structuredClone(fixture.metadata);
  secret.limitations.push("api_key=abcdefghijklmnopqrstuvwx");
  await assert.rejects(() => buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: secret, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false }), /secret-like content/);
  const duplicate = Buffer.from("same payload");
  assert.throws(() => validateEvidenceEntries(TOPOLOGY_SECTIONS.map((section, index) => ({ path: `${section}/item-${index}.txt`, data: index < 2 ? duplicate : Buffer.from(`payload-${index}`) }))), /duplicate evidence payload/);
});

test("poster generation is labelled, compact, deterministic and excludes candidate payloads", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "phase6-posters-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const fixture = await createPosterFixture(parent);
  const first = await generatePosterEvidence(fixture.candidates, { originalDirectory: fixture.originals, verifyTrackedAuthority: false });
  const second = await generatePosterEvidence(fixture.candidates, { originalDirectory: fixture.originals, verifyTrackedAuthority: false });
  assert.equal(first.entries.length, 7);
  assert.deepEqual(first.entries.map((entry) => [entry.path, sha256(entry.data)]), second.entries.map((entry) => [entry.path, sha256(entry.data)]));
  assert.equal(new Set(first.entries.map((entry) => sha256(entry.data))).size, first.entries.length);
  assert.ok(first.entries.every((entry) => !/webp-(?:lossless|q95)\.webp$/.test(entry.path)));
  assert.ok(first.records.every((record) => record.lossless.pixelExact && record.lossy.changedPixels > 0));
});
