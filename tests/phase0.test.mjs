import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
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

async function sha256(relativePath) {
  return createHash("sha256").update(await readFile(path.join(root, relativePath))).digest("hex");
}

test("Astro is explicitly static and produces dist", async () => {
  const config = await read("astro.config.mjs");
  assert.match(config, /output:\s*["']static["']/);
  assert.match(config, /format:\s*["']directory["']/);
});

test("Phase 0 surface contains only approved launch-facing claims", async () => {
  const page = await read("src/pages/index.astro");
  assert.match(page, /For industry/);
  assert.match(page, /For startups/);
  assert.match(page, /Prove it where it has to work\./);
  assert.doesNotMatch(page, /Defense|dual[- ]use|application form|testimonial/i);
});

test("Phase 0 uses no React, Vinext, WebGL, GSAP, or form runtime", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const prohibited of ["react", "react-dom", "vinext", "three", "@react-three/fiber", "gsap"]) {
    assert.equal(dependencies[prohibited], undefined, `${prohibited} must be absent`);
  }
});

test("all required planning records are present", async () => {
  const required = [
    "HUMAN_REVIEW_PACKAGE.md",
    "REFERENCE_AUDIT.md",
    "ORIGINALITY_DEPARTURE_MATRIX.md",
    "PUBLICATION_MATRIX.md",
    "ASSET_REGISTER.md",
    "IMPLEMENTATION_GATES.md",
    "SPIRAL_CONDUCTION_AMENDMENT.md",
    "FRAMEWORK_AND_CLOUDFLARE_CONTRACT.md",
    "QHUB_IMPORT_LEDGER.md",
  ];
  for (const filename of required) {
    assert.equal((await stat(path.join(root, "docs", "planning", filename))).isFile(), true, `${filename} missing`);
  }
});

test("frozen Q-HUB imports match the approved destination hashes", async () => {
  const expected = {
    "public/brand/quantum-full-logo-colors.svg": "3b978e3a639d38e5d869afdae02d5e01eea706829ba95f1b9ee82710ffb19196",
    "public/brand/quantum-full-logo-white.svg": "244f2bb9a95af7ce6d337e1946dedac3ace6cf01feab53c1b0c2d75e58a68032",
    "public/brand/quantum-icon-color.svg": "04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9",
    "public/brand/quantum-icon-white.svg": "c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff",
    "public/media/maradin/maradin-field-aperture-approved.mp4": "daaec510c528bd7f72a97cfce1d9ede3359ec1339e28e26f524d127f09bf247c",
    "public/media/maradin/maradin-field-aperture-poster-approved.jpg": "6afc1a69570f2541b89b4f6a5074bec04a5d607743d91670321f550b4d6364bd",
    "public/media/maradin/maradin-test-contact-approved.mp4": "076aecf40d9e67ac29eb0b8e2d34ffc374619862a9679a6e44bc08ccfd2c113d",
    "public/media/maradin/maradin-prove-field-frame-approved.jpg": "b85f1bd5413b6fe7da235e5217e16b106ae4ff0763e8deb9db6e509dbc0b8b8c",
    "public/media/maradin/maradin-real-field-still-approved.jpg": "49ab9aca0d2e3ef9e9ce164f43f9dbd1514ef815179626bef2bb4217827a6741",
  };
  for (const [relativePath, expectedHash] of Object.entries(expected)) {
    assert.equal(await sha256(relativePath), expectedHash, `${relativePath} hash mismatch`);
  }
});

test("every registered committed asset matches its registered SHA-256", async () => {
  const register = await read("docs/planning/ASSET_REGISTER.md");
  let verified = 0;
  for (const line of register.split(/\r?\n/)) {
    if (!line.startsWith("| `")) continue;
    const values = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    const relativePath = values.find((value) => /^(?:public|artifacts)\//.test(value));
    const expectedHash = values.find((value) => /^[a-f0-9]{64}$/.test(value));
    if (!relativePath || !expectedHash) continue;
    assert.equal(await sha256(relativePath), expectedHash, `${relativePath} register mismatch`);
    verified += 1;
  }
  assert.equal(verified, 142, "unexpected registered-asset count");
});

test("Spiral Conduction harness is direct-progress, reverse-safe, and single-scroll-root", async () => {
  const controller = await read("prototypes/phase-0-spiral-field/app.js");
  const styles = await read("prototypes/phase-0-spiral-field/styles.css");
  assert.match(controller, /progressFromDocument\(\)/);
  assert.match(controller, /range\(progress, 0\.08, 0\.8\)/);
  assert.match(controller, /range\(progress, 0\.8, 0\.87\)/);
  assert.match(controller, /range\(progress, 0\.89, 0\.97\)/);
  assert.match(controller, /addEventListener\("scroll", requestRender/);
  assert.doesNotMatch(controller, /addEventListener\(["']wheel|preventDefault\s*\(/i);
  assert.doesNotMatch(styles, /overflow-y\s*:\s*(?:auto|scroll)/i);
  assert.equal((controller.match(/<svg\b/g) ?? []).length, 2, "desktop and mobile SVG compositions must both exist");
});

test("reduced-motion path constructs only the dormant picture", async () => {
  const controller = await read("prototypes/phase-0-spiral-field/app.js");
  const reducedBranch = controller.indexOf("if (isReduced)");
  const animatedMount = controller.indexOf("mount.innerHTML = isMobile ? mobileScene() : desktopScene()");
  assert.ok(reducedBranch >= 0 && animatedMount > reducedBranch, "reduced branch must return before animated scene construction");
  assert.match(controller, /reduced-motion-poster-desktop\.svg/);
  assert.match(controller, /reduced-motion-poster-mobile\.svg/);
  assert.doesNotMatch(controller, /createElement\(["']video["']\)/i);
});

test("all ten original creative SVGs have declared review dimensions", async () => {
  const directory = path.join(root, "artifacts", "original", "phase-0");
  const svgs = (await readdir(directory)).filter((name) => name.endsWith(".svg"));
  assert.equal(svgs.length, 10);
  for (const name of svgs) {
    const contents = await readFile(path.join(directory, name), "utf8");
    assert.match(contents, /^<svg\b[^>]*\bwidth="\d+"[^>]*\bheight="\d+"[^>]*>/);
    assert.match(contents, /<title\b/);
    assert.match(contents, /<desc\b/);
    assert.match(contents, /<\/svg>\s*$/);
  }
});

test("real encoded-seek evidence is internally consistent and explicitly scoped", async () => {
  const report = JSON.parse(await read("artifacts/evidence/phase-0/encoded-seek-spike-report.json"));
  const media = await stat(path.join(root, "artifacts", "evidence", "phase-0", "encoded-seek-spike-vp9.webm"));
  assert.equal(report.media.mimeType, "video/webm;codecs=vp9");
  assert.equal(report.media.bytes, media.size);
  assert.equal(report.samples.length, 7);
  assert.deepEqual(report.seekOrder, [0, 0.25, 0.5, 0.75, 0.99, 0.5, 0.1]);
  assert.ok(report.samples.every((sample) => Number.isFinite(sample.seekedMs)));
  assert.match(report.scope, /feasibility only/i);
  assert.match(report.ffprobe, /Unavailable/);
});

test("repository source and docs do not contain private absolute paths", async () => {
  const targets = ["src", "tests", "scripts", "public"];
  for (const candidate of ["docs", "prototypes", "artifacts"]) {
    try {
      await readdir(path.join(root, candidate));
      targets.push(candidate);
    } catch {}
  }
  const files = (await Promise.all(targets.map((target) => walk(path.join(root, target))))).flat();
  for (const file of files) {
    if (!/\.(?:astro|css|html|js|mjs|ts|json|md|svg)$/i.test(file)) continue;
    const contents = await readFile(file, "utf8");
    assert.doesNotMatch(contents, /[A-Z]:[\\/]Users[\\/][^\\/\s]+[\\/]/i, `private path leaked from ${file}`);
  }
});

test("public and prototype sources contain no prohibited launch taxonomy or fake records", async () => {
  const files = (
    await Promise.all(["src", "public", "prototypes"].map((target) => walk(path.join(root, target))))
  ).flat();
  for (const file of files) {
    if (!/\.(?:astro|css|html|js|mjs|ts|json|md|svg)$/i.test(file)) continue;
    const contents = await readFile(file, "utf8");
    assert.doesNotMatch(contents, /Defense|dual[- ]use|lorem ipsum|coming soon/i, `prohibited output in ${file}`);
  }
});

test("no committed binary matches a private third-party reference artifact", async () => {
  const manifest = await read("docs/planning/REFERENCE_AUDIT.md");
  const privateHashes = new Set([...manifest.matchAll(/\b[a-f0-9]{64}\b/g)].map((match) => match[0]));
  assert.ok(privateHashes.size > 0, "reference manifest must contain private evidence hashes");
  const committedAssetFiles = (
    await Promise.all(["artifacts", "public"].map((target) => walk(path.join(root, target))))
  ).flat();
  for (const file of committedAssetFiles) {
    if (/\.(?:md|json|txt)$/i.test(file)) continue;
    const digest = createHash("sha256").update(await readFile(file)).digest("hex");
    assert.equal(privateHashes.has(digest), false, `private reference binary copied as ${file}`);
  }
});
