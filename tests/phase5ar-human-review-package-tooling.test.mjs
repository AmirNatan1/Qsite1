import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ACCEPTED_PHASE5A_SHA,
  ARCHIVE_FILENAME,
  AUDIT_FILENAME,
  AUTHORIZATION,
  DETACHED_MANIFEST_FILENAME,
  HUMAN_REVIEW_GATES,
  REQUIRED_BRANCH,
  ROOT,
  assertAllowedEntry,
  assertExternalPath,
  assertFreshOutputSet,
  assertNoPrivateText,
  buildArtifactRoles,
  createStoredZipBuffer,
  publishFreshSetAtomic,
  validateArtifactRoles,
  validateReviewPolicy,
} from "../scripts/package-phase5ar-human-review.mjs";
import {
  assertNoPrivateText as independentlyAssertNoPrivateText,
  parseStoredZip,
  validateArtifactRoles as independentlyValidateArtifactRoles,
  validateReviewPolicy as independentlyValidateReviewPolicy,
} from "../scripts/audit-phase5ar-human-review.mjs";

const execFileAsync = promisify(execFile);
const TEST_FILE = fileURLToPath(import.meta.url);
const PACKAGE_SCRIPT = path.join(ROOT, "scripts", "package-phase5ar-human-review.mjs");
const AUDIT_SCRIPT = path.join(ROOT, "scripts", "audit-phase5ar-human-review.mjs");

function rolePaths(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => rolePaths(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => rolePaths(item, output));
  return output;
}

test("exact Phase 5A-R archive names and governance constants are frozen", () => {
  assert.equal(ARCHIVE_FILENAME, "phase-5a-r-manifesto-route-identity-repair-human-review.zip");
  assert.equal(DETACHED_MANIFEST_FILENAME, "phase-5a-r-manifesto-route-identity-repair-human-review-manifest.json");
  assert.equal(AUDIT_FILENAME, "phase-5a-r-manifesto-route-identity-repair-human-review-audit.json");
  assert.equal(REQUIRED_BRANCH, "codex/phase-5a-r-manifesto-route-identity-repair");
  assert.equal(ACCEPTED_PHASE5A_SHA, "799ee284355f161e06404919d5022cd051165bf5");
  assert.equal(Object.keys(HUMAN_REVIEW_GATES).length, 7);
  assert.ok(Object.values(HUMAN_REVIEW_GATES).every((value) => value === "PENDING HUMAN REVIEW"));
  assert.ok(Object.values(AUTHORIZATION).every((value) => value === false));
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
});

test("independent parser rejects tampered ZIP payload bytes", () => {
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

test("exact artifact-role contract binds 13 homepage, 76 route, and 6 authority files", () => {
  const roles = buildArtifactRoles();
  const paths = rolePaths(roles);
  assert.equal(paths.length, 95);
  assert.equal(new Set(paths).size, 95);
  assert.equal(paths.filter((item) => item.startsWith("homepage-manifesto/")).length, 13);
  assert.equal(paths.filter((item) => item.startsWith("supporting-routes/")).length, 76);
  assert.equal(paths.filter((item) => item.startsWith("review-authorities/")).length, 6);
  assert.equal(validateArtifactRoles(roles, paths), true);
  assert.equal(independentlyValidateArtifactRoles(roles, paths), true);
  assert.throws(() => validateArtifactRoles(roles, paths.slice(1)), /absent/);
  assert.throws(() => independentlyValidateArtifactRoles({ ...roles, homepage: { ...roles.homepage, forwardRecording: "homepage-manifesto/recordings/not-real.mp4" } }, paths), /differ/);
});

test("privacy scan rejects private host paths and credential-like strings", () => {
  for (const scan of [assertNoPrivateText, independentlyAssertNoPrivateText]) {
    assert.equal(scan(Buffer.from("public review copy"), "README.md"), true);
    assert.throws(() => scan(Buffer.from("C:\\Users\\reviewer\\private"), "README.md"), /privacy/);
    assert.throws(() => scan(Buffer.from("github_pat_abcdefghijklmnopqrstuvwxyz123456"), "README.md"), /privacy/);
    assert.throws(() => scan(Buffer.from('{"access_token":"abcdefghijklmnop123456"}'), "review-authorities/git-deployment/report.json"), /privacy/);
    assert.equal(scan(Buffer.from([0x5c, 0x5c, 0x66, 0x51, 0xe3, 0xda, 0x08, 0x56, 0x5c, 0x46, 0xbb]), "homepage-manifesto/recordings/01-forward-manifesto.mp4"), true);
    assert.throws(() => scan(Buffer.alloc(0), "C:\\Users\\reviewer\\01-forward-manifesto.mp4"), /privacy/);
  }
});

test("archive surface forbids nested archives, source trees, raw frames, and traversal", () => {
  assert.equal(assertAllowedEntry("homepage-manifesto/recordings/01-forward-manifesto.mp4"), true);
  assert.throws(() => assertAllowedEntry("supporting-routes/raw/frame-001.png"), /forbidden/);
  assert.throws(() => assertAllowedEntry("supporting-routes/routes/archive.zip"), /forbidden/);
  assert.throws(() => assertAllowedEntry("../outside.md"), /unsafe|relative/);
  assert.throws(() => assertAllowedEntry("prototype/render-route.mjs"), /outside/);
});

test("durable external output policy rejects repository and OS-temp destinations", () => {
  assert.throws(() => assertExternalPath(path.join(ROOT, ARCHIVE_FILENAME)), /outside/);
  assert.throws(() => assertExternalPath(path.join(os.tmpdir(), ARCHIVE_FILENAME)), /outside/);
  const durableFuture = path.join(path.dirname(ROOT), "phase5ar-review-future", ARCHIVE_FILENAME);
  assert.equal(assertExternalPath(durableFuture), path.resolve(durableFuture));
});

test("fresh-output check refuses overwrite", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase5ar-fresh-test-"));
  try {
    const fresh = path.join(temporary, "fresh.zip");
    assert.equal(await assertFreshOutputSet([fresh]), true);
    await writeFile(fresh, "existing", { flag: "wx" });
    await assert.rejects(() => assertFreshOutputSet([fresh]), /already exists/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("atomic publication leaves no partial destination set after a rename failure", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase5ar-atomic-test-"));
  try {
    const sourceOne = path.join(temporary, "one.staged");
    const missingSource = path.join(temporary, "missing.staged");
    const destinationOne = path.join(temporary, "one.final");
    const destinationTwo = path.join(temporary, "two.final");
    await writeFile(sourceOne, "one", { flag: "wx" });
    await assert.rejects(() => publishFreshSetAtomic([
      { source: sourceOne, destination: destinationOne },
      { source: missingSource, destination: destinationTwo },
    ]));
    await assert.rejects(() => readFile(destinationOne), { code: "ENOENT" });
    await assert.rejects(() => readFile(destinationTwo), { code: "ENOENT" });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("machine PASS cannot self-approve any gate or authorize Phase 5B", () => {
  const valid = {
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
    policy: { phase5B: "UNAUTHORIZED", pendingGateCount: 7, authorMaySelfApprove: false, deployerMaySelfApprove: false, machinePassGrantsHumanAcceptance: false },
  };
  assert.equal(validateReviewPolicy(valid), true);
  assert.equal(independentlyValidateReviewPolicy(valid), true);
  assert.throws(() => validateReviewPolicy({ ...valid, authorization: { ...AUTHORIZATION, humanAccepted: true } }), /self-approval|authorization/);
  assert.throws(() => independentlyValidateReviewPolicy({ ...valid, humanReviewGates: { ...HUMAN_REVIEW_GATES, "MANIFESTO THRESHOLD": "ACCEPT" } }), /pending gates/);
  assert.throws(() => validateReviewPolicy({ ...valid, policy: { ...valid.policy, phase5B: "AUTHORIZED" } }), /unauthorized/i);
});

test("package and auditor imports are side-effect free", async () => {
  for (const script of [PACKAGE_SCRIPT, AUDIT_SCRIPT]) {
    const { stdout, stderr } = await execFileAsync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(pathToFileURL(script).href)});`], { cwd: ROOT, encoding: "utf8" });
    assert.equal(stdout, "");
    assert.equal(stderr, "");
  }
});

test("tooling sources carry the focused Phase 5A-R contract", async () => {
  const [packager, auditor] = await Promise.all([readFile(PACKAGE_SCRIPT, "utf8"), readFile(AUDIT_SCRIPT, "utf8")]);
  for (const source of [packager, auditor]) {
    assert.match(source, /phase-5a-r-manifesto-route-identity-repair-human-review\.zip/);
    assert.match(source, /PENDING HUMAN REVIEW/);
    assert.match(source, /phase5BAuthorized/);
    assert.match(source, /799ee284355f161e06404919d5022cd051165bf5/);
    assert.match(source, /501040c42bba30b9d9517b88a8f9857992a2dba4/);
  }
  assert.match(packager, /publishFreshSetAtomic/);
  assert.match(auditor, /function rebuildStoredZip/);
  assert.match(auditor, /export function parseStoredZip/);
  assert.doesNotMatch(auditor, /from\s+["']\.\/package-phase5ar-human-review/);
  assert.equal(path.basename(TEST_FILE), "phase5ar-human-review-package-tooling.test.mjs");
});
