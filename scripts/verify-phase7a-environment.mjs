import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REQUIRED_NODE } from "./phase7a-contract.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export async function verifyEnvironment(root = process.cwd(), version = process.versions.node) {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const nvmrc = (await readFile(path.join(root, ".nvmrc"), "utf8")).trim();
  assert.equal(version, REQUIRED_NODE, `Phase 7A requires exact Node ${REQUIRED_NODE}; observed ${version}`);
  assert.equal(nvmrc, REQUIRED_NODE, ".nvmrc must bind the exact Phase 7A Node version");
  assert.equal(packageJson.engines?.node, REQUIRED_NODE, "package.json engines.node must be exact");
  return { schema: "quantum-hub.phase-7a.environment.v1", status: "PASS", node: version, nvmrc, engine: packageJson.engines.node };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  console.log(JSON.stringify(await verifyEnvironment(), null, 2));
}

