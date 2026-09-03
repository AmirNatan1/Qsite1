import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PHASE7C_PRODUCTION_PATHS, PHASE7C_REQUIRED_NODE } from "../scripts/phase7c-contract.mjs";
import {
  assertAdditiveIndexContract,
  assertNoProhibitedPhase7CSource,
  assertPhase7CComponentContract,
  assertPhase7CRuntimeContract,
  assertProductionPathAllowlist,
  assertUnchangedDependencies,
  canonicalSourceBytes,
  verifyPhase7CSource,
} from "../scripts/verify-phase7c-source.mjs";

test("source byte budgets are invariant across LF and Windows CRLF checkouts", () => {
  assert.equal(canonicalSourceBytes("alpha\nbeta\n"), canonicalSourceBytes("alpha\r\nbeta\r\n"));
});

test("the homepage contract permits only the three additive Phase 7C lines", () => {
  const accepted = [
    "---",
    'import OperatingField from "../components/home/OperatingField.astro";',
    'import "../styles/routes/phase-7b-operating-field.css";',
    "---",
    "    <OperatingField />",
    "",
    "    <script is:inline>",
  ].join("\n");
  const additive = [
    "---",
    'import OperatingField from "../components/home/OperatingField.astro";',
    'import TerritoryProofThreshold from "../components/home/TerritoryProofThreshold.astro";',
    'import "../styles/routes/phase-7b-operating-field.css";',
    'import "../styles/routes/phase-7c-territory-proof.css";',
    "---",
    "    <OperatingField />",
    "",
    "    <TerritoryProofThreshold />",
    "",
    "    <script is:inline>",
  ].join("\n");

  assert.doesNotThrow(() => assertAdditiveIndexContract(additive, accepted));
  assert.throws(
    () => assertAdditiveIndexContract(additive.replace("<OperatingField />", '<OperatingField data-revised="true" />'), accepted),
    /Operating Field|beyond the three authorized/,
  );
  assert.throws(
    () => assertAdditiveIndexContract(`${additive}\n    <TerritoryProofThreshold />`, accepted),
    /one Territory Proof mount/,
  );
});

test("the production allowlist fails closed around the five exact Phase 7C paths", () => {
  assert.deepEqual(assertProductionPathAllowlist(PHASE7C_PRODUCTION_PATHS), [...PHASE7C_PRODUCTION_PATHS].sort());
  assert.throws(
    () => assertProductionPathAllowlist([...PHASE7C_PRODUCTION_PATHS, "src/scripts/operating-field.ts"]),
    /escaped the Phase 7C allowlist/,
  );
  assert.throws(
    () => assertProductionPathAllowlist(PHASE7C_PRODUCTION_PATHS.slice(0, -1)),
    /production-source boundary differs/,
  );
});

test("runtime safety rejects position writes, input capture, timers, custom scroll and media APIs", () => {
  const prohibited = [
    "window.scrollTo(0, 10)",
    "node.scrollIntoView()",
    "node.scrollTop = 4",
    "event.preventDefault()",
    'addEventListener("wheel", handler)',
    "setTimeout(render, 20)",
    "new Lenis()",
    "new THREE.Scene()",
    "<video autoplay></video>",
    "MediaSource.isTypeSupported(codec)",
    "URL.createObjectURL(blob)",
    "player.play()",
  ];
  assert.doesNotThrow(() => assertNoProhibitedPhase7CSource("const progress = 0.5;"));
  for (const source of prohibited) {
    assert.throws(() => assertNoProhibitedPhase7CSource(source, "fixture"), /prohibited/);
  }
});

test("dependency comparison rejects runtime or development package drift", () => {
  const accepted = JSON.stringify({
    engines: { node: "22.16.0" },
    dependencies: { astro: "7.2.2" },
    devDependencies: { typescript: "5.9.3" },
    overrides: { unifont: "0.7.4" },
  });
  assert.doesNotThrow(() => assertUnchangedDependencies(accepted, accepted));
  assert.throws(
    () => assertUnchangedDependencies(
      JSON.stringify({
        engines: { node: "22.16.0" },
        dependencies: { astro: "7.2.2", gsap: "3.0.0" },
        devDependencies: { typescript: "5.9.3" },
        overrides: { unifont: "0.7.4" },
      }),
      accepted,
    ),
    /dependencies changed/,
  );
});

test("the current homepage, component and controller satisfy the Phase 7C structural contract", async () => {
  const [indexSource, componentSource, controllerSource, stateSource] = await Promise.all([
    readFile("src/pages/index.astro", "utf8"),
    readFile("src/components/home/TerritoryProofThreshold.astro", "utf8"),
    readFile("src/scripts/territory-traverse.ts", "utf8"),
    readFile("src/scripts/territory-traverse-state.mjs", "utf8"),
  ]);
  const acceptedIndexSource = execFileSync(
    "git",
    ["show", "0994a5887fa90a4558275f3e66857aca5b4d4de9:src/pages/index.astro"],
    { encoding: "utf8" },
  );
  assertAdditiveIndexContract(indexSource, acceptedIndexSource);
  assertPhase7CComponentContract(componentSource);
  assertPhase7CRuntimeContract({ controllerSource, stateSource });
});

const cleanWorktree = execFileSync(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=all"],
  { encoding: "utf8" },
).trim() === "";
const completeSourceReady = existsSync("src/styles/routes/phase-7c-territory-proof.css")
  && process.versions.node === PHASE7C_REQUIRED_NODE
  && cleanWorktree;

test(
  "the complete Phase 7C source authority passes as one fail-closed report",
  { skip: completeSourceReady ? false : "requires committed complete source and the governed Node 22.16.0 runtime" },
  async () => {
    const report = await verifyPhase7CSource();
    assert.equal(report.status, "PASS");
    assert.equal(report.parent, "0994a5887fa90a4558275f3e66857aca5b4d4de9");
    assert.equal(report.localMain, "501040c42bba30b9d9517b88a8f9857992a2dba4");
    assert.equal(report.originMain, report.localMain);
    assert.equal(report.mergeCount, 0);
    assert.deepEqual(report.productionPaths, [...PHASE7C_PRODUCTION_PATHS].sort());
    assert.equal(report.industries.length, 4);
    assert.equal(report.proofRecord, "Maradin — Dynamic Ground Projection");
    assert.equal(report.runtimeDependenciesAdded, 0);
    assert.equal(report.runtimeAssetsAdded, 0);
    assert.equal(report.humanGates.length, 6);
    assert.ok(report.humanGates.every(({ decision }) => decision === "PENDING HUMAN REVIEW"));
  },
);
