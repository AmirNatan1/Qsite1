import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AXE_CASE_COUNT,
  BROWSER_ENGINES,
  CORE_VIEWPORTS,
  EVIDENCE_STATUSES,
  EXTERNAL_EVIDENCE_POLICY,
  FALLBACK_CASE_CHECKS,
  HOME_MARADIN_CHECKS,
  HUMAN_GATE_RECORDS,
  RECORDING_MEDIA_CONTRACT,
  RECORDING_SPECS,
  ROUTE_CASE_CHECKS,
  ROUTE_MATRIX_COUNTS,
  ROUTE_OUTCOMES,
  THRESHOLD_REVERSE_CHECKS,
  allRouteMatrixCases,
  axeCases,
  fallbackCases,
  routeMatrixForEngine,
  safeRelativeEvidencePath,
  validateAxeReport,
  validateBrowserContract,
  validateEvidenceManifest,
  validateEvidenceStatus,
  validateExternalEvidenceIntent,
  validateFallbackReport,
  validateHumanGates,
  validateLifecycleReport,
  validateRecordingReport,
  validateRouteMatrixReport,
} from "../scripts/phase7a-browser-contract.mjs";

const passingChecks = (names) => Object.fromEntries(names.map((name) => [name, true]));

const passingRouteReport = () => ({
  status: "PASS",
  failures: [],
  cases: allRouteMatrixCases().map((authority) => ({
    ...authority,
    actualStatus: authority.expectedStatus,
    status: "PASS",
    failures: [],
    checks: passingChecks(ROUTE_CASE_CHECKS),
  })),
});

const passingAxeReport = () => ({
  status: "PASS",
  failures: [],
  cases: axeCases().map((authority) => ({
    ...authority,
    actualStatus: authority.expectedStatus,
    incompleteCount: 0,
    violations: [],
    status: "PASS",
    failures: [],
  })),
});

const passingFallbackReport = () => ({
  status: "PASS",
  failures: [],
  cases: fallbackCases().map((authority) => ({
    ...authority,
    actualStatus: authority.expectedStatus,
    status: "PASS",
    failures: [],
    checks: passingChecks(FALLBACK_CASE_CHECKS),
  })),
});

const passingRecordingReport = () => ({
  status: "PASS",
  failures: [],
  recordings: RECORDING_SPECS.map((authority) => ({
    ...authority,
    status: "PASS",
    failures: [],
    media: {
      ...RECORDING_MEDIA_CONTRACT,
      durationSeconds: (authority.minimumSeconds + authority.maximumSeconds) / 2,
    },
  })),
});

const passingCycles = (count, names) => Array.from({ length: count }, (_, index) => ({
  cycle: index + 1,
  status: "PASS",
  failures: [],
  checks: passingChecks(names),
}));

const passingLifecycleReport = () => ({
  status: "PASS",
  failures: [],
  thresholdReverse: passingCycles(10, THRESHOLD_REVERSE_CHECKS),
  homeMaradin: passingCycles(10, HOME_MARADIN_CHECKS),
});

test("Phase 7A browser contract freezes routes, viewports, matrices, fallbacks, recordings and cycles", () => {
  const report = validateBrowserContract();
  assert.equal(ROUTE_OUTCOMES.length, 10);
  assert.equal(ROUTE_OUTCOMES.filter(({ public: isPublic }) => isPublic).length, 9);
  assert.equal(ROUTE_OUTCOMES.filter(({ real404 }) => real404).length, 1);
  assert.equal(CORE_VIEWPORTS.length, 13);
  assert.deepEqual(ROUTE_MATRIX_COUNTS, { chromium: 130, firefox: 34, webkit: 34, all: 198 });
  assert.equal(routeMatrixForEngine("chromium").length, 130);
  assert.equal(routeMatrixForEngine("firefox").length, 34);
  assert.equal(routeMatrixForEngine("webkit").length, 34);
  assert.equal(allRouteMatrixCases().length, 198);
  assert.equal(axeCases().length, AXE_CASE_COUNT);
  assert.equal(AXE_CASE_COUNT, 60);
  assert.equal(fallbackCases().length, 51);
  assert.equal(RECORDING_SPECS.length, 14);
  assert.equal(report.thresholdReverseCycles, 10);
  assert.equal(report.homeMaradinCycles, 10);
  assert.equal(report.humanGates, 6);
  assert.equal(BROWSER_ENGINES.find(({ id }) => id === "webkit").evidenceClass, "WEBKIT PROXY");
});

test("route matrix accepts the exact 198-case authority", () => {
  assert.equal(validateRouteMatrixReport(passingRouteReport()), true);
});

test("route matrix rejects missing, duplicate, stale, invalid-status and false-PASS cases", () => {
  const missing = passingRouteReport();
  missing.cases.pop();
  assert.throws(() => validateRouteMatrixReport(missing), /missing .*required case/i);

  const duplicate = passingRouteReport();
  duplicate.cases.push({ ...duplicate.cases[0] });
  assert.throws(() => validateRouteMatrixReport(duplicate), /duplicate case/i);

  const stale = passingRouteReport();
  stale.cases[0].path = "/__phase6-intentional-404__/";
  assert.throws(() => validateRouteMatrixReport(stale), /missing .*required case|stale or unexpected/i);

  const invalidStatus = passingRouteReport();
  invalidStatus.cases[0].status = "NOT APPLICABLE";
  assert.throws(() => validateRouteMatrixReport(invalidStatus), /status is invalid/i);

  const falsePass = passingRouteReport();
  falsePass.cases[0].checks.singleH1 = false;
  assert.throws(() => validateRouteMatrixReport(falsePass), /false PASS/i);
});

test("axe matrix accepts exactly sixty cases and rejects incomplete or false evidence", () => {
  assert.equal(validateAxeReport(passingAxeReport()), true);

  const missing = passingAxeReport();
  missing.cases.shift();
  assert.throws(() => validateAxeReport(missing), /missing .*required case/i);

  const duplicate = passingAxeReport();
  duplicate.cases.push({ ...duplicate.cases[0] });
  assert.throws(() => validateAxeReport(duplicate), /duplicate case/i);

  const incomplete = passingAxeReport();
  incomplete.cases[0].incompleteCount = 1;
  assert.throws(() => validateAxeReport(incomplete), /false PASS/i);

  const falsePass = passingAxeReport();
  falsePass.cases[0].violations.push({ id: "color-contrast", impact: "serious" });
  assert.throws(() => validateAxeReport(falsePass), /false PASS/i);
});

test("reduced-motion, no-JavaScript and fallback-font cases are exact and fail closed", () => {
  const authority = fallbackCases();
  assert.deepEqual(new Set(authority.map(({ variant }) => variant)), new Set(["reduced-motion", "no-javascript", "fallback-fonts"]));
  assert.ok(authority.some(({ targetPath, variant }) => targetPath === "/#entry" && variant === "no-javascript"));
  assert.equal(validateFallbackReport(passingFallbackReport()), true);

  const missing = passingFallbackReport();
  missing.cases.pop();
  assert.throws(() => validateFallbackReport(missing), /missing .*required case/i);

  const duplicate = passingFallbackReport();
  duplicate.cases.push({ ...duplicate.cases[0] });
  assert.throws(() => validateFallbackReport(duplicate), /duplicate case/i);

  const falsePass = passingFallbackReport();
  falsePass.cases[0].checks.networkPolicy = false;
  assert.throws(() => validateFallbackReport(falsePass), /false PASS/i);
});

test("recording authority freezes seven scenarios across Chromium and Firefox", () => {
  assert.deepEqual(new Set(RECORDING_SPECS.map(({ engine }) => engine)), new Set(["chromium", "firefox"]));
  assert.equal(new Set(RECORDING_SPECS.map(({ scenario }) => scenario)).size, 7);
  assert.equal(new Set(RECORDING_SPECS.map(({ relativePath }) => relativePath)).size, 14);
  assert.ok(RECORDING_SPECS.every(({ minimumSeconds, maximumSeconds }) => minimumSeconds < maximumSeconds));
  assert.equal(validateRecordingReport(passingRecordingReport()), true);
});

test("recording validator rejects incomplete cross-products, duplicates and stale paths", () => {
  const missing = passingRecordingReport();
  missing.recordings.pop();
  assert.throws(() => validateRecordingReport(missing), /missing .*required case/i);

  const duplicate = passingRecordingReport();
  duplicate.recordings.push({ ...duplicate.recordings[0] });
  assert.throws(() => validateRecordingReport(duplicate), /duplicate case/i);

  const stale = passingRecordingReport();
  stale.recordings[0].relativePath = "recordings/phase-6/01-home.mp4";
  assert.throws(() => validateRecordingReport(stale), /missing .*required case|stale or unexpected/i);
});

test("recording validator rejects false H.264, pixel-format, audio and duration PASS claims", () => {
  for (const [field, value] of [
    ["codec", "vp9"],
    ["pixelFormat", "yuv444p"],
    ["audioStreams", 1],
    ["fullDecode", false],
    ["durationSeconds", 1],
  ]) {
    const report = passingRecordingReport();
    report.recordings[0].media[field] = value;
    assert.throws(() => validateRecordingReport(report), /false PASS/i, field);
  }
});

test("lifecycle authority requires ten unique threshold/reverse and Home/Maradin cycles", () => {
  assert.equal(validateLifecycleReport(passingLifecycleReport()), true);

  const missing = passingLifecycleReport();
  missing.thresholdReverse.pop();
  assert.throws(() => validateLifecycleReport(missing), /exactly 10 cycles/i);

  const duplicate = passingLifecycleReport();
  duplicate.homeMaradin[9].cycle = 9;
  assert.throws(() => validateLifecycleReport(duplicate), /duplicate cycle/i);

  const falsePass = passingLifecycleReport();
  falsePass.thresholdReverse[0].checks.idleRafZero = false;
  assert.throws(() => validateLifecycleReport(falsePass), /false PASS/i);
});

test("all six human gates are exact and cannot be self-accepted", () => {
  assert.equal(validateHumanGates(HUMAN_GATE_RECORDS), true);
  const accepted = HUMAN_GATE_RECORDS.map((record) => ({ ...record }));
  accepted[0].status = "PASS";
  assert.throws(() => validateHumanGates(accepted), /must remain PENDING HUMAN REVIEW/i);

  const duplicate = HUMAN_GATE_RECORDS.map((record) => ({ ...record }));
  duplicate[5].gate = duplicate[0].gate;
  assert.throws(() => validateHumanGates(duplicate), /duplicate human gate/i);
});

test("status vocabulary excludes Phase 6 NOT APPLICABLE and arbitrary promotion", () => {
  for (const status of EVIDENCE_STATUSES) assert.equal(validateEvidenceStatus(status), status);
  assert.throws(() => validateEvidenceStatus("NOT APPLICABLE"), /invalid/i);
  assert.throws(() => validateEvidenceStatus("ACCEPT"), /invalid/i);
});

test("external evidence policy requires fresh, absolute, outside-repository, untracked output", () => {
  const repositoryRoot = process.cwd();
  const external = path.resolve(repositoryRoot, "..", "phase-7a-browser-evidence", "report.json");
  const intent = { output: external, exists: false, overwrite: false, gitTracked: false };
  assert.equal(validateExternalEvidenceIntent(intent, { repositoryRoot, temporaryRoot: os.tmpdir() }), external);
  assert.equal(EXTERNAL_EVIDENCE_POLICY.archiveFilename, "phase-7a-signal-field-threshold-human-review.zip");

  assert.throws(() => validateExternalEvidenceIntent({ ...intent, output: "relative/report.json" }), /must be absolute/i);
  assert.throws(() => validateExternalEvidenceIntent({ ...intent, output: path.join(repositoryRoot, "report.json") }), /outside the repository/i);
  assert.throws(() => validateExternalEvidenceIntent({ ...intent, output: path.join(os.tmpdir(), "phase7a-report.json") }), /outside OS temporary/i);
  assert.throws(() => validateExternalEvidenceIntent({ ...intent, exists: true }), /must be fresh/i);
  assert.throws(() => validateExternalEvidenceIntent({ ...intent, overwrite: true }), /must not be overwritten/i);
  assert.throws(() => validateExternalEvidenceIntent({ ...intent, gitTracked: true }), /must remain untracked/i);
  assert.throws(() => validateExternalEvidenceIntent({ ...intent, output: path.resolve(repositoryRoot, "..", "phase-6-evidence", "report.json") }), /stale Phase 6 path/i);
});

test("evidence manifest rejects unsafe, duplicate, stale and nested-archive paths", () => {
  const valid = [{ relativePath: "07-browser-matrix/chromium.json", bytes: 42, sha256: "a".repeat(64), status: "PASS" }];
  assert.equal(validateEvidenceManifest(valid), true);
  assert.equal(safeRelativeEvidencePath("11-recordings/chromium/01-complete-threshold-entry.mp4"), "11-recordings/chromium/01-complete-threshold-entry.mp4");

  assert.throws(() => validateEvidenceManifest([...valid, { ...valid[0] }]), /duplicate path/i);
  assert.throws(() => safeRelativeEvidencePath("../escape.json"), /unsafe/i);
  assert.throws(() => safeRelativeEvidencePath("reports\\windows.json"), /POSIX/i);
  assert.throws(() => safeRelativeEvidencePath("phase-6/report.json"), /stale Phase 6 path/i);
  assert.throws(() => safeRelativeEvidencePath("nested/review.zip"), /nested archive/i);
});
