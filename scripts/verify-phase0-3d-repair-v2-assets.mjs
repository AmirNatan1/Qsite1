import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const packageRelative = "artifacts/original/phase-0-3d-repair-v2";
const packageRoot = path.join(repositoryRoot, ...packageRelative.split("/"));
const maximumFileBytes = 100 * 1024 * 1024;
const errors = [];

const reviewPngNames = new Set([
  "field-unit-v2-silhouette-options.png",
  "field-unit-v2-recommended-design-sheet.png",
  "field-unit-v2-material-and-cable-sheet.png",
  "proving-ground-v2-style-frame.png",
  "camera-path-v2-study.png",
  "activation-v2-contact-sheet.png",
  "portal-v2-layout-sheet.png",
  "desktop-hero-composition-v2.png",
  "mobile-hero-composition-v2.png",
  "text-zoom-and-fallback-v2.png",
  "reduced-motion-v2-desktop.png",
  "reduced-motion-v2-mobile.png",
]);

const requiredSourceFiles = [
  "source/field-unit-v2-integrated-aperture-chassis.blend",
  "source/scene_config.py",
  "source/build_blockouts.py",
  "source/render_blockouts.py",
  "source/compose_blockout_comparison.py",
  "source/build_final_scene.py",
  "source/render_final_stills.py",
  "source/compose_portal_surfaces.py",
  "source/compose_final_review.py",
  "source/validate_final_scene.py",
  "source/sanitize_png_metadata.py",
];

const requiredManifests = [
  "manifests/blockout-render-manifest.json",
  "manifests/silhouette-decision-manifest.json",
  "manifests/final-render-manifest-all.json",
  "manifests/final-render-manifest-diagnostic.json",
  "manifests/portal-surface-manifest.json",
  "manifests/review-composition-manifest.json",
  "manifests/review-originals-manifest.json",
  "manifests/browser-review-composition-manifest.json",
  "manifests/blender-source-validation.json",
  "manifests/png-metadata-sanitization.json",
  "manifests/review-bundle-manifest.json",
];

const videoExtensions = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"]);
const fontExtensions = new Set([".eot", ".otf", ".ttf", ".woff", ".woff2"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".py", ".svg", ".txt"]);

function check(condition, message) {
  if (!condition) errors.push(message);
}

function normalize(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function absolute(relative) {
  return path.join(packageRoot, ...normalize(relative).split("/"));
}

function repositoryAbsolute(relative) {
  return path.join(repositoryRoot, ...normalize(relative).split("/"));
}

async function exists(relative) {
  try {
    return (await stat(absolute(relative))).isFile();
  } catch {
    return false;
  }
}

async function repositoryExists(relative) {
  try {
    return (await stat(repositoryAbsolute(relative))).isFile();
  } catch {
    return false;
  }
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function readJson(relative) {
  try {
    return JSON.parse(await readFile(absolute(relative), "utf8"));
  } catch (error) {
    errors.push(`unable to read ${relative}: ${error.message}`);
    return null;
  }
}

async function readRepositoryJson(relative) {
  try {
    return JSON.parse(await readFile(repositoryAbsolute(relative), "utf8"));
  } catch (error) {
    errors.push(`unable to read ${relative}: ${error.message}`);
    return null;
  }
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
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    errors.push(`unable to inspect ${relative || packageRelative}: ${error.message}`);
    return files;
  }
  for (const entry of entries) {
    const childRelative = normalize(path.posix.join(relative, entry.name));
    const child = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      errors.push(`symbolic link is not permitted in the v2 creative package: ${childRelative}`);
    } else if (entry.isDirectory()) {
      files.push(...(await walk(child, childRelative)));
    } else if (entry.isFile()) {
      files.push({ absolute: child, relative: childRelative });
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
  const representations = [
    buffer.toString("latin1"),
    buffer.toString("utf8"),
    buffer.toString("utf16le"),
    utf16BigEndian(buffer),
  ];
  const patterns = [
    { label: "Windows user-profile path", expression: /[a-z]:[\\/]+(?:users|documents and settings)[\\/]+/i },
    { label: "POSIX user-profile path", expression: /\/(?:users|home)\/[a-z0-9._-]+(?:[\\/]|$)/i },
    { label: "OneDrive private path", expression: /onedrive[\\/]+/i },
    { label: "private Codex path", expression: /(?:^|[\\/])\.codex[\\/]+/i },
  ];
  for (const representation of representations) {
    for (const pattern of patterns) {
      if (pattern.expression.test(representation)) return pattern.label;
    }
  }
  return null;
}

async function verifyRecord(record, label) {
  const relative = normalize(record?.path ?? "");
  check(relative && !relative.includes(".."), `${label} has an invalid path`);
  if (!relative || relative.includes("..") || !(await exists(relative))) {
    errors.push(`${label} file is missing: ${relative || "<empty>"}`);
    return null;
  }
  const file = absolute(relative);
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

function comparableRecord(record) {
  return {
    path: normalize(record?.path ?? ""),
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

for (const relative of [...requiredSourceFiles, ...requiredManifests]) {
  check(await exists(relative), `missing required v2 creative file: ${relative}`);
}

const files = await walk(packageRoot);
const reviewPngObserved = new Set(
  files.filter((file) => /^review\/[^/]+\.png$/i.test(file.relative)).map((file) => path.posix.basename(file.relative)),
);
for (const name of reviewPngNames) check(reviewPngObserved.has(name), `missing exact v2 review PNG: review/${name}`);
for (const name of reviewPngObserved) check(reviewPngNames.has(name), `unexpected PNG in the exact v2 review set: review/${name}`);
check(reviewPngObserved.size === reviewPngNames.size, `v2 review set has ${reviewPngObserved.size}/${reviewPngNames.size} exact PNGs`);

for (const file of files) {
  const metadata = await stat(file.absolute);
  const extension = path.extname(file.relative).toLowerCase();
  check(metadata.size < maximumFileBytes, `v2 package file reaches the 100 MiB repository limit: ${file.relative}`);
  check(!file.relative.split("/").includes("__pycache__"), `Python cache is not permitted: ${file.relative}`);
  check(extension !== ".blend1", `Blender backup is not permitted: ${file.relative}`);
  check(!videoExtensions.has(extension), `video is outside the Phase 0.2 still-only authorization: ${file.relative}`);
  check(!fontExtensions.has(extension), `font binary is not licensed or authorized for the Phase 0.2 package: ${file.relative}`);
  check(!/(?:^|\/)(?:frames?|animatic)(?:\/|$)/i.test(file.relative), `full-frame sequence path is not permitted: ${file.relative}`);
  check(!/(?:^|\/)(?:frame|render)[-_]?\d{3,}\.(?:png|jpe?g)$/i.test(file.relative), `full-frame sequence member is not permitted: ${file.relative}`);
  check(file.relative === "work/.gitignore" || !file.relative.startsWith("work/"), `working render output is not permitted: ${file.relative}`);
  const buffer = await readFile(file.absolute);
  const privateHit = privatePathHit(buffer);
  check(!privateHit, `${privateHit} leaked at byte level: ${file.relative}`);
  if (textExtensions.has(extension)) {
    const source = buffer.toString("utf8");
    check(!/\bdefen[cs]e\b|\bdual[\s_-]?use\b/i.test(source), `prohibited public taxonomy leaked into v2 package text: ${file.relative}`);
  }
  if ([".blend", ".png", ".jpg", ".jpeg"].includes(extension)) {
    check(!/(?:kunal|scraped|stock|reference[-_ ]?(?:screenshot|video|capture))/i.test(path.posix.basename(file.relative)), `third-party/reference binary filename is not permitted: ${file.relative}`);
  }
}

const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
check(JSON.stringify(Object.keys(packageJson.dependencies ?? {}).sort()) === JSON.stringify(["astro"]), "unapproved application runtime dependency is present");

const blendRelative = "source/field-unit-v2-integrated-aperture-chassis.blend";
const blockoutBlendRelative = "source/field-unit-v2-blockouts.blend";
const portalLayoutRelative = "portal-layout.json";
if (await exists(blendRelative)) {
  const blendMetadata = await stat(absolute(blendRelative));
  check(blendMetadata.size > 100_000, "final editable Blender source is implausibly small");
}

const validation = (await exists("manifests/blender-source-validation.json"))
  ? await readJson("manifests/blender-source-validation.json")
  : null;
if (validation) {
  check(validation.schema === "quantum-hub.phase-0-3d-repair-v2.blender-source-validation.v1", "unexpected v2 Blender source-validation schema");
  check(validation.pass === true, "Blender source-validation machine report did not pass");
  check(normalize(validation.source?.path ?? "") === blendRelative, "Blender source-validation report points to the wrong source");
  if (await exists(blendRelative)) {
    const blendMetadata = await stat(absolute(blendRelative));
    check(Number(validation.source?.bytes) === blendMetadata.size, "Blender source-validation byte count is stale");
    check(String(validation.source?.sha256 ?? "").toLowerCase() === (await sha256File(absolute(blendRelative))), "Blender source-validation SHA-256 is stale");
  }
  const validatorPath = normalize(validation.validator?.path ?? "");
  check(validatorPath === "source/validate_final_scene.py", "Blender source-validation report names the wrong validator");
  if (await exists(validatorPath)) {
    check(String(validation.validator?.sha256 ?? "").toLowerCase() === (await sha256File(absolute(validatorPath))), "Blender source-validation validator hash is stale");
  }
}

const blockoutManifest = (await exists("manifests/blockout-render-manifest.json"))
  ? await readJson("manifests/blockout-render-manifest.json")
  : null;
const finalRenderManifest = (await exists("manifests/final-render-manifest-all.json"))
  ? await readJson("manifests/final-render-manifest-all.json")
  : null;
const diagnosticRenderManifest = (await exists("manifests/final-render-manifest-diagnostic.json"))
  ? await readJson("manifests/final-render-manifest-diagnostic.json")
  : null;
const portalManifest = (await exists("manifests/portal-surface-manifest.json"))
  ? await readJson("manifests/portal-surface-manifest.json")
  : null;

const sourceIndex = new Map();
for (const [manifestName, records] of [
  ["blockout-render-manifest.json", blockoutManifest?.renders],
  ["final-render-manifest-all.json", finalRenderManifest?.renders],
  ["final-render-manifest-diagnostic.json", diagnosticRenderManifest?.renders],
  ["portal-surface-manifest.json", portalManifest?.outputs],
]) {
  for (const record of records ?? []) {
    const verified = await verifyRecord(record, manifestName);
    if (verified) sourceIndex.set(verified.relative, { ...verified, manifest: `manifests/${manifestName}` });
  }
}

if (blockoutManifest) {
  check(blockoutManifest.schema === "quantum-hub.phase-0-3d-repair-v2.blockout-renders.v1", "unexpected blockout-render manifest schema");
  check(blockoutManifest.original_artwork === true && blockoutManifest.reference_binary_used === false, "blockout manifest does not attest original-artwork boundaries");
  check(normalize(blockoutManifest.source ?? "") === blockoutBlendRelative, "blockout manifest points to the wrong editable source");
  if (await exists(blockoutBlendRelative)) {
    check(String(blockoutManifest.source_sha256 ?? "").toLowerCase() === (await sha256File(absolute(blockoutBlendRelative))), "blockout manifest source hash is stale");
  }
}

if (finalRenderManifest) {
  check(finalRenderManifest.schema === "quantum-hub.phase-0-3d-repair-v2.final-still-renders.v1", "unexpected final-render manifest schema");
  check(finalRenderManifest.still_only === true && finalRenderManifest.full_animatic === false, "final-render manifest violates the still-only contract");
  check(finalRenderManifest.reference_binary_used === false && finalRenderManifest.original_artwork === true, "final-render manifest does not attest original artwork boundaries");
  check(normalize(finalRenderManifest.source ?? "") === blendRelative, "final-render manifest points to the wrong Blender source");
  if (await exists(blendRelative)) {
    check(String(finalRenderManifest.source_sha256 ?? "").toLowerCase() === (await sha256File(absolute(blendRelative))), "final-render manifest source hash is stale");
  }
  if (await exists(portalLayoutRelative)) {
    check(String(finalRenderManifest.portal_layout_sha256 ?? "").toLowerCase() === (await sha256File(absolute(portalLayoutRelative))), "final-render manifest portal-layout hash is stale");
  }
}

if (diagnosticRenderManifest) {
  check(diagnosticRenderManifest.schema === "quantum-hub.phase-0-3d-repair-v2.final-still-renders.v1", "unexpected diagnostic-render manifest schema");
  check(diagnosticRenderManifest.still_only === true && diagnosticRenderManifest.full_animatic === false, "diagnostic-render manifest violates the still-only contract");
  check(normalize(diagnosticRenderManifest.source ?? "") === blendRelative, "diagnostic-render manifest points to the wrong Blender source");
  if (await exists(blendRelative)) {
    check(String(diagnosticRenderManifest.source_sha256 ?? "").toLowerCase() === (await sha256File(absolute(blendRelative))), "diagnostic-render manifest source hash is stale");
  }
}

if (portalManifest) {
  check(portalManifest.schema === "quantum-hub.phase-0-3d-repair-v2.portal-surface-render.v1", "unexpected portal-surface manifest schema");
  check(normalize(portalManifest.layout ?? "") === portalLayoutRelative, "portal-surface manifest points to the wrong layout contract");
  if (await exists(portalLayoutRelative)) {
    check(String(portalManifest.layout_sha256 ?? "").toLowerCase() === (await sha256File(absolute(portalLayoutRelative))), "portal-surface manifest layout hash is stale");
  }
  check(Number(portalManifest.maximum_anchor_delta_px) <= Number(portalManifest.accepted_anchor_tolerance_px), "portal-surface anchor report exceeds its accepted tolerance");
}

const silhouette = (await exists("manifests/silhouette-decision-manifest.json"))
  ? await readJson("manifests/silhouette-decision-manifest.json")
  : null;
if (silhouette) {
  check(silhouette.schema === "quantum-hub.phase-0-3d-repair-v2.silhouette-decision.v1", "unexpected silhouette-decision schema");
  await verifyRecord(
    {
      path: silhouette.output,
      bytes: silhouette.output_bytes,
      sha256: silhouette.output_sha256,
      width: silhouette.width,
      height: silhouette.height,
    },
    "silhouette-decision-manifest.json",
  );
  for (const source of silhouette.source_renders ?? []) {
    const relative = normalize(source.source ?? "");
    const authority = sourceIndex.get(relative);
    check(Boolean(authority), `silhouette source is not governed by a canonical render manifest: ${relative}`);
    if (authority) check(String(source.sha256 ?? "").toLowerCase() === authority.sha256, `silhouette source hash is stale: ${relative}`);
  }
}

const browserMatrixRelative = "artifacts/evidence/phase-0-3d-repair-v2/browser-matrix-report.json";
const browserMatrix = (await repositoryExists(browserMatrixRelative)) ? await readRepositoryJson(browserMatrixRelative) : null;
const browserCaptureById = new Map();
if (browserMatrix) {
  check(browserMatrix.schema === "quantum-hub.phase-0-3d-repair-v2.typography-collision-matrix.v1", "unexpected browser matrix schema for review composition lineage");
  for (const record of browserMatrix.cases ?? []) {
    if (!record.capture?.path) continue;
    browserCaptureById.set(record.id, {
      path: normalize(record.capture.path),
      sha256: String(record.capture.sha256 ?? "").toLowerCase(),
      bytes: Number(record.capture.bytes),
      width: Number(record.capture.width),
      height: Number(record.capture.height),
    });
  }
} else {
  errors.push(`missing browser matrix required for review composition lineage: ${browserMatrixRelative}`);
}

const browserReview = (await exists("manifests/browser-review-composition-manifest.json"))
  ? await readJson("manifests/browser-review-composition-manifest.json")
  : null;
if (browserReview) {
  check(browserReview.schema === "quantum-hub.phase-0-3d-repair-v2.browser-review-composition.v1", "unexpected browser-review composition schema");
  const expectedBrowserOutputs = new Set([
    "review/desktop-hero-composition-v2.png",
    "review/mobile-hero-composition-v2.png",
    "review/text-zoom-and-fallback-v2.png",
  ]);
  const observedBrowserOutputs = new Set();
  for (const record of browserReview.records ?? []) {
    const verified = await verifyRecord(record, "browser-review-composition-manifest.json");
    if (!verified) continue;
    observedBrowserOutputs.add(verified.relative);
    check(Array.isArray(record.sources) && record.sources.length > 0, `browser review output lacks capture sources: ${record.path}`);
    for (const source of record.sources ?? []) {
      const relative = normalize(source.path ?? "");
      const authority = browserCaptureById.get(source.captureId);
      check(Boolean(authority), `browser review source capture ID is absent from the matrix: ${source.captureId}`);
      if (!authority) continue;
      check(relative === authority.path, `browser review source path disagrees with its matrix capture: ${source.captureId}`);
      check(String(source.sha256 ?? "").toLowerCase() === authority.sha256, `browser review source hash disagrees with its matrix capture: ${source.captureId}`);
      check(Number(source.width) === authority.width && Number(source.height) === authority.height, `browser review source dimensions disagree with its matrix capture: ${source.captureId}`);
      if (await repositoryExists(relative)) {
        const buffer = await readFile(repositoryAbsolute(relative));
        const metadata = await stat(repositoryAbsolute(relative));
        const dimensions = pngDimensions(buffer, relative);
        check(sha256Buffer(buffer) === authority.sha256, `browser review source file hash is stale: ${relative}`);
        check(metadata.size === authority.bytes, `browser review source file byte count is stale: ${relative}`);
        if (dimensions) {
          check(dimensions.width === authority.width && dimensions.height === authority.height, `browser review source file dimensions are stale: ${relative}`);
        }
      } else {
        errors.push(`browser review source file is missing: ${relative}`);
      }
    }
  }
  check(observedBrowserOutputs.size === expectedBrowserOutputs.size, `browser-review composition manifest has ${observedBrowserOutputs.size}/${expectedBrowserOutputs.size} exact outputs`);
  for (const relative of expectedBrowserOutputs) check(observedBrowserOutputs.has(relative), `browser-review composition manifest omits ${relative}`);
  for (const relative of observedBrowserOutputs) check(expectedBrowserOutputs.has(relative), `browser-review composition manifest has an unexpected output: ${relative}`);
}

const reviewComposition = (await exists("manifests/review-composition-manifest.json"))
  ? await readJson("manifests/review-composition-manifest.json")
  : null;
if (reviewComposition) {
  check(reviewComposition.schema === "quantum-hub.phase-0-3d-repair-v2.review-composition.v1", "unexpected static review-composition schema");
  check(reviewComposition.creative_boundary?.reference_binary_used === false && reviewComposition.creative_boundary?.external_asset_used === false, "static review composition violates original-asset boundaries");
  check(reviewComposition.render_contract?.still_only === true && reviewComposition.render_contract?.new_animatic_or_video === false, "static review composition violates the still-only boundary");
  const expectedStaticOutputs = new Set(
    [...reviewPngNames]
      .filter(
        (name) =>
          name !== "field-unit-v2-silhouette-options.png" &&
          !["desktop-hero-composition-v2.png", "mobile-hero-composition-v2.png", "text-zoom-and-fallback-v2.png"].includes(name),
      )
      .map((name) => `review/${name}`),
  );
  const observedStaticOutputs = new Set();
  for (const record of reviewComposition.records ?? []) {
    const verified = await verifyRecord(record, "review-composition-manifest.json");
    if (!verified) continue;
    observedStaticOutputs.add(verified.relative);
    check(Array.isArray(record.source_paths) && record.source_paths.length > 0, `static review composition lacks source lineage: ${record.path}`);
    for (const sourcePath of record.source_paths ?? []) {
      const relative = normalize(sourcePath);
      check(sourceIndex.has(relative) || relative === portalLayoutRelative, `static review composition source lacks canonical authority: ${record.path} <- ${relative}`);
    }
  }
  check(observedStaticOutputs.size === expectedStaticOutputs.size, `static review-composition manifest has ${observedStaticOutputs.size}/${expectedStaticOutputs.size} exact outputs`);
  for (const relative of expectedStaticOutputs) check(observedStaticOutputs.has(relative), `static review-composition manifest omits ${relative}`);
  for (const relative of observedStaticOutputs) check(expectedStaticOutputs.has(relative), `static review-composition manifest has an unexpected output: ${relative}`);
}

const reviewOriginals = (await exists("manifests/review-originals-manifest.json"))
  ? await readJson("manifests/review-originals-manifest.json")
  : null;
if (reviewOriginals) {
  check(reviewOriginals.schema === "quantum-hub.phase-0-3d-repair-v2.review-originals.v1", "unexpected review-originals schema");
  check(reviewOriginals.creative_boundary?.reference_binary_used === false, "review originals used a reference binary");
  check(reviewOriginals.creative_boundary?.external_asset_used === false, "review originals used an external asset");
  check(reviewOriginals.creative_boundary?.font_binary_bundled === false, "review originals bundled a font binary");
  check(reviewOriginals.render_contract?.still_only === true && reviewOriginals.render_contract?.new_animatic_or_video === false, "review originals violate the still-only contract");
  check(normalize(reviewOriginals.final_blend?.path ?? "") === blendRelative, "review-originals manifest points to the wrong Blender source");
  if (await exists(blendRelative)) {
    const blendMetadata = await stat(absolute(blendRelative));
    check(Number(reviewOriginals.final_blend?.bytes) === blendMetadata.size, "review-originals Blender byte count is stale");
    check(String(reviewOriginals.final_blend?.sha256 ?? "").toLowerCase() === (await sha256File(absolute(blendRelative))), "review-originals Blender SHA-256 is stale");
  }
  if (await exists(portalLayoutRelative)) {
    check(normalize(reviewOriginals.portal_layout?.path ?? "") === portalLayoutRelative, "review-originals manifest points to the wrong portal layout");
    check(String(reviewOriginals.portal_layout?.sha256 ?? "").toLowerCase() === (await sha256File(absolute(portalLayoutRelative))), "review-originals portal-layout SHA-256 is stale");
  }
  const recordPaths = new Set();
  const compositionAuthority = new Map(
    [...(reviewComposition?.records ?? []), ...(browserReview?.records ?? [])].map((record) => [normalize(record.path ?? ""), record]),
  );
  for (const record of reviewOriginals.records ?? []) {
    const verified = await verifyRecord(record, "review-originals-manifest.json");
    if (!verified) continue;
    recordPaths.add(verified.relative);
    const outputAuthority = compositionAuthority.get(verified.relative);
    check(Boolean(outputAuthority), `review original lacks an upstream composition authority: ${record.path}`);
    if (outputAuthority) checkRecordMatches(record, outputAuthority, "review-originals composition lineage");
    const sources = record.source_paths ?? (record.sources ?? []).map((source) => source.path);
    check(Array.isArray(sources) && sources.length > 0, `review original lacks source lineage: ${record.path}`);
    for (const sourcePath of sources ?? []) {
      const relative = normalize(sourcePath);
      const packageAuthority = sourceIndex.has(relative) || relative === portalLayoutRelative;
      const browserAuthority = [...browserCaptureById.values()].some((capture) => capture.path === relative);
      check(packageAuthority || browserAuthority, `review original source is not governed by a canonical or browser manifest: ${record.path} <- ${relative}`);
    }
  }
  const expectedOriginalPaths = new Set([...reviewPngNames].filter((name) => name !== "field-unit-v2-silhouette-options.png").map((name) => `review/${name}`));
  check(recordPaths.size === expectedOriginalPaths.size, `review-originals manifest has ${recordPaths.size}/${expectedOriginalPaths.size} compositor PNGs`);
  for (const relative of expectedOriginalPaths) check(recordPaths.has(relative), `review-originals manifest omits ${relative}`);
  for (const relative of recordPaths) check(expectedOriginalPaths.has(relative), `review-originals manifest has an unexpected record: ${relative}`);
}

const reviewBundle = (await exists("manifests/review-bundle-manifest.json"))
  ? await readJson("manifests/review-bundle-manifest.json")
  : null;
if (reviewBundle) {
  check(reviewBundle.schema === "quantum-hub.phase-0-3d-repair-v2.review-bundle.v1", "unexpected v2 review-bundle schema");
  const authorities = reviewBundle.authorities ?? {};
  for (const [key, expectedPath] of [
    ["reviewOriginals", "manifests/review-originals-manifest.json"],
    ["silhouetteDecision", "manifests/silhouette-decision-manifest.json"],
  ]) {
    const authority = authorities[key] ?? {};
    check(normalize(authority.path ?? "") === expectedPath, `review-bundle authority path mismatch: ${key}`);
    if (await exists(expectedPath)) {
      check(String(authority.sha256 ?? "").toLowerCase() === (await sha256File(absolute(expectedPath))), `review-bundle authority hash mismatch: ${key}`);
    }
  }
  const reviewOriginalAuthority = new Map(
    (reviewOriginals?.records ?? []).map((record) => [normalize(record.path ?? ""), record]),
  );
  const silhouetteAuthority = silhouette
    ? {
        path: silhouette.output,
        width: silhouette.width,
        height: silhouette.height,
        bytes: silhouette.output_bytes,
        sha256: silhouette.output_sha256,
      }
    : null;
  const bundlePaths = new Set();
  for (const record of reviewBundle.records ?? []) {
    const verified = await verifyRecord(record, "review-bundle-manifest.json");
    if (!verified) continue;
    bundlePaths.add(verified.relative);
    const sourceManifest = normalize(record.sourceManifest ?? record.source_manifest ?? "");
    const isSilhouette = verified.relative === "review/field-unit-v2-silhouette-options.png";
    const expectedSourceManifest = isSilhouette
      ? "manifests/silhouette-decision-manifest.json"
      : "manifests/review-originals-manifest.json";
    check(sourceManifest === expectedSourceManifest, `review-bundle record names the wrong source manifest: ${record.path}`);
    const outputAuthority = isSilhouette ? silhouetteAuthority : reviewOriginalAuthority.get(verified.relative);
    check(Boolean(outputAuthority), `review-bundle record lacks an upstream output authority: ${record.path}`);
    if (outputAuthority) checkRecordMatches(record, outputAuthority, "review-bundle output lineage");
  }
  check(bundlePaths.size === reviewPngNames.size, `review-bundle manifest has ${bundlePaths.size}/${reviewPngNames.size} exact PNGs`);
  for (const name of reviewPngNames) check(bundlePaths.has(`review/${name}`), `review-bundle manifest omits review/${name}`);
  for (const relative of bundlePaths) check(reviewPngNames.has(path.posix.basename(relative)), `review-bundle manifest has an unexpected record: ${relative}`);
}

const sanitization = (await exists("manifests/png-metadata-sanitization.json"))
  ? await readJson("manifests/png-metadata-sanitization.json")
  : null;
if (sanitization) {
  check(sanitization.schema === "quantum-hub.phase-0-3d-repair-v2.png-metadata-sanitization.v1", "unexpected PNG metadata-sanitization schema");
  check(sanitization.pixel_preservation_required === true && sanitization.all_pixels_preserved === true, "PNG metadata sanitation did not preserve every pixel");
  check(Array.isArray(sanitization.private_marker_hits) && sanitization.private_marker_hits.length === 0, "PNG metadata sanitation reports a private marker");
  check(normalize(sanitization.sanitizer?.path ?? "") === "source/sanitize_png_metadata.py", "PNG metadata-sanitization manifest points to the wrong sanitizer");
  if (await exists("source/sanitize_png_metadata.py")) {
    check(String(sanitization.sanitizer?.sha256 ?? "").toLowerCase() === (await sha256File(absolute("source/sanitize_png_metadata.py"))), "PNG sanitizer source hash is stale");
  }
  const sanitizedPaths = new Set();
  for (const record of sanitization.records ?? []) {
    const relative = normalize(record.path ?? "");
    sanitizedPaths.add(relative);
    check(record.pixels_preserved === true, `PNG sanitizer did not preserve pixels: ${relative}`);
    check(Array.isArray(record.private_marker_hits) && record.private_marker_hits.length === 0, `PNG sanitizer reports a private marker: ${relative}`);
    if (await exists(relative)) {
      const buffer = await readFile(absolute(relative));
      const metadata = await stat(absolute(relative));
      const dimensions = pngDimensions(buffer, relative);
      check(String(record.after_sha256 ?? "").toLowerCase() === sha256Buffer(buffer), `PNG sanitizer after-hash is stale: ${relative}`);
      check(Number(record.after_bytes) === metadata.size, `PNG sanitizer after-byte count is stale: ${relative}`);
      if (dimensions) {
        check(Number(record.width) === dimensions.width, `PNG sanitizer width is stale: ${relative}`);
        check(Number(record.height) === dimensions.height, `PNG sanitizer height is stale: ${relative}`);
      }
    } else {
      errors.push(`PNG sanitation record points to a missing file: ${relative}`);
    }
  }
  const packagePngs = new Set(files.filter((file) => path.extname(file.relative).toLowerCase() === ".png").map((file) => file.relative));
  check(sanitizedPaths.size === packagePngs.size, `PNG sanitation manifest covers ${sanitizedPaths.size}/${packagePngs.size} package PNGs`);
  for (const relative of packagePngs) check(sanitizedPaths.has(relative), `PNG sanitation manifest omits ${relative}`);
  for (const relative of sanitizedPaths) check(packagePngs.has(relative), `PNG sanitation manifest has an unexpected record: ${relative}`);
}

if (errors.length) {
  console.error(`Phase 0.2 v2 creative-package verification failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Verified Phase 0.2 v2 creative package: ${reviewPngNames.size} exact review PNGs, editable Blender source/report, canonical manifest lineage, still-only boundary, byte-level privacy and <100 MiB files.`,
  );
}
