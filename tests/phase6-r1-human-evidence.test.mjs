import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEVICE_REVIEW_CHECKS,
  HUMAN_STATUSES,
  LEDGER_STATUSES,
  REQUIRED_RECORDINGS,
  REVIEW_SCHEMA,
  ROOT,
  ZOOM_ROUTE_CHECKS,
  ZOOM_ROUTE_OUTCOMES,
  inventoryRecordings,
  runSelfTest,
  validateReviewEntry,
  validateReviews,
} from "../scripts/ingest-phase6-r1-human-evidence.mjs";

function validEntry(filename, status = "PASS") {
  const device = filename.startsWith("iphone-safari-")
    ? "Physical iPhone 15"
    : filename === "physical-scroll-input.mp4"
      ? "Physical trackpad"
      : "Desktop PC";
  const entry = {
    filename,
    device,
    os: filename.startsWith("iphone-safari-") ? "iOS 18.6" : "Windows 11",
    browser: filename.startsWith("iphone-safari-") ? "Mobile Safari" : filename === "chrome-200-percent.mp4" ? "Google Chrome" : null,
    browserVersion: null,
    testSteps: ["Visible physical interaction was inspected."],
    observations: [],
    observedResult: status === "FAIL" ? "A visible failure was observed." : status === "PASS" ? "The demonstrated requirements were visibly successful." : "Pending human review.",
    status,
    reviewedSha256: status === "PENDING HUMAN REVIEW" ? null : "a".repeat(64),
    reviewedByteSize: status === "PENDING HUMAN REVIEW" ? null : 1_024,
    failureReferences: [],
  };
  if (DEVICE_REVIEW_CHECKS[filename]) {
    entry.checks = Object.fromEntries(DEVICE_REVIEW_CHECKS[filename].map((check) => [check, status === "PENDING HUMAN REVIEW" ? null : true]));
    if (status === "FAIL") {
      const failedCheck = DEVICE_REVIEW_CHECKS[filename][0];
      entry.checks[failedCheck] = false;
      entry.failureReferences = [{ check: failedCheck, timestamp: "00:12.400", frame: null, observation: "Visible failure." }];
    }
    entry.observations = DEVICE_REVIEW_CHECKS[filename].map((check) => {
      const checkStatus = entry.checks[check] === false ? "FAIL" : entry.checks[check] === null ? "PENDING HUMAN REVIEW" : "PASS";
      const failure = entry.failureReferences.find((reference) => reference.check === check);
      return {
        checkId: check,
        status: checkStatus,
        result: checkStatus === "FAIL" ? "A visible failure was observed." : checkStatus === "PASS" ? "The visible check completed successfully." : "Pending human review.",
        timestamp: failure?.timestamp ?? null,
        frame: failure?.frame ?? null,
      };
    });
  }
  if (filename === "chrome-200-percent.mp4") Object.assign(entry, {
    genuineBrowserZoom: status === "PENDING HUMAN REVIEW" ? null : true,
    zoomPercent: status === "PENDING HUMAN REVIEW" ? null : 200,
    proxy: status === "PENDING HUMAN REVIEW" ? null : false,
    routeOutcomes: ZOOM_ROUTE_OUTCOMES.map((route, index) => ({
      route,
      status: status === "FAIL" ? (index === 0 ? "FAIL" : "PASS") : status,
      checks: Object.fromEntries(ZOOM_ROUTE_CHECKS.map((check) => [check, status === "PENDING HUMAN REVIEW" ? null : !(status === "FAIL" && index === 0 && check === ZOOM_ROUTE_CHECKS[0])])),
      failureReferences: status === "FAIL" && index === 0 ? [{ check: ZOOM_ROUTE_CHECKS[0], timestamp: "00:20.000", frame: null, observation: "Visible route failure." }] : [],
    })),
  });
  if (filename === "chrome-200-percent.mp4" && status === "FAIL") {
    entry.failureReferences = [{ check: `${ZOOM_ROUTE_OUTCOMES[0]}:${ZOOM_ROUTE_CHECKS[0]}`, timestamp: "00:20.000", frame: null, observation: "Visible route failure." }];
  }
  if (filename === "chrome-200-percent.mp4") {
    entry.observations = entry.routeOutcomes.flatMap((outcome) => ZOOM_ROUTE_CHECKS.map((check) => {
      const checkStatus = outcome.checks[check] === false ? "FAIL" : outcome.status === "PENDING HUMAN REVIEW" ? "PENDING HUMAN REVIEW" : "PASS";
      const failure = outcome.failureReferences.find((reference) => reference.check === check);
      return {
        checkId: `${outcome.route}:${check}`,
        status: checkStatus,
        result: checkStatus === "FAIL" ? "A visible failure was observed." : checkStatus === "PASS" ? "The route check completed successfully." : "Pending human review.",
        timestamp: failure?.timestamp ?? null,
        frame: failure?.frame ?? null,
      };
    }));
  }
  return entry;
}

function mediaBinding(filename, overrides = {}) {
  return {
    filename,
    sha256: "a".repeat(64),
    byteSize: 1_024,
    mediaValidation: { container: "ISO-BMFF MP4", durationSeconds: 30, sampleCount: 900, videoTrackCount: 1 },
    ...overrides,
  };
}

test("human evidence requires the four exact filenames and explicit statuses", () => {
  assert.deepEqual(REQUIRED_RECORDINGS, [
    "iphone-safari-opening.mp4",
    "iphone-safari-maradin.mp4",
    "physical-scroll-input.mp4",
    "chrome-200-percent.mp4",
  ]);
  assert.deepEqual(HUMAN_STATUSES, ["PASS", "FAIL", "PENDING HUMAN REVIEW"]);
  assert.deepEqual(LEDGER_STATUSES, ["PASS", "FAIL", "PENDING HUMAN REVIEW", "NOT AVAILABLE TO EXECUTION ENVIRONMENT"]);
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

test("a present recording cannot be relabelled as unavailable hardware", () => {
  const present = validEntry(REQUIRED_RECORDINGS[0], "PENDING HUMAN REVIEW");
  present.status = "NOT AVAILABLE TO EXECUTION ENVIRONMENT";
  assert.throws(() => validateReviewEntry(present, present.filename), /review status is invalid/);
});

test("PASS and FAIL reviews are bound to the exact recording hash and byte size", () => {
  const filename = REQUIRED_RECORDINGS[0];
  const review = validEntry(filename);
  assert.equal(validateReviewEntry(review, filename, mediaBinding(filename)).reviewedSha256, "a".repeat(64));
  assert.throws(() => validateReviewEntry(review, filename, mediaBinding(filename, { sha256: "b".repeat(64) })), /not bound to the supplied recording bytes/);
  assert.throws(() => validateReviewEntry(review, filename, mediaBinding(filename, { byteSize: 2_048 })), /not bound to the supplied recording bytes/);
  const unbound = structuredClone(review);
  delete unbound.reviewedSha256;
  assert.throws(() => validateReviewEntry(unbound, filename), /requires reviewedSha256 and reviewedByteSize/);
});

test("failure timestamps and frames cannot exceed the bound recording", () => {
  const filename = REQUIRED_RECORDINGS[0];
  const timestamp = validEntry(filename, "FAIL");
  assert.throws(() => validateReviewEntry(timestamp, filename, mediaBinding(filename, { mediaValidation: { container: "ISO-BMFF MP4", durationSeconds: 10, sampleCount: 900, videoTrackCount: 1 } })), /timestamp exceeds the recording duration/);
  const frame = validEntry(filename, "FAIL");
  frame.failureReferences[0].timestamp = null;
  frame.failureReferences[0].frame = "F901";
  const observation = frame.observations.find(({ status }) => status === "FAIL");
  observation.timestamp = null;
  observation.frame = "F901";
  assert.throws(() => validateReviewEntry(frame, filename, mediaBinding(filename)), /frame exceeds the recording sample count/);
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
  allPassDeclaredPending.reviewedSha256 = null;
  allPassDeclaredPending.reviewedByteSize = null;
  allPassDeclaredPending.genuineBrowserZoom = null;
  allPassDeclaredPending.zoomPercent = null;
  allPassDeclaredPending.proxy = null;
  assert.throws(() => validateReviewEntry(allPassDeclaredPending, allPassDeclaredPending.filename), /pending review requires all ten routes|entry status must be PASS/);

  const onePendingDeclaredPass = validEntry("chrome-200-percent.mp4", "PASS");
  onePendingDeclaredPass.routeOutcomes[0].status = "PENDING HUMAN REVIEW";
  for (const check of ZOOM_ROUTE_CHECKS) onePendingDeclaredPass.routeOutcomes[0].checks[check] = null;
  for (const observation of onePendingDeclaredPass.observations.filter(({ checkId }) => checkId.startsWith("/:"))) {
    observation.status = "PENDING HUMAN REVIEW";
    observation.result = "Pending human review.";
  }
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
  Object.assign(physical.observations.find(({ checkId }) => checkId === secondCheck), { status: "FAIL", result: "A second visible failure was observed.", timestamp: null, frame: "F182" });
  assert.equal(validateReviewEntry(physical, physical.filename).status, "FAIL");

  const zoom = validEntry("chrome-200-percent.mp4", "FAIL");
  const failedRoute = zoom.routeOutcomes[0];
  const secondZoomCheck = ZOOM_ROUTE_CHECKS[1];
  failedRoute.checks[secondZoomCheck] = false;
  assert.throws(() => validateReviewEntry(zoom, zoom.filename), new RegExp(`false check ${secondZoomCheck} requires a failureReference`));
  failedRoute.failureReferences.push({ check: secondZoomCheck, timestamp: "00:21.000", frame: null, observation: "Second route failure." });
  Object.assign(zoom.observations.find(({ checkId }) => checkId === `${failedRoute.route}:${secondZoomCheck}`), { status: "FAIL", result: "A second visible failure was observed.", timestamp: "00:21.000", frame: null });
  assert.equal(validateReviewEntry(zoom, zoom.filename).status, "FAIL");
});

test("structured hidden-visible evidence survives normalization", () => {
  const opening = validEntry("iphone-safari-opening.mp4");
  opening.observations.find(({ checkId }) => checkId === "backgroundForeground").result = "Coherent return was visibly demonstrated.";
  const normalized = validateReviewEntry(opening, opening.filename);
  assert.equal(normalized.checks.backgroundForeground, true);
  assert.equal(normalized.observations.find(({ checkId }) => checkId === "backgroundForeground").checkId, "backgroundForeground");
});

test("human identity, status text and timestamp/frame references fail closed", () => {
  const wrongIphone = validEntry("iphone-safari-opening.mp4");
  wrongIphone.device = "Desktop PC";
  wrongIphone.os = "Windows 11";
  assert.throws(() => validateReviewEntry(wrongIphone, wrongIphone.filename), /physical iPhone|identify iOS/);

  const simulatedInput = validEntry("physical-scroll-input.mp4");
  simulatedInput.device = "Simulated generic input";
  assert.throws(() => validateReviewEntry(simulatedInput, simulatedInput.filename), /physical mouse or trackpad/);

  const mobileZoom = validEntry("chrome-200-percent.mp4");
  mobileZoom.device = "Mobile phone";
  assert.throws(() => validateReviewEntry(mobileZoom, mobileZoom.filename), /desktop\/laptop/);

  const passWithFailure = validEntry("iphone-safari-opening.mp4");
  passWithFailure.observedResult = "FAIL was visible despite the declared result.";
  assert.throws(() => validateReviewEntry(passWithFailure, passWithFailure.filename), /PASS text contradicts/);

  const failWithPending = validEntry("iphone-safari-opening.mp4", "FAIL");
  failWithPending.observedResult = "Not reviewed.";
  assert.throws(() => validateReviewEntry(failWithPending, failWithPending.filename), /FAIL text contains pending/);

  const badTimestamp = validEntry("iphone-safari-opening.mp4", "FAIL");
  badTimestamp.failureReferences[0].timestamp = "not supplied";
  badTimestamp.observations.find(({ status }) => status === "FAIL").timestamp = "not supplied";
  assert.throws(() => validateReviewEntry(badTimestamp, badTimestamp.filename), /parseable media timestamp/);

  const badFrame = validEntry("iphone-safari-opening.mp4", "FAIL");
  badFrame.failureReferences[0] = { ...badFrame.failureReferences[0], timestamp: null, frame: "frame twelve" };
  badFrame.observations.find(({ status }) => status === "FAIL").timestamp = null;
  badFrame.observations.find(({ status }) => status === "FAIL").frame = "frame twelve";
  assert.throws(() => validateReviewEntry(badFrame, badFrame.filename), /positive frame identifier/);
});

test("missing-file preflight wins over malformed present media and malformed reviews", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "phase6-human-preflight-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const inputRoot = path.join(parent, "recordings");
  await mkdir(inputRoot);
  await writeFile(path.join(inputRoot, REQUIRED_RECORDINGS[0]), Buffer.from("\0\0\0\x0cftypisom", "binary"));
  const inventory = await inventoryRecordings(inputRoot);
  assert.deepEqual(inventory.missing, REQUIRED_RECORDINGS.slice(1));
  assert.deepEqual(inventory.files, []);
});
