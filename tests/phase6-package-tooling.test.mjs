import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACCEPTED_PHASE5B_SHA,
  AUTHORIZATION,
  DEPLOYMENT_VERIFICATION_PATH,
  DEPLOYMENT_VERIFICATION_SCHEMA,
  FROZEN_MAIN_SHA,
  HUMAN_REVIEW_GATES,
  MAX_ARCHIVE_BYTES,
  PACKAGE_SCHEMA,
  R1_AUDIT_SCHEMA,
  R1_DEPLOYMENT_VERIFICATION_SCHEMA,
  R1_HUMAN_EVIDENCE_SCHEMA,
  R1_HUMAN_LEDGER_PATH,
  R1_PACKAGE_SCHEMA,
  R1_REQUIRED_ARCHIVE_FILENAME,
  R1_REQUIRED_BRANCH,
  R1_REQUIRED_BRANCH_URL,
  R1_REQUIRED_PARENT,
  R1_REQUIRED_HUMAN_RECORDINGS,
  REPORT_SPECS,
  REQUIRED_ARCHIVE_FILENAME,
  REQUIRED_BRANCH,
  REQUIRED_BRANCH_URL,
  REQUIRED_REMOTE_URL,
  REQUIRED_REPOSITORY,
  TOPOLOGY_SECTIONS,
  assertAllowedEntry,
  assertExternalPath,
  assertFreshOutputSet,
  assertNoPrivateText,
  buildPackageArtifacts,
  collectPayloadEntries,
  createStoredZipBuffer,
  parseArguments as parsePackageArguments,
  publishFreshSetAtomic,
  safeRelativePath,
  sha256,
  stableJson,
  validateOptionShape,
  validateR1HumanEvidencePayload,
} from "../scripts/package-phase6-human-review.mjs";
import {
  AUDIT_SCHEMA,
  auditBuffers,
  parseArguments as parseAuditArguments,
  parseStoredZip,
  validateR1HumanEvidenceEntries,
} from "../scripts/audit-phase6-human-review-package.mjs";

const execFileAsync = promisify(execFile);
const TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDITOR = path.join(TEST_ROOT, "scripts", "audit-phase6-human-review-package.mjs");
const GENERATED_AT = "2026-08-30T12:00:00.000Z";
const EXPECTED = Object.freeze({
  expectedHead: "a".repeat(40),
  branch: REQUIRED_BRANCH,
  deploymentId: "12345678-1234-4234-8234-123456789abc",
  immutableUrl: "https://12345678.qsite1.pages.dev/",
  branchUrl: REQUIRED_BRANCH_URL,
});
const PROVENANCE = Object.freeze({
  branch: EXPECTED.branch,
  expectedHead: EXPECTED.expectedHead,
  observedHead: EXPECTED.expectedHead,
  acceptedBase: ACCEPTED_PHASE5B_SHA,
  expectedMain: FROZEN_MAIN_SHA,
  deployment: {
    id: EXPECTED.deploymentId,
    immutableUrl: EXPECTED.immutableUrl,
    branchUrl: EXPECTED.branchUrl,
  },
});
const R1_EXPECTED = Object.freeze({
  authorityProfile: "phase6-r1",
  expectedHead: "d".repeat(40),
  branch: R1_REQUIRED_BRANCH,
  deploymentId: "87654321-1234-4234-8234-123456789abc",
  immutableUrl: "https://87654321.qsite1.pages.dev/",
  branchUrl: R1_REQUIRED_BRANCH_URL,
});
const R1_PROVENANCE = Object.freeze({
  authorityProfile: R1_EXPECTED.authorityProfile,
  branch: R1_EXPECTED.branch,
  expectedHead: R1_EXPECTED.expectedHead,
  observedHead: R1_EXPECTED.expectedHead,
  exactParent: R1_REQUIRED_PARENT,
  expectedMain: FROZEN_MAIN_SHA,
  deployment: {
    id: R1_EXPECTED.deploymentId,
    immutableUrl: R1_EXPECTED.immutableUrl,
    branchUrl: R1_EXPECTED.branchUrl,
  },
});

const DEPLOYMENT_CHECKS = Object.freeze({
  exactGitBranchMainAuthority: true,
  signedSuccessfulDeploymentBindsExactHead: true,
  allDeployableFilesComparedWhereCloudflarePermits: true,
  branchImmutableLocalByteParity: true,
  successfulHttpOutcomes: true,
  real404StatusAndByteParity: true,
  requiredHeadersAndCachePolicies: true,
  canonicalBehavior: true,
  productionMainUnchangedAndPhase6Unmerged: true,
});
const R1_DEPLOYMENT_CHECKS = Object.freeze({
  exactR1BranchParentAndFrozenMain: true,
  zeroProductionSourceDiff: true,
  signedSuccessfulDeploymentBindsExactHead: true,
  immutableLocalByteParity: true,
  branchLocalByteParity: true,
  real404HeadersCanonicalAndTenRoutes: true,
});

function fixtureDeploymentVerification(overrides = {}) {
  const document = {
    schema: DEPLOYMENT_VERIFICATION_SCHEMA,
    status: "PASS",
    inputs: {
      expectedHead: EXPECTED.expectedHead,
      acceptedBase: ACCEPTED_PHASE5B_SHA,
      expectedMain: FROZEN_MAIN_SHA,
      repository: REQUIRED_REPOSITORY,
      branch: REQUIRED_BRANCH,
      deploymentId: EXPECTED.deploymentId,
      immutableUrl: EXPECTED.immutableUrl,
      branchUrl: EXPECTED.branchUrl,
      localDist: "dist",
    },
    repository: {
      status: "PASS",
      data: {
        repository: REQUIRED_REPOSITORY,
        branch: REQUIRED_BRANCH,
        head: EXPECTED.expectedHead,
        acceptedBase: ACCEPTED_PHASE5B_SHA,
        directParent: ACCEPTED_PHASE5B_SHA,
        cleanTree: true,
        history: [{ commit: EXPECTED.expectedHead, parents: [ACCEPTED_PHASE5B_SHA], subject: "Fixture Phase 6 commit" }],
        productionDelta: [],
        main: { branch: "main", headSha: FROZEN_MAIN_SHA, frozenAt: FROZEN_MAIN_SHA, containsPhase6Head: false },
        upstream: { ref: `origin/${REQUIRED_BRANCH}`, headSha: EXPECTED.expectedHead, parity: true },
        liveRemote: { branchRef: `refs/heads/${REQUIRED_BRANCH}`, branchHeadSha: EXPECTED.expectedHead, mainRef: "refs/heads/main", mainHeadSha: FROZEN_MAIN_SHA, parity: true },
      },
    },
    deployment: {
      status: "PASS",
      data: {
        authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
        checkRunId: "123",
        appSlug: "cloudflare-pages",
        completedAt: GENERATED_AT,
        deploymentId: EXPECTED.deploymentId,
        immutableUrl: EXPECTED.immutableUrl,
        branchUrl: EXPECTED.branchUrl,
        branch: REQUIRED_BRANCH,
        commitHash: EXPECTED.expectedHead,
        environment: "preview",
        status: "PASS",
      },
    },
    dist: { status: "PASS" },
    origins: {
      immutable: { status: "PASS", data: { origin: EXPECTED.immutableUrl, status: "PASS" } },
      branch: { status: "PASS", data: { origin: EXPECTED.branchUrl, status: "PASS" } },
    },
    checks: DEPLOYMENT_CHECKS,
    failures: [],
  };
  return { ...document, ...overrides };
}

function fixtureR1DeploymentVerification(overrides = {}) {
  const document = {
    schema: R1_DEPLOYMENT_VERIFICATION_SCHEMA,
    status: "PASS",
    inputs: {
      expectedHead: R1_EXPECTED.expectedHead,
      exactParent: R1_REQUIRED_PARENT,
      expectedMain: FROZEN_MAIN_SHA,
      repository: REQUIRED_REPOSITORY,
      branch: R1_REQUIRED_BRANCH,
      deploymentId: R1_EXPECTED.deploymentId,
      immutableUrl: R1_EXPECTED.immutableUrl,
      branchUrl: R1_EXPECTED.branchUrl,
      localDist: "dist",
    },
    repository: {
      status: "PASS",
      data: {
        repository: REQUIRED_REPOSITORY,
        branch: R1_REQUIRED_BRANCH,
        head: R1_EXPECTED.expectedHead,
        exactParent: R1_REQUIRED_PARENT,
        directParent: R1_REQUIRED_PARENT,
        cleanTree: true,
        history: [{ commit: R1_EXPECTED.expectedHead, parents: [R1_REQUIRED_PARENT], subject: "Fixture Phase 6-R1 commit" }],
        main: { local: FROZEN_MAIN_SHA, upstream: FROZEN_MAIN_SHA, live: FROZEN_MAIN_SHA, modifiedOrMerged: false },
        upstream: { ref: `origin/${R1_REQUIRED_BRANCH}`, head: R1_EXPECTED.expectedHead, live: R1_EXPECTED.expectedHead, parity: true },
        productionSourceDiff: [],
      },
    },
    deployment: {
      status: "PASS",
      data: {
        authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
        checkRunId: "456",
        appSlug: "cloudflare-workers-and-pages",
        completedAt: GENERATED_AT,
        deploymentId: R1_EXPECTED.deploymentId,
        immutableUrl: R1_EXPECTED.immutableUrl,
        branchUrl: R1_EXPECTED.branchUrl,
        branch: R1_REQUIRED_BRANCH,
        commitHash: R1_EXPECTED.expectedHead,
        environment: "preview",
        status: "PASS",
      },
    },
    dist: { status: "PASS" },
    origins: {
      immutable: { status: "PASS", data: { origin: R1_EXPECTED.immutableUrl, status: "PASS" } },
      branch: { status: "PASS", data: { origin: R1_EXPECTED.branchUrl, status: "PASS" } },
    },
    checks: R1_DEPLOYMENT_CHECKS,
    failures: [],
  };
  return { ...document, ...overrides };
}

function fixturePayloadEntries() {
  const entries = [];
  const trackedReports = REPORT_SPECS.map(({ source }) => source).sort();
  entries.push({
    path: "00-provenance/git-provenance.json",
    data: Buffer.from(stableJson({
      schema: `${PACKAGE_SCHEMA}.git-provenance`,
      status: "PASS",
      branch: EXPECTED.branch,
      head: EXPECTED.expectedHead,
      directParents: [ACCEPTED_PHASE5B_SHA],
      cleanTree: true,
      acceptedBase: ACCEPTED_PHASE5B_SHA,
      acceptedBaseAncestor: true,
      headMergedIntoMain: false,
      localMain: { ref: "refs/heads/main", head: FROZEN_MAIN_SHA },
      originMain: { ref: "refs/remotes/origin/main", head: FROZEN_MAIN_SHA },
      liveMain: { ref: "refs/heads/main", head: FROZEN_MAIN_SHA },
      upstream: { ref: `origin/${REQUIRED_BRANCH}`, head: EXPECTED.expectedHead, liveHead: EXPECTED.expectedHead, parity: true },
      remote: { name: "origin", url: REQUIRED_REMOTE_URL, repository: REQUIRED_REPOSITORY },
      trackedReports,
    })),
  });
  entries.push({ path: DEPLOYMENT_VERIFICATION_PATH, data: Buffer.from(stableJson(fixtureDeploymentVerification())) });
  for (const [index, report] of REPORT_SPECS.entries()) {
    entries.push({ path: report.archive, data: Buffer.from(`# ${report.source}\nfixture report ${index}\n`) });
  }
  const populatedByAuthority = new Set(["00-provenance", "01-baseline", "10-poster-study", "11-physical-device", "13-package"]);
  for (const [index, section] of TOPOLOGY_SECTIONS.entries()) {
    if (!populatedByAuthority.has(section)) {
      entries.push({ path: `${section}/distilled-${index}.json`, data: Buffer.from(`{"section":"${section}","ordinal":${index}}\n`) });
    }
  }
  return entries;
}

function fixtureR1HumanEvidenceEntries() {
  const recordings = R1_REQUIRED_HUMAN_RECORDINGS.map((filename, index) => {
    const marker = Buffer.from(`fixture physical human recording ${index + 1}: ${filename}`);
    const ftyp = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32]);
    const free = Buffer.alloc(8);
    free.writeUInt32BE(8 + marker.length, 0);
    free.write("free", 4, "ascii");
    const data = Buffer.concat([ftyp, free, marker]);
    return { filename, data, byteSize: data.length, sha256: sha256(data) };
  });
  const ledger = {
    schema: R1_HUMAN_EVIDENCE_SCHEMA,
    createdAt: GENERATED_AT,
    status: "PENDING HUMAN REVIEW",
    evidenceClass: "HUMAN DEVICE EVIDENCE",
    rootExists: true,
    requiredFilenames: [...R1_REQUIRED_HUMAN_RECORDINGS],
    missingFilenames: [],
    entries: recordings.map(({ filename, byteSize, sha256: hash }) => ({
      filename,
      sha256: hash,
      byteSize,
      evidenceClass: "PHYSICAL HUMAN RECORDING",
      device: "Synthetic fixture; not a physical-device claim",
      os: "Synthetic fixture; not reviewed",
      browser: filename.startsWith("iphone-safari-") ? "Safari (version not reviewed)" : filename === "chrome-200-percent.mp4" ? "Chrome (version not reviewed)" : null,
      browserVersion: null,
      testSteps: ["Exercise the package binding contract without claiming a human result."],
      observations: ["Synthetic bytes remain pending and are not acceptance evidence."],
      observedResult: "PENDING HUMAN REVIEW; fixture presence is not a physical-device pass.",
      status: "PENDING HUMAN REVIEW",
      failureReferences: [],
    })),
    policy: { filePresenceIsPass: false, machineRecordingSubstitutionAllowed: false, failRequiresTimestampOrFrame: true, allFourFilesRequiredBeforePackaging: true },
  };
  const sourceBytes = Buffer.from(stableJson(ledger));
  const wrapper = {
    schema: "quantum-hub.phase-6.final-evidence-assembly.v1.distilled-json",
    status: "PENDING HUMAN REVIEW",
    role: "physical-device-result",
    source: { relativePath: "human-device/ledger.json", sha256: sha256(sourceBytes) },
    selection: null,
    payload: ledger,
  };
  return [
    { path: R1_HUMAN_LEDGER_PATH, data: Buffer.from(stableJson(wrapper)) },
    ...recordings.map(({ filename, data }) => ({ path: `11-physical-device/recordings/${filename}`, data })),
  ];
}

function fixtureR1PayloadEntries() {
  const entries = [];
  const trackedReports = REPORT_SPECS.map(({ source }) => source).sort();
  entries.push({
    path: "00-provenance/git-provenance.json",
    data: Buffer.from(stableJson({
      schema: `${R1_PACKAGE_SCHEMA}.git-provenance`,
      status: "PASS",
      branch: R1_EXPECTED.branch,
      head: R1_EXPECTED.expectedHead,
      directParents: [R1_REQUIRED_PARENT],
      cleanTree: true,
      exactParent: R1_REQUIRED_PARENT,
      exactParentAncestor: true,
      headMergedIntoMain: false,
      localMain: { ref: "refs/heads/main", head: FROZEN_MAIN_SHA },
      originMain: { ref: "refs/remotes/origin/main", head: FROZEN_MAIN_SHA },
      liveMain: { ref: "refs/heads/main", head: FROZEN_MAIN_SHA },
      upstream: { ref: `origin/${R1_REQUIRED_BRANCH}`, head: R1_EXPECTED.expectedHead, liveHead: R1_EXPECTED.expectedHead, parity: true },
      remote: { name: "origin", url: REQUIRED_REMOTE_URL, repository: REQUIRED_REPOSITORY },
      trackedReports,
    })),
  });
  entries.push({ path: DEPLOYMENT_VERIFICATION_PATH, data: Buffer.from(stableJson(fixtureR1DeploymentVerification())) });
  for (const [index, report] of REPORT_SPECS.entries()) {
    entries.push({ path: report.archive, data: Buffer.from(`# ${report.source}\nR1 fixture report ${index}\n`) });
  }
  entries.push(...fixtureR1HumanEvidenceEntries());
  const populatedByAuthority = new Set(["00-provenance", "01-baseline", "10-poster-study", "11-physical-device", "13-package"]);
  for (const [index, section] of TOPOLOGY_SECTIONS.entries()) {
    if (!populatedByAuthority.has(section)) {
      entries.push({ path: `${section}/r1-distilled-${index}.json`, data: Buffer.from(`{"section":"${section}","r1Ordinal":${index}}\n`) });
    }
  }
  return entries;
}

function fixtureArtifacts(options = {}) {
  return buildPackageArtifacts({
    payloadEntries: fixturePayloadEntries(),
    provenance: PROVENANCE,
    outputFilename: REQUIRED_ARCHIVE_FILENAME,
    generatedAt: GENERATED_AT,
    ...options,
  });
}

function fixtureR1Artifacts(options = {}) {
  return buildPackageArtifacts({
    payloadEntries: fixtureR1PayloadEntries(),
    provenance: R1_PROVENANCE,
    outputFilename: R1_REQUIRED_ARCHIVE_FILENAME,
    generatedAt: GENERATED_AT,
    ...options,
  });
}

test("Phase 6 package authority remains fixed, pending, and capped", () => {
  assert.deepEqual(TOPOLOGY_SECTIONS, [
    "00-provenance", "01-baseline", "02-cross-engine", "03-homepage-motion",
    "04-supporting-routes", "05-history-bfcache", "06-performance", "07-memory",
    "08-network-media", "09-accessibility", "10-poster-study", "11-physical-device",
    "12-regression", "13-package",
  ]);
  assert.equal(REPORT_SPECS.length, 4);
  assert.equal(Object.keys(HUMAN_REVIEW_GATES).length, 6);
  assert.ok(Object.values(HUMAN_REVIEW_GATES).every((value) => value === "PENDING HUMAN REVIEW"));
  assert.ok(Object.values(AUTHORIZATION).every((value) => value === false));
  assert.equal(MAX_ARCHIVE_BYTES, 75 * 1024 * 1024);
  assert.equal(REQUIRED_BRANCH, "feature/phase-6-global-hardening");
  assert.equal(ACCEPTED_PHASE5B_SHA, "005a36860ecbfd6fedb3d3f2223f168c1edfbb05");
  assert.equal(FROZEN_MAIN_SHA, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(REQUIRED_BRANCH_URL, "https://feature-phase-6-global-harde.qsite1.pages.dev/");
  assert.equal(REQUIRED_ARCHIVE_FILENAME, "phase-6-global-hardening-human-review.zip");
});

test("package and auditor CLIs enforce the exact Phase 6 and Cloudflare authorities", () => {
  const common = [
    "--expected-head", EXPECTED.expectedHead,
    "--branch", EXPECTED.branch,
    "--deployment-id", EXPECTED.deploymentId,
    "--immutable-url", EXPECTED.immutableUrl,
    "--branch-url", EXPECTED.branchUrl,
  ];
  const packageOptions = parsePackageArguments(["--evidence-root", "fixture-evidence", "--output", REQUIRED_ARCHIVE_FILENAME, "--generated-at", GENERATED_AT, ...common]);
  assert.equal(packageOptions.expectedHead, EXPECTED.expectedHead);
  assert.equal(packageOptions.deploymentId, EXPECTED.deploymentId);
  assert.match(packageOptions.output, new RegExp(`${REQUIRED_ARCHIVE_FILENAME.replaceAll(".", "\\.")}$`));
  assert.equal(validateOptionShape(packageOptions).immutableUrl, EXPECTED.immutableUrl);
  const auditOptions = parseAuditArguments(["--archive", REQUIRED_ARCHIVE_FILENAME, "--manifest", "phase-6-global-hardening-human-review-manifest.json", "--audit-output", "phase-6-global-hardening-human-review-audit.json", ...common, "--expected-parent-process-id", "123"]);
  assert.equal(auditOptions.branch, EXPECTED.branch);
  assert.equal(auditOptions.expectedParentProcessId, 123);
  assert.throws(() => validateOptionShape({ ...packageOptions, expectedHead: "not-a-sha" }), /expected-head/);
  assert.throws(() => validateOptionShape({ ...packageOptions, branch: "feature/phase-6-fixture" }), /branch must be exactly/);
  assert.throws(() => validateOptionShape({ ...packageOptions, deploymentId: "fixture-deployment" }), /Cloudflare deployment UUID/);
  assert.throws(() => validateOptionShape({ ...packageOptions, immutableUrl: "https://87654321.qsite1.pages.dev/" }), /immutable-url must be exactly/);
  assert.throws(() => validateOptionShape({ ...packageOptions, branchUrl: "https://another.qsite1.pages.dev/" }), /branch-url must be exactly/);
  assert.throws(() => validateOptionShape({ ...packageOptions, generatedAt: "August 30, 2026" }), /canonical ISO/);
  assert.throws(() => validateOptionShape({ ...packageOptions, output: path.resolve("fixture.zip") }), /output basename must be exactly/);
});

test("Phase 6-R1 packaging selects only the exact repair authority while preserving legacy defaults", async () => {
  assert.equal(R1_PACKAGE_SCHEMA, "quantum-hub.phase-6-r1.validation-closure-human-review.v1");
  assert.equal(R1_REQUIRED_BRANCH, "repair/phase-6-r1-validation-closure");
  assert.equal(R1_REQUIRED_PARENT, "aee036740b129624c54b8f1b878229f955d187ae");
  assert.equal(R1_REQUIRED_BRANCH_URL, "https://repair-phase-6-r1-validation.qsite1.pages.dev/");
  assert.equal(R1_REQUIRED_ARCHIVE_FILENAME, "phase-6-r1-validation-closure-human-review.zip");

  const common = [
    "--authority-profile", "phase6-r1",
    "--expected-head", R1_EXPECTED.expectedHead,
    "--branch", R1_EXPECTED.branch,
    "--deployment-id", R1_EXPECTED.deploymentId,
    "--immutable-url", R1_EXPECTED.immutableUrl,
    "--branch-url", R1_EXPECTED.branchUrl,
  ];
  const packageOptions = parsePackageArguments(["--evidence-root", "fixture-evidence", "--output", R1_REQUIRED_ARCHIVE_FILENAME, "--generated-at", GENERATED_AT, ...common]);
  assert.equal(packageOptions.authorityProfile, "phase6-r1");
  assert.equal(validateOptionShape(packageOptions).branch, R1_REQUIRED_BRANCH);
  const auditOptions = parseAuditArguments(["--archive", R1_REQUIRED_ARCHIVE_FILENAME, "--manifest", "phase-6-r1-validation-closure-human-review-manifest.json", "--audit-output", "phase-6-r1-validation-closure-human-review-audit.json", ...common, "--expected-parent-process-id", "123"]);
  assert.equal(auditOptions.authorityProfile, "phase6-r1");
  assert.equal(auditOptions.branch, R1_REQUIRED_BRANCH);
  assert.throws(() => validateOptionShape({ ...packageOptions, authorityProfile: "phase6", branch: REQUIRED_BRANCH }), /output basename must be exactly/);
  assert.throws(() => validateOptionShape({ ...packageOptions, branch: REQUIRED_BRANCH }), /branch must be exactly/);
  assert.throws(() => validateOptionShape({ ...packageOptions, branchUrl: REQUIRED_BRANCH_URL }), /branch-url must be exactly/);
  assert.throws(() => parsePackageArguments(["--authority-profile"]), /requires a value/);

  const packageDocument = JSON.parse(await readFile(path.join(TEST_ROOT, "package.json"), "utf8"));
  assert.equal(packageDocument.scripts["package:phase6-r1-review"], "node scripts/package-phase6-human-review.mjs --authority-profile phase6-r1");
  assert.equal(packageDocument.scripts["audit:phase6-r1-review"], "node scripts/audit-phase6-human-review-package.mjs --authority-profile phase6-r1");
});

test("an assembled Phase 6-R1 artifact passes only under its R1 package and deployment schemas", () => {
  const humanBinding = validateR1HumanEvidencePayload(fixtureR1PayloadEntries());
  assert.equal(humanBinding.recordings.length, 4);
  assert.deepEqual(humanBinding.recordings.map(({ filename }) => filename).sort(), [...R1_REQUIRED_HUMAN_RECORDINGS].sort());
  const artifacts = fixtureR1Artifacts();
  assert.equal(artifacts.manifest.schema, R1_PACKAGE_SCHEMA);
  assert.equal(artifacts.detached.schema, `${R1_PACKAGE_SCHEMA}.detached-manifest`);
  assert.equal(artifacts.manifest.provenance.authorityProfile, "phase6-r1");
  assert.equal(artifacts.manifest.provenance.exactParent, R1_REQUIRED_PARENT);
  assert.equal(artifacts.manifest.deploymentVerification.schema, R1_DEPLOYMENT_VERIFICATION_SCHEMA);
  const result = auditBuffers({
    archiveBytes: artifacts.archiveBytes,
    detachedBytes: artifacts.detachedBytes,
    archiveFilename: R1_REQUIRED_ARCHIVE_FILENAME,
    expected: R1_EXPECTED,
  });
  assert.equal(result.manifest.schema, R1_PACKAGE_SCHEMA);
  assert.equal(result.deploymentVerification.binding.schema, R1_DEPLOYMENT_VERIFICATION_SCHEMA);
  assert.deepEqual(result.manifest.humanEvidence, humanBinding);
  assert.deepEqual(validateR1HumanEvidenceEntries(parseStoredZip(artifacts.archiveBytes).entries), humanBinding);
  assert.throws(() => auditBuffers({ archiveBytes: artifacts.archiveBytes, detachedBytes: artifacts.detachedBytes, archiveFilename: REQUIRED_ARCHIVE_FILENAME, expected: EXPECTED }), /in-archive manifest authority differs|detached archive binding differs/);
  assert.throws(() => auditBuffers({ archiveBytes: artifacts.archiveBytes, detachedBytes: artifacts.detachedBytes, archiveFilename: REQUIRED_ARCHIVE_FILENAME, expected: R1_EXPECTED }), /archive filename must be exactly/);
  assert.throws(() => buildPackageArtifacts({ payloadEntries: fixtureR1PayloadEntries(), provenance: R1_PROVENANCE, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT }), /output filename must be exactly/);
});

test("Phase 6-R1 packager and auditor reject missing, unbound, invalid, or falsely promoted human recordings", () => {
  const build = (payloadEntries) => buildPackageArtifacts({ payloadEntries, provenance: R1_PROVENANCE, outputFilename: R1_REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT });
  const withoutLedger = fixtureR1PayloadEntries().filter(({ path: relativePath }) => relativePath !== R1_HUMAN_LEDGER_PATH);
  assert.throws(() => build(withoutLedger), /requires the human-evidence ledger/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(withoutLedger.map(({ path: relativePath, data }) => [relativePath, data]))), /requires the human-evidence ledger/);

  const missingFilename = R1_REQUIRED_HUMAN_RECORDINGS[0];
  const withoutRecording = fixtureR1PayloadEntries().filter(({ path: relativePath }) => relativePath !== `11-physical-device/recordings/${missingFilename}`);
  assert.throws(() => build(withoutRecording), /physical recording inventory differs/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(withoutRecording.map(({ path: relativePath, data }) => [relativePath, data]))), /physical recording inventory differs/);

  const unbound = fixtureR1PayloadEntries().map((entry) => {
    if (entry.path !== R1_HUMAN_LEDGER_PATH) return entry;
    const wrapper = JSON.parse(entry.data.toString("utf8"));
    wrapper.payload.entries[0].byteSize += 1;
    return { ...entry, data: Buffer.from(stableJson(wrapper)) };
  });
  assert.throws(() => build(unbound), /not hash\/size\/status bound/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(unbound.map(({ path: relativePath, data }) => [relativePath, data]))), /not hash\/size\/status bound/);

  const invalidMp4Filename = R1_REQUIRED_HUMAN_RECORDINGS[0];
  const invalidMp4Path = `11-physical-device/recordings/${invalidMp4Filename}`;
  const invalidMp4 = fixtureR1PayloadEntries();
  const invalidBytes = Buffer.from(invalidMp4.find(({ path: relativePath }) => relativePath === invalidMp4Path).data);
  invalidBytes.fill(0, 4, 8);
  for (const entry of invalidMp4) {
    if (entry.path === invalidMp4Path) entry.data = invalidBytes;
    if (entry.path === R1_HUMAN_LEDGER_PATH) {
      const wrapper = JSON.parse(entry.data.toString("utf8"));
      const record = wrapper.payload.entries.find(({ filename }) => filename === invalidMp4Filename);
      record.byteSize = invalidBytes.length;
      record.sha256 = sha256(invalidBytes);
      entry.data = Buffer.from(stableJson(wrapper));
    }
  }
  assert.throws(() => build(invalidMp4), /MP4 container signature differs/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(invalidMp4.map(({ path: relativePath, data }) => [relativePath, data]))), /MP4 container signature differs/);

  const falseOverallPass = fixtureR1PayloadEntries().map((entry) => {
    if (entry.path !== R1_HUMAN_LEDGER_PATH) return entry;
    const wrapper = JSON.parse(entry.data.toString("utf8"));
    wrapper.status = "PASS";
    wrapper.payload.status = "PASS";
    return { ...entry, data: Buffer.from(stableJson(wrapper)) };
  });
  assert.throws(() => build(falseOverallPass), /ledger status must be PENDING HUMAN REVIEW/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(falseOverallPass.map(({ path: relativePath, data }) => [relativePath, data]))), /ledger status must be PENDING HUMAN REVIEW/);

  const missingReviewField = fixtureR1PayloadEntries().map((entry) => {
    if (entry.path !== R1_HUMAN_LEDGER_PATH) return entry;
    const wrapper = JSON.parse(entry.data.toString("utf8"));
    delete wrapper.payload.entries[0].device;
    return { ...entry, data: Buffer.from(stableJson(wrapper)) };
  });
  assert.throws(() => build(missingReviewField), /review metadata is incomplete/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(missingReviewField.map(({ path: relativePath, data }) => [relativePath, data]))), /review metadata is incomplete/);
});

test("Phase 6-R1 deployment semantics fail closed on parent, production-diff, and signed-app mismatches", () => {
  const mutateDeployment = (mutate) => fixtureR1PayloadEntries().map((entry) => {
    if (entry.path !== DEPLOYMENT_VERIFICATION_PATH) return entry;
    const document = JSON.parse(entry.data.toString("utf8"));
    mutate(document);
    return { ...entry, data: Buffer.from(stableJson(document)) };
  });
  const build = (payloadEntries) => buildPackageArtifacts({ payloadEntries, provenance: R1_PROVENANCE, outputFilename: R1_REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT });
  assert.throws(() => build(mutateDeployment((document) => { document.inputs.exactParent = "b".repeat(40); })), /deployment verification inputs/);
  assert.throws(() => build(mutateDeployment((document) => { document.repository.data.productionSourceDiff = ["src/pages/index.astro"]; })), /production-source diff/);
  assert.throws(() => build(mutateDeployment((document) => { document.deployment.data.appSlug = "cloudflare-pages"; })), /Cloudflare app authority/);
  assert.throws(() => build(mutateDeployment((document) => { document.checks.zeroProductionSourceDiff = false; })), /deployment verification checks/);
});

test("portable path, raw/cache/archive, and privacy/secret guards fail closed", () => {
  assert.throws(() => safeRelativePath("../escape.json"), /unsafe/);
  assert.throws(() => safeRelativePath("02-cross-engine\\capture.json"), /portable/);
  assert.throws(() => assertAllowedEntry("02-cross-engine/raw/frame-001.png"), /forbidden/);
  assert.throws(() => assertAllowedEntry("02-cross-engine/raw_frames/frame-001.png"), /forbidden/);
  assert.throws(() => assertAllowedEntry("06-performance/cache/result.json"), /forbidden/);
  assert.throws(() => assertAllowedEntry("12-regression/review.zip"), /forbidden/);
  assert.throws(() => assertAllowedEntry("09-accessibility/result.html"), /unsupported/);
  assert.throws(() => assertNoPrivateText(Buffer.from("C:\\Users\\reviewer\\capture.png"), "06-performance/report.md"), /privacy/);
  assert.throws(() => assertNoPrivateText(Buffer.from("stored under /tmp/reviewer/capture.png"), "06-performance/report.md"), /privacy/);
  assert.throws(() => assertNoPrivateText(Buffer.from("api_key=abcdefghijklmnop"), "08-network-media/report.txt"), /privacy/);
  const opaqueBinary = Buffer.from([0, 255, 92, 92, 128, 31, 56, 92, 129, 91, 200, 201]);
  assert.doesNotThrow(() => assertNoPrivateText(opaqueBinary, "10-poster-study/difference.png"));
  assert.throws(() => assertNoPrivateText(Buffer.from("PNG metadata C:\\Users\\reviewer\\capture.png remains"), "10-poster-study/metadata.png"), /privacy/);
  assert.throws(() => assertNoPrivateText(Buffer.from("C:\\Users\\reviewer\\capture.png"), "10-poster-study/notes.txt"), /privacy/);
});

test("a compact complete package passes canonical ZIP and independent semantic audit", () => {
  const artifacts = fixtureArtifacts();
  const parsed = parseStoredZip(artifacts.archiveBytes);
  assert.equal(parsed.canonical, true);
  assert.equal(parsed.crcValidated, true);
  assert.equal(parsed.entries.size, artifacts.files.length + 1);
  const result = auditBuffers({
    archiveBytes: artifacts.archiveBytes,
    detachedBytes: artifacts.detachedBytes,
    archiveFilename: REQUIRED_ARCHIVE_FILENAME,
    expected: EXPECTED,
  });
  assert.equal(result.reviewPolicy, "PASS");
  assert.equal(result.privacyAndSecrets, "PASS");
  assert.deepEqual(Object.keys(result.topology), TOPOLOGY_SECTIONS);
  for (const report of REPORT_SPECS) assert.ok(result.entries.has(report.archive));
  assert.equal(result.deploymentVerification.binding.path, DEPLOYMENT_VERIFICATION_PATH);
  assert.equal(result.deploymentVerification.binding.schema, DEPLOYMENT_VERIFICATION_SCHEMA);
});

test("two builds with the same canonical generatedAt are byte-for-byte deterministic", () => {
  const first = fixtureArtifacts();
  const second = fixtureArtifacts();
  assert.deepEqual(first.archiveBytes, second.archiveBytes);
  assert.deepEqual(first.detachedBytes, second.detachedBytes);
  assert.deepEqual(first.manifestBytes, second.manifestBytes);
  assert.throws(() => buildPackageArtifacts({
    payloadEntries: fixturePayloadEntries(),
    provenance: PROVENANCE,
    outputFilename: REQUIRED_ARCHIVE_FILENAME,
  }), /generatedAt must be a canonical ISO timestamp/);
});

test("the builder semantically binds the required successful Phase 6 deployment report", () => {
  const mutateDeployment = (mutate) => fixturePayloadEntries().map((entry) => {
    if (entry.path !== DEPLOYMENT_VERIFICATION_PATH) return entry;
    const document = JSON.parse(entry.data.toString("utf8"));
    mutate(document);
    return { ...entry, data: Buffer.from(stableJson(document)) };
  });
  const build = (payloadEntries) => buildPackageArtifacts({ payloadEntries, provenance: PROVENANCE, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT });
  assert.throws(() => build(fixturePayloadEntries().filter(({ path: relativePath }) => relativePath !== DEPLOYMENT_VERIFICATION_PATH)), /required deployment verification artifact is missing/);
  assert.throws(() => build(mutateDeployment((document) => { document.inputs.expectedMain = "b".repeat(40); })), /deployment verification inputs/);
  assert.throws(() => build(mutateDeployment((document) => { document.repository.data.history[0].parents[0] = "b".repeat(40); })), /linear descendant/);
  assert.throws(() => build(mutateDeployment((document) => { document.deployment.data.commitHash = "b".repeat(40); })), /signed Cloudflare authority/);
  assert.throws(() => build(mutateDeployment((document) => { document.origins.branch.status = "FAIL"; })), /dist\/origin parity/);
  assert.throws(() => build(mutateDeployment((document) => { document.checks.canonicalBehavior = false; })), /deployment verification checks/);
  assert.throws(() => build(mutateDeployment((document) => { document.failures.push({ check: "fixture" }); })), /deployment verification failures/);
});

test("the auditor rejects byte tampering through CRC before trusting manifests", () => {
  const artifacts = fixtureArtifacts();
  const tampered = Buffer.from(artifacts.archiveBytes);
  const needle = Buffer.from("fixture report 0");
  const offset = tampered.indexOf(needle);
  assert.ok(offset >= 0);
  tampered[offset] ^= 0x01;
  assert.throws(() => parseStoredZip(tampered), /CRC rejection|canonical/);
});

test("the auditor rejects a canonically rebuilt ZIP whose payload differs from its manifest", () => {
  const artifacts = fixtureArtifacts();
  const entries = parseStoredZip(artifacts.archiveBytes).entries;
  entries.set("02-cross-engine/distilled-2.json", Buffer.from("{\"tampered\":true}\n"));
  const rebuilt = createStoredZipBuffer([...entries].map(([entryPath, data]) => ({ path: entryPath, data })));
  assert.throws(() => auditBuffers({
    archiveBytes: rebuilt,
    detachedBytes: artifacts.detachedBytes,
    archiveFilename: REQUIRED_ARCHIVE_FILENAME,
    expected: EXPECTED,
  }), /detached archive binding|manifest hash\/size/);
});

test("the auditor rejects a cryptographically rebound but semantically false deployment report", () => {
  const artifacts = fixtureArtifacts();
  const entries = parseStoredZip(artifacts.archiveBytes).entries;
  const deployment = JSON.parse(entries.get(DEPLOYMENT_VERIFICATION_PATH).toString("utf8"));
  deployment.inputs.expectedMain = "b".repeat(40);
  const deploymentBytes = Buffer.from(stableJson(deployment));
  entries.set(DEPLOYMENT_VERIFICATION_PATH, deploymentBytes);

  const binding = {
    path: DEPLOYMENT_VERIFICATION_PATH,
    schema: DEPLOYMENT_VERIFICATION_SCHEMA,
    status: "PASS",
    byteSize: deploymentBytes.length,
    sha256: sha256(deploymentBytes),
  };
  const metadataPath = "13-package/package-metadata.json";
  const metadata = JSON.parse(entries.get(metadataPath).toString("utf8"));
  metadata.deploymentVerification = binding;
  const metadataBytes = Buffer.from(stableJson(metadata));
  entries.set(metadataPath, metadataBytes);

  const manifest = JSON.parse(entries.get("MANIFEST.json").toString("utf8"));
  manifest.deploymentVerification = binding;
  for (const record of manifest.files) {
    if (record.path === DEPLOYMENT_VERIFICATION_PATH) Object.assign(record, { byteSize: deploymentBytes.length, sha256: sha256(deploymentBytes) });
    if (record.path === metadataPath) Object.assign(record, { byteSize: metadataBytes.length, sha256: sha256(metadataBytes) });
  }
  const manifestBytes = Buffer.from(stableJson(manifest));
  entries.set("MANIFEST.json", manifestBytes);
  const archiveBytes = createStoredZipBuffer([...entries].map(([entryPath, data]) => ({ path: entryPath, data })));

  const detached = JSON.parse(artifacts.detachedBytes.toString("utf8"));
  Object.assign(detached.archive, { byteSize: archiveBytes.length, sha256: sha256(archiveBytes) });
  Object.assign(detached.inArchiveManifest, { byteSize: manifestBytes.length, sha256: sha256(manifestBytes) });
  detached.deploymentVerification = binding;
  assert.throws(() => auditBuffers({
    archiveBytes,
    detachedBytes: Buffer.from(stableJson(detached)),
    archiveFilename: REQUIRED_ARCHIVE_FILENAME,
    expected: EXPECTED,
  }), /deployment verification inputs/);
});

test("the builder rejects duplicate paths, duplicate payload hashes, missing topology, and oversize output", () => {
  const base = fixturePayloadEntries();
  assert.throws(() => buildPackageArtifacts({ payloadEntries: [...base, { ...base[0] }], provenance: PROVENANCE, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT }), /duplicate package path/);
  assert.throws(() => buildPackageArtifacts({ payloadEntries: [...base, { path: "02-cross-engine/copied.json", data: Buffer.from(base[0].data) }], provenance: PROVENANCE, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT }), /duplicate package payload/);
  assert.throws(() => buildPackageArtifacts({ payloadEntries: base.filter(({ path: relativePath }) => !relativePath.startsWith("12-regression/")), provenance: PROVENANCE, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT }), /omits 12-regression/);
  assert.throws(() => fixtureArtifacts({ maximumBytes: 512 }), /maximum is 512/);
});

test("external evidence collection adds exactly the four repository reports and rejects reserved collisions", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qh-phase6-package-fixture-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const evidenceRoot = path.join(temporary, "evidence");
  const reportRoot = path.join(temporary, "reports");
  await mkdir(path.join(evidenceRoot, "02-cross-engine"), { recursive: true });
  await mkdir(reportRoot, { recursive: true });
  await writeFile(path.join(evidenceRoot, "02-cross-engine", "summary.json"), "{\"external\":true}\n");
  for (const [index, report] of REPORT_SPECS.entries()) await writeFile(path.join(reportRoot, report.source), `# report ${index}\n`);
  const entries = await collectPayloadEntries(evidenceRoot, reportRoot);
  assert.deepEqual(entries.map(({ path: relativePath }) => relativePath), ["02-cross-engine/summary.json", ...REPORT_SPECS.map(({ archive }) => archive)]);

  const collisionRoot = path.join(temporary, "collision");
  await mkdir(path.join(collisionRoot, "01-baseline"), { recursive: true });
  await writeFile(path.join(collisionRoot, "01-baseline", "PHASE_6_BASELINE.md"), "collision\n");
  await assert.rejects(() => collectPayloadEntries(collisionRoot, reportRoot), /reserved package path/);
});

test("external output policy and fresh atomic publication refuse repository paths and overwrites", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qh-phase6-fresh-output-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  assert.throws(() => assertExternalPath(path.join(TEST_ROOT, "inside.zip")), /outside the repository/);
  const sourceArchive = path.join(temporary, "staged.zip");
  const sourceManifest = path.join(temporary, "staged.json");
  const destinationArchive = path.join(temporary, "fresh.zip");
  const destinationManifest = path.join(temporary, "fresh-manifest.json");
  await writeFile(sourceArchive, "archive");
  await writeFile(sourceManifest, "manifest");
  assert.equal(await assertFreshOutputSet([destinationArchive, destinationManifest]), true);
  assert.equal(await publishFreshSetAtomic([
    { source: sourceArchive, destination: destinationArchive },
    { source: sourceManifest, destination: destinationManifest },
  ]), true);
  await assert.rejects(() => assertFreshOutputSet([destinationArchive]), /already exists/);
});

test("the audit CLI runs as a separate process and emits a fresh report with its own hash", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qh-phase6-independent-audit-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const artifacts = fixtureArtifacts();
  const archive = path.join(temporary, REQUIRED_ARCHIVE_FILENAME);
  const manifest = path.join(temporary, "phase-6-global-hardening-human-review-manifest.json");
  const audit = path.join(temporary, "phase-6-global-hardening-human-review-audit.json");
  await writeFile(archive, artifacts.archiveBytes);
  await writeFile(manifest, artifacts.detachedBytes);
  const { stdout } = await execFileAsync(process.execPath, [
    AUDITOR,
    "--archive", archive,
    "--manifest", manifest,
    "--audit-output", audit,
    "--expected-head", EXPECTED.expectedHead,
    "--branch", EXPECTED.branch,
    "--deployment-id", EXPECTED.deploymentId,
    "--immutable-url", EXPECTED.immutableUrl,
    "--branch-url", EXPECTED.branchUrl,
    "--expected-parent-process-id", String(process.pid),
  ], { cwd: TEST_ROOT, encoding: "utf8", windowsHide: true });
  const result = JSON.parse(stdout);
  const auditBytes = await readFile(audit);
  const auditDocument = JSON.parse(auditBytes.toString("utf8"));
  assert.equal(result.schema, `${AUDIT_SCHEMA}.result`);
  assert.equal(result.status, "PASS");
  assert.equal(result.audit.sha256, sha256(auditBytes));
  assert.equal(auditDocument.auditor.separateProcess, true);
  assert.equal(auditDocument.auditor.parentProcessId, process.pid);
  assert.equal(auditDocument.archive.sha256, sha256(artifacts.archiveBytes));
  await assert.rejects(() => writeFile(audit, "replacement", { flag: "wx" }), /EEXIST/);
});

test("assembled Phase 6-R1 evidence packages to the exact closure filename and passes a separate-process R1 audit", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qh-phase6-r1-independent-audit-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const artifacts = fixtureR1Artifacts();
  const archive = path.join(temporary, R1_REQUIRED_ARCHIVE_FILENAME);
  const manifest = path.join(temporary, "phase-6-r1-validation-closure-human-review-manifest.json");
  const audit = path.join(temporary, "phase-6-r1-validation-closure-human-review-audit.json");
  await writeFile(archive, artifacts.archiveBytes);
  await writeFile(manifest, artifacts.detachedBytes);

  const { stdout } = await execFileAsync(process.execPath, [
    AUDITOR,
    "--authority-profile", "phase6-r1",
    "--archive", archive,
    "--manifest", manifest,
    "--audit-output", audit,
    "--expected-head", R1_EXPECTED.expectedHead,
    "--branch", R1_EXPECTED.branch,
    "--deployment-id", R1_EXPECTED.deploymentId,
    "--immutable-url", R1_EXPECTED.immutableUrl,
    "--branch-url", R1_EXPECTED.branchUrl,
    "--expected-parent-process-id", String(process.pid),
  ], { cwd: TEST_ROOT, encoding: "utf8", windowsHide: true });

  const result = JSON.parse(stdout);
  const auditBytes = await readFile(audit);
  const auditDocument = JSON.parse(auditBytes.toString("utf8"));
  assert.equal(path.basename(archive), "phase-6-r1-validation-closure-human-review.zip");
  assert.equal(result.schema, `${R1_AUDIT_SCHEMA}.result`);
  assert.equal(result.status, "PASS");
  assert.equal(result.audit.sha256, sha256(auditBytes));
  assert.equal(auditDocument.schema, R1_AUDIT_SCHEMA);
  assert.equal(auditDocument.auditor.separateProcess, true);
  assert.equal(auditDocument.auditor.parentProcessId, process.pid);
  assert.equal(auditDocument.archive.filename, R1_REQUIRED_ARCHIVE_FILENAME);
  assert.equal(auditDocument.archive.sha256, sha256(artifacts.archiveBytes));
  assert.equal(auditDocument.detachedManifest.schema, `${R1_PACKAGE_SCHEMA}.detached-manifest`);
  assert.equal(auditDocument.inArchiveManifest.schema, R1_PACKAGE_SCHEMA);
  assert.equal(auditDocument.deploymentVerification.schema, R1_DEPLOYMENT_VERIFICATION_SCHEMA);
  assert.equal(auditDocument.provenance.authorityProfile, "phase6-r1");
  assert.equal(auditDocument.provenance.exactParent, R1_REQUIRED_PARENT);
  assert.equal(auditDocument.checks.exactBranchParentAndFrozenMain, "PASS");
  assert.equal("exactBranchBaseAndFrozenMain" in auditDocument.checks, false);
});
