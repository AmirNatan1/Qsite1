import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RECORDING_SPECS,
  ROOT,
  SCHEMA,
  assertOwnedRawFile,
  evaluateDiagnostics,
  expectedArtifactPaths,
  parseArguments,
  runSelfTest,
  stagingPathForOutput,
  validateOptions,
} from "../scripts/capture-phase6-r1-motion-evidence.mjs";

test("R1 capture defines all five requested machine stories", () => {
  assert.deepEqual(RECORDING_SPECS.map(({ id }) => id), [
    "forward-physical-to-manifesto",
    "reverse-manifesto-to-f1",
    "stop-at-authored-states",
    "resize-orientation-mid-current-and-manifesto",
    "supporting-route-entry-and-reverse",
  ]);
  assert.equal(expectedArtifactPaths().length, 6);
  assert.equal(expectedArtifactPaths().filter((value) => value.endsWith(".mp4")).length, 5);
  assert.ok(!expectedArtifactPaths().some((value) => /\.webm$|raw|frames/i.test(value)));
  assert.deepEqual(runSelfTest(), { schema: `${SCHEMA}.self-test`, status: "PASS", recordings: 5, artifacts: 6 });
});

test("R1 capture accepts only Chromium or Firefox and an external durable output", () => {
  const output = path.resolve(ROOT, "..", "phase-6-r1-motion-work", "chromium");
  const options = validateOptions(parseArguments([
    "--base-url", "http://127.0.0.1:4338",
    "--output", output,
    "--engine", "firefox",
    "--headed",
  ]));
  assert.equal(options.baseUrl, "http://127.0.0.1:4338/");
  assert.equal(options.engine, "firefox");
  assert.equal(options.headed, true);
  assert.equal(options.output, output);
  assert.throws(() => validateOptions(parseArguments(["--base-url", "http://127.0.0.1:4338", "--output", output, "--engine", "webkit"])), /chromium or firefox/);
  assert.throws(() => validateOptions(parseArguments(["--base-url", "http://127.0.0.1:4338", "--output", path.join(ROOT, "artifacts", "capture"), "--engine", "chromium"])), /outside the repository/);
  assert.throws(() => validateOptions(parseArguments(["--base-url", "http://127.0.0.1:4338", "--output", path.join(os.tmpdir(), "phase6-r1"), "--engine", "chromium"])), /temporary storage/);
});

test("R1 capture uses a short sibling staging path for Windows codec compatibility", () => {
  const output = path.resolve(ROOT, "..", "phase-6-r1-machine-evidence", "motion-chromium-hardened-final");
  const staging = stagingPathForOutput(output, 12345, "deadbeef");
  assert.equal(path.dirname(staging), path.dirname(output));
  assert.equal(path.basename(staging), ".p6r1-12345-deadbeef");
  assert(!staging.includes(path.basename(output)));
});

test("R1 capture uses native inputs and cannot write page scroll position", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "capture-phase6-r1-motion-evidence.mjs"), "utf8");
  assert.match(source, /page\.mouse\.wheel/);
  assert.match(source, /page\.setViewportSize/);
  assert.match(source, /SUPPLEMENTAL MACHINE EVIDENCE — NOT PHYSICAL DEVICE EVIDENCE/);
  assert.match(source, /refusing to overwrite existing R1 motion evidence/);
  assert.doesNotMatch(source, /scrollTo\s*\(|scrollIntoView\s*\(|\.scrollTop\s*=/);
  assert.doesNotMatch(source, /(?:physical device|human device)[^\n]{0,80}PASS/i);
});

test("R1 capture diagnostics fail closed for page errors, blocked requests and unexpected request failures", () => {
  const clean = { blocked: [], console: [], pageErrors: [], requests: [] };
  assert.deepEqual(evaluateDiagnostics(clean), { status: "PASS", failures: [] });

  const pageError = evaluateDiagnostics({ ...clean, pageErrors: [{ scope: "forward", message: "decoder exploded" }] });
  assert.equal(pageError.status, "FAIL");
  assert.deepEqual(pageError.failures.map(({ type }) => type), ["PAGE ERROR"]);

  const blocked = evaluateDiagnostics({ ...clean, blocked: [{ scope: "reverse", method: "GET", path: "/tracker", resourceType: "script" }] });
  assert.equal(blocked.status, "FAIL");
  assert.deepEqual(blocked.failures.map(({ type }) => type), ["BLOCKED REQUEST"]);

  const failed = evaluateDiagnostics({
    ...clean,
    requests: [{ scope: "resize", method: "GET", path: "/assets/home.mp4", resourceType: "media", status: null, failure: "net::ERR_FAILED" }],
  });
  assert.equal(failed.status, "FAIL");
  assert.deepEqual(failed.failures.map(({ type }) => type), ["FAILED REQUEST"]);
});

test("R1 capture permits only the browser's expected blob-media teardown abort", () => {
  const clean = { blocked: [], console: [], pageErrors: [] };
  const expected = evaluateDiagnostics({
    ...clean,
    requests: [{ scope: "reverse", method: "GET", path: "http://127.0.0.1:4338/ed3ef01c-7e83-4da9-b4c6-9773c7a9ee7a", resourceType: "media", status: null, failure: "net::ERR_ABORTED" }],
  });
  assert.deepEqual(expected, { status: "PASS", failures: [] });

  for (const changed of [
    { path: "/assets/home.mp4" },
    { resourceType: "script" },
    { failure: "net::ERR_FAILED" },
    { status: 200 },
  ]) {
    const request = { method: "GET", path: "https://preview.example/00000000-0000-4000-8000-000000000000", resourceType: "media", status: null, failure: "NS_BINDING_ABORTED", ...changed };
    assert.equal(evaluateDiagnostics({ ...clean, requests: [request] }).status, "FAIL");
  }
});

test("R1 raw cleanup accepts only files below the story-owned raw directory", () => {
  const rawDirectory = path.join(ROOT, ".r1-motion-staging", ".raw", "forward");
  const owned = path.join(rawDirectory, "recording.webm");
  assert.equal(assertOwnedRawFile(rawDirectory, owned), path.resolve(owned));
  assert.throws(() => assertOwnedRawFile(rawDirectory, rawDirectory), /must be a file below/);
  assert.throws(() => assertOwnedRawFile(rawDirectory, path.join(rawDirectory, "..", "sibling.webm")), /escaped/);
  assert.throws(() => assertOwnedRawFile(rawDirectory, path.join(ROOT, "package.json")), /escaped/);
});
