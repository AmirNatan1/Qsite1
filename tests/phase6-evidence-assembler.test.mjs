import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  AUTHORIZATION,
  BRIEF_REQUIREMENTS,
  EVIDENCE_STATUS_VALUES,
  FINAL_HANDOFF_FIELDS,
  FINAL_METADATA_SCHEMA,
  HUMAN_EVIDENCE_SCHEMA,
  HUMAN_REVIEW_GATES,
  POSTER_FAMILIES,
  REQUIRED_ARTIFACT_ROLES,
  REQUIRED_BRANCH,
  REQUIRED_BRANCH_URL,
  REQUIRED_HUMAN_EVIDENCE_FILES,
  REQUIRED_PARENT,
  R1_REQUIRED_BRANCH,
  R1_REQUIRED_BRANCH_URL,
  R1_REQUIRED_PARENT,
  R1_MOTION_EVIDENCE_SCHEMA,
  R1_MOTION_RECORDING_SPECS,
  R1_PERSISTENT_LIFECYCLE_SCHEMA,
  R1_REQUIRED_ARTIFACT_ROLES,
  FROZEN_MAIN,
  RESERVED_PATHS,
  TOPOLOGY_SECTIONS,
  assembleFinalEvidence,
  buildEvidenceEntries,
  createMetadataTemplate,
  generatePosterEvidence,
  guardedRequirementAssessment,
  parseArguments,
  selfTest,
  sanitizeJsonValue,
  sha256,
  stableJson,
  validateDocumentAuthority,
  validateEvidenceEntries,
  validateHumanEvidenceLedger,
} from "../scripts/assemble-phase6-final-evidence.mjs";
import { DEVICE_REVIEW_CHECKS } from "../scripts/ingest-phase6-r1-human-evidence.mjs";
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
const R1_FINAL_HEAD = "dddddddddddddddddddddddddddddddddddddddd";
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
    engines: [{ engine, browser: { executablePath: `C:\\Users\\fixture\\${marker}\\browser.exe`, version: `1.0-${marker}` }, history: { bfcache: { status: "not-observed" }, marker }, status: "PASS" }],
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
    history: { status: "PASS", bfcache: { status: "not-observed" } },
    visibility: { status: "NOT_OBSERVED" },
    limitations: ["Visibility hidden state was not observed."],
  };
}

function accessibilityReport(engine, { axeOnly = false, failed = false } = {}) {
  const routes = [
    { expectedStatus: 200, id: "home", path: "/" },
    { expectedStatus: 200, id: "for-industry", path: "/for-partners/" },
    { expectedStatus: 200, id: "for-startups", path: "/for-startups/" },
    { expectedStatus: 200, id: "industries", path: "/industries/" },
    { expectedStatus: 200, id: "proof", path: "/pocs/" },
    { expectedStatus: 200, id: "maradin", path: "/pocs/maradin/" },
    { expectedStatus: 200, id: "spark", path: "/spark/" },
    { expectedStatus: 200, id: "about", path: "/about/" },
    { expectedStatus: 200, id: "contact", path: "/contact/" },
    { expectedStatus: 404, id: "404", path: "/__phase6-intentional-404__/" },
  ];
  const interaction = axeOnly || failed ? {} : {
    failures: [],
    history: { failures: [], status: "PASS" },
    keyboard: routes.map(({ id: route }) => ({ route, failures: [], status: "PASS" })),
    mobileMenu: { cycles: Array.from({ length: 4 }, (_, index) => ({ cycle: index + 1, status: "PASS" })), failures: [], status: "PASS" },
    summary: { keyboardCases: 10 },
  };
  return {
    schema: "quantum-hub.phase-6.accessibility-interactions.v1",
    status: failed ? "FAIL" : "PASS",
    baseUrl: LOCAL_BASE_URL,
    engine,
    selectedEngines: [engine],
    engines: [{ engine, status: failed ? "ERROR" : "PASS", ...interaction }],
    axeOnly,
    failures: failed ? [{ check: "webkit-interaction", message: "engine timeout" }] : [],
    routes,
    summary: { axeCases: failed ? 0 : 20, axeExpected: 20, axeViolations: 0, engineErrors: failed ? 1 : 0, failures: failed ? 1 : 0, seriousCritical: 0 },
  };
}

function reflowProxyReport() {
  return {
    schema: "quantum-hub.phase-5b.responsive-accessibility.v1",
    status: "PASS",
    variants: [{
      id: "text-200-proxy",
      viewports: [{ id: "text-200-proxy-720x450", width: 720, height: 450 }],
      records: [{ route: "/", viewport: { id: "text-200-proxy-720x450", width: 720, height: 450 }, status: "PASS" }],
    }],
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

function r1DeploymentReport() {
  const report = deploymentReport();
  report.schema = "quantum-hub.phase-6-r1.deployment-verification.v1";
  report.inputs.expectedHead = R1_FINAL_HEAD;
  report.inputs.exactParent = R1_REQUIRED_PARENT;
  delete report.inputs.acceptedBase;
  report.inputs.branch = R1_REQUIRED_BRANCH;
  report.inputs.branchUrl = R1_REQUIRED_BRANCH_URL;
  report.repository.data.branch = R1_REQUIRED_BRANCH;
  report.repository.data.head = R1_FINAL_HEAD;
  report.repository.data.exactParent = R1_REQUIRED_PARENT;
  delete report.repository.data.acceptedBase;
  report.repository.data.directParent = R1_REQUIRED_PARENT;
  report.repository.data.history = [{ commit: R1_FINAL_HEAD, parents: [R1_REQUIRED_PARENT], subject: "Phase 6-R1 validation closure" }];
  report.repository.data.upstream = { ref: `origin/${R1_REQUIRED_BRANCH}`, headSha: R1_FINAL_HEAD, parity: true };
  report.repository.data.liveRemote = { branchRef: `refs/heads/${R1_REQUIRED_BRANCH}`, branchHeadSha: R1_FINAL_HEAD, mainRef: "refs/heads/main", mainHeadSha: FROZEN_MAIN, parity: true };
  report.deployment.data.branchUrl = R1_REQUIRED_BRANCH_URL;
  report.deployment.data.branch = R1_REQUIRED_BRANCH;
  report.deployment.data.commitHash = R1_FINAL_HEAD;
  report.origins.branch.data.origin = R1_REQUIRED_BRANCH_URL;
  report.checks = {
    exactR1BranchParentAndFrozenMain: true,
    zeroProductionSourceDiff: true,
    signedSuccessfulDeploymentBindsExactHead: true,
    immutableLocalByteParity: true,
    branchLocalByteParity: true,
    real404HeadersCanonicalAndTenRoutes: true,
  };
  return report;
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
  await jsonArtifact("final/baseline-responsive-accessibility.json", "09-accessibility/720x450-reflow-proxy.json", "supplemental-reflow-proxy", reflowProxyReport());
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

async function rewriteArtifactJson(fixture, predicate, transform) {
  for (const artifact of fixture.metadata.artifacts.filter(predicate)) {
    const absolute = path.join(fixture.sourceRoot, ...artifact.source.split("/"));
    const document = JSON.parse(await readFile(absolute, "utf8"));
    transform(document, artifact);
    const bytes = Buffer.from(stableJson(document));
    await writeFile(absolute, bytes);
    artifact.expectedSha256 = sha256(bytes);
  }
}

function r1MotionValidation(duration) {
  return {
    status: "PASS",
    duration,
    checks: {
      mp4Container: true,
      oneVideoStream: true,
      zeroAudioStreams: true,
      h264: true,
      yuv420p: true,
      dimensions: true,
      constant30Fps: true,
      conciseDuration: true,
    },
    media: { audioStreams: 0, codec: "h264", fps: "30/1", format: "mov,mp4,m4a,3gp,3g2,mj2", height: 720, pixelFormat: "yuv420p", width: 1280 },
  };
}

async function attachR1MachineEvidence(fixture) {
  for (const [engineIndex, engine] of ["chromium", "firefox"].entries()) {
    const sourceRoot = `r1-motion-${engine}`;
    const videoFiles = [];
    for (const [storyIndex, spec] of R1_MOTION_RECORDING_SPECS.entries()) {
      const source = `${sourceRoot}/recordings/${spec.filename}`;
      const file = await put(fixture.sourceRoot, source, fakeMp4(`r1${engineIndex}${storyIndex}`));
      const duration = 2.5 + storyIndex;
      videoFiles.push({ ...file, ...spec, duration, relativePath: `recordings/${spec.filename}`, validation: r1MotionValidation(duration) });
    }
    const report = {
      schema: R1_MOTION_EVIDENCE_SCHEMA,
      status: "PASS",
      createdAt: GENERATED_AT,
      evidenceClass: "SUPPLEMENTAL MACHINE EVIDENCE — NOT PHYSICAL DEVICE EVIDENCE",
      baseUrl: LOCAL_BASE_URL,
      browser: { engine, headed: false, version: `fixture-${engine}-1` },
      inputPolicy: "Playwright native wheel, pointer, viewport and link activation; no page scroll-position writes",
      encoder: { contract: { audioStreams: 0, codec: "h264", container: "mp4", fps: 30, pixelFormat: "yuv420p" }, ffmpeg: "fixture ffmpeg", ffprobe: "fixture ffprobe", fullDecodeValidated: true },
      recordings: videoFiles.map((video) => ({
        id: video.id,
        filename: video.filename,
        evidenceClass: "SUPPLEMENTAL MACHINE RECORDING",
        observations: { samples: [], status: "PASS" },
        relativePath: video.relativePath,
        byteSize: video.bytes.length,
        sha256: video.expectedSha256,
        validation: video.validation,
      })),
      requests: { blocked: [], console: [], pageErrors: [], requests: [] },
      diagnostics: { status: "PASS", failures: [] },
      summary: { recordings: 5, expected: 5, failures: 0 },
    };
    const reportFile = await put(fixture.sourceRoot, `${sourceRoot}/motion-evidence-report.json`, stableJson(report));
    fixture.metadata.artifacts.push({
      source: reportFile.source,
      destination: `03-homepage-motion/r1/${engine}/motion-evidence-report.json`,
      role: "r1-motion-summary",
      engine,
      final: true,
      expectedSha256: reportFile.expectedSha256,
      status: "PASS",
    });
    for (const video of videoFiles) {
      fixture.metadata.artifacts.push({
        source: video.source,
        destination: `03-homepage-motion/r1/${engine}/${video.filename}`,
        role: "r1-motion-recording",
        engine,
        final: true,
        expectedSha256: video.expectedSha256,
        status: "PASS",
        mediaContract: {
          codec: "h264",
          pixelFormat: "yuv420p",
          fps: 30,
          audioStreams: 0,
          constantFrameRate: true,
          fullDecodeValidated: true,
          durationSeconds: video.duration,
          validationReport: { source: reportFile.source, expectedSha256: reportFile.expectedSha256, recordingRelativePath: video.relativePath },
        },
      });
    }
  }

  const phase4Path = "/media/cinematic/phase-4r2/media/mobile.mp4";
  const listenerTelemetry = () => ({
    active: 3,
    activeByType: { click: 2, visibilitychange: 1 },
    duplicateAttempts: 0,
  });
  const lifecycleState = (label, documentId, url, scrollY, manifestoReveal = null, mediaStartTime = null, navigationType = "navigate") => ({
    label,
    documentId,
    url,
    scrollY,
    mobileMenu: { open: false },
    ...(manifestoReveal === null ? {} : { home: { manifestoReveal, mode: "enhanced", source: { hasSource: true } } }),
    probe: {
      documentEventSequence: 0,
      events: [],
      listeners: listenerTelemetry(),
      navigation: { type: navigationType, notRestoredReasons: null },
      resources: mediaStartTime == null ? [] : [{ url: phase4Path, startTime: mediaStartTime }],
    },
  });
  const historyStates = {
    bare: lifecycleState("bare-home", "bare-document", "/", 0, "hidden", 10),
    bareManifesto: lifecycleState("bare-home-manifesto", "bare-document", "/", 800, "resolved", 10),
    supportAfterBare: lifecycleState("support-after-bare", "support-bare-document", "/for-partners/", 120),
    bareBack: lifecycleState("bare-back", "bare-document", "/", 800, "resolved", 10, "back_forward"),
    supportForward: lifecycleState("support-forward", "support-bare-document", "/for-partners/", 120, null, null, "back_forward"),
    entryInitial: lifecycleState("entry-initial", "entry-document", "/#entry", 900, "hidden", 20),
    entryResolved: lifecycleState("entry-resolved", "entry-document", "/#entry", 900, "resolved", 20),
    supportAfterEntry: lifecycleState("support-after-entry", "support-entry-document", "/for-partners/", 60),
    entryBack: lifecycleState("entry-back", "entry-document", "/#entry", 900, "resolved", 20, "back_forward"),
    entryForward: lifecycleState("entry-forward", "support-entry-document", "/for-partners/", 60, null, null, "back_forward"),
  };
  const notRestoredReasons = Object.fromEntries(Object.keys(historyStates).map((stateKey) => [stateKey, null]));
  const bfcache = {
    status: "NOT OBSERVED",
    persistedEvents: [],
    pairedRestorations: [],
    notRestoredReasons,
    scenarios: [
      { departureKey: "bareManifesto", stateKey: "bareBack", expectedRoute: "/", status: "NOT OBSERVED", pair: null, coherent: null },
      { departureKey: "entryResolved", stateKey: "entryBack", expectedRoute: "/#entry", status: "NOT OBSERVED", pair: null, coherent: null },
    ],
    statement: "Persisted restoration was not observed.",
  };
  const historyChecks = {
    bareCorrect: true,
    bareBackCorrect: true,
    bareBackNoManifestoReplay: true,
    bareForwardCorrect: true,
    entryCorrect: true,
    entryBackCorrect: true,
    entryBackManifestoResolved: true,
    entryForwardCorrect: true,
    menuClosed: true,
  };
  const visibilityChecks = {
    "home-current": {
      homeMediaPausedWhileHidden: null,
      noPersistentRafWhileHidden: null,
      noPersistentIntervalWhileHidden: null,
      noStaleTargetFrameAfterReturn: null,
      sourcePresenceStableAfterReturn: null,
    },
    "home-manifesto": {
      manifestoCoherentAfterReturn: null,
      noPersistentRafWhileHidden: null,
      noPersistentIntervalWhileHidden: null,
    },
    "maradin-release": {
      sourceFreeWhileHidden: null,
      sourceFreeAfterReturn: null,
      noLiveOrphanBlobWhileHidden: null,
      noPersistentRafWhileHidden: null,
      noPersistentIntervalWhileHidden: null,
    },
    "maradin-retry-release": {
      retryActivatedWithSource: null,
      sourceFreeOnSecondHide: null,
      sourceFreeAfterSecondReturn: null,
      noLiveOrphanBlobOnSecondHide: null,
    },
  };
  const visibilityScenarios = ["home-current", "home-manifesto", "maradin-release", "maradin-retry-release"].map((name) => ({
    name,
    status: "NOT OBSERVED",
    observation: {
      status: "NOT OBSERVED",
      checks: {
        sameDocument: false,
        sequenceBound: false,
        beforeVisible: false,
        hiddenObserved: false,
        visibleRestored: false,
        orderedVisibilityEvents: false,
      },
      transitionEvents: [],
    },
    checks: visibilityChecks[name],
    failedChecks: [],
    unavailableChecks: Object.keys(visibilityChecks[name]),
    transition: null,
  }));
  const stableListenerSnapshot = listenerTelemetry();
  const listenerComparisons = [
    { name: "bare-back", documentId: "bare-document", before: stableListenerSnapshot, after: stableListenerSnapshot, failures: [], stable: true },
    { name: "entry-back", documentId: "entry-document", before: stableListenerSnapshot, after: stableListenerSnapshot, failures: [], stable: true },
  ];
  const lifecycle = {
    schema: R1_PERSISTENT_LIFECYCLE_SCHEMA,
    status: "LIMITATION",
    createdAt: GENERATED_AT,
    baseUrl: R1_REQUIRED_BRANCH_URL,
    browser: { engine: "chromium", headed: true, persistentProfile: true, profileRetained: false, version: "fixture-chromium-1" },
    profileCleanup: { status: "PASS", deletionVerified: true, profileRetained: false, errors: [] },
    history: { status: "PASS", bfcache, checks: historyChecks, events: [], states: historyStates },
    bfcache,
    visibility: {
      status: "NOT OBSERVED",
      scenarios: visibilityScenarios,
      current: null,
      manifesto: null,
      maradin: null,
      retryActive: null,
      maradinRetry: null,
      statement: "A real hidden transition was not observed.",
    },
    listeners: { status: "PASS", comparisons: listenerComparisons, duplicateDocuments: [], statement: "Same-Document listener telemetry remained stable." },
    mediaRequests: {
      status: "PASS",
      bypassDocumentsSourceFree: true,
      expectedPhase4Present: true,
      noDuplicateSourceWithinDocument: true,
      noDuplicateNonRangeRequests: true,
      documents: [
        { documentId: "bare-document", labels: ["bare-back", "bare-home", "bare-home-manifesto"], mediaExpected: true, modes: ["enhanced"], paths: [phase4Path], resourceObservations: 1, sourceFree: false },
        { documentId: "entry-document", labels: ["entry-back", "entry-initial", "entry-resolved"], mediaExpected: true, modes: ["enhanced"], paths: [phase4Path], resourceObservations: 1, sourceFree: false },
      ],
      network: {
        phase4Requests: [{ path: phase4Path, range: "bytes=0-1023" }],
        requestCount: 1,
        rangeRequestCount: 1,
        nonRangeRequestCount: 0,
        nonRangeSelections: [],
        uniquePaths: [phase4Path],
      },
    },
    interpretation: { bfcache: "NOT OBSERVED remains explicit.", visibility: "Real transitions only.", ordinaryHistory: "Independent ordinary history.", overall: "Limitations remain limitations." },
  };
  const lifecycleFile = await put(fixture.sourceRoot, "r1-lifecycle/persistent-lifecycle.json", stableJson(lifecycle));
  fixture.metadata.artifacts.push({
    source: lifecycleFile.source,
    destination: "05-history-bfcache/r1-persistent-lifecycle.json",
    role: "r1-persistent-lifecycle-summary",
    engine: "chromium",
    final: true,
    expectedSha256: lifecycleFile.expectedSha256,
    status: "LIMITATION",
    limitation: "BFCache and real hidden visibility were not observed on this host.",
  });
}

async function rewriteR1MotionReport(fixture, engine, transform) {
  const summary = fixture.metadata.artifacts.find((artifact) => artifact.role === "r1-motion-summary" && artifact.engine === engine);
  assert.ok(summary, `missing ${engine} R1 motion summary fixture`);
  const absolute = path.join(fixture.sourceRoot, ...summary.source.split("/"));
  const document = JSON.parse(await readFile(absolute, "utf8"));
  const transformed = transform(document) ?? document;
  const bytes = Buffer.from(stableJson(transformed));
  await writeFile(absolute, bytes);
  const expectedSha256 = sha256(bytes);
  summary.expectedSha256 = expectedSha256;
  for (const artifact of fixture.metadata.artifacts.filter((record) => record.role === "r1-motion-recording" && record.engine === engine)) {
    artifact.mediaContract.validationReport.expectedSha256 = expectedSha256;
  }
  return transformed;
}

async function convertFixtureToR1(fixture) {
  await rewriteArtifactJson(fixture, ({ role }) => role === "deployment-verifier", (document) => Object.assign(document, r1DeploymentReport()));
  fixture.metadata.authorityProfile = "phase6-r1";
  Object.assign(fixture.metadata.repository, {
    branch: R1_REQUIRED_BRANCH,
    exactParent: R1_REQUIRED_PARENT,
    finalHead: R1_FINAL_HEAD,
    directParent: R1_REQUIRED_PARENT,
    localHead: R1_FINAL_HEAD,
    upstreamHead: R1_FINAL_HEAD,
    liveHead: R1_FINAL_HEAD,
    commitChain: [{ sha: R1_FINAL_HEAD, parents: [R1_REQUIRED_PARENT], subject: "Phase 6-R1 validation closure" }],
  });
  Object.assign(fixture.metadata.deployment, {
    branchUrl: R1_REQUIRED_BRANCH_URL,
    deployedSha: R1_FINAL_HEAD,
  });
  await attachR1MachineEvidence(fixture);
  await attachVerifiedHumanEvidence(fixture);
}

async function writeHumanLedger(fixture, document, status = document.status) {
  const artifact = fixture.metadata.artifacts.find(({ role }) => role === "physical-device-result");
  const bytes = Buffer.from(stableJson(document));
  await writeFile(path.join(fixture.sourceRoot, ...artifact.source.split("/")), bytes);
  artifact.expectedSha256 = sha256(bytes);
  artifact.status = status;
}

async function attachVerifiedHumanEvidence(fixture) {
  const humanEvidence = [];
  const zoomRoutes = ["/", "/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/pocs/maradin/", "/spark/", "/about/", "/contact/", "/__phase6-intentional-404__/"];
  for (const [index, filename] of REQUIRED_HUMAN_EVIDENCE_FILES.entries()) {
    const source = `human-device/${filename}`;
    const file = await put(fixture.sourceRoot, source, fakeMp4(`human${index + 1}`));
    fixture.metadata.artifacts.push({
      source,
      destination: `11-physical-device/recordings/${filename}`,
      role: "physical-device-recording",
      final: true,
      expectedSha256: file.expectedSha256,
      status: "PASS",
    });
    const evidence = {
      filename,
      sha256: file.expectedSha256,
      byteSize: file.bytes.length,
      evidenceClass: "PHYSICAL HUMAN RECORDING",
      device: filename.startsWith("iphone-") ? "Physical iPhone" : "Physical Windows host",
      os: filename.startsWith("iphone-") ? "iOS (version supplied in recording)" : "Windows (version supplied in recording)",
      browser: filename === "physical-scroll-input.mp4" ? null : (filename.startsWith("iphone-") ? "Safari" : "Chrome"),
      browserVersion: null,
      testSteps: ["The required interaction sequence is visibly demonstrated in the supplied recording."],
      observations: ["The reviewed sequence remains coherent at the visible checkpoints."],
      observedResult: "The visibly demonstrated checks completed without a recorded failure.",
      status: "PASS",
      failureReferences: [],
    };
    if (DEVICE_REVIEW_CHECKS[filename]) evidence.checks = Object.fromEntries(DEVICE_REVIEW_CHECKS[filename].map((check) => [check, true]));
    if (filename === "chrome-200-percent.mp4") {
      evidence.genuineBrowserZoom = true;
      evidence.zoomPercent = 200;
      evidence.proxy = false;
      evidence.routeOutcomes = zoomRoutes.map((route) => ({
        route,
        status: "PASS",
        failureReferences: [],
        checks: {
          completeH1: true,
          completeOpeningProposition: true,
          readableNavigation: true,
          usableMobileMenuWhereApplicable: true,
          noTextClipping: true,
          noInternalWordSplitting: true,
          noHiddenContent: true,
          noHorizontalOverflow: true,
          usableControlsAndLinks: true,
          reasonableDocumentContinuation: true,
        },
      }));
    }
    humanEvidence.push(evidence);
  }
  const ledger = {
    schema: HUMAN_EVIDENCE_SCHEMA,
    status: "PASS",
    evidenceClass: "HUMAN DEVICE EVIDENCE",
    rootExists: true,
    requiredFilenames: [...REQUIRED_HUMAN_EVIDENCE_FILES],
    missingFilenames: [],
    entries: humanEvidence,
  };
  const ledgerFile = await put(fixture.sourceRoot, "human-device/ledger.json", stableJson(ledger));
  fixture.metadata.artifacts.push({
    source: ledgerFile.source,
    destination: "11-physical-device/human-evidence-ledger.json",
    role: "physical-device-result",
    final: true,
    expectedSha256: ledgerFile.expectedSha256,
    status: "PASS",
  });
  fixture.metadata.sections["11-physical-device"] = { status: "PASS", summary: "Verified physical-device evidence was ingested.", limitations: [] };
  return ledger;
}

test("contract exposes exact topology, review gates, 104 bullets and 66 final fields", () => {
  assert.equal(TOPOLOGY_SECTIONS.length, 14);
  assert.equal(Object.values(BRIEF_REQUIREMENTS).flat().length, 104);
  assert.equal(FINAL_HANDOFF_FIELDS.length, 66);
  assert.equal(Object.keys(REQUIRED_ARTIFACT_ROLES).length, 18);
  assert.equal(Object.keys(R1_REQUIRED_ARTIFACT_ROLES).length, 5);
  assert.equal(R1_MOTION_RECORDING_SPECS.length, 5);
  assert.equal(Object.keys(HUMAN_REVIEW_GATES).length, 6);
  assert.equal(REQUIRED_BRANCH_URL, "https://feature-phase-6-global-harde.qsite1.pages.dev/");
  assert.equal(R1_REQUIRED_BRANCH, "repair/phase-6-r1-validation-closure");
  assert.equal(R1_REQUIRED_PARENT, "aee036740b129624c54b8f1b878229f955d187ae");
  assert.equal(R1_REQUIRED_BRANCH_URL, "https://repair-phase-6-r1-validation.qsite1.pages.dev/");
  assert.ok(Object.values(HUMAN_REVIEW_GATES).every((value) => value === "PENDING HUMAN REVIEW"));
  assert.deepEqual(EVIDENCE_STATUS_VALUES.slice(0, 5), ["PASS", "FAIL", "LIMITATION", "NOT OBSERVED", "PENDING HUMAN REVIEW"]);
  assert.deepEqual(selfTest().status, "PASS");
  assert.equal(selfTest().r1MandatoryArtifactRoles, 5);
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
  const completedStructuredFailure = accessibilityReport("webkit", { failed: true });
  completedStructuredFailure.summary = { ...completedStructuredFailure.summary, axeCases: 20, engineErrors: 0, failures: 51 };
  completedStructuredFailure.failures = [{ check: "native-focus-policy", message: "Implicit links were not reached by Tab." }];
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "accessibility-interaction-limitation", engine: "webkit" }, completedStructuredFailure, metadata));
  const explicitLimitation = accessibilityReport("webkit", { failed: true });
  explicitLimitation.status = "LIMITATION";
  explicitLimitation.limitations = ["The isolated interaction run did not complete."];
  explicitLimitation.failures = [];
  explicitLimitation.summary = { ...explicitLimitation.summary, engineErrors: 0, failures: 0 };
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "accessibility-interaction-limitation", engine: "webkit" }, explicitLimitation, metadata));
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "supplemental-reflow-proxy" }, reflowProxyReport(), metadata));
  const malformedProxy = reflowProxyReport();
  malformedProxy.variants[0].viewports = [{ id: "text-200-proxy-721x450", width: 721, height: 450 }];
  malformedProxy.variants[0].records = [{ route: "/", viewport: { width: 721, height: 450 }, status: "PASS" }];
  assert.throws(() => validateDocumentAuthority({ role: "supplemental-reflow-proxy" }, malformedProxy, metadata), /720x450 reflow proxy authority differs/);
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "regression-summary" }, regressionReport(), metadata));
});

test("legacy BFCache and performance visibility PASS require raw real-event observations", () => {
  const metadata = { evidenceContext: { browserQa: { baseUrl: LOCAL_BASE_URL } } };
  const persistedPair = [
    { type: "pagehide", persisted: true, documentUrl: "https://example.pages.dev/" },
    { type: "pageshow", persisted: true, documentUrl: "https://example.pages.dev/" },
  ];
  const falseBfcache = globalReport("chromium", "false-bfcache");
  falseBfcache.engines[0].history.bfcache.status = "observed";
  falseBfcache.engines[0].history.states = { restored: { lifecycle: [] } };
  assert.throws(() => validateDocumentAuthority({ role: "history-bfcache-summary", engine: "chromium" }, falseBfcache, metadata), /BFCache PASS requires a real ordered/);
  const pairedBfcache = structuredClone(falseBfcache);
  pairedBfcache.engines[0].history.states.restored.lifecycle = persistedPair;
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "history-bfcache-summary", engine: "chromium" }, pairedBfcache, metadata));
  const missingPairUrls = structuredClone(pairedBfcache);
  missingPairUrls.engines[0].history.states.restored.lifecycle = [
    { type: "pagehide", persisted: true, documentId: "same-document" },
    { type: "pageshow", persisted: true, documentId: "same-document" },
  ];
  assert.throws(() => validateDocumentAuthority({ role: "history-bfcache-summary", engine: "chromium" }, missingPairUrls, metadata), /BFCache PASS requires a real ordered/);
  const mismatchedPairUrls = structuredClone(pairedBfcache);
  mismatchedPairUrls.engines[0].history.states.restored.lifecycle[1].documentUrl = "https://example.pages.dev/#entry";
  assert.throws(() => validateDocumentAuthority({ role: "history-bfcache-summary", engine: "chromium" }, mismatchedPairUrls, metadata), /BFCache PASS requires a real ordered/);
  const interruptedPair = structuredClone(pairedBfcache);
  interruptedPair.engines[0].history.states.restored.lifecycle.splice(1, 0, { type: "pagehide", persisted: false, documentUrl: "https://example.pages.dev/" });
  assert.throws(() => validateDocumentAuthority({ role: "history-bfcache-summary", engine: "chromium" }, interruptedPair, metadata), /BFCache PASS requires a real ordered/);

  const performanceBfcache = performanceReport();
  performanceBfcache.history.bfcache = { status: "observed", events: [{ type: "pageshow", persisted: true, documentUrl: "https://example.pages.dev/" }] };
  assert.throws(() => validateDocumentAuthority({ role: "performance-summary" }, performanceBfcache, metadata), /BFCache PASS requires a real ordered/);

  const falseTransition = performanceReport();
  falseTransition.visibility = {
    status: "PASS",
    transitionObserved: false,
    events: [],
    beforeBackground: { visibilityState: "visible" },
    whileBackground: { visibilityState: "visible" },
    afterForeground: { visibilityState: "visible" },
  };
  assert.throws(() => validateDocumentAuthority({ role: "performance-summary" }, falseTransition, metadata), /visibility PASS requires an observed real/);
  const emptyEvents = structuredClone(falseTransition);
  emptyEvents.visibility.transitionObserved = true;
  emptyEvents.visibility.whileBackground.visibilityState = "hidden";
  assert.throws(() => validateDocumentAuthority({ role: "performance-summary" }, emptyEvents, metadata), /visibility PASS requires an observed real/);
  const observedTransition = structuredClone(emptyEvents);
  observedTransition.visibility.events = [
    { type: "visibilitychange", visibilityState: "hidden" },
    { type: "visibilitychange", visibilityState: "visible" },
  ];
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "performance-summary" }, observedTransition, metadata));
});

test("honest R1 NOT OBSERVED lifecycle authority is not overridden by a legacy PASS taxonomy", () => {
  const entries = [
    { role: "history-bfcache-summary", taxonomy: { bfcache: ["PASS"], visibility: ["PASS"] } },
    { role: "performance-summary", taxonomy: { bfcache: ["PASS"], visibility: ["PASS"] } },
    { role: "r1-persistent-lifecycle-summary", taxonomy: { bfcache: ["NOT OBSERVED"], visibility: ["NOT OBSERVED"] } },
  ];
  assert.equal(guardedRequirementAssessment("05-history-bfcache", "BFCache", entries).status, "NOT OBSERVED");
  assert.equal(guardedRequirementAssessment("03-homepage-motion", "hidden/visible behavior", entries).status, "NOT OBSERVED");

  const verifiedHumanPass = [...entries, { role: "physical-device-result", taxonomy: { humanEvidence: { verified: true, hiddenVisible: "PASS" } } }];
  assert.equal(guardedRequirementAssessment("03-homepage-motion", "hidden/visible behavior", verifiedHumanPass).status, "PASS");
  const observedFailure = [...entries, { role: "performance-summary", taxonomy: { visibility: ["FAIL"] } }];
  assert.equal(guardedRequirementAssessment("03-homepage-motion", "hidden/visible behavior", observedFailure).status, "FAIL");
});

test("accessibility PASS requires the exact ten-route interaction matrix, four clean menu cycles and clean history", () => {
  const metadata = { evidenceContext: { browserQa: { baseUrl: LOCAL_BASE_URL } } };
  const record = { role: "accessibility-summary", engine: "chromium" };
  const incompleteKeyboard = accessibilityReport("chromium");
  incompleteKeyboard.engines[0].keyboard.pop();
  assert.throws(() => validateDocumentAuthority(record, incompleteKeyboard, metadata), /keyboard\/focus matrix differs/);

  const duplicateRoute = accessibilityReport("chromium");
  duplicateRoute.engines[0].keyboard[9].route = duplicateRoute.engines[0].keyboard[0].route;
  assert.throws(() => validateDocumentAuthority(record, duplicateRoute, metadata), /keyboard\/focus matrix differs/);

  const shortMenu = accessibilityReport("chromium");
  shortMenu.engines[0].mobileMenu.cycles.pop();
  assert.throws(() => validateDocumentAuthority(record, shortMenu, metadata), /four-cycle authority differs/);

  const menuFailure = accessibilityReport("chromium");
  menuFailure.engines[0].mobileMenu.failures.push({ code: "escape-focus-return" });
  assert.throws(() => validateDocumentAuthority(record, menuFailure, metadata), /four-cycle authority differs/);

  const historyFailure = accessibilityReport("chromium");
  historyFailure.engines[0].history.status = "FAIL";
  historyFailure.engines[0].history.failures.push({ code: "forward" });
  assert.throws(() => validateDocumentAuthority(record, historyFailure, metadata), /history authority differs/);
});

test("guarded requirement statuses reject every known false PASS promotion", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const optionsFor = (metadata) => ({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });
  const cases = [
    ["05-history-bfcache", "BFCache", "NOT OBSERVED"],
    ["03-homepage-motion", "hidden/visible behavior", "NOT OBSERVED"],
    ["09-accessibility", "keyboard", "LIMITATION"],
    ["09-accessibility", "focus", "LIMITATION"],
    ["09-accessibility", "mobile menu", "LIMITATION"],
    ["09-accessibility", "200%", "PENDING HUMAN REVIEW"],
    ["11-physical-device", "real-device results if genuinely performed", "PENDING HUMAN REVIEW"],
  ];
  for (const [section, requirement, observed] of cases) {
    const metadata = structuredClone(fixture.metadata);
    metadata.sections[section].requirements = { [requirement]: { status: "PASS", statement: "Incorrect forced machine PASS." } };
    await assert.rejects(() => buildEvidenceEntries(optionsFor(metadata)), new RegExp(`false PASS promotion rejected.*${observed}`));
  }
  const collapsed = structuredClone(fixture.metadata);
  collapsed.sections["05-history-bfcache"].requirements = { BFCache: { status: "LIMITATION", statement: "Incorrectly collapsed observation." } };
  await assert.rejects(() => buildEvidenceEntries(optionsFor(collapsed)), /false status promotion rejected.*declared LIMITATION, observed NOT OBSERVED/);
});

test("axe-only sources cannot satisfy keyboard, focus or mobile-menu requirements", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  fixture.metadata.artifacts = fixture.metadata.artifacts.filter(({ role }) => role !== "accessibility-interaction-limitation");
  await rewriteArtifactJson(fixture, ({ role }) => role === "accessibility-summary", (document) => { document.axeOnly = true; });
  const built = await buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });
  const summary = JSON.parse(built.entries.find(({ path: evidencePath }) => evidencePath === "09-accessibility/section-summary.json").data);
  for (const requirement of ["keyboard", "focus", "mobile menu"]) {
    assert.equal(summary.requirements.find((record) => record.requirement === requirement).status, "NOT OBSERVED");
  }
  assert.equal(summary.requirements.find((record) => record.requirement === "axe").status, "PASS");
});

test("a completed WebKit run with engineErrors 0 and 51 interaction failures remains FAIL or explicit host LIMITATION in a full build", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const interaction = fixture.metadata.artifacts.find(({ role }) => role === "accessibility-interaction-limitation");
  interaction.status = "FAIL";
  delete interaction.limitation;
  await rewriteArtifactJson(fixture, ({ role }) => role === "accessibility-interaction-limitation", (document) => {
    document.summary = { ...document.summary, axeCases: 20, axeExpected: 20, engineErrors: 0, failures: 51 };
    document.failures = Array.from({ length: 51 }, (_, index) => ({ check: `webkit-focus-${index + 1}`, message: "Native WebKit focus policy did not advance to the expected control." }));
  });
  const built = await buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });
  const summary = JSON.parse(built.entries.find(({ path: evidencePath }) => evidencePath === "09-accessibility/section-summary.json").data);
  assert.equal(summary.requirements.find(({ requirement }) => requirement === "keyboard").status, "FAIL");
  assert.equal(summary.requirements.find(({ requirement }) => requirement === "focus").status, "FAIL");
  assert.equal(summary.requirements.find(({ requirement }) => requirement === "mobile menu").status, "FAIL");
  const webkit = JSON.parse(built.entries.find(({ role }) => role === "accessibility-interaction-limitation").data);
  assert.equal(webkit.payload.summary.engineErrors, 0);
  assert.equal(webkit.payload.summary.failures, 51);
  assert.equal(webkit.payload.failures.length, 51);

  interaction.status = "LIMITATION";
  interaction.limitation = "The completed WebKit run reproduced the host native focus-policy limitation; it is not a site PASS.";
  const limitedBuilt = await buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });
  const limitedSummary = JSON.parse(limitedBuilt.entries.find(({ path: evidencePath }) => evidencePath === "09-accessibility/section-summary.json").data);
  for (const requirement of ["keyboard", "focus", "mobile menu"]) assert.equal(limitedSummary.requirements.find((record) => record.requirement === requirement).status, "LIMITATION");
  const limitedWebkit = JSON.parse(limitedBuilt.entries.find(({ role }) => role === "accessibility-interaction-limitation").data);
  assert.equal(limitedWebkit.status, "LIMITATION");
  assert.equal(limitedWebkit.sourceStatus, "FAIL");
  assert.equal(limitedWebkit.payload.summary.engineErrors, 0);
  assert.equal(limitedWebkit.payload.summary.failures, 51);
});

test("physical PASS requires a complete verified ledger and hash-bound recordings", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const incomplete = { schema: HUMAN_EVIDENCE_SCHEMA, status: "PASS", evidenceClass: "HUMAN DEVICE EVIDENCE", rootExists: true, requiredFilenames: [...REQUIRED_HUMAN_EVIDENCE_FILES], missingFilenames: [], entries: [{ filename: REQUIRED_HUMAN_EVIDENCE_FILES[0] }] };
  assert.throws(() => validateHumanEvidenceLedger(incomplete), /omits or duplicates a required recording/);
  const ledger = await attachVerifiedHumanEvidence(fixture);
  const opening = ledger.entries.find(({ filename }) => filename === "iphone-safari-opening.mp4");
  assert.deepEqual(Object.keys(opening.checks).sort(), [...DEVICE_REVIEW_CHECKS[opening.filename]].sort());
  assert.equal(opening.checks.backgroundForeground, true);
  const zoom = ledger.entries.find(({ filename }) => filename === "chrome-200-percent.mp4");
  assert.equal(zoom.routeOutcomes.length, 10);
  assert.ok(zoom.routeOutcomes.every(({ checks }) => Object.keys(checks).length === 10 && Object.values(checks).every((value) => value === true)));
  const incompleteZoom = structuredClone(ledger);
  delete incompleteZoom.entries.find(({ filename }) => filename === "chrome-200-percent.mp4").routeOutcomes[0].checks.completeH1;
  assert.throws(() => validateHumanEvidenceLedger(incompleteZoom), /genuine 200% route outcome 0 is incomplete/);
  const pendingReview = structuredClone(ledger);
  pendingReview.status = "PENDING HUMAN REVIEW";
  for (const entry of pendingReview.entries) {
    entry.status = "PENDING HUMAN REVIEW";
    delete entry.checks;
    if (entry.filename === "chrome-200-percent.mp4") {
      delete entry.genuineBrowserZoom;
      delete entry.zoomPercent;
      delete entry.proxy;
      delete entry.routeOutcomes;
    }
  }
  assert.equal(validateHumanEvidenceLedger(pendingReview).status, "PENDING HUMAN REVIEW");
  const built = await buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });
  const readSummary = (section) => JSON.parse(built.entries.find(({ path: evidencePath }) => evidencePath === `${section}/section-summary.json`).data);
  assert.ok(readSummary("11-physical-device").requirements.every(({ status }) => status === "PASS"));
  assert.equal(readSummary("09-accessibility").requirements.find(({ requirement }) => requirement === "200%").status, "PASS");
  assert.equal(readSummary("03-homepage-motion").requirements.find(({ requirement }) => requirement === "hidden/visible behavior").status, "PASS");
  const ledgerTaxonomy = built.entries.find(({ role }) => role === "physical-device-result").taxonomy.humanEvidence;
  assert.equal(ledgerTaxonomy.verified, true);
  assert.equal(ledgerTaxonomy.recordings.find(({ filename }) => filename === "iphone-safari-opening.mp4").checks.backgroundForeground, true);
});

test("hidden-visible aggregation combines human and machine sources with observed FAIL dominance", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  await attachVerifiedHumanEvidence(fixture);
  await rewriteArtifactJson(fixture, ({ source }) => source === "final/phase6-performance-final.json", (document) => {
    document.visibility = { status: "FAIL", failures: [{ check: "stale-target-frame" }] };
  });
  const built = await buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });
  const summary = JSON.parse(built.entries.find(({ path: evidencePath }) => evidencePath === "03-homepage-motion/section-summary.json").data);
  assert.equal(summary.requirements.find(({ requirement }) => requirement === "hidden/visible behavior").status, "FAIL");
});

test("human recording ledger bindings reject direct SHA-256, byte-size and status mismatches", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const ledger = await attachVerifiedHumanEvidence(fixture);
  const options = () => ({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });

  const wrongHash = structuredClone(ledger);
  wrongHash.entries[0].sha256 = "f".repeat(64);
  await writeHumanLedger(fixture, wrongHash);
  await assert.rejects(() => buildEvidenceEntries(options()), /hash\/size\/status bound.*iphone-safari-opening\.mp4/);

  const wrongSize = structuredClone(ledger);
  wrongSize.entries[0].byteSize += 1;
  await writeHumanLedger(fixture, wrongSize);
  await assert.rejects(() => buildEvidenceEntries(options()), /hash\/size\/status bound.*iphone-safari-opening\.mp4/);

  const wrongStatus = structuredClone(ledger);
  wrongStatus.entries[0].status = "PENDING HUMAN REVIEW";
  wrongStatus.status = "PENDING HUMAN REVIEW";
  await writeHumanLedger(fixture, wrongStatus);
  await assert.rejects(() => buildEvidenceEntries(options()), /hash\/size\/status bound.*iphone-safari-opening\.mp4/);
});

test("human ledger rejects status drift and any false check without its own addressed failure reference", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const ledger = await attachVerifiedHumanEvidence(fixture);

  const statusDrift = structuredClone(ledger);
  const driftZoom = statusDrift.entries.find(({ filename }) => filename === "chrome-200-percent.mp4");
  driftZoom.routeOutcomes[0].status = "PENDING HUMAN REVIEW";
  assert.throws(() => validateHumanEvidenceLedger(statusDrift), /chrome-200-percent recording status must be PENDING HUMAN REVIEW/);

  const physical = structuredClone(ledger);
  const opening = physical.entries.find(({ filename }) => filename === "iphone-safari-opening.mp4");
  const [first, second] = DEVICE_REVIEW_CHECKS[opening.filename];
  opening.status = "FAIL";
  opening.checks[first] = false;
  opening.checks[second] = false;
  opening.failureReferences = [{ check: first, timestamp: "00:12.000", frame: null, observation: "First failure." }];
  physical.status = "FAIL";
  assert.throws(() => validateHumanEvidenceLedger(physical), new RegExp(`false check ${second} requires a failureReference`));
  opening.failureReferences.push({ check: second, timestamp: null, frame: "F220", observation: "Second failure." });
  assert.equal(validateHumanEvidenceLedger(physical).status, "FAIL");

  const zoomFailure = structuredClone(ledger);
  const zoom = zoomFailure.entries.find(({ filename }) => filename === "chrome-200-percent.mp4");
  const route = zoom.routeOutcomes[0];
  route.status = "FAIL";
  route.checks.completeH1 = false;
  route.checks.completeOpeningProposition = false;
  route.failureReferences = [{ check: "completeH1", timestamp: "00:20.000", frame: null, observation: "H1 failure." }];
  zoom.status = "FAIL";
  zoom.failureReferences = [{ check: "/:completeH1", timestamp: "00:20.000", frame: null, observation: "Route failure." }];
  zoomFailure.status = "FAIL";
  assert.throws(() => validateHumanEvidenceLedger(zoomFailure), /false check completeOpeningProposition requires a failureReference/);
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
  const summaryFor = (section) => summaries.find((summary) => summary.section === section);
  const requirementStatus = (section, requirement) => summaryFor(section).requirements.find((record) => record.requirement === requirement).status;
  assert.equal(summaryFor("05-history-bfcache").status, "NOT OBSERVED");
  assert.equal(requirementStatus("05-history-bfcache", "BFCache"), "NOT OBSERVED");
  assert.equal(summaryFor("03-homepage-motion").status, "NOT OBSERVED");
  assert.equal(requirementStatus("03-homepage-motion", "hidden/visible behavior"), "NOT OBSERVED");
  assert.equal(requirementStatus("09-accessibility", "axe"), "PASS");
  assert.equal(requirementStatus("09-accessibility", "keyboard"), "LIMITATION");
  assert.equal(requirementStatus("09-accessibility", "focus"), "LIMITATION");
  assert.equal(requirementStatus("09-accessibility", "mobile menu"), "LIMITATION");
  assert.equal(requirementStatus("09-accessibility", "200%"), "PENDING HUMAN REVIEW");
  const proxyRequirement = summaryFor("09-accessibility").requirements.find(({ requirement }) => requirement === "200%");
  assert.ok(proxyRequirement.evidence.includes("09-accessibility/720x450-reflow-proxy.json"));
  assert.match(proxyRequirement.statement, /Only the 720×450 reflow proxy is present; it is supplemental/);
  assert.ok(summaryFor("11-physical-device").requirements.every(({ status }) => status === "PENDING HUMAN REVIEW"));
  assert.ok(summaries.flatMap(({ requirements }) => requirements).every(({ status }) => !status.includes("_") && status !== "PENDING HUMAN DEVICE REVIEW"));
  const performance = first.entries.find((entry) => entry.path === "06-performance/performance.json").data.toString("utf8");
  assert.doesNotMatch(performance, /C:\\Users|fixture\\browser/i);
  assert.match(performance, /PRIVATE_PATH/);
  const limitation = JSON.parse(first.entries.find((entry) => entry.path.includes("webkit-interaction-limitation")).data);
  assert.equal(limitation.status, "LIMITATION");
  assert.equal(limitation.sourceStatus, "FAIL");
  assert.equal(first.entries.filter((entry) => entry.role === "poster-side-by-side").length, 3);
  assert.equal(first.entries.filter((entry) => entry.role === "poster-difference").length, 3);
});

test("R1 authority accepts only the repair branch, exact parent, frozen main, 28-character alias and R1 deployment inputs", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  await convertFixtureToR1(fixture);
  const optionsFor = (metadata) => ({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });
  const built = await buildEvidenceEntries(optionsFor(fixture.metadata));
  const authority = JSON.parse(built.entries.find(({ path: evidencePath }) => evidencePath === "00-provenance/repository-authority.json").data);
  assert.equal(authority.repository.branch, R1_REQUIRED_BRANCH);
  assert.equal(authority.repository.exactParent, R1_REQUIRED_PARENT);
  assert.equal(authority.repository.main.local, FROZEN_MAIN);
  const deployment = JSON.parse(built.entries.find(({ role }) => role === "deployment-verifier").data);
  assert.equal(deployment.schema, "quantum-hub.phase-6-r1.deployment-verification.v1");
  assert.equal(deployment.inputs.exactParent, R1_REQUIRED_PARENT);
  assert.equal(deployment.inputs.branchUrl, R1_REQUIRED_BRANCH_URL);
  assert.equal(Object.hasOwn(deployment.inputs, "acceptedBase"), false);
  const motionSummaries = built.entries.filter(({ role }) => role === "r1-motion-summary");
  const motionRecordings = built.entries.filter(({ role }) => role === "r1-motion-recording");
  const persistentLifecycle = built.entries.filter(({ role }) => role === "r1-persistent-lifecycle-summary");
  assert.equal(motionSummaries.length, 2);
  assert.equal(motionRecordings.length, 10);
  assert.equal(persistentLifecycle.length, 1);
  for (const engine of ["chromium", "firefox"]) {
    assert.deepEqual(
      motionRecordings.filter((entry) => entry.engine === engine).map((entry) => entry.media.story),
      R1_MOTION_RECORDING_SPECS.map(({ id }) => id),
    );
    assert.ok(motionRecordings.filter((entry) => entry.engine === engine).every((entry) => entry.media.codec === "h264" && entry.media.fullDecodeValidated));
  }

  const chromiumSummaryRecord = fixture.metadata.artifacts.find((record) => record.role === "r1-motion-summary" && record.engine === "chromium");
  const chromiumReport = JSON.parse(await readFile(path.join(fixture.sourceRoot, ...chromiumSummaryRecord.source.split("/")), "utf8"));
  const wrongStory = structuredClone(chromiumReport);
  wrongStory.recordings[0].id = "wrong-story";
  assert.throws(() => validateDocumentAuthority(chromiumSummaryRecord, wrongStory, fixture.metadata), /five-story identity differs/);
  const wrongCodec = structuredClone(chromiumReport);
  wrongCodec.recordings[0].validation.media.codec = "vp9";
  assert.throws(() => validateDocumentAuthority(chromiumSummaryRecord, wrongCodec, fixture.metadata), /recording contract differs/);
  const incompleteDecode = structuredClone(chromiumReport);
  incompleteDecode.encoder.fullDecodeValidated = false;
  assert.throws(() => validateDocumentAuthority(chromiumSummaryRecord, incompleteDecode, fixture.metadata), /motion report authority differs/);
  const wrongEngine = structuredClone(chromiumReport);
  wrongEngine.browser.engine = "firefox";
  assert.throws(() => validateDocumentAuthority(chromiumSummaryRecord, wrongEngine, fixture.metadata), /motion report authority differs/);
  const diagnosticsPromoted = structuredClone(chromiumReport);
  diagnosticsPromoted.diagnostics = { status: "FAIL", failures: [{ type: "PAGE ERROR" }] };
  diagnosticsPromoted.summary.failures = 1;
  assert.throws(() => validateDocumentAuthority(chromiumSummaryRecord, diagnosticsPromoted, fixture.metadata), /motion report authority differs/);

  const lifecycleRecord = fixture.metadata.artifacts.find(({ role }) => role === "r1-persistent-lifecycle-summary");
  const lifecycleReport = JSON.parse(await readFile(path.join(fixture.sourceRoot, ...lifecycleRecord.source.split("/")), "utf8"));
  const wrongLifecycleSchema = structuredClone(lifecycleReport);
  wrongLifecycleSchema.schema = "quantum-hub.phase-6-r1.persistent-lifecycle.invalid";
  assert.throws(() => validateDocumentAuthority(lifecycleRecord, wrongLifecycleSchema, fixture.metadata), /schema\/browser\/origin authority differs/);
  const hiddenFailurePromoted = structuredClone(lifecycleReport);
  hiddenFailurePromoted.visibility.status = "FAIL";
  assert.throws(() => validateDocumentAuthority(lifecycleRecord, hiddenFailurePromoted, fixture.metadata), /visibility status must be NOT OBSERVED/);
  const hiddenManifestoPromoted = structuredClone(lifecycleReport);
  hiddenManifestoPromoted.history.checks.bareBackNoManifestoReplay = false;
  assert.throws(() => validateDocumentAuthority(lifecycleRecord, hiddenManifestoPromoted, fixture.metadata), /history check bareBackNoManifestoReplay contradicts raw states/);
  const hiddenManifestoRawContradiction = structuredClone(lifecycleReport);
  hiddenManifestoRawContradiction.history.states.bareBack.home.manifestoReveal = "hidden";
  assert.throws(() => validateDocumentAuthority(lifecycleRecord, hiddenManifestoRawContradiction, fixture.metadata), /history check bareBackNoManifestoReplay contradicts raw states/);
  const duplicateMediaPromoted = structuredClone(lifecycleReport);
  duplicateMediaPromoted.mediaRequests.noDuplicateNonRangeRequests = false;
  assert.throws(() => validateDocumentAuthority(lifecycleRecord, duplicateMediaPromoted, fixture.metadata), /noDuplicateNonRangeRequests contradicts raw non-range selections/);
  const duplicateMediaRawContradiction = structuredClone(lifecycleReport);
  duplicateMediaRawContradiction.mediaRequests.network.phase4Requests = [
    { path: "/media/cinematic/phase-4r2/media/mobile.mp4", range: null },
    { path: "/media/cinematic/phase-4r2/media/mobile.mp4", range: null },
    { path: "/media/cinematic/phase-4r2/media/mobile.mp4", range: null },
  ];
  duplicateMediaRawContradiction.mediaRequests.network.requestCount = 3;
  duplicateMediaRawContradiction.mediaRequests.network.rangeRequestCount = 0;
  duplicateMediaRawContradiction.mediaRequests.network.nonRangeRequestCount = 3;
  duplicateMediaRawContradiction.mediaRequests.network.nonRangeSelections = [{ path: "/media/cinematic/phase-4r2/media/mobile.mp4", count: 3, logicalHomeDocuments: 2 }];
  assert.throws(() => validateDocumentAuthority(lifecycleRecord, duplicateMediaRawContradiction, fixture.metadata), /noDuplicateNonRangeRequests contradicts raw non-range selections/);

  const missingLifecycle = structuredClone(fixture.metadata);
  missingLifecycle.artifacts = missingLifecycle.artifacts.filter(({ role }) => role !== "r1-persistent-lifecycle-summary");
  await assert.rejects(() => buildEvidenceEntries(optionsFor(missingLifecycle)), /mandatory evidence role is missing: r1-persistent-lifecycle-summary/);

  const missingHumanEvidence = structuredClone(fixture.metadata);
  missingHumanEvidence.artifacts = missingHumanEvidence.artifacts.filter(({ role }) => !["physical-device-result", "physical-device-recording"].includes(role));
  await assert.rejects(() => buildEvidenceEntries(optionsFor(missingHumanEvidence)), /mandatory evidence role is missing: physical-device-result/);

  await rewriteR1MotionReport(fixture, "chromium", (document) => { document.recordings[0].byteSize += 1; });
  await assert.rejects(() => buildEvidenceEntries(optionsFor(fixture.metadata)), /R1 motion video\/report binding differs/);
  await rewriteR1MotionReport(fixture, "chromium", () => structuredClone(chromiumReport));
  await rewriteR1MotionReport(fixture, "chromium", (document) => { document.recordings[0].sha256 = "f".repeat(64); });
  await assert.rejects(() => buildEvidenceEntries(optionsFor(fixture.metadata)), /R1 motion video\/report binding differs/);
  await rewriteR1MotionReport(fixture, "chromium", () => structuredClone(chromiumReport));

  const wrongParent = structuredClone(fixture.metadata);
  wrongParent.repository.exactParent = REQUIRED_PARENT;
  await assert.rejects(() => buildEvidenceEntries(optionsFor(wrongParent)), /final repository authority differs/);
  const wrongMain = structuredClone(fixture.metadata);
  wrongMain.repository.main.local = "0".repeat(40);
  await assert.rejects(() => buildEvidenceEntries(optionsFor(wrongMain)), /frozen main authority differs/);
  const wrongAlias = structuredClone(fixture.metadata);
  wrongAlias.deployment.branchUrl = "https://repair-phase-6-r1-validation-c.qsite1.pages.dev/";
  await assert.rejects(() => buildEvidenceEntries(optionsFor(wrongAlias)), /deployment URL\/UUID binding differs/);

  await rewriteArtifactJson(fixture, ({ role }) => role === "deployment-verifier", (document) => {
    document.inputs.acceptedBase = document.inputs.exactParent;
    delete document.inputs.exactParent;
  });
  await assert.rejects(() => buildEvidenceEntries(optionsFor(fixture.metadata)), /deployment-verifier authority differs from final metadata/);
});

test("R1 persistent lifecycle rejects every raw-history, BFCache, visibility, listener and media false PASS", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  await convertFixtureToR1(fixture);
  const record = fixture.metadata.artifacts.find(({ role }) => role === "r1-persistent-lifecycle-summary");
  const report = JSON.parse(await readFile(path.join(fixture.sourceRoot, ...record.source.split("/")), "utf8"));
  const validate = (document) => validateDocumentAuthority(record, document, fixture.metadata);
  assert.doesNotThrow(() => validate(report));

  const staticRestoredHistory = structuredClone(report);
  staticRestoredHistory.history.states.bareManifesto.home.continuation = { partnerLink: { top: 360, visible: true } };
  staticRestoredHistory.history.states.bareBack = {
    ...staticRestoredHistory.history.states.bareBack,
    documentId: "bare-static-document",
    maximumScroll: 11_970,
    scrollY: 1_581,
    home: {
      bootstrap: "restored-scroll",
      continuation: { audienceRouting: { inert: false }, partnerLink: { top: 361, visible: true } },
      eligibility: "bypass",
      fallback: null,
      header: "released",
      interactive: "true",
      manifesto: { rendered: true, text: "We turn industrial needs into field evidence." },
      manifestoReveal: null,
      mode: "static",
      phase: "fallback",
      routeNavigation: "released",
      source: { hasSource: false },
    },
    probe: {
      ...staticRestoredHistory.history.states.bareBack.probe,
      navigation: { type: "back_forward", notRestoredReasons: null },
      resources: [],
    },
  };
  staticRestoredHistory.listeners.comparisons = staticRestoredHistory.listeners.comparisons.filter(({ name }) => name !== "bare-back");
  const staticRestorationPhase4Path = staticRestoredHistory.mediaRequests.documents.find(({ documentId }) => documentId === "bare-document").paths[0];
  staticRestoredHistory.mediaRequests.documents = [
    { documentId: "bare-document", labels: ["bare-home", "bare-home-manifesto"], mediaExpected: true, modes: ["enhanced"], paths: [staticRestorationPhase4Path], resourceObservations: 1, sourceFree: false },
    { documentId: "bare-static-document", labels: ["bare-back"], mediaExpected: false, modes: ["static"], paths: [], resourceObservations: 0, sourceFree: true },
    staticRestoredHistory.mediaRequests.documents.find(({ documentId }) => documentId === "entry-document"),
  ];
  assert.equal(staticRestoredHistory.bfcache.status, "NOT OBSERVED");
  assert.doesNotThrow(() => validate(staticRestoredHistory), "intentional static/restored-scroll Back was rejected by the assembler");

  const headlessHostAttempt = structuredClone(report);
  headlessHostAttempt.browser.headed = false;
  assert.throws(() => validate(headlessHostAttempt), /schema\/browser\/origin authority differs/);

  for (const stateKey of [
    "bare",
    "bareManifesto",
    "supportAfterBare",
    "bareBack",
    "supportForward",
    "entryInitial",
    "entryResolved",
    "supportAfterEntry",
    "entryBack",
    "entryForward",
  ]) {
    const missingState = structuredClone(report);
    delete missingState.history.states[stateKey];
    assert.throws(() => validate(missingState), /history states inventory is incomplete/, `missing raw state ${stateKey} was accepted`);
  }

  const rawHistoryContradictions = {
    bareCorrect: (document) => { document.history.states.bare.url = "/wrong/"; },
    bareBackCorrect: (document) => { document.history.states.bareBack.scrollY += 10; },
    bareBackNoManifestoReplay: (document) => { document.history.states.bareBack.home.manifestoReveal = "hidden"; },
    bareForwardCorrect: (document) => { document.history.states.supportForward.url = "/wrong/"; },
    entryCorrect: (document) => { document.history.states.entryResolved.url = "/"; },
    entryBackCorrect: (document) => { document.history.states.entryBack.scrollY += 10; },
    entryBackManifestoResolved: (document) => { document.history.states.entryBack.home.manifestoReveal = "hidden"; },
    entryForwardCorrect: (document) => { document.history.states.entryForward.scrollY += 10; },
    menuClosed: (document) => { document.history.states.entryForward.mobileMenu.open = true; },
  };
  for (const [check, contradict] of Object.entries(rawHistoryContradictions)) {
    const falsePass = structuredClone(report);
    contradict(falsePass);
    assert.throws(
      () => validate(falsePass),
      new RegExp(`history check ${check} contradicts raw states`),
      `${check} PASS was not bound to its raw states`,
    );
  }

  const persistedEvents = [
    { type: "pagehide", persisted: true, documentId: "bare-document", href: new URL("/", R1_REQUIRED_BRANCH_URL).href, documentEventSequence: 1 },
    { type: "pageshow", persisted: true, documentId: "bare-document", href: new URL("/", R1_REQUIRED_BRANCH_URL).href, documentEventSequence: 2 },
    { type: "pagehide", persisted: true, documentId: "entry-document", href: new URL("/#entry", R1_REQUIRED_BRANCH_URL).href, documentEventSequence: 1 },
    { type: "pageshow", persisted: true, documentId: "entry-document", href: new URL("/#entry", R1_REQUIRED_BRANCH_URL).href, documentEventSequence: 2 },
  ];
  const pairedBfcache = {
    status: "PASS",
    persistedEvents,
    notRestoredReasons: structuredClone(report.bfcache.notRestoredReasons),
    pairedRestorations: [
      { pagehide: persistedEvents[0], pageshow: persistedEvents[1], stateKey: "bareBack" },
      { pagehide: persistedEvents[2], pageshow: persistedEvents[3], stateKey: "entryBack" },
    ],
    scenarios: [
      { departureKey: "bareManifesto", stateKey: "bareBack", expectedRoute: "/", status: "PASS", pair: { pagehide: persistedEvents[0], pageshow: persistedEvents[1] }, coherent: true },
      { departureKey: "entryResolved", stateKey: "entryBack", expectedRoute: "/#entry", status: "PASS", pair: { pagehide: persistedEvents[2], pageshow: persistedEvents[3] }, coherent: true },
    ],
    statement: "Two real persisted restoration pairs were observed.",
  };
  const withPairedBfcache = structuredClone(report);
  withPairedBfcache.history.events = persistedEvents;
  withPairedBfcache.history.states.entryForward.probe.events = structuredClone(persistedEvents);
  withPairedBfcache.bfcache = pairedBfcache;
  withPairedBfcache.history.bfcache = structuredClone(pairedBfcache);
  assert.doesNotThrow(() => validate(withPairedBfcache));

  const promotedWithoutPairs = structuredClone(report);
  promotedWithoutPairs.bfcache.status = "PASS";
  promotedWithoutPairs.history.bfcache = structuredClone(promotedWithoutPairs.bfcache);
  assert.throws(() => validate(promotedWithoutPairs), /BFCache status must be NOT OBSERVED/);

  const detachedPersistedLedger = structuredClone(withPairedBfcache);
  detachedPersistedLedger.bfcache.persistedEvents = [];
  detachedPersistedLedger.history.bfcache = structuredClone(detachedPersistedLedger.bfcache);
  assert.throws(() => validate(detachedPersistedLedger), /BFCache persisted-event ledger contradicts raw evidence/);

  const detachedPairLedger = structuredClone(withPairedBfcache);
  detachedPairLedger.bfcache.pairedRestorations = [];
  detachedPairLedger.history.bfcache = structuredClone(detachedPairLedger.bfcache);
  assert.throws(() => validate(detachedPairLedger), /BFCache paired-restoration ledger contradicts raw evidence/);

  const detachedScenario = structuredClone(withPairedBfcache);
  Object.assign(detachedScenario.bfcache.scenarios[0], { status: "NOT OBSERVED", pair: null, coherent: null });
  detachedScenario.history.bfcache = structuredClone(detachedScenario.bfcache);
  assert.throws(() => validate(detachedScenario), /BFCache scenario ledger contradicts raw evidence/);

  const detachedHistoryEventLedger = structuredClone(withPairedBfcache);
  detachedHistoryEventLedger.history.events = [];
  assert.throws(() => validate(detachedHistoryEventLedger), /history event ledger contradicts raw evidence/);

  const emptyRawHistory = structuredClone(withPairedBfcache);
  emptyRawHistory.history.events = [];
  emptyRawHistory.history.states.entryForward.probe.events = [];
  assert.throws(() => validate(emptyRawHistory), /BFCache persisted-event ledger contradicts raw evidence/);

  const missingNotRestoredReasons = structuredClone(report);
  delete missingNotRestoredReasons.bfcache.notRestoredReasons;
  missingNotRestoredReasons.history.bfcache = structuredClone(missingNotRestoredReasons.bfcache);
  assert.throws(() => validate(missingNotRestoredReasons), /BFCache not-restored-reasons ledger contradicts raw evidence/);

  const forgedNotRestoredReasons = structuredClone(report);
  forgedNotRestoredReasons.bfcache.notRestoredReasons.bare = { reason: "forged" };
  forgedNotRestoredReasons.history.bfcache = structuredClone(forgedNotRestoredReasons.bfcache);
  assert.throws(() => validate(forgedNotRestoredReasons), /BFCache not-restored-reasons ledger contradicts raw evidence/);

  const reloadedRawState = structuredClone(withPairedBfcache);
  reloadedRawState.history.states.bareBack.documentId = "reloaded-document";
  assert.throws(() => validate(reloadedRawState), /history check bareBackCorrect contradicts raw states|BFCache paired-restoration ledger contradicts raw evidence|BFCache scenario ledger contradicts raw evidence/);

  const observationPass = {
    status: "PASS",
    checks: {
      sameDocument: true,
      sequenceBound: true,
      beforeVisible: true,
      hiddenObserved: true,
      visibleRestored: true,
      orderedVisibilityEvents: true,
    },
    transitionEvents: [],
  };
  const visibilityWithoutTransition = structuredClone(report);
  visibilityWithoutTransition.visibility.status = "PASS";
  for (const scenario of visibilityWithoutTransition.visibility.scenarios) {
    Object.assign(scenario, {
      status: "PASS",
      observation: structuredClone(observationPass),
      checks: { transitionObserved: true },
      failedChecks: [],
      unavailableChecks: [],
      transition: null,
    });
  }
  assert.throws(() => validate(visibilityWithoutTransition), /visibility raw observation home-current contradicts raw evidence/);

  const visibilityWithoutEvents = structuredClone(visibilityWithoutTransition);
  const visibilityTransitionFields = {
    "home-current": "current",
    "home-manifesto": "manifesto",
    "maradin-release": "maradin",
    "maradin-retry-release": "maradinRetry",
  };
  for (const scenario of visibilityWithoutEvents.visibility.scenarios) {
    const documentId = `${scenario.name}-document`;
    scenario.transition = {
      before: { documentId, visibilityState: "visible", probe: { documentEventSequence: 0, events: [], listeners: { active: 1, activeByType: {}, duplicateAttempts: 0 } } },
      hidden: { documentId, visibilityState: "hidden", probe: { documentEventSequence: 0, events: [], listeners: { active: 1, activeByType: {}, duplicateAttempts: 0 } } },
      visible: { documentId, visibilityState: "visible", probe: { documentEventSequence: 0, events: [], listeners: { active: 1, activeByType: {}, duplicateAttempts: 0 } } },
    };
    visibilityWithoutEvents.visibility[visibilityTransitionFields[scenario.name]] = structuredClone(scenario.transition);
  }
  assert.throws(() => validate(visibilityWithoutEvents), /visibility raw observation home-current contradicts raw evidence/);

  const visibilityWithReversedEventOrder = structuredClone(visibilityWithoutEvents);
  for (const scenario of visibilityWithReversedEventOrder.visibility.scenarios) {
    const { documentId } = scenario.transition.before;
    scenario.transition.hidden.probe.documentEventSequence = 1;
    scenario.transition.visible.probe.documentEventSequence = 2;
    scenario.transition.visible.probe.events = [
      { type: "visibilitychange", visibilityState: "hidden", documentId, documentEventSequence: 2 },
      { type: "visibilitychange", visibilityState: "visible", documentId, documentEventSequence: 1 },
    ];
    visibilityWithReversedEventOrder.visibility[visibilityTransitionFields[scenario.name]] = structuredClone(scenario.transition);
  }
  assert.throws(() => validate(visibilityWithReversedEventOrder), /visibility raw observation home-current contradicts raw evidence/);

  for (const scenarioName of Object.keys(visibilityTransitionFields)) {
    const forgedVisibilityChecks = structuredClone(report);
    forgedVisibilityChecks.visibility.status = "PASS";
    const scenario = forgedVisibilityChecks.visibility.scenarios.find(({ name }) => name === scenarioName);
    scenario.status = "PASS";
    scenario.checks = Object.fromEntries(Object.keys(scenario.checks).map((check) => [check, true]));
    scenario.failedChecks = [];
    scenario.unavailableChecks = [];
    assert.throws(
      () => validate(forgedVisibilityChecks),
      new RegExp(`visibility lifecycle checks ${scenarioName} contradicts raw evidence`),
      `${scenarioName} accepted forged true lifecycle checks over null raw snapshots`,
    );
  }

  const listenerSummaryWithoutRawBinding = structuredClone(report);
  listenerSummaryWithoutRawBinding.listeners.status = "NOT OBSERVED";
  listenerSummaryWithoutRawBinding.listeners.comparisons = [];
  assert.throws(() => validate(listenerSummaryWithoutRawBinding), /listener comparison ledger contradicts raw evidence/);

  const duplicateListenerHiddenBySummary = structuredClone(report);
  duplicateListenerHiddenBySummary.history.states.bareBack.probe.listeners.duplicateAttempts = 1;
  assert.throws(() => validate(duplicateListenerHiddenBySummary), /duplicate-listener document ledger contradicts raw evidence/);

  const omittedMediaDocument = structuredClone(report);
  omittedMediaDocument.mediaRequests.documents.pop();
  assert.throws(() => validate(omittedMediaDocument), /media document ledger contradicts raw evidence/);

  const inventedMediaDocument = structuredClone(report);
  inventedMediaDocument.mediaRequests.documents.push({
    documentId: "invented-home-document",
    labels: ["invented-home"],
    paths: [inventedMediaDocument.mediaRequests.documents[0].paths[0]],
    resourceObservations: 1,
  });
  assert.throws(() => validate(inventedMediaDocument), /media document ledger contradicts raw evidence/);

  const forgedMediaLabel = structuredClone(report);
  forgedMediaLabel.mediaRequests.documents[0].labels[0] = "forged-home-label";
  assert.throws(() => validate(forgedMediaLabel), /media document ledger contradicts raw evidence/);

  const forgedMediaPath = structuredClone(report);
  forgedMediaPath.mediaRequests.documents[0].paths[0] = "/media/cinematic/phase-4r2/media/desktop.mp4";
  assert.throws(() => validate(forgedMediaPath), /media document ledger contradicts raw evidence/);

  const changedRawStartTime = structuredClone(report);
  changedRawStartTime.history.states.bareBack.probe.resources[0].startTime += 1;
  assert.throws(() => validate(changedRawStartTime), /media document ledger contradicts raw evidence/);

  const inventedDocumentMasksDuplicateRequests = structuredClone(report);
  const maskedPath = inventedDocumentMasksDuplicateRequests.mediaRequests.documents[0].paths[0];
  inventedDocumentMasksDuplicateRequests.mediaRequests.documents.push({
    documentId: "invented-home-document",
    labels: ["invented-home"],
    paths: [maskedPath],
    resourceObservations: 1,
  });
  inventedDocumentMasksDuplicateRequests.mediaRequests.network.phase4Requests = [
    { path: maskedPath, range: null },
    { path: maskedPath, range: null },
    { path: maskedPath, range: null },
  ];
  Object.assign(inventedDocumentMasksDuplicateRequests.mediaRequests.network, {
    requestCount: 3,
    rangeRequestCount: 0,
    nonRangeRequestCount: 3,
    nonRangeSelections: [{ path: maskedPath, count: 3, logicalHomeDocuments: 3 }],
    uniquePaths: [maskedPath],
  });
  assert.throws(() => validate(inventedDocumentMasksDuplicateRequests), /media document ledger contradicts raw evidence/);

  const noObservedMedia = structuredClone(report);
  for (const state of Object.values(noObservedMedia.history.states)) {
    if (state.home) state.probe.resources = [];
  }
  noObservedMedia.mediaRequests.documents = noObservedMedia.mediaRequests.documents.map(({ documentId, labels }) => ({
    documentId,
    labels,
    mediaExpected: true,
    modes: ["enhanced"],
    paths: [],
    resourceObservations: 0,
    sourceFree: false,
  }));
  Object.assign(noObservedMedia.mediaRequests.network, {
    phase4Requests: [],
    requestCount: 0,
    rangeRequestCount: 0,
    nonRangeRequestCount: 0,
    nonRangeSelections: [],
    uniquePaths: [],
  });
  assert.throws(() => validate(noObservedMedia), /expectedPhase4Present contradicts raw documents\/requests/);

  const duplicateDocumentSelection = structuredClone(report);
  const secondPhase4Path = "/media/cinematic/phase-4r2/media/desktop.mp4";
  duplicateDocumentSelection.history.states.bareBack.probe.resources.push({ url: secondPhase4Path, startTime: 11 });
  duplicateDocumentSelection.mediaRequests.documents[0].paths = [secondPhase4Path, duplicateDocumentSelection.mediaRequests.documents[0].paths[0]].sort();
  duplicateDocumentSelection.mediaRequests.documents[0].resourceObservations = 2;
  duplicateDocumentSelection.mediaRequests.network.phase4Requests.push({ path: secondPhase4Path, range: "bytes=0-1023" });
  duplicateDocumentSelection.mediaRequests.network.requestCount = 2;
  duplicateDocumentSelection.mediaRequests.network.rangeRequestCount = 2;
  duplicateDocumentSelection.mediaRequests.network.uniquePaths = [secondPhase4Path, report.mediaRequests.documents[0].paths[0]].sort();
  assert.throws(() => validate(duplicateDocumentSelection), /noDuplicateSourceWithinDocument contradicts raw document selections/);

  const selectedWithoutObservation = structuredClone(report);
  selectedWithoutObservation.mediaRequests.documents[0].resourceObservations = 0;
  assert.throws(() => validate(selectedWithoutObservation), /media document ledger contradicts raw evidence/);

  const duplicateNonRangeSelection = structuredClone(report);
  const selectedPath = duplicateNonRangeSelection.mediaRequests.documents[0].paths[0];
  duplicateNonRangeSelection.mediaRequests.network.phase4Requests = [
    { path: selectedPath, range: null },
    { path: selectedPath, range: null },
    { path: selectedPath, range: null },
  ];
  Object.assign(duplicateNonRangeSelection.mediaRequests.network, {
    requestCount: 3,
    rangeRequestCount: 0,
    nonRangeRequestCount: 3,
    nonRangeSelections: [{ path: selectedPath, count: 3, logicalHomeDocuments: 2 }],
    uniquePaths: [selectedPath],
  });
  assert.throws(() => validate(duplicateNonRangeSelection), /noDuplicateNonRangeRequests contradicts raw non-range selections/);

  const detachedNonRangeLedger = structuredClone(report);
  detachedNonRangeLedger.mediaRequests.network.nonRangeSelections = [{ path: selectedPath, count: 1, logicalHomeDocuments: 2 }];
  assert.throws(() => validate(detachedNonRangeLedger), /non-range media selection ledger contradicts raw evidence/);

  const falseNetworkSummary = structuredClone(report);
  falseNetworkSummary.mediaRequests.network.requestCount += 1;
  assert.throws(() => validate(falseNetworkSummary), /network requestCount contradicts raw Phase 4 requests/);

  const nonPhase4RawRequest = structuredClone(report);
  nonPhase4RawRequest.mediaRequests.network.phase4Requests[0].path = "/media/unrelated.mp4";
  assert.throws(() => validate(nonPhase4RawRequest), /raw Phase 4 request ledger differs/);
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
  assert.ok(template.sourceInventory.find((record) => record.path === "final/baseline-responsive-accessibility.json").compatibleRoles.includes("supplemental-reflow-proxy"));
  assert.doesNotMatch(stableJson(template), new RegExp(fixture.parent.replaceAll("\\", "\\\\"), "i"));

  const r1Template = await createMetadataTemplate(fixture.sourceRoot, GENERATED_AT, "phase6-r1");
  assert.equal(r1Template.authorityProfile, "phase6-r1");
  assert.equal(r1Template.authorityConstants.requiredBranch, R1_REQUIRED_BRANCH);
  assert.equal(r1Template.authorityConstants.requiredParent, R1_REQUIRED_PARENT);
  assert.equal(r1Template.authorityConstants.requiredBranchUrl, R1_REQUIRED_BRANCH_URL);
  assert.equal(r1Template.authorityConstants.deploymentSchema, "quantum-hub.phase-6-r1.deployment-verification.v1");
  assert.equal(r1Template.repository.branch, R1_REQUIRED_BRANCH);
  assert.equal(r1Template.deployment.branchUrl, R1_REQUIRED_BRANCH_URL);
});

test("fails closed for missing posters, missing roles, bad hashes, private secrets and duplicate payloads", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  await assert.rejects(() => buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata }), /poster-study-directory is mandatory/);
  const missingRole = structuredClone(fixture.metadata);
  missingRole.artifacts = missingRole.artifacts.filter((record) => record.role !== "history-bfcache-summary");
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
