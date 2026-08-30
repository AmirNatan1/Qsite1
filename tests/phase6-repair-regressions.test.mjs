import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  REPAIR_CASES,
  SCHEMA,
  SHARED_DOM_EVIDENCE,
  assertExternalOutputPath,
  assertion,
  finishCheck,
  moduleScriptUrls,
  parseArguments,
  runSelfTest,
  validateReport,
} from "../scripts/qa-phase6-repair-regressions.mjs";

const root = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(root, "scripts", "qa-phase6-repair-regressions.mjs");
const externalOutput = path.resolve(root, "..", "phase-6-work", "phase6-repair-regressions.json");

test("repair tool freezes the seven verified live regressions and their before-evidence IDs", () => {
  assert.deepEqual(REPAIR_CASES, [
    { id: "home-controller-watchdog", beforeEvidence: "P6-001" },
    { id: "home-exact-top-media-failure", beforeEvidence: ["P6-003", "P6-010"] },
    { id: "home-entry-failure-reverse", beforeEvidence: "P6-002" },
    { id: "home-square-family", beforeEvidence: "P6-006" },
    { id: "home-positive-fractional-wheel", beforeEvidence: "P6-007" },
    { id: "maradin-repeated-persisted-lifecycle", beforeEvidence: "P6-004" },
    { id: "maradin-media-failure", beforeEvidence: "P6-005" },
  ]);
  assert.deepEqual(SHARED_DOM_EVIDENCE, ["P6-008", "P6-009"]);
});

test("CLI accepts a base URL and Chromium controls but requires output for live work", () => {
  const parsed = parseArguments([
    "--base-url", "http://127.0.0.1:4555",
    "--output", externalOutput,
    "--timeout-ms", "6000",
    "--headed",
  ]);
  assert.equal(parsed.baseUrl, "http://127.0.0.1:4555/");
  assert.equal(parsed.output, externalOutput);
  assert.equal(parsed.timeoutMs, 6000);
  assert.equal(parsed.headed, true);
  assert.equal(parseArguments(["--self-test"]).output, "");
  assert.throws(() => parseArguments([]), /--output is required/);
  assert.throws(() => parseArguments(["--self-test", "--timeout-ms", "5999"]), /at least 6000/);
  assert.throws(() => parseArguments(["--self-test", "--unknown"]), /Unknown argument/);
});

test("evidence path is fresh-intent JSON outside repository and OS temp", () => {
  assert.equal(assertExternalOutputPath(externalOutput), externalOutput);
  assert.throws(() => assertExternalOutputPath(path.join(root, "repair.json")), /outside the repository/);
  assert.throws(() => assertExternalOutputPath(path.join(os.tmpdir(), "repair.json")), /outside OS temporary storage/);
  assert.throws(() => assertExternalOutputPath(path.resolve(root, "..", "phase-6-work", "repair.txt")), /JSON file/);
});

test("outer Home module discovery handles attribute order and excludes inline/classic scripts", () => {
  const html = [
    '<script src="/classic.js"></script>',
    '<script type="module">console.log("inline")</script>',
    '<script src="/_astro/shared.js" crossorigin type="module"></script>',
    '<script type="module" src="/_astro/index.astro_astro_type_script_index_0_lang.ABC.js"></script>',
  ].join("");
  assert.deepEqual(moduleScriptUrls(html, "https://example.test/"), [
    "https://example.test/_astro/shared.js",
    "https://example.test/_astro/index.astro_astro_type_script_index_0_lang.ABC.js",
  ]);
});

test("assertion aggregation preserves actual evidence and fails closed", () => {
  const pass = finishCheck("fixture", "P6-000", { value: 1 }, [
    assertion("one", true, 1, 1),
    assertion("two", true, "ready", "ready"),
  ]);
  assert.equal(pass.status, "PASS");
  const fail = finishCheck("fixture", "P6-000", { value: 0 }, [assertion("one", false, 0, 1)]);
  assert.equal(fail.status, "FAIL");
  assert.deepEqual(fail.assertions[0], { actual: 0, expected: 1, name: "one", pass: false });
});

test("report validator binds every result to the accepted before-evidence baseline", () => {
  const checks = REPAIR_CASES.map(({ id, beforeEvidence }) => finishCheck(id, beforeEvidence, {}, [assertion("fixture", true, true, true)]));
  const sharedDom = finishCheck("shared-home-intent-and-logo-dom", SHARED_DOM_EVIDENCE, {}, [assertion("fixture", true, true, true)]);
  const report = {
    beforeEvidence: { acceptedBaselineSha: "005a36860ecbfd6fedb3d3f2223f168c1edfbb05" },
    checks,
    failures: [],
    schema: SCHEMA,
    sharedDom,
    status: "PASS",
  };
  assert.equal(validateReport(report), true);
  report.checks[0] = { ...report.checks[0], beforeEvidence: "P6-999" };
  assert.throws(() => validateReport(report), /before-evidence identifier differs/);
});

test("Home probes cover both watchdog boundaries, exact-top failure, semantic reverse, square and fractional input", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.equal(REPAIR_CASES.length, 7);
  assert.match(source, /runOuterModuleWatchdogProbe/);
  assert.match(source, /moduleAborted = true/);
  assert.match(source, /HOME_CONTROLLER_CHUNK/);
  assert.match(source, /CONTROLLER_CHUNK_STALL_MS = 4_600/);
  assert.match(source, /innerChunkStallMs >= 4_000/);
  assert.match(source, /late inner-controller rejection preserves controller-timeout/);
  assert.match(source, /progressed watchdog retains native scroll without CLS/);
  assert.match(source, /progressed watchdog preserves committed runway geometry/);
  assert.match(source, /controller-timeout-preserve-runway/);
  assert.match(source, /semantic #entry watchdog preserves runway/);
  assert.match(source, /const evidence = \{ innerController, outerModule, progressedOuterModule, semanticEntryOuterModule \}/);
  assert.match(source, /controller-timeout/);
  assert.match(source, /cinematicFootprintHeight <= evidence\.viewportHeight \* 2\.05/);
  assert.match(source, /evidence\.cls === 0/);
  assert.match(source, /failed-preserve-runway/);
  assert.match(source, /page\.mouse\.wheel\(0, -900\)/);
  assert.match(source, /stageVisibility === "visible"/);
  assert.match(source, /portrait-poster\|dormant-mobile/);
  assert.match(source, /portrait-h264/);
  assert.match(source, /font responses delayed/);
  assert.match(source, /for \(const deltaY of \[0\.25, 0\.25, 0\.5, 1\]\)/);
  assert.match(source, /conceptualFrame >= 46/);
  assert.match(source, /Math\.abs\(secondRest\.currentTime - firstRest\.currentTime\) <= 0\.002/);
});

test("Maradin probes exercise two persisted cycles and terminal request failure", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /new PageTransitionEvent\(eventType, \{ persisted: true \}\)/);
  assert.equal([...source.matchAll(/dispatchPersisted\(page, "pagehide"\)/g)].length, 2);
  assert.equal([...source.matchAll(/dispatchPersisted\(page, "pageshow"\)/g)].length, 2);
  assert.match(source, /second persisted pagehide also releases both sources and decoders/);
  assert.match(source, /player\.readyState === 0/);
  assert.match(source, /player\.launchHidden === false/);
  assert.match(source, /route\.abort\("failed"\)/);
});

test("shared live DOM check freezes semantic Home hrefs and 242x182 logos", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /footerHref === "\/#entry"/);
  assert.match(source, /notFound\.href === "\/#entry"/);
  assert.match(source, /width === "242" && height === "182"/);
  assert.match(source, /\/__phase6-intentional-404__\//);
});

test("tool is import-safe and contains neither captures nor document-position writes", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /const invokedDirectly =/);
  assert.doesNotMatch(source, /\.screenshot\s*\(|recordVideo|video:\s*\{/);
  assert.doesNotMatch(source, /scrollTo\s*\(|scrollIntoView\s*\(|\.scrollTop\s*=/);
});

test("self-test runs without a server, browser launch or output write", () => {
  assert.equal(runSelfTest().status, "PASS");
  const result = spawnSync(process.execPath, [scriptPath, "--self-test"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS");
  assert.equal(report.cases, 7);
  assert.deepEqual(report.beforeEvidence, ["P6-001", "P6-003", "P6-010", "P6-002", "P6-006", "P6-007", "P6-004", "P6-005", "P6-008", "P6-009"]);
});
