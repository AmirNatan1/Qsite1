import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

import { crc32 } from "../scripts/package-phase7a-human-review.mjs";
import {
  PHASE7C_BRANCH,
  PHASE7C_FROZEN_MAIN,
  PHASE7C_GATES,
  PHASE7C_PARENT,
  PHASE7C_PRODUCTION_PATHS,
  PHASE7C_RECORDING_SCENARIOS,
} from "../scripts/phase7c-contract.mjs";
import { REQUIRED_PHASE7C_INPUTS, readPhase7CEvidenceRoot } from "../scripts/assemble-phase7c-evidence.mjs";
import {
  ACCEPTED_AUTHORITY_SCHEMA,
  BROWSER_REPORT_NAME,
  BROWSER_SCHEMA,
  BUILD_DELTA_SCHEMA,
  DEPLOYMENT_SCHEMA,
  MANIFEST_NAME,
  NATIVE200_MANIFEST_NAME,
  NATIVE200_REPORT_NAME,
  NATIVE200_SCHEMA,
  RECORDING_MAP_SCHEMA,
  SCHEMA,
  parseArguments,
  preparePhase7CEvidence,
  selfTest,
  sha256,
  stableJson,
  verifyEvidenceRoot,
} from "../scripts/prepare-phase7c-evidence-inputs.mjs";

const REVISION = "a".repeat(40);

function json(value) {
  return Buffer.from(stableJson(value));
}

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
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function targetInventory() {
  return { status: "PASS", minimumCssPx: 44, inventory: [], failures: [], validExclusions: [], unexplainedExclusions: [], contractFailures: [] };
}

function browserCase(name) {
  if (name === "responsive-and-short-landscape") {
    return { name, status: "PASS", failures: [], records: [{ viewport: { id: "1440x900", width: 1440, height: 900 }, targets: targetInventory() }] };
  }
  if (name === "field-map-keyboard-inert") return { name, status: "PASS", failures: [], targets: targetInventory(), cycles: [] };
  if (name === "ten-cycle-cls-lifecycle-performance") {
    return {
      name,
      status: "PASS",
      cycleCount: 10,
      clsBudget: 0.01,
      failures: [],
      limitations: [],
      cycles: Array.from({ length: 10 }, (_, index) => ({
        cycle: index + 1,
        measurement: { boundaryTimestamp: index + 1, includedLayoutShifts: [], excludedPreBoundaryEntries: [], cycleAttributableCls: 0, attributableLongTasks: [] },
      })),
    };
  }
  return { name, status: "PASS", failures: [] };
}

const REQUIRED_CASES = [
  "forward-reverse-fast-stop",
  "authored-mobile-forward-reverse",
  "responsive-and-short-landscape",
  "reduced-motion-no-js-fallback-font",
  "field-map-keyboard-inert",
  "accessibility",
  "ten-cycle-cls-lifecycle-performance",
  "network-failure-media-isolation",
];

function browserReport(extra = {}) {
  return {
    schema: BROWSER_SCHEMA,
    status: "PASS",
    revision: REVISION,
    methodology: { settlement: "predicate-bound" },
    results: ["chromium", "firefox", "webkit"].map((engine) => ({
      engine,
      engineAuthority: engine === "webkit" ? "Playwright WebKit proxy; not physical Safari" : `${engine} authority`,
      browserSource: "governed fixture",
      browserVersion: "1",
      headed: true,
      status: "PASS",
      failures: [],
      limitations: [],
      cases: REQUIRED_CASES.map(browserCase),
    })),
    humanGates: PHASE7C_GATES.map((name) => ({ name, status: "PENDING HUMAN REVIEW" })),
    phase7D: "NOT AUTHORIZED",
    main: "NOT MERGED",
    ...extra,
  };
}

function acceptedReport(extra = {}) {
  const ids = [
    "phase7a-manifesto-signal-field",
    "phase7a-audience-bifurcation",
    "phase7a-field-map-closed",
    "phase7a-field-map-open",
    "phase7b-method-frame",
    "phase7b-method-source",
    "phase7b-method-assess",
    "phase7b-method-test",
    "phase7b-method-decide",
  ];
  return {
    schema: ACCEPTED_AUTHORITY_SCHEMA,
    status: "PASS",
    authority: {
      phase7b: { revision: PHASE7C_PARENT },
      phase7c: { revision: REVISION },
      baselineMutation: "NONE",
      productionMutation: "NONE",
    },
    cases: ids.map((id) => ({ id, status: "PASS", pixelAuthority: { exactComparison: { status: "FAIL" }, adjudication: { status: "PASS — EDGE_QUANTIZATION_EQUIVALENT" } } })),
    ...extra,
  };
}

function nativeReport(extra = {}) {
  return {
    schema: NATIVE200_SCHEMA,
    status: "PASS",
    revision: REVISION,
    genuineInstalledChrome: true,
    nativeZoomPercent: 200,
    exactTargetUrl: "https://example.pages.dev/",
    observedTargetUrl: "https://example.pages.dev/",
    humanGate: "PENDING HUMAN REVIEW",
    fieldMap: { status: "PASS" },
    ...extra,
  };
}

function buildDeltaReport() {
  return {
    schema: BUILD_DELTA_SCHEMA,
    status: "PASS",
    source: { phase7bParent: { commit: PHASE7C_PARENT }, phase7cCurrent: { baseCommit: REVISION }, budgetMetrics: {} },
    comparison: {},
    budgets: { status: "PASS", checks: [] },
  };
}

function deploymentReport() {
  return {
    schema: DEPLOYMENT_SCHEMA,
    status: "PASS",
    authority: { parent: PHASE7C_PARENT, frozenMain: PHASE7C_FROZEN_MAIN },
    deployment: { deployedSha: REVISION, deploymentId: "11111111-1111-4111-8111-111111111111" },
    repository: { head: REVISION, upstream: { parity: true }, zeroMergeCommits: true, cleanWorktree: true },
    governance: {
      phase4: { status: "PASS", assetCount: 0, assets: [] },
      publication: { status: "PASS", controlledPathChanges: [] },
      regression: { status: "PASS", acceptedPhase7AUnchanged: true, acceptedPhase7BUnchanged: true },
    },
  };
}

function recordingMap(videoBytes) {
  const metadata = { path: "recording.mp4", bytes: videoBytes.length, sha256: sha256(videoBytes) };
  return {
    schema: RECORDING_MAP_SCHEMA,
    status: "PASS",
    revision: REVISION,
    scenarios: PHASE7C_RECORDING_SCENARIOS.map((scenario) => ({ scenario, status: "PASS", artifacts: [metadata] })),
  };
}

function receipt(scope) {
  return { schema: `fixture.${scope}`, status: "PASS", revision: REVISION, complete: true, scope, total: 386, passed: 386 };
}

async function writeManifestRoot(root, reportName, report, manifestName, style) {
  await mkdir(root);
  const screenshot = png();
  const reportBytes = json(report);
  await writeFile(path.join(root, reportName), reportBytes);
  await writeFile(path.join(root, "capture.png"), screenshot);
  const payloads = [
    { path: reportName, bytes: reportBytes.length, sha256: sha256(reportBytes) },
    { path: "capture.png", bytes: screenshot.length, sha256: sha256(screenshot) },
  ];
  const manifest = style === "entries"
    ? { schema: "fixture.manifest", entryCount: payloads.length, entries: payloads }
    : { schema: "fixture.manifest", status: "PASS", payloads };
  await writeFile(path.join(root, manifestName), json(manifest));
}

function repositoryAuthority() {
  const document = Buffer.from("# Phase 7C governed design\n");
  return {
    provenance: {
      schema: "fixture.provenance",
      status: "PASS",
      branch: PHASE7C_BRANCH,
      head: REVISION,
      acceptedParent: PHASE7C_PARENT,
      main: { local: PHASE7C_FROZEN_MAIN, origin: PHASE7C_FROZEN_MAIN, unchanged: true },
      upstream: { parity: "0/0" },
      cleanWorktree: true,
      zeroMergeCommits: true,
      productionChangedPaths: PHASE7C_PRODUCTION_PATHS,
    },
    commits: { schema: "fixture.commits", status: "PASS", revision: REVISION, exactParent: PHASE7C_PARENT, count: 1, commits: [{ sha: REVISION, parents: [PHASE7C_PARENT], subject: "fixture" }] },
    productionDiff: "diff --git a/src/pages/index.astro b/src/pages/index.astro\n--- a/src/pages/index.astro\n+++ b/src/pages/index.astro\n",
    designDocs: new Map([
      ["docs/phase-7c-territory-proof-architecture.md", document],
      ["docs/phase-7c-reference-study.md", document],
      ["docs/phase-7c-documentary-asset-ledger.md", document],
    ]),
  };
}

async function fixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), "phase7c-evidence-prep-"));
  const repository = path.join(base, "repository");
  const browserRoot = path.join(base, "browser-input");
  const acceptedRoot = path.join(base, "accepted-input");
  const native200Root = path.join(base, "native-input");
  const recordingsDir = path.join(base, "recordings-input");
  const evidenceRoot = path.join(base, "prepared-evidence");
  await mkdir(repository);
  await writeManifestRoot(browserRoot, BROWSER_REPORT_NAME, browserReport(), MANIFEST_NAME, "entries");
  await writeManifestRoot(acceptedRoot, "phase-7c-accepted-authority-regression.json", acceptedReport(), MANIFEST_NAME, "payloads");
  await writeManifestRoot(native200Root, NATIVE200_REPORT_NAME, nativeReport(), NATIVE200_MANIFEST_NAME, "payloads");
  await mkdir(recordingsDir);
  const video = mp4();
  await writeFile(path.join(recordingsDir, "recording.mp4"), video);
  const buildDelta = path.join(base, "build-delta.json");
  const deployment = path.join(base, "deployment.json");
  const map = path.join(base, "recording-map.json");
  const testReceipt = path.join(base, "tests.json");
  const checkReceipt = path.join(base, "check.json");
  await writeFile(buildDelta, json(buildDeltaReport()));
  await writeFile(deployment, json(deploymentReport()));
  await writeFile(map, json(recordingMap(video)));
  await writeFile(testReceipt, json({ ...receipt("full-applicable-suite"), workingDirectory: repository }));
  await writeFile(checkReceipt, json(receipt("full-source-and-build-check")));
  return {
    base,
    options: {
      repository,
      revision: REVISION,
      evidenceRoot,
      browserRoot,
      acceptedRoot,
      native200Root,
      buildDelta,
      deployment,
      recordingsDir,
      recordingMap: map,
      testReceipts: [{ label: "full-suite", path: testReceipt }],
      checkReceipts: [{ label: "source-build", path: checkReceipt }],
      boundaryOptions: { repositoryRoot: repository, temporaryRoot: path.join(base, "forbidden-temporary") },
    },
  };
}

test("preparation contract freezes the exact topology, scenarios and pending gates", () => {
  assert.equal(selfTest().status, "PASS");
  assert.equal(selfTest().schema, SCHEMA);
  assert.equal(selfTest().requiredInputs, REQUIRED_PHASE7C_INPUTS.length);
  assert.equal(parseArguments([
    "--revision", REVISION,
    "--evidence-root", "evidence",
    "--browser-root", "browser",
    "--accepted-root", "accepted",
    "--native-200-root", "native",
    "--build-delta", "delta.json",
    "--deployment", "deployment.json",
    "--recordings-dir", "recordings",
    "--recording-map", "map.json",
    "--test-receipt", "full-suite=tests.json",
    "--check-receipt", "source-check=check.json",
  ]).testReceipts[0].label, "full-suite");
});

test("bound manifests are verified byte-for-byte before their reports are consumed", async () => {
  const { base, options } = await fixture();
  try {
    const verified = await verifyEvidenceRoot({ root: options.browserRoot, reportName: BROWSER_REPORT_NAME, manifestName: MANIFEST_NAME, label: "browser QA" });
    assert.equal(verified.report.revision, REVISION);
    await writeFile(path.join(options.browserRoot, "capture.png"), png(3, 3));
    await assert.rejects(
      verifyEvidenceRoot({ root: options.browserRoot, reportName: BROWSER_REPORT_NAME, manifestName: MANIFEST_NAME, label: "browser QA" }),
      /hash or byte size differs/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("fresh preparation produces every governed input and preserves source classifications", async () => {
  const { base, options } = await fixture();
  try {
    const result = await preparePhase7CEvidence(options, { repositoryAuthority: repositoryAuthority() });
    assert.equal(result.status, "LIMITATION");
    assert.equal(result.revision, REVISION);
    assert.deepEqual(result.gates, PHASE7C_GATES.map((name) => ({ name, decision: "PENDING HUMAN REVIEW" })));
    const entries = await readPhase7CEvidenceRoot(options.evidenceRoot);
    const paths = new Set(entries.map(({ relativePath }) => relativePath));
    assert.equal(REQUIRED_PHASE7C_INPUTS.every(({ relativePath }) => paths.has(relativePath)), true);
    assert.equal(PHASE7C_RECORDING_SCENARIOS.every((scenario) => paths.has(`03-recordings/${scenario}.mp4`)), true);
    const phase7a = JSON.parse(await readFile(path.join(options.evidenceRoot, "05-assurance", "phase7a-regression.json")));
    assert.equal(phase7a.cases.every(({ pixelAuthority }) => pixelAuthority.exactComparison.status === "FAIL" && pixelAuthority.adjudication.status === "PASS — EDGE_QUANTIZATION_EQUIVALENT"), true);
    const audit = JSON.parse(await readFile(path.join(options.evidenceRoot, "08-audit", "prepackage-audit.json")));
    assert.equal(audit.everyBoundPayloadHashAndByteSizeVerified, true);
    assert.equal(audit.bindings.browser.revision, REVISION);
    assert.equal(audit.requiredTopologyComplete, true);
    const copiedReceipt = await readFile(path.join(options.evidenceRoot, "08-audit", "receipts", "test-full-suite.json"), "utf8");
    assert.match(copiedReceipt, /<private-path-redacted>/);
    assert.equal(copiedReceipt.includes(base), false);

    const secondRoot = path.join(base, "prepared-evidence-second");
    await preparePhase7CEvidence({ ...options, evidenceRoot: secondRoot }, { repositoryAuthority: repositoryAuthority() });
    const secondEntries = await readPhase7CEvidenceRoot(secondRoot);
    assert.deepEqual(
      entries.map(({ relativePath, data }) => ({ relativePath, bytes: data.length, sha256: sha256(data) })),
      secondEntries.map(({ relativePath, data }) => ({ relativePath, bytes: data.length, sha256: sha256(data) })),
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("preparation fails closed on a mismatched revision, nested browser FAIL, or recording hash", async () => {
  const first = await fixture();
  try {
    const wrong = browserReport({ revision: "b".repeat(40) });
    await writeManifestRoot(path.join(first.base, "wrong-browser"), BROWSER_REPORT_NAME, wrong, MANIFEST_NAME, "entries");
    await assert.rejects(
      preparePhase7CEvidence({ ...first.options, browserRoot: path.join(first.base, "wrong-browser") }, { repositoryAuthority: repositoryAuthority() }),
      /browser QA revision differs/,
    );
  } finally {
    await rm(first.base, { recursive: true, force: true });
  }

  const second = await fixture();
  try {
    const failing = browserReport();
    failing.results[0].cases[0].status = "FAIL";
    const failingRoot = path.join(second.base, "failing-browser");
    await writeManifestRoot(failingRoot, BROWSER_REPORT_NAME, failing, MANIFEST_NAME, "entries");
    await assert.rejects(
      preparePhase7CEvidence({ ...second.options, browserRoot: failingRoot }, { repositoryAuthority: repositoryAuthority() }),
      /contains an unresolved FAIL/,
    );
  } finally {
    await rm(second.base, { recursive: true, force: true });
  }

  const third = await fixture();
  try {
    const map = JSON.parse(await readFile(third.options.recordingMap));
    map.scenarios[0].artifacts[0].sha256 = "0".repeat(64);
    await writeFile(third.options.recordingMap, json(map));
    await assert.rejects(
      preparePhase7CEvidence(third.options, { repositoryAuthority: repositoryAuthority() }),
      /hash\/bytes differ/,
    );
  } finally {
    await rm(third.base, { recursive: true, force: true });
  }
});
