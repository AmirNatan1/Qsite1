import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const errors = [];

const files = Object.freeze({
  contract: "artifacts/original/phase-0-4-crt-television/crt-portal-layout.json",
  plan: "prototypes/phase-0-4-crt-portal-qa/capture-plan.json",
  redirect: "docs/planning/PHASE_0_4_CRT_TELEVISION_REDIRECT.md",
  typography: "docs/planning/CRT_PORTAL_AND_TYPOGRAPHY_CONTRACT.md",
  evidence: "artifacts/evidence/phase-0-4-crt-television/TYPOGRAPHY_COLLISION_QA.md",
  evidenceReadme: "artifacts/evidence/phase-0-4-crt-television/README.md",
  prototypeReadme: "prototypes/phase-0-4-crt-portal-qa/README.md",
  prototypeIndex: "prototypes/phase-0-4-crt-portal-qa/index.html",
  prototypeStyles: "prototypes/phase-0-4-crt-portal-qa/styles.css",
  prototypeApp: "prototypes/phase-0-4-crt-portal-qa/app.js",
  runnerHtml: "prototypes/phase-0-4-crt-portal-qa/runner.html",
  runnerStyles: "prototypes/phase-0-4-crt-portal-qa/runner.css",
  runnerApp: "prototypes/phase-0-4-crt-portal-qa/runner.js",
  prototypeServer: "scripts/serve-prototype.mjs",
  captureRunner: "scripts/capture-phase04-browser-matrix.mjs",
  normalizer: "scripts/normalize-phase04-captures.py",
  finalizer: "scripts/finalize-phase04-browser-evidence.mjs",
  packageJson: "package.json",
  historicalV2: "artifacts/original/phase-0-3d-repair-v2/portal-layout.json",
  historicalV3: "artifacts/original/phase-0-3d-repair-v3/portal-layout.json",
  finalMatrix: "artifacts/evidence/phase-0-4-crt-television/browser-matrix-report.json",
  checkpoint: "artifacts/evidence/phase-0-4-crt-television/capture-checkpoint.json",
  capturePlanSnapshot: "artifacts/evidence/phase-0-4-crt-television/capture-plan-authority.json",
  browserEvidence: "artifacts/evidence/phase-0-4-crt-television/browser-evidence-manifest.json",
  canonicalRenderManifest: "artifacts/original/phase-0-4-crt-television/manifests/crt-canonical-render-manifest.json",
  powerStateManifest: "artifacts/original/phase-0-4-crt-television/manifests/crt-power-on-state-authority.json",
  portalStateManifest: "artifacts/original/phase-0-4-crt-television/manifests/crt-portal-transition-state-authority.json",
  creativeReviewComposition: "artifacts/original/phase-0-4-crt-television/manifests/crt-review-composition-manifest.json",
  materialManifest: "artifacts/original/phase-0-4-crt-television/manifests/crt-material-and-asset-manifest.json",
  browserReviewComposition: "artifacts/original/phase-0-4-crt-television/manifests/browser-review-composition-manifest.json",
});

const expectedHistoricalPortalHash = "25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5";
const expectedKeepoutLayoutAuthorityPath = "crt-portal-layout.json";
const postBezelTakeoverSourceId = "source-text-free-portal-takeover";
const postBezelGeometryIds = ["crt-cabinet", "crt-screen", "spiral-cable"];
const expectedPowerStateIds = [
  "power-01-completely-dormant",
  "power-02-current-reaches-connection",
  "power-03-power-indicator-response",
  "power-04-crt-electrical-wake",
  "power-05-raster-phosphor-appears",
  "power-06-quantum-interface-stabilizes",
  "power-07-portal-ready",
];
const expectedPortalStateIds = [
  "portal-01-television-in-scene",
  "portal-02-screen-active",
  "portal-03-close-approach",
  "portal-04-glass-almost-fills",
  "portal-05-bezel-exits",
  "portal-06-distortion-reduces",
  "portal-07-dom-takes-ownership",
  "portal-08-full-semantic-surface",
];

function absolute(relative) {
  return path.join(root, ...relative.split("/"));
}

async function exists(relative) {
  try {
    await access(absolute(relative));
    return true;
  } catch {
    return false;
  }
}

async function text(relative) {
  try {
    return await readFile(absolute(relative), "utf8");
  } catch (error) {
    errors.push(`cannot read ${relative}: ${error.message}`);
    return "";
  }
}

async function json(relative) {
  const source = await text(relative);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch (error) {
    errors.push(`invalid JSON in ${relative}: ${error.message}`);
    return null;
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

function isFourByThree(box) {
  return Number(box?.width) > 0 && Number(box?.height) > 0 && Number(box.width) * 3 === Number(box.height) * 4;
}

function isInside(inner, outer) {
  return (
    Number(inner?.x) >= Number(outer?.x) &&
    Number(inner?.y) >= Number(outer?.y) &&
    Number(inner?.x) + Number(inner?.width) <= Number(outer?.x) + Number(outer?.width) &&
    Number(inner?.y) + Number(inner?.height) <= Number(outer?.y) + Number(outer?.height)
  );
}

function expandCases(plan) {
  if (!plan) return [];
  const viewports = new Map((plan.viewports ?? []).map((viewport) => [viewport.id, viewport]));
  const allIds = [...viewports.keys()];
  const cases = [];
  for (const template of plan.caseTemplates ?? []) {
    const viewportIds = template.viewportIds === "all" ? allIds : template.viewportIds ?? [];
    const captureIds = template.captureViewportIds === "all" ? new Set(allIds) : new Set(template.captureViewportIds ?? []);
    for (const viewportId of viewportIds) {
      const viewport = viewports.get(viewportId);
      if (!viewport) {
        errors.push(`case template ${template.idPrefix} names unknown viewport ${viewportId}`);
        continue;
      }
      cases.push({
        id: `${template.idPrefix}--${viewportId}`,
        idPrefix: template.idPrefix,
        viewportId,
        viewport,
        query: template.query,
        focusSelector: template.focusSelector ?? null,
        captureRequired: captureIds.has(viewportId),
      });
    }
  }
  return cases;
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pngDimensions(buffer) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buffer.length < 24 || signature.some((value, index) => buffer[index] !== value)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function verifyFileRecord(record, expectedPath, label, { png = false } = {}) {
  check(record?.path === expectedPath, `${label} points to ${record?.path ?? "nothing"} instead of ${expectedPath}`);
  if (!(await exists(expectedPath))) {
    errors.push(`${label} is missing: ${expectedPath}`);
    return null;
  }
  const bytes = await readFile(absolute(expectedPath));
  check(record?.bytes === bytes.length, `${label} byte count mismatch`);
  check(record?.sha256 === sha256(bytes), `${label} SHA-256 mismatch`);
  if (png) {
    const dimensions = pngDimensions(bytes);
    check(Boolean(dimensions), `${label} is not a PNG`);
    check(record?.width === dimensions?.width && record?.height === dimensions?.height, `${label} PNG dimensions mismatch`);
  }
  return { bytes, sha256: sha256(bytes) };
}

function keepoutRecordMap(authority) {
  if (Array.isArray(authority?.records)) return new Map(authority.records.map((record) => [record.id, record]));
  if (authority?.records && typeof authority.records === "object") {
    return new Map(Object.entries(authority.records).map(([id, record]) => [id, { id, ...record }]));
  }
  return new Map();
}

function keepoutSource(record, id) {
  const source = record?.source ?? record ?? {};
  return {
    id: source.id ?? record?.id ?? id,
    role: record?.sourceRole ?? source.role ?? id,
    path: source.path ?? record?.path,
    bytes: Number(source.bytes ?? record?.bytes),
    sha256: source.sha256 ?? record?.sha256,
    width: Number(source.width ?? record?.width),
    height: Number(source.height ?? record?.height),
  };
}

function geometryPolygons(geometry) {
  let value = geometry?.normalizedPolygons ?? geometry?.normalized_polygons ?? geometry?.normalizedPolygon ?? geometry?.normalized_polygon;
  if (!Array.isArray(value) || value.length === 0) return [];
  const first = value[0];
  const firstLooksLikePoint =
    (Array.isArray(first) && typeof first[0] === "number") ||
    (first && typeof first === "object" && !Array.isArray(first) && "x" in first);
  if (firstLooksLikePoint) value = [value];
  return value.map((polygon) => polygon.map((point) => ({
    x: Number(Array.isArray(point) ? point[0] : point?.x),
    y: Number(Array.isArray(point) ? point[1] : point?.y),
  })));
}

function cableSegments(geometry) {
  const value =
    geometry?.normalizedSegmentRectangles ??
    geometry?.normalized_segment_rectangles ??
    geometry?.segmentRectanglesNormalized ??
    geometry?.segment_rectangles_normalized;
  if (!Array.isArray(value)) return [];
  return value.map((segment) => ({
    x: Number(segment?.x ?? segment?.[0]),
    y: Number(segment?.y ?? segment?.[1]),
    width: Number(segment?.width ?? segment?.[2]),
    height: Number(segment?.height ?? segment?.[3]),
  }));
}

function normalizedPolygonsAreValid(polygons) {
  return polygons.length > 0 && polygons.every((polygon) =>
    polygon.length >= 3 && polygon.every((point) =>
      Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
}

function normalizedSegmentsAreValid(segments) {
  return segments.length > 0 && segments.every((segment) =>
    Number.isFinite(segment.x) && Number.isFinite(segment.y) &&
    Number.isFinite(segment.width) && Number.isFinite(segment.height) &&
    segment.x >= 0 && segment.y >= 0 && segment.width > 0 && segment.height > 0 &&
    segment.x + segment.width <= 1.000001 && segment.y + segment.height <= 1.000001);
}

function hiddenGeometryIsExplicit(geometry, geometryId) {
  const bounds = geometry?.pixelBounds ?? geometry?.pixel_bounds;
  const paddedBounds = geometry?.paddedBoundsPx ?? geometry?.padded_bounds_px;
  const projectedPointCount = geometry?.projectedPointCount ?? geometry?.projected_point_count;
  const visiblePointCount = geometry?.visiblePointCount ?? geometry?.visible_point_count;
  const projection = geometryId === "spiral-cable" ? cableSegments(geometry) : geometryPolygons(geometry);
  return (
    geometry?.visible === false &&
    geometry?.visibility === "out-of-frame/no-visible-geometry" &&
    bounds == null &&
    paddedBounds == null &&
    Number(projectedPointCount) === 0 &&
    Number(visiblePointCount) === 0 &&
    projection.length === 0
  );
}

const completionOnlyFiles = new Set(["finalMatrix", "checkpoint", "capturePlanSnapshot", "browserEvidence", "materialManifest", "browserReviewComposition"]);
for (const [label, relative] of Object.entries(files)) {
  if (completionOnlyFiles.has(label)) continue;
  check(await exists(relative), `required Phase 0.4 scaffold file is missing: ${relative}`);
}

for (const relative of [files.historicalV2, files.historicalV3]) {
  if (await exists(relative)) {
    const digest = sha256(await readFile(absolute(relative)));
    check(digest === expectedHistoricalPortalHash, `historical portal authority changed: ${relative} has ${digest}`);
  }
}

const contract = await json(files.contract);
const plan = await json(files.plan);
const postBezelPolicy = plan.sceneFreeze?.keepoutApplicability?.postBezelSemanticTakeover;
const redirect = await text(files.redirect);
const typography = await text(files.typography);
const evidence = await text(files.evidence);
const evidenceReadme = await text(files.evidenceReadme);
const prototypeReadme = await text(files.prototypeReadme);
const prototypeIndex = await text(files.prototypeIndex);
const prototypeStyles = await text(files.prototypeStyles);
const prototypeApp = await text(files.prototypeApp);
const runnerHtml = await text(files.runnerHtml);
const runnerStyles = await text(files.runnerStyles);
const runnerApp = await text(files.runnerApp);
const prototypeServer = await text(files.prototypeServer);
const captureRunner = await text(files.captureRunner);
const normalizer = await text(files.normalizer);
const finalizer = await text(files.finalizer);
const packageJson = await text(files.packageJson);
const freezePending =
  plan?.sceneFreeze?.status === "pending-creative-crt-freeze" &&
  plan?.sceneFreeze?.matrixStatus === "pending-scene-freeze" &&
  plan?.sceneFreeze?.captureAllowed === false;
const freezeCaptureReady =
  plan?.sceneFreeze?.status === "frozen" &&
  plan?.sceneFreeze?.matrixStatus === "ready-for-capture" &&
  plan?.sceneFreeze?.captureAllowed === true;
const freezeComplete =
  plan?.sceneFreeze?.status === "frozen" &&
  plan?.sceneFreeze?.matrixStatus === "complete" &&
  plan?.sceneFreeze?.captureAllowed === true;
const freezeReleased = freezeCaptureReady || freezeComplete;
check(freezePending || freezeReleased, "Phase 0.4 scene-freeze state is neither pending, capture-ready nor complete");

if (contract) {
  check(contract.schema === "quantum-hub.phase-0-4-crt-television.crt-portal-layout.v1", "unexpected CRT portal-layout schema");
  if (freezePending) {
    check(/capture blocked pending frozen CRT scene authorities/i.test(contract.status ?? ""), "scaffold contract does not disclose the creative-freeze capture hold");
  }
  check(contract.historicalBoundary?.acceptedPortalAuthority?.path === files.historicalV2, "CRT contract does not point to the accepted historical portal authority");
  check(contract.historicalBoundary?.acceptedPortalAuthority?.sha256 === expectedHistoricalPortalHash, "CRT contract binds the wrong historical portal SHA-256");
  check(contract.historicalBoundary?.apertureStationStatus === "superseded by direct human creative decision", "Aperture Station supersession status is missing");
  check(/new object modelled from scratch/i.test(contract.historicalBoundary?.reusePolicy ?? ""), "new-object/no-reuse boundary is missing");

  const reference = contract.privateReference ?? {};
  check(reference.reference === "user-supplied CRT television photograph", "private reference is not described opaquely");
  check(reference.repositoryStatus === "intentionally uncommitted" && reference.publicUse === false && reference.textureUse === false, "private reference boundary is incomplete");
  check(reference.externalBlenderDependencyAllowed === false, "private reference may remain as an external Blender dependency");

  const camera = contract.coordinateSystems?.physicalCameraFrame;
  const physicalLocal = contract.coordinateSystems?.physicalScreenLocal;
  const dom = contract.coordinateSystems?.semanticDomReference;
  check(camera?.width === 1920 && camera?.height === 1200 && camera?.aspectRatio === "16:10", "physical camera reference is not 1920x1200 16:10");
  check(physicalLocal?.width === 1600 && physicalLocal?.height === 1200 && physicalLocal?.aspectRatio === "4:3", "physical local screen is not 1600x1200 4:3");
  check(isFourByThree(physicalLocal), "physical local screen dimensions are not exactly 4:3");
  check(dom?.width === 1920 && dom?.height === 1200, "semantic DOM reference is not 1920x1200");

  const glass = contract.physicalScreen?.screenGlassBoundsInCameraFrame;
  const raster = contract.physicalScreen?.activeRasterBoundsInCameraFrame;
  const cameraBounds = { x: 0, y: 0, width: camera?.width, height: camera?.height };
  check(isFourByThree(glass), "physical CRT glass bounds are not exactly 4:3");
  check(isFourByThree(raster), "physical active raster bounds are not exactly 4:3");
  check(isInside(glass, cameraBounds), "physical CRT glass leaves the reference camera frame");
  check(isInside(raster, glass), "active raster is not contained by the physical CRT glass");
  check(contract.physicalScreen?.offState?.powered === false && contract.physicalScreen?.offState?.emission === false, "dormant CRT is not fully off");
  check(contract.physicalScreen?.offState?.environmentalMagenta === false, "dormant scene permits environmental magenta");
  check((contract.physicalScreen?.effectsOwnership?.physicalOnly ?? []).includes("scanlines"), "physical-only CRT effects omit scanlines");
  check(/none of the physical CRT distortion effects/i.test(contract.physicalScreen?.effectsOwnership?.semanticDom ?? ""), "live semantic text is not protected from CRT distortion");

  const physicalCopy = contract.copyOwnership?.physicalScreen;
  const semanticCopy = contract.copyOwnership?.semanticDom;
  check(physicalCopy?.brand === "QUANTUM HUB", "physical CRT brand copy changed");
  check(valuesEqual(physicalCopy?.route, ["FRAME", "SOURCE", "ASSESS", "TEST", "DECIDE"]), "physical CRT route changed");
  check(physicalCopy?.approvedStatus === "TEST ROUTE AVAILABLE" && physicalCopy?.approvedStatusCount === 1, "physical CRT must use exactly one approved status phrase");
  check(physicalCopy?.headingProhibited === "WHERE DO YOU ENTER?", "full semantic H1 is not prohibited on the physical screen");
  check(semanticCopy?.heading === "WHERE DO YOU ENTER?", "semantic portal H1 changed");
  check(valuesEqual(semanticCopy?.route, ["Frame", "Source", "Assess", "Test", "Decide"]), "semantic route changed");
  check(valuesEqual(semanticCopy?.audiences, ["For industry", "For startups"]), "semantic audience labels changed");
  check(/never sit behind identical live DOM copy/i.test(contract.copyOwnership?.handoffRule ?? ""), "no-doubled-copy rule is missing");

  const physicalLayout = contract.physicalScreenLayout ?? {};
  check(isInside(physicalLayout.brandBounds, { x: 0, y: 0, width: physicalLocal?.width, height: physicalLocal?.height }), "physical brand bounds leave the 4:3 design surface");
  check(isInside(physicalLayout.routeRegion, { x: 0, y: 0, width: physicalLocal?.width, height: physicalLocal?.height }), "physical route bounds leave the 4:3 design surface");
  check(isInside(physicalLayout.statusBounds, { x: 0, y: 0, width: physicalLocal?.width, height: physicalLocal?.height }), "physical status bounds leave the 4:3 design surface");
  check((physicalLayout.routeRegion?.itemStarts ?? []).length === 5, "physical route does not define five item starts");

  const accepted = await json(files.historicalV2);
  const anchors = contract.semanticDomLayout?.anchors ?? {};
  const acceptedAnchors = accepted?.anchors ?? {};
  check(valuesEqual(anchors.navigationBaseline, acceptedAnchors.navBaseline), "semantic navigation anchor diverges from accepted authority");
  check(valuesEqual(anchors.signalLineBaseline, acceptedAnchors.signalLineBaseline), "semantic signal-line anchor diverges from accepted authority");
  check(valuesEqual(anchors.eyebrowBaseline, acceptedAnchors.eyebrowBaseline), "semantic eyebrow anchor diverges from accepted authority");
  check(valuesEqual(anchors.headingTopLeft, acceptedAnchors.h1TopLeft), "semantic H1 origin diverges from accepted authority");
  check(valuesEqual(anchors.headingLine1Baseline, acceptedAnchors.h1Line1Baseline), "semantic H1 baseline diverges from accepted authority");
  check(valuesEqual(anchors.routeBaseline, acceptedAnchors.routeBaseline), "semantic route anchor diverges from accepted authority");
  check(valuesEqual(anchors.audienceRegionTopLeft, acceptedAnchors.audienceRegionTopLeft), "semantic audience origin diverges from accepted authority");
  check(valuesEqual(anchors.audienceDividerTop, acceptedAnchors.audienceDividerTop), "semantic divider top diverges from accepted authority");
  check(valuesEqual(anchors.audienceDividerBottom, acceptedAnchors.audienceDividerBottom), "semantic divider bottom diverges from accepted authority");
  check(valuesEqual(anchors.audienceIndustryBaseline, acceptedAnchors.audienceIndustryBaseline), "industry anchor diverges from accepted authority");
  check(valuesEqual(anchors.audienceStartupsBaseline, acceptedAnchors.audienceStartupsBaseline), "startups anchor diverges from accepted authority");

  const regions = contract.semanticDomLayout?.regions ?? {};
  check(valuesEqual(regions.signalLine, { x: 120, y: 208, width: 420, height: 34 }), "semantic signal-line region changed or is missing");
  check(valuesEqual(regions.eyebrow, { x: 120, y: 278, width: 720, height: 32 }), "semantic eyebrow region changed or is missing");
  check(isInside(regions.heading, { x: 0, y: 0, width: dom?.width, height: dom?.height }), "semantic heading region leaves the DOM reference frame");
  check(isInside(regions.route, { x: 0, y: 0, width: dom?.width, height: dom?.height }), "semantic route region leaves the DOM reference frame");
  check(isInside(regions.audience, { x: 0, y: 0, width: dom?.width, height: dom?.height }), "semantic audience region leaves the DOM reference frame");

  check(contract.portalAlignment?.maximumAnchorDeltaPx === 3, "portal anchor tolerance must remain 3px");
  check(contract.portalAlignment?.glyphRuleClearancePx === 12, "glyph/rule clearance must remain 12px");
  const sharedMappings = contract.portalAlignment?.sharedAnchorMappings ?? [];
  check(valuesEqual(sharedMappings.map((mapping) => mapping.id), ["route-carrier-origin", "status-to-signal-origin"]), "physical-to-DOM shared anchor mappings changed");
  check(sharedMappings.every((mapping) => mapping.physical?.coordinateSystem === "physicalScreenLocal" && mapping.semantic?.coordinateSystem === "semanticDomReference"), "shared anchors do not identify both coordinate systems");
  check(contract.portalAlignment?.finalCameraCrop?.noPermanentLetterbox === true, "portal permits permanent letterboxing");
  check(contract.portalAlignment?.finalCameraCrop?.noAbruptAspectSnap === true, "portal permits an abrupt aspect snap");
  check(contract.portalAlignment?.finalCameraCrop?.noAdditionalGesture === true, "portal requires an additional gesture");

  const checkpoints = contract.aspectTransition?.checkpoints ?? [];
  check(checkpoints.length === 5, `expected five aspect-transition checkpoints, observed ${checkpoints.length}`);
  check(checkpoints[0]?.progress === 0 && checkpoints.at(-1)?.progress === 1, "aspect transition does not span progress 0 to 1");
  for (let index = 1; index < checkpoints.length; index += 1) {
    const previous = checkpoints[index - 1];
    const current = checkpoints[index];
    check(current.progress > previous.progress, `aspect-transition progress is not strictly increasing at checkpoint ${index}`);
    for (const property of ["cabinetVisibility", "physicalRasterOpacity", "curvatureStrength", "scanlineStrength"]) {
      check(Number(current[property]) <= Number(previous[property]), `${property} increases during portal entry at checkpoint ${index}`);
    }
    check(Number(current.semanticDomOpacity) >= Number(previous.semanticDomOpacity), `semantic DOM opacity decreases at checkpoint ${index}`);
  }
  const firstSemantic = checkpoints.find((checkpoint) => Number(checkpoint.semanticDomOpacity) > 0);
  check(firstSemantic?.physicalRasterOpacity === 0, "semantic DOM begins before the text-bearing physical raster is absent");
  check(checkpoints.at(-1)?.owner === "semantic-dom" && checkpoints.at(-1)?.cabinetVisibility === 0, "semantic DOM does not fully own the final checkpoint");
  check(/direct function of document progress/i.test(contract.aspectTransition?.reverseRule ?? ""), "reverse-scroll direct-progress rule is missing");

  const wholeWord = contract.wholeWordContract ?? {};
  check(wholeWord.css?.wordBreak === "normal", "word-break must be normal");
  check(wholeWord.css?.overflowWrap === "normal", "overflow-wrap must be normal");
  check(wholeWord.css?.hyphens === "none", "hyphens must be none");
  check(valuesEqual(wholeWord.protectedWords, ["WHERE", "DO", "YOU", "ENTER", "PROVE", "WORK"]), "protected whole-word list changed");
  check(wholeWord.fragmentationOffendersRequired === 0 && wholeWord.humanLineBreakReportRequired === true, "whole-word evidence requirements are incomplete");
  check(wholeWord.fixedHeightTextClippingAllowed === false, "fixed-height text clipping is allowed");

  const keepout = contract.keepoutContract ?? {};
  if (freezePending) check(keepout.status === "pending frozen creative scene projection", "keepout contract asserts a frozen authority prematurely");
  if (freezeReleased) check(keepout.status === "pending frozen creative scene projection", "immutable CRT layout contract no longer preserves its pre-freeze keepout boundary");
  check(keepout.expectedAuthority?.path === "artifacts/original/phase-0-4-crt-television/manifests/crt-scene-source-keepouts.json", "keepout authority path changed");
  check(keepout.expectedAuthority?.schema === "quantum-hub.phase-0-4-crt-television.scene-source-keepouts.v1", "keepout schema changed");
  if (freezePending) check(!Object.hasOwn(keepout.expectedAuthority ?? {}, "sha256"), "pending keepout authority invents a SHA-256");
  const keepoutIds = (keepout.requiredGeometry ?? []).map((record) => record.id);
  check(valuesEqual(keepoutIds, ["crt-cabinet", "crt-screen", "spiral-cable"]), "required CRT keepout roles changed");
  check(/segment rectangles/i.test(keepout.requiredGeometry?.find((record) => record.id === "spiral-cable")?.representation ?? ""), "spiral cable is not bound to segment geometry");
  check(keepout.minimumSemanticClearanceCssPx === 16, "semantic keepout clearance must be 16 CSS pixels");

  const reduced = contract.reducedMotion ?? {};
  check(reduced.loadsCinematicVideoOrFrames === false && reduced.televisionPowered === false && reduced.cableDormant === true, "reduced motion is not fully dormant/static");
  check(reduced.screenGlow === false && reduced.scanlineAnimation === false && reduced.cameraMovement === false, "reduced motion still permits CRT/camera animation");
  check(/directional scrim/i.test(reduced.composition ?? "") && /no large floating rounded glass panel/i.test(reduced.composition ?? ""), "reduced-motion quiet composition is missing");
  check(contract.accessibility?.minimumInteractiveTargetCssPx?.width === 44 && contract.accessibility?.minimumInteractiveTargetCssPx?.height === 44, "interactive target gate must be 44x44 CSS pixels");
  check(contract.accessibility?.focusOutlineMinimumCssPx === 2, "focus outline gate must be 2 CSS pixels");
  if (freezePending) check(contract.captureGate?.status === "blocked" && contract.captureGate?.captureBeforeFreezeAllowed === false, "contract allows final capture before creative freeze");
  if (freezeReleased) check(contract.captureGate?.status === "blocked" && contract.captureGate?.captureBeforeFreezeAllowed === false, "immutable CRT layout contract no longer preserves its original pre-freeze capture boundary");
}

const requiredViewports = new Map([
  ["desktop-1440x900", [1440, 900]],
  ["short-desktop-1366x650", [1366, 650]],
  ["desktop-1280x800", [1280, 800]],
  ["tablet-landscape-1024x768", [1024, 768]],
  ["tablet-portrait-768x1024", [768, 1024]],
  ["mobile-390x844", [390, 844]],
  ["mobile-360x800", [360, 800]],
  ["narrow-320x800", [320, 800]],
  ["mobile-landscape-844x390", [844, 390]],
]);

if (plan) {
  check(plan.schema === "quantum-hub.phase-0-4-crt-television.typography-capture-plan.v1", "unexpected Phase 0.4 capture-plan schema");
  check(plan.contractPath === files.contract, "capture plan does not bind the Phase 0.4 CRT contract");
  if (await exists(files.contract)) {
    const contractBytes = await readFile(absolute(files.contract));
    check(plan.contractAuthority?.path === files.contract, "capture plan contract-authority path changed");
    check(plan.contractAuthority?.bytes === contractBytes.length, "capture plan contract-authority byte count changed");
    check(plan.contractAuthority?.sha256 === sha256(contractBytes), "capture plan contract-authority SHA-256 changed");
  }
  if (freezePending) {
    check(!Object.hasOwn(plan.sceneFreeze ?? {}, "sources"), "pending scene-freeze plan invents source records");
    check(plan.harnessStatus === "executable scaffold preflight; final capture authority pending frozen CRT scene and keepout ledger", "pending plan misclassifies the executable scaffold");
  }
  if (freezeReleased) {
    check(/capture-authoritative|frozen/i.test(plan.harnessStatus ?? ""), "final plan does not identify a frozen capture-authoritative harness");
  }
  check(plan.browserApi?.expectedSchema === "quantum-hub.phase-0-4-crt-television.typography-collision-browser-report.v1", "capture plan expects the wrong browser schema");
  check(plan.browserApi?.expectedRunnerSchema === "quantum-hub.phase-0-4-crt-television.exact-viewport-runner-report.v1", "capture plan expects the wrong runner schema");
  check(plan.browserApi?.runnerReportDomSelector === "#phase04-runner-report" && plan.browserApi?.runnerChildReportProperty === "report", "capture plan does not define the repository-native DOM report bridge");
  check(plan.baseUrl?.startsWith("http://127.0.0.1:4173/"), "capture plan does not use the non-public local prototype host");

  const expectedSources = [
    ["source-desktop-dormant", "artifacts/original/phase-0-4-crt-television/renders/refined/sources/source-desktop-dormant.png", 1920, 1200],
    ["source-mobile-dormant", "artifacts/original/phase-0-4-crt-television/renders/refined/sources/source-mobile-dormant.png", 1080, 1800],
    ["source-reduced-desktop-dormant", "artifacts/original/phase-0-4-crt-television/renders/refined/sources/source-reduced-desktop-dormant.png", 1920, 1200],
    ["source-reduced-mobile-dormant", "artifacts/original/phase-0-4-crt-television/renders/refined/sources/source-reduced-mobile-dormant.png", 1080, 1800],
    ["source-physical-portal-close", "artifacts/original/phase-0-4-crt-television/renders/refined/sources/source-physical-portal-close.png", 1920, 1200],
    ["source-text-free-portal-takeover", "artifacts/original/phase-0-4-crt-television/renders/refined/sources/source-text-free-portal-takeover.png", 1920, 1200],
  ];
  check(valuesEqual(plan.sceneFreeze?.requiredFrozenSourceRoles, expectedSources.map(([id]) => id)), "six frozen source IDs changed");
  check(
    valuesEqual(
      (plan.sceneFreeze?.expectedSourceDescriptors ?? []).map((source) => [source.id, source.path, source.width, source.height]),
      expectedSources,
    ),
    "expected six-source path/dimension descriptors changed",
  );
  check(
    valuesEqual(plan.sceneFreeze?.requiredKeepoutAuthority?.requiredRecords, expectedSources.map(([id]) => id)),
    "keepout authority does not require the exact six source records",
  );
  check(
    plan.sceneFreeze?.requiredKeepoutAuthority?.layoutAuthority?.path === expectedKeepoutLayoutAuthorityPath &&
      plan.sceneFreeze?.requiredKeepoutAuthority?.layoutAuthority?.sha256 === plan.contractAuthority?.sha256,
    "keepout layout-authority path/SHA contract changed",
  );
  check(/sourceRole equals its exact source record ID/.test(plan.sceneFreeze?.requiredKeepoutAuthority?.sourceRolePolicy ?? ""), "keepout sourceRole identity policy is missing");

  if (freezeReleased) {
    const sources = plan.sceneFreeze?.sources ?? [];
    check(sources.length === 6, `frozen plan has ${sources.length}/6 scene sources`);
    for (const [id, expectedPath, width, height] of expectedSources) {
      const source = sources.find((record) => record.id === id);
      check(Boolean(source), `frozen source missing: ${id}`);
      check(source?.path === expectedPath && source?.width === width && source?.height === height, `frozen source descriptor mismatch: ${id}`);
      check(/^[a-f0-9]{64}$/i.test(source?.sha256 ?? "") && Number(source?.bytes) > 0, `frozen source lacks hash/bytes: ${id}`);
      if (source?.path && await exists(source.path)) {
        const bytes = await readFile(absolute(source.path));
        const dimensions = pngDimensions(bytes);
        check(bytes.length === Number(source.bytes) && sha256(bytes) === source.sha256, `frozen source bytes/hash mismatch: ${id}`);
        check(dimensions?.width === width && dimensions?.height === height, `frozen source PNG dimensions mismatch: ${id}`);
      } else if (source?.path) {
        errors.push(`frozen source is missing: ${source.path}`);
      }
    }

    const keepoutSpec = plan.sceneFreeze?.keepoutAuthority;
    check(keepoutSpec?.path === "artifacts/original/phase-0-4-crt-television/manifests/crt-scene-source-keepouts.json", "final keepout path changed");
    check(keepoutSpec?.schema === "quantum-hub.phase-0-4-crt-television.scene-source-keepouts.v1", "final keepout schema changed");
    check(/^[a-f0-9]{64}$/i.test(keepoutSpec?.sha256 ?? "") && Number(keepoutSpec?.bytes) > 0, "final keepout authority lacks hash/bytes");
    const postBezelSource = sources.find((record) => record.id === postBezelTakeoverSourceId);
    check(
      postBezelPolicy?.sourceId === postBezelTakeoverSourceId &&
      postBezelPolicy?.sourceSha256 === postBezelSource?.sha256 &&
      postBezelPolicy?.collisionRequired === false &&
      valuesEqual(postBezelPolicy?.geometryIds, postBezelGeometryIds) &&
      /post-bezel/i.test(postBezelPolicy?.reason ?? ""),
      "post-bezel hidden-geometry applicability policy is incomplete",
    );
    if (keepoutSpec?.path && await exists(keepoutSpec.path)) {
      const keepoutBytes = await readFile(absolute(keepoutSpec.path));
      check(keepoutBytes.length === Number(keepoutSpec.bytes) && sha256(keepoutBytes) === keepoutSpec.sha256, "final keepout authority bytes/hash mismatch");
      const keepoutAuthority = await json(keepoutSpec.path);
      check(keepoutAuthority?.schema === keepoutSpec.schema && keepoutAuthority?.status === "frozen" && keepoutAuthority?.sourceStatus === "accepted", "keepout authority is not frozen/accepted");
      check(valuesEqual(keepoutAuthority?.sourceRoles, expectedSources.map(([id]) => id)), "keepout sourceRoles differ from the exact six source IDs");
      check(Number(keepoutAuthority?.recordCount) === 6, "keepout recordCount must be exactly six");
      const records = keepoutRecordMap(keepoutAuthority);
      check(records.size === 6, `keepout authority has ${records.size}/6 records`);
      for (const [id, expectedPath, width, height] of expectedSources) {
        const source = sources.find((record) => record.id === id);
        const record = records.get(id);
        const meta = keepoutSource(record, id);
        const nestedSource = record?.source ?? {};
        const expectedPackagePath = expectedPath.replace(/^artifacts\/original\/phase-0-4-crt-television\//, "");
        check(Boolean(record), `keepout record missing: ${id}`);
        check(
          meta.id === id && meta.role === id && meta.path === expectedPath && nestedSource.packageRelativePath === expectedPackagePath && typeof nestedSource.role === "string" && nestedSource.role.length > 0 && meta.bytes === source?.bytes && meta.sha256 === source?.sha256 && meta.width === width && meta.height === height,
          `keepout source lineage mismatch: ${id}`,
        );
        const layout = record?.layoutAuthority ?? record?.layout_authority;
        check(layout?.path === expectedKeepoutLayoutAuthorityPath && layout?.bytes === plan.contractAuthority.bytes && layout?.sha256 === plan.contractAuthority.sha256 && layout?.schema === contract.schema, `keepout layout authority mismatch: ${id}`);
        check(typeof record?.roleLabel === "string" && record.roleLabel.length > 0 && typeof record?.camera === "string" && record.camera.length > 0 && typeof record?.cableVariant === "string" && record.cableVariant.length > 0, `keepout role/camera/cable metadata incomplete: ${id}`);
        const geometry = record?.geometry ?? {};
        const isPostBezelSource = id === postBezelTakeoverSourceId && meta.sha256 === postBezelPolicy?.sourceSha256;
        for (const geometryId of postBezelGeometryIds) {
          const item = geometry[geometryId];
          const bounds = item?.pixelBounds ?? item?.pixel_bounds;
          const paddedBounds = item?.paddedBoundsPx ?? item?.padded_bounds_px;
          const padding = item?.paddingPx ?? item?.padding_px ?? item?.padding;
          const lineage = item?.sourceObjectLineage ?? item?.sourceObjects ?? item?.source_objects;
          const sharedMetadataValid = Boolean(item) && padding != null && Array.isArray(lineage) && lineage.length > 0;
          const projectionValid = isPostBezelSource
            ? hiddenGeometryIsExplicit(item, geometryId)
            : item?.visible === true && Number(bounds?.width) > 0 && Number(bounds?.height) > 0 && Number(paddedBounds?.width) > 0 && Number(paddedBounds?.height) > 0;
          check(sharedMetadataValid && projectionValid, `keepout ${geometryId} visibility/metadata incomplete: ${id}`);
        }
        if (!isPostBezelSource) {
          check(normalizedPolygonsAreValid(geometryPolygons(geometry["crt-cabinet"])), `cabinet normalized polygon missing or invalid: ${id}`);
          check(normalizedPolygonsAreValid(geometryPolygons(geometry["crt-screen"])), `screen normalized polygon missing or invalid: ${id}`);
          check(normalizedSegmentsAreValid(cableSegments(geometry["spiral-cable"])), `cable segment rectangles missing or invalid: ${id}`);
        }
      }
    } else if (keepoutSpec?.path) {
      errors.push(`frozen keepout authority is missing: ${keepoutSpec.path}`);
    }
  }

  const observed = new Map((plan.viewports ?? []).map((viewport) => [viewport.id, [viewport.width, viewport.height]]));
  check(observed.size === requiredViewports.size, `capture plan must contain exactly ${requiredViewports.size} viewports`);
  for (const [id, dimensions] of requiredViewports) {
    check(valuesEqual(observed.get(id), dimensions), `capture plan omits or changes ${id}`);
    const viewport = (plan.viewports ?? []).find((entry) => entry.id === id);
    const expectedScale = Math.min(1, 1200 / dimensions[0]);
    check(Math.abs(Number(viewport?.captureScale) - expectedScale) <= 0.000001, `capture scale is incorrect for ${id}`);
  }

  const expanded = expandCases(plan);
  const captures = expanded.filter((record) => record.captureRequired);
  check(expanded.length === 46, `capture plan expands to ${expanded.length}/46 cases`);
  check(captures.length === 36, `capture plan selects ${captures.length}/36 visual captures`);
  check(plan.expectedCaseCount === 46 && plan.expectedCaptureCount === 36, "declared case/capture counts changed");
  check(new Set(expanded.map((record) => record.id)).size === expanded.length, "capture plan contains duplicate case IDs");

  const expectedPrefixCounts = new Map([
    ["hero-actual", 9],
    ["portal-actual", 9],
    ["hero-zoom-200", 5],
    ["portal-zoom-200", 5],
    ["hero-long-copy", 5],
    ["portal-long-copy", 5],
    ["hero-reduced-motion", 3],
    ["portal-reduced-motion", 3],
    ["hero-keyboard-focus", 1],
    ["portal-keyboard-focus", 1],
  ]);
  for (const [prefix, count] of expectedPrefixCounts) {
    check(expanded.filter((record) => record.idPrefix === prefix).length === count, `${prefix} case count changed`);
  }
  for (const viewportId of requiredViewports.keys()) {
    check(expanded.some((record) => record.id === `hero-actual--${viewportId}`), `hero actual case missing at ${viewportId}`);
    check(expanded.some((record) => record.id === `portal-actual--${viewportId}`), `portal actual case missing at ${viewportId}`);
  }
  const narrowPortalZoom = expanded.find((record) => record.id === "portal-zoom-200--narrow-320x800");
  check(Boolean(narrowPortalZoom), "320x800/200% portal case is missing");
  check(expanded.some((record) => record.id === "hero-reduced-motion--desktop-1440x900"), "reduced desktop hero case is missing");
  check(expanded.some((record) => record.id === "hero-reduced-motion--mobile-390x844"), "reduced authored-mobile hero case is missing");
  const fallbackCases = expanded.filter((record) => new URLSearchParams(record.query).get("font") === "fallback");
  check(fallbackCases.length === 10, `capture plan must exercise forced fallback in 10 cases, observed ${fallbackCases.length}`);
  check(fallbackCases.every((record) => record.idPrefix.endsWith("long-copy")), "forced fallback is not bound to both long-copy stress families");
  check(expanded.every((record) => ["normal", "fallback"].includes(new URLSearchParams(record.query).get("font"))), "one or more planned cases omit an explicit font mode");

  check(plan.capture?.stabilization?.method === "exact-byte-modal-winner", "capture plan omits exact-byte modal stabilization");
  check(plan.capture?.stabilization?.successiveFullPageJpegsPerVisualCase === 11, "capture plan must take 11 successive JPEGs per visual case");
  check(plan.capture?.stabilization?.minimumWinnerVotes === 7, "capture plan accepts a modal winner below 7/11");
  check(/none;/.test(plan.capture?.stabilization?.timingClaim ?? ""), "capture plan makes a timing-only raster-stability claim");

  const assertions = (plan.requiredAssertions ?? []).join("\n");
  for (const pattern of [
    /exactly 4:3/,
    /doubledCopyPass/,
    /wordFragmentationOffenders is exactly 0/,
    /cabinet, CRT screen and spiral-cable keepouts/,
    /44 by 44/,
    /200 percent text/,
    /directional scrim/,
    /approximately 2\.25 visible spiral turns/,
    /final capture is forbidden/,
  ]) {
    check(pattern.test(assertions), `capture plan omits required assertion ${pattern}`);
  }
  check(plan.finalMatrix?.path === files.finalMatrix, "capture plan points to the wrong final matrix path");
  if (freezePending) check(plan.finalMatrix?.status === "must not exist before creative scene freeze", "capture plan does not prohibit a pre-freeze matrix");
  if (freezeCaptureReady) check(/ready|authoritative/i.test(plan.finalMatrix?.status ?? ""), "capture-ready plan does not classify the matrix workflow as ready");
  if (freezeComplete) check(plan.finalMatrix?.status === "complete-local-authority-normalized", "complete plan does not classify the matrix as normalized and complete");
  const reviewSheets = plan.browserDerivedReviewSheets ?? [];
  const expectedReviewSheets = [
    [11, "crt-physical-dom-alignment-sheet.png"],
    [12, "crt-desktop-hero-composition.png"],
    [13, "crt-mobile-hero-composition.png"],
    [14, "crt-text-zoom-and-fallback.png"],
    [15, "crt-reduced-motion-desktop.png"],
    [16, "crt-reduced-motion-mobile.png"],
  ];
  check(valuesEqual(reviewSheets.map((sheet) => [sheet.reviewIndex, sheet.filename]), expectedReviewSheets), "browser-derived review sheets 11 through 16 changed");
  const plannedById = new Map(expanded.map((record) => [record.id, record]));
  for (const sheet of reviewSheets) {
    check(Array.isArray(sheet.sourceCaseIds) && sheet.sourceCaseIds.length >= 2, `review sheet lacks source cases: ${sheet.filename}`);
    for (const id of sheet.sourceCaseIds ?? []) {
      check(plannedById.get(id)?.captureRequired === true, `review sheet source is not a planned normalized capture: ${sheet.filename} -> ${id}`);
    }
  }
  check(/final normalized matrix SHA-256/.test(plan.reviewSheetLineagePolicy ?? "") && /path, dimensions, bytes and SHA-256/.test(plan.reviewSheetLineagePolicy ?? ""), "review-sheet lineage policy is incomplete");
  const finalization = plan.browserFinalization ?? {};
  check(finalization.captureAuthoritySnapshot?.path === files.capturePlanSnapshot && finalization.captureAuthoritySnapshot?.expectedSchema === plan.schema, "capture-plan snapshot workflow changed");
  check(finalization.browserEvidenceManifest?.path === files.browserEvidence && finalization.browserEvidenceManifest?.expectedSchema === "quantum-hub.phase-0-4-crt-television.browser-evidence.v1", "browser-evidence manifest workflow changed");
  check(finalization.browserReviewCompositionManifest?.path === files.browserReviewComposition && finalization.browserReviewCompositionManifest?.expectedSchema === "quantum-hub.phase-0-4-crt-television.browser-review-composition.v1", "browser-review composition workflow changed");
  check(finalization.creativeReviewCompositionManifest?.path === files.creativeReviewComposition && finalization.creativeReviewCompositionManifest?.expectedSchema === "quantum-hub.phase-0-4-crt-television.review-composition.v1", "creative review-composition workflow changed");
  check(finalization.canonicalRenderManifest?.path === files.canonicalRenderManifest && finalization.canonicalRenderManifest?.expectedSchema === "quantum-hub.phase-0-4-crt-television.canonical-still-render-inventory.v1", "canonical render workflow changed");
  check(finalization.powerOnStateAuthority?.path === files.powerStateManifest && finalization.powerOnStateAuthority?.expectedSchema === "quantum-hub.phase-0-4-crt-television.power-on-state-authority.v1", "power-on state-authority workflow changed");
  check(finalization.portalTransitionStateAuthority?.path === files.portalStateManifest && finalization.portalTransitionStateAuthority?.expectedSchema === "quantum-hub.phase-0-4-crt-television.portal-transition-state-authority.v1", "portal transition state-authority workflow changed");
  check(finalization.materialAndAssetManifest?.path === files.materialManifest && finalization.materialAndAssetManifest?.expectedSchema === "quantum-hub.phase-0-4-crt-television.material-and-asset.v1", "material/asset workflow changed");
  check(finalization.powerOnSheet?.reviewIndex === 9 && finalization.powerOnSheet?.filename === "crt-power-on-contact-sheet.png" && valuesEqual(finalization.powerOnSheet?.stateIds, expectedPowerStateIds), "exact seven-state power-on sheet lineage changed");
  check(finalization.portalTransitionSheet?.reviewIndex === 10 && finalization.portalTransitionSheet?.filename === "crt-portal-transition-sheet.png" && valuesEqual(finalization.portalTransitionSheet?.stateIds, expectedPortalStateIds), "exact eight-state portal sheet lineage changed");
  check(valuesEqual(finalization.portalTransitionSheet?.physicalStateIds, expectedPortalStateIds.slice(0, 6)), "physical portal state order changed");
  check(
    valuesEqual(
      (finalization.portalTransitionSheet?.semanticBrowserStates ?? []).map((state) => [state.id, state.caseId, state.sourceId, state.owner]),
      expectedPortalStateIds.slice(6).map((id) => [id, "portal-actual--desktop-1440x900", "source-text-free-portal-takeover", "repository browser semantic DOM"]),
    ),
    "semantic portal state 7/8 ownership or case/source lineage changed",
  );
  check(valuesEqual(finalization.browserDerivedSheetIndices, [11, 12, 13, 14, 15, 16]), "browser-derived sheet indices changed");
  check(/seven browser-governed sheets 10 through 16/.test(finalization.completionPolicy ?? "") && /material manifest/.test(finalization.completionPolicy ?? ""), "strict finalization policy is incomplete");
}

const matrixExists = await exists(files.finalMatrix);
if (freezePending) check(!matrixExists, "Phase 0.4 browser matrix exists before the CRT creative source freeze");
if (freezeComplete) check(matrixExists, "Phase 0.4 plan says complete but the browser matrix is missing");
if (matrixExists) {
  const matrix = await json(files.finalMatrix);
  check(freezeReleased, "Phase 0.4 browser matrix exists outside a frozen/released scene authority");
  check(matrix?.schema === "quantum-hub.phase-0-4-crt-television.typography-collision-matrix.v1", "Phase 0.4 browser matrix schema changed");
  if (plan) {
    const planBytes = await readFile(absolute(files.plan));
    let matrixPlanBytes = planBytes;
    if (freezeComplete) {
      check(await exists(files.capturePlanSnapshot), "complete plan lacks its byte-frozen ready-for-capture snapshot");
      if (await exists(files.capturePlanSnapshot)) {
        matrixPlanBytes = await readFile(absolute(files.capturePlanSnapshot));
        check(plan.captureAuthoritySnapshot?.path === files.capturePlanSnapshot, "complete plan points to the wrong capture-plan snapshot");
        check(plan.captureAuthoritySnapshot?.originalAuthorityPath === files.plan, "capture-plan snapshot omits its original authority path");
        check(plan.captureAuthoritySnapshot?.schema === plan.schema && plan.captureAuthoritySnapshot?.bytes === matrixPlanBytes.length && plan.captureAuthoritySnapshot?.sha256 === sha256(matrixPlanBytes), "capture-plan snapshot bytes/hash/schema mismatch");
      }
    }
    const contractBytes = await readFile(absolute(files.contract));
    check(matrix?.plan?.path === files.plan && matrix?.plan?.sha256 === sha256(matrixPlanBytes), "browser matrix does not bind the ready-for-capture plan authority");
    check(matrix?.contract?.path === files.contract && matrix?.contract?.sha256 === sha256(contractBytes), "browser matrix does not bind the current CRT portal contract");
    check(matrix?.keepout?.sha256 === plan.sceneFreeze?.keepoutAuthority?.sha256, "browser matrix does not bind the frozen keepout authority");
    check(valuesEqual((matrix?.sceneSources ?? []).map((source) => source.id), plan.sceneFreeze?.requiredFrozenSourceRoles), "browser matrix six-source order/identity changed");

    const planned = expandCases(plan);
    const plannedById = new Map(planned.map((record) => [record.id, record]));
    const cases = matrix?.cases ?? [];
    const casesById = new Map(cases.map((record) => [record.id, record]));
    check(cases.length === 46 && casesById.size === 46, `browser matrix has ${cases.length}/46 unique cases`);
    check(cases.filter((record) => record.capture != null).length === 36, "browser matrix does not contain exactly 36 visual cases");
    for (const plannedCase of planned) {
      const record = casesById.get(plannedCase.id);
      const report = record?.report;
      const query = new URLSearchParams(plannedCase.query);
      check(Boolean(record), `browser matrix case missing: ${plannedCase.id}`);
      if (!record) continue;
      check(record.runner?.pass === true && report?.pass === true, `browser matrix case failed: ${plannedCase.id}`);
      check(report?.authority?.mode === "final" && report?.authority?.captureEligible === true && report?.authority?.scaffoldPreflight === false, `scaffold report entered browser matrix: ${plannedCase.id}`);
      check(report?.copy?.wordFragmentationOffenders === 0 && report?.layout?.wordIntegrity?.pass === true, `whole-word gate failed in browser matrix: ${plannedCase.id}`);
      check(Array.isArray(report?.copy?.humanLineBreakReport) && report.copy.humanLineBreakReport.length > 0, `human line-break report missing: ${plannedCase.id}`);
      check(report?.layout?.pageHorizontalOverflow === false && report?.layout?.routeHorizontalOverflow === false && report?.layout?.textOverflowPass === true && report?.layout?.collisionPass === true, `overflow/collision gate failed: ${plannedCase.id}`);
      check(report?.layout?.buttonPass === true && report?.layout?.ruleSafetyPass === true && report?.layout?.dividerPass === true, `target/rule gate failed: ${plannedCase.id}`);
      check(report?.layout?.sceneSafety?.applicable === true && report?.layout?.sceneSafety?.pass === true && Number(report?.layout?.sceneSafety?.minimumClearanceCssPx) >= 16, `source-projected keepout gate failed: ${plannedCase.id}`);
      const postBezelCase = query.get("surface") === "portal" && query.get("motion") !== "reduce";
      if (postBezelCase) {
        const applicability = report?.layout?.sceneSafety?.applicability;
        check(
          report?.assets?.sceneId === postBezelTakeoverSourceId &&
          applicability?.mode === "post-bezel-physical-geometry-exited" &&
          applicability?.physicalGeometryVisible === false &&
          applicability?.collisionRequired === false &&
          applicability?.sourceId === postBezelTakeoverSourceId &&
          applicability?.sourceSha256 === postBezelPolicy?.sourceSha256 &&
          valuesEqual(applicability?.geometryIds, postBezelGeometryIds) &&
          (report?.layout?.sceneSafety?.keepouts ?? []).every((keepout) => keepout.visible === false && keepout.collisionRequired === false && keepout.sourceRectangleCount === 0),
          `post-bezel hidden-geometry applicability failed: ${plannedCase.id}`,
        );
      } else {
        check((report?.layout?.sceneSafety?.keepouts ?? []).every((keepout) => keepout.visible === true && keepout.collisionRequired === true && keepout.sourceRectangleCount > 0), `visible CRT keepout applicability failed: ${plannedCase.id}`);
      }
      check(report?.assets?.doubledCopyPass === true && report?.accessibility?.focus?.pass === true && record.runner?.focusState?.pass === true, `copy ownership or focus-state gate failed: ${plannedCase.id}`);
      check(report?.portal?.physicalScreen?.pass === true && report?.portal?.takeover?.pass === true, `4:3-to-DOM portal gate failed: ${plannedCase.id}`);
      if (query.get("font") === "fallback") {
        const matches = report?.fonts?.computedFallbackStackMatches ?? {};
        check(report?.fonts?.forcedFallbackRequested === true && report?.fonts?.forcedFallbackActive === true && report?.fonts?.preferredTokensAbsent === true && Object.keys(matches).length === 3 && Object.values(matches).every(Boolean), `forced fallback exercise failed: ${plannedCase.id}`);
      }
      if (query.get("motion") === "reduce") {
        check(report?.layout?.reducedMotionComposition?.pass === true && report?.media?.cinematicAssetsInstantiated === false && report?.assets?.televisionPowered === false && report?.assets?.cableDormant === true, `reduced-motion gate failed: ${plannedCase.id}`);
      }
      if (report?.layout?.anchors?.applicable === true) {
        check(report.layout.anchors.pass === true && Number(report.layout.anchors.maximumDeltaPx) <= 3, `reference anchor delta exceeds 3px: ${plannedCase.id}`);
      }
      check(plannedCase.captureRequired === (record.capture != null), `visual capture selection differs from plan: ${plannedCase.id}`);
    }

    const normalizedCases = cases.filter((record) => record.capture?.path && /^[a-f0-9]{64}$/i.test(record.capture?.sha256 ?? ""));
    if (freezeComplete || normalizedCases.length > 0) {
      check(normalizedCases.length === 36, `browser matrix has ${normalizedCases.length}/36 normalized capture authorities`);
      for (const record of normalizedCases) {
        await verifyFileRecord(record.capture, record.capture.path, `normalized browser capture ${record.id}`, { png: true });
      }
      const matrixSheets = matrix?.browserDerivedReviewSheets ?? [];
      check(valuesEqual(matrixSheets.map((sheet) => [sheet.reviewIndex, sheet.filename, sheet.sourceCaseIds]), (plan.browserDerivedReviewSheets ?? []).map((sheet) => [sheet.reviewIndex, sheet.filename, sheet.sourceCaseIds])), "browser-derived review-sheet case IDs differ from the plan");
      for (const sheet of matrixSheets) {
        check(Array.isArray(sheet.sourceCases) && sheet.sourceCases.length === sheet.sourceCaseIds.length, `review-sheet normalized lineage is incomplete: ${sheet.filename}`);
        for (const sourceCase of sheet.sourceCases ?? []) {
          const capture = casesById.get(sourceCase.id)?.capture;
          check(
            capture?.path === sourceCase.path && capture?.sha256 === sourceCase.sha256 && capture?.bytes === sourceCase.bytes && capture?.width === sourceCase.width && capture?.height === sourceCase.height,
            `review-sheet normalized lineage mismatch: ${sheet.filename} -> ${sourceCase.id}`,
          );
        }
      }
    }
  }
}

if (freezeComplete) {
  for (const label of ["checkpoint", "capturePlanSnapshot", "browserEvidence", "materialManifest", "browserReviewComposition"]) {
    check(await exists(files[label]), `complete Phase 0.4 authority is missing ${files[label]}`);
  }
  if (matrixExists) {
    const matrixBytes = await readFile(absolute(files.finalMatrix));
    const matrixHash = sha256(matrixBytes);
    check(plan.finalMatrix?.path === files.finalMatrix && plan.finalMatrix?.bytes === matrixBytes.length && plan.finalMatrix?.sha256 === matrixHash, "complete plan final-matrix file authority mismatch");
    check(plan.finalMatrix?.caseCount === 46 && plan.finalMatrix?.normalizedCaptureCount === 36, "complete plan does not bind 46 cases and 36 normalized captures");

    if (await exists(files.checkpoint)) {
      const checkpoint = await json(files.checkpoint);
      check(checkpoint?.schema === "quantum-hub.phase-0-4-crt-television.capture-checkpoint.v1" && checkpoint?.status === "complete-local-authority-normalized", "complete checkpoint status/schema changed");
      check(checkpoint?.matrix?.path === files.finalMatrix && checkpoint?.matrix?.bytes === matrixBytes.length && checkpoint?.matrix?.sha256 === matrixHash && checkpoint?.matrix?.cases === 46 && checkpoint?.matrix?.captures === 36 && checkpoint?.matrix?.normalized === true, "checkpoint does not bind the normalized 46/36 matrix");
    }

    if (await exists(files.browserEvidence)) {
      const browserEvidenceBytes = await readFile(absolute(files.browserEvidence));
      const browserEvidence = JSON.parse(browserEvidenceBytes.toString("utf8"));
      check(browserEvidence?.schema === "quantum-hub.phase-0-4-crt-television.browser-evidence.v1" && browserEvidence?.status === "PASS", "browser-evidence manifest is not PASS");
      check(browserEvidence?.matrix?.path === files.finalMatrix && browserEvidence?.matrix?.bytes === matrixBytes.length && browserEvidence?.matrix?.sha256 === matrixHash && browserEvidence?.matrix?.cases === 46 && browserEvidence?.matrix?.normalizedCaptures === 36, "browser-evidence manifest matrix lineage mismatch");
      if (await exists(files.portalStateManifest)) {
        const portalStateBytes = await readFile(absolute(files.portalStateManifest));
        check(browserEvidence?.portalTransitionStateAuthority?.path === files.portalStateManifest && browserEvidence?.portalTransitionStateAuthority?.bytes === portalStateBytes.length && browserEvidence?.portalTransitionStateAuthority?.sha256 === sha256(portalStateBytes), "browser-evidence manifest portal-state authority mismatch");
      }
      if (await exists(files.powerStateManifest)) {
        const powerStateBytes = await readFile(absolute(files.powerStateManifest));
        check(browserEvidence?.powerOnStateAuthority?.path === files.powerStateManifest && browserEvidence?.powerOnStateAuthority?.bytes === powerStateBytes.length && browserEvidence?.powerOnStateAuthority?.sha256 === sha256(powerStateBytes), "browser-evidence manifest power-state authority mismatch");
      }
      if (await exists(files.creativeReviewComposition)) {
        const creativeCompositionBytes = await readFile(absolute(files.creativeReviewComposition));
        check(browserEvidence?.creativeReviewCompositionManifest?.path === files.creativeReviewComposition && browserEvidence?.creativeReviewCompositionManifest?.bytes === creativeCompositionBytes.length && browserEvidence?.creativeReviewCompositionManifest?.sha256 === sha256(creativeCompositionBytes), "browser-evidence manifest creative-composition authority mismatch");
      }
      check(valuesEqual(browserEvidence?.powerOnSheet?.stateIds, expectedPowerStateIds) && (browserEvidence?.powerOnSheet?.states ?? []).length === 7, "browser-evidence manifest does not bind the exact seven power-on states");
      check(valuesEqual(browserEvidence?.portalTransitionSheet?.stateIds, expectedPortalStateIds) && (browserEvidence?.portalTransitionSheet?.states ?? []).length === 8, "browser-evidence manifest does not bind the exact eight portal states");
      check(valuesEqual((browserEvidence?.browserGovernedReviewSheets ?? []).map((sheet) => sheet.reviewIndex), [10, 11, 12, 13, 14, 15, 16]), "browser-evidence manifest does not bind sheets 10 through 16");
      check((browserEvidence?.browserGovernedReviewSheets ?? []).every((sheet) => sheet.status === "PASS" && sheet.output?.sha256), "one or more browser-governed sheets is not a bound PASS output");
      check(plan.completionAuthority?.path === files.browserEvidence && plan.completionAuthority?.schema === browserEvidence.schema && plan.completionAuthority?.bytes === browserEvidenceBytes.length && plan.completionAuthority?.sha256 === sha256(browserEvidenceBytes), "complete plan browser-evidence authority mismatch");
    }

    if (await exists(files.materialManifest)) {
      const materialBytes = await readFile(absolute(files.materialManifest));
      const material = JSON.parse(materialBytes.toString("utf8"));
      check(material?.schema === "quantum-hub.phase-0-4-crt-television.material-and-asset.v1" && material?.status === "PASS", "material/asset manifest is not PASS");
      check(material?.procedural_only === true && material?.external_texture_count === 0 && material?.external_model_count === 0, "material/asset manifest does not prove procedural-only zero-external production");
      check(plan.materialAndAssetAuthority?.path === files.materialManifest && plan.materialAndAssetAuthority?.bytes === materialBytes.length && plan.materialAndAssetAuthority?.sha256 === sha256(materialBytes), "complete plan material/asset authority mismatch");
    }

    if (await exists(files.canonicalRenderManifest)) {
      const canonicalBytes = await readFile(absolute(files.canonicalRenderManifest));
      const canonical = JSON.parse(canonicalBytes.toString("utf8"));
      check(canonical?.schema === "quantum-hub.phase-0-4-crt-television.canonical-still-render-inventory.v1" && canonical?.status === "PASS", "canonical render manifest is not PASS");
      check(canonical?.power_on_authority?.count === 7 && valuesEqual(canonical?.power_on_authority?.exact_ids, expectedPowerStateIds) && (canonical?.power_on_authority?.records ?? []).length === 7, "canonical power authority is not the exact seven-state sequence");
      check(canonical?.portal_transition_authority?.count === 8 && valuesEqual(canonical?.portal_transition_authority?.exact_ids, expectedPortalStateIds) && (canonical?.portal_transition_authority?.records ?? []).length === 8 && canonical?.portal_transition_authority?.status === "PASS", "canonical portal authority is not the exact eight-state PASS sequence");
      const powerStateBytes = await readFile(absolute(files.powerStateManifest));
      const powerState = JSON.parse(powerStateBytes.toString("utf8"));
      check(powerState?.schema === "quantum-hub.phase-0-4-crt-television.power-on-state-authority.v1" && ["FROZEN", "PASS"].includes(powerState?.status) && powerState?.count === 7 && valuesEqual(powerState?.exact_ids, expectedPowerStateIds), "external power-on state authority changed");
      check(powerState?.canonical_inventory?.package_relative_path === "manifests/crt-canonical-render-manifest.json" && powerState?.canonical_inventory?.bytes === canonicalBytes.length && powerState?.canonical_inventory?.sha256 === sha256(canonicalBytes), "power-on state authority canonical-manifest lineage mismatch");
      check(plan.powerOnStateAuthority?.path === files.powerStateManifest && plan.powerOnStateAuthority?.schema === powerState.schema && plan.powerOnStateAuthority?.bytes === powerStateBytes.length && plan.powerOnStateAuthority?.sha256 === sha256(powerStateBytes), "complete plan power-state authority mismatch");
      const creativeCompositionBytes = await readFile(absolute(files.creativeReviewComposition));
      const creativeComposition = JSON.parse(creativeCompositionBytes.toString("utf8"));
      check(creativeComposition?.schema === "quantum-hub.phase-0-4-crt-television.review-composition.v1" && (creativeComposition?.sheets ?? []).length === 8, "creative review-composition authority no longer binds sheets 2 through 9");
      check(creativeComposition?.canonical_render_authority?.bytes === canonicalBytes.length && creativeComposition?.canonical_render_authority?.sha256 === sha256(canonicalBytes), "creative review-composition canonical authority is stale");
      check(creativeComposition?.power_state_authority?.bytes === powerStateBytes.length && creativeComposition?.power_state_authority?.sha256 === sha256(powerStateBytes), "creative review-composition power authority is stale");
      check(plan.creativeReviewCompositionAuthority?.path === files.creativeReviewComposition && plan.creativeReviewCompositionAuthority?.schema === creativeComposition.schema && plan.creativeReviewCompositionAuthority?.bytes === creativeCompositionBytes.length && plan.creativeReviewCompositionAuthority?.sha256 === sha256(creativeCompositionBytes), "complete plan creative-composition authority mismatch");
      const portalCase = (await json(files.finalMatrix))?.cases?.find((record) => record.id === "portal-actual--desktop-1440x900");
      const takeoverSource = (plan.sceneFreeze?.sources ?? []).find((source) => source.id === "source-text-free-portal-takeover");
      for (let index = 6; index < 8; index += 1) {
        const state = canonical?.portal_transition_authority?.records?.[index];
        check(state?.id === expectedPortalStateIds[index] && state?.order === index + 1 && state?.owner === "repository browser semantic DOM" && state?.status === "PASS", `canonical portal state ${index + 1} ownership/status changed`);
        check(state?.case_id === "portal-actual--desktop-1440x900" && state?.source_id === "source-text-free-portal-takeover" && state?.source_sha256 === takeoverSource?.sha256 && state?.matrix_sha256 === matrixHash, `canonical portal state ${index + 1} case/source/matrix lineage mismatch`);
        check(valuesEqual(state?.capture, {
          path: portalCase?.capture?.path,
          width: portalCase?.capture?.width,
          height: portalCase?.capture?.height,
          bytes: portalCase?.capture?.bytes,
          sha256: portalCase?.capture?.sha256,
        }), `canonical portal state ${index + 1} normalized capture lineage mismatch`);
      }
      const portalStateBytes = await readFile(absolute(files.portalStateManifest));
      const portalState = JSON.parse(portalStateBytes.toString("utf8"));
      check(portalState?.schema === "quantum-hub.phase-0-4-crt-television.portal-transition-state-authority.v1" && portalState?.status === "PASS", "portal transition state authority is not PASS");
      check(portalState?.count === 8 && valuesEqual(portalState?.exact_ids, expectedPortalStateIds) && (portalState?.records ?? []).length === 8, "portal transition state authority does not bind the exact eight states");
      check(portalState?.canonical_inventory?.package_relative_path === "manifests/crt-canonical-render-manifest.json" && portalState?.canonical_inventory?.bytes === canonicalBytes.length && portalState?.canonical_inventory?.sha256 === sha256(canonicalBytes), "portal transition state authority canonical-manifest lineage mismatch");
      for (let index = 0; index < 6; index += 1) {
        const external = portalState?.records?.[index];
        const internal = canonical?.portal_transition_authority?.records?.[index];
        check(external?.id === expectedPortalStateIds[index] && external?.order === index + 1 && external?.render?.package_relative_path === internal?.render?.package_relative_path && external?.render?.sha256 === internal?.render?.sha256, `portal transition physical state ${index + 1} differs from canonical`);
      }
      for (let index = 6; index < 8; index += 1) {
        check(valuesEqual(portalState?.records?.[index], canonical?.portal_transition_authority?.records?.[index]), `portal transition semantic state ${index + 1} differs from canonical`);
      }
      check(plan.portalTransitionStateAuthority?.path === files.portalStateManifest && plan.portalTransitionStateAuthority?.schema === portalState.schema && plan.portalTransitionStateAuthority?.bytes === portalStateBytes.length && plan.portalTransitionStateAuthority?.sha256 === sha256(portalStateBytes), "complete plan portal-state authority mismatch");
    }

    if (await exists(files.browserReviewComposition)) {
      const compositionBytes = await readFile(absolute(files.browserReviewComposition));
      const composition = JSON.parse(compositionBytes.toString("utf8"));
      const matrixBinding = composition?.browser_matrix ?? composition?.matrix;
      const portalBinding = composition?.portal_state_authority ?? composition?.portalStateAuthority;
      check(composition?.schema === "quantum-hub.phase-0-4-crt-television.browser-review-composition.v1" && composition?.status === "PASS", "browser-review composition manifest is not PASS");
      check(matrixBinding?.path === files.finalMatrix && matrixBinding?.bytes === matrixBytes.length && matrixBinding?.sha256 === matrixHash && matrixBinding?.cases_total === 46 && matrixBinding?.normalized_capture_count === 36, "browser-review composition does not bind the normalized matrix");
      if (await exists(files.portalStateManifest)) {
        const portalStateBytes = await readFile(absolute(files.portalStateManifest));
        check(portalBinding?.path === files.portalStateManifest && portalBinding?.schema === "quantum-hub.phase-0-4-crt-television.portal-transition-state-authority.v1" && portalBinding?.bytes === portalStateBytes.length && portalBinding?.sha256 === sha256(portalStateBytes), "browser-review composition does not bind the final portal-state authority");
      }
      const expectedOutputs = [
        [10, "crt-portal-transition-sheet.png"],
        [11, "crt-physical-dom-alignment-sheet.png"],
        [12, "crt-desktop-hero-composition.png"],
        [13, "crt-mobile-hero-composition.png"],
        [14, "crt-text-zoom-and-fallback.png"],
        [15, "crt-reduced-motion-desktop.png"],
        [16, "crt-reduced-motion-mobile.png"],
      ];
      check((composition?.records ?? []).length === 7, "browser-review composition must contain exactly seven outputs for sheets 10 through 16");
      for (const [reviewIndex, filename] of expectedOutputs) {
        const record = (composition?.records ?? []).find((entry) => entry.reviewIndex === reviewIndex || entry.filename === filename || String(entry.path ?? "").endsWith(`/${filename}`));
        check(Boolean(record), `browser-review composition omits ${filename}`);
        if (record) await verifyFileRecord({ ...record, path: `artifacts/original/phase-0-4-crt-television/${filename}` }, `artifacts/original/phase-0-4-crt-television/${filename}`, `browser-review output ${filename}`, { png: true });
        if (reviewIndex === 10) check(valuesEqual(record?.stateIds, expectedPortalStateIds) && valuesEqual((record?.sources ?? []).map((source) => source.stateId), expectedPortalStateIds), "portal transition output does not bind the exact eight states");
      }
      check(plan.browserReviewCompositionAuthority?.path === files.browserReviewComposition && plan.browserReviewCompositionAuthority?.schema === composition.schema && plan.browserReviewCompositionAuthority?.bytes === compositionBytes.length && plan.browserReviewCompositionAuthority?.sha256 === sha256(compositionBytes), "complete plan browser-review authority mismatch");
    }
  }
}

const requiredReviewPngs = [
  "crt-television-proportion-options.png",
  "crt-television-recommended-design-sheet.png",
  "crt-cabinet-material-sheet.png",
  "crt-screen-glass-and-phosphor-sheet.png",
  "crt-controls-speaker-rear-detail-sheet.png",
  "crt-cable-and-connection-sheet.png",
  "crt-proving-ground-style-frame.png",
  "crt-camera-path-study.png",
  "crt-power-on-contact-sheet.png",
  "crt-portal-transition-sheet.png",
  "crt-physical-dom-alignment-sheet.png",
  "crt-desktop-hero-composition.png",
  "crt-mobile-hero-composition.png",
  "crt-text-zoom-and-fallback.png",
  "crt-reduced-motion-desktop.png",
  "crt-reduced-motion-mobile.png",
];
for (const filename of requiredReviewPngs) {
  check(redirect.includes(`\`${filename}\``), `redirect plan omits required review file ${filename}`);
}

check(/Phase 1: locked/i.test(redirect) && /Phase 1 remains locked/i.test(evidence), "Phase 1 lock is not explicit across planning/evidence docs");
check(/Phase 1, production cinematic integration[\s\S]*remain unauthorized/i.test(evidenceReadme), "Phase 0.4 evidence README does not preserve the Phase 1/release lock");
check(/46\/46 exact-viewport runner and child reports[\s\S]*36\/36 raw-to-normalized visual lineages/i.test(evidenceReadme), "Phase 0.4 evidence README omits the final browser topology");
check(/11 successive full-page JPEGs[\s\S]*minimum of 7\/11[\s\S]*observed final minimum is 8\/11/i.test(evidenceReadme), "Phase 0.4 evidence README omits the exact modal capture policy");
check(/recovery\/[\s\S]*never eligible to satisfy the final matrix/i.test(evidenceReadme), "Phase 0.4 evidence README does not classify recovery evidence as non-authoritative");
check(/Syne, Newsreader or Inter binaries are delivered[\s\S]*must be rerun/i.test(evidenceReadme), "Phase 0.4 evidence README omits the intended-font rerun caveat");
check(/superseded by direct human creative decision/i.test(redirect), "redirect plan does not preserve the Aperture Station supersession decision");
check(/46 cases \/ 36 intended visual captures/i.test(evidence), "evidence document does not disclose the case/capture topology");
if (freezePending) {
  check(/no final browser matrix or browser visual-pass claim exists/i.test(typography), "typography contract asserts final evidence prematurely");
  check(/capture blocked pending frozen CRT scene authorities/i.test(evidence), "evidence scaffold does not disclose the final-capture hold");
}
if (freezeReleased) {
  check(!/capture blocked pending frozen CRT scene authorities/i.test(`${typography}\n${evidence}`), "frozen documentation still classifies capture as blocked on scene freeze");
}
check(/Re-running the same command is the resume operation/i.test(prototypeReadme), "prototype README does not document implicit resume");
check(/(?:at most|no more than) ten pending cases/i.test(prototypeReadme) && /at least 7 votes/i.test(prototypeReadme), "prototype README omits bounded-batch or modal policy");

check(/<meta name="robots" content="noindex, nofollow"/.test(prototypeIndex), "Phase 0.4 harness is not explicitly non-public");
check(/id="font-control"/.test(prototypeIndex) && /value="fallback"/.test(prototypeIndex), "Phase 0.4 harness lacks a forced-fallback control");
check(/id="phase04-report"/.test(prototypeIndex) && /id="physical-screen-probe"/.test(prototypeIndex), "Phase 0.4 harness lacks serialized report or physical 4:3 probe");
check(!/<(?:video|canvas)\b/i.test(prototypeIndex), "Phase 0.4 scaffold instantiates cinematic media");
check(/word-break:\s*normal/.test(prototypeStyles) && /overflow-wrap:\s*normal/.test(prototypeStyles) && /hyphens:\s*none/.test(prototypeStyles), "Phase 0.4 stylesheet omits whole-word CSS");
check(/body\[data-font-mode="fallback"\]/.test(prototypeStyles), "Phase 0.4 stylesheet does not force fallback stacks");
check(!/@font-face|https?:\/\//i.test(prototypeStyles), "Phase 0.4 stylesheet introduces a bundled or remote font dependency");
check(/\.scene-crop[\s\S]*?overflow:\s*hidden/.test(prototypeStyles), "scene-only crop isolation is missing");
check(!/\.review-surface[\s\S]{0,180}overflow:\s*hidden/.test(prototypeStyles), "text-bearing review surface clips overflow");
check(/const EXPECTED_SOURCE_IDS = Object\.freeze\(\[[\s\S]*source-text-free-portal-takeover/.test(prototypeApp), "Phase 0.4 harness does not bind the exact six source IDs");
check(/keepoutAuthority\.status === "frozen"/.test(prototypeApp) && /keepoutAuthority\.sourceStatus === "accepted"/.test(prototypeApp), "Phase 0.4 harness does not require frozen/accepted keepouts");
check(/normalizedCableSegments/.test(prototypeApp) && /Spiral cable lacks valid normalized segment rectangles/.test(prototypeApp), "Phase 0.4 harness does not parse cable segment rectangles");
check(/MINIMUM_SCENE_CLEARANCE = 16/.test(prototypeApp) && /crt-cabinet/.test(prototypeApp) && /crt-screen/.test(prototypeApp), "Phase 0.4 harness omits 16px cabinet/screen keepouts");
check(/POST_BEZEL_TAKEOVER_SOURCE_ID = "source-text-free-portal-takeover"/.test(prototypeApp) && /post-bezel-physical-geometry-exited/.test(prototypeApp) && /hiddenGeometryIsExplicit/.test(prototypeApp), "Phase 0.4 harness omits the exact post-bezel hidden-geometry authority");
check(/MAXIMUM_ANCHOR_DELTA = 3/.test(prototypeApp) && /maximumDeltaPx/.test(prototypeApp), "Phase 0.4 harness omits numeric <=3px anchor displacement");
check(/REFERENCE_HEADING_GLYPH_CLEARANCE = 6/.test(prototypeApp) && /referenceHeadingGlyphClearanceCssPx/.test(prototypeApp), "exact-reference heading lacks explicit non-clipping glyph allowance");
check(
  /forcedFallbackRequested/.test(prototypeApp) &&
    /forcedFallbackActive/.test(prototypeApp) &&
    /computedFallbackStackMatches/.test(prototypeApp) &&
    /preferredTokensAbsent/.test(prototypeApp) &&
    /fallbackFontPass/.test(prototypeApp),
  "Phase 0.4 harness does not exercise and compare exact live-element fallback stacks",
);
check(/wordFragmentationOffenders/.test(prototypeApp) && /humanLineBreakReport/.test(prototypeApp), "Phase 0.4 harness omits whole-word machine/human reporting");
check(/authorityMode === "scaffold"/.test(prototypeApp) && /captureEligible/.test(prototypeApp) && /sceneSafety\.applicable/.test(prototypeReadme), "Phase 0.4 scaffold/final report modes are not explicit");
check(/directional-scrim-quiet-field/.test(prototypeApp) && /floatingRoundedPanelOffenders/.test(prototypeApp), "Phase 0.4 harness omits reduced-motion composition checks");
check(!/phase0[23]|phase02|phase03/i.test(prototypeApp), "Phase 0.4 harness contains a stale Phase 0.2/0.3 token");
check(/body\[data-reference="true"\] \.portal-heading[\s\S]{0,120}max-width:\s*none[\s\S]{0,120}white-space:\s*nowrap/.test(prototypeStyles), "exact-reference fallback heading is not allowed to use the full accepted heading region");
check(/\.portal-heading[\s\S]{0,180}line-height:\s*1\.08/.test(prototypeStyles), "responsive portal heading lacks a glyph-safe multi-line line height");
check(/\.hero-heading[\s\S]{0,180}line-height:\s*1\.06/.test(prototypeStyles), "hero heading lacks a glyph-safe multi-line line height");
check(/\.hero-heading[\s\S]{0,180}padding-block-end:\s*8px/.test(prototypeStyles), "hero heading lacks explicit glyph-ink clearance");
check(/\.portal-heading[\s\S]{0,220}padding-block-end:\s*16px/.test(prototypeStyles), "responsive portal heading lacks explicit glyph-ink clearance");
check(/body\[data-text-zoom="200"\] \.portal-heading[\s\S]{0,120}19\.5vw/.test(prototypeStyles), "narrow 200% portal heading lacks a whole-word effective-width clamp");
check(/body\[data-text-zoom="200"\] \.hero-heading[\s\S]{0,80}padding-block-end:\s*32px/.test(prototypeStyles), "200% hero heading lacks content-driven glyph-ink clearance");
check(/body\[data-fixture="long"\] \.hero-heading[\s\S]{0,80}padding-block-end:\s*16px/.test(prototypeStyles), "long-copy hero heading lacks content-driven glyph-ink clearance");
check(/body\[data-text-zoom="200"\] \.portal-heading[\s\S]{0,80}padding-block-end:\s*32px/.test(prototypeStyles), "200% portal heading lacks content-driven glyph-ink clearance");
check(/body\[data-chrome="false"\] \.scaffold-notice/.test(prototypeStyles), "chrome-free evidence still exposes scaffold/debug labels");
check(/body\[data-surface="hero"\]\[data-layout="mobile-portrait"\]\[data-fixture="actual"\]\[data-text-zoom="100"\] \.scene-image[\s\S]{0,120}translateY\(clamp\(80px, 11\.5vh, 96px\)\)/.test(prototypeStyles), "mobile actual/reduced hero scene lacks the keepout-safe downward composition shift");
check(/body\[data-surface="hero"\]\[data-layout="mobile-portrait"\]\[data-fixture="actual"\]\[data-text-zoom="100"\] \.hero-copy[\s\S]{0,80}margin-top:\s*28px/.test(prototypeStyles), "mobile actual/reduced hero copy lacks the keepout-safe upward composition shift");
check(/body\[data-surface="portal"\]\[data-reduced="true"\]\[data-layout="wide"\] \.scene-image[\s\S]{0,80}translateY\(325px\)/.test(prototypeStyles), "reduced desktop portal scene is not composed beneath semantic copy with the CRT and cable retained");
check(/body\[data-surface="portal"\]\[data-reduced="true"\]\[data-layout="mobile-portrait"\] \.scene-image[\s\S]{0,80}translateY\(200px\)/.test(prototypeStyles), "reduced mobile portal scene is not composed beneath semantic copy with the CRT and cable retained");
check(/body\[data-surface="hero"\]\[data-layout="wide"\]\[data-fixture="actual"\]\[data-text-zoom="100"\] \.scene-image[\s\S]{0,160}translate\(24\.5vw, clamp\(88px, 10vh, 104px\)\)/.test(prototypeStyles), "wide actual/reduced hero scene lacks the keepout-safe right/down composition shift");
check(/@media \(min-width: 900px\) and \(max-width: 1100px\)[\s\S]{0,260}translate\(31vw, clamp\(88px, 10vh, 104px\)\)/.test(prototypeStyles), "compact-wide hero scene lacks its calibrated keepout-safe shift");
check(/body\[data-surface="hero"\]\[data-layout="wide"\]\[data-fixture="actual"\]\[data-text-zoom="100"\] \.hero-copy[\s\S]{0,100}width:\s*min\(30vw, 520px\)/.test(prototypeStyles), "wide actual/reduced hero copy is not constrained to the quiet-left composition");
check(/body\[data-surface="hero"\]\[data-layout="wide"\]\[data-fixture="actual"\]\[data-text-zoom="100"\] \.hero-heading[\s\S]{0,120}padding-block-end:\s*16px/.test(prototypeStyles), "wide hero heading lacks explicit glyph-ink clearance");
check(/body\[data-surface="hero"\]\[data-layout="portrait"\]\[data-fixture="actual"\]\[data-text-zoom="100"\] \.scene-image[\s\S]{0,100}translateY\(20vh\) scale\(0\.92\)/.test(prototypeStyles), "tablet-portrait actual/reduced hero scene is not composed below copy");
check(/body\[data-surface="hero"\]\[data-layout="short-landscape"\]\[data-fixture="actual"\]\[data-text-zoom="100"\] \.scene-image[\s\S]{0,100}translateX\(34vw\) scale\(0\.85\)/.test(prototypeStyles), "short-landscape actual/reduced hero scene lacks the keepout-safe rightward composition");
check(/body\[data-surface="hero"\]\[data-layout="short-landscape"\]\[data-fixture="actual"\]\[data-text-zoom="100"\] \.hero-copy[\s\S]{0,100}width:\s*min\(36vw, 340px\)/.test(prototypeStyles), "short-landscape hero copy is not constrained to the quiet-left composition");
check(/phase04-scaffold-v19/.test(prototypeIndex) && /phase04-scaffold-v19/.test(runnerHtml), "Phase 0.4 harness cache authority is not explicit");
check(plan.harnessRevision === "phase04-scaffold-v19", "Phase 0.4 capture plan does not bind the current harness revision");
check(/allowedViewports = new Set/.test(runnerApp) && /"320x800"/.test(runnerApp) && /"844x390"/.test(runnerApp), "Phase 0.4 runner omits required exact viewports");
check(/font/.test(runnerApp) && /phase04-runner-report/.test(runnerApp) && /twoFrames/.test(runnerApp), "Phase 0.4 runner omits font propagation, DOM report or paint barrier");
check(/captureBoundsMatch/.test(runnerApp) && /focusState/.test(runnerApp), "Phase 0.4 runner omits rendered-bounds or focus-state evidence");
check(/phase-0-4-crt-portal-qa/.test(prototypeServer) && /phase-0-4-crt-television/.test(prototypeServer), "prototype server does not expose only the required Phase 0.4 local roots");

check(/const MAX_BATCH_SIZE = 10;/.test(captureRunner), "Phase 0.4 capture runner does not cap batches at 10");
check(/const SCREENSHOTS_PER_VISUAL_CASE = 11;/.test(captureRunner), "Phase 0.4 capture runner does not bind 11 screenshots per visual case");
check(/const MINIMUM_MODAL_VOTES = 7;/.test(captureRunner), "Phase 0.4 capture runner accepts a modal winner below 7\/11");
check(/expanded\.length !== 46/.test(captureRunner) && /captures !== 36/.test(captureRunner), "Phase 0.4 capture runner does not bind exact 46\/36 topology");
check(/plan\.sceneFreeze\?\.status !== "frozen"/.test(captureRunner) && /captureAllowed !== true/.test(captureRunner), "Phase 0.4 capture runner does not fail closed before scene freeze");
check(/validateCompletion\(entry, plannedCase, authority, harness\)/.test(captureRunner), "Phase 0.4 capture runner does not hash-validate resumed cases");
check(/preserveStaleCheckpoint/.test(captureRunner) && /recovery-report\.json/.test(captureRunner), "Phase 0.4 capture runner does not preserve stale authority evidence");
check(/error\.domEvidence = dom/.test(captureRunner) && /runnerDomReportSha256: error\?\.domEvidence/.test(captureRunner), "Phase 0.4 failed-case records do not preserve the real runner/child DOM evidence");
check(/wordFragmentationOffenders !== 0/.test(captureRunner) && /humanLineBreakReport/.test(captureRunner), "Phase 0.4 capture runner does not assert whole-word evidence");
check(/forcedFallbackRequested/.test(captureRunner) && /computedFallbackStackMatches/.test(captureRunner) && /fallbackFontPass/.test(captureRunner), "Phase 0.4 capture runner does not assert exact forced fallback evidence");
check(/report\.authority\?\.mode !== "final"/.test(captureRunner) && /captureEligible !== true/.test(captureRunner), "Phase 0.4 capture runner could promote a scaffold report");
check(/physical\?\.aspectRatio !== "4:3"/.test(captureRunner) && /noPermanentLetterbox/.test(captureRunner) && /physicalTextAbsentBeforeDomCopy/.test(captureRunner), "Phase 0.4 capture runner omits physical 4:3 to DOM takeover checks");
for (const id of ["crt-cabinet", "crt-screen", "spiral-cable"]) {
  check(captureRunner.includes(`"${id}"`), `Phase 0.4 capture runner omits ${id} keepout verification`);
}
check(/directional-scrim-quiet-field/.test(captureRunner) && /cinematicAssetsInstantiated/.test(captureRunner), "Phase 0.4 capture runner omits static reduced-motion checks");
check(/atomicWriteJson\(repoPath\(CHECKPOINT_RELATIVE\)/.test(captureRunner), "Phase 0.4 capture runner does not checkpoint atomically");
check(/validateKeepoutGeometry/.test(captureRunner) && /sourceObjectLineage/.test(captureRunner), "Phase 0.4 capture runner does not independently parse keepout geometry/lineage");
check(/hiddenGeometryIsExplicit/.test(captureRunner) && /post-bezel takeover does not bind explicit out-of-frame physical geometry/.test(captureRunner), "Phase 0.4 capture runner does not bind the post-bezel hidden-geometry exception");
check(/browserDerivedReviewSheets/.test(captureRunner) && /reviewSheetLineagePolicy/.test(captureRunner), "Phase 0.4 matrix does not carry browser-derived review-sheet lineage");

check(/MATRIX_SCHEMA = "quantum-hub\.phase-0-4-crt-television\.typography-collision-matrix\.v1"/.test(normalizer), "Phase 0.4 normalizer expects the wrong matrix schema");
check(/freeze\.get\("status"\) != "frozen"/.test(normalizer), "Phase 0.4 normalizer does not fail closed before scene freeze");
check(/Image\.Resampling\.LANCZOS/.test(normalizer), "Phase 0.4 normalizer does not bind high-quality scaled evidence resampling");
check(/len\(required\) != 36/.test(normalizer), "Phase 0.4 normalizer does not bind 36 visual captures");
check(/raw capture lineage mismatch/.test(normalizer) && /normalized capture lineage mismatch/.test(normalizer), "Phase 0.4 normalizer omits raw or normalized hash verification");
check(/complete-local-authority-normalized/.test(normalizer), "Phase 0.4 normalizer does not seal the checkpoint after binding lineage");
check(/sourceCaseIds/.test(normalizer) && /sourceCases/.test(normalizer) && /external SHA-256 of this finalized matrix/.test(normalizer), "Phase 0.4 normalizer does not bind review-sheet case authorities and external matrix-hash policy");
check(/PLAN_SNAPSHOT_PATH/.test(normalizer) && /matrix_status not in \{"ready-for-capture", "complete"\}/.test(normalizer) && /plan_authority = PLAN_PATH if matrix_status == "ready-for-capture" else PLAN_SNAPSHOT_PATH/.test(normalizer), "Phase 0.4 normalizer does not preserve ready-plan lineage across strict completion");

check(/--prepare\|--complete\|--check/.test(finalizer), "Phase 0.4 browser finalizer does not expose prepare/complete/check stages");
check(/READY_FOR_REVIEW_COMPOSITION/.test(finalizer) && /sceneFreeze\.matrixStatus = "complete"/.test(finalizer), "Phase 0.4 finalizer does not preserve the composition gate before complete status");
check(/portal-07-dom-takes-ownership/.test(finalizer) && /portal-08-full-semantic-surface/.test(finalizer) && /repository browser semantic DOM/.test(finalizer), "Phase 0.4 finalizer does not bind semantic portal states 7 and 8");
check(/crt-portal-transition-state-authority\.json/.test(finalizer) && /patchPortalStateAuthority/.test(finalizer) && /PORTAL_STATE_SCHEMA/.test(finalizer), "Phase 0.4 finalizer does not promote the external eight-state portal authority to PASS");
check(/patchPowerStateAuthority/.test(finalizer) && /patchCreativeCompositionAuthorities/.test(finalizer) && /canonical_render_authority/.test(finalizer) && /power_state_authority/.test(finalizer), "Phase 0.4 finalizer does not refresh downstream canonical/power authority consumers");
check(/POWER_STATE_IDS/.test(finalizer) && /PORTAL_STATE_IDS/.test(finalizer) && /Browser review manifest has \$\{records\.length\}\/7 exact outputs/.test(finalizer), "Phase 0.4 finalizer does not enforce exact seven-power/eight-portal/seven-sheet lineage");
check(/capture-plan-authority\.json/.test(finalizer) && /one-way ready-plan snapshot/.test(finalizer), "Phase 0.4 finalizer lacks the non-circular plan/matrix authority snapshot");
check(/crt-material-and-asset-manifest\.json/.test(finalizer) && /procedural_only/.test(finalizer) && /external_texture_count/.test(finalizer), "Phase 0.4 finalizer does not require the material/asset authority");
check(/"capture:phase04": "node scripts\/capture-phase04-browser-matrix\.mjs"/.test(packageJson), "package.json does not expose the Phase 0.4 capture command");
check(/node scripts\/verify-phase0-4-crt-layout\.mjs && node scripts\/verify-phase0-4-crt-assets\.mjs/.test(packageJson), "package.json check does not wire both additive Phase 0.4 verifiers in order");
check(/"prepare:phase04-browser"/.test(packageJson) && /"finalize:phase04-browser"/.test(packageJson) && /"check:phase04-browser"/.test(packageJson), "package.json omits Phase 0.4 browser evidence finalization commands");

const scanSources = [
  [files.contract, JSON.stringify(contract ?? {})],
  [files.plan, JSON.stringify(plan ?? {})],
  [files.redirect, redirect],
  [files.typography, typography],
  [files.evidence, evidence],
  [files.prototypeReadme, prototypeReadme],
  [files.prototypeIndex, prototypeIndex],
  [files.prototypeStyles, prototypeStyles],
  [files.prototypeApp, prototypeApp],
  [files.runnerHtml, runnerHtml],
  [files.runnerStyles, runnerStyles],
  [files.runnerApp, runnerApp],
  [files.captureRunner, captureRunner],
  [files.normalizer, normalizer],
  [files.finalizer, finalizer],
  [files.packageJson, packageJson],
];
for (const [relative, source] of scanSources) {
  check(!/[A-Za-z]:[\\/](?:Users|Documents|OneDrive)[\\/]/i.test(source), `private absolute path leaked into ${relative}`);
  check(!/(?:\/Users\/|\/home\/)[^\s`"']+/i.test(source), `private POSIX path leaked into ${relative}`);
  check(!/\b(?:Defense|dual-use)\b/i.test(source), `prohibited public taxonomy leaked into ${relative}`);
  check(!/(?:reference|third[- ]party)[^\n]{0,160}\.(?:jpg|jpeg|webp|avif)\b/i.test(source), `third-party/private raster reference file appears in ${relative}`);
}

if (errors.length > 0) {
  console.error(`Phase 0.4 CRT portal/layout scaffold verification failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const contractHash = sha256(await readFile(absolute(files.contract)));
if (freezePending) {
  console.log(`Verified Phase 0.4 CRT portal/layout scaffold: contract ${contractHash}; physical screen 4:3; 46 planned cases / 36 visual captures; executable typography preflight present; final browser capture correctly held for frozen CRT scene authorities.`);
} else {
  console.log(`Verified Phase 0.4 frozen CRT portal/layout authority: contract ${contractHash}; six scene roles and evaluated keepouts bound; 46 cases / 36 visual captures; whole-word, fallback, anchor, collision and reduced-motion gates enforced${matrixExists ? "; browser matrix validated" : "; browser matrix not yet finalized"}.`);
}
