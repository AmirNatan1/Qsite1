import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ACCEPTED_PHASE5A_SHA,
  ANTI_TEMPLATE_DIMENSIONS,
  ANTI_TEMPLATE_SCHEMA,
  CAPTURE_MANIFEST_SCHEMA,
  CAPTURE_PLAN_SCHEMA,
  CANARY,
  COHERENCE_COLUMNS,
  CROSS_ROUTE_ARTIFACTS,
  FROZEN_PUBLIC_FILES,
  LAB_RELATIVE,
  LAB_SOURCE_FILES,
  PLANNING_FILES,
  REQUIRED_VIEWPORTS,
  ROUTE_ARTIFACTS,
  ROUTE_CONTRACT,
  ROUTE_ORDER,
  ROUTE_PAIRS,
  architectureFingerprint,
  expectedEvidencePaths,
  expectedRoutePairs,
  parseAntiTemplateAudit,
  validateCapturePlan,
  validateCoherenceMatrix,
  validateManifestData,
  validateRouteDataContract,
  verifyPrototypeSource,
  verifyPublicSourceFreeze,
} from "../scripts/verify-phase5ar-supporting-routes.mjs";

const ROOT = process.cwd();

const ARCHITECTURES = Object.freeze({
  "for-industry": {
    documentLength: "long pressure-driven route",
    overtureTopology: "opposing pressure masses form an aperture",
    h1Placement: "compressed against the working aperture",
    dominantGeometry: "narrowing focus channel and decision plane",
    primaryDensity: "heavy structural graphite",
    mediaDominance: "none",
    endingBehavior: "cross and resolve through a decision aperture",
    closestVisualSibling: "about",
    antiTemplateDistinction: "One continuous pressure system physically constrains the challenge instead of presenting chapters as cards.",
  },
  "for-startups": {
    documentLength: "directional open route",
    overtureTopology: "technology signal enters an asymmetrical corridor",
    h1Placement: "off-axis at the incoming signal edge",
    dominantGeometry: "several alignment channels focus into one field route",
    primaryDensity: "open conductive negative space",
    mediaDominance: "none",
    endingBehavior: "conduct and cross a conditional field-access threshold",
    closestVisualSibling: "for-industry",
    antiTemplateDistinction: "The document conducts an edge signal into a larger operating system rather than mirroring the Industry aperture.",
  },
  industries: {
    documentLength: "six regions with four territory acts",
    overtureTopology: "concise territorial prelude",
    h1Placement: "bound to the opening horizon",
    dominantGeometry: "territory grid transforms between automotive logistics manufacturing and energy before a coda",
    primaryDensity: "variable by territory",
    mediaDominance: "none",
    endingBehavior: "resolve the territories into shared operating context",
    closestVisualSibling: "for-industry",
    antiTemplateDistinction: "The four territories are the document architecture, each changing grid depth spacing geometry and rhythm.",
  },
  proof: {
    documentLength: "very short evidence threshold",
    overtureTopology: "archive threshold punctured by one record",
    h1Placement: "quiet archive marker",
    dominantGeometry: "single record aperture into Maradin",
    primaryDensity: "sparse archival black",
    mediaDominance: "approved poster appears early as evidence",
    endingBehavior: "cross directly from record to Maradin evidence",
    closestVisualSibling: "maradin",
    antiTemplateDistinction: "The page refuses fake archive scale and ends as soon as the one truthful record hands control to Maradin.",
  },
  maradin: {
    documentLength: "six-act documentary route",
    overtureTopology: "documentary media opening",
    h1Placement: "integrated with the first evidence matte",
    dominantGeometry: "documentary cuts and changing media mattes",
    primaryDensity: "evidence-led physical sequence",
    mediaDominance: "governed documentary media carries the route",
    endingBehavior: "resolve quietly in observed field evidence",
    closestVisualSibling: "proof",
    antiTemplateDistinction: "Real physical technology test material structures every act while abstract interface geometry retreats.",
  },
  spark: {
    documentLength: "short three-act programme route",
    overtureTopology: "programme runway conducts toward a sealed gate",
    h1Placement: "aligned to the runway axis",
    dominantGeometry: "dormant institutional barrier",
    primaryDensity: "restrained sealed field",
    mediaDominance: "none",
    endingBehavior: "conduct stops at Applications closed then releases to context",
    closestVisualSibling: "contact",
    antiTemplateDistinction: "Energy approaches a closed threshold deliberately; there is no application UI, waitlist, or generic chapter sequence.",
  },
  about: {
    documentLength: "three-act institutional interlock",
    overtureTopology: "industry and technology begin as two worlds",
    h1Placement: "located at the interlock joint",
    dominantGeometry: "two layered systems overlap at Quantum's position",
    primaryDensity: "measured institutional density",
    mediaDominance: "none",
    endingBehavior: "resolve at the joint and operating position",
    closestVisualSibling: "for-industry",
    antiTemplateDistinction: "The whole document is one interlocking composition, not a history timeline, team page, or values brochure.",
  },
  contact: {
    documentLength: "one principal field",
    overtureTopology: "three intent rails arrive together",
    h1Placement: "quiet arrival axis",
    dominantGeometry: "industry startup and general intent rails align",
    primaryDensity: "near-empty precise field",
    mediaDominance: "none",
    endingBehavior: "focus into honest unresolved intent",
    closestVisualSibling: "spark",
    antiTemplateDistinction: "Contact intent is immediately legible in one field without a form, invented destination, or conceptual scroll sequence.",
  },
  "404": {
    documentLength: "one viewport recovery field",
    overtureTopology: "one element is spatially misregistered and displaced",
    h1Placement: "offset from the intact page datum",
    dominantGeometry: "displaced seam inside an otherwise intact field",
    primaryDensity: "near-empty static field",
    mediaDominance: "none",
    endingBehavior: "tiny resolve into direct recovery Home",
    closestVisualSibling: "contact",
    antiTemplateDistinction: "A single misregistration communicates error and recovery without turning the 404 into a long narrative or joke.",
  },
});

function actsFor(slug) {
  if (slug === "industries") return [
    { title: "Automotive", description: "Automotive long horizon and lateral velocity territory" },
    { title: "Logistics", description: "Logistics routing and transfer through depth territory" },
    { title: "Manufacturing", description: "Manufacturing fixtures tolerance and controlled repetition territory" },
    { title: "Energy", description: "Energy vertical span load and conduit territory" },
  ];
  const terms = ROUTE_CONTRACT[slug].requiredTerms.join(" ");
  return Array.from({ length: ROUTE_CONTRACT[slug].actCount }, (_unused, index) => ({
    title: `${slug} act ${index + 1}`,
    description: `${terms} authored architecture movement ${index + 1}`,
  }));
}

function validRoutes() {
  return Object.fromEntries(ROUTE_ORDER.map((slug) => [slug, {
    publicPath: ROUTE_CONTRACT[slug].publicPath,
    architecture: {
      actCount: ROUTE_CONTRACT[slug].actCount,
      documentRegions: ROUTE_CONTRACT[slug].documentRegions,
      transitionGrammar: `${slug} authored transition grammar`,
      ...ARCHITECTURES[slug],
    },
    acts: actsFor(slug),
  }]));
}

function validPlan() {
  return {
    schema: CAPTURE_PLAN_SCHEMA,
    canary: CANARY,
    routes: [...ROUTE_ORDER],
    requiredRouteArtifacts: [...ROUTE_ARTIFACTS],
    requiredCrossRouteArtifacts: [...CROSS_ROUTE_ARTIFACTS],
    boardModes: ["page", "signature", "materials"],
    validationViewports: REQUIRED_VIEWPORTS.map((id) => {
      const [width, height] = id.split("x").map(Number);
      return { id, width, height };
    }),
    rules: { publicExposure: false, publicSupportingRoutesChanged: false, phase5BAuthorized: false },
  };
}

function antiTemplateMarkdown({ omit = null, duplicate = null, status = true } = {}) {
  const header = [
    `# ${ANTI_TEMPLATE_SCHEMA}`,
    "Human visual judgment remains authority.",
    ...ANTI_TEMPLATE_DIMENSIONS.map((dimension) => `- ${dimension}`),
  ].join("\n");
  const bodies = ROUTE_PAIRS.filter((pair) => pair !== omit).map((pair) => [
    `<!-- pair:${pair} -->`,
    `${status ? "DISTINCT — " : ""}${pair} differs across document topology, spatial pressure, media use, transition behavior, and its route-specific ending rationale.`,
  ].join("\n"));
  if (duplicate) bodies.splice(1, 0, `<!-- pair:${duplicate} -->\nDISTINCT — duplicate pair rationale exists only to test rejection by the verifier contract.`);
  return `${header}\n\n${bodies.join("\n\n")}\n`;
}

function coherenceMarkdown() {
  const header = `| ${COHERENCE_COLUMNS.join(" | ")} |`;
  const divider = `| ${COHERENCE_COLUMNS.map(() => "---").join(" | ")} |`;
  const rows = ROUTE_ORDER.map((slug) => `| ${slug} | ${ARCHITECTURES[slug].documentLength} | ${ROUTE_CONTRACT[slug].actCount} | ${ARCHITECTURES[slug].overtureTopology} | ${ARCHITECTURES[slug].dominantGeometry} | ${ARCHITECTURES[slug].primaryDensity} | ${ARCHITECTURES[slug].mediaDominance} | ${ARCHITECTURES[slug].endingBehavior} | ${ARCHITECTURES[slug].closestVisualSibling} | ${ARCHITECTURES[slug].antiTemplateDistinction} |`);
  return `${header}\n${divider}\n${rows.join("\n")}\n`;
}

function validManifest() {
  return {
    schema: CAPTURE_MANIFEST_SCHEMA,
    status: "PASS",
    routes: [...ROUTE_ORDER],
    phase5BAuthorized: false,
    publicRoutesChanged: false,
    totals: { artifacts: 70 },
    artifacts: expectedEvidencePaths().map((relativePath, index) => ({ relativePath, bytes: index + 1, sha256: String(index + 1).padStart(64, "0") })),
  };
}

test("Phase 5A-R locks nine routes, exact acts/regions, seven artifacts per route, seven cross-route artifacts, and 36 pairs", () => {
  assert.equal(ACCEPTED_PHASE5A_SHA, "799ee284355f161e06404919d5022cd051165bf5");
  assert.equal(LAB_RELATIVE, "prototypes/phase-5a-r-supporting-routes");
  assert.equal(LAB_SOURCE_FILES.length, 7);
  assert.deepEqual(PLANNING_FILES, {
    coherence: "docs/planning/PHASE_5A_R_ROUTE_COHERENCE_MATRIX.md",
    antiTemplate: "docs/planning/PHASE_5A_R_ANTI_TEMPLATE_AUDIT.md",
  });
  assert.equal(ROUTE_ORDER.length, 9);
  assert.deepEqual(ROUTE_ORDER.map((slug) => ROUTE_CONTRACT[slug].actCount), [4, 4, 4, 2, 6, 3, 3, 1, 1]);
  assert.deepEqual(ROUTE_ORDER.map((slug) => ROUTE_CONTRACT[slug].documentRegions), [4, 4, 6, 2, 6, 3, 3, 1, 1]);
  assert.equal(ROUTE_ARTIFACTS.length, 7);
  assert.equal(CROSS_ROUTE_ARTIFACTS.length, 7);
  assert.equal(ROUTE_PAIRS.length, 36);
  assert.deepEqual(ROUTE_PAIRS, expectedRoutePairs(ROUTE_ORDER));
  assert.equal(expectedEvidencePaths().length, 70);
  assert.equal(new Set(expectedEvidencePaths()).size, 70);
});

test("route-data validator accepts nine genuinely different document architectures", () => {
  const routes = validRoutes();
  assert.equal(validateRouteDataContract([...ROUTE_ORDER], routes), true);
  assert.equal(new Set(ROUTE_ORDER.map((slug) => architectureFingerprint(routes[slug]))).size, 9);
});

test("route-data validator rejects wrong act counts, changed public paths, missing territory acts, and template fingerprints", () => {
  {
    const routes = validRoutes();
    routes.proof.acts.push({ title: "Fake archive", description: "Unauthorized additional fake archive act" });
    assert.throws(() => validateRouteDataContract([...ROUTE_ORDER], routes), /proof\.acts/);
  }
  {
    const routes = validRoutes();
    routes.contact.publicPath = "/new-contact/";
    assert.throws(() => validateRouteDataContract([...ROUTE_ORDER], routes), /public path projection changed/);
  }
  {
    const routes = validRoutes();
    routes.industries.acts[3] = { title: "Another automotive", description: "Automotive duplicated while Energy disappears" };
    assert.throws(() => validateRouteDataContract([...ROUTE_ORDER], routes), /exactly one automotive|exactly one energy/);
  }
  {
    const routes = validRoutes();
    routes["for-startups"].architecture = {
      ...routes["for-industry"].architecture,
      closestVisualSibling: "for-industry",
      antiTemplateDistinction: "This deliberately duplicated architecture must be rejected even when its prose claims to be visually distinct.",
    };
    assert.throws(() => validateRouteDataContract([...ROUTE_ORDER], routes), /duplicates the full-page architecture/);
  }
});

test("capture plan requires the exact compact artifact and responsive-neighbor surface", () => {
  assert.equal(validateCapturePlan(validPlan()), true);
  const missingNeighbor = validPlan();
  missingNeighbor.validationViewports = missingNeighbor.validationViewports.filter(({ id }) => id !== "800x360");
  assert.throws(() => validateCapturePlan(missingNeighbor), /omits 800x360/);
  const publicLeak = validPlan();
  publicLeak.rules.publicSupportingRoutesChanged = true;
  assert.throws(() => validateCapturePlan(publicLeak), /public supporting routes must remain frozen/);
  const extraArtifact = validPlan();
  extraArtifact.requiredRouteArtifacts.push("redundant-frame.png");
  assert.throws(() => validateCapturePlan(extraArtifact), /route artifact inventory differs/);
});

test("anti-template audit binds every unordered pair once and gives every pair a status/rationale", () => {
  const result = parseAntiTemplateAudit(antiTemplateMarkdown());
  assert.equal(result.pairCount, 36);
  assert.deepEqual(result.pairs, ROUTE_PAIRS);
  assert.throws(() => parseAntiTemplateAudit(antiTemplateMarkdown({ omit: ROUTE_PAIRS[7] })), /anti-template route pairs differs/);
  assert.throws(() => parseAntiTemplateAudit(antiTemplateMarkdown({ duplicate: ROUTE_PAIRS[0] })), /anti-template route pairs differs/);
  assert.throws(() => parseAntiTemplateAudit(antiTemplateMarkdown({ status: false })), /no explicit pair status/);
});

test("coherence matrix contains every required anti-template comparison column and route", () => {
  assert.equal(validateCoherenceMatrix(coherenceMarkdown()), true);
  assert.throws(() => validateCoherenceMatrix(coherenceMarkdown().replaceAll("media dominance", "media")), /media dominance/);
  assert.throws(() => validateCoherenceMatrix(coherenceMarkdown().replaceAll("for-startups", "startup-route")), /for-startups/);
});

test("tracked Phase 5A-R planning audit and coherence matrix satisfy the same 36-pair authority", () => {
  const antiTemplate = readFileSync(path.join(ROOT, ...PLANNING_FILES.antiTemplate.split("/")), "utf8");
  const coherence = readFileSync(path.join(ROOT, ...PLANNING_FILES.coherence.split("/")), "utf8");
  assert.equal(parseAntiTemplateAudit(antiTemplate).pairCount, 36);
  assert.equal(validateCoherenceMatrix(coherence), true);
});

test("tracked route lab remains compact, isolated, non-sticky, and architecture-complete", async () => {
  const result = await verifyPrototypeSource({ root: ROOT });
  assert.deepEqual(result, {
    files: 7,
    bytes: result.bytes,
    routes: 9,
    architectureFingerprints: 9,
    planningAntiTemplatePairs: 36,
    frozenPublicFiles: 19,
  });
  assert.ok(result.bytes > 0 && result.bytes < 750_000);
});

test("manifest contract hashes exactly the 70 route and cross-route payloads and cannot authorize production", () => {
  assert.equal(validateManifestData(validManifest()), true);
  const missing = validManifest();
  missing.artifacts.pop();
  assert.throws(() => validateManifestData(missing), /exactly 70 ledger records/);
  const phase5b = validManifest();
  phase5b.phase5BAuthorized = true;
  assert.throws(() => validateManifestData(phase5b), /cannot authorize Phase 5B/);
  const publicWrite = validManifest();
  publicWrite.publicRoutesChanged = true;
  assert.throws(() => validateManifestData(publicWrite), /cannot report public route writes/);
  const traversal = validManifest();
  traversal.artifacts[0].relativePath = "../public/index.html";
  assert.throws(() => validateManifestData(traversal), /unsafe manifest path/);
});

test("accepted Phase 5A public supporting-route sources remain byte-identical", async () => {
  assert.equal(FROZEN_PUBLIC_FILES.length, 19);
  const records = await verifyPublicSourceFreeze(ROOT);
  assert.equal(records.length, FROZEN_PUBLIC_FILES.length);
  assert.ok(records.every(({ bytes, sha256 }) => bytes > 0 && /^[0-9a-f]{64}$/.test(sha256)));
});

test("verifier source itself contains no Phase 5B authorization or public-write escape hatch", () => {
  const source = readFileSync(path.join(ROOT, "scripts", "verify-phase5ar-supporting-routes.mjs"), "utf8");
  assert.match(source, /phase5BAuthorized, false/);
  assert.match(source, /publicRoutesChanged, false/);
  assert.doesNotMatch(source, /phase5BAuthorized\s*[:=]\s*true|publicRoutesChanged\s*[:=]\s*true/);
});
