import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ACCEPTED_PHASE5AR_SHA,
  ARCHIVE_FILENAME,
  AUDIT_FILENAME,
  AUTHORIZATION,
  CHECKPOINT_SUBJECTS,
  CP7_HEAD,
  CP7_REPORT_GIT_HEAD,
  CP7_REPORT_SHA256,
  DEFAULT_PROFILE,
  DETACHED_MANIFEST_FILENAME,
  FIXED_CHECKPOINT_SHAS,
  HUMAN_REVIEW_GATES,
  MAX_ARCHIVE_BYTES,
  MOTION_ROUTE_IDS,
  PACKAGE_SCHEMA,
  R1_ARCHIVE_FILENAME,
  R1_AUDIT_FILENAME,
  R1_CHECKPOINT_SUBJECTS,
  R1_COMMIT_SUBJECT,
  R1_DETACHED_MANIFEST_FILENAME,
  R1_FIXED_CHECKPOINT_SHAS,
  R1_PACKAGE_SCHEMA,
  R1_PARENT_SHA,
  R1_PRODUCTION_DELTA,
  R1_PROFILE,
  R1_REQUIRED_BRANCH,
  R1_REQUIRED_BRANCH_URL,
  REQUIRED_BRANCH,
  REQUIRED_BRANCH_URL,
  ROOT,
  ROUTE_ORDER,
  assertAllowedEntry,
  assertExternalPath,
  assertFreshOutputSet,
  assertNoPrivateText,
  buildArtifactRoles,
  createStoredZipBuffer,
  evidenceToArchivePath,
  expectedEvidenceArtifactPaths,
  expectedEvidencePaths,
  expectedPackagePayloadPaths,
  parseArguments,
  publishFreshSetAtomic,
  reviewProfile,
  validateArtifactRoles,
  validateOptionShape,
  validateReviewPolicy,
} from "../scripts/package-phase5b-human-review.mjs";
import {
  ARCHIVE_FILENAME as AUDITOR_ARCHIVE_FILENAME,
  AUDIT_FILENAME as AUDITOR_AUDIT_FILENAME,
  CP7_REPORT_GIT_HEAD as AUDIT_CP7_REPORT_GIT_HEAD,
  CP7_REPORT_SHA256 as AUDIT_CP7_REPORT_SHA256,
  DEFAULT_PROFILE as AUDITOR_DEFAULT_PROFILE,
  DETACHED_MANIFEST_FILENAME as AUDITOR_DETACHED_MANIFEST_FILENAME,
  PACKAGE_SCHEMA as AUDITOR_PACKAGE_SCHEMA,
  R1_ARCHIVE_FILENAME as AUDITOR_R1_ARCHIVE_FILENAME,
  R1_AUDIT_FILENAME as AUDITOR_R1_AUDIT_FILENAME,
  R1_CHECKPOINT_SUBJECTS as AUDITOR_R1_CHECKPOINT_SUBJECTS,
  R1_COMMIT_SUBJECT as AUDITOR_R1_COMMIT_SUBJECT,
  R1_DETACHED_MANIFEST_FILENAME as AUDITOR_R1_DETACHED_MANIFEST_FILENAME,
  R1_FIXED_CHECKPOINT_SHAS as AUDITOR_R1_FIXED_CHECKPOINT_SHAS,
  R1_PACKAGE_SCHEMA as AUDITOR_R1_PACKAGE_SCHEMA,
  R1_PARENT_SHA as AUDITOR_R1_PARENT_SHA,
  R1_PRODUCTION_DELTA as AUDITOR_R1_PRODUCTION_DELTA,
  R1_PROFILE as AUDITOR_R1_PROFILE,
  R1_REQUIRED_BRANCH as AUDITOR_R1_REQUIRED_BRANCH,
  R1_REQUIRED_BRANCH_URL as AUDITOR_R1_REQUIRED_BRANCH_URL,
  assertNoPrivateText as independentlyAssertNoPrivateText,
  parseArguments as parseAuditArguments,
  parseStoredZip,
  reviewProfile as independentlyReviewProfile,
  validateArtifactRoles as independentlyValidateArtifactRoles,
  validateReviewPolicy as independentlyValidateReviewPolicy,
} from "../scripts/audit-phase5b-human-review-package.mjs";

const execFileAsync = promisify(execFile);
const TEST_FILE = fileURLToPath(import.meta.url);
const PACKAGE_SCRIPT = path.join(ROOT, "scripts", "package-phase5b-human-review.mjs");
const AUDIT_SCRIPT = path.join(ROOT, "scripts", "audit-phase5b-human-review-package.mjs");
const OBSERVED_R1_BRANCH_URL = "https://repair-phase-5b-r1-about-dar.qsite1.pages.dev/";

function rolePaths(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => rolePaths(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => rolePaths(item, output));
  return output;
}

test("exact Phase 5B archive names, branch, gate, and authorization contracts are frozen", () => {
  assert.equal(DEFAULT_PROFILE, "cp9");
  assert.equal(PACKAGE_SCHEMA, "quantum-hub.phase-5b.supporting-route-production-human-review.v1");
  assert.equal(ARCHIVE_FILENAME, "phase-5b-supporting-route-production-human-review.zip");
  assert.equal(DETACHED_MANIFEST_FILENAME, "phase-5b-supporting-route-production-human-review-manifest.json");
  assert.equal(AUDIT_FILENAME, "phase-5b-supporting-route-production-human-review-audit.json");
  assert.equal(REQUIRED_BRANCH, "feature/phase-5b-supporting-route-production");
  assert.equal(REQUIRED_BRANCH_URL, "https://feature-phase-5b-supporting.qsite1.pages.dev/");
  assert.equal(ACCEPTED_PHASE5AR_SHA, "b6a9d4f6e05412dfd460a657edfd8be4ce7eef2c");
  assert.equal(CP7_HEAD, "9a9ad82b266c663e5689c8a6884a90cfc835ef7c");
  assert.equal(CP7_REPORT_GIT_HEAD, "508d54a517b9c28ac683fb3257df3afad24b72bb");
  assert.equal(CP7_REPORT_SHA256, "e62b4d20b49170d729ce4dfb61e5f73f796eb55701678beeacce2ac600afe365");
  assert.equal(AUDITOR_DEFAULT_PROFILE, DEFAULT_PROFILE);
  assert.equal(AUDITOR_PACKAGE_SCHEMA, PACKAGE_SCHEMA);
  assert.equal(AUDITOR_ARCHIVE_FILENAME, ARCHIVE_FILENAME);
  assert.equal(AUDITOR_DETACHED_MANIFEST_FILENAME, DETACHED_MANIFEST_FILENAME);
  assert.equal(AUDITOR_AUDIT_FILENAME, AUDIT_FILENAME);
  assert.equal(AUDIT_CP7_REPORT_GIT_HEAD, CP7_REPORT_GIT_HEAD);
  assert.equal(AUDIT_CP7_REPORT_SHA256, CP7_REPORT_SHA256);
  assert.equal(MAX_ARCHIVE_BYTES, 50 * 1024 * 1024);
  assert.equal(Object.keys(HUMAN_REVIEW_GATES).length, 6);
  assert.ok(Object.values(HUMAN_REVIEW_GATES).every((value) => value === "PENDING HUMAN REVIEW"));
  assert.deepEqual(Object.keys(HUMAN_REVIEW_GATES), ["SUPPORTING-ROUTE PRODUCTION FIDELITY", "ROUTE-SPECIFIC SPATIAL IDENTITY", "RESPONSIVE + ACCESSIBLE INTEGRATION", "PUBLICATION + MEDIA SAFETY", "PERFORMANCE + RUNTIME SAFETY", "HOMEPAGE + PHASE 4/5A REGRESSION"]);
  assert.ok(Object.values(AUTHORIZATION).every((value) => value === false));
  assert.equal(AUTHORIZATION.phase6Authorized, false);
});

test("R1 profile independently freezes About-only repair authority without baking the final SHA", () => {
  assert.equal(R1_PROFILE, "r1");
  assert.equal(R1_PACKAGE_SCHEMA, "quantum-hub.phase-5b-r1.about-dark-v2-fidelity-human-review.v1");
  assert.equal(R1_ARCHIVE_FILENAME, "phase-5b-r1-about-dark-v2-fidelity-human-review.zip");
  assert.equal(R1_DETACHED_MANIFEST_FILENAME, "phase-5b-r1-about-dark-v2-fidelity-human-review-manifest.json");
  assert.equal(R1_AUDIT_FILENAME, "phase-5b-r1-about-dark-v2-fidelity-human-review-audit.json");
  assert.equal(R1_REQUIRED_BRANCH, "repair/phase-5b-r1-about-dark-v2-fidelity");
  assert.equal(R1_REQUIRED_BRANCH_URL, null);
  assert.equal(R1_PARENT_SHA, "011abd3e5fc7464d5a0133603d222110df13b820");
  assert.equal(R1_COMMIT_SUBJECT, "Repair Phase 5B About Dark V2 fidelity");
  assert.deepEqual(R1_PRODUCTION_DELTA, ["M\tsrc/styles/routes/about.css"]);
  assert.deepEqual(R1_CHECKPOINT_SUBJECTS.slice(0, -1), CHECKPOINT_SUBJECTS);
  assert.deepEqual(R1_FIXED_CHECKPOINT_SHAS.slice(0, -1), FIXED_CHECKPOINT_SHAS);
  assert.equal(R1_CHECKPOINT_SUBJECTS.length, 10);
  assert.equal(R1_FIXED_CHECKPOINT_SHAS.length, 9);
  assert.equal(R1_CHECKPOINT_SUBJECTS.at(-1), R1_COMMIT_SUBJECT);
  assert.equal(R1_FIXED_CHECKPOINT_SHAS.at(-1), R1_PARENT_SHA);

  assert.equal(AUDITOR_R1_PROFILE, R1_PROFILE);
  assert.equal(AUDITOR_R1_PACKAGE_SCHEMA, R1_PACKAGE_SCHEMA);
  assert.equal(AUDITOR_R1_ARCHIVE_FILENAME, R1_ARCHIVE_FILENAME);
  assert.equal(AUDITOR_R1_DETACHED_MANIFEST_FILENAME, R1_DETACHED_MANIFEST_FILENAME);
  assert.equal(AUDITOR_R1_AUDIT_FILENAME, R1_AUDIT_FILENAME);
  assert.equal(AUDITOR_R1_REQUIRED_BRANCH, R1_REQUIRED_BRANCH);
  assert.equal(AUDITOR_R1_REQUIRED_BRANCH_URL, R1_REQUIRED_BRANCH_URL);
  assert.equal(AUDITOR_R1_PARENT_SHA, R1_PARENT_SHA);
  assert.equal(AUDITOR_R1_COMMIT_SUBJECT, R1_COMMIT_SUBJECT);
  assert.deepEqual(AUDITOR_R1_PRODUCTION_DELTA, R1_PRODUCTION_DELTA);
  assert.deepEqual(AUDITOR_R1_CHECKPOINT_SUBJECTS, R1_CHECKPOINT_SUBJECTS);
  assert.deepEqual(AUDITOR_R1_FIXED_CHECKPOINT_SHAS, R1_FIXED_CHECKPOINT_SHAS);

  assert.equal(reviewProfile().id, "cp9");
  assert.equal(independentlyReviewProfile().id, "cp9");
  assert.deepEqual(reviewProfile("r1"), independentlyReviewProfile("r1"));
  assert.equal(reviewProfile("r1").fixedCheckpointShas.length, reviewProfile("r1").checkpointSubjects.length - 1);
  assert.throws(() => reviewProfile("future"), /profile/);
  assert.throws(() => independentlyReviewProfile("future"), /profile/);
});

test("deployed capture topology is exactly 127 files with 126 ledger artifacts", () => {
  const artifacts = expectedEvidenceArtifactPaths();
  const files = expectedEvidencePaths();
  assert.equal(artifacts.length, 126);
  assert.equal(files.length, 127);
  assert.equal(new Set(files).size, files.length);
  assert.equal(files.filter((item) => item === "capture-report.json").length, 1);
  assert.equal(artifacts.filter((item) => item.startsWith("cross-route/")).length, 5);
  assert.equal(artifacts.filter((item) => item.startsWith("routes/")).length, 115);
  assert.equal(artifacts.filter((item) => item.startsWith("homepage/")).length, 6);
  assert.equal(MOTION_ROUTE_IDS.length, 7);
  assert.equal(artifacts.filter((item) => item.endsWith("/route-recording.mp4")).length, 7);
  assert.ok(!artifacts.includes("routes/contact/route-recording.mp4"));
  assert.ok(!artifacts.includes("routes/404/route-recording.mp4"));
});

test("package topology is exact and keeps the four review surfaces", () => {
  const payloads = expectedPackagePayloadPaths();
  assert.equal(payloads.length, 157);
  assert.equal(new Set(payloads).size, payloads.length);
  assert.equal(payloads.filter((item) => item.startsWith("cross-route/")).length, 5);
  assert.equal(payloads.filter((item) => item.startsWith("per-route/")).length, 133);
  assert.equal(payloads.filter((item) => item.startsWith("homepage-regression/")).length, 6);
  assert.equal(payloads.filter((item) => item.startsWith("reports/")).length, 13);
  assert.equal(payloads.filter((item) => /\.(?:png|jpe?g|webp)$/i.test(item)).length, 90);
  assert.equal(payloads.filter((item) => item.endsWith(".mp4")).length, 8);
  for (const id of ROUTE_ORDER) {
    assert.ok(payloads.includes(`per-route/${id}/desktop-storyboard--1440x900.png`));
    assert.ok(payloads.includes(`per-route/${id}/route-brief-delta.md`));
  }
  assert.equal(evidenceToArchivePath("routes/proof/production-comparison.png"), "per-route/proof/production-comparison.png");
  assert.equal(evidenceToArchivePath("homepage/q.png"), "homepage-regression/q.png");
});

test("artifact roles exhaustively bind every non-manifest package path", () => {
  const roles = buildArtifactRoles();
  const paths = rolePaths(roles);
  assert.equal(paths.length, 158);
  assert.equal(new Set(paths).size, 158);
  assert.equal(validateArtifactRoles(roles, [...expectedPackagePayloadPaths(), "README.md"]), true);
  assert.equal(independentlyValidateArtifactRoles(roles, [...expectedPackagePayloadPaths(), "README.md"]), true);
  assert.throws(() => validateArtifactRoles(roles, paths.slice(1)), /differs/);
  assert.throws(() => independentlyValidateArtifactRoles({ ...roles, readme: "reports/not-readme.md" }, paths), /differs/);
});

test("canonical stored ZIP is deterministic and independently parsed", () => {
  const entries = [
    { path: "README.md", data: Buffer.from("review guide\n") },
    { path: "MANIFEST.json", data: Buffer.from('{"schema":"fixture"}\n') },
  ];
  const forward = createStoredZipBuffer(entries);
  const reverse = createStoredZipBuffer([...entries].reverse());
  assert.ok(forward.equals(reverse));
  const parsed = parseStoredZip(forward);
  assert.deepEqual([...parsed.entries.keys()], ["MANIFEST.json", "README.md"]);
  assert.equal(parsed.entries.get("README.md").toString("utf8"), "review guide\n");
  assert.equal(parsed.canonical, true);
  assert.equal(parsed.crcValidated, true);
});

test("canonical parser permits ZIP-signature bytes inside an ordinary payload", () => {
  const payload = Buffer.from([0x72, 0x65, 0x76, 0x69, 0x65, 0x77, 0x20, 0x50, 0x4b, 0x05, 0x06, 0x0a]);
  const archive = createStoredZipBuffer([
    { path: "README.md", data: payload },
    { path: "MANIFEST.json", data: Buffer.from("{}\n") },
  ]);
  assert.ok(parseStoredZip(archive).entries.get("README.md").equals(payload));
});

test("independent ZIP parser rejects payload tampering", () => {
  const archive = createStoredZipBuffer([
    { path: "README.md", data: Buffer.from("review guide\n") },
    { path: "MANIFEST.json", data: Buffer.from('{"schema":"fixture"}\n') },
  ]);
  const tampered = Buffer.from(archive);
  const offset = tampered.indexOf(Buffer.from("review guide"));
  assert.ok(offset > 0);
  tampered[offset] ^= 0x01;
  assert.throws(() => parseStoredZip(tampered), /CRC rejection/);
});

test("archive surface rejects raw frames, assets, source, prototypes, Blender, history, and nested archives", () => {
  assert.equal(assertAllowedEntry("cross-route/all-route-desktop.png"), true);
  assert.equal(assertAllowedEntry("per-route/maradin/route-recording.mp4"), true);
  assert.equal(assertAllowedEntry("homepage-regression/q.png"), true);
  assert.equal(assertAllowedEntry("reports/git-provenance.json"), true);
  for (const invalid of [
    "per-route/proof/raw/frame-001.png",
    "per-route/proof/assets/poster.png",
    "reports/source/component.astro",
    "prototypes/route.html",
    "reports/blender/scene.blend",
    "reports/history/git-log.txt",
    "reports/review.zip",
    "../outside.md",
  ]) assert.throws(() => assertAllowedEntry(invalid), /forbidden|outside|unsafe|relative/);
});

test("packager and independent auditor reject private paths and credential-like text", () => {
  for (const scan of [assertNoPrivateText, independentlyAssertNoPrivateText]) {
    assert.equal(scan(Buffer.from("public review copy"), "README.md"), true);
    assert.throws(() => scan(Buffer.from("C:\\Users\\reviewer\\private"), "README.md"), /privacy/);
    assert.throws(() => scan(Buffer.from("/home/reviewer/private/report.json"), "README.md"), /privacy/);
    assert.throws(() => scan(Buffer.from("github_pat_abcdefghijklmnopqrstuvwxyz123456"), "README.md"), /privacy/);
    assert.throws(() => scan(Buffer.from('{"access_token":"abcdefghijklmnop123456"}'), "reports/deployment-verification.json"), /privacy/);
    assert.equal(scan(Buffer.from([0x43, 0x3a, 0x5c, 0x55, 0x73, 0x65, 0x72, 0x73]), "per-route/proof/route-recording.mp4"), true);
  }
});

test("machine PASS cannot approve a gate or authorize Phase 6", () => {
  const valid = { humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION, policy: { phase6: "UNAUTHORIZED", pendingGateCount: 6, machinePassGrantsHumanAcceptance: false } };
  assert.equal(validateReviewPolicy(valid), true);
  assert.equal(independentlyValidateReviewPolicy(valid), true);
  assert.throws(() => validateReviewPolicy({ ...valid, authorization: { ...AUTHORIZATION, humanAccepted: true } }), /authorization/);
  assert.throws(() => independentlyValidateReviewPolicy({ ...valid, humanReviewGates: { ...HUMAN_REVIEW_GATES, "PUBLICATION + MEDIA SAFETY": "ACCEPT" } }), /pending/);
  assert.throws(() => validateReviewPolicy({ ...valid, policy: { ...valid.policy, phase6: "AUTHORIZED" } }), /Phase 6/);
});

test("CLI parses aliases and enforces exact output/deployment authority", () => {
  const sha = "a".repeat(40);
  const output = path.join(path.dirname(ROOT), "phase5b-review-future", ARCHIVE_FILENAME);
  const parsed = parseArguments([
    "--evidence-root", "../evidence",
    "--storyboard-root", "../storyboards",
    "--deployment-report", "../deployment.json",
    "--cp7-report", "../cp7.json",
    "--cp8-report", "../cp8.json",
    "--expected-head", sha,
    "--expected-deployment-id", "12345678-1234-4234-8234-123456789abc",
    "--immutable-url", "https://12345678.qsite1.pages.dev/",
    "--branch-url", REQUIRED_BRANCH_URL,
    "--ffprobe", process.execPath,
    "--output", output,
  ]);
  const validated = validateOptionShape(parsed);
  assert.equal(validated.expectedUpstream, sha);
  assert.equal(validated.output, path.resolve(output));
  assert.throws(() => validateOptionShape({ ...parsed, output: path.join(path.dirname(output), "wrong.zip") }), /basename/);
  assert.throws(() => validateOptionShape({ ...parsed, immutableUrl: "http://127.0.0.1/" }), /HTTPS|Pages/);
});

test("R1 CLI selects exact sibling names, repair branch, and dynamic repair HEAD", () => {
  const sha = "b".repeat(40);
  const output = path.join(path.dirname(ROOT), "phase5b-r1-review-future", R1_ARCHIVE_FILENAME);
  const parsed = parseArguments([
    "--profile", "r1",
    "--evidence-root", "../evidence",
    "--storyboard-root", "../storyboards",
    "--deployment-report", "../deployment.json",
    "--cp7-report", "../cp7.json",
    "--cp8-report", "../cp8.json",
    "--expected-head", sha,
    "--expected-deployment-id", "87654321-1234-4234-8234-123456789abc",
    "--immutable-url", "https://87654321.qsite1.pages.dev/",
    "--branch-url", OBSERVED_R1_BRANCH_URL,
    "--ffprobe", process.execPath,
    "--output", output,
  ]);
  const validated = validateOptionShape(parsed);
  assert.equal(validated.profile, R1_PROFILE);
  assert.equal(validated.expectedBranch, R1_REQUIRED_BRANCH);
  assert.equal(validated.expectedHead, sha);
  assert.equal(validated.expectedUpstream, sha);
  assert.equal(validated.output, path.resolve(output));
  assert.equal(path.basename(validated.output), R1_ARCHIVE_FILENAME);

  const auditParsed = parseAuditArguments(["--profile", "r1", "--self-test"]);
  assert.equal(auditParsed.profile, R1_PROFILE);
  assert.equal(auditParsed.expectedBranch, R1_REQUIRED_BRANCH);
  assert.equal(auditParsed.selfTest, true);

  assert.throws(() => validateOptionShape({ ...parsed, expectedHead: R1_PARENT_SHA, expectedUpstream: R1_PARENT_SHA }), /new R1 repair commit/);
  assert.throws(() => validateOptionShape({ ...parsed, branchUrl: REQUIRED_BRANCH_URL }), /branch-url/);
  assert.throws(() => validateOptionShape({ ...parsed, expectedBranch: REQUIRED_BRANCH }), /expected-branch/);
  assert.throws(() => validateOptionShape({ ...parsed, output: path.join(path.dirname(output), ARCHIVE_FILENAME) }), /basename/);
  assert.throws(() => parseArguments(["--profile", "future", "--self-test"]), /profile/);
  assert.throws(() => parseAuditArguments(["--profile", "future", "--self-test"]), /profile/);
});

test("durable output policy rejects repository, OS-temp, and drive-root destinations", () => {
  assert.throws(() => assertExternalPath(path.join(ROOT, ARCHIVE_FILENAME)), /outside/);
  assert.throws(() => assertExternalPath(path.join(os.tmpdir(), ARCHIVE_FILENAME)), /outside/);
  assert.throws(() => assertExternalPath(path.parse(ROOT).root), /drive root|outside/);
  const durable = path.join(path.dirname(ROOT), "phase5b-review-future", ARCHIVE_FILENAME);
  assert.equal(assertExternalPath(durable), path.resolve(durable));
});

test("fresh-output and atomic publication refuse overwrite and roll back partial destinations", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase5b-package-test-"));
  try {
    const existing = path.join(temporary, "existing.zip");
    assert.equal(await assertFreshOutputSet([existing]), true);
    await writeFile(existing, "existing", { flag: "wx" });
    await assert.rejects(() => assertFreshOutputSet([existing]), /already exists/);

    const sourceOne = path.join(temporary, "one.staged");
    const missing = path.join(temporary, "missing.staged");
    const destinationOne = path.join(temporary, "one.final");
    const destinationTwo = path.join(temporary, "two.final");
    await writeFile(sourceOne, "one", { flag: "wx" });
    await assert.rejects(() => publishFreshSetAtomic([{ source: sourceOne, destination: destinationOne }, { source: missing, destination: destinationTwo }]));
    await assert.rejects(() => readFile(destinationOne), { code: "ENOENT" });
    await assert.rejects(() => readFile(destinationTwo), { code: "ENOENT" });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("packager and auditor imports are side-effect free", async () => {
  for (const script of [PACKAGE_SCRIPT, AUDIT_SCRIPT]) {
    const { stdout, stderr } = await execFileAsync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(pathToFileURL(script).href)});`], { cwd: ROOT, encoding: "utf8" });
    assert.equal(stdout, "");
    assert.equal(stderr, "");
  }
});

test("CP9 and R1 self-test/dry-run modes are write-free and pass in both tools", async () => {
  for (const script of [PACKAGE_SCRIPT, AUDIT_SCRIPT]) {
    for (const profile of [DEFAULT_PROFILE, R1_PROFILE]) {
      for (const mode of ["--self-test", "--dry-run"]) {
        const profileArgs = profile === R1_PROFILE ? ["--profile", profile] : [];
        const { stdout, stderr } = await execFileAsync(process.execPath, [script, ...profileArgs, mode], { cwd: ROOT, encoding: "utf8" });
        assert.equal(stderr, "");
        const result = JSON.parse(stdout);
        assert.equal(result.status, "PASS");
        assert.equal(result.schema.startsWith(profile === R1_PROFILE ? R1_PACKAGE_SCHEMA : PACKAGE_SCHEMA), true);
        assert.equal(result.profile, profile === R1_PROFILE ? R1_PROFILE : undefined);
        if (mode === "--dry-run") {
          assert.equal(result.writesPerformed, false);
          const namesExpected = script === PACKAGE_SCRIPT || profile === R1_PROFILE;
          assert.equal(result.archiveFilename, namesExpected ? (profile === R1_PROFILE ? R1_ARCHIVE_FILENAME : ARCHIVE_FILENAME) : undefined);
          assert.equal(result.detachedManifestFilename, namesExpected ? (profile === R1_PROFILE ? R1_DETACHED_MANIFEST_FILENAME : DETACHED_MANIFEST_FILENAME) : undefined);
          assert.equal(result.auditFilename, namesExpected ? (profile === R1_PROFILE ? R1_AUDIT_FILENAME : AUDIT_FILENAME) : undefined);
        }
      }
    }
  }
});

test("independent auditor does not import the packager and retains its own ZIP reconstruction", async () => {
  const [packager, auditor] = await Promise.all([readFile(PACKAGE_SCRIPT, "utf8"), readFile(AUDIT_SCRIPT, "utf8")]);
  const packagerCp7 = packager.match(/function validateCp7\(item\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  const auditorCp7 = auditor.match(/const cp7Bytes =[\s\S]*?const cp8Bytes =/)?.[0] ?? "";
  assert.doesNotMatch(auditor, /from\s+["']\.\/package-phase5b-human-review/);
  assert.match(auditor, /function rebuildStoredZip/);
  assert.match(auditor, /export function parseStoredZip/);
  for (const source of [packager, auditor]) {
    assert.match(source, /phase-5b-supporting-route-production-human-review\.zip/);
    assert.match(source, /phase-5b-r1-about-dark-v2-fidelity-human-review\.zip/);
    assert.match(source, /repair\/phase-5b-r1-about-dark-v2-fidelity/);
    assert.match(source, /Repair Phase 5B About Dark V2 fidelity/);
    assert.match(source, /011abd3e5fc7464d5a0133603d222110df13b820/);
    assert.match(source, /src\/styles\/routes\/about\.css/);
    assert.doesNotMatch(source, /R1_(?:FINAL|HEAD|DEPLOYMENT)(?:_SHA|_ID)?\s*=/);
    assert.match(source, /PENDING HUMAN REVIEW/);
    assert.match(source, /phase6Authorized/);
    assert.match(source, /50 \* 1024 \* 1024/);
    assert.match(source, /desktop-storyboard--1440x900\.png/);
  }
  assert.match(packagerCp7, /item\.document\.git\?\.head !== CP7_REPORT_GIT_HEAD/);
  assert.match(auditorCp7, /cp7\.git\?\.head !== CP7_REPORT_GIT_HEAD/);
  for (const source of [packagerCp7, auditorCp7]) {
    assert.match(source, /quantum-hub\.phase-5b\.responsive-accessibility\.v1/);
    assert.doesNotMatch(source, /expectedHead|observedHead/);
  }
  assert.match(packager, /publishFreshSetAtomic/);
  assert.match(packager, /# Quantum-Hub Phase 5B-R1 About Dark V2 fidelity — human review/);
  assert.match(packager, /## R1 review focus/);
  assert.match(packager, /"--profile", profile\.id/);
  assert.match(auditor, /function validateProfileBinding/);
  assert.match(auditor, /"show", "-s", "--format=%s", "HEAD"/);
  assert.match(auditor, /"diff", "--name-status", "--no-renames"/);
  assert.equal(path.basename(TEST_FILE), "phase5b-human-review-package-tooling.test.mjs");
});
