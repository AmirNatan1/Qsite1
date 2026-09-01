import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  PHASE7B_BRANCH,
  PHASE7B_FROZEN_MAIN,
  PHASE7B_FORBIDDEN_RESTORATIONS,
  PHASE7B_GATES,
  PHASE7B_METHOD_STAGES,
  PHASE7B_PARENT,
  PHASE7B_PERFORMANCE_BUDGET,
  PHASE7B_PRODUCTION_PATHS,
  PHASE7B_REQUIRED_NODE,
  PHASE7B_REVIEW_ZIP_NAME,
} from "./phase7b-contract.mjs";
import { verifySource as verifyInheritedPhase7A } from "./verify-phase7a-source.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

const FROZEN_PHASE7A_PATHS = Object.freeze([
  "src/components/home/SignalThreshold.astro",
  "src/components/SiteHeader.astro",
  "src/layouts/BaseLayout.astro",
  "src/scripts/home-cinematic-integration.ts",
  "src/scripts/signal-field.ts",
  "src/styles/routes/home-cinematic.css",
  "src/styles/routes/phase-7a-signal-field.css",
  "src/styles/navigation.css",
  "src/styles/tokens.css",
  "src/styles/typography.css",
  "public/media/cinematic/phase-4r2",
  "public/brand/quantum-icon-white.svg",
  "public/brand/quantum-icon-color.svg",
]);

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function canonicalSourceBytes(source) {
  return Buffer.byteLength(source.replace(/\r\n?/g, "\n"));
}

export async function verifyPhase7BSource(root = process.cwd(), environment = process.env) {
  const inherited = await verifyInheritedPhase7A(root, environment, "phase7b-inherited");
  const read = (relative) => readFile(path.join(root, relative), "utf8");
  const head = git(root, ["rev-parse", "HEAD"]);
  const localBranch = git(root, ["branch", "--show-current"]);
  const branch = localBranch || (environment.CF_PAGES === "1" ? environment.CF_PAGES_BRANCH ?? "" : "");
  const firstCommit = git(root, ["rev-list", "--reverse", `${PHASE7B_PARENT}..${head}`]).split(/\r?\n/)[0];
  const firstParent = firstCommit ? git(root, ["rev-parse", `${firstCommit}^`]) : "";
  const merges = git(root, ["rev-list", "--merges", `${PHASE7B_PARENT}..${head}`]);

  assert.equal(branch, PHASE7B_BRANCH, "wrong Phase 7B branch");
  assert.equal(firstParent, PHASE7B_PARENT, "first Phase 7B commit must descend directly from accepted Phase 7A");
  assert.equal(merges, "", "Phase 7B history must remain linear");
  assert.equal(inherited.frozenMain, PHASE7B_FROZEN_MAIN, "frozen main authority changed");
  if (inherited.main !== null) assert.equal(inherited.main, PHASE7B_FROZEN_MAIN, "local main moved");
  assert.equal(inherited.originMain, PHASE7B_FROZEN_MAIN, "origin/main moved");
  assert.equal(process.versions.node, PHASE7B_REQUIRED_NODE, "Phase 7B source verification requires exact Node 22.16.0");

  for (const relative of PHASE7B_FORBIDDEN_RESTORATIONS) {
    assert.equal(await exists(path.join(root, relative)), false, `${relative} must remain demolished`);
  }

  const frozenChanges = git(root, ["diff", "--name-only", PHASE7B_PARENT, head, "--", ...FROZEN_PHASE7A_PATHS]);
  assert.equal(frozenChanges, "", "accepted Phase 4/7A production authority changed");

  const productionChanges = git(root, ["diff", "--name-only", PHASE7B_PARENT, head, "--", "src", "public"])
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
  assert.deepEqual(productionChanges, [...PHASE7B_PRODUCTION_PATHS].sort(), "Phase 7B production-source boundary differs");

  const [index, component, controller, stateModel, css, packageText, architecture, references] = await Promise.all([
    read("src/pages/index.astro"),
    read("src/components/home/OperatingField.astro"),
    read("src/scripts/operating-field.ts"),
    read("src/scripts/operating-field-state.mjs"),
    read("src/styles/routes/phase-7b-operating-field.css"),
    read("package.json"),
    read("docs/phase-7b-operating-field-architecture.md"),
    read("docs/phase-7b-reference-study.md"),
  ]);

  assert.match(index, /import OperatingField from "\.\.\/components\/home\/OperatingField\.astro"/);
  assert.match(index, /import "\.\.\/styles\/routes\/phase-7b-operating-field\.css"/);
  assert.match(index, /<SignalThreshold\s*\/>[\s\S]*?<OperatingField\s*\/>/);
  assert.equal((index.match(/<OperatingField\s*\/>/g) ?? []).length, 1, "homepage must mount one Operating Field");

  assert.match(component, /<section[\s\S]*?data-operating-field[\s\S]*?data-field-section/);
  assert.match(component, /data-workpiece/);
  assert.equal((component.match(/data-workpiece/g) ?? []).length, 1, "one persistent Workpiece is required");
  assert.equal((component.match(/<h1\b/g) ?? []).length, 0, "Operating Field must not add an H1");
  assert.equal((component.match(/<h2\b/g) ?? []).length, 1, "Operating Field must expose one H2");
  assert.match(component, /One workpiece changes state\./i);
  const stageOrder = [...component.matchAll(/data-method-stage=["'{]([^"'}]+)["'}]/g)].map((match) => match[1].toUpperCase());
  assert.deepEqual(stageOrder, PHASE7B_METHOD_STAGES, "METHOD semantic stage order differs");
  assert.equal((component.match(/<h3\b/g) ?? []).length, PHASE7B_METHOD_STAGES.length, "each METHOD state requires one H3");
  assert.equal((component.match(/data-method-static/g) ?? []).length, PHASE7B_METHOD_STAGES.length, "each METHOD state requires one static fallback");
  assert.match(component, /aria-hidden="true"[\s\S]*?data-workpiece|data-workpiece[\s\S]*?aria-hidden="true"/);
  assert.doesNotMatch(component, /<canvas|<video|<button|role="(?:application|dialog|menu|listbox|tree|grid)"/i);
  assert.match(component, /initOperatingField/);

  assert.match(stateModel, /projectMethodProgress/);
  for (const stage of ["open-field", "frame", "source", "assess", "test", "decide", "release"]) {
    assert.match(stateModel, new RegExp(`["']${stage}["']`), `state model is missing ${stage}`);
  }

  assert.match(controller, /requestAnimationFrame/);
  assert.match(controller, /AbortController/);
  assert.match(controller, /visibilitychange/);
  assert.match(controller, /pagehide/);
  assert.match(controller, /pageshow/);
  assert.match(controller, /prefers-reduced-motion:\s*reduce/);
  assert.match(controller, /\(hover:\s*hover\) and \(pointer:\s*fine\)/);
  assert.doesNotMatch(controller, /setInterval|setTimeout|\.play\s*\(|scroll(?:To|By|IntoView)\s*\(|\.scrollTop\s*=|addEventListener\(["'](?:wheel|touchmove)["']/);

  assert.match(css, /\.operating-field/);
  assert.match(css, /data-method-mode="enhanced"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /scroll-snap|overflow-y:\s*(?:auto|scroll)|@keyframes|animation\s*:/);
  assert.doesNotMatch(css, /\.signal-threshold|\.field-map-threshold|\.site-header/);
  assert.ok(
    canonicalSourceBytes(css) <= PHASE7B_PERFORMANCE_BUDGET.rawCssDeltaMaximum,
    `raw Phase 7B CSS exceeds ${PHASE7B_PERFORMANCE_BUDGET.rawCssDeltaMaximum} bytes`,
  );
  assert.ok(
    canonicalSourceBytes(controller) + canonicalSourceBytes(stateModel) <= PHASE7B_PERFORMANCE_BUDGET.rawJavaScriptDeltaMaximum,
    `raw Phase 7B JS exceeds ${PHASE7B_PERFORMANCE_BUDGET.rawJavaScriptDeltaMaximum} bytes`,
  );

  const packageJson = JSON.parse(packageText);
  assert.deepEqual(Object.keys(packageJson.dependencies ?? {}), ["astro"], "Phase 7B must add no runtime dependency");
  assert.equal(packageJson.engines?.node, PHASE7B_REQUIRED_NODE);
  assert.equal(packageJson.scripts?.build, "node scripts/run-phase7b-build.mjs");
  assert.match(packageJson.scripts?.check ?? "", /check:phase7b/);
  assert.match(packageJson.scripts?.test ?? "", /phase7b-contract\.test\.mjs/);
  assert.match(packageJson.scripts?.test ?? "", /phase7b-source\.test\.mjs/);
  for (const testFile of ["phase7b-browser-qa.test.mjs", "phase7b-deployment-verifier.test.mjs", "phase7b-package.test.mjs", "phase7b-installed-chrome-200.test.mjs", "phase7b-evidence-assembler.test.mjs"]) {
    assert.match(packageJson.scripts?.test ?? "", new RegExp(testFile.replaceAll(".", "\\.")), `npm test omits ${testFile}`);
  }
  assert.equal(packageJson.scripts?.["qa:phase7b-operating-field"], "node scripts/qa-phase7b-operating-field.mjs");
  assert.equal(packageJson.scripts?.["capture:phase7b-chrome-200"], "node scripts/capture-phase7b-installed-chrome-200.mjs");
  assert.equal(packageJson.scripts?.["assemble:phase7b-review"], "node scripts/assemble-phase7b-review-evidence.mjs");
  assert.equal(packageJson.scripts?.["verify:phase7b-deployment"], "node scripts/verify-phase7b-deployment.mjs");
  assert.equal(packageJson.scripts?.["package:phase7b-review"], "node scripts/package-phase7b-human-review.mjs");
  assert.equal(packageJson.scripts?.["audit:phase7b-review"], "node scripts/audit-phase7b-human-review-package.mjs");

  assert.match(architecture, /ONE WORKPIECE CHANGES STATE/i);
  assert.match(architecture, /PENDING HUMAN REVIEW/g);
  assert.match(references, /Annnimate: Multi Flip/);
  assert.match(references, /No third-party source/i);

  return {
    schema: "quantum-hub.phase-7b.source-verification.v1",
    status: "PASS",
    branch,
    head,
    parent: PHASE7B_PARENT,
    frozenMain: PHASE7B_FROZEN_MAIN,
    inheritedPhase7AStatus: inherited.status,
    productionPaths: productionChanges,
    methodStages: [...PHASE7B_METHOD_STAGES],
    humanGates: PHASE7B_GATES.map((name) => ({ name, decision: "PENDING HUMAN REVIEW" })),
    reviewZipName: PHASE7B_REVIEW_ZIP_NAME,
    runtimeDependenciesAdded: 0,
    runtimeAssetsAdded: 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  console.log(JSON.stringify(await verifyPhase7BSource(), null, 2));
}
