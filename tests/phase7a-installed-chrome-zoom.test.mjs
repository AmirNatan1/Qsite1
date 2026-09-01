import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseArguments,
  selfTest,
  validateFieldMapVisibleLinks,
  validateInstalledChromeCaptureAuthority,
  validateManifestoVisibility,
  validateScreenshotAnalysis,
} from "../scripts/audit-phase7a-installed-chrome-zoom.mjs";
import { portableServedBuildReference } from "../scripts/capture-phase7a-review-evidence.mjs";
import { runtimeAssetSetFingerprint } from "../scripts/capture-phase7a-r1-closure.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISION = "a".repeat(40);

function bounds(left, top, right, bottom) {
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function portableReceipt() {
  const runtimeAssets = [
    { kind: "css", route: "/_astro/site.css", bytes: 1200, sha256: "b".repeat(64) },
    { kind: "javascript", route: "/_astro/site.js", bytes: 2300, sha256: "c".repeat(64) },
  ];
  return {
    schema: "quantum-hub.phase-7a-r1.portable-served-build-receipt.v1",
    status: "PASS",
    branch: "repair/phase-7a-r1-signal-field-authority",
    revision: REVISION,
    document: { relativePath: "dist/index.html", bytes: 18_000, sha256: "d".repeat(64) },
    runtimeFingerprint: runtimeAssetSetFingerprint(runtimeAssets),
    runtimeAssets,
    servedParity: { document: true, runtimeAssets: true },
    freshBuild: {
      command: "npm run build:phase7a-r1",
      headBefore: REVISION,
      headAfter: REVISION,
      worktreeCleanBefore: true,
      worktreeCleanAfter: true,
    },
  };
}

function authorityReport() {
  const servedBuild = portableReceipt();
  const sourceAuthority = portableServedBuildReference(servedBuild);
  const routePaths = [
    "/", "/for-partners/", "/for-startups/", "/industries/", "/pocs/",
    "/pocs/maradin/", "/spark/", "/about/", "/contact/", "/__phase7a-real-404-probe__/",
  ];
  const visualInventory = [
    ["route:/", "home-top.png"],
    ["route:/for-partners/", "for-partners-top.png"],
    ["route:/for-startups/", "for-startups-top.png"],
    ["route:/industries/", "industries-top.png"],
    ["route:/pocs/", "pocs-top.png"],
    ["route:/pocs/maradin/", "pocs-maradin-top.png"],
    ["route:/spark/", "spark-top.png"],
    ["route:/about/", "about-top.png"],
    ["route:/contact/", "contact-top.png"],
    ["route:/__phase7a-real-404-probe__/", "__phase7a-real-404-probe__-top.png"],
    ["home-field-map-closed", "home-field-map-closed.png"],
    ["home-bifurcation", "home-bifurcation.png"],
    ["home-field-map-open", "home-field-map-open.png"],
    ["home-field-map-keyboard-focus", "home-field-map-keyboard-focus.png"],
    ["home-field-map-escape-closed", "home-field-map-escape-closed.png"],
  ];
  return {
    servedBuild,
    sourceAuthority,
    routes: routePaths.map((routePath) => ({ path: routePath, sourceAuthority })),
    visualEvidence: visualInventory.map(([label, filename], index) => ({
      label,
      filename,
      sha256: (index + 1).toString(16).padStart(64, "0"),
      sourceAuthority,
    })),
    fieldMap: { sourceAuthority },
  };
}

test("installed Chrome zoom contract requires native 200% UI authority", () => {
  assert.deepEqual(selfTest(), {
    schema: "quantum-hub.phase-7a.installed-chrome-native-zoom.v1",
    status: "PASS",
    routes: 10,
    method: "installed Chrome native browser zoom",
  });
});

test("installed Chrome zoom contract rejects substitutes and repository output", () => {
  const base = ["--base-url", "http://127.0.0.1:4322/", "--baseline-width", "1388", "--baseline-dpr", "2.5", "--revision", REVISION, "--output", path.resolve(ROOT, "..", "phase7a-zoom")];
  assert.throws(() => parseArguments([...base, "--ui-zoom-label", "Zoom: 175%"]), /Zoom: 200%/);
  assert.throws(() => parseArguments(["--base-url", "http://127.0.0.1:4322/", "--baseline-width", "1388", "--baseline-dpr", "2.5", "--revision", REVISION, "--output", path.join(ROOT, "zoom"), "--ui-zoom-label", "Zoom: 200%"]), /external/);
  assert.throws(() => parseArguments([...base, "--ui-zoom-label", "Zoom: 200%", "--cdp-url", "https://example.com"]), /loopback/);
  assert.throws(() => parseArguments(base.concat("--ui-zoom-label", "Zoom: 200%").filter((value, index, values) => value !== "--revision" && values[index - 1] !== "--revision")), /--revision/);
  assert.throws(() => parseArguments([...base.slice(0, 7), REVISION.toUpperCase(), ...base.slice(8), "--ui-zoom-label", "Zoom: 200%"]), /--revision/);
});

test("installed Chrome capture is bound to one governed served build on every record", () => {
  const report = authorityReport();
  assert.equal(validateInstalledChromeCaptureAuthority(report, REVISION), true);

  const wrongTop = structuredClone(report);
  wrongTop.sourceAuthority.revision = "e".repeat(40);
  assert.throws(() => validateInstalledChromeCaptureAuthority(wrongTop, REVISION), /run source authority differs/);

  const wrongRoute = structuredClone(report);
  wrongRoute.routes[4].sourceAuthority = structuredClone(wrongRoute.routes[4].sourceAuthority);
  wrongRoute.routes[4].sourceAuthority.document.sha256 = "e".repeat(64);
  assert.throws(() => validateInstalledChromeCaptureAuthority(wrongRoute, REVISION), /route 5 source authority differs/);

  const wrongVisual = structuredClone(report);
  wrongVisual.visualEvidence[7].sourceAuthority = structuredClone(wrongVisual.visualEvidence[7].sourceAuthority);
  wrongVisual.visualEvidence[7].sourceAuthority.runtimeFingerprint = "f".repeat(64);
  assert.throws(() => validateInstalledChromeCaptureAuthority(wrongVisual, REVISION), /visual 8 source authority differs/);

  const wrongMap = structuredClone(report);
  wrongMap.fieldMap.sourceAuthority = structuredClone(wrongMap.fieldMap.sourceAuthority);
  wrongMap.fieldMap.sourceAuthority.branch = "redirect/phase-7a-signal-field-threshold";
  assert.throws(() => validateInstalledChromeCaptureAuthority(wrongMap, REVISION), /Field Map source authority differs/);
});

test("installed Chrome capture rejects substituted labels, filenames, and duplicate Home state images", () => {
  const report = authorityReport();
  const renamed = structuredClone(report);
  renamed.visualEvidence[12].filename = "open-eventually.png";
  assert.throws(() => validateInstalledChromeCaptureAuthority(renamed, REVISION), /label\/filename inventory differs/);

  const reordered = structuredClone(report);
  [reordered.visualEvidence[0], reordered.visualEvidence[1]] = [reordered.visualEvidence[1], reordered.visualEvidence[0]];
  assert.throws(() => validateInstalledChromeCaptureAuthority(reordered, REVISION), /label\/filename inventory differs/);

  const openEqualsClosed = structuredClone(report);
  openEqualsClosed.visualEvidence[12].sha256 = openEqualsClosed.visualEvidence[10].sha256;
  assert.throws(() => validateInstalledChromeCaptureAuthority(openEqualsClosed, REVISION), /not visually distinct/);

  const focusEqualsOpen = structuredClone(report);
  focusEqualsOpen.visualEvidence[13].sha256 = focusEqualsOpen.visualEvidence[12].sha256;
  assert.throws(() => validateInstalledChromeCaptureAuthority(focusEqualsOpen, REVISION), /not visually distinct/);

  const openEqualsEscape = structuredClone(report);
  openEqualsEscape.visualEvidence[12].sha256 = openEqualsEscape.visualEvidence[14].sha256;
  assert.throws(() => validateInstalledChromeCaptureAuthority(openEqualsEscape, REVISION), /not visually distinct/);
});

test("installed Chrome Home authority rejects H1 or glyphs hidden below the sticky header", () => {
  const viewportBounds = bounds(0, 0, 519, 399);
  const authority = {
    applicable: true,
    status: "PASS",
    viewportBounds,
    sectionBounds: viewportBounds,
    sectionClipBounds: viewportBounds,
    clippingAncestors: [],
    usableClipBounds: viewportBounds,
    header: {
      bounds: bounds(0, 0, 519, 50),
      position: "sticky",
      visible: true,
      anchoredToViewportTop: true,
      horizontallyOverlapsManifesto: true,
      occluding: true,
    },
    effectiveVisibleBounds: bounds(0, 50, 519, 399),
    h1Bounds: bounds(20, 80, 499, 270),
    glyphBounds: bounds(22, 84, 497, 266),
    safeAllowances: { h1Top: 30, h1Bottom: 129, h1Left: 20, h1Right: 20, glyphTop: 34, glyphBottom: 133, glyphLeft: 22, glyphRight: 22 },
  };
  assert.equal(validateManifestoVisibility(authority), true);
  assert.throws(() => validateManifestoVisibility({ ...authority, status: "FAIL", safeAllowances: { ...authority.safeAllowances, glyphTop: -12 } }), /not fully visible/);
  assert.throws(() => validateManifestoVisibility({ ...authority, h1Bounds: bounds(20, 51.5, 499, 270), safeAllowances: { ...authority.safeAllowances, h1Top: 1.5 } }), /H1 intersect/);
  assert.throws(() => validateManifestoVisibility({ ...authority, glyphBounds: bounds(22, 84, 523, 266), safeAllowances: { ...authority.safeAllowances, glyphRight: -4 } }), /glyphs intersect/);

  const concealedHeader = {
    ...authority,
    header: { ...authority.header, visible: false, occluding: false },
    effectiveVisibleBounds: viewportBounds,
    safeAllowances: { ...authority.safeAllowances, h1Top: 80, glyphTop: 84 },
  };
  assert.equal(validateManifestoVisibility(concealedHeader), true);
  assert.throws(
    () => validateManifestoVisibility({ ...concealedHeader, header: { ...concealedHeader.header, occluding: true } }),
    /occlusion authority differs/,
  );
  assert.throws(
    () => validateManifestoVisibility({ ...authority, header: { ...authority.header, occluding: false } }),
    /occlusion authority differs/,
  );
  assert.throws(
    () => validateManifestoVisibility({ ...concealedHeader, sectionClipBounds: bounds(0, 10, 519, 399) }),
    /usable clip top differs/,
  );
  assert.throws(
    () => validateManifestoVisibility({ ...concealedHeader, header: { ...concealedHeader.header, anchoredToViewportTop: false } }),
    /anchor authority differs/,
  );
  assert.throws(
    () => validateManifestoVisibility({ ...concealedHeader, safeAllowances: { ...concealedHeader.safeAllowances, h1Top: 79 } }),
    /safe allowance authority differs/,
  );
});

test("installed Chrome open Field Map requires eight uniquely named links fully visible in the viewport", () => {
  const links = Array.from({ length: 8 }, (_, index) => ({
    accessibleName: `Destination ${index + 1}`,
    visible: true,
    fullyInViewport: true,
    bounds: { width: 180, height: 44 },
  }));
  assert.equal(validateFieldMapVisibleLinks(links), true);
  assert.throws(() => validateFieldMapVisibleLinks(links.slice(0, 7)), /exactly eight/);
  assert.throws(() => validateFieldMapVisibleLinks(links.map((link, index) => index === 7 ? { ...link, fullyInViewport: false } : link)), /not fully visible/);
  assert.throws(() => validateFieldMapVisibleLinks(links.map((link) => ({ ...link, accessibleName: "Same" }))), /not unique/);
});

test("installed Chrome visual evidence rejects decoded but blank screenshots", () => {
  assert.equal(validateScreenshotAnalysis({ format: "png", bytes: 10_000, width: 2595, height: 1995, entropy: 4.2, maximumChannelRange: 245 }), true);
  assert.throws(() => validateScreenshotAnalysis({ format: "png", bytes: 2_000, width: 519, height: 399, entropy: 0.02, maximumChannelRange: 8 }), /blank or uniform/);
});
