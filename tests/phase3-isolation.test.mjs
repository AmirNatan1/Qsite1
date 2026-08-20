import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAB_RELATIVE = "prototypes/phase-3-crt-media-lab";
const LAB_ROOT = path.join(ROOT, ...LAB_RELATIVE.split("/"));
const LAB_CANARY = "QH_PHASE3_MEDIA_LAB_ONLY";
const PHASE2B_MANIFEST_RELATIVE = "artifacts/evidence/phase-2b/review/phase-2b-visual-evidence-manifest.json";
const PHASE2B_MANIFEST_SHA256 = "b3c88d9ffa53592cec812a2a37a382d2899f28a0971cb1ff4c4c4022021f56a6";
const REQUIRED_LAB_FILES = Object.freeze(["README.md", "app.js", "index.html", "styles.css"]);

function absolute(relativePath) {
  return path.join(ROOT, ...relativePath.split("/"));
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(candidate)));
    else files.push(candidate);
  }
  return files;
}

function normalizedRelative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function isFrozenHomepageSource(relativePath) {
  return (
    relativePath === "src/pages/index.astro" ||
    relativePath === "src/scripts/home-operating-field.ts" ||
    relativePath.startsWith("src/components/home/") ||
    /^src\/styles\/routes\/home(?:-[a-z0-9-]+)?\.css$/.test(relativePath)
  );
}

test("Phase 3 media lab has the exact isolated dependency-free surface", async () => {
  const entries = (await readdir(LAB_ROOT)).sort();
  assert.deepEqual(entries, [...REQUIRED_LAB_FILES], "the lab must contain only its four compact source files");

  const [html, css, app, readme] = await Promise.all(
    ["index.html", "styles.css", "app.js", "README.md"].map((name) => readFile(path.join(LAB_ROOT, name), "utf8")),
  );
  const completeLab = `${html}\n${css}\n${app}\n${readme}`;

  assert.match(completeLab, new RegExp(LAB_CANARY), "the lab-only canary must remain present");
  assert.match(html, /<input[^>]+id="media-file"[^>]+type="file"/i, "a local media file selector is required");
  assert.match(html, /<input[^>]+id="timeline"[^>]+type="range"/i, "the normalized timeline slider is required");
  assert.match(app, /URLSearchParams\(window\.location\.search\)/, "the lab must accept query parameters");
  assert.match(app, /query\.get\("src"\)/, "the query-parameter media source must be named src");
  assert.match(app, /randomFractions\(10\)/, "the random exercise must contain exactly ten targets");
  assert.match(app, /RAPID_ALTERNATING_SEQUENCE/, "the rapid alternating seek exercise is required");
  assert.match(app, /FORWARD_REVERSE_SEQUENCE/, "the forward/reverse exercise is required");
  assert.match(app, /visibilitychange/, "hidden-tab telemetry must use the Visibility API");
  assert.match(app, /application\/json/, "results must export as JSON");

  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]);
  const stylesheets = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/gi)].map(
    (match) => match[1],
  );
  assert.deepEqual(scripts, ["./app.js"], "the lab may load only its local script");
  assert.deepEqual(stylesheets, ["./styles.css"], "the lab may load only its local stylesheet");
  assert.doesNotMatch(html, /<(?:iframe|object|embed)\b/i, "the lab may not embed another application surface");
  assert.doesNotMatch(html, /(?:src|href)="(?:https?:)?\/\//i, "the document may not declare external dependencies");
  assert.doesNotMatch(app, /^\s*import\s|\bimport\s*\(/m, "the lab must not import production or package modules");
  assert.doesNotMatch(app, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/, "the lab must not fetch dependencies");
  assert.doesNotMatch(completeLab, /(?:src|public)\/(?:pages|components|styles|scripts|media|fonts|brand)\//i, "the lab must not bind production inputs");
});

test("Phase 3 lab remains absent from production inputs and static output", async () => {
  const productionRoots = ["src", "public"];
  const distPath = absolute("dist");
  try {
    if ((await stat(distPath)).isDirectory()) productionRoots.push("dist");
  } catch {
    // A build output is optional; source and public isolation are always checked.
  }

  for (const root of productionRoots) {
    const files = await walk(absolute(root));
    for (const file of files) {
      const extension = path.extname(file).toLowerCase();
      if (![".astro", ".css", ".html", ".js", ".json", ".mjs", ".ts", ".txt", ".xml"].includes(extension)) continue;
      const source = await readFile(file, "utf8");
      assert.ok(!source.includes(LAB_CANARY), `${normalizedRelative(file)} contains the Phase 3 lab canary`);
      assert.ok(!source.includes(LAB_RELATIVE), `${normalizedRelative(file)} references the isolated Phase 3 lab`);
      assert.ok(!source.includes("phase3MediaLabReport"), `${normalizedRelative(file)} references the lab runtime`);
    }
  }
});

test("frozen Phase 2B homepage bytes match the accepted manifest authority", async () => {
  const manifestPath = absolute(PHASE2B_MANIFEST_RELATIVE);
  assert.equal(
    await sha256(manifestPath),
    PHASE2B_MANIFEST_SHA256,
    "the Phase 2B visual-evidence manifest authority changed",
  );

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.phase, "2B");
  assert.equal(manifest.status, "PASS");
  assert.ok(Array.isArray(manifest.sourceRecords), "Phase 2B manifest sourceRecords are required");

  const homepageRecords = manifest.sourceRecords.filter(({ path: relativePath }) => isFrozenHomepageSource(relativePath));
  assert.equal(homepageRecords.length, 12, "the accepted manifest must govern all twelve homepage source files");

  for (const record of homepageRecords) {
    const file = absolute(record.path);
    const fileStat = await stat(file);
    assert.equal(fileStat.size, record.bytes, `${record.path} byte size differs from Phase 2B authority`);
    assert.equal(await sha256(file), record.sha256, `${record.path} SHA-256 differs from Phase 2B authority`);
  }
});
