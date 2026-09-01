import assert from "node:assert/strict";
import test from "node:test";

import {
  METHOD_STATE_RANGES,
  METHOD_STATES,
  projectMethodProgress,
} from "../src/scripts/operating-field-state.mjs";

const orderedStates = ["open-field", "frame", "source", "assess", "test", "decide", "release"];

test("the Workpiece state model is a pure clamped document-position projection", () => {
  assert.deepEqual(METHOD_STATES, orderedStates);
  for (const sample of [-10, 0, 0.079, 0.08, 0.27, 0.46, 0.65, 0.84, 0.97, 1, 10, Number.NaN]) {
    const first = projectMethodProgress(sample);
    const second = projectMethodProgress(sample);
    assert.deepEqual(first, second, `projection is not idempotent at ${sample}`);
    assert.ok(first.progress >= 0 && first.progress <= 1);
    for (const [key, value] of Object.entries(first)) {
      if (typeof value === "number") assert.ok(value >= 0 && value <= 1, `${key} escaped its normalized range`);
    }
  }
});

test("exact boundaries choose the next authored state and preserve prior history", () => {
  for (let index = 0; index < orderedStates.length; index += 1) {
    const state = orderedStates[index];
    const [start, end] = METHOD_STATE_RANGES[state];
    assert.equal(projectMethodProgress(start).state, state);
    if (index < orderedStates.length - 1) assert.equal(projectMethodProgress(end).state, orderedStates[index + 1]);
  }
  const decided = projectMethodProgress(0.95);
  assert.equal(decided.frame, 1);
  assert.equal(decided.source, 1);
  assert.equal(decided.assess, 1);
  assert.equal(decided.test, 1);
  assert.ok(decided.history > 0.9, "DECIDE must retain structural history");
  assert.ok(decided.decisionLock > 0);
});

test("direct jumps and immediate reverse reconstruct the same endpoints without queued history", () => {
  const forward = [0, 0.16, 0.36, 0.55, 0.74, 0.9, 1].map(projectMethodProgress);
  const reverse = [1, 0.9, 0.74, 0.55, 0.36, 0.16, 0].map(projectMethodProgress);
  for (let index = 0; index < forward.length; index += 1) {
    assert.deepEqual(forward[index], reverse[reverse.length - 1 - index]);
  }
  assert.deepEqual(projectMethodProgress(1), forward.at(-1));
  assert.deepEqual(projectMethodProgress(0), forward[0]);
});

test("each stage has a distinct resolved composition", () => {
  const samples = [0.2, 0.4, 0.59, 0.78, 0.92].map(projectMethodProgress);
  assert.deepEqual(samples.map(({ state }) => state), ["frame", "source", "assess", "test", "decide"]);
  assert.ok(samples[0].framePressure > 0 && samples[0].source === 0);
  assert.ok(samples[1].candidateOpacity > 0 && samples[1].assess === 0);
  assert.ok(samples[2].rejectedCollapse > 0 && samples[2].test === 0);
  assert.ok(samples[3].testSurface > 0 && samples[3].decide === 0);
  assert.ok(samples[4].decisionLock > 0 && samples[4].decisionSignal > 0);
});
