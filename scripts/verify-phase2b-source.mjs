import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { ALL_HTML_ROUTES, PUBLIC_INDUSTRY_NAMES } from "./phase1-qa-config.mjs";

const ROOT = process.cwd();
const ACCEPTED_PHASE2A_R = "4121e009b970cce480c4220c964cbc218e35d73c";
const HOME_COMPONENT_ROOT = path.join(ROOT, "src", "components", "home");
const HOME_COMPONENTS = Object.freeze([
  { tag: "EntryField", file: "EntryField.astro", id: "entry", heading: "h1", label: "home-title" },
  { tag: "BuiltWithIndustry", file: "BuiltWithIndustry.astro", id: "built-with-industry", heading: "h2", label: "industry-model-title" },
  { tag: "MethodField", file: "MethodField.astro", id: "method", heading: "h2", label: "method-title" },
  { tag: "IndustryTerritories", file: "IndustryTerritories.astro", id: "industries", heading: "h2", label: "industries-title" },
  { tag: "ProofField", file: "ProofField.astro", id: "proof", heading: "h2", label: "proof-title" },
  { tag: "ProgrammesField", file: "ProgrammesField.astro", id: "programmes", heading: "h2", label: "programmes-title" },
  { tag: "ConversionField", file: "ConversionField.astro", id: "conversion", heading: "h2", label: "conversion-title" },
]);
const SUPPORTING_ROUTES = ALL_HTML_ROUTES.filter(({ path: routePath }) => routePath !== "/");
const ALLOWED_PRODUCTION_CHANGES = Object.freeze([
  /^src\/pages\/index\.astro$/,
  /^src\/components\/home\/[^/]+\.astro$/,
  /^src\/styles\/routes\/home(?:-[a-z0-9-]+)?\.css$/,
  /^src\/scripts\/home-operating-field\.ts$/,
]);
const failures = [];

function check(condition, code, location, message, details = undefined) {
  if (!condition) failures.push({ code, location, message, ...(details === undefined ? {} : { details }) });
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function matches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
}

function lines(value) {
  return value ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
}

const indexPath = path.join(ROOT, "src", "pages", "index.astro");
const indexSource = await readFile(indexPath, "utf8");
const componentSources = new Map();
for (const component of HOME_COMPONENTS) {
  const componentPath = path.join(HOME_COMPONENT_ROOT, component.file);
  let source = "";
  try {
    source = await readFile(componentPath, "utf8");
  } catch {
    check(false, "home-component-missing", `src/components/home/${component.file}`, "required Phase 2B Home component is missing");
  }
  componentSources.set(component.tag, source);
}
const homeBootstrapSource = `${indexSource}\n${[...componentSources.values()].join("\n")}`;

const homeInvocationOrder = [...indexSource.matchAll(/<(EntryField|BuiltWithIndustry|MethodField|IndustryTerritories|ProofField|ProgrammesField|ConversionField)\b/g)].map((match) => match[1]);
check(
  homeInvocationOrder.length === HOME_COMPONENTS.length && homeInvocationOrder.every((tag, index) => tag === HOME_COMPONENTS[index].tag),
  "home-chapter-order",
  "src/pages/index.astro",
  `Home must invoke the exact seven chapters in order: ${HOME_COMPONENTS.map(({ tag }) => tag).join(", ")}`,
  homeInvocationOrder,
);
check(matches(indexSource, /<BaseLayout\b/g) === 1, "home-shell", "src/pages/index.astro", "Home must use BaseLayout exactly once");
check(!/<PageHero\b|<ProcessList\b|<ClosingCta\b/.test(indexSource), "phase1-home-primitive", "src/pages/index.astro", "Phase 2B Home must not fall back to generic Phase 1 composition primitives");
check(/const\s+title\s*=\s*["']Industrial innovation tested in the real world["']/.test(indexSource), "home-metadata-title", "src/pages/index.astro", "the accepted Home metadata title must remain unchanged");
check(!/Prove it where it has to work\./i.test(indexSource), "portal-interruption-copy", "src/pages/index.astro", "the secondary proposition must not become another production overture between the portal and ENTRY");

let literalH1Count = matches(indexSource, /<h1\b/g);
for (const component of HOME_COMPONENTS) {
  const source = componentSources.get(component.tag) ?? "";
  literalH1Count += matches(source, /<h1\b/g);
  check(new RegExp(`<section\\b[\\s\\S]*?\\bid=["']${component.id}["']`).test(source), "home-chapter-id", `src/components/home/${component.file}`, `chapter must own stable id ${component.id}`);
  check(new RegExp(`data-home-scene=["']${component.id}["']`).test(source), "home-chapter-identity", `src/components/home/${component.file}`, `chapter must expose data-home-scene=${component.id}`);
  check(new RegExp(`aria-labelledby=["']${component.label}["']`).test(source), "home-chapter-label", `src/components/home/${component.file}`, `chapter must be labelled by ${component.label}`);
  check(new RegExp(`<${component.heading}\\b[^>]*\\bid=["']${component.label}["']`, "i").test(source), "home-chapter-heading", `src/components/home/${component.file}`, `chapter must expose its accepted ${component.heading.toUpperCase()} label target`);
  for (const architecture of source.matchAll(/<[^>]+class=["'][^"']*(?:architecture|residual)[^"']*["'][^>]*>/gi)) {
    check(/aria-hidden=["']true["']/.test(architecture[0]), "decorative-a11y", `src/components/home/${component.file}`, "decorative spatial architecture must be hidden from assistive technology", architecture[0]);
  }
}
check(literalH1Count === 1, "home-h1-count", "src/pages/index.astro + src/components/home", `Home must have exactly one literal H1; observed ${literalH1Count}`);

const entrySource = componentSources.get("EntryField") ?? "";
check(/<h1\b[^>]*>[\s\S]*Where do[\s\S]*you enter\?[\s\S]*<\/h1>/i.test(entrySource), "entry-h1", "src/components/home/EntryField.astro", "WHERE DO YOU ENTER? must be the first settled Home H1");
for (const expected of [
  ["/for-partners/", "Bring us an operational challenge."],
  ["/for-startups/", "Bring us a technology ready to be tested."],
]) {
  check(entrySource.includes(expected[0]) && entrySource.includes(expected[1]), "entry-route", "src/components/home/EntryField.astro", `ENTRY must preserve ${expected[0]} and its accepted proposition`);
}

const methodSource = componentSources.get("MethodField") ?? "";
check(/<ol\b[^>]*class=["']method-stages["']/.test(methodSource), "method-semantics", "src/components/home/MethodField.astro", "METHOD stages must remain an ordered semantic list");
check(/data-method-section/.test(methodSource) && /data-method-stage/.test(methodSource), "method-hooks", "src/components/home/MethodField.astro", "METHOD must expose bounded section and stage hooks");
for (const title of ["Frame", "Source", "Assess", "Test", "Decide"]) {
  check(new RegExp(`title:\\s*["']${title}["']`).test(indexSource), "method-content", "src/pages/index.astro", `METHOD is missing accepted stage ${title}`);
}

const industriesSource = await readFile(path.join(ROOT, "src", "content", "industries.ts"), "utf8");
check(matches(industriesSource, /Object\.freeze\(\{\s*id:/g) === 4, "industry-count", "src/content/industries.ts", "the public industry collection must contain exactly four territories");
for (const industry of PUBLIC_INDUSTRY_NAMES) {
  check(industriesSource.includes(industry), "industry-content", "src/content/industries.ts", `approved industry is missing: ${industry}`);
}

const proofSource = componentSources.get("ProofField") ?? "";
check(/maradin-field-aperture-poster/.test(indexSource) && /maradin-real-field-still/.test(indexSource), "proof-assets", "src/pages/index.astro", "PROOF must use the two approved poster-first Maradin stills");
check(/href=["']\/pocs\/maradin\/["']/.test(proofSource), "proof-route", "src/components/home/ProofField.astro", "PROOF must link to the public Maradin field record");

const programmesSource = componentSources.get("ProgrammesField") ?? "";
check(/\{spark\.name\}/.test(programmesSource) && /\{champ\.name\}/.test(programmesSource), "programme-content", "src/components/home/ProgrammesField.astro", "PROGRAMMES must render the governed SPARK and CHAMP records");
const conversionSource = componentSources.get("ConversionField") ?? "";
for (const href of ["/contact/#for-industry", "/contact/#for-startups", "/contact/#general"]) {
  check(conversionSource.includes(href), "conversion-route", "src/components/home/ConversionField.astro", `CONVERSION is missing ${href}`);
}

const controllerPath = path.join(ROOT, "src", "scripts", "home-operating-field.ts");
let controllerSource = "";
try {
  controllerSource = await readFile(controllerPath, "utf8");
} catch {
  check(false, "controller-missing", "src/scripts/home-operating-field.ts", "the single Phase 2B Home controller is missing");
}
check(/prefers-reduced-motion:\s*reduce/.test(homeBootstrapSource), "reduced-motion-bootstrap", "Phase 2B Home entrypoint", "Home must bypass its controller when reduced motion is requested");
check(/import\(["'](?:\.\.\/)+scripts\/home-operating-field["']\)/.test(homeBootstrapSource), "controller-entrypoint", "Phase 2B Home entrypoint", "Home must lazy-load the one Phase 2B controller");
check(matches(homeBootstrapSource, /home-operating-field/g) === 1, "controller-entrypoint", "Phase 2B Home entrypoint", "Home must own exactly one Phase 2B controller bootstrap");
check(/addEventListener\(\s*["']scroll["'][\s\S]{0,160}passive\s*:\s*true/.test(controllerSource), "passive-scroll", "src/scripts/home-operating-field.ts", "the scroll observer must be passive");
check(/requestAnimationFrame\s*\(/.test(controllerSource), "scroll-coalescing", "src/scripts/home-operating-field.ts", "scroll-derived rendering must be coalesced to one animation frame");
check(/ResizeObserver/.test(controllerSource), "resize-strategy", "src/scripts/home-operating-field.ts", "controller must recompute cached geometry after content-size changes");
check(/visibilitychange/.test(controllerSource), "visibility-strategy", "src/scripts/home-operating-field.ts", "controller must respond to document visibility");
for (const prohibited of [
  { pattern: /addEventListener\(\s*["'](?:wheel|mousewheel|touchmove)["']/, label: "wheel/touch interception" },
  { pattern: /\.preventDefault\s*\(/, label: "event cancellation" },
  { pattern: /\b(?:scrollTo|scrollBy)\s*\(/, label: "programmatic document scrolling" },
  { pattern: /(?:document\.(?:documentElement|body)|window)\.scrollTop\s*=/, label: "scrollTop mutation" },
  { pattern: /\bsetInterval\s*\(/, label: "queued or perpetual timeline" },
  { pattern: /\b(?:ScrollTrigger|Lenis|LocomotiveScroll|gsap)\b/, label: "third-party/custom scroll engine" },
]) {
  check(!prohibited.pattern.test(controllerSource), "native-scroll-authority", "src/scripts/home-operating-field.ts", `${prohibited.label} is prohibited`);
}
check(!/getBoundingClientRect\s*\([\s\S]{0,120}addEventListener\(\s*["']scroll|addEventListener\(\s*["']scroll[\s\S]{0,500}getBoundingClientRect\s*\(/.test(controllerSource), "scroll-layout-thrash", "src/scripts/home-operating-field.ts", "scene geometry must be cached outside the scroll handler");

const homeStyleFiles = (await walk(path.join(ROOT, "src", "styles", "routes"))).filter((file) => /^home(?:-[a-z0-9-]+)?\.css$/.test(path.basename(file)));
const homeStyles = (await Promise.all(homeStyleFiles.map((file) => readFile(file, "utf8")))).join("\n");
check(!/scroll-snap-(?:type|align|stop)\s*:/i.test(homeStyles), "scroll-snap", "src/styles/routes/home*.css", "Home must not use forced scroll snapping");
check(!/\.territor(?:y|ies)[^{]*\{[^}]*overflow-x\s*:\s*(?:auto|scroll)/is.test(homeStyles), "industry-horizontal-scroll", "src/styles/routes/home*.css", "INDUSTRIES must not become a horizontal scroller");
check(!/\boverflow-y\s*:\s*(?:auto|scroll)/i.test(homeStyles), "nested-scroll", "src/styles/routes/home*.css", "Home must not create a nested vertical scroll container");

for (const route of SUPPORTING_ROUTES) {
  const source = await readFile(path.join(ROOT, route.source), "utf8");
  check(!/home-operating-field|components\/home|routes\/home(?:-|\.)/.test(source), "supporting-route-isolation", route.source, `${route.path} must not load Phase 2B Home code or styles`);
}

let changedProduction = [];
try {
  changedProduction = [
    ...lines(git("diff", "--name-only", ACCEPTED_PHASE2A_R, "--", "src", "public", "astro.config.mjs")),
    ...lines(git("ls-files", "--others", "--exclude-standard", "--", "src", "public")),
  ].map((file) => file.replaceAll("\\", "/"));
  changedProduction = [...new Set(changedProduction)].sort();
  const unexpected = changedProduction.filter((file) => !ALLOWED_PRODUCTION_CHANGES.some((pattern) => pattern.test(file)));
  check(unexpected.length === 0, "production-scope", "src + public + astro.config.mjs", "Phase 2B may change only the isolated Home implementation surface", unexpected);
} catch (error) {
  check(false, "accepted-baseline", "git", `could not compare production source with accepted Phase 2A-R: ${error.message}`);
}

try {
  const currentPackage = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const acceptedPackage = JSON.parse(git("show", `${ACCEPTED_PHASE2A_R}:package.json`));
  for (const key of ["dependencies", "devDependencies", "overrides"]) {
    check(JSON.stringify(currentPackage[key] ?? {}) === JSON.stringify(acceptedPackage[key] ?? {}), "dependency-freeze", "package.json", `${key} must remain byte-for-byte equivalent to accepted Phase 2A-R`, {
      accepted: acceptedPackage[key] ?? {},
      current: currentPackage[key] ?? {},
    });
  }
} catch (error) {
  check(false, "dependency-baseline", "package.json", `could not compare dependency manifests: ${error.message}`);
}

const controllerBytes = controllerSource ? (await stat(controllerPath)).size : 0;
if (failures.length > 0) {
  console.error(`Phase 2B source verification failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) console.error(`- [${failure.code}] ${failure.location}: ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(`Verified Phase 2B source: seven ordered Home chapters, one H1, bounded native-scroll controller (${controllerBytes.toLocaleString("en-US")} source bytes), frozen supporting routes/public assets/dependencies.`);
}
