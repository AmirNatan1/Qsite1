import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CSSOM_GEOMETRY_QUANTUM_PX,
  EDGE_QUANTIZATION_CONTRACT,
  GOVERNED_STATES,
  buildProtectedGeometryMask,
  buildTypographyEdgeMask,
  canonicalizeComputedCssPixels,
  classifyGovernedPixels,
  compareStructuredAuthority,
  differenceMaskRgba,
  normalizeBaseUrl,
  parseArguments,
  safeRelativePath,
  validateAdditiveAuthority,
} from "../scripts/capture-phase7c-accepted-authority-regression.mjs";
import { PHASE7C_PARENT } from "../scripts/phase7c-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CURRENT = "1234567890abcdef1234567890abcdef12345678";

function rgba(width, height, color = [128, 128, 128, 255]) {
  const bytes = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < bytes.length; offset += 4) bytes.set(color, offset);
  return bytes;
}

function masks(width, height, coordinates, protectedCoordinates = []) {
  const edge = new Uint8Array(width * height);
  const protectedMask = new Uint8Array(width * height);
  for (const [x, y] of coordinates) edge[y * width + x] = 1;
  for (const [x, y] of protectedCoordinates) protectedMask[y * width + x] = 1;
  return { edge, protectedMask };
}

function mutatePixel(bytes, width, x, y, channel, value) {
  bytes[(y * width + x) * 4 + channel] = value;
}

function classifyFixture({
  width = 500,
  height = 500,
  changes = [[20, 20, 0, 129]],
  edgeCoordinates = changes.map(([x, y]) => [x, y]),
  protectedCoordinates = [],
  baselineColor = [128, 128, 128, 255],
} = {}) {
  const baseline = rgba(width, height, baselineColor);
  const current = baseline.slice();
  for (const [x, y, channel, value] of changes) mutatePixel(current, width, x, y, channel, value);
  const { edge, protectedMask } = masks(width, height, edgeCoordinates, protectedCoordinates);
  return classifyGovernedPixels({
    baseline,
    current,
    width,
    height,
    textEdgeMask: edge,
    protectedMask,
    textRects: [{ id: "h2@governed", rect: { left: 0, top: 0, right: width, bottom: height, width, height } }],
  });
}

test("arguments require two explicit URLs, an explicit installed browser and committed revisions", () => {
  const options = parseArguments([
    "--phase7b-url", "https://phase7b.example.test/",
    "--phase7c-url", "https://phase7c.example.test/",
    "--phase7c-revision", CURRENT,
    "--chromium-executable", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "--evidence-root", "C:\\evidence\\phase7c-regression",
    "--viewport", "1600x1000",
    "--timeout-ms", "45000",
    "--headed",
  ]);
  assert.equal(options.phase7bRevision, PHASE7C_PARENT);
  assert.equal(options.phase7cRevision, CURRENT);
  assert.deepEqual(options.viewport, { width: 1600, height: 1000 });
  assert.equal(options.headed, true);
  assert.throws(() => parseArguments([
    "--phase7b-url", "https://same.example.test/",
    "--phase7c-url", "https://same.example.test/",
    "--phase7c-revision", CURRENT,
    "--chromium-executable", "chrome.exe",
    "--evidence-root", "evidence",
  ]), /URLs must differ/);
  assert.throws(() => normalizeBaseUrl("http://public.example.test/"), /HTTPS or loopback/);
  assert.equal(normalizeBaseUrl("http://127.0.0.1:4322/"), "http://127.0.0.1:4322/");
  assert.equal(safeRelativePath("paired/method-frame-difference-mask.png"), "paired/method-frame-difference-mask.png");
  assert.throws(() => safeRelativePath("../escape.png"), /traverse/);
});

test("governed state matrix covers Phase 7A authority and all five Phase 7B METHOD states", () => {
  assert.deepEqual(GOVERNED_STATES.map(({ id }) => id), [
    "phase7a-manifesto-signal-field",
    "phase7a-audience-bifurcation",
    "phase7a-field-map-closed",
    "phase7a-field-map-open",
    "phase7b-method-frame",
    "phase7b-method-source",
    "phase7b-method-assess",
    "phase7b-method-test",
    "phase7b-method-decide",
  ]);
  assert.deepEqual(GOVERNED_STATES.filter(({ kind }) => kind === "method").map(({ state }) => state), ["frame", "source", "assess", "test", "decide"]);
});

test("exact pixels remain explicitly exact", () => {
  const width = 10;
  const height = 8;
  const baseline = rgba(width, height);
  const result = classifyGovernedPixels({
    baseline,
    current: baseline.slice(),
    width,
    height,
    textEdgeMask: new Uint8Array(width * height),
    protectedMask: new Uint8Array(width * height),
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.exactComparison.status, "PASS");
  assert.equal(result.adjudication.status, "PASS — EXACT");
  assert.equal(result.metrics.differingPixels, 0);
});

test("the narrow typography-edge envelope is distinguished from exact equality", () => {
  const changes = [
    [20, 20, 0, 129],
    [80, 70, 1, 127],
    [180, 170, 2, 129],
    [320, 330, 0, 127],
  ];
  const result = classifyFixture({ width: 1000, height: 1000, changes });
  assert.equal(result.status, "PASS");
  assert.equal(result.exactComparison.status, "FAIL");
  assert.equal(result.exactComparison.classification, "EXACT_EQUALITY_NOT_ACHIEVED");
  assert.equal(result.adjudication.status, "PASS — EDGE_QUANTIZATION_EQUIVALENT");
  assert.equal(result.metrics.maximumRgbChannelDelta, 1);
  assert.equal(result.metrics.alphaDifferences, 0);
  assert.equal(result.metrics.changedFraction, 4 / 1_000_000);
  assert.ok(result.coordinates.every(({ typographyElement, neutral, onTypographyEdge, onProtectedGeometry }) => typographyElement === "h2@governed" && neutral && onTypographyEdge && !onProtectedGeometry));
});

test("edge adjudication fails closed for every forbidden class of visual difference", () => {
  const deltaTwo = classifyFixture({ changes: [[20, 20, 0, 130]] });
  assert.equal(deltaTwo.status, "FAIL");
  assert.ok(deltaTwo.adjudication.failedConditions.includes("maximumRgbChannelDelta"));

  const alpha = classifyFixture({ changes: [[20, 20, 3, 254]] });
  assert.equal(alpha.status, "FAIL");
  assert.ok(alpha.adjudication.failedConditions.includes("alphaExact"));

  const outsideEdge = classifyFixture({ edgeCoordinates: [] });
  assert.equal(outsideEdge.status, "FAIL");
  assert.ok(outsideEdge.adjudication.failedConditions.includes("actualNeutralTypographyEdgeOnly"));

  const protectedGeometry = classifyFixture({ protectedCoordinates: [[20, 20]] });
  assert.equal(protectedGeometry.status, "FAIL");
  assert.ok(protectedGeometry.adjudication.failedConditions.includes("noProtectedGeometryDifference"));

  const colored = classifyFixture({ baselineColor: [255, 0, 168, 255], changes: [[20, 20, 0, 254]] });
  assert.equal(colored.status, "FAIL");
  assert.ok(colored.adjudication.failedConditions.includes("bothColorsNeutralOrNearNeutral"));

  const fraction = classifyFixture({ width: 100, height: 100, changes: [[10, 10, 0, 129], [20, 20, 0, 129]] });
  assert.equal(fraction.status, "FAIL");
  assert.ok(fraction.adjudication.failedConditions.includes("changedFraction"));

  const longClusterChanges = Array.from({ length: 17 }, (_, index) => [20 + index, 20, 0, 129]);
  const longCluster = classifyFixture({ width: 500, height: 500, changes: longClusterChanges });
  assert.equal(longCluster.status, "FAIL");
  assert.ok(longCluster.adjudication.failedConditions.includes("connectedComponentPixelLimit"));
  assert.ok(longCluster.adjudication.failedConditions.includes("connectedComponentSpanLimit"));
});

test("typography eligibility derives from the intersection of actual one-pixel raster edges", () => {
  const width = 9;
  const height = 7;
  const baselineAlpha = new Uint8Array(width * height);
  const currentAlpha = new Uint8Array(width * height);
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 3; x <= 5; x += 1) {
      baselineAlpha[y * width + x] = 255;
      currentAlpha[y * width + x] = 255;
    }
  }
  const result = buildTypographyEdgeMask({ baselineAlpha, currentAlpha, width, height });
  assert.equal(result.method, "INTERSECTION_OF_ONE_PIXEL_DILATED_ACTUAL_TEXT_RASTER_EDGES");
  assert.equal(result.mask[3 * width + 3], 1);
  assert.equal(result.mask[0], 0);
  assert.ok(result.eligiblePixels > 9);

  currentAlpha.fill(0);
  const noSharedGlyph = buildTypographyEdgeMask({ baselineAlpha, currentAlpha, width, height });
  assert.equal(noSharedGlyph.eligiblePixels, 0);
});

test("protected geometry is the union of actual raster geometry and focus outline bands", () => {
  const width = 20;
  const height = 20;
  const baselineAlpha = new Uint8Array(width * height);
  const currentAlpha = new Uint8Array(width * height);
  baselineAlpha[5 * width + 5] = 255;
  currentAlpha[6 * width + 6] = 255;
  const result = buildProtectedGeometryMask({
    baselineAlpha,
    currentAlpha,
    width,
    height,
    outlineBands: [{ rect: { left: 10, top: 10, right: 15, bottom: 15 }, thickness: 1 }],
  });
  assert.equal(result.mask[5 * width + 5], 1);
  assert.equal(result.mask[6 * width + 6], 1);
  assert.equal(result.mask[9 * width + 10], 1);
  assert.equal(result.mask[12 * width + 12], 0);
});

test("semantic, typography, wrapping, rectangle and structural authority is exact", () => {
  const authority = {
    viewport: { innerWidth: 1440, innerHeight: 900, scrollY: 8400, horizontalOverflow: false },
    semanticElements: [{ id: "#method-test-title", text: "TEST", href: null }],
    textElements: [{ id: "#method-test-title", style: { fontFamily: "Anybody", fontSize: "80px", lineHeight: "72px", letterSpacing: "-2px" }, rect: { left: 80, top: 210, width: 310, height: 80 }, lineRects: [{ left: 80, top: 210, width: 310, height: 80 }] }],
    structuralElements: [{ id: "path@12", geometryAttributes: { d: "M0 0L10 10" }, rect: { left: 0, top: 0, width: 10, height: 10 }, style: { stroke: "rgb(255, 0, 168)" } }],
  };
  assert.equal(compareStructuredAuthority(authority, structuredClone(authority)).status, "PASS");
  const changedStyle = structuredClone(authority);
  changedStyle.textElements[0].style.letterSpacing = "-1px";
  const styleResult = compareStructuredAuthority(authority, changedStyle);
  assert.equal(styleResult.status, "FAIL");
  assert.match(styleResult.mismatches[0].path, /letterSpacing/);
  const changedGeometry = structuredClone(authority);
  changedGeometry.structuralElements[0].geometryAttributes.d = "M0 0L11 10";
  assert.equal(compareStructuredAuthority(authority, changedGeometry).status, "FAIL");
});

test("default document focus is excluded while meaningful focus remains governed", async () => {
  const source = await readFile(path.join(ROOT, "scripts/capture-phase7c-accepted-authority-regression.mjs"), "utf8");
  assert.match(source, /const hasMeaningfulFocus = active instanceof Element\s*&& active !== document\.body\s*&& active !== document\.documentElement;/);
  assert.match(source, /const focusProtection = hasMeaningfulFocus \? \[\{/);
  assert.match(source, /activeElement: hasMeaningfulFocus \? \{ id: id\(active\), tag: active\.tagName\.toLowerCase\(\), text: canonicalText\(active\), rect: rectOf\(active\) \} : null/);
  assert.doesNotMatch(source, /activeElement: active instanceof Element \?/);
});

test("only sub-browser-precision CSSOM px serialization is canonicalized", () => {
  assert.equal(CSSOM_GEOMETRY_QUANTUM_PX, 1 / 65_536);
  assert.equal(canonicalizeComputedCssPixels("0.00108321px"), canonicalizeComputedCssPixels("0.00108575px"));
  assert.notEqual(canonicalizeComputedCssPixels("0.00108321px"), canonicalizeComputedCssPixels("0.0012px"));
  assert.equal(canonicalizeComputedCssPixels("rgb(255, 0, 168)"), "rgb(255, 0, 168)");
});

test("Phase 7C is accepted only as one additive chapter after DECIDE", () => {
  const parent = { operatingFieldCount: 1, territoryCount: 0 };
  const current = {
    operatingFieldCount: 1,
    territoryCount: 1,
    operatingBeforeTerritory: true,
    sameParent: true,
    interveningElements: [{ tag: "script", width: 0, height: 0 }],
    operatingDocumentBottom: 12_000,
    territoryDocumentTop: 12_000,
    heading: "One carrier. Four operating conditions.",
    industries: ["Automotive & Mobility", "Logistics & Supply Chain", "Industry 4.0 / Advanced Manufacturing", "Energy & Infrastructure"],
    proofLinks: ["/pocs/maradin/"],
    acceptedFieldOrder: ["field-map-threshold", "operating-field", "territories"],
  };
  assert.equal(validateAdditiveAuthority(parent, current).status, "PASS");
  assert.equal(validateAdditiveAuthority(parent, { ...current, territoryDocumentTop: 11_900 }).status, "FAIL");
  assert.equal(validateAdditiveAuthority(parent, { ...current, territoryDocumentTop: 12_000.1 }).status, "FAIL");
  assert.equal(validateAdditiveAuthority(parent, { ...current, interveningElements: [{ tag: "div", width: 1, height: 1 }] }).status, "FAIL");
});

test("difference masks disclose equivalent, forbidden and protected changes with distinct colors", () => {
  const comparison = classifyFixture({
    width: 500,
    height: 500,
    changes: [[20, 20, 0, 129], [30, 30, 0, 129], [40, 40, 0, 129]],
    edgeCoordinates: [[20, 20], [40, 40]],
    protectedCoordinates: [[40, 40]],
  });
  const mask = differenceMaskRgba(comparison);
  const at = (x, y) => [...mask.subarray((y * 500 + x) * 4, (y * 500 + x) * 4 + 4)];
  assert.deepEqual(at(20, 20), [255, 0, 168, 255]);
  assert.deepEqual(at(30, 30), [255, 48, 48, 255]);
  assert.deepEqual(at(40, 40), [255, 208, 0, 255]);
  assert.deepEqual(at(0, 0), [8, 8, 8, 255]);
});

test("source binds one installed Chromium process and contains no broad pixel threshold", async () => {
  const source = await readFile(path.join(ROOT, "scripts/capture-phase7c-accepted-authority-regression.mjs"), "utf8");
  assert.equal((source.match(/chromium\.launch\(/g) ?? []).length, 1);
  assert.equal((source.match(/browser\.newContext\(/g) ?? []).length, 1);
  assert.equal((source.match(/context\.newPage\(/g) ?? []).length, 1);
  assert.match(source, /SEQUENTIAL_SAME_PROCESS_CONTEXT_PAGE_AND_CONFIGURATION/);
  assert.match(source, /BOUNDED_OBSERVABLE_PREDICATE_STABLE_FOR_THREE_ANIMATION_FRAMES/);
  assert.match(source, /waitForGeometryStability/);
  assert.match(source, /PX_VALUES_QUANTIZED_TO_1_OVER_65536_CSS_PIXEL/);
  assert.match(source, /PASS — EDGE_QUANTIZATION_EQUIVALENT/);
  assert.doesNotMatch(source, /pixelmatch|threshold\s*:/i);
  assert.equal(EDGE_QUANTIZATION_CONTRACT.maximumRgbChannelDelta, 1);
  assert.equal(EDGE_QUANTIZATION_CONTRACT.maximumChangedFraction, 0.0001);
  assert.equal(EDGE_QUANTIZATION_CONTRACT.alphaMustBeExact, true);
});
