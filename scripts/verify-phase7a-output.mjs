import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_MAP_DESTINATIONS, PUBLIC_ROUTES } from "./phase7a-contract.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function decode(value) {
  return value
    .replace(/&amp;/g, "&").replace(/&mdash;|&#8212;/g, "—")
    .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

function stripTags(value) {
  return decode(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

async function walk(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else output.push(absolute);
  }
  return output;
}

export async function verifyOutput(root = process.cwd()) {
  const dist = path.join(root, "dist");
  const routeReports = [];
  for (const authority of PUBLIC_ROUTES) {
    const html = await readFile(path.join(dist, authority.file), "utf8");
    const h1s = [...html.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)];
    assert.equal(h1s.length, 1, `${authority.route} must contain exactly one H1`);
    const aria = h1s[0][1].match(/aria-label="([^"]+)"/i)?.[1];
    assert.equal(decode(aria ?? stripTags(h1s[0][2])), authority.h1, `${authority.route} H1 changed`);
    assert.match(html, /<header\b[^>]*class="site-header"/i, `${authority.route} header landmark missing`);
    assert.match(html, /<main\b[^>]*id="main-content"/i, `${authority.route} main landmark missing`);
    assert.match(html, /<footer\b[^>]*class="site-footer"/i, `${authority.route} footer landmark missing`);
    assert.match(html, /<nav\b[^>]*aria-label="Primary navigation"/i, `${authority.route} Field Map nav missing`);
    assert.match(html, /<link\b[^>]*rel="canonical"/i, `${authority.route} canonical missing`);
    for (const href of FIELD_MAP_DESTINATIONS) assert.ok(html.includes(`href="${href}"`), `${authority.route} missing Field Map link ${href}`);
    if (authority.route !== "/" && authority.route !== "/pocs/maradin/") {
      assert.doesNotMatch(html, /media\/cinematic|phase-4r2|\.mp4/i, `${authority.route} leaked cinematic media`);
    }
    routeReports.push({ route: authority.route, file: authority.file, h1: authority.h1, bytes: Buffer.byteLength(html) });
  }

  const home = await readFile(path.join(dist, "index.html"), "utf8");
  assert.match(home, /data-cinematic-shell/);
  assert.match(home, /data-signal-field/);
  assert.match(home, /data-manifesto-threshold/);
  assert.match(home, /data-field-map-threshold/);
  assert.doesNotMatch(home, /audience-routing|built-with-industry|method-field|industry-territories|proof-field|programmes-field|conversion-field/i);

  const notFound = await readFile(path.join(dist, "404.html"), "utf8");
  assert.equal((notFound.match(/<h1\b/gi) ?? []).length, 1, "404 must contain exactly one H1");
  assert.match(notFound, /<meta\b[^>]*name="robots"[^>]*content="noindex, follow"/i);
  assert.doesNotMatch(notFound, /<link\b[^>]*rel="canonical"/i, "404 must not canonicalize as a public route");

  const files = await walk(dist);
  const groups = { js: 0, css: 0, fonts: 0, total: 0 };
  const inventory = [];
  for (const filename of files) {
    const bytes = (await stat(filename)).size;
    const relative = path.relative(dist, filename).replaceAll("\\", "/");
    groups.total += bytes;
    if (/\.m?js$/i.test(filename)) groups.js += bytes;
    if (/\.css$/i.test(filename)) groups.css += bytes;
    if (/\.(?:woff2?|ttf|otf)$/i.test(filename)) groups.fonts += bytes;
    inventory.push({ path: relative, bytes });
  }

  assert.ok(inventory.some(({ path: name, bytes }) => /anybody-latin-variable\.woff2$/.test(name) && bytes === 69612), "production Anybody font missing");
  const outputText = (await Promise.all(files.filter((file) => /\.(?:html|css|js)$/i.test(file)).map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(outputText, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(outputText, /BuiltWithIndustry|ConversionField|IndustryTerritories|MethodField|ProgrammesField|ProofField/);

  return {
    schema: "quantum-hub.phase-7a.output-verification.v1",
    status: "PASS",
    routes: routeReports,
    real404: { file: "404.html", statusAuthority: "HTTP verification required separately", noindex: true },
    files: inventory.length,
    bytes: groups,
    inventorySha256: createHash("sha256").update(JSON.stringify(inventory)).digest("hex"),
  };
}

function outputArgument(argv) {
  const index = argv.indexOf("--output");
  return index >= 0 ? argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  const report = await verifyOutput();
  const output = outputArgument(process.argv.slice(2));
  if (output) {
    const absolute = path.resolve(output);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
}

