import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PHASE7C_MARADIN_ASSETS,
  inspectGovernedAssets,
  validateAssetLedger,
  validateComponentSource,
  validateProofContentAuthority,
  verifyMediaGitBoundary,
  verifyPhase7CDocumentaryAssets,
} from "../scripts/verify-phase7c-documentary-assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "verify-phase7c-documentary-assets.mjs");
const LEDGER = path.join(ROOT, "docs", "phase-7c-documentary-asset-ledger.md");
const COMPONENT = path.join(ROOT, "src", "components", "home", "TerritoryProofThreshold.astro");
const CONTENT = path.join(ROOT, "src", "content", "proofs.ts");

test("the documentary authority freezes all five exact assets and homepage decisions", () => {
  assert.equal(PHASE7C_MARADIN_ASSETS.length, 5);
  assert.deepEqual(PHASE7C_MARADIN_ASSETS.map(({ id, decision }) => [id, decision]), [
    ["MARADIN-IMG-001", "ACCEPT"],
    ["MARADIN-IMG-002", "REJECT"],
    ["MARADIN-IMG-003", "REVIEW REQUIRED"],
    ["MARADIN-VID-001", "REJECT"],
    ["MARADIN-VID-002", "REJECT"],
  ]);
  assert.equal(PHASE7C_MARADIN_ASSETS.filter(({ decision }) => decision === "ACCEPT").length, 1);
  assert.equal(PHASE7C_MARADIN_ASSETS.reduce((sum, { bytes }) => sum + bytes, 0), 9_313_022);
});

test("all five repository media files independently match exact bytes, hashes and encoded dimensions", async () => {
  const records = await inspectGovernedAssets(ROOT);
  assert.equal(records.length, 5);
  assert.ok(records.every(({ status }) => status === "PASS"));
  for (const record of records) {
    assert.deepEqual(
      [record.actual.bytes, record.actual.sha256, record.actual.width, record.actual.height],
      [record.expected.bytes, record.expected.sha256, record.expected.width, record.expected.height],
      record.path,
    );
  }
});

test("the governance ledger binds every asset section and final disposition", async () => {
  const source = await readFile(LEDGER, "utf8");
  const report = validateAssetLedger(source);
  assert.equal(report.status, "PASS");
  assert.equal(report.decisions.length, 5);
  assert.deepEqual(report.decisions.map(({ decision }) => decision), [
    "ACCEPT",
    "REJECT",
    "REVIEW REQUIRED",
    "REJECT",
    "REJECT",
  ]);

  const weakened = source.replace(
    "| Phase 7C decision | **REVIEW REQUIRED** |",
    "| Phase 7C decision | **ACCEPT** |",
  );
  assert.throws(() => validateAssetLedger(weakened), /MARADIN-IMG-003 ledger decision differs/);
});

test("the homepage component uses only the accepted lazy intrinsic poster and no player", async () => {
  const [source, content] = await Promise.all([readFile(COMPONENT, "utf8"), readFile(CONTENT, "utf8")]);
  const contentReport = validateProofContentAuthority(content);
  const report = validateComponentSource(source);
  assert.equal(contentReport.status, "PASS");
  assert.equal(contentReport.posterAlt, "A vehicle on a road at night in a real field environment.");
  assert.equal(contentReport.summary, "A real-world field test of Maradin’s MEMS-based laser scanning technology for vehicle‑to‑road visual communication.");
  assert.equal(report.status, "PASS");
  assert.equal(report.imageElements, 1);
  assert.equal(report.acceptedAssetPathOccurrences, 1);
  assert.deepEqual(report.intrinsicDimensions, { width: 1920, height: 1080 });
  assert.equal(report.rejectedOrReviewAssetReferences, 0);
  assert.equal(report.videoSourcePlayerElements, 0);

  assert.throws(
    () => validateComponentSource(source.replace('loading="lazy"', 'loading="eager"')),
    /must load lazily/,
  );
  assert.throws(
    () => validateComponentSource(`${source}\n<video src="/media/maradin/maradin-field-aperture-approved.mp4"></video>`),
    /must not be referenced|must not add a video/,
  );
  assert.throws(
    () => validateComponentSource(source.replace("</section>\n\n<script>", '<img src="/extra.jpg" alt="extra" />\n</section>\n\n<script>')),
    /exactly one documentary image/,
  );
  assert.throws(
    () => validateProofContentAuthority(content.replace("A vehicle on a road at night in a real field environment.", "An expanded claim.")),
    /alternative text differs/,
  );
});

test("Phase 7C has zero tracked or untracked production-media delta from its parent", () => {
  const report = verifyMediaGitBoundary(ROOT);
  assert.equal(report.status, "PASS");
  assert.deepEqual(report.trackedChanges, []);
  assert.deepEqual(report.untrackedFiles, []);
  assert.equal(report.newAssetFiles, 0);
  assert.equal(report.newAssetBytes, 0);
});

test("the complete verifier returns one transparent fail-closed authority report", async () => {
  const report = await verifyPhase7CDocumentaryAssets(ROOT);
  assert.equal(report.schema, "quantum-hub.phase-7c.documentary-assets.v1");
  assert.equal(report.status, "PASS");
  assert.equal(report.authority.assetCount, 5);
  assert.equal(report.authority.totalBytes, 9_313_022);
  assert.equal(report.authority.newAssetFiles, 0);
  assert.equal(report.authority.newAssetBytes, 0);
  assert.ok(["PASS", "NOT OBSERVED"].includes(report.distParity.status));
});

test("the documentary verifier CLI emits parseable JSON and a successful exit status", () => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema, "quantum-hub.phase-7c.documentary-assets.v1");
  assert.equal(report.status, "PASS");
  assert.equal(report.assets.length, 5);
});
