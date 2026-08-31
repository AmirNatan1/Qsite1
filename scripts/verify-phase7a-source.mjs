import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  DELETED_PRODUCTION_PATHS,
  FIELD_MAP_DESTINATIONS,
  FROZEN_MAIN,
  MARADIN_FROZEN_PATHS,
  PHASE7A_BRANCH,
  PHASE7A_PARENT,
  PHYSICAL_ASSETS,
  TYPOGRAPHY_ASSETS,
} from "./phase7a-contract.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

async function exists(filename) {
  try { await access(filename); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function sha256(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

export async function verifySource(root = process.cwd()) {
  const read = (relative) => readFile(path.join(root, relative), "utf8");
  const branch = git(root, ["branch", "--show-current"]);
  const head = git(root, ["rev-parse", "HEAD"]);
  const localMain = git(root, ["rev-parse", "main"]);
  const originMain = git(root, ["rev-parse", "origin/main"]);
  const firstCommit = git(root, ["rev-list", "--reverse", `${PHASE7A_PARENT}..${head}`]).split(/\r?\n/)[0];
  const firstParent = firstCommit ? git(root, ["rev-parse", `${firstCommit}^`]) : "";
  const merges = git(root, ["rev-list", "--merges", `${PHASE7A_PARENT}..${head}`]);

  assert.equal(branch, PHASE7A_BRANCH, "wrong Phase 7A branch");
  assert.equal(firstParent, PHASE7A_PARENT, "first Phase 7A commit must descend directly from accepted Phase 6");
  assert.equal(localMain, FROZEN_MAIN, "local main moved");
  assert.equal(originMain, FROZEN_MAIN, "origin/main moved");
  assert.equal(merges, "", "Phase 7A history must remain linear");

  for (const relative of DELETED_PRODUCTION_PATHS) {
    assert.equal(await exists(path.join(root, relative)), false, `${relative} must remain demolished`);
  }

  for (const [relative, expected] of PHYSICAL_ASSETS) {
    assert.equal(await sha256(path.join(root, relative)), expected, `${relative} physical hash changed`);
  }
  for (const [relative, bytes, expected] of TYPOGRAPHY_ASSETS) {
    const filename = path.join(root, relative);
    assert.equal((await stat(filename)).size, bytes, `${relative} byte count changed`);
    assert.equal(await sha256(filename), expected, `${relative} font/licence hash changed`);
  }

  const maradinDiff = git(root, ["diff", "--name-only", PHASE7A_PARENT, "--", ...MARADIN_FROZEN_PATHS]);
  assert.equal(maradinDiff, "", "Maradin route, content, lifecycle, or media authority changed");

  const [index, signal, signalController, cinematic, signalCss, header, typography, packageText, attributes] = await Promise.all([
    read("src/pages/index.astro"),
    read("src/components/home/SignalThreshold.astro"),
    read("src/scripts/signal-field.ts"),
    read("src/scripts/home-cinematic-integration.ts"),
    read("src/styles/routes/phase-7a-signal-field.css"),
    read("src/components/SiteHeader.astro"),
    read("src/styles/typography.css"),
    read("package.json"),
    read(".gitattributes"),
  ]);

  assert.match(index, /<SignalThreshold\s*\/>/);
  assert.doesNotMatch(index, /BuiltWithIndustry|MethodField|IndustryTerritories|ProofField|ProgrammesField|ConversionField/);
  assert.equal((signal.match(/<h1\b/g) ?? []).length, 1, "Home must expose one H1");
  assert.match(signal, /aria-label="We turn industrial needs into field evidence\."/);
  assert.match(signal, /quantum-icon-white\.svg/);
  assert.match(signal, /data-signal-field/);
  assert.match(signal, /data-field-map-threshold/);
  assert.doesNotMatch(signal, /<canvas|<button|card/i);

  assert.match(signalController, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(signalController, /prefers-reduced-motion: reduce/);
  assert.match(signalController, /requestAnimationFrame\(write\)/);
  assert.match(signalController, /pointerleave|pointercancel/);
  assert.match(signalController, /visibilitychange/);
  assert.match(signalController, /pagehide/);
  assert.doesNotMatch(signalController, /setInterval|\.play\s*\(|scroll(?:To|By|IntoView)\s*\(|\.scrollTop\s*=/);

  assert.match(cinematic, /PHYSICAL_FRAME_COUNT = 500/);
  assert.match(cinematic, /BLACK_START_U = 500/);
  assert.match(cinematic, /ENTRY_START_U = 513/);
  assert.match(cinematic, /fieldMapThreshold/);
  assert.match(cinematic, /fieldMapTop/);
  assert.doesNotMatch(cinematic, /data-audience-routing|methodField|methodStages|homeOperatingField/);
  assert.doesNotMatch(cinematic, /(?:window\.)?scroll(?:To|By)\s*\(|scrollIntoView\s*\(|\.scrollTop\s*=/);

  assert.match(signalCss, /stroke-dashoffset:\s*1/);
  assert.match(signalCss, /data-manifesto-reveal="revealing"/);
  assert.match(signalCss, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(signalCss, /@keyframes|animation\s*:/);

  for (const href of FIELD_MAP_DESTINATIONS) {
    const present = href === "/#entry" ? header.includes("href: HOME_HREF") : header.includes(`href: "${href}"`);
    assert.ok(present, `Field Map is missing ${href}`);
  }
  assert.match(header, /<details class="field-map"/);
  assert.match(header, /<nav id="field-map-navigation"/);
  assert.match(header, /event\.key === "Escape"/);
  assert.match(header, /trigger\?\.focus\(\{ preventScroll: true \}\)/);

  assert.match(typography, /font-family:\s*"Anybody"/);
  assert.match(typography, /\.maradin-page\s*\{[\s\S]*?--font-display:\s*"Syne"/);
  assert.doesNotMatch(typography, /fonts\.googleapis|https?:\/\//);

  assert.match(attributes, /artifacts\/original\/phase-4r2-final-cinematic-production\/\*\* -text/);
  assert.match(attributes, /artifacts\/original\/phase-4r2-1-causal-signal-scroll-stability\/production\/\*\* -text/);
  assert.match(attributes, /artifacts\/reports\/phase-4r2\/\*\* -text/);
  assert.match(attributes, /artifacts\/original\/phase-7a-typography-candidates\/OFL-\*\.txt -text/);
  assert.match(attributes, /public\/fonts\/licenses\/OFL-\*\.txt -text/);

  const packageJson = JSON.parse(packageText);
  assert.deepEqual(Object.keys(packageJson.dependencies ?? {}), ["astro"], "no production runtime dependency may be added");
  assert.equal(packageJson.engines.node, "22.16.0");
  assert.equal(packageJson.scripts.build, "node scripts/run-phase7a-build.mjs");
  assert.match(packageJson.scripts.check, /verify-phase7a-environment\.mjs/);
  assert.match(packageJson.scripts.test, /phase7a-source\.test\.mjs/);

  return {
    schema: "quantum-hub.phase-7a.source-verification.v1",
    status: "PASS",
    branch,
    head,
    parent: PHASE7A_PARENT,
    main: localMain,
    originMain,
    physicalAssetCount: PHYSICAL_ASSETS.length,
    typographyAuthorityCount: TYPOGRAPHY_ASSETS.length,
    deletedProductionPathCount: DELETED_PRODUCTION_PATHS.length,
    maradinFrozen: true,
    runtimeDependenciesAdded: 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  console.log(JSON.stringify(await verifySource(), null, 2));
}
