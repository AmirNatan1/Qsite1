import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const env = { ...process.env, PHASE4R2_FINAL_AUTHORITY: "1" };
const steps = [
  ["scripts/verify-phase7a-environment.mjs"],
  ["scripts/stage-phase4-media.mjs"],
  ["scripts/stage-phase4r2-runtime-media.mjs"],
  ["scripts/verify-phase7c-source.mjs"],
  ["node_modules/astro/bin/astro.mjs", "build"],
  ["scripts/verify-phase7c-output.mjs"],
];

for (const [script, ...args] of steps) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
