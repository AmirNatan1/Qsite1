import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE7B_ALLOWED_STATUSES,
  PHASE7B_BRANCH,
  PHASE7B_BRANCH_PREVIEW,
  PHASE7B_CORE_VIEWPORTS,
  PHASE7B_CYCLE_COUNT,
  PHASE7B_ENGINES,
  PHASE7B_FROZEN_MAIN,
  PHASE7B_GATES,
  PHASE7B_MACRO_STATES,
  PHASE7B_METHOD_STAGES,
  PHASE7B_PARENT,
  PHASE7B_PERFORMANCE_BUDGET,
  PHASE7B_RECORDING_SCENARIOS,
  PHASE7B_REQUIRED_NODE,
  PHASE7B_REVIEW_ZIP_NAME,
  PHASE7B_STAGE_RANGES,
} from "../scripts/phase7b-contract.mjs";

test("Phase 7B freezes branch, parent, main, runtime and package authority", () => {
  assert.equal(PHASE7B_BRANCH, "feature/phase-7b-operating-field-workpiece");
  assert.equal(PHASE7B_PARENT, "626812c85f84ee8a48228a1f168d58c07d7943e7");
  assert.equal(PHASE7B_FROZEN_MAIN, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(PHASE7B_REQUIRED_NODE, "22.16.0");
  assert.equal(PHASE7B_REVIEW_ZIP_NAME, "phase-7b-operating-field-workpiece-human-review.zip");
  assert.equal(PHASE7B_BRANCH_PREVIEW, "https://feature-phase-7b-operating-f.qsite1.pages.dev/");
});

test("Phase 7B exposes only the five accepted METHOD stages inside seven macro states", () => {
  assert.deepEqual(PHASE7B_METHOD_STAGES, ["FRAME", "SOURCE", "ASSESS", "TEST", "DECIDE"]);
  assert.deepEqual(PHASE7B_MACRO_STATES, ["OPEN_FIELD", "FRAME", "SOURCE", "ASSESS", "TEST", "DECIDE", "RELEASE"]);
  assert.equal(Object.keys(PHASE7B_STAGE_RANGES).length, 7);
  let previousEnd = 0;
  for (const state of PHASE7B_MACRO_STATES) {
    const [start, end] = PHASE7B_STAGE_RANGES[state];
    assert.equal(start, previousEnd, `${state} must begin where the previous range ends`);
    assert.ok(end > start && end <= 1, `${state} range is invalid`);
    previousEnd = end;
  }
  assert.equal(previousEnd, 1);
});

test("Phase 7B freezes the responsive, recording, engine and cycle matrix", () => {
  assert.equal(PHASE7B_CORE_VIEWPORTS.length, 13);
  assert.deepEqual(PHASE7B_CORE_VIEWPORTS[0], [1440, 900]);
  assert.deepEqual(PHASE7B_CORE_VIEWPORTS.at(-1), [900, 480]);
  assert.equal(PHASE7B_RECORDING_SCENARIOS.length, 10);
  assert.deepEqual(PHASE7B_ENGINES, ["chromium", "firefox", "webkit-proxy"]);
  assert.equal(PHASE7B_CYCLE_COUNT, 10);
});

test("all Phase 7B gates remain pending human review under a closed status vocabulary", () => {
  assert.equal(PHASE7B_GATES.length, 6);
  assert.ok(PHASE7B_ALLOWED_STATUSES.includes("PENDING HUMAN REVIEW"));
  assert.ok(PHASE7B_ALLOWED_STATUSES.includes("NOT AVAILABLE TO EXECUTION ENVIRONMENT"));
  assert.equal(PHASE7B_ALLOWED_STATUSES.includes("ACCEPT"), false);
});

test("Phase 7B performance budgets bind one METHOD module request while forbidding dependencies, assets and idle clocks", () => {
  assert.equal(PHASE7B_PERFORMANCE_BUDGET.runtimeDependencyDelta, 0);
  assert.equal(PHASE7B_PERFORMANCE_BUDGET.runtimeRequestDelta, 1);
  assert.equal(PHASE7B_PERFORMANCE_BUDGET.assetByteDelta, 0);
  assert.equal(PHASE7B_PERFORMANCE_BUDGET.idleRafMaximum, 0);
  assert.equal(PHASE7B_PERFORMANCE_BUDGET.idleIntervalMaximum, 0);
  assert.ok(PHASE7B_PERFORMANCE_BUDGET.rawJavaScriptDeltaMaximum <= 12_000);
  assert.ok(PHASE7B_PERFORMANCE_BUDGET.rawCssDeltaMaximum <= 24_000);
});
