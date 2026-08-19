const CONTRACT_URL = "/artifacts/original/phase-0-4-crt-television/crt-portal-layout.json";
const PLAN_URL = "./capture-plan.json";
const KEEP_OUT_SCHEMA = "quantum-hub.phase-0-4-crt-television.scene-source-keepouts.v1";
const KEEP_OUT_LAYOUT_AUTHORITY_PATH = "crt-portal-layout.json";
const REPORT_SCHEMA = "quantum-hub.phase-0-4-crt-television.typography-collision-browser-report.v1";
const MINIMUM_SCENE_CLEARANCE = 16;
const MAXIMUM_ANCHOR_DELTA = 3;
const REFERENCE_HEADING_GLYPH_CLEARANCE = 6;
const EXPECTED_SOURCE_IDS = Object.freeze([
  "source-desktop-dormant",
  "source-mobile-dormant",
  "source-reduced-desktop-dormant",
  "source-reduced-mobile-dormant",
  "source-physical-portal-close",
  "source-text-free-portal-takeover",
]);
const POST_BEZEL_TAKEOVER_SOURCE_ID = "source-text-free-portal-takeover";
const POST_BEZEL_GEOMETRY_IDS = Object.freeze(["crt-cabinet", "crt-screen", "spiral-cable"]);

const COPY = Object.freeze({
  hero: {
    eyebrow: "industrial innovation · herzliya",
    heading: "Prove it where it has to work.",
    support:
      "Quantum brings industry and technology together to define real needs, test solutions and turn evidence into decisions.",
    longSupport:
      "Quantum brings industry and technology together to define real needs, test solutions in real conditions, and turn evidence into confident decisions.",
    audiences: ["For industry", "For startups"],
  },
  portal: {
    brand: "Quantum-Hub",
    signal: "test route available",
    eyebrow: "industrial innovation · herzliya",
    heading: "WHERE DO YOU ENTER?",
    route: ["Frame", "Source", "Assess", "Test", "Decide"],
    audiences: ["For industry", "For startups"],
    longAudiences: ["For industry teams", "For technology startups"],
  },
});

const params = new URLSearchParams(window.location.search);
const state = {
  surface: params.get("surface") === "portal" ? "portal" : "hero",
  fixture: params.get("fixture") === "long" ? "long" : "actual",
  textZoom: params.get("zoom") === "200" ? 200 : 100,
  motion: params.get("motion") === "reduce" ? "reduce" : "no-preference",
  fontMode: params.get("font") === "fallback" ? "fallback" : "normal",
  chrome: params.get("chrome") !== "0",
};

const elements = {
  body: document.body,
  surfaceControl: document.querySelector("#surface-control"),
  fixtureControl: document.querySelector("#fixture-control"),
  zoomControl: document.querySelector("#zoom-control"),
  fontControl: document.querySelector("#font-control"),
  motionControl: document.querySelector("#motion-control"),
  focusCheck: document.querySelector("#focus-check"),
  status: document.querySelector("#qa-status"),
  reviewSurface: document.querySelector("#review-surface"),
  sceneImage: document.querySelector("#scene-image"),
  hero: document.querySelector("#hero-compositor"),
  portal: document.querySelector("#portal-compositor"),
  heroEyebrow: document.querySelector("#hero-eyebrow"),
  heroHeading: document.querySelector("#hero-heading"),
  heroSupporting: document.querySelector("#hero-supporting"),
  heroIndustry: document.querySelector("#hero-industry"),
  heroStartups: document.querySelector("#hero-startups"),
  portalLayer: document.querySelector("#portal-contract-layer"),
  portalBrand: document.querySelector("#portal-brand"),
  portalSignal: document.querySelector("#portal-signal"),
  portalEyebrow: document.querySelector("#portal-eyebrow"),
  portalHeading: document.querySelector("#portal-heading"),
  portalRoute: document.querySelector("#portal-route"),
  portalIndustry: document.querySelector("#portal-industry"),
  portalStartups: document.querySelector("#portal-startups"),
  physicalProbe: document.querySelector("#physical-screen-probe"),
  report: document.querySelector("#phase04-report"),
};

let contract;
let plan;
let contractHash;
let planHash;
let authorityMode = "scaffold";
let keepoutAuthority = null;
let keepoutHash = null;
let keepoutRecords = new Map();
let sourceAuthorities = new Map();
let selectedScene = null;
let authorityChecks = {};

function twoFrames() {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
}

async function fetchBytes(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Authority failed to load (${response.status}): ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function decodeJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function pngDimensions(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) {
    throw new Error("Frozen scene source is not a PNG");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceMetadata(record, id) {
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

function recordsById(authority) {
  if (Array.isArray(authority?.records)) return new Map(authority.records.map((record) => [record.id, record]));
  if (authority?.records && typeof authority.records === "object") {
    return new Map(Object.entries(authority.records).map(([id, record]) => [id, { id, ...record }]));
  }
  return new Map();
}

function geometryLineagePresent(geometry) {
  const lineage = geometry?.sourceObjectLineage ?? geometry?.sourceObjects ?? geometry?.source_objects;
  return Array.isArray(lineage) && lineage.length > 0;
}

function pixelBoundsPresent(geometry) {
  const bounds = geometry?.pixelBounds ?? geometry?.pixel_bounds;
  return bounds && Number(bounds.width) > 0 && Number(bounds.height) > 0;
}

function paddedBoundsPresent(geometry) {
  const bounds = geometry?.paddedBoundsPx ?? geometry?.padded_bounds_px;
  return bounds && Number(bounds.width) > 0 && Number(bounds.height) > 0;
}

function paddingPresent(geometry) {
  const padding = geometry?.paddingPx ?? geometry?.padding_px ?? geometry?.padding;
  return typeof padding === "object" || Number.isFinite(Number(padding));
}

function hiddenGeometryIsExplicit(geometry, geometryId) {
  const bounds = geometry?.pixelBounds ?? geometry?.pixel_bounds;
  const paddedBounds = geometry?.paddedBoundsPx ?? geometry?.padded_bounds_px;
  const projectedPointCount = geometry?.projectedPointCount ?? geometry?.projected_point_count;
  const visiblePointCount = geometry?.visiblePointCount ?? geometry?.visible_point_count;
  const emptyProjection = geometryId === "spiral-cable"
    ? normalizedCableSegments(geometry).length === 0
    : normalizedPolygons(geometry).length === 0;
  return (
    geometry?.visible === false &&
    geometry?.visibility === "out-of-frame/no-visible-geometry" &&
    bounds == null &&
    paddedBounds == null &&
    Number(projectedPointCount) === 0 &&
    Number(visiblePointCount) === 0 &&
    emptyProjection
  );
}

function normalizePoint(point) {
  const x = Array.isArray(point) ? point[0] : point?.x;
  const y = Array.isArray(point) ? point[1] : point?.y;
  return { x: Number(x), y: Number(y) };
}

function normalizedPolygons(geometry) {
  let value =
    geometry?.normalizedPolygons ??
    geometry?.normalized_polygons ??
    geometry?.polygonsNormalized ??
    geometry?.normalizedPolygon ??
    geometry?.normalized_polygon;
  if (!Array.isArray(value) || value.length === 0) return [];
  const first = value[0];
  const firstLooksLikePoint =
    (Array.isArray(first) && typeof first[0] === "number") ||
    (first && typeof first === "object" && !Array.isArray(first) && "x" in first);
  if (firstLooksLikePoint) value = [value];
  return value.map((polygon) => polygon.map(normalizePoint));
}

function normalizedCableSegments(geometry) {
  const values =
    geometry?.normalizedSegmentRectangles ??
    geometry?.normalized_segment_rectangles ??
    geometry?.segmentRectanglesNormalized ??
    geometry?.segment_rectangles_normalized ??
    [];
  if (!Array.isArray(values)) return [];
  return values.map((value) => ({
    x: Number(value.x ?? value[0]),
    y: Number(value.y ?? value[1]),
    width: Number(value.width ?? value[2]),
    height: Number(value.height ?? value[3]),
  }));
}

function normalizedPolygonSetIsValid(polygons) {
  return (
    polygons.length > 0 &&
    polygons.every(
      (polygon) =>
        polygon.length >= 3 &&
        polygon.every(
          (point) =>
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            point.x >= 0 &&
            point.x <= 1 &&
            point.y >= 0 &&
            point.y <= 1,
        ),
    )
  );
}

function normalizedSegmentSetIsValid(segments) {
  return (
    segments.length > 0 &&
    segments.every(
      (segment) =>
        Number.isFinite(segment.x) &&
        Number.isFinite(segment.y) &&
        Number.isFinite(segment.width) &&
        Number.isFinite(segment.height) &&
        segment.x >= 0 &&
        segment.y >= 0 &&
        segment.width > 0 &&
        segment.height > 0 &&
        segment.x + segment.width <= 1.000001 &&
        segment.y + segment.height <= 1.000001,
    )
  );
}

function validateKeepoutRecord(record, id, source) {
  const meta = sourceMetadata(record, id);
  const nestedSource = record?.source ?? {};
  const expectedPackagePath = source.path.replace(/^artifacts\/original\/phase-0-4-crt-television\//, "");
  check(
    meta.id === id && record.sourceRole === id && typeof nestedSource.role === "string" && nestedSource.role.length > 0,
    `Keepout source identity mismatch: ${id}`,
  );
  check(
    meta.path === source.path &&
      nestedSource.packageRelativePath === expectedPackagePath &&
      meta.bytes === source.bytes &&
      meta.sha256 === source.sha256 &&
      meta.width === source.width &&
      meta.height === source.height,
    `Keepout source lineage mismatch: ${id}`,
  );
  const layout = record.layoutAuthority ?? record.layout_authority;
  check(
    layout?.path === KEEP_OUT_LAYOUT_AUTHORITY_PATH &&
      layout?.bytes === plan.contractAuthority.bytes &&
      layout?.sha256 === contractHash &&
      layout?.schema === contract.schema,
    `Keepout layout authority mismatch: ${id}`,
  );
  check(typeof record.roleLabel === "string" && record.roleLabel.length > 0, `Keepout role label missing: ${id}`);
  check(typeof record.camera === "string" && record.camera.length > 0, `Keepout camera missing: ${id}`);
  check(typeof record.cableVariant === "string" && record.cableVariant.length > 0, `Keepout cable variant missing: ${id}`);
  const geometry = record.geometry ?? {};
  const postBezelSource = id === POST_BEZEL_TAKEOVER_SOURCE_ID && source.sha256 === plan.sceneFreeze.keepoutApplicability?.postBezelSemanticTakeover?.sourceSha256;
  for (const geometryId of ["crt-cabinet", "crt-screen", "spiral-cable"]) {
    const item = geometry[geometryId];
    check(Boolean(item), `Keepout geometry missing ${geometryId}: ${id}`);
    check(paddingPresent(item), `Keepout ${geometryId} lacks padding: ${id}`);
    check(geometryLineagePresent(item), `Keepout ${geometryId} lacks source-object lineage: ${id}`);
    if (postBezelSource) {
      check(hiddenGeometryIsExplicit(item, geometryId), `Post-bezel ${geometryId} is not explicitly out of frame: ${id}`);
    } else {
      check(item?.visible !== false, `Visible-source ${geometryId} is incorrectly hidden: ${id}`);
      check(pixelBoundsPresent(item), `Keepout ${geometryId} lacks pixel bounds: ${id}`);
      check(paddedBoundsPresent(item), `Keepout ${geometryId} lacks padded pixel bounds: ${id}`);
    }
  }
  if (!postBezelSource) {
    check(normalizedPolygonSetIsValid(normalizedPolygons(geometry["crt-cabinet"])), `CRT cabinet lacks valid normalized polygon geometry: ${id}`);
    check(normalizedPolygonSetIsValid(normalizedPolygons(geometry["crt-screen"])), `CRT screen lacks valid normalized polygon geometry: ${id}`);
    check(normalizedSegmentSetIsValid(normalizedCableSegments(geometry["spiral-cable"])), `Spiral cable lacks valid normalized segment rectangles: ${id}`);
  }
}

async function loadFinalAuthorities() {
  const keepoutSpec = plan.sceneFreeze.keepoutAuthority;
  check(keepoutSpec?.schema === KEEP_OUT_SCHEMA, "Frozen keepout schema is not bound by the capture plan");
  const keepoutBytes = await fetchBytes(`/${keepoutSpec.path}`);
  keepoutHash = await sha256(keepoutBytes);
  check(keepoutBytes.length === Number(keepoutSpec.bytes), "Frozen keepout byte count mismatch");
  check(keepoutHash === keepoutSpec.sha256, "Frozen keepout SHA-256 mismatch");
  keepoutAuthority = decodeJson(keepoutBytes, "CRT keepout authority");
  check(keepoutAuthority.schema === KEEP_OUT_SCHEMA, "Loaded keepout schema mismatch");
  check(keepoutAuthority.status === "frozen", "Keepout authority is not frozen");
  check(keepoutAuthority.sourceStatus === "accepted", "Keepout source status is not accepted");
  check(
    JSON.stringify(keepoutAuthority.sourceRoles) === JSON.stringify(EXPECTED_SOURCE_IDS),
    "Keepout sourceRoles authority differs from the exact six source IDs",
  );
  check(Number(keepoutAuthority.recordCount) === EXPECTED_SOURCE_IDS.length, "Keepout recordCount must be exactly six");
  keepoutRecords = recordsById(keepoutAuthority);
  check(keepoutRecords.size === EXPECTED_SOURCE_IDS.length, "Keepout authority must contain exactly six source records");

  const planned = new Map((plan.sceneFreeze.sources ?? []).map((source) => [source.id, source]));
  check(planned.size === EXPECTED_SOURCE_IDS.length, "Capture plan must contain exactly six frozen scene sources");
  for (const descriptor of plan.sceneFreeze.expectedSourceDescriptors ?? []) {
    const source = planned.get(descriptor.id);
    check(Boolean(source), `Frozen scene source missing: ${descriptor.id}`);
    check(
      source.path === descriptor.path &&
        Number(source.width) === Number(descriptor.width) &&
        Number(source.height) === Number(descriptor.height),
      `Frozen source differs from expected descriptor: ${descriptor.id}`,
    );
  }
  for (const id of EXPECTED_SOURCE_IDS) {
    const source = planned.get(id);
    check(Boolean(source), `Frozen source ID missing: ${id}`);
    const bytes = await fetchBytes(`/${source.path}`);
    const dimensions = pngDimensions(bytes);
    const digest = await sha256(bytes);
    check(bytes.length === Number(source.bytes), `Frozen scene bytes mismatch: ${id}`);
    check(digest === source.sha256, `Frozen scene SHA-256 mismatch: ${id}`);
    check(dimensions.width === Number(source.width) && dimensions.height === Number(source.height), `Frozen scene dimensions mismatch: ${id}`);
    const authority = {
      id,
      role: source.role ?? id,
      path: source.path,
      bytes: bytes.length,
      sha256: digest,
      width: dimensions.width,
      height: dimensions.height,
    };
    sourceAuthorities.set(id, authority);
    const keepoutRecord = keepoutRecords.get(id);
    check(Boolean(keepoutRecord), `Keepout record missing: ${id}`);
    validateKeepoutRecord(keepoutRecord, id, authority);
  }
}

function updateBodyState() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const layout = width < 600 && height >= width ? "mobile-portrait" : height < 500 ? "short-landscape" : height > width ? "portrait" : "wide";
  elements.body.dataset.surface = state.surface;
  elements.body.dataset.fixture = state.fixture;
  elements.body.dataset.textZoom = String(state.textZoom);
  elements.body.dataset.fontMode = state.fontMode;
  elements.body.dataset.reduced = String(state.motion === "reduce");
  elements.body.dataset.chrome = String(state.chrome);
  elements.body.dataset.layout = layout;
  elements.body.dataset.authorityMode = authorityMode;
  elements.hero.hidden = state.surface !== "hero";
  elements.portal.hidden = state.surface !== "portal";
  elements.surfaceControl.value = state.surface;
  elements.fixtureControl.value = state.fixture;
  elements.zoomControl.value = String(state.textZoom);
  elements.fontControl.value = state.fontMode;
  elements.motionControl.checked = state.motion === "reduce";
}

function renderCopy() {
  elements.heroEyebrow.textContent = COPY.hero.eyebrow;
  elements.heroHeading.textContent = COPY.hero.heading;
  elements.heroSupporting.textContent = state.fixture === "long" ? COPY.hero.longSupport : COPY.hero.support;
  elements.heroIndustry.textContent = COPY.hero.audiences[0];
  elements.heroStartups.textContent = COPY.hero.audiences[1];

  elements.portalBrand.textContent = COPY.portal.brand;
  elements.portalSignal.textContent = COPY.portal.signal;
  elements.portalEyebrow.textContent = COPY.portal.eyebrow;
  elements.portalHeading.textContent = COPY.portal.heading;
  elements.portalRoute.replaceChildren(...COPY.portal.route.map((label) => {
    const item = document.createElement("li");
    item.textContent = label;
    return item;
  }));
  const audiences = state.fixture === "long" ? COPY.portal.longAudiences : COPY.portal.audiences;
  elements.portalIndustry.textContent = audiences[0];
  elements.portalStartups.textContent = audiences[1];
}

function referenceMode() {
  return (
    state.surface === "portal" &&
    state.fixture === "actual" &&
    state.textZoom === 100 &&
    state.fontMode === "normal" &&
    Math.abs(window.innerWidth / window.innerHeight - 1.6) <= 0.0001
  );
}

function setRegion(element, region, scale) {
  Object.assign(element.style, {
    left: `${region.x * scale}px`,
    top: `${region.y * scale}px`,
    width: `${region.width * scale}px`,
    minHeight: `${region.height * scale}px`,
  });
}

function applyContractLayout() {
  const reference = referenceMode();
  elements.body.dataset.reference = String(reference);
  for (const element of document.querySelectorAll(".contract-position")) {
    element.removeAttribute("style");
  }
  for (const marker of elements.physicalProbe.querySelectorAll("[data-physical-anchor]")) marker.removeAttribute("style");
  elements.portalHeading.style.removeProperty("font-size");
  elements.portalHeading.style.removeProperty("line-height");
  if (!reference) return;
  const scale = window.innerWidth / contract.coordinateSystems.semanticDomReference.width;
  const regions = contract.semanticDomLayout.regions;
  for (const element of document.querySelectorAll("[data-region]")) setRegion(element, regions[element.dataset.region], scale);
  elements.portalHeading.style.fontSize = `${contract.typography.display.referenceSizePx * scale}px`;
  elements.portalHeading.style.lineHeight = `${contract.typography.display.referenceLineHeightPx * scale}px`;
  elements.portalHeading.style.minHeight = `${regions.heading.height * scale + REFERENCE_HEADING_GLYPH_CLEARANCE}px`;
  for (const mapping of contract.portalAlignment.sharedAnchorMappings) {
    const marker = elements.physicalProbe.querySelector(`[data-physical-anchor="${mapping.id}"]`);
    marker.style.left = `${mapping.semantic.x * scale}px`;
    marker.style.top = `${mapping.semantic.y * scale}px`;
  }
}

function selectedSceneId() {
  const mobile = window.innerWidth < 600 && window.innerHeight >= window.innerWidth;
  if (state.motion === "reduce") return mobile ? "source-reduced-mobile-dormant" : "source-reduced-desktop-dormant";
  if (state.surface === "portal") return "source-text-free-portal-takeover";
  return mobile ? "source-mobile-dormant" : "source-desktop-dormant";
}

async function configureScene() {
  selectedScene = null;
  elements.sceneImage.removeAttribute("src");
  elements.sceneImage.removeAttribute("style");
  if (authorityMode !== "final") return;
  const id = selectedSceneId();
  const source = sourceAuthorities.get(id);
  check(Boolean(source), `Selected scene is not frozen: ${id}`);
  selectedScene = source;
  const viewportWidth = window.innerWidth;
  const viewportHeight = Math.max(window.innerHeight, elements.reviewSurface.scrollHeight);
  const scale = Math.max(viewportWidth / source.width, window.innerHeight / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  elements.sceneImage.style.width = `${width}px`;
  elements.sceneImage.style.height = `${height}px`;
  elements.sceneImage.style.left = `${(viewportWidth - width) / 2}px`;
  elements.sceneImage.style.top = `${(window.innerHeight - height) / 2}px`;
  elements.sceneImage.src = `/${source.path}`;
  await new Promise((resolve, reject) => {
    elements.sceneImage.addEventListener("load", resolve, { once: true });
    elements.sceneImage.addEventListener("error", () => reject(new Error(`Scene image failed to decode: ${id}`)), { once: true });
  });
  check(elements.sceneImage.naturalWidth === source.width && elements.sceneImage.naturalHeight === source.height, `Decoded scene dimensions changed: ${id}`);
  elements.reviewSurface.style.minHeight = `${Math.max(window.innerHeight, Math.min(viewportHeight, elements.reviewSurface.scrollHeight))}px`;
}

function visible(element) {
  if (!(element instanceof HTMLElement) || element.hidden) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
}

function rectRecord(rect) {
  return {
    left: Number(rect.left.toFixed(3)),
    top: Number(rect.top.toFixed(3)),
    right: Number(rect.right.toFixed(3)),
    bottom: Number(rect.bottom.toFixed(3)),
    width: Number(rect.width.toFixed(3)),
    height: Number(rect.height.toFixed(3)),
  };
}

function intersects(left, right) {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

function expandedRect(rect, amount) {
  return {
    left: rect.left - amount,
    top: rect.top - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function lineAndWordReport() {
  const headings = [...document.querySelectorAll("#review-surface h1, #review-surface h2")].filter(visible);
  const protectedWords = new Set(contract.wholeWordContract.protectedWords);
  const cssOffenders = [];
  const wordFragmentationDetails = [];
  const humanLineBreakReport = [];
  for (const heading of headings) {
    const style = getComputedStyle(heading);
    if (style.wordBreak !== "normal" || style.overflowWrap !== "normal" || style.hyphens !== "none") {
      cssOffenders.push({ id: heading.id, wordBreak: style.wordBreak, overflowWrap: style.overflowWrap, hyphens: style.hyphens });
    }
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const measured = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (const match of node.data.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
        const lineTops = [...new Set(rects.map((rect) => Math.round(rect.top * 2) / 2))];
        const normalized = match[0].replace(/[^A-Za-z]/g, "").toUpperCase();
        measured.push({ text: match[0], top: rects[0]?.top ?? 0, left: rects[0]?.left ?? 0 });
        if (lineTops.length > 1 || (protectedWords.has(normalized) && rects.length > 1)) {
          wordFragmentationDetails.push({ id: heading.id, word: match[0], lineTops, rectCount: rects.length });
        }
      }
    }
    const lines = [];
    for (const word of measured.sort((a, b) => a.top - b.top || a.left - b.left)) {
      let line = lines.find((candidate) => Math.abs(candidate.top - word.top) <= 2);
      if (!line) {
        line = { top: word.top, words: [] };
        lines.push(line);
      }
      line.words.push(word);
    }
    humanLineBreakReport.push({
      id: heading.id,
      lines: lines.sort((a, b) => a.top - b.top).map((line) => line.words.sort((a, b) => a.left - b.left).map((word) => word.text).join(" ")),
    });
  }
  return {
    headings: headings.map((heading) => heading.id),
    cssOffenders,
    wordFragmentationDetails,
    wordFragmentationOffenders: wordFragmentationDetails.length,
    humanLineBreakReport,
    pass: headings.length > 0 && cssOffenders.length === 0 && wordFragmentationDetails.length === 0,
  };
}

function textAndOverflowReport() {
  const root = document.documentElement;
  const blocks = [...document.querySelectorAll("[data-collision], #review-surface button")].filter(visible);
  const textBlocks = blocks.map((element) => {
    const clientWidth = element.clientWidth;
    const scrollWidth = element.scrollWidth;
    const clientHeight = element.clientHeight;
    const scrollHeight = element.scrollHeight;
    return {
      id: element.id || element.dataset.collision,
      clientWidthPx: clientWidth,
      scrollWidthPx: scrollWidth,
      clientHeightPx: clientHeight,
      scrollHeightPx: scrollHeight,
      pass: scrollWidth <= clientWidth + 1 && scrollHeight <= clientHeight + 1,
    };
  });
  const nestedScrollers = [...document.querySelectorAll("#review-surface *")].filter((element) => {
    if (!visible(element)) return false;
    const style = getComputedStyle(element);
    return ["auto", "scroll"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
  }).map((element) => element.id || element.className || element.tagName);
  const collisions = [];
  const semanticBlocks = [...document.querySelectorAll("[data-collision]")].filter(visible);
  for (let leftIndex = 0; leftIndex < semanticBlocks.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < semanticBlocks.length; rightIndex += 1) {
      const left = semanticBlocks[leftIndex];
      const right = semanticBlocks[rightIndex];
      if (left.contains(right) || right.contains(left)) continue;
      if (intersects(left.getBoundingClientRect(), right.getBoundingClientRect())) {
        collisions.push([left.id || left.dataset.collision, right.id || right.dataset.collision]);
      }
    }
  }
  return {
    layoutWidth: root.clientWidth,
    documentScrollWidth: root.scrollWidth,
    pageHorizontalOverflow: root.scrollWidth > root.clientWidth + 1,
    routeHorizontalOverflow: visible(elements.portalRoute) && elements.portalRoute.scrollWidth > elements.portalRoute.clientWidth + 1,
    textOverflow: { blocks: textBlocks, offenders: textBlocks.filter((block) => !block.pass) },
    textOverflowPass: textBlocks.every((block) => block.pass),
    nestedScrollerOffenders: nestedScrollers,
    collisions,
    collisionPass: collisions.length === 0 && nestedScrollers.length === 0,
  };
}

function buttonReport() {
  const buttons = [...document.querySelectorAll("#review-surface button")].filter(visible).map((button) => {
    const rect = button.getBoundingClientRect();
    return { id: button.id, widthPx: Number(rect.width.toFixed(3)), heightPx: Number(rect.height.toFixed(3)) };
  });
  return { buttons, pass: buttons.length === 2 && buttons.every((button) => button.widthPx >= 44 && button.heightPx >= 44) };
}

function ruleReport() {
  const divider = document.querySelector(".audience-divider");
  if (!visible(divider)) return { applicable: false, dividerPass: true, ruleSafetyPass: true, intersections: [] };
  const dividerRect = divider.getBoundingClientRect();
  const buttons = [elements.portalIndustry, elements.portalStartups].filter(visible);
  const intersections = buttons.filter((button) => intersects(dividerRect, expandedRect(button.getBoundingClientRect(), contract.portalAlignment.glyphRuleClearancePx))).map((button) => button.id);
  return {
    applicable: true,
    divider: rectRecord(dividerRect),
    clearancePx: contract.portalAlignment.glyphRuleClearancePx,
    intersections,
    dividerPass: dividerRect.width >= 1 || dividerRect.height >= 1,
    ruleSafetyPass: intersections.length === 0,
  };
}

function fontReport() {
  const display = getComputedStyle(state.surface === "hero" ? elements.heroHeading : elements.portalHeading).fontFamily;
  const editorialTarget = state.surface === "hero" ? elements.heroSupporting : elements.portalEyebrow;
  const editorial = getComputedStyle(editorialTarget).fontFamily;
  const uiTarget = state.surface === "hero" ? elements.heroIndustry : elements.portalIndustry;
  const ui = getComputedStyle(uiTarget).fontFamily;
  const forced = state.fontMode === "fallback";
  const preferredTokens = ["Syne", "Newsreader", "Inter"];
  const normalizeStack = (value) => String(value).replace(/["']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const expected = {
    display: contract.typography.display.fallback,
    editorial: contract.typography.editorial.fallback,
    ui: contract.typography.ui.fallback,
  };
  const computed = { display, editorial, ui };
  const computedFallbackStackMatches = Object.fromEntries(
    Object.keys(expected).map((role) => [role, normalizeStack(computed[role]) === normalizeStack(expected[role])]),
  );
  const preferredTokensAbsent = !preferredTokens.some((token) =>
    Object.values(computed).some((family) => normalizeStack(family).includes(token.toLowerCase())),
  );
  const forcedActive = forced && preferredTokensAbsent && Object.values(computedFallbackStackMatches).every(Boolean);
  return {
    requestedMode: state.fontMode,
    forcedFallbackRequested: forced,
    forcedFallbackActive: forced ? forcedActive : false,
    computed,
    expectedFallback: expected,
    computedFallbackStackMatches,
    preferredTokensAbsent,
    exercise: forced
      ? "forced system-fallback CSS stacks applied to the live display, editorial and UI elements"
      : "preferred stacks with documented system fallbacks",
    fallbackFontPass: forced ? forcedActive : true,
  };
}

function anchorReport() {
  if (!referenceMode()) return { applicable: false, mode: "responsive-dom-flow", pass: true, maximumDeltaPx: null, anchors: [] };
  const scale = window.innerWidth / contract.coordinateSystems.semanticDomReference.width;
  const regions = contract.semanticDomLayout.regions;
  const records = contract.portalAlignment.sharedAnchorMappings.map((mapping) => {
    const physicalMarker = elements.physicalProbe.querySelector(`[data-physical-anchor="${mapping.id}"]`);
    const physicalRect = physicalMarker.getBoundingClientRect();
    const semanticElement = mapping.id === "route-carrier-origin" ? elements.portalRoute : elements.portalSignal;
    const region = mapping.id === "route-carrier-origin" ? regions.route : regions.signalLine;
    const semanticRect = semanticElement.getBoundingClientRect();
    const semanticPoint = {
      x: semanticRect.left + (mapping.semantic.x - region.x) * scale,
      y: semanticRect.top + (mapping.semantic.y - region.y) * scale,
    };
    const physicalPoint = { x: physicalRect.left, y: physicalRect.top };
    const deltaX = Math.abs(physicalPoint.x - semanticPoint.x);
    const deltaY = Math.abs(physicalPoint.y - semanticPoint.y);
    const delta = Math.hypot(deltaX, deltaY);
    return {
      id: mapping.id,
      physicalScreenLocal: { ...mapping.physical },
      projectionAuthority: mapping.measurement,
      projectedPhysical: physicalPoint,
      semanticDom: semanticPoint,
      deltaX: Number(deltaX.toFixed(3)),
      deltaY: Number(deltaY.toFixed(3)),
      deltaPx: Number(delta.toFixed(3)),
      pass: delta <= MAXIMUM_ANCHOR_DELTA,
    };
  });
  const maximum = Math.max(...records.map((record) => record.deltaPx));
  return {
    applicable: true,
    mode: "reference-shared-authority",
    toleranceCssPx: MAXIMUM_ANCHOR_DELTA,
    anchors: records,
    maximumDeltaPx: maximum,
    pass: maximum <= MAXIMUM_ANCHOR_DELTA,
  };
}

function projectPoint(point, imageRect) {
  return { x: imageRect.left + point.x * imageRect.width, y: imageRect.top + point.y * imageRect.height };
}

function polygonBounds(polygon, imageRect) {
  const points = polygon.map((point) => projectPoint(point, imageRect));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function cableRect(value, imageRect) {
  return {
    left: imageRect.left + value.x * imageRect.width,
    top: imageRect.top + value.y * imageRect.height,
    right: imageRect.left + (value.x + value.width) * imageRect.width,
    bottom: imageRect.top + (value.y + value.height) * imageRect.height,
    width: value.width * imageRect.width,
    height: value.height * imageRect.height,
  };
}

function sceneSafetyReport() {
  if (authorityMode !== "final" || !selectedScene) {
    return {
      applicable: false,
      pass: true,
      reason: "scaffold typography preflight; final CRT source/keepout freeze is not yet available",
      minimumClearanceCssPx: MINIMUM_SCENE_CLEARANCE,
      keepouts: [],
      blocks: [],
    };
  }
  const sourceRecord = keepoutRecords.get(selectedScene.id);
  const meta = sourceMetadata(sourceRecord, selectedScene.id);
  const imageRect = elements.sceneImage.getBoundingClientRect();
  const geometry = sourceRecord.geometry;
  const cabinetRects = normalizedPolygons(geometry["crt-cabinet"]).map((polygon) => polygonBounds(polygon, imageRect));
  const screenRects = normalizedPolygons(geometry["crt-screen"]).map((polygon) => polygonBounds(polygon, imageRect));
  const cableRects = normalizedCableSegments(geometry["spiral-cable"]).map((segment) => cableRect(segment, imageRect));
  const postBezelPolicy = plan.sceneFreeze.keepoutApplicability?.postBezelSemanticTakeover;
  const geometryRecords = POST_BEZEL_GEOMETRY_IDS.map((id) => [id, geometry[id]]);
  const explicitlyHiddenGeometry = geometryRecords.every(([id, item]) => hiddenGeometryIsExplicit(item, id));
  const postBezelTakeover =
    state.surface === "portal" &&
    state.motion !== "reduce" &&
    selectedScene.id === POST_BEZEL_TAKEOVER_SOURCE_ID &&
    selectedScene.sha256 === postBezelPolicy?.sourceSha256 &&
    postBezelPolicy?.sourceId === POST_BEZEL_TAKEOVER_SOURCE_ID &&
    postBezelPolicy?.collisionRequired === false &&
    JSON.stringify(postBezelPolicy?.geometryIds) === JSON.stringify(POST_BEZEL_GEOMETRY_IDS) &&
    explicitlyHiddenGeometry;
  const intentionalOverlapReason = postBezelTakeover ? postBezelPolicy.reason : null;
  const keepouts = [
    { id: "crt-cabinet", semanticName: "Quantum Signal Television cabinet", visible: geometry["crt-cabinet"].visible !== false, visibility: geometry["crt-cabinet"].visibility ?? "in-frame", collisionRequired: geometry["crt-cabinet"].visible !== false, intentionalOverlapReason, rectangles: cabinetRects },
    {
      id: "crt-screen",
      semanticName: "convex 4:3 CRT screen",
      visible: geometry["crt-screen"].visible !== false,
      visibility: geometry["crt-screen"].visibility ?? "in-frame",
      collisionRequired: geometry["crt-screen"].visible !== false,
      intentionalOverlapReason,
      rectangles: screenRects,
    },
    { id: "spiral-cable", semanticName: "visible physical spiral cable", visible: geometry["spiral-cable"].visible !== false, visibility: geometry["spiral-cable"].visibility ?? "in-frame", collisionRequired: geometry["spiral-cable"].visible !== false, intentionalOverlapReason, rectangles: cableRects },
  ];
  const activeRects = keepouts.flatMap((keepout) => keepout.collisionRequired ? keepout.rectangles.map((rect) => ({ id: keepout.id, rect: expandedRect(rect, MINIMUM_SCENE_CLEARANCE) })) : []);
  const semanticElements = [...new Set([...document.querySelectorAll("[data-collision], #review-surface button")])].filter(visible);
  const blocks = semanticElements.map((element) => {
    const rect = element.getBoundingClientRect();
    const intersectingKeepouts = [...new Set(activeRects.filter((entry) => intersects(rect, entry.rect)).map((entry) => entry.id))];
    return { id: element.id || element.dataset.collision, rect: rectRecord(rect), intersectingKeepouts, pass: intersectingKeepouts.length === 0 };
  });
  return {
    applicable: true,
    pass: blocks.every((block) => block.pass),
    reason: postBezelTakeover
      ? postBezelPolicy.reason
      : "source-normalized Blender geometry projected through the live scene image with 16 CSS-pixel semantic clearance",
    applicability: postBezelTakeover
      ? {
          mode: "post-bezel-physical-geometry-exited",
          physicalGeometryVisible: false,
          collisionRequired: false,
          sourceId: selectedScene.id,
          sourceSha256: selectedScene.sha256,
          geometryIds: POST_BEZEL_GEOMETRY_IDS,
        }
      : {
          mode: "visible-physical-geometry",
          physicalGeometryVisible: true,
          collisionRequired: true,
          sourceId: selectedScene.id,
          sourceSha256: selectedScene.sha256,
          geometryIds: POST_BEZEL_GEOMETRY_IDS,
        },
    minimumClearanceCssPx: MINIMUM_SCENE_CLEARANCE,
    keepoutAuthority: { path: plan.sceneFreeze.keepoutAuthority.path, schema: keepoutAuthority.schema, bytes: plan.sceneFreeze.keepoutAuthority.bytes, sha256: keepoutHash },
    source: meta,
    imageRect: rectRecord(imageRect),
    imageTransform: getComputedStyle(elements.sceneImage).transform,
    keepouts: keepouts.map((keepout) => ({
      ...keepout,
      rectangles: keepout.rectangles.map(rectRecord),
      sourceRectangleCount: keepout.rectangles.length,
    })),
    blocks,
  };
}

function reducedMotionReport(sceneSafety) {
  if (state.motion !== "reduce") return { applicable: false, pass: true, strategy: null, floatingRoundedPanelOffenders: [] };
  const candidates = [elements.hero.querySelector(".hero-copy"), elements.portalLayer].filter(visible);
  const offenders = candidates.filter((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return parseFloat(style.borderRadius) >= 24 && style.backgroundColor !== "rgba(0, 0, 0, 0)" && rect.width * rect.height > window.innerWidth * window.innerHeight * 0.18;
  }).map((element) => element.id || element.className);
  const visibleGeometry = sceneSafety.applicable
    ? sceneSafety.keepouts.filter((keepout) => keepout.rectangles.some((rect) => rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight)).map((keepout) => keepout.id)
    : [];
  return {
    applicable: true,
    strategy: "directional-scrim-quiet-field",
    floatingRoundedPanelOffenders: offenders,
    televisionPowered: false,
    cableDormant: true,
    screenGlow: false,
    cinematicAssetsInstantiated: false,
    visibleGeometry,
    pass: offenders.length === 0 && (authorityMode !== "final" || ["crt-cabinet", "crt-screen", "spiral-cable"].every((id) => visibleGeometry.includes(id))),
  };
}

async function focusReport() {
  const previous = document.activeElement;
  const target = state.surface === "hero" ? elements.heroIndustry : elements.portalIndustry;
  target.focus({ preventScroll: true });
  await twoFrames();
  const style = getComputedStyle(target);
  const width = parseFloat(style.outlineWidth) || 0;
  const visibleOutline = style.outlineStyle !== "none" && width >= 2;
  if (previous instanceof HTMLElement && previous !== document.body && previous !== document.documentElement) {
    previous.focus({ preventScroll: true });
  } else {
    target.blur();
  }
  await twoFrames();
  const active = document.activeElement;
  const residue = active instanceof HTMLElement && active.matches("#review-surface button");
  return { target: target.id, outlineWidthPx: width, outlineStyle: style.outlineStyle, visibleOutline, restoredWithoutReviewControlResidue: !residue, pass: visibleOutline && !residue };
}

function portalReport() {
  if (state.surface !== "portal") {
    const physical = contract.coordinateSystems.physicalScreenLocal;
    return {
      applicable: false,
      physicalScreen: {
        width: physical.width,
        height: physical.height,
        aspectRatio: physical.aspectRatio,
        measuredRatio: physical.width / physical.height,
        pass: physical.width * 3 === physical.height * 4,
      },
      takeover: {
        pass: true,
        noPermanentLetterbox: true,
        noAbruptAspectSnap: true,
        semanticDomUndistorted: true,
        physicalTextAbsentBeforeDomCopy: true,
      },
    };
  }
  const rect = elements.physicalProbe.getBoundingClientRect();
  const physicalScreen = {
    width: rect.width,
    height: rect.height,
    aspectRatio: "4:3",
    measuredRatio: rect.height ? rect.width / rect.height : 0,
    pass: rect.width > 0 && rect.height > 0 && Math.abs(rect.width / rect.height - 4 / 3) <= 0.000001,
  };
  const checkpoints = contract.aspectTransition.checkpoints;
  const monotonic = checkpoints.every((checkpoint, index) => index === 0 || checkpoint.progress > checkpoints[index - 1].progress);
  const physicalTextAbsent = checkpoints.find((checkpoint) => checkpoint.semanticDomOpacity > 0)?.physicalRasterOpacity === 0;
  const takeover = {
    checkpointCount: checkpoints.length,
    monotonic,
    noPermanentLetterbox: contract.portalAlignment.finalCameraCrop.noPermanentLetterbox === true,
    noAbruptAspectSnap: contract.portalAlignment.finalCameraCrop.noAbruptAspectSnap === true,
    semanticDomUndistorted: getComputedStyle(elements.portalLayer).transform === "none",
    physicalTextAbsentBeforeDomCopy: physicalTextAbsent,
  };
  takeover.pass = Object.entries(takeover).filter(([key]) => key !== "checkpointCount" && key !== "pass").every(([, value]) => value === true);
  return { applicable: true, physicalScreen, takeover };
}

async function buildReport() {
  await twoFrames();
  const wordIntegrity = lineAndWordReport();
  const overflow = textAndOverflowReport();
  const buttons = buttonReport();
  const rules = ruleReport();
  const fonts = fontReport();
  const anchors = anchorReport();
  const sceneSafety = sceneSafetyReport();
  const reducedMotionComposition = reducedMotionReport(sceneSafety);
  const focus = await focusReport();
  const portal = portalReport();
  const longRatio = COPY.hero.longSupport.length / COPY.hero.support.length;
  const expectedSceneId = authorityMode === "final" ? selectedSceneId() : null;
  const doubledCopyPass =
    authorityMode !== "final" ||
    state.surface !== "portal" ||
    ["source-text-free-portal-takeover", "source-reduced-desktop-dormant", "source-reduced-mobile-dormant"].includes(expectedSceneId);
  const report = {
    schema: REPORT_SCHEMA,
    generatedAt: new Date().toISOString(),
    authority: {
      mode: authorityMode,
      captureEligible: authorityMode === "final" && Object.values(authorityChecks).every(Boolean),
      scaffoldPreflight: authorityMode === "scaffold",
      checks: authorityChecks,
      contract: { path: plan.contractPath, bytes: plan.contractAuthority.bytes, sha256: contractHash },
      plan: { path: "prototypes/phase-0-4r-crt-portal-qa/capture-plan.json", sha256: planHash },
    },
    viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
    state: { ...state },
    fonts,
    copy: {
      wordFragmentationOffenders: wordIntegrity.wordFragmentationOffenders,
      humanLineBreakReport: wordIntegrity.humanLineBreakReport,
      longSupportLength: COPY.hero.longSupport.length,
      actualSupportLength: COPY.hero.support.length,
      longSupportRatio: longRatio,
      longSupportRatioPass: longRatio >= 1.24 && longRatio <= 1.27,
    },
    layout: {
      ...overflow,
      wordIntegrity,
      buttons: buttons.buttons,
      buttonPass: buttons.pass,
      dividerPass: rules.dividerPass,
      ruleSafetyPass: rules.ruleSafetyPass,
      ruleIntersections: rules.intersections,
      anchors,
      referenceHeadingGlyphClearanceCssPx: referenceMode() ? REFERENCE_HEADING_GLYPH_CLEARANCE : null,
      sceneSafety,
      reducedMotionComposition,
    },
    assets: {
      sceneId: selectedScene?.id ?? null,
      scene: selectedScene ? `/${selectedScene.path}` : null,
      sceneSha256: selectedScene?.sha256 ?? null,
      sceneClassification: authorityMode === "final" ? (state.motion === "reduce" ? "dormant reduced-motion CRT scene" : state.surface === "portal" ? "text-free CRT takeover scene" : "dormant CRT proving-ground scene") : "no-scene typography scaffold",
      doubledCopyPass,
      televisionPowered: state.motion === "reduce" ? false : null,
      cableDormant: state.motion === "reduce" ? true : null,
    },
    portal,
    media: {
      videoElements: document.querySelectorAll("video").length,
      canvasElements: document.querySelectorAll("canvas").length,
      cinematicAssetsInstantiated: false,
    },
    accessibility: {
      focus,
      reducedMotionPass: state.motion !== "reduce" || reducedMotionComposition.pass,
      semanticHeadingCount: [...document.querySelectorAll("#review-surface h1")].filter(visible).length,
    },
  };
  report.pass =
    wordIntegrity.pass &&
    fonts.fallbackFontPass &&
    report.copy.longSupportRatioPass &&
    !overflow.pageHorizontalOverflow &&
    !overflow.routeHorizontalOverflow &&
    overflow.textOverflowPass &&
    overflow.collisionPass &&
    buttons.pass &&
    rules.dividerPass &&
    rules.ruleSafetyPass &&
    anchors.pass &&
    (authorityMode === "scaffold" || sceneSafety.pass) &&
    reducedMotionComposition.pass &&
    doubledCopyPass &&
    focus.pass &&
    portal.physicalScreen.pass &&
    portal.takeover.pass &&
    report.accessibility.semanticHeadingCount === 1;
  elements.report.textContent = JSON.stringify(report);
  elements.body.dataset.pass = String(report.pass);
  elements.status.textContent = report.pass
    ? authorityMode === "final"
      ? "PASS · frozen CRT scene and layout authority"
      : "PREFLIGHT PASS · final scene evidence remains locked"
    : "REVIEW · one or more typography/layout gates failed";
  window.phase04TypographyReport = report;
  return report;
}

function bindControls() {
  const update = (key, value) => {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    window.location.assign(url.href);
  };
  elements.surfaceControl.addEventListener("change", () => update("surface", elements.surfaceControl.value));
  elements.fixtureControl.addEventListener("change", () => update("fixture", elements.fixtureControl.value));
  elements.zoomControl.addEventListener("change", () => update("zoom", elements.zoomControl.value));
  elements.fontControl.addEventListener("change", () => update("font", elements.fontControl.value));
  elements.motionControl.addEventListener("change", () => update("motion", elements.motionControl.checked ? "reduce" : "no-preference"));
  elements.focusCheck.addEventListener("click", () => (state.surface === "hero" ? elements.heroIndustry : elements.portalIndustry).focus());
}

async function initialize() {
  const [contractBytes, planBytes] = await Promise.all([fetchBytes(CONTRACT_URL), fetchBytes(PLAN_URL)]);
  contractHash = await sha256(contractBytes);
  planHash = await sha256(planBytes);
  contract = decodeJson(contractBytes, "CRT portal contract");
  plan = decodeJson(planBytes, "Phase 0.4 capture plan");
  check(contract.schema === "quantum-hub.phase-0-4-crt-television.crt-portal-layout.v1", "CRT portal contract schema mismatch");
  check(plan.schema === "quantum-hub.phase-0-4r-crt-television.typography-capture-plan.v1", "Phase 0.4R capture-plan schema mismatch");
  authorityChecks = {
    contractPath: plan.contractPath === "artifacts/original/phase-0-4-crt-television/crt-portal-layout.json",
    contractBytes: contractBytes.length === Number(plan.contractAuthority.bytes),
    contractSha256: contractHash === plan.contractAuthority.sha256,
    physicalScreenFourByThree:
      contract.physicalScreen.screenGlassBoundsInCameraFrame.width * 3 === contract.physicalScreen.screenGlassBoundsInCameraFrame.height * 4,
    activeRasterFourByThree:
      contract.physicalScreen.activeRasterBoundsInCameraFrame.width * 3 === contract.physicalScreen.activeRasterBoundsInCameraFrame.height * 4,
    maximumAnchorDelta: contract.portalAlignment.maximumAnchorDeltaPx === MAXIMUM_ANCHOR_DELTA,
    glyphRuleClearance: contract.portalAlignment.glyphRuleClearancePx === 12,
    keepoutLayoutAuthority:
      plan.sceneFreeze.requiredKeepoutAuthority?.layoutAuthority?.path === KEEP_OUT_LAYOUT_AUTHORITY_PATH &&
      plan.sceneFreeze.requiredKeepoutAuthority?.layoutAuthority?.sha256 === contractHash,
    immutableContractCaptureBoundary:
      contract.captureGate.status === "blocked" &&
      contract.captureGate.captureBeforeFreezeAllowed === false,
  };
  check(Object.values(authorityChecks).every(Boolean), "CRT portal/plan static authority mismatch");
  const frozen =
    plan.sceneFreeze.status === "frozen" &&
    ["ready-for-capture", "complete"].includes(plan.sceneFreeze.matrixStatus) &&
    plan.sceneFreeze.captureAllowed === true;
  if (frozen) {
    await loadFinalAuthorities();
    authorityChecks.frozenSourceCount = sourceAuthorities.size === EXPECTED_SOURCE_IDS.length;
    authorityChecks.keepoutRecordCount = keepoutRecords.size === EXPECTED_SOURCE_IDS.length;
    authorityChecks.keepoutHash = keepoutHash === plan.sceneFreeze.keepoutAuthority.sha256;
    check(Object.values(authorityChecks).every(Boolean), "Frozen CRT source/keepout authority failed");
    authorityMode = "final";
  }
  updateBodyState();
  renderCopy();
  applyContractLayout();
  await configureScene();
  bindControls();
  await twoFrames();
  const report = await buildReport();
  elements.body.dataset.ready = "true";
  return report;
}

window.runPhase04TypographyCheck = buildReport;
const readiness = initialize().catch((error) => {
  elements.body.dataset.ready = "error";
  elements.body.dataset.pass = "false";
  elements.status.textContent = error.message;
  throw error;
});
window.phase04Ready = readiness;
