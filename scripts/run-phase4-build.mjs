import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const AUTHORITY_ROOT = path.join(ROOT, "artifacts", "original", "phase-4r2-1-causal-signal-scroll-stability", "production");
export const AUTHORITY_MANIFEST = path.join(AUTHORITY_ROOT, "manifests", "phase-4r2-production-media-manifest.json");

async function pathExists(absolute) {
  try {
    await stat(absolute);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

// Once CP3 materializes any part of the tracked active R2.1 authority, a normal Pages
// build must not quietly regress to the development fallback. The final
// stager then validates the manifest and fails closed if it is incomplete.
export async function resolveBuildMode(exists = pathExists) {
  return (await exists(AUTHORITY_ROOT)) || (await exists(AUTHORITY_MANIFEST)) ? "final" : "development";
}

function runNode(script, args = [], env = process.env) {
  const result = spawnSync(process.execPath, [path.join(ROOT, script), ...args], { cwd: ROOT, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export async function runBuild({ resolveMode = resolveBuildMode, run = runNode } = {}) {
  const mode = await resolveMode();
  if (mode === "final") {
    run("scripts/run-phase4r2-final-build.mjs");
    return mode;
  }
  run("scripts/stage-phase4-media.mjs");
  run("scripts/stage-phase4r2-runtime-media.mjs");
  run("node_modules/astro/bin/astro.mjs", ["build"]);
  run("scripts/verify-phase4-output.mjs");
  return mode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) await runBuild();
