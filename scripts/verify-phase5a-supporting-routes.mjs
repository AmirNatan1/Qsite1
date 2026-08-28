// QH_PHASE5A_ROUTE_LAB_ONLY
import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROUTE_ORDER, ROUTES, VIEWPORTS, assertRouteData } from "../prototypes/phase-5a-supporting-routes/route-data.mjs";

const ROOT = path.resolve(process.cwd());
const LAB = path.join(ROOT, "prototypes", "phase-5a-supporting-routes");
const CANARY = "QH_PHASE5A_ROUTE_LAB_ONLY";

function argument(name, fallback = null) {
  const exact = `--${name}`;
  const index = process.argv.findIndex((value) => value === exact || value.startsWith(`${exact}=`));
  if (index < 0) return fallback;
  const value = process.argv[index];
  return value.includes("=") ? value.slice(value.indexOf("=") + 1) : process.argv[index + 1];
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(candidate));
    else if (entry.isFile()) files.push(candidate);
  }
  return files.sort();
}

async function readTextTree(directory) {
  const files = (await walk(directory)).filter((file) => /\.(?:css|html|js|json|md|mjs)$/i.test(file));
  const texts = await Promise.all(files.map(async (file) => ({ file, text: await readFile(file, "utf8"), bytes: (await stat(file)).size })));
  return texts;
}

async function verifySource() {
  assertRouteData();
  const texts = await readTextTree(LAB);
  assert.ok(texts.length >= 7, "expected compact local-lab sources");
  assert.ok(texts.every(({ text }) => text.includes(CANARY) || /capture-plan\.json$/i.test(text)), "every authored lab source must carry or reference the canary");
  const combined = texts.map(({ text }) => text).join("\n");
  const executableCombined = texts.filter(({ file }) => /\.(?:css|html|js|mjs)$/i.test(file)).map(({ text }) => text).join("\n");
  assert.doesNotMatch(combined, /https?:\/\/(?!127\.0\.0\.1|www\.w3\.org\/2000\/svg)/i, "lab source must not depend on external networks");
  assert.doesNotMatch(executableCombined, /<video\b|\.mp4["')]|phase-4|cinematic-runway|position\s*:\s*sticky|three\.js|gsap|react|webgl/i, "lab must contain no cinematic/video/sticky/heavy-runtime design");
  assert.ok(texts.reduce((total, file) => total + file.bytes, 0) < 500_000, "tracked lab source should remain compact");

  const plan = JSON.parse(await readFile(path.join(LAB, "capture-plan.json"), "utf8"));
  assert.deepEqual(plan.routes, ROUTE_ORDER);
  assert.deepEqual(plan.viewports, VIEWPORTS);
  assert.equal(plan.requiredRouteArtifacts.length, 15);
  assert.equal(plan.rules.publicExposure, false);
  assert.equal(plan.rules.phase5BAuthorized, false);

  for (const slug of ROUTE_ORDER) {
    const route = ROUTES[slug];
    for (const field of ["purpose", "audience", "userQuestion", "overture", "signature", "datum", "conversion", "reduced", "nojs", "mobile", "landscape"]) {
      assert.ok(route[field]?.length > 8, `${slug}.${field}`);
    }
    assert.ok(route.chapters.length >= 3, `${slug} chapters`);
    assert.ok(route.motion.length >= 2, `${slug} motion`);
    assert.equal(route.materials.length, 4, `${slug} material vocabulary`);
    assert.equal(route.openQuestions.length, 2, `${slug} human questions`);
    for (const field of ["runtime", "js", "css", "media", "risk", "dependency"]) assert.ok(route.performance[field], `${slug}.performance.${field}`);
  }

  const productionFiles = [
    ...await readTextTree(path.join(ROOT, "src")),
    ...await readTextTree(path.join(ROOT, "public")),
  ];
  const configuration = await Promise.all(["astro.config.mjs", "package.json"].map((file) => readFile(path.join(ROOT, file), "utf8")));
  assert.doesNotMatch(`${productionFiles.map(({ text }) => text).join("\n")}\n${configuration.join("\n")}`, /QH_PHASE5A_ROUTE_LAB_ONLY|phase-5a-supporting-routes/i, "lab cannot leak into public application or build configuration");

  return { files: texts.length, bytes: texts.reduce((total, file) => total + file.bytes, 0) };
}

async function verifyEvidence(output) {
  if (!path.isAbsolute(output)) throw new Error("Evidence path must be absolute");
  const relative = path.relative(ROOT, output);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) throw new Error("Evidence must remain outside the repository");
  const manifest = JSON.parse(await readFile(path.join(output, "route-preproduction-manifest.json"), "utf8"));
  assert.equal(manifest.status, "PASS");
  assert.deepEqual(manifest.routes, ROUTE_ORDER);
  assert.equal(manifest.phase5BAuthorized, false);
  assert.equal(manifest.humanGates, "all six pending");
  const plan = JSON.parse(await readFile(path.join(LAB, "capture-plan.json"), "utf8"));
  for (const slug of ROUTE_ORDER) {
    const routeDirectory = path.join(output, "routes", slug);
    for (const filename of plan.requiredRouteArtifacts) {
      const target = path.join(routeDirectory, filename);
      assert.ok(await exists(target), `${slug}/${filename}`);
      if (/\.png$/i.test(target)) {
        const metadata = await sharp(target, { failOn: "error" }).metadata();
        assert.equal(metadata.format, "png", `${slug}/${filename} format`);
        assert.ok((metadata.width ?? 0) >= 320 && (metadata.height ?? 0) >= 390, `${slug}/${filename} dimensions`);
      }
    }
  }
  for (const target of [
    path.join(output, "cross-route-system", "cross-route-system-board.png"),
    path.join(output, "reports", "accessibility.json"),
    path.join(output, "reports", "browser-capture-report.json"),
  ]) assert.ok(await exists(target), target);
  const accessibility = JSON.parse(await readFile(path.join(output, "reports", "accessibility.json"), "utf8"));
  assert.equal(accessibility.status, "PASS");
  assert.equal(accessibility.seriousOrCriticalViolations, 0);
  const browser = JSON.parse(await readFile(path.join(output, "reports", "browser-capture-report.json"), "utf8"));
  assert.equal(browser.status, "PASS");
  assert.deepEqual(browser.requestIsolation, { status: "PASS", requests: browser.requestIsolation.requests, external: 0, cinematic: 0, video: 0 });
  return { files: (await walk(output)).length, manifestFiles: manifest.totals.files, manifestBytes: manifest.totals.bytes };
}

const source = await verifySource();
const evidencePath = argument("evidence-root");
const evidence = evidencePath ? await verifyEvidence(path.resolve(evidencePath)) : null;
console.log(JSON.stringify({ schema: "qh.phase5a.route-preproduction-verifier.v1", status: "PASS", source, evidence }, null, 2));
