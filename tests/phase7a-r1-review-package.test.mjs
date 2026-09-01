import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  DETACHED_MANIFEST_NAME,
  GOVERNANCE_PATH,
  GOVERNANCE_SCHEMA,
  INDEPENDENT_AUDIT_NAME,
  IN_ARCHIVE_MANIFEST,
  PACKAGE_SCHEMA,
  PRIOR_HUMAN_DECISIONS,
  REQUIRED_COMPARISON_RECORDING_PATHS,
  REQUIRED_EVIDENCE,
  REQUIRED_GENERAL_RECORDING_PATHS,
  REQUIRED_RECORDING_PATHS,
  REVIEW_ZIP_NAME,
  ROOT,
  SERVED_BUILD_AUTHORITY_PATH,
  SERVED_BUILD_AUTHORITY_SCHEMA,
  assertAllowedEvidencePath,
  assertNoPrivateOrSecretPayload,
  buildReviewArtifacts,
  normalizeEvidenceEntries,
  safeEvidencePath,
  stableJson,
} from "../scripts/package-phase7a-r1-review.mjs";
import {
  AUDIT_SCHEMA,
  assertAllowedEntryPath,
  auditPackageBytes,
  auditReviewBytes,
  safeEvidencePath as safeAuditPath,
  sha256,
} from "../scripts/audit-phase7a-r1-review.mjs";
import { crc32, createStoredZipBuffer } from "../scripts/package-phase7a-human-review.mjs";
import { parseStoredZip } from "../scripts/audit-phase7a-human-review-package.mjs";
import {
  FROZEN_MAIN,
  PHASE7A_GATES,
  PHASE7A_PARENT,
  PHASE7A_R1_BRANCH,
  PHASE7A_R1_PARENT,
  PHASE7A_R1_REVIEW_ZIP_NAME,
  PHYSICAL_ASSETS,
} from "../scripts/phase7a-contract.mjs";

const SOURCE_HEAD = "b".repeat(40);
const DIRECT_PARENT = "c".repeat(40);
const AFTER_DOCUMENT = Object.freeze({ bytes: 23117, sha256: "d".repeat(64) });
const BEFORE_DOCUMENT = Object.freeze({ bytes: 17917, sha256: "2c153d9094fe0ca888cbbc7ac4105a775b2ac5b088b47b650d542c2a9cb62cac" });
const json = (value) => Buffer.from(stableJson(value));
const BEFORE_RUNTIME = Object.freeze([
  Object.freeze({ kind: "css", route: "/_astro/BaseLayout.ByjrAQMG.css", httpStatus: 200, contentType: "text/css", bytes: 12_579, sha256: "0967a69765cc49c6291e125d44958bb19694d1c74fe028e17f6f095bd1109f68" }),
  Object.freeze({ kind: "javascript", route: "/_astro/index.astro_astro_type_script_index_0_lang.DuXUZIF3.js", httpStatus: 200, contentType: "application/javascript", bytes: 2_604, sha256: "05006aae308ac99e9f16bb4c7d93b75f41e8766ea06aaf9d8c3d19fb1a7bb52a" }),
  Object.freeze({ kind: "css", route: "/_astro/index.CMvgVrhb.css", httpStatus: 200, contentType: "text/css", bytes: 17_131, sha256: "a9932a0eed64df5c5a5ebc35067b003558644bbddb8c179227364c1b340c0691" }),
]);
const AFTER_RUNTIME_LOCAL = Object.freeze([
  Object.freeze({ kind: "css", route: "/_astro/app.css", bytes: 901, sha256: "1".repeat(64) }),
  Object.freeze({ kind: "javascript", route: "/_astro/app.js", bytes: 777, sha256: "2".repeat(64) }),
]);
const AFTER_RUNTIME_SERVED = Object.freeze(AFTER_RUNTIME_LOCAL.map((record) => Object.freeze({ ...record, httpStatus: 200, contentType: record.kind === "css" ? "text/css" : "application/javascript" })));
const runtimeFingerprint = (records) => sha256(Buffer.from(records.map(({ kind, route, bytes, sha256: hash }) => `${kind}\t${route}\t${bytes}\t${hash}`).sort().join("\n"), "utf8"));
const BEFORE_RUNTIME_FINGERPRINT = runtimeFingerprint(BEFORE_RUNTIME);
const AFTER_RUNTIME_FINGERPRINT = runtimeFingerprint(AFTER_RUNTIME_LOCAL);

function mp4Box(type, payload = Buffer.alloc(0)) {
  const bytes = Buffer.alloc(8 + payload.length);
  bytes.writeUInt32BE(bytes.length, 0);
  bytes.write(type, 4, 4, "ascii");
  payload.copy(bytes, 8);
  return bytes;
}

const RECORDING_BYTES = Buffer.concat([
  mp4Box("ftyp", Buffer.from("isom", "ascii")),
  mp4Box("moov"),
  mp4Box("mdat", Buffer.from([0])),
]);
const RECORDING_CHECKS = Object.freeze(Object.fromEntries([
  "audioStreams", "codec", "constantFrameRate", "container", "decodedFrames", "dimensions", "duration", "fullDecode", "oneVideoStream", "otherStreams", "pixelFormat",
].map((name) => [name, true])));
const recordingRow = (relativePath, scenarioValidation = undefined) => {
  const comparison = relativePath.startsWith("04-signal-field/");
  const before = comparison && relativePath.includes("before-parent");
  const generalMatch = /^19-recordings\/(chromium|firefox)-(.+)\.mp4$/.exec(relativePath);
  const engine = generalMatch?.[1];
  const scenario = generalMatch?.[2];
  const document = before ? { revision: PHASE7A_R1_PARENT, ...BEFORE_DOCUMENT } : { revision: SOURCE_HEAD, ...AFTER_DOCUMENT };
  const runtime = before ? { count: BEFORE_RUNTIME.length, fingerprint: BEFORE_RUNTIME_FINGERPRINT } : { count: AFTER_RUNTIME_LOCAL.length, fingerprint: AFTER_RUNTIME_FINGERPRINT };
  const stateAuthority = scenario ? scenarioStateAuthority(scenario) : null;
  return {
    relativePath,
    ...(scenario ? { engine, scenario, sourceAuthority: portableSource(), stateAuthority, stateAuthoritySha256: sha256(Buffer.from(stableJson(stateAuthority), "utf8")) } : {}),
    media: { fullDecode: true },
    bytes: RECORDING_BYTES.length,
    sha256: sha256(RECORDING_BYTES),
    validationChecks: { ...RECORDING_CHECKS },
    ...(scenarioValidation ? { scenarioValidation } : {}),
    ...(comparison ? { sourceAuthority: { revision: document.revision, document: { bytes: document.bytes, sha256: document.sha256 }, livePageAttestation: { document: { bytes: document.bytes, sha256: document.sha256 }, runtimeAssets: runtime } } } : {}),
    status: "PASS",
  };
};

function targetObservation() {
  return { status: "PASS", minimumCssPixels: 44, candidateCount: 8, records: [], targetFailures: [], validExclusions: [], unexplainedExclusions: [], contractFailures: [], summary: { belowMinimum: 0, targetFailures: 0, validExclusions: 0, unexplainedExclusions: 0, contractFailures: 0 } };
}

const bounds = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
const MANIFESTO_LINES = ["WE TURN", "INDUSTRIAL NEEDS", "INTO FIELD EVIDENCE."];

function glyphBoxes(text, left, top, right, bottom, start) {
  const glyphs = [...text].filter((glyph) => /\S/u.test(glyph));
  const step = (right - left) / glyphs.length;
  return glyphs.map((glyph, index) => ({ glyph, glyphOrder: start + index, nodeIndex: 0, startOffset: index, endOffset: index + 1, ...bounds(left + step * index, top, left + step * (index + 1), bottom) }));
}

function passingMeasurement(width, height) {
  const headerBottom = 50;
  const effective = bounds(0, headerBottom, width, height);
  const lineTops = [headerBottom + 12, headerBottom + (height - headerBottom) * 0.36, headerBottom + (height - headerBottom) * 0.68];
  const lineHeight = Math.min(34, (height - headerBottom) * 0.16);
  let order = 0;
  const authoredLines = MANIFESTO_LINES.map((text, index) => {
    const left = 30 + (index === 2 ? 5 : index * 8);
    const right = width - 30 - (index === 0 ? 80 : 0);
    const glyphs = glyphBoxes(text, left, lineTops[index], right, lineTops[index] + lineHeight, order);
    order += glyphs.length;
    const rendered = { authoredLineIndex: index + 1, renderedLineIndex: 1, ...bounds(left, lineTops[index], right, lineTops[index] + lineHeight), glyphCount: glyphs.length, text: glyphs.map(({ glyph }) => glyph).join("") };
    return { authoredLineIndex: index + 1, text, elementRect: bounds(left - 2, lineTops[index] - 2, right + 2, lineTops[index] + lineHeight + 2), glyphBoxes: glyphs, glyphBounds: bounds(left, lineTops[index], right, lineTops[index] + lineHeight), renderedLineUnions: [rendered] };
  });
  const renderedLineUnions = authoredLines.flatMap(({ renderedLineUnions }) => renderedLineUnions);
  const glyphBounds = bounds(Math.min(...renderedLineUnions.map(({ left }) => left)), Math.min(...renderedLineUnions.map(({ top }) => top)), Math.max(...renderedLineUnions.map(({ right }) => right)), Math.max(...renderedLineUnions.map(({ bottom }) => bottom)));
  const h1 = bounds(20, headerBottom + 4, width - 20, height - 6);
  return {
    schema: "quantum-hub.phase-7a-r1.manifesto-geometry.v1",
    measuredAt: "2026-09-01T00:00:00.000Z",
    selectors: { h1: "#home-title", section: "[data-manifesto-threshold]", authoredLine: ".manifesto-line", occludingHeader: ".site-header" },
    viewport: { id: `short-landscape-${width}x${height}`, ...bounds(0, 0, width, height) },
    state: { cinematicMode: "enhanced", cinematicPhase: "settled", manifestoReveal: "resolved", resolvedOrStatic: true },
    measurementError: null,
    h1: { selector: "#home-title", ariaLabel: "We turn industrial needs into field evidence.", rect: h1, presentation: { display: "grid", visibility: "visible", opacity: 1, visible: true } },
    section: { selector: "[data-manifesto-threshold]", rect: bounds(0, headerBottom, width, height + 100) },
    sectionClipBounds: bounds(0, headerBottom, width, height + 100),
    clippingAncestors: [{ tag: "section", id: "entry", classes: ["manifesto-field"], selector: "#entry", isSignalFieldSection: true, overflowX: "clip", overflowY: "clip", clipPath: "none", contain: "none", clipsX: true, clipsY: true, bounds: bounds(0, headerBottom, width, height + 100) }],
    usableClipBounds: effective,
    occludingHeader: { tag: "header", id: null, classes: ["site-header"], selector: ".site-header", rect: bounds(0, 0, width, headerBottom), position: "sticky", computedTop: "0px", zIndex: "40", presentation: { display: "block", visibility: "visible", opacity: 1, visible: true }, anchoredToViewportTop: true, horizontallyOverlapsManifesto: true, occluding: true, effectiveBottom: headerBottom },
    effectiveVisibleBounds: effective,
    authoredLines,
    renderedLineUnions,
    glyphBounds,
    safeAllowances: { minimumRequiredPx: 2, h1: { top: h1.top - effective.top, bottom: effective.bottom - h1.bottom }, glyphs: { top: glyphBounds.top - effective.top, bottom: effective.bottom - glyphBounds.bottom }, renderedLines: renderedLineUnions.map((line) => ({ authoredLineIndex: line.authoredLineIndex, renderedLineIndex: 1, top: line.top - effective.top, bottom: effective.bottom - line.bottom })) },
    boundaryAnalysis: { glyphEscapes: [], boundaryIntersections: [], safetyViolations: [], occludingHeaderIntersections: [] },
    horizontalOverflow: false,
    horizontalMetrics: { documentScrollWidth: width, bodyScrollWidth: width, maximumScrollWidth: width, clientWidth: width, viewportWidth: width, overflowPixels: 0 },
  };
}

const cinematic = (cinematicPhase, cinematicSegment, conceptualCoordinate, manifestoReveal = "hidden", additions = {}) => ({
  cinematicPhase,
  cinematicSegment,
  conceptualCoordinate,
  conceptualFrame: Math.min(540, Math.floor(conceptualCoordinate) + 1),
  targetFrame: Math.min(500, Math.floor(conceptualCoordinate) + 1),
  manifestoReveal,
  ...additions,
});
const stableStop = (state) => ({ ...state, arrival: structuredClone(state), postDwell: structuredClone(state), dwellMs: 4_100 });

function scenarioStateAuthority(scenario) {
  if (scenario === "complete-threshold-entry") return { [scenario]: {
    initial: cinematic("physical", "top-dormancy", 0, "hidden", { path: "/", signalField: true, scrollY: 0 }),
    latePhysical: cinematic("physical", "physical-threshold", 490, "hidden", { scrollY: 100 }),
    threshold: cinematic("entry", "entry-reveal", 520, "revealing", { scrollY: 200 }),
    manifesto: cinematic("settled", "entry-reveal", 540, "resolved", { manifestoWords: 7, scrollY: 300 }),
    signalField: cinematic("settled", "entry-reveal", 540, "resolved", { signalField: true, fieldMapLinks: 8, bifurcationPresent: true, bifurcationLinks: 2, scrollY: 700 }),
  } };
  if (scenario === "complete-reverse") return { [scenario]: {
    settled: cinematic("settled", "entry-reveal", 540, "resolved", { scrollY: 600 }), entry: cinematic("entry", "entry-reveal", 527, "resolved", { scrollY: 560 }), digitalBlack: cinematic("black", "digital-breathing", 506, "hidden", { scrollY: 520 }), physicalThreshold: cinematic("physical", "physical-threshold", 490, "hidden", { scrollY: 480 }), qHold: cinematic("physical", "q-hold", 380, "hidden", { scrollY: 380 }), raster: cinematic("physical", "raster-settling", 340, "hidden", { scrollY: 340 }), line: cinematic("physical", "phosphor-line", 305, "hidden", { scrollY: 300 }), physical: cinematic("physical", "current-orbit", 150, "hidden", { scrollY: 100 }), top: cinematic("physical", "top-dormancy", 0, "hidden", { scrollY: 0 }),
  } };
  if (scenario === "stop-states") {
    const states = { physicalThreshold: cinematic("physical", "physical-threshold", 490, "hidden", { scrollY: 480 }), digitalBlack: cinematic("black", "digital-breathing", 506, "hidden", { scrollY: 505 }), breach: cinematic("entry", "entry-reveal", 518, "resolved", { scrollY: 522 }), partialManifesto: cinematic("entry", "entry-reveal", 532, "resolved", { scrollY: 530 }), completedManifesto: cinematic("settled", "entry-reveal", 540, "resolved", { scrollY: 540 }) };
    return { [scenario]: { ...Object.fromEntries(Object.entries(states).map(([name, state]) => [name, stableStop(state)])), openFieldMap: { fieldMapOpen: true, fieldMapRootOpen: true, fieldMapLinks: 8, backgroundInert: true }, fieldMapKeyboard: { fieldMapOpen: true, activeElement: "a" }, fieldMapEscape: { fieldMapOpen: false, fieldMapRootOpen: false, activeElement: "field-map-summary", backgroundInert: false } } };
  }
  if (scenario === "home-intent") return { [scenario]: { supporting: { path: "/about/" }, entryIntent: { path: "/", hash: "#entry", manifestoReveal: "resolved" }, reverseAccess: cinematic("physical", "top-dormancy", 0, "hidden", { scrollY: 0, signalField: true }) } };
  if (scenario === "responsive-authority") {
    const states = Object.fromEntries(["desktop-1440x900", "short-desktop-1366x650", "tablet-portrait-768x1024", "mobile-390x844", "narrow-320x800", "mobile-landscape-844x390"].map((id) => [id, { signalField: true, manifestoWords: 7, horizontalOverflow: false }]));
    for (const size of ["740x320", "740x360", "768x320", "768x360", "800x320", "800x360", "800x390", "820x360", "844x360", "844x390", "896x414", "900x480"]) { const [width, height] = size.split("x").map(Number); const measurement = passingMeasurement(width, height); states[`r1-${size}`] = { signalField: true, manifestoWords: 7, horizontalOverflow: false, manifestoGeometry: { status: "PASS", failure: null, measurement } }; }
    states.resizeDuringBreach = { signalField: true }; states.resizeAfterManifesto = { signalField: true, manifestoReveal: "resolved" };
    return { [scenario]: states };
  }
  if (scenario === "reduced-motion-and-no-js") return {
    "reduced-motion": { staticHome: { cinematicMode: "static", signalField: true, manifestoVisibility: { status: "PASS" } }, fieldMap: { fieldMapOpen: true, fieldMapLinks: 8 }, evidenceNetwork: { cinematicRequests: 0 } },
    "no-javascript": { entry: { signalField: true, manifestoWords: 7, manifestoVisibility: { status: "PASS" } }, nativeFieldMap: { fieldMapOpen: true, fieldMapLinks: 8, linkInventory: DESTINATIONS.map(([href, name], index) => ({ index, href, accessibleName: name, elementType: "a", width: 220, height: 48, visible: true, fullyInViewport: true, unoccluded: true, intendedInteractive: true })), nativePlane: { enhancedController: null, nativeDetailsOpen: true, viewport: { width: 1280, height: 720 }, plane: { position: "fixed", visible: true, bounds: bounds(0, 0, 1280, 720) } } }, evidenceNetwork: { cinematicRequests: 0 } },
  };
  if (scenario === "typography") return { typography: { candidates: 4, candidate1: { label: "Anybody", visible: true }, candidate2: { label: "Mona Sans", visible: true }, candidate3: { label: "Bricolage Grotesque", visible: true }, candidate4: { label: "Archivo", visible: true } } };
  throw new Error(`unsupported fixture scenario: ${scenario}`);
}

function clippingReport() {
  const viewports = SHORT_VIEWPORTS.map((size) => { const [width, height] = size.split("x").map(Number); return { id: `short-landscape-${size}`, width, height, family: "short-landscape" }; });
  const after = viewports.map((viewport) => ({ id: viewport.id, viewport, status: "PASS", failure: null, measurement: passingMeasurement(viewport.width, viewport.height) }));
  const before = structuredClone(after);
  const defect = before.find(({ id }) => id === "short-landscape-800x360");
  defect.status = "FAIL";
  defect.failure = "manifesto geometry: authored line 3 must resolve to exactly 1 rendered line";
  defect.measurement.h1.rect.top = 40;
  defect.measurement.h1.rect.height = defect.measurement.h1.rect.bottom - 40;
  defect.measurement.safeAllowances.h1.top = -10;
  defect.measurement.occludingHeader.presentation.visible = false;
  defect.measurement.occludingHeader.presentation.visibility = "hidden";
  defect.measurement.occludingHeader.presentation.opacity = 0;
  defect.measurement.occludingHeader.occluding = false;
  defect.measurement.occludingHeader.effectiveBottom = 0;
  defect.measurement.boundaryAnalysis.glyphEscapes = [{ glyph: "W", sides: ["top"] }];
  defect.measurement.boundaryAnalysis.boundaryIntersections = [{ authoredLineIndex: 1, renderedLineIndex: 1, sides: ["top"] }];
  defect.measurement.boundaryAnalysis.safetyViolations = [{ authoredLineIndex: 1, renderedLineIndex: 1, sides: ["top"] }];
  return { status: "PASS", requiredViewportCount: 12, before, after };
}

const openMapState = () => ({ open: true, rootOpen: true, destinationCount: 8, destinationNames: ["Home", "For industry", "For startups", "Industries", "Proof", "SPARK", "About", "Contact"], backgroundRegionCount: 3, inertRegionCount: 3, ownedInertCount: 3, activeElement: "a", focusableInventory: [{ element: "a", name: "Home", insideFieldMap: true }] });
const closedMapState = (focus = false) => ({ open: false, rootOpen: false, destinationCount: 8, destinationNames: [], backgroundRegionCount: 3, inertRegionCount: 0, ownedInertCount: 0, activeElement: focus ? "field-map-summary" : "body", focusableInventory: [] });

function fieldMapReport() {
  const focusNames = [null, "Home", "For industry", "For startups", "Industries", "Proof", "SPARK", "About", "Contact", null];
  return { status: "PASS", states: { closed: closedMapState(), open: openMapState(), escape: closedMapState(true) }, focusSequence: focusNames.map((activeDestinationName, index) => ({ step: index + 1, activeElement: activeDestinationName === null ? "field-map-summary" : "a", activeName: activeDestinationName, activeDestinationName })), reverseFocus: { activeElement: "a", activeDestinationName: "Contact" }, repeatedCycles: Array.from({ length: 3 }, (_, index) => ({ cycle: index + 1, opened: openMapState(), closed: closedMapState(true) })), lifecycle: { pagehide: closedMapState(), pageshow: closedMapState(), history: closedMapState() }, navigation: { arrival: closedMapState(), back: closedMapState() } };
}

const visibleLink = ([href, name], index = 0) => ({ href, accessibleName: name, visible: true, fullyInViewport: true, unoccluded: true, intendedInteractive: true, width: 160, height: 44, bounds: bounds(20, 10 + index * 48, 620, 54 + index * 48) });
const visibleNoJavaScriptLink = ([href, accessibleName], index = 0) => ({ index, href, accessibleName, elementType: "a", visible: true, fullyInViewport: true, unoccluded: true, intendedInteractive: true, width: 160, height: 44, bounds: bounds(20, 10 + index * 48, 620, 54 + index * 48) });
const DESTINATIONS = [["/#entry", "Home"], ["/for-partners/", "For industry"], ["/for-startups/", "For startups"], ["/industries/", "Industries"], ["/pocs/", "Proof"], ["/spark/", "SPARK"], ["/about/", "About"], ["/contact/", "Contact"]];
const NO_JS_FIELD_MAP_DESTINATIONS = [["/#entry", "00 Home 00 / origin"], ["/for-partners/", "01 For industry 01 / need"], ["/for-startups/", "02 For startups 02 / capability"], ["/industries/", "03 Industries 03 / context"], ["/pocs/", "04 Proof 04 / evidence"], ["/spark/", "05 SPARK 05 / programme"], ["/about/", "06 About 06 / position"], ["/contact/", "07 Contact 07 / signal"]];
const NO_JS_BIFURCATION_DESTINATIONS = [["/for-partners/", "For industryPressure becomes proof."], ["/for-startups/", "For startupsA viable edge enters the field."]];

function fallbackGeometry(width, height) {
  return passingMeasurement(width, height);
}

function fallbackVisibility(measurement) {
  const effective = measurement.effectiveVisibleBounds;
  const h1 = measurement.h1.rect;
  const glyphs = measurement.glyphBounds;
  return {
    status: "PASS",
    authority: "shared phase7a-manifesto-geometry measurement",
    effectiveVisibleBounds: structuredClone(effective),
    h1Bounds: structuredClone(h1),
    glyphBounds: structuredClone(glyphs),
    h1Allowances: { left: h1.left - effective.left, top: h1.top - effective.top, right: effective.right - h1.right, bottom: effective.bottom - h1.bottom },
    glyphAllowances: { left: glyphs.left - effective.left, top: glyphs.top - effective.top, right: effective.right - glyphs.right, bottom: effective.bottom - glyphs.bottom },
    glyphBoxCount: measurement.authoredLines.flatMap(({ glyphBoxes }) => glyphBoxes).length,
    visibleStickyHeaderBottom: measurement.occludingHeader.occluding ? measurement.occludingHeader.effectiveBottom : null,
    horizontalOverflow: false,
  };
}

function fallbackReports() {
  const receipt = (width, height) => {
    const manifestoGeometry = fallbackGeometry(width, height);
    return { manifestoGeometry, manifestoVisibility: fallbackVisibility(manifestoGeometry) };
  };
  const font = receipt(320, 800);
  font.manifestoGeometry.occludingHeader.presentation.visibility = "hidden";
  font.manifestoGeometry.occludingHeader.presentation.opacity = 0;
  font.manifestoGeometry.occludingHeader.presentation.visible = false;
  font.manifestoGeometry.occludingHeader.occluding = false;
  font.manifestoGeometry.occludingHeader.effectiveBottom = 0;
  font.manifestoVisibility = fallbackVisibility(font.manifestoGeometry);
  return {
    reduced: { status: "PASS", closure: { cinematicMode: "static", signalField: true, bifurcationLinks: 2, horizontalOverflow: false, ...receipt(1440, 900) } },
    noJs: { status: "PASS", closure: { enhancedController: null, nativeDetailsOpen: true, horizontalOverflow: false, ...receipt(390, 844), fieldMapLinkInventory: NO_JS_FIELD_MAP_DESTINATIONS.map(visibleNoJavaScriptLink), bifurcationLinkInventory: NO_JS_BIFURCATION_DESTINATIONS.map(visibleNoJavaScriptLink) } },
    font: { status: "PASS", closure: { anybodyLoaded: false, abortedFontRequests: 1, manifestoWords: 7, horizontalOverflow: false, ...font } },
  };
}

function firefoxFirstPaint(status = "PASS") {
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

function servedBuildBinding() {
  return {
    status: "PASS",
    revision: SOURCE_HEAD,
    relativePath: "dist/index.html",
    ...AFTER_DOCUMENT,
    localDist: true,
    immutableOrigin: true,
    branchOrigin: true,
    runtimeAssets: { count: AFTER_RUNTIME_LOCAL.length, fingerprint: AFTER_RUNTIME_FINGERPRINT },
  };
}

function servedBuildAuthority() {
  return {
    schema: SERVED_BUILD_AUTHORITY_SCHEMA,
    status: "PASS",
    repository: {
      schema: SERVED_BUILD_AUTHORITY_SCHEMA,
      branch: PHASE7A_R1_BRANCH,
      head: SOURCE_HEAD,
      exactParent: PHASE7A_R1_PARENT,
      parentIsAncestor: true,
      mergeCommitsSinceParent: 0,
      worktreeClean: true,
      worktreeStatus: [],
      buildReceipt: {
        command: "npm run build:phase7a-r1",
        authorityProfile: "phase7a-r1",
        completed: true,
        headBefore: SOURCE_HEAD,
        headAfter: SOURCE_HEAD,
        branchAfter: PHASE7A_R1_BRANCH,
        worktreeCleanAfter: true,
        worktreeStatusAfter: [],
      },
      localDist: { relativePath: "dist/index.html", ...AFTER_DOCUMENT },
    },
    originSeparation: { before: "BEFORE_CAPTURE_ORIGIN", after: "AFTER_CAPTURE_ORIGIN", distinctNormalizedOrigins: true },
    documents: {
      before: { channel: "node-fetch-response-body", route: "/", httpStatus: 200, contentType: "text/html", ...BEFORE_DOCUMENT },
      after: { channel: "node-fetch-response-body", route: "/", httpStatus: 200, contentType: "text/html", ...AFTER_DOCUMENT },
    },
    documentFingerprintsDistinct: true,
    runtimeAssets: {
      derivation: "linked CSS/JS paths parsed from each verified root HTML response",
      before: { revision: PHASE7A_R1_PARENT, served: BEFORE_RUNTIME.map((record) => ({ ...record })), fingerprint: BEFORE_RUNTIME_FINGERPRINT, authority: { revision: PHASE7A_R1_PARENT, derivation: "immutable linked CSS/JavaScript bytes from the exact-parent governed build", fingerprint: BEFORE_RUNTIME_FINGERPRINT } },
      after: { localDist: AFTER_RUNTIME_LOCAL.map((record) => ({ ...record })), served: AFTER_RUNTIME_SERVED.map((record) => ({ ...record })), localFingerprint: AFTER_RUNTIME_FINGERPRINT, servedFingerprint: AFTER_RUNTIME_FINGERPRINT },
    },
    deploymentBinding: servedBuildBinding(),
  };
}

function servedReceipt() {
  return {
    report: "provenance/served-build-authority.json",
    status: "PASS",
    branch: PHASE7A_R1_BRANCH,
    afterRevision: SOURCE_HEAD,
    beforeDocument: { revision: PHASE7A_R1_PARENT, ...BEFORE_DOCUMENT },
    afterDocument: { revision: SOURCE_HEAD, ...AFTER_DOCUMENT },
    runtimeAssets: { before: { count: BEFORE_RUNTIME.length, fingerprint: BEFORE_RUNTIME_FINGERPRINT }, after: { count: AFTER_RUNTIME_LOCAL.length, fingerprint: AFTER_RUNTIME_FINGERPRINT } },
  };
}

function portableServedBuild() {
  return {
    schema: "quantum-hub.phase-7a-r1.portable-served-build-receipt.v1",
    status: "PASS",
    branch: PHASE7A_R1_BRANCH,
    revision: SOURCE_HEAD,
    document: { relativePath: "dist/index.html", ...AFTER_DOCUMENT },
    runtimeAssets: AFTER_RUNTIME_LOCAL.map((record) => ({ ...record })),
    runtimeFingerprint: AFTER_RUNTIME_FINGERPRINT,
    servedParity: { document: true, runtimeAssets: true },
    freshBuild: { command: "npm run build:phase7a-r1", headBefore: SOURCE_HEAD, headAfter: SOURCE_HEAD, worktreeCleanBefore: true, worktreeCleanAfter: true },
  };
}

const portableSource = (receipt = portableServedBuild()) => ({ status: receipt.status, branch: receipt.branch, revision: receipt.revision, document: receipt.document, runtimeFingerprint: receipt.runtimeFingerprint });

const SHORT_VIEWPORTS = Object.freeze(["740x320", "740x360", "768x320", "768x360", "800x320", "800x360", "800x390", "820x360", "844x360", "844x390", "896x414", "900x480"]);
const TYPOGRAPHY_SPECIMENS = Object.freeze(["anybody", "mona", "bricolage", "archivo"].map((id) => `06-typography/visuals/${id}-specimen.png`));

function addFixtureRasters(byPath, rasterBytes, chromeRasters) {
  for (const state of ["before", "after"]) {
    for (const viewport of SHORT_VIEWPORTS) {
      byPath.set(`03-responsive/visuals/${state}/short-landscape-${viewport}-viewport.png`, Buffer.from(rasterBytes));
      byPath.set(`03-responsive/visuals/${state}/short-landscape-${viewport}-full-page.png`, Buffer.from(rasterBytes));
    }
  }
  for (const relativePath of [
    "04-signal-field/visuals/before-desktop-1440x900.png",
    "04-signal-field/visuals/after-desktop-1440x900.png",
    "05-audience/visuals/desktop-1440x900.png",
    "05-audience/visuals/mobile-390x844.png",
    ...TYPOGRAPHY_SPECIMENS,
    "07-field-map/visuals/closed-desktop-1440x900.png",
    "07-field-map/visuals/open-desktop-1440x900.png",
    "07-field-map/visuals/keyboard-focus-desktop-1440x900.png",
    "07-field-map/visuals/escape-focus-return-desktop-1440x900.png",
    "10-firefox/visuals/navigation-start.png",
    "10-firefox/visuals/first-stable-paint.png",
    "12-fallback/visuals/reduced-motion-desktop-1440x900.png",
    "12-fallback/visuals/no-javascript-native-map-mobile-390x844.png",
    "12-fallback/visuals/fallback-fonts-narrow-320x800.png",
    ...["for-industry", "for-startups", "industries", "proof", "spark", "about", "contact", "real-404"].map((id) => `15-publication/visuals/${id}.png`),
  ]) byPath.set(relativePath, Buffer.from(rasterBytes));
  const routePaths = ["/", "/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/pocs/maradin/", "/spark/", "/about/", "/contact/", "/__phase7a-real-404-probe__/"];
  const routeFilename = (routePath) => `${routePath === "/" ? "home" : routePath.replaceAll("/", "-").replace(/^-|-$/g, "")}-top.png`;
  const chromeFilenames = [...routePaths.map(routeFilename), "home-field-map-closed.png", "home-bifurcation.png", "home-field-map-open.png", "home-field-map-keyboard-focus.png", "home-field-map-escape-closed.png"];
  for (const [index, filename] of chromeFilenames.entries()) byPath.set(`09-chrome-200/visuals/native-${String(index + 1).padStart(2, "0")}-${filename}`, Buffer.from(chromeRasters[index]));
  byPath.set("09-chrome-200/visuals/ui-01-chrome-visible-200-percent.png", Buffer.from(rasterBytes));
  return chromeFilenames;
}

function installedChromeReport(rasterBytes, filenames, chromeRasters) {
  const viewport = bounds(0, 0, 640, 360);
  const effectiveVisibleBounds = bounds(0, 0, 640, 360);
  const h1Bounds = bounds(10, 60, 630, 300);
  const glyphBounds = bounds(15, 65, 625, 295);
  const manifestoVisibility = {
    applicable: true,
    status: "PASS",
    viewportBounds: viewport,
    sectionBounds: viewport,
    sectionClipBounds: viewport,
    clippingAncestors: [],
    usableClipBounds: viewport,
    header: { bounds: bounds(0, 0, 640, 50), position: "sticky", visible: false, anchoredToViewportTop: true, horizontallyOverlapsManifesto: true, occluding: false },
    h1Bounds,
    glyphBounds,
    effectiveVisibleBounds,
    safeAllowances: { h1Top: 60, h1Bottom: 60, h1Left: 10, h1Right: 10, glyphTop: 65, glyphBottom: 65, glyphLeft: 15, glyphRight: 15 },
  };
  const servedBuild = portableServedBuild();
  const sourceAuthority = portableSource(servedBuild);
  const routePaths = ["/", "/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/pocs/maradin/", "/spark/", "/about/", "/contact/", "/__phase7a-real-404-probe__/"];
  const routes = routePaths.map((routePath, index) => ({
    status: "PASS",
    path: routePath,
    sourceAuthority,
    checks: Object.fromEntries(["httpStatus", "semanticH1", "landmarks", "noHorizontalOverflow", "wholeWords", "targetSizes", "manifestoUnclipped"].map((name) => [name, true])),
    state: { targetSize: targetObservation(), h1Bounds: index === 0 ? h1Bounds : null, manifestoVisibility: index === 0 ? manifestoVisibility : { applicable: false, status: "NOT_APPLICABLE" }, geometry: { innerWidth: 640, innerHeight: 360 } },
  }));
  return {
    schema: "quantum-hub.phase-7a.installed-chrome-native-zoom.v1",
    status: "PASS",
    servedBuild,
    sourceAuthority,
    classification: "GENUINE INSTALLED GOOGLE CHROME BROWSER ZOOM",
    browser: { product: "Google Chrome", version: "fixture", headed: true },
    forbiddenSubstitutes: { viewportResize: false, cssZoom: false, transformScale: false, deviceEmulation: false },
    zoomProof: { status: "PASS", uiZoomLabel: "Zoom: 200%", checks: { installedChromeUi: true, widthHalved: true, dprDoubled: true, noDeviceEmulation: true } },
    routes,
    visualEvidence: filenames.map((filename, index) => ({ label: index < 10 ? `route:${routePaths[index]}` : ["home-field-map-closed", "home-bifurcation", "home-field-map-open", "home-field-map-keyboard-focus", "home-field-map-escape-closed"][index - 10], filename, format: "png", width: 3, height: 2, bytes: chromeRasters[index].length, entropy: 4, maximumChannelRange: 255, sha256: sha256(chromeRasters[index]), sourceAuthority })),
    fieldMap: { status: "PASS", sourceAuthority, links: 8, visibleLinks: DESTINATIONS.map((destination) => ({ ...visibleLink(destination), bounds: bounds(20, 10, 620, 54) })), overflow: false, backgroundRegions: [{ inert: true, owned: true }, { inert: true, owned: true }, { inert: true, owned: true }], keyboardFocus: { inMap: true }, escapeFocusReturn: true, inertAfterEscape: 0, targetSize: targetObservation() },
    visibleBrowserZoomConfirmation: { schema: "quantum-hub.phase-7a-r1.installed-chrome-ui-evidence.v1", status: "PASS", browserWindow: { product: "Google Chrome", processName: "chrome.exe", visible: true, remoteDebuggingProcessMatched: true, title: "Qsite1 - Google Chrome" }, visibleZoomConfirmation: true, visibleZoomObservation: { method: "windows-ui-automation-accessibility-tree", chromeMenuVisible: true, observedLabel: "200%", screenshot: "09-chrome-200/visuals/ui-01-chrome-visible-200-percent.png" }, screenshots: [{ relativePath: "09-chrome-200/visuals/ui-01-chrome-visible-200-percent.png", format: "png", width: 3, height: 2, bytes: rasterBytes.length, sha256: sha256(rasterBytes), entropy: 4, maximumChannelRange: 255 }] },
  };
}

function makeFixtureEntries(rasterBytes, chromeRasters) {
  const byPath = new Map();
  for (const { relativePath } of REQUIRED_EVIDENCE) {
    if (relativePath.endsWith(".json")) byPath.set(relativePath, json({ status: "PASS" }));
    else byPath.set(relativePath, Buffer.from(`${relativePath}\n`, "utf8"));
  }
  byPath.set(GOVERNANCE_PATH, json({
    schema: GOVERNANCE_SCHEMA,
    authorityProfile: "phase7a-r1",
    status: "READY",
    fresh: true,
    sourceHead: SOURCE_HEAD,
  }));
  byPath.set("00-authority/prior-human-decisions.json", json({ gates: PRIOR_HUMAN_DECISIONS }));
  byPath.set("00-authority/current-human-gates.json", json({
    gates: PHASE7A_GATES.map((gate) => ({ gate, status: "PENDING HUMAN REVIEW" })),
  }));
  byPath.set("01-provenance/provenance.json", json({
    status: "PASS",
    branch: PHASE7A_R1_BRANCH,
    requiredParent: PHASE7A_R1_PARENT,
    finalHead: SOURCE_HEAD,
    directParent: DIRECT_PARENT,
    localMain: FROZEN_MAIN,
    originMain: FROZEN_MAIN,
    zeroMergeCommits: true,
    localUpstreamParity: true,
    acceptedPhase6Ancestry: true,
    acceptedPhase6: PHASE7A_PARENT,
    commits: [
      { hash: DIRECT_PARENT, parents: [PHASE7A_R1_PARENT] },
      { hash: SOURCE_HEAD, parents: [DIRECT_PARENT] },
    ],
  }));
  byPath.set(SERVED_BUILD_AUTHORITY_PATH, json(servedBuildAuthority()));
  byPath.set("03-responsive/clipping-report.json", json(clippingReport()));
  byPath.set("04-signal-field/before-after-report.json", json({
    status: "PASS",
    servedBuildAuthority: servedReceipt(),
    comparisonRecordings: REQUIRED_COMPARISON_RECORDING_PATHS.map((relativePath) => recordingRow(relativePath)),
  }));
  byPath.set("10-firefox/firefox-first-paint-report.json", json(firefoxFirstPaint()));
  byPath.set("07-field-map/semantic-isolation-report.json", json(fieldMapReport()));
  byPath.set("08-targets/target-size-inventory.json", json({
    schema: "quantum-hub.phase-7a-r1.target-ledger.v1",
    status: "PASS",
    minimumCssPixels: 44,
    stateCount: 10,
    states: Array.from({ length: 10 }, (_, index) => ({ id: `state-${index + 1}`, route: "/#entry", viewport: { id: `viewport-${index + 1}`, width: 800, height: 600 }, state: "resolved-home", report: targetObservation() })),
    summary: { activeFailures: 0, validExclusions: 0, unexplainedExclusions: 0, contractFailures: 0 },
  }));
  byPath.set("11-accessibility/accessibility-report.json", json({
    status: "PASS",
    qaServedBuildAuthorities: ["chromium", "firefox", "webkit"].map((engine) => ({ engine, servedBuild: portableServedBuild(), sourceAuthority: portableSource() })),
    fullMatrices: ["chromium", "firefox", "webkit"].map((engine) => ({ engine, cases: 20, violations: 0, sourceAuthority: portableSource(), status: "PASS" })),
  }));
  byPath.set("06-typography/typography-report.json", json({
    status: "PASS",
    candidates: TYPOGRAPHY_SPECIMENS.map((specimen) => ({ specimen })),
  }));
  byPath.set("13-performance/performance-and-lifecycle-report.json", json({
    status: "PASS",
    servedBuildAuthority: portableServedBuild(),
    scenarioRecordings: REQUIRED_GENERAL_RECORDING_PATHS.map((relativePath) => recordingRow(relativePath, "PASS")),
  }));
  const fallback = fallbackReports();
  byPath.set("12-fallback/reduced-motion-report.json", json(fallback.reduced));
  byPath.set("12-fallback/no-js-report.json", json(fallback.noJs));
  byPath.set("12-fallback/fallback-font-report.json", json(fallback.font));
  byPath.set("16-phase4/phase-4-hash-verification.json", json({
    status: "PASS",
    assets: PHYSICAL_ASSETS.map(([relativePath, hash]) => ({ relativePath, sha256: hash })),
  }));
  byPath.set("17-deployment/deployment-verification.json", json({
    status: "PASS",
    authorityProfile: "phase7a-r1",
    branch: PHASE7A_R1_BRANCH,
    commitHash: SOURCE_HEAD,
    localDistDeployedParity: true,
    immutableOrigin: true,
    branchOrigin: true,
    signedDeploymentBinding: true,
    signedCloudflareCheckBinding: true,
    checks: {
      localDistDeployedParity: true,
      immutableOrigin: true,
      branchOrigin: true,
      signedDeploymentBinding: true,
      signedCloudflareCheckBinding: true,
    },
    servedBuildDocumentBinding: servedBuildBinding(),
    payloadLedger: [
      { relativePath: "index.html", publicPath: "/", ...AFTER_DOCUMENT, expectedHttpStatus: 200, contentType: "text/html; charset=utf-8", cacheControl: "public, max-age=0, must-revalidate", matchedPolicies: ["/*"], localDist: "PASS", immutable: { status: "PASS", actualHttpStatus: 200, ...AFTER_DOCUMENT, headers: "PASS", security: "PASS" }, branch: { status: "PASS", actualHttpStatus: 200, ...AFTER_DOCUMENT, headers: "PASS", security: "PASS" }, status: "PASS" },
      { relativePath: "_astro/app.css", publicPath: "/_astro/app.css", bytes: 901, sha256: "1".repeat(64), expectedHttpStatus: 200, contentType: "text/css", cacheControl: "public, max-age=31536000, immutable", matchedPolicies: ["/_astro/*"], localDist: "PASS", immutable: { status: "PASS", actualHttpStatus: 200, bytes: 901, sha256: "1".repeat(64), headers: "PASS", security: "PASS" }, branch: { status: "PASS", actualHttpStatus: 200, bytes: 901, sha256: "1".repeat(64), headers: "PASS", security: "PASS" }, status: "PASS" },
      { relativePath: "_astro/app.js", publicPath: "/_astro/app.js", bytes: 777, sha256: "2".repeat(64), expectedHttpStatus: 200, contentType: "application/javascript", cacheControl: "public, max-age=31536000, immutable", matchedPolicies: ["/_astro/*"], localDist: "PASS", immutable: { status: "PASS", actualHttpStatus: 200, bytes: 777, sha256: "2".repeat(64), headers: "PASS", security: "PASS" }, branch: { status: "PASS", actualHttpStatus: 200, bytes: 777, sha256: "2".repeat(64), headers: "PASS", security: "PASS" }, status: "PASS" },
    ],
    payloadTotals: { files: 3, comparableFiles: 3, bytes: AFTER_DOCUMENT.bytes + 1_678 },
  }));
  byPath.set("18-limitations/environmental-limitations.json", json({ status: "RECORDED", limitations: [] }));
  byPath.set("19-notes/readme.md", Buffer.from("R1 independent review notes\n"));
  for (const relativePath of REQUIRED_RECORDING_PATHS) byPath.set(relativePath, Buffer.from(RECORDING_BYTES));
  if (rasterBytes) {
    const chromeFilenames = addFixtureRasters(byPath, rasterBytes, chromeRasters);
    byPath.set("09-chrome-200/installed-chrome-200-percent-report.json", json(installedChromeReport(rasterBytes, chromeFilenames, chromeRasters)));
  }
  return [...byPath].map(([relativePath, data]) => ({ relativePath, data }));
}

function clone(entries) {
  return entries.map((entry) => ({ ...entry, data: Buffer.from(entry.data) }));
}

function mutateJson(entries, relativePath, mutate) {
  const output = clone(entries);
  const entry = output.find((candidate) => candidate.relativePath === relativePath);
  const document = JSON.parse(entry.data.toString("utf8"));
  mutate(document);
  entry.data = json(document);
  return output;
}

function crc32Hex(bytes) {
  return crc32(bytes).toString(16).padStart(8, "0");
}

function cryptographicallyRebind(relativePath, transform, sourceArtifacts = artifacts) {
  const source = parseStoredZip(sourceArtifacts.archiveBytes).entries;
  const entries = new Map([...source].map(([relativePath, entry]) => [relativePath, Buffer.from(entry.data)]));
  const replacement = transform(Buffer.from(entries.get(relativePath)));
  if (replacement === null) entries.delete(relativePath);
  else entries.set(relativePath, Buffer.from(replacement));

  const manifest = JSON.parse(entries.get(IN_ARCHIVE_MANIFEST).toString("utf8"));
  manifest.payloads = manifest.payloads.filter(({ path: candidate }) => entries.has(candidate)).map((record) => {
    const bytes = entries.get(record.path);
    return { ...record, bytes: bytes.length, sha256: sha256(bytes), crc32: crc32Hex(bytes) };
  });
  manifest.summary.payloadCount = manifest.payloads.length;
  manifest.summary.payloadBytes = manifest.payloads.reduce((sum, payload) => sum + payload.bytes, 0);
  manifest.summary.imageCount = manifest.payloads.filter(({ kind }) => kind === "image").length;
  manifest.summary.recordingCount = manifest.payloads.filter(({ kind }) => kind === "video").length;
  const manifestBytes = json(manifest);
  entries.set(IN_ARCHIVE_MANIFEST, manifestBytes);

  const archiveBytes = createStoredZipBuffer([...entries].map(([relativePath, data]) => ({ relativePath, data })));
  const reparsed = parseStoredZip(archiveBytes).entries;
  const detached = {
    schema: sourceArtifacts.detachedManifest.schema,
    archive: {
      filename: REVIEW_ZIP_NAME,
      bytes: archiveBytes.length,
      sha256: sha256(archiveBytes),
      entryCount: reparsed.size,
    },
    embeddedManifest: {
      path: IN_ARCHIVE_MANIFEST,
      bytes: manifestBytes.length,
      sha256: sha256(manifestBytes),
    },
    entries: [...reparsed].map(([relativePath, entry]) => ({
      path: relativePath,
      bytes: entry.data.length,
      sha256: sha256(entry.data),
      crc32: entry.crc32,
    })),
  };
  return { archiveBytes, detachedBytes: json(detached) };
}

function cryptographicallyRebindJson(relativePath, mutate, sourceArtifacts = artifacts) {
  return cryptographicallyRebind(relativePath, (bytes) => {
    const document = JSON.parse(bytes.toString("utf8"));
    mutate(document);
    return json(document);
  }, sourceArtifacts);
}

function cryptographicallyRebindDeployment(mutate) {
  return cryptographicallyRebindJson("17-deployment/deployment-verification.json", mutate);
}

let raster;
let chromeRasters;
let fixtureEntries;
let artifacts;

test.before(async () => {
  raster = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#d71970" } }).png().toBuffer();
  chromeRasters = await Promise.all(Array.from({ length: 15 }, (_, index) => sharp({ create: { width: 3, height: 2, channels: 3, background: { r: 20 + index * 7, g: 40 + index * 5, b: 60 + index * 3 } } }).png().toBuffer()));
  fixtureEntries = makeFixtureEntries(raster, chromeRasters);
  artifacts = buildReviewArtifacts(clone(fixtureEntries));
});

test("R1 packaging is additive, exact-named, deterministic, and binds every payload", () => {
  assert.equal(REVIEW_ZIP_NAME, PHASE7A_R1_REVIEW_ZIP_NAME);
  assert.equal(REVIEW_ZIP_NAME, "phase-7a-r1-signal-field-authority-human-review.zip");
  assert.equal(DETACHED_MANIFEST_NAME, "phase-7a-r1-signal-field-authority-human-review.manifest.json");
  assert.equal(INDEPENDENT_AUDIT_NAME, "phase-7a-r1-signal-field-authority-human-review.audit.json");
  assert.equal(artifacts.manifest.schema, PACKAGE_SCHEMA);
  assert.equal(artifacts.manifest.authority.branch, PHASE7A_R1_BRANCH);
  assert.equal(artifacts.manifest.authority.exactParent, PHASE7A_R1_PARENT);
  assert.equal(artifacts.manifest.authority.frozenMain, FROZEN_MAIN);
  assert.equal(REQUIRED_EVIDENCE.length, 25);
  assert.equal(REQUIRED_RECORDING_PATHS.length, 18);
  assert.equal(artifacts.manifest.payloads.length, fixtureEntries.length);
  for (const payload of artifacts.manifest.payloads) {
    const source = fixtureEntries.find(({ relativePath }) => relativePath === payload.path);
    assert.ok(source, payload.path);
    assert.equal(payload.bytes, source.data.length);
    assert.equal(payload.sha256, sha256(source.data));
    assert.match(payload.crc32, /^[0-9a-f]{8}$/);
  }
  const repeated = buildReviewArtifacts(clone(fixtureEntries));
  assert.deepEqual(repeated.archiveBytes, artifacts.archiveBytes);
  assert.deepEqual(repeated.detachedBytes, artifacts.detachedBytes);
});

test("installed Chrome concealed-header geometry packages and audits only with honest clipping authority", () => {
  assert.doesNotThrow(() => buildReviewArtifacts(clone(fixtureEntries)));
  assert.equal(auditPackageBytes({ archiveBytes: artifacts.archiveBytes, detachedBytes: artifacts.detachedBytes }).status, "PASS");
  const installedChromePath = "09-chrome-200/installed-chrome-200-percent-report.json";
  const mutations = [
    [(document) => { document.routes[0].state.manifestoVisibility.header.occluding = true; }, /occlusion authority differs/],
    [(document) => { document.routes[0].state.manifestoVisibility.header.visible = true; }, /occlusion authority differs/],
    [(document) => { delete document.routes[0].state.manifestoVisibility.sectionClipBounds; }, /section client bounds.*missing/i],
    [(document) => { document.routes[0].state.manifestoVisibility.sectionClipBounds.top = 10; document.routes[0].state.manifestoVisibility.sectionClipBounds.height = 350; }, /usable clip top differs/],
    [(document) => { document.routes[0].state.manifestoVisibility.header.anchoredToViewportTop = false; }, /anchor authority differs/],
    [(document) => { document.routes[0].state.manifestoVisibility.header.horizontallyOverlapsManifesto = false; }, /overlap authority differs/],
    [(document) => { document.routes[0].state.manifestoVisibility.safeAllowances.h1Top = 59; }, /safe allowance differs/],
  ];
  for (const [mutate, expected] of mutations) {
    assert.throws(() => buildReviewArtifacts(mutateJson(fixtureEntries, installedChromePath, mutate)), expected);
    assert.throws(() => auditPackageBytes(cryptographicallyRebindJson(installedChromePath, mutate)), expected);
  }
  const clippingPath = "03-responsive/clipping-report.json";
  const clippingMutations = [
    [(document) => { document.before[5].measurement.occludingHeader.presentation.visible = true; }, /header visibility authority differs/],
    [(document) => { document.before[5].measurement.occludingHeader.effectiveBottom = 100; }, /header effective bottom differs/],
    [(document) => { document.before[5].measurement.clippingAncestors[0].clipsY = false; }, /axis authority differs/],
    [(document) => { document.before[5].measurement.occludingHeader.anchoredToViewportTop = false; }, /anchor authority differs/],
    [(document) => { document.before[5].measurement.occludingHeader.horizontallyOverlapsManifesto = false; }, /overlap authority differs/],
    [(document) => {
      document.before[5].measurement.clippingAncestors[0].bounds.top += 1;
      document.before[5].measurement.clippingAncestors[0].bounds.height -= 1;
    }, /Signal Field #entry ancestor bounds\.top differs/],
    [(document) => {
      document.before[5].measurement.usableClipBounds.top += 10;
      document.before[5].measurement.usableClipBounds.height -= 10;
      document.before[5].measurement.effectiveVisibleBounds.top += 10;
      document.before[5].measurement.effectiveVisibleBounds.height -= 10;
    }, /usable clip bounds\.top differs/],
  ];
  for (const [mutate, expected] of clippingMutations) {
    assert.throws(() => buildReviewArtifacts(mutateJson(fixtureEntries, clippingPath, mutate)), expected);
    assert.throws(() => auditPackageBytes(cryptographicallyRebindJson(clippingPath, mutate)), expected);
  }
});

test("fallback-font hidden sticky-header truth packages and audits without inventing occlusion", () => {
  const fallbackPath = "12-fallback/fallback-font-report.json";
  const concealHeader = (document) => {
    const header = document.closure.manifestoGeometry.occludingHeader;
    header.presentation.visible = false;
    header.presentation.visibility = "hidden";
    header.presentation.opacity = 0;
    header.occluding = false;
    header.effectiveBottom = 0;
    document.closure.manifestoVisibility.visibleStickyHeaderBottom = null;
  };
  const concealed = mutateJson(fixtureEntries, fallbackPath, concealHeader);
  assert.doesNotThrow(() => buildReviewArtifacts(concealed));
  assert.equal(auditPackageBytes(cryptographicallyRebindJson(fallbackPath, concealHeader)).status, "PASS");

  const mutations = [
    [(document) => { concealHeader(document); document.closure.manifestoGeometry.occludingHeader.presentation.visible = true; }, /header visibility authority differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoGeometry.occludingHeader.occluding = true; }, /header occlusion authority differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoGeometry.occludingHeader.effectiveBottom = 50; }, /header effective bottom differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoGeometry.occludingHeader.anchoredToViewportTop = false; }, /header anchor authority differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoGeometry.occludingHeader.horizontallyOverlapsManifesto = false; }, /header overlap authority differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoGeometry.clippingAncestors[0].clipsY = false; }, /axis authority differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoGeometry.clippingAncestors[0].bounds.top += 1; document.closure.manifestoGeometry.clippingAncestors[0].bounds.height -= 1; }, /Signal Field #entry ancestor bounds\.top differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoGeometry.usableClipBounds.top += 1; document.closure.manifestoGeometry.usableClipBounds.height -= 1; document.closure.manifestoGeometry.effectiveVisibleBounds.top += 1; document.closure.manifestoGeometry.effectiveVisibleBounds.height -= 1; }, /usable clip bounds\.top differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoVisibility.visibleStickyHeaderBottom = 50; }, /visible sticky-header summary differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoVisibility.effectiveVisibleBounds.top += 1; document.closure.manifestoVisibility.effectiveVisibleBounds.height -= 1; }, /visibility summary differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoVisibility.h1Allowances.top += 1; }, /visibility allowance summary differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoVisibility.glyphBoxCount -= 1; }, /visibility inventory differs/i],
    [(document) => { concealHeader(document); document.closure.manifestoGeometry.viewport.id = "short-landscape-321x800"; }, /viewport identifier differs/i],
  ];
  for (const [mutate, expected] of mutations) {
    assert.throws(
      () => buildReviewArtifacts(mutateJson(fixtureEntries, fallbackPath, mutate)),
      expected,
    );
    assert.throws(
      () => auditPackageBytes(cryptographicallyRebindJson(fallbackPath, mutate)),
      expected,
    );
  }

  for (const path of ["12-fallback/reduced-motion-report.json", "12-fallback/no-js-report.json"]) {
    const removeVisibleHeaderReceipt = (document) => { document.closure.manifestoVisibility.visibleStickyHeaderBottom = null; };
    assert.throws(() => buildReviewArtifacts(mutateJson(fixtureEntries, path, removeVisibleHeaderReceipt)), /visible sticky-header summary differs/i);
    assert.throws(() => auditPackageBytes(cryptographicallyRebindJson(path, removeVisibleHeaderReceipt)), /visible sticky-header summary differs/i);
  }
});

test("no-JavaScript link inventories package and audit only with exact visible identities", () => {
  const noJavaScriptPath = "12-fallback/no-js-report.json";
  const mutations = [
    [(document) => { document.closure.fieldMapLinkInventory.pop(); }, /Field Map link inventory differs/],
    [(document) => { document.closure.fieldMapLinkInventory[0].index = 1; }, /Field Map link 1 identity differs/],
    [(document) => { document.closure.fieldMapLinkInventory[0].href = "/wrong/"; }, /Field Map link 1 identity differs/],
    [(document) => { document.closure.fieldMapLinkInventory[0].accessibleName = "Home"; }, /Field Map link 1 identity differs/],
    [(document) => { document.closure.fieldMapLinkInventory[0].elementType = "button"; }, /Field Map link 1 is not an intended link/],
    [(document) => { document.closure.fieldMapLinkInventory[0].intendedInteractive = false; }, /Field Map link 1 is not an intended link/],
    [(document) => { document.closure.fieldMapLinkInventory[0].visible = false; }, /Field Map link 1 is not fully visible/],
    [(document) => { document.closure.fieldMapLinkInventory[0].fullyInViewport = false; }, /Field Map link 1 is not fully visible/],
    [(document) => { document.closure.fieldMapLinkInventory[0].unoccluded = false; }, /Field Map link 1 is not fully visible/],
    [(document) => { document.closure.fieldMapLinkInventory[0].width = 0; }, /Field Map link 1 has no visible area/],
    [(document) => { document.closure.bifurcationLinkInventory[0].accessibleName = "For industry"; }, /bifurcation link 1 identity differs/],
  ];
  for (const [mutate, expected] of mutations) {
    assert.throws(() => buildReviewArtifacts(mutateJson(fixtureEntries, noJavaScriptPath, mutate)), expected);
    assert.throws(() => auditPackageBytes(cryptographicallyRebindJson(noJavaScriptPath, mutate)), expected);
  }
});

test("the independent audit reparses CRC/SHA/bytes/signatures and fully decodes raster evidence", async () => {
  const base = auditPackageBytes({ archiveBytes: artifacts.archiveBytes, detachedBytes: artifacts.detachedBytes });
  assert.equal(base.schema, AUDIT_SCHEMA);
  assert.equal(base.status, "PASS");
  assert.equal(base.crcResult, "PASS");
  assert.equal(base.duplicateAndTraversalPathStatus, "PASS");
  assert.equal(base.nestedArchiveStatus, "PASS");
  assert.equal(base.rawTraceAndSourceMediaStatus, "PASS");
  assert.equal(base.fontBinaryAndEmbeddedDataFontStatus, "PASS");
  assert.equal(base.privacyAndSecretsScan, "PASS");
  assert.equal(base.archive.sha256, sha256(artifacts.archiveBytes));
  assert.equal(base.embeddedManifest.sha256, sha256(artifacts.manifestBytes));
  assert.equal(base.payloads.length, fixtureEntries.length);

  const complete = await auditReviewBytes({
    archiveBytes: artifacts.archiveBytes,
    detachedBytes: artifacts.detachedBytes,
    recordingDecoder: async ({ bytes }) => bytes.equals(RECORDING_BYTES),
  });
  assert.equal(complete.imageDecodeStatus, "PASS");
  assert.equal(complete.recordingDecodeStatus, "PASS");
  assert.equal(complete.mediaDecode.images.count, 89);
  assert.equal(complete.mediaDecode.recordings.count, 18);
  assert.ok(complete.mediaDecode.images.files.every(({ width, height, status }) => width === 3 && height === 2 && status === "PASS"));
  assert.equal(complete.checks.rasterFullDecode, "PASS");
  assert.equal(complete.checks.mp4FullDecode, "PASS");
});

test("CRC tampering is rejected before manifest claims are trusted", () => {
  const tampered = Buffer.from(artifacts.archiveBytes);
  const nameLength = tampered.readUInt16LE(26);
  tampered[30 + nameLength] ^= 0x01;
  assert.throws(
    () => auditPackageBytes({ archiveBytes: tampered, detachedBytes: artifacts.detachedBytes }),
    /CRC rejection|deterministic stored encoding/i,
  );
});

test("a canonical ZIP rebuild cannot hide payload tampering from embedded or detached bindings", () => {
  const parsed = parseStoredZip(artifacts.archiveBytes).entries;
  const changed = new Map([...parsed].map(([relativePath, entry]) => [relativePath, Buffer.from(entry.data)]));
  changed.set("19-notes/readme.md", Buffer.from("cryptographically rebuilt but changed\n"));
  const archiveBytes = createStoredZipBuffer([...changed].map(([relativePath, data]) => ({ relativePath, data })));
  assert.throws(
    () => auditPackageBytes({ archiveBytes, detachedBytes: artifacts.detachedBytes }),
    /embedded manifest differs|detached manifest differs/i,
  );
});

test("duplicate, traversal, absolute, nested-archive, raw, source-media, node_modules, and font paths fail closed", () => {
  for (const invalid of ["../escape.json", "/absolute.json", "C:/absolute.json", "folder\\file.json", "a/%2e%2e/b.json"]) {
    assert.throws(() => safeEvidencePath(invalid), /portable|relative|unsafe|reinterpretation/i, invalid);
    assert.throws(() => safeAuditPath(invalid), /portable|relative|unsafe|reinterpretation/i, invalid);
  }
  for (const invalid of [
    "20-images/nested.zip",
    "20-images/raw/frame.png",
    "20-images/traces/session.json",
    "14-network/capture.trace.json",
    "node_modules/proof.json",
    "20-images/source-capture.mov",
    "06-typography/candidate.woff2",
  ]) {
    assert.throws(() => assertAllowedEvidencePath(invalid), /nested archive|forbidden|source media|font binary/i, invalid);
    assert.throws(() => assertAllowedEntryPath(invalid), /nested archive|forbidden|source media|font binary/i, invalid);
  }
  const duplicated = clone(fixtureEntries);
  duplicated.push({ relativePath: "19-notes/README.md", data: Buffer.from("case folded duplicate\n") });
  assert.throws(() => normalizeEvidenceEntries(duplicated), /duplicate evidence path/i);

  const parsed = parseStoredZip(artifacts.archiveBytes).entries;
  const withNestedArchive = [
    ...[...parsed].map(([relativePath, entry]) => ({ relativePath, data: entry.data })),
    { relativePath: "20-images/nested.zip", data: Buffer.from("nested") },
  ];
  assert.throws(
    () => createStoredZipBuffer(withNestedArchive),
    /nested archive/i,
  );
});

test("private paths, secrets, and embedded base64 font payloads fail closed", () => {
  for (const [payload, pattern] of [
    ["C:\\Users\\reviewer\\capture.png", /private local path/i],
    ["stored in /home/reviewer/capture.png", /private local path/i],
    [`api_key=sk-${"a".repeat(32)}`, /secret-shaped/i],
    ["src:url(data:font/woff2;base64,QUJDRA==)", /data:font\/base64/i],
  ]) assert.throws(() => assertNoPrivateOrSecretPayload(Buffer.from(payload), "19-notes/report.md"), pattern);
});

test("missing or false governance, gates, hashes, deployment, and required reports are rejected", () => {
  assert.throws(
    () => buildReviewArtifacts(clone(fixtureEntries).filter(({ relativePath }) => relativePath !== "08-targets/target-size-inventory.json")),
    /required R1 evidence is missing/i,
  );
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, GOVERNANCE_PATH, (document) => { document.fresh = false; })),
    /not marked fresh|not fresh/i,
  );
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "00-authority/current-human-gates.json", (document) => { document.gates[0].status = "ACCEPT"; })),
    /six current Phase 7A gates/i,
  );
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "00-authority/prior-human-decisions.json", (document) => { document.gates[0].status = "REPAIR"; })),
    /prior human decisions differ/i,
  );
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "16-phase4/phase-4-hash-verification.json", (document) => { document.assets[0].sha256 = "0".repeat(64); })),
    /authority mismatch/i,
  );
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "17-deployment/deployment-verification.json", (document) => { document.localDistDeployedParity = false; })),
    /deployment proof is missing or false: localDistDeployedParity/i,
  );
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "01-provenance/provenance.json", (document) => { document.commits[1].parents[0] = PHASE7A_R1_PARENT; })),
    /breaks the linear ancestry/i,
  );
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "10-firefox/firefox-first-paint-report.json", (document) => { document.status = "UNKNOWN"; })),
    /status must be PASS or the bounded evidenced LIMITATION/i,
  );
});

test("deployment authority, every proof boolean, and a non-vacuous check map are mandatory", () => {
  const deploymentPath = "17-deployment/deployment-verification.json";
  for (const field of ["authorityProfile", "localDistDeployedParity", "immutableOrigin", "branchOrigin", "signedDeploymentBinding"]) {
    assert.throws(
      () => buildReviewArtifacts(mutateJson(fixtureEntries, deploymentPath, (document) => { delete document[field]; })),
      /authorityProfile must be phase7a-r1|deployment proof is missing or false/i,
      `omitted ${field}`,
    );
  }
  for (const field of ["localDistDeployedParity", "immutableOrigin", "branchOrigin", "signedDeploymentBinding"]) {
    assert.throws(
      () => buildReviewArtifacts(mutateJson(fixtureEntries, deploymentPath, (document) => { document[field] = false; })),
      new RegExp(`deployment proof is missing or false: ${field}`, "i"),
      `false ${field}`,
    );
  }
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, deploymentPath, (document) => { document.authorityProfile = "phase7a"; })),
    /authorityProfile must be phase7a-r1/i,
  );
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, deploymentPath, (document) => { document.signedCloudflareCheckBinding = false; })),
    /signed Cloudflare check binding is false/i,
  );
  for (const mutate of [
    (document) => { delete document.checks; },
    (document) => { document.checks = {}; },
  ]) {
    assert.throws(
      () => buildReviewArtifacts(mutateJson(fixtureEntries, deploymentPath, mutate)),
      /deployment checks must be a non-empty map/i,
    );
  }

  for (const field of ["authorityProfile", "localDistDeployedParity", "immutableOrigin", "branchOrigin", "signedDeploymentBinding"]) {
    const rebound = cryptographicallyRebindDeployment((document) => { delete document[field]; });
    assert.throws(
      () => auditPackageBytes(rebound),
      /authorityProfile must be phase7a-r1|deployment proof is missing or false/i,
      `independent audit omitted ${field}`,
    );
  }
  for (const field of ["localDistDeployedParity", "immutableOrigin", "branchOrigin", "signedDeploymentBinding"]) {
    const rebound = cryptographicallyRebindDeployment((document) => { document[field] = false; });
    assert.throws(
      () => auditPackageBytes(rebound),
      new RegExp(`deployment proof is missing or false: ${field}`, "i"),
      `independent audit false ${field}`,
    );
  }
  const wrongAuthority = cryptographicallyRebindDeployment((document) => { document.authorityProfile = "phase7a"; });
  assert.throws(() => auditPackageBytes(wrongAuthority), /authorityProfile must be phase7a-r1/i);
  const falseCloudflareBinding = cryptographicallyRebindDeployment((document) => { document.signedCloudflareCheckBinding = false; });
  assert.throws(() => auditPackageBytes(falseCloudflareBinding), /signed Cloudflare check binding is false/i);
  const emptyChecks = cryptographicallyRebindDeployment((document) => { document.checks = {}; });
  assert.throws(
    () => auditPackageBytes(emptyChecks),
    /deployment checks must be a non-empty map/i,
  );
});

test("served-build provenance is a required, HEAD-bound, deployment-cross-bound report in both validators", () => {
  assert.throws(
    () => buildReviewArtifacts(clone(fixtureEntries).filter(({ relativePath }) => relativePath !== SERVED_BUILD_AUTHORITY_PATH)),
    /required R1 evidence is missing: .*served-build-authority/i,
  );
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, SERVED_BUILD_AUTHORITY_PATH, (document) => { document.repository.head = DIRECT_PARENT; })),
    /served-build repository branch\/HEAD\/parent authority differs/i,
  );
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, SERVED_BUILD_AUTHORITY_PATH, (document) => { document.deploymentBinding.sha256 = "e".repeat(64); })),
    /served-build deployment document binding differs/i,
  );

  const omitted = cryptographicallyRebind(SERVED_BUILD_AUTHORITY_PATH, () => null);
  assert.throws(() => auditPackageBytes(omitted), /required R1 evidence is missing: .*served-build-authority/i);
  const tampered = cryptographicallyRebindJson(SERVED_BUILD_AUTHORITY_PATH, (document) => { document.documents.after.bytes += 1; });
  assert.throws(() => auditPackageBytes(tampered), /served R1 document differs from fresh local dist/i);
  const crossBinding = cryptographicallyRebindJson("17-deployment/deployment-verification.json", (document) => { document.servedBuildDocumentBinding.bytes += 1; });
  assert.throws(() => auditPackageBytes(crossBinding), /served-build authority differs from deployment verification binding|payload ledger differs from served index\.html binding/i);

  const mutateRuntimeLedger = (document) => {
    const row = document.payloadLedger.find(({ relativePath }) => relativePath === "_astro/app.css");
    row.sha256 = "f".repeat(64);
    row.immutable.sha256 = row.sha256;
    row.branch.sha256 = row.sha256;
  };
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "17-deployment/deployment-verification.json", mutateRuntimeLedger)),
    /served-build runtime asset differs from deployment ledger: \/_astro\/app\.css/i,
  );
  const reboundRuntime = cryptographicallyRebindJson("17-deployment/deployment-verification.json", mutateRuntimeLedger);
  assert.throws(() => auditPackageBytes(reboundRuntime), /served-build runtime asset differs from deployment ledger: \/_astro\/app\.css/i);
});

test("served-build cleanliness and runtime inventories fail closed in the packager and rebound audit", () => {
  const authorityMutations = [
    [(document) => { document.repository.worktreeClean = false; }, /repository ancestry\/cleanliness authority differs/i],
    [(document) => { document.repository.worktreeStatus = [" M src/pages/index.astro"]; }, /repository ancestry\/cleanliness authority differs/i],
    [(document) => { document.repository.buildReceipt.worktreeCleanAfter = false; }, /governed build receipt differs/i],
    [(document) => { document.repository.buildReceipt.worktreeStatusAfter = [" M dist/index.html"]; }, /governed build receipt differs/i],
    [(document) => { document.runtimeAssets.after.localDist.pop(); }, /served R1 runtime asset inventory differs/i],
    [(document) => { document.runtimeAssets.after.localDist[1] = { ...document.runtimeAssets.after.localDist[0] }; }, /duplicate runtime asset/i],
    [(document) => { document.runtimeAssets.after.served[0].bytes += 1; }, /served R1 runtime asset differs/i],
  ];
  for (const [mutate, expected] of authorityMutations) {
    assert.throws(() => buildReviewArtifacts(mutateJson(fixtureEntries, SERVED_BUILD_AUTHORITY_PATH, mutate)), expected);
    assert.throws(() => auditPackageBytes(cryptographicallyRebindJson(SERVED_BUILD_AUTHORITY_PATH, mutate)), expected);
  }

  const installedChromePath = "09-chrome-200/installed-chrome-200-percent-report.json";
  const portableMutations = [
    [(document) => { document.servedBuild.runtimeAssets.pop(); }, /portable runtime asset.*inventory differs/i],
    [(document) => { document.servedBuild.runtimeAssets[1] = { ...document.servedBuild.runtimeAssets[0] }; }, /portable runtime asset.*duplicate runtime asset/i],
    [(document) => { document.servedBuild.runtimeAssets[0].sha256 = "f".repeat(64); }, /portable runtime asset differs/i],
  ];
  for (const [mutate, expected] of portableMutations) {
    assert.throws(() => buildReviewArtifacts(mutateJson(fixtureEntries, installedChromePath, mutate)), expected);
    assert.throws(() => auditPackageBytes(cryptographicallyRebindJson(installedChromePath, mutate)), expected);
  }
});

test("served-build runtime inventories compare as duplicate-free keyed sets", () => {
  let reordered = mutateJson(fixtureEntries, SERVED_BUILD_AUTHORITY_PATH, (document) => {
    document.runtimeAssets.before.served.reverse();
    document.runtimeAssets.after.localDist.reverse();
    document.runtimeAssets.after.served.reverse();
  });
  reordered = mutateJson(reordered, "09-chrome-200/installed-chrome-200-percent-report.json", (document) => { document.servedBuild.runtimeAssets.reverse(); });
  reordered = mutateJson(reordered, "13-performance/performance-and-lifecycle-report.json", (document) => { document.servedBuildAuthority.runtimeAssets.reverse(); });
  reordered = mutateJson(reordered, "11-accessibility/accessibility-report.json", (document) => {
    document.qaServedBuildAuthorities.forEach(({ servedBuild }) => servedBuild.runtimeAssets.reverse());
  });
  const reorderedArtifacts = buildReviewArtifacts(reordered);
  assert.equal(auditPackageBytes({ archiveBytes: reorderedArtifacts.archiveBytes, detachedBytes: reorderedArtifacts.detachedBytes }).status, "PASS");
});

test("Firefox first-paint accepts only exact evidenced PASS or bounded LIMITATION in package and independent audit", () => {
  const limitationEntries = mutateJson(fixtureEntries, "10-firefox/firefox-first-paint-report.json", (document) => Object.assign(document, firefoxFirstPaint("LIMITATION")));
  const limitationArtifacts = buildReviewArtifacts(limitationEntries);
  assert.equal(auditPackageBytes({ archiveBytes: limitationArtifacts.archiveBytes, detachedBytes: limitationArtifacts.detachedBytes }).status, "PASS");

  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "10-firefox/firefox-first-paint-report.json", (document) => { document.navigationStart.pixels.nearWhitePixelRatio = 0.99; })),
    /PASS contradicts the navigation-start pixels/i,
  );
  assert.throws(
    () => buildReviewArtifacts(mutateJson(limitationEntries, "10-firefox/firefox-first-paint-report.json", (document) => { document.classification = "production-page-paint-defect-reproduced"; })),
    /LIMITATION classification differs/i,
  );
  const rebound = cryptographicallyRebindJson("10-firefox/firefox-first-paint-report.json", (document) => {
    document.status = "LIMITATION";
    document.classification = "production-page-paint-defect-reproduced";
    document.navigationStart.pixels.nearWhitePixelRatio = 0.99;
  });
  assert.throws(() => auditPackageBytes(rebound), /LIMITATION classification differs/i);

  const reorderTiming = (document) => {
    [document.timing.captureOrder[2], document.timing.captureOrder[3]] = [document.timing.captureOrder[3], document.timing.captureOrder[2]];
  };
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "10-firefox/firefox-first-paint-report.json", reorderTiming)),
    /not captured before response-body inspection/i,
  );
  const reboundOrder = cryptographicallyRebindJson("10-firefox/firefox-first-paint-report.json", reorderTiming);
  assert.throws(() => auditPackageBytes(reboundOrder), /not captured before response-body inspection/i);
});

test("portable capture provenance, semantic states, Field Map order, and visible Chrome UI survive independent tamper attacks", () => {
  const staleQa = (document) => {
    const receipt = document.qaServedBuildAuthorities[0].servedBuild;
    receipt.revision = DIRECT_PARENT;
    receipt.freshBuild.headBefore = DIRECT_PARENT;
    receipt.freshBuild.headAfter = DIRECT_PARENT;
    document.qaServedBuildAuthorities[0].sourceAuthority.revision = DIRECT_PARENT;
    document.fullMatrices[0].sourceAuthority.revision = DIRECT_PARENT;
  };
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "11-accessibility/accessibility-report.json", staleQa)),
    /chromium QA portable served-build branch\/HEAD differs/i,
  );
  assert.throws(
    () => auditPackageBytes(cryptographicallyRebindJson("11-accessibility/accessibility-report.json", staleQa)),
    /chromium QA portable served-build branch\/HEAD differs/i,
  );

  const staleChrome = (document) => {
    document.servedBuild.revision = DIRECT_PARENT;
    document.servedBuild.freshBuild.headBefore = DIRECT_PARENT;
    document.servedBuild.freshBuild.headAfter = DIRECT_PARENT;
    for (const source of [document.sourceAuthority, ...document.routes.map(({ sourceAuthority }) => sourceAuthority), ...document.visualEvidence.map(({ sourceAuthority }) => sourceAuthority), document.fieldMap.sourceAuthority]) source.revision = DIRECT_PARENT;
  };
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "09-chrome-200/installed-chrome-200-percent-report.json", staleChrome)),
    /installed Chrome portable served-build branch\/HEAD differs/i,
  );
  assert.throws(
    () => auditPackageBytes(cryptographicallyRebindJson("09-chrome-200/installed-chrome-200-percent-report.json", staleChrome)),
    /installed Chrome portable served-build branch\/HEAD differs/i,
  );

  const falseScenario = (document) => {
    const record = document.scenarioRecordings.find(({ scenario }) => scenario === "complete-threshold-entry");
    record.stateAuthority[record.scenario].latePhysical.scrollY = 0;
    record.stateAuthoritySha256 = sha256(Buffer.from(stableJson(record.stateAuthority), "utf8"));
  };
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "13-performance/performance-and-lifecycle-report.json", falseScenario)),
    /did not traverse the late physical opening/i,
  );
  assert.throws(
    () => auditPackageBytes(cryptographicallyRebindJson("13-performance/performance-and-lifecycle-report.json", falseScenario)),
    /did not traverse the late physical opening/i,
  );

  const zeroBasedFocus = (document) => { document.focusSequence[0].step = 0; };
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "07-field-map/semantic-isolation-report.json", zeroBasedFocus)),
    /keyboard focus sequence differs/i,
  );
  assert.throws(
    () => auditPackageBytes(cryptographicallyRebindJson("07-field-map/semantic-isolation-report.json", zeroBasedFocus)),
    /keyboard focus sequence differs/i,
  );

  const mismatchedZoomLabel = (document) => { document.visibleBrowserZoomConfirmation.visibleZoomObservation.observedLabel = "Zoom: 200%"; };
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "09-chrome-200/installed-chrome-200-percent-report.json", mismatchedZoomLabel)),
    /visible 200% observation differs/i,
  );
  assert.throws(
    () => auditPackageBytes(cryptographicallyRebindJson("09-chrome-200/installed-chrome-200-percent-report.json", mismatchedZoomLabel)),
    /visible 200% observation differs/i,
  );
});

test("the exact eighteen MP4 paths are mandatory and cryptographically bound to both recording inventories", async () => {
  const omittedPath = REQUIRED_RECORDING_PATHS[0];
  assert.throws(
    () => buildReviewArtifacts(clone(fixtureEntries).filter(({ relativePath }) => relativePath !== omittedPath)),
    /exactly the 18 governed MP4 recording paths/i,
  );
  const extra = clone(fixtureEntries);
  extra.push({ relativePath: "19-recordings/chromium-substituted.mp4", data: Buffer.from(RECORDING_BYTES) });
  assert.throws(() => buildReviewArtifacts(extra), /exactly the 18 governed MP4 recording paths/i);
  assert.throws(
    () => buildReviewArtifacts(mutateJson(fixtureEntries, "13-performance/performance-and-lifecycle-report.json", (document) => { document.scenarioRecordings[0].sha256 = "0".repeat(64); })),
    /scenario recording bytes\/hash binding differs/i,
  );

  const omitted = cryptographicallyRebind(omittedPath, () => null);
  assert.throws(() => auditPackageBytes(omitted), /exactly the 18 governed MP4 recording paths/i);
  const altered = cryptographicallyRebind(omittedPath, (bytes) => Buffer.concat([bytes, mp4Box("free")])) ;
  assert.throws(() => auditPackageBytes(altered), /scenario recording bytes\/hash binding differs/i);
  await assert.rejects(
    () => auditReviewBytes({
      archiveBytes: artifacts.archiveBytes,
      detachedBytes: artifacts.detachedBytes,
      recordingDecoder: async ({ relativePath }) => relativePath === REQUIRED_RECORDING_PATHS[0] ? false : true,
    }),
    /supplied MP4 full decoder rejected/i,
  );
});

test("media signatures fail closed before the package can claim decode coverage", () => {
  const malformedRaster = clone(fixtureEntries);
  malformedRaster.find(({ relativePath }) => relativePath.endsWith(".png")).data = Buffer.from("not a png");
  assert.throws(() => buildReviewArtifacts(malformedRaster), /raster signature/i);

  const malformedMp4 = clone(fixtureEntries);
  malformedMp4.find(({ relativePath }) => relativePath === REQUIRED_RECORDING_PATHS[0]).data = Buffer.from("not an mp4");
  assert.throws(() => buildReviewArtifacts(malformedMp4), /recording is too small|ISO-BMFF/i);
});

test("the independent R1 auditor does not import the new R1 assembler", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "audit-phase7a-r1-review.mjs"), "utf8");
  assert.doesNotMatch(source, /from\s+["']\.\/package-phase7a-r1-review\.mjs["']/);
  assert.match(source, /parseStoredZip/);
  assert.match(source, /\.raw\(\)\s*\.toBuffer/);
  assert.match(source, /-f", "null"/);
  assert.ok(parseStoredZip(artifacts.archiveBytes).entries.has(IN_ARCHIVE_MANIFEST));
});
