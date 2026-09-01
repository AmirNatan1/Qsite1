import assert from "node:assert/strict";
import test from "node:test";

import {
  TARGET_EXCLUSION_REASONS,
  TARGET_MINIMUM_CSS_PIXELS,
  TARGET_SELECTOR,
  TARGET_SIZE_SCHEMA,
  VALID_TARGET_EXCLUSION_REASONS,
  assertTargetSizePass,
  observeTargetSizeCandidates,
  observeTargetSizes,
  validateTargetSizeObservation,
  validateTargetSizeRecords,
} from "../scripts/phase7a-target-size.mjs";

const emptyBasis = () => ({
  effectiveInert: false,
  nativeDisabled: false,
  hiddenAttribute: false,
  cssDisplayNone: false,
  cssVisibilityHidden: false,
  cssContentVisibilityHidden: false,
  closedDetails: false,
  inputTypeHidden: false,
  pointerEventsNone: false,
  zeroOpacity: false,
  ariaHidden: false,
});

const record = (overrides = {}) => ({
  route: "/about/",
  viewport: { id: "mobile-390x844", width: 390, height: 844 },
  state: "field-map-open",
  selector: "main > a:nth-of-type(1)",
  accessibleName: "For industry",
  elementType: "a",
  width: 43,
  height: 44,
  visibility: true,
  intendedInteractive: true,
  exclusionReason: null,
  exclusionBasis: emptyBasis(),
  role: null,
  type: null,
  ...overrides,
});

const excluded = (reasonKey, overrides = {}) => {
  const reason = TARGET_EXCLUSION_REASONS[reasonKey];
  return record({
    intendedInteractive: false,
    exclusionReason: reason,
    exclusionBasis: { ...emptyBasis(), [reasonKey]: true },
    ...overrides,
  });
};

test("target-size authority exports a browser-complete target selector", () => {
  assert.equal(TARGET_SIZE_SCHEMA, "quantum-hub.phase-7a-r1.target-size.v1");
  assert.equal(TARGET_MINIMUM_CSS_PIXELS, 44);
  for (const selector of ["a[href]", "button", "summary", "input", "[role='button']", "[tabindex]"]) {
    assert.ok(TARGET_SELECTOR.includes(selector), selector);
  }
  assert.match(String(observeTargetSizeCandidates), /pointerEventsNone/);
  assert.match(String(observeTargetSizeCandidates), /ariaHidden/);
  assert.match(String(observeTargetSizeCandidates), /closedDetails/);
});

test("an intended interactive target below 44 CSS pixels fails closed", () => {
  const report = validateTargetSizeRecords([record()]);
  assert.equal(report.status, "FAIL");
  assert.equal(report.targetFailures.length, 1);
  assert.equal(report.unexplainedExclusions.length, 0);
  assert.deepEqual(report.summary, {
    belowMinimum: 1,
    targetFailures: 1,
    validExclusions: 0,
    unexplainedExclusions: 0,
    contractFailures: 0,
  });
  assert.throws(() => assertTargetSizePass([record()]), /1 active/);
});

test("effective inert, native disabled, hidden and closed controls are valid documented exclusions", () => {
  const fixtures = Object.keys(TARGET_EXCLUSION_REASONS).map((reasonKey, index) => excluded(reasonKey, {
    selector: `body > target:nth-of-type(${index + 1})`,
  }));
  const report = validateTargetSizeRecords(fixtures);
  assert.equal(report.status, "PASS");
  assert.equal(report.validExclusions.length, fixtures.length);
  assert.equal(report.targetFailures.length, 0);
  assert.equal(report.unexplainedExclusions.length, 0);
  assert.deepEqual(new Set(VALID_TARGET_EXCLUSION_REASONS), new Set(Object.values(TARGET_EXCLUSION_REASONS)));
  assert.equal(assertTargetSizePass(fixtures).status, "PASS");
});

test("pointer-events, zero opacity and aria-hidden alone never excuse an undersized target", () => {
  for (const field of ["pointerEventsNone", "zeroOpacity", "ariaHidden"]) {
    const candidate = record({
      visibility: field === "zeroOpacity" ? false : true,
      exclusionBasis: { ...emptyBasis(), [field]: true },
    });
    const report = validateTargetSizeRecords([candidate]);
    assert.equal(report.status, "FAIL", field);
    assert.equal(report.targetFailures.length, 1, field);
    assert.equal(report.validExclusions.length, 0, field);
  }
});

test("an attempted pointer-events or aria-hidden exclusion is unexplained and fails", () => {
  for (const [field, reason] of [["pointerEventsNone", "pointer events none"], ["zeroOpacity", "zero opacity"], ["ariaHidden", "aria hidden"]]) {
    const candidate = record({
      intendedInteractive: false,
      exclusionReason: reason,
      exclusionBasis: { ...emptyBasis(), [field]: true },
    });
    const report = validateTargetSizeRecords([candidate]);
    assert.equal(report.status, "FAIL", field);
    assert.equal(report.unexplainedExclusions.length, 1, field);
  }
});

test("exclusions require both an approved reason and matching observed basis", () => {
  const missingReason = record({ intendedInteractive: false, exclusionReason: null });
  const inventedBasis = excluded("effectiveInert", { exclusionBasis: emptyBasis() });
  const report = validateTargetSizeRecords([missingReason, inventedBasis]);
  assert.equal(report.status, "FAIL");
  assert.equal(report.unexplainedExclusions.length, 2);
  assert.ok(report.contractFailures.some((message) => /excluded without a reason/.test(message)));
});

test("the pure contract requires provenance, geometry, semantics and exclusion evidence", () => {
  const incomplete = record();
  delete incomplete.accessibleName;
  delete incomplete.exclusionBasis.pointerEventsNone;
  const notBelowMinimum = record({ selector: "main > a:nth-of-type(2)", width: 44, height: 44 });
  const report = validateTargetSizeRecords([incomplete, notBelowMinimum]);
  assert.equal(report.status, "FAIL");
  assert.ok(report.contractFailures.some((message) => /accessible name/.test(message)));
  assert.ok(report.contractFailures.some((message) => /pointerEventsNone/.test(message)));
  assert.ok(report.contractFailures.some((message) => /not below/.test(message)));
});

test("observation validation binds candidate count and minimum authority", () => {
  const passing = validateTargetSizeObservation({ candidateCount: 9, minimumCssPixels: 44, records: [excluded("effectiveInert")] });
  assert.equal(passing.status, "PASS");
  assert.equal(passing.candidateCount, 9);

  const impossible = validateTargetSizeObservation({ candidateCount: 0, minimumCssPixels: 44, records: [excluded("effectiveInert")] });
  assert.equal(impossible.status, "FAIL");
  assert.ok(impossible.contractFailures.some((message) => /candidateCount is smaller/.test(message)));

  const wrongMinimum = validateTargetSizeObservation({ candidateCount: 1, minimumCssPixels: 48, records: [record()] });
  assert.equal(wrongMinimum.status, "FAIL");
  assert.ok(wrongMinimum.contractFailures.some((message) => /minimum differs/.test(message)));
});

test("browser wrapper evaluates the self-contained observer and returns a validated report", async () => {
  const calls = [];
  const page = {
    async evaluate(callback, context) {
      calls.push({ callback, context });
      return { candidateCount: 4, minimumCssPixels: context.minimumCssPixels, records: [excluded("closedDetails")] };
    },
  };
  const report = await observeTargetSizes(page, {
    route: "/contact/",
    viewport: { id: "narrow", width: 320, height: 800 },
    state: "closed-map",
  });
  assert.equal(report.status, "PASS");
  assert.equal(report.candidateCount, 4);
  assert.strictEqual(calls[0].callback, observeTargetSizeCandidates);
  assert.equal(calls[0].context.minimumCssPixels, 44);
  await assert.rejects(() => observeTargetSizes({}, {}), /evaluate/);
});

test("duplicate records and non-array evidence cannot be promoted to PASS", () => {
  const duplicate = excluded("effectiveInert");
  assert.equal(validateTargetSizeRecords([duplicate, structuredClone(duplicate)]).status, "FAIL");
  assert.equal(validateTargetSizeRecords(null).status, "FAIL");
});
