import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { PHASE7C_PRODUCTION_PATHS } from "../scripts/phase7c-contract.mjs";
import {
  createPhase7CBuildDeltaReport,
  parseArguments,
  writePhase7CBuildDeltaReport,
} from "../scripts/report-phase7c-build-delta.mjs";

const POSTER_PATH = "media/maradin/maradin-field-aperture-poster-approved.jpg";

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

async function materialize(root, files) {
  for (const [relative, payload] of Object.entries(files)) {
    const filename = path.join(root, ...relative.split("/"));
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, payload);
  }
}

async function fixture(context, label = "phase7c-build-delta-") {
  const temporary = await mkdtemp(path.join(tmpdir(), label));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const repository = path.join(temporary, "repository");
  await mkdir(repository, { recursive: true });
  runGit(repository, ["init", "--quiet"]);
  runGit(repository, ["config", "user.name", "Phase 7C Fixture"]);
  runGit(repository, ["config", "user.email", "phase7c-fixture@example.invalid"]);

  await materialize(repository, {
    "src/pages/index.astro": "<main>Phase 7B parent</main>\n",
  });
  runGit(repository, ["add", "src/pages/index.astro"]);
  runGit(repository, ["commit", "--quiet", "-m", "phase7b parent"]);
  const parent = runGit(repository, ["rev-parse", "HEAD"]);

  const currentSource = {
    "src/pages/index.astro": "<main>Phase 7C current</main>\n",
    "src/components/home/TerritoryProofThreshold.astro": "<section data-territory-traverse>territories</section>\n",
    "src/scripts/territory-traverse-state.mjs": "export const state = 'release';\n",
    "src/scripts/territory-traverse.ts": "export const controller = true;\n",
    "src/styles/routes/phase-7c-territory-proof.css": ".territory-world{display:block}\n",
  };
  assert.deepEqual(Object.keys(currentSource).sort(), [...PHASE7C_PRODUCTION_PATHS].sort());
  await materialize(repository, currentSource);
  runGit(repository, ["add", "src"]);
  runGit(repository, ["commit", "--quiet", "-m", "phase7c current"]);
  const current = runGit(repository, ["rev-parse", "HEAD"]);

  const phase7bDist = path.join(repository, "fixture-builds", "phase7b-parent");
  const phase7cDist = path.join(repository, "fixture-builds", "phase7c-current");
  const sharedPoster = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  await materialize(phase7bDist, {
    "index.html": '<!doctype html><link rel="stylesheet" href="/_astro/site-old.css"><script type="module" src="/_astro/site-old.js"></script>\n',
    "_astro/site-old.css": "body{color:white}\n",
    "_astro/site-old.js": "export const phase='7b';\n",
    [POSTER_PATH]: sharedPoster,
  });
  await materialize(phase7cDist, {
    "index.html": `<!doctype html><link rel="stylesheet" href="/_astro/site-new.css"><script type="module" src="/_astro/site-new.js"></script><img src="/${POSTER_PATH}" loading="lazy" width="1920" height="1080">\n`,
    "_astro/site-new.css": "body{color:white}.territory-world{display:block}\n",
    "_astro/site-new.js": "export const phase='7c';export const territory=true;\n",
    [POSTER_PATH]: sharedPoster,
  });

  return { temporary, repository, parent, current, currentSource, phase7bDist, phase7cDist };
}

test("the committed report compares Phase 7B parent and Phase 7C current without legacy labels", async (context) => {
  const value = await fixture(context);
  const report = await createPhase7CBuildDeltaReport({
    repository: value.repository,
    phase7bDist: value.phase7bDist,
    phase7cDist: value.phase7cDist,
    acceptedRef: value.parent,
    currentRef: value.current,
  });

  assert.equal(report.schema, "quantum-hub.phase-7c.build-delta.v1");
  assert.equal(report.status, "PASS");
  assert.equal(report.source.mode, "git-commit");
  assert.equal(report.source.phase7bParent.commit, value.parent);
  assert.equal(report.source.phase7cCurrent.baseCommit, value.current);
  assert.deepEqual(Object.keys(report.builds), ["phase7bParent", "phase7cCurrent"]);
  assert.doesNotMatch(JSON.stringify(report), /signalFieldIsolated|"phase7a"|"accepted"/);

  for (const category of ["html", "javascript", "css"]) {
    const delta = report.comparison.code.delta.categories[category];
    assert.equal(typeof delta.rawBytes, "number");
    assert.equal(typeof delta.gzipBytes, "number");
    assert.equal(typeof delta.brotliBytes, "number");
  }
  assert.equal(report.comparison.productionAssets.added.files, 0);
  assert.equal(report.comparison.productionAssets.added.rawBytes, 0);
  assert.equal(report.comparison.productionAssets.changed.length, 0);
  assert.equal(report.comparison.requests.budgetMetrics.addedJavascriptRequests, 1);
  assert.equal(report.comparison.requests.budgetMetrics.addedDocumentaryPosterRequests, 1);
  assert.equal(report.comparison.requests.delta.total, 1);
  assert.ok(report.budgets.checks.every(({ status }) => status === "PASS"));

  const controller = report.source.files.find(({ path: relative }) => relative === "src/scripts/territory-traverse.ts");
  assert.equal(controller.phase7bParent.exists, false);
  assert.equal(controller.phase7cCurrent.rawBytes, Buffer.byteLength(value.currentSource[controller.path]));
  assert.equal(controller.phase7cCurrent.gitObjectId, runGit(value.repository, ["rev-parse", `${value.current}:${controller.path}`]));
  assert.equal(controller.phase7cCurrent.sha256, createHash("sha256").update(value.currentSource[controller.path]).digest("hex"));
});

test("explicit worktree mode measures current bytes while committed mode stays bound to Git blobs", async (context) => {
  const value = await fixture(context, "phase7c-build-worktree-");
  const relative = "src/scripts/territory-traverse.ts";
  const focusedSource = `${value.currentSource[relative]}// uncommitted focused validation\n`;
  await writeFile(path.join(value.repository, ...relative.split("/")), focusedSource);

  const common = {
    repository: value.repository,
    phase7bDist: value.phase7bDist,
    phase7cDist: value.phase7cDist,
    acceptedRef: value.parent,
    currentRef: value.current,
  };
  const [worktree, committed] = await Promise.all([
    createPhase7CBuildDeltaReport({ ...common, worktree: true }),
    createPhase7CBuildDeltaReport(common),
  ]);
  const worktreeController = worktree.source.files.find(({ path: candidate }) => candidate === relative).phase7cCurrent;
  const committedController = committed.source.files.find(({ path: candidate }) => candidate === relative).phase7cCurrent;

  assert.equal(worktree.source.mode, "explicit-worktree");
  assert.equal(worktree.source.phase7cCurrent.ref, "WORKTREE");
  assert.equal(worktreeController.rawBytes, Buffer.byteLength(focusedSource));
  assert.equal(worktreeController.authority, "explicit-worktree-bytes-with-git-blob-identity");
  assert.notEqual(worktreeController.gitObjectId, committedController.gitObjectId);
  assert.equal(committed.source.mode, "git-commit");
  assert.equal(committedController.rawBytes, Buffer.byteLength(value.currentSource[relative]));
  assert.equal(committedController.authority, "exact-git-blob");
});

test("missing or incomplete builds are rejected instead of represented by fabricated measurements", async (context) => {
  const value = await fixture(context, "phase7c-build-missing-");
  await assert.rejects(
    createPhase7CBuildDeltaReport({
      repository: value.repository,
      phase7bDist: path.join(value.temporary, "does-not-exist"),
      phase7cDist: value.phase7cDist,
      acceptedRef: value.parent,
      currentRef: value.current,
    }),
    /Required build directory does not exist/,
  );

  const incomplete = path.join(value.temporary, "incomplete-build");
  await materialize(incomplete, { "_astro/orphan.js": "export{}\n" });
  await assert.rejects(
    createPhase7CBuildDeltaReport({
      repository: value.repository,
      phase7bDist: incomplete,
      phase7cDist: value.phase7cDist,
      acceptedRef: value.parent,
      currentRef: value.current,
    }),
    /index\.html is absent/,
  );
});

test("a new static asset fails the zero-file and zero-byte Phase 7C budgets", async (context) => {
  const value = await fixture(context, "phase7c-build-assets-");
  await materialize(value.phase7cDist, { "media/unapproved-new-image.png": Buffer.from([1, 2, 3, 4, 5]) });
  const report = await createPhase7CBuildDeltaReport({
    repository: value.repository,
    phase7bDist: value.phase7bDist,
    phase7cDist: value.phase7cDist,
    acceptedRef: value.parent,
    currentRef: value.current,
  });
  assert.equal(report.status, "FAIL");
  assert.equal(report.comparison.productionAssets.added.files, 1);
  assert.equal(report.comparison.productionAssets.added.rawBytes, 5);
  assert.equal(report.budgets.checks.find(({ id }) => id === "new-production-asset-files").status, "FAIL");
  assert.equal(report.budgets.checks.find(({ id }) => id === "new-production-asset-bytes").status, "FAIL");
});

test("the report writer is deterministic, external to builds and records exact worktree mode", async (context) => {
  const value = await fixture(context, "phase7c-build-writer-");
  const first = path.join(value.temporary, "reports", "first.json");
  const second = path.join(value.temporary, "reports", "second.json");
  const options = {
    repository: value.repository,
    phase7bDist: value.phase7bDist,
    phase7cDist: value.phase7cDist,
    acceptedRef: value.parent,
    currentRef: value.current,
    worktree: true,
  };
  await writePhase7CBuildDeltaReport({ ...options, output: first });
  await writePhase7CBuildDeltaReport({ ...options, output: second });
  assert.equal(await readFile(first, "utf8"), await readFile(second, "utf8"));

  await assert.rejects(
    writePhase7CBuildDeltaReport({ ...options, output: path.join(value.phase7cDist, "report.json") }),
    /external to both governed build directories/,
  );
});

test("CLI argument parsing makes worktree mode explicit and rejects ambiguous source authority", () => {
  const parsed = parseArguments([
    "--repository", "repo",
    "--phase7b-dist", "before",
    "--phase7c-dist", "after",
    "--output", "delta.json",
    "--worktree",
  ]);
  assert.equal(parsed.worktree, true);
  assert.equal(parsed.currentRef, "HEAD");
  assert.throws(
    () => parseArguments(["--phase7b-dist", "before", "--phase7c-dist", "after", "--output", "delta.json", "--worktree", "--current-ref", "branch"]),
    /cannot be combined/,
  );
});
