import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  ASSEMBLED_PAYLOAD_COUNT,
  BROWSER_MANIFEST_PATH,
  BROWSER_REPORT_PATH,
  EXPECTED_BROWSER_SOURCE_PATHS,
  EXPECTED_NATIVE_SOURCE_PATHS,
  PHASE7B_ASSEMBLER_SCHEMA,
  PHASE7B_BROWSER_MANIFEST_SCHEMA,
  PHASE7B_BROWSER_QA_SCHEMA,
  PHASE7B_DEPLOYMENT_SCHEMA,
  PHASE7B_RESPONSIVE_SELECTION,
  assemblePhase7BReviewEvidence,
  parseArguments,
  selfTest,
  validateAcceptedPhase7ARegression,
  validateDeploymentInput,
  validateRepositoryAuthority,
} from "../scripts/assemble-phase7b-review-evidence.mjs";
import {
  PHASE7B_BRANCH,
  PHASE7B_BRANCH_PREVIEW,
  PHASE7B_CORE_VIEWPORTS,
  PHASE7B_FROZEN_MAIN,
  PHASE7B_GATES,
  PHASE7B_PARENT,
  PHASE7B_PRODUCTION_PATHS,
  PHASE7B_RECORDING_SCENARIOS,
} from "../scripts/phase7b-contract.mjs";
import { PHYSICAL_ASSETS } from "../scripts/phase7a-contract.mjs";
import {
  PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH,
  PHASE7B_INSTALLED_CHROME_200_SCHEMA,
  PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH,
  PHASE7B_INSTALLED_CHROME_RECORDING_PATH,
  PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH,
  PHASE7B_NATIVE_200_LIMITATION_SCHEMA,
  PHASE7B_STANDARD_RECORDING_SCENARIOS,
  REQUIRED_PHASE7B_EVIDENCE,
  readPhase7BEvidenceDirectory,
} from "../scripts/package-phase7b-human-review.mjs";
import { crc32, sha256, stableJson } from "../scripts/package-phase7a-human-review.mjs";

const HEAD = "a".repeat(40);
const FIRST = "b".repeat(40);
const json = (value) => Buffer.from(stableJson(value));

function chunk(type, payload = Buffer.alloc(0)) {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + payload.length);
  output.writeUInt32BE(payload.length, 0);
  name.copy(output, 4);
  payload.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, payload])), 8 + payload.length);
  return output;
}

function png(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const scanlines = Buffer.alloc((width + 1) * height);
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(scanlines)), chunk("IEND")]);
}

function box(type, payload = Buffer.alloc(0)) {
  const output = Buffer.alloc(8 + payload.length);
  output.writeUInt32BE(output.length, 0);
  output.write(type, 4, 4, "ascii");
  payload.copy(output, 8);
  return output;
}

function mp4() {
  return Buffer.concat([box("ftyp", Buffer.from("isom0000isomiso2")), box("moov"), box("mdat", Buffer.from([1, 2, 3, 4]))]);
}

function repository() {
  return validateRepositoryAuthority({
    branch: PHASE7B_BRANCH,
    head: HEAD,
    status: "",
    upstream: `origin/${PHASE7B_BRANCH}`,
    upstreamHead: HEAD,
    localMain: PHASE7B_FROZEN_MAIN,
    originMain: PHASE7B_FROZEN_MAIN,
    acceptedPhase6Ancestry: true,
    acceptedPhase7AAncestry: true,
    mergeCount: 0,
    changedSourcePaths: [...PHASE7B_PRODUCTION_PATHS],
    commitRows: [
      { hash: FIRST, parents: [PHASE7B_PARENT], subject: "implement persistent Workpiece" },
      { hash: HEAD, parents: [FIRST], subject: "close Phase 7B evidence" },
    ],
  }, HEAD);
}

function capturedRepository(authority) {
  return {
    branch: authority.branch,
    head: authority.head,
    requiredParent: PHASE7B_PARENT,
    directParent: authority.directParent,
    upstream: authority.upstream,
    upstreamHead: authority.upstreamHead,
    localMain: authority.localMain,
    originMain: authority.originMain,
    worktreeClean: true,
    zeroMergeCommits: true,
  };
}

function metrics() {
  return { listenerAdds: { scroll: 1 }, listenerRemoves: {}, activeObservers: 1, pendingAnimationFrames: 0, activeIntervals: 0, cls: 0, longtasks: [], runtimeScrollWrites: [] };
}

function visualCase(id) {
  const hash = "c".repeat(64);
  const authority = (revision) => ({ revision, sourcePngBytes: 100, sourcePngSha256: hash, normalizedSha256: hash, semantic: { horizontalOverflow: false } });
  return {
    id,
    baseline: authority(PHASE7B_PARENT),
    current: authority(HEAD),
    comparisonRegion: { width: 1440, height: 900, excludedRows: 0, exclusionReason: null },
    metrics: { width: 1440, height: 900, pixels: 1296000, differingPixels: 0, differingChannels: 0, changedFraction: 0, meanAbsoluteChannelDelta: 0, rootMeanSquareChannelDelta: 0, maximumChannelDelta: 0, differenceBounds: null, exact: true },
    classification: "EXACT",
    explanation: "Normalized pixels are exact.",
    retainedMedia: [],
    status: "PASS",
    limitations: [],
    failures: [],
    checks: { semanticMatch: true, noOverflow: true, matchedDimensions: true, explainedPixels: true, insertedChapterOnly: true },
  };
}

function browserResult(engine, files) {
  const responsive = PHASE7B_CORE_VIEWPORTS.map(([width, height]) => {
    const relativePath = `screenshots/${engine}/${width}x${height}-operating-field.png`;
    const data = files.get(relativePath);
    return {
      viewport: { id: `${width}x${height}`, width, height },
      snapshot: { horizontalOverflow: false, domNodes: 100, svgElements: 60 },
      projection: [{ observed: { state: "decide" } }],
      targetSize: { status: "PASS" },
      screenshot: { relativePath, bytes: data.length, sha256: sha256(data), width, height, decodeStatus: "PASS" },
      status: "PASS",
      limitations: [], failures: [], checks: { structure: true, projection: true, targets: true },
    };
  });
  const fallback = [
    ["reduced-motion", 390, 844],
    ["no-javascript", 390, 844],
    ["fallback-fonts", 320, 800],
  ].map(([id]) => {
    const relativePath = `screenshots/${engine}/fallback-${id}.png`;
    const data = files.get(relativePath);
    return { id, state: { mode: "static", horizontalOverflow: false }, targets: { status: "PASS" }, screenshot: { relativePath, bytes: data.length, sha256: sha256(data), width: id === "fallback-fonts" ? 320 : 390, height: id === "fallback-fonts" ? 800 : 844, decodeStatus: "PASS" }, status: "PASS", limitations: [], failures: [], checks: { semanticHeading: true, oneWorkpiece: true, noHorizontalOverflow: true, staticAuthoredStages: true, correctMode: true, targets: true } };
  });
  const recordings = PHASE7B_RECORDING_SCENARIOS.map((scenario) => {
    if (engine === "webkit" || scenario === "installed-chrome-200-percent") return { engine, scenario, nativeZoomAuthority: scenario === "installed-chrome-200-percent", relativePath: null, status: "LIMITATION", failures: [], limitations: ["Governed limitation." ] };
    const relativePath = `recordings/${engine}/${scenario}.mp4`;
    const data = files.get(relativePath);
    return { engine, scenario, nativeZoomAuthority: false, relativePath, status: "PASS", failures: [], limitations: [], media: { bytes: data.length, sha256: sha256(data), decodeStatus: "PASS", codec: "h264", pixelFormat: "yuv420p", width: 1280, height: 720 } };
  });
  const section = (checks = { complete: true }) => ({ status: "PASS", failures: [], limitations: [], checks });
  return {
    identity: { engine, version: "140.0.0.0", evidenceClass: engine === "webkit" ? "playwright-webkit-proxy" : engine === "chromium" ? "installed-headed-chromium" : "playwright-managed-firefox", statement: engine === "webkit" ? "Playwright WebKit proxy evidence only; not physical Safari." : "Browser authority." },
    responsive: { cases: responsive, ...section({ allViewports: true, everyCase: true }) },
    visualRegression: { baselineAuthority: { revision: PHASE7B_PARENT, captureOrigin: "ACCEPTED_IMMUTABLE_PHASE7A" }, currentAuthority: { revision: HEAD, captureOrigin: "CAPTURE_ORIGIN" }, retainedPngs: false, cases: ["manifesto-entry", "audience-bifurcation", "field-map-closed", "field-map-open"].map(visualCase), ...section({ fourFrozenStates: true, everyDifferenceExplained: true, baselineMediaNotRetainedByDefault: true }) },
    projection: { metrics: metrics(), ...section({ forwardOrder: true, reverseOrder: true }) },
    fallback: { cases: fallback, ...section({ completeMatrix: true, everyCase: true }) },
    accessibility: { cases: ["desktop", "narrow"].map((id) => ({ viewport: { id }, result: { violations: [], incomplete: [{ id: "color-contrast" }], passes: 10 }, status: "LIMITATION", failures: [], limitations: ["Manual contrast required."], checks: { zeroViolations: true, zeroNonContrastIncomplete: true } })), status: "LIMITATION", failures: [], limitations: ["Manual contrast required."], checks: { completeMatrix: true, noFailures: true } },
    regression: section({ frozenHooks: true, physicalFrameEndpoints: true }),
    history: section({ entryIntent: true, forwardRestoration: true }),
    lifecycle: { before: { dom: 100, svg: 60, metrics: metrics() }, cycles: Array.from({ length: 10 }, (_, index) => ({ cycle: index + 1, forward: { state: "decide" }, reverse: { state: "open-field" }, workpieceSame: true })), after: { dom: 100, svg: 60, metrics: metrics() }, supported: { cls: true, longtask: true }, departed: 0, restored: { fields: 1, workpieces: 1 }, explicitDepartureCleanup: { controller: null, metrics: metrics() }, bfcacheObserved: false, status: "LIMITATION", failures: [], limitations: ["BFCache restoration was not observed.", "Hidden-document visibility cleanup requires separate evidence."], checks: { tenCycles: true, exactStates: true, persistentWorkpiece: true, stableDom: true, listenerInvariant: true, observerBudget: true, idleRafBudget: true, intervalBudget: true, clsBudget: true, longTaskBudget: true, nativeScrollOwnership: true, routeDepartureCleanup: true, pagehideCleanup: true } },
    network: { normal: { status: "PASS", requestCount: 4 }, adversity: [{ policy: "blocked", status: "PASS" }, { policy: "slow", status: "PASS" }], ...section({ normalNetwork: true, networkFailureResilience: true }) },
    recordings: { recordings, status: "LIMITATION", failures: [], limitations: ["Native zoom is separate."], checks: { completeInventory: true, noRecordingFailures: true, decodedMedia: true } },
    status: "LIMITATION", failures: [], limitations: ["Governed engine limitation."],
    checks: { responsive: true, visualRegression: true, projection: true, fallback: true, accessibility: true, regression: true, history: true, lifecycle: true, network: true, recordings: true },
  };
}

function browserFixture(authority) {
  const files = new Map();
  const pngs = new Map();
  for (const [width, height] of PHASE7B_CORE_VIEWPORTS) pngs.set(`${width}x${height}`, png(width, height));
  for (const engine of ["chromium", "firefox", "webkit"]) {
    for (const [width, height] of PHASE7B_CORE_VIEWPORTS) files.set(`screenshots/${engine}/${width}x${height}-operating-field.png`, pngs.get(`${width}x${height}`));
    files.set(`screenshots/${engine}/fallback-reduced-motion.png`, pngs.get("390x844"));
    files.set(`screenshots/${engine}/fallback-no-javascript.png`, pngs.get("390x844"));
    files.set(`screenshots/${engine}/fallback-fallback-fonts.png`, pngs.get("320x800"));
  }
  const video = mp4();
  for (const engine of ["chromium", "firefox"]) for (const scenario of PHASE7B_STANDARD_RECORDING_SCENARIOS) files.set(`recordings/${engine}/${scenario}.mp4`, video);
  const results = ["chromium", "firefox", "webkit"].map((engine) => browserResult(engine, files));
  const report = { schema: PHASE7B_BROWSER_QA_SCHEMA, status: "LIMITATION", branch: PHASE7B_BRANCH, revision: HEAD, captureOrigin: "CAPTURE_ORIGIN", repository: capturedRepository(authority), results, limitations: ["WebKit is proxy evidence."], humanGates: Object.fromEntries(PHASE7B_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"])), checks: { noEngineFailures: true } };
  files.set(BROWSER_REPORT_PATH, json(report));
  const entries = EXPECTED_BROWSER_SOURCE_PATHS.map((relativePath) => ({ relativePath, bytes: files.get(relativePath).length, sha256: sha256(files.get(relativePath)) }));
  files.set(BROWSER_MANIFEST_PATH, json({ schema: PHASE7B_BROWSER_MANIFEST_SCHEMA, status: "PASS", entryCount: entries.length, totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), entries, duplicatePaths: false, traversalPaths: false, nestedArchives: false, sourceArchives: false, privatePaths: false }));
  return files;
}

function nativeFixture(authority) {
  const video = mp4();
  const screenshot = png(2, 2);
  const report = {
    schema: PHASE7B_INSTALLED_CHROME_200_SCHEMA, status: "PASS", browser: "Google Chrome", genuineInstalledChrome: true, nativeZoomPercent: 200, visibleZoomConfirmation: "Zoom: 200%", branch: PHASE7B_BRANCH, revision: HEAD, repository: capturedRepository(authority), browserVersion: "Chrome/140.0.0.0", humanGate: "PENDING HUMAN REVIEW", environmentalLimitation: null,
    zoomGeometry: { status: "PASS", widthRatio: 2, dprRatio: 2, checks: { widthRatio: true, dprRatio: true, visualViewportUnscaled: true, noCssZoom: true, noTransformSubstitute: true } },
    method: { stateCount: 5, stages: ["FRAME", "SOURCE", "ASSESS", "TEST", "DECIDE"].map((stage) => ({ stage, headingFullyVisible: true, copyFullyVisible: true, internalWordBreaking: false, horizontalOverflow: false })) },
    fieldMap: { status: "PASS", checks: { visible: true, keyboard: true } },
    recording: { path: path.posix.basename(PHASE7B_INSTALLED_CHROME_RECORDING_PATH), bytes: video.length, sha256: sha256(video), fullDecode: true },
    screenshot: { path: path.posix.basename(PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH), bytes: screenshot.length, sha256: sha256(screenshot) },
    limitations: ["The bound PNG supplies visible browser UI authority."],
  };
  const firefox = { schema: PHASE7B_NATIVE_200_LIMITATION_SCHEMA, status: "LIMITATION", engine: "firefox", classification: "NOT APPLICABLE", nativeZoomPercent: 200, recording: null, reason: "Installed-Chrome browser-native zoom cannot truthfully be substituted with Firefox." };
  return new Map([
    [path.posix.basename(PHASE7B_INSTALLED_CHROME_RECORDING_PATH), video],
    [path.posix.basename(PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH), screenshot],
    [path.posix.basename(PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH), json(report)],
    [path.posix.basename(PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH), json(firefox)],
  ]);
}

function deploymentFixture(authority) {
  const deploymentId = "12345678-1234-4234-8234-123456789abc";
  const pass = (data = {}) => ({ status: "PASS", data: { status: "PASS", ...data } });
  const routes = Array.from({ length: 10 }, (_, index) => ({ id: `route-${index}`, status: "PASS" }));
  return { schema: PHASE7B_DEPLOYMENT_SCHEMA, status: "PASS", parity: "PASS", deployedSha: authority.head, deploymentId, environment: "preview", projectName: "qsite1", immutableUrl: "https://12345678.qsite1.pages.dev/", branchUrl: PHASE7B_BRANCH_PREVIEW, inputs: { expectedDeployedSha: authority.head, branch: PHASE7B_BRANCH, requiredParent: PHASE7B_PARENT, frozenMain: PHASE7B_FROZEN_MAIN, localDist: "dist" }, repository: pass(), deployment: pass(), productionIsolation: pass(), phase4: pass(), runtimeRequests: pass({ requestCount: 4 }), dist: { status: "PASS", files: [{ relativePath: "_astro/app.js", bytes: 10 }, { relativePath: "_astro/app.css", bytes: 20 }], totals: { bytes: 30 }, exactHtmlAuthority: ["index.html"], exactPublicRouteAuthority: routes }, origins: { immutable: pass({ origin: "https://12345678.qsite1.pages.dev/", exactPublicRoutes: routes, real404: { status: "PASS" } }), branch: pass({ origin: PHASE7B_BRANCH_PREVIEW, exactPublicRoutes: routes, real404: { status: "PASS" } }) }, checks: { repository: true, signed: true, isolation: true, immutable: true, branch: true, real404: true, runtime: true, phase4: true }, failures: [] };
}

async function writeTree(root, files) {
  for (const [relativePath, data] of files) {
    const absolute = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, data);
  }
}

function productionDiff() {
  return Buffer.from(PHASE7B_PRODUCTION_PATHS.map((relativePath) => `diff --git a/${relativePath} b/${relativePath}\n--- a/${relativePath}\n+++ b/${relativePath}\n@@ -0,0 +1 @@\n+phase7b\n`).join(""));
}

function phase4Authority() {
  return { status: "PASS", assetCount: PHYSICAL_ASSETS.length, assets: PHYSICAL_ASSETS.map(([assetPath, digest]) => ({ path: assetPath, sha256: digest, bytes: 1, status: "PASS" })) };
}

const manualContrast = { status: "PASS", method: "WCAG relative luminance", worstCaseBackground: "#0b0e0f", measurements: [{ role: "muted", ratio: 6.416, essentialText: true, status: "PASS" }, { role: "body", ratio: 11.715, essentialText: true, status: "PASS" }, { role: "white", ratio: 19.374, essentialText: true, status: "PASS" }, { role: "focus", ratio: 6.749, essentialText: true, status: "PASS" }, { role: "signal", ratio: 4.159, essentialText: false, status: "DECORATION" }] };
const sourcePerformance = { status: "PASS", rawJavaScriptDelta: 1000, rawCssDelta: 2000, builtJavaScriptDelta: "NOT OBSERVED", builtCssDelta: "NOT OBSERVED", addedAssetBytes: 0, runtimeRequestDelta: 0, runtimeDependencyDelta: 0 };
const acceptedPhase7A = { status: "PASS", schema: "accepted", method: "exact pixels", acceptedRevision: PHASE7B_PARENT, sourceAuthoritySha256: "d".repeat(64), exactDecodedPixelComparisons: [] };

test("assembler creates exactly the governed 50-payload staging tree without creating a ZIP", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase7b-assembler-"));
  try {
    const browserDir = path.join(temporary, "browser");
    const nativeDir = path.join(temporary, "native");
    await mkdir(browserDir); await mkdir(nativeDir);
    const authority = repository();
    await writeTree(browserDir, browserFixture(authority));
    await writeTree(nativeDir, nativeFixture(authority));
    const deploymentPath = path.join(temporary, "deployment.json");
    const acceptedPath = path.join(temporary, "accepted-phase7a.json");
    await writeFile(deploymentPath, json(deploymentFixture(authority)));
    await writeFile(acceptedPath, json({ status: "PASS" }));
    const outputDir = path.join(temporary, "assembled");
    const result = await assemblePhase7BReviewEvidence({ revision: HEAD, browserQaDir: browserDir, nativeChromeDir: nativeDir, deploymentReport: deploymentPath, phase7aRegression: acceptedPath, outputDir }, {
      boundaryOptions: { repositoryRoot: path.join(temporary, "forbidden-repository"), temporaryRoot: path.join(temporary, "forbidden-temporary") },
      readRepositoryAuthority: async () => authority,
      readProductionDiff: async () => productionDiff(),
      readPhase4Authority: async () => phase4Authority(),
      readManualContrastAuthority: async () => manualContrast,
      readSourcePerformanceAuthority: async () => sourcePerformance,
      validateAcceptedPhase7ARegression: () => acceptedPhase7A,
    });
    assert.deepEqual({ status: result.status, payloads: result.payloadCount, recordings: result.recordings, images: result.images, packaged: result.packageCreated }, { status: "PASS", payloads: 50, recordings: 19, images: 7, packaged: false });
    const entries = await readPhase7BEvidenceDirectory(outputDir);
    assert.equal(entries.length, ASSEMBLED_PAYLOAD_COUNT);
    assert.deepEqual(entries.map(({ relativePath }) => relativePath).sort(), REQUIRED_PHASE7B_EVIDENCE.map(({ relativePath }) => relativePath).sort());
    assert.equal(entries.some(({ relativePath }) => relativePath.endsWith(".zip")), false);
    const accessibility = JSON.parse((await readFile(path.join(outputDir, "06-assurance", "accessibility.json"))).toString("utf8"));
    assert.equal(accessibility.zeroNonContrastIncomplete, true);
    assert.equal(accessibility.manualWorstCaseContrast.status, "PASS");
    const regression = JSON.parse((await readFile(path.join(outputDir, "06-assurance", "phase7a-regression.json"))).toString("utf8"));
    assert.equal(regression.acceptedBaselineAuthority.acceptedRevision, PHASE7B_PARENT);
    assert.equal(regression.engines.every(({ cases }) => cases.length === 4), true);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("assembler topology and CLI bind 67 source artifacts, six chosen images and an explicit accepted baseline", () => {
  assert.deepEqual(selfTest(), { schema: PHASE7B_ASSEMBLER_SCHEMA, status: "PASS", browserSourcePayloads: 67, assembledPayloads: 50, ordinaryRecordings: 18, nativeRecordings: 1, selectedResponsiveImages: 6, packageCreated: false });
  assert.equal(EXPECTED_BROWSER_SOURCE_PATHS.length, 67);
  assert.equal(EXPECTED_NATIVE_SOURCE_PATHS.length, 4);
  assert.equal(PHASE7B_RESPONSIVE_SELECTION.length, 6);
  assert.throws(() => parseArguments(["--revision", HEAD, "--browser-qa-dir", "a", "--native-chrome-dir", "b", "--deployment-report", "c", "--output-dir", "d"]), /phase7a-regression/);
});

test("repository, deployment and accepted visual inputs fail closed on counterfeit authority", () => {
  assert.throws(() => validateRepositoryAuthority({ ...repository(), changedSourcePaths: [...PHASE7B_PRODUCTION_PATHS, "src/counterfeit.ts"], commitRows: [{ hash: HEAD, parents: [PHASE7B_PARENT], subject: "x" }], status: "" }, HEAD), /changed source path/);
  const authority = repository();
  assert.throws(() => validateDeploymentInput({ ...deploymentFixture(authority), status: "FAIL" }, authority), /schema\/status\/parity/);
  assert.throws(() => validateAcceptedPhase7ARegression({ schema: "counterfeit", status: "PASS" }), /visual regression|must be an object|field inventory/i);
});

