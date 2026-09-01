import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  FIELD_MAP_DESTINATIONS,
  FROZEN_MAIN,
  PHASE7A_BRANCH,
  PHASE7A_GATES,
  PHASE7A_PARENT,
  PHASE7A_R1_BRANCH,
  PHASE7A_R1_PARENT,
  PUBLIC_ROUTES,
  RECORDING_SCENARIOS,
  REQUIRED_NODE,
  REVIEW_ZIP_NAME,
} from "../scripts/phase7a-contract.mjs";
import { pagesHydrationArgs, resolveGitAuthority, verifySource } from "../scripts/verify-phase7a-source.mjs";

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("Phase 7A contract freezes branch, ancestry, main, Node, routes, gates and recordings", () => {
  assert.equal(PHASE7A_BRANCH, "redirect/phase-7a-signal-field-threshold");
  assert.equal(PHASE7A_PARENT, "371e3e8a21a1d215ecaf2bf14b9f509432b230b0");
  assert.equal(FROZEN_MAIN, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(REQUIRED_NODE, "22.16.0");
  assert.equal(PUBLIC_ROUTES.length, 9);
  assert.equal(PHASE7A_GATES.length, 6);
  assert.equal(RECORDING_SCENARIOS.length, 7);
  assert.equal(REVIEW_ZIP_NAME, "phase-7a-signal-field-threshold-human-review.zip");
});

test("Phase 7A-R1 source authority passes as one fail-closed report", async () => {
  const report = await verifySource(root, process.env, "phase7a-r1");
  assert.equal(report.status, "PASS");
  assert.equal(report.branch, PHASE7A_R1_BRANCH);
  assert.equal(report.parent, PHASE7A_R1_PARENT);
  assert.equal(report.acceptedPhase6, PHASE7A_PARENT);
  assert.equal(report.runtimeDependenciesAdded, 0);
  assert.equal(report.maradinFrozen, true);
});

test("the default deployment build infers the exact R1 authority from the active branch", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-phase7a-source.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CF_PAGES: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS");
  assert.equal(report.authorityProfile, "phase7a-r1");
  assert.equal(report.branch, PHASE7A_R1_BRANCH);
});

test("Phase 7A source authority supports Cloudflare Pages detached checkouts without weakening commit identity", () => {
  const head = "a".repeat(40);
  const report = resolveGitAuthority({
    localBranch: "",
    head,
    localMain: null,
    originMain: null,
    environment: {
      CF_PAGES: "1",
      CF_PAGES_BRANCH: PHASE7A_BRANCH,
      CF_PAGES_COMMIT_SHA: head,
    },
  });

  assert.equal(report.branch, PHASE7A_BRANCH);
  assert.equal(report.mainAuthorityMode, "cloudflare-pages-ancestry");
  assert.throws(() => resolveGitAuthority({
    localBranch: "",
    head,
    localMain: null,
    originMain: null,
    environment: {
      CF_PAGES: "1",
      CF_PAGES_BRANCH: PHASE7A_BRANCH,
      CF_PAGES_COMMIT_SHA: "b".repeat(40),
    },
  }), /Cloudflare Pages commit differs/);
});

test("Phase 7A Cloudflare hydration fetches only frozen main and the governed branch", () => {
  const complete = pagesHydrationArgs(false);
  const shallow = pagesHydrationArgs(true);

  assert.deepEqual(complete, [
    "fetch",
    "--no-tags",
    "--prune",
    "origin",
    "+refs/heads/main:refs/remotes/origin/main",
    `+refs/heads/${PHASE7A_BRANCH}:refs/remotes/origin/${PHASE7A_BRANCH}`,
  ]);
  assert.deepEqual(shallow, [
    "fetch",
    "--no-tags",
    "--prune",
    "--unshallow",
    "origin",
    "+refs/heads/main:refs/remotes/origin/main",
    `+refs/heads/${PHASE7A_BRANCH}:refs/remotes/origin/${PHASE7A_BRANCH}`,
  ]);
});

test("Signal Field keeps semantic text and links outside decorative SVG", async () => {
  const [source, styles] = await Promise.all([
    read("src/components/home/SignalThreshold.astro"),
    read("src/styles/routes/phase-7a-signal-field.css"),
  ]);
  const svg = source.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? "";
  assert.ok(svg.length > 0);
  assert.doesNotMatch(svg, /<text|<a\b|<foreignObject/i);
  assert.match(source, /<h1\b/);
  assert.match(source, /<nav\b[^>]*aria-label="Primary trajectories"/);
  assert.equal((source.match(/class="manifesto-word/g) ?? []).length, 7);
  assert.match(styles, /font-stretch:\s*58%/);
  assert.match(styles, /font-stretch:\s*112%/);
  assert.match(styles, /transition:[\s\S]*?font-stretch 920ms/);
  assert.match(
    styles,
    /html\[data-cinematic-cohort="short-desktop"\] \.manifesto-line--three\s*\{\s*padding-inline-end:\s*0;/,
  );
  assert.doesNotMatch(styles, /manifesto-field__content[\s\S]{0,180}?transform:\s*scaleX/);
});

test("Field Map exposes exactly eight ordinary destinations and native disclosure", async () => {
  const [source, styles] = await Promise.all([
    read("src/components/SiteHeader.astro"),
    read("src/styles/navigation.css"),
  ]);
  for (const destination of FIELD_MAP_DESTINATIONS) assert.ok(source.includes(destination));
  assert.equal((source.match(/coordinate:\s*"/g) ?? []).length, 8);
  assert.match(source, /<details class="field-map"/);
  assert.match(source, /<summary/);
  assert.match(source, /<nav id="field-map-navigation"/);
  assert.match(source, /<div class="field-map__heading">/);
  assert.doesNotMatch(source, /<header class="field-map__heading">/);
  assert.match(
    styles,
    /html\[data-field-map-open\] \.site-header,\s*\.site-header:has\(\.field-map\[open\]\)\s*\{[\s\S]*?backdrop-filter:\s*none/,
  );
});

test("reduced motion and no-JS retain authored static authority", async () => {
  const [index, cinematicCss, signalCss] = await Promise.all([
    read("src/pages/index.astro"),
    read("src/styles/routes/home-cinematic.css"),
    read("src/styles/routes/phase-7a-signal-field.css"),
  ]);
  assert.match(index, /const reduced = window\.matchMedia/);
  assert.match(index, /candidate = capable[\s\S]*?&& !reduced/);
  assert.match(cinematicCss, /\.cinematic-runway[\s\S]*?height:\s*min\(72svh, 52rem\)/);
  assert.match(cinematicCss, /prefers-reduced-motion:\s*reduce[\s\S]*?\.cinematic-media[\s\S]*?display:\s*none/);
  assert.match(signalCss, /prefers-reduced-motion:\s*reduce[\s\S]*?opacity:\s*1\s*!important/);
});

test("governed Phase 4-R2 authority bytes survive Windows checkouts", async () => {
  const attributes = await read(".gitattributes");
  assert.match(attributes, /artifacts\/original\/phase-4r2-final-cinematic-production\/\*\* -text/);
  assert.match(attributes, /artifacts\/original\/phase-4r2-1-causal-signal-scroll-stability\/production\/\*\* -text/);
  assert.match(attributes, /artifacts\/reports\/phase-4r2\/\*\* -text/);
});

test("typography candidate licences survive Windows checkouts byte-for-byte", async () => {
  const attributes = await read(".gitattributes");
  assert.match(attributes, /artifacts\/original\/phase-7a-typography-candidates\/OFL-\*\.txt -text/);
  assert.match(attributes, /public\/fonts\/licenses\/OFL-\*\.txt -text/);
});

test("Maradin remains lazily sourced with one-player replacement and teardown", async () => {
  const [component, controller] = await Promise.all([
    read("src/components/routes/maradin/MaradinExperience.astro"),
    read("src/scripts/routes/maradin-documentary.ts"),
  ]);
  assert.equal((component.match(/preload="none"/g) ?? []).length, 2);
  assert.equal((component.match(/<video\b/g) ?? []).length, 2);
  assert.doesNotMatch(component, /<video[^>]+\ssrc=/);
  assert.doesNotMatch(component, /autoplay/);
  assert.match(controller, /players\.forEach\(\(candidate\) => \{ if \(candidate !== player\) release\(candidate\); \}\)/);
  assert.match(controller, /visibilitychange[\s\S]*?releaseAll/);
  assert.match(controller, /pagehide[\s\S]*?releaseAll/);
});

test("documentation leaves every human decision pending", async () => {
  const documents = await Promise.all([
    read("docs/phase-7a-architecture.md"),
    read("docs/phase-7a-typography-study.md"),
    read("docs/phase-7a-reference-mechanics.md"),
    read("docs/phase-7a-retention-demolition-map.md"),
  ]);
  const joined = documents.join("\n");
  for (const gate of PHASE7A_GATES) assert.ok(joined.includes(gate));
  assert.match(joined, /PENDING HUMAN REVIEW/);
  assert.match(joined, /Phase 7B (?:is )?\*?\*?NOT AUTHORIZED/);
  assert.match(joined, /[Mm]ain (?:is )?\*?\*?NOT MERGED/);
});
