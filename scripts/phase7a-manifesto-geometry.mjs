export const MANIFESTO_GEOMETRY_SCHEMA = "quantum-hub.phase-7a-r1.manifesto-geometry.v1";
export const MINIMUM_MANIFESTO_SAFETY_PX = 2;

const viewport = (width, height) => Object.freeze({
  id: `short-landscape-${width}x${height}`,
  width,
  height,
  family: "short-landscape",
});

export const PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS = Object.freeze([
  viewport(740, 320),
  viewport(740, 360),
  viewport(768, 320),
  viewport(768, 360),
  viewport(800, 320),
  viewport(800, 360),
  viewport(800, 390),
  viewport(820, 360),
  viewport(844, 360),
  viewport(844, 390),
  viewport(896, 414),
  viewport(900, 480),
]);

export const SHORT_LANDSCAPE_VIEWPORTS = PHASE7A_R1_SHORT_LANDSCAPE_VIEWPORTS;

export const MANIFESTO_AUTHORED_LINES = Object.freeze([
  "WE TURN",
  "INDUSTRIAL NEEDS",
  "INTO FIELD EVIDENCE.",
]);

/**
 * Browser-only measurement. The function is intentionally closure-free so it
 * can be passed directly to Playwright's page.evaluate or serialized through
 * MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE.
 */
export function measureManifestoGeometry({
  h1Selector = "#home-title",
  sectionSelector = "[data-manifesto-threshold]",
  lineSelector = ".manifesto-line",
  occludingHeaderSelector = ".site-header",
} = {}) {
  const schema = "quantum-hub.phase-7a-r1.manifesto-geometry.v1";
  const minimumSafetyPx = 2;
  const h1 = document.querySelector(h1Selector);
  const section = document.querySelector(sectionSelector);
  const occludingHeaderElement = document.querySelector(occludingHeaderSelector);
  const root = document.documentElement;
  const body = document.body;
  const shell = document.querySelector("[data-cinematic-shell]");

  const numericRect = (rect) => {
    const left = Number(rect.left);
    const top = Number(rect.top);
    const right = Number(rect.right);
    const bottom = Number(rect.bottom);
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  };

  const elementClientBounds = (element) => {
    const rect = element.getBoundingClientRect();
    const left = rect.left + (element.clientLeft || 0);
    const top = rect.top + (element.clientTop || 0);
    const width = element.clientWidth;
    const height = element.clientHeight;
    return numericRect({ left, top, right: left + width, bottom: top + height });
  };

  const union = (rectangles) => {
    if (!rectangles.length) return null;
    return numericRect({
      left: Math.min(...rectangles.map(({ left }) => left)),
      top: Math.min(...rectangles.map(({ top }) => top)),
      right: Math.max(...rectangles.map(({ right }) => right)),
      bottom: Math.max(...rectangles.map(({ bottom }) => bottom)),
    });
  };

  const intersect = (leftRect, rightRect, { x = true, y = true } = {}) => numericRect({
    left: x ? Math.max(leftRect.left, rightRect.left) : leftRect.left,
    top: y ? Math.max(leftRect.top, rightRect.top) : leftRect.top,
    right: x ? Math.min(leftRect.right, rightRect.right) : leftRect.right,
    bottom: y ? Math.min(leftRect.bottom, rightRect.bottom) : leftRect.bottom,
  });

  const descriptor = (element) => ({
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: [...element.classList],
    selector: element.id
      ? `#${element.id}`
      : element.hasAttribute("data-manifesto-threshold")
        ? "[data-manifesto-threshold]"
        : `${element.tagName.toLowerCase()}${[...element.classList].slice(0, 2).map((name) => `.${name}`).join("")}`,
  });

  const viewportBounds = numericRect({
    left: 0,
    top: 0,
    right: innerWidth,
    bottom: innerHeight,
  });
  const viewportId = `short-landscape-${innerWidth}x${innerHeight}`;
  const base = {
    schema,
    measuredAt: new Date().toISOString(),
    selectors: {
      h1: h1Selector,
      section: sectionSelector,
      authoredLine: lineSelector,
      occludingHeader: occludingHeaderSelector,
    },
    viewport: { id: viewportId, ...viewportBounds },
    state: {
      cinematicMode: root.dataset.cinematicMode ?? null,
      cinematicPhase: shell?.getAttribute("data-cinematic-phase") ?? null,
      manifestoReveal: shell?.getAttribute("data-manifesto-reveal") ?? null,
    },
  };
  base.state.resolvedOrStatic = base.state.manifestoReveal === "resolved" || base.state.cinematicMode === "static";

  if (!h1 || !section) {
    return {
      ...base,
      measurementError: !h1 && !section
        ? "manifesto H1 and Signal Field section were not found"
        : !h1
          ? "manifesto H1 was not found"
          : "Signal Field section was not found",
      h1: null,
      section: null,
      sectionClipBounds: null,
      clippingAncestors: [],
      usableClipBounds: null,
      occludingHeader: null,
      effectiveVisibleBounds: null,
      authoredLines: [],
      renderedLineUnions: [],
      glyphBounds: null,
      safeAllowances: null,
      boundaryAnalysis: null,
      horizontalOverflow: true,
      horizontalMetrics: null,
    };
  }

  const h1Rect = numericRect(h1.getBoundingClientRect());
  const sectionRect = numericRect(section.getBoundingClientRect());
  const sectionClipBounds = elementClientBounds(section);
  const clippingAncestors = [];
  const clippingOverflow = new Set(["auto", "clip", "hidden", "scroll"]);
  let ancestor = h1.parentElement;
  while (ancestor) {
    const style = getComputedStyle(ancestor);
    const contain = String(style.contain || "").split(/\s+/);
    const paintContainment = contain.some((token) => ["content", "paint", "strict"].includes(token));
    const clipPath = style.clipPath || style.webkitClipPath || "none";
    const pathClipping = clipPath !== "none";
    const clipsX = clippingOverflow.has(style.overflowX) || paintContainment || pathClipping;
    const clipsY = clippingOverflow.has(style.overflowY) || paintContainment || pathClipping;
    if (clipsX || clipsY) {
      clippingAncestors.push({
        ...descriptor(ancestor),
        isSignalFieldSection: ancestor === section,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        clipPath,
        contain: style.contain || "none",
        clipsX,
        clipsY,
        bounds: elementClientBounds(ancestor),
      });
    }
    ancestor = ancestor.parentElement;
  }

  let usableClipBounds = intersect(viewportBounds, sectionClipBounds);
  for (const clippingAncestor of clippingAncestors) {
    usableClipBounds = intersect(usableClipBounds, clippingAncestor.bounds, {
      x: clippingAncestor.clipsX,
      y: clippingAncestor.clipsY,
    });
  }

  const occludingHeader = (() => {
    if (!occludingHeaderElement) return null;
    const rect = numericRect(occludingHeaderElement.getBoundingClientRect());
    const style = getComputedStyle(occludingHeaderElement);
    const opacity = Number.parseFloat(style.opacity);
    const visible = style.display !== "none"
      && !["collapse", "hidden"].includes(style.visibility)
      && Number.isFinite(opacity)
      && opacity > 0;
    const anchoredToViewportTop = ["fixed", "sticky"].includes(style.position)
      && rect.top <= viewportBounds.top + 0.5
      && rect.bottom > viewportBounds.top;
    const horizontallyOverlapsManifesto = rect.right > h1Rect.left && rect.left < h1Rect.right;
    const occluding = visible && anchoredToViewportTop && horizontallyOverlapsManifesto;
    return {
      ...descriptor(occludingHeaderElement),
      selector: occludingHeaderSelector,
      rect,
      position: style.position,
      computedTop: style.top,
      zIndex: style.zIndex,
      presentation: { display: style.display, visibility: style.visibility, opacity, visible },
      anchoredToViewportTop,
      horizontallyOverlapsManifesto,
      occluding,
      effectiveBottom: occluding ? Math.min(viewportBounds.bottom, rect.bottom) : viewportBounds.top,
    };
  })();
  const effectiveVisibleBounds = numericRect({
    left: usableClipBounds.left,
    top: Math.max(usableClipBounds.top, occludingHeader?.effectiveBottom ?? viewportBounds.top),
    right: usableClipBounds.right,
    bottom: usableClipBounds.bottom,
  });

  const authoredLineElements = [...h1.querySelectorAll(lineSelector)];
  let glyphOrder = 0;
  const glyphBoxesFor = (element) => {
    const boxes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    let nodeIndex = 0;
    while (textNode) {
      const value = textNode.nodeValue || "";
      for (let startOffset = 0; startOffset < value.length;) {
        const codePoint = value.codePointAt(startOffset);
        const glyph = String.fromCodePoint(codePoint);
        const endOffset = startOffset + glyph.length;
        if (/\S/u.test(glyph)) {
          const range = document.createRange();
          range.setStart(textNode, startOffset);
          range.setEnd(textNode, endOffset);
          for (const rangeRect of range.getClientRects()) {
            const rect = numericRect(rangeRect);
            if (rect.width > 0 && rect.height > 0) {
              boxes.push({
                glyph,
                glyphOrder,
                nodeIndex,
                startOffset,
                endOffset,
                ...rect,
              });
            }
          }
          range.detach?.();
          glyphOrder += 1;
        }
        startOffset = endOffset;
      }
      nodeIndex += 1;
      textNode = walker.nextNode();
    }
    return boxes;
  };

  const renderedLineUnionsFor = (boxes) => {
    const clusters = [];
    const ordered = [...boxes].sort((left, right) => {
      const vertical = ((left.top + left.bottom) / 2) - ((right.top + right.bottom) / 2);
      return Math.abs(vertical) > 0.25 ? vertical : left.left - right.left;
    });
    for (const box of ordered) {
      const center = (box.top + box.bottom) / 2;
      let selected = null;
      let selectedDistance = Number.POSITIVE_INFINITY;
      for (const cluster of clusters) {
        const distance = Math.abs(center - cluster.center);
        const tolerance = Math.max(1, Math.min(box.height, cluster.averageHeight) * 0.35);
        if (distance <= tolerance && distance < selectedDistance) {
          selected = cluster;
          selectedDistance = distance;
        }
      }
      if (!selected) {
        selected = { boxes: [], center, averageHeight: box.height };
        clusters.push(selected);
      }
      selected.boxes.push(box);
      selected.center = selected.boxes.reduce((sum, item) => sum + ((item.top + item.bottom) / 2), 0) / selected.boxes.length;
      selected.averageHeight = selected.boxes.reduce((sum, item) => sum + item.height, 0) / selected.boxes.length;
    }
    return clusters
      .map((cluster) => {
        const bounds = union(cluster.boxes);
        const glyphs = [...new Map(cluster.boxes
          .sort((left, right) => left.glyphOrder - right.glyphOrder)
          .map((box) => [box.glyphOrder, box.glyph])).values()];
        return { ...bounds, glyphCount: cluster.boxes.length, text: glyphs.join("") };
      })
      .sort((left, right) => left.top - right.top || left.left - right.left);
  };

  const authoredLines = authoredLineElements.map((line, authoredIndex) => {
    const glyphBoxes = glyphBoxesFor(line);
    const renderedLineUnions = renderedLineUnionsFor(glyphBoxes).map((bounds, renderedIndex) => ({
      authoredLineIndex: authoredIndex + 1,
      renderedLineIndex: renderedIndex + 1,
      ...bounds,
    }));
    return {
      authoredLineIndex: authoredIndex + 1,
      text: (line.textContent || "").replace(/\s+/g, " ").trim(),
      elementRect: numericRect(line.getBoundingClientRect()),
      glyphBoxes,
      glyphBounds: union(glyphBoxes),
      renderedLineUnions,
    };
  });
  const renderedLineUnions = authoredLines
    .flatMap((line) => line.renderedLineUnions)
    .sort((left, right) => left.top - right.top || left.left - right.left);
  const allGlyphBoxes = authoredLines.flatMap((line) => line.glyphBoxes);
  const glyphBounds = union(allGlyphBoxes);
  const h1Style = getComputedStyle(h1);
  const opacity = Number.parseFloat(h1Style.opacity);
  const presentation = {
    display: h1Style.display,
    visibility: h1Style.visibility,
    opacity: Number.isFinite(opacity) ? opacity : null,
    visible: h1Style.display !== "none"
      && !["collapse", "hidden"].includes(h1Style.visibility)
      && Number.isFinite(opacity)
      && opacity > 0,
  };

  const allowance = (bounds) => bounds ? ({
    top: bounds.top - effectiveVisibleBounds.top,
    bottom: effectiveVisibleBounds.bottom - bounds.bottom,
  }) : null;
  const safeAllowances = {
    minimumRequiredPx: minimumSafetyPx,
    h1: allowance(h1Rect),
    glyphs: allowance(glyphBounds),
    renderedLines: renderedLineUnions.map((line) => ({
      authoredLineIndex: line.authoredLineIndex,
      renderedLineIndex: line.renderedLineIndex,
      ...allowance(line),
    })),
  };
  const glyphEscapes = allGlyphBoxes.flatMap((box) => {
    const sides = [];
    if (box.left < effectiveVisibleBounds.left) sides.push("left");
    if (box.right > effectiveVisibleBounds.right) sides.push("right");
    if (box.top < effectiveVisibleBounds.top) sides.push("top");
    if (box.bottom > effectiveVisibleBounds.bottom) sides.push("bottom");
    return sides.length ? [{ glyph: box.glyph, glyphOrder: box.glyphOrder, sides }] : [];
  });
  const boundaryIntersections = renderedLineUnions.flatMap((line) => {
    const sides = [];
    if (line.left <= effectiveVisibleBounds.left) sides.push("left");
    if (line.right >= effectiveVisibleBounds.right) sides.push("right");
    if (line.top <= effectiveVisibleBounds.top) sides.push("top");
    if (line.bottom >= effectiveVisibleBounds.bottom) sides.push("bottom");
    return sides.length ? [{
      authoredLineIndex: line.authoredLineIndex,
      renderedLineIndex: line.renderedLineIndex,
      sides,
    }] : [];
  });
  const safetyViolations = safeAllowances.renderedLines.flatMap((line) => {
    const sides = [];
    if (line.top < minimumSafetyPx) sides.push("top");
    if (line.bottom < minimumSafetyPx) sides.push("bottom");
    return sides.length ? [{
      authoredLineIndex: line.authoredLineIndex,
      renderedLineIndex: line.renderedLineIndex,
      sides,
    }] : [];
  });

  const documentScrollWidth = root.scrollWidth;
  const bodyScrollWidth = body?.scrollWidth ?? 0;
  const clientWidth = root.clientWidth;
  const maximumScrollWidth = Math.max(documentScrollWidth, bodyScrollWidth);
  const overflowPixels = Math.max(0, maximumScrollWidth - clientWidth);

  return {
    ...base,
    measurementError: null,
    h1: {
      selector: h1Selector,
      ariaLabel: h1.getAttribute("aria-label"),
      rect: h1Rect,
      presentation,
    },
    section: {
      selector: sectionSelector,
      rect: sectionRect,
    },
    sectionClipBounds,
    clippingAncestors,
    usableClipBounds,
    occludingHeader,
    effectiveVisibleBounds,
    authoredLines,
    renderedLineUnions,
    glyphBounds,
    safeAllowances,
    boundaryAnalysis: {
      glyphEscapes,
      boundaryIntersections,
      safetyViolations,
      occludingHeaderIntersections: renderedLineUnions.flatMap((line) => (
        occludingHeader?.occluding && line.top < occludingHeader.effectiveBottom
          ? [{ authoredLineIndex: line.authoredLineIndex, renderedLineIndex: line.renderedLineIndex }]
          : []
      )),
    },
    horizontalOverflow: overflowPixels > 0,
    horizontalMetrics: {
      documentScrollWidth,
      bodyScrollWidth,
      maximumScrollWidth,
      clientWidth,
      viewportWidth: innerWidth,
      overflowPixels,
    },
  };
}

export const MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE = `(${measureManifestoGeometry.toString()})()`;

export function manifestoGeometryMeasurementSource() {
  return MANIFESTO_GEOMETRY_MEASUREMENT_SOURCE;
}

function invariant(condition, message) {
  if (!condition) throw new Error(`manifesto geometry: ${message}`);
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function assertRect(rect, label, { positive = true } = {}) {
  invariant(rect && typeof rect === "object", `${label} is missing`);
  for (const property of ["left", "top", "right", "bottom", "width", "height"]) {
    invariant(finite(rect[property]), `${label}.${property} must be finite`);
  }
  invariant(Math.abs(rect.width - (rect.right - rect.left)) <= 0.05, `${label}.width is inconsistent`);
  invariant(Math.abs(rect.height - (rect.bottom - rect.top)) <= 0.05, `${label}.height is inconsistent`);
  if (positive) invariant(rect.width > 0 && rect.height > 0, `${label} must have positive area`);
  return rect;
}

function rectUnion(rectangles) {
  return {
    left: Math.min(...rectangles.map(({ left }) => left)),
    top: Math.min(...rectangles.map(({ top }) => top)),
    right: Math.max(...rectangles.map(({ right }) => right)),
    bottom: Math.max(...rectangles.map(({ bottom }) => bottom)),
  };
}

function assertSameBounds(actual, expected, label) {
  for (const property of ["left", "top", "right", "bottom"]) {
    invariant(Math.abs(actual[property] - expected[property]) <= 0.05, `${label}.${property} differs from measured geometry`);
  }
}

function canonicalLine(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

/**
 * Validates measurement evidence without trusting its PASS-like summaries.
 * Missing, malformed, unresolved, wrapped, clipped, or overflowing evidence
 * throws and therefore cannot be promoted by a caller.
 */
export function validateManifestoGeometry(measurement) {
  invariant(measurement && typeof measurement === "object", "measurement is missing");
  invariant(measurement.schema === MANIFESTO_GEOMETRY_SCHEMA, "schema differs");
  invariant(measurement.measurementError === null, measurement.measurementError || "measurement did not complete");

  const viewportBounds = assertRect(measurement.viewport, "viewport");
  const expectedViewport = SHORT_LANDSCAPE_VIEWPORTS.find(({ width, height }) => (
    width === measurement.viewport.width && height === measurement.viewport.height
  ));
  invariant(expectedViewport, `viewport ${measurement.viewport.width}x${measurement.viewport.height} is outside the required short-landscape family`);
  invariant(measurement.viewport.id === expectedViewport.id, "viewport identifier differs");
  invariant(viewportBounds.left === 0 && viewportBounds.top === 0, "viewport origin differs");

  const resolvedOrStatic = measurement.state?.manifestoReveal === "resolved"
    || measurement.state?.cinematicMode === "static";
  invariant(resolvedOrStatic, "state must be resolved or static");
  invariant(measurement.state?.resolvedOrStatic === resolvedOrStatic, "resolved/static state summary differs");
  const presentation = measurement.h1?.presentation;
  const visiblyRendered = presentation?.display !== "none"
    && !["collapse", "hidden"].includes(presentation?.visibility)
    && finite(presentation?.opacity)
    && presentation.opacity > 0;
  invariant(visiblyRendered && presentation.visible === visiblyRendered, "manifesto H1 is not visibly rendered");

  const h1Rect = assertRect(measurement.h1?.rect, "H1 rectangle");
  assertRect(measurement.section?.rect, "Signal Field section rectangle");
  const sectionClipBounds = assertRect(measurement.sectionClipBounds, "Signal Field section clip bounds");
  invariant(Array.isArray(measurement.clippingAncestors), "clipping ancestor inventory is missing");
  invariant(measurement.clippingAncestors.length > 0, "clipping ancestor inventory is empty");
  for (const [index, ancestor] of measurement.clippingAncestors.entries()) {
    invariant(ancestor?.clipsX === true || ancestor?.clipsY === true, `clipping ancestor ${index + 1} has no clipping axis`);
    assertRect(ancestor.bounds, `clipping ancestor ${index + 1} bounds`);
  }
  invariant(measurement.clippingAncestors.some(({ isSignalFieldSection, clipsY }) => isSignalFieldSection === true && clipsY === true), "Signal Field section is absent from the vertical clipping inventory");

  const usableClipBounds = assertRect(measurement.usableClipBounds, "usable clip bounds");
  let expectedUsable = {
    left: Math.max(viewportBounds.left, sectionClipBounds.left),
    top: Math.max(viewportBounds.top, sectionClipBounds.top),
    right: Math.min(viewportBounds.right, sectionClipBounds.right),
    bottom: Math.min(viewportBounds.bottom, sectionClipBounds.bottom),
  };
  for (const ancestor of measurement.clippingAncestors) {
    if (ancestor.clipsX) {
      expectedUsable.left = Math.max(expectedUsable.left, ancestor.bounds.left);
      expectedUsable.right = Math.min(expectedUsable.right, ancestor.bounds.right);
    }
    if (ancestor.clipsY) {
      expectedUsable.top = Math.max(expectedUsable.top, ancestor.bounds.top);
      expectedUsable.bottom = Math.min(expectedUsable.bottom, ancestor.bounds.bottom);
    }
  }
  assertSameBounds(usableClipBounds, expectedUsable, "usable clip bounds");

  const occludingHeader = measurement.occludingHeader;
  invariant(occludingHeader?.selector === ".site-header", "stable occluding header selector differs");
  const occludingHeaderRect = assertRect(occludingHeader.rect, "occluding header rectangle");
  invariant(["fixed", "sticky"].includes(occludingHeader.position), "header is not fixed or sticky");
  const headerVisiblyRendered = occludingHeader.presentation?.display !== "none"
    && !["collapse", "hidden"].includes(occludingHeader.presentation?.visibility)
    && finite(occludingHeader.presentation?.opacity)
    && occludingHeader.presentation.opacity > 0;
  invariant(occludingHeader.presentation?.visible === headerVisiblyRendered, "header visibility authority differs");
  invariant(occludingHeader.anchoredToViewportTop === true, "header is not anchored to the viewport top");
  invariant(occludingHeader.horizontallyOverlapsManifesto === true, "header does not overlap the manifesto horizontal region");
  const expectedHeaderOcclusion = headerVisiblyRendered
    && occludingHeader.anchoredToViewportTop
    && occludingHeader.horizontallyOverlapsManifesto;
  invariant(occludingHeader.occluding === expectedHeaderOcclusion, "header occlusion authority differs");
  const expectedHeaderBottom = expectedHeaderOcclusion
    ? Math.min(viewportBounds.bottom, occludingHeaderRect.bottom)
    : viewportBounds.top;
  invariant(Math.abs(occludingHeader.effectiveBottom - expectedHeaderBottom) <= 0.05, "header effective bottom differs");

  const effectiveVisibleBounds = assertRect(measurement.effectiveVisibleBounds, "effective visible bounds");
  const expectedEffectiveVisible = {
    left: expectedUsable.left,
    top: Math.max(expectedUsable.top, expectedHeaderBottom),
    right: expectedUsable.right,
    bottom: expectedUsable.bottom,
  };
  assertSameBounds(effectiveVisibleBounds, expectedEffectiveVisible, "effective visible bounds");

  invariant(Array.isArray(measurement.authoredLines) && measurement.authoredLines.length === 3, "exactly 3 authored lines are required");
  const derivedRenderedLines = [];
  const allGlyphBoxes = [];
  measurement.authoredLines.forEach((line, index) => {
    const authoredLineIndex = index + 1;
    invariant(line?.authoredLineIndex === authoredLineIndex, `authored line ${authoredLineIndex} index differs`);
    invariant(canonicalLine(line.text) === canonicalLine(MANIFESTO_AUTHORED_LINES[index]), `authored line ${authoredLineIndex} text differs`);
    assertRect(line.elementRect, `authored line ${authoredLineIndex} element rectangle`);
    invariant(Array.isArray(line.glyphBoxes) && line.glyphBoxes.length > 0, `authored line ${authoredLineIndex} has no Range glyph boxes`);
    for (const [glyphIndex, glyphBox] of line.glyphBoxes.entries()) {
      assertRect(glyphBox, `authored line ${authoredLineIndex} glyph ${glyphIndex + 1}`);
      invariant(typeof glyphBox.glyph === "string" && /\S/u.test(glyphBox.glyph), `authored line ${authoredLineIndex} glyph ${glyphIndex + 1} is not glyph-bearing`);
      allGlyphBoxes.push(glyphBox);
    }
    invariant(Array.isArray(line.renderedLineUnions) && line.renderedLineUnions.length === 1, `authored line ${authoredLineIndex} must resolve to exactly 1 rendered line`);
    const rendered = assertRect(line.renderedLineUnions[0], `authored line ${authoredLineIndex} rendered union`);
    invariant(rendered.authoredLineIndex === authoredLineIndex && rendered.renderedLineIndex === 1, `authored line ${authoredLineIndex} rendered union index differs`);
    invariant(rendered.glyphCount === line.glyphBoxes.length, `authored line ${authoredLineIndex} rendered glyph count differs`);
    assertSameBounds(rendered, rectUnion(line.glyphBoxes), `authored line ${authoredLineIndex} rendered union`);
    assertSameBounds(assertRect(line.glyphBounds, `authored line ${authoredLineIndex} glyph bounds`), rectUnion(line.glyphBoxes), `authored line ${authoredLineIndex} glyph bounds`);
    derivedRenderedLines.push(rendered);
  });

  invariant(Array.isArray(measurement.renderedLineUnions) && measurement.renderedLineUnions.length === 3, "exactly 3 rendered line unions are required");
  measurement.renderedLineUnions.forEach((line, index) => {
    assertRect(line, `rendered line union ${index + 1}`);
    assertSameBounds(line, derivedRenderedLines[index], `rendered line union ${index + 1}`);
    if (index > 0) invariant(line.top > measurement.renderedLineUnions[index - 1].top, "rendered lines are not in distinct vertical positions");
  });
  const glyphBounds = assertRect(measurement.glyphBounds, "glyph bounds");
  assertSameBounds(glyphBounds, rectUnion(allGlyphBoxes), "glyph bounds");

  const safeAllowances = measurement.safeAllowances;
  invariant(safeAllowances?.minimumRequiredPx === MINIMUM_MANIFESTO_SAFETY_PX, "minimum safety authority differs");
  const computedH1Top = h1Rect.top - effectiveVisibleBounds.top;
  const computedH1Bottom = effectiveVisibleBounds.bottom - h1Rect.bottom;
  const computedGlyphTop = glyphBounds.top - effectiveVisibleBounds.top;
  const computedGlyphBottom = effectiveVisibleBounds.bottom - glyphBounds.bottom;
  invariant(Math.abs(safeAllowances.h1?.top - computedH1Top) <= 0.05, "H1 top allowance differs");
  invariant(Math.abs(safeAllowances.h1?.bottom - computedH1Bottom) <= 0.05, "H1 bottom allowance differs");
  invariant(Math.abs(safeAllowances.glyphs?.top - computedGlyphTop) <= 0.05, "glyph top allowance differs");
  invariant(Math.abs(safeAllowances.glyphs?.bottom - computedGlyphBottom) <= 0.05, "glyph bottom allowance differs");
  invariant(Array.isArray(safeAllowances.renderedLines) && safeAllowances.renderedLines.length === 3, "rendered-line allowance inventory differs");
  safeAllowances.renderedLines.forEach((allowance, index) => {
    const line = measurement.renderedLineUnions[index];
    invariant(allowance.authoredLineIndex === line.authoredLineIndex && allowance.renderedLineIndex === line.renderedLineIndex, `rendered line ${index + 1} allowance index differs`);
    invariant(Math.abs(allowance.top - (line.top - effectiveVisibleBounds.top)) <= 0.05, `rendered line ${index + 1} top allowance differs`);
    invariant(Math.abs(allowance.bottom - (effectiveVisibleBounds.bottom - line.bottom)) <= 0.05, `rendered line ${index + 1} bottom allowance differs`);
  });
  invariant(computedH1Top >= MINIMUM_MANIFESTO_SAFETY_PX, `H1 top safety is ${computedH1Top}px; at least 2px is required`);
  invariant(computedH1Bottom >= MINIMUM_MANIFESTO_SAFETY_PX, `H1 bottom safety is ${computedH1Bottom}px; at least 2px is required`);
  invariant(computedGlyphTop >= MINIMUM_MANIFESTO_SAFETY_PX, `glyph top safety is ${computedGlyphTop}px; at least 2px is required`);
  invariant(computedGlyphBottom >= MINIMUM_MANIFESTO_SAFETY_PX, `glyph bottom safety is ${computedGlyphBottom}px; at least 2px is required`);

  for (const [index, glyphBox] of allGlyphBoxes.entries()) {
    invariant(glyphBox.left > effectiveVisibleBounds.left && glyphBox.right < effectiveVisibleBounds.right, `glyph ${index + 1} intersects or escapes a horizontal clipping boundary`);
    invariant(glyphBox.top - effectiveVisibleBounds.top >= MINIMUM_MANIFESTO_SAFETY_PX, `glyph ${index + 1} intersects the top safety boundary`);
    invariant(effectiveVisibleBounds.bottom - glyphBox.bottom >= MINIMUM_MANIFESTO_SAFETY_PX, `glyph ${index + 1} intersects the bottom safety boundary`);
  }
  invariant(Array.isArray(measurement.boundaryAnalysis?.glyphEscapes) && measurement.boundaryAnalysis.glyphEscapes.length === 0, "glyph escape inventory is not empty");
  invariant(Array.isArray(measurement.boundaryAnalysis?.boundaryIntersections) && measurement.boundaryAnalysis.boundaryIntersections.length === 0, "glyph-bearing line intersects a clipping boundary");
  invariant(Array.isArray(measurement.boundaryAnalysis?.safetyViolations) && measurement.boundaryAnalysis.safetyViolations.length === 0, "glyph-bearing line violates the 2px safety allowance");
  invariant(Array.isArray(measurement.boundaryAnalysis?.occludingHeaderIntersections) && measurement.boundaryAnalysis.occludingHeaderIntersections.length === 0, "glyph-bearing line intersects the sticky header occlusion boundary");

  const horizontal = measurement.horizontalMetrics;
  for (const property of ["documentScrollWidth", "bodyScrollWidth", "maximumScrollWidth", "clientWidth", "viewportWidth", "overflowPixels"]) {
    invariant(finite(horizontal?.[property]) && horizontal[property] >= 0, `horizontalMetrics.${property} is invalid`);
  }
  invariant(horizontal.maximumScrollWidth === Math.max(horizontal.documentScrollWidth, horizontal.bodyScrollWidth), "maximum horizontal extent differs");
  invariant(horizontal.viewportWidth === measurement.viewport.width, "horizontal viewport width differs");
  invariant(horizontal.overflowPixels === Math.max(0, horizontal.maximumScrollWidth - horizontal.clientWidth), "horizontal overflow calculation differs");
  invariant(measurement.horizontalOverflow === false && horizontal.overflowPixels === 0, "horizontal overflow is present");
  return true;
}

export const validateManifestoGeometryMeasurement = validateManifestoGeometry;
