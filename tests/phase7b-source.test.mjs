import assert from "node:assert/strict";
import test from "node:test";

import { verifyPhase7BSource } from "../scripts/verify-phase7b-source.mjs";

test("the complete Phase 7B source authority passes as one fail-closed report", async () => {
  const report = await verifyPhase7BSource();
  assert.equal(report.status, "PASS");
  assert.equal(report.inheritedPhase7AStatus, "PASS");
  assert.deepEqual(report.methodStages, ["FRAME", "SOURCE", "ASSESS", "TEST", "DECIDE"]);
  assert.equal(report.humanGates.length, 6);
  assert.ok(report.humanGates.every(({ decision }) => decision === "PENDING HUMAN REVIEW"));
  assert.equal(report.runtimeDependenciesAdded, 0);
  assert.equal(report.runtimeAssetsAdded, 0);
});

