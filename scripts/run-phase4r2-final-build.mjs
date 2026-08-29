import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const node = process.execPath;
const env = { ...process.env, PHASE4R2_FINAL_AUTHORITY: "1" };
const steps = [
  ["scripts/stage-phase4-media.mjs"],
  ["scripts/stage-phase4r2-runtime-media.mjs"],
  ["node_modules/astro/bin/astro.mjs", "build"],
  ["scripts/verify-phase4-output.mjs", "--allow-phase5b-route-scope"],
  ["scripts/verify-phase5b-production.mjs"],
];

for (const args of steps) {
  const result = spawnSync(node, [path.join(ROOT, args[0]), ...args.slice(1)], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
