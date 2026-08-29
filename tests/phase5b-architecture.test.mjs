import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ACCEPTED_PHASE5AR, FROZEN_MAIN, PHASE5B_HUMAN_GATES, PHASE5B_ROUTES, RESPONSIVE_MATRIX } from "../scripts/phase5b-route-contract.mjs";
import { parseArguments, summarize } from "../scripts/measure-phase5b-long-task-baseline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

test("Phase 5B route contract freezes authority, nine routes, budgets and six pending gates", () => {
  assert.equal(ACCEPTED_PHASE5AR, "b6a9d4f6e05412dfd460a657edfd8be4ce7eef2c");
  assert.equal(FROZEN_MAIN, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(PHASE5B_ROUTES.length, 9);
  assert.equal(new Set(PHASE5B_ROUTES.map((route) => route.path)).size, 9);
  assert.equal(RESPONSIVE_MATRIX.length, 13);
  assert.equal(PHASE5B_HUMAN_GATES.length, 6);
  assert.deepEqual(PHASE5B_ROUTES.filter((route) => route.jsBudget === 0).map((route) => route.id), ["contact", "404"]);
});

test("shared production primitives do not impose a universal route skeleton", async () => {
  const architecture = await read("docs/planning/PHASE_5B_IMPLEMENTATION_ARCHITECTURE.md");
  const foundations = await read("src/styles/routes/production-foundations.css");
  const componentFiles = [
    "src/components/routes/shared/RouteKicker.astro",
    "src/components/routes/shared/RouteLink.astro",
    "src/components/routes/shared/EditorialFigure.astro",
    "src/components/routes/shared/BoundedReveal.astro",
  ];
  assert.match(architecture, /No component receives route data/i);
  assert.match(architecture, /no `SupportingRoute\.astro`/);
  assert.doesNotMatch(foundations, /route-(?:hero|overture|chapter|ending|panel|section)/i);
  assert.doesNotMatch(foundations, /\.route-shell|--route-(?:inline|measure)/i);
  for (const file of componentFiles) assert.doesNotMatch(await read(file), /routeData|chapterSequence|SupportingRoute/);
});

test("legacy Phase 4 verification permits only the explicit Phase 5B route surface", async () => {
  const verifier = await read("scripts/verify-phase4-source.mjs");
  const packageManifest = JSON.parse(await read("package.json"));
  assert.match(packageManifest.scripts.check, /verify-phase4-source\.mjs --allow-phase5b-route-scope/);
  assert.match(verifier, /PHASE5B_ROUTE_SCOPE_ALLOWED/);
  assert.match(verifier, /src\\\/components\\\/routes/);
  assert.match(verifier, /src\\\/pages\\\/pocs/);
  assert.doesNotMatch(verifier, /PHASE5B_ROUTE_PRODUCTION_CHANGES[\s\S]{0,150}\^src\\\/\.\*/);
});

test("bounded observer is one-shot and contains no scroll loop or scroll writes", async () => {
  const source = await read("src/scripts/routes/bounded-reveal.ts");
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /observer\.unobserve/);
  assert.doesNotMatch(source, /requestAnimationFrame|addEventListener\(["'](?:scroll|wheel)|scrollTo|scrollBy/);
});

test("long-task baseline parser and summary are deterministic", () => {
  const parsed = parseArguments(["--base-url", "http://127.0.0.1:4334", "--iterations", "2", "--timeout-ms", "5000"]);
  assert.equal(parsed.baseUrl, "http://127.0.0.1:4334/");
  assert.equal(parsed.expectedHead, "b6a9d4f6e05412dfd460a657edfd8be4ce7eef2c");
  assert.equal(parsed.iterations, 2);
  const samples = [
    { id: "blank-control", maxLongTaskMs: 0, mediaRequests: [] },
    { id: "blank-control", maxLongTaskMs: 51, mediaRequests: [] },
  ];
  const row = summarize(samples)[0];
  assert.deepEqual(row, { id: "blank-control", iterations: 2, maxLongTaskMs: 51, medianMaxLongTaskMs: 51, samplesOver50Ms: 1, totalMediaRequests: 0 });
  const missing = summarize([])[0];
  assert.deepEqual(missing, { id: "blank-control", iterations: 0, maxLongTaskMs: null, medianMaxLongTaskMs: null, samplesOver50Ms: 0, totalMediaRequests: 0 });
});
