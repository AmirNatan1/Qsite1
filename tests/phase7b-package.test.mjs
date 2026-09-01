import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  PHASE7B_BRANCH,
  PHASE7B_CORE_VIEWPORTS,
  PHASE7B_FROZEN_MAIN,
  PHASE7B_MACRO_STATES,
  PHASE7B_METHOD_STAGES,
  PHASE7B_PARENT,
  PHASE7B_PRODUCTION_PATHS,
  PHASE7B_RECORDING_SCENARIOS,
  PHASE7B_REVIEW_ZIP_NAME,
} from "../scripts/phase7b-contract.mjs";
import { PHYSICAL_ASSETS } from "../scripts/phase7a-contract.mjs";
import { crc32, createStoredZipBuffer, sha256, stableJson } from "../scripts/package-phase7a-human-review.mjs";
import {
  IN_ARCHIVE_MANIFEST,
  PHASE7B_COMMITS_SCHEMA,
  PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH,
  PHASE7B_GATE_RECORDS,
  PHASE7B_GATES_SCHEMA,
  PHASE7B_INSTALLED_CHROME_200_SCHEMA,
  PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH,
  PHASE7B_INSTALLED_CHROME_RECORDING_PATH,
  PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH,
  PHASE7B_MANIFEST_SCHEMA,
  PHASE7B_NATIVE_200_LIMITATION_SCHEMA,
  PHASE7B_PREPACKAGE_AUDIT_SCHEMA,
  PHASE7B_PROVENANCE_SCHEMA,
  PHASE7B_RECORDING_EVIDENCE_PATHS,
  PHASE7B_STANDARD_RECORDING_SCENARIOS,
  PHASE7B_STAGE_SPEC_SCHEMA,
  REQUIRED_PHASE7B_EVIDENCE,
  assertAllowedPhase7BEvidencePath,
  assertExternalPhase7BOutputPath,
  buildPhase7BReviewArtifacts,
  normalizePhase7BEvidenceEntries,
  packagePhase7BReviewDirectory,
  parseArguments as parsePackageArguments,
  runSelfTest as packageSelfTest,
  safePhase7BEvidencePath,
} from "../scripts/package-phase7b-human-review.mjs";
import {
  AUDIT_PHASE7B_RECORDING_EVIDENCE_PATHS,
  AUDIT_PHASE7B_STANDARD_RECORDING_SCENARIOS,
  AUDIT_REQUIRED_PHASE7B_EVIDENCE,
  PHASE7B_AUDIT_SCHEMA,
  assertAllowedPhase7BAuditPath,
  auditPhase7BPackageBytes,
  auditPhase7BPackageFile,
  parseArguments as parseAuditArguments,
  parsePhase7BStoredZip,
  runSelfTest as auditSelfTest,
  safePhase7BAuditPath,
} from "../scripts/audit-phase7b-human-review-package.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FINAL_HEAD = "a".repeat(40);
const FIRST_COMMIT = "b".repeat(40);
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function chunk(type, payload = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + payload.length);
  result.writeUInt32BE(payload.length, 0);
  typeBytes.copy(result, 4);
  payload.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])), 8 + payload.length);
  return result;
}

function fixturePng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const scanlines = Buffer.from([0, 20, 30, 40, 50, 60, 70, 0, 80, 90, 100, 110, 120, 130]);
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(scanlines)), chunk("IEND")]);
}

function box(type, payload = Buffer.alloc(0)) {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, 4, "ascii");
  payload.copy(result, 8);
  return result;
}

function fixtureMp4() {
  return Buffer.concat([box("ftyp", Buffer.from("isom0000isomiso2")), box("moov"), box("mdat", Buffer.from([1, 2, 3, 4]))]);
}

function commits() {
  return [
    { hash: FIRST_COMMIT, parent: PHASE7B_PARENT, subject: "build persistent Workpiece" },
    { hash: FINAL_HEAD, parent: FIRST_COMMIT, subject: "close Phase 7B evidence" },
  ];
}

function productionDiff() {
  return Buffer.from(PHASE7B_PRODUCTION_PATHS.map((relativePath, index) => [
    `diff --git a/${relativePath} b/${relativePath}`,
    `index ${String(index + 1).repeat(7)}..${String(index + 2).repeat(7)} 100644`,
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    "@@ -1 +1 @@",
    `-parent ${index}`,
    `+phase7b ${index}`,
  ].join("\n")).join("\n") + "\n");
}

function fixtureEntries() {
  const byPath = new Map();
  const chain = commits();
  const png = fixturePng();
  const mp4 = fixtureMp4();
  byPath.set("00-authority/task-brief.md", Buffer.from("# PHASE 7B\n\nONE WORKPIECE CHANGES STATE.\n\nAll six gates remain PENDING HUMAN REVIEW. Phase 7C is not authorized.\n"));
  byPath.set("00-authority/human-gates.json", json({ schema: PHASE7B_GATES_SCHEMA, status: "PENDING HUMAN REVIEW", gates: PHASE7B_GATE_RECORDS }));
  byPath.set("01-provenance/git-provenance.json", json({
    schema: PHASE7B_PROVENANCE_SCHEMA, status: "PASS", branch: PHASE7B_BRANCH, parent: PHASE7B_PARENT, head: FINAL_HEAD,
    localMain: PHASE7B_FROZEN_MAIN, originMain: PHASE7B_FROZEN_MAIN, mergeCount: 0,
    acceptedPhase6Ancestry: true, acceptedPhase7AAncestry: true, worktreeClean: true, upstreamParity: true, commits: chain,
  }));
  byPath.set("01-provenance/commits.json", json({ schema: PHASE7B_COMMITS_SCHEMA, status: "PASS", commits: chain }));
  byPath.set("01-provenance/production.diff", productionDiff());
  byPath.set("02-design/phase-7b-operating-field-architecture.md", Buffer.from("# ONE WORKPIECE CHANGES STATE\n\nPersistent history, native scroll, reduced motion and no-JavaScript normal-flow authority.\n"));
  byPath.set("02-design/phase-7b-reference-study.md", Buffer.from("# Reference study\n\nNo third-party source or branding is copied. The reference mechanics are rebuilt originally.\n"));
  byPath.set("02-design/stage-state-specification.json", json({ schema: PHASE7B_STAGE_SPEC_SCHEMA, status: "PASS", persistentWorkpiece: true, historyRetained: true, macroStates: PHASE7B_MACRO_STATES, methodStages: PHASE7B_METHOD_STAGES }));
  byPath.set("03-browser/browser-matrix.json", json({ status: "PASS", engines: ["chromium", "firefox", "webkit-proxy"], scenarios: PHASE7B_RECORDING_SCENARIOS }));
  byPath.set("03-browser/webkit-proxy.json", json({ status: "LIMITATION", classification: "LIMITATION — WEBKIT PROXY", physicalSafari: false }));
  byPath.set("04-responsive/responsive-matrix.json", json({ status: "PASS", viewports: PHASE7B_CORE_VIEWPORTS }));
  byPath.set("05-fallback/fallback-report.json", json({ status: "PASS", reducedMotion: "PASS", noJavaScript: "PASS", fallbackFonts: "PASS" }));
  byPath.set(PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH, json({
    schema: PHASE7B_INSTALLED_CHROME_200_SCHEMA, status: "PASS", browser: "Google Chrome", genuineInstalledChrome: true,
    nativeZoomPercent: 200, visibleZoomConfirmation: "Zoom: 200%",
    recording: { path: path.posix.basename(PHASE7B_INSTALLED_CHROME_RECORDING_PATH), bytes: mp4.length, sha256: sha256(mp4), decode: "PASS" },
    screenshot: { path: path.posix.basename(PHASE7B_INSTALLED_CHROME_SCREENSHOT_PATH), bytes: png.length, sha256: sha256(png), decode: "PASS" },
  }));
  byPath.set(PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH, json({ schema: PHASE7B_NATIVE_200_LIMITATION_SCHEMA, status: "LIMITATION", engine: "firefox", classification: "NOT APPLICABLE", nativeZoomPercent: 200, recording: null, reason: "Chrome browser-native zoom cannot be represented by a Firefox engine recording." }));
  for (const relativePath of ["06-assurance/accessibility.json", "06-assurance/performance.json", "06-assurance/lifecycle.json", "06-assurance/network.json", "06-assurance/publication.json"]) byPath.set(relativePath, json({ status: "PASS" }));
  byPath.set("06-assurance/phase4-hashes.json", json({ status: "PASS", assets: PHYSICAL_ASSETS.map(([assetPath, assetSha256]) => ({ path: assetPath, sha256: assetSha256 })) }));
  byPath.set("06-assurance/phase7a-regression.json", json({ status: "PASS", baseline: PHASE7B_PARENT, visualRegression: "PASS" }));
  byPath.set("07-deployment/deployment.json", json({ status: "PASS", head: FINAL_HEAD, deployedSha: FINAL_HEAD, deploymentId: "phase7b-fixture-deployment", immutablePreview: "https://fixture.qsite1.pages.dev/", branchPreview: "https://feature-phase-7b.qsite1.pages.dev/", localDistParity: "PASS" }));
  byPath.set("08-governance/environmental-limitations.json", json({ status: "DECLARED", limitations: ["WebKit is proxy evidence and not physical Safari."] }));
  byPath.set("09-audit/prepackage-audit.json", json({ schema: PHASE7B_PREPACKAGE_AUDIT_SCHEMA, status: "PASS", auditedPayloadCount: REQUIRED_PHASE7B_EVIDENCE.length - 1, finalPayloadCount: REQUIRED_PHASE7B_EVIDENCE.length, mediaDecode: { images: { status: "PASS", count: 7 }, recordings: { status: "PASS", count: 19 } } }));
  for (const { relativePath } of REQUIRED_PHASE7B_EVIDENCE) {
    if (relativePath.endsWith(".png")) byPath.set(relativePath, png);
    if (relativePath.endsWith(".mp4")) byPath.set(relativePath, mp4);
  }
  return REQUIRED_PHASE7B_EVIDENCE.map(({ relativePath }) => ({ relativePath, data: Buffer.from(byPath.get(relativePath)) }));
}

function cloneEntries(entries) {
  return entries.map(({ relativePath, data }) => ({ relativePath, data: Buffer.from(data) }));
}

function mutateJson(entries, relativePath, mutate) {
  return entries.map((entry) => {
    if (entry.relativePath !== relativePath) return { relativePath: entry.relativePath, data: Buffer.from(entry.data) };
    const document = JSON.parse(entry.data.toString("utf8"));
    mutate(document);
    return { relativePath, data: json(document) };
  });
}

test("Phase 7B package and independent-audit topologies are identical but separately declared", () => {
  assert.equal(REQUIRED_PHASE7B_EVIDENCE.length, 50);
  assert.deepEqual(AUDIT_REQUIRED_PHASE7B_EVIDENCE, REQUIRED_PHASE7B_EVIDENCE);
  const standardScenarios = PHASE7B_RECORDING_SCENARIOS.filter((scenario) => scenario !== "installed-chrome-200-percent");
  const exactRecordings = ["chromium", "firefox"].flatMap((engine) => standardScenarios.map((scenario) => `03-recordings/${engine}-${scenario}.mp4`));
  assert.equal(PHASE7B_RECORDING_SCENARIOS.length, 10);
  assert.deepEqual(PHASE7B_STANDARD_RECORDING_SCENARIOS, standardScenarios);
  assert.deepEqual(AUDIT_PHASE7B_STANDARD_RECORDING_SCENARIOS, standardScenarios);
  assert.deepEqual(PHASE7B_RECORDING_EVIDENCE_PATHS, exactRecordings);
  assert.deepEqual(AUDIT_PHASE7B_RECORDING_EVIDENCE_PATHS, exactRecordings);
  assert.ok(!exactRecordings.some((relativePath) => relativePath.includes("installed-chrome-200-percent")));
  assert.deepEqual(packageSelfTest(), { schema: "quantum-hub.phase-7b.operating-field-human-review.v1", status: "PASS", reviewZipName: PHASE7B_REVIEW_ZIP_NAME, requiredPayloads: 50, images: 7, recordings: 19 });
  assert.deepEqual(auditSelfTest(), { schema: PHASE7B_AUDIT_SCHEMA, status: "PASS", reviewZipName: PHASE7B_REVIEW_ZIP_NAME, requiredPayloads: 50, independentZipParser: true });
});

test("valid fixture builds deterministically and passes independent local-header, central-directory, CRC, hash, role, media and gate audit", () => {
  const entries = fixtureEntries();
  const first = buildPhase7BReviewArtifacts(cloneEntries(entries));
  const second = buildPhase7BReviewArtifacts(cloneEntries(entries));
  assert.ok(first.archiveBytes.equals(second.archiveBytes));
  assert.equal(first.report.archive.entryCount, 51);
  assert.equal(first.manifest.schema, PHASE7B_MANIFEST_SCHEMA);
  assert.equal(first.manifest.payloads.length, 50);
  assert.ok(first.manifest.payloads.every(({ bytes, sha256: hash, crc32: checksum }) => bytes > 0 && /^[0-9a-f]{64}$/.test(hash) && /^[0-9a-f]{8}$/.test(checksum)));
  const parsed = parsePhase7BStoredZip(first.archiveBytes);
  assert.equal(parsed.entries.size, 51);
  const audit = auditPhase7BPackageBytes({ archiveBytes: first.archiveBytes });
  assert.equal(audit.status, "PASS");
  assert.equal(audit.archive.sha256, sha256(first.archiveBytes));
  assert.equal(audit.mediaDecode.images.count, 7);
  assert.equal(audit.mediaDecode.recordings.count, 19);
  assert.ok(audit.humanGates.every(({ decision }) => decision === "PENDING HUMAN REVIEW"));
  assert.deepEqual(Object.values(audit.security), Object.values(audit.security).map(() => "PASS"));
});

test("producer rejects missing, duplicate, counterfeit governance, Phase 4, private, source, font and nested-archive payloads", () => {
  const entries = fixtureEntries();
  assert.throws(() => normalizePhase7BEvidenceEntries(entries.slice(1)), /topology differs/);
  assert.throws(() => normalizePhase7BEvidenceEntries([...entries, { ...entries[0] }]), /duplicate|topology/i);
  assert.throws(() => normalizePhase7BEvidenceEntries(mutateJson(entries, "00-authority/human-gates.json", (document) => { document.gates[0].decision = "ACCEPT"; })), /PENDING HUMAN REVIEW/);
  assert.throws(() => normalizePhase7BEvidenceEntries(mutateJson(entries, "06-assurance/phase4-hashes.json", (document) => { document.assets[0].sha256 = "0".repeat(64); })), /Phase 4 exact hashes differ/);
  assert.throws(() => normalizePhase7BEvidenceEntries(mutateJson(entries, PHASE7B_INSTALLED_CHROME_AUTHORITY_PATH, (document) => { document.browser = "Chromium"; })), /installed-Chrome 200 authority differs/);
  assert.throws(() => normalizePhase7BEvidenceEntries(mutateJson(entries, PHASE7B_FIREFOX_NATIVE_200_LIMITATION_PATH, (document) => { document.status = "PASS"; document.recording = {}; })), /limitation authority differs/);
  const falseNativeRecording = cloneEntries(entries);
  falseNativeRecording.find(({ relativePath }) => relativePath === PHASE7B_INSTALLED_CHROME_RECORDING_PATH).data = Buffer.concat([box("ftyp", Buffer.from("isom0000isomiso2")), box("moov"), box("mdat", Buffer.from([9, 8, 7, 6]))]);
  assert.throws(() => normalizePhase7BEvidenceEntries(falseNativeRecording), /native-200 evidence binding differs/);
  assert.throws(() => normalizePhase7BEvidenceEntries(mutateJson(entries, "06-assurance/performance.json", (document) => { document.note = "C:\\Users\\person\\private"; })), /privacy or secret scan/);
  assert.throws(() => assertAllowedPhase7BEvidencePath("06-assurance/source.ts"), /source payload|closed Phase 7B topology/);
  assert.throws(() => assertAllowedPhase7BEvidencePath("06-assurance/font.woff2"), /font binary/);
  assert.throws(() => assertAllowedPhase7BEvidencePath("06-assurance/archive.zip"), /nested archive/);
  assert.throws(() => assertAllowedPhase7BEvidencePath("03-recordings/firefox-installed-chrome-200-percent.mp4"), /closed Phase 7B topology/);
  assert.throws(() => safePhase7BEvidencePath("../escape.json"), /unsafe/);
});

test("independent auditor rejects CRC tampering, counterfeit manifests, unsafe names and local/central disagreement", () => {
  const artifacts = buildPhase7BReviewArtifacts(fixtureEntries());
  const crcTamper = Buffer.from(artifacts.archiveBytes);
  const firstData = 30 + crcTamper.readUInt16LE(26);
  crcTamper[firstData] ^= 0x01;
  assert.throws(() => auditPhase7BPackageBytes({ archiveBytes: crcTamper }), /CRC32 differs/);

  const parsed = parsePhase7BStoredZip(artifacts.archiveBytes);
  const forgedEntries = [...parsed.entries].map(([relativePath, entry]) => ({ relativePath, data: Buffer.from(entry.data) }));
  const manifest = JSON.parse(forgedEntries.find(({ relativePath }) => relativePath === IN_ARCHIVE_MANIFEST).data.toString("utf8"));
  manifest.payloads[0].sha256 = "0".repeat(64);
  forgedEntries.find(({ relativePath }) => relativePath === IN_ARCHIVE_MANIFEST).data = Buffer.from(stableJson(manifest));
  assert.throws(() => auditPhase7BPackageBytes({ archiveBytes: createStoredZipBuffer(forgedEntries) }), /embedded manifest differs/);

  const badPng = [...parsed.entries].map(([relativePath, entry]) => ({ relativePath, data: Buffer.from(entry.data) }));
  badPng.find(({ relativePath }) => relativePath === "04-responsive/desktop.png").data = Buffer.from("not a decoded PNG");
  assert.throws(() => auditPhase7BPackageBytes({ archiveBytes: createStoredZipBuffer(badPng) }), /PNG signature differs/);
  const badMp4 = [...parsed.entries].map(([relativePath, entry]) => ({ relativePath, data: Buffer.from(entry.data) }));
  badMp4.find(({ relativePath }) => relativePath === "03-recordings/chromium-full-forward-method.mp4").data = box("ftyp");
  assert.throws(() => auditPhase7BPackageBytes({ archiveBytes: createStoredZipBuffer(badMp4) }), /MP4 is too small|ISO-BMFF authority differs/);

  const unsafe = Buffer.from(artifacts.archiveBytes);
  const original = Buffer.from([...parsed.entries.keys()][0], "utf8");
  const replacement = Buffer.from(`../${"x".repeat(original.length - 3)}`, "utf8");
  replacement.copy(unsafe, 30);
  const centralOffset = unsafe.readUInt32LE(unsafe.length - 6);
  assert.ok(unsafe.subarray(centralOffset + 46, centralOffset + 46 + original.length).equals(original));
  replacement.copy(unsafe, centralOffset + 46);
  assert.throws(() => auditPhase7BPackageBytes({ archiveBytes: unsafe }), /unsafe/);

  const mismatch = Buffer.from(artifacts.archiveBytes);
  original.copy(mismatch, 30, 0, original.length);
  mismatch[30] = mismatch[30] === 0x30 ? 0x31 : 0x30;
  assert.throws(() => auditPhase7BPackageBytes({ archiveBytes: mismatch }), /local\/central ZIP name differs/);
  assert.throws(() => safePhase7BAuditPath("/absolute.json"), /portable and relative/);
  assert.throws(() => assertAllowedPhase7BAuditPath("06-assurance/cache/report.json"), /forbidden source\/cache\/private path/);
});

test("filesystem producer requires a fresh external output and file auditor writes once", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "qh-phase7b-package-test-"));
  try {
    const evidenceDir = path.join(root, "evidence");
    const outputDir = path.join(root, "package");
    const boundaryOptions = { repositoryRoot: ROOT, temporaryRoot: path.join(root, "transient-refusal-sentinel") };
    for (const entry of fixtureEntries()) {
      const target = path.join(evidenceDir, ...entry.relativePath.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, entry.data, { flag: "wx" });
    }
    const packaged = await packagePhase7BReviewDirectory({ evidenceDir, outputDir, boundaryOptions });
    assert.equal(packaged.status, "PASS");
    assert.equal(path.basename(packaged.zipPath), PHASE7B_REVIEW_ZIP_NAME);
    assert.equal(packaged.archive.sha256, sha256(await readFile(packaged.zipPath)));
    await assert.rejects(packagePhase7BReviewDirectory({ evidenceDir, outputDir, boundaryOptions }), /fresh output directory already exists/);
    const reportPath = path.join(outputDir, "independent-audit.json");
    const audited = await auditPhase7BPackageFile({ zipPath: packaged.zipPath, reportPath, boundaryOptions });
    assert.equal(audited.status, "PASS");
    assert.equal(JSON.parse(await readFile(reportPath, "utf8")).archive.sha256, packaged.archive.sha256);
    await assert.rejects(auditPhase7BPackageFile({ zipPath: packaged.zipPath, reportPath, boundaryOptions }), /EEXIST|exist/i);
    assert.throws(() => assertExternalPhase7BOutputPath(path.join(ROOT, "forbidden")), /outside Git/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI argument contracts fail closed", () => {
  assert.deepEqual(parsePackageArguments(["--self-test"]), { evidenceDir: null, outputDir: null, selfTest: true, help: false });
  assert.deepEqual(parseAuditArguments(["--self-test"]), { zipPath: null, reportPath: null, selfTest: true, help: false });
  assert.throws(() => parsePackageArguments(["--evidence-dir", "evidence"]), /--output-dir is required/);
  assert.throws(() => parseAuditArguments(["--zip", "review.zip"]), /--report is required/);
  assert.throws(() => parsePackageArguments(["--unknown"]), /unknown argument/);
  assert.throws(() => parseAuditArguments(["--unknown"]), /unknown argument/);
});
