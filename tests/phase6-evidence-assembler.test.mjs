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
  R1_TOOLING_REPORT_FILES,
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
  evidenceTaxonomy,
  generatePosterEvidence,
  guardedRequirementAssessment,
  parseArguments,
  selfTest,
  sanitizeJsonValue,
  sha256,
  stableJson,
  validateDocumentAuthority,
  validateEvidenceEntries,
  validateFinalMetadata,
  validateHumanEvidenceLedger,
} from "../scripts/assemble-phase6-final-evidence.mjs";
import { DEVICE_REVIEW_CHECKS, HUMAN_EVIDENCE_POLICY } from "../scripts/ingest-phase6-r1-human-evidence.mjs";
import {
  ACCESSIBILITY_VIEWPORTS,
  historyFailures as accessibilityHistoryFailures,
  keyboardFailures as accessibilityKeyboardFailures,
  mobileMenuFailures as accessibilityMobileMenuFailures,
} from "../scripts/qa-phase6-accessibility-interactions.mjs";
import {
  PACKAGE_SCHEMA,
  REPORT_SPECS,
  REQUIRED_ARCHIVE_FILENAME,
  REQUIRED_REMOTE_URL,
  REQUIRED_REPOSITORY,
  buildPackageArtifacts,
} from "../scripts/package-phase6-human-review.mjs";
import { auditBuffers } from "../scripts/audit-phase6-human-review-package.mjs";
import {
  HTML_AUTHORITY_FILES,
  PUBLIC_ROUTE_OUTCOMES,
  REQUIRED_HEADER_POLICIES,
  canonicalForDistFile,
  publicPathForDistFile,
} from "../scripts/verify-phase6-deployment.mjs";
import { EXPECTED_R1_CHANGED_PATH_RECORDS } from "../scripts/verify-phase6-r1-deployment.mjs";

const GENERATED_AT = "2026-08-30T14:00:00.000Z";
const FINAL_HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const R1_FINAL_HEAD = "dddddddddddddddddddddddddddddddddddddddd";
const R1_FINAL_TREE = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
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

function accessibilityFocus(key = "a|/target|Target") {
  return {
    classes: [], focusVisible: true, href: "/target", key, outlineStyle: "solid", outlineWidth: "2px",
    rect: { bottom: 80, height: 44, left: 10, right: 110, top: 36, width: 100 }, selector: "a.target", tag: "a", text: "Target", visible: true,
  };
}

function accessibilityDesktopHome(routePath) {
  return {
    activationError: null,
    arrival: { entryInert: false, hash: "#entry", manifestoReveal: "resolved", path: "/", route: "/#entry" },
    back: { entryInert: false, hash: "", manifestoReveal: "resolved", path: routePath, route: routePath },
    backError: null,
    focus: { ...accessibilityFocus("a|/#entry|Home"), href: "/#entry" },
    forward: { entryInert: false, hash: "#entry", manifestoReveal: "resolved", path: "/", route: "/#entry" },
    forwardError: null,
    preparation: routePath === "/" ? {
      input: "NATIVE WHEEL",
      ready: true,
      resolved: true,
      state: { cinematicMode: "enhanced", entryInert: false, hash: "", manifestoReveal: "resolved", mediaState: "ready", path: "/", route: "/" },
      wheelSteps: 12,
    } : null,
  };
}

function accessibilityKeyboardRow(engine, route) {
  const expectedHash = route.id === "home" ? "#entry" : "#main-content";
  const forwardFirst = route.id === "home"
    ? { ...accessibilityFocus("a|/for-partners/|For partners"), classes: ["audience-trajectory"], href: "/for-partners/" }
    : accessibilityFocus("a|/one|One");
  const forwardSecond = route.id === "home"
    ? { ...accessibilityFocus("a|/for-startups/|For startups"), classes: ["audience-trajectory"], href: "/for-startups/" }
    : accessibilityFocus("a|/two|Two");
  const row = {
    afterActivation: { activeId: expectedHash.slice(1), hash: expectedHash, targetVisible: true },
    backward: { ...forwardFirst }, desktopHome: accessibilityDesktopHome(route.path), engine, expectedHash,
    first: { ...accessibilityFocus(`a|${expectedHash}|Skip to content`), classes: ["skip-link"], href: expectedHash }, firstVisibilityReady: true,
    forwardFirst, forwardSecond, route: route.id, routePath: route.path,
  };
  row.failures = accessibilityKeyboardFailures(row);
  row.status = row.failures.length ? "FAIL" : "PASS";
  return row;
}

function accessibilityMenuRow(engine) {
  const closed = { activeIsTrigger: true, ariaExpanded: "false", hash: "", open: false, path: "/about/" };
  const open = { activeIsTrigger: true, ariaExpanded: "true", hash: "", open: true, path: "/about/" };
  const row = {
    cycles: Array.from({ length: 4 }, () => ({ close: { ...closed }, open: { ...open } })), engine,
    escapeClose: { ...closed }, firstMenuLink: accessibilityFocus("a|/#entry|Home"),
    navigation: { activationError: null, arrival: { activeIsTrigger: false, ariaExpanded: "false", hash: "#entry", open: false, path: "/" }, back: { ...closed }, backError: null, focus: { ...accessibilityFocus("a|/#entry|Home"), href: "/#entry" } },
    ordinaryClose: { ...closed }, ordinaryOpen: { ...open }, triggerFocus: accessibilityFocus("summary||Menu"),
  };
  row.failures = accessibilityMobileMenuFailures(row);
  row.status = row.failures.length ? "FAIL" : "PASS";
  return row;
}

function accessibilityHistoryRow(engine) {
  const row = {
    back: { entryAlignmentDelta: null, hash: "", path: "/", scrollY: 0 },
    bare: { entryAlignmentDelta: null, hash: "", path: "/", scrollY: 0 }, engine,
    entry: { entryAlignmentDelta: 0, hash: "#entry", path: "/", scrollY: 4200 },
    forward: { entryAlignmentDelta: 0, hash: "#entry", path: "/", scrollY: 4200 },
  };
  row.failures = accessibilityHistoryFailures(row);
  row.status = row.failures.length ? "FAIL" : "PASS";
  return row;
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
  const axe = ACCESSIBILITY_VIEWPORTS.flatMap((viewport) => routes.map((route) => ({ engine, failures: [], httpStatus: route.expectedStatus, incompleteCount: 0, route: route.id, status: "PASS", violations: [], viewport: { ...viewport } })));
  const keyboard = axeOnly ? [] : routes.map((route) => accessibilityKeyboardRow(engine, route));
  if (failed) {
    const mutations = [];
    for (const row of keyboard) {
      mutations.push(
        () => { row.first.focusVisible = false; },
        () => { row.first.href = "#wrong"; },
        () => { row.afterActivation.hash = "#wrong"; },
        () => { row.forwardSecond.focusVisible = false; },
        () => { row.backward.key = "wrong"; },
        () => { row.desktopHome.activationError = "waitForURL timed out"; },
        () => { row.desktopHome.backError = "goBack timed out"; },
        () => { row.desktopHome.forwardError = "goForward timed out"; },
        () => { row.desktopHome.focus.href = "/wrong"; },
        () => { row.desktopHome.arrival.hash = ""; },
        () => { row.desktopHome.back.route = "/wrong/"; },
        () => { row.desktopHome.forward.hash = ""; },
      );
    }
    for (const mutate of mutations.slice(0, 51)) mutate();
    for (const row of keyboard) {
      row.failures = accessibilityKeyboardFailures(row);
      row.status = row.failures.length ? "FAIL" : "PASS";
    }
    assert.equal(keyboard.reduce((sum, row) => sum + row.failures.length, 0), 51);
  }
  const mobileMenu = axeOnly ? null : accessibilityMenuRow(engine);
  const history = axeOnly ? null : accessibilityHistoryRow(engine);
  const engineFailures = [
    ...axe.flatMap((row) => row.failures.map((failure) => ({ section: "axe", route: row.route, viewport: row.viewport.id, ...failure }))),
    ...keyboard.flatMap((row) => row.failures.map((failure) => ({ section: "keyboard", route: row.route, ...failure }))),
    ...(mobileMenu?.failures ?? []).map((failure) => ({ section: "mobile-menu", ...failure })),
    ...(history?.failures ?? []).map((failure) => ({ section: "history", ...failure })),
  ];
  const engineResult = {
    axe,
    browser: { engine, executable: `${engine}.exe`, headed: false, version: "1" },
    engine,
    failures: engineFailures,
    history,
    keyboard,
    mobileMenu,
    status: engineFailures.length ? "FAIL" : "PASS",
    summary: { axeCases: 20, axeViolations: 0, failures: engineFailures.length, keyboardCases: keyboard.length, seriousCritical: 0 },
  };
  return {
    schema: "quantum-hub.phase-6.accessibility-interactions.v1",
    status: failed ? "FAIL" : "PASS",
    baseUrl: LOCAL_BASE_URL,
    engine,
    selectedEngines: [engine],
    engines: [engineResult],
    axeOnly,
    failures: engineFailures.map((failure) => ({ engine, ...failure })),
    routes,
    status: engineFailures.length ? "FAIL" : "PASS",
    summary: { axeCases: 20, axeExpected: 20, axeViolations: 0, engineErrors: 0, failures: engineFailures.length, seriousCritical: 0 },
    viewports: ACCESSIBILITY_VIEWPORTS,
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
  report.repository.data.status = "PASS";
  report.repository.data.head = R1_FINAL_HEAD;
  report.repository.data.exactParent = R1_REQUIRED_PARENT;
  delete report.repository.data.acceptedBase;
  report.repository.data.directParent = R1_REQUIRED_PARENT;
  report.repository.data.history = [{ commit: R1_FINAL_HEAD, parents: [R1_REQUIRED_PARENT], subject: "Phase 6-R1 validation closure" }];
  report.repository.data.productionSourceDiff = [];
  report.repository.data.productionDiffScope = ["src", "public", "astro.config.mjs", "package-lock.json", ".nvmrc", "tsconfig.json", "package.json except approved R1 evidence/test scripts"];
  delete report.repository.data.productionDelta;
  report.repository.data.toolingReportDiff = [...EXPECTED_R1_CHANGED_PATH_RECORDS];
  report.repository.data.packageScriptChanges = ["audit:phase6-r1-review", "capture:phase6-r1-motion", "check", "ingest:phase6-r1-human", "package:phase6-r1-review", "qa:phase6-r1-lifecycle", "test", "verify:phase6-r1-deployment"];
  report.repository.data.main = { local: FROZEN_MAIN, upstream: FROZEN_MAIN, live: FROZEN_MAIN, modifiedOrMerged: false };
  report.repository.data.upstream = { ref: `origin/${R1_REQUIRED_BRANCH}`, head: R1_FINAL_HEAD, live: R1_FINAL_HEAD, parity: true };
  delete report.repository.data.liveRemote;
  report.deployment.data.branchUrl = R1_REQUIRED_BRANCH_URL;
  report.deployment.data.branch = R1_REQUIRED_BRANCH;
  report.deployment.data.commitHash = R1_FINAL_HEAD;
  report.deployment.data.appSlug = "cloudflare-workers-and-pages";
  report.deployment.data.branchBinding = { status: "PASS", source: "SIGNED_CHECK_EXACT_BRANCH_ALIAS", branch: R1_REQUIRED_BRANCH, branchUrl: R1_REQUIRED_BRANCH_URL };
  const distPaths = [
    ...HTML_AUTHORITY_FILES,
    "_headers",
    "robots.txt",
    "sitemap.xml",
    "_astro/about.css",
    "_astro/About.js",
    "_astro/app.js",
    "media/cinematic/phase-4r2/manifests/home.json",
    "media/cinematic/phase-4r2/media/home.mp4",
    "media/cinematic/phase-4r2/posters/home.webp",
  ].sort((left, right) => left.localeCompare(right));
  const files = distPaths.map((relativePath) => {
    const bytes = Buffer.byteLength(`fixture:${relativePath}`);
    return {
      relativePath,
      deploymentComparison: relativePath === "_headers" ? "EXCLUDED_CLOUDFLARE_CONFIGURATION" : "REQUIRED",
      requestPath: publicPathForDistFile(relativePath),
      bytes,
      sha256: sha256(Buffer.from(`fixture:${relativePath}`)),
    };
  });
  const canonicalAuthority = Object.fromEntries(HTML_AUTHORITY_FILES.map((relativePath) => [relativePath, {
    canonical: canonicalForDistFile(relativePath),
    robotsNoindex: relativePath === "404.html",
    status: "PASS",
  }]));
  const missing404Path = `/__phase6-real-404-${R1_FINAL_HEAD.slice(0, 12)}-${DEPLOYMENT_ID.slice(0, 8)}/`;
  const comparable = files.filter(({ relativePath }) => relativePath !== "_headers");
  const responses = comparable.map((file) => {
    const publicPath = file.relativePath === "404.html" ? missing404Path : file.requestPath;
    const matchedPolicies = Object.keys(REQUIRED_HEADER_POLICIES).filter((pattern) => publicPath.startsWith(pattern.slice(0, -1)));
    const contentType = ({
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript",
      ".json": "application/json",
      ".mp4": "video/mp4",
      ".txt": "text/plain; charset=utf-8",
      ".webp": "image/webp",
      ".xml": "application/xml",
    })[path.posix.extname(file.relativePath)];
    return {
      relativePath: file.relativePath,
      publicPath,
      expectedHttpStatus: file.relativePath === "404.html" ? 404 : 200,
      actualHttpStatus: file.relativePath === "404.html" ? 404 : 200,
      bytes: file.bytes,
      sha256: file.sha256,
      headers: {
        contentType,
        cacheControl: matchedPolicies.length
          ? REQUIRED_HEADER_POLICIES[matchedPolicies[0]]
          : file.relativePath === "404.html" ? "no-store" : "public, max-age=0, must-revalidate",
        matchedPolicies,
        status: "PASS",
      },
      canonical: file.relativePath.endsWith(".html") ? canonicalAuthority[file.relativePath] : null,
      status: "PASS",
    };
  });
  report.dist = {
    status: "PASS",
    files,
    totals: { files: files.length, comparableFiles: comparable.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) },
    exactHtmlAuthority: HTML_AUTHORITY_FILES,
    routeOutcomes: PUBLIC_ROUTE_OUTCOMES,
    canonicalAuthority,
    requiredHeaderPolicies: REQUIRED_HEADER_POLICIES,
  };
  const originData = (origin) => ({
    origin,
    status: "PASS",
    real404: { publicPath: missing404Path, httpStatus: 404, localAuthority: "404.html", byteParity: true },
    fileCount: comparable.length,
    totalBytes: comparable.reduce((sum, file) => sum + file.bytes, 0),
    responses: structuredClone(responses),
  });
  report.origins = {
    immutable: { status: "PASS", data: originData(IMMUTABLE_URL) },
    branch: { status: "PASS", data: originData(R1_REQUIRED_BRANCH_URL) },
  };
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

function fakeMp4(marker, { duration = 1_000, sampleCount = 1 } = {}) {
  const box = (type, ...payloads) => {
    const payload = Buffer.concat(payloads);
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length, 0);
    header.write(type, 4, "ascii");
    return Buffer.concat([header, payload]);
  };
  const timedHeader = () => {
    const payload = Buffer.alloc(20);
    payload.writeUInt32BE(1_000, 12);
    payload.writeUInt32BE(duration, 16);
    return payload;
  };
  const handler = Buffer.alloc(12);
  handler.write("vide", 8, "ascii");
  const sampleSize = Buffer.alloc(12);
  sampleSize.writeUInt32BE(1, 4);
  sampleSize.writeUInt32BE(sampleCount, 8);
  const trak = box("trak", box("mdia", box("mdhd", timedHeader()), box("hdlr", handler), box("minf", box("stbl", box("stsz", sampleSize)))));
  return Buffer.concat([
    box("ftyp", Buffer.from("isom\0\0\0\0", "binary")),
    box("moov", box("mvhd", timedHeader()), trak),
    box("mdat", Buffer.from(marker || "frame")),
  ]);
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

function r1MotionSample(label, { url = "/", scrollY = 0, targetFrame = 1, viewport = { width: 1280, height: 720 }, phase, segment, manifestoReveal } = {}) {
  if (label === "supporting-about") return {
    label,
    url: "/about/",
    viewport,
    documentHidden: false,
    scrollY: 0,
    maximumScroll: 2_500,
    horizontalOverflow: 0,
    mode: null,
    mediaState: null,
    phase: null,
    segment: null,
    targetFrame: 0,
    presentedFrame: 0,
    manifestoReveal: null,
    navigationReleased: null,
    video: null,
  };
  return {
    label,
    url,
    viewport,
    documentHidden: false,
    scrollY,
    maximumScroll: 5_000,
    horizontalOverflow: 0,
    mode: "enhanced",
    mediaState: "ready",
    phase,
    segment,
    targetFrame,
    presentedFrame: targetFrame,
    manifestoReveal,
    navigationReleased: "concealed",
    video: { currentTime: Number((targetFrame / 30).toFixed(4)), paused: true, readyState: 4, hasSource: true },
  };
}

function r1MotionObservations(id) {
  const state = (label, url = "/") => {
    const definitions = {
      F1: [0, 1, "physical", "top-dormancy", "hidden"],
      "F1-rest": [0, 1, "physical", "top-dormancy", "hidden"],
      current: [900, 150, "physical", "current-orbit", "hidden"],
      arrival: [1_900, 285, "physical", "crt-arrival", "hidden"],
      indicator: [1_970, 292, "physical", "indicator", "hidden"],
      line: [2_070, 307, "physical", "phosphor-line", "hidden"],
      raster: [2_300, 341, "physical", "raster-settling", "hidden"],
      Q: [2_500, 370, "physical", "q-hold", "hidden"],
      threshold: [4_100, 490, "physical", "physical-threshold", "hidden"],
      "manifesto-threshold": [4_500, 500, "entry", "entry-reveal", "revealing"],
      "manifesto-resolved": [4_500, 500, "entry", "entry-reveal", "resolved"],
      manifesto: [4_800, 500, "settled", "entry-reveal", "resolved"],
      "home-entry": [4_800, 500, "settled", "entry-reveal", "resolved"],
    };
    const [scrollY, targetFrame, phase, segment, manifestoReveal] = definitions[label];
    return r1MotionSample(label, { url, scrollY, targetFrame, phase, segment, manifestoReveal });
  };
  if (id === "forward-physical-to-manifesto") return { status: "PASS", samples: ["F1", "current", "arrival", "indicator", "line", "raster", "Q", "threshold", "manifesto-threshold", "manifesto-resolved"].map((label) => state(label)) };
  if (id === "reverse-manifesto-to-f1") return { status: "PASS", samples: ["manifesto", "threshold", "Q", "raster", "line", "arrival", "current", "F1", "F1-rest"].map((label) => state(label, "/#entry")) };
  if (id === "supporting-route-entry-and-reverse") return { status: "PASS", samples: [
    r1MotionSample("supporting-about"),
    ...["home-entry", "Q", "raster", "line", "arrival", "current", "F1"].map((label) => state(label, "/#entry")),
  ] };
  if (id === "resize-orientation-mid-current-and-manifesto") {
    const resizeState = (label, viewport, manifesto = false) => r1MotionSample(label, {
      scrollY: manifesto ? 4_500 : 900,
      targetFrame: manifesto ? 500 : 150,
      viewport,
      phase: manifesto ? "entry" : "physical",
      segment: manifesto ? "entry-reveal" : "current-orbit",
      manifestoReveal: manifesto ? "resolved" : "hidden",
    });
    return { status: "PASS", samples: [
      resizeState("current-landscape-before", { width: 1280, height: 720 }),
      resizeState("current-portrait", { width: 720, height: 1280 }),
      resizeState("current-landscape-return", { width: 1280, height: 720 }),
      resizeState("manifesto-landscape-before", { width: 1280, height: 720 }, true),
      resizeState("manifesto-portrait", { width: 720, height: 1280 }, true),
      resizeState("manifesto-landscape-return", { width: 1280, height: 720 }, true),
    ] };
  }
  if (id === "stop-at-authored-states") return { status: "PASS", stops: ["current", "line", "raster", "Q"].map((label) => {
    const before = state(label);
    before.label = `${label}-before-pause`;
    const after = structuredClone(before);
    after.label = `${label}-after-pause`;
    return { label, before, after, status: "PASS" };
  }) };
  throw new Error(`unknown fixture motion story: ${id}`);
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
        observations: r1MotionObservations(video.id),
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
  const phase4Request = (frameNavigationId, range = "bytes=0-1023", requestPath = phase4Path) => {
    const entryDocument = frameNavigationId === "navigation-entry";
    const documentUrl = new URL(entryDocument ? "/#entry" : "/", R1_REQUIRED_BRANCH_URL).href;
    return {
      correlatedDocumentUrl: documentUrl,
      documentIdentityCorrelation: "CORRELATED",
      documentUrl,
      frameDocumentGeneration: entryDocument ? 2 : 1,
      frameDocumentId: entryDocument ? "entry-document" : "bare-document",
      frameNavigationId,
      method: "GET",
      path: requestPath,
      range,
      resourceType: "fetch",
      url: new URL(requestPath, R1_REQUIRED_BRANCH_URL).href,
    };
  };
  const listenerTelemetry = () => ({
    active: 3,
    activeByType: { click: 2, visibilitychange: 1 },
    added: 3,
    duplicateAttempts: 0,
    removed: 0,
  });
  const lifecycleNavigationIds = {
    "bare-document": "navigation-bare",
    "entry-document": "navigation-entry",
    "support-bare-document": "navigation-support-bare",
    "support-entry-document": "navigation-support-entry",
  };
  let lifecycleCaptureSequence = 0;
  const lifecycleState = (label, documentId, url, scrollY, manifestoReveal = null, mediaStartTime = null, navigationType = "navigate") => {
    const hasHome = manifestoReveal !== null;
    return {
      capturedAtEpochMs: 1_800_000_000_000 + (++lifecycleCaptureSequence * 100),
      label,
      documentId,
      maximumScroll: 1_200,
      navigationId: lifecycleNavigationIds[documentId] ?? `navigation-${documentId}`,
      origin: new URL(R1_REQUIRED_BRANCH_URL).origin,
      url,
      scrollY,
      mobileMenu: { open: false, expanded: "false" },
      ...(hasHome ? { home: {
      bootstrap: url === "/#entry" ? "semantic-entry" : "eligible",
      continuation: { audienceRouting: { inert: false }, partnerLink: { top: 100, visible: true } },
      eligibility: "eligible",
      fallback: null,
      header: "released",
      interactive: "true",
      manifesto: { rendered: manifestoReveal === "resolved", text: "We turn industrial needs into field evidence." },
      manifestoReveal,
      mediaState: "ready",
      mode: "enhanced",
      phase: "settled",
      routeNavigation: "released",
      source: {
        hasSource: true,
        src: `blob:https://example.pages.dev/${documentId}`,
        currentSrc: `blob:https://example.pages.dev/${documentId}`,
        srcAttribute: `blob:https://example.pages.dev/${documentId}`,
        videoNodeCount: 1,
        sourceNodeCount: 0,
      },
      } } : {}),
      probe: {
      documentId,
      documentEventSequence: 0,
      events: [],
      manifestoRevealEvents: hasHome ? [
        { atEpochMs: 1_800_000_000_001, value: "hidden" },
        ...(manifestoReveal === "resolved" ? [{ atEpochMs: 1_800_000_000_002, value: "resolved" }] : []),
      ] : [],
      blob: hasHome ? { created: 1, revoked: 0, live: 1 } : { created: 0, revoked: 0, live: 0 },
      intervals: { created: 0, cleared: 0, active: 0 },
      listeners: listenerTelemetry(),
      navigation: { type: navigationType, notRestoredReasons: null },
      raf: { scheduled: 0, executed: 0, cancelled: 0, active: 0 },
      resources: mediaStartTime == null ? [] : [{ url: phase4Path, startTime: mediaStartTime }],
      },
    };
  };
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
      routeStateStable: null,
      currentOrbitStateStable: null,
      homeMediaPausedWhileHidden: null,
      noPersistentRafWhileHidden: null,
      noPersistentIntervalWhileHidden: null,
      noStaleTargetFrameAfterReturn: null,
      sourcePresenceStableAfterReturn: null,
    },
    "home-manifesto": {
      routeStateStable: null,
      manifestoStateStable: null,
      homeMediaPausedWhileHidden: null,
      manifestoCoherentAfterReturn: null,
      noPersistentRafWhileHidden: null,
      noPersistentIntervalWhileHidden: null,
    },
    "maradin-release": {
      routeStateStable: null,
      activeBeforeHide: null,
      sourceFreeWhileHidden: null,
      sourceFreeAfterReturn: null,
      noLiveOrphanBlobWhileHidden: null,
      noPersistentRafWhileHidden: null,
      noPersistentIntervalWhileHidden: null,
    },
    "maradin-retry-release": {
      routeStateStable: null,
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
    listeners: { status: "PASS", comparisons: listenerComparisons, duplicateDocuments: [], telemetryRegressions: [], statement: "Same-Document listener telemetry remained stable." },
    mediaRequests: {
      status: "PASS",
      bypassDocumentsSourceFree: true,
      expectedPhase4Present: true,
      noDuplicateSourceWithinDocument: true,
      noDuplicateNonRangeRequests: true,
      documents: [
        { documentId: "bare-document", labels: ["bare-back", "bare-home", "bare-home-manifesto"], mediaExpected: true, modes: ["enhanced"], paths: [phase4Path], resourceObservations: 1, selectionDocumentUrl: new URL("/", R1_REQUIRED_BRANCH_URL).href, selectionNavigationId: "navigation-bare", selectionStable: true, sourceFree: false },
        { documentId: "entry-document", labels: ["entry-back", "entry-initial", "entry-resolved"], mediaExpected: true, modes: ["enhanced"], paths: [phase4Path], resourceObservations: 1, selectionDocumentUrl: new URL("/#entry", R1_REQUIRED_BRANCH_URL).href, selectionNavigationId: "navigation-entry", selectionStable: true, sourceFree: false },
      ],
      network: {
        phase4Requests: [phase4Request("navigation-bare"), phase4Request("navigation-entry")],
        requestCount: 2,
        rangeRequestCount: 2,
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
  const outcome = (id, fields = {}) => {
    const logText = `${id}: fixture command completed successfully.\n`;
    return { id, status: "PASS", log: `${id}.log`, logText, logSha256: sha256(Buffer.from(logText)), ...fields };
  };
  const deploymentArtifact = fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier");
  const deploymentDocument = JSON.parse(await readFile(path.join(fixture.sourceRoot, ...deploymentArtifact.source.split("/")), "utf8"));
  const distManifestText = [
    '"path","bytes","sha256"',
    ...deploymentDocument.dist.files.map(({ relativePath, bytes, sha256: fileSha256 }) => `"${relativePath}","${bytes}","${fileSha256}"`),
    "",
  ].join("\n");
  const distFiles = deploymentDocument.dist.files.length;
  const distBytes = deploymentDocument.dist.files.reduce((sum, file) => sum + file.bytes, 0);
  const differencesText = '"input","sideIndicator"\n';
  const comparisonText = "Node 22 and Node 24 distribution manifests are byte-identical.\n";
  const node22 = {
    schema: "quantum-hub.phase-6-r1.node22-integrated-validation.v7",
    status: "PASS",
    sealedAtUtc: GENERATED_AT,
    scope: "Node 22.16.0 integrated validation of the frozen Phase 6 R1 validation-closure tree",
    repository: {
      branch: R1_REQUIRED_BRANCH,
      requiredParent: R1_REQUIRED_PARENT,
      captureHeadBeforeFinalCommit: R1_REQUIRED_PARENT,
      finalHead: R1_FINAL_HEAD,
      finalHeadDirectParent: R1_REQUIRED_PARENT,
      finalTree: R1_FINAL_TREE,
      main: FROZEN_MAIN,
      originMain: FROZEN_MAIN,
      workingTreeCleanAtSeal: true,
      productionDiff: { base: R1_REQUIRED_PARENT, scope: ["src/**", "public/**"], changedPathCount: 0, status: "ZERO PRODUCTION-SOURCE DIFF" },
      packageLock: { changedLinesFromRequiredParent: 0, sha256: "f".repeat(64) },
    },
    runtime: { nvmrc: "22.16.0", node: "v22.16.0", npm: "10.9.2", node24ComparisonRuntime: "v24.18.0", node24ComparisonNpm: "11.16.0" },
    outcomes: [
      outcome("npm-ci", { command: "npm ci", packagesInstalled: 285 }),
      outcome("astro-check", { command: "astro check", files: 223, errors: 0, warnings: 0, hints: 0 }),
      outcome("production-build", { command: "npm run build", pages: 10, phase4OutputVerification: "PASS", phase5bProductionVerification: "PASS" }),
      outcome("complete-postbuild-test-suite", { command: "npm test", tests: 400, passed: 400, failed: 0, cancelled: 0, skipped: 0, todo: 0 }),
      outcome("phase4-source-verification", { command: "node scripts/verify-phase4-source.mjs --allow-phase5b-route-scope --allow-phase6-global-hardening", stagedPhase3Assets: 7, stagedPhase4RuntimeFiles: 7 }),
      outcome("phase5b-phase6-r1-focused-regression", { command: "node --test <focused files>", testFiles: 24, tests: 300, passed: 300, failed: 0, cancelled: 0, skipped: 0, todo: 0 }),
      outcome("standalone-verifier-self-tests", { checks: 12, passed: 12, failed: 0, checkNames: Array.from({ length: 12 }, (_, index) => `self-test-${index + 1}`) }),
    ],
    distributionComparison: {
      status: "BYTE-IDENTICAL", differenceCount: 0,
      node22: { files: distFiles, bytes: distBytes, manifest: "node22.csv", manifestText: distManifestText, manifestSha256: sha256(Buffer.from(distManifestText)) },
      node24: { files: distFiles, bytes: distBytes, manifest: "node24.csv", manifestText: distManifestText, manifestSha256: sha256(Buffer.from(distManifestText)) },
      differences: "differences.csv", differencesText, differencesSha256: sha256(Buffer.from(differencesText)),
      comparison: "comparison.txt", comparisonText, comparisonSha256: sha256(Buffer.from(comparisonText)),
    },
    limitations: [],
  };
  const node22File = await put(fixture.sourceRoot, "node22/FINAL-v7-node22-command-outcomes.json", stableJson(node22));
  fixture.metadata.artifacts.push({
    source: node22File.source,
    destination: "00-provenance/node22-integrated-validation.json",
    role: "r1-node22-validation-summary",
    final: true,
    expectedSha256: node22File.expectedSha256,
    status: "PASS",
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
    finalTree: R1_FINAL_TREE,
    directParent: R1_REQUIRED_PARENT,
    localHead: R1_FINAL_HEAD,
    upstreamHead: R1_FINAL_HEAD,
    liveHead: R1_FINAL_HEAD,
    commitChain: [{ sha: R1_FINAL_HEAD, parents: [R1_REQUIRED_PARENT], subject: "Phase 6-R1 validation closure" }],
  });
  Object.assign(fixture.metadata.deployment, {
    checkRunId: "123",
    branchUrl: R1_REQUIRED_BRANCH_URL,
    deployedSha: R1_FINAL_HEAD,
  });
  fixture.metadata.changes = {
    productionFiles: [],
    toolingReportFiles: [...R1_TOOLING_REPORT_FILES],
    trackedFileDelta: R1_TOOLING_REPORT_FILES.length,
    trackedByteDelta: 32_768,
    newTrackedFilesAbove1MiB: [],
  };
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
    const file = await put(fixture.sourceRoot, source, fakeMp4(`human${index + 1}`, { duration: 30_000, sampleCount: 900 }));
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
      mediaValidation: { container: "ISO-BMFF MP4", durationSeconds: 30, sampleCount: 900, videoTrackCount: 1 },
      evidenceClass: "PHYSICAL HUMAN RECORDING",
      device: filename.startsWith("iphone-") ? "Physical iPhone 15" : filename === "physical-scroll-input.mp4" ? "Physical trackpad" : "Desktop PC",
      os: filename.startsWith("iphone-") ? "iOS (version supplied in recording)" : "Windows (version supplied in recording)",
      browser: filename === "physical-scroll-input.mp4" ? null : (filename.startsWith("iphone-") ? "Safari" : "Chrome"),
      browserVersion: null,
      testSteps: ["The required interaction sequence is visibly demonstrated in the supplied recording."],
      observations: [],
      observedResult: "The visibly demonstrated checks completed successfully.",
      status: "PASS",
      reviewedSha256: file.expectedSha256,
      reviewedByteSize: file.bytes.length,
      failureReferences: [],
    };
    if (DEVICE_REVIEW_CHECKS[filename]) {
      evidence.checks = Object.fromEntries(DEVICE_REVIEW_CHECKS[filename].map((check) => [check, true]));
      evidence.observations = DEVICE_REVIEW_CHECKS[filename].map((check) => ({ checkId: check, status: "PASS", result: "The visible check completed successfully.", timestamp: null, frame: null }));
    }
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
      evidence.observations = evidence.routeOutcomes.flatMap((outcome) => Object.keys(outcome.checks).map((check) => ({ checkId: `${outcome.route}:${check}`, status: "PASS", result: "The route check completed successfully.", timestamp: null, frame: null })));
    }
    humanEvidence.push(evidence);
  }
  const ledger = {
    schema: HUMAN_EVIDENCE_SCHEMA,
    createdAt: GENERATED_AT,
    status: "PASS",
    evidenceClass: "HUMAN DEVICE EVIDENCE",
    rootExists: true,
    requiredFilenames: [...REQUIRED_HUMAN_EVIDENCE_FILES],
    missingFilenames: [],
    entries: humanEvidence,
    policy: { ...HUMAN_EVIDENCE_POLICY },
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
  assert.equal(Object.keys(R1_REQUIRED_ARTIFACT_ROLES).length, 6);
  assert.equal(R1_MOTION_RECORDING_SPECS.length, 5);
  assert.equal(Object.keys(HUMAN_REVIEW_GATES).length, 6);
  assert.equal(REQUIRED_BRANCH_URL, "https://feature-phase-6-global-harde.qsite1.pages.dev/");
  assert.equal(R1_REQUIRED_BRANCH, "repair/phase-6-r1-validation-closure");
  assert.equal(R1_REQUIRED_PARENT, "aee036740b129624c54b8f1b878229f955d187ae");
  assert.equal(R1_REQUIRED_BRANCH_URL, "https://repair-phase-6-r1-validation.qsite1.pages.dev/");
  assert.ok(Object.values(HUMAN_REVIEW_GATES).every((value) => value === "PENDING HUMAN REVIEW"));
  assert.deepEqual(EVIDENCE_STATUS_VALUES.slice(0, 5), ["PASS", "FAIL", "LIMITATION", "NOT OBSERVED", "PENDING HUMAN REVIEW"]);
  assert.deepEqual(selfTest().status, "PASS");
  assert.equal(selfTest().r1MandatoryArtifactRoles, 6);
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
  assert.equal(completedStructuredFailure.summary.failures, 51);
  assert.equal(completedStructuredFailure.summary.engineErrors, 0);
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "accessibility-interaction-limitation", engine: "webkit" }, completedStructuredFailure, metadata));
  const explicitLimitation = accessibilityReport("webkit", { failed: true });
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "accessibility-interaction-limitation", engine: "webkit", status: "LIMITATION", limitation: "The isolated interaction run completed with a host focus limitation." }, explicitLimitation, metadata));
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
  const unrelatedEngineVisibility = performanceReport();
  delete unrelatedEngineVisibility.visibility;
  unrelatedEngineVisibility.engines = [{ visibility: { status: "PASS" } }];
  assert.doesNotThrow(() => validateDocumentAuthority({ role: "performance-summary" }, unrelatedEngineVisibility, metadata));
  assert.deepEqual(evidenceTaxonomy({ role: "performance-summary", status: "PASS" }, unrelatedEngineVisibility).visibility, []);
});

test("honest R1 NOT OBSERVED lifecycle authority is not overridden by a legacy PASS taxonomy", () => {
  const entries = [
    { role: "history-bfcache-summary", taxonomy: { bfcache: ["PASS"], visibility: ["PASS"] } },
    { role: "performance-summary", taxonomy: { bfcache: ["PASS"], visibility: ["PASS"] } },
    { role: "r1-persistent-lifecycle-summary", taxonomy: { bfcache: ["NOT OBSERVED"], visibility: ["NOT OBSERVED"] } },
  ];
  assert.equal(guardedRequirementAssessment("05-history-bfcache", "BFCache", entries).status, "NOT OBSERVED");
  assert.equal(guardedRequirementAssessment("03-homepage-motion", "hidden/visible behavior", entries).status, "NOT OBSERVED");

  const mixedLegacyOnly = [
    { role: "history-bfcache-summary", taxonomy: { bfcache: ["PASS", "NOT OBSERVED"] } },
    { role: "performance-summary", taxonomy: { visibility: ["PASS", "NOT OBSERVED"] } },
  ];
  assert.equal(guardedRequirementAssessment("05-history-bfcache", "BFCache", mixedLegacyOnly).status, "NOT OBSERVED");
  assert.equal(guardedRequirementAssessment("03-homepage-motion", "hidden/visible behavior", mixedLegacyOnly).status, "NOT OBSERVED");

  const verifiedHumanPass = [...entries, { role: "physical-device-result", taxonomy: { humanEvidence: { verified: true, hiddenVisible: "PASS" } } }];
  assert.equal(guardedRequirementAssessment("03-homepage-motion", "hidden/visible behavior", verifiedHumanPass).status, "NOT OBSERVED");
  const everyRealSourcePasses = [
    { role: "r1-persistent-lifecycle-summary", taxonomy: { visibility: ["PASS"] } },
    { role: "physical-device-result", taxonomy: { humanEvidence: { verified: true, hiddenVisible: "PASS" } } },
  ];
  assert.equal(guardedRequirementAssessment("03-homepage-motion", "hidden/visible behavior", everyRealSourcePasses).status, "PASS");
  const observedFailure = [...entries, { role: "performance-summary", taxonomy: { visibility: ["FAIL"] } }];
  assert.equal(guardedRequirementAssessment("03-homepage-motion", "hidden/visible behavior", observedFailure).status, "FAIL");
  const zoomFail = guardedRequirementAssessment("09-accessibility", "200%", [{ role: "physical-device-result", taxonomy: { humanEvidence: { verified: true, browserZoom: "FAIL" } } }]);
  assert.equal(zoomFail.status, "FAIL");
  assert.doesNotMatch(zoomFail.statement, /pending/i);
  const physicalPending = guardedRequirementAssessment("11-physical-device", "real-device results if genuinely performed", []);
  assert.equal(physicalPending.status, "PENDING HUMAN REVIEW");
  assert.doesNotMatch(physicalPending.statement, /passed/i);
});

test("legacy BFCache and unrelated visibility fields cannot create unobserved PASS taxonomy", () => {
  assert.throws(
    () => validateDocumentAuthority(
      { role: "history-bfcache-summary" },
      { schema: "quantum-hub.phase-6.global-hardening.v1", status: "PASS", bfcache: { status: "PASS" } },
      {},
    ),
    /top-level BFCache PASS requires a real ordered/,
  );
  const unrelated = evidenceTaxonomy(
    { role: "homepage-motion-summary", status: "PASS" },
    { schema: "quantum-hub.phase-6.global-hardening.v1", status: "PASS", bfcache: { status: "PASS" }, visibility: { status: "PASS" } },
  );
  assert.deepEqual(unrelated.bfcache, []);
  assert.deepEqual(unrelated.visibility, []);
  assert.equal(guardedRequirementAssessment("03-homepage-motion", "hidden/visible behavior", [{ role: "homepage-motion-summary", taxonomy: unrelated }]).status, "NOT OBSERVED");
});

test("accessibility PASS requires the exact ten-route interaction matrix, four clean menu cycles and clean history", () => {
  const metadata = { evidenceContext: { browserQa: { baseUrl: LOCAL_BASE_URL } } };
  const record = { role: "accessibility-summary", engine: "chromium" };
  const incompleteKeyboard = accessibilityReport("chromium");
  incompleteKeyboard.engines[0].keyboard.pop();
  assert.throws(() => validateDocumentAuthority(record, incompleteKeyboard, metadata), /keyboard (matrix is incomplete|focus matrix differs)/);

  const duplicateRoute = accessibilityReport("chromium");
  duplicateRoute.engines[0].keyboard[9].route = duplicateRoute.engines[0].keyboard[0].route;
  assert.throws(() => validateDocumentAuthority(record, duplicateRoute, metadata), /keyboard (route row|focus matrix) differs/);

  const shortMenu = accessibilityReport("chromium");
  shortMenu.engines[0].mobileMenu.cycles.pop();
  assert.throws(() => validateDocumentAuthority(record, shortMenu, metadata), /mobile-menu cycles are incomplete|four-cycle authority differs/);

  const menuFailure = accessibilityReport("chromium");
  menuFailure.engines[0].mobileMenu.failures.push({ code: "escape-focus-return" });
  assert.throws(() => validateDocumentAuthority(record, menuFailure, metadata), /mobile-menu raw evidence differs|four-cycle authority differs/);

  const historyFailure = accessibilityReport("chromium");
  historyFailure.engines[0].history.status = "FAIL";
  historyFailure.engines[0].history.failures.push({ code: "forward" });
  assert.throws(() => validateDocumentAuthority(record, historyFailure, metadata), /history raw evidence differs|history authority differs/);

  for (const mutate of [
    (preparation) => { preparation.state.hash = "#entry"; },
    (preparation) => { preparation.state.route = "/#entry"; },
    (preparation) => { preparation.wheelSteps = 25; },
    (preparation) => { preparation.state.cinematicMode = "fallback"; },
    (preparation) => { preparation.state.mediaState = "loading"; },
  ]) {
    const contradictoryPreparation = accessibilityReport("chromium");
    const preparation = contradictoryPreparation.engines[0].keyboard.find(({ route }) => route === "home").desktopHome.preparation;
    mutate(preparation);
    assert.throws(() => validateDocumentAuthority(record, contradictoryPreparation, metadata), /keyboard raw row\/status differs/);
  }

  for (const mutate of [
    (row) => { row.firstVisibilityReady = false; },
    (row) => { row.first.rect.top = -1; },
    (row) => { row.first.rect.left = -1; },
    (row) => { row.first.rect.bottom = 901; },
    (row) => { row.first.rect.right = 1441; },
  ]) {
    const incompleteFocusVisibility = accessibilityReport("chromium");
    mutate(incompleteFocusVisibility.engines[0].keyboard[0]);
    assert.throws(() => validateDocumentAuthority(record, incompleteFocusVisibility, metadata), /keyboard raw row\/status differs/);
  }
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
  await rewriteArtifactJson(fixture, ({ role }) => role === "accessibility-summary", (document) => {
    document.axeOnly = true;
    const result = document.engines[0];
    result.keyboard = [];
    result.mobileMenu = null;
    result.history = null;
    result.failures = [];
    result.status = "PASS";
    result.summary = { ...result.summary, failures: 0, keyboardCases: 0 };
    document.failures = [];
    document.status = "PASS";
    document.summary = { ...document.summary, failures: 0 };
  });
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
    assert.equal(document.summary.engineErrors, 0);
    assert.equal(document.summary.failures, 51);
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
  const incomplete = { schema: HUMAN_EVIDENCE_SCHEMA, createdAt: GENERATED_AT, status: "PASS", evidenceClass: "HUMAN DEVICE EVIDENCE", rootExists: true, requiredFilenames: [...REQUIRED_HUMAN_EVIDENCE_FILES], missingFilenames: [], entries: [{ filename: REQUIRED_HUMAN_EVIDENCE_FILES[0] }], policy: { ...HUMAN_EVIDENCE_POLICY } };
  assert.throws(() => validateHumanEvidenceLedger(incomplete), /omits, reorders or duplicates a required recording/);
  const ledger = await attachVerifiedHumanEvidence(fixture);
  const missingTimestamp = structuredClone(ledger);
  delete missingTimestamp.createdAt;
  assert.throws(() => validateHumanEvidenceLedger(missingTimestamp), /createdAt/);
  const falsePolicy = structuredClone(ledger);
  falsePolicy.policy.filePresenceIsPass = true;
  assert.throws(() => validateHumanEvidenceLedger(falsePolicy), /policy authority differs/);
  const opening = ledger.entries.find(({ filename }) => filename === "iphone-safari-opening.mp4");
  assert.deepEqual(Object.keys(opening.checks).sort(), [...DEVICE_REVIEW_CHECKS[opening.filename]].sort());
  assert.equal(opening.checks.backgroundForeground, true);
  const zoom = ledger.entries.find(({ filename }) => filename === "chrome-200-percent.mp4");
  assert.equal(zoom.routeOutcomes.length, 10);
  assert.ok(zoom.routeOutcomes.every(({ checks }) => Object.keys(checks).length === 10 && Object.values(checks).every((value) => value === true)));
  const incompleteZoom = structuredClone(ledger);
  delete incompleteZoom.entries.find(({ filename }) => filename === "chrome-200-percent.mp4").routeOutcomes[0].checks.completeH1;
  assert.throws(() => validateHumanEvidenceLedger(incompleteZoom), /route \/ checks must contain exactly the ten required checks|genuine 200% route outcome 0 is incomplete/);
  const pendingReview = structuredClone(ledger);
  pendingReview.status = "PENDING HUMAN REVIEW";
  for (const entry of pendingReview.entries) {
    entry.status = "PENDING HUMAN REVIEW";
    entry.reviewedSha256 = null;
    entry.reviewedByteSize = null;
    if (entry.checks) for (const check of Object.keys(entry.checks)) entry.checks[check] = null;
    entry.observedResult = "Pending human review.";
    if (entry.filename === "chrome-200-percent.mp4") {
      entry.genuineBrowserZoom = null;
      entry.zoomPercent = null;
      entry.proxy = null;
      for (const outcome of entry.routeOutcomes) {
        outcome.status = "PENDING HUMAN REVIEW";
        for (const check of Object.keys(outcome.checks)) outcome.checks[check] = null;
      }
    }
    entry.observations = entry.observations.map((observation) => ({ ...observation, status: "PENDING HUMAN REVIEW", result: "Pending human review.", timestamp: null, frame: null }));
  }
  assert.equal(validateHumanEvidenceLedger(pendingReview).status, "PENDING HUMAN REVIEW");
  const built = await buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });
  const readSummary = (section) => JSON.parse(built.entries.find(({ path: evidencePath }) => evidencePath === `${section}/section-summary.json`).data);
  assert.ok(readSummary("11-physical-device").requirements.every(({ status }) => status === "PASS"));
  assert.equal(readSummary("09-accessibility").requirements.find(({ requirement }) => requirement === "200%").status, "PASS");
  assert.equal(readSummary("03-homepage-motion").requirements.find(({ requirement }) => requirement === "hidden/visible behavior").status, "NOT OBSERVED");
  const ledgerTaxonomy = built.entries.find(({ role }) => role === "physical-device-result").taxonomy.humanEvidence;
  assert.equal(ledgerTaxonomy.verified, true);
  assert.equal(ledgerTaxonomy.recordings.find(({ filename }) => filename === "iphone-safari-opening.mp4").checks.backgroundForeground, true);

  const pseudoMp4 = Buffer.from("\0\0\0\x0cftypisom", "binary");
  const openingArtifact = fixture.metadata.artifacts.find(({ role, source }) => role === "physical-device-recording" && source.endsWith("iphone-safari-opening.mp4"));
  await writeFile(path.join(fixture.sourceRoot, ...openingArtifact.source.split("/")), pseudoMp4);
  openingArtifact.expectedSha256 = sha256(pseudoMp4);
  opening.sha256 = openingArtifact.expectedSha256;
  opening.byteSize = pseudoMp4.length;
  opening.reviewedSha256 = opening.sha256;
  opening.reviewedByteSize = opening.byteSize;
  await writeHumanLedger(fixture, ledger);
  await assert.rejects(() => buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false }), /too small to be a coherent MP4|missing a non-empty moov/);
});

test("hidden-visible aggregation combines human and machine sources with observed FAIL dominance", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const ledger = await attachVerifiedHumanEvidence(fixture);
  const maradin = ledger.entries.find(({ filename }) => filename === "iphone-safari-maradin.mp4");
  maradin.status = "FAIL";
  maradin.checks.noLiveOrphanBlob = false;
  maradin.failureReferences = [{ check: "noLiveOrphanBlob", timestamp: "00:12.000", frame: null, observation: "A live orphan Blob remained visible in telemetry." }];
  maradin.observedResult = "A visible failure was observed.";
  Object.assign(maradin.observations.find(({ checkId }) => checkId === "noLiveOrphanBlob"), { status: "FAIL", result: "A visible failure was observed.", timestamp: "00:12.000", frame: null });
  ledger.status = "FAIL";
  fixture.metadata.artifacts.find(({ role, source }) => role === "physical-device-recording" && source.endsWith("iphone-safari-maradin.mp4")).status = "FAIL";
  await writeHumanLedger(fixture, ledger, "FAIL");
  const built = await buildEvidenceEntries({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });
  const summary = JSON.parse(built.entries.find(({ path: evidencePath }) => evidencePath === "03-homepage-motion/section-summary.json").data);
  assert.equal(summary.requirements.find(({ requirement }) => requirement === "hidden/visible behavior").status, "FAIL");
  const physicalSummary = JSON.parse(built.entries.find(({ path: evidencePath }) => evidencePath === "11-physical-device/section-summary.json").data);
  const physicalRequirement = physicalSummary.requirements.find(({ requirement }) => requirement === "real-device results if genuinely performed");
  assert.equal(physicalRequirement.status, "FAIL");
  assert.doesNotMatch(physicalRequirement.statement, /pending/i);
});

test("human recording ledger bindings reject direct SHA-256, byte-size and status mismatches", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const ledger = await attachVerifiedHumanEvidence(fixture);
  const options = () => ({ sourceEvidenceRoot: fixture.sourceRoot, finalMetadata: fixture.metadata, posterStudyDirectory: fixture.candidates, originalPosterDirectory: fixture.originals, verifyTrackedPosterAuthority: false });

  const wrongHash = structuredClone(ledger);
  wrongHash.entries[0].sha256 = "f".repeat(64);
  wrongHash.entries[0].reviewedSha256 = wrongHash.entries[0].sha256;
  await writeHumanLedger(fixture, wrongHash);
  await assert.rejects(() => buildEvidenceEntries(options()), /hash\/size\/status bound.*iphone-safari-opening\.mp4/);

  const wrongSize = structuredClone(ledger);
  wrongSize.entries[0].byteSize += 1;
  wrongSize.entries[0].reviewedByteSize = wrongSize.entries[0].byteSize;
  await writeHumanLedger(fixture, wrongSize);
  await assert.rejects(() => buildEvidenceEntries(options()), /hash\/size\/status bound.*iphone-safari-opening\.mp4/);

  const wrongStatus = structuredClone(ledger);
  wrongStatus.entries[0].status = "PENDING HUMAN REVIEW";
  wrongStatus.entries[0].reviewedSha256 = null;
  wrongStatus.entries[0].reviewedByteSize = null;
  for (const check of Object.keys(wrongStatus.entries[0].checks)) wrongStatus.entries[0].checks[check] = null;
  wrongStatus.entries[0].observedResult = "Pending human review.";
  wrongStatus.entries[0].observations = wrongStatus.entries[0].observations.map((observation) => ({
    ...observation,
    status: "PENDING HUMAN REVIEW",
    result: "Pending human review.",
    timestamp: null,
    frame: null,
  }));
  wrongStatus.status = "PENDING HUMAN REVIEW";
  await writeHumanLedger(fixture, wrongStatus);
  await assert.rejects(() => buildEvidenceEntries(options()), /hash\/size\/status bound.*iphone-safari-opening\.mp4/);
});

test("human ledger rejects reviews rebound to different bytes and out-of-media failure positions", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const ledger = await attachVerifiedHumanEvidence(fixture);
  const replaced = structuredClone(ledger);
  replaced.entries[0].sha256 = "f".repeat(64);
  assert.throws(() => validateHumanEvidenceLedger(replaced), /review is not bound to the supplied recording bytes/);

  const outOfDuration = structuredClone(ledger);
  const opening = outOfDuration.entries[0];
  const check = DEVICE_REVIEW_CHECKS[opening.filename][0];
  opening.status = "FAIL";
  opening.checks[check] = false;
  opening.observedResult = "A visible failure was observed.";
  opening.failureReferences = [{ check, timestamp: "00:31.000", frame: null, observation: "Visible after the recording ended." }];
  Object.assign(opening.observations.find(({ checkId }) => checkId === check), { status: "FAIL", result: "A visible failure was observed.", timestamp: "00:31.000", frame: null });
  outOfDuration.status = "FAIL";
  assert.throws(() => validateHumanEvidenceLedger(outOfDuration), /timestamp exceeds the recording duration/);

  opening.failureReferences[0].timestamp = null;
  opening.failureReferences[0].frame = "F901";
  Object.assign(opening.observations.find(({ checkId }) => checkId === check), { timestamp: null, frame: "F901" });
  assert.throws(() => validateHumanEvidenceLedger(outOfDuration), /frame exceeds the recording sample count/);
});

test("human ledger rejects status drift and any false check without its own addressed failure reference", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  const ledger = await attachVerifiedHumanEvidence(fixture);

  const statusDrift = structuredClone(ledger);
  const driftZoom = statusDrift.entries.find(({ filename }) => filename === "chrome-200-percent.mp4");
  driftZoom.routeOutcomes[0].status = "FAIL";
  assert.throws(() => validateHumanEvidenceLedger(statusDrift), /chrome-200-percent FAIL route \/ contains no failed check/);

  const physical = structuredClone(ledger);
  const opening = physical.entries.find(({ filename }) => filename === "iphone-safari-opening.mp4");
  const [first, second] = DEVICE_REVIEW_CHECKS[opening.filename];
  opening.status = "FAIL";
  opening.checks[first] = false;
  opening.checks[second] = false;
  opening.observedResult = "A visible failure was observed.";
  opening.failureReferences = [{ check: first, timestamp: "00:12.000", frame: null, observation: "First failure." }];
  Object.assign(opening.observations.find(({ checkId }) => checkId === first), { status: "FAIL", result: "A visible failure was observed.", timestamp: "00:12.000", frame: null });
  Object.assign(opening.observations.find(({ checkId }) => checkId === second), { status: "FAIL", result: "A second visible failure was observed.", timestamp: null, frame: "F220" });
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
  zoom.observedResult = "A visible failure was observed.";
  zoom.failureReferences = [{ check: "/:completeH1", timestamp: "00:20.000", frame: null, observation: "Route failure." }];
  Object.assign(zoom.observations.find(({ checkId }) => checkId === "/:completeH1"), { status: "FAIL", result: "A visible failure was observed.", timestamp: "00:20.000", frame: null });
  Object.assign(zoom.observations.find(({ checkId }) => checkId === "/:completeOpeningProposition"), { status: "FAIL", result: "A second visible failure was observed.", timestamp: "00:21.000", frame: null });
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
  const productionChange = structuredClone(fixture.metadata);
  productionChange.changes.productionFiles = ["src/pages/index.astro"];
  assert.throws(() => validateFinalMetadata(productionChange, { posterStudyDirectory: fixture.candidates }), /production-source change ledger must be empty/);
  const missingTool = structuredClone(fixture.metadata);
  missingTool.changes.toolingReportFiles.pop();
  assert.throws(() => validateFinalMetadata(missingTool, { posterStudyDirectory: fixture.candidates }), /exact 18-path authority/);
  const extraTool = structuredClone(fixture.metadata);
  extraTool.changes.toolingReportFiles.push("scripts/not-authorized.mjs");
  assert.throws(() => validateFinalMetadata(extraTool, { posterStudyDirectory: fixture.candidates }), /exact 18-path authority/);
  const wrongDelta = structuredClone(fixture.metadata);
  wrongDelta.changes.trackedFileDelta = 17;
  assert.throws(() => validateFinalMetadata(wrongDelta, { posterStudyDirectory: fixture.candidates }), /trackedFileDelta/);
  const unknownSupplemental = structuredClone(fixture.metadata);
  const regressionArtifact = unknownSupplemental.artifacts.find(({ role }) => role === "regression-summary");
  unknownSupplemental.artifacts.push({ ...regressionArtifact, destination: "00-provenance/repository-source-dump.json", role: "supplemental-repository-source-dump" });
  assert.throws(() => validateFinalMetadata(unknownSupplemental, { posterStudyDirectory: fixture.candidates }), /unknown supplemental evidence role is forbidden/);
  const deploymentMismatch = structuredClone(deployment);
  deploymentMismatch.repository.data.toolingReportDiff.pop();
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), deploymentMismatch, fixture.metadata), /inner repository\/deployment\/origin authority|tooling\/report diff/);
  const deploymentStatusMismatch = structuredClone(deployment);
  deploymentStatusMismatch.repository.data.toolingReportDiff[0] = deploymentStatusMismatch.repository.data.toolingReportDiff[0].replace(/^A\t/, "M\t");
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), deploymentStatusMismatch, fixture.metadata), /inner repository\/deployment\/origin authority/);
  const innerRepositoryMismatch = structuredClone(deployment);
  innerRepositoryMismatch.repository.data.cleanTree = false;
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), innerRepositoryMismatch, fixture.metadata), /inner repository\/deployment\/origin authority/);
  const innerDeploymentMismatch = structuredClone(deployment);
  innerDeploymentMismatch.deployment.data.commitHash = "0".repeat(40);
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), innerDeploymentMismatch, fixture.metadata), /inner repository\/deployment\/origin authority/);
  const legacyDeploymentSlug = structuredClone(deployment);
  legacyDeploymentSlug.deployment.data.appSlug = "cloudflare-pages";
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), legacyDeploymentSlug, fixture.metadata), /inner repository\/deployment\/origin authority/);
  const nestedBranchFailure = structuredClone(deployment);
  nestedBranchFailure.deployment.data.branchBinding.status = "FAIL";
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), nestedBranchFailure, fixture.metadata), /nested status is not PASS/);
  const nestedOriginFailure = structuredClone(deployment);
  nestedOriginFailure.origins.immutable.data.responses = [{ status: "FAIL" }];
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), nestedOriginFailure, fixture.metadata), /nested status is not PASS/);
  const packageScriptMismatch = structuredClone(deployment);
  packageScriptMismatch.repository.data.packageScriptChanges.pop();
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), packageScriptMismatch, fixture.metadata), /inner repository\/deployment\/origin authority/);
  const productionScopeMismatch = structuredClone(deployment);
  productionScopeMismatch.repository.data.productionDiffScope.pop();
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), productionScopeMismatch, fixture.metadata), /inner repository\/deployment\/origin authority/);
  const forgedRouteStatus = structuredClone(deployment);
  forgedRouteStatus.dist.routeOutcomes[0].status = 500;
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), forgedRouteStatus, fixture.metadata), /dist route\/header authority differs/);
  const forgedDistSha = structuredClone(deployment);
  forgedDistSha.dist.files.find(({ relativePath }) => relativePath === "index.html").sha256 = "f".repeat(64);
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), forgedDistSha, fixture.metadata), /raw response parity differs/);
  const ambiguousDistPath = structuredClone(deployment);
  ambiguousDistPath.dist.files.find(({ relativePath }) => relativePath === "robots.txt").relativePath = "nested/%2e%2e/robots.txt";
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), ambiguousDistPath, fixture.metadata), /URL-ambiguous/);
  const forgedHttpStatus = structuredClone(deployment);
  forgedHttpStatus.origins.immutable.data.responses.find(({ relativePath }) => relativePath === "index.html").actualHttpStatus = 500;
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), forgedHttpStatus, fixture.metadata), /raw response parity differs/);
  const forgedOriginSha = structuredClone(deployment);
  forgedOriginSha.origins.branch.data.responses.find(({ relativePath }) => relativePath === "index.html").sha256 = "e".repeat(64);
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), forgedOriginSha, fixture.metadata), /raw response parity differs/);
  const forgedMime = structuredClone(deployment);
  forgedMime.origins.immutable.data.responses.find(({ relativePath }) => relativePath === "index.html").headers.contentType = "not-text/html";
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), forgedMime, fixture.metadata), /response header authority differs/);
  const nonPrimitiveCache = structuredClone(deployment);
  nonPrimitiveCache.origins.branch.data.responses.find(({ relativePath }) => relativePath === "index.html").headers.cacheControl = [];
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), nonPrimitiveCache, fixture.metadata), /response header authority differs/);
  const parameterizedPrivate = structuredClone(deployment);
  parameterizedPrivate.origins.branch.data.responses.find(({ relativePath }) => relativePath === "index.html").headers.cacheControl = 'public, max-age=0, must-revalidate, private="set-cookie"';
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), parameterizedPrivate, fixture.metadata), /unsafe Cache-Control/);
  const conflictingMaxAge = structuredClone(deployment);
  conflictingMaxAge.origins.immutable.data.responses.find(({ relativePath }) => relativePath === "_astro/app.js").headers.cacheControl = "public, max-age=31556952, max-age=0, immutable";
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), conflictingMaxAge, fixture.metadata), /duplicate, or conflicting directive/);
  const contradictoryCache = structuredClone(deployment);
  contradictoryCache.origins.branch.data.responses.find(({ relativePath }) => relativePath === "_astro/app.js").headers.cacheControl = "public, max-age=31556952, immutable, no-cache";
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), contradictoryCache, fixture.metadata), /Cache-Control differs/);
  const forgedCheckRunId = structuredClone(deployment);
  forgedCheckRunId.deployment.data.checkRunId = "999";
  assert.throws(() => validateDocumentAuthority(fixture.metadata.artifacts.find(({ role }) => role === "deployment-verifier"), forgedCheckRunId, fixture.metadata), /checkRunId is not independently bound/);
  const motionSummaries = built.entries.filter(({ role }) => role === "r1-motion-summary");
  const motionRecordings = built.entries.filter(({ role }) => role === "r1-motion-recording");
  const persistentLifecycle = built.entries.filter(({ role }) => role === "r1-persistent-lifecycle-summary");
  const node22Entries = built.entries.filter(({ role }) => role === "r1-node22-validation-summary");
  assert.equal(motionSummaries.length, 2);
  assert.equal(motionRecordings.length, 10);
  assert.equal(persistentLifecycle.length, 1);
  assert.equal(node22Entries.length, 1);
  const finalBuild = JSON.parse(built.entries.find(({ path: evidencePath }) => evidencePath === "00-provenance/final-build-test.json").data);
  assert.equal(finalBuild.node22Validation.runtime.node, "v22.16.0");
  assert.equal(finalBuild.node22Validation.distributionComparison.status, "BYTE-IDENTICAL");
  assert.equal(finalBuild.node22Validation.artifact.path, "00-provenance/node22-integrated-validation.json");
  const assemblyInventory = JSON.parse(built.entries.find(({ path: evidencePath }) => evidencePath === "13-package/evidence-assembly-summary.json").data);
  assert.equal(assemblyInventory.downstream.packagerAddsTrackedReports, 5);
  const baselineSummary = JSON.parse(built.entries.find(({ path: evidencePath }) => evidencePath === "01-baseline/section-summary.json").data);
  assert.ok(baselineSummary.evidence.some(({ path: evidencePath, generatedByPackager }) => evidencePath === "01-baseline/PHASE_6_R1_VALIDATION_CLOSURE.md" && generatedByPackager === true));
  for (const engine of ["chromium", "firefox"]) {
    assert.deepEqual(
      motionRecordings.filter((entry) => entry.engine === engine).map((entry) => entry.media.story),
      R1_MOTION_RECORDING_SPECS.map(({ id }) => id),
    );
    assert.ok(motionRecordings.filter((entry) => entry.engine === engine).every((entry) => entry.media.codec === "h264" && entry.media.fullDecodeValidated));
  }

  const nodeRecord = fixture.metadata.artifacts.find(({ role }) => role === "r1-node22-validation-summary");
  const nodeReport = JSON.parse(await readFile(path.join(fixture.sourceRoot, ...nodeRecord.source.split("/")), "utf8"));
  const wrongRuntime = structuredClone(nodeReport);
  wrongRuntime.runtime.node = "v24.18.0";
  assert.throws(() => validateDocumentAuthority(nodeRecord, wrongRuntime, fixture.metadata), /Node\/npm runtime authority/);
  const incompleteOutcome = structuredClone(nodeReport);
  incompleteOutcome.outcomes = incompleteOutcome.outcomes.filter(({ id }) => id !== "phase4-source-verification");
  assert.throws(() => validateDocumentAuthority(nodeRecord, incompleteOutcome, fixture.metadata), /outcome inventory must contain exactly/);
  const extraFailedOutcome = structuredClone(nodeReport);
  extraFailedOutcome.outcomes.push({ id: "extra-authority", status: "FAIL", log: "extra.log", logText: "failed\n", logSha256: sha256(Buffer.from("failed\n")) });
  assert.throws(() => validateDocumentAuthority(nodeRecord, extraFailedOutcome, fixture.metadata), /outcome inventory must contain exactly/);
  const differentDist = structuredClone(nodeReport);
  differentDist.distributionComparison.status = "DIFFERENT";
  differentDist.distributionComparison.differenceCount = 1;
  assert.throws(() => validateDocumentAuthority(nodeRecord, differentDist, fixture.metadata), /dist comparison is not byte-identical/);

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
  const hollowMotion = structuredClone(chromiumReport);
  hollowMotion.recordings[0].observations = { status: "PASS" };
  assert.throws(() => validateDocumentAuthority(chromiumSummaryRecord, hollowMotion, fixture.metadata), /motion sample inventory differs/);
  const mislabeledMotion = structuredClone(chromiumReport);
  mislabeledMotion.recordings[0].observations.samples[1].segment = "top-dormancy";
  assert.throws(() => validateDocumentAuthority(chromiumSummaryRecord, mislabeledMotion, fixture.metadata), /authored-state semantics differ/);

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
  assert.throws(() => validateDocumentAuthority(lifecycleRecord, hiddenManifestoRawContradiction, fixture.metadata), /history check bareBack(?:Correct|NoManifestoReplay) contradicts raw states/);
  const duplicateMediaPromoted = structuredClone(lifecycleReport);
  duplicateMediaPromoted.mediaRequests.noDuplicateNonRangeRequests = false;
  assert.throws(() => validateDocumentAuthority(lifecycleRecord, duplicateMediaPromoted, fixture.metadata), /noDuplicateNonRangeRequests contradicts raw non-range selections/);
  const duplicateMediaRawContradiction = structuredClone(lifecycleReport);
  const lifecycleRequests = lifecycleReport.mediaRequests.network.phase4Requests;
  duplicateMediaRawContradiction.mediaRequests.network.phase4Requests = [
    { ...lifecycleRequests[0], range: null },
    { ...lifecycleRequests[0], range: null },
    { ...lifecycleRequests[1], range: null },
  ];
  duplicateMediaRawContradiction.mediaRequests.network.requestCount = 3;
  duplicateMediaRawContradiction.mediaRequests.network.rangeRequestCount = 0;
  duplicateMediaRawContradiction.mediaRequests.network.nonRangeRequestCount = 3;
  duplicateMediaRawContradiction.mediaRequests.network.nonRangeSelections = [{ path: "/media/cinematic/phase-4r2/media/mobile.mp4", count: 3, logicalHomeDocuments: 2 }];
  assert.throws(() => validateDocumentAuthority(lifecycleRecord, duplicateMediaRawContradiction, fixture.metadata), /noDuplicateNonRangeRequests contradicts raw non-range selections/);

  const missingLifecycle = structuredClone(fixture.metadata);
  missingLifecycle.artifacts = missingLifecycle.artifacts.filter(({ role }) => role !== "r1-persistent-lifecycle-summary");
  await assert.rejects(() => buildEvidenceEntries(optionsFor(missingLifecycle)), /mandatory evidence role is missing: r1-persistent-lifecycle-summary/);
  const missingNode22 = structuredClone(fixture.metadata);
  missingNode22.artifacts = missingNode22.artifacts.filter(({ role }) => role !== "r1-node22-validation-summary");
  await assert.rejects(() => buildEvidenceEntries(optionsFor(missingNode22)), /mandatory evidence role is missing: r1-node22-validation-summary/);

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

test("R1 assembly cross-binds a self-consistent deployment ledger to the Node 22 dist manifest", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  await convertFixtureToR1(fixture);
  await rewriteArtifactJson(fixture, ({ role }) => role === "deployment-verifier", (document) => {
    const forgedSha256 = "9".repeat(64);
    document.dist.files.find(({ relativePath }) => relativePath === "index.html").sha256 = forgedSha256;
    for (const origin of [document.origins.immutable.data, document.origins.branch.data]) {
      origin.responses.find(({ relativePath }) => relativePath === "index.html").sha256 = forgedSha256;
    }
  });
  await assert.rejects(() => buildEvidenceEntries({
    sourceEvidenceRoot: fixture.sourceRoot,
    finalMetadata: fixture.metadata,
    posterStudyDirectory: fixture.candidates,
    originalPosterDirectory: fixture.originals,
    verifyTrackedPosterAuthority: false,
  }), /does not exactly match the hash-bound Node 22 distribution manifest/);
});

test("R1 persistent lifecycle rejects every raw-history, BFCache, visibility, listener and media false PASS", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.parent, { recursive: true, force: true }));
  await convertFixtureToR1(fixture);
  const record = fixture.metadata.artifacts.find(({ role }) => role === "r1-persistent-lifecycle-summary");
  const report = JSON.parse(await readFile(path.join(fixture.sourceRoot, ...record.source.split("/")), "utf8"));
  const lifecyclePhase4Path = report.mediaRequests.documents[0].paths[0];
  const validate = (document) => validateDocumentAuthority(record, document, fixture.metadata);
  const requestFor = (index, requestPath, range = null, overrides = {}) => ({
    ...report.mediaRequests.network.phase4Requests[index],
    path: requestPath,
    range,
    url: new URL(requestPath, R1_REQUIRED_BRANCH_URL).href,
    ...overrides,
  });
  assert.doesNotThrow(() => validate(report));

  const sameRouteFreshDocument = structuredClone(report);
  const entryBackDocumentId = "entry-back-document";
  const entryBackState = sameRouteFreshDocument.history.states.entryBack;
  entryBackState.documentId = entryBackDocumentId;
  entryBackState.probe.documentId = entryBackDocumentId;
  entryBackState.probe.resources[0].startTime = 30;
  for (const field of ["src", "currentSrc", "srcAttribute"]) {
    entryBackState.home.source[field] = `blob:https://example.pages.dev/${entryBackDocumentId}`;
  }
  sameRouteFreshDocument.listeners.comparisons = sameRouteFreshDocument.listeners.comparisons.filter(({ name }) => name !== "entry-back");
  const bareMediaDocument = structuredClone(sameRouteFreshDocument.mediaRequests.documents.find(({ documentId }) => documentId === "bare-document"));
  const entryMediaDocument = structuredClone(sameRouteFreshDocument.mediaRequests.documents.find(({ documentId }) => documentId === "entry-document"));
  entryMediaDocument.labels = ["entry-initial", "entry-resolved"];
  const entryBackMediaDocument = {
    ...structuredClone(entryMediaDocument),
    documentId: entryBackDocumentId,
    labels: ["entry-back"],
  };
  sameRouteFreshDocument.mediaRequests.documents = [bareMediaDocument, entryBackMediaDocument, entryMediaDocument]
    .sort((left, right) => left.documentId.localeCompare(right.documentId));
  const bareNetworkRequest = structuredClone(sameRouteFreshDocument.mediaRequests.network.phase4Requests[0]);
  const entryNetworkRequest = {
    ...structuredClone(sameRouteFreshDocument.mediaRequests.network.phase4Requests[1]),
    range: null,
  };
  const entryBackNetworkRequest = {
    ...structuredClone(entryNetworkRequest),
    frameDocumentGeneration: 3,
    frameDocumentId: entryBackDocumentId,
  };
  sameRouteFreshDocument.mediaRequests.network.phase4Requests = [bareNetworkRequest, entryNetworkRequest, entryBackNetworkRequest];
  Object.assign(sameRouteFreshDocument.mediaRequests.network, {
    requestCount: 3,
    rangeRequestCount: 1,
    nonRangeRequestCount: 2,
    nonRangeSelections: [{ path: lifecyclePhase4Path, count: 2, logicalHomeDocuments: 3 }],
  });
  assert.doesNotThrow(() => validate(sameRouteFreshDocument), "two fresh same-route Documents with one correlated request each were rejected");
  const restoredDocumentRangeTraffic = structuredClone(sameRouteFreshDocument);
  restoredDocumentRangeTraffic.mediaRequests.network.phase4Requests.push({
    ...structuredClone(restoredDocumentRangeTraffic.mediaRequests.network.phase4Requests[1]),
    frameDocumentGeneration: 4,
    range: "bytes=1024-2047",
  });
  restoredDocumentRangeTraffic.mediaRequests.network.requestCount = 4;
  restoredDocumentRangeTraffic.mediaRequests.network.rangeRequestCount = 2;
  assert.doesNotThrow(() => validate(restoredDocumentRangeTraffic), "range traffic for one restored Document was rejected across browser generations");

  for (const [name, mutate] of Object.entries({
    missingFrameDocumentId: (request) => { request.frameDocumentId = null; },
    collapsedFrameDocumentId: (request) => { request.frameDocumentId = "entry-document"; },
    collapsedDocumentGeneration: (request) => { request.frameDocumentGeneration = 2; },
    missingDocumentGeneration: (request) => { request.frameDocumentGeneration = null; },
    pendingCorrelation: (request) => { request.documentIdentityCorrelation = "PENDING"; },
    evaluationErrorCorrelation: (request) => { request.documentIdentityCorrelation = "EVALUATION ERROR"; },
    mismatchedCorrelatedUrl: (request) => { request.correlatedDocumentUrl = new URL("/", R1_REQUIRED_BRANCH_URL).href; },
    mismatchedNavigationProvenance: (request) => { request.frameNavigationId = "navigation-bare"; },
  })) {
    const invalidCorrelation = structuredClone(sameRouteFreshDocument);
    mutate(invalidCorrelation.mediaRequests.network.phase4Requests[2]);
    assert.throws(() => validate(invalidCorrelation), /expectedPhase4Present contradicts raw documents\/requests/, `${name} became authoritative`);
  }

  const staticRestoredHistory = structuredClone(report);
  staticRestoredHistory.history.states.bareManifesto.home.continuation = {
    ...staticRestoredHistory.history.states.bareManifesto.home.continuation,
    partnerLink: { top: 360, visible: true },
  };
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
      mediaState: null,
      source: { hasSource: false, src: null, currentSrc: null, srcAttribute: null, videoNodeCount: 1, sourceNodeCount: 0 },
    },
    probe: {
      ...staticRestoredHistory.history.states.bareBack.probe,
      blob: { created: 0, revoked: 0, live: 0 },
      documentId: "bare-static-document",
      manifestoRevealEvents: [],
      navigation: { type: "back_forward", notRestoredReasons: null },
      resources: [],
    },
  };
  staticRestoredHistory.history.checks.bareBackNoManifestoReplay = null;
  staticRestoredHistory.listeners.comparisons = staticRestoredHistory.listeners.comparisons.filter(({ name }) => name !== "bare-back");
  const staticRestorationPhase4Path = staticRestoredHistory.mediaRequests.documents.find(({ documentId }) => documentId === "bare-document").paths[0];
  staticRestoredHistory.mediaRequests.documents = [
    { documentId: "bare-document", labels: ["bare-home", "bare-home-manifesto"], mediaExpected: true, modes: ["enhanced"], paths: [staticRestorationPhase4Path], resourceObservations: 1, selectionDocumentUrl: new URL("/", R1_REQUIRED_BRANCH_URL).href, selectionNavigationId: "navigation-bare", selectionStable: true, sourceFree: false },
    { documentId: "bare-static-document", labels: ["bare-back"], mediaExpected: false, modes: ["static"], paths: [], resourceObservations: 0, selectionDocumentUrl: null, selectionNavigationId: null, selectionStable: true, sourceFree: true },
    staticRestoredHistory.mediaRequests.documents.find(({ documentId }) => documentId === "entry-document"),
  ];
  assert.equal(staticRestoredHistory.bfcache.status, "NOT OBSERVED");
  assert.doesNotThrow(() => validate(staticRestoredHistory), "intentional static/restored-scroll Back was rejected by the assembler");
  for (const [name, mutate] of Object.entries({
    liveBlob: (state) => { state.probe.blob = { created: 1, revoked: 0, live: 1 }; },
    activeRaf: (state) => { state.probe.raf = { scheduled: 1, executed: 0, cancelled: 0, active: 1 }; },
    activeInterval: (state) => { state.probe.intervals = { created: 1, cleared: 0, active: 1 }; },
  })) {
    const contradiction = structuredClone(staticRestoredHistory);
    mutate(contradiction.history.states.bareBack);
    assert.throws(() => validate(contradiction), /history check bareBack(?:Correct|NoManifestoReplay) contradicts raw states/, `static restored Home accepted ${name}`);
  }

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
    const expectedCheck = check === "bareBackNoManifestoReplay"
      ? "bareBack(?:Correct|NoManifestoReplay)"
      : check === "entryBackManifestoResolved"
        ? "entryBack(?:Correct|ManifestoResolved)"
        : check;
    assert.throws(
      () => validate(falsePass),
      new RegExp(`history check ${expectedCheck} contradicts raw states`),
      `${check} PASS was not bound to its raw states`,
    );
  }

  const routeAndNavigationMatrix = {
    bare: ["/", "navigate"],
    bareManifesto: ["/", "navigate"],
    supportAfterBare: ["/for-partners/", "navigate"],
    bareBack: ["/", "back_forward"],
    supportForward: ["/for-partners/", "back_forward"],
    entryInitial: ["/#entry", "navigate"],
    entryResolved: ["/#entry", "navigate"],
    supportAfterEntry: ["/for-partners/", "navigate"],
    entryBack: ["/#entry", "back_forward"],
    entryForward: ["/for-partners/", "back_forward"],
  };
  for (const [stateKey, [expectedUrl, expectedNavigationType]] of Object.entries(routeAndNavigationMatrix)) {
    const wrongUrl = structuredClone(report);
    wrongUrl.history.states[stateKey].url = `${expectedUrl}wrong`;
    assert.throws(() => validate(wrongUrl), /history check .* contradicts raw states/, `${stateKey} URL contradiction was accepted`);
    const wrongNavigation = structuredClone(report);
    wrongNavigation.history.states[stateKey].probe.navigation.type = expectedNavigationType === "navigate" ? "back_forward" : "navigate";
    assert.throws(() => validate(wrongNavigation), /history check .* contradicts raw states/, `${stateKey} navigation contradiction was accepted`);
    for (const menu of [{ open: true, expanded: "true" }, { open: false, expanded: "true" }]) {
      const wrongMenu = structuredClone(report);
      wrongMenu.history.states[stateKey].mobileMenu = menu;
      assert.throws(() => validate(wrongMenu), /history check menuClosed contradicts raw states|history check .* contradicts raw states/, `${stateKey} menu contradiction was accepted`);
    }
  }

  const strictEnhancedMutations = [
    (state) => { state.home.mode = "static"; },
    (state) => { state.home.bootstrap = "restored-scroll"; },
    (state) => { state.home.eligibility = "bypass"; },
    (state) => { state.home.fallback = "media"; },
    (state) => { state.home.mediaState = "loading"; },
    (state) => { state.home.source.hasSource = false; },
    (state) => { state.home.source.currentSrc = ""; },
    (state) => { state.home.source.srcAttribute = ""; },
    (state) => { state.home.source.currentSrc = "blob:https://example.pages.dev/replaced"; },
    (state) => { state.home.source.srcAttribute = "blob:https://example.pages.dev/replaced"; },
    (state) => { state.home.source.videoNodeCount = 2; },
    (state) => { state.home.source.sourceNodeCount = 1; },
    (state) => { state.home.manifestoReveal = "hidden"; },
    (state) => { state.home.manifesto.rendered = false; },
    (state) => { state.home.manifesto.text = "Wrong manifesto"; },
    (state) => { state.home.interactive = "false"; },
    (state) => { state.home.routeNavigation = "concealed"; },
    (state) => { state.home.header = "concealed"; },
    (state) => { state.home.phase = "current"; },
    (state) => { state.probe.raf.active = 1; },
    (state) => { state.probe.intervals.active = 1; },
    (state) => { state.probe.blob.live = 0; },
  ];
  for (const stateKey of ["bareBack", "entryBack"]) {
    for (const mutate of strictEnhancedMutations) {
      const contradiction = structuredClone(report);
      mutate(contradiction.history.states[stateKey]);
      assert.throws(() => validate(contradiction), /history check .* contradicts raw states/, `${stateKey} accepted an incoherent enhanced restoration`);
    }
  }

  for (const [initialKey, resolvedKey, expectedCheck] of [
    ["bare", "bareManifesto", "bareCorrect"],
    ["entryInitial", "entryResolved", "entryCorrect"],
  ]) {
    const mutations = {
      differentDocument: (document) => { document.history.states[resolvedKey].documentId = `${document.history.states[resolvedKey].documentId}-other`; },
      changedSource: (document) => { document.history.states[resolvedKey].home.source.currentSrc = "blob:https://example.invalid/replaced"; },
      changedNavigation: (document) => { document.history.states[resolvedKey].navigationId = `${document.history.states[resolvedKey].navigationId}-other`; },
      initialNotReady: (document) => { document.history.states[initialKey].home.mediaState = "loading"; },
      initialSourceFree: (document) => { document.history.states[initialKey].home.source.hasSource = false; },
      initialBlobMissing: (document) => { document.history.states[initialKey].probe.blob.live = 0; },
      unresolvedDeparture: (document) => { document.history.states[resolvedKey].home.manifesto.rendered = false; },
      reversedCapture: (document) => { document.history.states[resolvedKey].capturedAtEpochMs = document.history.states[initialKey].capturedAtEpochMs - 1; },
      nonPrefixLedger: (document) => {
        document.history.states[initialKey].probe.events = [{
          atEpochMs: document.history.states[initialKey].capturedAtEpochMs - 1,
          documentEventSequence: 1,
          documentId: document.history.states[initialKey].documentId,
          href: new URL(document.history.states[initialKey].url, R1_REQUIRED_BRANCH_URL).href,
          persisted: null,
          type: "popstate",
          visibilityState: "visible",
        }];
        document.history.states[initialKey].probe.documentEventSequence = 1;
      },
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const contradiction = structuredClone(report);
      mutate(contradiction);
      assert.throws(() => validate(contradiction), new RegExp(`history check ${expectedCheck} contradicts raw states`), `${initialKey}→${resolvedKey} ${name} contradiction was accepted`);
    }
  }

  for (const [departureKey, restoredKey, expectedCheck] of [
    ["bareManifesto", "bareBack", "bareBackNoManifestoReplay"],
    ["entryResolved", "entryBack", "entryBackCorrect"],
  ]) {
    const replayed = structuredClone(report);
    replayed.history.states[restoredKey].probe.manifestoRevealEvents.push({
      atEpochMs: replayed.history.states[departureKey].capturedAtEpochMs + 1,
      value: "hidden",
    });
    assert.throws(() => validate(replayed), new RegExp(`history check ${expectedCheck} contradicts raw states`), `${restoredKey} accepted a delayed manifesto replay`);
    const erased = structuredClone(report);
    erased.history.states[restoredKey].probe.manifestoRevealEvents = [];
    assert.throws(() => validate(erased), /history check .* contradicts raw states/, `${restoredKey} accepted an erased manifesto ledger`);
  }

  for (const [name, mutate] of Object.entries({
    mismatchedProbeDocument: (document) => { document.history.states.bare.probe.documentId = "wrong-document"; },
    negativeDocumentSequence: (document) => { document.history.states.bare.probe.documentEventSequence = -1; },
    nonArrayEventLedger: (document) => { document.history.states.bare.probe.events = null; },
    missingOrigin: (document) => { delete document.history.states.bare.origin; },
    wrongOrigin: (document) => { document.history.states.bare.origin = "https://wrong.example"; },
    missingNavigationId: (document) => { document.history.states.bare.navigationId = null; },
    nonPositiveCaptureTime: (document) => { document.history.states.bare.capturedAtEpochMs = 0; },
    negativeMaximumScroll: (document) => { document.history.states.bare.maximumScroll = -1; },
    negativeScroll: (document) => { document.history.states.entryInitial.scrollY = -1; },
    scrollBeyondMaximum: (document) => { document.history.states.bareManifesto.maximumScroll = document.history.states.bareManifesto.scrollY - 1; },
    impossibleListenerCount: (document) => { document.history.states.bare.probe.listeners.active = -1; },
    listenerSumMismatch: (document) => { document.history.states.bare.probe.listeners.active += 1; },
    impossibleRafCount: (document) => { document.history.states.bare.probe.raf.active = -1; },
    impossibleIntervalArithmetic: (document) => { document.history.states.bare.probe.intervals.active = 1; },
    impossibleBlobArithmetic: (document) => { document.history.states.bare.probe.blob.live = 2; },
  })) {
    const contradiction = structuredClone(report);
    mutate(contradiction);
    assert.throws(() => validate(contradiction), /history check .* contradicts raw states|raw snapshot differs|raw counter telemetry differs/, `${name} raw snapshot contradiction was accepted`);
  }

  const cumulativeCounterCases = {
    rafScheduled: [{ raf: { scheduled: 5, executed: 4, cancelled: 1, active: 0 } }, { raf: { scheduled: 4, executed: 3, cancelled: 1, active: 0 } }],
    rafExecuted: [{ raf: { scheduled: 5, executed: 4, cancelled: 1, active: 0 } }, { raf: { scheduled: 5, executed: 3, cancelled: 2, active: 0 } }],
    rafCancelled: [{ raf: { scheduled: 5, executed: 3, cancelled: 2, active: 0 } }, { raf: { scheduled: 5, executed: 4, cancelled: 1, active: 0 } }],
    intervalCreated: [{ intervals: { created: 2, cleared: 2, active: 0 } }, { intervals: { created: 1, cleared: 1, active: 0 } }],
    intervalCleared: [{ intervals: { created: 2, cleared: 2, active: 0 } }, { intervals: { created: 1, cleared: 1, active: 0 } }],
    blobCreated: [{ blob: { created: 3, revoked: 2, live: 1 } }, { blob: { created: 2, revoked: 1, live: 1 } }],
    blobRevoked: [{ blob: { created: 3, revoked: 2, live: 1 } }, { blob: { created: 2, revoked: 1, live: 1 } }],
    listenerAdded: [{ listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 5, removed: 2, duplicateAttempts: 0 } }, { listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 4, removed: 1, duplicateAttempts: 0 } }],
    listenerRemoved: [{ listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 5, removed: 2, duplicateAttempts: 0 } }, { listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 4, removed: 1, duplicateAttempts: 0 } }],
    listenerDuplicates: [{ listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 3, removed: 0, duplicateAttempts: 1 } }, { listeners: { active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 3, removed: 0, duplicateAttempts: 0 } }],
  };
  for (const [name, [beforeOverride, afterOverride]] of Object.entries(cumulativeCounterCases)) {
    const contradiction = structuredClone(report);
    Object.assign(contradiction.history.states.bareManifesto.probe, beforeOverride);
    Object.assign(contradiction.history.states.bareBack.probe, afterOverride);
    assert.throws(() => validate(contradiction), /cumulative telemetry differs/, `${name} cumulative counter decrease was accepted`);
  }
  const disappearingResource = structuredClone(report);
  disappearingResource.history.states.bareBack.probe.resources = [];
  assert.throws(() => validate(disappearingResource), /cumulative telemetry differs/, "a prior resource observation disappeared from a later same-Document snapshot");

  const inventedEarlyHistoryEvent = structuredClone(report);
  const inventedEvent = {
    atEpochMs: inventedEarlyHistoryEvent.history.states.bare.capturedAtEpochMs - 1,
    documentEventSequence: 1,
    documentId: inventedEarlyHistoryEvent.history.states.bare.documentId,
    href: R1_REQUIRED_BRANCH_URL,
    persisted: false,
    type: "pageshow",
    visibilityState: "visible",
  };
  inventedEarlyHistoryEvent.history.states.bare.probe.documentEventSequence = 1;
  inventedEarlyHistoryEvent.history.states.bare.probe.events = [inventedEvent];
  assert.throws(() => validate(inventedEarlyHistoryEvent), /history check bareCorrect contradicts raw states|history event view differs: bare/, "invented early history event was accepted");

  const historyEpoch = 1_800_000_000_000;
  const persistedEvents = [
    { type: "pagehide", persisted: true, documentId: "bare-document", href: new URL("/", R1_REQUIRED_BRANCH_URL).href, documentEventSequence: 1, atEpochMs: historyEpoch + 10, visibilityState: "hidden" },
    { type: "pageshow", persisted: true, documentId: "bare-document", href: new URL("/", R1_REQUIRED_BRANCH_URL).href, documentEventSequence: 2, atEpochMs: historyEpoch + 20, visibilityState: "visible" },
    { type: "pagehide", persisted: true, documentId: "entry-document", href: new URL("/#entry", R1_REQUIRED_BRANCH_URL).href, documentEventSequence: 1, atEpochMs: historyEpoch + 30, visibilityState: "hidden" },
    { type: "pageshow", persisted: true, documentId: "entry-document", href: new URL("/#entry", R1_REQUIRED_BRANCH_URL).href, documentEventSequence: 2, atEpochMs: historyEpoch + 40, visibilityState: "visible" },
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
  const historyViews = {
    bare: [historyEpoch + 5, 0],
    bareManifesto: [historyEpoch + 5, 0],
    supportAfterBare: [historyEpoch + 15, 1],
    bareBack: [historyEpoch + 25, 2],
    supportForward: [historyEpoch + 25, 2],
    entryInitial: [historyEpoch + 25, 2],
    entryResolved: [historyEpoch + 25, 2],
    supportAfterEntry: [historyEpoch + 35, 3],
    entryBack: [historyEpoch + 45, 4],
    entryForward: [historyEpoch + 50, 4],
  };
  for (const [stateKey, [capturedAtEpochMs, eventCount]] of Object.entries(historyViews)) {
    const state = withPairedBfcache.history.states[stateKey];
    state.capturedAtEpochMs = capturedAtEpochMs;
    state.probe.events = structuredClone(persistedEvents.slice(0, eventCount));
    state.probe.documentEventSequence = Math.max(0, ...state.probe.events
      .filter(({ documentId }) => documentId === state.documentId)
      .map(({ documentEventSequence }) => documentEventSequence));
  }
  withPairedBfcache.history.events = persistedEvents;
  withPairedBfcache.bfcache = pairedBfcache;
  withPairedBfcache.history.bfcache = structuredClone(pairedBfcache);
  assert.doesNotThrow(() => validate(withPairedBfcache));

  const mutatePersistedEvent = (document, template, mutate) => {
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (value.type === template.type
        && value.documentId === template.documentId
        && value.documentEventSequence === template.documentEventSequence) mutate(value);
      for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
    };
    visit(document);
  };

  const oneRouteOnly = structuredClone(withPairedBfcache);
  oneRouteOnly.history.events = oneRouteOnly.history.events.slice(0, 2);
  for (const state of Object.values(oneRouteOnly.history.states)) {
    state.probe.events = state.probe.events.filter(({ documentId }) => documentId !== "entry-document");
    state.probe.documentEventSequence = Math.max(0, ...state.probe.events
      .filter(({ documentId }) => documentId === state.documentId)
      .map(({ documentEventSequence }) => documentEventSequence));
  }
  oneRouteOnly.bfcache.persistedEvents = oneRouteOnly.bfcache.persistedEvents.slice(0, 2);
  oneRouteOnly.bfcache.pairedRestorations = oneRouteOnly.bfcache.pairedRestorations.slice(0, 1);
  Object.assign(oneRouteOnly.bfcache.scenarios[1], { status: "NOT OBSERVED", pair: null, coherent: null });
  oneRouteOnly.bfcache.status = "PASS";
  oneRouteOnly.history.bfcache = structuredClone(oneRouteOnly.bfcache);
  assert.throws(() => validate(oneRouteOnly), /BFCache status must be NOT OBSERVED/, "one passing route promoted aggregate BFCache to PASS");

  const staleHideAggregate = structuredClone(withPairedBfcache);
  mutatePersistedEvent(staleHideAggregate, persistedEvents[0], (event) => { event.atEpochMs = historyEpoch + 1; });
  Object.assign(staleHideAggregate.bfcache.scenarios[0], { status: "FAIL", coherent: false });
  staleHideAggregate.bfcache.status = "PASS";
  staleHideAggregate.history.bfcache = structuredClone(staleHideAggregate.bfcache);
  assert.throws(() => validate(staleHideAggregate), /BFCache status must be FAIL/, "a failed route did not dominate aggregate BFCache");

  const staleHide = structuredClone(withPairedBfcache);
  mutatePersistedEvent(staleHide, persistedEvents[0], (event) => { event.atEpochMs = historyEpoch + 1; });
  assert.throws(() => validate(staleHide), /BFCache scenario ledger contradicts raw evidence/, "pagehide predating departure capture became BFCache PASS");

  const postdatedShow = structuredClone(withPairedBfcache);
  mutatePersistedEvent(postdatedShow, persistedEvents[1], (event) => { event.atEpochMs = historyEpoch + 26; });
  assert.throws(() => validate(postdatedShow), /BFCache scenario ledger contradicts raw evidence/, "pageshow postdating the restored snapshot became BFCache PASS");

  const departureContainsHide = structuredClone(withPairedBfcache);
  departureContainsHide.history.states.bareManifesto.probe.events = [structuredClone(departureContainsHide.history.events[0])];
  departureContainsHide.history.states.bareManifesto.probe.documentEventSequence = 1;
  assert.throws(() => validate(departureContainsHide), /BFCache scenario ledger contradicts raw evidence/, "pagehide already present at departure became BFCache PASS");

  const wrongPersistedOrigin = structuredClone(withPairedBfcache);
  mutatePersistedEvent(wrongPersistedOrigin, persistedEvents[0], (event) => { event.href = "https://wrong.example/"; });
  assert.throws(() => validate(wrongPersistedOrigin), /BFCache paired-restoration ledger contradicts raw evidence|BFCache scenario ledger contradicts raw evidence/, "cross-origin persisted event became BFCache PASS");

  const withAuxiliaryEvent = structuredClone(withPairedBfcache);
  const auxiliaryEvent = {
    atEpochMs: historyEpoch + 46,
    documentEventSequence: 3,
    documentId: "entry-document",
    href: new URL("/#entry", R1_REQUIRED_BRANCH_URL).href,
    persisted: null,
    type: "popstate",
    visibilityState: "visible",
  };
  withAuxiliaryEvent.history.events = [...withAuxiliaryEvent.history.events, auxiliaryEvent];
  withAuxiliaryEvent.history.states.entryForward.probe.events.push(structuredClone(auxiliaryEvent));
  withAuxiliaryEvent.history.bfcache = structuredClone(withAuxiliaryEvent.bfcache);
  assert.doesNotThrow(() => validate(withAuxiliaryEvent), "valid auxiliary native event schema was rejected");
  for (const [name, mutate] of Object.entries({
    nonPositiveEventTime: (event) => { event.atEpochMs = 0; },
    missingHref: (event) => { event.href = ""; },
    missingType: (event) => { event.type = ""; },
    missingVisibility: (event) => { event.visibilityState = null; },
    nonPrimitivePersisted: (event) => { event.persisted = "false"; },
    nonPrimitiveSynthetic: (event) => { event.synthetic = "false"; },
  })) {
    const malformed = structuredClone(withAuxiliaryEvent);
    mutate(malformed.history.events.at(-1));
    mutate(malformed.history.states.entryForward.probe.events.at(-1));
    assert.throws(() => validate(malformed), /raw event(?: URL| sequence)? differs/, `${name} event schema was accepted`);
  }

  const staticSameDocumentBfcache = structuredClone(withPairedBfcache);
  staticSameDocumentBfcache.history.states.bareBack.home.mode = "static";
  assert.throws(() => validate(staticSameDocumentBfcache), /history check bareBackCorrect contradicts raw states|BFCache scenario ledger contradicts raw evidence/, "static same-Document state became BFCache PASS");

  const erasedEntryBackEvents = structuredClone(withPairedBfcache);
  erasedEntryBackEvents.history.states.entryBack.probe.events = persistedEvents.slice(0, 2);
  assert.throws(() => validate(erasedEntryBackEvents), /history event view differs: entryBack|BFCache scenario ledger contradicts raw evidence/, "erased prior entryBack events were accepted");

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

  const visibilityHiddenSnapshotPredatesEvent = structuredClone(visibilityWithoutEvents);
  const currentScenario = visibilityHiddenSnapshotPredatesEvent.visibility.scenarios[0];
  const currentDocumentId = currentScenario.transition.before.documentId;
  const hiddenEvent = { type: "visibilitychange", visibilityState: "hidden", documentId: currentDocumentId, documentEventSequence: 1 };
  const visibleEvent = { type: "visibilitychange", visibilityState: "visible", documentId: currentDocumentId, documentEventSequence: 2 };
  currentScenario.transition.hidden.probe.events = [hiddenEvent];
  currentScenario.transition.hidden.probe.documentEventSequence = 0;
  currentScenario.transition.visible.probe.events = [hiddenEvent, visibleEvent];
  currentScenario.transition.visible.probe.documentEventSequence = 2;
  currentScenario.observation = {
    status: "PASS",
    checks: { sameDocument: true, sequenceBound: true, beforeVisible: true, hiddenObserved: true, visibleRestored: true, orderedVisibilityEvents: true },
    transitionEvents: [hiddenEvent, visibleEvent],
  };
  visibilityHiddenSnapshotPredatesEvent.visibility.current = structuredClone(currentScenario.transition);
  assert.throws(() => validate(visibilityHiddenSnapshotPredatesEvent), /visibility raw observation home-current contradicts raw evidence/, "hidden snapshot predating its claimed native event became PASS");

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

  const observedVisibility = structuredClone(report);
  const visibilityEpoch = 1_900_000_000_000;
  const visibilityDocumentId = "visibility-home-document";
  const visibilityNavigationId = "navigation-visibility-home";
  const hiddenVisibilityEvent = {
    atEpochMs: visibilityEpoch + 10,
    documentEventSequence: 1,
    documentId: visibilityDocumentId,
    href: new URL("/", R1_REQUIRED_BRANCH_URL).href,
    persisted: null,
    type: "visibilitychange",
    visibilityState: "hidden",
  };
  const visibleVisibilityEvent = {
    ...hiddenVisibilityEvent,
    atEpochMs: visibilityEpoch + 30,
    documentEventSequence: 2,
    visibilityState: "visible",
  };
  const visibilityState = (label, capturedAtEpochMs, visibilityStateValue, events, documentEventSequence) => {
    const state = structuredClone(report.history.states.bare);
    Object.assign(state, {
      capturedAtEpochMs,
      documentId: visibilityDocumentId,
      label,
      navigationId: visibilityNavigationId,
      scrollY: 400,
      visibilityState: visibilityStateValue,
    });
    Object.assign(state.home, { targetFrame: 10, presentedFrame: 10 });
    Object.assign(state.home, { phase: "physical", segment: "current-orbit" });
    Object.assign(state.home.source, {
      src: `blob:${new URL(R1_REQUIRED_BRANCH_URL).origin}/${visibilityDocumentId}`,
      currentSrc: `blob:${new URL(R1_REQUIRED_BRANCH_URL).origin}/${visibilityDocumentId}`,
      srcAttribute: `blob:${new URL(R1_REQUIRED_BRANCH_URL).origin}/${visibilityDocumentId}`,
      paused: true,
    });
    Object.assign(state.probe, {
      documentId: visibilityDocumentId,
      documentEventSequence,
      events: structuredClone(events),
      resources: [{ url: lifecyclePhase4Path, startTime: 30 }],
    });
    return state;
  };
  const currentTransition = {
    before: visibilityState("home-current-before", visibilityEpoch + 1, "visible", [], 0),
    hidden: visibilityState("home-current-background", visibilityEpoch + 20, "hidden", [hiddenVisibilityEvent], 1),
    visible: visibilityState("home-current-foreground", visibilityEpoch + 40, "visible", [hiddenVisibilityEvent, visibleVisibilityEvent], 2),
  };
  const observedCurrentScenario = observedVisibility.visibility.scenarios.find(({ name }) => name === "home-current");
  Object.assign(observedCurrentScenario, {
    status: "PASS",
    observation: {
      status: "PASS",
      checks: { sameDocument: true, sequenceBound: true, beforeVisible: true, hiddenObserved: true, visibleRestored: true, orderedVisibilityEvents: true },
      transitionEvents: [hiddenVisibilityEvent, visibleVisibilityEvent],
    },
    checks: {
      routeStateStable: true,
      currentOrbitStateStable: true,
      homeMediaPausedWhileHidden: true,
      noPersistentRafWhileHidden: true,
      noPersistentIntervalWhileHidden: true,
      noStaleTargetFrameAfterReturn: true,
      sourcePresenceStableAfterReturn: true,
    },
    failedChecks: [],
    unavailableChecks: [],
    transition: currentTransition,
  });
  observedVisibility.visibility.current = structuredClone(currentTransition);
  const stableListener = structuredClone(observedVisibility.listeners.comparisons[0].before);
  observedVisibility.listeners.comparisons.push(
    { name: "home-current-hidden", documentId: visibilityDocumentId, before: stableListener, after: stableListener, failures: [], stable: true },
    { name: "home-current-foreground", documentId: visibilityDocumentId, before: stableListener, after: stableListener, failures: [], stable: true },
  );
  observedVisibility.mediaRequests.documents.push({
    documentId: visibilityDocumentId,
    labels: ["home-current-background", "home-current-before", "home-current-foreground"],
    mediaExpected: true,
    modes: ["enhanced"],
    paths: [lifecyclePhase4Path],
    resourceObservations: 1,
    selectionDocumentUrl: new URL("/", R1_REQUIRED_BRANCH_URL).href,
    selectionNavigationId: visibilityNavigationId,
    selectionStable: true,
    sourceFree: false,
  });
  observedVisibility.mediaRequests.network.phase4Requests.push({
    ...observedVisibility.mediaRequests.network.phase4Requests[0],
    frameDocumentGeneration: 3,
    frameDocumentId: visibilityDocumentId,
    frameNavigationId: visibilityNavigationId,
  });
  observedVisibility.mediaRequests.network.requestCount += 1;
  observedVisibility.mediaRequests.network.rangeRequestCount += 1;
  assert.doesNotThrow(() => validate(observedVisibility), "valid snapshot-bound hidden/visible scenario was rejected");

  const mutateCurrentTransition = (document, mutate) => {
    const scenario = document.visibility.scenarios.find(({ name }) => name === "home-current");
    mutate(scenario.transition);
    document.visibility.current = structuredClone(scenario.transition);
  };
  for (const [name, mutate] of Object.entries({
    hiddenAlreadyAtBefore: (transition) => {
      transition.before.probe.events = [structuredClone(transition.hidden.probe.events[0])];
      transition.before.probe.documentEventSequence = 1;
    },
    hiddenLedgerNotPrefix: (transition) => {
      transition.hidden.probe.events.unshift({ ...transition.hidden.probe.events[0], type: "popstate", documentEventSequence: 0 });
    },
    visibleAlreadyAtHidden: (transition) => {
      transition.hidden.probe.events.push(structuredClone(transition.visible.probe.events[1]));
      transition.hidden.probe.documentEventSequence = 2;
    },
    staleHiddenTime: (transition) => {
      transition.hidden.probe.events[0].atEpochMs = transition.before.capturedAtEpochMs;
      transition.visible.probe.events[0].atEpochMs = transition.before.capturedAtEpochMs;
    },
    visibleBeforeHiddenCapture: (transition) => {
      transition.visible.probe.events[1].atEpochMs = transition.hidden.capturedAtEpochMs;
    },
    visibleAfterCapture: (transition) => {
      transition.visible.probe.events[1].atEpochMs = transition.visible.capturedAtEpochMs + 1;
    },
    wrongTransitionOrigin: (transition) => { transition.hidden.origin = "https://wrong.example"; },
    wrongTransitionRoute: (transition) => { transition.hidden.url = "/for-partners/"; },
    wrongTransitionNavigation: (transition) => { transition.hidden.navigationId = "navigation-other"; },
  })) {
    const stale = structuredClone(observedVisibility);
    mutateCurrentTransition(stale, mutate);
    assert.throws(() => validate(stale), /visibility raw observation home-current contradicts raw evidence/, `${name} visibility evidence became PASS`);
  }
  for (const [name, mutate] of Object.entries({
    missingAttachedBlob: (state) => { state.probe.blob = { created: 0, revoked: 0, live: 0 }; },
    activeReturnRaf: (state) => { state.probe.raf = { scheduled: 1, executed: 0, cancelled: 0, active: 1 }; },
    activeReturnInterval: (state) => { state.probe.intervals = { created: 1, cleared: 0, active: 1 }; },
  })) {
    const incoherentReturn = structuredClone(observedVisibility);
    mutateCurrentTransition(incoherentReturn, (transition) => mutate(transition.visible));
    assert.throws(() => validate(incoherentReturn), /visibility lifecycle checks home-current contradicts raw evidence/, `${name} Home foreground return became PASS`);
  }
  for (const [name, mutate] of Object.entries({
    hiddenSourceRemoved: (transition) => { transition.hidden.home.source.hasSource = false; },
    hiddenSourceSwapped: (transition) => {
      const replacement = "blob:https://example.pages.dev/replaced";
      Object.assign(transition.hidden.home.source, { src: replacement, currentSrc: replacement, srcAttribute: replacement });
    },
    hiddenCurrentSrcMismatch: (transition) => { transition.hidden.home.source.currentSrc = "blob:https://example.pages.dev/mismatch"; },
    hiddenVideoNodeCount: (transition) => { transition.hidden.home.source.videoNodeCount = 2; },
    hiddenNotPaused: (transition) => { transition.hidden.home.source.paused = false; },
    wrongCurrentPhase: (transition) => { transition.hidden.home.phase = "settled"; },
    wrongCurrentSegment: (transition) => { transition.visible.home.segment = "arrival"; },
  })) {
    const contradiction = structuredClone(observedVisibility);
    mutateCurrentTransition(contradiction, mutate);
    assert.throws(() => validate(contradiction), /visibility lifecycle checks home-current contradicts raw evidence/, `${name} Home transition became PASS`);
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
  assert.throws(() => validate(changedRawStartTime), /(?:cumulative telemetry|media document ledger).*differs|media document ledger contradicts raw evidence/);

  const inventedDocumentMasksDuplicateRequests = structuredClone(report);
  const maskedPath = inventedDocumentMasksDuplicateRequests.mediaRequests.documents[0].paths[0];
  inventedDocumentMasksDuplicateRequests.mediaRequests.documents.push({
    documentId: "invented-home-document",
    labels: ["invented-home"],
    paths: [maskedPath],
    resourceObservations: 1,
  });
  inventedDocumentMasksDuplicateRequests.mediaRequests.network.phase4Requests = [
    requestFor(0, maskedPath),
    requestFor(0, maskedPath, null, { frameNavigationId: "navigation-invented" }),
    requestFor(1, maskedPath),
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
    selectionDocumentUrl: null,
    selectionNavigationId: null,
    selectionStable: true,
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

  const missingSelectedNetworkPath = structuredClone(report);
  const desktopPath = "/media/cinematic/phase-4r2/media/desktop.mp4";
  missingSelectedNetworkPath.mediaRequests.network.phase4Requests = [
    requestFor(0, desktopPath, "bytes=0-1023"),
    requestFor(1, desktopPath, "bytes=0-1023"),
  ];
  missingSelectedNetworkPath.mediaRequests.network.uniquePaths = [desktopPath];
  assert.throws(() => validate(missingSelectedNetworkPath), /expectedPhase4Present contradicts raw documents\/requests/, "selected path absent from the network became PASS");

  const orphanNetworkPath = structuredClone(report);
  orphanNetworkPath.mediaRequests.network.phase4Requests.push(requestFor(0, desktopPath, "bytes=0-1023", { frameNavigationId: "navigation-orphan" }));
  orphanNetworkPath.mediaRequests.network.requestCount += 1;
  orphanNetworkPath.mediaRequests.network.rangeRequestCount += 1;
  orphanNetworkPath.mediaRequests.network.uniquePaths = [desktopPath, report.mediaRequests.documents[0].paths[0]].sort();
  assert.throws(() => validate(orphanNetworkPath), /expectedPhase4Present contradicts raw documents\/requests/, "orphan ranged network path became PASS");

  for (const [name, mutate] of Object.entries({
    wrongMethod: (request) => { request.method = "POST"; },
    wrongResourceType: (request) => { request.resourceType = "media"; },
    preNavigationRequest: (request) => { request.frameNavigationId = "pre-navigation"; },
    supportingRouteDocument: (request) => { request.documentUrl = new URL("/for-partners/", R1_REQUIRED_BRANCH_URL).href; },
    queriedHomeDocument: (request) => { request.documentUrl = new URL("/?forged=1", R1_REQUIRED_BRANCH_URL).href; },
    queriedEntryDocument: (request) => { request.documentUrl = new URL("/?forged=1#entry", R1_REQUIRED_BRANCH_URL).href; },
    crossOriginRequest: (request) => { request.url = `https://example.invalid${request.path}`; },
  })) {
    const invalidRequestAuthority = structuredClone(report);
    mutate(invalidRequestAuthority.mediaRequests.network.phase4Requests[0]);
    assert.throws(() => validate(invalidRequestAuthority), /expectedPhase4Present contradicts raw documents\/requests/, `${name} media request became PASS`);
  }

  const validNonRangeRequest = structuredClone(report);
  validNonRangeRequest.mediaRequests.network.phase4Requests[0].range = null;
  Object.assign(validNonRangeRequest.mediaRequests.network, {
    rangeRequestCount: 1,
    nonRangeRequestCount: 1,
    nonRangeSelections: [{ path: lifecyclePhase4Path, count: 1, logicalHomeDocuments: 2 }],
  });
  assert.doesNotThrow(() => validate(validNonRangeRequest), "a genuine null/non-range request was rejected");

  for (const malformedRange of ["", "items=0-1", "bytes=", "bytes=-", "bytes=5-3", "bytes=-0", 42, false]) {
    const malformed = structuredClone(report);
    malformed.mediaRequests.network.phase4Requests[0].range = malformedRange;
    Object.assign(malformed.mediaRequests.network, {
      rangeRequestCount: 1,
      nonRangeRequestCount: 1,
      nonRangeSelections: [{ path: lifecyclePhase4Path, count: 1, logicalHomeDocuments: 2 }],
    });
    assert.throws(() => validate(malformed), /expectedPhase4Present contradicts raw documents\/requests/, `malformed Range ${String(malformedRange)} became PASS or bypassed accounting`);
  }
  for (const validRange of ["bytes=0-", "bytes=-5", "bytes=0-1, 4-9"]) {
    const valid = structuredClone(report);
    valid.mediaRequests.network.phase4Requests[0].range = validRange;
    assert.doesNotThrow(() => validate(valid), `valid Range ${validRange} was rejected`);
  }

  const swappedLogicalDocumentUrls = structuredClone(report);
  const [bareRequest, entryRequest] = swappedLogicalDocumentUrls.mediaRequests.network.phase4Requests;
  [bareRequest.documentUrl, entryRequest.documentUrl] = [entryRequest.documentUrl, bareRequest.documentUrl];
  assert.throws(() => validate(swappedLogicalDocumentUrls), /expectedPhase4Present contradicts raw documents\/requests/, "request document URLs were accepted after swapping logical Home routes");

  const forgedRawSelectionNavigation = structuredClone(report);
  forgedRawSelectionNavigation.history.states.bare.navigationId = "navigation-forged";
  assert.throws(() => validate(forgedRawSelectionNavigation), /history check bareCorrect contradicts raw states|media document ledger contradicts raw evidence/, "first raw media observation navigation was not bound");

  const forgedSummarySelectionNavigation = structuredClone(report);
  forgedSummarySelectionNavigation.mediaRequests.documents[0].selectionNavigationId = "navigation-forged";
  assert.throws(() => validate(forgedSummarySelectionNavigation), /media document ledger contradicts raw evidence/, "document selectionNavigationId was not bound to raw snapshots");

  const duplicateDocumentNavigation = structuredClone(report);
  for (const stateKey of ["entryInitial", "entryResolved", "entryBack"]) duplicateDocumentNavigation.history.states[stateKey].navigationId = "navigation-bare";
  duplicateDocumentNavigation.mediaRequests.documents.find(({ documentId }) => documentId === "entry-document").selectionNavigationId = "navigation-bare";
  duplicateDocumentNavigation.mediaRequests.network.phase4Requests[1].frameNavigationId = "navigation-bare";
  assert.throws(() => validate(duplicateDocumentNavigation), /expectedPhase4Present contradicts raw documents\/requests/, "one selection navigation represented two enhanced logical Home documents");

  const collapsedNavigationCoverage = structuredClone(report);
  collapsedNavigationCoverage.mediaRequests.network.phase4Requests[1].frameNavigationId = collapsedNavigationCoverage.mediaRequests.network.phase4Requests[0].frameNavigationId;
  assert.throws(() => validate(collapsedNavigationCoverage), /expectedPhase4Present contradicts raw documents\/requests/, "one navigation ID was allowed to cover two logical Home documents");

  const duplicateDocumentSelection = structuredClone(report);
  const secondPhase4Path = "/media/cinematic/phase-4r2/media/desktop.mp4";
  duplicateDocumentSelection.history.states.bareBack.probe.resources.push({ url: secondPhase4Path, startTime: 11 });
  duplicateDocumentSelection.mediaRequests.documents[0].paths = [secondPhase4Path, duplicateDocumentSelection.mediaRequests.documents[0].paths[0]].sort();
  duplicateDocumentSelection.mediaRequests.documents[0].resourceObservations = 2;
  duplicateDocumentSelection.mediaRequests.network.phase4Requests.push(requestFor(0, secondPhase4Path, "bytes=0-1023"));
  duplicateDocumentSelection.mediaRequests.network.requestCount = 3;
  duplicateDocumentSelection.mediaRequests.network.rangeRequestCount = 3;
  duplicateDocumentSelection.mediaRequests.network.uniquePaths = [secondPhase4Path, report.mediaRequests.documents[0].paths[0]].sort();
  assert.throws(() => validate(duplicateDocumentSelection), /expectedPhase4Present contradicts raw documents\/requests|noDuplicateSourceWithinDocument contradicts raw document selections/);

  const selectedWithoutObservation = structuredClone(report);
  selectedWithoutObservation.mediaRequests.documents[0].resourceObservations = 0;
  assert.throws(() => validate(selectedWithoutObservation), /media document ledger contradicts raw evidence/);

  const duplicateNonRangeSelection = structuredClone(report);
  const selectedPath = duplicateNonRangeSelection.mediaRequests.documents[0].paths[0];
  duplicateNonRangeSelection.mediaRequests.network.phase4Requests = [
    requestFor(0, selectedPath),
    requestFor(0, selectedPath),
    requestFor(1, selectedPath),
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
  assert.match(r1Template.deployment.checkRunId, /check-run numeric ID/);
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
