import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  ALLOWED_PAGE_ENDPOINTS,
  ALL_HTML_ROUTES,
  INTENDED_PUBLIC_ASSETS,
  NAVIGATION,
  PHASE1_ROUTES,
  REQUIRED_VIEWPORTS,
  SOURCE_LIKE_PATHS,
} from "./phase1-qa-config.mjs";

const root = process.cwd();
const failures = [];

function relative(absolute) {
  return path.relative(root, absolute).replaceAll("\\", "/");
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

function check(condition, code, location, message) {
  if (!condition) failures.push({ code, location, message });
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function matches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function importSpecifiers(source) {
  const values = [];
  for (const pattern of [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*(?:\(\s*)?["']([^"']+)["']/g,
  ]) {
    for (const match of source.matchAll(pattern)) values.push(match[1]);
  }
  return values;
}

const expectedPageFiles = ALL_HTML_ROUTES.map(({ source }) => source).sort();
const expectedEndpointFiles = [...ALLOWED_PAGE_ENDPOINTS].sort();
const pageFiles = (await walk(path.join(root, "src", "pages"))).map(relative).sort();
const actualAstroPages = pageFiles.filter((file) => file.endsWith(".astro"));
const actualEndpointPages = pageFiles.filter((file) => /\.(?:ts|js|mjs)$/.test(file));

check(
  sameMembers(actualAstroPages, expectedPageFiles),
  "route-source-set",
  "src/pages",
  `expected exactly ${expectedPageFiles.join(", ")}; observed ${actualAstroPages.join(", ")}`,
);
check(
  sameMembers(actualEndpointPages, expectedEndpointFiles),
  "endpoint-source-set",
  "src/pages",
  `expected only ${expectedEndpointFiles.join(", ")}; observed ${actualEndpointPages.join(", ")}`,
);

check(PHASE1_ROUTES.length === 9, "route-config", "phase1-qa-config", "launch route manifest must contain nine routes");
check(ALL_HTML_ROUTES.length === 10, "route-config", "phase1-qa-config", "HTML route manifest must include nine routes plus 404");
check(NAVIGATION.length === 8, "navigation-config", "phase1-qa-config", "primary navigation must contain eight entries");
check(REQUIRED_VIEWPORTS.length === 9, "viewport-config", "phase1-qa-config", "responsive matrix must contain nine viewports");
check(new Set(REQUIRED_VIEWPORTS.map(({ id }) => id)).size === 9, "viewport-config", "phase1-qa-config", "viewport IDs must be unique");
check(new Set(SOURCE_LIKE_PATHS).size === SOURCE_LIKE_PATHS.length, "privacy-config", "phase1-qa-config", "source-like probes must be unique");

const pageHeroSource = await readFile(path.join(root, "src", "components", "PageHero.astro"), "utf8");
check(matches(pageHeroSource, /<h1\b/g) === 1, "shared-h1-owner", "src/components/PageHero.astro", "PageHero must own exactly one H1");

const homeSource = await readFile(path.join(root, "src", "pages", "index.astro"), "utf8");
check(
  /<h3\b[^>]*>\s*\{maradinProofRecord\.title\}\s*<\/h3>/i.test(homeSource),
  "home-proof-title",
  "src/pages/index.astro",
  "Home must visibly render the exact approved Maradin proof title",
);

for (const route of ALL_HTML_ROUTES) {
  let source;
  try {
    source = await readFile(path.join(root, route.source), "utf8");
  } catch {
    check(false, "route-source-missing", route.source, `missing source for ${route.path}`);
    continue;
  }
  const literalH1 = matches(source, /<h1\b/g);
  const pageHeroOwners = matches(source, /<PageHero\b/g);
  check(
    literalH1 + pageHeroOwners === 1,
    "route-h1-owner",
    route.source,
    `${route.path} must have exactly one H1 owner; observed ${literalH1} literal H1 and ${pageHeroOwners} PageHero instances`,
  );
  check(matches(source, /<BaseLayout\b/g) === 1, "route-shell", route.source, `${route.path} must use BaseLayout exactly once`);
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
const blockedPackages = [
  "react",
  "react-dom",
  "@astrojs/react",
  "vue",
  "@astrojs/vue",
  "svelte",
  "@astrojs/svelte",
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "gsap",
  "lenis",
  "locomotive-scroll",
  "contentful",
  "@contentful/rich-text-types",
  "@sanity/client",
  "sanity",
  "strapi",
  "@strapi/strapi",
  "wordpress",
  "@prismicio/client",
  "payload",
];
for (const packageName of blockedPackages) {
  check(dependencies[packageName] === undefined, "prohibited-dependency", "package.json", `${packageName} must not be installed`);
}

const sourceFiles = (await walk(path.join(root, "src"))).filter((file) => /\.(?:astro|css|js|mjs|ts)$/.test(file));
const executableFiles = sourceFiles.filter((file) => /\.(?:astro|js|mjs|ts)$/.test(file));
const runtimeImportBlocklist = /^(?:react(?:\/|$)|react-dom(?:\/|$)|@astrojs\/react|vue(?:\/|$)|svelte(?:\/|$)|three(?:\/|$)|@react-three\/|gsap(?:\/|$)|lenis(?:\/|$)|locomotive-scroll(?:\/|$)|contentful(?:\/|$)|@contentful\/|sanity(?:\/|$)|@sanity\/|strapi(?:\/|$)|@strapi\/|wordpress(?:\/|$)|@prismicio\/|payload(?:\/|$))/i;

for (const file of executableFiles) {
  const source = await readFile(file, "utf8");
  const filePath = relative(file);
  for (const specifier of importSpecifiers(source)) {
    check(!runtimeImportBlocklist.test(specifier), "prohibited-import", filePath, `runtime import is not allowed: ${specifier}`);
    check(!/Q-HUB/i.test(specifier), "qhub-runtime-import", filePath, `Q-HUB runtime import is not allowed: ${specifier}`);
    check(!/^[A-Z]:[\\/]|^\/(?:Users|home)\//i.test(specifier), "private-runtime-import", filePath, `absolute private import is not allowed: ${specifier}`);
  }
  check(!/<\s*form\b/i.test(source), "form-markup", filePath, "public forms are prohibited in Phase 1");
  check(!/<\s*(?:input|textarea|select)\b/i.test(source), "form-control-markup", filePath, "public form controls are prohibited in Phase 1");
  check(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(source), "network-runtime", filePath, "client/server data fetching is outside the Phase 1 static contract");
  check(!/<\s*canvas\b|\bWebGL(?:2)?RenderingContext\b|\brequestAnimationFrame\s*\(|\bScrollTrigger\b/.test(source), "cinematic-runtime", filePath, "cinematic or canvas runtime code is prohibited in Phase 1");
  check(!/["']\/(?:api|functions)\//i.test(source), "api-route-reference", filePath, "API and function routes are prohibited in Phase 1");
  check(!/["']\/(?:artifacts|prototypes)\//i.test(source), "review-runtime-reference", filePath, "review/prototype material must not be referenced by production source");
}

const baseLayout = await readFile(path.join(root, "src", "layouts", "BaseLayout.astro"), "utf8");
check(matches(baseLayout, /<main\b/g) === 1, "main-owner", "src/layouts/BaseLayout.astro", "BaseLayout must own exactly one main landmark");
check(/<SiteHeader\b/.test(baseLayout), "site-header", "src/layouts/BaseLayout.astro", "BaseLayout must include SiteHeader");
check(/<SiteFooter\b/.test(baseLayout), "site-footer", "src/layouts/BaseLayout.astro", "BaseLayout must include SiteFooter");
check(/class=["']skip-link["']/.test(baseLayout), "skip-link", "src/layouts/BaseLayout.astro", "BaseLayout must include the skip link");

const publicFiles = (await walk(path.join(root, "public"))).map((file) => relative(file).replace(/^public\//, "")).sort();
const governedAssets = INTENDED_PUBLIC_ASSETS.map(({ path: assetPath }) => assetPath).sort();
check(
  sameMembers(publicFiles, governedAssets),
  "public-asset-governance",
  "public",
  `every public asset must be explicitly governed; expected ${governedAssets.length}, observed ${publicFiles.length}`,
);
check(new Set(governedAssets).size === governedAssets.length, "public-asset-governance", "phase1-qa-config", "governed asset paths must be unique");

for (const assetPath of publicFiles) {
  check(
    !/\.(?:blend\d*|glb|gltf|webm|mov|mkv)$/i.test(assetPath),
    "cinematic-asset",
    `public/${assetPath}`,
    "cinematic/source media format is prohibited from public output",
  );
  check(
    !/(?:^|[-_/])(?:crt|spiral|cinematic|field-unit|proving-ground|aperture-station)(?:[-_.\/]|$)/i.test(assetPath),
    "cinematic-asset",
    `public/${assetPath}`,
    "Phase 0 cinematic assets must not enter the Phase 1 public tree",
  );
}

const privacyScanFiles = [
  ...(await walk(path.join(root, "docs", "planning"))),
  ...(await walk(path.join(root, "artifacts", "evidence", "phase-1"))),
].filter((file) => /\.(?:json|md|txt|xml|csv)$/i.test(file));
for (const file of privacyScanFiles) {
  const source = (await readFile(file, "utf8")).replaceAll("\\\\", "\\");
  const filePath = relative(file);
  check(
    !/(?:^|[\s"'`(])[A-Z]:[\\/][^\r\n"'`]*/im.test(source),
    "private-path",
    filePath,
    "committed planning and Phase 1 evidence must not contain absolute Windows paths",
  );
  check(
    !/(?:^|[\s"'`(])\/(?:Users|home)\/[^\s"'`/]+\//im.test(source),
    "private-path",
    filePath,
    "committed planning and Phase 1 evidence must not contain absolute user-home paths",
  );
}

const routeSourceStats = await Promise.all(expectedPageFiles.map((file) => stat(path.join(root, file))));
check(routeSourceStats.every((metadata) => metadata.isFile()), "route-source-type", "src/pages", "every configured route source must be a file");

if (failures.length > 0) {
  console.error(`Phase 1 source verification failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) {
    console.error(`- [${failure.code}] ${failure.location}: ${failure.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Verified Phase 1 source: ${PHASE1_ROUTES.length} launch routes + 404, ${NAVIGATION.length} navigation entries, ${REQUIRED_VIEWPORTS.length} viewports, ${publicFiles.length} governed public assets, ${privacyScanFiles.length} planning/evidence files private-path clean, no prohibited runtime surface.`,
  );
}
