import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseArguments, selfTest } from "../scripts/audit-phase7a-installed-chrome-zoom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("installed Chrome zoom contract requires native 200% UI authority", () => {
  assert.deepEqual(selfTest(), {
    schema: "quantum-hub.phase-7a.installed-chrome-native-zoom.v1",
    status: "PASS",
    routes: 10,
    method: "installed Chrome native browser zoom",
  });
});

test("installed Chrome zoom contract rejects substitutes and repository output", () => {
  const base = ["--base-url", "http://127.0.0.1:4322/", "--baseline-width", "1388", "--baseline-dpr", "2.5", "--output", path.resolve(ROOT, "..", "phase7a-zoom")];
  assert.throws(() => parseArguments([...base, "--ui-zoom-label", "Zoom: 175%"]), /Zoom: 200%/);
  assert.throws(() => parseArguments([...base.slice(0, 6), "--output", path.join(ROOT, "zoom"), "--ui-zoom-label", "Zoom: 200%"]), /external/);
  assert.throws(() => parseArguments([...base, "--ui-zoom-label", "Zoom: 200%", "--cdp-url", "https://example.com"]), /loopback/);
});

