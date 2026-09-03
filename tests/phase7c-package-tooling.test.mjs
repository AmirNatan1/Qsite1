import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

import { PHASE7C_GATES, PHASE7C_RECORDING_SCENARIOS, PHASE7C_REVIEW_ZIP_NAME } from "../scripts/phase7c-contract.mjs";
import { crc32, createStoredZipBuffer } from "../scripts/package-phase7a-human-review.mjs";
import {
  GATES_PATH,
  IN_ARCHIVE_MANIFEST,
  PHASE7C_GATE_RECORDS,
  PHASE7C_GATES_SCHEMA,
  PHASE7C_RECORDING_INVENTORY_SCHEMA,
  REQUIRED_PHASE7C_INPUTS,
  assemblePhase7CEvidence,
  assertAllowedPhase7CEvidencePath,
  assertExternalPhase7CPath,
  buildPhase7CReviewArtifacts,
  normalizePhase7CEvidenceEntries,
  parseArguments as parseAssemblerArguments,
  runSelfTest as assemblerSelfTest,
  sha256,
} from "../scripts/assemble-phase7c-evidence.mjs";
import {
  AUDIT_REQUIRED_PHASE7C_INPUTS,
  auditPhase7CPackageBytes,
  auditPhase7CPackageFile,
  parseArguments as parseAuditArguments,
  parsePhase7CStoredZip,
  runSelfTest as auditorSelfTest,
  safePhase7CAuditPath,
} from "../scripts/audit-phase7c-package.mjs";

const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function box(type, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(header.length + payload.length, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, payload]);
}

function mp4() {
  return Buffer.concat([
    box("ftyp", Buffer.from("isom\0\0\0\0isommp42", "binary")),
    box("moov"),
    box("mdat", Buffer.from([0])),
  ]);
}

function png(width = 2, height = 2) {
  const chunk = (type, payload) => {
    const name = Buffer.from(type, "ascii");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(payload.length, 0);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, payload])), 0);
    return Buffer.concat([length, name, payload, checksum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let row = 0; row < height; row += 1) rows[row * (width * 4 + 1)] = 0;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function recordingInventory(extra = {}) {
  const videoPath = "03-recordings/chromium-full-forward-journey.mp4";
  return {
    schema: PHASE7C_RECORDING_INVENTORY_SCHEMA,
    status: "LIMITATION",
    scenarios: PHASE7C_RECORDING_SCENARIOS.map((scenario, index) => ({
      scenario,
      status: index === 0 ? "PASS" : "LIMITATION",
      artifacts: index === 0 ? [videoPath] : [],
    })),
    ...extra,
  };
}

function fixtureEntries() {
  const entries = REQUIRED_PHASE7C_INPUTS.map(({ relativePath }) => {
    if (relativePath === "00-authority/task-brief.md") return { relativePath, data: Buffer.from("# PHASE 7C\n\nALL SIX PHASE 7C GATES — PENDING HUMAN REVIEW\n") };
    if (relativePath.endsWith(".md")) return { relativePath, data: Buffer.from("# Phase 7C evidence\n\nGoverned review evidence.\n") };
    if (relativePath.endsWith(".diff")) return { relativePath, data: Buffer.from("diff --git a/example b/example\n--- a/example\n+++ b/example\n") };
    if (relativePath === "03-recordings/recording-inventory.json") return { relativePath, data: json(recordingInventory()) };
    return { relativePath, data: json({ schema: `fixture.${relativePath.replaceAll("/", ".")}`, status: "PASS" }) };
  });
  entries.push(
    { relativePath: "03-recordings/chromium-full-forward-journey.mp4", data: mp4() },
    { relativePath: "03-recordings/reverse-stop-state.png", data: png() },
  );
  return entries;
}

async function writeTree(root, entries) {
  for (const { relativePath, data } of entries) {
    const target = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }
}

function rebuildArchive(parsed, replacements = new Map()) {
  return createStoredZipBuffer([...parsed.entries].map(([relativePath, entry]) => ({
    relativePath,
    data: replacements.get(relativePath) ?? entry.data,
  })));
}

test("assembler and independent auditor freeze the same six pending gates and closed input contract", () => {
  assert.equal(assemblerSelfTest().status, "PASS");
  assert.equal(auditorSelfTest().status, "PASS");
  assert.deepEqual(REQUIRED_PHASE7C_INPUTS, AUDIT_REQUIRED_PHASE7C_INPUTS);
  assert.deepEqual(PHASE7C_GATE_RECORDS, PHASE7C_GATES.map((name) => ({ name, decision: "PENDING HUMAN REVIEW" })));
  assert.equal(PHASE7C_GATE_RECORDS.length, 6);
  assert.equal(parseAssemblerArguments(["--evidence-root", "a", "--staging-dir", "b", "--zip-path", "c"]).zipPath, "c");
  assert.equal(parseAuditArguments(["--zip", "a", "--report", "b"]).reportPath, "b");
});

test("artifacts contain a canonical manifest with every payload hash, byte count and CRC", () => {
  const artifacts = buildPhase7CReviewArtifacts(fixtureEntries());
  assert.equal(artifacts.report.status, "PASS");
  assert.equal(artifacts.report.archive.filename, PHASE7C_REVIEW_ZIP_NAME);
  assert.equal(artifacts.manifest.payloads.length, fixtureEntries().length + 1);
  assert.equal(artifacts.manifest.payloads.every(({ path: payloadPath, bytes, sha256, crc32: checksum }) => payloadPath && bytes > 0 && /^[0-9a-f]{64}$/.test(sha256) && /^[0-9a-f]{8}$/.test(checksum)), true);
  const gatePayload = artifacts.entries.find(({ relativePath }) => relativePath === GATES_PATH);
  assert.deepEqual(JSON.parse(gatePayload.data), {
    schema: PHASE7C_GATES_SCHEMA,
    status: "PENDING HUMAN REVIEW",
    gates: PHASE7C_GATE_RECORDS,
    phase7D: "NOT AUTHORIZED",
    main: "NOT MERGED",
  });

  const audit = auditPhase7CPackageBytes({
    archiveBytes: artifacts.archiveBytes,
    mp4Decoder: (_bytes, relativePath) => ({ path: relativePath, status: "PASS", tool: "fixture-decoder" }),
  });
  assert.equal(audit.status, "PASS");
  assert.equal(audit.archive.crc, "PASS");
  assert.equal(audit.archive.entryCount, artifacts.report.archive.entryCount);
  assert.equal(audit.payloadVerification.count, artifacts.report.payloadCount);
  assert.equal(audit.payloadVerification.everyHashAndByteCountMatched, true);
  assert.equal(audit.mediaDecode.png.status, "PASS");
  assert.equal(audit.mediaDecode.mp4.status, "PASS");
  assert.equal(audit.prohibitedCategories.status, "PASS");
});

test("caller-selected evidence root produces fresh external staging and ZIP, then a detached audit", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase7c-package-tooling-"));
  try {
    const evidenceRoot = path.join(temporary, "evidence-input");
    const stagingParent = path.join(temporary, "staging-parent");
    const zipParent = path.join(temporary, "zip-parent");
    await mkdir(evidenceRoot);
    await mkdir(stagingParent);
    await mkdir(zipParent);
    await writeTree(evidenceRoot, fixtureEntries());
    const stagingDir = path.join(stagingParent, "phase7c-staging");
    const zipPath = path.join(zipParent, PHASE7C_REVIEW_ZIP_NAME);
    const boundaryOptions = {
      repositoryRoot: path.join(temporary, "forbidden-repository"),
      temporaryRoot: path.join(temporary, "forbidden-system-temp"),
    };
    const assembled = await assemblePhase7CEvidence({ evidenceRoot, stagingDir, zipPath, boundaryOptions });
    assert.equal(assembled.status, "PASS");
    const stagedManifest = JSON.parse(await readFile(path.join(stagingDir, IN_ARCHIVE_MANIFEST)));
    assert.equal(stagedManifest.payloads.length, assembled.payloadCount);
    const reportPath = path.join(zipParent, "phase7c-independent-audit.json");
    const audited = await auditPhase7CPackageFile({
      zipPath,
      reportPath,
      boundaryOptions,
      mp4Decoder: (_bytes, relativePath) => ({ path: relativePath, status: "PASS", tool: "fixture-decoder" }),
    });
    assert.equal(audited.status, "PASS");
    assert.equal(JSON.parse(await readFile(reportPath)).status, "PASS");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("assembler fails closed for missing, duplicate, unresolved, private and prohibited evidence", () => {
  const complete = fixtureEntries();
  assert.throws(() => normalizePhase7CEvidenceEntries(complete.filter(({ relativePath }) => relativePath !== "05-assurance/cls.json")), /required evidence topology is incomplete/);

  const duplicate = [...complete, { relativePath: "03-recordings/REVERSE-stop-state.png", data: png() }];
  assert.throws(() => normalizePhase7CEvidenceEntries(duplicate), /duplicate Phase 7C evidence path/);

  const failed = complete.map((entry) => entry.relativePath === "05-assurance/performance.json" ? { ...entry, data: json({ status: "FAIL" }) } : entry);
  assert.throws(() => normalizePhase7CEvidenceEntries(failed), /unresolved FAIL evidence/);

  const imageOnlyPass = complete.map((entry) => entry.relativePath === "03-recordings/recording-inventory.json" ? {
    ...entry,
    data: json(recordingInventory({ scenarios: PHASE7C_RECORDING_SCENARIOS.map((scenario, index) => ({ scenario, status: index === 0 ? "PASS" : "LIMITATION", artifacts: index === 0 ? ["03-recordings/reverse-stop-state.png"] : [] })) })),
  } : entry);
  assert.throws(() => normalizePhase7CEvidenceEntries(imageOnlyPass), /PASS visual recording has no MP4/);

  const privateText = [...complete, { relativePath: "07-governance/environment-note.txt", data: Buffer.from("Captured at C:\\Users\\reviewer\\private.png") }];
  assert.throws(() => normalizePhase7CEvidenceEntries(privateText), /privacy or secret scan failed/);

  assert.throws(() => assertAllowedPhase7CEvidencePath("03-recordings/nested.zip"), /unsupported evidence type|nested archive/);
  assert.throws(() => assertAllowedPhase7CEvidencePath("03-recordings/font.woff2"), /unsupported evidence type|font binary/);
  assert.throws(() => assertAllowedPhase7CEvidencePath("05-assurance/source.js"), /unsupported evidence type|source payload/);
  assert.throws(() => assertAllowedPhase7CEvidencePath("03-recordings/raw/clip.mp4"), /forbidden source\/cache\/private path/);
  assert.throws(() => safePhase7CAuditPath("../escape.json"), /unsafe/);
  assert.throws(() => safePhase7CAuditPath("03-recordings/%2e%2e%2fescape.json"), /encoded path reinterpretation/);
});

test("raw governed Phase 4 media cannot be relabelled as review evidence", async () => {
  const phase4Poster = await readFile(path.resolve("public/media/cinematic/phase-4r2/posters/phase-4r2-desktop-poster-8dc538810811.png"));
  assert.throws(() => normalizePhase7CEvidenceEntries([...fixtureEntries(), { relativePath: "03-recordings/phase4-proof.png", data: phase4Poster }]), /raw governed Phase 4 media is forbidden/);
});

test("independent audit rejects CRC damage, manifest counterfeits and renamed gates", () => {
  const artifacts = buildPhase7CReviewArtifacts(fixtureEntries());
  const parsed = parsePhase7CStoredZip(artifacts.archiveBytes);
  const damaged = Buffer.from(artifacts.archiveBytes);
  damaged[parsed.entries.get("03-recordings/reverse-stop-state.png").dataStart] ^= 0xff;
  assert.throws(() => auditPhase7CPackageBytes({ archiveBytes: damaged, mp4Decoder: () => ({ status: "PASS" }) }), /CRC32 differs/);

  const manifest = JSON.parse(parsed.entries.get(IN_ARCHIVE_MANIFEST).data);
  manifest.payloads[0].sha256 = "0".repeat(64);
  const counterfeitManifest = rebuildArchive(parsed, new Map([[IN_ARCHIVE_MANIFEST, json(manifest)]]));
  assert.throws(() => auditPhase7CPackageBytes({ archiveBytes: counterfeitManifest, mp4Decoder: () => ({ status: "PASS" }) }), /payload hash or byte authority differs/);

  const gates = structuredClone(JSON.parse(parsed.entries.get(GATES_PATH).data));
  gates.gates[0].decision = "ACCEPT";
  const gateBytes = json(gates);
  const gateManifest = structuredClone(JSON.parse(parsed.entries.get(IN_ARCHIVE_MANIFEST).data));
  const gateRecord = gateManifest.payloads.find(({ path: payloadPath }) => payloadPath === GATES_PATH);
  gateRecord.bytes = gateBytes.length;
  gateRecord.sha256 = sha256(gateBytes);
  gateRecord.crc32 = crc32(gateBytes).toString(16).padStart(8, "0");
  gateManifest.summary.payloadBytes = gateManifest.payloads.reduce((sum, row) => sum + row.bytes, 0);
  const counterfeitGates = rebuildArchive(parsed, new Map([[GATES_PATH, gateBytes], [IN_ARCHIVE_MANIFEST, json(gateManifest)]]));
  assert.throws(() => auditPhase7CPackageBytes({ archiveBytes: counterfeitGates, mp4Decoder: () => ({ status: "PASS" }) }), /must remain PENDING HUMAN REVIEW/);
});

test("external-output boundary rejects repository and transient locations", () => {
  assert.throws(() => assertExternalPhase7CPath(path.join(process.cwd(), "review.zip")), /outside Git/);
  assert.throws(() => assertExternalPhase7CPath(path.join(os.tmpdir(), "review.zip")), /transient system temporary/);
});
