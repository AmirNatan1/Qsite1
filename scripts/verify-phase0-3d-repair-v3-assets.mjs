import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const packageRelative = "artifacts/original/phase-0-3d-repair-v3";
const packageRoot = path.join(repositoryRoot, ...packageRelative.split("/"));
const matrixRelative = "artifacts/evidence/phase-0-3d-repair-v3/browser-matrix-report.json";
const maximumFileBytes = 100 * 1024 * 1024;
const errors = [];

const reviewPngNames = new Set([
  "aperture-station-silhouette-options.png",
  "aperture-station-recommended-design-sheet.png",
  "aperture-station-material-sheet.png",
  "cable-conductor-v3-sheet.png",
  "proving-ground-v3-style-frame.png",
  "camera-path-v3-study.png",
  "activation-v3-contact-sheet.png",
  "portal-typography-v3-sheet.png",
  "desktop-hero-composition-v3.png",
  "mobile-hero-composition-v3.png",
  "text-zoom-and-fallback-v3.png",
  "reduced-motion-v3-desktop.png",
  "reduced-motion-v3-mobile.png",
]);

const browserReviewPngNames = new Set([
  "portal-typography-v3-sheet.png",
  "desktop-hero-composition-v3.png",
  "mobile-hero-composition-v3.png",
  "text-zoom-and-fallback-v3.png",
]);

const requiredPackageFiles = [
  "README.md",
  "portal-layout.json",
  "source/quantum-aperture-station-v3.blend",
  "source/quantum-aperture-station-v3-blockouts.blend",
  "source/build_final_station.py",
  "source/build_station_blockouts.py",
  "source/compose_final_review.py",
  "source/compose_portal_surfaces.py",
  "source/compose_silhouette_gate.py",
  "source/emit_scene_keepouts.py",
  "source/finalize_review_bundle.py",
  "source/refresh_package_manifests.py",
  "source/render_final_stills.py",
  "source/render_station_blockouts.py",
  "source/sanitize_png_metadata.py",
  "source/scene_config.py",
  "source/validate_final_scene.py",
  "manifests/blockout-render-manifest.json",
  "manifests/silhouette-decision-manifest.json",
  "manifests/final-render-manifest-all.json",
  "manifests/final-render-manifest-diagnostic.json",
  "manifests/final-render-manifest-mobile.json",
  "manifests/portal-surface-manifest.json",
  "manifests/review-composition-manifest.json",
  "manifests/browser-review-composition-manifest.json",
  "manifests/scene-source-keepouts.json",
  "manifests/review-originals-manifest.json",
  "manifests/blender-source-validation.json",
  "manifests/png-metadata-sanitization.json",
  "manifests/review-bundle-manifest.json",
  "manifests/package-inventory.json",
];

const protectedBaseline = new Map([
  ["artifacts/original/phase-0-3d-repair", "ac46cd1546dc8df8c41302574a39d0aef4465b52"],
  ["artifacts/original/phase-0-3d-repair-v2", "45dc45438ce1b981d448d7d3ea6c7ece38dea471"],
  ["public/brand", "23f2070b032fe564f5edc1a03ac720243555e2f8"],
  ["public/media/maradin", "5d33491efd0b72b4b85b412f87904c07456092d3"],
  ["docs/planning/QHUB_IMPORT_LEDGER.md", "7d521a8b229950338f2be3b77465cf94cd007526"],
  ["docs/planning/PUBLICATION_MATRIX.md", "641bc101ac3e868126917c58d93c5929831c2ae2"],
]);

const videoExtensions = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v", ".ogv"]);
const fontExtensions = new Set([".eot", ".otf", ".ttf", ".woff", ".woff2"]);
const archiveExtensions = new Set([".zip", ".7z", ".rar", ".tar", ".gz", ".bz2", ".xz"]);
const executableExtensions = new Set([".exe", ".dll", ".msi", ".bat", ".cmd", ".com"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".py", ".svg", ".txt"]);

function check(condition, message) {
  if (!condition) errors.push(message);
}

function normalize(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function packageAbsolute(relative) {
  return path.join(packageRoot, ...normalize(relative).split("/"));
}

function repositoryAbsolute(relative) {
  return path.join(repositoryRoot, ...normalize(relative).split("/"));
}

async function exists(relative, scope = "package") {
  try {
    const target = scope === "repository" ? repositoryAbsolute(relative) : packageAbsolute(relative);
    return (await stat(target)).isFile();
  } catch {
    return false;
  }
}

async function readJson(relative, scope = "package") {
  try {
    const target = scope === "repository" ? repositoryAbsolute(relative) : packageAbsolute(relative);
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    errors.push(`unable to read ${relative}: ${error.message}`);
    return null;
  }
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function sha256File(file) {
  return sha256Buffer(await readFile(file));
}

function pngDimensions(buffer, label) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    errors.push(`${label} is not a valid PNG`);
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function walk(directory, relative = "") {
  const files = [];
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    errors.push(`unable to inspect ${relative || packageRelative}: ${error.message}`);
    return files;
  }
  for (const entry of entries) {
    const childRelative = normalize(path.posix.join(relative, entry.name));
    const child = path.join(directory, entry.name);
    const metadata = await lstat(child);
    if (metadata.isSymbolicLink()) {
      errors.push(`symbolic link is not permitted in the Phase 0.3 package: ${childRelative}`);
    } else if (metadata.isDirectory()) {
      files.push(...(await walk(child, childRelative)));
    } else if (metadata.isFile()) {
      files.push({ absolute: child, relative: childRelative, bytes: metadata.size });
    }
  }
  return files;
}

function utf16BigEndian(buffer) {
  const evenLength = buffer.length - (buffer.length % 2);
  const swapped = Buffer.allocUnsafe(evenLength);
  for (let index = 0; index < evenLength; index += 2) {
    swapped[index] = buffer[index + 1];
    swapped[index + 1] = buffer[index];
  }
  return swapped.toString("utf16le");
}

function privatePathHit(buffer) {
  const representations = [buffer.toString("latin1"), buffer.toString("utf16le"), utf16BigEndian(buffer)];
  const patterns = [
    ["Windows user-profile path", /[a-z]:[\\/]+(?:users|documents and settings)[\\/]+/i],
    ["POSIX user-profile path", /\/(?:users|home)\/[a-z0-9._-]+(?:[\\/]|$)/i],
    ["OneDrive private path", /onedrive[\\/]+/i],
    ["private Codex path", /(?:^|[\\/])\.codex[\\/]+/i],
  ];
  for (const representation of representations) {
    for (const [label, expression] of patterns) if (expression.test(representation)) return label;
  }
  return null;
}

function comparableRecord(record) {
  return {
    path: normalize(record?.path),
    width: Number(record?.width),
    height: Number(record?.height),
    bytes: Number(record?.bytes),
    sha256: String(record?.sha256 ?? "").toLowerCase(),
  };
}

function checkRecordMatches(record, authority, label) {
  const observed = comparableRecord(record);
  const expected = comparableRecord(authority);
  check(observed.path === expected.path, `${label} path disagrees with its authority`);
  check(observed.width === expected.width, `${label} width disagrees with its authority: ${observed.path}`);
  check(observed.height === expected.height, `${label} height disagrees with its authority: ${observed.path}`);
  check(observed.bytes === expected.bytes, `${label} byte count disagrees with its authority: ${observed.path}`);
  check(observed.sha256 === expected.sha256, `${label} SHA-256 disagrees with its authority: ${observed.path}`);
}

async function verifyRecord(record, label, scope = "package") {
  const relative = normalize(record?.path);
  check(relative.length > 0 && !relative.includes("..") && !path.isAbsolute(relative), `${label} has an invalid path`);
  if (!relative || relative.includes("..") || !(await exists(relative, scope))) {
    errors.push(`${label} file is missing: ${relative || "<empty>"}`);
    return null;
  }
  const file = scope === "repository" ? repositoryAbsolute(relative) : packageAbsolute(relative);
  const metadata = await stat(file);
  const buffer = await readFile(file);
  const digest = sha256Buffer(buffer);
  check(metadata.size === Number(record.bytes), `${label} byte count mismatch: ${relative}`);
  check(digest === String(record.sha256 ?? "").toLowerCase(), `${label} SHA-256 mismatch: ${relative}`);
  if (path.extname(relative).toLowerCase() === ".png") {
    const dimensions = pngDimensions(buffer, relative);
    if (dimensions) {
      check(dimensions.width === Number(record.width), `${label} width mismatch: ${relative}`);
      check(dimensions.height === Number(record.height), `${label} height mismatch: ${relative}`);
    }
  }
  return { relative, bytes: metadata.size, sha256: digest };
}

function git(args) {
  const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

for (const relative of requiredPackageFiles) check(await exists(relative), `missing required Phase 0.3 package file: ${relative}`);
check(await exists(matrixRelative, "repository"), `missing Phase 0.3 browser matrix: ${matrixRelative}`);

const files = await walk(packageRoot);
const reviewPngObserved = new Set(
  files.filter((file) => /^review\/[^/]+\.png$/i.test(file.relative)).map((file) => path.posix.basename(file.relative)),
);
for (const name of reviewPngNames) check(reviewPngObserved.has(name), `missing exact Phase 0.3 review PNG: review/${name}`);
for (const name of reviewPngObserved) check(reviewPngNames.has(name), `unexpected PNG in the exact Phase 0.3 review set: review/${name}`);
check(reviewPngObserved.size === reviewPngNames.size, `Phase 0.3 review set has ${reviewPngObserved.size}/${reviewPngNames.size} exact PNGs`);

let packageBytes = 0;
let largestFile = { relative: "", bytes: 0 };
for (const file of files) {
  packageBytes += file.bytes;
  if (file.bytes > largestFile.bytes) largestFile = file;
  const extension = path.extname(file.relative).toLowerCase();
  check(file.bytes < maximumFileBytes, `Phase 0.3 package file reaches the 100 MiB repository limit: ${file.relative}`);
  check(!file.relative.split("/").includes("__pycache__"), `Python cache is not permitted: ${file.relative}`);
  check(extension !== ".blend1", `Blender backup is not permitted: ${file.relative}`);
  check(!videoExtensions.has(extension), `video is outside the Phase 0.3 still-only authorization: ${file.relative}`);
  check(!fontExtensions.has(extension), `font binary is not licensed or authorized for Phase 0.3: ${file.relative}`);
  check(!archiveExtensions.has(extension), `archive is not permitted in the Phase 0.3 package: ${file.relative}`);
  check(!executableExtensions.has(extension), `executable is not permitted in the Phase 0.3 package: ${file.relative}`);
  check(!/(?:^|\/)(?:frames?|animatic)(?:\/|$)/i.test(file.relative), `full-frame sequence path is not permitted: ${file.relative}`);
  check(!/(?:^|\/)(?:frame|render)[-_]?\d{3,}\.(?:png|jpe?g)$/i.test(file.relative), `full-frame sequence member is not permitted: ${file.relative}`);
  check(!/(?:^|\/)(?:tmp|temp|cache)(?:\/|$)/i.test(file.relative), `temporary/cache path is not permitted: ${file.relative}`);
  check(!/(?:^|\/)work\/(?!\.gitignore$)/i.test(file.relative), `working output is not permitted: ${file.relative}`);
  const buffer = await readFile(file.absolute);
  const privateHit = privatePathHit(buffer);
  check(!privateHit, `${privateHit} leaked at byte level: ${file.relative}`);
  if (textExtensions.has(extension)) {
    const source = buffer.toString("utf8");
    check(!/\bdefen[cs]e\b|\bdual[\s_-]?use\b/i.test(source), `prohibited public taxonomy leaked into Phase 0.3 package text: ${file.relative}`);
  }
  if ([".blend", ".png", ".jpg", ".jpeg"].includes(extension)) {
    check(!/(?:kunal|scraped|stock|reference[-_ ]?(?:screenshot|video|capture))/i.test(path.posix.basename(file.relative)), `third-party/reference binary filename is not permitted: ${file.relative}`);
  }
  const prefix = buffer.subarray(0, 140).toString("utf8");
  check(!/^version https:\/\/git-lfs\.github\.com\/spec\/v1/m.test(prefix), `Git LFS pointer is not permitted: ${file.relative}`);
}

const attributesPath = path.join(repositoryRoot, ".gitattributes");
try {
  const attributes = await readFile(attributesPath, "utf8");
  check(!/filter\s*=\s*lfs|filter=lfs/i.test(attributes), "Git LFS configuration is not permitted for Phase 0.3 evidence");
} catch (error) {
  if (error.code !== "ENOENT") errors.push(`unable to inspect .gitattributes: ${error.message}`);
}

for (const [relative, expectedObject] of protectedBaseline) {
  const resolved = git(["rev-parse", `HEAD:${relative}`]);
  check(resolved.status === 0, `unable to resolve protected baseline object ${relative}: ${resolved.stderr}`);
  if (resolved.status === 0) check(resolved.stdout === expectedObject, `protected baseline object changed: ${relative}`);
  const diff = git(["diff", "--quiet", "--", relative]);
  check(diff.status === 0, `protected baseline has a working-tree diff: ${relative}`);
}

const packageJson = await readJson("package.json", "repository");
if (packageJson) {
  check(JSON.stringify(Object.keys(packageJson.dependencies ?? {}).sort()) === JSON.stringify(["astro"]), "unapproved application runtime dependency is present");
  check(String(packageJson.scripts?.check ?? "").includes("verify-phase0-3d-repair-v3-layout.mjs"), "Phase 0.3 layout verifier is not wired into npm check");
  check(String(packageJson.scripts?.check ?? "").includes("verify-phase0-3d-repair-v3-assets.mjs"), "Phase 0.3 asset verifier is not wired into npm check");
}

const blendRelative = "source/quantum-aperture-station-v3.blend";
const blockoutBlendRelative = "source/quantum-aperture-station-v3-blockouts.blend";
const portalLayoutRelative = "portal-layout.json";
if (await exists(blendRelative)) {
  const metadata = await stat(packageAbsolute(blendRelative));
  check(metadata.size > 100_000, "final editable Blender source is implausibly small");
}

const validation = await readJson("manifests/blender-source-validation.json");
if (validation) {
  check(validation.schema === "quantum-hub.phase-0-3d-repair-v3.blender-source-validation.v1", "unexpected Phase 0.3 Blender source-validation schema");
  check(validation.pass === true, "Blender source-validation machine report did not pass");
  check(normalize(validation.source?.path) === blendRelative, "Blender source-validation report points to the wrong source");
  if (await exists(blendRelative)) {
    const metadata = await stat(packageAbsolute(blendRelative));
    check(Number(validation.source?.bytes) === metadata.size, "Blender source-validation byte count is stale");
    check(String(validation.source?.sha256 ?? "").toLowerCase() === (await sha256File(packageAbsolute(blendRelative))), "Blender source-validation SHA-256 is stale");
  }
  check(normalize(validation.validator?.path) === "source/validate_final_scene.py", "Blender validation report names the wrong validator");
  if (await exists("source/validate_final_scene.py")) {
    check(String(validation.validator?.sha256 ?? "").toLowerCase() === (await sha256File(packageAbsolute("source/validate_final_scene.py"))), "Blender validator hash is stale");
  }
  check(Array.isArray(validation.checks) && validation.checks.length === 13, `Blender validation has ${validation.checks?.length ?? 0}/13 checks`);
  check((validation.checks ?? []).every((record) => record.pass === true), "one or more Blender validation checks failed");
  const externalCheck = (validation.checks ?? []).find((record) => /no external libraries/i.test(record.name ?? ""));
  check(Boolean(externalCheck) && externalCheck.pass === true, "Blender validation lacks a passing no-external-library check");
  check((externalCheck?.evidence?.libraries ?? []).length === 0, "Blender source links an external library");
  check((externalCheck?.evidence?.file_images ?? []).length === 0, "Blender source links an external image");
  check((externalCheck?.evidence?.external_fonts ?? []).length === 0, "Blender source links an external font");
  const cameraCheck = (validation.checks ?? []).find((record) => /28-degree arc/i.test(record.name ?? ""));
  check(Number(cameraCheck?.evidence?.span_degrees) === 28, "Blender validation does not bind the 28-degree camera arc");
  const mobileCableCheck = (validation.checks ?? []).find((record) => /independent 2\.25-turn portrait cable/i.test(record.name ?? ""));
  check(mobileCableCheck?.pass === true && Number(mobileCableCheck?.evidence?.turns) === 2.25, "Blender validation does not bind the independent 2.25-turn portrait cable");
  const stillCheck = (validation.checks ?? []).find((record) => /still-only source/i.test(record.name ?? ""));
  check(stillCheck?.pass === true && stillCheck?.evidence?.full_animatic_created === false, "Blender validation does not prove the still-only source boundary");
}

const blockoutManifest = await readJson("manifests/blockout-render-manifest.json");
const finalRenderManifest = await readJson("manifests/final-render-manifest-all.json");
const diagnosticRenderManifest = await readJson("manifests/final-render-manifest-diagnostic.json");
const mobileRenderManifest = await readJson("manifests/final-render-manifest-mobile.json");
const portalManifest = await readJson("manifests/portal-surface-manifest.json");

const sourceIndex = new Map();
for (const [manifestName, records] of [
  ["blockout-render-manifest.json", blockoutManifest?.records],
  ["final-render-manifest-all.json", finalRenderManifest?.renders],
  ["final-render-manifest-diagnostic.json", diagnosticRenderManifest?.renders],
  ["final-render-manifest-mobile.json", mobileRenderManifest?.renders],
  ["portal-surface-manifest.json", portalManifest?.outputs],
]) {
  for (const record of records ?? []) {
    const verified = await verifyRecord(record, manifestName);
    if (verified) {
      const original = comparableRecord(record);
      sourceIndex.set(verified.relative, { ...original, manifest: `manifests/${manifestName}` });
    }
  }
}

if (blockoutManifest) {
  check(blockoutManifest.schema === "quantum-hub.phase-0-3d-repair-v3.blockout-renders.v1", "unexpected Phase 0.3 blockout schema");
  check(blockoutManifest.external_assets === false && Number(blockoutManifest.dormant_emission) === 0, "blockout boundary does not prove original dormant assets");
  check(normalize(blockoutManifest.source?.path) === blockoutBlendRelative, "blockout manifest points to the wrong editable source");
  if (await exists(blockoutBlendRelative)) {
    check(String(blockoutManifest.source?.sha256 ?? "").toLowerCase() === (await sha256File(packageAbsolute(blockoutBlendRelative))), "blockout source hash is stale");
  }
  check((blockoutManifest.records ?? []).length === 12, `blockout manifest has ${blockoutManifest.records?.length ?? 0}/12 option views`);
}

for (const [name, manifest] of [["final", finalRenderManifest], ["diagnostic", diagnosticRenderManifest], ["mobile", mobileRenderManifest]]) {
  if (!manifest) continue;
  check(manifest.schema === "quantum-hub.phase-0-3d-repair-v3.final-still-renders.v1", `unexpected ${name} render schema`);
  check(manifest.still_only === true && manifest.full_animatic === false, `${name} render manifest violates the still-only contract`);
  check(manifest.original_artwork === true && manifest.reference_binary_used === false, `${name} render manifest violates original-artwork boundaries`);
  check(normalize(manifest.source) === blendRelative, `${name} render manifest points to the wrong Blender source`);
  if (await exists(blendRelative)) check(String(manifest.source_sha256 ?? "").toLowerCase() === (await sha256File(packageAbsolute(blendRelative))), `${name} render source hash is stale`);
  check(Number(manifest.camera_study_arc_degrees) === 28 && Number(manifest.camera_checkpoint_count) === 5, `${name} render manifest does not bind the 28-degree/five-checkpoint camera authority`);
  check(Number(manifest.mechanical_response_count) === 1 && /internal iris/i.test(manifest.mechanical_response ?? ""), `${name} render manifest does not bind the single internal mechanism`);
}
if (mobileRenderManifest) {
  const mobileRecords = mobileRenderManifest.renders ?? [];
  check(mobileRecords.length === 3, `mobile render manifest has ${mobileRecords.length}/3 exact sources`);
  check(mobileRecords.every((record) => record.cable_composition === "portrait-authored-2.25-turn"), "mobile render manifest does not bind the portrait-authored 2.25-turn cable for every source");
  const expectedMobileNames = new Set(["mobile-dormant-base", "mobile-mid-base", "reduced-mobile-base"]);
  check(mobileRecords.every((record) => expectedMobileNames.has(record.name)), "mobile render manifest contains an unexpected source");
}

if (portalManifest) {
  check(portalManifest.schema === "quantum-hub.phase-0-3d-repair-v3.portal-surface-render.v1", "unexpected Phase 0.3 portal-surface schema");
  check(normalize(portalManifest.layout) === portalLayoutRelative, "portal-surface manifest points to the wrong layout contract");
  if (await exists(portalLayoutRelative)) check(String(portalManifest.layout_sha256 ?? "").toLowerCase() === (await sha256File(packageAbsolute(portalLayoutRelative))), "portal-surface layout hash is stale");
  check(Number(portalManifest.maximum_anchor_delta_px) <= Number(portalManifest.accepted_anchor_tolerance_px), "portal-surface anchor report exceeds tolerance");
}

const silhouette = await readJson("manifests/silhouette-decision-manifest.json");
if (silhouette) {
  check(silhouette.schema === "quantum-hub.phase-0-3d-repair-v3.silhouette-decision.v1", "unexpected Phase 0.3 silhouette-decision schema");
  check(silhouette.recommended_option === "A", "silhouette authority does not select Option A");
  const sheet = silhouette.sheet ?? {};
  await verifyRecord(sheet, "silhouette-decision-manifest.json");
  for (const source of silhouette.source_renders ?? []) {
    const relative = normalize(source.path ?? source.source);
    const authority = sourceIndex.get(relative);
    check(Boolean(authority), `silhouette source is not governed by a canonical blockout manifest: ${relative}`);
    if (authority) check(String(source.sha256 ?? "").toLowerCase() === authority.sha256, `silhouette source hash is stale: ${relative}`);
  }
}

const keepouts = await readJson("manifests/scene-source-keepouts.json");
if (keepouts) {
  check(keepouts.schema === "quantum-hub.phase-0-3d-repair-v3.scene-source-keepouts.v1", "unexpected scene-source keepout schema");
  check(normalize(keepouts.source_blend?.path) === blendRelative, "scene keepouts point to the wrong Blender source");
  if (await exists(blendRelative)) check(String(keepouts.source_blend?.sha256 ?? "").toLowerCase() === (await sha256File(packageAbsolute(blendRelative))), "scene keepout source hash is stale");
  check((keepouts.records ?? []).length >= 4, "scene keepout manifest lacks the required desktop/mobile/reduced authorities");
  for (const record of keepouts.records ?? []) {
    const authority = sourceIndex.get(normalize(record.source?.path));
    check(Boolean(authority), `scene keepout source lacks a canonical render authority: ${record.id}`);
    if (authority) checkRecordMatches(record.source, authority, `scene keepout ${record.id}`);
    check(Number(record.station?.bbox?.w) > 0 && Number(record.station?.bbox?.h) > 0, `scene keepout lacks a station box: ${record.id}`);
    check(Array.isArray(record.cable?.segment_rectangles) && record.cable.segment_rectangles.length > 0, `scene keepout lacks cable geometry: ${record.id}`);
  }
  const desktopKeepout = (keepouts.records ?? []).find((record) => record.id === "desktop-dormant");
  check(desktopKeepout?.cable?.object === "Cable_PhysicalGraphiteSheath", "desktop keepout points to the wrong cable authority");
  check(Number(desktopKeepout?.cable?.authored_turns) === 2.5 && desktopKeepout?.cable?.composition === "desktop", "desktop keepout does not bind the authored 2.5-turn spiral");
  for (const id of ["mobile-dormant", "reduced-mobile"]) {
    const record = (keepouts.records ?? []).find((item) => item.id === id);
    const visibility = record?.cable?.visibility_evidence;
    check(record?.cable?.object === "MobileCable_PhysicalGraphiteSheath", `${id} does not use the independent portrait cable`);
    check(Number(record?.cable?.authored_turns) === 2.25 && record?.cable?.composition === "portrait-authored", `${id} does not bind the authored 2.25-turn mobile spiral`);
    check(visibility?.gate_scope === "mobile-visible-turn-gate", `${id} lacks the mobile visible-turn gate`);
    check(Number(visibility?.pass_threshold_turns) === 2.15, `${id} uses the wrong visible-turn threshold`);
    check(Number(visibility?.visible_turns_approx) >= 2.15 && visibility?.pass === true, `${id} does not preserve approximately 2.25 visible turns`);
  }
}

const matrix = await readJson(matrixRelative, "repository");
const browserCaptureById = new Map();
if (matrix) {
  check(matrix.schema === "quantum-hub.phase-0-3d-repair-v3.typography-collision-matrix.v1", "unexpected Phase 0.3 browser-matrix schema");
  check(matrix.pass === true || (matrix.cases ?? []).every((record) => record.report?.pass === true && record.runner?.pass === true), "Phase 0.3 browser matrix did not pass");
  check((matrix.cases ?? []).length === 46, `Phase 0.3 browser matrix has ${matrix.cases?.length ?? 0}/46 cases`);
  for (const record of matrix.cases ?? []) {
    if (!record.capture?.path) continue;
    const capture = {
      path: normalize(record.capture.path),
      sha256: String(record.capture.sha256 ?? "").toLowerCase(),
      bytes: Number(record.capture.bytes),
      width: Number(record.capture.width),
      height: Number(record.capture.height),
    };
    browserCaptureById.set(record.id, capture);
    await verifyRecord(capture, `browser matrix ${record.id}`, "repository");
  }
  check(browserCaptureById.size === 36, `Phase 0.3 browser matrix has ${browserCaptureById.size}/36 normalized captures`);
}

const browserReview = await readJson("manifests/browser-review-composition-manifest.json");
if (browserReview) {
  check(browserReview.schema === "quantum-hub.phase-0-3d-repair-v3.browser-review-composition.v1", "unexpected browser-review composition schema");
  const observed = new Set();
  for (const record of browserReview.records ?? []) {
    const verified = await verifyRecord(record, "browser-review-composition-manifest.json");
    if (!verified) continue;
    observed.add(verified.relative);
    check(Array.isArray(record.sources) && record.sources.length > 0, `browser review output lacks capture sources: ${record.path}`);
    for (const source of record.sources ?? []) {
      const authority = browserCaptureById.get(source.captureId);
      check(Boolean(authority), `browser review source capture ID is absent from the matrix: ${source.captureId}`);
      if (authority) checkRecordMatches(source, authority, `browser review source ${source.captureId}`);
    }
  }
  check(observed.size === browserReviewPngNames.size, `browser-review manifest has ${observed.size}/${browserReviewPngNames.size} exact outputs`);
  for (const name of browserReviewPngNames) check(observed.has(`review/${name}`), `browser-review manifest omits review/${name}`);
  for (const relative of observed) check(browserReviewPngNames.has(path.posix.basename(relative)), `browser-review manifest has an unexpected output: ${relative}`);
}

const staticReviewNames = new Set([...reviewPngNames].filter((name) => name !== "aperture-station-silhouette-options.png" && !browserReviewPngNames.has(name)));
const reviewComposition = await readJson("manifests/review-composition-manifest.json");
if (reviewComposition) {
  check(reviewComposition.schema === "quantum-hub.phase-0-3d-repair-v3.review-composition.v1", "unexpected Phase 0.3 review-composition schema");
  check(reviewComposition.creative_boundary?.reference_binary_used === false && reviewComposition.creative_boundary?.external_asset_used === false, "static review composition violates original-asset boundaries");
  check(reviewComposition.render_contract?.still_only === true && reviewComposition.render_contract?.new_animatic_or_video === false, "static review composition violates still-only boundaries");
  const observed = new Set();
  for (const record of reviewComposition.records ?? []) {
    const verified = await verifyRecord(record, "review-composition-manifest.json");
    if (!verified) continue;
    observed.add(verified.relative);
    check(Array.isArray(record.source_paths) && record.source_paths.length > 0, `static review output lacks source lineage: ${record.path}`);
    for (const sourcePath of record.source_paths ?? []) {
      const relative = normalize(sourcePath);
      check(sourceIndex.has(relative) || relative === portalLayoutRelative, `static review source lacks a canonical authority: ${record.path} <- ${relative}`);
    }
  }
  check(observed.size === staticReviewNames.size, `static review manifest has ${observed.size}/${staticReviewNames.size} exact outputs`);
  for (const name of staticReviewNames) check(observed.has(`review/${name}`), `static review manifest omits review/${name}`);
  check((reviewComposition.pending_browser_derived_review_outputs ?? []).length === 4, "static review manifest does not disclose the four browser-derived outputs");
}

const reviewOriginals = await readJson("manifests/review-originals-manifest.json");
if (reviewOriginals) {
  check(reviewOriginals.schema === "quantum-hub.phase-0-3d-repair-v3.review-originals.v1", "unexpected Phase 0.3 review-originals schema");
  check(reviewOriginals.required_count === 12 && reviewOriginals.all_required_present === true, "review-originals manifest is not sealed at 12 compositor outputs");
  check(reviewOriginals.creative_boundary?.reference_binary_used === false && reviewOriginals.creative_boundary?.external_asset_used === false, "review originals violate original-asset boundaries");
  check(reviewOriginals.creative_boundary?.font_binary_bundled === false, "review originals bundle a font binary");
  check(reviewOriginals.render_contract?.still_only === true && reviewOriginals.render_contract?.new_animatic_or_video === false, "review originals violate still-only boundaries");
  check(normalize(reviewOriginals.final_blend?.path) === blendRelative, "review originals point to the wrong Blender source");
  if (await exists(blendRelative)) {
    const metadata = await stat(packageAbsolute(blendRelative));
    check(Number(reviewOriginals.final_blend?.bytes) === metadata.size, "review-originals Blender byte count is stale");
    check(String(reviewOriginals.final_blend?.sha256 ?? "").toLowerCase() === (await sha256File(packageAbsolute(blendRelative))), "review-originals Blender hash is stale");
  }
  const compositionAuthorities = new Map(
    [...(reviewComposition?.records ?? []), ...(browserReview?.records ?? [])].map((record) => [normalize(record.path), record]),
  );
  const observed = new Set();
  for (const record of reviewOriginals.records ?? []) {
    const verified = await verifyRecord(record, "review-originals-manifest.json");
    if (!verified) continue;
    observed.add(verified.relative);
    const authority = compositionAuthorities.get(verified.relative);
    check(Boolean(authority), `review original lacks an upstream composition authority: ${record.path}`);
    if (authority) checkRecordMatches(record, authority, "review-originals lineage");
  }
  const expected = new Set([...reviewPngNames].filter((name) => name !== "aperture-station-silhouette-options.png").map((name) => `review/${name}`));
  check(observed.size === expected.size, `review-originals manifest has ${observed.size}/${expected.size} exact outputs`);
  for (const relative of expected) check(observed.has(relative), `review-originals manifest omits ${relative}`);
}

const reviewBundle = await readJson("manifests/review-bundle-manifest.json");
if (reviewBundle) {
  check(reviewBundle.schema === "quantum-hub.phase-0-3d-repair-v3.review-bundle.v1", "unexpected Phase 0.3 review-bundle schema");
  check(reviewBundle.required_count === 13 && reviewBundle.all_required_present === true, "review bundle is not sealed at exactly 13 outputs");
  const authorityPairs = [
    ["reviewOriginals", "manifests/review-originals-manifest.json"],
    ["silhouetteDecision", "manifests/silhouette-decision-manifest.json"],
  ];
  for (const [key, expectedPath] of authorityPairs) {
    const authority = reviewBundle.authorities?.[key] ?? {};
    check(normalize(authority.path) === expectedPath, `review-bundle authority path mismatch: ${key}`);
    if (await exists(expectedPath)) check(String(authority.sha256 ?? "").toLowerCase() === (await sha256File(packageAbsolute(expectedPath))), `review-bundle authority hash mismatch: ${key}`);
  }
  const originalAuthority = new Map((reviewOriginals?.records ?? []).map((record) => [normalize(record.path), record]));
  const observed = new Set();
  for (const record of reviewBundle.records ?? []) {
    const verified = await verifyRecord(record, "review-bundle-manifest.json");
    if (!verified) continue;
    observed.add(verified.relative);
    const isSilhouette = verified.relative === "review/aperture-station-silhouette-options.png";
    const authority = isSilhouette ? silhouette?.sheet : originalAuthority.get(verified.relative);
    check(Boolean(authority), `review-bundle output lacks its upstream authority: ${record.path}`);
    if (authority) checkRecordMatches(record, authority, "review-bundle lineage");
    const expectedSource = isSilhouette ? "manifests/silhouette-decision-manifest.json" : "manifests/review-originals-manifest.json";
    check(normalize(record.sourceManifest) === expectedSource, `review-bundle record names the wrong source manifest: ${record.path}`);
  }
  check(observed.size === reviewPngNames.size, `review bundle has ${observed.size}/${reviewPngNames.size} exact outputs`);
  for (const name of reviewPngNames) check(observed.has(`review/${name}`), `review bundle omits review/${name}`);
}

const sanitization = await readJson("manifests/png-metadata-sanitization.json");
if (sanitization) {
  check(sanitization.schema === "quantum-hub.phase-0-3d-repair-v3.png-metadata-sanitization.v1", "unexpected Phase 0.3 PNG sanitation schema");
  check(sanitization.pixel_preservation_required === true && sanitization.all_pixels_preserved === true, "PNG sanitation did not preserve every pixel");
  check(Array.isArray(sanitization.private_marker_hits) && sanitization.private_marker_hits.length === 0, "PNG sanitation reports a private marker");
  check(normalize(sanitization.sanitizer?.path) === "source/sanitize_png_metadata.py", "PNG sanitation points to the wrong sanitizer");
  if (await exists("source/sanitize_png_metadata.py")) check(String(sanitization.sanitizer?.sha256 ?? "").toLowerCase() === (await sha256File(packageAbsolute("source/sanitize_png_metadata.py"))), "PNG sanitizer source hash is stale");
  const sanitizedPaths = new Set();
  for (const record of sanitization.records ?? []) {
    const relative = normalize(record.path);
    sanitizedPaths.add(relative);
    check(record.pixels_preserved === true, `PNG sanitizer did not preserve pixels: ${relative}`);
    check(Array.isArray(record.private_marker_hits) && record.private_marker_hits.length === 0, `PNG sanitizer reports a private marker: ${relative}`);
    if (await exists(relative)) {
      const buffer = await readFile(packageAbsolute(relative));
      const metadata = await stat(packageAbsolute(relative));
      const dimensions = pngDimensions(buffer, relative);
      check(String(record.after_sha256 ?? "").toLowerCase() === sha256Buffer(buffer), `PNG sanitizer after-hash is stale: ${relative}`);
      check(Number(record.after_bytes) === metadata.size, `PNG sanitizer after-byte count is stale: ${relative}`);
      if (dimensions) check(Number(record.width) === dimensions.width && Number(record.height) === dimensions.height, `PNG sanitizer dimensions are stale: ${relative}`);
    } else {
      errors.push(`PNG sanitation record points to a missing file: ${relative}`);
    }
  }
  const packagePngs = new Set(files.filter((file) => path.extname(file.relative).toLowerCase() === ".png").map((file) => file.relative));
  check(sanitizedPaths.size === packagePngs.size, `PNG sanitation covers ${sanitizedPaths.size}/${packagePngs.size} package PNGs`);
  for (const relative of packagePngs) check(sanitizedPaths.has(relative), `PNG sanitation manifest omits ${relative}`);
  for (const relative of sanitizedPaths) check(packagePngs.has(relative), `PNG sanitation manifest has an unexpected record: ${relative}`);
}

const inventory = await readJson("manifests/package-inventory.json");
if (inventory) {
  check(inventory.schema === "quantum-hub.phase-0-3d-repair-v3.package-inventory.v1", "unexpected Phase 0.3 package-inventory schema");
  check(inventory.scope === packageRelative, "package inventory has the wrong scope");
  check(Array.isArray(inventory.exclusions) && inventory.exclusions.length === 1 && inventory.exclusions[0] === "manifests/package-inventory.json", "package inventory must exclude only its self-hashed manifest");
  check(inventory.intended_commit_only === true, "package inventory does not attest intended-commit scope");
  const actualPaths = new Set(files.map((file) => file.relative).filter((relative) => relative !== "manifests/package-inventory.json"));
  const inventoryPaths = new Set();
  let inventoryBytes = 0;
  for (const record of inventory.records ?? []) {
    const relative = normalize(record.package_relative_path ?? record.path);
    const repositoryPath = normalize(record.repository_relative_path);
    inventoryPaths.add(relative);
    check(repositoryPath === `${packageRelative}/${relative}`, `package inventory repository path mismatch: ${relative}`);
    check(record.intendedCommit === true, `package inventory record is not intended for commit: ${relative}`);
    check(typeof record.classification === "string" && record.classification.length > 0, `package inventory record lacks classification: ${relative}`);
    check(typeof record.approval_state === "string" && record.approval_state.length > 0, `package inventory record lacks approval state: ${relative}`);
    const verified = await verifyRecord(
      {
        path: relative,
        bytes: record.bytes,
        sha256: record.sha256,
        width: record.width,
        height: record.height,
      },
      "package-inventory.json",
    );
    if (verified) inventoryBytes += verified.bytes;
  }
  check(inventoryPaths.size === actualPaths.size, `package inventory covers ${inventoryPaths.size}/${actualPaths.size} self-excluded files`);
  for (const relative of actualPaths) check(inventoryPaths.has(relative), `package inventory omits ${relative}`);
  for (const relative of inventoryPaths) check(actualPaths.has(relative), `package inventory has a non-package record: ${relative}`);
  check(Number(inventory.file_count) === actualPaths.size, "package inventory file count is stale");
  check(Number(inventory.total_bytes) === inventoryBytes, "package inventory total byte count is stale");
}

if (errors.length) {
  console.error(`Phase 0.3 creative-package verification failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Verified Phase 0.3 creative package: ${reviewPngNames.size} exact review PNGs, ${files.length} package files / ${packageBytes} bytes, largest ${largestFile.relative} / ${largestFile.bytes} bytes; editable Blender sources, manifest lineage, no LFS/video/frame sequence/private path/prohibited taxonomy, protected baselines unchanged.`,
  );
}
