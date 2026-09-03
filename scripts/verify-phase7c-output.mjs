import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PUBLIC_ROUTES } from "./phase7a-contract.mjs";
import { verifyPhase7BOutput } from "./verify-phase7b-output.mjs";
import {
  PHASE7C_DOCUMENTARY_ASSET,
  PHASE7C_INDUSTRIES,
  PHASE7C_PROOF_RECORD,
} from "./phase7c-contract.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const POSTER_PUBLIC_URL = `/${PHASE7C_DOCUMENTARY_ASSET.path.replace(/^public\//, "")}`;
const SEMANTIC_STAGES = Object.freeze(["automotive", "logistics", "manufacturing", "energy", "proof"]);

function decodeHtml(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([a-z]+);/gi, (entity, name) => named[name.toLowerCase()] ?? entity);
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function attribute(openingTag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = openingTag.match(new RegExp(`\\s${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeHtml(match[2]) : null;
}

function attributeCount(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (source.match(new RegExp(`\\s${escaped}(?:\\s*=|\\s|>)`, "gi")) ?? []).length;
}

function extractBalancedElement(source, tagName, openingIndex) {
  const tags = new RegExp(`<(/?)${tagName}\\b[^>]*>`, "gi");
  tags.lastIndex = openingIndex;
  let depth = 0;
  let match;
  while ((match = tags.exec(source))) {
    if (match[1]) depth -= 1;
    else if (!/\/>$/.test(match[0])) depth += 1;
    if (depth === 0) return source.slice(openingIndex, tags.lastIndex);
  }
  throw new assert.AssertionError({ message: `unclosed ${tagName} element in built homepage` });
}

function territoryRoot(home) {
  const rootOpening = /<section\b(?=[^>]*\bdata-territory-traverse(?:\s|=|>))[^>]*>/i.exec(home);
  assert.ok(rootOpening, "built homepage is missing the Territory Traverse root");
  return extractBalancedElement(home, "section", rootOpening.index);
}

function stageElement(root, stage) {
  const opening = new RegExp(`<section\\b(?=[^>]*\\bdata-territory-stage=["']${stage}["'])[^>]*>`, "i").exec(root);
  assert.ok(opening, `built Territory Traverse is missing ${stage}`);
  return extractBalancedElement(root, "section", opening.index);
}

function assertAriaIntegrity(root) {
  assert.doesNotMatch(root, /\srole\s*=/i, "Territory Traverse must retain ordinary semantic HTML without custom roles");
  assert.doesNotMatch(root, /\saria-(?:modal|haspopup|owns)\s*=/i, "Territory Traverse contains unauthorized ARIA semantics");
  for (const match of root.matchAll(/\saria-hidden\s*=\s*(["'])(.*?)\1/gi)) {
    assert.ok(["true", "false"].includes(match[2]), `invalid aria-hidden value: ${match[2]}`);
  }

  const ids = [...root.matchAll(/\sid\s*=\s*(["'])(.*?)\1/gi)].map((match) => decodeHtml(match[2]));
  assert.equal(new Set(ids).size, ids.length, "Territory Traverse contains duplicate IDs");
  for (const match of root.matchAll(/\saria-labelledby\s*=\s*(["'])(.*?)\1/gi)) {
    for (const id of match[2].trim().split(/\s+/)) {
      assert.equal(ids.filter((candidate) => candidate === id).length, 1, `aria-labelledby does not resolve uniquely: ${id}`);
    }
  }
}

export function verifyPhase7CMarkup(home) {
  assert.equal((home.match(/<h1\b/gi) ?? []).length, 1, "built homepage must contain exactly one global H1");
  assert.equal(attributeCount(home, "data-territory-traverse"), 1, "one Territory Traverse root must be emitted");
  assert.equal(attributeCount(home, "data-proof-record"), 1, "homepage must expose exactly one Proof record");
  assert.equal(attributeCount(home, "data-proof-threshold"), 1, "homepage must expose exactly one Proof threshold");

  const root = territoryRoot(home);
  const rootOpening = root.match(/^<section\b[^>]*>/i)?.[0] ?? "";
  assert.equal(attribute(rootOpening, "data-territory-mode"), "static", "static must be the authored no-JavaScript default");
  assert.equal(attribute(rootOpening, "data-territory-state"), "release");
  assert.equal(attribute(rootOpening, "data-territory-projection"), "settled");
  assertAriaIntegrity(root);

  const stageOrder = [...root.matchAll(/\sdata-territory-stage\s*=\s*(["'])(.*?)\1/gi)]
    .map((match) => match[2]);
  assert.deepEqual(stageOrder, SEMANTIC_STAGES, "built semantic territory/Proof order differs");

  const territoryTitles = [];
  for (const [index, stage] of SEMANTIC_STAGES.slice(0, 4).entries()) {
    const section = stageElement(root, stage);
    const h3 = section.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
    assert.ok(h3, `${stage} requires a real H3`);
    const title = stripTags(h3[1]);
    assert.equal(title, PHASE7C_INDUSTRIES[index], `${stage} title differs from public authority`);
    territoryTitles.push(title);
  }

  const staticOrder = [...root.matchAll(/\sdata-territory-static\s*=\s*(["'])(.*?)\1/gi)]
    .map((match) => match[2]);
  assert.deepEqual(staticOrder, SEMANTIC_STAGES.slice(0, 4), "four ordered static territory fallbacks are required");

  assert.equal(attributeCount(root, "data-territory-carrier"), 1, "one persistent Territory Carrier marker is required");
  assert.equal((root.match(/<path\b(?=[^>]*\bdata-territory-carrier(?:\s|=|>))[^>]*>/gi) ?? []).length, 1, "carrier marker must belong to one SVG path");
  const svgs = root.match(/<svg\b[^>]*>/gi) ?? [];
  assert.equal(svgs.length, 1, "Territory Traverse requires one decorative SVG");
  assert.equal(attribute(svgs[0], "aria-hidden"), "true", "territory SVG must be decorative");
  assert.equal(attribute(svgs[0], "focusable"), "false", "territory SVG must not be focusable");

  const proof = stageElement(root, "proof");
  const proofOpening = proof.match(/^<section\b[^>]*>/i)?.[0] ?? "";
  assert.equal(attribute(proofOpening, "data-proof-record"), "maradin");
  const proofTitle = proof.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
  assert.ok(proofTitle, "Maradin Proof requires a real H3");
  assert.equal(stripTags(proofTitle[1]), PHASE7C_PROOF_RECORD, "Maradin Proof title differs");

  const anchors = proof.match(/<a\b[^>]*>/gi) ?? [];
  assert.equal((root.match(/<a\b/gi) ?? []).length, 1, "Territory Traverse adds only one ordinary link");
  assert.equal(anchors.length, 1, "Maradin Proof requires one ordinary link");
  assert.equal(attribute(anchors[0], "href"), "/pocs/maradin/");
  assert.doesNotMatch(anchors[0], /\s(?:role|onclick|download|data-ajax)\s*=/i, "Maradin link must remain an ordinary anchor");

  const images = root.match(/<img\b[^>]*>/gi) ?? [];
  assert.equal(images.length, 1, "Territory Traverse requires exactly one documentary poster");
  const poster = images[0];
  assert.equal(attribute(poster, "src"), POSTER_PUBLIC_URL, "built Proof poster differs from approved authority");
  assert.equal(attribute(poster, "width"), String(PHASE7C_DOCUMENTARY_ASSET.width));
  assert.equal(attribute(poster, "height"), String(PHASE7C_DOCUMENTARY_ASSET.height));
  assert.equal(attribute(poster, "loading"), "lazy");
  const alt = attribute(poster, "alt")?.trim() ?? "";
  assert.ok(alt.length >= 12, "documentary poster requires meaningful alternative text");
  assert.doesNotMatch(alt, /^(?:image|photo|poster|maradin)$/i, "documentary poster alt is generic");
  assert.equal((home.match(new RegExp(POSTER_PUBLIC_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 1, "approved poster must be referenced once");

  assert.doesNotMatch(root, /<(?:video|audio|source|picture)\b/i, "Phase 7C output must not emit a media player or source set");
  assert.doesNotMatch(root, /\s(?:autoplay|controls|preload|data-player)(?:\s|=|>)/i, "Phase 7C output contains player behavior");

  return {
    territories: territoryTitles,
    semanticStages: [...SEMANTIC_STAGES],
    territoryRoots: 1,
    carrierPaths: 1,
    decorativeSvgs: 1,
    staticFallbacks: staticOrder.length,
    proofRecords: 1,
    proofRecord: PHASE7C_PROOF_RECORD,
    poster: {
      src: POSTER_PUBLIC_URL,
      width: PHASE7C_DOCUMENTARY_ASSET.width,
      height: PHASE7C_DOCUMENTARY_ASSET.height,
      loading: "lazy",
      meaningfulAlt: true,
    },
    mediaPlayers: 0,
  };
}

export function verifyPhase7CStyles(styles) {
  assert.match(styles, /\.territory-world\b/, "built CSS is missing the Phase 7C namespace");
  const territoryStart = styles.indexOf(".territory-world");
  const firstResponsiveRule = styles.indexOf("@media", territoryStart);
  const baseTerritoryStyles = styles.slice(
    territoryStart,
    firstResponsiveRule >= 0 ? firstResponsiveRule : styles.length,
  );
  assert.match(baseTerritoryStyles, /\.territory-world\s+\.territory-world__visual\s*\{[^}]*display:none/i, "static mode must not leave the wide sticky visual active");
  assert.match(baseTerritoryStyles, /\.territory-world\s+\.territory-static\s*\{[^}]*display:block/i, "static territory compositions must be visible by default");
  assert.match(baseTerritoryStyles, /\.territory-world\[data-territory-mode=["']?enhanced["']?\][^{]*\.territory-world__visual\s*\{[^}]*display:block/i, "enhanced mode must explicitly enable its bounded visual");
  assert.match(baseTerritoryStyles, /\.territory-world\[data-territory-mode=["']?enhanced["']?\][^{]*\.territory-static\s*\{[^}]*display:none/i, "enhanced mode must replace duplicate static decoration only");
  assert.match(styles, /@media\s*\(prefers-reduced-motion:reduce\)/i, "built CSS is missing reduced-motion authority");
  assert.match(styles, /@media[^{]*(?:max-height\s*:\s*30rem|height\s*<=\s*30rem)[^{]*\{/i, "built CSS is missing short-landscape fallback authority");
  assert.match(styles, /@media[^{]*(?:max-width\s*:\s*40rem|width\s*<=\s*40rem)[^{]*\{/i, "built CSS is missing authored mobile fallback authority");
  assert.match(styles, /prefers-reduced-motion:reduce[\s\S]*?\.territory-static\s*\{[^}]*display:block/i, "reduced motion must restore static territories");
  assert.match(baseTerritoryStyles, /\.territory-proof__link\s*\{[^}]*min-width:44px[^}]*min-height:44px/i, "Proof link must retain the 44px output target");
  return {
    namespaced: true,
    authoredStaticDefault: true,
    enhancedBoundedVisual: true,
    reducedMotionFallback: true,
    mobileFallback: true,
    shortLandscapeFallback: true,
  };
}

async function walk(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

export async function verifyPhase7COutput(
  root = process.cwd(),
  { inheritedVerifier = verifyPhase7BOutput } = {},
) {
  const inherited = await inheritedVerifier(root);
  assert.equal(inherited.status, "PASS", "accepted Phase 7B output authority failed");

  const dist = path.join(root, "dist");
  assert.equal(PUBLIC_ROUTES.length, 9, "public route authority must remain exactly nine routes");
  for (const authority of PUBLIC_ROUTES) {
    await assert.doesNotReject(
      access(path.join(dist, authority.file)),
      `${authority.route} built route is missing`,
    );
  }

  const home = await readFile(path.join(dist, "index.html"), "utf8");
  const markup = verifyPhase7CMarkup(home);
  const files = await walk(dist);
  const stylesheets = files.filter((filename) => /\.css$/i.test(filename));
  assert.ok(stylesheets.length > 0, "built output contains no CSS");
  const styles = (await Promise.all(stylesheets.map((filename) => readFile(filename, "utf8")))).join("\n");
  const css = verifyPhase7CStyles(styles);

  const inventory = await Promise.all(files.map(async (filename) => ({
    path: path.relative(dist, filename).replaceAll("\\", "/"),
    bytes: (await stat(filename)).size,
  })));
  inventory.sort((left, right) => left.path.localeCompare(right.path));

  return {
    schema: "quantum-hub.phase-7c.output-verification.v1",
    status: "PASS",
    inheritedPhase7BStatus: inherited.status,
    inheritedPhase7AStatus: inherited.inheritedPhase7AStatus,
    routes: PUBLIC_ROUTES.map(({ route, file }) => ({ route, file })),
    ...markup,
    css,
    files: inventory.length,
    inventorySha256: createHash("sha256").update(JSON.stringify(inventory)).digest("hex"),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  console.log(JSON.stringify(await verifyPhase7COutput(), null, 2));
}
