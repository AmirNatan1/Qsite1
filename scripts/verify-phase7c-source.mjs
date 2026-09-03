import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PHASE7C_BRANCH,
  PHASE7C_DOCUMENTARY_ASSET,
  PHASE7C_FROZEN_MAIN,
  PHASE7C_FROZEN_PHASE7B_BLOBS,
  PHASE7C_FROZEN_PHASE7B_PATHS,
  PHASE7C_GATES,
  PHASE7C_INDUSTRIES,
  PHASE7C_PARENT,
  PHASE7C_PERFORMANCE_BUDGET,
  PHASE7C_PRODUCTION_PATHS,
  PHASE7C_PROOF_RECORD,
  PHASE7C_REQUIRED_NODE,
  PHASE7C_REVIEW_ZIP_NAME,
} from "./phase7c-contract.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const INDEX_COMPONENT_IMPORT = 'import TerritoryProofThreshold from "../components/home/TerritoryProofThreshold.astro";';
const INDEX_STYLE_IMPORT = 'import "../styles/routes/phase-7c-territory-proof.css";';
const INDEX_MOUNT = "    <TerritoryProofThreshold />";
const POSTER_PUBLIC_URL = `/${PHASE7C_DOCUMENTARY_ASSET.path.replace(/^public\//, "")}`;

const PHASE7C_COMPONENT = "src/components/home/TerritoryProofThreshold.astro";
const PHASE7C_CONTROLLER = "src/scripts/territory-traverse.ts";
const PHASE7C_STATE_MODEL = "src/scripts/territory-traverse-state.mjs";
const PHASE7C_CSS = "src/styles/routes/phase-7c-territory-proof.css";

const PROHIBITED_SOURCE_PATTERNS = Object.freeze([
  Object.freeze([/\b(?:setTimeout|setInterval)\s*\(/i, "time-based timer"]),
  Object.freeze([/\b(?:scrollTo|scrollBy|scrollIntoView)\s*\(/i, "programmatic scroll"]),
  Object.freeze([/(?:window|document|globalThis)\.scroll\s*\(/i, "programmatic window scroll"]),
  Object.freeze([/\.scroll(?:Top|Left)\s*=/i, "scroll-position write"]),
  Object.freeze([/\.preventDefault\s*\(/i, "input cancellation"]),
  Object.freeze([/addEventListener\s*\(\s*["'](?:wheel|touchmove)["']/i, "wheel/touch interception"]),
  Object.freeze([/\b(?:Lenis|Locomotive|ScrollSmoother|ScrollTrigger|GSAP)\b/i, "custom scroll or animation runtime"]),
  Object.freeze([/\b(?:WebGL|THREE|Three\.js)\b/i, "3D runtime"]),
  Object.freeze([/<(?:video|audio|source)\b/i, "inline media element"]),
  Object.freeze([/\b(?:MediaSource|HTMLMediaElement|getUserMedia)\b/i, "media/player API"]),
  Object.freeze([/\bURL\.(?:createObjectURL|revokeObjectURL)\s*\(/i, "Blob URL API"]),
  Object.freeze([/\bnew\s+Blob\s*\(/i, "Blob media source"]),
  Object.freeze([/\.(?:play|pause)\s*\(/i, "media playback API"]),
  Object.freeze([/\bsrcObject\b/i, "media stream source"]),
]);

function command(root, args, options = {}) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
}

function git(root, args) {
  const result = command(root, args);
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function gitRaw(root, args) {
  const result = command(root, args);
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout;
}

function occurrences(source, token) {
  return source.split(token).length - 1;
}

function normalizedPath(value) {
  return value.replaceAll("\\", "/");
}

function splitLines(value) {
  return value.split(/\r?\n/).filter(Boolean).map(normalizedPath);
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

async function sha256(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

export function canonicalSourceBytes(source) {
  return Buffer.byteLength(source.replace(/\r\n?/g, "\n"));
}

export function assertProductionPathAllowlist(actualPaths, { requireComplete = true } = {}) {
  const actual = [...new Set(actualPaths.map(normalizedPath))].sort();
  const allowed = [...PHASE7C_PRODUCTION_PATHS].sort();
  const unexpected = actual.filter((relative) => !allowed.includes(relative));
  assert.deepEqual(unexpected, [], `production paths escaped the Phase 7C allowlist: ${unexpected.join(", ")}`);
  if (requireComplete) assert.deepEqual(actual, allowed, "Phase 7C production-source boundary differs");
  return actual;
}

export function assertAdditiveIndexContract(indexSource, acceptedParentSource) {
  assert.equal(occurrences(indexSource, INDEX_COMPONENT_IMPORT), 1, "homepage requires one Phase 7C component import");
  assert.equal(occurrences(indexSource, INDEX_STYLE_IMPORT), 1, "homepage requires one Phase 7C style import");
  assert.equal(occurrences(indexSource, INDEX_MOUNT), 1, "homepage requires one Territory Proof mount");

  const operating = indexSource.indexOf("    <OperatingField />");
  const territory = indexSource.indexOf(INDEX_MOUNT);
  const inertBootstrap = indexSource.indexOf("    <script is:inline>", territory);
  assert.ok(operating >= 0 && operating < territory, "Territory Proof must follow the accepted Operating Field");
  assert.ok(territory < inertBootstrap, "Territory Proof must precede the cinematic inert bootstrap");

  const normalized = indexSource.replace(/\r\n?/g, "\n");
  const stripped = normalized
    .replace(`${INDEX_COMPONENT_IMPORT}\n`, "")
    .replace(`${INDEX_STYLE_IMPORT}\n`, "")
    .replace(`\n${INDEX_MOUNT}\n`, "");
  assert.equal(
    stripped,
    acceptedParentSource.replace(/\r\n?/g, "\n"),
    "index.astro contains a change beyond the three authorized Phase 7C additions",
  );
}

export function assertNoProhibitedPhase7CSource(source, label = "Phase 7C source") {
  for (const [pattern, description] of PROHIBITED_SOURCE_PATTERNS) {
    assert.doesNotMatch(source, pattern, `${label} contains prohibited ${description}`);
  }
}

export function assertPhase7CComponentContract(componentSource) {
  assert.match(componentSource, /<section[\s\S]*?data-territory-traverse[\s\S]*?data-field-section/);
  assert.equal((componentSource.match(/<h1\b/g) ?? []).length, 0, "Phase 7C must not add an H1");
  assert.equal((componentSource.match(/<h2\b/g) ?? []).length, 1, "Phase 7C requires one chapter H2");
  assert.equal((componentSource.match(/<h3\b/g) ?? []).length, 5, "four territories and Proof require five H3s");
  assert.match(componentSource, /One carrier\. Four operating conditions\./);
  assert.match(componentSource, /PUBLIC_INDUSTRIES/);
  assert.match(componentSource, /maradinProofRecord/);

  const semanticStages = [...componentSource.matchAll(/data-territory-stage=["']([^"']+)["']/g)]
    .map((match) => match[1]);
  assert.deepEqual(
    semanticStages,
    ["automotive", "logistics", "manufacturing", "energy", "proof"],
    "territory and Proof semantic order differs",
  );
  assert.equal((componentSource.match(/data-industry-id=/g) ?? []).length, PHASE7C_INDUSTRIES.length);
  assert.equal((componentSource.match(/data-territory-passage\b/g) ?? []).length, PHASE7C_INDUSTRIES.length);
  assert.equal((componentSource.match(/data-territory-title(?=[\s>])/g) ?? []).length, PHASE7C_INDUSTRIES.length);
  assert.equal((componentSource.match(/data-territory-static=/g) ?? []).length, PHASE7C_INDUSTRIES.length);
  assert.equal(occurrences(componentSource, "data-territory-carrier"), 1, "one permanent carrier source token is required");
  assert.match(componentSource, /<path[\s\S]*?data-territory-carrier[\s\S]*?<\/svg>/);
  assert.match(componentSource, /data-territory-track/);
  assert.match(componentSource, /focusable="false"/);

  assert.equal(occurrences(componentSource, POSTER_PUBLIC_URL), 1, "the accepted poster must be referenced exactly once");
  assert.equal((componentSource.match(/<img\b/g) ?? []).length, 1, "Proof must contain exactly one documentary image");
  assert.match(componentSource, /src=\{proofPoster\.src\}/);
  assert.match(componentSource, /width=\{proofPoster\.width\}/);
  assert.match(componentSource, /height=\{proofPoster\.height\}/);
  assert.match(componentSource, /loading="lazy"/);
  assert.match(componentSource, /data-proof-record="maradin"/);
  assert.equal(occurrences(componentSource, "data-proof-title"), 1, "Proof requires one stable title identifier");
  assert.equal((componentSource.match(/<a\b/g) ?? []).length, 1, "Phase 7C adds only the Maradin record link");
  assert.match(componentSource, /<a[^>]+href="\/pocs\/maradin\/"/);
  assert.match(componentSource, /initTerritoryTraverse/);
  assert.doesNotMatch(componentSource, /role="(?:application|dialog|menu|menubar|listbox|tree|grid)"/i);
  assertNoProhibitedPhase7CSource(componentSource, PHASE7C_COMPONENT);
}

export function assertPhase7CRuntimeContract({ controllerSource, stateSource, cssSource = "" }) {
  assert.match(stateSource, /projectTerritoryProgress/);
  assert.match(controllerSource, /projectTerritoryProgress/);
  assert.match(controllerSource, /AbortController/);
  assert.match(controllerSource, /addEventListener\("scroll",\s*schedule,\s*\{\s*passive:\s*true/);
  assert.equal((controllerSource.match(/requestAnimationFrame\s*\(/g) ?? []).length, 1, "controller requires one bounded RAF call site");
  assert.match(controllerSource, /frame\s*=\s*window\.requestAnimationFrame\(render\)/);
  const renderBody = controllerSource.match(/const render\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};\n\n\s*const schedule/);
  assert.ok(renderBody, "controller must expose one bounded render body before its scheduler");
  assert.doesNotMatch(renderBody[1], /\bschedule\s*\(/, "render must not recursively schedule a perpetual RAF");
  assert.match(controllerSource, /visibilitychange/);
  assert.match(controllerSource, /pagehide/);
  assert.match(controllerSource, /pageshow/);
  assert.match(controllerSource, /prefers-reduced-motion:\s*reduce/);
  assert.equal((controllerSource.match(/addEventListener\("scroll"/g) ?? []).length, 1, "Phase 7C adds one scroll listener");
  assert.doesNotMatch(controllerSource, /\b(?:Resize|Intersection|Mutation)Observer\b/);

  assertNoProhibitedPhase7CSource(controllerSource, PHASE7C_CONTROLLER);
  assertNoProhibitedPhase7CSource(stateSource, PHASE7C_STATE_MODEL);
  if (cssSource) {
    assert.match(cssSource, /\.territory-world/);
    assert.match(cssSource, /data-territory-mode=["']enhanced["']/);
    assert.match(cssSource, /prefers-reduced-motion:\s*reduce/);
    assert.match(cssSource, /\.home-page\s+\.site-footer\s+nav\s+a\s*\{[^}]*min-width:44px/);
    assert.match(cssSource, /\.territory-passage--energy\s+\.territory-passage__copy\s*>\s*p:last-child\s*\{[^}]*margin-top:clamp\(5rem,12vh,7rem\)/);
    assert.match(
      cssSource,
      /\.territory-passage__coordinate[^{}]*\.territory-proof__eyebrow\s*\{[^}]*color:rgba\(208,217,215,\.75\)/,
      "territory coordinate labels must retain the audited worst-case contrast color",
    );
    assert.doesNotMatch(cssSource, /scroll-snap|scroll-behavior|overflow-y:\s*(?:auto|scroll)/i);
    assert.doesNotMatch(cssSource, /@keyframes|\banimation(?:-name|-timeline)?\s*:/i);
    assert.doesNotMatch(cssSource, /\.operating-field|\.signal-threshold|\.field-map-threshold|\.site-header/);
    assertNoProhibitedPhase7CSource(cssSource, PHASE7C_CSS);
  }

  assert.ok(
    canonicalSourceBytes(controllerSource) + canonicalSourceBytes(stateSource)
      <= PHASE7C_PERFORMANCE_BUDGET.rawControllerAndStateMaximum,
    `raw Phase 7C controller and state exceed ${PHASE7C_PERFORMANCE_BUDGET.rawControllerAndStateMaximum} bytes`,
  );
  if (cssSource) {
    assert.ok(
      canonicalSourceBytes(cssSource) <= PHASE7C_PERFORMANCE_BUDGET.rawCssMaximum,
      `raw Phase 7C CSS exceeds ${PHASE7C_PERFORMANCE_BUDGET.rawCssMaximum} bytes`,
    );
  }
}

export function assertUnchangedDependencies(packageSource, acceptedParentPackageSource) {
  const current = JSON.parse(packageSource);
  const accepted = JSON.parse(acceptedParentPackageSource);
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "overrides"]) {
    assert.deepEqual(current[field] ?? {}, accepted[field] ?? {}, `${field} changed from the accepted Phase 7B parent`);
  }
  assert.equal(current.engines?.node, PHASE7C_REQUIRED_NODE);
}

function workingProductionPaths(root) {
  const tracked = splitLines(git(root, ["diff", "--name-only", PHASE7C_PARENT, "--", "src", "public"]));
  const untracked = splitLines(git(root, ["ls-files", "--others", "--exclude-standard", "--", "src", "public"]));
  return [...new Set([...tracked, ...untracked])].sort();
}

export async function verifyPhase7CSource(
  root = process.cwd(),
  environment = process.env,
  { allowUncommitted = false } = {},
) {
  const read = (relative) => readFile(path.join(root, relative), "utf8");
  const head = git(root, ["rev-parse", "HEAD"]);
  const localBranch = git(root, ["branch", "--show-current"]);
  const branch = localBranch || (environment.CF_PAGES === "1" ? environment.CF_PAGES_BRANCH ?? "" : "");
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);

  assert.equal(branch, PHASE7C_BRANCH, "wrong Phase 7C branch");
  if (!allowUncommitted) assert.equal(status, "", "Phase 7C source verification requires a clean worktree");
  assert.equal(
    command(root, ["merge-base", "--is-ancestor", PHASE7C_PARENT, head]).status,
    0,
    "accepted Phase 7B parent is not an ancestor of HEAD",
  );

  const commits = splitLines(git(root, ["rev-list", "--reverse", `${PHASE7C_PARENT}..${head}`]));
  if (commits.length === 0) {
    assert.ok(allowUncommitted && head === PHASE7C_PARENT, "Phase 7C history does not begin at its exact parent");
  } else {
    assert.equal(
      git(root, ["rev-parse", `${commits[0]}^`]),
      PHASE7C_PARENT,
      "first Phase 7C commit must descend directly from accepted Phase 7B",
    );
  }
  assert.equal(git(root, ["rev-list", "--merges", `${PHASE7C_PARENT}..${head}`]), "", "Phase 7C history must remain linear");

  const localMain = git(root, ["rev-parse", "main"]);
  const originMain = git(root, ["rev-parse", "origin/main"]);
  assert.equal(localMain, PHASE7C_FROZEN_MAIN, "local main moved");
  assert.equal(originMain, PHASE7C_FROZEN_MAIN, "origin/main moved");
  assert.equal(process.versions.node, PHASE7C_REQUIRED_NODE, "Phase 7C source verification requires exact Node 22.16.0");

  for (const relative of PHASE7C_FROZEN_PHASE7B_PATHS) {
    assert.equal(
      git(root, ["rev-parse", `${PHASE7C_PARENT}:${relative}`]),
      PHASE7C_FROZEN_PHASE7B_BLOBS[relative],
      `${relative} accepted-parent blob authority differs`,
    );
    assert.equal(
      git(root, ["hash-object", "--", relative]),
      PHASE7C_FROZEN_PHASE7B_BLOBS[relative],
      `${relative} changed from its accepted Phase 7B blob`,
    );
  }

  const productionPaths = assertProductionPathAllowlist(workingProductionPaths(root));
  const [
    indexSource,
    acceptedIndexSource,
    componentSource,
    controllerSource,
    stateSource,
    cssSource,
    packageSource,
    acceptedPackageSource,
  ] = await Promise.all([
    read("src/pages/index.astro"),
    Promise.resolve(gitRaw(root, ["show", `${PHASE7C_PARENT}:src/pages/index.astro`])),
    read(PHASE7C_COMPONENT),
    read(PHASE7C_CONTROLLER),
    read(PHASE7C_STATE_MODEL),
    read(PHASE7C_CSS),
    read("package.json"),
    Promise.resolve(gitRaw(root, ["show", `${PHASE7C_PARENT}:package.json`])),
  ]);

  assertAdditiveIndexContract(indexSource, acceptedIndexSource);
  assertPhase7CComponentContract(componentSource);
  assertPhase7CRuntimeContract({ controllerSource, stateSource, cssSource });
  assertUnchangedDependencies(packageSource, acceptedPackageSource);

  const productionBundle = [componentSource, controllerSource, stateSource, cssSource].join("\n");
  assert.equal(
    occurrences(productionBundle, POSTER_PUBLIC_URL),
    1,
    "the complete Phase 7C source must reference the accepted poster exactly once",
  );
  assert.doesNotMatch(productionBundle, /<(?:video|audio|source)\b|\.(?:play|pause)\s*\(/i);

  const documentaryPath = path.join(root, PHASE7C_DOCUMENTARY_ASSET.path);
  assert.equal(await exists(documentaryPath), true, "accepted documentary poster is missing");
  const documentaryStat = await stat(documentaryPath);
  assert.equal(documentaryStat.size, PHASE7C_DOCUMENTARY_ASSET.bytes, "accepted documentary poster byte size changed");
  assert.equal(await sha256(documentaryPath), PHASE7C_DOCUMENTARY_ASSET.sha256, "accepted documentary poster hash changed");

  return {
    schema: "quantum-hub.phase-7c.source-verification.v1",
    status: "PASS",
    branch,
    head,
    parent: PHASE7C_PARENT,
    firstCommit: commits[0] ?? null,
    localMain,
    originMain,
    mergeCount: 0,
    worktree: status === "" ? "clean" : "authorized-uncommitted",
    productionPaths,
    frozenPhase7BBlobs: { ...PHASE7C_FROZEN_PHASE7B_BLOBS },
    industries: [...PHASE7C_INDUSTRIES],
    proofRecord: PHASE7C_PROOF_RECORD,
    documentaryAsset: { ...PHASE7C_DOCUMENTARY_ASSET },
    runtimeDependenciesAdded: 0,
    runtimeAssetsAdded: 0,
    humanGates: PHASE7C_GATES.map((name) => ({ name, decision: "PENDING HUMAN REVIEW" })),
    reviewZipName: PHASE7C_REVIEW_ZIP_NAME,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  const allowUncommitted = process.argv.slice(2).includes("--allow-uncommitted");
  console.log(JSON.stringify(await verifyPhase7CSource(process.cwd(), process.env, { allowUncommitted }), null, 2));
}
