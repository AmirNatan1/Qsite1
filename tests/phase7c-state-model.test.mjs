import assert from "node:assert/strict";
import test from "node:test";

import {
  TERRITORY_STATE_RANGES,
  TERRITORY_STATES,
  TERRITORY_TRACK_KEYFRAMES,
  projectTerritoryProgress,
} from "../src/scripts/territory-traverse-state.mjs";

const orderedStates = [
  "release",
  "automotive",
  "automotive-logistics",
  "logistics",
  "logistics-manufacturing",
  "manufacturing",
  "manufacturing-energy",
  "energy",
  "registration",
  "proof",
];

const expectedRanges = {
  release: [0, 0.1],
  automotive: [0.1, 0.28],
  "automotive-logistics": [0.28, 0.36],
  logistics: [0.36, 0.5],
  "logistics-manufacturing": [0.5, 0.58],
  manufacturing: [0.58, 0.72],
  "manufacturing-energy": [0.72, 0.8],
  energy: [0.8, 0.91],
  registration: [0.91, 0.97],
  proof: [0.97, 1],
};

const expectedTrackKeys = [
  [0, 0],
  [0.1, 0],
  [0.22, 0.18],
  [0.28, 0.22],
  [0.36, 0.4],
  [0.46, 0.44],
  [0.5, 0.44],
  [0.58, 0.62],
  [0.68, 0.66],
  [0.72, 0.66],
  [0.8, 0.82],
  [0.88, 0.86],
  [0.91, 0.86],
  [0.97, 1],
  [1, 1],
];

test("the territory authority exposes the exact ordered ranges and track keys", () => {
  assert.deepEqual(TERRITORY_STATES, orderedStates);
  assert.deepEqual(TERRITORY_STATE_RANGES, expectedRanges);
  assert.deepEqual(TERRITORY_TRACK_KEYFRAMES, expectedTrackKeys);
  assert.ok(Object.isFrozen(TERRITORY_STATE_RANGES));
  assert.ok(Object.values(TERRITORY_STATE_RANGES).every(Object.isFrozen));
  assert.ok(Object.isFrozen(TERRITORY_TRACK_KEYFRAMES));
  assert.ok(TERRITORY_TRACK_KEYFRAMES.every(Object.isFrozen));
});

test("projection is pure, clamped, normalized and idempotent", () => {
  const samples = [-10, 0, 0.1, 0.28, 0.5, 0.72, 0.91, 0.97, 1, 10, 0.5432197];
  for (const sample of samples) {
    const first = projectTerritoryProgress(sample);
    const second = projectTerritoryProgress(sample);
    assert.deepEqual(first, second, `projection changed between calls at ${sample}`);
    assert.notStrictEqual(first, second, "projection should not reuse a mutable result object");
    for (const [key, value] of Object.entries(first)) {
      if (typeof value === "number") {
        assert.ok(value >= 0 && value <= 1, `${key} escaped its normalized range at ${sample}`);
        assert.ok(Number.isFinite(value), `${key} is not finite at ${sample}`);
      }
    }
  }

  assert.equal(projectTerritoryProgress(-10).progress, 0);
  assert.equal(projectTerritoryProgress(10).progress, 1);
  assert.equal(projectTerritoryProgress("0.5").progress, 0.5);
});

test("invalid numeric input resolves deterministically to release at zero", () => {
  const zero = projectTerritoryProgress(0);
  for (const invalid of [Number.NaN, Infinity, -Infinity, undefined, null, "not-a-number", {}, Symbol("x")]) {
    assert.deepEqual(projectTerritoryProgress(invalid), zero);
  }
});

test("every exact boundary belongs to the state beginning at that boundary", () => {
  for (let index = 0; index < orderedStates.length; index += 1) {
    const state = orderedStates[index];
    const [start, end] = TERRITORY_STATE_RANGES[state];
    assert.equal(projectTerritoryProgress(start).state, state);
    if (index < orderedStates.length - 1) {
      assert.equal(projectTerritoryProgress(end).state, orderedStates[index + 1]);
      assert.equal(projectTerritoryProgress(end - 0.000001).state, state);
    }
  }
  assert.equal(projectTerritoryProgress(1).state, "proof");
});

test("cumulative scalars start at zero and saturate after their authored range", () => {
  const scalarRanges = [
    ["release", "release"],
    ["automotive", "automotive"],
    ["automotiveToLogistics", "automotive-logistics"],
    ["routing", "logistics"],
    ["logisticsToManufacturing", "logistics-manufacturing"],
    ["tolerance", "manufacturing"],
    ["manufacturingToEnergy", "manufacturing-energy"],
    ["load", "energy"],
    ["registration", "registration"],
    ["proof", "proof"],
  ];

  for (const [scalar, state] of scalarRanges) {
    const [start, end] = TERRITORY_STATE_RANGES[state];
    assert.equal(projectTerritoryProgress(start)[scalar], 0, `${scalar} must start at zero`);
    assert.equal(projectTerritoryProgress(end)[scalar], 1, `${scalar} must resolve at its end`);
    assert.equal(projectTerritoryProgress(1)[scalar], 1, `${scalar} must remain saturated`);
  }
});

test("the track follows every authored key, hold and interpolation", () => {
  for (const [progress, track] of TERRITORY_TRACK_KEYFRAMES) {
    assert.equal(projectTerritoryProgress(progress).track, track, `track key failed at ${progress}`);
  }
  assert.equal(projectTerritoryProgress(0.16).track, 0.09);
  assert.equal(projectTerritoryProgress(0.32).track, 0.31);
  assert.equal(projectTerritoryProgress(0.48).track, 0.44);
  assert.equal(projectTerritoryProgress(0.7).track, 0.66);
  assert.equal(projectTerritoryProgress(0.895).track, 0.86);

  let previous = -1;
  for (let step = 0; step <= 1000; step += 1) {
    const current = projectTerritoryProgress(step / 1000).track;
    assert.ok(current >= previous, `track reversed at ${step / 1000}`);
    previous = current;
  }
});

test("forward and reverse sampling reconstruct deeply equal state", () => {
  const positions = [0, 0.05, 0.1, 0.22, 0.28, 0.32, 0.36, 0.46, 0.5, 0.54, 0.58, 0.68, 0.72, 0.76, 0.8, 0.88, 0.91, 0.95, 0.97, 1];
  const forward = positions.map(projectTerritoryProgress);
  const reverse = positions.toReversed().map(projectTerritoryProgress).toReversed();
  assert.deepEqual(forward, reverse);
});

test("direct skip and immediate reversal never depend on visited history", () => {
  const energyDirect = projectTerritoryProgress(0.88);
  const logisticsDirect = projectTerritoryProgress(0.46);

  [0, 0.24, 0.54, 0.68, 0.95, 1].forEach(projectTerritoryProgress);
  assert.deepEqual(projectTerritoryProgress(0.88), energyDirect);
  assert.deepEqual(projectTerritoryProgress(0.46), logisticsDirect);

  assert.equal(energyDirect.state, "energy");
  assert.equal(energyDirect.automotiveResidue, 0.28);
  assert.equal(energyDirect.logisticsResidue, 0.26);
  assert.equal(energyDirect.manufacturingResidue, 0.3);
  assert.equal(logisticsDirect.state, "logistics");
  assert.equal(logisticsDirect.automotiveResidue, 0.28);
  assert.ok(logisticsDirect.logisticsResidue > 0);
  assert.equal(logisticsDirect.manufacturingResidue, 0);
});

test("resolved states have distinct fingerprints and preserve one continuous carrier", () => {
  const positions = [0.05, 0.24, 0.32, 0.46, 0.54, 0.68, 0.76, 0.88, 0.95, 1];
  const projections = positions.map(projectTerritoryProgress);
  assert.deepEqual(projections.map(({ state }) => state), orderedStates);

  const fingerprints = projections.map((projection) => JSON.stringify([
    projection.track,
    projection.fieldNoise,
    projection.carrierWeight,
    projection.automotiveResidue,
    projection.logisticsResidue,
    projection.manufacturingResidue,
    projection.registration,
    projection.proof,
  ]));
  assert.equal(new Set(fingerprints).size, fingerprints.length);
  assert.ok(projections.every(({ carrierWeight }) => carrierWeight > 0));

  const energy = projectTerritoryProgress(0.91);
  const registered = projectTerritoryProgress(0.97);
  const proof = projectTerritoryProgress(1);
  assert.ok(energy.carrierWeight > projectTerritoryProgress(0.8).carrierWeight);
  assert.ok(registered.carrierWeight < energy.carrierWeight);
  assert.ok(proof.carrierWeight < registered.carrierWeight);
  assert.ok(registered.fieldNoise < energy.fieldNoise);
  assert.ok(proof.fieldNoise < registered.fieldNoise);
  assert.deepEqual(
    [proof.automotiveResidue, proof.logisticsResidue, proof.manufacturingResidue],
    [0.28, 0.26, 0.3],
  );
});

test("numeric carrier outputs remain continuous across macro-state boundaries", () => {
  const scalarKeys = [
    "track",
    "fieldNoise",
    "carrierWeight",
    "automotiveResidue",
    "logisticsResidue",
    "manufacturingResidue",
  ];
  const boundaries = orderedStates.slice(1).map((state) => TERRITORY_STATE_RANGES[state][0]);
  for (const boundary of boundaries) {
    const before = projectTerritoryProgress(boundary - 0.000001);
    const exact = projectTerritoryProgress(boundary);
    for (const key of scalarKeys) {
      assert.ok(
        Math.abs(exact[key] - before[key]) <= 0.00003,
        `${key} jumped at ${boundary}: ${before[key]} -> ${exact[key]}`,
      );
    }
  }
});

