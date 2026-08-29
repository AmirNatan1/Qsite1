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
  assert.doesNotMatch(combined, /defen[cs]e|dual(?:[-\u2010-\u2015 ]+)use/i);
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

test("Industries production keeps four territories and subordinate technology categories", () => {
  const component = read("src/components/routes/industries/IndustriesExperience.astro");
  assert.match(component, /const \[automotive, logistics, manufacturing, energy\] = PUBLIC_INDUSTRIES/);
  assert.equal([...component.matchAll(/<section\b[^>]*data-route-act=/g)].length, 4);
  assert.equal([...component.matchAll(/<li>\{category\}<\/li>/g)].length, 1);
  assert.doesNotMatch(component, /PUBLIC_INDUSTRIES\.map|facility|campus|site tour|client logo|procurement|deployment guarantee|commercial success/i);
  assert.doesNotMatch(component, /<button\b|<select\b|role="tab"|carousel|filter/i);
});

test("Proof production exposes exactly the one approved Maradin record", () => {
  const proof = read("src/components/routes/proof/ProofExperience.astro");
  const records = read("src/content/proofs.ts");
  assert.match(records, /publicProofRecords = Object\.freeze\(\[maradinProofRecord\]/);
  assert.match(proof, /maradinProofRecord/);
  assert.equal([...proof.matchAll(/href="\/pocs\/maradin\/"/g)].length, 1);
  assert.equal([...proof.matchAll(/<img\b/g)].length, 1);
  assert.doesNotMatch(proof, /publicProofRecords\.map|search|filter|confidential|anonymous|coming soon|placeholder|case library|metric/i);
});

test("Maradin production stays inside the approved qualified record", () => {
  const component = read("src/components/routes/maradin/MaradinExperience.astro");
  const records = read("src/content/proofs.ts");
  const approvedNextStep = "Following an EcoMotion showcase, Maradin was selected for Hyundai’s OI Lounge exhibition in Korea. A more advanced iteration was integrated into the vehicle’s front grille for that event.";
  assert.ok(records.includes(approvedNextStep));
  assert.match(component, /maradinProofRecord\.(?:challenge|technology|testDesign|execution|evidence|nextStep)/);
  assert.doesNotMatch(component, /commercial success|mass production|procurement (?:success|agreement)|sales results?|contracts?|deployment claims?|Hyundai endorsement|guaranteed outcome/i);
  assert.equal([...component.matchAll(/data-maradin-video-trigger/g)].length, 2);
  assert.doesNotMatch(component, /autoplay|<source\b/);
});

test("SPARK production remains closed without an application affordance", () => {
  const component = read("src/components/routes/spark/SparkExperience.astro");
  const programmes = read("src/content/programmes.ts");
  assert.match(programmes, /status: "Applications closed"/);
  assert.match(programmes, /applicationOpen: false/);
  assert.match(component, /sparkProgramme\.status/);
  assert.match(component, /SPARK is not accepting applications/);
  assert.match(component, /href="\/contact\/#for-startups"/);
  assert.doesNotMatch(component, /<(?:form|input|textarea|select)\b/i);
  assert.doesNotMatch(component, /href="[^"]*(?:apply|application|register|registration|waitlist|waiting-list)/i);
});

test("About production stays inside the approved institutional boundary", () => {
  const component = read("src/components/routes/about/AboutExperience.astro");
  assert.equal([...component.matchAll(/href="\/(?:for-partners|for-startups)\/"/g)].length, 2);
  assert.match(component, /Based in Herzliya, Quantum is positioned close to the technology ecosystem while keeping the work anchored in industrial application\./);
  assert.doesNotMatch(component, /qFund|team member|leadership|found(?:ed|ing)\s+(?:in|date)|timeline|milestone|campus|facility|laboratory|partner logo|client logo|metric/i);
  assert.doesNotMatch(component, /<(?:img|picture|video|audio|source|canvas|svg)\b|\/media\//i);
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
