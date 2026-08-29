import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CANARY,
  CAPTURE_SCHEMA,
  CROSS_ROUTE_ARTIFACTS,
  EXPECTED_REVIEW_PATHS,
  MANIFEST_SCHEMA,
  REQUEST_SCHEMA,
  ROOT,
  ROUTE_ARTIFACTS,
  SHORT_LANDSCAPE_IDS,
  VALIDATION_SCENARIOS,
  assertContainedPath,
  assertDurableExternalPath,
  assertLoopbackUrl,
  renderRouteBriefDelta,
  validateArtifactLedger,
  validateRequestIsolation,
  validateResponsiveCoverage,
} from "../scripts/capture-phase5ar-supporting-routes.mjs";
import { ROUTE_ORDER, ROUTES, VIEWPORTS } from "../prototypes/phase-5a-r-supporting-routes/route-data.mjs";

const HASH = "a".repeat(64);

test("capture contract is exactly nine route folders times seven plus seven cross-route artifacts", () => {
  assert.equal(CANARY, "QH_PHASE5AR_ROUTE_LAB_ONLY");
  assert.equal(CAPTURE_SCHEMA, "qh.phase5ar.route-preproduction-capture.v1");
  assert.equal(MANIFEST_SCHEMA, "qh.phase5ar.route-preproduction-manifest.v1");
  assert.equal(REQUEST_SCHEMA, "qh.phase5ar.route-request-isolation.v1");
  assert.equal(ROUTE_ORDER.length, 9);
  assert.equal(ROUTE_ARTIFACTS.length, 7);
  assert.equal(CROSS_ROUTE_ARTIFACTS.length, 7);
  assert.equal(EXPECTED_REVIEW_PATHS.length, 70);
  assert.equal(new Set(EXPECTED_REVIEW_PATHS).size, 70);
  assert.deepEqual(ROUTE_ARTIFACTS, [
    "route-brief-delta.md",
    "desktop-storyboard--1440x900.png",
    "mobile-storyboard--390x844.png",
    "narrow-overture--320x800.png",
    "short-landscape-overture-sheet.png",
    "signature-states-sheet.png",
    "material-board.png",
  ]);
  assert.deepEqual(CROSS_ROUTE_ARTIFACTS, [
    "PHASE_5A_R_ROUTE_COHERENCE_MATRIX.md",
    "PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md",
    "all-routes-desktop-contact-sheet.png",
    "all-routes-mobile-contact-sheet.png",
    "all-routes-short-landscape-contact-sheet.png",
    "motion-comparison-board.png",
    "material-comparison-board.png",
  ]);
});

test("artifact ledger hashes exactly 70 review artifacts and excludes reports", () => {
  const records = EXPECTED_REVIEW_PATHS.map((relativePath) => ({ relativePath, bytes: 1, sha256: HASH }));
  assert.equal(validateArtifactLedger(records), true);
  assert.throws(() => validateArtifactLedger([...records, { relativePath: "reports/extra.json", bytes: 1, sha256: HASH }]), /exactly 70/);
  assert.throws(() => validateArtifactLedger(records.map((record, index) => index === 0 ? { ...record, sha256: "bad" } : record)), /invalid SHA-256/);
  assert.throws(() => validateArtifactLedger(records.map((record, index) => index === 1 ? { ...record, relativePath: records[0].relativePath } : record)), /paths differ|unique/);
});

test("output and write-boundary guards reject repository, temp, and escaped paths", () => {
  assert.throws(() => assertDurableExternalPath(path.join(ROOT, "artifacts", "phase5ar")), /outside the repository/);
  assert.throws(() => assertDurableExternalPath(path.join(tmpdir(), "phase5ar-route-capture")), /outside the OS temporary directory/);
  const external = assertDurableExternalPath(path.resolve(ROOT, "..", "phase5ar-route-capture-test"));
  assert.ok(path.isAbsolute(external));
  const staging = path.join(external, "staging");
  assert.equal(assertContainedPath(staging, path.join(staging, "routes", "404", "material-board.png")), path.resolve(staging, "routes", "404", "material-board.png"));
  assert.throws(() => assertContainedPath(staging, path.join(staging, "..", "escape.png")), /escapes/);
});

test("request isolation permits only the exact loopback origin and rejects external, cinematic, failed, blocked, or HTTP-error traffic", () => {
  const baseUrl = "http://127.0.0.1:4176/";
  assert.equal(assertLoopbackUrl(baseUrl).origin, "http://127.0.0.1:4176");
  for (const disallowed of ["https://127.0.0.1:4176/", "http://localhost:4176/", "https://example.com/"]) {
    assert.throws(() => assertLoopbackUrl(disallowed), /loopback-only/);
  }
  const valid = {
    requests: [{ url: `${baseUrl}for-partners/`, resourceType: "document" }, { url: `${baseUrl}shared/system.css`, resourceType: "stylesheet" }],
    responses: [{ url: `${baseUrl}for-partners/`, status: 200 }, { url: `${baseUrl}shared/system.css`, status: 200 }],
    failed: [],
    blocked: [],
  };
  assert.equal(validateRequestIsolation(valid, baseUrl).status, "PASS");
  assert.throws(() => validateRequestIsolation({ ...valid, requests: [...valid.requests, { url: "https://example.com/a.js", resourceType: "script" }] }, baseUrl), /request isolation failed/);
  assert.throws(() => validateRequestIsolation({ ...valid, requests: [...valid.requests, { url: `${baseUrl}phase-4-cinematic.mp4`, resourceType: "media" }] }, baseUrl), /request isolation failed/);
  assert.throws(() => validateRequestIsolation({ ...valid, responses: [{ url: `${baseUrl}missing`, status: 404 }] }, baseUrl), /request isolation failed/);
  assert.throws(() => validateRequestIsolation({ ...valid, failed: [{ url: `${baseUrl}x`, failure: "ERR_FAILED" }] }, baseUrl), /request isolation failed/);
  assert.throws(() => validateRequestIsolation({ ...valid, blocked: [{ url: "https://example.com/x" }] }, baseUrl), /request isolation failed/);
});

test("responsive coverage binds 13 sizes, five short-landscape neighbors, static variants, keyboard, 44px, and axe intent", () => {
  assert.equal(VIEWPORTS.length, 13);
  assert.deepEqual(SHORT_LANDSCAPE_IDS, ["landscape-740", "landscape-800", "landscape-844", "landscape-896", "landscape-900"]);
  for (const required of ["200% text", "fallback font", "reduced motion", "no JavaScript", "desktop keyboard", "mobile keyboard", "44px targets", "axe WCAG 2 A/AA", "same-origin request isolation"]) {
    assert.ok(VALIDATION_SCENARIOS.includes(required), required);
  }
  const plan = { validationViewports: VIEWPORTS };
  const report = {
    status: "PASS",
    issueCount: 0,
    routes: ROUTE_ORDER,
    coverage: {
      capturePlanViewports: 13,
      baseObservations: 117,
      text200: 9,
      fallbackFont: 9,
      reducedMotion: 9,
      noJs: 9,
      keyboard: 18,
    },
  };
  assert.equal(validateResponsiveCoverage(report, plan), true);
  assert.throws(() => validateResponsiveCoverage({ ...report, coverage: { ...report.coverage, keyboard: 9 } }, plan), /keyboard QA/);
  assert.throws(() => validateResponsiveCoverage({ ...report, issueCount: 1 }, plan), /unresolved diagnostics/);
});

test("every route brief is a delta that preserves public freeze, Phase 5B boundary, and route-specific architecture", () => {
  for (const slug of ROUTE_ORDER) {
    const markdown = renderRouteBriefDelta(ROUTES[slug]);
    assert.ok(markdown.includes(`Route ID: \`${slug}\``));
    assert.match(markdown, /public supporting route unchanged and frozen/i);
    assert.match(markdown, /Phase 5B unauthorized/i);
    assert.match(markdown, /document-architecture delta/i);
    assert.match(markdown, /short-landscape strategy/i);
    assert.match(markdown, /Human visual judgment remains authoritative/i);
    assert.ok(markdown.includes(ROUTES[slug].architecture.overtureTopology));
    assert.ok(markdown.includes(ROUTES[slug].architecture.antiTemplateDistinction));
    assert.ok(markdown.includes(ROUTES[slug].shortLandscape.strategy));
    assert.ok(ROUTES[slug].signatureStates.length >= 4 && ROUTES[slug].signatureStates.length <= 6);
  }
});

test("capture implementation is import-safe, external-only, and contains no public/package mutation primitive", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "capture-phase5ar-supporting-routes.mjs"), "utf8");
  assert.match(source, /if \(process\.argv\[1\].*fileURLToPath\(import\.meta\.url\)\)/s);
  assert.match(source, /verifyPublicSourceFreeze\(ROOT\)/);
  assert.match(source, /rawCapturesPackaged: false/);
  assert.match(source, /phase5BAuthorized: false/);
  assert.doesNotMatch(source, /git\s+(?:add|commit|push|checkout|switch|merge)|wrangler|cloudflare|npm\s+(?:install|publish)/i);
  assert.doesNotMatch(source, /writeFile\([^\n]*(?:src[\\/]|public[\\/]|package\.json)/i);
});
