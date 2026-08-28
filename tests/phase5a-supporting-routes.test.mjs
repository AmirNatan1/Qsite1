import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = process.cwd();
const ACCEPTED = "47a6f3cc7f464b09c9c143cac273c2a1f5a35bfa";
const ROUTES = [
  "src/pages/for-partners.astro",
  "src/pages/for-startups.astro",
  "src/pages/industries.astro",
  "src/pages/pocs.astro",
  "src/pages/pocs/maradin.astro",
  "src/pages/spark.astro",
  "src/pages/about.astro",
  "src/pages/contact.astro",
  "src/pages/404.astro",
];
const FROZEN_SUPPORTING_FILES = [
  ...ROUTES,
  "src/styles/routes/standard.css",
  "src/styles/routes/proof.css",
  "src/styles/routes/not-found.css",
  "src/components/PageHero.astro",
  "src/components/ProcessList.astro",
  "src/components/ClosingCta.astro",
  "src/content/industries.ts",
  "src/content/proofs.ts",
  "src/content/programmes.ts",
  "src/content/collections.ts",
];

function gitShow(relative) {
  const result = spawnSync("git", ["show", `${ACCEPTED}:${relative}`], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `could not read ${relative} at accepted SHA`);
  return result.stdout;
}

function read(relative) {
  return readFileSync(path.join(ROOT, ...relative.split("/")), "utf8");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(candidate) : [candidate];
  });
}

test("Phase 5A leaves publication-safe supporting-route source byte-identical to accepted Phase 4", () => {
  for (const relative of FROZEN_SUPPORTING_FILES) assert.equal(read(relative), gitShow(relative), relative);
});

test("supporting routes contain no cinematic replay, runway, speculative prototype, or unauthorized contact surface", () => {
  const combined = ROUTES.map(read).join("\n");
  assert.doesNotMatch(combined, /cinematic|phase-4r2|proving hall|WHERE DO YOU ENTER|data-cinematic|scroll-snap|position:\s*sticky/i);
  assert.doesNotMatch(
    combined,
    /<form\b|href\s*=\s*["'](?:mailto:|tel:)|response time|join (?:the )?waitlist/i,
  );
  assert.doesNotMatch(combined, /defen[cs]e|dual[- ]use/i);
  assert.match(read("src/pages/contact.astro"), /contactDestination !== null/);
  assert.match(read("src/pages/404.astro"), /noindex/);
});

test("public inventories remain exactly four industries, one proof, closed SPARK, and empty unverified collections", () => {
  const industries = read("src/content/industries.ts");
  for (const name of ["Automotive & Mobility", "Logistics & Supply Chain", "Industry 4.0 / Advanced Manufacturing", "Energy & Infrastructure"]) assert.match(industries, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(industries, /PUBLIC_INDUSTRIES\.length !== 4/);
  assert.match(read("src/content/proofs.ts"), /publicProofRecords = Object\.freeze\(\[maradinProofRecord\]/);
  assert.match(read("src/content/programmes.ts"), /status: "Applications closed"/);
  assert.match(read("src/content/programmes.ts"), /applicationOpen: false/);
  const collections = read("src/content/collections.ts");
  for (const collection of ["publicPartners", "publicTeamMembers", "publicUpdates", "publicMetrics"]) assert.match(collections, new RegExp(`${collection} = filterPublicRecords\\([^,]+, \\[\\]\\)`));
  assert.match(collections, /contactDestination: ContactDestination \| null = null/);
});

test("speculative Phase 5A prototype canary cannot leak into production source, public assets, or built route configuration", () => {
  const productionRoots = ["src", "public"].flatMap((relative) => walk(path.join(ROOT, relative)));
  const productionText = productionRoots.filter((file) => !/\.(?:png|jpe?g|mp4|woff2)$/i.test(file)).map((file) => readFileSync(file, "utf8")).join("\n");
  const configuration = ["astro.config.mjs", "package.json"].map(read).join("\n");
  assert.doesNotMatch(`${productionText}\n${configuration}`, /QH_PHASE5A_ROUTE_LAB_ONLY|phase-5a-supporting-routes/);
});
