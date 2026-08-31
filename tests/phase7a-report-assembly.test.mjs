import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BROWSER_SCHEMA,
  BUILD_DELTA_SCHEMA,
  REPO_ROOT,
  createPhase7AReportBundle,
  parseArguments,
  selfTest,
  writePhase7AReports,
} from "../scripts/assemble-phase7a-reports.mjs";
import {
  DELETED_PRODUCTION_PATHS,
  PHASE7A_BRANCH,
  PHASE7A_GATES,
  PHYSICAL_ASSETS,
} from "../scripts/phase7a-contract.mjs";

function passingEngine(engine, routeCount, responsiveCount) {
  return {
    identity: { engine, authority: engine === "webkit" ? "WebKit compatibility proxy" : "native automated engine" },
    routes: Array.from({ length: routeCount }, (_, index) => ({ status: "PASS", case: index + 1 })),
    accessibility: Array.from({ length: 20 }, (_, index) => ({
      status: "PASS",
      case: index + 1,
      accessibility: { violations: [], incomplete: [] },
    })),
    responsive: Array.from({ length: responsiveCount }, (_, index) => ({ status: "PASS", case: index + 1 })),
    fieldMap: { status: "PASS" },
    fallback: {
      reducedMotion: { status: "PASS" },
      noJavaScript: { status: "PASS" },
      fallbackFont: { status: "PASS" },
    },
    history: { status: "PASS" },
    cycles: {
      status: "PASS",
      samples: Array.from({ length: 10 }, (_, index) => ({ status: "PASS", cycle: index + 1 })),
    },
    network: [
      { status: "PASS", profile: "blocked" },
      { status: "PASS", profile: "slow" },
    ],
    failures: [],
    status: "PASS",
  };
}

function passingBrowser() {
  return {
    schema: BROWSER_SCHEMA,
    branch: PHASE7A_BRANCH,
    results: [
      passingEngine("chromium", 130, 13),
      passingEngine("firefox", 34, 4),
      passingEngine("webkit", 34, 4),
    ],
    limitations: [
      "WebKit is an automated compatibility proxy, not physical Safari.",
      "Programmatic scroll does not prove physical touch, wheel, or trackpad input.",
    ],
    humanGates: Object.fromEntries(PHASE7A_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"])),
    status: "PASS",
  };
}

function buildDelta() {
  return {
    schema: BUILD_DELTA_SCHEMA,
    compression: "brotli",
    builds: {
      accepted: { totals: { files: 100, bytes: 100000 } },
      phase7a: { totals: { files: 105, bytes: 103500 } },
    },
    comparisons: {
      complete: {
        totals: {
          accepted: { files: 100, rawBytes: 100000, gzipBytes: 50000, brotliBytes: 45000 },
          phase7a: { files: 105, rawBytes: 103500, gzipBytes: 52000, brotliBytes: 47000 },
          delta: { files: 5, rawBytes: 3500, gzipBytes: 2000, brotliBytes: 2000 },
        },
        changes: { added: ["one.css"], removed: [], changed: ["two.js"], unchanged: [] },
      },
      signalFieldIsolated: {
        totals: {
          accepted: { files: 80, rawBytes: 80000, gzipBytes: 40000, brotliBytes: 36000 },
          phase7a: { files: 82, rawBytes: 82500, gzipBytes: 41500, brotliBytes: 37500 },
          delta: { files: 2, rawBytes: 2500, gzipBytes: 1500, brotliBytes: 1500 },
        },
        changes: { added: ["one.css"], removed: [], changed: ["two.js"], unchanged: [] },
      },
    },
  };
}

const HEAD = "a".repeat(40);

function passingGitEvidence() {
  return {
    status: "PASS",
    branch: PHASE7A_BRANCH,
    head: HEAD,
    parentIsAncestor: true,
    mergeCommits: [],
    worktree: { clean: true, statusLines: [] },
    deletionInventory: DELETED_PRODUCTION_PATHS.map((relativePath) => ({
      path: relativePath,
      absentAtHead: true,
      existedAtParent: true,
      status: "PASS",
    })),
    trackedTrees: {
      parent: { fileCount: 100, bytes: 100000, inventorySha256: "b".repeat(64) },
      head: { fileCount: 105, bytes: 103500, inventorySha256: "c".repeat(64) },
      delta: { files: 5, bytes: 3500 },
    },
    trackedChanges: { count: 5, addedLines: 200, deletedLines: 40, binaryFiles: 1, entries: [] },
    failures: [],
    limitations: [],
  };
}

function passingPhysicalEvidence() {
  return {
    status: "PASS",
    assets: PHYSICAL_ASSETS.map(([relativePath, expectedSha256], index) => ({
      path: relativePath,
      expectedSha256,
      actualSha256: expectedSha256,
      bytes: index + 1,
      status: "PASS",
    })),
  };
}

function overrides() {
  return { gitEvidence: passingGitEvidence(), physicalEvidence: passingPhysicalEvidence() };
}

async function writeInputs(root, { browser = passingBrowser(), check = "status: PASS\n", tests = "TAP version 13\n# pass 3\n# fail 0\n", deployment } = {}) {
  const browserReport = path.join(root, "browser-report.json");
  const buildDeltaPath = path.join(root, "build-delta.json");
  const checkLog = path.join(root, "exact-check.log");
  const testLog = path.join(root, "exact-tests.log");
  await Promise.all([
    writeFile(browserReport, `${JSON.stringify(browser, null, 2)}\n`),
    writeFile(buildDeltaPath, `${JSON.stringify(buildDelta(), null, 2)}\n`),
    writeFile(checkLog, check),
    writeFile(testLog, tests),
  ]);
  const options = { browserReport, buildDelta: buildDeltaPath, checkLog, testLog };
  if (deployment !== undefined) {
    options.deploymentJson = path.join(root, "deployment.json");
    await writeFile(options.deploymentJson, `${JSON.stringify(deployment, null, 2)}\n`);
  }
  return options;
}

async function readTree(directory) {
  const names = (await readdir(directory)).sort((left, right) => left.localeCompare(right));
  const files = new Map();
  for (const name of names) files.set(name, await readFile(path.join(directory, name), "utf8"));
  return files;
}

function sourceDescriptors() {
  return ["browser", "buildDelta", "checkLog", "testLog"].map((key) => ({
    key,
    descriptor: { label: key, filename: `${key}.evidence`, bytes: 1, sha256: "d".repeat(64) },
  }));
}

test("Phase 7A assembler self-test preserves honest incomplete performance status", async () => {
  assert.deepEqual(await selfTest(), { status: "PASS", fileCount: 29 });
});

test("writes a deterministic 29-file external report set with six pending human gates", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase7a-report-assembly-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const inputs = await writeInputs(temporary);
  const firstDirectory = path.join(temporary, "first-output");
  const secondDirectory = path.join(temporary, "second-output");

  const firstResult = await writePhase7AReports({ ...inputs, outputDirectory: firstDirectory }, overrides());
  const secondResult = await writePhase7AReports({ ...inputs, outputDirectory: secondDirectory }, overrides());
  assert.equal(firstResult.fileCount, 29);
  assert.equal(secondResult.fileCount, 29);

  const first = await readTree(firstDirectory);
  const second = await readTree(secondDirectory);
  assert.deepEqual([...first.keys()], [...second.keys()]);
  assert.equal(first.size, 29);
  for (const [name, value] of first) assert.equal(value, second.get(name), `${name} must be byte-identical`);

  const manifest = JSON.parse(first.get("assembly-manifest.json"));
  assert.equal(manifest.fileCountExcludingManifest, 28);
  assert.equal(manifest.files.length, 28);
  assert.equal(manifest.generatedAt, null);
  assert.ok(manifest.files.every((item) => /^[0-9a-f]{64}$/.test(item.sha256)));

  const gates = JSON.parse(first.get("13-human-gates.json"));
  assert.equal(gates.status, "PENDING HUMAN REVIEW");
  assert.equal(gates.summary.gateCount, 6);
  assert.deepEqual(gates.summary.gates.map((gate) => gate.gate), PHASE7A_GATES);
  assert.ok(gates.summary.gates.every((gate) => gate.status === "PENDING HUMAN REVIEW"));

  assert.equal(JSON.parse(first.get("01-accessibility.json")).status, "PASS");
  assert.equal(JSON.parse(first.get("02-responsive.json")).status, "PASS");
  const performance = JSON.parse(first.get("06-performance-lifecycle.json"));
  assert.equal(performance.status, "LIMITATION");
  assert.deepEqual(performance.summary.buildDelta.complete, {
    acceptedBytes: 100000,
    phase7aBytes: 103500,
    deltaBytes: 3500,
    accepted: { files: 100, rawBytes: 100000, gzipBytes: 50000, brotliBytes: 45000 },
    phase7a: { files: 105, rawBytes: 103500, gzipBytes: 52000, brotliBytes: 47000 },
    delta: { files: 5, rawBytes: 3500, gzipBytes: 2000, brotliBytes: 2000 },
  });
  assert.equal(JSON.parse(first.get("08-publication.json")).status, "PASS");
  assert.equal(JSON.parse(first.get("09-physical-hashes.json")).status, "PASS");
  assert.equal(JSON.parse(first.get("12-deployment-provenance.json")).status, "NOT AVAILABLE TO EXECUTION ENVIRONMENT");

  const combined = [...first.values()].join("\n");
  assert.doesNotMatch(combined, new RegExp(temporary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.doesNotMatch(combined, new RegExp(REPO_ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("never promotes incomplete browser evidence or ambiguous logs to PASS", () => {
  const browser = passingBrowser();
  browser.results = browser.results.filter((result) => result.identity.engine !== "webkit");
  const documents = createPhase7AReportBundle({
    browser,
    buildDelta: buildDelta(),
    checkLog: "check command completed\n",
    testLog: "tests executed\n",
    deployment: null,
    sources: sourceDescriptors(),
    ...overrides(),
  });
  const byTitle = new Map(documents.map((document) => [document.title, document]));
  assert.equal(byTitle.get("Phase 7A accessibility report").status, "LIMITATION");
  assert.equal(byTitle.get("Phase 7A responsive report").status, "LIMITATION");
  assert.equal(byTitle.get("Phase 7A publication report").status, "LIMITATION");
  assert.equal(byTitle.get("Phase 7A deployment provenance report").status, "NOT AVAILABLE TO EXECUTION ENVIRONMENT");
});

test("whitelists deployment provenance and strips URL credentials/query data", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase7a-deployment-assembly-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const inputs = await writeInputs(temporary, {
    deployment: {
      status: "ready",
      url: "https://user:password@preview.example.test/build?token=do-not-retain#fragment",
      sha: HEAD,
      parity: "PASS",
      secret: "not-for-reports",
    },
  });
  const outputDirectory = path.join(temporary, "deployment-output");
  await writePhase7AReports({ ...inputs, outputDirectory }, overrides());
  const report = await readFile(path.join(outputDirectory, "12-deployment-provenance.json"), "utf8");
  const parsed = JSON.parse(report);
  assert.equal(parsed.status, "PASS");
  assert.equal(parsed.summary.fields.immutablePreview, "https://preview.example.test/build");
  assert.doesNotMatch(report, /password|do-not-retain|not-for-reports|fragment/);
});

test("rejects stale or repository-contained output directories before writing", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "phase7a-output-policy-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const inputs = await writeInputs(temporary);
  const existing = path.join(temporary, "existing-output");
  await mkdir(existing);
  await assert.rejects(
    writePhase7AReports({ ...inputs, outputDirectory: existing }, overrides()),
    /must not already exist/,
  );

  const insideRepository = path.join(REPO_ROOT, `.phase7a-report-assembly-forbidden-${process.pid}`);
  await assert.rejects(
    writePhase7AReports({ ...inputs, outputDirectory: insideRepository }, overrides()),
    /outside the repository/,
  );
});

test("CLI parser requires explicit evidence and output bindings", () => {
  assert.deepEqual(parseArguments(["--self-test"]), { selfTest: true });
  assert.throws(() => parseArguments(["--browser-report", "one.json"]), /Missing required argument/);
  assert.throws(() => parseArguments(["--unknown", "value"]), /Unknown or incomplete argument/);
  const parsed = parseArguments([
    "--browser-report", "browser.json",
    "--build-delta", "delta.json",
    "--check-log", "check.log",
    "--test-log", "test.log",
    "--output-dir", "output",
  ]);
  assert.equal(parsed.browserReport, "browser.json");
  assert.equal(parsed.outputDirectory, "output");
});
