const CONTRACT_URL = "/artifacts/original/phase-0-3d-repair-v2/portal-layout.json";
const SCENES = Object.freeze({
  heroDesktop: "/artifacts/original/phase-0-3d-repair-v2/renders/hero/desktop-dormant-base.png",
  heroMobile: "/artifacts/original/phase-0-3d-repair-v2/renders/hero/mobile-dormant-base.png",
  portalResponsive: "/artifacts/original/phase-0-3d-repair-v2/renders/portal/physical-glass-base.png",
});

const HERO_ACTUAL = Object.freeze({
  eyebrow: "industrial innovation · herzliya",
  heading: "Prove it where it has to work.",
  wideLines: ["Prove it", "where it has", "to work."],
  mobileLines: ["Prove it", "where it has", "to work."],
  supporting:
    "Quantum brings industry and technology together to define real needs, test solutions and turn evidence into decisions.",
  audiences: ["For industry", "For startups"],
});

const HERO_LONG = Object.freeze({
  eyebrow: HERO_ACTUAL.eyebrow,
  heading: HERO_ACTUAL.heading,
  wideLines: HERO_ACTUAL.wideLines,
  mobileLines: HERO_ACTUAL.mobileLines,
  supporting:
    "Quantum brings industry and technology together to define real needs, test solutions in real conditions, and turn evidence into confident decisions.",
  audiences: HERO_ACTUAL.audiences,
});

const PORTAL_LONG = Object.freeze({
  signalLine: "test route available · operating context confirmed",
  eyebrow: "industrial innovation · herzliya · evidence operating surface",
  heading: "WHERE COULD YOUR TEAM ENTER?",
  wideLines: ["WHERE COULD YOUR TEAM ENTER?"],
  compactLines: ["WHERE COULD YOUR", "TEAM ENTER?"],
  route: ["Frame need", "Source route", "Assess fit", "Test evidence", "Decide next"],
  audiences: ["For industry teams", "For technology startups"],
});

const elements = {
  body: document.body,
  surfaceControl: document.querySelector("#surface-control"),
  fixtureControl: document.querySelector("#fixture-control"),
  zoomControl: document.querySelector("#zoom-control"),
  motionControl: document.querySelector("#motion-control"),
  focusCheck: document.querySelector("#focus-check"),
  status: document.querySelector("#qa-status"),
  reportNode: document.querySelector("#phase02-report"),
  scene: document.querySelector("#scene-image"),
  hero: document.querySelector("#hero-compositor"),
  heroEyebrow: document.querySelector("#hero-eyebrow"),
  heroHeading: document.querySelector("#hero-heading"),
  heroSupporting: document.querySelector("#hero-supporting"),
  heroIndustry: document.querySelector("#hero-industry"),
  heroStartups: document.querySelector("#hero-startups"),
  portal: document.querySelector("#portal-compositor"),
  portalLayer: document.querySelector("#portal-contract-layer"),
  portalBrand: document.querySelector("#portal-brand"),
  portalSignal: document.querySelector("#portal-signal"),
  portalEyebrow: document.querySelector("#portal-eyebrow"),
  portalHeading: document.querySelector("#portal-heading"),
  portalRoute: document.querySelector("#portal-route"),
  portalIndustry: document.querySelector("#portal-industry"),
  portalStartups: document.querySelector("#portal-startups"),
  portalDivider: document.querySelector(".audience-divider"),
  lineTemplate: document.querySelector("#line-template"),
};

const query = new URLSearchParams(window.location.search);
const state = {
  surface: query.get("surface") === "portal" ? "portal" : "hero",
  fixture: query.get("fixture") === "long" ? "long" : "actual",
  textZoom: query.get("zoom") === "200" ? 200 : 100,
  reduced:
    query.get("motion") === "reduce" ||
    (query.get("motion") !== "no-preference" && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  captureChrome: query.get("chrome") !== "0",
};

let contract;
let contractHash;
let auditSequence = 0;

function renderLines(target, lines) {
  target.replaceChildren();
  for (const text of lines) {
    const fragment = elements.lineTemplate.content.cloneNode(true);
    fragment.querySelector(".heading-line").textContent = text;
    target.append(fragment);
  }
}

function referenceProjectionMode() {
  if (!contract || state.surface !== "portal" || state.fixture !== "actual" || state.textZoom !== 100 || state.reduced) {
    return false;
  }
  const reference = contract.coordinateSystem.referenceViewport;
  const referenceAspect = reference.width / reference.height;
  const viewportAspect = window.innerWidth / window.innerHeight;
  return window.innerWidth >= 1024 && Math.abs(viewportAspect - referenceAspect) <= 0.001;
}

function compactMode() {
  return !referenceProjectionMode();
}

function mobileMode() {
  return window.innerWidth < 600;
}

function heroSceneLayoutMode() {
  if (window.innerWidth < 900 && window.innerHeight > window.innerWidth) return "portrait";
  if (window.innerHeight <= 450) return "short-landscape";
  return "wide";
}

function authoredMobileSceneMode() {
  return heroSceneLayoutMode() === "portrait";
}

function heroFixture() {
  return state.fixture === "long" ? HERO_LONG : HERO_ACTUAL;
}

function portalFixture() {
  if (state.fixture === "long") return PORTAL_LONG;
  return {
    signalLine: contract.copy.signalLine,
    eyebrow: contract.copy.eyebrow,
    heading: contract.copy.heading,
    wideLines: contract.copy.headingLinesReference,
    compactLines: contract.copy.headingLinesCompact,
    route: contract.copy.route,
    audiences: contract.copy.audiences,
  };
}

function sceneForState() {
  if (state.surface === "portal" && !state.reduced) {
    return SCENES.portalResponsive;
  }
  return authoredMobileSceneMode() ? SCENES.heroMobile : SCENES.heroDesktop;
}

function waitForScene() {
  if (elements.scene.complete && elements.scene.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Phase 0.2 scene image timed out")), 30_000);
    elements.scene.addEventListener(
      "load",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    elements.scene.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        reject(new Error(`Phase 0.2 scene image failed to load: ${elements.scene.src}`));
      },
      { once: true },
    );
  });
}

function applyRegionGeometry() {
  for (const node of document.querySelectorAll("[data-region]")) {
    const region = contract.regions[node.dataset.region];
    if (!region) continue;
    Object.assign(node.style, {
      left: `${region.x}px`,
      top: `${region.y}px`,
      width: `${region.width}px`,
      height: `${region.height}px`,
    });
  }
  const audience = contract.regions.audience;
  elements.portalDivider.style.height = `${audience.dividerY2 - audience.dividerY1}px`;
}

function applyContractProjection() {
  if (!referenceProjectionMode()) {
    elements.portalLayer.style.removeProperty("transform");
    return;
  }
  const reference = contract.coordinateSystem.referenceViewport;
  const scale = Math.max(window.innerWidth / reference.width, window.innerHeight / reference.height);
  const offsetX = (window.innerWidth - reference.width * scale) / 2;
  const offsetY = (window.innerHeight - reference.height * scale) / 2;
  elements.portalLayer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

function renderState() {
  elements.body.dataset.surface = state.surface;
  elements.body.dataset.fixture = state.fixture;
  elements.body.dataset.textZoom = String(state.textZoom);
  elements.body.dataset.reduced = String(state.reduced);
  elements.body.dataset.captureChrome = String(state.captureChrome);
  elements.body.dataset.portalProjection = referenceProjectionMode() ? "reference" : "responsive";
  elements.body.dataset.heroSceneLayout = heroSceneLayoutMode();
  elements.surfaceControl.value = state.surface;
  elements.fixtureControl.value = state.fixture;
  elements.zoomControl.value = String(state.textZoom);
  elements.motionControl.checked = state.reduced;

  elements.hero.hidden = state.surface !== "hero";
  elements.portal.hidden = state.surface !== "portal";
  elements.scene.src = sceneForState();

  const hero = heroFixture();
  elements.heroEyebrow.textContent = hero.eyebrow;
  elements.heroHeading.setAttribute("aria-label", hero.heading);
  renderLines(elements.heroHeading, mobileMode() ? hero.mobileLines : hero.wideLines);
  elements.heroSupporting.textContent = hero.supporting;
  [elements.heroIndustry.textContent, elements.heroStartups.textContent] = hero.audiences;

  const portal = portalFixture();
  elements.portalBrand.textContent = contract.copy.brand;
  elements.portalSignal.textContent = portal.signalLine;
  elements.portalEyebrow.textContent = portal.eyebrow;
  elements.portalHeading.setAttribute("aria-label", portal.heading);
  renderLines(elements.portalHeading, compactMode() ? portal.compactLines : portal.wideLines);
  elements.portalRoute.replaceChildren(
    ...portal.route.map((label) => {
      const item = document.createElement("li");
      item.textContent = label;
      return item;
    }),
  );
  [elements.portalIndustry.textContent, elements.portalStartups.textContent] = portal.audiences;

  applyRegionGeometry();
  applyContractProjection();
}

function updateQuery(next) {
  const params = new URLSearchParams(window.location.search);
  params.set("surface", next.surface);
  params.set("fixture", next.fixture);
  params.set("zoom", String(next.textZoom));
  params.set("motion", next.reduced ? "reduce" : "no-preference");
  params.set("chrome", next.captureChrome ? "1" : "0");
  window.location.search = params.toString();
}

function visible(node) {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== "hidden";
}

function overlap(a, b) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0.75 && height > 0.75 ? { width, height, area: width * height } : null;
}

function collisionReport() {
  const nodes = [...document.querySelectorAll("[data-collision]")].filter(visible);
  const collisions = [];
  for (let first = 0; first < nodes.length; first += 1) {
    for (let second = first + 1; second < nodes.length; second += 1) {
      const intersection = overlap(nodes[first].getBoundingClientRect(), nodes[second].getBoundingClientRect());
      if (!intersection) continue;
      collisions.push({
        first: nodes[first].dataset.collision,
        second: nodes[second].dataset.collision,
        overlapWidthPx: Number(intersection.width.toFixed(3)),
        overlapHeightPx: Number(intersection.height.toFixed(3)),
      });
    }
  }
  return collisions;
}

function renderedLineCount(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const tops = [];
  while (walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) {
      if (rect.width > 0 && rect.height > 0 && !tops.some((top) => Math.abs(top - rect.top) <= 2)) tops.push(rect.top);
    }
  }
  return tops.length;
}

function copyLength(fixture) {
  return Object.values(fixture)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value === "string")
    .join(" ")
    .replaceAll(/\s+/g, " ")
    .trim().length;
}

function fixtureRatio() {
  if (state.surface === "hero") return HERO_LONG.supporting.length / HERO_ACTUAL.supporting.length;
  const actual = {
    signalLine: contract.copy.signalLine,
    eyebrow: contract.copy.eyebrow,
    heading: contract.copy.heading,
    route: contract.copy.route,
    audiences: contract.copy.audiences,
  };
  const longer = {
    signalLine: PORTAL_LONG.signalLine,
    eyebrow: PORTAL_LONG.eyebrow,
    heading: PORTAL_LONG.heading,
    route: PORTAL_LONG.route,
    audiences: PORTAL_LONG.audiences,
  };
  return copyLength(longer) / copyLength(actual);
}

function ruleSafetyReport() {
  const clearance = contract.acceptance.glyphRuleClearancePx;
  const results = [];
  for (const rule of contract.decorativeRules) {
    const rx1 = Math.min(rule.x1, rule.x2);
    const rx2 = Math.max(rule.x1, rule.x2);
    const ry1 = Math.min(rule.y1, rule.y2);
    const ry2 = Math.max(rule.y1, rule.y2);
    for (const [glyph, bounds] of Object.entries(contract.glyphBounds)) {
      const intersects =
        rx2 >= bounds.x - clearance &&
        rx1 <= bounds.x + bounds.width + clearance &&
        ry2 >= bounds.y - clearance &&
        ry1 <= bounds.y + bounds.height + clearance;
      results.push({ rule: rule.id, glyph, intersectsExpandedGlyphBounds: intersects });
    }
  }
  return results;
}

function contractAnchorReport() {
  if (!referenceProjectionMode()) {
    return { applicable: false, reason: "non-16:10 or stress state uses responsive DOM flow" };
  }
  const reference = contract.coordinateSystem.referenceViewport;
  const scale = Math.max(window.innerWidth / reference.width, window.innerHeight / reference.height);
  const offsetX = (window.innerWidth - reference.width * scale) / 2;
  const offsetY = (window.innerHeight - reference.height * scale) / 2;
  const measurements = [
    ["navBaseline", document.querySelector(".portal-nav"), contract.regions.navigation],
    ["signalLineBaseline", elements.portalSignal, contract.regions.signalLine],
    ["eyebrowBaseline", elements.portalEyebrow, contract.regions.eyebrow],
    ["h1TopLeft", elements.portalHeading, contract.regions.heading],
    ["routeBaseline", elements.portalRoute, contract.regions.route],
    ["audienceRegionTopLeft", document.querySelector(".portal-audience"), contract.regions.audience],
  ].map(([id, node, region]) => {
    const anchor = contract.anchors[id];
    const rect = node.getBoundingClientRect();
    const expectedX = offsetX + anchor.x * scale;
    const expectedY = offsetY + anchor.y * scale;
    const actualX = rect.left + (anchor.x - region.x) * scale;
    const actualY = rect.top + (anchor.y - region.y) * scale;
    const delta = Math.hypot(actualX - expectedX, actualY - expectedY);
    return {
      id,
      expected: { x: Number(expectedX.toFixed(3)), y: Number(expectedY.toFixed(3)) },
      actual: { x: Number(actualX.toFixed(3)), y: Number(actualY.toFixed(3)) },
      deltaPx: Number(delta.toFixed(3)),
      pass: delta <= contract.acceptance.maximumAnchorDeltaPx,
    };
  });
  return {
    applicable: true,
    tolerancePx: contract.acceptance.maximumAnchorDeltaPx,
    measurements,
    maximumDeltaPx: Math.max(...measurements.map((item) => item.deltaPx)),
    pass: measurements.every((item) => item.pass),
  };
}

function focusReport() {
  const focusables = [...document.querySelectorAll("#review-surface button")].filter(visible);
  const previous = document.activeElement;
  const results = focusables.map((node) => {
    node.focus({ preventScroll: true });
    const style = getComputedStyle(node);
    const width = Number.parseFloat(style.outlineWidth);
    return {
      id: node.id,
      outlineStyle: style.outlineStyle,
      outlineWidthPx: Number.isFinite(width) ? width : 0,
      outlineColor: style.outlineColor,
      pass: style.outlineStyle !== "none" && Number.isFinite(width) && width >= 2,
    };
  });
  if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
  else elements.reviewSurface?.focus({ preventScroll: true });
  return { results, pass: results.length >= 2 && results.every((item) => item.pass) };
}

function lineCountExpectation() {
  const base =
    state.surface === "hero"
      ? state.fixture === "actual"
        ? 3
        : mobileMode()
          ? 3
          : 2
      : compactMode()
        ? 2
        : 1;
  const extra = (state.fixture === "long" ? 2 : 0) + (state.textZoom === 200 ? 4 : 0);
  return { minimum: base, maximum: base + extra };
}

function layoutViewportSize() {
  const root = document.documentElement;
  return {
    width: root.clientWidth || window.innerWidth,
    height: root.clientHeight || window.innerHeight,
  };
}

function dividerGeometryReport() {
  if (state.surface !== "portal") return { applicable: false, pass: true };
  const rect = elements.portalDivider.getBoundingClientRect();
  const horizontal = state.textZoom === 200 || window.innerWidth < 600;
  const thicknessPx = horizontal ? rect.height : rect.width;
  const lengthPx = horizontal ? rect.width : rect.height;
  return {
    applicable: true,
    orientation: horizontal ? "horizontal" : "vertical",
    widthPx: Number(rect.width.toFixed(3)),
    heightPx: Number(rect.height.toFixed(3)),
    thicknessPx: Number(thicknessPx.toFixed(3)),
    lengthPx: Number(lengthPx.toFixed(3)),
    pass: thicknessPx <= 1.5 && lengthPx >= 44,
  };
}

function horizontalBoundsReport() {
  const visibleBlocks = [...document.querySelectorAll("#review-surface .layout-block")].filter(visible);
  const tolerance = 1;
  const viewport = layoutViewportSize();
  return visibleBlocks.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      id: node.dataset.collision,
      leftPx: Number(rect.left.toFixed(3)),
      rightPx: Number(rect.right.toFixed(3)),
      pass: rect.left >= -tolerance && rect.right <= viewport.width + tolerance,
    };
  });
}

function textBlockId(node, index) {
  if (node.id) return node.id;
  const owner = node.closest("[data-collision]")?.dataset.collision;
  const role = [...node.classList].find((name) => !["layout-block", "contract-position"].includes(name));
  return [owner, role, index].filter((value) => value !== undefined).join(":");
}

function textOverflowReport() {
  const selector = [
    ".brand",
    ".review-boundary",
    ".eyebrow",
    ".hero-heading",
    ".hero-supporting",
    ".audience-actions button",
    ".portal-signal",
    ".portal-heading",
    ".portal-route li",
    ".portal-audience button",
  ].join(",");
  const nodes = [...document.querySelectorAll(`#review-surface ${selector}`)].filter(visible);
  const viewportTolerance = 1;
  const viewport = layoutViewportSize();
  const blocks = nodes.map((node, index) => {
    const id = textBlockId(node, index);
    const rect = node.getBoundingClientRect();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (textNode) =>
        textNode.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const glyphRectangles = [];
    while (walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const glyphRect of range.getClientRects()) {
        if (glyphRect.width <= 0 || glyphRect.height <= 0) continue;
        glyphRectangles.push({
          leftPx: Number(glyphRect.left.toFixed(3)),
          rightPx: Number(glyphRect.right.toFixed(3)),
          topPx: Number(glyphRect.top.toFixed(3)),
          bottomPx: Number(glyphRect.bottom.toFixed(3)),
          viewportPass:
            glyphRect.left >= -viewportTolerance && glyphRect.right <= viewport.width + viewportTolerance,
        });
      }
    }
    const scrollOverflow = node.scrollWidth > node.clientWidth + 1;
    const glyphOverflow = glyphRectangles.some((glyph) => !glyph.viewportPass);
    return {
      id,
      clientWidthPx: node.clientWidth,
      scrollWidthPx: node.scrollWidth,
      blockBounds: {
        leftPx: Number(rect.left.toFixed(3)),
        rightPx: Number(rect.right.toFixed(3)),
      },
      glyphRectangles,
      scrollOverflow,
      glyphOverflow,
      pass: !scrollOverflow && !glyphOverflow,
    };
  });
  return {
    blocks,
    offenders: blocks.filter((block) => !block.pass).map((block) => block.id),
    pass: blocks.length > 0 && blocks.every((block) => block.pass),
  };
}

function sceneSafetyReport() {
  const portalReduced = state.surface === "portal" && state.reduced;
  if (state.surface !== "hero" && !portalReduced) {
    return {
      applicable: false,
      reason: "source-derived Field Unit/cable keepouts apply to every hero state and reduced-portal stress state",
    };
  }
  const viewport = layoutViewportSize();
  const baseLayoutMode = heroSceneLayoutMode();
  const stressDisplaced = portalReduced || state.textZoom === 200 || state.fixture === "long";
  const mode = portalReduced ? "portal-reduced-displaced" : stressDisplaced ? "stress-displaced" : baseLayoutMode;
  const mobileScene = baseLayoutMode === "portrait";
  const source = mobileScene ? SCENES.heroMobile : SCENES.heroDesktop;
  const sourceSize = mobileScene ? { width: 720, height: 1600 } : { width: 1920, height: 1200 };
  const sourceFeatures = mobileScene
    ? {
        fieldUnit: { left: 0, top: 475, right: 720, bottom: 930 },
        spiralCable: { left: 0, top: 880, right: 720, bottom: 1370 },
      }
    : {
        fieldUnit: { left: 830, top: 575, right: 1700, bottom: 895 },
        spiralCable: { left: 20, top: 650, right: 1910, bottom: 1160 },
      };
  const sceneCrop = document.querySelector(".scene-crop");
  const cropRect = sceneCrop.getBoundingClientRect();
  const imageStyle = getComputedStyle(elements.scene);
  const fitScale = imageStyle.objectFit === "contain"
    ? Math.min(cropRect.width / sourceSize.width, cropRect.height / sourceSize.height)
    : Math.max(cropRect.width / sourceSize.width, cropRect.height / sourceSize.height);
  const renderedSource = {
    width: sourceSize.width * fitScale,
    height: sourceSize.height * fitScale,
  };
  const objectPositionTokens = imageStyle.objectPosition.split(/\s+/);
  const positionFraction = (token, fallback) => {
    if (!token?.endsWith("%")) return fallback;
    const value = Number.parseFloat(token);
    return Number.isFinite(value) ? value / 100 : fallback;
  };
  const objectPosition = {
    x: positionFraction(objectPositionTokens[0], 0.5),
    y: positionFraction(objectPositionTokens[1], mobileScene ? 1 : 0.48),
  };
  const contentOffset = {
    x: (cropRect.width - renderedSource.width) * objectPosition.x,
    y: (cropRect.height - renderedSource.height) * objectPosition.y,
  };
  const transform = imageStyle.transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(imageStyle.transform);
  const transformOrigin = imageStyle.transformOrigin.split(" ").slice(0, 2).map((value) => Number.parseFloat(value));
  const mapPoint = (x, y) => {
    const local = new DOMPoint(x - transformOrigin[0], y - transformOrigin[1]).matrixTransform(transform);
    return {
      x: cropRect.left + transformOrigin[0] + local.x,
      y: cropRect.top + transformOrigin[1] + local.y,
    };
  };
  const projectFeature = (bounds) => {
    const left = contentOffset.x + bounds.left * fitScale;
    const top = contentOffset.y + bounds.top * fitScale;
    const right = contentOffset.x + bounds.right * fitScale;
    const bottom = contentOffset.y + bounds.bottom * fitScale;
    const corners = [mapPoint(left, top), mapPoint(right, top), mapPoint(right, bottom), mapPoint(left, bottom)];
    const projected = {
      leftPx: Number(Math.min(...corners.map((point) => point.x)).toFixed(3)),
      topPx: Number(Math.min(...corners.map((point) => point.y)).toFixed(3)),
      rightPx: Number(Math.max(...corners.map((point) => point.x)).toFixed(3)),
      bottomPx: Number(Math.max(...corners.map((point) => point.y)).toFixed(3)),
    };
    const visible = {
      leftPx: Number(Math.max(0, projected.leftPx).toFixed(3)),
      topPx: Number(Math.max(0, projected.topPx).toFixed(3)),
      rightPx: Number(Math.min(viewport.width, projected.rightPx).toFixed(3)),
      bottomPx: Number(Math.min(viewport.height, projected.bottomPx).toFixed(3)),
    };
    return {
      projected,
      visible,
      outsideViewport:
        projected.rightPx <= 0 ||
        projected.leftPx >= viewport.width ||
        projected.bottomPx <= 0 ||
        projected.topPx >= viewport.height,
    };
  };
  const keepouts = [
    { id: "field-unit", sourceBounds: sourceFeatures.fieldUnit, ...projectFeature(sourceFeatures.fieldUnit) },
    { id: "spiral-cable", sourceBounds: sourceFeatures.spiralCable, ...projectFeature(sourceFeatures.spiralCable) },
  ];
  const clearancePx = 16;
  const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, viewport.height);
  const allowedRegion = {
    leftPx: 0,
    topPx: 0,
    rightPx:
      stressDisplaced || baseLayoutMode === "portrait"
        ? viewport.width
        : Number(Math.max(0, keepouts[0].projected.leftPx - clearancePx).toFixed(3)),
    bottomPx:
      stressDisplaced
        ? documentHeight
        : baseLayoutMode === "portrait"
        ? Number(
            Math.max(0, Math.min(keepouts[0].projected.topPx, keepouts[1].projected.topPx) - clearancePx).toFixed(3),
          )
        : viewport.height,
  };
  const nodes = portalReduced
    ? [
        ["portal-signal", elements.portalSignal],
        ["portal-eyebrow", elements.portalEyebrow],
        ["portal-heading", elements.portalHeading],
        ["portal-route", elements.portalRoute],
        ["portal-audience", document.querySelector("#portal-compositor .portal-audience")],
      ]
    : [
        ["hero-eyebrow", elements.heroEyebrow],
        ["hero-heading", elements.heroHeading],
        ["hero-supporting", elements.heroSupporting],
        ["hero-audiences", document.querySelector("#hero-compositor .audience-actions")],
      ];
  const tolerance = 1;
  const blocks = nodes.map(([id, node]) => {
    const rect = node.getBoundingClientRect();
    const intersections = keepouts
      .filter(({ projected }) =>
        rect.right > projected.leftPx - clearancePx &&
        rect.left < projected.rightPx + clearancePx &&
        rect.bottom > projected.topPx - clearancePx &&
        rect.top < projected.bottomPx + clearancePx,
      )
      .map(({ id }) => id);
    const withinAllowedRegion =
      rect.left >= allowedRegion.leftPx - tolerance &&
      rect.top >= allowedRegion.topPx - tolerance &&
      rect.right <= allowedRegion.rightPx + tolerance &&
      rect.bottom <= allowedRegion.bottomPx + tolerance;
    return {
      id,
      leftPx: Number(rect.left.toFixed(3)),
      topPx: Number(rect.top.toFixed(3)),
      rightPx: Number(rect.right.toFixed(3)),
      bottomPx: Number(rect.bottom.toFixed(3)),
      withinAllowedRegion,
      intersectingKeepouts: intersections,
      pass: withinAllowedRegion && intersections.length === 0,
    };
  });
  return {
    applicable: true,
    mode,
    baseLayoutMode,
    geometryStrategy:
      portalReduced
        ? "dormant decorative scene translated beyond its isolated crop so reduced-portal semantic copy owns the frame"
        : stressDisplaced
        ? "decorative scene translated fully outside its clipped review crop; enlarged or longer text remains unchanged"
        : baseLayoutMode === "portrait"
        ? "authored mobile scene translated below a compact semantic copy flow"
        : "frozen scene scaled and translated toward the right while semantic copy reflows in the quiet-left field",
    sourceScene: source,
    calibration: "source-pixel feature bounds projected through the live object-fit and CSS transform",
    clearancePx,
    sourceSize,
    objectFit: imageStyle.objectFit,
    objectPosition: imageStyle.objectPosition,
    allowedRegion,
    keepouts,
    blocks,
    sceneComputedTransform: getComputedStyle(elements.scene).transform,
    pass:
      keepouts.every(({ projected }) => projected.rightPx > projected.leftPx && projected.bottomPx > projected.topPx) &&
      (stressDisplaced
        ? keepouts.every(({ outsideViewport }) => outsideViewport)
        : keepouts.every(
            ({ visible }) => visible.rightPx > visible.leftPx && visible.bottomPx > visible.topPx,
          )) &&
      blocks.length === (portalReduced ? 5 : 4) &&
      blocks.every((block) => block.pass),
  };
}

async function runAudit() {
  const sequence = ++auditSequence;
  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (sequence !== auditSequence) return window.phase02TypographyReport;

  const heading = state.surface === "hero" ? elements.heroHeading : elements.portalHeading;
  const collisions = collisionReport();
  const lineCount = renderedLineCount(heading);
  const expectedLines = lineCountExpectation();
  const buttons = [...document.querySelectorAll("#review-surface button")].filter(visible).map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      id: node.id,
      widthPx: Number(rect.width.toFixed(3)),
      heightPx: Number(rect.height.toFixed(3)),
      pass: rect.width >= 44 && rect.height >= 44,
    };
  });
  const ruleSafety = ruleSafetyReport();
  const anchors = contractAnchorReport();
  const focus = focusReport();
  const horizontalBounds = horizontalBoundsReport();
  const textOverflow = textOverflowReport();
  const sceneSafety = sceneSafetyReport();
  const divider = dividerGeometryReport();
  const route = document.querySelector("#portal-route");
  const routeOverflow = state.surface === "portal" && visible(route) ? route.scrollWidth > route.clientWidth + 1 : false;
  const fixtureLongRatio = Number(fixtureRatio().toFixed(3));
  const sceneReady = elements.scene.complete && elements.scene.naturalWidth > 0;
  const computedHeading = getComputedStyle(heading);
  const hasAnimatedMedia = Boolean(document.querySelector("video, canvas, [data-cinematic-sequence]"));
  const root = document.documentElement;
  const layoutViewport = layoutViewportSize();
  const documentScrollWidth = Math.max(root.scrollWidth, document.body.scrollWidth);
  const pageHorizontalOverflow = documentScrollWidth > layoutViewport.width + 1;
  const portalReferenceProjection = referenceProjectionMode();
  const scenePath = new URL(elements.scene.currentSrc || elements.scene.src).pathname;
  const sceneClassification =
    state.surface !== "portal"
      ? state.reduced
        ? "dormant reduced-motion scene"
        : "hero scene"
      : portalReferenceProjection
        ? "dom-owned crossover over text-free physical glass"
        : state.reduced
          ? "dormant reduced-motion scene"
          : "text-free physical glass base for responsive DOM flow";
  const allowedPortalScene = state.reduced
    ? mobileMode()
      ? SCENES.heroMobile
      : SCENES.heroDesktop
    : SCENES.portalResponsive;
  const doubledCopyPass = state.surface !== "portal" || scenePath === allowedPortalScene;

  const report = {
    schema: "quantum-hub.phase-0-3d-repair-v2.typography-collision-browser-report.v1",
    harness: "phase-0-portal-layout-qa",
    contract: {
      path: "artifacts/original/phase-0-3d-repair-v2/portal-layout.json",
      schema: contract.schema,
      sha256: contractHash,
    },
    state: { ...state },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      layoutWidth: layoutViewport.width,
      layoutHeight: layoutViewport.height,
      documentScrollWidth,
      inlineScrollbarWidth: Math.max(0, window.innerWidth - layoutViewport.width),
      devicePixelRatio: window.devicePixelRatio,
      orientation: window.innerWidth >= window.innerHeight ? "landscape" : "portrait",
    },
    fonts: {
      mode: "forced metric-conscious fallback",
      headingComputedFamily: computedHeading.fontFamily,
      displayFallback: contract.typography.display.fallback,
      editorialFallback: contract.typography.editorial.fallback,
      uiFallback: contract.typography.ui.fallback,
    },
    copy: {
      heading: heading.getAttribute("aria-label"),
      renderedLineCount: lineCount,
      expectedLineCount: expectedLines,
      lineCountPass: lineCount >= expectedLines.minimum && lineCount <= expectedLines.maximum,
      longFixtureRatio: fixtureLongRatio,
      longFixturePass: state.fixture !== "long" || fixtureLongRatio >= 1.25,
    },
    layout: {
      collisions,
      collisionPass: collisions.length === 0,
      pageHorizontalOverflow,
      routeHorizontalOverflow: routeOverflow,
      horizontalBounds,
      horizontalBoundsPass: horizontalBounds.every((item) => item.pass),
      textOverflow,
      textOverflowPass: textOverflow.pass,
      buttons,
      buttonPass: buttons.length >= 2 && buttons.every((item) => item.pass),
      anchors,
      projection: {
        mode: portalReferenceProjection ? "reference-cover" : "responsive-dom-flow",
        contractStrategy: contract.coordinateSystem.projection.strategy,
        exactReferenceAspect: portalReferenceProjection,
      },
      ruleSafety,
      ruleSafetyPass: ruleSafety.every((item) => !item.intersectsExpandedGlyphBounds),
      divider,
      dividerPass: divider.pass,
      sceneSafety,
    },
    accessibility: {
      focus,
      reducedMotionRequested: state.reduced,
      hasAnimatedMedia,
      reducedMotionPass: !state.reduced || !hasAnimatedMedia,
      semanticHeading: heading.tagName === "H1",
      sceneDecorative: elements.scene.getAttribute("alt") === "",
    },
    assets: {
      scene: scenePath,
      sceneClassification,
      doubledCopyPass,
      sceneReady,
      sceneNaturalWidth: elements.scene.naturalWidth,
      sceneNaturalHeight: elements.scene.naturalHeight,
    },
  };

  report.pass =
    report.copy.lineCountPass &&
    report.copy.longFixturePass &&
    report.layout.collisionPass &&
    !report.layout.pageHorizontalOverflow &&
    !report.layout.routeHorizontalOverflow &&
    report.layout.horizontalBoundsPass &&
    report.layout.textOverflowPass &&
    report.layout.buttonPass &&
    report.layout.ruleSafetyPass &&
    report.layout.dividerPass &&
    (report.layout.sceneSafety.applicable === false || report.layout.sceneSafety.pass) &&
    report.assets.doubledCopyPass &&
    (report.layout.anchors.applicable === false || report.layout.anchors.pass) &&
    report.accessibility.focus.pass &&
    report.accessibility.reducedMotionPass &&
    report.accessibility.semanticHeading &&
    report.accessibility.sceneDecorative &&
    report.assets.sceneReady;

  window.phase02TypographyReport = report;
  elements.reportNode.textContent = JSON.stringify(report);
  elements.body.dataset.qaPass = String(report.pass);
  elements.status.textContent = report.pass
    ? `PASS · ${window.innerWidth}×${window.innerHeight} · ${state.surface} · ${state.fixture}`
    : `REVIEW · ${collisions.length} collisions · overflow ${pageHorizontalOverflow || routeOverflow ? "yes" : "no"}`;
  return report;
}

async function loadContract() {
  const response = await fetch(CONTRACT_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Shared portal contract failed to load (${response.status})`);
  const source = await response.text();
  contract = JSON.parse(source);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  contractHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  renderState();
  await waitForScene();
  elements.body.dataset.ready = "true";
  return runAudit();
}

for (const control of [elements.surfaceControl, elements.fixtureControl, elements.zoomControl, elements.motionControl]) {
  control.addEventListener("change", () => {
    updateQuery({
      ...state,
      surface: elements.surfaceControl.value,
      fixture: elements.fixtureControl.value,
      textZoom: Number(elements.zoomControl.value),
      reduced: elements.motionControl.checked,
    });
  });
}

elements.focusCheck.addEventListener("click", async () => {
  const report = await runAudit();
  elements.status.textContent = report.accessibility.focus.pass ? "PASS · visible focus" : "REVIEW · focus evidence failed";
});

window.addEventListener("resize", () => {
  if (!contract) return;
  renderState();
  void runAudit();
});

window.runPhase02TypographyCheck = runAudit;
window.phase02Ready = loadContract().catch((error) => {
  elements.body.dataset.ready = "error";
  elements.status.textContent = error.message;
  throw error;
});
