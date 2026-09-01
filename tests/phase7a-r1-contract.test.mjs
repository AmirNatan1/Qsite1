import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FROZEN_MAIN,
  PHASE7A_ACCEPTED_HEAD,
  PHASE7A_BRANCH,
  PHASE7A_PARENT,
  PHASE7A_R1_BRANCH,
  PHASE7A_R1_PARENT,
  PHASE7A_R1_REVIEW_ZIP_NAME,
  REVIEW_ZIP_NAME,
  authorityProfileById,
} from "../scripts/phase7a-contract.mjs";

test("the legacy Phase 7A authority remains byte-exact", () => {
  assert.equal(PHASE7A_BRANCH, "redirect/phase-7a-signal-field-threshold");
  assert.equal(PHASE7A_PARENT, "371e3e8a21a1d215ecaf2bf14b9f509432b230b0");
  assert.equal(FROZEN_MAIN, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(REVIEW_ZIP_NAME, "phase-7a-signal-field-threshold-human-review.zip");
});

test("the Phase 7A-R1 authority has its exact accepted parent and package name", () => {
  assert.equal(PHASE7A_ACCEPTED_HEAD, "a87de3c08135e594199db1cebddc427dd8763fcb");
  assert.equal(PHASE7A_R1_BRANCH, "repair/phase-7a-r1-signal-field-authority");
  assert.equal(PHASE7A_R1_PARENT, "a87de3c08135e594199db1cebddc427dd8763fcb");
  assert.equal(PHASE7A_R1_PARENT, PHASE7A_ACCEPTED_HEAD);
  assert.equal(
    PHASE7A_R1_REVIEW_ZIP_NAME,
    "phase-7a-r1-signal-field-authority-human-review.zip",
  );
});

test("authority profiles isolate legacy Phase 7A from Phase 7A-R1", () => {
  const legacy = authorityProfileById("phase7a");
  const repair = authorityProfileById("phase7a-r1");

  assert.deepEqual(legacy, {
    id: "phase7a",
    branch: PHASE7A_BRANCH,
    parent: PHASE7A_PARENT,
    frozenMain: FROZEN_MAIN,
    reviewZipName: REVIEW_ZIP_NAME,
  });
  assert.deepEqual(repair, {
    id: "phase7a-r1",
    branch: PHASE7A_R1_BRANCH,
    parent: PHASE7A_R1_PARENT,
    frozenMain: FROZEN_MAIN,
    reviewZipName: PHASE7A_R1_REVIEW_ZIP_NAME,
  });
  assert.notStrictEqual(legacy, repair);
  assert.ok(Object.isFrozen(legacy));
  assert.ok(Object.isFrozen(repair));
  assert.strictEqual(authorityProfileById("phase7a"), legacy);
  assert.strictEqual(authorityProfileById("phase7a-r1"), repair);
});

test("unknown authority profile identifiers are rejected", () => {
  for (const id of ["", "phase7a-r2", "PHASE7A", undefined, null]) {
    assert.throws(
      () => authorityProfileById(id),
      {
        name: "TypeError",
        message: /Unknown Phase 7A authority profile/,
      },
    );
  }
});

test("R1 keeps the prior review record distinct from six current pending gates", async () => {
  const authority = await readFile(new URL("../docs/phase-7a-r1-review-authority.md", import.meta.url), "utf8");
  for (const prior of [
    "RETENTION + DEMOLITION DISCIPLINE — ACCEPT",
    "FROZEN OPENING INTEGRITY — ACCEPT",
    "NATIVE-SCROLL + MOTION INTEGRITY — ACCEPT",
    "SIGNAL FIELD CREATIVE AUTHORITY — REPAIR",
    "TYPOGRAPHY + MATERIAL AUTHORITY — REPAIR",
    "ACCESSIBILITY + FALLBACK + PERFORMANCE — REPAIR",
  ]) assert.match(authority, new RegExp(prior.replace(/[+]/g, "\\+")));
  assert.equal((authority.match(/— \*\*PENDING HUMAN REVIEW\*\*/g) ?? []).length, 6);
  assert.match(authority, /Phase 7B is not authorized/i);
  assert.match(authority, /merge to\s+`main` is authorized/i);
});
