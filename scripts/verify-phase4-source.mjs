import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { ALL_HTML_ROUTES, PUBLIC_INDUSTRY_NAMES } from "./phase1-qa-config.mjs";
import {
  loadAndValidatePhase4R21Authority,
  PHASE4R21_AUTHORITY_RELATIVE,
  PHASE4R21_MANIFEST_RELATIVE,
  PHASE4R21_SOURCE_BLEND_BYTES,
  PHASE4R21_SOURCE_BLEND_RELATIVE,
  PHASE4R21_SOURCE_BLEND_SHA256,
} from "./stage-phase4r2-runtime-media.mjs";

const ROOT = process.cwd();
const FINAL_AUTHORITY_EXPECTED = process.env.PHASE4R2_FINAL_AUTHORITY === "1";
const PHASE5B_ROUTE_SCOPE_ALLOWED = process.argv.includes("--allow-phase5b-route-scope");
const ACCEPTED_PHASE3 = "2fdee6feb9664578c6c8243d1b80ea885235279f";
const REQUIRED_ANCESTORS = Object.freeze([
  ["Phase 2B", "b54f3a83b6180466127589a8d028f94dab892d17"],
  ["Phase 2A-R", "4121e009b970cce480c4220c964cbc218e35d73c"],
  ["Phase 1", "c37eff7da9ada99e4d65e2a76f89871b9a706db0"],
  ["Phase 0", "9aec62c1d89ebb2095bbc8903a718f77bbb6dbda"],
]);
const HOME_COMPONENTS = Object.freeze([
  { tag: "EntryField", file: "EntryField.astro", id: "entry", scene: "manifesto", heading: "h1", label: "home-title" },
  { tag: "BuiltWithIndustry", file: "BuiltWithIndustry.astro", id: "built-with-industry", scene: "built-with-industry", heading: "h2", label: "industry-model-title" },
  { tag: "MethodField", file: "MethodField.astro", id: "method", scene: "method", heading: "h2", label: "method-title" },
  { tag: "IndustryTerritories", file: "IndustryTerritories.astro", id: "industries", scene: "industries", heading: "h2", label: "industries-title" },
  { tag: "ProofField", file: "ProofField.astro", id: "proof", scene: "proof", heading: "h2", label: "proof-title" },
  { tag: "ProgrammesField", file: "ProgrammesField.astro", id: "programmes", scene: "programmes", heading: "h2", label: "programmes-title" },
  { tag: "ConversionField", file: "ConversionField.astro", id: "conversion", scene: "conversion", heading: "h2", label: "conversion-title" },
]);
const MEDIA_ASSETS = Object.freeze([
  {
    source: "media/phase-3-crt-opening-desktop-vp9.webm",
    output: "phase-3-desktop-vp9-44a1d9facd43.webm",
    bytes: 1_658_294,
    sha256: "44a1d9facd4316eff94e3712917a843b26d32b8012cadaa3f379edff2ffd2fcc",
  },
  {
    source: "media/phase-3-crt-opening-desktop-h264.mp4",
    output: "phase-3-desktop-h264-a73be0bb9890.mp4",
    bytes: 3_499_571,
    sha256: "a73be0bb989077551c0b3405cee2c3fa435b67049bf02b523df20baf0a4fb59e",
  },
  {
    source: "media/phase-3-crt-opening-mobile-vp9.webm",
    output: "phase-3-mobile-vp9-0ffcf12a431b.webm",
    bytes: 647_761,
    sha256: "0ffcf12a431b585f4ce37afd7df6ec0da1e52c4ef3c67d0ab761aaa5d5be517b",
  },
  {
    source: "media/phase-3-crt-opening-mobile-h264.mp4",
    output: "phase-3-mobile-h264-34319f80ae39.mp4",
    bytes: 1_242_276,
    sha256: "34319f80ae397758a3f7d4f192c572cee76c11ba5118a6fadb65c0374b4c99b2",
  },
  {
    source: "review/phase-3-reduced-motion-desktop-1440x900.png",
    output: "phase-3-dormant-desktop-03f5490ab11a.png",
    bytes: 726_026,
    sha256: "03f5490ab11a628eb00c20fa6fc96f72a72593b9ca9da0e8735e55f1c5ffe465",
  },
  {
    source: "review/phase-3-reduced-motion-mobile-390x844.png",
    output: "phase-3-dormant-mobile-9d5c19b1a5e2.png",
    bytes: 209_543,
    sha256: "9d5c19b1a5e294bc82822f44a11b94940829e67162c55783bb55bc5f5c02caad",
  },
  {
    source: "review/phase-3-reduced-motion-mobile-320x800.png",
    output: "phase-3-dormant-narrow-451d05bcc3d5.png",
    bytes: 162_832,
    sha256: "451d05bcc3d53a8c451e01751bdbb5dc3ddd7d68d9cd6e208a69dc58e4684366",
  },
]);
const SUPPORTING_ROUTES = ALL_HTML_ROUTES.filter(({ path: routePath }) => routePath !== "/");
const ALLOWED_PRODUCTION_CHANGES = Object.freeze([
  /^src\/components\/home\/EntryField\.astro$/,
  /^src\/layouts\/BaseLayout\.astro$/,
  /^src\/pages\/index\.astro$/,
  /^src\/scripts\/home-cinematic-integration\.ts$/,
  /^src\/styles\/routes\/home\.css$/,
  /^src\/styles\/routes\/home-cinematic\.css$/,
  /^src\/styles\/routes\/home-responsive\.css$/,
  /^public\/_headers$/,
]);
const PHASE5B_ROUTE_PRODUCTION_CHANGES = Object.freeze([
  /^src\/components\/routes\//,
  /^src\/scripts\/routes\//,
  /^src\/styles\/global\.css$/,
  /^src\/styles\/routes\/(?:production-foundations|industry|startups|industries|proof-production|maradin|spark-production|about|contact|404-production)\.css$/,
  /^src\/pages\/(?:for-partners|for-startups|industries|spark|about|contact|404)\.astro$/,
  /^src\/pages\/pocs(?:\/maradin)?\.astro$/,
]);
const failures = [];

function check(condition, code, location, message, details = undefined) {
  if (!condition) failures.push({ code, location, message, ...(details === undefined ? {} : { details }) });
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitAncestor(ancestor, descendant = "HEAD") {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: ROOT,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function lines(value) {
  return value ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
}

function matches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n");
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`(?:^|\\s)${escaped}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, "i"));
  return match ? match[1] ?? match[2] ?? match[3] ?? "" : undefined;
}

async function readOrFail(relative, code = "source-missing") {
  try {
    return await readFile(path.join(ROOT, ...relative.split("/")), "utf8");
  } catch (error) {
    check(false, code, relative, `required source is missing or unreadable: ${error.message}`);
    return "";
  }
}

async function verifyFile(relative, asset, authority) {
  try {
    const buffer = await readFile(path.join(ROOT, ...relative.split("/")));
    check(buffer.length === asset.bytes, "media-bytes", relative, `${authority} must be exactly ${asset.bytes.toLocaleString("en-US")} bytes`, buffer.length);
    check(sha256(buffer) === asset.sha256, "media-hash", relative, `${authority} SHA-256 must match the accepted Phase 3 authority`, sha256(buffer));
  } catch (error) {
    check(false, "media-missing", relative, `${authority} is missing or unreadable: ${error.message}`);
  }
}

// The Phase 4 branch must fork from the exact accepted Phase 3 delivery while retaining every earlier authority.
try {
  check(gitAncestor(ACCEPTED_PHASE3), "phase3-ancestry", "git", "accepted Phase 3 must be an ancestor of the Phase 4 work");
  const commits = lines(git("rev-list", "--ancestry-path", `${ACCEPTED_PHASE3}..HEAD`, "--reverse"));
  if (commits.length > 0) {
    check(git("rev-parse", `${commits[0]}^`) === ACCEPTED_PHASE3, "phase3-parent", "git", "the first Phase 4 commit must have the exact accepted Phase 3 commit as its parent");
  }
  for (const [label, revision] of REQUIRED_ANCESTORS) {
    check(gitAncestor(revision), "frozen-ancestry", "git", `${label} (${revision}) must remain in ancestry`);
  }
} catch (error) {
  check(false, "git-authority", "git", `could not verify frozen ancestry: ${error.message}`);
}

const indexSource = await readOrFail("src/pages/index.astro");
const layoutSource = await readOrFail("src/layouts/BaseLayout.astro");
const cinematicController = await readOrFail("src/scripts/home-cinematic-integration.ts", "controller-missing");
const operatingController = await readOrFail("src/scripts/home-operating-field.ts", "controller-missing");
const cinematicCss = await readOrFail("src/styles/routes/home-cinematic.css", "cinematic-css-missing");
const chromeEvidenceCapture = await readOrFail("scripts/capture-phase4r1-chrome-evidence.mjs", "chrome-capture-missing");
const stageSource = await readOrFail("scripts/stage-phase4-media.mjs", "media-stage-missing");
const stageR2Source = await readOrFail("scripts/stage-phase4r2-runtime-media.mjs", "media-stage-missing");
const buildDispatcherSource = await readOrFail("scripts/run-phase4-build.mjs", "build-dispatcher-missing");
const finalBuildSource = await readOrFail("scripts/run-phase4r2-final-build.mjs", "final-build-missing");
const outputVerifierSource = await readOrFail("scripts/verify-phase4-output.mjs", "output-verifier-missing");
const packageSource = await readOrFail("package.json", "package-missing");
const r2EvidenceCapture = await readOrFail("scripts/capture-phase4r2-production-evidence.mjs", "r2-capture-missing");
const r2DeploymentVerifier = await readOrFail("scripts/verify-phase4r2-deployment.mjs", "r2-deployment-missing");
const r2HumanReviewPackager = await readOrFail("scripts/package-phase4r2-human-review.mjs", "r2-package-missing");
const cloudflareHeaders = await readOrFail("public/_headers", "cloudflare-headers-missing");
const componentSources = new Map();
for (const component of HOME_COMPONENTS) {
  componentSources.set(component.tag, await readOrFail(`src/components/home/${component.file}`, "home-component-missing"));
}
const homeSource = `${indexSource}\n${[...componentSources.values()].join("\n")}`;

const invocationOrder = [...indexSource.matchAll(/<(EntryField|BuiltWithIndustry|MethodField|IndustryTerritories|ProofField|ProgrammesField|ConversionField)\b/g)].map((match) => match[1]);
check(
  invocationOrder.length === HOME_COMPONENTS.length && invocationOrder.every((tag, index) => tag === HOME_COMPONENTS[index].tag),
  "home-chapter-order",
  "src/pages/index.astro",
  `Home must invoke exactly the accepted seven chapters in order: ${HOME_COMPONENTS.map(({ tag }) => tag).join(", ")}`,
  invocationOrder,
);
check(matches(indexSource, /<BaseLayout\b/g) === 1, "home-layout", "src/pages/index.astro", "Home must use BaseLayout exactly once");
check(/const\s+title\s*=\s*["']Industrial innovation tested in the real world["']/.test(indexSource), "home-title", "src/pages/index.astro", "accepted Home metadata title must remain unchanged");
check(/skipHref=["']#entry["']/.test(indexSource) && /skipLabel=["']Skip cinematic intro["']/.test(indexSource), "skip-intro", "src/pages/index.astro", "Home must expose the accepted native skip-intro target and label");
check(!/<PageHero\b|<ProcessList\b|<ClosingCta\b/.test(indexSource), "phase1-home-primitive", "src/pages/index.astro", "Home must retain its accepted Phase 2B composition");

let h1Count = matches(indexSource, /<h1\b/gi);
for (const component of HOME_COMPONENTS) {
  const source = componentSources.get(component.tag) ?? "";
  h1Count += matches(source, /<h1\b/gi);
  check(new RegExp(`<section\\b[\\s\\S]*?\\bid=["']${component.id}["']`, "i").test(source), "home-chapter-id", `src/components/home/${component.file}`, `chapter must retain id ${component.id}`);
  check(new RegExp(`data-home-scene=["']${component.scene}["']`, "i").test(source), "home-chapter-hook", `src/components/home/${component.file}`, `chapter must retain data-home-scene=${component.scene}`);
  check(new RegExp(`aria-labelledby=["']${component.label}["']`, "i").test(source), "home-chapter-label", `src/components/home/${component.file}`, `chapter must be labelled by ${component.label}`);
  check(new RegExp(`<${component.heading}\\b[^>]*\\bid=["']${component.label}["']`, "i").test(source), "home-chapter-heading", `src/components/home/${component.file}`, `chapter must retain its ${component.heading.toUpperCase()} label target`);
}
check(h1Count === 1, "home-h1-count", "src/pages/index.astro + src/components/home", `Home must contain exactly one literal H1; observed ${h1Count}`);

const entrySource = componentSources.get("EntryField") ?? "";
check(/<h1\b[^>]*>[\s\S]*We turn[\s\S]*industrial needs[\s\S]*into field[\s\S]*evidence\.[\s\S]*<\/h1>/i.test(entrySource), "manifesto-h1", "src/components/home/EntryField.astro", "the production-authorized manifesto sentence must be the settled semantic H1");
check(!/<h1\b[^>]*>[\s\S]*Where do[\s\S]*you enter\?[\s\S]*<\/h1>/i.test(entrySource), "superseded-entry-h1", "src/components/home/EntryField.astro", "the superseded audience prompt must not remain an H1");
check(/<section\b[\s\S]*?\bid=["']entry["'][\s\S]*?\btabindex=["']-1["']/.test(entrySource), "skip-target-focus", "src/components/home/EntryField.astro", "the cinematic skip target must be programmatically focusable");
check(/<section\b[\s\S]*?\bid=["']audience-routing["'][\s\S]*?data-audience-routing/.test(entrySource), "audience-routing-region", "src/components/home/EntryField.astro", "audience routes must follow the pure manifesto in their own semantic region");
for (const [href, copy] of [
  ["/for-partners/", "Bring us an operational challenge."],
  ["/for-startups/", "Bring us a technology ready to be tested."],
]) {
  check(entrySource.includes(href) && entrySource.includes(copy), "entry-route", "src/components/home/EntryField.astro", `ENTRY must preserve ${href} and its accepted proposition`);
}

const methodSource = componentSources.get("MethodField") ?? "";
check(/<ol\b[^>]*class=["']method-stages["']/.test(methodSource), "method-semantics", "src/components/home/MethodField.astro", "METHOD must remain an ordered semantic list");
for (const title of ["Frame", "Source", "Assess", "Test", "Decide"]) {
  check(new RegExp(`title:\\s*["']${title}["']`).test(indexSource), "method-content", "src/pages/index.astro", `METHOD is missing accepted stage ${title}`);
}
const industriesSource = await readOrFail("src/content/industries.ts");
check(matches(industriesSource, /Object\.freeze\(\{\s*id:/g) === 4, "industry-count", "src/content/industries.ts", "public industry collection must remain exactly four territories");
for (const industry of PUBLIC_INDUSTRY_NAMES) check(industriesSource.includes(industry), "industry-content", "src/content/industries.ts", `approved industry is missing: ${industry}`);

const proofSource = componentSources.get("ProofField") ?? "";
check(indexSource.includes("maradin-field-aperture-poster") && indexSource.includes("maradin-real-field-still"), "proof-assets", "src/pages/index.astro", "PROOF must retain the two approved Maradin stills");
check(/href=["']\/pocs\/maradin\/["']/.test(proofSource), "proof-route", "src/components/home/ProofField.astro", "PROOF must retain the public Maradin field-record route");
const programmesSource = componentSources.get("ProgrammesField") ?? "";
check(/\{spark\.name\}/.test(programmesSource) && /\{champ\.name\}/.test(programmesSource), "programme-content", "src/components/home/ProgrammesField.astro", "PROGRAMMES must render the governed SPARK and CHAMP records");
const conversionSource = componentSources.get("ConversionField") ?? "";
for (const href of ["/contact/#for-industry", "/contact/#for-startups", "/contact/#general"]) {
  check(conversionSource.includes(href), "conversion-route", "src/components/home/ConversionField.astro", `CONVERSION is missing ${href}`);
}

// Server-render only one inert decorative video. Runtime source selection happens after capability gates.
const videos = [...homeSource.matchAll(/<video\b([^>]*)>([\s\S]*?)<\/video>/gi)].map((match) => ({ tag: `<video${match[1]}>`, inner: match[2] }));
check(videos.length === 1, "cinematic-video-count", "Home source", `Home must contain exactly one video decoder; observed ${videos.length}`);
if (videos[0]) {
  const { tag, inner } = videos[0];
  check(attribute(tag, "data-cinematic-media") !== undefined, "cinematic-video-hook", "src/pages/index.astro", "decorative video must expose data-cinematic-media");
  check(attribute(tag, "aria-hidden") === "true" && attribute(tag, "tabindex") === "-1", "cinematic-video-a11y", "src/pages/index.astro", "decorative video must be hidden and unfocusable");
  for (const name of ["muted", "playsinline", "disablepictureinpicture"]) check(attribute(tag, name) !== undefined, "cinematic-video-a11y", "src/pages/index.astro", `decorative video must include ${name}`);
  check(attribute(tag, "preload") === "none", "cinematic-video-preload", "src/pages/index.astro", "SSR video must use preload=none");
  check(attribute(tag, "src") === undefined, "cinematic-video-src", "src/pages/index.astro", "SSR video must not expose a src attribute");
  check(!/<source\b/i.test(inner), "cinematic-video-source", "src/pages/index.astro", "SSR video must not contain source children");
  for (const name of ["autoplay", "controls", "loop"]) check(attribute(tag, name) === undefined, "cinematic-video-playback", "src/pages/index.astro", `scroll-rendering video must not include ${name}`);
}
check(matches(indexSource, /<picture\b/gi) === 1, "poster-picture", "src/pages/index.astro", "cinematic shell must contain one poster picture");
check(/cinematicPosters\.portrait/.test(indexSource) && /cinematicPosters\.landscape/.test(indexSource) && /cinematicPosters\.desktop/.test(indexSource), "poster-inventory", "src/pages/index.astro", "SSR Home must bind desktop, portrait, and landscape final-authority posters with a safe development fallback");
check(/phase-4r2-1-causal-signal-scroll-stability\/production\/manifests\/phase-4r2-production-media-manifest\.json/.test(indexSource) && /PHASE4R2_FINAL_AUTHORITY/.test(indexSource), "poster-manifest-authority", "src/pages/index.astro", "final-authority builds must bind SSR posters from the active R2.1 tracked manifest and fail closed when it is required");
check(/phase-4r2-production-media-manifest\.json/.test(cinematicController) && /selectedMediaSource/.test(cinematicController), "controller-media-inventory", "src/scripts/home-cinematic-integration.ts", "controller must resolve exactly one R2 family/codec asset from the staged final manifest");
check(/fetch\(MANIFEST_PATH, \{ cache: "no-cache"/.test(cinematicController) && /fetch\(source, \{ cache: "force-cache"/.test(cinematicController) && /selectedManifestAsset/.test(cinematicController) && /SOURCE_BLEND_SHA256/.test(cinematicController), "controller-authority-cache", "src/scripts/home-cinematic-integration.ts", "runtime must revalidate the stable manifest, validate its fixed source/timeline/denials/inventory, and cache only hash-named payloads immutably");

check(/prefers-reduced-motion:\s*reduce/.test(indexSource), "reduced-motion-bootstrap", "src/pages/index.astro", "Home must decide reduced motion before loading the cinematic controller");
check(/<Fragment\s+slot=["']head["']>[\s\S]*?dataset\.cinematicMode\s*=\s*candidate\s*\?\s*["']candidate["']\s*:\s*["']static["'][\s\S]*?<\/Fragment>/.test(indexSource), "head-bootstrap", "src/pages/index.astro", "cinematic candidate/static eligibility must be established through BaseLayout's head slot before body parsing");
check(/dataset\.cinematicHeader\s*=\s*candidate\s*\?\s*["']concealed["']\s*:\s*["']released["']/.test(indexSource), "bootstrap-chrome-state", "src/pages/index.astro", "the head bootstrap must emit only candidate/concealed or static/released initial chrome states");
for (const bootstrapGate of ["directDeepLink", "restoredSettled", "textZoomUnsafe", "reduced"]) {
  check(indexSource.includes(bootstrapGate), "bootstrap-fallback-gate", "src/pages/index.astro", `head eligibility must explicitly cover ${bootstrapGate}`);
}
check(/rootFontSize\s*>=\s*30/.test(indexSource), "text-zoom-bootstrap", "src/pages/index.astro", "200% authored text must bypass before controller eligibility");
check(/history\.state\?\.quantumHomeCinematic/.test(indexSource), "restored-scroll-bootstrap", "src/pages/index.astro", "restored settled/lower history state must release chrome on first paint");
check(/toggleAttribute\(["']inert["'],\s*concealed\)/.test(indexSource), "bootstrap-inert", "src/pages/index.astro", "the parsed header and ENTRY must become inert before the lazy controller resolves");
check(matches(indexSource, /import\(["']\.\.\/scripts\/home-cinematic-integration["']\)/g) === 1, "cinematic-lazy-load", "src/pages/index.astro", "Home must lazy-load exactly one cinematic controller");
check(indexSource.indexOf("prefers-reduced-motion: reduce") < indexSource.indexOf("home-cinematic-integration"), "reduced-motion-order", "src/pages/index.astro", "reduced-motion gate must precede the cinematic import");
check(/root\.dataset\.cinematicMode\s*===\s*["']candidate["']/.test(indexSource), "capability-gated-import", "src/pages/index.astro", "cinematic import must be gated by candidate mode");
check(
  matches(cinematicController, /fetch\(source/g) === 1
    && matches(cinematicController, /video\.src\s*=/g) === 1
    && /response\.blob\(\)/.test(cinematicController)
    && /objectUrl\s*=\s*URL\.createObjectURL\(blob\)/.test(cinematicController)
    && /video\.src\s*=\s*objectUrl/.test(cinematicController),
  "runtime-media-selection",
  "src/scripts/home-cinematic-integration.ts",
  "exactly one selected asset must be fetched and assigned through one seekable Blob URL without source hot-swaps",
);
check(
  /export\s+type\s+Codec\s*=\s*["']h264["']/.test(cinematicController)
    && /supportsH264/.test(cinematicController)
    && /manifest\.assets\.length\s*!==\s*6/.test(cinematicController)
    && /completeH264Inventory/.test(cinematicController)
    && !/\b(?:vp9|webm)\b/i.test(cinematicController),
  "runtime-h264-only",
  "src/scripts/home-cinematic-integration.ts",
  "active runtime delivery must make one H.264 capability decision and select exactly three H.264 videos plus three posters without a VP9/WebM branch",
);
check(/URL\.revokeObjectURL\(objectUrl\)/.test(cinematicController) && /mediaAbortController\.abort\(\)/.test(cinematicController), "runtime-media-cleanup", "src/scripts/home-cinematic-integration.ts", "Blob media delivery must be aborted and revoked during fail-open or teardown");
check(!/createElement\(\s*["'](?:video|source)["']/.test(cinematicController), "single-decoder", "src/scripts/home-cinematic-integration.ts", "controller must not create additional video/source elements");
const reducedGate = cinematicController.indexOf("motion.matches || !codec || !portalFits()");
const mediaFetch = cinematicController.indexOf("fetch(source");
const sourceAssignment = cinematicController.indexOf("video.src = objectUrl");
check(reducedGate >= 0 && mediaFetch > reducedGate && sourceAssignment > mediaFetch, "load-gate-order", "src/scripts/home-cinematic-integration.ts", "reduced-motion, codec, and portal-fit gates must run before the selected asset fetch and Blob source assignment");
check(/PHYSICAL_FRAME_COUNT\s*=\s*500/.test(cinematicController) && /CONCEPTUAL_FRAME_COUNT\s*=\s*540/.test(cinematicController) && /BLACK_START_U\s*=\s*500/.test(cinematicController) && /ENTRY_START_U\s*=\s*513/.test(cinematicController) && /FRAME_RATE\s*=\s*30/.test(cinematicController), "timeline-authority", "src/scripts/home-cinematic-integration.ts", "controller must retain the u=0..540, 500 physical + 13 black + 27 semantic-frame, 30fps timeline");
check(/conceptualCoordinateForScroll/.test(cinematicController) && /scrollOffsetForFrame/.test(cinematicController) && /CINEMATIC_SEGMENTS/.test(cinematicController) && /PIECEWISE_COORDINATES/.test(cinematicController) && /PIECEWISE_PROGRESS/.test(cinematicController) && /FIRST_CHANGED_FRAME\s*=\s*46/.test(cinematicController) && /ARRIVAL_FRAME\s*=\s*285/.test(cinematicController) && /STABLE_Q_FRAME\s*=\s*370/.test(cinematicController), "deterministic-mapping", "src/scripts/home-cinematic-integration.ts", "integer scroll mapping must keep F1 at top, enter F46 on the first positive pixel, and explicitly address every physical/editorial segment through F500 and ENTRY");
check(/offsets\[activationIndex\]\s*=\s*Math\.min\(extent, offsets\[arrivalIndex\]!\s*\+\s*1\)/.test(cinematicController), "arrival-zero-dead-zone", "src/scripts/home-cinematic-integration.ts", "the first positive document pixel beyond exact F285 arrival must address F286");
check(/video\.pause\(\)/.test(cinematicController) && /video\.currentTime\s*=\s*targetTime/.test(cinematicController), "paused-seek-surface", "src/scripts/home-cinematic-integration.ts", "all physical forward and reverse states must use the one paused decoder as a deterministic seek surface");
check(/video\.seeking/.test(cinematicController) && /targetFrame\(scrollTargetPhysicalFrame,\s*true\)/.test(cinematicController) && /addEventListener\(\s*["']seeked["'][\s\S]{0,700}requestCurrentFrame\(\)/.test(cinematicController), "latest-seek-coalescing", "src/scripts/home-cinematic-integration.ts", "fast input must replace an in-flight request and a completed stale seek must yield to the newest document-derived frame");
check(matches(cinematicController, /video\.play\s*\(/g) === 0 && !/requestVideoFrameCallback|cancelVideoFrameCallback|wake-forward|wake-reverse|wake-armed|stable-hold/.test(cinematicController), "no-automatic-wake", "src/scripts/home-cinematic-integration.ts", "the automatic F285-to-F370 playback/reaction state machine must be absent");
check(/window\.addEventListener\(["']scroll["'],\s*schedule,\s*\{\s*passive:\s*true/.test(cinematicController) && !/arrivalCrossingDirection|scrollIntentFor|reverseFrameForElapsed|reviseReversePlan/.test(cinematicController), "single-scroll-authority", "src/scripts/home-cinematic-integration.ts", "native document position must be the sole single-valued authority in both directions");
check(matches(cinematicController, /presentedPhysicalFrame\s*=(?!=)/g) === 2 && /addEventListener\(\s*["']seeked["'][\s\S]{0,180}presentedPhysicalFrame\s*=\s*frameAtTime/.test(cinematicController), "presented-frame-authority", "src/scripts/home-cinematic-integration.ts", "presented-frame telemetry may be initialized once and updated only by decoder seek completion");
check(/const\s+settled\s*=\s*scrollProgress\s*>=\s*0\.9995/.test(cinematicController) && /navigationReleasePoint\s*=\s*audienceTop\s*-\s*window\.innerHeight/.test(cinematicController) && /setThresholdInteraction\(settled, navigationReleased\)/.test(cinematicController), "manifesto-chrome-boundary", "src/scripts/home-cinematic-integration.ts", "manifesto settlement and the reversible audience/chrome threshold must remain separate");
check(/header\.setAttribute\(["']inert["']/.test(cinematicController) && /field\.setAttribute\(["']inert["']/.test(cinematicController) && /header\.removeAttribute\(["']inert["']/.test(cinematicController) && /field\.removeAttribute\(["']inert["']/.test(cinematicController), "threshold-inert-state", "src/scripts/home-cinematic-integration.ts", "header and downstream fields must remain inert through the pure manifesto hold and release at audience entry");
check(/mobileMenu\?\.removeAttribute\(["']open["']\)/.test(cinematicController), "reverse-menu-close", "src/scripts/home-cinematic-integration.ts", "reverse concealment must close the mobile menu");
check(/skipLink\.focus\(\{\s*preventScroll:\s*true\s*\}\)/.test(cinematicController) && /entry\.focus\(\{\s*preventScroll:\s*true\s*\}\)/.test(cinematicController), "reverse-focus-safety", "src/scripts/home-cinematic-integration.ts", "reverse concealment must move focus out of newly hidden regions without scrolling");
check(/skipLink\.addEventListener\(["']click["'],\s*handleSkip/.test(cinematicController) && /setThresholdInteraction\(true, false\)/.test(cinematicController) && /entry\.focus\(\{\s*preventScroll:\s*true\s*\}\)/.test(cinematicController), "native-skip-settle", "src/scripts/home-cinematic-integration.ts", "the native #entry skip must synchronously settle and focus the manifesto without waiting for media");
check(/const\s+releaseMissingDom/.test(cinematicController) && /cinematicFallback\s*=\s*["']required-dom["']/.test(cinematicController), "required-dom-fallback", "src/scripts/home-cinematic-integration.ts", "missing required DOM must synchronously release candidate concealment and inert states");
check(/pagehide[\s\S]{0,800}cancelAnimationFrame\(animationFrame\)[\s\S]{0,120}animationFrame\s*=\s*0/.test(cinematicController), "bfcache-frame-reset", "src/scripts/home-cinematic-integration.ts", "BFCache/pagehide cancellation must reset the requestAnimationFrame handle");
check(/history\.replaceState\([\s\S]*?quantumHomeCinematic:\s*\{\s*version:\s*4,\s*settledOrLower\s*\}/.test(cinematicController) && /restoredState\?\.version\s*===\s*4/.test(indexSource), "restored-scroll-metadata", "Home cinematic integration", "the current history entry and bootstrap must share the Phase 5A-R settled-state contract without stale Phase 5A semantics");
check(!/localStorage|sessionStorage|document\.cookie|cookieStore/.test(`${indexSource}\n${cinematicController}`), "no-persistent-skip", "Home cinematic bootstrap/controller", "cinematic eligibility must not use cookies or persistent web storage");
check(!/cinematicFocus|cinematicDeepLink|preserveGeometry|cinematicHeader\s*=\s*["']visible["']/.test(`${indexSource}\n${cinematicController}\n${cinematicCss}`), "superseded-chrome-state", "Home cinematic integration", "focus reveals, enhanced deep links, legacy partial-failure flags, and early visible header states are prohibited");
check(
  /cinematicFailureDisposition/.test(cinematicController)
    && /failed-preserve-runway/.test(cinematicController)
    && /releaseMedia\(\)/.test(cinematicController)
    && /cinematicDocumentStateForScroll/.test(cinematicController)
    && /return enhancedCommitted \? "preserve-runway" : "static"/.test(cinematicController)
    && /root\.dataset\.cinematicMode\s*=\s*["']static["'][\s\S]{0,220}clearCinematicStyles\(\)/.test(cinematicController)
    && !/querySelectorAll\(["']source["']\)[\s\S]{0,160}removeAttribute\(["']srcset["']\)/.test(cinematicController),
  "media-failure-geometry",
  "src/scripts/home-cinematic-integration.ts",
  "only pre-commit failures may use compact static flow; every post-commit failure or preference/typography change must release video/Blob resources while retaining the poster, enhanced runway, and native document progress",
);
check(
  /failed-preserve-runway["']\]\s+\.cinematic-poster\s*\{[\s\S]{0,180}display:\s*block[\s\S]{0,180}opacity:\s*1/.test(cinematicCss)
    && /failed-preserve-runway["']\]\s+\.cinematic-media\s*\{[\s\S]{0,120}display:\s*none/.test(cinematicCss),
  "media-failure-poster",
  "src/styles/routes/home-cinematic.css",
  "geometry-preserving failure must visibly retain the static poster while hiding the released decoder surface",
);

for (const [relative, controller] of [
  ["src/scripts/home-cinematic-integration.ts", cinematicController],
  ["src/scripts/home-operating-field.ts", operatingController],
]) {
  check(/addEventListener\(\s*["']scroll["'][\s\S]{0,180}passive\s*:\s*true/.test(controller), "passive-scroll", relative, "scroll observation must be passive");
  check(/requestAnimationFrame\s*\(/.test(controller), "scroll-coalescing", relative, "scroll-derived writes must be coalesced with requestAnimationFrame");
  check(/ResizeObserver/.test(controller), "resize-strategy", relative, "geometry must be invalidated through ResizeObserver");
  check(/visibilitychange/.test(controller) && /pageshow/.test(controller) && /pagehide/.test(controller), "lifecycle-strategy", relative, "controller must handle visibility, restore, and page lifecycle");
  for (const prohibited of [
    [/addEventListener\(\s*["'](?:wheel|mousewheel|touchmove|pointermove|keydown|keyup)["']/, "direct wheel, touch, pointer, or keyboard interception"],
    [/\.preventDefault\s*\(/, "event cancellation"],
    [/(?:\b(?:scrollTo|scrollBy)\s*\(|(?:window|document\.(?:documentElement|body))\.scroll\s*\()/, "programmatic scrolling"],
    [/\.scrollTop\s*=/, "scrollTop mutation"],
    [/\bsetInterval\s*\(/, "queued/perpetual timeline"],
    [/\b(?:velocity|momentum|inertia|deltaY)\b/i, "synthetic velocity or inertia"],
    [/\b(?:ScrollTrigger|Lenis|LocomotiveScroll|gsap)\b/, "third-party/custom scroll engine"],
  ]) check(!prohibited[0].test(controller), "native-scroll-authority", relative, `${prohibited[1]} is prohibited`);
}
check(matches(cinematicController, /\b(?:window\.)?setTimeout\s*\(/g) <= 1 && /decode-timeout|load-timeout/.test(cinematicController), "no-playback-timer", "src/scripts/home-cinematic-integration.ts", "the sole permitted timeout is the media fail-open watchdog; CRT startup has no playback clock");
check(!/\b(?:window\.)?setTimeout\s*\(/.test(operatingController), "no-playback-timer", "src/scripts/home-operating-field.ts", "the Phase 2B controller must remain free of playback/timeline timers");

const homeStyleFiles = ["home.css", "home-method.css", "home-responsive.css", "home-cinematic.css"];
const homeStyles = (await Promise.all(homeStyleFiles.map((file) => readOrFail(`src/styles/routes/${file}`)))).join("\n");
check(!/scroll-snap-(?:type|align|stop)\s*:/i.test(homeStyles), "scroll-snap", "src/styles/routes/home*.css", "Home must not use forced scroll snapping");
check(!/\boverflow-y\s*:\s*(?:auto|scroll)/i.test(homeStyles), "nested-scroll", "src/styles/routes/home*.css", "Home must not create a nested vertical scroll container");
check(!/(?:^|[;{])\s*overflow\s*:[^;}]*\b(?:auto|scroll)\b/im.test(homeStyles), "nested-scroll", "src/styles/routes/home*.css", "Home must not create an overflow shorthand scroll container");
check(!/\btouch-action\s*:\s*none/i.test(homeStyles), "touch-lock", "src/styles/routes/home*.css", "Home must not suppress native touch scrolling");
check(/data-cinematic-header=["']concealed["'][\s\S]{0,180}\.site-header[\s\S]{0,260}visibility:\s*hidden[\s\S]{0,160}opacity:\s*0[\s\S]{0,160}pointer-events:\s*none/.test(cinematicCss), "concealed-chrome-css", "src/styles/routes/home-cinematic.css", "the complete pre-settled header must be invisible, transparent, and pointer-safe");
check(!/:focus-within[\s\S]{0,160}(?:site-header|entry-field)|cinematic-focus/.test(cinematicCss), "no-focus-reveal-css", "src/styles/routes/home-cinematic.css", "keyboard focus must never reveal concealed chrome or ENTRY prematurely");
check(
  /@media\s*\(max-height:\s*30rem\)\s*and\s*\(min-width:\s*36rem\)[\s\S]*?\.manifesto-field__content\s*\{[\s\S]*?padding-top:\s*clamp\(1\.35rem,\s*7svh,\s*2\.7rem\)[\s\S]*?\.audience-field__content\s*\{/.test(homeStyles),
  "short-landscape-manifesto-fit",
  "src/styles/routes/home-responsive.css",
  "the short-landscape regime must keep the manifesto top-authored and give the following audience field an intentional composition",
);
for (const marker of [
  "quantum-hub.phase-4r1.chrome-evidence.v2",
  "current-runtime chrome-state proxy — R1 physical runtime integration not authorized",
  "phase4r1-chrome-evidence-report.json",
  "Page.lifecycleEvent",
  "firstContentfulPaint",
  "Page.captureScreenshot",
  "Runtime.evaluate",
  "no-first-paint-flash",
  "firstPaintHadNoChrome && controllerReleasedAt === null",
  "requiredStateIds",
  "requiredCheckIds",
  "stateCheckInventory",
  "reportSelfHashExcluded: true",
]) check(chromeEvidenceCapture.includes(marker), "chrome-capture-contract", "scripts/capture-phase4r1-chrome-evidence.mjs", `dedicated external capture must retain ${marker}`);
for (const stateId of [
  "first-paint-desktop", "first-paint-mobile", "dormancy", "conduction-25", "conduction-50", "q-activation", "q-hold", "approach", "threshold", "breathing", "entry-first-readable", "entry-settled", "reverse-one-step", "fast-jump-forward", "fast-jump-reverse", "fast-jump-latest", "skip-media-pending", "reduced-motion", "no-javascript", "deep-link-entry", "deep-link-method", "restored-settled", "restored-lower", "text-200-desktop", "text-200-mobile", "media-abort", "media-404", "supporting-about", "real-404",
]) check(chromeEvidenceCapture.includes(`"${stateId}"`), "chrome-capture-state", "scripts/capture-phase4r1-chrome-evidence.mjs", `external capture is missing required state ${stateId}`);
for (const [roleId, filename] of [
  ["CHROME_FIRST_PAINT_DESKTOP", "first-paint-desktop.png"],
  ["CHROME_FIRST_PAINT_MOBILE", "first-paint-mobile.png"],
  ["CHROME_MILESTONES_DESKTOP_SHEET", "chrome-visibility-desktop-sheet.png"],
  ["CHROME_MILESTONES_MOBILE_SHEET", "chrome-visibility-mobile-sheet.png"],
  ["CHROME_REVEAL_REVERSE_RECORDING", "chrome-reveal-reverse.mp4"],
  ["CHROME_SKIP_PENDING_RECORDING", "chrome-skip-media-pending.mp4"],
  ["CHROME_FALLBACKS_SHEET", "chrome-fallbacks-sheet.png"],
]) check(chromeEvidenceCapture.includes(`"${roleId}"`) && chromeEvidenceCapture.includes(`"${filename}"`), "chrome-capture-role", "scripts/capture-phase4r1-chrome-evidence.mjs", `${roleId} must bind ${filename}`);
check(!/artifactRecord\([^\n]+CHROME_MACHINE_REPORT/.test(chromeEvidenceCapture), "chrome-report-self-hash", "scripts/capture-phase4r1-chrome-evidence.mjs", "the machine report must be contract-bound, not placed in its own hash-bearing artifacts array");
check(/producerAuthorities\s*=\s*\{[\s\S]{0,900}captureScript:[\s\S]{0,300}artifactBuilder:[\s\S]{0,300}browserQa:[\s\S]{0,300}controller:/.test(chromeEvidenceCapture), "chrome-producer-authority", "scripts/capture-phase4r1-chrome-evidence.mjs", "capture report must bind all tracked producer authorities");
check(/Refusing to overwrite existing evidence directory/.test(chromeEvidenceCapture) && /Chrome evidence must be external to Git/.test(chromeEvidenceCapture), "chrome-external-output", "scripts/capture-phase4r1-chrome-evidence.mjs", "capture must write only to a new external directory without overwriting evidence");
check(/workingTreeClean[\s\S]{0,500}headMatchesUpstream[\s\S]{0,200}headMatchesRemote/.test(chromeEvidenceCapture) && /ls-remote/.test(chromeEvidenceCapture), "chrome-git-authority", "scripts/capture-phase4r1-chrome-evidence.mjs", "final capture must fail closed unless HEAD is clean and independently matches upstream/remote");
check(
  /^\/media\/cinematic\/phase-4r2\/manifests\/\*\s+Cache-Control:\s*public,\s*max-age=0,\s*must-revalidate\s*$/m.test(cloudflareHeaders.replace(/\r?\n[ \t]+/g, " ")),
  "cinematic-manifest-cache-policy",
  "public/_headers",
  "the stable Phase 4-R2 manifest must revalidate instead of retaining stale authority",
);
for (const nested of ["media", "posters"]) check(
  new RegExp(`^/media/cinematic/phase-4r2/${nested}/\\*\\s+Cache-Control:\\s*public,\\s*max-age=31556952,\\s*immutable\\s*$`, "m").test(cloudflareHeaders.replace(/\r?\n[ \t]+/g, " ")),
  "cinematic-immutable-cache-policy",
  "public/_headers",
  `hash-named Phase 4-R2 ${nested} must retain long immutable caching`,
);
check(
  /^\/_astro\/\*\s+Cache-Control:\s*public,\s*max-age=31556952,\s*immutable\s*$/m.test(cloudflareHeaders.replace(/\r?\n[ \t]+/g, " ")),
  "runtime-immutable-cache-policy",
  "public/_headers",
  "hash-named Astro runtime assets must retain long immutable caching",
);

for (const route of SUPPORTING_ROUTES) {
  const source = await readOrFail(route.source);
  check(!/home-cinematic-integration|home-operating-field|components\/home|routes\/home(?:-|\.)|\/media\/cinematic\//.test(source), "supporting-route-isolation", route.source, `${route.path} must not import or reference Home cinematic/runtime assets`);
}
check(/skipHref\?:\s*string/.test(layoutSource) && /skipLabel\?:\s*string/.test(layoutSource), "layout-skip-props", "src/layouts/BaseLayout.astro", "BaseLayout must expose optional skip-link props");
check(/skipHref\s*=\s*["']#main-content["']/.test(layoutSource) && /skipLabel\s*=\s*["']Skip to content["']/.test(layoutSource), "supporting-skip-default", "src/layouts/BaseLayout.astro", "supporting routes must retain the standard skip-to-content defaults");
try {
  const acceptedLayout = normalizeLineEndings(git("show", `${ACCEPTED_PHASE3}:src/layouts/BaseLayout.astro`));
  const expectedLayout = acceptedLayout
    .replace("  bodyClass?: string;\n", "  bodyClass?: string;\n  skipHref?: string;\n  skipLabel?: string;\n")
    .replace("  bodyClass = \"\",\n", "  bodyClass = \"\",\n  skipHref = \"#main-content\",\n  skipLabel = \"Skip to content\",\n")
    .replace('<a class="skip-link" href="#main-content">Skip to content</a>', '<a class="skip-link" href={skipHref}>{skipLabel}</a>')
    .replace('    <title>{documentTitle}</title>\n', '    <slot name="head" />\n    <title>{documentTitle}</title>\n');
  check(normalizeLineEndings(layoutSource).trim() === expectedLayout.trim(), "shared-layout-scope", "src/layouts/BaseLayout.astro", "shared BaseLayout changes must be limited to configurable skip-link props and the generic head slot, with unchanged supporting-route defaults");
} catch (error) {
  check(false, "layout-baseline", "src/layouts/BaseLayout.astro", `could not compare shared layout with accepted Phase 3: ${error.message}`);
}
check(
  /data-manifesto-threshold/.test(entrySource)
    && /class=["']manifesto-field__content["']/.test(entrySource)
    && !/manifesto-field__content[\s\S]*?(?:field-label|entry-path|audience-trajectory)/.test(entrySource.match(/<section\b[\s\S]*?<\/section>/)?.[0] ?? ""),
  "manifesto-integration-scope",
  "src/components/home/EntryField.astro",
  "the authorized manifesto section must contain only its H1 content and keep audience routing in the following section",
);

// The staging recipe and both authoritative/staged inventories are independently pinned.
check(matches(stageSource, /\bsource:\s*["']/g) === MEDIA_ASSETS.length && matches(stageSource, /\boutput:\s*["']/g) === MEDIA_ASSETS.length, "stage-inventory-count", "scripts/stage-phase4-media.mjs", "media staging recipe must contain exactly seven source/output records");
check(/readdir\(OUTPUT_ROOT/.test(stageSource) && /expectedOutputs/.test(stageSource) && /unlink\(/.test(stageSource), "stage-prunes-extras", "scripts/stage-phase4-media.mjs", "media staging must remove unexpected generated files");
check(/PHASE4R2_FINAL_AUTHORITY/.test(stageSource) && /Pruned .*legacy cinematic/.test(stageSource) && /entry\.name === "phase-4r2"/.test(stageSource), "stage-final-prune", "scripts/stage-phase4-media.mjs", "final R2 staging must remove every flat legacy cinematic payload while retaining only the isolated R2 subtree");
check(/PHASE4R2_FINAL_AUTHORITY/.test(stageR2Source) && /loadAndValidatePhase4R21Authority/.test(stageR2Source) && /expectedPaths\.length === 10/.test(stageR2Source) && /runtimePaths\.length === 7/.test(stageR2Source) && /replaceAuthorityRootAtomically/.test(stageR2Source) && /removeUnlistedFiles/.test(stageR2Source) && /rename\(tempRoot, outputRoot\)/.test(stageR2Source) && /strict six-asset H\.264 authority/.test(stageR2Source), "stage-r2-authority", "scripts/stage-phase4r2-runtime-media.mjs", "active R2.1 staging must validate the exact ten-file tracked authority, exact seven-file public tree, H.264-only inventory, source hash, and atomic replacement/cleanup contract");
check(/AUTHORITY_ROOT/.test(buildDispatcherSource) && /phase-4r2-1-causal-signal-scroll-stability/.test(buildDispatcherSource) && /AUTHORITY_MANIFEST/.test(buildDispatcherSource) && /resolveBuildMode/.test(buildDispatcherSource) && /run-phase4r2-final-build\.mjs/.test(buildDispatcherSource) && /stage-phase4-media\.mjs/.test(buildDispatcherSource), "default-build-dispatch", "scripts/run-phase4-build.mjs", "the default build dispatcher must select mandatory final authority whenever CP3 has materialized the tracked active R2.1 authority, otherwise preserve development fallback");
check(/PHASE4R2_FINAL_AUTHORITY: "1"/.test(finalBuildSource) && /stage-phase4-media\.mjs/.test(finalBuildSource) && /stage-phase4r2-runtime-media\.mjs/.test(finalBuildSource) && /node_modules\/astro\/bin\/astro\.mjs/.test(finalBuildSource) && /verify-phase4-output\.mjs/.test(finalBuildSource), "final-build-contract", "scripts/run-phase4r2-final-build.mjs", "the explicit R2 final build must set final authority and run legacy pruning, R2 staging, Astro build, and output verification in order");
check(/r2CinematicInventory/.test(outputVerifierSource) && /phase4r2-final-inventory/.test(outputVerifierSource) && /phase4r2-final-no-fallback/.test(outputVerifierSource) && /phase4r2-final-poster-binding/.test(outputVerifierSource) && /phase4r2-runtime-binding/.test(outputVerifierSource) && /phase4r2-manifest-byte-parity/.test(outputVerifierSource) && /loadAndValidatePhase4R21Authority/.test(outputVerifierSource) && /FINAL_AUTHORITY_EXPECTED \? \[\] : MEDIA_ASSETS/.test(outputVerifierSource), "final-output-contract", "scripts/verify-phase4-output.mjs", "final output verification must require the active tracked R2.1 authority, exact emitted manifest bytes, three H.264 videos, three posters, runtime bindings, and no legacy fallback/VP9 payload");

// These are structural cross-checks only: the authoritative capture, deployment,
// and human-review tools retain their own full self-tests.
const r2GateNames = ["PHYSICAL → DIGITAL CONTINUITY", "NATIVE SCROLL + REVERSE INTEGRITY", "RESPONSIVE + ACCESSIBLE INTEGRATION", "MEDIA + PERFORMANCE SAFETY", "OPERATING FIELD REGRESSION"];
for (const [label, source, location] of [
  ["capture", r2EvidenceCapture, "scripts/capture-phase4r2-production-evidence.mjs"],
  ["deployment", r2DeploymentVerifier, "scripts/verify-phase4r2-deployment.mjs"],
  ["human-review", r2HumanReviewPackager, "scripts/package-phase4r2-human-review.mjs"],
]) check(/HUMAN_REVIEW_GATES/.test(source) && r2GateNames.every((gate) => source.includes(gate)), "r2-human-gates", location, `${label} contract must retain the five canonical human-review gates`);
check(/FRAME_COUNT = 540/.test(r2EvidenceCapture) && /PHYSICAL_FRAME_END = 500/.test(r2EvidenceCapture) && matches(r2EvidenceCapture, /^  \{ id: ".*", width:/gm) === 13 && /frame: 500/.test(r2EvidenceCapture) && /frame: 501/.test(r2EvidenceCapture) && /frame: 513/.test(r2EvidenceCapture) && /frame: 514/.test(r2EvidenceCapture) && /frame: 540/.test(r2EvidenceCapture), "r2-capture-contract", "scripts/capture-phase4r2-production-evidence.mjs", "R2 capture must retain the 540-coordinate, 500+13+27 milestone and 13-viewpoint contract");
check(/MANIFEST_RELATIVE = "artifacts\/original\/phase-4r2-final-cinematic-production\/manifests\/phase-4r2-production-media-manifest\.json"/.test(r2DeploymentVerifier) && /DEPLOYED_ASSET_PREFIX = "\/media\/cinematic\/phase-4r2\/"/.test(r2DeploymentVerifier), "r2-deployment-path-contract", "scripts/verify-phase4r2-deployment.mjs", "deployment verification must retain the canonical nested R2 authority and deployed prefix");
check(r2HumanReviewPackager.includes('const ARCHIVE_FILENAME = "phase-4r2-final-cinematic-production-human-review.zip";') && r2HumanReviewPackager.includes("const EXPECTED_COUNTS = Object.freeze({ sheets: 16, recordings: 7, reports: 17, payloads: 40, archiveEntries: 42 });") && /VIEWPOINT_MILESTONE_FRAMES/.test(r2HumanReviewPackager) && /500, 501/.test(r2HumanReviewPackager) && /513, 514/.test(r2HumanReviewPackager) && r2HumanReviewPackager.includes("540") && r2HumanReviewPackager.includes('const DEPLOYED_ASSET_PREFIX = "/media/cinematic/phase-4r2/";'), "r2-package-contract", "scripts/package-phase4r2-human-review.mjs", "human-review packaging must retain its canonical ZIP basename, exact inventory, threshold milestones, and nested path model");
try {
  const packageManifest = JSON.parse(packageSource);
  check(packageManifest.scripts?.build === "node scripts/run-phase4-build.mjs" && packageManifest.scripts?.["build:phase4r2-final"] === "node scripts/run-phase4r2-final-build.mjs", "final-build-script", "package.json", "package.json must dispatch ordinary Pages builds to final authority after CP5 and expose the explicit portable Phase 4-R2 final build command");
} catch (error) {
  check(false, "package-json", "package.json", `package manifest must remain valid JSON: ${error.message}`);
}

// CP5 is optional until it exists. From the first authority pathname onward,
// however, the complete graph must validate and every governed file must be
// tracked. A partial, stale, renamed, or merely untracked authority cannot be
// mistaken for release input.
const r2AuthorityRoot = path.resolve(ROOT, ...PHASE4R21_AUTHORITY_RELATIVE.split("/"));
let r2AuthorityPresent = false;
try {
  const info = await stat(r2AuthorityRoot);
  r2AuthorityPresent = true;
  check(info.isDirectory(), "r2-authority-root", PHASE4R21_AUTHORITY_RELATIVE, "active R2.1 authority root must be a directory");
} catch (error) {
  if (error?.code !== "ENOENT") check(false, "r2-authority-root", PHASE4R21_AUTHORITY_RELATIVE, `could not inspect active R2.1 authority root: ${error.message}`);
}
check(!FINAL_AUTHORITY_EXPECTED || r2AuthorityPresent, "r2-final-authority-required", PHASE4R21_MANIFEST_RELATIVE, "final-authority source verification requires the complete tracked active R2.1 authority");
if (r2AuthorityPresent) {
  try {
    const authority = await loadAndValidatePhase4R21Authority({ authorityRoot: r2AuthorityRoot, repositoryRoot: ROOT });
    const expectedTracked = authority.expectedAuthorityPaths.map((relative) => `${PHASE4R21_AUTHORITY_RELATIVE}/${relative}`).sort();
    const observedTracked = lines(git("ls-files", "--", PHASE4R21_AUTHORITY_RELATIVE)).map((relative) => relative.replaceAll("\\", "/")).sort();
    check(JSON.stringify(observedTracked) === JSON.stringify(expectedTracked), "r2-authority-tracked", PHASE4R21_AUTHORITY_RELATIVE, "every and only active R2.1 manifest/frame-manifest/H.264/poster authority path must be tracked", { expected: expectedTracked, observed: observedTracked });
    const blendRelative = PHASE4R21_SOURCE_BLEND_RELATIVE;
    const blendPayload = await readFile(path.join(ROOT, ...blendRelative.split("/")));
    check(blendPayload.length === PHASE4R21_SOURCE_BLEND_BYTES && sha256(blendPayload) === PHASE4R21_SOURCE_BLEND_SHA256, "r2-source-blend", blendRelative, "active manifest sourceBlendSha256 must resolve to the exact cumulative R2.1 Blender bytes", { bytes: blendPayload.length, sha256: sha256(blendPayload) });
  } catch (error) {
    check(false, "r2-authority-graph", PHASE4R21_AUTHORITY_RELATIVE, `active R2.1 authority failed complete source/frame-manifest/runtime-media validation: ${error.message}`);
  }
}
for (const asset of MEDIA_ASSETS) {
  const normalizedStage = stageSource.replaceAll("_", "");
  check(stageSource.includes(`source: "${asset.source}"`) && stageSource.includes(`output: "${asset.output}"`) && normalizedStage.includes(`bytes: ${asset.bytes}`) && stageSource.includes(asset.sha256), "stage-asset-authority", "scripts/stage-phase4-media.mjs", `staging recipe must pin the path, byte size, and hash for ${asset.output}`);
  await verifyFile(`artifacts/original/phase-3-crt-opening/${asset.source}`, asset, "accepted Phase 3 source");
  if (!FINAL_AUTHORITY_EXPECTED) await verifyFile(`public/media/cinematic/${asset.output}`, asset, "staged Phase 4 production asset");
}
try {
  const outputRoot = path.join(ROOT, "public", "media", "cinematic");
  const entries = await readdir(outputRoot, { withFileTypes: true });
  const observed = entries.map(({ name }) => name).sort();
  const expected = (FINAL_AUTHORITY_EXPECTED ? [] : MEDIA_ASSETS.map(({ output }) => output)).sort();
  check(entries.every((entry) => entry.isFile() || entry.name === "phase-4r2"), "staged-media-shape", "public/media/cinematic", "generated cinematic media root may contain legacy files and the isolated R2 directory only");
  check(JSON.stringify(observed.filter((name) => name !== "phase-4r2")) === JSON.stringify(expected), "staged-media-inventory", "public/media/cinematic", FINAL_AUTHORITY_EXPECTED ? "final staging must contain no flat legacy cinematic payloads" : "development staging must contain exactly the seven accepted legacy files plus optional isolated R2 authority", observed);
} catch (error) {
  check(false, "staged-media-root", "public/media/cinematic", `generated media inventory is unavailable; run the Phase 4 staging script: ${error.message}`);
}

try {
  const changed = [
    ...lines(git("diff", "--name-only", ACCEPTED_PHASE3, "--", "src", "public", "astro.config.mjs")),
    ...lines(git("ls-files", "--others", "--exclude-standard", "--", "src", "public")),
  ].map((file) => file.replaceAll("\\", "/"));
  const permitted = PHASE5B_ROUTE_SCOPE_ALLOWED ? [...ALLOWED_PRODUCTION_CHANGES, ...PHASE5B_ROUTE_PRODUCTION_CHANGES] : ALLOWED_PRODUCTION_CHANGES;
  const unexpected = [...new Set(changed)].sort().filter((file) => !permitted.some((pattern) => pattern.test(file)));
  const scopeMessage = PHASE5B_ROUTE_SCOPE_ALLOWED
    ? "Phase 4 Home changes and the explicit Phase 5B supporting-route production surface are the only permitted production changes"
    : "Phase 4 may change only the isolated Home integration surface and configurable skip-link shell";
  check(unexpected.length === 0, "production-scope", "src + public + astro.config.mjs", scopeMessage, unexpected);
} catch (error) {
  check(false, "production-baseline", "git", `could not compare production source with accepted Phase 3: ${error.message}`);
}
try {
  const currentPackage = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const acceptedPackage = JSON.parse(git("show", `${ACCEPTED_PHASE3}:package.json`));
  for (const key of ["dependencies", "devDependencies", "overrides"]) {
    check(JSON.stringify(currentPackage[key] ?? {}) === JSON.stringify(acceptedPackage[key] ?? {}), "dependency-freeze", "package.json", `${key} must remain equivalent to accepted Phase 3`, { accepted: acceptedPackage[key] ?? {}, current: currentPackage[key] ?? {} });
  }
} catch (error) {
  check(false, "dependency-baseline", "package.json", `could not compare dependency manifests: ${error.message}`);
}

const cinematicControllerBytes = cinematicController ? (await stat(path.join(ROOT, "src", "scripts", "home-cinematic-integration.ts"))).size : 0;
const cinematicCssBytes = cinematicCss ? (await stat(path.join(ROOT, "src", "styles", "routes", "home-cinematic.css"))).size : 0;
check(cinematicControllerBytes <= 44 * 1024, "controller-source-budget", "src/scripts/home-cinematic-integration.ts", `the Phase 5A scroll mapping, late-failure, and lifecycle controller must remain at or below 44 KiB; observed ${cinematicControllerBytes.toLocaleString("en-US")} bytes`);
check(cinematicCssBytes <= 15 * 1024, "cinematic-css-source-budget", "src/styles/routes/home-cinematic.css", `authored cinematic CSS must remain at or below 15 KiB; observed ${cinematicCssBytes.toLocaleString("en-US")} bytes`);

if (failures.length > 0) {
  console.error(`Phase 4 source verification failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) {
    console.error(`- [${failure.code}] ${failure.location}: ${failure.message}`);
    if (failure.details !== undefined) console.error(`  ${JSON.stringify(failure.details)}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Verified Phase 4-R2 source: exact seven-chapter semantics, responsive manifest-bound SSR posters, 500+13+27 timeline authority, native-scroll-only controllers, and bounded authored integration (${cinematicControllerBytes.toLocaleString("en-US")} B TS + ${cinematicCssBytes.toLocaleString("en-US")} B CSS).`);
}
