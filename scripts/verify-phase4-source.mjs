import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { ALL_HTML_ROUTES, PUBLIC_INDUSTRY_NAMES } from "./phase1-qa-config.mjs";

const ROOT = process.cwd();
const ACCEPTED_PHASE3 = "2fdee6feb9664578c6c8243d1b80ea885235279f";
const REQUIRED_ANCESTORS = Object.freeze([
  ["Phase 2B", "b54f3a83b6180466127589a8d028f94dab892d17"],
  ["Phase 2A-R", "4121e009b970cce480c4220c964cbc218e35d73c"],
  ["Phase 1", "c37eff7da9ada99e4d65e2a76f89871b9a706db0"],
  ["Phase 0", "9aec62c1d89ebb2095bbc8903a718f77bbb6dbda"],
]);
const HOME_COMPONENTS = Object.freeze([
  { tag: "EntryField", file: "EntryField.astro", id: "entry", heading: "h1", label: "home-title" },
  { tag: "BuiltWithIndustry", file: "BuiltWithIndustry.astro", id: "built-with-industry", heading: "h2", label: "industry-model-title" },
  { tag: "MethodField", file: "MethodField.astro", id: "method", heading: "h2", label: "method-title" },
  { tag: "IndustryTerritories", file: "IndustryTerritories.astro", id: "industries", heading: "h2", label: "industries-title" },
  { tag: "ProofField", file: "ProofField.astro", id: "proof", heading: "h2", label: "proof-title" },
  { tag: "ProgrammesField", file: "ProgrammesField.astro", id: "programmes", heading: "h2", label: "programmes-title" },
  { tag: "ConversionField", file: "ConversionField.astro", id: "conversion", heading: "h2", label: "conversion-title" },
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
const VIDEO_OUTPUTS = MEDIA_ASSETS.filter(({ output }) => /\.(?:mp4|webm)$/.test(output));
const POSTER_OUTPUTS = MEDIA_ASSETS.filter(({ output }) => /\.png$/.test(output));
const SUPPORTING_ROUTES = ALL_HTML_ROUTES.filter(({ path: routePath }) => routePath !== "/");
const ALLOWED_PRODUCTION_CHANGES = Object.freeze([
  /^src\/components\/home\/EntryField\.astro$/,
  /^src\/layouts\/BaseLayout\.astro$/,
  /^src\/pages\/index\.astro$/,
  /^src\/scripts\/home-cinematic-integration\.ts$/,
  /^src\/styles\/routes\/home-cinematic\.css$/,
  /^public\/_headers$/,
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
const stageSource = await readOrFail("scripts/stage-phase4-media.mjs", "media-stage-missing");
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
  check(new RegExp(`data-home-scene=["']${component.id}["']`, "i").test(source), "home-chapter-hook", `src/components/home/${component.file}`, `chapter must retain data-home-scene=${component.id}`);
  check(new RegExp(`aria-labelledby=["']${component.label}["']`, "i").test(source), "home-chapter-label", `src/components/home/${component.file}`, `chapter must be labelled by ${component.label}`);
  check(new RegExp(`<${component.heading}\\b[^>]*\\bid=["']${component.label}["']`, "i").test(source), "home-chapter-heading", `src/components/home/${component.file}`, `chapter must retain its ${component.heading.toUpperCase()} label target`);
}
check(h1Count === 1, "home-h1-count", "src/pages/index.astro + src/components/home", `Home must contain exactly one literal H1; observed ${h1Count}`);

const entrySource = componentSources.get("EntryField") ?? "";
check(/<h1\b[^>]*>[\s\S]*Where do[\s\S]*you enter\?[\s\S]*<\/h1>/i.test(entrySource), "entry-h1", "src/components/home/EntryField.astro", "WHERE DO YOU ENTER? must remain the settled semantic H1");
check(/<section\b[\s\S]*?\bid=["']entry["'][\s\S]*?\btabindex=["']-1["']/.test(entrySource), "skip-target-focus", "src/components/home/EntryField.astro", "the cinematic skip target must be programmatically focusable");
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
const indexCinematicPaths = [...indexSource.matchAll(/["'](\/media\/cinematic\/[^"']+)["']/g)].map((match) => match[1]);
const expectedPosterPaths = POSTER_OUTPUTS.map(({ output }) => `/media/cinematic/${output}`).sort();
check(JSON.stringify([...new Set(indexCinematicPaths)].sort()) === JSON.stringify(expectedPosterPaths), "poster-inventory", "src/pages/index.astro", "SSR Home may reference exactly the three accepted dormant posters", indexCinematicPaths);
const controllerCinematicPaths = [...cinematicController.matchAll(/["'](\/media\/cinematic\/[^"']+\.(?:mp4|webm))["']/g)].map((match) => match[1]);
const expectedVideoPaths = VIDEO_OUTPUTS.map(({ output }) => `/media/cinematic/${output}`).sort();
check(JSON.stringify([...new Set(controllerCinematicPaths)].sort()) === JSON.stringify(expectedVideoPaths), "controller-media-inventory", "src/scripts/home-cinematic-integration.ts", "controller must contain exactly the four accepted video candidates", controllerCinematicPaths);

check(/prefers-reduced-motion:\s*reduce/.test(indexSource), "reduced-motion-bootstrap", "src/pages/index.astro", "Home must decide reduced motion before loading the cinematic controller");
check(matches(indexSource, /import\(["']\.\.\/scripts\/home-cinematic-integration["']\)/g) === 1, "cinematic-lazy-load", "src/pages/index.astro", "Home must lazy-load exactly one cinematic controller");
check(indexSource.indexOf("prefers-reduced-motion: reduce") < indexSource.indexOf("home-cinematic-integration"), "reduced-motion-order", "src/pages/index.astro", "reduced-motion gate must precede the cinematic import");
check(/root\.dataset\.cinematicMode\s*===\s*["']candidate["']/.test(indexSource), "capability-gated-import", "src/pages/index.astro", "cinematic import must be gated by candidate mode");
check(
  matches(cinematicController, /fetch\(selectedSource/g) === 1
    && matches(cinematicController, /video\.src\s*=/g) === 1
    && /response\.blob\(\)/.test(cinematicController)
    && /mediaObjectUrl\s*=\s*URL\.createObjectURL\(mediaBlob\)/.test(cinematicController)
    && /video\.src\s*=\s*mediaObjectUrl/.test(cinematicController),
  "runtime-media-selection",
  "src/scripts/home-cinematic-integration.ts",
  "exactly one selected asset must be fetched and assigned through one seekable Blob URL without source hot-swaps",
);
check(/URL\.revokeObjectURL\(mediaObjectUrl\)/.test(cinematicController) && /mediaAbortController\.abort\(\)/.test(cinematicController), "runtime-media-cleanup", "src/scripts/home-cinematic-integration.ts", "Blob media delivery must be aborted and revoked during fail-open or teardown");
check(!/createElement\(\s*["'](?:video|source)["']/.test(cinematicController), "single-decoder", "src/scripts/home-cinematic-integration.ts", "controller must not create additional video/source elements");
const reducedGate = cinematicController.indexOf("motion.matches || !codec || !portalFits()");
const mediaFetch = cinematicController.indexOf("fetch(selectedSource");
const sourceAssignment = cinematicController.indexOf("video.src = mediaObjectUrl");
check(reducedGate >= 0 && mediaFetch > reducedGate && sourceAssignment > mediaFetch, "load-gate-order", "src/scripts/home-cinematic-integration.ts", "reduced-motion, codec, and portal-fit gates must run before the selected asset fetch and Blob source assignment");
check(/FRAME_COUNT\s*=\s*270/.test(cinematicController) && /FRAME_RATE\s*=\s*30/.test(cinematicController), "timeline-authority", "src/scripts/home-cinematic-integration.ts", "controller must retain the accepted 270-frame, 30fps timeline");
check(/interpolatePiecewise/.test(cinematicController) && /targetFrame\s*=\s*Math\.round\(cinematicProgress\s*\*\s*FINAL_FRAME_INDEX\)/.test(cinematicController) && /targetTime\s*=\s*targetFrame\s*\/\s*FRAME_RATE/.test(cinematicController), "deterministic-mapping", "src/scripts/home-cinematic-integration.ts", "document progress must map deterministically through a piecewise timeline to frame time");
check(/video\.pause\(\)/.test(cinematicController) && /video\.currentTime\s*=\s*targetTime/.test(cinematicController), "paused-seek-surface", "src/scripts/home-cinematic-integration.ts", "video must remain paused and render direct scroll-derived seeks");
check(/video\.seeking/.test(cinematicController) && /addEventListener\(\s*["']seeked["'][\s\S]{0,180}requestCurrentFrame\(\)/.test(cinematicController), "latest-seek-coalescing", "src/scripts/home-cinematic-integration.ts", "an in-flight decoder seek must collapse subsequent updates to the newest pending frame");
check(!/\.play\s*\(/.test(cinematicController), "autoplay-prohibited", "src/scripts/home-cinematic-integration.ts", "cinematic controller must never start linear playback");

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
check(matches(cinematicController, /\b(?:window\.)?setTimeout\s*\(/g) <= 1 && /decode-timeout|load-timeout/.test(cinematicController), "no-playback-timer", "src/scripts/home-cinematic-integration.ts", "the sole permitted timeout is a media fail-open watchdog, never a playback timeline");
check(!/\b(?:window\.)?setTimeout\s*\(/.test(operatingController), "no-playback-timer", "src/scripts/home-operating-field.ts", "the Phase 2B controller must remain free of playback/timeline timers");

const homeStyleFiles = ["home.css", "home-method.css", "home-responsive.css", "home-cinematic.css"];
const homeStyles = (await Promise.all(homeStyleFiles.map((file) => readOrFail(`src/styles/routes/${file}`)))).join("\n");
check(!/scroll-snap-(?:type|align|stop)\s*:/i.test(homeStyles), "scroll-snap", "src/styles/routes/home*.css", "Home must not use forced scroll snapping");
check(!/\boverflow-y\s*:\s*(?:auto|scroll)/i.test(homeStyles), "nested-scroll", "src/styles/routes/home*.css", "Home must not create a nested vertical scroll container");
check(!/(?:^|[;{])\s*overflow\s*:[^;}]*\b(?:auto|scroll)\b/im.test(homeStyles), "nested-scroll", "src/styles/routes/home*.css", "Home must not create an overflow shorthand scroll container");
check(!/\btouch-action\s*:\s*none/i.test(homeStyles), "touch-lock", "src/styles/routes/home*.css", "Home must not suppress native touch scrolling");
check(
  /^\/media\/cinematic\/\*\s+Cache-Control:\s*public,\s*max-age=31556952,\s*immutable\s*$/m.test(cloudflareHeaders.replace(/\r?\n\s+/g, " ")),
  "cinematic-cache-policy",
  "public/_headers",
  "content-addressed cinematic assets must receive the immutable Cloudflare Pages browser-cache policy",
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
    .replace('<a class="skip-link" href="#main-content">Skip to content</a>', '<a class="skip-link" href={skipHref}>{skipLabel}</a>');
  check(normalizeLineEndings(layoutSource).trim() === expectedLayout.trim(), "shared-layout-scope", "src/layouts/BaseLayout.astro", "shared BaseLayout changes must be limited to configurable skip-link props with unchanged supporting-route defaults");
} catch (error) {
  check(false, "layout-baseline", "src/layouts/BaseLayout.astro", `could not compare shared layout with accepted Phase 3: ${error.message}`);
}
try {
  const acceptedEntry = normalizeLineEndings(git("show", `${ACCEPTED_PHASE3}:src/components/home/EntryField.astro`));
  const expectedEntry = acceptedEntry.replace(
    '  aria-labelledby="home-title"\n',
    '  aria-labelledby="home-title"\n  tabindex="-1"\n',
  );
  check(normalizeLineEndings(entrySource).trim() === expectedEntry.trim(), "entry-integration-scope", "src/components/home/EntryField.astro", "ENTRY may differ from accepted Phase 2B only by the focusable skip-target attribute");
} catch (error) {
  check(false, "entry-baseline", "src/components/home/EntryField.astro", `could not compare ENTRY with accepted Phase 3: ${error.message}`);
}

// The staging recipe and both authoritative/staged inventories are independently pinned.
check(matches(stageSource, /\bsource:\s*["']/g) === MEDIA_ASSETS.length && matches(stageSource, /\boutput:\s*["']/g) === MEDIA_ASSETS.length, "stage-inventory-count", "scripts/stage-phase4-media.mjs", "media staging recipe must contain exactly seven source/output records");
check(/readdir\(OUTPUT_ROOT/.test(stageSource) && /expectedOutputs/.test(stageSource) && /unlink\(/.test(stageSource), "stage-prunes-extras", "scripts/stage-phase4-media.mjs", "media staging must remove unexpected generated files");
for (const asset of MEDIA_ASSETS) {
  const normalizedStage = stageSource.replaceAll("_", "");
  check(stageSource.includes(`source: "${asset.source}"`) && stageSource.includes(`output: "${asset.output}"`) && normalizedStage.includes(`bytes: ${asset.bytes}`) && stageSource.includes(asset.sha256), "stage-asset-authority", "scripts/stage-phase4-media.mjs", `staging recipe must pin the path, byte size, and hash for ${asset.output}`);
  await verifyFile(`artifacts/original/phase-3-crt-opening/${asset.source}`, asset, "accepted Phase 3 source");
  await verifyFile(`public/media/cinematic/${asset.output}`, asset, "staged Phase 4 production asset");
}
try {
  const outputRoot = path.join(ROOT, "public", "media", "cinematic");
  const entries = await readdir(outputRoot, { withFileTypes: true });
  const observed = entries.map(({ name }) => name).sort();
  const expected = MEDIA_ASSETS.map(({ output }) => output).sort();
  check(entries.every((entry) => entry.isFile()), "staged-media-shape", "public/media/cinematic", "generated cinematic media root must contain files only");
  check(JSON.stringify(observed) === JSON.stringify(expected), "staged-media-inventory", "public/media/cinematic", "generated cinematic media root must contain exactly the seven accepted files", observed);
} catch (error) {
  check(false, "staged-media-root", "public/media/cinematic", `generated media inventory is unavailable; run the Phase 4 staging script: ${error.message}`);
}

try {
  const changed = [
    ...lines(git("diff", "--name-only", ACCEPTED_PHASE3, "--", "src", "public", "astro.config.mjs")),
    ...lines(git("ls-files", "--others", "--exclude-standard", "--", "src", "public")),
  ].map((file) => file.replaceAll("\\", "/"));
  const unexpected = [...new Set(changed)].sort().filter((file) => !ALLOWED_PRODUCTION_CHANGES.some((pattern) => pattern.test(file)));
  check(unexpected.length === 0, "production-scope", "src + public + astro.config.mjs", "Phase 4 may change only the isolated Home integration surface and configurable skip-link shell", unexpected);
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
check(cinematicControllerBytes <= 24 * 1024, "controller-source-budget", "src/scripts/home-cinematic-integration.ts", `authored controller source must remain at or below 24 KiB; observed ${cinematicControllerBytes.toLocaleString("en-US")} bytes`);
check(cinematicCssBytes <= 15 * 1024, "cinematic-css-source-budget", "src/styles/routes/home-cinematic.css", `authored cinematic CSS must remain at or below 15 KiB; observed ${cinematicCssBytes.toLocaleString("en-US")} bytes`);

if (failures.length > 0) {
  console.error(`Phase 4 source verification failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) {
    console.error(`- [${failure.code}] ${failure.location}: ${failure.message}`);
    if (failure.details !== undefined) console.error(`  ${JSON.stringify(failure.details)}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Verified Phase 4 source: exact seven-chapter Phase 2B semantics, one inert SSR video, seven hash-pinned media assets, native-scroll-only controllers, supporting-route isolation, and bounded authored integration (${cinematicControllerBytes.toLocaleString("en-US")} B TS + ${cinematicCssBytes.toLocaleString("en-US")} B CSS).`);
}
