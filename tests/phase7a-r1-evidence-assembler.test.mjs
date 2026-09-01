import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  ASSEMBLER_SCHEMA,
  EXACT_PARENT_HOME_DOCUMENT_AUTHORITY,
  EXPECTED_QA_RESPONSIVE_MINIMUMS,
  EXPECTED_QA_ROUTE_COUNTS,
  PHASE7A_R1_BRANCH_URL,
  SIGNAL_COMPARISON_RECORDING_CONTRACT,
  SIGNAL_COMPARISON_RECORDING_SCHEMA,
  SIGNAL_COMPARISON_RECORDING_SPECS,
  SERVED_BUILD_AUTHORITY_SCHEMA,
  normalizeDeployment,
  runSelfTest,
  sanitizeForPackage,
  validateComparisonRevision,
  validateBefore800x360Defect,
  validateFinalCaptureBinding,
  validateFirefoxFirstPaintReport,
  validateInstalledChromeReport,
  validateInstalledChromeUiReport,
  validateQaReport,
  validateServedBuildAuthority,
  validateServedBuildDeploymentBinding,
  validateSignalComparisonRecordingReport,
} from "../scripts/assemble-phase7a-r1-evidence.mjs";
import { PHASE7A_R1_BRANCH, PHASE7A_R1_PARENT } from "../scripts/phase7a-contract.mjs";

function target() {
  return { status: "PASS", minimumCssPixels: 44, candidateCount: 0, records: [], targetFailures: [], validExclusions: [], unexplainedExclusions: [], contractFailures: [], summary: { belowMinimum: 0, targetFailures: 0, validExclusions: 0, unexplainedExclusions: 0, contractFailures: 0 } };
}

const trueChecks = (keys) => Object.fromEntries(keys.map((key) => [key, true]));
const routeChecks = ["status", "oneH1", "expectedH1", "landmarks", "noHorizontalOverflow", "targetSizes", "console"];
const responsiveChecks = ["oneH1", "expectedH1", "landmarks", "noHorizontalOverflow", "targetSizes", "manifestoResolved", "wholeWords", "h1Fits", "console"];
const fieldMapChecks = ["focusBefore", "eightLinks", "ordinaryLinks", "targetSizes", "backgroundInert", "keyboardContained", "fullViewport", "escapeCloses", "focusReturn", "inertReleased", "repeatedCyclesRestore"];
const lifecycleChecks = ["tenCycles", "forwardLatestPosition", "reverseExactTop", "reverseClearsManifesto", "noIdleRaf", "noIntervals"];
const networkChecks = ["semanticH1", "noOverflow", "boundedRequests"];
const afterDocumentAuthority = Object.freeze({ bytes: 25_000, sha256: "e".repeat(64) });
const exactParentRuntime = Object.freeze([
  Object.freeze({ kind: "css", route: "/_astro/BaseLayout.ByjrAQMG.css", httpStatus: 200, contentType: "text/css", bytes: 12_579, sha256: "0967a69765cc49c6291e125d44958bb19694d1c74fe028e17f6f095bd1109f68" }),
  Object.freeze({ kind: "css", route: "/_astro/index.CMvgVrhb.css", httpStatus: 200, contentType: "text/css", bytes: 17_131, sha256: "a9932a0eed64df5c5a5ebc35067b003558644bbddb8c179227364c1b340c0691" }),
  Object.freeze({ kind: "javascript", route: "/_astro/index.astro_astro_type_script_index_0_lang.DuXUZIF3.js", httpStatus: 200, contentType: "application/javascript", bytes: 2_604, sha256: "05006aae308ac99e9f16bb4c7d93b75f41e8766ea06aaf9d8c3d19fb1a7bb52a" }),
]);
const r1RuntimeLocal = Object.freeze([{ kind: "css", route: "/_astro/app.css", bytes: 111, sha256: "1".repeat(64) }, { kind: "javascript", route: "/_astro/app.js", bytes: 222, sha256: "2".repeat(64) }]);
const r1RuntimeServed = Object.freeze(r1RuntimeLocal.map((record) => ({ ...record, httpStatus: 200, contentType: record.kind === "css" ? "text/css" : "application/javascript" })));
const runtimeFingerprint = (records) => createHash("sha256").update(records.map(({ kind, route, bytes, sha256 }) => `${kind}\t${route}\t${bytes}\t${sha256}`).sort().join("\n")).digest("hex");
const exactParentRuntimeFingerprint = runtimeFingerprint(exactParentRuntime);
const r1RuntimeFingerprint = runtimeFingerprint(r1RuntimeLocal);

function servedBuildFixture(afterRevision = "b".repeat(40)) {
  const bifurcation = (after) => ({
    thresholdCount: 1,
    fieldCount: after ? 1 : 0,
    architectureCount: after ? 1 : 0,
    incomingCount: after ? 1 : 0,
    industryCount: after ? 1 : 0,
    startupCount: after ? 1 : 0,
    branchCount: after ? 2 : 0,
    edgeSignalCount: after ? 1 : 0,
    junctionCount: after ? 1 : 0,
    destinationCount: after ? 2 : 0,
    destinationHrefs: after ? ["/for-partners/", "/for-startups/"] : [],
    destinationNames: after ? ["For industry", "For startups"] : [],
    bounded: after,
  });
  const dom = (after) => ({
    channel: "playwright-chromium-live-dom",
    route: "/",
    responseStatus: 200,
    homeTitleCount: 1,
    signalFieldCount: 1,
    signalFarCount: after ? 1 : 0,
    signalOcclusionCount: after ? 1 : 0,
    bifurcation: bifurcation(after),
  });
  const document = (authority) => ({ channel: "node-fetch-response-body", route: "/", httpStatus: 200, contentType: "text/html; charset=utf-8", ...authority });
  const emptyNetwork = () => ({ blockedExternal: [], failedRequests: [], pageErrors: [], consoleErrors: [] });
  return {
    schema: SERVED_BUILD_AUTHORITY_SCHEMA,
    status: "PASS",
    repository: {
      schema: SERVED_BUILD_AUTHORITY_SCHEMA,
      branch: PHASE7A_R1_BRANCH,
      head: afterRevision,
      exactParent: PHASE7A_R1_PARENT,
      parentIsAncestor: true,
      mergeCommitsSinceParent: 0,
      trackedWorktreeClean: true,
      buildReceipt: { command: "npm run build:phase7a-r1", authorityProfile: "phase7a-r1", completed: true, headBefore: afterRevision, headAfter: afterRevision, branchAfter: PHASE7A_R1_BRANCH, trackedWorktreeCleanAfter: true },
      localDist: { relativePath: "dist/index.html", ...afterDocumentAuthority },
    },
    originSeparation: { before: "BEFORE_CAPTURE_ORIGIN", after: "AFTER_CAPTURE_ORIGIN", distinctNormalizedOrigins: true },
    documents: { before: document(EXACT_PARENT_HOME_DOCUMENT_AUTHORITY), after: document(afterDocumentAuthority) },
    documentFingerprintsDistinct: true,
    runtimeAssets: {
      derivation: "linked CSS/JS paths parsed from each verified root HTML response",
      before: { revision: PHASE7A_R1_PARENT, served: exactParentRuntime.map((record) => ({ ...record })), fingerprint: exactParentRuntimeFingerprint, authority: { revision: PHASE7A_R1_PARENT, derivation: "immutable linked CSS/JavaScript bytes from the exact-parent governed build", fingerprint: exactParentRuntimeFingerprint } },
      after: { revision: afterRevision, localDist: r1RuntimeLocal.map((record) => ({ ...record })), served: r1RuntimeServed.map((record) => ({ ...record })), localFingerprint: r1RuntimeFingerprint, servedFingerprint: r1RuntimeFingerprint },
    },
    dom: { before: dom(false), after: dom(true) },
    network: { before: emptyNetwork(), after: emptyNetwork() },
  };
}

function servedReceipt(afterRevision = "b".repeat(40)) {
  return {
    report: "provenance/served-build-authority.json",
    status: "PASS",
    branch: PHASE7A_R1_BRANCH,
    afterRevision,
    beforeDocument: { revision: PHASE7A_R1_PARENT, ...EXACT_PARENT_HOME_DOCUMENT_AUTHORITY },
    afterDocument: { revision: afterRevision, ...afterDocumentAuthority },
    runtimeAssets: { before: { count: exactParentRuntime.length, fingerprint: exactParentRuntimeFingerprint, immutableAuthority: { revision: PHASE7A_R1_PARENT, derivation: "immutable linked CSS/JavaScript bytes from the exact-parent governed build", fingerprint: exactParentRuntimeFingerprint } }, after: { count: r1RuntimeLocal.length, fingerprint: r1RuntimeFingerprint } },
    distinctDocumentFingerprints: true,
    domSignatures: { before: "EXACT_PARENT", after: "PHASE_7A_R1" },
  };
}

function portableReceipt(revision = "b".repeat(40)) {
  return {
    schema: "quantum-hub.phase-7a-r1.portable-served-build-receipt.v1",
    status: "PASS",
    branch: PHASE7A_R1_BRANCH,
    revision,
    document: { relativePath: "dist/index.html", ...afterDocumentAuthority },
    runtimeFingerprint: r1RuntimeFingerprint,
    runtimeAssets: r1RuntimeLocal.map((record) => ({ ...record })),
    servedParity: { document: true, runtimeAssets: true },
    freshBuild: { command: "npm run build:phase7a-r1", headBefore: revision, headAfter: revision, worktreeCleanBefore: true, worktreeCleanAfter: true },
  };
}

const portableSource = (receipt) => ({ status: receipt.status, branch: receipt.branch, revision: receipt.revision, document: receipt.document, runtimeFingerprint: receipt.runtimeFingerprint });

function qaFixture(engine) {
  const servedBuild = portableReceipt();
  return {
    authorityProfile: "phase7a-r1",
    branch: PHASE7A_R1_BRANCH,
    servedBuild,
    status: "PASS",
    results: [{
      sourceAuthority: portableSource(servedBuild),
      identity: { engine, version: "fixture", authority: engine === "webkit" ? "Playwright WebKit proxy; not physical Safari" : `Playwright managed ${engine}` },
      routes: Array.from({ length: EXPECTED_QA_ROUTE_COUNTS[engine] }, () => ({ status: "PASS", checks: trueChecks(routeChecks), state: { targetSize: target() } })),
      accessibility: Array.from({ length: 20 }, () => ({ status: "PASS", accessibility: { status: "PASS", violations: [] } })),
      responsive: Array.from({ length: EXPECTED_QA_RESPONSIVE_MINIMUMS[engine] }, () => ({ status: "PASS", checks: trueChecks(responsiveChecks), state: { targetSize: target() } })),
      fieldMap: { status: "PASS", checks: trueChecks(fieldMapChecks), openTargets: target() },
      fallback: { reducedMotion: { status: "PASS" }, noJavaScript: { status: "PASS" }, fallbackFont: { status: "PASS" } },
      history: { status: "PASS" },
      cycles: { status: "PASS", samples: Array.from({ length: 10 }, (_, index) => ({ cycle: index + 1 })), checks: trueChecks(lifecycleChecks) },
      network: [{ policy: "blocked", status: "PASS", checks: trueChecks(networkChecks) }, { policy: "slow", status: "PASS", checks: trueChecks(networkChecks) }],
      failures: [],
      status: "PASS",
    }],
  };
}

function signalComparisonFixture() {
  const afterRevision = "b".repeat(40);
  const authorityReceipt = servedReceipt(afterRevision);
  return {
    schema: SIGNAL_COMPARISON_RECORDING_SCHEMA,
    status: "PASS",
    contract: { ...SIGNAL_COMPARISON_RECORDING_CONTRACT },
    tools: { ffmpegVersion: "fixture ffmpeg", ffprobeVersion: "fixture ffprobe" },
    servedBuildAuthority: authorityReceipt,
    recordings: SIGNAL_COMPARISON_RECORDING_SPECS.map((spec) => {
      const revision = spec.state === "before" ? PHASE7A_R1_PARENT : afterRevision;
      const documentAuthority = spec.state === "before" ? authorityReceipt.beforeDocument : authorityReceipt.afterDocument;
      return {
        id: spec.id,
        engine: spec.engine,
        state: spec.state,
        sourceAuthority: { kind: spec.sourceKind, revision, document: { report: authorityReceipt.report, bytes: documentAuthority.bytes, sha256: documentAuthority.sha256 }, livePageAttestation: { channel: "recording-document-response-and-live-dom", document: { bytes: documentAuthority.bytes, sha256: documentAuthority.sha256 }, runtimeAssets: spec.state === "before" ? authorityReceipt.runtimeAssets.before : authorityReceipt.runtimeAssets.after } },
        relativePath: spec.relativePath,
        visibleLabel: spec.state === "before"
          ? `PHASE 7A-R1 COMPARATIVE / ${spec.engine.toUpperCase()} / BEFORE - EXACT PARENT ${PHASE7A_R1_PARENT.slice(0, 12)}`
          : `PHASE 7A-R1 COMPARATIVE / ${spec.engine.toUpperCase()} / AFTER - R1 AFTER ${afterRevision.slice(0, 12)} / BOUNDED POINTER RESPONSE`,
        boundedPointerResponse: spec.boundedPointerResponse,
        settledState: { cinematicMode: "enhanced", manifestoReveal: "resolved", h1Text: "We turn industrial needs into field evidence.", signalField: true, overlayVisible: true },
        pointerStates: spec.state === "before" ? [] : Array.from({ length: 4 }, (_, index) => ({ step: index + 1, probe: "active", probeX: `${40 + index}%`, probeY: `${45 + index}%`, nearX: `${index}px`, nearY: `${index}px`, bounded: true })),
        pointerSettled: spec.state === "before" ? null : { probe: "settled", probeX: "50%", probeY: "50%", nearX: "0px", nearY: "0px" },
        media: { container: "mp4", codec: "h264", pixelFormat: "yuv420p", width: 1280, height: 720, fps: 30, constantFrameRate: true, durationSeconds: 6, videoStreams: 1, audioStreams: 0, decodedFrames: 180, fullDecode: true },
        bytes: 1024,
        sha256: "c".repeat(64),
        validationChecks: trueChecks(["audioStreams", "codec", "constantFrameRate", "container", "decodedFrames", "dimensions", "duration", "fullDecode", "oneVideoStream", "otherStreams", "pixelFormat"]),
        status: "PASS",
      };
    }),
    rawBrowserVideoRetained: false,
  };
}

function deploymentFixture(head = "d".repeat(40)) {
  const deploymentId = "12345678-aaaa-bbbb-cccc-ddddeeeeffff";
  const immutableUrl = "https://12345678.qsite1.pages.dev/";
  const payloads = [
    { relativePath: "index.html", requestPath: "/", deploymentComparison: "REQUIRED", ...afterDocumentAuthority, contentType: "text/html; charset=utf-8", cacheControl: "public, max-age=0, must-revalidate", matchedPolicies: ["/*"] },
    { relativePath: "_astro/app.css", requestPath: "/_astro/app.css", deploymentComparison: "REQUIRED", bytes: 111, sha256: "1".repeat(64), contentType: "text/css", cacheControl: "public, max-age=31536000, immutable", matchedPolicies: ["/_astro/*"] },
    { relativePath: "_astro/app.js", requestPath: "/_astro/app.js", deploymentComparison: "REQUIRED", bytes: 222, sha256: "2".repeat(64), contentType: "application/javascript", cacheControl: "public, max-age=31536000, immutable", matchedPolicies: ["/_astro/*"] },
  ];
  const origin = (url) => ({
    status: "PASS",
    data: {
      status: "PASS",
      origin: url,
      real404: { httpStatus: 404, byteParity: true },
      exactPublicRoutes: Array.from({ length: 10 }, (_, index) => ({ id: `route-${index + 1}`, status: "PASS" })),
      securityHeaders: { status: "PASS" },
      responses: payloads.map(({ relativePath, requestPath, bytes, sha256, contentType, cacheControl, matchedPolicies }) => ({ relativePath, publicPath: requestPath, expectedHttpStatus: 200, actualHttpStatus: 200, status: "PASS", bytes, sha256, headers: { status: "PASS", contentType, cacheControl, matchedPolicies }, security: { status: "PASS" } })),
    },
  });
  return {
    schema: "quantum-hub.phase-7a.deployment-verification.v1",
    status: "PASS",
    authorityProfile: "phase7a-r1",
    generatedAt: "2026-09-01T12:00:00.000Z",
    deployedSha: head,
    parity: "PASS",
    deploymentId,
    environment: "preview",
    projectName: "qsite1",
    immutableUrl,
    branchUrl: PHASE7A_R1_BRANCH_URL,
    inputs: { expectedDeployedSha: head, branch: PHASE7A_R1_BRANCH, acceptedParent: PHASE7A_R1_PARENT, frozenMain: "501040c42bba30b9d9517b88a8f9857992a2dba4", localDist: "dist" },
    repository: {
      status: "PASS",
      data: {
        status: "PASS",
        authorityProfile: "phase7a-r1",
        branch: PHASE7A_R1_BRANCH,
        deployedSha: head,
        acceptedParent: PHASE7A_R1_PARENT,
        cleanTree: true,
        main: { local: "501040c42bba30b9d9517b88a8f9857992a2dba4", origin: "501040c42bba30b9d9517b88a8f9857992a2dba4", frozen: "501040c42bba30b9d9517b88a8f9857992a2dba4", containsDeployedSha: false },
        branchUpstream: { ref: `origin/${PHASE7A_R1_BRANCH}`, sha: head, parity: true },
      },
    },
    deployment: {
      status: "PASS",
      data: {
        status: "PASS",
        authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
        checkRunId: "123456789",
        appSlug: "cloudflare-workers-and-pages",
        completedAt: "2026-09-01T11:50:00.000Z",
        deploymentId,
        projectName: "qsite1",
        environment: "preview",
        branch: PHASE7A_R1_BRANCH,
        immutableUrl,
        branchUrl: PHASE7A_R1_BRANCH_URL,
        deployedSha: head,
      },
    },
    dist: { status: "PASS", files: [...payloads.map(({ contentType: _contentType, cacheControl: _cacheControl, matchedPolicies: _matchedPolicies, ...record }) => record), { relativePath: "_headers", requestPath: null, deploymentComparison: "EXCLUDED_CLOUDFLARE_CONFIGURATION", bytes: 10, sha256: "3".repeat(64) }], totals: { files: 4, comparableFiles: 3, bytes: afterDocumentAuthority.bytes + 343 } },
    origins: { immutable: origin(immutableUrl), branch: origin(PHASE7A_R1_BRANCH_URL) },
    failures: [],
    checks: trueChecks([
      "repositoryAndFrozenMainProvenance",
      "signedCloudflareCheckBindsDeployedShaAndUrls",
      "immutableExactByteContentAndRouteParity",
      "branchExactByteContentAndRouteParity",
      "real404StatusCanonicalAndNoindex",
      "cacheMimeAndSecurityHeaders",
    ]),
  };
}

function firefoxFirstPaintFixture(status = "PASS") {
  const limitation = status === "LIMITATION";
  const computed = { htmlBackground: "rgb(7, 9, 10)", bodyBackground: "rgb(7, 9, 10)", colorScheme: "dark" };
  return {
    schema: "quantum-hub.phase-7a-r1.firefox-first-paint.v1",
    status,
    classification: limitation
      ? "white frame belongs to capture initialization or browser/window exposure; document dark-background authority was present"
      : "earlier white frame not reproduced; evidence is consistent with capture initialization or browser/window exposure rather than page paint",
    responseStatus: 200,
    navigationStart: { pixels: { width: 1280, height: 720, nearWhitePixelRatio: limitation ? 0.99 : 0.01 }, computed: { ...computed } },
    firstStablePaint: { pixels: { width: 1280, height: 720, nearWhitePixelRatio: 0.01 }, computed: { ...computed } },
    documentAuthority: { inlineDarkBackgroundAuthority: true, colorSchemeAuthority: true, orderingProven: true },
    timing: { navigationStartCapturedBeforeResponseBodyRead: true, captureOrder: ["navigation-commit", "html-attached", "navigation-start-screenshot", "response-body-read-start", "response-body-read-complete", "first-stable-paint-screenshot"].map((step, index) => ({ step, elapsedMs: index * 10 })) },
  };
}

test("assembler self-test fixes the 25-report topology and rejects false PASS evidence", () => {
  assert.deepEqual(runSelfTest(), {
    schema: ASSEMBLER_SCHEMA,
    status: "PASS",
    requiredReports: 25,
    qaEngines: 3,
    falsePassRejected: true,
    privateAndOriginSanitization: "PASS",
  });
});

test("each QA engine must prove complete passing route, accessibility, responsive, target and lifecycle evidence", () => {
  for (const engine of ["chromium", "firefox", "webkit"]) assert.equal(validateQaReport(qaFixture(engine), engine).identity.engine, engine);
  const failed = qaFixture("firefox");
  failed.results[0].cycles.samples.pop();
  assert.throws(() => validateQaReport(failed, "firefox"), /ten cycles/);
  const falseTargetPass = qaFixture("chromium");
  falseTargetPass.results[0].responsive[0].state.targetSize.summary.unexplainedExclusions = 1;
  assert.throws(() => validateQaReport(falseTargetPass, "chromium"), /unexplained target exclusion/);

  const proxyOnly = qaFixture("webkit");
  proxyOnly.status = "FAIL";
  proxyOnly.results[0].status = "FAIL";
  proxyOnly.results[0].failures = ["field-map"];
  proxyOnly.results[0].fieldMap.status = "FAIL";
  proxyOnly.results[0].fieldMap.checks = { ...trueChecks(fieldMapChecks), keyboardContained: false };
  proxyOnly.results[0].fieldMap.tabFocus = { inMap: false, text: null };
  assert.equal(validateQaReport(proxyOnly, "webkit").identity.engine, "webkit");
  proxyOnly.results[0].fieldMap.checks.backgroundInert = false;
  assert.throws(() => validateQaReport(proxyOnly, "webkit"), /check failed: backgroundInert/);

  const vacuous = qaFixture("chromium");
  vacuous.results[0].routes[0].checks = {};
  assert.throws(() => validateQaReport(vacuous, "chromium"), /check inventory differs/);

  const stale = qaFixture("chromium");
  const staleRevision = "a".repeat(40);
  stale.servedBuild.revision = staleRevision;
  stale.servedBuild.freshBuild.headBefore = staleRevision;
  stale.servedBuild.freshBuild.headAfter = staleRevision;
  stale.results[0].sourceAuthority = portableSource(stale.servedBuild);
  validateQaReport(stale, "chromium");
  assert.throws(
    () => validateFinalCaptureBinding(stale.servedBuild, [stale.results[0].sourceAuthority], "b".repeat(40), servedBuildFixture("b".repeat(40)), "chromium QA"),
    /portable served-build branch\/revision differs/,
  );
});

test("exact-parent responsive evidence must retain the measured sticky-header 800x360 top-clipping defect", () => {
  const ids = ["740x320", "740x360", "768x320", "768x360", "800x320", "800x360", "800x390", "820x360", "844x360", "844x390", "896x414", "900x480"].map((size) => `short-landscape-${size}`);
  const cases = ids.map((id) => ({
    id,
    status: id === "short-landscape-800x360" ? "FAIL" : "PASS",
    failure: id === "short-landscape-800x360" ? "manifesto top safety clipping beneath sticky header" : null,
    measurement: id === "short-landscape-800x360" ? {
      occludingHeader: { position: "sticky", presentation: { visible: true }, anchoredToViewportTop: true, occluding: true, effectiveBottom: 100.25 },
      effectiveVisibleBounds: { top: 100.25 },
      safeAllowances: { h1: { top: -10 }, glyphs: { top: 3 }, renderedLines: [{ top: -2 }, { top: 40 }] },
      boundaryAnalysis: { occludingHeaderIntersections: [{ authoredLineIndex: 1 }], safetyViolations: [{ authoredLineIndex: 1, sides: ["top"] }] },
    } : null,
  }));
  assert.equal(validateBefore800x360Defect(cases), true);
  const erased = structuredClone(cases);
  Object.assign(erased.find(({ id }) => id === "short-landscape-800x360"), { status: "PASS", failure: null });
  assert.throws(() => validateBefore800x360Defect(erased), /was not reproduced/);
  const horizontalOnly = structuredClone(cases);
  const defect = horizontalOnly.find(({ id }) => id === "short-landscape-800x360");
  defect.failure = "horizontal overflow";
  defect.measurement.safeAllowances.h1.top = 4;
  defect.measurement.safeAllowances.glyphs.top = 4;
  defect.measurement.safeAllowances.renderedLines.forEach((line) => { line.top = 4; });
  defect.measurement.boundaryAnalysis.occludingHeaderIntersections = [];
  defect.measurement.boundaryAnalysis.safetyViolations = [];
  assert.throws(() => validateBefore800x360Defect(horizontalOnly), /not classified as sticky\/top clipping|lacks measured/);
});

test("installed Chrome evidence requires genuine native 200 percent zoom and visible UI confirmation", () => {
  const servedBuild = portableReceipt();
  const sourceAuthority = portableSource(servedBuild);
  const viewport = { left: 0, top: 0, right: 640, bottom: 360, width: 640, height: 360 };
  const effectiveVisibleBounds = { left: 0, top: 50, right: 640, bottom: 360, width: 640, height: 310 };
  const h1Bounds = { left: 10, top: 60, right: 630, bottom: 300, width: 620, height: 240 };
  const glyphBounds = { left: 15, top: 65, right: 625, bottom: 295, width: 610, height: 230 };
  const manifestoVisibility = {
    applicable: true,
    status: "PASS",
    viewportBounds: viewport,
    header: { bounds: { left: 0, top: 0, right: 640, bottom: 50, width: 640, height: 50 }, position: "sticky", visible: true, anchoredToViewportTop: true, occluding: true },
    h1Bounds,
    glyphBounds,
    effectiveVisibleBounds,
    safeAllowances: { h1Top: 10, h1Bottom: 60, h1Left: 10, h1Right: 10, glyphTop: 15, glyphBottom: 65, glyphLeft: 15, glyphRight: 15 },
  };
  const fieldMapNames = ["00 Home 00 / origin", "01 For industry 01 / need", "02 For startups 02 / capability", "03 Industries 03 / context", "04 Proof 04 / evidence", "05 SPARK 05 / programme", "06 About 06 / position", "07 Contact 07 / signal"];
  const fieldMapHrefs = ["/#entry", "/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/spark/", "/about/", "/contact/"];
  const routePaths = ["/", "/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/pocs/maradin/", "/spark/", "/about/", "/contact/", "/__phase7a-real-404-probe__/"];
  const routeFilename = (routePath) => `${routePath === "/" ? "home" : routePath.replaceAll("/", "-").replace(/^-|-$/g, "")}-top.png`;
  const visualAuthority = [...routePaths.map((routePath) => ({ label: `route:${routePath}`, filename: routeFilename(routePath) })), { label: "home-field-map-closed", filename: "home-field-map-closed.png" }, { label: "home-bifurcation", filename: "home-bifurcation.png" }, { label: "home-field-map-open", filename: "home-field-map-open.png" }, { label: "home-field-map-keyboard-focus", filename: "home-field-map-keyboard-focus.png" }, { label: "home-field-map-escape-closed", filename: "home-field-map-escape-closed.png" }];
  const report = {
    status: "PASS",
    servedBuild,
    sourceAuthority,
    classification: "GENUINE INSTALLED GOOGLE CHROME BROWSER ZOOM",
    forbiddenSubstitutes: { viewportResize: false, cssZoom: false, transformScale: false, deviceEmulation: false },
    zoomProof: { status: "PASS", uiZoomLabel: "Zoom: 200%", checks: { installedChromeUi: true, widthHalved: true, dprDoubled: true, noDeviceEmulation: true } },
    routes: routePaths.map((routePath) => ({ status: "PASS", path: routePath })),
    visualEvidence: visualAuthority.map(({ label, filename }, index) => ({ label, filename, format: "png", width: 1280, height: 720, bytes: 1024 + index, entropy: 4, maximumChannelRange: 255, sha256: index.toString(16).padStart(64, "0"), sourceAuthority })),
    fieldMap: {
      status: "PASS",
      sourceAuthority,
      links: 8,
      visibleLinks: fieldMapNames.map((accessibleName, index) => ({ href: fieldMapHrefs[index], accessibleName, visible: true, fullyInViewport: true, bounds: { left: 20, top: 10 + index * 20, right: 620, bottom: 54 + index * 20, width: 600, height: 44 } })),
      overflow: false,
      backgroundRegions: [{ inert: true, owned: true }, { inert: true, owned: true }, { inert: true, owned: true }],
      keyboardFocus: { inMap: true },
      escapeFocusReturn: true,
      inertAfterEscape: 0,
      targetSize: target(),
    },
  };
  report.routes = report.routes.map((route, index) => ({
    ...route,
    sourceAuthority,
    checks: trueChecks(["httpStatus", "semanticH1", "landmarks", "noHorizontalOverflow", "wholeWords", "targetSizes", "manifestoUnclipped"]),
    state: { targetSize: target(), geometry: { innerWidth: 640, innerHeight: 360 }, h1Bounds: index === 0 ? h1Bounds : null, manifestoVisibility: index === 0 ? manifestoVisibility : { applicable: false, status: "NOT_APPLICABLE" } },
  }));
  assert.equal(validateInstalledChromeReport(report), true);
  const observedUi = [{ relativePath: "chrome-visible-200-percent.png", format: "png", width: 1280, height: 720, bytes: 4096, sha256: "f".repeat(64), entropy: 4, maximumChannelRange: 255 }];
  const ui = { schema: "quantum-hub.phase-7a-r1.installed-chrome-ui-evidence.v1", status: "PASS", browserWindow: { product: "Google Chrome", processName: "chrome.exe", visible: true, remoteDebuggingProcessMatched: true, title: "Qsite1 - Google Chrome" }, visibleZoomConfirmation: true, visibleZoomObservation: { method: "windows-ui-automation-accessibility-tree", chromeMenuVisible: true, observedLabel: "200%", screenshot: "chrome-visible-200-percent.png" }, screenshots: observedUi.map((entry) => ({ ...entry })) };
  assert.equal(validateInstalledChromeUiReport(ui, observedUi), true);
  const arbitrary = structuredClone(ui);
  arbitrary.screenshots[0].sha256 = "e".repeat(64);
  assert.throws(() => validateInstalledChromeUiReport(arbitrary, observedUi), /bytes\/decode binding differs/);
  const claimOnly = structuredClone(ui);
  claimOnly.visibleZoomObservation.chromeMenuVisible = false;
  assert.throws(() => validateInstalledChromeUiReport(claimOnly, observedUi), /visible 200% Chrome control/);

  const clipped = structuredClone(report);
  clipped.routes[0].state.manifestoVisibility.safeAllowances.glyphTop = 1;
  assert.throws(() => validateInstalledChromeReport(clipped), /safe allowance differs|effective visible boundary/);

  const missingStickyBoundary = structuredClone(report);
  missingStickyBoundary.routes[0].state.manifestoVisibility.effectiveVisibleBounds.top = 0;
  missingStickyBoundary.routes[0].state.manifestoVisibility.effectiveVisibleBounds.height = 360;
  assert.throws(() => validateInstalledChromeReport(missingStickyBoundary), /sticky-header bottom/);

  const hiddenLink = structuredClone(report);
  hiddenLink.fieldMap.visibleLinks[3].fullyInViewport = false;
  assert.throws(() => validateInstalledChromeReport(hiddenLink), /not visibly in viewport/);

  const blankVisual = structuredClone(report);
  blankVisual.visualEvidence[0].entropy = 0;
  assert.throws(() => validateInstalledChromeReport(blankVisual), /blank or lacks visible contrast/);

  const duplicateHomeState = structuredClone(report);
  duplicateHomeState.visualEvidence.find(({ label }) => label === "home-bifurcation").sha256 = duplicateHomeState.visualEvidence.find(({ label }) => label === "home-field-map-closed").sha256;
  assert.throws(() => validateInstalledChromeReport(duplicateHomeState), /Home state visuals are blank-timed or materially identical/);

  const mismatchedLabel = structuredClone(ui);
  mismatchedLabel.visibleZoomObservation.observedLabel = "Zoom: 200%";
  assert.throws(() => validateInstalledChromeUiReport(mismatchedLabel, observedUi), /visible 200% Chrome control/);
});

test("deployment normalization derives every proof from the real verifier's exact nested PASS authority", () => {
  const head = "d".repeat(40);
  const deployment = deploymentFixture(head);
  const normalized = normalizeDeployment(deployment, head);
  assert.equal(normalized.authorityProfile, "phase7a-r1");
  assert.deepEqual(normalized.proof, {
    localDistDeployedParity: true,
    immutableOrigin: true,
    branchOrigin: true,
    signedDeploymentBinding: true,
  });
  assert.equal(normalized.checks.signedCloudflareCheckBinding, true);
  assert.deepEqual(validateServedBuildDeploymentBinding(deployment, servedBuildFixture(head)), {
    status: "PASS",
    revision: head,
    relativePath: "dist/index.html",
    bytes: afterDocumentAuthority.bytes,
    sha256: afterDocumentAuthority.sha256,
    localDist: true,
    immutableOrigin: true,
    branchOrigin: true,
    runtimeAssets: { count: r1RuntimeLocal.length, fingerprint: r1RuntimeFingerprint },
  });

  const wrongProfile = deploymentFixture(head);
  wrongProfile.authorityProfile = "phase7a";
  assert.throws(() => normalizeDeployment(wrongProfile, head), /authority profile differs/);

  const unsigned = deploymentFixture(head);
  unsigned.checks.signedCloudflareCheckBindsDeployedShaAndUrls = false;
  assert.throws(() => normalizeDeployment(unsigned, head), /signedCloudflareCheckBindsDeployedShaAndUrls/);

  const vacuous = deploymentFixture(head);
  vacuous.checks = {};
  assert.throws(() => normalizeDeployment(vacuous, head), /check inventory differs/);

  const cases = [
    [(report) => { report.repository.status = "FAIL"; }, /repository provenance is not PASS/],
    [(report) => { report.repository.data.status = "FAIL"; }, /repository provenance is not PASS/],
    [(report) => { report.deployment.status = "FAIL"; }, /signed Cloudflare deployment provenance is not PASS/],
    [(report) => { report.deployment.data.status = "FAIL"; }, /signed Cloudflare deployment provenance is not PASS/],
    [(report) => { report.dist.status = "FAIL"; }, /local dist authority is not PASS/],
    [(report) => { report.origins.immutable.status = "FAIL"; }, /immutable origin parity is not PASS/],
    [(report) => { report.origins.immutable.data.status = "FAIL"; }, /immutable origin parity is not PASS/],
    [(report) => { report.origins.branch.status = "FAIL"; }, /branch origin parity is not PASS/],
    [(report) => { report.origins.branch.data.status = "FAIL"; }, /branch origin parity is not PASS/],
    [(report) => { report.branchUrl = "https://repair-phase-7a-r1-wrong.qsite1.pages.dev/"; }, /exact Phase 7A-R1 alias/],
  ];
  for (const [mutate, expected] of cases) {
    const report = deploymentFixture(head);
    mutate(report);
    assert.throws(() => normalizeDeployment(report, head), expected);
  }

  const staleLocalDocument = deploymentFixture(head);
  staleLocalDocument.dist.files[0].sha256 = "f".repeat(64);
  assert.throws(() => validateServedBuildDeploymentBinding(staleLocalDocument, servedBuildFixture(head)), /local-dist index\.html/);

  const staleOriginDocument = deploymentFixture(head);
  staleOriginDocument.origins.branch.data.responses[0].bytes += 1;
  assert.throws(() => validateServedBuildDeploymentBinding(staleOriginDocument, servedBuildFixture(head)), /branch index\.html/);

  const tamperedRuntime = deploymentFixture(head);
  tamperedRuntime.dist.files.find(({ relativePath }) => relativePath === "_astro/app.css").sha256 = "f".repeat(64);
  for (const origin of [tamperedRuntime.origins.immutable, tamperedRuntime.origins.branch]) origin.data.responses.find(({ relativePath }) => relativePath === "_astro/app.css").sha256 = "f".repeat(64);
  assert.equal(normalizeDeployment(tamperedRuntime, head).status, "PASS");
  assert.throws(() => validateServedBuildDeploymentBinding(tamperedRuntime, servedBuildFixture(head)), /runtime asset differs from deployment local dist: \/_astro\/app\.css/);
});

test("Firefox first-paint accepts PASS or only the exact evidenced bounded LIMITATION", () => {
  assert.deepEqual(validateFirefoxFirstPaintReport(firefoxFirstPaintFixture("PASS")), {
    status: "PASS",
    boundedLimitation: false,
    classification: "earlier white frame not reproduced; evidence is consistent with capture initialization or browser/window exposure rather than page paint",
  });
  assert.equal(validateFirefoxFirstPaintReport(firefoxFirstPaintFixture("LIMITATION")).boundedLimitation, true);

  const failed = firefoxFirstPaintFixture("LIMITATION");
  failed.status = "FAIL";
  failed.classification = "production-page-paint-defect-reproduced";
  assert.throws(() => validateFirefoxFirstPaintReport(failed), /status must be PASS/);

  const unevidenced = firefoxFirstPaintFixture("LIMITATION");
  unevidenced.navigationStart.computed.htmlBackground = "rgb(255, 255, 255)";
  unevidenced.navigationStart.computed.bodyBackground = "rgb(255, 255, 255)";
  assert.throws(() => validateFirefoxFirstPaintReport(unevidenced), /computed dark-background authority is missing/);

  const mislabeled = firefoxFirstPaintFixture("LIMITATION");
  mislabeled.navigationStart.pixels.nearWhitePixelRatio = 0.2;
  assert.throws(() => validateFirefoxFirstPaintReport(mislabeled), /lacks a near-white navigation-start/);

  const reordered = firefoxFirstPaintFixture("PASS");
  [reordered.timing.captureOrder[2], reordered.timing.captureOrder[3]] = [reordered.timing.captureOrder[3], reordered.timing.captureOrder[2]];
  assert.throws(() => validateFirefoxFirstPaintReport(reordered), /not captured before response-body inspection/);

  const nonmonotonic = firefoxFirstPaintFixture("PASS");
  nonmonotonic.timing.captureOrder[4].elapsedMs = 1;
  assert.throws(() => validateFirefoxFirstPaintReport(nonmonotonic), /timing is not monotonic/);
});

test("Signal Field comparison requires four exact normalized and fully decoded Chromium/Firefox before-after MP4 records", () => {
  const fixture = signalComparisonFixture();
  const validated = validateSignalComparisonRecordingReport(fixture);
  assert.equal(validated.afterRevision, "b".repeat(40));
  assert.deepEqual(validated.recordings.map(({ id }) => id), SIGNAL_COMPARISON_RECORDING_SPECS.map(({ id }) => id));

  const incomplete = signalComparisonFixture();
  incomplete.recordings.pop();
  assert.throws(() => validateSignalComparisonRecordingReport(incomplete), /must contain four records/);

  const undecoded = signalComparisonFixture();
  undecoded.recordings[1].media.fullDecode = false;
  assert.throws(() => validateSignalComparisonRecordingReport(undecoded), /full decode metadata differs/);

  const badCfr = signalComparisonFixture();
  badCfr.recordings[3].validationChecks.constantFrameRate = false;
  assert.throws(() => validateSignalComparisonRecordingReport(badCfr), /check failed: constantFrameRate/);

  const staleDocument = signalComparisonFixture();
  staleDocument.recordings[1].sourceAuthority.document.sha256 = "f".repeat(64);
  assert.throws(() => validateSignalComparisonRecordingReport(staleDocument), /served-document authority differs/);
});

test("served-build authority binds immutable parent bytes, fresh R1 dist bytes, DOM signatures and clean capture ledgers", () => {
  const afterRevision = "b".repeat(40);
  const authority = servedBuildFixture(afterRevision);
  const validated = validateServedBuildAuthority(authority, afterRevision);
  assert.equal(validated.afterDocument.sha256, afterDocumentAuthority.sha256);
  assert.equal(validated.beforeDocument.sha256, EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256);

  const wrongParent = structuredClone(authority);
  wrongParent.documents.before.sha256 = "f".repeat(64);
  assert.throws(() => validateServedBuildAuthority(wrongParent, afterRevision), /exact-parent document differs/);

  const oldBuild = structuredClone(authority);
  oldBuild.repository.buildReceipt.headAfter = "a".repeat(40);
  assert.throws(() => validateServedBuildAuthority(oldBuild, afterRevision), /governed build receipt differs/);

  const missingStructure = structuredClone(authority);
  missingStructure.dom.after.signalFarCount = 0;
  assert.throws(() => validateServedBuildAuthority(missingStructure, afterRevision), /lacks the required structural/);

  const dirtyLedger = structuredClone(authority);
  dirtyLedger.network.after.pageErrors.push("fixture error");
  assert.throws(() => validateServedBuildAuthority(dirtyLedger, afterRevision), /network\/console ledger differs/);
});

test("Signal Field comparison after media binds the exact final HEAD, not an earlier linear ancestor", () => {
  const earlier = "a".repeat(40);
  const finalHead = "b".repeat(40);
  const provenance = { finalHead, commits: [{ hash: earlier }, { hash: finalHead }] };
  assert.equal(validateComparisonRevision(finalHead, provenance), true);
  assert.throws(() => validateComparisonRevision(earlier, provenance), /must equal final HEAD exactly/);
});

test("sanitizer removes base URLs and private filesystem values recursively", () => {
  const result = sanitizeForPackage({
    baseUrl: ["http:", "", "127.0.0.1:4321", ""].join("/"),
    executablePath: ["C:", "Users", "reviewer", "chrome.exe"].join("\\"),
    nested: { note: `Captured at ${["http:", "", "localhost:9000", "path"].join("/")}`, route: "/about/" },
  });
  assert.equal("baseUrl" in result, false);
  assert.equal("executablePath" in result, false);
  assert.equal(result.nested.note, "Captured at CAPTURE_ORIGIN/path");
  assert.equal(result.nested.route, "/about/");
});
