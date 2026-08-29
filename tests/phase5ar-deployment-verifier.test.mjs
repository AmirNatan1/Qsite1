import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  ACCEPTED_PHASE5A_SHA,
  CHECKPOINT_SUBJECTS,
  FROZEN_MAIN_SHA,
  REPORT_FILENAME,
  REQUIRED_BRANCH,
  ROOT,
  cloudflareDetailsBindDeployment,
  normalizePreviewUrl,
  parseArguments,
  parseLinearLog,
  selfTest,
  validateOptions,
} from "../scripts/verify-phase5ar-deployment.mjs";

function validOptions() {
  return {
    expectedHead: "a".repeat(40),
    acceptedPhase5A: ACCEPTED_PHASE5A_SHA,
    frozenMain: FROZEN_MAIN_SHA,
    branch: REQUIRED_BRANCH,
    remote: "origin",
    deploymentId: "11111111-2222-4333-8444-555555555555",
    immutableUrl: "https://12345678.qsite1.pages.dev/",
    branchUrl: "https://codex-phase-5a-r.qsite1.pages.dev/",
    output: path.join(path.dirname(ROOT), REPORT_FILENAME),
    dist: path.join(ROOT, "dist"),
    timeoutMs: 30_000,
  };
}

function validLog() {
  return CHECKPOINT_SUBJECTS.map((subject, index) => {
    const sha = String(index + 1).repeat(40);
    const parent = index === 0 ? ACCEPTED_PHASE5A_SHA : String(index).repeat(40);
    return `${sha}\t${parent}\t${subject}`;
  }).join("\n");
}

test("Phase 5A-R deployment verifier self-test is pure and passes", async () => {
  assert.deepEqual(await selfTest(), { status: "PASS", tests: 6 });
});

test("deployment bindings require the exact branch, accepted parent, frozen main, UUID and external report", () => {
  assert.equal(validateOptions(validOptions()).branch, REQUIRED_BRANCH);
  assert.throws(() => validateOptions({ ...validOptions(), acceptedPhase5A: "b".repeat(40) }), /accepted-phase5a/);
  assert.throws(() => validateOptions({ ...validOptions(), frozenMain: "b".repeat(40) }), /frozen-main/);
  assert.throws(() => validateOptions({ ...validOptions(), branch: "main" }), /--branch/);
  assert.throws(() => validateOptions({ ...validOptions(), deploymentId: "123" }), /UUID/);
  assert.throws(() => validateOptions({ ...validOptions(), output: path.join(ROOT, REPORT_FILENAME) }), /outside/);
});

test("preview origins are credential-free Cloudflare Pages roots", () => {
  assert.equal(normalizePreviewUrl("https://12345678.qsite1.pages.dev/", "preview"), "https://12345678.qsite1.pages.dev/");
  for (const value of [
    "http://12345678.qsite1.pages.dev/",
    "https://qsite1.pages.dev/",
    "https://user:pass@12345678.qsite1.pages.dev/",
    "https://12345678.qsite1.pages.dev/?token=secret",
    "https://example.com/",
  ]) assert.throws(() => normalizePreviewUrl(value, "preview"));
});

test("Cloudflare check details bind direct and routed dashboard deployment URLs", () => {
  const deploymentId = "11111111-2222-4333-8444-555555555555";
  assert.equal(cloudflareDetailsBindDeployment(`https://dash.cloudflare.com/account/pages/view/qsite1/${deploymentId}`, deploymentId), true);
  assert.equal(cloudflareDetailsBindDeployment(`https://dash.cloudflare.com/?to=/account/pages/view/qsite1/${deploymentId}`, deploymentId), true);
  assert.equal(cloudflareDetailsBindDeployment("https://dash.cloudflare.com/?to=//example.com/pages/view/qsite1/11111111-2222-4333-8444-555555555555", deploymentId), false);
  assert.equal(cloudflareDetailsBindDeployment("https://example.com/account/pages/view/qsite1/11111111-2222-4333-8444-555555555555", deploymentId), false);
  assert.equal(cloudflareDetailsBindDeployment("https://dash.cloudflare.com/?to=/account/pages/view/qsite1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", deploymentId), false);
});

test("the exact five linear checkpoint subjects and parent chain are mandatory", () => {
  const records = parseLinearLog(validLog());
  assert.equal(records.length, 5);
  assert.equal(records[0].parents[0], ACCEPTED_PHASE5A_SHA);
  assert.deepEqual(records.map(({ subject }) => subject), CHECKPOINT_SUBJECTS);
  assert.throws(() => parseLinearLog(validLog().replace(CHECKPOINT_SUBJECTS[2], "Generic responsive update")), /subject differs/);
  assert.throws(() => parseLinearLog(validLog().replace(`\t${ACCEPTED_PHASE5A_SHA}\t`, `\t${ACCEPTED_PHASE5A_SHA} ${"f".repeat(40)}\t`)), /must be linear/);
});

test("argument parser keeps dry-run and self-test non-writing surfaces explicit", () => {
  const options = parseArguments([
    "--expected-head", "a".repeat(40),
    "--deployment-id", "11111111-2222-4333-8444-555555555555",
    "--immutable-url", "https://12345678.qsite1.pages.dev/",
    "--branch-url", "https://codex-phase-5a-r.qsite1.pages.dev/",
    "--dry-run",
  ]);
  assert.equal(options.dryRun, true);
  assert.equal(options.output, null);
  assert.equal(options.branch, REQUIRED_BRANCH);
});
