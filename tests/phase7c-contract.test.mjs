import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE7C_ALLOWED_STATUSES,
  PHASE7C_BRANCH,
  PHASE7C_CORE_VIEWPORTS,
  PHASE7C_CYCLE_COUNT,
  PHASE7C_DOCUMENTARY_ASSET,
  PHASE7C_ENGINES,
  PHASE7C_FROZEN_MAIN,
  PHASE7C_GATES,
  PHASE7C_INDUSTRIES,
  PHASE7C_MACRO_STATES,
  PHASE7C_PARENT,
  PHASE7C_PERFORMANCE_BUDGET,
  PHASE7C_PROOF_RECORD,
  PHASE7C_RECORDING_SCENARIOS,
  PHASE7C_REQUIRED_NODE,
  PHASE7C_REVIEW_ZIP_NAME,
  PHASE7C_STATE_SAMPLES,
} from "../scripts/phase7c-contract.mjs";

test("Phase 7C freezes repository, runtime and package authority", () => {
  assert.equal(PHASE7C_BRANCH, "feature/phase-7c-territory-proof-threshold");
  assert.equal(PHASE7C_PARENT, "0994a5887fa90a4558275f3e66857aca5b4d4de9");
  assert.equal(PHASE7C_FROZEN_MAIN, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(PHASE7C_REQUIRED_NODE, "22.16.0");
  assert.equal(PHASE7C_REVIEW_ZIP_NAME, "phase-7c-territory-proof-threshold-human-review.zip");
});

test("Phase 7C exposes exactly four governed industries and one Proof record", () => {
  assert.deepEqual(PHASE7C_INDUSTRIES, [
    "Automotive & Mobility",
    "Logistics & Supply Chain",
    "Industry 4.0 / Advanced Manufacturing",
    "Energy & Infrastructure",
  ]);
  assert.equal(PHASE7C_PROOF_RECORD, "Maradin — Dynamic Ground Projection");
  assert.equal(new Set(PHASE7C_INDUSTRIES).size, 4);
});

test("Phase 7C freezes the complete state, viewport, engine and recording matrix", () => {
  assert.equal(PHASE7C_MACRO_STATES.length, 10);
  assert.deepEqual(PHASE7C_STATE_SAMPLES.map(([state]) => state), PHASE7C_MACRO_STATES);
  assert.equal(PHASE7C_CORE_VIEWPORTS.length, 13);
  assert.deepEqual(PHASE7C_CORE_VIEWPORTS[0], [1440, 900]);
  assert.deepEqual(PHASE7C_CORE_VIEWPORTS.at(-1), [900, 480]);
  assert.deepEqual(PHASE7C_ENGINES, ["chromium", "firefox", "webkit-proxy"]);
  assert.equal(PHASE7C_RECORDING_SCENARIOS.length, 12);
  assert.equal(PHASE7C_CYCLE_COUNT, 10);
});

test("Phase 7C retains the exact six pending human gates and closed status vocabulary", () => {
  assert.deepEqual(PHASE7C_GATES, [
    "TERRITORY CARRIER CONTINUITY",
    "FOUR-INDUSTRY SPATIAL AUTHORITY",
    "ABSTRACT-TO-DOCUMENTARY PROOF AUTHORITY",
    "NATIVE-SCROLL + REVERSE INTEGRITY",
    "RESPONSIVE + ACCESSIBLE AUTHORSHIP",
    "PERFORMANCE + GOVERNANCE + REGRESSION SAFETY",
  ]);
  assert.ok(PHASE7C_ALLOWED_STATUSES.includes("PENDING HUMAN REVIEW"));
  assert.ok(PHASE7C_ALLOWED_STATUSES.includes("NOT AVAILABLE TO EXECUTION ENVIRONMENT"));
  assert.equal(PHASE7C_ALLOWED_STATUSES.includes("ACCEPT"), false);
});

test("Phase 7C budgets forbid dependency, asset, clock, observer and CLS expansion", () => {
  assert.equal(PHASE7C_PERFORMANCE_BUDGET.runtimeDependencyDelta, 0);
  assert.equal(PHASE7C_PERFORMANCE_BUDGET.newAssetFileDelta, 0);
  assert.equal(PHASE7C_PERFORMANCE_BUDGET.newAssetByteDelta, 0);
  assert.equal(PHASE7C_PERFORMANCE_BUDGET.idleRafMaximum, 0);
  assert.equal(PHASE7C_PERFORMANCE_BUDGET.idleIntervalMaximum, 0);
  assert.equal(PHASE7C_PERFORMANCE_BUDGET.activeObserverMaximum, 0);
  assert.equal(PHASE7C_PERFORMANCE_BUDGET.clsMaximum, 0.01);
});

test("Phase 7C selects only the governed low-cost Maradin poster", () => {
  assert.deepEqual(PHASE7C_DOCUMENTARY_ASSET, {
    path: "public/media/maradin/maradin-field-aperture-poster-approved.jpg",
    bytes: 86_343,
    sha256: "6afc1a69570f2541b89b4f6a5074bec04a5d607743d91670321f550b4d6364bd",
    width: 1920,
    height: 1080,
    decision: "ACCEPT",
  });
});
