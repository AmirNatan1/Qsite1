import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PHASE7B_METHOD_STAGES } from "./phase7b-contract.mjs";
import { verifyOutput as verifyInheritedPhase7AOutput } from "./verify-phase7a-output.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

async function walk(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

export async function verifyPhase7BOutput(root = process.cwd()) {
  const inherited = await verifyInheritedPhase7AOutput(root);
  const dist = path.join(root, "dist");
  const home = await readFile(path.join(dist, "index.html"), "utf8");

  assert.equal((home.match(/data-operating-field(?:\s|>|=)/g) ?? []).length, 1, "one Operating Field must be emitted");
  assert.equal((home.match(/data-workpiece(?:\s|>|=)/g) ?? []).length, 1, "one persistent Workpiece must be emitted");
  assert.equal((home.match(/data-method-stage=/g) ?? []).length, PHASE7B_METHOD_STAGES.length, "five METHOD stages must be emitted");
  const stageOrder = [...home.matchAll(/data-method-stage="([^"]+)"/g)].map((match) => match[1].toUpperCase());
  assert.deepEqual(stageOrder, PHASE7B_METHOD_STAGES, "built METHOD stage order differs");
  assert.equal((home.match(/data-method-static=/g) ?? []).length, PHASE7B_METHOD_STAGES.length, "five static METHOD compositions must be emitted");
  assert.match(home, /One workpiece changes state\./i);
  assert.doesNotMatch(home, /MethodField|home-operating-field|home-method\.css|role="(?:application|dialog|menu|listbox|tree|grid)"/i);

  const files = await walk(dist);
  const scripts = files.filter((filename) => /\.m?js$/i.test(filename));
  const styles = files.filter((filename) => /\.css$/i.test(filename));
  const scriptBytes = (await Promise.all(scripts.map((filename) => stat(filename)))).reduce((sum, info) => sum + info.size, 0);
  const styleBytes = (await Promise.all(styles.map((filename) => stat(filename)))).reduce((sum, info) => sum + info.size, 0);
  const runtime = (await Promise.all([...scripts, ...styles].map((filename) => readFile(filename, "utf8")))).join("\n");
  assert.doesNotMatch(runtime, /(?:lenis|locomotive|ScrollSmoother|ScrollTrigger|GSAP|scrollIntoView|scrollTo\()/i);
  const inventory = await Promise.all(files.map(async (filename) => ({
    path: path.relative(dist, filename).replaceAll("\\", "/"),
    bytes: (await stat(filename)).size,
  })));

  return {
    schema: "quantum-hub.phase-7b.output-verification.v1",
    status: "PASS",
    inheritedPhase7AStatus: inherited.status,
    methodStages: [...PHASE7B_METHOD_STAGES],
    workpieces: 1,
    staticCompositions: PHASE7B_METHOD_STAGES.length,
    outputBytes: {
      js: scriptBytes,
      css: styleBytes,
      total: inherited.bytes.total,
    },
    inventorySha256: createHash("sha256").update(JSON.stringify(inventory)).digest("hex"),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  console.log(JSON.stringify(await verifyPhase7BOutput(), null, 2));
}
