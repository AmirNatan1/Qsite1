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
} from "../scripts/package-phase6-human-review.mjs";
import {
  AUDIT_SCHEMA,
  auditBuffers,
  parseArguments as parseAuditArguments,
  parseStoredZip,
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

function fixtureArtifacts(options = {}) {
  return buildPackageArtifacts({
    payloadEntries: fixturePayloadEntries(),
    provenance: PROVENANCE,
    outputFilename: REQUIRED_ARCHIVE_FILENAME,
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
