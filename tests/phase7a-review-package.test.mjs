import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  DETACHED_MANIFEST_NAME,
  CAPTURE_SOURCE_MAP,
  FIXED_EVIDENCE,
  INDEPENDENT_AUDIT_NAME,
  IN_ARCHIVE_MANIFEST,
  PACKAGE_SCHEMA,
  REPORT_SOURCE_MAP,
  RECORDING_PACKAGE_PATHS,
  ROOT,
  SCREENSHOT_PACKAGE_PATHS,
  ZOOM_SOURCE_MAP,
  assertAllowedEvidencePath,
  assertExternalPath,
  buildPackageArtifacts,
  createSelfTestEntries,
  createSelfTestProducerInputs,
  normalizeProducerInputs,
  normalizeEvidenceEntries,
  parseArguments,
  selfTest as packageSelfTest,
  sha256,
  stableJson,
} from "../scripts/package-phase7a-human-review.mjs";
import {
  AUDIT_SCHEMA,
  auditPackageBytes,
  parseStoredZip,
  selfTest as auditSelfTest,
} from "../scripts/audit-phase7a-human-review-package.mjs";
import {
  REVIEW_ZIP_NAME,
} from "../scripts/phase7a-contract.mjs";
import {
  HUMAN_GATE_RECORDS,
  RECORDING_SPECS,
} from "../scripts/phase7a-browser-contract.mjs";

const cloneEntries = (entries) => entries.map((entry) => ({ ...entry, data: Buffer.from(entry.data) }));

let fixtureEntries;
let artifacts;

test.before(async () => {
  fixtureEntries = await createSelfTestEntries();
  artifacts = buildPackageArtifacts(cloneEntries(fixtureEntries));
});

test("assembler freezes the exact Phase 7A review topology and deterministic authority names", () => {
  assert.equal(REVIEW_ZIP_NAME, "phase-7a-signal-field-threshold-human-review.zip");
  assert.equal(DETACHED_MANIFEST_NAME, "phase-7a-signal-field-threshold-human-review.manifest.json");
  assert.equal(INDEPENDENT_AUDIT_NAME, "phase-7a-signal-field-threshold-human-review.audit.json");
  assert.equal(RECORDING_PACKAGE_PATHS.length, 14);
  assert.equal(new Set(RECORDING_SPECS.map(({ scenario }) => scenario)).size, 7);
  assert.equal(new Set(RECORDING_SPECS.map(({ engine }) => engine)).size, 2);
  assert.equal(REPORT_SOURCE_MAP.length, 29);
  assert.equal(CAPTURE_SOURCE_MAP.length, 37);
  assert.equal(ZOOM_SOURCE_MAP.length, 13);
  assert.equal(SCREENSHOT_PACKAGE_PATHS.length, 32);
  assert.equal(artifacts.files.length, FIXED_EVIDENCE.length + RECORDING_PACKAGE_PATHS.length + SCREENSHOT_PACKAGE_PATHS.length);
  assert.equal(artifacts.packageManifest.schema, PACKAGE_SCHEMA);
  assert.deepEqual(artifacts.packageManifest.humanReviewGates, HUMAN_GATE_RECORDS);
  assert.ok(artifacts.packageManifest.humanReviewGates.every(({ status }) => status === "PENDING HUMAN REVIEW"));
  assert.equal(artifacts.detachedManifest.archive.filename, REVIEW_ZIP_NAME);
  assert.equal(artifacts.detachedManifest.archive.entryCount, artifacts.files.length + 1);
  assert.equal(artifacts.detachedManifest.embeddedManifest.relativePath, IN_ARCHIVE_MANIFEST);

  const repeated = buildPackageArtifacts(cloneEntries(fixtureEntries));
  assert.ok(repeated.archiveBytes.equals(artifacts.archiveBytes));
  assert.ok(repeated.detachedBytes.equals(artifacts.detachedBytes));
});

test("independent auditor validates canonical ordering, every CRC/SHA, detached binding and embedded authority", () => {
  const audit = auditPackageBytes({ archiveBytes: artifacts.archiveBytes, detachedBytes: artifacts.detachedBytes });
  assert.equal(audit.schema, AUDIT_SCHEMA);
  assert.equal(audit.status, "PASS");
  assert.equal(audit.crcResult, "PASS");
  assert.equal(audit.archive.entryCount, artifacts.files.length + 1);
  assert.equal(audit.archive.sha256, sha256(artifacts.archiveBytes));
  assert.equal(audit.detachedManifest.sha256, sha256(artifacts.detachedBytes));
  assert.ok(Object.values(audit.checks).every((status) => status === "PASS"));

  const parsed = parseStoredZip(artifacts.archiveBytes);
  assert.equal(parsed.crcValidated, true);
  assert.equal(parsed.deterministic, true);
  assert.ok(parsed.entries.has(IN_ARCHIVE_MANIFEST));
});

test("direct producer inputs normalize without modifying report, capture, zoom, brief, or deployment authorities", async () => {
  const inputs = await createSelfTestProducerInputs();
  const captureManifest = JSON.parse(inputs.captureFiles.get("evidence-manifest.json"));
  assert.equal(Object.hasOwn(captureManifest, "failures"), false);
  const before = new Map([...inputs.captureFiles].map(([name, bytes]) => [name, sha256(bytes)]));
  const normalized = normalizeProducerInputs(inputs);
  assert.equal(normalized.length, FIXED_EVIDENCE.length + RECORDING_PACKAGE_PATHS.length + SCREENSHOT_PACKAGE_PATHS.length);
  assert.equal(JSON.parse(normalized.find(({ relativePath }) => relativePath === "19-deployment/deployment-authority.json").data).status, "NOT AVAILABLE TO EXECUTION ENVIRONMENT");
  assert.deepEqual(new Map([...inputs.captureFiles].map(([name, bytes]) => [name, sha256(bytes)])), before);
  assert.throws(() => normalizeProducerInputs({ ...inputs, allowMissingDeployment: false }), /requires --deployment-json/i);

  const malformed = await createSelfTestProducerInputs();
  const malformedManifest = JSON.parse(malformed.captureFiles.get("evidence-manifest.json"));
  malformedManifest.failures = null;
  malformed.captureFiles.set("evidence-manifest.json", Buffer.from(stableJson(malformedManifest)));
  assert.throws(() => normalizeProducerInputs(malformed), /failures must be an array/i);
});

test("closed topology rejects missing authorities, unlisted payloads, nested archives, source archives and font binaries", () => {
  const missing = cloneEntries(fixtureEntries).filter(({ relativePath }) => relativePath !== "18-publication/publication-scan.json");
  assert.throws(() => buildPackageArtifacts(missing), /omits 18-publication\/publication-scan\.json/i);

  const noScreenshots = cloneEntries(fixtureEntries).filter(({ relativePath }) => !relativePath.startsWith("20-screenshots/"));
  assert.throws(() => buildPackageArtifacts(noScreenshots), /omits 20-screenshots/i);

  for (const forbidden of [
    "source/repository-source.zip",
    "20-screenshots/nested-review.zip",
    "20-screenshots/raw-traces/capture.png",
    "20-screenshots/unlicensed-font.woff2",
    "public/media/cinematic/phase-4r2/media/raw-opening.mp4",
    "cache/browser/state.json",
  ]) assert.throws(() => assertAllowedEvidencePath(forbidden), /forbidden|closed Phase 7A review topology|nested archive/i, forbidden);
});

test("assembler rejects private paths, credential-shaped text, altered licence bytes and false hash authorities", () => {
  const privatePath = cloneEntries(fixtureEntries);
  const provenance = privatePath.find(({ relativePath }) => relativePath === "01-provenance/git-provenance.json");
  provenance.data = Buffer.from(stableJson({ status: "PASS", checkout: "C:\\Users\\reviewer\\private\\Qsite1" }));
  assert.throws(() => normalizeEvidenceEntries(privatePath), /privacy\/credentials/i);

  const credential = cloneEntries(fixtureEntries);
  const deployment = credential.find(({ relativePath }) => relativePath === "19-deployment/deployment-authority.json");
  deployment.data = Buffer.from(stableJson({ status: "PASS", api_key: `sk-${"a".repeat(32)}` }));
  assert.throws(() => normalizeEvidenceEntries(credential), /privacy\/credentials/i);

  const licence = cloneEntries(fixtureEntries);
  licence.find(({ relativePath }) => relativePath === "06-fonts/licences/OFL-Anybody.txt").data[0] ^= 1;
  assert.throws(() => normalizeEvidenceEntries(licence), /font licence bytes differ/i);

  const phase4 = cloneEntries(fixtureEntries);
  const hashReport = phase4.find(({ relativePath }) => relativePath === "09-hashes/phase-4-hash-verification.json");
  const hashDocument = JSON.parse(hashReport.data.toString("utf8"));
  hashDocument.assets[0].sha256 = "0".repeat(64);
  hashReport.data = Buffer.from(stableJson(hashDocument));
  assert.throws(() => normalizeEvidenceEntries(phase4), /authority mismatch/i);
});

test("recordings are exact, ISO-BMFF-shaped, contract-validated and byte-bound to their inventory", () => {
  const missing = cloneEntries(fixtureEntries).filter(({ relativePath }) => relativePath !== RECORDING_PACKAGE_PATHS[0]);
  assert.throws(() => normalizeEvidenceEntries(missing), /omits 21-recordings/i);

  const malformed = cloneEntries(fixtureEntries);
  malformed.find(({ relativePath }) => relativePath === RECORDING_PACKAGE_PATHS[0]).data = Buffer.from("renamed raw bytes");
  assert.throws(() => normalizeEvidenceEntries(malformed), /recording is too small|ISO-BMFF/i);

  const drifted = cloneEntries(fixtureEntries);
  const recording = drifted.find(({ relativePath }) => relativePath === RECORDING_PACKAGE_PATHS[0]);
  recording.data = Buffer.concat([recording.data, Buffer.from([0])]);
  assert.throws(() => normalizeEvidenceEntries(drifted), /box header is truncated|hash\/byte binding differs/i);
});

test("independent audit rejects archive CRC tampering and detached SHA tampering", () => {
  const archiveTamper = Buffer.from(artifacts.archiveBytes);
  const firstNameLength = archiveTamper.readUInt16LE(26);
  archiveTamper[30 + firstNameLength] ^= 1;
  assert.throws(() => auditPackageBytes({ archiveBytes: archiveTamper, detachedBytes: artifacts.detachedBytes }), /CRC rejection|deterministic stored encoding/i);

  const detachedDocument = JSON.parse(artifacts.detachedBytes.toString("utf8"));
  detachedDocument.archive.sha256 = "0".repeat(64);
  const detachedTamper = Buffer.from(stableJson(detachedDocument));
  assert.throws(() => auditPackageBytes({ archiveBytes: artifacts.archiveBytes, detachedBytes: detachedTamper }), /detached manifest differs/i);
});

test("external intent stays explicit, outside repository and temp, fresh-by-contract, and Phase 6 paths are rejected", () => {
  const external = path.resolve(ROOT, "..", "phase-7a-review-external", REVIEW_ZIP_NAME);
  assert.equal(assertExternalPath(external, "fixture"), external);
  assert.throws(() => assertExternalPath("relative/review.zip"), /explicit absolute/i);
  assert.throws(() => assertExternalPath(path.join(ROOT, REVIEW_ZIP_NAME)), /outside the repository/i);
  assert.throws(() => assertExternalPath(path.resolve(ROOT, "..", "phase-6-review", REVIEW_ZIP_NAME)), /stale Phase 6/i);

  const parsed = parseArguments([
    "--reports-dir", external,
    "--capture-dir", external,
    "--installed-chrome-zoom", external,
    "--authoritative-brief", external,
    "--deployment-json", external,
    "--output", external,
  ]);
  assert.equal(parsed.reportsDir, external);
  assert.equal(parsed.captureDir, external);
  assert.equal(parsed.zoomDir, external);
  assert.equal(parsed.authoritativeBrief, external);
  assert.equal(parsed.deploymentJson, external);
  assert.equal(parsed.output, external);
  assert.throws(() => parseArguments(["--overwrite"]), /unknown option/i);
});

test("assembler and auditor self-tests pass without filesystem outputs", async () => {
  const packageResult = await packageSelfTest();
  const auditResult = auditSelfTest();
  assert.equal(packageResult.status, "PASS");
  assert.equal(packageResult.recordings, 14);
  assert.equal(auditResult.status, "PASS");
  assert.equal(auditResult.crcTamperRejected, true);
});

test("independent auditor does not import the assembler implementation", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "audit-phase7a-human-review-package.mjs"), "utf8");
  assert.doesNotMatch(source, /from\s+["']\.\/package-phase7a-human-review\.mjs["']/);
});
