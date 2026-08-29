import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const SUPPORTING_PAGES = [
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
const PUBLIC_INDUSTRIES = [
  "Automotive & Mobility",
  "Logistics & Supply Chain",
  "Industry 4.0 / Advanced Manufacturing",
  "Energy & Infrastructure",
];

function read(relative) {
  return readFileSync(path.join(ROOT, ...relative.split("/")), "utf8");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(candidate) : [candidate];
  });
}

function routeSource() {
  return [
    ...SUPPORTING_PAGES.map((relative) => path.join(ROOT, relative)),
    ...walk(path.join(ROOT, "src/components/routes")),
  ].filter((file) => /\.(?:astro|ts)$/.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

test("Phase 5B retains the deny-by-default supporting-route publication boundary", () => {
  const combined = routeSource();
  assert.doesNotMatch(combined, /proving hall|WHERE DO YOU ENTER|data-cinematic|scroll-snap|position:\s*sticky/i);
  assert.doesNotMatch(combined, /<form\b|href\s*=\s*["'](?:mailto:|tel:)|response time|join (?:the )?waitlist/i);
  assert.doesNotMatch(combined, /defen[cs]e|dual[- ]use/i);
  assert.doesNotMatch(combined, /guaranteed (?:access|pilot|poc|customer|investment)|commercial success|mass production|confidential results?/i);
  assert.match(read("src/pages/contact.astro"), /contactDestination !== null/);
  assert.match(read("src/pages/404.astro"), /noindex/);
});

test("public inventories remain exactly four industries, one proof, closed SPARK, and no unverified people or endpoints", () => {
  const industries = read("src/content/industries.ts");
  for (const name of PUBLIC_INDUSTRIES) {
    assert.match(industries, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(industries, /PUBLIC_INDUSTRIES\.length !== 4/);
  assert.match(read("src/content/proofs.ts"), /publicProofRecords = Object\.freeze\(\[maradinProofRecord\]/);
  const programmes = read("src/content/programmes.ts");
  assert.match(programmes, /status: "Applications closed"/);
  assert.match(programmes, /applicationOpen: false/);
  const collections = read("src/content/collections.ts");
  for (const collection of ["publicPartners", "publicTeamMembers", "publicUpdates", "publicMetrics"]) {
    assert.match(collections, new RegExp(`${collection} = filterPublicRecords\\([^,]+, \\[\\]\\)`));
  }
  assert.match(collections, /contactDestination: ContactDestination \| null = null/);
});

test("speculative route labs and preproduction canaries cannot leak into public source or configuration", () => {
  const productionRoots = ["src", "public"].flatMap((relative) => walk(path.join(ROOT, relative)));
  const productionText = productionRoots
    .filter((file) => !/\.(?:png|jpe?g|mp4|woff2)$/i.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const configuration = ["astro.config.mjs", "package.json"].map(read).join("\n");
  assert.doesNotMatch(`${productionText}\n${configuration}`, /QH_PHASE5A(?:R)?_ROUTE_LAB_ONLY|prototypes\/phase-5a(?:-r)?-supporting-routes/);
});
