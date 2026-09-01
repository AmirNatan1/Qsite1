import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CLOSURE_MANIFEST_PATH,
  COMPARISON_RECORDING_CONTRACT,
  COMPARISON_RECORDING_SCHEMA,
  COMPARISON_RECORDING_SPECS,
  CORE_TARGET_VIEWPORTS,
  EXACT_PARENT_HOME_DOCUMENT_AUTHORITY,
  EXACT_PARENT_RUNTIME_ASSET_AUTHORITY,
  NO_JS_FIELD_MAP_DESTINATIONS,
  PHASE7A_R1_EXACT_PARENT,
  PHASE7A_R1_REQUIRED_BRANCH,
  REQUIRED_SHORT_LANDSCAPE_VIEWPORTS,
  SERVED_BUILD_AUTHORITY_SCHEMA,
  TYPOGRAPHY_SPECS,
  analyzeFirstPaintDocumentAuthority,
  assertAfterGeometryPass,
  assertBefore800x360Defect,
  assertComparisonRecordingReport,
  assertExternalFreshOutput,
  assertFieldMapKeyboardAuthority,
  assertNativeFieldMapViewport,
  assertRepositoryAuthority,
  assertServedBuildAuthority,
  assertTargetLedgerPass,
  assertVisibleLinkInventory,
  buildClosureManifest,
  captureVisibleLinkInventory,
  comparisonEncoderArguments,
  comparisonFullDecodeArguments,
  extractLinkedRuntimeAssets,
  forbiddenPayloadReason,
  normalizeCaptureBaseUrl,
  parseArguments,
  runSelfTest,
  runtimeAssetSetFingerprint,
  sanitizeForEvidence,
  validateComparisonRecordingProbe,
  validateFallbackManifestoMeasurement,
  validateFirefoxFirstPaintReport,
  validateOptions,
} from "../scripts/capture-phase7a-r1-closure.mjs";

const root = process.cwd();
const scriptPath = path.join(root, "scripts/capture-phase7a-r1-closure.mjs");

const requiredPairs = [
  [740, 320], [740, 360], [768, 320], [768, 360],
  [800, 320], [800, 360], [800, 390], [820, 360],
  [844, 360], [844, 390], [896, 414], [900, 480],
];

const validProbe = () => ({
  format: { duration: "6.000", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
  streams: [{
    avg_frame_rate: "30/1",
    codec_name: "h264",
    codec_type: "video",
    height: 720,
    nb_read_frames: "180",
    pix_fmt: "yuv420p",
    r_frame_rate: "30/1",
    width: 1280,
  }],
});

const afterDocument = Object.freeze({
  bytes: 23_757,
  sha256: "d".repeat(64),
});

const runtimeAssetFixtures = () => {
  const beforeServed = EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.records.map((record) => ({
    ...record,
    httpStatus: 200,
    contentType: record.kind === "css" ? "text/css" : "text/javascript",
  }));
  const afterLocal = [
    { kind: "css", route: "/_astro/r1.css", bytes: 3_000, sha256: "3".repeat(64) },
    { kind: "javascript", route: "/_astro/r1.js", bytes: 4_000, sha256: "4".repeat(64) },
  ];
  const afterServed = afterLocal.map((record) => ({
    ...record,
    httpStatus: 200,
    contentType: record.kind === "css" ? "text/css" : "text/javascript",
  }));
  return {
    derivation: "linked CSS/JS paths parsed from each verified root HTML response",
    before: {
      revision: PHASE7A_R1_EXACT_PARENT,
      authority: {
        revision: EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.revision,
        derivation: EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.derivation,
        fingerprint: EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.fingerprint,
      },
      served: beforeServed,
      fingerprint: runtimeAssetSetFingerprint(beforeServed),
    },
    after: {
      localDist: afterLocal,
      served: afterServed,
      localFingerprint: runtimeAssetSetFingerprint(afterLocal),
      servedFingerprint: runtimeAssetSetFingerprint(afterServed),
    },
  };
};

const validRepositoryAuthority = (afterRevision = "b".repeat(40)) => ({
  schema: SERVED_BUILD_AUTHORITY_SCHEMA,
  branch: PHASE7A_R1_REQUIRED_BRANCH,
  head: afterRevision,
  exactParent: PHASE7A_R1_EXACT_PARENT,
  parentIsAncestor: true,
  mergeCommitsSinceParent: 0,
  worktreeClean: true,
  worktreeStatus: [],
  buildReceipt: {
    command: "npm run build:phase7a-r1",
    authorityProfile: "phase7a-r1",
    completed: true,
    headBefore: afterRevision,
    headAfter: afterRevision,
    branchAfter: PHASE7A_R1_REQUIRED_BRANCH,
    worktreeCleanAfter: true,
    worktreeStatusAfter: [],
  },
  localDist: {
    relativePath: "dist/index.html",
    ...afterDocument,
  },
});

const bifurcationInventory = (after) => ({
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

const validServedBuildAuthority = (afterRevision = "b".repeat(40)) => ({
  schema: SERVED_BUILD_AUTHORITY_SCHEMA,
  status: "PASS",
  repository: validRepositoryAuthority(afterRevision),
  originSeparation: {
    before: "BEFORE_CAPTURE_ORIGIN",
    after: "AFTER_CAPTURE_ORIGIN",
    distinctNormalizedOrigins: true,
  },
  documents: {
    before: {
      channel: "node-fetch-response-body",
      route: "/",
      httpStatus: 200,
      contentType: "text/html; charset=utf-8",
      bytes: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.bytes,
      sha256: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256,
    },
    after: {
      channel: "node-fetch-response-body",
      route: "/",
      httpStatus: 200,
      contentType: "text/html; charset=utf-8",
      ...afterDocument,
    },
  },
  documentFingerprintsDistinct: true,
  runtimeAssets: runtimeAssetFixtures(),
  dom: {
    before: {
      channel: "playwright-chromium-live-dom",
      route: "/",
      responseStatus: 200,
      homeTitleCount: 1,
      signalFieldCount: 1,
      signalFarCount: 0,
      signalOcclusionCount: 0,
      bifurcation: bifurcationInventory(false),
    },
    after: {
      channel: "playwright-chromium-live-dom",
      route: "/",
      responseStatus: 200,
      homeTitleCount: 1,
      signalFieldCount: 1,
      signalFarCount: 1,
      signalOcclusionCount: 1,
      bifurcation: bifurcationInventory(true),
    },
  },
});

const validServedReceipt = (afterRevision = "b".repeat(40)) => ({
  report: "provenance/served-build-authority.json",
  status: "PASS",
  branch: PHASE7A_R1_REQUIRED_BRANCH,
  afterRevision,
  beforeDocument: {
    revision: PHASE7A_R1_EXACT_PARENT,
    bytes: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.bytes,
    sha256: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256,
  },
  afterDocument: { revision: afterRevision, ...afterDocument },
  runtimeAssets: {
    before: {
      count: runtimeAssetFixtures().before.served.length,
      fingerprint: runtimeAssetFixtures().before.fingerprint,
      immutableAuthority: runtimeAssetFixtures().before.authority,
    },
    after: {
      count: runtimeAssetFixtures().after.served.length,
      fingerprint: runtimeAssetFixtures().after.servedFingerprint,
    },
  },
  distinctDocumentFingerprints: true,
  domSignatures: { before: "EXACT_PARENT", after: "PHASE_7A_R1" },
});

const measuredRect = (left, top, right, bottom) => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
});

const fallbackManifestoMeasurement = () => ({
  measurementError: null,
  h1: {
    rect: measuredRect(20, 90, 370, 700),
    presentation: { visible: true },
  },
  glyphBounds: measuredRect(24, 100, 366, 680),
  effectiveVisibleBounds: measuredRect(0, 64, 390, 844),
  occludingHeader: {
    position: "sticky",
    presentation: { visible: true },
    anchoredToViewportTop: true,
    horizontalOverlap: true,
    occluding: true,
    effectiveBottom: 64,
  },
  authoredLines: [
    { glyphBoxes: [measuredRect(24, 100, 120, 180)] },
    { glyphBoxes: [measuredRect(24, 260, 320, 360)] },
    { glyphBoxes: [measuredRect(24, 480, 366, 680)] },
  ],
  horizontalOverflow: false,
  horizontalMetrics: { overflowPixels: 0 },
  boundaryAnalysis: {
    glyphEscapes: [],
    boundaryIntersections: [],
    occludingHeaderIntersections: [],
  },
});

const visibleFieldMapInventory = () => NO_JS_FIELD_MAP_DESTINATIONS.map((destination, index) => ({
  index,
  href: destination.href,
  accessibleName: `${String(index).padStart(2, "0")} ${destination.name}`,
  elementType: "a",
  width: 320,
  height: 64,
  visible: true,
  fullyInViewport: true,
  unoccluded: true,
  intendedInteractive: true,
}));

const validComparisonReport = (afterRevision = "b".repeat(40)) => {
  const validation = validateComparisonRecordingProbe(validProbe(), { fullDecodePassed: true });
  return {
    schema: COMPARISON_RECORDING_SCHEMA,
    status: "PASS",
    contract: COMPARISON_RECORDING_CONTRACT,
    servedBuildAuthority: validServedReceipt(afterRevision),
    rawBrowserVideoRetained: false,
    recordings: COMPARISON_RECORDING_SPECS.map((spec) => ({
      id: spec.id,
      engine: spec.engine,
      state: spec.state,
      sourceAuthority: {
        kind: spec.sourceKind,
        revision: spec.state === "before" ? PHASE7A_R1_EXACT_PARENT : afterRevision,
        document: {
          report: "provenance/served-build-authority.json",
          ...(spec.state === "before" ? {
            bytes: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.bytes,
            sha256: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256,
          } : afterDocument),
        },
        livePageAttestation: {
          channel: "recording-document-response-and-live-dom",
          document: spec.state === "before" ? {
            bytes: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.bytes,
            sha256: EXACT_PARENT_HOME_DOCUMENT_AUTHORITY.sha256,
          } : afterDocument,
          domSignature: spec.state === "before" ? "EXACT_PARENT" : "PHASE_7A_R1",
          runtimeAssets: spec.state === "before" ? {
            count: runtimeAssetFixtures().before.served.length,
            fingerprint: runtimeAssetFixtures().before.fingerprint,
          } : {
            count: runtimeAssetFixtures().after.served.length,
            fingerprint: runtimeAssetFixtures().after.servedFingerprint,
          },
        },
      },
      relativePath: spec.relativePath,
      visibleLabel: spec.state === "before"
        ? `PHASE 7A-R1 COMPARATIVE / ${spec.engine.toUpperCase()} / BEFORE - EXACT PARENT ${PHASE7A_R1_EXACT_PARENT.slice(0, 12)}`
        : `PHASE 7A-R1 COMPARATIVE / ${spec.engine.toUpperCase()} / AFTER - R1 AFTER ${afterRevision.slice(0, 12)} / BOUNDED POINTER RESPONSE`,
      boundedPointerResponse: spec.boundedPointerResponse,
      settledState: {
        cinematicMode: "candidate",
        manifestoReveal: "resolved",
        h1Text: "We turn industrial needs into field evidence.",
        signalField: true,
        overlayVisible: true,
      },
      pointerStates: spec.boundedPointerResponse
        ? [1, 2, 3, 4].map((step) => ({ step, probe: "active", probeX: "50%", probeY: "50%", nearX: "0px", nearY: "0px", bounded: true }))
        : [],
      pointerSettled: spec.boundedPointerResponse
        ? { probe: "settled", probeX: "50%", probeY: "50%", nearX: "0px", nearY: "0px" }
        : null,
      media: validation.media,
      bytes: 1_024,
      sha256: "c".repeat(64),
      validationChecks: validation.checks,
      status: "PASS",
    })),
  };
};

test("closure capture binds the exact ordered 12-size short-landscape family", () => {
  assert.equal(REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.length, 12);
  assert.deepEqual(
    REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.map(({ width, height }) => [width, height]),
    requiredPairs,
  );
  assert.deepEqual(
    REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.map(({ id }) => id),
    requiredPairs.map(([width, height]) => `short-landscape-${width}x${height}`),
  );
});

test("CLI requires distinct credential-free before/after origins and an external output", () => {
  const parsed = parseArguments([
    "--before-base-url", "http://127.0.0.1:4381",
    "--after-base-url", "http://127.0.0.1:4397/",
    "--after-revision", "b".repeat(40),
    "--output", path.resolve(root, "..", "phase7a-r1-closure-test"),
  ]);
  const options = validateOptions(parsed);
  assert.equal(options.beforeBaseUrl, "http://127.0.0.1:4381/");
  assert.equal(options.afterBaseUrl, "http://127.0.0.1:4397/");
  assert.equal(options.afterRevision, "b".repeat(40));
  assert.ok(path.isAbsolute(options.output));
  assert.throws(() => normalizeCaptureBaseUrl("http://name:secret@localhost:4000/"), /credentials/);
  assert.throws(() => validateOptions({ ...parsed, afterBaseUrl: parsed.beforeBaseUrl }), /must differ/);
  assert.throws(() => validateOptions({ ...parsed, afterRevision: "short" }), /exact 40-character/);
  assert.throws(() => validateOptions({ ...parsed, afterRevision: PHASE7A_R1_EXACT_PARENT }), /differ from the exact parent/);
  assert.throws(() => assertExternalFreshOutput(path.join(root, "artifacts/closure")), /outside the repository/);
});

test("repository authority binds the exact R1 branch, local HEAD and fresh governed build receipt", () => {
  const afterRevision = "b".repeat(40);
  const authority = validRepositoryAuthority(afterRevision);
  assert.equal(PHASE7A_R1_REQUIRED_BRANCH, "repair/phase-7a-r1-signal-field-authority");
  assert.deepEqual(EXACT_PARENT_HOME_DOCUMENT_AUTHORITY, {
    bytes: 17_917,
    relativePath: "dist/index.html",
    revision: PHASE7A_R1_EXACT_PARENT,
    sha256: "2c153d9094fe0ca888cbbc7ac4105a775b2ac5b088b47b650d542c2a9cb62cac",
  });
  assert.equal(assertRepositoryAuthority(authority, afterRevision), true);
  assert.throws(() => assertRepositoryAuthority({ ...authority, branch: "main" }, afterRevision), /must run from/);
  assert.throws(() => assertRepositoryAuthority({ ...authority, head: "c".repeat(40) }, afterRevision), /local HEAD/);
  assert.throws(() => assertRepositoryAuthority({
    ...authority,
    worktreeClean: false,
    worktreeStatus: ["?? src/pages/injected.astro"],
  }, afterRevision), /fully clean.*untracked/i);
  assert.throws(() => assertRepositoryAuthority({
    ...authority,
    worktreeClean: false,
    worktreeStatus: ["?? public/injected-asset.svg"],
  }, afterRevision), /fully clean.*untracked/i);
  assert.throws(() => assertRepositoryAuthority({
    ...authority,
    buildReceipt: { ...authority.buildReceipt, headAfter: "c".repeat(40) },
  }, afterRevision), /fresh governed/);
});

test("Windows closure build runs npm through the exact capture Node executable", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /execFileAsync\(process\.execPath, \[npmCli, "run", "build:phase7a-r1"\]/);
  assert.match(source, /path\.dirname\(process\.execPath\)/);
  assert.match(source, /governedEnvironment\.npm_node_execpath = process\.execPath/);
  assert.doesNotMatch(source, /execFileAsync\(npmCommand/);
  assert.doesNotMatch(source, /execFileAsync\("npm\.cmd"/);
});

test("served-build provenance rejects relabelled same builds, wrong parent bytes and missing R1-only DOM", () => {
  const afterRevision = "b".repeat(40);
  const report = validServedBuildAuthority(afterRevision);
  assert.equal(assertServedBuildAuthority(report, afterRevision), true);

  const sameBuild = structuredClone(report);
  sameBuild.documents.after.bytes = sameBuild.documents.before.bytes;
  sameBuild.documents.after.sha256 = sameBuild.documents.before.sha256;
  sameBuild.repository.localDist.bytes = sameBuild.documents.before.bytes;
  sameBuild.repository.localDist.sha256 = sameBuild.documents.before.sha256;
  assert.throws(() => assertServedBuildAuthority(sameBuild, afterRevision), /fingerprints are identical/);

  const wrongParent = structuredClone(report);
  wrongParent.documents.before.bytes += 1;
  assert.throws(() => assertServedBuildAuthority(wrongParent, afterRevision), /immutable byte authority/);

  const parentIsR1 = structuredClone(report);
  parentIsR1.dom.before.signalFarCount = 1;
  assert.throws(() => assertServedBuildAuthority(parentIsR1, afterRevision), /exact-parent DOM contains R1-only/);

  const afterMissingLayer = structuredClone(report);
  afterMissingLayer.dom.after.signalOcclusionCount = 0;
  assert.throws(() => assertServedBuildAuthority(afterMissingLayer, afterRevision), /lacks the required structural layers/);

  const staleDist = structuredClone(report);
  staleDist.documents.after.sha256 = "e".repeat(64);
  assert.throws(() => assertServedBuildAuthority(staleDist, afterRevision), /differs from local dist/);

  const staleAsset = structuredClone(report);
  staleAsset.runtimeAssets.after.served[0].sha256 = "e".repeat(64);
  staleAsset.runtimeAssets.after.servedFingerprint = runtimeAssetSetFingerprint(staleAsset.runtimeAssets.after.served);
  assert.throws(() => assertServedBuildAuthority(staleAsset, afterRevision), /runtime asset differs from fresh local dist/);

  const parentAssetFingerprintLie = structuredClone(report);
  parentAssetFingerprintLie.runtimeAssets.before.fingerprint = "f".repeat(64);
  assert.throws(() => assertServedBuildAuthority(parentAssetFingerprintLie, afterRevision), /exact-parent runtime asset set fingerprint differs/);

  const alteredParentAsset = structuredClone(report);
  alteredParentAsset.runtimeAssets.before.served[0].sha256 = "f".repeat(64);
  alteredParentAsset.runtimeAssets.before.fingerprint = runtimeAssetSetFingerprint(alteredParentAsset.runtimeAssets.before.served);
  assert.throws(() => assertServedBuildAuthority(alteredParentAsset, afterRevision), /immutable authority/);
});

test("runtime asset derivation inventories only linked root-local CSS and JavaScript", () => {
  const html = '<!doctype html><link rel="stylesheet" href="/_astro/app.A.css"><link rel="modulepreload" as="script" href="/_astro/vendor.B.js"><script type="module" src="/_astro/app.C.js"></script>';
  assert.deepEqual(extractLinkedRuntimeAssets(html), [
    { kind: "css", route: "/_astro/app.A.css" },
    { kind: "javascript", route: "/_astro/app.C.js" },
    { kind: "javascript", route: "/_astro/vendor.B.js" },
  ]);
  assert.throws(() => extractLinkedRuntimeAssets('<link rel="stylesheet" href="https://example.test/app.css"><script src="/app.js"></script>'), /root-local immutable path/);
  assert.throws(() => extractLinkedRuntimeAssets('<link rel="stylesheet" href="/app.css">'), /must contain linked CSS and JavaScript/);
  assert.deepEqual(
    EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.records.map(({ kind, route }) => ({ kind, route })),
    [...EXACT_PARENT_RUNTIME_ASSET_AUTHORITY.records]
      .sort((left, right) => left.route.localeCompare(right.route) || left.kind.localeCompare(right.kind))
      .map(({ kind, route }) => ({ kind, route })),
  );
});

test("Firefox navigation-start evidence is captured before body inspection and dark authority precedes rendering", () => {
  const authoritativeHtml = '<!doctype html><html><head><meta name="color-scheme" content="dark"><style>html,body{background:#07090a}</style><link rel="stylesheet" href="/app.css"></head><body>ready</body></html>';
  const documentAuthority = analyzeFirstPaintDocumentAuthority(authoritativeHtml);
  assert.equal(documentAuthority.orderingProven, true);
  const report = {
    schema: "quantum-hub.phase-7a-r1.firefox-first-paint.v1",
    status: "LIMITATION",
    responseStatus: 200,
    documentAuthority,
    timing: {
      navigationStartCapturedBeforeResponseBodyRead: true,
      captureOrder: [
        "navigation-commit",
        "html-attached",
        "navigation-start-screenshot",
        "response-body-read-start",
        "response-body-read-complete",
        "first-stable-paint-screenshot",
      ].map((step, index) => ({ step, elapsedMs: index * 10 })),
    },
    navigationStart: { pixels: { nearWhitePixelRatio: 0.99 } },
    firstStablePaint: { pixels: { nearWhitePixelRatio: 0.01 } },
  };
  assert.equal(validateFirefoxFirstPaintReport(report), true);

  const lateAuthority = analyzeFirstPaintDocumentAuthority('<!doctype html><html><head><link rel="stylesheet" href="/app.css"><meta name="color-scheme" content="dark"><style>html,body{background:#07090a}</style></head><body></body></html>');
  assert.equal(lateAuthority.orderingProven, false);
  assert.throws(() => validateFirefoxFirstPaintReport({ ...report, documentAuthority: lateAuthority }), /absent or too late/);

  const wrongOrder = structuredClone(report);
  [wrongOrder.timing.captureOrder[2], wrongOrder.timing.captureOrder[3]] = [wrongOrder.timing.captureOrder[3], wrongOrder.timing.captureOrder[2]];
  assert.throws(() => validateFirefoxFirstPaintReport(wrongOrder), /not captured before response-body inspection/);
});

test("after geometry is fail-closed for missing, duplicate and reported-failure evidence", () => {
  const passing = REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.map((viewport) => ({
    id: viewport.id,
    viewport,
    status: "PASS",
    failure: null,
  }));
  assert.throws(() => assertAfterGeometryPass(passing.slice(0, 11)), /exactly 12/);
  assert.throws(() => assertAfterGeometryPass(passing.map((item, index) => index === 1 ? { ...item, id: passing[0].id } : item)), /duplicate|membership/);
  assert.throws(() => assertAfterGeometryPass(passing.map((item, index) => index === 5 ? { ...item, status: "FAIL", failure: "top glyph clipped" } : item)), /800x360.*top glyph clipped/);
  assert.throws(() => assertAfterGeometryPass(passing), /measurement is missing at short-landscape-740x320/);
});

test("the exact-parent 800x360 comparison must reproduce measured sticky/top clipping", () => {
  const cases = REQUIRED_SHORT_LANDSCAPE_VIEWPORTS.map((viewport) => ({
    id: viewport.id,
    viewport,
    status: viewport.id === "short-landscape-800x360" ? "FAIL" : "PASS",
    failure: viewport.id === "short-landscape-800x360" ? "manifesto geometry: H1 top safety is -10.45px; at least 2px is required" : null,
    measurement: viewport.id === "short-landscape-800x360" ? {
      h1: { rect: { top: 89.8 } },
      glyphBounds: { top: 81.8 },
      occludingHeader: {
        position: "sticky",
        presentation: { visible: true },
        anchoredToViewportTop: true,
        horizontalOverlap: true,
        occluding: true,
        effectiveBottom: 100.25,
      },
      effectiveVisibleBounds: { top: 100.25 },
      safeAllowances: {
        h1: { top: -10.45 },
        glyphs: { top: 3.5 },
        renderedLines: [{ top: -2.25 }, { top: 42 }, { top: 95 }],
      },
      boundaryAnalysis: {
        glyphEscapes: [{ glyph: "W", sides: ["top"] }],
        boundaryIntersections: [{ authoredLineIndex: 1, sides: ["top"] }],
        occludingHeaderIntersections: [{ authoredLineIndex: 1 }],
        safetyViolations: [{ authoredLineIndex: 1, sides: ["top"] }],
      },
    } : null,
  }));
  assert.equal(assertBefore800x360Defect(cases), true);
  const alternateFirstDiagnostic = structuredClone(cases);
  alternateFirstDiagnostic.find(({ id }) => id === "short-landscape-800x360").failure = "manifesto geometry: rendered line count differs";
  assert.equal(assertBefore800x360Defect(alternateFirstDiagnostic), true);
  assert.throws(() => assertBefore800x360Defect(cases.map((item) => ({ ...item, status: "PASS", failure: null }))), /was not reproduced/);
  const horizontalOnly = structuredClone(cases);
  const defect = horizontalOnly.find(({ id }) => id === "short-landscape-800x360");
  defect.failure = "manifesto geometry: horizontal overflow is present";
  defect.measurement.safeAllowances.h1.top = 4;
  defect.measurement.safeAllowances.glyphs.top = 4;
  defect.measurement.safeAllowances.renderedLines.forEach((line) => { line.top = 4; });
  defect.measurement.h1.rect.top = 110;
  defect.measurement.glyphBounds.top = 106;
  defect.measurement.boundaryAnalysis.glyphEscapes = [];
  defect.measurement.boundaryAnalysis.boundaryIntersections = [];
  defect.measurement.boundaryAnalysis.occludingHeaderIntersections = [];
  defect.measurement.boundaryAnalysis.safetyViolations = [];
  assert.throws(() => assertBefore800x360Defect(horizontalOnly), /does not contain measured|do not cross/);
});

test("fallback manifesto visibility rejects a DOM-present H1 that is hidden or clipped on any effective-bound side", () => {
  const passing = fallbackManifestoMeasurement();
  const receipt = validateFallbackManifestoMeasurement(passing, "fixture");
  assert.equal(receipt.status, "PASS");
  assert.deepEqual(receipt.h1Allowances, { left: 20, top: 26, right: 20, bottom: 144 });

  const hiddenHeader = structuredClone(passing);
  hiddenHeader.occludingHeader.presentation.visible = false;
  hiddenHeader.occludingHeader.occluding = false;
  hiddenHeader.occludingHeader.effectiveBottom = 0;
  assert.equal(validateFallbackManifestoMeasurement(hiddenHeader, "hidden-header").visibleStickyHeaderBottom, null);

  const inconsistentHiddenHeader = structuredClone(hiddenHeader);
  inconsistentHiddenHeader.occludingHeader.occluding = true;
  assert.throws(() => validateFallbackManifestoMeasurement(inconsistentHiddenHeader, "hidden-header"), /incorrectly classified/);

  const hidden = structuredClone(passing);
  hidden.h1.presentation.visible = false;
  assert.throws(() => validateFallbackManifestoMeasurement(hidden, "hidden"), /present but not visibly rendered/);

  const topClipped = structuredClone(passing);
  topClipped.h1.rect = measuredRect(20, 63, 370, 700);
  assert.throws(() => validateFallbackManifestoMeasurement(topClipped, "top"), /H1 top safety/);

  const leftClipped = structuredClone(passing);
  leftClipped.h1.rect = measuredRect(-1, 90, 370, 700);
  assert.throws(() => validateFallbackManifestoMeasurement(leftClipped, "left"), /H1 left safety/);

  const glyphRightClipped = structuredClone(passing);
  glyphRightClipped.glyphBounds = measuredRect(24, 100, 389, 680);
  assert.throws(() => validateFallbackManifestoMeasurement(glyphRightClipped, "glyph-right"), /glyph right safety/);

  const headerOccluded = structuredClone(passing);
  headerOccluded.boundaryAnalysis.occludingHeaderIntersections = [{ authoredLineIndex: 1 }];
  assert.throws(() => validateFallbackManifestoMeasurement(headerOccluded, "header"), /intersects the sticky header/);
});

test("no-JavaScript link evidence requires the exact eight visible, unoccluded, fully-in-viewport destinations", () => {
  const passing = visibleFieldMapInventory();
  assert.equal(assertVisibleLinkInventory(passing, NO_JS_FIELD_MAP_DESTINATIONS, "Field Map"), true);
  assert.throws(() => assertVisibleLinkInventory(passing.slice(0, 7), NO_JS_FIELD_MAP_DESTINATIONS, "Field Map"), /destination count differs/);
  assert.throws(() => assertVisibleLinkInventory(passing.map((record, index) => index === 2 ? { ...record, visible: false } : record), NO_JS_FIELD_MAP_DESTINATIONS, "Field Map"), /present but hidden/);
  assert.throws(() => assertVisibleLinkInventory(passing.map((record, index) => index === 5 ? { ...record, fullyInViewport: false } : record), NO_JS_FIELD_MAP_DESTINATIONS, "Field Map"), /clipped outside the viewport/);
  assert.throws(() => assertVisibleLinkInventory(passing.map((record, index) => index === 7 ? { ...record, unoccluded: false } : record), NO_JS_FIELD_MAP_DESTINATIONS, "Field Map"), /visually occluded/);

  const plane = {
    nativeDetailsOpen: true,
    enhancedController: null,
    viewport: { width: 390, height: 844 },
    plane: {
      position: "fixed",
      visible: true,
      bounds: { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 },
    },
  };
  assert.equal(assertNativeFieldMapViewport(plane), true);
  assert.throws(() => assertNativeFieldMapViewport({
    ...plane,
    plane: { ...plane.plane, bounds: { left: 0, top: 101.25, right: 390, bottom: 201.5, width: 390, height: 100.25 } },
  }), /does not occupy the complete viewport/);
});

test("browser link inventory serializes each stable index into page context", async () => {
  const observedArguments = [];
  const page = {
    locator: () => ({
      count: async () => 3,
      nth: (expectedIndex) => ({
        evaluate: async (_callback, serializedIndex) => {
          observedArguments.push({ expectedIndex, serializedIndex });
          return { index: serializedIndex };
        },
      }),
    }),
  };
  assert.deepEqual(await captureVisibleLinkInventory(page, "a[href]"), [{ index: 0 }, { index: 1 }, { index: 2 }]);
  assert.deepEqual(observedArguments, [
    { expectedIndex: 0, serializedIndex: 0 },
    { expectedIndex: 1, serializedIndex: 1 },
    { expectedIndex: 2, serializedIndex: 2 },
  ]);
});

test("enhanced Field Map keyboard evidence must traverse all eight destinations and wrap in both directions", () => {
  const openState = {
    open: true,
    rootOpen: true,
    destinationCount: 8,
    backgroundRegionCount: 3,
    inertRegionCount: 3,
    ownedInertCount: 3,
    destinationInventory: NO_JS_FIELD_MAP_DESTINATIONS.map((destination) => ({ ...destination, visible: true, focusable: true })),
    focusableInventory: [
      { element: "summary", insideFieldMap: true },
      ...NO_JS_FIELD_MAP_DESTINATIONS.map(() => ({ element: "a", insideFieldMap: true })),
    ],
  };
  const sequence = [
    { activeElement: "field-map-summary", activeDestinationName: null },
    ...NO_JS_FIELD_MAP_DESTINATIONS.map(({ name }) => ({ activeElement: "a", activeDestinationName: name })),
    { activeElement: "field-map-summary", activeDestinationName: null },
  ].map((record, index) => ({ step: index + 1, ...record }));
  assert.equal(assertFieldMapKeyboardAuthority(openState, sequence, { activeElement: "a", activeDestinationName: "Contact" }), true);
  const summaryOnly = sequence.map(() => ({ activeElement: "field-map-summary", activeDestinationName: null }));
  assert.throws(() => assertFieldMapKeyboardAuthority(openState, summaryOnly, { activeElement: "a", activeDestinationName: "Contact" }), /did not traverse/);
  assert.throws(() => assertFieldMapKeyboardAuthority(openState, sequence, { activeElement: "field-map-summary", activeDestinationName: null }), /reverse wrap/);
});

test("target ledger rejects a PASS label when any genuine or unexplained failure is counted", () => {
  const state = (id, summary, status = "PASS") => ({ id, report: { status, summary } });
  const clean = state("core", { targetFailures: 0, validExclusions: 2, unexplainedExclusions: 0, contractFailures: 0 });
  assert.equal(assertTargetLedgerPass([clean]), true);
  assert.throws(() => assertTargetLedgerPass([state("genuine", { targetFailures: 1, validExclusions: 0, unexplainedExclusions: 0, contractFailures: 0 })]), /genuine/);
  assert.throws(() => assertTargetLedgerPass([state("unexplained", { targetFailures: 0, validExclusions: 0, unexplainedExclusions: 1, contractFailures: 0 })]), /unexplained/);
  assert.throws(() => assertTargetLedgerPass([state("contract", { targetFailures: 0, validExclusions: 0, unexplainedExclusions: 0, contractFailures: 1 })]), /contract/);
  assert.equal(CORE_TARGET_VIEWPORTS.length, 7);
});

test("comparative recording topology and normalization contract are exact", () => {
  assert.deepEqual(COMPARISON_RECORDING_CONTRACT, {
    audioStreams: 0,
    codec: "h264",
    container: "mp4",
    durationSeconds: 6,
    fps: 30,
    height: 720,
    maximumSeconds: 6.6,
    minimumSeconds: 5.5,
    pixelFormat: "yuv420p",
    videoStreams: 1,
    width: 1280,
  });
  assert.deepEqual(COMPARISON_RECORDING_SPECS.map(({ id, relativePath }) => [id, relativePath]), [
    ["chromium-before-parent", "recordings/signal-field-comparison/chromium-before-parent.mp4"],
    ["chromium-after-r1", "recordings/signal-field-comparison/chromium-after-r1.mp4"],
    ["firefox-before-parent", "recordings/signal-field-comparison/firefox-before-parent.mp4"],
    ["firefox-after-r1", "recordings/signal-field-comparison/firefox-after-r1.mp4"],
  ]);
  const args = comparisonEncoderArguments("raw.webm", "normalized.mp4", { trimStartSeconds: 3.125 });
  for (const token of ["-ss", "3.125", "-t", "6.000", "-an", "-sn", "-dn", "cfr", "30", "libx264", "yuv420p", "+faststart"]) {
    assert.ok(args.some((value) => value === token || value.includes(token)), `encoder misses ${token}`);
  }
  assert.deepEqual(comparisonFullDecodeArguments("normalized.mp4").slice(0, 6), ["-v", "error", "-xerror", "-i", "normalized.mp4", "-map"]);
});

test("comparison media probe is fail-closed for duration, codec, pixel format and full decode", () => {
  const pass = validateComparisonRecordingProbe(validProbe(), { fullDecodePassed: true });
  assert.equal(pass.status, "PASS");
  assert.equal(pass.media.durationSeconds, 6);
  assert.equal(pass.media.decodedFrames, 180);
  assert.equal(pass.media.fullDecode, true);
  for (const [name, probe, options] of [
    ["duration", { ...validProbe(), format: { ...validProbe().format, duration: "8.0" } }, { fullDecodePassed: true }],
    ["codec", { ...validProbe(), streams: [{ ...validProbe().streams[0], codec_name: "vp9" }] }, { fullDecodePassed: true }],
    ["pixelFormat", { ...validProbe(), streams: [{ ...validProbe().streams[0], pix_fmt: "yuv444p" }] }, { fullDecodePassed: true }],
    ["fullDecode", validProbe(), { fullDecodePassed: false }],
  ]) {
    const result = validateComparisonRecordingProbe(probe, options);
    assert.equal(result.status, "FAIL", `${name} false PASS`);
    assert.ok(result.failures.includes(name));
  }
});

test("comparison report binds revisions, visible labels, bounded after response and file integrity", () => {
  const afterRevision = "b".repeat(40);
  const report = validComparisonReport(afterRevision);
  assert.equal(assertComparisonRecordingReport(report, afterRevision), true);
  assert.throws(() => assertComparisonRecordingReport({ ...report, rawBrowserVideoRetained: true }, afterRevision), /raw browser video/);
  assert.throws(() => assertComparisonRecordingReport({
    ...report,
    recordings: report.recordings.map((record, index) => index === 0 ? { ...record, sourceAuthority: { ...record.sourceAuthority, revision: afterRevision } } : record),
  }, afterRevision), /source authority/);
  assert.throws(() => assertComparisonRecordingReport({
    ...report,
    recordings: report.recordings.map((record, index) => index === 1 ? { ...record, pointerStates: [{ ...record.pointerStates[0], bounded: false }] } : record),
  }, afterRevision), /pointer states|bounded pointer/);
  assert.throws(() => assertComparisonRecordingReport({
    ...report,
    recordings: report.recordings.map((record, index) => index === 3 ? { ...record, sha256: "bad" } : record),
  }, afterRevision), /file integrity/);
});

test("comparison pointer return waits for numeric rest and publishes canonical CSS quantities", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /field\.dataset\.probe !== "settled"/);
  assert.match(source, /Math\.abs\(number\("--probe-x"\) - 50\) <= 0\.001/);
  assert.match(source, /Math\.abs\(number\("--probe-near-x"\)\) <= 0\.001/);
  assert.match(source, /Object\.is\(value, -0\) \? 0 : value/);
});

test("payload policy permits raster specimens and rejects HTML, font, archive, raw and embedded payloads", () => {
  assert.equal(forbiddenPayloadReason("typography/anybody-specimen.png"), null);
  assert.equal(forbiddenPayloadReason("recordings/signal-field-comparison/chromium-after-r1.mp4"), null);
  for (const candidate of [
    "typography/specimen.html",
    "typography/candidate.woff2",
    "nested/review.zip",
    "recordings/raw/firefox.webm",
    "raw/trace.json",
    "sources/site.json",
  ]) assert.ok(forbiddenPayloadReason(candidate), `${candidate} was not rejected`);
  assert.equal(forbiddenPayloadReason("report.json", "data:font/woff2;base64,AAAA"), "embedded font payload");
  assert.equal(forbiddenPayloadReason("report.md", "C:\\Users\\reviewer\\private.txt"), "private local path");
  assert.equal(forbiddenPayloadReason("report.json", "http://127.0.0.1:4397/"), "local capture URL");
  assert.equal(TYPOGRAPHY_SPECS.length, 4);
  assert.equal(TYPOGRAPHY_SPECS.filter(({ production }) => production).length, 1);
});

test("sanitizer removes capture origins and private local paths before publication", () => {
  const value = sanitizeForEvidence({
    before: "http://127.0.0.1:4381/about/",
    path: "C:\\Users\\reviewer\\OneDrive\\secret.json",
  }, [["http://127.0.0.1:4381/", "BEFORE_CAPTURE_ORIGIN/"]]);
  const serialized = JSON.stringify(value);
  assert.match(serialized, /BEFORE_CAPTURE_ORIGIN/);
  assert.match(serialized, /private-path-removed/);
  assert.doesNotMatch(serialized, /127\.0\.0\.1|C:\\\\Users|OneDrive/i);
});

test("closure manifest hashes every payload and rejects forbidden additions", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase7a-r1-closure-test-"));
  try {
    await writeFile(path.join(temporary, "report.json"), '{"status":"PASS"}\n');
    await writeFile(path.join(temporary, "README.md"), "# Closure\n\nPASS\n");
    const manifest = await buildClosureManifest(temporary, { status: "PASS" });
    assert.equal(manifest.status, "PASS");
    assert.equal(manifest.artifactCount, 2);
    assert.deepEqual(manifest.artifacts.map(({ relativePath }) => relativePath), ["README.md", "report.json"]);
    assert.ok(manifest.artifacts.every(({ bytes, sha256, status }) => bytes > 0 && /^[a-f0-9]{64}$/.test(sha256) && status === "PASS"));
    const strayMp4 = path.join(temporary, "stray.mp4");
    await writeFile(strayMp4, Buffer.from("not a normalized comparison"));
    await assert.rejects(() => buildClosureManifest(temporary), /exactly four normalized recordings/);
    await rm(strayMp4, { force: true });
    await writeFile(path.join(temporary, "specimen.html"), "<!doctype html>");
    await assert.rejects(() => buildClosureManifest(temporary), /forbidden artifact/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("source publishes explicit PNG captures and no output HTML/font/archive paths", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /type:\s*"png"/);
  assert.match(source, /fullPage:\s*true/);
  assert.match(source, /observeTargetSizes/);
  assert.match(source, /validateManifestoGeometry/);
  assert.match(source, /navigation-start\.png/);
  assert.match(source, /first-stable-paint\.png/);
  assert.match(source, /field-map\/semantic-isolation\.json/);
  assert.match(source, /target-size\/element-inventory\.json/);
  assert.match(source, /route-shells\/\$\{spec\.id\}\.png/);
  assert.match(source, /id:\s*"real-404"[\s\S]*?status:\s*404/);
  for (const relativePath of COMPARISON_RECORDING_SPECS.map(({ relativePath }) => relativePath)) assert.ok(source.includes(relativePath));
  assert.match(source, /recordVideo:\s*\{\s*dir:\s*rawDirectory/);
  assert.match(source, /FFmpeg full decode/);
  assert.match(source, /rawBrowserVideoRetained:\s*false/);
  assert.match(source, /\.capture-work/);
  assert.match(source, /await rm\(workRoot,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/);
  assert.match(source, /--after-revision/);
  assert.match(source, /--ffmpeg/);
  assert.match(source, /--ffprobe/);
  assert.doesNotMatch(source, /writeArtifact\([^\n]+\.(?:html|woff2?|ttf|otf|zip)["']/i);
  assert.equal(CLOSURE_MANIFEST_PATH, "closure-manifest.json");
});

test("native /#entry capture never writes document position and revalidates all 12 cases against shared sticky-header geometry", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /route = "\/#entry"/);
  assert.match(source, /page\.goto\(destination, \{ waitUntil: "domcontentloaded"/);
  assert.match(source, /location\.hash === hash/);
  assert.doesNotMatch(source, /\b(?:window\.)?scroll(?:To|By)\s*\(/);
  assert.doesNotMatch(source, /(?:\.|\b)scrollTop\s*=/);
  assert.doesNotMatch(source, /getBoundingClientRect\(\)\.top\s*\+\s*scrollY/);
  assert.match(source, /const measurement = await page\.evaluate\(measureManifestoGeometry\);/);
  assert.match(source, /invariant\(item\.measurement && typeof item\.measurement === "object"/);
  assert.match(source, /validateManifestoGeometry\(item\.measurement\);/);
  assert.match(source, /fullPage:\s*false/);
  assert.match(source, /fullPage:\s*true/);
  assert.match(source, /for \(const viewport of REQUIRED_SHORT_LANDSCAPE_VIEWPORTS\) \{\s*const page = await context\.newPage\(\);/);
  assert.match(source, /finally \{\s*await page\.close\(\);\s*\}/);
});

test("self-test exercises viewport, privacy and fail-closed authorities", () => {
  const direct = runSelfTest();
  assert.deepEqual(direct, {
    schema: "quantum-hub.phase-7a-r1.closure-capture.v1",
    status: "PASS",
    shortLandscapeCases: 12,
    comparisonRecordings: 4,
    failClosedGeometry: true,
    failClosedRecordings: true,
    failClosedTargets: true,
    forbiddenPayloadChecks: "PASS",
  });
  const output = JSON.parse(execFileSync(process.execPath, [scriptPath, "--self-test"], { encoding: "utf8" }));
  assert.deepEqual(output, direct);
});
