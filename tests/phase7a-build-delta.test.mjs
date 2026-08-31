import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "report-phase7a-build-delta.mjs");

const digest = (value) => createHash("sha256").update(value).digest("hex");

async function materialize(root, files) {
  for (const [relative, payload] of Object.entries(files)) {
    const absolute = path.join(root, ...relative.split("/"));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, payload);
  }
}

test("Phase 7A build delta is deterministic and isolates unchanged physical-opening media", async (context) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "phase7a-build-delta-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const accepted = path.join(temporary, "accepted-dist");
  const phase7a = path.join(temporary, "phase7a-dist");
  const output = path.join(temporary, "reports", "delta.json");
  const secondOutput = path.join(temporary, "reports", "delta-second.json");
  const physicalVideo = Buffer.from([0, 1, 2, 3, 4]);
  const physicalManifest = Buffer.from('{"schema":"physical"}\n');

  await materialize(accepted, {
    "index.html": "accepted home\n",
    "_astro/site.css": "body{color:white}\n",
    "_astro/app.js": "console.log('accepted')\n",
    "fonts/inter.woff2": Buffer.from([5, 5]),
    "media/cinematic/phase-4r2/media/desktop.mp4": physicalVideo,
    "media/cinematic/phase-4r2/manifests/media.json": physicalManifest,
    "media/maradin/clip.mp4": Buffer.from([9, 8, 7]),
  });
  await materialize(phase7a, {
    "index.html": "phase 7A home\n",
    "_astro/site.css": "body{color:pink}\n",
    "_astro/signal.js": "export const signal=1;\n",
    "fonts/anybody.woff2": Buffer.from([6, 6, 6]),
    "fonts/inter.woff2": Buffer.from([5, 5]),
    "media/cinematic/phase-4r2/media/desktop.mp4": physicalVideo,
    "media/cinematic/phase-4r2/manifests/media.json": physicalManifest,
    "media/maradin/clip.mp4": Buffer.from([9, 8, 7]),
  });

  const run = (destination) => spawnSync(process.execPath, [
    SCRIPT,
    "--accepted-dist", accepted,
    "--phase7a-dist", phase7a,
    "--output", destination,
  ], { cwd: ROOT, encoding: "utf8" });

  const first = run(output);
  assert.equal(first.status, 0, first.stderr);
  const second = run(secondOutput);
  assert.equal(second.status, 0, second.stderr);
  const firstPayload = await readFile(output, "utf8");
  const secondPayload = await readFile(secondOutput, "utf8");
  assert.equal(secondPayload, firstPayload, "identical dist inputs must produce byte-identical reports regardless of output path");

  const report = JSON.parse(firstPayload);
  assert.equal(report.schema, "quantum-hub.phase-7a.build-delta.v1");
  assert.deepEqual(
    report.builds.accepted.inventory.map(({ path: relative }) => relative),
    [...report.builds.accepted.inventory.map(({ path: relative }) => relative)].sort(),
    "SHA-256 inventory must use stable path ordering",
  );
  const acceptedVideo = report.builds.accepted.inventory.find(({ path: relative }) => relative.endsWith("desktop.mp4"));
  assert.equal(acceptedVideo.sha256, digest(physicalVideo));
  assert.equal(acceptedVideo.category, "physical-opening-media");
  assert.equal(acceptedVideo.compression, "identity");

  const excluded = report.comparisons.signalFieldIsolated.excludedPhysicalOpening;
  assert.equal(excluded.totals.files, 2);
  assert.equal(excluded.totals.rawBytes, physicalVideo.length + physicalManifest.length);
  assert.deepEqual(excluded.inventory.map(({ path: relative }) => relative), [
    "media/cinematic/phase-4r2/manifests/media.json",
    "media/cinematic/phase-4r2/media/desktop.mp4",
  ]);
  assert.equal(report.comparisons.signalFieldIsolated.categories["physical-opening-media"].accepted.files, 0);
  assert.equal(report.comparisons.signalFieldIsolated.categories["physical-opening-media"].phase7a.files, 0);
  assert.equal(
    report.comparisons.signalFieldIsolated.totals.accepted.rawBytes,
    report.comparisons.complete.totals.accepted.rawBytes - excluded.totals.rawBytes,
  );
  assert.equal(
    report.comparisons.signalFieldIsolated.totals.phase7a.rawBytes,
    report.comparisons.complete.totals.phase7a.rawBytes - excluded.totals.rawBytes,
  );
  assert.equal(report.builds.phase7a.categories.fonts.files, 2);
  assert.equal(typeof report.comparisons.complete.totals.delta.gzipBytes, "number");
  assert.equal(typeof report.comparisons.complete.totals.delta.brotliBytes, "number");
  assert.deepEqual(report.comparisons.complete.changes.removed.map(({ path: relative }) => relative), ["_astro/app.js"]);
  assert.deepEqual(report.comparisons.complete.changes.added.map(({ path: relative }) => relative), ["_astro/signal.js", "fonts/anybody.woff2"]);
});

test("Phase 7A build delta requires an output path outside both dist directories", async (context) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "phase7a-build-delta-output-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const accepted = path.join(temporary, "accepted-dist");
  const phase7a = path.join(temporary, "phase7a-dist");
  await materialize(accepted, { "index.html": "accepted\n" });
  await materialize(phase7a, { "index.html": "phase7a\n" });

  const result = spawnSync(process.execPath, [
    SCRIPT,
    "--accepted-dist", accepted,
    "--phase7a-dist", phase7a,
    "--output", path.join(accepted, "delta.json"),
  ], { cwd: ROOT, encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /external to both prebuilt dist directories/);
});
