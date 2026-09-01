import assert from "node:assert/strict";
import test from "node:test";

import {
  MANIFESTO_AUTHORED_LINES,
  MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE,
  MANIFESTO_GEOMETRY_SCHEMA,
  MINIMUM_MANIFESTO_SAFETY_PX,
  PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS,
  SHORT_LANDSCAPE_VIEWPORTS,
  manifestoGeometryMeasurementSource,
  measureManifestoGeometry,
  validateManifestoClippingAuthority,
  validateManifestoGeometry,
  validateManifestoGeometryMeasurement,
} from "../scripts/phase7a-manifesto-geometry.mjs";

const rect = (left, top, right, bottom) => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
});

function glyphBoxes(text, left, top, right, bottom, startingOrder) {
  const glyphs = [...text].filter((glyph) => /\S/u.test(glyph));
  const step = (right - left) / glyphs.length;
  return glyphs.map((glyph, index) => rect(
    left + step * index,
    top,
    left + step * (index + 1),
    bottom,
  )).map((bounds, index) => ({
    glyph: glyphs[index],
    glyphOrder: startingOrder + index,
    nodeIndex: 0,
    startOffset: index,
    endOffset: index + 1,
    ...bounds,
  }));
}

function authoredLine(index, text, left, top, right, bottom, startingOrder) {
  const glyphs = glyphBoxes(text, left, top, right, bottom, startingOrder);
  const rendered = {
    authoredLineIndex: index,
    renderedLineIndex: 1,
    ...rect(left, top, right, bottom),
    glyphCount: glyphs.length,
    text: glyphs.map(({ glyph }) => glyph).join(""),
  };
  return {
    authoredLineIndex: index,
    text,
    elementRect: rect(left - 2, top - 2, right + 2, bottom + 2),
    glyphBoxes: glyphs,
    glyphBounds: rect(left, top, right, bottom),
    renderedLineUnions: [rendered],
  };
}

function passingMeasurement() {
  const authoredLines = [
    authoredLine(1, MANIFESTO_AUTHORED_LINES[0], 88, 112, 312, 150, 0),
    authoredLine(2, MANIFESTO_AUTHORED_LINES[1], 72, 184, 650, 224, 6),
    authoredLine(3, MANIFESTO_AUTHORED_LINES[2], 42, 272, 758, 320, 21),
  ];
  const usableClipBounds = rect(0, 100.25, 800, 360);
  const h1Rect = rect(30, 104, 770, 348);
  const glyphBounds = rect(42, 112, 758, 320);
  const renderedLineUnions = authoredLines.flatMap(({ renderedLineUnions: lines }) => lines);
  return {
    schema: MANIFESTO_GEOMETRY_SCHEMA,
    measuredAt: "2026-09-01T00:00:00.000Z",
    selectors: {
      h1: "#home-title",
      section: "[data-manifesto-threshold]",
      authoredLine: ".manifesto-line",
      occludingHeader: ".site-header",
    },
    viewport: {
      id: "short-landscape-800x360",
      ...rect(0, 0, 800, 360),
    },
    state: {
      cinematicMode: "enhanced",
      cinematicPhase: "settled",
      manifestoReveal: "resolved",
      resolvedOrStatic: true,
    },
    measurementError: null,
    h1: {
      selector: "#home-title",
      ariaLabel: "We turn industrial needs into field evidence.",
      rect: h1Rect,
      presentation: {
        display: "grid",
        visibility: "visible",
        opacity: 1,
        visible: true,
      },
    },
    section: {
      selector: "[data-manifesto-threshold]",
      rect: rect(0, 100.25, 800, 460.25),
    },
    sectionClipBounds: rect(0, 100.25, 800, 460.25),
    clippingAncestors: [{
      tag: "section",
      id: "entry",
      classes: ["manifesto-field", "signal-threshold"],
      selector: "#entry",
      isSignalFieldSection: true,
      overflowX: "clip",
      overflowY: "clip",
      clipPath: "none",
      contain: "none",
      clipsX: true,
      clipsY: true,
      bounds: rect(0, 100.25, 800, 460.25),
    }],
    usableClipBounds,
    occludingHeader: {
      tag: "header",
      id: null,
      classes: ["site-header"],
      selector: ".site-header",
      rect: rect(0, 0, 800, 100.25),
      position: "sticky",
      computedTop: "0px",
      zIndex: "40",
      presentation: {
        display: "block",
        visibility: "visible",
        opacity: 1,
        visible: true,
      },
      anchoredToViewportTop: true,
      horizontallyOverlapsManifesto: true,
      occluding: true,
      effectiveBottom: 100.25,
    },
    effectiveVisibleBounds: usableClipBounds,
    authoredLines,
    renderedLineUnions,
    glyphBounds,
    safeAllowances: {
      minimumRequiredPx: 2,
      h1: { top: 3.75, bottom: 12 },
      glyphs: { top: 11.75, bottom: 40 },
      renderedLines: renderedLineUnions.map((line) => ({
        authoredLineIndex: line.authoredLineIndex,
        renderedLineIndex: line.renderedLineIndex,
        top: line.top - usableClipBounds.top,
        bottom: usableClipBounds.bottom - line.bottom,
      })),
    },
    boundaryAnalysis: {
      glyphEscapes: [],
      boundaryIntersections: [],
      safetyViolations: [],
      occludingHeaderIntersections: [],
    },
    horizontalOverflow: false,
    horizontalMetrics: {
      documentScrollWidth: 800,
      bodyScrollWidth: 800,
      maximumScrollWidth: 800,
      clientWidth: 800,
      viewportWidth: 800,
      overflowPixels: 0,
    },
  };
}

test("R1 freezes exactly the twelve required short-landscape viewports", () => {
  assert.equal(SHORT_LANDSCAPE_VIEWPORTS, PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS);
  assert.equal(SHORT_LANDSCAPE_VIEWPORTS.length, 12);
  assert.deepEqual(
    SHORT_LANDSCAPE_VIEWPORTS.map(({ width, height }) => [width, height]),
    [
      [740, 320],
      [740, 360],
      [768, 320],
      [768, 360],
      [800, 320],
      [800, 360],
      [800, 390],
      [820, 360],
      [844, 360],
      [844, 390],
      [896, 414],
      [900, 480],
    ],
  );
  assert.equal(new Set(SHORT_LANDSCAPE_VIEWPORTS.map(({ id }) => id)).size, 12);
  assert.ok(Object.isFrozen(SHORT_LANDSCAPE_VIEWPORTS));
  assert.ok(SHORT_LANDSCAPE_VIEWPORTS.every((candidate) => Object.isFrozen(candidate) && candidate.family === "short-landscape"));
});

test("browser measurement source is closure-free and measures text-node Range glyph boxes", () => {
  assert.equal(typeof measureManifestoGeometry, "function");
  assert.equal(manifestoGeometryMeasurementSource(), MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE);
  assert.match(MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE, /createTreeWalker\(element, NodeFilter\.SHOW_TEXT\)/);
  assert.match(MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE, /document\.createRange\(\)/);
  assert.match(MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE, /range\.getClientRects\(\)/);
  assert.match(MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE, /clippingAncestors/);
  assert.match(MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE, /usableClipBounds/);
  assert.match(MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE, /occludingHeaderSelector = "\.site-header"/);
  assert.match(MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE, /effectiveVisibleBounds/);
  assert.match(MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE, /rect\.width \/ element\.offsetWidth/);
  assert.match(MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE, /Math\.min\(rect\.bottom, top \+ element\.clientHeight \* scaleY\)/);
});

test("validator accepts a resolved measurement with three authored rendered lines and two-pixel safety", () => {
  assert.equal(MINIMUM_MANIFESTO_SAFETY_PX, 2);
  assert.equal(validateManifestoGeometry(passingMeasurement()), true);
  assert.equal(validateManifestoGeometryMeasurement(passingMeasurement()), true);

  const staticFallback = passingMeasurement();
  staticFallback.state.cinematicMode = "static";
  staticFallback.state.manifestoReveal = "hidden";
  staticFallback.state.resolvedOrStatic = true;
  assert.equal(validateManifestoGeometry(staticFallback), true);

  const concealedHeader = passingMeasurement();
  concealedHeader.occludingHeader.presentation.opacity = 0;
  concealedHeader.occludingHeader.presentation.visible = false;
  concealedHeader.occludingHeader.occluding = false;
  concealedHeader.occludingHeader.effectiveBottom = 0;
  assert.equal(validateManifestoGeometry(concealedHeader), true);
});

test("clipping authority and the full validator reject raw-derived summary lies", () => {
  const assertBothReject = (mutate, expected) => {
    const helperCase = passingMeasurement();
    mutate(helperCase);
    assert.throws(() => validateManifestoClippingAuthority(helperCase), expected);
    const fullCase = passingMeasurement();
    mutate(fullCase);
    assert.throws(() => validateManifestoGeometry(fullCase), expected);
  };
  assert.equal(validateManifestoClippingAuthority(passingMeasurement()).expectedHeaderOcclusion, true);
  assertBothReject((measurement) => { measurement.clippingAncestors[0].clipsY = false; }, /axis authority differs/);
  assertBothReject((measurement) => { measurement.occludingHeader.anchoredToViewportTop = false; }, /anchor authority differs/);
  assertBothReject((measurement) => { measurement.occludingHeader.horizontallyOverlapsManifesto = false; }, /overlap authority differs/);
  assertBothReject((measurement) => {
    measurement.clippingAncestors[0].bounds.top += 1;
    measurement.clippingAncestors[0].bounds.height -= 1;
  }, /Signal Field #entry ancestor bounds\.top differs/);
});

test("regression: old 800x360 H1 top 89.796875 is rejected against clip top 100.25", () => {
  const oldGeometry = passingMeasurement();
  oldGeometry.h1.rect = rect(30, 89.796875, 770, 348);
  oldGeometry.safeAllowances.h1.top = 89.796875 - 100.25;

  assert.equal(oldGeometry.viewport.width, 800);
  assert.equal(oldGeometry.viewport.height, 360);
  assert.equal(oldGeometry.h1.rect.top, 89.796875);
  assert.equal(oldGeometry.usableClipBounds.top, 100.25);
  assert.throws(
    () => validateManifestoGeometry(oldGeometry),
    /H1 top safety is -10\.453125px; at least 2px is required/,
  );
});

test("regression: native anchor geometry cannot PASS when scripted scrolling places the H1 under the sticky header", () => {
  const occluded = passingMeasurement();
  occluded.section.rect = rect(0, 0.25, 800, 360.25);
  occluded.sectionClipBounds = rect(0, 0.25, 800, 360.25);
  occluded.clippingAncestors[0].bounds = rect(0, 0.25, 800, 360.25);
  occluded.usableClipBounds = rect(0, 0.25, 800, 360);
  occluded.effectiveVisibleBounds = rect(0, 100.25, 800, 360);
  occluded.h1.rect = rect(30, 17.03125, 770, 180.96875);
  occluded.safeAllowances.h1 = { top: -83.21875, bottom: 179.03125 };

  assert.throws(
    () => validateManifestoGeometry(occluded),
    /H1 top safety is -83\.21875px; at least 2px is required/,
  );
});

test("validator fails closed for unresolved state, wrapping, inadequate safety and horizontal overflow", () => {
  const unresolved = passingMeasurement();
  unresolved.state.cinematicMode = "enhanced";
  unresolved.state.manifestoReveal = "revealing";
  unresolved.state.resolvedOrStatic = false;
  assert.throws(() => validateManifestoGeometry(unresolved), /state must be resolved or static/);

  const wrapped = passingMeasurement();
  wrapped.authoredLines[2].renderedLineUnions.push({
    ...wrapped.authoredLines[2].renderedLineUnions[0],
    renderedLineIndex: 2,
    top: 326,
    bottom: 348,
    height: 22,
  });
  assert.throws(() => validateManifestoGeometry(wrapped), /must resolve to exactly 1 rendered line/);

  const inadequateSafety = passingMeasurement();
  inadequateSafety.h1.rect = rect(30, 102.24, 770, 348);
  inadequateSafety.safeAllowances.h1.top = 1.99;
  assert.throws(() => validateManifestoGeometry(inadequateSafety), /at least 2px is required/);

  const overflow = passingMeasurement();
  overflow.horizontalOverflow = true;
  overflow.horizontalMetrics.documentScrollWidth = 801;
  overflow.horizontalMetrics.bodyScrollWidth = 801;
  overflow.horizontalMetrics.maximumScrollWidth = 801;
  overflow.horizontalMetrics.overflowPixels = 1;
  assert.throws(() => validateManifestoGeometry(overflow), /horizontal overflow is present/);
});

test("validator recomputes clip bounds and rejects missing glyph or boundary evidence", () => {
  const wrongClip = passingMeasurement();
  wrongClip.usableClipBounds = rect(0, 99, 800, 360);
  assert.throws(() => validateManifestoGeometry(wrongClip), /usable clip bounds\.top differs/);

  const noGlyphs = passingMeasurement();
  noGlyphs.authoredLines[0].glyphBoxes = [];
  assert.throws(() => validateManifestoGeometry(noGlyphs), /has no Range glyph boxes/);

  const falseBoundaryPass = passingMeasurement();
  falseBoundaryPass.boundaryAnalysis.boundaryIntersections.push({
    authoredLineIndex: 1,
    renderedLineIndex: 1,
    sides: ["top"],
  });
  assert.throws(() => validateManifestoGeometry(falseBoundaryPass), /intersects a clipping boundary/);
});
