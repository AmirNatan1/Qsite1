import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  DEVICE_REVIEW_CHECKS,
  HUMAN_STATUSES,
  REQUIRED_RECORDINGS,
  REVIEW_SCHEMA,
  ROOT,
  ZOOM_ROUTE_CHECKS,
  ZOOM_ROUTE_OUTCOMES,
  runSelfTest,
  validateReviewEntry,
  validateReviews,
} from "../scripts/ingest-phase6-r1-human-evidence.mjs";

function validEntry(filename, status = "PASS") {
  const entry = {
    filename,
    device: "Physical device supplied by reviewer",
    os: "Version not supplied",
    browser: filename.startsWith("iphone-safari-") ? "Mobile Safari" : filename === "chrome-200-percent.mp4" ? "Google Chrome" : null,
    browserVersion: null,
    testSteps: ["Visible physical interaction was inspected."],
    observations: ["The stated result was visible in the supplied recording."],
    observedResult: status === "FAIL" ? "A visible defect was observed." : "The demonstrated requirement passed.",
    status,
    failureReferences: [],
  };
  if (DEVICE_REVIEW_CHECKS[filename]) {
    entry.checks = Object.fromEntries(DEVICE_REVIEW_CHECKS[filename].map((check) => [check, status === "PENDING HUMAN REVIEW" ? null : true]));
    if (status === "FAIL") {
      const failedCheck = DEVICE_REVIEW_CHECKS[filename][0];
      entry.checks[failedCheck] = false;
      entry.failureReferences = [{ check: failedCheck, timestamp: "00:12.400", frame: null, observation: "Visible failure." }];
    }
  }
  if (filename === "chrome-200-percent.mp4") Object.assign(entry, {
    genuineBrowserZoom: true,
    zoomPercent: 200,
    proxy: false,
    routeOutcomes: ZOOM_ROUTE_OUTCOMES.map((route, index) => ({
      route,
      status: status === "FAIL" ? (index === 0 ? "FAIL" : "PASS") : status === "PENDING HUMAN REVIEW" ? (index === 0 ? "PENDING HUMAN REVIEW" : "PASS") : "PASS",
      checks: Object.fromEntries(ZOOM_ROUTE_CHECKS.map((check) => [check, !(status === "FAIL" && index === 0 && check === ZOOM_ROUTE_CHECKS[0])])),
      failureReferences: status === "FAIL" && index === 0 ? [{ check: ZOOM_ROUTE_CHECKS[0], timestamp: "00:20.000", frame: null, observation: "Visible route failure." }] : [],
    })),
  });
  if (filename === "chrome-200-percent.mp4" && status === "FAIL") {
    entry.failureReferences = [{ check: `${ZOOM_ROUTE_OUTCOMES[0]}:${ZOOM_ROUTE_CHECKS[0]}`, timestamp: "00:20.000", frame: null, observation: "Visible route failure." }];
  }
  return entry;
}

test("human evidence requires the four exact filenames and explicit statuses", () => {
  assert.deepEqual(REQUIRED_RECORDINGS, [
    "iphone-safari-opening.mp4",
    "iphone-safari-maradin.mp4",
    "physical-scroll-input.mp4",
    "chrome-200-percent.mp4",
  ]);
  assert.deepEqual(HUMAN_STATUSES, ["PASS", "FAIL", "PENDING HUMAN REVIEW"]);
  assert.equal(DEVICE_REVIEW_CHECKS["iphone-safari-opening.mp4"].length, 10);
  assert.equal(DEVICE_REVIEW_CHECKS["iphone-safari-maradin.mp4"].length, 5);
  assert.equal(DEVICE_REVIEW_CHECKS["physical-scroll-input.mp4"].length, 7);
  assert.deepEqual(runSelfTest(), { schema: "quantum-hub.phase-6-r1.human-evidence-ledger.v1.self-test", status: "PASS", requiredRecordings: 4, filePresenceIsPass: false });
  assert.ok(path.isAbsolute(ROOT));
});

test("physical and Safari PASS require every named visible-experience check", () => {
  for (const filename of Object.keys(DEVICE_REVIEW_CHECKS)) {
    const complete = validEntry(filename);
    assert.deepEqual(Object.keys(validateReviewEntry(complete, filename).checks), DEVICE_REVIEW_CHECKS[filename]);
    const omitted = structuredClone(complete);
    delete omitted.checks[DEVICE_REVIEW_CHECKS[filename][0]];
    assert.throws(() => validateReviewEntry(omitted, filename), /checks must contain exactly/);
    const falsePass = structuredClone(complete);
    falsePass.checks[DEVICE_REVIEW_CHECKS[filename][0]] = false;
    assert.throws(() => validateReviewEntry(falsePass, filename), /PASS requires every required check/);
    const falseFail = validEntry(filename, "FAIL");
    for (const check of DEVICE_REVIEW_CHECKS[filename]) falseFail.checks[check] = true;
    assert.throws(() => validateReviewEntry(falseFail, filename), /FAIL requires at least one failed/);
  }
});

test("file presence cannot manufacture a human PASS", () => {
  const incomplete = validEntry(REQUIRED_RECORDINGS[0]);
  delete incomplete.observations;
  assert.throws(() => validateReviewEntry(incomplete, REQUIRED_RECORDINGS[0]), /observations/);
  const pending = validEntry(REQUIRED_RECORDINGS[0], "PENDING HUMAN REVIEW");
  assert.equal(validateReviewEntry(pending, REQUIRED_RECORDINGS[0]).status, "PENDING HUMAN REVIEW");
});

test("FAIL requires a timestamp or frame and non-FAIL forbids failure references", () => {
  const missingReference = validEntry(REQUIRED_RECORDINGS[0], "FAIL");
  missingReference.failureReferences = [];
  assert.throws(() => validateReviewEntry(missingReference, REQUIRED_RECORDINGS[0]), /requires at least one/);
  const badPass = validEntry(REQUIRED_RECORDINGS[0], "PASS");
  badPass.failureReferences = [{ check: DEVICE_REVIEW_CHECKS[REQUIRED_RECORDINGS[0]][0], timestamp: "00:01", frame: null, observation: "Unexpected." }];
  assert.throws(() => validateReviewEntry(badPass, REQUIRED_RECORDINGS[0]), /non-FAIL/);
});

test("review document rejects omissions, duplicates and unknown filenames", () => {
  const complete = { schema: REVIEW_SCHEMA, entries: REQUIRED_RECORDINGS.map((filename) => validEntry(filename)) };
  assert.equal(validateReviews(complete).length, 4);
  assert.throws(() => validateReviews({ ...complete, entries: complete.entries.slice(1) }), /exactly four/);
  const duplicate = structuredClone(complete);
  duplicate.entries[1].filename = duplicate.entries[0].filename;
  assert.throws(() => validateReviews(duplicate), /duplicate review entry/);
});

test("genuine 200% requires exact ten-route outcomes and all ten checks", () => {
  const zoom = validEntry("chrome-200-percent.mp4");
  assert.equal(validateReviewEntry(zoom, zoom.filename).routeOutcomes.length, 10);
  delete zoom.routeOutcomes[0].checks.completeH1;
  assert.throws(() => validateReviewEntry(zoom, zoom.filename), /checks must contain exactly the ten required checks/);
});

test("Chrome 200% entry status derives exactly from all ten route statuses", () => {
  const allPassDeclaredPending = validEntry("chrome-200-percent.mp4", "PASS");
  allPassDeclaredPending.status = "PENDING HUMAN REVIEW";
  assert.throws(() => validateReviewEntry(allPassDeclaredPending, allPassDeclaredPending.filename), /entry status must be PASS/);

  const onePendingDeclaredPass = validEntry("chrome-200-percent.mp4", "PASS");
  onePendingDeclaredPass.routeOutcomes[0].status = "PENDING HUMAN REVIEW";
  onePendingDeclaredPass.status = "PASS";
  assert.throws(() => validateReviewEntry(onePendingDeclaredPass, onePendingDeclaredPass.filename), /entry status must be PENDING HUMAN REVIEW/);

  const oneFailDeclaredPass = validEntry("chrome-200-percent.mp4", "FAIL");
  oneFailDeclaredPass.status = "PASS";
  oneFailDeclaredPass.failureReferences = [];
  assert.throws(() => validateReviewEntry(oneFailDeclaredPass, oneFailDeclaredPass.filename), /entry status must be FAIL/);
});

test("every false human check requires a matching check-addressed timestamp or frame", () => {
  const physical = validEntry("physical-scroll-input.mp4", "FAIL");
  const secondCheck = DEVICE_REVIEW_CHECKS[physical.filename][1];
  physical.checks[secondCheck] = false;
  assert.throws(() => validateReviewEntry(physical, physical.filename), new RegExp(`false check ${secondCheck} requires a failureReference`));
  physical.failureReferences.push({ check: secondCheck, timestamp: null, frame: "F182", observation: "Second visible failure." });
  assert.equal(validateReviewEntry(physical, physical.filename).status, "FAIL");

  const zoom = validEntry("chrome-200-percent.mp4", "FAIL");
  const failedRoute = zoom.routeOutcomes[0];
  const secondZoomCheck = ZOOM_ROUTE_CHECKS[1];
  failedRoute.checks[secondZoomCheck] = false;
  assert.throws(() => validateReviewEntry(zoom, zoom.filename), new RegExp(`false check ${secondZoomCheck} requires a failureReference`));
  failedRoute.failureReferences.push({ check: secondZoomCheck, timestamp: "00:21.000", frame: null, observation: "Second route failure." });
  assert.equal(validateReviewEntry(zoom, zoom.filename).status, "FAIL");
});

test("structured hidden-visible evidence survives normalization", () => {
  const opening = validEntry("iphone-safari-opening.mp4");
  opening.observations.push({ id: "background-foreground", status: "PASS", result: "Coherent return" });
  const normalized = validateReviewEntry(opening, opening.filename);
  assert.equal(normalized.checks.backgroundForeground, true);
  assert.equal(normalized.observations.at(-1).id, "background-foreground");
});
