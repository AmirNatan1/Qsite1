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

test("CP2 pages load only their route-owned composition and styles", async () => {
  const industry = await read("src/pages/for-partners.astro");
  const startups = await read("src/pages/for-startups.astro");
  assert.match(industry, /IndustryExperience/);
  assert.match(industry, /routes\/industry\.css/);
  assert.doesNotMatch(industry, /StartupExperience|startups\.css/);
  assert.match(startups, /StartupExperience/);
  assert.match(startups, /routes\/startups\.css/);
  assert.doesNotMatch(startups, /IndustryExperience|industry\.css/);
  for (const source of [industry, startups]) {
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

test("CP2 preserves the complete accepted public-copy authority", async () => {
  const programmes = await read("src/content/programmes.ts");
  const industry = normalize(`${await read("src/pages/for-partners.astro")} ${await read("src/components/routes/industry/IndustryExperience.astro")} ${programmes}`);
  const startups = normalize(`${await read("src/pages/for-startups.astro")} ${await read("src/components/routes/startups/StartupExperience.astro")} ${programmes}`);
  for (const phrase of acceptedIndustryCopy) assert.ok(industry.includes(phrase), `missing accepted Industry copy: ${phrase}`);
  for (const phrase of acceptedStartupCopy) assert.ok(startups.includes(phrase), `missing accepted Startup copy: ${phrase}`);
});

test("CP2 has no lab copy, media, form, sticky scene, or scroll interception", async () => {
  const files = [
    "src/components/routes/industry/IndustryExperience.astro",
    "src/components/routes/startups/StartupExperience.astro",
    "src/styles/routes/industry.css",
    "src/styles/routes/startups.css",
    "src/scripts/routes/document-progress.ts",
    "src/scripts/routes/industry-progress.ts",
    "src/scripts/routes/startup-progress.ts",
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

test("CP2 responsive CSS exposes overflow instead of clipping copy and constrains grid min-content", async () => {
  const industry = await read("src/styles/routes/industry.css");
  const startups = await read("src/styles/routes/startups.css");
  for (const source of [industry, startups]) {
    assert.doesNotMatch(source, /#main-content\s*\{[^}]*overflow\s*:\s*clip/s);
    assert.match(source, /grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(source, /\.\w+-act > \*\s*\{\s*min-width:\s*0/s);
  }
  assert.match(industry, /\.industry-load \{ inset: 2% 0 0 44%; \}/);
  assert.match(industry, /\.industry-overture h1 \{ font-size: min\(11vw, 4\.6rem\); \}/);
  assert.match(startups, /\.startup-overture h1 \{ font-size: min\(10vw, 4\.6rem\); \}/);
});

test("CP2 source budgets and route contract remain bounded", async () => {
  const helperBytes = (await stat(path.join(root, "src/scripts/routes/document-progress.ts"))).size;
  for (const [id, css, controller] of [
    ["for-industry", "src/styles/routes/industry.css", "src/scripts/routes/industry-progress.ts"],
    ["for-startups", "src/styles/routes/startups.css", "src/scripts/routes/startup-progress.ts"],
  ]) {
    const cssBytes = (await stat(path.join(root, css))).size;
    const jsBytes = helperBytes + (await stat(path.join(root, controller))).size;
    assert.ok(cssBytes <= 11_000, `${id} authored CSS unexpectedly expanded before production minification: ${cssBytes}`);
    assert.ok(jsBytes <= 4_000, `${id} authored controller closure expanded unexpectedly before production minification: ${jsBytes}`);
  }
  const verifier = await read("scripts/verify-phase5b-production.mjs");
  assert.match(verifier, /bytes\(routeCss\) <= route\.cssBudget/);
  assert.match(verifier, /phase5bSurfaceRaw/);
  assert.match(verifier, /pageScriptSurfaceRaw/);
  assert.match(verifier, /inlineSharedRaw/);
  assert.match(verifier, /inherited inline JS contains a forbidden route or media surface/);
  assert.match(verifier, /sharedProgressHelper/);
});

test("CP2 no-JS and reduced-motion states resolve geometry without controller work", async () => {
  for (const [component, css] of [
    ["src/components/routes/industry/IndustryExperience.astro", "src/styles/routes/industry.css"],
    ["src/components/routes/startups/StartupExperience.astro", "src/styles/routes/startups.css"],
  ]) {
    assert.match(await read(component), /data-route-motion="static"/);
    const styles = await read(css);
    assert.match(styles, /@media \(scripting: none\), \(prefers-reduced-motion: reduce\)/);
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
