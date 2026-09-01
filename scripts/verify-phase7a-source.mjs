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
  authorityProfileById,
  PHASE7A_PARENT,
  PHASE7A_R1_BRANCH,
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

function gitOptionalRef(root, ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: root, encoding: "utf8" });
  if (result.status === 0) return result.stdout.trim();
  if (result.status === 1) return null;
  throw new Error(result.stderr || `git rev-parse --verify --quiet ${ref}^{commit} failed`);
}

export function pagesHydrationArgs(isShallowRepository, authorityProfile = "phase7a") {
  const profile = authorityProfileById(authorityProfile);
  return [
    "fetch",
    "--no-tags",
    "--prune",
    ...(isShallowRepository ? ["--unshallow"] : []),
    "origin",
    "+refs/heads/main:refs/remotes/origin/main",
    `+refs/heads/${profile.branch}:refs/remotes/origin/${profile.branch}`,
  ];
}

function hydratePagesGitAuthority(root, head, profile) {
  const isShallowRepository = git(root, ["rev-parse", "--is-shallow-repository"]) === "true";
  git(root, pagesHydrationArgs(isShallowRepository, profile.id));
  const originMain = gitOptionalRef(root, "refs/remotes/origin/main");
  assert.equal(originMain, FROZEN_MAIN, "hydrated origin/main moved");
  git(root, ["merge-base", "--is-ancestor", head, `refs/remotes/origin/${profile.branch}`]);
  return originMain;
}

export function resolveGitAuthority({ localBranch, head, localMain, originMain, environment = process.env }, authorityProfile = "phase7a") {
  const profile = authorityProfileById(authorityProfile);
  const onCloudflarePages = environment.CF_PAGES === "1";
  const branch = localBranch || (onCloudflarePages ? environment.CF_PAGES_BRANCH ?? "" : "");

  assert.equal(branch, profile.branch, `wrong ${profile.id} branch`);
  if (onCloudflarePages) {
    assert.equal(environment.CF_PAGES_COMMIT_SHA, head, "Cloudflare Pages commit differs from checked-out HEAD");
  }

  for (const [label, value] of [["local main", localMain], ["origin/main", originMain]]) {
    if (value === null) {
      assert.equal(onCloudflarePages, true, `${label} is unavailable outside Cloudflare Pages`);
    } else {
      assert.equal(value, FROZEN_MAIN, `${label} moved`);
    }
  }

  return {
    branch,
    head,
    localMain,
    originMain,
    mainAuthorityMode: localMain !== null && originMain !== null ? "refs" : "cloudflare-pages-ancestry",
    authorityProfile: profile.id,
  };
}

export async function verifySource(root = process.cwd(), environment = process.env, authorityProfile = "phase7a") {
  const profile = authorityProfileById(authorityProfile);
  const read = (relative) => readFile(path.join(root, relative), "utf8");
  const localBranch = git(root, ["branch", "--show-current"]);
  const head = git(root, ["rev-parse", "HEAD"]);
  const localMain = gitOptionalRef(root, "refs/heads/main");
  let originMain = gitOptionalRef(root, "refs/remotes/origin/main");
  if (environment.CF_PAGES === "1") {
    resolveGitAuthority({ localBranch, head, localMain, originMain, environment }, profile.id);
    originMain = hydratePagesGitAuthority(root, head, profile);
  }
  const authority = resolveGitAuthority({ localBranch, head, localMain, originMain, environment }, profile.id);
  const { branch, mainAuthorityMode } = authority;
  const firstCommit = git(root, ["rev-list", "--reverse", `${profile.parent}..${head}`]).split(/\r?\n/)[0];
  const firstParent = firstCommit ? git(root, ["rev-parse", `${firstCommit}^`]) : "";
  const merges = git(root, ["rev-list", "--merges", `${profile.parent}..${head}`]);

  const directParentMessage = profile.id === "phase7a"
    ? "first Phase 7A commit must descend directly from accepted Phase 6"
    : "first Phase 7A-R1 commit must descend directly from the accepted Phase 7A parent";
  assert.equal(firstParent, profile.parent, directParentMessage);
  assert.equal(merges, "", `${profile.id} history must remain linear`);
  git(root, ["merge-base", "--is-ancestor", PHASE7A_PARENT, head]);
  if (profile.id === "phase7a-r1") {
    const deleted = git(root, ["diff", "--name-only", "--diff-filter=D", profile.parent, head]);
    assert.equal(deleted, "", "Phase 7A-R1 must not perform another demolition");
  }
  if (mainAuthorityMode === "cloudflare-pages-ancestry") {
    assert.equal(git(root, ["rev-parse", `${FROZEN_MAIN}^{commit}`]), FROZEN_MAIN, "frozen main commit is unavailable");
    git(root, ["merge-base", "--is-ancestor", FROZEN_MAIN, head]);
  }

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

  const maradinDiff = git(root, ["diff", "--name-only", profile.parent, "--", ...MARADIN_FROZEN_PATHS]);
  assert.equal(maradinDiff, "", "Maradin route, content, lifecycle, or media authority changed");

  const [index, layout, signal, signalController, cinematic, signalCss, header, navigationCss, typography, packageText, attributes] = await Promise.all([
    read("src/pages/index.astro"),
    read("src/layouts/BaseLayout.astro"),
    read("src/components/home/SignalThreshold.astro"),
    read("src/scripts/signal-field.ts"),
    read("src/scripts/home-cinematic-integration.ts"),
    read("src/styles/routes/phase-7a-signal-field.css"),
    read("src/components/SiteHeader.astro"),
    read("src/styles/navigation.css"),
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
  assert.match(signalCss, /font-stretch:\s*58%/);
  assert.match(signalCss, /font-stretch:\s*112%/);
  assert.match(signalCss, /transition:[\s\S]*?font-stretch 920ms/);
  assert.doesNotMatch(signalCss, /manifesto-field__content[\s\S]{0,180}?transform:\s*scaleX/);
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
  assert.match(header, /data-field-map-background/);
  assert.match(layout, /data-field-map-background/);
  assert.match(layout, /name="color-scheme" content="dark"/);
  assert.match(layout, /html,body\{background:#07090a\}/);
  assert.match(header, /region\.inert = true/);
  assert.match(header, /releaseBackground/);
  assert.match(header, /pagehide/);
  assert.match(header, /pageshow/);
  assert.match(header, /popstate/);
  assert.doesNotMatch(header, /aria-modal/);
  assert.match(
    navigationCss,
    /html\[data-field-map-open\] \.site-header,\s*\.site-header:has\(\.field-map\[open\]\)\s*\{[\s\S]*?backdrop-filter:\s*none/,
  );

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
    authorityProfile: profile.id,
    branch,
    head,
    parent: profile.parent,
    acceptedPhase6: PHASE7A_PARENT,
    main: localMain,
    originMain,
    frozenMain: FROZEN_MAIN,
    mainAuthorityMode,
    physicalAssetCount: PHYSICAL_ASSETS.length,
    typographyAuthorityCount: TYPOGRAPHY_ASSETS.length,
    deletedProductionPathCount: DELETED_PRODUCTION_PATHS.length,
    maradinFrozen: true,
    runtimeDependenciesAdded: 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  const profileFlag = process.argv.indexOf("--authority-profile");
  const activeBranch = process.env.CF_PAGES_BRANCH || git(process.cwd(), ["branch", "--show-current"]);
  const authorityProfile = profileFlag >= 0
    ? process.argv[profileFlag + 1]
    : activeBranch === PHASE7A_R1_BRANCH ? "phase7a-r1" : "phase7a";
  assert.ok(authorityProfile && !authorityProfile.startsWith("--"), "--authority-profile requires phase7a or phase7a-r1");
  console.log(JSON.stringify(await verifySource(process.cwd(), process.env, authorityProfile), null, 2));
}
