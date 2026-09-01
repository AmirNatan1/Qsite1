import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  PHASE7A_R2_QA_SOURCE_SCHEMA,
  PHASE7A_R2_RETAINED_QA_SCHEMA,
  SCHEMA,
  distLedgerFingerprint,
  normalizePhase7aR2RetainedQaReport,
  parseArguments,
  qaReportSha256,
  r2QaSourceAuthorityReference,
  selfTest,
  servedLedgerFingerprint,
  validateQaServedBuildBindings,
  validateR2QaSourceAuthority,
} from "../scripts/qa-phase7a-browser.mjs";
import { PHASE7A_R2_BRANCH } from "../scripts/phase7a-contract.mjs";

const REVISION = "a".repeat(40);
const external = (name) => path.resolve(process.cwd(), "..", `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);

function sourceAuthority() {
  const files = [
    { relativePath: "_astro/app.css", bytes: 11, sha256: "1".repeat(64) },
    { relativePath: "_astro/app.js", bytes: 13, sha256: "2".repeat(64) },
    { relativePath: "index.html", bytes: 17, sha256: "3".repeat(64) },
  ];
  const assets = [
    { route: "/", relativePath: "index.html", httpStatus: 200, contentType: "text/html", bytes: 17, sha256: "3".repeat(64) },
    { route: "/_astro/app.css", relativePath: "_astro/app.css", httpStatus: 200, contentType: "text/css", bytes: 11, sha256: "1".repeat(64) },
    { route: "/_astro/app.js", relativePath: "_astro/app.js", httpStatus: 200, contentType: "text/javascript", bytes: 13, sha256: "2".repeat(64) },
  ];
  const fingerprint = distLedgerFingerprint(files);
  const repository = { branch: PHASE7A_R2_BRANCH, head: REVISION, upstream: `origin/${PHASE7A_R2_BRANCH}`, upstreamRevision: REVISION, worktreeClean: true, status: [], distFingerprint: fingerprint };
  return {
    schema: PHASE7A_R2_QA_SOURCE_SCHEMA,
    status: "PASS",
    authorityProfile: "phase7a-r2",
    branch: PHASE7A_R2_BRANCH,
    revision: REVISION,
    runBoundary: { start: { ...repository }, end: { ...repository }, stable: true },
    dist: { root: "dist", fileCount: files.length, totalBytes: 41, fingerprint, files },
    served: { assetCount: assets.length, fingerprint: servedLedgerFingerprint(assets), parity: true, assets },
  };
}

function rawReport(engine = "chromium") {
  const source = sourceAuthority();
  const result = {
    identity: { engine },
    routes: [{ status: "PASS" }],
    accessibility: [{ status: "PASS" }],
    responsive: engine === "chromium"
      ? [{ viewport: { width: 800, height: 360 }, checks: { verticalClipping: true }, status: "PASS" }]
      : [{ viewport: { width: 1440, height: 900 }, checks: {}, status: "PASS" }],
    fieldMap: { status: "PASS" },
    fallback: { reducedMotion: { status: "PASS" }, noJavaScript: { status: "PASS" }, fallbackFont: { status: "PASS" } },
    history: { status: "PASS" },
    cycles: { status: "PASS", samples: Array.from({ length: 10 }, (_, index) => ({ cycle: index + 1 })) },
    network: [{ status: "PASS" }, { status: "PASS" }],
    failures: [],
    status: "PASS",
    sourceAuthority: r2QaSourceAuthorityReference(source),
  };
  const report = {
    schema: SCHEMA,
    authorityProfile: "phase7a-r2",
    branch: PHASE7A_R2_BRANCH,
    revision: REVISION,
    captureOrigin: "http://127.0.0.1:4397/",
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:01:00.000Z",
    results: [result],
    sourceAuthority: source,
    limitations: [],
    humanGates: {},
    status: "PASS",
  };
  report.reportSha256 = qaReportSha256(report);
  return report;
}

test("R2 CLI requires an exact final revision while legacy and R1 parsing remain available", () => {
  assert.throws(() => parseArguments(["--authority-profile", "phase7a-r2", "--output", external("r2-missing")]), /exact 40-character final R2 HEAD/);
  assert.equal(parseArguments(["--authority-profile", "phase7a-r2", "--revision", REVISION, "--output", external("r2")]).revision, REVISION);
  assert.equal(parseArguments(["--authority-profile", "phase7a-r1", "--revision", REVISION, "--output", external("r1")]).authorityProfile, "phase7a-r1");
  assert.equal(parseArguments(["--authority-profile", "phase7a", "--output", external("legacy")]).authorityProfile, "phase7a");
});

test("R2 source receipt binds clean exact upstream authority, a sorted dist ledger and served bytes", () => {
  const source = sourceAuthority();
  assert.equal(validateR2QaSourceAuthority(source, REVISION), true);
  const stale = structuredClone(source);
  stale.dist.files[0].sha256 = "f".repeat(64);
  assert.throws(() => validateR2QaSourceAuthority(stale, REVISION), /fingerprint|binding/i);
  const dirty = structuredClone(source);
  dirty.runBoundary.end.worktreeClean = false;
  assert.throws(() => validateR2QaSourceAuthority(dirty, REVISION), /not clean/i);
});

test("raw final R2 reports normalize deterministically and fail closed on any asserted or cryptographic drift", () => {
  for (const engine of ["chromium", "firefox", "webkit"]) {
    const report = rawReport(engine);
    assert.equal(validateQaServedBuildBindings(report), true);
    const normalized = normalizePhase7aR2RetainedQaReport(report, { expectedEngine: engine, expectedRevision: REVISION });
    assert.equal(normalized.schema, PHASE7A_R2_RETAINED_QA_SCHEMA);
    assert.equal(normalized.rawReportSha256, report.reportSha256);
    assert.equal(normalized.source.dist.fingerprint, report.sourceAuthority.dist.fingerprint);
    assert.equal(normalized.checks.shortLandscape800x360, true);
    assert.equal(normalized.failures, 0);
  }
  const tampered = rawReport("chromium");
  tampered.results[0].status = "FAIL";
  assert.throws(() => normalizePhase7aR2RetainedQaReport(tampered, { expectedEngine: "chromium", expectedRevision: REVISION }), /SHA-256|engine result/i);
  const handAsserted = rawReport("chromium");
  handAsserted.results[0].responsive = [];
  handAsserted.reportSha256 = qaReportSha256(handAsserted);
  assert.throws(() => normalizePhase7aR2RetainedQaReport(handAsserted, { expectedEngine: "chromium", expectedRevision: REVISION }), /responsive cases/i);
});

test("self-test publishes the enhanced R1/R2 responsive and normalized evidence contracts", () => {
  const report = selfTest();
  assert.deepEqual(report.enhancedResponsiveProfiles, ["phase7a-r1", "phase7a-r2"]);
  assert.equal(report.r2SourceSchema, PHASE7A_R2_QA_SOURCE_SCHEMA);
  assert.equal(report.r2NormalizedSchema, PHASE7A_R2_RETAINED_QA_SCHEMA);
});
