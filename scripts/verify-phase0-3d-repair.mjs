import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const packageRelative = "artifacts/original/phase-0-3d-repair";
const packageRoot = path.join(projectRoot, ...packageRelative.split("/"));
const fiftyMiB = 50 * 1024 * 1024;
const errors = [];
const notes = [];

const normalize = (value) => String(value).replaceAll("\\", "/").replace(/^\.\//, "");
const packagePath = (relative) => path.join(packageRoot, ...normalize(relative).split("/"));
const projectPath = (relative) => path.join(projectRoot, ...normalize(relative).split("/"));

function check(condition, message) {
  if (!condition) errors.push(message);
}

async function exists(relative, root = packageRoot) {
  try {
    return (await stat(path.join(root, ...normalize(relative).split("/")))).isFile();
  } catch {
    return false;
  }
}

async function fileMetadata(relative, root = packageRoot) {
  const absolute = path.join(root, ...normalize(relative).split("/"));
  try {
    const metadata = await lstat(absolute);
    check(metadata.isFile(), `${normalize(relative)} must be a regular file`);
    check(!metadata.isSymbolicLink(), `${normalize(relative)} must not be a symbolic link`);
    return metadata;
  } catch {
    errors.push(`missing required file: ${normalize(relative)}`);
    return null;
  }
}

async function sha256(absolute) {
  return createHash("sha256").update(await readFile(absolute)).digest("hex");
}

async function readJson(relative) {
  const absolute = packagePath(relative);
  try {
    return JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    errors.push(`${relative} is missing or invalid JSON: ${error.message}`);
    return null;
  }
}

async function walk(directory, excludedNames = new Set()) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (excludedNames.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute, excludedNames)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function safePackageRelative(value, label) {
  const normalized = normalize(value);
  const unsafe =
    path.isAbsolute(value) ||
    /^[a-z]:\//i.test(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../");
  check(!unsafe, `${label} contains an unsafe path: ${value}`);
  return unsafe ? null : normalized;
}

function pngDimensions(buffer, label) {
  const signature = "89504e470d0a1a0a";
  check(buffer.length >= 24, `${label} is too small to be a PNG`);
  if (buffer.length < 24) return null;
  check(buffer.subarray(0, 8).toString("hex") === signature, `${label} has an invalid PNG signature`);
  if (buffer.subarray(0, 8).toString("hex") !== signature) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function collectObjects(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (!Array.isArray(value)) output.push(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    collectObjects(child, output);
  }
  return output;
}

function recordForPath(document, relative) {
  const wanted = normalize(relative);
  const wantedName = path.posix.basename(wanted);
  return collectObjects(document).find((record) =>
    Object.entries(record).some(([key, value]) => {
      if (typeof value !== "string") return false;
      const normalizedValue = normalize(value);
      if (/(?:^|_)(?:path|file|output|source)$/i.test(key)) return normalizedValue === wanted;
      return /(?:^|_)filename$/i.test(key) && path.posix.basename(normalizedValue) === wantedName;
    }),
  );
}

function numericField(record, pattern) {
  for (const [key, value] of Object.entries(record ?? {})) {
    if (!pattern.test(key)) continue;
    if (Number.isFinite(Number(value))) return Number(value);
    if (typeof value === "string" && /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(value)) {
      const [numerator, denominator] = value.split("/").map(Number);
      if (denominator !== 0) return numerator / denominator;
    }
  }
  return null;
}

function hasNumericField(value, pattern) {
  return collectObjects(value).some((record) => numericField(record, pattern) !== null);
}

function deepNumericField(value, pattern) {
  for (const record of collectObjects(value)) {
    const found = numericField(record, pattern);
    if (found !== null) return found;
  }
  return null;
}

async function validateRecordedFile(record, relative, manifestLabel, expectedDimensions = null) {
  if (!record) {
    errors.push(`${manifestLabel} has no record for ${relative}`);
    return;
  }
  const safe = safePackageRelative(relative, manifestLabel);
  if (!safe) return;
  const metadata = await fileMetadata(safe);
  if (!metadata) return;
  const actualHash = await sha256(packagePath(safe));
  check(/^[a-f0-9]{64}$/i.test(record.sha256 ?? ""), `${manifestLabel} lacks a valid SHA-256 for ${safe}`);
  check(String(record.sha256 ?? "").toLowerCase() === actualHash, `${manifestLabel} SHA-256 mismatch for ${safe}`);
  check(Number(record.bytes) === metadata.size, `${manifestLabel} byte count mismatch for ${safe}`);

  if (safe.toLowerCase().endsWith(".png")) {
    const dimensions = pngDimensions(await readFile(packagePath(safe)), safe);
    if (!dimensions) return;
    const hasWidth = Number.isFinite(Number(record.width));
    const hasHeight = Number.isFinite(Number(record.height));
    check(hasWidth, `${manifestLabel} lacks width metadata for ${safe}`);
    check(hasHeight, `${manifestLabel} lacks height metadata for ${safe}`);
    if (hasWidth) {
      check(Number(record.width) === dimensions.width, `${manifestLabel} width mismatch for ${safe}`);
    }
    if (hasHeight) {
      check(Number(record.height) === dimensions.height, `${manifestLabel} height mismatch for ${safe}`);
    }
    if (expectedDimensions) {
      check(dimensions.width === expectedDimensions[0], `${safe} must be ${expectedDimensions[0]}px wide`);
      check(dimensions.height === expectedDimensions[1], `${safe} must be ${expectedDimensions[1]}px high`);
    }
  }
}

const requiredSource = [
  "README.md",
  "source/scene_config.py",
  "source/build_scene.py",
  "source/render_deliverables.py",
  "source/validate_scene.py",
  "source/quantum-field-unit.blend",
  "work/.gitignore",
];

const requiredReports = [
  "manifests/blender-source-validation.json",
  "manifests/render-manifest-all.json",
  "manifests/encode-manifest.json",
  "manifests/ffprobe-manifest.json",
  "manifests/browser-seek-report.json",
  "manifests/portal-alignment-report.json",
  "manifests/review-bundle-manifest.json",
];

const reviewImages = new Map([
  ["review/phase-0-3d-creative-review-contact-sheet.png", { minLongEdge: 2048 }],
  ["review/field-unit-design-sheet.png", { minLongEdge: 2048 }],
  ["review/field-unit-material-sheet.png", { minLongEdge: 1600 }],
  ["review/dormant-master.png", { exact: [1920, 1200] }],
  ["review/conduction-master-contact-sheet.png", { minLongEdge: 1600 }],
  ["review/activation-contact-sheet.png", { minLongEdge: 1600 }],
  ["review/portal-contact-sheet.png", { minLongEdge: 1600 }],
  ["review/mobile-contact-sheet.png", { minLongEdge: 1000 }],
  ["review/reduced-motion-desktop.png", { exact: [1600, 1000] }],
  ["review/reduced-motion-mobile.png", { exact: [720, 1600] }],
  ["review/portal-dom-overlay.png", { minLongEdge: 1600 }],
]);

const requiredReviewOther = [
  "review/dom-match-metrics.json",
  "review/field-unit-animatic.webm",
  "review/README.md",
];
const expectedReviewFiles = [...reviewImages.keys(), ...requiredReviewOther];

const mediaFiles = [
  "media/field-unit-animatic-vp9-g1.webm",
  "media/field-unit-animatic-vp9-g6.webm",
  "media/field-unit-animatic-vp9-g12.webm",
  "media/field-unit-animatic-h264-g1.mp4",
  "media/field-unit-animatic-h264-g6.mp4",
  "media/field-unit-animatic-h264-g12.mp4",
];

const renderDimensions = new Map();
for (const name of [
  "field-unit-front",
  "field-unit-rear",
  "field-unit-left",
  "field-unit-right",
  "field-unit-three-quarter-front",
  "field-unit-three-quarter-rear",
]) {
  renderDimensions.set(`renders/design/${name}.png`, [2048, 1536]);
}
for (const name of [
  "material-coated-metal",
  "material-smoked-glass",
  "material-cable",
  "material-connector",
  "material-base-contact",
  "material-precision-detail",
]) {
  renderDimensions.set(`renders/materials/${name}.png`, [1600, 1200]);
}
renderDimensions.set("renders/desktop/dormant-master.png", [1920, 1200]);
for (const progress of [10, 25, 40, 55, 70, 78]) {
  renderDimensions.set(`renders/conduction/conduction-${progress}.png`, [1920, 1200]);
}
for (const name of [
  "activation-01-connector-arrival",
  "activation-02-internal-response",
  "activation-03-mechanical-wake",
  "activation-04-interface-visible",
  "activation-05-portal-ready",
]) {
  renderDimensions.set(`renders/activation/${name}.png`, [1920, 1200]);
}
for (const name of ["portal-00", "portal-25", "portal-50", "portal-75", "portal-100", "first-dom-reference"]) {
  renderDimensions.set(`renders/portal/${name}.png`, [1920, 1200]);
}
for (const [viewport, dimensions] of [
  ["390x844", [390, 844]],
  ["360x800", [360, 800]],
]) {
  for (const name of ["mobile-dormant", "mobile-mid-conduction", "mobile-activation", "mobile-portal"]) {
    renderDimensions.set(`renders/mobile/${viewport}/${name}.png`, dimensions);
  }
}
renderDimensions.set("renders/reduced/reduced-motion-desktop.png", [1600, 1000]);
renderDimensions.set("renders/reduced/reduced-motion-mobile.png", [720, 1600]);

for (const required of [...requiredSource, ...requiredReports, ...expectedReviewFiles, ...mediaFiles]) {
  await fileMetadata(required);
}

const blendRelative = "source/quantum-field-unit.blend";
const blendAbsolute = packagePath(blendRelative);
let blendHash = null;
let blendBytes = null;
if (await exists(blendRelative)) {
  const blendBuffer = await readFile(blendAbsolute);
  blendHash = createHash("sha256").update(blendBuffer).digest("hex");
  blendBytes = blendBuffer.length;
  const rawBlend = blendBuffer.subarray(0, 7).toString("ascii") === "BLENDER";
  const zstdBlend =
    blendBuffer.subarray(0, 4).toString("hex") === "28b52ffd" &&
    blendBuffer.subarray(0, 64).includes(Buffer.from("BLENDER", "ascii"));
  check(rawBlend || zstdBlend, `${blendRelative} has neither a raw nor Zstandard-compressed Blender signature`);
  check(blendBytes > 64 * 1024, `${blendRelative} is implausibly small`);
}

const sourceValidation = await readJson("manifests/blender-source-validation.json");
if (sourceValidation) {
  check(sourceValidation.schema === "quantum-hub.phase-0-3d-source-validation.v1", "unexpected Blender source-validation schema");
  check(sourceValidation.valid === true, "Blender source validation is not valid");
  check(Array.isArray(sourceValidation.errors) && sourceValidation.errors.length === 0, "Blender source validation contains errors");
  check(Array.isArray(sourceValidation.external_images) && sourceValidation.external_images.length === 0, "Blender source has external images");
  check(Array.isArray(sourceValidation.linked_libraries) && sourceValidation.linked_libraries.length === 0, "Blender source has linked libraries");
  check(normalize(sourceValidation.blend_source) === blendRelative, "Blender validation points to the wrong source file");
  if (blendHash) check(String(sourceValidation.blend_sha256 ?? "").toLowerCase() === blendHash, "Blender validation SHA-256 is stale");
  if (blendBytes !== null) check(Number(sourceValidation.blend_bytes) === blendBytes, "Blender validation byte count is stale");
  check(sourceValidation.blender_version === "5.2.0 LTS", "Blender source was not validated with the authorized 5.2.0 LTS toolchain");
  check(Number(sourceValidation.collection_count) >= 18, "Blender source has fewer than 18 required collections");
  check(Number(sourceValidation.object_count) > 0, "Blender source contains no objects");
  check(Number(sourceValidation.material_count) > 0, "Blender source contains no materials");
  for (const key of ["conduction", "connector_response", "mechanical_wake", "screen_wake", "physical_ui", "portal"]) {
    check(Number.isFinite(Number(sourceValidation.control_properties?.[key])), `Blender validation lacks ${key} control metadata`);
  }
  check(Number(sourceValidation.driver_counts?.conduction_core) >= 1, "Blender conduction core is not parametrically driven");
  check(Number(sourceValidation.driver_counts?.conduction_front) >= 2, "Blender conduction front lacks required drivers");
}

const renderManifest = await readJson("manifests/render-manifest-all.json");
if (renderManifest) {
  check(renderManifest.schema === "quantum-hub.phase-0-3d-render-manifest.v1", "unexpected canonical render-manifest schema");
  check(renderManifest.original_artwork === true, "canonical render manifest does not assert original artwork");
  check(renderManifest.reference_site_binary_used === false, "canonical render manifest indicates reference binary use");
  check(["BLENDER_EEVEE", "CYCLES"].includes(renderManifest.engine), "canonical render manifest uses an unexpected engine");
  check(Number(renderManifest.render_scale) === 1, "canonical final renders must use scale 1.0");
  check(Number(renderManifest.frame_step) === 1, "canonical render manifest has a non-unit frame step");
  check(Number(renderManifest.timeline?.fps) === 24, "canonical render timeline must be 24fps");
  check(Number(renderManifest.timeline?.frame_start) === 1, "canonical render timeline must begin at frame 1");
  check(Number(renderManifest.timeline?.frame_end) === 192, "canonical render timeline must end at frame 192");
  check(normalize(renderManifest.blend_source) === blendRelative, "canonical render manifest points to the wrong Blender source");
  if (blendHash) check(String(renderManifest.blend_source_sha256 ?? "").toLowerCase() === blendHash, "canonical render manifest has a stale Blender SHA-256");
  if (sourceValidation) {
    check(renderManifest.blender_version === sourceValidation.blender_version, "render/source Blender versions disagree");
  }
  const records = Array.isArray(renderManifest.renders) ? renderManifest.renders : [];
  check(records.length >= renderDimensions.size, `canonical render manifest has ${records.length}/${renderDimensions.size} required records`);
  const seen = new Set();
  for (const record of records) {
    const safe = safePackageRelative(record.path ?? "", "canonical render manifest");
    if (!safe) continue;
    check(!seen.has(safe), `canonical render manifest repeats ${safe}`);
    seen.add(safe);
  }
  for (const [relative, dimensions] of renderDimensions) {
    await validateRecordedFile(recordForPath(renderManifest, relative), relative, "canonical render manifest", dimensions);
  }
}

for (const [relative, requirement] of reviewImages) {
  if (!(await exists(relative))) continue;
  const buffer = await readFile(packagePath(relative));
  const dimensions = pngDimensions(buffer, relative);
  if (!dimensions) continue;
  check(buffer.length >= 10 * 1024, `${relative} is implausibly small for review evidence`);
  if (requirement.exact) {
    check(dimensions.width === requirement.exact[0], `${relative} must be ${requirement.exact[0]}px wide`);
    check(dimensions.height === requirement.exact[1], `${relative} must be ${requirement.exact[1]}px high`);
  }
  if (requirement.minLongEdge) {
    check(Math.max(dimensions.width, dimensions.height) >= requirement.minLongEdge, `${relative} must have a ${requirement.minLongEdge}px long edge`);
  }
}

const encodeManifest = await readJson("manifests/encode-manifest.json");
const ffprobeManifest = await readJson("manifests/ffprobe-manifest.json");
const seekReport = await readJson("manifests/browser-seek-report.json");
const alignmentReport = await readJson("manifests/portal-alignment-report.json");
const reviewManifest = await readJson("manifests/review-bundle-manifest.json");

if (encodeManifest) {
  check(encodeManifest.schema === "quantum-hub.phase-0-3d-encode-manifest.v1", "unexpected encode-manifest schema");
  check(/FFmpeg version 9\.0\.1/i.test(encodeManifest.ffmpeg_version ?? ""), "encode manifest does not identify FFmpeg 9.0.1");
}
if (ffprobeManifest) {
  check(ffprobeManifest.schema === "quantum-hub.phase-0-3d-ffprobe-manifest.v1", "unexpected ffprobe-manifest schema");
  check(/ffprobe version 9\.0\.1/i.test(ffprobeManifest.ffprobe_version ?? ""), "ffprobe manifest does not identify ffprobe 9.0.1");
}
if (seekReport) {
  check(seekReport.schema === "quantum-hub.phase-0-3d-browser-seek-report.v1", "unexpected browser-seek-report schema");
  check(seekReport.measurement_state === "completed", "browser seek measurement is not complete");
}
if (alignmentReport) {
  check(alignmentReport.schema === "quantum-hub.phase-0-3d-portal-alignment.v1", "unexpected portal-alignment-report schema");
  check(alignmentReport.human_perception_primary === true, "portal alignment does not preserve human visual review as primary evidence");
  check(Number(alignmentReport.metrics?.width) === 1920, "portal alignment source width must be 1920px");
  check(Number(alignmentReport.metrics?.height) === 1200, "portal alignment source height must be 1200px");
  const ssim = Number(alignmentReport.metrics?.global_ssim_approximation);
  const mae = Number(alignmentReport.metrics?.normalized_grayscale_mae);
  check(Number.isFinite(ssim) && ssim >= 0 && ssim <= 1, "portal alignment SSIM approximation is invalid");
  check(Number.isFinite(mae) && mae >= 0 && mae <= 1, "portal alignment normalized MAE is invalid");
}
if (reviewManifest) {
  check(reviewManifest.schema === "quantum-hub.phase-0-3d-review-bundle.v1", "unexpected review-bundle-manifest schema");
  check(reviewManifest.classification === "original Quantum creative evidence", "review bundle has an unexpected publication classification");
  check(reviewManifest.approval_state === "pending human creative review", "review bundle must remain pending human creative review");
  const artifactPaths = (Array.isArray(reviewManifest.artifacts) ? reviewManifest.artifacts : []).map((record) =>
    normalize(record?.path ?? ""),
  );
  check(artifactPaths.length === expectedReviewFiles.length, `review bundle manifest has ${artifactPaths.length}/${expectedReviewFiles.length} expected records`);
  check(new Set(artifactPaths).size === artifactPaths.length, "review bundle manifest contains duplicate paths");
  for (const relative of artifactPaths) {
    check(expectedReviewFiles.includes(relative), `review bundle manifest contains an unexpected artifact: ${relative}`);
  }
}

for (const relative of mediaFiles) {
  if (!(await exists(relative))) continue;
  const metadata = await stat(packagePath(relative));
  check(metadata.size > 64 * 1024, `${relative} is implausibly small for real-content media`);
  const encodeRecord = recordForPath(encodeManifest, relative);
  await validateRecordedFile(encodeRecord, relative, "encode manifest");
  const probeRecord = recordForPath(ffprobeManifest, relative);
  check(Boolean(probeRecord), `ffprobe manifest has no record for ${relative}`);
  if (probeRecord) {
    const serialized = JSON.stringify(probeRecord);
    check(/vp9|libvpx-vp9/i.test(relative) ? /vp9|libvpx-vp9/i.test(serialized) : /h264|libx264|avc1/i.test(serialized), `ffprobe codec mismatch for ${relative}`);
    const width = deepNumericField(probeRecord, /width/i);
    const height = deepNumericField(probeRecord, /height/i);
    const fps = deepNumericField(probeRecord, /fps|frame_rate/i);
    const duration = deepNumericField(probeRecord, /duration/i);
    check(width !== null, `ffprobe manifest lacks width for ${relative}`);
    check(height !== null, `ffprobe manifest lacks height for ${relative}`);
    check(fps !== null, `ffprobe manifest lacks frame rate for ${relative}`);
    check(duration !== null, `ffprobe manifest lacks duration for ${relative}`);
    if (width !== null) check(width >= 960, `${relative} is below the accepted review width`);
    if (height !== null) check(height >= 540, `${relative} is below the accepted review height`);
    if (fps !== null) check(Math.abs(fps - 24) < 0.05, `${relative} is not 24fps`);
    if (duration !== null) check(duration >= 7 && duration <= 10, `${relative} duration is outside 7-10 seconds`);
    check(!/"codec_type"\s*:\s*"audio"/i.test(serialized), `${relative} unexpectedly contains an audio stream`);
  }
  const expectedGop = Number(relative.match(/-g(1|6|12)\./)?.[1]);
  check(Number.isFinite(expectedGop), `${relative} has no bound GOP interval`);
  if (encodeRecord && Number.isFinite(expectedGop)) {
    const recordedGop = numericField(encodeRecord, /gop|keyframe|keyint|interval/i);
    check(recordedGop === expectedGop, `encode manifest GOP mismatch for ${relative}`);
  }
  const seekRecord = recordForPath(seekReport, relative);
  check(Boolean(seekRecord), `browser seek report has no result for ${relative}`);
  if (seekRecord) {
    const serialized = JSON.stringify(seekRecord);
    check(seekRecord.status === "passed", `browser seek result did not pass for ${relative}`);
    check(hasNumericField(seekRecord, /seek|present|latency/i), `browser seek report lacks timing for ${relative}`);
    check(hasNumericField(seekRecord, /dropped|late/i), `browser seek report lacks dropped/late-frame evidence for ${relative}`);
    check(/"direction":"forward"/i.test(serialized), `browser seek report lacks a forward-seek sample for ${relative}`);
    check(/"direction":"reverse"/i.test(serialized), `browser seek report lacks a reverse-seek sample for ${relative}`);
    check(/quality/i.test(serialized), `browser seek report lacks visible-quality evidence for ${relative}`);
    check(/portal/i.test(serialized), `browser seek report lacks portal-integrity evidence for ${relative}`);
  }
}

if (await exists("review/field-unit-animatic.webm") && await exists("media/field-unit-animatic-vp9-g6.webm")) {
  check(
    (await sha256(packagePath("review/field-unit-animatic.webm"))) ===
      (await sha256(packagePath("media/field-unit-animatic-vp9-g6.webm"))),
    "review animatic must be a byte-identical copy of the VP9 g6 encode",
  );
}

for (const relative of expectedReviewFiles) {
  if (!(await exists(relative))) continue;
  await validateRecordedFile(recordForPath(reviewManifest, relative), relative, "review bundle manifest");
}

if (alignmentReport) {
  const serialized = JSON.stringify(alignmentReport);
  for (const requiredReference of [
    "renders/portal/portal-100.png",
    "renders/portal/first-dom-reference.png",
    "review/portal-dom-overlay.png",
  ]) {
    check(serialized.includes(requiredReference), `portal alignment report does not identify ${requiredReference}`);
  }
}

if (await exists("review/dom-match-metrics.json")) {
  const metrics = await readJson("review/dom-match-metrics.json");
  if (metrics) {
    const serialized = JSON.stringify(metrics);
    check(serialized.includes("portal-100.png"), "DOM-match metrics omit the final portal frame");
    check(serialized.includes("first-dom-reference.png"), "DOM-match metrics omit the first DOM reference frame");
    for (const record of collectObjects(metrics)) {
      for (const [key, value] of Object.entries(record)) {
        if (/ssim/i.test(key) && Number.isFinite(Number(value))) {
          check(Number(value) >= 0 && Number(value) <= 1, `invalid SSIM value in review/dom-match-metrics.json: ${value}`);
        }
      }
    }
  }
}

if (await exists("review/dom-match-metrics.json") && await exists("manifests/portal-alignment-report.json")) {
  check(
    (await sha256(packagePath("review/dom-match-metrics.json"))) ===
      (await sha256(packagePath("manifests/portal-alignment-report.json"))),
    "review DOM-match metrics must be a byte-identical copy of the portal alignment report",
  );
}

const actualReviewFiles = (await walk(packagePath("review"))).map((absolute) =>
  normalize(`review/${path.relative(packagePath("review"), absolute)}`),
);
for (const relative of actualReviewFiles) {
  check(expectedReviewFiles.includes(relative), `review directory contains an unexpected file: ${relative}`);
}

const rootReadme = await (async () => {
  try {
    return await readFile(packagePath("README.md"), "utf8");
  } catch {
    return "";
  }
})();
const reviewReadme = await (async () => {
  try {
    return await readFile(packagePath("review/README.md"), "utf8");
  } catch {
    return "";
  }
})();
const combinedReadme = `${rootReadme}\n${reviewReadme}`;
if (blendHash) check(combinedReadme.toLowerCase().includes(blendHash), "review documentation does not identify the Blender source SHA-256");
if (sourceValidation?.blender_version) {
  check(combinedReadme.includes(sourceValidation.blender_version), "review documentation does not identify the exact Blender version");
}
for (const [pattern, label] of [
  [/FFmpeg(?:\s*\/\s*ffprobe)?\s*[:|]?\s*9\.0\.1/i, "exact FFmpeg version"],
  [/provenance/i, "software provenance"],
  [/licen[cs]e/i, "software licenses"],
  [/BLENDER_EEVEE|Eevee|Cycles/i, "render engine"],
  [/samples?/i, "render sample setting"],
  [/1920\s*[x×]\s*1080/i, "animatic render dimensions"],
  [/192\s*(?:timeline\s*)?frames?|frames?\s*[:=]?\s*192/i, "192-frame timeline"],
  [/24\s*fps/i, "24fps timeline"],
  [/original artwork|artwork is original/i, "original-artwork statement"],
  [/no reference[- ]site binary (?:was )?used|reference[- ]site binary used:\s*false/i, "reference-binary independence statement"],
  [/review-bundle-manifest\.json/i, "review bundle manifest pointer"],
]) {
  check(pattern.test(combinedReadme), `review documentation is missing ${label}`);
}

let repositoryFiles = [];
try {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: projectRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
  repositoryFiles = output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalize);
} catch {
  repositoryFiles = (await walk(projectRoot, new Set([".git", "node_modules", "dist", ".astro"]))).map((absolute) =>
    normalize(path.relative(projectRoot, absolute)),
  );
  notes.push("Git file enumeration was unavailable; verifier used a filesystem fallback.");
}

const textExtensions = new Set([
  ".astro",
  ".css",
  ".html",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".svg",
  ".py",
  ".txt",
  ".xml",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
]);
const privatePathPattern = /(?:[a-z]:[\\/](?:users|documents and settings)[\\/][^\\/\s]+[\\/]|\/users\/[^/\s]+\/|\/home\/[^/\s]+\/|file:\/\/|onedrive[\\/]|\.codex[\\/])/i;
const publicTaxonomyPattern = /\bdefen[cs]e\b|\bdual[\s_-]?use\b/i;
const publicScanRoots = ["src/", "public/", "prototypes/", `${packageRelative}/source/`, `${packageRelative}/manifests/`, `${packageRelative}/review/`];

for (const relative of repositoryFiles) {
  const absolute = projectPath(relative);
  let metadata;
  try {
    metadata = await stat(absolute);
  } catch {
    continue;
  }
  if (!metadata.isFile()) continue;
  check(metadata.size < fiftyMiB, `${relative} is ${metadata.size} bytes and reaches the 50 MiB Git escalation boundary`);
  if (!textExtensions.has(path.extname(relative).toLowerCase())) continue;
  const content = await readFile(absolute, "utf8");
  check(!privatePathPattern.test(content), `private absolute path leaked in ${relative}`);
  if (publicScanRoots.some((prefix) => relative.startsWith(prefix))) {
    check(!publicTaxonomyPattern.test(content), `prohibited public taxonomy leaked in ${relative}`);
  }
}

let referenceHashes = new Set();
try {
  const referenceAudit = await readFile(projectPath("docs/planning/REFERENCE_AUDIT.md"), "utf8");
  referenceHashes = new Set([...referenceAudit.matchAll(/\b[a-f0-9]{64}\b/gi)].map((match) => match[0].toLowerCase()));
} catch {
  errors.push("reference audit is unavailable for third-party binary comparison");
}
check(referenceHashes.size > 0, "reference audit contains no private evidence hashes");
for (const absolute of await walk(packageRoot, new Set(["work", "__pycache__"]))) {
  const relative = normalize(path.relative(packageRoot, absolute));
  if (textExtensions.has(path.extname(relative).toLowerCase())) continue;
  const digest = await sha256(absolute);
  check(!referenceHashes.has(digest), `third-party reference binary copied as ${packageRelative}/${relative}`);
  check(!/kunal|rajelli|reference[-_ ]site/i.test(relative), `third-party reference name leaked in ${packageRelative}/${relative}`);
}

try {
  const pkg = JSON.parse(await readFile(projectPath("package.json"), "utf8"));
  const runtime = Object.keys(pkg.dependencies ?? {});
  const development = Object.keys(pkg.devDependencies ?? {});
  const allowedRuntime = new Set(["astro"]);
  const allowedDevelopment = new Set(["@astrojs/check", "typescript"]);
  for (const dependency of runtime) check(allowedRuntime.has(dependency), `unapproved runtime dependency: ${dependency}`);
  for (const dependency of development) check(allowedDevelopment.has(dependency), `unapproved development dependency: ${dependency}`);
  for (const section of ["optionalDependencies", "peerDependencies"]) {
    for (const dependency of Object.keys(pkg[section] ?? {})) errors.push(`unapproved ${section}: ${dependency}`);
  }
  for (const prohibited of ["react", "react-dom", "vinext", "three", "@react-three/fiber", "gsap"]) {
    check(!runtime.includes(prohibited) && !development.includes(prohibited), `prohibited site dependency: ${prohibited}`);
  }
  for (const lifecycle of ["dev", "build", "preview", "start"]) {
    if (!pkg.scripts?.[lifecycle]) continue;
    check(!/blender|ffmpeg|ffprobe/i.test(pkg.scripts[lifecycle]), `${lifecycle} must not invoke offline production tools`);
  }
} catch (error) {
  errors.push(`unable to validate package dependencies: ${error.message}`);
}

if (notes.length) {
  console.log("Phase 0 3D repair verification notes:");
  for (const note of notes) console.log(`- ${note}`);
}

if (errors.length) {
  console.error(`Phase 0 3D repair verification failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Verified Phase 0 3D repair: ${renderDimensions.size} canonical renders, ${reviewImages.size} review images, ${mediaFiles.length} real-content encodes, Blender source/manifests, privacy, taxonomy, size, and dependency boundaries.`,
  );
}
