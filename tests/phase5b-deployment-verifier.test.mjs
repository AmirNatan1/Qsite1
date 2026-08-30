import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  ACCEPTED_PHASE5AR_SHA,
  CHECKPOINT_SUBJECTS,
  CP8_HEAD_SHA,
  DEPLOYMENT_PROFILE_CP9,
  DEPLOYMENT_PROFILE_R1,
  DEPLOYMENT_PROFILE_R2,
  DEPLOYMENT_PROFILES,
  FIXED_CHECKPOINT_SHAS,
  FROZEN_MAIN_SHA,
  HTML_AUTHORITY_FILES,
  HUMAN_GATES,
  PROVISIONAL_CP8_CHECK_RUN_ID,
  PROVISIONAL_CP8_DEPLOYMENT_ID,
  PROVISIONAL_CP8_IMMUTABLE_URL,
  REPORT_FILENAME,
  REQUIRED_BRANCH,
  REQUIRED_BRANCH_URL,
  REQUIRED_CLOUDFLARE_ACCOUNT_ID,
  REQUIRED_CLOUDFLARE_PROJECT,
  REQUIRED_HEADER_POLICIES,
  REQUIRED_REMOTE_URL,
  REQUIRED_REPOSITORY,
  R1_CHECKPOINT_SUBJECT,
  R1_CHECKPOINT_SUBJECTS,
  R1_FIXED_CHECKPOINT_SHAS,
  R1_PARENT_CP9_SHA,
  R1_REQUIRED_BRANCH,
  R2_ALLOWED_PRODUCTION_PATHS,
  R2_CHECKPOINT_SUBJECT,
  R2_CHECKPOINT_SUBJECTS,
  R2_FIXED_CHECKPOINT_SHAS,
  R2_PARENT_R1_SHA,
  R2_REQUIRED_BRANCH,
  ROOT,
  SCHEMA,
  assertCheckpointChain,
  assertRequiredHeaderPolicies,
  buildDistAuthority,
  cloudflareDetailsBindDeployment,
  parseArguments,
  parseHeadersFile,
  parseLinearLog,
  publicPathForDistFile,
  resolveDeploymentProfile,
  selfTest,
  validateDeployedRecord,
  validateDistRecords,
  validateObservedHeaders,
  validateOptions,
  validateProductionDelta,
  verifyCloudflareGithubCheck,
} from "../scripts/verify-phase5b-deployment.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT = path.join(ROOT, "scripts", "verify-phase5b-deployment.mjs");
const FINAL_HEAD = "a".repeat(40);
const DEPLOYMENT_ID = "12345678-1234-4234-8234-123456789abc";
const CHECK_RUN_ID = "123456789";
const R1_FINAL_HEAD = "b".repeat(40);
const R1_DEPLOYMENT_ID = "87654321-4321-4321-8321-cba987654321";
const R1_BRANCH_URL = "https://observed-r1-repair-alias.qsite1.pages.dev/";
const R1_CHECK_RUN_ID = "987654321";

function validArguments({ output = true, dryRun = false } = {}) {
  const argv = [
    "--expected-head", FINAL_HEAD,
    "--expected-base", ACCEPTED_PHASE5AR_SHA,
    "--expected-main", FROZEN_MAIN_SHA,
    "--repository", REQUIRED_REPOSITORY,
    "--branch", REQUIRED_BRANCH,
    "--github-check-run-id", CHECK_RUN_ID,
    "--cloudflare-account-id", REQUIRED_CLOUDFLARE_ACCOUNT_ID,
    "--cloudflare-project", REQUIRED_CLOUDFLARE_PROJECT,
    "--cloudflare-deployment-id", DEPLOYMENT_ID,
    "--observed-immutable-url", "https://12345678.qsite1.pages.dev/",
    "--observed-branch-url", REQUIRED_BRANCH_URL,
  ];
  if (output) argv.push("--output", path.resolve(ROOT, "..", REPORT_FILENAME));
  if (dryRun) argv.push("--dry-run");
  return argv;
}

function validOptions() {
  return validateOptions(parseArguments(validArguments()));
}

function validR1Arguments({ output = true, dryRun = false, branchUrl = R1_BRANCH_URL } = {}) {
  const argv = [
    "--profile", DEPLOYMENT_PROFILE_R1,
    "--expected-head", R1_FINAL_HEAD,
    "--expected-base", ACCEPTED_PHASE5AR_SHA,
    "--expected-main", FROZEN_MAIN_SHA,
    "--repository", REQUIRED_REPOSITORY,
    "--github-check-run-id", R1_CHECK_RUN_ID,
    "--cloudflare-account-id", REQUIRED_CLOUDFLARE_ACCOUNT_ID,
    "--cloudflare-project", REQUIRED_CLOUDFLARE_PROJECT,
    "--cloudflare-deployment-id", R1_DEPLOYMENT_ID,
    "--observed-immutable-url", "https://87654321.qsite1.pages.dev/",
    "--observed-branch-url", branchUrl,
  ];
  if (output) argv.push("--output", path.resolve(ROOT, "..", REPORT_FILENAME));
  if (dryRun) argv.push("--dry-run");
  return argv;
}

function validR1Options() {
  return validateOptions(parseArguments(validR1Arguments()));
}

function validChain() {
  return CHECKPOINT_SUBJECTS.map((subject, index) => ({
    sha: index < FIXED_CHECKPOINT_SHAS.length ? FIXED_CHECKPOINT_SHAS[index] : FINAL_HEAD,
    parents: [index === 0 ? ACCEPTED_PHASE5AR_SHA : index <= FIXED_CHECKPOINT_SHAS.length
      ? FIXED_CHECKPOINT_SHAS[index - 1]
      : FINAL_HEAD],
    subject,
  }));
}

function serializedChain(records = validChain()) {
  return records.map(({ sha, parents, subject }) => `${sha}\t${parents.join(" ")}\t${subject}`).join("\n");
}

function validR1Chain() {
  return R1_CHECKPOINT_SUBJECTS.map((subject, index) => ({
    sha: index < R1_FIXED_CHECKPOINT_SHAS.length ? R1_FIXED_CHECKPOINT_SHAS[index] : R1_FINAL_HEAD,
    parents: [index === 0 ? ACCEPTED_PHASE5AR_SHA : index <= R1_FIXED_CHECKPOINT_SHAS.length
      ? R1_FIXED_CHECKPOINT_SHAS[index - 1]
      : R1_FINAL_HEAD],
    subject,
  }));
}

function validCheckRun(options = validOptions()) {
  return {
    id: Number(options.githubCheckRunId),
    name: "Cloudflare Pages",
    app: { slug: "cloudflare-pages" },
    head_sha: options.expectedHead,
    status: "completed",
    conclusion: "success",
    completed_at: "2026-08-30T12:00:00.000Z",
    details_url: `https://dash.cloudflare.com/?to=/${REQUIRED_CLOUDFLARE_ACCOUNT_ID}/pages/view/${REQUIRED_CLOUDFLARE_PROJECT}/${options.cloudflareDeploymentId}`,
    output: {
      title: "Deployed successfully",
      summary: `<code>${options.expectedHead.slice(0, 7)}</code> Deploy successful! ${options.observedImmutableUrl.slice(0, -1)} ${options.observedBranchUrl.slice(0, -1)}`,
    },
  };
}

function headerFixture() {
  return Object.entries(REQUIRED_HEADER_POLICIES)
    .map(([pattern, value]) => `${pattern}\n  Cache-Control: ${value}`)
    .join("\n\n");
}

test("Phase 5B constants bind the exact branch, parent, main, CP1-CP8 ledger, and six pending gates", () => {
  assert.equal(SCHEMA, "quantum-hub.phase-5b.deployment-verification.v1");
  assert.equal(REQUIRED_BRANCH, "feature/phase-5b-supporting-route-production");
  assert.equal(ACCEPTED_PHASE5AR_SHA, "b6a9d4f6e05412dfd460a657edfd8be4ce7eef2c");
  assert.equal(FROZEN_MAIN_SHA, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(REQUIRED_REPOSITORY, "AmirNatan1/Qsite1");
  assert.equal(REQUIRED_REMOTE_URL, "https://github.com/AmirNatan1/Qsite1.git");
  assert.equal(REQUIRED_CLOUDFLARE_ACCOUNT_ID, "16bccc18bf7d54fd2538de7c1b5f19ed");
  assert.equal(REQUIRED_CLOUDFLARE_PROJECT, "qsite1");
  assert.equal(REQUIRED_BRANCH_URL, "https://feature-phase-5b-supporting.qsite1.pages.dev/");
  assert.deepEqual(FIXED_CHECKPOINT_SHAS, [
    "1fcc260fc51810934b160eec38971184db2008e1",
    "58a87e333cca47b2495c373d2c934e69ec25d290",
    "5458b5d74411ac16b83874b725cc021605851326",
    "996c9a05a0f8a3a810f0d47a0288c12fac430093",
    "11952af17bb1cdb3f079902dfb5300ddafe42594",
    "508d54a517b9c28ac683fb3257df3afad24b72bb",
    "9a9ad82b266c663e5689c8a6884a90cfc835ef7c",
    "1b890e945973ce4bc90ba5dda917d9656c4db9d6",
  ]);
  assert.equal(CP8_HEAD_SHA, FIXED_CHECKPOINT_SHAS.at(-1));
  assert.equal(CHECKPOINT_SUBJECTS.length, 9);
  assert.equal(CHECKPOINT_SUBJECTS.at(-1), "Complete Phase 5B deployed human-review evidence");
  assert.deepEqual(Object.keys(HUMAN_GATES), [
    "SUPPORTING-ROUTE PRODUCTION FIDELITY",
    "ROUTE-SPECIFIC SPATIAL IDENTITY",
    "RESPONSIVE + ACCESSIBLE INTEGRATION",
    "PUBLICATION + MEDIA SAFETY",
    "PERFORMANCE + RUNTIME SAFETY",
    "HOMEPAGE + PHASE 4/5A REGRESSION",
  ]);
  assert.deepEqual([...new Set(Object.values(HUMAN_GATES))], ["PENDING HUMAN REVIEW"]);
});

test("Phase 5B-R1 profile freezes the repair branch, CP9 parent, tenth subject, and preserves the CP9 default", () => {
  assert.equal(parseArguments([]).profile, DEPLOYMENT_PROFILE_CP9);
  assert.equal(parseArguments([]).branch, REQUIRED_BRANCH);
  assert.equal(resolveDeploymentProfile().id, DEPLOYMENT_PROFILE_CP9);
  assert.equal(resolveDeploymentProfile(DEPLOYMENT_PROFILE_R1).branch, R1_REQUIRED_BRANCH);
  assert.equal(R1_REQUIRED_BRANCH, "repair/phase-5b-r1-about-dark-v2-fidelity");
  assert.equal(R1_PARENT_CP9_SHA, "011abd3e5fc7464d5a0133603d222110df13b820");
  assert.equal(R1_CHECKPOINT_SUBJECT, "Repair Phase 5B About Dark V2 fidelity");
  assert.equal(R1_CHECKPOINT_SUBJECTS.length, 10);
  assert.equal(R1_CHECKPOINT_SUBJECTS.at(-1), R1_CHECKPOINT_SUBJECT);
  assert.equal(R1_FIXED_CHECKPOINT_SHAS.length, 9);
  assert.equal(R1_FIXED_CHECKPOINT_SHAS.at(-1), R1_PARENT_CP9_SHA);
  assert.equal(DEPLOYMENT_PROFILES[DEPLOYMENT_PROFILE_R1].requiredBranchUrl, null);
  assert.throws(() => resolveDeploymentProfile("phase5b-r2"), /--profile/);
});

test("Phase 5B-R2 freezes the R1 parent, eleventh subject, and exact Home/shared-header production scope", async () => {
  const profile = resolveDeploymentProfile(DEPLOYMENT_PROFILE_R2);
  assert.equal(profile.branch, R2_REQUIRED_BRANCH);
  assert.equal(R2_REQUIRED_BRANCH, "repair/phase-5b-r2-home-navigation-manifesto");
  assert.equal(R2_PARENT_R1_SHA, "ca22ae2f234302e7485803c560866abd7757735e");
  assert.equal(R2_CHECKPOINT_SUBJECT, "Repair Phase 5B home navigation and manifesto");
  assert.equal(R2_CHECKPOINT_SUBJECTS.length, 11);
  assert.equal(R2_CHECKPOINT_SUBJECTS.at(-1), R2_CHECKPOINT_SUBJECT);
  assert.equal(R2_FIXED_CHECKPOINT_SHAS.length, 10);
  assert.equal(R2_FIXED_CHECKPOINT_SHAS.at(-1), R2_PARENT_R1_SHA);
  assert.deepEqual(R2_ALLOWED_PRODUCTION_PATHS, ["src/components/SiteHeader.astro", "src/components/home/EntryField.astro", "src/pages/index.astro", "src/scripts/home-cinematic-integration.ts", "src/styles/routes/home.css", "src/styles/routes/home-cinematic.css", "src/styles/routes/home-responsive.css"]);
  assert.deepEqual(validateProductionDelta(`M\t${R2_ALLOWED_PRODUCTION_PATHS[0]}\nM\t${R2_ALLOWED_PRODUCTION_PATHS.at(-1)}`, DEPLOYMENT_PROFILE_R2), [{ status: "M", path: R2_ALLOWED_PRODUCTION_PATHS[0] }, { status: "M", path: R2_ALLOWED_PRODUCTION_PATHS.at(-1) }]);
  assert.throws(() => validateProductionDelta("", DEPLOYMENT_PROFILE_R2), /non-empty/);
  assert.throws(() => validateProductionDelta("M\tsrc/styles/navigation.css", DEPLOYMENT_PROFILE_R2), /allowlist/);
  const self = await selfTest(DEPLOYMENT_PROFILE_R2);
  assert.equal(self.profile, DEPLOYMENT_PROFILE_R2);
  assert.equal(self.checkpointCount, 11);
  assert.equal(self.r1ParentFixed, true);
});

test("CLI bindings require a new CP9 head, new deployment, exact account/project, and observed URLs", () => {
  const options = validOptions();
  assert.equal(options.expectedHead, FINAL_HEAD);
  assert.equal(options.observedImmutableUrl, "https://12345678.qsite1.pages.dev/");
  assert.equal(options.observedBranchUrl, REQUIRED_BRANCH_URL);

  assert.throws(() => validateOptions({ ...options, expectedHead: CP8_HEAD_SHA }), /new CP9/);
  assert.throws(() => validateOptions({ ...options, expectedBase: "b".repeat(40) }), /expected-base/);
  assert.throws(() => validateOptions({ ...options, expectedMain: "b".repeat(40) }), /expected-main/);
  assert.throws(() => validateOptions({ ...options, repository: "other/repository" }), /repository/);
  assert.throws(() => validateOptions({ ...options, branch: "main" }), /--branch/);
  assert.throws(() => validateOptions({ ...options, cloudflareAccountId: "0".repeat(32) }), /account-id/);
  assert.throws(() => validateOptions({ ...options, cloudflareProject: "other" }), /project/);
  assert.throws(() => validateOptions({ ...options, githubCheckRunId: PROVISIONAL_CP8_CHECK_RUN_ID }), /provisional CP8/);
  assert.throws(() => validateOptions({
    ...options,
    cloudflareDeploymentId: PROVISIONAL_CP8_DEPLOYMENT_ID,
    observedImmutableUrl: PROVISIONAL_CP8_IMMUTABLE_URL,
  }), /provisional CP8/);
  assert.throws(() => validateOptions({ ...options, observedImmutableUrl: "https://87654321.qsite1.pages.dev/" }), /must be exactly/);
  assert.throws(() => validateOptions({ ...options, observedBranchUrl: "https://feature-phase-5b-supporting-route-production.qsite1.pages.dev/" }), /must be exactly/);
  assert.throws(() => validateOptions({ ...options, output: path.join(ROOT, REPORT_FILENAME) }), /outside/);
});

test("R1 CLI selects the repair branch and dynamically binds a fresh observed branch alias", () => {
  const options = validR1Options();
  assert.equal(options.profile, DEPLOYMENT_PROFILE_R1);
  assert.equal(options.branch, R1_REQUIRED_BRANCH);
  assert.equal(options.expectedHead, R1_FINAL_HEAD);
  assert.equal(options.observedBranchUrl, R1_BRANCH_URL);
  assert.equal(
    validateOptions({ ...options, observedBranchUrl: "https://another-observed-r1-alias.qsite1.pages.dev/" }).observedBranchUrl,
    "https://another-observed-r1-alias.qsite1.pages.dev/",
  );
  assert.throws(() => validateOptions({ ...options, expectedHead: R1_PARENT_CP9_SHA }), /new CP10/);
  assert.throws(() => validateOptions({ ...options, branch: REQUIRED_BRANCH }), /--branch/);
  assert.throws(() => validateOptions({ ...options, observedBranchUrl: REQUIRED_BRANCH_URL }), /cannot authorize/);
  assert.throws(() => validateOptions({ ...options, observedBranchUrl: options.observedImmutableUrl }), /must be distinct/);
});

test("the exact nine-commit chain rejects rewritten CP1-CP8, missing CP9, merges, and wrong parents", () => {
  const records = parseLinearLog(serializedChain(), FINAL_HEAD);
  assert.equal(records.length, 9);
  assert.equal(records[0].parents[0], ACCEPTED_PHASE5AR_SHA);
  assert.equal(records.at(-1).parents[0], CP8_HEAD_SHA);
  assert.equal(assertCheckpointChain(records, FINAL_HEAD), true);

  assert.throws(() => assertCheckpointChain(records.slice(0, -1), FINAL_HEAD), /exactly 9/);
  const rewritten = structuredClone(records); rewritten[2].sha = "b".repeat(40);
  assert.throws(() => assertCheckpointChain(rewritten, FINAL_HEAD), /CP3 SHA/);
  const renamed = structuredClone(records); renamed[8].subject = "Generic deployment evidence";
  assert.throws(() => assertCheckpointChain(renamed, FINAL_HEAD), /CP9 subject/);
  const merge = structuredClone(records); merge[8].parents.push("f".repeat(40));
  assert.throws(() => assertCheckpointChain(merge, FINAL_HEAD), /linear child/);
  const wrongParent = structuredClone(records); wrongParent[8].parents = [ACCEPTED_PHASE5AR_SHA];
  assert.throws(() => assertCheckpointChain(wrongParent, FINAL_HEAD), /linear child/);
  assert.throws(() => parseLinearLog(serializedChain(), "c".repeat(40)), /CP9 SHA/);
});

test("R1 chain requires the exact ten linear commits with fixed CP9 as the direct repair parent", () => {
  const records = validR1Chain();
  const parsed = parseLinearLog(serializedChain(records), R1_FINAL_HEAD, DEPLOYMENT_PROFILE_R1);
  assert.equal(parsed.length, 10);
  assert.equal(parsed[8].sha, R1_PARENT_CP9_SHA);
  assert.equal(parsed[8].parents[0], CP8_HEAD_SHA);
  assert.equal(parsed[9].parents[0], R1_PARENT_CP9_SHA);
  assert.equal(parsed[9].subject, R1_CHECKPOINT_SUBJECT);
  assert.equal(assertCheckpointChain(parsed, R1_FINAL_HEAD, DEPLOYMENT_PROFILE_R1), true);

  assert.throws(() => assertCheckpointChain(parsed.slice(0, -1), R1_FINAL_HEAD, DEPLOYMENT_PROFILE_R1), /exactly 10/);
  const rewrittenCp9 = structuredClone(parsed); rewrittenCp9[8].sha = "c".repeat(40);
  assert.throws(() => assertCheckpointChain(rewrittenCp9, R1_FINAL_HEAD, DEPLOYMENT_PROFILE_R1), /CP9 SHA/);
  const renamedRepair = structuredClone(parsed); renamedRepair[9].subject = "Repair About colors";
  assert.throws(() => assertCheckpointChain(renamedRepair, R1_FINAL_HEAD, DEPLOYMENT_PROFILE_R1), /CP10 subject/);
  const wrongParent = structuredClone(parsed); wrongParent[9].parents = [CP8_HEAD_SHA];
  assert.throws(() => assertCheckpointChain(wrongParent, R1_FINAL_HEAD, DEPLOYMENT_PROFILE_R1), /linear child/);
  const merge = structuredClone(parsed); merge[9].parents.push("d".repeat(40));
  assert.throws(() => assertCheckpointChain(merge, R1_FINAL_HEAD, DEPLOYMENT_PROFILE_R1), /linear child/);
});

test("Cloudflare dashboard details and signed check bind account, project, UUID, CP9, and both URLs", () => {
  const options = validOptions();
  const direct = `https://dash.cloudflare.com/${REQUIRED_CLOUDFLARE_ACCOUNT_ID}/pages/view/qsite1/${DEPLOYMENT_ID}`;
  const routed = `https://dash.cloudflare.com/?to=/${REQUIRED_CLOUDFLARE_ACCOUNT_ID}/pages/view/qsite1/${DEPLOYMENT_ID}`;
  assert.equal(cloudflareDetailsBindDeployment(direct, DEPLOYMENT_ID), true);
  assert.equal(cloudflareDetailsBindDeployment(routed, DEPLOYMENT_ID), true);
  assert.equal(cloudflareDetailsBindDeployment(`https://dash.cloudflare.com/?to=//example.com/pages/view/qsite1/${DEPLOYMENT_ID}`, DEPLOYMENT_ID), false);
  assert.equal(cloudflareDetailsBindDeployment(`https://dash.cloudflare.com/${"0".repeat(32)}/pages/view/qsite1/${DEPLOYMENT_ID}`, DEPLOYMENT_ID), false);
  assert.equal(cloudflareDetailsBindDeployment(`https://dash.cloudflare.com/${REQUIRED_CLOUDFLARE_ACCOUNT_ID}/pages/view/other/${DEPLOYMENT_ID}`, DEPLOYMENT_ID), false);
  assert.equal(cloudflareDetailsBindDeployment(`https://example.com/${REQUIRED_CLOUDFLARE_ACCOUNT_ID}/pages/view/qsite1/${DEPLOYMENT_ID}`, DEPLOYMENT_ID), false);

  const authority = verifyCloudflareGithubCheck(options, validCheckRun(options));
  assert.equal(authority.deploymentId, DEPLOYMENT_ID);
  assert.equal(authority.commitHash, FINAL_HEAD);
  assert.equal(authority.branchUrl, REQUIRED_BRANCH_URL);
  const wrongHead = validCheckRun(options); wrongHead.head_sha = "b".repeat(40);
  assert.throws(() => verifyCloudflareGithubCheck(options, wrongHead), /head differs/);
  const missingBranch = validCheckRun(options); missingBranch.output.summary = missingBranch.output.summary.replace(options.observedBranchUrl.slice(0, -1), "");
  assert.throws(() => verifyCloudflareGithubCheck(options, missingBranch), /both observed URLs/);
});

test("R1 signed Cloudflare check binds the dynamic alias, repair branch, UUID, and final head", () => {
  const options = validR1Options();
  const authority = verifyCloudflareGithubCheck(options, validCheckRun(options));
  assert.equal(authority.branch, R1_REQUIRED_BRANCH);
  assert.equal(authority.branchUrl, R1_BRANCH_URL);
  assert.equal(authority.deploymentId, R1_DEPLOYMENT_ID);
  assert.equal(authority.commitHash, R1_FINAL_HEAD);

  const staleAlias = validCheckRun(options);
  staleAlias.output.summary = staleAlias.output.summary.replace(R1_BRANCH_URL.slice(0, -1), REQUIRED_BRANCH_URL.slice(0, -1));
  assert.throws(() => verifyCloudflareGithubCheck(options, staleAlias), /both observed URLs/);
});

test("headers are exact and real 404 permits no-store only with status and byte parity", () => {
  const policies = parseHeadersFile(headerFixture());
  assert.equal(assertRequiredHeaderPolicies(policies), true);
  const asset = validateObservedHeaders({
    publicPath: "/_astro/app.hash.js",
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    cacheControl: "public, max-age=31556952, immutable",
  }, "_astro/app.hash.js", policies);
  assert.deepEqual(asset.matchedPolicies, ["/_astro/*"]);
  assert.throws(() => validateObservedHeaders({
    publicPath: "/_astro/app.hash.js",
    status: 200,
    contentType: "text/javascript",
    cacheControl: "public, max-age=0",
  }, "_astro/app.hash.js", policies), /does not enforce/);

  const local404 = { relativePath: "404.html", bytes: Buffer.from("real-404") };
  assert.doesNotThrow(() => validateDeployedRecord({
    publicPath: "/__phase5b-real-404-proof__/",
    status: 404,
    bytes: Buffer.from("real-404"),
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
  }, local404, policies));
  assert.throws(() => validateDeployedRecord({
    publicPath: "/404.html",
    status: 200,
    bytes: Buffer.from("real-404"),
    contentType: "text/html",
    cacheControl: "no-store",
  }, local404, policies), /HTTP status/);
  assert.throws(() => validateDeployedRecord({
    publicPath: "/__phase5b-real-404-proof__/",
    status: 404,
    bytes: Buffer.from("wrong"),
    contentType: "text/html",
    cacheControl: "no-store",
  }, local404, policies), /byte parity/);
  assert.throws(() => validateObservedHeaders({
    publicPath: "/index.html",
    status: 200,
    contentType: "text/html",
    cacheControl: "no-store",
  }, "index.html", policies), /unsafe/);
});

test("the actual dist has the exact HTML/404/header authority and rejects SPA or extra-route mutations", async () => {
  const authority = await buildDistAuthority(path.join(ROOT, "dist"));
  assert.deepEqual(authority.htmlPaths, [...HTML_AUTHORITY_FILES].sort());
  assert.equal(authority.byPath.has("404.html"), true);
  assert.equal(authority.byPath.has("_headers"), true);
  assert.equal(authority.fileLedger.find(({ relativePath }) => relativePath === "404.html").requestPath, "/__phase5b-real-404-probe__/");
  assert.equal(publicPathForDistFile("pocs/maradin/index.html"), "/pocs/maradin/");

  const records = [...authority.byPath.values()];
  assert.throws(() => validateDistRecords(records.filter(({ relativePath }) => relativePath !== "404.html")), /real 404 HTML authority/);
  assert.throws(() => validateDistRecords([...records, { relativePath: "extra/index.html", bytes: Buffer.from("<!doctype html>") }]), /exact homepage/);
  assert.throws(() => validateDistRecords([...records, { relativePath: "_redirects", bytes: Buffer.from("/* /index.html 200") }]), /SPA redirects/);
  const broken404 = records.map((record) => record.relativePath === "404.html"
    ? { ...record, bytes: Buffer.from("<!doctype html><a href='/'>Home</a>") }
    : record);
  assert.throws(() => validateDistRecords(broken404), /lacks noindex/);
  const missingPolicy = records.map((record) => record.relativePath === "_headers"
    ? { ...record, bytes: Buffer.from("/_astro/*\n  Cache-Control: public, max-age=31556952, immutable") }
    : record);
  assert.throws(() => validateDistRecords(missingPolicy), /exact Phase 5B cache policy/);
});

test("self-test and dry-run execute without Git, build reads, network, or writes", async () => {
  assert.deepEqual(await selfTest(), {
    status: "PASS",
    tests: 8,
    checkpointCount: 9,
    pendingHumanGateCount: 6,
    requiredHeaderPolicyCount: 4,
    provisionalCp8Rejected: true,
  });

  const self = await execFileAsync(process.execPath, [SCRIPT, "--self-test"], { cwd: ROOT, windowsHide: true });
  const selfReport = JSON.parse(self.stdout);
  assert.equal(selfReport.status, "PASS");
  assert.equal(selfReport.checkpointCount, 9);
  assert.equal(selfReport.pendingHumanGateCount, 6);

  const dry = await execFileAsync(process.execPath, [SCRIPT, ...validArguments({ output: false, dryRun: true })], { cwd: ROOT, windowsHide: true });
  const dryReport = JSON.parse(dry.stdout);
  assert.equal(dryReport.status, "PASS");
  assert.equal(dryReport.filesystemReadsPerformed, false);
  assert.equal(dryReport.gitCommandsPerformed, false);
  assert.equal(dryReport.networkRequestsPerformed, false);
  assert.equal(dryReport.writesPerformed, false);
  assert.equal(Object.keys(dryReport.pendingHumanGates).length, 6);
  assert.equal(dryReport.cloudflare.deploymentId, DEPLOYMENT_ID);
});

test("R1 self-test and dry-run remain write-free while reporting the ten-commit authority", async () => {
  assert.deepEqual(await selfTest(DEPLOYMENT_PROFILE_R1), {
    status: "PASS",
    tests: 11,
    checkpointCount: 10,
    pendingHumanGateCount: 6,
    requiredHeaderPolicyCount: 4,
    provisionalCp8Rejected: true,
    profile: DEPLOYMENT_PROFILE_R1,
    cp9ParentFixed: true,
    branchUrlBinding: "observed-and-authority-bound",
  });

  const self = await execFileAsync(process.execPath, [SCRIPT, "--profile", DEPLOYMENT_PROFILE_R1, "--self-test"], { cwd: ROOT, windowsHide: true });
  const selfReport = JSON.parse(self.stdout);
  assert.equal(selfReport.status, "PASS");
  assert.equal(selfReport.profile, DEPLOYMENT_PROFILE_R1);
  assert.equal(selfReport.checkpointCount, 10);
  assert.equal(selfReport.cp9ParentFixed, true);

  const dry = await execFileAsync(process.execPath, [SCRIPT, ...validR1Arguments({ output: false, dryRun: true })], { cwd: ROOT, windowsHide: true });
  const dryReport = JSON.parse(dry.stdout);
  assert.equal(dryReport.status, "PASS");
  assert.equal(dryReport.profile, DEPLOYMENT_PROFILE_R1);
  assert.equal(dryReport.branch, R1_REQUIRED_BRANCH);
  assert.equal(dryReport.checkpointCount, 10);
  assert.equal(dryReport.cloudflare.branchUrl, R1_BRANCH_URL);
  assert.equal(dryReport.filesystemReadsPerformed, false);
  assert.equal(dryReport.gitCommandsPerformed, false);
  assert.equal(dryReport.networkRequestsPerformed, false);
  assert.equal(dryReport.writesPerformed, false);
});

test("module import is inert and contains no baked final CP9 deployment identity", async () => {
  const imported = await execFileAsync(process.execPath, [
    "--input-type=module",
    "--eval",
    `await import(${JSON.stringify(pathToFileURL(SCRIPT).href)});`,
  ], { cwd: ROOT, windowsHide: true });
  assert.equal(imported.stdout, "");
  assert.equal(imported.stderr, "");

  const source = await readFile(SCRIPT, "utf8");
  assert.match(source, /invokedDirectly/);
  assert.equal(source.includes("verify-phase5a-deployment.mjs"), false);
  assert.equal(source.includes("verify-phase5ar-deployment.mjs"), false);
  assert.equal(source.includes(PROVISIONAL_CP8_DEPLOYMENT_ID), true);
  assert.equal(source.includes(PROVISIONAL_CP8_IMMUTABLE_URL), true);
  assert.equal(source.includes(R1_FINAL_HEAD), false);
  assert.equal(source.includes(R1_DEPLOYMENT_ID), false);
  assert.equal(source.includes(R1_BRANCH_URL), false);
});
