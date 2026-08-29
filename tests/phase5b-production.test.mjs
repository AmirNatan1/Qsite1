import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const count = (source, pattern) => [...source.matchAll(pattern)].length;
const normalize = (source) => source.replace(/\s+/g, " ");

const acceptedIndustryCopy = [
  "For industry — turn needs into testable decisions",
  "Define industrial challenges, source relevant technologies and run structured POCs that produce evidence for the next step.",
  "Turn industrial needs into testable decisions.",
  "Bring Quantum an operational challenge. We help shape it into a clear search, assessment and field-test process.",
  "Start with your challenge",
  "See the proof approach",
  "The challenge",
  "The need comes before the technology.",
  "An industrial challenge becomes useful when its context, owner and evidence needs are explicit. Quantum works with the people closest to the operation to frame that foundation before a solution is selected.",
  "That discipline keeps technology sourcing relevant. Candidates are assessed against the actual environment, constraints and route to a practical test—not against a generic innovation brief.",
  "The result is a bounded POC designed to answer specific questions and support a responsible next step without overstating what the test proves.",
  "Capabilities",
  "Support across the evidence path.",
  "Quantum connects challenge definition, technology assessment and field execution.",
  "Challenge definition",
  "Clarify the operational problem, stakeholder, environment and criteria for a useful test.",
  "Curated technology sourcing",
  "Search for relevant technologies with the industrial context kept in view.",
  "Technical and business assessment",
  "Evaluate feasibility, fit, readiness and the conditions required for a POC.",
  "POC planning and execution",
  "Turn open questions into a structured test design and coordinated field process.",
  "Commercialisation and decision support",
  "Organise the evidence so the parties can identify an appropriate next step.",
  "Engagement route",
  "Five stages. One evidence thread.",
  "The method keeps the original need connected to every sourcing, assessment and test choice.",
  "Define the challenge, operating context, owner and success criteria.",
  "Identify technologies that are relevant to the need and environment.",
  "Examine technical, business and implementation fit before testing.",
  "Design and execute a focused POC under meaningful conditions.",
  "Use the evidence to determine a responsible next step.",
  "Ways to work",
  "A defined challenge or an ongoing context.",
  "The right structure depends on whether the need is already clear or must be developed over time.",
  "Defined challenge",
  "Begin with a specific operational need and build a focused route toward a testable question.",
  "Ongoing innovation partnership",
  "Develop a repeatable way to surface needs, assess relevance and prepare selected opportunities for evidence.",
  "Industry programme",
  "CHAMP",
  "An industry-side programme context.",
  "Industry network",
  "Keep the operating context in view.",
  "Quantum engagement begins with the operational challenge, its real operating context and the evidence required to determine a next step.",
  "Bring the operating challenge.",
  "Describe the context you need to understand. Quantum will begin with the questions a useful test should answer.",
  "Choose the industry path",
];

const acceptedStartupCopy = [
  "For startups — bring technology into the real world",
  "A structured route for MVP+ technologies to meet relevant industrial needs, prepare a POC and learn from real operating conditions.",
  "Bring your technology into the real world.",
  "Move from a promising capability to a relevant industrial question, a structured POC and evidence grounded in operating conditions.",
  "Introduce your technology",
  "Explore SPARK",
  "Readiness",
  "Ready means more than interesting.",
  "A useful industrial test needs a technology, use case and team that can engage with real constraints.",
  "MVP+ technology",
  "A working capability that can move beyond a concept-only conversation.",
  "Clear industrial use case",
  "A credible connection between what the technology does and an operational need.",
  "Deployable team",
  "People available to prepare, support and learn from a structured field test.",
  "Measurable value",
  "A practical view of what evidence would make the POC informative.",
  "Organisational readiness",
  "Willingness to work with a large organisation, its processes and its operating environment.",
  "What Quantum can provide",
  "Context for a better test.",
  "Quantum connects a technology’s potential to an industrial evidence question.",
  "Relevant industrial access",
  "Connections shaped around an identified need.",
  "Use-case design",
  "A clearer link between the capability, user and operating problem.",
  "POC design",
  "A bounded plan for what to test, where and why.",
  "Domain feedback",
  "Input grounded in the operating environment.",
  "Real operating environments",
  "Conditions that reveal practical constraints an abstract demo cannot.",
  "Evidence‑based next step",
  "A structured record for what follows the test.",
  "Startup route",
  "From readiness to evidence.",
  "The route narrows possibility into a relevant industrial test.",
  "Establish the technology, team and use case are ready for an industrial conversation.",
  "Connect the capability to a real operational need and operating context.",
  "Define the POC question, environment and evidence criteria with the parties involved.",
  "Run a bounded test and observe how the technology behaves under meaningful conditions.",
  "Use what was learned to define an appropriate next step.",
  "SPARK pathway",
  "A pathway for MVP+ technologies to develop relevant opportunities and structured POCs in real operating contexts.",
  "Applications closed",
  "The public pathway is not accepting applications. No future date or alternative registration route is being offered here.",
  "Participation note:",
  "Quantum develops relevant opportunities and structured POCs; participation does not guarantee a pilot, procurement agreement or investment.",
  "Introduce the technology.",
  "Start with the capability, industrial use case and the conditions you are ready to test.",
  "Choose the startup path",
];

const acceptedIndustriesCopy = [
  "Industries where relevance is tested",
  "Quantum works across automotive and mobility, logistics and supply chain, advanced manufacturing, and energy and infrastructure.",
  "Industrial domains",
  "Industry is where relevance is tested.",
  "A technology becomes meaningful when it meets the systems, constraints and operating conditions of a real domain.",
  "Four domains",
  "Different fields. The same evidence discipline.",
  "Each domain changes the question, environment and conditions a useful POC must address.",
  "Automotive & Mobility",
  "Vehicle systems, mobility operations and human-machine interaction create demanding contexts for field evidence.",
  "Logistics & Supply Chain",
  "Movement, visibility and coordination must be understood across real workflows and physical infrastructure.",
  "Industry 4.0 / Advanced Manufacturing",
  "Production environments bring equipment, people, data and process constraints into the same test.",
  "Energy & Infrastructure",
  "Energy systems and physical assets require relevance to be assessed inside operating and implementation conditions.",
  "Technology perspectives",
  "Capabilities can cross domain lines.",
  "Relevant technologies may cut across multiple industrial environments. Their fit is determined within the specific operating context.",
  "AI and data",
  "robotics and autonomy",
  "sensors and computer vision",
  "cybersecurity",
  "advanced materials",
  "energy systems",
  "enterprise software",
  "Method",
  "Design around the field.",
  "Quantum begins with the need and works outward: stakeholders, environment, constraints, technology fit and the evidence required. The test is shaped around that whole system rather than a generic demo.",
  "Bring the domain context.",
  "A useful conversation begins with the operating challenge, not a preselected solution.",
  "Start with the challenge",
];

const acceptedProofCopy = [
  "Proof — evidence before scale",
  "Quantum structures POCs around real operating questions, field conditions and evidence for an appropriate next step.",
  "proof",
  "Evidence before scale.",
  "A POC should reduce a specific uncertainty. Quantum connects the original need, field conditions and evidence in one structured record.",
  "evidence philosophy",
  "Test the question that matters.",
  "A convincing demonstration is not automatically useful evidence. Quantum starts by defining the operational question, the environment that gives it meaning and the observations needed to understand what should happen next.",
  "Technology fit is assessed before the test. The POC is then bounded so its design stays connected to the operating question, relevant conditions and evidence needed for a next-step decision.",
  "Evidence is reported with its context and limits intact, giving the parties a clearer basis for the next-step decision.",
  "structured poc",
  "From condition to evidence.",
  "A useful field record keeps the challenge, technology, test design, execution and evidence distinct.",
  "Define the condition",
  "State the operating need and the uncertainty the test should address.",
  "Match the technology",
  "Assess relevance and readiness before entering the field.",
  "Design the test",
  "Select conditions and observations that make the POC informative.",
  "Record the evidence",
  "Separate what was observed from the questions the POC did not answer.",
  "field record",
  "Maradin — Dynamic Ground Projection",
  "A real-world field test of Maradin’s MEMS-based laser scanning technology for vehicle‑to‑road visual communication.",
  "Open the field record",
  "Define what the test must answer.",
  "Start with the uncertainty that matters in the operating environment.",
  "Bring an industrial challenge",
  "Introduce a technology",
];

const acceptedMaradinCopy = [
  "Maradin — Dynamic Ground Projection",
  "A Quantum field record of Maradin’s MEMS-based laser scanning technology tested for vehicle-to-road visual communication.",
  "proof / field record",
  "A real-world field test of Maradin’s MEMS-based laser scanning technology for vehicle‑to‑road visual communication.",
  "Maradin",
  "Dynamic ground projection",
  "Real-world field test",
  "A projected stop-hand symbol observed on the road surface during field testing.",
  "Vehicle-mounted testing in the operating environment.",
  "A field-test vehicle documented in the Maradin record.",
  "field record",
  "Condition, test and evidence.",
  "The record connects the operating need to the tested conditions, the observations produced and what followed.",
  "Challenge",
  "The communication need",
  "A need for clearer visual communication between vehicles and nearby road users across real-world operating conditions.",
  "Technology",
  "The match",
  "Maradin’s MEMS-based laser scanning dynamic ground projection.",
  "Test design",
  "Conditions that matter",
  "Vehicle-mounted field testing across projector positions, road surfaces, lighting conditions and weather conditions.",
  "Execution",
  "Into the field",
  "The field test compared brightness, image distortion and clarity across varying operating conditions.",
  "Evidence",
  "What the POC produced",
  "The field evidence showed how brightness, image distortion and clarity varied across projector positions, road surfaces, lighting and weather conditions.",
  "Next step",
  "What followed",
  "Following an EcoMotion showcase, Maradin was selected for Hyundai’s OI Lounge exhibition in Korea. A more advanced iteration was integrated into the vehicle’s front grille for that event.",
  "related capabilities",
  "Work around the test.",
  "POC design, field execution and evidence synthesis kept the test connected to its operating question.",
  "POC design",
  "Field-test execution",
  "Evidence synthesis",
  "Start with the evidence question.",
  "A useful POC is designed around what the operating context needs to reveal.",
  "Bring an industrial challenge",
  "Return to Proof",
];

test("CP2 pages load only their route-owned composition and styles", async () => {
  const industry = await read("src/pages/for-partners.astro");
  const startups = await read("src/pages/for-startups.astro");
  const industries = await read("src/pages/industries.astro");
  assert.match(industry, /IndustryExperience/);
  assert.match(industry, /routes\/industry\.css/);
  assert.doesNotMatch(industry, /StartupExperience|startups\.css/);
  assert.match(startups, /StartupExperience/);
  assert.match(startups, /routes\/startups\.css/);
  assert.doesNotMatch(startups, /IndustryExperience|industry\.css/);
  assert.match(industries, /IndustriesExperience/);
  assert.match(industries, /routes\/industries\.css/);
  assert.doesNotMatch(industries, /IndustryExperience|StartupExperience|routes\/(?:industry|startups)\.css/);
  for (const source of [industry, startups, industries]) {
    assert.doesNotMatch(source, /PageHero|ProcessList|ClosingCta|standard\.css|SupportingRoute|editorial-section|feature-list|button-row/);
  }
});

test("Industry is an explicit four-section pressure system", async () => {
  const source = await read("src/components/routes/industry/IndustryExperience.astro");
  assert.match(source, /<article[\s\S]*data-route-architecture="pressure-system"/);
  assert.equal(count(source, /<section\b[^>]*data-route-act=/g), 4);
  assert.deepEqual([...source.matchAll(/data-route-act="([^"]+)"/g)].map((match) => match[1]), ["pressure", "frame", "test", "decision"]);
  assert.equal(count(source, /data-route-geometry=/g), 4);
  assert.equal(count(source, /<h1\b/g), 1);
  for (const phrase of ["Turn industrial needs into testable decisions.", "The need comes before the technology.", "Five stages. One evidence thread.", "Bring the operating challenge."]) assert.ok(source.includes(phrase), `missing accepted Industry copy: ${phrase}`);
  assert.match(source, /class="industry-programme" id="champ" tabindex="-1"/);
  assert.match(await read("src/components/home/ProgrammesField.astro"), /href="\/for-partners\/#champ"/);
  assert.match(source, /champProgramme\.name/);
  assert.match(await read("src/content/programmes.ts"), /name: "CHAMP"/);
});

test("Startups is a header plus ordered conditional corridor", async () => {
  const source = await read("src/components/routes/startups/StartupExperience.astro");
  assert.match(source, /<article[\s\S]*data-route-architecture="conditional-corridor"/);
  assert.equal(count(source, /<header\b[^>]*data-route-act="signal"/g), 1);
  assert.equal(count(source, /<li\b[^>]*data-route-act=/g), 3);
  assert.deepEqual([...source.matchAll(/data-route-act="([^"]+)"/g)].map((match) => match[1]), ["signal", "conditions", "fit", "field"]);
  assert.equal(count(source, /data-route-geometry=/g), 4);
  assert.equal(count(source, /<h1\b/g), 1);
  for (const phrase of ["Bring your technology into the real world.", "Ready means more than interesting.", "Evidence‑based next step", "Introduce your technology", "participation does not guarantee a pilot, procurement agreement or investment."]) assert.ok(source.includes(phrase), `missing accepted Startup copy: ${phrase}`);
  assert.match(source, /sparkProgramme\.status/);
  assert.match(await read("src/content/programmes.ts"), /status: "Applications closed"/);
});

test("Industries is a six-region threshold, four territories, and context coda", async () => {
  const source = await read("src/components/routes/industries/IndustriesExperience.astro");
  assert.match(source, /<article[\s\S]*data-route-architecture="four-territory-threshold"/);
  assert.equal(count(source, /data-route-region=/g), 6);
  assert.deepEqual([...source.matchAll(/data-route-region="([^"]+)"/g)].map((match) => match[1]), ["threshold", "horizon", "transfer", "fixture", "span", "context"]);
  assert.equal(count(source, /<section\b[^>]*data-route-act=/g), 4);
  assert.deepEqual([...source.matchAll(/data-route-act="([^"]+)"/g)].map((match) => match[1]), ["automotive", "logistics", "manufacturing", "energy"]);
  assert.deepEqual([...source.matchAll(/data-route-geometry="([^"]+)"/g)].map((match) => match[1]), ["territory-band", "velocity-horizon", "stacked-transfer", "machined-fixture", "infrastructure-span"]);
  assert.equal(count(source, /<h1\b/g), 1);
  assert.equal(count(source, /<h2\b[^>]*id="(?:automotive|logistics|manufacturing|energy)-title"/g), 4);
  assert.doesNotMatch(source, /PUBLIC_INDUSTRIES\.map|<button\b|<select\b|role="tab"|carousel|card/i);
  assert.match(source, /href="\/contact\/#for-industry"/);
});

test("CP4 pages load only their documentary route-owned compositions", async () => {
  const proof = await read("src/pages/pocs.astro");
  const maradin = await read("src/pages/pocs/maradin.astro");
  assert.match(proof, /ProofExperience/);
  assert.match(proof, /routes\/proof-production\.css/);
  assert.doesNotMatch(proof, /MaradinExperience|routes\/maradin\.css/);
  assert.match(maradin, /MaradinExperience/);
  assert.match(maradin, /routes\/maradin\.css/);
  assert.doesNotMatch(maradin, /ProofExperience|proof-production\.css/);
  for (const source of [proof, maradin]) {
    assert.doesNotMatch(source, /PageHero|ClosingCta|standard\.css|SupportingRoute|editorial-section|feature-list|proof-feature|record-chapter-list/);
  }
});

test("Proof is a two-act archive threshold with one governed record", async () => {
  const source = await read("src/components/routes/proof/ProofExperience.astro");
  assert.match(source, /<article[\s\S]*data-route-architecture="archive-threshold"/);
  assert.equal(count(source, /data-route-region=/g), 2);
  assert.deepEqual([...source.matchAll(/data-route-region="([^"]+)"/g)].map((match) => match[1]), ["threshold", "record"]);
  assert.deepEqual([...source.matchAll(/data-route-act="([^"]+)"/g)].map((match) => match[1]), ["threshold", "record"]);
  assert.equal(count(source, /<h1\b/g), 1);
  assert.equal(count(source, /<img\b/g), 1);
  assert.match(source, /loading="eager"/);
  assert.match(source, /fetchpriority="high"/);
  assert.match(source, /href="\/pocs\/maradin\/"/);
  assert.doesNotMatch(source, /search|filter|confidential|coming soon|placeholder|card/i);
});

test("Maradin is a six-act governed documentary record", async () => {
  const source = await read("src/components/routes/maradin/MaradinExperience.astro");
  assert.match(source, /<article[\s\S]*data-route-architecture="documentary-record"/);
  assert.equal(count(source, /data-route-region=/g), 6);
  assert.deepEqual([...source.matchAll(/data-route-region="([^"]+)"/g)].map((match) => match[1]), ["reality", "problem", "technology", "test", "observation", "restraint"]);
  assert.deepEqual([...source.matchAll(/data-route-act="([^"]+)"/g)].map((match) => match[1]), ["reality", "problem", "technology", "test", "observation", "restraint"]);
  assert.equal(count(source, /<h1\b/g), 1);
  assert.equal(count(source, /<video\b/g), 2);
  assert.equal(count(source, /data-maradin-video-trigger/g), 2);
  assert.doesNotMatch(source, /<source\b|autoplay|record-chapter-list|proof-feature|card/i);
  assert.match(source, /preload="none"/);
  assert.match(await read("src/scripts/routes/maradin-documentary.ts"), /enhanceReversibleReveals/);
  assert.notEqual(normalize(source.match(/<article[\s\S]*<\/article>/)?.[0] ?? ""), normalize(await read("src/components/routes/proof/ProofExperience.astro")));
});

test("implemented routes preserve the complete accepted public-copy authority", async () => {
  const programmes = await read("src/content/programmes.ts");
  const industry = normalize(`${await read("src/pages/for-partners.astro")} ${await read("src/components/routes/industry/IndustryExperience.astro")} ${programmes}`);
  const startups = normalize(`${await read("src/pages/for-startups.astro")} ${await read("src/components/routes/startups/StartupExperience.astro")} ${programmes}`);
  const industries = normalize(`${await read("src/pages/industries.astro")} ${await read("src/components/routes/industries/IndustriesExperience.astro")} ${await read("src/content/industries.ts")}`);
  const proofs = await read("src/content/proofs.ts");
  const proof = normalize(`${await read("src/pages/pocs.astro")} ${await read("src/components/routes/proof/ProofExperience.astro")} ${proofs}`);
  const maradin = normalize(`${await read("src/pages/pocs/maradin.astro")} ${await read("src/components/routes/maradin/MaradinExperience.astro")} ${proofs}`);
  for (const phrase of acceptedIndustryCopy) assert.ok(industry.includes(phrase), `missing accepted Industry copy: ${phrase}`);
  for (const phrase of acceptedStartupCopy) assert.ok(startups.includes(phrase), `missing accepted Startup copy: ${phrase}`);
  for (const phrase of acceptedIndustriesCopy) assert.ok(industries.includes(phrase), `missing accepted Industries copy: ${phrase}`);
  for (const phrase of acceptedProofCopy) assert.ok(proof.includes(phrase), `missing accepted Proof copy: ${phrase}`);
  for (const phrase of acceptedMaradinCopy) assert.ok(maradin.includes(phrase), `missing accepted Maradin copy: ${phrase}`);
});

test("CP2 has no lab copy, media, form, sticky scene, or scroll interception", async () => {
  const files = [
    "src/components/routes/industry/IndustryExperience.astro",
    "src/components/routes/startups/StartupExperience.astro",
    "src/components/routes/industries/IndustriesExperience.astro",
    "src/styles/routes/industry.css",
    "src/styles/routes/startups.css",
    "src/scripts/routes/document-progress.ts",
    "src/scripts/routes/industry-progress.ts",
    "src/scripts/routes/startup-progress.ts",
    "src/scripts/routes/industries-progress.ts",
    "src/styles/routes/industries.css",
  ];
  const joined = (await Promise.all(files.map(read))).join("\n");
  assert.doesNotMatch(joined, /QH_PHASE5AR_ROUTE_LAB_ONLY|PREPRODUCTION|approved content map|public route unchanged|destination remains unverified|human review/i);
  assert.doesNotMatch(joined, /<(?:img|picture|video|audio|source|canvas|form|input)\b|\/media\//i);
  assert.doesNotMatch(joined, /position\s*:\s*(?:sticky|fixed)|scroll-snap|overflow-[xy]\s*:\s*(?:auto|scroll)|addEventListener\(["']wheel|preventDefault\(|scrollTo\(|scrollBy\(|scrollIntoView\(|setInterval\(|setTimeout\(/i);
  const helper = await read("src/scripts/routes/document-progress.ts");
  assert.match(helper, /addEventListener\("scroll", schedule, \{ passive: true \}\)/);
  assert.equal(count(helper, /requestAnimationFrame\(/g), 1);
  assert.match(helper, /ranges = acts\.map/);
  assert.match(helper, /if \(!disposed && running\) remeasure\(\)/);
  assert.match(helper, /preference\.addEventListener\("change", syncPreference\)/);
  assert.match(helper, /event\.persisted\) stop\(\)/);
  assert.match(helper, /event\.persisted && !disposed\) syncPreference\(\)/);
});

test("CP4 has no lab copy, template rows, sticky scene, autoplay, or scroll interception", async () => {
  const files = [
    "src/components/routes/proof/ProofExperience.astro",
    "src/components/routes/maradin/MaradinExperience.astro",
    "src/styles/routes/proof-production.css",
    "src/styles/routes/maradin.css",
    "src/scripts/routes/reversible-reveal.ts",
  ];
  const joined = (await Promise.all(files.map(read))).join("\n");
  assert.doesNotMatch(joined, /QH_PHASE5AR_ROUTE_LAB_ONLY|PREPRODUCTION|approved content map|public route unchanged|Phase 5B unauthorized|human review/i);
  assert.doesNotMatch(joined, /position\s*:\s*(?:sticky|fixed)|scroll-snap|overflow-[xy]\s*:\s*(?:auto|scroll)|addEventListener\(["'](?:scroll|wheel)|preventDefault\(|scrollTo\(|scrollBy\(|scrollIntoView\(|requestAnimationFrame|setInterval\(|setTimeout\(/i);
  assert.doesNotMatch(joined, /<form\b|<input\b|autoplay|client-side router/i);
  const helper = await read("src/scripts/routes/reversible-reveal.ts");
  assert.match(helper, /IntersectionObserver/);
  assert.match(helper, /entry\.isIntersecting \? "true" : "false"/);
});

test("CP2 responsive CSS exposes overflow instead of clipping copy and constrains grid min-content", async () => {
  const industry = await read("src/styles/routes/industry.css");
  const startups = await read("src/styles/routes/startups.css");
  const industries = await read("src/styles/routes/industries.css");
  for (const source of [industry, startups, industries]) {
    assert.doesNotMatch(source, /#main-content\s*\{[^}]*overflow\s*:\s*clip/s);
    assert.match(source, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  }
  for (const source of [industry, startups]) {
    assert.match(source, /\.\w+-act > \*\s*\{\s*min-width:\s*0/s);
  }
  assert.match(industries, /\.territory > \*[\s\S]*min-width:\s*0/);
  assert.match(industry, /\.industry-load \{ inset: 2% 0 0 44%; \}/);
  assert.match(industry, /\.industry-overture h1 \{ font-size: min\(11vw, 4\.6rem\); \}/);
  assert.match(startups, /\.startup-overture h1 \{ font-size: min\(10vw, 4\.6rem\); \}/);
  assert.match(industries, /\.territory-threshold__opening h1 \{ font-size: min\(11vw, 4\.6rem\); \}/);
  assert.match(industries, /\.territory--energy \.territory-span \{ order: 1; \}/);
});

test("CP2 source budgets and route contract remain bounded", async () => {
  const helperBytes = (await stat(path.join(root, "src/scripts/routes/document-progress.ts"))).size;
  for (const [id, css, controller] of [
    ["for-industry", "src/styles/routes/industry.css", "src/scripts/routes/industry-progress.ts"],
    ["for-startups", "src/styles/routes/startups.css", "src/scripts/routes/startup-progress.ts"],
    ["industries", "src/styles/routes/industries.css", "src/scripts/routes/industries-progress.ts"],
  ]) {
    const cssBytes = (await stat(path.join(root, css))).size;
    const jsBytes = helperBytes + (await stat(path.join(root, controller))).size;
    assert.ok(cssBytes <= (id === "industries" ? 15_000 : 11_000), `${id} authored CSS unexpectedly expanded before production minification: ${cssBytes}`);
    assert.ok(jsBytes <= 4_500, `${id} authored controller closure expanded unexpectedly before production minification: ${jsBytes}`);
  }
  const verifier = await read("scripts/verify-phase5b-production.mjs");
  assert.match(verifier, /bytes\(routeCss\) <= route\.cssBudget/);
  assert.match(verifier, /phase5bSurfaceRaw/);
  assert.match(verifier, /pageScriptSurfaceRaw/);
  assert.match(verifier, /inlineSharedRaw/);
  assert.match(verifier, /inherited inline JS contains a (?:forbidden route|media request) surface/);
  assert.match(verifier, /sharedModeHelper/);
  assert.match(verifier, /MARADIN_MEDIA/);
  assert.match(verifier, /governed media hash mismatch/);
});

test("CP4 authored sources stay bounded before production minification", async () => {
  const helperBytes = (await stat(path.join(root, "src/scripts/routes/reversible-reveal.ts"))).size;
  for (const [id, css, component, ceiling] of [
    ["proof", "src/styles/routes/proof-production.css", "src/components/routes/proof/ProofExperience.astro", 10_000],
    ["maradin", "src/styles/routes/maradin.css", "src/components/routes/maradin/MaradinExperience.astro", 15_000],
  ]) {
    const cssBytes = (await stat(path.join(root, css))).size;
    const componentBytes = (await stat(path.join(root, component))).size;
    assert.ok(cssBytes <= ceiling, `${id} authored CSS unexpectedly expanded: ${cssBytes}`);
    assert.ok(helperBytes + componentBytes <= 16_000, `${id} authored component/controller surface unexpectedly expanded`);
  }
});

test("CP2 no-JS and reduced-motion states resolve geometry without controller work", async () => {
  for (const [component, css] of [
    ["src/components/routes/industry/IndustryExperience.astro", "src/styles/routes/industry.css"],
    ["src/components/routes/startups/StartupExperience.astro", "src/styles/routes/startups.css"],
    ["src/components/routes/industries/IndustriesExperience.astro", "src/styles/routes/industries.css"],
  ]) {
    assert.match(await read(component), /data-route-motion="static"/);
    const styles = await read(css);
    assert.match(styles, /@media[^\{]*(?:scripting: none|prefers-reduced-motion: reduce)/);
    assert.match(styles, /scripting: none/);
    assert.match(styles, /prefers-reduced-motion: reduce/);
  }
});

test("CP4 no-JS and reduced-motion states resolve documentary compositions", async () => {
  for (const [component, css] of [
    ["src/components/routes/proof/ProofExperience.astro", "src/styles/routes/proof-production.css"],
    ["src/components/routes/maradin/MaradinExperience.astro", "src/styles/routes/maradin.css"],
  ]) {
    assert.match(await read(component), /data-route-motion="static"/);
    const styles = await read(css);
    assert.match(styles, /scripting: none/);
    assert.match(styles, /prefers-reduced-motion: reduce/);
  }
});

test("Phase 5B checks supersede working-tree Phase 5A freeze checks without mutating them", async () => {
  const packageManifest = JSON.parse(await read("package.json"));
  assert.doesNotMatch(packageManifest.scripts.check, /verify-phase5a-supporting-routes|verify-phase5ar-supporting-routes/);
  assert.doesNotMatch(packageManifest.scripts.test, /phase5a-supporting-routes\.test/);
  assert.match(packageManifest.scripts.check, /phase5b-publication\.test/);
  assert.match(packageManifest.scripts.check, /phase5b-production\.test/);
  assert.match(await read("tests/phase5a-supporting-routes.test.mjs"), /byte-identical to accepted Phase 4/);
});
