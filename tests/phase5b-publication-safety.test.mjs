import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import ts from "typescript";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const requireFromTest = createRequire(import.meta.url);
const moduleCache = new Map();

const EXPECTED_PAGE_SOURCES = [
  "src/pages/404.astro",
  "src/pages/about.astro",
  "src/pages/contact.astro",
  "src/pages/for-partners.astro",
  "src/pages/for-startups.astro",
  "src/pages/index.astro",
  "src/pages/industries.astro",
  "src/pages/pocs.astro",
  "src/pages/pocs/maradin.astro",
  "src/pages/robots.txt.ts",
  "src/pages/sitemap.xml.ts",
  "src/pages/spark.astro",
];

const EXPECTED_BUILD_HTML = [
  "404.html",
  "about/index.html",
  "contact/index.html",
  "for-partners/index.html",
  "for-startups/index.html",
  "index.html",
  "industries/index.html",
  "pocs/index.html",
  "pocs/maradin/index.html",
  "spark/index.html",
];

const EXPECTED_PUBLIC_PATHS = [
  "/",
  "/for-partners/",
  "/for-startups/",
  "/industries/",
  "/pocs/",
  "/pocs/maradin/",
  "/spark/",
  "/about/",
  "/contact/",
];

const EXPECTED_INDUSTRIES = [
  { id: "automotive-mobility", name: "Automotive & Mobility" },
  { id: "logistics-supply-chain", name: "Logistics & Supply Chain" },
  { id: "advanced-manufacturing", name: "Industry 4.0 / Advanced Manufacturing" },
  { id: "energy-infrastructure", name: "Energy & Infrastructure" },
];

const APPROVED_NEGATIVE_DISCLOSURES = [
  "participation does not guarantee a pilot, procurement agreement or investment",
  "does not guarantee a pilot, procurement agreement or investment",
  "the public pathway is not accepting applications",
  "spark is not accepting applications",
  "no future date or alternative registration route is being offered here",
  "no future cohort date, registration route or waiting list is being published at this stage",
  "applications are closed, and this site does not offer an application, waiting-list or registration route",
  "can i apply now",
  "without a guaranteed outcome",
];

const PUBLICATION_RULES = [
  {
    code: "defense-or-dual-use",
    pattern: /\b(?:defen[cs]e|dual[ -]?use|military|weapon systems?|battlefield)\b/i,
  },
  {
    code: "unapproved-proof-or-case",
    pattern: /\b(?:fake case|case studies?|case library|success stories?|anonymous client|confidential case|placeholder (?:case|proof)|second proof)\b|\bcoming soon\b.{0,48}\b(?:case|proof)\b/i,
  },
  {
    code: "application-or-waitlist-launch",
    pattern: /\b(?:join (?:the )?(?:wait ?list|waiting list)|wait ?list|waiting list|apply (?:now|today|here)|register (?:now|today|here)|applications? (?:are )?(?:open|opening|reopen|reopening)|registration (?:is )?open)\b/i,
  },
  {
    code: "invented-team-or-qfund",
    pattern: /\bq[ -]?fund\b|\b(?:meet (?:our|the) team|our (?:leadership|team)|leadership team|executive team|board of directors|chief executive officer|co-founder)\b|\b(?:team|person|member)[ -](?:grid|card|roster)\b/i,
  },
  {
    code: "fake-metric",
    pattern: /\b(?:improved?|increased?|reduced?|saved?|grew|growth|delivered?|achieved?|cut|raised?|lowered?)\b.{0,64}\b\d+(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*%\b.{0,64}\b(?:growth|saving|revenue|accuracy|efficiency|uptime|throughput|conversion|roi)\b|[$€£]\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:usd|eur|nis)\b|\b\d[\d,.]*\s+(?:paying customers?|contracts?|deployments?|installations?|facilities?|sites?|markets?|countries?|vehicles?|units?)\b/i,
  },
  {
    code: "procurement-or-contract-claim",
    pattern: /\b(?:procurement|purchase orders?|contract awards?|contracts?|vendor of record|selected supplier)\b/i,
  },
  {
    code: "commercial-success-claim",
    pattern: /\b(?:commercial success|commercially successful|paying customers?|customer traction|market traction|revenue growth|sales results?|market-leading|industry-leading|proven roi|return on investment)\b|\b(?:won|secured|signed|awarded|landed)\b.{0,48}\b(?:customer|contract|deal|purchase order)\b/i,
  },
  {
    code: "unsupported-outcome-claim",
    pattern: /\b(?:mass production|confidential results?|guaranteed outcomes?|deployment (?:success|results?|across|at)|deployed (?:across|at|to))\b/i,
  },
];

const SPARK_DATE_PATTERN = /\b(?:applications?|registration|cohort|spark)\b.{0,72}\b(?:20\d{2}|q[1-4][ -]?20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:20\d{2}|q[1-4][ -]?20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b.{0,72}\b(?:applications?|registration|cohort|opens?|reopens?|starts?|begins?)\b/i;

function read(relative) {
  return readFileSync(path.join(ROOT, ...relative.split("/")), "utf8");
}

function toRelative(filename) {
  return path.relative(ROOT, filename).split(path.sep).join("/");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(candidate) : [candidate];
  });
}

function resolveTypeScriptModule(specifier, parentFile) {
  const base = path.resolve(path.dirname(parentFile), specifier);
  for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Unable to resolve ${specifier} from ${toRelative(parentFile)}`);
}

function loadTypeScriptModule(filename) {
  const absolute = path.resolve(filename);
  if (moduleCache.has(absolute)) return moduleCache.get(absolute).exports;

  const module = { exports: {} };
  moduleCache.set(absolute, module);
  const output = ts.transpileModule(readFileSync(absolute, "utf8"), {
    fileName: absolute,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (specifier) => specifier.startsWith(".")
    ? loadTypeScriptModule(resolveTypeScriptModule(specifier, absolute))
    : requireFromTest(specifier);
  const execute = new Function("require", "module", "exports", "__filename", "__dirname", output);
  execute(localRequire, module, module.exports, absolute, path.dirname(absolute));
  return module.exports;
}

function loadPublicContent() {
  return loadTypeScriptModule(path.join(ROOT, "src", "content", "index.ts"));
}

function collectAstroShippingGraph(entrypoints) {
  const graph = new Set();
  const pending = [...entrypoints];
  const importPattern = /(?:\bfrom\s*|\bimport\s*)["']([^"']+\.astro)["']/g;

  while (pending.length > 0) {
    const filename = path.resolve(pending.pop());
    if (graph.has(filename)) continue;
    assert.ok(existsSync(filename), `missing routed Astro source: ${toRelative(filename)}`);
    graph.add(filename);
    const source = readFileSync(filename, "utf8");
    for (const match of source.matchAll(importPattern)) {
      if (!match[1].startsWith(".")) continue;
      pending.push(path.resolve(path.dirname(filename), match[1]));
    }
  }

  return [...graph].sort();
}

function decodeHtml(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    ldquo: "“",
    lt: "<",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    raquo: "»",
    rdquo: "”",
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key) => {
    if (key[0] === "#") {
      const hexadecimal = key[1].toLowerCase() === "x";
      const parsed = Number.parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
    }
    return named[key.toLowerCase()] ?? entity;
  });
}

function normalize(value) {
  return decodeHtml(value)
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function htmlShippingSurface(markup) {
  const withoutExecutablePayloads = markup
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:script|style|svg|template)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|template)>/gi, " ");
  const attributes = [...withoutExecutablePayloads.matchAll(/\b(?:alt|aria-label|title|content|href)\s*=\s*["']([^"']*)["']/gi)]
    .map((match) => match[1]);
  const text = withoutExecutablePayloads.replace(/<[^>]*>/g, " ");
  return normalize(`${text} ${attributes.join(" ")}`);
}

function astroShippingSurface(source) {
  const withoutFrontmatter = source.replace(/^---[\s\S]*?---/, " ");
  return htmlShippingSurface(withoutFrontmatter);
}

function stripApprovedNegativeDisclosures(value) {
  let scrubbed = normalize(value);
  for (const disclosure of APPROVED_NEGATIVE_DISCLOSURES) {
    scrubbed = scrubbed.replaceAll(normalize(disclosure), " ");
  }
  return scrubbed.replace(/\s+/g, " ").trim();
}

function publicationViolations(value) {
  const surface = stripApprovedNegativeDisclosures(value);
  return PUBLICATION_RULES.flatMap(({ code, pattern }) => {
    const match = pattern.exec(surface);
    if (!match) return [];
    const start = Math.max(0, match.index - 48);
    const end = Math.min(surface.length, match.index + match[0].length + 48);
    return [{ code, excerpt: surface.slice(start, end) }];
  });
}

function assertNoPublicationViolations(label, value) {
  assert.deepEqual(publicationViolations(value), [], `${label} contains prohibited publication material`);
}

function builtHtml() {
  assert.ok(existsSync(DIST), "dist/ is required: run the production build before this publication test");
  return new Map(EXPECTED_BUILD_HTML.map((relative) => [relative, read(`dist/${relative}`)]));
}

function hrefs(markup) {
  return [...markup.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map((match) => decodeHtml(match[1]));
}

test("the routed source and generated HTML inventories remain closed", () => {
  const pageSources = walk(path.join(ROOT, "src", "pages"))
    .filter((filename) => /\.(?:astro|ts)$/.test(filename))
    .map(toRelative)
    .sort();
  assert.deepEqual(pageSources, [...EXPECTED_PAGE_SOURCES].sort());

  assert.ok(existsSync(DIST), "dist/ is required: run the production build before this publication test");
  const htmlInventory = walk(DIST)
    .filter((filename) => filename.endsWith(".html"))
    .map((filename) => path.relative(DIST, filename).split(path.sep).join("/"))
    .sort();
  assert.deepEqual(htmlInventory, [...EXPECTED_BUILD_HTML].sort());

  const sitemap = read("dist/sitemap.xml");
  const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  assert.deepEqual(sitemapPaths, EXPECTED_PUBLIC_PATHS);
});

test("runtime content exports retain four industries, one proof, closed SPARK, and no unverified records", () => {
  const content = loadPublicContent();

  assert.deepEqual(content.PUBLIC_INDUSTRIES, EXPECTED_INDUSTRIES);
  assert.equal(content.PUBLIC_INDUSTRIES.length, 4);
  assert.equal(new Set(content.PUBLIC_INDUSTRIES.map(({ id }) => id)).size, 4);

  assert.equal(content.publicProofRecords.length, 1);
  assert.equal(content.publicProofRecords[0].slug, "maradin");
  assert.equal(content.publicProofRecords[0].title, "Maradin — Dynamic Ground Projection");

  assert.equal(content.sparkProgramme.status, "Applications closed");
  assert.equal(content.sparkProgramme.applicationOpen, false);
  assert.deepEqual(content.publicTeamMembers, []);
  assert.deepEqual(content.publicMetrics, []);
  assert.deepEqual(content.publicPartners, []);
  assert.deepEqual(content.publicUpdates, []);
  assert.equal(content.contactDestination, null);

  assert.deepEqual(content.publicContent.industries, content.PUBLIC_INDUSTRIES);
  assert.deepEqual(content.publicContent.proofs, content.publicProofRecords);
  assert.deepEqual(content.publicContent.team, []);
  assert.deepEqual(content.publicContent.metrics, []);
  assert.equal(content.publicContent.contactDestination, null);
  assertNoPublicationViolations("runtime publicContent projection", JSON.stringify(content.publicContent));
});

test("generated industries and proof surfaces expose exactly the approved records", () => {
  const pages = builtHtml();
  const industries = pages.get("industries/index.html");
  const industryActs = [...industries.matchAll(/\bdata-route-act=["']([^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(industryActs, ["automotive", "logistics", "manufacturing", "energy"]);
  const industrySurface = htmlShippingSurface(industries);
  for (const { name } of EXPECTED_INDUSTRIES) assert.ok(industrySurface.includes(normalize(name)), `missing ${name}`);

  const proofIndex = pages.get("pocs/index.html");
  assert.equal(hrefs(proofIndex).filter((href) => href === "/pocs/maradin/").length, 1);
  const detailProofPaths = new Set([...pages.values()].flatMap(hrefs).filter((href) => /^\/pocs\/[^/]+\/$/.test(href)));
  assert.deepEqual([...detailProofPaths], ["/pocs/maradin/"]);
  assert.match(htmlShippingSurface(proofIndex), /maradin - dynamic ground projection/);
});

test("SPARK stays closed and no public page grows an application or waiting-list surface", () => {
  const pages = builtHtml();
  const spark = pages.get("spark/index.html");
  const sparkSurface = htmlShippingSurface(spark);
  const sparkSourceSurface = astroShippingSurface(read("src/components/routes/spark/SparkExperience.astro"));
  const sparkRuntimeSurface = normalize(JSON.stringify(loadPublicContent().sparkProgramme));
  assert.match(sparkSurface, /applications closed/);
  assert.match(sparkSurface, /spark is not accepting applications/);
  assert.doesNotMatch(spark, /<(?:form|input|textarea|select)\b/i);
  assert.equal(hrefs(spark).some((href) => /(?:apply|application|register|registration|wait ?list|waiting-list)/i.test(href)), false);
  assert.doesNotMatch(
    stripApprovedNegativeDisclosures(`${sparkSourceSurface} ${sparkRuntimeSurface} ${sparkSurface}`),
    SPARK_DATE_PATTERN,
    "SPARK exposes an unverified cohort or application date",
  );

  for (const [relative, markup] of pages) {
    assert.doesNotMatch(markup, /<(?:form|input|textarea|select)\b/i, `${relative} exposes a form field`);
    assert.equal(
      hrefs(markup).some((href) => /(?:apply|application|register|registration|wait ?list|waiting-list)/i.test(href)),
      false,
      `${relative} exposes an application or waiting-list link`,
    );
  }
});

test("Contact stays unresolved without an email, phone, or submission endpoint", () => {
  const contact = builtHtml().get("contact/index.html");
  const surface = htmlShippingSurface(contact);
  assert.match(surface, /no direct contact destination is currently available/);
  assert.doesNotMatch(contact, /<(?:form|input|textarea|select)\b/i);
  assert.doesNotMatch(contact, /\bhref\s*=\s*["'](?:mailto:|tel:)/i);
  assert.doesNotMatch(surface, /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i);
  assert.doesNotMatch(surface, /(?:\+\d{1,3}[\s().-]*)?(?:\d[\s().-]*){8,}/);
});

test("only routed Astro copy and projected public content are scanned for prohibited claims", () => {
  const entrypoints = EXPECTED_PAGE_SOURCES
    .filter((relative) => relative.endsWith(".astro"))
    .map((relative) => path.join(ROOT, ...relative.split("/")));
  const graph = collectAstroShippingGraph(entrypoints);
  assert.ok(graph.some((filename) => filename.endsWith(`${path.sep}BaseLayout.astro`)));
  assert.ok(graph.some((filename) => filename.endsWith(`${path.sep}MaradinExperience.astro`)));
  assert.ok(graph.some((filename) => filename.endsWith(`${path.sep}SparkExperience.astro`)));

  for (const filename of graph) {
    const source = readFileSync(filename, "utf8");
    const surface = astroShippingSurface(source);
    assertNoPublicationViolations(`public source ${toRelative(filename)}`, surface);
    assert.doesNotMatch(source, /<(?:form|input|textarea|select)\b/i, `${toRelative(filename)} exposes a form field`);
    assert.doesNotMatch(source, /\bhref\s*=\s*["'](?:mailto:|tel:)/i, `${toRelative(filename)} exposes an email or phone endpoint`);
    assert.doesNotMatch(surface, /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i, `${toRelative(filename)} exposes an email address`);
    assert.doesNotMatch(surface, /(?:\+\d{1,3}[\s().-]*)?(?:\d[\s().-]*){8,}/, `${toRelative(filename)} exposes a phone number`);
  }
  for (const [relative, markup] of builtHtml()) {
    const surface = htmlShippingSurface(markup);
    assertNoPublicationViolations(`generated page ${relative}`, surface);
    assert.doesNotMatch(markup, /\bhref\s*=\s*["'](?:mailto:|tel:)/i, `${relative} exposes an email or phone endpoint`);
    assert.doesNotMatch(surface, /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i, `${relative} exposes an email address`);
    assert.doesNotMatch(surface, /(?:\+\d{1,3}[\s().-]*)?(?:\d[\s().-]*){8,}/, `${relative} exposes a phone number`);
  }
});

test("deny rules reject representative publication canaries", () => {
  const canaries = new Map([
    ["defense-or-dual-use", "Launching a dual-use defense systems programme."],
    ["unapproved-proof-or-case", "Browse our second proof and customer success stories."],
    ["application-or-waitlist-launch", "Join the SPARK waitlist and apply now."],
    ["invented-team-or-qfund", "Meet the qFund leadership team."],
    ["fake-metric", "Improved throughput by 35%."],
    ["procurement-or-contract-claim", "The programme won a procurement contract."],
    ["commercial-success-claim", "Commercial success includes paying customers and revenue growth."],
    ["unsupported-outcome-claim", "The product entered mass production after confidential results."],
  ]);

  for (const [expectedCode, canary] of canaries) {
    assert.ok(
      publicationViolations(canary).some(({ code }) => code === expectedCode),
      `${expectedCode} canary escaped the deny rules`,
    );
  }

  const fakeSparkDate = stripApprovedNegativeDisclosures("Applications reopen September 2027.");
  assert.match(fakeSparkDate, SPARK_DATE_PATTERN);
  assert.match("Contact hello@example.com or +972 50 123 4567", /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i);
  assert.match("Contact hello@example.com or +972 50 123 4567", /(?:\+\d{1,3}[\s().-]*)?(?:\d[\s().-]*){8,}/);
});
